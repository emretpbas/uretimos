// Tefris yorumlama: DWG blok adlari + mahal tipine gore mimari cikarim
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(KOK,'plan_okuyucu.js'),'utf8');
const wk=fs.readFileSync(path.join(KOK,'vendor/dwg/dwg_worker.js'),'utf8');
const pt=fs.readFileSync(path.join(KOK,'page_proje_teklif.js'),'utf8');
global.window={pdfjsLib:{}};global.document={createElement:()=>({getContext:()=>({}),toDataURL:()=>''}),head:{appendChild:()=>{}}};
const P=eval(src.replace("if (typeof module !== 'undefined') module.exports = PlanOkuyucu;","")+'; PlanOkuyucu');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- DWG BLOK ADI YORUMLAMA (gercek adlar) --');
const y=(b)=>P.blokYorumla(b);
t('"120 etajerli masa" -> Masa', y('120 etajerli masa').ad==='Masa');
t('"WC3" -> Klozet', y('WC3').ad==='Klozet');
t('"LAV" -> Lavabo', y('LAV').ad==='Lavabo');
t('"door_Nor_w200_len1000" -> Kapi', y('door_Nor_w200_len1000').ad==='Kapı');
t('"SAKSI-3" -> Bitki', y('SAKSI-3').ad.includes('Bitki'));
t('"Tree100" -> Bitki', y('Tree100').ad.includes('Bitki'));
t('anlamsiz kod UYDURULMUYOR', y('NVBNY').cozuldu===false);
t('cozulemeyende ham ad korunuyor', y('NVBNY').ad.includes('NVBNY'));
t('20 blok sinifi tanimli', P.BLOK_SOZLUGU.length>=20);

console.log('\n-- MAHAL TIPINE GORE MIMARI CIKARIM --');
const m=(x)=>P.mahalTefrisi(x);
t('DERSLIK tefrisi var', m('DERSLİK').length>=5);
t('DERSLIKte okul sirasi var', m('DERSLİK').some(k=>/okul sırası/i.test(k.ad)));
t('DERSLIKte yazi tahtasi var', m('DERSLİK').some(k=>/yazı tahtası/i.test(k.ad)));
t('WC de klozet+lavabo var', m('BAY ÖĞRETMEN WC').some(k=>k.ad==='Klozet') && m('BAY ÖĞRETMEN WC').some(k=>k.ad==='Lavabo'));
t('WC de kabin bolme var', m('BAYAN ÖĞRETMEN WC').some(k=>/kabin/i.test(k.ad)));
t('MUDUR ODASI tefrisi', m('MÜDÜR ODASI').some(k=>/makam koltuğu/i.test(k.ad)));
t('OGRETMENLER ODASI toplanti masasi', m('ÖĞRETMENLER ODASI').some(k=>/toplantı masası/i.test(k.ad)));
t('KORIDOR duvar koruma bandi', m('KORİDOR').some(k=>/duvar koruma/i.test(k.ad)));
t('MUTFAK tezgah+dolap', m('MUTFAK').some(k=>/tezgah/i.test(k.ad)));
t('KUTUPHANE kitaplik', m('KÜTÜPHANE VE BİLGİSAYAR DERS.').some(k=>/kitaplık/i.test(k.ad)));
t('bilinmeyen mahalde ONERI YOK (uydurmuyor)', m('ANA DAĞITIM PANO OD.').length===0);
t('TURKCE buyuk harf sorunu cozuldu (İ)', m('DERSLİK').length===m('derslik').length);

console.log('\n-- BLOKLARIN MAHALLERE ATANMASI --');
const kesif={mahaller:[{ad:'WC',adet:1,detaylar:[]},{ad:'MUTFAK',adet:1,detaylar:[]}],
             mahalKonumlari:[{ad:'WC',x:0,y:0},{ad:'MUTFAK',x:1000,y:0}]};
const bloklar=[{ad:'WC3',x:10,y:10},{ad:'WC3',x:20,y:5},{ad:'LAV',x:15,y:20},
               {ad:'120 etajerli masa',x:1010,y:5},{ad:'UZAK',x:99999,y:99999}];
P.bloklariMahallereAta(kesif,bloklar,kesif.mahalKonumlari,400);
const wc=kesif.mahaller[0], mut=kesif.mahaller[1];
t('WC ye 2 klozet atandi', wc.detaylar.find(d=>d.sinif==='Klozet').adet===2);
t('WC ye 1 lavabo atandi', wc.detaylar.find(d=>d.sinif==='Lavabo').adet===1);
t('MUTFAGA masa atandi', mut.detaylar.some(d=>d.sinif==='Masa'));
t('uzak blok atanmadi', kesif.atanmayanBlok===1);
t('tefris isareti konuldu', wc.detaylar.every(d=>d.tefris===true));
t('toplam blok sayisi raporlaniyor', kesif.toplamBlok===5);

console.log('\n-- WORKER VE EKRAN --');
t('worker blok topluyor', /const bloklar = \[\]/.test(wk));
t('worker INSERT tipini okuyor', /ent\.type !== 'INSERT'/.test(wk));
t('blok adi 3 alandan aranıyor'.replace('ı','i'), /ent\.name \|\| ent\.blockName \|\| ent\.blockRecordName/.test(wk));
t('ekranda tefris onerisi bolumu', /Bu mahal tipi için tipik tefriş/.test(pt));
t('oneri MIMARI YORUM oldugu belirtiliyor', /mimari yorum/i.test(pt));
t('oneriler VARSAYILAN olarak isaretsiz', /class="mp-t-sec"[^>]*data-t="\$\{oi\}"(?![^>]*checked)/.test(pt));
t('cizimden gelen kalem tekrar onerilmiyor', /mevcut\.has\(o\.ad\.toLocaleLowerCase/.test(pt));
t('tefris kalemleri gorsel isaretli', /pill-blue[^>]*>tefriş/.test(pt));
t('cozulemeyen blok ekranda isaretli', /adı çözülemedi/.test(pt));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
