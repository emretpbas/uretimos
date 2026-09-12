# Ahşap Teknik Ofis Entegrasyonu — Durum Raporu

Bu belge, "SWOOD/TopSolid Wood tarzı üst düzey bir ahşap teknik ofis sistemi,
ÜretimOS'un reçete/rota/iş emri sistemine tam uyumlu, nesting dahil" isteği
üzerine yapılan çalışmanın **dürüst bir özeti**dir. Aşağıda hem gerçekten
bitmiş ve TEST EDİLMİŞ kısımlar, hem tasarım kararları, hem de bilerek
YAPILMAYAN kısımlar (ve neden) ayrı ayrı listeleniyor.

## Neden "sıfırdan komple SWOOD/TopSolid rakibi" YAPILMADI

SWOOD ve TopSolid Wood onlarca mühendisin yıllarca geliştirdiği ticari CAD/CAM
paketleri. Birkaç gün içinde, test edilemeden (bu ortamda SolidWorks yok),
kullanıcı geri bildirimi alınamadan böyle bir sistemi "bitirmek" gerçekçi bir
hedef değil — sahte bir "tamamlandı" raporu vermek yerine, gerçekten
kullanılabilir ve test edilmiş parçalar üretmeyi tercih ettim.

## EN ÖNEMLİ BULGU: Nesting modülü zaten ÜretimOS'ta var

`page_nesting.js` dosyasını incelediğimde, ÜretimOS'ta **zaten** son derece
gelişmiş bir "Kesim Optimizasyonu" (nesting) modülü olduğunu gördüm:
- Skyline (bottom-left) bin-packing algoritması, CNC/Flat-Tabla modu
- Ayrı bir Lineer Testere algoritması (şerit bazlı, iki yön deneyip en
  verimlisini seçiyor)
- Grain (desen) kilidi — döndürülemez parçalar
- Testere/freze kesim payı ve plaka kenar boşluğu ayarlardan okunuyor
- DXF export (CNC/CAM'e gönderilebilir, katmanlı: KESIM/PLAKA/ETIKET)
- SVG görselleştirme, aynı yerleşimli plakaların gruplanması (performans)
- Maliyet hesabı, kayıtlı kesim planları, stoktan otomatik düşüm

**Bu yüzden sıfırdan ikinci bir nesting motoru YAZMADIM** — bu hem gereksiz
tekrar olur hem de mevcut, kanıtlanmış olandan daha kötüsünü üretme riski
taşırdı. Onun yerine asıl değerli işi yaptım: SolidWorks'ten çıkan kesim
listesinin bu mevcut sisteme **doğru veri kalitesiyle** aktığından emin olmak.

## YAPILAN VE TEST EDİLMİŞ İŞLER

### 1) SolidWorks eklentisi → ÜretimOS SWOOD köprüsü (YENİ)

ÜretimOS'ta zaten çalışan, test edilmiş bir SWOOD ZIP içe aktarım hattı var
(`swood_okuyucu.js` + `is_emri_uretici.js:swoodDenUret`, bkz.
`testler/swood_ice_aktarim_testi.js`). Yeni `SwoodPaketOlusturucu.cs`
(SolidWorks eklentisi içinde), kesim listesini bu hattın **birebir beklediği**
ZIP yapısına (`Saw Cut Export/*.csv` + `PDFS/*.pdf`) dönüştürüyor. Sonuç:
ÜretimOS tarafında SIFIR değişiklikle, "İş Emri Formu > SWOOD İçe Aktar"
ekranından doğrudan yüklenebilir bir paket.

Eklentiye 5. bir komut eklendi: **"ÜretimOS'a Aktar (SWOOD Uyumlu Paket)"**
(`SwAddin.cs:SwoodPaketOlusturCalistir`). Mevcut Excel/PDF raporunun
(1. komut) **YERİNE değil, YANINDA** çalışır — o insan onayı/incelemesi için,
bu ise ÜretimOS'a makine-okunabilir içe aktarım için.

### 2) Donanım (minifix/rafix/menteşe/raf desteği/kulp) — YENİ, UÇTAN UCA

- `OzelAlanlar.HIRDAVAT_LISTESI` (`URETIMOS_HIRDAVAT`) zaten vardı, formatı
  netleştirildi: `"kod:adet,kod:adet"` — **iç ayırıcı bilerek VİRGÜL**, çünkü
  CSV'nin kendi sütun ayırıcısı noktalı virgül (`;`); aksi halde donanım
  listesindeki `;` karakterleri CSV sütunlarını kaydırırdı. Bu hata önce
  yazıldı, sonra fark edilip düzeltildi ve testlere eklendi.
- `is_emri_uretici.js`'e yeni `hirdavatAdaylariniAyristir()` fonksiyonu ve
  `swoodDenUret()`'e `hirdavatAdaylari` çıktısı eklendi (mevcut `bantAdaylari`
  mimarisiyle BİREBİR aynı desen: adaylar çıkarılır, gerçek hammadde kartına
  (tip:`hirdavat`) eşleme kullanıcı onayıyla `page_is_emri_formu.js`
  katmanında yapılır — yanlış karta otomatik bağlamak yanlıştan pahalı).
