// Kesim optimizasyonu: lineer (testere) yon denemesi + CNC (nesting) karsilastirmasi
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','page_nesting.js'),'utf8');
const al=(ad)=>{const i=src.indexOf('function '+ad+'(');let d=0,j=src.indexOf('{',i);do{if(src[j]==='{')d++;else if(src[j]==='}')d--;j++;}while(d>0);return src.slice(i,j);};
eval(al('packOnePlakaSerit')); eval(al('nestLineerTestere'));
eval(al('packOnePlaka')); eval(al('nestParcalar'));
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

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
