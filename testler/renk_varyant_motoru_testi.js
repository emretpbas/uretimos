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

console.log('\n-- kisaltmaIleRenkBul: BİRDEN FAZLA kısaltma AYNI renge bağlanabilir (ör. Dafne: DAF + LKDF) --');
const cokluKisaltmalar = [
  { renkKodu: '01', renkAdi: 'Dafne', kisaltmalar: ['DAF', 'LKDF'] },
  { renkKodu: '24', renkAdi: 'Antrasit', kisaltma: 'ANT' } // ESKİ (tekil) alan adı — geriye dönük uyumluluk
];
t('melamin Dafne son eki (.DAF) tanınıyor', RVM.kisaltmaIleRenkBul('YM.X.1.DAF', cokluKisaltmalar).renkKodu === '01');
t('lake/boyalı kapak Dafne son eki (.LKDF) DE AYNI renge bağlanıyor', RVM.kisaltmaIleRenkBul('YM.X.1.LKDF', cokluKisaltmalar).renkKodu === '01');
t('ESKİ tekil "kisaltma" alanı hâlâ çalışıyor (geriye dönük uyumluluk — canlıda kayıtlı veri bozulmaz)',
  RVM.kisaltmaIleRenkBul('YM.X.1.ANT', cokluKisaltmalar).renkKodu === '24');

console.log('\n-- temelKodCikar: kisaltmaIleRenkBul\'un TERSİ — kardeş (diğer renk) arama anahtarı --');
t('bilinen son ek ATILIR (temel kod üretilir)', RVM.temelKodCikar('YM.D20LD080KPKML.3.DAF', cokluKisaltmalar) === 'YM.D20LD080KPKML.3');
t('AYNI ailenin DİĞER kısaltma varyantı (.LKDF) da AYNI temel koda indirgenir',
  RVM.temelKodCikar('YM.D20LD080KPKLK.8.LKDF', cokluKisaltmalar) === 'YM.D20LD080KPKLK.8');
t('tanınmayan son ek null döner (renk ailesine ait değil, tahmin edilmez)',
  RVM.temelKodCikar('51.003.01.001.00', cokluKisaltmalar) === null);
t('nokta içermeyen kod null döner, çökmez', RVM.temelKodCikar('ABC', cokluKisaltmalar) === null);

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

console.log('\n-- hammaddeEslesenBul: (renk, malzeme kategorisi[, ölçü etiketi]) ile TEK kart arama --');
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

console.log('\n-- hammaddeEslesenBul: ÖLÇÜ ETİKETİ (sunta/mdf kalınlık, PVC bant kalınlık×genişlik) AYRI ANAHTAR --');
const olculuTest = [
  { id: 'O1', renkKartelaKodu: '24', malzemeKategorisi: 'sunta', renkOlcuEtiketi: '8mm' },
  { id: 'O2', renkKartelaKodu: '24', malzemeKategorisi: 'sunta', renkOlcuEtiketi: '18mm' },
  { id: 'O3', renkKartelaKodu: '24', malzemeKategorisi: 'pvc_bant', renkOlcuEtiketi: '0,40x22' },
  { id: 'O4', renkKartelaKodu: '24', malzemeKategorisi: 'pvc_bant', renkOlcuEtiketi: '1x33' }
];
t('8mm aranınca SADECE 8mm hammadde bulunur, 18mm KARIŞMAZ', RVM.hammaddeEslesenBul(olculuTest, '24', 'sunta', '8mm').id === 'O1');
t('18mm aranınca SADECE 18mm hammadde bulunur', RVM.hammaddeEslesenBul(olculuTest, '24', 'sunta', '18mm').id === 'O2');
t('30mm (tanımsız ölçü) için eşleşme bulunamaz — tahmin edilmez', RVM.hammaddeEslesenBul(olculuTest, '24', 'sunta', '30mm') === null);
t('PVC bantta 0,40x22 ile 1x33 KARIŞMAZ', RVM.hammaddeEslesenBul(olculuTest, '24', 'pvc_bant', '0,40x22').id === 'O3');
t('ölçü etiketi VERİLMEDEN arama yapılırsa, ölçülü kartlar (hepsi etiketli) eşleşmez', RVM.hammaddeEslesenBul(olculuTest, '24', 'sunta') === null);

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

