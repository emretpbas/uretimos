// ── "Reçete İçe Aktar" — SolidWorks XML sekmesi ─────────────────────────────
// SolidWorks eklentisinin "XML olarak dışa aktar" çıktısı (ReceteAgaciPaneli.cs
// ReceteyiXmlOlarakDisaAktar) Kartlar'a içe aktarılabiliyor. Saf ayrıştırma ve
// bellek içi kayıt adımları (parseSolidworksReceteXml/kartlariUygula/
// receteleriUygula) kaynaktan izole edilip GERÇEK dosyayla (Masaüstü
// den2_recete.xml, eklentiden 2026-09-20'de alınmış) çalıştırılır. Node'da
// DOMParser olmadığından eklentinin ürettiği basit XML için küçük bir taklit
// kullanılır.

const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_kartlar.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

function fonksiyonCikar(ad) {
  const baslangic = kaynak.indexOf('function ' + ad + '(');
  let derinlik = 0, i = kaynak.indexOf('{', baslangic);
  for (; i < kaynak.length; i++) {
    const c = kaynak[i];
    if (c === '{') derinlik++;
    if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
  }
  return kaynak.slice(baslangic, i);
}

// Eklentinin ürettiği XML için yeterli DOMParser taklidi (öznitelik + iç içe eleman)
class TaklitDOMParser {
  parseFromString(metin) {
    const kok = { tagName: '#doc', children: [] };
    const yigin = [kok];
    const coz = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const re = /<\?[^>]*\?>|<!--[\s\S]*?-->|<\/([\w:]+)\s*>|<([\w:]+)((?:\s+[\w:]+="[^"]*")*)\s*(\/?)>/g;
    let m, hata = false;
    while ((m = re.exec(metin))) {
      if (m[1]) { if (yigin.pop().tagName !== m[1]) hata = true; continue; }
      if (!m[2]) continue;
      const oz = {};
      (m[3].match(/[\w:]+="[^"]*"/g) || []).forEach(p => { const i = p.indexOf('='); oz[p.slice(0, i)] = coz(p.slice(i + 2, -1)); });
      const el = { tagName: m[2], children: [], getAttribute: a => (a in oz ? oz[a] : null) };
      yigin[yigin.length - 1].children.push(el);
      if (!m[4]) yigin.push(el);
    }
    if (yigin.length !== 1) hata = true;
    return { documentElement: kok.children[0], getElementsByTagName: ad => (ad === 'parsererror' && hata ? [{}] : []) };
  }
}

let uidSayac = 0;
const App = { uid: on => on + '-T' + (++uidSayac) };
const src = [
  fonksiyonCikar('parseSolidworksReceteXml'),
  fonksiyonCikar('guessHammaddeTip'),
  'const _kodIndeksleri = new WeakMap();',
  fonksiyonCikar('koduBul'),
  fonksiyonCikar('kartlariUygula'),
  fonksiyonCikar('receteleriUygula')
].join('\n');
const izole = new Function('DOMParser', 'App', src + '\nreturn { parseSolidworksReceteXml, guessHammaddeTip, kartlariUygula, receteleriUygula };')(TaklitDOMParser, App);

console.log('\n-- KOD KONTROLU: sekme ve akış --');
t('içe aktarma penceresinde SolidWorks XML sekmesi var', kaynak.includes('data-ei-sekme="xml"') && kaynak.includes('id="ei-xml-file" accept=".xml" multiple'));
t('tek XML -> mevcut renderImportPreview, çok XML -> ortak topluOnizle',
  kaynak.includes('if (dosyalar.length === 1) return renderImportPreview(main, okunan[0].parsed);') &&
  kaynak.includes('topluOnizle(main, okunan, atlanan, dosyalar.length);'));

// GERÇEK dosya (Masaüstü\den2_recete.xml) — BOM dahil, aynen
const DEN2 = '﻿<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n' +
`<Recete kokTip="urun" kokId="URN-mu9jp71bf18e08eb" kokKod="den2" kokAd="deneme 2" disaAktarmaTarihi="2026-09-20T11:25:25">
  <Kalem id="RK-64D95A5DC4" tip="paket" refId="PKT-E912FF21A0" kod="den2-PKT01" ad="deneme 2 - Paket 1" miktar="1" birim="ADET">
    <OlcuAgirlik en="0" boy="0" yukseklik="0" netAgirlik="0" brutAgirlik="0" />
  </Kalem>
  <Kalem id="RK-356F475642" tip="yarimamul" refId="YAR-4AF10F5E" kod="PART1_NEW_2" ad="Part1^New 2" miktar="1" birim="ADET">
    <Olcu netBoy="800" netEn="400" kalinlik="18" kabaBoy="" kabaEn="" />
    <Kalem id="RK-CB63AAF776" tip="hammadde" refId="HM-mso8w900gk98x" kod="50.002.118.01.001.01" ad="SUNTALAM TY 18MM KAR BEYAZ 183*366 YÜZEY:DS" miktar="1" birim="ADET">
      <StokOlcusu en="1830" boy="3660" kalinlik="" />
      <KesimOlcusu netEn="400" netBoy="800" kabaEn="400" kabaBoy="800" panelM2="0.32" />
      <KenarBantlari>
        <On kod="50.010.01.001.06" ad="KENAR BANT PVC BEYAZ 2*22 5778SB EGGER" uzunlukMm="830" />
        <Arka kod="50.010.01.001.00" ad="KENAR BANT PVC BEYAZ 0,40*22 5778SB EGGER" uzunlukMm="830" />
        <Sol kod="50.010.01.001.00" ad="KENAR BANT PVC BEYAZ 0,40*22 5778SB EGGER" uzunlukMm="430" />
        <Sag kod="50.010.01.001.00" ad="KENAR BANT PVC BEYAZ 0,40*22 5778SB EGGER" uzunlukMm="430" />
      </KenarBantlari>
    </Kalem>
  </Kalem>
  <Kalem id="RK-EDD76B2493" tip="yarimamul" refId="YAR-597A9A66" kod="PART2_NEW_2" ad="Part2^New 2" miktar="1" birim="ADET">
    <Olcu netBoy="740" netEn="370" kalinlik="18" kabaBoy="" kabaEn="" />
    <Kalem id="RK-B304E32754" tip="hammadde" refId="HM-mshfxm7cw4ogw" kod="50.001.118.05.004.01" ad="MDFLAM TY 18MM D-143 ANTRASİT JLT.210*280 NTR" miktar="1" birim="ADET">
      <StokOlcusu en="1830" boy="3660" kalinlik="" />
      <KesimOlcusu netEn="370" netBoy="740" kabaEn="370" kabaBoy="740" panelM2="0.2738" />
    </Kalem>
  </Kalem>
</Recete>`;

console.log('\n-- AYRIŞTIRMA: gerçek den2_recete.xml --');
const p = izole.parseSolidworksReceteXml(DEN2, 'den2_recete.xml');
t('kök ürün kodu/adı kokKod/kokAd özniteliklerinden', p.rootKod === 'den2' && p.rootAd === 'deneme 2' && p.kokTip === 'urun');
t('kök seviyede 3 kalem (paket + 2 yarı mamül)', p.level0.map(k => k.stokKod).join(',') === 'den2-PKT01,PART1_NEW_2,PART2_NEW_2');
t('yarı mamül/paket tipleri dosyadan (tahmin değil)',
  p.yarimamuller.map(y => y.stokKod + ':' + y.onerilenTip).join(',') === 'den2-PKT01:paket,PART1_NEW_2:yarimamul,PART2_NEW_2:yarimamul');
t('hammaddeler: 2 plaka + 2 farklı kenar bandı',
  p.hammaddeler.length === 4 &&
  p.hammaddeler.filter(h => h.tip === 'plaka').length === 2 &&
  p.hammaddeler.filter(h => h.tip === 'kenar_bandi').map(h => h.stokKod).sort().join(',') === '50.010.01.001.00,50.010.01.001.06');
const pnl = p.receteKalemleri.get('PART1_NEW_2')[0];
t('plaka kaleminde kesim ölçüsü (olcu) ve en/boy', pnl.en === 400 && pnl.boy === 800 &&
  JSON.stringify(pnl.olcu) === JSON.stringify({ kabaEn: 400, kabaBoy: 800, netEn: 400, netBoy: 800 }));
t('plaka kaleminde ön/arka/sol/sağ kenar bant kodları', JSON.stringify(pnl.kenarBantKodlari) ===
  JSON.stringify({ on: '50.010.01.001.06', arka: '50.010.01.001.00', sol: '50.010.01.001.00', sag: '50.010.01.001.00' }));
t('fiyat yok (null) — mevcut fiyatı ezmesin', p.hammaddeler.every(h => h.birimFiyat === null));
t('paketin alt reçetesi yok', !p.receteKalemleri.has('den2-PKT01'));

console.log('\n-- KAYIT (bellek içi): kartlar + reçeteler --');
const mevcutBant = { id: 'HM-ESKI', tip: 'kenar_bandi', stokKodu: '50.010.01.001.00', ad: 'eski ad', birim: 'M', birimFiyat: 12.5, dvz: 'TL' };
const d = { hammaddeler: [mevcutBant], yarimamuller: [], altMontajlar: [], paketler: [], urunler: [] };
const degisen = new Set();
const hmEslesme = p.hammaddeler.map(h => ({ ...h, tip: h.tip || izole.guessHammaddeTip(h.stokAd, h.birim) }));
const h = izole.kartlariUygula(p, hmEslesme, p.yarimamuller, p.rootKod, p.rootAd, d, degisen);
const receteler = [];
izole.receteleriUygula(p, p.yarimamuller, p.rootKod, p.rootAd, h, receteler);

t('mevcut bandın fiyatı KORUNDU, adı güncellendi', mevcutBant.birimFiyat === 12.5 && mevcutBant.ad === 'KENAR BANT PVC BEYAZ 0,40*22 5778SB EGGER');
const yeniPlaka = d.hammaddeler.find(x => x.stokKodu === '50.002.118.01.001.01');
t('yeni plaka: tip plaka, M2, stok ölçüsü 1830x3660, fiyat 0 TL',
  yeniPlaka && yeniPlaka.tip === 'plaka' && yeniPlaka.birim === 'M2' && yeniPlaka.en === 1830 && yeniPlaka.boy === 3660 && yeniPlaka.birimFiyat === 0 && yeniPlaka.dvz === 'TL');
t('1 paket + 2 yarı mamül + 1 ürün açıldı', d.paketler.length === 1 && d.yarimamuller.length === 2 && d.urunler.length === 1 && d.urunler[0].kod === 'den2');
const ym1 = d.yarimamuller.find(y => y.kod === 'PART1_NEW_2');
t('yarı mamül net ölçüsü ve hammaddesi panelden', ym1.netEn === 400 && ym1.netBoy === 800 && ym1.hammaddeId === yeniPlaka.id);

const kokRecete = receteler.find(r => r.urunId === h.urun.id);
t('ürün reçetesi: paket + 2 yarı mamül', kokRecete && kokRecete.kalemler.map(k => k.tip).join(',') === 'paket,yarimamul,yarimamul');
const altRecete = receteler.find(r => r.yarimamulId === ym1.id);
const pk = altRecete && altRecete.kalemler[0];
t('yarı mamül alt reçetesi: plaka kalemi olcu + kenarBantlari (hammadde id) ile',
  pk && pk.refId === yeniPlaka.id && pk.olcu.netEn === 400 &&
  pk.kenarBantlari.arka === 'HM-ESKI' && pk.kenarBantlari.sol === 'HM-ESKI' &&
  pk.kenarBantlari.on === d.hammaddeler.find(x => x.stokKodu === '50.010.01.001.06').id);

console.log('\n-- KENAR DURUMLAR --');
const ic = izole.parseSolidworksReceteXml(`<Recete kokKod="K1" kokAd="Kök">
  <Kalem tip="altmontaj" kod="AM1" ad="Gövde" miktar="2" birim="ADET">
    <Kalem tip="yarimamul" kod="YM1" ad="Yan" miktar="2" birim="ADET"><Kalem tip="hammadde" kod="VIDA" ad="VİDA 4x30" miktar="8" birim="ADET" /></Kalem>
  </Kalem>
  <Kalem tip="yarimamul" kod="YM1" ad="Yan" miktar="1" birim="ADET"><Kalem tip="hammadde" kod="VIDA" ad="VİDA 4x30" miktar="8" birim="ADET" /></Kalem>
</Recete>`, 'x.xml');
t('iç içe: alt montajın altındaki yarı mamül kendi reçetesiyle', ic.receteKalemleri.get('AM1')[0].stokKod === 'YM1' && ic.receteKalemleri.get('YM1')[0].stokKod === 'VIDA');
t('aynı kart iki yerde: alt reçetesi bir kez (çift kalem yok)', ic.receteKalemleri.get('YM1').length === 1 && ic.yarimamuller.length === 2);
t('ölçüsüz hammaddede tip boş bırakılır (addan tahmin edilecek)', ic.hammaddeler[0].tip === null);
let hataMesaji = '';
try { izole.parseSolidworksReceteXml('<Baska/>', 'y.xml'); } catch (e) { hataMesaji = e.message; }
t('<Recete> olmayan XML anlaşılır hatayla reddediliyor', hataMesaji.includes('<Recete>'));
hataMesaji = '';
try { izole.parseSolidworksReceteXml('<Recete><Kalem kod="A">', 'z.xml'); } catch (e) { hataMesaji = e.message; }
t('bozuk XML reddediliyor', hataMesaji.includes('bozuk'));
const adsiz = izole.parseSolidworksReceteXml('<Recete><Kalem tip="hammadde" kod="A" miktar="1"/></Recete>', 'ABC.12_recete.xml');
t('kokKod yoksa dosya adından (_recete eki atılır)', adsiz.rootKod === 'ABC.12');

console.log(`\nSONUÇ: ${ok} geçti, ${bad} kaldı`);
process.exit(bad ? 1 : 0);
