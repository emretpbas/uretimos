<?php
// ════════════════════════════════════════════════════════════════════════════
// MONTAJ ŞEMASI — BAIDU OCR (ücretsiz kotalı bulut metin tanıma) ALTERNATİFİ
// ────────────────────────────────────────────────────────────────────────────
// Anthropic vision (montaj_semasi_ai.php) ÜCRETLİDİR. Tesseract.js (tarayıcı
// içi, page_montaj_semasi.js) ücretsizdir ama bağlamı anlamaz, düşük çözünürlük/
// gürültüde zayıftır. Bu üçüncü seçenek, Baidu AI Cloud'un genel metin tanıma
// (OCR) servisini SUNUCU TARAFINDAN çağırır — Anthropic'ten daha cömert bir
// ücretsiz kota sunar, ama YİNE SADECE HARF/RAKAM TANIR: tabloyu bağlamıyla
// anlamayan bu OCR de "ad" ile "ölçü/spec" ayrımını YAPAMAZ (Tesseract yolundaki
// aynı sınırlama) — bu yüzden dönen satırlar da page_montaj_semasi.js'te AYNI
// ZORUNLU gözden geçirme adımından geçer.
//
// Baidu API iki adımlı çalışır: (1) API Key + Secret Key ile kısa ömürlü bir
// access_token alınır, (2) o token'la görsel OCR uç noktasına gönderilir.
// Kimlik bilgileri montaj_semasi_ai.php'deki Anthropic anahtarıyla AYNI
// güvenli desenle okunur (bkz. api.php): önce ortam değişkeni, sonra git'in
// hiç görmediği (.gitignore'da) yerel `baidu_anahtari.php` dosyası.
//
// AYRI DOSYA OLMASININ SEBEBİ: montaj_semasi_ai.php ile aynı — api.php'nin
// gövdesi top-level çalışan bir istek yönlendiricisidir, bu yüzden saf
// fonksiyonlar test edilebilsin diye ayrı tutulur. Hem api.php hem de
// testler/07_baidu_ocr_test.php aynı dosyayı require eder.
// ════════════════════════════════════════════════════════════════════════════

function baiduTokenAl($apiKey, $secretKey) {
    if (!function_exists('curl_init')) {
        throw new Exception('Sunucuda curl eklentisi yok — Baidu OCR servisi çağrılamıyor.');
    }
    $url = 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials'
        . '&client_id=' . urlencode($apiKey) . '&client_secret=' . urlencode($secretKey);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '',
        CURLOPT_TIMEOUT => 30
    ]);
    $ham = curl_exec($ch);
    if ($ham === false) {
        $hata = curl_error($ch);
        curl_close($ch);
        throw new Exception('Baidu kimlik doğrulama servisine bağlanılamadı: ' . $hata);
    }
    curl_close($ch);
    $ayristirilmis = json_decode($ham, true);
    if (!is_array($ayristirilmis) || empty($ayristirilmis['access_token'])) {
        $mesaj = is_array($ayristirilmis) ? ($ayristirilmis['error_description'] ?? 'access_token alınamadı') : 'access_token alınamadı';
        throw new Exception('Baidu kimlik doğrulama hatası: ' . $mesaj);
    }
    return $ayristirilmis['access_token'];
}

function baiduOcrCagir($accessToken, $imageBase64) {
    if (!function_exists('curl_init')) {
        throw new Exception('Sunucuda curl eklentisi yok — Baidu OCR servisi çağrılamıyor.');
    }
    $url = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=' . urlencode($accessToken);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['content-type: application/x-www-form-urlencoded'],
        CURLOPT_POSTFIELDS => http_build_query(['image' => $imageBase64]),
        CURLOPT_TIMEOUT => 60
    ]);
    $ham = curl_exec($ch);
    if ($ham === false) {
        $hata = curl_error($ch);
        curl_close($ch);
        throw new Exception('Baidu OCR servisine bağlanılamadı: ' . $hata);
    }
    $kod = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $ayristirilmis = json_decode($ham, true);
    if ($kod !== 200) {
        $mesaj = is_array($ayristirilmis) ? ($ayristirilmis['error_msg'] ?? ('HTTP ' . $kod)) : ('HTTP ' . $kod);
        throw new Exception('Baidu OCR hata döndü: ' . $mesaj);
    }
    if (is_array($ayristirilmis) && isset($ayristirilmis['error_code'])) {
        throw new Exception('Baidu OCR hata döndü: ' . ($ayristirilmis['error_msg'] ?? ('kod ' . $ayristirilmis['error_code'])));
    }
    return is_array($ayristirilmis) ? $ayristirilmis : [];
}

// Baidu general_basic yanıtındaki words_result satırlarını (her biri düz bir
// metin satırı — Tesseract'ın satır çıktısıyla AYNI şekil) parça listesine
// çevirir. Kural page_montaj_semasi.js'teki ocrMetnindenParcalarCikar() ile
// BİREBİR AYNIDIR — iki OCR yolu da aynı satır biçimini (NO AD ADET ya da
// AD ADET) bekler ve aynı şekilde geçersiz satırları sessizce atlar. Saf
// fonksiyon — ağ, dosya, DB yok.
function baiduOcrYanitAyristir($baiduYanit) {
    $sonuclar = is_array($baiduYanit) ? ($baiduYanit['words_result'] ?? []) : [];
    if (!is_array($sonuclar)) $sonuclar = [];
    $parcalar = [];
    foreach ($sonuclar as $satirVeri) {
        $satir = is_array($satirVeri) ? trim((string)($satirVeri['words'] ?? '')) : '';
        if ($satir === '') continue;
        $satir = preg_replace('/\s+/', ' ', $satir);
        $no = ''; $ad = ''; $adet = null;
        if (preg_match('/^(\d{1,4})\s+(.+?)\s+(\d{1,4}(?:[.,]\d+)?)$/', $satir, $m)) {
            $no = $m[1]; $ad = trim($m[2]); $adet = (float)str_replace(',', '.', $m[3]);
        } elseif (preg_match('/^(.+?)\s+(\d{1,4}(?:[.,]\d+)?)$/', $satir, $m)) {
            $ad = trim($m[1]); $adet = (float)str_replace(',', '.', $m[2]);
        }
        if ($ad === '' || $adet === null || $adet <= 0) continue; // eksik/geçersiz satır sessizce atlanır
        $parcalar[] = ['no' => $no, 'tahminiAd' => $ad, 'olcuSpec' => '', 'adet' => $adet];
    }
    if (!count($parcalar)) {
        return ['ok' => false, 'hata' => 'Baidu OCR şemada geçerli bir satır bulamadı. Görsel net olmayabilir — AI ile okumayı deneyin.'];
    }
    return [
        'ok' => true, 'parcalar' => $parcalar,
        'genelNot' => 'Bu satırlar Baidu OCR (ücretsiz kotalı bulut metin tanıma) ile üretildi — AI görme kadar isabetli DEĞİLDİR. '
            . 'Bağlamı anlamaz, yalnızca karakter tanır: "Ad" ile "Ölçü/Spec" ayrımı yapılamadığından ikisi birlikte '
            . '"AI Tahmini Ad" sütununa yazılmıştır. Her satırı dikkatle kontrol edin.'
    ];
}