console.log('\n-- YARI MAMÜL DE RENK ETİKETLİ OLABİLİR (boya: "LK.50..." gibi hazır katalog kartları TAKAS edilir, KLONLANMAZ) --');
const boyaliYarimamuller = [
  { id: 'YMB1', kod: 'YM.KAPAK.BY', ad: 'Lake Kapak Beyaz' }, // etiketsiz — eski davranış korunmalı
  { id: 'YMB2', kod: 'LK.15.KAPAK1', ad: 'Lake Boya Kapak Beyaz', renkKartelaKodu: '15', malzemeKategorisi: 'boya' },
  { id: 'YMB3', kod: 'LK.24.KAPAK1', ad: 'Lake Boya Kapak Antrasit', renkKartelaKodu: '24', malzemeKategorisi: 'boya' }
];
const boyaReceteler = [
  { id: 'RC-BOYATEST', urunId: 'URN-BOYA', kalemler: [
    { tip: 'yarimamul', refId: 'YMB2', miktar: 1, birim: 'ADET' }
  ]}
];
const boyaVeri = {
  hammaddeler: [], yarimamuller: boyaliYarimamuller, altMontajlar: [], paketler: [],
  urunler: [{ id: 'URN-BOYA', kod: 'URN.BOYATEST.BY', ad: 'Boyatest Beyaz' }],
  receteler: boyaReceteler, renkKisaltmalari: kisaltmalar
};
let boyaSayac = 0;
const boyaPlan = RVM.varyantPlaniOlustur('URN-BOYA', 'urun', '24', 'Antrasit', boyaVeri, p => p + '-TB' + (boyaSayac++));
t('renk etiketli yarı mamül (LK.15.KAPAK1) YENİDEN KLONLANMADI, hazır Antrasit karşılığına (YMB3) TAKAS edildi', (() => {
  const yeniUrunRecete = boyaPlan.yeniReceteler.find(r => r.urunId === boyaPlan.kokYeniId);
  return !!yeniUrunRecete && yeniUrunRecete.kalemler.some(k => k.refId === 'YMB3');
})());
t('takas edilen yarı mamül İÇİN yeni bir kart OLUŞTURULMADI (gerçek, önceden var olan LK.24.KAPAK1 kullanıldı)',
  !boyaPlan.yeniKartlar.some(x => x.kart.id === 'YMB3' || x.kart.kod === 'LK.24.KAPAK1'));

const boyaEksikPlan = RVM.varyantPlaniOlustur('URN-BOYA', 'urun', '99', 'TanımsızRenk',
  { ...boyaVeri, urunler: boyaVeri.urunler }, p => p + '-TC' + (boyaSayac++));
t('tanımsız hedef renk için boya karşılığı bulunamazsa ESKİ yarı mamül (YMB2) korunup RAPORLANIR', (() => {
  const yeniUrunRecete = boyaEksikPlan.yeniReceteler.find(r => r.urunId === boyaEksikPlan.kokYeniId);
  return !!yeniUrunRecete && yeniUrunRecete.kalemler.some(k => k.refId === 'YMB2') &&
    boyaEksikPlan.eksikEslesmeler.some(e => e.kaynakTipi === 'yarimamul' && e.hammaddeKod === 'LK.15.KAPAK1');
})());

