// ── SÜRGÜLÜ KAPAK · CAM · LED · RENDER TESTİ ────────────────────────────────
//     node testler/dolap_surgulu_test.js

const D = require('../dolap_hesap.js');
global.DolapHesap = D;
const R = require('../dolap_render.js');

let gecti = 0, kaldi = 0;
const es = (ad, beklenen, gercek) => {
  const ok = Math.abs(beklenen - gercek) < 0.01;
  console.log('  ' + (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad +
    (ok ? '' : '  \x1b[33mbeklenen ' + beklenen + ', gelen ' + gercek + '\x1b[0m'));
  ok ? gecti++ : kaldi++;
};
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

const temel = { genislik: 1800, yukseklik: 2200, derinlik: 600, panelKalinlik: 18, bazaTipi: 'baza', bazaYukseklik: 100 };
const hb = (r, ad) => r.hirdavat.find(h => h.ad === ad);

// ── 1) GERİYE UYUMLULUK ────────────────────────────────────────────────────
console.log('\n\x1b[1mGeriye uyumluluk\x1b[0m');
const eski = D.hesapla(Object.assign({}, temel, { kapakSayisi: 2 }));
const yeni = D.hesapla(Object.assign({}, temel, { kapakSayisi: 2, kapakSistemi: 'menteseli' }));
dogru('kapakSistemi verilmezse menteşeli davranış aynı',
  JSON.stringify(eski.paneller) === JSON.stringify(yeni.paneller));
dogru('Menteşeli tasarımda cam üretilmez', eski.camlar.length === 0);
es('LED kapalıyken metraj 0', 0, eski.ozet.ledMetre);

// ── 2) KAPAKSIZ DOLAP ──────────────────────────────────────────────────────
console.log('\n\x1b[1mKapaksız (açık) dolap\x1b[0m');
const acik = D.hesapla(Object.assign({}, temel, { kapakSistemi: 'yok', kapakSayisi: 2, rafHareketli: 4 }));
es('Kapak paneli üretilmez', 0, acik.paneller.filter(p => p.rol === 'kapak').length);
dogru('Menteşe eklenmez', !hb(acik, 'Menteşe'));
dogru('Kulp eklenmez', !hb(acik, 'Kulp'));
dogru('Raflar üretilmeye devam eder', acik.paneller.some(p => p.rol === 'raf_hareketli'));
dogru('Özette kapak sistemi "yok" olarak bildiriliyor', acik.ozet.kapakSistemi === 'yok');

// ── 3) SÜRGÜLÜ — MELAMİN ───────────────────────────────────────────────────
console.log('\n\x1b[1mSürgülü kapak — melamin (tek parça kanat)\x1b[0m');
const mel = D.hesapla(Object.assign({}, temel, {
  kapakSistemi: 'surgulu', surguluKanat: 2, surguluCerceve: 'melamin', surguluBindirme: 25
}));
const melKanat = mel.paneller.find(p => p.rol === 'surgulu_kanat');
dogru('Melamin kanat paneli üretildi', !!melKanat);
es('2 kanat', 2, melKanat.adet);
// kanatEn = (1800 + 1×25) / 2 = 912.5
es('Kanat eni (W + (n−1)×bindirme)/n = 912.5', 912.5, melKanat.netEn);
dogru('Menteşe yerine ray sistemi geldi', !hb(mel, 'Menteşe') && !!hb(mel, 'Sürgülü kapak üstten asmalı ray takımı'));
dogru('Ray profili metraj olarak eklendi', hb(mel, 'Sürgülü kapak ray profili').birim === 'METRE');
es('Kanat başına 1 kulp', 2, hb(mel, 'Sürgülü kapak kulbu').adet);

// ── 4) SÜRGÜLÜ — ALÜMİNYUM ÇERÇEVE ─────────────────────────────────────────
console.log('\n\x1b[1mSürgülü kapak — alüminyum çerçeve\x1b[0m');
const alu = D.hesapla(Object.assign({}, temel, {
  kapakSistemi: 'surgulu', surguluKanat: 3, surguluCerceve: 'aluminyum', surguluProfilEn: 20
}));
dogru('Alüminyum profil metraj olarak eklendi', hb(alu, 'Alüminyum sürgülü kapak profili').birim === 'METRE');
es('Kanat başına 4 köşe bağlantısı', 12, hb(alu, 'Alüminyum çerçeve köşe bağlantısı').adet);
dogru('Camsız alüminyum çerçevede dolgu paneli üretilir',
  !!alu.paneller.find(p => p.rol === 'surgulu_dolgu'));
es('3 kanat → 3 dolgu paneli', 3, alu.paneller.find(p => p.rol === 'surgulu_dolgu').adet);
const aluCam = D.hesapla(Object.assign({}, temel, {
  kapakSistemi: 'surgulu', surguluKanat: 3, surguluCerceve: 'aluminyum', camTipi: 'kumlu'
}));
dogru('Cam varsa dolgu paneli üretilmez', !aluCam.paneller.find(p => p.rol === 'surgulu_dolgu'));

// ── 5) CAM TİPLERİ VE MANUEL KONUM ─────────────────────────────────────────
console.log('\n\x1b[1mCam tipleri ve manuel konum\x1b[0m');
const camTipleri = [['seffaf', 'Şeffaf cam'], ['kumlu', 'Kumlu (buzlu) cam'], ['bronz_reflekte', 'Bronz reflekte cam'],
  ['gumus_reflekte', 'Gümüş reflekte cam'], ['nervurlu', 'Nervürlü cam'], ['fume', 'Füme cam']];
camTipleri.forEach(([kod, ad]) => {
  const r = D.hesapla(Object.assign({}, temel, { kapakSistemi: 'surgulu', surguluKanat: 2, camTipi: kod }));
  dogru(kod + ' → "' + ad + '"', r.camlar.length === 1 && r.camlar[0].ad === ad);
});
const cm = D.hesapla(Object.assign({}, temel, {
  kapakSistemi: 'surgulu', surguluKanat: 2, surguluCerceve: 'melamin',
  camTipi: 'fume', camKalinlik: 6, camUstMesafe: 200, camYukseklik: 1200, camYanMesafe: 80
}));
const c1 = cm.camlar[0];
es('Cam yüksekliği elle verildi (1200)', 1200, c1.boy);
// kanatEn 912.5 − 2×80 = 752.5
es('Cam eni = kanat eni − 2×yan mesafe', 752.5, c1.en);
es('Cam kalınlığı 6', 6, c1.kalinlik);
es('Kanat başına 1 cam → 2 adet', 2, c1.adet);
dogru('Cam konumu açıklamada yazıyor', /üstünden 200 mm/.test(c1.konum) && /yanlardan 80/.test(c1.konum));
es('Cam m² toplamı', Math.round(752.5 * 1200 * 2 / 1e6 * 1000) / 1000, cm.ozet.camM2);
const oto = D.hesapla(Object.assign({}, temel, {
  kapakSistemi: 'surgulu', surguluKanat: 2, camTipi: 'kumlu', camUstMesafe: 100, camYukseklik: 0, camYanMesafe: 60
}));
dogru('Cam yüksekliği 0 verilirse kalan alan kullanılır', oto.camlar[0].boy > 1500);
dogru('Melamin kanatta cam boşluğu uyarı olarak bildirilir',
  cm.uyarilar.some(u => /boşluk kesilecek/.test(u)));

// ── 6) LED ────────────────────────────────────────────────────────────────
console.log('\n\x1b[1mLED aydınlatma\x1b[0m');
const ledY = D.hesapla(Object.assign({}, temel, { ledYan: true, rafHareketli: 0, rafSabit: 0 }));
// gövde 2200−100 = 2100 ; iç yükseklik 2100−36 = 2064 ; iki dikme → 4.128 m
es('Yan dikme LED metresi = 2 × iç yükseklik', 4.128, ledY.ozet.ledMetre);
dogru('LED şerit hırdavata eklendi', !!hb(ledY, 'LED şerit'));
dogru('LED profili eklendi', !!hb(ledY, 'LED alüminyum profil'));
dogru('LED trafo eklendi ve gücü hesaplandı', /W \(14,4 W\/m/.test(hb(ledY, 'LED trafo').model));
dogru('LED markaya bağlı değil (marka boş)', hb(ledY, 'LED şerit').marka === '');
const ledR = D.hesapla(Object.assign({}, temel, { ledRaf: true, rafSabit: 0, rafHareketli: 3 }));
// iç genişlik 1800−36 = 1764 ; 3 raf → 5.292 m
es('Raf altı LED metresi = raf sayısı × bölme genişliği', 5.292, ledR.ozet.ledMetre);
const ledYok = D.hesapla(Object.assign({}, temel, { ledYan: false, ledRaf: false }));
dogru('LED kapalıyken hiç LED kalemi yok', !hb(ledYok, 'LED şerit') && !hb(ledYok, 'LED trafo'));
const ledRenk = D.hesapla(Object.assign({}, temel, { ledYan: true, ledRenk: 'rgb' }));
dogru('LED rengi model alanına yazılıyor', /RGB/.test(hb(ledRenk, 'LED şerit').model));
const ledTrafosuz = D.hesapla(Object.assign({}, temel, { ledYan: true, ledTrafoVar: false }));
dogru('Trafo kapatılabiliyor', !hb(ledTrafosuz, 'LED trafo'));

// ── 7) RENDER — DEKOR ÇÖZÜMLEME ────────────────────────────────────────────
console.log('\n\x1b[1mMekân renderi — dekor çözümleme\x1b[0m');
const dk = [
  ['Suntalam 18mm Akçaağaç A319', 'ahsap'], ['MDFLAM Parlak Beyaz', 'duz'],
  ['Suntalam Antrasit', 'duz'], ['Suntalam Ceviz', 'ahsap'], ['Suntalam Antik Meşe', 'ahsap']
];
dk.forEach(([ad, doku]) => {
  const d = R.dekorCoz({ ad });
  dogru('"' + ad + '" → ' + doku + ' dokusu, ' + d.renk, d.doku === doku && /^#[0-9a-f]{6}$/i.test(d.renk));
});
dogru('renkKodu verilirse ada bakılmaz', R.dekorCoz({ ad: 'Beyaz', renkKodu: '#112233' }).renk === '#112233');
// Tanınmayan dekorda renk nötr griye düşer ama KART ADI korunur
// (kullanıcı hangi hammaddenin tanınmadığını görebilsin diye).
dogru('Tanınmayan ad nötr griye düşer, kart adı korunur',
  R.dekorCoz({ ad: 'Zzzz' }).renk === '#c9c7c3' && R.dekorCoz({ ad: 'Zzzz' }).ad === 'Zzzz');
dogru('Hammadde hiç yoksa "Tanımsız" döner', R.dekorCoz(null).ad === 'Tanımsız');
dogru('6 cam tipi render kütüphanesinde tanımlı', Object.keys(R.CAMLAR).length === 6);

// ── 8) RENDER — SAHNE ÜRETİMİ ──────────────────────────────────────────────
console.log('\n\x1b[1mMekân renderi — sahne üretimi\x1b[0m');
const hm = [{ id: 'PL1', ad: 'Suntalam 18mm Ceviz', tip: 'plaka' }];
const senaryolar = {
  'menteşeli + LED': Object.assign({}, temel, { kapakSayisi: 2, rafHareketli: 3, ledYan: true, ledRaf: true, panelAyarlari: { yan: { hammaddeId: 'PL1' } } }),
  'sürgülü alüminyum + kumlu cam': Object.assign({}, temel, { kapakSistemi: 'surgulu', surguluKanat: 3, camTipi: 'kumlu', panelAyarlari: { yan: { hammaddeId: 'PL1' } } }),
  'sürgülü melamin + bronz': Object.assign({}, temel, { kapakSistemi: 'surgulu', surguluCerceve: 'melamin', camTipi: 'bronz_reflekte' }),
  'kapaksız + raf LED': Object.assign({}, temel, { kapakSistemi: 'yok', rafHareketli: 5, ledRaf: true }),
  'ayaklı + nervürlü': Object.assign({}, temel, { kapakSistemi: 'surgulu', camTipi: 'nervurlu', bazaTipi: 'ayak', ayakYukseklik: 120 })
};
Object.keys(senaryolar).forEach(ad => {
  const h = D.hesapla(senaryolar[ad]);
  const svg = R.mekan(h, hm, {});
  dogru(ad + ' → geçerli SVG, NaN yok',
    svg.indexOf('<svg') === 0 && !/NaN|undefined/.test(svg) && svg.length > 3000);
});
dogru('Boş hesapta bilgilendirme döner', /Geçerli ölçü/.test(R.mekan({ paneller: [] }, hm, {})));
const svgLed = R.mekan(D.hesapla(senaryolar['menteşeli + LED']), hm, {});
dogru('LED açıkken parıltı filtresi sahnede var', /mt-glow/.test(svgLed));
dogru('Duvar rengi seçeneği uygulanıyor',
  R.mekan(D.hesapla(senaryolar['kapaksız + raf LED']), hm, { duvarRengi: '#123456' }).indexOf('#123456') > 0);

// ── 9) MATERYAL GÖRSELİ VE ÇİFT RENDER ─────────────────────────────────────
console.log('\n\x1b[1mMateryal görseli ve kapaklı/kapaksız render\x1b[0m');
const hmG = [{ id: 'PL1', ad: 'Suntalam 18mm Ceviz', tip: 'plaka' }];
const cfg = Object.assign({}, temel, { kapakSayisi: 2, rafHareketli: 3, panelAyarlari: { yan: { hammaddeId: 'PL1' }, kapak: { hammaddeId: 'PL1' } } });
const hc = D.hesapla(cfg);
const url = 'api.php?action=dosyaIndir&r=hammadde%3APL1&k=abc&f=f1&goster=1';
const svgGorselli = R.mekan(hc, hmG, { materyalUrl: { PL1: url } });
dogru('Materyal görseli SVG desenine gömüldü', svgGorselli.indexOf('<image href=') > 0);
dogru('Görsel URL\'si doğru kaçışlandı', svgGorselli.indexOf('&amp;action=dosyaIndir') > 0 || svgGorselli.indexOf('action=dosyaIndir&amp;') > 0);
dogru('Görsel varken bilgi şeridinde "materyal görseli" yazıyor', /materyal görseli/.test(svgGorselli));
const svgGorselsiz = R.mekan(hc, hmG, {});
dogru('Görsel yokken renk tahminine düşüyor', /renk tahmini/.test(svgGorselsiz) && svgGorselsiz.indexOf('<image href=') < 0);
dogru('dekorCoz görsel URL\'sini haritadan alıyor',
  R.dekorCoz({ id: 'PL1', ad: 'X' }, { PL1: url }).url === url);
dogru('Haritada olmayan hammaddede url null', R.dekorCoz({ id: 'PL9', ad: 'X' }, { PL1: url }).url === null);

const rKapali = R.mekan(hc, hmG, { kapak: 'kapali' });
const rAcik = R.mekan(hc, hmG, { kapak: 'acik' });
dogru('Kapaklı modda "KAPAKLI" etiketi var', /KAPAKLI/.test(rKapali));
dogru('Kapaksız modda "İÇ DÜZEN" etiketi var', /İÇ DÜZEN/.test(rAcik));
dogru('Kapaksız render kapaklıdan farklı (kapaklar çizilmiyor)', rKapali !== rAcik && rAcik.length < rKapali.length);
dogru('Kapaksız modda kulp çizilmiyor', (rAcik.match(/rx="2.2"/g) || []).length < (rKapali.match(/rx="2.2"/g) || []).length);
const surg = D.hesapla(Object.assign({}, temel, { kapakSistemi: 'surgulu', surguluKanat: 2, camTipi: 'kumlu' }));
dogru('Sürgülüde de iç düzen modu çalışıyor',
  R.mekan(surg, hmG, { kapak: 'acik' }).length < R.mekan(surg, hmG, { kapak: 'kapali' }).length);
dogru('Her iki modda da NaN yok', !/NaN|undefined/.test(rKapali + rAcik));
dogru('Işık, gölge ve köşe karartma katmanları sahnede',
  /mt-isik/.test(rKapali) && /mt-temas/.test(rKapali) && /mt-ao-ust/.test(rKapali) && /mt-vignette/.test(rKapali));
dogru('Zemin yansıması var', /mt-yansima/.test(rKapali));

console.log('\n' + '─'.repeat(50));
if (kaldi === 0) { console.log('\x1b[1;32m✓ ' + gecti + ' kontrolün tamamı geçti\x1b[0m'); process.exit(0); }
console.log('\x1b[1;31m✗ ' + kaldi + ' kontrol başarısız (' + gecti + ' geçti)\x1b[0m'); process.exit(1);
