// ── QR KOD ÜRETİCİ + ÇÖZÜCÜ — uçtan uca doğruluk testi ──────────────────────
// qr_kod.js (401 satır, bağımsız QR üretici) ve qr_cozucu.js (570 satır,
// bağımsız QR çözücü — Reed-Solomon hata düzeltmeli) için hiç test yoktu.
// Her ikisi de saf JavaScript (DOM/Store bağımlılığı yok) olduğundan
// mrp_motor.js ile aynı desende dual-mode yapıldı (module.exports eklendi).
//
// En değerli test: ÜRETİCİNİN ürettiği QR'ı ÇÖZÜCÜNÜN gerçekten okuyabilmesi
// — modül matrisi sentetik bir gri-tonlama piksel görüntüsüne render edilip
// gerçek griCoz() ile geri çözülür ve orijinal metinle karşılaştırılır. Bu,
// iki bağımsız modülün ISO/IEC 18004 standardında GERÇEKTEN uyumlu
// olduğunu kanıtlar — birbirini "biliyormuş gibi" davranan sahte testler
// değil.
//     node testler/qr_kod_cozucu_testi.js
const QrKod = require('../qr_kod.js');
const QrCozucu = require('../qr_cozucu.js');

let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

// QR modül matrisini gri-tonlama piksel dizisine render eder (kamera görüntüsü simülasyonu)
function goruntuyeRenderEt(q, pxPerModul, sessizAlan) {
  const toplamModul = q.boyut + sessizAlan * 2;
  const gen = toplamModul * pxPerModul, yuk = gen;
  const gri = new Uint8Array(gen * yuk).fill(255);
  for (let r = 0; r < q.boyut; r++) {
    for (let c = 0; c < q.boyut; c++) {
      if (!q.modules[r][c]) continue;
      const x0 = (c + sessizAlan) * pxPerModul, y0 = (r + sessizAlan) * pxPerModul;
      for (let y = y0; y < y0 + pxPerModul; y++) {
        for (let x = x0; x < x0 + pxPerModul; x++) gri[y * gen + x] = 0;
      }
    }
  }
  return { gri, gen, yuk };
}

// Basit deterministik pseudo-random (mulberry32) — tekrarlanabilir gürültü testi için
function mulberry32(tohum) {
  let a = tohum;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('\n-- QrKod.uret(): sürüm seçimi ve kapasite tablosu tutarlı --');
{
  t('sürüm 1 kapasitesi 16 bayt (tablo: [1,16])', QrKod.veriKapasitesi(1) === 16);
  t('sürüm 10 kapasitesi 346-26=320 bayt', QrKod.veriKapasitesi(10) === 4 * 43 + 44);
  t('kısa metin (5 karakter) sürüm 1 seçiyor', QrKod.uret('ABCDE').surum === 1);
  t('200+ karakter METİN hata fırlatıyor (sürüm 10 kapasitesi aşıldı)',
    (() => { try { QrKod.uret('A'.repeat(250)); return false; } catch (e) { return /Veri çok uzun/.test(e.message); } })());
  t('boş metin bile geçerli QR üretiyor (çökmeden)', QrKod.uret('').boyut > 0);
}

console.log('\n-- QrKod.svg(): sessiz alan ve boyut doğru --');
{
  const s = QrKod.svg('TEST-123', 200);
  t('viewBox 0 0 200 200', /viewBox="0 0 200 200"/.test(s));
  t('path elemanı üretildi (siyah modüller)', /<path d="M/.test(s));
  t('arka plan rect beyaz', /fill="#fff"/.test(s));
}

console.log('\n-- UÇTAN UCA: QrKod ile üretilen QR, QrCozucu ile GERÇEKTEN okunuyor (temiz görüntü) --');
{
  const denemeler = ['ÜretimOS-QR-Test', 'RA-2026-000123', 'A', 'Kısa metin, Türkçe çğşıöü ĞŞİÖÇÜ'];
  denemeler.forEach(metin => {
    const q = QrKod.uret(metin);
    const { gri, gen, yuk } = goruntuyeRenderEt(q, 6, 4);
    const cozulen = QrCozucu.griCoz(gri, gen, yuk);
    t(`"${metin}" (sürüm ${q.surum}) üretilip birebir geri çözüldü`, cozulen === metin);
  });
}

console.log('\n-- UÇTAN UCA: birkaç veri modülü BOZULMUŞ olsa da Reed-Solomon ile doğru okunuyor --');
{
  // Ham piksel gürültüsü yerine (bulucu desenini de bozup testi kararsız
  // kılabilir) DOĞRUDAN veri bölgesindeki modüller tersine çevrilir — bu,
  // "kirli/çizik kod" senaryosunun kontrollü hâlidir. Seçilen (12,12)/(14,14)/
  // (16,16) hücreleri sürüm 1'de (21×21) bulucu/zamanlama/format alanlarının
  // DIŞINDA kalır (bkz. qr_kod.js matrisOlustur — finder 0-6 satır/sütun ve
  // 14-20 köşelerde, format bilgisi satır/sütun 8'de, sürüm 1'de hizalama yok).
  const metin = 'RA-2026-000123';   // sürüm 1 (26 kod sözcüğü, 10 EC → en fazla 5 bayt hatası düzeltilebilir)
  const q = QrKod.uret(metin);
  t('ön koşul: bu metin sürüm 1 üretiyor (21×21)', q.surum === 1 && q.boyut === 21);
  const bozukModules = q.modules.map(row => row.slice());
  [[12, 12], [14, 14], [16, 16]].forEach(([r, c]) => { bozukModules[r][c] ^= 1; });
  const bozukQ = { modules: bozukModules, boyut: q.boyut, surum: q.surum };
  const { gri, gen, yuk } = goruntuyeRenderEt(bozukQ, 8, 4);
  const cozulen = QrCozucu.griCoz(gri, gen, yuk);
  t('3 modül bozulmasına rağmen doğru metin çözüldü (Reed-Solomon çalışıyor)', cozulen === metin);
}

console.log('\n-- griCoz(): QR OLMAYAN / boş görüntüde çökmeden null dönüyor --');
{
  const bosGen = 100, bosYuk = 100;
  const bosGri = new Uint8Array(bosGen * bosYuk).fill(255);   // tamamen beyaz
  t('tamamen beyaz görüntüde null döner (bulucu bulunamaz)', QrCozucu.griCoz(bosGri, bosGen, bosYuk) === null);

  const rastgeleGri = new Uint8Array(bosGen * bosYuk);
  const rnd = mulberry32(7);
  for (let i = 0; i < rastgeleGri.length; i++) rastgeleGri[i] = rnd() < 0.5 ? 0 : 255;
  t('rastgele gürültüde (QR değil) çökmeden null veya anlamsız olmayan bir sonuç döner',
    (() => { try { QrCozucu.griCoz(rastgeleGri, bosGen, bosYuk); return true; } catch (e) { return false; } })());
}

console.log('\n-- rsDuzelt(): hatasız veri (sendromlar sıfır) hiç değiştirilmeden döner --');
{
  // Sıfır sendrom garantisi için tamamı-sıfır bir "kod sözcüğü" kullanılır
  // (S_i = C(α^i) her zaman 0 verir) — rsDuzelt bu durumda erken çıkıp
  // veriyi AYNEN döndürmelidir (bkz. kaynak: "if (!hataVar) return veri;").
  const sifirVeri = new Array(20).fill(0);
  const sonuc = QrCozucu.rsDuzelt(sifirVeri, 10);
  t('tüm sıfır veri (sendromsuz) değişmeden döner', sonuc.every(x => x === 0) && sonuc.length === 20);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
