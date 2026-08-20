// Montaj kilavuzu: sira, BOM, baglanti elemani ayrimi
global.window={};
const S=require('../step_okuyucu.js');
const M=require('../montaj_kilavuzu.js');
const fs=require('fs'),path=require('path');
const mk=fs.readFileSync(path.join(__dirname,'..','montaj_kilavuzu.js'),'utf8');
const st=fs.readFileSync(path.join(__dirname,'..','page_step_ice_aktar.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

const bas='ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'X\'));\nENDSEC;\nDATA;\n', son='\nENDSEC;\nEND-ISO-10303-21;';
const u=(id,ad)=>`#${id}=PRODUCT('${ad}','${ad}','',(#2));\n#${id+1}=PRODUCT_DEFINITION_FORMATION('','',#${id});\n#${id+2}=PRODUCT_DEFINITION('design','',#${id+1},#3);\n`;
const n=(id,e,c)=>`#${id}=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#${e+2},#${c+2},$);\n`;
let s=bas+u(1,'DOLAP-80')+u(10,'CEKMECE')+u(20,'CEKMECE YAN')+u(30,'CEKMECE TABAN')+u(40,'GOVDE YAN')+u(50,'M6 VIDA')+u(60,'MINIFIX')
 +n(300,1,10)+n(301,1,10)+n(310,10,20)+n(311,10,20)+n(320,10,30)+n(330,1,40)+n(331,1,40);
for(let i=0;i<8;i++) s+=n(400+i,1,50);
for(let i=0;i<4;i++) s+=n(500+i,1,60);
s+=son;
const r=S.oku(s);
const k=M.uret(r,{urunAdi:'Dolap 80',urunKodu:'D80'});

console.log('\n-- BAGLANTI ELEMANI AYRIMI --');
t('vida baglanti sayiliyor', M.baglantiMi('M6 VIDA')===true);
t('somun baglanti', M.baglantiMi('M8 Somun')===true);
t('minifix baglanti', M.baglantiMi('MINIFIX')===true);
t('dubel baglanti', M.baglantiMi('Dübel 8mm')===true);
t('screw/bolt/nut (ingilizce)', M.baglantiMi('Hex Bolt M6')&&M.baglantiMi('washer')&&M.baglantiMi('nut'));
t('panel baglanti DEGIL', M.baglantiMi('YAN PANEL')===false);
t('raf baglanti DEGIL', M.baglantiMi('Raf 500x300')===false);

console.log('\n-- AD TEMIZLEME --');
t('CAD ornek numarasi atiliyor', M.adiTemizle('YAN PANEL-12')==='YAN PANEL');
t('dosya uzantisi atiliyor', M.adiTemizle('govde.sldprt')==='govde');
t('normal ad korunuyor', M.adiTemizle('Çekmece Yanı')==='Çekmece Yanı');
t('bos ad guvenli', M.adiTemizle('')==='Adsız parça');

console.log('\n-- MONTAJ SIRASI --');
t('2 adim uretildi', k.adimlar.length===2);
t('ALT MONTAJ ONCE geliyor', k.adimlar[0].hedef==='CEKMECE' && !k.adimlar[0].anaMontajMi);
t('ANA MONTAJ EN SON', k.adimlar[1].anaMontajMi===true);
t('cekmece adiminda 2 yan + 1 taban', k.adimlar[0].parcalar.length===2);
t('ana montajda cekmece alt montaj isaretli',
  k.adimlar[1].parcalar.find(p=>p.ad==='CEKMECE').altMontajMi===true);
t('vidalar AYRI bolumde (parca degil)',
  !k.adimlar[1].parcalar.some(p=>/VIDA/.test(p.ad)) &&
  k.adimlar[1].baglantilar.some(b=>/VIDA/.test(b.ad)));
t('minifix de baglantida', k.adimlar[1].baglantilar.some(b=>/MINIFIX/.test(b.ad)));
t('adim numaralari sirali', k.adimlar.every((a,i)=>a.no===i+1));

console.log('\n-- PARCA LISTESI (BOM) --');
t('6 parca tipi', k.bom.length===6);
t('balon numarasi verildi', k.bom.every(b=>b.balon>0));
t('CEKMECE YAN toplam 4 (2 cekmece x2)', k.bom.find(b=>b.ad==='CEKMECE YAN').adet===4);
t('vida 8 adet', k.bom.find(b=>/VIDA/.test(b.ad)).adet===8);
t('alt montajlar ustte', k.bom[0].altMontaj===true);
t('baglanti elemanlari EN ALTTA', k.bom[k.bom.length-1].baglanti===true);

console.log('\n-- SURE TAHMINI --');
t('sure hesaplandi', k.sureDk>0);
t('baglanti elemani daha az sure (0.5dk)', M.sureTahmini([{parcalar:[],baglantilar:[{adet:2}]}])===1);
t('parca 1.5 dk', M.sureTahmini([{parcalar:[{adet:2}],baglantilar:[]}])===3);

console.log('\n-- CIKTI --');
const html=M.htmlUret(k,{unvan:'DOXA'});
t('HTML uretildi', html.length>2000);
t('parca listesi tabloda', html.includes('Parça Listesi'));
t('montaj adimlari var', html.includes('Montaj Adımları'));
t('kontrol listesi var', html.includes('Kontrol Listesi'));
t('guvenlik uyarisi var', html.includes('Güvenlik'));
t('her adimda GORSEL YERI var', (html.match(/class="gorsel"/g)||[]).length===k.adimlar.length);
t('balon numaralari HTML de', html.includes('class="balon"'));
t('firma adi antette', html.includes('DOXA'));
t('imza alanlari var', html.includes('Montajı yapan'));

console.log('\n-- EKRAN --');
t('kilavuz butonu var', /st-kilavuz/.test(st));
t('yazdirma butonu', /mk-yazdir/.test(st));
t('excel butonu', /mk-excel/.test(st));
t('3B sinir DURUSTCE bildiriliyor', /geometrisini çözmek CAD çekirdeği ister/.test(st));
t('kod icinde de sinir belgeli', /3D PATLATILMIŞ GÖRSEL üretmez/.test(mk));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
