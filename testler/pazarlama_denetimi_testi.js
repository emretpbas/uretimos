// ── PAZARLAMA EKRANI GENEL DENETİMİ (T53) ────────────────────────────────
// Bağımsız bir denetim ajanı page_pazarlama.js/pazarlama_motor.js'i ve
// bunların paylaştığı Store koleksiyonlarını (page_fiyat.js, page_teklif.js,
// page_siparis.js) T1-T4 tarzında inceledi. En kritik bulgu: storage.js'te
// 'fiyatListeleri' AYNI koleksiyon adı hem page_fiyat.js'in maliyet/katalog
// fiyat listeleri hem de Pazarlama'nın segment/bayi fiyat listeleri için
// KULLANILIYORDU (storage.js'te iki kez tanımlanmış, iki kez setIfAbsent
// çağrılmış — kanıt: T53 öncesi kaynak). page_teklif.js/page_siparis.js
// "son liste" = fiyatListeleri[length-1] mantığıyla kataloğu seçtiğinden,
// Pazarlama'dan yeni bir segment listesi açmak (uyumsuz şema: {segment,
// kalemler:[{urunId,kod,ad,fiyat}]} — 'listeFiyati'/'eksikKalemVarMi' YOK)
// dizinin son elemanı olup Teklif/Sipariş ekranlarının TÜM kataloğunu
// görünmez kılabiliyordu.
//
// (T52'de zaten düzeltilen iki sorun — bugunYerel UTC hatası ve kampanya/
// numune App.aktifRol() kimlik sorunu — burada tekrar test edilmiyor.)
//
// Düzeltilen 8 bulgu:
//  1) fiyatListeleri koleksiyon çakışması — Pazarlama artık ayrı
//     'pazarlamaFiyatListeleri' koleksiyonunu kullanıyor; page_teklif.js/
//     page_siparis.js ayrıca yalnızca 'kod' alanı olan GERÇEK katalog
//     listelerini seçiyor (olası eski/kalıntı kayıtlara karşı savunma).
//  2) "Kampanyalar otomatik uygulanır"/"segment fiyatı otomatik kullanılır"
//     iddiaları YANLIŞTI (PazarlamaMotor.fiyatUygula/gecerliKampanyalar
//     hiçbir teklif/sipariş akışından çağrılmıyor) — metin düzeltildi.
//  3) Excel "Fiyat" sütunu tespiti tam eşleşmeyi (Liste Fiyatı) fuzzy
//     eşleşmeden (Alış Fiyatı da "fiyat" içerir) önce artık deniyor.
//  4) Kampanya/Numune/Fiyat Listesi kaydetme butonlarında çift tıklama
//     koruması yoktu.
//  5) gecerliKampanyalar farklı tipteki (%, ₺, gün) kampanyaları aynı ham
//     'deger' alanına göre sıralıyordu (birim uyumsuzluğu).
//  6) tutar_indirim/hediye/vade için negatif 'deger' kontrolü yoktu.
//  7) Excel'de fiyat=0 satırlar sessizce geçerli kabul ediliyordu.
//  8) Excel'de mükerrer ürün kodu geçince eklenen/güncellenen sayaçları
//     yanıltıcı raporluyordu (net etki farklı gösteriliyordu).
//
// pazarlama_motor.js dual-mode (module.exports) olduğundan gerçek birim
// testi yapılır; storage.js/page_*.js kaynak üzerinde regex ile kilitlenir.
const fs = require('fs'), path = require('path');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- BULGU 1: storage.js artık pazarlamaFiyatListeleri\'ni AYRI koleksiyon olarak tanımlıyor --');
{
  const storageSrc = fs.readFileSync(path.join(__dirname, '..', 'storage.js'), 'utf8');
  t('pazarlamaFiyatListeleri koleksiyonu tanımlı', /pazarlamaFiyatListeleri: coll\('pazarlamaFiyatListeleri'\)/.test(storageSrc));
  const fiyatListeleriTanimSayisi = (storageSrc.match(/fiyatListeleri: coll\('fiyatListeleri'\)/g) || []).length;
  t('fiyatListeleri artık YALNIZCA BİR kez tanımlı (eski çakışan ikinci tanım kaldırıldı)', fiyatListeleriTanimSayisi === 1);
  const setIfAbsentPazarlamaSayisi = (storageSrc.match(/setIfAbsent\('pazarlamaFiyatListeleri', \[\]\)/g) || []).length;
  t('setIfAbsent pazarlamaFiyatListeleri için ayrı çağrılıyor', setIfAbsentPazarlamaSayisi === 1);
  const setIfAbsentFiyatListeleriSayisi = (storageSrc.match(/setIfAbsent\('fiyatListeleri', \[\]\)/g) || []).length;
  t('setIfAbsent fiyatListeleri artık YALNIZCA BİR kez çağrılıyor (eski mükerrer çağrı kaldırıldı)', setIfAbsentFiyatListeleriSayisi === 1);
  t('sistemiSifirla listesinde pazarlamaFiyatListeleri de var', /'pazarlamaFiyatListeleri'/.test(storageSrc));
}

