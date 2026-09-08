# GÜNCELLEME — Hat Operatör Terminali: Ana Ekrandan Giriş + Kişi Bazlı Yetkilendirme

Bu paketle gelen değişiklikler 5 dosyadadır: `app.js`, `storage.js`,
`page_hat_terminal.js`, `page_hat_takip.js`, `api.php`.
Mevcut kurulumu güncelliyorsanız yalnızca bu 5 dosyayı FTP ile üzerine
yazmanız yeterlidir — `data.sqlite` (verileriniz) etkilenmez. Yükledikten
sonra tarayıcıda Ctrl+Shift+R yapın (sw.js önbelleğini tazeler).

## 1) Operatör girişi artık ANA GİRİŞ EKRANININ ALTINDA

Kullanıcı adı/şifre kartının altında **"📱 Hat Operatör Terminali —
Operatör Girişi"** tuşu vardır. Operatörler ÜretimOS'a hiç giriş yapmadan
buradan doğrudan terminale girer:

- Kenar menü ve diğer tüm ekranlar operatöre KAPALIDIR.
- Sayfa yenilense bile operatör terminalde kalır.
- "← Ana Giriş Ekranı" tuşu operatör oturumunu sonlandırıp girişe döner.

## 2) Şifre oluşturma talebi → yönetim onayı

Şifresi olmayan operatör terminal giriş ekranındaki **"🔑 Şifre Oluşturma
Talebi Aç"** tuşuyla adını, istediği şifreyi ve çalışacağı hat/bölümleri
seçerek talep açar. Talep yönetime düşer; onaylanana kadar giriş yapamaz
(ekranda "talebiniz yönetim onayında" uyarısı görür).

## 3) Yönetim ekranından hat/bölüm bazlı yetkilendirme

**Hat & İstasyon Takibi → 👤 Operatör Yetkileri** (bekleyen talep varsa
tuşta kırmızı "X talep" rozeti görünür):

- **Bekleyen Talepler:** Operatörün istediği hatlar işaretli gelir; yönetim
  hat ekleyip çıkararak **Onayla** der → operatör yalnızca işaretli hatlara
  girebilir. **Reddet** ile talep kapatılır.
- **Yetkili Operatörler:** Üstteki menüden hat/bölüm seçilerek filtrelenir.
  **✎ Düzenle** ile kişi bazlı yetki alanları işaretlenerek eklenir/eksiltilir,
  şifre sıfırlanır, hesap pasife alınır. **🗑** ile silinir.
  **+ Operatör Ekle** ile yönetim talepsiz de doğrudan operatör tanımlar.

Operatör yetkili olmadığı bir hatta girmeye çalışırsa sunucu reddeder ve
yetkili olduğu hatları listeler.

## 4) Sunucu güvenliği (api.php)

- Yeni uçlar: `hatListesi` (yalnızca hat ADLARINI döner, veri sızdırmaz),
  `hatGiris` (kişi doğrulama SUNUCUDA yapılır), `hatSifreTalep`
  (oturumsuz ama kaba kuvvet korumalı — normal login ile aynı IP havuzu).
- Operatör girişine `hat_operator` rolünde **KISITLI token** verilir:
  yalnızca terminalin ihtiyaç duyduğu koleksiyonları okuyabilir
  (rotalar, iş kartları, iş emirleri, siparişler, yarı mamüller, reçeteler,
  ürünler, makinalar, gerçekleşen süreler) ve yalnızca
  `istasyonIsleri` + `gerceklesenSureKayitlari`ne yazabilir.
  Cari, fiyat, muhasebe, İK, operatör şifreleri vb. operatör token'ına
  TAMAMEN KAPALIDIR (403).
- Tüm operatör girişleri ve şifre talepleri denetim kaydına (audit) işlenir.

## 5) Geçiş dönemi notu

Eski **ortak hat şifresi** (🔑 Hat Şifreleri, varsayılan 1234) geçiş kolaylığı
için ÇALIŞMAYA DEVAM EDER — kimse kilitli kalmaz. Tüm operatörler kişisel
şifrelerini aldıktan sonra, Hat & İstasyon Takibi → 🔑 Hat Şifreleri'nden her
hattın ortak şifresini tahmin edilemez uzun bir değere çevirerek ortak girişi
fiilen kapatabilirsiniz.

> Not: Operatör şifreleri ve hat ortak şifreleri, tasarım gereği yönetimin
> görebilmesi için veritabanında düz metin saklanır (ÜretimOS kullanıcı
> şifreleri ise bcrypt ile korunmaya devam eder). Operatör şifrelerini
> ÜretimOS kullanıcı şifrelerinizden FARKLI seçtirin.

## 6) SORUN GİDERME — "Giriş ekranı çıkmıyor / sayfa bembeyaz"

Bu sürümde uygulama, sunucu API'si arızalı olsa bile giriş ekranını HER
KOŞULDA çizer ve sorunun sebebini kırmızı bir uyarı bandında gösterir.
Buna rağmen sorun yaşarsanız:

1. Tarayıcıda şu adresi açın: `https://siteniz.com/api.php?action=hatListesi`
   - `{"ok":true,"hatlar":[...]}` görüyorsanız sunucu SAĞLIKLIDIR →
     Ctrl+Shift+R ile sayfayı tam yenileyin (eski önbellek temizlenir).
   - Hata/boş sayfa görüyorsanız sorun sunucudadır, sırayla:
2. cPanel → **Select PHP Version** → PHP **8.0 veya üzeri** seçin.
3. Aynı ekranda **Extensions** sekmesinde **pdo_sqlite** ve **sqlite3**
   işaretli olmalı.
4. File Manager'da site klasörüne sağ tık → **Permissions** → 755 (sorun
   sürerse 775). PHP'nin `data.sqlite` ve `backups/` OLUŞTURABİLMESİ gerekir.
