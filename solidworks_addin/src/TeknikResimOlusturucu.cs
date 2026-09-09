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
    // oluşturur ve HEM .dwg HEM .pdf olarak kaydeder (kullanıcı isteği: ikisi
    // de üretilsin).
    //
    // AÇIKÇA BELİRTİLMESİ GEREKEN SINIRLAR (v1 taslak):
    //  • Görünüş yerleşim koordinatları hâlâ YAKLAŞIK — antetin (başlık
    //    bloğu) gerçek boyutu/konumu kullanıcının .drwdot şablonuna göre
    //    değişir, elimde o şablon yok. İlk denemede görünüşler antete
    //    TAŞIYORDU (kullanıcı geri bildirimi); bunun üzerine her görünüşe
    //    SABİT 1:10 ölçek uygulandı (bkz. OLCEK) VE yerleşim koordinatları
    //    sayfanın sol-üst bölgesine, daha geniş kenar boşluklarıyla
    //    taşındı — antetin sağ-alt köşede olduğu YAYGIN kural varsayılıyor.
    //    Yine de taşarsa OLCEK'i (örn. 1:20) ve VIEW_* sabitlerini kendi
    //    şablonunuza göre ayarlayın.
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
        // A3 yatay (420x297mm) varsayımıyla, antetin YAYGIN OLARAK sağ-alt
        // köşede olduğu varsayılarak görünüşler sayfanın SOL-ÜST bölgesine
        // taşındı.
        private const double VIEW_ON_X = 0.06, VIEW_ON_Y = 0.16;
        private const double VIEW_UST_X = 0.06, VIEW_UST_Y = 0.24;
        private const double VIEW_SAG_X = 0.20, VIEW_SAG_Y = 0.16;
        private const double VIEW_ISO_X = 0.20, VIEW_ISO_Y = 0.24;

        // Görünüşler artık SABİT 1:10 ölçekle küçültülüyor — parçanın
        // gerçek boyutu ne olursa olsun (küçük bir menteşe ya da 2 metrelik
        // dolap yan paneli) kağıda taşma riski en aza inmesi için. Hâlâ
        // taşarsa denominatörü büyütün (örn. {1,20}).
        private static readonly double[] OLCEK = new double[] { 1, 10 };

        public TeknikResimOlusturucu(ISldWorks app) { _app = app; }

        // modelYolu: içe aktarılacak parça/montajın TAM dosya yolu (zaten
        // SolidWorks'te açık olması gerekir — CreateDrawViewFromModelView3
        // açık bir belgeye referans verir).
        // dwgYolu/pdfYolu: OUT — her biri başarıyla üretildiyse tam dosya
        // yolunu, üretilemediyse null taşır (biri başarısız olsa da diğeri
        // ayrıca denenir — bkz. Uyarilar listesi).
        // Dönüş: EN AZ BİR format başarıyla üretildiyse true.
        // GÜVENLİK AĞI: bu sınıftaki NewDocument/CreateDrawViewFromModelView3/
        // SaveAs3 çağrıları canlıda test edildi ama native bir çökme
        // managed try/catch ile YAKALANAMAZ — bu yüzden her riskli çağrıdan
        // önce/sonra Tanilama.Kaydet() ile diske yazılıyor.
        public bool TeknikResimOlustur(string modelYolu, string sablonYolu, string cikisKlasoru,
            string dosyaAdiOnEki, out string dwgYolu, out string pdfYolu)
        {
            dwgYolu = null;
            pdfYolu = null;
            Tanilama.Kaydet($"TeknikResimOlustur basladi: model={modelYolu}, sablon={sablonYolu}");
            IModelDoc2 cizimBelge = null;
            try
            {
                Tanilama.Kaydet("NewDocument cagriliyor");
                cizimBelge = (IModelDoc2)_app.NewDocument(sablonYolu, (int)swDwgPaperSizes_e.swDwgPaperA3size, 0.42, 0.297);
                Tanilama.Kaydet("NewDocument tamamlandi, cizimBelge null mu=" + (cizimBelge == null));
                if (cizimBelge == null)
                {
                    _uyarilar.Add($"'{sablonYolu}' şablonundan çizim oluşturulamadı — yol doğru mu?");
                    return false;
                }

                var cizim = (IDrawingDoc)cizimBelge;

                IView v1 = OlceklenmisGorunumOlustur(cizim, modelYolu, "*Front", VIEW_ON_X, VIEW_ON_Y, "1");
                IView v2 = OlceklenmisGorunumOlustur(cizim, modelYolu, "*Top", VIEW_UST_X, VIEW_UST_Y, "2");
                IView v3 = OlceklenmisGorunumOlustur(cizim, modelYolu, "*Right", VIEW_SAG_X, VIEW_SAG_Y, "3");
                IView v4 = OlceklenmisGorunumOlustur(cizim, modelYolu, "*Isometric", VIEW_ISO_X, VIEW_ISO_Y, "4");

                if (v1 == null && v2 == null && v3 == null && v4 == null)
                {
                    _uyarilar.Add($"'{modelYolu}' için hiçbir görünüş oluşturulamadı — model açık mı, yol geçerli mi kontrol edin.");
                    return false;
                }

                Tanilama.Kaydet("ViewZoomtofit2 cagriliyor");
                cizimBelge.ViewZoomtofit2();
                Tanilama.Kaydet("ViewZoomtofit2 tamamlandi");

                var ext = (IModelDocExtension)cizimBelge.Extension;

                dwgYolu = FarkliKaydet(ext, cikisKlasoru, dosyaAdiOnEki, "dwg", modelYolu);
                pdfYolu = FarkliKaydet(ext, cikisKlasoru, dosyaAdiOnEki, "pdf", modelYolu);

                return dwgYolu != null || pdfYolu != null;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("TeknikResimOlustur HATA (managed exception): " + ex);
                _uyarilar.Add($"'{modelYolu}' için teknik resim oluşturulurken hata: {ex.Message}");
                return dwgYolu != null || pdfYolu != null;
            }
            finally
            {
                if (cizimBelge != null)
                {
                    Tanilama.Kaydet("CloseDoc cagriliyor");
                    _app.CloseDoc(cizimBelge.GetTitle());
                    Tanilama.Kaydet("CloseDoc tamamlandi - TeknikResimOlustur bitti");
                }
            }
        }

        private IView OlceklenmisGorunumOlustur(IDrawingDoc cizim, string modelYolu, string gorunumAdi, double x, double y, string logNo)
        {
            Tanilama.Kaydet($"{logNo}. CreateDrawViewFromModelView3 ({gorunumAdi}) cagriliyor");
            IView v = cizim.CreateDrawViewFromModelView3(modelYolu, gorunumAdi, x, y, 0);
            Tanilama.Kaydet($"{logNo}. tamamlandi, null mu=" + (v == null));
            if (v != null)
            {
                try { v.ScaleDecimal = OLCEK; }
                catch { /* ölçek atanamazsa görünüm varsayılan ölçekte kalır — dışa aktarımı engellemez */ }
            }
            return v;
        }

        // Aynı açık çizimi FARKLI bir uzantıyla kaydeder (SaveAs3, çıktı
        // formatı dosya adının uzantısından otomatik algılanır). Bir format
        // başarısız olursa diğerinin denenmesini ENGELLEMEZ (TeknikResimOlustur
        // içinde ayrı ayrı çağrılıyor).
        private string FarkliKaydet(IModelDocExtension ext, string cikisKlasoru, string dosyaAdiOnEki, string uzanti, string modelYoluLog)
        {
            string dosyaAdi = System.IO.Path.Combine(cikisKlasoru, (dosyaAdiOnEki ?? "teknik_resim") + "." + uzanti);
            int hata = 0, uyari = 0;
            Tanilama.Kaydet($"SaveAs3 ({uzanti}) cagriliyor: " + dosyaAdi);
            bool basarili = ext.SaveAs3(dosyaAdi, (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, null, ref hata, ref uyari);
            Tanilama.Kaydet($"SaveAs3 ({uzanti}) tamamlandi, basarili=" + basarili + ", hata=" + hata);
            if (!basarili)
            {
                _uyarilar.Add($"'{modelYoluLog}' → {uzanti.ToUpperInvariant()} kaydedilemedi (SaveAs3 hata kodu: {hata}).");
                return null;
            }
            return dosyaAdi;
        }
    }
}
