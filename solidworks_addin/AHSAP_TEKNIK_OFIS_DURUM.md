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

### 11) Reçete Ağacı Paneli + Rota Seç/Oluştur — YENİ

Kullanıcı isteği: "üretimostaki ağaç görünümünde reçeteyi solidworkstede
uygula alt kalem ekle sürükle bırak, paket, yarı mamül, alt montaj,
hırdavat, plaka, kenar bandı vb." + "rota seç ve oluştur da var her
yarımamülde onu da ekleyelim."

**Ne yapıldı:** Yeni `ReceteAgaciPaneli.cs` — 8. komut ("Reçete Ağacı
(ÜretimOS)"). Aktif parça/montaj bileşenine karşılık gelen ÜretimOS kartını
(ürün/yarı mamül/alt montaj/paket — `URETIMOS_KOD` üzerinden otomatik
eşleştirmeye çalışır, bulamazsa elle seçtirir) bulur, kartın reçetesini bir
`TreeView`'de gösterir. Solda bir palet (tip seç: Paket/Yarı Mamül/Alt
Montaj/Hırdavat/Plaka/Kenar Bandı + arama), sürükle-bırak ile ağaca alt
kalem eklenebiliyor (miktar sorulur). Değişiklikler "✓ ÜretimOS'a Kaydet"
ile `receteler` koleksiyonuna PATCH edilir.

Yarı mamül kök kart seçiliyken (veya ağaçtaki bir yarı mamül kalemine
sağ tıklanınca) **"Rota Seç / Oluştur…"** açılır: mevcut rotalardan biri
atanabilir, ya da kod+ad girilip **boş adımlı YENİ bir rota** oluşturulup
otomatik atanır. **BİLEREK YAPILMAYAN:** rota ADIMLARI (istasyon/süre)
TAHMİN EDİLMEZ/otomatik doldurulmaz — `rota_sablon.js`'nin istasyon
eşleştirme mantığı burada YENİDEN İNŞA EDİLMEDİ; kullanıcı adımları
ÜretimOS'un kendi Rota ekranından tamamlar (panel bunu açık bir mesajla
belirtir).

**GÜNCELLEME (SONRAKİ İSTEK): "alt kırılımlı reçete" — V1 tek seviye
sınırı KALDIRILDI.** Kullanıcı isteği: "alt kırılımlı reçete almak için
soldaki parça ve alt montaj listesindeki kalemlerin hangi pakette olduğunu
ve paket ölçü ve ağırlığını yazalım, yarımamul alt kırılımlarını ve
rotalarını girelim ve bu ÜretimOS'taki reçete sistemine aynı şekilde
aktarılsın." `ReceteAgaciPaneli.cs` tamamen yeniden yazıldı:

- **Çok katmanlı ağaç:** `KalemDugumuOlustur` artık ÖZYİNELEMELİ — her
  kalem (`hammadde` HARİÇ) kendi reçetesi varsa, onu da alt `TreeNode`
  olarak gösterir. Bu, ÜretimOS'un kendi `page_recete_agac.js:renderNode`
  fonksiyonuyla AYNI mantık (her zaman genişletilmiş, özyinelemeli render).
  Döngüsel/çok derin referanslara karşı `MAKS_DERINLIK = 6` sabiti bir
  GÜVENLİK SINIRIDIR — gerçek döngü tespiti (A→B→A) YAPILMAZ, TAHMİN
  edilmez, yalnızca sonsuz özyineleme engellenir (kod içinde bilinçli
  sınırlama olarak yorumlanmıştır).
- **Herhangi bir derinlikte düzenleme:** Sürükle-bırak artık bırakılan
  DÜĞÜMÜN kartına eklenir (köke sabit değil); "Kaldır"/"Miktar Değiştir"
  de kalemin AİT OLDUĞU kartın reçetesini günceller. Hedef, `HedefKartCoz`
  ile ağaçta yukarı doğru giderek bulunur. Birden çok seviyedeki
  değişiklikler `Dictionary<string, JObject> _degisenReceteler` (anahtar
  `tip|kartId`) içinde tek tek biriktirilir, "✓ ÜretimOS'a Kaydet" HEPSİNİ
  TEK SEFERDE `receteler` koleksiyonuna PATCH eder (ekleme/güncelleme
  ayrımıyla).
- **"Nerede kullanılıyor" — TAM analiz (GÜNCELLENDİ, ilk sürümdeki
  "yalnızca İLK eşleşen paket" sınırı KALDIRILDI):** Soldaki palette bir
  yarı mamül/alt montaj kalemi, mevcut reçetelerde kalem olarak geçtiği
  kartlar VARSA işaretlenir — `NeredeKullaniliyor` artık yalnızca
  `paketId`'li kayıtları değil, TÜM reçeteleri (ürün/yarı mamül/alt
  montaj/paket sahipliği fark etmeksizin) tarar. Tek eşleşme varsa satırda
  doğrudan `[Paket: KOD]` / `[Alt Montaj: KOD]` gibi görünür; BİRDEN FAZLA
  eşleşme varsa `[N yerde kullanılıyor — sağ tık: detay]` gösterilir ve
  palette sağ tıkla açılan **"Nerede Kullanılıyor?"** diyaloğu TÜM
  kullanım yerlerini (tip, kod, ad, miktar) salt-okunur bir listede
  gösterir. **Bilinen sınır (kasıtlı):** bu bir ANLIK görüntüdür — ağaç
  panelinde henüz Kaydet'e basılmamış taslak değişiklikler, palet yalnızca
  arama/tip filtresi değiştiğinde yeniden hesaplandığı için hemen
  yansımayabilir (TAHMİN edilmez, yalnızca belgelenir).
- **Paket ölçü/ağırlık düzenleme (YENİ):** ÜretimOS'un
  `page_recete_agac.js:openPaketOlcuDuzenle` ile AYNI alanlar (`en`, `boy`,
  `yukseklik`, `netAgirlik`, `brutAgirlik` — YENİ alan İCAT EDİLMEDİ, zaten
  var olan paket şeması kullanıldı, bkz. `testler/olcu_agirlik_test.js`).
  Kök kart bir paketse üst panelde özet + "Düzenle…" butonu; ağaçtaki
  HERHANGİ bir paket kaleminde sağ tık menüsünden AYNI diyalog açılır.
  "Taslak" davranışı ÜretimOS'la BİREBİR aynı: değişiklik yalnızca
  `_degisenPaketler` listesine yazılır, sunucuya YALNIZCA Kaydet'te
  `paketler` koleksiyonuna PATCH edilir. Palette paket kalemleri de artık
  `(en×boy×yükseklik cm, brüt kg)` özetiyle listelenir.
- **Hayalet taslak koruması korundu:** ağacı ÇİZMEK/GENİŞLETMEK asla yeni
  bir reçete OLUŞTURMAZ — salt okunur `ReceteGetir` kullanılır; yalnızca
  gerçek bir DÜZENLEME işleminde (`ReceteBulVeyaOlustur`) taslak
  reçete/kalem oluşturulur.