console.log('\n-- KRİTİK AYRIM: KODU KENDİ İÇİNDE RENK TAŞIYAN yapısal parça, Reçete Yapım Raporu tarafından ETİKETLENMİŞ olsa bile TAKAS DEĞİL kod-deseniyle KLONLANIR --');
// GERÇEK BUG (bu testle yakalandı): "YM.PARCA.1.BY" gibi yapısal bir parça,
// Reçete Yapım Raporu tarafından (Renk Eşleştirme Anahtarı'nda görünürlük
// için) renkKartelaKodu+malzemeKategorisi ile ETİKETLENMİŞ olabilir — AMA bu
// etiket "LK.15.KAPAK1" gibi bir katalog kalemiyle AYNI anlama gelmez. Kodun
// KENDİSİ zaten renk taşıyorsa (".BY"/".ANT" gibi tanınan bir ekle bitiyorsa)
// o parça HER ZAMAN kod deseniyle eşleştirilir/klonlanır — aksi halde AYNI
// (kategori, ölçü) etiketini taşıyan BİRDEN FAZLA farklı YAPISAL parça
// (ör. 3 farklı panel) birbirine KARIŞIR ve hepsi "eksik eşleşme" (belirsiz)
// sayılır — gerçek veriyle doğrulandı.
const yapiselEtiketliVeri = {
  hammaddeler: [{ id: 'YEHM1', stokKodu: 'SKU-SUNTA-ANT', ad: 'Antrasit Sunta', renkKartelaKodu: '24', malzemeKategorisi: 'sunta' }],
  yarimamuller: [
    // İKİ FARKLI yapısal parça, Reçete Yapım Raporu tarafından AYNI
    // (kategori, ölçüsüz) etiketle etiketlenmiş — kod YİNE DE benzersiz.
    { id: 'YEYM1', kod: 'YM.PARCA.1.BY', ad: 'Parça 1 Beyaz', renkKartelaKodu: '15', malzemeKategorisi: 'sunta' },
    { id: 'YEYM2', kod: 'YM.PARCA.2.BY', ad: 'Parça 2 Beyaz', renkKartelaKodu: '15', malzemeKategorisi: 'sunta' },
    // Antrasit kardeşler ÖNCEDEN VAR (etiketsiz — henüz yayılmamış)
    { id: 'YEYM1-ANT', kod: 'YM.PARCA.1.ANT', ad: 'Parça 1 Antrasit' },
    { id: 'YEYM2-ANT', kod: 'YM.PARCA.2.ANT', ad: 'Parça 2 Antrasit' }
  ],
  altMontajlar: [], paketler: [],
  urunler: [{ id: 'YEURN', kod: 'URN.TEST.BY', ad: 'Test Ürünü Beyaz' }],
  receteler: [
    { id: 'RC-YEURN', urunId: 'YEURN', kalemler: [
      { tip: 'yarimamul', refId: 'YEYM1', miktar: 1, birim: 'ADET' },
      { tip: 'yarimamul', refId: 'YEYM2', miktar: 1, birim: 'ADET' }
    ]},
    { id: 'RC-YEYM1', yarimamulId: 'YEYM1', kalemler: [{ tip: 'hammadde', refId: 'YEHM1', miktar: 1, birim: 'M2' }] },
    { id: 'RC-YEYM2', yarimamulId: 'YEYM2', kalemler: [{ tip: 'hammadde', refId: 'YEHM1', miktar: 1, birim: 'M2' }] }
  ],
  renkKisaltmalari: kisaltmalar
};
let yeSayac = 0;
const yapiselPlan = RVM.varyantPlaniOlustur('YEURN', 'urun', '24', 'Antrasit', yapiselEtiketliVeri, p => p + '-YE' + (yeSayac++), { mevcutKartiKullan: true });
t('İKİ farklı etiketli-ama-yapısal parça BİRBİRİNE KARIŞMADI (belirsiz eşleşme/eksik raporlanmadı)', yapiselPlan.eksikEslesmeler.length === 0);
t('Parça 1\'in Antrasit kardeşi (YEYM1-ANT) DOĞRU şekilde kod deseniyle bulundu (TAKAS değil, mevcut kartla eşleşme)', (() => {
  const r = yapiselPlan.yeniReceteler.find(r => r.urunId === yapiselPlan.kokYeniId || (r.urunId && r.urunId === 'YEURN'));
  return r && r.kalemler.some(k => k.refId === 'YEYM1-ANT');
})());
t('Parça 2\'nin Antrasit kardeşi (YEYM2-ANT) de AYRI AYRI doğru bulundu (ikisi KARIŞMADI)', (() => {
  const r = yapiselPlan.yeniReceteler.find(r => r.urunId === yapiselPlan.kokYeniId || (r.urunId && r.urunId === 'YEURN'));
  return r && r.kalemler.some(k => k.refId === 'YEYM2-ANT');
})());
t('her ikisi de KENDİ reçetesinde doğru hammaddeye (Antrasit sunta) bağlandı', (() => {
  const r1 = yapiselPlan.yeniReceteler.find(r => r.yarimamulId === 'YEYM1-ANT');
  const r2 = yapiselPlan.yeniReceteler.find(r => r.yarimamulId === 'YEYM2-ANT');
  return r1 && r1.kalemler.some(k => k.refId === 'YEHM1') && r2 && r2.kalemler.some(k => k.refId === 'YEHM1');
})());

