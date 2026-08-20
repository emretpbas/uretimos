# ÜretimOS — Mühendislik Standardı

Bu belge, ÜretimOS'a katkı yapan herkesi (insan veya yapay zekâ) bağlar.
Amaç kodun yalnızca çalışması değil, **beş yıl sonra da değiştirilebilir
olmasıdır.** Aşağıdaki kurallar tartışılabilir ama sessizce ihlal edilemez.

---

## 0. Sıralama kuralı (en önemlisi)

Kalite iyileştirmelerinin bir bağımlılık sırası vardır. Sırayı bozmak,
iyileştirmeyi zarara çevirir:

```
TEST  →  BİLEŞEN KATMANI  →  KOD TEKRARININ TEMİZLENMESİ  →  DOSYA BÖLME
```

Testsiz yapılan büyük yeniden düzenleme (refactor), çalışan bir fabrikayı
sessizce durdurur. Bu yüzden **testler önce gelir.** Şu an 34 kontrol vardır;
her yeni özellikle artar.

---

## 1. Test zorunluluğu

**Kural.** Davranış değiştiren her katkı, o davranışı doğrulayan en az bir
test getirir. Testsiz katkı kabul edilmez.

```bash
php testler/calistir.php     # bağımlılık yok, ~0.5 saniye
```

- Testler **geçici bir veritabanında** çalışır; `data.sqlite` dosyasına asla
  dokunulmaz (`URETIMOS_DB` ortam değişkeni).
- Çıkış kodu 0/1'dir — otomatik dağıtım betiğine bağlanabilir.
- **Test takımının kendisi de sınanır:** bilerek hata sokularak yakaladığı
  doğrulanmıştır (yetki kontrolü, sürüm kontrolü ve şifre hash'i kapatıldığında
  ilgili testler kırmızıya döndü).

**Yeni test eklemek:** `testler/NN_konu_test.php` dosyası açın, `Test::bolum()`,
`Test::dogru()`, `Test::esit()` yardımcılarını kullanın. Çalıştırıcı `*_test.php`
dosyalarını kendiliğinden bulur.

---

## 2. Kod tekrarı

**Kural.** Aynı mantık üçüncü kez yazılacaksa, önce ortak bileşene taşınır.

Bugünkü durum dürüstçe şudur: `dtable` 48 dosyada, `openModal` 45 dosyada,
`App.persist` 46 dosyada tekrarlanıyor. Bu borç **planlı** kapatılacaktır:
önce ortak bileşen katmanı (tablo, modal, form, boş durum, süzgeç) kurulur,
sonra sayfalar sırayla ona taşınır — hepsi bir seferde değil, her taşımada
testler yeşil kalarak.

**Yasak:** çalışan bir sayfayı "temizlik olsun diye" testsiz yeniden yazmak.

---

## 3. Dosya boyutu

**Kural.** 500 satır bir *koku*dur, kanun değildir. Ölçüt satır sayısı değil
**tek sorumluluktur.** Bir dosya iki farklı nedenle değişiyorsa bölünür.

Bugün 500 satırı aşan 24 dosya var; `app.js` 4616 satırla en acilidir ve
şu sorumlulukları taşımaktadır: yönlendirme, kimlik, menü, ayarlar, bildirim,
modal altyapısı, göçler, giriş ekranı. Bölünme planı:

| Yeni modül | İçerik |
|---|---|
| `cekirdek_yonlendirme.js` | sayfa geçişi, breadcrumb, yetki kontrolü |
| `cekirdek_oturum.js` | giriş ekranı, rol seçimi, oturum durumu |
| `cekirdek_arayuz.js` | modal, toast, kaydetme göstergesi, z-index |
| `cekirdek_gocler.js` | veri göçleri (tek seferlik dönüşümler) |

Bölme, bileşen katmanından **sonra** yapılır (bkz. madde 0).

---

## 4. Tasarım sistemi

**Kural.** Hiçbir bileşen kendi rengini, boşluğunu veya yazı tipini
tanımlamaz; `index.html`'deki tasarım belirteçlerini (token) kullanır.

Mevcut belirteçler: `--fs-2xs … --fs-3xl` (tipografi), `--sp-1 … --sp-10`
(4px tabanlı aralık), `--fw-*`, `--lh-*`, renk rolleri, `--gecis-*`.
İkonlar `ikon.js` setinden gelir — **emoji ikon olarak kullanılmaz.**

**Yasak:** yeni kodda `style="font-size:11px"` gibi çıplak değer. Belirteç
yoksa önce belirteç eklenir.

