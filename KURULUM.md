# ÜretimOS — Yerel Kullanım Rehberi (Tek Bilgisayar, Tüm Departmanlar)

Bu sürüm verilerinizi **bu bilgisayardaki tarayıcınızda** kalıcı olarak saklar.
Başka bir kişi veya bilgisayar bu veriyi göremez — tamamen size özeldir.
Birden fazla kişinin aynı veriyi paylaşması gerektiğinde, ayrıca hazırlanan
sunucu sürümüne (PHP + SQLite) geçmeniz gerekir.

## ÇOK ÖNEMLİ: Dosyaya çift tıklayarak AÇMAYIN

`index.html` dosyasına doğrudan çift tıklarsanız, tarayıcılar güvenlik
nedeniyle kalıcı kayıt özelliğini (localStorage) engeller. Bu durumda
program çalışır görünür ama girdiğiniz veriler sayfayı kapattığınızda
**kaybolur**. Bu, "kayıt yapmıyor" şeklinde hissedilen sorunun bilinen
ve garantili sebebidir — tarayıcı kısıtlaması, programın hatası değil.

(Eğer yanlışlıkla çift tıklayıp açarsanız, ekranın üstünde kırmızı bir
uyarı şeridi göreceksiniz: "Dosyayı çift tıklayarak açtığınız için..."
Bu şeridi görürseniz aşağıdaki adımları izleyip doğru şekilde açın.)

## Doğru Açma Yöntemi (tek seferlik, 1 dakika)

### Windows kullanıyorsanız:

1. Bu klasördeki **`BASLAT.bat`** dosyasına çift tıklayın.
2. Bir siyah komut penceresi açılacak ve otomatik olarak tarayıcınızda
   `http://localhost:8000` adresini açacaktır.
3. Eğer "Python bulunamadı" mesajı görürseniz: [python.org/downloads](https://www.python.org/downloads/)
   adresinden Python'u indirip kurun. **Kurulum ekranında alttaki
   "Add Python to PATH" kutucuğunu işaretlemeyi unutmayın.** Kurulum
   bitince `BASLAT.bat`'a tekrar çift tıklayın.
4. Bundan sonra her çalışmak istediğinizde sadece `BASLAT.bat`'a çift
   tıklamanız yeterli. Açılan siyah pencereyi **kapatmayın** — program
   o pencere açık olduğu sürece çalışır. İşiniz bitince pencereyi
   kapatabilirsiniz (X tuşu veya Ctrl+C).

### Mac kullanıyorsanız:

1. Bu klasördeki **`baslat.command`** dosyasına çift tıklayın.
2. "Bilinmeyen geliştirici" uyarısı çıkarsa: dosyaya sağ tık (veya
   Control+tık) → Aç deyin, açılan onay penceresinde tekrar Aç'a basın.
3. Bir Terminal penceresi açılacak ve tarayıcınızda
   `http://localhost:8000` adresini açacaktır.
4. Terminal penceresini açık tutun, işiniz bitince kapatabilirsiniz.

## Her Gün Kullanım

Kurulumu bir kere yaptıktan sonra, her gün şu kadarı yeterli:
1. `BASLAT.bat` (Windows) veya `baslat.command` (Mac) dosyasına çift tıklayın
2. Tarayıcı otomatik açılır, verileriniz olduğu gibi orada bekliyor olur
3. İşiniz bitince pencereyi kapatabilirsiniz, verileriniz kaybolmaz

## Birim / Rol Seçimi

Sistem departman bazlı çalışır: Satınalma, Üretim Planlama, Depo,
ARGE/Teknik Ofis, Teklif & Sipariş, Cari İşlemler, Sevkiyat, Üst Yönetim
(Fiyat & Onaylar), ve "Tümü (Yönetici Görünümü)".

- İlk açılışta bir **birim seçim ekranı** gelir. Kendi departmanınızı
  seçersiniz, menünüz sadece o departmana ait sayfaları gösterir.
- Bu seçim tarayıcı sekmesi için hatırlanır (sayfa yenilenirse tekrar
  sormaz), tarayıcı tamamen kapatılıp yeniden açıldığında tekrar sorulur.
- Sol menüdeki **"Birim Değiştir"** butonuyla istediğiniz an başka bir
  departmana geçebilirsiniz.
- Tek bilgisayarda tek kullanıcı olduğu için bu rol seçimi sadece
  **görünümü** basitleştirir — hangi rolü seçerseniz seçin aynı veriye
  erişirsiniz, bu bir güvenlik/yetki sistemi değildir.

### Departmanlar Arası İş Akışı (Özet)

1. **Üretim Planlama / Depo** → yarı mamül veya hammadde için talep oluşturur
2. **Satınalma** → bu talebi görür, tedarikçiye satınalma talebi açar,
   3 tedarikçiden fiyat girip komisyonu yönetim onayına gönderir
3. **Üst Yönetim (Onaylar)** → komisyonu onaylar/reddeder; onaylanırsa
   satınalma talebi otomatik "tamamlandı" olur
4. **ARGE/Teknik Ofis** → ürün kartı, reçete/kırılım hazırlar
5. **Üst Yönetim (Fiyat)** → reçeteden gelen maliyete GYG/Nakliye/Kâr
   oranlarını uygulayıp liste fiyatını hesaplar, katalog kaydeder
6. **Teklif & Sipariş** → katalogdan ürün çekip iskonto uygulayarak teklif
   hazırlar, veya doğrudan Siparişler sayfasından ürün seçip sipariş açar
7. **Cari İşlemler** → siparişi onaylar (müşteri vade/bakiye kontrolü ile);
   onaylanan sipariş otomatik üretim kuyruğuna düşer
8. **Üretim Planlama** → kuyruktaki siparişe termin verir, kapasite/renk
   gruplama önerilerini görür
9. **Sevkiyat** → irsaliye düzenler, haftalık sevkiyat programına ekler

## Kesim Optimizasyonu — DXF ve İki Kesim Yöntemi

Kesim Optimizasyonu sayfasında iki kesim yöntemi seçilebilir:
- **Flat-Tabla Router / CNC Nesting:** parçalar her yöne serbestçe
  yerleştirilir, en sıkı paketleme sağlanır.
- **Lineer Testere Kesimi:** yatay şeritler halinde, sıralı/tek eksenli
  kesim mantığıyla çalışır, parçalar döndürülmez.

Sonuç ekranındaki **"DXF İndir"** butonu, kesim planını `.dxf` dosyası
olarak indirir — AutoCAD ve diğer CAD/CAM programlarında doğrudan açılır.

## Liste Fiyatı Formülü

```
Liste Fiyatı = (Net Maliyet × (1+GYG%) × (1+Nakliye/Montaj%) × (1+Kâr%)) ÷ Bölü Katsayısı
```

Varsayılan oranlar: GYG %10, Nakliye/Montaj %7, Kâr %54, Bölü Katsayısı 0.45.
Bu oranlar **Ayarlar** ekranından (sağ üstteki dişli simgesi) değiştirilebilir.
Maliyet & Liste Fiyatı sayfası sadece "Tümü" ve "Üst Yönetim" rollerinde görünür.

## Sipariş Oluşturma — İki Yol

1. **Teklif Hazırlama** üzerinden: katalogdan ürün seçip iskonto uygulayarak
   teklif hazırlanır, sonra siparişe dönüştürülür.
2. **Siparişler sayfasından doğrudan**: "+ Yeni Sipariş Oluştur" ile ürün
   seçip miktar girerek, fiyatı da elle düzenleyerek sipariş oluşturulur.

## Yeni Müşteri Ekleme

Cari İşlemler sayfasından, veya Teklif Hazırlama ekranındaki "+ Yeni
Müşteri Ekle" butonundan eklenebilir. Müşteri formunda Vergi Dairesi ve
Banka Hesap Numarası (IBAN) alanları da bulunur.

## ARGE/Teknik Ofis — Sıfırdan Ürün Sihirbazı

Ürün Kartları sayfasında "+ Sıfırdan Ürün (Reçete + Hammadde + İşçilik)"
butonu, 3 adımlı bir sihirbaz açar: ürün bilgisi → reçete kalemleri (mevcut
yarı mamül seç veya yenisini oluştur) → işçilik/rota ataması.

## Üretim Kuyruğu — Kapasite Takibi ve Renk Bazlı Toplu Kesim

- Cari İşlemler'de onaylanan siparişler otomatik üretim kuyruğuna düşer;
  manuel "Kuyruğa Ekle"/"Kuyruktan Çıkar" ile düzenlenebilir.
- Günlük 250 ürün kapasite KPI'sı aşılırsa kırmızı uyarı gösterilir
  (sadece gösterge, otomatik bölme/erteleme yapmaz).
- Kuyruktaki siparişler ürün reçetesindeki yarı mamül rengine göre
  gruplanır; aynı renkten birden fazla sipariş varsa "birlikte kesime
  alınabilir" önerisi gösterilir, Kesim Optimizasyonu'na yönlendirir.

## Kesim Optimizasyonu — Hammadde Bazlı Otomatik Satırlar

Kesim Optimizasyonu sayfası artık **çok satırlı** çalışır: her satır tek bir
plaka hammaddesine aittir ve o hammaddeden kesilecek tüm parçaları toplar.

- **Otomatik oluşma:** Cari İşlemler'de (veya Yönetim Onayları'nda) bir
  sipariş onaylandığında, sipariş kalemlerindeki ürünlerin reçete ağacı
  taranır; plaka tipi hammaddeye bağlı her yarı mamül bulunup, **hammadde
  başına bir satır** açılır (veya zaten açık bir satır varsa parça miktarları
  oraya eklenir). Montaj hiyerarşisi de (yarı mamülün kendi alt reçetesi)
  otomatik takip edilir.
- **Manuel satır açma:** "+ Manuel Kesim Satırı Aç" ile sipariş dışı da bir
  hammadde seçip elle satır başlatabilirsiniz.
- **Manuel adet/parça yönetimi:** Her satırdaki parça listesinde adetleri
  doğrudan tabloda düzenleyebilir, "+ Parça Ekle" ile elle parça ekleyebilir,
  silebilirsiniz.
- **Hammadde değiştirme:** "Hammadde Değiştir" butonuyla bir satırın hangi
  plakadan kesileceğini istediğiniz an değiştirebilirsiniz.
- **Satırı Kapat:** İşi bitmiş bir satırı kapatıp listeden kaldırabilirsiniz
  (geçmişe taşınır, silinmez).

Her satır kendi "Nesting Çalıştır" butonuna, kendi kesim yöntemi seçimine
(CNC/Lineer Testere) ve kendi sonuç görüntüleyici + DXF indirme özelliğine
sahiptir — birbirinden bağımsız çalışır.

## Sipariş Onayı — İki Yerden de Onaylanabilir

Sipariş onayları artık hem **Cari İşlemler → Sipariş Onayları** sekmesinden
hem de **Yönetim Onayları** sayfasından yapılabilir — ikisi de aynı veriye
bakar, hangisinden onaylarsanız diğerinde de güncellenmiş görünür. Her iki
yerden onaylama da otomatik olarak üretim kuyruğuna ekler ve Kesim
Optimizasyonu satırlarını oluşturur.

## Teklif Hazırlama — Genel Toplam İskontosu

Kalem bazlı iskontonun (her ürüne ayrı %) yanına, teklifin **genel toplamı
üzerinden ek bir iskonto** alanı eklendi. Kalemlerin ara toplamı hesaplanır,
altında "Genel İskonto (Toplamdan) %" kutucuğuna girdiğiniz oran bu ara
toplama uygulanır ve **Dip Toplam (İskontolu)** olarak gösterilir. Teklif
kaydedildiğinde bu bilgiler saklanır; siparişe dönüştürüldüğünde sipariş
tutarı olarak dip toplam kullanılır.

## Sipariş Geri Çekme / Düzenleme

Sipariş detay sayfasındaki **"↺ Geri Çek / Düzenle"** butonu, her durumdaki
(taslak, cari onayında, onaylanmış, reddedilmiş) bir siparişi tekrar
düzenleme moduna açar. Ürün/miktar/fiyat bilgilerini değiştirip
kaydettiğinizde sipariş durumu "Cari Onayında"ya döner ve yeniden onay
sürecine girer — yeni bir sipariş AÇILMAZ, mevcut sipariş güncellenir.

## Ortak Kalem Seçici (Ayrı Sayfa, Sütun + Satır Bazlı Arama)

Sipariş, Teklif ve Kesim Optimizasyonu (hammadde seçimi) ekranlarındaki
"Kalem Seç" butonları artık dropdown değil, **ayrı bir sayfa** açar:
- Üstte genel (satır bazlı) arama kutusu — kod/ad/birim üzerinde aynı anda arar
- Tablo başlığında her sütun için ayrı arama kutusu (Kod, Ad, Birim) ve Grup
  filtresi — sütun bazlı daraltma
- Sütun başlıklarına tıklayarak sıralama (artan/azalan)
- Maliyeti hesaplanamayan kalemler "⚠ MALİYET YOK" ile işaretlenir

## Cari Seçici (Tedarikçi/Müşteri için Ayrı Sayfa, Sütun + Satır Bazlı Arama)

Satınalma Paneli'ndeki **"Fiyat Gir & Sipariş Aç"** ekranındaki tedarikçi
seçimi de artık dropdown değil, Kalem Seçici'yle aynı mantıkta **ayrı bir
sayfa**: genel arama + sütun bazlı (Ünvan/Telefon/E-posta/Tip) filtreleme +
sıralama. "Tip" filtresi varsayılan olarak "Tedarikçi"ye ayarlı gelir, ama
filtreyi "Tümü" yaparsanız **müşteri kartlarına da** buradan ulaşabilirsiniz
— yani Cari Seçici, tüm cari kartların (müşteri+tedarikçi) ortak kapısıdır.

