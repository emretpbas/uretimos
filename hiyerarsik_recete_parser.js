// ════════════════════════════════════════════════════════════════════════════
// HİYERARŞİK REÇETE/BOM PARSER (LevelNo/PathKod/LineType/StokKod sütunlu) —
// page_kartlar.js'in Excel içe aktarma özelliğiyle PAYLAŞILAN, saf (DOM/
// Store'suz) ayrıştırma mantığı. Ayrıca "Reçete Yapım Raporu" (bkz.
// recete_yapim_raporu_motoru.js) bu parser'ı, kullanıcının yüklediği TEK bir
// "master" reçeteden TÜM alt kırılımdaki (iç içe yarı mamüllerin KENDİ alt
// reçeteleri dahil) gerçek yarı mamül kodlarını çıkarmak için kullanır.
//
// GERÇEK DOSYAYLA DOĞRULANDI (D20.LD080.KPK.LK.DAF.xlsx): LOGO'nun bu
// formatı R(reçeteli/ebeveyn) ve S(sarfiyat/yaprak) satırlarıyla, PathKod
// sütununda ">" ile ayrılmış TAM hiyerarşiyi taşır — iç içe yarı mamüllerin
// (ör. bir kapak parçasının kendi boya+MDF alt reçetesi) KENDİ alt
// kırılımları da receteKalemleri Map'inde (parentStokKod -> çocuklar) ayrı
// ayrı bulunur, sadece kök seviye değil.
// ════════════════════════════════════════════════════════════════════════════
function parseTRNumber(str) {
  if (str === '' || str == null) return 0;
  if (typeof str === 'number') return str;
  const cleaned = String(str).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseExceleReceteRows(rows, fileName) {
  if (!rows.length) return { items: [], yarimamuller: [], hammaddeler: [], receteKalemleri: new Map(), rootKod: '', rootAd: '' };
  const dataRows = rows.slice(1).filter(r => r[4] !== '' && r[4] != null);

  const items = dataRows.map(r => ({
    level: String(r[0] ?? ''), path: String(r[1] || ''), type: r[2],
    stokKod: String(r[4]), stokAd: r[6] || r[5] || String(r[4]),
    miktar: parseTRNumber(r[7]) || 1, birim: r[8] || 'ADET',
    birimFiyat: parseTRNumber(r[9]), dvz: (r[11] || 'TL').toString().trim() || 'TL',
    en: parseTRNumber(r[12]), boy: parseTRNumber(r[13])
  }));

  const parentCodes = new Set();
  items.forEach(i => {
    const parts = i.path.split('>').map(s => s.trim()).filter(Boolean);
    if (parts.length) parentCodes.add(parts[parts.length - 1]);
  });

  const byStokKod = new Map();
  items.forEach(i => { if (!byStokKod.has(i.stokKod)) byStokKod.set(i.stokKod, i); });

  const yarimamuller = [];
  const hammaddeler = [];
  byStokKod.forEach((item, stokKod) => {
    if (parentCodes.has(stokKod)) {
      // Paket sezgisel tespiti: stok kodunda "PKT" geçiyorsa VEYA stok
      // adı/açıklamasında "paket" kelimesi geçiyorsa, bu kalem muhtemelen
      // gerçek bir üretim parçası değil, sevkiyat öncesi paketleme/koli
      // sayısını takip etmek için kullanılan SANAL bir karttır. Bu sadece
      // bir ÖNERİDİR — kullanıcı önizleme ekranında her satırın tipini
      // (Yarı Mamül / Alt Montaj / Paket) değiştirebilir.
      const kodUpper = stokKod.toUpperCase();
      const adLower = (item.stokAd || '').toLowerCase();
      item.onerilenTip = (kodUpper.includes('PKT') || adLower.includes('paket')) ? 'paket' : 'yarimamul';
      yarimamuller.push(item);
    } else hammaddeler.push(item);
  });

  const receteKalemleri = new Map(); // parentStokKod -> [{stokKod, miktar, birim, en, boy}]
  items.forEach(i => {
    const parts = i.path.split('>').map(s => s.trim()).filter(Boolean);
    const parent = parts.length ? parts[parts.length - 1] : null;
    if (!parent) return;
    if (!receteKalemleri.has(parent)) receteKalemleri.set(parent, []);
    receteKalemleri.get(parent).push(i);
  });

  // Kök seviye (level=0) kalemlerin path'inin son parçası -> dosyanın temsil ettiği nihai ürün kodu
  const level0 = items.filter(i => i.level === '0');
  const rootParts = level0.length ? level0[0].path.split('>').map(s => s.trim()).filter(Boolean) : [];
  const rootKodRaw = rootParts.length ? rootParts[rootParts.length - 1] : fileName.replace(/\.(xlsx|xls)$/i, '');
  const rootKod = rootKodRaw;
  const rootAd = fileName.replace(/\.(xlsx|xls)$/i, '').replace(/_/g, ' ');

  return { items, yarimamuller, hammaddeler, receteKalemleri, rootKod, rootAd, level0 };
}

const HiyerarsikReceteParser = { parseTRNumber, parseExceleReceteRows };
if (typeof module !== 'undefined' && module.exports) module.exports = HiyerarsikReceteParser;