console.log('\n-- mevcutKartiKullan: SİSTEM GENELİNDE ZATEN VAR OLAN kardeş kartları KULLAN (yenisini oluşturma) --');
// GERÇEK İHTİYAÇ: "Reçete Yapım Raporu"nun sistem genelinde eşleştirmesi —
// Antrasit ürün/paket/yarımamül kartları ÖNCEDEN (ayrı bir Excel importuyla)
// zaten oluşturulmuş olabilir; bu durumda YENİ kopya YARATILMAZ, var olan
// kartlar (kendi amortisman/rota gibi alanları KORUNARAK) kullanılıp SADECE
// eksik/boş reçeteleri master'dan kurulur.
const mkVeri = {
  hammaddeler: [
    { id: 'MHM1', stokKodu: 'SKU-SUNTA-BY', ad: 'Kar Beyaz Sunta', renkKartelaKodu: '15', malzemeKategorisi: 'sunta' },
    { id: 'MHM2', stokKodu: 'SKU-SUNTA-ANT', ad: 'Karbon Gri Sunta', renkKartelaKodu: '24', malzemeKategorisi: 'sunta' }
  ],
  yarimamuller: [
    { id: 'MYM1', kod: 'YM.PARCA.1.BY', ad: 'Kapak Parçası Beyaz', rotaId: 'ROT-ESKI' },
    // KARDEŞ ÖNCEDEN VAR — kendi rotası/amortismanı FARKLI, KORUNMALI
    { id: 'MYM2', kod: 'YM.PARCA.1.ANT', ad: 'Kapak Parçası Antrasit (Önceden Var)', rotaId: 'ROT-ANT-OZEL', amortismanGideri: 99 }
  ],
  altMontajlar: [],
  paketler: [
    { id: 'MPKT1', kod: 'PKT.GOVDE.1.BY', ad: 'Gövde Paketi Beyaz' },
    // KARDEŞ PAKET de ÖNCEDEN VAR
    { id: 'MPKT2', kod: 'PKT.GOVDE.1.ANT', ad: 'Gövde Paketi Antrasit (Önceden Var)' }
  ],
  urunler: [
    { id: 'MURN1', kod: 'URN.DOLAP.BY', ad: 'Dolap Beyaz' }
    // Antrasit ÜRÜN kartı HENÜZ YOK — bu durumda yeni oluşturulmalı
  ],
  receteler: [
    { id: 'MRC-URN1', urunId: 'MURN1', kalemler: [
      { tip: 'paket', refId: 'MPKT1', miktar: 1, birim: 'ADET' }
    ]},
    { id: 'MRC-PKT1', paketId: 'MPKT1', kalemler: [
      { tip: 'yarimamul', refId: 'MYM1', miktar: 1, birim: 'ADET' }
    ]},
    { id: 'MRC-YM1', yarimamulId: 'MYM1', kalemler: [
      { tip: 'hammadde', refId: 'MHM1', miktar: 2, birim: 'M2' }
    ]}
    // MYM2 (önceden var olan Antrasit kardeş) KASITLI OLARAK reçetesiz —
    // "boşsa master'dan kurulur" davranışını kanıtlamak için.
  ],
  renkKisaltmalari: [
    { renkKodu: '15', renkAdi: 'Beyaz', kisaltmalar: ['BY'] },
    { renkKodu: '24', renkAdi: 'Antrasit', kisaltmalar: ['ANT'] }
  ]
};
let mkSayac = 0;
const mkIdUret = (p) => p + '-MK' + (mkSayac++);
const mkPlan = RVM.varyantPlaniOlustur('MURN1', 'urun', '24', 'Antrasit', mkVeri, mkIdUret, { mevcutKartiKullan: true });

