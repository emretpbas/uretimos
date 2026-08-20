// Ayni urun/renk/yarimamul FARKLI SIPARISTEN gelince ayri gozukmeli
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(KOK,'app.js'),'utf8');
const ns=fs.readFileSync(path.join(KOK,'page_nesting.js'),'utf8');
const al=(ad)=>{const i=ns.indexOf('function '+ad+'(');let d=0,j=ns.indexOf('{',i);do{if(ns[j]==='{')d++;else if(ns[j]==='}')d--;j++;}while(d>0);return ns.slice(i,j);};
eval(al('packOnePlakaSerit')); eval(al('nestLineerTestere')); eval(al('buildDxf'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- PARCA AYRIM ANAHTARI --');
t('anahtara siparis dahil', /parcaAnahtar = k\.refId \+ ':' \+ enVal \+ ':' \+ boyVal \+ ':' \+ siparis\.id/.test(app));
t('eslesme yeni anahtarla', /liste\.find\(p => p\.refId === parcaAnahtar\)/.test(app));
t('kayit yeni anahtarla aciliyor', /refId: parcaAnahtar/.test(app));
t('gerekce yorumda aciklanmis', app.includes('FARKLI SİPARİŞTEN geliyorsa AYRI satır'));

console.log('\n-- SIMULASYON: ayni parca 2 musteriden --');
// Uretimdeki mantigin aynisi
function parcaEkle(liste, refId, en, boy, adet, siparis, ym, musteri){
  const anahtar = refId+':'+en+':'+boy+':'+siparis.id;
  const m = liste.find(p=>p.refId===anahtar);
  if(m){ m.adet+=adet; if(!m.siparisKodlari.includes(siparis.kod)) m.siparisKodlari.push(siparis.kod); }
  else liste.push({refId:anahtar, ad:'SUNTALAM 18MM FÜME', en, boy, adet,
    ymKod:ym, siparisKodlari:[siparis.kod], musteriler:[musteri]});
}
const liste=[];
const sipA={id:'S1',kod:'SIP-1001'}, sipB={id:'S2',kod:'SIP-1002'};
parcaEkle(liste,'HM-SUNTA',398,760,10,sipA,'YM.YAN.01','DOXA MOBİLYA');
parcaEkle(liste,'HM-SUNTA',398,760,6, sipB,'YM.YAN.01','ÇANAKCILAR YAPI');
parcaEkle(liste,'HM-SUNTA',398,760,4, sipA,'YM.YAN.01','DOXA MOBİLYA');   // ayni siparis -> birlesir

t('AYRI SATIR olustu (2 satir)', liste.length===2);
t('ayni siparisin parcalari birlesti (10+4=14)', liste.find(p=>p.siparisKodlari[0]==='SIP-1001').adet===14);
t('ikinci siparis ayri (6)', liste.find(p=>p.siparisKodlari[0]==='SIP-1002').adet===6);
t('her satir TEK siparis tasiyor', liste.every(p=>p.siparisKodlari.length===1));
t('musteriler dogru ayrildi',
  liste.find(p=>p.siparisKodlari[0]==='SIP-1001').musteriler[0]==='DOXA MOBİLYA' &&
  liste.find(p=>p.siparisKodlari[0]==='SIP-1002').musteriler[0]==='ÇANAKCILAR YAPI');
t('ayni yarimamul kodu ikisinde de var', liste.every(p=>p.ymKod==='YM.YAN.01'));

console.log('\n-- NESTING: parcalar birlikte yerlesir ama etiketler ayri --');
const parcalar=liste.map(p=>({ad:p.ad,en:p.en,boy:p.boy,adet:p.adet,grainKilitli:false,
  ymKod:p.ymKod,ymAd:'Yan Panel',siparisKodlari:p.siparisKodlari,musteriler:p.musteriler}));
const sonuc=nestLineerTestere(1830,3660,10,4,parcalar);
const tum=sonuc.plakalarOut.flatMap(pl=>pl.placed);
t('20 parca yerlesti (14+6)', tum.length===20);
t('SIP-1001 parcalari var', tum.filter(p=>p.siparisKodlari[0]==='SIP-1001').length===14);
t('SIP-1002 parcalari var', tum.filter(p=>p.siparisKodlari[0]==='SIP-1002').length===6);
t('her parca kendi musterisini tasiyor',
  tum.every(p=>p.musteriler && p.musteriler.length===1));

console.log('\n-- DXF: siparis ve musteri AYRI satirlarda --');
const dxf=buildDxf(sonuc,{ad:'SUNTALAM',en:1830,boy:3660});
t('SIP-1001 DXF te yaziyor', dxf.includes('SIP: SIP-1001'));
t('SIP-1002 DXF te yaziyor', dxf.includes('SIP: SIP-1002'));
t('DOXA musterisi yaziyor', dxf.includes('MUS: DOXA'));
t('CANAKCILAR musterisi TAM yaziyor (C korundu)', dxf.includes('MUS: CANAKCILAR YAPI'));
t('Turkce buyuk harf BUYUK kaliyor (cANAKCILAR degil)', !dxf.includes('cANAKCILAR'));
t('DOXA MOBILYA da dogru (I korundu)', dxf.includes('MOBILYA'));
t('YM kodu da duruyor', dxf.includes('YM: YM.YAN.01'));
t('siparis ve musteri AYRI satir (birlesmemis)', !dxf.includes('SIP-1001 DOXA'));

console.log('\n-- PLAKA ORTAKLAMA: farkli siparis birlestirilmemeli --');
t('imzaya ymKod ve siparis dahil', /p\.ymKod \|\| ''\},\$\{\(p\.siparisKodlari \|\| \[\]\)\.join\('\|'\)\}/.test(ns));
t('gerekce yorumda var', ns.includes('farklı siparişin parçalarını taşıyorsa AYRI gösterilmelidir'));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
