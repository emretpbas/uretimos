# Günlük Yedekleme — Kurulum Rehberi

Sisteminiz artık **günde bir kez otomatik yedek** alıp **son 30 günü** tutuyor;
eskiler döngüsel olarak silinir (üstüne yazma).

## Nasıl çalışıyor (iki katman)

1. **Uygulama içi (zaten vardı):** Günün ilk isteğinde `data.sqlite`,
   `backups/uretimos_YYYY-MM-DD.sqlite` olarak kopyalanır. Ama o gün siteye
   kimse girmezse çalışmaz.
2. **Cron betiği (yeni — `gunluk_yedek.php`):** Ziyaret olsun olmasın, günde bir
   kez GARANTİ yedek alır. İkisi aynı mantığı paylaşır; aynı günün yedeği zaten
   varsa ikincisini oluşturmaz.

Her ikisi de son **30 günü** tutar (`YEDEK_TUTMA_ADEDI = 30`). Eskiler otomatik
silinir — döngüsel üstüne yazma.

## Kurulum: cPanel'de cron job (tek seferlik, ~2 dakika)

1. cPanel → **"Cron Jobs"** (Zamanlanmış Görevler)
2. **"Add New Cron Job"** bölümüne gelin
3. Zamanlama: **Once Per Day** hazır ayarını seçin VEYA elle şunu girin:
   - Dakika: `0`  Saat: `3`  Gün: `*`  Ay: `*`  Haftanın günü: `*`
   - (Bu, her gün gece 03:00'te çalışır — sitenin en sakin saati)
4. **Command** kutusuna şunu yazın (yolu kendi hesabınıza göre düzeltin):

   ```
   /usr/local/bin/php /home/KULLANICI_ADINIZ/public_html/gunluk_yedek.php >> /home/KULLANICI_ADINIZ/yedek_log.txt 2>&1
   ```

   - `KULLANICI_ADINIZ` → cPanel kullanıcı adınız
   - `public_html` → dosyaların bulunduğu klasör (alt klasördeyse ekleyin)
   - `>> ... yedek_log.txt` → çıktı bir log dosyasına yazılır (isteğe bağlı ama
     faydalı — yedeğin alınıp alınmadığını buradan görürsünüz)

5. **"Add New Cron Job"** ile kaydedin.

> **PHP yolunu bilmiyorsanız:** cPanel → "Cron Jobs" sayfasının altında genelde
> örnek PHP yolu yazar. Ya da hosting desteğine "php CLI yolu nedir" diye sorun.
> GoDaddy cPanel'de genelde `/usr/local/bin/php` veya `/usr/bin/php` olur.

## İlk çalıştırmayı ELLE test edin (önemli)

Cron'u kurduktan sonra bir kez elle çalıştırıp çalıştığını görün:

- cPanel → **Terminal** (varsa) açın ve şunu yazın:
  ```
  php ~/public_html/gunluk_yedek.php
  ```
- Çıktıda **"Yedek alındı: uretimos_YYYY-MM-DD.sqlite"** görmelisiniz.
- Sonra cPanel → **File Manager** → `backups/` klasörüne bakın; bugünün
  tarihli `.sqlite` dosyası orada olmalı.

Terminal yoksa, cron'u geçici olarak "her dakika" (`* * * * *`) yapıp 1-2 dakika
bekleyin, `backups/` klasörünü kontrol edin, sonra günlük ayara geri alın.

## ⚠️ Dürüst uyarılar

1. **30 gün tutuluyor.** Son bir aylık yedek elinizde olur; fark edilmeyen bir
   bozulmayı geri almak için güvenli bir tampon. Değeri değiştirmek isterseniz
   `api.php` ve `gunluk_yedek.php` içindeki `30` sayısını düzenleyin (ikisi de
   aynı olmalı).

2. **Yedek AYNI sunucuda.** `backups/` klasörü hosting'inizin içinde. Sunucu
   çökerse, hosting hesabı silinirse veya fidye yazılımı tüm hesabı şifrelerse,
   yedek de gider. **Gerçek güvenlik için haftada bir `backups/` klasörünü
   indirip kendi bilgisayarınızda/harici diskte saklayın.** Sunucu-içi yedek,
   "yanlışlıkla veri sildim" senaryosunu kurtarır; "sunucuyu kaybettim"
   senaryosunu kurtarmaz.

3. **Sadece veritabanı yedekleniyor** (`data.sqlite`). Yüklenen dosyalar/görseller
   ayrı bir klasördeyse onlar bu yedeğe dahil değil. Tüm siteyi yedeklemek için
   cPanel'in kendi **"Backup Wizard"** aracını da ayrıca kullanın (tam hesap
   yedeği alır).

4. **Disk alanı.** 5 yedek × veritabanı boyutu kadar yer kaplar. Veritabanınız
   büyükse disk kullanımını izleyin (cPanel ana ekranında görünür).

## Özet

| Ne | Durum |
|----|-------|
| Günlük otomatik yedek | ✅ Kuruldu (uygulama içi + cron) |
| 30 günlük döngü (üstüne yazma) | ✅ Test edildi, çalışıyor |
| Yedeklerin web'den korunması | ✅ .htaccess ile kapalı |
| Cron kurulumu | ⚠️ SİZ yapacaksınız (yukarıdaki adımlar) |
| Site-dışı kopya | ⚠️ Önerilir (haftalık indirme) |
