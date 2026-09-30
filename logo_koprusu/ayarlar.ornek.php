<?php
// ════════════════════════════════════════════════════════════════════════════
// Bu dosyayı "ayarlar.php" olarak KOPYALAYIN ve gerçek bilgilerinizi girin.
// ayarlar.php asla git'e eklenmemelidir (.gitignore'da zaten tanımlıdır) —
// gerçek şifre yalnızca köprünün çalıştığı bilgisayarda, bu dosyada yaşar.
// ════════════════════════════════════════════════════════════════════════════
return [

    // ── YÖNTEM 1 (ÖNERİLEN) ───────────────────────────────────────────────
    // Bu köprü, "Doxa_Logo_Sql_Server" ODBC veri kaynağının ZATEN tanımlı
    // olduğu aynı Windows bilgisayarda çalışıyorsa: yalnızca DSN adını yazın,
    // sunucu adresini/veritabanı adını bilmenize gerek YOK.
    'dsnAdi' => 'Doxa_Logo_Sql_Server',

    // ── YÖNTEM 2 ───────────────────────────────────────────────────────────
    // Köprü BAŞKA bir makinede (ör. Linux) çalışıyorsa: dsnAdi'yi '' yapıp
    // gerçek sunucu adresini + veritabanı adını buraya yazın.
    'sunucu' => '',        // örn. '192.168.1.50' veya '192.168.1.50,1433'
    'veritabani' => '',    // örn. 'DOXA_2026'

    'kullanici' => 'KULLANICI_ADINIZI_BURAYA_YAZIN',
    'sifre' => 'SIFRENIZI_BURAYA_YAZIN',

    // Bu köprüye ÜretimOS dışında rastgele erişimi engelleyen paylaşımlı
    // anahtar — kendi rastgele, uzun bir değerle DEĞİŞTİRİN (ör. bir parola
    // yöneticisiyle üretilmiş 32+ karakterlik rastgele bir metin).
    'apiAnahtari' => 'BURAYA-UZUN-RASTGELE-BIR-ANAHTAR-YAZIN',

    // Ana malzeme kartı tablosu — GERÇEK ÜRETİM VERİSİYLE DOĞRULANDI.
    'tablo' => 'Doxa_Programs..tbl_Mel_Urunler_222',

    // OFFSET/FETCH sayfalaması için ORDER BY şart — bu sütun (tercihen
    // indeksli/benzersiz) sayfalar arasında sabit bir sıralama sağlar.
    'siraSutunu' => 'StokKodu',

    // GERÇEK ÜRETİM VERİSİYLE DOĞRULANDI: sınıflandırma Urun_Kart_Turu_Adi
    // METİN sütununda DEĞİL, Urun_Kart_Turu_Kodu SAYISAL sütununda —
    // 10=Hammadde, 11=Yarı Mamul, 12=Mamul, 13=Tüketim Malı. Aktiflik
    // URUN_AKTIF ile süzülüyor (pasif/silinmiş kartlar hariç tutulur).
    // page_tiger_aktarim.js'teki HM/YM/MM ayrımıyla AYNI mantık, sadece
    // gerçek LOGO şemasındaki karşılıklarıyla. Değiştirmeniz gerekmiyorsa
    // dokunmayın — index.php bu WHERE koşullarını OFFSET/FETCH sayfalamayla
    // otomatik birleştirir.
    'kosullar' => [
        // 'urun'      => "Urun_Kart_Turu_Kodu = 12 AND URUN_AKTIF = 1",
        // 'yarimamul' => "Urun_Kart_Turu_Kodu = 11 AND URUN_AKTIF = 1",
        // 'hammadde'  => "Urun_Kart_Turu_Kodu IN (10, 13) AND URUN_AKTIF = 1",
        // 'tumu'      => "URUN_AKTIF = 1",
    ],

    // GERÇEK ÜRETİM VERİSİYLE DOĞRULANDI: LOGO'nun ODBC sürücüsü Türkçe
    // metni Windows-1254 (CP1254) döndürüyor, UTF-8 DEĞİL — çevrilmezse
    // json_encode sessizce boş yanıt döner. Sürücünüz zaten UTF-8 dönüyorsa
    // (nadir) 'UTF-8' yapıp çeviriyi kapatabilirsiniz.
    'kaynakKodlama' => 'Windows-1254',

];
