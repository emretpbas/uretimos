// Depo girişi belge zorunluluğu + grup seçim kutucuğu + talep davranışı kontrolleri
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
const depo=fs.readFileSync(path.join(KOK,'page_depo_panel.js'),'utf8');
const kalite=fs.readFileSync(path.join(KOK,'page_kalite_panel.js'),'utf8');

console.log('\n-- BELGE ZORUNLULUGU (irsaliye/fatura) --');
const uyari='İrsaliye veya fatura numarası olmadan depo girişi onaylanamaz';
t('toplu giriste belge kontrolu var', depo.split(uyari).length-1 >= 1);
t('tekil giriste de belge kontrolu var', depo.split(uyari).length-1 >= 2);
t('kontrol return ile akisi durduruyor', /olmadan depo girişi onaylanamaz[\s\S]{0,80}return;/.test(depo));

console.log('\n-- TALEP AC DAVRANISI --');
t('acik talep varken de Talep Ac butonu render ediliyor', /dp-talep-ac[\s\S]{0,160}açık talep var/.test(depo));
t('tekil talep varsayilan miktar = kritik seviye', depo.includes('kritikMiktar != null ? kritikMiktar : 100'));
t('openKritikTalepForm kritikMiktar parametresi aliyor', depo.includes('function openKritikTalepForm(hammadde, onSaved, kritikMiktar)'));

console.log('\n-- TEDARIKCI GRUBU TOPLU SECIM --');
t('grup "tumu" kutucugu var', kalite.includes('kal-grup-tumu'));
t('tumu kutucugu gruptaki checkboxlari isaretliyor', /grupTumu\.onchange[\s\S]{0,140}c\.checked = grupTumu\.checked/.test(kalite));
t('secim sonrasi toplu buton gorunurlugu guncelleniyor', /grupTumu\.onchange[\s\S]{0,200}gorunurlugunuGuncelle\(\)/.test(kalite));
t('kalite sorunlular gruba dahil degil (checkbox yok)', kalite.includes('${!kaliteProblemiVar ?'));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