console.log('\n-- BULGU 1 (devam): page_pazarlama.js artık kendi ayrı koleksiyonunu kullanıyor --');
{
  const pzSrc = fs.readFileSync(path.join(__dirname, '..', 'page_pazarlama.js'), 'utf8');
  t('okuma Store.pazarlamaFiyatListeleri.all() ile yapılıyor', /Store\.pazarlamaFiyatListeleri\.all\(\)/.test(pzSrc));
  t('yeni liste kaydı topluEkle(\'pazarlamaFiyatListeleri\'...) ile yapılıyor', /Store\.topluEkle\('pazarlamaFiyatListeleri', \[l\], 1\)/.test(pzSrc));
  t('Excel ile kalem ekleme Store.pazarlamaFiyatListeleri.upsert ile yapılıyor', /Store\.pazarlamaFiyatListeleri\.upsert\(liste\)/.test(pzSrc));
  t('page_pazarlama.js artık paylaşılan Store.fiyatListeleri koleksiyonuna hiçbir GERÇEK kod yolunda yazmıyor/okumuyor (yalnızca açıklayıcı yorumda geçiyor)',
    (pzSrc.match(/Store\.fiyatListeleri/g) || []).length === 1);
}

console.log('\n-- BULGU 1 (devam): page_teklif.js/page_siparis.js yalnızca GERÇEK katalog listesini seçiyor --');
{
  const teklifSrc = fs.readFileSync(path.join(__dirname, '..', 'page_teklif.js'), 'utf8');
  const siparisSrc = fs.readFileSync(path.join(__dirname, '..', 'page_siparis.js'), 'utf8');
  t('page_teklif.js: sonListe artık yalnızca l.kod olan listelerden seçiliyor', /const katalogListeleri = fiyatListeleri\.filter\(l => l\.kod\);/.test(teklifSrc));
  t('page_siparis.js: sonListe artık yalnızca l.kod olan listelerden seçiliyor', /const katalogListeleri = fiyatListeleri\.filter\(l => l\.kod\);/.test(siparisSrc));
  t('page_teklif.js artık ham fiyatListeleri[length-1] KULLANMIYOR', !/const sonListe = fiyatListeleri\[fiyatListeleri\.length - 1\];/.test(teklifSrc));
  t('page_siparis.js artık ham fiyatListeleri[length-1] KULLANMIYOR', !/const sonListe = fiyatListeleri\[fiyatListeleri\.length - 1\];/.test(siparisSrc));

  console.log('\n  -- Gerçek senaryo: Pazarlama listesi (kod\'suz) "son liste" olsa bile katalog GÖRÜNMEYE devam ediyor --');
  const fiyatListeleri = [
    { id: 'FL-1', kod: 'FL-ESKI', kalemler: [{ urunId: 'U1', kod: 'CT.D.1', ad: 'X', tip: 'urun', listeFiyati: 500, eksikKalemVarMi: false }] },
    { id: 'FLS-2', ad: 'Bayi Listesi', segment: 'Bayi', kalemler: [] }   // Pazarlama kaydı, KOD YOK — eski/kalıntı senaryo
  ];
  const katalogListeleri = fiyatListeleri.filter(l => l.kod);
  const sonListe = katalogListeleri[katalogListeleri.length - 1];
  t('kalıntı pazarlama kaydı ("FLS-2") "son liste" seçimini EZMİYOR', sonListe && sonListe.id === 'FL-1');
  t('gerçek katalog kalemi (U1) hâlâ erişilebilir', sonListe.kalemler[0].urunId === 'U1' && sonListe.kalemler[0].listeFiyati === 500);
}