Seçiciden çıkmadan **"+ Yeni Müşteri Ekle"** veya **"+ Yeni Tedarikçi Ekle"**
ile yeni bir kart oluşturabilirsiniz; oluşturduğunuz kart otomatik seçili
hale gelip ilgili forma (örn. satınalma siparişi) geri döner. Form üzerinde
önceden girdiğiniz değerler (fiyat, miktar, not, vb.) tedarikçi seçimi
sırasında kaybolmaz, seçim sonrası aynı değerlerle geri gelir.

Tedarikçi kartlarını doğrudan yönetmek isterseniz **Cari Kartları** sayfasına
eklenen **"Tedarikçiler"** sekmesinden de erişebilirsiniz (Vergi Dairesi,
Vergi No, Banka Hesabı gibi alanlarla, müşteri kartlarıyla aynı detayda).

## 3 Ambar Yapısı (Hammadde Deposu / Üretim Ambarı / Sevkiyat Deposu)

Stok artık tek bir havuz değil, üç ayrı ambarda tutulur:

- **Hammadde ve Hırdavat Deposu**: Satınalma ile gelen tüm ürünler ilk olarak
  buraya giriş yapar.
- **Üretim Ambarı**: Üretime sevk edilen hammadde ve yarı mamuller burada
  takip edilir.
- **Sevkiyat Deposu**: Üretimi tamamlanan bitmiş ürünler burada tutulur,
  sevkiyatlar buradan yapılır.

### Depo Girişi (Otomatik Beklemeye Düşer)

Yönetim bir satınalma siparişini onayladığında, **Depo Paneli → Depo Girişi**
sekmesine otomatik bir "beklenen giriş" kaydı düşer. Depocu bu kayıt
üzerinden:

1. **Tedarikçi (cari kart) seçer**, faturadaki cari ünvanı da girer —
   sistem ikisini karşılaştırır; uyuşmazsa **"Fatura cari kartı satınalma
   siparişi ile uyuşmuyor"** uyarısı verip girişi onaylamaz.
2. İrsaliye no, fatura no, depo lokasyonu girer.
3. Gelen miktarı girer — sipariş miktarından azsa sistem otomatik
   **"eksik teslimat"** olarak işaretler ve eksik miktarı hesaplar.
4. **Kalite problemi** varsa işaretleyip açıklama girer — bu durumda giriş
   **karantinaya** alınır, stoğa eklenmez (ayrı bir kalite kontrolü
   sürecini bekler).
5. Kalite problemi yoksa onaylandığında, gelen miktar otomatik olarak
   **Hammadde Deposu**'na stok olarak işlenir.

### Otomatik Ambar Transferleri

- **Üretim Planlama → Malzeme Düşümü**: bir üretim talebi karşılandığında
  ilgili malzeme Hammadde Deposu'ndan düşer, Üretim Ambarı'na eklenir.
- **Üretim Planlama → Siparişler & Termin → "Üretimi Tamamla"**: bu butona
  basıldığında siparişteki bitmiş ürünler otomatik olarak Sevkiyat
  Deposu'na giriş yapar.
- **Sevkiyat → İrsaliye Düzenle**: irsaliye kaydedildiğinde, sevk edilen
  ürünler otomatik olarak Sevkiyat Deposu'ndan düşer.

Tüm bu hareketler **Depo Paneli → Ambar Hareketleri** sekmesinde
(tarih/tip/ambar/kalem/miktar/açıklama ile) izlenebilir.

## Bakım Modülü

**Makina & Teçhizat Bakım** sayfası: makina/teçhizat envanteri (kod, ad,
kategori, konum, zimmetli personel, alış fiyatı), periyodik/arızi servis
kayıtları (maliyetli), ve **10 yıllık amortisman planı** (yıllık gider,
biriken amortisman, kalan defter değeri — Amortisman Özeti sekmesinde).

## İnsan Kaynakları Modülü

5 alt sayfa halinde:

- **Personel & Özlük**: bölüm bazlı personel sayısı (mevcut roller ile
  birebir eşleşen departman listesi), özlük dosyası (TC kimlik, iletişim,
  adres), görev tanımı & sorumlulukları, **izinli olduğunda vekalet edecek
  personel** ataması.
- **İzin Takibi**: yıllara göre personel bazlı yıllık izin hak edilen/
  kullanılan/kalan gün takibi (kıdem yılına göre otomatik hak hesaplanır:
  1-5 yıl=14 gün, 5-15 yıl=20 gün, 15+ yıl=26 gün), mazeret/rapor/ücretsiz
  izin kayıtları.
- **Kıdem & İhbar Tazminatı**: personel bazlı, "kıdem tazminatı tavanı ×
  kıdem yılı" formülüyle otomatik hesap; toplam tüm personel kıdem
  tazminatı yükü de gösterilir.
- **Bordro & Ücret**: **gerçek 2026 SGK/gelir vergisi/damga vergisi
  parametreleriyle** otomatik aylık bordro hesabı (asgari ücret istisnası,
  kümülatif gelir vergisi dilimi takibi dahil), alınan avanslar ve aylık
  mahsup takibi. ⚠ **Bu modül resmi bir bordro yazılımının yerini
  tutmaz** — gerçek ödemeler öncesi mali müşavirinizle doğrulayın. Oranlar
  Ayarlar'dan güncellenebilir (asgari ücret, SGK tavanı vb. yasal
  değişikliklere tabidir).
- **Araç & Zimmet**: şirket araçları (plaka, marka, zimmetli personel),
  araç giderleri (yakıt/bakım/sigorta vb.), ve **tüm personel giderleri**
  (yemek, seyahat, konaklama, prim — maaş dışı).

## Yönetim Raporlama — Stok Analizleri

Yönetim Raporlama sayfasına **Stok Analizleri** kartı eklendi: son 90 günde
hiç stok hareketi olmayan kalemler "ölü stok" olarak işaretlenir (basit bir
yaklaşım — gerçek devir hızı hesabı maliyet muhasebesi verisine dayanmalıdır),
devir hızı göstergesi (hareketli kalem oranı) ve en değerli ölü stok
kalemlerinin listesi gösterilir.

## Üst Yönetim Kokpiti

Tüm sistemden (Sipariş, 3 Ambar Stok, Satınalma, Personel, Araç, Makina,
Kıdem Tazminatı) **tek ekranda 20+ gösterge**: günlük/aylık/yıllık sipariş
ve ciro, hedef gerçekleşme %, toplam stok değeri (hammadde/yarımamül/mamul
ayrımıyla), açık satınalma tutarı, bekleyen sevkiyat sayısı, toplam personel
sayısı ve maliyeti, toplam araç ve makina maliyeti, toplam yıllık amortisman,
toplam kıdem tazminatı yükü, tahmini aylık kârlılık ve nakit akışı özeti, en
çok satan ürünler/müşteriler/tedarikçiler. ⚠ Kârlılık ve nakit akışı
göstergeleri basitleştirilmiş tahminlerdir, gerçek muhasebe defterlerine
dayanmaz.

## ⚠ Kritik Düzeltme: Üretim Tamamlanınca Hammadde Stoğu Artık Gerçekten Düşüyor

**Önceki hata:** "Üretimi Tamamla" tıklandığında ekranda "hammadde çekimi
yapılacak" mesajı görünüyordu, ama gerçekte hiçbir stok düşümü
gerçekleşmiyordu — Hammadde Deposu miktarları sonsuza kadar aynı
kalıyordu.

**Düzeltme:** Sipariş onaylandığında (rafta hazır olmayan, reçeteden
hesaplanan) hammadde ihtiyacı artık **siparişin kendisine** kaydedilir.
"Üretimi Tamamla" tıklandığında bu kayıtlı liste kullanılarak Hammadde
Deposu'ndan **gerçek ve kalıcı stok düşümü** yapılır (tüketim — başka bir
ambara aktarılmaz, doğrudan yok olur, çünkü malzeme bitmiş ürünün içinde
harcanmıştır). Bu hareket Stok Hareketleri logunda "Üretimde sarf edildi
(tüketildi)" açıklamasıyla görünür.

## Hammaddelere KDV Oranı

Hammadde/Hırdavat kartına **KDV Oranı (%)** alanı eklendi (varsayılan
%18). Bu oran, Depo Girişi onaylanıp gider muhasebe kaydı oluşturulurken
kullanılır — her hammaddenin kendi KDV oranıyla doğru gider/KDV hesabı
yapılır (genel ayardaki sabit orana bağlı kalınmaz).

## Satınalma Siparişleri — Tedarikçi Bazlı Toplu Çıktı

Satınalma Paneli → "Satınalma Siparişleri" sekmesinde, her tedarikçi
grubunun başlığına **"⬇ Toplu Excel"** ve **"⬇ Toplu PDF"** butonları
eklendi. Aynı tedarikçiye ait tüm satınalma siparişleri tek bir dosyada
(Excel veya PDF) topluca indirilebilir — tek tek sipariş bazlı çıktı
almaya gerek kalmadan.

## Teklif Paneli — Seçim Gerekçesi + Yönetimde Karşılaştırma Görünümü

Satınalma menüsünde, Satınalma Siparişleri'nin yanında **"Teklif Paneli
(Tedarikçi Karşılaştırma)"** bulunur (mevcut 3-teklif karşılaştırma
sistemi). Yeni eklenenler:

- Bir tedarikçi **"Bunu Seç"** ile seçildiğinde, artık **zorunlu bir
  gerekçe** (neden bu tedarikçinin seçildiği — fiyat/termin/kalite vb.)
  girilir. Diğer tedarikçilerin teklifleri de bu gerekçe formunda
  hatırlatılır.
- **Yönetim Onayları**'nda komisyon "Detay" butonuna basıldığında, artık
  sayfa değiştirmeden **aynı ekranda bir modal** açılır: tüm tedarikçi
  tekliflerini (fiyat/döviz/termin/toplam), seçilen tedarikçiyi (yeşil
  vurgulu) ve **seçim gerekçesini** birlikte gösterir.

## Muhasebe ve Finans

Muhasebe sayfası **"Muhasebe ve Finans"** olarak genişletildi, yeni
sekmeler eklendi:

- **Basit Usul Defter**: tüm gelir/gider hareketlerini (satınalma
  ödemeleri, maaş ödemeleri, diğer giderler dahil) tarih sırasıyla ve
  kümülatif bakiye ile gösterir.
- **Tahsilatlar**: satışlardan gelen havale/EFT/çek/kredi kartı/nakit/
  diğer tahsilatlar, **satıştaki ile aynı sekmeli ödeme formu** (her
  sekmede "+ Ekle" ile birden fazla kayıt) ile girilir. Kaydedilen
  tahsilat müşteri cari bakiyesinden otomatik düşülür (alacak azalır) ve
  muhasebe gelirine işlenir.
- **Alacak Takvimi**: tüm siparişlerin ödeme planındaki (çek/diğer)
  vadeleri **gün gün tarihli bir takvimde** ve **aylık bazlı bar
  grafiğinde** (alacak=yeşil, kredi borcu=amber) gösterilir. **Vadesi
  geçen alacaklar gün sayısı olarak** ("-N gün, vadesi geçti") işaretlenir.
  Çek/diğer vadeler **gelir (+)** olarak, kredi taksitleri **gider (-)**
  olarak ayrı renkte gösterilir.
- **Banka Kredileri**: yeni bir bölüm — banka adı, kredi tutarı, aylık
  faiz oranı ve taksit sayısı girilince taksit planı otomatik oluşturulur.
  Her taksit "Ödendi" işaretlenebilir (otomatik gider kaydı oluşturur);
  ödenmemiş taksitlerin vadesi de Alacak Takvimi'nde **kredi borcu (-)**
  olarak görünür.
- Mevcut **Gelir-Gider Özeti** (ay/yıl bazlı, kategori dağılımı) ve **KDV
  Hesabı** (Hesaplanan−İndirilecek) sekmeleri korundu.

## Cari'de Fatura & İrsaliye Bölümü

Cari Kartları sayfasına **Fatura & İrsaliye** sekmesi eklendi. Sevkiyat
Deposu'nda hazır (üretimi tamamlanmış, kalite onaylı, yeterli stoklu)
siparişler bu ekrandan listelenir; **"Fatura & İrsaliye Kes"** ile aynı
formdan hem irsaliye hem otomatik KDV'li fatura (kalem bazlı KDV
oranlarına göre ayrı alt toplamlarla) kesilir. Stok yetersizse buton
yerine "⚠ Stok Yetersiz" uyarısı gösterilir. Kesilen tüm irsaliye ve
faturalar (KDV detaylı) aynı sekmede listelenir. Bu, Sevkiyat Paneli'ndeki
irsaliye akışıyla aynı alt yapıyı (stok düşümü, otomatik fatura) kullanır
— iki ekrandan da erişilebilir.

## Teklif — Kalem Bazlı KDV (Varsayılan %18, Değiştirilebilir)