5. Dosyaların tamamının yüklendiğini doğrulayın — özellikle `.htaccess`
   (gizli dosya; File Manager'da "Show Hidden Files" açık olmalı) ve
   `xlsx.full.min.js`.

## 7) "Giriş ekranı geldi ama operatör tuşu görünmüyor"

Bu, tarayıcının ESKİ app.js dosyasını önbellekten çalıştırdığı anlamına
gelir. Bu sürümde index.html'deki tüm script bağlantılarına `?v=6` sürüm
damgası eklendi — index.html ve sw.js zaten önbelleksiz olduğundan, bu
paketi yükledikten sonra TÜM kullanıcılar ilk yenilemede otomatik olarak
güncel dosyaları alır (Ctrl+Shift+R'ye bile gerek kalmaz).

Kontrol: cPanel File Manager'da `app.js` dosyasının boyutu ~263 KB ve
tarihi bugünün tarihi olmalı. Küçük/eski görünüyorsa dosya üzerine
yazılmamış demektir — zip'ten tekrar yükleyin.

## 8) YENİ — Kartlara QR Kod + Teknik Dosya Alanı (v8)

Bitmiş ürün, yarı mamül, alt montaj, ürün paketi ve hammadde/hırdavat
kartlarının HER BİRİNE artık QR kod ve dosya alanı verilebilir:

- **Kartlar** sayfası → bir karta tıklayın → üstteki **📎 QR & Teknik
  Dosyalar** tuşu. **Hammadde/Hırdavat** sayfasında her satırın sonunda **📎**.
- Açılan pencerede: kartın QR etiketi (🖨 yazdırılabilir), bağlantı kopyalama
  ve dosya alanı. **step, stp, dwg, dxf, pdf, xls, xlsx, csv, png, jpg,
  webp, gif** yüklenebilir (dosya başına 15 MB).
- Telefonla QR okutulunca mobil uyumlu bir sayfa açılır: dosyalar listelenir,
  resimler önizlemeli görünür, tek dokunuşla indirilir. **Uygulama girişi
  gerekmez** — erişim, QR içindeki tahmin edilemez anahtarla korunur;
  bağlantıyı/etiketi görmeyen kimse ulaşamaz.
- Dosyalar sunucuda `dosyalar/` klasöründe rastgele adlarla saklanır;
  klasöre doğrudan URL erişimi kapalıdır (indirme yalnızca api.php'den).
  Yükleme/silme yalnızca girişli personel içindir; operatör terminali
  token'ı dosya yükleyemez/silemez. Tüm yükleme/silmeler denetim kaydına işlenir.
- 15 MB'lık dosyalar için hosting'de `upload_max_filesize` ve
  `post_max_size` değerlerinin en az **24M** olması gerekir (cPanel →
  Select PHP Version → Options). Daha küçük dosyalarda ayara gerek yoktur.

## 9) YENİ — İş Kartlarında "📁 Dosyalar" Tuşu + Menülerin İngilizcesi (v9)

**a) İş kartlarından teknik dosyalara tek dokunuşla erişim**

Hem **Hat & İstasyon Takibi** ekranındaki iş kartlarında (🏷 QR Etiket
tuşunun yanında) hem de **Hat Operatör Terminali**'ndeki kartlarda
(➜ Sevk tuşunun yanında) artık **📁 Dosyalar** tuşu var. Basınca, o
parçaya ait teknik dosya sayfası yeni sekmede açılır: step/dwg/pdf/excel/
resim dosyaları listelenir, resimler önizlemeli görünür, tek dokunuşla
indirilir. Telefonda da aynı sayfa açılır.

- Parça, dosya kaydında **ID'siyle** bulunamazsa **koduyla** aranır; bu
  sayede aynı kod farklı iş emirlerinde de doğru dosyalara bağlanır.
- Dosya yüklenmemiş parçalarda "henüz dosya yüklenmemiş" uyarısı çıkar.
- **Operatörler de kullanabilir** (sahada teknik resme bakmak için), ama
  operatör oturumu dosya **yükleyemez/silemez** — yükleme yalnızca
  Kartlar ve Hammadde ekranlarındaki 📎 tuşundan, girişli personelce yapılır.

**b) Menü ve alt menü başlıkları İngilizce**

Üst bardaki **🌐 TR/EN** düğmesiyle arayüz dili değiştiğinde artık 12 grup
başlığının (GENEL→GENERAL, ÜRETİM→PRODUCTION, İNSAN KAYNAKLARI→HUMAN
RESOURCES, MUHASEBE→ACCOUNTING vb.) ve 44 menü öğesinin **tamamı**
İngilizceye çevrilir. Önceki sürümde grup başlıkları Türkçe kalıyordu.

## 10) DÜZELTME — Kart formundan yüklenen dosyalar QR alanında görünmüyordu (v10)

**Sebep:** Kart formlarındaki ("Yarı Mamül Düzenle" → *Teknik Dosyalar*) alan,
dosyayı **kartın içine** gömüyordu; v8'de eklenen QR dosya alanı ise dosyaları
**sunucuda** saklıyor. İki depo ayrı olduğu için formdan yüklenen dosya,
iş kartındaki 📁 Dosyalar tuşunda "henüz dosya yüklenmemiş" olarak görünüyordu.

**Çözüm (iki yönlü):**
1. **Bundan sonra:** Kart formundan dosya yükleyip **Güncelle**'ye bastığınızda
   dosyalar otomatik olarak QR dosya alanına da aktarılır. Form artık
   **step, stp, dwg, dxf, pdf, xls, xlsx, csv ve resim** kabul eder (önceden
   yalnızca resim/PDF idi).
2. **Daha önce yüklenmiş dosyalar:** Güncellemeden sonraki ilk girişte
   tek seferlik bir aktarım arka planda çalışır ve TÜM kartlardaki
   (yarı mamül, ürün, alt montaj, paket) gömülü dosyaları QR alanına taşır.
   Kartları tek tek açmanıza gerek yoktur; bitince "N kart dosyası QR alanına
   aktarıldı" bildirimi çıkar. Aktarım bir kez çalışır, tekrar etmez.

Bundan sonra dosya yüklemek için iki yol da geçerlidir: kart formundaki
*Teknik Dosyalar* alanı veya Kartlar/Hammadde ekranındaki **📎** tuşu.

## 11) YENİ — Tüm modül içerikleri İngilizce (v11)

Önceki sürümde yalnızca sol menü çevriliyordu; sayfa başlıkları, sekmeler,
tuşlar, tablo sütunları ve form etiketleri Türkçe kalıyordu (bu metinler
60+ sayfa dosyasının içine gömülü olduğu için).

**Çözüm:** i18n.js'e bir **DOM çeviri katmanı** eklendi. Sayfa çizildikten
sonra ekran taranır ve sözlükte **birebir eşleşen** metinler çevrilir.
E�leşme tam olduğundan **kullanıcı verisi asla bozulmaz** — ürün adları,
stok kodları, müşteri ünvanları olduğu gibi kalır.

- Sözlüğe ~700 karşılık eklendi: sayfa başlıkları, alt açıklamalar, sekmeler,
  aksiyon tuşları, tablo sütun başlıkları ve form etiketleri.
- Sayı içeren kalıplar kural tabanlı çevrilir
  (örn. "Yarı Mamül — 31 kayıt" → "Semi-Finished — 31 records").
- Açılır pencereler (modal), geç yüklenen bölümler ve dinamik içerik de
  MutationObserver ile otomatik çevrilir.
- 🌐 EN → TR geçişinde her şey Türkçeye döner; seçim tarayıcıda saklanır.

**Test:** 44 sayfanın tamamı ve form pencereleri tarandı — çevrilmemiş
Türkçe metin **sıfır**; kullanıcı verisi değişmedi.

## 12) DÜZELTME — Logo "PRODUCTIONOS" görünüyordu + mobil tuş taşması (v12)

**a) Logo artık çevrilmiyor.** Üst bardaki ÜRETİMOS logosu "ÜRETİM" + "OS"
parçalarından oluştuğu için, DOM çeviri katmanı "ÜRETİM" kelimesini
(menü grup başlığı olarak sözlükte var) PRODUCTION'a çeviriyor ve logo
"PRODUCTIONOS" oluyordu. Logo artık `data-i18n-skip` ile korunuyor —
marka adı hiçbir dilde değişmez.

