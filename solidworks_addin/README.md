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
- Her "parça" için BOY/EN/KALINLIK, `URETIMOS_BOY_MM`/`EN_MM`/`KALINLIK_MM`
  özel alanlarından okunur — SolidWorks'ün kütle özellikleri (IMassProperty)
  arayüzü gerçek denemede sınır kutusu (bounding box) için HİÇBİR üye
  taşımadığı doğrulandığından, otomatik geometri okuma yerine BİLİNÇLİ olarak
  elle giriş tercih edildi (bkz. `KesimListesiCikarici.cs`'teki gerekçe
  yorumu). Bu alanlar sabit sayı OLMAK ZORUNDA DEĞİL — sketch ölçüsüne bağlı
  bir formül de olabilir (örn. `="Length@Sketch1@..."`), gerçek denemede bu
  şekilde de doğrulandı.
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

## Reçete Ağacı Paneli'nden sıfırdan kart oluşturma — YENİ

Kullanıcı isteği: "sıfırdan paket, yarımamül, alt montaj, hammadde, plaka,
kenar bandı, hırdavat vb. ile sıfırdan ürün reçetesi oluşturmak ve bu
reçeteyi uretimos.com.tr'ye yüklemek istiyorum." Reçete Ağacı Paneli'ndeki
sol taraftaki tip kutusunda (Paket/Yarı Mamül/Alt Montaj/Hırdavat/Plaka/
Kenar Bandı) seçili olan tipte **"+ Yeni Kart Oluştur…"** butonuyla sıfırdan
bir kart açılır (alan listeleri ÜretimOS'un kendi web formlarından — bkz.
`solidworks_addin/src/YeniKartFormlari.cs` başlığı — birebir alındı), OK'a
basınca ÜretimOS'a HEMEN kaydedilir (reçete taslak değişiklikleri gibi
ertelenmez) ve palete eklenir — ardından normal "Ekle" akışıyla reçeteye
sürüklenir/eklenir.

**ÖNEMLİ — yukarıdaki (1) numaralı `cad_entegrasyon` rolü kısıtlamasıyla
KASITLI ÇAKIŞIYOR:** o rol, hammaddeler'i (plaka/hırdavat/kenar bandı)
BİLİNÇLİ olarak salt okunur bırakıyordu (master veri bütünlüğünü SolidWorks
tarafından yanlışlıkla bozulmaya karşı korumak için). Bu yeni özellik
`cad_entegrasyon` hesabıyla kullanılırsa Plaka/Kenar Bandı/Hırdavat/Alt
Montaj kartı oluşturma sunucudan 403 ile reddedilir (Yarı Mamül ve Paket
her zaman çalışır, onlar zaten yazılabilir listesindeydi) — add-in bunu
sessizce yutmaz, Türkçe bir hata gösterir. Eğer SolidWorks'ten hammadde/alt
montaj oluşturmak GERÇEKTEN isteniyorsa, iki seçenek var: (a) `baglanti.json`
için `cad_entegrasyon` yerine tam yetkili bir hesap kullanmak (bu durumda
salt-okunur koruması tamamen kalkar), veya (b) `api.php`'deki
`CAD_ENT_YAZILABILIR` listesine bilinçli olarak `hammaddeler`/`altMontajlar`
eklemek (o zaman `cad_entegrasyon` hesapları da hammadde/alt montaj
oluşturabilir/değiştirebilir hale gelir — bu, orijinal tasarım kararının
BİLEREK gevşetilmesi anlamına gelir, hafifçe düşünülmeden yapılmamalı).

## Reçete Ağacı Paneli — TÜM bileşen ağacını listeleme ve KALICI kart eşleştirme — YENİ

Kullanıcı isteği: "reçete ağacı sekmesine ilk bastığımda solidworkste olan
ve tüm componets, part ve assamblyler sıralansın ... buraya yazdığım her
bilgi daha sonra ister aynı dosyada ister farklı dosyada çağrıldığında aynı
bilgiler ile reçete ağacı satırlarında açılsın eğer bunu uretimostaki
mevcut kartlarla eşleştirdiysem yine o bilgilerle gelsin ancak istersem
değiştirebileyim."

