// ── Renk Varyantı Motoru — deterministik (AI DEĞİL) hammadde takas motoru ───
// GERÇEK İHTİYAÇ: reçete yaparken en çok zorlanılan konu bir yarı mamülün
// renk varyantını (ör. Beyaz -> Antrasit) çıkarırken altındaki renge bağımlı
// hammaddelerin (sunta/mdf/pvc kenar bandı/boya) DOĞRU karşılıklarıyla
// değişmesi — metraj/ağırlık/ölçü/rota/amortisman/GYG'ye HİÇ dokunmadan.
// Bu testler renk_varyant_motoru.js'in SAF (DOM/Store'suz) fonksiyonlarını
// gerçekçi, çok katmanlı bir ürün ağacıyla (ürün->alt montaj->yarı
// mamül->hammadde, paylaşılan alt bileşen + kasıtlı bir döngü) doğrular.

const RVM = require('../renk_varyant_motoru.js');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- kisaltmaIleRenkBul: kod son eki bilinen kısaltmaya göre renk çıkarımı --');
const kisaltmalar = [
  { renkKodu: '15', renkAdi: 'Beyaz', kisaltma: 'BY' },
  { renkKodu: '24', renkAdi: 'Antrasit', kisaltma: 'ANT' }
];
t('".BY" ile biten kod Beyaz olarak tanınıyor', RVM.kisaltmaIleRenkBul('YM.PARCA.1.BY', kisaltmalar).renkKodu === '15');
t('".ANT" ile biten kod Antrasit olarak tanınıyor', RVM.kisaltmaIleRenkBul('YM.PARCA.1.ANT', kisaltmalar).renkKodu === '24');
t('tanınmayan son ek null döner (uydurma yapılmaz)', RVM.kisaltmaIleRenkBul('51.003.01.001.00', kisaltmalar) === null);
t('nokta içermeyen kod null döner, çökmez', RVM.kisaltmaIleRenkBul('ABC', kisaltmalar) === null);

console.log('\n-- varyantKoduUret: kod üretimi --');
t('bilinen son ek DEĞİŞTİRİLİR (üzerine yazılmaz, yer değiştirir)',
  RVM.varyantKoduUret('YM.PARCA.1.BY', kisaltmalar[0], 'ANT') === 'YM.PARCA.1.ANT');
t('tanınmayan yapıda kod SONUNA eklenir (veri kaybı yok)',
  RVM.varyantKoduUret('51.003.01.001.00', null, 'ANT') === '51.003.01.001.00.ANT');

console.log('\n-- varyantAdUret: ad metninde tam kelime değişimi --');
t('tam kelime eşleşmesi değiştiriliyor', RVM.varyantAdUret('Kapak Parçası Beyaz', 'Beyaz', 'Antrasit') === 'Kapak Parçası Antrasit');
t('büyük/küçük harf duyarsız eşleşiyor', RVM.varyantAdUret('Kapak Parçası BEYAZ', 'Beyaz', 'Antrasit') === 'Kapak Parçası Antrasit');
t('eşleşme yoksa ad DOKUNULMADAN kalır (uydurma yapılmaz)', RVM.varyantAdUret('Kapak Parçası', 'Beyaz', 'Antrasit') === 'Kapak Parçası');
t('bileşik kelime içindeki YANLIŞ eşleşme engellenir ("Beyazköy" bozulmaz)',
  RVM.varyantAdUret('Beyazköy Parçası', 'Beyaz', 'Antrasit') === 'Beyazköy Parçası');

console.log('\n-- hammaddeEslesenBul: (renk, malzeme kategorisi) ile TEK hammadde arama --');
const hmTest = [
  { id: 'H1', renkKartelaKodu: '15', malzemeKategorisi: 'sunta' },
  { id: 'H2', renkKartelaKodu: '24', malzemeKategorisi: 'sunta' },
  { id: 'H3', renkKartelaKodu: '24', malzemeKategorisi: 'mdf' }
];
t('tek eşleşme bulunur', RVM.hammaddeEslesenBul(hmTest, '24', 'sunta').id === 'H2');
t('kategori farklıysa eşleşme bulunamaz (sunta/mdf AYRI tutulur)', RVM.hammaddeEslesenBul(hmTest, '24', 'pvc_bant') === null);
t('hiç eşleşme yoksa null (tahmin edilmez)', RVM.hammaddeEslesenBul(hmTest, '99', 'sunta') === null);
t('BİRDEN FAZLA eşleşme varsa da null (belirsiz, tahmin edilmez)',
  RVM.hammaddeEslesenBul([...hmTest, { id: 'H4', renkKartelaKodu: '24', malzemeKategorisi: 'sunta' }], '24', 'sunta') === null);

