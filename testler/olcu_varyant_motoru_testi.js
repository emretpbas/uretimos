// ── Ölçü Varyantı Motoru testleri — GERÇEK üretim verisiyle doğrulandı ──────
// Kullanıcının yüklediği 11 gerçek LOGO dosyasından (AD0060.20.VV/AD0080.20.NG,
// D20.LD065/LD080/LD100.KPK...ANT/GRI, KY0100.42.MAN/MSB, RDWM ailesi, STD
// ailesi) çıkarılan GERÇEK kod örüntüleri bu testlerin temelidir — uydurma
// senaryo değildir.
const assert = require('assert');
const OVM = require('../olcu_varyant_motoru.js');
let ok = 0, bad = 0;
const t = (ad, fn) => {
  try { fn(); ok++; console.log('  GECTI ' + ad); }
  catch (e) { bad++; console.log('  KALDI ' + ad + ' -- ' + e.message); }
};
let sayac = 0;
const idUret = (prefix) => prefix + '-' + (++sayac);

console.log('\n-- kodParcasiIleOlcuBul: GERÇEK AD0060/AD0080 ailesi --');
const adAnahtari = [{ aileAdi: 'Alinda 60/80 Serisi', olculer: [{ olcu: 60, kodParcasi: '0060' }, { olcu: 80, kodParcasi: '0080' }] }];

t('"YM.AD006010.03.VV" (60cm ALT TABLA) içinde 0060 doğru bulunuyor', () => {
  const sonuc = OVM.kodParcasiIleOlcuBul('YM.AD006010.03.VV', adAnahtari);
  assert.strictEqual(sonuc.olcu, 60);
  assert.strictEqual(sonuc.kodParcasi, '0060');
});
t('"YM.AD008010.03.NG" (80cm ALT TABLA) içinde 0080 doğru bulunuyor', () => {
  const sonuc = OVM.kodParcasiIleOlcuBul('YM.AD008010.03.NG', adAnahtari);
  assert.strictEqual(sonuc.olcu, 80);
});
t('"YM.AD0ORT10.01.VV" (ölçüden BAĞIMSIZ ortak parça) hiçbir ölçüyle eşleşmiyor (null)', () => {
  assert.strictEqual(OVM.kodParcasiIleOlcuBul('YM.AD0ORT10.01.VV', adAnahtari), null);
});
t('Kayıtlı olmayan bir ölçü (ör. 100) hiç anahtarda yoksa null döner (tahmin edilmez)', () => {
  assert.strictEqual(OVM.kodParcasiIleOlcuBul('YM.AD010010.03.XX', adAnahtari), null);
});

console.log('\n-- kodParcasiIleOlcuBul: GERÇEK D20.LD065/080/100 üçlü ailesi --');
const d20Anahtari = [{
  aileAdi: 'D20.LD Serisi', olculer: [
    { olcu: 65, kodParcasi: '065' }, { olcu: 80, kodParcasi: '080' }, { olcu: 100, kodParcasi: '100' }
  ]
}];
t('"YM.D20LD065KPKML.3.ANT" içinde 65 doğru bulunuyor', () => {
  assert.strictEqual(OVM.kodParcasiIleOlcuBul('YM.D20LD065KPKML.3.ANT', d20Anahtari).olcu, 65);
});
t('"YM.D20LD100KPKML.3.GRI" içinde 100 doğru bulunuyor (3 haneli, sıfırsız)', () => {
  assert.strictEqual(OVM.kodParcasiIleOlcuBul('YM.D20LD100KPKML.3.GRI', d20Anahtari).olcu, 100);
});
t('"YM.D20LDORTKPKML.1.GRI" (ortak yan tabla, ölçüden bağımsız) null döner', () => {
  assert.strictEqual(OVM.kodParcasiIleOlcuBul('YM.D20LDORTKPKML.1.GRI', d20Anahtari), null);
});

console.log('\n-- olcuVaryantKoduUret: gerçek kod çiftleri --');
t('"YM.AD006010.03.VV" -> 0060/0080 ile "YM.AD008010.03.VV" üretiyor (renk eki motor dışında, kaynaktan aynen kalır)', () => {
  assert.strictEqual(OVM.olcuVaryantKoduUret('YM.AD006010.03.VV', '0060', '0080'), 'YM.AD008010.03.VV');
});
t('"D20LD065KPKML.PK1.ANT" -> "D20LD080KPKML.PK1.ANT" (065->080)', () => {
  assert.strictEqual(OVM.olcuVaryantKoduUret('D20LD065KPKML.PK1.ANT', '065', '080'), 'D20LD080KPKML.PK1.ANT');
});
t('kodParcasi hiç geçmeyen bir kod DEĞİŞMEDEN döner', () => {
  assert.strictEqual(OVM.olcuVaryantKoduUret('YM.AD0ORT10.01.VV', '0060', '0080'), 'YM.AD0ORT10.01.VV');
});

