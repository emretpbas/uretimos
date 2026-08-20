// Pazarlama motoru: kampanya gecerliligi, fiyat uygulama, numune donus orani
global.App={uid:p=>p+'-'+Math.random().toString(36).slice(2,7),persist:async f=>f(),aktifRol:()=>'pazarlama'};
const db={kampanyalar:[],numuneler:[],fiyatListeleri:[]};
global.Store={
  kampanyalar:{all:async()=>db.kampanyalar}, numuneler:{all:async()=>db.numuneler},
  fiyatListeleri:{all:async()=>db.fiyatListeleri},
  topluEkle:async(k,a)=>{db[k].push(...a)}, topluGuncelle:async()=>{}
};
const P=require('../pazarlama_motor.js');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- KAMPANYA GECERLILIGI --');
const k={durum:'aktif',tip:'yuzde_indirim',deger:15,segment:'Bayi',baslangic:'2026-08-01',bitis:'2026-08-31'};
t('donem ici + dogru segment', P.gecerliMi(k,'2026-08-15','Bayi')===true);
t('donem oncesi red', P.gecerliMi(k,'2026-07-31','Bayi')===false);
t('donem sonrasi red', P.gecerliMi(k,'2026-09-01','Bayi')===false);
t('ilk gun DAHIL', P.gecerliMi(k,'2026-08-01','Bayi')===true);
t('son gun DAHIL', P.gecerliMi(k,'2026-08-31','Bayi')===true);
t('farkli segment red', P.gecerliMi(k,'2026-08-15','Perakende')===false);
t('pasif kampanya red', P.gecerliMi({...k,durum:'pasif'},'2026-08-15','Bayi')===false);
t('Tumu segmenti herkese acik', P.gecerliMi({...k,segment:'Tümü'},'2026-08-15','Perakende')===true);
t('tarihsiz kampanya surekli gecerli', P.gecerliMi({durum:'aktif',segment:'Tümü'},'2030-01-01','Bayi')===true);

console.log('\n-- FIYAT UYGULAMA --');
let f=P.fiyatUygula(1000,k);
t('%15 indirim -> 850', f.fiyat===850);
t('indirim tutari 150', f.indirim===150);
f=P.fiyatUygula(1000,{tip:'tutar_indirim',deger:250});
t('tutar indirimi -> 750', f.fiyat===750);
f=P.fiyatUygula(100,{tip:'tutar_indirim',deger:500});
t('indirim fiyati asamaz (0 alti yok)', f.fiyat===0);
f=P.fiyatUygula(1000,{tip:'hediye',deger:1});
t('hediye fiyati degistirmiyor', f.fiyat===1000);
f=P.fiyatUygula(1000,{tip:'vade',deger:60});
t('vade fiyati degistirmiyor', f.fiyat===1000);
t('kampanya yoksa fiyat aynen', P.fiyatUygula(1000,null).fiyat===1000);

console.log('\n-- KAMPANYA CAKISMA (en avantajli secilir) --');
const kmp=[{durum:'aktif',tip:'yuzde_indirim',deger:10,ad:'A',segment:'Tümü'},
           {durum:'aktif',tip:'yuzde_indirim',deger:25,ad:'B',segment:'Tümü'},
           {durum:'pasif',tip:'yuzde_indirim',deger:40,ad:'C',segment:'Tümü'}];
const gec=P.gecerliKampanyalar(kmp,'2026-08-15','Bayi');
t('pasif olan haric (2 gecerli)', gec.length===2);
t('en yuksek indirim once', gec[0].ad==='B');
t('kampanyalar UST USTE BINMIYOR', P.fiyatUygula(1000,gec[0]).fiyat===750);

console.log('\n-- FIYAT LISTESI oncelik --');
const fl=[{segment:'Bayi',durum:'aktif',ad:'Bayi 2026',kalemler:[{urunId:'U1',fiyat:800}]},
          {segment:'Tümü',durum:'aktif',ad:'Genel',kalemler:[{urunId:'U1',fiyat:1000},{urunId:'U2',fiyat:500}]}];