**GÜVENLİK DÜZELTMESİ (bu oturumda yapıldı):** `api.php`'deki
`cad_entegrasyon` rolünün beyaz listesi (`CAD_ENT_OKUNABILIR`/
`CAD_ENT_YAZILABILIR`) yeni panel yazılmadan önce yalnızca
`hammaddeler/yarimamuller/paketler/urunler/receteler` içeriyordu —
panelin okuduğu `altMontajlar` ve okuyup/yazdığı `rotalar` YOKTU. Bu,
düzgün kısıtlanmış bir `cad_entegrasyon` kimlik bilgisiyle çalışan
kullanıcılara sessiz 403 hatası verirdi. Düzeltildi: `altMontajlar`
OKUNABİLİR listesine (kart SEÇİLİR, değiştirilmez — hammaddeler ile aynı
gerekçe), `rotalar` hem OKUNABİLİR hem YAZILABİLİR listesine eklendi
(yalnızca YENİ rota oluşturma/atama için; mevcut rota silme/adım
düzenleme bu uçtan hâlâ mümkün değil). `delete` ucu bu role hâlâ tamamen
kapalı.

**Test edilemeyen kısım:** WinForms `TreeView`/sürükle-bırak/Dock sırası
görsel davranışı bu ortamda ÇALIŞTIRILAMADI (SolidWorks/Visual Studio
yok) — yalnızca brace/paren dengesi ve manuel kod incelemesiyle
doğrulandı. Çok katmanlı ağaç yeniden yazımı da AYNI şekilde (derleyici
yok) yalnızca brace/paren dengesi (193/193, 631/631) ve satır satır
manuel inceleme ile doğrulandı — özyinelemeli `TreeNode` genişletme,
`HedefKartCoz`/`ReceteGetir`/`ReceteBulVeyaOlustur` ayrımı ve
Kaydet'teki çoklu-koleksiyon PATCH akışı gerçek SolidWorks ortamında
HENÜZ ÇALIŞTIRILMADI. Pazartesi gerçek testte özellikle:
(a) sürükle-bırak'ın gerçekten TreeView'e düştüğünü,
(b) rota panelinin ve paket ölçü panelinin ustPanel'in ALTINDA
(üstünde değil) göründüğünü,
(c) çok seviyeli bir ürün açıldığında alt yarı mamül/alt montaj/paket
kalemlerinin KENDİ reçeteleriyle otomatik genişleyerek göründüğünü,
(d) ağacın 2-3 seviye derinliğinde bir kalemin miktarını değiştirip
Kaydet'e bastıktan sonra ÜretimOS'un kendi `page_recete_agac.js`
ekranında AYNI değişikliğin göründüğünü,
(e) bir paketin ölçü/ağırlığını buradan düzenleyip kaydettikten sonra
ÜretimOS'un `openPaketOlcuDuzenle` diyaloğunda AYNI değerlerin
göründüğünü doğrulayın.

### 12) Nesting Delik/Form + CNC Yerleşimi (Biesse bSolid) + Cam Modülü Başlangıcı — YENİ

Kullanıcı isteği: "nestinge alt montaj ve parça üzerindeki delikleri ve
formları da ekle, cam modülü için de başlangıç yap, parçaya sağ tıklayıp
bir CNC fincan ya da sıfırlama bölümüne yerleştir — Biesse bSolid 5 eksen
düz tablalı ve fincanlı bir makina, postprocessor ve makina kodunu
[kullanıcı] atacak."

**a) Nesting: delik/form desteği (YENİ, uçtan uca)**

`page_nesting.js`'in `parcalar[]` şeması artık `delikler[]`/`formlar[]`
taşıyabiliyor. Kaynaklar:
- **SolidWorks'ten otomatik:** YENİ `DelikFormCikarici.cs` — parçanın
  silindirik yüzeylerini (`ISurface.IsCylinder`/`CylinderParams`) delik,
  en büyük düz yüzeyin iç loop'larını (`IFace2.GetLoops`) form/cep olarak
  tarar. **GÜVENİLİRLİK UYARISI:** bu API'ler (üye adları, `CylinderParams`
  dizisinin eleman sırası) bu ortamda gerçek bir SolidWorks derleyicisiyle
  DOĞRULANAMADI (ağ erişimi resmi dokümantasyona bu oturumda engellendi) —
  yanlışsa ya derleme hatası verir (güvenli) ya da YANLIŞ sayısal değer
  üretir (yakalanamaz). Bu yüzden **iki adımlı onay** zorunlu kılındı:
  `OzelAlanlar.DELIKLER_ONAYLANDI` kullanıcı tarafından "evet" yapılmadan
  (bkz. CncYerlesimPaneli, madde c) hiçbir delik SWOOD ZIP'ine/nesting'e
  DAHİL EDİLMEZ — yalnızca panelde salt-okunur listelenir, kullanıcı
  SolidWorks'teki gerçek parçayla karşılaştırıp onaylamalı.
- **Manuel:** `page_nesting.js`'te "Parça Ekle" formuna "x,y,çap;x,y,çap"
  hızlı giriş eklendi (SolidWorks köprüsü olmadan da delik tanımlanabilir).
- **DXF çıktısı:** `buildDxf` artık `DELIK` (CIRCLE) ve `FORM` (LWPOLYLINE)
  katmanları da yazıyor — parça 90° döndürülerek yerleştirildiyse delik/form
  koordinatları da doğru dönüştürülüyor (`delikKoordDonustur`).
- **Köprü (T3-29'un devamı niteliğinde bir GERÇEK boşluk kapatıldı):**
  Daha önce SWOOD'dan gelen per-parça delik/hırdavat verisi İş Emri
  Formu'nda görünse de nesting'e HİÇ ULAŞMIYORDU (nesting yalnızca
  reçete/BOM'dan türetilen aggregate boy/en alıyordu). YENİ **"▦ Kesime
  Aktar (Nesting)"** butonu (İş Emri Formu) bu köprüyü kurdu: plaka
  hammadde kartı SEÇİLMİŞ satırları (delik/form/tahıl-kilidi dahil) ilgili
  `kesimIhtiyaclari` satırına aktarır; plaka seçilmemiş satırlar TAHMİN
  EDİLMEZ, sayısı bildirilip atlanır.

**b) Cam (Glass) — küçük, yan bir ekleme — DİKKAT: "CAM" TERİMİ İLE KARIŞTIRILMASIN**

Bu madde "cam" malzemeyi (pencere/mobilya camı) ifade eder — kullanıcının
BİR SONRAKİ mesajında kastettiği "CAM" (Computer-Aided Manufacturing,
SWOOD CAM/TopSolid CAM tarzı takım yolu/işleme programı) TAMAMEN FARKLI
bir şeydir ve aşağıda **13) CNC/CAM Modülü** altında ayrıca ele alınmıştır.
İlk yorumlama bir isim çakışmasıydı, düzeltildi — bu madde (cam malzeme)
küçük ve yan bir ekleme olarak KALDI, iptal edilmedi.

