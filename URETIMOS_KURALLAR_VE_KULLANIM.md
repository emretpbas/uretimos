# ÜretimOS — Kurallar ve Kullanım Kılavuzu

Bu belge, ÜretimOS'un **iş kuralları, veri modeli ve kullanım şeklini** tek bir
yerden anlatmak için hazırlandı — amaç, sistemin herhangi bir kişiye (veya
yapay zekâya) bağımlı kalmadan anlaşılıp sürdürülebilmesidir.

Kapsam notu (dürüstlük ilkesiyle): ÜretimOS, üretimden satışa, muhasebeden
İK'ya onlarca modülü olan büyük bir sistemdir (`page_*.js` dosyalarının
sayısı 100'ü aşıyor). Bu belge, **çekirdek veri modelini, kart/reçete
sistemini, yetkilendirmeyi ve SolidWorks entegrasyonunu** derinlemesine,
doğrulanmış kod okumasına dayanarak anlatır — bunlar sistemin omurgasıdır ve
diğer tüm modüller bu omurga üzerine kuruludur. Diğer modüller (§10'da
haritalanmıştır) dosya adlarından çıkarılabilen kısa açıklamalarla
listelenmiştir; her birinin kendi iş kurallarının tam dökümü bu belgenin
kapsamı DIŞINDADIR — gerektiğinde aynı yöntemle (ilgili `page_*.js` dosyası
okunarak) ayrı bir bölüm olarak eklenebilir.

Kurulum, güvenlik ve yedekleme gibi operasyonel konular zaten ayrı, güncel
belgelerde var — bu belge onları TEKRARLAMAZ, ilgili yerlerde referans verir:
`KURULUM.md`, `VPS_KURULUM.md`, `GUVENLIK_DENETIMI.md`,
`GUVENLIK_SERTLESTIRME.md`, `YEDEKLEME_KURULUM.md`, `MUHENDISLIK_STANDARDI.md`,
`OLCEKLEME_PLANI.md`.

---

## İçindekiler

