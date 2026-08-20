// Proje motoru: ilerleme, hakedis (mukerrer koruma), revizyon, termin, karlilik
global.App={uid:p=>p+'-'+Math.random().toString(36).slice(2,7),persist:async f=>f(),aktifRol:()=>'satis'};
const db={projeler:[]};
global.Store={projeler:{all:async()=>db.projeler},
  topluEkle:async(k,a)=>{db[k].push(...a)}, topluGuncelle:async()=>{}};
const P=require('../proje_motor.js');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- ILERLEME HESABI (agirlikli) --');
const mk=(as)=>({sozlesmeBedeli:1000000,asamalar:as,hakedisler:[]});
t('bos projede %0', P.ilerlemeHesapla(mk([])).yuzde===0);
t('tek asama %100 -> %100', P.ilerlemeHesapla(mk([{agirlik:100,tamamlanmaYuzdesi:100}])).yuzde===100);
let pr=mk([{agirlik:30,tamamlanmaYuzdesi:100},{agirlik:40,tamamlanmaYuzdesi:50},{agirlik:30,tamamlanmaYuzdesi:0}]);
t('agirlikli: 30+20 = %50', P.ilerlemeHesapla(pr).yuzde===50);
t('tamamlanan asama sayisi 1', P.ilerlemeHesapla(pr).tamamlanan===1);
t('agirliklar 100 degilse oranti korunur',
  P.ilerlemeHesapla(mk([{agirlik:50,tamamlanmaYuzdesi:100},{agirlik:50,tamamlanmaYuzdesi:0}])).yuzde===50);

console.log('\n-- HAKEDIS (mukerrer fatura korumasi) --');
let p2={sozlesmeBedeli:1000000,revizyonFarki:0,hakedisler:[]};
let h=P.hakedisHesapla(p2,30);
t('ilk hakedis %30 -> 300k', h.tutar===300000);
p2.hakedisler=[{tutar:300000}];
h=P.hakedisHesapla(p2,50);
t('ikinci hakedis SADECE FARK (200k)', h.tutar===200000);
t('kumulatif oran %50', Math.round(h.kumulatifOran)===50);
p2.hakedisler=[{tutar:300000},{tutar:200000}];
h=P.hakedisHesapla(p2,50);
t('ilerleme artmadiysa tutar 0', h.tutar===0);
t('gecersiz isaretlendi', h.gecerli===false);
p2.revizyonFarki=200000;
h=P.hakedisHesapla(p2,50);
t('revizyon bedele ekleniyor (1.2M x %50 - 500k)', h.tutar===100000);

console.log('\n-- TERMIN RISKI --');
const g=(n)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
let tr=P.terminRiski({baslangic:g(-50),bitis:g(50),asamalar:[{agirlik:100,tamamlanmaYuzdesi:50}]});
t('zaman %50 is %50 -> iyi', tr.seviye==='iyi');
tr=P.terminRiski({baslangic:g(-80),bitis:g(20),asamalar:[{agirlik:100,tamamlanmaYuzdesi:40}]});
t('zaman %80 is %40 -> kritik', tr.seviye==='kritik');
tr=P.terminRiski({baslangic:g(-65),bitis:g(35),asamalar:[{agirlik:100,tamamlanmaYuzdesi:50}]});
t('zaman %65 is %50 -> riskli', tr.seviye==='riskli');
tr=P.terminRiski({baslangic:g(-100),bitis:g(-10),asamalar:[{agirlik:100,tamamlanmaYuzdesi:80}]});
t('sure dolmus ve bitmemis -> gecikti', tr.gecikti===true);
t('tarih yoksa null', P.terminRiski({asamalar:[]})===null);

console.log('\n-- KARLILIK --');
const k=P.karlilik({sozlesmeBedeli:1000000,revizyonFarki:100000,digerGiderler:50000},{uretim:400000,malzeme:300000});
t('gelir = sozlesme + revizyon', k.bedel===1100000);
t('maliyet = uretim+malzeme+diger', k.toplamMaliyet===750000);
t('kar = 350k', k.kar===350000);
t('marj %31.8', Math.abs(k.marj-31.818)<0.01);
t('bedel 0 ise marj null', P.karlilik({sozlesmeBedeli:0},{}).marj===null);

(async()=>{
  console.log('\n-- PROJE OLUSTURMA --');
  let r=await P.projeOlustur({ad:'Grand Hotel 120 oda',musteriAdi:'DOXA',sozlesmeBedeli:5000000,baslangic:'2026-09-01',bitis:'2027-03-01'});
  t('proje olustu', r.ok===true);
  t('7 varsayilan asama', r.proje.asamalar.length===7);
  t('asama agirliklari toplami 100', r.proje.asamalar.reduce((a,x)=>a+x.agirlik,0)===100);
  t('kod uretildi', /^PRJ-/.test(r.proje.kod));
  t('planlaniyor durumunda', r.proje.durum==='planlaniyor');
  t('ad bos ise red', (await P.projeOlustur({ad:'',musteriAdi:'X'})).ok===false);
  t('musteri yoksa red', (await P.projeOlustur({ad:'X'})).ok===false);

  console.log('\n-- ASAMA GUNCELLEME --');
  const id=r.proje.id;
  let u=await P.asamaGuncelle(id,'tasarim',{tamamlanmaYuzdesi:100});
  t('asama guncellendi', u.ok===true);
  t('durum otomatik devam a gecti', u.proje.durum==='devam');
  t('yuzde 0-100 disi reddediliyor', (await P.asamaGuncelle(id,'tasarim',{tamamlanmaYuzdesi:150})).ok===false);
  t('olmayan asama reddediliyor', (await P.asamaGuncelle(id,'yok',{tamamlanmaYuzdesi:50})).ok===false);

  console.log('\n-- REVIZYON --');
  let rv=await P.revizyonEkle(id,{baslik:'Kapak rengi degisikligi',fiyatFarki:150000,gerekce:'Musteri talebi'});
  t('revizyon eklendi', rv.ok===true);
  t('revizyon farki projeye islendi', rv.proje.revizyonFarki===150000);
  t('gerekce zorunlu', (await P.revizyonEkle(id,{baslik:'X',fiyatFarki:1000,gerekce:''})).ok===false);
  t('baslik zorunlu', (await P.revizyonEkle(id,{baslik:'',gerekce:'x'})).ok===false);
  rv=await P.revizyonEkle(id,{baslik:'Iptal edilen dolaplar',fiyatFarki:-50000,gerekce:'Kapsam daraldi'});
  t('negatif fark (azalis) kabul ediliyor', rv.proje.revizyonFarki===100000);

  console.log('\n-- HAKEDIS OLUSTURMA --');
  let hk=await P.hakedisOlustur(id,{aciklama:'1. hakedis'});
  t('hakedis olusturuldu', hk.ok===true);
  t('no 1 den basliyor', hk.hakedis.no===1);
  t('tutar ilerlemeye gore', hk.hakedis.tutar>0);
  let hk2=await P.hakedisOlustur(id,{aciklama:'2. hakedis'});
  t('ilerleme artmadan ikinci hakedis ENGELLENDI', hk2.ok===false);

  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
})();