Hammaddeler ekranına yeni `'cam'` tipi eklendi (filtre + liste + form
dropdown'ı — mevcut `'sarf'` tipiyle AYNI, kanıtlanmış desen). SolidWorks
tarafında `CAM_KODU`/`CAM_TEMPERLI`/`CAM_KENAR_ISLEME` özel alanları ve
Etiketleme Paneli'nde karşılık gelen bölüm eklendi; `swoodDenUret` bu
bilgiyi açıklamaya "Cam: ... · Temperli · Kenar: ..." olarak taşıyor
(TAHMİN EDİLMEZ). **BİLEREK YAPILMAYAN:** cam için ayrı bir nesting/kesim
optimizasyonu YOK — cam zaten `YABANCI_PARCA` akışını izliyor (plakadan
kesilmez, satın alınır/temin edilir). Tam bir "cam modülü" (temperleme
fire hesabı, kenar işleme fiyatlandırması, cam tedarikçi entegrasyonu vb.)
ayrı bir faz olarak ele alınmalı — bu yalnızca veri modelinin başlangıcı.

**c) CNC Yerleşimi Paneli (Biesse bSolid) — 9. komut**

YENİ `CncYerlesimPaneli.cs` + `SwAddin.cs`'e 9. komut ("CNC Yerleşimi").
**BİLEREK YAPILMAYAN (kritik):** gerçek postprocessor/G-kodu/XNC üretimi
BURADA YOK — kullanıcı postprocessor + örnek makine kodu gönderene kadar
bu eşleme TAHMİN EDİLMEDİ (yanlış G-kod eşlemesi gerçek malzeme/takım
hasarına yol açabilir). Panel yalnızca parça başına KALICI kurulum
bilgisini SolidWorks özel özelliklerine yazıyor: `CNC_FINCAN` (pod no),
`CNC_SIFIRLAMA_KOSE` (sol_alt/sağ_alt/sol_üst/sağ_üst/merkez) + XYZ ofset.
Bu veriler SWOOD ZIP CSV'sine ekstra sütun olarak zaten akıyor
(`CNC_FINCAN`, `CNC_SIFIRLAMA_KOSE`) — postprocessor bilgisi geldiğinde
doğrudan kullanılabilir olacak. **Ayrıca gerçek bir sağ-tık context menüsü
DEĞİL** — SolidWorks'ün native context-menu API'si bu ortamda
doğrulanamadığı için, EtiketlemePaneli/ReceteAgaciPaneli ile AYNI kanıtlanmış
desen kullanıldı (bileşeni FeatureManager'da seçip komut şeridinden paneli
açmak). Gerçek sağ-tık menüsü istenirse Visual Studio'da Object Browser
ile context-menu üyesi bulunup tek satırda eklenebilir.

**Test durumu:** JS tarafı (delik ayrıştırma, koordinat dönüşümü, DXF
katmanları, kesimeAktar köprüsü, cam tipi) 181 testle uçtan uca doğrulandı
(`node testler/swood_ice_aktarim_testi.js`, `node testler/nesting_testi.js`).
C# tarafı (DelikFormCikarici, CncYerlesimPaneli, SwAddin 9. komut) yalnızca
brace/paren dengesi ve manuel inceleme ile doğrulandı — **gerçek delik
konumlarının ve CylinderParams okumasının SolidWorks'te MUTLAKA elle
doğrulanması gerekiyor**, bu oturumda hiçbir şekilde canlı test edilemedi.

### 13) CNC/CAM Modülü — Takım Kütüphanesi + Operasyon Bazlı Parametre Atama — YENİ

Kullanıcının bir sonraki isteği önceki maddedeki "cam" (glass) yorumunu
düzeltti: kastedilen **CAM (Computer-Aided Manufacturing)** — "swoodcam ya
da topsolid cam gibi freze bıçaklarını takım yollarından seçebildiğim,
bıçak yükseklik kalınlık ve bull/ball/düz/V uçlu, özel profilli bıçak
ayarlarını, fincan yüksekliği ve 5 eksen freze ayarlarını, giriş/çıkış
ayarlarını, pasoları, dönüş ve ilerleme hızı ayarlarını yapabildiğim bir
program". Kullanıcıya üç mimari soru soruldu ve şu kararlar alındı:
**(1)** takım kütüphanesi ÜretimOS sunucusunda paylaşılan bir koleksiyon
olsun, **(2)** görsel takım yolu önizlemesi de olsun, **(3)** takım/
parametre ataması OPERASYON bazında (her delik grubu/kontur kendi
takımıyla) yapılsın.

**Dürüst kapsam sınırı (baştan belirtildi, üç kararın hiçbiri bunu
değiştirmedi):** tam bir CAM motoru (gerçek takım yolu hesaplama, 5 eksen
yüzey-normali bazlı takım ekseni, G-kodu/postprocessor üretimi) SWOOD/
TopSolid'in yıllarca süren mühendisliğidir — bu oturumda "haftalar
sürecek" ölçekte gerçek bir CAM motoru YAZILMADI. Bunun yerine, kullanıcının
üç kararına sadık kalarak GERÇEKTEN ÇALIŞAN ama dürüstçe sınırlı bir
temel kuruldu:

**a) ÜretimOS: CNC Takım Kütüphanesi (YENİ sayfa `page_cnc_takimlari.js`)**

Menü: TANIMLAR (ARGE/Teknik Ofis) > "CNC Takım Kütüphanesi". Her takım
kartı: kod, ad, **profil tipi** (Düz Uç / Bull Nose + köşe yarıçapı /
Ball Nose / V Uç + açı / Özel Profil + serbest metin açıklama), çap,
kesme boyu, sap çapı, maks. devir (rpm), maks. ilerleme (mm/dk). Yeni
`cncTakimlari` koleksiyonu (`storage.js`) — hammaddeler gibi paylaşılan
master veri, fiyat/stok takibi YOK (bu bir tedarik kartı değil, bir
makine ayarı kartı). `api.php`'nin `CAD_ENT_OKUNABILIR` listesine
eklendi (SolidWorks eklentisi SALT OKUNUR çeker — takım tanımı yalnızca
bu ekrandan yapılır, `CAD_ENT_YAZILABILIR`'a BİLEREK eklenmedi).

**b) SolidWorks: Operasyon Gruplama (YENİ `CncOperasyonu.cs`)**

Kullanıcının "operasyon bazında" kararına uyarak: aynı çaptaki delikler
(±0,05mm) TEK bir "Delme" operasyonunda toplanır, her form/kontur KENDİ
operasyonu olur (`CncOperasyonlariOlustur.Olustur`). Operasyon kimliği
(`Id`) geometriden türer (örn. `OP-DELME-8.0`) — parça yeniden taranınca
AYNI geometri için aynı Id üretilir, böylece kullanıcının önceden atadığı
takım/parametreler (`CncOperasyonKaydi`, `URETIMOS_CNC_OPERASYONLAR` özel
alanında JSON dizisi olarak saklanır) kaybolmadan yeniden eşlenir.
**v1 sınırlaması (dürüstçe belirtilmiş):** form tipi ayrımı (dış kontur mu
iç cep mi) YAPILMAZ — DelikFormCikarici.cs bunu ayırt edecek kadar
geometri analizi yapmıyor.

**c) SolidWorks: CncYerlesimPaneli.cs — "Operasyonlar" sekmesi (YENİ)**