t('segment listesi oncelikli', P.listeFiyatBul(fl,'U1','Bayi').fiyat===800);
t('segmentte yoksa Tumu ye duser', P.listeFiyatBul(fl,'U2','Bayi').fiyat===500);
t('hicbirinde yoksa null', P.listeFiyatBul(fl,'U9','Bayi')===null);
t('pasif liste kullanilmiyor', P.listeFiyatBul([{segment:'Bayi',durum:'pasif',kalemler:[{urunId:'U1',fiyat:1}]}],'U1','Bayi')===null);

console.log('\n-- NUMUNE DONUS ORANI --');
const n=[{durum:'siparise_dondu',siparisTutari:50000,maliyet:500},
         {durum:'siparise_dondu',siparisTutari:30000,maliyet:400},
         {durum:'olumsuz',maliyet:300},
         {durum:'gonderildi',maliyet:200}];
const d=P.numuneDonusOrani(n);
t('toplam 4', d.toplam===4);
t('bekleyen 1 (sonuclanmamis)', d.bekleyen===1);
t('sonuclanan 3', d.sonuclanan===3);
t('oran %67 (2/3)', Math.round(d.oran)===67);
t('BEKLEYEN orana dahil DEGIL', d.oran > 50);
t('maliyet toplami 1400', d.maliyet===1400);
t('donen siparis 80000', d.donenSiparis===80000);
t('az veride guvenilir degil', d.guvenilir===false);

console.log('\n-- TAKIP BEKLEYENLER --');
const g=(x)=>new Date(Date.now()-x*86400000).toISOString().slice(0,10);
const nn=[{id:'1',durum:'gonderildi',gonderimTarihi:g(30),urunAdi:'A'},
          {id:'2',durum:'gonderildi',gonderimTarihi:g(5),urunAdi:'B'},
          {id:'3',durum:'siparise_dondu',gonderimTarihi:g(60),urunAdi:'C'}];
const tk=P.takipBekleyenler(nn,21);
t('30 gunluk yakalandi', tk.some(x=>x.id==='1'));
t('5 gunluk yakalanmadi', !tk.some(x=>x.id==='2'));
t('SONUCLANMIS numune uyariya girmiyor', !tk.some(x=>x.id==='3'));

(async()=>{
console.log('\n-- KAMPANYA OLUSTURMA --');
let r=await P.kampanyaOlustur({ad:'Bahar',tip:'yuzde_indirim',deger:15,segment:'Bayi'});
t('kampanya olustu', r.ok===true);
t('kod uretildi', /^KMP-/.test(r.kampanya.kod));
t('ad bos ise red', (await P.kampanyaOlustur({ad:'',tip:'yuzde_indirim'})).ok===false);
t('%100 ustu indirim red', (await P.kampanyaOlustur({ad:'X',tip:'yuzde_indirim',deger:150})).ok===false);
t('bitis baslangictan once ise red',
  (await P.kampanyaOlustur({ad:'X',tip:'yuzde_indirim',deger:10,baslangic:'2026-09-01',bitis:'2026-08-01'})).ok===false);

console.log('\n-- NUMUNE AKISI --');
let nr=await P.numuneGonder({musteriAdi:'DOXA',urunAdi:'Titan ayak',adet:2,maliyet:500});
t('numune kaydedildi', nr.ok===true);
t('hazirlaniyor durumunda', nr.numune.durum==='hazirlaniyor');
t('urun bos ise red', (await P.numuneGonder({musteriAdi:'X',urunAdi:''})).ok===false);
const nid=nr.numune.id;
let u=await P.numuneDurumGuncelle(nid,'gonderildi',{});
t('gonderildi isaretlendi', u.ok===true);
t('gonderim tarihi otomatik yazildi', !!u.numune.gonderimTarihi);
t('OLUMSUZ ta geri bildirim ZORUNLU', (await P.numuneDurumGuncelle(nid,'olumsuz',{geriBildirim:''})).ok===false);
t('SIPARISE DONDU de tutar ZORUNLU', (await P.numuneDurumGuncelle(nid,'siparise_dondu',{siparisTutari:0})).ok===false);
u=await P.numuneDurumGuncelle(nid,'siparise_dondu',{siparisTutari:45000});
t('tutarla siparise donus kaydedildi', u.ok===true && u.numune.siparisTutari===45000);
t('gecersiz durum reddediliyor', (await P.numuneDurumGuncelle(nid,'olmayan',{})).ok===false);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
})();
