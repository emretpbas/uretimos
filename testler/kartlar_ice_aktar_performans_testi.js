// ── "Excelden Reçete İçe Aktar" — kayıt adımında GEREKSİZ tekrar indirme ────
// GERÇEK ÜRETİM SORUNU (1. tur): 20.585 ürün / 96.692 yarı mamül kayıtlı
// canlı ortamda, önizleme ekranı açıldıktan sonra "İçe Aktar ve Kaydet"
// tuşuna basınca ekran ÇOK UZUN SÜRE (dakikalarca) donuyordu. Kök neden: hem
// renderImportPreview (önizleme ekranını hazırlarken) HEM DE onun içindeki
// "ei-confirm" tıklama olayı (kayıt sırasında) hammaddeler/yarımamuller/
// altMontajlar/paketler/ürünler koleksiyonlarının TAMAMINI AYRI AYRI
// indiriyordu — yani her ağır koleksiyon ÇİFT kez ağdan çekiliyordu. Bu 5
// koleksiyon düzeltildikten SONRA kullanıcı "içe aktar yine tepkisiz" diye
// BİR DAHA bildirdi (2. tur) — çünkü receteler önizlemede hiç indirilmediği
// için kayıt adımında hâlâ TAM (Store.receteler.all()) çekiliyordu; bu da
// koleksiyonların en ağırı olduğundan TEK başına donmaya yetiyordu. Bu test
// artık hem (a) diğer 5 koleksiyonun önizlemede ZATEN indirilmiş dizileri
// YENİDEN KULLANDIĞINI hem de (b) receteler'in TAM DEĞİL, sadece ilgili
// id'lerle (Store.receteBul) HEDEFLİ indirildiğini kaynak metin üzerinden
// doğrular (DOM/Store'a bağımlı kod olduğundan, bu testler diğer
// page_kartlar.js testleriyle AYNI "kaynak metin analizi" deseninde çalışır).

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

t('receteler artık TAM indirilmiyor (Store.receteler.all() çağrısı YOK) — yerine hedefli Store.receteBul kullanılıyor',
  !fonksiyonGovdesi.includes('await Store.receteler.all()') &&
  fonksiyonGovdesi.includes('const receteler = await Store.receteBul({ ids: altReceteIdleri, urunIds: [urun.id] });'));

t('receteBul için istenen id listesi, yarı mamül/alt montaj/paket tipine göre DOĞRU sabit ön ek (RC-YM-/RC-AM-/RC-PKT-) ile üretiliyor',
  fonksiyonGovdesi.includes("return (tip === 'altmontaj' ? 'RC-AM-' : tip === 'paket' ? 'RC-PKT-' : 'RC-YM-') + kartId;"));

console.log('\n-- TOPLAM ÇAĞRI SAYISI: her ağır koleksiyon için Store.X.all() artık SADECE 1 kez geçiyor --');
['hammaddeler', 'yarimamuller', 'altMontajlar', 'paketler', 'urunler'].forEach(ad => {
  const kalip = new RegExp('Store\\.' + ad + '\\.all\\(\\)', 'g');
  const sayi = (fonksiyonGovdesi.match(kalip) || []).length;
  t(`Store.${ad}.all() renderImportPreview içinde SADECE 1 kez çağrılıyor (çift indirme YOK) — bulunan: ${sayi}`, sayi === 1);
});

t('Store.receteler.all() (TAM koleksiyon) artık hiç çağrılmıyor (bulunan: 0 olmalı)',
  (fonksiyonGovdesi.match(/Store\.receteler\.all\(\)/g) || []).length === 0);

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
