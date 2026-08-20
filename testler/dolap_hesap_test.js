// ── DOLAP ÖLÇÜ HESABI ───────────────────────────────────────────────────────
// Bu testler Node ile çalışır (saf hesap, tarayıcı gerekmez):
//     node testler/dolap_hesap_test.js
// Yanlış bir ölçü formülü kesilen plakayı çöpe atar; bu test onu önler.

const D = require('../dolap_hesap.js');
let gecti = 0, kaldi = 0;
const es = (ad, beklenen, gercek) => {
  const ok = Math.abs(beklenen - gercek) < 0.01;
  console.log('  ' + (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad +
    (ok ? '' : '  \x1b[33mbeklenen ' + beklenen + ', gelen ' + gercek + '\x1b[0m'));
  ok ? gecti++ : kaldi++;
};
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

console.log('\n\x1b[1mDolap ölçü hesabı — 800×2000×500, 18mm, yan_tam, 100mm baza\x1b[0m');
const r = D.hesapla({
  genislik: 800, yukseklik: 2000, derinlik: 500, panelKalinlik: 18,
  govdeTipi: 'yan_tam', bazaTipi: 'baza', bazaYukseklik: 100,
  kapakSayisi: 2, kapakTipi: 'tam_bini', fuga: 3,
  rafSabit: 1, rafHareketli: 3, arkalikTipi: 'kanalli', kanalDerinlik: 8
});
const bul = (rol) => r.paneller.find(p => p.rol === rol);

// Gövde: yan panel tam boy (govdeH = 2000 − 100 baza = 1900)
es('Yan panel net boyu = govde yüksekliği (1900)', 1900, bul('yan').netBoy);
es('Yan panel net eni = derinlik (500)', 500, bul('yan').netEn);
es('Yan panel adedi 2', 2, bul('yan').adet);
// Üst/alt panel yanların arasına girer: W − 2t = 800 − 36 = 764
es('Üst panel eni = W − 2t (764)', 764, bul('ust').netEn);
// Raf: W − 2t genişlik, derinlik − geri çekme − kanal payı
es('Sabit raf eni = 764', 764, bul('raf_sabit').netEn);
// Kapak tam bini: (W − (n−1)f)/n = (800−3)/2 = 398.5 ; boy = govdeH − 2f = 1894
es('Kapak eni tam bini (398.5)', 398.5, bul('kapak').netEn);
es('Kapak boyu = govdeH − 2·fuga (1894)', 1894, bul('kapak').netBoy);
// Arkalık kanallı: (W−2t+2k) × (govdeH−2t+2k) = 780 × 1880
es('Arkalık eni kanallı (780)', 780, bul('arkalik').netEn);
es('Arkalık boyu kanallı (1880)', 1880, bul('arkalik').netBoy);
// Kaba ölçü = net + 2·kesim payı (10) her kenardan
es('Yan panel kaba boyu = net + 2·pay (1920)', 1920, bul('yan').kabaBoy);
// Menteşe: 1894mm kapak → 4 (Blum)
es('Kapak başına menteşe (1894mm → 4)', 4, D.menteseSayisi(bul('kapak')));
const mentese = r.hirdavat.find(h => h.ad === 'Menteşe');
es('Toplam menteşe = 2 kapak × 4 (8)', 8, mentese.adet);
dogru('Kulp 2 adet (kapak sayısı kadar)', r.hirdavat.find(h => h.ad === 'Kulp').adet === 2);
dogru('Fire oranı makul (%3–15 arası)', r.ozet.fireYuzde >= 3 && r.ozet.fireYuzde <= 15);

console.log('\n\x1b[1mGövde tipi: ust_tam (üst/alt tam en, yanlar arada)\x1b[0m');
const r2 = D.hesapla({ genislik: 600, yukseklik: 720, derinlik: 320, panelKalinlik: 18,
  govdeTipi: 'ust_tam', bazaTipi: 'ayak', ayakAdet: 4, kapakSayisi: 0, rafSabit: 0, rafHareketli: 1 });
es('Üst panel tam en (600)', 600, r2.paneller.find(p => p.rol === 'ust').netEn);
es('Yan panel = H − 2t (720−36=684, ayak baza yok)', 684, r2.paneller.find(p => p.rol === 'yan').netBoy);
dogru('Ayak 4 adet hırdavata eklendi', (r2.hirdavat.find(h => /ayak/i.test(h.ad)) || {}).adet === 4);
dogru('Kapak yoksa menteşe hırdavatı da yok', !r2.hirdavat.find(h => h.ad === 'Menteşe'));

console.log('\n\x1b[1mKapak tipi: içerlek\x1b[0m');
const r3 = D.hesapla({ genislik: 500, yukseklik: 700, derinlik: 300, panelKalinlik: 18,
  govdeTipi: 'yan_tam', bazaTipi: 'yok', kapakSayisi: 1, kapakTipi: 'icerlek', fuga: 2 });
// içerlek boy = govdeH − 2t − 2f = 700 − 36 − 4 = 660
es('İçerlek kapak boyu (700−2t−2f=660)', 660, r3.paneller.find(p => p.rol === 'kapak').netBoy);
// içerlek en = (W − 2t − (n+1)f)/n = (500−36−4)/1 = 460
es('İçerlek kapak eni (500−2t−2f=460)', 460, r3.paneller.find(p => p.rol === 'kapak').netEn);

console.log('\n\x1b[1mSınır durumları\x1b[0m');
const r4 = D.hesapla({ genislik: 0, yukseklik: 100, derinlik: 100 });
dogru('Sıfır genişlik uyarı veriyor, panel üretmiyor', r4.paneller.length === 0 && r4.uyarilar.length > 0);
const r5 = D.hesapla({ genislik: 800, yukseklik: 200, derinlik: 500, bazaYukseklik: 100, ustTac: true, ustTacYukseklik: 150 });
dogru('Baza+taç yükseklikten büyükse uyarı', r5.uyarilar.some(u => /büyük|negatif|küçük/i.test(u)));

console.log('\n' + '─'.repeat(50));
if (kaldi === 0) { console.log('\x1b[1;32m✓ ' + gecti + ' kontrolün tamamı geçti\x1b[0m'); process.exit(0); }
console.log('\x1b[1;31m✗ ' + kaldi + ' kontrol başarısız (' + gecti + ' geçti)\x1b[0m'); process.exit(1);
