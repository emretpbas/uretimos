<?php
// ════════════════════════════════════════════════════════════════════════════
// HAMMADDE FİYAT ANOMALİ TESPİTİ — kur sapması + piyasa (internet) araması
// ────────────────────────────────────────────────────────────────────────────
// İki BAĞIMSIZ katman, ikisi de kendi anahtarı olmadan devre dışı kalır
// (birbirini bloklamaz):
//
//   1) KUR SAPMASI (anahtarsız, hemen çalışır): TCMB'nin herkese açık, ücretsiz
//      XML kur servisinden GÜNCEL USD/EUR-TRY alınır ve sistemde döviz
//      cinsinden fiyatlı hammaddelerin TL karşılığı, Sistem Ayarları'ndaki
//      (muhtemelen eski) kurla hesaplanan değerle karşılaştırılır. Kur elle
//      güncellenmeyi unutulmuşsa bu, TÜM döviz kalemlerinde sistemli bir
//      sapma olarak hemen görünür.
//
//   2) PİYASA ARAMASI (Google Custom Search JSON API anahtarı gerekir):
//      Her hammaddenin adıyla internette arama yapılır, bulunan ilk birkaç
//      sonucun başlık/özetinden bir fiyat YAKALANMAYA ÇALIŞILIR. Bu TAHMİNİ
//      ve KIRILGANDIR — yanlış ürün eşleşmesi, birim farkı (adet/metre/kg)
//      gibi nedenlerle yanlış sonuç verebilir. Bu yüzden dönen her sonuç
//      kaynağın LİNKİYLE birlikte döner; kart hiçbir zaman OTOMATİK
//      güncellenmez — kullanıcı linke bakıp elle onaylar.
//
// AYRI DOSYA OLMASININ SEBEBİ: diğer *_ai.php dosyalarıyla AYNI — api.php'nin
// gövdesi top-level çalışan bir istek yönlendiricisidir, saf fonksiyonlar
// test edilebilsin diye ayrı tutulur.
// ════════════════════════════════════════════════════════════════════════════

// ── 1) TCMB KUR SERVİSİ (anahtarsız, herkese açık) ─────────────────────────
function tcmbKurCagir() {
    if (!function_exists('curl_init')) {
        throw new Exception('Sunucuda curl eklentisi yok — TCMB kur servisi çağrılamıyor.');
    }
    $ch = curl_init('https://www.tcmb.gov.tr/kurlar/today.xml');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_SSL_VERIFYPEER => true]);
    $ham = curl_exec($ch);
    if ($ham === false) {
        $hata = curl_error($ch);
        curl_close($ch);
        throw new Exception('TCMB kur servisine bağlanılamadı: ' . $hata);
    }
    curl_close($ch);
    return tcmbXmlAyristir($ham);
}

// TCMB today.xml içeriğini {usdTry, eurTry, tarih} biçimine çevirir. Saf
// fonksiyon — ağ yok, doğrudan XML metni alır. Geçersiz/eksik XML'de null.
function tcmbXmlAyristir($xmlMetni) {
    if (!is_string($xmlMetni) || trim($xmlMetni) === '') return null;
    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($xmlMetni);
    if ($xml === false) return null;
    $usd = null; $eur = null;
    foreach ($xml->Currency as $c) {
        $kod = (string)($c['CurrencyCode'] ?? '');
        $satis = (float)str_replace(',', '.', (string)($c->ForexSelling ?? ''));
        if ($satis <= 0) continue;
        if ($kod === 'USD') $usd = $satis;
        if ($kod === 'EUR') $eur = $satis;
    }
    if ($usd === null || $eur === null) return null;
    $tarih = (string)($xml['Tarih'] ?? '');
    return ['usdTry' => $usd, 'eurTry' => $eur, 'tarih' => $tarih];
}

