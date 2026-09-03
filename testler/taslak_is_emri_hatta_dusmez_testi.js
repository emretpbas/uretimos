// BULGU: "taslak" (planlamanın henüz ÜRETİME ALMADIĞI) iş emirleri hatta
// (istasyonIsleri) ve üretim çizelgesine düşüyordu — sadece "tamamlandi"
// hariç tutuluyordu, "taslak" dahil ediliyordu. Düzeltme: yalnızca
// "uretimde" durumundaki iş emirleri sahaya/çizelgeye düşer. Bu dosya,
// diğer hat_yonetim_testi.js/iptal_testi.js ile aynı desende (kaynak kod
// üzerinde regex doğrulama) — bu dosyalar Store/App'e derinden bağlı
// olduğu için doğrudan çalıştırılamıyor.
const fs = require('fs'), path = require('path');
const KOK = path.join(__dirname, '..');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const hatTakip = fs.readFileSync(path.join(KOK, 'page_hat_takip.js'), 'utf8');
const cizelgeMotor = fs.readFileSync(path.join(KOK, 'cizelge_motor.js'), 'utf8');
const pageCizelge = fs.readFileSync(path.join(KOK, 'page_cizelge.js'), 'utf8');

console.log('\n-- HATTA SENKRONİZASYON (page_hat_takip.js) --');
t('iş emirleri filtresi artık sadece "uretimde"', /isemirleri\.filter\(ie => ie\.durum === 'uretimde'\)/.test(hatTakip));
t('eski hatalı filtre (taslak dahil) KULLANILMIYOR', !/isemirleri\.filter\(ie => ie\.durum !== 'tamamlandi'\)/.test(hatTakip));
t('taslak iş emri id kümesi hesaplanıyor', /taslakIeIdleri = new Set\(isemirleri\.filter\(ie => ie\.durum === 'taslak'\)/.test(hatTakip));
t('geri alma yalnızca DOKUNULMAMIŞ kartları hedefliyor (barkod/kalite/işlem/sevk/fire kontrolü)',
  /!x\.barkodOkundu && !x\.kaliteOnayliAdet && !x\.islemTamamAdet && !x\.sevkEdilenAdet && !x\.fireAdet/.test(hatTakip));
t('geri alma sadece kaynakTip ie olan kartları hedefliyor', /x\.kaynakTip === 'ie' && taslakIeIdleri\.has\(x\.kaynakId\)/.test(hatTakip));
t('geri alma isler dizisini splice ile günceller (referans korunur)', /isler\.splice\(0, isler\.length, \.\.\.isler\.filter/.test(hatTakip));

console.log('\n-- ÜRETİM ÇİZELGESİ (cizelge_motor.js) --');
t('operasyonlariCikar artık sadece "uretimde" iş emirlerini çizelgeliyor', /\(v\.isemirleri \|\| \[\]\)\.filter\(ie => ie\.durum === 'uretimde'\)/.test(cizelgeMotor));
t('eski hatalı filtre KULLANILMIYOR', !/\(v\.isemirleri \|\| \[\]\)\.filter\(ie => ie\.durum !== 'tamamlandi'\)/.test(cizelgeMotor));

console.log('\n-- ÜRÜN KAPASİTESİ SEKMESİ (page_cizelge.js) --');
t('planlanan adet hesabı artık sadece "uretimde" iş emirlerini sayıyor', /isemirleri\.filter\(ie => ie\.durum === 'uretimde'\)/.test(pageCizelge));
t('eski hatalı filtre KULLANILMIYOR', !/isemirleri\.filter\(ie => ie\.durum !== 'tamamlandi'\)/.test(pageCizelge));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
