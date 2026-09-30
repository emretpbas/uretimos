# LOGO SQL Köprüsü

ÜretimOS'un **ERP Entegrasyon Merkezi**'ne (Sekmeler → Entegrasyon), LOGO'nun
SQL Server veritabanından ürün/yarı mamül/hammadde kartlarını çekebilmesi için
küçük, bağımsız bir HTTP köprüsü.

## Neden ayrı bir köprü gerekiyor?

ÜretimOS'un mevcut Entegrasyon Merkezi, **tarayıcıdan** doğrudan JSON döndüren
bir HTTP adresine bağlanır (güvenlik politikası gereği yalnızca aynı-origin
veya `*.local` adreslerle sınırlı). LOGO'nun SQL Server'ı ise HTTP değil,
veritabanı protokolü (TDS) konuşur — tarayıcı buna doğrudan bağlanamaz. Bu
köprü, LOGO SQL Server'a **sunucu tarafında (PHP ile)** bağlanır ve sonucu
düz bir JSON kayıt dizisine çevirir; ÜretimOS'un kendisinde hiçbir kod
değişikliği gerekmez.

## 1. Nereye kurulur

**cPanel'deki ana ÜretimOS klasörüne DEĞİL.** Bu köprü, LOGO SQL sunucusuna
ağ üzerinden erişebilen, şirket içi (yerel ağ) bir bilgisayara/sunucuya
kurulmalı. En basit seçenek: ekran görüntüsündeki "Doxa_Logo_Sql_Server" ODBC
veri kaynağının zaten tanımlı olduğu **aynı Windows bilgisayar**.

Bu bilgisayarda PHP kuruluysa (XAMPP, IIS + PHP, ya da sadece yerleşik sunucu)
bu klasörü oraya kopyalayın ve çalıştırın, örneğin:

```
php -S 0.0.0.0:8090 -t logo_koprusu
```

(Kalıcı çalışması için Görev Zamanlayıcı'da bir "her açılışta başlat" görevi
ya da IIS'te bir site olarak kurabilirsiniz — bu adım BT'nin tercihine bağlı.)

## 2. Ayarları girin

```
logo_koprusu\ayarlar.ornek.php  →  logo_koprusu\ayarlar.php  (kopyala)
```

`ayarlar.php` içinde:
- `dsnAdi`: `Doxa_Logo_Sql_Server` (Yöntem 1 — DSN zaten tanımlıysa sunucu
  adresi/veritabanı adı bilmenize gerek yok)
- `kullanici` / `sifre`: BT'nin size verdiği salt-okunur LOGO SQL hesabının
  kullanıcı adı/şifresi
- `apiAnahtari`: rastgele, uzun bir metinle DEĞİŞTİRİN (bu köprüye dışarıdan
  rastgele erişimi engeller)
- `tablo`/`kosullar`/`kaynakKodlama` — GERÇEK ÜRETİM VERİSİYLE DOĞRULANDI,
  varsayılanlara dokunmanıza gerek yok: tablo `Doxa_Programs..tbl_Mel_Urunler_222`,
  sınıflandırma `Urun_Kart_Turu_Kodu` (10 Hammadde, 11 Yarı Mamul, 12 Mamul,
  13 Tüketim Malı) + `URUN_AKTIF`, kaynak kodlama `Windows-1254` (LOGO'nun
  ODBC sürücüsü Türkçe metni bu şekilde döndürüyor — köprü otomatik UTF-8'e
  çevirir, elle bir şey yapmanız gerekmez).
- `izinliKaynaklar`: ÜretimOS'un GERÇEK adresi/adresleri (varsayılan
  `https://uretimos.com.tr` + `www.` — `api.php`'deki listeyle aynı).
  Tarayıcıdan bağlanabilmek için ŞART (bkz. aşağıdaki "Tarayıcıdan
  bağlanırken" bölümü).

**`ayarlar.php` dosyası asla git'e eklenmez** (`.gitignore`'da tanımlı) —
gerçek şifre yalnızca bu bilgisayarda yaşar.

