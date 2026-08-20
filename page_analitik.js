// ════════════════════════════════════════════════════════════════════════════
// ANALİTİK RAPORLAR — GAP analizindeki rapor boşluklarını kapatan merkez ekran.
// Tüm veriler mevcut kayıtlardan türetilir; ek veri girişi gerektirmez.
// ════════════════════════════════════════════════════════════════════════════
PageModules.analitik = (() => {
  let activeTab = 'karlilik';
  let veri = null;
  let param = { saatlikIscilik: 250, genelGiderYuzde: 15 };

  const yuzde = (x, basamak) => x === null || x === undefined ? '—' : '%' + App.fmt(x * 100, basamak === undefined ? 1 : basamak);
  const paretoCubuk = (oran, renk) => `<div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
    <div style="height:100%;width:${Math.min(100, oran * 100)}%;background:var(--${renk || 'blue'})"></div></div>`;

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Analitik Raporlar</div>
        <div class="page-sub">Kârlılık, yaşlandırma, teslimat performansı, kök neden ve malzeme verimi analizleri</div></div>
        <div class="page-acts">
          <button class="btn" id="an-param">⚙ Maliyet Parametreleri</button>
          <button class="btn btn-blue" id="an-yenile">↻ Yenile</button></div>
      </div>
      <div class="tabs" style="flex-wrap:wrap">
        <div class="tab ${activeTab === 'karlilik' ? 'active' : ''}" data-tab="karlilik">💰 Kârlılık</div>
        <div class="tab ${activeTab === 'yaslandirma' ? 'active' : ''}" data-tab="yaslandirma">📅 Yaşlandırma</div>
        <div class="tab ${activeTab === 'mali' ? 'active' : ''}" data-tab="mali">📈 Mali KPI</div>
        <div class="tab ${activeTab === 'teslimat' ? 'active' : ''}" data-tab="teslimat">🚚 Teslimat (OTIF)</div>
        <div class="tab ${activeTab === 'pareto' ? 'active' : ''}" data-tab="pareto">🔍 Kök Neden</div>
        <div class="tab ${activeTab === 'stok' ? 'active' : ''}" data-tab="stok">📦 Stok & Ölü Stok</div>
        <div class="tab ${activeTab === 'malzeme' ? 'active' : ''}" data-tab="malzeme">🪵 Malzeme Verimi</div>
        <div class="tab ${activeTab === 'huni' ? 'active' : ''}" data-tab="huni">🎯 Satış Hunisi</div>
      </div>
      <div id="an-content"><div style="padding:40px;text-align:center"><div class="loading-spin" style="margin:0 auto"></div></div></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; ciz(main); });
    document.getElementById('an-yenile').onclick = () => { veri = null; render(main); };
    document.getElementById('an-param').onclick = () => parametreModal(main);

    if (!veri) veri = await AnalitikMotor.tumAnaliz(param);
    ciz(main);
  }

  function ciz(main) {
    const c = document.getElementById('an-content');
    if (!c) return;
    if (activeTab === 'karlilik') karlilikTab(c);
    else if (activeTab === 'yaslandirma') yaslandirmaTab(c);
    else if (activeTab === 'mali') maliTab(c);
    else if (activeTab === 'teslimat') teslimatTab(c);
    else if (activeTab === 'pareto') paretoTab(c);
    else if (activeTab === 'stok') stokTab(c);
    else if (activeTab === 'malzeme') malzemeTab(c);
    else huniTab(c);
  }

  function parametreModal(main) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Kârlılık hesabı bu parametreleri kullanır. Şirket muhasebenizden aldığınız gerçek değerleri girin — varsayılanlar sektör ortalamasıdır.</div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Saatlik İşçilik Maliyeti (TL)</label>
          <input class="finput" id="ap-iscilik" type="number" min="0" value="${param.saatlikIscilik}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Genel Gider Oranı (%)</label>
          <input class="finput" id="ap-gg" type="number" min="0" max="100" value="${param.genelGiderYuzde}">
          <div class="fhint">Doğrudan maliyet üzerine eklenir (kira, enerji, yönetim gideri vb.)</div></div>
      </div>`;
    App.openModal({ title: '⚙ Maliyet Parametreleri', body,
      footer: `<button class="btn" id="ap-cancel">Vazgeç</button><button class="btn btn-blue" id="ap-ok">Uygula</button>`, wide: true });
    document.getElementById('ap-cancel').onclick = App.closeModal;
    document.getElementById('ap-ok').onclick = () => {
      param.saatlikIscilik = parseFloat(document.getElementById('ap-iscilik').value) || 0;
      param.genelGiderYuzde = parseFloat(document.getElementById('ap-gg').value) || 0;
      App.closeModal(); veri = null; render(main);
    };
  }

  // ── KÂRLILIK ────────────────────────────────────────────────────────────
  function karlilikTab(c) {
    const k = veri.karlilik, mk = veri.musteriKarlilik, uk = veri.urunKarlilik;
    const toplamGelir = k.reduce((a, r) => a + r.gelir, 0);
    const toplamKar = k.reduce((a, r) => a + r.kar, 0);
    const zararlilar = k.filter(r => r.kar < 0);
    const zayifVeri = k.filter(r => r.veriKalitesi < 2).length;

    let html = `<div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Ciro</div><div class="kpi-val blue">${App.fmtTL(toplamGelir)}</div>
        <div class="muted" style="font-size:10.5px">${k.length} sipariş</div></div>
      <div class="kpi"><div class="kpi-lbl">Brüt Kâr</div><div class="kpi-val ${toplamKar >= 0 ? 'green' : 'red'}">${App.fmtTL(toplamKar)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Brüt Marj</div><div class="kpi-val ${toplamGelir > 0 && toplamKar / toplamGelir >= 0.2 ? 'green' : 'amber'}">${yuzde(toplamGelir > 0 ? toplamKar / toplamGelir : null)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Zararına Sipariş</div><div class="kpi-val ${zararlilar.length ? 'red' : 'green'}">${zararlilar.length}</div>
        <div class="muted" style="font-size:10.5px">${App.fmtTL(zararlilar.reduce((a, r) => a + r.kar, 0))}</div></div>
    </div>`;

    if (zayifVeri) {
      html += `<div class="card" style="border:1px solid var(--amber);background:var(--amber-bg);margin-bottom:12px">
        <div style="font-size:11.5px">⚠ <b>${zayifVeri} siparişte veri eksik.</b> Reçetesi olmayan ürünlerde malzeme maliyeti, istasyon takibi yapılmamış işlerde işçilik maliyeti hesaplanamaz — bu siparişlerin kârı olduğundan yüksek görünür.</div></div>`;
    }

    if (zararlilar.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🔴 Zararına Satılan Siparişler</div>
        <table class="dtable" style="font-size:11px;margin-top:6px">
          <tr><th>Sipariş</th><th>Müşteri</th><th class="r">Gelir</th><th class="r">Maliyet</th><th class="r">Zarar</th><th class="r">Marj</th></tr>
          ${zararlilar.slice(0, 10).map(r => `<tr>
            <td class="mono">${App.escapeHtml(r.kod)}</td><td>${App.escapeHtml(r.musteriAdi)}</td>
            <td class="r">${App.fmtTL(r.gelir)}</td><td class="r">${App.fmtTL(r.toplamMaliyet)}</td>
            <td class="r"><b style="color:var(--red-text)">${App.fmtTL(r.kar)}</b></td>
            <td class="r">${yuzde(r.marj)}</td></tr>`).join('')}
        </table></div>`;
    }

    html += `<div class="card"><div class="card-hdr"><div class="card-title">💰 Sipariş Bazlı Kârlılık</div></div>
      <div style="max-height:380px;overflow:auto">
      <table class="dtable" style="font-size:11px">
        <tr><th>Sipariş</th><th>Müşteri</th><th class="r">Gelir</th><th class="r">Malzeme</th><th class="r">İşçilik</th>
        <th class="r">Fire</th><th class="r">Gen.Gider</th><th class="r">Kâr</th><th class="r">Marj</th><th>Veri</th></tr>
        ${k.map(r => `<tr>
          <td class="mono">${App.escapeHtml(r.kod)}</td>
          <td>${App.escapeHtml(r.musteriAdi)}</td>
          <td class="r">${App.fmtTL(r.gelir)}</td>
          <td class="r">${App.fmtTL(r.malzeme)}</td>
          <td class="r">${App.fmtTL(r.iscilik)}</td>
          <td class="r" style="color:var(--red-text)">${r.fireMaliyet ? App.fmtTL(r.fireMaliyet) : '—'}</td>
          <td class="r muted">${App.fmtTL(r.genelGider)}</td>
          <td class="r"><b style="color:var(--${r.kar >= 0 ? 'green' : 'red'}-text)">${App.fmtTL(r.kar)}</b></td>
          <td class="r">${yuzde(r.marj)}</td>
          <td>${r.veriKalitesi === 2 ? '<span class="pill pill-green" style="font-size:8.5px">Tam</span>'
            : r.veriKalitesi === 1 ? '<span class="pill pill-amber" style="font-size:8.5px">Kısmi</span>'
            : '<span class="pill pill-red" style="font-size:8.5px">Zayıf</span>'}</td>
        </tr>`).join('')}
      </table></div></div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">👤 Müşteri Kârlılığı</div></div>
      <div class="fhint" style="margin-bottom:6px">En çok ciro yapan müşteri, en çok kâr bırakan müşteri olmayabilir. İadeler düşülmüştür.</div>
      <table class="dtable" style="font-size:11px">
        <tr><th>Müşteri</th><th class="r">Sipariş</th><th class="r">Ciro</th><th class="r">Maliyet</th><th class="r">İade</th><th class="r">Net Kâr</th><th class="r">Marj</th></tr>
        ${mk.slice(0, 20).map(m => `<tr>
          <td><b>${App.escapeHtml(m.musteriAdi)}</b></td>
          <td class="r">${m.siparisSayisi}</td>
          <td class="r">${App.fmtTL(m.gelir)}</td>
          <td class="r">${App.fmtTL(m.maliyet)}</td>
          <td class="r">${m.iade ? App.fmtTL(m.iade) : '—'}</td>
          <td class="r"><b style="color:var(--${m.netKar >= 0 ? 'green' : 'red'}-text)">${App.fmtTL(m.netKar)}</b></td>
          <td class="r">${yuzde(m.marj)}</td></tr>`).join('')}
      </table></div>`;

    const aSayi = uk.filter(u => u.abc === 'A').length;
    html += `<div class="card"><div class="card-hdr"><div class="card-title">📦 Ürün Kârlılığı & ABC Analizi</div>
      <span class="pill pill-blue" style="font-size:10px">${aSayi} ürün cironun %80'ini üretiyor</span></div>
      <div style="max-height:340px;overflow:auto">
      <table class="dtable" style="font-size:11px">
        <tr><th>Sınıf</th><th>Ürün</th><th class="r">Adet</th><th class="r">Ciro</th><th class="r">Kâr</th><th class="r">Marj</th><th class="r">Kümülatif</th></tr>
        ${uk.slice(0, 40).map(u => `<tr>
          <td><span class="pill ${u.abc === 'A' ? 'pill-green' : u.abc === 'B' ? 'pill-amber' : 'pill-gray'}" style="font-size:9px">${u.abc}</span></td>
          <td><b class="mono" style="font-size:10px">${App.escapeHtml(u.kod)}</b><br><span class="muted" style="font-size:9.5px">${App.escapeHtml((u.ad || '').slice(0, 34))}</span></td>
          <td class="r">${App.fmt(u.adet, 0)}</td>
          <td class="r">${App.fmtTL(u.gelir)}</td>
          <td class="r" style="color:var(--${u.kar >= 0 ? 'green' : 'red'}-text)">${App.fmtTL(u.kar)}</td>
          <td class="r">${yuzde(u.marj)}</td>
          <td class="r muted">${yuzde(u.kumulatifOran, 0)}</td></tr>`).join('')}
      </table></div></div>`;
    c.innerHTML = html;
  }

  // ── YAŞLANDIRMA ─────────────────────────────────────────────────────────
  function yaslandirmaTab(c) {
    const a = veri.alacak, b = veri.borc;
    const kovaTablo = (ozet, toplam, renkTers) => `<table class="dtable" style="font-size:11.5px">
      <tr><th>Vade Aralığı</th><th class="r">Adet</th><th class="r">Tutar</th><th>Pay</th></tr>
      ${ozet.map((k, i) => {
        const oran = toplam > 0 ? k.tutar / toplam : 0;
        const renk = i === 0 ? 'green' : i === 1 ? 'blue' : i === 2 ? 'amber' : 'red';
        return `<tr><td><b>${k.ad}</b></td><td class="r">${k.adet}</td>
          <td class="r"><b>${App.fmtTL(k.tutar)}</b></td>
          <td style="min-width:140px">${paretoCubuk(oran, renk)}<span class="muted" style="font-size:9.5px">${yuzde(oran, 0)}</span></td></tr>`;
      }).join('')}
      <tr style="background:var(--bg)"><td><b>TOPLAM</b></td><td class="r"></td><td class="r"><b>${App.fmtTL(toplam)}</b></td><td></td></tr>
    </table>`;

    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Alacak</div><div class="kpi-val blue">${App.fmtTL(a.toplam)}</div>
        <div class="muted" style="font-size:10.5px">${a.satirlar.length} açık fatura</div></div>
      <div class="kpi"><div class="kpi-lbl">90+ Gün Riskli Alacak</div><div class="kpi-val ${a.riskli > 0 ? 'red' : 'green'}">${App.fmtTL(a.riskli)}</div>
        <div class="muted" style="font-size:10.5px">Tahsilat riski yüksek</div></div>
      <div class="kpi"><div class="kpi-lbl">Toplam Borç</div><div class="kpi-val amber">${App.fmtTL(b.toplam)}</div>
        <div class="muted" style="font-size:10.5px">${b.satirlar.length} açık sipariş</div></div>
    </div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">📥 Alacak Yaşlandırma</div></div>
      ${kovaTablo(a.ozet, a.toplam)}</div>`;

    if (a.musteriler.length) {
      html += `<div class="card"><div class="card-hdr"><div class="card-title">Müşteri Bazlı Alacak</div></div>
        <table class="dtable" style="font-size:11px">
          <tr><th>Müşteri</th>${['Vadesi Gelmedi', '0-30 gün', '31-60 gün', '61-90 gün', '90+ gün'].map(k => `<th class="r">${k}</th>`).join('')}<th class="r">Toplam</th></tr>
          ${a.musteriler.slice(0, 20).map(m => `<tr>
            <td><b>${App.escapeHtml(m.musteriAdi)}</b></td>
            ${['Vadesi Gelmedi', '0-30 gün', '31-60 gün', '61-90 gün', '90+ gün'].map(k =>
              `<td class="r"${k === '90+ gün' && m.kovalar[k] ? ' style="color:var(--red-text);font-weight:700"' : ''}>${m.kovalar[k] ? App.fmtTL(m.kovalar[k]) : '—'}</td>`).join('')}
            <td class="r"><b>${App.fmtTL(m.toplam)}</b></td></tr>`).join('')}
        </table></div>`;
    }

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Açık Fatura Detayı</div></div>
      <div style="max-height:340px;overflow:auto">
      <table class="dtable" style="font-size:11px">
        <tr><th>Fatura</th><th>Müşteri</th><th>Vade</th><th class="r">Gecikme</th><th class="r">Tutar</th><th class="r">Ödenen</th><th class="r">Bakiye</th></tr>
        ${a.satirlar.slice(0, 60).map(s => `<tr${s.gecikmeGun > 90 ? ' style="background:var(--red-bg)"' : ''}>
          <td class="mono">${App.escapeHtml(s.faturaNo || '—')}</td>
          <td>${App.escapeHtml(s.musteriAdi)}</td>
          <td class="mono" style="font-size:10px">${s.vadeTarihi || '—'}</td>
          <td class="r">${s.gecikmeGun > 0 ? `<b style="color:var(--red-text)">${s.gecikmeGun} gün</b>` : '<span class="muted">—</span>'}</td>
          <td class="r">${App.fmtTL(s.tutar)}</td>
          <td class="r muted">${s.odenen ? App.fmtTL(s.odenen) : '—'}</td>
          <td class="r"><b>${App.fmtTL(s.bakiye)}</b></td></tr>`).join('')}
      </table></div></div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">📤 Borç Yaşlandırma (Tedarikçi)</div></div>
      ${kovaTablo(b.ozet, b.toplam)}</div>`;
    c.innerHTML = html;
  }

  // ── MALİ KPI ────────────────────────────────────────────────────────────
  function maliTab(c) {
    const m = veri.mali;
    const kart = (baslik, deger, alt, renk, aciklama) => `
      <div class="kpi"><div class="kpi-lbl">${baslik}</div>
        <div class="kpi-val ${renk}">${deger}</div>
        <div class="muted" style="font-size:10.5px">${alt}</div>
        ${aciklama ? `<div class="muted" style="font-size:9.5px;margin-top:4px;font-style:italic">${aciklama}</div>` : ''}</div>`;
    const cccRenk = m.ccc <= 30 ? 'green' : m.ccc <= 60 ? 'amber' : 'red';

    c.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:14px">
        ${kart('Brüt Kâr Marjı', yuzde(m.brutMarj), App.fmtTL(m.brutKar) + ' / ' + App.fmtTL(m.toplamGelir),
          m.brutMarj >= 0.25 ? 'green' : m.brutMarj >= 0.15 ? 'amber' : 'red', 'Mobilyada sağlıklı aralık: %25–35')}
        ${kart('DSO — Ort. Tahsilat Süresi', m.dso + ' gün', 'Alacak / günlük satış',
          m.dso <= 45 ? 'green' : m.dso <= 75 ? 'amber' : 'red', 'Düşük olması iyidir')}
        ${kart('DPO — Ort. Ödeme Süresi', m.dpo + ' gün', 'Borç / günlük alış',
          m.dpo >= 45 ? 'green' : 'amber', 'Yüksek olması nakit avantajıdır')}
      </div>
      <div class="grid grid-3" style="margin-bottom:14px">
        ${kart('Stok Devir Hızı', App.fmt(m.stokDevirHizi, 1) + ' kez/yıl', App.fmtTL(m.stokDegeri) + ' stok değeri',
          m.stokDevirHizi >= 4 ? 'green' : m.stokDevirHizi >= 2 ? 'amber' : 'red', 'Mobilyada hedef: 4–6')}
        ${kart('Stokta Bekleme', m.stokDevirGun + ' gün', 'Ortalama stok tutma süresi',
          m.stokDevirGun <= 60 ? 'green' : m.stokDevirGun <= 120 ? 'amber' : 'red')}
        ${kart('Nakit Döngüsü (CCC)', m.ccc + ' gün', 'DSO + Stok Günü − DPO', cccRenk,
          'İşletme sermayesi ihtiyacınızın süresi')}
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">📈 Nakit Döngüsü Açıklaması</div></div>
        <div style="font-size:12px;line-height:1.7">
          Nakit döngüsü, <b>paranızın kasadan çıkıp tekrar kasaya dönmesi</b> için geçen süredir:<br><br>
          <b>${m.dso} gün</b> (müşteriden tahsilat) <b>+ ${m.stokDevirGun} gün</b> (stokta bekleme)
          <b>− ${m.dpo} gün</b> (tedarikçiye ödeme) <b>= ${m.ccc} gün</b><br><br>
          ${m.ccc > 60
            ? '<span style="color:var(--red-text)">⚠ Döngü uzun. Bu süre boyunca işletme sermayesi bağlı kalıyor — kredi ihtiyacı doğurur. Tahsilat süresini kısaltmak veya tedarikçi vadesini uzatmak gerekir.</span>'
            : m.ccc > 30
            ? '<span style="color:var(--amber-text)">Döngü kabul edilebilir seviyede, ancak iyileştirme alanı var.</span>'
            : '<span style="color:var(--green-text)">✓ Döngü kısa — nakit yönetimi sağlıklı.</span>'}
        </div>
        <div class="fhint" style="margin-top:10px">Hesaplar sistemdeki sipariş, fatura, tahsilat ve stok verisine dayanır; resmi mali tablo yerine geçmez. Günlük ortalamalar, verinin kapsadığı <b>${m.donemGun} günlük</b> dönem üzerinden hesaplanmıştır.</div>
      </div>`;
  }

  // ── TESLİMAT (OTIF) ─────────────────────────────────────────────────────
  function teslimatTab(c) {
    const t = veri.teslimat;
    let html = `<div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">OTIF</div>
        <div class="kpi-val ${t.otifOrani === null ? 'gray' : t.otifOrani >= 0.95 ? 'green' : t.otifOrani >= 0.85 ? 'amber' : 'red'}">${yuzde(t.otifOrani)}</div>
        <div class="muted" style="font-size:10.5px">Zamanında VE eksiksiz</div></div>
      <div class="kpi"><div class="kpi-lbl">Zamanında Teslim</div>
        <div class="kpi-val ${t.zamanindaOrani === null ? 'gray' : t.zamanindaOrani >= 0.95 ? 'green' : 'amber'}">${yuzde(t.zamanindaOrani)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Ort. Teslim Süresi</div>
        <div class="kpi-val blue">${t.ortLeadTime !== null ? App.fmt(t.ortLeadTime, 1) + ' gün' : '—'}</div>
        <div class="muted" style="font-size:10.5px">Sipariş → teslim</div></div>
      <div class="kpi"><div class="kpi-lbl">Ort. Termin Sapması</div>
        <div class="kpi-val ${t.ortSapma === null ? 'gray' : t.ortSapma <= 0 ? 'green' : 'red'}">${t.ortSapma !== null ? (t.ortSapma > 0 ? '+' : '') + App.fmt(t.ortSapma, 1) + ' gün' : '—'}</div></div>
    </div>`;

    if (t.otifOrani !== null && t.otifOrani < 0.85) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div style="font-size:12px">🔴 <b>OTIF hedefin altında.</b> Sektör standardı %95'tir. Her 100 teslimattan ${Math.round((1 - t.otifOrani) * 100)}'i müşteri beklentisini karşılamıyor — bu, müşteri kaybının en yaygın sebebidir.</div></div>`;
    }

    html += `<div class="card"><div class="card-hdr"><div class="card-title">🚚 Teslimat Detayı</div>
      <span class="pill pill-blue" style="font-size:10px">${t.olculebilirSayi}/${t.toplamTeslim} ölçülebilir</span></div>
      <div class="fhint" style="margin-bottom:6px">OTIF hesabı için hem <b>üretim termini</b> hem de <b>irsaliye</b> kaydı gerekir. İkisi eksik olan siparişler ölçüme dahil edilmez.</div>
      <div style="max-height:400px;overflow:auto">
      <table class="dtable" style="font-size:11px">
        <tr><th>Sipariş</th><th>Müşteri</th><th>Sipariş T.</th><th>Termin</th><th>Teslim</th>
        <th class="r">Sapma</th><th class="r">Süre</th><th>Zamanında</th><th>Eksiksiz</th><th>OTIF</th></tr>
        ${t.satirlar.slice(0, 60).map(r => `<tr${r.otif === false && r.zamanindaMi !== null ? ' style="background:var(--red-bg)"' : ''}>
          <td class="mono">${App.escapeHtml(r.kod)}</td>
          <td>${App.escapeHtml(r.musteriAdi)}</td>
          <td class="mono" style="font-size:10px">${r.siparisTarihi || '—'}</td>
          <td class="mono" style="font-size:10px">${r.termin || '<span class="muted">—</span>'}</td>
          <td class="mono" style="font-size:10px">${r.teslimTarihi || '<span class="muted">—</span>'}</td>
          <td class="r">${r.sapma !== null ? `<b style="color:var(--${r.sapma <= 0 ? 'green' : 'red'}-text)">${r.sapma > 0 ? '+' : ''}${r.sapma}</b>` : '—'}</td>
          <td class="r">${r.leadTime !== null ? r.leadTime + ' g' : '—'}</td>
          <td>${r.zamanindaMi === null ? '<span class="muted">—</span>' : r.zamanindaMi ? '<span class="pill pill-green" style="font-size:9px">✓</span>' : '<span class="pill pill-red" style="font-size:9px">✗</span>'}</td>
          <td>${r.eksiksizMi === null ? '<span class="muted">—</span>' : r.eksiksizMi ? '<span class="pill pill-green" style="font-size:9px">✓</span>' : '<span class="pill pill-red" style="font-size:9px">✗</span>'}</td>
          <td>${r.zamanindaMi === null || r.eksiksizMi === null ? '<span class="muted">—</span>' : r.otif ? '<span class="pill pill-green" style="font-size:9px">OTIF</span>' : '<span class="pill pill-red" style="font-size:9px">Kaçırıldı</span>'}</td>
        </tr>`).join('')}
      </table></div></div>`;
    c.innerHTML = html;
  }

  // ── PARETO / KÖK NEDEN ──────────────────────────────────────────────────
  function paretoTab(c) {
    const dp = veri.durusPareto, fp = veri.firePareto;
    const paretoTablo = (liste, birim, baslik, bosMesaj) => {
      if (!liste.length) return `<div class="card"><div class="card-hdr"><div class="card-title">${baslik}</div></div>
        <div class="empty-state" style="padding:20px"><div class="edesc">${bosMesaj}</div></div></div>`;
      const kritikSayi = liste.findIndex(x => x.kumulatif >= 0.8) + 1;
      return `<div class="card"><div class="card-hdr"><div class="card-title">${baslik}</div>
        <span class="pill pill-amber" style="font-size:10px">${kritikSayi} sebep = %80</span></div>
        <div class="fhint" style="margin-bottom:6px">İlk <b>${kritikSayi}</b> kalem toplamın %80'ini oluşturuyor — iyileştirme çalışması buraya odaklanmalı.</div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>#</th><th>Sebep / Kaynak</th><th class="r">${birim}</th><th>Pay</th><th class="r">Kümülatif</th></tr>
          ${liste.slice(0, 15).map((x, i) => `<tr${i < kritikSayi ? ' style="background:var(--amber-bg)"' : ''}>
            <td class="r muted">${i + 1}</td>
            <td><b>${App.escapeHtml(x.ad)}</b></td>
            <td class="r"><b>${App.fmt(x.deger, 0)}</b></td>
            <td style="min-width:130px">${paretoCubuk(x.oran, i < kritikSayi ? 'amber' : 'gray')}
              <span class="muted" style="font-size:9.5px">${yuzde(x.oran, 0)}</span></td>
            <td class="r muted">${yuzde(x.kumulatif, 0)}</td></tr>`).join('')}
        </table></div>`;
    };

    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Duruş</div><div class="kpi-val amber">${App.fmt(dp.reduce((a, x) => a + x.deger, 0), 0)} dk</div>
        <div class="muted" style="font-size:10.5px">${dp.length} farklı sebep</div></div>
      <div class="kpi"><div class="kpi-lbl">Toplam Red / Fire</div><div class="kpi-val red">${App.fmt(fp.toplamRed, 0)} adet</div>
        <div class="muted" style="font-size:10.5px">${fp.gerekce.length} farklı gerekçe</div></div>
      <div class="kpi"><div class="kpi-lbl">En Sorunlu İstasyon</div><div class="kpi-val red" style="font-size:16px">${fp.istasyon.length ? App.escapeHtml(fp.istasyon[0].ad) : '—'}</div>
        <div class="muted" style="font-size:10.5px">${fp.istasyon.length ? fp.istasyon[0].deger + ' adet red' : ''}</div></div>
    </div>`;

    html += paretoTablo(dp, 'Süre (dk)', '⏸ Duruş Kök Neden Analizi (Pareto)',
      'Duruş kaydı yok. Üretim Ekranı → Duruş sekmesinden kayıt girildiğinde analiz burada oluşur.');
    html += paretoTablo(fp.gerekce, 'Adet', '🔴 Fire / Red Gerekçe Analizi (Pareto)',
      'Red kaydı yok. Hat & İstasyon Takibi\'nde kalite reddi yapıldığında gerekçeler burada analiz edilir.');
    html += paretoTablo(fp.istasyon, 'Adet', '📍 İstasyon Bazlı Red Dağılımı', 'Veri yok.');
    html += paretoTablo(fp.urun, 'Adet', '📦 Ürün Bazlı Red Dağılımı', 'Veri yok.');
    c.innerHTML = html;
  }

  // ── STOK & ÖLÜ STOK ─────────────────────────────────────────────────────
  function stokTab(c) {
    const s = veri.stok;
    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Stok Değeri</div><div class="kpi-val blue">${App.fmtTL(s.toplamDeger)}</div>
        <div class="muted" style="font-size:10.5px">${s.satirlar.length} kalem</div></div>
      <div class="kpi"><div class="kpi-lbl">Ölü Stok (180+ gün)</div><div class="kpi-val ${s.oluStokAdet ? 'red' : 'green'}">${s.oluStokAdet}</div>
        <div class="muted" style="font-size:10.5px">${App.fmtTL(s.oluStokDeger)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Ölü Stok Payı</div>
        <div class="kpi-val ${s.toplamDeger > 0 && s.oluStokDeger / s.toplamDeger > 0.1 ? 'red' : 'green'}">${yuzde(s.toplamDeger > 0 ? s.oluStokDeger / s.toplamDeger : 0)}</div>
        <div class="muted" style="font-size:10.5px">%10 üstü kritiktir</div></div>
    </div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">📦 Stok Yaşlandırma Özeti</div></div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Bekleme Süresi</th><th class="r">Kalem</th><th class="r">Değer</th><th>Pay</th></tr>
        ${s.kovalar.map((k, i) => {
          const oran = s.toplamDeger > 0 ? k.deger / s.toplamDeger : 0;
          const renk = i === 0 ? 'green' : i === 1 ? 'blue' : i === 2 ? 'amber' : 'red';
          return `<tr><td><b>${k.ad}</b></td><td class="r">${k.adet}</td>
            <td class="r"><b>${App.fmtTL(k.deger)}</b></td>
            <td style="min-width:140px">${paretoCubuk(oran, renk)}<span class="muted" style="font-size:9.5px">${yuzde(oran, 0)}</span></td></tr>`;
        }).join('')}
      </table></div>`;

    const oluler = s.satirlar.filter(x => x.bekleyenGun !== null && x.bekleyenGun > 180);
    if (oluler.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg)">
        <div class="card-title" style="color:var(--red-text)">💀 Ölü Stok — 180+ Gündür Hareketsiz</div>
        <div class="fhint" style="margin:4px 0 8px">Bu kalemler sermayeyi bağlıyor. Elden çıkarma, 2. kalite satış veya üretimde kullanma değerlendirilmeli.</div>
        <table class="dtable" style="font-size:11px">
          <tr><th>Kod</th><th>Ad</th><th>Ambar</th><th class="r">Miktar</th><th class="r">Değer</th><th class="r">Bekleme</th></tr>
          ${oluler.slice(0, 25).map(x => `<tr>
            <td class="mono">${App.escapeHtml(x.kod || '—')}</td>
            <td>${App.escapeHtml((x.ad || '').slice(0, 40))}</td>
            <td style="font-size:10px">${App.escapeHtml(x.ambar || '—')}</td>
            <td class="r">${App.fmt(x.miktar, 1)} ${App.escapeHtml(x.birim || '')}</td>
            <td class="r">${x.deger ? App.fmtTL(x.deger) : '—'}</td>
            <td class="r"><b style="color:var(--red-text)">${x.bekleyenGun} gün</b></td></tr>`).join('')}
        </table></div>`;
    }

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Tüm Stok Kalemleri</div></div>
      <div style="max-height:340px;overflow:auto">
      <table class="dtable" style="font-size:11px">
        <tr><th>Kod</th><th>Ad</th><th>Tip</th><th class="r">Miktar</th><th class="r">Değer</th><th>Son Hareket</th><th class="r">Bekleme</th></tr>
        ${s.satirlar.slice(0, 80).map(x => `<tr>
          <td class="mono">${App.escapeHtml(x.kod || '—')}</td>
          <td>${App.escapeHtml((x.ad || '').slice(0, 36))}</td>
          <td style="font-size:10px">${x.tip}</td>
          <td class="r">${App.fmt(x.miktar, 1)}</td>
          <td class="r">${x.deger ? App.fmtTL(x.deger) : '—'}</td>
          <td class="mono" style="font-size:10px">${x.sonHareket || '<span class="muted">yok</span>'}</td>
          <td class="r">${x.bekleyenGun !== null ? x.bekleyenGun + ' g' : '—'}</td></tr>`).join('')}
      </table></div></div>`;
    c.innerHTML = html;
  }

  // ── MALZEME VERİMİ (mobilyaya özgü) ─────────────────────────────────────
  function malzemeTab(c) {
    const m = veri.malzeme;
    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Genel Malzeme Verimi</div>
        <div class="kpi-val ${m.genelVerim === null ? 'gray' : m.genelVerim >= 0.9 ? 'green' : m.genelVerim >= 0.8 ? 'amber' : 'red'}">${yuzde(m.genelVerim)}</div>
        <div class="muted" style="font-size:10.5px">Teorik / Fiili tüketim</div></div>
      <div class="kpi"><div class="kpi-lbl">Teorik Malzeme Maliyeti</div><div class="kpi-val blue">${App.fmtTL(m.toplamTeorikTutar)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Fazla Tüketim (Kayıp)</div>
        <div class="kpi-val ${m.kayipTutar > 0 ? 'red' : 'green'}">${App.fmtTL(m.kayipTutar)}</div>
        <div class="muted" style="font-size:10.5px">Fiili − Teorik</div></div>
    </div>`;

    html += `<div class="card" style="border:1px solid var(--blue-light);background:var(--blue-bg);margin-bottom:12px">
      <div style="font-size:12px;line-height:1.6">
        <b>🪵 Bu rapor neden kritik?</b><br>
        Panel mobilyada malzeme, toplam maliyetin <b>%55–65'idir</b>. Levha kullanım veriminde <b>%3'lük iyileşme,
        kârlılıkta 1,5–2 puan</b> anlamına gelir. Bu tablo, reçeteye göre <i>olması gereken</i> tüketimle
        <i>gerçekte harcanan</i> miktarı karşılaştırır; aradaki fark kesim fireleri, hatalı kesim ve kayıptır.
      </div></div>`;

    if (!m.satirlar.length) {
      html += `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Karşılaştırma verisi yok</div>
        <div class="edesc">Bu analiz için (1) yarı mamül reçetelerinde hammadde tanımı ve (2) üretimde sarf edilen stok çıkış kayıtları gerekir.</div></div></div>`;
    } else {
      html += `<div class="card"><div class="card-hdr"><div class="card-title">Malzeme Bazlı Tüketim Sapması</div></div>
        <table class="dtable" style="font-size:11px">
          <tr><th>Malzeme</th><th class="r">Teorik</th><th class="r">Fiili</th><th class="r">Sapma</th><th class="r">Sapma %</th><th class="r">Verim</th><th class="r">Tutar Etkisi</th></tr>
          ${m.satirlar.slice(0, 40).map(x => `<tr${x.sapmaTutar > 0 ? ' style="background:var(--red-bg)"' : ''}>
            <td><b class="mono" style="font-size:10px">${App.escapeHtml(x.kod || '—')}</b><br>
              <span class="muted" style="font-size:9.5px">${App.escapeHtml((x.ad || '').slice(0, 30))}</span></td>
            <td class="r">${App.fmt(x.teorik, 1)} ${App.escapeHtml(x.birim || '')}</td>
            <td class="r">${App.fmt(x.fiili, 1)}</td>
            <td class="r"><b style="color:var(--${x.sapma > 0 ? 'red' : 'green'}-text)">${x.sapma > 0 ? '+' : ''}${App.fmt(x.sapma, 1)}</b></td>
            <td class="r">${x.sapmaYuzde !== null ? yuzde(x.sapmaYuzde) : '—'}</td>
            <td class="r">${x.verimYuzde !== null ? `<b>${yuzde(x.verimYuzde)}</b>` : '—'}</td>
            <td class="r"><b style="color:var(--${x.sapmaTutar > 0 ? 'red' : 'green'}-text)">${App.fmtTL(x.sapmaTutar)}</b></td>
          </tr>`).join('')}
        </table></div>`;
    }
    c.innerHTML = html;
  }

  // ── SATIŞ HUNİSİ ────────────────────────────────────────────────────────
  function huniTab(c) {
    const h = veri.huni;
    let html = `<div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Teklif</div><div class="kpi-val blue">${h.toplam}</div>
        <div class="muted" style="font-size:10.5px">${App.fmtTL(h.toplamTutar)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Siparişe Dönen</div><div class="kpi-val green">${h.siparise}</div>
        <div class="muted" style="font-size:10.5px">${App.fmtTL(h.kazanilanTutar)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Dönüşüm Oranı (Adet)</div>
        <div class="kpi-val ${h.donusumOrani === null ? 'gray' : h.donusumOrani >= 0.3 ? 'green' : h.donusumOrani >= 0.15 ? 'amber' : 'red'}">${yuzde(h.donusumOrani)}</div>
        <div class="muted" style="font-size:10.5px">Sektör ort. %20–35</div></div>
      <div class="kpi"><div class="kpi-lbl">Dönüşüm (Tutar)</div><div class="kpi-val blue">${yuzde(h.tutarDonusumOrani)}</div></div>
    </div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">🎯 Teklif Durumu Dağılımı</div></div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Durum</th><th class="r">Adet</th><th>Pay</th></tr>
        ${[['Siparişe Dönüştü', h.siparise, 'green'], ['Reddedildi / Kaybedildi', h.reddedilen, 'red'],
           ['Beklemede / Açık', h.bekleyen, 'amber']].map(([ad, adet, renk]) => {
          const oran = h.toplam > 0 ? adet / h.toplam : 0;
          return `<tr><td><b>${ad}</b></td><td class="r">${adet}</td>
            <td style="min-width:180px">${paretoCubuk(oran, renk)}<span class="muted" style="font-size:9.5px">${yuzde(oran, 0)}</span></td></tr>`;
        }).join('')}
      </table></div>`;

    if (h.aylik.length) {
      html += `<div class="card"><div class="card-hdr"><div class="card-title">📆 Aylık Teklif ve Dönüşüm Trendi</div></div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Dönem</th><th class="r">Teklif</th><th class="r">Kazanılan</th><th>Dönüşüm</th></tr>
          ${h.aylik.map(a => {
            const oran = a.teklif > 0 ? a.kazanilan / a.teklif : 0;
            return `<tr><td><b>${a.ay}</b></td><td class="r">${a.teklif}</td><td class="r">${a.kazanilan}</td>
              <td style="min-width:160px">${paretoCubuk(oran, oran >= 0.3 ? 'green' : 'amber')}
                <span class="muted" style="font-size:9.5px">${yuzde(oran, 0)}</span></td></tr>`;
          }).join('')}
        </table></div>`;
    }
    c.innerHTML = html;
  }

  return { render };
})();
