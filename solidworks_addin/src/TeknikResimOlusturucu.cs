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
        public string TeknikResimOlustur(string modelYolu, string sablonYolu, string cikisKlasoru, string dosyaAdiOnEki)
        {
            try
            {
                int hata = 0;
                IModelDoc2 cizimBelge = (IModelDoc2)_app.NewDocument(sablonYolu, (int)swDwgPaperSizes_e.swDwgPaperA3size, 0.42, 0.297);
                if (cizimBelge == null)
                {
                    _uyarilar.Add($"'{sablonYolu}' şablonundan çizim oluşturulamadı — yol doğru mu?");
                    return null;
                }

                var cizim = (IDrawingDoc)cizimBelge;

                IView v1 = cizim.CreateDrawViewFromModelView3(modelYolu, "*Front", VIEW_ON_X, VIEW_ON_Y, 0);
                IView v2 = cizim.CreateDrawViewFromModelView3(modelYolu, "*Top", VIEW_UST_X, VIEW_UST_Y, 0);
                IView v3 = cizim.CreateDrawViewFromModelView3(modelYolu, "*Right", VIEW_SAG_X, VIEW_SAG_Y, 0);
                IView v4 = cizim.CreateDrawViewFromModelView3(modelYolu, "*Isometric", VIEW_ISO_X, VIEW_ISO_Y, 0);

                if (v1 == null && v2 == null && v3 == null && v4 == null)
                {
                    _uyarilar.Add($"'{modelYolu}' için hiçbir görünüş oluşturulamadı — model açık mı, yol geçerli mi kontrol edin.");
                    _app.CloseDoc(cizimBelge.GetTitle());
                    return null;
                }

                cizimBelge.ViewZoomtofit2();

                string dosyaAdi = System.IO.Path.Combine(cikisKlasoru,
                    (dosyaAdiOnEki ?? "teknik_resim") + ".pdf");
                bool basarili = ((IModelDocExtension)cizimBelge.Extension).SaveAs3(
                    dosyaAdi,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    null, null, ref hata, ref hata);

                _app.CloseDoc(cizimBelge.GetTitle());

                if (!basarili)
                {
                    _uyarilar.Add($"'{modelYolu}' → PDF kaydedilemedi (SaveAs3 hata kodu: {hata}).");
                    return null;
                }
                return dosyaAdi;
            }
            catch (Exception ex)
            {
                _uyarilar.Add($"'{modelYolu}' için teknik resim oluşturulurken hata: {ex.Message}");
                return null;
            }
        }
    }
}