Teklif Hazırlama'da eklenen her kalem **otomatik %18 KDV** ile başlar;
kullanıcı her kalemin KDV oranını ayrı ayrı değiştirebilir (örn. bir ürün
%1, bir diğeri %10 KDV'li olabilir). Kalemler farklı KDV oranlarında
olduğunda:

- Tabloda her satırın kendi KDV % sütunu (düzenlenebilir) gösterilir.
- Alt toplamda, **her KDV oranı için ayrı bir satır** (KDV Hariç / KDV
  Tutarı / KDV Dahil) gösterilir; genel iskonto her oranın kendi tutarına
  orantılı uygulanır.
- Teklif detayında ve **Siparişe Dönüştür** akışında da bu KDV ayrımı
  aynen taşınır — sipariş onayı bu kalem bazlı KDV bilgisiyle verilir.
- Bu KDV bilgisi, **Fatura & İrsaliye** kesilirken otomatik faturaya da
  aktarılır (her oran için ayrı satır + genel toplam).

## Yarı Mamül Liste Fiyatı (Ürün Formülüyle) + Teklif'te Filtreleme

- Fiyatlama sayfasındaki **"⚡ Tümünü Otomatik Hesapla ve Listeye Ekle"**
  butonu zaten tüm yarı mamüllere de **ürünlerle aynı liste fiyatı
  formülünü** (GYG + Nakliye/Montaj + Kâr) uygulayıp katalog fiyat
  listesine ekliyordu.
- **Yeni**: Teklif Hazırlama'da kalem seçilirken, **liste fiyatı
  oluşmayan** (ne hammadde ataması ne referans fiyatı olan, maliyeti
  hesaplanamayan) yarı mamüller artık **kalem seçicide hiç görünmez** —
  müşteriye fiyatsız bir kalem teklif edilmesi önlenir.

## Stoklu Yarı Mamül Planlaması — Raf Sarfı + Eksik İçin İş Emri

Bir sipariş onaylandığında artık önce **rafta (Üretim Ambarı) hazır
duran yarı mamül stoğu** kontrol edilir:

- Rafta yeterli miktar varsa, o yarı mamül **doğrudan stoktan sarf
  edilir** (reçeteye inilmez, hammadde ihtiyacı oluşmaz, stok otomatik
  düşer).
- Rafta **kısmen** veya **hiç** yoksa, sadece **eksik kalan miktar** için
  reçete patlatılır (kesim ihtiyacı + hammadde ihtiyacı SADECE eksik
  miktar üzerinden hesaplanır) ve **Üretim Planlama → İş Emri
  İhtiyaçları** sekmesine bir kayıt düşer.
- **İş Emri İhtiyaçları** sekmesinden, "İş Emrine Dönüştür" ile bu eksik
  miktar gerçek bir İş Emri'ne (İş Emirleri sayfasında görünür, üretim
  takibi yapılır) çevrilir.
- Hammadde stoğu yetersizse bu durum zaten mevcut Hammadde İhtiyacı →
  Satınalma zincirinde görünür (Satınalma'da stokta olmayan hammadde
  görülüp satınalma siparişi açılabilir).
- **Fazla üretim**: İş Emirleri sayfasında "Üretilen" miktarı girilirken,
  gerekli toplamı aşan kısım dahil **üretilen her miktar otomatik olarak
  Üretim Ambarı rafına eklenir** (ihtiyaçtan fazla üretilen de stoğa
  girer, kaybolmaz).
- **Fazla satınalma**: Depo Girişi'nde gelen miktar her zaman gerçek
  girilen miktar üzerinden Hammadde Deposu'na eklenir — talep edilenden
  fazla gelen malzeme de otomatik stoğa girer.

## Muhasebe (İç Takip & YMM'ye Veri Hazırlama)

Yeni bir **Muhasebe** rolü/sayfası eklendi. ⚠ **Bu modül resmi bir
beyanname yazılımı DEĞİLDİR** — KDV beyannamesi, muhtasar, geçici vergi
gibi resmi beyannameleri üretmez, resmi defter kaydı tutmaz. Sistemdeki
gelir/gider hareketlerini konsolide ederek **iç takip ve YMM'nize/mali
müşavirinize ön hazırlık verisi** sunar:

- **Gelir-Gider Özeti**: bu ay/bu yıl/tüm zamanlar gelir, gider, net kâr/
  zarar, kâr marjı, kategori bazlı gider dağılımı.
- **KDV Hesabı**: Hesaplanan KDV (satışlardan) − İndirilecek KDV
  (alımlardan) = Ödenecek/Devreden KDV (ay bazlı, basitleştirilmiş
  gösterim).
- **Tüm Hareketler**: her gelir/gider kaydının detayı (kaynak, matrah,
  KDV, tutar).
- **Amortisman**: Bakım modülündeki makina kayıtlarından anlık hesaplanan
  yıllık amortisman gideri özeti (vergi matrahını düşüren, nakit çıkışı
  olmayan kalem olarak ayrıca gösterilir).

Gelir kaynakları: satış faturaları, makina satışı. Gider kaynakları:
hammadde/hırdavat alımları (depo girişinde KDV'li), bordro (personel
maliyeti), araç giderleri, personel giderleri (maaş dışı), bakım/servis
giderleri — bunların hepsi otomatik olarak muhasebe kaydına işlenir.

## 📐 Alt Kırılım Excel — Ayrı Kaba/Net En-Boy Sütunları

Önceki "En × Boy (mm)" tek metin sütunu kaldırıldı, yerine plaka
hammaddelerin ölçü bilgisini ayrı ayrı gösteren **4 sütun** eklendi:

- **Kaba En (mm)** / **Kaba Boy (mm)** — kesim öncesi büyük ölçü
- **Net En (mm)** / **Net Boy (mm)** — reçetede kullanılan gerçek ölçü

Bu sütunlar sadece **plaka tipi hammaddelerin** satırlarında dolu
gelir (sayısal değer olarak, tam sayı formatında); diğer satırlarda
(ürün/yarımamül/alt montaj/hırdavat) boş kalır. Bu sayede Excel'de
ölçülere göre filtreleme/sıralama/hesaplama yapmak artık mümkün —
önceki tek metin sütununda ("800×1400" gibi) bu mümkün değildi.

## 🗂 Alt Kırılım Excel — Satır Gruplandırma (Outline / +/- Butonları)

Excel'in yerleşik "Gruplandırma" (Outline) özelliği eklendi — örnekteki
gibi sol kenarda **+/- butonları** ile alt seviyelerdeki kalemler tek
tıkla katlanıp açılabiliyor:

- Her satıra, reçete derinliğine göre bir **gruplandırma seviyesi**
  (outlineLevel) atanıyor — seviye 0 (paket başlık satırları, PKT 1/3
  vb.) her zaman görünür kalıyor, seviye 1+ olan alt kalemler gruplanıp
  gizlenebiliyor.
- Özet satırı (üst seviye/paket satırı) **grubun üstünde** kalıyor, alt
  kalemler onun altında açılıp kapanıyor — kullanıcının verdiği örnek
  görsellerdeki davranışla birebir aynı.
- Bu, standart bir OOXML (Excel dosya formatı) özelliği olduğu için
  Excel, LibreOffice Calc ve Google Sheets gibi tüm yaygın programlarda
  çalışır — kütüphanenin ücretsiz/Pro sürüm kısıtına tabi değildir
  (önceki turdaki renklendirme kısıtının aksine).

Test edilen örnekte 37 satıra doğru gruplandırma seviyesi atandığı,
XML çıktısında `outlineLevel` özniteliğinin (1, 2, 3) doğru yazıldığı
ve `summaryBelow=false` ayarının (özet satırın üstte kalması) doğru
uygulandığı openpyxl ile programatik olarak doğrulandı.

## 📊 Alt Kırılım Excel — Girinti Düzeltmesi ve Çift Para Birimi Sembolü Düzeltmesi

"📥 Alt Kırılım Excel" dökümünde iki gerçek hata bulunup düzeltildi:

1. **Girinti kayboluyordu**: Stok Kodu ve Stok Adı sütunlarında, alt
   kalemlerin (Reçeteli/Satınalma) girintisi hiç uygulanmıyordu — tüm
   satırlar aynı hizada görünüyordu. Artık her seviye için 2 boşluk
   girinti ekleniyor, ağaç hiyerarşisi Excel'de net görülüyor.
2. **Toplam Fiyat sütununda çift para birimi sembolü**: Sayı formatı
   hem hücre içine sabit "₺" ekliyordu hem de yanındaki "Dvz" sütununda
   ayrıca ₺/$/€ gösteriliyordu — sonuç "760.271 ₺₺" gibi yanlış
   görünüyordu. Artık Toplam Fiyat sütunu sade bir sayı, para birimi
   sadece "Dvz" sütununda (₺/$/€) gösteriliyor.

**Önemli not — renklendirme kaldırıldı**: Sistemde kullanılan `xlsx.js`
kütüphanesi (ücretsiz/topluluk sürümü) hücre renklendirmesini (dolgu/
font rengi) **yazmayı desteklemiyor** — bu, kütüphanenin yalnızca
ücretli/Pro sürümünde bulunan bir özellik. Önceki bir denemede eklenen
renklendirme kodu pratikte hiçbir görsel etki yaratmıyordu (sessizce
yok sayılıyordu) ve kod karmaşıklığı yaratıyordu; bu kod tamamen
kaldırıldı. Çıktı artık **renksiz ama doğru** — girinti, paket grupları,
başlıklar, sayı formatları (3 ondalık miktar/fiyat) ve sütun
genişlikleri eksiksiz çalışıyor; sadece hücre arka plan/font rengi yok.

## 🔀 Reçete (BOM) Ekranında Satır Taşıma ve Birim Değiştirme Geri Getirildi

Ürün/Yarı Mamül/Alt Montaj/Paket kart detay sayfasındaki (Reçete Yap)
basit BOM listesine, Ağaç Editörü'nde zaten var olan ama bu ekranda
eksik kalan iki kontrol eklendi:

- Her reçete kaleminin solunda **▲ Yukarı Taşı / ▼ Aşağı Taşı**
  butonları — satırların sırasını değiştirip kalıcı olarak kaydeder.
- Miktarın yanında bir **birim seçim kutusu** (ADET/M2/METRE/KG/GRAM/
  LITRE) — değiştirildiğinde anında kaydedilir.

Bu kontroller daha önce sadece Ağaç Editörü'nde mevcuttu; artık normal
Reçete Yap ekranında da (Ağaç Görünümüne geçmeden) kullanılabilir.

**Not**: Alt Kırılım Excel dökümü (📥 Alt Kırılım Excel butonu, kart
detay sayfasında) zaten önceki bir oturumda eklenmiş ve doğru
çalışıyordu — örnek dosyadaki format (girintili ağaç, ►R/•S işaretleri,
paket satırları, renk paleti, genel toplam) ile birebir uyumlu olduğu
doğrulandı.

## 💳 Tahsilat Yap — Yönetim Onayına Tabi, Kredi Kartı Taksitli, Çek Rezervasyonlu (Kökten Yeniden Tasarım)

Muhasebe Panel → Tahsilatlar → **"+ Tahsilat Kaydı Ekle"** artık tamamen
farklı çalışıyor:

- Eski basit form kaldırıldı — artık **sipariş onayında kullanılan AYNI
  Ödeme Planı formu** (Peşinat + Çek/Kredi Kartı/Nakit/Diğer sekmeleri)
  açılıyor. Bu sayede **Kredi Kartı sekmesinde Tek Çekim/Vadeli (taksit
  sayısı) seçeneği** de otomatik olarak geliyor (önceki şikayet
  çözüldü).
- Form kaydedildiğinde **hiçbir şey anında kasaya/cariye işlenmez** —
  "Yönetim Onayına Gönder" ile **Onaylar** ekranındaki yeni **"Tahsilat
  Onayları"** bölümüne düşer.
- **Çek kalemleri**: Tahsilat formunda girilen çek bilgisi (no/tutar/
  vade) Satınalma'daki tedarikçi çeki rezervasyonuna paralel bir
  mantıkla, onay bekleyen durumda kalır. **Yönetim onaylayınca** çek
  gerçekten "elde" (kullanılabilir) çekler listesine eklenir — bu
  noktadan sonra Satınalma'da seçilip tedarikçiye verilebilir.
- **Peşinat/Kredi Kartı/Nakit kalemleri**: Onaylanınca gerçek bir
  tahsilat kaydı oluşturur ve müşteri bakiyesinden düşülür.
- **Reddedilirse**: Hiçbir kasa/bakiye hareketi oluşmaz, kayıt sadece
  "reddedildi" işaretlenir.

## 🏦 Tedarikçi Ödemesinde "Kendi Çekimizle Öde"

Muhasebe Panel → Tedarikçi Ödemeleri → "+ Tedarikçi Ödemesi Ekle"
formuna yeni bir **"Kendi Çekimizle Öde"** sekmesi eklendi:

- Firmanızın kendi çekini (çek no, tutar, vade tarihi) tedarikçiye
  verdiğinizde buradan kaydedebilirsiniz.
- Eğer bu ödeme belirli bir **açık satınalma siparişiyle**
  ilişkilendirilirse, çek bilgisi **hem** Tedarikçi Ödemeleri listesine
  **hem de** o satınalma siparişinin ödeme planına (`odemeKalemleri`)
  otomatik olarak eklenir.

## 🧮 Tahsilat / Tedarikçi Ödemesi Formlarında Canlı Bakiye Özeti

Hem **Tahsilat Kaydı Ekle** hem **Tedarikçi Ödemesi Ekle** formlarına,
hesap makinesi kullanmaya gerek bırakmayan canlı bir bakiye özeti
eklendi:

- Müşteri/tedarikçi **seçildiği anda**, o carinin mevcut bakiyesi
  (müşteride: ne kadar borçlu, tedarikçide: ne kadar borçluyuz) üç
  kutucuklu bir özet olarak gösterilir.
- **Her tahsilat/ödeme kalemi eklendiğinde** (veya silindiğinde),
  "Kalan Bakiye" anlık olarak yeniden hesaplanır — mevcut bakiyeden o
  ana kadar eklenen toplam tutar düşülerek gösterilir.
