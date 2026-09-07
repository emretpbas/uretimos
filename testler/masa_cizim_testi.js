// ── MASA / WORKSTATION TEKNİK RESİM ÇİZİM MOTORU — SVG geometri testi ──────
// masa_cizim.js (dolap_cizim.js ile aynı ilke: saf çizim) için hiç test
// yoktu. dolap_render_test.js'teki desende (SVG çıktısından regex ile
// gerçek koordinat/eleman çekilip MasaHesap.hesapla() çıktısıyla
// karşılaştırılır) MasaHesap + MasaCizim birlikte test edilir.
//     node testler/masa_cizim_testi.js
const MasaHesap = require('../masa_hesap.js');
const MasaCizim = require('../masa_cizim.js');

let gecti = 0, kaldi = 0;
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

function tablaSayisi(svg) {
  return (svg.match(/class="mc-tabla"/g) || []).length;
}

console.log('\n\x1b[1mustten(): boş girdide "Geçerli ölçü girin" uyarısı, SVG değil\x1b[0m');
{
  dogru('paneller boşsa uyarı metni döner (SVG rect üretmez)',
    /Geçerli ölçü girin/.test(MasaCizim.ustten(null)) &&
    !/<rect/.test(MasaCizim.ustten(null)));
}

console.log('\n\x1b[1mustten(): 6 kişilik karşılıklı workstation — tabla sayısı ve seçim\x1b[0m');
{
  const h = MasaHesap.hesapla({
    kisiSayisi: 6, dizilim: 'karsilikli',
    tablaBoy: 1600, tablaEn: 700, tablaKalinlik: 30, siraArasiBosluk: 50,
    ayakModeli: 'Iron', ayakYukseklik: 720, traversVar: true
  });
  const svg = MasaCizim.ustten(h, null);
  dogru('6 tabla dikdörtgeni üretildi (ozet.tablaAdedi=6)', tablaSayisi(svg) === 6);
  dogru('gabari genişlik/yükseklik oranı toplamBoy/toplamEn ile tutarlı (4800/1450)', (() => {
    const m = svg.match(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" fill="none" stroke="var\(--border/);
    if (!m) return false;
    const oran = (+m[3]) / (+m[4]);
    return Math.abs(oran - (4800 / 1450)) < 0.05;
  })());
  dogru('ölçü etiketinde toplam boy (4800 mm) yazıyor', /4800 mm/.test(svg));
  dogru('ölçü etiketinde toplam derinlik (1450 mm) yazıyor', /1450 mm/.test(svg));
  dogru('4 ayak konumu için metal sembol üretildi (yerlesim.ayakKonumSayisi=4)',
    (svg.match(/fill="var\(--amber-bg/g) || []).length === 4);

  console.log('\n  -- seçili tabla farklı renkte vurgulanıyor --');
  const svgSecili = MasaCizim.ustten(h, 2);
  dogru('seçili olmayan durumda YEŞİL (secili) renk hiç yok', !/var\(--green-bg/.test(svg));
  dogru('index=2 seçilince YEŞİL (secili) renk bir kez görünüyor', (svgSecili.match(/var\(--green-bg/g) || []).length === 1);
  dogru('seçili tabla data-i="2" ile eşleşiyor', new RegExp('data-i="2"[^>]*fill="var\\(--green-bg').test(svgSecili));
}

console.log('\n\x1b[1mustten(): tek sıra dizilimde ikinci sıra HİÇ çizilmiyor\x1b[0m');
{
  const h = MasaHesap.hesapla({ kisiSayisi: 4, dizilim: 'tek_sira', tablaBoy: 1400, tablaEn: 800 });
  const svg = MasaCizim.ustten(h, null);
  dogru('4 tabla (tek sıra, hepsi bir hizada)', tablaSayisi(svg) === 4);
}

console.log('\n\x1b[1monden(): ayak sayısı, travers ve perde varlığı doğru yansıyor\x1b[0m');
{
  const hTraversli = MasaHesap.hesapla({
    kisiSayisi: 4, dizilim: 'tek_sira', tablaBoy: 1400, tablaEn: 800, traversVar: true
  });
  const svgT = MasaCizim.onden(hTraversli);
  dogru('travers var olduğunda TRAVERS etiketi çiziliyor', /TRAVERS/.test(svgT));
  dogru('ayak konum sayısı + travers kadar amber rect üretildi (5 ayak + 1 travers)',
    (svgT.match(/fill="var\(--amber-bg/g) || []).length === hTraversli.yerlesim.ayakKonumSayisi + 1);

  const hTraversiz = MasaHesap.hesapla({ kisiSayisi: 4, dizilim: 'tek_sira', tablaBoy: 1400, tablaEn: 800, traversVar: false });
  const svgTsiz = MasaCizim.onden(hTraversiz);
  dogru('travers yokken TRAVERS etiketi HİÇ çizilmiyor', !/TRAVERS/.test(svgTsiz));

  const hPerdeli = MasaHesap.hesapla({ kisiSayisi: 1, dizilim: 'tek_sira', tablaBoy: 1400, tablaEn: 800, perdeVar: true, perdeYukseklik: 350 });
  const svgP = MasaCizim.onden(hPerdeli);
  dogru('perde varken PERDE etiketi çiziliyor', /PERDE/.test(svgP));

  const svgBos = MasaCizim.onden(null);
  dogru('boş girdide onden() de SVG rect üretmez', !/<rect/.test(svgBos));
}

console.log('\n\x1b[1mucBoyut(): 3B perspektif temel elemanları üretiyor\x1b[0m');
{
  const h = MasaHesap.hesapla({ kisiSayisi: 2, dizilim: 'tek_sira', tablaBoy: 1600, tablaEn: 700 });
  const svg = MasaCizim.ucBoyut(h);
  dogru('SVG üretiliyor (viewBox var)', /viewBox="0 0 340 300"/.test(svg));
  dogru('3B PERSPEKTİF başlığı var', /3B PERSPEKTİF/.test(svg));
  dogru('tabla üst yüzü (path) çizildi', /<path[^>]*fill="var\(--blue-bg/.test(svg));
  const svgBos = MasaCizim.ucBoyut(null);
  dogru('boş girdide ucBoyut() de SVG path/rect üretmez', !/<(rect|path)/.test(svgBos));
}

console.log('\n' + '─'.repeat(60));
const renk = kaldi ? '\x1b[31m' : '\x1b[32m';
console.log(renk + (kaldi ? '✗' : '✓') + ' ' + gecti + ' geçti, ' + kaldi + ' kaldı\x1b[0m\n');
process.exit(kaldi ? 1 : 0);
