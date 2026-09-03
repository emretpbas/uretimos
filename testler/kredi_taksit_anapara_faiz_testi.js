// BULGU (T1-6): Banka kredisi taksit ödemesi işaretlendiğinde taksit
// tutarının TAMAMI (anapara + faiz) muhasebeye 'gider' olarak yazılıyordu —
// ama anapara (borcun geri ödenen kısmı) bir GİDER DEĞİLDİR, yalnızca
// bilançodaki borcu azaltır; sadece FAİZ kısmı gerçek bir giderdir. Bu,
// Gelir-Gider Özeti'ndeki toplam gideri (ve dolayısıyla kârlılığı)
// olduğundan fazla/az gösteriyordu.
// Düzeltme: taksit üretiminde (openKrediForm) anapara/faiz kırılımı
// hesaplanıp her taksite kaydediliyor (mevcut düz-oranlı faiz formülüyle
// TUTARLI: anapara = krediTutari/taksitSayisi, faiz = krediTutari×
// faizOrani/100 — toplamları zaten eski taksitTutari formülüne eşit).
// "Ödendi İşaretle" artık yalnızca faiz kısmını gider yazıyor.
// page_muhasebe_panel.js Store/DOM'a derinden bağlı olduğu için (diğer
// page_* testleriyle aynı desende) kaynak kod üzerinde regex doğrulama +
// izole sayısal doğrulama yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_muhasebe_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- openKrediForm: taksit üretiminde anapara/faiz kırılımı hesaplanıp kaydediliyor --');
t('anaparaPay = krediTutari / taksitSayisi hesaplanıyor',
  /const anaparaPay = krediTutari \/ taksitSayisi;/.test(src));
t('faizPay = krediTutari * (faizOrani / 100) hesaplanıyor',
  /const faizPay = krediTutari \* \(faizOrani \/ 100\);/.test(src));
t('her taksit kaydına anapara ve faiz alanları ekleniyor',
  /taksitler\.push\(\{ tarih: tarih\.toISOString\(\)\.slice\(0, 10\), tutar: taksitTutari, anapara: anaparaPay, faiz: faizPay, odendi: false \}\);/.test(src));

console.log('\n-- "Ödendi İşaretle": artık YALNIZCA faiz kısmı gider yazılıyor --');
t('faizTutari taksit.faiz\'den okunuyor (eski kayıtlarda krediden geri hesaplanıyor)',
  /const faizTutari = taksit\.faiz != null \? taksit\.faiz : kr\.krediTutari \* \(kr\.faizOrani \/ 100\);/.test(src));
t('muhasebeKaydiOlustur artık taksit.tutar (tam tutar) DEĞİL, faizTutari ile çağrılıyor',
  /tutar: faizTutari, matrah: faizTutari, kdvOrani: 0, kdvTutari: 0, kaynakId: kr\.id, kaynakTip: 'banka_kredisi'/.test(src));
t('eski hatalı çağrı (tutar: taksit.tutar) ARTIK YOK',
  !/tutar: taksit\.tutar, matrah: taksit\.tutar, kdvOrani: 0, kdvTutari: 0, kaynakId: kr\.id, kaynakTip: 'banka_kredisi'/.test(src));

console.log('\n-- Tüm Kredi Taksitleri tablosu anapara/faiz kırılımını gösteriyor --');
t('tabloya Anapara ve Faiz (Gider) sütunları eklendi',
  /<th class="r">Anapara<\/th><th class="r">Faiz \(Gider\)<\/th>/.test(src));

console.log('\n-- Sayısal tutarlılık: anapara + faiz = eski taksitTutari formülü --');
{
  const krediTutari = 120000, faizOrani = 2, taksitSayisi = 12;
  const taksitTutari = (krediTutari * (1 + (faizOrani / 100) * taksitSayisi)) / taksitSayisi;
  const anaparaPay = krediTutari / taksitSayisi;
  const faizPay = krediTutari * (faizOrani / 100);
  t('anapara + faiz toplamı taksit tutarına eşit (10000+2400=12400)',
    Math.abs((anaparaPay + faizPay) - taksitTutari) < 0.01);
  t('anapara payı doğru (10000)', Math.abs(anaparaPay - 10000) < 0.01);
  t('faiz payı doğru (2400) — SADECE bu kısım gider yazılmalı', Math.abs(faizPay - 2400) < 0.01);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
