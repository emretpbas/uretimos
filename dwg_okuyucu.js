// ════════════════════════════════════════════════════════════════════════════
// DWG OKUYUCU — AutoCAD dosyalarından mahal ve detay çıkarımı
// ────────────────────────────────────────────────────────────────────────────
// LibreDWG'nin WebAssembly derlemesini (@mlightcad/libredwg-web) kullanır.
//
// LİSANS: GPL-3.0. Bu modül ve bağımlılığı GPL-3.0 kapsamındadır; ÜretimOS
// dağıtılırsa kaynak kodun da aynı lisansla paylaşılması gerekir. Bu bilinçli
// bir tercihtir (bkz. vendor/dwg/LISANS.txt).
//
// TASARIM — TEMBEL YÜKLEME:
// WASM dosyası 9,5 MB'dır. Uygulama açılışına eklenirse mobilde felakete yol
// açar. Bu yüzden kütüphane YALNIZCA kullanıcı bir DWG seçtiğinde indirilir.
// Bir kez indirilince tarayıcı önbelleğinde kalır.
//
// MOBİL: 9,5 MB indirme + WASM çalıştırma zayıf telefonlarda kilitlenebilir.
// Mobil algılanırsa kullanıcı UYARILIR ve onay istenir; zorlamayız.
// ════════════════════════════════════════════════════════════════════════════
const DwgOkuyucu = (() => {

  let _dwg = null;          // hazır LibreDwg örneği
  let _yukleniyor = null;   // eşzamanlı çağrıları tek yüklemede toplar

  const WASM_BOYUT_MB = 9.5;

  function mobilMi() {
    try {
      return window.innerWidth <= 768 ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    } catch (e) { return false; }
  }

  function dwgDosyasiMi(dosya) {
    if (!dosya) return false;
    return /\.dwg$/i.test(dosya.name || '');
  }

  // ── ÇÖZÜMLEME (Web Worker içinde) ────────────────────────────────────────
  // CAD motoru ana iş parçacığında DEĞİL, worker'da çalışır. İki sebep:
  //   1) GÜVENLİK: Emscripten `new Function` kullanır ve 'unsafe-eval' ister.
  //      Worker kendi CSP'sini kendi yanıtından alır; izin yalnızca
  //      vendor/dwg/ klasörüne verilir, ana uygulama sıkı kalır.
  //   2) PERFORMANS: 9,5 MB WASM derlemesi arayüzü kilitlemez.
  let _worker = null;

  function workerAl() {
    if (_worker) return _worker;
    const yol = new URL('vendor/dwg/dwg_worker.js', document.baseURI).href;
    // type:'module' — worker içinde dinamik import kullanılıyor
    _worker = new Worker(yol, { type: 'module' });
    return _worker;
  }

  // Worker'ı sıfırla (hata sonrası temiz başlangıç için)
  function kapat() {
    if (_worker) { try { _worker.terminate(); } catch (e) { } _worker = null; }
  }

  async function metinleriCikar(dosya, ilerleme) {
    const buf = await dosya.arrayBuffer();
    return new Promise((cz, rd) => {
      let w;
      try { w = workerAl(); }
      catch (e) {
        rd(new Error('CAD işçisi başlatılamadı: ' + ((e && e.message) || e) +
          ' — vendor/dwg klasörünün sunucuya yüklendiğinden emin olun.'));
        return;
      }
      const temizle = () => { w.onmessage = null; w.onerror = null; };
      w.onmessage = (e) => {
        const d = e.data || {};
        if (d.tip === 'ilerleme') {
          if (typeof ilerleme === 'function') ilerleme(d.mesaj);
          return;
        }
        if (d.tip === 'tamam') { temizle(); cz(d.sonuc); return; }
        if (d.tip === 'hata') {
          temizle(); kapat();          // bozuk durum kalmasın
          rd(new Error(d.mesaj || 'CAD çözümlemesi başarısız.'));
        }
      };
      w.onerror = (ev) => {
        temizle(); kapat();
        rd(new Error('CAD işçisi çalıştırılamadı' +
          (ev && ev.message ? ': ' + ev.message : '') +
          '. vendor/dwg/.htaccess dosyasının yüklendiğinden emin olun.'));
      };
      // ArrayBuffer aktarılabilir: kopyalanmaz, taşınır (büyük dosyada hızlı)
      w.postMessage({ tip: 'coz', veri: buf }, [buf]);
    });
  }

  // ── SUNUCU TEŞHİSİ ───────────────────────────────────────────────────────
  // CSP ve MIME sorunlarında tahmin yürütmek yerine sunucunun GERÇEKTE ne
  // gönderdiğini ölçer. "htaccess'i yükledim ama olmuyor" durumunda hangi
  // adımın eksik kaldığını kesinleştirir.
  async function sunucuTeshisi() {
    const rapor = { csp: null, cspWasmIzni: false, wasmTipi: null, wasmUlasilir: false, notlar: [] };

    // 1) Sayfanın CSP başlığını oku
    try {
      const r = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
      rapor.csp = r.headers.get('content-security-policy');
      if (!rapor.csp) {
        rapor.notlar.push('Sunucu CSP başlığı GÖNDERMİYOR. Bu durumda WebAssembly engellenmez — ' +
          'engelleniyorsa CSP başka yerden (hosting paneli veya üst klasör .htaccess) geliyor olabilir.');
      } else {
        rapor.cspWasmIzni = /wasm-unsafe-eval|'unsafe-eval'/.test(rapor.csp);
        if (!rapor.cspWasmIzni) {
          rapor.notlar.push("Sunucunun gönderdiği CSP'de 'wasm-unsafe-eval' YOK. " +
            ".htaccess sunucuya yüklenmemiş ya da başka bir .htaccess/panel ayarı üzerine yazıyor.");
        }
      }
    } catch (e) {
      rapor.notlar.push('Sayfa başlıkları okunamadı: ' + ((e && e.message) || e));
    }

    // 2) WASM dosyası ulaşılabilir mi ve doğru tiple mi geliyor
    try {
      const yol = new URL('vendor/dwg/wasm/libredwg-web.wasm', document.baseURI).href;
      const r2 = await fetch(yol, { method: 'HEAD', cache: 'no-store' });
      rapor.wasmUlasilir = r2.ok;
      rapor.wasmTipi = r2.headers.get('content-type');
      if (!r2.ok) {
        rapor.notlar.push('CAD motoru dosyası bulunamadı (HTTP ' + r2.status + '). ' +
          'vendor/dwg/wasm klasörü sunucuya yüklenmemiş.');
      } else if (rapor.wasmTipi && !/application\/wasm/i.test(rapor.wasmTipi)) {
        rapor.notlar.push('WASM dosyası "' + rapor.wasmTipi + '" tipiyle geliyor; ' +
          '"application/wasm" olmalı. .htaccess yüklenmemiş olabilir.');
      }
    } catch (e) {
      rapor.notlar.push('CAD motoru dosyasına erişilemedi: ' + ((e && e.message) || e));
    }

    // 3) CAD klasörünün KENDİ CSP'si — asıl belirleyici olan budur.
    // Worker kendi politikasını kendi yanıtından alır; ana sayfanınki değil.
    try {
      const wYol = new URL('vendor/dwg/dwg_worker.js', document.baseURI).href;
      const r3 = await fetch(wYol, { method: 'HEAD', cache: 'no-store' });
      rapor.workerUlasilir = r3.ok;
      rapor.workerCsp = r3.headers.get('content-security-policy');
      if (!r3.ok) {
        rapor.notlar.push('CAD işçisi dosyası bulunamadı (HTTP ' + r3.status + '). ' +
          'vendor/dwg/dwg_worker.js yüklenmemiş.');
      } else if (!rapor.workerCsp || !/'unsafe-eval'/.test(rapor.workerCsp)) {
        rapor.notlar.push("CAD klasörünün kendi güvenlik ayarı eksik: vendor/dwg/.htaccess " +
          "sunucuya yüklenmemiş. Bu dosya CAD motoruna gereken 'unsafe-eval' iznini " +
          "YALNIZCA o klasöre verir (ana uygulama sıkı kalır).");
      }
    } catch (e) {
      rapor.notlar.push('CAD işçisi kontrol edilemedi: ' + ((e && e.message) || e));
    }

    if (!rapor.notlar.length) {
      // Sunucu doğru ama hata alındıysa sebep neredeyse her zaman şudur:
      // CSP sayfa YÜKLENİRKEN uygulanır. .htaccess sayfa açıldıktan SONRA
      // güncellendiyse, açık sekmede hâlâ ESKİ politika geçerlidir.
      rapor.notlar.push('Sunucu ayarları doğru görünüyor. ' +
        'Buna rağmen hata aldıysanız: güvenlik politikası sayfa açılırken uygulanır — ' +
        'ayarlar siz sayfayı açtıktan SONRA güncellenmiş olabilir. ' +
        'Sayfayı yenileyip (Ctrl+Shift+R) tekrar deneyin.');
      rapor.yenilemeGerekli = true;
    }
    return rapor;
  }

  // Mobil uyarısı — kullanıcıya karar bırakılır, zorlanmaz
  function mobilUyari() {
    return `Bu dosya için CAD motoru indirilecek (~${WASM_BOYUT_MB} MB) ve telefonunuzda ` +
      `çalıştırılacak. Zayıf cihazlarda uygulama yavaşlayabilir veya donabilir.\n\n` +
      `Öneri: DWG okumayı bilgisayarda yapın. Alternatif olarak AutoCAD'den ` +
      `PDF çıkarıp yükleyebilirsiniz — o yöntem telefonda da hafif çalışır.\n\n` +
      `Yine de devam edilsin mi?`;
  }

  return { dwgDosyasiMi, mobilMi, mobilUyari, metinleriCikar, kapat, sunucuTeshisi, WASM_BOYUT_MB };
})();

if (typeof module !== 'undefined') module.exports = DwgOkuyucu;
