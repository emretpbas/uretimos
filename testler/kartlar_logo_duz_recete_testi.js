// ── "Ürün Kartları & Reçete" — LOGO düz reçete Excel içe aktarma (YENİ) ─────
// GERÇEK İHTİYAÇ: Kullanıcının banyo dolapları reçetelerini içeren bir LOGO
// Excel exportu (Mamul Kodu/Paket Kodu/Stok Kod/Stok Türü/Miktar/Birim sütunlu,
// T sütununda R=Reçete(Yarı Mamul)/S=Sarfiyat) attığında, ürün kodlarının
// altına otomatik olarak yarı mamülleri/hammaddeleri atayacak bir algılama +
// ayrıştırma mantığı gerekiyor. Bu formatta BİRDEN FAZLA ürün AYRI
// SAYFALARDA (Reçete1, Reçete2, Reçete3) gelebiliyor — diğer iki mevcut
// formatın aksine (onlar hep tek sayfa/tek ürün varsayıyordu).
//
// page_kartlar.js Store/DOM'a derinden bağlı olduğundan (bkz. aynı desendeki
// kartlar_hiyerarsi_testi.js), saf algılama/ayrıştırma fonksiyonları
// (bomKolonBul/parseTRNumber/logoDuzReceteBasliklariBul/parseLogoDuzReceteSheet)
// kaynaktan izole edilip GERÇEK dosyadan alınan satırlarla (Reçete1 sayfası,
// D20 100cm lavabo dolabı kapaklı) çalıştırılır.

const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_kartlar.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

function fonksiyonCikar(ad) {
  const baslangic = kaynak.indexOf('function ' + ad + '(');
  let derinlik = 0, i = kaynak.indexOf('{', baslangic), sonuc = '';
  for (; i < kaynak.length; i++) {
    const c = kaynak[i];
    if (c === '{') derinlik++;
    if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
  }
  return kaynak.slice(baslangic, i);
}

console.log('\n-- KOD KONTROLU: yardımcılar tanımlı --');
t('logoDuzReceteBasliklariBul tanımlı', kaynak.includes('function logoDuzReceteBasliklariBul(rows)'));
t('parseLogoDuzReceteSheet tanımlı', kaynak.includes('function parseLogoDuzReceteSheet(rows, kolon)'));
t('renderLogoDuzReceteSecimi tanımlı', kaynak.includes('async function renderLogoDuzReceteSecimi(main, urunler)'));
t('dosya yüklemede TÜM sayfalar taranıyor (wb.SheetNames.forEach)', kaynak.includes('wb.SheetNames.forEach(adi'));
t('eşleşme bulununca mevcut (test edilmiş) renderImportPreview YENİDEN KULLANILIYOR',
  kaynak.includes('renderImportPreview(main, urunler[parseInt(btn.dataset.i)])'));

const src = [
  fonksiyonCikar('bomKolonBul'),
  fonksiyonCikar('parseTRNumber'),
  fonksiyonCikar('logoDuzReceteBasliklariBul'),
  fonksiyonCikar('parseLogoDuzReceteSheet')
].join('\n');
const izole = new Function(src + '\nreturn { bomKolonBul, parseTRNumber, logoDuzReceteBasliklariBul, parseLogoDuzReceteSheet };')();

