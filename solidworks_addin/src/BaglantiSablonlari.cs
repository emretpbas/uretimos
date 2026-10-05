using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // BAĞLANTI ŞABLONLARI — kullanıcı isteği: "üretimosa da bu delik ve
    // bağlantı şablonlarını ekleyebileceğimiz bir eklenti yazalım" (SWOOD
    // Connectors kütüphanesindeki LINCO SABLON çalışmasının ardından).
    // Kullanıcı seçimi: kütüphane YALNIZCA bu eklentide, yerel JSON dosyasında
    // tutulur (%LocalAppData%\UretimOSKesim\baglanti_sablonlari.json) — web'de
    // görünmez.
    //
    // BİRLEŞİM TERİMLERİ (bkz. BaglantiUygulayici.cs):
    //   Gövde paneli  = kenarı (alın yüzü) diğer panelin yüzeyine dayanan panel
    //                   (Linco gövdesinin takıldığı dikme gibi).
    //   Karşı panel   = yüzeyine dayanılan panel (Dufix'in takıldığı tabla).
    //   Birleşim düzlemi = karşı panelin temas yüzeyi.
    // Bir bağlantı ELEMANI birden çok delikten oluşur (Linco = 3×Ø18 cep +
    // Ø10 Dufix); DİZİ kuralı bu elemanı birleşim boyunca çoğaltır.
    // ════════════════════════════════════════════════════════════════════════
    public enum DelikTuru
    {
        GovdeYuzey, // gövde panelinin iç yüzeyine, yüzeye dik (Linco cebi, minifix gövdesi)
        GovdeKenar, // gövde panelinin alın yüzüne, birleşim düzlemine dik (kavela)
        KarsiYuzey  // karşı panelin temas yüzeyine, birleşim düzlemine dik (Dufix, kavela karşılığı)
    }

    public class DelikTanimi
    {
        public DelikTuru Tur = DelikTuru.GovdeYuzey;
        // Elemanın merkezine göre birleşim boyunca kaydırma (mm).
        public double XMm;
        // GovdeYuzey: birleşim düzleminden delik merkezine uzaklık.
        // GovdeKenar / KarsiYuzey: gövde panelinin orta düzleminden iç yüze
        // doğru kaydırma (0 = panel kalınlığının ortası).
        public double OfsetMm;
        public double CapMm;
        public double DerinlikMm;
    }

    public enum DiziModu
    {
        Soldan,   // ilk eleman sol uçtan SolOfset'te, sonrakiler Aralıklar kadar ilerler
        Sagdan,   // ilk eleman sağ uçtan SagOfset'te, sonrakiler geriye doğru
        EsitDagit // SolOfset..SagOfset arasında eşit aralıklı (1 eleman = orta)
    }

    public class BaglantiSablonu
    {
        public string Ad = "Yeni bağlantı";
        public string Aciklama = "";
        public List<DelikTanimi> Delikler = new List<DelikTanimi>();
        public DiziModu Mod = DiziModu.Soldan;
        public int ElemanSayisi = 2;
        public double SolOfsetMm = 32;
        public double SagOfsetMm = 32;
        // Ardışık elemanlar arası aralıklar; eksikse son değer tekrar eder.
        public List<double> AraliklarMm = new List<double> { 224 };

        public BaglantiSablonu Kopya() =>
            JsonConvert.DeserializeObject<BaglantiSablonu>(JsonConvert.SerializeObject(this));

        // Birleşim boyunca eleman merkezleri — [0, uzunluk] aralığında, "sol"
        // uçtan ölçülen mm. Aralık dışına düşenler de döner; çağıran uyarır.
        public List<double> ElemanKonumlari(double uzunlukMm)
        {
            var sonuc = new List<double>();
            int n = Math.Max(0, ElemanSayisi);
            if (n == 0) return sonuc;
            double Aralik(int i) => AraliklarMm == null || AraliklarMm.Count == 0 ? 0 : AraliklarMm[Math.Min(i, AraliklarMm.Count - 1)];

            switch (Mod)
            {
                case DiziModu.Sagdan:
                    {
                        double p = uzunlukMm - SagOfsetMm;
                        for (int i = 0; i < n; i++) { sonuc.Add(p); p -= Aralik(i); }
                        break;
                    }
                case DiziModu.EsitDagit:
                    {
                        double bas = SolOfsetMm, son = uzunlukMm - SagOfsetMm;
                        if (n == 1) sonuc.Add((bas + son) / 2.0);
                        else for (int i = 0; i < n; i++) sonuc.Add(bas + (son - bas) * i / (n - 1));
                        break;
                    }
                default:
                    {
                        double p = SolOfsetMm;
                        for (int i = 0; i < n; i++) { sonuc.Add(p); p += Aralik(i); }
                        break;
                    }
            }
            return sonuc;
        }
    }

    public static class BaglantiSablonKutuphanesi
    {
        public static string DosyaYolu => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "UretimOSKesim", "baglanti_sablonlari.json");

        public static List<BaglantiSablonu> Yukle()
        {
            try
            {
                if (File.Exists(DosyaYolu))
                {
                    var liste = JsonConvert.DeserializeObject<List<BaglantiSablonu>>(File.ReadAllText(DosyaYolu));
                    if (liste != null) return liste;
                }
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiSablonKutuphanesi.Yukle HATA (varsayılanlar kullanılacak): " + ex.Message);
            }
            return Varsayilanlar();
        }

        public static void Kaydet(List<BaglantiSablonu> liste)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(DosyaYolu));
            File.WriteAllText(DosyaYolu, JsonConvert.SerializeObject(liste, Formatting.Indented));
        }

        // Varsayılan kütüphane. Linco ölçüleri Mesan PDF'lerinden (102-01-71
        // Linco 18 mm + 102-02-33 Stoplu Dufix Ø10×34) — SWOOD'da kurulan
        // LINCO SABLON ile aynı. Kavela 8×30 yaygın değerlerle örnek olarak
        // eklendi; kullanıcı kendi atölye değerleriyle düzeltmeli.
        public static List<BaglantiSablonu> Varsayilanlar() => new List<BaglantiSablonu>
        {
            new BaglantiSablonu
            {
                Ad = "Linco 18 + Dufix Ø10",
                Aciklama = "Mesan Linco 102-01-71 (18 mm panel) + Stoplu Dufix Ø10×34 102-02-33. Gövde cebi iç içe 3×Ø18×14,5 (kenardan 6-20-34), karşı panelde Ø10×12.",
                Delikler = new List<DelikTanimi>
                {
                    new DelikTanimi { Tur = DelikTuru.GovdeYuzey, OfsetMm = 6,  CapMm = 18, DerinlikMm = 14.5 },
                    new DelikTanimi { Tur = DelikTuru.GovdeYuzey, OfsetMm = 20, CapMm = 18, DerinlikMm = 14.5 },
                    new DelikTanimi { Tur = DelikTuru.GovdeYuzey, OfsetMm = 34, CapMm = 18, DerinlikMm = 14.5 },
                    new DelikTanimi { Tur = DelikTuru.KarsiYuzey, OfsetMm = 0,  CapMm = 10, DerinlikMm = 12 },
                },
                Mod = DiziModu.Soldan, ElemanSayisi = 2, SolOfsetMm = 32, SagOfsetMm = 32,
                AraliklarMm = new List<double> { 224 }
            },
            new BaglantiSablonu
            {
                Ad = "Kavela 8×30 (örnek)",
                Aciklama = "Örnek değerler — atölye standardınıza göre düzeltin.",
                Delikler = new List<DelikTanimi>
                {
                    new DelikTanimi { Tur = DelikTuru.GovdeKenar, OfsetMm = 0, CapMm = 8, DerinlikMm = 18 },
                    new DelikTanimi { Tur = DelikTuru.KarsiYuzey, OfsetMm = 0, CapMm = 8, DerinlikMm = 12 },
                },
                Mod = DiziModu.EsitDagit, ElemanSayisi = 3, SolOfsetMm = 32, SagOfsetMm = 32,
                AraliklarMm = new List<double> { 0 }
            }
        };
    }
}
