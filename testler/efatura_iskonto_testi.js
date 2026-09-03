// BULGU (T1-4): efatura_motor.js ublOlustur her zaman ham miktar×netFiyat
// kullanır (bu doğru — dual-mode motor App'e bağımlı olamaz). Kök neden,
// app.js:irsaliyeKesilinceFaturaOlustur'un fatura nesnesine kalemler alanını
// HİÇ kaydetmemesiydi — page_efatura.js bu yüzden fatura.kalemler boş
// bulup ham sipariş.kalemler'e (genel iskonto UYGULANMAMIŞ netFiyat)
// düşüyor, e-Fatura XML'i gerçek (iskontolu) fatura tutarından daha
// YÜKSEK bir matrah/toplamla üretiliyordu.
// Düzeltme: irsaliyeKesilinceFaturaOlustur artık genel iskontoyu (2.
// kalite/defolu kalemler hariç — kalemleriKdvGrupla ile AYNI kural) kalem
// bazında uygulayıp fatura.kalemler'e kaydediyor. Bu test iki parçalı:
// (1) app.js kaynağında bu mantığın var olduğunu regex ile doğrular,
// (2) efatura_motor.js:ublOlustur'u GERÇEKTEN, iskonto uygulanmış kalemler
// vererek çalıştırıp sayısal doğruluğu kanıtlar (ublOlustur'un kendisi
// değişmedi — girdi artık doğru olduğu için çıktı da doğru).
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const EFaturaMotor = require('../efatura_motor.js');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- app.js: irsaliyeKesilinceFaturaOlustur artık iskonto uygulanmış kalemleri kaydediyor --');
t('genelIskontoYuzde siparişten okunuyor',
  /const genelIskontoYuzde = siparis\.genelIskontoYuzde \|\| 0;/.test(appSrc));
t('2. kalite kalemler iskontodan MUAF (kalemleriKdvGrupla ile aynı kural)',
  /const faturaKalemleri = \(siparis\.kalemler \|\| \[\]\)\.map\(k => \(\{\s*\n\s*\.\.\.k,\s*\n\s*netFiyat: k\.ikinciKalite \? \(k\.netFiyat \|\| 0\) : \(k\.netFiyat \|\| 0\) \* \(1 - genelIskontoYuzde \/ 100\)/.test(appSrc));
t('fatura nesnesi artık kalemler alanını taşıyor',
  /kalemler: faturaKalemleri,\s*\n\s*matrah, kdvOrani, kdvTutari, genelToplam, kdvDetaylari,/.test(appSrc));

console.log('\n-- efatura_motor.js: ublOlustur, iskonto uygulanmış kalemlerle DOĞRU (düşük) toplam üretiyor --');
{
  const firma = { unvan: 'ABC Üretim A.Ş.', vergiNo: '1000000000', vergiDairesi: 'Kadıköy', adres: 'Test Mah. No:1' };
  const musteri = { unvan: 'XYZ Ticaret Ltd.', vergiNo: '2000000002', adres: 'Deneme Cad. No:2' };
  const fatura = { faturaNo: 'FTR-TEST-001', tarih: '2026-09-01', musteriAdi: musteri.unvan };

  // Senaryo: 2 kalem, 1000 TL birim fiyat, %20 KDV, %10 genel iskonto.
  // İSKONTOSUZ (bulgu — eski davranış): matrah = 2*1000 = 2000, KDV %20 = 400, toplam 2400.
  const kalemlerIskontosuz = [{ ad: 'Ürün A', kod: 'STK-1', miktar: 2, netFiyat: 1000, kdvOrani: 20 }];
  const rIskontosuz = EFaturaMotor.ublOlustur(fatura, musteri, firma, kalemlerIskontosuz);
  t('iskontosuz senaryoda matrah 2000 (referans — eski hatalı davranış)', Math.abs(rIskontosuz.matrahToplam - 2000) < 0.01);

  // İSKONTOLU (düzeltme — irsaliyeKesilinceFaturaOlustur'un artık ÜRETTİĞİ
  // gerçek girdi): netFiyat %10 iskontoyla 900 olarak fatura.kalemler'e
  // önceden kaydedilmiş olur -> matrah = 2*900 = 1800, KDV %20 = 360, toplam 2160.
  const genelIskontoYuzde = 10;
  const kalemlerIskontolu = kalemlerIskontosuz.map(k => ({ ...k, netFiyat: k.netFiyat * (1 - genelIskontoYuzde / 100) }));
  const rIskontolu = EFaturaMotor.ublOlustur(fatura, musteri, firma, kalemlerIskontolu);
  t('iskontolu senaryoda matrah doğru düşüyor (1800)', Math.abs(rIskontolu.matrahToplam - 1800) < 0.01);
  t('iskontolu senaryoda KDV doğru düşüyor (360)', Math.abs(rIskontolu.kdvToplam - 360) < 0.01);
  t('iskontolu senaryoda genel toplam doğru düşüyor (2160)', Math.abs(rIskontolu.genelToplam - 2160) < 0.01);
  t('XML\'deki satır tutarı da iskontolu (900.00)', rIskontolu.xml.includes('900.00'));
  t('XML\'de eski iskontosuz birim fiyat (1000.00) ARTIK YOK', !rIskontolu.xml.includes('1000.00'));

  // 2. kalite kalem iskontodan muaf kalmalı (kalemleriKdvGrupla ile aynı kural)
  const kalemler2K = [
    { ad: 'Normal', kod: 'N1', miktar: 1, netFiyat: 1000 * (1 - genelIskontoYuzde / 100), kdvOrani: 20 }, // önceden iskontolanmış
    { ad: '2. Kalite', kod: 'K2', miktar: 1, netFiyat: 500, kdvOrani: 20, ikinciKalite: true } // iskonto UYGULANMADAN
  ];
  const r2K = EFaturaMotor.ublOlustur(fatura, musteri, firma, kalemler2K);
  t('2. kalite kalem + iskontolu normal kalem doğru toplanıyor (900+500=1400)', Math.abs(r2K.matrahToplam - 1400) < 0.01);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
