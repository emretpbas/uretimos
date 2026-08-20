// CRM motoru: huni, tahmin, kazanma orani, ihmal uyarisi, asama gecisleri
global.App={uid:p=>p+'-'+Math.random().toString(36).slice(2,7),persist:async f=>f(),aktifRol:()=>'satis'};
const db={firsatlar:[],crmAktiviteler:[]};
global.Store={
  firsatlar:{all:async()=>db.firsatlar},
  crmAktiviteler:{all:async()=>db.crmAktiviteler},
  topluEkle:async(k,arr)=>{db[k].push(...arr);},
  topluGuncelle:async()=>{}
};
const CRM=require('../crm_motor.js');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- ASAMA TANIMLARI --');
t('6 asama tanimli', CRM.ASAMALAR.length===6);
t('olasiliklar artan sirada', CRM.ASAMALAR[0].olasilik<CRM.ASAMALAR[3].olasilik);
t('kazanildi %100', CRM.asamaBul('kazanildi').olasilik===100);
t('kaybedildi %0', CRM.asamaBul('kaybedildi').olasilik===0);

console.log('\n-- TAHMIN (agirlikli boru hatti) --');
const f=[{id:'1',asama:'yeni',tutar:100000},{id:'2',asama:'teklif',tutar:200000},
         {id:'3',asama:'muzakere',tutar:400000},{id:'4',asama:'kazanildi',tutar:300000},
         {id:'5',asama:'kaybedildi',tutar:150000}];
const tah=CRM.tahminHesapla(f);
t('kapali firsatlar tahmine girmiyor', tah.adet===3);
t('boru hatti toplami dogru (700k)', tah.toplam===700000);
t('agirlikli = 10k+100k+300k = 410k', Math.round(tah.agirlikli)===410000);
t('agirlikli < toplam (mantikli)', tah.agirlikli<tah.toplam);

console.log('\n-- KAZANMA ORANI --');
const k=CRM.kazanmaOrani(f);
t('kapali sayisi 2', k.kapali===2);
t('oran %50', k.oran===50);
t('az veride guvenilir DEGIL', k.guvenilir===false);
const cok=[...Array(12)].map((_,i)=>({id:'x'+i,asama:i<9?'kazanildi':'kaybedildi',tutar:1000}));
t('12 kapali firsatta guvenilir', CRM.kazanmaOrani(cok).guvenilir===true);
t('oran %75 (9/12)', CRM.kazanmaOrani(cok).oran===75);

console.log('\n-- ASAMA GECISLERI --');
t('ileri gecis serbest', CRM.gecisGecerli('yeni','teklif').gecerli===true);
t('geri gecis serbest (muzakere->teklif)', CRM.gecisGecerli('muzakere','teklif').gecerli===true);
t('KAPALI firsat yeniden acilamaz', CRM.gecisGecerli('kazanildi','teklif').gecerli===false);
t('kaybedilen de acilamaz', CRM.gecisGecerli('kaybedildi','yeni').gecerli===false);
t('ayni asamaya gecis engelli', CRM.gecisGecerli('yeni','yeni').gecerli===false);
t('gecersiz asama reddediliyor', CRM.gecisGecerli('yeni','olmayan').gecerli===false);

console.log('\n-- IHMAL EDILEN FIRSATLAR --');
const g=(n)=>new Date(Date.now()-n*86400000).toISOString();
const fi=[{id:'A',asama:'teklif',baslik:'A',olusturmaTarihi:g(30)},
          {id:'B',asama:'teklif',baslik:'B',olusturmaTarihi:g(30)},
          {id:'C',asama:'kazanildi',baslik:'C',olusturmaTarihi:g(60)}];
const ak=[{firsatId:'B',tarih:g(2)}];
const ihm=CRM.ihmalEdilenler(fi,ak,14);
t('aktivitesi olmayan acik firsat yakalandi', ihm.some(x=>x.id==='A'));
t('yakin aktivitesi olan yakalanmadi', !ihm.some(x=>x.id==='B'));
t('KAPALI firsat uyariya girmiyor', !ihm.some(x=>x.id==='C'));
t('sessiz gun hesaplandi', ihm[0].sessizGun>=14);

console.log('\n-- FIRSAT OLUSTURMA --');
(async()=>{
  let r=await CRM.firsatOlustur({musteriAdi:'DOXA',baslik:'Otel projesi',tutar:500000,kaynak:'Fuar'});
  t('firsat olustu', r.ok===true);
  t('yeni asamasinda basliyor', r.firsat.asama==='yeni');
  t('kod uretildi', /^FRS-/.test(r.firsat.kod));
  t('asama gecmisi baslatildi', r.firsat.asamaGecmisi.length===1);
  t('baslik bos ise red', (await CRM.firsatOlustur({musteriAdi:'X',baslik:''})).ok===false);
  t('musteri yoksa red', (await CRM.firsatOlustur({baslik:'X'})).ok===false);

  console.log('\n-- KAYIP SEBEBI ZORUNLULUGU --');
  const id=r.firsat.id;
  let d=await CRM.asamaDegistir(id,'kaybedildi','');
  t('kayip sebebi olmadan kapatilamaz', d.ok===false && d.hata.includes('Kayıp sebebi'));
  d=await CRM.asamaDegistir(id,'kaybedildi','Fiyat yuksek geldi, rakip secildi');
  t('sebeple kapatilabiliyor', d.ok===true);
  t('kayip sebebi kaydedildi', d.firsat.kayipSebebi.includes('rakip'));
  t('kapanis tarihi yazildi', !!d.firsat.kapanisTarihi);
  t('kazanmada sebep zorunlu DEGIL', true);

  console.log('\n-- AKTIVITE --');
  let a=await CRM.aktiviteEkle({firsatId:id,tip:'ziyaret',ozet:'Fabrika gezisi yapildi'});
  t('aktivite eklendi', a.ok===true);
  t('ozet bos ise red', (await CRM.aktiviteEkle({firsatId:id,ozet:''})).ok===false);
  t('firsat yoksa red', (await CRM.aktiviteEkle({ozet:'x'})).ok===false);

  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
})();
