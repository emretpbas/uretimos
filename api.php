<?php
// ════════════════════════════════════════════════════════════════════════════
// ÜRETİMOS — PHP + SQLite BACKEND API (GÜVENLİ SÜRÜM v2)
//
// Bu sürümdeki güvenlik katmanları:
//   1. TOKEN KİMLİK DOĞRULAMA — login olmadan hiçbir veri okunamaz/yazılamaz.
//      Giriş başarılı olunca rastgele 64 karakterlik token üretilir, tüm
//      sonraki istekler "Authorization: Bearer <token>" başlığıyla gelir.
//   2. SUNUCU TARAFI ŞİFRE DOĞRULAMA — bcrypt (password_hash/password_verify).
//      Eski düz metin şifreler ilk başarılı girişte OTOMATİK hash'e yükseltilir.
//   3. GİRİŞ DENEME SINIRI — aynı IP'den 15 dakikada 10 başarısız deneme
//      sonrası geçici kilit (kaba kuvvet koruması).
//   4. DENETİM KAYDI (AUDIT LOG) — her yazma/silme işlemi kim/ne zaman/hangi
//      anahtar bilgisiyle loglanır. Yönetim ekrandan görebilir.
//   5. OTOMATİK GÜNLÜK YEDEK — günün ilk isteğinde data.sqlite backups/
//      klasörüne kopyalanır; son 30 yedek tutulur, eskiler silinir.
//
// Uç noktalar:
//   POST api.php?action=login          body:{kullaniciAdi,sifre} -> {ok,token,kullanici}
//   POST api.php?action=logout                                    -> {ok}
//   GET  api.php?action=get&key=...                              -> {value}
//   POST api.php?action=set            body:{key,value}           -> {ok}
//   POST api.php?action=setIfAbsent    body:{key,value}           -> {written}
//   POST api.php?action=delete         body:{key}                 -> {ok}
//   GET  api.php?action=list&prefix=...                          -> {keys}
//   POST api.php?action=changePassword body:{userId,yeniSifre}    -> {ok}  (yonetim veya kendisi)
//   POST api.php?action=resetPasswords                            -> {ok}  (sadece yonetim)
//   GET  api.php?action=audit&limit=300[&kullanici=&anahtar=]    -> {rows} (sadece yonetim)
//   GET  api.php?action=auditOnizle&id=..                        -> {oncekiSayi,simdikiSayi} (yonetim)
//   POST api.php?action=auditGeriAl    body:{id}                  -> {ok}  (sadece yonetim) GERİ ALMA
//   POST api.php?action=sayfaZiyaret   body:{sayfa,birim}         -> {ok}  (sayfa/birim ziyaret kaydı)
//   GET  api.php?action=ziyaretler&limit=300                     -> {rows} (sadece yonetim)
//   POST api.php?action=montajSemasiOku body:{gorselB64,mediaType,dosyaAdi}
//        -> {ok,parcalar,genelNot} (admin/arge/teknik_ofis/yonetim; URETIMOS_ANTHROPIC_KEY gerekir)
//   POST api.php?action=montajSemasiOkuBaidu body:{gorselB64,mediaType,dosyaAdi}
//        -> {ok,parcalar,genelNot} (admin/arge/teknik_ofis/yonetim; URETIMOS_BAIDU_API_KEY + URETIMOS_BAIDU_SECRET_KEY gerekir)
//   POST api.php?action=montajSemasiOkuGoogle body:{gorselB64,mediaType,dosyaAdi}
//        -> {ok,parcalar,genelNot} (admin/arge/teknik_ofis/yonetim; URETIMOS_GOOGLE_VISION_KEY gerekir)
//   POST api.php?action=hesapTalepEt      body:{ad,email,rol,sifre} -> {ok}  (oturumsuz, IP hız sınırlı)
//   POST api.php?action=hesapTalepiKarar  body:{id,karar:'onayla'|'reddet'} -> {ok} (sadece yonetim)
//   GET  api.php?action=hammaddeKurKarsilastir -> {ok,kurlar,anomaliler} (arge/satinalma/yonetim; anahtarsız, TCMB)
//   POST api.php?action=hammaddePiyasaArama body:{hammaddeIds:[..max 20]} -> {ok,taranan,anomaliler,hatalar}
//        (arge/satinalma/yonetim; URETIMOS_GOOGLE_SEARCH_KEY + URETIMOS_GOOGLE_SEARCH_CX gerekir)
//
// Kurulum: bu klasörde PHP'nin YAZMA izni olmalı (data.sqlite + backups/ için).
// data.sqlite ve backups/ web'den erişime KAPATILMALI (.htaccess dahildir).
// ════════════════════════════════════════════════════════════════════════════

// ── KAYNAK AYARLARI (1 GB RAM'Lİ SUNUCU İÇİN) ──────────────────────────────
// ÖNEMLİ: bu blok HERHANGİ bir çıktıdan (header/echo) ÖNCE gelmek zorundadır,
// aksi halde zlib sıkıştırma devreye girmez.
//
// Neden bu değerler:
//   memory_limit 512M → 1 GB'lık sunucuda PHP-FPM tek işçiye ayrılabilecek
//     güvenli üst sınır. Daha yükseği, iki eşzamanlı ağır istekte sunucunun
//     tamamını (OOM killer) düşürür. Daha düşüğü, mevcut blob mimarisinde
//     büyük koleksiyonları açmaya yetmez.
//   Sınıra ULAŞILMASI zaten bir arıza belirtisidir; aşağıdaki bellekBekcisi()
//     bunu sessizce çökmek yerine anlaşılır bir JSON hatasına çevirir.
@ini_set('memory_limit', '512M');
@ini_set('max_execution_time', '120');
@set_time_limit(120);

// Yanıt sıkıştırma: JSON ~%85 sıkışır. Trafiği ve indirme süresini düşürür.
// (Bellek sorununu ÇÖZMEZ — yalnızca taşımayı hafifletir.)
if (!headers_sent() && !ob_get_level()) {
    @ini_set('zlib.output_compression', '1');
    @ini_set('zlib.output_compression_level', '5');
}

// Üretimde hata metinleri istemciye SIZDIRILMAZ (yol/sorgu bilgisi verir).
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');

// ── BELLEK BEKÇİSİ ─────────────────────────────────────────────────────────
// Blob mimarisi büyük koleksiyonlarda memory_limit'e dayanabilir. PHP bu
// durumda ölümcül hata verip BOŞ yanıt döner; istemci "sunucu bozuk" görür.
// Bu bekçi, ölümcül hatayı yakalayıp anlaşılır bir JSON'a çevirir ki
// kullanıcı ne olduğunu bilsin ve yönetici hangi koleksiyonun şiştiğini görsün.
define('BELLEK_SINIRI_BAYT', 512 * 1024 * 1024);

function bellekYeterMi($gerekenBayt) {
    return (memory_get_usage(true) + $gerekenBayt) < (BELLEK_SINIRI_BAYT * 0.80);
}

