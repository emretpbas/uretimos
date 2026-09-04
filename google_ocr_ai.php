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

// ── YATAY NO/SKETCH/SIZE/QTY TABLOSU — KONUM TABANLI YENİDEN İNŞA ──────────
// Çoğu Çin üretici montaj şeması NO/SKETCH/SIZE/QTY tablosunu SATIR olarak
// değil SÜTUN olarak düzenler (her sütun bir parça, satırlar NO/SIZE/QTY
// ÖZELLİKLERİ). Düz metni satır satır okuyan basit ayrıştırma bu düzende
// tabloyu hiç bulamaz, sayfadaki alakasız metinleri (ör. "Step 1", "Step 2"
// diyagram alt yazıları) yanlışlıkla eşleştirir — GERÇEK bir hata, kod
// hatası değil: OCR bağlamı anlamaz, yalnızca karakter tanır.
//
// Google Vision'ın TEXT_DETECTION yanıtı her kelime için sayfadaki KONUMUNU
// (boundingPoly) da döner. Bu fonksiyon "NO" ve "QTY" etiket kelimelerini
// bulup aynı YATAY BANTTAKİ (benzer y) diğer kelimeleri o satırın hücreleri
// sayar, sonra NO sütunundaki her hücreyi X KONUMUNA göre SIZE/QTY
// satırlarındaki en yakın hücreyle eşler — tabloyu sütun sütun yeniden
// kurar. "SKETCH" satırı salt ikon (metin değil) olduğundan parça ADI
// buradan asla çıkarılamaz — bu OCR yolunun aşamayacağı, dürüst bir sınır;
// dönen "tahminiAd" bu yüzden kullanıcıyı şemadaki ikona yönlendiren bir
// yer tutucudur, gerçek bir isim UYDURULMAZ.
//
// NO/QTY etiketleri bulunamazsa (tablo bu düzende değilse) null döner —
// çağıran eski satır-bazlı ayrıştırmaya düşer.
function googleOcrKelimeleriCikar($googleYanit) {
    $yanitlar = is_array($googleYanit) ? ($googleYanit['responses'] ?? []) : [];
    $ilk = (is_array($yanitlar) && count($yanitlar)) ? $yanitlar[0] : null;
    $anotasyonlar = is_array($ilk) ? ($ilk['textAnnotations'] ?? []) : [];
    if (!is_array($anotasyonlar) || count($anotasyonlar) < 2) return [];
    $kelimeler = [];
    // İlk eleman (index 0) sayfanın TAMAMININ birleşik metnidir — atlanır;
    // 1'den itibaren her eleman TEK bir kelime + konumudur.
    for ($i = 1; $i < count($anotasyonlar); $i++) {
        $a = $anotasyonlar[$i];
        $metin = trim((string)($a['description'] ?? ''));
        $koseler = is_array($a['boundingPoly']['vertices'] ?? null) ? $a['boundingPoly']['vertices'] : [];
        if ($metin === '' || count($koseler) < 1) continue;
        $xToplam = 0; $yToplam = 0; $adet = 0;
        foreach ($koseler as $k) {
            if (isset($k['x'])) { $xToplam += (float)$k['x']; $adet++; }
            if (isset($k['y'])) $yToplam += (float)$k['y'];
        }
        if ($adet === 0) continue;
        $kelimeler[] = ['metin' => $metin, 'x' => $xToplam / $adet, 'y' => $yToplam / $adet];
    }
    return $kelimeler;
}

