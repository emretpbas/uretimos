// Toplu satinalma talebi: eksik hesabi, 100'e yukari yuvarlama, mukerrer engeli
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

// Uretim kodundaki formulun aynisi
const yuvarla=(eksik)=>Math.ceil(eksik/100)*100;

console.log('\n-- 100 E YUKARI YUVARLAMA --');
t('1 -> 100', yuvarla(1)===100);
t('99 -> 100', yuvarla(99)===100);
t('100 -> 100 (tam katsa artmaz)', yuvarla(100)===100);
t('101 -> 200', yuvarla(101)===200);
t('176 -> 200', yuvarla(176)===200);
t('2700 -> 2700', yuvarla(2700)===2700);
t('2701 -> 2800', yuvarla(2701)===2800);
t('29.5 -> 100', yuvarla(29.5)===100);

console.log('\n-- ADAY SECIMI (kritik alti + acik talebi olmayan) --');
const acik=(hid,talepler)=>talepler.filter(t=>t.hammaddeId===hid&&!['tamamlandi','iptal','reddedildi','kapatildi'].includes(t.durum));
const hammaddeler=[{id:'A',ad:'A',birim:'ADET'},{id:'B',ad:'B',birim:'M2'},{id:'C',ad:'C',birim:'METRE'},{id:'D',ad:'D',birim:'ADET'}];
const stok={A:0,B:-29,C:500,D:10};
const kritik=[{hammaddeId:'A',miktar:10000},{hammaddeId:'B',miktar:176},{hammaddeId:'C',miktar:100},{hammaddeId:'D',miktar:50}];
const talepler=[{hammaddeId:'D',durum:'teklif_bekleniyor'},{hammaddeId:'A',durum:'tamamlandi'}];
const adaylar=[];
hammaddeler.forEach(h=>{
  const st=stok[h.id]; const kr=kritik.find(k=>k.hammaddeId===h.id);
  if(!kr||kr.miktar==null||st>=kr.miktar) return;
  if(acik(h.id,talepler).length) return;
  adaylar.push({id:h.id,eksik:kr.miktar-st,miktar:yuvarla(kr.miktar-st)});
});
t('C (stok yeterli) aday DEGIL', !adaylar.find(a=>a.id==='C'));
t('D (acik talebi var) aday DEGIL', !adaylar.find(a=>a.id==='D'));
t('A aday (eski talep tamamlanmis)', !!adaylar.find(a=>a.id==='A'));
t('B aday (negatif stok)', !!adaylar.find(a=>a.id==='B'));
t('A miktar 10000', adaylar.find(a=>a.id==='A').miktar===10000);
t('B eksik 205 -> 300', adaylar.find(a=>a.id==='B').eksik===205 && adaylar.find(a=>a.id==='B').miktar===300);
t('toplam 2 aday', adaylar.length===2);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
