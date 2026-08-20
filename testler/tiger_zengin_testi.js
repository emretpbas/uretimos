// Tiger aktarimi: tip siniflandirma + fiyat + stok + plaka olcusu
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','page_tiger_aktarim.js'),'utf8');
const al=(ad)=>{const i=src.indexOf('function '+ad+'(');let d=0,j=src.indexOf('{',i);do{if(src[j]==='{')d++;else if(src[j]==='}')d--;j++;}while(d>0);return src.slice(i,j);};
eval(al('tipBelirle')); eval(al('plakaOlcusu'));
// Uretimdeki sayiCoz ile birebir ayni
const sayiCoz = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const s2 = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(s2);
  return isNaN(n) ? null : n;
};
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- TIP SINIFLANDIRMA (gercek veriden) --');
t('M2 -> plaka', tipBelirle('SUNTALAM ÇY 18MM A333 BERGAMA 183*366','M2')==='plaka');
t('KAPLAMALI MDF M2 -> plaka', tipBelirle('KAPLAMALI MDF 18MM ÇY DOĞALMEŞE 210*280','M2')==='plaka');
t('KENAR BANT -> kenar_bandi', tipBelirle('KENAR BANT PVC U727 ST9 DAFNE 2*33','METRE')==='kenar_bandi');
t('kenar bant M2 olsa bile kenar_bandi', tipBelirle('KENAR BANT PVC ATIL 0,40*22','M2')==='kenar_bandi');
t('GRAM -> sarf', tipBelirle('AHŞAP KORUYUCU SENTETİK KESTEL CEVİZ','GRAM')==='sarf');
t('KG toz boya -> sarf', tipBelirle('TOZ BOYA AHŞAP YÜZEY SON KAT BEYAZ','KG')==='sarf');
t('ADET lavabo -> hirdavat', tipBelirle('Loop 45cm Dolap Üstü Çanak Lavabo','ADET')==='hirdavat');
t('METRE profil -> hirdavat', tipBelirle('İRON 100 LÜK PROFİL TRAVERS','METRE')==='hirdavat');
t('TAKIM -> hirdavat', tipBelirle('Özel İngiliz Tipi Priz Aparatı','TAKIM')==='hirdavat');

console.log('\n-- PLAKA OLCUSU (addan cikarim) --');
let o=plakaOlcusu('SUNTALAM ÇY 18MM A333 BERGAMA 183*366 KAST.ENTG.');
t('183*366 -> 1830x3660', o && o.en===1830 && o.boy===3660);
o=plakaOlcusu('KAPLAMALI MDF 18MM ÇY DOĞALMEŞE 210*280');
t('210*280 -> 2100x2800', o && o.en===2100 && o.boy===2800);
o=plakaOlcusu('MDFLAM ÇY 8MM A690 NATURAL LEGNA KAST. 210x280');
t('kucuk x ile de calisiyor', o && o.en===2100 && o.boy===2800);
t('olcu yoksa null', plakaOlcusu('TOZ BOYA BEYAZ')===null);
t('sacma olcu reddediliyor (2*33)', (()=>{const r=plakaOlcusu('KENAR BANT 2*33');return r===null;})());

console.log('\n-- SAYI COZUMU (Turkce format) --');
t('4655.54 okunuyor', sayiCoz('4655.54')===4655.54);
t('bos -> null', sayiCoz('')===null);
t('virgullu 1234,56', sayiCoz('1234,56')===1234.56);
t('binlik ayracli 1.234,56', sayiCoz('1.234,56')===1234.56);
t('sifir korunuyor', sayiCoz('0')===0);

console.log('\n-- KOD KONTROLLERI --');
t('alis fiyati birimFiyat olarak yaziliyor', /kart\.birimFiyat = k\.alisFiyat/.test(src));
t('plakaya grain ve fire varsayilani', /kart\.grainYonu = 'yok'[\s\S]{0,60}fireYuzde = 8/.test(src));
t('stok hammadde_deposuna yaziliyor', /ambar: 'hammadde_deposu', tip: 'hammadde'/.test(src));
t('stok parcali gonderiliyor', /topluEkle\('stokRaf', stokKayitlari, 250/.test(src));
t('onizlemede tip dagilimi var', src.includes('Hammadde tip dağılımı'));
t('onizlemede fiyat ve stok sutunu', src.includes('Alış Fiyatı') && src.includes('>Stok<'));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
