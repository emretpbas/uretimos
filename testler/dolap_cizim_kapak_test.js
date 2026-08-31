// ── DOLAP TEKNİK RESİM — 3B PERSPEKTİF (İZOMETRİK) KAPAK TİPİ GEOMETRİSİ ────
// dolap_render.js'teki Mekân Renderi düzeltilmişti ama aynı bug ucBoyut()'ta
// (dolap tasarım ekranındaki "İzometrik" görünüm) da vardı: kapak dikdörtgeni
// hep bölmenin iç boşluğuna eşit çiziliyor, kapakTipi hiç dikkate alınmıyordu.
// Bu test üç kapak tipinin İZOMETRİK görünümde de gerçekten farklı kapak
// dikdörtgenleri ürettiğini kilitler.
//     node testler/dolap_cizim_kapak_test.js

const DolapHesap = require('../dolap_hesap.js');
const DolapCizim = require('../dolap_cizim.js');

let gecti = 0, kaldi = 0;
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

const TEMEL = {
  genislik: 800, yukseklik: 2000, derinlik: 500, panelKalinlik: 18,
  govdeTipi: 'yan_tam', bazaTipi: 'baza', bazaYukseklik: 100,
  kapakSayisi: 2, fuga: 3,
  rafSabit: 1, rafHareketli: 0, arkalikTipi: 'kanalli', kanalDerinlik: 8
};

function ilkKapakRect(svg) {
  // ucBoyut()'ta kapak dikdörtgenleri fill="none" ile çizilir; ilk rect stroke'lu olanı yakala
  const m = svg.match(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" fill="none" stroke="[^"]+" stroke-width="\.9"\/>/);
  if (!m) return null;
  return { x: +m[1], y: +m[2], width: +m[3], height: +m[4] };
}

function kapakRectAl(kapakTipi) {
  const h = DolapHesap.hesapla(Object.assign({}, TEMEL, { kapakTipi }));
  const svg = DolapCizim.ucBoyut(h);
  const r = ilkKapakRect(svg);
  if (!r) throw new Error('Kapak dikdörtgeni bulunamadı (' + kapakTipi + ')');
  return r;
}

console.log('\n\x1b[1mİzometrik (ucBoyut) — kapak tipi geometrisi (800×2000×500, 18mm, 2 kapak)\x1b[0m');
const rTam = kapakRectAl('tam_bini');
const rYarim = kapakRectAl('yarim_bini');
const rIcerlek = kapakRectAl('icerlek');

dogru('Üç kapak tipi FARKLI genişlikte kapak üretiyor (tam ≠ yarım ≠ içerlek)',
  rTam.width !== rYarim.width && rYarim.width !== rIcerlek.width && rTam.width !== rIcerlek.width);
dogru('Tam bini kapağı en geniş (gövdeyi taşarak örter)', rTam.width > rYarim.width && rYarim.width > rIcerlek.width);
dogru('Tam bini kapağı en SOLA taşıyor (x en küçük)', rTam.x < rYarim.x && rYarim.x < rIcerlek.x);
dogru('İçerlek kapağı en dar (boşluğun içine gerçekten çekiliyor)', rIcerlek.width < rYarim.width);
dogru('Tam bini kapak yüksekliği de bindirmeyi yansıtıyor (yarımdan büyük)', rTam.height > rYarim.height);
dogru('İçerlek kapak yüksekliği en küçük (2×panel+2×fuga içeri çekilmiş)', rIcerlek.height < rYarim.height);

console.log('\n' + '─'.repeat(60));
const renk = kaldi ? '\x1b[31m' : '\x1b[32m';
console.log(renk + (kaldi ? '✗' : '✓') + ' ' + gecti + ' geçti, ' + kaldi + ' kaldı\x1b[0m\n');
process.exit(kaldi ? 1 : 0);