- Tedarikçi Ödemesi formunda, **tutar yazılırken** veya **çek
  seçilirken** de (kaydetmeden önce) bakiye önizlemesi anında güncellenir.
- Bakiye pozitifse kırmızı, sıfır/negatifse yeşil renkte gösterilir —
  carinin durumu bir bakışta anlaşılır.

## 💵 Cari Listelerinde Hızlı "Tahsilat Yap" / "Ödeme Yap" Butonları

Cari Panel artık bakiye durumuna göre hızlı işlem butonları gösteriyor:

- **Müşteriler** sekmesinde ve müşteri detay sayfasında, eğer müşterinin
  bakiyesi pozitifse (yani **biz alacaklıysak**), **"Tahsilat Yap"**
  butonu görünür. Tıklandığında Tahsilat formu, o müşteri **önceden
  seçili** olarak açılır.
- **Tedarikçiler** sekmesinde, her tedarikçinin net bakiyesi (tüm
  satınalma siparişleri toplamı − tüm tedarikçi ödemeleri toplamı)
  hesaplanıp bir sütun olarak gösterilir. Eğer **biz borçluysak**
  (bakiye pozitif), **"Ödeme Yap"** butonu görünür ve Tedarikçi Ödemesi
  formunu o tedarikçi önceden seçili olarak açar.
- Bakiyesi sıfır veya negatif (müşteri için kredili, tedarikçi için
  borcumuz yok) olan carilerde bu butonlar gösterilmez.

## 📦 Satınalma'da Yetersiz/Kritik Stok Görünümü ve Doğrudan Sipariş

Satınalma Paneli'ne yeni bir **"Yetersiz/Kritik Stok"** sekmesi eklendi:

- Stoğu **tükenmiş** ("Yetersiz") veya Depo Panel'de tanımlı kritik
  seviyenin altına düşmüş ("Kritik") hammaddeler burada listelenir.
- Zaten bekleyen bir talebi/siparişi olan kalemler mükerrer görünmez.
- Her satırın yanındaki **"+ Sipariş Oluştur"** butonu, tek tıkla bir
  satınalma talebi oluşturur (kritik seviye tanımlıysa o seviyeye
  ulaşacak miktar otomatik önerilir) ve "Gelen Talepler" sekmesine
  düşürür — oradan normal akışla (tedarikçi seçimi, fiyat, ödeme planı)
  sipariş açabilirsiniz.

## 🤝 Tedarikçi Carileri için de Mütabakat Mektubu

Cari Panel → Mütabakat sekmesine **"Cari Tipi"** seçimi eklendi —
artık Müşteri veya **Tedarikçi** seçip mütabakat çıkarabilirsiniz:

- Tedarikçi seçildiğinde, ekstre **satınalma siparişleri** (borç) ve
  **tedarikçi ödemeleri** (alacak/kapama) üzerinden hesaplanır.
- Tamamlanmış (depo girişi onaylanmış) satınalma siparişleri **"✓
  Tamamlanmış (Kapanmış) Siparişler"** olarak, henüz tamamlanmamış
  olanlar **"⚠ Açık (Ödenmemiş/Devam Eden) Siparişler"** olarak ayrı
  listelenir.
- Aynı yazdırılabilir, imza alanlı mektup formatı (dönem başı/sonu
  bakiye, hesap ekstresi) tedarikçi tarafı için de kullanılır.

## 🐛 Kritik Düzeltme: Sırayla Çek Rezervasyonunda Sadece Son Çek Kaydediliyordu

**Gerçek bug bulundu ve düzeltildi**: Toplu satınalma onayı sonrası
sırayla açılan ödeme planı formlarında (veya "Sadece Miktar" ile toplu
sipariş açıp ardından sırayla form doldururken), **birinci siparişte
rezerve edilen bir çek, ikinci ve üçüncü sipariş formunda HÂLÂ "elde"
(seçilebilir) görünüyordu** — çünkü çek listesi sadece akışın başında
bir kez çekiliyor, sonraki adımlarda güncellenmiyordu. Bu, **"3 çek
seçtim ama Tedarikçi Ödemeleri ekranında sadece 1 tanesi görünüyor"**
şikayetinin kök nedeniydi.

Artık çek listesi **her sipariş formu açılmadan önce yeniden** Store'dan
çekiliyor — bu sayede bir önceki adımda rezerve edilen çek, sıradaki
formda otomatik olarak listeden çıkıyor ve her form farklı bir çek
seçmenizi sağlıyor. Test ettiğimde 3 farklı siparişe 3 farklı çek doğru
şekilde rezerve edilip, Yönetim onayı sonrası Tedarikçi Ödemeleri
ekranında **3 ayrı kayıt** olarak doğru göründü.

## 🔧 Toplu Onay Akışlarında Toplam Tutar + Eksik Ödeme Planı Düzeltmesi

İki gerçek sorun bulunup düzeltildi:

1. **Toplu onay butonlarında toplam tutar yoktu**: Satınalma Paneli'ndeki
   "✓ Seçilenleri Toplu Onayla" ve Yönetim Onayı'ndaki "✓ Seçilenleri
   Toplu Onayla" butonları sadece kaç kalem seçildiğini gösteriyordu,
   toplam TL tutarını göstermiyordu. Artık her ikisi de **"(3 kalem —
   ₺12.450,00)"** formatında toplam tutarı gösteriyor. Ayrıca Satınalma'nın
   "Toplu Satınalma Onayı" penceresine satır bazlı ve **GENEL TOPLAM**
   satırı eklendi — miktar değiştirildiğinde anlık güncellenir.

2. **"Seçilenleri Toplu Onayla (Sadece Miktar)" akışı ödeme planını HİÇ
   sormuyordu**: Satınalma Paneli'nde kayıtlı/varsayılan tedarikçisi olan
   kalemleri checkbox ile seçip bu butonla toplu sipariş açtığınızda,
   siparişler **hiç ödeme planı girilmeden** doğrudan Yönetim Onayı'na
   gönderiliyordu — bu yüzden çek seçip rezerve etme imkanı hiç
   sunulmuyordu. Artık toplu sipariş açıldıktan sonra, her sipariş için
   **sırayla** (1/3, 2/3, 3/3 şeklinde ilerleyerek) ödeme planı formu
   otomatik açılıyor — çek seçimi/rezervasyonu dahil. Bu sayede "Sadece
   Miktar" ile toplu açılan siparişlerde de çek rezerve edebilirsiniz.

## 💰 Sipariş Onayında Anında Ödeme İşleme (Kökten Mimari Değişikliği)

⚠ **Önemli karar değişikliği**: Sipariş Yönetim tarafından onaylanıp
üretim kuyruğuna düştüğü anda, ödeme planındaki **peşinat + çek + kredi
kartı kalemlerinin TAMAMI** artık "gerçekleşmiş ve kasaya girmiş" sayılır
— ayrı bir Tahsilat onayı **beklenmez**:

- **Peşinat**: Her zaman tam tutarıyla, **vade farksız** kasaya girer.
- **Çek**: Tutarı (vade farkı düşülerek net) kasaya girer VE çek **aynı
  anda "elde" (kullanılabilir) listesine eklenir** — Satınalma hemen
  tedarikçiye verebilir.
- **Kredi Kartı**: Tutarı (vade farkı düşülerek net) kasaya girer.
- **Vade Farkı**: Müşteri kartına eklenen **"Aylık Vade Farkı %"**
  alanına göre hesaplanır — `tutar × (vade farkı %) × (vade tarihine
  kadar olan ay sayısı, yukarı yuvarlanır)`. Vade farkı tutarı kasaya
  girmez, ayrı bir "vade farkı geliri" olarak izlenir.
- **Sadece NAKİT kalemler**, eğer vade tarihi **bugünden ileriyse**,
  hâlâ onay bekler (bkz. aşağıdaki "İleri Tarihli Nakit Alacak" bölümü).
  Nakit kalemin vadesi bugün/geçmişse, o da anında işlenir.

Müşteri kartına (Cari İşlemler → Müşteriyi Düzenle) yeni bir
**"Aylık Vade Farkı (%)"** alanı eklendi — çek ve kredi kartı ödemelerinde
ortak olarak kullanılır.

## 🔔 İleri Tarihli Nakit Alacak Uyarı Sistemi

Muhasebe Panel → Tahsilatlar artık **sadece ileri tarihli NAKİT
alacakları** gösterir (çek/kredi kartı artık buraya hiç düşmez, çünkü
zaten anında işlendi). Bu kalemlerin vadesi geldiğinde/geçtiğinde:

- **Üst Yönetim Kokpiti**'nde kırmızı bir uyarı kartı ("⚠ Vadesi Gelen
  İleri Tarihli Nakit Alacaklar") görünür, müşteri ve tutar bazında
  listelenir.
- **Cari Panel → Gecikmiş Alacaklar** sekmesinde de aynı uyarı kartı
  gösterilir.
- Tahsilat fiilen yapıldığında, Muhasebe Panel → Tahsilatlar'dan
  **"✓ Onayla"** ile veya **Alacak Takvimi**'nden onaylanır.

## 📊 Vade Farkı Özeti — Müşteri Bazlı

Muhasebe Panel'e yeni bir **"Vade Farkı Özeti"** sekmesi eklendi:

- Çek/kredi kartı ödemelerinden tahsil edilen vade farkları **müşteri
  bazlı toplanıp** rakamsal olarak gösterilir.
- Detay tablosunda her vade farkı kaydının brüt tutar, ay sayısı, vade
  farkı ve net tutarı görülebilir.
- Üst Yönetim Kokpiti'nde de "Toplam Vade Farkı Geliri" KPI'sı olarak
  özetlenir.

## 🔧 Eski Bekleyen Çek/Kredi Kartı Kayıtları İçin Otomatik Düzeltme

Önceki bir sürümde oluşturulmuş, "onay bekliyor" durumunda kalmış çek/
kredi kartı kayıtları (bu, **"siparişimdeki çekleri göremiyorum"**
şikayetinin kök nedeniydi) sistem ilk açıldığında **otomatik olarak**
tespit edilip işlenir: vade farkı hesaplanır, çek "elde" listesine
eklenir, müşteri bakiyesi güncellenir. Bu sayede önceden "kayıp" görünen
çekler artık Satınalma'da seçilip tedarikçiye gönderilebilir hale gelir.

## 📅 Alacak Takvimi — Tahsilat Onayı ile Birleştirildi

Muhasebe Panel → Alacak Takvimi → **Gün Gün Tarihli Vade Takvimi** artık
siparişin ham ödeme planından değil, **Tahsilatlar sekmesindeki AYNI**
`tahsilatBeklenenler` verisinden besleniyor. Bu sayede:

- Bir çekin/ödeme kaleminin tahsilatı fiilen yapılmışsa, **Alacak
  Takvimi'nden de "✓ Onayla"** ile onaylanabilir — Tahsilatlar
  sekmesinden onaylamakla **tamamen aynı işlemdir**: cari bakiyeden
  düşer, çek ise otomatik olarak kasaya (elde çekler listesine) girer.
- İki ekran artık birbirinden kopuk değil, aynı veriyi gösterir.

## 🔐 Satınalma Çek Rezervasyon Sistemi

Satınalma siparişine ödeme planı girerken **"Çek"** sekmesi, artık yeni
çek bilgisi yazmak için değil, müşterilerden tahsil edilmiş ve henüz
kullanılmamış ("elde") çekler arasından **seçip o tedarikçiye rezerve
etmek** için kullanılıyor:

- Çek seçilip ödeme planı **kaydedildiğinde**, çek hemen "rezerve"
  durumuna geçer — başka bir satınalma siparişinde bir daha
  **seçilemez/görünmez**.
- **Yönetim siparişi ONAYLAYINCA**, rezervasyon gerçek ciroya döner:
  çek "ciro_edildi" olur, Muhasebe Panel → Tedarikçi Ödemeleri
  sekmesinde gerçek bir ödeme kaydı oluşur.
- **Yönetim siparişi REDDEDERSE**, rezerve edilen çek otomatik olarak
  tekrar "elde" durumuna döner — başka bir satınalma siparişinde
  kullanılabilir.

## 📊 Satınalma & Yönetim Onayı — Ödeme/Nakliye Bilgisi ve Sırayla Form Akışı

- Satınalma'nın kendi **"Toplu Gönder"** ekranına ve Yönetim Onayı
  ekranındaki satınalma sipariş listesine, her sipariş için **"Ödeme &
  Nakliye"** özet sütunu eklendi (peşinat, ödeme yöntemi, nakliye bedeli
  — salt okunur, zaten girilmiş bilgi).
- Yönetim Onayı'nda **tedarikçi bazlı toplu onay** yaparken, eğer
  seçilen siparişlerden bazılarının ödeme planı **henüz girilmemişse**,
  bunlar toplu onaya dahil edilmez — bunun yerine **sırayla, her biri
  için tek tek** ödeme/nakliye formu açılır. Form kapandığında otomatik
  olarak sıradaki sipariş için form açılır. Ödeme planı zaten girilmiş
  olan diğer seçimler ise normal toplu onay akışıyla (mevcut planlarıyla,
  değişiklik yapmadan) tamamlanır.

## 🏭 Depo Girişi & Kalite Kontrol — Satınalma Siparişleri İçin Tek Tek/Toplu Akış

Yönetim bir satınalma siparişini onayladığında otomatik olarak Depo
Girişi'ne "beklenen giriş" düşer. Bu kayıtlar:

- **Depo Girişi** ekranında tedarikçi bazlı gruplanır, her giriş **"Tek
  Tek Gir"** veya tedarikçi grubunda **"📥 Seçilenleri Toplu Gir"** ile
  işlenebilir.
