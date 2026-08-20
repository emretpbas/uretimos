const fs=require('fs'); const src=fs.readFileSync('../kayip_kacak.js','utf8');
const al=(ad)=>{const i=src.indexOf('function '+ad+'(');if(i<0)throw new Error(ad);let d=0,j=src.indexOf('{',i);do{if(src[j]==='{')d++;else if(src[j]==='}')d--;j++;}while(d>0);return src.slice(i,j);};
eval(al('gorevAyriligiGecerli'));
const CIFT_ONAY_TUTAR_ESIGI=50000; eval(al('ciftOnayGerekli'));
const GECERLI_GECISLER={beklemede:['onaylandi','reddedildi'],onaylandi:['teslim_edildi','reddedildi'],teslim_edildi:['kapatildi'],reddedildi:[],kapatildi:[]};
eval(al('gecisGecerli'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a);}else{bad++;console.log('  KALDI '+a);}};

console.log('\n-- GÖREV AYRILIĞI (çekirdek kural) --');
t('talep eden = onaylayan REDDEDILIR', gorevAyriligiGecerli('ahmet','ahmet').gecerli===false);
t('farkli kisi onaylayabilir', gorevAyriligiGecerli('ahmet','mehmet').gecerli===true);
t('talepEden bos ise red', gorevAyriligiGecerli('','mehmet').gecerli===false);
t('onaylayan bos ise red', gorevAyriligiGecerli('ahmet','').gecerli===false);
t('ayni kisi red sebebi net', gorevAyriligiGecerli('a','a').sebep.includes('kendisi onaylayamaz'));

console.log('\n-- ÇİFT ONAY EŞİĞİ (50.000 TRY) --');
t('49.999 -> tek onay', ciftOnayGerekli(49999)===false);
t('50.000 -> çift onay', ciftOnayGerekli(50000)===true);
t('100.000 -> çift onay', ciftOnayGerekli(100000)===true);
t('0/bos -> tek onay', ciftOnayGerekli(0)===false);

console.log('\n-- DURUM MAKİNESİ --');
t('beklemede -> onaylandi gecerli', gecisGecerli('beklemede','onaylandi')===true);
t('beklemede -> reddedildi gecerli', gecisGecerli('beklemede','reddedildi')===true);
t('beklemede -> teslim_edildi GECERSIZ (once onay)', gecisGecerli('beklemede','teslim_edildi')===false);
t('onaylandi -> teslim_edildi gecerli', gecisGecerli('onaylandi','teslim_edildi')===true);
t('teslim_edildi -> kapatildi gecerli', gecisGecerli('teslim_edildi','kapatildi')===true);
t('reddedildi -> hicbir gecis (kapali)', gecisGecerli('reddedildi','onaylandi')===false);
t('kapatildi -> hicbir gecis', gecisGecerli('kapatildi','teslim_edildi')===false);
t('teslim_edildi -> onaylandi GERI DONUS engel', gecisGecerli('teslim_edildi','onaylandi')===false);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');
process.exit(bad?1:0);
