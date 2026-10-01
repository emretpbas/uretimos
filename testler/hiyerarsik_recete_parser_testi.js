// ── Hiyerarşik Reçete Parser — gerçek "master reçete" dosyasıyla doğrulama ──
// GERÇEK İHTİYAÇ: "Reçete Yapım Raporu" (bkz. recete_yapim_raporu_motoru.js)
// kullanıcının yüklediği TEK bir Dafne reçetesinden (D20.LD080.KPK.LK.DAF)
// TÜM alt kırılımdaki gerçek yarı mamül kodlarını çıkarıp, ÜretimOS'taki
// kardeş (diğer renklerdeki) yarı mamül kartlarına yayabilmeli. Bu, parser'ın
// LOGO'nun kendi iç hiyerarşi tuhaflıklarını (ör. boya kaleminin LOGO'da
// KENDİ astar/tiner alt reçetesi olması, paket/koli kodlarının da "ebeveyn"
// görünmesi) DOĞRU ayırt etmesine dayanıyor — bu testler GERÇEK dosyadan
// (openpyxl ile doğrulandı, tahmin edilmedi) alınan satırlarla bunu kanıtlar.

const HiyerarsikReceteParser = require('../hiyerarsik_recete_parser.js');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

// GERÇEK dosyadan (D20.LD080.KPK.LK.DAF.xlsx) alınan başlık + temsili satırlar.
// Tam 84 satırın tamamı yerine, parser'ın her özelliğini kanıtlayan bir alt
// küme kullanılıyor: kök ürün + paket/koli + gerçek yarı mamül parçalar +
// LOGO'nun kendi iç boya alt reçetesi (bu YANLIŞLIKLA yarı mamül sayılmamalı
// — gerçek ayrımı Store.yarimamuller ile çapraz kontrol eden rapor motoru
// yapar, parser sadece ham veriyi çıkarır).
const baslik = ['LevelNo', 'PathKod', 'LineType', 'AltReceteid', 'StokKod', 'StokAdDetay', 'StokAd', 'Miktar', 'MiktarBirim', 'BirimFiyat', 'ToplamFiyat', 'DovizKod'];
const satirlar = [
  baslik,
  ['0', 'D20.LD080.KPK.LK.DAF', 'R', '12277', 'D20LD080KPKLK.Pk1.DAF', '> D20 80cm.KPK.Lav.Dolabı.Pkt.1.Dafne', 'D20 80cm.KPK.Lav.Dolabı.Pkt.1.Dafne', '1,000', 'ADET', '1.409,735', '1.409,735', 'TL'],
  ['1', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF', 'R', '975', '55.01.330.00', '    > MK-330 D10 80 İKİ ÇEKMECELİ/KAPAKLI ALT DOLAP KOLİ', 'MK-330 D10 80 İKİ ÇEKMECELİ/KAPAKLI ALT DOLAP KOLİ', '1,000', 'ADET', '90,104', '90,104', 'TL'],
  ['1', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF', 'R', '11056', 'YM.D20LD080KPKML.3.DAF', '    > D20 80cm.Lav.Dlp ALT TABLA MELAMİN Dafne', 'D20 80cm.Lav.Dlp ALT TABLA MELAMİN Dafne', '1,000', 'ADET', '108,260', '108,260', 'TL'],
  ['1', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF', 'R', '11062', 'YM.D20LD080KPKLK.8.LKDF', '    > D20 80cm.KPK.Lav.Dlp D20 80 KPK SOL LK Daf', 'D20 80cm.KPK.Lav.Dlp D20 80 KPK SOL LK Daf', '1,000', 'ADET', '173,794', '173,794', 'TL'],
  ['1', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF', 'S', '', '51.003.01.001.00', '    • MİNİFİX GÖVDESİ 18MM İÇİN ÇİNKO', 'MİNİFİX GÖVDESİ 18MM İÇİN ÇİNKO', '10,000', 'ADET', '1,651', '16,509', 'TL'],
  ['2', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF > YM.D20LD080KPKLK.8.LKDF', 'R', '104', 'LK.50.025.01.015.00', '        > PÜ SONKAT MAT DAFNE/LATTE RAL1019 12 KG(2+1) BETEK', 'PÜ SONKAT MAT DAFNE/LATTE RAL1019 12 KG(2+1) BETEK', '0,160', 'ADET', '255,115', '12,385', 'TL'],
  ['2', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF > YM.D20LD080KPKLK.8.LKDF', 'S', '', '50.001.118.06.001.00', '        • MDFLAM TY 18MM BEYAZ H.GLOSS-JELATİNLİ 210*280', 'MDFLAM TY 18MM BEYAZ H.GLOSS-JELATİNLİ 210*280', '1,000', 'ADET', '', '', 'TL'],
  ['2', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF > YM.D20LD080KPKML.3.DAF', 'S', '', '50.002.218.02.041.00', '        • SUNTALAM ÇY 18MM DAFNE D161 NTR 210X280', 'SUNTALAM ÇY 18MM DAFNE D161 NTR 210X280', '1,000', 'ADET', '', '', 'TL'],
  ['2', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF > YM.D20LD080KPKML.3.DAF', 'S', '', '50.010.01.050.00', '        • KENAR BANT PVC 17617 DAFNE 0,40*22 TECE', 'KENAR BANT PVC 17617 DAFNE 0,40*22 TECE', '2,000', 'ADET', '', '', 'TL'],
  ['3', 'D20.LD080.KPK.LK.DAF > D20LD080KPKLK.Pk1.DAF > YM.D20LD080KPKLK.8.LKDF > LK.50.025.01.015.00', 'S', '', '50.025.01.100.00', '            • PÜ ASTAR LAKE BEYAZ 15KG NON-CRUCK 292-1002', 'PÜ ASTAR LAKE BEYAZ 15KG NON-CRUCK 292-1002', '0,160', 'ADET', '435,129', '69,620', 'TL']
];

const parsed = HiyerarsikReceteParser.parseExceleReceteRows(satirlar, 'D20.LD080.KPK.LK.DAF.xlsx');

console.log('\n-- Temel ayrıştırma --');
t('rootKod doğru çıkarıldı (level=0 satırının path son parçası)', parsed.rootKod === 'D20.LD080.KPK.LK.DAF');
t('toplam 10 veri satırı okundu (başlık hariç)', parsed.items.length === 10);
t('Türkçe ondalık miktar doğru çevrildi (10,000 -> 10)', parsed.items.find(i => i.stokKod === '51.003.01.001.00').miktar === 10);
t('binlik ayraçlı fiyat doğru çevrildi (1.409,735 -> 1409.735)', parsed.items.find(i => i.stokKod === 'D20LD080KPKLK.Pk1.DAF').birimFiyat === 1409.735);

console.log('\n-- "Ebeveyn" (parent) sınıflandırması — LOGO\'nun İÇ hiyerarşi tuhaflıkları dahil --');
t('gerçek yarı mamül (YM.D20LD080KPKML.3.DAF) parent/yarimamul olarak işaretli',
  parsed.yarimamuller.some(y => y.stokKod === 'YM.D20LD080KPKML.3.DAF'));
t('LK.50.025.01.015.00 (boya) LOGO\'da KENDİ astar/tiner alt reçetesi olduğu için ebeveyn/yarimamul görünür (BEKLENEN — gerçek ayrım rapor motorunda, Store.yarimamuller çapraz kontrolüyle yapılır)',
  parsed.yarimamuller.some(y => y.stokKod === 'LK.50.025.01.015.00'));
t('paket/koli kodu (D20LD080KPKLK.Pk1.DAF) da parent olduğu için yarimamuller listesinde görünür (onerilenTip ile ayırt edilir)',
  parsed.yarimamuller.some(y => y.stokKod === 'D20LD080KPKLK.Pk1.DAF'));
t('gerçek leaf hammaddeler (MİNİFİX, MDFLAM, SUNTALAM, KENAR BANT, PÜ ASTAR) hammaddeler listesinde',
  ['51.003.01.001.00', '50.001.118.06.001.00', '50.002.218.02.041.00', '50.010.01.050.00', '50.025.01.100.00']
    .every(kod => parsed.hammaddeler.some(h => h.stokKod === kod)));

console.log('\n-- İÇ İÇE (nested) alt reçeteler — receteKalemleri TÜM seviyelerde ayrı ayrı tutuluyor --');
t('kök reçetenin DOĞRUDAN kalemleri (level0) doğru (1 adet: üst paket)', parsed.level0.length === 1 && parsed.level0[0].stokKod === 'D20LD080KPKLK.Pk1.DAF');
t('üst paketin KENDİ alt kalemleri receteKalemleri\'nde ayrı tutuluyor (4 adet: koli+2 yarımamül+1 hammadde)',
  (parsed.receteKalemleri.get('D20LD080KPKLK.Pk1.DAF') || []).length === 4);
t('bir KAPAK yarı mamülünün (YM.D20LD080KPKLK.8.LKDF) KENDİ alt reçetesi (boya+MDF) AYRI bulunuyor — iç içe yapı kayıp değil',
  (parsed.receteKalemleri.get('YM.D20LD080KPKLK.8.LKDF') || []).length === 2);
t('bir SUNTA yarı mamülünün (YM.D20LD080KPKML.3.DAF) KENDİ alt reçetesi (sunta+kenar bandı) AYRI bulunuyor',
  (parsed.receteKalemleri.get('YM.D20LD080KPKML.3.DAF') || []).length === 2);
t('3. SEVİYEDEKİ (LOGO\'nun kendi boya iç reçetesi) kalemler bile kayıp değil',
  (parsed.receteKalemleri.get('LK.50.025.01.015.00') || []).length === 1);

console.log('\n-- UÇ DURUMLAR --');
t('boş satır dizisi çökmeden boş sonuç döner', HiyerarsikReceteParser.parseExceleReceteRows([], 'x.xlsx').items.length === 0);
t('sadece başlık satırı çökmeden boş sonuç döner', HiyerarsikReceteParser.parseExceleReceteRows([baslik], 'x.xlsx').items.length === 0);

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
