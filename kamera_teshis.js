// ════════════════════════════════════════════════════════════════════════════
// KAMERA ORTAM TEŞHİSİ
//
// Sistem artık YALNIZCA QR KOD kullanır (çizgi barkodlar tamamen kaldırıldı).
// QR okuma iki yoldan yapılır:
//   1) Tarayıcının yerleşik BarcodeDetector API'si (Chrome/Edge/Android)
//   2) Telefonun KENDİ kamera uygulaması — etiketlerdeki QR bir adres taşıdığı
//      için iPhone/iPad kamerası okuyup uygulamayı kod dolu olarak açar
//
// Bu modül, kamera çalışmadığında NEDENİNİ tespit eder. Kamera sorunlarının
// büyük çoğunluğu iki sebebe dayanır: (a) sitenin HTTPS olmaması,
// (b) tarayıcının barkod API'sini desteklememesi. Kullanıcıya tahmin
// ettirmek yerine doğrudan sebebi ve çözümü göstermek için kullanılır.
// ════════════════════════════════════════════════════════════════════════════
const KameraTeshis = (() => {

  // Güvenli bağlam (HTTPS veya localhost) — kamera erişiminin ÖN KOŞULU
  function guvenliBaglamMi() {
    try {
      if (typeof window === 'undefined') return false;
      if (window.isSecureContext === true) return true;
      const h = window.location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || window.location.protocol === 'file:';
    } catch (e) { return false; }
  }

  function cihazTipi() {
    try {
      const ua = navigator.userAgent || '';
      if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
      if (/Android/.test(ua)) return 'android';
      return 'masaustu';
    } catch (e) { return 'bilinmiyor'; }
  }

  // Ortamı tara ve kullanıcıya gösterilecek teşhisi döndür
  function ortamTeshisi() {
    const guvenli = guvenliBaglamMi();
    const kameraApi = !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const dedektor = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    const cihaz = cihazTipi();

    // Uygulama içi otomatik tarama mümkün mü?
    // Kendi QR çözücümüz (QrCozucu) tarayıcı API'sine bağımlı DEĞİLDİR;
    // kamera erişimi varsa tarama her tarayıcıda çalışır.
    const kendiCozucu = typeof QrCozucu !== 'undefined';
    const otomatikTarama = guvenli && kameraApi && (dedektor || kendiCozucu);

    let durum, mesaj, cozum = '';
    if (otomatikTarama) {
      durum = 'tam';
      mesaj = dedektor
        ? 'Kamera ile otomatik QR taraması kullanılabilir.'
        : 'Kamera ile QR taraması kullanılabilir (yerleşik çözücü).';
    } else if (!guvenli) {
      durum = 'https_yok';
      mesaj = 'Site güvenli bağlantı (HTTPS) üzerinden açılmadığı için tarayıcı kameraya izin vermiyor.';
      cozum = 'Siteye <b>https://</b> ile girin. Sunucuda SSL sertifikası yoksa hosting panelinizden (cPanel → SSL/TLS) ücretsiz Let\'s Encrypt sertifikası etkinleştirilebilir. ' +
        (cihaz === 'ios' ? 'Bu arada iPhone\'un <b>kendi kamera uygulamasıyla</b> etiketi okutup açılan bağlantıya dokunabilirsiniz.' : '');
    } else if (!kameraApi) {
      durum = 'kamera_yok';
      mesaj = 'Bu tarayıcı kamera erişimini desteklemiyor.';
      cozum = 'Güncel Chrome, Edge veya Safari kullanın.';
    } else if (!kendiCozucu) {
      durum = 'cozucu_yok';
      mesaj = 'QR çözücü modülü yüklenemedi.';
      cozum = 'Sayfayı yenileyin; sorun sürerse kodu elle girin.';
    }

    return {
      durum, mesaj, cozum, cihaz,
      guvenliBaglam: guvenli, kameraApi, dedektor, kendiCozucu, otomatikTarama,
      // Elle giriş her ortamda çalışır
      elleGiris: true,
      // ── AYNI BİLGİNİN ARAYÜZÜN KULLANDIĞI ADLARLA KOPYASI ──
      // app.js bu adlarla okur. İki isim seti bilinçli olarak birlikte
      // tutulur; alan adı uyuşmazlığı kameranın sessizce hiç açılmamasına
      // yol açar (bu hata bir kez yaşandı).
      kameraKullanilabilir: otomatikTarama,
      sebep: mesaj,
      detectorVar: dedektor
    };
  }

  return { ortamTeshisi, guvenliBaglamMi, cihazTipi };
})();
