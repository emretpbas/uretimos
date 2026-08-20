// Onerilen kritik seviye (agirlikli ortalama) testi
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','page_depo_panel.js'),'utf8');
const al=(ad)=>{const i=src.indexOf('function '+ad+'(');let d=0,j=src.indexOf('{',i);do{if(src[j]==='{')d++;else if(src[j]==='}')d--;j++;}while(d>0);return src.slice(i,j);};
eval(al('oneriHesapla'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
const h={id:'HM-1',ad:'X',tedarikSuresi:14};
const s={g30:30,g60:35,g120:65,g180:105};
const o=oneriHesapla(s,h);
const bek=((30/30)*3+(35/60)*2+(65/120)*1.5+(105/180)*1)/7.5;
console.log('\n-- ONERI --');
t('gunluk ortalama agirlikli dogru', Math.abs(o.gunlukOrt-bek)<1e-9);
t('oneri = gunluk x (tedarik 14 + emniyet 7)', Math.abs(o.oneri-bek*21)<1e-9);
t('yakin donem agirlikli (basit ortalamadan yuksek)', o.gunlukOrt > (105/180));
t('sarf yoksa oneri null', oneriHesapla({g30:0,g60:0,g120:0,g180:0},h)===null);
t('tedarik suresi yoksa 14 varsayilan', oneriHesapla(s,{id:'y',ad:'y'}).tedarikGun===14);
console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
