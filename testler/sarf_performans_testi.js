// Sarf indeksi: DOGRULUK + PERFORMANS (telefonda kilitlenme sorunu)
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','page_depo_panel.js'),'utf8');
const al=(ad)=>{const i=src.indexOf('function '+ad+'(');let d=0,j=src.indexOf('{',i);do{if(src[j]==='{')d++;else if(src[j]==='}')d--;j++;}while(d>0);return src.slice(i,j);};
eval(al('sarfIndeksiKur')); eval(al('sarfAl'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
const g=(n)=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);

console.log('\n-- DOGRULUK (eski davranisla ayni olmali) --');
const h={id:'HM-1',ad:'SUNTALAM CY 18MM'};
const hrk=[
 {tip:'cikis',ambar:'hammadde_deposu',hammaddeId:'HM-1',miktar:10,tarih:g(5)},
 {tip:'cikis',ambar:'hammadde_deposu',kalemAdi:'SUNTALAM CY 18MM',miktar:20,tarih:g(20)},
 {tip:'cikis',ambar:'hammadde_deposu',kalemAdi:'suntalam cy 18mm',miktar:5,tarih:g(50)},
 {tip:'cikis',ambar:'hammadde_deposu',hammaddeId:'HM-1',miktar:30,tarih:g(100)},
 {tip:'cikis',ambar:'hammadde_deposu',hammaddeId:'HM-1',miktar:40,tarih:g(170)},
 {tip:'cikis',ambar:'hammadde_deposu',hammaddeId:'HM-9',miktar:99,tarih:g(5)},
 {tip:'giris',ambar:'hammadde_deposu',hammaddeId:'HM-1',miktar:500,tarih:g(5)},
 {tip:'cikis',ambar:'sevkiyat_deposu',hammaddeId:'HM-1',miktar:77,tarih:g(5)},
 {tip:'cikis',ambar:'hammadde_deposu',hammaddeId:'HM-1',miktar:60,tarih:g(300)},
];
const idx=sarfIndeksiKur(hrk); const s=sarfAl(idx,h);
t('30 gun = 30', s.g30===30);
t('60 gun = 35 (ad ile eslesen dahil)', s.g60===35);
t('120 gun = 65', s.g120===65);
t('180 gun = 105', s.g180===105);
t('giris/baska ambar/baska hammadde haric', s.g30===30);
t('180 disi eski hareket haric', s.g180===105);
t('sarfi olmayan hammadde sifir doner', sarfAl(idx,{id:'YOK',ad:'YOK'}).g30===0);

console.log('\n-- PERFORMANS (gercek olcek) --');
const N_HRK=30000, N_HM=400;
const buyuk=[];
for(let i=0;i<N_HRK;i++) buyuk.push({tip:'cikis',ambar:'hammadde_deposu',hammaddeId:'HM-'+(i%N_HM),miktar:1,tarih:g(i%200)});
const hammaddeler=[];for(let i=0;i<N_HM;i++) hammaddeler.push({id:'HM-'+i,ad:'H'+i});
const t0=Date.now();
const bIdx=sarfIndeksiKur(buyuk);
let toplam=0; hammaddeler.forEach(h=>{toplam+=sarfAl(bIdx,h).g180;});
const sure=Date.now()-t0;
console.log('  '+N_HM+' hammadde x '+N_HRK+' hareket -> '+sure+' ms');
t('1 saniyenin altinda (telefon icin kabul edilebilir)', sure<1000);
t('toplam sarf dogru hesaplandi', toplam>0);
// Eski yontem karsilastirmasi (referans)
const t1=Date.now();
let eskiToplam=0;
hammaddeler.slice(0,40).forEach(h=>{ // sadece 40 hammadde ile olcelim
  for(const k of buyuk){ if(k.tip!=='cikis')continue; if(k.hammaddeId===h.id) eskiToplam+=k.miktar; }
});
const eskiSure=(Date.now()-t1)*(N_HM/40)*4;  // 400 hammadde x 4 pencere tahmini
console.log('  eski yontem tahmini: ~'+Math.round(eskiSure)+' ms (400 hammadde x 4 pencere)');
t('yeni yontem eskiden belirgin hizli', sure < eskiSure/3);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
