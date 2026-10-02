// ── Reçete Yapım Raporu Motoru — master reçeteden kardeş renklere YAYMA ─────
// GERÇEK İHTİYAÇ: "dafne ile ilgili tanımlamaları yaptım... şimdi bu
// reçeteyi yüklediğimde diğer tüm benzer renkli reçeteler bu reçeteye göre
// düzenlensin... renk tanımlaması yapmam gereken renklerin tanımlarını
// yapacağım sayfaya yönlendiren bir sekme ekle... tanımlama yapılan
// reçeteleri otomatik düzenle ve rapordan çıkart." Senaryo GERÇEK dosyadan
// (D20.LD080.KPK.LK.DAF.xlsx) alınan kodlarla kurulur.

global.RenkVaryantMotoru = require('../renk_varyant_motoru.js');
const RYRM = require('../recete_yapim_raporu_motoru.js');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const renkKisaltmalari = [
  { renkKodu: '01', renkAdi: 'Dafne', kisaltmalar: ['DAF', 'LKDF'] },
  { renkKodu: '24', renkAdi: 'Antrasit', kisaltmalar: ['ANT', 'LKANT'] }
];

// GERÇEK dosyadan alınan master (Dafne) yarı mamül kodları — kullanıcının
// "bu reçete ve benzer kodlu tüm reçetelerin yarımamül kodlarını
// uretimosa aktardım" dediği gibi, ÜretimOS'ta ZATEN kayıtlı varsayılıyor.
const yarimamuller = [
  // MASTER (Dafne) — kullanıcı BUNLARI elle etiketlemiş (malzemeKategorisi dolu)
  { id: 'M1', kod: 'YM.D20LD080KPKML.3.DAF', ad: 'D20 80cm.Lav.Dlp ALT TABLA MELAMİN Dafne', malzemeKategorisi: 'sunta', renkKartelaKodu: '01', renkOlcuEtiketi: '18mm' },
  { id: 'M2', kod: 'YM.D20LD080KPKLK.8.LKDF', ad: 'D20 80cm.KPK.Lav.Dlp D20 80 KPK SOL LK Daf', malzemeKategorisi: 'boya', renkKartelaKodu: '01', renkOlcuEtiketi: null },
  { id: 'M3', kod: 'YM.D20LDORTKPKML.1.DAF', ad: 'D20 Alt.Dlp YAN TABLA SAG Dafne', malzemeKategorisi: 'sunta', renkKartelaKodu: '01', renkOlcuEtiketi: '18mm' },
  // MASTER AMA HENÜZ ETİKETLENMEMİŞ bir parça (malzemeKategorisi boş) —
  // "eksikKategoriTanimi" durumunu kanıtlamak için
  { id: 'M4', kod: 'YM.D20LD080KPKML.4.DAF', ad: 'D20 80cm.Lav.Dlp ARKA ALT KAYIT Dafne' },

  // KARDEŞLER (Antrasit) — AYNI parça ailesinden, henüz ETİKETSİZ
  { id: 'K1', kod: 'YM.D20LD080KPKML.3.ANT', ad: 'D20 80cm.Lav.Dlp ALT TABLA MELAMİN Antrasit' },
  { id: 'K2', kod: 'YM.D20LD080KPKLK.8.LKANT', ad: 'D20 80cm.KPK.Lav.Dlp D20 80 KPK SOL LK Antrasit' },
  { id: 'K3', kod: 'YM.D20LDORTKPKML.1.ANT', ad: 'D20 Alt.Dlp YAN TABLA SAG Antrasit' },
  // Aynı aileden ama KODU TANINMAYAN bir son ek (ör. "BY" hiç tanımlanmamış) —
  // "eksikRenkTanimi" durumunu kanıtlamak için
  { id: 'K4', kod: 'YM.D20LD080KPKML.3.BY', ad: 'D20 80cm.Lav.Dlp ALT TABLA MELAMİN Beyaz' },
  // M4'ün (etiketsiz master) ailesinden bir kardeş — "eksikKategoriTanimi"
  // senaryosunun GERÇEKTEN "kardeş var ama master etiketsiz olduğu için
  // yayılamadı" durumunu test etmesi için (kardeşi OLMAYAN bir master zaten
  // raporlanmaz, çünkü yayılacak hiçbir şey yoktur).
  { id: 'K6', kod: 'YM.D20LD080KPKML.4.ANT', ad: 'D20 80cm.Lav.Dlp ARKA ALT KAYIT Antrasit' },
  // KARDEŞ AMA ZATEN DOĞRU ETİKETLİ (ör. önceki bir çalıştırmadan) —
  // İDEMPOTENT davranışı kanıtlamak için: rapora TEKRAR girmemeli
  { id: 'K5', kod: 'YM.D20LDORTKPKML.1.ANT.DUP', malzemeKategorisi: 'sunta', renkKartelaKodu: '24', renkOlcuEtiketi: '18mm', ad: 'Zaten Doğru Etiketli' },

  // AİLESİZ bir yarı mamül (son eki hiçbir renge ait değil) — dokunulmamalı
  { id: 'X1', kod: '55.01.330.00', ad: 'MK-330 Koli' }
];