---

## 5. Koyu tema

**Kural.** Renk her zaman değişken üzerinden verilir; sabit `#fff`/`#000`
yazılmaz. Böylece koyu tema tek yerden açılabilir.

Durum: renk değişkenleri mevcut, koyu tema paleti henüz yok. Eklenecek yol:
`:root[data-tema="koyu"]` altında aynı değişkenlerin koyu karşılıkları +
üst bardan geçiş. Sabit renk yazan her satır bu işi geciktirir.

---

## 6. Mobil ve masaüstü — tek kalıp değil

**Bu ilkeye itirazım var ve gerekçesini kayda geçiriyorum.** "Her ekran mobil
öncelikli" ÜretimOS için yanlıştır, çünkü iki ayrı kullanıcı sınıfı vardır:

| Kullanıcı | Cihaz | Doğru tasarım |
|---|---|---|
| **Saha operatörü** | telefon, eldivenli el, ayakta | **Mobil öncelikli:** büyük dokunma alanı, az seçenek, tek sütun |
| **Ofis kullanıcısı** | masaüstü, iki ekran | **Yoğunluk öncelikli:** çok sütunlu tablo, yan yana karşılaştırma |

40 sütunlu bir maliyet analizi tablosunu mobil öncelikli tasarlamak, onu
masaüstünde kullanılamaz hale getirir. **Doğru kural:** her ekran *duyarlı*
(responsive) olmalıdır; *mobil öncelikli* olması gerekenler saha ekranlarıdır
(operatör terminali, yükleme onayı, sayım, kalite kontrol).

---

## 7. Üç tıklama kuralı

**Kural.** Sık yapılan işler en fazla üç tıklamada tamamlanır. Nadir işler
için bu kural zorlanmaz — nadir işi kısaltmak için sık işi karmaşıklaştırmak
kötü takastır.

Sık işler listesi (ölçülecek): kalite onayı, iş sevki, sayım girişi, sipariş
açma, satınalma onayı, stok düşümü.

---

## 8. Boş ekran yasağı

**Kural.** Hiçbir ekran boş tabloyla açılmaz. Boş durum üç şeyi söyler:
*(1)* burada ne olurdu, *(2)* neden şu an boş, *(3)* doldurmak için ne yapılmalı
— ve o eyleme giden tuşu içerir.

Durum: 47 sayfanın 45'inde boş durum bileşeni kullanılıyor, ancak çoğu yalnızca
"kayıt yok" diyor. **Yönlendirme kalitesi** ayrı bir iş kalemidir ve
`Kurulum Hazırlık Panosu` mantığı (neyi engelliyor + oraya git tuşu) tüm boş
durumlara yayılacaktır.

---

## 9. Yapay zekâ

**Bu ilkeye de itirazım var.** "Her ekranda AI" hedef değildir; AI **karar
desteğinin olduğu ve veri biriktiği** ekranlarda anlamlıdır.

Güvenilmez veri üzerine kurulan AI, kendinden emin biçimde yanlış cevap verir —
bu, cevap vermemekten tehlikelidir. Bu yüzden sıra:

1. Veri bütünlüğü *(tamamlandı: eşzamanlılık koruması)*
2. Veri birikimi *(kontrol planı ölçümleri, gerçekleşen süreler, fire kayıtları)*
3. **Sonra** AI: ölçüm anomalisi, maliyet sapma tahmini, MRP sipariş önerisi,
   kalite kusuru örüntüsü

Digital twin, görüntü işleme ve CAD entegrasyonu bu yol haritasının sonundadır,
başında değil.

---

## 10. İsimlendirme ve dil

- Kod, yorum ve değişken adları **Türkçedir** (mevcut kod tabanıyla tutarlılık).
- Kısaltma yerine açık ad: `hatOperatorleri`, `kontrolPlanlari`.
- Yorum *ne yaptığını* değil **neden öyle yaptığını** anlatır.

---

## Katkı listesi (her katkıda kontrol edilir)

- [ ] `php testler/calistir.php` yeşil
- [ ] Yeni davranış için test yazıldı
- [ ] Aynı mantık başka yerde zaten var mı diye bakıldı
- [ ] Sabit renk / sabit yazı boyutu yazılmadı, belirteç kullanıldı
- [ ] İkon `ikon.js` setinden alındı (emoji değil)
- [ ] Boş durum yönlendirme içeriyor
- [ ] Saha ekranıysa telefonda denendi
- [ ] Yorumlar *nedeni* açıklıyor
