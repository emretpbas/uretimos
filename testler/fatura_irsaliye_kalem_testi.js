// BULGU (T1-5): page_cari_panel.js:openFaturaIrsaliyeForm ("Fatura & İrsaliye
// Kes" — sipariş için tek adımda hem irsaliye hem fatura kesen form) irsaliye
// nesnesine kalemler alanını hiç yazmıyordu. Bu irsaliyeler için e-İrsaliye
// (UBL DespatchAdvice) üretilemiyordu ve irsaliye kaydı, hangi ürünün ne
// kadar sevk edildiğini göstermiyordu — page_sevkiyat_panel.js:
// openIrsaliyeForm'daki DOĞRU örnekle (kaynak/kod/ad/miktar/birim/netFiyat/
// kdvOrani/ikinciKalite/iadeKalemId şekli) tutarsızdı.
// Düzeltme: irsaliye.kalemler artık siparişin kalemlerinden AYNI şekilde
// türetiliyor.
// page_cari_panel.js Store/DOM'a derinden bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_cari_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const fnMatch = src.match(/function openFaturaIrsaliyeForm\(siparis, onSaved\) \{[\s\S]*?\n  \}\n/);
const fn = fnMatch ? fnMatch[0] : '';
t('openFaturaIrsaliyeForm fonksiyonu bulundu', !!fn);

console.log('\n-- irsaliye nesnesi artık kalemler alanı taşıyor --');
t('irsaliye.kalemler siparişin kalemlerinden türetiliyor',
  /kalemler: \(siparis\.kalemler \|\| \[\]\)\.map\(k => \(\{/.test(fn));
t('kaynak alanı doğru belirleniyor (2. kalite / yarımamül / ürün)',
  /kaynak: k\.ikinciKalite \? 'ikinci_kalite' : \(k\.grup === 'yarimamul' \? 'yarimamul' : 'urun'\),/.test(fn));
t('kod/ad/miktar/birim/netFiyat/kdvOrani/ikinciKalite/iadeKalemId taşınıyor (page_sevkiyat_panel.js ile aynı şekil)',
  /kod: k\.kod, ad: k\.ad, miktar: k\.miktar \|\| 1, birim: k\.birim \|\| 'ADET',/.test(fn) &&
  /netFiyat: k\.netFiyat \|\| 0, kdvOrani: k\.kdvOrani \?\? 20,/.test(fn) &&
  /ikinciKalite: !!k\.ikinciKalite, iadeKalemId: k\.iadeKalemId \|\| null/.test(fn));

console.log('\n-- Referans doğru örnek (page_sevkiyat_panel.js) hâlâ aynı şekilde (regresyon yok) --');
const sevkSrc = fs.readFileSync(path.join(__dirname, '..', 'page_sevkiyat_panel.js'), 'utf8');
t('page_sevkiyat_panel.js:openIrsaliyeForm hâlâ aynı kalem şeklini kullanıyor',
  /kaynak: k\.ikinciKalite \? 'ikinci_kalite' : \(k\.grup === 'yarimamul' \? 'yarimamul' : 'urun'\),/.test(sevkSrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
