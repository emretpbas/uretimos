# ÜretimOS — Ölçekleme Analizi ve Kapasite Planı

**Hedef ölçek:** 20.000 sabit + 20.000 özel ürün reçetesi · günde 150–200 fatura (≈20 kalem) · aynı sayıda irsaliye

---

## 1. Özet — Önce Kötü Haber

**Mevcut veri mimarisi bu ölçeği kaldıramaz.** Sorun kodun kalitesinde değil, verinin
saklanma biçiminde: sistem her koleksiyonu (reçeteler, faturalar, yarı mamüller…)
veritabanında **tek bir satırda, tek bir dev JSON metni** olarak tutuyor
(`kv_store` tablosu, `store_key` / `store_value`).

Bu yapı 500–5.000 kayıtta gayet iyi çalışır — bugün çalışmasının sebebi bu.
40.000 reçete ve yılda 100.000 belgede ise şu hale gelir:

> Tek bir faturanın tek bir satırını değiştirmek için,
> **138 MB'lık metnin tamamı okunur, ayrıştırılır, değiştirilir ve baştan yazılır.**

Bu, mimarinin sınırıdır; ayar veya donanımla aşılamaz. Çözüm, veriyi
**satır bazlı (ilişkisel) tablolara** taşımaktır. Aşağıda ölçümler, gerekçe ve
kademeli geçiş planı var.

---

## 2. Ölçümler

Aşağıdaki boyut ve süreler **gerçekten üretilip ölçüldü** (tahmin değil).
Süreler hızlı bir makinede Node.js ile alındı; paylaşımlı hostingde PHP ile
**2–5 kat daha yavaş** olması beklenir.

### 2.1 Veri boyutları (hedef ölçekte)

| Koleksiyon | Kayıt | Boyut | Not |
|---|---:|---:|---|
| `receteler` | 40.000 | **81 MB** | ortalama 20 kalem/reçete |
| `urunler` | 40.000 | 12 MB | |
| `yarimamuller` | 400.000 | **125 MB** | ürün başına ~10 panel kartı |
| `faturalar` (1 yıl) | 50.000 | **138 MB** | 1.000.000 kalem |
| `irsaliyeler` (1 yıl) | 50.000 | **138 MB** | 1.000.000 kalem |
| **Toplam (1. yıl)** | | **≈ 500 MB** | 3. yılda ≈ 1,3 GB |

### 2.2 Süreler — 81 MB'lık `receteler` bloğu

| İşlem | Süre | Ne zaman olur |
|---|---:|---|
| `JSON.parse` | **1.232 ms** | her sayfa açılışında |
| `JSON.stringify` | **2.761 ms** | her kayıt işleminde |
| Tek reçeteyi bulma | 24 ms | — |
| Tüm kalemleri gezme | 101 ms | maliyet hesabı |
| **Tek kayıt güncelleme (oku+değiştir+yaz)** | **≈ 3.600 ms** | her upsert |

Bu süreler tek kullanıcı içindir ve **yazma kilidi altında sıraya girer** —
ikinci kullanıcı beklemek zorundadır.

### 2.3 Bellek (tahmin)

PHP'de `json_decode` tipik olarak JSON boyutunun **6–8 katı** RAM ister:

| Blob | Gereken RAM |
|---|---:|
| 81 MB (reçeteler) | ~570 MB |
| 125 MB (yarı mamül) | ~875 MB |
| 138 MB (fatura) | ~970 MB |

Paylaşımlı hostingde `memory_limit` genelde **128–256 MB**'dır.
Yani bu blob'lar açılmadan **"Allowed memory size exhausted" hatası** verir.
Pratikte sistem, ölçek büyüdükçe bir noktada tamamen açılmaz hale gelir.

### 2.4 Trafik

