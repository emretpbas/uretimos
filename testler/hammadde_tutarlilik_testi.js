// Hammadde İç Tutarlılık Taraması — kod ailesi + isim ailesi gruplama,
// medyan sapma tespiti, ondalık hatası ipucu. Gerçek üretim verisinden
// alınan örneklerle (kullanıcı ekran görüntüleri) doğrulanmıştır.
const M = require('../hammadde_tutarlilik_motor.js');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- YARDIMCI FONKSİYONLAR --');
t('dvzTuru USD tanıyor', M.dvzTuru('USD') === 'USD' && M.dvzTuru('$') === 'USD');
t('dvzTuru EUR tanıyor', M.dvzTuru('EUR') === 'EUR' && M.dvzTuru('€') === 'EUR');
t('dvzTuru TL için null döner', M.dvzTuru('TL') === null && M.dvzTuru(undefined) === null);
t('birimFiyatTL TL kalemde aynen döner', M.birimFiyatTL({ birimFiyat: 100, dvz: 'TL' }, {}) === 100);
t('birimFiyatTL USD kalemi çeviriyor', M.birimFiyatTL({ birimFiyat: 10, dvz: 'USD' }, { usdTry: 40 }) === 400);
t('kodAilesi son bölümü atıyor', M.kodAilesi('57.19.058') === '57.19');
t('kodAilesi noktasız kodda boş döner', M.kodAilesi('ABC123') === '');
t('adAilesi sondaki varyantı atıyor', M.adAilesi('DÖŞEMELİK DERİ LİZBON 02') === 'DÖŞEMELİK DERİ LİZBON');
t('medyanHesapla tek sayıda doğru', M.medyanHesapla([1, 5, 3]) === 3);
t('medyanHesapla çift sayıda doğru', M.medyanHesapla([1, 2, 3, 4]) === 2.5);

console.log('\n-- GERÇEK ÖRNEK 1: LİZBON deri (isim ailesi, aynı kod grubu da) --');
// Kullanıcının paylaştığı gerçek veri: 3 kalem, ikisi 221.792 TL (hatalı),
// biri 221,79 TL (doğru) — ~1000 kat fark.
let hammaddeler = [
  { id: 'H1', stokKodu: '57.09.081', ad: 'DÖŞEMELİK DERİ LİZBON 02', birim: 'METRE', birimFiyat: 221792.00, dvz: 'TL' },
  { id: 'H2', stokKodu: '57.09.080', ad: 'DÖŞEMELİK DERİ LİZBON 12', birim: 'METRE', birimFiyat: 221792.00, dvz: 'TL' },
  { id: 'H3', stokKodu: '57.09.079', ad: 'DÖŞEMELİK DERİ LİZBON 11', birim: 'METRE', birimFiyat: 221.79, dvz: 'TL' },
];
let sonuc = M.tara(hammaddeler, {});
t('3 kalemden 2si anomali (221.792 olanlar)', sonuc.length === 2);
t('anomaliler doğru kartlar (H1, H2)', sonuc.every(a => a.hammaddeId === 'H1' || a.hammaddeId === 'H2'));
t('doğru fiyatlı kart (H3) anomali DEĞİL', !sonuc.some(a => a.hammaddeId === 'H3'));
t('önerilen düzeltme medyana (221.79) yakın', Math.abs((sonuc[0].guncelFiyatTL) - 221.79) < 1);
t('ondalık hatası ipucu açıklamada var', sonuc.every(a => a.aciklama.includes('1000 kat')));

console.log('\n-- GERÇEK ÖRNEK 2: HETTİCH menteşe (kod ailesi, isimler alakasız değil ama farklı) --');
// 51.001.10.250.XX ailesi: iki normal (71.06, 78.95) + bir ~1000 kat (84216)
hammaddeler = [
  { id: 'H1', stokKodu: '51.001.10.250.00', ad: 'HETTICH SENSYS DÜZ FRENLİ MENTEŞE 110°', birim: 'ADET', birimFiyat: 71.06, dvz: 'TL' },
  { id: 'H2', stokKodu: '51.001.10.250.01', ad: 'HETTICH YARIM DEVE FRENLİ', birim: 'ADET', birimFiyat: 78.95, dvz: 'TL' },
  { id: 'H3', stokKodu: '51.001.10.250.02', ad: 'HETTICH SÜPER DEVE FRENLİ', birim: 'ADET', birimFiyat: 84216.00, dvz: 'TL' },
];
sonuc = M.tara(hammaddeler, {});
t('yalnızca aşırı yüksek kalem (H3) yakalandı', sonuc.length === 1 && sonuc[0].hammaddeId === 'H3');
t('isimler alakasız olsa da KOD ailesiyle yakalandı', sonuc[0].tur === 'ic_tutarlilik');

