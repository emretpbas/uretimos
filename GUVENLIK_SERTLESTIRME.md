# ÜretimOS — Güvenlik Sertleştirme Raporu

Bu belge, sistemin 10 maddelik kritik güvenlik kontrol listesine göre
değerlendirmesini, bu turda yapılan düzeltmeleri ve sizin (işletme/hosting
tarafında) yapmanız gerekenleri içerir.

Değerlendirme, kodun doğrudan incelenmesine dayanır — genel tavsiye değil,
sisteme özgü tespitlerdir.

---

## Özet tablo

| # | Alan | Durum | Not |
|---|------|-------|-----|
| 1 | SQL enjeksiyonu | ✅ Sağlam | 67 parametreli sorgu, string birleştirme ile SQL yok |
| 2 | Yetki kontrolü (IDOR) | ✅ Sağlam | v39'da kapatıldı; hassas koleksiyon okuma/yazma haritası |
| 3 | Kimlik & oturum | ✅ Sağlam | bcrypt, random_bytes(32) token, 12s oturum, kaba kuvvet koruması |
| 4 | Güvenlik başlıkları | ✅ **Bu turda eklendi** | HSTS, X-Frame, CSP, nosniff, Referrer, Permissions |
| 5 | XSS (çıktı kaçışı) | ✅ Sağlam | escapeHtml tutarlı; CSP ek katman olarak eklendi |
| 6 | CORS | ✅ **Bu turda daraltıldı** | Wildcard (*) → güvenilen kaynak beyaz listesi |
| 7 | Kaba kuvvet koruması | ✅ Sağlam | 15 dk'da 10 deneme, IP bazlı kilit |
| 8 | Hata sızıntısı | ✅ **Bu turda düzeltildi** | Ham exception mesajı artık istemciye gitmiyor |
| 9 | Dosya yükleme | ✅ Sağlam | Uzantı beyaz listesi, 15 MB sınır, basename, MIME |
| 10 | Sunucu/hosting sertleştirme | ⚠️ **Sizin tarafınızda** | Aşağıya bakın |

---

## Bu turda yapılan düzeltmeler (kodda)

### 1. Güvenlik başlıkları eklendi (.htaccess)
Önceden HİÇ güvenlik başlığı yoktu. Eklenenler:
- **Strict-Transport-Security (HSTS)** — tarayıcıya "bu siteye hep HTTPS ile
  gel" der; downgrade saldırısını engeller.
- **X-Frame-Options: SAMEORIGIN** — sitenin başka bir sayfaya iframe ile
  gömülüp tıklama-hırsızlığı (clickjacking) yapılmasını engeller.
- **X-Content-Type-Options: nosniff** — tarayıcının dosya türünü tahmin edip
  yanlış çalıştırmasını engeller.
- **Content-Security-Policy (CSP)** — XSS'in etkisini sınırlar; yalnızca kendi
  kökünüzden kaynak yüklenmesine izin verir.
- **Referrer-Policy, Permissions-Policy** — bilgi sızıntısını ve gereksiz
  tarayıcı izinlerini kısar.

> ⚠️ **CSP notu:** Şu an `'unsafe-inline'` içeriyor çünkü mevcut kod inline
> script/style kullanıyor. Bu, CSP'yi zayıflatır ama yine de dışarıdan script
> yüklemeyi engeller. İleride inline kod nonce'a taşınırsa CSP tam sıkılaştırılır.

### 2. CORS daraltıldı (api.php)
Önce `Access-Control-Allow-Origin: *` — yani **herhangi bir web sitesi**
tarayıcı üzerinden API'nize istek atabiliyordu. Artık yalnızca beyaz listedeki
kaynaklar (uretimos.com.tr) kabul ediliyor.

> **Yapmanız gereken:** `api.php` içindeki `$IZINLI_KAYNAKLAR` listesini kendi
> domain'lerinizle güncelleyin (alt alan, mobil sarmalayıcı varsa ekleyin).

