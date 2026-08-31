// ── ÜRÜN KARTI SİLİNİRKEN YARI MAMÜL CASCADE'İ ──────────────────────────────
// Ürün kartı silindiğinde reçetesindeki yarı mamüller de silinmeli — AMA
// yalnızca başka HİÇBİR yerde (başka reçete, açık sipariş/teklif, aktif iş
// emri, stok) kullanılmıyorlarsa. Başka bir ürün/alt montaj/paket/yarı
// mamülün reçetesinde de geçiyorsa dokunulmamalı.
//     node testler/urun_yarimamul_silme_test.js
global.PageModules = {}; global.App = {}; global.Store = {};
const { yarimamulCascadeSilinebilirMi, urunSilYarimamulCascade } = require('../page_kartlar.js');

let gecti = 0, kaldi = 0;
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

console.log('\n\x1b[1mÜrün kartı silme — yarı mamül cascade\x1b[0m');

// ── Senaryo: URN-1'in reçetesi YM-A ve YM-B'yi kullanıyor.
// YM-A yalnızca URN-1'de kullanılıyor → silinmeli.
// YM-B ayrıca URN-2'nin reçetesinde de bileşen → SİLİNMEMELİ.
const receteUrn1 = { id: 'RC-URN1', urunId: 'URN-1', kalemler: [
  { tip: 'yarimamul', refId: 'YM-A' }, { tip: 'yarimamul', refId: 'YM-B' },
  { tip: 'hammadde', refId: 'HM-1' }
] };
const receteUrn2 = { id: 'RC-URN2', urunId: 'URN-2', kalemler: [
  { tip: 'yarimamul', refId: 'YM-B' }
] };
const tumYarimamuller = [
  { id: 'YM-A', kod: 'YM-A' }, { id: 'YM-B', kod: 'YM-B' }, { id: 'YM-C', kod: 'YM-C' }
];

{
  const tumReceteler = [receteUrn1, receteUrn2];
  const sonuc = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, tumReceteler, [], [], [], []);
  dogru('Yalnızca bu üründe kullanılan YM-A silinecekler listesinde', sonuc.some(y => y.id === 'YM-A'));
  dogru('Başka ürünün reçetesinde de olan YM-B listede YOK (korunuyor)', !sonuc.some(y => y.id === 'YM-B'));
  dogru('Hiç kullanılmayan/aday olmayan YM-C listede YOK', !sonuc.some(y => y.id === 'YM-C'));
  dogru('Sonuç tam olarak 1 kart', sonuc.length === 1);
}

// ── Açık siparişte geçen yarı mamül silinmemeli ──
{
  const siparisler = [{ durum: 'onaylandi', kalemler: [{ kod: 'YM-A' }] }];
  const sonuc = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1], siparisler, [], [], []);
  dogru('Açık siparişte geçen YM-A silinecekler listesinde YOK', !sonuc.some(y => y.id === 'YM-A'));
}
// Reddedilmiş sipariş engel oluşturmamalı
{
  const siparisler = [{ durum: 'reddedildi', kalemler: [{ kod: 'YM-A' }] }];
  const sonuc = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1], siparisler, [], [], []);
  dogru('Reddedilmiş siparişteki YM-A yine de silinebilir', sonuc.some(y => y.id === 'YM-A'));
}

// ── Açık teklifte geçen yarı mamül silinmemeli ──
{
  const teklifler = [{ kalemler: [{ kod: 'YM-A' }] }];
  const sonuc = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1], [], teklifler, [], []);
  dogru('Açık teklifte geçen YM-A silinecekler listesinde YOK', !sonuc.some(y => y.id === 'YM-A'));
}

// ── Aktif iş emrinde olan yarı mamül silinmemeli, tamamlanmış olan engel değil ──
{
  const isemirleriAktif = [{ durum: 'devam', urunId: 'YM-A' }];
  const sonucAktif = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1], [], [], isemirleriAktif, []);
  dogru('Aktif iş emrindeki YM-A silinecekler listesinde YOK', !sonucAktif.some(y => y.id === 'YM-A'));

  const isemirleriTamam = [{ durum: 'tamamlandi', urunId: 'YM-A' }];
  const sonucTamam = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1], [], [], isemirleriTamam, []);
  dogru('Tamamlanmış iş emrindeki YM-A yine de silinebilir', sonucTamam.some(y => y.id === 'YM-A'));

  const isemirleriUretimListesi = [{ durum: 'devam', uretimListesi: [{ refId: 'YM-A' }] }];
  const sonucUl = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1], [], [], isemirleriUretimListesi, []);
  dogru('Üretim listesinde geçen aktif iş emrindeki YM-A da korunuyor', !sonucUl.some(y => y.id === 'YM-A'));
}

// ── Stokta bakiyesi olan yarı mamül silinmemeli ──
{
  const stokRaf = [{ refId: 'YM-A', miktar: 5 }];
  const sonuc = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1], [], [], [], stokRaf);
  dogru('Stokta bakiyesi olan YM-A silinecekler listesinde YOK', !sonuc.some(y => y.id === 'YM-A'));

  const stokSifir = [{ refId: 'YM-A', miktar: 0 }];
  const sonuc2 = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1], [], [], [], stokSifir);
  dogru('Stok bakiyesi 0 olan YM-A yine de silinebilir', sonuc2.some(y => y.id === 'YM-A'));
}

// ── receteVar yoksa (kartın reçetesi yoksa) hiçbir şey silinmez ──
dogru('Reçete yoksa cascade listesi boş', urunSilYarimamulCascade(null, tumYarimamuller, [], [], [], [], []).length === 0);

// ── Kalemler boşsa veya sadece hammadde içeriyorsa cascade boş ──
{
  const receteSadeceHammadde = { id: 'RC-X', urunId: 'URN-X', kalemler: [{ tip: 'hammadde', refId: 'HM-1' }] };
  dogru('Yalnızca hammadde içeren reçetede cascade boş',
    urunSilYarimamulCascade(receteSadeceHammadde, tumYarimamuller, [receteSadeceHammadde], [], [], [], []).length === 0);
}

// ── Aynı yarı mamül reçetede birden fazla kalemde geçse bile tek kart olarak döner ──
{
  const receteMukerrer = { id: 'RC-M', urunId: 'URN-M', kalemler: [
    { tip: 'yarimamul', refId: 'YM-A' }, { tip: 'yarimamul', refId: 'YM-A' }
  ] };
  const sonuc = urunSilYarimamulCascade(receteMukerrer, tumYarimamuller, [receteMukerrer], [], [], [], []);
  dogru('Mükerrer kalem tek karta indirgeniyor', sonuc.length === 1 && sonuc[0].id === 'YM-A');
}

// ── Alt montaj/paket reçetesinde bileşen olan yarı mamül de korunuyor (tip genel) ──
{
  const receteAltMontaj = { id: 'RC-AM', altMontajId: 'AM-1', kalemler: [{ tip: 'yarimamul', refId: 'YM-A' }] };
  const sonuc = urunSilYarimamulCascade(receteUrn1, tumYarimamuller, [receteUrn1, receteAltMontaj], [], [], [], []);
  dogru('Bir alt montajın reçetesinde de kullanılan YM-A korunuyor', !sonuc.some(y => y.id === 'YM-A'));
}

console.log('\n' + '─'.repeat(60));
const renk = kaldi ? '\x1b[31m' : '\x1b[32m';
console.log(renk + (kaldi ? '✗' : '✓') + ' ' + gecti + ' geçti, ' + kaldi + ' kaldı\x1b[0m\n');
process.exit(kaldi ? 1 : 0);