Önceki sürümde "Reçete Ağacı" komutu, montaj içindeyken ÖNCE FeatureManager
ağacında TEK bir bileşen seçilmesini zorunlu kılıyordu. Artık:

1. **Ön-seçim gerekmiyor** — komut, aktif belge (parça ya da montaj) ne
   olursa olsun doğrudan açılır (bkz. `SwAddin.cs:ReceteAgaciAcCalistir`).
2. Panel açılır açılmaz, `BilesenAgaci.cs` (yeni dosya) `KesimListesiCikarici.
   GezRecursive` ile AYNI gezinme desenini (`Component2.GetChildren` +
   `IsSuppressed`) kullanarak aktif belgedeki TÜM component/part/assembly'leri
   çıkarır ve ekranın üst yarısındaki yeni bir `TreeView`'da
   (`_bilesenAgaciGorunumu`) doğrudan listeler — hiçbir bileşen filtrelenmez
   veya "etiketlenmemiş" diye atlanmaz (bu, kesim listesi çıkarımından farklı
   bir amaç: burada hedef, kullanıcının HER bileşeni görüp istediğini
   ÜretimOS kartıyla eşleştirebilmesi).
3. Her düğüm, kendi `URETIMOS_KOD` özel alanına göre bir simge taşır:
   `✓ KOD — ad` (kod dolu VE karşılığı bir ÜretimOS kartı bulundu),
   `⚠ (kart bulunamadı) KOD — ad` (kod var ama karta karşılık gelmiyor),
   `— (eşleşmemiş)  ad` (kod hiç yazılmamış).
4. Bir düğüme tıklanınca (`BilesenSecildi`): kod zaten eşleşiyorsa alttaki
   reçete editörü OTOMATİK olarak o kartın reçetesiyle açılır (TAHMİN YOK);
   eşleşmiyorsa/boşsa kullanıcı üstteki "Farklı Kart Seç…" ile mevcut bir
   karta eşleştirir ya da soldan "+ Yeni Kart Oluştur…" ile sıfırdan bir kart
   oluşturup otomatik eşleştirir.
5. **Kalıcılık**: bir eşleştirme yapıldığında (`EslesmeYazVeUygula`), seçilen
   kartın `kod` alanı o SolidWorks bileşeninin KENDİ dosyasındaki
   `URETIMOS_KOD` özel alanına (`KesimListesiCikarici.OzelAlanYaz`) YAZILIR.
   Bu özel alan fiziksel `.sldprt`/`.sldasm` dosyasıyla birlikte taşındığı
   için, aynı bileşen İSTER aynı montajda tekrar açılsın İSTER başka bir
   montaja referans olarak eklensin, eşleşme her zaman AYNEN geri gelir — ama
   her zaman "Farklı Kart Seç…" ile değiştirilebilir kalır.

## Kurulum

### A) Otomatik kurulum — Setup.exe (ÖNERİLEN, SWOOD gibi tek dosya)

`kurulum/UretimOSKesim.iss` — Inno Setup ile derlenmiş DLL'leri TEK bir
`UretimOSKesimSetup.exe` içine paketleyen, kurulum sırasında COM/regasm
kaydını OTOMATİK yapan (ve kaldırırken OTOMATİK geri alan) bir kurulum
betiği. Elle regasm çalıştırma adımını ORTADAN KALDIRIR — B) bölümündeki
adım 5 (regasm) ve 6 (Add-Ins işaretleme SolidWorks tarafında hâlâ gerekli,
ama kayıt otomatik) artık gerekmez. **Ürün olarak dağıtılan `UretimOSKesimSetup.exe`,
kurulacağı bilgisayarda HİÇBİR ek program/yazılım gerektirmez** (.NET
Framework'ün RegAsm'ı Windows'ta zaten hazır gelir) — SWOOD'un kendi kurulum
deneyimiyle aynı: tek dosya, çift tık, bitir.

**Geliştirme makinesinde Setup.exe'yi üretmek** (kod her değiştiğinde) için
iki yol var:

- **Tek tık (önerilen):** `kurulum/paketle.bat` dosyasını çift tıklatın —
  önce projeyi Release/x64 derler, sonra Inno Setup Compiler'ı (kurulu ise
  otomatik bulur) çalıştırıp `kurulum/Output/UretimOSKesimSetup.exe`'i
  üretir; bir sorun çıkarsa (derleme hatası, Inno Setup kurulu değil vb.)
  ekranda AÇIKÇA hangi adımda ve neden durduğunu söyler.