console.log('\n-- alternatifHammaddeleriBul: aynı açıklama farklı ölçü --');
const hammaddelerAlt = [
  { id: 'HM-1', ad: 'SUNTA 18MM BEYAZ', en: 1830, boy: 3660 },
  { id: 'HM-2', ad: 'SUNTA 18MM BEYAZ', en: 2440, boy: 1220 }, // aynı açıklama, farklı levha ölçüsü -> ALTERNATİF
  { id: 'HM-3', ad: 'SUNTA 18MM ANTRASİT', en: 1830, boy: 3660 }, // farklı açıklama -> alternatif DEĞİL
];
t('aynı açıklama + farklı en/boy olan hammadde ALTERNATİF olarak bulunuyor', () => {
  const sonuc = OVM.alternatifHammaddeleriBul(hammaddelerAlt[0], hammaddelerAlt);
  assert.strictEqual(sonuc.length, 1);
  assert.strictEqual(sonuc[0].id, 'HM-2');
});
t('farklı açıklamalı hammadde alternatif OLARAK bulunmuyor', () => {
  const sonuc = OVM.alternatifHammaddeleriBul(hammaddelerAlt[0], hammaddelerAlt);
  assert.ok(!sonuc.some(x => x.id === 'HM-3'));
});
t('aynı açıklama + AYNI en/boy olan kart kendisi hariç alternatif SAYILMAZ', () => {
  const ayniOlcu = [{ id: 'HM-1', ad: 'X', en: 100, boy: 200 }, { id: 'HM-4', ad: 'X', en: 100, boy: 200 }];
  assert.strictEqual(OVM.alternatifHammaddeleriBul(ayniOlcu[0], ayniOlcu).length, 0);
});

console.log('\n-- olcuVaryantPlaniOlustur: GERÇEK AD0060->AD0080 reçete ağacı (sistemde AD0080 YOK, sıfırdan klonlanıyor) --');
function ad0060VeriOlustur() {
  const hammaddeler = [
    { id: 'HM-MINIFIX', stokKodu: '51.003.01.001.00', ad: 'MİNİFİX GÖVDESİ 18MM İÇİN ÇİNKO' },
    { id: 'HM-KOLI60', stokKodu: '55.01.304.00', ad: 'MK-304.00 ALİNDA 60 ALT KOLİ' }, // ÖLÇÜYE ÖZEL ama kod örüntüsünden türetilemez
  ];
  const yarimamuller = [
    { id: 'YM-ORT1', kod: 'YM.AD0ORT10.01.VV', ad: 'Alinda Lav.Dlb. ORT. YAN TABLA SAĞ Açık Ceviz' }, // ÖLÇÜDEN BAĞIMSIZ
    { id: 'YM-ALTTB60', kod: 'YM.AD006010.03.VV', ad: 'Alinda 60cm Lav.Dlb. ALT TABLA Açık Ceviz' }, // ÖLÇÜYE BAĞIMLI
  ];
  const paketler = [
    { id: 'PKT-60', kod: 'AD006020.PK1.VV', ad: 'Alinda 60cm Lav.Dlb.Açık Ceviz-Tablalı Pkt1' },
  ];
  const receteler = [
    {
      id: 'RC-PKT60', paketId: 'PKT-60', ad: 'Paket Reçetesi', kalemler: [
        { tip: 'yarimamul', refId: 'YM-ORT1', miktar: 1 },
        { tip: 'yarimamul', refId: 'YM-ALTTB60', miktar: 1 },
        { tip: 'hammadde', refId: 'HM-KOLI60', miktar: 1 },
      ]
    },
    { id: 'RC-ALTTB60', yarimamulId: 'YM-ALTTB60', ad: 'Alt Tabla Reçetesi', kalemler: [{ tip: 'hammadde', refId: 'HM-MINIFIX', miktar: 4 }] }
  ];
  return { hammaddeler, yarimamuller, altMontajlar: [], paketler, urunler: [], receteler, olcuEslestirmeAnahtari: adAnahtari };
}