// ── DÖVİZ KODU NORMALİZASYONU (hammadde.dvz alanı '$'/'USD'/'€'/'EUR' karışık) ──
function dvzTuru($dvz) {
    if ($dvz === 'USD' || $dvz === '$') return 'USD';
    if ($dvz === 'EUR' || $dvz === '€') return 'EUR';
    return null; // TL ya da tanımsız — kur sapması hesaplanmaz
}

// Hammadde listesini KUR SAPMASINA göre tarar. $ayarlar (Sistem Ayarları'ndaki
// usdTry/eurTry — kullanıcının EN SON elle girdiği kur) ile $kurlar (TCMB'den
// AZ ÖNCE çekilen güncel kur) arasındaki farkı, döviz cinsinden fiyatlı her
// hammaddeye uygular. Saf fonksiyon — ağ, DB yok.
function hammaddeKurSapmalariHesapla($hammaddeler, $kurlar, $ayarlar, $esikYuzde = 5.0) {
    $sonuc = [];
    foreach (($hammaddeler ?? []) as $h) {
        $tur = dvzTuru($h['dvz'] ?? null);
        if ($tur === null) continue;
        $birimFiyat = (float)($h['birimFiyat'] ?? 0);
        if ($birimFiyat <= 0) continue;
        $sistemKur = $tur === 'USD' ? (float)($ayarlar['usdTry'] ?? 0) : (float)($ayarlar['eurTry'] ?? 0);
        $guncelKur = $tur === 'USD' ? (float)($kurlar['usdTry'] ?? 0) : (float)($kurlar['eurTry'] ?? 0);
        if ($sistemKur <= 0 || $guncelKur <= 0) continue;
        $sistemTL = $birimFiyat * $sistemKur;
        $guncelTL = $birimFiyat * $guncelKur;
        $sapmaYuzde = (($guncelTL - $sistemTL) / $sistemTL) * 100;
        if (abs($sapmaYuzde) < $esikYuzde) continue;
        $sonuc[] = [
            'hammaddeId' => $h['id'] ?? '', 'stokKodu' => $h['stokKodu'] ?? '', 'ad' => $h['ad'] ?? '',
            'tur' => 'kur_sapmasi', 'dvz' => $tur,
            'sistemFiyatTL' => round($sistemTL, 2), 'guncelFiyatTL' => round($guncelTL, 2),
            'sapmaYuzde' => round($sapmaYuzde, 1),
            'aciklama' => "Sistemde $tur/TRY = " . number_format($sistemKur, 4, ',', '.')
                . " kullanılıyor, TCMB güncel satış kuru " . number_format($guncelKur, 4, ',', '.') . '.',
            'kaynak' => 'https://www.tcmb.gov.tr/kurlar/today.xml'
        ];
    }
    return $sonuc;
}

// ── 2) GOOGLE CUSTOM SEARCH (piyasa araması, API anahtarı + arama motoru ID gerekir) ──
function googleAramaYap($apiKey, $cx, $sorgu) {
    if (!function_exists('curl_init')) {
        throw new Exception('Sunucuda curl eklentisi yok — arama servisi çağrılamıyor.');
    }
    $url = 'https://www.googleapis.com/customsearch/v1?key=' . urlencode($apiKey)
        . '&cx=' . urlencode($cx) . '&num=5&q=' . urlencode($sorgu);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20]);
    $ham = curl_exec($ch);
    if ($ham === false) {
        $hata = curl_error($ch);
        curl_close($ch);
        throw new Exception('Arama servisine bağlanılamadı: ' . $hata);
    }
    $kod = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $ayristirilmis = json_decode($ham, true);
    if ($kod !== 200) {
        $mesaj = is_array($ayristirilmis) ? ($ayristirilmis['error']['message'] ?? ('HTTP ' . $kod)) : ('HTTP ' . $kod);
        throw new Exception('Arama servisi hata döndü: ' . $mesaj);
    }
    return is_array($ayristirilmis) ? $ayristirilmis : [];
}