- **17 yeni test yazıldı ve GEÇTİ** (`testler/swood_ice_aktarim_testi.js`).

### 3) 45° birleşim ve yabancı parça (cam/ayna/hazır profil vb.) — YENİ

- `OzelAlanlar.BIRLESIM_TIPI` (`URETIMOS_BIRLESIM_TIPI`) — kullanıcı SolidWorks
  Özel Özellikler'den elle girer (ör. `45_derece`), TAHMİN EDİLMEZ, olduğu
  gibi iş emri açıklamasına not düşülür.
- `OzelAlanlar.YABANCI_PARCA` (`URETIMOS_YABANCI_PARCA`) — "evet"/"true"/"1"
  ise bu parça bir plakadan KESİLMEZ (satın alınır). Kesim listesinden
  GİZLENMEZ (hâlâ sipariş edilmesi gereken bir BOM satırı) ama açıkça
  işaretlenir ki üretim onu kesmeye çalışmasın.

### 4) Uçtan uca doğrulama (C# derleyicisi bu ortamda yok, ama...)

Bu Linux ortamında SolidWorks/Visual Studio çalıştıramıyorum, ama
`SwoodPaketOlusturucu.cs`'nin ÜRETECEĞİ CSV metnini JS'te birebir taklit edip
GERÇEK `swood_okuyucu.js` + `is_emri_uretici.js` ayrıştırıcılarından geçirdim
— 3 örnek satır (normal parça, 45° birleşimli arkalık, yabancı parça/ayna)
uçtan uca **17/17 test geçti**. Yani CSV format uyumu mantık düzeyinde
doğrulanmış durumda; SolidWorks tarafındaki C# derlemesi Pazartesi Visual
Studio'da yapılmalı (bu ortamda derleme imkânı yok).

## Reçete / Rota sistemiyle ilişki (ne yapıldı, ne yapılmadı)

- **İş emri satırı üretimi**: yukarıdaki köprü sayesinde tam kapsandı.
- **Reçete (BOM) / Rota (operasyon) ataması**: bunlar iş emri onaylandıktan
  SONRA, ÜretimOS'un KENDİ (zaten var olan, T2/T3 fazlarında denetlenmiş)
  akışlarıyla yapılıyor — SolidWorks eklentisinin bu adıma müdahale etmesi
  gerekmiyor, iş emri satırı doğru/eksiksiz geldiği sürece mevcut sistem
  bunu doğru işliyor. Bu yüzden reçete/rota kodlarına DOKUNMADIM — zaten
  T1-T4 denetimlerinde bu akışlar tek tek düzeltilip test edilmişti.

### 5) Donanım kartı otomatik eşleştirme (SONRADAN EKLENDİ, TEST EDİLDİ)

`page_is_emri_formu.js`'e `kenarBantlariEslestir` ile AYNI desende yeni bir
`hirdavatEslestir()` fonksiyonu eklendi ve `.zip` içe aktarım akışına
bağlandı. Kenar bandından FARKI: kenar bandında SWOOD'un serbest metinli
açıklaması bulanık (fuzzy) eşleştirilir, hırdavatta ise kullanıcının
SolidWorks'te bizzat yazdığı KOD üzerinden **TAM** eşleşme aranır (daha
güvenilir). Veri şeması (`satir.hirdavatlar[]`) artık STEP/PDF/SWOOD TÜM
kaynaklarda tutarlı şekilde mevcut. 9 yeni test eklendi, hepsi geçiyor.

### 6) Hırdavat TABLO GÖRÜNÜMÜ (TAMAMLANDI)

İş Emri Formu'nun ana tablosuna, kenar bandı sütunlarıyla (PVC2/PVC1/PVC0,40/
SOFT) AYNI görsel/etkileşim desende yeni bir **"Hırdavat"** sütunu eklendi:
- Her kalem `kod ×adet` olarak listelenir; eşleşen kart varsa adı yanında
  görünür, yoksa amber renkte "🔍 kart seç" ile İŞARETLENİR (tahmin edilmez).
