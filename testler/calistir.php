<?php
// ════════════════════════════════════════════════════════════════════════════
// ÜretimOS — TEST ÇATISI
//
// Bağımlılık YOKTUR. Composer, npm, kurulum gerekmez. Yalnızca PHP:
//
//     php testler/calistir.php
//
// Test sunucusu geçici bir klasörde AYRI bir veritabanıyla başlar; gerçek
// data.sqlite dosyasına ASLA dokunulmaz (URETIMOS_DB ortam değişkeni).
// Her test dosyası testler/ klasöründe *_test.php adıyla durur ve bu çatının
// sunduğu yardımcıları kullanır.
//
// Çıkış kodu: hepsi geçerse 0, bir tanesi bile başarısızsa 1 —
// böylece otomatik dağıtım (CI) betiklerine bağlanabilir.
// ════════════════════════════════════════════════════════════════════════════

class Test {
    public static $gecen = 0;
    public static $kalan = 0;
    public static $hatalar = [];
    public static $suanki = '';
    public static $temel = '';
    public static $token = null;

    // ── Sonuç bildirimi ──────────────────────────────────────────────────
    static function bolum($ad) {
        echo "\n\033[1;36m── $ad\033[0m\n";
    }

    static function dogru($kosul, $aciklama, $detay = '') {
        if ($kosul) {
            self::$gecen++;
            echo "  \033[32m✓\033[0m $aciklama\n";
        } else {
            self::$kalan++;
            self::$hatalar[] = self::$suanki . ' → ' . $aciklama . ($detay ? "\n     " . $detay : '');
            echo "  \033[31m✗ $aciklama\033[0m" . ($detay ? "\n     \033[33m$detay\033[0m" : '') . "\n";
        }
    }

    static function esit($beklenen, $gercek, $aciklama) {
        $ok = $beklenen === $gercek;
        self::dogru($ok, $aciklama, $ok ? '' : 'beklenen: ' . json_encode($beklenen, JSON_UNESCAPED_UNICODE) .
                                             '  ·  gelen: ' . json_encode($gercek, JSON_UNESCAPED_UNICODE));
    }