## 3. Bağlantıyı tek başına test edin

Tarayıcıdan (aynı yerel ağdaki herhangi bir bilgisayardan):

```
http://<köprü-bilgisayar-adı>:8090/?tip=tumu&anahtar=<apiAnahtari>
```

Başarılıysa `{"kayitlar":[...], "adet":2000, "toplam":84373, "sayfa":1,
"sayfaBoyutu":2000, "sonSayfaMi":false, "tip":"tumu"}` görürsünüz. Hata
alırsanız mesaj Türkçe olarak hangi bağlantı yönteminin neden başarısız
olduğunu söyler (ör. sürücü eksik, DSN bulunamadı, kullanıcı/şifre hatalı).

**Sayfalama:** gerçek aktif kayıt sayıları büyük (Mamul 20.581, Yarı Mamul
63.792) — bu yüzden köprü tek istekte en fazla `adet` (varsayılan 2.000, üst
sınır 5.000) kayıt döner, yanıtta `sayfa`/`toplam`/`sonSayfaMi` bulunur.
ÜretimOS'un `ag_entegrasyon.js` motoru bu imzayı (`sonSayfaMi`) **otomatik
tanır** — "Verileri Çek ve Önizle" dediğinizde tek sayfa değil, `sonSayfaMi:
true` gelene kadar TÜM sayfalar arka planda gezilip tek bir listede birleşir;
ayrıca bir betik/ayar gerekmez. Bir sayfa alınamazsa ya da 200 sayfalık
güvenlik tavanına takılırsa (400.000 kayıt), önizleme ekranında turuncu bir
uyarı olarak görünür — o durumda `logo_koprusu/ayarlar.php`'de `adet` değerini
artırıp (üst sınır 5.000) tekrar deneyin.

## 3b. Tarayıcıdan bağlanırken (ÜretimOS ekranından)

CLI/curl testi (yukarıdaki §3) başarılı olsa bile, ÜretimOS'un kendi
ekranından (tarayıcıdan) bağlanmak ÜÇ ayrı, birbirinden BAĞIMSIZ engele
takılabilir — GERÇEK TESTTE hepsi yakalandı:

1. **CORS / preflight** — köprü ÜretimOS'unkinden farklı bir origin'de
   (host:port) olduğu için tarayıcı önce izinsiz bir `OPTIONS` isteği
   gönderir. **Düzeltildi:** `index.php` artık `ayarlar.php`'deki
   `izinliKaynaklar` listesindeki origin'lere `Access-Control-Allow-Origin`
   + preflight için 204 dönüyor — API anahtarı kontrolünden ÖNCE, ona hiç
   takılmadan. `ayarlar.php`'de `izinliKaynaklar`'ın ÜretimOS'un gerçek
   adresiyle (`https://uretimos.com.tr` vb.) eşleştiğinden emin olun.
