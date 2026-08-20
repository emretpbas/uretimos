// ── ÖLÇÜ / HACİM / AĞIRLIK ─────────────────────────────────────────────────
// Bu testler paket ve ürün kartlarındaki en/boy/yükseklik/ağırlık bilgisinin
// doğru hesaplandığını ve tüm modüllerde tutarlı kullanıldığını korur.
//
// Çalıştırma:  node testler/olcu_agirlik_test.js
//
// KRİTİK KURAL: elle girilen kart değeri, reçeteden hesaplanana ÖNCELİKLİDİR.
// Bu kural bozulursa kullanıcının ürün kartına girdiği ölçü teklif ve
// sevkiyatta sessizce yok sayılır — sessiz veri kaybı sayılır.

const fs = require('fs');
const path = require('path');
const KOK = path.join(__dirname, '..');

let gecen = 0, kalan = 0;
const basliklar = [];
function bolum(ad) { basliklar.push(ad); console.log('\n\x1b[1;36m── ' + ad + '\x1b[0m'); }
function dogru(kosul, aciklama, detay) {
  if (kosul) { gecen++; console.log('  \x1b[32m✓\x1b[0m ' + aciklama); }
  else { kalan++; console.log('  \x1b[31m✗ ' + aciklama + '\x1b[0m' + (detay ? '\n     \x1b[33m' + detay + '\x1b[0m' : '')); }
}
function esit(beklenen, gercek, aciklama) {
  dogru(beklenen === gercek, aciklama, 'beklenen: ' + JSON.stringify(beklenen) + ' · gelen: ' + JSON.stringify(gercek));
}
const yakin = (a, b, tol) => Math.abs(a - b) < (tol === undefined ? 1e-9 : tol);

// ── app.js içindeki yardımcıları izole et ──────────────────────────────────
const appSrc = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
function fonksiyonAl(ad) {
  const i = appSrc.indexOf('function ' + ad + '(');
  if (i < 0) throw new Error('app.js içinde bulunamadı: ' + ad);
  let d = 0, j = appSrc.indexOf('{', i);
  do { if (appSrc[j] === '{') d++; else if (appSrc[j] === '}') d--; j++; } while (d > 0);
  return appSrc.slice(i, j);
}
const fmt = (n, b) => Number(n || 0).toFixed(b === undefined ? 2 : b);
eval([
  fonksiyonAl('olculerdenHacim'), fonksiyonAl('elleOlcuVarMi'),
  fonksiyonAl('olcuAgirlikCoz'), fonksiyonAl('olcuOzetMetni'),
  fonksiyonAl('paketOzetMetni'), fonksiyonAl('urunPaketOzeti')
].join('\n'));

// ═══════════════════════════════════════════════════════════════════════════
bolum('Hacim formülü — tek doğruluk kaynağı');

const h = olculerdenHacim(100, 50, 40);   // 200.000 cm³
dogru(yakin(h.m3, 0.2), 'm³ = (en×boy×yük)/1.000.000', 'gelen: ' + h.m3);
dogru(yakin(h.desi, 66.66667, 1e-4), 'desi = (en×boy×yük)/3000', 'gelen: ' + h.desi);
dogru(h.gecerli === true, 'Tam ölçüde geçerli işareti');
dogru(olculerdenHacim(100, 0, 40).gecerli === false, 'Eksik ölçüde geçersiz');
dogru(olculerdenHacim(-5, 50, 40).gecerli === false, 'Negatif ölçüde geçersiz');
dogru(olculerdenHacim(0, 0, 0).m3 === 0, 'Sıfır ölçüde hacim 0');
dogru(yakin(olculerdenHacim('100', '50', '40').m3, 0.2), 'Metin girdi sayıya çevrilir');
// m³ ile desi oranı sabittir: 1 m³ = 333,333 desi
dogru(yakin(h.desi / h.m3, 1000000 / 3000, 1e-6), 'desi/m³ oranı sabit (333,33)');

// ═══════════════════════════════════════════════════════════════════════════
bolum('Elle girilen değer reçeteden ÖNCELİKLİ');

const urunKarti = { id: 'U1', kod: 'PRD-1', en: 120, boy: 80, yukseklik: 75, netAgirlik: 42, brutAgirlik: 48 };
const receteOzeti = { paketSayisi: 3, netKg: 30, brutKg: 33, desi: 100, m3: 0.3 };

const c = olcuAgirlikCoz(urunKarti, receteOzeti, 1);
esit('manuel', c.kaynak, 'Kaynak manuel olarak işaretlendi');
dogru(yakin(c.m3, 0.72), 'Elle girilen ölçüden hacim hesaplandı', 'gelen: ' + c.m3);
esit(48, c.brutKg, 'Elle girilen brüt ağırlık kullanıldı');
esit(42, c.netKg, 'Elle girilen net ağırlık kullanıldı');
dogru(c.receteVar === true && c.receteOzet.m3 === 0.3,
  'Reçete değeri KAYBOLMADI (ekran farkı gösterebilsin)');
esit(3, c.paketSayisi, 'Koli sayısı reçeteden alınmaya devam ediyor');

