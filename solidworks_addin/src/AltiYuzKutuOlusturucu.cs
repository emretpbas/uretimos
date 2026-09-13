using System;
using System.Collections.Generic;
using System.IO;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // Bir "6 yüz kutu" (Frame/gövde VEYA Box/iç modül — AYNI mantık, kullanıcı
    // isteği: "box'ı da 6 yüz olarak yap") için üretim parametreleri.
    public class AltiYuzKutuParametreleri
    {
        public string Kod;          // panel/montaj dosya adlarının TEMELİ (örn. "DOLAP-01")
        public string Ad;
        public double GenislikMm;   // X ekseni (SolidWorks "Front Plane"e bakışta yatay)
        public double YukseklikMm;  // Y ekseni (dikey)
        public double DerinlikMm;   // Z ekseni (bakış yönü)
        public double KalinlikMm;   // TÜM panellerde AYNI kalınlık (v1 sınırlaması — bkz. dosya başı notu)

        // Hangi yüzler üretilsin — örn. bir çekmece kutusunun üstü genelde
        // AÇIKTIR, bir Frame'in önü genelde AÇIKTIR (kapak/çekmece takılır).
        // Varsayılan: 6 yüzün TAMAMI.
        public HashSet<string> DahilYuzler = new HashSet<string> { "ust", "alt", "sol", "sag", "on", "arka" };
    }

    // ════════════════════════════════════════════════════════════════════════
    // 6 YÜZ KUTU OLUŞTURUCU — kullanıcı isteği: "Frame dosyasında oluşturduğumuz
    // gövde içerisine ... bir box atalım ... box'ı da 6 yüz olarak yap".
    //
    // TASARIM KARARI (rotasyon riskini SIFIRLAYAN temel fikir): SolidWorks'te
    // AddComponent5 ile bir bileşen eklerken YALNIZCA KONUM (X,Y,Z) verilir,
    // DÖNDÜRME verilmez — bileşen KENDİ dosyasındaki orijinal yönelimiyle
    // eklenir. Bu yüzden her panel, sketch'i BİLEREK FARKLI bir referans
    // düzlemde çizilerek KENDİ dosyasında ZATEN doğru yönelimde üretilir:
    //   - Üst/Alt panel   → "Top Plane"te çizilir (Genişlik × Derinlik), Y'de
    //                        (kalınlık kadar) extrude edilir.
    //   - Sol/Sağ panel   → "Right Plane"te çizilir (Derinlik × Yükseklik),
    //                        X'te extrude edilir.
    //   - Ön/Arka panel   → "Front Plane"te çizilir (Genişlik × Yükseklik),
    //                        Z'de extrude edilir.
    // Böylece montajda hiçbir döndürme matrisi HESAPLANMAZ/UYGULANMAZ — bu,
    // rotasyon hesaplarının yanlış gidebileceği bir API yüzeyinden TAMAMEN
    // kaçınır (bilerek basitleştirilmiş, ama SAĞLAM bir tasarım).
    //
    // Her panel KENDİ bileşenine "Fix" (sabitle) uygulanır — gerçek geometrik
    // mate (IMate2) OLUŞTURULMAZ (çok daha büyük, doğrulanamamış bir API
    // yüzeyi olurdu). Konumlar zaten doğru olduğu için kutu görsel/ölçüsel
    // olarak DOĞRU olur; kullanıcı isterse SolidWorks'te sonradan gerçek
    // mate ekleyebilir.
    //
    // GÜVENİLİRLİK UYARISI (ÇOK ÖNEMLİ, DelikFormCikarici.cs ile AYNI ilke):
    // Bu dosyadaki ISketchManager.CreateCornerRectangle / IFeatureManager.
    // FeatureExtrusion3 (ÖZELLİKLE bu — 24 parametreli, resmi dokümantasyona
    // bu ortamda erişim ENGELLENDİ) / IAssemblyDoc.AddComponent5 / FixComponent
    // çağrıları GENİŞ ÇAPLI kullanılan ama BİZZAT DOĞRULANAMAMIŞ API'lerdir.
    // Yanlışsa EN OLASI sonuç bir DERLEME HATASI (güvenli, Visual Studio'da
    // hemen görülür) — ama FeatureExtrusion3 gibi çok sayıda bool/int/double
    // parametreli bir çağrıda, YANLIŞ SIRALAMA "derlenir ama yanlış geometri
    // üretir" riski de taşır. İLK ÇALIŞTIRMADA üretilen panellerin ölçülerini
    // SolidWorks'te MUTLAKA elle ölçüp doğrulayın.
    // ════════════════════════════════════════════════════════════════════════
    public class AltiYuzKutuOlusturucu
    {
        private readonly ISldWorks _app;
        private readonly List<string> _uyarilar = new List<string>();
        public IReadOnlyList<string> Uyarilar => _uyarilar;

        public AltiYuzKutuOlusturucu(ISldWorks app) { _app = app; }

        private const double MM_TO_M = 0.001; // SolidWorks dahili birimi METREDİR

        // Yüz adı -> (referans düzlem, genişlik-ekseni-mm, yükseklik-ekseni-mm,
        // extrude-yönü [1=X,2=Y,3=Z], konum-ofseti-hesaplayan fonksiyon).
        // public: HirdavatDelikUygulayici.cs, box↔frame panel arasında delik
        // konumu aktarırken (temas yüzüne göre) AYNI düzlem eşlemesini kullanır
        // — iki sınıf ARASINDA tutarlılık, kopyalamak yerine PAYLAŞIM ile sağlanır.
        public static readonly Dictionary<string, string> YUZ_DUZLEM = new Dictionary<string, string>
        {
            ["ust"] = "Top Plane", ["alt"] = "Top Plane",
            ["sol"] = "Right Plane", ["sag"] = "Right Plane",
            ["on"] = "Front Plane", ["arka"] = "Front Plane"
        };

        public string Olustur(AltiYuzKutuParametreleri p, string cikisKlasoru, string partSablonYolu, string montajSablonYolu)
        {
            _uyarilar.Clear();
            if (string.IsNullOrWhiteSpace(p.Kod)) { _uyarilar.Add("Kod boş olamaz."); return null; }
            if (p.GenislikMm <= 0 || p.YukseklikMm <= 0 || p.DerinlikMm <= 0 || p.KalinlikMm <= 0)
            {
                _uyarilar.Add("Genişlik/Yükseklik/Derinlik/Kalınlık pozitif olmalı.");
                return null;
            }
            Directory.CreateDirectory(cikisKlasoru);

            var panelYollari = new Dictionary<string, string>();
            foreach (var yuz in p.DahilYuzler)
            {
                if (!YUZ_DUZLEM.ContainsKey(yuz)) { _uyarilar.Add($"Bilinmeyen yüz adı: {yuz}"); continue; }
                string yol = PanelOlustur(yuz, p, cikisKlasoru, partSablonYolu);
                if (yol != null) panelYollari[yuz] = yol;
            }

            if (panelYollari.Count == 0)
            {
                _uyarilar.Add("Hiçbir panel oluşturulamadı — montaj kurulamadı.");
                return null;
            }

            return MontajOlustur(p, panelYollari, cikisKlasoru, montajSablonYolu);
        }

        // Yüze göre (genişlik, yükseklik) sketch ölçüleri ve konum ofseti (mm).
        private (double genislik, double yukseklik, double x, double y, double z) YuzGeometrisi(string yuz, AltiYuzKutuParametreleri p)
        {
            double g = p.GenislikMm, y = p.YukseklikMm, d = p.DerinlikMm, k = p.KalinlikMm;
            switch (yuz)
            {
                case "alt": return (g, d, 0, 0, 0);
                case "ust": return (g, d, 0, y - k, 0);
                case "sol": return (d, y, 0, 0, 0);
                case "sag": return (d, y, g - k, 0, 0);
                case "arka": return (g, y, 0, 0, 0);
                case "on": return (g, y, 0, 0, d - k);
                default: throw new ArgumentException("Bilinmeyen yüz: " + yuz);
            }
        }

        private string PanelOlustur(string yuz, AltiYuzKutuParametreleri p, string cikisKlasoru, string partSablonYolu)
        {
            try
            {
                Tanilama.Kaydet($"AltiYuzKutuOlusturucu.PanelOlustur({yuz}) basladi");
                var belge = (ModelDoc2)_app.NewDocument(partSablonYolu, 0, 0, 0);
                if (belge == null) { _uyarilar.Add($"'{yuz}' paneli için yeni parça dosyası açılamadı."); return null; }

                var (genislikMm, yukseklikMm, _, _, _) = YuzGeometrisi(yuz, p);
                string duzlem = YUZ_DUZLEM[yuz];

                belge.Extension.SelectByID2(duzlem, "PLANE", 0, 0, 0, false, 0, null, 0);
                belge.SketchManager.InsertSketch(true);
                belge.SketchManager.CreateCornerRectangle(0, 0, 0, genislikMm * MM_TO_M, yukseklikMm * MM_TO_M, 0);
                belge.SketchManager.InsertSketch(true); // sketch'i kapat

                var fm = (IFeatureManager)belge.FeatureManager;
                // Blind, tek yön, kalınlık kadar extrude — bkz. dosya başı
                // GÜVENİLİRLİK UYARISI (bu çağrı en yüksek risk taşıyan çağrıdır).
                fm.FeatureExtrusion3(
                    true, false, false, (int)swEndConditions_e.swEndCondBlind, 0,
                    p.KalinlikMm * MM_TO_M, 0.0,
                    false, false, false, false, 0.0, 0.0,
                    false, false, false, false,
                    true, true, true,
                    (int)swStartConditions_e.swStartSketchPlane, false, false);

                string kod = p.Kod + "_" + yuz.ToUpperInvariant();
                string ad = (p.Ad ?? p.Kod) + " — " + YuzAdiTurkce(yuz);
                KesimListesiCikarici.OzelAlanYaz(belge, OzelAlanlar.TIP, "parca");
                KesimListesiCikarici.OzelAlanYaz(belge, OzelAlanlar.KOD, kod);
                KesimListesiCikarici.OzelAlanYaz(belge, OzelAlanlar.AD, ad);
                KesimListesiCikarici.OzelAlanYaz(belge, OzelAlanlar.BOY_MM, genislikMm.ToString(System.Globalization.CultureInfo.InvariantCulture));
                KesimListesiCikarici.OzelAlanYaz(belge, OzelAlanlar.EN_MM, yukseklikMm.ToString(System.Globalization.CultureInfo.InvariantCulture));
                KesimListesiCikarici.OzelAlanYaz(belge, OzelAlanlar.KALINLIK_MM, p.KalinlikMm.ToString(System.Globalization.CultureInfo.InvariantCulture));

                string dosyaYolu = Path.Combine(cikisKlasoru, kod + ".SLDPRT");
                int hata = 0, uyariKod = 0;
                bool basarili = belge.Extension.SaveAs3(dosyaYolu, (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, null, ref hata, ref uyariKod);
                Tanilama.Kaydet($"AltiYuzKutuOlusturucu.PanelOlustur({yuz}) SaveAs3 basarili={basarili} hata={hata}");
                if (!basarili)
                {
                    _uyarilar.Add($"'{yuz}' paneli kaydedilemedi (SaveAs3 hata kodu: {hata}).");
                    return null;
                }
                _app.CloseDoc(belge.GetTitle());
                return dosyaYolu;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet($"AltiYuzKutuOlusturucu.PanelOlustur({yuz}) HATA: " + ex);
                _uyarilar.Add($"'{yuz}' paneli oluşturulurken hata: {ex.Message}");
                return null;
            }
        }

        private string MontajOlustur(AltiYuzKutuParametreleri p, Dictionary<string, string> panelYollari, string cikisKlasoru, string montajSablonYolu)
        {
            try
            {
                Tanilama.Kaydet("AltiYuzKutuOlusturucu.MontajOlustur basladi");
                var montaj = (ModelDoc2)_app.NewDocument(montajSablonYolu, 0, 0, 0);
                if (montaj == null) { _uyarilar.Add("Montaj dosyası açılamadı."); return null; }
                var asmDoc = (AssemblyDoc)montaj;

                foreach (var kv in panelYollari)
                {
                    var (_, _, xMm, yMm, zMm) = YuzGeometrisi(kv.Key, p);
                    object bilesenObj = asmDoc.AddComponent5(kv.Value,
                        (int)swAddComponentConfigOptions_e.swAddComponentConfigOptions_CurrentSelectedConfig,
                        "", false, "", xMm * MM_TO_M, yMm * MM_TO_M, zMm * MM_TO_M);
                    var bilesen = bilesenObj as Component2;
                    if (bilesen == null)
                    {
                        _uyarilar.Add($"'{kv.Key}' paneli montaja eklenemedi.");
                        continue;
                    }
                    // Sabitle (Fix) — gerçek mate OLUŞTURULMAZ, bkz. dosya başı notu.
                    bilesen.Select4(false, null, false);
                    asmDoc.FixComponent();
                }

                KesimListesiCikarici.OzelAlanYaz(montaj, OzelAlanlar.TIP, "alt_montaj");
                KesimListesiCikarici.OzelAlanYaz(montaj, OzelAlanlar.KOD, p.Kod);
                KesimListesiCikarici.OzelAlanYaz(montaj, OzelAlanlar.AD, p.Ad ?? p.Kod);

                string montajYolu = Path.Combine(cikisKlasoru, p.Kod + ".SLDASM");
                int hata = 0, uyariKod = 0;
                bool basarili = montaj.Extension.SaveAs3(montajYolu, (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, null, ref hata, ref uyariKod);
                Tanilama.Kaydet($"AltiYuzKutuOlusturucu.MontajOlustur SaveAs3 basarili={basarili} hata={hata}");
                if (!basarili)
                {
                    _uyarilar.Add($"Montaj dosyası kaydedilemedi (SaveAs3 hata kodu: {hata}).");
                    return null;
                }
                return montajYolu;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("AltiYuzKutuOlusturucu.MontajOlustur HATA: " + ex);
                _uyarilar.Add("Montaj oluşturulurken hata: " + ex.Message);
                return null;
            }
        }

        private static string YuzAdiTurkce(string yuz)
        {
            switch (yuz)
            {
                case "ust": return "Üst";
                case "alt": return "Alt";
                case "sol": return "Sol";
                case "sag": return "Sağ";
                case "on": return "Ön";
                case "arka": return "Arka";
                default: return yuz;
            }
        }
    }
}
