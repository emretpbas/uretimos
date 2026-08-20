<?php
// ── GÖRSELLERİN BLOB'DAN ÇIKARILMASI ───────────────────────────────────────
// Kartların içine gömülü base64 görseller sunucuya taşınır ve kartta yalnızca
// {sunucuId, r, k} referansı kalır. Bu testler o sözleşmeyi korur:
//   · yükleme kaydın gizli anahtarını döndürmeli (adres bunsuz üretilemez)
//   · referanstan üretilen adres, yüklenen baytların AYNISINI döndürmeli
//   · yanlış/eksik anahtarla erişim reddedilmeli
//   · referans, base64'ün yanında ihmal edilebilir boyutta olmalı

Test::bolum('Görsel yükleme — referans üretimi');

// 1x1 saydam PNG (gerçek, geçerli bir görüntü dosyası)
$pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
$pngHam = base64_decode($pngB64);

$r = Test::istek('?action=dosyaYukle', 'POST', [
    'tip' => 'urun', 'refId' => 'URN-GORSEL-1',
    'kod' => 'TEST-001', 'ad' => 'Test Ürünü',
    'dosyaAdi' => 'kapak.png', 'icerikB64' => $pngB64
]);

Test::esit(200, $r['kod'], 'Görsel yüklenebiliyor');
$anahtar = $r['veri']['anahtar'] ?? null;
$dosyalar = $r['veri']['dosyalar'] ?? [];
$dosyaId = $dosyalar ? end($dosyalar)['id'] : null;

Test::dogru(!empty($anahtar), 'Yanıt kayıt anahtarını döndürüyor (adres bunsuz üretilemez)');
Test::dogru(!empty($dosyaId), 'Yanıt dosya kimliğini döndürüyor');

Test::bolum('Referanstan üretilen adres doğru içeriği veriyor');

if ($anahtar && $dosyaId) {
    // İstemcideki QrDosya.gorselUrl() ile AYNI adresi kur
    $rAnahtar = 'urun:URN-GORSEL-1';
    $yol = '?action=dosyaIndir'
         . '&r=' . rawurlencode($rAnahtar)
         . '&k=' . rawurlencode($anahtar)
         . '&f=' . rawurlencode($dosyaId)
         . '&goster=1';

    // dosyaIndir ikili döner; Test::istek JSON çözemez, ham gövdeye bakarız
    $g = Test::istek($yol);
    Test::esit(200, $g['kod'], 'Görsel adresi 200 dönüyor');
    Test::dogru($g['ham'] === $pngHam,
        'Dönen baytlar yüklenen dosyanın AYNISI',
        'beklenen ' . strlen($pngHam) . ' bayt, gelen ' . strlen((string)$g['ham']) . ' bayt');

    // Sıkıştırma ikili gövdeyi bozmamalı (Content-Length uyuşmazlığı riski)
    Test::dogru(strlen((string)$g['ham']) === strlen($pngHam),
        'Sıkıştırma ikili içeriği bozmuyor');

    Test::bolum('Yetkisiz erişim reddediliyor');

    $kotu = Test::istek('?action=dosyaIndir&r=' . rawurlencode($rAnahtar)
          . '&k=' . rawurlencode('yanlisanahtar') . '&f=' . rawurlencode($dosyaId) . '&goster=1');
    Test::esit(403, $kotu['kod'], 'Yanlış anahtar 403 ile reddediliyor');

    $anahtarsiz = Test::istek('?action=dosyaIndir&r=' . rawurlencode($rAnahtar)
                . '&f=' . rawurlencode($dosyaId) . '&goster=1');
    Test::dogru($anahtarsiz['kod'] === 403, 'Anahtarsız erişim reddediliyor',
        'gelen kod: ' . $anahtarsiz['kod']);

    Test::bolum('Kazanç — referans base64 yanında ihmal edilebilir');

    // Kartta base64 yerine kalacak referans
    $referans = json_encode([
        'name' => 'kapak.png', 'sunucuId' => $dosyaId,
        'r' => $rAnahtar, 'k' => $anahtar, 'uzanti' => 'png'
    ], JSON_UNESCAPED_UNICODE);

    // Gerçekçi bir kart fotoğrafı ~800 KB → base64'te ~1,07 MB
    $gercekciB64 = 800 * 1024 * 4 / 3;
    $oran = $gercekciB64 / strlen($referans);
    Test::dogru($oran > 100,
        'Referans, tipik bir fotoğraf base64\'ünden 100 kat küçük',
        'referans ' . strlen($referans) . ' bayt · base64 ~' . round($gercekciB64) . ' bayt · oran ~' . round($oran) . 'x');
}

Test::bolum('İstemci kodu artık ham dataUrl okumuyor');

// dataUrl silinince .startsWith() çağıran her yer TypeError ile çökerdi.
foreach (['page_kartlar.js', 'page_yarimamul.js'] as $dosya) {
    $icerik = file_get_contents(dirname(__DIR__) . '/' . $dosya);
    Test::dogru(strpos($icerik, '.dataUrl.startsWith') === false,
        "$dosya içinde korumasız .dataUrl.startsWith kalmadı");
}
$qr = file_get_contents(dirname(__DIR__) . '/qr_dosya.js');
Test::dogru(strpos($qr, 'delete g.dataUrl') !== false,
    'Yükleme sonrası base64 karttan siliniyor');
Test::dogru(strpos($qr, 'gorselUrl') !== false && strpos($qr, 'gorselMi') !== false,
    'Görsel adres yardımcıları dışa açılmış');
$appjs = file_get_contents(dirname(__DIR__) . '/app.js');
Test::dogru(strpos($appjs, 'migrateGorselleriBlobdanCikar') !== false,
    'Mevcut kayıtlar için göç eklenmiş');
