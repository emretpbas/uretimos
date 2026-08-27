<?php
// ════════════════════════════════════════════════════════════════════════════
// MONTAJ ŞEMASI AI GÖRME — Anthropic çağrısı ve yanıt ayrıştırma
// ────────────────────────────────────────────────────────────────────────────
// Montaj şeması PDF'leri (patlatılmış çizim + NO/SIZE/QTY tablosu) metin
// KATMANI TAŞIMAZ — tablodaki numaralar bile vektör çizimdir (pdf.js ile
// doğrulandı: sayfa başına 0 metin öğesi). Kural tabanlı çıkarım imkânsız;
// bu yüzden görsel Anthropic'in vision API'sine gönderilip yapılandırılmış
// (tool_use) yanıt istenir. Dönen isim/ölçü TAHMİNDİR — kaydetmeden önce
// kullanıcı gözden geçirir (page_montaj_semasi.js ekranında zorunlu kılınır).
//
// AYRI DOSYA OLMASININ SEBEBİ: api.php'nin gövdesi top-level çalışan bir
// istek yönlendiricisidir (require edilince anında HTTP yanıtlamaya
// çalışır) — bu yüzden fonksiyonları doğrudan test sürecine dahil edilemez.
// Bu dosya SADECE fonksiyon tanımlar, hiçbir yan etkisi yoktur; hem api.php
// hem de testler/06_montaj_semasi_test.php aynı dosyayı require eder.
// ════════════════════════════════════════════════════════════════════════════

function anthropicApiCagir($apiKey, $govde) {
    if (!function_exists('curl_init')) {
        throw new Exception('Sunucuda curl eklentisi yok — AI görme servisi çağrılamıyor.');
    }
    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'content-type: application/json',
            'x-api-key: ' . $apiKey,
            'anthropic-version: 2023-06-01'
        ],
        CURLOPT_POSTFIELDS => json_encode($govde),
        CURLOPT_TIMEOUT => 90
    ]);
    $ham = curl_exec($ch);
    if ($ham === false) {
        $hata = curl_error($ch);
        curl_close($ch);
        throw new Exception('AI görme servisine bağlanılamadı: ' . $hata);
    }
    $kod = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $ayristirilmis = json_decode($ham, true);
    if ($kod !== 200) {
        $mesaj = is_array($ayristirilmis) ? ($ayristirilmis['error']['message'] ?? ('HTTP ' . $kod)) : ('HTTP ' . $kod);
        throw new Exception('AI görme servisi hata döndü: ' . $mesaj);
    }
    return is_array($ayristirilmis) ? $ayristirilmis : [];
}

// Anthropic Messages API yanıtından receteKalemleriBildir tool_use'unu
// çıkarır ve satırları doğrular. Saf fonksiyon — ağ, dosya, DB yok.
function montajSemasiYanitAyristir($anthropicYanit) {
    $icerikler = is_array($anthropicYanit) ? ($anthropicYanit['content'] ?? []) : [];
    $araclInput = null;
    if (is_array($icerikler)) {
        foreach ($icerikler as $blok) {
            if (is_array($blok) && ($blok['type'] ?? '') === 'tool_use' && ($blok['name'] ?? '') === 'receteKalemleriBildir') {
                $araclInput = $blok['input'] ?? null;
                break;
            }
        }
    }
    if (!is_array($araclInput)) {
        return ['ok' => false, 'hata' => 'AI yanıtından yapılandırılmış veri okunamadı.'];
    }
    $parcalarHam = $araclInput['parcalar'] ?? null;
    if (!is_array($parcalarHam)) {
        return ['ok' => false, 'hata' => 'AI yanıtında parça listesi yok.'];
    }
    $parcalar = [];
    foreach ($parcalarHam as $p) {
        if (!is_array($p)) continue;
        $ad = trim((string)($p['tahminiAd'] ?? ''));
        $adet = $p['adet'] ?? null;
        if ($ad === '' || !is_numeric($adet) || (float)$adet <= 0) continue; // eksik/geçersiz satır sessizce atlanır
        $parcalar[] = [
            'no' => trim((string)($p['no'] ?? '')),
            'tahminiAd' => $ad,
            'olcuSpec' => trim((string)($p['olcuSpec'] ?? '')),
            'adet' => (float)$adet
        ];
    }
    if (!count($parcalar)) {
        return ['ok' => false, 'hata' => 'AI şemada geçerli bir parça bulamadı. Görsel net olmayabilir — daha yüksek çözünürlükte tekrar deneyin.'];
    }
    return ['ok' => true, 'parcalar' => $parcalar, 'genelNot' => trim((string)($araclInput['genelNot'] ?? ''))];
}
