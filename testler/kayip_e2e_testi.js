// Uctan uca: talep -> onay -> teslim, ve stok hareketine SAHIPLI kayit.
const fs=require('fs'); let src=fs.readFileSync('../kayip_kacak.js','utf8');
// Sahte Store + App
const db={malzemeTalepleri:[],stokHareketleri:[]};
global.Store={
  malzemeTalepleri:{all:async()=>db.malzemeTalepleri,save:async(v)=>{db.malzemeTalepleri=v;}},
  stokHareketleri:{all:async()=>db.stokHareketleri,save:async(v)=>{db.stokHareketleri=v;}},
};
let _rol='ahmet';
global.App={uid:(p)=>p+'-'+Math.random().toString(36).slice(2,8),persist:async(fn)=>fn(),aktifRol:()=>_rol};
eval(src.replace('const KayipKacak','global.KayipKacak'));

let ok=0,bad=0;const t=(a,k,x)=>{if(k){ok++;console.log('  GECTI '+a);}else{bad++;console.log('  KALDI '+a+(x!==undefined?' -> '+JSON.stringify(x):''));}};

(async()=>{
  console.log('\n-- UCTAN UCA: normal tek onay --');
  _rol='ahmet';
  let r=await KayipKacak.talepOlustur({kalemAdi:'Suntalam 18mm',miktar:5,birim:'M2',kayipTipi:'fire',gerekce:'Kesim hatasi',tahminiTutar:2000});
  t('talep olustu', r.ok);
  t('durum beklemede', r.talep.durum==='beklemede');
  t('talepEden ahmet', r.talep.talepEden==='ahmet');
  t('gerekce zorunlu bos ise red', (await KayipKacak.talepOlustur({kalemAdi:'x',miktar:1,kayipTipi:'fire',gerekce:''})).ok===false);

  const tid=r.talep.id;
  // Ahmet kendi talebini onaylamaya calisir -> GOREV AYRILIGI engeli
  let o=await KayipKacak.onayla(tid,'ahmet');
  t('ahmet kendi talebini ONAYLAYAMAZ', o.ok===false && o.hata.includes('kendisi onaylayamaz'));
  // Mehmet onaylar
  o=await KayipKacak.onayla(tid,'mehmet');
  t('mehmet onaylar', o.ok===true && o.talep.durum==='onaylandi');
  t('onaylayan mehmet', o.talep.onaylayan==='mehmet');

  // Teslim
  let te=await KayipKacak.teslimEt(tid,'depo_veli');
  t('teslim edildi', te.ok && te.talep.durum==='teslim_edildi');
  // Stok hareketi SAHIPLI mi?
  const hrk=db.stokHareketleri[db.stokHareketleri.length-1];
  t('stok hareketi olustu', !!hrk && hrk.tip==='cikis');
  t('hareket talepEden tasiyor', hrk.talepEden==='ahmet');
  t('hareket onaylayan tasiyor', hrk.onaylayan==='mehmet');
  t('hareket teslimEden tasiyor', hrk.teslimEden==='depo_veli');
  t('hareket kayipTipi tasiyor', hrk.kayipTipi==='fire');

  console.log('\n-- ÇİFT ONAY (>=50.000) --');
  _rol='ali';
  let b=await KayipKacak.talepOlustur({kalemAdi:'MDF Lam',miktar:100,birim:'M2',kayipTipi:'hasar',gerekce:'Su hasari',tahminiTutar:80000});
  t('cift onay gerekli isaretlendi', b.talep.ciftOnayGerekli===true);
  const bid=b.talep.id;
  let o1=await KayipKacak.onayla(bid,'mehmet');
  t('ilk onay -> ikinci bekliyor', o1.ok && o1.ikinciOnayBekliyor===true);
  t('ilk onaydan sonra hala beklemede', db.malzemeTalepleri.find(x=>x.id===bid).durum==='beklemede');
  // Ayni kisi ikinci onay veremez
  let o2=await KayipKacak.onayla(bid,'mehmet');
  t('ayni kisi ikinci onay VEREMEZ', o2.ok===false);
  // Farkli kisi ikinci onay
  let o3=await KayipKacak.onayla(bid,'veli');
  t('farkli kisi ikinci onay -> onaylandi', o3.ok && o3.talep.durum==='onaylandi');

  console.log('\n-- RED --');
  _rol='ahmet';
  let rr=await KayipKacak.talepOlustur({kalemAdi:'Vida',miktar:1000,birim:'adet',kayipTipi:'kayip',gerekce:'Sayimda eksik',tahminiTutar:500});
  let red=await KayipKacak.reddet(rr.talep.id,'mehmet','Gerekce yetersiz, tutanak yok');
  t('red edildi', red.ok && red.talep.durum==='reddedildi');
  t('red sebebi kaydedildi', red.talep.redSebebi.includes('tutanak'));
  // Reddedilen teslim edilemez
  let ted=await KayipKacak.teslimEt(rr.talep.id,'veli');
  t('reddedilen teslim EDILEMEZ', ted.ok===false);

  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');
  process.exit(bad?1:0);
})();
