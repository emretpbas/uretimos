<?php
// Günlük yedek ayarı (30 gün) ve cron betiği güvenlik testi.
$kok = dirname(__DIR__);
$gecti = 0; $kaldi = 0;
function kontrol($ad, $sonuc) { global $gecti, $kaldi; if ($sonuc) { $gecti++; echo "  \xe2\x9c\x93 $ad\n"; } else { $kaldi++; echo "  \xe2\x9c\x97 $ad\n"; } }

$api = file_get_contents("$kok/api.php");
$cron = file_get_contents("$kok/gunluk_yedek.php");
$ht = file_get_contents("$kok/.htaccess");

echo "-- Yedek tutma ayari (30 gun) --\n";
kontrol("api.php tutma adedi 30", preg_match("/YEDEK_TUTMA_ADEDI',\s*30\)/", $api));
kontrol("cron betigi tutma 30", preg_match('/\$TUTMA\s*=\s*30/', $cron));

echo "-- Cron betigi guvenligi --\n";
kontrol("Web erisimi engelli (PHP_SAPI cli)", strpos($cron, "PHP_SAPI !== 'cli'") !== false);
kontrol(".htaccess cron betigini kapatiyor", strpos($ht, 'gunluk_yedek\.php') !== false);
kontrol("backups/ web'den kapali", strpos($ht, 'backups/') !== false);
kontrol(".sqlite web'den kapali", strpos($ht, 'sqlite') !== false);

echo "-- Rotasyon mantigi (30 gun) --\n";
$tmp = sys_get_temp_dir() . '/yedek_rot_' . uniqid();
mkdir("$tmp/backups", 0775, true);
file_put_contents("$tmp/db.sqlite", "x");
$TUTMA = 30;
// 33 gun yedek al -> 30 kalmali, en eski 3 silinmeli
for ($i = 1; $i <= 33; $i++) {
    $tarih = date('Y-m-d', strtotime("2026-01-01 +" . ($i-1) . " days"));
    $h = "$tmp/backups/uretimos_$tarih.sqlite";
    if (!file_exists($h)) copy("$tmp/db.sqlite", $h);
    $d = glob("$tmp/backups/uretimos_*.sqlite");
    if (count($d) > $TUTMA) { sort($d); foreach (array_slice($d, 0, count($d)-$TUTMA) as $f) unlink($f); }
}
$kalan = glob("$tmp/backups/uretimos_*.sqlite");
sort($kalan);
kontrol("33 gunden sonra 30 yedek kaldi", count($kalan) === 30);
// 2026-01-01,02,03 silinmis, en eski 2026-01-04 olmali
kontrol("En eski 3 gun donusum ile silindi", basename($kalan[0]) === 'uretimos_2026-01-04.sqlite');
kontrol("En yeni gun korundu", basename($kalan[29]) === 'uretimos_2026-02-02.sqlite');
array_map('unlink', glob("$tmp/backups/*")); rmdir("$tmp/backups"); unlink("$tmp/db.sqlite"); rmdir($tmp);

echo "\nSONUC: $gecti gecti, $kaldi kaldi\n";
exit($kaldi ? 1 : 0);