2. **CSP portu** — `.htaccess`'teki `connect-src` kuralı `http://*.local`
   yazıyordu; bu yalnızca 80 portunu kapsar, `:8090` gibi başka bir portu
   KAPSAMAZ. **Düzeltildi:** `http://*.local:*` / `https://*.local:*` oldu
   (bu değişikliğin GoDaddy'ye yayılması gerekir — bkz. commit sonrası not).
3. **Karışık içerik (mixed content)** — ÜretimOS `https://` üzerinden
   sunuluyor (`.htaccess`'teki HTTPS zorlaması) ve tarayıcılar, HTTPS bir
   sayfadan `http://` bir adrese `fetch()` yapılmasını CSP'den BAĞIMSIZ,
   AYRI bir kuralla her zaman engeller — yukarıdaki iki düzeltme bunu
   ÇÖZMEZ. **Henüz çözülmedi, bir altyapı kararı gerekiyor:** köprünün
   kendisi de `https://` üzerinden sunulmalı. İki pratik yol:
   - **IIS + kendinden imzalı sertifika:** bu makinede zaten IIS varsa
     (Windows Server/Pro), PHP'yi IIS üzerinden çalıştırıp `New-SelfSignedCertificate`
     ile bir sertifika bağlayın; sertifikayı köprüye bağlanacak
     bilgisayarların "Güvenilen Kök Sertifika Yetkilileri" deposuna bir kez
     ekleyin.
   - **Caddy (tek dosya, otomatik yerel HTTPS):** `php -S` önüne bir Caddy
     örneği koyup `https://dpc145.canakcilar.local:8443 { reverse_proxy
     127.0.0.1:8090 }` gibi yönlendirin; `caddy trust` komutu kendi kök
     sertifikasını Windows deposuna bir kez kurar.
   Köprüyü internete port yönlendirmeyin — bu sertifika adımı SADECE yerel
   ağ içi HTTPS için, dışarıya açmak için DEĞİL.

## 4. ÜretimOS'a bağlayın

ÜretimOS'ta **Entegrasyon Merkezi** (mevcut ekran, `page_ag_entegrasyon.js`)
açın → **+ Yeni Bağlantı Profili**, LOGO'nun `tip=`'e göre ayrı koleksiyona
yazdığı ÜÇ farklı hedefi seçerek üç AYRI profil ekleyin (Yön: **İçe Aktarım**):

| Bridge adresi | Hedef Tipi (açılır listede) | ÜretimOS koleksiyonu |
|---|---|---|
| `...?tip=urun` | Ürün Kartı (Mamul) | `urunler` |
| `...?tip=yarimamul` | Yarı Mamül Kartı | `yarimamuller` |
| `...?tip=hammadde` | Ürün / Stok (Hammadde) | `hammaddeler` |

Her profilde:
- **Kimlik Doğrulama Tipi:** Başlık ile
- **Başlık Adı:** `X-API-Key`
- **Kimlik:** `ayarlar.php`'deki `apiAnahtari` değeriniz
- **Bağlantıyı Test Et** deyin — LOGO'dan gelen gerçek sütun adları otomatik
  keşfedilir, ekrandan `kod`/`ad`/`birim`/`stok`/`fiyat` eşlemesini seçersiniz.
- İçe aktarım her zaman önce **önizlenir**; siz onaylamadan hiçbir kayıt
  ÜretimOS'a yazılmaz (Entegrasyon Merkezi'nin mevcut, değişmeyen kuralı).
- Kod zaten varsa **ad/birim** güncellenir; **reçete/rota gibi ÜretimOS'ta
  üretilmiş veriler asla ezilmez** (`page_tiger_aktarim.js`'teki "mükerrer
  koruması" ile aynı ilke). **İstisna — hammadde fiyatı:** "Ürün / Stok
  (Hammadde)" hedefinde, eşlemede "Fiyat" alanı seçiliyse gelen değer mevcut
  kartın `birimFiyat`'ını GÜNCELLER (bu, aşağıdaki §4b'nin amacı — LOGO'daki
  fiyatı ÜretimOS'a senkron tutmak). Fiyatı LOGO'dan senkronlamak
  İSTEMİYORSANIZ o profilde "Fiyat" alanını eşlemeden bırakın. "Aynı" satırlar
  önizlemede varsayılan olarak SEÇİLİ DEĞİLDİR.

## 4b. Hammadde fiyatlarını çekmek (son alış / güncel fiyat listesi)

Ana ürün tablosunda fiyat YOK — LOGO fiyatı iki AYRI kaynakta tutuyor, GERÇEK
ÜRETİM VERİSİYLE (LogoRead ile SSMS'te doğrudan sorgulanarak) doğrulandı:

| Bridge tipi | Kaynak | Ne döner |
|---|---|---|
| `?tip=son_alis` | Son satın alma fiyatı görünümü | Ürün başına TEK, en son gerçekleşen alış fiyatı |
| `?tip=fiyat_alis` | LOGO güncel fiyat listesi, PTYPE=1 (satınalma) | Bugün geçerli (tarih aralığına düşen), TL'ye (CURRENCY=160) filtrelenmiş liste fiyatı |
| `?tip=fiyat_satis` | Aynı liste, PTYPE=2 (satış) | Bugün geçerli satış fiyatı (henüz bir ÜretimOS hedefine bağlanmadı — ürün fiyatı ÜretimOS'ta genelde maliyetten HESAPLANIR, doğrudan yazılmaz) |

**Nasıl bağlanır:** yeni bir profil daha ekleyin — **Hedef veri tipi: "Ürün /
Stok (Hammadde)"** (aynı hedef, hammaddeler'e yazar), **Adres:**
`.../?tip=fiyat_alis` (ya da `son_alis`), eşlemede **Stok/Ürün Kodu** →
`StokKodu`, **Ad** → `StokAdi`, **Fiyat** → `FIYAT`. Kodlar zaten
`?tip=hammadde` profiliyle oluşturulmuş olacağından bu profil normalde
yalnızca **birimFiyat GÜNCELLER**, yeni kart açmaz.

**`son_alis` mi `fiyat_alis` mi?** `fiyat_alis`'in açık bir `CURRENCY`
sütunu var ve köprü bunu TL'ye (160) filtreliyor — daha güvenilir.
`son_alis`'te döviz sütunu YOK, TL olduğu VARSAYILIYOR (teyit edilmedi) ama
gerçekte GERÇEKLEŞEN son alışı yansıtır. Emin değilseniz `fiyat_alis` ile
başlayın.

**Bakım notu:** `fiyat_alis`/`fiyat_satis`'in okuduğu `LG_222_PRCLIST`
tablosu, adı LOGO'da **firma dönemine göre değişebilen** ayrı bir
veritabanında (bugün `DOXA_2022`) duruyor. Fiyat sorguları aniden
"geçersiz veritabanı" hatası verirse `ayarlar.php`'deki
`fiyatListesiVeritabani` değerini güncel dönem adıyla değiştirin.

## Ölçek notu

LOGO'daki aktif kayıt sayısı (~97.000, üç tip toplamı) `OLCEKLEME_PLANI.md`'de
"küçük/sabit — sorun değil" sayılan sınırın (5.000–8.000) hayli üzerinde.
Yazma zaten **parçalı** yapılıyor (`Store.topluEkle`/`topluGuncelle`, 200'lük
gruplar — tek istekte 413 hatası almamak için), bu yüzden tek seferlik ilk
aktarım muhtemelen sorunsuz tamamlanır. Ama bu kartlar kalıcı olarak
`urunler`/`yarimamuller`/`hammaddeler` koleksiyonlarına eklendiği için,
**aktarımdan SONRA** bu koleksiyonlara dokunan her ekran (kalem seçici,
reçete ağacı, fiyat listesi, SolidWorks eklentisi) biraz daha yavaşlar —
bu tek seferlik bir maliyet değil, kalıcı bir büyüme. İlk aktarımı düşük
trafikli bir saatte yapmanız ve öncesinde `YEDEKLEME_KURULUM.md`'deki
yönteme göre elle bir yedek almanız önerilir.

## Güvenlik notları

- Bu köprü **yalnızca okur** — LOGO veritabanına hiçbir zaman yazma/güncelleme
  sorgusu çalıştırmaz (`index.php` yalnızca `PDO::query()` ile `SELECT`
  çalıştırır).
- Size verilen SQL hesabının LOGO tarafında zaten salt-okunur yetkiyle
  sınırlı olduğundan emin olun (BT bunu muhtemelen zaten bu amaçla oluşturdu).
- API anahtarını örnekteki gibi bırakmayın — bu köprü çalıştığı ağda kim
  erişebilirse LOGO verisini okuyabilir hale gelir.
- Köprüyü sadece yerel ağdan erişilebilir tutun (dışarıya, internete port
  yönlendirmesi YAPMAYIN) — amaç zaten yalnızca ofis içi erişim.
