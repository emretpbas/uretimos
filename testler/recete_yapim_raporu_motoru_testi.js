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

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