    // ── HTTP yardımcıları ────────────────────────────────────────────────
    // HTTP isteği — curl varsa onu, yoksa akış (stream) yedeğini kullanır.
    // Test çatısı da uygulama gibi BAĞIMLILIKSIZ olmalıdır.
    static function istek($yol, $yontem = 'GET', $govde = null, $token = null) {
        $url = self::$temel . $yol;
        $basliklar = ['Content-Type: application/json'];
        $kullanilacak = $token !== null ? $token : self::$token;
        if ($kullanilacak) $basliklar[] = 'Authorization: Bearer ' . $kullanilacak;
        $icerik = $govde === null ? null : json_encode($govde, JSON_UNESCAPED_UNICODE);

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST => $yontem,
                CURLOPT_HTTPHEADER => $basliklar,
                CURLOPT_TIMEOUT => 15
            ]);
            if ($icerik !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $icerik);
            $cevap = curl_exec($ch);
            $kod = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
        } else {
            $ctx = stream_context_create(['http' => [
                'method' => $yontem,
                'header' => implode("\r\n", $basliklar),
                'content' => $icerik,
                'timeout' => 15,
                'ignore_errors' => true      // 4xx/5xx gövdesini de oku
            ]]);
            $cevap = @file_get_contents($url, false, $ctx);
            $kod = 0;
            if (isset($http_response_header[0]) &&
                preg_match('#HTTP/\S+\s+(\d{3})#', $http_response_header[0], $m)) {
                $kod = (int)$m[1];
            }
        }
        $veri = json_decode((string)$cevap, true);
        return ['kod' => $kod, 'veri' => is_array($veri) ? $veri : [], 'ham' => $cevap];
    }

    static function girisYap($kullanici = 'yonetim', $sifre = 'yonetim1234') {
        $r = self::istek('?action=login', 'POST', ['kullaniciAdi' => $kullanici, 'sifre' => $sifre], false);
        return $r['veri']['token'] ?? null;
    }

    // Koleksiyon yaz / oku (yönetim yetkisiyle)
    static function yaz($key, $dizi) {
        return self::istek('?action=set', 'POST', ['key' => $key, 'value' => json_encode($dizi, JSON_UNESCAPED_UNICODE)]);
    }
    static function oku($key) {
        $r = self::istek('?action=get&key=' . urlencode($key));
        $v = $r['veri']['value'] ?? null;
        return $v === null ? null : json_decode($v, true);
    }
    static function surum($key) {
        $r = self::istek('?action=get&key=' . urlencode($key));
        return $r['veri']['surum'] ?? null;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ÇALIŞTIRICI
// ════════════════════════════════════════════════════════════════════════════
$kokDizin = dirname(__DIR__);
$gecici = sys_get_temp_dir() . '/uretimos_test_' . bin2hex(random_bytes(4));
@mkdir($gecici, 0775, true);
$port = 8300 + random_int(0, 600);

echo "\033[1mÜretimOS test takımı\033[0m\n";
echo "  geçici veritabanı : $gecici/test.sqlite\n";
echo "  test sunucusu     : 127.0.0.1:$port\n";
echo "  \033[33mgerçek data.sqlite dosyasına dokunulmaz\033[0m\n";

// Test sunucusunu ayrı veritabanıyla başlat
$env = 'URETIMOS_DB=' . escapeshellarg($gecici . '/test.sqlite') .
       ' URETIMOS_BACKUP=' . escapeshellarg($gecici . '/backups');
$komut = "$env php -S 127.0.0.1:$port -t " . escapeshellarg($kokDizin) . " > /dev/null 2>&1 & echo $!";
$pid = (int)trim(shell_exec($komut));
usleep(900000);   // sunucunun ayağa kalkmasını bekle

Test::$temel = "http://127.0.0.1:$port/api.php";

// Sunucu gerçekten ayakta mı?
$saglik = Test::istek('?action=hatListesi');
if ($saglik['kod'] === 0) {
    echo "\033[31mTest sunucusu başlatılamadı. PHP'nin PATH'te olduğundan emin olun.\033[0m\n";
    if ($pid) @exec("kill $pid 2>/dev/null");
    exit(1);
}

// Yönetim oturumu
Test::$token = Test::girisYap();
if (!Test::$token) {
    echo "\033[31mYönetim girişi başarısız — testler çalıştırılamıyor.\033[0m\n";
    if ($pid) @exec("kill $pid 2>/dev/null");
    exit(1);
}

// Test dosyalarını sırayla çalıştır
$dosyalar = glob(__DIR__ . '/*_test.php');
sort($dosyalar);
if (!$dosyalar) echo "\n\033[33mUyarı: testler/ içinde *_test.php bulunamadı.\033[0m\n";

$basladi = microtime(true);
foreach ($dosyalar as $dosya) {
    Test::$suanki = basename($dosya);
    echo "\n\033[1;35m▸ " . basename($dosya) . "\033[0m\n";
    try {
        require $dosya;
    } catch (Throwable $e) {
        Test::dogru(false, 'Test dosyası hata verdi', get_class($e) . ': ' . $e->getMessage());
    }
}
$sure = round(microtime(true) - $basladi, 2);

// Temizlik
if ($pid) @exec("kill $pid 2>/dev/null");
@array_map('unlink', glob("$gecici/backups/*") ?: []);
@rmdir("$gecici/backups");
@array_map('unlink', glob("$gecici/*") ?: []);
@rmdir($gecici);

// Özet
$toplam = Test::$gecen + Test::$kalan;
echo "\n" . str_repeat('─', 58) . "\n";
if (Test::$kalan === 0) {
    echo "\033[1;32m✓ $toplam kontrolün tamamı geçti\033[0m  ({$sure}s)\n";
    exit(0);
}
echo "\033[1;31m✗ " . Test::$kalan . " kontrol başarısız\033[0m  (" . Test::$gecen . " geçti, {$sure}s)\n\n";
foreach (Test::$hatalar as $h) echo "  • $h\n";
echo "\n";
exit(1);
