using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // HIRDAVAT DELİK UYGULAYICI — kullanıcı isteği: "box'a eklediğimiz
    // hırdavatların bağlantı deliklerini cutextrude olarak atıldığı yüzeyi
    // delecek şekilde düzenleyelim, frame'in içine atıldığında panelde delik
    // ve kanal oluştursun".
    //
    // TASARIM KARARI (bu KOORDİNAT AKTARIMINI tractable kılan temel fikir):
    // Box VE Frame panelleri AYNI AltiYuzKutuOlusturucu ile üretildiği için
    // (bkz. o dosyanın "rotasyon riskini SIFIRLAYAN" notu) her ikisi de AYNI
    // düzlem kuralını (YUZ_DUZLEM) ve AYNI sol-alt-köşe referansını paylaşır.
    // Bu yüzden box'ın temas yüzeyindeki bir delik (dx,dy), Frame panelinin
    // KENDİ yerel sketch'inde YALNIZCA box'ın Frame içindeki (x,z) veya
    // (x,y) yerleşim ofseti KADAR kaydırılarak (döndürme GEREKMEDEN) doğru
    // konuma gelir — bkz. KutuFrameYerlestirPaneli.cs'teki ofset hesabı.
    //
    // KAPSAM SINIRI (bilerek, bu turda): yalnızca DAİRESEL delikler
    // uygulanır. "Kanal" (sürekli menteşe/ray gibi uzun yuvalar) BİLEREK
    // YAPILMADI — ayrı bir sketch varlığı (dikdörtgen/slot) ve muhtemelen
    // ayrı bir hırdavat şablonu alanı gerektirir, tek turda eklemek riski
    // fazla artırırdı. Doğal bir sonraki adım olarak bırakıldı.
    //
    // ════ GÜVENİLİRLİK UYARISI (BU OTURUMUN EN YÜKSEK RİSKLİ ÇAĞRISI) ════════
    // IFeatureManager.FeatureCut4'ün TAM parametre listesi (FeatureExtrusion3
    // ile benzer ama AYRI, ~26 parametreli) resmi dokümantasyona bu ortamda
    // erişim ENGELLENDİ. Bu satır GERÇEK GEOMETRİ KESER — yanlışsa (a) en
    // olası: derleme hatası (güvenli), (b) düşük ihtimal ama mümkün: YANLIŞ
    // yerde/boyutta bir kesim oluşur. Bu komut çalıştırılmadan önce kullanıcı
    // AÇIK bir onay diyaloğuyla uyarılır (bkz. KutuFrameYerlestirPaneli.cs) ve
    // SolidWorks'ün kendi Geri Al (Ctrl+Z) desteği HER ZAMAN kullanılabilir.
    // İLK ÇALIŞTIRMADA oluşan delikleri SolidWorks'te MUTLAKA elle ölçüp
    // doğrulayın — bu, gerçek CNC'ye giden bir geometridir.
    // ════════════════════════════════════════════════════════════════════════
    public static class HirdavatDelikUygulayici
    {
        // hedefBelge: delik açılacak PART belgesi (box'ın kendi ilgili paneli
        // VEYA frame'in temas eden paneli — ikisi de aynı mantıkla çağrılır).
        // temasYuzu: bu panelin box ile temas eden yüzü — sketch düzlemini
        // belirler (AltiYuzKutuOlusturucu.YUZ_DUZLEM ile AYNI eşleme).
        // delikler: (x,y) mm cinsinden konum (panelin KENDİ yerel sketch
        // düzleminde) + çap (mm).
        public static bool DeliklerAc(ModelDoc2 hedefBelge, string temasYuzu, List<(double x, double y, double cap)> delikler, out string hata)
        {
            hata = null;
            if (delikler == null || delikler.Count == 0) return true;
            if (!AltiYuzKutuOlusturucu.YUZ_DUZLEM.TryGetValue(temasYuzu, out string duzlem))
            {
                hata = "Bilinmeyen temas yüzü: " + temasYuzu;
                return false;
            }

            try
            {
                Tanilama.Kaydet($"HirdavatDelikUygulayici.DeliklerAc basladi: {delikler.Count} delik, yuz={temasYuzu}");
                hedefBelge.Extension.SelectByID2(duzlem, "PLANE", 0, 0, 0, false, 0, null, 0);
                hedefBelge.SketchManager.InsertSketch(true);
                foreach (var d in delikler)
                {
                    // GERÇEK SolidWorks 2025 derlemesinde (reflection ile) doğrulandı:
                    // gerçek üye adı "CreateCircleByRadius2" DEĞİL, "CreateCircleByRadius".
                    hedefBelge.SketchManager.CreateCircleByRadius(d.x * 0.001, d.y * 0.001, 0, d.cap / 2 * 0.001);
                }
                hedefBelge.SketchManager.InsertSketch(true); // sketch'i kapat

                var fm = (IFeatureManager)hedefBelge.FeatureManager;
                // ThroughAll — panel kalınlığını elle bilmeye GEREK BIRAKMAZ,
                // "atıldığı yüzeyi delecek şekilde" isteğine tam karşılık gelir.
                // GERÇEK SolidWorks 2025 derlemesinde reflection ile doğrulanan TAM
                // 27 parametreli FeatureCut4 imzasına göre yeniden yazıldı — önceki
                // denemede PropagateFeatureToParts (23) ve OptimizeGeometry (27)
                // parametreleri eksikti.
                object feature = fm.FeatureCut4(
                    true, false, false, (int)swEndConditions_e.swEndCondThroughAll, 0,
                    0.0, 0.0,
                    false, false, false, false, 0.0, 0.0,
                    false, false, false, false, false,
                    true, true, true, true,
                    true, // PropagateFeatureToParts — montajdaki alt parçalara da yansısın
                    (int)swStartConditions_e.swStartSketchPlane,
                    0.0,   // StartOffset
                    false, // FlipStartOffset
                    false  // OptimizeGeometry
                    );

                Tanilama.Kaydet("HirdavatDelikUygulayici.DeliklerAc FeatureCut4 sonuc=" + (feature != null));
                if (feature == null)
                {
                    hata = "FeatureCut4 başarısız oldu (null döndü) — delik konumu panel sınırları dışında olabilir.";
                    return false;
                }
                return true;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("HirdavatDelikUygulayici.DeliklerAc HATA: " + ex);
                hata = ex.Message;
                return false;
            }
        }

        // HIRDAVAT_LISTESI ("kod:adet,kod:adet") içindeki her kodu ÜretimOS
        // hammaddeler (tip:'hirdavat') kartlarındaki delikSablonu alanıyla
        // eşler — TAM (case-insensitive) stokKodu eşleşmesi, bkz.
        // page_is_emri_formu.js:hirdavatEslestir ile AYNI ilke (bulanık
        // eşleştirme YOK, yanlış karta bağlamak boş bırakmaktan pahalıdır).
        // Eşleşmeyen/şablonsuz kodlar SESSİZCE atlanır ve uyarilar'a eklenir.
        public static List<(double x, double y, double cap)> HirdavatDeliklerTopla(string hirdavatListesi, JArray hammaddeler, List<string> uyarilar)
        {
            var sonuc = new List<(double x, double y, double cap)>();
            if (string.IsNullOrWhiteSpace(hirdavatListesi) || hammaddeler == null) return sonuc;

            foreach (var parcaHam in hirdavatListesi.Split(','))
            {
                string parca = parcaHam.Trim();
                if (string.IsNullOrEmpty(parca)) continue;
                int i = parca.LastIndexOf(':');
                string kod = (i >= 0 ? parca.Substring(0, i) : parca).Trim();
                if (string.IsNullOrEmpty(kod)) continue;

                var kart = hammaddeler.FirstOrDefault(h =>
                    string.Equals((string)h["stokKodu"], kod, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals((string)h["tip"], "hirdavat", StringComparison.OrdinalIgnoreCase));
                if (kart == null)
                {
                    uyarilar?.Add($"Hırdavat kodu '{kod}' ÜretimOS'ta bulunamadı — delik şablonu uygulanmadı.");
                    continue;
                }

                var sablon = kart["delikSablonu"] as JArray;
                if (sablon == null || sablon.Count == 0)
                {
                    uyarilar?.Add($"'{kod}' için bağlantı delik şablonu tanımlı değil (Hammaddeler ekranından ekleyin) — delik açılmadı.");
                    continue;
                }

                foreach (var d in sablon)
                {
                    double x = (double?)d["x"] ?? 0, y = (double?)d["y"] ?? 0, cap = (double?)d["cap"] ?? 0;
                    if (cap > 0) sonuc.Add((x, y, cap));
                }
            }
            return sonuc;
        }
    }
}