**b) TR'ye dönüş artık sabit alanları da geri alıyor.** Dil TR'ye
alındığında sayfa gövdesi yeniden çizildiği için düzeliyordu, ama üst bar
gibi hiç yeniden çizilmeyen alanlar İngilizce kalıyordu. Çevrilen her
metnin özgün hali saklanıyor ve TR'ye dönüldüğünde geri yükleniyor.

**c) "Hat Operatör Terminali" tuşu dar ekranda taşmıyor.** Tuş artık iki
satıra sarıyor, yazı boyutu ekran genişliğine göre ölçekleniyor
(11–13px arası) ve uzun kelimeler bölünebiliyor.

## 13) YENİ — İnteraktif Tanıtım Turu (v13)

Giriş ekranına mor-mavi **"🎮 Sistemi Tanıyın — İnteraktif Tur"** tuşu eklendi.
Tıklayan kişi, bir siparişin teklif aşamasından fabrika kapısından çıkışına
kadar izlediği yolu **10 duraklık oyunlaştırılmış bir yolculuk** olarak
deneyimler. **Giriş yapmak gerekmez**, gerçek verilere dokunmaz.

**Duraklar:** Genel bakış → Teklif → Sipariş → Reçete (BOM) → MRP →
Satınalma (3 teklif) → İş emri & çizelgeleme → Üretim sahası (QR) →
Kalite & DÖF → Sevkiyat, e-Fatura & kârlılık.

**Her durakta:**
- Hikâye (gerçek bir sipariş üzerinden: 12 adet ofis masası)
- Simüle edilmiş ekran görüntüsü (tablo, reçete ağacı, Gantt, terminal kartı)
- **🎯 Görev** — çoktan seçmeli karar sorusu, anında açıklamalı geri bildirim
- **⚠ Nelere Dikkat Etmeli** — sahada en sık yapılan hatalar
- **✓ Bu Adımın Kazancı** — o adımın işletmeye somut faydası

**Oyun öğeleri:** ilerleme çubuğu, puan (doğru cevap 100, yanlış 40),
her duraktan bir rozet, sonunda ünvan (Üretim Ustası / Planlama Uzmanı /
Çırak) ve başarı yüzdesi. İlerleme tarayıcıda saklanır — kapatıp sonra
açınca **kaldığı yerden devam** eder.

**Final ekranı:** ÜretimOS'un 7 temel kazancı ve kurulumda en sık yapılan
6 hata özetlenir; "Sisteme Giriş Yap" tuşuyla giriş alanına döner.

Tur mobil uyumludur (dar ekranda tek sütuna iner) ve ESC ile kapanır.

## 14) YENİ — Sistem Rehberi (Ayrıntılı Tanıtım) (v14)

Giriş ekranına, interaktif turun **ÜSTÜNE** lacivert **"📖 Sistem Rehberi —
Ayrıntılı Tanıtım"** tuşu eklendi. Sıralama artık şöyledir:

1. **📖 Sistem Rehberi** — önce okunur (programın tamamı, referans)
2. **🎮 Uygulamalı Test** — sonra denenir (öğrenileni görevlerle sınama)
3. **📱 Hat Operatör Terminali** — sahadaki operatör girişi

Rehberin son bölümünde **"🎮 İnteraktif Tura Geç"** tuşu vardır; rehber
kapanır ve tur açılır.

**8 bölüm:**
- **🗂 Hiyerarşik Yapı** — 12 grup, 44 modül; hangi grup neyi besler
- **🔄 Ana Akış** — teklif→sevkiyat 12 aşama; her aşamada oluşan kayıt ve
  tetiklediği modül
- **🔗 Veri Akışı** — hangi veri nerede oluşur, nerelerde okunur
  (aynı bilgi neden iki kez girilmez)
- **🌿 Yan Kollar** — kalite reddi/DÖF, iade ambarı, bakım/duruş, İSG, İK,
  satış sonrası servis, çek portföyü, kesim optimizasyonu; her birinin
  nereden çıkıp nereye döndüğü ve beslediği rapor
- **📈 Rapor Haritası** — 25 rapor: adı, hangi ekranda, hangi hareketten
  beslendiği (üretim / satış-maliyet / stok-satınalma / finans-İK grupları)
- **🎯 Yönetim Raporlarına Yansıma** — "sahada şu olursa şu gösterge değişir"
  tablosu + beş yönetim ekranı arasındaki fark
- **🔐 Roller & Yetkiler** — 10 rol, erişim alanları, onay zinciri,
  operatör yetkilendirme akışı
- **🚦 Doğru Kurulum Sırası** — 10 adım, her adımda ne girilir ve neden

Rehber mobil uyumludur (dar ekranda sol menü açılır listeye döner),
ESC ile kapanır ve gerçek verilere dokunmaz.

## 15) TASARIM SİSTEMİ — 1. Aşama: İkon seti + tipografi + erişilebilirlik (v15)

iF Design Award hazırlığının ilk adımı. Üç kalıcı sorun giderildi:

**a) İkon sistemi (ikon.js — YENİ).** Menüde 44 modül vardı ama yalnızca
15 farklı simge kullanılıyordu: "▤" dört modülde, "◍" beş İK modülünde
aynıydı; ayrıca emoji (🔲 🏭 📱 🚚 …) kullanılıyordu. Emoji, tasarım
jürileri için "bu ürüne tasarımcı dokunmamış" anlamına gelen en hızlı
sinyaldir. Yerine projeye özel çizilmiş bir ikon kütüphanesi kondu:

- 24 × 24 ızgara, 1.6 birim çizgi, yuvarlatılmış uç/köşe
- currentColor — bulunduğu metnin rengini alır, tema ile uyumlu
- **44 modülün her birine ayrı metafor** (hiçbir ikon tekrar etmiyor)
- Ayrıca ~40 arayüz/eylem ikonu (ara, süz, ekle, kaydet, yazdır, indir…)
- Kullanım: `Ikon.ciz('kaydet')` · `Ikon.menu('hammadde')`