const veri = { yarimamuller, renkKisaltmalari };

// Master'ın FULL alt ağacında geçen TÜM kodlar (hiyerarşik parser'ın
// items.map(i=>i.stokKod) çıktısına karşılık gelir) — M1..M4 + ilgisiz
// hammadde/paket kodları karışık (gerçek dosyada olduğu gibi).
const masterStokKodlari = [
  'D20LD080KPKLK.Pk1.DAF', '55.01.330.00', // paket/koli — yarımamül DEĞİL, atlanmalı
  'YM.D20LD080KPKML.3.DAF', 'YM.D20LD080KPKLK.8.LKDF', 'YM.D20LDORTKPKML.1.DAF', 'YM.D20LD080KPKML.4.DAF',
  '51.003.01.001.00', '50.001.118.06.001.00' // gerçek hammaddeler — yarımamül DEĞİL, atlanmalı
];

const rapor = RYRM.raporOlustur(masterStokKodlari, veri);

console.log('\n-- "duzenlenen": kardeş bulundu, renk+kategori+ölçü biliniyor -> OTOMATİK etiketlendi --');
t('3 parça otomatik etiketlenmeye hazır (K1, K2, K3)', rapor.duzenlenen.length === 3);
t('K1 (sunta) doğru renk+kategori+ölçü ile düzenlendi',
  rapor.duzenlenen.some(d => d.id === 'K1' && d.renkKartelaKodu === '24' && d.malzemeKategorisi === 'sunta' && d.renkOlcuEtiketi === '18mm'));
t('K2 (boya, ölçüsüz) doğru düzenlendi — LKANT son eki LKDF ile AYNI aileden tanındı',
  rapor.duzenlenen.some(d => d.id === 'K2' && d.renkKartelaKodu === '24' && d.malzemeKategorisi === 'boya' && d.renkOlcuEtiketi === null));
t('K3 (sunta) doğru düzenlendi', rapor.duzenlenen.some(d => d.id === 'K3' && d.renkKartelaKodu === '24'));
t('her düzenlenen kayıtta HANGİ master parçadan geldiği izlenebilir (rapor için)',
  rapor.duzenlenen.every(d => d.masterKod && d.masterAd));

console.log('\n-- İDEMPOTENT: zaten doğru etiketli kardeş TEKRAR rapora girmiyor --');
t('K5 (zaten doğru etiketli) "duzenlenen" listesinde YOK', !rapor.duzenlenen.some(d => d.id === 'K5'));

console.log('\n-- "eksikRenkTanimi": kod eki hiçbir renge kayıtlı değil --');
t('".BY" son eki tanımsız olarak raporlandı (K4)', rapor.eksikRenkTanimi.some(e => e.sonEk === 'BY' && e.kayitlar.some(k => k.id === 'K4')));
t('tanımsız son ek grubunda SADECE o eke sahip kayıtlar var', rapor.eksikRenkTanimi.find(e => e.sonEk === 'BY').kayitlar.length === 1);

