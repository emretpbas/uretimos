// Kesim parcalarinin siparis/yarimamul izlenebilirligi: tablo -> nesting -> DXF
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const ns=fs.readFileSync(path.join(KOK,'page_nesting.js'),'utf8');
const app=fs.readFileSync(path.join(KOK,'app.js'),'utf8');
const al=(ad)=>{const i=ns.indexOf('function '+ad+'(');let d=0,j=ns.indexOf('{',i);do{if(ns[j]==='{')d++;else if(ns[j]==='}')d--;j++;}while(d>0);return ns.slice(i,j);};
eval(al('packOnePlakaSerit')); eval(al('nestLineerTestere'));
eval(al('packOnePlaka')); eval(al('nestParcalar')); eval(al('buildDxf'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- KAYNAKTA BILGI URETILIYOR MU (app.js) --');
t('ym bilgisi SAHIP KARTTAN aliniyor (k.refId hammadde!)', /_ymKod = sahipKart \? \(sahipKart\.kod/.test(app));
t('ymId sahip kartin id si', /ymId: sahipKart \? sahipKart\.id : null/.test(app));
t('kalemIsle sahipKart parametresi aliyor', /function kalemIsle\(k, carpan, sahipKart\)/.test(app));
t('recete gezilirken kart geciriliyor', /kalemIsle\(k, eksikCarpan, kart\)/.test(app));
t('parcaya siparis bilgisi yaziliyor', /siparisId: siparis\.id, siparisKodlari:/.test(app));
t('parcaya MUSTERI bilgisi yaziliyor', /musteriId: siparis\.musteriId \|\| null, musteriler:/.test(app));
t('musteri adi siparisten cozuluyor', /_musteri = siparis\.musteriAdi/.test(app));

t('ayni parca farkli siparisten gelirse biriktiriliyor', /siparisKodlari\.includes\(_sipKod\)/.test(app));

console.log('\n-- TABLODA GORUNUYOR MU --');
t('Yari Mamul sutunu var', ns.includes('<th>Yarı Mamül</th>'));
t('Siparis sutunu var', ns.includes('<th>Sipariş</th>'));
t('ym kodu satirda basiliyor', /p\.ymKod \|\| p\.ymAd/.test(ns));
t('siparis kodlari satirda listeleniyor', /p\.siparisKodlari\.map/.test(ns));

console.log('\n-- NESTING MOTORUNDA KORUNUYOR MU --');
const parcalar=[
 {ad:'SUNTALAM',en:422,boy:1506,adet:4,grainKilitli:false,ymKod:'YM.YAN.01',ymAd:'Yan Panel',siparisKodlari:['SIP-1001']},
 {ad:'SUNTALAM',en:460,boy:386,adet:4,grainKilitli:false,ymKod:'YM.RAF.02',ymAd:'Raf',siparisKodlari:['SIP-1001','SIP-1002']}
];
const lin=nestLineerTestere(1830,3660,10,4,parcalar);
const yerlesen=lin.plakalarOut[0].placed;
t('yerlesen parca ymKod tasiyor', yerlesen.every(p=>!!p.ymKod));
t('yerlesen parca siparis tasiyor', yerlesen.every(p=>Array.isArray(p.siparisKodlari)));
t('dogru ym eslesmesi korundu', !!yerlesen.find(p=>p.ymKod==='YM.YAN.01') && !!yerlesen.find(p=>p.ymKod==='YM.RAF.02'));
const cnc=nestParcalar(1830,3660,10,4,parcalar);
t('CNC modunda da korunuyor', cnc.plakalarOut[0].placed.every(p=>!!p.ymKod));

console.log('\n-- DXF CIKTISINDA VAR MI --');
const dxf=buildDxf(lin,{ad:'SUNTALAM',en:1830,boy:3660});
t('DXF te yari mamul kodu yaziyor', dxf.includes('YM: YM.YAN.01'));
t('DXF te ikinci ym de var', dxf.includes('YM: YM.RAF.02'));
t('DXF te siparis kodu yaziyor', dxf.includes('SIP: SIP-1001'));
t('coklu siparis kisaltilarak yaziliyor', dxf.includes('SIP-1001,SIP-1002'));
t('olcu bilgisi hala var', /422x1506|1506x422/.test(dxf));
t('geometri bozulmadi (LWPOLYLINE)', dxf.includes('LWPOLYLINE'));
t('etiketler ETIKET katmaninda', /TEXT\r\n8\r\nETIKET\r\n/.test(dxf));

console.log('\n-- EKRAN CIZIMI --');
t('ekranda ym kodu oncelikli gosteriliyor', /const ustSatir = p\.ymKod \|\|/.test(ns));
t('ekranda siparis kodu gosteriliyor', /p\.siparisKodlari\[0\]/.test(ns));


console.log('\n-- MUSTERI BILGISI --');
t('tabloda Musteri sutunu', ns.includes('<th>Müşteri</th>'));
t('tabloda musteri basiliyor', /p\.musteriler\.map/.test(ns));
const parcalar2=[{ad:'S',en:422,boy:1506,adet:2,grainKilitli:false,ymKod:'YM.YAN.01',ymAd:'Yan',siparisKodlari:['SIP-1001'],musteriler:['DOXA MOBILYA']}];
const lin2=nestLineerTestere(1830,3660,10,4,parcalar2);
t('nestingte musteri korunuyor', lin2.plakalarOut[0].placed.every(p=>Array.isArray(p.musteriler)&&p.musteriler.length));
const dxf2=buildDxf(lin2,{ad:'S',en:1830,boy:3660});
t('DXF te musteri yaziyor', dxf2.includes('MUS: DOXA MOBILYA'));
t('DXF te ym ve siparis de duruyor', dxf2.includes('YM: YM.YAN.01') && dxf2.includes('SIP: SIP-1001'));
t('ekran ciziminde musteri var', /p\.musteriler\[0\]/.test(ns));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
