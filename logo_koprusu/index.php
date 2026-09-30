<?php
// ════════════════════════════════════════════════════════════════════════════
// LOGO SQL KÖPRÜSÜ — ÜretimOS'un "ERP Entegrasyon Merkezi"ne LOGO'nun SQL
// Server veritabanından salt-okunur veri sağlayan BAĞIMSIZ bir HTTP köprüsü.
// ────────────────────────────────────────────────────────────────────────────
// NEDEN GEREKLİ: ÜretimOS'un mevcut Entegrasyon Merkezi (bkz. ag_entegrasyon.js
// / page_ag_entegrasyon.js) TARAYICIDAN doğrudan JSON döndüren bir HTTP
// adresine bağlanır — bu, tasarım gereği güvenlik politikasıyla yalnızca
// aynı-origin veya *.local adreslerle sınırlıdır (bkz. .htaccess CSP). LOGO'nun
// SQL Server veritabanı ise HTTP değil TDS protokolü konuşur; tarayıcı ham bir
// veritabanı bağlantısı AÇAMAZ. Bu script o farkı kapatır: LOGO SQL Server'a
// PHP ile bağlanır, sonucu ÜretimOS'un beklediği düz JSON kayıt dizisine
// çevirir — ÜretimOS'un kendisinde HİÇBİR kod değişikliği GEREKMEZ, yalnızca
// Entegrasyon Merkezi'ne bu köprünün adresini bir "Bağlantı Profili" olarak
// eklemeniz yeterlidir (bkz. logo_koprusu/README.md).
//
// NEREYE KURULUR: cPanel'deki ana ÜretimOS klasörüne DEĞİL — LOGO SQL
// sunucusuna ağ üzerinden erişebilen, şirket içi (yerel ağ) bir bilgisayara/
// sunucuya. En basiti: "Doxa_Logo_Sql_Server" ODBC veri kaynağının zaten
// tanımlı olduğu AYNI Windows bilgisayar (bkz. README "Yöntem 1").
//
// GÜVENLİK: Gerçek kullanıcı adı/şifre bu dosyada DEĞİL, yanındaki
// ayarlar.php dosyasında tutulur. ayarlar.php .gitignore'dadır, ASLA git'e
// eklenmez — bu klasördeki ayarlar.ornek.php'yi ayarlar.php olarak kopyalayıp
// kendi bilgilerinizi oraya yazın. Bu köprü SALT OKUNUR sorgular çalıştırır;
// LOGO veritabanına asla yazma/güncelleme yapmaz.
// ════════════════════════════════════════════════════════════════════════════

header('Content-Type: application/json; charset=utf-8');

$ayarYolu = __DIR__ . '/ayarlar.php';
if (!file_exists($ayarYolu)) {
    http_response_code(500);
    echo json_encode(['hata' => 'ayarlar.php bulunamadı. ayarlar.ornek.php dosyasını ayarlar.php olarak kopyalayıp kendi bilgilerinizi girin.'], JSON_UNESCAPED_UNICODE);
    exit;
}
$ayar = require $ayarYolu;