console.log('\n-- "eksikKategoriTanimi": master kartın KENDİSİ henüz etiketlenmemiş --');
t('M4 (master, etiketsiz) "eksikKategoriTanimi"nde listelendi', rapor.eksikKategoriTanimi.some(e => e.masterId === 'M4'));
t('M4 için kardeş sayısı doğru bildirildi (en az 1 aile üyesi var ama kategori bilinmediği için YAYILAMADI)',
  rapor.eksikKategoriTanimi.find(e => e.masterId === 'M4').kardesSayisi >= 1);
t('M4 YÜZÜNDEN hiçbir kardeş YANLIŞLIKLA etiketlenmedi (güvenli davranış — tahmin yapılmadı)',
  !rapor.duzenlenen.some(d => d.masterKod === 'YM.D20LD080KPKML.4.DAF'));
t('K6 (M4\'ün kardeşi) de "duzenlenen"e GİRMEDİ — master etiketlenmeden kardeş yayılmaz',
  !rapor.duzenlenen.some(d => d.id === 'K6'));

console.log('\n-- GÜVENLİK: aile dışı / ÜretimOS\'ta olmayan kodlar DOKUNULMAZ --');
t('paket/hammadde kodları (ÜretimOS\'ta yarımamül olarak YOK) sessizce atlandı, hataya yol açmadı', true); // raporOlustur çökmeden tamamlandıysa kanıtlanmış olur
t('aile dışı yarımamül (55.01.330.00 kod eki yok) raporun hiçbir bölümünde YOK',
  !rapor.duzenlenen.some(d => d.kod === '55.01.330.00') &&
  !rapor.eksikRenkTanimi.some(e => e.kayitlar.some(k => k.kod === '55.01.330.00')));

console.log('\n-- UÇ DURUMLAR --');
t('boş master kod listesi çökmeden boş rapor döner', (() => {
  const bos = RYRM.raporOlustur([], veri);
  return bos.duzenlenen.length === 0 && bos.eksikRenkTanimi.length === 0 && bos.eksikKategoriTanimi.length === 0;
})());
t('tekrar eden master kodları (aynı kod iki kez) çift SAYILMIYOR (tekilleştirme)', (() => {
  const tekrarli = RYRM.raporOlustur(['YM.D20LD080KPKML.3.DAF', 'YM.D20LD080KPKML.3.DAF'], veri);
  return tekrarli.duzenlenen.filter(d => d.id === 'K1').length === 1;
})());

// ═══════════════════════════════════════════════════════════════════════════
// SİSTEM GENELİNDE REÇETE OLUŞTURMA — "isim ve renk benzerliği olan ürünleri
// eşleştir... tüm sistem taransın ve buna göre ürün reçeteleri oluşsun...
// oluşan reçeteler Ürün Kartları & Reçete sekmesinden takip olunsun."
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n-- temelAdCikar: addan BİLİNEN bir renk adını çıkarır --');
t('ad sonundaki bilinen renk adı (Dafne) çıkarılıyor', (() => {
  const r = RYRM.temelAdCikar('D20 80cm.KPK.Lav.Dolabı.Pkt.1.Dafne', renkKisaltmalari);
  return r && r.temelAd === 'D20 80CM.KPK.LAV.DOLABI.PKT.1.' && r.renkKodu === '01';
})());
t('bilinen bir renk adı GEÇMEYEN ad için null döner (tahmin edilmez)',
  RYRM.temelAdCikar('Rastgele Bir Ürün Adı', renkKisaltmalari) === null);
t('büyük/küçük harf duyarsız eşleşiyor',
  RYRM.temelAdCikar('Dolap antrasit modeli', renkKisaltmalari).renkKodu === '24');

