// ════════════════════════════════════════════════════════════════════════════
// SWOOD RAPORU OKUYUCU — SolidWorks SWOOD eklentisinin ürettiği rapor ZIP'ini
// (mobilya/ahşap işleme sektörüne özel BOM+kesim listesi) okur.
// ────────────────────────────────────────────────────────────────────────────
// SWOOD raporu birden çok alt klasör içerir; bu modülün ilgilendiği üçü:
//   • "Saw Cut Export/*.csv" — panel bazlı kesim listesi (DESC, LENGHT, WIDTH,
//     QTY, MATERIAL, EBF/EBB/EBL/EBR kenar bandı yönleri, GRAIN, SAP_CODE...).
//     Bu, İş Emri Formu'nun (FR.29) satır şemasıyla neredeyse birebir örtüşür.
//   • "Docs/*_ReportStocks.html" — YEDEK KAYNAK: bazı SWOOD kurulumlarında/
//     lisanslarında "Saw Cut Export" hiç doldurulmuyor (yalnızca başlık satırı
//     geliyor), ama "Stoklar" raporu (HTML) her panel için LENGTH/WIDTH/
//     THICKNESS/Material/Edgeband(N) bilgisini gerçek verilerle taşıyor.
//     Saw Cut Export boşsa bu rapor okunur.
//   • "PDFS/*.pdf" (yoksa "Images/*.jpg|png") — teknik resim/görsel referansı.
//
// NE GÜVENİLİR, NE DEĞİL:
//   • DESC/LENGHT/WIDTH/QTY/MATERIAL/SAP_CODE — doğrudan sayısal/metin alanlar,
//     güvenle aktarılır.
//   • EBF/EBB/EBL/EBR (kenar bandı yönleri, CSV) — hangi SWOOD sürümünün bu
//     alanları nasıl doldurduğu (malzeme kodu mu, evet/hayır mı) doğrulanmadığı
//     için BOY/EN yönüne KESİN eşlenmiyor; yalnızca "bu kenarlarda bant var"
//     bilgisi açıklamaya not düşülür — kullanıcı PVC sütununu elle işaretler.
//   • Edgeband(N) (Stoklar raporu, HTML) — malzeme adı VE adedi (0/1/2) net
//     okunur, ama hangi kenarda (boy mu en mi) olduğu HTML'de de belirtilmez;
//     aynı ilkeyle malzeme+adet açıklamaya not düşülür, yön otomatik atanmaz.
//     Yanlış yön ataması, boş bırakmaktan daha pahalıdır (STEP/PDF
//     okuyucularıyla aynı ilke — bkz. is_emri_uretici.js).
//
// ÇIKTI: { dosyaAdi, csvSatirlari[], stokPanelleri[], teknikResimler[{ad, tip, dataUrl}], uyarilar[] }
// ════════════════════════════════════════════════════════════════════════════
const SwoodOkuyucu = (() => {

  // ── CSV AYRIŞTIRMA (saf fonksiyon — Node'da da test edilebilir) ──────────
  // SWOOD'un Saw Cut Export'u noktalı virgülle ayrılmış, ilk satır başlık.
  // Başlıkta sondaki boş sütunlar (";;") yok sayılır.
  function csvSatirlariniAyristir(metin) {
    if (!metin) return [];
    // BOM temizle
    let temiz = metin.replace(/^﻿/, '');
    const satirlar = temiz.split(/\r\n|\r|\n/).filter(s => s.trim() !== '');
    if (!satirlar.length) return [];
    const baslik = satirlar[0].split(';').map(s => s.trim());
    const sonuc = [];
    for (let i = 1; i < satirlar.length; i++) {
      const hucreler = satirlar[i].split(';');
      const satir = {};
      let doluMu = false;
      baslik.forEach((ad, j) => {
        if (!ad) return; // sondaki isimsiz sütunlar
        const deger = (hucreler[j] || '').trim();
        satir[ad] = deger;
        if (deger) doluMu = true;
      });
      if (doluMu) sonuc.push(satir);
    }
    return sonuc;
  }

  // ── HTML VARLIK/SAYI YARDIMCILARI ─────────────────────────────────────────
  function htmlCoz(s) {
    return String(s == null ? '' : s)
      .replace(/&#(\d+);?/g, (_, n) => String.fromCharCode(+n))
      .replace(/&nbsp;?/gi, ' ')
      .replace(/&amp;/g, '&')
      .trim();
  }
  function sayiCoz(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  // ── "STOKLAR" RAPORU (Docs/*_ReportStocks.html) AYRIŞTIRMA ───────────────
  // Saf fonksiyon (Node'da da test edilebilir). Her panel bir "cellule_menu"
  // satırıyla başlar (panel adı <b>...</b> içinde), ardından Dimensions
  // (Stock)/Material/Edgeband(N)/Description-Quantity satırları gelir.
  // "Dimensions (Stock)" bulunamayan bloklar (rapor gürültüsü) atlanır.
  function stoklarHtmlAyristir(html) {
    if (!html) return [];
    const panelBaslikKalibi = /cellule_menu[\s\S]*?<b>([^<]*)<\/b>[\s\S]*?(?=cellule_menu|$)/g;
    const sonuc = [];
    let m;
    while ((m = panelBaslikKalibi.exec(html))) {
      const blok = m[0];
      const boyutlar = blok.match(/Dimensions\s*\(Stock\)[\s\S]*?<b>([\d.,]+)<\/b>[\s\S]*?<b>([\d.,]+)<\/b>[\s\S]*?<b>([\d.,]+)<\/b>/i);
      if (!boyutlar) continue;
      const malzemeM = blok.match(/>Material<\/td>[\s\S]*?<center>([^<]*)<\/center>/i);
      const kenarBantlari = [];
      const edgeKalibi = /Edgeband\s*\(\d+\)<\/td>[\s\S]*?<center>([^<]*)<\/center>[\s\S]*?<center>([\d.,]+)<\/center>/gi;
      let e;
      while ((e = edgeKalibi.exec(blok))) {
        const eAdet = sayiCoz(e[2]);
        if (eAdet > 0) kenarBantlari.push({ malzeme: htmlCoz(e[1]), adet: eAdet });
      }
      const descM = blok.match(/Description:\s*([^<]*)<\/td>/i);
      const qtyM = blok.match(/document\.write\s*\(\s*([\d.]+)\s*\)/i);
      sonuc.push({
        ad: htmlCoz(m[1]),
        description: descM ? htmlCoz(descM[1]) : '',
        boy: sayiCoz(boyutlar[1]), en: sayiCoz(boyutlar[2]), kalinlik: sayiCoz(boyutlar[3]),
        malzeme: malzemeM ? htmlCoz(malzemeM[1]) : '',
        adet: qtyM ? sayiCoz(qtyM[1]) : 1,
        kenarBantlari
      });
    }
    return sonuc;
  }

  // ── ZIP İÇİNDE DOSYA ARA ──────────────────────────────────────────────────
  function zipDosyaBul(zip, desen) {
    const yollar = Object.keys(zip.files).filter(y => !zip.files[y].dir && desen.test(y));
    yollar.sort(); // "1.csv" gibi tek dosya beklenir, birden fazlaysa ilkini al
    return yollar.length ? zip.files[yollar[0]] : null;
  }
  function zipTumDosyalar(zip, desen) {
    return Object.keys(zip.files).filter(y => !zip.files[y].dir && desen.test(y)).sort().map(y => zip.files[y]);
  }

  const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  function uzanti(ad) { const m = /\.([a-z0-9]+)$/i.exec(ad || ''); return m ? m[1].toLowerCase() : ''; }

  // ── ZIP'İ OKU (tarayıcıya özgü — JSZip kullanır) ──────────────────────────
  async function oku(file) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip yüklenemedi — sayfayı yenileyip tekrar deneyin.');
    const uyarilar = [];
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const csvDosya = zipDosyaBul(zip, /Saw\s*Cut\s*Export[\\/].*\.csv$/i) || zipDosyaBul(zip, /\.csv$/i);
    let csvSatirlari = [];
    if (!csvDosya) {
      uyarilar.push('Raporda "Saw Cut Export" klasöründe bir CSV bulunamadı — panel listesi boş gelecek. SWOOD tarafında bu çıktının aktif olduğundan emin olun.');
    } else {
      const metin = await csvDosya.async('string');
      csvSatirlari = csvSatirlariniAyristir(metin);
    }

    // Saw Cut Export boşsa (bazı SWOOD kurulumlarında hiç doldurulmuyor) —
    // "Stoklar" raporu (HTML) yedek kaynak olarak denenir.
    let stokPanelleri = [];
    if (!csvSatirlari.length) {
      const stoklarDosya = zipDosyaBul(zip, /ReportStocks\.html$/i);
      if (stoklarDosya) {
        const html = await stoklarDosya.async('string');
        stokPanelleri = stoklarHtmlAyristir(html);
      }
      if (csvDosya && stokPanelleri.length) {
        uyarilar.push('"Saw Cut Export" CSV\'sinde veri satırı yoktu (yalnızca başlık) — bunun yerine "Stoklar" raporundan ' + stokPanelleri.length + ' panel okundu.');
      } else if (csvDosya) {
        uyarilar.push('"Saw Cut Export" CSV\'si bulundu ama içinde veri satırı yok (yalnızca başlık). SWOOD projesinde kesim listesi henüz üretilmemiş olabilir.');
      }
    }

    // Teknik resim: önce PDF, yoksa görseller (ilk 6 tanesi — rapor onlarca
    // görsel içerebilir, hepsini yüklemek gereksiz yavaşlık yaratır).
    const teknikResimler = [];
    const pdfDosyalar = zipTumDosyalar(zip, /\.pdf$/i);
    if (pdfDosyalar.length) {
      for (const d of pdfDosyalar.slice(0, 3)) {
        const b64 = await d.async('base64');
        teknikResimler.push({ ad: d.name.split('/').pop(), tip: 'pdf', dataUrl: 'data:' + MIME.pdf + ';base64,' + b64 });
      }
    } else {
      const gorseller = zipTumDosyalar(zip, /\.(jpe?g|png)$/i).filter(d => /\/Images\//i.test(d.name) || /PANELMAIN|_PROJECT|_VIEWS/i.test(d.name));
      const secili = (gorseller.length ? gorseller : zipTumDosyalar(zip, /\.(jpe?g|png)$/i)).slice(0, 6);
      for (const d of secili) {
        const ext = uzanti(d.name);
        const b64 = await d.async('base64');
        teknikResimler.push({ ad: d.name.split('/').pop(), tip: 'image', dataUrl: 'data:' + (MIME[ext] || 'image/jpeg') + ';base64,' + b64 });
      }
      if (!teknikResimler.length) uyarilar.push('Raporda teknik resim (PDF veya görsel) bulunamadı.');
    }

    return { dosyaAdi: file.name, csvSatirlari, stokPanelleri, teknikResimler, uyarilar };
  }

  return { csvSatirlariniAyristir, stoklarHtmlAyristir, oku };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SwoodOkuyucu;
