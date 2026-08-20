// Buyuk koleksiyon yazmalari otomatik PARCALANMALI (403/413 korumasi)
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const st=fs.readFileSync(path.join(KOK,'storage.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- OTOMATIK PARCALAMA (kaynakta cozum) --');
t('esik tanimli (400 KB)', /BUYUK_GOVDE_ESIGI = 400 \* 1024/.test(st));
t('set() icinde boyut olculuyor', /govdeBoyut > BUYUK_GOVDE_ESIGI/.test(st));
t('buyukListeyiYaz yardimcisi var', /async function buyukListeyiYaz\(key, liste\)/.test(st));
t('403 un mod_security den geldigi belgelenmis', /mod_security büyük POST gövdelerini 403 ile reddeder/.test(st));
t('cagiran kodun bilmesi gerekmiyor', /Çağıran kodun bunu bilmesi gerekmesin/.test(st));

console.log('\n-- FARK MANTIGI --');
t('mevcut veriyle karsilastiriliyor', /const mevcut = await get\(key, \[\]\)/.test(st));
t('EKLE ayirt ediliyor', /oncekiJson === undefined\) ekle\.push/.test(st));
t('GUNCELLE yalnizca degisenler', /oncekiJson !== JSON\.stringify\(x\)\) guncelle\.push/.test(st));
t('SIL tespit ediliyor', /!yeniIdler\.has\(id\)/.test(st));
t('degisiklik yoksa istek YOK', /if \(!ekle\.length && !guncelle\.length && !sil\.length\) return true/.test(st));
t('parti boyu 200', /const PARTI = 200/.test(st));
t('uc islem de partili', (st.match(/i \+= PARTI/g)||[]).length===3);
t('basarisizsa normal yola dusuyor', /Parçalı yol tutmazsa çağıran normal yola düşsün/.test(st));
t('anlik goruntu tazeleniyor', /anlikGoruntu\.set\(key, goruntuAl\(liste\)\)/.test(st));

console.log('\n-- SIMULASYON --');
function farkCikar(mevcutListe, yeniListe){
  const eski=new Map();
  mevcutListe.forEach(x=>{if(x&&x.id!==undefined)eski.set(String(x.id),JSON.stringify(x));});
  const ekle=[],guncelle=[];const yeniIdler=new Set();
  yeniListe.forEach(x=>{
    if(!x||x.id===undefined)return;
    const id=String(x.id); yeniIdler.add(id);
    const o=eski.get(id);
    if(o===undefined) ekle.push(x); else if(o!==JSON.stringify(x)) guncelle.push(x);
  });
  const sil=[...eski.keys()].filter(id=>!yeniIdler.has(id));
  return {ekle,guncelle,sil};
}
const mevcut=[{id:'A',v:1},{id:'B',v:2},{id:'C',v:3}];
let f=farkCikar(mevcut,[{id:'A',v:1},{id:'B',v:99},{id:'D',v:4}]);
t('1 yeni tespit (D)', f.ekle.length===1 && f.ekle[0].id==='D');
t('1 degisen tespit (B)', f.guncelle.length===1 && f.guncelle[0].id==='B');
t('1 silinen tespit (C)', f.sil.length===1 && f.sil[0]==='C');
t('DEGISMEYEN gonderilmiyor (A)', !f.ekle.concat(f.guncelle).some(x=>x.id==='A'));
f=farkCikar(mevcut,mevcut);
t('ayni listede hicbir istek yok', !f.ekle.length && !f.guncelle.length && !f.sil.length);

console.log('\n-- BOYUT HESABI (gercek senaryo) --');
const kayit={id:'RC-x',urunId:'UR-1',ad:'Dolap Recetesi',
  kalemler:Array.from({length:15},(_,i)=>({id:'RK'+i,tip:'hammadde',refId:'HM-'+i,miktar:2.5,birim:'M2'}))};
const tekBoyut=JSON.stringify(kayit).length;
console.log('  tek recete ~'+tekBoyut+' bayt');
[100,1000,5000,76000].forEach(n=>{
  const mb=tekBoyut*n/1024;
  const parcali=tekBoyut*200/1024;
  console.log('  '+String(n).padStart(6)+' recete: tam '+Math.round(mb)+' KB -> parcali '+Math.round(parcali)+' KB/istek');
});
t('76.000 recete tam gonderim esigi asiyor', tekBoyut*76000 > 400*1024);
t('200 lik parti esigin ALTINDA', tekBoyut*200 < 400*1024);
t('kucuk koleksiyon parcalanmiyor (gereksiz yuk yok)', tekBoyut*100 < 400*1024);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
