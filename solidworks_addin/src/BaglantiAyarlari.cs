using System;
using System.IO;
using Newtonsoft.Json;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // BAĞLANTI AYARLARI — ÜretimOS sunucu adresi + giriş bilgileri.
    // BİLİNÇLİ OLARAK KOD İÇİNDE SABİT (const) DEĞİL: bu bilgiler (özellikle
    // şifre) GIT DEPOSUNA ASLA COMMIT EDİLMEMELİ. Bunun yerine kullanıcının
    // KENDİ bilgisayarında, BİR KEZ, elle oluşturduğu yerel bir JSON dosyadan
    // okunur (%LocalAppData%\UretimOSKesim\baglanti.json) — bu dosya asla
    // depoya eklenmez, sadece o makinede yaşar.
    //
    // Dosya YOKSA veya okunamıyorsa: EtiketlemePaneli sessizce "sunucudan
    // liste çekme" özelliğini KAPALI tutar, tüm alanlar serbest metin olarak
    // kalır — özellik eksik olması ÇÖKME'ye ya da kullanılamaz bir panele
    // yol AÇMAZ (bkz. proje geneli "boş bırakmak yanlış varsaymaktan
    // ucuzdur" ilkesi).
    //
    // ÖRNEK DOSYA İÇERİĞİ (baglanti.json):
    // {
    //   "sunucuUrl": "https://uretimos.firmaniz.com/api.php",
    //   "kullaniciAdi": "cad_entegrasyon",
    //   "sifre": "...",
    //   "logoKopruUrl": "https://kopru.firmaniz.local:8443/index.php",
    //   "logoApiAnahtari": "..."
    // }
    //
    // logoKopruUrl/logoApiAnahtari OPSİYONELDİR — kullanıcı isteği: "SolidWorks
    // arayüzü ÜretimOS'a bağlanmadan direkt LOGO'ya bağlanıp veri çeksin."
    // Doldurulursa EtiketlemePaneli, plaka/kenar bandı/hırdavat kodlarını
    // logo_koprusu/index.php'den (bkz. LogoKopruApiClient.cs) DOĞRUDAN çeker,
    // ÜretimOS'a hiç uğramaz. Boş bırakılırsa panel eski davranışına
    // (ÜretimOS üzerinden) sessizce döner — bu proje genelindeki "boş
    // bırakmak yanlış varsaymaktan ucuzdur" ilkesiyle AYNI.
    // ════════════════════════════════════════════════════════════════════════
    public class BaglantiAyarlariVerisi
    {
        public string SunucuUrl;
        public string KullaniciAdi;
        public string Sifre;
        public string LogoKopruUrl;
        public string LogoApiAnahtari;
    }

    public static class BaglantiAyarlari
    {
        private static readonly string DosyaYolu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UretimOSKesim", "baglanti.json");

        public static string DosyaYoluGoster() => DosyaYolu;

        public static BaglantiAyarlariVerisi Yukle()
        {
            try
            {
                if (!File.Exists(DosyaYolu)) return null;
                string json = File.ReadAllText(DosyaYolu);
                var veri = JsonConvert.DeserializeObject<BaglantiAyarlariVerisi>(json);
                // İKİ bağlantı türünden EN AZ biri dolu olsun yeter — bir
                // makine YALNIZCA LOGO köprüsüne (ÜretimOS'suz) bağlanmak
                // isteyebilir, sunucuUrl boş diye TÜM dosyayı geçersiz saymak
                // o senaryoyu kırardı.
                if (veri == null ||
                    (string.IsNullOrWhiteSpace(veri.SunucuUrl) && string.IsNullOrWhiteSpace(veri.LogoKopruUrl)))
                    return null;
                return veri;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiAyarlari.Yukle HATA: " + ex);
                return null;
            }
        }

        // Kullanıcı ilk kez EtiketlemePaneli'ni açtığında, dosya yoksa, nereye
        // ve hangi biçimde oluşturacağını gösteren bir örnek dosya yazar —
        // İÇİ BOŞ/örnek değerlerle (gerçek şifre asla otomatik yazılmaz).
        public static void OrnekDosyaOlustur()
        {
            try
            {
                string klasor = Path.GetDirectoryName(DosyaYolu);
                Directory.CreateDirectory(klasor);
                if (File.Exists(DosyaYolu)) return;
                var ornek = new BaglantiAyarlariVerisi
                {
                    SunucuUrl = "https://uretimos.firmaniz.com/api.php",
                    KullaniciAdi = "cad_entegrasyon",
                    Sifre = "buraya-kendi-sifrenizi-yazin",
                    // Opsiyonel — doldurmazsanız (boş "" bırakırsanız) plaka/
                    // kenar bandı/hırdavat kodları eskisi gibi ÜretimOS'tan
                    // gelmeye devam eder. bkz. logo_koprusu/README.md.
                    LogoKopruUrl = "",
                    LogoApiAnahtari = ""
                };
                File.WriteAllText(DosyaYolu, JsonConvert.SerializeObject(ornek, Formatting.Indented));
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiAyarlari.OrnekDosyaOlustur HATA: " + ex);
            }
        }
    }
}
