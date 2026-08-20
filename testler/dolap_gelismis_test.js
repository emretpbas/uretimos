// ── DOLAP GELİŞMİŞ ÖZELLİKLER TESTİ ─────────────────────────────────────────
// Modülasyon (dikey bölmeler), çekmece, hırdavat markası, arkalık arkadan
// mesafesi, üst kayıt/profil ve CNC delik planı için kontroller.
//     node testler/dolap_gelismis_test.js
// Eski davranışın korunduğunu dolap_hesap_test.js doğrular; bu dosya YENİ
// alanların doğru çalıştığını ve verilmediklerinde hiçbir şeyi değiştirmediğini
// kontrol eder.

const D = require('../dolap_hesap.js');
let gecti = 0, kaldi = 0;
const es = (ad, beklenen, gercek) => {
  const ok = Math.abs(beklenen - gercek) < 0.01;
  console.log('  ' + (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad +
    (ok ? '' : '  \x1b[33mbeklenen ' + beklenen + ', gelen ' + gercek + '\x1b[0m'));
  ok ? gecti++ : kaldi++;
};
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

// ── 1) GERİYE UYUMLULUK ────────────────────────────────────────────────────
console.log('\n\x1b[1mGeriye uyumluluk — yeni alanlar verilmezse çıktı değişmemeli\x1b[0m');
const temel = { genislik: 800, yukseklik: 2000, derinlik: 500, panelKalinlik: 18,
  govdeTipi: 'yan_tam', bazaTipi: 'baza', bazaYukseklik: 100,
  kapakSayisi: 2, kapakTipi: 'tam_bini', fuga: 3, rafSabit: 1, rafHareketli: 3 };
const a = D.hesapla(temel);
const b = D.hesapla(Object.assign({}, temel, { bolmeler: [], cekmeceSayisi: 0 }));
dogru('Boş bölme listesi tek bölmeli hesapla aynı sonucu verir',
  JSON.stringify(a.paneller) === JSON.stringify(b.paneller));
es('Tek bölmede bölme sayısı 1', 1, a.ozet.bolmeAdedi);
dogru('Delik planı kapalıyken delik üretilmez', a.delikler.length === 0);

// ── 2) MODÜLASYON — DİKEY BÖLMELER ─────────────────────────────────────────
console.log('\n\x1b[1mModülasyon — 1200mm gövde, 3 eşit bölme\x1b[0m');
const m = D.hesapla(Object.assign({}, temel, {
  genislik: 1200, kapakSayisi: 0,
  bolmeler: [
    { oran: 1, rafHareketli: 2, kapakSayisi: 1 },
    { oran: 1, rafHareketli: 3, kapakSayisi: 1 },
    { oran: 1, rafHareketli: 0, kapakSayisi: 1, cekmeceSayisi: 3, cekmeceYukseklik: 180 }
  ]
}));
const ayrac = m.paneller.find(p => p.rol === 'ayrac');
es('3 bölme → 2 dikey ayraç', 2, ayrac.adet);
es('Bölme sayısı 3', 3, m.ozet.bolmeAdedi);
// İç genişlik = 1200 − 36 = 1164 ; ayraçlar 2×18 = 36 ; kalan 1128 / 3 = 376
es('Her bölme genişliği (1164−36)/3 = 376', 376, m.bolmeler[0].genislik);
dogru('Bölme x konumları artan sırada',
  m.bolmeler[0].x < m.bolmeler[1].x && m.bolmeler[1].x < m.bolmeler[2].x);
// Bölme 1 hareketli rafı: 376 − 2 = 374
const raf1 = m.paneller.find(p => p.ad.indexOf('Hareketli raf (Bölme 1)') === 0);
es('Bölme 1 hareketli raf eni = 376−2 = 374', 374, raf1.netEn);
es('Bölme 1 hareketli raf adedi 2', 2, raf1.adet);
dogru('Bölme 3 rafsız → raf paneli yok', !m.paneller.find(p => p.ad.indexOf('Hareketli raf (Bölme 3)') === 0));
es('Toplam raf pimi = (2+3)×4 = 20', 20, m.hirdavat.find(h => h.ad === 'Raf pimi').adet);

// ── 3) ÇEKMECE ─────────────────────────────────────────────────────────────
console.log('\n\x1b[1mÇekmece — bölme 3\'te 3 çekmece\x1b[0m');
es('Çekmece yan paneli 3×2 = 6 adet', 6, m.paneller.find(p => p.ad.indexOf('Çekmece yan') === 0).adet);
es('Çekmece altı 3 adet', 3, m.paneller.find(p => p.ad.indexOf('Çekmece alt') === 0).adet);
es('Çekmece altı kalınlığı 8mm', 8, m.paneller.find(p => p.ad.indexOf('Çekmece alt') === 0).kalinlik);
es('Çekmece rayı 3 takım', 3, m.hirdavat.find(h => h.ad === 'Çekmece rayı').adet);
dogru('Ray boyu gövde derinliğine sığıyor', m.ozet.rayBoy <= m.ozet.icDerinlik - 10);
// Çekmeceli bölmenin kapağı çekmece bölgesi kadar kısalır
const kapak3 = m.paneller.find(p => p.ad === 'Kapak (Bölme 3)');
const kapak1 = m.paneller.find(p => p.ad === 'Kapak (Bölme 1)');
dogru('Çekmeceli bölmenin kapağı daha kısa', kapak3.netBoy < kapak1.netBoy);
es('Kısalma = 3 × 180 = 540', 540, kapak1.netBoy - kapak3.netBoy);

// ── 4) HIRDAVAT MARKASI ────────────────────────────────────────────────────
console.log('\n\x1b[1mHırdavat markası — 4 marka\x1b[0m');
['Hettich', 'Blum', 'Hafele', 'Samet'].forEach(mk => {
  const r = D.hesapla(Object.assign({}, temel, { marka: mk, cekmeceSayisi: 2 }));
  const men = r.hirdavat.find(h => h.ad === 'Menteşe');
  const ray = r.hirdavat.find(h => h.ad === 'Çekmece rayı');
  dogru(mk + ' → menteşe modeli "' + men.model + '"', men.model === D.MARKALAR[mk].mentese);
  dogru(mk + ' → ray modeli dolu ve markaya ait', ray.model.indexOf(D.MARKALAR[mk].ray) === 0);
});
dogru('Marka değişse de generik ad "Menteşe" kalır (eşleştirme bozulmaz)',
  D.hesapla(Object.assign({}, temel, { marka: 'Samet' })).hirdavat.some(h => h.ad === 'Menteşe'));

// ── 5) ARKALIK ARKADAN MESAFESİ ────────────────────────────────────────────
console.log('\n\x1b[1mArkalık arkadan mesafesi\x1b[0m');
const ar0 = D.hesapla(Object.assign({}, temel, { arkalikArkadanMesafe: 0 }));
const ar20 = D.hesapla(Object.assign({}, temel, { arkalikArkadanMesafe: 20 }));
const rafD0 = ar0.paneller.find(p => p.rol === 'raf_hareketli').netBoy;
const rafD20 = ar20.paneller.find(p => p.rol === 'raf_hareketli').netBoy;
es('20mm arkadan mesafe rafı 20mm kısaltır', 20, rafD0 - rafD20);
const arKotu = D.hesapla(Object.assign({}, temel, { arkalikArkadanMesafe: 4, kanalDerinlik: 8 }));
dogru('Mesafe kanal derinliğinden küçükse uyarı verir',
  arKotu.uyarilar.some(u => /kanal/i.test(u)));

// ── 6) ÜST KAYIT / PROFİL ──────────────────────────────────────────────────
console.log('\n\x1b[1mÜst kayıt ve profil (tacın alternatifi)\x1b[0m');
const ky = D.hesapla(Object.assign({}, temel, { ustSistem: 'kayit_yatay', kayitAdet: 2, kayitGenislik: 100 }));
const kp = ky.paneller.find(p => p.rol === 'kayit');
es('Yatay kayıt boyu = W − 2t = 764', 764, kp.netEn);
es('Yatay kayıt eni = kayıt genişliği 100', 100, kp.netBoy);
es('Kayıt adedi 2', 2, kp.adet);
const pf = D.hesapla(Object.assign({}, temel, { ustSistem: 'profil_aluminyum', kayitAdet: 1 }));
dogru('Alüminyum profil plaka değil hırdavat olarak eklenir',
  !pf.paneller.find(p => p.rol === 'kayit') && pf.hirdavat.some(h => /Alüminyum profil/.test(h.ad)));

// ── 7) OTOMATİK AYAK ───────────────────────────────────────────────────────
console.log('\n\x1b[1mOtomatik ayak hesabı\x1b[0m');
es('800mm → 4 ayak', 4, D.otoAyakAdedi(800));
es('1200mm → 6 ayak', 6, D.otoAyakAdedi(1200));
es('1800mm → 8 ayak', 8, D.otoAyakAdedi(1800));
const ay = D.hesapla(Object.assign({}, temel, { genislik: 1200, bazaTipi: 'ayak', ayakOtomatik: true, ayakYukseklik: 100 }));
es('1200mm otomatik ayak → hırdavatta 6', 6, ay.hirdavat.find(h => /ayak/i.test(h.ad)).adet);
dogru('Otomatik artış uyarı olarak bildirilir', ay.uyarilar.some(u => /ayak adedi otomatik/i.test(u)));

// ── 8) DELİK PLANI (CNC) ───────────────────────────────────────────────────
console.log('\n\x1b[1mCNC delik planı\x1b[0m');
const dp = D.hesapla(Object.assign({}, temel, { delikPlani: true, marka: 'Blum' }));
dogru('Delik planı açıkken delik üretilir', dp.delikler.length > 0);
dogru('Gövde bağlantısı delikleri Ø15', dp.delikler.some(d => d.cap === 15 && /Gövde/.test(d.tip)));
dogru('Raf pimi delikleri Ø5', dp.delikler.some(d => d.cap === 5 && /Raf pimi/.test(d.tip)));
dogru('Menteşe kap deliği Ø35', dp.delikler.some(d => d.cap === 35 && /kap/i.test(d.tip)));
const pimler = dp.delikler.filter(d => /Raf pimi/.test(d.tip));
dogru('Raf pimleri 32mm sistemine oturur',
  pimler.every(d => Math.abs(((d.y - 18) % 32)) < 0.01));
dogru('Tüm deliklerin koordinatı sayısal ve pozitif',
  dp.delikler.every(d => isFinite(d.x) && isFinite(d.y) && d.x >= 0 && d.y >= 0));

// ── 9) SINIR DURUMLARI ─────────────────────────────────────────────────────
console.log('\n\x1b[1mSınır durumları\x1b[0m');
const dar = D.hesapla(Object.assign({}, temel, { genislik: 200, bolmeler: [{ oran: 1 }, { oran: 1 }, { oran: 1 }, { oran: 1 }, { oran: 1 }, { oran: 1 }, { oran: 1 }, { oran: 1 }] }));
dogru('Bölme sayısı genişliğe sığmıyorsa uyarı verir', dar.uyarilar.some(u => /Bölme sayısı/.test(u)));
const oransiz = D.hesapla(Object.assign({}, temel, { genislik: 1200, bolmeler: [{}, {}] }));
es('Oran verilmezse eşit dağıtılır', oransiz.bolmeler[0].genislik, oransiz.bolmeler[1].genislik);
const farkli = D.hesapla(Object.assign({}, temel, { genislik: 1200, bolmeler: [{ oran: 2 }, { oran: 1 }] }));
dogru('Farklı oranlar orantılı genişlik üretir',
  Math.abs(farkli.bolmeler[0].genislik / farkli.bolmeler[1].genislik - 2) < 0.01);

console.log('\n' + '─'.repeat(50));
if (kaldi === 0) { console.log('\x1b[1;32m✓ ' + gecti + ' kontrolün tamamı geçti\x1b[0m'); process.exit(0); }
console.log('\x1b[1;31m✗ ' + kaldi + ' kontrol başarısız (' + gecti + ' geçti)\x1b[0m'); process.exit(1);
