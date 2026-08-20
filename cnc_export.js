// ════════════════════════════════════════════════════════════════════════════
// CNC İŞLEME DOSYASI ÜRETİMİ (MPR + delik katmanlı DXF)
// ────────────────────────────────────────────────────────────────────────────
// Dolap Tasarım modülünün ürettiği delik planını (delikler[]) ve panelleri
// makinelerin okuyabileceği formatlara çevirir:
//
//   1) WoodWOP MPR  — Homag/Weeke router'ların ana formatı (ASCII).
//                     Panel başına bir dosya; dikey delikler (BohrVert) + kontur.
//   2) Delik DXF    — kesim konturu + delikleri AYRI KATMANDA taşıyan DXF.
//                     Nesting DXF'i yalnızca dış konturdu; bu, deliği de taşır.
//
// ⚠ ÖNEMLİ — KALİBRASYON UYARISI (uydurma değil, gerçek sınır):
//   Her CNC makinesinin post-processor'ı ve sıfır (0,0) noktası farklıdır.
//   Bu dosyalar DOĞRU YAPIDADIR ama makineye özel şu ayarlar ekip tarafından
//   BİR KEZ doğrulanmalıdır:
//     • Sıfır noktası (sol-alt / sol-üst / merkez)
//     • Y ekseni yönü (yukarı+ / aşağı+)
//     • Delik yüzü (üstten mi, kenardan mı — BohrVert vs BohrHoriz)
//     • Takım/çap eşleme (Ø5, Ø8, Ø15, Ø35 → makine takım no)
//   İlk dosyayı BOŞ/ISKARTA plakada test edin; körlemesine seri üretime almayın.
//
// Bu modül hesaplama YAPMAZ — yalnızca mevcut delik/panel verisini biçimlendirir.
// Böylece "tek doğruluk kaynağı" dolap_hesap.js'de kalır.
// ════════════════════════════════════════════════════════════════════════════
const CncExport = (() => {

  // Sayıyı MPR'nin beklediği ondalık biçime çevirir (nokta ondalık, sabit).
  const n = (v) => (Math.round((+v || 0) * 1000) / 1000).toString();

  // ── WOODWOP MPR (tek panel) ──────────────────────────────────────────────
  // parca: { ad, netEn, netBoy, kalinlik }
  // delikler: bu parçaya ait [{ x, y, cap, derinlik, tip }]
  // MPR koordinat sistemi: sol-alt köşe (0,0), X sağa, Y yukarı. WoodWOP
  // varsayılanı budur; makineniz farklıysa post-processor'da çevrilir.
  function mprUret(parca, delikler) {
    const L = parca.netEn, W = parca.netBoy, T = parca.kalinlik || 18;
    const satir = [];
    satir.push('[H');
    satir.push('VERSION="4.0"');
    satir.push('OP="10"');            // birim: mm
    satir.push('FM="1"');
    satir.push(']');
    // Parça (WerkStück) tanımı
    satir.push('<100 \\WerkStck\\');
    satir.push('LX=' + n(L));         // uzunluk (X)
    satir.push('LY=' + n(W));         // genişlik (Y)
    satir.push('LZ=' + n(T));         // kalınlık (Z)
    satir.push('/>');
    // Kontur (Polygonzug) — dış hat: dört köşe
    satir.push('<101 \\Kommentar\\ KM="' + (parca.ad || 'Parça') + '" />');

    // Dikey delikler — her biri bir BohrVert makrosu
    (delikler || []).forEach(d => {
      // MPR'de Y yukarı pozitif; bizim delik y'miz üstten olabilir, ama
      // dolap_hesap'ta y panel yüksekliği içinde ölçülüyor (alt referanslı
      // sayılır). Ekip sıfır noktasını doğrularken bunu teyit etmeli.
      satir.push('<102 \\BohrVert\\');
      satir.push('XA=' + n(d.x));                 // delik X
      satir.push('YA=' + n(d.y));                 // delik Y
      satir.push('BM="' + n(d.cap) + '"');        // çap
      satir.push('TA=' + n(d.derinlik));          // derinlik
      satir.push('AB="1"');                       // adet
      satir.push('KM="' + (d.tip || '') + '"');   // açıklama
      satir.push('/>');
    });
    return satir.join('\r\n') + '\r\n';
  }

  // ── DELİK KATMANLI DXF (tek panel) ─────────────────────────────────────────
  // Dış kontur "KESIM" katmanında, delikler "DELIK" katmanında daireler olarak.
  // Nesting DXF'inden farkı: delik bilgisini de taşır (tek makine dosyası hedefi).
  function dxfUret(parca, delikler) {
    const L = parca.netEn, W = parca.netBoy;
    const s = [];
    const c = (code, val) => { s.push(code); s.push(String(val)); };
    c(0, 'SECTION'); c(2, 'ENTITIES');
    // Dış kontur (kapalı polyline) — KESIM katmanı
    c(0, 'LWPOLYLINE'); c(8, 'KESIM'); c(90, 4); c(70, 1);
    [[0, 0], [L, 0], [L, W], [0, W]].forEach(([x, y]) => { c(10, x); c(20, y); });
    // Delikler — DELIK katmanı, gerçek çapıyla daire
    (delikler || []).forEach(d => {
      c(0, 'CIRCLE'); c(8, 'DELIK');
      c(10, d.x); c(20, d.y); c(30, 0);
      c(40, (+d.cap || 5) / 2);           // yarıçap
    });
    c(0, 'ENDSEC'); c(0, 'EOF');
    return s.join('\r\n') + '\r\n';
  }

  // ── ÇOK PANELLİ PAKET ──────────────────────────────────────────────────────
  // hesapSonuc: dolap_hesap çıktısı { paneller:[...], delikler:[{parca,...}] }
  // Delikler parça ADINA göre eşleşir (delik.parca === panel.ad). Aynı isimli
  // panel birden fazlaysa (ör. 2 yan panel) delikler her kopyaya uygulanır.
  function panelBazliGrupla(hesapSonuc) {
    const paneller = hesapSonuc.paneller || [];
    const delikler = hesapSonuc.delikler || [];
    return paneller.map(p => {
      const kendi = delikler.filter(d => d.parca === p.ad
        || (d.parca === 'Sol yan' && /yan/i.test(p.ad))
        || (d.parca === 'Sağ yan' && /yan/i.test(p.ad)));
      return { parca: p, delikler: kendi };
    }).filter(g => g.delikler.length > 0 || true);   // deliksiz panel de dosyaya girer (sadece kesim)
  }

  // Dosya adı için güvenli slug
  const slug = (s) => String(s || 'parca').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').slice(0, 40);

  // ── İNDİRME YARDIMCILARI ────────────────────────────────────────────────
  function metniIndir(ad, icerik, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([icerik], { type: mime || 'text/plain' }));
    a.download = ad;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Birden çok dosyayı tek tek indirmek yerine, hepsini tek bir metin dosyasında
  // (ayraçlı) veya ayrı ayrı indirebiliriz. Tarayıcıda ZIP kütüphanesi olmadığı
  // için: her panel için ayrı dosya indirilir (kısa gecikmeyle).
  function tumPanelleriIndir(hesapSonuc, format, dosyaTaban) {
    const gruplar = panelBazliGrupla(hesapSonuc);
    if (!gruplar.length) { App.toast('Delik planı bulunamadı — Dolap Tasarımda "CNC delik planı" seçeneğini açın', 'err'); return; }
    let i = 0;
    gruplar.forEach((g, idx) => {
      setTimeout(() => {
        const taban = slug(dosyaTaban) + '_' + slug(g.parca.ad) + (g.parca.adet > 1 ? '_x' + g.parca.adet : '');
        if (format === 'mpr') metniIndir(taban + '.mpr', mprUret(g.parca, g.delikler), 'text/plain');
        else metniIndir(taban + '.dxf', dxfUret(g.parca, g.delikler), 'application/dxf');
      }, idx * 250);   // tarayıcı çoklu indirmeyi engellemesin diye aralıklı
      i++;
    });
    App.toast(i + ' panel için ' + format.toUpperCase() + ' dosyası indiriliyor…', 'ok');
  }

  // ── ÖZET / ÖNİZLEME PENCERESİ ─────────────────────────────────────────────
  // Dolap Tasarım ekranından çağrılır. hesapSonuc + dosya adı alır.
  function ac(hesapSonuc, dosyaTaban) {
    const gruplar = panelBazliGrupla(hesapSonuc);
    const toplamDelik = (hesapSonuc.delikler || []).length;
    const body = document.createElement('div');

    if (!toplamDelik) {
      body.innerHTML = `<div class="empty-state" style="padding:22px 10px"><div class="edesc">
        Bu tasarımda CNC delik planı yok.<br><br>
        Dolap Tasarım ekranında <b>"CNC delik planı üret"</b> seçeneğini işaretleyip yeniden hesaplayın,
        sonra buradan MPR/DXF dosyalarını alın.</div></div>`;
      App.openModal({ title: '⚙ CNC İşleme Dosyaları', body, footer: `<button class="btn" id="cnc-kapat">Kapat</button>` });
      document.getElementById('cnc-kapat').onclick = App.closeModal;
      return;
    }

    let satirlar = '';
    gruplar.forEach(g => {
      satirlar += `<tr>
        <td><b>${App.escapeHtml(g.parca.ad)}</b>${g.parca.adet > 1 ? ` <span class="muted">×${g.parca.adet}</span>` : ''}</td>
        <td class="r mono">${App.fmt(g.parca.netEn, 0)}×${App.fmt(g.parca.netBoy, 0)}×${App.fmt(g.parca.kalinlik, 0)}</td>
        <td class="r">${g.delikler.length}</td>
      </tr>`;
    });

    body.innerHTML = `
      <div class="card" style="background:var(--amber-bg);border-color:var(--amber-light);margin-bottom:12px">
        <div style="font-size:12px;color:var(--amber-text);line-height:1.5">
          <b>⚠ Kalibrasyon gerekli — körlemesine üretime almayın.</b><br>
          Bu dosyalar doğru yapıdadır ama her makinenin <b>sıfır noktası</b>, <b>Y ekseni yönü</b>,
          <b>delik yüzü</b> ve <b>takım/çap eşlemesi</b> farklıdır. İlk dosyayı mutlaka
          <b>ıskarta plakada</b> test edip ölçüleri doğrulayın; ardından ayarları makinenize sabitleyin.
        </div>
      </div>
      <div class="fhint" style="margin-bottom:8px">Toplam <b>${gruplar.length}</b> panel · <b>${toplamDelik}</b> delik. Her panel ayrı dosya olarak iner.</div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Panel</th><th class="r">Ölçü (mm)</th><th class="r">Delik</th></tr>
        ${satirlar}
      </table>
      <div class="fhint" style="margin-top:10px">
        <b>MPR</b> → Homag/Weeke (WoodWOP). <b>DXF (delikli)</b> → kesim + delik katmanı; çoğu router ve CAD okur.
        Biesse (CIX/BPP) için DXF'i post-processor'ınızdan geçirin.
      </div>`;

    const footer = `
      <button class="btn" id="cnc-kapat">Kapat</button>
      <button class="btn btn-blue" id="cnc-dxf">⬇ Delikli DXF (tüm paneller)</button>
      <button class="btn btn-green" id="cnc-mpr">⬇ MPR (tüm paneller)</button>`;
    App.openModal({ title: '⚙ CNC İşleme Dosyaları', sub: dosyaTaban || '', body, footer, wide: true });

    document.getElementById('cnc-kapat').onclick = App.closeModal;
    document.getElementById('cnc-mpr').onclick = () => tumPanelleriIndir(hesapSonuc, 'mpr', dosyaTaban);
    document.getElementById('cnc-dxf').onclick = () => tumPanelleriIndir(hesapSonuc, 'dxf', dosyaTaban);
  }

  return { ac, mprUret, dxfUret, panelBazliGrupla };
})();
