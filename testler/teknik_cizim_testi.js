// Teknik cizim: geometri cikarimi, patlatilmis sema, gorunusler, olculendirme
global.window={};
const S=require('../step_okuyucu.js'), T=require('../teknik_cizim.js'), M=require('../montaj_kilavuzu.js');
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const tc=fs.readFileSync(path.join(KOK,'teknik_cizim.js'),'utf8');
const st=fs.readFileSync(path.join(KOK,'page_step_ice_aktar.js'),'utf8');
const pk=fs.readFileSync(path.join(KOK,'page_kartlar.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

// Gercekci STEP: 800x600x720 dolap, 4 parca
function stepUret(){
  const parts=[['YAN PANEL',[18,600,720],[0,0,0]],['YAN PANEL',[18,600,720],[782,0,0]],
               ['UST PANEL',[764,600,18],[18,0,702]],['RAF',[764,580,18],[18,0,350]]];
  const L=['ISO-10303-21;','HEADER;',"FILE_SCHEMA(('X'));",'ENDSEC;','DATA;'];
  let i=1;
  parts.forEach(([ad,[w,d,h],[x,y,z]])=>{
    L.push(`#${i}=PRODUCT('${ad}','${ad}','',(#900));`);
    const base=i+10; let k=0; const pts=[];
    for(const dx of [0,w]) for(const dy of [0,d]) for(const dz of [0,h]){
      L.push(`#${base+k}=CARTESIAN_POINT('',(${x+dx}.,${y+dy}.,${z+dz}.));`); pts.push(base+k); k++;
    }
    L.push(`#${i+5}=ADVANCED_BREP_SHAPE_REPRESENTATION('${ad}',(`+pts.map(q=>'#'+q).join(',')+`),#902);`);
    i=base+k+2;
  });
  L.push('ENDSEC;','END-ISO-10303-21;');
  return L.join('\n');
}
const geo=S.geometriCikar(stepUret());

console.log('\n-- GEOMETRI CIKARIMI --');
t('geometri bulundu', geo.geometriVar===true);
t('4 parca', geo.parcalar.length===4);
t('32 nokta okundu', geo.toplamNokta===32);
t('YAN PANEL olcusu 18x600x720', JSON.stringify(geo.parcalar[0].olcu)===JSON.stringify([18,600,720]));
t('UST PANEL olcusu 764x600x18', geo.parcalar.find(p=>p.ad==='UST PANEL').olcu[0]===764);
t('genel olcu 800x600x720', JSON.stringify(geo.genel.olcu)===JSON.stringify([800,600,720]));
t('merkez hesaplandi', geo.parcalar[0].merkez.length===3);
t('geometrisiz STEP te uyari', S.geometriCikar('ISO-10303-21;\nDATA;\nENDSEC;').geometriVar===false);

console.log('\n-- PATLATILMIS SEMA --');
const p=T.patlatilmisSvg(geo,{});
t('SVG uretildi', p.svg.startsWith('<svg') && p.svg.length>1000);
t('4 balon', p.balonlar.length===4);
t('balon numaralari sirali', p.balonlar.every((b,i)=>b.balon===i+1));
t('balonlarda olcu var', p.balonlar.every(b=>b.olcu.length===3));
t('viewBox tanimli', /viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/.test(p.svg));
t('parcalar 3 yuzle cizildi (izometrik)', (p.svg.match(/<polygon/g)||[]).length>=12);
// Patlatma gercekten ayiriyor mu
const p0=T.patlatilmisSvg(geo,{patlatma:0});
t('patlatma katsayisi etki ediyor', p.svg!==p0.svg);
t('patlatma vektoru merkezden disa', (()=>{
  const v=T.patlatmaVektoru(geo.parcalar[0],geo.genel,0.6);
  return v.some(c=>Math.abs(c)>1);
})());

console.log('\n-- GORUNUSLER VE OLCULENDIRME --');
const on=T.gorunusSvg(geo,'on'), ust=T.gorunusSvg(geo,'ust'), sag=T.gorunusSvg(geo,'sag'), sol=T.gorunusSvg(geo,'sol');
t('ON GORUNUS 800x720', on.genislik===800 && on.yukseklik===720);
t('UST GORUNUS 800x600', ust.genislik===800 && ust.yukseklik===600);
t('SAG GORUNUS 600x720', sag.genislik===600 && sag.yukseklik===720);
t('SOL GORUNUS da uretiliyor', !!sol && sol.ad==='SOL GÖRÜNÜŞ');
t('olcu yazisi SVG de', on.svg.includes('800 mm') && on.svg.includes('720 mm'));
t('olcu oklari cizildi', (on.svg.match(/<polygon/g)||[]).length>=4);
t('uzatma cizgileri var', (on.svg.match(/<line/g)||[]).length>=6);
t('eksen adlari dogru', on.eksen[0]==='Genişlik' && on.eksen[1]==='Yükseklik');
t('gecersiz gorunus null', T.gorunusSvg(geo,'olmayan')===null);

console.log('\n-- TAM TEKNIK DOSYA --');
const kil=M.uret(S.oku(stepUret()),{urunAdi:'Dolap'});
const html=T.teknikDosyaHtml(geo,kil.ok?kil:null,{urunAdi:'Dolap 80',urunKodu:'D80',firma:'DOXA'});
t('HTML uretildi', html.length>8000);
t('patlatilmis sema sayfasi', html.includes('Patlatılmış Montaj Şeması'));
t('gorunusler sayfasi', html.includes('Görünüşler ve Ölçülendirme'));
t('4 gorunus de var', (html.match(/GÖRÜNÜŞ/g)||[]).length>=4);
t('balon tablosu', html.includes('Balon'));
t('A4 yazdirma ayari', html.includes('size: A4'));
t('sayfa bolme var', html.includes('page-break-after'));
t('SINIR KUTUSU notu var (durustluk)', html.includes('sınır kutusu olarak gösterilmiştir'));
t('firma adi antette', html.includes('DOXA'));
t('genel olcu antette', html.includes('800 × 600 × 720'));

console.log('\n-- EKRAN VE KAYIT --');
t('teknik dosya butonu', /st-teknik/.test(st));
t('geometri STEP okurken cikariliyor', /StepOkuyucu\.geometriCikar\(metin\)/.test(st));
t('URUN KARTINA kaydediliyor', /u\.teknikDosya = \{/.test(st));
t('kayitta SVG ler saklaniyor', /patlatmaSvg: patlatma\.svg/.test(st));
t('kayitta montaj adimlari da var', /montajAdimlari: kilavuz\.ok/.test(st));
t('geometri yoksa aciklayici uyari', /çizilebilir geometri bulunamadı/.test(st));
t('cozum onerisi veriliyor (AP214)', /STEP AP214/.test(st));
t('kart ekraninda teknik dosya butonu', /kt-teknik-dosya/.test(pk));
t('kartta yoksa yonlendirme var', /STEP Ekranına Git/.test(pk));
t('karttan PDF yazdirilabiliyor', /td-yazdir/.test(pk));
t('kod icinde sinir belgelenmis', /SINIR KUTUSU olarak çizilir/.test(tc));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
