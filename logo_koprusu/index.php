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

// ── CORS (tarayıcıdan çapraz-kaynak erişim) ──────────────────────────────
// GERÇEK TESTTE YAKALANDI: bu köprünün adresi ÜretimOS'un kendi origininden
// FARKLI (host/port farklı) olduğu için tarayıcı önce bir OPTIONS
// "preflight" isteği gönderir. Preflight, X-API-Key başlığını TAŞIMAZ —
// özel başlıklar yalnızca asıl istekte gönderilir — bu yüzden CORS/OPTIONS
// yanıtı aşağıdaki API anahtarı kontrolünden ÖNCE ve o kontrole HİÇ
// TAKILMADAN verilmelidir; aksi halde preflight 401 alır ve tarayıcı asıl
// isteği hiç göndermez.
$izinliKaynaklar = $ayar['izinliKaynaklar'] ?? [];
$gelenKaynak = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($gelenKaynak !== '' && in_array($gelenKaynak, $izinliKaynaklar, true)) {
    header('Access-Control-Allow-Origin: ' . $gelenKaynak);
    header('Vary: Origin');
    // Chrome'un "Private Network Access" politikası: herkese açık bir
    // origin (ör. https://uretimos.com.tr) özel/yerel bir adrese (bu
    // köprü) istek atınca ayrıca bu izni ister — yoksa preflight sessizce
    // reddedilir, X-API-Key doğru olsa bile isteğe hiç sıra gelmez.
    header('Access-Control-Allow-Private-Network: true');
}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: X-API-Key');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

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
// GERÇEK ÜRETİM VERİSİYLE DOĞRULANDI (bir önceki sürümdeki Urun_Kart_Turu_Adi
// metin tahmini YANLIŞTI): sınıflandırma Urun_Kart_Turu_Kodu sayısal
// sütununda — 10 Hammadde, 11 Yarı Mamul, 12 Mamul, 13 Tüketim Malı.
// Aktiflik URUN_AKTIF sütunuyla süzülür. Gerçek aktif kayıt sayıları çok
// büyük (Mamul 20.581, Yarı Mamul 63.792) — bu yüzden TOP N yerine
// OFFSET/FETCH ile SAYFALAMA yapılıyor; çağıran taraf ?sayfa=1,2,3…
// diyerek tüm kayıtları adım adım çeker, tek istekte hepsini çekmeye çalışıp
// zaman aşımına/bellek hatasına girmez.
$tip = $_GET['tip'] ?? 'tumu';
$sayfa = max(1, (int)($_GET['sayfa'] ?? 1));
$adet = min(5000, max(1, (int)($_GET['adet'] ?? 2000)));

$tablo = $ayar['tablo'] ?? '';
$siraSutunu = $ayar['siraSutunu'] ?? 'StokKodu';
$ozelKosullar = $ayar['kosullar'] ?? [];
$KOSULLAR = [
    'urun'      => $ozelKosullar['urun']      ?? "Urun_Kart_Turu_Kodu = 12 AND URUN_AKTIF = 1",
    'yarimamul' => $ozelKosullar['yarimamul'] ?? "Urun_Kart_Turu_Kodu = 11 AND URUN_AKTIF = 1",
    'hammadde'  => $ozelKosullar['hammadde']  ?? "Urun_Kart_Turu_Kodu IN (10, 13) AND URUN_AKTIF = 1",
    'tumu'      => $ozelKosullar['tumu']      ?? "URUN_AKTIF = 1",
];
if ($tablo === '' || !array_key_exists($tip, $KOSULLAR)) {
    http_response_code(400);
    echo json_encode(['hata' => "ayarlar.php'de 'tablo' boş ya da bilinmeyen tip: $tip. Geçerli tipler: " . implode(', ', array_keys($KOSULLAR))], JSON_UNESCAPED_UNICODE);
    exit;
}
$kosul = $KOSULLAR[$tip];
$offset = ($sayfa - 1) * $adet;
// $offset/$adet (int)/(min/max) ile sabitlendi, $tablo/$siraSutunu/$kosul
// yalnızca yerel ayarlar.php'den gelir (kullanıcı girdisi değil) — SQL
// enjeksiyonu riski yok.
$sql = "SELECT * FROM $tablo WHERE $kosul ORDER BY $siraSutunu OFFSET $offset ROWS FETCH NEXT $adet ROWS ONLY";
$sayimSql = "SELECT COUNT(*) FROM $tablo WHERE $kosul";

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

    $toplam = (int)$pdo->query($sayimSql)->fetchColumn();

    $stmt = $pdo->query($sql);
    $satirlar = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ── KODLAMA DÜZELTMESİ ─────────────────────────────────────────────────
    // GERÇEK TESTTE YAKALANDI: LOGO'nun SQL Server ODBC sürücüsü Türkçe
    // metni genellikle Windows-1254 (CP1254) döndürür, UTF-8 DEĞİL.
    // json_encode bunu UTF-8 sanıp "Malformed UTF-8 characters" hatasıyla
    // false dönüyor ve yanıt sessizce BOŞ kalıyordu. Her string alan açıkça
    // UTF-8'e çevriliyor; kaynak kodlama ayarlar.php'de değiştirilebilir
    // (sürücü zaten UTF-8 dönüyorsa 'kaynakKodlama' => 'UTF-8' yapın, bu
    // durumda çeviri atlanır).
    $kaynakKodlama = $ayar['kaynakKodlama'] ?? 'Windows-1254';
    if ($kaynakKodlama !== '' && strtoupper($kaynakKodlama) !== 'UTF-8') {
        array_walk_recursive($satirlar, function (&$deger) use ($kaynakKodlama) {
            if (is_string($deger)) {
                $cevrilen = @mb_convert_encoding($deger, 'UTF-8', $kaynakKodlama);
                if ($cevrilen !== false) $deger = $cevrilen;
            }
        });
    }

    $govde = [
        'kayitlar' => $satirlar,
        'adet' => count($satirlar),
        'toplam' => $toplam,
        'sayfa' => $sayfa,
        'sayfaBoyutu' => $adet,
        'sonSayfaMi' => ($offset + count($satirlar)) >= $toplam,
        'tip' => $tip,
    ];
    // JSON_INVALID_UTF8_SUBSTITUTE: yukarıdaki çeviri atlanan/beklenmedik
    // bir ikili değer kalırsa json_encode yine de false DÖNMEZ, o karakteri
    // "�" ile değiştirir — sessiz boş yanıt yerine en kötü ihtimalle bozuk
    // TEK bir karakter.
    $json = json_encode($govde, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        http_response_code(500);
        echo json_encode(['hata' => 'JSON kodlama hatası: ' . json_last_error_msg()], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo $json;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['hata' => 'LOGO bağlantı/sorgu hatası: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