9. komut artık İKİ sekmeli: "Genel" (öncekiyle aynı: fincan/sıfırlama +
delik onay kapısı) ve **"Operasyonlar"**. Operasyonlar sekmesinde: sol
tarafta operasyon listesi, sağda seçili operasyon için: **Takım** (🌐
butonuyla ÜretimOS'tan çekilen Takım Kütüphanesi'nden seçilir), Fincan
Yüksekliği (mm), **5 Eksen Eğim Açısı** (yalnızca SAYI saklanır — bkz.
aşağıdaki dürüstlük notu), Giriş Stratejisi (dikey/rampa/önceden delik),
Çıkış Stratejisi (dikey/rampa), Paso Derinliği + Paso Sayısı (0=otomatik),
Devir (rpm), Kesme İlerlemesi + Dalma İlerlemesi (mm/dk, AYRI alanlar —
gerçek CAM pratiğiyle tutarlı). Sağ altta **basit bir 2D önizleme**
(WinForms `Graphics` ile özel çizim): delme operasyonunda her delik,
seçili takımın çapıyla bir daire olarak; kontur operasyonunda formun
kendi dış hattı + kaba bir "yaklaşık takım yolu" (merkez etrafında
ölçekleme) çizilir.

**ÇOK ÖNEMLİ DÜRÜSTLÜK NOTU (panelde de görünür bir uyarı olarak var):**
1. Bu "5 eksen eğim açısı" yalnızca bir SAYIdır — yüzey normaline göre
   gerçek takım ekseni hesabı (asıl 5 eksen CAM'in temel işi) YAPILMAZ.
2. Kontur önizlemesindeki "takım yolu" GERÇEK bir poligon-ofset
   algoritması DEĞİLDİR (zigzag/spiral cep temizleme, ramp/plunge giriş
   hareketleri gibi gerçek CAM motoru işlevleri YOKTUR) — yalnızca kaba
   bir görsel fikir verir, ÜRETİM İÇİN KULLANILAMAZ.
3. G-kodu/XNC/postprocessor üretimi HÂLÂ YOK — kullanıcının göndereceği
   Biesse bSolid postprocessor + örnek makine koduna göre AYRI bir fazda
   ele alınacak. Şimdiye kadar toplanan TÜM parametreler (takım, fincan
   yüksekliği, giriş/çıkış, paso, devir/ilerleme) o faz için HAZIR
   bekliyor — postprocessor geldiğinde yeniden toplanmaları GEREKMEZ.

**d) Veri akışı:** Operasyon kayıtları `SwoodPaketOlusturucu.cs`'nin
`Delikler/*.json` sidecar'ına `operasyonlar[]` olarak eklendi (yalnızca
`DELIKLER_ONAYLANDI=evet` ise — aynı onay kapısı). `is_emri_uretici.js`
bunu `satir.cncOperasyonlar` olarak taşır ama **HENÜZ TÜKETMEZ** (gösterim/
kullanım ayrı bir faz — bu oturumda yalnızca veri kaybolmadan uçtan uca
akıyor olması sağlandı).

**Test durumu:** JS tarafı (`cncTakimlari` koleksiyonu/menü/api.php
erişimi, `page_cnc_takimlari.js` profil tipleri, `cncOperasyonlar`
sidecar akışı) 192 testle doğrulandı — hepsi geçiyor. C# tarafı
(`CncOperasyonu.cs`, `CncYerlesimPaneli.cs`'in "Operasyonlar" sekmesi,
2D önizleme çizimi) yalnızca brace/paren dengesi + manuel inceleme ile
doğrulandı — **WinForms TabControl/SplitContainer/özel çizim (Graphics.
Paint) davranışı bu ortamda ÇALIŞTIRILAMADI**, Pazartesi gerçek testte
özellikle önizlemenin panel boyutuna göre doğru ölçeklendiğini ve takım
seçiminin operasyon değiştirince kaybolmadığını kontrol edin.

### 14) 6 Yüz Kutu (Frame/Box) Otomasyonu + Hırdavat Delik Aktarımı — YENİ, EN YÜKSEK RİSKLİ BÖLÜM

Kullanıcı isteği: "6 yüz eksende hazırladığımız Frame dosyasında oluşturduğumuz
gövde içerisine yine aynı mantıkla sürükle bırak mantığında bir box atalım.
Frame özerk ve kendi alt montaj ve part dosyalarını oluştursun, ancak box her
sürükle bırakta yine özerk dosya haline gelsin ve başka dosyalarda değişerek
karışıklık çıkarmasın. Box'a eklediğimiz hırdavatların bağlantı deliklerini
cutextrude olarak atıldığı yüzeyi delecek şekilde düzenleyelim; Frame'in
içine atıldığında panelde delik ve kanal oluştursun."

Üç netleştirme sorusuyla mimari netleştirildi: (1) Frame **6 panel ayrı
.sldprt, bir .sldasm montajında** birleşik — Box da AYNI mantıkla üretilecek
(kullanıcı: "Box için kütüphane yapacağım — çekmece/kapak/arkalık/raf/dikme
— sen sadece bunu da 6 yüz olarak yap"). (2) "Özerk dosya" = **her
yerleştirmede YENİ dosya adlarıyla kopyalansın** (tek şablona linkli
KALMASIN).

**⚠️ BU BÖLÜM, BU OTURUMUN EN YÜKSEK RİSKLİ ÇALIŞMASIDIR** — önceki tüm
özellikler ya SolidWorks geometrisini yalnızca OKUDU (DelikFormCikarici) ya
da sıfır SolidWorks-COM riski taşıyan WinForms/veri işleriydi. Burada
İLK KEZ gerçek geometri OLUŞTURULUYOR (sketch + extrude + cut) — bu,
doğrudan CNC'ye giden bir çıktıdır. Aşağıdaki HER adımda bu risk açıkça
işaretlendi.

**a) AltiYuzKutuOlusturucu.cs (YENİ)** — Genişlik/Yükseklik/Derinlik/Kalınlık
+ hangi yüzler dahil edilsin parametreleriyle 6 panel (her biri kendi
`.sldprt`'i) + bunları birleştiren bir `.sldasm` üretir. **Rotasyon riskini
SIFIRLAYAN tasarım kararı:** `AddComponent5` yalnızca KONUM alır, döndürme
almaz — bu yüzden her panel BİLEREK FARKLI bir referans düzlemde (Üst/Alt →
Top Plane, Sol/Sağ → Right Plane, Ön/Arka → Front Plane) çizilip KENDİ
dosyasında zaten doğru yönelimde üretiliyor; montajda HİÇBİR döndürme
matrisi hesaplanmıyor. Paneller gerçek mate YERİNE "Fix" (sabitle) ile
konumlanıyor (çok daha büyük, doğrulanamamış bir mate-oluşturma API
yüzeyinden kaçınmak için).

**b) KutuYerlestirmeYoneticisi.cs (YENİ)** — box şablonunu SolidWorks'ün
KENDİ resmi "Pack and Go" API'siyle (`IPackAndGo`) TÜM alt dosyalarıyla
birlikte, referansları otomatik düzelterek, Frame'in adına göre türetilmiş
YENİ dosya adlarıyla kopyalar, sonra Frame montajına bileşen olarak ekler.
**GÜVENİLİRLİK UYARISI:** `IPackAndGo` arayüzünün tam kullanımı (özellikle
`SetSaveToName`'in parametre sırası) resmi dokümantasyona bu ortamda erişim
ENGELLENDİĞİ için yalnızca kamuya açık örneklerden bilinen genel şekliyle
uygulandı — DOĞRULANAMADI.

**c) HirdavatDelikUygulayici.cs (YENİ) — EN KRİTİK PARÇA:** Box'a atanmış
hırdavatların (`HIRDAVAT_LISTESI`) ÜretimOS'taki delik şablonlarını
(bkz. madde e) okuyup box'ın temas eden panelinde VE Frame'in seçili
panelinde GERÇEK `CutExtrude` (ThroughAll) özelliği olarak açar. Bunu
tractable kılan fikir: box ve frame panelleri AYNI AltiYuzKutuOlusturucu
kuralını paylaştığı için, box'ın deliği Frame paneline yalnızca box'ın
Frame'deki konum OFSETİ kadar KAYDIRILARAK (döndürme gerekmeden) doğru
yere aktarılabiliyor — `KutuFrameYerlestirPaneli.cs`'teki ofset hesabı bunu
uyguluyor. **BİLEREK YAPILMAYAN:** "kanal" (sürekli menteşe/ray gibi uzun
yuvalar) bu turda YAPILMADI — yalnızca DAİRESEL delikler açılıyor; kanal
ayrı bir sketch varlığı (slot) gerektirir, riski tek turda daha da artırırdı,
doğal bir sonraki adım olarak bırakıldı. **GÜVENİLİRLİK UYARISI (bu
oturumun en belirsiz çağrısı):** `IFeatureManager.FeatureCut4`'ün tam
(~26) parametreli imzası DOĞRULANAMADI.

