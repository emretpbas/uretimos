<?php
// ── MONTAJ ŞEMASI — GOOGLE CLOUD VISION OCR ─────────────────────────────────
// İki katman test edilir (06/07 ile AYNI desen):
//   1) googleOcrYanitAyristir() — SAF fonksiyon, sabit (fixture) Google Vision
//      TEXT_DETECTION yanıtlarıyla, ağa/DB'ye hiç dokunmadan.
//   2) api.php?action=montajSemasiOkuGoogle uç noktası — gerçek HTTP üzerinden,
//      ama yalnızca ağ ÇAĞRISINDAN ÖNCEKİ davranış (auth, rol, doğrulama,
//      API anahtarı yapılandırılmamışsa DÜRÜST hata). Gerçek Google çağrısı
//      test ortamında YAPILMAZ (URETIMOS_GOOGLE_VISION_KEY bilerek tanımsız
//      bırakılır) — bu yüzden 503 + yapilandirmaEksik beklenir.

require_once __DIR__ . '/../google_ocr_ai.php';

Test::bolum('Google Vision OCR — saf yanıt ayrıştırma (ağsız)');

// Geçerli bir TEXT_DETECTION yanıtı — fullTextAnnotation.text tek blok, satırlar \n ile
$gecerliYanit = [
    'responses' => [[
        'fullTextAnnotation' => ['text' => "1 Oturma minderi 1\nVida M6X25MM 4\nsadece metin, adet yok\n2 Boş isim 0\n"]
    ]]
];
$r = googleOcrYanitAyristir($gecerliYanit);
Test::dogru($r['ok'] === true, 'Geçerli fullTextAnnotation ok:true döner');
Test::esit(2, count($r['parcalar'] ?? []), 'Geçersiz satırlar (adet yok / adet<=0) sessizce elenir');
Test::esit('1', $r['parcalar'][0]['no'] ?? null, 'NO + AD + ADET deseni: no doğru ayrıştırılır');
Test::esit('Oturma minderi', $r['parcalar'][0]['tahminiAd'] ?? null, 'NO + AD + ADET deseni: ad doğru ayrıştırılır');
Test::esit(1.0, $r['parcalar'][0]['adet'] ?? null, 'NO + AD + ADET deseni: adet doğru ayrıştırılır');
Test::esit('', $r['parcalar'][1]['no'] ?? null, 'AD + ADET deseni (no yok): no boş kalır');
Test::esit('Vida M6X25MM', $r['parcalar'][1]['tahminiAd'] ?? null, 'AD + ADET deseni: ad/ölçü ayrımı yapılamaz, birlikte kalır');
Test::esit(4.0, $r['parcalar'][1]['adet'] ?? null, 'AD + ADET deseni: adet doğru ayrıştırılır');
Test::dogru(strpos($r['genelNot'] ?? '', 'Google Cloud Vision') !== false, 'genelNot Google Vision uyarısı taşır');

// textAnnotations[0].description da desteklenmeli (fullTextAnnotation yoksa geri düşüş)
$sadeceTextAnnotations = [
    'responses' => [[
        'textAnnotations' => [['description' => "5 Somun M6 10"]]
    ]]
];
$r2 = googleOcrYanitAyristir($sadeceTextAnnotations);
Test::dogru($r2['ok'] === true, 'fullTextAnnotation yoksa textAnnotations[0].description kullanılır');
Test::esit('Somun M6', $r2['parcalar'][0]['tahminiAd'] ?? null, 'textAnnotations yolundan doğru ayrıştırılır');

// Google Vision hata döndürdüğünde (responses[0].error)
$hataYaniti = ['responses' => [['error' => ['message' => 'Invalid image content']]]];
$r3 = googleOcrYanitAyristir($hataYaniti);
Test::dogru($r3['ok'] === false, 'responses[0].error varsa ok:false döner');
Test::dogru(strpos($r3['hata'] ?? '', 'Invalid image content') !== false, 'Google hata mesajı taşınır');