t('80cm paket SIFIRDAN klonlanıyor, kod DOĞRU üretiliyor (0060->0080)', () => {
  const veri = ad0060VeriOlustur();
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret);
  const yeniPaket = plan.yeniKartlar.find(k => k.tip === 'paket').kart;
  assert.strictEqual(yeniPaket.kod, 'AD008020.PK1.VV');
});
t('ölçüye bağımlı ALT TABLA yeni kart olarak klonlanıyor, kodu 0080 taşıyor', () => {
  const veri = ad0060VeriOlustur();
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret);
  const yeniAltTabla = plan.yeniKartlar.find(k => k.tip === 'yarimamul').kart;
  assert.strictEqual(yeniAltTabla.kod, 'YM.AD008010.03.VV');
});
t('ölçüden BAĞIMSIZ ortak parça (YM-ORT1) KLONLANMIYOR, AYNEN (eski id ile) referans ediliyor', () => {
  const veri = ad0060VeriOlustur();
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret);
  // Ortak parça için YENİ bir yarimamul kart OLUŞMAMALI (sadece 1 yarimamul klonu -ALT TABLA- olmalı)
  assert.strictEqual(plan.yeniKartlar.filter(k => k.tip === 'yarimamul').length, 1);
  const yeniPaketRecete = plan.yeniReceteler.find(r => r.paketId === plan.kokYeniId);
  const ortKalem = yeniPaketRecete.kalemler.find(k => k.tip === 'yarimamul' && k.refId === 'YM-ORT1');
  assert.ok(ortKalem, 'ortak parça kalemi eski refId ile AYNEN korunmalı');
});
t('hammadde kalemi (koli) refId DEĞİŞTİRİLMİYOR (kod örüntüsünden türetilemediği için aynen kalır)', () => {
  const veri = ad0060VeriOlustur();
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret);
  const yeniPaketRecete = plan.yeniReceteler.find(r => r.paketId === plan.kokYeniId);
  const koliKalem = yeniPaketRecete.kalemler.find(k => k.tip === 'hammadde');
  assert.strictEqual(koliKalem.refId, 'HM-KOLI60');
});
t('GERÇEK GAP YAKALANDI: ölçüye özel ama kod-türetilemez hammadde (60 ALT KOLİ) UYARI olarak raporlanıyor', () => {
  const veri = ad0060VeriOlustur();
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret);
  const uyari = plan.eksikEslesmeler.find(e => e.neden === 'olcuyeOzelOlabilirElleKontrolEdin');
  assert.ok(uyari, 'koli hammaddesi için uyarı üretilmeli');
  assert.strictEqual(uyari.kod, '55.01.304.00');
});
t('alt tabla klonunun alt reçetesi (MİNİFİX hammaddesi) de doğru kopyalanıyor', () => {
  const veri = ad0060VeriOlustur();
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret);
  const yeniAltTablaId = plan.yeniKartlar.find(k => k.tip === 'yarimamul').kart.id;
  const altTablaRecete = plan.yeniReceteler.find(r => r.yarimamulId === yeniAltTablaId);
  assert.ok(altTablaRecete, 'alt tablanın kendi reçetesi de klonlanmalı');
  assert.strictEqual(altTablaRecete.kalemler[0].refId, 'HM-MINIFIX');
});

console.log('\n-- olcuVaryantPlaniOlustur: hedef ölçü anahtarda TANIMLI DEĞİLSE tahmin edilmez --');
t('anahtarda kayıtlı olmayan bir hedef ölçü (ör. 100, AD ailesinde yok) -> eksikEslesmeler, kart AYNEN kalır', () => {
  const veri = ad0060VeriOlustur();
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 100, veri, idUret);
  // AD ailesinde 100 tanımlı değil -> kök dahi klonlanmamalı (eskisiyle aynı id dönmeli)
  assert.strictEqual(plan.kokYeniId, 'PKT-60');
  assert.ok(plan.eksikEslesmeler.some(e => e.neden === 'hedefOlcuTanimsiz'));
});

