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
        // Kullanıcı isteği: "bu eklentiye 3d model eklemek için bir tuş
        // ekleyelim ayrıca bu modeli kütüphane için bir yere kaydedelim".
        // Model kütüphane klasörüne kopyalanır, burada yalnızca dosya adı
        // tutulur (bkz. BaglantiSablonKutuphanesi.ModelKlasoru). Modelin
        // orijini = bağlantı elemanının merkezi (birleşim düzleminde, gövde
        // kalınlığının ortasında); X birleşim boyunca, Y gövde paneline doğru,
        // Z gövdenin iç yüzüne doğru.
        public string ModelDosyasi;

        public string ModelYolu() =>
            string.IsNullOrWhiteSpace(ModelDosyasi) ? null : Path.Combine(BaglantiSablonKutuphanesi.ModelKlasoru, ModelDosyasi);

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

        public static string ModelKlasoru => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "ÜretimOS", "Bağlantı Modelleri");

        // Seçilen 3B modeli kütüphane klasörüne kopyalar, kütüphanedeki dosya
        // adını döndürür. Aynı adda farklı bir dosya varsa _2, _3 … eklenir.
        // NOT: .SLDASM kopyalanırken alt parçaları KOPYALANMAZ — montaj
        // modelleri için alt parçalar aynı klasöre ayrıca konmalı.
        public static string ModeliKutuphaneyeKopyala(string kaynak)
        {
            Directory.CreateDirectory(ModelKlasoru);
            string ad = Path.GetFileNameWithoutExtension(kaynak), uzanti = Path.GetExtension(kaynak);
            string hedef = Path.Combine(ModelKlasoru, ad + uzanti);
            if (string.Equals(Path.GetFullPath(kaynak), Path.GetFullPath(hedef), StringComparison.OrdinalIgnoreCase))
                return Path.GetFileName(hedef);
            for (int i = 2; File.Exists(hedef); i++)
            {
                if (new FileInfo(hedef).Length == new FileInfo(kaynak).Length &&
                    File.ReadAllBytes(hedef).SequenceEqual(File.ReadAllBytes(kaynak)))
                    return Path.GetFileName(hedef); // aynı dosya zaten kütüphanede
                hedef = Path.Combine(ModelKlasoru, $"{ad}_{i}{uzanti}");
            }
            File.Copy(kaynak, hedef);
            return Path.GetFileName(hedef);
        }

        public static List<BaglantiSablonu> Yukle()
        {
            try
            {
                if (File.Exists(DosyaYolu))
                {
                    var liste = JsonConvert.DeserializeObject<List<BaglantiSablonu>>(File.ReadAllText(DosyaYolu));
                    if (liste != null)
                    {
                        // Sonradan eklenen varsayılan şablonlar (ör. Minifix, Rafix)
                        // kayıtlı kütüphanede o adla yoksa eklenir.
                        foreach (var v in Varsayilanlar())
                            if (!liste.Any(s => string.Equals(s.Ad, v.Ad, StringComparison.OrdinalIgnoreCase))) liste.Add(v);
                        return liste;
                    }
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
            // Kullanıcı isteği: "bağlantı şablonlarına minifix ve rafix
            // şablonlarını da ekleyelim". Ölçüler kullanıcının SWOOD Connectors
            // kütüphanesinden (Assemblages.efiass): "Minifiks" / "BELLONA YENİ
            // Minifix" — DE 15, PE 14, DecE 34, DCG 8 (alındaki gövde deliği,
            // DecCG 9 = kalınlık ortası), DPG 10 × PPG 11 (karşı panel).
            // Alın deliğinin derinliği eksantriğe ulaşacak şekilde 34 mm.
            new BaglantiSablonu
            {
                Ad = "Minifix 15",
                Aciklama = "Minifix Ø15×14 (kenardan 34), alında Ø8×34, karşı panelde Ø10×11 — SWOOD 'Minifiks' kaydıyla aynı.",
                Delikler = new List<DelikTanimi>
                {
                    new DelikTanimi { Tur = DelikTuru.GovdeYuzey, OfsetMm = 34, CapMm = 15, DerinlikMm = 14 },
                    new DelikTanimi { Tur = DelikTuru.GovdeKenar, OfsetMm = 0,  CapMm = 8,  DerinlikMm = 34 },
                    new DelikTanimi { Tur = DelikTuru.KarsiYuzey, OfsetMm = 0,  CapMm = 10, DerinlikMm = 11 },
                },
                Mod = DiziModu.Soldan, ElemanSayisi = 2, SolOfsetMm = 32, SagOfsetMm = 32,
                AraliklarMm = new List<double> { 224 }
            },
            // SWOOD "RAFİX" kaydı: DE 20, PE 14, DecE 9,5, DTG 2,5 × PTG 5,
            // DecTG 9 (kalınlık ortası). DTG 2,5 kütüphanedeki değerdir —
            // Rafix pimi için küçük görünüyor, kullanıcı kontrol etmeli.
            new BaglantiSablonu
            {
                Ad = "Rafix 20",
                Aciklama = "Rafix Ø20×14 (kenardan 9,5), karşı panelde Ø2,5×5 — SWOOD 'RAFİX' kaydıyla aynı; karşı delik çapını kontrol edin.",
                Delikler = new List<DelikTanimi>
                {
                    new DelikTanimi { Tur = DelikTuru.GovdeYuzey, OfsetMm = 9.5, CapMm = 20,  DerinlikMm = 14 },
                    new DelikTanimi { Tur = DelikTuru.KarsiYuzey, OfsetMm = 0,   CapMm = 2.5, DerinlikMm = 5 },
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