function googleOcrYatayTabloOku($kelimeler) {
    $etiketBul = function ($hedef) use ($kelimeler) {
        foreach ($kelimeler as $k) { if (strtoupper($k['metin']) === $hedef) return $k; }
        return null;
    };
    $noEtiket = $etiketBul('NO') ?: $etiketBul('NO.');
    $qtyEtiket = $etiketBul('QTY');
    if (!$noEtiket || !$qtyEtiket) return null; // bu tablo düzeninde değil

    $sizeEtiket = $etiketBul('SIZE');
    $YTOLERANS = 15;   // aynı yatay banda (satıra) sayılacak dikey piksel farkı
    $XTOLERANS = 40;   // aynı sütuna sayılacak yatay piksel farkı

    $satirTopla = function ($etiket) use ($kelimeler, $YTOLERANS) {
        if (!$etiket) return [];
        $satir = [];
        foreach ($kelimeler as $k) {
            if ($k === $etiket) continue;
            if (abs($k['y'] - $etiket['y']) <= $YTOLERANS && $k['x'] > $etiket['x']) $satir[] = $k;
        }
        usort($satir, function ($a, $b) { return $a['x'] <=> $b['x']; });
        return $satir;
    };

    $noSutunlari = $satirTopla($noEtiket);
    $qtySutunlari = $satirTopla($qtyEtiket);
    $sizeSutunlari = $satirTopla($sizeEtiket);
    if (!count($noSutunlari)) return null;

    $enYakinHucre = function ($x, $sutunlar) use ($XTOLERANS) {
        $enYakin = null; $enKucukFark = null;
        foreach ($sutunlar as $s) {
            $fark = abs($s['x'] - $x);
            if ($fark <= $XTOLERANS && ($enKucukFark === null || $fark < $enKucukFark)) {
                $enKucukFark = $fark; $enYakin = $s;
            }
        }
        return $enYakin;
    };

    $parcalar = [];
    foreach ($noSutunlari as $noHucre) {
        $no = preg_replace('/[^0-9]/', '', $noHucre['metin']);
        if ($no === '') continue;
        $qtyHucre = $enYakinHucre($noHucre['x'], $qtySutunlari);
        $sizeHucre = $enYakinHucre($noHucre['x'], $sizeSutunlari);
        $adet = null;
        if ($qtyHucre && preg_match('/(\d+(?:[.,]\d+)?)/', $qtyHucre['metin'], $m)) {
            $adet = (float)str_replace(',', '.', $m[1]);
        }
        if ($adet === null || $adet <= 0) continue; // eksik/geçersiz sütun sessizce atlanır
        $parcalar[] = [
            'no' => $no,
            'tahminiAd' => 'Parça ' . $no . ' — şemadaki NO ' . $no . ' ikonuna bakıp adı siz yazın',
            'olcuSpec' => $sizeHucre ? trim($sizeHucre['metin']) : '',
            'adet' => $adet
        ];
    }
    return count($parcalar) ? $parcalar : null;
}

// ── DAĞINIK ÖLÇÜ/VİDA KODU TARAMASI — SON ÇARE ──────────────────────────────
// Bazı montaj kılavuzları (özellikle "Accessories Diagram" gibi başlıklı
// simge/ikon ızgaraları) ne NO/QTY tablosu ne de düzenli AD+ADET satırı
// içerir: her ikonun altında/yanında YALNIZCA bir ölçü/vida kodu yazar
// (M6X45, H6X45, Ø8X40, M6 gibi) — bir isim, bir tablo satırı YOKTUR.
// İkonun kendisi (Allen anahtarı, vida, pul çizimi) metin taşımadığından
// OCR bunun NE olduğunu asla okuyamaz — bu, AI görme gerektiren dürüst bir
// sınırdır. Ama en azından SAYFADA GEÇEN HER ölçü/kod, kullanıcının "hangi
// ikona bakıp ne yazmalıyım" diye başlayabileceği bir satır olarak
// sunulabilir — hiçbir isim UYDURULMAZ, yalnızca görülen kod bildirilir.
// Yalnızca paths 1/2 (tablo/satır) hiçbir sonuç bulamadığında denenir.
function googleOcrOlcuKodlariBul($kelimeler) {
    // "M6X45", "H6X45", "Ø8X40", "6X30", "M6" gibi kodlar OCR'da genelde TEK
    // kelime olarak okunur (aralarında boşluk yok). Salt sayı (sayfa no,
    // "2026" gibi yıl, adet rakamı) ya da harf dizisi (diyagram alt yazısı
    // "Step"/"Instructions" gibi) KESİNLİKLE eşleşmez — en az bir harf+rakam
    // VEYA bir X/× ayıracı zorunludur.
    $KALIP = '/^[MHDØ]{1,2}\d+(?:[.,]\d+)?(?:[X×]\d+(?:[.,]\d+)?)?(?:MM)?$/ui';
    $KALIP_X = '/^\d+(?:[.,]\d+)?[X×]\d+(?:[.,]\d+)?(?:MM)?$/ui';
    $sayac = [];
    foreach ($kelimeler as $k) {
        $metin = trim((string)($k['metin'] ?? ''));
        if ($metin === '' || preg_match('/^\d+$/', $metin)) continue; // salt sayı — kod değil
        if (!preg_match($KALIP, $metin) && !preg_match($KALIP_X, $metin)) continue;
        $norm = strtoupper($metin);
        $sayac[$norm] = ($sayac[$norm] ?? 0) + 1;
    }
    return array_keys($sayac);
}

