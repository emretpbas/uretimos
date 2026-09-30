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

    // Ana malzeme kartı tablosu/görünümü — GERÇEK adla DEĞİŞTİRİN.
    // (Gerçek bir "Kartlar" dökümüyle DOĞRULANMIŞ sütun adları: StokKodu,
    // StokAdi, Urun_AnaBirim, Urun_Kart_Turu_Adi — bkz. aşağıdaki 'sorgular'.
    // Tablo/görünüm adının kendisi ekran görüntüsünde net okunamadı, BT ile
    // teyit edin — emin değilseniz önce 'tumu' tipini kullanın.)
    'tablo' => 'dbo.tbl_Mal_Urunler_222',

    // DOĞRULANMIŞ sınıflandırma: Urun_Kart_Turu_Adi sütunu kartın tipini
    // Türkçe metin olarak taşıyor (Urun_Kart_Turu_Kodu ise sayısal karşılığı
    // — 10=Hammadde, 11=Yarı Mamul, 12=Mamul, 13=Tüketim Malı, 1=Ticari
    // Malzeme). page_tiger_aktarim.js'teki HM/YM/MM ayrımıyla AYNI mantık:
    'sorgular' => [
        // 'urun'      => "SELECT TOP 2000 * FROM dbo.tbl_Mal_Urunler_222 WHERE Urun_Kart_Turu_Adi = 'Mamul'",
        // 'yarimamul' => "SELECT TOP 2000 * FROM dbo.tbl_Mal_Urunler_222 WHERE Urun_Kart_Turu_Adi = 'Yarı Mamul'",
        // 'hammadde'  => "SELECT TOP 2000 * FROM dbo.tbl_Mal_Urunler_222 WHERE Urun_Kart_Turu_Adi IN ('Hammadde','Tüketim Malı','Ticari Malzeme')",
        // 'tumu'      => "SELECT TOP 2000 * FROM dbo.tbl_Mal_Urunler_222",
    ],

];
