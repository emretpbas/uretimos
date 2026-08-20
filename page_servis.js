// ════════════════════════════════════════════════════════════════════════════
// SATIŞ SONRASI SERVİS & GARANTİ
//
// GAP analizinde en zayıf alan (1/5) burasıydı: müşteri "kapak düştü"
// dediğinde sistemde gidecek yer yoktu. İade Ambarı 2. kalite deposudur,
// şikayet yönetimi değildir.
//
// Bu modül şu zinciri kurar:
//   ŞİKAYET → GARANTİ SORGUSU → SERVİS PLANI → MÜDAHALE → MALİYET → KALİTE
//
// Kritik bağlantı: her şikayet, kök nedeni bulunması için KALİTE DÖF'üne
// (uygunsuzluk kaydına) bağlanabilir. Böylece saha hatası tasarıma/üretime
// geri beslenir ve aynı hata tekrar üretilmez.
//
// GARANTİ: Tüketici mevzuatında mobilya için asgari 2 yıl garanti zorunludur.
// Garanti başlangıcı TESLİM tarihidir (irsaliye), fatura tarihi değil.
// ════════════════════════════════════════════════════════════════════════════
PageModules.servis = (() => {
  let activeTab = 'pano';
  const VARSAYILAN_GARANTI_AY = 24; // Tüketici mevzuatı asgari

  const bugun = () => new Date().toISOString().slice(0, 10);
  const gunFark = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
  const ayEkle = (t, ay) => { const d = new Date(t + 'T00:00:00'); d.setMonth(d.getMonth() + ay); return d.toISOString().slice(0, 10); };

  const SIKAYET_TIPI = {
    hasar: ['Nakliye Hasarı', 'pill-amber'],
    eksik: ['Eksik Parça / Aksesuar', 'pill-amber'],
    uretim_hatasi: ['Üretim Hatası', 'pill-red'],
    montaj: ['Montaj Sorunu', 'pill-blue'],
    yanlis_urun: ['Yanlış Ürün / Renk', 'pill-red'],
    fonksiyon: ['Fonksiyon Arızası (menteşe, ray)', 'pill-amber'],
    gorunum: ['Görünüm / Yüzey Kusuru', 'pill-blue'],
    diger: ['Diğer', 'pill-gray']
  };
  const SIKAYET_DURUM = {
    acik: ['Açık', 'pill-red'],
    incelemede: ['İncelemede', 'pill-amber'],
    servis_planlandi: ['Servis Planlandı', 'pill-blue'],
    cozuldu: ['Çözüldü', 'pill-green'],
    reddedildi: ['Reddedildi (garanti dışı)', 'pill-gray']
  };
  const COZUM = {
    yerinde_onarim: 'Yerinde Onarım',
    parca_gonderimi: 'Yedek Parça Gönderimi',
    urun_degisimi: 'Ürün Değişimi',
    iade_bedel: 'İade / Bedel İadesi',
    bilgilendirme: 'Bilgilendirme (kusur yok)'
  };

  // ── GARANTİ SORGUSU ─────────────────────────────────────────────────────
  // Teslim tarihi (irsaliye) + garanti süresi. Fatura değil TESLİM esas alınır.
  function garantiDurumu(siparisId, irsaliyeler, garantiAy) {
    const irs = (irsaliyeler || []).filter(i => i.siparisId === siparisId)
      .sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));
    if (!irs.length) return { biliniyor: false, mesaj: 'Teslim (irsaliye) kaydı bulunamadı — garanti başlangıcı belirlenemiyor' };
    const teslim = irs[0].tarih;
    const bitis = ayEkle(teslim, garantiAy || VARSAYILAN_GARANTI_AY);
    const kapsamda = bugun() <= bitis;
    const kalanGun = gunFark(bitis, bugun());
    return { biliniyor: true, teslimTarihi: teslim, bitisTarihi: bitis, kapsamda, kalanGun,
      mesaj: kapsamda ? `Garanti kapsamında — ${kalanGun} gün kaldı` : `Garanti süresi ${Math.abs(kalanGun)} gün önce doldu` };
  }

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const [sikayetler, servisler, siparisler, irsaliyeler, musteriler, personeller] = await Promise.all([
      Store.sikayetler.all(), Store.servisTalepleri.all(), Store.siparisler.all(),
      Store.irsaliyeler.all(), Store.musteriler.all(), Store.personeller.all()
    ]);
    const d = { sikayetler, servisler, siparisler, irsaliyeler, musteriler, personeller };

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Satış Sonrası Servis &amp; Garanti</div>
        <div class="page-sub">Müşteri şikayeti → garanti sorgusu → servis planı → müdahale → kalite geri beslemesi</div></div>
        <div class="page-acts" id="srv-acts"></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'pano' ? 'active' : ''}" data-tab="pano">📊 Servis Panosu</div>
        <div class="tab ${activeTab === 'sikayet' ? 'active' : ''}" data-tab="sikayet">📣 Şikayetler</div>
        <div class="tab ${activeTab === 'servis' ? 'active' : ''}" data-tab="servis">🔧 Saha Servisi</div>
        <div class="tab ${activeTab === 'garanti' ? 'active' : ''}" data-tab="garanti">🛡 Garanti Sorgusu</div>
      </div>
      <div id="srv-content"></div>`;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const acts = document.getElementById('srv-acts');
    const c = document.getElementById('srv-content');
    if (activeTab === 'pano') panoTab(c, d);
    else if (activeTab === 'sikayet') { acts.innerHTML = '<button class="btn btn-red" id="srv-yeni">+ Şikayet Kaydı</button>'; sikayetTab(c, d, render, main); }
    else if (activeTab === 'servis') { acts.innerHTML = '<button class="btn btn-blue" id="srv-yeni">+ Servis Talebi</button>'; servisTab(c, d, render, main); }
    else garantiTab(c, d);

    const y = document.getElementById('srv-yeni');
    if (y) y.onclick = () => activeTab === 'sikayet' ? sikayetFormu(null, d, render, main) : servisFormu(null, null, d, render, main);
  }

  // ── SERVİS PANOSU ───────────────────────────────────────────────────────
  function panoTab(c, d) {
    const acik = d.sikayetler.filter(s => s.durum !== 'cozuldu' && s.durum !== 'reddedildi');
    const cozulen = d.sikayetler.filter(s => s.durum === 'cozuldu');
    // Sevk edilen toplam adet (PPM için)
    const sevkAdet = d.irsaliyeler.reduce((a, i) =>
      a + (i.kalemler || []).reduce((b, k) => b + (k.miktar || 1), 0), 0);
    const sikayetAdet = d.sikayetler.reduce((a, s) => a + (s.adet || 1), 0);
    const ppm = sevkAdet > 0 ? (sikayetAdet / sevkAdet) * 1000000 : 0;
    // Çözüm süresi
    const sureler = cozulen.filter(s => s.cozumTarihi && s.tarih).map(s => gunFark(s.cozumTarihi, s.tarih));
    const ortCozum = sureler.length ? sureler.reduce((a, b) => a + b, 0) / sureler.length : null;
    const servisMaliyet = d.servisler.reduce((a, s) => a + (s.toplamMaliyet || 0), 0);
    const garantiDisiTahsil = d.servisler.filter(s => !s.garantiKapsaminda).reduce((a, s) => a + (s.toplamMaliyet || 0), 0);

    // Şikayet tipi Pareto
    const tipGrup = new Map();
    d.sikayetler.forEach(s => {
      const t = s.tip || 'diger';
      tipGrup.set(t, (tipGrup.get(t) || 0) + (s.adet || 1));
    });
    const tipListe = [...tipGrup.entries()].map(([t, n]) => ({ tip: t, adet: n }))
      .sort((a, b) => b.adet - a.adet);
    const tipToplam = tipListe.reduce((a, x) => a + x.adet, 0);

    // Ürün bazlı şikayet
    const urunGrup = new Map();
    d.sikayetler.forEach(s => {
      const k = s.urunKod || 'Belirtilmemiş';
      urunGrup.set(k, (urunGrup.get(k) || 0) + (s.adet || 1));
    });

    let html = `<div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Açık Şikayet</div>
        <div class="kpi-val ${acik.length ? 'red' : 'green'}">${acik.length}</div>
        <div class="muted" style="font-size:10.5px">${d.sikayetler.length} toplam kayıt</div></div>
      <div class="kpi"><div class="kpi-lbl">Şikayet Oranı (PPM)</div>
        <div class="kpi-val ${ppm === 0 ? 'green' : ppm < 5000 ? 'amber' : 'red'}">${App.fmt(ppm, 0)}</div>
        <div class="muted" style="font-size:10.5px">Milyon sevkiyatta şikayet</div></div>
      <div class="kpi"><div class="kpi-lbl">Ort. Çözüm Süresi</div>
        <div class="kpi-val ${ortCozum === null ? 'blue' : ortCozum <= 7 ? 'green' : ortCozum <= 15 ? 'amber' : 'red'}">${ortCozum !== null ? App.fmt(ortCozum, 1) + ' gün' : '—'}</div>
        <div class="muted" style="font-size:10.5px">${cozulen.length} çözülmüş şikayet</div></div>
      <div class="kpi"><div class="kpi-lbl">Servis Maliyeti</div>
        <div class="kpi-val amber">${App.fmtTL(servisMaliyet)}</div>
        <div class="muted" style="font-size:10.5px">${App.fmtTL(garantiDisiTahsil)} garanti dışı (tahsil edilebilir)</div></div>
    </div>`;

    if (!d.sikayetler.length) {
      html += `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Henüz şikayet kaydı yok</div>
        <div class="edesc">Müşteriden gelen her şikayeti kaydedin. Kayıt altına alınmayan şikayet ölçülemez; ölçülemeyen hata tekrar eder.</div></div></div>`;
      c.innerHTML = html;
      return;
    }

    html += `<div class="grid grid-2" style="margin-bottom:14px">
      <div class="card"><div class="card-hdr"><div class="card-title">📊 Şikayet Tipi Dağılımı (Pareto)</div></div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Tip</th><th class="r">Adet</th><th>Pay</th></tr>
          ${tipListe.map(x => {
            const [ad] = SIKAYET_TIPI[x.tip] || [x.tip];
            const oran = tipToplam > 0 ? x.adet / tipToplam : 0;
            return `<tr><td><b>${ad}</b></td><td class="r">${x.adet}</td>
              <td style="min-width:130px">
                <div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${oran * 100}%;background:var(--amber)"></div></div>
                <span class="muted" style="font-size:9.5px">%${Math.round(oran * 100)}</span></td></tr>`;
          }).join('')}
        </table>
        <div class="fhint" style="margin-top:6px">En sık şikayet tipi, kalite iyileştirmesinin odağı olmalıdır.</div>
      </div>
      <div class="card"><div class="card-hdr"><div class="card-title">📦 Ürün Bazlı Şikayet</div></div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Ürün</th><th class="r">Şikayet</th></tr>
          ${[...urunGrup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
            .map(([k, n]) => `<tr${n >= 3 ? ' style="background:var(--red-bg)"' : ''}>
              <td class="mono" style="font-size:10.5px">${App.escapeHtml(k)}</td>
              <td class="r"><b>${n}</b></td></tr>`).join('')}
        </table>
        <div class="fhint" style="margin-top:6px">3+ şikayet alan ürünler kırmızı — tasarım/üretim gözden geçirilmeli.</div>
      </div></div>`;

    // Çözüm dağılımı
    const cozumGrup = new Map();
    d.sikayetler.filter(s => s.cozum).forEach(s => cozumGrup.set(s.cozum, (cozumGrup.get(s.cozum) || 0) + 1));
    if (cozumGrup.size) {
      html += `<div class="card"><div class="card-hdr"><div class="card-title">🔧 Uygulanan Çözümler</div></div>
        <table class="dtable" style="font-size:11.5px"><tr><th>Çözüm</th><th class="r">Adet</th></tr>
          ${[...cozumGrup.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
            `<tr><td>${COZUM[k] || k}</td><td class="r"><b>${n}</b></td></tr>`).join('')}
        </table></div>`;
    }
    c.innerHTML = html;
  }

  // ── ŞİKAYETLER ──────────────────────────────────────────────────────────
  function sikayetTab(c, d, render, main) {
    if (!d.sikayetler.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Şikayet kaydı yok</div>
        <div class="edesc">Müşteriden gelen şikayeti "+ Şikayet Kaydı" ile girin. Sipariş seçildiğinde garanti durumu otomatik sorgulanır.</div></div></div>`;
      return;
    }
    c.innerHTML = `<div class="card">
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Tarih</th><th>Müşteri</th><th>Sipariş</th><th>Ürün</th><th>Tip</th><th class="r">Adet</th>
        <th>Garanti</th><th>Durum</th><th>NCR</th><th></th></tr>
        ${[...d.sikayetler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).map(s => {
          const [tipAd, tipRenk] = SIKAYET_TIPI[s.tip] || [s.tip, 'pill-gray'];
          const [durAd, durRenk] = SIKAYET_DURUM[s.durum] || [s.durum, 'pill-gray'];
          const acikGun = s.durum !== 'cozuldu' && s.durum !== 'reddedildi' && s.tarih ? gunFark(bugun(), s.tarih) : null;
          return `<tr${acikGun !== null && acikGun > 15 ? ' style="background:var(--red-bg)"' : ''}>
            <td class="mono" style="font-size:10.5px">${s.tarih || '—'}
              ${acikGun !== null ? `<br><span class="pill ${acikGun > 15 ? 'pill-red' : 'pill-amber'}" style="font-size:8.5px">${acikGun} gün açık</span>` : ''}</td>
            <td>${App.escapeHtml(s.musteriAdi || '—')}</td>
            <td class="mono" style="font-size:10px">${App.escapeHtml(s.siparisKod || '—')}</td>
            <td style="font-size:10.5px">${App.escapeHtml((s.urunKod || '') + ' ' + (s.urunAd || '').slice(0, 20))}</td>
            <td><span class="pill ${tipRenk}" style="font-size:9px">${tipAd}</span></td>
            <td class="r">${s.adet || 1}</td>
            <td>${s.garantiKapsaminda === true ? '<span class="pill pill-green" style="font-size:9px">Kapsamda</span>'
              : s.garantiKapsaminda === false ? '<span class="pill pill-red" style="font-size:9px">Dışında</span>'
              : '<span class="muted" style="font-size:9.5px">—</span>'}</td>
            <td><span class="pill ${durRenk}" style="font-size:9px">${durAd}</span></td>
            <td>${s.ncrNo ? `<span class="pill pill-purple" style="font-size:8.5px">${App.escapeHtml(s.ncrNo)}</span>` : '<span class="muted">—</span>'}</td>
            <td style="display:flex;gap:4px">
              <button class="btn btn-sm btn-ghost srv-duzenle" data-id="${s.id}">Detay</button>
              ${s.durum !== 'cozuldu' && s.durum !== 'reddedildi' ? `<button class="btn btn-sm btn-blue srv-servis" data-id="${s.id}">🔧 Servis</button>` : ''}
            </td>
          </tr>`;
        }).join('')}
      </table></div>`;
    c.querySelectorAll('.srv-duzenle').forEach(b => b.onclick = () =>
      sikayetFormu(d.sikayetler.find(x => x.id === b.dataset.id), d, render, main));
    c.querySelectorAll('.srv-servis').forEach(b => b.onclick = () =>
      servisFormu(null, d.sikayetler.find(x => x.id === b.dataset.id), d, render, main));
  }

  function sikayetFormu(kayit, d, render, main) {
    const s = kayit || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Şikayet Tarihi</label>
          <input class="finput" id="sk-tarih" type="date" value="${s.tarih || bugun()}"></div>
        <div class="fgroup" style="flex:1.4"><label class="flbl">Müşteri Siparişi <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="sk-siparis">
            <option value="">— Seçiniz —</option>
            ${d.siparisler.filter(x => x.durum === 'sevk_edildi' || x.uretimDurumu === 'tamamlandi')
              .map(x => `<option value="${x.id}" ${s.siparisId === x.id ? 'selected' : ''}>${App.escapeHtml(x.kod)} — ${App.escapeHtml(x.musteriAdi || '')}</option>`).join('')}
          </select></div>
      </div>
      <div id="sk-garanti" style="margin-bottom:10px"></div>
      <div class="frow">
        <div class="fgroup" style="flex:1.3"><label class="flbl">Ürün</label>
          <select class="fselect" id="sk-urun"><option value="">— Önce sipariş seçin —</option></select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Şikayet Tipi</label>
          <select class="fselect" id="sk-tip">
            ${Object.entries(SIKAYET_TIPI).map(([v, [ad]]) => `<option value="${v}" ${s.tip === v ? 'selected' : ''}>${ad}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:0.5"><label class="flbl">Adet</label>
          <input class="finput" id="sk-adet" type="number" min="1" value="${s.adet || 1}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Şikayet Açıklaması <span style="color:var(--red-text)">*</span></label>
        <textarea class="ftextarea" id="sk-aciklama" placeholder="Müşterinin bildirdiği sorun">${App.escapeHtml(s.aciklama || '')}</textarea></div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Durum</label>
          <select class="fselect" id="sk-durum">
            ${Object.entries(SIKAYET_DURUM).map(([v, [ad]]) => `<option value="${v}" ${s.durum === v ? 'selected' : ''}>${ad}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Uygulanan Çözüm</label>
          <select class="fselect" id="sk-cozum">
            <option value="">— Henüz belirlenmedi —</option>
            ${Object.entries(COZUM).map(([v, ad]) => `<option value="${v}" ${s.cozum === v ? 'selected' : ''}>${ad}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Çözüm Tarihi</label>
          <input class="finput" id="sk-cozumtarih" type="date" value="${s.cozumTarihi || ''}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Kök Neden / İç Değerlendirme</label>
        <textarea class="ftextarea" id="sk-koknedeni">${App.escapeHtml(s.kokNeden || '')}</textarea></div>
      ${!s.ncrNo ? `<label style="font-size:11.5px;display:flex;align-items:center;gap:6px">
        <input type="checkbox" id="sk-ncr" ${s.tip === 'uretim_hatasi' ? 'checked' : ''}>
        <span>Kalite <b>uygunsuzluk kaydı (NCR)</b> aç — kök neden analizi için kaliteye yönlendirilir</span></label>`
        : `<div class="fhint">Bu şikayet için <b>${App.escapeHtml(s.ncrNo)}</b> numaralı uygunsuzluk kaydı açılmış.</div>`}`;

    App.openModal({ title: kayit ? '📣 Şikayet Detayı' : '📣 Yeni Müşteri Şikayeti', body, xwide: true,
      footer: `<button class="btn" id="sk-cancel">Vazgeç</button><button class="btn btn-red" id="sk-ok">Kaydet</button>` });

    // Sipariş seçilince: garanti sorgusu + ürün listesi
    const sipSel = document.getElementById('sk-siparis');
    const garantiGuncelle = () => {
      const sid = sipSel.value;
      const gAlan = document.getElementById('sk-garanti');
      const uSel = document.getElementById('sk-urun');
      if (!sid) { gAlan.innerHTML = ''; uSel.innerHTML = '<option value="">— Önce sipariş seçin —</option>'; return; }
      const sip = d.siparisler.find(x => x.id === sid);
      const g = garantiDurumu(sid, d.irsaliyeler);
      gAlan.innerHTML = g.biliniyor
        ? `<div style="border:1px solid var(--${g.kapsamda ? 'green' : 'red'});background:var(--${g.kapsamda ? 'green' : 'red'}-bg);border-radius:8px;padding:8px 12px">
            <b style="font-size:12px;color:var(--${g.kapsamda ? 'green' : 'red'}-text)">🛡 ${g.kapsamda ? 'GARANTİ KAPSAMINDA' : 'GARANTİ DIŞI'}</b>
            <div style="font-size:11px;margin-top:2px">Teslim: ${g.teslimTarihi} · Garanti bitişi: ${g.bitisTarihi} · ${App.escapeHtml(g.mesaj)}</div>
            ${!g.kapsamda ? '<div class="fhint" style="margin-top:4px">Servis bedeli müşteriden tahsil edilebilir.</div>' : ''}
          </div>`
        : `<div style="border:1px solid var(--amber);background:var(--amber-bg);border-radius:8px;padding:8px 12px;font-size:11.5px">⚠ ${App.escapeHtml(g.mesaj)}</div>`;
      uSel.innerHTML = '<option value="">— Seçiniz —</option>' +
        (sip ? (sip.kalemler || []).map(k => `<option value="${App.escapeHtml(k.kod || '')}" data-ad="${App.escapeHtml(k.ad || '')}" ${s.urunKod === k.kod ? 'selected' : ''}>${App.escapeHtml(k.kod || '')} — ${App.escapeHtml((k.ad || '').slice(0, 30))}</option>`).join('') : '');
    };
    sipSel.onchange = garantiGuncelle;
    if (s.siparisId) garantiGuncelle();

    document.getElementById('sk-cancel').onclick = App.closeModal;
    document.getElementById('sk-ok').onclick = async () => {
      const sid = sipSel.value;
      const aciklama = document.getElementById('sk-aciklama').value.trim();
      if (!sid || !aciklama) { App.toast('Sipariş ve şikayet açıklaması zorunlu', 'err'); return; }
      const sip = d.siparisler.find(x => x.id === sid);
      const g = garantiDurumu(sid, d.irsaliyeler);
      const uSel = document.getElementById('sk-urun');
      const urunKod = uSel.value;
      const urunAd = uSel.selectedOptions[0] ? (uSel.selectedOptions[0].dataset.ad || '') : '';
      const tip = document.getElementById('sk-tip').value;
      const adet = parseInt(document.getElementById('sk-adet').value) || 1;

      const yeni = {
        id: s.id || App.uid('SKY'),
        tarih: document.getElementById('sk-tarih').value || bugun(),
        siparisId: sid, siparisKod: sip ? sip.kod : '',
        musteriId: sip ? sip.musteriId : null, musteriAdi: sip ? sip.musteriAdi : '',
        urunKod, urunAd, tip, adet, aciklama,
        garantiKapsaminda: g.biliniyor ? g.kapsamda : null,
        teslimTarihi: g.teslimTarihi || null, garantiBitis: g.bitisTarihi || null,
        durum: document.getElementById('sk-durum').value,
        cozum: document.getElementById('sk-cozum').value || null,
        cozumTarihi: document.getElementById('sk-cozumtarih').value || null,
        kokNeden: document.getElementById('sk-koknedeni').value.trim(),
        ncrNo: s.ncrNo || null
      };

      // Kalite geri beslemesi: NCR aç
      const ncrCb = document.getElementById('sk-ncr');
      if (ncrCb && ncrCb.checked && !yeni.ncrNo) {
        const ncr = await App.persist(() => App.kaliteUygunsuzlukOlustur('musteri_sikayeti', {
          kaynakId: yeni.id, kod: urunKod, ad: urunAd, miktar: adet, birim: 'ADET',
          siparisId: sid,
          aciklama: `MÜŞTERİ ŞİKAYETİ (${(SIKAYET_TIPI[tip] || [tip])[0]}) — ${sip ? sip.musteriAdi : ''} / ${sip ? sip.kod : ''}: ${aciklama}`,
          fotograflar: [], sorumluBirim: 'kalite', dofAc: true
        }));
        yeni.ncrNo = ncr.no;
      }

      await App.persist(() => Store.sikayetler.upsert(yeni));
      App.toast(kayit ? 'Şikayet güncellendi' : 'Şikayet kaydedildi' + (yeni.ncrNo ? ' — ' + yeni.ncrNo + ' uygunsuzluk kaydı açıldı' : ''), 'ok');
      App.closeModal(); render(main);
    };
  }

  // ── SAHA SERVİSİ ────────────────────────────────────────────────────────
  function servisTab(c, d, render, main) {
    if (!d.servisler.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Servis talebi yok</div>
        <div class="edesc">Şikayetler sekmesindeki "🔧 Servis" butonuyla veya buradan yeni servis talebi açın.</div></div></div>`;
      return;
    }
    const acik = d.servisler.filter(s => s.durum !== 'tamamlandi');
    c.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Açık Servis</div><div class="kpi-val ${acik.length ? 'amber' : 'green'}">${acik.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam Servis</div><div class="kpi-val blue">${d.servisler.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam Maliyet</div><div class="kpi-val amber">${App.fmtTL(d.servisler.reduce((a, s) => a + (s.toplamMaliyet || 0), 0))}</div></div>
      </div>
      <div class="card">
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Planlanan</th><th>Müşteri</th><th>Adres / Bölge</th><th>Teknisyen</th><th>Yapılan İş</th>
          <th class="r">Maliyet</th><th>Garanti</th><th>Durum</th><th></th></tr>
          ${[...d.servisler].sort((a, b) => (b.planTarihi || '').localeCompare(a.planTarihi || '')).map(s => `<tr>
            <td class="mono" style="font-size:10.5px">${s.planTarihi || '—'}</td>
            <td>${App.escapeHtml(s.musteriAdi || '—')}</td>
            <td style="font-size:10.5px;max-width:160px">${App.escapeHtml((s.adres || '').slice(0, 40))}</td>
            <td style="font-size:10.5px">${App.escapeHtml(s.teknisyenAdi || '—')}</td>
            <td style="font-size:10.5px;max-width:180px">${App.escapeHtml((s.yapilanIs || '').slice(0, 50))}</td>
            <td class="r">${s.toplamMaliyet ? App.fmtTL(s.toplamMaliyet) : '—'}</td>
            <td>${s.garantiKapsaminda ? '<span class="pill pill-green" style="font-size:9px">Ücretsiz</span>'
              : '<span class="pill pill-amber" style="font-size:9px">Ücretli</span>'}</td>
            <td><span class="pill ${s.durum === 'tamamlandi' ? 'pill-green' : s.durum === 'yolda' ? 'pill-blue' : 'pill-amber'}" style="font-size:9px">
              ${s.durum === 'tamamlandi' ? 'Tamamlandı' : s.durum === 'yolda' ? 'Yolda' : 'Planlandı'}</span></td>
            <td><button class="btn btn-sm btn-ghost srv-s-duzenle" data-id="${s.id}">Detay</button></td>
          </tr>`).join('')}
        </table></div>`;
    c.querySelectorAll('.srv-s-duzenle').forEach(b => b.onclick = () =>
      servisFormu(d.servisler.find(x => x.id === b.dataset.id), null, d, render, main));
  }

  function servisFormu(kayit, sikayet, d, render, main) {
    const s = kayit || {};
    const sk = sikayet || (s.sikayetId ? d.sikayetler.find(x => x.id === s.sikayetId) : null);
    const mus = sk ? d.musteriler.find(m => m.id === sk.musteriId) : null;
    const body = document.createElement('div');
    body.innerHTML = `
      ${sk ? `<div class="fhint" style="margin-bottom:10px">
        Şikayet: <b>${App.escapeHtml(sk.siparisKod)}</b> · ${App.escapeHtml(sk.musteriAdi)} · ${App.escapeHtml((SIKAYET_TIPI[sk.tip] || [sk.tip])[0])}<br>
        ${sk.garantiKapsaminda ? '<span style="color:var(--green-text)">🛡 Garanti kapsamında — servis ücretsiz</span>'
          : '<span style="color:var(--amber-text)">⚠ Garanti dışı — servis bedeli tahsil edilebilir</span>'}</div>` : ''}
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Planlanan Tarih</label>
          <input class="finput" id="sv-tarih" type="date" value="${s.planTarihi || bugun()}"></div>
        <div class="fgroup" style="flex:1.2"><label class="flbl">Teknisyen</label>
          <select class="fselect" id="sv-teknisyen">
            <option value="">— Seçiniz —</option>
            ${d.personeller.filter(p => p.durum === 'aktif').map(p =>
              `<option value="${p.id}" ${s.teknisyenId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Durum</label>
          <select class="fselect" id="sv-durum">
            <option value="planlandi" ${s.durum !== 'yolda' && s.durum !== 'tamamlandi' ? 'selected' : ''}>Planlandı</option>
            <option value="yolda" ${s.durum === 'yolda' ? 'selected' : ''}>Yolda</option>
            <option value="tamamlandi" ${s.durum === 'tamamlandi' ? 'selected' : ''}>Tamamlandı</option>
          </select></div>
      </div>
      <div class="fgroup"><label class="flbl">Servis Adresi</label>
        <input class="finput" id="sv-adres" value="${App.escapeHtml(s.adres || (mus && mus.adres) || '')}"></div>
      <div class="fgroup"><label class="flbl">Yapılan İş / Müdahale</label>
        <textarea class="ftextarea" id="sv-is">${App.escapeHtml(s.yapilanIs || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">Kullanılan Yedek Parça</label>
        <textarea class="ftextarea" id="sv-parca" placeholder="örn. 2× menteşe, 1× kapak">${App.escapeHtml(s.yedekParca || '')}</textarea></div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">İşçilik (TL)</label>
          <input class="finput" id="sv-iscilik" type="number" min="0" step="0.01" value="${s.iscilikMaliyet || 0}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Parça (TL)</label>
          <input class="finput" id="sv-parcamaliyet" type="number" min="0" step="0.01" value="${s.parcaMaliyet || 0}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Yol / Nakliye (TL)</label>
          <input class="finput" id="sv-yol" type="number" min="0" step="0.01" value="${s.yolMaliyet || 0}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Toplam</label>
          <div id="sv-toplam" style="padding:9px 0;font-size:14px;font-weight:700"></div></div>
      </div>`;
    App.openModal({ title: kayit ? '🔧 Servis Kaydı' : '🔧 Yeni Servis Talebi', body, xwide: true,
      footer: `<button class="btn" id="sv-cancel">Vazgeç</button><button class="btn btn-blue" id="sv-ok">Kaydet</button>` });

    const topGuncelle = () => {
      const t = (parseFloat(document.getElementById('sv-iscilik').value) || 0)
        + (parseFloat(document.getElementById('sv-parcamaliyet').value) || 0)
        + (parseFloat(document.getElementById('sv-yol').value) || 0);
      document.getElementById('sv-toplam').textContent = App.fmtTL(t);
    };
    ['sv-iscilik', 'sv-parcamaliyet', 'sv-yol'].forEach(id => document.getElementById(id).oninput = topGuncelle);
    topGuncelle();

    document.getElementById('sv-cancel').onclick = App.closeModal;
    document.getElementById('sv-ok').onclick = async () => {
      const tid = document.getElementById('sv-teknisyen').value;
      const tek = d.personeller.find(p => p.id === tid);
      const iscilik = parseFloat(document.getElementById('sv-iscilik').value) || 0;
      const parca = parseFloat(document.getElementById('sv-parcamaliyet').value) || 0;
      const yol = parseFloat(document.getElementById('sv-yol').value) || 0;
      const durum = document.getElementById('sv-durum').value;

      const yeni = {
        id: s.id || App.uid('SRV'),
        sikayetId: (sk && sk.id) || s.sikayetId || null,
        musteriId: (sk && sk.musteriId) || s.musteriId || null,
        musteriAdi: (sk && sk.musteriAdi) || s.musteriAdi || '',
        siparisKod: (sk && sk.siparisKod) || s.siparisKod || '',
        garantiKapsaminda: sk ? sk.garantiKapsaminda : s.garantiKapsaminda,
        planTarihi: document.getElementById('sv-tarih').value || bugun(),
        teknisyenId: tid || null, teknisyenAdi: tek ? tek.adSoyad : '',
        adres: document.getElementById('sv-adres').value.trim(),
        yapilanIs: document.getElementById('sv-is').value.trim(),
        yedekParca: document.getElementById('sv-parca').value.trim(),
        iscilikMaliyet: iscilik, parcaMaliyet: parca, yolMaliyet: yol,
        toplamMaliyet: iscilik + parca + yol,
        durum, tamamlanmaTarihi: durum === 'tamamlandi' ? bugun() : (s.tamamlanmaTarihi || null)
      };
      await App.persist(() => Store.servisTalepleri.upsert(yeni));

      // Şikayet durumunu ilerlet
      if (sk) {
        const tumSik = await Store.sikayetler.all();
        const k = tumSik.find(x => x.id === sk.id);
        if (k && k.durum !== 'cozuldu') {
          k.durum = durum === 'tamamlandi' ? 'cozuldu' : 'servis_planlandi';
          if (durum === 'tamamlandi') { k.cozumTarihi = bugun(); if (!k.cozum) k.cozum = 'yerinde_onarim'; }
          await App.persist(() => Store.sikayetler.save(tumSik));
        }
      }
      App.toast('Servis kaydı kaydedildi' + (durum === 'tamamlandi' ? ' — şikayet çözüldü olarak işaretlendi' : ''), 'ok');
      App.closeModal(); render(main);
    };
  }

  // ── GARANTİ SORGUSU ─────────────────────────────────────────────────────
  function garantiTab(c, d) {
    const teslimEdilen = d.siparisler.filter(s =>
      d.irsaliyeler.some(i => i.siparisId === s.id));
    if (!teslimEdilen.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Teslim edilmiş sipariş yok</div>
        <div class="edesc">Garanti, irsaliye (teslim) tarihinden başlar. Sevkiyat yapıldığında burada listelenir.</div></div></div>`;
      return;
    }
    const satirlar = teslimEdilen.map(s => ({ s, g: garantiDurumu(s.id, d.irsaliyeler) }))
      .sort((a, b) => (a.g.kalanGun || 0) - (b.g.kalanGun || 0));
    const kapsamda = satirlar.filter(x => x.g.kapsamda).length;
    const yakin = satirlar.filter(x => x.g.kapsamda && x.g.kalanGun <= 60).length;

    c.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Garanti Kapsamında</div><div class="kpi-val green">${kapsamda}</div>
          <div class="muted" style="font-size:10.5px">${satirlar.length} teslim edilmiş sipariş</div></div>
        <div class="kpi"><div class="kpi-lbl">Garantisi Bitmek Üzere</div><div class="kpi-val ${yakin ? 'amber' : 'green'}">${yakin}</div>
          <div class="muted" style="font-size:10.5px">60 gün içinde dolacak</div></div>
        <div class="kpi"><div class="kpi-lbl">Garanti Süresi</div><div class="kpi-val blue">${VARSAYILAN_GARANTI_AY} ay</div>
          <div class="muted" style="font-size:10.5px">Mevzuat asgarisi (2 yıl)</div></div>
      </div>
      <div class="card">
        <div class="fhint" style="margin-bottom:8px">Garanti <b>teslim tarihinden</b> (irsaliye) başlar, fatura tarihinden değil. Tüketici mevzuatı mobilyada asgari 2 yıl garanti zorunlu kılar.</div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Sipariş</th><th>Müşteri</th><th>Teslim Tarihi</th><th>Garanti Bitişi</th><th class="r">Kalan</th><th>Durum</th></tr>
          ${satirlar.map(x => `<tr${!x.g.kapsamda ? ' style="opacity:.6"' : x.g.kalanGun <= 60 ? ' style="background:var(--amber-bg)"' : ''}>
            <td class="mono">${App.escapeHtml(x.s.kod)}</td>
            <td>${App.escapeHtml(x.s.musteriAdi || '—')}</td>
            <td class="mono" style="font-size:10.5px">${x.g.teslimTarihi || '—'}</td>
            <td class="mono" style="font-size:10.5px">${x.g.bitisTarihi || '—'}</td>
            <td class="r">${x.g.kapsamda ? `<b>${x.g.kalanGun} gün</b>` : `<span class="muted">${Math.abs(x.g.kalanGun)} gün önce doldu</span>`}</td>
            <td>${x.g.kapsamda
              ? (x.g.kalanGun <= 60 ? '<span class="pill pill-amber" style="font-size:9px">Bitmek üzere</span>' : '<span class="pill pill-green" style="font-size:9px">Kapsamda</span>')
              : '<span class="pill pill-gray" style="font-size:9px">Süresi doldu</span>'}</td>
          </tr>`).join('')}
        </table></div>`;
  }

  return { render, garantiDurumu };
})();
