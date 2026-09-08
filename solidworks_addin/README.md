# ÜretimOS Kesim & Teknik Resim Eklentisi — SolidWorks Add-In (taslak)

Bu klasör, ana ÜretimOS deposunun (PHP/JS) parçası DEĞİLDİR — ayrı bir
Windows/.NET projesidir (`build.js` alt klasörleri dağıtıma dahil etmediği
için burada durması sunucu derlemesini etkilemez). SolidWorks içinde çalışan
bir COM eklentisidir; SolidWorks'ün kendisi sizin yerel bilgiyarınızda
çalıştığından, bu eklenti de aynı makinede derlenip kaydedilir.

## Neden böyle (canlı bağlantı yerine dosya alışverişi)

Konsoldan (bu oturumdan) doğrudan SolidWorks'e canlı bağlanmak mümkün değil —
SolidWorks yerel Windows makinenizde, bu oturum ise ayrı bir bulut
konteynerinde çalışıyor. Bu yüzden mimari: **SolidWorks içinde çalışan bir
add-in → dosya (ZIP) → ÜretimOS'a yükleme/senkron**. ÜretimOS'ta bu akışın
ilk yarısı (dosya → ürün ağacı/reçete) zaten var (`swood_okuyucu.js`,
`is_emri_uretici.js:swoodDenUret`, İş Emri Formu'ndaki "SWOOD İçe Aktarım").
Bu eklenti, o var olan içe aktarımın beklediği ZIP/CSV formatını **SWOOD'a
hiç ihtiyaç duymadan, düz SolidWorks'ten** üretir.

## Kapsam — neden faz faz

Konuşmada istenen tam liste geniş: kesim listesi + teknik resim + kenar
bandı/delik otomasyonu + hırdavat/panel/kenar bandı kütüphanesi + paket
etiketleme + ÜretimOS ağacıyla birebir örtüşen alt kırılım. Hepsini tek
seferde, test edilmemiş bir SolidWorks ortamında yazmak riskli — yanlış bir
API varsayımı (ör. yanlış özel alan adı, yanlış eksen varsayımı) sessizce
yanlış kesim ölçüsü üretebilir, ki bu gerçek plaka israfı demektir. Bu yüzden
üç fazda ilerlemeyi öneriyorum; **bu taslak yalnızca Faz 1'i içerir** (sizin
bu mesajdaki birincil isteğiniz: "her çizilen alt montajın teknik resimlerini
almak, kesim listesi oluşturmak").

### Faz 1 — BU TASLAK: Kesim listesi + teknik resim çekirdeği
- Montaj ağacını gezer, `URETIMOS_TIP` özel alanıyla etiketlenmiş bileşenleri
  (parça / alt_montaj) tanır.
- Her "parça" için BOY/EN/KALINLIK'ı SolidWorks'ün kütle özellikleri (mass
  properties) sınır kutusundan kendi hesaplar — sürüme/dile bağlı, garantisi
  belirsiz otomatik "Cut-List" özellik adlarına GÜVENMEZ (bkz.
  `KesimListesiCikarici.cs` içindeki gerekçe yorumu).
- Malzeme/kenar bandı kodlarını (varsa) özel alanlardan okur.
- Mevcut ÜretimOS SWOOD içe aktarımının okuduğu **AYNI CSV şemasını** (DESC,
  SAP_CODE, LENGHT, WIDTH, QTY, MATERIAL, EBF/EBB/EBL/EBR) üretir + 3 YENİ
  geriye-uyumlu sütun (PAKET_KODU, PAKET_ADI, USTPAKET_KODU) ekler.
- Her parça/alt montaj için 4 görünüşlü (Ön/Üst/Sağ/İzo) teknik resmi PDF
  olarak üretir.
- Etiketleme şu an ELLE yapılır (SolidWorks'ün kendi Özel Özellikler
  sekmesinden) — bkz. `src/OzelAlanlar.cs`'teki tam alan listesi.

### Faz 2 — Kütüphane paneli + etiketleme UI'ı (istediğiniz kütüphane akışı)
- Add-in içinde bir görev bölmesi (Task Pane): ÜretimOS'a giriş yapar,
  hammaddeler (tip:'plaka'/'hirdavat'/'kenar_bandi'), yarımamuller, paketler
  koleksiyonlarını **mevcut `api.php` uçlarıyla** (`action=get`/`list`, yeni
  uç GEREKMEZ) çeker, önbelleğe alır.
- Seçili bileşene bu listeden tıklayarak plaka/kenar bandı/hırdavat ataması —
  arka planda `KesimListesiCikarici.OzelAlanYaz` çağrılır.
- Paket/parça kod-ad ataması için basit bir form (yeni paket açma veya
  mevcut ÜretimOS paket kartından seçme).

### Faz 3 — Otomasyon (kenar bandı yönü + delik) — EN RİSKLİ, EN SONA
- Hangi kenarların bantlanacağının GEOMETRİDEN otomatik çıkarımı ve 32mm
  sistem deliklerinin (menteşe kovanı, kulp, rafa pim) otomatik yerleştirilmesi.
- SWOOD'un kendisi bile bunu tam otomatik değil, kural tabanlı + kullanıcı
  onaylı yapıyor. Yanlış delik = hurda panel; bu yüzden bilinçli olarak en
  sona bırakıldı. Faz 1-2 gerçek bir montajda denenip ölçü/malzeme akışı
  doğrulanmadan bu faza geçilmemeli.

## ÜretimOS tarafında GEREKEN (küçük, opsiyonel) değişiklikler

Bunları **henüz yapmadım** — onayınızı bekliyorum, çünkü ikisi de kod
tabanına dokunuyor:

1. **`api.php`'ye kısıtlı bir rol** (`cad_entegrasyon` gibi) — Faz 2'de
   add-in'in ÜretimOS'a bağlanabilmesi için. Mevcut `hat_operator` rolüyle
   AYNI ilke: yalnızca `hammaddeler`, `yarimamuller`, `paketler`, `urunler`,
   `receteler` okunabilir/yazılabilir; cari/fiyat/İK/muhasebe TAMAMEN kapalı.
   Faz 1 için GEREKMEZ (Faz 1 hiç ÜretimOS'a bağlanmaz, yalnızca ZIP üretir).

2. **`swood_okuyucu.js`/`is_emri_uretici.js`'de PAKET_KODU/PAKET_ADI/
   USTPAKET_KODU sütunlarının okunması** — şu an bu 3 sütun ZIP'e yazılıyor
   ama mevcut ayrıştırıcı onları YOK SAYIYOR (yalnızca düz parça listesi
   kuruyor). Gerçek "alt kırılımlı" ürün ağacını (ürün→paket→parça) otomatik
   kurmak için `is_emri_uretici.js:swoodDenUret`'in bu sütunlara göre
   gruplama yapması gerekiyor. Geriye uyumlu, düşük riskli bir ek — isterseniz
   şimdi yazayım.

Söyleyin, ikisini de şimdi ekleyeyim mi, yoksa önce Faz 1'i gerçek bir
montajda deneyip geri bildirimden sonra mı ilerleyelim?

## Kurulum (özet)

1. Visual Studio 2022, ".NET Desktop Development" iş yükü.
2. `UretimOSKesim.csproj`'daki 4 `HintPath`'i kendi SolidWorks kurulumunuzdaki
   `api\redist\` klasörüne göre düzeltin.
3. `src/SwAddin.cs` başındaki GUID'i **Tools > Create GUID** ile kendi
   üretmiş olduğunuz bir değerle değiştirin (iki yerde de aynı olmalı — aslında
   tek yerde, `[Guid(...)]` özniteliğinde).
4. Visual Studio'yu **Yönetici olarak** çalıştırıp derleyin (COM kaydı
   `HKEY_LOCAL_MACHINE`'e yazar).
5. SolidWorks'ü açın → **Tools > Add-Ins** → "ÜretimOS Kesim & Teknik Resim"
   işaretleyin.
6. Bir montaj açıp en az bir bileşene Özel Özellikler'den elle
   `URETIMOS_TIP = parca` yazın (bkz. `src/OzelAlanlar.cs`), sonra araç
   çubuğundaki **"Kesim Listesi + Teknik Resim Paketi Oluştur"** düğmesine
   basın.
7. Çıkan ZIP'i ÜretimOS'ta **İş Emri Formu → SWOOD İçe Aktarım**'a yükleyin —
   mevcut ekran değişmeden çalışmalı.

## DÜRÜSTLÜK NOTU — bu kod test edilmedi

Bu ortamda SolidWorks/Visual Studio bulunmadığından kodu derleyemedim.
SolidWorks API çağrıları (CreateMassProperty2, CustomPropertyManager.Get5/
Add3, CreateDrawViewFromModelView3, SaveAs3, ISwAddin/AddinAttribute kayıt
deseni) belgelenmiş, kararlı API'ler ve doğru imzalarla yazıldı, ama gerçek
bir SolidWorks oturumunda ilk denemede küçük düzeltmeler (özellikle görünüş
yerleşim koordinatları ve şablon yolu) gerekebilir. İlk denemeyi birlikte
yapıp hataları düzeltmemi isterseniz çıktısını (hata mesajı/ekran görüntüsü)
paylaşmanız yeterli.
