// BULGU (T1-7): Vade farkı (çek/kredi kartı vadeli ödemelerde uygulanan
// faiz benzeri gelir) üç ayrı yerde vadeFarkiKayitlari'na (müşteri bazlı
// raporlama) yazılıyordu ama HİÇBİRİNDE muhasebeKaydiOlustur çağrılmıyordu
// — bu gerçek bir gelir olmasına (müşteri bakiyesinden ayrıca tahsil
// edilir, kasaya net tutar girer) rağmen Gelir-Gider Özeti'nde ve Basit
// Usul Defter'de HİÇ görünmüyordu, kârlılık olduğundan düşük hesaplanıyordu.
// Düzeltme: her üç yerde de (sipariş onayı, Manuel Tahsilat onayı, eski
// bekleyen kayıtların otomatik geçişi) toplam vade farkı > 0 ise tek bir
// toplu 'gelir'/'vade_farki' muhasebe kaydı oluşturuluyor — diğer
// gelirlerle (satis_faturasi) AYNI mekanizma, P&L'de artık görünüyor.
// app.js Store/DOM'a derinden bağlı olduğu için (diğer app.js testleriyle
// aynı desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const muhSrc = fs.readFileSync(path.join(__dirname, '..', 'page_muhasebe_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const vadeFarkiMuhasebeKayitSayisi = (src.match(/kategori: 'vade_farki',/g) || []).length;

console.log('\n-- Üç ayrı akışın hepsinde vade farkı artık muhasebeye yansıyor --');
t('toplam 3 ayrı yerde kategori: \'vade_farki\' ile muhasebe kaydı oluşturuluyor', vadeFarkiMuhasebeKayitSayisi === 3);

t('siparisOnaylaninceOdemePlaniniAnindaIsle: toplamVadeFarki > 0 ise gelir kaydı oluşuyor',
  /if \(toplamVadeFarki > 0\) \{\s*\n\s*await muhasebeKaydiOlustur\(\{\s*\n\s*tip: 'gelir', kategori: 'vade_farki',\s*\n\s*aciklama: 'Vade farkı geliri: ' \+ siparis\.kod/.test(src));

t('tahsilatOnayBekleyenOnayla: toplamVadeFarki > 0 ise gelir kaydı oluşuyor',
  /if \(toplamVadeFarki > 0\) \{\s*\n\s*await muhasebeKaydiOlustur\(\{\s*\n\s*tip: 'gelir', kategori: 'vade_farki',\s*\n\s*aciklama: 'Vade farkı geliri \(Tahsilat Yap onayı\)/.test(src));

t('migrateEskiTahsilatBeklenenleriIsle: toplam vade farkı biriktirilip gelir kaydı oluşuyor',
  /let toplamVadeFarki = 0;\s*\n\s*islenecekler\.forEach/.test(src) &&
  /if \(toplamVadeFarki > 0\) \{\s*\n\s*await muhasebeKaydiOlustur\(\{\s*\n\s*tip: 'gelir', kategori: 'vade_farki',\s*\n\s*aciklama: 'Vade farkı geliri \(eski bekleyen kayıtların/.test(src));

console.log('\n-- page_muhasebe_panel.js: Tüm Hareketler ekranında doğru etiketle gösteriliyor --');
t('GELIR_KATEGORI_LABEL\'e vade_farki eklendi',
  /vade_farki: 'Vade Farkı Geliri'/.test(muhSrc));

console.log('\n-- Regresyon: mevcut satis_faturasi geliri hâlâ ayrı kategori (çift sayım riski yok) --');
t('satis_faturasi kategorisi hâlâ ayrı bir muhasebeKaydiOlustur çağrısında',
  /kategori: 'satis_faturasi',/.test(src));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
