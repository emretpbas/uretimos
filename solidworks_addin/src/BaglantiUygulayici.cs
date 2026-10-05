using System;
using System.Collections.Generic;
using System.Linq;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // BAĞLANTI UYGULAYICI — montajda seçili İKİ panel bileşeni arasındaki alın
    // birleşimini bulur ve bir BaglantiSablonu'nun deliklerini her iki
    // parçada gerçek CutExtrude olarak açar (kullanıcı seçimi: "iki panel
    // seç, birleşimi otomatik bul"). Nesting (DelikFormCikarici) ve CAM aynı
    // geometriyi okur.
    //
    // İKİ AŞAMA: Hesapla() hiçbir geometriye dokunmaz, yalnızca planı çıkarır
    // (panel içinde önizleme/onay için); Uygula() planı keser.
    //
    // BİRLEŞİM BULMA: iki panelin düz yüzleri montaj koordinatına taşınır;
    // normalleri zıt, aynı düzlemde ve izdüşümleri örtüşen yüz çifti TEMAS
    // yüzüdür. Temas yüzü KÜÇÜK olan panel gövdedir (alnı dayanır), büyük
    // olan karşı paneldir. Benzer büyüklükteyse panel yüz yüze bindirilmiştir
    // — alın birleşimi değildir, uygulanmaz.
    //
    // HER DELİK AYRI SKETCH + AYRI KESİM: SWOOD denemesinde iç içe geçen
    // delikleri tek profilde kesmek başarısız oldu (Linco 3×Ø18); ayrı
    // kesimler üst üste binebilir.
    // ════════════════════════════════════════════════════════════════════════
    public class BaglantiUygulamaSecenekleri
    {
        public bool GovdeKarsiTers; // otomatik bulunan gövde/karşı panel rolünü değiştir
        public bool IcYuzTers;      // gövde yüzey deliklerini panelin diğer yüzüne al
        public bool YonTers;        // dizi "sol" ucunu birleşimin diğer ucuna al
    }

    public class PlanlananDelik
    {
        public bool GovdeyeMi;     // false = karşı panel
        // Hedef yüz Face2 olarak SAKLANMAZ: her kesimden sonra parça yeniden
        // oluşur ve önceki yüz nesneleri geçersizleşebilir — kesimden hemen
        // önce normal + merkezden yeniden bulunur.
        public double[] NormalParca; // hedef yüzün dış normali, parça koordinatı
        public double[] MerkezParca; // parça koordinatı, metre
        public double CapMm, DerinlikMm;
        public string Aciklama;
    }

    public class BaglantiPlani
    {
        public Component2 Govde, Karsi;
        public double BirlesimBoyuMm, GovdeKalinlikMm;
        public List<PlanlananDelik> Delikler = new List<PlanlananDelik>();
        public List<string> Uyarilar = new List<string>();
        public string Hata; // doluysa plan uygulanamaz
    }

    public static class BaglantiUygulayici
    {
        private const double MM = 0.001;
        private const double DUZLEM_TOL_M = 0.0001; // 0,1 mm

        private class DuzYuz
        {
            public Face2 Yuz;
            public double[] N, P;           // montaj: dış normal, düzlemde bir nokta
            public double[] NParca, PParca; // parça koordinatı
            public List<double[]> Noktalar; // montaj: kenar uç noktaları
            public double Alan;
        }

        private class Panel
        {
            public Component2 Bilesen;
            public ModelDoc2 Belge;
            public MathTransform Tr, TrTers;
            public List<DuzYuz> Yuzler = new List<DuzYuz>();
        }

        public static BaglantiPlani Hesapla(ISldWorks app, Component2 c1, Component2 c2, BaglantiSablonu sablon, BaglantiUygulamaSecenekleri sec)
        {
            var plan = new BaglantiPlani();
            try
            {
                var mu = (MathUtility)app.GetMathUtility();
                var p1 = PanelOku(mu, c1);
                var p2 = PanelOku(mu, c2);
                if (p1 == null || p2 == null) { plan.Hata = "Seçilen bileşenlerden biri parça değil ya da gövdesi okunamadı."; return plan; }

                // Temas yüzü çifti
                DuzYuz enA = null, enB = null; double enOrtusme = 0;
                foreach (var a in p1.Yuzler)
                    foreach (var b in p2.Yuzler)
                    {
                        if (Nokta(a.N, b.N) > -0.999) continue;
                        if (Math.Abs(Nokta(Fark(b.P, a.P), a.N)) > DUZLEM_TOL_M) continue;
                        var (u, v) = DuzlemEksenleri(a.N);
                        double ou = Ortusme(a.Noktalar, b.Noktalar, u), ov = Ortusme(a.Noktalar, b.Noktalar, v);
                        if (ou <= DUZLEM_TOL_M || ov <= DUZLEM_TOL_M) continue;
                        if (ou * ov > enOrtusme) { enOrtusme = ou * ov; enA = a; enB = b; }
                    }
                if (enA == null) { plan.Hata = "İki panel arasında temas eden yüz bulunamadı — paneller birbirine dayanmıyor olabilir."; return plan; }

                bool p1Govde = enA.Alan <= enB.Alan;
                if (Math.Min(enA.Alan, enB.Alan) / Math.Max(enA.Alan, enB.Alan) > 0.7)
                {
                    plan.Hata = "Panellerin temas yüzleri benzer büyüklükte (yüz yüze bindirme) — alın birleşimi bulunamadı.";
                    return plan;
                }
                if (sec.GovdeKarsiTers) p1Govde = !p1Govde;
                Panel govde = p1Govde ? p1 : p2, karsi = p1Govde ? p2 : p1;
                DuzYuz alin = p1Govde ? enA : enB, karsiYuz = p1Govde ? enB : enA;
                plan.Govde = govde.Bilesen; plan.Karsi = karsi.Bilesen;

                // Gövde çerçevesi: n = alından karşı panele, t = kalınlık, e = birleşim boyu
                double[] n = Birim(alin.N);
                var buyukYuz = govde.Yuzler.Where(y => Math.Abs(Nokta(y.N, n)) < 0.01).OrderByDescending(y => y.Alan).FirstOrDefault();
                if (buyukYuz == null) { plan.Hata = "Gövde panelinin büyük yüzü bulunamadı."; return plan; }
                double[] t = Birim(buyukYuz.N);
                var seviyeler = govde.Yuzler.Where(y => Math.Abs(Nokta(y.N, t)) > 0.999).Select(y => Nokta(y.P, t)).ToList();
                double kalinlik = seviyeler.Max() - seviyeler.Min();
                plan.GovdeKalinlikMm = Math.Round(kalinlik / MM, 2);
                double[] e = Birim(Capraz(n, t));

                double[] c = Merkez(alin.Noktalar);
                // KULLANICI TESTİ: alında çentik/cep varsa (SWOOD Linco cepleri
                // kenara açık) köşe noktalarının ortalaması kalınlık ortasından
                // kayıyor, gövde yüzey delikleri yüzeyin düzleminden çıkıp
                // "hedef yüz bulunamadı" oluyordu. Kalınlık ortası iki büyük
                // yüzün tam ortasına oturtulur.
                double ortaT = (seviyeler.Max() + seviyeler.Min()) / 2;
                c = Topla(c, Olcek(t, ortaT - Nokta(c, t)));
                double[] cB = Merkez(karsiYuz.Noktalar);
                double isaret = Nokta(Fark(cB, c), t) >= 0 ? 1 : -1;
                if (sec.IcYuzTers) isaret = -isaret;
                double[] tIc = Olcek(t, isaret);

                double a0 = alin.Noktalar.Min(p => Nokta(p, e)), a1 = alin.Noktalar.Max(p => Nokta(p, e));
                double b0 = karsiYuz.Noktalar.Min(p => Nokta(p, e)), b1 = karsiYuz.Noktalar.Max(p => Nokta(p, e));
                double u0 = Math.Max(a0, b0), u1 = Math.Min(a1, b1);
                double boy = u1 - u0;
                plan.BirlesimBoyuMm = Math.Round(boy / MM, 1);
                if (boy < 1 * MM) { plan.Hata = "Birleşim boyu bulunamadı (paneller birleşim boyunca örtüşmüyor)."; return plan; }
                double cE = Nokta(c, e);

                var konumlar = sablon.ElemanKonumlari(boy / MM);
                for (int k = 0; k < konumlar.Count; k++)
                {
                    foreach (var d in sablon.Delikler)
                    {
                        if (d.CapMm <= 0 || d.DerinlikMm <= 0) continue;
                        double konumMm = konumlar[k] + d.XMm;
                        if (konumMm < 0 || konumMm > boy / MM)
                        {
                            plan.Uyarilar.Add($"Eleman {k + 1}: {d.Tur} Ø{d.CapMm} birleşim dışında ({konumMm:0.#} mm / {boy / MM:0.#} mm) — atlandı.");
                            continue;
                        }
                        double u = sec.YonTers ? u1 - konumMm * MM : u0 + konumMm * MM;
                        double[] j = Topla(c, Olcek(e, u - cE)); // birleşim düzleminde, gövde kalınlığının ortasında
                        double[] merkez, yuzNormali;
                        Panel hedef;
                        switch (d.Tur)
                        {
                            case DelikTuru.GovdeYuzey:
                                merkez = Topla(Topla(j, Olcek(n, -d.OfsetMm * MM)), Olcek(tIc, kalinlik / 2));
                                yuzNormali = tIc; hedef = govde; break;
                            case DelikTuru.GovdeKenar:
                                merkez = Topla(j, Olcek(tIc, d.OfsetMm * MM));
                                yuzNormali = n; hedef = govde; break;
                            default:
                                merkez = Topla(j, Olcek(tIc, d.OfsetMm * MM));
                                yuzNormali = Olcek(n, -1); hedef = karsi; break;
                        }
                        var merkezParca = Donustur(mu, merkez, hedef.TrTers, nokta: true);
                        var normalParca = Birim(Donustur(mu, yuzNormali, hedef.TrTers, nokta: false));
                        var yuz = HedefYuzBul(hedef.Yuzler, merkezParca, normalParca, d.CapMm * MM / 2);
                        string ad = $"Eleman {k + 1} {TurAdi(d.Tur)} Ø{d.CapMm:0.#}×{d.DerinlikMm:0.#}";
                        if (yuz == null)
                        {
                            var ayniYon = hedef.Yuzler.Where(y => Nokta(y.NParca, normalParca) > 0.999).ToList();
                            Tanilama.Kaydet($"BaglantiUygulayici: {ad} hedef yüz yok — aynı yönlü {ayniYon.Count} yüz, düzleme uzaklıklar (mm): " +
                                string.Join(", ", ayniYon.Select(y => (Nokta(Fark(merkezParca, y.PParca), y.NParca) / MM).ToString("0.##"))));
                            plan.Uyarilar.Add(ad + ": hedef yüz bulunamadı — atlandı.");
                            continue;
                        }
                        plan.Delikler.Add(new PlanlananDelik
                        {
                            GovdeyeMi = hedef == govde, NormalParca = normalParca, MerkezParca = merkezParca,
                            CapMm = d.CapMm, DerinlikMm = d.DerinlikMm, Aciklama = ad
                        });
                    }
                }
                Tanilama.Kaydet($"BaglantiUygulayici.Hesapla: govde={govde.Bilesen.Name2} karsi={karsi.Bilesen.Name2} boy={plan.BirlesimBoyuMm} kalinlik={plan.GovdeKalinlikMm} delik={plan.Delikler.Count} uyari={plan.Uyarilar.Count}");
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiUygulayici.Hesapla HATA: " + ex);
                plan.Hata = "Hesaplama hatası: " + ex.Message;
            }
            return plan;
        }

        public static string TurAdi(DelikTuru tur) =>
            tur == DelikTuru.GovdeYuzey ? "gövde yüzey" : tur == DelikTuru.GovdeKenar ? "gövde kenar" : "karşı yüzey";

        // Planı keser. Dönüş: açılan delik sayısı; başarısızlar uyarilar'a.
        public static int Uygula(ISldWorks app, ModelDoc2 montaj, BaglantiPlani plan, string sablonAdi, List<string> uyarilar)
        {
            var mu = (MathUtility)app.GetMathUtility();
            int acilan = 0;
            foreach (var d in plan.Delikler)
            {
                var belge = (ModelDoc2)(d.GovdeyeMi ? plan.Govde : plan.Karsi).GetModelDoc2();
                bool tamam = DelikKes(mu, belge, d, sablonAdi, out string hata);
                if (!tamam && hata == YUZ_SECILEMEDI)
                {
                    // Montajın içinden yüklenmiş ama penceresi olmayan parçada
                    // seçim başarısız olabilir — parça açılıp bir kez daha denenir.
                    int h = 0, w = 0;
                    app.OpenDoc6(belge.GetPathName(), (int)swDocumentTypes_e.swDocPART, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref h, ref w);
                    tamam = DelikKes(mu, belge, d, sablonAdi, out hata);
                    int e = 0;
                    app.ActivateDoc3(montaj.GetTitle(), false, (int)swRebuildOnActivation_e.swDontRebuildActiveDoc, ref e);
                }
                if (tamam) acilan++;
                else uyarilar.Add(d.Aciklama + ": " + hata);
            }
            try { montaj.EditRebuild3(); } catch { }
            Tanilama.Kaydet($"BaglantiUygulayici.Uygula: {acilan}/{plan.Delikler.Count} delik açıldı");
            return acilan;
        }

        private const string YUZ_SECILEMEDI = "yüz seçilemedi";

        private static bool DelikKes(MathUtility mu, ModelDoc2 belge, PlanlananDelik d, string sablonAdi, out string hata)
        {
            hata = null;
            var sm = belge.SketchManager;
            try
            {
                var yuz = HedefYuzBul(YuzleriOku(mu, belge, null), d.MerkezParca, d.NormalParca, d.CapMm * MM / 2);
                if (yuz == null) { hata = "hedef yüz bulunamadı"; return false; }
                belge.ClearSelection2(true);
                if (!((Entity)yuz).Select4(false, null)) { hata = YUZ_SECILEMEDI; return false; }
                sm.InsertSketch(true);
                var sketch = sm.ActiveSketch as Sketch;
                if (sketch == null) { hata = "sketch açılamadı"; return false; }
                var tr = sketch.ModelToSketchTransform as MathTransform;
                var s = Donustur(mu, d.MerkezParca, tr, nokta: true);
                // AddToDB: merkez, yakındaki kenarlara/dairelere yapışmasın.
                sm.AddToDB = true;
                sm.CreateCircleByRadius(s[0], s[1], 0, d.CapMm * MM / 2);
                sm.AddToDB = false;
                sm.InsertSketch(true);

                // Kesim, sketch'in açıldığı yüzden malzemenin içine doğru
                // gider; ters çıkarsa (null) yön çevrilip bir kez daha denenir.
                var ozellik = KesimYap(belge, d.DerinlikMm * MM, false);
                if (ozellik == null)
                {
                    var sk = belge.FeatureByPositionReverse(0) as Feature;
                    belge.ClearSelection2(true);
                    if (sk != null && sk.Select2(false, 0)) ozellik = KesimYap(belge, d.DerinlikMm * MM, true);
                }
                if (ozellik == null) { hata = "kesim oluşturulamadı (FeatureCut4 null)"; return false; }
                try { ozellik.Name = $"UOS {sablonAdi} {d.Aciklama}"; } catch { /* ad çakışırsa SolidWorks'ün verdiği ad kalır */ }
                return true;
            }
            catch (Exception ex)
            {
                try { if (sm.ActiveSketch != null) sm.InsertSketch(true); } catch { }
                Tanilama.Kaydet("BaglantiUygulayici.DelikKes HATA: " + ex);
                hata = ex.Message;
                return false;
            }
        }

        // FeatureCut4 — HirdavatDelikUygulayici'de gerçek derlemede doğrulanan
        // 27 parametreli imza; burada uç koşulu Blind + derinlik.
        private static Feature KesimYap(ModelDoc2 belge, double derinlikM, bool ters)
        {
            var fm = (IFeatureManager)belge.FeatureManager;
            return fm.FeatureCut4(
                true, ters, false, (int)swEndConditions_e.swEndCondBlind, 0,
                derinlikM, 0.0,
                false, false, false, false, 0.0, 0.0,
                false, false, false, false, false,
                true, true, true, true,
                false,
                (int)swStartConditions_e.swStartSketchPlane,
                0.0, false, false) as Feature;
        }

        private static Panel PanelOku(MathUtility mu, Component2 c)
        {
            var belge = c?.GetModelDoc2() as ModelDoc2;
            var parca = belge as PartDoc;
            if (parca == null) return null;
            var panel = new Panel { Bilesen = c, Belge = belge, Tr = c.Transform2 as MathTransform };
            panel.TrTers = panel.Tr?.Inverse() as MathTransform;
            panel.Yuzler = YuzleriOku(mu, belge, panel.Tr);
            return panel.Yuzler.Count == 0 ? null : panel;
        }

        // Parçanın düz yüzleri; tr verilirse N/P/Noktalar montaj koordinatına
        // taşınır, null ise parça koordinatında kalır.
        private static List<DuzYuz> YuzleriOku(MathUtility mu, ModelDoc2 belge, MathTransform tr)
        {
            var sonuc = new List<DuzYuz>();
            var parca = belge as PartDoc;
            object[] govdeler = parca?.GetBodies2((int)swBodyType_e.swSolidBody, true) as object[];
            if (govdeler == null) return sonuc;
            foreach (Body2 g in govdeler.Cast<Body2>())
            {
                object[] yuzler = g.GetFaces() as object[];
                if (yuzler == null) continue;
                foreach (Face2 y in yuzler.Cast<Face2>())
                {
                    var s = y.GetSurface() as Surface;
                    if (s == null || !s.IsPlane()) continue;
                    double[] np = y.Normal as double[];
                    double[] pp = s.PlaneParams as double[];
                    if (np == null || pp == null || pp.Length < 6) continue;
                    var noktalar = new List<double[]>();
                    object[] kenarlar = y.GetEdges() as object[];
                    if (kenarlar != null)
                        foreach (Edge k in kenarlar.Cast<Edge>())
                        {
                            double[] prm = k.GetCurveParams2() as double[];
                            if (prm == null || prm.Length < 6) continue;
                            noktalar.Add(Donustur(mu, new[] { prm[0], prm[1], prm[2] }, tr, nokta: true));
                            noktalar.Add(Donustur(mu, new[] { prm[3], prm[4], prm[5] }, tr, nokta: true));
                        }
                    if (noktalar.Count < 3) continue;
                    var pParca = new[] { pp[3], pp[4], pp[5] };
                    sonuc.Add(new DuzYuz
                    {
                        Yuz = y,
                        NParca = Birim(np), PParca = pParca,
                        N = Birim(Donustur(mu, np, tr, nokta: false)),
                        P = Donustur(mu, pParca, tr, nokta: true),
                        Noktalar = noktalar,
                        Alan = y.GetArea()
                    });
                }
            }
            return sonuc;
        }

        // Normali uyan, düzlemi merkezden geçen ve merkezi (yarıçap payıyla)
        // kapsayan yüz; kapsayan yoksa aynı düzlemdeki en büyük yüz.
        private static Face2 HedefYuzBul(List<DuzYuz> yuzler, double[] merkezParca, double[] normalParca, double yaricapM)
        {
            var adaylar = yuzler.Where(y => Nokta(y.NParca, normalParca) > 0.999 &&
                                              Math.Abs(Nokta(Fark(merkezParca, y.PParca), y.NParca)) < DUZLEM_TOL_M).ToList();
            if (adaylar.Count == 0) return null;
            var (u, v) = DuzlemEksenleri(normalParca);
            foreach (var y in adaylar.OrderByDescending(y => y.Alan))
            {
                // Kapsama testi yüzün parça koordinatındaki sınır kutusuyla
                // (GetBox parça koordinatı döner), düzlem eksenleri üzerinde.
                double[] kutu = y.Yuz.GetBox() as double[];
                if (kutu == null || kutu.Length < 6) continue;
                double[] mn = { Math.Min(kutu[0], kutu[3]), Math.Min(kutu[1], kutu[4]), Math.Min(kutu[2], kutu[5]) };
                double[] mx = { Math.Max(kutu[0], kutu[3]), Math.Max(kutu[1], kutu[4]), Math.Max(kutu[2], kutu[5]) };
                bool icinde = true;
                foreach (var eks in new[] { u, v })
                {
                    double m = Nokta(merkezParca, eks);
                    double lo = double.MaxValue, hi = double.MinValue;
                    for (int i = 0; i < 8; i++)
                    {
                        double[] kose = { (i & 1) == 0 ? mn[0] : mx[0], (i & 2) == 0 ? mn[1] : mx[1], (i & 4) == 0 ? mn[2] : mx[2] };
                        double k = Nokta(kose, eks); lo = Math.Min(lo, k); hi = Math.Max(hi, k);
                    }
                    if (m < lo - yaricapM || m > hi + yaricapM) { icinde = false; break; }
                }
                if (icinde) return y.Yuz;
            }
            return adaylar.OrderByDescending(y => y.Alan).First().Yuz;
        }

        // ── vektör yardımcıları ─────────────────────────────────────────────
        private static double[] Donustur(MathUtility mu, double[] v, MathTransform tr, bool nokta)
        {
            if (mu == null || tr == null) return v;
            object sonuc = nokta
                ? ((MathPoint)mu.CreatePoint(v)).MultiplyTransform(tr)
                : ((MathVector)mu.CreateVector(v)).MultiplyTransform(tr);
            return nokta ? (double[])((MathPoint)sonuc).ArrayData : (double[])((MathVector)sonuc).ArrayData;
        }
        private static double Nokta(double[] a, double[] b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        private static double[] Fark(double[] a, double[] b) => new[] { a[0] - b[0], a[1] - b[1], a[2] - b[2] };
        private static double[] Topla(double[] a, double[] b) => new[] { a[0] + b[0], a[1] + b[1], a[2] + b[2] };
        private static double[] Olcek(double[] a, double k) => new[] { a[0] * k, a[1] * k, a[2] * k };
        private static double[] Capraz(double[] a, double[] b) =>
            new[] { a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0] };
        private static double[] Birim(double[] a) { double l = Math.Sqrt(Nokta(a, a)); return l < 1e-12 ? a : Olcek(a, 1 / l); }
        private static double[] Merkez(List<double[]> p) =>
            new[] { p.Average(n => n[0]), p.Average(n => n[1]), p.Average(n => n[2]) };
        private static (double[] u, double[] v) DuzlemEksenleri(double[] n)
        {
            double[] yardimci = Math.Abs(n[0]) < 0.9 ? new double[] { 1, 0, 0 } : new double[] { 0, 1, 0 };
            var u = Birim(Capraz(n, yardimci));
            return (u, Birim(Capraz(n, u)));
        }
        private static double Ortusme(List<double[]> a, List<double[]> b, double[] eks)
        {
            double a0 = a.Min(p => Nokta(p, eks)), a1 = a.Max(p => Nokta(p, eks));
            double b0 = b.Min(p => Nokta(p, eks)), b1 = b.Max(p => Nokta(p, eks));
            return Math.Min(a1, b1) - Math.Max(a0, b0);
        }
    }
}
