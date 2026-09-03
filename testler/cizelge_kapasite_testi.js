// Çizelgeleme Motoru — GÜNE ÖZEL manuel kapasite düzeltmeleri (kapasiteDuzeltmeleri).
// Vardiya tabanı (hatKapasiteleri) değişmeden kalmalı; düzeltmeler yalnızca
// belirtilen hat+tarih için o günün fiili kapasitesini değiştirmeli.
const M = require('../cizelge_motor.js');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const op = (over) => Object.assign({
  id: 'OP1', kaynakTip: 'ie', kaynakId: 'IE1', kaynakKod: 'IE-1',
  ymId: 'YM1', ymKod: 'YM-1', ymAd: 'Test Parça', adimSira: 0, toplamAdim: 1,
  istasyonKod: 'IST1', istasyonTanim: 'İstasyon 1', hat: 'HAT-A',
  adet: 1, birimDk: 100, sureDk: 100, termin: null, oncelik: 1, isAnahtari: 'ie:IE1'
}, over || {});

console.log('\n-- YARDIMCI FONKSİYONLAR --');
t('duzeltmeHaritasi aynı hat+tarihi topluyor', (() => {
  const h = M.duzeltmeHaritasi([
    { hat: 'HAT-A', tarih: '2026-01-05', dakikaFarki: 60 },
    { hat: 'HAT-A', tarih: '2026-01-05', dakikaFarki: -20 },
    { hat: 'HAT-A', tarih: '2026-01-06', dakikaFarki: 30 }
  ]);
  return h.get('HAT-A|2026-01-05') === 40 && h.get('HAT-A|2026-01-06') === 30;
})());
t('duzeltmeHaritasi hat/tarih eksikse atlıyor', M.duzeltmeHaritasi([{ hat: '', tarih: '2026-01-05', dakikaFarki: 10 }]).size === 0);
t('gunlukKapasiteHesapla baz + fark', M.gunlukKapasiteHesapla(new Map([['HAT-A', 480]]), M.duzeltmeHaritasi([{ hat: 'HAT-A', tarih: '2026-01-05', dakikaFarki: 60 }]), 'HAT-A', '2026-01-05') === 540);
t('gunlukKapasiteHesapla düzeltme yoksa baz döner', M.gunlukKapasiteHesapla(new Map([['HAT-A', 480]]), new Map(), 'HAT-A', '2026-01-05') === 480);
t('gunlukKapasiteHesapla negatife düşmüyor (0 taban)', M.gunlukKapasiteHesapla(new Map([['HAT-A', 100]]), M.duzeltmeHaritasi([{ hat: 'HAT-A', tarih: '2026-01-05', dakikaFarki: -500 }]), 'HAT-A', '2026-01-05') === 0);

console.log('\n-- DÜZELTMESİZ (REGRESYON — eski davranış korunmalı) --');
{
  const kapasite = new Map([['HAT-A', 480]]);
  // 100 dk'lık iş, 480 dk kapasiteli hatta TEK günde biter (Pzt = hafta içi)
  const sonuc = M.cizelgele([op()], kapasite, [], '2026-01-05', false);
  t('tek operasyon tek günde tamamlanıyor', sonuc.yerlesim[0].baslangicTarihi === sonuc.yerlesim[0].bitisTarihi);
  t('hatYuku BAZ kapasiteyi gösteriyor', sonuc.hatYuku[0].gunlukKapasite === 480);
  t('günlük detayda kapasite alanı baz ile aynı (düzeltme yok)', sonuc.hatYuku[0].gunler[0].kapasite === 480);
  t('duzeltmeVar false', sonuc.hatYuku[0].gunler[0].duzeltmeVar === false);
}