### 3. Hata sızıntısı kapatıldı (api.php)
Önce sunucu hatası olduğunda ham exception mesajı (`$e->getMessage()`)
istemciye gidiyordu — bu, dosya yolu/SQL/sınıf adı gibi saldırgana ipucu veren
bilgiler sızdırabilir. Artık istemci genel mesaj görür; gerçek hata sunucu
log'una (dosya + satır ile) yazılır.

---

## Zaten sağlam olan yapı (korunmalı)

Sistem güvenlik açısından iyi kurulmuş. Denetimde doğrulananlar:

- **Parametreli SQL:** 67 sorgu prepared statement kullanıyor; kullanıcı girdisi
  hiçbir yerde string ile SQL'e yapıştırılmıyor.
- **IDOR koruması (v39):** hassas koleksiyonlar (maaş, muhasebe, cari) rol
  bazlı okuma/yazma haritasıyla korunuyor; `depo` rolü maaşa erişemiyor.
- **Kimlik:** bcrypt parola hash'i, kriptografik 64-karakter token, 12 saatlik
  oturum ömrü, IP bazlı kaba kuvvet koruması (15 dk'da 10 deneme).
- **Dosya yükleme:** uzantı beyaz listesi, 15 MB boyut sınırı, bozuk base64
  reddi, `basename()` ile path traversal koruması, MIME beyaz listesi.
- **.htaccess:** SQLite/yedek/test dosyaları web'den erişilemiyor, dizin
  listeleme kapalı.
- **display_errors kapalı**, denetim (audit) log'u mevcut.

---

## SİZİN TARAFINIZDA yapılması gerekenler (koddan bağımsız)

Bunlar en kritik kısım — kod ne kadar güvenli olursa olsun, bunlar eksikse
sistem savunmasız kalır.

### Acil (bu hafta)
1. **Varsayılan parolaları değiştirin.** Sistem ilk kurulumda `kullaniciadi+1234`
   parolası veriyor (örn. `yonetim1234`). Bunların HEPSİ değiştirilmeli — en
   büyük gerçek risk budur.
2. **SSL/HTTPS sertifikanızın aktif olduğunu doğrulayın.** `.htaccess`'e HTTPS
   zorlaması ekledim ama SSL sertifikanız yoksa site erişilemez olur. cPanel'de
   "SSL/TLS Status" → sertifika aktifse HTTPS zorlaması güvenle çalışır.
   Değilse önce ücretsiz Let's Encrypt sertifikası kurun (cPanel'de var).
3. **Yönetici e-posta ve cPanel parolanızı güçlendirin.** ERP'ye giden en kısa
   yol çoğu zaman hosting panelidir.

### Kısa vadede
4. **Düzenli yedekleme.** Fidye yazılımına (ransomware) karşı TEK gerçek savunma
   yedektir. cPanel yedekleme + haftalık dışa aktarım (indirip yerelde saklama).
5. **İki faktörlü doğrulama (2FA)** cPanel hesabınızda açık olsun.
6. **PHP sürümünü güncel tutun** (cPanel → Select PHP Version, 8.2+).

### Yapısal (orta vadede, isteğe bağlı)
7. **Paylaşımlı hosting sınırı:** Aynı sunucuda başka siteler var; izolasyon
   sınırlı. Güvenlik gerçekten kritikse, kendi kontrolünüzdeki bir VPS'e geçmek
   en büyük iyileştirme olur (sunucu sertleştirmesi, güvenlik duvarı, izole
   ortam). Bu, dil değişikliğinden çok daha fazla koruma sağlar.

---

## Önemli çerçeve

Bir ERP'nin saldırı dayanıklılığı **dilden çok uygulama disiplinine** bağlıdır.
Bu sistem doğru temelleri (parametreli SQL, rol kontrolü, bcrypt) zaten
taşıyordu; bu turda tarayıcı katmanı savunmasını (başlıklar, CORS) ve bilgi
sızıntısını kapattık. Kalan en büyük riskler **koddan çok işletme tarafında**:
varsayılan parolalar, HTTPS, yedekleme ve hosting izolasyonu.

Hiçbir sistem "%100 güvenli" değildir; sertleştirme, saldırıyı zorlaştırıp
maliyetini artırma disiplinidir. Bu belgedeki adımlar saldırı yüzeyini belirgin
şekilde daraltır.