- Depo onayladıktan sonra **Kalite Kontrol** ekranına düşer, burada da
  aynı şekilde tedarikçi bazlı **tek tek veya toplu onay/reddet**
  yapılabilir (kalite şüphesi bildirilen girişler toplu işleme dahil
  edilmez, ayrı incelenir).

## 💳 Tahsilat Onay Akışı ("Sipariş Ödeme Planı Otomatik Tahsil Sayılmıyor")

Önceden, sipariş/teklif oluştururken girilen ödeme planı (peşinat +
çek/kredi kartı/nakit kalemleri) fatura kesildiğinde **otomatik olarak**
tahsil edilmiş sayılıyor, müşteri bakiyesi buna göre güncelleniyordu.
Artık:

- Fatura/irsaliye kesildiğinde, **peşinat dahil HİÇBİR ödeme kalemi**
  otomatik tahsil edilmiş sayılmaz. Müşteri bakiyesine **tam fatura
  tutarı** borç olarak işlenir.
- Ödeme planındaki her kalem (peşinat, her çek, her kredi kartı/nakit
  taksiti), Muhasebe Panel → **Tahsilatlar** sekmesinde yeni bir
  **"⏳ Onay Bekleyen Tahsilatlar"** bölümünde tek tek listelenir.
- Her kalem **"✓ Onayla"** veya **"✕ Reddet"** ile işlenir. Onaylanan
  kalem: müşteri bakiyesinden tutarı düşer, gerçek bir tahsilat kaydı
  oluşturur, ve eğer **çek** ise otomatik olarak "elde" (kullanılabilir)
  çekler listesine eklenir.
- Mevcut "+ Tahsilat Kaydı Ekle" (manuel, sözleşme dışı tahsilat için)
  aynen korunmuştur, ayrı bir bölümde gösterilir.

## 🏦 Tedarikçi Ödemeleri — Müşteri Çeklerini Ciro Etme

Muhasebe Panel'e yeni bir **"Tedarikçi Ödemeleri"** sekmesi eklendi:

- **"+ Tedarikçi Ödemesi Ekle"** ile tedarikçiye Havale/EFT, Nakit veya
  **"Çekle Öde"** seçenekleriyle ödeme kaydı girilir.
- **"Çekle Öde"** seçildiğinde, müşterilerden tahsil edilmiş ve henüz
  **kullanılmamış** ("elde" durumundaki) çekler bir seçim listesi olarak
  gösterilir — bu çekler sadece Tahsilatlar sekmesinden onaylanan gerçek
  çek tahsilatlarından gelir.
- Seçilen çek o tedarikçiye **ciro edilir** ("ciro_edildi" durumuna
  geçer) ve **kalıcı olarak** bu seçim listesinden çıkar — bir daha
  hiçbir tedarikçi ödemesinde tekrar gösterilmez/seçilemez.

## ⚡ Nesting/Freze Optimizasyonu — Performans Düzeltmesi ("100'lü Adetlerde Çöküyordu")

Kesim/nesting optimizasyonunda, aynı ölçüdeki parçalar **100'lerce adet**
olduğunda, her birinin ayrı ayrı çizilmesi (her biri için ayrı SVG
kutusu+yazı) tarayıcının çökmesine yol açıyordu. Artık:

- Bir plaka içinde **aynı ölçüdeki** (aynı parça adı + genişlik +
  yükseklik + rotasyon) tüm tekrarlar **tek bir temsilci kutuya**
  indirilir — kutu gerçek bir konuma çizilir, yanına **"×N"** etiketiyle
  kaç adet olduğu yazılır.
- Gerçek kesim planı verisi (her parçanın gerçek X/Y konumu, toplam
  parça sayısı) **değişmez** — sadece görsel temsil basitleştirilir.
- 142 parçalı bir test senaryosunda SVG element sayısı **144+'tan
  18'e** düştü, render süresi saniyenin altında kaldı.
- Plaka başlığında artık "142 parça (3 farklı ölçü) · %87 kullanım"
  gibi bir özet de gösterilir.

## 📋 Cari Mütabakat Mektubu

Cari Kartları ekranına yeni bir **"Mütabakat"** sekmesi eklendi:

- Müşteri ve tarih aralığı seçip **"Mütabakat Oluştur"** dediğinizde,
  o aralıktaki TÜM fatura ve tahsilat hareketleri tek bir ekstre
  halinde dökülür.
- **Dönem Başı / Dönem İçi Borç-Alacak / Dönem Sonu Bakiyesi** otomatik
  hesaplanır.
- Faturalar **"✓ Kapanmış"** (tüm ödeme kalemleri onaylanmış) ve
  **"⚠ Açık"** (tahsilat onay bekleyen veya eksik) olarak ayrı ayrı
  listelenir.
- Alt kısımda firma/müşteri imza alanları ile **"🖨 Yazdır"** butonu
  bulunur — karşılıklı imza/onay için kullanıma hazır bir belge çıkarır.

## 💰 Ağaç Editöründe Maliyet Sütunu + İnline Rota/Amortisman Ayarı

🌳 Reçete Ağaç Editörü artık her satırda maliyet bilgisi gösteriyor ve
rota/amortisman ayarlarını ayrı bir form açmadan doğrudan ağaçtan
yapmanızı sağlıyor:

- **Maliyet Sütunu**: Her satırın sağında **"Birim:"** (o kartın kendi
  birim maliyeti — hammaddede fiyat+fire+kenar bandı dahil, yarı mamül/
  alt montaj/paket/ürün'de kendi alt ağacının TAMAMININ toplam maliyeti)
  ve **"Satır:"** (birim maliyet × miktar) gösterilir. Maliyeti
  hesaplanamayan kalemler kırmızı **"⚠ Yok"** ile işaretlenir.
- **İnline Rota Seçimi**: Hammadde dışındaki her satırın (Ürün/Yarı
  Mamül/Alt Montaj/Paket) altında bir **"⚙ Rota:"** açılır menüsü
  bulunur — kart düzenleme formuna gitmeden, doğrudan ağaçtan rota
  seçebilir veya **"+ Yeni Rota"** ile sıfırdan rota oluşturup aynı
  anda o karta atayabilirsiniz.
- **İnline Amortisman ve GYG**: Aynı satırda Amortisman (₺, sabit
  rakam) ve GYG (%, manuel) alanları da doğrudan düzenlenebilir.
- **Anlık maliyet etkisi**: Amortisman/GYG/rota değişikliği yaptığınız
  anda, o satırın ve üstündeki tüm üst kartların maliyeti (ve sayfa
  altındaki genel toplam) **anında yeniden hesaplanır** — taslak
  üzerinden, gerçek veriye dokunmadan.
- **Taslak mantığı korunur**: Bu ayarlar da diğer ağaç değişiklikleri
  gibi sadece "✓ Reçete Olarak Kaydet" dediğinizde kalıcı olur. Tek
  istisna: yeni oluşturduğunuz **rota kartının kendisi** her zaman
  anında kalıcıdır (rota, kendi başına bağımsız bir veri tipidir) —
  ama o rotanın **bir karta atanması** taslakta kalır.

## 📦 Paket — Ağaç Editöründe Tam Entegrasyon

🌳 Reçete Ağaç Editörü artık Paket'i diğer kart tipleriyle (Ürün/Yarı
Mamül/Alt Montaj) eşit şekilde destekliyor:

- **Paket, herhangi bir ağaca kalem olarak eklenebilir**: Ürün, Yarı
  Mamül veya Alt Montaj seviyesinde "+ Alt Kalem" dediğinizde, Kalem
  Seçici'de artık **"Paketler"** grubu da görünüyor.
- **Paketin kendi altına kalem eklenebilir**: Ağaçta bir paket
  satırının da kendi "+ Alt Kalem" butonu var — buradan paketin
  reçetesine Ürün, Yarı Mamül veya Alt Montaj ekleyebilirsiniz (örn.
  "Paket 1 = 1 Tabla + 1 Aksesuar").
- **Ağaç içinde yeni Paket kartı/kodu oluşturma**: Herhangi bir
  seviyede "+ Yeni Kart Ekle" dediğinizde, kart tipi seçiminde artık
  **"📦 Paket"** seçeneği de var — sıfırdan yeni bir paket kodu
  oluşturup aynı anda o ağaca ekleyebilirsiniz.
- **Taşıma**: Bir paketi ağaçtaki başka bir üst kaleme ("↕ Taşı") ile
  taşıyabilir, döngüsel referans koruması burada da geçerlidir.

⚠ **Önemli düzeltme**: Ağaç Editöründe oluşturulan/değiştirilen
paketlerin **"✓ Reçete Olarak Kaydet"** dediğinizde gerçekten kalıcı
hale geldiğinden emin olundu — önceki bir sürümde bu adım paket
koleksiyonunu kaydetmeyi atlıyordu, bu düzeltildi.

## 📦 Paket — 5. Kart Tipi (Sevkiyat Öncesi Sanal Takip Kartı)

Reçete Yap ekranına **"Paketler"** sekmesi ve **"+ Paket Kodu Oluştur"**
butonu eklendi. Paket, Ürün/Yarı Mamül/Alt Montaj/Hammaddeden tamamen
bağımsız, **5. ve yeni** bir kart tipidir:

- **Amacı**: Gerçek bir üretim parçası değildir — sevkiyat öncesi
  paketleme/koli/kutu adedini reçeteyle karşılaştırmak için kullanılan
  **sanal bir takip kartıdır** (örn. "Paket 1/3", "Esas Kutu", "Ambalaj").
