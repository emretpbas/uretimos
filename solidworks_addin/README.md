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

## ÜretimOS tarafında yapılan (küçük) değişiklikler — TAMAMLANDI

1. **`api.php`'ye kısıtlı `cad_entegrasyon` rolü eklendi.** `hat_operator`
   ile AYNI ilke: yalnızca `hammaddeler` (SALT OKUNUR — bu kimlik plaka/
   hırdavat/kenar bandı MASTER verisini değiştiremez), `yarimamuller`,
   `paketler`, `urunler`, `receteler` (okunabilir+yazılabilir) beyaz
   listesi; `delete` ucu TAMAMEN kapalı (bir koleksiyonun tamamını siler,
   bu güç bir otomasyon kimliğine verilmez). Bu role yalnızca mevcut bir
   `yonetim` kullanıcısı, bir hesap talebini onaylarken BİLİNÇLİ şekilde
   verebilir (self-servis talep edilemez — `yonetim` rolüyle aynı koruma).
   Test: `testler/11_cad_entegrasyon_test.php` (13 kontrol).

2. **`is_emri_uretici.js:swoodDenUret` artık PAKET_KODU/PAKET_ADI
   sütunlarını okuyor** — DÜZELTME: ilk taslakta buradaki iddia yanlıştı.
   Bu içe aktarım İş Emri Formu'nun DÜZ kesim listesi tablosunu doldurur
   (nesting/üretim için); ürün/yarımamül/paket/reçete gibi hiyerarşik
   ÜretimOS kayıtları OLUŞTURMAZ — o, tamamen ayrı bir ekranın
   (STEP İçe Aktar) işi. Yani PAKET_KODU/PAKET_ADI "gerçek alt kırılımlı
   ürün ağacı" KURMUYOR; SWOOD'un kendi `CABINET_NAME` alanıyla AYNI
   şekilde, kesim listesi tablosundaki mevcut `paketNo` hücresine ve
   açıklama sütununa taşınıyor (CABINET_NAME varsa o önceliklidir — SWOOD
   raporları etkilenmez). Gerçek fayda: add-in'den gelen bir ZIP'te de,
   SWOOD'daki gibi, her kesim satırının hangi dolap/alt montaja ait
   olduğu üretim ekranında görünür. `USTPAKET_KODU` şu an için bu ekranda
   kullanılan bir alan DEĞİL (düz liste hiyerarşi göstermiyor) — add-in
   yine de dışa aktarır (ileride bir tüketicisi olursa hazır), ama bugün
   hiçbir şey onu okumuyor. Test: `testler/swood_ice_aktarim_testi.js`'e
   eklenen 3 yeni kontrol.

Tam regresyon: 329/329 PHP, tüm JS paketleri yeşil.

## Kurulum (özet)

1. Visual Studio 2022, ".NET Desktop Development" iş yükü.
2. `UretimOSKesim.csproj`'daki 4 `HintPath`'i kendi SolidWorks kurulumunuzdaki
   `api\redist\` klasörüne göre düzeltin.
3. `src/SwAddin.cs` başındaki GUID'i **Tools > Create GUID** ile kendi
   üretmiş olduğunuz bir değerle değiştirin (iki yerde de aynı olmalı — aslında
   tek yerde, `[Guid(...)]` özniteliğinde).
4. Normal (yönetici olmayan) Visual Studio'da **Ctrl+Shift+B** ile derleyin
   (proje platformu **x64** olmalı — SolidWorks 64-bit'tir, "Any CPU" ile
   derlenirse kayıt yanlış Windows kayıt defteri bölümüne yazılır ve eklenti
   SolidWorks'te hiç görünmez).
5. **COM kaydını elle yapın** (tek seferlik — kod her değiştiğinde tekrar
   derlerken bunu YENİDEN yapmanız gerekir, ama SolidWorks kapalıyken):
   - Başlat menüsünden **"Komut İstemi"** yazın, üzerine sağ tıklayıp
     **"Yönetici olarak çalıştır"** deyin (bu, Visual Studio'yu yönetici
     açmaktan daha güvenilir çalışır).
   - Açılan siyah pencereye şunu yazıp Enter'a basın (dosya yolunu kendi
     projenizin `bin\x64\Debug\net48\` klasörüne göre düzeltin):
     ```
     C:\Windows\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe /codebase "C:\Yol\solidworks_addin\bin\x64\Debug\net48\UretimOSKesim.dll"
     ```
   - **"Types registered successfully"** gibi bir mesaj görmelisiniz. Hata
     çıkarsa (yine kayıt defteri erişim hatası), Komut İstemi penceresinin
     başlığında gerçekten **"Yönetici: Komut İstemi"** yazdığından emin olun.
6. SolidWorks'ü açın (kapalıysa) → **Tools > Add-Ins** → "ÜretimOS Kesim &
   Teknik Resim" işaretleyin.
7. Bir montaj açıp en az bir bileşene Özel Özellikler'den elle
   `URETIMOS_TIP = parca` yazın (bkz. `src/OzelAlanlar.cs`), sonra araç
   çubuğundaki **"Kesim Listesi + Teknik Resim Paketi Oluştur"** düğmesine
   basın.
8. Çıkan ZIP'i ÜretimOS'ta **İş Emri Formu → SWOOD İçe Aktarım**'a yükleyin —
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