// ── ERİŞİM KONTROLÜ ──────────────────────────────────────────────────────
// Bu köprüye rastgele/dışarıdan erişimi engelleyen paylaşımlı anahtar.
// ÜretimOS'un Entegrasyon Merkezi'nde "Başlık ile" kimlik doğrulama seçilip
// başlık adı X-API-Key, değer bu anahtar olarak girilir.
$gelenAnahtar = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['anahtar'] ?? '');
if (empty($ayar['apiAnahtari']) || !hash_equals((string)$ayar['apiAnahtari'], (string)$gelenAnahtar)) {
    http_response_code(401);
    echo json_encode(['hata' => 'Geçersiz veya eksik API anahtarı (X-API-Key başlığı ya da ?anahtar= parametresi).'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── SORGU SEÇİMİ ─────────────────────────────────────────────────────────
// LOGO'nun malzeme kartları tek bir tabloda/görünümde, bir TÜR sütunuyla
// (HM/YM/MM/TİM) ayrışıyor olabilir — page_tiger_aktarim.js'teki Excel
// aktarımıyla AYNI sınıflandırma kuralı burada da varsayım olarak kullanıldı.
// Gerçek tablo/görünüm ve sütun adları ayarlar.php'de DOĞRULANMALI/
// DÜZENLENMELİDİR — buradaki adlar yalnızca makul bir varsayılandır.
$tip = $_GET['tip'] ?? 'tumu';
$tablo = $ayar['tablo'] ?? '';
$ozelSorgular = $ayar['sorgular'] ?? [];
$SORGULAR = [
    'urun'      => $ozelSorgular['urun']      ?? ($tablo !== '' ? "SELECT TOP 1000 * FROM $tablo WHERE TURU = 'MM'" : null),
    'yarimamul' => $ozelSorgular['yarimamul'] ?? ($tablo !== '' ? "SELECT TOP 1000 * FROM $tablo WHERE TURU = 'YM'" : null),
    'hammadde'  => $ozelSorgular['hammadde']  ?? ($tablo !== '' ? "SELECT TOP 1000 * FROM $tablo WHERE TURU IN ('HM','TIM')" : null),
    'tumu'      => $ozelSorgular['tumu']      ?? ($tablo !== '' ? "SELECT TOP 2000 * FROM $tablo" : null),
];
if (!array_key_exists($tip, $SORGULAR) || $SORGULAR[$tip] === null) {
    http_response_code(400);
    echo json_encode(['hata' => "Bilinmeyen ya da yapılandırılmamış tip: $tip. ayarlar.php'de 'tablo' veya 'sorgular' ayarını kontrol edin. Geçerli tipler: " . implode(', ', array_keys($SORGULAR))], JSON_UNESCAPED_UNICODE);
    exit;
}
$sql = $SORGULAR[$tip];

// ── BAĞLANTI ─────────────────────────────────────────────────────────────
// Sırayla dener: 1) Windows ODBC DSN adıyla (en basit — DSN zaten Windows'ta
// tanımlıysa sunucu/veritabanı adını bilmeye GEREK YOK), 2) PDO sqlsrv
// sürücüsüyle doğrudan sunucu adresine, 3) PDO dblib (FreeTDS — çoğunlukla
// Linux barındırmalarda bulunur).
function logoyaBaglan(array $ayar): PDO
{
    $denemeler = [];

    if (!empty($ayar['dsnAdi']) && in_array('odbc', PDO::getAvailableDrivers(), true)) {
        try {
            return new PDO('odbc:' . $ayar['dsnAdi'], $ayar['kullanici'] ?? '', $ayar['sifre'] ?? '');
        } catch (Throwable $e) {
            $denemeler[] = 'odbc(' . $ayar['dsnAdi'] . '): ' . $e->getMessage();
        }
    }
    if (!empty($ayar['sunucu']) && in_array('sqlsrv', PDO::getAvailableDrivers(), true)) {
        try {
            return new PDO('sqlsrv:Server=' . $ayar['sunucu'] . ';Database=' . ($ayar['veritabani'] ?? ''), $ayar['kullanici'] ?? '', $ayar['sifre'] ?? '');
        } catch (Throwable $e) {
            $denemeler[] = 'sqlsrv: ' . $e->getMessage();
        }
    }
    if (!empty($ayar['sunucu']) && in_array('dblib', PDO::getAvailableDrivers(), true)) {
        try {
            return new PDO('dblib:host=' . $ayar['sunucu'] . ';dbname=' . ($ayar['veritabani'] ?? ''), $ayar['kullanici'] ?? '', $ayar['sifre'] ?? '');
        } catch (Throwable $e) {
            $denemeler[] = 'dblib: ' . $e->getMessage();
        }
    }
    throw new RuntimeException('Hiçbir bağlantı yöntemi çalışmadı: ' . implode(' | ', $denemeler ?: ['uygun sürücü yok veya ayarlar.php\'de dsnAdi/sunucu boş — PDO::getAvailableDrivers() çıktısını kontrol edin']));
}

try {
    $pdo = logoyaBaglan($ayar);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $stmt = $pdo->query($sql);
    $satirlar = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['kayitlar' => $satirlar, 'adet' => count($satirlar), 'tip' => $tip], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['hata' => 'LOGO bağlantı/sorgu hatası: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
