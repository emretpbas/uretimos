// Mimari kesif: detaylarin mahallere atanmasi — GERCEK okul planlari
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(KOK,'plan_okuyucu.js'),'utf8');
const tx=fs.readFileSync(path.join(KOK,'teklif_excel.js'),'utf8');
const pt=fs.readFileSync(path.join(KOK,'page_proje_teklif.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- KOD KONTROLU --');
t('kesifCikar tanimli', /async function kesifCikar/.test(src));
t('13 detay sinifi tanimli', (src.match(/\{ ad: '[^']+', kalip:/g)||[]).length>=13);
t('kapi kalibi: etiketli (LK1 110/220)', /LK\|SK\|YDK\|ALCK\|KP/.test(src));
t('kapi kalibi: sade olcu (90/200) da taniniyor', /\^\(6\\d\|\[7-9\]\\d\|1\[0-6\]\\d\)/.test(src));
t('duvar koruma bandi', /duvar koruma band/i.test(src));
t('kupeste\\/korkuluk', /küpeşte\|korkuluk/.test(src));
t('lavabo\\/tezgah\\/banko', /lavabo\|tezgah\|banko/.test(src));
t('en yakin mahale atama', /Math\.hypot\(m\.x - nesne\.x/.test(src));
t('uzaklik esigi var (yanlis atama korumasi)', /uzaklik > esik/.test(src));
t('m2 bilgisi mahale atanıyor', /ALAN_KALIBI/.test(src));
t('ayni adli mahaller birlestiriliyor', /Aynı adlı mahalleri BİRLEŞTİR/.test(src));
t('mahal olmayan etiketler eleniyor', /MAHAL_DEGIL/.test(src));
t('sinir kullaniciya bildiriliyor', /mekânsal bir tahmindir/.test(src));

console.log('\n-- YONETIM ICMALI (firma formatina gore) --');
t('icmal uretimi var', /function icmalUret/.test(tx));
t('Iscilik (Sa) sutunu', /'İşçilik \(Sa\)'/.test(tx));
t('Satinalma sutunu', /'Satınalma \(₺\)'/.test(tx));
t('Standart Maliyet sutunu', /'Standart Maliyet \(₺\)'/.test(tx));
t('GYG sutunu', /GYG \(%/.test(tx));
t('Nakliye\\/Montaj sutunu', /'Nakliye\/Montaj \(₺\)'/.test(tx));
t('Kar ve Net Fiyat sutunu', /'Kâr \(₺\)', 'Net Fiyat \(₺\)'/.test(tx));
t('eksik maliyet uyarisi', /Gerçek kâr gösterilenden DÜŞÜKTÜR/.test(tx));
t('ekranda icmal butonu', /pt-icmal/.test(pt));

console.log('\n-- EKRAN --');
t('kesif modu once deneniyor', /kesif\.mahaller\.length >= 2 && kesif\.toplamDetay >= 5/.test(pt));
t('mahal adi duzenlenebilir', /class="finput mp-ad"/.test(pt));
t('mahal ADEDI duzenlenebilir', /class="finput mp-adet"/.test(pt));
t('detay miktari duzenlenebilir', /class="finput mp-d-adet"/.test(pt));
t('detaylar tek tek secilebilir', /class="mp-d-sec"/.test(pt));
t('kullaniciya kontrol uyarisi', /Bitişik\s*\n?\s*mahaller arasındaki/.test(pt) || /Kontrol edin/.test(pt));

// GERCEK PLAN TESTI
let pdfjs=null;
try{ pdfjs=require('/tmp/pdfjstest/node_modules/pdfjs-dist/legacy/build/pdf.js'); }catch(e){}
const planlar=['1__kat','Zemin_kat','2__kat'].map(k=>`/mnt/user-data/uploads/Esin_Olcay_Anadolu_Lisesi_${k}.pdf`);
if(!pdfjs || !fs.existsSync(planlar[0])){
  console.log('\n(gercek plan testi atlandi)');
  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi'); process.exit(bad?1:0);
}
pdfjs.GlobalWorkerOptions.workerSrc=require.resolve('/tmp/pdfjstest/node_modules/pdfjs-dist/legacy/build/pdf.worker.js');
global.window={pdfjsLib:pdfjs};
global.document={createElement:()=>({getContext:()=>({}),toDataURL:()=>''}),head:{appendChild:()=>{}}};
const P=eval(src.replace("if (typeof module !== 'undefined') module.exports = PlanOkuyucu;","")+'; PlanOkuyucu');
const dosya=(y)=>{const b=fs.readFileSync(y);return {arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)};};
(async()=>{
  console.log('\n-- GERCEK PLAN: 1. KAT --');
  const r=await P.kesifCikar(dosya(planlar[0]),1);
  t('mahal cikarildi (10+)', r.mahaller.length>=10);
  t('detay siniflandirildi (100+)', r.toplamDetay>=100);
  const d=r.mahaller.find(m=>m.ad==='DERSLİK');
  t('DERSLIK bulundu', !!d);
  t('DERSLIK 10 adet', d && d.adet===10);
  t('DERSLIK 55 m2/adet', d && d.birimM2===55);
  t('DERSLIK toplam 550 m2', d && d.toplamM2===550);
  const kal=(x)=>d.detaylar.find(y=>y.sinif===x);
  t('DERSLIGE kapi atandi', !!kal('Kapı'));
  t('DERSLIGE duvar koruma bandi atandi', !!kal('Duvar koruma bandı'));
  t('DERSLIGE doseme kaplamasi atandi', !!kal('Döşeme kaplaması'));
  t('DERSLIGE askilik atandi', !!kal('Askılık'));
  const kor=r.mahaller.find(m=>m.ad==='KORİDOR');
  t('KORIDOR bulundu', !!kor);
  t('KORIDORA kupeste atandi', kor && kor.detaylar.some(x=>x.sinif==='Küpeşte / korkuluk'));
  const wc=r.mahaller.find(m=>/WC/.test(m.ad));
  t('WC bulundu', !!wc);
  t('WC ye lavabo\\/tezgah atandi', wc && wc.detaylar.some(x=>x.sinif.includes('Lavabo')));
  t('atanmayan detay az (<%20)', r.atanmayanDetay < r.toplamDetay*0.2);
  t('malzeme yazilari mahal sayilmadi', !r.mahaller.some(m=>/KİREMİT|KAPLAMA/.test(m.ad)));

  console.log('\n-- TUM KATLAR --');
  for(let i=0;i<3;i++){
    const rr=await P.kesifCikar(dosya(planlar[i]),1);
    const ad=['1.kat','Zemin','2.kat'][i];
    console.log(`  ${ad}: ${rr.mahaller.length} mahal, ${rr.toplamDetay} detay, ${rr.atanmayanDetay} atanmayan`);
    t(ad+' mahal cikardi', rr.mahaller.length>=8);
    t(ad+' detay atadi', rr.toplamDetay>0 && rr.atanmayanDetay<rr.toplamDetay*0.3);
  }

  console.log('\n  1. kat kesif ozeti:');
  r.mahaller.slice(0,5).forEach(m=>{
    console.log(`    ${m.ad} ×${m.adet}${m.birimM2?' ('+m.birimM2+' m²)':''}`);
    m.detaylar.slice(0,4).forEach(x=>console.log(`       • ${x.sinif} ${x.adet} ${x.birim}`));
  });
  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
})();