$sonucYok = ['responses' => [['fullTextAnnotation' => ['text' => '']]]];
$r4 = googleOcrYanitAyristir($sonucYok);
Test::dogru($r4['ok'] === false, 'Boş metin ok:false döner');
Test::dogru(strpos($r4['hata'] ?? '', 'geçerli bir satır/tablo bulamadı') !== false, 'Hata mesajı anlaşılır');

Test::dogru(googleOcrYanitAyristir([])['ok'] === false, 'Boş dizi girdisi çökmeden ok:false döner');
Test::dogru(googleOcrYanitAyristir(null)['ok'] === false, 'null girdi çökmeden ok:false döner (is_array korumaları)');

Test::bolum('Google Vision OCR — YATAY NO/SIZE/QTY tablosu (konum tabanlı yeniden inşa)');

// Gerçek bir montaj şeması PDF'inde görülen düzeni taklit eder: NO satırı
// 1..6, SIZE satırı yalnızca bazı sütunlarda dolu (4/5/6 vidalı, 1/2/3'te
// ölçü yok), QTY satırı hepsinde dolu. Ayrıca sayfanın BAŞKA bir yerinde
// ("Step 1".."Step 3" diyagram alt yazıları gibi) tabloyla İLGİSİZ kelimeler
// var — eski satır-bazlı ayrıştırmanın yanlış eşleştirdiği tam senaryo.
function kelimeOlustur($metin, $x, $y) {
    return ['description' => $metin, 'boundingPoly' => ['vertices' => [
        ['x' => $x - 10, 'y' => $y - 8], ['x' => $x + 10, 'y' => $y - 8],
        ['x' => $x + 10, 'y' => $y + 8], ['x' => $x - 10, 'y' => $y + 8],
    ]]];
}
$sutunX = [100, 150, 200, 250, 300, 350];
$kelimeler = [
    ['description' => 'TÜM SAYFA METNİ (kullanılmaz)', 'boundingPoly' => ['vertices' => []]], // index 0
    // Tabloyla İLGİSİZ diyagram alt yazıları — başka bir y bandında
    kelimeOlustur('Step', 60, 50), kelimeOlustur('1', 90, 50),
    kelimeOlustur('Step', 160, 50), kelimeOlustur('2', 190, 50),
    kelimeOlustur('Step', 260, 50), kelimeOlustur('3', 290, 50),
    // NO satırı (etiket + 6 sütun)
    kelimeOlustur('NO', 50, 500),
    kelimeOlustur('1', $sutunX[0], 500), kelimeOlustur('2', $sutunX[1], 500),
    kelimeOlustur('3', $sutunX[2], 500), kelimeOlustur('4', $sutunX[3], 500),
    kelimeOlustur('5', $sutunX[4], 500), kelimeOlustur('6', $sutunX[5], 500),
    // SIZE satırı — yalnızca 4/5/6. sütunlarda değer var (1/2/3 vidasız parça)
    kelimeOlustur('SIZE', 50, 550),
    kelimeOlustur('M4X20MM', $sutunX[3], 550), kelimeOlustur('M4X30MM', $sutunX[4], 550),
    kelimeOlustur('M5X40MM', $sutunX[5], 550),
    // QTY satırı (etiket + 6 sütun)
    kelimeOlustur('QTY', 50, 600),
    kelimeOlustur('1pcs', $sutunX[0], 600), kelimeOlustur('1pcs', $sutunX[1], 600),
    kelimeOlustur('1pcs', $sutunX[2], 600), kelimeOlustur('2pcs', $sutunX[3], 600),
    kelimeOlustur('2pcs', $sutunX[4], 600), kelimeOlustur('3pcs', $sutunX[5], 600),
];
$yatayTabloYaniti = ['responses' => [['textAnnotations' => $kelimeler]]];
$r5 = googleOcrYanitAyristir($yatayTabloYaniti);
Test::dogru($r5['ok'] === true, 'Yatay tablo ok:true döner');
Test::esit(6, count($r5['parcalar'] ?? []), 'Tam 6 sütun/parça bulundu ("Step N" dağıtıcıları dahil değil)');
Test::esit('1', $r5['parcalar'][0]['no'] ?? null, '1. sütunun NO değeri doğru');
Test::esit(1.0, $r5['parcalar'][0]['adet'] ?? null, '1. sütunun adedi doğru (1pcs → 1)');
Test::esit('', $r5['parcalar'][0]['olcuSpec'] ?? null, '1. sütunda SIZE yok — boş kalır (vidasız parça)');
Test::esit('M4X20MM', $r5['parcalar'][3]['olcuSpec'] ?? null, '4. sütunun SIZE değeri doğru eşleşti');
Test::esit(3.0, $r5['parcalar'][5]['adet'] ?? null, '6. sütunun adedi doğru (3pcs → 3)');
Test::dogru(strpos($r5['parcalar'][0]['tahminiAd'] ?? '', 'Step') === false,
    '"Step" dağıtıcı kelimesi YANLIŞLIKLA parça adına karışmadı');
