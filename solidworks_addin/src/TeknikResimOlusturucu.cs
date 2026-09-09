using System;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // TEKNİK RESİM OLUŞTURUCU — İKİ ADIMLI akış (kullanıcı isteği: "önce
    // solidde yapsın ben düzenleyeyim, sonra onayla dwg ve pdf alsın"):
    //   1) TeknikResimAcVeDuzenlemeyeBirak: çizimi oluşturur, 4 görünüş
    //      ekler, SolidWorks'te AÇIK bırakır — kaydetmez, kapatmaz.
    //      Kullanıcı görünüşleri/yerleşimi/ölçeği elle düzeltir (antete
    //      otomatik taşma sorunu tam çözülemediği için bu ADIM BİLİNÇLİ
    //      olarak insana bırakıldı).
    //   2) AcikCizimiKaydet: kullanıcı düzenlemeyi bitirip "Onayla"ya
    //      bastığında, O AN AÇIK olan çizimi hem .dwg hem .pdf olarak
    //      kaydeder — çizim İÇERİĞİNE dokunmaz, sadece dışa aktarır.
    // ════════════════════════════════════════════════════════════════════════
    public class TeknikResimOlusturucu
    {
        private readonly ISldWorks _app;
        private readonly List<string> _uyarilar = new List<string>();
        public IReadOnlyList<string> Uyarilar => _uyarilar;

        // İlk yerleşim/ölçek — sadece BAŞLANGIÇ noktası, kullanıcı elle
        // düzeltecek (bkz. sınıf açıklaması).
        private const double VIEW_ON_X = 0.06, VIEW_ON_Y = 0.16;
        private const double VIEW_UST_X = 0.06, VIEW_UST_Y = 0.24;
        private const double VIEW_SAG_X = 0.20, VIEW_SAG_Y = 0.16;
        private const double VIEW_ISO_X = 0.20, VIEW_ISO_Y = 0.24;
        private static readonly double[] OLCEK = new double[] { 1, 10 };

        public TeknikResimOlusturucu(ISldWorks app) { _app = app; }

        // ADIM 1 — çizimi oluşturur, AÇIK BIRAKIR (save/close YOK).
        public bool TeknikResimAcVeDuzenlemeyeBirak(string modelYolu, string sablonYolu)
        {
            Tanilama.Kaydet($"TeknikResimAcVeDuzenlemeyeBirak basladi: model={modelYolu}, sablon={sablonYolu}");
            try
            {
                Tanilama.Kaydet("NewDocument cagriliyor");
                var cizimBelge = (IModelDoc2)_app.NewDocument(sablonYolu, (int)swDwgPaperSizes_e.swDwgPaperA3size, 0.42, 0.297);
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
                Tanilama.Kaydet("ViewZoomtofit2 tamamlandi - cizim ACIK birakildi (kapatilmadi/kaydedilmedi)");
                return true;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("TeknikResimAcVeDuzenlemeyeBirak HATA (managed exception): " + ex);
                _uyarilar.Add($"'{modelYolu}' için teknik resim oluşturulurken hata: {ex.Message}");
                return false;
            }
        }

        // ADIM 2 — ŞU AN AÇIK olan (kullanıcının elle düzenlediği) çizim
        // belgesini hem .dwg hem .pdf olarak kaydeder. dwgYolu'nun klasörü
        // ve dosya adı (uzantısız) esas alınır, .pdf AYNI ada farklı
        // uzantıyla aynı klasöre yazılır. Çizim KAPATILMAZ.
        public bool AcikCizimiKaydet(IModelDoc2 cizimBelge, string dwgYolu, out string kaydedilenDwg, out string kaydedilenPdf)
        {
            kaydedilenDwg = null;
            kaydedilenPdf = null;
            Tanilama.Kaydet("AcikCizimiKaydet basladi: " + dwgYolu);
            try
            {
                var ext = (IModelDocExtension)cizimBelge.Extension;
                string klasor = System.IO.Path.GetDirectoryName(dwgYolu);
                string adOnEki = System.IO.Path.GetFileNameWithoutExtension(dwgYolu);
                string baslikLog = cizimBelge.GetPathName();

                kaydedilenDwg = FarkliKaydet(ext, klasor, adOnEki, "dwg", baslikLog);
                kaydedilenPdf = FarkliKaydet(ext, klasor, adOnEki, "pdf", baslikLog);

                return kaydedilenDwg != null || kaydedilenPdf != null;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("AcikCizimiKaydet HATA (managed exception): " + ex);
                _uyarilar.Add("Çizim kaydedilirken hata: " + ex.Message);
                return kaydedilenDwg != null || kaydedilenPdf != null;
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
                catch { /* ölçek atanamazsa görünüm varsayılan ölçekte kalır — kullanıcı zaten elle düzeltecek */ }
            }
            return v;
        }

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