**b) Tipografik ve aralık ölçeği.** Rastgele px değerleri yerine adlandırılmış
basamaklar: `--fs-2xs … --fs-3xl`, `--lh-*`, `--fw-*`, `--sp-1 … --sp-10`
(4px tabanlı) ve `--gecis-*` hareket süreleri.

**c) Erişilebilirlik.** `--text3` rengi #94a3b8 idi; beyaz üzerinde kontrast
oranı ~2,6:1 ile **WCAG AA'yı geçmiyordu**. #64748b yapıldı (~4,8:1, AA
uyumlu); eski ton `--text4` olarak yalnızca dekoratif kullanımda kaldı.
Ayrıca klavye kullanıcıları için `:focus-visible` odak halkası ve
`prefers-reduced-motion` desteği eklendi.

**Sıradaki aşamalar:** bilgi yoğunluğunu azaltma, satır içi stillerin
bileşen sınıflarına taşınması, boş durum (empty state) tasarımları,
tablo okunabilirliği, ve iF başvurusu için vaka çalışması + görsel paket.

## 16) YENİ — Kalite Kontrol Planı (v17)

"Kontrol et" demek kalite sistemi değildir. Kalite sistemi operatöre şunu
söyler: **bu parçada, bu istasyonda, şu özelliği, şu toleransla, şu aletle,
şu sıklıkta ölç.** Bu sürümle o yapı kuruldu.

**Kalite Kontrol → Kontrol Planı sekmesi.** Her yarı mamül/ürün için kontrol
maddeleri tanımlanır:
- **Özellik** (Net boy, kenar bandı yapışması, yüzey çizik…)
- **Tip:** ölçü (sayısal) · görsel (var/yok) · fonksiyon · yüzey kalitesi
- **Hedef değer + alt/üst tolerans + birim** — tolerans, hedefe göre
  **sapma**dır: hedef 1200 mm, alt −2, üst +2 → kabul aralığı 1198–1202 mm
- **Ölçüm aleti** (kumpas, mastar, gönye, şerit metre, gözle muayene…)
- **Sıklık:** her parçada · ilk parçada (kurulum onayı) · numune (her N adette)
  · vardiya başına
- **İstasyon:** boş bırakılırsa tüm istasyonlarda geçerli, doldurulursa
  yalnızca o istasyonda sorulur
- **Kritiklik:** kritik maddeler doldurulmadan kalite onayı verilemez

**Operatör terminalinde.** Operatör "✓ Kalite" tuşuna bastığında artık boş bir
onay penceresi değil, o parça ve istasyona ait **kontrol listesi** açılır.
Ölçüm girildikçe anında değerlendirilir; tolerans dışı değerde uyarı çıkar ve
operatör kalite reddi yoluna yönlendirilir. Girilen her değer **Ölçüm
Kayıtları**na işlenir — kim, ne zaman, hangi parçada, hangi değeri ölçtü.

**Neden önemli:** Kusurun hangi ölçüde, hangi istasyonda, hangi vardiyada
başladığı artık rakamla görülebilir. Kök neden analizi tahmine değil ölçüm
verisine dayanır. Kontrol planı tanımlı olmayan parçalarda eski akış aynen
çalışmaya devam eder — geçiş kademelidir.

