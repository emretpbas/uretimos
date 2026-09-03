// BULGU (T1-8): Aşağıdaki dört akış hiçbiri muhasebeKaydiOlustur çağırmıyordu
// — fire/kayıp, sayım farkı, kalite düzeltme maliyeti ve tedarikçiye iade
// gerçek finansal olaylar olmasına rağmen Gelir-Gider Özeti'nde/Basit Usul
// Defter'de HİÇ görünmüyordu:
//   1) sayim.js:stogaIsle — sayım fazlası (gelir) / açığı (gider), gerçek
//      birim maliyetle (App.kartMaliyetHesapla / hammaddeBirimFiyatTRY).
//   2) kayip_kacak.js:teslimEt — fire/hasar/kayıp (normalMi:false) teslimi
//      gider (üretim sarfı/bakım/numune/iade gibi NORMAL tüketim çift
//      sayılmasın diye hariç tutulur).
//   3) page_uretim_panel.js:duzeltmeIsleModal — kalite düzeltme
//      malzeme+işçilik maliyeti gider.
//   4) page_iade_ambari.js:iadeFaturaModal — tedarikçiye iade, tedarikçi
//      borcundan mahsup (tedarikciOdemeleri) + gider ters kaydı (gelir).
// Store/DOM'a derinden bağlı dosyalar için (page_* testleriyle aynı
// desende) kaynak kod üzerinde regex doğrulama yapılır; kayip_kacak.js
// için ayrıca testler/kayip_e2e_testi.js'de gerçek sayısal doğrulama var.
const fs = require('fs'), path = require('path');
const sayimSrc = fs.readFileSync(path.join(__dirname, '..', 'sayim.js'), 'utf8');
const kayipSrc = fs.readFileSync(path.join(__dirname, '..', 'kayip_kacak.js'), 'utf8');
const uretimSrc = fs.readFileSync(path.join(__dirname, '..', 'page_uretim_panel.js'), 'utf8');
const iadeSrc = fs.readFileSync(path.join(__dirname, '..', 'page_iade_ambari.js'), 'utf8');
const muhSrc = fs.readFileSync(path.join(__dirname, '..', 'page_muhasebe_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- 1) sayim.js: sayım fazlası/açığı artık gerçek maliyetle muhasebeye yansıyor --');
t('birim maliyet App.kartMaliyetHesapla/hammaddeBirimFiyatTRY ile hesaplanıyor',
  /App\.hammaddeBirimFiyatTRY\(hm, ayarlar\)/.test(sayimSrc) &&
  /App\.kartMaliyetHesapla\(kart, tip, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar, undefined, paketler\)/.test(sayimSrc));
t('fazla (sayılan>sistem) toplamFazlaDeger\'e, eksik toplamEksikDeger\'e birikiyor',
  /if \(fark > 0\) toplamFazlaDeger \+= deger; else toplamEksikDeger \+= deger;/.test(sayimSrc));
t('fazla > 0 ise gelir/sayim_fazlasi kaydı oluşuyor',
  /kategori: 'sayim_fazlasi',/.test(sayimSrc));
t('eksik > 0 ise gider/sayim_acigi kaydı oluşuyor',
  /kategori: 'sayim_acigi',/.test(sayimSrc));

console.log('\n-- 2) kayip_kacak.js: fire/hasar/kayıp teslimi artık gider yazıyor (normal tüketim hariç) --');
t('yalnızca !normalMi (fire/hasar/kayıp) ve hammaddeId varsa işleniyor',
  /if \(!talep\.normalMi && talep\.hammaddeId\) \{/.test(kayipSrc));
t('kategori fire_kayip ile gider kaydı oluşuyor',
  /kategori: 'fire_kayip',/.test(kayipSrc));

console.log('\n-- 3) page_uretim_panel.js: kalite düzeltme maliyeti artık gider yazıyor --');
t('toplamDuzeltmeMaliyeti = malzeme + işçilik hesaplanıyor',
  /const toplamDuzeltmeMaliyeti = malzemeToplam \+ iscilikMaliyet;/.test(uretimSrc));
t('kategori kalite_duzeltme ile gider kaydı oluşuyor',
  /kategori: 'kalite_duzeltme',/.test(uretimSrc));

console.log('\n-- 4) page_iade_ambari.js: tedarikçiye iade artık borçtan mahsup + ters gelir kaydı yapıyor --');
t('tutar TL\'ye çevriliyor (App.toTRY)',
  /const tutarTRY = App\.toTRY\(tutar, dvz, App\.state\.ayarlar\);/.test(iadeSrc));
t('tedarikciOdemeleri\'ne iade_mahsup kaydı ekleniyor (borç azalır)',
  /tip: 'iade_mahsup', detay: 'Tedarikçi iade faturası: ' \+ faturaNo, tutar: tutarTRY, iadeFaturaId: fatura\.id/.test(iadeSrc));
t('kategori tedarikci_iade_mahsup ile GELİR (ters kayıt) oluşuyor',
  /kategori: 'tedarikci_iade_mahsup',/.test(iadeSrc));

console.log('\n-- page_muhasebe_panel.js: yeni kategoriler doğru etiketlerle gösteriliyor --');
t('GELIR_KATEGORI_LABEL: sayim_fazlasi eklendi', /sayim_fazlasi: 'Sayım Fazlası'/.test(muhSrc));
t('GIDER_KATEGORI_LABEL: sayim_acigi/fire_kayip/kalite_duzeltme/tedarikci_iade_mahsup eklendi',
  /sayim_acigi: 'Sayım Açığı'/.test(muhSrc) && /fire_kayip: 'Fire\/Kayıp\/Hasar'/.test(muhSrc) &&
  /kalite_duzeltme: 'Kalite Düzeltme Gideri'/.test(muhSrc) && /tedarikci_iade_mahsup: 'Tedarikçi İade Mahsubu'/.test(muhSrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