t('kök için YENİ ürün kartı oluşturuldu (Antrasit ürün henüz yoktu)',
  mkPlan.yeniKartlar.some(x => x.tip === 'urun' && x.kart.kod === 'URN.DOLAP.ANT'));
t('ÖNCEDEN VAR OLAN Antrasit paket kartı (MPKT2) TEKRAR OLUŞTURULMADI',
  !mkPlan.yeniKartlar.some(x => x.tip === 'paket'));
t('kök ürünün reçetesi, VAR OLAN paket kartının (MPKT2) id\'sine bağlandı (yeni bir paket DEĞİL)', (() => {
  const yeniUrun = mkPlan.yeniKartlar.find(x => x.tip === 'urun').kart;
  const r = mkPlan.yeniReceteler.find(r => r.urunId === yeniUrun.id);
  return !!r && r.kalemler[0].refId === 'MPKT2';
})());
t('ÖNCEDEN VAR OLAN Antrasit yarı mamül kartı (MYM2) TEKRAR OLUŞTURULMADI, kendi rotası/amortismanı KORUNDU', (() => {
  const olusturulduMu = mkPlan.yeniKartlar.some(x => x.tip === 'yarimamul');
  const hedefKartDegismedi = mkVeri.yarimamuller.find(y => y.id === 'MYM2').rotaId === 'ROT-ANT-OZEL' &&
    mkVeri.yarimamuller.find(y => y.id === 'MYM2').amortismanGideri === 99;
  return !olusturulduMu && hedefKartDegismedi;
})());
t('MYM2 (önceden var, reçetesizdi) master\'ın (MYM1) reçetesinden KURULDU — hammadde doğru renge (MHM2) takas edilerek', (() => {
  const r = mkPlan.yeniReceteler.find(r => r.yarimamulId === 'MYM2');
  return !!r && r.kalemler.some(k => k.refId === 'MHM2' && k.miktar === 2);
})());

console.log('\n-- mevcutKartiKullan: VAR OLAN kartın KENDİ reçetesi ZATEN DOLUYSA ÜZERİNE YAZILMAZ --');
const mkVeriDoluRecete = JSON.parse(JSON.stringify(mkVeri));
mkVeriDoluRecete.receteler.push({ id: 'MRC-YM2-ELLE', yarimamulId: 'MYM2', kalemler: [{ tip: 'hammadde', refId: 'MHM2', miktar: 999, birim: 'ADET' }] });
let mkSayac2 = 0;
const mkPlan2 = RVM.varyantPlaniOlustur('MURN1', 'urun', '24', 'Antrasit', mkVeriDoluRecete, (p) => p + '-MK2' + (mkSayac2++), { mevcutKartiKullan: true });
t('kullanıcının ELLE kurduğu (dolu) kardeş reçetesi master tarafından EZİLMEDİ', (() => {
  const r = mkPlan2.yeniReceteler.find(r => r.yarimamulId === 'MYM2');
  return !r || (r.kalemler.length === 1 && r.kalemler[0].miktar === 999);
})());

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