**d) KutuFrameYerlestirPaneli.cs (YENİ, 11. komut) — orkestrasyon:**
Kullanıcı Frame montajında box'ın oturacağı PANELİ SEÇER, komutu çalıştırır,
box şablon dosyasını + konumu (X/Y/Z mm) girer. **Temas yüzü ayrıca
SORULMAZ** — seçilen panelin KENDİ KOD'undan (`..._ALT`, `..._UST` gibi
AltiYuzKutuOlusturucu'nun ürettiği sonek) otomatik okunur. **Gerçek bir
sağ-tık sürükle-bırak DEĞİL** — SolidWorks'te canlı COM olay yakalama
(component-added notify) bu ortamda hiç doğrulanamayan, bu kod tabanında
HİÇ kullanılmamış bir risk katmanı olurdu; bunun yerine bu eklentideki
HER ÖZELLİKLE AYNI, kanıtlanmış "seç + komut şeridi" deseni kullanıldı.
İşlem çalıştırılmadan önce kullanıcıya AÇIK bir onay diyaloğu gösterilir
("bu GERÇEK bir kesim oluşturacak, ilk çalıştırmada mutlaka elle
doğrulayın").

**e) Hırdavat kartlarına "Bağlantı Delik Şablonu" (page_hammadde.js, YENİ
alan):** `tip:'hirdavat'` kartlarına opsiyonel bir "x,y,çap;x,y,çap" hızlı
giriş eklendi (`page_nesting.js`'in delik girişiyle AYNI format/mantık —
kullanıcı iki ekranda da aynı deseni öğrenir). SolidWorks eklentisi bu
şablonu okuyarak delik açar — **TAHMİN EDİLMEZ**, şablonu olmayan bir
hırdavat için delik açılmaz (yalnızca uyarı verilir).

**f) 10. komut — AltiYuzKutuPaneli.cs:** Frame/Box oluşturma için basit bir
giriş formu (kod/ad/ölçüler/dahil edilecek yüzler/çıkış klasörü) —
`AltiYuzKutuOlusturucu`'yu çağırır. `PART_SABLON_YOLU`/`ASSEMBLY_SABLON_YOLU`
(SwAddin.cs, YENİ sabitler) varsayılan SolidWorks kurulum yollarını
gösterir — **farklıysa Visual Studio'da güncellenmeli**.

**Test durumu:** JS tarafı (delik şablonu ayrıştırma/kaydetme, form
toggle) 9 yeni testle doğrulandı (toplam 201 test, hepsi geçiyor). C#
tarafı (AltiYuzKutuOlusturucu, KutuYerlestirmeYoneticisi,
HirdavatDelikUygulayici, KutuFrameYerlestirPaneli, AltiYuzKutuPaneli, 10-11.
komutlar) **YALNIZCA brace/paren dengesi ve manuel inceleme** ile
doğrulandı — bu ortamda SolidWorks/Visual Studio derleyicisi OLMADIĞI için
`SketchManager.CreateCornerRectangle`, `FeatureManager.FeatureExtrusion3`,
`FeatureManager.FeatureCut4`, `AssemblyDoc.AddComponent5`,
`Component2.Select4`/`FixComponent`, `IPackAndGo` ailesi HİÇBİRİ canlı
test edilemedi. Bunların HERHANGİ biri yanlışsa EN OLASI sonuç bir derleme
hatasıdır (güvenli — Visual Studio'da hemen görülür, Nesne Gezgini'nde
doğru üye adı bulunup tek satırda düzeltilir) ama `FeatureExtrusion3`/
`FeatureCut4` gibi çok parametreli çağrılarda "derlenir ama yanlış geometri
üretir" riski de vardır — **Pazartesi ilk denemede oluşan panel ölçülerini
ve delik konumlarını SolidWorks'te MUTLAKA elle ölçüp doğrulayın.**

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
10. YENİ: Visual Studio'da projeye `ReceteAgaciPaneli.cs` dosyasını ekleyin
    (Add Existing Item). `baglanti.json`'ı doldurun (9. adım), sonra bir
    yarı mamül/paket/ürün karşılığı olan parça/montaj bileşeni seçip
    **"Reçete Ağacı (ÜretimOS)"** komutunu çalıştırın: (a) kök kartın
    otomatik bulunduğunu ya da elle seçtirdiğini doğrulayın, (b) soldaki
    paletten bir hırdavat/plaka/yarı mamül öğesini sağdaki ağaca
    sürükleyip bırakın, miktar girin, ağaçta göründüğünü doğrulayın,
    (c) **"✓ ÜretimOS'a Kaydet"**e basıp ÜretimOS'un kendi Reçete Ağaç
    Editörü ekranında (`page_recete_agac.js`) aynı kalemin göründüğünü
    doğrulayın, (d) bir yarı mamül kalemine sağ tıklayıp **"Rota Seç /
    Oluştur…"** ile hem mevcut bir rota atamayı hem de yeni bir rota
    oluşturmayı deneyin, ÜretimOS'un Rota ekranında yeni kaydın (boş
    adımlarla) göründüğünü doğrulayın. `cad_entegrasyon` rolüyle
    bağlanıyorsanız sunucunun güncel `api.php`'yi (bu oturumda
    `CAD_ENT_OKUNABILIR`/`CAD_ENT_YAZILABILIR` genişletildi — `altMontajlar`
    ve `rotalar` eklendi) çalıştırdığından emin olun, yoksa 403 alırsınız.
