// Kesim optimizasyonu: lineer (testere) yon denemesi + CNC (nesting) karsilastirmasi
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','page_nesting.js'),'utf8');
const al=(ad)=>{const i=src.indexOf('function '+ad+'(');let d=0,j=src.indexOf('{',i);do{if(src[j]==='{')d++;else if(src[j]==='}')d--;j++;}while(d>0);return src.slice(i,j);};
eval(al('packOnePlakaSerit')); eval(al('nestLineerTestere'));
eval(al('packOnePlaka')); eval(al('nestParcalar'));
eval(al('delikKoordDonustur')); eval(al('buildDxf')); eval(al('delikMetniniAyristir'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

// GERCEK SENARYO (ekran goruntusu): 186 adet 398x760, plaka 1830x3660
const PLAKA_EN=1830, PLAKA_BOY=3660, KENAR=0, KERF=0;
const parcalar=[{ad:'SUNTALAM',en:398,boy:760,adet:186,grainKilitli:false}];

console.log('\n-- LINEER TESTERE --');
const lin=nestLineerTestere(PLAKA_EN,PLAKA_BOY,KENAR,KERF,parcalar);
const ilkPlaka=lin.plakalarOut[0].placed.length;
console.log('  plaka basina: '+ilkPlaka+' parca, toplam plaka: '+lin.plakalarOut.length);
t('plaka basina 18 parca (cevirerek) — eskiden 16', ilkPlaka===18);
t('toplam 11 plaka (eskiden 12)', lin.plakalarOut.length===11);
const yerlesen=lin.plakalarOut.reduce((a,p)=>a+p.placed.length,0);
t('186 parcanin tamami yerlesti', yerlesen===186);
t('parcalar cevrilmis isaretli', lin.plakalarOut[0].placed[0].rotated===true);
const kullanim=lin.plakalarOut[0].usedArea/(PLAKA_EN*PLAKA_BOY);
console.log('  ilk plaka kullanim: %'+(kullanim*100).toFixed(1));
t('kullanim %80 uzeri (eskiden %73.5)', kullanim>0.80);

console.log('\n-- CNC NESTING (serbest yerlesim) --');
const cnc=nestParcalar(PLAKA_EN,PLAKA_BOY,KENAR,KERF,parcalar);
console.log('  plaka basina: '+cnc.plakalarOut[0].placed.length+', toplam plaka: '+cnc.plakalarOut.length);
t('CNC en az lineer kadar iyi', cnc.plakalarOut.length<=lin.plakalarOut.length);
t('CNC tum parcalari yerlestirdi', cnc.plakalarOut.reduce((a,p)=>a+p.placed.length,0)===186);

console.log('\n-- GRAIN KILITLI (donduruleMEZ) --');
const kilitli=[{ad:'DESENLI',en:398,boy:760,adet:20,grainKilitli:true}];
const linK=nestLineerTestere(PLAKA_EN,PLAKA_BOY,KENAR,KERF,kilitli);
t('grain kilitliyse cevrilmiyor', linK.plakalarOut[0].placed.every(p=>p.rotated===false));
t('grain kilitli 16 parca/plaka (dogru davranis)', linK.plakalarOut[0].placed.length===16);

console.log('\n-- KARISIK OLCULER --');
const karisik=[{ad:'A',en:600,boy:400,adet:10,grainKilitli:false},{ad:'B',en:300,boy:900,adet:8,grainKilitli:false}];
const linM=nestLineerTestere(PLAKA_EN,PLAKA_BOY,KENAR,KERF,karisik);
t('karisik olculerde tum parcalar yerlesti', linM.plakalarOut.reduce((a,p)=>a+p.placed.length,0)===18);
t('sonsuz donguye girmedi', linM.plakalarOut.length<=5);


console.log('\n-- AYNI YERLESIMLI PLAKALARI ORTAKLAMA --');
// Ekrandaki imza mantiginin aynisi
const imzaCikar=(pl)=>pl.placed.map(p=>`${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.w)},${Math.round(p.h)},${p.rotated?1:0}`).sort().join(';');
const gruplar=[];
lin.plakalarOut.forEach((pl,i)=>{const im=imzaCikar(pl);const m=gruplar.find(g=>g.imza===im);if(m){m.adet++;m.noLar.push(i+1);}else gruplar.push({imza:im,adet:1,noLar:[i+1]});});
console.log('  '+lin.plakalarOut.length+' plaka -> '+gruplar.length+' farkli yerlesim');
t('ayni desenli plakalar tek grupta toplandi', gruplar.length < lin.plakalarOut.length);
t('en buyuk grup coklu plaka iceriyor', Math.max(...gruplar.map(g=>g.adet))>1);
t('grup adetleri toplami plaka sayisina esit', gruplar.reduce((a,g)=>a+g.adet,0)===lin.plakalarOut.length);
const src2=fs.readFileSync(path.join(__dirname,'..','page_nesting.js'),'utf8');
t('ekranda ortaklama var', src2.includes('aynı yerleşim ×'));
t('TUM parcalar ciziliyor (temsilci degil)', /pl\.placed\.forEach\(p => \{[\s\S]{0,200}rects \+=/.test(src2));
t('cevrik parca sayisi gosteriliyor', src2.includes('çevrik ↻'));

console.log('\n-- DELIK/FORM: kullanici istegi "nestinge ... delikleri ve formlari da ekle" --');
{
  // delikMetniniAyristir: manuel hizli girisin ayristirilmasi
  const d1 = delikMetniniAyristir('37,37,8;37,723,8');
  t('2 delik ayristirildi', d1.length === 2);
  t('ilk delik x/y/cap dogru', d1[0].x === 37 && d1[0].y === 37 && d1[0].cap === 8);
  t('bos metin -> bos dizi', delikMetniniAyristir('').length === 0);
  let hataYakalandi = false;
  try { delikMetniniAyristir('abc,37,8'); } catch (e) { hataYakalandi = true; }
  t('gecersiz sayi -> hata firlatiyor (sessizce yutmuyor)', hataYakalandi);
  let hataYakalandi2 = false;
  try { delikMetniniAyristir('37,37,-5'); } catch (e) { hataYakalandi2 = true; }
  t('negatif/sifir cap -> hata firlatiyor', hataYakalandi2);

  // delikKoordDonustur: rotated=false degismez, rotated=true 90 derece donusum
  t('rotated=false -> degismez', JSON.stringify(delikKoordDonustur(37, 50, 800, false)) === JSON.stringify([37, 50]));
  t('rotated=true -> (dy, origW-dx)', JSON.stringify(delikKoordDonustur(37, 50, 800, true)) === JSON.stringify([50, 763]));

  // buildDxf: delik/form gercekten CIRCLE/LWPOLYLINE olarak DELIK/FORM katmaninda cikiyor mu
  const parcalarDelikli = [{
    ad: 'PANEL', en: 400, boy: 800, adet: 1, grainKilitli: true,
    delikler: [{ x: 37, y: 37, cap: 8 }],
    formlar: [{ noktalar: [[100, 100], [150, 100], [150, 150], [100, 150]] }]
  }];
  const plakaTest = { en: 1830, boy: 3660, ad: 'TEST PLAKA' };
  const sonucTest = nestParcalar(plakaTest.en, plakaTest.boy, 0, 0, parcalarDelikli);
  const dxf = buildDxf(sonucTest, plakaTest);
  t('DXF CIRCLE (delik) icin DELIK katmani var', /CIRCLE[\s\S]{0,10}8\r\nDELIK/.test(dxf));
  t('DXF LWPOLYLINE (form) icin FORM katmani var', /8\r\nFORM/.test(dxf));
  t('delik yaricapi doğru yaziliyor (cap 8 -> r 4)', /40\r\n4(\r\n|$)/.test(dxf) || dxf.includes('\r\n40\r\n4\r\n'));

  // Rotasyonlu parcada delik koordinati dogru donusturuluyor mu — nestParcalar'in
  // rotasyon secimine bagli kalmamak icin sonuc dogrudan elle kuruluyor (rotated:true).
  const sonucRotElle = {
    plakalarOut: [{
      usedArea: 0,
      placed: [{
        ad: 'DAR', x: 0, y: 0, w: 100, h: 3000, rotated: true, origW: 3000,
        delikler: [{ x: 10, y: 20, cap: 6 }], formlar: []
      }]
    }],
    kenarBosluk: 0
  };
  const dxfRot = buildDxf(sonucRotElle, { en: 3200, boy: 3200, ad: 'X' });
  // delikKoordDonustur(10,20,3000,true) -> (20, 3000-10) = (20, 2990); px=py=0 -> delik merkezi (20,2990)
  t('donmus parcada delik koordinati 90 derece donusturuluyor', /10\r\n20(\r\n|$)/.test(dxfRot) && /20\r\n2990(\r\n|$)/.test(dxfRot));
}

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
