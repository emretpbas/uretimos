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
        // gelmeli" — önce KesimListesiCikarici.OlcuHesapla (BOY_MM/EN_MM/
        // KALINLIK_MM özel alanları ELLE girilmişse), yoksa SolidWorks
        // Equations'taki (Length/Width/Thickness küresel değişkenleri —
        // bkz. EquationsOlcuOku) ölçüden denenir; yalnızca PARÇA belgeleri
        // için (montaj/alt montaj düğümlerinde bu alanlar anlamsızdır).
        // NOT: delik/form sayısı BİLEREK burada YOK — kullanıcı isteği:
        // "delik özelliğini şimdilik yazmayalım, onu CNC yerleşiminde
        // yapacağız" (bkz. CncYerlesimPaneli.cs, DelikFormCikarici zaten
        // orada kullanılıyor — burada TEKRAR ETMEYE gerek yok).
        public bool OlcuVar;
        public string OlcuKaynagi; // "elle" | "equations" — kullanıcıya hangi kaynaktan geldiğini göstermek için
        public double BoyMm, EnMm, KalinlikMm;

        // Kullanıcı isteği: "her kalemin sınıfını belirleyelim (hırdavat, paket,
        // hammadde, panel, kenar bandı, yarımamül vb.)" — panelde bu oturum
        // boyunca elle atanır (null = henüz sınıflandırılmamış). Gerçek sistem
        // tipleriyle AYNI değerler kullanılır: "hirdavat" | "plaka" (= "Panel")
        // | "kenar_bandi" | "yarimamul" | "altmontaj" | "paket" | "urun".
        public string Sinif;

        // "yarımamül seçince parçanın en boy yüksekliği gelsin" — OlcuVar
        // doluysa BURADAN ön-doldurulur (BilesenAgaci.DugumOlustur'da), ama
        // panelde kullanıcı tarafından ELLE değiştirilebilir taslak alanlar
        // (gerçek özel alanları — BoyMm/EnMm/KalinlikMm — HİÇ değiştirmez).
        public double TaslakBoyMm, TaslakEnMm, TaslakKalinlikMm;

        // "panel'e (plaka) kenar bandını 4 kenardan hangisine hangi tip
        // eklediğimizi de çıkartalım" — Sinif == "plaka" iken kullanılır;
        // her biri bir kenar_bandi hammadde kartının id'sidir (boş = yok).
        public string KenarOnId, KenarArkaId, KenarSolId, KenarSagId;

        // "+ Ek Kalem" ile elle eklenen, gerçek bir SolidWorks bileşenine
        // karşılık GELMEYEN sentetik alt kalem — Bilesen/Model burada hep null,
        // MevcutKod doğrudan seçilen mevcut karta sabitlenir (değiştirilemez).
        public bool ElleEklendi;

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

            // Ölçü — yalnızca PARÇA (.sldprt) belgeleri için; montaj/alt montaj
            // düğümlerinde BOY_MM/EN_MM gibi alanlar hiç set edilmez.
            if (modelDoc.GetType() == (int)swDocumentTypes_e.swDocPART)
            {
                var (boy, en, kalinlik, kaynak) = KesimListesiCikarici.OlcuHesapla(modelDoc);
                if (kaynak == "elle")
                {
                    dugum.OlcuVar = true;
                    dugum.OlcuKaynagi = "elle";
                    dugum.BoyMm = boy; dugum.EnMm = en; dugum.KalinlikMm = kalinlik;
                    dugum.TaslakBoyMm = boy; dugum.TaslakEnMm = en; dugum.TaslakKalinlikMm = kalinlik;
                }
                else
                {
                    // Kullanıcı isteği: "equations yazanlar yarımamül ve panel
                    // bunların ölçüleri direkt gelebilir" — BOY_MM/EN_MM özel
                    // alanları BOŞSA, SolidWorks'ün kendi "Equations" (Global
                    // Variables) listesindeki Length/Width/Thickness (ya da
                    // Boy/En/Kalınlık) adlı değişkenlerden dene.
                    var denklemOlcusu = EquationsOlcuOku(modelDoc);
                    if (denklemOlcusu.HasValue)
                    {
                        dugum.OlcuVar = true;
                        dugum.OlcuKaynagi = "equations";
                        dugum.BoyMm = denklemOlcusu.Value.boy; dugum.EnMm = denklemOlcusu.Value.en; dugum.KalinlikMm = denklemOlcusu.Value.kalinlik;
                        dugum.TaslakBoyMm = denklemOlcusu.Value.boy; dugum.TaslakEnMm = denklemOlcusu.Value.en; dugum.TaslakKalinlikMm = denklemOlcusu.Value.kalinlik;
                    }
                    // NOT: Equations'ta da yoksa BİLEREK boş bırakılır — bir
                    // parçanın sınır kutusundan (bounding box) "hangi eksen
                    // kalınlık" TAHMİN ETMEK, bu projenin kendi ilkesiyle
                    // (OlcuHesapla'daki AYNI gerekçe: "yanlış varsaymaktan
                    // boş bırakmak/elle girdirmek daha ucuzdur") ÇELİŞİR —
                    // kullanıcı panelde elle girer (Taslak* alanları zaten
                    // düzenlenebilir).
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

        // Kullanıcı isteği: "equations yazanlar yarımamül ve panel bunların
        // ölçüleri direkt gelebilir" — ekran görüntüsünde gösterilen SolidWorks
        // "Equations" (Global Variables) klasöründeki "Length"=425mm,
        // "Width"=130mm, "Thickness"=18mm gibi KÜRESEL DEĞİŞKENLERİ okur
        // (SWOOD ve benzeri mobilya CAD eklentilerinin yaygın kullandığı
        // adlandırma — Türkçe "Boy"/"En"/"Kalınlık" de kabul edilir).
        // GERÇEK SolidWorks API'si: IModelDoc2.GetEquationMgr() →
        // IEquationMgr.GetCount()/Equation[i] (her biri "\"Ad\" = \"değer\""
        // biçiminde bir string döner). Bu, bu makinede HENÜZ CANLI test
        // edilmedi — derleme/çalışma zamanı hatası çıkarsa (ör. üye adı farklı
        // sürümde değişmişse) TAHMİN EDİLMEDEN gerçek hataya göre düzeltilecek.
        private static (double boy, double en, double kalinlik)? EquationsOlcuOku(ModelDoc2 modelDoc)
        {
            try
            {
                IEquationMgr eqMgr = modelDoc.GetEquationMgr();
                if (eqMgr == null) return null;
                int adet = eqMgr.GetCount();
                if (adet <= 0) return null;

                double? boy = null, en = null, kalinlik = null;
                for (int i = 0; i < adet; i++)
                {
                    string denklem = eqMgr.Equation[i];
                    var (ad, degerMm) = DenklemAyristir(denklem);
                    if (ad == null || degerMm == null) continue;
                    string adKucuk = ad.Trim().ToLowerInvariant();
                    if (boy == null && (adKucuk == "length" || adKucuk == "boy")) boy = degerMm;
                    else if (en == null && (adKucuk == "width" || adKucuk == "en")) en = degerMm;
                    else if (kalinlik == null && (adKucuk == "thickness" || adKucuk == "kalinlik" || adKucuk == "kalınlık")) kalinlik = degerMm;
                }
                // Boy/En'in İKİSİ de yoksa "kısmen doldu" gibi görünüp yanlış
                // bir ölçü izlenimi VERMEMEK için hiç döndürülmez — TAHMİN YOK.
                if (boy.HasValue && en.HasValue) return (boy.Value, en.Value, kalinlik ?? 0);
                return null;
            }
            catch (System.Exception ex)
            {
                Tanilama.Kaydet("BilesenAgaci EquationsOlcuOku HATA: " + ex);
                return null;
            }
        }

        // "\"Length\" = \"425mm\"" (ya da birimsiz "\"Length\" = \"425\"",
        // SolidWorks'ün doküman birimini kullanır — burada mm varsayılır)
        // biçimindeki bir denklem satırından (ad, mm cinsinden değer) çıkarır.
        // Beklenmedik biçim/birim TAHMİN EDİLMEZ, (ad, null) döner.
        private static (string ad, double? degerMm) DenklemAyristir(string denklem)
        {
            if (string.IsNullOrWhiteSpace(denklem)) return (null, null);
            int esitIndex = denklem.IndexOf('=');
            if (esitIndex < 0) return (null, null);
            string sol = denklem.Substring(0, esitIndex).Trim().Trim('"');
            string sag = denklem.Substring(esitIndex + 1).Trim().Trim('"').Trim();

            var eslesme = System.Text.RegularExpressions.Regex.Match(
                sag, @"^(-?[\d.,]+)\s*(mm|cm|m)?$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (!eslesme.Success) return (sol, null);
            if (!double.TryParse(eslesme.Groups[1].Value.Replace(",", "."),
                System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double sayi))
                return (sol, null);

            string birim = eslesme.Groups[2].Success ? eslesme.Groups[2].Value.ToLowerInvariant() : "mm";
            double mmDeger = birim == "cm" ? sayi * 10 : birim == "m" ? sayi * 1000 : sayi;
            return (sol, mmDeger);
        }
    }
}
