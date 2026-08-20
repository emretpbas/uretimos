// STEP montaj agaci okuyucu testleri
const S=require('../step_okuyucu.js');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

const bas=`ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n`;
const son=`\nENDSEC;\nEND-ISO-10303-21;`;
const urun=(id,ad)=>`#${id}=PRODUCT('${ad}','${ad}','',(#2));\n#${id+1}=PRODUCT_DEFINITION_FORMATION('','',#${id});\n#${id+2}=PRODUCT_DEFINITION('design','',#${id+1},#3);\n`;
const nauo=(id,ebv,cocuk)=>`#${id}=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#${ebv+2},#${cocuk+2},$);\n`;

console.log('\n-- TEK SEVIYE MONTAJ --');
let s=bas+urun(1,'DOLAP')+urun(10,'YAN')+urun(20,'RAF')
  +nauo(300,1,10)+nauo(301,1,10)+nauo(302,1,20)+nauo(303,1,20)+nauo(304,1,20)+son;
let r=S.oku(s);
t('kok dogru tespit edildi', r.kok.ad==='DOLAP');
t('YAN 2 adet', r.dugumler.find(d=>d.ad==='YAN').toplamAdet===2);
t('RAF 3 adet', r.dugumler.find(d=>d.ad==='RAF').toplamAdet===3);
t('toplam parca adedi 5', r.istatistik.toplamParcaAdedi===5);
t('hepsi yaprak', r.istatistik.yaprakSayisi===2 && r.istatistik.montajSayisi===0);

console.log('\n-- COK SEVIYELI MONTAJ (adet carpani) --');
// DOLAP > 2x CEKMECE > her cekmecede 2x YAN + 1x TABAN
s=bas+urun(1,'DOLAP')+urun(10,'CEKMECE')+urun(20,'CYAN')+urun(30,'TABAN')
  +nauo(300,1,10)+nauo(301,1,10)          // 2 cekmece
  +nauo(310,10,20)+nauo(311,10,20)        // her cekmecede 2 yan
  +nauo(320,10,30)+son;                   // her cekmecede 1 taban
r=S.oku(s);
t('CEKMECE montaj olarak isaretli', r.dugumler.find(d=>d.ad==='CEKMECE').yaprakMi===false);
t('CEKMECE 2 adet', r.dugumler.find(d=>d.ad==='CEKMECE').toplamAdet===2);
t('CYAN 4 adet (2 cekmece x 2)', r.dugumler.find(d=>d.ad==='CYAN').toplamAdet===4);
t('TABAN 2 adet (2 cekmece x 1)', r.dugumler.find(d=>d.ad==='TABAN').toplamAdet===2);
t('agac hiyerarsisi korundu', r.agac.cocuklar[0].cocuklar.length===2);
t('montaj sayisi 1', r.istatistik.montajSayisi===1);

console.log('\n-- GERCEK DUNYA VARYASYONLARI --');
s=bas+urun(1,'KAPAK')+`#500=CARTESIAN_POINT('',(0.,0.,0.));\n`+son;
r=S.oku(s);
t('montajsiz tek parca da okunuyor', !r.hata);
t('NAUO yoksa uyari veriliyor', r.uyarilar.some(u=>u.includes('NAUO')));

s=bas+urun(1,"DOLAP D'LUX")+urun(10,'YAN')+nauo(300,1,10)+son;
r=S.oku(s);
t('tirnak kacisi olan ad okunuyor', r.kok.ad.includes('LUX'));

const cokSatirli=bas+`#1=PRODUCT('UZUN\n  AD','UZUN\n  AD','',(#2));\n`
  +`#2=PRODUCT_DEFINITION_FORMATION('','',#1);\n#3=PRODUCT_DEFINITION('design','',#2,#9);\n`+son;
r=S.oku(cokSatirli);
t('satir sonu iceren varlik cozuluyor', !r.hata && r.kok!=null);

r=S.oku('bu bir step dosyasi degil');
t('gecersiz dosya reddediliyor', !!r.hata);