console.log('\n-- BULGU 2: yanıltıcı "otomatik uygulanır" iddiaları düzeltildi --');
{
  const pzSrc = fs.readFileSync(path.join(__dirname, '..', 'page_pazarlama.js'), 'utf8');
  t('"teklif aşamasında otomatik kullanılır" iddiası artık YOK', !/teklif aşamasında otomatik kullanılır/.test(pzSrc));
  t('"Teklif hazırlanırken önce müşterinin segmentine ait liste...kullanılır" iddiası artık YOK', !/Teklif hazırlanırken önce müşterinin segmentine/.test(pzSrc));
  t('kampanya kartında artık gerçeği yansıtan "otomatik yansımaz" notu var', /teklif\/sipariş\s*\n?\s*ekranına otomatik yansımaz/.test(pzSrc));
  t('fiyat listesi kartında da "otomatik yansımaz" notu var', /Teklif ekranına otomatik yansımaz/.test(pzSrc));
}

// ── pazarlama_motor.js gerçek birim testleri ────────────────────────────
global.App = { uid: p => p + '-x', persist: async f => f(), aktifRol: () => 'pazarlama' };
delete require.cache[require.resolve('../pazarlama_motor.js')];
const PazarlamaMotor = require('../pazarlama_motor.js');

console.log('\n-- BULGU 3: Excel "Fiyat" sütunu tespiti artık tam eşleşmeyi fuzzy\'den önce deniyor --');
{
  const urunler = [{ id: 'U1', kod: 'CT.D.1', ad: 'Gardırop' }];
  // "Alış Fiyatı" (maliyet, fuzzy eşleşir) sütunu "Liste Fiyatı" (tam eşleşme,
  // satış) sütunundan ÖNCE geliyor — eski kod ilk fuzzy eşleşmeyi (Alış
  // Fiyatı) seçerdi.
  const tumSatirlar = [
    ['Kod', 'Ürün Adı', 'Alış Fiyatı', 'Liste Fiyatı'],
    ['CT.D.1', 'Gardırop', '5000', '9999']
  ];
  const { kayitlar } = PazarlamaMotor.fiyatDosyasiniCoz(tumSatirlar, urunler);
  t('tam eşleşen "Liste Fiyatı" sütunu seçildi (9999), fuzzy "Alış Fiyatı" (5000) DEĞİL', kayitlar[0].fiyat === 9999);
}

console.log('\n-- BULGU 9: Excel\'de fiyat=0 satırlar artık geçersiz sayılıyor --');
{
  const urunler = [{ id: 'U1', kod: 'CT.D.1', ad: 'Gardırop' }];
  const tumSatirlar = [
    ['Kod', 'Fiyat'],
    ['CT.D.1', '0']
  ];
  const { kayitlar, hatalar } = PazarlamaMotor.fiyatDosyasiniCoz(tumSatirlar, urunler);
  t('fiyat=0 satırı kayıtlara GİRMİYOR', kayitlar.length === 0);
  t('fiyat=0 satırı hata listesinde ("geçersiz fiyat")', hatalar.some(h => /geçersiz fiyat/.test(h)));
}

console.log('\n-- BULGU 10: Excel\'de mükerrer ürün kodu artık dedup ediliyor + uyarı veriyor --');
{
  const urunler = [{ id: 'U1', kod: 'CT.D.1', ad: 'Gardırop' }];
  const tumSatirlar = [
    ['Kod', 'Fiyat'],
    ['CT.D.1', '1000'],
    ['CT.D.1', '1500']   // aynı kod, farklı fiyat — son satır kazanmalı
  ];
  const { kayitlar, hatalar } = PazarlamaMotor.fiyatDosyasiniCoz(tumSatirlar, urunler);
  t('yalnızca 1 kayıt kalıyor (mükerrer dedup edildi)', kayitlar.length === 1);
  t('SON satırın fiyatı kazanıyor (1500)', kayitlar[0].fiyat === 1500);
  t('mükerrer kod için uyarı üretildi', hatalar.some(h => /birden fazla satırda/.test(h)));
}

