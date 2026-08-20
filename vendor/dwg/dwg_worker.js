// ════════════════════════════════════════════════════════════════════════════
// DWG İŞÇİSİ (Web Worker) — CAD çözümlemesi ayrı iş parçacığında
// ────────────────────────────────────────────────────────────────────────────
// NEDEN WORKER:
// LibreDWG'nin Emscripten yapıştırıcı kodu `new Function` kullanır (embind:
// C++ fonksiyonlarını JS'e bağlarken çalışma anında fonksiyon üretir). Bu,
// CSP'de 'unsafe-eval' gerektirir — 'wasm-unsafe-eval' YETMEZ.
//
// 'unsafe-eval'i TÜM uygulamaya vermek XSS korumasını ciddi biçimde zayıflatır.
// Bunun yerine çözümleme bu worker'a taşındı: worker kendi CSP'sini kendi HTTP
// yanıtından alır. vendor/dwg/.htaccess yalnızca BU KLASÖRE 'unsafe-eval'
// verir; ana sayfa sıkı politikada kalır.
//
// EK FAYDA: 9,5 MB WASM'ın derlenmesi ve çözümleme arayüzü kilitlemez —
// telefonda donma riski belirgin şekilde azalır.
// ════════════════════════════════════════════════════════════════════════════

let _dwg = null;

function bildir(tip, veri) { self.postMessage({ tip, ...veri }); }

// MTEXT biçim kodlarını temizler (ana modüldekiyle aynı kural)
function metniTemizle(ham) {
  let s = String(ham || '');
  s = s.replace(/\\P/g, '\n');
  s = s.replace(/\\[A-Za-z][^;\\]*;/g, '');
  s = s.replace(/\\[LlOoKkNn]/g, '');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\\\\/g, '\\');
  return s.trim();
}

self.onmessage = async (e) => {
  const { tip, veri } = e.data || {};
  if (tip !== 'coz') return;
  try {
    if (!_dwg) {
      bildir('ilerleme', { mesaj: 'CAD motoru yükleniyor…' });
      // Worker kendi konumuna göre çözer: dist/ ve wasm/ kardeş klasörlerdir
      const mod = await import('./dist/libredwg-bundle.js');
      if (!mod || !mod.LibreDwg) throw new Error('CAD motoru paketi okunamadı.');
      bildir('ilerleme', { mesaj: 'CAD motoru başlatılıyor…' });
      _dwg = await mod.LibreDwg.create();
    }

    bildir('ilerleme', { mesaj: 'Çizim okunuyor…' });
    const ptr = _dwg.dwg_read_data(veri, 0);
    if (!ptr) throw new Error('DWG dosyası okunamadı. Dosya bozuk olabilir ' +
      'veya desteklenmeyen bir sürümde kaydedilmiş olabilir.');

    let surum = '';
    try { surum = _dwg.dwg_get_version_type(ptr) || ''; } catch (x) { }

    bildir('ilerleme', { mesaj: 'Varlıklar çözümleniyor…' });
    const db = _dwg.convert(ptr);
    const varliklar = (db && db.entities) || [];

    const metinler = [];
    varliklar.forEach(ent => {
      if (ent.type !== 'MTEXT' && ent.type !== 'TEXT') return;
      const temiz = metniTemizle(ent.text || ent.textString || ent.value || '');
      if (!temiz) return;
      const n = ent.insertionPoint || ent.startPoint || ent.alignmentPoint || {};
      const x = +n.x || 0, y = +n.y || 0;
      temiz.split('\n').forEach((satir, i) => {
        const s = satir.trim();
        if (s) metinler.push({ str: s, x, y: y - i * 0.001, katman: ent.layer || '' });
      });
    });

    const tipSayim = {};
    varliklar.forEach(ent => { tipSayim[ent.type] = (tipSayim[ent.type] || 0) + 1; });

    // ── BLOK (INSERT) TOPLAMA ────────────────────────────────────────────
    // AutoCAD'de mobilya/tefriş sembolleri BLOK olarak yerleştirilir ve
    // blokların ADI vardır: "120 etajerli masa", "WC3", "LAV", "door_..."
    // Bu adlar planda YAZILI değildir ama dosyada mevcuttur — keşif için
    // altın değerinde veridir. Konumlarıyla birlikte gönderilir ki mahallere
    // atanabilsinler.
    const bloklar = [];
    varliklar.forEach(ent => {
      if (ent.type !== 'INSERT') return;
      const ad = ent.name || ent.blockName || ent.blockRecordName || '';
      if (!ad) return;
      const n = ent.insertionPoint || ent.position || {};
      bloklar.push({ ad: String(ad).trim(), x: +n.x || 0, y: +n.y || 0, katman: ent.layer || '' });
    });

    bildir('tamam', {
      sonuc: { kaynak: 'dwg', surum, varlikSayisi: varliklar.length, metinler, bloklar, tipSayim }
    });
  } catch (err) {
    const m = String((err && err.message) || err);
    let dostane = m;
    if (/Content Security Policy|unsafe-eval/i.test(m)) {
      dostane = 'CAD motoru için güvenlik izni eksik. vendor/dwg/.htaccess dosyası ' +
        'sunucuya yüklenmemiş olabilir — bu dosya yalnızca CAD klasörüne ' +
        "'unsafe-eval' izni verir.";
    } else if (/magic word|MIME|application\/wasm|incorrect response/i.test(m)) {
      dostane = 'Sunucu .wasm dosyasını yanlış türde gönderiyor. ' +
        '.htaccess dosyasına "AddType application/wasm .wasm" eklenmeli.';
    }
    bildir('hata', { mesaj: dostane, ham: m });
  }
};
