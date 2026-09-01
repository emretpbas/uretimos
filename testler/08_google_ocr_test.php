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
Test::dogru(strpos($r4['hata'] ?? '', 'geçerli bir satır bulamadı') !== false, 'Hata mesajı anlaşılır');

Test::dogru(googleOcrYanitAyristir([])['ok'] === false, 'Boş dizi girdisi çökmeden ok:false döner');
Test::dogru(googleOcrYanitAyristir(null)['ok'] === false, 'null girdi çökmeden ok:false döner (is_array korumaları)');

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
