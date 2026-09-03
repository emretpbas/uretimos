// BULGU (T3-21): page_hat_terminal.js'teki (Hat Terminal — operatör
// dokunmatik ekranı) kalite reddi (ho-red) HER ZAMAN fireye ayırıyordu;
// page_hat_takip.js'teki (Planlama/Yönetim ekranı) ht-red'de bulunan
// "önceki operasyona geri gönder" (düzeltilip tekrar akışa sokulabilecek
// parçalar için) seçeneği Terminal'de HİÇ yoktu — operatör hatalı bir
// parçayı düzeltmek yerine sadece hurdaya ayırabiliyordu.
// Düzeltme: aynı mantık (rotanın önceki adımlarından hedef seçilir, o
// istasyona iş kartı olarak eklenir/mevcut karta eklenir) Terminal'e de
// taşındı — bu ekranın kendi mevcut alan adları (kaliteRedleri, hand-rolled
// NCR) korunarak.
// page_hat_terminal.js Store/DOM'a derinden bağlı olduğu için (diğer
// page_* testleriyle aynı desende) kaynak kod üzerinde regex doğrulama
// yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_hat_terminal.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const fnMatch = src.match(/main\.querySelectorAll\('\.ho-red'\)\.forEach\(b => b\.onclick = async \(\) => \{[\s\S]*?\n    \}\);/);
const fn = fnMatch ? fnMatch[0] : '';
t('ho-red handler bulundu', !!fn);

console.log('\n-- Rotanın önceki adımları hesaplanıyor (page_hat_takip.js ile aynı mantık) --');
t('rota/steps yükleniyor, TAŞIMA hariç önceki adımlar filtreleniyor',
  /const oncekiler = steps\.slice\(0, is\.stepIndex\)\.map\(\(st, i\) => \(\{ \.\.\.st, index: i \}\)\)\.filter\(st => st\.hat !== 'TAŞIMA'\);/.test(fn));

console.log('\n-- Karar seçimi: FİRE veya ÖNCEKİ OPERASYON DÜZELTMESİ --');
t('Karar dropdown\'ında geri gönder seçeneği (önceki adım varsa) sunuluyor',
  /ÖNCEKİ OPERASYON DÜZELTMESİ — istasyona geri gönder/.test(fn));
t('karar=geri seçilince hedef istasyon alanı gösteriliyor (hr-hedef-wrap)',
  /document\.getElementById\('hr-karar'\)\.onchange = \(e\) => \{\s*\n\s*document\.getElementById\('hr-hedef-wrap'\)\.style\.display = e\.target\.value === 'geri' \? '' : 'none';/.test(fn));

console.log('\n-- Kaydet: karar=geri olduğunda parça fireye DEĞİL hedef istasyona gidiyor --');
t('karar==="fire" ise fireAdet artıyor',
  /if \(karar === 'fire'\) \{\s*\n\s*is\.fireAdet = \(is\.fireAdet \|\| 0\) \+ adet;/.test(fn));
t('karar==="geri" ise gelenAdet bu istasyondan çıkarılıyor',
  /is\.gelenAdet -= adet; \/\/ bu istasyondan çıkar/.test(fn));
t('hedef istasyonda mevcut kart varsa güncellenir, yoksa yeni iş kartı oluşturulur',
  /if \(hedefIs\) \{ hedefIs\.gelenAdet \+= adet; hedefIs\.durum = 'aktif'; \}/.test(fn) &&
  /id: App\.uid\('IST'\), kaynakTip: is\.kaynakTip, kaynakId: is\.kaynakId,/.test(fn));
t('yeni iş kartı bu ekranın kendi alan adını (kaliteRedleri) da taşıyor',
  /kaliteOnaylari: \[\], islemOnaylari: \[\], sevkler: \[\], redler: \[\], kaliteRedleri: \[\],/.test(fn));

console.log('\n-- NCR açıklamasında karar bilgisi de geçiyor --');
t('NCR aciklamasında "Karar: FİRE / önceki operasyona geri gönderme" var',
  /· Karar: ' \+ \(karar === 'fire' \? 'FİRE' : 'önceki operasyona geri gönderme'\) \+/.test(fn));

console.log('\n-- Regresyon: page_hat_takip.js hâlâ aynı davranışı sağlıyor --');
const hatTakipSrc = fs.readFileSync(path.join(__dirname, '..', 'page_hat_takip.js'), 'utf8');
t('page_hat_takip.js ht-red hâlâ "geri" kararını destekliyor',
  /ÖNCEKİ OPERASYON DÜZELTMESİ — istasyona geri gönder/.test(hatTakipSrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
