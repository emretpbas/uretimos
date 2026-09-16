using System.Collections.Generic;
using System.IO;
using System.Linq;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // Kullanıcı isteği: "reçete ağacı sekmesine ilk bastığımda solidworkste
    // olan ve tüm componets, part ve assamblyler sıralansın" — ReceteAgaciPaneli
    // artık tek bir ÖNCEDEN SEÇİLMİŞ bileşen yerine, aktif belgedeki (parça
    // veya montaj) TÜM bileşen ağacını doğrudan panel açılışında listeler.
    //
    // KesimListesiCikarici.GezRecursive ile AYNI gezinme deseni (Component2.
    // GetChildren + IsSuppressed) kullanılır — ama BURADA amaç kesim listesi
    // üretmek değil, kullanıcının HER bileşeni görüp ÜretimOS kartıyla
    // eşleştirebilmesi olduğu için URETIMOS_TIP'e göre FİLTRELEME/uyarı YOK;
    // etiketlenmemiş/eşleşmemiş bileşenler de aynen listelenir.
    // ════════════════════════════════════════════════════════════════════════
    public class BilesenDugumu
    {
        // null ise bu düğüm belgenin KENDİSİDİR (montaj değil, tek parça belgesi).
        public Component2 Bilesen;
        public ModelDoc2 Model;
        public string GosterimAdi;
        // OzelAlanlar.KOD (URETIMOS_KOD) — KesimListesiCikarici/CncYerlesimPaneli/
        // AltiYuzKutuOlusturucu ile AYNI özel alan: bu bileşenin ÜretimOS
        // tarafındaki karşılığının 'kod' alanı. Boş olabilir (henüz eşleştirilmemiş).
        public string MevcutKod;
        public bool BelgeYuklenemedi;

        // Kullanıcı isteği: "bu listeye parçanın ebatı en boy yükseklikte
        // gelmeli ve üzerinde olan delik ve formlarda buraya işlensin" —
        // KesimListesiCikarici.OlcuHesapla/DelikFormCikarici.Cikar ile AYNI
        // okuma (BOY_MM/EN_MM/KALINLIK_MM özel alanları + geometri taraması),
        // yalnızca PARÇA belgeleri için denenir (montaj/alt montaj düğümlerinde
        // bu alanlar anlamsızdır, DugumOlustur'da hiç doldurulmaz).
        public bool OlcuVar;
        public double BoyMm, EnMm, KalinlikMm;
        public int DelikSayisi, FormSayisi;

        public readonly List<BilesenDugumu> Cocuklar = new List<BilesenDugumu>();
    }

    public static class BilesenAgaci
    {
        // kokBelge PARÇA ise: tek düğümlü liste (belgenin kendisi).
        // kokBelge MONTAJ ise: en üst seviye bileşenlerden başlayarak TÜM
        // (baskılanmamış) alt ağacı çıkarır.
        public static List<BilesenDugumu> Cikar(ModelDoc2 kokBelge)
        {
            var sonuc = new List<BilesenDugumu>();
            if (kokBelge == null) return sonuc;

            if (kokBelge.GetType() == (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                var asmDoc = (AssemblyDoc)kokBelge;
                object[] enUstBilesenler = (object[])asmDoc.GetComponents(true /* TopLevelOnly */);
                if (enUstBilesenler != null)
                {
                    foreach (Component2 bilesen in enUstBilesenler.Cast<Component2>())
                    {
                        if (bilesen.IsSuppressed()) continue;
                        sonuc.Add(DugumOlustur(bilesen, null));
                    }
                }
            }
            else
            {
                // Tek parça belge — kendisini TEK düğüm olarak temsil eder,
                // ağacın 'kökü' bileşen değil doğrudan belgenin kendisidir.
                sonuc.Add(DugumOlustur(null, kokBelge));
            }
            return sonuc;
        }

        private static BilesenDugumu DugumOlustur(Component2 bilesen, ModelDoc2 dogrudanModel)
        {
            var dugum = new BilesenDugumu { Bilesen = bilesen };
            ModelDoc2 modelDoc = dogrudanModel ?? (ModelDoc2)bilesen?.GetModelDoc2();
            dugum.Model = modelDoc;
            if (modelDoc == null)
            {
                dugum.BelgeYuklenemedi = true;
                dugum.GosterimAdi = (bilesen?.Name2 ?? "?") + " (belge yüklenemedi — baskılanmış/eksik referans olabilir)";
                return dugum;
            }

            dugum.MevcutKod = KesimListesiCikarici.OzelAlanOku(modelDoc, OzelAlanlar.KOD);
            string ad = KesimListesiCikarici.OzelAlanOku(modelDoc, OzelAlanlar.AD);
            dugum.GosterimAdi = !string.IsNullOrWhiteSpace(ad) ? ad : Path.GetFileNameWithoutExtension(modelDoc.GetPathName());

            // Ölçü + delik/form — yalnızca PARÇA (.sldprt) belgeleri için;
            // montaj/alt montaj düğümlerinde BOY_MM/EN_MM gibi alanlar hiç
            // set edilmez, geometri taraması da anlamsız/gereksiz olurdu.
            if (modelDoc.GetType() == (int)swDocumentTypes_e.swDocPART)
            {
                var (boy, en, kalinlik, kaynak) = KesimListesiCikarici.OlcuHesapla(modelDoc);
                if (kaynak == "elle")
                {
                    dugum.OlcuVar = true;
                    dugum.BoyMm = boy;
                    dugum.EnMm = en;
                    dugum.KalinlikMm = kalinlik;
                }
                try
                {
                    var (delikler, formlar) = DelikFormCikarici.Cikar(modelDoc, kalinlik);
                    dugum.DelikSayisi = delikler.Count;
                    dugum.FormSayisi = formlar.Count;
                }
                catch (System.Exception ex)
                {
                    Tanilama.Kaydet("BilesenAgaci delik/form çıkarma HATA (" + dugum.GosterimAdi + "): " + ex);
                }
            }

            if (bilesen != null)
            {
                object[] cocuklar = (object[])bilesen.GetChildren();
                if (cocuklar != null)
                {
                    foreach (Component2 cocukBilesen in cocuklar.Cast<Component2>())
                    {
                        if (cocukBilesen.IsSuppressed()) continue;
                        dugum.Cocuklar.Add(DugumOlustur(cocukBilesen, null));
                    }
                }
            }
            return dugum;
        }
    }
}
