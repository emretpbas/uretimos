# Arayüz Koruma ve Bilgi Sızıntısı Raporu

Bu belge, "arayüz kopyalama ve bilgi sızıntısı geçirmez olsun" isteğine karşı
neyin gerçekten yapılabildiğini, neyin yapılamadığını ve bu turda yapılanları
dürüstçe açıklar.

---

## Önce dürüst gerçek: "kopyalanamaz arayüz" diye bir şey yoktur

Bir web arayüzü tanım gereği kopyalanabilir. Tarayıcının bir şeyi göstermesi
için HTML/CSS/JS'i almış olması gerekir; aldıysa kaydedebilir, inceleyebilir,
yeniden kurabilir. Sağ tık engelleme, F12 kapatma gibi "korumalar" saniyeler
içinde aşılır ve yalnızca dürüst kullanıcıyı rahatsız eder.

**Bu yüzden hedefi ikiye ayırdık:**

| Hedef | Yapılabilir mi? | Bu turda |
|-------|-----------------|----------|
| Arayüz görünümünü kopyalanamaz yapmak | ❌ Hayır (imkânsız) | Zorlaştırıldı |
| İş mantığının koddan/yorumlardan sızmasını engellemek | ✅ Evet | **Yapıldı** |
| Sunucudaki iş mantığını gizlemek | ✅ Zaten gizli | PHP sunucuda çalışır |
| Hassas verinin API'den sızmasını engellemek | ✅ Evet | Doğrulandı sağlam |

**En önemli nokta:** Bir ERP'nin değeri arayüzün görünümü değil — iş mantığı ve
veridir. İş mantığınız PHP'de, yani sunucuda; tarayıcıya HİÇ gitmiyor. Asıl
değerli varlık zaten korunuyor. Kalan risk, frontend JS'teki yorumlardı.

---

## Bulgular (kod incelemesi)

### Zaten iyi olanlar
- **Source map yok** — kaynak kodu ifşa eden .map dosyası bulunmuyor.
- **Gömülü sır yok** — JS içinde API anahtarı, parola, token gömülü değil.
- **API sızdırmıyor** — `get` ucu önce oturum + rol yetkisi kontrol ediyor;
  kullanıcı listesi istemciye **şifre hash'leri olmadan** gidiyor.

### Bulunan gerçek sızıntı: JS yorumlarında iş mantığı
Frontend JS minify edilmemişti (82 dosya, 40.686 satır, tüm yorumlarıyla).
Yorumlarda ticari bilgi açıktı:
- İskonto sınırları (satır bazlı %50, dip %10)
- Maliyet formülü: `netMaliyet × (1+GYG%10) × (1+Nakliye%7)`
- ABC/Pareto kârlılık analizi mantığı
- "2. kalite / defolu / seri-sonu satış" iş kuralları

Kod çalınmasa bile, rakip bu yorumlardan **iş modelinizi okuyabiliyordu.**

---

## Bu turda yapılan: üretim derleme (build) adımı

`build.js` eklendi. Ne yapar:
- Tüm .js dosyalarını **minify + obfuscate** eder (terser ile)
- **Tüm yorumları siler** — iş mantığı notları artık yok
- Değişken/fonksiyon adlarını kısaltır — okunabilirlik yok olur
- Çıktıyı `dist/` klasörüne koyar

### Doğrulama (kanıt)
- Kaynak `app.js`: 12 iş-mantığı yorumu → minify `dist/app.js`: **0**
- Kalan "marj/Pareto" eşleşmeleri yorum DEĞİL, kodun çalışması için gereken
  property adları (silinmemeli, zaten okunması zor minify halde).

### Kullanım
```bash
cd app
node build.js          # dist/ oluşturur
# cPanel'e dist/ İÇERİĞİNİ yükleyin (app/ kaynağını değil)
```

**Önemli:** Orijinal okunabilir kaynak `app/` içinde KALIR — geliştirmeye onunla
devam edersiniz. `dist/` yalnızca sunucuya giden, okunması zorlaştırılmış sürüm.

---

## Dürüst sınır (tekrar)

Minify, kodu **kopyalanamaz yapmaz.** Belirlenmiş, teknik biri minify'ı bir
ölçüde çözebilir (değişken adlarını geri getiremez ama akışı takip edebilir).
Amaç şudur: sıradan kopyalamayı ve **iş mantığının yorumlardan doğrudan
okunmasını** engellemek. Bu gerçekleşti. Ama "hiç kimse hiçbir şey alamaz"
demek yanlış olur — öyle bir teknoloji web'de yoktur.

---

## Daha ileri gitmek isterseniz (isteğe bağlı)

1. **Hukuki koruma (en etkilisi):** Kod ve arayüz zaten telifle korunur. Ticari
   sır sözleşmeleri (NDA), kullanım şartları ve görünür telif notu, teknik
   korumadan daha caydırıcıdır. Kopyalayan birine karşı asıl silahınız budur.
2. **Daha agresif obfuscation:** `javascript-obfuscator` gibi araçlar string
   şifreleme, kontrol akışı düzleştirme yapar — ama kodu yavaşlatır ve hata
   ayıklamayı zorlaştırır. ERP gibi büyük bir uygulamada genelde zarar > fayda.
3. **Sunucu tarafına taşıma:** En kritik hesap mantığını (gizli marj formülleri)
   JS'ten PHP'ye taşımak. O zaman tarayıcı sonucu görür ama formülü göremez.
   Mevcut sistemde maliyet mantığının çoğu zaten JS'te; kritik olanları PHP'ye
   almak gerçek koruma sağlar (ama iş gerektirir).

---

## Özet

- "Kopyalanamaz arayüz" imkânsız — bunu vaat eden yanıltır.
- Yapılabilir ve yapıldı: iş mantığının JS yorumlarından sızması **kapatıldı**
  (minify build).
- Asıl değer (sunucudaki PHP mantığı, veri) zaten korunuyordu; API sızdırmıyor.
- En güçlü ek koruma teknik değil **hukuki** (telif + NDA + kullanım şartları).
