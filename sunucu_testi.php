<?php
/* ════════════════════════════════════════════════════════════════════════════
   ÜretimOS — SUNUCU KAPASİTE TESTİ

   Bu dosya SİZİN sunucunuzun gerçek sınırlarını ölçer. Ölçeklendirme kararı
   tahminle değil, bu çıktıyla verilmelidir.

   NE YAPAR
     1) PHP sürümü, bellek limiti, süre limiti, eklentiler
     2) MySQL/MariaDB var mı (SQLite'tan geçiş mümkün mü)
     3) Mevcut data.sqlite içindeki HER KOLEKSİYONUN gerçek boyutu
     4) Bu sunucuda json_decode/json_encode hızı ve bellek tüketimi ölçümü
     5) Yukarıdakilerden hareketle: bu sunucu kaç reçeteye kadar dayanır

   NE YAPMAZ
     · Hiçbir veriyi değiştirmez, silmez, dışarı göndermez. SALT OKUR.
     · Kayıt içeriğini göstermez; yalnızca boyut ve adet raporlar.

   KULLANIM
     1) Aşağıdaki ANAHTAR değerini değiştirin (rastgele bir şey yazın).
     2) Dosyayı public_html içine yükleyin.
     3) Tarayıcıdan açın:  https://siteniz.com/sunucu_testi.php?anahtar=YAZDIGINIZ
     4) Çıktıyı bana iletin.
     5) İŞİNİZ BİTİNCE DOSYAYI SUNUCUDAN SİLİN.
   ════════════════════════════════════════════════════════════════════════════ */

$ANAHTAR = 'degistir-beni-1234';

// Bir aksilik olursa boş sayfa yerine hatayı göster — sorunu bildirebilmeniz için
ini_set('display_errors', '1');
error_reporting(E_ALL);

if (($_GET['anahtar'] ?? '') !== $ANAHTAR) {
    http_response_code(403);
    exit('Erişim yok. Dosyadaki $ANAHTAR degerini ayarlayip ?anahtar=... ile acin.');
}
@set_time_limit(120);
header('Content-Type: text/html; charset=utf-8');

function mb2($b) { return number_format($b / 1048576, 1, ',', '.') . ' MB'; }
function ok($v)  { return $v ? '<b style="color:#0a7">✓</b>' : '<b style="color:#c33">✗</b>'; }
function sayi($n){ return number_format($n, 0, ',', '.'); }

$satirlar = [];
function ekle($bolum, $ad, $deger, $not = '') {
    global $satirlar;
    $satirlar[] = [$bolum, $ad, $deger, $not];
}

/* ── 1) PHP ORTAMI ──────────────────────────────────────────────────────── */
$memLimit = ini_get('memory_limit');
$memBytes = (function ($v) {
    $v = trim($v); if ($v === '-1') return -1;
    $son = strtolower($v[strlen($v) - 1]); $n = (int)$v;
    if ($son === 'g') $n *= 1073741824; elseif ($son === 'm') $n *= 1048576; elseif ($son === 'k') $n *= 1024;
    return $n;
})($memLimit);

ekle('PHP', 'Sürüm', PHP_VERSION, version_compare(PHP_VERSION, '8.0', '>=') ? 'yeterli' : 'PHP 8+ önerilir');
ekle('PHP', 'memory_limit', $memLimit, $memBytes === -1 ? 'sınırsız' : ($memBytes >= 512*1048576 ? 'iyi' : ($memBytes >= 256*1048576 ? 'sınırda' : 'DÜŞÜK — büyük veride yetmez')));
ekle('PHP', 'max_execution_time', ini_get('max_execution_time') . ' sn', '');
ekle('PHP', 'post_max_size', ini_get('post_max_size'), '');
ekle('PHP', 'upload_max_filesize', ini_get('upload_max_filesize'), '');
ekle('PHP', 'OPcache', ok(function_exists('opcache_get_status') && @opcache_get_status()), 'açık olmalı');