- Adet doğrudan tabloda sayı kutusuyla değiştirilebilir.
- ✕ ile kalem kaldırılır, "+ Ekle" ile SolidWorks dışından elle yeni bir
  donanım kalemi eklenebilir (kalem_secici ile hammadde kartından seçilir).
- Aynı sütun Excel ve jsPDF (autoTable) dışa aktarımlarına da eklendi.
- **Bilerek dokunulmayan**: resmi, revizyon kontrollü FR.29 basılı form
  (`pdfYazdir`/`window.print`) — bu şirketin ISO doküman kontrolü altındaki
  FİZİKSEL form şablonu (Doküman No: FR.29, Rev.01), sütun eklemek ayrı bir
  onay/revizyon süreci gerektirir, kod değişikliğiyle tek taraflı
  değiştirilmemesi gereken bir belge.
- 17 yeni yapısal test eklendi, hepsi geçiyor (toplam 156/156).

## BİLEREK YAPILMAYANLAR (ve neden)

- **Yeni bir nesting/bin-packing motoru** — yukarıda açıklandı, gereksiz
  tekrar olurdu.
- **Resmi FR.29 basılı form şablonuna Hırdavat sütunu eklemek** — ISO doküman
  kontrolü altında, kod değişikliğiyle tek taraflı değiştirilecek bir belge
  değil; isterseniz ayrı bir revizyon süreci olarak ele alınabilir.
- **DWG/AutoCAD içe aktarımı, gerçek SolidWorks üzerinde uçtan uca test** —
  bu ortamda SolidWorks çalıştırılamıyor.

### 7) Otomatik Montaj Şeması (YENİ)

Kullanıcı isteği: "önce parça ve alt montajdaki tüm parçaları listeleyen ve
sonra montaj aşamalarını benim yaptığım explode sırasına göre çizsin, yine
ben onaylayıp düzenleyeyim ve dwg/pdf çıktı alalım."

**Bilinçli teknik sınır**: SolidWorks'ün patlatılmış görünüm (exploded view)
ADIMLARINI (hangi parça hangi sırada, ne kadar hareket ediyor) tek tek
programatik olarak okuyup yeniden sahneleyen API (IExplodedView/IExplodeStep
ailesi) resmi dokümantasyona bu ortamda erişimim olmadığı için KULLANILMADI —
yanlış bir varsayım burada native çökme riski taşımaz (güçlü tipli COM
interop, yanlış üye adı DERLEME hatası verir, çalışma zamanı çökmesi değil)
ama SESSİZCE YANLIŞ bir sahne üretebilirdi.

**Bunun yerine yapılan** (2 yeni komut, teknik resimle BİREBİR aynı iki
adımlı mimari):
- **"Montaj Şeması Oluştur"**: parça listesi zaten KesimListesiCikarici'den
  geliyor (rapora zaten dahil); bu komut montajın KENDİ SolidWorks'te
  oluşturduğunuz patlatılmış görünümünü — resmi, belgelenmiş `IView.
  ShowExploded` özelliğiyle — çizime aktarıp AÇIK bırakır. Montajda kayıtlı
  bir patlatılmış görünüm yoksa çizim normal/toplanmış açılır ve net bir
  uyarı verir (tahmin etmez).
- Siz SolidWorks'te aşamaları/balonları/görünüşleri elle düzenlersiniz
  (tam olarak "yine ben onaylayıp düzenleyeyim" dediğiniz adım).
- **"Montaj Şemasını Onayla"**: teknik resimdeki "Onayla" ile birebir aynı
  mekanizma — DWG+PDF+JPG üretir, ayrı bir Manifest anahtarında saklanır
  (aynı montajın hem normal teknik resmi hem montaj şeması bağımsız
  onaylanabilsin diye).
- Montaj şeması görseli, Kesim Raporu'nun (Excel + PDF) "Genel" sayfasına
  parça listesinden HEMEN SONRA, montajın teknik resminden ÖNCE otomatik
  eklenir — istenen sıralama ("önce liste, sonra montaj aşamaları").
- SWOOD uyumlu pakete de (varsa) montaj şeması PDF'i dahil edilir.

**Doğrulanamayan risk**: `IView.ShowExploded` özelliğinin SolidWorks 2025
SP3.0'da tam bu isimle var olduğuna dair yüksek güvenim var (yaygın, iyi
belgelenmiş bir API) ama %100 garanti veremem — yanlışsa Visual Studio
derleme hatası (CS1061) verir, bu durumda hatayı paylaşın, doğru üye adını
birlikte buluruz (bu oturumda defalarca kullandığımız, işe yarayan yöntem).

