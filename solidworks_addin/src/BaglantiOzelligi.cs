using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using Newtonsoft.Json;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using SolidWorks.Interop.swpublished;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // "UOS BAĞLANTI" AĞAÇ ÖZELLİĞİ — kullanıcı isteği: "bu yaptığımız delik
    // şablonu ile yapılan delikleri tek bir düzenleme sekmesi ile düzeltelim
    // ve bu ... sekmesi soldaki feature managerda olsun, feature managerda bu
    // sekmeyi sildiğimizde tüm operasyonlar ve delikler 3d modeller silinsin
    // (örnek swood connectors)".
    //
    // Bağlantı Şablonları penceresinde "Tümünü Uygula" bir SolidWorks MAKRO
    // ÖZELLİĞİ (InsertMacroFeature3) ekler. Özellik geometri üretmez; tek
    // string parametresinde (JSON) birleşimleri + ayarlarını ve OLUŞTURULAN
    // her şeyi (parça yolu + kesim özelliği adı, yerleştirilen bileşen adı)
    // saklar:
    //   - Özelliği Düzenle → SolidWorks bu sınıfın Edit'ini çağırır → pencere
    //     o birleşimlerle düzenleme modunda açılır; uygulanınca eski ürünler
    //     silinip yenileri açılır, parametre güncellenir.
    //   - Özellik silinince → eklenti montajın DeleteSelectionPreNotify
    //     olayında silinen özelliğin verisini okur, silme bittikten sonra
    //     (DeleteItemNotify + zamanlayıcı) kayıtlı kesimleri ve bileşenleri
    //     siler (bkz. SwAddin.BaglantiSilmeOlaylari).
    //
    // COM KAYDI: SolidWorks makro özelliği ProgId ile örnekler — bu sınıf
    // eklentiyle birlikte RegAsm /codebase ile KAYITLI olmalı (eklentiye bu
    // sınıf eklendikten sonra RegAsm bir kez daha çalıştırılmalı).
    // ════════════════════════════════════════════════════════════════════════
    [ComVisible(true)]
    [Guid("3F9B6E2A-8C41-4D7B-A2E5-6D1C9F0B7E43")]
    [ProgId(BaglantiOzelligi.PROG_ID)]
    public class BaglantiOzelligi : ISwComFeature
    {
        public const string PROG_ID = "UretimOSKesim.BaglantiOzelligi";
        private const string PARAM = "veri";
        public const string OZELLIK_ADI = "UOS Bağlantı";

        public object Edit(object app, object modelDoc, object feature)
        {
            try
            {
                Tanilama.Kaydet("BaglantiOzelligi.Edit");
                UretimOSAddin.Ornek?.BaglantiOzelliginiDuzenle(modelDoc as ModelDoc2, feature as Feature);
            }
            catch (Exception ex) { Tanilama.Kaydet("BaglantiOzelligi.Edit HATA: " + ex); }
            return true;
        }

        // Geometri üretmez — her yeniden oluşturmada başarılı sayılır.
        public object Regenerate(object app, object modelDoc, object feature) => null;

        public object Security(object app, object modelDoc, object feature) => null;

        // ── veri ────────────────────────────────────────────────────────────
        public static Feature Ekle(ModelDoc2 montaj, BaglantiKaydiVerisi veri)
        {
            var fm = montaj.FeatureManager;
            var ozellik = fm.InsertMacroFeature3(OZELLIK_ADI, PROG_ID, null,
                new[] { PARAM }, new[] { (int)swMacroFeatureParamType_e.swMacroFeatureParamTypeString },
                new[] { JsonConvert.SerializeObject(veri) },
                null, null, null, null, (int)swMacroFeatureOptions_e.swMacroFeatureByDefault);
            Tanilama.Kaydet($"BaglantiOzelligi.Ekle: {(ozellik == null ? "BAŞARISIZ (null)" : ozellik.Name)} — {veri.Kesimler.Count} kesim, {veri.Bilesenler.Count} bileşen");
            return ozellik;
        }

        // Özellik bizim makro özelliğimizse verisini döndürür, değilse null.
        public static BaglantiKaydiVerisi Oku(Feature ozellik)
        {
            try
            {
                if (ozellik == null || ozellik.GetTypeName2() != "MacroFeature") return null;
                var tanim = ozellik.GetDefinition() as MacroFeatureData;
                if (tanim == null || tanim.GetProgId() != PROG_ID) return null;
                tanim.GetStringByName(PARAM, out string json);
                return string.IsNullOrEmpty(json) ? null : JsonConvert.DeserializeObject<BaglantiKaydiVerisi>(json);
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiOzelligi.Oku HATA: " + ex.Message);
                return null;
            }
        }

        public static bool Guncelle(ModelDoc2 montaj, Feature ozellik, BaglantiKaydiVerisi veri)
        {
            try
            {
                var tanim = ozellik.GetDefinition() as MacroFeatureData;
                if (tanim == null) return false;
                tanim.AccessSelections(montaj, null);
                tanim.SetStringByName(PARAM, JsonConvert.SerializeObject(veri));
                bool tamam = ozellik.ModifyDefinition(tanim, montaj, null);
                Tanilama.Kaydet($"BaglantiOzelligi.Guncelle: {ozellik.Name} sonuc={tamam}");
                return tamam;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiOzelligi.Guncelle HATA: " + ex);
                return false;
            }
        }

        // Kayıtlı kesimleri (parçalarda) ve bileşenleri (montajda) siler.
        public static void UrunleriSil(ISldWorks app, ModelDoc2 montaj, BaglantiKaydiVerisi veri, List<string> uyarilar)
        {
            int silinenKesim = 0, silinenBilesen = 0;
            foreach (var grup in veri.Kesimler.GroupBy(k => k.ParcaYolu, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    var belge = app.GetOpenDocumentByName(grup.Key) as ModelDoc2;
                    if (belge == null) { uyarilar.Add("Parça açık değil, kesimleri silinemedi: " + grup.Key); continue; }
                    bool zatenGorunur = belge.Visible;
                    int h = 0, w = 0;
                    if (!zatenGorunur)
                        app.OpenDoc6(grup.Key, (int)swDocumentTypes_e.swDocPART, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref h, ref w);
                    app.ActivateDoc3(belge.GetTitle(), false, (int)swRebuildOnActivation_e.swDontRebuildActiveDoc, ref h);
                    foreach (var k in grup)
                    {
                        belge.ClearSelection2(true);
                        // Absorbed: kesimle birlikte onun sketch'i de silinir.
                        if (belge.Extension.SelectByID2(k.OzellikAdi, "BODYFEATURE", 0, 0, 0, false, 0, null, 0) &&
                            belge.Extension.DeleteSelection2((int)swDeleteSelectionOptions_e.swDelete_Absorbed))
                            silinenKesim++;
                        else uyarilar.Add($"Kesim bulunamadı/silinemedi: {k.OzellikAdi} ({System.IO.Path.GetFileName(grup.Key)})");
                    }
                    try { belge.EditRebuild3(); } catch { }
                    if (!zatenGorunur) app.CloseDoc(belge.GetTitle());
                }
                catch (Exception ex) { uyarilar.Add("Kesim silme hatası: " + ex.Message); }
            }
            int e = 0;
            app.ActivateDoc3(montaj.GetTitle(), false, (int)swRebuildOnActivation_e.swDontRebuildActiveDoc, ref e);
            var asm = montaj as AssemblyDoc;
            foreach (var ad in veri.Bilesenler)
            {
                try
                {
                    var bilesen = asm?.GetComponentByName(ad);
                    montaj.ClearSelection2(true);
                    if (bilesen != null && bilesen.Select4(false, null, false) &&
                        montaj.Extension.DeleteSelection2((int)swDeleteSelectionOptions_e.swDelete_Absorbed))
                        silinenBilesen++;
                    else uyarilar.Add("Bileşen bulunamadı/silinemedi: " + ad);
                }
                catch (Exception ex) { uyarilar.Add("Bileşen silme hatası: " + ex.Message); }
            }
            try { montaj.EditRebuild3(); } catch { }
            Tanilama.Kaydet($"BaglantiOzelligi.UrunleriSil: {silinenKesim}/{veri.Kesimler.Count} kesim, {silinenBilesen}/{veri.Bilesenler.Count} bileşen silindi");
        }
    }

    // Ağaç özelliğinde saklanan veri (JSON).
    public class BaglantiKaydiVerisi
    {
        public List<KayitliBirlesim> Birlesimler = new List<KayitliBirlesim>();
        public List<KayitliKesim> Kesimler = new List<KayitliKesim>();
        public List<string> Bilesenler = new List<string>();
    }

    public class KayitliBirlesim
    {
        public string A, B;       // bileşen adları (Component2.Name2)
        public double[] N, P;     // seçilen temas düzlemi (montaj)
        public string SablonAdi;
        public BaglantiSablonu Sablon;
        public BaglantiUygulamaSecenekleri Sec;
    }

    public class KayitliKesim
    {
        public string ParcaYolu, OzellikAdi;
    }
}
