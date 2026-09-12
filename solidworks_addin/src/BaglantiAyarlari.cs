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
    //   "sifre": "..."
    // }
    // ════════════════════════════════════════════════════════════════════════
    public class BaglantiAyarlariVerisi
    {
        public string SunucuUrl;
        public string KullaniciAdi;
        public string Sifre;
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
                if (veri == null || string.IsNullOrWhiteSpace(veri.SunucuUrl)) return null;
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
                    Sifre = "buraya-kendi-sifrenizi-yazin"
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
