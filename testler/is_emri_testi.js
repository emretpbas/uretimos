// Is emri uretici: STEP AP203, PDF malzeme kodu, kaba olcu, bant, m2
const S=require('../step_okuyucu.js'), I=require('../is_emri_uretici.js');
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const pg=fs.readFileSync(path.join(KOK,'page_is_emri_formu.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

// AP203 test dosyasi (SolidWorks bicimi)
function ap203(){
  const parts=[['YAN PANEL',[360,70,8]],['YAN PANEL',[360,70,8]],['ON PANEL',[260,70,8]],['TABAN',[360,260,8]]];
  const L=['ISO-10303-21;','HEADER;',"FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));",'ENDSEC;','DATA;',
    "#1=PRODUCT('SOFINE 100LUK YAN KUTU','SOFINE 100LUK YAN KUTU','',(#900));",
    "#2=PRODUCT_DEFINITION_FORMATION('','',#1);","#3=PRODUCT_DEFINITION('design','',#2,#901);"];
  let i=10;
  parts.forEach(([ad,[b,e,k]],idx)=>{
    L.push(`#${i}=PRODUCT('${ad}','${ad}','',(#900));`);
    L.push(`#${i+1}=PRODUCT_DEFINITION_FORMATION('','',#${i});`);
    L.push(`#${i+2}=PRODUCT_DEFINITION('design','',#${i+1},#901);`);
    L.push(`#${i+3}=NEXT_ASSEMBLY_USAGE_OCCURRENCE('${idx+1}','','',#3,#${i+2},$);`);
    const base=i+10; let c=0; const pts=[];
    for(const dx of [0,b]) for(const dy of [0,e]) for(const dz of [0,k]){
      L.push(`#${base+c}=CARTESIAN_POINT('',(${dx}.,${dy}.,${dz}.));`); pts.push(base+c); c++; }
    L.push(`#${i+4}=ADVANCED_BREP_SHAPE_REPRESENTATION('${ad}',(${pts.map(q=>'#'+q).join(',')}),#902);`);
    i=base+c+2;
  });
  L.push('ENDSEC;','END-ISO-10303-21;');
  return L.join('\n');
}

console.log('\n-- STEP AP203 UYUMU (SolidWorks bicimi) --');
const m=ap203();
const agac=S.oku(m), geo=S.geometriCikar(m);
t('AP203 montaj agaci okundu', agac.dugumler.length===4);
t('AP203 geometrisi okundu', geo.geometriVar===true);
t('kok urun adi alindi', (agac.kok&&agac.kok.ad)==='SOFINE 100LUK YAN KUTU');
t('4 parca geometrisi', geo.parcalar.length===4);

console.log('\n-- STEP -> IS EMRI SATIRI --');
const sat=I.stepDenUret(agac,geo,{paketAdedi:2,renk:'MEŞE'});
t('ayni olcudeki parcalar BIRLESTIRILDI (3 satir)', sat.length===3);
const yan=sat.find(s=>s.parcaAdi==='YAN PANEL');
t('YAN PANEL adedi 2', yan.netAdet===2);
t('Boy en buyuk olcu (360)', yan.netBoy===360);
t('En orta olcu (70)', yan.netEn===70);
t('Kalinlik en kucuk olcu (8)', yan.kalinlik===8);
t('kaba olcu = net + pay', yan.kabaBoy===380 && yan.kabaEn===90);
t('uretim miktari = adet x paket', yan.uretimMiktari===4);
t('renk tasindi', yan.renk==='MEŞE');
t('birim m2 dogru (360x70=0.025)', yan.birimM2===0.025);
const taban=sat.find(s=>s.parcaAdi==='TABAN');
t('TABAN 360x260', taban.netBoy===360 && taban.netEn===260);
t('TABAN m2 0.094', taban.birimM2===0.094);

console.log('\n-- BANT GRUBU (kalinliga gore) --');
t('8mm -> 8mm grubu 0,4x22', I.bantGrubu(8).grup==='8mm' && I.bantGrubu(8).ince==='0,4x22');
t('18mm -> 18mm grubu 0,4x22', I.bantGrubu(18).grup==='18mm');
t('30mm -> 30mm grubu 0,4x33', I.bantGrubu(30).grup==='30mm' && I.bantGrubu(30).ince==='0,4x33');
t('satirda bant grubu isaretli', yan.bantGrup==='8mm');

console.log('\n-- PDF MALZEME KODU AYIKLAMA (gercek resim) --');
const pdfMetin=[
 {str:'50.001.008.001.00 8mm ham mdf üzeri',x:846,y:1082},
 {str:'çift yüz 99.999.044.01 KAPLAMA FREZE MEŞE 360*22*24',x:846,y:1069},
 {str:'50.011.10.014.00 KENAR BANT DOĞAL KAPLAMA 0,6*22 MEŞE FR',x:1115,y:1027},
 {str:'So fine 100cm çekmece yan kutu',x:869,y:788},
 {str:'2 adet yapılacak',x:1205,y:775},
 {str:'So fine 80cm çekmece yan kutu',x:903,y:537},
 {str:'2 adet yapılacak',x:1239,y:524},
 {str:'So fine orta kutu',x:903,y:222},
 {str:'2 adet yapılacak',x:1239,y:222},
 {str:'360',x:259,y:1106},{str:'260',x:137,y:903},{str:'70',x:137,y:1047}];
const mal=I.malzemeCikar(pdfMetin);
t('3 malzeme kodu bulundu', mal.length===3);
t('MDF plaka kodu', mal.some(x=>x.kod==='50.001.008.001.00' && x.tip==='plaka'));
t('kaplama kodu', mal.some(x=>x.kod==='99.999.044.01' && x.tip==='kaplama'));
t('kenar bandi kodu', mal.some(x=>x.kod==='50.011.10.014.00' && x.tip==='kenar_bandi'));
t('kalinlik ayiklandi (8mm)', mal.find(x=>x.tip==='plaka').kalinlik==='8');
t('renk ayiklandi (MESE)', mal.some(x=>/MEŞE/i.test(x.renk||'')));

console.log('\n-- PDF URUN VE ADET --');
const ur=I.urunlerCikar(pdfMetin);
t('3 urun bulundu', ur.length===3);
t('adetler 2', ur.every(u=>u.adet===2));
t('100cm kutu tanindi', ur.some(u=>/100cm/.test(u.ad)));
t('80cm kutu tanindi', ur.some(u=>/80cm/.test(u.ad)));

console.log('\n-- PDF -> SATIR (olcu UYARISI) --');
const pu=I.pdfDenUret(pdfMetin,{});
t('3 satir uretildi', pu.satirlar.length===3);
t('olcu BOS birakildi (tahmin yok)', pu.satirlar[0].netBoy===0);
t('kullaniciya UYARI veriliyor', pu.uyari.indexOf('KESİN eşlenemez')>0);
t('olcu adaylari listelendi', pu.olcuAdaylari.includes(360) && pu.olcuAdaylari.includes(260));
t('malzeme kodu satira atandi', !!pu.satirlar[0].parcaKodu);

console.log('\n-- OZET (formun sag blogu) --');
const oz=I.ozet(sat);
t('satir sayisi 3', oz.satirSayisi===3);
t('toplam parca 8', oz.toplamParca===8);
t('toplam m2 hesaplandi', oz.toplamM2>0);
t('bant grubuna gore gruplandi', oz.gruplar.length===1 && oz.gruplar[0].grup==='8mm');

console.log('\n-- BANT METRAJI --');
const bs={...yan, pvc2:{boy:2,en:0},pvc1:{boy:0,en:2},pvc040:{boy:0,en:0},soft:{boy:0,en:0},duz:{boy:0,en:0}};
t('bant metraji hesaplaniyor', I.bantHesapla(bs)>0);
t('bos bantta metraj 0', I.bantHesapla(yan)===0);

console.log('\n-- EKRAN VE CIKTILAR --');
t('STEP/PDF/DWG kabul ediliyor', /accept="\.step,\.stp,\.STEP,\.STP,\.pdf,\.dwg"/.test(pg));
t('STEP tercih edilmesi aciklanmis', /STEP \(AP203\/AP214\) en iyi sonucu verir/.test(pg));
t('wireframe uyarisi var', /Wireframe seçilirse ölçüler çıkmaz/.test(pg));
t('FR.29 dokuman no formda', /FR\.29/.test(pg));
t('Holzma\\/Ima\\/Rover\\/Delik alanlari', /holzma[\s\S]{0,80}ima[\s\S]{0,80}rover[\s\S]{0,80}delik/.test(pg));
t('Net ve Kaba olcu sutunlari', /Net Ölçü[\s\S]{0,200}Kaba Ölçü/.test(pg));
t('4 bant sutunu (PVC2\\/1\\/0,40\\/SOFT, DUZ kaldirildi)', /'PVC 2mm', 'PVC 1mm', 'PVC 0,40', 'SOFT'\]/.test(pg));
t('Excel ciktisi var', /function excelIndir/.test(pg));
t('antetli PDF ciktisi var', /function pdfYazdir/.test(pg));
t('PDF A3 yatay (genis tablo)', /size: A3 landscape/.test(pg));
t('firma logosu antette', /uretimos_firma_logo/.test(pg));
t('imza alanlari var', /Hazırlayan[\s\S]{0,120}Onaylayan/.test(pg));
t('satirlar duzenlenebilir', /class="finput ie-h"/.test(pg));
t('olcu degisince m2 yeniden hesaplaniyor', /s\.birimM2 = Math\.round/.test(pg));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
