// ── "Excelden Reçete İçe Aktar" — kayıt adımında GEREKSİZ tekrar indirme ────
// GERÇEK ÜRETİM SORUNU: 20.585 ürün / 96.692 yarı mamül kayıtlı canlı
// ortamda, önizleme ekranı açıldıktan sonra "İçe Aktar ve Kaydet" tuşuna
// basınca ekran ÇOK UZUN SÜRE (dakikalarca) donuyordu. Kök neden: hem
// renderImportPreview (önizleme ekranını hazırlarken) HEM DE onun içindeki
// "ei-confirm" tıklama olayı (kayıt sırasında) hammaddeler/yarımamuller/
// altMontajlar/paketler/ürünler koleksiyonlarının TAMAMINI AYRI AYRI
// indiriyordu — yani her ağır koleksiyon ÇİFT kez ağdan çekiliyordu. Bu
// test, kayıt adımının artık önizlemede ZATEN indirilmiş (mevcutHammaddeler
// vb.) dizileri YENİDEN KULLANDIĞINI, TEKRAR Store.X.all() ÇAĞIRMADIĞINI
// kaynak metin üzerinden doğrular (DOM/Store'a bağımlı kod olduğundan,
// bu testler diğer page_kartlar.js testleriyle AYNI "kaynak metin analizi"
// deseninde çalışır).

const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_kartlar.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

// "ei-confirm" tıklama olayının gövdesini (bir sonraki "document.getElementById('ei-back')"
// yani renderSolidworksBomPreview'in KENDİ confirm'üne kadar DEĞİL, bu
// spesifik renderImportPreview içindeki confirm'e ait blok) çıkar.
const baslangic = kaynak.indexOf("async function renderImportPreview(main, parsed)");
const bitis = kaynak.indexOf("function mevcutYarimamuller_ref");
const fonksiyonGovdesi = kaynak.slice(baslangic, bitis);

console.log('\n-- KOD KONTROLU: önizlemede indirilen diziler kayıt adımında TEKRAR İNDİRİLMİYOR --');
t('renderImportPreview başında mevcutHammaddeler/mevcutYarimamuller/mevcutUrunler/mevcutAltMontajlar/mevcutPaketler TEK SEFERDE (Promise.all) indiriliyor',
  fonksiyonGovdesi.includes('const [mevcutHammaddeler, mevcutYarimamuller, mevcutUrunler, mevcutAltMontajlar, mevcutPaketler] = await Promise.all('));

t('kayıt adımında hammaddeler artık mevcutHammaddeler\'DEN atanıyor (await Store.hammaddeler.all() TEKRARI YOK)',
  fonksiyonGovdesi.includes('const hammaddeler = mevcutHammaddeler;') &&
  !fonksiyonGovdesi.includes('const hammaddeler = await Store.hammaddeler.all();'));

t('kayıt adımında yarimamuller artık mevcutYarimamuller\'DEN atanıyor (tekrar indirme YOK)',
  fonksiyonGovdesi.includes('const yarimamuller = mevcutYarimamuller;') &&
  !fonksiyonGovdesi.includes('const yarimamuller = await Store.yarimamuller.all();'));

t('kayıt adımında altMontajlar artık mevcutAltMontajlar\'DAN atanıyor (tekrar indirme YOK)',
  fonksiyonGovdesi.includes('const altMontajlar = mevcutAltMontajlar;') &&
  !fonksiyonGovdesi.includes('const altMontajlar = await Store.altMontajlar.all();'));

t('kayıt adımında paketler artık mevcutPaketler\'DEN atanıyor (tekrar indirme YOK)',
  fonksiyonGovdesi.includes('const paketler = mevcutPaketler;') &&
  !fonksiyonGovdesi.includes('const paketler = await Store.paketler.all();'));

t('kayıt adımında urunler artık mevcutUrunler\'DEN atanıyor (tekrar indirme YOK)',
  fonksiyonGovdesi.includes('const urunler = mevcutUrunler;') &&
  !fonksiyonGovdesi.includes('const urunler = await Store.urunler.all();'));

t('receteler (önizlemede HİÇ indirilmediği için) kayıt adımında İLK ve TEK kez indiriliyor — bu çağrı KALMALI',
  fonksiyonGovdesi.includes('const receteler = await Store.receteler.all();'));

console.log('\n-- TOPLAM ÇAĞRI SAYISI: her ağır koleksiyon için Store.X.all() artık SADECE 1 kez geçiyor --');
['hammaddeler', 'yarimamuller', 'altMontajlar', 'paketler', 'urunler'].forEach(ad => {
  const kalip = new RegExp('Store\\.' + ad + '\\.all\\(\\)', 'g');
  const sayi = (fonksiyonGovdesi.match(kalip) || []).length;
  t(`Store.${ad}.all() renderImportPreview içinde SADECE 1 kez çağrılıyor (çift indirme YOK) — bulunan: ${sayi}`, sayi === 1);
});

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