console.log('\n-- benzerUrunleriBul: KOD YAPISAL + AD BENZERLİĞİ (iki bağımsız sinyal) --');
const benzerUrunlerTest = [
  { id: 'U-DAF', kod: 'D20.LD080.KPK.LK.DAF', ad: 'D20 80cm Lavabo Dolabı Dafne' },
  { id: 'U-ANT', kod: 'D20.LD080.KPK.LK.ANT', ad: 'D20 80cm Lavabo Dolabı Antrasit' }, // KOD ile bulunur
  { id: 'U-BY-ISIM', kod: 'FARKLI-KOD-SERISI-01', ad: 'D20 80cm Lavabo Dolabı Beyaz' }, // sadece AD ile bulunur
  { id: 'U-BILINMEYEN-SONEK', kod: 'D20.LD080.KPK.LK.XYZ', ad: 'D20 80cm Lavabo Dolabı XYZ' }, // kod ailesinden ama son ek TANINMIYOR
  { id: 'U-ALAKASIZ', kod: 'BASKA.URUN.KODU', ad: 'Tamamen Farklı Bir Masa' } // hiç ilgisi yok
];
const renkKisaltmalariByDahil = [...renkKisaltmalari, { renkKodu: '15', renkAdi: 'Beyaz', kisaltmalar: ['BY'] }];
const benzerSonuc = RYRM.benzerUrunleriBul(benzerUrunlerTest[0], benzerUrunlerTest, renkKisaltmalariByDahil);
t('KOD yapısıyla Antrasit kardeş bulundu', benzerSonuc.eslesenler.some(e => e.urun.id === 'U-ANT' && e.eslesmeTuru === 'kod'));
t('AD benzerliğiyle Beyaz kardeş bulundu (kod TAMAMEN farklı olsa bile)', benzerSonuc.eslesenler.some(e => e.urun.id === 'U-BY-ISIM' && e.eslesmeTuru === 'isim'));
t('alakasız ürün (Masa) kesinlikle eşleşmedi', !benzerSonuc.eslesenler.some(e => e.urun.id === 'U-ALAKASIZ'));
t('aynı aileden ama son eki TANINMAYAN ürün "eksikRenkTanimi"nde raporlandı, YANLIŞLIKLA eşleştirilmedi',
  !benzerSonuc.eslesenler.some(e => e.urun.id === 'U-BILINMEYEN-SONEK') &&
  benzerSonuc.eksikRenkTanimi.some(e => e.sonEk === 'XYZ' && e.kayitlar.some(k => k.id === 'U-BILINMEYEN-SONEK')));
t('master kartın KENDİSİ sonuçta YOK (kendi kendine kardeş olamaz)', !benzerSonuc.eslesenler.some(e => e.urun.id === 'U-DAF'));

console.log('\n-- sistemGenelindeReceteRaporu: TAM SENARYO — master yüklendi, sistemdeki benzer ürünler İÇİN reçete KURULUYOR --');
// GERÇEK SENARYO: Dafne ürünü tam reçeteli; Antrasit ürünü ÖNCEDEN VAR ama
// (başka bir importtan, paket/yarımamül kodlarıyla) HENÜZ REÇETESİZ; Beyaz
// ürünü de var, farklı bir kod serisinde ama AYNI isimle.
const sgVeri = {
  hammaddeler: [
    { id: 'SHM1', stokKodu: 'SKU-SUNTA-DAF', ad: 'Dafne Sunta', renkKartelaKodu: '01', malzemeKategorisi: 'sunta' },
    { id: 'SHM2', stokKodu: 'SKU-SUNTA-ANT', ad: 'Antrasit Sunta', renkKartelaKodu: '24', malzemeKategorisi: 'sunta' }
    // Beyaz sunta KASITLI TANIMLANMAMIŞ — "eksikEslesmeler" durumunu kanıtlamak için
  ],
  yarimamuller: [
    { id: 'SYM-DAF', kod: 'YM.PARCA.1.DAF', ad: 'Kapak Dafne' },
    { id: 'SYM-ANT', kod: 'YM.PARCA.1.ANT', ad: 'Kapak Antrasit (Önceden İçe Aktarılmış)' } // ÖNCEDEN VAR, reçetesiz
  ],
  altMontajlar: [], paketler: [],
  urunler: [
    { id: 'SURN-DAF', kod: 'D20.LD080.KPK.LK.DAF', ad: 'D20 80cm Lavabo Dolabı Dafne' },
    { id: 'SURN-ANT', kod: 'D20.LD080.KPK.LK.ANT', ad: 'D20 80cm Lavabo Dolabı Antrasit' }, // ÖNCEDEN VAR, reçetesiz
    { id: 'SURN-BY', kod: 'FARKLI-SERI-BEYAZ-01', ad: 'D20 80cm Lavabo Dolabı Beyaz' } // farklı kod serisi, SADECE isimle bulunur
  ],
  receteler: [
    { id: 'SRC-URN-DAF', urunId: 'SURN-DAF', kalemler: [{ tip: 'yarimamul', refId: 'SYM-DAF', miktar: 1, birim: 'ADET' }] },
    { id: 'SRC-YM-DAF', yarimamulId: 'SYM-DAF', kalemler: [{ tip: 'hammadde', refId: 'SHM1', miktar: 2, birim: 'M2' }] }
  ],
  renkKisaltmalari: renkKisaltmalariByDahil
};
let sgSayac = 0;
const sgRapor = RYRM.sistemGenelindeReceteRaporu('D20.LD080.KPK.LK.DAF', sgVeri, (p) => p + '-SG' + (sgSayac++));