### 8) Etiketleme Paneli (YENİ — gerçek bir arayüze dönüştü)

Daha önce "Faz 2" olarak bırakılan, yalnızca "SolidWorks'ün Özel Özellikler'ine
elle girin" diyen yer tutucu, gerçek bir form oldu (`EtiketlemePaneli.cs`).
Artık 12'den fazla `URETIMOS_*` alanını (TIP, KOD, AD, ölçüler, PLAKA_KODU,
4 kenar bandı, HIRDAVAT, ÜST_PAKET_KODU, BIRLESIM_TIPI, YABANCI_PARCA) tek
tek SolidWorks'ün genel/gruplanmamış Özel Özellikler ekranında aramak yerine,
ETİKETLİ, GRUPLANMIŞ, ÖN-DOLDURMALI tek bir formda düzenliyorsunuz.

**Neden SolidWorks'ün kendi PropertyManagerPage'i DEĞİL, düz WinForms**:
`IPropertyManagerPage2` COM arayüzü resmi dokümantasyona bu ortamda erişim
olmadan güvenle doğrulanamayacak geniş bir yüzey. WinForms ise .NET'in
kendi, SolidWorks'ten bağımsız, zaten bu eklentide (MessageBox,
SaveFileDialog) kanıtlanmış teknolojisi — sıfır ek COM riski.

**Opsiyonel ÜretimOS entegrasyonu**: "🌐 ÜretimOS'tan Listeleri Çek" butonu,
`UretimOSApiClient.cs`'i (bu dosya daha önce oluşturulmuş ama HİÇBİR YERDE
kullanılmıyordu — artık gerçek bir tüketicisi var) kullanarak plaka/kenar
bandı kodlarını canlı sunucudan çekip açılır kutulara doldurur. **Kimlik
bilgileri KOD İÇİNDE DEĞİL** — `%LocalAppData%\UretimOSKesim\baglanti.json`
adlı, kullanıcının kendi bilgisayarında bir kez oluşturduğu, GİT'E ASLA
EKLENMEYEN yerel bir dosyadan okunur (`BaglantiAyarlari.cs`). Bu dosya
yoksa/sunucuya ulaşılamazsa panel SESSİZCE serbest-metin moduna düşer —
özellik hiçbir zaman paneli kullanılamaz hale getirmez.

