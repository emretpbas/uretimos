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
    // (Ekran görüntüsündeki örnek bir "...tbl_Mal_Urunler_222" görünümüydü;
    // gerçek adını ve TURU sütununun gerçekten olup olmadığını BT ile teyit
    // edin — emin değilseniz önce sadece 'tumu' tipini kullanın, o TURU
    // sütununa bakmadan tüm tabloyu TOP 2000 satırla çeker.)
    'tablo' => 'dbo.tbl_Mal_Urunler_222',

    // İsteğe bağlı: yukarıdaki otomatik TURU sütunu varsayımı sizin LOGO
    // şemanıza uymuyorsa, aşağıdaki dört sorgudan istediğinizi TAMAMEN
    // kendiniz yazarak 'tablo' varsayımını geçersiz kılabilirsiniz.
    'sorgular' => [
        // 'urun'      => "SELECT TOP 1000 * FROM dbo.LG_222_ITEMS WHERE CARDTYPE = 0",
        // 'yarimamul' => "SELECT TOP 1000 * FROM dbo.LG_222_ITEMS WHERE CARDTYPE = 4",
        // 'hammadde'  => "SELECT TOP 1000 * FROM dbo.LG_222_ITEMS WHERE CARDTYPE = 1",
        // 'tumu'      => "SELECT TOP 2000 * FROM dbo.LG_222_ITEMS",
    ],

];