Test::dogru(strpos($r5['genelNot'] ?? '', 'KONUM') !== false, 'genelNot yeniden inşa yöntemini açıklıyor');
Test::dogru(strpos($r5['genelNot'] ?? '', 'SİZ adlandırmalısınız') !== false,
    'genelNot, parça adının OCR ile OKUNAMAYACAĞINI (yer tutucu olduğunu) açıkça belirtiyor');

// NO/QTY etiketleri yoksa (bu tablo düzeninde değilse) eski satır-bazlı
// ayrıştırmaya SESSİZCE düşülmeli — yukarıdaki "Geçerli fullTextAnnotation"
// testi zaten bunu dolaylı doğruluyor (o yanıtta textAnnotations[1..] yok).
$sadeceDagiticiKelimeler = ['responses' => [['textAnnotations' => [
    ['description' => 'hepsi', 'boundingPoly' => ['vertices' => []]],
    kelimeOlustur('Step', 60, 50), kelimeOlustur('1', 90, 50),
]]]];
$r6 = googleOcrYanitAyristir($sadeceDagiticiKelimeler);
Test::dogru($r6['ok'] === false, 'NO/QTY etiketi yoksa tablo yeniden inşası devreye girmiyor (ok:false — bulunacak satır da yok)');

Test::bolum('Google Vision OCR — uç nokta (HTTP, gerçek ağ çağrısı YOK)');

$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], false);
Test::esit(401, $r['kod'], 'Oturumsuz istek reddedilir (401)');

$depoTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'depo', 'sifre' => 'depo1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($depoTok), 'Depo girişi başarılı (rol testi için)');
$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], $depoTok);
Test::esit(403, $r['kod'], 'Yetkisiz rol (depo) reddedilir (403) — ARGE/Teknik Ofis/Yönetim dışı erişemez');

$argeTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'arge', 'sifre' => 'arge1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($argeTok), 'ARGE girişi başarılı');

$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => '', 'mediaType' => 'image/png'], $argeTok);
Test::esit(400, $r['kod'], 'Boş görsel reddedilir (400)');

$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/gif'], $argeTok);
Test::esit(400, $r['kod'], 'Desteklenmeyen görsel türü reddedilir (400)');

// Test sunucusunda URETIMOS_GOOGLE_VISION_KEY BİLEREK tanımsız — gerçek
// anahtar olmadan Google'a bağlanmaya ÇALIŞMADAN, dürüst bir yapılandırma
// hatası dönmesi beklenir (fabrikasyon veri değil).
$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], $argeTok);
Test::esit(503, $r['kod'], 'API anahtarı yapılandırılmamışken 503 döner (ağa hiç çıkmadan)');
Test::dogru($r['veri']['yapilandirmaEksik'] ?? false, 'yapilandirmaEksik bayrağı true — istemci bunu ayırt edebilir');
