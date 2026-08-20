// ════════════════════════════════════════════════════════════════════════════
// ÇEK & SENET PORTFÖYÜ — çeklerin TAM YAŞAM DÖNGÜSÜ
//
// Önceden çekler yalnızca "elde" veya "ciro_edildi" olabiliyordu; vadesi gelen
// çek tahsil edilemiyor, karşılıksız çıkan çek cariye geri yazılamıyordu.
// Ayrıca firmanın KENDİ çeki sadece bir ödeme satırıydı — vadesi ve nakit
// çıkışı takip edilemiyordu. Bu ekran ikisini de kapatır:
//
//   MÜŞTERİ ÇEKİ (gelen):  elde ──┬─→ tahsil_edildi   (banka tahsil etti)
//                                 ├─→ ciro_edildi     (tedarikçiye devredildi)
//                                 └─→ karsiliksiz     (cari borcu GERİ YAZILIR)
//
//   FİRMA ÇEKİ (giden):    beklemede ─┬─→ odendi      (vadesinde banka ödedi)
//                                     └─→ iptal
//
// Vade Takvimi sekmesi, gelen ve giden çekleri tarih tarih dizerek NET NAKİT
// projeksiyonu çıkarır — hangi hafta paraya ihtiyaç var, önceden görülür.
// ════════════════════════════════════════════════════════════════════════════
PageModules.cek_portfoy = (() => {
  let activeTab = 'gelen';

  const MUS_DURUM = {
    elde: ['Portföyde', 'pill-blue'],
    tahsil_edildi: ['✓ Tahsil Edildi', 'pill-green'],
    ciro_edildi: ['↗ Ciro Edildi', 'pill-purple'],
    karsiliksiz: ['✗ KARŞILIKSIZ', 'pill-red']
  };
  const FIRMA_DURUM = {
    beklemede: ['Vade Bekliyor', 'pill-amber'],
    odendi: ['✓ Ödendi', 'pill-green'],
    iptal: ['İptal', 'pill-gray']
  };

  const bugun = () => new Date().toISOString().slice(0, 10);
  const gunFarki = (tarih) => Math.round((new Date(tarih) - new Date(bugun())) / 86400000);

  // Vade rozetleri: geçmiş kırmızı, 7 gün içi turuncu
  function vadeRozet(vadeTarihi, kapandiMi) {
    if (!vadeTarihi) return '<span class="muted">—</span>';
    if (kapandiMi) return `<span class="mono" style="font-size:10.5px">${vadeTarihi}</span>`;
    const g = gunFarki(vadeTarihi);
    const renk = g < 0 ? 'pill-red' : g <= 7 ? 'pill-amber' : 'pill-gray';
    const etiket = g < 0 ? Math.abs(g) + ' gün GECİKTİ' : g === 0 ? 'BUGÜN' : g + ' gün kaldı';
    return `<span class="mono" style="font-size:10.5px">${vadeTarihi}</span><br><span class="pill ${renk}" style="font-size:9px">${etiket}</span>`;
  }

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const [musteriCekleri, firmaCekleri] = await Promise.all([
      Store.musteriCekleri.all(), Store.firmaCekleri.all()
    ]);

    // ÖZET: portföydeki gelen, vadesi gelen giden, gecikenler
    const eldekiler = musteriCekleri.filter(c => c.durum === 'elde');
    const eldeToplam = eldekiler.reduce((a, c) => a + (c.tutar || 0), 0);
    const gecikenGelen = eldekiler.filter(c => c.vadeTarihi && c.vadeTarihi < bugun());
    const bekleyenFirma = firmaCekleri.filter(c => c.durum === 'beklemede');
    const firmaToplam = bekleyenFirma.reduce((a, c) => a + (c.tutar || 0), 0);
    const gecikenFirma = bekleyenFirma.filter(c => c.vadeTarihi && c.vadeTarihi < bugun());
    const karsiliksizlar = musteriCekleri.filter(c => c.durum === 'karsiliksiz');

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Çek &amp; Senet Portföyü</div>
        <div class="page-sub">Gelen ve giden çeklerin vade takibi, tahsilat, ciro, karşılıksız işlemleri ve nakit projeksiyonu</div></div>
        <div class="page-acts"><button class="btn btn-blue" id="cp-firma-ekle">+ Kendi Çekimizi Kaydet</button></div>
      </div>
      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Portföydeki Çek (Alacak)</div>
          <div class="kpi-val green">${App.fmtTL(eldeToplam)}</div>
          <div class="muted" style="font-size:10.5px">${eldekiler.length} adet${gecikenGelen.length ? ' · <span style="color:var(--red-text)">' + gecikenGelen.length + ' gecikmiş</span>' : ''}</div></div>
        <div class="kpi"><div class="kpi-lbl">Kendi Çekimiz (Borç)</div>
          <div class="kpi-val red">${App.fmtTL(firmaToplam)}</div>
          <div class="muted" style="font-size:10.5px">${bekleyenFirma.length} adet${gecikenFirma.length ? ' · <span style="color:var(--red-text)">' + gecikenFirma.length + ' gecikmiş</span>' : ''}</div></div>
        <div class="kpi"><div class="kpi-lbl">Net Çek Pozisyonu</div>
          <div class="kpi-val ${eldeToplam - firmaToplam >= 0 ? 'green' : 'red'}">${App.fmtTL(eldeToplam - firmaToplam)}</div>
          <div class="muted" style="font-size:10.5px">Alacak − Borç</div></div>
        <div class="kpi"><div class="kpi-lbl">Karşılıksız Çek</div>
          <div class="kpi-val ${karsiliksizlar.length ? 'red' : 'green'}">${karsiliksizlar.length}</div>
          <div class="muted" style="font-size:10.5px">${App.fmtTL(karsiliksizlar.reduce((a, c) => a + (c.tutar || 0), 0))}</div></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'gelen' ? 'active' : ''}" data-tab="gelen">📥 Müşteri Çekleri (${musteriCekleri.length})</div>
        <div class="tab ${activeTab === 'giden' ? 'active' : ''}" data-tab="giden">📤 Kendi Çeklerimiz (${firmaCekleri.length})</div>
        <div class="tab ${activeTab === 'takvim' ? 'active' : ''}" data-tab="takvim">📅 Vade Takvimi &amp; Nakit Projeksiyonu</div>
      </div>
      <div id="cp-content"></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });
    document.getElementById('cp-firma-ekle').onclick = () => firmaCekiFormu(render, main);

    const content = document.getElementById('cp-content');
    if (activeTab === 'gelen') renderGelenTab(content, musteriCekleri, render, main);
    else if (activeTab === 'giden') renderGidenTab(content, firmaCekleri, render, main);
    else renderTakvimTab(content, musteriCekleri, firmaCekleri);
  }

  // ── SEKME 1: MÜŞTERİ ÇEKLERİ (GELEN) ────────────────────────────────────
  function renderGelenTab(content, cekler, render, main) {
    if (!cekler.length) {
      content.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Portföyde çek yok</div>
        <div class="edesc">Müşteri siparişlerinde çekli ödeme planı onaylandığında çekler otomatik olarak buraya düşer.</div></div></div>`;
      return;
    }
    const sirali = [...cekler].sort((a, b) => {
      const aAcik = a.durum === 'elde' ? 0 : 1, bAcik = b.durum === 'elde' ? 0 : 1;
      if (aAcik !== bAcik) return aAcik - bAcik;
      return (a.vadeTarihi || '').localeCompare(b.vadeTarihi || '');
    });
    content.innerHTML = `<div class="card">
      <div class="fhint" style="margin-bottom:8px">Vadesi gelen çeki <b>✓ Tahsil Et</b> ile kapatın. Banka ödemezse <b>✗ Karşılıksız</b> deyin — tutar müşterinin cari borcuna <b>geri yazılır</b> ve alacak yeniden doğar.</div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Çek No</th><th>Müşteri</th><th class="r">Tutar</th><th>Vade</th><th>Durum</th><th>Not</th><th></th></tr>
        ${sirali.map(c => {
          const [etiket, renk] = MUS_DURUM[c.durum] || [c.durum, 'pill-gray'];
          const kapandi = c.durum !== 'elde';
          return `<tr${c.durum === 'karsiliksiz' ? ' style="background:var(--red-bg)"' : ''}>
            <td class="mono"><b>${App.escapeHtml(c.cekNo || '—')}</b></td>
            <td>${App.escapeHtml(c.musteriAdi || '—')}</td>
            <td class="r"><b>${App.fmtTL(c.tutar || 0)}</b></td>
            <td>${vadeRozet(c.vadeTarihi, kapandi)}</td>
            <td><span class="pill ${renk}" style="font-size:9.5px">${etiket}</span></td>
            <td style="font-size:10px" class="muted">${c.durum === 'ciro_edildi' ? App.escapeHtml(c.ciroEdilenTedarikciAdi || '') + ' · ' + (c.ciroTarihi || '')
              : c.durum === 'tahsil_edildi' ? 'Tahsil: ' + (c.tahsilTarihi || '')
              : c.durum === 'karsiliksiz' ? 'Cariye geri yazıldı · ' + (c.karsiliksizTarihi || '') : ''}</td>
            <td style="display:flex;gap:4px">${c.durum === 'elde' ? `
              <button class="btn btn-sm btn-green cp-tahsil" data-id="${c.id}">✓ Tahsil Et</button>
              <button class="btn btn-sm btn-red cp-karsiliksiz" data-id="${c.id}">✗ Karşılıksız</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </table></div>`;

    // TAHSİL ET: çek kapanır, gerçek tahsilat kaydı oluşur (nakit girişi)
    content.querySelectorAll('.cp-tahsil').forEach(b => b.onclick = async () => {
      const cek = cekler.find(c => c.id === b.dataset.id);
      App.confirmDialog(
        `<b>${App.escapeHtml(cek.cekNo || '—')}</b> numaralı ${App.fmtTL(cek.tutar)} tutarındaki çek TAHSİL EDİLDİ olarak işaretlenecek.<br><br>` +
        `Müşteri: ${App.escapeHtml(cek.musteriAdi || '')} · Vade: ${cek.vadeTarihi || '—'}<br><br>` +
        `Çek portföyden düşecek ve tahsilat kaydı oluşturulacak (nakit girişi). Onaylıyor musunuz?`,
        async () => {
          const [tumCekler, tahsilatlar] = await Promise.all([Store.musteriCekleri.all(), Store.tahsilatlar.all()]);
          const k = tumCekler.find(x => x.id === cek.id);
          if (!k) return;
          k.durum = 'tahsil_edildi';
          k.tahsilTarihi = bugun();
          tahsilatlar.push({
            id: App.uid('TAH'), tarih: bugun(), musteriId: k.musteriId, musteriAdi: k.musteriAdi,
            tip: 'cek_tahsil', detay: 'Çek tahsil edildi — Çek No: ' + (k.cekNo || '—') + ', Vade: ' + (k.vadeTarihi || '—'),
            tutar: k.tutar, kaynakCekId: k.id
          });
          await App.persist(async () => {
            await Store.musteriCekleri.save(tumCekler);
            await Store.tahsilatlar.save(tahsilatlar);
          });
          App.toast('✓ Çek tahsil edildi: ' + App.fmtTL(k.tutar), 'ok');
          render(main);
        });
    });

    // KARŞILIKSIZ: cari borcu geri yazılır
    content.querySelectorAll('.cp-karsiliksiz').forEach(b => b.onclick = async () => {
      const cek = cekler.find(c => c.id === b.dataset.id);
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:10px">
          <b>${App.escapeHtml(cek.cekNo || '—')}</b> · ${App.fmtTL(cek.tutar)} · ${App.escapeHtml(cek.musteriAdi || '')}<br>
          Çek karşılıksız işaretlenince <b>tutar müşterinin cari borcuna geri eklenir</b> — alacak yeniden doğar ve cari ekstrede görünür.</div>
        <div class="fgroup"><label class="flbl">Açıklama / Banka Notu</label>
          <textarea class="ftextarea" id="ck-not" placeholder="örn. yetersiz bakiye, hesap kapalı"></textarea></div>`;
      App.openModal({ title: '✗ Karşılıksız Çek', body,
        footer: `<button class="btn" id="ck-cancel">Vazgeç</button><button class="btn btn-red" id="ck-ok">Karşılıksız Olarak İşle</button>`, wide: true });
      document.getElementById('ck-cancel').onclick = App.closeModal;
      document.getElementById('ck-ok').onclick = async () => {
        const not = document.getElementById('ck-not').value.trim();
        const [tumCekler, musteriler] = await Promise.all([Store.musteriCekleri.all(), Store.musteriler.all()]);
        const k = tumCekler.find(x => x.id === cek.id);
        if (!k) return;
        k.durum = 'karsiliksiz';
        k.karsiliksizTarihi = bugun();
        k.karsiliksizNot = not;
        // CARİ GERİ YAZMA: tahsil edilmiş sayılan tutar tekrar borç olur
        const mus = musteriler.find(m => m.id === k.musteriId);
        if (mus) mus.bakiye = (mus.bakiye || 0) + (k.tutar || 0);
        await App.persist(async () => {
          await Store.musteriCekleri.save(tumCekler);
          await Store.musteriler.save(musteriler);
        });
        App.toast('Karşılıksız işlendi — ' + App.fmtTL(k.tutar) + ' müşterinin cari borcuna geri yazıldı', 'ok');
        App.closeModal();
        render(main);
      };
    });
  }

  // ── SEKME 2: KENDİ ÇEKLERİMİZ (GİDEN) ───────────────────────────────────
  function renderGidenTab(content, cekler, render, main) {
    if (!cekler.length) {
      content.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Kendi çekimiz yok</div>
        <div class="edesc">Muhasebe → Tedarikçi Ödemeleri'nden "Kendi Çekimizle Öde" seçildiğinde çekler otomatik buraya düşer. Manuel kayıt için üstteki butonu kullanın.</div></div></div>`;
      return;
    }
    const sirali = [...cekler].sort((a, b) => {
      const aAcik = a.durum === 'beklemede' ? 0 : 1, bAcik = b.durum === 'beklemede' ? 0 : 1;
      if (aAcik !== bAcik) return aAcik - bAcik;
      return (a.vadeTarihi || '').localeCompare(b.vadeTarihi || '');
    });
    content.innerHTML = `<div class="card">
      <div class="fhint" style="margin-bottom:8px">Vadesi gelen kendi çekimiz bankadan ödendiğinde <b>✓ Ödendi</b> ile kapatın. Bekleyen çekler nakit projeksiyonunda <b>çıkış</b> olarak görünür.</div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Çek No</th><th>Tedarikçi</th><th class="r">Tutar</th><th>Vade</th><th>Durum</th><th></th></tr>
        ${sirali.map(c => {
          const [etiket, renk] = FIRMA_DURUM[c.durum] || [c.durum, 'pill-gray'];
          return `<tr>
            <td class="mono"><b>${App.escapeHtml(c.cekNo || '—')}</b></td>
            <td>${App.escapeHtml(c.tedarikciAdi || '—')}</td>
            <td class="r"><b>${App.fmtTL(c.tutar || 0)}</b></td>
            <td>${vadeRozet(c.vadeTarihi, c.durum !== 'beklemede')}</td>
            <td><span class="pill ${renk}" style="font-size:9.5px">${etiket}</span>${c.odemeTarihi ? `<br><span class="muted" style="font-size:9.5px">${c.odemeTarihi}</span>` : ''}</td>
            <td>${c.durum === 'beklemede' ? `<button class="btn btn-sm btn-green cp-odendi" data-id="${c.id}">✓ Ödendi</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </table></div>`;

    content.querySelectorAll('.cp-odendi').forEach(b => b.onclick = async () => {
      const cek = cekler.find(c => c.id === b.dataset.id);
      App.confirmDialog(
        `<b>${App.escapeHtml(cek.cekNo || '—')}</b> · ${App.fmtTL(cek.tutar)} · ${App.escapeHtml(cek.tedarikciAdi || '')}<br><br>Çek bankadan ödendi olarak işaretlenecek ve nakit çıkış projeksiyonundan düşecek. Onaylıyor musunuz?`,
        async () => {
          const tumu = await Store.firmaCekleri.all();
          const k = tumu.find(x => x.id === cek.id);
          if (!k) return;
          k.durum = 'odendi';
          k.odemeTarihi = bugun();
          await App.persist(() => Store.firmaCekleri.save(tumu));
          App.toast('✓ Kendi çekimiz ödendi: ' + App.fmtTL(k.tutar), 'ok');
          render(main);
        });
    });
  }

  // ── SEKME 3: VADE TAKVİMİ & NAKİT PROJEKSİYONU ──────────────────────────
  function renderTakvimTab(content, musteriCekleri, firmaCekleri) {
    const gelen = musteriCekleri.filter(c => c.durum === 'elde' && c.vadeTarihi)
      .map(c => ({ tarih: c.vadeTarihi, tutar: c.tutar || 0, yon: 'giris', kim: c.musteriAdi, no: c.cekNo }));
    const giden = firmaCekleri.filter(c => c.durum === 'beklemede' && c.vadeTarihi)
      .map(c => ({ tarih: c.vadeTarihi, tutar: c.tutar || 0, yon: 'cikis', kim: c.tedarikciAdi, no: c.cekNo }));
    const tumu = [...gelen, ...giden].sort((a, b) => a.tarih.localeCompare(b.tarih));

    if (!tumu.length) {
      content.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Vadesi bekleyen çek yok</div>
        <div class="edesc">Portföyde açık çek olmadığı için projeksiyon oluşturulamadı.</div></div></div>`;
      return;
    }

    // Aya göre grupla + kümülatif net pozisyon
    const aylar = new Map();
    tumu.forEach(x => {
      const ay = x.tarih.slice(0, 7);
      if (!aylar.has(ay)) aylar.set(ay, { ay, giris: 0, cikis: 0, kalemler: [] });
      const g = aylar.get(ay);
      if (x.yon === 'giris') g.giris += x.tutar; else g.cikis += x.tutar;
      g.kalemler.push(x);
    });
    let kumulatif = 0;
    const satirlar = [...aylar.values()].map(a => {
      const net = a.giris - a.cikis;
      kumulatif += net;
      return { ...a, net, kumulatif };
    });
    const AY_AD = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    const ayYaz = (ay) => { const [y, m] = ay.split('-'); return AY_AD[parseInt(m) - 1] + ' ' + y; };

    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">📅 Aylık Çek Nakit Projeksiyonu</div></div>
      <div class="fhint" style="margin-bottom:8px">Portföydeki müşteri çekleri <b>giriş</b>, kendi çeklerimiz <b>çıkış</b> olarak vadelerine göre dizilir. Kümülatif sütunu negatife düşen ay, <b>nakit sıkışıklığı</b> demektir.</div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Dönem</th><th class="r">Çek Girişi</th><th class="r">Çek Çıkışı</th><th class="r">Net</th><th class="r">Kümülatif</th><th>Durum</th></tr>
        ${satirlar.map(a => `<tr${a.kumulatif < 0 ? ' style="background:var(--red-bg)"' : ''}>
          <td><b>${ayYaz(a.ay)}</b></td>
          <td class="r" style="color:var(--green-text)">${a.giris ? App.fmtTL(a.giris) : '—'}</td>
          <td class="r" style="color:var(--red-text)">${a.cikis ? App.fmtTL(a.cikis) : '—'}</td>
          <td class="r"><b>${App.fmtTL(a.net)}</b></td>
          <td class="r"><b style="color:var(--${a.kumulatif >= 0 ? 'green' : 'red'}-text)">${App.fmtTL(a.kumulatif)}</b></td>
          <td>${a.kumulatif < 0
            ? '<span class="pill pill-red" style="font-size:9px">⚠ Nakit açığı</span>'
            : '<span class="pill pill-green" style="font-size:9px">Pozitif</span>'}</td>
        </tr>`).join('')}
      </table></div>`;

    // Yaklaşan 30 gün detayı
    const otuzGun = tumu.filter(x => gunFarki(x.tarih) <= 30);
    if (otuzGun.length) {
      html += `<div class="card"><div class="card-hdr"><div class="card-title">⏰ Önümüzdeki 30 Gün — Vade Detayı</div></div>
        <table class="dtable" style="font-size:11px">
          <tr><th>Vade</th><th>Yön</th><th>Çek No</th><th>Taraf</th><th class="r">Tutar</th></tr>
          ${otuzGun.map(x => `<tr${gunFarki(x.tarih) < 0 ? ' style="background:var(--red-bg)"' : ''}>
            <td>${vadeRozet(x.tarih, false)}</td>
            <td>${x.yon === 'giris' ? '<span class="pill pill-green" style="font-size:9px">📥 Giriş</span>' : '<span class="pill pill-red" style="font-size:9px">📤 Çıkış</span>'}</td>
            <td class="mono">${App.escapeHtml(x.no || '—')}</td>
            <td>${App.escapeHtml(x.kim || '—')}</td>
            <td class="r"><b>${App.fmtTL(x.tutar)}</b></td>
          </tr>`).join('')}
        </table></div>`;
    }
    content.innerHTML = html;
  }

  // ── KENDİ ÇEKİMİZ MANUEL KAYIT ──────────────────────────────────────────
  async function firmaCekiFormu(render, main) {
    const tedarikciler = await Store.tedarikciler.all();
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Tedarikçiye verdiğiniz kendi çekinizi kaydedin — vadesi geldiğinde nakit çıkışı olarak projeksiyonda görünür.</div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Çek No <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="fc-no" placeholder="örn. 0012345"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Tutar (TL) <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="fc-tutar" type="number" min="0" step="0.01"></div>
      </div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Vade Tarihi <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="fc-vade" type="date"></div>
        <div class="fgroup" style="flex:1.4"><label class="flbl">Tedarikçi</label>
          <select class="fselect" id="fc-tedarikci">
            <option value="">— Seçilmedi —</option>
            ${tedarikciler.map(t => `<option value="${t.id}">${App.escapeHtml(t.unvan)}</option>`).join('')}
          </select></div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><input class="finput" id="fc-aciklama"></div>`;
    App.openModal({ title: '📤 Kendi Çekimizi Kaydet', body,
      footer: `<button class="btn" id="fc-cancel">Vazgeç</button><button class="btn btn-blue" id="fc-ok">Kaydet</button>`, wide: true });
    document.getElementById('fc-cancel').onclick = App.closeModal;
    document.getElementById('fc-ok').onclick = async () => {
      const no = document.getElementById('fc-no').value.trim();
      const tutar = parseFloat(document.getElementById('fc-tutar').value) || 0;
      const vade = document.getElementById('fc-vade').value;
      if (!no || tutar <= 0 || !vade) { App.toast('Çek no, tutar ve vade zorunlu', 'err'); return; }
      const tedId = document.getElementById('fc-tedarikci').value;
      const ted = tedarikciler.find(t => t.id === tedId);
      const tumu = await Store.firmaCekleri.all();
      tumu.push({
        id: App.uid('FCK'), cekNo: no, tutar, vadeTarihi: vade,
        tedarikciId: tedId || null, tedarikciAdi: ted ? ted.unvan : '—',
        aciklama: document.getElementById('fc-aciklama').value.trim(),
        durum: 'beklemede', olusturmaTarihi: bugun()
      });
      await App.persist(() => Store.firmaCekleri.save(tumu));
      App.toast('Kendi çekimiz kaydedildi: ' + App.fmtTL(tutar) + ' — vade ' + vade, 'ok');
      App.closeModal();
      render(main);
    };
  }

  return { render };
})();
