const fs=require('fs'); let src=fs.readFileSync('../recete_talep.js','utf8');
const db={receteTalepleri:[],receteler:[{id:'RC-1',yarimamulId:'YM-100',ad:'Test Recete',kalemler:[]}]};
global.Store={
  receteTalepleri:{all:async()=>db.receteTalepleri,save:async(v)=>{db.receteTalepleri=v;}},
  receteler:{all:async()=>db.receteler,save:async(v)=>{db.receteler=v;}},
};
let _rol='operator_ahmet';
global.App={uid:(p)=>p+'-'+Math.random().toString(36).slice(2,7),persist:async(fn)=>fn(),aktifRol:()=>_rol};
eval(src.replace('const ReceteTalep','global.ReceteTalep'));

let ok=0,bad=0;const t=(a,k,x)=>{if(k){ok++;console.log('  GECTI '+a);}else{bad++;console.log('  KALDI '+a+(x!==undefined?' -> '+JSON.stringify(x):''));}};

(async()=>{
  console.log('\n-- 1) EKSIK MALZEME: operator reçetede olmayani ekler --');
  _rol='operator_ahmet';
  let r=await ReceteTalep.eksikMalzemeTalep({ymId:'YM-100',ymKod:'DX.034',ymAd:'Gergi Saci',hammaddeId:'HM-BANT',hammaddeAd:'Cift Tarafli Bant',miktar:2,birim:'METRE',gerekce:'Montajda kullanildi'});
  t('eksik malzeme talebi olustu', r.ok);
  t('durum planlama_bekliyor', r.talep.durum==='planlama_bekliyor');
  t('operator kaydedildi', r.talep.operator==='operator_ahmet');
  t('hammadde yoksa red', (await ReceteTalep.eksikMalzemeTalep({ymId:'YM-100',miktar:1})).ok===false);

  const tid=r.talep.id;
  console.log('\n-- 2) GÖREV AYRILIĞI: operator kendi talebini onaylayamaz --');
  let o=await ReceteTalep.planlamaOnayla(tid,'operator_ahmet');
  t('operator kendi talebini onaylayamaz', o.ok===false && o.hata.includes('Görev ayrılığı'));

  console.log('\n-- 3) PLANLAMA ONAYI (1. kademe) --');
  let p=await ReceteTalep.planlamaOnayla(tid,'planlama_mehmet');
  t('planlama onayladi', p.ok && p.talep.durum==='arge_teknik_bekliyor');
  t('planlamaOnay kaydedildi', p.talep.planlamaOnay.kim==='planlama_mehmet');
  // Planlama onaylamadan arge onaylayamaz kontrolu (yeni talep)
  let r2=await ReceteTalep.eksikMalzemeTalep({ymId:'YM-100',hammaddeId:'HM-X',hammaddeAd:'X',miktar:1,birim:'adet',gerekce:'test'});
  let atlaTest=await ReceteTalep.argeTeknikOnayla(r2.talep.id,'arge_veli');
  t('planlama atlanamaz (once planlama)', atlaTest.ok===false);

  console.log('\n-- 4) ÜÇ GÖZ: arge onayi planlamadan da farkli olmali --');
  let uc=await ReceteTalep.argeTeknikOnayla(tid,'planlama_mehmet');
  t('arge onayi = planlama onayi REDDEDILIR', uc.ok===false && uc.hata.includes('Üç göz'));

  console.log('\n-- 5) ARGE/TEKNİK ONAYI → REÇETEYE İŞLEME --');
  const kalemOnce=db.receteler.find(r=>r.yarimamulId==='YM-100').kalemler.length;
  let a=await ReceteTalep.argeTeknikOnayla(tid,'arge_veli');
  t('arge/teknik onayladi', a.ok && a.talep.durum==='receteye_islendi');
  const recete=db.receteler.find(r=>r.yarimamulId==='YM-100');
  t('reçeteye alt kalem EKLENDI', recete.kalemler.length===kalemOnce+1);
  const yeniKalem=recete.kalemler[recete.kalemler.length-1];
  t('eklenen kalem dogru hammadde', yeniKalem.refId==='HM-BANT');
  t('eklenen kalem kaynak=hat_talebi (izlenebilir)', yeniKalem.kaynak==='hat_talebi');
  t('eklenen kalem talebe bagli', yeniKalem.talepId===tid);
  t('talep receteKalemId aldi', a.talep.receteKalemId===yeniKalem.id);

  console.log('\n-- 6) KART TALEBİ: hammadde listesinde de yok --');
  _rol='operator_ahmet';
  let k=await ReceteTalep.kartTalep({ymId:'YM-100',ymKod:'DX.034',ymAd:'Gergi Saci',kartAciklama:'3M seffaf montaj bandi 12mm rulo',miktar:1,birim:'rulo',gerekce:'Yeni malzeme'});
  t('kart talebi olustu', k.ok);
  t('kart aciklamasi bos ise red', (await ReceteTalep.kartTalep({ymId:'YM-100',kartAciklama:''})).ok===false);
  // Kart talebi kart baglanmadan reçeteye islenemez
  await ReceteTalep.planlamaOnayla(k.talep.id,'planlama_mehmet');
  let kartIsle=await ReceteTalep.argeTeknikOnayla(k.talep.id,'arge_veli');
  t('kart baglanmadan reçeteye islenemez', kartIsle.ok===false && kartIsle.hata.includes('kart'));
  // Kart baglanir, sonra islenir
  await ReceteTalep.karteHammaddeBagla(k.talep.id,'HM-YENI','3M Bant');
  let kartIsle2=await ReceteTalep.argeTeknikOnayla(k.talep.id,'arge_veli');
  t('kart baglaninca reçeteye islenir', kartIsle2.ok && kartIsle2.talep.durum==='receteye_islendi');

  console.log('\n-- 7) RED --');
  _rol='operator_ahmet';
  let rr=await ReceteTalep.eksikMalzemeTalep({ymId:'YM-100',hammaddeId:'HM-Z',hammaddeAd:'Z',miktar:5,birim:'adet',gerekce:'test'});
  let red=await ReceteTalep.reddet(rr.talep.id,'planlama_mehmet','Zaten recetede benzeri var');
  t('reddedildi', red.ok && red.talep.durum==='reddedildi');
  t('reddedilen islenemez', (await ReceteTalep.planlamaOnayla(rr.talep.id,'planlama_mehmet')).ok===false);


  console.log('\n-- 8) GERİ ÇEKME (operatör kendi bekleyen talebi) --');
  _rol='operator_ahmet';
  let gc=await ReceteTalep.eksikMalzemeTalep({ymId:'YM-100',hammaddeId:'HM-G',hammaddeAd:'G',miktar:3,birim:'adet',gerekce:'test',operator:'operator_ahmet'});
  t('geri cek: bekleyen talep silinir', (await ReceteTalep.talepGeriCek(gc.talep.id,'operator_ahmet')).ok===true);
  let gc2=await ReceteTalep.eksikMalzemeTalep({ymId:'YM-100',hammaddeId:'HM-H',hammaddeAd:'H',miktar:1,birim:'adet',gerekce:'test',operator:'operator_ahmet'});
  await ReceteTalep.planlamaOnayla(gc2.talep.id,'planlama_mehmet');
  t('onaylanmis talep geri cekilEMEZ', (await ReceteTalep.talepGeriCek(gc2.talep.id,'operator_ahmet')).ok===false);
  let gc3=await ReceteTalep.eksikMalzemeTalep({ymId:'YM-100',hammaddeId:'HM-I',hammaddeAd:'I',miktar:1,birim:'adet',gerekce:'test',operator:'operator_ahmet'});
  t('baskasi geri cekEMEZ', (await ReceteTalep.talepGeriCek(gc3.talep.id,'baskasi')).ok===false);

  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');
  process.exit(bad?1:0);
})();
