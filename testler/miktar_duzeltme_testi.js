const fs=require('fs'); let src=fs.readFileSync('../recete_talep.js','utf8');
const db={receteTalepleri:[],receteler:[{id:'RC-1',yarimamulId:'YM-1',ad:'R',kalemler:[
  {id:'RK-A',tip:'hammadde',refId:'HM-1',miktar:2.1,birim:'METRE'},
  {id:'RK-B',tip:'hammadde',refId:'HM-2',miktar:65,birim:'GRAM'}]}]};
global.Store={receteTalepleri:{all:async()=>db.receteTalepleri,save:async v=>{db.receteTalepleri=v}},
              receteler:{all:async()=>db.receteler,save:async v=>{db.receteler=v}}};
global.App={uid:p=>p+'-'+Math.random().toString(36).slice(2,7),persist:async f=>f(),aktifRol:()=>'op'};
eval(src.replace('const ReceteTalep','global.ReceteTalep'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
(async()=>{
console.log('\n-- MIKTAR DUZELTME --');
const r=await ReceteTalep.miktarDuzeltmeTalep({ymId:'YM-1',ymKod:'K',ymAd:'A',receteKalemId:'RK-A',hammaddeId:'HM-1',hammaddeAd:'SILME',eskiMiktar:2.1,miktar:2.6,birim:'METRE',gerekce:'fiili kullanim',operator:'emre'});
t('talep olustu',r.ok);
t('tip miktar_duzeltme',r.talep.tip==='miktar_duzeltme');
t('eski miktar saklandi',r.talep.eskiMiktar===2.1);
t('ayni miktar reddedilir',(await ReceteTalep.miktarDuzeltmeTalep({ymId:'YM-1',receteKalemId:'RK-A',eskiMiktar:2.1,miktar:2.1,birim:'METRE'})).ok===false);
t('kalemId yoksa red',(await ReceteTalep.miktarDuzeltmeTalep({ymId:'YM-1',miktar:5})).ok===false);

const kalemSayisiOnce=db.receteler[0].kalemler.length;
await ReceteTalep.planlamaOnayla(r.talep.id,'planlama');
const a=await ReceteTalep.argeTeknikOnayla(r.talep.id,'arge');
t('arge onayladi',a.ok===true);
t('miktarGuncellendi bayragi',a.miktarGuncellendi===true);
const kalem=db.receteler[0].kalemler.find(k=>k.id==='RK-A');
t('RECETE MIKTARI GUNCELLENDI (2.1 -> 2.6)',kalem.miktar===2.6);
t('onceki miktar izlenebilir',kalem.oncekiMiktar===2.1);
t('talebe bagli (iz)',kalem.miktarDuzeltmeTalepId===r.talep.id);
t('YENI KALEM EKLENMEDI',db.receteler[0].kalemler.length===kalemSayisiOnce);
t('diger kalem bozulmadi',db.receteler[0].kalemler.find(k=>k.id==='RK-B').miktar===65);

console.log('\n-- GOREV AYRILIGI korunuyor --');
const r2=await ReceteTalep.miktarDuzeltmeTalep({ymId:'YM-1',receteKalemId:'RK-B',eskiMiktar:65,miktar:70,birim:'GRAM',operator:'emre'});
t('operator kendi talebini onaylayamaz',(await ReceteTalep.planlamaOnayla(r2.talep.id,'emre')).ok===false);
await ReceteTalep.planlamaOnayla(r2.talep.id,'planlama');
t('uc goz: arge != planlama',(await ReceteTalep.argeTeknikOnayla(r2.talep.id,'planlama')).ok===false);


console.log('\n-- ID SIZ KALEMLER (Excel den gelen gercek durum) --');
db.receteler.push({id:'RC-2',yarimamulId:'YM-2',ad:'R2',kalemler:[
  {tip:'hammadde',refId:'HM-SILME',miktar:2.1,birim:'METRE'},
  {tip:'hammadde',refId:'HM-BOYA',miktar:65,birim:'GRAM'}]});
const x=await ReceteTalep.miktarDuzeltmeTalep({ymId:'YM-2',receteKalemId:'',receteKalemIndex:1,hammaddeId:'HM-BOYA',hammaddeAd:'TOZ BOYA',eskiMiktar:65,miktar:80,birim:'GRAM',operator:'emre'});
t('id yok ama index ile talep olustu',x.ok===true);
await ReceteTalep.planlamaOnayla(x.talep.id,'planlama');
const xa=await ReceteTalep.argeTeknikOnayla(x.talep.id,'arge');
t('id siz kalem onaylandi',xa.ok===true);
const rec2=db.receteler.find(r=>r.yarimamulId==="YM-2");
t('ID SIZ KALEMIN MIKTARI GUNCELLENDI (65 -> 80)',rec2.kalemler[1].miktar===80);
t('kaleme kalici id verildi',!!rec2.kalemler[1].id);
t('yanlis kalem bozulmadi',rec2.kalemler[0].miktar===2.1);
const y=await ReceteTalep.miktarDuzeltmeTalep({ymId:'YM-2',receteKalemIndex:0,hammaddeId:'HM-SILME',eskiMiktar:2.1,miktar:3,birim:'METRE',operator:'emre'});
await ReceteTalep.planlamaOnayla(y.talep.id,'planlama');
await ReceteTalep.argeTeknikOnayla(y.talep.id,'arge');
t('ikinci id siz kalem de guncellendi',rec2.kalemler[0].miktar===3);
t('ne id ne index -> red',(await ReceteTalep.miktarDuzeltmeTalep({ymId:'YM-2',eskiMiktar:1,miktar:2})).ok===false);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);})();