- **Elle:** (1) ücretsiz Inno Setup Compiler'ı kurun, (2) projeyi Release/x64
  derleyin, (3) `.iss`'i Inno Setup'ta F9 ile derleyin, (4) çıkan
  `Output/UretimOSKesimSetup.exe`'i çift tıklatın. Ayrıntılar
  `kurulum/UretimOSKesim.iss` dosyasının başındaki yorumda.

Her iki yolda da tek ön koşul, **yalnızca bu geliştirme makinesinde**,
ücretsiz Inno Setup Compiler'ın kurulu olmasıdır (https://jrsoftware.org/isdl.php,
~3 MB, 1 dakika) — kurulan/dağıtılan `Setup.exe`'yi ÇALIŞTIRAN bilgisayarda
buna gerek YOKTUR. Başka bir bilgisayara dağıtmak için de aynı tek `.exe`
yeterlidir.

**Dürüstlük notu:** bu betik bu (Linux, Inno Setup'sız) ortamda
DERLENEMEDİ/ÇALIŞTIRILAMADI — yalnızca Inno Setup'ın resmi söz dizimine
göre yazıldı, ilk gerçek derlemede küçük bir düzeltme gerekebilir (Inno
Setup hataları satır numarasıyla açıkça gösterir, sessiz başarısızlık
olmaz). B) bölümündeki elle yöntem, otomatik kurulum bir sorun çıkarırsa
başvurulacak referans/hata ayıklama yolu olarak KALICI olarak burada
tutuluyor — installer da zaten arka planda AYNI regasm çağrısını yapıyor.

### B) Elle kurulum (geliştirme / hata ayıklama / A başarısız olursa)

