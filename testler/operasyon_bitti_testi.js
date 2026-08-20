// "Operasyon bitmedi" kontrolu: hangi is kartlari bitmemis sayilir?
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

// Uretim kodundaki filtrenin AYNISI
const bitmeyenler=(isler,siparisId)=>isler
  .filter(i=>i.kaynakTip==='sip'&&i.kaynakId===siparisId)
  .filter(i=>{
    if(i.durum==='tamamlandi') return false;
    const kapanan=(+i.sevkEdilenAdet||0)+(+i.fireAdet||0);
    return kapanan<(+i.gelenAdet||0);
  });

const isler=[
  {kaynakTip:'sip',kaynakId:'S1',ymKod:'A',durum:'aktif',gelenAdet:20,sevkEdilenAdet:20,fireAdet:0},   // bitti
  {kaynakTip:'sip',kaynakId:'S1',ymKod:'B',durum:'aktif',gelenAdet:20,sevkEdilenAdet:0,fireAdet:0},    // bitmedi
  {kaynakTip:'sip',kaynakId:'S1',ymKod:'C',durum:'tamamlandi',gelenAdet:10,sevkEdilenAdet:0},          // durum tamamlandi
  {kaynakTip:'sip',kaynakId:'S1',ymKod:'D',durum:'aktif',gelenAdet:10,sevkEdilenAdet:8,fireAdet:2},    // 8+2=10 bitti
  {kaynakTip:'sip',kaynakId:'S1',ymKod:'E',durum:'aktif',gelenAdet:10,sevkEdilenAdet:5,fireAdet:2},    // 7<10 bitmedi
  {kaynakTip:'sip',kaynakId:'S2',ymKod:'F',durum:'aktif',gelenAdet:5,sevkEdilenAdet:0},                // baska siparis
  {kaynakTip:'ie',kaynakId:'S1',ymKod:'G',durum:'aktif',gelenAdet:5,sevkEdilenAdet:0},                 // is emri, siparis degil
];
const b=bitmeyenler(isler,'S1').map(i=>i.ymKod);
console.log('\n-- BITMEYEN TESPITI --');
t('tam sevk edilen (A) bitmis sayilir', !b.includes('A'));
t('hic sevk edilmeyen (B) bitmemis', b.includes('B'));
t('durum=tamamlandi (C) bitmis sayilir', !b.includes('C'));
t('sevk+fire=gelen (D) bitmis sayilir', !b.includes('D'));
t('sevk+fire<gelen (E) bitmemis', b.includes('E'));
t('baska siparis (F) karismaz', !b.includes('F'));
t('is emri kaynakli (G) karismaz', !b.includes('G'));
t('toplam 2 bitmeyen', b.length===2);

console.log('\n-- HEPSI BITTIYSE ENGEL YOK --');
const temiz=[{kaynakTip:'sip',kaynakId:'S9',durum:'aktif',gelenAdet:5,sevkEdilenAdet:5,fireAdet:0}];
t('hepsi bitince liste bos', bitmeyenler(temiz,'S9').length===0);
t('hic is karti yoksa engel yok', bitmeyenler([],'S9').length===0);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