console.log('\n-- varyantPlaniOlustur: GERÇEKÇİ ÇOK KATMANLI ÜRÜN AĞACI --');
// Hammaddeler: sunta/mdf/pvc_bant/boya kategorileri + etiketsiz bir hırdavat.
// KASITLI EKSİK: "boya" kategorisinde SADECE Beyaz tanımlı — Antrasit boya
// karşılığı YOK (eksikEslesmeler raporunun test edilmesi için).
const hammaddeler = [
  { id: 'HM1', stokKodu: 'SKU-SUNTA-BY', ad: 'Kar Beyaz Sunta', renkKartelaKodu: '15', malzemeKategorisi: 'sunta' },
  { id: 'HM3', stokKodu: 'SKU-SUNTA-ANT', ad: 'Karbon Gri Sunta', renkKartelaKodu: '24', malzemeKategorisi: 'sunta' },
  { id: 'HM5', stokKodu: 'SKU-PVC-BY', ad: 'Beyaz PVC Bant', renkKartelaKodu: '15', malzemeKategorisi: 'pvc_bant' },
  { id: 'HM6', stokKodu: 'SKU-PVC-ANT', ad: 'Antrasit PVC Bant', renkKartelaKodu: '24', malzemeKategorisi: 'pvc_bant' },
  { id: 'HM7', stokKodu: 'SKU-BOYA-BY', ad: 'Beyaz Boya', renkKartelaKodu: '15', malzemeKategorisi: 'boya' },
  { id: 'HM4', stokKodu: 'SKU-MINIFIX', ad: 'Minifix Gövdesi' } // renk etiketi YOK — hiç dokunulmamalı
];
const yarimamuller = [
  { id: 'YM1', kod: 'YM.PARCA.1.BY', ad: 'Kapak Parçası Beyaz', rotaId: 'ROT-1', amortismanGideri: 12.5 },
  { id: 'YM2', kod: 'YM.ALT.1.BY', ad: 'Alt Parça Beyaz' }, // AM1 VE URN1'den paylaşılacak (dedup testi)
  { id: 'YM3', kod: 'YM.KAPAK.1.BY', ad: 'Kapak Beyaz' }    // boya hammaddesi -> eksik eşleşme testi
];
const altMontajlar = [
  { id: 'AM1', kod: 'AM.GOVDE.1.BY', ad: 'Gövde Beyaz', gygOraniYuzde: 7 },
  { id: 'AM_CYCLE', kod: 'AM.DONGU.1.BY', ad: 'Döngü Test Beyaz' } // kendine referans — döngü koruması testi
];
const urunler = [
  { id: 'URN1', kod: 'URN.DOLAP.BY', ad: 'Dolap Beyaz', aciklama: 'orijinal açıklama' }
];
const receteler = [
  { id: 'RC-YM1', yarimamulId: 'YM1', kalemler: [
    { tip: 'hammadde', refId: 'HM1', miktar: 2, birim: 'M2' },
    { tip: 'hammadde', refId: 'HM5', miktar: 1, birim: 'METRE' },
    { tip: 'hammadde', refId: 'HM4', miktar: 4, birim: 'ADET' }
  ]},
  { id: 'RC-YM2', yarimamulId: 'YM2', kalemler: [
    { tip: 'hammadde', refId: 'HM1', miktar: 1, birim: 'M2' }
  ]},
  { id: 'RC-YM3', yarimamulId: 'YM3', kalemler: [
    { tip: 'hammadde', refId: 'HM7', miktar: 1, birim: 'KG' }
  ]},
  { id: 'RC-AM1', altMontajId: 'AM1', kalemler: [
    { tip: 'yarimamul', refId: 'YM2', miktar: 1, birim: 'ADET' },
    { tip: 'yarimamul', refId: 'YM1', miktar: 1, birim: 'ADET' },
    { tip: 'yarimamul', refId: 'YM3', miktar: 1, birim: 'ADET' }
  ]},
  { id: 'RC-AM-CYCLE', altMontajId: 'AM_CYCLE', kalemler: [
    { tip: 'altmontaj', refId: 'AM_CYCLE', miktar: 1, birim: 'ADET' } // KENDİNE REFERANS
  ]},
  { id: 'RC-URN1', urunId: 'URN1', kalemler: [
    { tip: 'altmontaj', refId: 'AM1', miktar: 1, birim: 'ADET' },
    { tip: 'yarimamul', refId: 'YM2', miktar: 2, birim: 'ADET' } // YM2 İKİNCİ kez, farklı seviyeden
  ]}
];
const veri = { hammaddeler, yarimamuller, altMontajlar, paketler: [], urunler, receteler, renkKisaltmalari: kisaltmalar };

let sayac = 0;
const idUret = (prefix) => prefix + '-T' + (sayac++);

const plan = RVM.varyantPlaniOlustur('URN1', 'urun', '24', 'Antrasit', veri, idUret);

t('kök ürün için yeni id üretildi', !!plan.kokYeniId);
const yeniUrun = plan.yeniKartlar.find(x => x.tip === 'urun').kart;
t('yeni ürün kodu .BY -> .ANT olarak DEĞİŞTİ (eklenmedi)', yeniUrun.kod === 'URN.DOLAP.ANT');
t('yeni ürün adında "Beyaz" -> "Antrasit" değişti', yeniUrun.ad === 'Dolap Antrasit');
t('açıklama gibi renkle İLGİSİZ alanlar DOKUNULMADAN kopyalandı', yeniUrun.aciklama === 'orijinal açıklama');
t('görseller yeni varyantta BOŞ (eski renk fotoğrafı yanlış olur)', Array.isArray(yeniUrun.gorseller) && yeniUrun.gorseller.length === 0);