1. [Genel Bakış](#1-genel-bakış)
2. [Sistem Mimarisi](#2-sistem-mimarisi)
3. [Veri Modeli ve Temel Kavramlar](#3-veri-modeli-ve-temel-kavramlar)
4. [Kullanıcılar ve Yetkilendirme](#4-kullanıcılar-ve-yetkilendirme)
5. [Reçete (BOM) Kuralları](#5-reçete-bom-kuralları)
6. [Kısmi ve Tam Sıfırlama Kuralları](#6-kısmi-ve-tam-sıfırlama-kuralları)
7. [Yedekleme](#7-yedekleme)
8. [SolidWorks Eklentisi (UretimOSKesim)](#8-solidworks-eklentisi-uretimoskesim)
9. [Entegrasyon Kısıtları (LOGO / Cost)](#9-entegrasyon-kısıtları-logo--cost)
10. [Modül Haritası](#10-modül-haritası)
11. [İlgili Diğer Belgeler](#11-ilgili-diğer-belgeler)

---

## 1. Genel Bakış

ÜretimOS, mobilya/ahşap üretimi yapan bir işletme (Doxa/Creavit markaları)
için geliştirilen; ürün/reçete yönetiminden satışa, satınalmaya, üretim
planlamaya, muhasebeye ve İK'ya kadar uzanan **özel (in-house) bir ERP
sistemidir.** Tek bir kişi tarafından, büyük ölçüde yapay zekâ destekli
geliştirme ile inşa edilmiştir — bu, `MUHENDISLIK_STANDARDI.md`'nin de
vurguladığı gibi hem bir güç hem bir risktir (bkz. §9 ve bu belgenin amacı).

İki çalışma modu vardır (bkz. `KURULUM.md`):
- **Yerel/tek bilgisayar modu** — veri tarayıcının `localStorage`'ında tutulur,
  tek kullanıcı/tek makine için.
- **Sunucu modu (PHP + SQLite)** — `api.php` + `data.sqlite` ile çok
  kullanıcılı, ağ üzerinden erişilebilir kurulum (bkz. `VPS_KURULUM.md`).

## 2. Sistem Mimarisi

```
index.html          → tek sayfa uygulama (SPA) kabuğu, menü/oturum/sekme yönetimi
app.js               → uygulama çekirdeği (oturum, genel yardımcılar, sekme yönlendirme)
storage.js           → veri erişim katmanı ("Store" — get/set/patch/delete, kısmi/tam sıfırlama)
api.php              → sunucu modunda TEK API ucu (action parametresiyle yönlendirilir), kimlik doğrulama, yetkilendirme, denetim kaydı
data.js              → ilk kurulum "seed" verisi + VARSAYILAN_AYARLAR (bkz. §3.6)
page_*.js            → her biri BİR ekranı/modülü temsil eden bağımsız dosyalar (bkz. §10)
sw.js                → PWA service worker (çevrimdışı önbellek; güncelleme sonrası Ctrl+Shift+R gerekir)
solidworks_addin/    → ayrı bir .NET projesi, SolidWorks içinde çalışan COM eklentisi (bkz. §8)
```

Veri, `storage.js`'in tek bir `Store` nesnesi üzerinden okunur/yazılır; her
"koleksiyon" (`urunler`, `receteler`, `hammaddeler`, `faturalar` vb.)
sunucu modunda `data.sqlite`'ta `kv_store` tablosunda **tek bir JSON metni**
olarak saklanır (bkz. `OLCEKLEME_PLANI.md` — bu, bilinen bir ölçeklenme
sınırıdır, büyük veri hacimlerinde yeniden mimarilendirme gerekecektir).

## 3. Veri Modeli ve Temel Kavramlar

### 3.1 Kart tipleri

| Tip | Koleksiyon | Açıklama |
|---|---|---|
| Ürün | `urunler` | Bitmiş/satılabilir ürün — reçetenin en üst kalemi |
| Yarı Mamül | `yarimamuller` | Ara işlenmiş parça (ör. bir dolap yan paneli); kendi rotası (hat/makine/süre) olabilir |
| Alt Montaj | `altMontajlar` | Birden çok kalemi bir araya getiren ara birleşim |
| Paket | `paketler` | Sevkiyat/ambalaj birimi (koli, kutu vb.) — ambalaj ölçüsü/ağırlığı taşır |
| Hammadde | `hammaddeler` (tek koleksiyon, `tip` alanıyla ayrışır) | `plaka`, `kenar_bandi`, `hirdavat`, `sarf` alt tipleri |

Her kartın bir **`kod`** (hammaddede `stokKodu`) ve **`ad`** alanı vardır.
Kod, sistemin her yerinde (reçete kalemleri, SolidWorks eşleştirmesi, XML
dışa aktarma) birincil kimliktir — **kodu olmayan bir kart yoktur.**

### 3.2 Reçete (BOM)

`receteler` koleksiyonu, her kartın **kendi** reçetesini tutar (`kalemler`
dizisi). Bir kalem `{ tip, refId, miktar, birim, ... }` şeklindedir ve
`refId` ile başka bir karta işaret eder — bu, **çok katmanlı (alt kırılımlı)**
bir ağaç oluşturur: bir ürünün reçetesindeki bir yarı mamül kaleminin KENDİ
reçetesi de olabilir, o da açılıp gösterilir.

Sonsuz döngüye karşı derinlik sınırı vardır — **TAHMİN/otomatik döngü tespiti
YAPILMAZ, yalnızca bir güvenlik tavanıdır:**
- Web tarafı (`page_recete_agac.js`, XML dışa aktarma): 12 seviye.
- SolidWorks eklentisi tarafı: 6 seviye.

### 3.3 Rota (Hat/Makine/Süre)

`rotalar` koleksiyonu, bir yarı mamül/paketin **hangi hatlardan, hangi
makinelerde, ne kadar sürede** geçtiğini tanımlar (`hatlar` koleksiyonundaki
hat/makine galerisine referansla). İşçilik maliyeti, rota adımlarındaki süre
× `saatlikIscilikUcreti` ayarından hesaplanır (bkz. §3.6).

### 3.4 Sınıflandırma ("Sınıf")

SolidWorks tarafında (ve kavramsal olarak web tarafında da) her bileşen bir
**Sınıf**'a atanır — bu, hangi kart tipiyle eşleştirileceğini belirler:

```
hirdavat | plaka | kenar_bandi | sarf | yarimamul | altmontaj | paket | urun
```

### 3.5 Geçici (TMP_) kodlar

SolidWorks'ten "+ Yeni Kart Oluştur" ile anlık oluşturulan kartlar, ERP'de
(LOGO) henüz karşılığı olmayabilir. Bu kartlar, kaydedilirken isteğe bağlı
olarak **`TMP_` öneki** alır (bkz. §8.5) — amaç, bu geçici kartları gerçek
ERP kodlu kartlardan ayırt edilebilir kılmak, böylece sonradan gerçek koda
dönüştürülmeleri takip edilebilsin (bkz. §9 — bu, IT/BT tarafının talebiydi).

### 3.6 Genel ayarlar (`VARSAYILAN_AYARLAR`, `data.js`)

Fiyatlama/maliyet hesaplarının TÜMÜ bu merkezi ayarlardan beslenir
(Yönetim → Ayarlar ekranından değiştirilebilir):

| Ayar | Varsayılan | Ne için kullanılır |
|---|---|---|
| `saatlikIscilikUcreti` | 500 ₺/saat | Rota süresinden işçilik maliyeti |
| `amortismanYuzde` | %4 | Kart bazlı amortisman gideri |
| `genelYonetimYuzde` | %8 | Genel yönetim gider payı |
| `testereKayipPayiMM` / `frezeKayipPayiMM` | 4 / 3 mm | Kesim payı (nesting/kesim listesi hesaplarında) |
| `plakaKenarBosluguMM` | 10 mm | Plaka kenar boşluğu |
| `fiyatGygYuzde` / `fiyatNakliyeYuzde` / `fiyatKarYuzde` / `fiyatBoluKatsayisi` | 10 / 7 / 54 / 0.45 | Liste fiyatı formülü: `(Net Maliyet × (1+GYG%) × (1+Nakliye%) × (1+Kâr%)) / bölüKatsayısı` |
| Bordro/SGK parametreleri | (2026 değerleri) | Bakım/İK bordro modülü |
| `ciftOnayTutarEsigi` | 50.000 ₺ | Bu tutarın üstü malzeme talepleri İKİNCİ bir onay ister |

## 4. Kullanıcılar ve Yetkilendirme

Roller (`api.php`), iki grupta:

**Özel roller:**
- **`yonetim`** — tam yetki (tüm koleksiyonları okur/yazar), self-servis
  talep EDİLEMEZ (yalnızca mevcut bir yönetim hesabı yeni yönetim/cad hesabı
  açabilir).
- **`cad_entegrasyon`** — SolidWorks eklentisinin kullandığı kimlik. Yazma
  yetkisi **yalnızca şu koleksiyonlarla sınırlıdır**
  (`CAD_ENT_YAZILABILIR`): `yarimamuller`, `paketler`, `urunler`,
  `receteler`, `rotalar`, `hatlar`. `hammaddeler` bu eklenti için **salt
  okunurdur** — eklenti mevcut plaka/hırdavat/kenar bandı kartlarını SEÇER,
  bu master veriyi asla değiştirmez/oluşturmaz (yanlışlıkla ya da sızmış bir
  kimlik bilgisiyle fiyat/tanım bozulmasını önlemek için).

**Talep edilebilir departman rolleri** (`TALEP_EDILEBILIR_ROLLER`):
`arge`, `teknik_ofis`, `satinalma`, `uretim_planlama`, `depo`, `cari`,
`teklif_siparis`, `satis`, `sevkiyat`, `muhasebe`, `kalite`, `uretim`,
`isg`, `ik`, `bakim`, `pazarlama`.

Bazı hassas koleksiyonlar (ör. `bankaKredileri`, `hatSifreleri`,
`hatOperatorleri`) yalnızca belirli rollerle sınırlıdır — tam erişim
haritası `api.php` içindeki yetki tablolarındadır.

Şifre sıfırlama: yönetim herkesinkini, diğer roller yalnızca kendi
şifresini değiştirebilir. Denetim kaydı (kim/ne zaman/ne yaptı) yalnızca
`yonetim` rolüne görünür.

## 5. Reçete (BOM) Kuralları

- Bir kartın reçetesi **salt okuma** ile aranabilir (ör. alt kırılımı
  göstermek için) — bu işlem asla "hayalet" bir taslak reçete YARATMAZ.
- Reçete kalemlerinde **miktar/birim satır üzerinde doğrudan
  düzenlenebilir** (web'in `page_recete_agac.js` ekranı ve SolidWorks
  eklentisi, AYNI mantığı paylaşır).
- Hammadde HARİÇ her kalem tipinde **inline Rota/Amortisman/GYG** alanları
  vardır — kartın kendi alanlarıdır, ayrı bir form GEREKTİRMEZ.
- Paket kartlarında **ambalaj tipi, koli içi adet, en/boy/yükseklik,
  net/brüt ağırlık** ayrıca düzenlenir ("Paket Ölçü/Ağırlık Düzenle…").
- **Taslak → Kaydet ayrımı:** ekranda yapılan değişiklikler önce yerel bir
  "değişti" kaydına (taslak) yazılır; sunucuya KALICI yazma yalnızca
  kullanıcı açıkça "Kaydet"e bastığında olur. Bu, hem web ekranında hem
  SolidWorks eklentisinde AYNI ilkedir (bkz. §8.4 — SolidWorks tarafında
  BUNUNLA KARIŞTIRILMAMASI gereken ÜÇ ayrı "kaydet" eylemi vardır).

## 6. Kısmi ve Tam Sıfırlama Kuralları

Yönetim → Ayarlar ekranındaki sıfırlama, **üç bağımsız kapsam** halinde
seçilebilir (`storage.js: kismiSifirla`); her biri yalnızca kendi
koleksiyonlarını boşaltır, diğerlerine DOKUNMAZ:

| Kapsam | Boşaltılan koleksiyonlar |
|---|---|
| **Müşteri/Sevkiyat** | `musteriler`, `teklifler`, `siparisler`, `siparisRevizyonlari`, `iadeKalemleri`, `irsaliyeler`, `sevkiyatProgrami`, `firsatlar`, `crmAktiviteler`, `kampanyalar`, `numuneler`, `pazarlamaFiyatListeleri`, `projeler`, `sikayetler`, `servisTalepleri`, `faturalar`, `eFaturalar`, `tahsilatlar`, `tahsilatBeklenenler`, `tahsilatOnayBekleyenler`, `vadeFarkiKayitlari`, `musteriCekleri` |
| **Hat Planlama** | `isemirleri`, `kesimPlanlari`, `kesimIhtiyaclari`, `uretimIsEmriIhtiyaclari`, `hammaddeIhtiyaclari`, `istasyonIsleri`, `gerceklesenSureKayitlari`, `vardiyalar`, `kapasiteDuzeltmeleri`, `hatDurumlari`, `duruslar` |
| **Satınalma** | `talepler`, `satinalmaTalepleri`, `satinalmaSiparisleri`, `stokRaf` |

**Bilerek dışarıda bırakılanlar** (kurulum/tanım verisi sayılır, "hareket"
verisi değil — sıfırlanmaz):
- Rota tanımları, `hatOperatorleri`/`hatSifreleri`/`hatSifreTalepleri`
  (Hat Planlama kapsamı için)
- `tedarikciler`, `kritikStokSeviyeleri`, `teklifKarsilastirma`
  (Satınalma kapsamı için)

Tam sıfırlama (tüm sistemi fabrika ayarına döndürme) ayrı, daha kısıtlı bir
işlemdir ve şifre korumalıdır — bkz. Yönetim → Ayarlar ekranındaki uyarı
metinleri.

## 7. Yedekleme

Ayrıntılar için bkz. `YEDEKLEME_KURULUM.md`. Özet: günde bir kez otomatik
yedek (`backups/uretimos_YYYY-MM-DD.sqlite`), son 30 gün saklanır, döngüsel
olarak eskiler silinir. Hem uygulama-içi tetikleme hem cron betiği
(`gunluk_yedek.php`) aynı mantığı paylaşır.

## 8. SolidWorks Eklentisi (UretimOSKesim)

`solidworks_addin/` klasöründeki ayrı bir .NET (C#, WinForms) projesi —
SolidWorks içinde bir COM eklentisi olarak çalışır, ÜretimOS'un kendi API'sine
(`UretimOSApiClient`) bağlanır. **LOGO'ya veya herhangi bir ERP'ye DOĞRUDAN
bağlanmaz** — yalnızca ÜretimOS ile konuşur (bkz. §9).

### 8.1 Kurulum

- Geliştirme: `dotnet build` + Inno Setup Compiler, ya da tek tıkla
  `solidworks_addin\kurulum\paketle.bat`.
- Son kullanıcı: üretilen `UretimOSKesimSetup.exe` çift tıkla kurulur —
  SolidWorks açıkken kurulmaya/kaldırılmaya çalışılırsa açık bir Türkçe
  uyarı verir, regasm COM kaydını otomatik yapar/geri alır.
- Bağlantı ayarları (`BaglantiAyarlari.cs`) `%LocalAppData%\UretimOSKesim\`
  altında saklanır — sunucu adresi ve kullanıcı adı/şifre buradan okunur.

### 8.2 Bileşen ağacı ve eşleştirme

Panel açıldığında (`BilesenAgaci.Cikar`) aktif SolidWorks belgesindeki TÜM
bileşen ağacı taranır; her bileşen, dosyasındaki **`URETIMOS_KOD`** özel
alanına göre otomatik bir ÜretimOS kartıyla eşleştirilmeye çalışılır.
Eşleşmezse kullanıcı "Farklı Kart Seç…" veya "+ Yeni Kart Oluştur…" ile
elle eşleştirir/oluşturur.

- **Sınıf** (`URETIMOS_SINIF`) ve **kenar bandı** (`URETIMOS_KENAR_ON/ARKA/
  SOL/SAG`, hammadde KOD'u olarak) seçimleri, dosyanın kendi özel alanlarına
  YAZILIR — böylece "💾 SolidWorks'e Kaydet" ile diske işlenince, SolidWorks
  kapatılıp açılsa bile KAYBOLMAZ.
- Montajda **aynı tanımdan** (aynı kod/dosya) tekrar eden bileşenler (ör.
  her çekmecedeki aynı bağlantı takımı) TEK bir düğümde birleştirilir,
  kaç kez tekrarlandığı "×N" olarak gösterilir.
- **"+ Ek Kalem"** ile elle eklenen sentetik alt kalemler (gerçek bir
  SolidWorks bileşenine karşılık GELMEZ) yalnızca ÜretimOS reçetesi
  üzerinden kalıcı olur; ayrıca bir **yerel disk önbelleği**
  (`%LocalAppData%\UretimOSKesim\agac_durumu\`) sayesinde SolidWorks
  kapatılıp açıldığında da hatırlanır.

### 8.3 "Ağacı Yenile" ve "ÜretimOS'tan Güncelle" — iki yönlü senkron

- **🔄 Ağacı Yenile** — SolidWorks'ü yeniden tarar (yeni eklenen
  bileşenleri getirir), eski ağaçtaki sınıf/kenar bandı/eşleşme durumunu
  yeni taramaya aktarır. Yön: **SolidWorks → ÜretimOS.**
- **⬇ ÜretimOS'tan Güncelle** — ÜretimOS web ekranında doğrudan
  değiştirilmiş bir reçetenin (alt kırılım, miktar vb.) güncel halini
  çeker, paneli kapatmaya gerek kalmadan yeniden çizer. Yön: **ÜretimOS →
  SolidWorks.**

### 8.4 Üç ayrı "Kaydet" — birbirinin YERİNE GEÇMEZ

| Buton | Ne yapar |
|---|---|
| **💾 SolidWorks'e Kaydet** | Yalnızca SolidWorks dosyalarındaki özel alanları (kod/sınıf/kenar bandı) diske yazar. |
| **📤 Reçete Olarak ÜretimOS'a Aktar** | SolidWorks bileşen ağacını (yeni kartlar dahil) ÜretimOS reçete yapısına dönüştürüp sunucuya yazar — "+ Ek Kalem" ile eklenenlerin ve genel BOM yapısının kalıcı olmasının TEK yoludur. |
| **✓ ÜretimOS'a Kaydet** | Alttaki (zaten var olan) ÜretimOS reçetesinde yapılan miktar/rota/kenar bandı gibi taslak düzenlemeleri sunucuya yazar. |

### 8.5 Teknik resim

"📐 Teknik Resim Oluştur" (adım 1) çizimi açar, kullanıcı elle düzenler;
"✓ Onayla ve ÜretimOS'a Yükle" (adım 2) çizimi **doğrudan** `{kod} — {ad}.dwg`
adıyla, modelin (veya varsa daha önce onaylanmış çizimin) klasörüne kaydeder
ve DWG+PDF'i otomatik ÜretimOS'a yükler — SolidWorks kapanıp panel yeniden
açıldığında da aynı satırda "🗋 Teknik Resim" ile görülür.

### 8.6 XML dışa aktarma

- **Bileşen Ağacını XML Olarak Dışa Aktar** — SolidWorks tarafının KENDİ
  taslağı (henüz ÜretimOS'a hiç aktarılmamış olsa bile).
- **Reçeteyi XML Olarak Dışa Aktar** — sunucudaki GERÇEK kaydedilmiş
  reçeteyi, her kalemin teknik dosya listesi VE yerel onaylı dosya
  konumuyla (`klasor` özniteliği dahil) birlikte dışa aktarır.

### 8.7 Sorun bildirirken

Native SolidWorks çökmeleri, managed (.NET) try/catch ile
YAKALANAMAZ — bu yüzden `Tanilama.cs`, her riskli işlemden hemen önce
**Masaüstü\uretimos_addin_log.txt** dosyasına bir iz bırakır. Bir çökme/
kilitlenme bildirirken bu dosyanın son satırlarını paylaşmak, kök nedeni
TAHMİN etmeden kesin teşhis etmenin tek yoludur.

## 9. Entegrasyon Kısıtları (LOGO / Cost)

Şirketin resmi kararı (IT Müdürlüğü, Eylül 2026): **SolidWorks'ün LOGO ERP
veritabanına DOĞRUDAN bağlanması YAPILMAYACAK** (güvenlik/performans
riski — yetki yönetimi, anlık yük, lisans/kilitlenme). Onay verilirse:
- İzole, salt-okunur bir ara veritabanı üzerinden LOGO stok kartları
  periyodik bir job ile senkronize edilecek.
- Reçetelerin Cost programına aktarımı için XML tabanlı bir "İçe Aktar"
  akışı kurulacak (SolidWorks'ün ürettiği XML zaten hazır — bkz. §8.6).
- Bu entegrasyonun ikisi de henüz **hayata geçmedi**, IT Müdürlüğü onayına
  bağlı ayrı bir süreçtir. ÜretimOS'un kendisi LOGO'nun YERİNE geçmez —
  SolidWorks ↔ ÜretimOS entegrasyonu (§8) bugün ÇALIŞAN, bağımsız bir
  parçadır.

**LOGO → ÜretimOS okuma köprüsü (`logo_koprusu/`):** yukarıdaki karar
SolidWorks'ün LOGO'ya DOĞRUDAN bağlanmasını kapsar — ÜretimOS'un kendisi ile
LOGO arasında, salt-okunur, ayrı bir yerel-ağ köprüsü mevcuttur. BT'nin
oluşturduğu salt-okunur bir SQL girişiyle LOGO'nun SQL Server veritabanından
ürün/yarı mamül/hammadde kartlarını okuyup ÜretimOS'un mevcut **Entegrasyon Merkezi**
(§10, `page_ag_entegrasyon.js`) üzerinden içe aktarılabilir hale getirir.
Ayrıntı ve kurulum için bkz. `logo_koprusu/README.md`. Bu köprü asla LOGO'ya
YAZMAZ ve LOGO şifresi git'e ASLA eklenmez (`logo_koprusu/ayarlar.php`,
`.gitignore`'da tanımlıdır).

## 10. Modül Haritası

Aşağıdaki `page_*.js` dosyaları, dosya adından çıkarılabilen kısa
açıklamalarla listelenmiştir — bu belgenin ayrıntılı kapsamı DIŞINDADIR,
yalnızca bir yönlendirme haritasıdır.

**Satış / Müşteri İlişkileri**
`page_teklif.js`, `page_teklif_degerlendirme.js`, `page_siparis.js`,
`page_crm.js`, `page_cari_panel.js`, `page_cari_secici.js`,
`page_pazarlama.js`, `page_proje.js`, `page_proje_teklif.js`,
`page_tedarikci_teklif.js`

**Üretim / Planlama**
`page_uretim_panel.js`, `page_uretim_ekrani.js`, `page_isemri.js`,
`page_is_emri_formu.js`, `page_cizelge.js`, `page_hat_takip.js`,
`page_hat_terminal.js`, `page_nesting.js`, `page_montaj_semasi.js`,
`page_kalem_secici.js`, `page_step_ice_aktar.js`, `page_cnc_takimlari.js`

**Reçete / Kartlar / Teknik**
`page_recete_agac.js`, `page_recete_onay.js`, `page_rota.js`,
`page_kartlar.js`, `page_hammadde.js`, `page_hammadde_piyasa.js`,
`page_yarimamul.js`, `page_fiyat.js`, `page_qr_etiket.js`

**Satınalma / Depo / Lojistik**
`page_satinalma_panel.js`, `page_acik_satinalma_siparisleri.js`,
`page_depo_panel.js`, `page_iade_ambari.js`, `page_sevkiyat_panel.js`,
`page_malzeme_talep.js`

**Muhasebe / Finans**
`page_muhasebe_panel.js`, `page_efatura.js`, `page_cek_portfoy.js`

**Kalite / Bakım / İSG**
`page_kalite_panel.js`, `page_uygunsuzluk_dof.js`, `page_bakim_panel.js`,
`page_isg.js`, `page_servis.js`

**İnsan Kaynakları**
`page_ik_personel.js`, `page_ik_bordro.js`, `page_ik_izin.js`,
`page_ik_tazminat.js`, `page_ik_arac.js`

**Yönetim / Analitik / Raporlama**
`page_dashboard.js`, `page_analitik.js`, `page_kpi_panel.js`,
`page_yonetim_raporlama.js`, `page_ust_yonetim_kokpit.js`,
`page_onaylar.js`, `page_faaliyet_defteri.js`, `page_iptal_islemleri.js`,
`page_yukleme_onay.js`

**Sistem / Entegrasyon**
`page_ag_entegrasyon.js`, `page_tiger_aktarim.js`

Ayrıca, sayfa modüllerinin ARKASINDA çalışan "motor" dosyaları vardır
(`*_motor.js` — ör. `mrp_motor.js`, `analitik_motor.js`, `crm_motor.js`,
`kpi_motor.js`, `otomasyon_motor.js` vb.) ve tasarım/CAD yardımcıları
(`dolap_*.js`, `masa_*.js`, `swood_okuyucu.js`, `dwg_okuyucu.js`,
`step_okuyucu.js`, `teknik_cizim.js`, `cnc_export.js`) — bunlar ilgili
`page_*.js` ekranları tarafından çağrılır, bağımsız ekranlar değildir.

## 11. İlgili Diğer Belgeler

| Belge | Konu |
|---|---|
| `KURULUM.md` | Yerel (tek bilgisayar) kullanım kurulumu |
| `VPS_KURULUM.md` | Sunucu (PHP+SQLite) kurulumu, güvenlik katmanları |
| `GUVENLIK_DENETIMI.md` | Geçmiş güvenlik denetimi bulguları ve düzeltmeleri |
| `GUVENLIK_SERTLESTIRME.md` | Güvenlik sertleştirme kontrol listesi |
| `YEDEKLEME_KURULUM.md` | Otomatik günlük yedekleme kurulumu |
| `MUHENDISLIK_STANDARDI.md` | Koda katkı yapan herkes (insan/AI) için kurallar |
| `OLCEKLEME_PLANI.md` | Veri mimarisinin ölçek sınırları ve büyüme planı |
| `ARAYUZ_KORUMA.md` | Arayüz kopyalanması/bilgi sızıntısı konusunda gerçekçi durum |
| `solidworks_addin/README.md` (varsa) | SolidWorks eklentisi geliştirme notları |