console.log('\n-- DONGU KORUMASI --');
s=bas+urun(1,'A')+urun(10,'B')+nauo(300,1,10)+nauo(301,10,1)+son;  // A>B>A dongu
let hata=null;
try { r=S.oku(s); } catch(e){ hata=e; }
t('dairesel montaj sonsuz donguye girmiyor', hata===null);

console.log('\n-- KOD TURETME --');
t('paket kodu', S.kodTuret('CT.D.80200','paket',1)==='CT.D.80200.PKT01');
t('yarimamul kodu', S.kodTuret('CT.D.80200','yarimamul',5)==='Y.CT.D.80200.05');
t('bosluk temizleniyor', S.kodTuret(' ct d ','paket',2)==='CTD.PKT02');
t('kucuk harf buyuge cevriliyor', S.kodTuret('abc','yarimamul',1)==='Y.ABC.01');


// ── RECETE OLUSTURMA MANTIGI (ekrandaki algoritmanin aynisi) ──
console.log('\n-- RECETE OLUSTURMA (cok seviyeli) --');
{
  const bas2=`ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('X'));\nENDSEC;\nDATA;\n`, son2=`\nENDSEC;\nEND-ISO-10303-21;`;
  const u=(id,ad)=>`#${id}=PRODUCT('${ad}','${ad}','',(#2));\n#${id+1}=PRODUCT_DEFINITION_FORMATION('','',#${id});\n#${id+2}=PRODUCT_DEFINITION('design','',#${id+1},#3);\n`;
  const n=(id,e,c)=>`#${id}=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#${e+2},#${c+2},$);\n`;
  const s2=bas2+u(1,'DOLAP')+u(10,'CEKMECE')+u(20,'CYAN')+u(30,'GOVDE_YAN')
    +n(300,1,10)+n(301,1,10)+n(310,10,20)+n(311,10,20)+n(320,1,30)+n(321,1,30)+son2;
  const r2=S.oku(s2);
  const kok='CT.100';
  const eslesme=new Map(); let pn=0, yn=0;
  eslesme.set(r2.agac.urunId,{tip:'urun',kod:kok});
  (function kur(d){d.cocuklar.forEach(c=>{
    if(!eslesme.has(c.urunId)){
      if(c.yaprakMi) eslesme.set(c.urunId,{tip:'yarimamul',kod:S.kodTuret(kok,'yarimamul',++yn)});
      else eslesme.set(c.urunId,{tip:'paket',kod:S.kodTuret(kok,'paket',++pn)});
    } kur(c);});})(r2.agac);
  const receteler=[];
  (function rec(d){ if(!d.cocuklar.length) return;
    receteler.push({sahip:eslesme.get(d.urunId).kod, kalemler:d.cocuklar.map(c=>({kod:eslesme.get(c.urunId).kod,tip:eslesme.get(c.urunId).tip,miktar:c.adet}))});
    d.cocuklar.forEach(rec);})(r2.agac);

  t('2 recete olustu (urun + cekmece)', receteler.length===2);
  const urunRec=receteler.find(x=>x.sahip===kok);
  t('urun recetesinde 2 kalem', urunRec.kalemler.length===2);
  t('cekmece PAKET olarak kodlandi', urunRec.kalemler.find(k=>k.tip==='paket').kod==='CT.100.PKT01');
  t('cekmece adedi 2', urunRec.kalemler.find(k=>k.tip==='paket').miktar===2);
  t('govde yan YARI MAMUL', urunRec.kalemler.find(k=>k.tip==='yarimamul').kod.startsWith('Y.CT.100'));
  t('govde yan adedi 2', urunRec.kalemler.find(k=>k.tip==='yarimamul').miktar===2);
  const pktRec=receteler.find(x=>x.sahip==='CT.100.PKT01');
  t('paketin kendi recetesi var', !!pktRec);
  t('paket recetesinde cekmece yani 2 adet', pktRec.kalemler[0].miktar===2);
  t('ALT recetede adet CARPILMIYOR (birim recete)', pktRec.kalemler[0].miktar===2);
}
console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');
process.exit(bad?1:0);