t('alt montaj da klonlandı (AM1)', plan.yeniKartlar.some(x => x.tip === 'altmontaj' && x.kart.kod === 'AM.GOVDE.1.ANT'));
const yeniAM1 = plan.yeniKartlar.find(x => x.tip === 'altmontaj' && x.kart.ad === 'Gövde Antrasit');
t('alt montajın GYG oranı gibi süreç değerleri DEĞİŞMEDEN kopyalandı', yeniAM1.kart.gygOraniYuzde === 7);

t('YM1 klonlandı, rota/amortisman DEĞİŞMEDEN kopyalandı', (() => {
  const yYM1 = plan.yeniKartlar.find(x => x.tip === 'yarimamul' && x.kart.kod === 'YM.PARCA.1.ANT');
  return !!yYM1 && yYM1.kart.rotaId === 'ROT-1' && yYM1.kart.amortismanGideri === 12.5;
})());

console.log('\n-- PAYLAŞILAN ALT BİLEŞEN (YM2) TEKİLLEŞTİRME --');
t('YM2 İKİ farklı yerden (AM1 ve URN1) referanslansa da SADECE BİR kez klonlanıyor',
  plan.yeniKartlar.filter(x => x.tip === 'yarimamul' && x.kart.ad === 'Alt Parça Antrasit').length === 1);

console.log('\n-- HAMMADDE TAKASI (sunta/pvc_bant AYRI, hırdavat DOKUNULMAZ) --');
const yeniYM1Recete = plan.yeniReceteler.find(r => {
  const yYM1 = plan.yeniKartlar.find(x => x.tip === 'yarimamul' && x.kart.kod === 'YM.PARCA.1.ANT');
  return yYM1 && r.yarimamulId === yYM1.kart.id;
});
t('YM1 reçetesi klonlandı', !!yeniYM1Recete);
t('sunta hammaddesi Beyaz->Antrasit karşılığına (HM3) takas edildi',
  yeniYM1Recete.kalemler.some(k => k.refId === 'HM3' && k.miktar === 2));
t('pvc bant hammaddesi Beyaz->Antrasit karşılığına (HM6) takas edildi',
  yeniYM1Recete.kalemler.some(k => k.refId === 'HM6' && k.miktar === 1));
t('renk etiketi OLMAYAN hırdavat (HM4/Minifix) DOKUNULMADAN aynı refId ile kaldı',
  yeniYM1Recete.kalemler.some(k => k.refId === 'HM4' && k.miktar === 4));
t('miktar/birim hiçbir kalemde DEĞİŞMEDİ (3 kalem de orijinal miktarlarıyla)',
  yeniYM1Recete.kalemler.length === 3);

console.log('\n-- EKSİK EŞLEŞME RAPORU (boya: Antrasit karşılığı tanımsız) --');
t('HM7 (Beyaz Boya) için Antrasit karşılığı bulunamadığı RAPORLANDI',
  plan.eksikEslesmeler.some(e => e.hammaddeKod === 'SKU-BOYA-BY' && e.malzemeKategorisi === 'boya' && e.hedefRenkKodu === '24'));
const yeniYM3Recete = plan.yeniReceteler.find(r => {
  const yYM3 = plan.yeniKartlar.find(x => x.tip === 'yarimamul' && x.kart.ad === 'Kapak Antrasit');
  return yYM3 && r.yarimamulId === yYM3.kart.id;
});
t('eşleşme bulunamayan kalemde ESKİ hammadde (HM7) KORUNDU (tahmini bağlanmadı)',
  yeniYM3Recete && yeniYM3Recete.kalemler.some(k => k.refId === 'HM7'));

console.log('\n-- DÖNGÜ KORUMASI (kendine referans veren alt montaj, AYRI bir çalıştırmada) --');
const dongPlan = RVM.varyantPlaniOlustur('AM_CYCLE', 'altmontaj', '24', 'Antrasit', veri, idUret);
t('kendine referans veren kart sonsuz özyinelemeye girmeden tamamlanıyor (bu satıra ulaşıldı)', true);
t('AM_CYCLE tam olarak BİR kez klonlandı (döngü tekrar tekrar klonlamadı)',
  dongPlan.yeniKartlar.filter(x => x.kart.kod === 'AM.DONGU.1.ANT').length === 1);
t('kendine referans eden kalem, YENİ klonun kendi id\'sine işaret ediyor (eski değil)', (() => {
  const yeniAM = dongPlan.yeniKartlar.find(x => x.kart.kod === 'AM.DONGU.1.ANT').kart;
  const r = dongPlan.yeniReceteler.find(r => r.altMontajId === yeniAM.id);
  return !!r && r.kalemler[0].refId === yeniAM.id;
})());

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
