# ÜretimOS Güvenlik Denetimi — v39

**Kapsam:** Kaynak kod denetimi (v38). Canlı siteye (uretimos.com.tr) bu
ortamdan erişilemediği ve parola girişi yapılamadığı için denetim, kod
üzerinden yürütülüp bulgular yerel bir test sunucusunda **kanıtla**
doğrulanmıştır.

**Yöntem:** Bir saldırganın izleyeceği sıra takip edildi — kimlik doğrulama →
oturum → yetkilendirme → enjeksiyon → XSS → dosya/altyapı koruması.

---

## 🔴 CİDDİ — Yatay Yetki Yükseltme (IDOR) · DÜZELTİLDİ

### Bulgu
`get`, `set`, `patch`, `delete` uçları yalnızca **geçerli oturum** istiyordu;
**rol bazlı yetki kontrolü yoktu**. Sonuç: en düşük yetkili herhangi bir
personel hesabı, sistemdeki **her koleksiyonu** okuyabiliyor ve
**üzerine yazabiliyor / silebiliyordu**.

### Kanıt (yerel sunucuda çalıştırıldı)
`depo` rolüyle (depo personeli) giriş yapıldı ve:
- `maaslar` koleksiyonu **okundu** → çalışan maaşları görüldü
- `maaslar` **tamamen üzerine yazıldı/silindi** → başarılı
- `kullaniciler` listesi okundu → 14 hesap

Aynı açık `muhasebeKayitlari`, `faturalar`, `musteriler`, `tedarikciler`,
`bordrolar`, `cari` verileri için de geçerliydi.

### Neden kritik
- Maaş, cari, muhasebe gibi veriler tüm personele açıktı (gizlilik ihlali)
- Herhangi bir hesap finansal kayıtları **silebilir/bozabilirdi** (bütünlük)
- Sistemin `audit` ve şifre uçları doğru rol kontrolü yapıyordu — yani
  mekanizma vardı, veri uçlarına **uygulanmamıştı** (tutarsızlık)

### Düzeltme
`api.php` içine `koleksiyonYetkiKontrol()` eklendi ve dört veri ucuna bağlandı.
İki katmanlı model:
- **~25 hassas koleksiyon** yalnızca ilgili rollere açık (İK→maaş/bordro,
  muhasebe→finans, cari→müşteri vb.)
- Hassas listede olmayan **operasyonel** veri (ürün, reçete, stok, sipariş)
  tüm giriş yapmış personele açık kalır — mevcut akışlar bozulmaz
- **Yazma yetkisi okumadan dardır** (örn. maaşı muhasebe okur ama yalnızca
  İK yazar)
- `yonetim` rolü her şeye erişir

### Doğrulama
`testler/05_yetki_test.php` — 23 kontrol:
- depo → maaş oku/yaz/sil: **4/4 engellendi (403)**
- 6 hassas koleksiyon depoya kapalı
- İK/muhasebe/yönetim meşru erişimi korundu (fazla geniş değil)
- Paylaşılan operasyonel veri (ürün/reçete/sipariş/stok) açık kaldı
- Saldırı denemelerinden sonra maaş verisi bozulmamış

---

## 🟢 SAĞLAM BULUNAN ALANLAR

Bir saldırganın deneyeceği ama tutmayacağı noktalar:

| Alan | Durum |
|---|---|
| **Parola saklama** | bcrypt (`password_hash`), hash istemciye gitmiyor |
| **Parola karşılaştırma** | `password_verify` + `hash_equals` (zamanlama-güvenli) |
| **Oturum token** | `random_bytes(32)` = 256-bit, 12 saat ömür |
| **Kaba kuvvet** | 15 dk'da 10 deneme, IP bazlı, `login_attempts` tablosu |
| **SQL enjeksiyonu** | Yok — tüm 45 sorgu parametreli; tek dinamik SQL sabit kolon listesinden |
| **Dosya indirme (dosyaIndir)** | Kimlik doğrulamasız (QR senaryosu) ama 64-bit rastgele anahtar + `basename()` yol-geçiş koruması |
| **XSS (sunucu)** | Dosya görüntüleyici tüm değerleri `htmlspecialchars(ENT_QUOTES)` ile kaçırıyor |
| **XSS (istemci)** | `confirmDialog`, dropdown'lar ve kart listeleri `escapeHtml` kullanıyor; tehlikeli çıktı fonksiyonları girdiyi kendileri temizliyor |
| **Yol geçişi** | `basename()` ile engelli |
| **DB/yedek web erişimi** | `.htaccess`: `.sqlite`/`.db` engelli, `backups/` 404, `dosyalar/` ayrı `.htaccess` ile kilitli |

---

## 🟡 İYİLEŞTİRME ÖNERİLERİ (açık değil, sağlamlaştırma)

1. **Veritabanı web kökünün altında.** `data.sqlite` `__DIR__` içinde, yani
   web kökünde. `.htaccess` koruması **yalnızca Apache + AllowOverride açıksa**
   çalışır; **nginx'te `.htaccess` okunmaz** ve DB indirilebilir hale gelir.
   Öneri: DB'yi web kökünün *dışına* taşıyın (örn. `../uretimos_data/`) ve
   `URETIMOS_DB` ortam değişkeniyle gösterin. Kod bunu zaten destekliyor.

2. **Yedek adı tahmin edilebilir** (`uretimos_TARIH.sqlite`). Şu an `backups/`
   klasör engeli + `.sqlite` uzantı engeli ile çift korumalı; ama aynı nginx
   uyarısı geçerli. Web kökü dışına taşımak bunu da çözer.

3. **XSS derinlemesine savunma.** İstemcide serbest metin alanları çoğunlukla
   `escapeHtml`'den geçiyor ama birkaç şablonda doğrudan `${x.ad}` var (çoğu
   sabit tanım, birkaçı `confirmDialog` gibi kendi kaçıran fonksiyonlara
   gidiyor). Aktif bir XSS bulunamadı; yine de yeni şablon yazarken kullanıcı
   girdisini her zaman `App.escapeHtml()` ile sarmak iyi bir alışkanlıktır.

4. **Varsayılan parolalar.** Kurulumda 14 hesap `kullaniciadi + 1234` ile
   açılıyor (ör. `yonetim/yonetim1234`). İlk girişte tüm hesapların
   parolalarının değiştirilmesi zorunlu tutulmalı.

---

## ÖZET

- **1 ciddi açık bulundu ve kapatıldı** (yatay yetki yükseltme)
- Kimlik doğrulama, oturum, enjeksiyon ve XSS savunması **sağlam**
- Başlıca kalan risk **dağıtım kaynaklı**: DB'yi web kökü dışına taşımak
  ve varsayılan parolaları değiştirmek
- Toplam test: 87 PHP kontrolü (23'ü yeni yetki testi) geçiyor