bolum('Elle değer yoksa reçeteye düşülür');
const c2 = olcuAgirlikCoz({ id: 'U2', kod: 'PRD-2' }, receteOzeti, 1);
esit('recete', c2.kaynak, 'Kaynak reçete');
esit(0.3, c2.m3, 'Reçete hacmi kullanıldı');
esit(33, c2.brutKg, 'Reçete brüt ağırlığı kullanıldı');

bolum('Hiç veri yoksa sessizce boş döner');
const c3 = olcuAgirlikCoz({ id: 'U3', kod: 'PRD-3' }, null, 1);
esit('yok', c3.kaynak, 'Kaynak yok');
esit('', olcuOzetMetni(c3), 'Özet metni boş (ekran — basar)');
dogru(c3.m3 === 0 && c3.brutKg === 0 && c3.desi === 0, 'Tüm değerler sıfır');

// ═══════════════════════════════════════════════════════════════════════════
bolum('Miktar çarpanı — teklif/sipariş satırları');

const c4 = olcuAgirlikCoz(urunKarti, null, 5);
dogru(yakin(c4.m3, 3.6), '5 adet için hacim 5 katı', 'gelen: ' + c4.m3);
esit(240, c4.brutKg, '5 adet için brüt ağırlık 5 katı');
esit(0, olcuAgirlikCoz(urunKarti, null, 0).m3, 'Miktar 0 → hacim 0');
dogru(yakin(olcuAgirlikCoz(urunKarti, null).m3, 0.72), 'Miktar verilmezse 1 kabul edilir');
// Çarpan lineer olmalı: 3 adet = 3 × 1 adet
dogru(yakin(olcuAgirlikCoz(urunKarti, null, 3).m3, olcuAgirlikCoz(urunKarti, null, 1).m3 * 3),
  'Çarpan lineer (3 adet = 3 × 1 adet)');

bolum('Kısmi giriş — sadece ağırlık girilmiş');
const c5 = olcuAgirlikCoz({ id: 'U5', brutAgirlik: 12 }, receteOzeti, 1);
esit('manuel', c5.kaynak, 'Sadece ağırlık girilse de manuel sayılır');
esit(12, c5.brutKg, 'Girilen ağırlık kullanıldı');
esit(0, c5.m3, 'Ölçü girilmediği için hacim 0');

// ═══════════════════════════════════════════════════════════════════════════
bolum('Reçeteden paket toplama (urunPaketOzeti)');

const paketler = [
  { id: 'P1', kod: 'KOLI-A', ad: 'Büyük Koli', en: 100, boy: 50, yukseklik: 40, netAgirlik: 10, brutAgirlik: 12 },
  { id: 'P2', kod: 'KOLI-B', ad: 'Küçük Koli', en: 50, boy: 40, yukseklik: 30, netAgirlik: 4, brutAgirlik: 5 }
];
const receteler = [
  { urunId: 'U9', kalemler: [
    { tip: 'paket', refId: 'P1', miktar: 2 },
    { tip: 'paket', refId: 'P2', miktar: 3 },
    { tip: 'hammadde', refId: 'H1', miktar: 10 }   // paket olmayan kalem sayılmamalı
  ] }
];
const oz = urunPaketOzeti('U9', receteler, paketler, 1);
esit(5, oz.paketSayisi, 'Koli adedi toplandı (2+3)');
esit(39, oz.brutKg, 'Brüt ağırlık toplandı (2×12 + 3×5 = 39)');
esit(32, oz.netKg, 'Net ağırlık toplandı (2×10 + 3×4 = 32)');
// 2 × 0,2 m³ + 3 × 0,06 m³ = 0,58 m³
dogru(yakin(oz.m3, 0.58), 'Hacim toplandı (2×0,2 + 3×0,06)', 'gelen: ' + oz.m3);
dogru(oz.paketler.length === 2, 'Paket dökümü döndü');

bolum('İç içe reçete — alt montajdaki paketler de sayılır');
const receteler2 = [
  { urunId: 'U10', kalemler: [{ tip: 'altmontaj', refId: 'A1', miktar: 2 }] },
  { altMontajId: 'A1', kalemler: [{ tip: 'paket', refId: 'P2', miktar: 1 }] }
];
const oz2 = urunPaketOzeti('U10', receteler2, paketler, 1);
esit(2, oz2.paketSayisi, 'Alt montaj altındaki paket 2 kez sayıldı');
esit(10, oz2.brutKg, 'İç içe ağırlık doğru (2×5)');

bolum('Miktar çarpanı reçete toplamına da uygulanır');
const oz3 = urunPaketOzeti('U9', receteler, paketler, 4);
esit(20, oz3.paketSayisi, '4 adet sipariş → 20 koli');
esit(156, oz3.brutKg, '4 adet sipariş → 156 kg (39×4)');

// ═══════════════════════════════════════════════════════════════════════════
bolum('Özet metinleri m³ içeriyor');

const metin = olcuOzetMetni(c);
dogru(metin.includes('m³'), 'olcuOzetMetni hacim gösteriyor', metin);
dogru(metin.includes('kg'), 'olcuOzetMetni ağırlık gösteriyor', metin);
dogru(metin.includes('120×80×75 cm'), 'olcuOzetMetni ölçüyü gösteriyor', metin);
dogru(paketOzetMetni(receteOzeti).includes('m³'),
  'paketOzetMetni artık m³ içeriyor (eksikti)', paketOzetMetni(receteOzeti));