| | Mevcut mimari | Satır bazlı mimari |
|---|---:|---:|
| Tek fatura kaydetme | 138 MB oku+yaz | ~4 KB |
| Fatura listesi (50 kayıt) | 138 MB | ~60 KB |
| Tek reçete açma | 81 MB | ~3 KB |
| **Günlük toplam** | **~277 GB** | **~125 MB** |

Aradaki fark ~2.000 kat. Bu, bant genişliği faturasından önce
**sunucunun disk ve CPU'sunu** bitirir.

---

## 3. Neden Bugün Çalışıyor da Yarın Çalışmayacak

Maliyet kayıt sayısıyla **doğrusal değil, çarpan etkisiyle** büyür:
her yazma işlemi tüm koleksiyonu okur-yazar. Kayıt sayısı 10 katına çıkınca
tek işlemin maliyeti de 10 katına çıkar; işlem sayısı da arttığı için
toplam yük **100 katına** çıkar.

Aşağıdaki tablo **ölçülmüştür** (aynı veri şekliyle, tek makinede):

| Reçete | Blob | parse | stringify | Tek upsert | PHP RAM (tahmin) | Durum |
|---:|---:|---:|---:|---:|---:|---|
| 500 | 1 MB | 20 ms | 27 ms | **47 ms** | ~7 MB | ✅ akıcı |
| 5.000 | 10 MB | 175 ms | 203 ms | **378 ms** | ~71 MB | ⚠️ fark edilir |
| 20.000 | 41 MB | 940 ms | 1.493 ms | **2,4 sn** | ~285 MB | ❌ rahatsız edici |
| 40.000 | 81 MB | 1.233 ms | 2.317 ms | **3,6 sn** | ~570 MB | ⛔ PHP bellek hatası |

Node.js süreleridir; PHP'de 2–5 kat daha yavaş olması beklenir. Yani 40.000
reçetede tek kayıt güncelleme pratikte **7–18 saniye** sürer — üstelik bu süre
boyunca yazma kilidi diğer kullanıcıları bekletir.

---

## 4. Gerekli Mimari Değişiklik

### 4.1 İlke

Veri, **kayıt başına satır** olarak saklanmalı; sorgular veritabanında
filtrelenmeli, sayfalanmalı ve yalnızca gerekli alanlar taşınmalıdır.
İstemci artık "tüm koleksiyonu indir, JavaScript'te filtrele" yapmamalıdır.

### 4.2 Örnek şema (MySQL / MariaDB — cPanel'de hazır gelir)

```sql
-- Ana kayıtlar: her belge/kart AYRI SATIR
CREATE TABLE receteler (
  id            VARCHAR(40)  PRIMARY KEY,
  sahip_tip     ENUM('urun','yarimamul','altmontaj','paket') NOT NULL,
  sahip_id      VARCHAR(40)  NOT NULL,
  ad            VARCHAR(255),
  guncelleme    DATETIME     NOT NULL,
  INDEX ix_sahip (sahip_tip, sahip_id)     -- reçete bulma: O(log n)
) ENGINE=InnoDB;

-- Kalemler AYRI TABLO: 800.000 satır sorun değil, 800.000 elemanlı JSON sorun
CREATE TABLE recete_kalemleri (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  recete_id     VARCHAR(40) NOT NULL,
  sira          SMALLINT    NOT NULL,
  tip           VARCHAR(20) NOT NULL,
  ref_id        VARCHAR(40) NOT NULL,
  miktar        DECIMAL(14,4) NOT NULL,
  birim         VARCHAR(10),
  olcu_json     JSON NULL,          -- plaka ölçüsü + kenar bandı (nadir, esnek)
  INDEX ix_recete (recete_id),
  INDEX ix_ref (tip, ref_id),        -- "bu hammadde nerelerde kullanılıyor"
  FOREIGN KEY (recete_id) REFERENCES receteler(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE faturalar (
  id            VARCHAR(40) PRIMARY KEY,
  no            VARCHAR(32) UNIQUE,
  cari_id       VARCHAR(40) NOT NULL,
  tarih         DATE NOT NULL,
  durum         VARCHAR(20),
  genel_toplam  DECIMAL(16,2),
  INDEX ix_tarih (tarih),            -- tarih aralığı sorguları
  INDEX ix_cari (cari_id, tarih)     -- cari ekstresi
) ENGINE=InnoDB;

CREATE TABLE fatura_kalemleri (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fatura_id VARCHAR(40) NOT NULL,
  urun_id   VARCHAR(40),
  miktar    DECIMAL(14,4),
  birim_fiyat DECIMAL(14,4),
  kdv_orani DECIMAL(5,2),
  INDEX ix_fatura (fatura_id),
  FOREIGN KEY (fatura_id) REFERENCES faturalar(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

### 4.3 API değişikliği

Bugünkü `?action=get&key=faturalar` (her şeyi döndür) yerine:

```
GET  api.php?action=liste&tip=fatura&tarih1=2026-07-01&tarih2=2026-07-31
     &sayfa=1&adet=50&sirala=tarih_desc
