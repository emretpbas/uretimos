<?php
// ── MONTAJ ŞEMASI — BAIDU OCR (ücretsiz kotalı bulut metin tanıma) ──────────
// İki katman test edilir (06_montaj_semasi_test.php ile AYNI desen):
//   1) baiduOcrYanitAyristir() — SAF fonksiyon, sabit (fixture) Baidu
//      general_basic yanıtlarıyla, ağa/DB'ye hiç dokunmadan.
//   2) api.php?action=montajSemasiOkuBaidu uç noktası — gerçek HTTP üzerinden,
//      ama yalnızca ağ ÇAĞRISINDAN ÖNCEKİ davranış (auth, rol, doğrulama,
//      API anahtarı yapılandırılmamışsa DÜRÜST hata). Gerçek Baidu çağrısı
//      test ortamında YAPILMAZ (URETIMOS_BAIDU_API_KEY / _SECRET_KEY bilerek
//      tanımsız bırakılır) — bu yüzden 503 + yapilandirmaEksik beklenir.

require_once __DIR__ . '/../baidu_ocr_ai.php';

Test::bolum('Baidu OCR — saf yanıt ayrıştırma (ağsız)');

// Geçerli bir Baidu general_basic yanıtı — words_result satırları
$gecerliYanit = [
    'words_result_num' => 4,
    'words_result' => [
        ['words' => '1 Oturma minderi 1'],
        ['words' => 'Vida M6X25MM 4'],
        ['words' => 'sadece metin, adet yok'],       // adet çıkmıyor — atlanmalı
        ['words' => '2 Boş isim 0'],                  // adet<=0 — atlanmalı
    ]
];
$r = baiduOcrYanitAyristir($gecerliYanit);
Test::dogru($r['ok'] === true, 'Geçerli words_result ok:true döner');
Test::esit(2, count($r['parcalar'] ?? []), 'Geçersiz satırlar (adet yok / adet<=0) sessizce elenir');
Test::esit('1', $r['parcalar'][0]['no'] ?? null, 'NO + AD + ADET deseni: no doğru ayrıştırılır');
Test::esit('Oturma minderi', $r['parcalar'][0]['tahminiAd'] ?? null, 'NO + AD + ADET deseni: ad doğru ayrıştırılır');
Test::esit(1.0, $r['parcalar'][0]['adet'] ?? null, 'NO + AD + ADET deseni: adet doğru ayrıştırılır');
Test::esit('', $r['parcalar'][1]['no'] ?? null, 'AD + ADET deseni (no yok): no boş kalır');
Test::esit('Vida M6X25MM', $r['parcalar'][1]['tahminiAd'] ?? null, 'AD + ADET deseni: ad/ölçü ayrımı yapılamaz, birlikte kalır');
Test::esit(4.0, $r['parcalar'][1]['adet'] ?? null, 'AD + ADET deseni: adet doğru ayrıştırılır');
Test::dogru(strpos($r['genelNot'] ?? '', 'Baidu OCR') !== false, 'genelNot Baidu OCR uyarısı taşır');

$sonucYok = ['words_result_num' => 0, 'words_result' => []];
$r2 = baiduOcrYanitAyristir($sonucYok);
Test::dogru($r2['ok'] === false, 'Boş words_result ok:false döner');
Test::dogru(strpos($r2['hata'] ?? '', 'geçerli bir satır bulamadı') !== false, 'Hata mesajı anlaşılır');

Test::dogru(baiduOcrYanitAyristir([])['ok'] === false, 'Boş dizi girdisi çökmeden ok:false döner');
Test::dogru(baiduOcrYanitAyristir(null)['ok'] === false, 'null girdi çökmeden ok:false döner (is_array korumaları)');

$bosSatirlar = ['words_result' => [['words' => ''], ['words' => '   ']]];
Test::dogru(baiduOcrYanitAyristir($bosSatirlar)['ok'] === false, 'Boş/whitespace satırlar sessizce elenir, hiçbiri çökmez');

Test::bolum('Baidu OCR — uç nokta (HTTP, gerçek ağ çağrısı YOK)');

$r = Test::istek('?action=montajSemasiOkuBaidu', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], false);
Test::esit(401, $r['kod'], 'Oturumsuz istek reddedilir (401)');

$depoTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'depo', 'sifre' => 'depo1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($depoTok), 'Depo girişi başarılı (rol testi için)');
$r = Test::istek('?action=montajSemasiOkuBaidu', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], $depoTok);
Test::esit(403, $r['kod'], 'Yetkisiz rol (depo) reddedilir (403) — ARGE/Teknik Ofis/Yönetim dışı erişemez');

$argeTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'arge', 'sifre' => 'arge1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($argeTok), 'ARGE girişi başarılı');

$r = Test::istek('?action=montajSemasiOkuBaidu', 'POST', ['gorselB64' => '', 'mediaType' => 'image/png'], $argeTok);
Test::esit(400, $r['kod'], 'Boş görsel reddedilir (400)');

$r = Test::istek('?action=montajSemasiOkuBaidu', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/gif'], $argeTok);
Test::esit(400, $r['kod'], 'Desteklenmeyen görsel türü reddedilir (400)');

// Test sunucusunda URETIMOS_BAIDU_API_KEY / _SECRET_KEY BİLEREK tanımsız —
// gerçek anahtar olmadan Baidu'ya bağlanmaya ÇALIŞMADAN, dürüst bir
// yapılandırma hatası dönmesi beklenir (fabrikasyon veri değil).
$r = Test::istek('?action=montajSemasiOkuBaidu', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], $argeTok);
Test::esit(503, $r['kod'], 'API anahtarları yapılandırılmamışken 503 döner (ağa hiç çıkmadan)');
Test::dogru($r['veri']['yapilandirmaEksik'] ?? false, 'yapilandirmaEksik bayrağı true — istemci bunu ayırt edebilir');
