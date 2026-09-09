using System;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // TEKNİK RESİM OLUŞTURUCU — kullanıcının bu görüşmedeki asıl ilk isteği:
    // "her çizilen alt montajın teknik resimlerini almak". Her parça/alt montaj
    // için şablon üzerinden 4 görünüşlü (Ön/Üst/Sağ/İzometrik) bir çizim
    // oluşturur ve PDF'e kaydeder.
    //
    // AÇIKÇA BELİRTİLMESİ GEREKEN SINIRLAR (v1 taslak):
    //  • Görünüş yerleşim koordinatları SABİT/yaklaşık — şablonunuzdaki kağıt
    //    boyutuna ve antete göre AYARLANMALI (aşağıdaki VIEW_* sabitleri).
    //  • Ölçülendirme (dimension) OTOMATİK EKLENMEZ — SolidWorks'ün "Model
    //    Items" (Insert > Annotations > Model Items) özelliği modelde zaten
    //    tanımlı ölçüler varsa bunları çizime taşıyabilir; bu metoda ikinci
    //    bir adım olarak eklenebilir (Faz 2).
    //  • Şablon yolu (sablonYolu) kendi .drwdot dosyanızın TAM YOLU olmalı.
    // ════════════════════════════════════════════════════════════════════════
    public class TeknikResimOlusturucu
    {
        private readonly ISldWorks _app;
        private readonly List<string> _uyarilar = new List<string>();
        public IReadOnlyList<string> Uyarilar => _uyarilar;

        // Görünüş yerleşimi — metre cinsinden, sayfanın SOL-ALT köşesi (0,0).
        // A3 yatay (420x297mm) şablon varsayımıyla kabaca ortalanmış 4 görünüş.
        private const double VIEW_ON_X = 0.10, VIEW_ON_Y = 0.20;
        private const double VIEW_UST_X = 0.10, VIEW_UST_Y = 0.05;
        private const double VIEW_SAG_X = 0.25, VIEW_SAG_Y = 0.20;
        private const double VIEW_ISO_X = 0.32, VIEW_ISO_Y = 0.06;

        public TeknikResimOlusturucu(ISldWorks app) { _app = app; }

        // modelYolu: içe aktarılacak parça/montajın TAM dosya yolu (zaten
        // SolidWorks'te açık olması gerekir — CreateDrawViewFromModelView3
        // açık bir belgeye referans verir).
        // Döndürdüğü değer: oluşturulan PDF'in tam yolu, hata varsa null.
        // GÜVENLİK AĞI: bu sınıftaki NewDocument/CreateDrawViewFromModelView3/
        // SaveAs3 çağrıları henüz canlıda hiç denenmedi. SwAddin.cs'teki
        // Activate() çökmesinde öğrenilen ders: SolidWorks'ün native tarafında
        // oluşan bir çökme managed try/catch ile YAKALANAMAZ — bu yüzden her
        // riskli çağrıdan önce/sonra Tanilama.Kaydet() ile diske yazılıyor;
        // çökme olursa Masaüstü\uretimos_addin_log.txt'nin son satırı tam
        // olarak hangi çağrının çökerttiğini gösterir (tahmin gerekmez).
        public string TeknikResimOlustur(string modelYolu, string sablonYolu, string cikisKlasoru, string dosyaAdiOnEki)
        {
            Tanilama.Kaydet($"TeknikResimOlustur basladi: model={modelYolu}, sablon={sablonYolu}");
            try
            {
                int hata = 0;
                Tanilama.Kaydet("NewDocument cagriliyor");
                IModelDoc2 cizimBelge = (IModelDoc2)_app.NewDocument(sablonYolu, (int)swDwgPaperSizes_e.swDwgPaperA3size, 0.42, 0.297);
                Tanilama.Kaydet("NewDocument tamamlandi, cizimBelge null mu=" + (cizimBelge == null));
                if (cizimBelge == null)
                {
                    _uyarilar.Add($"'{sablonYolu}' şablonundan çizim oluşturulamadı — yol doğru mu?");
                    return null;
                }

                var cizim = (IDrawingDoc)cizimBelge;

                Tanilama.Kaydet("1. CreateDrawViewFromModelView3 (*Front) cagriliyor");
                IView v1 = cizim.CreateDrawViewFromModelView3(modelYolu, "*Front", VIEW_ON_X, VIEW_ON_Y, 0);
                Tanilama.Kaydet("1. tamamlandi, v1 null mu=" + (v1 == null));

                Tanilama.Kaydet("2. CreateDrawViewFromModelView3 (*Top) cagriliyor");
                IView v2 = cizim.CreateDrawViewFromModelView3(modelYolu, "*Top", VIEW_UST_X, VIEW_UST_Y, 0);
                Tanilama.Kaydet("2. tamamlandi, v2 null mu=" + (v2 == null));

                Tanilama.Kaydet("3. CreateDrawViewFromModelView3 (*Right) cagriliyor");
                IView v3 = cizim.CreateDrawViewFromModelView3(modelYolu, "*Right", VIEW_SAG_X, VIEW_SAG_Y, 0);
                Tanilama.Kaydet("3. tamamlandi, v3 null mu=" + (v3 == null));

                Tanilama.Kaydet("4. CreateDrawViewFromModelView3 (*Isometric) cagriliyor");
                IView v4 = cizim.CreateDrawViewFromModelView3(modelYolu, "*Isometric", VIEW_ISO_X, VIEW_ISO_Y, 0);
                Tanilama.Kaydet("4. tamamlandi, v4 null mu=" + (v4 == null));

                if (v1 == null && v2 == null && v3 == null && v4 == null)
                {
                    _uyarilar.Add($"'{modelYolu}' için hiçbir görünüş oluşturulamadı — model açık mı, yol geçerli mi kontrol edin.");
                    Tanilama.Kaydet("Hicbir gorunus olusturulamadi, CloseDoc cagriliyor");
                    _app.CloseDoc(cizimBelge.GetTitle());
                    return null;
                }

                Tanilama.Kaydet("ViewZoomtofit2 cagriliyor");
                cizimBelge.ViewZoomtofit2();
                Tanilama.Kaydet("ViewZoomtofit2 tamamlandi");

                string dosyaAdi = System.IO.Path.Combine(cikisKlasoru,
                    (dosyaAdiOnEki ?? "teknik_resim") + ".pdf");

                Tanilama.Kaydet("SaveAs3 cagriliyor: " + dosyaAdi);
                bool basarili = ((IModelDocExtension)cizimBelge.Extension).SaveAs3(
                    dosyaAdi,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    null, null, ref hata, ref hata);
                Tanilama.Kaydet("SaveAs3 tamamlandi, basarili=" + basarili + ", hata=" + hata);

                Tanilama.Kaydet("CloseDoc cagriliyor");
                _app.CloseDoc(cizimBelge.GetTitle());
                Tanilama.Kaydet("CloseDoc tamamlandi - TeknikResimOlustur bitti");

                if (!basarili)
                {
                    _uyarilar.Add($"'{modelYolu}' → PDF kaydedilemedi (SaveAs3 hata kodu: {hata}).");
                    return null;
                }
                return dosyaAdi;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("TeknikResimOlustur HATA (managed exception): " + ex);
                _uyarilar.Add($"'{modelYolu}' için teknik resim oluşturulurken hata: {ex.Message}");
                return null;
            }
        }
    }
}
