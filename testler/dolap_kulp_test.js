// ── DOLAP HESAP — KULP TİPİ (kendinden/alüminyum boy/J/pah) ─────────────────
// Piyasada bilinen "handleless" kapak kulp tipleri: klasik (vidalı), kendinden
// (kenara frezeli), alüminyum boy kulp, alüminyum J kulp, J kendinden, J cep
// (gizli), 45° pahlı. Bu test, her tipin doğru hırdavat kalemini (veya hiç
// hırdavat üretmeyip panel adına üretim notu eklediğini) doğrular.
//     node testler/dolap_kulp_test.js

const DolapHesap = require('../dolap_hesap.js');

let gecti = 0, kaldi = 0;
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

const TEMEL = {
  genislik: 800, yukseklik: 2000, derinlik: 500, panelKalinlik: 18,
  govdeTipi: 'yan_tam', bazaTipi: 'baza', bazaYukseklik: 100,
  kapakSayisi: 2, fuga: 3, kapakTipi: 'tam_bini',
  rafSabit: 1, rafHareketli: 0, arkalikTipi: 'kanalli', kanalDerinlik: 8
};

const hirdavatBul = (h, adParcasi) => h.hirdavat.find(x => x.ad.includes(adParcasi));
const kapakPaneli = (h) => h.paneller.find(p => p.rol === 'kapak');

console.log('\n\x1b[1mDolap hesap — kulp tipi (800×2000×500, 2 kapak)\x1b[0m');

// Klasik (varsayılan): eskisi gibi adet bazlı "Kulp" hırdavatı
{
  const h = DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpVar: true, kulpTipi: 'klasik' }));
  dogru('Klasik kulp: "Kulp" hırdavatı 2 adet', (hirdavatBul(h, 'Kulp') || {}).adet === 2);
  dogru('Klasik kulp: panel adında freze notu YOK', !kapakPaneli(h).ad.includes('frezeli') && !kapakPaneli(h).ad.includes('pah'));
}

// Alüminyum boy kulp: metre bazlı profil + vida takımı, ADET kulp YOK
{
  const h = DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpVar: true, kulpTipi: 'aluminyum_boy' }));
  const profil = hirdavatBul(h, 'Alüminyum boy kulp profili');
  dogru('Alüminyum boy kulp: profil METRE biriminde ve > 0', !!profil && profil.birim === 'METRE' && profil.adet > 0);
  dogru('Alüminyum boy kulp: bağlantı vida takımı 2 adet', (hirdavatBul(h, 'Boy kulp bağlantı vida') || {}).adet === 2);
  dogru('Alüminyum boy kulp: ayrı "Kulp" ADET kalemi YOK', !h.hirdavat.some(x => x.ad === 'Kulp'));
}

// Alüminyum J kulp: metre bazlı profil (kapak GENİŞLİĞİ bazlı, boy'dan farklı metraj)
{
  const hBoy = DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpVar: true, kulpTipi: 'aluminyum_boy' }));
  const hJ = DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpVar: true, kulpTipi: 'aluminyum_j' }));
  const profilBoy = hirdavatBul(hBoy, 'Alüminyum boy kulp profili').adet;
  const profilJ = hirdavatBul(hJ, 'Alüminyum J kulp profili').adet;
  dogru('Alüminyum J kulp: profil hırdavatı var ve boy kulptan farklı metraj (en bazlı)', profilJ > 0 && profilJ !== profilBoy);
}

// Kendinden / J kendinden / J cep / 45° pah: hiç ekstra hırdavat YOK, panel adında not VAR
['kendinden', 'j_kendinden', 'j_cep', 'pah_45'].forEach(tip => {
  const h = DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpVar: true, kulpTipi: tip }));
  const ekstraHirdavatYok = !h.hirdavat.some(x => x.ad === 'Kulp' || x.ad.includes('kulp profili') || x.ad.includes('kulp bağlantı'));
  dogru(DolapHesap.kulpTipiAdi(tip) + ': ekstra hırdavat kalemi YOK (panele frezelenir)', ekstraHirdavatYok);
  dogru(DolapHesap.kulpTipiAdi(tip) + ': kapak panel adında üretim notu VAR', kapakPaneli(h).ad.length > kapakPaneli(DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpVar: false }))).ad.length);
});

// kulpVar false ise hiçbir kulp hırdavatı/notu üretilmez (mevcut davranış korunur)
{
  const h = DolapHesap.hesapla(Object.assign({}, TEMEL, { kulpVar: false, kulpTipi: 'aluminyum_boy' }));
  dogru('kulpVar=false: hiçbir kulp hırdavatı yok (kulpTipi seçili olsa bile)',
    !h.hirdavat.some(x => x.ad === 'Kulp' || x.ad.includes('kulp')));
}

console.log('\n' + '─'.repeat(60));
const renk = kaldi ? '\x1b[31m' : '\x1b[32m';
console.log(renk + (kaldi ? '✗' : '✓') + ' ' + gecti + ' geçti, ' + kaldi + ' kaldı\x1b[0m\n');
process.exit(kaldi ? 1 : 0);
