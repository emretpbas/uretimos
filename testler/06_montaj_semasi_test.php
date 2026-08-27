<?php
// ── MONTAJ ŞEMASI AI GÖRME — REÇETE ÇIKARIMI ────────────────────────────────
// İki katman test edilir:
//   1) montajSemasiYanitAyristir() — SAF fonksiyon, sabit (fixture) Anthropic
//      yanıtlarıyla, ağa/DB'ye hiç dokunmadan. Asıl iş mantığı burada.
//   2) api.php?action=montajSemasiOku uç noktası — gerçek HTTP üzerinden,
//      ama yalnızca ağ ÇAĞRISINDAN ÖNCEKİ davranış (auth, rol, doğrulama,
//      API anahtarı yapılandırılmamışsa DÜRÜST hata). Gerçek Anthropic
//      çağrısı test ortamında YAPILMAZ (URETIMOS_ANTHROPIC_KEY bilerek
//      tanımsız bırakılır) — bu yüzden 503 + yapilandirmaEksik beklenir.

require_once __DIR__ . '/../montaj_semasi_ai.php';

Test::bolum('Montaj Şeması AI — saf yanıt ayrıştırma (ağsız)');

// Geçerli bir Anthropic tool_use yanıtı (6208D örneğine benzer)
$gecerliYanit = [
    'content' => [
        ['type' => 'text', 'text' => 'ön açıklama'],
        ['type' => 'tool_use', 'name' => 'receteKalemleriBildir', 'input' => [
            'parcalar' => [
                ['no' => '1', 'tahminiAd' => 'Oturma minderi', 'olcuSpec' => '', 'adet' => 1],
                ['no' => '6', 'tahminiAd' => 'Vida', 'olcuSpec' => 'M6X25MM', 'adet' => 4],
                ['no' => 'x', 'tahminiAd' => '', 'adet' => 3],           // ad boş — atlanmalı
                ['no' => 'y', 'tahminiAd' => 'Geçersiz adet', 'adet' => 0], // adet<=0 — atlanmalı
                ['no' => 'z', 'tahminiAd' => 'Geçersiz adet2', 'adet' => 'abc'], // sayısal değil — atlanmalı
            ],
            'genelNot' => 'Alt sıradaki iki vida net görünmüyor.'
        ]]
    ]
];
$r = montajSemasiYanitAyristir($gecerliYanit);
Test::dogru($r['ok'] === true, 'Geçerli tool_use yanıtı ok:true döner');
Test::esit(2, count($r['parcalar'] ?? []), 'Geçersiz satırlar (boş ad / adet<=0 / sayısal olmayan) sessizce elenir');
Test::esit('Oturma minderi', $r['parcalar'][0]['tahminiAd'] ?? null, 'İlk satırın adı doğru taşınır');
Test::esit('M6X25MM', $r['parcalar'][1]['olcuSpec'] ?? null, 'Ölçü/spec alanı doğru taşınır');
Test::esit(4.0, $r['parcalar'][1]['adet'] ?? null, 'Adet float\'a çevrilir');
Test::esit('Alt sıradaki iki vida net görünmüyor.', $r['genelNot'] ?? null, 'genelNot doğru taşınır');

$toolYok = ['content' => [['type' => 'text', 'text' => 'sadece metin, tool_use yok']]];
$r2 = montajSemasiYanitAyristir($toolYok);
Test::dogru($r2['ok'] === false, 'tool_use bloğu yoksa ok:false');

$yanlisAracAdi = ['content' => [['type' => 'tool_use', 'name' => 'baskaBirArac', 'input' => ['parcalar' => []]]]];
$r3 = montajSemasiYanitAyristir($yanlisAracAdi);
Test::dogru($r3['ok'] === false, 'Farklı isimli tool_use tanınmaz (ok:false)');

$parcalarDizisiYok = ['content' => [['type' => 'tool_use', 'name' => 'receteKalemleriBildir', 'input' => ['genelNot' => 'x']]]];
$r4 = montajSemasiYanitAyristir($parcalarDizisiYok);
Test::dogru($r4['ok'] === false, 'input.parcalar eksikse ok:false');

$hepsiGecersiz = ['content' => [['type' => 'tool_use', 'name' => 'receteKalemleriBildir', 'input' => [
    'parcalar' => [['no' => '1', 'tahminiAd' => '', 'adet' => 0]]
]]]];
$r5 = montajSemasiYanitAyristir($hepsiGecersiz);
Test::dogru($r5['ok'] === false, 'Tüm satırlar geçersizse ok:false');
Test::dogru(strpos($r5['hata'] ?? '', 'geçerli bir parça bulamadı') !== false, 'Hata mesajı anlaşılır');

Test::dogru(montajSemasiYanitAyristir([])['ok'] === false, 'Boş dizi girdisi çökmeden ok:false döner');
Test::dogru(montajSemasiYanitAyristir(null)['ok'] === false, 'null girdi çökmeden ok:false döner (is_array korumaları)');

Test::bolum('Montaj Şeması AI — uç nokta (HTTP, gerçek ağ çağrısı YOK)');

$r = Test::istek('?action=montajSemasiOku', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], false);
Test::esit(401, $r['kod'], 'Oturumsuz istek reddedilir (401)');

$depoTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'depo', 'sifre' => 'depo1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($depoTok), 'Depo girişi başarılı (rol testi için)');
$r = Test::istek('?action=montajSemasiOku', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], $depoTok);
Test::esit(403, $r['kod'], 'Yetkisiz rol (depo) reddedilir (403) — ARGE/Teknik Ofis/Yönetim dışı erişemez');

$argeTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'arge', 'sifre' => 'arge1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($argeTok), 'ARGE girişi başarılı');

$r = Test::istek('?action=montajSemasiOku', 'POST', ['gorselB64' => '', 'mediaType' => 'image/png'], $argeTok);
Test::esit(400, $r['kod'], 'Boş görsel reddedilir (400)');

$r = Test::istek('?action=montajSemasiOku', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/gif'], $argeTok);
Test::esit(400, $r['kod'], 'Desteklenmeyen görsel türü reddedilir (400)');

// Test sunucusunda URETIMOS_ANTHROPIC_KEY BİLEREK tanımsız — gerçek anahtar
// olmadan AI'ya bağlanmaya ÇALIŞMADAN, dürüst bir yapılandırma hatası
// dönmesi beklenir (fabrikasyon veri değil, açık "eksik" bildirimi).
$r = Test::istek('?action=montajSemasiOku', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], $argeTok);
Test::esit(503, $r['kod'], 'API anahtarı yapılandırılmamışken 503 döner (ağa hiç çıkmadan)');
Test::dogru($r['veri']['yapilandirmaEksik'] ?? false, 'yapilandirmaEksik bayrağı true — istemci bunu ayırt edebilir');
