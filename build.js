#!/usr/bin/env node
/**
 * ÜretimOS — Üretim (production) derleme betiği.
 * ─────────────────────────────────────────────────────────────────────────
 * NE YAPAR: Tüm .js dosyalarını minify + obfuscate eder:
 *   • Tüm YORUMLARI siler (iş mantığı, formül, marj notları artık görünmez)
 *   • Değişken/fonksiyon adlarını kısaltır (okunabilirliği yok eder)
 *   • Boşluk/satır sonlarını kaldırır (tek satır, dosya küçülür)
 *
 * NE YAPMAZ (dürüst sınır): Kodu "kopyalanamaz" YAPMAZ. Belirlenmiş biri
 * minify'ı çözebilir. Amaç: sıradan kopyalamayı ve iş mantığı okumayı
 * ZORLAŞTIRMAK, ticari bilginin yorumlardan sızmasını ENGELLEMEK.
 *
 * KULLANIM:
 *   node build.js            → app/ içindeki .js'leri dist/ altına minify eder
 *   Sonra cPanel'e dist/ içeriğini yükleyin (app/ kaynağını DEĞİL).
 *
 * ÖNEMLİ: Orijinal okunabilir kaynak app/ içinde KALIR — geliştirmeye onunla
 * devam edersiniz. dist/ yalnızca sunucuya giden sürümdür.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KAYNAK = __dirname;                    // app/ (bu betik app/ içinde çalışır)
const HEDEF = path.join(__dirname, 'dist');  // dist/ (minify çıktısı)

// Minify EDİLMEYECEK dosyalar (zaten minify veya kütüphane).
const ATLA = new Set(['three.min.js', 'sw.js', 'build.js', 'pdf.min.js', 'pdf.worker.min.js', 'xlsx.full.min.js']);

// Dağıtıma HİÇ GİRMEYECEK dosyalar: geliştirme/test yardımcıları ve iç
// mühendislik notları. Kod değil, üretim sunucusunda durmasına gerek yok.
const HARIC = new Set(['_test_import_tf.js', 'sunucu_testi.php']);
const HARIC_UZANTI = /\.md$/i;

function temizle(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

// Bir klasörü içeriğiyle birlikte olduğu gibi kopyalar (dokunmadan)
function klasoruKopyala(kaynak, hedef) {
  if (!fs.existsSync(hedef)) fs.mkdirSync(hedef, { recursive: true });
  fs.readdirSync(kaynak).forEach(ad => {
    const k = path.join(kaynak, ad), h = path.join(hedef, ad);
    const st = fs.statSync(k);
    if (st.isDirectory()) klasoruKopyala(k, h);
    else fs.copyFileSync(k, h);
  });
}

function kopyalaVeMinify() {
  temizle(HEDEF);
  const dosyalar = fs.readdirSync(KAYNAK);
  let minifyEdilen = 0, kopyalanan = 0;

  for (const dosya of dosyalar) {
    const tamYol = path.join(KAYNAK, dosya);
    const stat = fs.statSync(tamYol);

    // Alt klasörler (testler, dosyalar, backups) dağıtıma girmez
    if (stat.isDirectory()) {
      // vendor/ klasörü OLDUĞU GİBİ kopyalanır: içindeki kütüphaneler zaten
      // derlenmiş/küçültülmüştür, tekrar minify etmek bozar (özellikle .wasm).
      if (dosya === 'vendor') klasoruKopyala(tamYol, path.join(HEDEF, dosya));
      continue;
    }

    if (HARIC.has(dosya) || HARIC_UZANTI.test(dosya)) continue;

    const hedefYol = path.join(HEDEF, dosya);

    if (dosya.endsWith('.js') && !ATLA.has(dosya)) {
      // Minify + mangle (değişken adı kısaltma) + yorum sil
      try {
        execSync(`npx terser "${tamYol}" -c -m --comments false -o "${hedefYol}"`, { stdio: 'pipe' });
        minifyEdilen++;
      } catch (e) {
        console.error(`  ✗ Minify hatası: ${dosya} — ham kopyalanıyor`);
        fs.copyFileSync(tamYol, hedefYol);
      }
    } else {
      // .php, .html, .css, three.min.js, sw.js, .htaccess vb. olduğu gibi kopyala
      fs.copyFileSync(tamYol, hedefYol);
      kopyalanan++;
    }
  }
  return { minifyEdilen, kopyalanan };
}

console.log('ÜretimOS üretim derlemesi başlıyor…\n');
const { minifyEdilen, kopyalanan } = kopyalaVeMinify();
console.log(`  ✓ ${minifyEdilen} JS dosyası minify+obfuscate edildi`);
console.log(`  ✓ ${kopyalanan} diğer dosya kopyalandı`);
console.log(`\nÇıktı: dist/  →  cPanel'e BUNU yükleyin (app/ kaynağını değil).`);
console.log('Not: Orijinal okunabilir kaynak app/ içinde kaldı; geliştirmeye onunla devam edin.');