console.log('\n-- mevcutKartiKullan: sistemde ZATEN VAR olan 80cm kardeş kullanılır, YENİDEN OLUŞTURULMAZ --');
// NOT: eşleşme TAM koda göredir (kaynak kodun ölçü tokenı hariç HER ŞEYİ
// AYNI kalmalı) — bu testte kaynakla AYNI renk ekini ('VV') kullanıyoruz.
// Gerçek verideki AD0060.20.VV/AD0080.20.NG örneği gibi FARKLI renkte bir
// "80cm kardeş" olması durumu AYRI bir testte (aşağıda, "gerçek isim
// kayması") ele alınır — o durumda motor bilerek YENİ bir kart oluşturur,
// asla rastgele bir rengi "doğru" sayıp ona bağlanmaz.
t('80cm paket ZATEN sistemde varsa (boş reçeteyle) o kullanılır, yeni kart YARATILMAZ', () => {
  const veri = ad0060VeriOlustur();
  veri.paketler.push({ id: 'PKT-80-MEVCUT', kod: 'AD008020.PK1.VV', ad: 'Alinda 80cm Lav.Dlb.Açık Ceviz-Tablalı Pkt1' });
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret, { mevcutKartiKullan: true });
  assert.strictEqual(plan.kokYeniId, 'PKT-80-MEVCUT');
  assert.ok(!plan.yeniKartlar.some(k => k.tip === 'paket'), 'mevcut paket için YENİ kart oluşturulmamalı');
});
t('mevcutKartiKullan: 80cm hedefin KENDİ dolu reçetesi varsa ÜZERİNE YAZILMAZ', () => {
  const veri = ad0060VeriOlustur();
  veri.paketler.push({ id: 'PKT-80-MEVCUT', kod: 'AD008020.PK1.VV', ad: 'Alinda 80cm' });
  veri.receteler.push({ id: 'RC-80-ELLE', paketId: 'PKT-80-MEVCUT', ad: 'Elle kurulmuş', kalemler: [{ tip: 'hammadde', refId: 'HM-OZEL', miktar: 99 }] });
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret, { mevcutKartiKullan: true });
  assert.strictEqual(plan.yeniReceteler.length, 0, 'zaten dolu reçeteye DOKUNULMAMALI');
});
t('GERÇEK İSİM KAYMASI: hedef ölçüde var olan kardeş FARKLI bir renk/model ekiyle kayıtlıysa (ör. gerçek AD0080.20.NG), motor onu "bulamaz" ve GÜVENLE yeni bir kart oluşturur (asla yanlış karta bağlanmaz)', () => {
  const veri = ad0060VeriOlustur();
  // Gerçek dosyalarda görüldüğü gibi: 80cm kardeşin kodu TAMAMEN aynı renk
  // ekini taşımıyor (VV yerine NG) — motor TAM kod eşleşmesi aradığından bu
  // kartı "80cm kardeşim" olarak YANLIŞLIKLA benimsemez.
  veri.paketler.push({ id: 'PKT-80-FARKLI-RENK', kod: 'AD008020.PK1.NG', ad: 'Alinda 80cm Lav.Dlb.Natural Çam-Tablalı Pkt1' });
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret, { mevcutKartiKullan: true });
  assert.notStrictEqual(plan.kokYeniId, 'PKT-80-FARKLI-RENK', 'farklı renkli karta YANLIŞLIKLA bağlanmamalı');
  assert.ok(plan.yeniKartlar.some(k => k.tip === 'paket'), 'bunun yerine güvenle YENİ bir kart oluşturulmalı');
});
t('kokHedefId: çağıran taraf kökü zaten biliyorsa kod-yapısal arama BYPASS edilir', () => {
  const veri = ad0060VeriOlustur();
  veri.paketler.push({ id: 'PKT-FARKLI-SERI', kod: 'TAMAMEN.FARKLI.KOD', ad: 'Farklı seri ama aynı aile' });
  const plan = OVM.olcuVaryantPlaniOlustur('PKT-60', 'paket', 80, veri, idUret, { mevcutKartiKullan: true, kokHedefId: 'PKT-FARKLI-SERI' });
  assert.strictEqual(plan.kokYeniId, 'PKT-FARKLI-SERI');
});