1. Visual Studio 2022, ".NET Desktop Development" iş yükü.
2. `UretimOSKesim.csproj`'daki 4 `HintPath`'i kendi SolidWorks kurulumunuzdaki
   `api\redist\` klasörüne göre düzeltin. **DİKKAT:** makinede birden fazla
   SolidWorks kurulumu olabilir (örn. `SOLIDWORKS` ve `SOLIDWORKS (2)`) —
   gerçek denemede referanslar YANLIŞLIKLA eski/kullanılmayan kuruluma
   işaret edince, gerçekten çalışan SolidWorks'ten FARKLI bir arayüz
   tanımına göre derlenip garip, tutarsız native çökmelere yol açtı. Görev
   Yöneticisi'nde SLDWORKS.exe çalışırken sağ tık > "Dosya konumunu aç" ile
   GERÇEKTEN hangi klasörden çalıştığını doğrulayıp `HintPath`'leri ona göre
   ayarlayın.
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

### TEK bir kurulumla SolidWorks 2017 ve SONRASI TÜM sürümler

Kullanıcı isteği: "bu 2017 ve sonrası tüm SolidWorks versiyonlarına uyumlu,
basit ve hızlı, tüm fonksiyonlarıyla birlikte kurulacak bir install dosyası
haline getirelim." Bu kod **SolidWorks 2025 SP3.0**'ın API yüzeyine göre
yazıldı/akıl yürütüldü — 2017 sekiz yıl eski bir sürüm; TEK bir derlemenin
İKİSİNDE de (ve arasındaki tüm sürümlerde) çalışması için:

1. **Şablon yolları artık OTOMATİK, sürümden BAĞIMSIZ** (bu oturumda
   düzeltildi) — `SwAddin.cs`'teki `SablonYoluBul` artık sabit bir
   `"SOLIDWORKS 2025\templates"` yolu YAZMAK yerine SolidWorks'ün KENDİ
   "Sistem Seçenekleri > Dosya Konumları > Belge Şablonları" ayarını okur
   (`GetUserPreferenceStringListValue` + `swFileLocationsDocumentTemplates`)
   — bu ayar HER sürümde/kurulumda vardır, TEK derleme 2017'de de 2025'te
   de doğru klasörü kendiliğinden bulur. Eski sabit yollar (`SABLON_YOLU`/
   `PART_SABLON_YOLU`/`ASSEMBLY_SABLON_YOLU`) yalnızca YEDEK olarak
   kaldı. **Tek elle yapmanız gereken**: ÜretimOS'un özel `uretimos.drwdot`
   çizim şablonunu, o makinenin SolidWorks Belge Şablonları klasörlerinden
   BİRİNE bir kez kopyalayın (Part.prtdot/Assembly.asmdot zaten SolidWorks'ün
   kendi stok şablonu olduğu için oradadır, ekstra işlem gerekmez).
2. **HintPath'leri EN ESKİ desteklenecek sürüme (2017) göre ayarlayıp
   O SÜRÜME KARŞI DERLEYİN** (bkz. `UretimOSKesim.csproj`'daki ayrıntılı
   yorum) — SolidWorks kendi COM arayüzlerini geriye dönük KIRMADAN
   büyütür, bu yüzden 2017'nin interop DLL'lerine göre derlenmiş TEK bir
   eklenti genellikle 2018-2025+ SolidWorks'te de DEĞİŞİKLİK YAPMADAN
   çalışır — bu, çok-sürüm desteği isteyen üçüncü parti SolidWorks
   eklentilerinin YAYGIN/kanıtlanmış stratejisidir (kod tabanını
   geç-bağlama/reflection'a çevirmek gibi çok daha büyük bir yeniden
   yazım GEREKMEZ). 2025 makinesindeki yol burada işe yaramaz.
3. **GUID'i DEĞİŞTİRMENİZE gerek YOK** — `[Guid(...)]` eklentinin kendi
   kimliğidir, farklı bir makine/SolidWorks sürümü GEREKTİRMEZ, aynı
   kalabilir. Kurulum betiği (`kurulum/UretimOSKesim.iss`) de SolidWorks
   sürümünden bağımsız çalışır (SolidWorks açık mı kontrolü hep
   `SLDWORKS.exe` process adını arar, bu TÜM sürümlerde aynıdır).
4. **.NET Framework sürümü** — proje `net48`'i hedefliyor; 2017'nin
   kendisi daha eski bir .NET Framework (ör. 4.6.1/4.7) ile piyasaya
   sürülmüştü, test makinesinde 4.8'in GERÇEKTEN kurulu olduğu
   DOĞRULANMADI. PowerShell'de kontrol edin:
   `(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full').Release`
   — 528040 veya üzeriyse 4.8 kuruludur; değilse Microsoft'un .NET
   Framework 4.8 Developer Pack'ini (derlemek için) ve/veya Runtime'ını
   (çalıştırmak için) kurun (kurulum betiği bunu kendisi de kontrol edip
   eksikse açık bir mesaj gösterir).
5. **En riskli/çökme geçmişi olan alan**: `SwAddin.cs:KomutlariKur()`
   (araç çubuğu/ikon/komut kaydı) — bu oturumda SolidWorks 2025'te BİRDEN
   FAZLA çökmeye sebep olmuştu (bkz. dosyadaki "KESİN TANI #1-5" notları).
   2017'de FARKLI davranabilir. Bir çökme olursa **önce**
   `Masaüstü\uretimos_addin_log.txt` dosyasının SON satırına bakın — tam
   olarak hangi API çağrısının çöktüğünü gösterir, aynı "arama oyunu"
   yöntemiyle (bu dosyadaki KESİN TANI notları) birlikte çözeriz.
6. **Yeni/versiyona duyarlı olabilecek API üyeleri DOĞRULANMADI** —
   `FeatureExtrusion3`, `FeatureCut4`, `AddComponent5`,
   `Component2.Select4`/`FixComponent`, `IPackAndGo` ailesi,
   `IView.ShowExploded` — bunların 2017'de var olup olmadığı bu ortamda
   araştırılmadı (kullanıcı tercihiyle doğrudan derleme denemesi
   yapılıyor). Derleme hatası (CS1061 "does not contain a definition
   for...") verirlerse bu GÜVENLİDİR (derleme zamanında yakalanır, çalışma
   zamanı çökmesi değil) — Nesne Gezgini'nde (Object Browser) doğru üye
   adını/sürümünü bulup bildirin, tek satırda düzeltiriz. Derlenirse,
   2017'de o özelliği ÇALIŞTIRIP doğrulamak yine de gerekir (derlenmek
   var olduğunu kanıtlar, DOĞRU ÇALIŞTIĞINI değil).
