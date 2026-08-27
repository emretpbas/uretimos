# ÜretimOS — VPS / Hosting Kurulum Rehberi (Güvenli Sürüm v2)

## Gereksinimler
- PHP 8.0+ (pdo_sqlite eklentisi — çoğu hostingde varsayılan açık)
- Apache veya Nginx
- Klasörde PHP'nin YAZMA izni (data.sqlite ve backups/ için)

---

## Bu Sürümdeki Güvenlik Katmanları (v2)

| Katman | Açıklama |
|---|---|
| **Token kimlik doğrulama** | Giriş yapılmadan API'den TEK BAYT veri okunamaz/yazılamaz. Her istek 12 saat ömürlü oturum token'ı taşır. |
| **bcrypt şifre hash** | Şifreler sunucuda bcrypt ile saklanır; istemciye asla hash gönderilmez. Eski düz metin şifreler ilk girişte otomatik hash'e yükseltilir. |
| **Kaba kuvvet koruması** | Aynı IP'den 15 dakikada 10 başarısız giriş → geçici kilit (HTTP 429). |
| **Denetim kaydı (audit log)** | Her giriş/yazma/silme: kim, ne zaman, hangi veri. Yönetim → Ayarlar → 📋 Denetim Kaydı. |
| **Otomatik günlük yedek** | Günün ilk isteğinde `backups/uretimos_YYYY-MM-DD.sqlite` oluşur; son 30 gün saklanır. |
| **Dosya koruması** | `.htaccess` ile `*.sqlite` ve `backups/` web'den indirilemez. |
| **Yetki ayrımı** | Şifre değiştirme: yönetim herkesinkini, diğerleri sadece kendisininkini. Audit sadece yönetim. |

---

## Paylaşımlı Hosting (cPanel/DirectAdmin) — En Kolay Yol

1. Tüm dosyaları FTP ile `public_html/` (veya alt klasöre) yükleyin — `.htaccess` DAHİL
2. Klasöre yazma izni verin (755/775) — `data.sqlite` ve `backups/` otomatik oluşur
3. Tarayıcıdan sitenize gidin → giriş ekranı gelir → **yonetim / yonetim1234**
4. **İLK İŞ: Ayarlar → 🔑 Şifre Yönetimi ile TÜM şifreleri değiştirin**

> `.htaccess`'in yüklendiğini doğrulayın: `https://siteniz.com/data.sqlite` adresi
> **403/404 dönmeli**. Dosya iniyorsa hosting panelinizden `.htaccess` desteğini açın.

---

## Ubuntu VPS (Apache)

```bash
sudo apt update && sudo apt install -y apache2 php php-sqlite3
sudo a2enmod rewrite
sudo mkdir -p /var/www/html/uretimos
# Dosyaları SFTP/SCP ile /var/www/html/uretimos içine kopyalayın (.htaccess dahil)
sudo chown -R www-data:www-data /var/www/html/uretimos
sudo chmod -R 755 /var/www/html/uretimos
sudo chmod 775 /var/www/html/uretimos   # data.sqlite yazılabilsin
```

Apache site ayarında `AllowOverride All` olmalı (yoksa .htaccess çalışmaz):
```apache
<Directory /var/www/html/uretimos>
    AllowOverride All
    Options -Indexes
</Directory>
```

## Nginx

Nginx `.htaccess` okumaz — aynı korumayı config'e ekleyin:
```nginx
server {
    listen 80;
    server_name uretimos.sirketiniz.com;
    root /var/www/html/uretimos;
    index index.html;

    location ~ \.(sqlite|sqlite-wal|sqlite-shm|db)$ { deny all; }
    location ^~ /backups/ { deny all; }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
    location / { try_files $uri $uri/ /index.html; }
}
```

## AI Görme Servisi (Montaj Şemasından Reçete)