console.log('\n-- sistemGenelindeOlcuTamamlama: GERÇEK ÜÇ ÖLÇÜLÜ D20.LD ailesi (065 TAM, 080 EKSİK, 100 YOK) --');
// NOT: gerçek dosyalarda 80cm kardeşin kod deseni "KPKCLK" (ÇİZGİLİ/farklı
// model çizgisi) iken 65cm'inki "KPKLK" idi — yani bunlar aslında FARKLI
// ürün hatları, salt ölçü kardeşi değil. Bu YUKARIDAKİ "GERÇEK İSİM KAYMASI"
// testinde (AD0060/0080 ile) zaten KAPSANDI: motor böyle bir uyuşmazlıkta
// kardeşi "bulamaz" ve güvenle YENİ kart oluşturur. Burada sistemGenelinde
// fonksiyonunun MUTLU YOLUNU (tam kod eşleşmesiyle var olan kardeşi bulup
// tamamlama) izole test etmek için TUTARLI (KPKLK) bir aile kullanıyoruz.
function d20UcluVeriOlustur() {
  const yarimamuller = [
    { id: 'YM-ALTTB65', kod: 'YM.D20LD065KPKML.3.ANT', ad: 'D20 65cm.KPK.Lav.Dlp Alt Tabla Antrasit' },
    { id: 'YM-ALTTB80', kod: 'YM.D20LD080KPKML.3.ANT', ad: 'D20 80cm.Lav.Dlp ALT TABLA MELAMİN ANTRASİT' }, // reçetesi YOK -> tamamlanmalı
  ];
  const paketler = [
    { id: 'PKT-65', kod: 'D20LD065KPKLK.PK1.ANT', ad: 'D20 65cm.KPK.Lav.Dolabı.Pkt.1.Antrasit' },
    { id: 'PKT-80', kod: 'D20LD080KPKLK.PK1.ANT', ad: 'D20 80cm.KPK.Lav.Dolabı.Pkt.1.Antrasit' },
  ];
  const receteler = [
    { id: 'RC-PKT65', paketId: 'PKT-65', ad: '65 Paket Reçetesi', kalemler: [{ tip: 'yarimamul', refId: 'YM-ALTTB65', miktar: 1 }] }
    // PKT-80 ve YM-ALTTB80 için KASITLI olarak reçete YOK — tamamlanması beklenen durum
  ];
  return { hammaddeler: [], yarimamuller, altMontajlar: [], paketler, urunler: [], receteler, olcuEslestirmeAnahtari: d20Anahtari };
}
t('65 master kullanılarak 80 EKSİK reçete tamamlanıyor (ZATEN VAR olan PKT-80/YM-ALTTB80 kartları kullanılarak)', () => {
  const veri = d20UcluVeriOlustur();
  const rapor = OVM.sistemGenelindeOlcuTamamlama('D20LD065KPKLK.PK1.ANT', 'paket', veri, idUret);
  assert.strictEqual(rapor.sonuclar.length, 1, 'sadece 80 için tamamlama yapılmalı (100 sistemde yok)');
  assert.strictEqual(rapor.sonuclar[0].hedefKartId, 'PKT-80', 'ZATEN VAR olan PKT-80 kullanılmalı, yeni kart YARATILMAMALI');
  const yeniRecete = rapor.sonuclar[0].yeniReceteler.find(r => r.paketId === 'PKT-80');
  assert.ok(yeniRecete, 'PKT-80 için reçete OLUŞTURULMALI');
  assert.strictEqual(yeniRecete.kalemler[0].refId, 'YM-ALTTB80', 'kalem ZATEN VAR olan YM-ALTTB80\'e bağlanmalı');
});
t('100 ölçüsü sistemde HİÇ yoksa (ürün kartı yok) sessizce atlanır, hata ÜRETMEZ', () => {
  const veri = d20UcluVeriOlustur();
  const rapor = OVM.sistemGenelindeOlcuTamamlama('D20LD065KPKLK.PK1.ANT', 'paket', veri, idUret);
  assert.ok(!rapor.sonuclar.some(s => s.hedefOlcu === 100));
});
t('master kart bulunamazsa anlamlı bir bayrak döner', () => {
  const veri = d20UcluVeriOlustur();
  const rapor = OVM.sistemGenelindeOlcuTamamlama('OLMAYAN.KOD', 'paket', veri, idUret);
  assert.strictEqual(rapor.masterBulunamadi, true);
});
t('master kartın kodu hiçbir ölçü ailesine ait değilse anlamlı bir bayrak döner', () => {
  const veri = d20UcluVeriOlustur();
  veri.paketler.push({ id: 'PKT-ALAKASIZ', kod: 'TAMAMEN.ALAKASIZ.KOD', ad: 'x' });
  const rapor = OVM.sistemGenelindeOlcuTamamlama('TAMAMEN.ALAKASIZ.KOD', 'paket', veri, idUret);
  assert.strictEqual(rapor.masterOlcuAilesineAitDegil, true);
});
t('zaten TAM (kalemli) reçetesi olan ölçüye DOKUNULMAZ (tekrar işlenmez)', () => {
  const veri = d20UcluVeriOlustur();
  // 80 için de elle TAM bir reçete ekleyelim
  veri.receteler.push({ id: 'RC-PKT80-ELLE', paketId: 'PKT-80', ad: 'Elle', kalemler: [{ tip: 'yarimamul', refId: 'YM-ALTTB80', miktar: 1 }] });
  const rapor = OVM.sistemGenelindeOlcuTamamlama('D20LD065KPKLK.PK1.ANT', 'paket', veri, idUret);
  assert.strictEqual(rapor.sonuclar.length, 0, 'zaten tam reçetesi olan ölçüye dokunulmamalı');
});

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
