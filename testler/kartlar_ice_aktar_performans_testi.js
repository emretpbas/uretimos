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
  fonksiyonGovdesi.includes("Store.receteBul({ ids: altReceteIdleri, urunIds: [urun.id] })"));

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

console.log('\n-- KOD KONTROLU: "yine tepkisiz" (3. tur) — görünür ilerleme YOK ve çoklu tıklama koruması YOKTU --');
// GERÇEK ÜRETİM SORUNU (3. tur): kullanıcı "basıldığı belli ama reçeteyi
// kaydetmiyor/güncellemiyor" diye bildirdi. Kök neden: api.php'nin 'patch'
// ucu her istekte İLGİLİ KOLEKSİYONUN TAMAMINI (tek JSON blob) sunucuda
// okuyup yeniden yazdığından (receteler gibi ağır koleksiyonlarda) bir
// kayıt onlarca saniye sürebiliyor; düğme bu süre boyunca DEVRE DIŞI
// BIRAKILMIYORDU ve görünür bir ilerleme de yoktu — kullanıcı "tepkisiz"
// sanıp tekrar tekrar bastı, bu da AYNI akışın eşzamanlı birden fazla
// kopyasını (yarışan closure dizileri + çakışan patch istekleri) tetikleyip
// bazı kayıtların (özellikle reçete) kaybolmasına yol açabiliyordu.
t('"ei-confirm" tıklandığında düğme HEMEN devre dışı bırakılıyor (çoklu/çakışan tıklama koruması)',
  fonksiyonGovdesi.includes('if (btnConfirm.disabled) return;') &&
  fonksiyonGovdesi.includes('btnConfirm.disabled = true;'));
t('kayıt adımları boyunca düğme metni GÖRÜNÜR ilerleme gösterecek şekilde güncelleniyor (asamaGoster)',
  (fonksiyonGovdesi.match(/asamaGoster\(/g) || []).length >= 3);
t('hata durumunda düğme TEKRAR tıklanabilir hale getiriliyor (kullanıcı yeniden deneyebilsin)',
  fonksiyonGovdesi.includes('btnConfirm.disabled = false;') &&
  fonksiyonGovdesi.includes("btnConfirm.textContent = 'İçe Aktar ve Kaydet';"));
t('receteler koleksiyonuna artık TEK bir parcaliKaydet çağrısıyla yazılıyor (kök + alt reçeteler BİRLİKTE — önceden İKİ AYRI yazma, ağır koleksiyonun TAMAMINI sunucuda iki kez okutup yazdırıyordu)',
  (fonksiyonGovdesi.match(/await parcaliKaydet\('receteler', receteler, _onceki_receteler\);/g) || []).length === 1);

console.log('\n-- KOD KONTROLU: "yine tepkisiz" (4. tur) — göç sonrası bile dakikalarca süren SIRALI (sequential) istekler --');
// GERÇEK ÜRETİM SORUNU (4. tur): kv_items göçü tamamlandıktan SONRA bile
// kullanıcı "aynı ya da farklı 2-3 dakika sürüyor" diye bildirdi. Kök neden:
// hammaddeler/yarımamuller/altMontajlar/paketler/ürünler/receteBul için 6
// bağımsız istek BİRBİRİ ARDINA (await ... await ... await ...) gönderiliyordu;
// GoDaddy'nin paylaşımlı sunucusunda her isteğin kendi ağ gidiş-dönüş
// maliyeti olduğundan bu kolayca dakikalara ulaşıyordu. Bu 6 işlemin hiçbiri
// birbirinin SONUCUNA bağımlı olmadığından (hepsi yalnızca önizlemede zaten
// indirilmiş veri + istemci tarafında üretilmiş id'ler kullanıyor), artık
// Promise.all ile EŞZAMANLI gönderiliyor.
t('hammaddeler/yarımamuller/altMontajlar/paketler/ürünler/receteBul artık TEK bir Promise.all içinde EŞZAMANLI gönderiliyor (sıralı await ZİNCİRİ YOK)',
  fonksiyonGovdesi.includes("const [, , , , , receteler] = await Promise.all([") &&
  fonksiyonGovdesi.includes("parcaliKaydet('hammaddeler', hammaddeler, _onceki_hammaddeler),") &&
  fonksiyonGovdesi.includes("parcaliKaydet('yarimamuller', yarimamuller, _onceki_yarimamuller),") &&
  fonksiyonGovdesi.includes("parcaliKaydet('altMontajlar', altMontajlar, _onceki_altMontajlar),") &&
  fonksiyonGovdesi.includes("parcaliKaydet('paketler', paketler, _onceki_paketler),") &&
  fonksiyonGovdesi.includes("parcaliKaydet('urunler', urunler, _onceki_urunler),") &&
  fonksiyonGovdesi.includes("Store.receteBul({ ids: altReceteIdleri, urunIds: [urun.id] })"));
t('hammaddeler artık urunler/receteBul\'dan ÖNCE tek başına await EDİLMİYOR (sıralı zincir kırıldı)',
  !fonksiyonGovdesi.includes("await parcaliKaydet('hammaddeler', hammaddeler, _onceki_hammaddeler);"));
t('yarımamuller/altMontajlar/paketler artık ayrı ayrı await EDİLMİYOR (sıralı zincir kırıldı)',
  !fonksiyonGovdesi.includes("await parcaliKaydet('yarimamuller', yarimamuller, _onceki_yarimamuller);") &&
  !fonksiyonGovdesi.includes("await parcaliKaydet('altMontajlar', altMontajlar, _onceki_altMontajlar);") &&
  !fonksiyonGovdesi.includes("await parcaliKaydet('paketler', paketler, _onceki_paketler);"));
t('urunler artık tek başına await EDİLMİYOR (sıralı zincir kırıldı)',
  !fonksiyonGovdesi.includes("await parcaliKaydet('urunler', urunler, _onceki_urunler);"));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