// Google Vision TEXT_DETECTION yanıtını parça listesine çevirir. Sırasıyla
// dener: (1) KONUM TABANLI yatay NO/SIZE/QTY tablosu yeniden inşası, (2) düz
// metni satır satır okuyan NO AD ADET / AD ADET deseni (baidu_ocr_ai.php /
// page_montaj_semasi.js içindeki ocrMetnindenParcalarCikar() ile BİREBİR
// AYNI), (3) ikisi de sonuç vermezse (şema "Accessories Diagram" gibi
// dağınık ikon ızgaralarından oluşuyorsa) sayfada geçen dağınık ölçü/vida
// kodlarını satır olarak sunar — isim UYDURULMAZ, kullanıcı ikona bakıp
// adlandırır. Saf fonksiyon — ağ, dosya, DB yok.
function googleOcrYanitAyristir($googleYanit) {
    $yanitlar = is_array($googleYanit) ? ($googleYanit['responses'] ?? []) : [];
    $ilk = (is_array($yanitlar) && count($yanitlar)) ? $yanitlar[0] : null;
    if (is_array($ilk) && isset($ilk['error'])) {
        return ['ok' => false, 'hata' => 'Google Vision hata döndü: ' . ($ilk['error']['message'] ?? 'bilinmeyen hata')];
    }

    $kelimeler = googleOcrKelimeleriCikar($googleYanit);
    $tabloParcalari = count($kelimeler) ? googleOcrYatayTabloOku($kelimeler) : null;
    if ($tabloParcalari !== null) {
        return [
            'ok' => true, 'parcalar' => $tabloParcalari,
            'genelNot' => 'Bu tablo Google Vision tarafından NO/SIZE/QTY sütunlarının sayfadaki KONUMU kullanılarak '
                . 'yeniden inşa edildi. ÖNEMLİ SINIR: şemadaki SKETCH (çizim/ikon) sütunu metin taşımadığından '
                . 'OCR parça ADINI okuyamaz — "AI Tahmini Ad" alanları yalnızca yer tutucudur, her satırı şemadaki '
                . 'ilgili NO numarasına bakıp SİZ adlandırmalısınız. Adet/ölçü değerlerini de dikkatle kontrol edin.'
        ];
    }

    // ── GERİ DÜŞÜŞ: düz metni satır satır oku (basit dikey NO AD ADET tablosu) ──
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
    if (count($parcalar)) {
        return [
            'ok' => true, 'parcalar' => $parcalar,
            'genelNot' => 'Bu satırlar Google Cloud Vision OCR ile üretildi — AI görme kadar isabetli DEĞİLDİR. '
                . 'Bağlamı anlamaz, yalnızca karakter tanır: "Ad" ile "Ölçü/Spec" ayrımı yapılamadığından ikisi birlikte '
                . '"AI Tahmini Ad" sütununa yazılmıştır. Her satırı dikkatle kontrol edin.'
        ];
    }

    // ── SON ÇARE: ne tablo ne düzenli satır bulundu — dağınık ölçü/vida
    // kodu taraması (bkz. googleOcrOlcuKodlariBul üzerindeki açıklama).
    $kodlar = googleOcrOlcuKodlariBul($kelimeler);
    if (count($kodlar)) {
        $kodParcalari = array_map(function ($kod) {
            return ['no' => '', 'tahminiAd' => 'Şemadaki ilgili simgeye bakıp adı siz yazın', 'olcuSpec' => $kod, 'adet' => 1];
        }, $kodlar);
        return [
            'ok' => true, 'parcalar' => $kodParcalari,
            'genelNot' => 'Bu şemada düzenli bir NO/AD/ADET tablosu bulunamadı (örn. ikon/aksesuar ızgarası biçiminde '
                . 'olabilir) — bunun yerine sayfada geçen HER ölçü/vida kodu (M6X45 gibi) ayrı bir satır olarak '
                . 'listelendi. İkonların ne olduğunu OCR OKUYAMAZ — "Ad" alanları yer tutucudur, her satırı şemadaki '
                . 'ilgili simgeye bakıp SİZ adlandırmalı ve adedi düzeltmelisiniz (varsayılan adet: 1).'
        ];
    }

    return ['ok' => false, 'hata' => 'Google Vision OCR şemada geçerli bir satır/tablo bulamadı (dağınık ölçü/vida kodu da yok). Görsel net olmayabilir — daha yüksek çözünürlükte tekrar deneyin.'];
}