register_shutdown_function(function () {
    $hata = error_get_last();
    if (!$hata || !in_array($hata['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) return;
    $bellekHatasi = stripos($hata['message'], 'Allowed memory size') !== false
                 || stripos($hata['message'], 'memory exhausted') !== false;
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code($bellekHatasi ? 507 : 500);
    }
    echo json_encode([
        'error' => $bellekHatasi
            ? 'Sunucu belleği bu koleksiyon için yetmedi. Koleksiyon çok büyümüş — arşivleme gerekiyor.'
            : 'Sunucu tarafında beklenmeyen bir hata oluştu.',
        'bellekHatasi' => $bellekHatasi,
        'zirveBellekMB' => round(memory_get_peak_usage(true) / 1048576, 1)
    ], JSON_UNESCAPED_UNICODE);
});

header('Content-Type: application/json; charset=utf-8');
// CORS: yalnızca güvenilen kaynaklara izin ver. Wildcard (*) yerine beyaz liste;
// böylece başka sitelerden gelen tarayıcı istekleri reddedilir. Kendi
// domain(ler)inizi buraya ekleyin. Uygulama api.php ile AYNI kökten sunulduğu
// için normal kullanımda CORS başlığına gerek bile olmaz; bu, olası alt alan
// veya mobil sarmalayıcı senaryoları içindir.
$IZINLI_KAYNAKLAR = [
    'https://uretimos.com.tr',
    'https://www.uretimos.com.tr',
];
$gelenKaynak = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($gelenKaynak, $IZINLI_KAYNAKLAR, true)) {
    header('Access-Control-Allow-Origin: ' . $gelenKaynak);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// Veritabanı yolu ortam değişkeniyle değiştirilebilir. Üretimde dokunulmaz;
// testler bunu geçici bir klasöre yönlendirerek GERÇEK VERİYE DOKUNMADAN
// çalışır. (Sunucuda böyle bir değişken tanımlı değilse varsayılan kullanılır.)
define('DB_PATH', getenv('URETIMOS_DB') ?: __DIR__ . '/data.sqlite');
define('BACKUP_DIR', getenv('URETIMOS_BACKUP') ?: __DIR__ . '/backups');
define('TOKEN_OMUR_SANIYE', 12 * 3600);   // oturum ömrü: 12 saat
define('MAX_GIRIS_DENEME', 10);            // 15 dk penceresinde izin verilen hata
define('DENEME_PENCERE_SANIYE', 15 * 60);
// Kaç günlük yedek tutulacağı. 30 = son 30 gün tutulur, eskiler döngüsel
// silinir. 30 gün, fark edilmeyen bir bozulmayı geri almak için güvenli bir
// tampon sağlar (kısa süreli 5-7 güne göre çok daha korumalı).
define('YEDEK_TUTMA_ADEDI', 30);
define('TEKNIK_DOSYA_DIZIN', __DIR__ . '/dosyalar');           // QR'lı kartların teknik dosyaları
define('TEKNIK_DOSYA_MAX_BAYT', 15 * 1024 * 1024);             // dosya başına 15 MB
$TEKNIK_UZANTILAR = ['step','stp','dwg','dxf','pdf','xls','xlsx','csv','png','jpg','jpeg','webp','gif'];

function db() {
    static $pdo = null;
    if ($pdo === null) {
        $isNew = !file_exists(DB_PATH);
        $pdo = new PDO('sqlite:' . DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA journal_mode=WAL'); // eşzamanlı okuma performansı
        $pdo->exec('PRAGMA busy_timeout=5000'); // yazma kilidi beklerken 5 sn dene
        $pdo->exec('CREATE TABLE IF NOT EXISTS kv_store (
            store_key TEXT PRIMARY KEY,
            store_value TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            surum INTEGER NOT NULL DEFAULT 0
        )');
        // Eski kurulumlara sürüm sütununu ekle (varsa hata yutulur)
        try { $pdo->exec('ALTER TABLE kv_store ADD COLUMN surum INTEGER NOT NULL DEFAULT 0'); } catch (Exception $e) {}
        $pdo->exec('CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            kullanici_adi TEXT NOT NULL,
            rol TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )');
        $pdo->exec('CREATE TABLE IF NOT EXISTS login_attempts (
            ip TEXT NOT NULL,
            attempted_at INTEGER NOT NULL
        )');
        $pdo->exec('CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            kullanici TEXT NOT NULL,
            islem TEXT NOT NULL,
            anahtar TEXT NOT NULL
        )');
        // GENİŞLETİLMİŞ DENETİM: IP, rol, birim/sayfa, tarayıcı, kayıt sayısı ve
        // GERİ ALMA için değişiklik ÖNCESİ değer. Eski kurulumlarda kolonlar
        // yoksa eklenir (ALTER TABLE hata verirse kolon zaten vardır).
        foreach ([
            'ip TEXT', 'rol TEXT', 'sayfa TEXT', 'tarayici TEXT',
            'onceki_deger TEXT', 'kayit_sayisi INTEGER', 'geri_alindi INTEGER DEFAULT 0'
        ] as $kolon) {
            try { $pdo->exec('ALTER TABLE audit_log ADD COLUMN ' . $kolon); } catch (Exception $e) { /* kolon zaten var */ }
        }
        // Sayfa ziyaretleri (birim/sayfa gezinme kaydı)
        $pdo->exec('CREATE TABLE IF NOT EXISTS sayfa_ziyaretleri (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            kullanici TEXT NOT NULL,
            rol TEXT,
            ip TEXT,
            sayfa TEXT NOT NULL,
            birim TEXT,
            tarayici TEXT
        )');
        // ── İNDEKSLER ──────────────────────────────────────────────────────
        // Bunlar yoktu: audit listesi, budama ve oturum doğrulama her istekte
        // tam tablo taraması yapıyordu. Tablolar büyüdükçe her istek yavaşlar.
        foreach ([
            'CREATE INDEX IF NOT EXISTS ix_audit_ts       ON audit_log (ts)',
            'CREATE INDEX IF NOT EXISTS ix_audit_kullanici ON audit_log (kullanici)',
            'CREATE INDEX IF NOT EXISTS ix_audit_anahtar   ON audit_log (anahtar)',
            'CREATE INDEX IF NOT EXISTS ix_ziyaret_ts      ON sayfa_ziyaretleri (ts)',
            'CREATE INDEX IF NOT EXISTS ix_session_expires ON sessions (expires_at)',
            'CREATE INDEX IF NOT EXISTS ix_deneme_ip       ON login_attempts (ip, attempted_at)'
        ] as $sql) {
            try { $pdo->exec($sql); } catch (Exception $e) { /* indeks zaten var */ }
        }
        if ($isNew) { @chmod(DB_PATH, 0664); }
    }
    return $pdo;
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function readJsonBody() {
    $raw = file_get_contents('php://input');
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

// ── OTOMATİK GÜNLÜK YEDEK ──────────────────────────────────────────────────
// ── EŞZAMANLI YAZMA KORUMASI ──────────────────────────────────────────────
// Sorun: istemci koleksiyonun TAMAMINI okuyup tamamını geri yazıyordu. İki
// kullanıcı aynı anda farklı kaydı değiştirirse ikincinin yazması birincinin
// değişikliğini siliyordu (kayıp güncelleme) — hem de sessizce.
//
// Çözüm iki katmanlı:
//   1) surum (version) sütunu: tam yazmada istemci okuduğu sürümü bildirir;
//      sunucudaki sürüm farklıysa yazma REDDEDİLİR (409) ve güncel veri döner.
//   2) patch ucu: yalnızca DEĞİŞEN kayıtlar gönderilir ve birleştirme sunucuda
//      yazma kilidi altında yapılır — çakışma imkânsızdır.
function kvOkuSurumlu($pdo, $key) {
    $st = $pdo->prepare('SELECT store_value, surum FROM kv_store WHERE store_key = :k');
    $st->execute([':k' => $key]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['deger' => null, 'surum' => 0];
    return ['deger' => $row['store_value'], 'surum' => (int)$row['surum']];
}

function kvYazSurumlu($pdo, $key, $json, $yeniSurum) {
    $now = date('c');
    $st = $pdo->prepare('INSERT INTO kv_store (store_key, store_value, updated_at, surum)
        VALUES (:k,:v,:t,:s)
        ON CONFLICT(store_key) DO UPDATE SET store_value = :v2, updated_at = :t2, surum = :s2');
    $st->execute([':k' => $key, ':v' => $json, ':t' => $now, ':s' => $yeniSurum,
                  ':v2' => $json, ':t2' => $now, ':s2' => $yeniSurum]);
}

// Günün ilk isteğinde data.sqlite'ı backups/uretimos_YYYY-MM-DD.sqlite olarak
// kopyalar. En eski yedekler silinerek son 30 gün tutulur. Yedekleme hatası
// isteği ENGELLEMEZ (log'a düşer) — sistem çalışmaya devam eder.
function gunlukYedekAl() {
    

try {
        if (!file_exists(DB_PATH)) return;
        if (!is_dir(BACKUP_DIR)) { @mkdir(BACKUP_DIR, 0775, true); }
        $hedef = BACKUP_DIR . '/uretimos_' . date('Y-m-d') . '.sqlite';
        if (file_exists($hedef)) return; // bugünün yedeği zaten var
        @copy(DB_PATH, $hedef);
        // Eski yedekleri temizle
        $dosyalar = glob(BACKUP_DIR . '/uretimos_*.sqlite');
        if ($dosyalar && count($dosyalar) > YEDEK_TUTMA_ADEDI) {
            sort($dosyalar); // isim = tarih sıralı
            $silinecek = array_slice($dosyalar, 0, count($dosyalar) - YEDEK_TUTMA_ADEDI);
            foreach ($silinecek as $f) { @unlink($f); }
        }
    } catch (Exception $e) { error_log('UretimOS yedek hatası: ' . $e->getMessage()); }
}

// ── GÜNLÜK BAKIM: SINIRSIZ BÜYÜYEN TABLOLARI BUDA ─────────────────────────
// SORUN: audit_log ve sayfa_ziyaretleri'ni temizleyen HİÇBİR kod yoktu.
// audit_log her yazmada 'onceki_deger' olarak koleksiyonun tamamının bir
// kopyasını saklıyor. Günde ~2.000 yazmada bu tablo veritabanının kendisinden
// kat kat büyür; her günlük yedek de bu şişkinliği 30 kez kopyalar.
//
// ÇÖZÜM: yaş + adet bazlı çift sınır. Geri alma özelliği son 30 gün için
// çalışmaya devam eder; ondan eskisinde yalnızca 'ne olduğu' kaydı kalır,
// ağır 'onceki_deger' içeriği boşaltılır.
define('AUDIT_TUTMA_GUN', 30);          // tam kayıt (geri alınabilir) ömrü
define('AUDIT_MAX_SATIR', 50000);       // mutlak satır tavanı
define('ZIYARET_TUTMA_GUN', 90);
define('ZIYARET_MAX_SATIR', 200000);
define('AUDIT_ONCEKI_MAX_BAYT', 256 * 1024);   // geri alma için saklanan azami boyut

function gunlukBakim($pdo) {
    try {
        // Günde bir kez çalış: işaret satırı kv_store'da tutulur
        $bugun = date('Y-m-d');
        $st = $pdo->prepare("SELECT store_value FROM kv_store WHERE store_key = '__bakim_tarihi'");
        $st->execute();
        $son = $st->fetchColumn();
        if ($son === $bugun) return;   // bugün zaten yapıldı

        // 1) Eski denetim kayıtlarının AĞIR alanını boşalt (kayıt izi kalır)
        $esik = date('c', time() - AUDIT_TUTMA_GUN * 86400);
        $pdo->prepare("UPDATE audit_log SET onceki_deger = NULL
                       WHERE onceki_deger IS NOT NULL AND ts < :e")->execute([':e' => $esik]);

        // 2) Satır tavanını aş: en eskileri tamamen sil
        $sayi = (int)$pdo->query('SELECT COUNT(*) FROM audit_log')->fetchColumn();
        if ($sayi > AUDIT_MAX_SATIR) {
            $pdo->prepare('DELETE FROM audit_log WHERE id IN (
                             SELECT id FROM audit_log ORDER BY id ASC LIMIT :n)')
                ->execute([':n' => $sayi - AUDIT_MAX_SATIR]);
        }

        // 3) Sayfa ziyaretleri: yaş + tavan
        $zEsik = date('c', time() - ZIYARET_TUTMA_GUN * 86400);
        $pdo->prepare('DELETE FROM sayfa_ziyaretleri WHERE ts < :e')->execute([':e' => $zEsik]);
        $zSayi = (int)$pdo->query('SELECT COUNT(*) FROM sayfa_ziyaretleri')->fetchColumn();
        if ($zSayi > ZIYARET_MAX_SATIR) {
            $pdo->prepare('DELETE FROM sayfa_ziyaretleri WHERE id IN (
                             SELECT id FROM sayfa_ziyaretleri ORDER BY id ASC LIMIT :n)')
                ->execute([':n' => $zSayi - ZIYARET_MAX_SATIR]);
        }

        // 4) Süresi geçmiş oturumlar ve eski giriş denemeleri
        $pdo->prepare('DELETE FROM sessions WHERE expires_at < :n')->execute([':n' => time()]);
        $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < :s')
            ->execute([':s' => time() - DENEME_PENCERE_SANIYE]);

        // 5) İşareti yaz, sonra boşalan yeri diske geri ver
        $pdo->prepare("INSERT INTO kv_store (store_key, store_value, updated_at, surum)
                       VALUES ('__bakim_tarihi', :v, :t, 0)
                       ON CONFLICT(store_key) DO UPDATE SET store_value = :v, updated_at = :t")
            ->execute([':v' => $bugun, ':t' => date('c')]);

        // VACUUM işlem (transaction) içinde çalışmaz; sessizce denenir.
        try { $pdo->exec('VACUUM'); } catch (Exception $e) {}
        try { $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (Exception $e) {}
    } catch (Exception $e) {
        error_log('UretimOS bakım hatası: ' . $e->getMessage());  // isteği engellemez
    }
}

// ── DENETİM KAYDI ──────────────────────────────────────────────────────────
// İstemci IP'si (varsa proxy başlıklarını dikkate alır)
function istemciIp() {
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $h) {
        if (!empty($_SERVER[$h])) {
            $ip = explode(',', $_SERVER[$h])[0];
            return substr(trim($ip), 0, 45);
        }
    }
    return 'bilinmiyor';
}
function tarayiciOzeti() {
    return substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 180);
}

// Montaj şeması AI görme uçları — anthropicApiCagir() ve
// montajSemasiYanitAyristir() ayrı bir dosyadadır ki bu ikinci (saf) fonksiyon
// bir HTTP sunucusu başlatmadan, sabit (fixture) yanıtlarla doğrudan test
// edilebilsin (bkz. montaj_semasi_ai.php başındaki açıklama ve
// testler/06_montaj_semasi_test.php).
require_once __DIR__ . '/montaj_semasi_ai.php';
require_once __DIR__ . '/baidu_ocr_ai.php';
require_once __DIR__ . '/google_ocr_ai.php';
require_once __DIR__ . '/piyasa_fiyat_ai.php';

function auditYaz($pdo, $kullanici, $islem, $anahtar, $ek = []) {
    try {
        $stmt = $pdo->prepare('INSERT INTO audit_log (ts, kullanici, islem, anahtar, ip, rol, sayfa, tarayici, onceki_deger, kayit_sayisi)
            VALUES (:t,:k,:i,:a,:ip,:rol,:sayfa,:ua,:onceki,:sayi)');
        $stmt->execute([
            ':t' => date('c'), ':k' => $kullanici, ':i' => $islem, ':a' => $anahtar,
            ':ip' => istemciIp(), ':rol' => $ek['rol'] ?? null, ':sayfa' => $ek['sayfa'] ?? null,
            ':ua' => tarayiciOzeti(),
            // GERİ ALMA: değişiklikten ÖNCEKİ değer saklanır.
            // SINIR 1,5 MB → 256 KB'a DÜŞÜRÜLDÜ. Gerekçe: günde ~2.000 yazmada
            // 1,5 MB'lık tavan günlük ~3 GB denetim verisi üretebiliyordu; bu
            // tek başına 1 GB'lık sunucunun diskini ve yedeklerini bitirir.
            // 256 KB, tipik bir koleksiyonun küçük/orta halini kapsar; daha
            // büyük koleksiyonlarda geri alma çalışmaz ama 'kim/ne zaman/ne'
            // izi korunur. Büyük koleksiyonlar zaten patch ucuyla yazılmalı.
            ':onceki' => (isset($ek['onceki']) && strlen($ek['onceki']) <= AUDIT_ONCEKI_MAX_BAYT) ? $ek['onceki'] : null,
            ':sayi' => $ek['kayitSayisi'] ?? null
        ]);
    } catch (Exception $e) { /* audit hatası isteği engellemez */ }
}

// ── OTURUM DOĞRULAMA ───────────────────────────────────────────────────────
function bearerToken() {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/Bearer\s+(\S+)/', $hdr, $m)) return $m[1];
    return '';
}

function oturumGetir($pdo) {
    $token = bearerToken();
    if ($token === '') return null;
    $stmt = $pdo->prepare('SELECT * FROM sessions WHERE token = :t');
    $stmt->execute([':t' => $token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    if ((int)$row['expires_at'] < time()) {
        $pdo->prepare('DELETE FROM sessions WHERE token = :t')->execute([':t' => $token]);
        return null;
    }
    return $row;
}

function oturumZorunlu($pdo) {
    $oturum = oturumGetir($pdo);
    if (!$oturum) respond(['error' => 'Oturum geçersiz veya süresi dolmuş', 'authRequired' => true], 401);
    return $oturum;
}

// ── KULLANICI YARDIMCILARI ─────────────────────────────────────────────────
function kullanicilariOku($pdo) {
    $stmt = $pdo->prepare('SELECT store_value FROM kv_store WHERE store_key = :k');
    $stmt->execute([':k' => 'kullaniciler']);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return [];
    $arr = json_decode($row['store_value'], true);
    return is_array($arr) ? $arr : [];
}

function kullanicilariYaz($pdo, $liste) {
    $now = date('c');
    $json = json_encode($liste, JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare('INSERT INTO kv_store (store_key, store_value, updated_at) VALUES (:k,:v,:t)
        ON CONFLICT(store_key) DO UPDATE SET store_value = :v2, updated_at = :t2');
    $stmt->execute([':k' => 'kullaniciler', ':v' => $json, ':t' => $now, ':v2' => $json, ':t2' => $now]);
}

function sifreDogrula($girilen, $sakli) {
    // bcrypt hash'i mi? ($2y$ ile başlar) — değilse eski düz metin karşılaştır
    if (strpos($sakli, '$2y$') === 0 || strpos($sakli, '$argon2') === 0) {
        return password_verify($girilen, $sakli);
    }
    return hash_equals($sakli, $girilen); // zamanlama saldırısına dayanıklı karşılaştırma
}

// ── ŞİFRE GÜÇ KURALI VE GÜÇLÜ RASTGELE ÜRETİM ──────────────────────────────
// En az 10 karakter + büyük/küçük harf + rakam. [kullanıcıadı]1234 gibi
// eski zayıf varsayılanların yerini alır (bkz. resetPasswords/changePassword).
function sifreGucluMu($sifre) {
    $uzunluk = function_exists('mb_strlen') ? mb_strlen($sifre) : strlen($sifre);
    if ($uzunluk < 10) return false;
    if (!preg_match('/[a-z]/', $sifre)) return false;
    if (!preg_match('/[A-Z]/', $sifre)) return false;
    if (!preg_match('/[0-9]/', $sifre)) return false;
    return true;
}
// Kriptografik olarak güvenli (random_int) 12 haneli şifre üretir; karışan
// karakterler (I/l/O/0/1) havuzdan çıkarılmıştır.
function guvenliRastgeleSifreUret() {
    $buyuk = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    $kucuk = 'abcdefghijkmnpqrstuvwxyz';
    $rakam = '23456789';
    $ozel = '!@#$%&*';
    $havuz = $buyuk . $kucuk . $rakam . $ozel;
    $sifre = [
        $buyuk[random_int(0, strlen($buyuk) - 1)],
        $kucuk[random_int(0, strlen($kucuk) - 1)],
        $rakam[random_int(0, strlen($rakam) - 1)],
        $ozel[random_int(0, strlen($ozel) - 1)],
    ];
    for ($i = 0; $i < 8; $i++) $sifre[] = $havuz[random_int(0, strlen($havuz) - 1)];
    for ($i = count($sifre) - 1; $i > 0; $i--) {
        $j = random_int(0, $i);
        $gecici = $sifre[$i]; $sifre[$i] = $sifre[$j]; $sifre[$j] = $gecici;
    }
    return implode('', $sifre);
}

// ── E-POSTA GÖNDERİMİ (PHP mail() — ek servis/API anahtarı gerektirmez) ────
// En iyi çaba: başarısızlık (mail() kapalı, spam filtresi vb.) isteği ASLA
// engellemez, sessizce yutulur.
function epostaGonder($aliciEposta, $konu, $govde) {
    if (!$aliciEposta || !function_exists('mail')) return false;
    $host = preg_replace('/[^a-zA-Z0-9.\-]/', '', $_SERVER['HTTP_HOST'] ?? 'uretimos.com.tr');
    $basliklar = "Content-Type: text/plain; charset=UTF-8\r\nFrom: ÜretimOS <no-reply@$host>\r\n";
    try { return @mail($aliciEposta, '=?UTF-8?B?' . base64_encode($konu) . '?=', $govde, $basliklar); }
    catch (Exception $e) { return false; }
}

// Talep edilebilir birim/rol listesi — app.js'teki ROLLER menü listesiyle
// AYNI (bkz. app.js başındaki $ROLLER dizisi), 'admin' hariç: o gerçek bir
// hesap rolü değil, yalnızca yönetim'in "tümünü gör" arayüz görünümüdür.
// NOT: 'yonetim' (tam admin / YONETIM_HER_SEYE_ERISIR bypass rolü) BİLEREK
// bu listede DEĞİL — oturumsuz bir ziyaretçinin self-servis formdan doğrudan
// tam yetkili hesap talep edebilmesi ciddi bir yetki yükseltme riskidir.
// Üst yönetim hesabı yalnızca mevcut bir yönetim kullanıcısı tarafından
// (Kullanıcı Yönetimi ekranından elle) açılmalıdır.
const TALEP_EDILEBILIR_ROLLER = [
    'arge', 'teknik_ofis', 'satinalma', 'uretim_planlama', 'depo',
    'cari', 'teklif_siparis', 'satis', 'sevkiyat', 'muhasebe', 'kalite',
    'uretim', 'isg', 'ik', 'bakim', 'pazarlama'
];

function kullaniciAdiTabanUret($email) {
    $parcalar = explode('@', $email);
    $yerel = strtolower($parcalar[0] ?? '');
    $yerel = preg_replace('/[^a-z0-9]/', '', $yerel);
    return $yerel !== '' ? $yerel : 'kullanici';
}

// ── HAT OPERATÖR TERMİNALİ YARDIMCILARI ────────────────────────────────────
// Operatörler ÜretimOS kullanıcı hesabıyla DEĞİL, ana giriş ekranının
// altındaki terminal tuşuyla girer. Bu girişe 'hat_operator' rolünde KISITLI
// bir token verilir: yalnızca terminalin ihtiyaç duyduğu koleksiyonları
// okuyabilir/yazabilir (aşağıdaki beyaz listeler).
function kvOku($pdo, $key, $fallback = []) {
    $stmt = $pdo->prepare('SELECT store_value FROM kv_store WHERE store_key = :k');
    $stmt->execute([':k' => $key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return $fallback;
    $arr = json_decode($row['store_value'], true);
    return is_array($arr) ? $arr : $fallback;
}
function kvYaz($pdo, $key, $deger) {
    $now = date('c');
    $json = json_encode($deger, JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare('INSERT INTO kv_store (store_key, store_value, updated_at) VALUES (:k,:v,:t)
        ON CONFLICT(store_key) DO UPDATE SET store_value = :v2, updated_at = :t2');
    $stmt->execute([':k' => $key, ':v' => $json, ':t' => $now, ':v2' => $json, ':t2' => $now]);
}

// ── OPERATÖR ŞİFRESİ: HASH DOĞRULAMA VE OTOMATİK GÖÇ ──────────────────────
// Operatör ve hat ortak şifreleri eskiden veritabanında DÜZ METİN duruyordu;
// veritabanı dosyası sızarsa tüm saha şifreleri açığa çıkardı. Artık bcrypt
// hash'i (`sifreHash`) saklanır. Eski kayıtlarda düz metin `sifre` alanı
// bulunabilir — o durumda doğrulama düz metinle yapılır ve BAŞARILI girişte
// kayıt sessizce hash'e taşınır (kimse şifresini değiştirmek zorunda kalmaz).
function opSifreDogru(&$kayit, $girilen) {
    $hash = (string)($kayit['sifreHash'] ?? '');
    if ($hash !== '') return password_verify($girilen, $hash);
    $duz = (string)($kayit['sifre'] ?? '');
    if ($duz === '') return false;
    if (!hash_equals($duz, $girilen)) return false;
    // Göç: düz metni hash'e çevir, düz metni sil
    $kayit['sifreHash'] = password_hash($girilen, PASSWORD_DEFAULT);
    unset($kayit['sifre']);
    $kayit['sifreGocTarihi'] = date('c');
    return true;
}

function opIsimAnahtari($isim) {
    $s = trim(preg_replace('/\s+/u', ' ', (string)$isim));
    if (function_exists('mb_strtolower')) return mb_strtolower($s, 'UTF-8');
    // mbstring kurulu değilse: Türkçe büyük harfler elle küçültülür
    $s = strtr($s, ['İ' => 'i', 'I' => 'ı', 'Ç' => 'ç', 'Ğ' => 'ğ', 'Ö' => 'ö', 'Ş' => 'ş', 'Ü' => 'ü']);
    return strtolower($s);
}
// hat_operator rolünün OKUYABİLDİĞİ anahtarlar (terminal + iş kartı senkronu)
const HAT_OP_OKUNABILIR = ['rotalar', 'istasyonIsleri', 'isemirleri', 'siparisler',
    'yarimamuller', 'altMontajlar', 'paketler', 'receteler', 'urunler',
    'makinaTechizat', 'gerceklesenSureKayitlari', 'hatlar',
    'kontrolPlanlari', 'olcumKayitlari',
    'hammaddeler', 'receteTalepleri', 'hatDurumlari'];   // hatDurumlari: bekletilen hatta ilerleme kilidi   // hammaddeler: malzeme onayı/seçimi · receteTalepleri: kendi taleplerini görsün
// hat_operator rolünün YAZABİLDİĞİ anahtarlar (onaylar + gerçekleşen süre)
const HAT_OP_YAZILABILIR = ['istasyonIsleri', 'gerceklesenSureKayitlari', 'olcumKayitlari',
    'receteTalepleri'];   // operatör malzeme onayı / eksik malzeme / kart açma talebi gönderir

// ── ROL BAZLI ERİŞİM DENETİMİ ──────────────────────────────────────────────
// GÜVENLİK DÜZELTMESİ (v39): Önceden get/set/patch/delete uçları yalnızca
// GEÇERLİ OTURUM istiyordu; rol kontrolü yoktu. Sonuç: en düşük yetkili
// hesap (örn. 'depo') maaş, cari, muhasebe, kullanıcı gibi HER koleksiyonu
// okuyabiliyor VE üzerine yazabiliyordu (yatay yetki yükseltme / IDOR).
//
// Model iki katmanlıdır:
//   1) HASSAS_KOLEKSIYONLAR: yalnızca listelenen roller erişebilir. Burada
//      OLMAYAN her koleksiyon, giriş yapmış tüm personele açıktır (üretim
//      verisi gibi paylaşılan operasyonel kayıtlar — mevcut akışlar bozulmaz).
//   2) yonetim rolü her şeye erişir (üst yönetim + sistem yöneticisi).
//
// Not: Yazma (set/patch/delete) için okuma yetkisi YETMEZ; hassas
// koleksiyonlarda yazma ayrıca daha dar tutulur (aşağıdaki YAZMA haritası).
const YONETIM_HER_SEYE_ERISIR = 'yonetim';

// Hassas koleksiyon => bu koleksiyonu OKUYABİLEN roller
$HASSAS_OKUMA = [
    // İnsan kaynakları / bordro
    'maaslar'            => ['ik', 'muhasebe'],
    'bordrolar'          => ['ik', 'muhasebe'],
    'personeller'        => ['ik', 'muhasebe'],
    'personelGiderleri'  => ['ik', 'muhasebe'],
    'avanslar'           => ['ik', 'muhasebe'],
    'izinKayitlari'      => ['ik'],
    // Muhasebe / finans
    'muhasebeKayitlari'  => ['muhasebe'],
    'faturalar'          => ['muhasebe', 'cari', 'teklif_siparis', 'satis'],
    'eFaturalar'         => ['muhasebe', 'cari'],
    'tahsilatlar'        => ['muhasebe', 'cari'],
    'tahsilatBeklenenler'=> ['muhasebe', 'cari'],
    'firmaCekleri'       => ['muhasebe', 'cari'],
    'musteriCekleri'     => ['muhasebe', 'cari'],
    'tedarikciOdemeleri' => ['muhasebe', 'satinalma'],
    'vadeFarkiKayitlari' => ['muhasebe', 'cari'],
    'ciroHedefleri'      => ['muhasebe', 'satis'],
    'bankaKredileri'     => ['muhasebe', 'yonetim'],
    // Cari / müşteri-tedarikçi ticari veri
    'musteriler'         => ['cari', 'teklif_siparis', 'satis', 'muhasebe', 'sevkiyat'],
    'tedarikciler'       => ['satinalma', 'cari', 'muhasebe'],
    'teklifKarsilastirma'=> ['satinalma'],
    // Kullanıcı hesapları — hiçbir düz personel görmemeli
    'kullaniciler'       => [],   // yalnızca yonetim (aşağıdaki kural gereği)
    'hesapTalepleri'     => [],   // yalnızca yonetim — ad/e-posta/şifre hash'i taşır
    // Hat/terminal kimlik bilgileri — düz personel okuyamamalı. Doğrulama
    // artık hatSifresiDogrula ucundan SUNUCUDA yapılıyor (bkz. yukarı),
    // bu yüzden hiçbir ekranın bu koleksiyonu ham okumasına gerek kalmadı.
    'hatSifreleri'       => ['admin', 'yonetim', 'uretim_planlama'],
    'hatOperatorleri'    => ['admin', 'yonetim', 'uretim_planlama'],
    'hatSifreTalepleri'  => ['admin', 'yonetim', 'uretim_planlama'],
];

// Hassas koleksiyon => bu koleksiyona YAZABİLEN roller (okumadan daha dar)
$HASSAS_YAZMA = [
    'maaslar'            => ['ik'],
    'bordrolar'          => ['ik'],
    'personeller'        => ['ik'],
    'personelGiderleri'  => ['ik', 'muhasebe'],
    'avanslar'           => ['ik', 'muhasebe'],
    'izinKayitlari'      => ['ik'],
    'muhasebeKayitlari'  => ['muhasebe'],
    'faturalar'          => ['muhasebe'],
    'eFaturalar'         => ['muhasebe'],
    'tahsilatlar'        => ['muhasebe'],
    'tahsilatBeklenenler'=> ['muhasebe', 'cari'],
    'firmaCekleri'       => ['muhasebe'],
    'musteriCekleri'     => ['muhasebe', 'cari'],
    'tedarikciOdemeleri' => ['muhasebe', 'satinalma'],
    'vadeFarkiKayitlari' => ['muhasebe'],
    'ciroHedefleri'      => ['muhasebe'],
    'bankaKredileri'     => ['muhasebe', 'yonetim'],
    'musteriler'         => ['cari', 'teklif_siparis', 'satis'],
    'tedarikciler'       => ['satinalma', 'cari'],
    'teklifKarsilastirma'=> ['satinalma'],
    'kullaniciler'       => [],   // yalnızca özel şifre uçlarından (get/set ile hiç yazılamaz)
    'hesapTalepleri'     => [],   // yalnızca özel hesapTalep uçlarından
    'hatSifreleri'       => ['admin', 'yonetim', 'uretim_planlama'],
    'hatOperatorleri'    => ['admin', 'yonetim', 'uretim_planlama'],
    'hatSifreTalepleri'  => ['admin', 'yonetim', 'uretim_planlama'],
];

// Bir oturumun $key koleksiyonuna erişimini denetler. Yetki yoksa 403 döner
// ve isteği SONLANDIRIR. $mod: 'oku' | 'yaz'
function koleksiyonYetkiKontrol($oturum, $key, $mod) {
    global $HASSAS_OKUMA, $HASSAS_YAZMA;
    $rol = $oturum['rol'] ?? '';

    // Üst yönetim her şeye erişir
    if ($rol === YONETIM_HER_SEYE_ERISIR) return;

    // hat_operator kendi beyaz listesiyle zaten ayrıca sınırlanıyor (çağıran
    // uçta kontrol edilir); burada hassas koleksiyon kuralını uygularız.
    $harita = $mod === 'yaz' ? $HASSAS_YAZMA : $HASSAS_OKUMA;

    // Koleksiyon hassas değilse: giriş yapmış tüm personele açık (operasyonel
    // paylaşılan veri — üretim, reçete, stok, sipariş akışları bozulmaz).
    if (!array_key_exists($key, $harita)) return;

    $izinliRoller = $harita[$key];
    if (!in_array($rol, $izinliRoller, true)) {
        respond(['error' => 'Bu veriye erişim yetkiniz yok (' . $key . ')', 'yetkisiz' => true], 403);
    }
}


// ── TEKNİK DOSYA YARDIMCILARI (QR ile erişilen dosya alanı) ────────────────
// Kayıt defteri kv_store'daki 'teknikDosyalar' anahtarında tutulur:
//   { "urun:U-123": { anahtar, tip, refId, kod, ad, dosyalar:[{id,ad,uzanti,
//     boyut,diskAdi,tarih,yukleyen}] }, ... }
// 'anahtar' 16 karakterlik rastgele bir yetenek anahtarıdır: QR'daki bağlantıyı
// bilen HERKES dosyaları görebilir/indirebilir (telefonla okutma senaryosu),
// ama anahtar tahmin edilemediği için dışarıdan taranamaz.
function dosyaDizinHazirla() {
    if (!is_dir(TEKNIK_DOSYA_DIZIN)) mkdir(TEKNIK_DOSYA_DIZIN, 0755, true);
    // Dosyalara doğrudan URL ile erişim KAPALI — indirme yalnızca api.php'den
    $ht = TEKNIK_DOSYA_DIZIN . '/.htaccess';
    if (!file_exists($ht)) file_put_contents($ht, "Require all denied\n");
    $ix = TEKNIK_DOSYA_DIZIN . '/index.html';
    if (!file_exists($ix)) file_put_contents($ix, '');
}
function teknikKayitlar($pdo) { return kvOku($pdo, 'teknikDosyalar', []); }
function teknikKayitYaz($pdo, $kayitlar) { kvYaz($pdo, 'teknikDosyalar', $kayitlar); }
function refAnahtari($tip, $refId) { return $tip . ':' . $refId; }
function boyutYazi($b) {
    if ($b >= 1048576) return number_format($b / 1048576, 1, ',', '.') . ' MB';
    if ($b >= 1024) return number_format($b / 1024, 0, ',', '.') . ' KB';
    return $b . ' B';
}

try {
    $action = $_GET['action'] ?? '';
    $pdo = db();
    // ÖNEMLİ SIRA: bakım YEDEKTEN ÖNCE çalışır. Böylece günlük yedek, budanmış
    // (küçük) veritabanının kopyası olur — 30 yedeğin toplam boyutu düşer.
    gunlukBakim($pdo);
    gunlukYedekAl();

    // ══ GİRİŞ ══════════════════════════════════════════════════════════════
    if ($action === 'login') {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'bilinmiyor';
        // Kaba kuvvet koruması: pencere içindeki başarısız denemeleri say
        $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < :s')
            ->execute([':s' => time() - DENEME_PENCERE_SANIYE]);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = :ip');
        $stmt->execute([':ip' => $ip]);
        if ((int)$stmt->fetchColumn() >= MAX_GIRIS_DENEME) {
            respond(['error' => 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.'], 429);
        }

        $body = readJsonBody();
        $kadi = strtolower(trim($body['kullaniciAdi'] ?? ''));
        $sifre = $body['sifre'] ?? '';
        if ($kadi === '' || $sifre === '') respond(['error' => 'Kullanıcı adı ve şifre zorunlu'], 400);

        $kullanicilar = kullanicilariOku($pdo);
        // İLK KURULUM BOOTSTRAP: hiç kullanıcı yoksa varsayılan 13 hesabı
        // (şifreleri bcrypt HASH'li olarak) burada oluştur. Böylece taze
        // sunucuda ilk giriş "yonetim / yonetim1234" ile yapılabilir.
        if (count($kullanicilar) === 0) {
            $varsayilanlar = [
                ['id'=>'USR-yonetim','kullaniciAdi'=>'yonetim','rol'=>'yonetim','ad'=>'Üst Yönetim'],
                ['id'=>'USR-arge','kullaniciAdi'=>'arge','rol'=>'arge','ad'=>'ARGE'],
                ['id'=>'USR-teknik','kullaniciAdi'=>'teknik','rol'=>'teknik_ofis','ad'=>'Teknik Ofis'],
                ['id'=>'USR-satinalma','kullaniciAdi'=>'satinalma','rol'=>'satinalma','ad'=>'Satınalma'],
                ['id'=>'USR-uretim','kullaniciAdi'=>'uretim','rol'=>'uretim_planlama','ad'=>'Üretim Planlama'],
                ['id'=>'USR-depo','kullaniciAdi'=>'depo','rol'=>'depo','ad'=>'Depo'],
                ['id'=>'USR-cari','kullaniciAdi'=>'cari','rol'=>'cari','ad'=>'Cari İşlemler'],
                ['id'=>'USR-teklif','kullaniciAdi'=>'teklif','rol'=>'teklif_siparis','ad'=>'Teklif & Sipariş'],
                ['id'=>'USR-satis','kullaniciAdi'=>'satis','rol'=>'satis','ad'=>'Satış ve Siparişler'],
                ['id'=>'USR-sevkiyat','kullaniciAdi'=>'sevkiyat','rol'=>'sevkiyat','ad'=>'Sevkiyat'],
                ['id'=>'USR-muhasebe','kullaniciAdi'=>'muhasebe','rol'=>'muhasebe','ad'=>'Muhasebe'],
                ['id'=>'USR-kalite','kullaniciAdi'=>'kalite','rol'=>'kalite','ad'=>'Kalite Kontrol'],
                ['id'=>'USR-uretim','kullaniciAdi'=>'uretimsaha','rol'=>'uretim','ad'=>'Üretim Saha Sorumlusu'],
                ['id'=>'USR-isg','kullaniciAdi'=>'isg','rol'=>'isg','ad'=>'İSG Sorumlusu'],
                ['id'=>'USR-ik','kullaniciAdi'=>'ik','rol'=>'ik','ad'=>'İnsan Kaynakları'],
                ['id'=>'USR-bakim','kullaniciAdi'=>'bakim','rol'=>'bakim','ad'=>'Bakım'],
            ];
            foreach ($varsayilanlar as &$vk) {
                $vk['sifreHash'] = password_hash($vk['kullaniciAdi'] . '1234', PASSWORD_DEFAULT);
            }
            unset($vk);
            $kullanicilar = $varsayilanlar;
            kullanicilariYaz($pdo, $kullanicilar);
            auditYaz($pdo, 'sistem', 'ilk_kurulum_kullanicilar', 'kullaniciler');
        } else {
            // MEVCUT KURULUM: sonradan eklenen varsayılan hesaplar (örn. 'satis')
            // eksikse tamamla — mevcut kullanıcılar/şifreler değişmez.
            $yeniVarsayilanlar = [
                ['id'=>'USR-satis','kullaniciAdi'=>'satis','rol'=>'satis','ad'=>'Satış ve Siparişler'],
            ];
            $eklendi = false;
            foreach ($yeniVarsayilanlar as $yv) {
                $varMi = false;
                foreach ($kullanicilar as $k) {
                    if (($k['id'] ?? '') === $yv['id'] || strtolower($k['kullaniciAdi'] ?? '') === $yv['kullaniciAdi']) { $varMi = true; break; }
                }
                if (!$varMi) {
                    $yv['sifreHash'] = password_hash($yv['kullaniciAdi'] . '1234', PASSWORD_DEFAULT);
                    $kullanicilar[] = $yv;
                    $eklendi = true;
                }
            }
            if ($eklendi) {
                kullanicilariYaz($pdo, $kullanicilar);
                auditYaz($pdo, 'sistem', 'eksik_kullanici_tamamlandi', 'kullaniciler');
            }
        }
        $bulunan = null; $bulunanIdx = -1;
        foreach ($kullanicilar as $i => $k) {
            if (strtolower($k['kullaniciAdi'] ?? '') === $kadi) { $bulunan = $k; $bulunanIdx = $i; break; }
        }

        if (!$bulunan || !sifreDogrula($sifre, $bulunan['sifreHash'] ?? '')) {
            $pdo->prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (:ip,:t)')
                ->execute([':ip' => $ip, ':t' => time()]);
            auditYaz($pdo, $kadi ?: 'bilinmiyor', 'giris_basarisiz', 'login');
            respond(['error' => 'Kullanıcı adı veya şifre hatalı'], 401);
        }

        // Düz metin şifreyi bcrypt'e ŞEFFAF YÜKSELTME (ilk başarılı girişte)
        if (strpos($bulunan['sifreHash'], '$2y$') !== 0 && strpos($bulunan['sifreHash'], '$argon2') !== 0) {
            $kullanicilar[$bulunanIdx]['sifreHash'] = password_hash($sifre, PASSWORD_DEFAULT);
            kullanicilariYaz($pdo, $kullanicilar);
        }

        // Token üret ve oturum aç
        $token = bin2hex(random_bytes(32));
        $pdo->prepare('INSERT INTO sessions (token, user_id, kullanici_adi, rol, expires_at) VALUES (:t,:u,:ka,:r,:e)')
            ->execute([
                ':t' => $token, ':u' => $bulunan['id'] ?? $kadi, ':ka' => $bulunan['kullaniciAdi'],
                ':r' => $bulunan['rol'] ?? '', ':e' => time() + TOKEN_OMUR_SANIYE
            ]);
        // Süresi dolmuş oturumları temizle
        $pdo->prepare('DELETE FROM sessions WHERE expires_at < :n')->execute([':n' => time()]);
        auditYaz($pdo, $bulunan['kullaniciAdi'], 'giris', 'login', ['rol' => $bulunan['rol'] ?? null]);

        $guvenli = $bulunan; unset($guvenli['sifreHash']); // şifre hash'i istemciye GİTMEZ
        respond(['ok' => true, 'token' => $token, 'kullanici' => $guvenli]);
    }

    elseif ($action === 'logout') {
        $token = bearerToken();
        if ($token !== '') {
            $pdo->prepare('DELETE FROM sessions WHERE token = :t')->execute([':t' => $token]);
        }
        respond(['ok' => true]);
    }

    // ══ HAT OPERATÖR TERMİNALİ UÇLARI (oturumsuz erişilir, kısıtlı) ════════
    // 1) hatListesi: giriş formundaki hat/bölüm açılır menüsü için — rotaların
    //    tamamı DEĞİL, yalnızca hat ADLARI döner (veri sızıntısı yok).
    elseif ($action === 'hatListesi') {
        $rotalar = kvOku($pdo, 'rotalar');
        $hatlar = [];
        foreach ($rotalar as $r) {
            foreach (($r['steps'] ?? []) as $st) {
                $h = $st['hat'] ?? '';
                if ($h !== '' && $h !== 'TAŞIMA' && !in_array($h, $hatlar, true)) $hatlar[] = $h;
            }
        }
        // Rotalarda henüz adım yoksa: tanımlı hat/istasyon listesindeki hat
        // adları da eklenir ({hat_adi: [istasyonlar...]} yapısı — key'ler hat adı)
        $tanimliHatlar = kvOku($pdo, 'hatlar', []);
        if (is_array($tanimliHatlar)) {
            foreach (array_keys($tanimliHatlar) as $h) {
                if ($h !== '' && $h !== 'TAŞIMA' && !in_array($h, $hatlar, true)) $hatlar[] = $h;
            }
        }
        $col = class_exists('Collator') ? new Collator('tr_TR') : null;
        if ($col) { $col->sort($hatlar); } else { sort($hatlar); }
        respond(['ok' => true, 'hatlar' => $hatlar]);
    }

    // 2) hatGiris: operatörün kişi bazlı girişi. Kaba kuvvet koruması normal
    //    login ile AYNI havuzu kullanır. Başarıda 'hat_operator' rolünde
    //    KISITLI token döner (yalnızca beyaz listedeki anahtarlar).
    elseif ($action === 'hatGiris') {
        $ip = istemciIp();
        $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < :s')
            ->execute([':s' => time() - DENEME_PENCERE_SANIYE]);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = :ip');
        $stmt->execute([':ip' => $ip]);
        if ((int)$stmt->fetchColumn() >= MAX_GIRIS_DENEME) {
            respond(['error' => 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.'], 429);
        }

        $body = readJsonBody();
        $hat = trim((string)($body['hat'] ?? ''));
        $isim = trim((string)($body['isim'] ?? ''));
        $sifre = (string)($body['sifre'] ?? '');
        if ($hat === '' || $isim === '' || $sifre === '') respond(['error' => 'Hat, ad soyad ve şifre zorunlu'], 400);

        $basarisiz = function ($mesaj, $kod = 401) use ($pdo, $ip, $isim) {
            $pdo->prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (:ip,:t)')
                ->execute([':ip' => $ip, ':t' => time()]);
            auditYaz($pdo, 'operatör:' . $isim, 'hat_giris_basarisiz', 'hatGiris');
            respond(['error' => $mesaj], $kod);
        };

        $anahtar = opIsimAnahtari($isim);
        $operatorler = kvOku($pdo, 'hatOperatorleri');
        $op = null; $opIndex = -1;
        foreach ($operatorler as $i => $o) {
            if (opIsimAnahtari($o['isim'] ?? '') === $anahtar) { $op = $o; $opIndex = $i; break; }
        }

        // Ortak hat şifresi (geçiş dönemi yedeği). Hash'li kayıt varsa onunla,
        // yoksa düz metinle doğrulanır ve başarılı girişte hash'e taşınır.
        $hatSifreleri = kvOku($pdo, 'hatSifreleri');
        $hsIndex = -1;
        foreach ($hatSifreleri as $i => $hs) {
            if (($hs['hat'] ?? '') === $hat) { $hsIndex = $i; break; }
        }
        $ortakDogru = function ($girilen) use (&$hatSifreleri, $hsIndex, $pdo) {
            if ($hsIndex < 0) return hash_equals('1234', $girilen);  // tanımsız hat → varsayılan
            $kayit = $hatSifreleri[$hsIndex];
            if (($kayit['sifreHash'] ?? '') === '' && ($kayit['sifre'] ?? '') === '') {
                return hash_equals('1234', $girilen);
            }
            $sonuc = opSifreDogru($kayit, $girilen);
            if ($sonuc && isset($kayit['sifreHash'])) {
                $hatSifreleri[$hsIndex] = $kayit;      // göç olduysa geri yaz
                kvYaz($pdo, 'hatSifreleri', $hatSifreleri);
            }
            return $sonuc;
        };

        if ($op !== null) {
            if (($op['durum'] ?? 'aktif') === 'pasif') $basarisiz('Hesabınız pasife alınmış — yönetimle görüşün', 403);
            if (opSifreDogru($op, $sifre)) {
                // Düz metinden hash'e göç olduysa kaydı güncelle
                if ($opIndex >= 0 && !isset($operatorler[$opIndex]['sifreHash'])) {
                    $operatorler[$opIndex] = $op;
                    kvYaz($pdo, 'hatOperatorleri', $operatorler);
                }
                if (!in_array($hat, $op['hatlar'] ?? [], true)) {
                    $basarisiz('Bu hat için yetkiniz yok. Yetkili olduğunuz hatlar: ' . implode(', ', $op['hatlar'] ?? []), 403);
                }
            } elseif (!$ortakDogru($sifre)) {
                $basarisiz('Şifre hatalı');
            }
        } else {
            // Kayıtlı operatör değil → yalnızca ortak hat şifresi (geçiş dönemi)
            if (!$ortakDogru($sifre)) {
                $talepler = kvOku($pdo, 'hatSifreTalepleri');
                foreach ($talepler as $t) {
                    if (opIsimAnahtari($t['isim'] ?? '') === $anahtar && ($t['durum'] ?? '') === 'bekliyor') {
                        $basarisiz('Şifre talebiniz henüz yönetim onayında — onaylanınca girebilirsiniz', 403);
                    }
                }
                $basarisiz('Kayıtlı operatör bulunamadı ve şifre hatalı. Şifre oluşturma talebi açabilirsiniz.');
            }
        }

        $token = bin2hex(random_bytes(32));
        $pdo->prepare('INSERT INTO sessions (token, user_id, kullanici_adi, rol, expires_at) VALUES (:t,:u,:ka,:r,:e)')
            ->execute([
                ':t' => $token, ':u' => 'HATOP-' . substr(md5($anahtar), 0, 10),
                ':ka' => 'operatör:' . $isim, ':r' => 'hat_operator',
                ':e' => time() + TOKEN_OMUR_SANIYE
            ]);
        $pdo->prepare('DELETE FROM sessions WHERE expires_at < :n')->execute([':n' => time()]);
        auditYaz($pdo, 'operatör:' . $isim, 'hat_giris', 'hatGiris', ['rol' => 'hat_operator', 'sayfa' => $hat]);
        respond(['ok' => true, 'token' => $token, 'operator' => ['isim' => $isim, 'hat' => $hat]]);
    }

    // 2b) hatSifresiDogrula: birim/hat şifresini SUNUCU TARAFINDA doğrular —
    //     istemciye HİÇBİR ZAMAN ham hatSifreleri listesi gönderilmez. Tam
    //     operatör oturumu açmayan, yalnızca birim şifresi soran ekranlar
    //     içindir (örn. Sevkiyat Yükleme Onayı). Herhangi bir GİRİŞ YAPMIŞ
    //     personel çağırabilir (bu ekranlara rol kısıtı yok) — yalnızca
    //     true/false döner, şifreyi asla ifşa etmez. Aynı hatGiris'teki gibi
    //     düz metin şifreler ilk başarılı doğrulamada hash'e göçürülür.
    elseif ($action === 'hatSifresiDogrula') {
        oturumZorunlu($pdo);
        $body = readJsonBody();
        $hat = trim((string)($body['hat'] ?? ''));
        $sifre = (string)($body['sifre'] ?? '');
        if ($hat === '') respond(['error' => 'Hat/birim adı zorunlu'], 400);
        $hatSifreleri = kvOku($pdo, 'hatSifreleri');
        $index = -1;
        foreach ($hatSifreleri as $i => $hs) { if (($hs['hat'] ?? '') === $hat) { $index = $i; break; } }
        if ($index < 0) respond(['ok' => hash_equals('1234', $sifre)]);
        $kayit = $hatSifreleri[$index];
        if (($kayit['sifreHash'] ?? '') === '' && ($kayit['sifre'] ?? '') === '') {
            respond(['ok' => hash_equals('1234', $sifre)]);
        }
        $sonuc = opSifreDogru($kayit, $sifre);
        if ($sonuc && isset($kayit['sifreHash'])) {
            $hatSifreleri[$index] = $kayit;
            kvYaz($pdo, 'hatSifreleri', $hatSifreleri);
        }
        respond(['ok' => $sonuc]);
    }

    // 3) hatSifreTalep: şifresi olmayan operatörün yönetim onayına düşen şifre
    //    oluşturma talebi. Oturumsuzdur ama kaba kuvvet havuzuyla sınırlıdır ve
    //    yalnızca hatSifreTalepleri koleksiyonuna EKLEME yapabilir.
    elseif ($action === 'hatSifreTalep') {
        $ip = istemciIp();
        $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < :s')
            ->execute([':s' => time() - DENEME_PENCERE_SANIYE]);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = :ip');
        $stmt->execute([':ip' => $ip]);
        if ((int)$stmt->fetchColumn() >= MAX_GIRIS_DENEME) {
            respond(['error' => 'Çok fazla istek. 15 dakika sonra tekrar deneyin.'], 429);
        }
        $body = readJsonBody();
        $isim = trim((string)($body['isim'] ?? ''));
        $sifre = (string)($body['sifre'] ?? '');
        $hatlar = $body['hatlar'] ?? [];
        if ($isim === '') respond(['error' => 'Ad soyad zorunlu'], 400);
        if ((function_exists('mb_strlen') ? mb_strlen($sifre) : strlen($sifre)) < 4) respond(['error' => 'Şifre en az 4 karakter olmalı'], 400);
        if (!is_array($hatlar) || count($hatlar) === 0) respond(['error' => 'En az bir hat/bölüm seçin'], 400);
        $hatlar = array_values(array_unique(array_map('strval', $hatlar)));

        $talepler = kvOku($pdo, 'hatSifreTalepleri');
        $anahtar = opIsimAnahtari($isim);
        foreach ($talepler as $t) {
            if (opIsimAnahtari($t['isim'] ?? '') === $anahtar && ($t['durum'] ?? '') === 'bekliyor') {
                respond(['error' => 'Bu isimle bekleyen bir talebiniz zaten var — yönetim onayını bekleyin'], 409);
            }
        }
        // İstek başına deneme sayılır ki oturumsuz uç istismar edilemesin
        $pdo->prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (:ip,:t)')
            ->execute([':ip' => $ip, ':t' => time()]);
        $talepler[] = [
            'id' => 'HST-' . bin2hex(random_bytes(5)), 'isim' => $isim,
            // Talep edilen şifre DÜZ METİN saklanmaz; hash'i tutulur ve onayda
            // operatör kaydına aynen taşınır.
            'sifreHash' => password_hash($sifre, PASSWORD_DEFAULT),
            'hatlar' => $hatlar, 'durum' => 'bekliyor',
            'tarih' => date('Y-m-d'), 'zaman' => date('c'), 'ip' => $ip
        ];
        kvYaz($pdo, 'hatSifreTalepleri', $talepler);
        auditYaz($pdo, 'operatör:' . $isim, 'hat_sifre_talebi', 'hatSifreTalepleri', ['sayfa' => implode(', ', $hatlar)]);
        respond(['ok' => true]);
    }

    // ══ VERİ UÇLARI (oturum zorunlu) ═══════════════════════════════════════

    // ══ QR + TEKNİK DOSYA UÇLARI ═══════════════════════════════════════════
    // qrKayit: kart için QR anahtarını getir/oluştur (girişli personel).

    // ── sifreHashle: yönetim ekranı için şifre hash'leme ──────────────────
    // Yönetim, operatör şifresini belirlerken/sıfırlarken düz metni buraya
    // gönderir, karşılığında bcrypt hash alır ve kayda YALNIZCA hash'i yazar.
    // Böylece düz metin hiçbir yerde saklanmaz. Operatör oturumu kullanamaz.
    elseif ($action === 'sifreHashle') {
        $oturum = oturumZorunlu($pdo);
        if (($oturum['rol'] ?? '') === 'hat_operator') respond(['error' => 'İzin yok'], 403);
        $body = readJsonBody();
        $sifre = (string)($body['sifre'] ?? '');
        if ((function_exists('mb_strlen') ? mb_strlen($sifre) : strlen($sifre)) < 4) {
            respond(['error' => 'Şifre en az 4 karakter olmalı'], 400);
        }
        auditYaz($pdo, $oturum['kullanici_adi'] ?? '?', 'sifre_belirle', 'hatOperatorleri',
                 ['sayfa' => (string)($body['kimIcin'] ?? '')]);
        respond(['ok' => true, 'sifreHash' => password_hash($sifre, PASSWORD_DEFAULT)]);
    }

    elseif ($action === 'qrKayit') {
        $oturum = oturumZorunlu($pdo);
        if (($oturum['rol'] ?? '') === 'hat_operator') respond(['error' => 'İzin yok'], 403);
        $body = readJsonBody();
        $tip = trim((string)($body['tip'] ?? ''));
        $refId = trim((string)($body['refId'] ?? ''));
        if ($tip === '' || $refId === '') respond(['error' => 'tip ve refId zorunlu'], 400);
        $kayitlar = teknikKayitlar($pdo);
        $ra = refAnahtari($tip, $refId);
        if (!isset($kayitlar[$ra])) {
            $kayitlar[$ra] = [
                'anahtar' => bin2hex(random_bytes(8)), 'tip' => $tip, 'refId' => $refId,
                'kod' => (string)($body['kod'] ?? ''), 'ad' => (string)($body['ad'] ?? ''),
                'dosyalar' => []
            ];
        } else {
            // kod/ad güncel tutulur (kart yeniden adlandırılmış olabilir)
            if (!empty($body['kod'])) $kayitlar[$ra]['kod'] = (string)$body['kod'];
            if (!empty($body['ad'])) $kayitlar[$ra]['ad'] = (string)$body['ad'];
        }
        teknikKayitYaz($pdo, $kayitlar);
        respond(['ok' => true, 'anahtar' => $kayitlar[$ra]['anahtar'], 'dosyalar' => $kayitlar[$ra]['dosyalar']]);
    }

    // dosyaYukle: base64 içerikle teknik dosya ekle (girişli personel).
    elseif ($action === 'dosyaYukle') {
        $oturum = oturumZorunlu($pdo);
        if (($oturum['rol'] ?? '') === 'hat_operator') respond(['error' => 'İzin yok'], 403);
        $body = readJsonBody();
        $tip = trim((string)($body['tip'] ?? ''));
        $refId = trim((string)($body['refId'] ?? ''));
        $dosyaAdi = trim((string)($body['dosyaAdi'] ?? ''));
        $b64 = (string)($body['icerikB64'] ?? '');
        if ($tip === '' || $refId === '' || $dosyaAdi === '' || $b64 === '') respond(['error' => 'Eksik alan'], 400);
        global $TEKNIK_UZANTILAR;
        $uzanti = strtolower(pathinfo($dosyaAdi, PATHINFO_EXTENSION));
        if (!in_array($uzanti, $TEKNIK_UZANTILAR, true)) {
            respond(['error' => 'İzin verilmeyen dosya türü: .' . $uzanti . ' (izinli: ' . implode(', ', $TEKNIK_UZANTILAR) . ')'], 400);
        }
        $icerik = base64_decode($b64, true);
        if ($icerik === false) respond(['error' => 'Bozuk dosya içeriği'], 400);
        if (strlen($icerik) > TEKNIK_DOSYA_MAX_BAYT) respond(['error' => 'Dosya çok büyük (en fazla 15 MB)'], 400);

        $kayitlar = teknikKayitlar($pdo);
        $ra = refAnahtari($tip, $refId);
        if (!isset($kayitlar[$ra])) {
            $kayitlar[$ra] = [
                'anahtar' => bin2hex(random_bytes(8)), 'tip' => $tip, 'refId' => $refId,
                'kod' => (string)($body['kod'] ?? ''), 'ad' => (string)($body['ad'] ?? ''), 'dosyalar' => []
            ];
        }
        dosyaDizinHazirla();
        $dosyaId = bin2hex(random_bytes(6));
        $diskAdi = $dosyaId . '.' . $uzanti;   // rastgele ad — çakışma/yol saldırısı imkânsız
        if (file_put_contents(TEKNIK_DOSYA_DIZIN . '/' . $diskAdi, $icerik) === false) {
            respond(['error' => 'Dosya diske yazılamadı — klasör yazma iznini kontrol edin'], 500);
        }
        $kayitlar[$ra]['dosyalar'][] = [
            'id' => $dosyaId, 'ad' => $dosyaAdi, 'uzanti' => $uzanti,
            'boyut' => strlen($icerik), 'diskAdi' => $diskAdi,
            'tarih' => date('Y-m-d H:i'), 'yukleyen' => $oturum['kullanici_adi'] ?? ''
        ];
        teknikKayitYaz($pdo, $kayitlar);
        auditYaz($pdo, $oturum['kullanici_adi'] ?? '?', 'dosya_yukle', 'teknikDosyalar', ['sayfa' => $ra . ' / ' . $dosyaAdi]);
        respond(['ok' => true, 'dosyalar' => $kayitlar[$ra]['dosyalar'], 'anahtar' => $kayitlar[$ra]['anahtar']]);
    }

    // dosyaSil: teknik dosyayı kaldır (girişli personel).
    elseif ($action === 'dosyaSil') {
        $oturum = oturumZorunlu($pdo);
        if (($oturum['rol'] ?? '') === 'hat_operator') respond(['error' => 'İzin yok'], 403);
        $body = readJsonBody();
        $tip = trim((string)($body['tip'] ?? ''));
        $refId = trim((string)($body['refId'] ?? ''));
        $dosyaId = trim((string)($body['dosyaId'] ?? ''));
        $kayitlar = teknikKayitlar($pdo);
        $ra = refAnahtari($tip, $refId);
        if (!isset($kayitlar[$ra])) respond(['error' => 'Kayıt bulunamadı'], 404);
        $kalanlar = [];
        foreach ($kayitlar[$ra]['dosyalar'] as $d) {
            if ($d['id'] === $dosyaId) {
                $yol = TEKNIK_DOSYA_DIZIN . '/' . basename($d['diskAdi']);
                if (is_file($yol)) unlink($yol);
            } else $kalanlar[] = $d;
        }
        $kayitlar[$ra]['dosyalar'] = $kalanlar;
        teknikKayitYaz($pdo, $kayitlar);
        auditYaz($pdo, $oturum['kullanici_adi'] ?? '?', 'dosya_sil', 'teknikDosyalar', ['sayfa' => $ra]);
        respond(['ok' => true, 'dosyalar' => $kalanlar]);
    }

    // montajSemasiOku: montaj şeması görselini (istemci PDF'i canvas'a çizip
    // PNG'ye çevirir) Anthropic vision API'sine gönderir, yapılandırılmış
    // parça listesi döner. Sadece ARGE/Teknik Ofis/Yönetim/Admin — reçete
    // oluşturma yetkisiyle aynı çevre (bkz. step_ice_aktar rol kısıtı).
    elseif ($action === 'montajSemasiOku') {
        $oturum = oturumZorunlu($pdo);
        if (!in_array($oturum['rol'] ?? '', ['admin', 'arge', 'teknik_ofis', 'yonetim'], true)) {
            respond(['error' => 'Bu işlem yalnızca ARGE, Teknik Ofis ve Yönetim rolüne açıktır'], 403);
        }
        $body = readJsonBody();
        $gorselB64 = (string)($body['gorselB64'] ?? '');
        $mediaType = (string)($body['mediaType'] ?? 'image/png');
        $dosyaAdi = trim((string)($body['dosyaAdi'] ?? ''));
        if ($gorselB64 === '') respond(['error' => 'Görsel gönderilmedi'], 400);
        if (!in_array($mediaType, ['image/png', 'image/jpeg'], true)) respond(['error' => 'Desteklenmeyen görsel türü'], 400);
        if (strlen($gorselB64) > 15 * 1024 * 1024) respond(['error' => 'Görsel çok büyük (en fazla ~15 MB)'], 400);

        // Anahtar önce ortam değişkeninden (VPS/Apache SetEnv) okunur; paylaşımlı
        // hosting'de (GoDaddy cPanel gibi) Apache env değişkeni PHP'ye her zaman
        // ulaşmayabilir VE .htaccess her deploy'da git'ten ÜZERİNE YAZILDIĞI için
        // anahtar oraya asla yazılamaz. Bu yüzden ikinci bir yol: repoda OLMAYAN,
        // .gitignore'da olan, sadece sunucuda cPanel Dosya Yöneticisi'yle elle
        // oluşturulan `anthropic_anahtari.php` dosyası — git/FTP deploy bu dosyayı
        // hiç görmediği için (izlenmiyor) her deploy'dan sağlam çıkar.
        $apiKey = getenv('URETIMOS_ANTHROPIC_KEY');
        if (!$apiKey) {
            $yerelAnahtarDosyasi = __DIR__ . '/anthropic_anahtari.php';
            if (is_file($yerelAnahtarDosyasi)) {
                $apiKey = (string)(include $yerelAnahtarDosyasi);
            }
        }
        if (!$apiKey) {
            respond(['error' => 'AI görme servisi sunucuda yapılandırılmamış (URETIMOS_ANTHROPIC_KEY ortam değişkeni veya anthropic_anahtari.php eksik). Kurulum belgesine bakın.', 'yapilandirmaEksik' => true], 503);
        }

        $istekGovdesi = [
            'model' => 'claude-sonnet-5',
            'max_tokens' => 4096,
            'tools' => [[
                'name' => 'receteKalemleriBildir',
                'description' => 'Montaj şemasındaki NO/SIZE/QTY parça tablosunu yapılandırılmış biçimde bildirir.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'parcalar' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'properties' => [
                                    'no' => ['type' => 'string', 'description' => 'Şemadaki parça/kalem numarası'],
                                    'tahminiAd' => ['type' => 'string', 'description' => 'Parçanın görünümünden tahmin edilen adı/türü (Türkçe)'],
                                    'olcuSpec' => ['type' => 'string', 'description' => 'Ölçü/vida tipi gibi teknik özellik metni, yoksa boş bırak'],
                                    'adet' => ['type' => 'number', 'description' => 'Adet']
                                ],
                                'required' => ['no', 'tahminiAd', 'adet']
                            ]
                        ],
                        'genelNot' => ['type' => 'string', 'description' => 'Belirsiz/okunaksız kısımlar için genel not']
                    ],
                    'required' => ['parcalar']
                ]
            ]],
            'tool_choice' => ['type' => 'tool', 'name' => 'receteKalemleriBildir'],
            'messages' => [[
                'role' => 'user',
                'content' => [
                    ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mediaType, 'data' => $gorselB64]],
                    ['type' => 'text', 'text' =>
                        "Bu görsel bir mobilya/sandalye parçasının PATLATILMIŞ MONTAJ ŞEMASIDIR. " .
                        "Alt kısımdaki NO/SKETCH/SIZE/QTY tablosunu ve üstteki numaralandırılmış çizimi kullanarak " .
                        "her parça/vida/pul kalemini çıkar. SADECE görselde gerçekten gördüğünü bildir, " .
                        "asla parça kodu veya fiyat UYDURMA. Ölçü/boyut bilgisi yoksa olcuSpec alanını boş bırak."]
                ]
            ]]
        ];

        try {
            $yanit = anthropicApiCagir($apiKey, $istekGovdesi);
        } catch (Exception $e) {
            respond(['error' => $e->getMessage()], 502);
        }
        $sonuc = montajSemasiYanitAyristir($yanit);
        if (!$sonuc['ok']) respond(['error' => $sonuc['hata']], 502);

        auditYaz($pdo, $oturum['kullanici_adi'] ?? '?', 'montaj_semasi_oku', 'aiVision', ['dosya' => $dosyaAdi, 'parcaSayisi' => count($sonuc['parcalar'])]);
        respond(['ok' => true, 'parcalar' => $sonuc['parcalar'], 'genelNot' => $sonuc['genelNot']]);
    }

    // montajSemasiOkuBaidu: montajSemasiOku ile AYNI rol/görsel doğrulaması,
    // ama Anthropic yerine Baidu OCR'ı (ücretsiz kotalı bulut metin tanıma)
    // çağırır — bkz. baidu_ocr_ai.php başındaki açıklama.
    elseif ($action === 'montajSemasiOkuBaidu') {
        $oturum = oturumZorunlu($pdo);
        if (!in_array($oturum['rol'] ?? '', ['admin', 'arge', 'teknik_ofis', 'yonetim'], true)) {
            respond(['error' => 'Bu işlem yalnızca ARGE, Teknik Ofis ve Yönetim rolüne açıktır'], 403);
        }
        $body = readJsonBody();
        $gorselB64 = (string)($body['gorselB64'] ?? '');
        $mediaType = (string)($body['mediaType'] ?? 'image/png');
        $dosyaAdi = trim((string)($body['dosyaAdi'] ?? ''));
        if ($gorselB64 === '') respond(['error' => 'Görsel gönderilmedi'], 400);
        if (!in_array($mediaType, ['image/png', 'image/jpeg'], true)) respond(['error' => 'Desteklenmeyen görsel türü'], 400);
        if (strlen($gorselB64) > 15 * 1024 * 1024) respond(['error' => 'Görsel çok büyük (en fazla ~15 MB)'], 400);

        // Anahtar okuma AYNI güvenli desen: önce ortam değişkeni, sonra
        // git'in hiç görmediği (.gitignore'da) yerel baidu_anahtari.php
        // dosyası — bkz. montajSemasiOku üzerindeki uzun açıklama.
        $baiduApiKey = getenv('URETIMOS_BAIDU_API_KEY');
        $baiduSecretKey = getenv('URETIMOS_BAIDU_SECRET_KEY');
        if (!$baiduApiKey || !$baiduSecretKey) {
            $yerelAnahtarDosyasi = __DIR__ . '/baidu_anahtari.php';
            if (is_file($yerelAnahtarDosyasi)) {
                $anahtarlar = include $yerelAnahtarDosyasi;
                if (is_array($anahtarlar)) {
                    if (!$baiduApiKey) $baiduApiKey = (string)($anahtarlar['apiKey'] ?? '');
                    if (!$baiduSecretKey) $baiduSecretKey = (string)($anahtarlar['secretKey'] ?? '');
                }
            }
        }
        if (!$baiduApiKey || !$baiduSecretKey) {
            respond(['error' => 'Baidu OCR servisi sunucuda yapılandırılmamış (URETIMOS_BAIDU_API_KEY / URETIMOS_BAIDU_SECRET_KEY ortam değişkenleri veya baidu_anahtari.php eksik). Kurulum belgesine bakın.', 'yapilandirmaEksik' => true], 503);
        }

        try {
            $token = baiduTokenAl($baiduApiKey, $baiduSecretKey);
            $baiduYanit = baiduOcrCagir($token, $gorselB64);
        } catch (Exception $e) {
            respond(['error' => $e->getMessage()], 502);
        }
        $sonuc = baiduOcrYanitAyristir($baiduYanit);
        if (!$sonuc['ok']) respond(['error' => $sonuc['hata']], 502);

        auditYaz($pdo, $oturum['kullanici_adi'] ?? '?', 'montaj_semasi_oku_baidu', 'baiduOcr', ['dosya' => $dosyaAdi, 'parcaSayisi' => count($sonuc['parcalar'])]);
        respond(['ok' => true, 'parcalar' => $sonuc['parcalar'], 'genelNot' => $sonuc['genelNot']]);
    }

    // montajSemasiOkuGoogle: montajSemasiOku ile AYNI rol/görsel doğrulaması,
    // ama Anthropic/Baidu yerine Google Cloud Vision OCR'ı çağırır — bkz.
    // google_ocr_ai.php başındaki açıklama. Kimlik doğrulaması Baidu'dan
    // BASİT: tek bir API anahtarı, ayrı token adımı yok.
    elseif ($action === 'montajSemasiOkuGoogle') {
        $oturum = oturumZorunlu($pdo);
        if (!in_array($oturum['rol'] ?? '', ['admin', 'arge', 'teknik_ofis', 'yonetim'], true)) {
            respond(['error' => 'Bu işlem yalnızca ARGE, Teknik Ofis ve Yönetim rolüne açıktır'], 403);
        }
        $body = readJsonBody();
        $gorselB64 = (string)($body['gorselB64'] ?? '');
        $mediaType = (string)($body['mediaType'] ?? 'image/png');
        $dosyaAdi = trim((string)($body['dosyaAdi'] ?? ''));
        if ($gorselB64 === '') respond(['error' => 'Görsel gönderilmedi'], 400);
        if (!in_array($mediaType, ['image/png', 'image/jpeg'], true)) respond(['error' => 'Desteklenmeyen görsel türü'], 400);
        if (strlen($gorselB64) > 15 * 1024 * 1024) respond(['error' => 'Görsel çok büyük (en fazla ~15 MB)'], 400);

        // Anahtar okuma AYNI güvenli desen: önce ortam değişkeni, sonra
        // git'in hiç görmediği (.gitignore'da) yerel google_anahtari.php
        // dosyası — bkz. montajSemasiOku üzerindeki uzun açıklama.
        $googleApiKey = getenv('URETIMOS_GOOGLE_VISION_KEY');
        if (!$googleApiKey) {
            $yerelAnahtarDosyasi = __DIR__ . '/google_anahtari.php';
            if (is_file($yerelAnahtarDosyasi)) {
                $googleApiKey = (string)(include $yerelAnahtarDosyasi);
            }
        }
        if (!$googleApiKey) {
            respond(['error' => 'Google Vision servisi sunucuda yapılandırılmamış (URETIMOS_GOOGLE_VISION_KEY ortam değişkeni veya google_anahtari.php eksik). Kurulum belgesine bakın.', 'yapilandirmaEksik' => true], 503);
        }

        try {
            $googleYanit = googleVisionCagir($googleApiKey, $gorselB64);
        } catch (Exception $e) {
            respond(['error' => $e->getMessage()], 502);
        }
        $sonuc = googleOcrYanitAyristir($googleYanit);
        if (!$sonuc['ok']) respond(['error' => $sonuc['hata']], 502);

        auditYaz($pdo, $oturum['kullanici_adi'] ?? '?', 'montaj_semasi_oku_google', 'googleOcr', ['dosya' => $dosyaAdi, 'parcaSayisi' => count($sonuc['parcalar'])]);
        respond(['ok' => true, 'parcalar' => $sonuc['parcalar'], 'genelNot' => $sonuc['genelNot']]);
    }

    // hammaddeKurKarsilastir: TCMB'nin ücretsiz kur servisinden GÜNCEL
    // USD/EUR-TRY alır, döviz cinsinden fiyatlı her hammaddeyi Sistem
    // Ayarları'ndaki (muhtemelen eski) kurla karşılaştırır. Anahtar
    // gerektirmez — bkz. piyasa_fiyat_ai.php başındaki açıklama.
    elseif ($action === 'hammaddeKurKarsilastir') {
        $oturum = oturumZorunlu($pdo);
        if (!in_array($oturum['rol'] ?? '', ['admin', 'arge', 'satinalma', 'yonetim'], true)) {
            respond(['error' => 'Bu işlem yalnızca ARGE, Satınalma ve Yönetim rolüne açıktır'], 403);
        }
        try {
            $kurlar = tcmbKurCagir();
        } catch (Exception $e) {
            respond(['error' => $e->getMessage()], 502);
        }
        if (!$kurlar) respond(['error' => 'TCMB kur verisi ayrıştırılamadı (servis geçici olarak farklı bir biçim döndürmüş olabilir)'], 502);
        $hammaddeler = kvOku($pdo, 'hammaddeler');
        $ayarlar = kvOku($pdo, 'ayarlar', []);
        $anomaliler = hammaddeKurSapmalariHesapla($hammaddeler, $kurlar, $ayarlar);
        auditYaz($pdo, $oturum['kullanici_adi'], 'hammadde_kur_karsilastir', 'hammaddeler', ['kayitSayisi' => count($anomaliler)]);
        respond(['ok' => true, 'kurlar' => $kurlar, 'anomaliler' => $anomaliler]);
    }

    // hammaddePiyasaArama: her hammaddenin adıyla Google Custom Search'te
    // arama yapıp bulunan fiyatla sistemdeki fiyatı karşılaştırır. Google
    // API anahtarı + arama motoru (cx) gerektirir — bkz. piyasa_fiyat_ai.php.
    // Kota/maliyet nedeniyle TEK istekte en fazla 20 hammadde taranır.
    elseif ($action === 'hammaddePiyasaArama') {
        $oturum = oturumZorunlu($pdo);
        if (!in_array($oturum['rol'] ?? '', ['admin', 'arge', 'satinalma', 'yonetim'], true)) {
            respond(['error' => 'Bu işlem yalnızca ARGE, Satınalma ve Yönetim rolüne açıktır'], 403);
        }
        $body = readJsonBody();
        $idler = $body['hammaddeIds'] ?? [];
        if (!is_array($idler) || !count($idler)) respond(['error' => 'hammaddeIds zorunlu'], 400);
        if (count($idler) > 20) respond(['error' => 'Tek seferde en fazla 20 hammadde taranabilir (arama kotası)'], 400);

        $googleApiKey = getenv('URETIMOS_GOOGLE_SEARCH_KEY');
        $googleCx = getenv('URETIMOS_GOOGLE_SEARCH_CX');
        if (!$googleApiKey || !$googleCx) {
            $yerelAnahtarDosyasi = __DIR__ . '/google_arama_anahtari.php';
            if (is_file($yerelAnahtarDosyasi)) {
                $anahtarlar = include $yerelAnahtarDosyasi;
                if (is_array($anahtarlar)) {
                    if (!$googleApiKey) $googleApiKey = (string)($anahtarlar['apiKey'] ?? '');
                    if (!$googleCx) $googleCx = (string)($anahtarlar['cx'] ?? '');
                }
            }
        }
        if (!$googleApiKey || !$googleCx) {
            respond(['error' => 'Piyasa arama servisi sunucuda yapılandırılmamış (URETIMOS_GOOGLE_SEARCH_KEY + URETIMOS_GOOGLE_SEARCH_CX ortam değişkenleri veya google_arama_anahtari.php eksik). Kurulum belgesine bakın.', 'yapilandirmaEksik' => true], 503);
        }

        $hammaddeler = kvOku($pdo, 'hammaddeler');
        $ayarlar = kvOku($pdo, 'ayarlar', []);
        $hammaddelerById = [];
        foreach ($hammaddeler as $h) { $hammaddelerById[$h['id'] ?? ''] = $h; }

        $anomaliler = []; $taranan = 0; $hatalar = [];
        foreach ($idler as $id) {
            $h = $hammaddelerById[$id] ?? null;
            if (!$h || !($h['ad'] ?? '')) continue;
            $sorgu = trim(($h['stokKodu'] ?? '') . ' ' . $h['ad'] . ' fiyat TL');
            try {
                $aramaYaniti = googleAramaYap($googleApiKey, $googleCx, $sorgu);
                $taranan++;
            } catch (Exception $e) {
                $hatalar[] = ($h['stokKodu'] ?? $h['ad']) . ': ' . $e->getMessage();
                continue;
            }
            $bulunan = aramaSonucundanFiyatCikar($aramaYaniti);
            $anomali = hammaddePiyasaSapmasiHesapla($h, $bulunan, $ayarlar);
            if ($anomali) $anomaliler[] = $anomali;
        }
        auditYaz($pdo, $oturum['kullanici_adi'], 'hammadde_piyasa_arama', 'hammaddeler', ['kayitSayisi' => $taranan]);
        respond(['ok' => true, 'taranan' => $taranan, 'anomaliler' => $anomaliler, 'hatalar' => $hatalar]);
    }

    // qrGoruntule: HERKESE AÇIK görüntüleyici — telefon QR'ı okutunca açılan
    // mobil uyumlu sayfa. Erişim yalnızca doğru yetenek anahtarıyla (k).
    elseif ($action === 'qrGoruntule') {
        $r = (string)($_GET['r'] ?? '');
        $k = (string)($_GET['k'] ?? '');
        $kayitlar = teknikKayitlar($pdo);
        if (!isset($kayitlar[$r]) || !hash_equals((string)$kayitlar[$r]['anahtar'], $k)) {
            header('Content-Type: text/html; charset=utf-8');
            http_response_code(403);
            echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:30px;text-align:center"><h2>⚠ Geçersiz veya süresi dolmuş QR kod</h2></body>';
            exit;
        }
        $ky = $kayitlar[$r];
        $tipAdlari = ['urun' => 'Bitmiş Ürün', 'yarimamul' => 'Yarı Mamül', 'altmontaj' => 'Alt Montaj', 'paket' => 'Ürün Paketi', 'hammadde' => 'Hammadde / Hırdavat'];
        $tipAdi = $tipAdlari[$ky['tip']] ?? $ky['tip'];
        $base = 'api.php?action=dosyaIndir&r=' . urlencode($r) . '&k=' . urlencode($k) . '&f=';
        header('Content-Type: text/html; charset=utf-8');
        $h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
        echo '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $h($ky['kod']) . ' — Teknik Dosyalar</title><style>
          body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f2f4f8;color:#1a2233}
          .ust{background:#1f3a5f;color:#fff;padding:18px 16px}
          .ust .kod{font-family:ui-monospace,monospace;font-weight:800;font-size:18px}
          .ust .ad{opacity:.9;font-size:13.5px;margin-top:3px}
          .ust .tip{display:inline-block;background:rgba(255,255,255,.18);border-radius:20px;padding:2px 10px;font-size:11px;margin-top:8px}
          .icerik{padding:14px;max-width:640px;margin:0 auto}
          .dosya{background:#fff;border:1px solid #dde3ec;border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:12px}
          .ikon{font-size:26px;width:36px;text-align:center}
          .bilgi{flex:1;min-width:0}.bilgi .da{font-weight:700;font-size:13.5px;word-break:break-all}
          .bilgi .meta{color:#6b7686;font-size:11px;margin-top:2px}
          .indir{background:#2563eb;color:#fff;text-decoration:none;border-radius:9px;padding:9px 14px;font-size:12.5px;font-weight:700;white-space:nowrap}
          .onizle{max-width:100%;border-radius:10px;border:1px solid #dde3ec;margin:4px 0 12px;display:block}
          .bos{text-align:center;color:#6b7686;padding:40px 10px}
        </style></head><body>
        <div class="ust"><div class="kod">' . $h($ky['kod']) . '</div><div class="ad">' . $h($ky['ad']) . '</div><div class="tip">' . $h($tipAdi) . '</div></div><div class="icerik">';
        if (!count($ky['dosyalar'])) {
            echo '<div class="bos">Bu kart için henüz dosya yüklenmemiş.</div>';
        } else {
            $ikonlar = ['pdf' => '📄', 'xls' => '📊', 'xlsx' => '📊', 'csv' => '📊', 'dwg' => '📐', 'dxf' => '📐', 'step' => '⚙️', 'stp' => '⚙️'];
            foreach ($ky['dosyalar'] as $d) {
                $resim = in_array($d['uzanti'], ['png', 'jpg', 'jpeg', 'webp', 'gif'], true);
                $ikon = $resim ? '🖼️' : ($ikonlar[$d['uzanti']] ?? '📎');
                echo '<div class="dosya"><div class="ikon">' . $ikon . '</div><div class="bilgi"><div class="da">' . $h($d['ad']) . '</div><div class="meta">' . $h(boyutYazi($d['boyut'])) . ' · ' . $h($d['tarih']) . '</div></div><a class="indir" href="' . $h($base . $d['id']) . '" download>⬇ İndir</a></div>';
                if ($resim) echo '<img class="onizle" loading="lazy" src="' . $h($base . $d['id'] . '&goster=1') . '" alt="">';
            }
        }
        echo '</div></body></html>';
        exit;
    }

    // dosyaIndir: HERKESE AÇIK indirme — doğru yetenek anahtarı zorunlu.
    elseif ($action === 'dosyaIndir') {
        $r = (string)($_GET['r'] ?? '');
        $k = (string)($_GET['k'] ?? '');
        $f = (string)($_GET['f'] ?? '');
        $kayitlar = teknikKayitlar($pdo);
        if (!isset($kayitlar[$r]) || !hash_equals((string)$kayitlar[$r]['anahtar'], $k)) respond(['error' => 'Geçersiz anahtar'], 403);
        $dosya = null;
        foreach ($kayitlar[$r]['dosyalar'] as $d) if ($d['id'] === $f) { $dosya = $d; break; }
        if (!$dosya) respond(['error' => 'Dosya bulunamadı'], 404);
        $yol = TEKNIK_DOSYA_DIZIN . '/' . basename($dosya['diskAdi']);
        if (!is_file($yol)) respond(['error' => 'Dosya diskte yok'], 404);
        $mimeler = ['pdf' => 'application/pdf', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp', 'gif' => 'image/gif', 'xls' => 'application/vnd.ms-excel',
            'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'csv' => 'text/csv',
            'dwg' => 'application/acad', 'dxf' => 'application/dxf', 'step' => 'application/step', 'stp' => 'application/step'];
        $mime = $mimeler[$dosya['uzanti']] ?? 'application/octet-stream';
        $inline = isset($_GET['goster']) && in_array($dosya['uzanti'], ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'], true);
        // ÖNEMLİ: İkili dosya gönderirken sıkıştırma KAPATILIR. Açık kalırsa
        // gövde sıkışır ama aşağıdaki Content-Length ham boyutu bildirir;
        // tarayıcı dosyayı eksik/bozuk indirir. Ayrıca jpg/png/pdf zaten
        // sıkıştırılmıştır — tekrar sıkıştırmak yalnızca CPU harcar.
        @ini_set('zlib.output_compression', '0');
        while (ob_get_level() > 0) { ob_end_clean(); }
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($yol));
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . rawurlencode($dosya['ad']) . '"; filename*=UTF-8\'\'' . rawurlencode($dosya['ad']));
        header('Cache-Control: private, max-age=300');
        readfile($yol);
        exit;
    }

    // qrBaglanti: SALT OKUNUR bağlantı sorgusu. Üretim ekranı ve operatör
    // terminalindeki iş kartlarından "📁 Dosyalar" tuşuyla çağrılır. Kayıt
    // OLUŞTURMAZ; yalnızca var olan kaydın herkese açık görüntüleyici
    // adresini döndürür. hat_operator token'ı da kullanabilir (operatör
    // sahada teknik resme bakabilmeli), ama dosya yükleyip silemez.
    elseif ($action === 'qrBaglanti') {
        oturumZorunlu($pdo);
        $tip = trim((string)($_GET['tip'] ?? ''));
        $refId = trim((string)($_GET['refId'] ?? ''));
        $kod = trim((string)($_GET['kod'] ?? ''));
        $kayitlar = teknikKayitlar($pdo);
        $bulunan = null; $bulunanR = '';
        // 1) Önce tam eşleşme: tip:refId
        if ($tip !== '' && $refId !== '') {
            $ra = refAnahtari($tip, $refId);
            if (isset($kayitlar[$ra])) { $bulunan = $kayitlar[$ra]; $bulunanR = $ra; }
        }
        // 2) Bulunamazsa refId veya kod ile ara (parça başka tiple kayıtlı olabilir)
        if ($bulunan === null) {
            foreach ($kayitlar as $ra => $ky) {
                if (($refId !== '' && ($ky['refId'] ?? '') === $refId)
                    || ($kod !== '' && ($ky['kod'] ?? '') === $kod)) {
                    $bulunan = $ky; $bulunanR = $ra; break;
                }
            }
        }
        if ($bulunan === null) respond(['ok' => true, 'bulundu' => false, 'dosyaSayisi' => 0]);
        respond([
            'ok' => true, 'bulundu' => true, 'r' => $bulunanR,
            'anahtar' => $bulunan['anahtar'], 'kod' => $bulunan['kod'],
            'ad' => $bulunan['ad'], 'dosyaSayisi' => count($bulunan['dosyalar'] ?? [])
        ]);
    }

    // ══════════════════════════════════════════════════════════════════════
    // OPERATÖR TERMİNALİ — HAT BAZLI SÜZÜLMÜŞ VERİ
    // ──────────────────────────────────────────────────────────────────────
    // NEDEN: Terminal, tüm reçeteleri (51 MB), tüm yarı mamülleri (24 MB) ve
    // tüm iş kartlarını (19 MB) indiriyordu — toplam 95 MB. Telefonda 76 sn
    // sürüyor ve kullanılamaz hale geliyor. Oysa bir operatörün ihtiyacı:
    // KENDİ HATTININ açık işleri + o işlerin reçeteleri ≈ 3,8 MB.
    //
    // Bu uç, süzmeyi SUNUCUDA yapar; istemciye yalnızca gereken veri gider.
    // Yetki: operatörün kendi hattı dışındaki veriye erişimi yoktur.
    // ══════════════════════════════════════════════════════════════════════
    elseif ($action === 'hatVerisi') {
        $oturum = oturumZorunlu($pdo);
        $hat = $_GET['hat'] ?? '';
        if ($hat === '') respond(['error' => 'hat zorunlu'], 400);

        $oku = function ($key) use ($pdo) {
            $st = $pdo->prepare('SELECT store_value FROM kv_store WHERE store_key = :k');
            $st->execute([':k' => $key]);
            $r = $st->fetch(PDO::FETCH_ASSOC);
            if (!$r) return [];
            $v = json_decode($r['store_value'], true);
            return is_array($v) ? $v : [];
        };

        // 1) Yalnızca BU HATTIN iş kartları (biten işler son 50 ile sınırlı)
        $tumIsler = $oku('istasyonIsleri');
        $isler = [];
        $bitenler = [];
        foreach ($tumIsler as $x) {
            if (($x['hat'] ?? '') !== $hat) continue;
            $d = $x['durum'] ?? '';
            if ($d === 'tamamlandi') { $bitenler[] = $x; }
            elseif ($d !== 'iptal') { $isler[] = $x; }
        }
        usort($bitenler, function ($a, $b) {
            return strcmp($b['bitisZamani'] ?? '', $a['bitisZamani'] ?? '');
        });
        $bitenler = array_slice($bitenler, 0, 50);

        // 2) Bu işlerin ihtiyaç duyduğu yarı mamül ve reçeteler (yalnızca onlar)
        $ymIdler = [];
        foreach (array_merge($isler, $bitenler) as $x) {
            $id = $x['yarimamulId'] ?? ($x['ymId'] ?? null);
            if ($id) $ymIdler[$id] = true;
        }
        $yarimamuller = [];
        foreach ($oku('yarimamuller') as $y) {
            if (isset($ymIdler[$y['id'] ?? ''])) $yarimamuller[] = $y;
        }
        $receteler = [];
        $gerekenHm = [];
        foreach ($oku('receteler') as $r) {
            if (!isset($ymIdler[$r['yarimamulId'] ?? ''])) continue;
            $receteler[] = $r;
            foreach (($r['kalemler'] ?? []) as $k) {
                if (($k['tip'] ?? '') === 'hammadde' && !empty($k['refId'])) $gerekenHm[$k['refId']] = true;
            }
        }

        // 3) Hammaddeler: reçetelerde geçenler + operatörün arayabilmesi için
        //    hafif liste (yalnızca id/kod/ad/birim — fiyat GÖNDERİLMEZ)
        $hammaddeler = [];
        foreach ($oku('hammaddeler') as $h) {
            $hafif = [
                'id' => $h['id'] ?? '', 'stokKodu' => $h['stokKodu'] ?? '',
                'ad' => $h['ad'] ?? '', 'birim' => $h['birim'] ?? '', 'tip' => $h['tip'] ?? ''
            ];
            $hammaddeler[] = $hafif;
        }

        // 4) Bu hatta ait diğer küçük veriler
        $rotalar = $oku('rotalar');
        $makinalar = [];
        foreach ($oku('makinaTechizat') as $m) {
            if ((($m['hat'] ?? ($m['konum'] ?? '')) === $hat)) $makinalar[] = $m;
        }
        $hatDurumlari = [];
        foreach ($oku('hatDurumlari') as $d) {
            if (($d['hat'] ?? '') === $hat) $hatDurumlari[] = $d;
        }
        $receteTalepleri = [];
        foreach ($oku('receteTalepleri') as $rt) {
            if (isset($ymIdler[$rt['ymId'] ?? ''])) $receteTalepleri[] = $rt;
        }

        respond([
            'hat' => $hat,
            'istasyonIsleri' => array_values($isler),
            'bitenIsler' => array_values($bitenler),
            'yarimamuller' => array_values($yarimamuller),
            'receteler' => array_values($receteler),
            'hammaddeler' => array_values($hammaddeler),
            'rotalar' => $rotalar,
            'makinaTechizat' => array_values($makinalar),
            'hatDurumlari' => array_values($hatDurumlari),
            'receteTalepleri' => array_values($receteTalepleri)
        ]);
    }

    elseif ($action === 'get') {
        $oturum = oturumZorunlu($pdo);
        $key = $_GET['key'] ?? '';
        if ($key === '') respond(['error' => 'key zorunlu'], 400);
        // GÜVENLİK: hat_operator (terminal) token'ı yalnızca beyaz listedeki
        // koleksiyonları okuyabilir — cari/fiyat/İK gibi veriler kapalıdır.
        if (($oturum['rol'] ?? '') === 'hat_operator' && !in_array($key, HAT_OP_OKUNABILIR, true)) {
            respond(['error' => 'Operatör oturumu bu veriye erişemez'], 403);
        }
        // ROL BAZLI ERİŞİM: hassas koleksiyonları yetkisiz rollere kapat
        koleksiyonYetkiKontrol($oturum, $key, 'oku');
        $stmt = $pdo->prepare('SELECT store_value, surum FROM kv_store WHERE store_key = :k');
        $stmt->execute([':k' => $key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $value = $row ? $row['store_value'] : null;
        $surum = $row ? (int)$row['surum'] : 0;   // istemci bunu yazarken geri gönderir
        // GÜVENLİK: kullaniciler koleksiyonu istemciye şifre hash'leri OLMADAN gider
        if ($key === 'kullaniciler' && $value !== null) {
            $arr = json_decode($value, true);
            if (is_array($arr)) {
                foreach ($arr as &$u) { unset($u['sifreHash']); }
                $value = json_encode($arr, JSON_UNESCAPED_UNICODE);
            }
        }
        respond(['key' => $key, 'value' => $value, 'surum' => $surum]);
    }

    elseif ($action === 'set') {
        $oturum = oturumZorunlu($pdo);
        $body = readJsonBody();
        $key = $body['key'] ?? '';
        $value = $body['value'] ?? null;
        if ($key === '' || $value === null) respond(['error' => 'key ve value zorunlu'], 400);
        // GÜVENLİK: hat_operator token'ı yalnızca onay/süre koleksiyonlarına yazar
        if (($oturum['rol'] ?? '') === 'hat_operator' && !in_array($key, HAT_OP_YAZILABILIR, true)) {
            respond(['error' => 'Operatör oturumu bu veriye yazamaz'], 403);
        }
        // ROL BAZLI ERİŞİM: hassas koleksiyonlara yetkisiz rol YAZAMAZ
        koleksiyonYetkiKontrol($oturum, $key, 'yaz');
        // GÜVENLİK: kullaniciler koleksiyonu bu uçtan yazılamaz — şifreler
        // yalnızca changePassword/resetPasswords uçlarından değişir.
        if ($key === 'kullaniciler') {
            respond(['error' => 'Kullanıcılar yalnızca şifre yönetimi uçlarından güncellenebilir'], 403);
        }
        // ── SÜRÜM KONTROLÜ (kayıp güncelleme koruması) ────────────────────
        // İstemci okuduğu sürümü bildirirse ve o sürüm artık güncel değilse,
        // aradaki değişikliği ezmemek için yazma reddedilir. İstemci güncel
        // veriyi alıp yalnızca kendi değişikliğini 'patch' ile uygular.
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $mevcut = kvOkuSurumlu($pdo, $key);
            $onceki = $mevcut['deger'];
            $beklenen = array_key_exists('beklenenSurum', $body) ? $body['beklenenSurum'] : null;
            if ($beklenen !== null && (int)$beklenen !== $mevcut['surum']) {
                $pdo->exec('ROLLBACK');
                respond([
                    'error' => 'Bu veri siz okuduktan sonra başka bir kullanıcı tarafından değiştirildi',
                    'cakisma' => true, 'surum' => $mevcut['surum'], 'guncelDeger' => $mevcut['deger']
                ], 409);
            }
            $yeniSurum = $mevcut['surum'] + 1;
            kvYazSurumlu($pdo, $key, $value, $yeniSurum);
            $pdo->exec('COMMIT');
        } catch (Exception $e) {
            try { $pdo->exec('ROLLBACK'); } catch (Exception $e2) {}
            throw $e;
        }
        $yeniSayi = is_array(json_decode($value, true)) ? count(json_decode($value, true)) : null;
        auditYaz($pdo, $oturum['kullanici_adi'], $onceki === null ? 'ilk_yazma' : 'yazma', $key, [
            'rol' => $oturum['rol'], 'sayfa' => $body['sayfa'] ?? null,
            'onceki' => $onceki, 'kayitSayisi' => $yeniSayi
        ]);
        respond(['ok' => true, 'key' => $key]);
    }


    // ── PATCH: ATOMİK KAYIT BAZLI GÜNCELLEME ──────────────────────────────
    // Koleksiyonun tamamı gönderilmez; yalnızca eklenen/değişen/silinen
    // kayıtlar gönderilir. Birleştirme sunucuda YAZMA KİLİDİ altında yapılır,
    // bu yüzden iki kullanıcı aynı anda farklı kayıtları değiştirse bile
    // hiçbiri kaybolmaz. Aynı kaydı değiştirirlerse son yazan kazanır ama
    // diğer kayıtlar korunur.
    //
    // Gövde: { key, ekle:[...], guncelle:[...], sil:["id1","id2"] }
    elseif ($action === 'patch') {
        $oturum = oturumZorunlu($pdo);
        $body = readJsonBody();
        $key = $body['key'] ?? '';
        if ($key === '') respond(['error' => 'key zorunlu'], 400);
        if (($oturum['rol'] ?? '') === 'hat_operator' && !in_array($key, HAT_OP_YAZILABILIR, true)) {
            respond(['error' => 'Operatör oturumu bu veriye yazamaz'], 403);
        }
        // ROL BAZLI ERİŞİM: hassas koleksiyonlara yetkisiz rol YAZAMAZ
        koleksiyonYetkiKontrol($oturum, $key, 'yaz');
        if ($key === 'kullaniciler') {
            respond(['error' => 'Kullanıcılar yalnızca şifre yönetimi uçlarından güncellenebilir'], 403);
        }
        $ekle = is_array($body['ekle'] ?? null) ? $body['ekle'] : [];
        $guncelle = is_array($body['guncelle'] ?? null) ? $body['guncelle'] : [];
        $sil = is_array($body['sil'] ?? null) ? $body['sil'] : [];
        if (!count($ekle) && !count($guncelle) && !count($sil)) {
            respond(['ok' => true, 'degisiklik' => 0]);
        }

        $pdo->exec('BEGIN IMMEDIATE');   // yazma kilidini hemen al
        try {
            $mevcut = kvOkuSurumlu($pdo, $key);
            $liste = $mevcut['deger'] === null ? [] : json_decode($mevcut['deger'], true);
            if (!is_array($liste)) $liste = [];

            // id → konum haritası
            $konum = [];
            foreach ($liste as $i => $kayit) {
                if (is_array($kayit) && isset($kayit['id'])) $konum[(string)$kayit['id']] = $i;
            }

            $degisen = 0;
            foreach ($guncelle as $k) {
                if (!is_array($k) || !isset($k['id'])) continue;
                $id = (string)$k['id'];
                if (isset($konum[$id])) { $liste[$konum[$id]] = $k; }
                else { $liste[] = $k; $konum[$id] = count($liste) - 1; }   // arada silinmişse geri ekle
                $degisen++;
            }
            foreach ($ekle as $k) {
                if (!is_array($k) || !isset($k['id'])) continue;
                $id = (string)$k['id'];
                if (isset($konum[$id])) { $liste[$konum[$id]] = $k; }      // çift ekleme koruması
                else { $liste[] = $k; $konum[$id] = count($liste) - 1; }
                $degisen++;
            }
            if (count($sil)) {
                $silSet = array_flip(array_map('strval', $sil));
                $yeni = [];
                foreach ($liste as $kayit) {
                    $id = (is_array($kayit) && isset($kayit['id'])) ? (string)$kayit['id'] : null;
                    if ($id !== null && isset($silSet[$id])) { $degisen++; continue; }
                    $yeni[] = $kayit;
                }
                $liste = $yeni;
            }

            $json = json_encode(array_values($liste), JSON_UNESCAPED_UNICODE);
            $yeniSurum = $mevcut['surum'] + 1;
            kvYazSurumlu($pdo, $key, $json, $yeniSurum);
            $pdo->exec('COMMIT');
        } catch (Exception $e) {
            try { $pdo->exec('ROLLBACK'); } catch (Exception $e2) {}
            throw $e;
        }

        auditYaz($pdo, $oturum['kullanici_adi'], 'patch', $key, [
            'rol' => $oturum['rol'], 'sayfa' => $body['sayfa'] ?? null,
            'kayitSayisi' => count($liste)
        ]);
        respond(['ok' => true, 'surum' => $yeniSurum, 'kayitSayisi' => count($liste), 'degisiklik' => $degisen]);
    }

    // ══════════════════════════════════════════════════════════════════════
    // MAKİNE OLAY UCU — karanlık fabrika altyapısı
    // ──────────────────────────────────────────────────────────────────────
    // Makineler/geçit (gateway) buraya olay gönderir. TARAYICI OTURUMU YOKTUR
    // — makine bir kullanıcı değildir. Bu yüzden CİHAZ JETONU ile doğrulanır.
    //
    // GÜVENLİK: Jeton yalnızca olay YAZMAYA yeter; hiçbir veriyi okuyamaz,
    // başka koleksiyona dokunamaz. Sızsa bile zarar sahte olay kaydıyla sınırlı.
    //
    // NEDEN AYRI UÇ: Olaylar saniyede onlarca gelebilir. Normal set/patch
    // yolundan geçerse sürüm çakışması ve kilitlenme olur. Burada olaylar
    // yalnızca EKLENİR (append-only) — çakışma imkânsızdır.
    // ══════════════════════════════════════════════════════════════════════
    elseif ($action === 'makineOlay') {
        $body = readJsonBody();
        $jeton = $_SERVER['HTTP_X_CIHAZ_JETON'] ?? ($body['jeton'] ?? '');
        $makineId = trim($body['makineId'] ?? '');
        if ($jeton === '' || $makineId === '') {
            respond(['error' => 'jeton ve makineId zorunlu'], 400);
        }

        // Cihaz jetonlarını oku (makinaTechizat kaydında saklanır)
        $stmt = $pdo->prepare('SELECT store_value FROM kv_store WHERE store_key = :k');
        $stmt->execute([':k' => 'makinaTechizat']);
        $ham = $stmt->fetchColumn();
        $makineler = $ham ? json_decode($ham, true) : [];
        if (!is_array($makineler)) $makineler = [];

        $makine = null;
        foreach ($makineler as $m) {
            if (($m['id'] ?? '') === $makineId) { $makine = $m; break; }
        }
        if (!$makine) respond(['error' => 'Makine tanımlı değil: ' . $makineId], 404);

        $beklenen = (string)($makine['cihazJetonu'] ?? '');
        // hash_equals: zamanlama saldırısına karşı sabit süreli karşılaştırma
        if ($beklenen === '' || !hash_equals($beklenen, (string)$jeton)) {
            respond(['error' => 'Cihaz jetonu geçersiz'], 403);
        }

        $olaylar = is_array($body['olaylar'] ?? null) ? $body['olaylar'] : [$body];
        if (count($olaylar) > 500) respond(['error' => 'Tek istekte en fazla 500 olay'], 400);

        // Olayları append-only tabloya yaz
        $pdo->exec('CREATE TABLE IF NOT EXISTS makine_olaylari (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            makine_id TEXT NOT NULL,
            tip TEXT NOT NULL,
            veri TEXT,
            cihaz_zamani TEXT,
            sunucu_zamani TEXT NOT NULL
        )');
        $pdo->exec('CREATE INDEX IF NOT EXISTS ix_makine_olay ON makine_olaylari(makine_id, id)');

        $ins = $pdo->prepare('INSERT INTO makine_olaylari
            (makine_id, tip, veri, cihaz_zamani, sunucu_zamani)
            VALUES (:m, :t, :v, :cz, :sz)');
        $simdi = date('c');
        $yazilan = 0;
        $pdo->beginTransaction();
        try {
            foreach ($olaylar as $o) {
                $tip = trim($o['tip'] ?? '');
                if ($tip === '') continue;
                $ins->execute([
                    ':m' => $makineId, ':t' => $tip,
                    ':v' => json_encode($o, JSON_UNESCAPED_UNICODE),
                    ':cz' => $o['zaman'] ?? null, ':sz' => $simdi
                ]);
                $yazilan++;
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['error' => 'Olaylar yazılamadı'], 500);
        }
        respond(['ok' => true, 'yazilan' => $yazilan, 'sunucuZamani' => $simdi]);
    }

    // Olayları OKU — izleme ekranı bu uçtan besleniyor
    elseif ($action === 'makineOlaylari') {
        $oturum = oturumZorunlu($pdo);
        $makineId = trim($_GET['makineId'] ?? '');
        $sonId = (int)($_GET['sonId'] ?? 0);
        $limit = min(1000, max(1, (int)($_GET['limit'] ?? 200)));
        $pdo->exec('CREATE TABLE IF NOT EXISTS makine_olaylari (
            id INTEGER PRIMARY KEY AUTOINCREMENT, makine_id TEXT NOT NULL,
            tip TEXT NOT NULL, veri TEXT, cihaz_zamani TEXT, sunucu_zamani TEXT NOT NULL)');
        if ($makineId !== '') {
            $q = $pdo->prepare('SELECT * FROM makine_olaylari WHERE makine_id = :m AND id > :s
                                ORDER BY id ASC LIMIT :l');
            $q->bindValue(':m', $makineId); $q->bindValue(':s', $sonId, PDO::PARAM_INT);
            $q->bindValue(':l', $limit, PDO::PARAM_INT);
        } else {
            $q = $pdo->prepare('SELECT * FROM makine_olaylari WHERE id > :s ORDER BY id ASC LIMIT :l');
            $q->bindValue(':s', $sonId, PDO::PARAM_INT); $q->bindValue(':l', $limit, PDO::PARAM_INT);
        }
        $q->execute();
        respond(['olaylar' => $q->fetchAll(PDO::FETCH_ASSOC)]);
    }

    elseif ($action === 'setIfAbsent') {
        $oturum = oturumZorunlu($pdo);
        $body = readJsonBody();
        $key = $body['key'] ?? '';
        $value = $body['value'] ?? null;
        if ($key === '' || $value === null) respond(['error' => 'key ve value zorunlu'], 400);
        if ($key === 'kullaniciler') respond(['error' => 'İzin yok'], 403);
        if (($oturum['rol'] ?? '') === 'hat_operator' && !in_array($key, HAT_OP_YAZILABILIR, true)) {
            respond(['error' => 'Operatör oturumu bu veriye yazamaz'], 403);
        }
        // Atomik INSERT OR IGNORE — eşzamanlı ilk kurulumda sadece biri yazar
        $stmt = $pdo->prepare('INSERT OR IGNORE INTO kv_store (store_key, store_value, updated_at) VALUES (:k,:v,:t)');
        $stmt->execute([':k' => $key, ':v' => $value, ':t' => date('c')]);
        $written = $stmt->rowCount() > 0;
        if ($written) auditYaz($pdo, $oturum['kullanici_adi'], 'ilk_yazma', $key);
        respond(['written' => $written, 'key' => $key]);
    }

    elseif ($action === 'delete') {
        $oturum = oturumZorunlu($pdo);
        $body = readJsonBody();
        $key = $body['key'] ?? '';
        if ($key === '') respond(['error' => 'key zorunlu'], 400);
        if ($key === 'kullaniciler') respond(['error' => 'İzin yok'], 403);
        if (($oturum['rol'] ?? '') === 'hat_operator') respond(['error' => 'Operatör oturumu silme yapamaz'], 403);
        // ROL BAZLI ERİŞİM: hassas koleksiyonu yalnızca yazma yetkisi olan silebilir
        koleksiyonYetkiKontrol($oturum, $key, 'yaz');
        $oncekiStmt = $pdo->prepare('SELECT store_value FROM kv_store WHERE store_key = :k');
        $oncekiStmt->execute([':k' => $key]);
        $oncekiRow = $oncekiStmt->fetch(PDO::FETCH_ASSOC);
        $pdo->prepare('DELETE FROM kv_store WHERE store_key = :k')->execute([':k' => $key]);
        auditYaz($pdo, $oturum['kullanici_adi'], 'silme', $key, [
            'rol' => $oturum['rol'], 'sayfa' => $body['sayfa'] ?? null,
            'onceki' => $oncekiRow ? $oncekiRow['store_value'] : null
        ]);
        respond(['ok' => true, 'key' => $key, 'deleted' => true]);
    }

    elseif ($action === 'list') {
        oturumZorunlu($pdo);
        $prefix = $_GET['prefix'] ?? '';
        if ($prefix !== '') {
            $stmt = $pdo->prepare('SELECT store_key FROM kv_store WHERE store_key LIKE :p');
            $stmt->execute([':p' => $prefix . '%']);
        } else {
            $stmt = $pdo->query('SELECT store_key FROM kv_store');
        }
        respond(['keys' => $stmt->fetchAll(PDO::FETCH_COLUMN), 'prefix' => $prefix]);
    }

    // ══ ŞİFRE YÖNETİMİ ═════════════════════════════════════════════════════
    elseif ($action === 'changePassword') {
        $oturum = oturumZorunlu($pdo);
        $body = readJsonBody();
        $userId = $body['userId'] ?? '';
        $yeniSifre = $body['yeniSifre'] ?? '';
        if ($userId === '') respond(['error' => 'Geçersiz istek'], 400);
        if (!sifreGucluMu($yeniSifre)) respond(['error' => 'Şifre en az 10 karakter olmalı; büyük harf, küçük harf ve rakam içermeli'], 400);
        // Yetki: yonetim herkesi, diğerleri sadece KENDİ şifresini değiştirebilir
        if ($oturum['rol'] !== 'yonetim' && $oturum['user_id'] !== $userId) {
            respond(['error' => 'Sadece kendi şifrenizi değiştirebilirsiniz'], 403);
        }
        $kullanicilar = kullanicilariOku($pdo);
        $bulundu = false;
        foreach ($kullanicilar as &$k) {
            if (($k['id'] ?? '') === $userId) {
                $k['sifreHash'] = password_hash($yeniSifre, PASSWORD_DEFAULT);
                $bulundu = true; break;
            }
        }
        if (!$bulundu) respond(['error' => 'Kullanıcı bulunamadı'], 404);
        kullanicilariYaz($pdo, $kullanicilar);
        auditYaz($pdo, $oturum['kullanici_adi'], 'sifre_degistirme', $userId);
        respond(['ok' => true]);
    }

    elseif ($action === 'resetPasswords') {
        $oturum = oturumZorunlu($pdo);
        if ($oturum['rol'] !== 'yonetim') respond(['error' => 'Sadece yönetim tüm şifreleri sıfırlayabilir'], 403);
        $kullanicilar = kullanicilariOku($pdo);
        // ESKİ DAVRANIŞ [kullanıcıadı]1234 gibi tahmin edilebilir bir
        // varsayılana dönüyordu — artık her kullanıcı için GÜÇLÜ, RASTGELE
        // bir şifre üretilir. Düz metin şifreler hiçbir yerde saklanmaz;
        // yalnızca bu TEK seferlik yanıtta döner — istemci ekranda gösterip
        // yöneticinin ilgili kişilere iletmesini sağlar.
        $yeniSifreler = [];
        foreach ($kullanicilar as &$k) {
            $yeni = guvenliRastgeleSifreUret();
            $k['sifreHash'] = password_hash($yeni, PASSWORD_DEFAULT);
            $yeniSifreler[] = ['kullaniciAdi' => $k['kullaniciAdi'] ?? '', 'ad' => $k['ad'] ?? '', 'sifre' => $yeni];
        }
        unset($k);
        kullanicilariYaz($pdo, $kullanicilar);
        auditYaz($pdo, $oturum['kullanici_adi'], 'toplu_sifre_sifirlama', 'kullaniciler');
        respond(['ok' => true, 'yeniSifreler' => $yeniSifreler]);
    }

    // hesapTalepEt: yeni personel giriş hesabı için TALEP açar — oturumsuzdur
    // (giriş ekranındaki "Hesap Talep Et" formundan çağrılır), hesap
    // BEKLEMEDE oluşturulur; yalnızca yönetim onaylayınca gerçek bir
    // kullaniciler kaydına dönüşür. hatSifreTalep ile AYNI güvenlik deseni:
    // IP bazlı hız sınırı, düz metin şifre asla saklanmaz (yalnızca hash'i
    // tutulur, onayda aynen taşınır).
    elseif ($action === 'hesapTalepEt') {
        $ip = istemciIp();
        $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < :s')
            ->execute([':s' => time() - DENEME_PENCERE_SANIYE]);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = :ip');
        $stmt->execute([':ip' => $ip]);
        if ((int)$stmt->fetchColumn() >= MAX_GIRIS_DENEME) {
            respond(['error' => 'Çok fazla istek. 15 dakika sonra tekrar deneyin.'], 429);
        }
        $body = readJsonBody();
        $ad = trim((string)($body['ad'] ?? ''));
        $email = trim((string)($body['email'] ?? ''));
        $rol = (string)($body['rol'] ?? '');
        $sifre = (string)($body['sifre'] ?? '');
        if ($ad === '') respond(['error' => 'Ad soyad zorunlu'], 400);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(['error' => 'Geçerli bir e-posta adresi girin'], 400);
        if (!in_array($rol, TALEP_EDILEBILIR_ROLLER, true)) respond(['error' => 'Geçersiz rol/birim seçimi'], 400);
        if (!sifreGucluMu($sifre)) respond(['error' => 'Şifre en az 10 karakter olmalı; büyük harf, küçük harf ve rakam içermeli'], 400);

        $emailAnahtar = strtolower($email);
        $talepler = kvOku($pdo, 'hesapTalepleri');
        foreach ($talepler as $t) {
            if (strtolower($t['email'] ?? '') === $emailAnahtar && ($t['durum'] ?? '') === 'bekliyor') {
                respond(['error' => 'Bu e-posta ile bekleyen bir talebiniz zaten var — yönetim onayını bekleyin'], 409);
            }
        }
        $kullanicilar = kullanicilariOku($pdo);
        foreach ($kullanicilar as $k) {
            if (strtolower($k['email'] ?? '') === $emailAnahtar) {
                respond(['error' => 'Bu e-posta ile zaten bir hesap var'], 409);
            }
        }
        $pdo->prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (:ip,:t)')
            ->execute([':ip' => $ip, ':t' => time()]);
        $talepler[] = [
            'id' => 'HTL-' . bin2hex(random_bytes(5)), 'ad' => $ad, 'email' => $email, 'rol' => $rol,
            'sifreHash' => password_hash($sifre, PASSWORD_DEFAULT),
            'durum' => 'bekliyor', 'tarih' => date('Y-m-d'), 'zaman' => date('c'), 'ip' => $ip
        ];
        kvYaz($pdo, 'hesapTalepleri', $talepler);
        auditYaz($pdo, 'talep:' . $ad, 'hesap_talebi', 'hesapTalepleri', ['rol' => $rol]);
        epostaGonder($email, 'ÜretimOS — Hesap Talebiniz Alındı',
            "Merhaba $ad,\n\nÜretimOS'a hesap talebiniz alındı. Yönetici onayından sonra bu adrese ($email) bilgilendirme e-postası gönderilecek.\n\nBu talebi siz oluşturmadıysanız bu e-postayı görmezden gelebilirsiniz.");
        respond(['ok' => true]);
    }

    // hesapTalepiKarar: yönetimin bekleyen bir hesap talebini onaylaması ya
    // da reddetmesi. Onayda talep DÜZ METİN şifre hiç taşımadan (yalnızca
    // hash'i devrederek) gerçek bir kullaniciler kaydına dönüşür.
    elseif ($action === 'hesapTalepiKarar') {
        $oturum = oturumZorunlu($pdo);
        if ($oturum['rol'] !== 'yonetim') respond(['error' => 'Sadece yönetim hesap taleplerini onaylayabilir'], 403);
        $body = readJsonBody();
        $id = (string)($body['id'] ?? '');
        $karar = (string)($body['karar'] ?? '');
        if (!in_array($karar, ['onayla', 'reddet'], true)) respond(['error' => 'Geçersiz karar'], 400);
        // Onaylayan yönetim, başvurunun rolünü İSTERSE yükseltebilir (örn.
        // 'yonetim' — bu rol kamuya açık TALEP_EDILEBILIR_ROLLER'da BİLEREK
        // yok; tek yol, MEVCUT bir yönetimin burada elle seçmesidir).
        $rolOverride = isset($body['rol']) ? (string)$body['rol'] : null;
        if ($rolOverride !== null && !in_array($rolOverride, array_merge(TALEP_EDILEBILIR_ROLLER, ['yonetim']), true)) {
            respond(['error' => 'Geçersiz rol'], 400);
        }

        $talepler = kvOku($pdo, 'hesapTalepleri');
        $bulunanIdx = -1;
        foreach ($talepler as $i => $t) {
            if (($t['id'] ?? '') === $id && ($t['durum'] ?? '') === 'bekliyor') { $bulunanIdx = $i; break; }
        }
        if ($bulunanIdx < 0) respond(['error' => 'Bekleyen talep bulunamadı'], 404);
        $talep = $talepler[$bulunanIdx];

        if ($karar === 'reddet') {
            $talepler[$bulunanIdx]['durum'] = 'reddedildi';
            $talepler[$bulunanIdx]['kararTarihi'] = date('Y-m-d');
            kvYaz($pdo, 'hesapTalepleri', $talepler);
            auditYaz($pdo, $oturum['kullanici_adi'], 'hesap_talebi_reddedildi', 'hesapTalepleri', ['rol' => $talep['rol'] ?? null]);
            epostaGonder($talep['email'] ?? '', 'ÜretimOS — Hesap Talebiniz',
                "Merhaba " . ($talep['ad'] ?? '') . ",\n\nÜretimOS hesap talebiniz yönetici tarafından onaylanmadı. Sorularınız için yöneticinizle görüşebilirsiniz.");
            respond(['ok' => true]);
        }

        // onayla: benzersiz bir kullanıcı adı üret (e-postanın @ öncesi
        // kısmından türetilir, çakışırsa sonuna sayı eklenir)
        $kullanicilar = kullanicilariOku($pdo);
        $tabanAdi = kullaniciAdiTabanUret($talep['email'] ?? '');
        $kadi = $tabanAdi; $sira = 1;
        while (true) {
            $carpisma = false;
            foreach ($kullanicilar as $k) { if (strtolower($k['kullaniciAdi'] ?? '') === $kadi) { $carpisma = true; break; } }
            if (!$carpisma) break;
            $sira++; $kadi = $tabanAdi . $sira;
        }
        $verilenRol = $rolOverride !== null ? $rolOverride : $talep['rol'];
        $kullanicilar[] = [
            'id' => 'USR-' . bin2hex(random_bytes(4)), 'kullaniciAdi' => $kadi, 'rol' => $verilenRol,
            'ad' => $talep['ad'], 'email' => $talep['email'] ?? '', 'sifreHash' => $talep['sifreHash']
        ];
        kullanicilariYaz($pdo, $kullanicilar);
        $talepler[$bulunanIdx]['durum'] = 'onaylandi';
        $talepler[$bulunanIdx]['kararTarihi'] = date('Y-m-d');
        $talepler[$bulunanIdx]['atananKullaniciAdi'] = $kadi;
        if ($rolOverride !== null && $rolOverride !== $talep['rol']) {
            $talepler[$bulunanIdx]['atananRol'] = $rolOverride; // istenen ≠ verilen — iz bırak
        }
        kvYaz($pdo, 'hesapTalepleri', $talepler);
        auditYaz($pdo, $oturum['kullanici_adi'], 'hesap_talebi_onaylandi', 'hesapTalepleri', ['istenenRol' => $talep['rol'] ?? null, 'verilenRol' => $verilenRol]);
        epostaGonder($talep['email'] ?? '', 'ÜretimOS — Hesabınız Onaylandı',
            "Merhaba " . ($talep['ad'] ?? '') . ",\n\nÜretimOS hesabınız onaylandı.\nKullanıcı adınız: $kadi\nBaşvuru sırasında belirlediğiniz şifre ile giriş yapabilirsiniz.");
        respond(['ok' => true, 'kullaniciAdi' => $kadi]);
    }

    // ══ DENETİM KAYDI ══════════════════════════════════════════════════════
    elseif ($action === 'audit') {
        // GENİŞLETİLMİŞ DENETİM KAYDI: kim, ne zaman, HANGİ IP'den, hangi rol/birim,
        // hangi SAYFADAN, neyi değiştirdi (kayıt sayısı) ve geri alınabilir mi.
        // onceki_deger'in kendisi listede gönderilmez (çok büyük olabilir);
        // yalnızca varlığı (geriAlinabilir) bildirilir.
        $oturum = oturumZorunlu($pdo);
        if ($oturum['rol'] !== 'yonetim') respond(['error' => 'Sadece yönetim denetim kaydını görebilir'], 403);
        $limit = min(1000, max(1, (int)($_GET['limit'] ?? 300)));
        $kullaniciFiltre = $_GET['kullanici'] ?? '';
        $anahtarFiltre = $_GET['anahtar'] ?? '';
        // AYLIK DÖNEM FİLTRESİ: donem=YYYY-MM verilirse yalnızca o ayın kayıtları.
        // Aylık faaliyet defteri ve arşiv ekranı bunu kullanır.
        $donem = $_GET['donem'] ?? '';
        $rolFiltre = $_GET['rol'] ?? '';
        $sql = 'SELECT id, ts, kullanici, rol, ip, sayfa, islem, anahtar, kayit_sayisi, geri_alindi,
                (CASE WHEN onceki_deger IS NULL THEN 0 ELSE 1 END) AS geri_alinabilir,
                tarayici FROM audit_log WHERE 1=1';
        $par = [];
        if ($kullaniciFiltre !== '') { $sql .= ' AND kullanici = :ku'; $par[':ku'] = $kullaniciFiltre; }
        if ($anahtarFiltre !== '') { $sql .= ' AND anahtar = :an'; $par[':an'] = $anahtarFiltre; }
        if ($rolFiltre !== '') { $sql .= ' AND rol = :ro'; $par[':ro'] = $rolFiltre; }
        if (preg_match('/^\d{4}-\d{2}$/', $donem)) {
            $sql .= " AND substr(ts,1,7) = :dn";
            $par[':dn'] = $donem;
        }
        $sql .= ' ORDER BY id DESC LIMIT :l';
        $stmt = $pdo->prepare($sql);
        foreach ($par as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':l', $limit, PDO::PARAM_INT);
        $stmt->execute();
        respond(['rows' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    elseif ($action === 'auditDonemler') {
        // AYLIK FAALİYET ÖZETİ: hangi dönemde (YYYY-MM) kaç işlem, kaç farklı
        // kullanıcı. Arşiv sekmesi bu listeyi gösterir; ay seçilince detay
        // 'audit&donem=YYYY-MM' ile çekilir. Böylece geçmiş aylar KAPANMIŞ
        // dönem olarak görüntülenir, veri silinmez.
        $oturum = oturumZorunlu($pdo);
        if ($oturum['rol'] !== 'yonetim') respond(['error' => 'Sadece yönetim görebilir'], 403);
        $stmt = $pdo->query("SELECT substr(ts,1,7) AS donem, COUNT(*) AS islem,
                             COUNT(DISTINCT kullanici) AS kullanici_sayisi,
                             MIN(ts) AS ilk, MAX(ts) AS son
                             FROM audit_log GROUP BY donem ORDER BY donem DESC LIMIT 36");
        respond(['donemler' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    elseif ($action === 'auditBirimOzet') {
        // Seçili dönemde BİRİM (rol) bazlı kırılım — departman raporu.
        $oturum = oturumZorunlu($pdo);
        if ($oturum['rol'] !== 'yonetim') respond(['error' => 'Sadece yönetim görebilir'], 403);
        $donem = $_GET['donem'] ?? '';
        if (!preg_match('/^\d{4}-\d{2}$/', $donem)) respond(['error' => 'Geçersiz dönem'], 400);
        $stmt = $pdo->prepare("SELECT COALESCE(NULLIF(rol,''),'bilinmeyen') AS rol,
                               COUNT(*) AS islem, COUNT(DISTINCT anahtar) AS koleksiyon,
                               COUNT(DISTINCT kullanici) AS kisi
                               FROM audit_log WHERE substr(ts,1,7) = :dn
                               GROUP BY rol ORDER BY islem DESC");
        $stmt->bindValue(':dn', $donem);
        $stmt->execute();
        respond(['birimler' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    elseif ($action === 'sayfaZiyaret') {
        // Kullanıcının ziyaret ettiği BİRİM/SAYFA kaydı. Her sayfa açılışında
        // istemci çağırır; hafif ve isteği bloklamaz.
        $oturum = oturumZorunlu($pdo);
        $body = readJsonBody();
        $sayfa = substr((string)($body['sayfa'] ?? ''), 0, 60);
        if ($sayfa === '') respond(['ok' => false], 200);
        try {
            $stmt = $pdo->prepare('INSERT INTO sayfa_ziyaretleri (ts, kullanici, rol, ip, sayfa, birim, tarayici)
                VALUES (:t,:k,:r,:ip,:s,:b,:ua)');
            $stmt->execute([
                ':t' => date('c'), ':k' => $oturum['kullanici_adi'], ':r' => $oturum['rol'],
                ':ip' => istemciIp(), ':s' => $sayfa,
                ':b' => substr((string)($body['birim'] ?? ''), 0, 60), ':ua' => tarayiciOzeti()
            ]);
        } catch (Exception $e) { /* ziyaret logu isteği engellemez */ }
        respond(['ok' => true]);
    }

    elseif ($action === 'ziyaretler') {
        $oturum = oturumZorunlu($pdo);
        if ($oturum['rol'] !== 'yonetim') respond(['error' => 'Sadece yönetim görebilir'], 403);
        $limit = min(1000, max(1, (int)($_GET['limit'] ?? 300)));
        $stmt = $pdo->prepare('SELECT ts, kullanici, rol, ip, sayfa, birim FROM sayfa_ziyaretleri ORDER BY id DESC LIMIT :l');
        $stmt->bindValue(':l', $limit, PDO::PARAM_INT);
        $stmt->execute();
        respond(['rows' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    elseif ($action === 'auditOnizle') {
        // Bir denetim kaydının ÖNCEKİ ve ŞU ANKİ değerini karşılaştırma için döner.
        $oturum = oturumZorunlu($pdo);
        if ($oturum['rol'] !== 'yonetim') respond(['error' => 'Sadece yönetim'], 403);
        $id = (int)($_GET['id'] ?? 0);
        $stmt = $pdo->prepare('SELECT id, anahtar, onceki_deger, ts, kullanici FROM audit_log WHERE id = :i');
        $stmt->execute([':i' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) respond(['error' => 'Kayıt bulunamadı'], 404);
        if ($row['onceki_deger'] === null) respond(['error' => 'Bu kaydın önceki değeri saklanmamış — geri alınamaz'], 400);
        $sim = $pdo->prepare('SELECT store_value FROM kv_store WHERE store_key = :k');
        $sim->execute([':k' => $row['anahtar']]);
        $simRow = $sim->fetch(PDO::FETCH_ASSOC);
        $onceki = json_decode($row['onceki_deger'], true);
        $simdiki = $simRow ? json_decode($simRow['store_value'], true) : null;
        respond([
            'id' => $row['id'], 'anahtar' => $row['anahtar'], 'ts' => $row['ts'], 'kullanici' => $row['kullanici'],
            'oncekiSayi' => is_array($onceki) ? count($onceki) : null,
            'simdikiSayi' => is_array($simdiki) ? count($simdiki) : null,
            'oncekiDeger' => $row['onceki_deger']
        ]);
    }

    elseif ($action === 'auditGeriAl') {
        // GERİ ALMA: seçilen denetim kaydındaki DEĞİŞİKLİK ÖNCESİ değer geri
        // yazılır. Geri alma işleminin kendisi de denetime yazılır (mevcut
        // değer onun "onceki" değeri olur) — yani geri almayı da geri alabilirsiniz.
        $oturum = oturumZorunlu($pdo);
        if ($oturum['rol'] !== 'yonetim') respond(['error' => 'Geri alma yetkisi yalnızca yönetimdedir'], 403);
        $body = readJsonBody();
        $id = (int)($body['id'] ?? 0);
        $stmt = $pdo->prepare('SELECT id, anahtar, onceki_deger, kullanici, ts FROM audit_log WHERE id = :i');
        $stmt->execute([':i' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) respond(['error' => 'Denetim kaydı bulunamadı'], 404);
        if ($row['anahtar'] === 'kullaniciler') respond(['error' => 'Kullanıcı kayıtları bu yoldan geri alınamaz'], 403);
        if ($row['onceki_deger'] === null) respond(['error' => 'Bu kaydın önceki değeri saklanmamış — geri alınamaz'], 400);

        // Şu anki değeri al (geri almanın "öncesi" olarak denetime yazılacak)
        $sim = $pdo->prepare('SELECT store_value FROM kv_store WHERE store_key = :k');
        $sim->execute([':k' => $row['anahtar']]);
        $simRow = $sim->fetch(PDO::FETCH_ASSOC);
        $suAnki = $simRow ? $simRow['store_value'] : null;

        $now = date('c');
        $ins = $pdo->prepare('INSERT INTO kv_store (store_key, store_value, updated_at) VALUES (:k,:v,:t)
            ON CONFLICT(store_key) DO UPDATE SET store_value = :v2, updated_at = :t2');
        $ins->execute([':k' => $row['anahtar'], ':v' => $row['onceki_deger'], ':t' => $now,
                       ':v2' => $row['onceki_deger'], ':t2' => $now]);

        $pdo->prepare('UPDATE audit_log SET geri_alindi = 1 WHERE id = :i')->execute([':i' => $id]);
        $geriSayi = is_array(json_decode($row['onceki_deger'], true)) ? count(json_decode($row['onceki_deger'], true)) : null;
        auditYaz($pdo, $oturum['kullanici_adi'], 'geri_alma', $row['anahtar'], [
            'rol' => $oturum['rol'], 'sayfa' => 'denetim_kaydi',
            'onceki' => $suAnki, 'kayitSayisi' => $geriSayi
        ]);
        respond(['ok' => true, 'anahtar' => $row['anahtar'], 'geriAlinanId' => $id, 'kayitSayisi' => $geriSayi]);
    }

    else {
        respond(['error' => 'Geçersiz action'], 400);
    }

} catch (Exception $e) {
    // Gerçek hata sunucu log'una yazılır; istemciye AYRINTI sızdırılmaz
    // (dosya yolu, SQL, sınıf adı gibi bilgiler saldırgana ipucu verir).
    error_log('UretimOS sunucu hatası: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    respond(['error' => 'Sunucu hatası oluştu. Lütfen tekrar deneyin.'], 500);
}
