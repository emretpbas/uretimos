// BULGU: "Manuel Tahsilat Yap" akışı (Muhasebe Panel → Tahsilatlar → "+
// Tahsilat Kaydı Ekle" → Yönetim Onayı) app.js:tahsilatOnayBekleyenOnayla
// üzerinden işleniyordu ama çek/kredi kartı kalemlerini HER ZAMAN tam yüz
// değeriyle kasaya/bakiyeye yazıyordu — sipariş onayındaki AYNI ödeme planı
// formundan gelen (siparisOnaylaninceOdemePlaniniAnindaIsle) vade farkı
// hesabı burada HİÇ uygulanmıyordu. Sonuç: aynı müşterinin aynı vadeli çeki,
// hangi ekrandan işlendiğine göre farklı net tutarla kasaya/bakiyeye
// yansıyordu ve vade farkı geliri (vadeFarkiKayitlari) hiç oluşmuyordu.
// Düzeltme: tahsilatOnayBekleyenOnayla artık AYNI ayFarkiHesapla/vadeFarki/
// netTutar formülünü kullanıyor, vadeFarkiKayitlari'na kayıt düşüyor.
// app.js Store/DOM'a derinden bağlı olduğu için (diğer app.js testleriyle
// aynı desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const fnMatch = src.match(/async function tahsilatOnayBekleyenOnayla\(tahsilatOnayBekleyenId\) \{[\s\S]*?\n  \}\n/);
const fn = fnMatch ? fnMatch[0] : '';
t('tahsilatOnayBekleyenOnayla fonksiyonu bulundu', !!fn);

console.log('\n-- Aynı vade farkı formülü (sipariş onayı ile aynı mantık) kullanılıyor --');
t('müşterinin aylikVadeFarkiYuzde\'si okunuyor',
  /const aylikVadeFarkiYuzde = \(musteri && musteri\.aylikVadeFarkiYuzde\) \|\| 0;/.test(fn));
t('ayFarkiHesapla yardımcı fonksiyonu tanımlı (30 günlük dilimlerle yukarı yuvarlama)',
  /function ayFarkiHesapla\(vadeTarihiStr\)[\s\S]{0,200}Math\.ceil\(gunFarki \/ 30\)/.test(fn));
t('çek/kredi kartı için vadeFarki = tutar × yüzde × aySayısı hesaplanıyor',
  /const vadeFarki = k\.tutar \* \(aylikVadeFarkiYuzde \/ 100\) \* aySayisi;/.test(fn));
t('netTutar = k.tutar - vadeFarki hesaplanıyor',
  /const netTutar = k\.tutar - vadeFarki;/.test(fn));

console.log('\n-- Kasaya/bakiyeye giren tutar artık NET (vade farkı düşülmüş) --');
t('tahsilatKaydiEkle çek/kredi kartı için netTutar ile çağrılıyor (tam k.tutar değil)',
  /tahsilatKaydiEkle\(k\.tip, netTutar, detay\);/.test(fn));
t('çek YÜZ DEĞERİYLE (k.tutar) "elde" listesine ekleniyor — vade farkı çekin tutarını değiştirmez',
  /cekNo: k\.cekNo \|\| '—', tutar: k\.tutar, vadeTarihi: k\.tarih,/.test(fn));

console.log('\n-- Vade farkı geliri artık kayıt altına alınıyor --');
t('vadeFarki > 0 ise vadeFarkiKayitlari\'na kayıt ekleniyor',
  /if \(vadeFarki > 0\) \{[\s\S]{0,120}vadeFarkiKayitlari\.push\(\{/.test(fn));
t('vadeFarkiKayitlari sonunda kaydediliyor (Store.vadeFarkiKayitlari.save)',
  /await Store\.vadeFarkiKayitlari\.save\(vadeFarkiKayitlari\);/.test(fn));
t('kayıt üzerinde toplamVadeFarki bilgisi tutuluyor',
  /kayit\.toplamVadeFarki = toplamVadeFarki;/.test(fn));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
