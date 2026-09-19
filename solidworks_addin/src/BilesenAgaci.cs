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

        // "uretimosa aktarılacak kalemleri bir kutucukla seçeyim, sadece
        // onlar aktarılsın" — işareti kaldırılan düğüm (ve tüm alt dalı)
        // BilesenAgaciniReceteOlarakAktar tarafından tamamen yok sayılır.
        public bool AktarimaDahil = true;

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
            _tanisiYazilanlar.Clear();

            if (kokBelge.GetType() == (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                // GERÇEK TANI KANITI (log): montaj içindeki TÜM bileşenlerde
                // GetEquationMgr().GetCount() = 0 çıkıyordu — Equations
                // klasöründe gözle Length/Width dolu görünen parçalarda BİLE.
                // Sebep: montaj bileşenleri varsayılan "hafif" (lightweight)
                // yüklenir; bu modda özel alanlar (OLE başlığından ayrı
                // okunduğu için) çalışır ama feature/equation verisi diskten
                // henüz tam okunmaz. Component2.ForceResolve DENENDİ, bu
                // interop sürümünde YOK (CS1061) — bunun yerine TÜM montajı
                // tek seferde çözümleyen belgelenmiş IAssemblyDoc API'si
                // kullanılıyor.
                var asmDoc = (AssemblyDoc)kokBelge;
                int cozumSonucu = asmDoc.ResolveAllLightWeightComponents(false);
                // TANI: "[Viewing]" (view-only) modda feature/denklem verisi yüklenmez.
                Tanilama.Kaydet("BilesenAgaci Cikar: ResolveAllLightWeightComponents sonucu=" + cozumSonucu
                    + " IsOpenedViewOnly=" + kokBelge.IsOpenedViewOnly()
                    + " IsOpenedReadOnly=" + kokBelge.IsOpenedReadOnly());

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
                    //
                    // NOT: montaj bileşenlerinin lightweight sorunu artık
                    // Cikar()'ın başında TÜM montaj için tek seferde
                    // ResolveAllLightWeightComponents ile çözülüyor (bkz.
                    // yukarıdaki NOT) — burada tekrar bir şey yapmaya gerek yok.
                    var denklemOlcusu = EquationsOlcuOku(modelDoc, dugum.GosterimAdi);
                    if (denklemOlcusu.HasValue)
                    {
                        dugum.OlcuVar = true;
                        dugum.OlcuKaynagi = "equations";
                        dugum.BoyMm = denklemOlcusu.Value.boy; dugum.EnMm = denklemOlcusu.Value.en; dugum.KalinlikMm = denklemOlcusu.Value.kalinlik;
                        dugum.TaslakBoyMm = denklemOlcusu.Value.boy; dugum.TaslakEnMm = denklemOlcusu.Value.en; dugum.TaslakKalinlikMm = denklemOlcusu.Value.kalinlik;
                    }
                    else
                    {
                        // Kullanıcı isteği: "swood'dan alma, solidworks kendi
                        // ölçülerini al" — Equations da boşsa parçanın SolidWorks
                        // sınır kutusu (IPartDoc.GetPartBox) kullanılır: en büyük
                        // boyut = boy, ortanca = en, en küçük = kalınlık. Bu bir
                        // KURALDIR (levha parçalarda doğru); sonuç panelde " bb"
                        // etiketiyle gösterilir ve Taslak* alanlarından düzeltilebilir.
                        OlcuKaynagiTanisiYaz(modelDoc, bilesen, dugum.GosterimAdi);
                        var kutu = SinirKutusuOlcusu(modelDoc, dugum.GosterimAdi);
                        if (kutu.HasValue)
                        {
                            dugum.OlcuVar = true;
                            dugum.OlcuKaynagi = "bbox";
                            dugum.BoyMm = kutu.Value.boy; dugum.EnMm = kutu.Value.en; dugum.KalinlikMm = kutu.Value.kalinlik;
                            dugum.TaslakBoyMm = kutu.Value.boy; dugum.TaslakEnMm = kutu.Value.en; dugum.TaslakKalinlikMm = kutu.Value.kalinlik;
                        }
                    }
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
        private static (double boy, double en, double kalinlik)? SinirKutusuOlcusu(ModelDoc2 modelDoc, string parcaAdi)
        {
            try
            {
                var parca = modelDoc as PartDoc;
                if (parca == null) return null;
                double[] kutu = parca.GetPartBox(true) as double[]; // metre: xmin,ymin,zmin,xmax,ymax,zmax
                if (kutu == null || kutu.Length < 6) return null;
                var olcu = new[] { System.Math.Abs(kutu[3] - kutu[0]), System.Math.Abs(kutu[4] - kutu[1]), System.Math.Abs(kutu[5] - kutu[2]) }
                    .Select(m => System.Math.Round(m * 1000.0, 1)).OrderByDescending(x => x).ToArray();
                if (olcu[0] <= 0) return null;
                Tanilama.Kaydet("BilesenAgaci SinirKutusuOlcusu '" + parcaAdi + "': " + olcu[0] + "x" + olcu[1] + "x" + olcu[2]);
                return (olcu[0], olcu[1], olcu[2]);
            }
            catch (System.Exception ex)
            {
                Tanilama.Kaydet("BilesenAgaci SinirKutusuOlcusu '" + parcaAdi + "' HATA: " + ex);
                return null;
            }
        }

        private static (double boy, double en, double kalinlik)? EquationsOlcuOku(ModelDoc2 modelDoc, string parcaAdi)
        {
            try
            {
                IEquationMgr eqMgr = modelDoc.GetEquationMgr();
                if (eqMgr == null)
                {
                    Tanilama.Kaydet("BilesenAgaci EquationsOlcuOku '" + parcaAdi + "': GetEquationMgr() null döndü.");
                    return null;
                }
                int adet = eqMgr.GetCount();
                if (adet <= 0)
                {
                    // TANI: bu parçada HİÇ denklem/global değişken yok — Equations
                    // klasörü boş demektir, "eşleşmedi" ile KARIŞTIRILMASIN diye
                    // ayrı bir mesajla loglanır (bkz. kullanıcı raporu: hiç log
                    // satırı çıkmıyor, bu durumun ta kendisi olabilir).
                    Tanilama.Kaydet("BilesenAgaci EquationsOlcuOku '" + parcaAdi + "': hiç denklem/global değişken yok (GetCount()=0).");
                    return null;
                }

                double? boy = null, en = null, kalinlik = null;
                var hamDenklemler = new List<string>(); // yalnızca TANI amaçlı — eşleşme başarısızsa günlüğe yazılır.
                for (int i = 0; i < adet; i++)
                {
                    string denklem = eqMgr.Equation[i];
                    hamDenklemler.Add(denklem);
                    var (ad, degerMm) = DenklemAyristir(denklem);
                    if (ad == null || degerMm == null) continue;
                    string adKucuk = ad.Trim().ToLowerInvariant();
                    if (boy == null && (adKucuk == "length" || adKucuk == "boy")) boy = degerMm;
                    else if (en == null && (adKucuk == "width" || adKucuk == "en")) en = degerMm;
                    else if (kalinlik == null && (adKucuk == "thickness" || adKucuk == "kalinlik" || adKucuk == "kalınlık")) kalinlik = degerMm;
                }
                // Boy/En'in İKİSİ de yoksa "kısmen doldu" gibi görünüp yanlış
                // bir ölçü izlenimi VERMEMEK için hiç döndürülmez — TAHMİN YOK.
                if (boy.HasValue && en.HasValue)
                {
                    Tanilama.Kaydet("BilesenAgaci EquationsOlcuOku '" + parcaAdi + "': BAŞARILI boy=" + boy + " en=" + en + " kalinlik=" + kalinlik);
                    return (boy.Value, en.Value, kalinlik ?? 0);
                }

                // TANI: eşleşme başarısız oldu — GERÇEK denklem string'lerini
                // günlüğe yaz (Desktop\uretimos_addin_log.txt) ki format
                // TAHMİN edilmeden, gerçek veriye göre düzeltilebilsin.
                Tanilama.Kaydet("BilesenAgaci EquationsOlcuOku '" + parcaAdi + "' eşleşmedi (" + adet + " denklem): " + string.Join(" | ", hamDenklemler));
                return null;
            }
            catch (System.Exception ex)
            {
                Tanilama.Kaydet("BilesenAgaci EquationsOlcuOku '" + parcaAdi + "' HATA: " + ex);
                return null;
            }
        }

        // TANI: Equations'ta Length/Width bulunamayan parçanın ölçüsünün
        // NEREDE tutulduğunu bulmak için özel alanları (dosya + aktif
        // konfigürasyon), sanal bileşen bilgisini ve ilk feature adlarını
        // günlüğe yazar. Aynı belge yolu tek Cikar() çağrısında bir kez loglanır.
        // Davranışı DEĞİŞTİRMEZ — yalnızca Tanilama.Kaydet çağırır.
        private static readonly HashSet<string> _tanisiYazilanlar = new HashSet<string>();

        private static void OlcuKaynagiTanisiYaz(ModelDoc2 modelDoc, Component2 bilesen, string parcaAdi)
        {
            try
            {
                string yol = modelDoc.GetPathName();
                string anahtar = string.IsNullOrEmpty(yol) ? parcaAdi : yol;
                if (!_tanisiYazilanlar.Add(anahtar)) return;

                var sb = new System.Text.StringBuilder();
                sb.Append("BilesenAgaci OlcuTanisi '").Append(parcaAdi).Append("': yol=").Append(string.IsNullOrEmpty(yol) ? "(yok/sanal)" : yol);
                if (bilesen != null)
                    sb.Append(" | IsVirtual=").Append(bilesen.IsVirtual).Append(" | Konf=").Append(bilesen.ReferencedConfiguration);

                string aktifKonf = null;
                try { aktifKonf = modelDoc.ConfigurationManager.ActiveConfiguration.Name; } catch { }
                foreach (string konf in new[] { "", aktifKonf })
                {
                    if (konf == null) continue;
                    var cpm = modelDoc.Extension.CustomPropertyManager[konf];
                    string[] adlar = cpm.GetNames() as string[];
                    sb.Append(" | OZEL[").Append(konf == "" ? "dosya" : konf).Append("]=");
                    if (adlar == null || adlar.Length == 0) { sb.Append("(yok)"); continue; }
                    var parcalar = new List<string>();
                    foreach (string ad in adlar)
                    {
                        cpm.Get5(ad, false, out string deger, out string cozulmus, out _);
                        parcalar.Add(ad + "=" + (string.IsNullOrWhiteSpace(cozulmus) ? deger : cozulmus));
                    }
                    sb.Append(string.Join("; ", parcalar));
                }

                var feature = new List<string>();
                var f = (Feature)modelDoc.FirstFeature();
                while (f != null && feature.Count < 25)
                {
                    feature.Add(f.Name + ":" + f.GetTypeName2());
                    f = (Feature)f.GetNextFeature();
                }
                sb.Append(" | FEATURE=").Append(string.Join(", ", feature));

                Tanilama.Kaydet(sb.ToString());
            }
            catch (System.Exception ex)
            {
                Tanilama.Kaydet("BilesenAgaci OlcuTanisi '" + parcaAdi + "' HATA: " + ex.Message);
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