16. YENİ (ÇOK KATMANLI ağaç + paket ölçü/ağırlık — 10. maddenin devamı,
    `ReceteAgaciPaneli.cs` bu sürümde YENİDEN YAZILDI): birden çok reçete
    seviyesi olan bir ürün/paket seçip **"Reçete Ağacı (ÜretimOS)"**
    komutunu tekrar çalıştırın: (a) alt yarı mamül/alt montaj/paket
    kalemlerinin KENDİ reçeteleri varsa ağaçta OTOMATİK genişlemiş alt
    düğümler olarak göründüğünü doğrulayın, (b) soldaki paletten bir yarı
    mamül/alt montaj öğesinin, o kart BİR yerde kullanılıyorsa `[Paket:
    KOD]` / `[Alt Montaj: KOD]` gibi tek etiketle, BİRDEN FAZLA yerde
    kullanılıyorsa `[N yerde kullanılıyor — sağ tık: detay]` ile
    göründüğünü, o öğeye sağ tıklayıp **"Nerede Kullanılıyor?"**
    diyaloğunda TÜM kullanım yerlerinin (tip/kod/ad/miktar) eksiksiz
    listelendiğini doğrulayın, (c) ağaçtaki 2-3. seviye derinlikteki bir
    kaleme (kök değil, alt bir kartın İÇİNDEKİ kalem) sürükle-bırak ile
    YENİ bir alt kalem ekleyin — eklenenin KÖKE değil, bıraktığınız
    kartın reçetesine gittiğini doğrulayın, (d) aynı derinlikteki bir
    kalemin miktarını çift tıkla değiştirip Kaydet'e basın, ÜretimOS'un
    kendi `page_recete_agac.js` ekranında O ALT SEVİYEDEKİ değişikliğin
    de göründüğünü doğrulayın, (e) ağaçtaki bir paket kalemine sağ
    tıklayıp **"Paket Ölçü / Ağırlık Düzenle…"** ile en/boy/yükseklik/
    net-brüt ağırlık girip Kaydet'e basın, ÜretimOS'un kendi paket ölçü
    diyaloğunda AYNI değerlerin göründüğünü doğrulayın, (f) kök kart
    doğrudan bir PAKET ise üst paneldeki ölçü özetinin ve "Düzenle…"
    butonunun (rota panelinin değil) göründüğünü doğrulayın. **Bilinen
    sınırlar (TAHMİN edilmeyip belgelenmiş):** "Nerede Kullanılıyor?"
    bir ANLIK görüntüdür — ağaç panelinde henüz Kaydet'e basılmamış
    taslak değişiklikler, palet yalnızca arama/tip filtresi
    değiştiğinde yeniden hesaplandığı için hemen yansımayabilir;
    `MAKS_DERINLIK = 6` gerçek döngü tespiti DEĞİLDİR, yalnızca bir
    güvenlik sınırıdır.
11. YENİ: Visual Studio'da projeye `DelikFormCikarici.cs` ve
    `CncYerlesimPaneli.cs` dosyalarını ekleyin. Delik içeren bir parçada
    (menteşe/minifix deliği gibi) **"CNC Yerleşimi (ÜretimOS)"** komutunu
    çalıştırın: (a) "Tespit Edilen Delikler" listesinin GERÇEK delik
    sayısı/konumuyla eşleştiğini SolidWorks'teki parçayla birebir kontrol
    edin (bu geometri okuma ADIMI CANLI TEST EDİLMEDİ — ilk deneme
    kritik), (b) eşleşiyorsa "doğruladım" kutusunu işaretleyip fincan
    no + sıfırlama köşesi girip Kaydet'e basın, SolidWorks Özel
    Özellikler'de `URETIMOS_DELIKLER_ONAYLANDI`/`URETIMOS_CNC_FINCAN`/
    `URETIMOS_CNC_SIFIRLAMA_KOSE` alanlarının yazıldığını doğrulayın.
12. YENİ: "ÜretimOS'a Aktar (SWOOD Uyumlu Paket)" ile onaylanmış delikli
    bir parçayı içeren paketi dışa aktarın, üretilen ZIP'i açıp
    `Delikler/*.json` dosyasının gerçekten oluştuğunu kontrol edin;
    ÜretimOS'ta İş Emri Formu'na içe aktarıp satırda delik verisinin
    (kod içinde `satir.delikler`) geldiğini doğrulayın, sonra **"▦ Kesime
    Aktar (Nesting)"**a basıp Kesim Optimizasyonu ekranında parçanın
    (plaka seçiliyse) göründüğünü, DXF indirince `DELIK`/`FORM`
    katmanlarının çıktığını doğrulayın.
13. YENİ (Cam modülü başlangıcı): Hammaddeler ekranından `tip:'cam'` bir
    kart tanımlayın, Etiketleme Panelinde bir parçayı bu cam koduyla +
    "Temperli" + kenar işlemesiyle etiketleyip dışa aktarın, açıklama
    sütununda "Cam: ... · Temperli · Kenar: ..." notunun doğru göründüğünü
    doğrulayın.
14. YENİ (CNC/CAM modülü — 13. madde): ÜretimOS'ta "CNC Takım Kütüphanesi"
    ekranından en az bir düz uç ve bir bull-nose takım tanımlayın. Visual
    Studio'da projeye `CncOperasyonu.cs` dosyasını ekleyin (CncYerlesimPaneli.cs
    zaten güncellendi). Delik içeren bir parçada "CNC Yerleşimi" komutunu
    çalıştırıp **"Operasyonlar"** sekmesine geçin: (a) "🌐 Takım Kütüphanesini
    Çek"e basıp tanımladığınız takımların listede göründüğünü doğrulayın,
    (b) sol listede delik çapına göre gruplanmış "Delme — ØX" operasyonunun
    doğru sayıda delik içerdiğini kontrol edin, (c) bir takım seçip fincan
    yüksekliği/giriş-çıkış/paso/devir-ilerleme girin, sağdaki önizlemede
    delik dairelerinin takım çapıyla göründüğünü doğrulayın, (d) Kaydet'e
    basıp SolidWorks Özel Özellikler'de `URETIMOS_CNC_OPERASYONLAR` alanının
    bir JSON dizisi olarak yazıldığını kontrol edin, (e) paneli KAPATIP
    TEKRAR AÇIN — girdiğiniz takım/parametrelerin KAYBOLMADAN geri geldiğini
    doğrulayın (Id-bazlı eşleme çalışıyor mu). Son olarak dışa aktarıp
    ZIP'teki `Delikler/*.json` dosyasında `operasyonlar[]` alanının
    dolduğunu kontrol edin.