console.log('\n-- NEGATİF DÜZELTME: o gün kapasite düşüyor, taşan iş ertesi güne kayıyor --');
{
  const kapasite = new Map([['HAT-A', 480]]);
  // 2026-01-05 Pazartesi. HAT-A o gün için -400 dk düzeltme (arıza) → kalan 80 dk.
  const duzeltmeler = [{ hat: 'HAT-A', tarih: '2026-01-05', dakikaFarki: -400, aciklama: 'Arıza' }];
  const sonuc = M.cizelgele([op({ sureDk: 100 })], kapasite, duzeltmeler, '2026-01-05', false);
  const parcalar = sonuc.yerlesim[0].parcalar;
  t('iş İKİ güne bölündü (80 dk + 20 dk)', parcalar.length === 2);
  t('ilk gün yalnızca 80 dk yerleşti (400 dk düşülmüş kapasite)', parcalar[0].dk === 80);
  t('ikinci gün kalan 20 dk yerleşti', parcalar[1].dk === 20);
  t('bitiş tarihi ertesi güne kaydı', sonuc.yerlesim[0].bitisTarihi > sonuc.yerlesim[0].baslangicTarihi);
  const gun1 = sonuc.hatYuku[0].gunler.find(g => g.tarih === '2026-01-05');
  t('düzeltmeli günün kapasitesi 80 dk olarak raporlanıyor', gun1.kapasite === 80);
  t('duzeltmeVar true işaretleniyor', gun1.duzeltmeVar === true);
  t('düzeltmeli günün doluluğu %100', Math.abs(gun1.doluluk - 1) < 1e-9);
}

console.log('\n-- POZİTİF DÜZELTME: o gün kapasite artıyor, iş erken bitiyor --');
{
  const kapasite = new Map([['HAT-A', 480]]);
  // İki operasyon: her biri 300 dk, toplam 600 dk — normalde 2 gün sürer (480+120).
  // 2026-01-05 için +200 dk ek vardiya (fazla mesai) eklenirse TEK günde biter (680 dk kapasite).
  const duzeltmeler = [{ hat: 'HAT-A', tarih: '2026-01-05', dakikaFarki: 200, aciklama: 'Fazla mesai' }];
  const ops = [op({ id: 'OP1', isAnahtari: 'ie:IE1', sureDk: 300 }), op({ id: 'OP2', isAnahtari: 'ie:IE2', kaynakId: 'IE2', sureDk: 300 })];
  const sonuc = M.cizelgele(ops, kapasite, duzeltmeler, '2026-01-05', false);
  t('her iki operasyon da AYNI günde tamamlandı', sonuc.yerlesim.every(y => y.baslangicTarihi === '2026-01-05' && y.bitisTarihi === '2026-01-05'));
  const gun1 = sonuc.hatYuku[0].gunler.find(g => g.tarih === '2026-01-05');
  t('o günün kapasitesi 680 dk (480+200)', gun1.kapasite === 680);
}

console.log('\n-- KAPSAM: düzeltme yalnızca eşleşen hat+tarihi etkiliyor --');
{
  const kapasite = new Map([['HAT-A', 480], ['HAT-B', 480]]);
  const duzeltmeler = [{ hat: 'HAT-A', tarih: '2026-01-05', dakikaFarki: -400 }];
  // HAT-B aynı gün etkilenmemeli
  const sonucB = M.cizelgele([op({ hat: 'HAT-B', isAnahtari: 'ie:IE1B' })], kapasite, duzeltmeler, '2026-01-05', false);
  t('farklı hat düzeltmeden etkilenmiyor', sonucB.yerlesim[0].baslangicTarihi === sonucB.yerlesim[0].bitisTarihi);
  // HAT-A farklı bir GÜNDE (2026-01-06) düzeltmeden etkilenmemeli
  const sonucGun2 = M.cizelgele([op({ isAnahtari: 'ie:IE1C' })], kapasite, duzeltmeler, '2026-01-06', false);
  t('aynı hat farklı tarihte düzeltmeden etkilenmiyor', sonucGun2.yerlesim[0].baslangicTarihi === sonucGun2.yerlesim[0].bitisTarihi);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
