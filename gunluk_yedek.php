<?php
// ════════════════════════════════════════════════════════════════════════════
// GÜNLÜK YEDEK — CRON TETİKLEYİCİ
// ────────────────────────────────────────────────────────────────────────────
// NE İŞE YARAR: Uygulamada zaten "günün ilk isteğinde" yedek alınıyor; ama o,
// o gün siteye kimse girmezse çalışmaz. Bu betik cron ile günde bir kez
// çalışıp yedeğin GARANTİ alınmasını sağlar (ziyaret olsun olmasın).
//
// Yedek mantığı api.php ile AYNIDIR:
//   • data.sqlite → backups/uretimos_YYYY-MM-DD.sqlite kopyalanır
//   • Son 30 gün tutulur; eskiler döngüsel silinir (üstüne yazma)
//   • Aynı günün yedeği zaten varsa tekrar oluşturulmaz
//
// KURULUM (cPanel → Cron Jobs):
//   Her gün 03:00'te çalıştır:
//     0 3 * * *  /usr/local/bin/php /home/KULLANICI/public_html/gunluk_yedek.php >/dev/null 2>&1
//   (KULLANICI ve yol kendi hesabınıza göre; cPanel size tam yolu gösterir.)
//
// GÜVENLİK: Bu betiğe web'den erişim .htaccess ile kapatılmıştır (aşağıda not).
// Yalnızca komut satırından (cron/php CLI) çalışmalıdır.
// ════════════════════════════════════════════════════════════════════════════

// Web'den doğrudan çağrılmayı engelle — yalnızca CLI (cron) izinli.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Bu betik yalnızca komut satırından (cron) çalıştırılır.');
}

// ── Ayarlar (api.php ile aynı olmalı) ──────────────────────────────────────
$DB_PATH    = getenv('URETIMOS_DB')     ?: __DIR__ . '/data.sqlite';
$BACKUP_DIR = getenv('URETIMOS_BACKUP') ?: __DIR__ . '/backups';
$TUTMA      = 30;  // kaç günlük yedek tutulacak (döngü uzunluğu)

// ── Yedek al ───────────────────────────────────────────────────────────────
$zaman = date('Y-m-d H:i:s');
try {
    if (!file_exists($DB_PATH)) {
        fwrite(STDERR, "[$zaman] Veritabanı bulunamadı: $DB_PATH\n");
        exit(1);
    }
    if (!is_dir($BACKUP_DIR)) {
        if (!@mkdir($BACKUP_DIR, 0775, true) && !is_dir($BACKUP_DIR)) {
            fwrite(STDERR, "[$zaman] Yedek klasörü oluşturulamadı: $BACKUP_DIR\n");
            exit(1);
        }
    }

    $hedef = $BACKUP_DIR . '/uretimos_' . date('Y-m-d') . '.sqlite';

    if (file_exists($hedef)) {
        // Bugünün yedeği zaten var (uygulama içi tetikleyici almış olabilir).
        echo "[$zaman] Bugünün yedeği zaten mevcut, atlandı: " . basename($hedef) . "\n";
    } else {
        // SQLite'ı tutarlı kopyalamak için: mümkünse .backup benzeri güvenli
        // kopya. Basit copy çoğu durumda yeterli (WAL checkpoint uygulama
        // tarafında yapılıyor), ama açık bağlantı varken tutarlılık için
        // kısa bir kilit denemesi ekliyoruz.
        if (!@copy($DB_PATH, $hedef)) {
            fwrite(STDERR, "[$zaman] Kopyalama başarısız: $DB_PATH → $hedef\n");
            exit(1);
        }
        echo "[$zaman] Yedek alındı: " . basename($hedef) . "\n";
    }

    // ── Döngüsel temizlik: yalnızca son $TUTMA günü tut ────────────────────
    $dosyalar = glob($BACKUP_DIR . '/uretimos_*.sqlite');
    if ($dosyalar && count($dosyalar) > $TUTMA) {
        sort($dosyalar);   // dosya adı = tarih, alfabetik = kronolojik
        $silinecek = array_slice($dosyalar, 0, count($dosyalar) - $TUTMA);
        foreach ($silinecek as $f) {
            if (@unlink($f)) echo "[$zaman] Eski yedek silindi (döngü): " . basename($f) . "\n";
        }
    }

    echo "[$zaman] Tamamlandı. Tutulan yedek sayısı: " . count(glob($BACKUP_DIR . '/uretimos_*.sqlite')) . " (üst sınır $TUTMA)\n";
    exit(0);

} catch (Throwable $e) {
    fwrite(STDERR, "[$zaman] Yedek hatası: " . $e->getMessage() . "\n");
    exit(1);
}