- **Asla MRP'ye girmez**: Bir paket, bir ürün/yarı mamül reçetesine
  normal bir kalem gibi eklenebilir (örn. "1 Koli = 1 Tabla + 1
  Aksesuar"), ama sipariş onaylandığında paket **kesinlikle**:
  - Kesim İhtiyacı listesine düşmez
  - Hammadde İhtiyacı listesine düşmez
  - Satınalma'ya talep/sipariş olarak gitmez
  - Depo/stok kayıtlarında (stokRaf) hiç görünmez
  
  Sadece "bu siparişte kaç adet bu paket var" bilgisi siparişin kendi
  üzerinde (`gerekenPaketler` alanı) tutulur.
- **Kendi reçetesi olabilir**: Paket Kodu Oluştur ile yeni bir paket
  açtığınızda, hemen ardından kendi reçete ekranı (hammadde/yarı mamül/
  alt montaj ekleme) otomatik açılır — diğer kart tipleriyle aynı UX.
  Rota, amortisman, GYG de (paketleme işçiliği için) atanabilir.
- **Excel içe aktarmada otomatik tespit**: PKT kodlu veya açıklamasında
  "paket" geçen kalemler içe aktarma önizlemesinde otomatik **Paket**
  olarak öneri verilir — ama her satırın tipini (Yarı Mamül/Alt Montaj/
  Paket) elle değiştirebilirsiniz.
- **Üretim Tamamla → Kalite Onayı → Sevkiyat İrsaliyesi zinciri**:
  - **Üretim Panel → Üretimi Tamamla**: Eğer siparişte paket varsa,
    üretimi tamamlamadan önce her paketten **kaç adet fiilen
    üretildiği/paketlendiği** sorulur (reçeteye göre beklenen adet
    referans gösterilir).
  - **Kalite Kontrol → Ürün Kalite Onayı**: "Paket Durumu" sütunu,
    onaylanan adetlerin reçeteyle uyumlu olup olmadığını gösterir.
    Uyumsuzluk varsa veya paket adedi henüz onaylanmamışsa **"Onayla"**
    butonu devre dışı kalır.
  - **Sevkiyat → İrsaliye Düzenle**: İrsaliye düzenlemeden önce, Kalite
    onaylı ve reçeteyle uyumlu paketler "Sevke Hazır" olarak işaretlenir
    — bu adım da hiçbir stok/MRP hareketi yapmaz, sadece sevk onayıdır.
- **Mevcut örnek (RD.M.14080)**: Önceden Ürün koleksiyonuna geçici
  olarak kaydedilmiş PKT01/PKT02/PKT03 paketleri, bu güncellemeyle
  otomatik olarak **gerçek Paket koleksiyonuna taşındı** — ana ürünün
  reçetesi artık bu 3 paketi `tip: 'paket'` ile referans alır.

## 🌳 Reçete Ağaç Editörü — Sınırsız Derinlikte, TASLAK Tabanlı BOM Düzenleme

Reçete Yap ekranındaki herhangi bir kartın (ürün/yarı mamül/alt montaj)
detay sayfasında artık **"🌳 Ağaç Görünümünde Düzenle"** butonu var. Bu,
mevcut kart-kart gezinilen ekranın **yanında** sunulan, tamamen yeni bir
düzenleme deneyimidir:

- **Tüm ağaç, tek sayfada, baştan sona açık**: Ürün → Paket → Yarı Mamül
  → Alt Montaj → Hammadde — kaç kademe olursa olsun (sınırsız derinlik),
  hepsi aynı anda genişletilmiş olarak görünür.
- **⚠ TASLAK MANTIĞI**: Bu ekrandaki **TÜM** işlemler — miktar/birim
  değiştirme, kalem ekleme/silme/taşıma, yeni kart oluşturma (yarı
  mamül/alt montaj/hammadde) — sadece **tarayıcı hafızasında** tutulur,
  gerçek veritabanına **anında yazılmaz**. Ekranın üst kısmında her zaman
  durumu gösteren bir etiket bulunur: **"● Kaydedilmemiş Taslak"** (amber)
  veya **"✓ Değişiklik Yok"** (gri).
- **"✓ Reçete Olarak Kaydet"**: Tüm ürün ağacını dilediğiniz gibi
  düzenleyip bitirdiğinizde bu butona basın — o ana kadar yaptığınız
  HER ŞEY (yeni oluşturulan kartlar dahil) bu tek tıklamada gerçek
  sisteme kalıcı olarak yazılır.
- **"Normal Görünüme Dön"**: Eğer kaydedilmemiş bir taslak varken bu
  butona basarsanız, önce bir uyarı gösterilir ("değişiklikleriniz
  KAYBOLACAK") — onaylarsanız taslak tamamen atılır, sisteme hiçbir şey
  yazılmaz.
- **"+ Alt Kalem"**: Ağaçtaki herhangi bir satırın altına yeni hammadde/
  hırdavat/yarı mamül/alt montaj/ürün eklenebilir — mevcut kartlardan
  seçerek veya **"+ Yeni Kart Ekle"** ile (bu da taslakta kalır, henüz
  sisteme yazılmaz).
- **"↕ Taşı"**: Bir kalemi ağaçtaki başka bir üst kaleme taşır (taslakta).
  Döngüsel referansa yol açacak taşımalar engellenir.
- **"🗑 Sil"**: Bir kalemi reçete taslağından çıkarır.
- **Plaka ölçü/kenar bandı**: Plaka satırlarının altında özet görünür,
  **"✎ Ölçü/Bandı Düzenle"** ile taslakta değiştirilebilir.
- **Toplam maliyet özeti**: Taslak üzerinden anlık hesaplanır.

⚠ **Önemli düzeltme:** Önceden bu ekrandaki her değişiklik anında
kaydediliyordu; artık tamamen taslak tabanlıdır — "Reçete Olarak
Kaydet" demeden hiçbir şey kalıcı olmaz.

## Rota Maliyeti Artık Anında Görünüyor ("Rota Eklendi Ama Maliyete Yansımıyor" Sorunu)

Bir ürün/yarı mamül/alt montaj kartına "Düzenle" formundan bir üretim
rotası atayıp kaydettiğinizde, form kapanır kapanmaz otomatik olarak
gösterilen kart detay sayfasındaki **Maliyet, Liste Fiyatı ve Kârlılık**
paneli, "Rota (İşçilik)" satırını yanlışlıkla **₺0,00** olarak
gösteriyordu — rota gerçekte doğru kaydedilmiş olsa da. Kullanıcı başka
bir sekmeye gidip geri gelene veya sayfayı yenileyene kadar doğru
maliyeti göremiyordu.

**Kök neden:** Form kapandığında ekranı yeniden çizen kod, kartın
**az önce güncellenmiş halini değil**, formun açıldığı sırada hafızada
tutulan **eski (rota atanmamış) halini** kullanıyordu.

**Düzeltme:** Kart detay sayfası artık her render edildiğinde, kartın
bilgilerini (rota, amortisman, GYG dahil) **doğrudan güncel veriden
yeniden okuyor** — bu sayede rota (veya amortisman/GYG) ataması yapıp
kaydettiğiniz an, maliyet paneli **hiçbir ek işlem yapmanıza gerek
kalmadan** doğru tutarı gösterir.

## Modal Sistemi Kökten Düzeltildi ("Pencere Arkada Kalıyor / Kayboluyor" Sorunları)

Bu, pencere (modal) sisteminin **temel mimarisinde** bulunan bir hatanın
köklü düzeltmesidir. Önceden her yeni pencere açıldığında, varsa önceki
pencerenin tüm içeriği **silinip yenisiyle değiştiriliyordu**. Bu, iç
içe pencere açılan akışlarda (örn. Sıfırdan Ürün sihirbazı Adım 3/3
içinden "+ Yeni Rota Oluştur", oradan da bir istasyon seçilince süre
sorma penceresi) ciddi sorunlara yol açıyordu:

- Sihirbaz açıkken "+ Yeni Rota Oluştur" dediğinizde, rota penceresi
  sihirbazın **arkasında** kalabiliyordu (görünmüyordu).
- Rota penceresi içinden bir istasyon seçip süre girmeye çalıştığınızda,
  o süre formu da bazı durumlarda **arkada** kalabiliyordu — bu yüzden
  süreyi giremiyor, 2./3. makinayı veya taşıma adımını ekleyemiyordunuz.
- Rotayı kaydettiğinizde, sihirbazın Adım 3/3 ekranı **tamamen
  kayboluyor**, "Ürünü Oluştur" butonuna basamıyor, reçeteyi
  kaydedemiyordunuz.

**Köklü çözüm:** Pencere sistemi artık gerçek bir **"yığın" (stack)**
mantığıyla çalışıyor:
- Her yeni açılan pencere, **kendi bağımsız katmanını** alır ve önceki
  pencereyi silmeden onun **üstüne** eklenir.
- Her pencere, o ana kadar açılmış tüm pencerelerden **daha yüksek bir
  katman önceliğiyle** (dinamik olarak artan bir sayaçla) açılır — yani
  hangi pencere **en son** açıldıysa, o her zaman **en önde** görünür.
- Bir pencere kapatıldığında, **sadece kendisi** kaldırılır; altındaki
  önceki pencere (varsa) **sapasağlam, tüm form verisiyle** geri görünür
  hale gelir.

Bu sayede artık sihirbaz → rota penceresi → süre formu gibi 3 katmanlı
iç içe pencere akışlarında, hangi sırayla açılıp kapatılırsa kapatılsın,
hiçbir pencere kaybolmaz veya arkada kalmaz.

## Sıfırdan Ürün Sihirbazı — Çok Tipli Kalem, Otomatik Alt Reçete, Rota Modalı

"Sıfırdan Ürün (Reçete + Hammadde + İşçilik)" sihirbazı önemli ölçüde
genişletildi:

- **2. Adım — Çok Tipli Kalem Ekleme**: Artık sadece yarı mamül değil,
  **Yarı Mamül, Alt Montaj, Hammadde (kategorisine göre gruplanmış: Plaka,
  Hırdavat, Kenar Bandı, Sarf Malzemesi, Yedek Parça) ve "Diğer"**
  (kendi tanımladığınız yeni bir kategori) eklenebilir. Reçete Yap
  ekranındaki aynı Kalem Seçici kullanılır.
- **Yeni Kart Oluşturunca Otomatik Alt Reçete**: Sihirbazda "+ Yeni Kart
  Ekle" ile bir **Yarı Mamül** veya **Alt Montaj** oluşturduğunuzda, kart
  kaydedildikten hemen sonra **kendi reçete ekranı otomatik açılır** —
  burada o yeni kartın altına yine hammadde/yarı mamül/alt montaj
  ekleyebilirsiniz. "✓ Tamam, Sihirbaza Dön" ile ana sihirbaza geri
  dönersiniz, yeni oluşturduğunuz kart ana ürünün reçetesine otomatik
  kalem olarak eklenmiş olur.
- **"Diğer" Kategori**: Yeni kart oluştururken "Diğer (Yeni Hammadde
  Kategorisi)" seçilirse, mevcut kategorilerden birini seçebilir veya
  tamamen yeni bir kategori adı (örn. "Conta Malzemeleri") yazabilirsiniz
  — bu kategori kalıcı olarak sisteme eklenir, bundan sonra hep listede
  görünür.
- **3. Adım — Rota Modal İçinde**: "+ Yeni Rota Oluştur" ile, **ayrı bir
  sayfaya gitmeden**, sihirbazın içinde açılan bir pencerede rota
  oluşturabilirsiniz — istasyon/hat seçimi, "+ Yeni İstasyon / Hat Ekle"
  (aşağıda açıklanan kalıcı hat sistemi) dahil tüm Rota ekranı işlevleri
  modal içinde çalışır. Kaydedilince otomatik olarak sihirbazın rota
  seçimine yansır.
- **Amortisman ve GYG**: 3. Adımda artık ürün için amortisman gideri (₺)
  ve GYG oranı (%) da girilebilir, ürün kartına kaydedilir.

## Hat / İstasyon Listesi — Artık Kalıcı Olarak Genişletilebilir

Önceden makina/istasyon listesi (HATLAR) sabit kodlanmıştı; artık
**storage'da** tutulur ve kullanıcı tarafından **kalıcı olarak**
genişletilebilir:

- Rota ekranında (veya sihirbaz/Reçete Yap içindeki rota modalında)
  **"+ Yeni İstasyon / Hat Ekle"** ile, mevcut bir hatta yeni bir makina
  ekleyebilir veya tamamen yeni bir hat adı yazıp altına ilk makinayı
  tanımlayabilirsiniz (kod, tanım, grup bilgisiyle).
- Eklenen istasyon **anında ve kalıcı olarak** kaydedilir — bundan sonra
  açılan her rota ekranında (sihirbaz, Reçete Yap, ayrı Rota sayfası)
  görünür.
- Sistemde zaten kurulu olan kurulumlar için otomatik bir geçiş
  (migration) sağlanmıştır — eski sabit listeden storage'a aktarım
  ilk açılışta otomatik yapılır, veri kaybı olmaz.

## Hammadde Kategorileri (Plaka / Hırdavat / Sarf Malzemesi / Yedek Parça / Diğer)

Hammadde kartlarına artık **kategori** ataması yapılabiliyor — bu,
"hammadde tipi" (plaka/kenar bandı/hırdavat, ölçü/fiyat davranışını
belirler) alanından **ayrı**, organizasyonel bir sınıflandırmadır:

- Hammadde formunda **"Kategori (Stok Sınıflandırması)"** alanı: Plaka,
  Kenar Bandı, Hırdavat, Sarf Malzemesi, Yedek Parça, Diğer
  (varsayılanlar) arasından seçilir.
- **"+ Yeni Kategori"** ile kendi kategorinizi (örn. "Boya Malzemesi",
  "Ambalaj Malzemesi") kalıcı olarak ekleyebilirsiniz — bundan sonra tüm
  hammadde formlarında ve Reçete Yap/Sihirbaz kalem seçicilerinde bu
  kategori altında gruplama yapılır.
- Mevcut hammaddeleriniz için otomatik bir geçiş (migration) sağlanmıştır
  — tip alanına göre mantıklı bir varsayılan kategori atanır (plaka→Plaka,
  kenar_bandi→Kenar Bandı, hirdavat→Hırdavat), siz dilediğiniz zaman
  değiştirebilirsiniz.

## RD.M.14080.S2.15.97 — Artık Gerçek, Düzenlenebilir Bir Reçete

Önceden sistemde sadece **görsel bir örnek** olarak (salt-okunur, Excel'den
gelen statik bir hiyerarşi görünümü) duran `RD.M.14080.S2.15.97` ürünü,
artık **tamamen gerçek ve düzenlenebilir** bir reçeteye dönüştürüldü.
Sistem ilk açıldığında (veya zaten kuruluysa bir kerelik otomatik
düzeltme ile) şu yapı kurulur — kullanıcının tanımladığı 5 kademeli
yapıyla birebir uyumlu:

```
RD.M.14080.S2.15.97 (ÜRÜN)
├── RDM.14080.S2.PKT01.15 (PAKET 1 — ÜRÜN kartı)
│   ├── Standart 140x80 30mm Tabla (YARI MAMÜL)
│   │   ├── Suntalam 30mm (Hammadde — plaka, En=800/Boy=1400, 4 kenar bantlı)
│   │   ├── AKSESUAR RADİKAL MASA TAKIMI OFİS (ALT MONTAJ)
│   │   │   └── Vida YSB M6*15 (Hammadde)
│   │   └── Minifix (Hammadde)
│   ├── AKSESUAR RADİKAL MASA TAKIMI OFİS (ALT MONTAJ — doğrudan pakette de var)
│   ├── Standart 1100x350mm Dikdörtgen Perde (YARI MAMÜL)
│   │   ├── Suntalam 18mm (Hammadde — plaka, En=350/Boy=1100, 4 kenar bantlı)
│   │   └── Minifix (Hammadde)
│   └── Minifix (Hammadde, doğrudan pakette)
├── RDM.14080.S2.PKT02.97 (PAKET 2 — ÜRÜN kartı)
│   ├── Radical 80lik Masa Ayağı (YARI MAMÜL) ×2
│   │   ├── B123 Radikal Kolisi (YARI MAMÜL, kendi reçetesi: Z Karton)
│   │   └── Sac, Profil, Kaynak Teli, Disk, Pul, Civata, Somun, Pingo, Boya (Hammadde)
│   └── Rm 100 Perde Tutucu (YARI MAMÜL) ×2
│       └── Sac, Civata, Boya, Hırdavat Kutusu (Hammadde)
└── RDM.14080.S2.PKT03.97 (PAKET 3 — ÜRÜN kartı)
    └── Radical Büyük Hareketli Travers (YARI MAMÜL)
        ├── M019 Kolisi (YARI MAMÜL, kendi reçetesi: Z Karton)
        └── Sac, Kaynak Teli, Boya, Somun, Vida (Hammadde)
```

Bu dönüşüm sırasında otomatik olarak:
- Eksik 10 hammadde kartı (Profil, Karbosan, M-8 Pul/Civata/Somun, Sac
  2,5mm, Hırdavat Kutusu, Z Karton 80/100cm, Vida M8x30) oluşturuldu.
- 2 kenar bandı hammaddesi `kenar_bandi` tipine çevrildi.
- Artık ürün kartının **"Düzenle"** butonu normal ürün formunu açar,
  **"+ Satıra Kalem Ekle"** ile reçeteye yeni kalemler eklenebilir —
  önceden bu ürün için tamamen devre dışıydı.
- Maliyet/Liste Fiyatı/Kârlılık paneli artık bu üründe de çalışır (önceki
  toplam: ~1.806 TL, gerçek reçete kalemlerinden recursive hesaplanır).

Bu, sisteme **gerçek bir örnek/şablon** olarak kalır — "Paket" mantığını
(yani bir ürünün reçetesine başka bir ürünü/paketi kalem olarak ekleme)
nasıl kullanacağınızı görmek için inceleyebilir, kendi yeni ürünlerinizde
aynı yöntemi (önce Paketleri ÜRÜN kartı olarak oluştur, ana ürünün
reçetesine kalem olarak ekle) uygulayabilirsiniz.

## Alt Montaj, Kenar Bandı, Rota/Amortisman/GYG ve Kârlılık Formülü

Reçete Yap ekranı, kapsamlı bir üretim maliyetleme sistemine dönüştürüldü:

- **Alt Montaj — yeni, 4. kart tipi**: Ürün/Yarı Mamül/Hammaddeden bağımsız,
  kendi kod+ID'sine sahip bir kart tipi. "+ Alt Montaj Kartı Oluştur" ile
  oluşturulur. Bitmiş ürün reçetesine **alt montaj olarak** eklenebilir,
  alt montajın kendi reçetesine de yarı mamül/hammadde/başka alt montaj
  çağrılabilir (iç içe, recursive).
- **Kenar Bandı — yeni hammadde tipi**: Hammaddeler sayfasında "Kenar
  Bandı (metre bazlı)" tipinde tanımlanır (kendi metre fiyatı ile).
- **Plaka seçiminde ölçü + kenar bandı girişi**: Reçeteye **plaka tipi**
  bir hammadde (sunta/MDF) eklenirken, miktar/birim sorulduğu formda
  ayrıca **Adet, Kaba En/Boy, Net En/Boy** (mm) ve **Ön/Arka/Sağ/Sol**
  kenarlar için kenar bandı seçimi açılır. Her kenarın bandı, hammaddeler
  listesindeki kenar bandı kartlarından seçilir.
  - **Kenar bandı maliyeti** = (o kenarın net ölçüsü + 50mm) × bant metre
    fiyatı. Ön/Arka kenarlar **Net Boy**, Sağ/Sol kenarlar **Net En**
    üzerinden hesaplanır.
  - Sipariş onaylandığında, kenar bandı ihtiyacı (metre bazında, doğru
    adet ile çarpılmış) otomatik olarak **Hammadde İhtiyacı** listesine
    ve dolayısıyla Satınalma zincirine düşer.
- **Rota, Amortisman, GYG her kart tipinde**: Ürün, Yarı Mamül ve Alt
  Montaj kartlarının düzenleme formunda artık **Üretim Rotası** seçimi,
  **Amortisman Gideri** (₺, sabit rakam, manuel) ve **GYG Oranı** (%,
  manuel — kalem+rota maliyetine uygulanır) alanları bulunur. Bu üçü de
  o kartın **toplam maliyetine** eklenir:
  `Toplam Maliyet = Kalem Maliyeti + Rota Maliyeti + Amortisman + GYG`
- **Maliyet/Liste Fiyatı/Kârlılık kartı**: Her ürün/yarı mamül/alt montaj
  detay sayfasının altında otomatik görünür. Kalem maliyeti, rota
  maliyeti, amortisman, GYG ayrı ayrı gösterilir; toplam maliyet ve
  **önerilen liste fiyatı** (Fiyatlama'daki aynı formülle: GYG×Nakliye×
  Kâr/Bölü) hesaplanır.
- **İskonto kısıtları + kârlılık formülü**: Aynı kartta **Satır İskontosu**
  (en fazla %50) ve **Dip (Genel) İskontosu** (en fazla %10) girilebilir
  — bu sınırların üzerine girilen değerler otomatik olarak sınıra çekilir.
  Kârlılık oranı şöyle hesaplanır:
  ```
  Maliyet+GYG+Nakliyeli = Toplam Maliyet × (1+GYG%10) × (1+Nakliye%7)
  Fark = Son İskontolu Fiyat − Maliyet+GYG+Nakliyeli
  Kârlılık Oranı = Fark / Son İskontolu Fiyat
  ```
  Fark ve kârlılık oranı ekranda renkli (pozitifse yeşil, negatifse
  kırmızı) gösterilir.

## Reçete Yap Ekranı — Çok Kalemli BOM, Yeni Kart Oluşturma, "Nerede Kullanılıyor"

Ürün Kartları sayfası artık **Reçete Yap** ekranı olarak çalışıyor ve
önemli ölçüde genişletildi:

- **Sekmeli grid**: hem **Bitmiş Ürünler** hem **Yarı Mamüller** aynı
  ekrandan seçilebilir — herhangi birine tıklayıp kendi reçetesini
  düzenleyebilirsiniz. Önceden sadece bitmiş ürünlerin reçetesi
  düzenlenebiliyordu; yarı mamüllerin kendi alt-BOM'u hiç yoktu.
- **Çok kalemli reçete**: bir yarı mamül artık (ürünler gibi) birden
  fazla kalemden oluşabilir — örneğin "Çekmece Gövdesi" yarı mamülü:
  MDF plaka (hammadde) + vida (hırdavat) + ray (başka bir yarı mamül)
  şeklinde tanımlanabilir. Eskiden her yarı mamül sadece TEK bir
  hammaddeye bağlanabiliyordu (bu eski yöntem hâlâ çalışır, geriye dönük
  uyumludur, ama artık zorunlu değildir).
- **"+ Satıra Kalem Ekle"**: Kalem Seçici sayfasını açar — burada
  **Yarı Mamül, Bitmiş Ürün, Hammadde (Plaka), Hırdavat** gruplarının
  hepsinden seçim yapılabilir.
- **"+ Yeni Kart Ekle"**: Kalem Seçici'de aradığınız kalemi bulamazsanız,
  kod+ad girip kart tipini (Ürün/Yarı Mamül/Hırdavat) seçerek **yeni bir
  kart gerçekten sisteme eklenir** (ilgili koleksiyona kaydedilir) ve
  aynı anda düzenlediğiniz reçeteye kalem olarak eklenir — ayrı bir ekrana
  gitmeden.
- **"📍 Nerede Kullanılıyor"**: her reçete satırının sonunda bu buton
  vardır; tıklandığında o kartın (hammadde/hırdavat/yarı mamül/ürün)
  **hangi diğer reçete(ler)de, hangi miktarda** kullanıldığını gösteren
  bir liste açılır. Bu, bir hammaddeyi veya yarı mamülü değiştirmeden
  önce etkilenecek tüm üst kartları görmenizi sağlar.
- **Maliyet hesabı güncellendi**: Fiyatlama, Teklif ve Sipariş ekranlarındaki
  yarı mamül maliyet hesaplamaları artık çok kalemli yarı mamül
  reçetelerini de (alt yarı mamüller dahil, iç içe/recursive olarak)
  doğru şekilde hesaba katar. Maliyet kaynağı önceliği: (1) çok kalemli
  reçete varsa o, (2) yoksa eski tek-hammadde bağlantısı, (3) yoksa
  manuel referans fiyatı, (4) hiçbiri yoksa "maliyet yok" uyarısı.

## Satınalma Zinciri — Tedarikçi Bazlı Toplu + Seçmeli İşlemler

Satınalma sürecinin **dört** noktasında, aynı tedarikçiye ait kayıtlar artık
**toplu olarak, checkbox ile seçilerek** işlenebilir:

1. **Satınalma → Satınalma Siparişleri sekmesi**: Onaylanmış siparişlerin
   yanında checkbox; istediğinizi seçip **"📤 Seçilenleri Toplu Gönder"**
   ile aynı tedarikçiye ait birden fazla siparişi tek seferde "Tedarikçiye
   Gönderildi" işaretleyebilirsiniz. Tek tek "Gönderildi İşaretle" butonu
   da hâlâ mevcuttur.

2. **Depo → Depo Girişi sekmesi**: Bekleyen girişler tedarikçi bazlı
   gruplanır; checkbox ile seçip **"📥 Seçilenleri Toplu Gir"** dediğinizde
   tek bir formda **ortak bilgileri** (tedarikçi, irsaliye no, fatura no,
   fatura cari ünvanı, giriş tarihi) bir kere girersiniz; her kalemin
   **kendi gelen miktarı** ve **kalite problemi işareti** ayrı ayrı
   belirtilir. Onaylandığında her kalem kendi akışından (eksik teslimat,
   karantina) geçer — tek tek girilmiş gibi.

3. **Kalite Kontrol → Depo Onaylı sekmesi**: Girişler tedarikçi bazlı
   gruplanır; **kalite problemi şüphesi olmayan** kalemler checkbox ile
   seçilebilir (problemli/karantinadaki kalemler güvenlik amacıyla toplu
   işleme dahil edilmez, tek tek incelenmelidir). **"✓ Seçilenleri Toplu
   Onayla"** ile seçilen tüm kalemler aynı anda stoğa eklenir; **"✕
   Seçilenleri Toplu Reddet"** ile topluca iade için işaretlenebilir.

4. **Yönetim Onayları → Satınalma Siparişleri**: Tedarikçi bazlı
   gruplanmış listede checkbox ile seçim yapılıp **"✓ Seçilenleri Toplu
   Onayla (Mevcut Ödeme Planıyla)"** ile, Satınalma'nın zaten girdiği
   ödeme planı (peşinat/çek/vb.) **değiştirilmeden** kabul edilerek
   topluca onaylanır ve Depo Girişi beklemesine gönderilir — modal
   açılmaz, hızlı bir toplu onay sağlar. Tek tek inceleyip ödeme planını
   düzenlemek isterseniz "İncele & Onayla" butonu hâlâ kullanılabilir.
   **"✕ Seçilenleri Toplu Reddet"** ile toplu reddetme de mevcuttur.

Her dört noktada da, her tedarikçi grubunun **kendi bağımsız checkbox
seti ve toplu işlem butonu** vardır — bir gruptaki seçim diğer
tedarikçi gruplarını etkilemez.

## Sipariş Ödeme Planı (Teklif → Cari → Yönetim, Ortak Ekran)

Ödeme planı bilgisi artık **Teklif Hazırlama'da "Siparişe Dönüştür"**
anında alınmaya başlar ve **Cari İşlemler → Yönetim** zincirinin sonuna
kadar **aynı ortak ekran üzerinden** taşınıp düzenlenir:

- **Teklif → Siparişe Dönüştür**: tıklandığında sipariş henüz
  kaydedilmeden, **sipariş içeriği + ödeme planı formu** açılır:
  - **Peşinat Tutarı** ve **Sözleşme** bilgisi
  - Kalan bakiye için **sekmeli ödeme yöntemi seçimi**: **Çek**, **Kredi
    Kartı**, **Nakit**, **Diğer**. Her sekmenin kendi alanları vardır:
    - *Çek*: vade tarihi + çek numarası + tutar — **"+ Çek Ekle"** ile
      birden fazla çek eklenebilir.
    - *Kredi Kartı*: **Tek Çekim** veya **Vadeli** (vadeli seçilirse taksit
      sayısı) + işlem tarihi + tutar.
    - *Nakit* / *Diğer*: tarih + tutar + açıklama — "Diğer" sekmesinde
      açıklamaya ödeme yönteminin adı (örn. Havale/EFT) yazılır.
  - Eklenen tüm ödeme kalemleri altta bir listede görünür, silinebilir.
  - **"Onayla ve Cari Onayına Gönder"** butonuna basılınca sipariş
    oluşturulur (ödeme planıyla birlikte) ve Cari İşlemler'e düşer.
- **Cari İşlemler → Onay sekmesi**: "Cari Onayına Al" butonuna basınca
  **AYNI ortak ekran** açılır — Teklif'te girilen tüm ödeme bilgileri
  (peşinat, çekler, kredi kartı, nakit/diğer kalemleri) önceden yüklenmiş
  gelir; Cari bunları **görüp düzenleyebilir** (miktar/fiyat değişikliği
  gerekiyorsa sipariş içeriği de aynı ekranda görünür). Müşteri risk
  limiti aşılıyorsa burada uyarı gösterilir. **"Onayla ve Yönetim
  Onayına Gönder"** ile devam eder.
- **Yönetim Onayları**: "İçerik" veya "Onayla" butonlarının her ikisi de
  **AYNI ortak ekranı** açar — Cari'nin (varsa değiştirdiği) tüm bilgiler
  görünür, Yönetim isterse tekrar düzenleyip nihai onayı verir. Liste
  görünümünde miktar/peşinat/ödeme kalemi özetleri/en son vade/vade farkı
  (Ayarlar'daki "Aylık Vade Farkı Faiz Oranı" ile manuel hesaplanır)
  gösterilir.
- **Onaylanan sipariş Üretim Planlama kuyruğuna otomatik düşer** ve kesim
  ihtiyacı/hammadde ihtiyacı zinciri oradan devam eder.
- **Sevkiyat, Yönetim onayı tamamlanmadan siparişi göremez** — irsaliye
  kesilemez.

## Bakım — Rota Makinaları Otomatik Envanter, Atıl/Satış, Arıza Akışı

- Rota planlamasında seçilebilen **tüm makina/teçhizat** (101 adet, data.js
  içindeki HATLAR listesi) otomatik olarak Bakım envanterine eklenir.
- Bir makina silinmek istendiğinde **Atıl** veya **Satıldı** seçilir;
  satıldıysa Cari Seçici'den alıcı seçilip satış bedeli girilir — bu bedel
  basit bir muhasebe/bilanço kaydına (gelir) işlenir.
- **Üretim Planlama → Arıza Bildir**: makina + arıza sebebi + öncelik
  girilip Bakım'a gönderilir. Bakım, yapacağı işlemi ve kullanacağı yedek
  parça/sarfları girer; bu kalemler otomatik olarak **Satınalma**'ya talep
  olarak düşer.

## Teklif — Düzenleme, Dönüşüm Oranı, Silme Onayı

- Teklifler artık **düzenlenebilir** (yeni ürün/yarımamül eklenebilir,
  mevcut teklif güncellenir, mükerrer kayıt oluşmaz).
- Liste ekranında **Dönüşüm Oranı** KPI'sı gösterilir.
- Bir sipariş (Cari veya Yönetim'den) reddedildiğinde, eğer bir tekliften
  geliyorsa sistem otomatik olarak **dönüşmeme sebebini** sorar (Fiyat /
  Termin / Ürün Fonksiyonu / Diğer) ve teklife işler.
- Teklif **silme**, doğrudan değil **Yönetim onayı talebi** ile yapılır.

## 3 Ambar Yapısı + Kalite Kontrol

- Depo Paneli → Sipariş Karşılama'da **3'lü stok görünümü**: Depo Stoğu,
  Satınalma Bekleyen, Üretimde Kullanılacak, Üretim Sonrası Kalan — hepsi
  aynı tabloda.
- **Kalite Kontrol** modülü: Depo Girişi'nde kalite problemi bildirilen
  hammaddeler karantinaya alınır (stoğa eklenmez); Kalite Paneli'nden
  onaylanırsa stoğa girer. Üretimi tamamlanan ürünler de **sevkiyat
  öncesi Kalite onayı** bekler — onaylanmadan Sevkiyat Deposu'na girmez,
  cari onay/irsaliye süreci başlamaz.

## Nesting — Freze Payı, Otomatik Stok Düşümü + Satınalma

- **Freze (CNC/Flat-Tabla) kesim payı**, Lineer Testere payından **ayrı**
  bir parametre (Ayarlar'dan, ikisi de bağımsız güncellenebilir).
- Kesim planı kaydedilince kullanılan plaka adedi **otomatik olarak**
  Hammadde Deposu'ndan düşer; stok yetersizse eksik miktar için **otomatik
  satınalma talebi** açılır (Satınalma bu talepteki miktarı düzenleyebilir).

## Üretim Ekranı (İstasyon Takibi & Duruş/Alarm) + ARGE/Teknik Ofis Ayrımı

- **ARGE** ve **Teknik Ofis** artık iki ayrı rol/departman (önceden
  birleşikti) — içerikleri (erişebildikleri sayfalar) aynı, ama ayrı ayrı
  seçilip raporlanabilir.
- **Üretim Ekranı**: yarı mamüllerin rotaya göre hangi istasyonda olduğu
  takip edilir (manuel ilerletme), üretimdeki **duruş/aksaklık** kayıtları
  istasyon + sorumlu departman (ARGE/Teknik Ofis dahil tüm departmanlar)
  ile açılır. Departman bazlı duruş sayısı bir eşiği aşınca **alarm
  seviyesinde** işaretlenir (Departman Alarm Özeti sekmesi).

## Tedarikçi Kalıcı Kayıt + Toplu Onay

- Hammadde kartına **Varsayılan Tedarikçi (Cari)** bir kere atanabilir.
  Bu hammadde için açılan sonraki tüm satınalma taleplerinde tedarikçi
  **otomatik gelir**, tekrar sorulmaz (henüz atanmamışsa, ilk siparişte
  seçilen tedarikçi otomatik kalıcı olarak kaydedilir).
- Satınalma Paneli'nde, tedarikçisi kayıtlı kalemler **toplu seçilip**,
  sadece miktar girilerek tek seferde sipariş açılabilir.

## Satınalma Sipariş Detayları

- Peşinat **ödeme yöntemi** (Nakit/Kredi Kartı/DBS/Havale/Çek) ve **ödeme
  vadesi** girilir; bu bilgiler miktar/birim fiyat/termin ile birlikte
  Yönetim onayında gösterilir.
- **Nakliye yöntemi** (Kargo/Parsiyel/Ambar/Kamyon/Tır/Konteyner) ve
  **nakliye bedeli** (TL/USD/EUR) girilebilir; istenirse bu bedel
  hammaddenin birim maliyetine otomatik eklenir.

## Barkod / Etiket

Yarı Mamüller sayfasında her kart için **"🏷 Barkod Etiketi Yazdır"**
butonu: kod + barkod görseli + atanmış rotanın istasyon aşamaları **4
harfli kısaltmalarla** (örn. CNCR, KENB, DELK — mevcut 3 harfli makina
kodlarıyla karışmaması için kasıtlı farklı seçilmiştir) yazdırılabilir bir
etiket olarak açılır.

## Otomatik Fatura (KDV + Avans Mahsuplaşma)

İrsaliye kesildiğinde **otomatik fatura** oluşur: müşteri carisinde
tanımlı KDV oranı (yoksa genel ayar) uygulanır, varsa alınan **peşinat bu
faturadan mahsup edilir**, kalan bakiye **anlaşılan vadeye göre müşteri
cari hesabına işlenir**. Oluşan faturalar Sevkiyat Paneli → "Otomatik
Oluşan Faturalar" sekmesinde görülebilir.

## Teklif Fiyat Listesi Otomasyonu

Fiyatlama sayfasındaki **"⚡ Tümünü Otomatik Hesapla ve Listeye Ekle"**
butonu, manuel seçim yapmadan **tüm ürün ve yarı mamüllerin** liste
fiyatını (BOM/referans maliyeti + liste fiyatı formülü ile) hesaplayıp tek
bir katalog listesine kaydeder. **Hammadde/hırdavat fiyatları Teklif
Hazırlama ekranında hiç görünmez ve seçilemez** — sadece yarı mamül ve
bitmiş ürün liste fiyatları teklif edilebilir.

## Planlama → Satınalma → Depo Zinciri

Bu sürümle birlikte üç yeni modül birbirine bağlandı:

### 1) Üretim Planlama — Hammadde İhtiyacı
Bir sipariş onaylandığında, ürünlerin **tüm reçete kalemleri** (sadece plaka
değil; vida, menteşe, kenar bant, her türlü hırdavat dahil) hammadde bazında
toplanıp **Üretim Planlama → Hammadde İhtiyacı** sekmesine tek bir konsolide
listede birikir (birden fazla siparişten gelen aynı hammadde miktarları
toplanır). Planlama bu listede:
- Miktarları manuel düzenleyebilir
- Kalem silebilir veya "+ Manuel Kalem Ekle" ile yeni hammadde ekleyebilir
- **"✓ Onayla ve Satınalmaya Gönder"** ile listeyi kapatıp Satınalma
  Paneli'ne otomatik satınalma talepleri olarak gönderir

(Plaka tipi hammaddeler bu listeye girmez — onlar zaten ayrıca **Kesim
Optimizasyonu**'na hammadde bazlı satır olarak düşer, orada yönetilir.)

### 2) Satınalma — Fiyat Gir & Sipariş Aç
Satınalma Paneli'nde "Gelen Talepler" sekmesinde, Planlama'dan veya
Üretim/Depo'dan gelen her kalem için **"Fiyat Gir & Sipariş Aç"** butonu:
tedarikçi seçilir, birim fiyat girilir (isteğe bağlı olarak hammadde
kartındaki fiyatı da güncelleyebilirsiniz), termin günü belirlenir. Bu,
gerçek bir **Satınalma Siparişi** oluşturur ve Yönetim onayına gönderir.

**Satınalma Siparişleri** sekmesinde onaylanmış siparişleri "Tedarikçiye
Gönderildi" olarak işaretleyebilir, ve her sipariş için **"Çıktı Al"**
butonuyla **Excel (.xlsx)** veya **PDF** formatında resmi sipariş belgesi
indirebilirsiniz (PDF, tarayıcının yazdırma penceresi üzerinden "PDF olarak
kaydet" seçeneğiyle alınır).

### 3) Yönetim Onayları — Satınalma Siparişi Onayı
Satınalma'nın açtığı siparişler Yönetim Onayları sayfasına düşer; onaylanan
sipariş "Onaylandı (Tedarikçiye Gönderilebilir)" durumuna geçer.

### 4) Depo — Manuel Stok, Karşılama Oranı, Kritik Stok
- **Tüm Stoklar** sekmesinde her hammadde/yarı mamül/ürünün miktarı
  doğrudan tabloda düzenlenebilir (otomatik kaydedilir, stok hareketi
  log'una da işlenir).
- **Sipariş Karşılama** sekmesi: açık/onaylanmış hammadde ihtiyacı
  kalemlerini depo stoğuyla karşılaştırır (**Karşılama = Depo Stoğu −
  Toplam İhtiyaç**). Eksiye düşen (negatif) kalemler kırmızı satır ve
  "⚠ EKSİ — YETERSİZ STOK" etiketiyle işaretlenir.
- **Kritik Stok Seviyeleri** sekmesi: her hammadde için **manuel, miktar
  bazlı** bir kritik stok eşiği tanımlanır (sistemde henüz geçmiş sarf
  verisi olmadığından otomatik hesaplama yapılmaz — stok hareketleri
  biriktikçe ileride otomatik öneri eklenebilir). Stok bu eşiğin altına
  düşerse satır kırmızıya döner ve **"Satınalmaya Talep Aç"** butonu çıkar.
  **Bu buton hem Depo Paneli'nde hem Üretim Planlama'nın Hammadde İhtiyacı
  sekmesinde aynı şekilde mevcuttur — Depo VEYA Planlama, herhangi biri
  onaylayıp talep açabilir.**

## Excelden Reçete İçe Aktarma

Ürün Kartları sayfasındaki **"⬆ Excelden Reçete İçe Aktar"** butonu, hiyerarşik
bir BOM/reçete export dosyasını (LevelNo, PathKod, LineType, StokKod, Miktar,
BirimFiyat, DovizKod, en, Boy sütunlu .xlsx) okuyup otomatik olarak:

1. **Hammadde/hırdavat** kalemlerini tanır ve kaydeder (plaka/hırdavat tipi
   otomatik tahmin edilir, önizlemede düzeltebilirsiniz)
2. **Yarı mamül/montaj** kalemlerini tanır ve kaydeder (Excel'deki fiyat,
   "referans fiyat" olarak ayrıca saklanır — BOM hesabından bağımsız bir
   kontrol değeridir)
3. **Nihai ürünü** ve onun **reçetesini** oluşturur

Dosyayı seçtiğinizde kaydetmeden önce bir **önizleme** gösterilir: kaç yeni
kayıt açılacağı, kaç mevcut kayıt güncelleneceği (StokKod eşleşmesine göre),
ve hammadde tip tahminlerini düzeltme imkanı. Aynı dosyayı tekrar içe
aktarırsanız, eşleşen StokKod'lar güncellenir — mükerrer kayıt oluşmaz.

İçe aktarılan tüm kayıtlar normal şekilde **Hammaddeler** ve **Yarı Mamüller**
sayfalarından düzenlenebilir (fiyat güncelleme, hammadde ataması değiştirme, vb.)

## Teklif & Sipariş Ekranlarında Maliyet Gösterimi

Hem Teklif Hazırlama hem Siparişler sayfasındaki "Kalem Ekle" alanı artık
**bitmiş ürünler, yarı mamüller ve hammadde/hırdavatın hepsini** maliyetiyle
birlikte gösterir (üç ayrı grup halinde). Maliyet öncelik sırası:
1. Katalogdaki kayıtlı liste fiyatı (varsa)
2. BOM'dan hesaplanan maliyet (hammadde ataması üzerinden)
3. Yarı mamülün/ürünün referans fiyatı (Excel'den veya manuel girilen)

Üçü de yoksa kalem **"⚠ MALİYET YOK"** ile işaretlenir; bu kalemi seçip
eklediğinizde bir uyarı penceresi açılır ve devam etmek için **manuel fiyat
girmeniz** istenir — sessizce sıfır fiyatla eklenmez.

Aynı uyarı mantığı **Maliyet & Liste Fiyatı** sayfasında da çalışır: bir
ürünün reçetesinde maliyeti hesaplanamayan kalemler varsa kırmızı bir uyarı
kartında listelenir, "Fiyat Gir" butonuyla oradan da hızlıca düzeltebilirsiniz.

Veriler tarayıcınızın "localStorage" alanında saklanır — kullandığınız
**spesifik tarayıcıya** bağlıdır (Chrome'da girilen veri Edge'de görünmez).
Bu yüzden hep aynı tarayıcıyı kullanmanızı öneririz.

## Sorun Giderme

**Kırmızı uyarı şeridi görüyorum:**
Dosyayı çift tıklayarak açmışsınız. "Doğru Açma Yöntemi" adımlarını izleyin.

**BASLAT.bat çalıştırınca hiçbir şey olmuyor / hemen kapanıyor:**
Sağ tıklayıp "Yönetici olarak çalıştır" deneyin. Python'un kurulu olduğundan
emin olun (komut isteminde `python --version` yazıp Enter'a basın).

**Veriler bir süre sonra kayboldu:**
Tarayıcı geçmişi/çerezleri "tüm zamanlar" seçeneğiyle temizlendiyse
localStorage da silinir. Tarayıcı ayarlarınızda otomatik temizlik
özelliği açıksa `localhost` adresini istisna listesine ekleyin.

**Bir ekranda kayıt yapmıyor / başka ekrana geçince veri görünmüyor gibi
geliyor:** Önce kırmızı uyarı şeridi olup olmadığını kontrol edin (yukarıya
bakın). Şerit yoksa ve F12 konsolda kırmızı hata görüyorsanız, hangi
ekranda olduğunu not edip bildirin.

**Birden fazla kişi aynı veriyi görsün istiyorum:**
Bu sürüm tek kişi/tek bilgisayar içindir. Paylaşımlı kullanım için sunucu
sürümü (PHP + SQLite) ayrıca hazırlanmıştır.
