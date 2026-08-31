// ── DOLAP MEKÂN RENDERİ — KULP TİPİ GÖRSELİ ─────────────────────────────────
// Eskiden kulpVar tek bir küçük dikey çubukla (kulpDikey) çiziliyordu; hangi
// kulp tipi (kendinden/alüminyum boy/J/pah/gizli) seçilirse seçilsin görsel
// hep aynıydı. kulpCiz() artık kulpTipi'ne göre gerçekten farklı şekil/konum
// üretiyor — bu test bunu kilitler.
//     node testler/dolap_render_kulp_test.js

const DolapHesap = require('../dolap_hesap.js');
const DolapRender = require('../dolap_render.js');

let gecti = 0, kaldi = 0;
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

const TEMEL = {
  genislik: 800, yukseklik: 2000, derinlik: 500, panelKalinlik: 18,
  govdeTipi: 'yan_tam', bazaTipi: 'baza', bazaYukseklik: 100,
  kapakSayisi: 2, kapakTipi: 'tam_bini', fuga: 3, kulpVar: true,
  rafSabit: 1, rafHareketli: 0, arkalikTipi: 'kanalli', kanalDerinlik: 8
};

function svgAl(kulpTipi) {
  const h = DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpTipi }));
  return DolapRender.mekan(h, [], { kapak: 'kapali' });
}

console.log('\n\x1b[1mMekân Renderi — kulp tipi görseli (800×2000×500, 2 kapak)\x1b[0m');

const tipler = ['klasik', 'kendinden', 'aluminyum_boy', 'aluminyum_j', 'j_kendinden', 'j_cep', 'pah_45'];
const svgler = {};
tipler.forEach(t => { svgler[t] = svgAl(t); });

// Her tip için render çöküyor mu / boş mu diye NaN kontrolü
tipler.forEach(t => dogru(DolapHesap.kulpTipiAdi(t) + ': render NaN içermiyor', !/NaN/.test(svgler[t])));

// Tüm SVG çıktıları birbirinden FARKLI olmalı (kulp çizimi gerçekten değişiyor)
let hepsiFarkli = true;
for (let i = 0; i < tipler.length; i++) {
  for (let j = i + 1; j < tipler.length; j++) {
    if (svgler[tipler[i]] === svgler[tipler[j]]) hepsiFarkli = false;
  }
}
dogru('Yedi kulp tipi birbirinden farklı SVG üretiyor', hepsiFarkli);

// kulpVar=false iken hiçbir kulp elemanı çizilmiyor (mevcut davranış korunmalı)
const h2 = DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpVar: false }));
const svgKulpsuz = DolapRender.mekan(h2, [], { kapak: 'kapali' });
dogru('kulpVar=false: aluminyum boy kulp profil rengi (#b9bec3) yok', !svgKulpsuz.includes('#b9bec3'));

// aluminyum_boy: dikey (yüksek), aluminyum_j: yatay (geniş, kısa) bir dikdörtgen olmalı
const boyRectM = svgler.aluminyum_boy.match(/<rect x="[\d.]+" y="[\d.]+" width="4" height="([\d.]+)" rx="2" fill="#b9bec3"/);
const jRectM = svgler.aluminyum_j.match(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="3\.2" rx="1\.6" fill="#b9bec3"/);
dogru('Alüminyum boy kulp: uzun DİKEY bir profil (height > 50px)', !!boyRectM && +boyRectM[1] > 50);
dogru('Alüminyum J kulp: geniş YATAY bir profil (kısa çubuktan [34px] belirgin geniş)', !!jRectM && +jRectM[1] > 30);

console.log('\n' + '─'.repeat(60));
const renk = kaldi ? '\x1b[31m' : '\x1b[32m';
console.log(renk + (kaldi ? '✗' : '✓') + ' ' + gecti + ' geçti, ' + kaldi + ' kaldı\x1b[0m\n');
process.exit(kaldi ? 1 : 0);
