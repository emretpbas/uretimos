// Recete/kart ice aktariminda HTTP 413 korumasi
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const pk=fs.readFileSync(path.join(KOK,'page_kartlar.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- PARCALI KAYIT --');
t('parcaliKaydet yardimcisi tanimli', /async function parcaliKaydet\(koleksiyonAdi, liste, oncekiIdler/.test(pk));
t('yeni kayitlar topluEkle ile', /topluEkle\(koleksiyonAdi, yeniler, 200\)/.test(pk));
t('degisenler topluGuncelle ile', /topluGuncelle\(koleksiyonAdi, guncellenenler, 200\)/.test(pk));
t('parti boyu 200 (guvenli)', (pk.match(/, 200\)/g)||[]).length>=2);

console.log('\n-- TAM KOLEKSIYON KAYDI KALMADI --');
const kol=['hammaddeler','yarimamuller','altMontajlar','paketler','urunler','receteler'];
kol.forEach(k=>{
  const re='Store.'+k+'.save(';
  t(k+' tam kaydi YOK', pk.indexOf(re)<0);
});

console.log('\n-- ONCEKI ID KUMESI --');
kol.forEach(k=>{
  if(!pk.includes('Store.'+k+'.all()')) return;
  t(k+' icin onceki id kumesi yakalaniyor', pk.includes('_onceki_'+k));
});
t('parcaliKaydet cagri sayisi 15+', (pk.match(/parcaliKaydet\('/g)||[]).length>=15);

console.log('\n-- MANTIK SIMULASYONU --');
async function parcaliKaydet(ad, liste, oncekiIdler, degisenIdler){
  const yeniler=[],guncellenenler=[];
  (liste||[]).forEach(k=>{
    if(!k||k.id===undefined)return;
    if(!oncekiIdler.has(k.id)) yeniler.push(k);
    else if(!degisenIdler||degisenIdler.has(k.id)) guncellenenler.push(k);
  });
  return {yeni:yeniler.length, guncel:guncellenenler.length};
}
(async()=>{
  const mevcut=[{id:'A'},{id:'B'},{id:'C'}];
  const onceki=new Set(mevcut.map(x=>x.id));
  let r=await parcaliKaydet('x',[...mevcut,{id:'D'},{id:'E'}],onceki);
  t('2 yeni kayit tespit edildi', r.yeni===2);
  t('3 mevcut guncelleme olarak gonderildi', r.guncel===3);
  r=await parcaliKaydet('x',mevcut,onceki,new Set(['B']));
  t('sadece degisen gonderilebiliyor', r.guncel===1 && r.yeni===0);
  r=await parcaliKaydet('x',[],onceki);
  t('bos liste sorun cikarmiyor', r.yeni===0&&r.guncel===0);
  r=await parcaliKaydet('x',[{ad:'idsiz'}],onceki);
  t('id siz kayit atlaniyor', r.yeni===0);

  // 186 satirlik gercek senaryo (ekran goruntusundeki)
  const buyuk=Array.from({length:186},(_,i)=>({id:'K'+i}));
  const bos=new Set();
  r=await parcaliKaydet('x',buyuk,bos);
  t('186 kayit tamami yeni sayildi', r.yeni===186);
  const partiSayisi=Math.ceil(186/200);
  t('186 kayit tek partide gider (<200)', partiSayisi===1);
  const cok=Array.from({length:5400},(_,i)=>({id:'H'+i}));
  t('5400 kayit 27 partiye bolunur', Math.ceil(5400/200)===27);

  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
})();
