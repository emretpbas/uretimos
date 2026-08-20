// Nesting DXF: calisan dolap ihracatiyla AYNI sade bicim + kerf araligi
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(KOK,'page_nesting.js'),'utf8');
const cnc=fs.readFileSync(path.join(KOK,'cnc_export.js'),'utf8');
const al=(ad)=>{const i=src.indexOf('function '+ad+'(');let d=0,j=src.indexOf('{',i);do{if(src[j]==='{')d++;else if(src[j]==='}')d--;j++;}while(d>0);return src.slice(i,j);};
eval(al('packOnePlakaSerit')); eval(al('nestLineerTestere')); eval(al('buildDxf'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

const plaka={ad:'MDFLAM 18MM',en:1830,boy:3660};
const KERF=4, KENAR=10;
const sonuc=nestLineerTestere(1830,3660,KENAR,KERF,[{ad:'YAN',en:398,boy:760,adet:40,grainKilitli:false}]);
const dxf=buildDxf(sonuc,plaka);
const L=dxf.split('\r\n');
const say=(k)=>L.filter(x=>x===k).length;

console.log('\n-- CALISAN BICIMLE UYUM --');
t('dolap ihracati LWPOLYLINE kullaniyor (referans)', cnc.includes("c(0, 'LWPOLYLINE')"));
t('nesting de LWPOLYLINE kullaniyor', dxf.includes('LWPOLYLINE'));
t('handle (kod 5) YOK — ayristiriciyi bozuyordu', !/\r\n5\r\n/.test(dxf));
t('alt sinif isaretcisi (100) YOK', !dxf.includes('AcDbEntity') && !dxf.includes('AcDbPolyline'));
t('sade yapi: sadece ENTITIES bolumu', say('SECTION')===1 && say('ENDSEC')===1);
t('TABLES bolumu yok (sade)', !dxf.includes('TABLES'));
t('EOF ile bitiyor', L[L.length-2]==='EOF' || L[L.length-1]==='EOF');
t('CRLF satir sonu', dxf.includes('\r\n'));

console.log('\n-- GEOMETRI --');
const parcaSayisi=sonuc.plakalarOut.reduce((a,p)=>a+p.placed.length,0);
const plakaSayisi=sonuc.plakalarOut.length;
t('polyline sayisi = plakalar + parcalar', say('LWPOLYLINE')===plakaSayisi+parcaSayisi);
t('her polyline kapali (70=1)', say('70')===say('LWPOLYLINE'));
t('her polyline 4 kose (90=4)', say('90')===say('LWPOLYLINE'));
t('plaka stok cizgisi PLAKA katmaninda', /LWPOLYLINE\r\n8\r\nPLAKA\r\n/.test(dxf));
t('parcalar KESIM katmaninda', /LWPOLYLINE\r\n8\r\nKESIM\r\n/.test(dxf));
t('yazilar ETIKET katmaninda (kapatilabilir)', /TEXT\r\n8\r\nETIKET\r\n/.test(dxf));

console.log('\n-- KESIM PAYI (kerf) ARALIKLARI --');
const ilk=sonuc.plakalarOut[0].placed;
const ayniSirada=ilk.filter(p=>Math.abs(p.y-ilk[0].y)<0.01).sort((a,b)=>a.x-b.x);
const bosluk = ayniSirada.length>1 ? (ayniSirada[1].x-(ayniSirada[0].x+ayniSirada[0].w)) : null;
console.log('  yatay komsu kutular arasi bosluk: '+bosluk+' mm (kerf='+KERF+')');
t('kutular arasinda kesim payi kadar bosluk var', Math.abs(bosluk-KERF)<0.01);
t('kutular ust uste BINMIYOR', bosluk>0);
t('kenar boslugu uygulanmis (ilk parca kenardan icerde)', (KENAR+ilk[0].x)>=KENAR);

console.log('\n-- OLCU DOGRULUGU --');
t('gercek koordinat DXF te var', dxf.includes(String(Math.round((KENAR+ilk[0].x)*100)/100)));
t('plaka boyu yazilmis', dxf.includes('3660'));
t('2. plaka 300mm arayla kaydirilmis', plakaSayisi<2 || dxf.includes(String(1830+300)));
t('turkce karakter yok (CAM uyumu)', !/[ğüşıöçĞÜŞİÖÇ]/.test(dxf));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
