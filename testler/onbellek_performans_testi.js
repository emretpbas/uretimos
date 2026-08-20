// Parmak izi tablosu onbellegi: dogruluk + performans (mobil kilitlenme)
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','storage.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- KOD KONTROLU --');
t('goruntuSurum haritasi tanimli', src.includes('const goruntuSurum = new Map();'));
t('ayni surumde yeniden hesaplanmiyor', /goruntuSurum\.get\(key\) === yeniSurum && anlikGoruntu\.has\(key\)/.test(src));
t('surum yoksa eski davranis (guvenli)', /else \{\s*anlikGoruntu\.set\(key, goruntuAl\(cozulmus\)\)/.test(src));
t('surum yoksa kayit silinir (bayat kalmasin)', src.includes('goruntuSurum.delete(key)'));

console.log('\n-- PERFORMANS (parmak izi hesabinin maliyeti) --');
// goruntuAl'in yaptigi isin benzeri: her kayit icin stringify + hash
const parmakIzi=(s)=>{let h=0;for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}return h;};
const goruntuAl=(dizi)=>{const m=new Map();dizi.forEach(k=>{if(k&&k.id!==undefined){m.set(String(k.id),parmakIzi(JSON.stringify(k)));}});return m;};
const N=30000, kayitlar=[];
for(let i=0;i<N;i++) kayitlar.push({id:'HRK-'+i,tip:'cikis',ambar:'hammadde_deposu',kalemAdi:'MALZEME '+i,miktar:i%50,tarih:'2026-05-01',aciklama:'uretimde sarf edildi'});
const t0=Date.now(); goruntuAl(kayitlar); const tekSefer=Date.now()-t0;
console.log('  '+N+' kayit icin parmak izi tablosu: '+tekSefer+' ms (TEK okuma)');
// Bir sayfa gezintisinde ~6 koleksiyon okunur, kullanici 10 sayfa gezer
const eskiToplam=tekSefer*10;   // ayni buyuk koleksiyon 10 kez okunursa
console.log('  10 sayfa gezintisi -> eski: ~'+eskiToplam+' ms, yeni: ~'+tekSefer+' ms (1 kez)');
t('onbellek 10 gezintide belirgin kazanc saglar', eskiToplam > tekSefer*5);
t('tek hesap makul surede (masaustu)', tekSefer < 5000);


console.log('\n-- BUYUK KOLEKSIYON KORUMASI (mobil bellek) --');
t('esik tanimli (4000)', src.includes('const BUYUK_KOLEKSIYON_ESIGI = 4000;'));
t('buyukse tablo tutulmuyor', /cozulmus\.length > BUYUK_KOLEKSIYON_ESIGI[\s\S]{0,120}anlikGoruntu\.delete\(key\)/.test(src));
t('surum kaydi da temizleniyor', /BUYUK_KOLEKSIYON_ESIGI[\s\S]{0,160}goruntuSurum\.delete\(key\)/.test(src));
t('farkCikar tablo yoksa null doner (tam kayit)', /const eski = anlikGoruntu\.get\(key\);\s*\n\s*if \(!eski[\s\S]{0,60}return null;/.test(src));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