7. **x64 varsayımı** doğrulanmadı ama SolidWorks'ün 32-bit sürümleri
   yıllardır (2017'den çok önce) piyasadan kalktığı için düşük risklidir.

## DÜRÜSTLÜK NOTU — Faz 1 çekirdeği gerçek SolidWorks'te test EDİLDİ

Bu ortamda SolidWorks/Visual Studio bulunmadığı için kod önce tahminle
yazıldı, ama kullanıcı gerçek bir SolidWorks 2025 SP3.0 kurulumunda (Visual
Studio ile derleyip regasm ile kaydederek) uçtan uca test etti. Kesim
listesi çekirdeği (menü/komut yükleme, montaj gezme, `URETIMOS_TIP`/`KOD`/
`AD`/`BOY_MM`/`EN_MM`/`KALINLIK_MM` özel alanlarını okuma, CSV+ZIP üretimi,
etiketlenmemiş bileşenler için uyarı) **çalışır durumda doğrulandı** — gerçek
bir montajda 1 etiketli parça doğru satıra dönüştü, 60 etiketlenmemiş
bileşen doğru şekilde uyarıya düştü.

Bu noktaya gelene kadar düzeltilen gerçek (ilk tahminde yanlış çıkan) noktalar:
- `SolidWorksTools.SwAddinAttribute`'ın gerçek konumu (ilk tahmin: yanlış ad alanı).
- `IMassProperty`'nin sınır kutusu (bounding box) üyesi OLMADIĞI — bu yüzden
  ölçü otomasyonu tamamen terk edilip elle özel alan girişine geçildi.
- `ICommandGroup.Activate()` çökmesi — kök neden IconList/MainIconList
  eksikliği DEĞİL, `SetAddinCallbackInfo2`'nin komut grubu kurulumundan
  SONRA değil ÖNCE çağrılması gerekliliğiydi (bkz. `SwAddin.cs`'teki "KESİN
  TANI" yorumları — bu çökmeyi çözmek çok sayıda yanlış teoriden geçti,
  gerçek SWERR hata günlüğü ve adım adım tanı günlüğü ile kesinleştirildi).
- Projenin yanlış SolidWorks kurulumuna (aynı makinedeki iki kurulumdan
  eskisine) referans vermesi — interop DLL'leri gerçekten çalışan kurulumla
  eşleşmeyince bazı çağrılar rastgele bellek adresine düşüyordu.

Henüz test EDİLMEYEN kısım: `TeknikResimOlusturucu.cs`'nin teknik resim/PDF
üretimi (görünüş yerleşimi/şablon yolu ilk denemede küçük düzeltme
gerektirebilir) ve Faz 2/3 (kütüphane paneli, otomatik kenar bandı/delik).
