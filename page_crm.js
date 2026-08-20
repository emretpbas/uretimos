// ════════════════════════════════════════════════════════════════════════════
// CRM — SATIŞ FIRSATLARI VE MÜŞTERİ İLİŞKİLERİ
// ────────────────────────────────────────────────────────────────────────────
// Huni panosu (aşamalara göre), satış tahmini, aktivite kaydı ve ihmal edilen
// fırsat uyarısı. Kazanılan fırsat mevcut teklif/sipariş akışına bağlanır.
// ════════════════════════════════════════════════════════════════════════════
PageModules.crm = (() => {

  let gorunum = 'huni';   // huni | liste | tahmin

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'satis', 'teklif_siparis', 'cari', 'pazarlama'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">CRM ekranı Satış, Pazarlama, Cari ve Yönetim rollerine açıktır.</div></div></div>`;
      return;
    }

    const [firsatlar, aktiviteler, musteriler] = await Promise.all([
      Store.firsatlar.all(), Store.crmAktiviteler.all(), Store.musteriler.all()
    ]);

    const tahmin = CRM.tahminHesapla(firsatlar);
    const kazanma = CRM.kazanmaOrani(firsatlar);
    const ihmal = CRM.ihmalEdilenler(firsatlar, aktiviteler, 14);
    const huni = CRM.huniDagilimi(firsatlar);

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">🎯 CRM — Satış Fırsatları</div>
          <div class="page-sub">Aday → fırsat → teklif → sipariş zinciri ve satış tahmini</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="crm-yeni">+ Yeni Fırsat</button></div>
      </div>

      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">AÇIK FIRSAT</div><div class="kpi-value">${tahmin.adet}</div></div>
        <div class="kpi-card"><div class="kpi-label">BORU HATTI (toplam)</div><div class="kpi-value">${App.fmtTL(tahmin.toplam)}</div></div>
        <div class="kpi-card" title="Her fırsatın tutarı × aşama olasılığı">
          <div class="kpi-label">AĞIRLIKLI TAHMİN</div><div class="kpi-value" style="color:var(--blue)">${App.fmtTL(tahmin.agirlikli)}</div></div>
        <div class="kpi-card"><div class="kpi-label">KAZANMA ORANI</div>
          <div class="kpi-value">${kazanma.oran != null ? '%' + kazanma.oran.toFixed(0) : '—'}</div>
          ${!kazanma.guvenilir && kazanma.kapali > 0 ? '<div class="muted" style="font-size:9.5px">az veri — güvenilir değil</div>' : ''}</div>
      </div>

      ${ihmal.length ? `<div class="card" style="margin-bottom:12px;background:var(--amber-bg);border:1px solid var(--amber-text)">
        <div style="padding:6px;font-size:12px;color:var(--amber-text)">
          <b>⚠ ${ihmal.length} fırsatta 14 günden uzun süredir hareket yok</b> — satışta en sık kayıp sebebi
          fırsatın unutulmasıdır.<br>
          ${ihmal.slice(0, 5).map(f => `• <b>${App.escapeHtml(f.baslik)}</b> (${App.escapeHtml(f.musteriAdi)}) — ${f.sessizGun} gün`).join('<br>')}
          ${ihmal.length > 5 ? `<br>… ve ${ihmal.length - 5} fırsat daha` : ''}
        </div></div>` : ''}

      <div class="tabs" style="margin-bottom:12px">
        <div class="tab ${gorunum === 'huni' ? 'active' : ''}" data-g="huni">Huni Panosu</div>
        <div class="tab ${gorunum === 'liste' ? 'active' : ''}" data-g="liste">Fırsat Listesi</div>
        <div class="tab ${gorunum === 'tahmin' ? 'active' : ''}" data-g="tahmin">Aylık Tahmin</div>
      </div>
      <div id="crm-icerik"></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { gorunum = t.dataset.g; render(main); });
    document.getElementById('crm-yeni').onclick = () => yeniFirsatFormu(main, musteriler);

    const el = document.getElementById('crm-icerik');
    if (gorunum === 'huni') huniCiz(el, huni, firsatlar, main);
    else if (gorunum === 'liste') listeCiz(el, firsatlar, aktiviteler, main);
    else tahminCiz(el, firsatlar);
  }

  // ── HUNİ PANOSU ──────────────────────────────────────────────────────────
  function huniCiz(el, huni, firsatlar, main) {
    const acikAsamalar = huni.filter(h => !['kazanildi', 'kaybedildi'].includes(h.id));
    const enBuyuk = Math.max(1, ...acikAsamalar.map(h => h.tutar));
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Satış Hunisi</div></div>
      <div class="fhint" style="margin-bottom:10px">Aşamaya tıklayarak fırsatları görebilirsiniz. Yüzdeler kazanma olasılığıdır.</div>
      ${acikAsamalar.map(h => `
        <div class="crm-asama" data-a="${h.id}" style="cursor:pointer;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px">
            <b>${h.ad} <span class="muted" style="font-weight:400">%${h.olasilik} olasılık</span></b>
            <span><b>${h.adet}</b> fırsat · ${App.fmtTL(h.tutar)}</span>
          </div>
          <div style="background:var(--surface2);border-radius:6px;height:26px;overflow:hidden">
            <div style="width:${Math.max(2, h.tutar / enBuyuk * 100)}%;height:100%;background:${h.renk};opacity:.85"></div>
          </div>
        </div>`).join('')}
      <div style="display:flex;gap:12px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border);font-size:12.5px">
        <div>✓ Kazanılan: <b style="color:var(--green-text)">${huni.find(h => h.id === 'kazanildi').adet}</b>
          (${App.fmtTL(huni.find(h => h.id === 'kazanildi').tutar)})</div>
        <div>✕ Kaybedilen: <b style="color:var(--red-text)">${huni.find(h => h.id === 'kaybedildi').adet}</b>
          (${App.fmtTL(huni.find(h => h.id === 'kaybedildi').tutar)})</div>
      </div>
    </div>
    <div id="crm-asama-detay" style="margin-top:12px"></div>`;

    el.querySelectorAll('.crm-asama').forEach(d => d.onclick = () => {
      const liste = firsatlar.filter(f => f.asama === d.dataset.a);
      const hedef = document.getElementById('crm-asama-detay');
      hedef.innerHTML = liste.length ? `<div class="card">
        <div class="card-hdr"><div class="card-title">${CRM.asamaBul(d.dataset.a).ad} (${liste.length})</div></div>
        ${liste.map(f => firsatSatiri(f)).join('')}</div>`
        : '<div class="card"><div class="muted" style="padding:12px;font-size:12px">Bu aşamada fırsat yok.</div></div>';
      hedef.querySelectorAll('.crm-detay').forEach(b => b.onclick = () => firsatDetay(main, b.dataset.id));
    });
  }

  const firsatSatiri = (f) => `
    <div style="border-bottom:1px solid var(--border);padding:8px 4px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:200px">
        <b style="font-size:12.5px">${App.escapeHtml(f.baslik)}</b>
        <div class="muted" style="font-size:11px">${App.escapeHtml(f.musteriAdi || '')}
          ${f.temsilci ? ' · ' + App.escapeHtml(f.temsilci) : ''}
          ${f.beklenenKapanis ? ' · beklenen: ' + f.beklenenKapanis : ''}
          ${f.kaynak ? ' · kaynak: ' + App.escapeHtml(f.kaynak) : ''}</div>
      </div>
      <div style="text-align:right">
        <b style="font-size:12.5px">${App.fmtTL(f.tutar)}</b>
        <div><button class="btn btn-sm crm-detay" data-id="${f.id}">Detay</button></div>
      </div>
    </div>`;

  // ── LİSTE ────────────────────────────────────────────────────────────────
  function listeCiz(el, firsatlar, aktiviteler, main) {
    const sirali = [...firsatlar].sort((a, b) =>
      (b.olusturmaTarihi || '').localeCompare(a.olusturmaTarihi || ''));
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Tüm Fırsatlar (${sirali.length})</div></div>
      ${sirali.length ? `<div class="tbl-wrap"><table class="dtable">
        <tr><th>Kod</th><th>Fırsat</th><th>Müşteri</th><th>Aşama</th><th class="r">Tutar</th>
            <th>Temsilci</th><th>Beklenen</th><th class="r">Aktivite</th><th></th></tr>
        ${sirali.map(f => {
          const a = CRM.asamaBul(f.asama);
          const aktSayi = aktiviteler.filter(x => x.firsatId === f.id).length;
          return `<tr>
            <td class="mono" style="font-size:10.5px">${App.escapeHtml(f.kod || '')}</td>
            <td>${App.escapeHtml(f.baslik)}</td>
            <td style="font-size:11.5px">${App.escapeHtml(f.musteriAdi || '')}</td>
            <td><span class="pill" style="background:${a.renk}22;color:${a.renk};font-size:9.5px">${a.ad}</span></td>
            <td class="r">${App.fmtTL(f.tutar)}</td>
            <td style="font-size:11px">${App.escapeHtml(f.temsilci || '')}</td>
            <td style="font-size:11px">${f.beklenenKapanis || '—'}</td>
            <td class="r" style="font-size:11px">${aktSayi}</td>
            <td><button class="btn btn-sm crm-detay" data-id="${f.id}">Detay</button></td>
          </tr>`;
        }).join('')}
      </table></div>` : '<div class="muted" style="padding:12px;font-size:12px">Henüz fırsat yok. "+ Yeni Fırsat" ile başlayın.</div>'}
    </div>`;
    el.querySelectorAll('.crm-detay').forEach(b => b.onclick = () => firsatDetay(main, b.dataset.id));
  }

  // ── AYLIK TAHMİN ─────────────────────────────────────────────────────────
  function tahminCiz(el, firsatlar) {
    const aylar = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(); d.setMonth(d.getMonth() + i);
      aylar.push(d.toISOString().slice(0, 7));
    }
    const adlar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const donemAd = (d) => adlar[+d.split('-')[1] - 1] + ' ' + d.split('-')[0];
    const satirlar = aylar.map(ay => ({ ay, ...CRM.tahminHesapla(firsatlar, ay) }));
    const toplamAgirlikli = satirlar.reduce((a, s) => a + s.agirlikli, 0);

    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">6 Aylık Satış Tahmini</div></div>
      <div class="fhint" style="margin-bottom:10px">
        Ağırlıklı tahmin = fırsat tutarı × aşama kazanma olasılığı. Üretim planlama
        için erken sinyaldir: sipariş gelmeden kapasite ayırmanızı sağlar.<br>
        <b>Uyarı:</b> Bu bir tahmindir, taahhüt değil. Aşama olasılıkları sektör
        varsayımıdır; kendi kazanma oranınız oluştukça kalibre edilmelidir.
      </div>
      <table class="dtable">
        <tr><th>Dönem</th><th class="r">Açık Fırsat</th><th class="r">Boru Hattı</th><th class="r">Ağırlıklı Tahmin</th></tr>
        ${satirlar.map(s => `<tr>
          <td><b>${donemAd(s.ay)}</b></td>
          <td class="r">${s.adet}</td>
          <td class="r">${App.fmtTL(s.toplam)}</td>
          <td class="r"><b style="color:var(--blue)">${App.fmtTL(s.agirlikli)}</b></td>
        </tr>`).join('')}
        <tr style="background:var(--surface2);font-weight:600">
          <td>6 AYLIK TOPLAM</td><td class="r"></td><td class="r"></td>
          <td class="r"><b>${App.fmtTL(toplamAgirlikli)}</b></td></tr>
      </table>
      <div class="muted" style="font-size:11px;margin-top:8px">
        Beklenen kapanış tarihi girilmemiş fırsatlar bu tabloda görünmez.
      </div>
    </div>`;
  }

  // ── YENİ FIRSAT ──────────────────────────────────────────────────────────
  function yeniFirsatFormu(main, musteriler) {
    App.openModal({
      title: '+ Yeni Satış Fırsatı',
      body: `
        <div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Fırsat Başlığı *</label>
            <input class="finput" id="fr-baslik" placeholder="örn. Otel projesi — 120 oda mobilyası"></div>
          <div class="fgroup"><label class="flbl">Tahmini Tutar (₺)</label>
            <input class="finput" id="fr-tutar" type="number" min="0" step="1000"></div>
        </div>
        <div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Müşteri *</label>
            <input class="finput" id="fr-musteri" list="fr-mlist" placeholder="Müşteri adı yazın veya seçin">
            <datalist id="fr-mlist">${musteriler.slice(0, 500).map(m =>
              `<option value="${App.escapeHtml(m.unvan || m.ad || '')}"></option>`).join('')}</datalist></div>
          <div class="fgroup"><label class="flbl">Kaynak</label>
            <select class="fselect" id="fr-kaynak">
              ${CRM.KAYNAKLAR.map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Beklenen Kapanış</label>
            <input class="finput" id="fr-kapanis" type="date"></div>
          <div class="fgroup"><label class="flbl">Temsilci</label>
            <input class="finput" id="fr-temsilci" value="${App.escapeHtml(App.aktifRol())}"></div>
          <div class="fgroup"><label class="flbl">Proje işi mi?</label>
            <select class="fselect" id="fr-proje"><option value="">Hayır — standart sipariş</option>
              <option value="1">Evet — proje (aşamalı/hakedişli)</option></select></div>
        </div>
        <div class="fgroup"><label class="flbl">Açıklama</label>
          <textarea class="ftextarea" id="fr-aciklama" rows="2" placeholder="İhtiyaç, karar süreci, rakipler…"></textarea></div>`,
      footer: `<button class="btn" id="fr-vaz">Vazgeç</button><button class="btn btn-green" id="fr-kaydet">Fırsatı Oluştur</button>`,
      wide: true
    });
    document.getElementById('fr-vaz').onclick = App.closeModal;
    document.getElementById('fr-kaydet').onclick = async () => {
      try {
        const musteriAdi = document.getElementById('fr-musteri').value.trim();
        const m = musteriler.find(x => (x.unvan || x.ad || '') === musteriAdi);
        const r = await CRM.firsatOlustur({
          musteriId: m ? m.id : null, musteriAdi,
          baslik: document.getElementById('fr-baslik').value,
          tutar: document.getElementById('fr-tutar').value,
          kaynak: document.getElementById('fr-kaynak').value,
          beklenenKapanis: document.getElementById('fr-kapanis').value,
          temsilci: document.getElementById('fr-temsilci').value.trim(),
          aciklama: document.getElementById('fr-aciklama').value,
          projeMi: !!document.getElementById('fr-proje').value
        });
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal();
        App.toast('Fırsat oluşturuldu: ' + r.firsat.kod, 'ok');
        render(main);
      } catch (e) { App.toast('Oluşturulamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  // ── FIRSAT DETAYI ────────────────────────────────────────────────────────
  async function firsatDetay(main, id) {
    const [firsatlar, aktiviteler] = await Promise.all([
      Store.firsatlar.all(), Store.crmAktiviteler.all()
    ]);
    const f = firsatlar.find(x => x.id === id);
    if (!f) { App.toast('Fırsat bulunamadı.', 'err'); return; }
    const akt = aktiviteler.filter(x => x.firsatId === id)
      .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''));
    const a = CRM.asamaBul(f.asama);
    const acik = CRM.acikMi(f);

    App.openModal({
      title: App.escapeHtml(f.baslik),
      sub: `${App.escapeHtml(f.musteriAdi || '')} · ${App.fmtTL(f.tutar)} · ${f.kod || ''}`,
      body: `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
          <span class="pill" style="background:${a.renk}22;color:${a.renk}">${a.ad}</span>
          ${f.projeMi ? '<span class="pill pill-blue">PROJE İŞİ</span>' : ''}
          ${f.temsilci ? `<span class="muted" style="font-size:11.5px">Temsilci: ${App.escapeHtml(f.temsilci)}</span>` : ''}
        </div>
        ${f.aciklama ? `<div style="font-size:12px;margin-bottom:10px">${App.escapeHtml(f.aciklama)}</div>` : ''}

        ${f.asama === 'kazanildi' ? `<div style="padding:10px;background:var(--green-bg);border-radius:8px;margin-bottom:10px">
          <b style="font-size:12.5px;color:var(--green-text)">✓ Fırsat kazanıldı — sıradaki adım</b>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            ${f.projeId
              ? `<span class="pill pill-green">Proje açıldı</span>
                 <button class="btn btn-sm" id="fd-proje-git">Projeyi Aç →</button>`
              : `<button class="btn btn-sm btn-blue" id="fd-projeye">🏗 Projeye Dönüştür</button>`}
            ${f.teklifKod ? `<span class="pill pill-blue">Teklif: ${App.escapeHtml(f.teklifKod)}</span>` : ''}
          </div>
          <div class="muted" style="font-size:11px;margin-top:5px">
            Otel/toplu konut gibi aşamalı ve hakedişli işler için <b>proje</b> açın;
            standart siparişler doğrudan teklif/sipariş akışından ilerler.
          </div>
        </div>` : ''}

        ${acik && !f.teklifId ? `<div style="margin-bottom:10px">
          <button class="btn btn-sm" id="fd-teklife">📄 Teklif Hazırla</button>
          <span class="muted" style="font-size:11px;margin-left:6px">Teklif ekranına müşteri ve fırsat bilgisiyle geçer</span>
        </div>` : ''}

        ${acik ? `<div class="fgroup"><label class="flbl">Aşamayı Değiştir</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${CRM.ASAMALAR.filter(x => x.id !== f.asama).map(x =>
              `<button class="btn btn-sm fd-asama" data-a="${x.id}"
                style="border-color:${x.renk};color:${x.renk}">${x.ad}</button>`).join('')}
          </div></div>` : `<div class="fhint">Bu fırsat kapanmış (${a.ad}). Yeniden görüşülecekse yeni fırsat açın.
            ${f.kayipSebebi ? '<br><b>Kayıp sebebi:</b> ' + App.escapeHtml(f.kayipSebebi) : ''}</div>`}

        <div style="border-top:1px solid var(--border);margin:12px 0 8px;padding-top:10px">
          <b style="font-size:12.5px">Aktivite Ekle</b>
          <div class="frow" style="margin-top:6px">
            <div class="fgroup"><label class="flbl">Tip</label>
              <select class="fselect" id="fd-tip">${CRM.AKTIVITE_TIPLERI.map(t =>
                `<option value="${t.id}">${t.ad}</option>`).join('')}</select></div>
            <div class="fgroup" style="flex:2"><label class="flbl">Özet *</label>
              <input class="finput" id="fd-ozet" placeholder="Ne konuşuldu?"></div>
          </div>
          <div class="frow">
            <div class="fgroup" style="flex:2"><label class="flbl">Sonraki Adım</label>
              <input class="finput" id="fd-sonraki" placeholder="örn. Revize teklif gönderilecek"></div>
            <div class="fgroup"><label class="flbl">Ne Zaman</label>
              <input class="finput" id="fd-sonraki-tarih" type="date"></div>
          </div>
          <button class="btn btn-sm btn-blue" id="fd-akt-ekle">Aktivite Kaydet</button>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:10px">
          <b style="font-size:12.5px">Geçmiş (${akt.length})</b>
          ${akt.length ? akt.slice(0, 15).map(x => {
            const tip = CRM.AKTIVITE_TIPLERI.find(t => t.id === x.tip);
            return `<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--border)">
              ${tip ? tip.ad : x.tip} — ${App.escapeHtml(x.ozet)}
              <div class="muted" style="font-size:10px">${(x.tarih || '').slice(0, 16).replace('T', ' ')}
                ${x.kim ? ' · ' + App.escapeHtml(x.kim) : ''}
                ${x.sonrakiAdim ? ' · sonraki: ' + App.escapeHtml(x.sonrakiAdim) + (x.sonrakiTarih ? ' (' + x.sonrakiTarih + ')' : '') : ''}</div>
            </div>`;
          }).join('') : '<div class="muted" style="font-size:11.5px;padding:6px 0">Henüz aktivite yok.</div>'}
        </div>`,
      footer: `<button class="btn" id="fd-kapat">Kapat</button>`,
      wide: true
    });

    document.getElementById('fd-kapat').onclick = App.closeModal;

    const projeBtn = document.getElementById('fd-projeye');
    if (projeBtn) projeBtn.onclick = () => {
      App.openModal({
        title: '🏗 Projeye Dönüştür', sub: App.escapeHtml(f.baslik),
        body: `<div class="fhint" style="margin-bottom:10px">
            Fırsat bilgileri projeye aktarılacak: müşteri, başlık ve
            <b>${App.fmtTL(f.tutar)}</b> sözleşme bedeli. Varsayılan aşamalar oluşturulur.
          </div>
          <div class="frow">
            <div class="fgroup"><label class="flbl">Başlangıç</label><input class="finput" id="pd-bas" type="date"></div>
            <div class="fgroup"><label class="flbl">Bitiş (termin)</label><input class="finput" id="pd-bit" type="date"
              value="${f.beklenenKapanis || ''}"></div>
          </div>`,
        footer: `<button class="btn" id="pd-vaz">Vazgeç</button><button class="btn btn-green" id="pd-olustur">Projeyi Oluştur</button>`
      });
      document.getElementById('pd-vaz').onclick = () => { App.closeModal(); firsatDetay(main, id); };
      document.getElementById('pd-olustur').onclick = async () => {
        try {
          const r = await CRM.projeyeDonustur(id, {
            baslangic: document.getElementById('pd-bas').value,
            bitis: document.getElementById('pd-bit').value
          });
          if (!r.ok) { App.toast(r.hata, 'err'); return; }
          App.closeModal();
          App.toast('Proje oluşturuldu: ' + r.proje.kod, 'ok');
          App.goTo('proje');
        } catch (e) { App.toast('Dönüştürülemedi: ' + (e && e.message ? e.message : e), 'err'); }
      };
    };

    const projeGit = document.getElementById('fd-proje-git');
    if (projeGit) projeGit.onclick = () => { App.closeModal(); App.goTo('proje'); };

    const teklifBtn = document.getElementById('fd-teklife');
    if (teklifBtn) teklifBtn.onclick = async () => {
      try {
        const r = await CRM.teklifeHazirla(id);
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        // Taslağı geçici olarak sakla; teklif ekranı okuyup ön-doldurur
        try { sessionStorage.setItem('crm_teklif_taslak', JSON.stringify(r.taslak)); } catch (e) { }
        App.closeModal();
        App.toast('Teklif ekranına geçiliyor — müşteri bilgisi taşındı.', 'ok');
        App.goTo('teklif');
      } catch (e) { App.toast('Hazırlanamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
    document.getElementById('fd-akt-ekle').onclick = async () => {
      try {
        const r = await CRM.aktiviteEkle({
          firsatId: id, tip: document.getElementById('fd-tip').value,
          ozet: document.getElementById('fd-ozet').value,
          sonrakiAdim: document.getElementById('fd-sonraki').value,
          sonrakiTarih: document.getElementById('fd-sonraki-tarih').value
        });
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal();
        App.toast('Aktivite kaydedildi.', 'ok');
        firsatDetay(main, id);
      } catch (e) { App.toast('Kaydedilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    };
    document.querySelectorAll('.fd-asama').forEach(b => b.onclick = async () => {
      try {
        const hedef = b.dataset.a;
        let gerekce = '';
        if (hedef === 'kaybedildi') {
          gerekce = await new Promise(res => App.redGerekceDialog('Kayıp Sebebi',
            'Bu fırsat neden kaybedildi? (fiyat, termin, rakip, ihtiyaç değişti…)', g => res(g)));
          if (!gerekce) return;
        }
        const r = await CRM.asamaDegistir(id, hedef, gerekce);
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal();
        App.toast('Aşama güncellendi: ' + CRM.asamaBul(hedef).ad, 'ok');
        render(main);
      } catch (e) { App.toast('Güncellenemedi: ' + (e && e.message ? e.message : e), 'err'); }
    });
  }

  return { render };
})();