bolum('Bozuk girdi çökmemeli');
dogru(olcuAgirlikCoz(null, null, 1).kaynak === 'yok', 'null kart');
dogru(olcuOzetMetni(undefined) === '', 'undefined çözüm');
dogru(olcuAgirlikCoz({ en: 'abc', boy: 'xyz' }, null, 1).kaynak === 'yok', 'Sayı olmayan ölçüler');
dogru(urunPaketOzeti('YOK', receteler, paketler, 1).paketSayisi === 0, 'Var olmayan ürün');
dogru(urunPaketOzeti('U9', receteler, [], 1).paketSayisi === 0, 'Paket kartı listesi boş');

// ═══════════════════════════════════════════════════════════════════════════
bolum('Modüller ortak yardımcıyı kullanıyor (formül kopyalanmamış)');

const dosyalar = {
  'app.js': appSrc,
  'page_kartlar.js': fs.readFileSync(path.join(KOK, 'page_kartlar.js'), 'utf8'),
  'page_fiyat.js': fs.readFileSync(path.join(KOK, 'page_fiyat.js'), 'utf8'),
  'page_teklif.js': fs.readFileSync(path.join(KOK, 'page_teklif.js'), 'utf8'),
  'page_siparis.js': fs.readFileSync(path.join(KOK, 'page_siparis.js'), 'utf8'),
  'page_uretim_panel.js': fs.readFileSync(path.join(KOK, 'page_uretim_panel.js'), 'utf8'),
  'page_sevkiyat_panel.js': fs.readFileSync(path.join(KOK, 'page_sevkiyat_panel.js'), 'utf8'),
  'page_recete_agac.js': fs.readFileSync(path.join(KOK, 'page_recete_agac.js'), 'utf8')
};

// Hacim formülü app.js dışında ELDE yazılmamalı — tek kaynak olmalı.
// Yorum satırları hariç tutulur: formülü açıklayan bir yorum sorun değil,
// sorun olan onu ikinci kez HESAPLAMAK.
Object.entries(dosyalar).forEach(([ad, icerik]) => {
  if (ad === 'app.js') return;
  const kodSatirlari = icerik.split('\n')
    .filter(s => !/^\s*(\/\/|\*|\/\*)/.test(s))   // yorumları at
    .join('\n');
  const elde = /\/\s*1000000|\/\s*3000/.test(kodSatirlari);
  dogru(!elde, ad + ' hacim formülünü elde yazmıyor (App.olculerdenHacim kullanıyor)');
});

// Ölçü/ağırlığın görünmesi istenen modüllerin hepsi yardımcıyı çağırmalı
[['page_kartlar.js', 'kart detayı ve maliyet'],
 ['page_fiyat.js', 'fiyat listesi'],
 ['page_teklif.js', 'teklif'],
 ['page_siparis.js', 'sipariş'],
 ['page_uretim_panel.js', 'üretim paneli'],
 ['page_sevkiyat_panel.js', 'sevkiyat paneli'],
 ['page_recete_agac.js', 'reçete ekranı']].forEach(([ad, nerede]) => {
  const kullanir = /App\.(olcuAgirlikCoz|olculerdenHacim|olcuOzetMetni)/.test(dosyalar[ad]);
  dogru(kullanir, nerede + ' ölçü/hacim yardımcısını kullanıyor (' + ad + ')');
});

