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
- Kod zaten varsa yalnızca **ad/birim** güncellenir — fiyat, reçete, rota gibi
  ÜretimOS'ta üretilmiş veriler asla ezilmez (`page_tiger_aktarim.js`'teki
  "mükerrer koruması" ile aynı ilke). "Aynı" satırlar önizlemede varsayılan
  olarak SEÇİLİ DEĞİLDİR.

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
