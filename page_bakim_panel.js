// ════════════════════════════════════════════════════════════════════════════
// BAKIM — makina ve teçhizat envanteri, servis/bakım kayıtları, 10 yıllık
// amortisman gideri hesabı, zimmet (hangi personele/konuma atanmış).
// ════════════════════════════════════════════════════════════════════════════
PageModules.bakim_panel = (() => {
  let activeTab = 'envanter';
  let detayId = null;

  async function render(main) {
    const [tumMakinalar, bakimKayitlari, personeller, arizaKayitlari] = await Promise.all([
      Store.makinaTechizat.all(), Store.bakimKayitlari.all(), Store.personeller.all(), Store.arizaKayitlari.all()
    ]);
    const makinalar = tumMakinalar.filter(m => m.durum === 'aktif' || m.durum === 'arizali');
    const pasifMakinalar = tumMakinalar.filter(m => m.durum === 'atil' || m.durum === 'satildi');
    const bekleyenArizalar = arizaKayitlari.filter(a => a.durum === 'bekliyor');

    if (detayId) {
      const m = tumMakinalar.find(x => x.id === detayId);
      if (m) { renderDetay(main, m, bakimKayitlari, personeller); return; }
      detayId = null;
    }

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Makina & Teçhizat Bakım</div><div class="page-sub">Envanter, servis kayıtları, amortisman ve zimmet takibi</div></div>
        <div class="page-acts">${activeTab === 'envanter' ? '<button class="btn btn-blue" id="bk-new">+ Yeni Makina/Teçhizat</button>' : ''}</div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'ariza' ? 'active' : ''}" data-tab="ariza">Arıza Kayıtları ${bekleyenArizalar.length ? '<span class="pill pill-red" style="margin-left:4px">' + bekleyenArizalar.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'envanter' ? 'active' : ''}" data-tab="envanter">Envanter</div>
        <div class="tab ${activeTab === 'pasif' ? 'active' : ''}" data-tab="pasif">Atıl / Satılan Makinalar ${pasifMakinalar.length ? '<span class="pill pill-gray" style="margin-left:4px">' + pasifMakinalar.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'servis' ? 'active' : ''}" data-tab="servis">Tüm Servis Kayıtları</div>
        <div class="tab ${activeTab === 'amortisman' ? 'active' : ''}" data-tab="amortisman">Amortisman Özeti</div>
      </div>
      <div id="bk-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });
    const newBtn = document.getElementById('bk-new');
    if (newBtn) newBtn.onclick = () => openMakinaForm(null, personeller, () => render(main));

    const content = document.getElementById('bk-tab-content');
    if (activeTab === 'ariza') { content.innerHTML = renderArizaTab(arizaKayitlari, tumMakinalar); wireArizaTab(arizaKayitlari, tumMakinalar, render, main); }
    else if (activeTab === 'envanter') { content.innerHTML = renderEnvanterTab(makinalar, bakimKayitlari, personeller); wireEnvanterTab(makinalar, personeller, render, main); }
    else if (activeTab === 'pasif') { content.innerHTML = renderPasifTab(pasifMakinalar); }
    else if (activeTab === 'servis') content.innerHTML = renderServisTab(bakimKayitlari, tumMakinalar);
    else content.innerHTML = renderAmortismanTab(makinalar);
  }

  // ── ARIZA KAYITLARI: Bakım birimi işlem + yedek parça/sarf girişi yapar ────
  // Girilen yedek parça/sarflar otomatik olarak Satınalma Paneli'ne (eğer
  // hammadde kartı yoksa "manuel satınalma ihtiyacı" olarak) düşer.
  function renderArizaTab(arizaKayitlari, makinalar) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Üretimden Gelen Arıza Kayıtları</div></div>`;
    if (!arizaKayitlari.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz arıza kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>Makina</th><th>Arıza Sebebi</th><th>Öncelik</th><th>Durum</th><th></th></tr>`;
      [...arizaKayitlari].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(a => {
        const m = makinalar.find(x => x.id === a.makinaId);
        html += `<tr style="${a.oncelik === 'acil' ? 'background:var(--red-bg)' : ''}">
          <td style="font-size:11px">${a.tarih}</td><td>${m ? App.escapeHtml(m.ad) : '—'}</td>
          <td style="font-size:11.5px">${App.escapeHtml(a.arizaSebebi)}</td>
          <td>${a.oncelik === 'acil' ? '<span class="pill pill-red">Acil</span>' : '<span class="pill pill-gray">Normal</span>'}</td>
          <td>${arizaDurumPill(a.durum)}</td>
          <td>${a.durum === 'bekliyor' ? `<button class="btn btn-sm btn-blue bk-ariza-isle" data-id="${a.id}">İşleme Al</button>`
            : (a.durum === 'islemde' ? `<button class="btn btn-sm btn-green bk-ariza-tamamla" data-id="${a.id}">✓ Tamamlandı</button>` : '')}</td>
        </tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function arizaDurumPill(d) {
    const map = { bekliyor: ['Bekliyor', 'pill-amber'], islemde: ['İşleme Alındı', 'pill-blue'], tamamlandi: ['Tamamlandı', 'pill-green'] };
    const [l, c] = map[d] || ['Bekliyor', 'pill-amber'];
    return `<span class="pill ${c}">${l}</span>`;
  }

  function wireArizaTab(arizaKayitlari, makinalar, render, main) {
    document.querySelectorAll('.bk-ariza-isle').forEach(b => b.onclick = () => {
      const a = arizaKayitlari.find(x => x.id === b.dataset.id);
      openArizaIslemForm(a, makinalar, () => render(main));
    });
    // BULGU (T3-26): arıza kayıtları 'islemde'den sonra hiç 'tamamlandi'ya
    // geçemiyordu — durum haritasında etiket vardı ama set eden buton yoktu.
    // BULGU (T3-25): arıza kapatılınca makinaTechizat.durum da eski haline
    // dönmeli (AYNI makinada başka açık arıza kalmadıysa).
    document.querySelectorAll('.bk-ariza-tamamla').forEach(b => b.onclick = async () => {
      const a = arizaKayitlari.find(x => x.id === b.dataset.id);
      if (!a) return;
      a.durum = 'tamamlandi';
      a.tamamlanmaTarihi = new Date().toISOString().slice(0, 10);
      await App.persist(() => Store.arizaKayitlari.upsert(a));
      const digerAcikArizalar = arizaKayitlari.filter(x => x.id !== a.id && x.makinaId === a.makinaId && (x.durum === 'bekliyor' || x.durum === 'islemde'));
      const makina = makinalar.find(m => m.id === a.makinaId);
      if (!digerAcikArizalar.length && makina && makina.durum === 'arizali') {
        makina.durum = makina.oncekiDurumArizaOncesi || 'aktif';
        delete makina.oncekiDurumArizaOncesi;
        await App.persist(() => Store.makinaTechizat.upsert(makina));
      }
      App.toast('Arıza kapatıldı' + (makina ? ': ' + makina.ad : ''), 'ok');
      render(main);
    });
  }

  function openArizaIslemForm(ariza, makinalar, onSaved, oncekiState) {
    const makina = makinalar.find(m => m.id === ariza.makinaId);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b>${makina ? App.escapeHtml(makina.ad) : ''}</b> — ${App.escapeHtml(ariza.arizaSebebi)}</div>
      <div class="fgroup"><label class="flbl">Yapılacak İşlem (Bakım Notu)</label><textarea class="ftextarea" id="ai-islem">${oncekiState ? App.escapeHtml(oncekiState.islem) : ''}</textarea></div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Kullanılacak Yedek Parça / Sarf Malzemesi</div>
      <div class="fhint" style="margin-top:-4px;margin-bottom:8px">Buraya girilen her kalem otomatik olarak Satınalma Paneli'ne düşer (hammadde/yedek parça satınalma ihtiyacı olarak).</div>
      <div id="ai-parca-list"></div>
      <button type="button" class="btn btn-sm" id="ai-parca-ekle">+ Parça/Sarf Ekle</button>
      <div class="hr"></div>
      <div class="fgroup"><label class="flbl">Tahmini Servis Maliyeti (₺, opsiyonel — işçilik vb.)</label><input class="finput" id="ai-maliyet" type="number" value="${oncekiState ? oncekiState.maliyet : 0}"></div>
    `;
    const footer = `<button class="btn" id="ai-cancel">Vazgeç</button><button class="btn btn-blue" id="ai-confirm">İşleme Al ve Satınalmaya Gönder</button>`;
    App.openModal({ title: 'Arıza İşlemi', body, footer, wide: true });

    let parcalar = oncekiState ? oncekiState.parcalar : [];
    function renderParcaList() {
      const wrap = document.getElementById('ai-parca-list');
      if (!parcalar.length) { wrap.innerHTML = `<div class="muted" style="font-size:11.5px;padding:6px 0">Henüz parça eklenmedi.</div>`; return; }
      wrap.innerHTML = parcalar.map((p, i) => `<div class="flex-gap" style="gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;font-size:12px">${App.escapeHtml(p.ad)} — ${p.miktar} ${App.escapeHtml(p.birim)}</div>
        <button type="button" class="btn btn-icon btn-ghost ai-parca-sil" data-i="${i}" style="color:var(--red-text)">&times;</button>
      </div>`).join('');
      wrap.querySelectorAll('.ai-parca-sil').forEach(b => b.onclick = () => {
        parcalar.splice(parseInt(b.dataset.i), 1);
        renderParcaList();
      });
    }
    renderParcaList();

    document.getElementById('ai-parca-ekle').onclick = () => {
      // Mevcut form girdilerini kaydedip parça ekleme alt-formuna geçilir;
      // alt-form kapanınca aynı state ile ana form yeniden açılır.
      const state = {
        islem: document.getElementById('ai-islem').value,
        maliyet: document.getElementById('ai-maliyet').value,
        parcalar
      };
      const body2 = document.createElement('div');
      body2.innerHTML = `
        <div class="fgroup"><label class="flbl">Parça/Sarf Adı</label><input class="finput" id="pe-ad" placeholder="örn. SKF 6204 Rulman"></div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Miktar</label><input class="finput" id="pe-miktar" type="number" value="1"></div>
          <div class="fgroup"><label class="flbl">Birim</label><input class="finput" id="pe-birim" value="ADET"></div>
        </div>
      `;
      App.openModal({ title: 'Parça/Sarf Ekle', body: body2, footer: `<button class="btn" id="pe-cancel">Vazgeç</button><button class="btn btn-blue" id="pe-ekle-confirm">Ekle</button>` });
      document.getElementById('pe-cancel').onclick = () => { App.closeModal(); openArizaIslemForm(ariza, makinalar, onSaved, state); };
      document.getElementById('pe-ekle-confirm').onclick = () => {
        const ad = document.getElementById('pe-ad').value.trim();
        if (!ad) { App.toast('Parça adı zorunlu', 'err'); return; }
        state.parcalar = [...state.parcalar, { ad, miktar: parseFloat(document.getElementById('pe-miktar').value) || 1, birim: document.getElementById('pe-birim').value.trim() || 'ADET' }];
        App.closeModal();
        openArizaIslemForm(ariza, makinalar, onSaved, state);
      };
    };

    document.getElementById('ai-cancel').onclick = App.closeModal;
    document.getElementById('ai-confirm').onclick = async () => {
      ariza.durum = 'islemde';
      ariza.bakimNotu = document.getElementById('ai-islem').value.trim();
      ariza.servisMaliyeti = parseFloat(document.getElementById('ai-maliyet').value) || 0;
      ariza.parcalar = parcalar;
      await App.persist(() => Store.arizaKayitlari.upsert(ariza));

      // Her parça için Satınalma Paneli'ne bir "manuel satınalma ihtiyacı" oluştur
      if (parcalar.length) {
        const satinalmaTalepleri = await Store.satinalmaTalepleri.all();
        const hammaddeler = await Store.hammaddeler.all();
        parcalar.forEach((p, i) => {
          const eslesenHm = hammaddeler.find(h => h.ad.toLowerCase().includes(p.ad.toLowerCase()) || p.ad.toLowerCase().includes(h.ad.toLowerCase()));
          satinalmaTalepleri.push({
            id: App.uid('SAT'), kod: 'SAT-' + Date.now().toString(36).toUpperCase() + '-' + i,
            kaynakTalepId: null, kaynakArizaId: ariza.id,
            kalemAdi: p.ad, hammaddeId: eslesenHm ? eslesenHm.id : null, miktar: p.miktar, birim: p.birim,
            tedarikciId: null, tedarikciAdi: null,
            not: 'Bakım: arıza giderme için yedek parça/sarf ihtiyacı (Arıza: ' + ariza.arizaSebebi.slice(0, 60) + ')',
            durum: 'teklif_bekleniyor', tarih: new Date().toISOString().slice(0, 10)
          });
        });
        await App.persist(() => Store.satinalmaTalepleri.save(satinalmaTalepleri));
      }

      App.toast(`Arıza işleme alındı, ${parcalar.length} parça/sarf Satınalma Paneli'ne gönderildi`, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function renderPasifTab(pasifMakinalar) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Atıl / Satılan Makinalar</div></div>`;
    if (!pasifMakinalar.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz atıl veya satılmış makina yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Kod</th><th>Ad</th><th>Durum</th><th>Alıcı</th><th class="r">Satış Bedeli</th><th>Tarih</th></tr>`;
      pasifMakinalar.forEach(m => {
        html += `<tr><td class="mono">${App.escapeHtml(m.kod)}</td><td>${App.escapeHtml(m.ad)}</td>
          <td>${m.durum === 'atil' ? '<span class="pill pill-gray">Atıl</span>' : '<span class="pill pill-green">Satıldı</span>'}</td>
          <td>${App.escapeHtml(m.satisCariAdi || '—')}</td>
          <td class="r">${m.satisBedeli ? App.fmtTL(m.satisBedeli) : '—'}</td>
          <td style="font-size:11px">${m.pasifTarihi || '—'}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function yillikAmortisman(makina) {
    return makina.alisFiyati / (makina.amortismanYili || 10);
  }

  function kalanDeger(makina) {
    const alisYili = new Date(makina.alisTarihi).getFullYear();
    const buYil = new Date().getFullYear();
    const gecenYil = Math.min(buYil - alisYili, makina.amortismanYili || 10);
    const birikenAmortisman = yillikAmortisman(makina) * gecenYil;
    return Math.max(0, makina.alisFiyati - birikenAmortisman);
  }

  // RUTİN BAKIM ALARMI: son bakım + aralık geçmişse makina alarmda
  function bakimAlarmiMi(m) {
    if (!m.bakimAralikGun || m.durum === 'hurda') return false;
    const son = m.sonBakimTarihi || m.alisTarihi;
    if (!son) return true;
    const sonraki = new Date(new Date(son).getTime() + m.bakimAralikGun * 86400000).toISOString().slice(0, 10);
    return sonraki <= new Date().toISOString().slice(0, 10);
  }

  function renderEnvanterTab(makinalar, bakimKayitlari, personeller) {
    const alarmlar = makinalar.filter(bakimAlarmiMi);
    let html = '';
    if (alarmlar.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:14px">
        <div class="card-hdr"><div class="card-title" style="color:var(--red-text)">🔔 RUTİN BAKIM ALARMI — ${alarmlar.length} makina</div></div>
        <table class="dtable" style="font-size:11.5px"><tr><th>Makina</th><th>Hat</th><th>Sorumlu</th><th>Son Bakım</th><th class="r">Aralık</th><th></th></tr>
        ${alarmlar.map(m => `<tr><td><b>${App.escapeHtml(m.ad)}</b> <span class="mono muted" style="font-size:10px">${App.escapeHtml(m.kod || '')}</span></td>
          <td style="font-size:11px">${App.escapeHtml(m.hat || m.konum || '—')}</td>
          <td style="font-size:11px">${App.escapeHtml(m.bakimSorumlusu || '—')}</td>
          <td style="font-size:11px">${m.sonBakimTarihi || '<span class="muted">hiç yapılmadı</span>'}</td>
          <td class="r">${m.bakimAralikGun} gün</td>
          <td><button class="btn btn-sm btn-green bp-bakim-yapildi" data-id="${m.id}">✓ Rutin Bakım Yapıldı</button></td></tr>`).join('')}
        </table>
        <div class="fhint" style="margin-top:6px">Bu alarmlar ilgili HATTIN operatör terminalinde de görüntülenir. Bakım yapılınca kayıt Bakım/Servis Geçmişine işlenir ve sayaç sıfırlanır.</div>
      </div>`;
    }
    html += `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Makina/Teçhizat</div><div class="kpi-val blue">${makinalar.length}</div></div>
      <div class="kpi"><div class="kpi-lbl">Toplam Alış Değeri</div><div class="kpi-val purple">${App.fmtTL(makinalar.reduce((a, m) => a + m.alisFiyati, 0))}</div></div>
      <div class="kpi"><div class="kpi-lbl">Yıllık Toplam Amortisman</div><div class="kpi-val amber">${App.fmtTL(makinalar.reduce((a, m) => a + yillikAmortisman(m), 0))}</div></div>
    </div>`;
    html += `<div class="card"><table class="dtable">
      <tr><th>Kod</th><th>Ad</th><th>Kategori</th><th>Konum</th><th>Zimmetli</th><th class="r">Alış Fiyatı</th><th class="r">Kalan Değer</th><th></th></tr>`;
    makinalar.forEach(m => {
      const personel = personeller.find(p => p.id === m.zimmetliPersonelId);
      html += `<tr>
        <td class="mono">${App.escapeHtml(m.kod)}</td>
        <td>${App.escapeHtml(m.ad)}${m.durum === 'arizali' ? ' <span class="pill pill-red" style="font-size:9px">⚠ Arızalı</span>' : ''}</td>
        <td><span class="pill pill-gray">${App.escapeHtml(m.kategori || '—')}</span></td>
        <td style="font-size:11.5px">${App.escapeHtml(m.konum || '—')}</td>
        <td style="font-size:11.5px">${personel ? App.escapeHtml(personel.adSoyad) : '—'}</td>
        <td class="r">${App.fmtTL(m.alisFiyati)}</td>
        <td class="r">${App.fmtTL(kalanDeger(m))}</td>
        <td><button class="btn btn-sm btn-ghost bk-detay" data-id="${m.id}">Detay</button>
          <button class="btn btn-sm btn-ghost bk-sil" data-id="${m.id}" style="color:var(--red-text)">Sil</button></td>
      </tr>`;
    });
    html += `</table></div>`;
    return html;
  }

  function wireEnvanterTab(makinalar, personeller, render, main) {
    // Rutin bakım tamamlandı: son bakım tarihi güncellenir + servis geçmişine işlenir
    main.querySelectorAll('.bp-bakim-yapildi').forEach(b => b.onclick = async () => {
      const m = makinalar.find(x => x.id === b.dataset.id);
      if (!m) return;
      m.sonBakimTarihi = new Date().toISOString().slice(0, 10);
      await App.persist(() => Store.makinaTechizat.upsert(m));
      const kayitlar = await Store.bakimKayitlari.all();
      kayitlar.push({
        id: App.uid('BKM'), makinaId: m.id, makinaAd: m.ad,
        tarih: m.sonBakimTarihi, tip: 'rutin',
        aciklama: 'Rutin periyodik bakım yapıldı (aralık: ' + (m.bakimAralikGun || '—') + ' gün)' + (m.bakimSorumlusu ? ' — Sorumlu: ' + m.bakimSorumlusu : ''),
        maliyet: 0
      });
      await App.persist(() => Store.bakimKayitlari.save(kayitlar));
      App.toast('Rutin bakım kaydedildi: ' + m.ad + ' — sonraki alarm ' + (m.bakimAralikGun || '?') + ' gün sonra', 'ok');
      render(main);
    });
    document.querySelectorAll('.bk-detay').forEach(b => b.onclick = () => { detayId = b.dataset.id; render(main); });
    document.querySelectorAll('.bk-sil').forEach(b => b.onclick = () => {
      const m = makinalar.find(x => x.id === b.dataset.id);
      openMakinaSilForm(m, () => render(main));
    });
  }

  // Makina silinmek istendiğinde Atıl mı Satıldı mı sorulur. Satıldıysa
  // Cari Seçici açılıp alıcı (müşteri/tedarikçi) ve satış bedeli istenir;
  // bu bedel basit bir muhasebe/bilanço kaydına (gelir) işlenir.
  function openMakinaSilForm(makina, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b>${App.escapeHtml(makina.ad)}</b> envanterden çıkarılacak. Durumunu seçin:</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Durum</label>
          <select class="fselect" id="ms-durum">
            <option value="atil">Atıl (hurda/kullanılamaz hale geldi)</option>
            <option value="satildi">Satıldı</option>
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Tarih</label><input class="finput" id="ms-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div id="ms-satis-alanlari" style="display:none">
        <div class="fgroup"><label class="flbl">Alıcı (Cari)</label>
          <div class="flex-gap" style="gap:8px">
            <input class="finput" id="ms-alici-ad" readonly placeholder="Henüz seçilmedi" style="flex:1;background:var(--bg)">
            <input type="hidden" id="ms-alici-id">
            <button type="button" class="btn btn-blue" id="ms-alici-sec">🔍 Cari Seç</button>
          </div>
        </div>
        <div class="fgroup"><label class="flbl">Satış Bedeli (₺)</label><input class="finput" id="ms-bedel" type="number"></div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="ms-aciklama"></textarea></div>
    `;
    const footer = `<button class="btn" id="ms-cancel">Vazgeç</button><button class="btn btn-red" id="ms-confirm">Envanterden Çıkar</button>`;
    App.openModal({ title: 'Makinayı Envanterden Çıkar', body, footer, wide: true });

    document.getElementById('ms-durum').onchange = (e) => {
      document.getElementById('ms-satis-alanlari').style.display = e.target.value === 'satildi' ? 'block' : 'none';
    };
    document.getElementById('ms-cancel').onclick = App.closeModal;

    document.getElementById('ms-alici-sec').onclick = () => {
      const ms = {
        tarih: document.getElementById('ms-tarih').value,
        aciklama: document.getElementById('ms-aciklama').value,
        bedel: document.getElementById('ms-bedel') ? document.getElementById('ms-bedel').value : ''
      };
      App.closeModal();
      App.goTo('cari_secici', {
        baslik: 'Makina Alıcısı Seç',
        geriDon: () => { App.goTo('bakim_panel'); reopenSilForm(makina, onSaved, ms); },
        onSecildi: (secim) => {
          App.goTo('bakim_panel');
          reopenSilForm(makina, onSaved, ms, secim);
        }
      });
    };

    document.getElementById('ms-confirm').onclick = async () => {
      const durum = document.getElementById('ms-durum').value;
      makina.durum = durum;
      makina.pasifTarihi = document.getElementById('ms-tarih').value;
      makina.pasifAciklama = document.getElementById('ms-aciklama').value.trim();

      if (durum === 'satildi') {
        const aliciId = document.getElementById('ms-alici-id').value;
        const aliciAd = document.getElementById('ms-alici-ad').value;
        const bedel = parseFloat(document.getElementById('ms-bedel').value);
        if (!aliciAd || !bedel) { App.toast('Satış için alıcı ve bedel zorunlu', 'err'); return; }
        makina.satisCariId = aliciId;
        makina.satisCariAdi = aliciAd;
        makina.satisBedeli = bedel;
        await App.persist(() => Store.makinaTechizat.upsert(makina));
        await App.persist(() => App.muhasebeKaydiOlustur({
          tip: 'gelir', kategori: 'duran_varlik_satisi',
          aciklama: 'Makina satışı: ' + makina.ad + ' → ' + aliciAd,
          tutar: bedel, kaynakId: makina.id, kaynakTip: 'makina_satisi'
        }));
        App.toast('Makina satıldı olarak işaretlendi, muhasebe/bilanço kaydı oluşturuldu: ' + App.fmtTL(bedel), 'ok');
      } else {
        await App.persist(() => Store.makinaTechizat.upsert(makina));
        App.toast('Makina atıl olarak işaretlendi', 'ok');
      }
      App.closeModal();
      onSaved();
    };
  }

  function reopenSilForm(makina, onSaved, onceki, secim) {
    openMakinaSilForm(makina, onSaved);
    setTimeout(() => {
      document.getElementById('ms-durum').value = 'satildi';
      document.getElementById('ms-durum').dispatchEvent(new Event('change'));
      if (onceki) {
        document.getElementById('ms-tarih').value = onceki.tarih || document.getElementById('ms-tarih').value;
        document.getElementById('ms-aciklama').value = onceki.aciklama || '';
        if (onceki.bedel) document.getElementById('ms-bedel').value = onceki.bedel;
      }
      if (secim) {
        document.getElementById('ms-alici-ad').value = secim.unvan;
        document.getElementById('ms-alici-id').value = secim.id;
      }
    }, 0);
  }

  function renderServisTab(bakimKayitlari, makinalar) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Tüm Servis & Bakım Kayıtları</div></div>`;
    if (!bakimKayitlari.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz servis kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>Makina</th><th>Tip</th><th>Açıklama</th><th class="r">Maliyet</th></tr>`;
      [...bakimKayitlari].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(b => {
        const m = makinalar.find(x => x.id === b.makinaId);
        html += `<tr><td style="font-size:11px">${b.tarih}</td><td>${m ? App.escapeHtml(m.ad) : '—'}</td>
          <td><span class="pill ${b.tip === 'periyodik' ? 'pill-blue' : 'pill-amber'}">${b.tip === 'periyodik' ? 'Periyodik' : 'Arızi'}</span></td>
          <td style="font-size:11.5px">${App.escapeHtml(b.aciklama || '')}</td>
          <td class="r">${App.fmtTL(b.maliyet || 0)}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function renderAmortismanTab(makinalar) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Amortisman Özeti (Varsayılan 10 Yıl)</div></div>
      <table class="dtable"><tr><th>Makina</th><th>Alış Tarihi</th><th class="r">Alış Fiyatı</th><th class="r">Amortisman Yılı</th><th class="r">Yıllık Gider</th><th class="r">Biriken Amortisman</th><th class="r">Kalan Değer</th></tr>`;
    makinalar.forEach(m => {
      const alisYili = new Date(m.alisTarihi).getFullYear();
      const buYil = new Date().getFullYear();
      const gecenYil = Math.min(buYil - alisYili, m.amortismanYili || 10);
      const birikenAmortisman = yillikAmortisman(m) * gecenYil;
      html += `<tr><td>${App.escapeHtml(m.ad)}</td><td style="font-size:11px">${m.alisTarihi}</td>
        <td class="r">${App.fmtTL(m.alisFiyati)}</td><td class="r">${m.amortismanYili || 10} yıl</td>
        <td class="r">${App.fmtTL(yillikAmortisman(m))}</td><td class="r">${App.fmtTL(birikenAmortisman)}</td>
        <td class="r"><b>${App.fmtTL(kalanDeger(m))}</b></td></tr>`;
    });
    const toplamYillikGider = makinalar.reduce((a, m) => a + yillikAmortisman(m), 0);
    html += `<tr class="total-row"><td colspan="4">TOPLAM YILLIK AMORTİSMAN GİDERİ</td><td class="r">${App.fmtTL(toplamYillikGider)}</td><td colspan="2"></td></tr>`;
    html += `</table></div>`;
    return html;
  }

  function renderDetay(main, m, bakimKayitlari, personeller) {
    const kendiServisleri = bakimKayitlari.filter(b => b.makinaId === m.id);
    const toplamServisMaliyeti = kendiServisleri.reduce((a, b) => a + (b.maliyet || 0), 0);
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${App.escapeHtml(m.ad)}</div><div class="page-sub">${App.escapeHtml(m.kod)}</div></div>
        <div class="page-acts">
          <button class="btn" id="bk-back">&larr; Listeye Dön</button>
          <button class="btn" id="bk-edit">Düzenle</button>
          <button class="btn btn-blue" id="bk-servis-ekle">+ Servis Kaydı Ekle</button>
        </div>
      </div>
      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Alış Fiyatı</div><div class="kpi-val blue">${App.fmtTL(m.alisFiyati)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Yıllık Amortisman</div><div class="kpi-val amber">${App.fmtTL(yillikAmortisman(m))}</div></div>
        <div class="kpi"><div class="kpi-lbl">Kalan Değer</div><div class="kpi-val green">${App.fmtTL(kalanDeger(m))}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam Servis Gideri</div><div class="kpi-val purple">${App.fmtTL(toplamServisMaliyeti)}</div></div>
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">Bilgiler</div></div>
        <div style="font-size:12.5px;display:flex;flex-direction:column;gap:4px">
          <div>Kategori: <b>${App.escapeHtml(m.kategori || '—')}</b></div>
          <div>Konum: <b>${App.escapeHtml(m.konum || '—')}</b></div>
          <div>Zimmetli Personel: <b>${(() => { const p = personeller.find(x => x.id === m.zimmetliPersonelId); return p ? App.escapeHtml(p.adSoyad) : '—'; })()}</b></div>
          <div>Alış Tarihi: <b>${m.alisTarihi}</b></div>
          <div>Amortisman Süresi: <b>${m.amortismanYili || 10} yıl</b></div>
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">Servis & Bakım Geçmişi</div></div>
        ${kendiServisleri.length ? `<table class="dtable"><tr><th>Tarih</th><th>Tip</th><th>Açıklama</th><th class="r">Maliyet</th></tr>
          ${[...kendiServisleri].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).map(b => `<tr><td style="font-size:11px">${b.tarih}</td>
            <td><span class="pill ${b.tip === 'periyodik' ? 'pill-blue' : 'pill-amber'}">${b.tip === 'periyodik' ? 'Periyodik' : 'Arızi'}</span></td>
            <td style="font-size:11.5px">${App.escapeHtml(b.aciklama || '')}</td><td class="r">${App.fmtTL(b.maliyet || 0)}</td></tr>`).join('')}
        </table>` : '<div class="empty-state" style="padding:18px 10px"><div class="edesc">Servis kaydı yok.</div></div>'}
      </div>
    `;
    document.getElementById('bk-back').onclick = () => { detayId = null; render(main); };
    document.getElementById('bk-edit').onclick = () => openMakinaForm(m, personeller, () => render(main));
    document.getElementById('bk-servis-ekle').onclick = () => openServisForm(m, () => render(main));
  }

  function openMakinaForm(makina, personeller, onSaved) {
    const d = makina || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kod</label><input class="finput" id="mf-kod" value="${App.escapeHtml(d.kod || '')}"></div>
        <div class="fgroup"><label class="flbl">Ad</label><input class="finput" id="mf-ad" value="${App.escapeHtml(d.ad || '')}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kategori</label><input class="finput" id="mf-kategori" value="${App.escapeHtml(d.kategori || '')}" placeholder="örn. CNC, Forklift, Bantlama"></div>
        <div class="fgroup"><label class="flbl">Konum</label><input class="finput" id="mf-konum" value="${App.escapeHtml(d.konum || '')}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Alış Tarihi</label><input class="finput" id="mf-alistarihi" type="date" value="${d.alisTarihi || ''}"></div>
        <div class="fgroup"><label class="flbl">Alış Fiyatı (₺)</label><input class="finput" id="mf-alisfiyati" type="number" value="${d.alisFiyati || ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Bağlı Olduğu Hat / Bölüm</label><input class="finput" id="mf-hat" value="${App.escapeHtml(d.hat || '')}" placeholder="örn. BANYO MAKİNE HATTI"></div>
        <div class="fgroup"><label class="flbl">Bakım Sorumlusu</label><input class="finput" id="mf-bakimsorumlu" value="${App.escapeHtml(d.bakimSorumlusu || '')}" placeholder="Ad Soyad"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Rutin Bakım Aralığı (gün)</label><input class="finput" id="mf-bakimaralik" type="number" min="0" value="${d.bakimAralikGun || ''}" placeholder="örn. 30">
          <div class="fhint">Süre dolunca ALARM verilir: Bakım Planlama + ilgili hat ekranında görünür.</div></div>
        <div class="fgroup"><label class="flbl">Son Bakım Tarihi</label><input class="finput" id="mf-sonbakim" type="date" value="${d.sonBakimTarihi || ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Amortisman Süresi (yıl)</label><input class="finput" id="mf-amortismanyili" type="number" value="${d.amortismanYili || 10}"></div>
        <div class="fgroup"><label class="flbl">Zimmetli Personel</label>
          <select class="fselect" id="mf-zimmet">
            <option value="">— Seçilmedi —</option>
            ${personeller.map(p => `<option value="${p.id}" ${d.zimmetliPersonelId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
    const footer = `<button class="btn" id="mf-cancel">Vazgeç</button><button class="btn btn-blue" id="mf-save">Kaydet</button>`;
    App.openModal({ title: makina ? 'Makina/Teçhizatı Düzenle' : 'Yeni Makina/Teçhizat', body, footer, wide: true });
    document.getElementById('mf-cancel').onclick = App.closeModal;
    document.getElementById('mf-save').onclick = async () => {
      const ad = document.getElementById('mf-ad').value.trim();
      if (!ad) { App.toast('Ad zorunlu', 'err'); return; }
      const m = {
        id: d.id || App.uid('MKN'),
        kod: document.getElementById('mf-kod').value.trim() || App.uid('MKN'),
        ad, kategori: document.getElementById('mf-kategori').value.trim(),
        konum: document.getElementById('mf-konum').value.trim(),
        alisTarihi: document.getElementById('mf-alistarihi').value,
        alisFiyati: parseFloat(document.getElementById('mf-alisfiyati').value) || 0,
        amortismanYili: parseInt(document.getElementById('mf-amortismanyili').value) || 10,
        zimmetliPersonelId: document.getElementById('mf-zimmet').value || null,
        hat: document.getElementById('mf-hat').value.trim(),
        bakimSorumlusu: document.getElementById('mf-bakimsorumlu').value.trim(),
        bakimAralikGun: parseInt(document.getElementById('mf-bakimaralik').value) || 0,
        sonBakimTarihi: document.getElementById('mf-sonbakim').value || d.sonBakimTarihi || null,
        durum: d.durum || 'aktif'
      };
      await App.persist(() => Store.makinaTechizat.upsert(m));
      App.toast('Makina/teçhizat kaydedildi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function openServisForm(makina, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Tarih</label><input class="finput" id="sf-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="fgroup"><label class="flbl">Tip</label>
          <select class="fselect" id="sf-tip"><option value="periyodik">Periyodik</option><option value="arizi">Arızi</option></select>
        </div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="sf-aciklama"></textarea></div>
      <div class="fgroup"><label class="flbl">Maliyet (₺)</label><input class="finput" id="sf-maliyet" type="number" value="0"></div>
    `;
    const footer = `<button class="btn" id="sf-cancel">Vazgeç</button><button class="btn btn-blue" id="sf-save">Kaydet</button>`;
    App.openModal({ title: 'Servis Kaydı Ekle', sub: makina.ad, body, footer });
    document.getElementById('sf-cancel').onclick = App.closeModal;
    document.getElementById('sf-save').onclick = async () => {
      const kayit = {
        id: App.uid('BKM'), makinaId: makina.id,
        tarih: document.getElementById('sf-tarih').value,
        tip: document.getElementById('sf-tip').value,
        aciklama: document.getElementById('sf-aciklama').value.trim(),
        maliyet: parseFloat(document.getElementById('sf-maliyet').value) || 0
      };
      await App.persist(() => Store.bakimKayitlari.upsert(kayit));
      if (kayit.maliyet > 0) {
        await App.persist(() => App.muhasebeKaydiOlustur({
          tip: 'gider', kategori: 'bakim_servis_gideri',
          aciklama: 'Bakım/servis gideri: ' + App.escapeHtml(makina.ad) + ' — ' + (kayit.aciklama || ''),
          tutar: kayit.maliyet, matrah: kayit.maliyet, kdvOrani: 0, kdvTutari: 0,
          kaynakId: kayit.id, kaynakTip: 'bakim_servis'
        }));
      }
      App.toast('Servis kaydı eklendi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();