bolum('Elle düzenleme alanları mevcut');
dogru(/id="f-en"/.test(dosyalar['page_kartlar.js']), 'Ürün kartı formunda En alanı var');
dogru(/id="f-boy"/.test(dosyalar['page_kartlar.js']), 'Ürün kartı formunda Boy alanı var');
dogru(/id="f-yukseklik"/.test(dosyalar['page_kartlar.js']), 'Ürün kartı formunda Yükseklik alanı var');
dogru(/id="f-netagirlik"/.test(dosyalar['page_kartlar.js']), 'Ürün kartı formunda Net Ağırlık alanı var');
dogru(/id="f-brutagirlik"/.test(dosyalar['page_kartlar.js']), 'Ürün kartı formunda Brüt Ağırlık alanı var');
dogru(/en: parseFloat\(document\.getElementById\('f-en'\)/.test(dosyalar['page_kartlar.js']),
  'Ürün kartı kaydetmede ölçüler yazılıyor');
dogru(/id="ra-en"/.test(dosyalar['page_recete_agac.js']), 'Reçete ekranında En alanı var');
dogru(/id="ra-brutagirlik"/.test(dosyalar['page_recete_agac.js']), 'Reçete ekranında Brüt Ağırlık alanı var');
dogru(/id="pkt-en"/.test(dosyalar['page_kartlar.js']), 'Paket kartında En alanı korunmuş');

bolum('Teklif ve sipariş toplamları elle değerleri dikkate alıyor');
// Eski hata: toplama doğrudan urunPaketOzeti kullanıyordu, elle girilen
// değerler yok sayılıyordu. Artık olcuAgirlikCoz üzerinden gitmeli.
['page_teklif.js', 'page_siparis.js'].forEach(ad => {
  dogru(/kalemOlcuCozumu/.test(dosyalar[ad]),
    ad + ' toplamları elle girilen değerleri dikkate alıyor');
  dogru(/App\.olcuAgirlikCoz/.test(dosyalar[ad]),
    ad + ' olcuAgirlikCoz çağırıyor');
});

bolum('Geçersiz JS kaçış dizisi yok');
Object.entries(dosyalar).forEach(([ad, icerik]) => {
  // \U (büyük U) JavaScript'te geçerli değildir; ekranda ham metin görünür
  dogru(!/\\U[0-9a-fA-F]{4}/.test(icerik), ad + ' içinde geçersiz \\U kaçışı yok');
});

// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// v38 EKLERİ — çeki listesi, rota maliyeti ve kargo payı
// ═══════════════════════════════════════════════════════════════════════════
eval([fonksiyonAl('toTRY'), fonksiyonAl('hammaddeBirimFiyatTRY'), fonksiyonAl('cekiListesiUret')].join('\n'));

bolum('Çeki listesi — paketler satır satır açılıyor');

const ckPaketler = [
  { id: 'P1', kod: 'KOLI-A', ad: 'Gövde Kolisi', ambalajTipi: 'Koli', en: 100, boy: 50, yukseklik: 40, netAgirlik: 10, brutAgirlik: 12 },
  { id: 'P2', kod: 'KOLI-B', ad: 'Kapak Kolisi', ambalajTipi: 'Koli', en: 50, boy: 40, yukseklik: 30, netAgirlik: 4, brutAgirlik: 5 },
  { id: 'P3', kod: 'KOLI-C', ad: 'Ölçüsüz Koli', ambalajTipi: 'Palet' }   // ölçü YOK
];
const ckUrunler = [{ id: 'U1', kod: 'PRD-1', ad: 'Dolap' }, { id: 'U2', kod: 'PRD-2', ad: 'Masa' }];
const ckReceteler = [
  { urunId: 'U1', kalemler: [{ tip: 'paket', refId: 'P1', miktar: 1 }, { tip: 'paket', refId: 'P2', miktar: 2 }] },
  { urunId: 'U2', kalemler: [{ tip: 'paket', refId: 'P3', miktar: 1 }] }
];

const ck = cekiListesiUret([{ kod: 'PRD-1', miktar: 3 }], ckUrunler, ckReceteler, ckPaketler);
esit(2, ck.satirlar.length, 'İki farklı paket tipi ayrı satır oldu');
esit('KOLI-A', ck.satirlar[0].paketKod, 'İlk satır doğru paket');
esit(3, ck.satirlar[0].adet, '3 adet ürün → 3 adet KOLI-A');
esit(6, ck.satirlar[1].adet, '3 adet ürün × 2 → 6 adet KOLI-B');
dogru(yakin(ck.satirlar[0].birimM3, 0.2), 'Birim hacim tek koli için', 'gelen: ' + ck.satirlar[0].birimM3);
dogru(yakin(ck.satirlar[0].toplamM3, 0.6), 'Toplam hacim = birim × adet');
esit(36, ck.satirlar[0].toplamBrutKg, 'Toplam brüt = 3 × 12');
esit(9, ck.toplam.paketSayisi, 'Genel koli toplamı (3+6)');
dogru(yakin(ck.toplam.m3, 0.96, 1e-9), 'Genel hacim toplamı (3×0,2 + 6×0,06 = 0,96)', 'gelen: ' + ck.toplam.m3);
esit(66, ck.toplam.brutKg, 'Genel brüt toplamı (36 + 30)');

bolum('Çeki listesi — ölçüsü girilmemiş paket uyarısı');
const ck2 = cekiListesiUret([{ kod: 'PRD-2', miktar: 1 }], ckUrunler, ckReceteler, ckPaketler);
esit(1, ck2.olcusuzPaketler.length, 'Ölçüsüz paket tespit edildi');
esit('KOLI-C', ck2.olcusuzPaketler[0], 'Doğru paket kodu bildirildi');
esit(0, ck2.toplam.m3, 'Ölçüsüz pakette hacim 0 (uydurulmuyor)');
esit(1, ck2.satirlar.length, 'Ölçüsüz paket yine de listeleniyor');

bolum('Çeki listesi — paket yoksa ürün kartı ölçüsüne düşer');
const ckUrun3 = [{ id: 'U3', kod: 'PRD-3', ad: 'Sandalye', en: 60, boy: 60, yukseklik: 90, brutAgirlik: 8 }];
const ck3 = cekiListesiUret([{ kod: 'PRD-3', miktar: 2 }], ckUrun3, [], ckPaketler);
esit(1, ck3.satirlar.length, 'Elle ölçüden tek satır üretildi');
dogru(ck3.satirlar[0].elleGirilmis === true, 'Satır "elle" olarak işaretlendi');
esit(16, ck3.toplam.brutKg, 'Elle ağırlık × miktar (2×8)');

bolum('Çeki listesi — çok kalemli teklif');
const ck4 = cekiListesiUret(
  [{ kod: 'PRD-1', miktar: 1 }, { kod: 'PRD-2', miktar: 2 }], ckUrunler, ckReceteler, ckPaketler);
esit(3, ck4.satirlar.length, 'İki üründen toplam 3 paket satırı');
esit(5, ck4.toplam.paketSayisi, 'Koli toplamı (1+2+2)');

bolum('Çeki listesi — bozuk girdi');
esit(0, cekiListesiUret([], ckUrunler, ckReceteler, ckPaketler).satirlar.length, 'Boş kalem listesi');
esit(0, cekiListesiUret(null, ckUrunler, ckReceteler, ckPaketler).satirlar.length, 'null kalem listesi');
esit(0, cekiListesiUret([{ kod: 'YOK', miktar: 1 }], ckUrunler, ckReceteler, ckPaketler).satirlar.length,
  'Tanımsız ürün kodu atlanıyor');

// ═══════════════════════════════════════════════════════════════════════════
bolum('HATA DÜZELTMESİ — kargo payı hammadde birim fiyatına giriyor');

const ay = { usdTry: 34, eurTry: 37 };
esit(100, hammaddeBirimFiyatTRY({ birimFiyat: 100, dvz: 'TL' }, ay), 'Kargo yoksa sadece mal bedeli');
esit(115, hammaddeBirimFiyatTRY({ birimFiyat: 100, dvz: 'TL', nakliyeBirimMaliyeti: 15 }, ay),
  'Kargo payı mal bedeline ekleniyor');
esit(360, hammaddeBirimFiyatTRY({ birimFiyat: 10, dvz: 'USD', nakliyeBirimMaliyeti: 20 }, ay),
  'Dövizli mal + TL kargo doğru çevriliyor');
esit(0, hammaddeBirimFiyatTRY(null, ay), 'null hammadde çökmüyor');
// 1200 TL nakliye / 40 adet = 30 TL birim başına
esit(280, hammaddeBirimFiyatTRY({ birimFiyat: 250, dvz: 'TL', nakliyeBirimMaliyeti: 1200 / 40 }, ay),
  'Kargo alınan adede bölünüp ekleniyor (1200/40=30)');

// Maliyet hesabının HER noktası kargoyu içermeli
const kargosuzKalan = (appSrc.match(/toTRY\(hm\.birimFiyat, hm\.dvz, ayarlar\)/g) || []).length;
dogru(kargosuzKalan === 0, 'Kargoyu atlayan hammadde fiyat hesabı kalmadı', 'bulunan: ' + kargosuzKalan);

bolum('HATA DÜZELTMESİ — rota maliyeti fiyat listesine giriyor');
const fiySrc = fs.readFileSync(path.join(KOK, 'page_fiyat.js'), 'utf8');
dogru(/function bomMaliyetHesapla\([^)]*rotalar\)/.test(fiySrc),
  'bomMaliyetHesapla artık rota listesi alıyor');