// GERÇEK dosyadan (Reçete1 sayfası) alınan başlık + örnek satırlar (openpyxl ile doğrulandı)
const baslik = ['Reçete', null, '', 'T', 'Stok Türü', 'Mamul Kodu', 'Paket Kodu', 'Stok Kod', 'Stok Ad', 'Miktar', 'Birim', 'Boy(mm)', 'En(mm)', 'B.En', 'B.Boy', 'm2/m', 'Sil', 'Fire %', 'fireTutar', 'Birim Fiyat', 'Toplam Fiyat', 'Doviz', 'Türü', 'StokRef', 'Top. Nakliye', 'id', 'Birim Kg', 'TL Net Tutar'];
const satirlar = [
  baslik,
  ['+', '', '155944', 'R', 'Yarı Mamul', 'D20.LD100.KPK.LK.DAF', 'D20LD100KPKLK.PK1.DAF', 'YM.D20LDORTKPKML.1.DAF', 'D20 Alt.Dlp YAN TABLA SAG Dafne', '1', 'ADET', '', '', '', '', '', '', '', '0', '85,53', '85,53', 'TL', '', '-10312', '0 ₺', '155944', '0', '86 ₺'],
  ['+', '', '155945', 'R', 'Yarı Mamul', 'D20.LD100.KPK.LK.DAF', 'D20LD100KPKLK.PK1.DAF', 'YM.D20LDORTKPKML.2.DAF', 'D20 Alt.Dlp YAN TABLA SOL Dafne', '1', 'ADET', '', '', '', '', '', '', '', '0', '85,53', '85,53', 'TL', '', '-10309', '0 ₺', '155945', '0', '86 ₺'],
  ['', null, '155946', 'S', 'Hammadde', 'D20.LD100.KPK.LK.DAF', 'D20LD100KPKLK.PK1.DAF', '51.003.01.001.00', 'MİNİFİX GÖVDESİ 18MM İÇİN ÇİNKO', '10', 'ADET', '', '', '', '', '', '', '', '0', '', '0', 'TL', '', '', '0 ₺', '155946', '0', '0 ₺'],
  ['', null, '155951', 'S', 'Tüketim Malı', 'D20.LD100.KPK.LK.DAF', 'D20LD100KPKLK.PK1.DAF', '70.02.01.002.01', 'ETİKET RİBONLU KUŞE 100*75', '2', 'ADET', '', '', '', '', '', '', '', '0', '', '0', 'TL', '', '', '0 ₺', '155951', '0', '0 ₺'],
  ['+', '', '155937', 'R', 'Yarı Mamul', 'D20.LD100.KPK.LK.DAF', 'D20LD100KPKLK.PK1.DAF', '55.01.331.00', 'MK-331 D10 KOLİ Lavabo Dlb. 100cm İki Çek-İki Kpk.', '1', 'ADET', '', '', '', '', '', '', '', '0', '', '0', 'TL', '', '', '0 ₺', '155937', '0', '0 ₺']
];

console.log('\n-- BAŞLIK ALGILAMA (logoDuzReceteBasliklariBul) --');
const kolon = izole.logoDuzReceteBasliklariBul(satirlar);
t('başlık satırından tüm zorunlu sütunlar bulundu (null DEĞİL)', !!kolon);
t('Mamul Kodu sütunu doğru index (5)', kolon.iMamulKodu === 5);
t('Stok Türü sütunu doğru index (4)', kolon.iStokTuru === 4);
t('Stok Kod sütunu doğru index (7)', kolon.iStokKod === 7);
t('Stok Ad sütunu doğru index (8)', kolon.iStokAd === 8);
t('Miktar sütunu doğru index (9)', kolon.iMiktar === 9);
t('Birim sütunu doğru index (10)', kolon.iBirim === 10);
t('Boy(mm) sütunu doğru index (11) — En ile KARIŞTIRILMAMIŞ', kolon.iBoy === 11);
t('En(mm) sütunu doğru index (12) — Boy ile KARIŞTIRILMAMIŞ', kolon.iEn === 12);
t('Birim Fiyat sütunu doğru index (19)', kolon.iBirimFiyat === 19);
t('Doviz sütunu doğru index (21)', kolon.iDoviz === 21);

console.log('\n-- UYUMSUZ (eski hiyerarşik/SW BOM) FORMATTA null DÖNER --');
t('LevelNo/PathKod başlıklı eski hiyerarşik format bu formatla ALGILANMIYOR (çakışma yok)',
  izole.logoDuzReceteBasliklariBul([['LevelNo', 'PathKod', 'LineType', '', 'StokKod']]) === null);
t('boş satır dizisi çökmeden null döner', izole.logoDuzReceteBasliklariBul([]) === null);

console.log('\n-- AYRIŞTIRMA (parseLogoDuzReceteSheet) --');
const sonuc = izole.parseLogoDuzReceteSheet(satirlar, kolon);
t('tek Mamul Kodu -> tek ürün grubu döner', sonuc.length === 1);
const urun = sonuc[0];
t('rootKod doğru mamul koduna eşit', urun.rootKod === 'D20.LD100.KPK.LK.DAF');
t('rootAd varsayılan olarak kod (çağıran taraf mevcut kartı bulursa üzerine yazar)', urun.rootAd === 'D20.LD100.KPK.LK.DAF');
t('5 benzersiz alt kalem (3 YM + 1 hammadde + 1 tüketim malı) gruplanmış', urun.items.length === 5);
t('Yarı Mamul satırları doğru ayrıldı (3 adet: SAG/SOL tabla + KOLİ)', urun.yarimamuller.length === 3);
t('Hammadde+Tüketim Malı satırları doğru ayrıldı (2 adet)', urun.hammaddeler.length === 2);
t('MİNİFİX GÖVDESİ hammadde listesinde, miktar doğru (10)',
  urun.hammaddeler.some(h => h.stokKod === '51.003.01.001.00' && h.miktar === 10));
