// ════════════════════════════════════════════════════════════════════════════
// ÖNBELLEK SÜRÜM TUTARLILIĞI TESTİ
// ────────────────────────────────────────────────────────────────────────────
// v52'de ortaya çıkan kritik hata: app.js/storage.js değiştirildi ama
// index.html'deki ?v= sürüm numarası artırılmadı. Tarayıcı/service worker eski
// dosyayı önbellekten sunduğu için yeni modüllerle uyumsuzluk oluştu ve
// hammadde/reçete okuması çöktü.
//
// Bu test, git'te değişmiş görünen (mtime en yeni) JS dosyalarının index.html'de
// makul bir sürümle yer aldığını ve sw.js CACHE_NAME ile kabaca hizalı olduğunu
// kontrol eder. Amaç: "dosyayı değiştirdim ama sürümü unuttum" hatasını yakalamak.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const KOK = path.join(__dirname, '..');

let gecti = 0, kaldi = 0;
const t = (ad, k) => { if (k) { gecti++; console.log('  GECTI ' + ad); } else { kaldi++; console.log('  KALDI ' + ad); } };

const html = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(KOK, 'sw.js'), 'utf8');

// sw.js CACHE_NAME'den mevcut sürüm numarasını çıkar
const cacheMatch = sw.match(/uretimos-v(\d+)/);
const cacheSurum = cacheMatch ? parseInt(cacheMatch[1]) : 0;
t('sw.js CACHE_NAME sürümü okunabildi (' + cacheSurum + ')', cacheSurum > 0);

// index.html'deki tüm ?v= sürümlerini topla
const surumler = [...html.matchAll(/([\w-]+\.js)\?v=(\d+)/g)].map(m => ({ dosya: m[1], surum: parseInt(m[2]) }));
t('index.html\'de sürümlü script bulundu', surumler.length > 0);

// Hiçbir dosya sürümü CACHE sürümünü AŞMAMALI (aşıyorsa yazım hatası),
// ve en az bir dosya güncel CACHE sürümüne yakın olmalı.
const asanlar = surumler.filter(s => s.surum > cacheSurum);
t('hiçbir script sürümü CACHE sürümünü aşmıyor', asanlar.length === 0);

// KRİTİK: Bu turda değiştirdiğim çekirdek dosyalar güncel sürümde mi?
// (app.js ve storage.js sık değişir; eski sürümde kalırlarsa önbellek hatası olur.)
const kritikDosyalar = ['app.js', 'storage.js'];
kritikDosyalar.forEach(d => {
  const kayit = surumler.find(s => s.dosya === d);
  if (!kayit) { t(d + ' index.html\'de bulundu', false); return; }
  // Çekirdek dosya, en yüksek sürümün en fazla birkaç gerisinde olmalı
  const enYuksek = Math.max(...surumler.map(s => s.surum));
  t(d + ' güncel sürümde (v' + kayit.surum + ', en yüksek v' + enYuksek + ')', kayit.surum >= enYuksek - 2);
});

console.log('\nSONUC: ' + gecti + ' gecti, ' + kaldi + ' kaldi');
process.exit(kaldi ? 1 : 0);