dogru(!/urunMaliyetHesapla\(urun, receteler, yarimamuller, hammaddeler, \[\]/.test(fiySrc),
  'Rota listesi yerine BOŞ DİZİ geçilmiyor (eski hata)');
dogru(!/function rotaMaliyetHesapla/.test(fiySrc),
  'Yalnızca yarı mamüle bakan hatalı fonksiyon kaldırıldı');
dogru(/function rotaPayiHesapla/.test(fiySrc),
  'Rota payı raporlama için ayrıca hesaplanıyor');
dogru(!/bom\.toplam \+ isc/.test(fiySrc),
  'Rota maliyeti İKİ KEZ eklenmiyor');

bolum('Satınalma — kargo fiyat kutusundan bağımsız');
const satSrc = fs.readFileSync(path.join(KOK, 'page_satinalma_panel.js'), 'utf8');
dogru(/nakliyeBirimMaliyeti =/.test(satSrc), 'Kargo ayrı alana yazılıyor');
dogru(/nakliyeMaliyeteEklensin \|\| fiyatGuncelle/.test(satSrc),
  'Kargo, "fiyatı güncelle" kutusuna bağlı değil');
dogru(!/birimFiyatTRY \+ nakliyeBirimMaliyetiTRY/.test(satSrc),
  'Kargo artık birim fiyatın içine gömülmüyor (kaybolmuyor)');

bolum('Hammadde kartı — kargo görünür ve düzenlenebilir');
const hamSrc = fs.readFileSync(path.join(KOK, 'page_hammadde.js'), 'utf8');
dogru(/id="f-nakliye-birim"/.test(hamSrc), 'Kargo payı form alanı var');
dogru(/nakliyeBirimMaliyeti: parseFloat/.test(hamSrc), 'Kargo payı kaydediliyor');

bolum('Teklif — çeki listesi düğmesi ve ekranı');
const tkSrc = fs.readFileSync(path.join(KOK, 'page_teklif.js'), 'utf8');
dogru(/id="tk-ceki-listesi"/.test(tkSrc), 'Çeki listesi düğmesi eklendi');
dogru(/function cekiListesiAc/.test(tkSrc), 'Çeki listesi ekranı var');
dogru(/App\.cekiListesiUret/.test(tkSrc), 'Ortak üreticiyi kullanıyor');
dogru(/function cekiListesiYazdir/.test(tkSrc), 'Yazdırma var');
dogru(/function cekiListesiExcel/.test(tkSrc), 'Excel aktarımı var');

bolum('Reçete ağacı — paket satırında hacim/ağırlık düğmesi');
const raSrc = fs.readFileSync(path.join(KOK, 'page_recete_agac.js'), 'utf8');
dogru(/ra-olcu-ekle/.test(raSrc), 'Paket satırına düğme eklendi');
dogru(/function openPaketOlcuDuzenle/.test(raSrc), 'Ölçü düzenleme penceresi var');
dogru(/tip === 'paket'/.test(raSrc), 'Düğme yalnızca paket satırlarında');

bolum('Sipariş — çeki listesi (kod tekrarı olmadan)');
const spSrc = fs.readFileSync(path.join(KOK, 'page_siparis.js'), 'utf8');
dogru(/id="sp-ceki-listesi"/.test(spSrc), 'Sipariş detayında çeki listesi düğmesi var');
dogru(/PageModules\.teklif\.cekiListesiAc/.test(spSrc),
  'Ortak ekranı çağırıyor (ikinci bir kopya yazılmamış)');
dogru(!/function cekiListesiAc/.test(spSrc),
  'Sipariş modülünde çeki listesi ekranı KOPYALANMAMIŞ');
dogru(/return \{ render, cekiListesiAc, paketVerisiYukle/.test(tkSrc),
  'Teklif modülü çeki listesini dışa açıyor');

// ═══════════════════════════════════════════════════════════════════════════
// EK GİDERLER (Kesapp "görünmeyen giderler" karşılığı)
// ═══════════════════════════════════════════════════════════════════════════
eval([fonksiyonAl('ekGiderTutar'), fonksiyonAl('ekGiderToplami')].join('\n'));

bolum('Ek gider hesap yöntemleri');
const egOlcu = { m2: 50, m3: 2.4, araToplam: 100000 };
esit(1500, ekGiderTutar({ yontem: 'sabit', birim: 1500 }, egOlcu), 'Sabit tutar');
esit(1500, ekGiderTutar({ yontem: 'm2', birim: 30 }, egOlcu), 'm² bazlı (50×30)');
esit(1200, ekGiderTutar({ yontem: 'm3', birim: 500 }, egOlcu), 'm³ bazlı (2,4×500)');
esit(3000, ekGiderTutar({ yontem: 'yuzde', birim: 3 }, egOlcu), 'Yüzde (100000×%3)');
esit(0, ekGiderTutar(null, egOlcu), 'null çökmez');

bolum('Müşteriye yansıt / iç maliyet ayrımı');
const giderler = [
  { ad: 'Nakliye', yontem: 'm3', birim: 500, musteriyeYansit: true },
  { ad: 'Palet', yontem: 'sabit', birim: 800, musteriyeYansit: true },
  { ad: 'İç fason', yontem: 'sabit', birim: 2000, musteriyeYansit: false }
];
const egH = ekGiderToplami(giderler, egOlcu);
esit(2000, egH.yansitilanToplam, 'Yansıtılan toplam (1200+800), iç gider hariç');
esit(4000, egH.icMaliyetToplam, 'İç maliyet toplam (hepsi dahil)');
dogru(egH.kalemler[0].tutar === 1200, 'Her kaleme güncel tutar yazılıyor');

bolum('Teklif→sipariş ek gider taşınması (kod kontrolü)');
const spKaynak = fs.readFileSync(path.join(KOK, 'page_siparis.js'), 'utf8');
const tkKaynak = fs.readFileSync(path.join(KOK, 'page_teklif.js'), 'utf8');
dogru(/ekGiderler: \(t\.ekGiderler \|\| \[\]\)\.map/.test(tkKaynak),
  'Teklif→sipariş dönüşümü ek giderleri taşıyor');
dogru(/ekGiderler: \(siparis\.ekGiderler \|\| \[\]\)\.map/.test(spKaynak),
  'Sipariş düzenleme ek giderleri taşıyor');
dogru(/mevcut\.ekGiderler = d\.ekGiderler/.test(spKaynak),
  'Sipariş güncelleme ek giderleri kaydediyor');
dogru(/ekGiderler: d\.ekGiderler \|\| \[\]/.test(spKaynak),
  'Yeni sipariş ek giderleri kaydediyor');
dogru(/kayitEg\.yansitilanToplam/.test(spKaynak),
  'Sipariş dip toplamı ek gideri içeriyor');
dogru(/return \{ render, cekiListesiAc, paketVerisiYukle, ekGiderKutusuAc \}/.test(tkKaynak),
  'Ek gider kutusu sipariş için dışa açık (kod tekrarı yok)');
dogru(!/function ekGiderKutusu\b/.test(spKaynak),
  'Sipariş modülü ek gider UI\'sini KOPYALAMAMIŞ');

// ═══════════════════════════════════════════════════════════════════════════
// MEKAN YERLEŞİM MODÜLÜ
// ═══════════════════════════════════════════════════════════════════════════
bolum('Mekan Yerleşim — modül yapısı ve entegrasyon');

const mkSrc = fs.readFileSync(path.join(KOK, 'mekan_yerlesim.js'), 'utf8');
const stSrc = fs.readFileSync(path.join(KOK, 'storage.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
const kartSrc = fs.readFileSync(path.join(KOK, 'page_kartlar.js'), 'utf8');

dogru(/const MekanYerlesim = \(\(\) =>/.test(mkSrc), 'Modül global nesne olarak tanımlı');
dogru(/return \{ ac, listeAc, tasarimAyakIzi \}/.test(mkSrc), 'Modül ac/listeAc dışa açıyor');
dogru(/mekanlar: coll\('mekanlar'\)/.test(stSrc), 'mekanlar koleksiyonu Store\'da kayıtlı');
dogru(/setIfAbsent\('mekanlar', \[\]\)/.test(stSrc), 'mekanlar init\'te oluşturuluyor');
dogru(/'mekanlar'/.test(stSrc.split('TUM_VERI_KOLEKSIYONLARI')[1] || ''), 'mekanlar toplu senkrona dahil');
dogru(/mekan_yerlesim\.js/.test(idxSrc), 'Script index.html\'e eklenmiş');
dogru(/MekanYerlesim\.ac/.test(kartSrc), 'Kartlar ekranından açılıyor');
dogru(/id="kt-mekan"/.test(kartSrc), 'Mekan Yerleşim düğmesi var');

// Ayak izi mantığı (izole)
(function(){
  let dolapTasarimlari=[{id:'D1',kod:'DLP-1',ad:'Alt Dolap',yapilandirma:{genislik:600,derinlik:560}}];
  let masaTasarimlari=[{id:'M1',kod:'MSA-1',ad:'Bench',yapilandirma:{tablaBoy:1400,tablaEn:700,dizilim:'karsilikli',siraArasiBosluk:50,kisiSayisi:2}}];
  const alFn=(ad)=>{const i=mkSrc.indexOf('function '+ad+'(');let d=0,j=mkSrc.indexOf('{',i);do{if(mkSrc[j]==='{')d++;else if(mkSrc[j]==='}')d--;j++;}while(d>0);return mkSrc.slice(i,j);};
  eval(alFn('tasarimAyakIzi'));
  const izD=tasarimAyakIzi('dolap','D1');
  dogru(izD.en===600 && izD.derinlik===560, 'Dolap ayak izi doğru (600×560)');
  const izM=tasarimAyakIzi('masa','M1');
  dogru(izM.en===2800 && izM.derinlik===1450, 'Masa ayak izi doğru (1400×2 boy, 700×2+50 derinlik)', izM.en+'×'+izM.derinlik);
  dogru(tasarimAyakIzi('dolap','YOK').en===800, 'Bulunamayan tasarım güvenli varsayılan');
})();

// ═══════════════════════════════════════════════════════════════════════════
// CNC EXPORT (MPR / delikli DXF)
// ═══════════════════════════════════════════════════════════════════════════
bolum('CNC Export — MPR ve DXF üretimi');
const cncSrc = fs.readFileSync(path.join(KOK, 'cnc_export.js'), 'utf8');
(function(){
  const alFn=(ad)=>{const i=cncSrc.indexOf('function '+ad+'(');let d=0,j=cncSrc.indexOf('{',i);do{if(cncSrc[j]==='{')d++;else if(cncSrc[j]==='}')d--;j++;}while(d>0);return cncSrc.slice(i,j);};
  const n=(v)=>(Math.round((+v||0)*1000)/1000).toString();
  eval(alFn('mprUret')); eval(alFn('dxfUret')); eval(alFn('panelBazliGrupla'));
  const parca={ad:'Yan panel',netEn:560,netBoy:720,kalinlik:18,adet:2};
  const delikler=[{x:50,y:9,cap:15,derinlik:12.5,tip:'Gövde'},{x:37,y:400,cap:5,derinlik:13,tip:'Raf pimi'}];
  const mpr=mprUret(parca,delikler);
  dogru(mpr.includes('[H') && mpr.includes('VERSION='), 'MPR başlığı doğru');
  dogru(mpr.includes('LX=560') && mpr.includes('LY=720') && mpr.includes('LZ=18'), 'MPR parça ölçüleri doğru');
  dogru((mpr.match(/BohrVert/g)||[]).length===2, 'MPR delik sayısı doğru (BohrVert)');
  dogru(mpr.includes('BM="15"') && mpr.includes('TA=12.5'), 'MPR delik çap/derinlik doğru');
  dogru(mpr.includes('\r\n'), 'MPR Windows satır sonu (CRLF)');
  const dxf=dxfUret(parca,delikler);
  dogru(dxf.includes('KESIM') && dxf.includes('DELIK'), 'DXF kesim + delik katmanı ayrı');
  dogru((dxf.match(/CIRCLE/g)||[]).length===2, 'DXF delik sayısı doğru (CIRCLE)');
  dogru(dxf.trim().endsWith('EOF'), 'DXF geçerli biçimde bitiyor');
  const g=panelBazliGrupla({paneller:[{ad:'Yan panel',netEn:560,netBoy:720,kalinlik:18,adet:2}],delikler:[{parca:'Sol yan',x:50,y:9,cap:15,derinlik:12.5}]});
  dogru(g.length===1 && g[0].delikler.length===1, 'Panel-delik eşleşmesi çalışıyor');
})();
dogru(/id="dt-cnc"/.test(fs.readFileSync(path.join(KOK,'dolap_tasarim.js'),'utf8')), 'Dolap Tasarımda CNC düğmesi var');
dogru(/CncExport\.ac/.test(fs.readFileSync(path.join(KOK,'dolap_tasarim.js'),'utf8')), 'CNC düğmesi export modülünü çağırıyor');
dogru(/cnc_export\.js/.test(fs.readFileSync(path.join(KOK,'index.html'),'utf8')), 'cnc_export.js index.html\'e eklenmiş');

// ═══════════════════════════════════════════════════════════════════════════
// DOLAP 3D GÖRÜNÜM (WebGL geometri mantığı)
// ═══════════════════════════════════════════════════════════════════════════
bolum('Dolap 3D — modül ve geometri');
const uc3dSrc = fs.readFileSync(path.join(KOK, 'dolap_3d.js'), 'utf8');
const dtSrc3d = fs.readFileSync(path.join(KOK, 'dolap_tasarim.js'), 'utf8');
const idxSrc3d = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
dogru(/const Dolap3D = \(\(\) =>/.test(uc3dSrc), '3D modülü global nesne');
dogru(/return \{ ciz, temizle \}/.test(uc3dSrc), '3D modülü ciz/temizle dışa açıyor');
dogru(/three\.min\.js/.test(idxSrc3d), 'three.min.js index.html\'e eklenmiş');
dogru(/dolap_3d\.js/.test(idxSrc3d), 'dolap_3d.js index.html\'e eklenmiş');
dogru(/dt-g-3d/.test(dtSrc3d), 'Dolap Tasarımda 3D düğmesi var');
dogru(/Dolap3D\.ciz/.test(dtSrc3d), '3D düğmesi modülü çağırıyor');
dogru(/İzometrik/.test(dtSrc3d) && /Z\.ucBoyut/.test(dtSrc3d), 'İzometrik görünüm KORUNDU (silinmedi)');
// three.min.js gerçekten var mı ve UMD/global THREE içeriyor mu
try {
  const thr = fs.readFileSync(path.join(KOK, 'three.min.js'), 'utf8');
  dogru(thr.length > 100000 && /THREE/.test(thr), 'three.min.js mevcut ve THREE globali içeriyor');
} catch (e) { dogru(false, 'three.min.js dosyası bulunamadı'); }

// Geometri: mock THREE ile kutu üretimini doğrula
(function(){
  let kutular=[];
  const THREE={
    Group:class{constructor(){this.children=[];this.userData={};}add(){}},
    BoxGeometry:class{constructor(w,h,d){this.w=w;this.h=h;this.d=d;}},
    EdgesGeometry:class{constructor(){}}, MeshLambertMaterial:class{constructor(o){Object.assign(this,o||{});}},
    LineBasicMaterial:class{constructor(){}}, MeshBasicMaterial:class{constructor(){}},
    Mesh:class{constructor(g){this.position={set(a,b,c){this.x=a;this.y=b;this.z=c;},copy(){}};if(g&&g.w!==undefined)kutular.push({en:g.w,yuk:g.h,der:g.d});}},
    LineSegments:class{constructor(){this.position={set(){},copy(){}};}},
  };
  const alFn=(ad)=>{const i=uc3dSrc.indexOf('function '+ad+'(');let d=0,j=uc3dSrc.indexOf('{',i);do{if(uc3dSrc[j]==='{')d++;else if(uc3dSrc[j]==='}')d--;j++;}while(d>0);return uc3dSrc.slice(i,j);};
  const mm=(v)=>(+v||0)/1000;
  let boyutlar,kutu,dolabiKur;
  eval(alFn('boyutlar').replace('function boyutlar','boyutlar=function'));
  eval(alFn('kutu').replace('function kutu','kutu=function'));
  eval(alFn('dolabiKur').replace('function dolabiKur','dolabiKur=function'));
  const h={yapilandirma:{genislik:800,derinlik:560,panelKalinlik:18,bazaTipi:'baza',bazaYukseklik:100,ustTac:false},
    ozet:{govdeYukseklik:720},paneller:[{ad:'x'}],
    bolmeler:[{index:0,x:18,genislik:764,y:18,yukseklik:702,rafSabit:1,rafHareketli:2,kapakSayisi:2,cekmeceSayisi:0,cekmeceYukseklik:0}]};
  kutular=[]; const grup=dolabiKur(h,null);
  dogru(kutular.length>=10, '3D: gövde+raf+kapak+baza için yeterli kutu üretildi ('+kutular.length+')');
  dogru(kutular.some(k=>Math.abs(k.en-0.018)<0.001 && Math.abs(k.yuk-0.72)<0.001), '3D: yan panel doğru ölçüde (18×720mm)');
  dogru(grup.userData.merkezY>0 && grup.userData.capMetre>0, '3D: kamera merkez/çap hesaplandı');
})();

console.log('\n' + '─'.repeat(58));
if (kalan === 0) console.log('\x1b[1;32m✓ TOPLAM ' + gecen + ' kontrolün tamamı geçti\x1b[0m');
else console.log('\x1b[1;31m✗ TOPLAM ' + kalan + ' kontrol başarısız (' + gecen + ' geçti)\x1b[0m');
process.exit(kalan ? 1 : 0);
