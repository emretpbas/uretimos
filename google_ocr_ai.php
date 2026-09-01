<?php
// ════════════════════════════════════════════════════════════════════════════
// MONTAJ ŞEMASI — GOOGLE CLOUD VISION OCR ALTERNATİFİ
// ────────────────────────────────────────────────────────────────────────────
// Baidu OCR denemesi Türkiye telefon numaralarıyla hesap açma/SMS doğrulama
// aşamasında tıkandı (bkz. proje sohbet geçmişi) — Google Cloud Vision, kredi
// kartıyla ANINDA açılan, telefon/SMS/gerçek-isim doğrulaması İSTEMEYEN bir
// hesap sistemi kullandığı ve ayda 1000 birim ücretsiz kotası olduğu için
// yerine geçti. Kimlik doğrulaması Baidu'nun iki adımlı token akışından
// FARKLI ve DAHA BASİT: tek bir API anahtarı, istek URL'sine query param
// olarak eklenir — ayrı bir token alma adımı yok.
//
// Baidu/Tesseract gibi bu da (Anthropic vision'ın aksine) tabloyu bağlamıyla
// ANLAMAYAN saf bir karakter tanıyıcı — "ad" ile "ölçü/spec" ayrımını
// YAPAMAZ, aynı NO/AD/ADET satır ayrıştırma kuralı ve aynı zorunlu kullanıcı
// gözden geçirme akışı burada da geçerli.
//
// AYRI DOSYA OLMASININ SEBEBİ: montaj_semasi_ai.php / baidu_ocr_ai.php ile
// AYNI — api.php'nin gövdesi top-level çalışan bir istek yönlendiricisidir,
// bu yüzden saf fonksiyonlar test edilebilsin diye ayrı tutulur. Hem api.php
// hem de testler/08_google_ocr_test.php aynı dosyayı require eder.
// ════════════════════════════════════════════════════════════════════════════

function googleVisionCagir($apiKey, $imageBase64) {
    if (!function_exists('curl_init')) {
        throw new Exception('Sunucuda curl eklentisi yok — Google Vision servisi çağrılamıyor.');
    }
    $url = 'https://vision.googleapis.com/v1/images:annotate?key=' . urlencode($apiKey);
    $govde = [
        'requests' => [[
            'image' => ['content' => $imageBase64],
            'features' => [['type' => 'TEXT_DETECTION']]
        ]]
    ];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['content-type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($govde),
        CURLOPT_TIMEOUT => 60
    ]);
    $ham = curl_exec($ch);
    if ($ham === false) {
        $hata = curl_error($ch);
        curl_close($ch);
        throw new Exception('Google Vision servisine bağlanılamadı: ' . $hata);
    }
    $kod = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $ayristirilmis = json_decode($ham, true);
    if ($kod !== 200) {
        $mesaj = is_array($ayristirilmis) ? ($ayristirilmis['error']['message'] ?? ('HTTP ' . $kod)) : ('HTTP ' . $kod);
        throw new Exception('Google Vision hata döndü: ' . $mesaj);
    }
    return is_array($ayristirilmis) ? $ayristirilmis : [];
}

// Google Vision TEXT_DETECTION yanıtındaki tam metin bloğunu (fullTextAnnotation.text,
// satırlar \n ile ayrılmış) parça listesine çevirir. Kural baidu_ocr_ai.php /
// page_montaj_semasi.js'teki ocrMetnindenParcalarCikar() ile BİREBİR AYNIDIR
// — üç OCR yolu da aynı satır biçimini (NO AD ADET ya da AD ADET) bekler ve
// aynı şekilde geçersiz satırları sessizce atlar. Saf fonksiyon — ağ, dosya,
// DB yok.
function googleOcrYanitAyristir($googleYanit) {
    $yanitlar = is_array($googleYanit) ? ($googleYanit['responses'] ?? []) : [];
    $ilk = (is_array($yanitlar) && count($yanitlar)) ? $yanitlar[0] : null;
    if (is_array($ilk) && isset($ilk['error'])) {
        return ['ok' => false, 'hata' => 'Google Vision hata döndü: ' . ($ilk['error']['message'] ?? 'bilinmeyen hata')];
    }
    $tamMetin = '';
    if (is_array($ilk)) {
        if (isset($ilk['fullTextAnnotation']['text'])) {
            $tamMetin = (string)$ilk['fullTextAnnotation']['text'];
        } elseif (isset($ilk['textAnnotations'][0]['description'])) {
            $tamMetin = (string)$ilk['textAnnotations'][0]['description'];
        }
    }
    $satirlarHam = preg_split('/\r\n|\r|\n/', $tamMetin) ?: [];
    $parcalar = [];
    foreach ($satirlarHam as $satirHam) {
        $satir = trim(preg_replace('/\s+/', ' ', (string)$satirHam));
        if ($satir === '') continue;
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
        return ['ok' => false, 'hata' => 'Google Vision OCR şemada geçerli bir satır bulamadı. Görsel net olmayabilir — AI ile okumayı deneyin.'];
    }
    return [
        'ok' => true, 'parcalar' => $parcalar,
        'genelNot' => 'Bu satırlar Google Cloud Vision OCR ile üretildi — AI görme kadar isabetli DEĞİLDİR. '
            . 'Bağlamı anlamaz, yalnızca karakter tanır: "Ad" ile "Ölçü/Spec" ayrımı yapılamadığından ikisi birlikte '
            . '"AI Tahmini Ad" sütununa yazılmıştır. Her satırı dikkatle kontrol edin.'
    ];
}