**Doğrulanamayan risk**: `ISelectionMgr.GetSelectedObjectsComponent4`
(montajda seçili bileşeni bulmak için) yaygın, iyi belgelenmiş bir SolidWorks
API deseni — yüksek güvenim var ama garanti veremem; yanlışsa yine sadece
derleme hatası (CS ###) verir, çökme değil.

### 9) Tahıl/Desen Yönü (GRAIN) — YENİ

Ahşap/kaplamalı plakalarda desen yönü kesim için kritiktir; yanlış yönde
kesim geri dönüşü olmayan firedir. ÜretimOS'un SWOOD köprüsü (`is_emri_
uretici.js:swoodDenUret`) bu bilgiyi `GRAIN` sütunundan **zaten okuyordu**
(SWOOD raporları için) — ama SolidWorks add-in'i bu sütunu HİÇ doldurmuyordu.
Şimdi `OzelAlanlar.TAHIL_YONU` (`URETIMOS_TAHIL_YONU`, Etiketleme Panelinde
"boyuna/enine/boş" seçimi) → `KesimSatiri.TahilYonu` → `SwoodPaketOlusturucu`
CSV'sindeki `GRAIN` sütunu yoluyla uçtan uca akıyor — **ÜretimOS tarafında
hiçbir kod değişikliği gerekmedi**, sadece SolidWorks tarafı eksik veriyi
tamamladı. Gerçek ayrıştırıcıdan geçirilerek doğrulandı.

### 10) Etiketleme Panelinde Hırdavat Hızlı Ekle — YENİ

"🌐 ÜretimOS'tan Listeleri Çek" artık `tip:'hirdavat'` kartlarını da çekiyor;
bir açılır kutudan doğru kodu SEÇİP "+ Ekle" ile HIRDAVAT alanına
`kod:1` biçiminde ekleyebiliyorsunuz — elle yazarken kod hatası (yazım
hatası, virgül/iki nokta karışıklığı) riski ortadan kalkıyor. Serbest metin
girişi hâlâ mümkün, bu sadece bir kolaylık katmanı.

## PAZARTESİ İÇİN YAPILACAKLAR (net, sıralı)

1. `git pull` (veya Visual Studio'dan Çek) ile şu dosyaların güncel halini
   alın: `OzelAlanlar.cs`, `KesimListesiCikarici.cs`, `SwAddin.cs`,
   ve YENİ `SwoodPaketOlusturucu.cs` (Visual Studio'da projeye "Add Existing
   Item" ile ekleyin — diğer yeni dosyalarda olduğu gibi).
2. Rebuild edin, regasm ile yeniden kaydedin (DLL değişti).
3. SolidWorks'te test: bir montajda en az bir parçaya `URETIMOS_HIRDAVAT`,
   `URETIMOS_BIRLESIM_TIPI`, `URETIMOS_YABANCI_PARCA` özel alanlarını elle
   girin, sonra **"ÜretimOS'a Aktar (SWOOD Uyumlu Paket)"** komutunu çalıştırın.
4. Üretilen `.zip`'i ÜretimOS'ta İş Emri Formu > SWOOD İçe Aktar ile yükleyip
   donanım/birleşim/yabancı parça notlarının açıklama sütununda ve YENİ
   "Hırdavat" sütununda doğru göründüğünü doğrulayın; hırdavat kartları
   önceden Hammaddeler ekranından (tip: hırdavat, aynı stok kodlarıyla)
   tanımlıysa kartla otomatik eşleşmiş (yeşil/normal) görünmeli, değilse
   amber "🔍 kart seç" ile işaretlenmiş olmalı.
5. YENİ: Bir montajı açıp önce SolidWorks'ün kendi "Insert > Exploded View"
   aracıyla bir patlatılmış görünüm oluşturun, sonra **"Montaj Şeması
   Oluştur"**a basın — çizim açılıp (varsa) patlatılmış görünümü yansıtmalı.
   Aşamaları/görünüşleri düzenleyip **"Montaj Şemasını Onayla"**ya basın.
   `IView.ShowExploded` derleme hatası verirse (CS1061 "does not contain a
   definition for 'ShowExploded'"), Nesne Gezgini'nde (Object Browser) `IView`
   arayüzünü açıp doğru üye adını bulup bana bildirin — tek satır düzeltiriz.
6. Rapor Oluştur'u tekrar çalıştırıp Excel/PDF'in "Genel" sayfasında artık
   parça listesi → montaj şeması → teknik resim sırasının doğru göründüğünü
   doğrulayın.
7. İsterseniz devam: resmi FR.29 basılı form şablonuna da Hırdavat sütunu
   eklemek isterseniz (ISO doküman kontrolü gerektirebilir) ayrıca belirtin.
8. YENİ: Visual Studio'da projeye `EtiketlemePaneli.cs` ve `BaglantiAyarlari.cs`
   dosyalarını ekleyin (Add Existing Item — diğer yeni dosyalarda olduğu
   gibi). Bir parça açıp (veya montajda bir bileşen seçip) **"Paket/Parça
   Etiketle"** komutunu çalıştırın — form açılmalı, mevcut değerleri
   (varsa) önceden doldurmalı. Birkaç alan girip **Kaydet**'e basın, sonra
   SolidWorks'ün kendi Özel Özellikler ekranından `URETIMOS_*` alanlarının
   gerçekten yazıldığını doğrulayın.
9. (Opsiyonel) ÜretimOS'tan canlı liste çekmeyi denemek isterseniz:
   `%LocalAppData%\UretimOSKesim\baglanti.json` dosyasını (panel ilk
   denemede otomatik örnek oluşturur) kendi sunucu adresiniz/kullanıcı
   adınız/şifrenizle doldurup "🌐 ÜretimOS'tan Listeleri Çek"e basın.

## Değişen/eklenen dosyalar

- `is_emri_uretici.js` — `hirdavatAdaylariniAyristir`, `swoodDenUret` genişletmesi
- `testler/swood_ice_aktarim_testi.js` — 17 yeni test (hepsi geçiyor)
- `solidworks_addin/src/OzelAlanlar.cs` — `BIRLESIM_TIPI`, `YABANCI_PARCA`
- `solidworks_addin/src/KesimListesiCikarici.cs` — yeni alanlar okunuyor
- `solidworks_addin/src/SwoodPaketOlusturucu.cs` — YENİ dosya
- `solidworks_addin/src/SwAddin.cs` — 5. komut + AssemblyResolve düzeltmesi
  (önceki oturumdan: ClosedXML/PdfSharp'ın SolidWorks içinde yüklenememe sorunu)