GET  api.php?action=kayit&tip=fatura&id=FT-123        → tek belge + kalemleri
POST api.php?action=kaydet&tip=fatura                 → tek belge yazar
GET  api.php?action=ara&tip=urun&q=nil+yesil&adet=20  → otomatik tamamlama
```

Kritik nokta: **arama ve filtreleme sunucuda** yapılmalı. 40.000 ürünlü
kalem seçici bugün tüm listeyi indiriyor; sunucu tarafı aramada 20 sonuç döner.

### 4.4 Hangi koleksiyonlar taşınmalı

**Mutlaka (büyüyenler):**
`receteler`, `recete_kalemleri`, `faturalar`, `irsaliyeler`, `yarimamuller`,
`urunler`, `siparisler`, `istasyonIsleri`, `lotHareketleri`, `stokHareketleri`,
`eFaturalar`, `cariHareketler`

**Kalabilir (küçük ve sabit — JSON blob sorun değil):**
`ayarlar`, `rotalar`, `hatlar`, `kullaniciler`, `firmaBilgileri`, `vardiyalar`,
`isgRiskler`, `kontrolPlanlari`, dolap/masa tasarım şablonları

Yani **tüm sistemi değil, ~12 koleksiyonu** taşımak yeterli.

---

## 5. Sunucu / Hosting İhtiyacı

**Paylaşımlı hosting bu iş için yeterli değildir.** Sebep: `memory_limit`,
`max_execution_time` ve I/O kotaları. En az bir VPS gerekir.

### Önerilen başlangıç (1–3 yıl)

| Bileşen | Öneri | Gerekçe |
|---|---|---|
| Sunucu | VPS, **4 vCPU / 8 GB RAM** | PHP-FPM + MariaDB aynı makinede |
| Disk | **NVMe SSD 100 GB** | 3 yılda ~1,3 GB veri + indeks + yedek + dosyalar |
| Veritabanı | **MariaDB 10.6+ / MySQL 8** | InnoDB satır kilidi (SQLite dosya kilitler) |
| PHP | **8.2+, OPcache açık**, `memory_limit 512M` | |
| Web sunucu | Nginx + PHP-FPM (8–16 worker) | |
| Yedek | Günlük tam + saatlik artımlı, **site dışında** | |
| SSL | Let's Encrypt | |

**Aylık maliyet beklentisi:** orta seviye bir VPS 15–40 € bandındadır.

### Neden SQLite değil

SQLite tek dosyaya yazar ve **yazma sırasında tüm veritabanını kilitler**.
Günde ~2.000 yazma (fatura + irsaliye + iş emri + hat hareketi) ve eşzamanlı
10–20 kullanıcıda bu kilit sıraya girer. MariaDB satır seviyesinde kilitler.
SQLite geliştirme ve tek kullanıcı için mükemmeldir; bu ölçekte değil.

### Eşzamanlı kullanım

Hesaplanan yük: günde ~2.050 yazma işlemi, yoğun saatte saniyede ~0,15.
Bu, doğru mimariyle **çok rahat** bir yüktür — 4 vCPU fazlasıyla yeter.
Sorun yükün büyüklüğü değil, **her işlemin bugün 138 MB dokunması**.

---

## 6. Geçiş Planı (kademeli — sistem çalışırken)

Hepsini birden değiştirmek risklidir. Önerilen sıra:

**Aşama 0 — Ölçüm (1 gün)**
Gerçek veritabanınızdaki koleksiyon boyutlarını çıkar. Hangi koleksiyon
kaç MB, hangisi kritik — plan buna göre kesinleşir.

**Aşama 1 — Veritabanı motoru (2–3 gün)**
SQLite → MariaDB. Şema aynı kalır (`kv_store`), sadece motor değişir.
Kod değişikliği minimum, kazanç: kilit davranışı ve dayanıklılık.

**Aşama 2 — Belgeler satır bazlı (1–2 hafta)**
`faturalar`, `irsaliyeler`, `siparisler` gerçek tablolara taşınır.
En büyük kazanç burada: günlük yazma yükünün %90'ı bu üç koleksiyonda.

**Aşama 3 — Reçete ve kartlar (1–2 hafta)**
`receteler` + `recete_kalemleri`, `urunler`, `yarimamuller`.
Kalem seçici ve reçete ağacı sunucu taraflı aramaya geçer.

**Aşama 4 — Üretim sahası (3–5 gün)**
`istasyonIsleri`, `lotHareketleri`. Hat terminali en sık yazan modüldür.

**Aşama 5 — Arşivleme (sürekli)**
2 yıldan eski fatura/irsaliye `arsiv_*` tablolarına taşınır.
Aktif tablolar küçük kalır, raporlar arşivi de okuyabilir.

Her aşamada eski ve yeni yol bir süre **birlikte** çalışabilir; geri dönüş
her zaman mümkün olur.

---

## 7. Şimdi Yapılabilecek Hızlı İyileştirmeler

> **DURUM (bu sürümde uygulandı):** aşağıdaki 4, 5 ve ek olarak listede
> olmayan üç kaynak koruması koda girdi. Ayrıntı için bölüm 7b'ye bakın.
> Blob → tablo geçişi (bölüm 4) **hâlâ yapılmadı**.

Mimari değişiklik beklerken nefes aldıracak, düşük riskli adımlar:

1. **Reçete kalemlerindeki tekrarları temizle.** (Araç zaten eklendi.)
   Tespit edilen örnekte 36 satırın 31'i gereksizdi — %86 küçülme.
2. **`gorseller` alanlarını blob'dan çıkar.** Base64 görseller JSON'u
   şişirir. Görseller zaten sunucuda dosya olarak duruyor; karta yalnızca
   referans yazılmalı.
3. **Eski belgeleri arşiv koleksiyonuna al.** Kapanmış yıl faturalarını
   `faturalar_2025` gibi ayrı bir anahtara taşımak aktif blob'u küçültür.
4. **Sunucu tarafı `gzip`/`brotli` sıkıştırma aç.** JSON çok iyi sıkışır
   (~%85). Trafiği düşürür ama parse/bellek sorununu çözmez.
5. **`memory_limit` ve `max_execution_time` yükselt.** Zaman kazandırır,
   sorunu ertelemekten öteye gitmez.

> Bu beş madde ölçeği **~5.000–8.000 reçeteye** kadar taşır.
> 40.000 için 4. bölümdeki değişiklik zorunludur.

---

## 7b. Bu Sürümde Gerçekten Uygulananlar

Aşağıdakiler koda girdi ve `php testler/calistir.php` ile test altına alındı
(`testler/03_bakim_test.php`, 16 kontrol).

| # | Ne yapıldı | Nerede | Ölçülen etki |
|---|---|---|---|
| 1 | `memory_limit 512M`, `max_execution_time 120` | `api.php` başı | Sınır artık açıkça belirli, sunucu ayarına bağımlı değil |
| 2 | **Bellek bekçisi**: ölümcül bellek hatası artık boş yanıt değil, `507` + anlaşılır JSON döner | `api.php` `register_shutdown_function` | Kullanıcı "sunucu bozuk" yerine gerçek sebebi görür |
| 3 | **Günlük bakım**: `audit_log` + `sayfa_ziyaretleri` budanır, `VACUUM` çalışır | `api.php` `gunlukBakim()` | Test verisinde **9,81 MB → 2,02 MB** |
| 4 | `onceki_deger` tavanı 1,5 MB → **256 KB** | `api.php` `auditYaz()` | Günlük denetim büyümesi ~6× azalır |
| 5 | Denetim/oturum tablolarına **indeks** | `api.php` `db()` | Tam tablo taraması kalktı |
| 6 | **gzip/brotli sıkıştırma** + statik dosya önbelleği | `.htaccess` | JSON ~%85 sıkışır |
| 7 | İstemci snapshot'ı tam JSON yerine **parmak izi** tutar | `storage.js` | Kayıt başına **~123× küçük**; tarayıcı RAM'i ~yarıya iner |
| 8 | **Görseller blob'dan çıkarıldı**: base64 yerine sunucu referansı | `qr_dosya.js`, `app.js`, `page_kartlar.js`, `page_yarimamul.js`, `dolap_tasarim.js` | Kart içindeki görsel **1.092.322 → 85 bayt** |
| 9 | İkili dosya indirmelerinde sıkıştırma kapatıldı | `api.php` `dosyaIndir` | 6. maddenin ikili dosyaları bozmasını önler |

### 8. maddenin ayrıntısı — asıl kazanç burada

Sistemde görselleri sunucuya yükleyen bir mekanizma **zaten vardı**, ama
yükledikten sonra kartın içindeki ağır base64 kopyasını **silmiyordu**. Yani
aynı fotoğraf hem diskte hem koleksiyon JSON'unun içinde duruyordu ve o
koleksiyona yapılan her okuma/yazmada baştan sona taşınıyordu.

Artık yükleme doğrulandıktan sonra `dataUrl` karttan siliniyor; yerine
`{name, sunucuId, r, k, uzanti}` referansı kalıyor. Görüntüleme
`QrDosya.gorselUrl()` ile sunucudan yapılıyor.

Ölçüm (kartların %30'unda 600 KB fotoğraf):

| Kart | ÖNCE (gömülü) | SONRA (referans) |
|---:|---|---|
| 500 | 130,6 MB · stringify 5.549 ms · PHP RAM ~783 MB | 0,1 MB · 1 ms · ~1 MB |
| 1.000 | 261,1 MB · stringify 10.166 ms · PHP RAM ~1.567 MB | 0,2 MB · 2 ms · ~1 MB |
| 2.000 | **serileştirilemiyor** (dizi sınırı aşılıyor) | 0,4 MB · 6 ms · ~3 MB |
| 5.000 | **serileştirilemiyor** | 1,1 MB · 9 ms · ~6 MB |

Yani **500 kart bile** gömülü fotoğraflarla 1 GB'lık sunucuyu tek başına
düşürüyordu. Bu, bu sürümdeki en büyük tek kazançtır.

**Göç:** açılışta bir kez çalışır (`gorsellerBlobdanCikarildi` bayrağı).
Bir görselin base64'ü, ancak sunucuda o dosyanın gerçekten durduğu
DOĞRULANDIKTAN sonra silinir. Doğrulanamayan görsele dokunulmaz ve bayrak
yazılmaz — bir sonraki açılışta kalanlar tekrar denenir.

**Geriye uyumluluk:** göç etmemiş eski kayıtlar (`dataUrl` taşıyanlar)
gösterilmeye devam eder; `gorselUrl()` iki biçimi de tanır.

**Bakım politikası:** denetim kayıtlarının *izi* (kim/ne zaman/ne) korunur;
yalnızca 30 günden eski kayıtların ağır `onceki_deger` içeriği boşaltılır.
Yani **geri alma son 30 gün için çalışmaya devam eder**. Satır tavanları:
`audit_log` 50.000, `sayfa_ziyaretleri` 90 gün / 200.000.

**Parmak izi takası (dürüst not):** fark alma artık içerik yerine 53-bit çift
karma + uzunluk karşılaştırıyor. Teorik çakışmada bir değişiklik
"değişmemiş" sayılabilir. 200.000 gerçekçi kayıtla tarandı, çakışma
bulunmadı; ama bu bir olasılık azaltmadır, matematiksel imkânsızlık değildir.

### Bunlar yapılmadı (bilinçli olarak)

- **Blob → ilişkisel tablo geçişi** (bölüm 4). Asıl çözüm budur; yukarıdakiler
  yalnızca nefes aldırır.
- **Sayfalama / sunucu tarafı arama uçları** (bölüm 4.3). Kalem seçici hâlâ
  koleksiyonun tamamını indiriyor.
- **SQLite → MariaDB** (Aşama 1).
- **Arşivleme** (Aşama 5).
- **Kalite ve sevkiyat fotoğrafları** hâlâ base64 olarak kaydın içinde
  duruyor (`page_kalite_panel.js`, `page_yukleme_onay.js`). Bunlar kart
  görsellerinden ayrı bir yapı; aynı yöntemle taşınmalı. Sıradaki en büyük
  kazanç budur.

> Bu yedi madde ölçeği bölüm 3'teki tabloda **~5.000–8.000 reçete** bandında
> tutar. 40.000 hedefi için bölüm 4 zorunludur — bu sürüm o hedefe
> ulaştırmaz, sadece mevcut ölçekte sunucunun çökmesini engeller.

---

## 8. Dürüst Sınırlar

- Süre ölçümleri **Node.js** ile alındı. PHP'de `json_decode`/`json_encode`
  daha yavaştır; gerçek sunucudaki süreler **daha kötü** olacaktır.
- Bellek çarpanı (6–8×) genel kabul gören bir yaklaşımdır, sizin sunucunuzda
  ölçülmedi.
- Yarı mamül sayısı (400.000) dolap modülünün ürün başına ~10 panel kartı
  açması varsayımına dayanır. Özel ürünlerde bu sayı daha yüksek olabilir.
- **Mimari** değişiklik (blob → tablo) henüz uygulanmadı; bu belgenin 4. ve
  6. bölümleri hâlâ birer plandır. Uygulanan tek şey 7b'deki kaynak
  korumalarıdır — bunlar mimariyi değiştirmez, yalnızca mevcut mimarinin
  sunucuyu düşürmesini engeller.
- 7b'deki "9,81 MB → 2,02 MB" ölçümü **sentetik test verisinde** alındı;
  sizin gerçek veritabanınızdaki kazanç, denetim tablosunun ne kadar şiştiğine
  bağlı olarak farklı çıkar.
- `memory_limit 512M` seçimi 1 GB'lık sunucuda **tek PHP işçisi** varsayar.
  PHP-FPM'de 4 işçi çalışıyorsa ve hepsi aynı anda ağır istek alırsa sunucu
  yine takılır; işçi sayısını 2–3'te tutmak gerekir.

---

## 9. v37 — Ölçü, Hacim (m³) ve Ağırlık Bilgisi

### Önceden var olanlar (yeniden yazılmadı)
Paket kartlarında `en`/`boy`/`yukseklik`/`netAgirlik`/`brutAgirlik` alanları,
canlı desi–m³ hesabı, `urunPaketOzeti` toplama fonksiyonu ve teklif/sipariş
satırlarındaki paket özeti **zaten mevcuttu**.

### Bulunan iki gerçek hata

1. **Teklif ve sipariş toplamları elle girilen değerleri yok sayıyordu.**
   Toplama fonksiyonları doğrudan `urunPaketOzeti` çağırıyordu; kullanıcının
   ürün kartına girdiği ölçü teklifte hiç görünmüyordu.
2. **`paketOzetMetni` koli sayısı 0 ise boş dönüyordu.** Paket kalemi olmayan
   ama elle ölçü girilmiş üründe hacim/ağırlık hiç görünmüyordu.

### Eklenenler

| Nerede | Ne |
|---|---|
| `app.js` | `olculerdenHacim`, `elleOlcuVarMi`, `olcuAgirlikCoz`, `olcuOzetMetni`, `olcuKaynakRozeti` — formülün TEK kaynağı |
| Ürün kartı formu | En/boy/yükseklik/net/brüt alanları + canlı m³ ve desi |
| Reçete ağaç ekranı | Aynı alanlar, taslak mantığıyla düzenlenebilir |
| Kart detayı | Ölçü, hacim, desi, net/brüt, koli + kaynak rozeti |
| Maliyet kartı | Hacim, brüt ağırlık, **₺/m³** ve **₺/kg** KPI'ları |
| Fiyat listesi | "Hacim / Ağırlık" kolonu + TOPLAM satırında toplamlar |
| Teklif ve sipariş | Toplam kutusu alt alta dökümlü (koli, hacim, desi, net, brüt) |
| Üretim paneli | Paket onay tablosunda ölçü/hacim/ağırlık + reçeteye göre toplam |
| Sevkiyat paneli | Aynı kolon + "Sevkiyat Toplamı" kutusu |

### Öncelik kuralı

Elle girilen değer varsa **o** kullanılır; yoksa reçetedeki paket
kalemlerinden hesaplanır. İkisi de doluysa ve farklıysa **uyarı gösterilir** —
sessizce birini gizlemek yanlış navlun/yükleme hesabına yol açar. Her ekranda
"elle" / "reçete" rozeti hangi verinin kullanıldığını belirtir.

**Birimler:** en/boy/yükseklik **cm**, ağırlıklar **kg**.
`desi = (en×boy×yük)/3000`, `m³ = (en×boy×yük)/1.000.000`.
Hacim türetilmiş değerdir, **saklanmaz** — her gösterimde yeniden hesaplanır
ki ölçü değişince hacim eskimiş kalmasın.

### Testler
`testler/olcu_agirlik_test.js` — 81 kontrol. Formül doğruluğu, öncelik kuralı,
miktar çarpanı, iç içe reçete toplama, kısmi giriş, bozuk girdi, formülün
başka dosyalarda kopyalanmadığı ve geçersiz JS kaçış dizisi olmadığı dahil.

### Yapılmayanlar
- **Yarı mamül ve alt montaj kartlarında** bu alanlar yok. Talep "ürün
  kartları" olduğu için ürün ve pakete eklendi; gerekiyorsa aynı desenle
  eklenebilir.
- Teklif/sipariş **PDF ve Excel çıktılarında** toplamlar henüz yok; yalnızca
  ekranda görünüyor.

---

## 10. v38 — Çeki Listesi ve İki Maliyet Hatası

### Düzeltilen hata 1: Rota maliyeti fiyat listesine girmiyordu

`page_fiyat.js` içindeki `bomMaliyetHesapla`, `App.urunMaliyetHesapla`'ya rota
listesini **boş dizi** olarak geçiyordu. Eksik kalan işçilik, ayrı bir
`rotaMaliyetHesapla` ile telafi edilmeye çalışılıyordu ama o fonksiyon
**yalnızca yarı mamül kalemlerine** bakıyordu. Sonuç olarak şunlar kayboluyordu:

- Ürünün **kendi** rotası
- **Alt montaj** ve **paket** kartlarındaki rotalar
- İç içe reçetelerdeki rotalar

Aynı dosyadaki `otomatikHesaplaVeKaydet` yolu gerçek rota listesini geçiyordu;
yani otomatik hesap ile manuel hesap **farklı sonuç üretiyordu**. Artık her iki
yol da `App.kartMaliyetHesapla` üzerinden tüm ağacı tek seferde hesaplıyor.
Rota payı ayrıca raporlanıyor ama maliyete ikinci kez eklenmiyor.

### Düzeltilen hata 2: Kargo hammadde birim fiyatına yansımıyordu

Nakliye bedeli `nakliyeBedelTRY / miktar` ile adede bölünüyordu — bu kısım
doğruydu. Sorun sonrasındaydı: sonuç doğrudan `hm.birimFiyat`'ın **içine**
toplanıyordu. Üç sonucu vardı:

1. Fiyatın ne kadarı mal, ne kadarı kargo — **görünmüyordu**.
2. Kullanıcı hammadde kartından fiyatı elle güncelleyince kargo payı
   **sessizce siliniyordu**.
3. Yalnızca "fiyatı güncelle" kutusu işaretliyse uygulanıyordu; kutu
   kapalıysa kargo maliyete **hiç girmiyordu**.

Artık kargo payı `nakliyeBirimMaliyeti` adlı **ayrı ve kalıcı** bir alanda
durur. Hammadde kartında görünür ve elle düzenlenebilir. Maliyetin her
noktası `App.hammaddeBirimFiyatTRY()` üzerinden geçer (6 çağrı noktası);
kargoyu atlayan tek bir hesap kalmamıştır.

### Yeni: Çeki Listesi (Packing List)

Teklif detayında **📋 Çeki Listesi** düğmesi. Reçetede tanımlı her paket
**satır satır** açılır:

| Sütun | Açıklama |
|---|---|
| Paket kodu / adı / ambalaj | Reçeteden gelen paket kartı |
| Adet | Sipariş miktarıyla çarpılmış koli adedi |
| Ölçü (cm) | en × boy × yükseklik |
| Birim m³ / Birim brüt kg | Tek koli için |
| Toplam m³ / desi / net kg / brüt kg | O satırdaki tüm koliler için |

Satırlar ürüne göre gruplanır, altta genel toplam ve sevkiyat özeti bulunur.
**Yazdır** ve **Excel'e Aktar** düğmeleri vardır.

Ölçüsü girilmemiş paketler listede kalır ama hacim **0 gösterilir ve uyarı
verilir** — uydurma değer üretilmez. Paket kalemi olmayan üründe, ürün
kartındaki elle ölçü tek satır olarak kullanılır.

### Yeni: Ağaç görünümünde paket ölçü düğmesi

Reçete ağacındaki **paket** satırlarına düğme eklendi. Ölçü/ağırlık eksikse
uyarı rengiyle "⚠ Hacim/Ağırlık Ekle", doluysa mevcut değeri gösterir
(örn. "📐 0,200 m³ · 12,0 kg"). Tıklayınca ölçü penceresi açılır; değişiklik
taslağa işlenir, kalıcı olması için "✓ Reçete Olarak Kaydet" gerekir.

### Testler
`testler/olcu_agirlik_test.js` — 127 kontrol (öncesi 81). Çeki listesi
matematiği, ölçüsüz paket uyarısı, elle ölçüye düşme, çok kalemli teklif,
kargo bölme ve rota düzeltmeleri dahil.

### Sipariş modülünde de çeki listesi
Sipariş detayına aynı düğme eklendi. Ekran **kopyalanmadı** — teklif
modülündeki `cekiListesiAc` dışa açılıp oradan çağrılıyor, böylece ileride
yapılacak bir düzeltme iki yerde ayrı ayrı uygulanmak zorunda kalmıyor.
