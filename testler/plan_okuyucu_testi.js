// Mimari plan PDF mahal cikarim motoru — GERCEK dosya ile
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
const src=fs.readFileSync(path.join(KOK,'plan_okuyucu.js'),'utf8');

console.log('\n-- KOD KONTROLLERI --');
t('renk 0-255 ve nesne bicimi destekli', /n <= 1\.0001 \? Math\.round\(n \* 255\) : Math\.round\(n\)/.test(src));
t('sinir kutusu arg\\[2\\] den okunuyor', /const sk = arg\[2\]/.test(src));
t('gri tonlar eleniyor (duvar/golge)', /griTonuMu/.test(src) && /duvar, gölge, tarama/.test(src));
t('lejantta gri kareler haric', /const renkli = kareler\.filter\(k => !griTonuMu/.test(src));
t('kare esigi olcekten bagimsiz', /enBuyuk \* 0\.002/.test(src));
t('ust uste binen parcalar tekillestiriliyor', /gorulen\.has\(yer\)/.test(src));
t('lejant sirasi korunuyor (y ters)', /sort\(\(a, b\) => b\.y - a\.y\)/.test(src));
t('PDF.js yerel dosyadan (CDN bagimliligi yok)', /s\.src = 'pdf\.min\.js'/.test(src));
t('kutuphane dosyalari mevcut', fs.existsSync(path.join(KOK,'pdf.min.js')) && fs.existsSync(path.join(KOK,'pdf.worker.min.js')));
t('build minify atliyor (bozulmasin)', /pdf\.min\.js', 'pdf\.worker\.min\.js/.test(fs.readFileSync(path.join(KOK,'build.js'),'utf8')));


console.log('\n-- METIN MODU KOD KONTROLU --');
t('metindenCoz tanimli', /async function metindenCoz/.test(src));
t('otomatik mod secimi var', /async function otomatikCoz/.test(src));
t('olcu kalibi eleniyor', /OLCU_KALIBI/.test(src));
t('uzun not metinleri eleniyor', /s\.split\(\/\\s\+\/\)\.length > 4/.test(src));
t('teknik not sozcukleri eleniyor', /SHALL\|MUST\|REFER/.test(src));
t('antet\/baslik eleniyor', /BASLIK_SOZCUK/.test(src));

// GERCEK PDF testi (pdfjs varsa)
const pdfYol='/mnt/user-data/uploads/NBK-1_10TH_FLOOR_PLAN_REVISION-D_20230209-C-0.pdf';
let pdfjs=null;
try{ pdfjs=require('/tmp/pdfjstest/node_modules/pdfjs-dist/legacy/build/pdf.js'); }catch(e){}
if(!pdfjs || !fs.existsSync(pdfYol)){
  console.log('\n(gercek PDF testi atlandi — ortamda dosya/kutuphane yok)');
  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi'); process.exit(bad?1:0);
}
pdfjs.GlobalWorkerOptions.workerSrc=require.resolve('/tmp/pdfjstest/node_modules/pdfjs-dist/legacy/build/pdf.worker.js');
global.window={pdfjsLib:pdfjs};
global.document={createElement:()=>({getContext:()=>({}),toDataURL:()=>''}),head:{appendChild:()=>{}}};
const PlanOkuyucu=eval(src.replace("if (typeof module !== 'undefined') module.exports = PlanOkuyucu;","")+'; PlanOkuyucu');
(async()=>{
  console.log('\n-- GERCEK MIMARI PLAN (NBK 10. kat) --');
  const buf=fs.readFileSync(pdfYol);
  const r=await PlanOkuyucu.coz({arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length)},1);
  t('sayfa boyutu okundu (2384x1684)', r.genislik===2384 && r.yukseklik===1684);
  t('LEJANT bolgesi bulundu', !!r.lejantBolge);
  t('mahal rengi bulundu (10+)', r.mahaller.length>=10);
  const lej=r.mahaller.filter(m=>m.lejantta);
  t('lejantta eslesen renk 10+', lej.length>=10);
  const vip=r.mahaller.find(m=>m.css==='rgb(246,223,208)');
  t('VIP AREA rengi bulundu', !!vip);
  t('VIP lejant sirasi 1', vip && vip.sira===1);
  t('VIP alan sayisi makul (50-120)', vip && vip.adet>=50 && vip.adet<=120);
  const fin=r.mahaller.find(m=>m.css==='rgb(214,220,255)');
  t('FINANCE TEAM rengi bulundu', !!fin);
  t('HR TEAM rengi bulundu', !!r.mahaller.find(m=>m.css==='rgb(255,255,173)'));
  t('LEGAL TEAM rengi bulundu', !!r.mahaller.find(m=>m.css==='rgb(255,173,173)'));
  t('gri/siyah renk mahal sayilmadi', !r.mahaller.some(m=>/rgb\((\d+),\1,\1\)/.test(m.css)));
  t('tum mahallerin adedi 1+', r.mahaller.every(m=>m.adet>=1));
  t('css rengi gecerli bicimde', r.mahaller.every(m=>/^rgb\(\d+,\d+,\d+\)$/.test(m.css)));
  console.log('\n  Bulunan mahaller:');
  r.mahaller.slice(0,12).forEach(m=>console.log('    '+String(m.sira).padStart(3)+'. '+m.css.padEnd(20)+String(m.adet).padStart(4)+' alan'));

  console.log('\n-- GERCEK PLAN 2: SERA OSB (yazi modu) --');
  const seraYol='/mnt/user-data/uploads/SERA_OSB_YERLEŞİM_PLANI.pdf';
  if (fs.existsSync(seraYol)) {
    const b2=fs.readFileSync(seraYol);
    const oto=await PlanOkuyucu.otomatikCoz({arrayBuffer:async()=>b2.buffer.slice(b2.byteOffset,b2.byteOffset+b2.length)},1);
    t('YAZI modu secildi', oto.mod==='metin');
    const ml=oto.metin.mahaller;
    t('mahal adlari okundu (5+)', ml.length>=5);
    const bul=(a)=>ml.find(m=>m.ad.toLocaleUpperCase('tr')===a);
    t('MUTFAK bulundu', !!bul('MUTFAK'));
    t('KORIDOR bulundu', !!bul('KORİDOR'));
    t('WC bulundu', !!bul('WC'));
    t('WC adedi 2 (planda 2 kez yazili)', bul('WC') && bul('WC').adet===2);
    t('GIRIS bulundu', !!bul('GİRİŞ'));
    t('OLCU yazilari mahal sayilmadi', !ml.some(m=>/^[\d\/]+$/.test(m.ad)));
    t('"135" gibi sayilar YOK', !ml.some(m=>m.ad==='135'||m.ad==='1725'));
    t('"KAT YUKSEKLIGI" basligi elendi', !ml.some(m=>/KAT YÜKSEK/i.test(m.ad)));
    t('proje basligi elendi', !ml.some(m=>/ÇAYCUMA SERA OSB HİZMET/i.test(m.ad)));
    console.log('\n  Okunan mahaller:');
    ml.forEach(m=>console.log('    '+m.ad.padEnd(22)+' x'+m.adet));
  }

  console.log('\n-- MOD SECIMI: renk plani yaziya kanmiyor --');
  const otoNbk=await PlanOkuyucu.otomatikCoz({arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length)},1);
  t('NBK icin RENK modu secildi', otoNbk.mod==='renk');
  t('genel not metinleri mahal sanilmadi',
    !otoNbk.metin || !otoNbk.metin.mahaller.some(m=>/ARCHITECT|VIBRATION|ASSUME/i.test(m.ad)));

  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
})();