**Tanımlar (ARGE/Teknik Ofis) → Montaj Şemasından Reçete (AI)** ekranı, montaj
şeması PDF'lerini (patlatılmış çizim + parça tablosu) okumak için Anthropic'in
görme (vision) API'sini kullanır. Bu şemalarda tablo dahil HER ŞEY vektör
çizimdir — metin katmanı yoktur, kural tabanlı çıkarım mümkün değildir; AI
şart. Bu modül olmadan uygulamanın geri kalanı normal çalışmaya devam eder.

1. `php-curl` eklentisinin kurulu olduğundan emin olun: `php -m | grep curl`
   (yoksa: `sudo apt install -y php-curl` ve PHP-FPM/Apache'yi yeniden başlatın)
2. Bir Anthropic API anahtarı alın (console.anthropic.com)
3. Anahtarı sunucuda `URETIMOS_ANTHROPIC_KEY` ortam değişkeni olarak tanımlayın
   — `URETIMOS_DB` ile AYNI mekanizma, koda veya veritabanına ASLA yazılmaz:

   **Apache** (sanal host veya `.htaccess`'e, `SetEnv` `AllowOverride FileInfo`
   gerektirir):
   ```apache
   SetEnv URETIMOS_ANTHROPIC_KEY "sk-ant-..."
   ```
   **Nginx + PHP-FPM** (pool dosyasına, örn. `/etc/php/8.3/fpm/pool.d/www.conf`):
   ```ini
   env[URETIMOS_ANTHROPIC_KEY] = sk-ant-...
   ```
   sonra: `sudo systemctl restart php8.3-fpm`

Anahtar tanımlı değilse ekran silinmiş/uydurma veri ÜRETMEZ — sunucu açık bir
"AI görme servisi yapılandırılmamış" hatası döner. Her çağrı görsel başına
küçük bir API maliyeti taşır (Anthropic konsolundan izlenebilir).

## HTTPS (zorunlu tavsiye)

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d uretimos.sirketiniz.com
```
Şifreler HTTPS olmadan ağda düz metin dolaşır — **canlı kullanımda SSL şart**.

---

## Giriş Bilgileri (Varsayılan — kurulumdan sonra DEĞİŞTİRİN)

| Kullanıcı | Şifre | Birim |
|---|---|---|
| yonetim | yonetim1234 | Üst Yönetim (tam erişim + şifre/denetim) |
| arge | arge1234 | ARGE (tam erişim) |
| teknik | teknik1234 | Teknik Ofis |
| satinalma | satinalma1234 | Satınalma |
| uretim | uretim1234 | Üretim Planlama |
| depo | depo1234 | Depo |
| cari | cari1234 | Cari İşlemler |
| teklif | teklif1234 | Teklif & Sipariş |
| sevkiyat | sevkiyat1234 | Sevkiyat |
| muhasebe | muhasebe1234 | Muhasebe |
| kalite | kalite1234 | Kalite Kontrol |
| ik | ik1234 | İnsan Kaynakları |
| bakim | bakim1234 | Bakım |

Kullanıcı hesapları sunucuda **ilk girişte otomatik** (hash'li) oluşturulur.
Şifre sıfırlama: yönetim → ⚙ Ayarlar → 🔑 Şifre Yönetimi.
Oturum düşerse (12 saat) sistem otomatik giriş ekranına döner.

---

## Yedekler

- Otomatik: her gün `backups/uretimos_YYYY-MM-DD.sqlite` (son 30 gün)
- Sunucu DIŞINA da yedek alın (felaket senaryosu):
```bash
# crontab -e (sunucu dışına kopya, örn. yedek diski/NAS)
0 3 * * * cp /var/www/html/uretimos/backups/uretimos_$(date +\%Y-\%m-\%d).sqlite /mnt/yedekdisk/
```
- Geri yükleme: siteyi durdurun → `data.sqlite`'ı yedek dosyasıyla değiştirin → açın.

## Mobil (PWA)

Telefonda Chrome ile siteyi açın → ⋮ → **Ana Ekrana Ekle**. Uygulama gibi
tam ekran çalışır, VPS'teki ortak veriye bağlanır.