t('Tüketim Malı da hammadde kovasına düşüyor (Stok Türü != Yarı Mamul)',
  urun.hammaddeler.some(h => h.stokKod === '70.02.01.002.01'));
t('"MK-331 KOLİ" satırı Stok Türü=Yarı Mamul olduğu için yarımamül kovasında (kullanıcı önizlemede Paket\'e çevirebilir)',
  urun.yarimamuller.some(y => y.stokKod === '55.01.331.00'));
t('"PKT"/"paket" geçmeyen yarı mamül kodları onerilenTip=yarimamul', urun.yarimamuller.find(y => y.stokKod === 'YM.D20LDORTKPKML.1.DAF').onerilenTip === 'yarimamul');
t('receteKalemleri SADECE mamul kodu için bir girdi içeriyor (yarı mamüllerin KENDİ alt kırılımı UYDURULMUYOR)',
  urun.receteKalemleri.size === 1 && urun.receteKalemleri.has('D20.LD100.KPK.LK.DAF'));
t('level0 (ürünün doğrudan reçete kalemleri) = grup kalemlerinin tamamı (5)', urun.level0.length === 5);
t('her kalemde miktar sayısal (string DEĞİL, parseTRNumber ile çevrilmiş)',
  urun.items.every(i => typeof i.miktar === 'number'));

console.log('\n-- ÇOK ÜRÜNLÜ SAYFA (birden fazla Mamul Kodu AYNI sayfada) --');
const cokUrunluSatirlar = [
  baslik,
  ['+', '', '1', 'R', 'Yarı Mamul', 'URN-A', 'PK-A', 'YM-A1', 'A Parçası 1', '1', 'ADET', '', '', '', '', '', '', '', '0', '0', '0', 'TL', '', '', '0 ₺', '1', '0', '0 ₺'],
  ['', null, '2', 'S', 'Hammadde', 'URN-A', 'PK-A', 'HM-A1', 'A Hammaddesi', '3', 'ADET', '', '', '', '', '', '', '', '0', '0', '0', 'TL', '', '', '0 ₺', '2', '0', '0 ₺'],
  ['+', '', '3', 'R', 'Yarı Mamul', 'URN-B', 'PK-B', 'YM-B1', 'B Parçası 1', '2', 'ADET', '', '', '', '', '', '', '', '0', '0', '0', 'TL', '', '', '0 ₺', '3', '0', '0 ₺']
];
const cokUrunluKolon = izole.logoDuzReceteBasliklariBul(cokUrunluSatirlar);
const cokUrunluSonuc = izole.parseLogoDuzReceteSheet(cokUrunluSatirlar, cokUrunluKolon);
t('2 farklı Mamul Kodu -> 2 ayrı ürün grubu döner (AYNI sayfada bile)', cokUrunluSonuc.length === 2);
t('URN-A grubunda doğru kalemler var', cokUrunluSonuc.find(u => u.rootKod === 'URN-A').items.length === 2);
t('URN-B grubunda doğru kalemler var', cokUrunluSonuc.find(u => u.rootKod === 'URN-B').items.length === 1);

console.log('\n-- UÇ DURUMLAR --');
t('Stok Kod kendi Mamul Kodu ile aynıysa (kendine referans) atlanır, çökmez', (() => {
  const satir = [baslik, ['+', '', '1', 'R', 'Yarı Mamul', 'URN-X', 'PK-X', 'URN-X', 'Kendine Referans', '1', 'ADET', '', '', '', '', '', '', '', '0', '0', '0', 'TL', '', '', '0 ₺', '1', '0', '0 ₺']];
  const k = izole.logoDuzReceteBasliklariBul(satir);
  const s = izole.parseLogoDuzReceteSheet(satir, k);
  return s.length === 0;
})());
t('boş veri satırları (sadece başlık) boş dizi döner, çökmez', izole.parseLogoDuzReceteSheet([baslik], kolon).length === 0);

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
