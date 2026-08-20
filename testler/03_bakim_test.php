<?php
// ── GÜNLÜK BAKIM / BUDAMA ───────────────────────────────────────────────────
// Bu testler 1 GB RAM hedefi için eklenen kaynak korumalarını korur:
//   · audit_log ve sayfa_ziyaretleri sınırsız büyümemeli
//   · eski denetim kayıtlarının AĞIR alanı boşalmalı, izi kalmalı
//   · son 30 günün geri alma verisi KORUNMALI
//   · bakım günde yalnızca bir kez çalışmalı (her istekte değil)
// $gecici değişkeni çalıştırıcıdan gelir (require aynı kapsamda çalışır).

$dbYolu = $gecici . '/test.sqlite';

Test::bolum('Kaynak ayarları — api.php');

$kaynak = file_get_contents(dirname(__DIR__) . '/api.php');
Test::dogru(strpos($kaynak, "ini_set('memory_limit'") !== false,
    'memory_limit ayarlanıyor');
Test::dogru(strpos($kaynak, 'register_shutdown_function') !== false,
    'Bellek bekçisi (ölümcül hata yakalayıcı) kurulu');
Test::dogru(strpos($kaynak, 'AUDIT_TUTMA_GUN') !== false,
    'Denetim kaydı saklama süresi tanımlı');
// Bekçi çıktısı BAŞLIKLARDAN ÖNCE gelmeli, yoksa sıkıştırma devre dışı kalır
$iniKonum   = strpos($kaynak, "ini_set('memory_limit'");
$headerKonum = strpos($kaynak, "header('Content-Type: application/json");
Test::dogru($iniKonum < $headerKonum,
    'Kaynak ayarları ilk çıktıdan ÖNCE geliyor');

Test::bolum('Budama — eski kayıtların ağır alanı boşaltılıyor');

if (!file_exists($dbYolu)) {
    Test::dogru(false, 'Test veritabanı bulunamadı', $dbYolu);
} else {
    $pdo = new PDO('sqlite:' . $dbYolu);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $agir = str_repeat('x', 50 * 1024);   // 50 KB sahte önceki değer

    // 30 ESKİ kayıt (60 gün önce) + 5 YENİ kayıt (bugün)
    $st = $pdo->prepare('INSERT INTO audit_log (ts,kullanici,islem,anahtar,onceki_deger)
                         VALUES (?,?,?,?,?)');
    for ($i = 0; $i < 30; $i++) {
        $st->execute([date('c', time() - 60 * 86400), 'eski', 'yazma', 'faturalar', $agir]);
    }
    for ($i = 0; $i < 5; $i++) {
        $st->execute([date('c'), 'yeni', 'yazma', 'faturalar', $agir]);
    }

    // Eski (120 gün) ve yeni ziyaretler
    $zt = $pdo->prepare('INSERT INTO sayfa_ziyaretleri (ts,kullanici,sayfa) VALUES (?,?,?)');
    for ($i = 0; $i < 20; $i++) { $zt->execute([date('c', time() - 120 * 86400), 'a', 'dashboard']); }
    for ($i = 0; $i < 3;  $i++) { $zt->execute([date('c'), 'a', 'dashboard']); }

    $agirOnce    = (int)$pdo->query('SELECT COUNT(*) FROM audit_log WHERE onceki_deger IS NOT NULL')->fetchColumn();
    $ziyaretOnce = (int)$pdo->query('SELECT COUNT(*) FROM sayfa_ziyaretleri')->fetchColumn();
    Test::dogru($agirOnce >= 35, 'Başlangıçta ağır alanlı kayıt var', "adet: $agirOnce");

    // Bakımı yeniden tetikle: bugünün işaretini geriye al
    $pdo->prepare("UPDATE kv_store SET store_value = '2000-01-01'
                   WHERE store_key = '__bakim_tarihi'")->execute();
    $pdo = null;   // dosya kilidini bırak

    // Herhangi bir istek bakımı çalıştırır
    Test::istek('?action=get&key=t_bakim_tetik');

    $pdo = new PDO('sqlite:' . $dbYolu);
    $agirSonra    = (int)$pdo->query('SELECT COUNT(*) FROM audit_log WHERE onceki_deger IS NOT NULL')->fetchColumn();
    $izSonra      = (int)$pdo->query('SELECT COUNT(*) FROM audit_log')->fetchColumn();
    $ziyaretSonra = (int)$pdo->query('SELECT COUNT(*) FROM sayfa_ziyaretleri')->fetchColumn();

    Test::dogru($agirSonra < $agirOnce,
        'Eski kayıtların ağır alanı boşaltıldı', "$agirOnce → $agirSonra");
    Test::dogru($agirSonra >= 5,
        'Son 30 günün geri alma verisi KORUNDU', "kalan: $agirSonra");
    Test::dogru($izSonra >= 35,
        'Kayıt izleri silinmedi (kim/ne zaman/ne bilgisi duruyor)', "satır: $izSonra");
    Test::dogru($ziyaretSonra < $ziyaretOnce,
        'Eski sayfa ziyaretleri silindi', "$ziyaretOnce → $ziyaretSonra");
    Test::dogru($ziyaretSonra >= 3,
        'Güncel ziyaretler korundu', "kalan: $ziyaretSonra");

    Test::bolum('Bakım günde yalnızca bir kez çalışıyor');

    $isaret = $pdo->query("SELECT store_value FROM kv_store WHERE store_key='__bakim_tarihi'")->fetchColumn();
    Test::esit(date('Y-m-d'), $isaret, 'Bakım işareti bugüne güncellendi');

    // Yeniden ağır kayıt ekle; bakım TEKRAR çalışmamalı → kayıt kalmalı
    $pdo->prepare('INSERT INTO audit_log (ts,kullanici,islem,anahtar,onceki_deger) VALUES (?,?,?,?,?)')
        ->execute([date('c', time() - 60 * 86400), 'eski2', 'yazma', 'faturalar', $agir]);
    $pdo = null;

    Test::istek('?action=get&key=t_bakim_tetik2');

    $pdo = new PDO('sqlite:' . $dbYolu);
    $kalan = (int)$pdo->query("SELECT COUNT(*) FROM audit_log
                               WHERE kullanici='eski2' AND onceki_deger IS NOT NULL")->fetchColumn();
    Test::esit(1, $kalan, 'İkinci istekte bakım tekrar çalışmadı (gün içi tek sefer)');
    $pdo = null;
}

Test::bolum('İndeksler oluşturuldu');

$pdo = new PDO('sqlite:' . $dbYolu);
$indeksler = $pdo->query("SELECT name FROM sqlite_master WHERE type='index'")->fetchAll(PDO::FETCH_COLUMN);
foreach (['ix_audit_ts', 'ix_audit_kullanici', 'ix_ziyaret_ts', 'ix_session_expires'] as $ix) {
    Test::dogru(in_array($ix, $indeksler, true), "İndeks var: $ix");
}
$pdo = null;
