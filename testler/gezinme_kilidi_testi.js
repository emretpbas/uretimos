// Gezinme kilidi: es zamanli render carpismasini onler (mobil kilitlenme)
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- KOD YAPISI --');
t('kilit degiskenleri tanimli', /_gezinmeCalisiyor = false/.test(src) && /_bekleyenGezinme = null/.test(src));
t('goTo sarmalayici, ic fonksiyon ayri', src.includes('async function goToIc(pageId, params)'));
t('kilit varken istek araya aliniyor', /if \(_gezinmeCalisiyor\)[\s\S]{0,80}_bekleyenGezinme = \{ pageId, params \}/.test(src));
t('finally ile kilit MUTLAKA birakiliyor', /finally \{\s*\n\s*_gezinmeCalisiyor = false;/.test(src));
t('bekleyen istek sonra calistiriliyor', /_bekleyenGezinme = null;[\s\S]{0,140}goTo\(sonraki\.pageId, sonraki\.params\)/.test(src));
t('setTimeout ile araya nefes veriliyor', /setTimeout\(\(\) => goTo\(sonraki\.pageId/.test(src));

console.log('\n-- DAVRANIS SIMULASYONU --');
// Uretimdeki mantigin aynisi
let calisiyor=false, bekleyen=null, cizilenler=[], esZamanli=0, aktif=0;
const cizimSuresi=30;
const ic=(id)=>new Promise(r=>{aktif++; if(aktif>1) esZamanli++; setTimeout(()=>{cizilenler.push(id);aktif--;r();},cizimSuresi);});
async function goTo(id){
  if(calisiyor){ bekleyen=id; return; }
  calisiyor=true;
  try{ await ic(id); } finally {
    calisiyor=false;
    if(bekleyen!==null){ const s=bekleyen; bekleyen=null; setTimeout(()=>goTo(s),0); }
  }
}
(async()=>{
  goTo('A'); goTo('B'); goTo('C');       // hizli ust uste 3 dokunus
  await new Promise(r=>setTimeout(r,200));
  t('es zamanli cizim OLMADI', esZamanli===0);
  t('ilk sayfa cizildi', cizilenler[0]==='A');
  t('sadece SON istek ek olarak cizildi (B atlandi)', cizilenler.length===2 && cizilenler[1]==='C');
  t('kilit serbest kaldi (takilmadi)', calisiyor===false);
  // Kilit birakildiktan sonra normal gezinme calisiyor mu
  await goTo('D'); await new Promise(r=>setTimeout(r,80));
  t('sonraki gezinme normal calisiyor', cizilenler.includes('D'));
  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
})();
