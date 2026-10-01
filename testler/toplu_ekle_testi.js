// Parcali toplu ekleme: HTTP 413 cozumu
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','storage.js'),'utf8');
const tg=fs.readFileSync(path.join(__dirname,'..','page_tiger_aktarim.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- KOD KONTROLU --');
t('topluEkle tanimli', src.includes('async function topluEkle(key, kayitlar, partiBoyu, ilerleme)'));
t('patch ucunu (tekrar denemeli) kullaniyor, tam kayit degil', /topluEkle[\s\S]{0,600}patchUygulaTekrarli\(key, \{ ekle: dilim/.test(src));
t('parti boyu sinirlandirilmis (1-1000)', /Math\.min\(\+partiBoyu \|\| 300, 1000\)/.test(src));
t('disa acilmis', /topluEkle, topluGuncelle/.test(src));
t('Tiger aktarimi topluEkle kullaniyor', tg.includes("Store.topluEkle('hammaddeler'"));
t('parti boyu 250', /topluEkle\('hammaddeler', yeniHm, 250/.test(tg));
t('ilerleme kullaniciya gosteriliyor', /aktarıldı…/.test(tg));
t('hata olunca buton geri aciliyor', /Yeniden Dene/.test(tg));

console.log('\n-- TEK PARTI HATASINDA TEKRAR DENEME (GERCEK URETIM BULGUSU) --');
// GERCEK URETIM BULGUSU: 26.000+ kayitlik toplu aktarimda bir parti gecici
// olarak yavaslayip hata verince TUM dongu duruyor, kullanici "aktar"
// dugmesine tekrar tekrar basmak zorunda kaliyordu. patchUygulaTekrarli bunu
// COZER: sadece basarisiz partiyi birkac kez, artan beklemeyle tekrar dener.
t('patchUygulaTekrarli tanimli', /async function patchUygulaTekrarli\(key, fark, denemeSayisi\)/.test(src));
t('topluEkle patchUygulaTekrarli kullaniyor', /async function topluEkle[\s\S]{0,600}patchUygulaTekrarli\(/.test(src));
t('topluGuncelle patchUygulaTekrarli kullaniyor', /async function topluGuncelle[\s\S]{0,600}patchUygulaTekrarli\(/.test(src));
t('topluSil patchUygulaTekrarli kullaniyor', /async function topluSil[\s\S]{0,600}patchUygulaTekrarli\(/.test(src));
t('tekrar denemede artan bekleme (exponential backoff) var', /1000 \* Math\.pow\(2, deneme - 1\)/.test(src));
t('azami deneme sayisi sinirli (10 ile)', /Math\.min\(\+denemeSayisi \|\| 4, 10\)/.test(src));
t('tum denemeler tukenince gercek hata firlatiliyor', /throw sonHata/.test(src));

console.log('\n-- PARCALAMA MANTIGI (simulasyon) --');
// Uretimdeki dongunun aynisi
function parcala(liste, partiBoyu){
  const boyut=Math.max(1,Math.min(+partiBoyu||300,1000));
  const partiler=[];
  for(let i=0;i<liste.length;i+=boyut) partiler.push(liste.slice(i,i+boyut));
  return partiler;
}
const kayitlar=Array.from({length:5364},(_,i)=>({id:'HM-'+i}));
let p=parcala(kayitlar,250);
t('5364 kayit 250 lik partilere bolundu', p.length===22);
t('tum kayitlar dahil', p.reduce((a,x)=>a+x.length,0)===5364);
t('son parti kalan kadar (5364-21*250=114)', p[p.length-1].length===114);
t('hicbir parti sinirdan buyuk degil', p.every(x=>x.length<=250));
t('kayit atlanmadi (ilk ve son)', p[0][0].id==='HM-0' && p[p.length-1][113].id==='HM-5363');

p=parcala(kayitlar,5000);
t('parti boyu 1000 e kisitlaniyor', p.every(x=>x.length<=1000));
p=parcala([],250);
t('bos liste sorun cikarmiyor', p.length===0);
p=parcala([{id:'A'}],250);
t('tek kayit tek parti', p.length===1 && p[0].length===1);

console.log('\n-- BOYUT TAHMINI --');
const ornek={id:'HM-ms49u7x',stokKodu:'50.102.003.21',ad:'Loop 45cm Dolap Üstü Çanak Lavabo - Kömür Karası',tip:'hirdavat',birim:'ADET',kaynak:'tiger',tigerHiyerarsi:'52862',olusturmaTarihi:'2026-08-11'};
const tekBoyut=JSON.stringify(ornek).length;
const tamBoyut=tekBoyut*5364;
const partiBoyut=tekBoyut*250;
console.log('  tek kayit ~'+tekBoyut+' bayt');
console.log('  TAM gonderim ~'+Math.round(tamBoyut/1024)+' KB  (413 sebebi)');
console.log('  PARTI gonderim ~'+Math.round(partiBoyut/1024)+' KB');
t('parti boyutu 100 KB altinda (guvenli)', partiBoyut < 100*1024);
t('tam gonderim 1 MB ustunde (sorunlu)', tamBoyut > 1024*1024);

// Davranis simulasyonu: patchUygulaTekrarli'nin gercek koddaki mantigini
// izole calistirip ilk 2 denemede hata verip 3.de basarili olan bir
// cagriyi tolere ettigini (yani TUM dongunun durmadigini) dogruluyoruz.
async function patchUygulaTekrarliSim(cagri, denemeSayisi) {
  const maxDeneme = Math.max(1, Math.min(+denemeSayisi || 4, 10));
  let sonHata;
  for (let deneme = 1; deneme <= maxDeneme; deneme++) {
    try { return await cagri(); } catch (e) {
      sonHata = e;
      if (deneme < maxDeneme) await new Promise(r => setTimeout(r, 1)); // test: gercek backoff yerine aninda
    }
  }
  throw sonHata;
}

(async () => {
  console.log('\n-- TEKRAR DENEME DAVRANISI (izole simulasyon) --');
  let deneme = 0;
  const sonuc = await patchUygulaTekrarliSim(() => {
    deneme++;
    if (deneme < 3) throw new Error('gecici sunucu hatasi (simule)');
    return Promise.resolve('basarili');
  }, 4);
  t('2 basarisiz denemeden sonra 3.de basarili oluyor (sonuc dogru)', sonuc === 'basarili');
  t('tam olarak 3 deneme yapildi', deneme === 3);

  let denemeHepsiKotu = 0;
  let hataYakalandi = false;
  try {
    await patchUygulaTekrarliSim(() => { denemeHepsiKotu++; throw new Error('kalici hata'); }, 3);
  } catch (e) { hataYakalandi = true; }
  t('tum denemeler basarisizsa gercek hata disari firliyor', hataYakalandi);
  t('kalici hatada tam olarak azami deneme kadar denendi (3)', denemeHepsiKotu === 3);

  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');
  process.exit(bad?1:0);
})();