console.log('\n-- GERÇEK ÖRNEK 3: toz boya (isimler kısmen farklı, kod ailesiyle yakalanır) --');
hammaddeler = [
  { id: 'H1', stokKodu: '50.025.10.001.21', ad: 'TOZ BOYA AHŞAP YÜZEY ASTAR POWTEX 02410', birim: 'KG', birimFiyat: 640.0, dvz: 'TL' },
  { id: 'H2', stokKodu: '50.025.10.001.22', ad: 'TOZ BOYA AHŞAP YÜZEY ASTAR POWTEX 02412.QPRMR', birim: 'KG', birimFiyat: 521683.00, dvz: 'TL' },
  { id: 'H3', stokKodu: '50.025.10.001.23', ad: 'TOZ BOYA AHŞAP YÜZEY SON KAT ANT. POWTEX RAL7015', birim: 'KG', birimFiyat: 652.10, dvz: 'TL' },
];
sonuc = M.tara(hammaddeler, {});
t('isim ailesi farklı olsa da kod ailesiyle aşırı yüksek kalem yakalandı', sonuc.length === 1 && sonuc[0].hammaddeId === 'H2');

console.log('\n-- SAĞLAMLIK: normal veri anomali ÜRETMEMELİ --');
hammaddeler = [
  { id: 'H1', stokKodu: '57.13.078', ad: 'MDFLAM ÇY 18MM D-164 LUNA 210*280', birim: 'M2', birimFiyat: 2200.00, dvz: 'TL' },
  { id: 'H2', stokKodu: '57.13.077', ad: 'MDFLAM ÇY 18MM D123 AÇIK GRİ 210*280', birim: 'M2', birimFiyat: 2200.00, dvz: 'TL' },
  { id: 'H3', stokKodu: '57.13.076', ad: 'MDFLAM ÇY 18MM A398 İTALYAN CEVİZİ 210*280', birim: 'M2', birimFiyat: 2292.00, dvz: 'TL' },
];
t('makul fiyat farkları (%5 civarı) anomali üretmiyor', M.tara(hammaddeler, {}).length === 0);

t('2 üyeli grup (eşik: min 3) taranmıyor', M.tara([
  { id: 'H1', stokKodu: '57.99.001', ad: 'X', birim: 'ADET', birimFiyat: 10, dvz: 'TL' },
  { id: 'H2', stokKodu: '57.99.002', ad: 'X', birim: 'ADET', birimFiyat: 10000, dvz: 'TL' },
]).length === 0);

t('fiyatsız/sıfır fiyatlı kartlar çökmeden atlanıyor', M.tara([
  { id: 'H1', stokKodu: '57.99.001', ad: 'Y', birim: 'ADET', birimFiyat: 0, dvz: 'TL' },
  { id: 'H2', stokKodu: '57.99.002', ad: 'Y', birim: 'ADET', birimFiyat: null, dvz: 'TL' },
  { id: 'H3', stokKodu: '57.99.003', ad: 'Y', birim: 'ADET', birimFiyat: 50, dvz: 'TL' },
]).length === 0);

t('boş liste çökmeden boş sonuç döner', M.tara([], {}).length === 0);
t('ayarlar eksikken USD kalemler sessizce atlanıyor (0 TL sayılır)', M.tara([
  { id: 'H1', stokKodu: '1.1.1', ad: 'Z', birim: 'ADET', birimFiyat: 10, dvz: 'USD' },
  { id: 'H2', stokKodu: '1.1.2', ad: 'Z', birim: 'ADET', birimFiyat: 10, dvz: 'USD' },
  { id: 'H3', stokKodu: '1.1.3', ad: 'Z', birim: 'ADET', birimFiyat: 10000, dvz: 'USD' },
], {}).length === 0);

console.log('\n-- ÇİFT SİNYAL: aynı kart hem kod hem isim ailesinde yakalanırsa TEK kez raporlanır --');
hammaddeler = [
  { id: 'H1', stokKodu: '9.9.1', ad: 'ORTAK AD 01', birim: 'ADET', birimFiyat: 10, dvz: 'TL' },
  { id: 'H2', stokKodu: '9.9.2', ad: 'ORTAK AD 02', birim: 'ADET', birimFiyat: 12, dvz: 'TL' },
  { id: 'H3', stokKodu: '9.9.3', ad: 'ORTAK AD 03', birim: 'ADET', birimFiyat: 99000, dvz: 'TL' },
];
sonuc = M.tara(hammaddeler, {});
t('hem kod hem isim ailesi aynı kartı yakalasa da tekrar etmiyor', sonuc.filter(a => a.hammaddeId === 'H3').length === 1);

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