// Arama sonuçlarının başlık/özetinden bir fiyat YAKALAMAYA ÇALIŞIR — bu
// TAHMİNİDİR, kesin değildir (yanlış ürün, farklı birim, kampanya fiyatı
// olabilir). İlk eşleşen sonucu döner; hiçbiri eşleşmezse null. Saf
// fonksiyon — ağ yok, arama sonuçlarını (dizi) alır.
function aramaSonucundanFiyatCikar($aramaYaniti) {
    $ogeler = is_array($aramaYaniti) ? ($aramaYaniti['items'] ?? []) : [];
    if (!is_array($ogeler)) return null;
    foreach ($ogeler as $oge) {
        $metin = trim(($oge['title'] ?? '') . ' ' . ($oge['snippet'] ?? ''));
        if ($metin === '') continue;
        // "1.234,56 TL" / "1234,56₺" / "₺1.234,56" gibi TL kalıpları
        if (preg_match('/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*(?:TL|₺)|₺\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/u', $metin, $m)) {
            $ham = !empty($m[1]) ? $m[1] : $m[2];
            $sayi = (float)str_replace(',', '.', str_replace('.', '', $ham));
            if ($sayi > 0) {
                return ['fiyat' => $sayi, 'dvz' => 'TL', 'kaynak' => $oge['link'] ?? '', 'baslik' => $oge['title'] ?? '', 'ozet' => $oge['snippet'] ?? ''];
            }
        }
        // "$12.34" / "12.34 USD" gibi USD kalıpları (ikincil, TL bulunamazsa)
        if (preg_match('/\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*USD/i', $metin, $m)) {
            $ham = !empty($m[1]) ? $m[1] : $m[2];
            $sayi = (float)$ham;
            if ($sayi > 0) {
                return ['fiyat' => $sayi, 'dvz' => 'USD', 'kaynak' => $oge['link'] ?? '', 'baslik' => $oge['title'] ?? '', 'ozet' => $oge['snippet'] ?? ''];
            }
        }
    }
    return null;
}

// Bir hammaddenin sistemdeki TL fiyatıyla, aramada bulunan (ve TL'ye
// çevrilmiş) piyasa fiyatını karşılaştırır. Eşik daha YÜKSEK (varsayılan
// %15) — arama sonucundan çıkarılan fiyat kur karşılaştırmasından çok daha
// gürültülü olduğundan, küçük sapmalar için yanlış alarm vermemesi için.
function hammaddePiyasaSapmasiHesapla($hammadde, $bulunan, $ayarlar, $esikYuzde = 15.0) {
    if (!$bulunan) return null;
    $birimFiyat = (float)($hammadde['birimFiyat'] ?? 0);
    if ($birimFiyat <= 0) return null;
    $tur = dvzTuru($hammadde['dvz'] ?? null);
    $sistemTL = $tur === 'USD' ? $birimFiyat * (float)($ayarlar['usdTry'] ?? 0)
        : ($tur === 'EUR' ? $birimFiyat * (float)($ayarlar['eurTry'] ?? 0) : $birimFiyat);
    if ($sistemTL <= 0) return null;

    $bulunanTL = $bulunan['dvz'] === 'USD' ? $bulunan['fiyat'] * (float)($ayarlar['usdTry'] ?? 0) : $bulunan['fiyat'];
    if ($bulunanTL <= 0) return null;

    $sapmaYuzde = (($bulunanTL - $sistemTL) / $sistemTL) * 100;
    if (abs($sapmaYuzde) < $esikYuzde) return null;

    return [
        'hammaddeId' => $hammadde['id'] ?? '', 'stokKodu' => $hammadde['stokKodu'] ?? '', 'ad' => $hammadde['ad'] ?? '',
        'tur' => 'piyasa_sapmasi',
        'sistemFiyatTL' => round($sistemTL, 2), 'guncelFiyatTL' => round($bulunanTL, 2),
        'sapmaYuzde' => round($sapmaYuzde, 1),
        'aciklama' => 'İnternet aramasında bulunan fiyat — TAHMİNİDİR, kaynağı kontrol edin: ' . ($bulunan['baslik'] ?? ''),
        'kaynak' => $bulunan['kaynak'] ?? ''
    ];
}
