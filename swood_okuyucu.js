// ════════════════════════════════════════════════════════════════════════════
// SWOOD RAPORU OKUYUCU — SolidWorks SWOOD eklentisinin ürettiği rapor ZIP'ini
// (mobilya/ahşap işleme sektörüne özel BOM+kesim listesi) okur.
// ────────────────────────────────────────────────────────────────────────────
// SWOOD raporu birden çok alt klasör içerir; bu modülün ilgilendiği ikisi:
//   • "Saw Cut Export/*.csv" — panel bazlı kesim listesi (DESC, LENGHT, WIDTH,
//     QTY, MATERIAL, EBF/EBB/EBL/EBR kenar bandı yönleri, GRAIN, SAP_CODE...).
//     Bu, İş Emri Formu'nun (FR.29) satır şemasıyla neredeyse birebir örtüşür.
//   • "PDFS/*.pdf" (yoksa "Images/*.jpg|png") — teknik resim/görsel referansı.
//
// NE GÜVENİLİR, NE DEĞİL:
//   • DESC/LENGHT/WIDTH/QTY/MATERIAL/SAP_CODE — doğrudan sayısal/metin alanlar,
//     güvenle aktarılır.
//   • EBF/EBB/EBL/EBR (kenar bandı yönleri) — hangi SWOOD sürümünün bu alanları
//     nasıl doldurduğu (malzeme kodu mu, evet/hayır mı) doğrulanmadığı için
//     BOY/EN yönüne KESİN eşlenmiyor; yalnızca "bu kenarlarda bant var" bilgisi
//     açıklamaya not düşülür — kullanıcı PVC sütununu elle işaretler. Yanlış
//     yön ataması, boş bırakmaktan daha pahalıdır (STEP/PDF okuyucularıyla
//     aynı ilke — bkz. is_emri_uretici.js).
//
// ÇIKTI: { dosyaAdi, csvSatirlari[], teknikResimler[{ad, tip, dataUrl}], uyarilar[] }
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
      if (!csvSatirlari.length) {
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

    return { dosyaAdi: file.name, csvSatirlari, teknikResimler, uyarilar };
  }

  return { csvSatirlariniAyristir, oku };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SwoodOkuyucu;