15. **YENİ, DİKKATLİ TEST EDİN (14. madde — en yüksek riskli bölüm):**
    Visual Studio'da projeye `AltiYuzKutuOlusturucu.cs`,
    `KutuYerlestirmeYoneticisi.cs`, `HirdavatDelikUygulayici.cs`,
    `KutuFrameYerlestirPaneli.cs`, `AltiYuzKutuPaneli.cs` dosyalarını ekleyin.
    `SwAddin.cs`'teki `PART_SABLON_YOLU`/`ASSEMBLY_SABLON_YOLU` sabitlerinin
    GERÇEK şablon dosya yollarınızla eşleştiğini önce kontrol edin. Sırasıyla:
    (a) **"6 Yüz Kutu Oluştur"** ile küçük, test amaçlı bir kutu (örn.
    300×200×150mm, tüm yüzler açık) oluşturun — SolidWorks'te AÇIP her
    panelin GERÇEKTEN doğru ölçüde/konumda olduğunu elle ölçün (bu adım
    `FeatureExtrusion3`'ün doğru çalıştığını kanıtlar, atlanamaz).
    (b) Aynı şekilde küçük bir "box" (örn. çekmece) oluşturun.
    (c) Hammaddeler ekranında bir hırdavat kartına (örn. "RAY-001") basit
    bir delik şablonu girin (örn. "0,20,5;0,-20,5").
    (d) Etiketleme Panelinden, box'ın temas eden panel dosyasına
    `URETIMOS_HIRDAVAT` alanına bu kodu yazın (örn. "RAY-001:1").
    (e) Frame'i açıp içindeki bir paneli seçip **"Kutuyu Frame'e
    Yerleştir"**i çalıştırın, box şablonunu + bir konum girin, onay
    diyaloğunu okuyup onaylayın.
    (f) SONUÇ: box'ın Frame'e eklendiğini, hem box panelinde hem seçtiğiniz
    Frame panelinde YENİ delik(ler) oluştuğunu, ve bu deliklerin
    KONUMUNUN/ÇAPININ girdiğiniz şablonla eşleştiğini SolidWorks'te elle
    ölçüp doğrulayın. Yanlışsa Ctrl+Z ile geri alıp hangi adımın hatalı
    olduğunu (panel oluşturma mı, yerleştirme mi, delik açma mı) bana
    bildirin — tek tek düzeltiriz.
    (g) Aynı Frame'e İKİNCİ bir box daha yerleştirip, İLK box'ın dosyalarının
    HİÇ DEĞİŞMEDİĞİNİ (özerk kopyalama çalışıyor mu) doğrulayın.

## Değişen/eklenen dosyalar

- `is_emri_uretici.js` — `hirdavatAdaylariniAyristir`, `swoodDenUret` genişletmesi
- `page_is_emri_formu.js` — Hırdavat tablo sütunu + eşleştirme (görsel gösterim)
- `testler/swood_ice_aktarim_testi.js` — yeni testler (hepsi geçiyor)
- `api.php` — `CAD_ENT_OKUNABILIR`/`CAD_ENT_YAZILABILIR` genişletildi
  (`altMontajlar` okunabilir, `rotalar` okunabilir+yazılabilir eklendi —
  Reçete Ağacı Paneli'nin ihtiyaç duyduğu ama beyaz listede olmayan iki
  koleksiyon)
- `solidworks_addin/src/OzelAlanlar.cs` — `BIRLESIM_TIPI`, `YABANCI_PARCA`, `TAHIL_YONU`
- `solidworks_addin/src/KesimListesiCikarici.cs` — yeni alanlar okunuyor,
  `OzelAlanOku`/`OzelAlanYaz` `public static`'e çevrildi (paylaşılan kullanım için)
- `solidworks_addin/src/SwoodPaketOlusturucu.cs` — YENİ dosya
- `solidworks_addin/src/Manifest.cs` — montaj şeması için ayrı anahtar
- `solidworks_addin/src/TeknikResimOlusturucu.cs` — montaj şeması oluşturma
- `solidworks_addin/src/RaporOlusturucu.cs` — rapora montaj şeması eklendi
- `solidworks_addin/src/EtiketlemePaneli.cs` — YENİ dosya
- `solidworks_addin/src/BaglantiAyarlari.cs` — YENİ dosya (yerel, git'e
  girmeyen sunucu bağlantı ayarları)
- `solidworks_addin/src/ReceteAgaciPaneli.cs` — YENİ dosya (Reçete Ağacı +
  Rota Seç/Oluştur)
- `solidworks_addin/src/SwAddin.cs` — 6.-9. komutlar (Montaj Şeması
  Oluştur/Onayla, Reçete Ağacı, CNC Yerleşimi) + `HedefModelBul` paylaşılan
  yardımcı + AssemblyResolve düzeltmesi (önceki oturumdan: ClosedXML/
  PdfSharp'ın SolidWorks içinde yüklenememe sorunu)
- `solidworks_addin/src/DelikFormCikarici.cs` — YENİ dosya (delik/form
  geometri çıkarımı, bkz. 12.a — GÜVENİLİRLİK UYARISI okuyun)
- `solidworks_addin/src/CncYerlesimPaneli.cs` — YENİ dosya (CNC fincan/
  sıfırlama + delik onay paneli, bkz. 12.c)
- `solidworks_addin/src/SwoodPaketOlusturucu.cs` — `Delikler/*.json`
  sidecar + CNC/cam CSV sütunları eklendi
- `solidworks_addin/src/KesimListesiCikarici.cs` — `Delikler`/`Formlar`/
  `DeliklerOnaylandi`/`CncFincan`/`CncSifirlamaKose`/`Cam*` alanları
- `solidworks_addin/src/OzelAlanlar.cs` — `DELIKLER_ONAYLANDI`, `CNC_*`, `CAM_*`
- `solidworks_addin/src/EtiketlemePaneli.cs` — Cam bölümü eklendi
- `swood_okuyucu.js` — `Delikler/*.json` sidecar okuma
- `is_emri_uretici.js` — `satir.delikler/formlar/deliklerOnaylandi/
  tahilKilitli/cncFincan/cncSifirlamaKose`, cam notu (`swoodDenUret`)
- `page_is_emri_formu.js` — "▦ Kesime Aktar (Nesting)" köprüsü (`kesimeAktar`)
- `page_nesting.js` — delik/form veri modeli, manuel delik girişi, DXF
  `DELIK`/`FORM` katmanları (`buildDxf`, `delikKoordDonustur`)
- `page_hammadde.js` — yeni `'cam'` hammadde tipi (filtre + dropdown'lar)
- `testler/swood_ice_aktarim_testi.js`, `testler/nesting_testi.js` — yeni
  testler (hepsi geçiyor, toplam paket 0 kaldı)

**CNC/CAM modülü (bkz. 13. madde) — sonradan eklendi:**
- `page_cnc_takimlari.js` — YENİ dosya (CNC Takım Kütüphanesi ekranı)
- `storage.js` — `cncTakimlari` koleksiyonu
- `app.js` — menüye "CNC Takım Kütüphanesi" eklendi + breadcrumb etiketi
- `index.html` — yeni script etiketi + bu oturumda değiştirilen TÜM JS
  dosyalarının `?v=` sürümleri artırıldı (daha önce unutulmuştu — bkz.
  `testler/surum_tutarlilik_testi.js`)
- `sw.js` — `CACHE_NAME` v190→v191
- `api.php` — `CAD_ENT_OKUNABILIR`'a `cncTakimlari` eklendi (salt okunur)
- `solidworks_addin/src/CncOperasyonu.cs` — YENİ dosya (operasyon gruplama:
  `CncOperasyonlariOlustur`, kalıcı kayıt: `CncOperasyonKaydi`)
- `solidworks_addin/src/CncYerlesimPaneli.cs` — TabControl'e çevrildi:
  "Genel" (öncekiyle aynı) + YENİ "Operasyonlar" sekmesi (takım seçimi,
  fincan yüksekliği, 5 eksen eğim açısı, giriş/çıkış, paso, devir/ilerleme,
  basit 2D önizleme)
- `solidworks_addin/src/OzelAlanlar.cs` — `CNC_OPERASYONLAR` (JSON dizisi)
- `solidworks_addin/src/KesimListesiCikarici.cs` — `KesimSatiri.Operasyonlar`
- `solidworks_addin/src/SwoodPaketOlusturucu.cs` — sidecar'a `operasyonlar[]`
- `is_emri_uretici.js` — `satir.cncOperasyonlar` (taşınır, henüz tüketilmez)
- `testler/swood_ice_aktarim_testi.js` — CNC takım kütüphanesi + operasyon
  akışı testleri eklendi (toplam 192 test, hepsi geçiyor)

**6 Yüz Kutu (Frame/Box) Otomasyonu (bkz. 14. madde) — sonradan eklendi:**
- `page_hammadde.js` — hırdavat kartlarına "Bağlantı Delik Şablonu" alanı
  (`delikSablonuAyristir`/`delikSablonunuMetneCevir`, `delikSablonu[]`)
- `testler/swood_ice_aktarim_testi.js` — 9 yeni test (toplam 201, hepsi geçiyor)
- `solidworks_addin/src/AltiYuzKutuOlusturucu.cs` — YENİ dosya (6 panel +
  montaj üretici, Frame VE Box için ortak — bkz. 14.a GÜVENİLİRLİK UYARISI)
- `solidworks_addin/src/KutuYerlestirmeYoneticisi.cs` — YENİ dosya
  (PackAndGo ile özerk dosya kopyalama + Frame'e ekleme — bkz. 14.b)
- `solidworks_addin/src/HirdavatDelikUygulayici.cs` — YENİ dosya (hırdavat
  delik şablonundan CutExtrude, box + Frame paneli — bkz. 14.c, EN YÜKSEK RİSK)
- `solidworks_addin/src/KutuFrameYerlestirPaneli.cs` — YENİ dosya (11. komut,
  orkestrasyon + onay diyaloğu — bkz. 14.d)
- `solidworks_addin/src/AltiYuzKutuPaneli.cs` — YENİ dosya (10. komut, giriş formu)
- `solidworks_addin/src/SwAddin.cs` — 10-11. komutlar, `PART_SABLON_YOLU`/
  `ASSEMBLY_SABLON_YOLU` sabitleri (kurulumunuza göre GÜNCELLEYİN)

**Reçete Ağacı — çok katmanlı + paket ölçü/ağırlık (bkz. 11. madde
güncellemesi, 16. Pazartesi maddesi) — sonradan eklendi:**
- `solidworks_addin/src/ReceteAgaciPaneli.cs` — TAMAMEN YENİDEN YAZILDI:
  V1'in TEK SEVİYE sınırı kaldırıldı, `KalemDugumuOlustur` artık
  özyinelemeli (ÜretimOS'un `page_recete_agac.js:renderNode` ile aynı
  mantık, `MAKS_DERINLIK=6` güvenlik sınırıyla); `HedefKartCoz` ile
  sürükle-bırak/Kaldır/Miktar Değiştir artık HERHANGİ bir ağaç
  derinliğindeki kartın reçetesini hedefleyebiliyor; `_degisenReceteler`
  (çok seviyeli, anahtar `tip|kartId`) tek `_aktifRecete` alanının yerini
  aldı; salt-okunur `ReceteGetir` / oluşturan-veya-bulan
  `ReceteBulVeyaOlustur` ayrımıyla ağacı genişletmek hayalet taslak reçete
  YARATMIYOR; YENİ `PaketOlcuAgirlikDuzenle` diyaloğu (ÜretimOS'un
  `openPaketOlcuDuzenle`'ı ile aynı en/boy/yükseklik/netAgirlik/
  brutAgirlik alanları, `_degisenPaketler` taslak listesi, Kaydet'te
  `paketler` koleksiyonuna PATCH); soldaki palette yarı mamül/alt montaj
  kalemleri için "nerede kullanılıyor" özeti ve paket kalemleri için
  ölçü/ağırlık özeti (`PaketOlcuOzeti`) eklendi; `KaydetTikla` artık TEK
  basışta hem `receteler` hem `paketler` koleksiyonlarına toplu PATCH
  gönderiyor.
- Yeni ÜretimOS-taraflı koleksiyon/alan İCAT EDİLMEDİ — `paketler`
  koleksiyonunun `en`/`boy`/`yukseklik`/`netAgirlik`/`brutAgirlik` alanları
  ve `api.php`'nin `CAD_ENT_YAZILABILIR` listesindeki `paketler`/`receteler`
  izinleri zaten mevcuttu (bkz. `testler/olcu_agirlik_test.js`), yalnızca
  SolidWorks eklentisinden ERİŞİLEBİLİR hale getirildi.
- Derleyici bu ortamda YOK — yalnızca brace/paren dengesi ve satır satır
  manuel kod incelemesiyle doğrulandı; gerçek SolidWorks/Visual Studio
  testi HENÜZ YAPILMADI (bkz. Pazartesi listesi madde 16).

**Reçete Ağacı — TAM "nerede kullanılıyor" analizi (aynı 11./16. madde
kapsamında) — sonradan GENİŞLETİLDİ:** eski `HangiPakette` yalnızca İLK
eşleşen paketi (ve yalnızca `paketId`'li reçeteleri) buluyordu; bu artık
`NeredeKullaniliyor`/`SahipKartCoz` çiftiyle değiştirildi — TÜM reçeteler
taranıyor (sahibi ürün/yarı mamül/alt montaj/paket fark etmeksizin) ve
bulunan TÜM kullanım yerleri (`PaletOgesi.KullanimListesi`) saklanıyor.
Palette tek eşleşme kısa etiketle, birden fazla eşleşme
"`N yerde kullanılıyor — sağ tık: detay`" ile gösteriliyor; sağ tık
menüsündeki YENİ **"Nerede Kullanılıyor?"** diyaloğu (`NeredeKullaniliyorGoster`)
tüm kullanım yerlerini (tip/kod/ad/miktar) salt-okunur listeler. Palette
zaten var olan sol-tık sürükleme (`PaletListesi_MouseDown`) artık yalnızca
SOL tıkta tetikleniyor — önceden her tıkta (sağ dahil) `DoDragDrop`
çağrılıyordu, sağ tık artık bağlam menüsü seçimini bozmuyor. Brace/paren
dengesi (217/217, 679/679) ve manuel inceleme ile doğrulandı; gerçek
SolidWorks testi HENÜZ YAPILMADI.
