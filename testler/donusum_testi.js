// CRM -> Proje / Teklif donusum zinciri (cift yonlu izlenebilirlik)
global.App={uid:p=>p+'-'+Math.random().toString(36).slice(2,7),persist:async f=>f(),aktifRol:()=>'satis'};
const db={firsatlar:[],projeler:[],crmAktiviteler:[]};
global.Store={
  firsatlar:{all:async()=>db.firsatlar}, projeler:{all:async()=>db.projeler},
  crmAktiviteler:{all:async()=>db.crmAktiviteler},
  topluEkle:async(k,a)=>{db[k].push(...a)}, topluGuncelle:async()=>{}
};
global.ProjeMotor=require('../proje_motor.js');
const CRM=require('../crm_motor.js');
const fs=require('fs'),path=require('path');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

(async()=>{
console.log('\n-- FIRSAT -> PROJE --');
let r=await CRM.firsatOlustur({musteriAdi:'DOXA',baslik:'Grand Hotel 120 oda',tutar:5000000,kaynak:'İhale'});
const fid=r.firsat.id;
let d=await CRM.projeyeDonustur(fid,{});
t('ACIK firsat projeye donusturulemez', d.ok===false && d.hata.includes('KAZANILAN'));
await CRM.asamaDegistir(fid,'kazanildi');
d=await CRM.projeyeDonustur(fid,{baslangic:'2026-09-01',bitis:'2027-03-01'});
t('kazanilan firsat projeye donustu', d.ok===true);
t('proje adi firsattan geldi', d.proje.ad==='Grand Hotel 120 oda');
t('sozlesme bedeli firsat tutari', d.proje.sozlesmeBedeli===5000000);
t('musteri tasindi', d.proje.musteriAdi==='DOXA');
t('projede firsatId var (geri iz)', d.proje.firsatId===fid);
t('firsatta projeId var (ileri iz)', d.firsat.projeId===d.proje.id);
t('varsayilan asamalar olustu', d.proje.asamalar.length===7);
const tekrar=await CRM.projeyeDonustur(fid,{});
t('AYNI firsattan ikinci proje acilamaz', tekrar.ok===false && tekrar.hata.includes('zaten'));

console.log('\n-- FIRSAT -> TEKLIF --');
let r2=await CRM.firsatOlustur({musteriAdi:'CANAKCILAR',baslik:'Ofis mobilyasi',tutar:250000});
const fid2=r2.firsat.id;
let th=await CRM.teklifeHazirla(fid2);
t('acik firsattan teklif taslagi hazirlandi', th.ok===true);
t('taslak musteri tasiyor', th.taslak.musteriAdi==='CANAKCILAR');
t('taslak firsatId tasiyor', th.taslak.firsatId===fid2);
t('taslak kalem TASIMIYOR (satis girecek)', Array.isArray(th.taslak.kalemler) && th.taslak.kalemler.length===0);

console.log('\n-- TEKLIF GERI BAGLAMA --');
let tb=await CRM.teklifBagla(fid2,'TKF-1','TKF-ABC123');
t('teklif baglandi', tb.ok===true);
t('firsatta teklif kodu var', tb.firsat.teklifKod==='TKF-ABC123');
t('asama otomatik TEKLIF e ilerledi', tb.firsat.asama==='teklif');
t('asama gecmisine yazildi', tb.firsat.asamaGecmisi.some(x=>x.gerekce&&x.gerekce.includes('TKF-ABC123')));
// Muzakeredeki firsat GERIYE gitmemeli
let r3=await CRM.firsatOlustur({musteriAdi:'X',baslik:'Y',tutar:1000});
await CRM.asamaDegistir(r3.firsat.id,'muzakere');
let tb2=await CRM.teklifBagla(r3.firsat.id,'TKF-2','TKF-XYZ');
t('muzakeredeki firsat GERIYE gitmiyor', tb2.firsat.asama==='muzakere');
t('ama teklif kodu yine de baglandi', tb2.firsat.teklifKod==='TKF-XYZ');
t('kapanmis firsattan teklif hazirlanamaz', (await CRM.teklifeHazirla(fid)).ok===false);

console.log('\n-- EKRAN BAGLANTILARI --');
const crm=fs.readFileSync(path.join(__dirname,'..','page_crm.js'),'utf8');
const prj=fs.readFileSync(path.join(__dirname,'..','page_proje.js'),'utf8');
const tkf=fs.readFileSync(path.join(__dirname,'..','page_teklif.js'),'utf8');
t('CRM de projeye donustur butonu', crm.includes('fd-projeye'));
t('CRM de teklif hazirla butonu', crm.includes('fd-teklife'));
t('proje acilmissa buton yerine link', crm.includes('fd-proje-git'));
t('teklif ekrani taslagi okuyor', tkf.includes('crm_teklif_taslak'));
t('taslak bir kez okunup siliniyor', tkf.includes('removeItem'));
t('teklif kaydinda firsatId var', /firsatId: d\.firsatId/.test(tkf));
t('teklif kaydedilince CRM e geri baglaniyor', tkf.includes('CRM.teklifBagla'));
t('geri baglama hatasi teklifi bozmuyor', /teklifBagla[\s\S]{0,120}catch/.test(tkf));
t('projede kaynak firsat rozeti', prj.includes('CRM fırsatından geldi'));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
})();
