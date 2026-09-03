// BULGU: İş Emri/Sipariş İptal ekranı (page_iptal_islemleri.js) yalnızca
// 'iptal'/'tamamlandi'/'kapatildi' durumlarını "kapalı" sayıyordu —
// 'sevk_edildi' (irsaliye/fatura kesilmiş, mal müşteriye fiilen gitmiş) ve
// 'reddedildi' (zaten kapanmış) siparişler hâlâ "açık" listesinde görünüp
// İPTAL EDİLEBİLİYORDU. Ayrıca sarf-kontrolü engeli (#4 — "bu işe bağlı
// stok çıkışı yapılmış mı") sevkiyat kaynaklı stok çıkışını hiç
// YAKALAYAMIYORDU çünkü app.js:sevkiyatYapilinceStoktanDus oluşturduğu
// stokHareketleri kaydına siparisId yazmıyordu.
// İki katmanlı düzeltme:
//  1) app.js: sevkiyatYapilinceStoktanDus artık siparisId parametresi alıp
//     stok hareketi kaydına yazıyor (page_cari_panel.js ve
//     page_sevkiyat_panel.js çağıran taraflar siparis.id'yi geçiyor).
//  2) page_iptal_islemleri.js: iptalEdilebilirDurum artık 'sevk_edildi' ve
//     'reddedildi'yi de KAPALI sayıyor.
// Tüm dosyalar Store/DOM'a derinden bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const cariSrc = fs.readFileSync(path.join(__dirname, '..', 'page_cari_panel.js'), 'utf8');
const sevkSrc = fs.readFileSync(path.join(__dirname, '..', 'page_sevkiyat_panel.js'), 'utf8');
const iptalSrc = fs.readFileSync(path.join(__dirname, '..', 'page_iptal_islemleri.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- app.js: sevkiyatYapilinceStoktanDus artık siparisId alıp kaydediyor --');
t('fonksiyon imzasında siparisId parametresi var',
  /async function sevkiyatYapilinceStoktanDus\(urunId, urunAd, miktar, siparisId\) \{/.test(appSrc));
t('stok hareketi kaydına siparisId yazılıyor',
  /stokHareketleri\.push\(\{ id: uid\('HRK'\), tip: 'cikis', ambar: 'sevkiyat_deposu', kalemAdi: urunAd, miktar, siparisId: siparisId \|\| null,/.test(appSrc));

console.log('\n-- Çağıran taraflar siparis.id\'yi geçiyor --');
t('page_cari_panel.js (Fatura+İrsaliye akışı) siparis.id geçiyor',
  /App\.sevkiyatYapilinceStoktanDus\(urun\.id, urun\.ad, kalem\.miktar \|\| 1, siparis\.id\)/.test(cariSrc));
t('page_sevkiyat_panel.js (İrsaliye akışı) siparis.id geçiyor',
  /App\.sevkiyatYapilinceStoktanDus\(urun\.id, urun\.ad, kalem\.miktar \|\| 1, siparis\.id\)/.test(sevkSrc));

console.log('\n-- page_iptal_islemleri.js: sevk edilmiş/reddedilmiş siparişler artık KAPALI --');
t('iptalEdilebilirDurum artık sevk_edildi ve reddedildi\'yi de hariç tutuyor',
  /const iptalEdilebilirDurum = \(d\) => !\['iptal', 'tamamlandi', 'kapatildi', 'sevk_edildi', 'reddedildi'\]\.includes\(d\);/.test(iptalSrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