**Düzeltme:** İlk sürümde tolerans değerleri mutlak sınır sanılıyordu
(hedef 1200 mm'ye 1200 mm ölçüm "tolerans dışı" çıkıyordu). Artık hedefe göre
sapma olarak doğru hesaplanıyor.

## 17) YENİ — Envanter Sayımı (v18)

Yarı mamül stoğunu elle sayıp deftere yazma dönemi biter.
**Depo Paneli → Envanter Sayımı** sekmesi.

**Dört adımlı akış, her adımda iz:**
1. **Sayım aç** — ambar ve kapsam (tümü / yalnızca yarı mamül / hammadde /
   ürün) seçilir. O anki sistem miktarları **dondurulur**. Sayım sürerken
   üretim devam edebilir; fark hesabı dondurulmuş değerle yapılır, böylece
   "sayarken stok değişti" karışıklığı olmaz.
2. **Say** — her kalem için sayılan miktar girilir. Her giriş **anında**
   kaydedilir (sahada telefon kapansa bile kayıp olmaz). Kod/ad ile hızlı
   süzme kutusu vardır; farklı çıkan satırlar kırmızı boyanır.
3. **Farkı gör** — kalem sayısı, sayılan, bekleyen, farklı adet ve
   **doğruluk oranı** üstte özet olarak durur.
4. **Stoğa işle** — onaylanan sayım stok kayıtlarını günceller ve **her fark
   için bir ambar hareketi** yazar: "Sayım düzeltmesi (SAY-2026-001) —
   sistem 28 → sayılan 33 · Emre Topbaş". Sayılmayan kalemlere dokunulmaz.
   Kapatılan sayım tekrar işlenemez.

**Neden önemli:** Sayım doğruluk oranı zamanla ölçülebilir bir göstergedir.
İlk sayımınız %60 çıkarsa, altı ay sonra %95'e çıkması sistemin işe
yaradığının rakamsal kanıtıdır — hem üretim yönetimi hem ödül başvurusu için.

## 18) YENİ — Kanban / Akış Panosu (v19)

**Hat & İstasyon Takibi** ekranına ikinci bir görünüm eklendi. Sağ üstteki
**Liste / Akış Panosu** düğmesiyle geçilir; aynı veriyi gösterir, farklı soruyu
yanıtlar. Liste "bu istasyonda ne yapmalıyım?" sorusuna, pano "hat genelinde
akış nerede tıkanıyor?" sorusuna cevap verir.

**Panoda ne var:**
- **Sütunlar rota sırasında** — parça soldan sağa akar; her sütunda o
  istasyondaki iş kartları durur.
- **Darboğaz tespiti** — en çok iş biriken istasyon kırmızı başlıkla ve
  üstte "Darboğaz: IST-02 (4 iş)" rozetiyle işaretlenir. Akış dengeliyse
  yeşil "Dengeli akış" yazar.
- **Bekleme süresi** — kart o istasyonda 3 günden fazla beklediyse kırmızı
  "5 gündür" rozeti çıkar. Unutulan işler görünür hale gelir.
- **Aşama rozetleri** — her kartta QR · KAL · İŞL · SVK adımlarından
  hangilerinin tamamlandığı yeşil olarak gösterilir, altında ilerleme çubuğu.
- **Boş sütunlar** gizlenmez; "önceki istasyondan bekleniyor" yazar — akışın
  nerede durduğu ancak böyle görülür.
- Karta tıklanınca liste görünümüne dönülür (işlemler orada yapılır).

**Kanban kuralı panoda yazılıdır:** darboğazın önündeki istasyona iş yığmak
akışı hızlandırmaz, yalnızca yarı mamül stoğunu artırır. Önce darboğaz
rahatlatılır.

> Not: Pano ancak **rotalar tanımlıysa** anlamlıdır — sütunlar rota
> adımlarından gelir. Rota tanımlanmamış hatlarda pano boş görünür.

## 19) YENİ — Kurulum Hazırlık Panosu + Başlangıç Durumu (v20)

**Panel → 🚦 Kurulum Durumu** tuşu. Yeni kurulan bir sistemde en büyük risk,
nereye kadar gelindiğinin bilinmemesidir. Bu pano kurulum olgunluğunu **ölçer**.

**Sekiz adım, bağımlılık sırasına göre:** ayarlar → cari → hammadde → **rota**
→ yarı mamül/reçete → QR etiket → açılış stoğu → kontrol planı.

Her adım için gösterilir:
- **Mevcut durum sayısı** ("31 yarı mamül · 0/36 karta rota atanmış")
- **Yüzde** ve renk (yeşil tamam / sarı kısmi / kırmızı eksik)
- **Neyi engellediği** — örn. rota eksikse: *"iş çizelgeye düşmez, akış panosu
  boş kalır, operatör terminalinde iş görünmez, kontrol planı istasyon bulamaz"*
- İlgili ekrana **doğrudan giden tuş**

Üstte genel tamamlanma yüzdesi ve "en kritik eksik" özeti vardır. QR etiket
adımı sistemce ölçülemez (basılıp yapıştırıldığını yazılım bilemez), bu yüzden
"elle takip" olarak işaretlenir — dürüst olmayan bir yüzde göstermez.

**📸 Başlangıç Durumu (baseline).** Sistem oturduktan sonra "eskiden nasıldı"
sorusunun cevabı kaybolur. Bu form bugünkü durumu bir kez kaydeder: sipariş→
sevkiyat süresi, aylık kâğıt çıktısı, sayım emeği ve fark oranı, aylık kalite
kusuru ve maliyeti, termin sapması, fire oranı, çalışma biçimi notu. Altı ay
sonra aynı ölçüler alınıp fark görülebilir.

> Tahmin yeterlidir — önemli olan bugünü kaydetmek. Ayrıca sahanın bugünkü
> hali (kâğıt iş emirleri, defterler, sayım listeleri) **fotoğraflanmalıdır**;
> bu fotoğraflar bir daha çekilemez.

## 20) YENİ — Toplu Rota Atama (v21)

Kurulumun en yavaş adımı, onlarca karta tek tek rota atamaktı. Mobilya
üretiminde kartların çoğu aynı akışı izler (kesim → bantlama → delik →
montaj → paketleme); farklılık ölçüde ve malzemededir, rotada değil.

**Hat & Rota → ⇉ Toplu Rota Ata.** Bir rotayı seçilen tüm kartlara tek
işlemde atar. Testte **31 yarı mamüle tek tıkla** rota atandı.

- **Rota özeti** seçilir seçilmez gösterilir: "Akış: IST-01 → IST-02 → IST-03".
  Adımı olmayan rota seçilirse kırmızı uyarı çıkar (atanırsa iş akışa düşmez).
- **Süzgeçler:** kart tipi (yarı mamül / ürün / alt montaj), rota durumu
  (varsayılan: *yalnızca rotası olmayanlar*), kod/ad araması.
- **Görünenleri seç** kısayolu — süzülmüş listeyi tek tıkla işaretler.
- **Üzerine yazma koruması:** rotası olan kartlar varsayılan olarak korunur;
  değiştirmek için ayrı bir kutu işaretlenmeli ve onay verilmelidir.
- **↶ Geri Al:** işlem sonrası 12 saniye boyunca ekranda kalan tuşla atama
  tamamen geri alınır — yanlış rota seçmek kolaydır, 30 kartı elle düzeltmek
  zordur.

> Kurulum sırası önerisi: önce 2-3 tipik rota tanımlayın (standart masa akışı,
> keson akışı, sadece kesim), sonra toplu atama ile kartlara dağıtın. İstisnai
> parçaları tek tek düzeltmek dakikalar sürer.

## 21) YENİ — Rota Şablonları (v22)

Boş ekrandan rota kurmak zordur; hazır bir akışı düzenlemek kolaydır.
**Hat & Rota → 📐 Rota Şablonları.** Panel mobilya üretiminin altı tipik akışı:

| Şablon | Akış |
|---|---|
| **Panel Parça — Tam Akış** | Ebatlama → Kenar bantlama → Delik/kanal → Zımpara → Paketleme |
| **Panel Parça — Sade** | Ebatlama → Delik/kanal *(bantsız iç parçalar)* |
| **CNC Şekillendirme** | Ebatlama → CNC → Bantlama → Zımpara *(formlu parçalar)* |
| **Boyalı Yüzey (MDF lake)** | Ebatlama → CNC → Zımpara → Boya/astar → Kurutma |
| **Metal Konstrüksiyon** | Sac kesme → Büküm → Kaynak → Taşlama → Toz boya → Fırın |
| **Montaj + Paketleme** | Montaj → Paketleme *(bitmiş ürün kartları için)* |

**Kritik tasarım kararı:** şablonlar uydurma istasyon kodu içermez. Her adım
bir *işlem türü* ve o işlemin hangi *makine grubunda* yapıldığının ipucunu
taşır; şablon kurulurken sistem **fabrikanın kendi makine listesinden**
eşleşenleri bulup seçtirir. Test sonucu: altı şablonun **tüm adımları**
mevcut makine parkıyla eşleşti (ebatlama için 14, kaynak için 10, CNC için
3 makine önerildi). Böylece şablon her fabrikaya uyar, kimsenin makine listesi
bozulmaz.

Kurulum penceresinde her adım için istasyon ve süre onaylanır; istenmeyen adım
"— bu adımı atla —" seçilerek çıkarılır. Süreler başlangıç değeridir,
gerçekleşen sürelerle sonradan düzeltilir.

**Önerilen kurulum sırası artık üç adımdır:**
1. 📐 **Rota Şablonları** ile 2-3 tipik akışı kur
2. ⇉ **Toplu Rota Ata** ile kartlara dağıt
3. İstisnai parçaları tek tek düzelt

## 22) KRİTİK DÜZELTME — Eşzamanlı yazmada veri kaybı (v23)

**Sorun.** İstemci bir koleksiyonu değiştirirken tamamını okuyup tamamını geri
yazıyordu. İki kullanıcı aynı anda FARKLI kayıtları değiştirirse ikinci yazma
birincinin değişikliğini siliyordu — **hata mesajı olmadan, sessizce.**
Denetim testinde birebir doğrulandı: A kullanıcısı H1'i, B kullanıcısı H2'yi
değiştirdi; A'nın değişikliği kayboldu. Beş kişilik bir vardiyada bu günde
birkaç kez olur ve ancak sayım tutmadığında fark edilir.

**Çözüm — iki katmanlı:**

1. **Sürüm (version) kontrolü.** `kv_store` tablosuna `surum` sütunu eklendi.
   Okuma sürümü döndürür; tam yazmada istemci okuduğu sürümü bildirir. Bu arada
   başkası yazmışsa sunucu **409** ile reddeder ve güncel veriyi geri gönderir.
   Yazma `BEGIN IMMEDIATE` ile kilit altında yapılır.

2. **Atomik `patch` ucu + otomatik birleştirme.** Çakışma durumunda istemci
   pes etmez: okuduğu anlık görüntü ile karşılaştırıp **yalnızca kendi
   değişikliğini** (eklenen/güncellenen/silinen kayıtlar) çıkarır ve güncel
   veri üzerine atomik olarak uygular. Diğer kullanıcının değişikliği korunur.
   `upsert()` ve `remove()` artık koleksiyonun tamamını hiç göndermez —
   doğrudan `patch` kullanır, yani o yolda çakışma **imkânsızdır**.

Ayrıca `PRAGMA busy_timeout=5000` eklendi (yazma kilidi beklerken hata yerine
5 sn yeniden dener).

**Doğrulama — üç eşzamanlılık senaryosu, iki ayrı tarayıcı oturumuyla:**

| Senaryo | Sonuç |
|---|---|
| İki kullanıcı farklı kayıtları düzenliyor | Her iki değişiklik korundu ✓ |
| Biri kayıt eklerken diğeri kayıt siliyor | İkisi de uygulandı ✓ |
| Eşzamanlı `upsert` | Kayıpsız ✓ |

**Regresyon:** kontrol planı, sayım, kanban, toplu rota atama ve rota şablonu
testlerinin tamamı yeni depolama katmanıyla sorunsuz geçti.

**Yan fayda:** `upsert`/`remove` artık tek kayıt gönderiyor. 5.000 kayıtlık bir
koleksiyonda tek satır güncellemek eskiden tüm diziyi ağdan geçiriyordu; artık
yalnızca değişen kayıt gidiyor.

## 23) GÜVENLİK — Operatör ve hat şifreleri artık bcrypt (v24)

**Sorun.** ÜretimOS kullanıcı şifreleri bcrypt'liydi, ama **operatör ve hat
ortak şifreleri veritabanında DÜZ METİN** duruyordu. `data.sqlite` dosyası
sızarsa (yedek, hosting paneli, yanlış izin) tüm saha şifreleri açığa çıkardı.
Ayrıca şifre talepleri de düz metin bekliyordu ve yönetim ekranı mevcut hat
şifresini kutuda açıkça gösteriyordu.

**Çözüm.**
- Operatör kayıtlarında `sifre` yerine **`sifreHash`** (bcrypt) tutulur.
- Şifre talebi **oluşturulurken sunucuda hash'lenir**; düz metin hiçbir an
  saklanmaz. Onayda hash operatör kaydına aynen taşınır.
- Hat ortak şifreleri de hash'lenir; yönetim ekranındaki kutu artık mevcut
  şifreyi göstermez, yalnızca "•••••• (tanımlı)" yazar.
- Yeni uç **`sifreHashle`**: yönetim şifreyi belirlerken düz metni gönderir,
  karşılığında hash alır ve kayda yalnızca hash'i yazar. Operatör oturumu bu
  ucu kullanamaz (403).
- **Otomatik göç:** eski düz metin kayıtlarla giriş çalışmaya devam eder;
  başarılı girişte kayıt sessizce hash'e çevrilir ve düz metin silinir.
  Kimse şifresini değiştirmek zorunda kalmaz.

**Doğrulama:** talep kaydında düz metin yok ✓ · eski şifreyle giriş çalışıyor ✓
· giriş sonrası düz metin silinip hash oluşuyor ✓ · göç sonrası aynı şifreyle
tekrar giriş ✓ · yanlış şifre reddediliyor ✓ · kısa şifre reddediliyor ✓ ·
operatör token'ı hash ucunu kullanamıyor ✓

**Denetim raporundaki bir hatamın düzeltmesi:** raporda "yedekleme stratejisi
yok" demiştim — **yanlış.** Günlük otomatik yedekleme (`backups/`, son 30 gün)
zaten mevcut ve çalışıyor. Bunun yerine v23 eklemesi sırasında yardımcı
fonksiyonların yanlışlıkla `gunlukYedekAl()` gövdesine yerleştiği yapısal bir
hata tespit edilip düzeltildi (PHP izin verdiği için sözdizimi kontrolünden
geçmişti, ancak kırılgandı).

## 24) ALTYAPI — Test takımı ve mühendislik standardı (v25)

Denetim raporundaki "sıfır otomatik test" maddesi kapatıldı. Artık depoda
çalışan bir regresyon takımı var:

```bash
php testler/calistir.php
```

**Bağımlılık yok.** Composer, npm veya kurulum gerekmez; curl eklentisi yoksa
akış (stream) yedeğine düşer. Testler **geçici bir veritabanında** çalışır,
gerçek `data.sqlite` dosyasına dokunmaz (`URETIMOS_DB` ortam değişkeni eklendi;
üretimde tanımlı olmadığı için davranış değişmez).

**Kapsam — 34 kontrol, 0,5 saniye:**
- *Eşzamanlılık:* sürüm kontrolü, 409 çakışma yanıtı, atomik patch ile
  ekleme/güncelleme/silme, silinmiş kaydın geri gelmesi, sürüm artışı
- *Güvenlik:* talepte düz metin şifre olmaması, eski şifrelerin hash'e göçü,
  yanlış şifre reddi, operatör yetki sınırları (cari okuyamaz, sipariş yazamaz,
  şifre ucunu kullanamaz, kendi iş kayıtlarına yazabilir), oturum zorunluluğu,
  korumalı koleksiyonlar

**Test takımının kendisi sınandı.** Koda kasten üç hata sokuldu; üçünü de
yakaladı:

| Sokulan hata | Yakalayan |
|---|---|
| Operatör yetki kontrolü kapatıldı | 2 kontrol kırmızı |
| Sürüm kontrolü kapatıldı | 3 kontrol kırmızı |
| Talep şifresi düz metne döndürüldü | 3 kontrol kırmızı |

Hiç kırmızıya dönmeyen test takımı işe yaramaz; bu yüzden bu doğrulama
standardın parçasıdır.

**MUHENDISLIK_STANDARDI.md** eklendi: test zorunluluğu, kod tekrarı politikası,
dosya bölme ölçütü (satır sayısı değil *tek sorumluluk*), tasarım belirteçleri,
koyu tema hazırlığı, boş ekran yasağı, isimlendirme ve katkı listesi.
Belgede iki ilkeye gerekçeli itiraz kayda geçirildi: "her ekran mobil öncelikli"
(saha ve ofis ekranları farklı optimize edilmeli) ve "her ekranda AI"
(veri bütünlüğü ve birikimi önce gelir).

## 25) YENİ — Dolap Tasarım Ekranı (v26)

**Ürün Kartları & Reçete → 🗄 Dolap Tasarım.** Parametrik dolap tasarlayıp
tek tuşla ürün ağacına işler — panelleri tek tek çizmeden.

**Yapılandırılabilir her şey:** dış ölçü (G×Y×D), panel/arkalık kalınlığı,
gövde tipi (yanlar tam boy / üst-alt tam en), arkalık (kanallı / sırttan /
yok), sabit + hareketli raf sayısı ve geri çekme, kapak sayısı + tipi
(tam bini / yarım bini / içerlek) + fuga, üst taç, alt taç, baza/ayak +
ayak tipi (plastik/metal/gizli/ahşap), kesim payı, kanal derinliği, kulp.

**Canlı önizleme:** her değişiklikte parça listesi (net + kaba ölçü, bantlanan
kenarlar), hırdavat (menteşe, kulp, minifix, dübel, raf pimi, ayak) ve özet
(parça adedi, net/kaba m², **fire %**, kenar bandı metresi) anında hesaplanır.
Ölçü tutarsızsa uyarı çıkar (negatif kapak, çok geniş kapak vb.).

**Ürün ağacına işleme — mevcut mantıkla:**
- Dolap → **bir ürün kartı** (yapılandırma saklanır, sonra düzenlenebilir)
- Her panel → **bir yarı mamül kartı** (net/kaba ölçü, kalınlık, bant bilgisi,
  dolap rolü)
- Reçete → yarı mamülleri + hırdavatı bağlar
- Hırdavat, ada göre mevcut hammadde kartıyla eşleşirse ona bağlanır, yoksa
  serbest not olarak yazılır

Böylece dolap; MRP, kesim optimizasyonu, iş emri, üretim takibi ve maliyet
akışına diğer ürünler gibi girer.

**Ölçü motoru saf ve testlidir (`dolap_hesap.js`, 22 kontrol).** Yanlış bir
formül kesilen plakayı çöpe atar; bu yüzden hesap arayüzden ayrı tutuldu.
Geliştirme sırasında test iki gerçek hata yakaladı: (1) yan panelde en/boy
ters kaydediliyordu — kenar bandı ve damar yönünü bozardı; (2) menteşe sayısı
eşiği. İkisi de düzeltildi.

Testi çalıştırmak için: `node testler/dolap_hesap_test.js`

## 26) YENİ — SWOOD İçe Aktarım (v30 civarı)

SolidWorks/SWOOD'dan alınan kesim raporu ZIP'i doğrudan **İş Emri Formu**'na
sürüklenip bırakılabilir. Yeni `swood_import.js` ayrıştırıcı ZIP içindeki
Excel/CSV raporlarını (Saw Cut Export, Stoklar yedek kaynak olarak) okuyup
panel listesine, kenar bandı tüketimine ve teknik resim (PDF) önizlemesine
dönüştürür. Kenar bandı malzemeleri, adına göre var olan hammadde kartlarıyla
otomatik eşleşir. Regresyon testi + tam paket bu turun sonunda çalıştırılıp
yeşile alındı.

## 27) KRİTİK DÜZELTMELER — Muhasebe, Fatura, Cari ve Yetki (T1 serisi)

Bağımsız bir denetim, muhasebe/fatura/cari akışında **15 gerçek hata**
buldu; hepsi düzeltildi. En önemlileri:

- Müşteri **cari bakiyesi** fatura kesilince ARTMIYORDU; `fatura.odenecekBakiye`
  her zaman 0 kalıyor, vade kontrolü hiç çalışmıyordu.
- **Basit Usul Defter** geliri çift sayıyordu; **e-Fatura XML** genel
  iskontoyu hiç uygulamıyordu.
- "Fatura & İrsaliye Kes" formunda irsaliyeye **kalemler kaydedilmiyordu**.
- Banka kredisi taksitlerinde anapara/faiz ayrımı yoktu — tüm taksit gider
  yazılıyordu (yalnızca faiz gider olmalı).
- **Vade farkı geliri** Gelir-Gider Özeti'ne hiç yansımıyordu; Manuel
  Tahsilat ve sipariş onayı ekranları FARKLI vade farkı formülleri
  kullanıyordu.
- Fire/kayıp/sayım farkı/tedarikçi iade işlemleri muhasebeye hiç
  yansımıyordu.
- `hatSifreleri` ve `bankaKredileri` hassas veri koleksiyonu listesinde
  DEĞİLDİ (yedekleme/gizlilik taraması onları atlıyordu); kendi kendine
  kayıt formunda "Üst Yönetim" rolü seçilebiliyordu.
- Malzeme Talep teslimatı gerçek stoğu düşürmüyordu; hammadde→üretim
  ambarı yarı mamül transferi **hayalet stok** üretiyordu.
- Sevk edilmiş bir sipariş "Geri Çek/Düzenle" ile tekrar onaya
  sokulabiliyor, onay yeniden tetiklenince kesim/stok/ödeme **idempotent
  değildi** (tekrar tekrar işleniyordu).

## 28) KRİTİK DÜZELTMELER — Üretim, Stok, Kalite, Bakım (T2-T3 serisi)

Aynı denetim üretim/depo/kalite akışında **19 gerçek hata** daha buldu:

- `mrp_motor.js` taslak (henüz üretime alınmamış) iş emirlerini ve teslim
  alınmış satınalma siparişlerini yanlış sayıyordu; tedarikçi bakiyesi onay
  bekleyen/taslak siparişleri de borca ekliyordu.
- İptal ekranı sevk edilmiş siparişleri hâlâ "açık" sayıyordu.
- Hat Terminal'de kalite reddinde **"önceki operasyona iade"** seçeneği
  yoktu; bitmiş ürün kalite reddi, yarı mamül reddinden tamamen kopuktu.
- **Kısmi sevkiyat** desteklenmiyordu (tam sevkiyat zorunluydu).
- Sevkiyata doğrudan eklenen 2. kalite kalemler rezervasyon kontrolünden
  geçiyordu (stok fazladan düşülebiliyordu).
- Arızalı bir makinaya iş atanmaya devam edilebiliyordu; arıza kayıtları
  hiçbir zaman "Tamamlandı"ya geçmiyordu (sonsuza dek açık kalıyordu).
- İade ambarı stok anahtarında (refId) tutarsızlık vardı.
- **NCR** (uygunsuzluk kaydı), açık DÖF (Düzeltici/Önleyici Faaliyet)
  varken serbestçe kapatılabiliyordu.
- Kesim Optimizasyonuna Aktar, veriyi gerçekten taşımıyordu.
- **OEE** yalnızca elle girilen duruş kayıtlarını sayıyordu, üretimi
  durduran acil makina arızalarını hiç hesaba katmıyordu.
- Çizelgeleyici, istasyondaki kısmi ilerlemeyi düşmüyordu.
- KPI/OEE paneline **dönemsel filtre** (Bugün/Bu Hafta/Tüm Zamanlar) hiç
  yoktu — tüm göstergeler ömür boyu kümülatifti.
- Avans, muhasebe kaydı oluşturmuyordu; mahsup bordroya işlenmiyordu.
- İzin bakiyesi negatife düşebiliyordu; geçmiş yıl kıdem hesabı, o yılın
  sonu yerine BUGÜNE göre yapılıyor, kıdemi olduğundan fazla gösteriyordu.
- Kıdem & İhbar Tazminatı, damga vergisi dahil NET tutarı gerçekten
  hesaplamıyordu — artık gerçek hesaplama yapılıyor.

Küçük iyileştirmeler (T4) ayrıca 7 maddede tek tek değerlendirilip
düzeltildi; 2 madde gerekçesiyle bilinçli olarak atlandı.

## 29) TEST KAPSAMI — Daha Önce Hiç Test Edilmeyen Motorlara Birim Testi

Sistemde satırca büyük ama **sıfır test kapsamı** olan birkaç motor tespit
edilip test edildi: `analitik_motor.js` (526 satır) dual-mode yapılıp ilk
testi yazıldı; `masa_cizim.js`/`masa_tasarim.js` (795 satır) ve
`qr_cozucu.js`/`qr_kod.js`/`rota_sablon.js`/`toplu_rota.js`/
`kurulum_durumu.js` için ilk kez birim testleri eklendi. Ayrıca Kayıp/Kaçak
ve Reçete Talep ekranlarında çift onay eşiği artık sabit kodlanmış değil,
Ayarlar'dan geliyor; onaylayan/reddeden artık rol değil GERÇEK kullanıcı
kimliğiyle kaydediliyor. Pazarlama ekranına fiyat listesine **Excel ile
toplu kalem ekleme** özelliği eklendi.

## 30) DENETİM TURU — Ekran Bazlı Sistematik Denetim (T50-T56)

Sistemin geri kalan büyük ekranları, aynı T1-T4 tarzı yöntemle (bağımsız
inceleme → gerçek kodda doğrulama → düzeltme → dedike test dosyası →
tam regresyon) tek tek tarandı. Bulunan ve düzeltilen başlıca hatalar:

**Depo (T50):** 4 gerçek bulgu düzeltildi (stok/ambar tutarsızlıkları).

**İSG (T51):** ayrılmış personel istatistiklerden tamamen kayboluyordu;
"kazasız gün" sayacı ramak kala olaylarını da kazasız sayıyordu; bir kaza
kök neden analizi (5N1K) hiç girilmeden kapatılabiliyordu.

**CRM (T52):** fırsat/aktivite/aşama kayıtlarında "kim yaptı" bilgisi rol
etiketiydi — aynı role sahip FARKLI çalışanlar aynı kişi sayılıyordu (bu
sınıf hata sonraki 4 denetimde de tekrar bulunup düzeltildi); kullanıcının
elle yazdığı ama sistemde karşılığı olmayan müşteri adı sessizce
`musteriId:null` ile kaydedilebiliyordu; CRM fırsatı kazanılıp teklif
siparişe dönüşünce CRM tarafı senkron güncellenmiyordu; "6 Aylık Tahmin"
ve benzer tarih hesaplarında UTC yuvarlama hatası vardı.

**Pazarlama (T53):** `storage.js`'de `fiyatListeleri` koleksiyonu İKİ KEZ
tanımlanmıştı — Pazarlama'nın kaydettiği fiyat listesi, Teklif ekranının
kullandığı katalogla ÇAKIŞABİLİYORDU (canlı örnekle doğrulandı). Ayrı bir
`pazarlamaFiyatListeleri` koleksiyonuna taşındı. Excel toplu fiyat
girişinde sütun eşleştirme ve mükerrer ürün satırı (dedup) hataları
düzeltildi.

**Proje/Teklif (T54) — 2 KRİTİK:** siparişe dönüşmüş bir teklif, durum
listesinde tanımlı olmadığından "Kaydet"e her basıldığında SESSİZCE
"Taslak"a geri dönüyordu (mükerrer sipariş riski); Mahal Bazlı Proje
Teklifi'nde "Siparişe Dönüştür" butonu teklifin durumuna bakmadan her
zaman gösteriliyor, aynı teklif İKİNCİ KEZ siparişe dönüştürülebiliyordu.
Ayrıca proje hakedişinde elle girilen tutar için üst sınır yoktu.

**Servis/Garanti (T55):** kısmi sevkiyatlı siparişlerde garanti bitiş
tarihi, şikayet konusu ürünün GERÇEK teslim tarihi yerine sipariş
genelindeki başka bir kalemin tarihinden hesaplanabiliyordu; doğrudan açılan
servis talebinde müşteri seçimi zorunlu değildi (kayıt izlenemez hale
geliyordu); servis talepleri için "İptal" durumu yoktu.

**KPI/Analitik/Kokpit (T56):** Personel Performansı, aynı partinin işlem
onayı VE sevk kaydını birlikte toplayıp adet sayısını ÇİFTE SAYIYORDU;
`kpi_motor.js` ve `analitik_motor.js`'de toplam 5 ayrı yerde UTC yuvarlama
hatası (bakım alarmı, dönem filtresi, "bugün" hesapları); stok değeri ve
stok yaşlandırma yalnızca hammaddeyi değerliyor, yarı mamul/ürün stoklarını
hep 0 TL kabul ediyordu; Panel'deki "Açık İş Emri" sayacı iptal edilmiş iş
emirlerini de sayıyordu; KPI panelindeki Mali & Ticari blok hem dönem
filtresinden etkilenmiyordu (etiketlenmeden) hem de mali görünürlüğü
olmayan rollere de gösteriliyordu.

Her ekran için ayrı `testler/*_denetimi_testi.js` dosyası yazıldı, tam JS +
PHP regresyon paketi (301/301) her turda yeşil kaldı. Bazı bulgular (kısmi
sevkiyatta KDV dahil/hariç tutarsızlığı, hakediş/numune/garanti dışı
ücretin muhasebeye tam entegrasyonu, mesai-dışı süre hesabı gibi geniş
mimari değişiklik gerektirenler) bilinçli olarak bu turun kapsamı dışında
bırakılıp kod içi yorumlarla belgelendi — sessizce atlanmadı.