/* ── 2) EKLENTİLER VE VERİTABANI ────────────────────────────────────────── */
$pdoDrivers = class_exists('PDO') ? PDO::getAvailableDrivers() : [];
ekle('Veritabanı', 'pdo_sqlite', ok(in_array('sqlite', $pdoDrivers)), 'şu an kullanılıyor');
ekle('Veritabanı', 'pdo_mysql', ok(in_array('mysql', $pdoDrivers)), in_array('mysql', $pdoDrivers) ? 'MariaDB geçişi MÜMKÜN' : 'MariaDB geçişi için gerekli');
ekle('Veritabanı', 'SQLite sürümü', in_array('sqlite', $pdoDrivers) ? (new PDO('sqlite::memory:'))->query('select sqlite_version()')->fetchColumn() : '—', '');
ekle('Eklenti', 'zlib (sıkıştırma)', ok(extension_loaded('zlib')), '');
ekle('Eklenti', 'mbstring', ok(extension_loaded('mbstring')), '');

/* ── 3) DİSK ────────────────────────────────────────────────────────────── */
$kok = __DIR__;
$bos = @disk_free_space($kok);
$top = @disk_total_space($kok);
if ($bos && $top) {
    ekle('Disk', 'Toplam', mb2($top), '');
    ekle('Disk', 'Boş', mb2($bos), 'veri 3 yılda ~1,3 GB olur');
}

/* ── 4) MEVCUT VERİNİN GERÇEK BOYUTU ────────────────────────────────────── */
$dbYol = $kok . '/data.sqlite';
$koleksiyonlar = [];
$toplamVeri = 0;
if (is_file($dbYol)) {
    ekle('Veri', 'data.sqlite dosya boyutu', mb2(filesize($dbYol)), '');
    try {
        $pdo = new PDO('sqlite:' . $dbYol);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $q = $pdo->query("SELECT store_key, LENGTH(store_value) AS bayt FROM kv_store ORDER BY bayt DESC");
        while ($r = $q->fetch(PDO::FETCH_ASSOC)) {
            // Kayıt adedini ucuza tahmin et: '{"id":' geçiş sayısı
            $adet = null;
            if ($r['bayt'] < 25 * 1048576) {          // 25 MB altındaysa güvenle sayabiliriz
                $v = $pdo->query("SELECT store_value FROM kv_store WHERE store_key = " . $pdo->quote($r['store_key']))->fetchColumn();
                $adet = substr_count((string)$v, '"id"');
                unset($v);
            }
            $koleksiyonlar[] = ['ad' => $r['store_key'], 'bayt' => (int)$r['bayt'], 'adet' => $adet];
            $toplamVeri += (int)$r['bayt'];
        }
    } catch (Exception $e) {
        ekle('Veri', 'data.sqlite okunamadı', $e->getMessage(), '');
    }
} else {
    ekle('Veri', 'data.sqlite', 'bulunamadı', 'bu dosyayı public_html içine koyun');
}

/* ── 5) BU SUNUCUDA JSON PERFORMANSI ────────────────────────────────────── */
/* Gerçek reçete şeklinde sentetik veri üretip ölçer. Bellek limitine
   yaklaşınca kendi kendini durdurur — sunucuyu zorlamaz. */
$olcumler = [];
$guvenliTavan = ($memBytes === -1) ? 512 * 1048576 : (int)($memBytes * 0.45);
foreach ([250, 1000, 4000, 12000] as $n) {
    if (memory_get_usage(true) > $guvenliTavan) break;
    $dizi = [];
    for ($i = 0; $i < $n; $i++) {
        $kalemler = [];
        $m = 12 + ($i % 17);
        for ($j = 0; $j < $m; $j++) {
            $k = ['tip' => 'hammadde', 'refId' => 'HM-' . (($i * 7 + $j) % 5000), 'miktar' => 5.25, 'birim' => 'ADET'];
            if ($j % 4 === 0) {
                $k['olcu'] = ['kabaEn' => 720, 'kabaBoy' => 1620, 'netEn' => 700, 'netBoy' => 1600];
                $k['kenarBantlari'] = ['on' => 'BNT-1', 'arka' => 'BNT-1', 'sag' => null, 'sol' => null];
            }
            $kalemler[] = $k;
        }
        $dizi[] = ['id' => 'RC-' . $i, 'urunId' => 'URN-' . $i,
                   'ad' => 'Colorit Lav.Dlb. TABLALI 60cm KPK.Pkt.1.Nil Yes Recetesi', 'kalemler' => $kalemler];
    }
    $t0 = microtime(true);  $json = json_encode($dizi);        $tEnc = (microtime(true) - $t0) * 1000;
    $bayt = strlen($json);
    unset($dizi);
    $m0 = memory_get_usage(true);
    $t0 = microtime(true);  $coz = json_decode($json, true);   $tDec = (microtime(true) - $t0) * 1000;
    $bellek = memory_get_usage(true) - $m0;
    unset($coz, $json);
    $olcumler[] = ['n' => $n, 'bayt' => $bayt, 'enc' => $tEnc, 'dec' => $tDec, 'ram' => $bellek];
    if ($tEnc + $tDec > 8000) break;   // 8 sn'yi aşarsa devam etmeye gerek yok
}
$zirve = memory_get_peak_usage(true);