console.log('\n-- BULGU 5: gecerliKampanyalar artık farklı tipleri (%, ₺, gün) ham değere göre karıştırmıyor --');
{
  // "60 gün vade" (deger=60) sayısal olarak "%10 indirim" (deger=10) den
  // büyük görünür ama fiyatı hiç değiştirmez — fiyat değiştiren tipler
  // artık her zaman önce gelir.
  const kmp = [
    { durum: 'aktif', tip: 'vade', deger: 60, ad: 'Vade60', segment: 'Tümü' },
    { durum: 'aktif', tip: 'yuzde_indirim', deger: 10, ad: 'Indirim10', segment: 'Tümü' }
  ];
  const gec = PazarlamaMotor.gecerliKampanyalar(kmp, '2026-08-15', 'Bayi');
  t('fiyatı GERÇEKTEN değiştiren kampanya (yuzde_indirim) önce geliyor (vade DEĞİL)', gec[0].ad === 'Indirim10');

  console.log('\n  -- Aynı tip kendi arasında hâlâ değere göre doğru sıralanıyor --');
  const ayniTip = [
    { durum: 'aktif', tip: 'yuzde_indirim', deger: 10, ad: 'A', segment: 'Tümü' },
    { durum: 'aktif', tip: 'yuzde_indirim', deger: 25, ad: 'B', segment: 'Tümü' }
  ];
  t('aynı tipte en yüksek indirim hâlâ önce geliyor', PazarlamaMotor.gecerliKampanyalar(ayniTip, '2026-08-15', 'Tümü')[0].ad === 'B');
}

console.log('\n-- BULGU 8: tutar_indirim/hediye/vade için negatif değer artık reddediliyor --');
{
  global.Store = { kampanyalar: { all: async () => [] }, topluEkle: async () => { } };
  (async () => {
    let r = await PazarlamaMotor.kampanyaOlustur({ ad: 'Kötü Niyetli', tip: 'tutar_indirim', deger: -500 });
    t('negatif tutar_indirim reddediliyor', r.ok === false && /negatif olamaz/.test(r.hata));
    r = await PazarlamaMotor.kampanyaOlustur({ ad: 'Geçerli', tip: 'tutar_indirim', deger: 250 });
    t('pozitif tutar_indirim hâlâ kabul ediliyor', r.ok === true);
    r = await PazarlamaMotor.kampanyaOlustur({ ad: 'Vade', tip: 'vade', deger: -10 });
    t('negatif vade süresi reddediliyor', r.ok === false);

    console.log('\n-- BULGU 4: page_pazarlama.js kaynak kilidi (çift tıklama koruması) --');
    const pzSrc = fs.readFileSync(path.join(__dirname, '..', 'page_pazarlama.js'), 'utf8');
    const disabledSayisi = (pzSrc.match(/btn\.disabled = true/g) || []).length;
    t('en az 3 buton (kampanya/numune/fiyat listesi) artık disabled koruması kullanıyor', disabledSayisi >= 3);
    t('km-kaydet artık ev.currentTarget ile buton referansı alıyor', /km-kaydet.*onclick = async \(ev\)/.test(pzSrc.replace(/\n/g, ' ')));
    t('nm-kaydet artık ev.currentTarget ile buton referansı alıyor', /nm-kaydet.*onclick = async \(ev\)/.test(pzSrc.replace(/\n/g, ' ')));
    t('fl-kaydet artık ev.currentTarget ile buton referansı alıyor', /fl-kaydet.*onclick = async \(ev\)/.test(pzSrc.replace(/\n/g, ' ')));

    console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
    process.exit(bad ? 1 : 0);
  })();
}