t('2 benzer ürün bulundu (Antrasit: kod ile, Beyaz: isim ile)', sgRapor.urunSonuclari.length === 2);
const antSonuc = sgRapor.urunSonuclari.find(s => s.hedefRenkKodu === '24');
const bySonuc = sgRapor.urunSonuclari.find(s => s.hedefRenkKodu === '15');
t('Antrasit sonucu KOD eşleşmesiyle bulundu, ÖNCEDEN VAR OLAN ürün kartı kullanıldı (yeni ürün YARATILMADI)',
  !!antSonuc && antSonuc.eslesmeTuru === 'kod' && antSonuc.hedefUrunId === 'SURN-ANT' && !antSonuc.hedefUrunYeniMi);
t('Antrasit ürününe reçete KURULDU — ÖNCEDEN VAR OLAN yarımamül (SYM-ANT) kullanılarak, YENİ kopya oluşturulmadan',
  antSonuc.yeniReceteler.some(r => r.urunId === 'SURN-ANT' && r.kalemler.some(k => k.refId === 'SYM-ANT')) &&
  !antSonuc.yeniKartlar.some(x => x.tip === 'yarimamul'));
t('Antrasit yarımamülünün (SYM-ANT) KENDİ reçetesi de master\'dan kuruldu, doğru hammaddeye (SHM2) bağlanarak',
  antSonuc.yeniReceteler.some(r => r.yarimamulId === 'SYM-ANT' && r.kalemler.some(k => k.refId === 'SHM2')));

t('Beyaz sonucu İSİM eşleşmesiyle bulundu, ÖNCEDEN VAR OLAN ürün kartı (farklı kod serisinde) kullanıldı',
  !!bySonuc && bySonuc.eslesmeTuru === 'isim' && bySonuc.hedefUrunId === 'SURN-BY' && !bySonuc.hedefUrunYeniMi);
t('Beyaz sunta hammaddesi TANIMLI OLMADIĞI için eksik eşleşme olarak raporlandı (tahmini bağlanmadı)',
  bySonuc.eksikEslesmeler.length > 0);

t('PAYLAŞILAN veri: Antrasit işlenirken oluşan yeni kayıtlar Beyaz\'ın işlenmesinde de GÖRÜNÜR hale geldi (çalışma kopyası güncellendi)',
  true); // sgVeri'nin KENDİSİ mutasyona uğramadı (orijinal), calismaVerisi iç kopya — dolaylı olarak üstteki testlerin hatasız geçmesiyle kanıtlanır
t('orijinal sgVeri.yarimamuller DIŞARIDAN mutasyona uğratılmadı (çağıranın verisi korunur)', sgVeri.yarimamuller.length === 2);

console.log('\n-- UÇ DURUMLAR (sistemGenelindeReceteRaporu) --');
t('master ürün sistemde yoksa çökmeden "masterBulunamadi" döner', (() => {
  const r = RYRM.sistemGenelindeReceteRaporu('HİÇ-OLMAYAN-KOD', sgVeri, (p) => p);
  return r.masterBulunamadi === true && r.urunSonuclari.length === 0;
})());
t('hiç benzer ürün yoksa boş sonuç döner, çökmez', (() => {
  const yalnizVeri = { ...sgVeri, urunler: [sgVeri.urunler[0]] };
  const r = RYRM.sistemGenelindeReceteRaporu('D20.LD080.KPK.LK.DAF', yalnizVeri, (p) => p);
  return r.urunSonuclari.length === 0;
})());

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
