// ════════════════════════════════════════════════════════════════════════════
// ÜRETİM EKRANI — yarı mamüllerin rotaya göre hangi istasyonda olduğunu
// takip eder, üretimdeki aksaklık/duruş kayıtları açılır (istasyon + sorumlu
// departman + alarm seviyesi ile).
// ════════════════════════════════════════════════════════════════════════════
PageModules.uretim_ekrani = (() => {
  let activeTab = 'istasyon';

  // Bölüm bazlı duruş sayısı bir eşiği aştığında "alarm seviyesinde" sayılır.
  const ALARM_ESIGI = 3;

  async function render(main) {
    const [siparisler, uretimIstasyonTakip, duruslar, rotalar, yarimamuller, isemirleri, receteler, urunler] = await Promise.all([
      Store.siparisler.all(), Store.uretimIstasyonTakip.all(), Store.duruslar.all(), Store.rotalar.all(), Store.yarimamuller.all(),
      Store.isemirleri.all(), Store.receteler.all(), Store.urunler.all()
    ]);
    const uretimdekiSiparisler = siparisler.filter(s => s.durum === 'onaylandi' && (s.uretimDurumu === 'uretimde' || !s.uretimDurumu));
    // İş emirleri de istasyon takibine düşer (tamamlananlar hariç) —
    // "İş Emrine Dönüştür" ile açılan emirlerin rotaları burada izlenir.
    const aktifIsEmirleri = isemirleri.filter(ie => ie.durum !== 'tamamlandi');

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Üretim Ekranı</div><div class="page-sub">Yarı mamüllerin istasyon takibi ve üretim aksaklık (duruş) kayıtları</div></div>
        <div class="page-acts"><button class="btn btn-amber" id="ue-duruş-ekle">⚠ Duruş/Aksaklık Bildir</button></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'istasyon' ? 'active' : ''}" data-tab="istasyon">İstasyon Takibi</div>
        <div class="tab ${activeTab === 'duruslar' ? 'active' : ''}" data-tab="duruslar">Duruş Kayıtları</div>
        <div class="tab ${activeTab === 'alarm' ? 'active' : ''}" data-tab="alarm">Departman Alarm Özeti</div>
      </div>
      <div id="ue-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });
    document.getElementById('ue-duruş-ekle').onclick = () => openDurusForm(uretimdekiSiparisler, rotalar, yarimamuller, () => render(main));

    const content = document.getElementById('ue-tab-content');
    if (activeTab === 'istasyon') { await renderIstasyonTabEslesik(content, main, render); }
    else if (activeTab === 'duruslar') content.innerHTML = renderDuruslarTab(duruslar);
    else content.innerHTML = renderAlarmTab(duruslar);
  }

  // ── İSTASYON TAKİBİ ─────────────────────────────────────────────────────
  // İki kaynaktan beslenir:
  //   1) İŞ EMİRLERİ ("İş Emrine Dönüştür" ile açılanlar dahil): emrin üretim
  //      listesindeki yarı mamüller, KARTLARINDA SEÇİLİ ROTALARIYLA izlenir.
  //   2) Üretimdeki SİPARİŞLER: doğrudan yarı mamül kalemleri + ürün
  //      kalemlerinin REÇETESİNDEN patlatılan yarı mamüller.
  // Ortak satır çizimi tek fonksiyonda toplanır; takip anahtarı iş emri için
  // isemriId, sipariş için siparisId'dir.
  // ── İSTASYON DURUMU (EŞLENİK) ────────────────────────────────────────────
  // Bu sekme, Hat & İstasyon Takibi ve Hat Operatör Terminali ile AYNI veriyi
  // (istasyonIsleri) okur — üç ekran eşlenik çalışır: operatör terminalde
  // ilerlettiği anda burada da görünür. İlerletme işlemleri Hat & İstasyon
  // Takibi / Operatör Terminali'nden yapılır; buradan tek tıkla ilgili hatta
  // gidilir. Biten işler "Eski İşlemler" bölümünde ayrı gösterilir.
  async function renderIstasyonTabEslesik(content, main, render) {
    if (PageModules.hat_takip && PageModules.hat_takip.isKartlariniSenkronize) {
      await PageModules.hat_takip.isKartlariniSenkronize();
    }
    const isler = await Store.istasyonIsleri.all();
    const aktifler = isler.filter(x => x.durum === 'aktif');
    const bitenler = isler.filter(x => x.durum === 'tamamlandi');

    const kartSatiri = (x) => {
      const kisiler = [...new Set([...(x.kaliteOnaylari||[]), ...(x.islemOnaylari||[]), ...(x.sevkler||[])].map(o => o.kisi).filter(Boolean))].join(', ') || '—';
      return `<tr>
        <td><span class="pill ${x.kaynakTip === 'ie' ? 'pill-purple' : 'pill-blue'}" style="font-size:9px">${x.kaynakTip === 'ie' ? 'İş Emri' : 'Sipariş'}</span> <b class="mono" style="font-size:10.5px">${App.escapeHtml(x.kaynakKod)}</b></td>
        <td><b class="mono" style="font-size:10.5px">${App.escapeHtml(x.ymKod)}</b><br><span class="muted" style="font-size:9.5px">${App.escapeHtml(x.ymAd)}</span></td>
        <td style="font-size:10.5px">${App.escapeHtml(x.hat)}</td>
        <td class="mono" style="font-size:10.5px">${App.escapeHtml(x.istasyonKod)} <span class="muted">${App.escapeHtml(x.istasyonTanim || '')}</span></td>
        <td class="r" style="font-size:10.5px">${x.gelenAdet - (x.fireAdet||0)} / <span style="color:var(--blue-text)">${x.kaliteOnayliAdet}</span> / <span style="color:var(--amber-text)">${x.islemTamamAdet}</span> / <span style="color:var(--green-text)">${x.sevkEdilenAdet}</span>${x.fireAdet ? ` <span class="pill pill-red" style="font-size:8.5px">F:${x.fireAdet}</span>` : ''}</td>
        <td style="font-size:10px">${App.escapeHtml(kisiler)}</td>
        <td>${x.durum === 'aktif'
          ? `<button class="btn btn-sm btn-ghost ue-hatta-git" data-hat="${App.escapeHtml(x.hat)}">🏭 Hatta Aç</button>`
          : `<span class="pill pill-green" style="font-size:9px">Bitti${x.bitisZamani ? ' · ' + x.bitisZamani.slice(0, 10) : ''}</span>`}</td>
      </tr>`;
    };
    const tablo = (liste) => `<table class="dtable" style="font-size:11px">
      <tr><th>Kaynak</th><th>Yarı Mamül</th><th>Hat</th><th>İstasyon</th><th class="r">Gelen/Kalite/İşlem/Sevk</th><th>İşleyen(ler)</th><th></th></tr>
      ${liste.map(kartSatiri).join('')}</table>`;

    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">⚡ Devam Eden İşlemler — İstasyon Durumu (Canlı)</div>
      <span class="pill pill-amber" style="font-size:10px">${aktifler.length} aktif</span></div>
      <div class="fhint" style="margin-bottom:8px">Bu tablo Hat & İstasyon Takibi ve Hat Operatör Terminali ile <b>eşleniktir</b> — operatörün ilerlettiği her adım burada anlık görünür. İlerletme ilgili hattın ekranından yapılır.</div>
      ${aktifler.length ? tablo(aktifler.sort((a, b) => a.hat.localeCompare(b.hat, 'tr') || a.stepIndex - b.stepIndex)) : '<div class="empty-state" style="padding:16px"><div class="edesc">Devam eden istasyon işi yok.</div></div>'}
    </div>`;

    html += App.akordeonHtml([{
      baslik: 'Eski İşlemler — Biten İşler', ikon: '🗂',
      rozet: bitenler.length ? bitenler.length + ' kayıt' : '',
      icerikHtml: '<div style="margin-top:12px">' + (bitenler.length
        ? tablo(bitenler.sort((a, b) => (b.bitisZamani || '').localeCompare(a.bitisZamani || '')))
        : '<div class="empty-state" style="padding:14px"><div class="edesc">Henüz biten iş yok.</div></div>') + '</div>'
    }]);

    content.innerHTML = html;
    App.akordeonBagla(content);
    content.querySelectorAll('.ue-hatta-git').forEach(b => b.onclick = () => App.goTo('hat_takip', { hat: b.dataset.hat }));
  }



  function renderDuruslarTab(duruslar) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Tüm Duruş / Aksaklık Kayıtları</div></div>`;
    if (!duruslar.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz duruş kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>İstasyon</th><th>Sorumlu Departman</th><th>Açıklama</th><th class="r">Süre (dk)</th></tr>`;
      [...duruslar].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(d => {
        html += `<tr><td style="font-size:11px">${d.tarih}</td><td>${App.escapeHtml(d.istasyonAdi || '—')}</td>
          <td><span class="pill pill-amber">${App.escapeHtml(bolumLabel(d.sorumluBolum))}</span></td>
          <td style="font-size:11.5px">${App.escapeHtml(d.aciklama)}</td>
          <td class="r">${d.sureMin || '—'}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function bolumLabel(bolumId) {
    const b = App.BOLUMLER.find(x => x.id === bolumId);
    return b ? b.label : bolumId;
  }

  function renderAlarmTab(duruslar) {
    const bolumeGoreSayim = {};
    duruslar.forEach(d => { bolumeGoreSayim[d.sorumluBolum] = (bolumeGoreSayim[d.sorumluBolum] || 0) + 1; });

    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Departman Bazlı Duruş Sayısı (Alarm Eşiği: ${ALARM_ESIGI})</div></div>
      <div class="grid grid-4">`;
    Object.entries(bolumeGoreSayim).forEach(([bolumId, sayi]) => {
      const alarmda = sayi >= ALARM_ESIGI;
      html += `<div class="kpi" style="${alarmda ? 'background:var(--red-bg);border-color:var(--red-light)' : ''}">
        <div class="kpi-lbl">${App.escapeHtml(bolumLabel(bolumId))}</div>
        <div class="kpi-val ${alarmda ? 'red' : 'blue'}">${sayi}${alarmda ? ' ⚠' : ''}</div>
      </div>`;
    });
    if (!Object.keys(bolumeGoreSayim).length) html += `<div class="empty-state" style="padding:18px 10px;grid-column:1/-1"><div class="edesc">Henüz duruş kaydı yok.</div></div>`;
    html += `</div></div>`;
    return html;
  }

  function openDurusForm(siparisler, rotalar, yarimamuller, onSaved) {
    // T4: duruş kaydının istasyon referansı zayıftı — yalnızca serbest
    // metin bir "kod — tanım" etiketi (istasyonAdi) tutuluyordu, hangi HATTA
    // ait olduğu (aynı kod farklı rotalarda tekrar edebilir) veya hangi
    // rotanın adımı olduğu güvenilir biçimde eşlenemiyordu. Ayrıca tarih
    // her zaman "şimdi"ye sabitti — gün sonunda/ertesi gün girilen bir
    // duruş yanlış tarihe düşüyordu. Artık seçim index bazlı yapılıp
    // istasyonKodu/hat/rotaAdi da yapılandırılmış biçimde saklanıyor,
    // tarih de kullanıcı tarafından seçilebiliyor (varsayılan: bugün).
    const tumIstasyonlar = [];
    rotalar.forEach(r => r.steps.forEach(s => tumIstasyonlar.push({ rotaAdi: r.ad, kod: s.kod, tanim: s.tanim, hat: s.hat || null })));

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">İstasyon</label>
        <select class="fselect" id="df-istasyon">
          <option value="">— Seçilmedi —</option>
          ${tumIstasyonlar.map((i, idx) => `<option value="${idx}">${App.escapeHtml(i.rotaAdi)}: ${App.escapeHtml(i.kod)} — ${App.escapeHtml(i.tanim)}</option>`).join('')}
        </select>
      </div>
      <div class="fgroup"><label class="flbl">Tarih</label><input class="finput" id="df-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="fgroup"><label class="flbl">Sorumlu Departman</label>
        <select class="fselect" id="df-bolum">
          ${App.BOLUMLER.map(b => `<option value="${b.id}">${App.escapeHtml(b.label)}</option>`).join('')}
        </select>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="df-aciklama" placeholder="Aksaklığın ne olduğunu açıklayın"></textarea></div>
      <div class="fgroup"><label class="flbl">Tahmini Duruş Süresi (dakika)</label><input class="finput" id="df-sure" type="number" value="0"></div>
    `;
    const footer = `<button class="btn" id="df-cancel">Vazgeç</button><button class="btn btn-amber" id="df-confirm">Kaydet</button>`;
    App.openModal({ title: 'Duruş / Aksaklık Bildir', body, footer, wide: true });
    document.getElementById('df-cancel').onclick = App.closeModal;
    document.getElementById('df-confirm').onclick = async () => {
      const aciklama = document.getElementById('df-aciklama').value.trim();
      if (!aciklama) { App.toast('Açıklama zorunlu', 'err'); return; }
      const secilenIdx = document.getElementById('df-istasyon').value;
      const secilen = secilenIdx !== '' ? tumIstasyonlar[parseInt(secilenIdx, 10)] : null;
      const kayit = {
        id: App.uid('DRS'),
        istasyonAdi: secilen ? (secilen.kod + ' — ' + secilen.tanim) : '',
        istasyonKodu: secilen ? secilen.kod : null,
        hat: secilen ? secilen.hat : null,
        rotaAdi: secilen ? secilen.rotaAdi : null,
        sorumluBolum: document.getElementById('df-bolum').value,
        aciklama, sureMin: parseInt(document.getElementById('df-sure').value) || 0,
        tarih: document.getElementById('df-tarih').value || new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.duruslar.upsert(kayit));
      App.toast('Duruş kaydı oluşturuldu', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();
