// ── Reçete Tamamlama Botu — otomatik tetikleyicilerin KAYNAK metin kontrolü ─
// GERÇEK İHTİYAÇ: "botları sisteme kur ve çalışmaya başlasın, sürekli
// çalışmaya devam etsin." Bu test, iki otomatik tetikleyicinin (içe aktarma
// sonrası + oturum başlangıcı) GERÇEKTEN bağlandığını doğrular.
const fs = require('fs'), path = require('path');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };
const tf = (a, fn) => t(a, fn()); // koşulu bir fonksiyon içinde hesaplayıp t()'ye SONUCUNU geçirir

const kartlarKaynak = fs.readFileSync(path.join(__dirname, '..', 'page_kartlar.js'), 'utf8');
const appKaynak = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

console.log('\n-- TETİKLEYİCİ 1: içe aktarma sonrası (page_kartlar.js) --');
t('"İçe Aktar ve Kaydet" başarılı olunca botCalistirVeUygula(\'ice_aktar_sonrasi\') çağrılıyor',
  kartlarKaynak.includes("PageModules.recete_tamamlama_botu.botCalistirVeUygula('ice_aktar_sonrasi')"));
tf('bot çağrısı AWAIT EDİLMİYOR (kullanıcıyı zaten yavaş olan içe aktarma akışında fazladan BEKLETMİYOR)', () => {
  const idx = kartlarKaynak.indexOf("PageModules.recete_tamamlama_botu.botCalistirVeUygula('ice_aktar_sonrasi')");
  const satirBasi = kartlarKaynak.lastIndexOf('\n', idx);
  const satir = kartlarKaynak.slice(satirBasi, idx);
  return !/await\s*$/.test(satir.trim());
});
t('bot hatası .catch ile yutuluyor (içe aktarmanın BAŞARI mesajını/akışını ETKİLEMİYOR)',
  kartlarKaynak.includes("Reçete Tamamlama Botu (içe aktarma sonrası) hatası"));
tf('bot çağrısı render(main) ve başarı toast\'ından SONRA yapılıyor (içe aktarmanın kendisini GECİKTİRMİYOR)', () => {
  const toastIdx = kartlarKaynak.indexOf('İçe aktarma tamamlandı:');
  const botIdx = kartlarKaynak.indexOf("botCalistirVeUygula('ice_aktar_sonrasi')");
  return toastIdx > -1 && botIdx > toastIdx;
});

console.log('\n-- TETİKLEYİCİ 2: oturum başlangıcı / periyodik (app.js) --');
t('botArkaPlandaCalistirGerekirse fonksiyonu tanımlı', appKaynak.includes('async function botArkaPlandaCalistirGerekirse(rol)'));
t('sadece hassas üretim verisine erişimi olan rollerde çalışıyor',
  appKaynak.includes("if (!['admin', 'arge', 'teknik_ofis', 'yonetim'].includes(rol)) return;"));
t('son çalışmadan BOT_BEKLEME_SAATI geçmediyse TEKRAR çalıştırmıyor (gereksiz sık taramayı önlüyor)',
  appKaynak.includes('const BOT_BEKLEME_SAATI = 4;') &&
  appKaynak.includes('BOT_BEKLEME_SAATI * 3600 * 1000) return;'));
tf('fresh giriş (selectRole) sonrası tetikleyici çağrılıyor', () => {
  const selectRoleIdx = appKaynak.indexOf('function selectRole(roleId, kullanici)');
  const cagriIdx = appKaynak.indexOf('setTimeout(() => botArkaPlandaCalistirGerekirse(state.role), 2000);', selectRoleIdx);
  return selectRoleIdx > -1 && cagriIdx > selectRoleIdx && cagriIdx < selectRoleIdx + 2000;
});
tf('sayfa yenileme / oturum geri yükleme (init içindeki savedRole dalı) sonrası da tetikleyici çağrılıyor', () => {
  const sayisi = (appKaynak.match(/setTimeout\(\(\) => botArkaPlandaCalistirGerekirse\(state\.role\), 2000\);/g) || []).length;
  return sayisi === 2; // biri selectRole'de (fresh giriş), biri init()'in savedRole dalında (sayfa yenileme)
});
tf('tetikleyici çağrısı AWAIT EDİLMİYOR (uygulama açılışını/giriş akışını BLOKLAMIYOR)', () => {
  const idx = appKaynak.indexOf('setTimeout(() => botArkaPlandaCalistirGerekirse(state.role), 2000);');
  const satirBasi = appKaynak.lastIndexOf('\n', idx);
  const satir = appKaynak.slice(satirBasi, idx);
  return !/await\s*$/.test(satir.trim());
});

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