/* Ölçümlerden çarpanı bul → bu sunucunun tavanını hesapla */
$tavanReçete = null;
if (count($olcumler)) {
    $son = end($olcumler);
    $baytBasiRam = $son['ram'] > 0 ? $son['ram'] / $son['bayt'] : 7;
    $receteBasiBayt = $son['bayt'] / $son['n'];
    if ($memBytes > 0) {
        // Kullanılabilir belleğin %60'ı json_decode için ayrılabilir kabul edildi
        $tavanReçete = (int)((($memBytes * 0.60) / $baytBasiRam) / $receteBasiBayt);
    }
}
?><!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ÜretimOS — Sunucu Kapasite Testi</title>
<style>
 body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;padding:20px;background:#f6f7f9;color:#222}
 .k{max-width:960px;margin:0 auto}
 h1{font-size:20px;margin:0 0 4px} .alt{color:#666;font-size:13px;margin-bottom:18px}
 h2{font-size:14px;margin:22px 0 8px;padding-bottom:5px;border-bottom:2px solid #dde}
 table{border-collapse:collapse;width:100%;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden;
   box-shadow:0 1px 3px rgba(0,0,0,.07);margin-bottom:6px}
 th,td{border-bottom:1px solid #eee;padding:7px 10px;text-align:left}
 th{background:#eef1f5;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
 td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
 .uy{background:#fff6e5;border:1px solid #f0d089;border-radius:8px;padding:10px 12px;font-size:12.5px;margin:10px 0}
 .iy{background:#e8f6ee;border:1px solid #9ad3b2;border-radius:8px;padding:10px 12px;font-size:12.5px;margin:10px 0}
 .kt{background:#fdecea;border:1px solid #f0a9a2;border-radius:8px;padding:10px 12px;font-size:12.5px;margin:10px 0}
 .bar{height:7px;background:#e6e9ee;border-radius:4px;overflow:hidden}
 .bar>i{display:block;height:100%;background:#4a7cf0}
 code{background:#eef1f5;padding:1px 5px;border-radius:4px;font-size:11.5px}
</style></head><body><div class="k">

<h1>ÜretimOS — Sunucu Kapasite Testi</h1>
<div class="alt"><?= date('d.m.Y H:i') ?> · <?= htmlspecialchars($_SERVER['HTTP_HOST'] ?? '') ?> · salt okuma, hiçbir veri değiştirilmedi</div>

<h2>1 · Sunucu Ortamı</h2>
<table><tr><th>Bölüm</th><th>Ayar</th><th>Değer</th><th>Değerlendirme</th></tr>
<?php foreach ($satirlar as $s): ?>
<tr><td><?= htmlspecialchars($s[0]) ?></td><td><?= htmlspecialchars($s[1]) ?></td>
<td><b><?= $s[2] ?></b></td><td style="color:#666"><?= htmlspecialchars($s[3]) ?></td></tr>
<?php endforeach; ?></table>

<h2>2 · Mevcut Verinin Gerçek Boyutu</h2>
<?php if ($koleksiyonlar): ?>
<table><tr><th>Koleksiyon</th><th class="r">Boyut</th><th class="r">Yaklaşık kayıt</th><th style="width:34%">Pay</th></tr>
<?php foreach (array_slice($koleksiyonlar, 0, 25) as $c):
  $pay = $toplamVeri ? ($c['bayt'] / $toplamVeri * 100) : 0; ?>
<tr><td><code><?= htmlspecialchars($c['ad']) ?></code></td>
    <td class="r"><?= mb2($c['bayt']) ?></td>
    <td class="r"><?= $c['adet'] === null ? '—' : sayi($c['adet']) ?></td>
    <td><div class="bar"><i style="width:<?= round($pay) ?>%"></i></div></td></tr>
<?php endforeach; ?>
<tr style="background:#f2f4f7"><td><b>TOPLAM</b></td><td class="r"><b><?= mb2($toplamVeri) ?></b></td><td></td><td></td></tr>
</table>
<div class="alt">En büyük koleksiyon her sayfa açılışında ve her kayıt işleminde <b>tamamen</b> okunup yazılır.</div>
<?php else: ?><div class="uy">Koleksiyon bilgisi okunamadı.</div><?php endif; ?>

<h2>3 · Bu Sunucuda JSON Performansı</h2>
<?php if ($olcumler): ?>
<table><tr><th class="r">Reçete</th><th class="r">Blob</th><th class="r">json_encode</th><th class="r">json_decode</th>
<th class="r">Toplam (upsert)</th><th class="r">Bellek</th></tr>
<?php foreach ($olcumler as $o): ?>
<tr><td class="r"><?= sayi($o['n']) ?></td><td class="r"><?= mb2($o['bayt']) ?></td>
<td class="r"><?= number_format($o['enc'], 0, ',', '.') ?> ms</td>
<td class="r"><?= number_format($o['dec'], 0, ',', '.') ?> ms</td>
<td class="r"><b><?= number_format($o['enc'] + $o['dec'], 0, ',', '.') ?> ms</b></td>
<td class="r"><?= mb2($o['ram']) ?></td></tr>
<?php endforeach; ?></table>
<div class="alt">Zirve bellek kullanımı: <b><?= mb2($zirve) ?></b> / limit <b><?= $memLimit ?></b></div>
<?php else: ?><div class="uy">Ölçüm yapılamadı (bellek limiti çok düşük olabilir).</div><?php endif; ?>

<h2>4 · Sonuç</h2>
<?php if ($tavanReçete !== null): ?>
  <?php if ($tavanReçete < 15000): ?>
  <div class="kt"><b>Bu sunucu mevcut mimariyle yaklaşık <?= sayi($tavanReçete) ?> reçeteye kadar dayanır.</b><br>
  Hedefiniz 40.000. Yani <u>disk değil, bellek</u> duvarına çarpılacak. Veriyi satır bazlı
  tablolara taşımak zorunlu.</div>
  <?php else: ?>
  <div class="iy"><b>Bu sunucu mevcut mimariyle yaklaşık <?= sayi($tavanReçete) ?> reçeteye kadar dayanır.</b><br>
  Yine de her kayıt işlemi tüm koleksiyonu okuyup yazdığı için, kayıt sayısı arttıkça
  her işlem yavaşlamaya devam eder.</div>
  <?php endif; ?>
<?php endif; ?>

<?php if (!in_array('mysql', $pdoDrivers)): ?>
<div class="uy"><b>pdo_mysql yok.</b> MariaDB geçişi için hosting sağlayıcınızdan bu eklentiyi
istemeniz gerekir. cPanel hostinglerin çoğunda hazır gelir; kapalıysa destek talebiyle açtırılır.</div>
<?php else: ?>
<div class="iy"><b>pdo_mysql mevcut.</b> SQLite → MariaDB geçişi bu sunucuda yapılabilir.
cPanel → MySQL Databases bölümünden bir veritabanı ve kullanıcı oluşturmanız yeterli.</div>
<?php endif; ?>

<div class="uy" style="margin-top:18px"><b>Bu dosyayı sunucudan silin.</b>
Sunucu ayarlarını ve veri boyutlarını gösterdiği için kalıcı bırakılmamalıdır.</div>

</div></body></html>
