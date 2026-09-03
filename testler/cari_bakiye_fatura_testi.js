// BULGU (T1-1): Müşteri cari bakiyesi (musteri.bakiye) yalnızca tahsilatla
// AZALIYORDU (app.js'te dört farklı yerde -=), ama fatura/sipariş
// kesildiğinde HİÇ ARTMIYORDU — açık hesap müşteriler (ödeme planı hiç
// girilmemiş veya kısmen girilmiş siparişler) sonsuza dek borçsuz
// görünüyordu.
// BULGU (T1-2): fatura.odenecekBakiye HER ZAMAN sabit 0 yazılıyordu, hiç
// güncellenmiyordu — bu yüzden ai_denetci.js:228-234'teki "vadesi geçmiş
// fatura" kontrolü (kalan = odenecekBakiye != null ? odenecekBakiye :
// genelToplam) hep kalan=0 buluyor, ASLA tetiklenmiyordu.
//
// Düzeltme: siparisOnaylaninceOdemePlaniniAnindaIsle artık sipariş
// üzerinde ne kadar NET tutarın zaten kasaya/cariye işlendiğini
// (odemePlaniNetKasaToplami) kaydediyor. irsaliyeKesilinceFaturaOlustur bu
// değeri KDV DAHİL genelToplam'dan düşerek fatura.odenecekBakiye'yi doğru
// hesaplıyor VE müşteri bakiyesini genelToplam kadar artırıyor (net etki:
// yalnızca gerçekten ödenmemiş kalan tutar bakiyeye yansır — sipariş
// onayında zaten düşülmüş olan net tutarla birlikte doğru toplanır).
// tahsilatBeklenenOnayla artık ileri tarihli nakit onaylanınca bağlı
// faturanın odenecekBakiye'sini de düşürüyor ("tahsilat geldikçe düş").
// app.js Store/DOM'a derinden bağlı olduğu için (diğer app.js testleriyle
// aynı desende) kaynak kod üzerinde regex doğrulama + izole sayısal
// doğrulama yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- siparisOnaylaninceOdemePlaniniAnindaIsle: kasaya giren net tutar siparişe kaydediliyor --');
t('siparis.odemePlaniNetKasaToplami = netKasaToplami yazılıyor',
  /siparis\.odemePlaniNetKasaToplami = netKasaToplami;/.test(src));

console.log('\n-- irsaliyeKesilinceFaturaOlustur: odenecekBakiye artık HER ZAMAN 0 değil --');
t('sabit "odenecekBakiye: 0" ARTIK YOK',
  !/odenecekBakiye: 0,/.test(src));
t('onayindaKasayaGirenNet siparis.odemePlaniNetKasaToplami\'ni okuyor (yoksa peşinat fallback)',
  /\? \(siparis\.odemePlaniNetKasaToplami != null \? siparis\.odemePlaniNetKasaToplami : pesinatTutar\)/.test(src));
t('odenecekBakiye = genelToplam - onayindaKasayaGirenNet (negatif olamaz)',
  /const odenecekBakiye = Math\.max\(0, genelToplam - onayindaKasayaGirenNet\);/.test(src));
t('fatura objesi artık hesaplanan odenecekBakiye değişkenini kullanıyor (T3-23: yalnızca ilk faturada tam peşinat)',
  /pesinatMahsup: buIlkFaturaMi \? pesinatTutar : 0, odenecekBakiye, vadeTarihi,/.test(src));

console.log('\n-- irsaliyeKesilinceFaturaOlustur: müşteri bakiyesi artık fatura kesilince ARTIYOR --');
t('güncel müşteri taze veriden bulunuyor',
  /const tumMusteriler = await Store\.musteriler\.all\(\);\s*\n\s*const guncelMusteri = tumMusteriler\.find\(m => m\.id === siparis\.musteriId\);/.test(src));
t('bakiye genelToplam kadar ARTIYOR (+=, tahsilat akışlarındaki -= ile simetrik)',
  /guncelMusteri\.bakiye = \(guncelMusteri\.bakiye \|\| 0\) \+ genelToplam;/.test(src));
t('değişiklik kaydediliyor (Store.musteriler.save)',
  /await Store\.musteriler\.save\(tumMusteriler\);\s*\n\s*\}/.test(src));

console.log('\n-- tahsilatBeklenenOnayla: ileri tarihli nakit onaylanınca bağlı faturanın odenecekBakiye\'si düşüyor --');
t('t.faturaId varsa ilgili fatura bulunup güncelleniyor',
  /if \(t\.faturaId\) \{\s*\n\s*const faturalar = await Store\.faturalar\.all\(\);/.test(src));
t('odenecekBakiye tahsilat tutarı kadar düşüyor (negatife düşmüyor)',
  /fatura\.odenecekBakiye = Math\.max\(0, \(fatura\.odenecekBakiye \|\| 0\) - t\.tutar\);/.test(src));

console.log('\n-- Sayısal tutarlılık (kaynak koddaki formülün elle doğrulanması) --');
{
  // Örnek: sipariş toplam (KDV hariç) 10000, KDV %20 -> genelToplam 12000.
  // Ödeme planı: peşinat 5000 + vadeli çek 5000 (vade farkı yok) -> onayda
  // netKasaToplami = 10000, bakiye 0 - 10000 = -10000 olur.
  // Fatura kesilince: bakiye += 12000 -> bakiye = 2000 (yalnızca KDV kadar
  // kalan borç — DOĞRU, çünkü ödeme planı KDV HARİÇ tutar üzerine kuruluydu).
  const genelToplam = 12000, netKasaToplami = 10000;
  const bakiyeOnaySonrasi = 0 - netKasaToplami;
  const bakiyeFaturaSonrasi = bakiyeOnaySonrasi + genelToplam;
  t('tam ödenmiş (KDV hariç) siparişte fatura sonrası kalan bakiye sadece KDV kadar (2000)',
    bakiyeFaturaSonrasi === 2000);
  const odenecekBakiye = Math.max(0, genelToplam - netKasaToplami);
  t('odenecekBakiye da aynı mantıkla 2000 (bakiye artışıyla tutarlı)', odenecekBakiye === 2000);

  // Açık hesap örneği: hiç ödeme planı yok (netKasaToplami=0).
  const acikHesapBakiye = 0 - 0 + genelToplam;
  t('açık hesap (ödeme planı yok) müşteride fatura tam tutarıyla borç yazıyor (12000)',
    acikHesapBakiye === 12000);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
