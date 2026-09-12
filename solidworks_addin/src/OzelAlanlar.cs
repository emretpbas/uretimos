// ════════════════════════════════════════════════════════════════════════════
// ÖZEL ALAN (Custom Property) ADLARI — SolidWorks parça/montaj dosyalarına
// yazılan ÜretimOS etiketleri. Bunlar dosyada KALICIDIR (Save ile birlikte
// saklanır), STEP dışa aktarımında bile büyük ölçüde korunur, ve add-in
// yeniden açıldığında/dosya tekrar yüklendiğinde okunarak UI'da geri
// gösterilir — yani "bu parça hangi pakette" bilgisi SolidWorks dosyasının
// kendisinde yaşar, ayrı bir veritabanına ihtiyaç duymaz.
//
// TİP alanı üç değer alır: "parca" (yaprak parça/panel), "alt_montaj"
// (ÜretimOS'ta PAKET karşılığı — bkz. mevcut STEP içe aktarım ekranının aynı
// eşlemesi: page_step_ice_aktar.js/step_okuyucu.js'de alt montajlar zaten
// "paket" olarak kodlanıyor), "kok" (montajın en tepesi = ÜRÜN).
// ════════════════════════════════════════════════════════════════════════════
namespace UretimOSKesim
{
    public static class OzelAlanlar
    {
        // ── Kimlik / hiyerarşi ───────────────────────────────────────────────
        public const string TIP = "URETIMOS_TIP";                 // parca | alt_montaj | kok
        public const string KOD = "URETIMOS_KOD";                 // bu bileşenin kendi kodu (boşsa add-in üretir)
        public const string AD = "URETIMOS_AD";                   // görünen ad (boşsa SW dosya adı kullanılır)
        public const string UST_PAKET_KODU = "URETIMOS_UST_PAKET_KODU"; // bağlı olduğu bir üst alt_montaj/paket kodu

        // ── Ölçü (v1: ELLE girilir — bkz. KesimListesiCikarici.OlcuHesapla
        // içindeki gerekçe: SolidWorks'ün geometri API'sinden otomatik ölçü
        // almak, resmi dokümantasyon olmadan güvenilir doğrulanamadı).
        // Birim: milimetre (mm), ondalık ayracı nokta veya virgül olabilir.
        public const string BOY_MM = "URETIMOS_BOY_MM";
        public const string EN_MM = "URETIMOS_EN_MM";
        public const string KALINLIK_MM = "URETIMOS_KALINLIK_MM";

        // ── Malzeme / kesim ──────────────────────────────────────────────────
        // Bu üçü ÜretimOS'taki hammaddeler koleksiyonundan (tip:'plaka') seçilen
        // kartın KODUdur — add-in, kütüphane panelinde bu listeyi ÜretimOS'tan
        // çeker, kullanıcı seçer, add-in buraya yazar. Boşsa dışa aktarımda
        // MATERIAL sütunu boş kalır (tahmin ETMEZ — bkz. README "dürüstlük ilkesi").
        public const string PLAKA_KODU = "URETIMOS_PLAKA_KODU";

        // Kenar bandı: SWOOD'un EBF/EBB/EBL/EBR (Ön/Arka/Sol/Sağ) kolonlarıyla
        // BİREBİR aynı yönleri kullanır — mevcut is_emri_uretici.js'nin
        // SWOOD_KENAR_ALANLARI eşlemesiyle uyumlu olsun diye kasıtlı. Değer,
        // ÜretimOS hammaddeler (tip:'kenar_bandi') koleksiyonundan seçilen
        // kartın kodudur; boş = o kenarda bant yok.
        public const string KENAR_ON = "URETIMOS_KENAR_ON";        // EBF
        public const string KENAR_ARKA = "URETIMOS_KENAR_ARKA";   // EBB
        public const string KENAR_SOL = "URETIMOS_KENAR_SOL";     // EBL
        public const string KENAR_SAG = "URETIMOS_KENAR_SAG";     // EBR

        // ── Hırdavat (parça/alt_montaj üzerine iğnelenen donanım) ────────────
        // Basit v1 şeması: "kod:adet,kod:adet" — örn. "MENTESE-35CUP:2,KULP-96MM:1"
        // Kod, ÜretimOS hammaddeler (tip:'hirdavat') koleksiyonundan gelir.
        // Minifix/Rafix/menteşe/raf desteği/kulp gibi TÜM bağlantı elemanları
        // bu TEK alanda toplanır. KRİTİK: iç ayırıcı BİLEREK VİRGÜL (','),
        // NOKTALI VİRGÜL (';') DEĞİL — bu değer SwoodPaketOlusturucu.cs'te
        // ';' ile ayrılmış bir CSV hücresine yazılır; iç ayırıcı de ';'
        // olsaydı hücrenin içeriği CSV'nin KENDİ sütun sınırlarını bozardı
        // (basit split(';') tabanlı ayrıştırıcı tırnaklama desteklemiyor).
        // ÜretimOS tarafında is_emri_uretici.js:hirdavatAdaylariniAyristir
        // aynı virgül ayırıcılı biçimi okur (bkz. HIRDAVAT sütunu, swoodDenUret).
        public const string HIRDAVAT_LISTESI = "URETIMOS_HIRDAVAT";

        // ── Birleşim / özel parça sınıflandırması ────────────────────────────
        // Bu ikisi de SWOOD raporlarında YOKTUR — yalnızca bizim add-in'imizin
        // ürettiği CSV'de bulunur; ÜretimOS tarafı (is_emri_uretici.js:
        // swoodDenUret) bunları SWOOD dışı ekstra, YOK SAYILABİLİR sütunlar
        // olarak okur (SWOOD raporlarında boş gelirler, davranış değişmez).
        //
        // BIRLESIM_TIPI: parçanın komşu panellerle nasıl birleştiği (ör.
        // "45_derece" gönye birleşim, "duz" düz/90° birleşim). TAHMİN
        // EDİLMEZ — kullanıcı SolidWorks'te Özel Özellikler'den elle girer,
        // olduğu gibi iş emrine NOT olarak taşınır (bkz. README "dürüstlük
        // ilkesi": yanlış üretim yöntemi varsaymak, boş bırakmaktan pahalıdır).
        public const string BIRLESIM_TIPI = "URETIMOS_BIRLESIM_TIPI";

        // YABANCI_PARCA: bu bileşen bir PLAKADAN KESİLMEZ — satın alınan/hazır
        // bir parçadır (cam, ayna, metal profil, hazır cephe vb.). "evet"/
        // "true"/"1"/"yes" (büyük/küçük harf duyarsız) true sayılır, aksi
        // halde false. Kesim listesinden GİZLENMEZ (hâlâ bir BOM/iş emri
        // satırıdır, sipariş edilmesi gerekir) — sadece işaretlenir ki üretim
        // ekibi onu bir plakadan kesmeye ÇALIŞMASIN.
        public const string YABANCI_PARCA = "URETIMOS_YABANCI_PARCA";

        // ── Kesim listesi kaynak izleme (tanılama amaçlı, dışa aktarıma girmez) ─
        public const string OLCU_KAYNAGI = "URETIMOS_OLCU_KAYNAGI"; // "cutlist" | "bbox" | "elle"
    }
}
