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
        // Önizleme (geçici gövde) için montaj koordinatı: delik ağzı merkezi
        // ve malzemenin içine doğru eksen.
        public double[] MerkezMontaj, EksenMontaj;
    }

    // Kullanıcının seçtiği birleşim yüzeyinden bulunan panel çifti; N/P
    // seçilen temas düzlemi (montaj koordinatı) — aynı iki panel arasında
    // birden çok birleşim varsa yalnızca bu düzlemdeki kullanılır.
    public class BirlesimSecimi
    {
        public Component2 A, B;
        public double[] N, P;
        public string Ad => $"{A?.Name2} ↔ {B?.Name2}";
    }

    public class BaglantiPlani
    {
        public Component2 Govde, Karsi;
        public double BirlesimBoyuMm, GovdeKalinlikMm;
        public List<PlanlananDelik> Delikler = new List<PlanlananDelik>();
        public List<string> Uyarilar = new List<string>();
        public string Hata; // doluysa plan uygulanamaz
        public List<double> ElemanKonumlariMm = new List<double>();
        // Her eleman için 3B model yerleşimi (montaj): [orijin, X, Y, Z].
        // Orijin birleşim düzleminde, gövde kalınlığının ortasında; X birleşim
        // boyunca (dizi yönü), Y gövde paneline doğru, Z gövdenin iç yüzüne doğru.
        public List<double[][]> ElemanCerceveleri = new List<double[][]>();
        public string ModelYolu; // şablonun 3B modeli (yoksa null)
        // Önizlemede birleşimi belirginleştiren çubuk: birleşim düzleminde,
        // gövde kalınlığının ortasında, birleşim boyunca (montaj koordinatı).
        public double[] CizgiBas, CizgiSon;
        public double CizgiYaricapM;
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

        public static BaglantiPlani Hesapla(ISldWorks app, Component2 c1, Component2 c2, BaglantiSablonu sablon, BaglantiUygulamaSecenekleri sec) =>
            HesaplaIc(app, c1, c2, null, null, sablon, sec);

        public static BaglantiPlani Hesapla(ISldWorks app, BirlesimSecimi b, BaglantiSablonu sablon, BaglantiUygulamaSecenekleri sec) =>
            HesaplaIc(app, b.A, b.B, b.N, b.P, sablon, sec);

        private static BaglantiPlani HesaplaIc(ISldWorks app, Component2 c1, Component2 c2, double[] secN, double[] secP, BaglantiSablonu sablon, BaglantiUygulamaSecenekleri sec)
        {
            var plan = new BaglantiPlani { ModelYolu = sablon.ModelYolu() };
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
                        if (secN != null && (Math.Abs(Nokta(a.N, secN)) < 0.999 || Math.Abs(Nokta(Fark(a.P, secP), secN)) > DUZLEM_TOL_M)) continue;
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
                plan.CizgiBas = Topla(c, Olcek(e, u0 - cE));
                plan.CizgiSon = Topla(c, Olcek(e, u1 - cE));
                plan.CizgiYaricapM = Math.Max(1 * MM, kalinlik * 0.35);

                var konumlar = sablon.ElemanKonumlari(boy / MM);
                plan.ElemanKonumlariMm = konumlar;
                // Model çerçevesi: Y gövdeye doğru (-n), Z iç yüze doğru, X = Y×Z
                // (sağ el); X dizi yönünün tersine düşerse X ve Z birlikte çevrilir.
                double[] yEks = Olcek(n, -1), zEks = tIc, xEks = Birim(Capraz(yEks, zEks));
                double[] diziYonu = sec.YonTers ? Olcek(e, -1) : e;
                if (Nokta(xEks, diziYonu) < 0) { xEks = Olcek(xEks, -1); zEks = Olcek(zEks, -1); }
                foreach (var km in konumlar)
                {
                    if (km < 0 || km > boy / MM) continue;
                    double uk = sec.YonTers ? u1 - km * MM : u0 + km * MM;
                    plan.ElemanCerceveleri.Add(new[] { Topla(c, Olcek(e, uk - cE)), xEks, yEks, zEks });
                }
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
                            CapMm = d.CapMm, DerinlikMm = d.DerinlikMm, Aciklama = ad,
                            MerkezMontaj = merkez, EksenMontaj = Olcek(Birim(yuzNormali), -1)
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

        // Şablonun 3B modelini her elemanın çerçevesine yerleştirir. Eşleme
        // (mate) EKLENMEZ — bileşen konumuyla durur; panel taşınırsa bağlantı
        // yeniden uygulanmalı.
        private static void ModelleriYerlestir(ISldWorks app, MathUtility mu, ModelDoc2 montaj, BaglantiPlani plan, List<string> uyarilar)
        {
            if (string.IsNullOrEmpty(plan.ModelYolu) || plan.ElemanCerceveleri.Count == 0) return;
            if (!System.IO.File.Exists(plan.ModelYolu)) { uyarilar.Add("3B model dosyası bulunamadı: " + plan.ModelYolu); return; }
            try
            {
                bool montajMi = plan.ModelYolu.EndsWith(".sldasm", StringComparison.OrdinalIgnoreCase);
                int h = 0, w = 0;
                // AddComponent5 için model belleğe yüklenmiş olmalı.
                app.OpenDoc6(plan.ModelYolu, montajMi ? (int)swDocumentTypes_e.swDocASSEMBLY : (int)swDocumentTypes_e.swDocPART,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref h, ref w);
                app.ActivateDoc3(montaj.GetTitle(), false, (int)swRebuildOnActivation_e.swDontRebuildActiveDoc, ref h);
                var asm = (AssemblyDoc)montaj;
                int eklenen = 0;
                foreach (var cer in plan.ElemanCerceveleri)
                {
                    var bilesen = asm.AddComponent5(plan.ModelYolu, (int)swAddComponentConfigOptions_e.swAddComponentConfigOptions_CurrentSelectedConfig,
                        "", false, "", cer[0][0], cer[0][1], cer[0][2]);
                    if (bilesen == null) { uyarilar.Add("3B model eklenemedi (AddComponent5 null)."); continue; }
                    // MathTransform dizisi: [X ekseni, Y ekseni, Z ekseni, öteleme, ölçek, 0,0,0]
                    double[] dizi =
                    {
                        cer[1][0], cer[1][1], cer[1][2],
                        cer[2][0], cer[2][1], cer[2][2],
                        cer[3][0], cer[3][1], cer[3][2],
                        cer[0][0], cer[0][1], cer[0][2],
                        1, 0, 0, 0
                    };
                    bilesen.Transform2 = mu.CreateTransform(dizi) as MathTransform;
                    eklenen++;
                }
                Tanilama.Kaydet($"BaglantiUygulayici.ModelleriYerlestir: {eklenen}/{plan.ElemanCerceveleri.Count} model eklendi ({plan.ModelYolu})");
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiUygulayici.ModelleriYerlestir HATA: " + ex);
                uyarilar.Add("3B model yerleştirilemedi: " + ex.Message);
            }
        }

        // ── Seçilen birleşim yüzeyinden panel çiftini bul ───────────────────
        // Seçilen yüz (montajdaki bir panel yüzü) kendi panelinin düz
        // yüzleriyle eşlenir, sonra montajdaki diğer parçalar arasında bu yüze
        // ZIT normalli, aynı düzlemde ve örtüşen yüzü olan panel aranır.
        public static BirlesimSecimi YuzdenBirlesimBul(ISldWorks app, ModelDoc2 montaj, Component2 bilesen, Face2 seciliYuz, out string hata)
        {
            hata = null;
            try
            {
                var mu = (MathUtility)app.GetMathUtility();
                var panel = PanelOku(mu, bilesen);
                if (panel == null) { hata = "Seçilen yüzün parçası okunamadı."; return null; }
                var yuz = SeciliYuzuEsle(panel, seciliYuz);
                if (yuz == null) { hata = "Seçilen yüz düz değil ya da panelin yüzleriyle eşlenemedi."; return null; }

                object[] tumu = ((AssemblyDoc)montaj).GetComponents(false) as object[];
                if (tumu == null) { hata = "Montaj bileşenleri okunamadı."; return null; }
                Component2 enIyi = null; double enOrtusme = 0;
                foreach (Component2 c in tumu.Cast<Component2>())
                {
                    if (c == null || c.Name2 == bilesen.Name2 || c.IsSuppressed()) continue;
                    if (!(c.GetModelDoc2() is PartDoc)) continue;
                    // Hızlı ön eleme: bileşenin kutusu seçilen düzlemi kesiyor mu?
                    if (c.GetBox(false, false) is double[] kutu && kutu.Length >= 6)
                    {
                        double lo = double.MaxValue, hi = double.MinValue;
                        for (int i = 0; i < 8; i++)
                        {
                            double[] kose = { (i & 1) == 0 ? kutu[0] : kutu[3], (i & 2) == 0 ? kutu[1] : kutu[4], (i & 4) == 0 ? kutu[2] : kutu[5] };
                            double k = Nokta(Fark(kose, yuz.P), yuz.N); lo = Math.Min(lo, k); hi = Math.Max(hi, k);
                        }
                        if (lo > DUZLEM_TOL_M * 5 || hi < -DUZLEM_TOL_M * 5) continue;
                    }
                    var diger = PanelOku(mu, c);
                    if (diger == null) continue;
                    var (u, v) = DuzlemEksenleri(yuz.N);
                    foreach (var b in diger.Yuzler)
                    {
                        if (Nokta(yuz.N, b.N) > -0.999) continue;
                        if (Math.Abs(Nokta(Fark(b.P, yuz.P), yuz.N)) > DUZLEM_TOL_M) continue;
                        double ou = Ortusme(yuz.Noktalar, b.Noktalar, u), ov = Ortusme(yuz.Noktalar, b.Noktalar, v);
                        if (ou <= DUZLEM_TOL_M || ov <= DUZLEM_TOL_M) continue;
                        if (ou * ov > enOrtusme) { enOrtusme = ou * ov; enIyi = c; }
                    }
                }
                if (enIyi == null) { hata = "Seçilen yüze dayanan başka bir panel bulunamadı."; return null; }
                Tanilama.Kaydet($"BaglantiUygulayici.YuzdenBirlesimBul: {bilesen.Name2} ↔ {enIyi.Name2}");
                return new BirlesimSecimi { A = bilesen, B = enIyi, N = yuz.N, P = yuz.P };
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiUygulayici.YuzdenBirlesimBul HATA: " + ex);
                hata = ex.Message;
                return null;
            }
        }

        // KULLANICI İSTEĞİ: "yüzeyler birbirine bitişik olduğu için
        // seçemiyorum" — üst üste binen temas yüzlerine tıklamak yerine seçili
        // PANELLERİN diğer panellere dayandığı tüm alın birleşimleri bulunur.
        // Yüz yüze bindirmeler (iki temas yüzü benzer büyüklükte) alınmaz.
        public static List<BirlesimSecimi> BirlesimleriBul(ISldWorks app, ModelDoc2 montaj, List<Component2> secilenler, List<string> uyarilar)
        {
            var sonuc = new List<BirlesimSecimi>();
            try
            {
                var mu = (MathUtility)app.GetMathUtility();
                object[] tumu = ((AssemblyDoc)montaj).GetComponents(false) as object[];
                if (tumu == null) return sonuc;
                var adaylar = tumu.Cast<Component2>().Where(c => c != null && !c.IsSuppressed() && c.GetModelDoc2() is PartDoc).ToList();
                var okunan = new Dictionary<string, Panel>();
                Panel Oku(Component2 c)
                {
                    if (!okunan.TryGetValue(c.Name2, out var p)) okunan[c.Name2] = p = PanelOku(mu, c);
                    return p;
                }
                foreach (var a in secilenler)
                {
                    var pa = Oku(a);
                    if (pa == null) { uyarilar.Add(a.Name2 + ": parça gövdesi okunamadı."); continue; }
                    double[] kutuA = a.GetBox(false, false) as double[];
                    foreach (var c in adaylar)
                    {
                        if (c.Name2 == a.Name2) continue;
                        // Hızlı ön eleme: kutular (1 mm payla) kesişmiyorsa temas yok.
                        if (kutuA != null && c.GetBox(false, false) is double[] kutuC &&
                            (kutuC[0] > Math.Max(kutuA[0], kutuA[3]) + 0.001 || Math.Max(kutuC[0], kutuC[3]) < Math.Min(kutuA[0], kutuA[3]) - 0.001 ||
                             Math.Min(kutuC[1], kutuC[4]) > Math.Max(kutuA[1], kutuA[4]) + 0.001 || Math.Max(kutuC[1], kutuC[4]) < Math.Min(kutuA[1], kutuA[4]) - 0.001 ||
                             Math.Min(kutuC[2], kutuC[5]) > Math.Max(kutuA[2], kutuA[5]) + 0.001 || Math.Max(kutuC[2], kutuC[5]) < Math.Min(kutuA[2], kutuA[5]) - 0.001))
                            continue;
                        var pc = Oku(c);
                        if (pc == null) continue;
                        foreach (var fa in pa.Yuzler)
                        {
                            double enIyi = 0; DuzYuz eslesen = null;
                            var (u, v) = DuzlemEksenleri(fa.N);
                            foreach (var fb in pc.Yuzler)
                            {
                                if (Nokta(fa.N, fb.N) > -0.999) continue;
                                if (Math.Abs(Nokta(Fark(fb.P, fa.P), fa.N)) > DUZLEM_TOL_M) continue;
                                double ou = Ortusme(fa.Noktalar, fb.Noktalar, u), ov = Ortusme(fa.Noktalar, fb.Noktalar, v);
                                if (ou <= DUZLEM_TOL_M || ov <= DUZLEM_TOL_M) continue;
                                if (ou * ov > enIyi) { enIyi = ou * ov; eslesen = fb; }
                            }
                            if (eslesen == null) continue;
                            if (Math.Min(fa.Alan, eslesen.Alan) / Math.Max(fa.Alan, eslesen.Alan) > 0.7) continue; // yüz yüze bindirme
                            bool zatenVar = sonuc.Any(b =>
                                ((b.A.Name2 == a.Name2 && b.B.Name2 == c.Name2) || (b.A.Name2 == c.Name2 && b.B.Name2 == a.Name2)) &&
                                Math.Abs(Nokta(b.N, fa.N)) > 0.999 && Math.Abs(Nokta(Fark(fa.P, b.P), b.N)) < DUZLEM_TOL_M);
                            if (!zatenVar) sonuc.Add(new BirlesimSecimi { A = a, B = c, N = fa.N, P = fa.P });
                        }
                    }
                }
                Tanilama.Kaydet($"BaglantiUygulayici.BirlesimleriBul: {secilenler.Count} panel → {sonuc.Count} birleşim");
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiUygulayici.BirlesimleriBul HATA: " + ex);
                uyarilar.Add("Birleşim arama hatası: " + ex.Message);
            }
            return sonuc;
        }

        // Montajdan seçilen yüzün geometrisinin hangi koordinatta döndüğü
        // (montaj mı, parça mı) bu ortamda doğrulanmadı — iki yorum da denenir.
        private static DuzYuz SeciliYuzuEsle(Panel panel, Face2 seciliYuz)
        {
            var s = seciliYuz?.GetSurface() as Surface;
            if (s == null || !s.IsPlane()) return null;
            double[] n = seciliYuz.Normal as double[], pp = s.PlaneParams as double[];
            if (n == null || pp == null || pp.Length < 6) return null;
            n = Birim(n);
            double[] p = { pp[3], pp[4], pp[5] };
            double alan = seciliYuz.GetArea();
            DuzYuz enIyi = null; double enFark = double.MaxValue;
            foreach (var y in panel.Yuzler)
            {
                bool montajda = Nokta(y.N, n) > 0.999 && Math.Abs(Nokta(Fark(p, y.P), y.N)) < DUZLEM_TOL_M;
                bool parcada = Nokta(y.NParca, n) > 0.999 && Math.Abs(Nokta(Fark(p, y.PParca), y.NParca)) < DUZLEM_TOL_M;
                if (!montajda && !parcada) continue;
                double fark = Math.Abs(y.Alan - alan);
                if (fark < enFark) { enFark = fark; enIyi = y; }
            }
            Tanilama.Kaydet($"BaglantiUygulayici.SeciliYuzuEsle: {(enIyi == null ? "EŞLENEMEDİ" : "eşlendi")} (alan fark={enFark:0.######})");
            return enIyi;
        }

        // ── SolidWorks önizlemesi (sarı geçici gövdeler) ────────────────────
        // Her delik için geçici bir silindir gösterilir; modele hiçbir şey
        // eklenmez. Gövdeler OnizlemeTemizle ile gizlenir (pencere kapanınca da).
        private const int SARI = 0x0000FFFF;    // COLORREF (0x00BBGGRR) — R=255, G=255
        private const int TURUNCU = 0x000080FF; // R=255, G=128 — seçili birleşim
        private const int MAVI = 0x00FF9900;    // R=0, G=153, B=255 — diğer birleşimler
        public static List<Body2> OnizlemeGoster(ISldWorks app, ModelDoc2 montaj, IEnumerable<BaglantiPlani> planlar, BaglantiPlani aktif = null)
        {
            var govdeler = new List<Body2>();
            var modeler = app.GetModeler() as Modeler;
            if (modeler == null) return govdeler;
            foreach (var plan in planlar)
            {
                // Birleşimi belirginleştiren çubuk (iki panelin arasında renkli bant).
                if (plan.CizgiBas != null && plan.CizgiSon != null)
                {
                    try
                    {
                        double[] yon = Fark(plan.CizgiSon, plan.CizgiBas);
                        double boy = Math.Sqrt(Nokta(yon, yon));
                        if (boy > 1e-6)
                        {
                            yon = Olcek(yon, 1 / boy);
                            double[] prm = { plan.CizgiBas[0], plan.CizgiBas[1], plan.CizgiBas[2], yon[0], yon[1], yon[2], plan.CizgiYaricapM, boy };
                            if (modeler.CreateBodyFromCyl(prm) is Body2 g)
                            {
                                g.Display3(null, ReferenceEquals(plan, aktif) ? TURUNCU : MAVI, (int)swTempBodySelectOptions_e.swTempBodySelectOptionNone);
                                govdeler.Add(g);
                            }
                        }
                    }
                    catch (Exception ex) { Tanilama.Kaydet("BaglantiUygulayici.OnizlemeGoster çubuk HATA: " + ex.Message); }
                }
                foreach (var d in plan.Delikler)
                {
                    if (d.MerkezMontaj == null || d.EksenMontaj == null) continue;
                    try
                    {
                        // Ağız yüzeyin 0,2 mm dışından başlasın ki panel yüzeyinin altında kalmasın.
                        double[] taban = Topla(d.MerkezMontaj, Olcek(d.EksenMontaj, -0.0002));
                        double[] prm = { taban[0], taban[1], taban[2], d.EksenMontaj[0], d.EksenMontaj[1], d.EksenMontaj[2],
                                         d.CapMm * MM / 2, d.DerinlikMm * MM + 0.0002 };
                        if (modeler.CreateBodyFromCyl(prm) is Body2 g)
                        {
                            g.Display3(null, SARI, (int)swTempBodySelectOptions_e.swTempBodySelectOptionNone);
                            govdeler.Add(g);
                        }
                    }
                    catch (Exception ex) { Tanilama.Kaydet("BaglantiUygulayici.OnizlemeGoster HATA: " + ex.Message); }
                }
            }
            try { montaj.GraphicsRedraw2(); } catch { }
            return govdeler;
        }

        public static void OnizlemeTemizle(ModelDoc2 montaj, List<Body2> govdeler)
        {
            if (govdeler == null) return;
            foreach (var g in govdeler)
            {
                try { g.Hide(montaj); } catch { }
                try { System.Runtime.InteropServices.Marshal.ReleaseComObject(g); } catch { }
            }
            govdeler.Clear();
            try { montaj?.GraphicsRedraw2(); } catch { }
        }


        public static string TurAdi(DelikTuru tur) =>
            tur == DelikTuru.GovdeYuzey ? "gövde yüzey" : tur == DelikTuru.GovdeKenar ? "gövde kenar" : "karşı yüzey";

        // Planı keser. Dönüş: açılan delik sayısı; başarısızlar uyarilar'a.
        public static int Uygula(ISldWorks app, ModelDoc2 montaj, BaglantiPlani plan, string sablonAdi, List<string> uyarilar)
        {
            var mu = (MathUtility)app.GetMathUtility();
            int acilan = 0;
            // KULLANICI TESTİ: yüz seçildi ama "sketch açılamadı" — SolidWorks,
            // penceresi AKTİF olmayan (montajın içinden yüklenmiş) parçada
            // sketch açmıyor. Her parça kendi penceresinde açılıp aktif edilir,
            // delikleri açılır; pencereyi biz açtıysak kapatılır (montaj
            // referansı yüzünden belge bellekte kalır, değişiklik montajla
            // birlikte kaydedilir), sonra montaja dönülir.
            foreach (var grup in plan.Delikler.GroupBy(d => d.GovdeyeMi))
            {
                var bilesen = grup.Key ? plan.Govde : plan.Karsi;
                var belge = (ModelDoc2)bilesen.GetModelDoc2();
                bool zatenGorunur = belge.Visible;
                int h = 0, w = 0;
                if (!zatenGorunur)
                    app.OpenDoc6(belge.GetPathName(), (int)swDocumentTypes_e.swDocPART, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref h, ref w);
                app.ActivateDoc3(belge.GetTitle(), false, (int)swRebuildOnActivation_e.swDontRebuildActiveDoc, ref h);
                Tanilama.Kaydet($"BaglantiUygulayici.Uygula: '{belge.GetTitle()}' aktif edildi (zatenGorunur={zatenGorunur}, aktif={(app.ActiveDoc as ModelDoc2)?.GetTitle()})");
                foreach (var d in grup)
                {
                    if (DelikKes(mu, belge, d, sablonAdi, out string hata)) acilan++;
                    else uyarilar.Add(d.Aciklama + ": " + hata);
                }
                try { belge.EditRebuild3(); } catch { }
                if (!zatenGorunur) app.CloseDoc(belge.GetTitle());
            }
            int e = 0;
            app.ActivateDoc3(montaj.GetTitle(), false, (int)swRebuildOnActivation_e.swRebuildActiveDoc, ref e);
            ModelleriYerlestir(app, mu, montaj, plan, uyarilar);
            try { montaj.EditRebuild3(); } catch { }
            Tanilama.Kaydet($"BaglantiUygulayici.Uygula: {acilan}/{plan.Delikler.Count} delik açıldı");
            return acilan;
        }


        private static bool DelikKes(MathUtility mu, ModelDoc2 belge, PlanlananDelik d, string sablonAdi, out string hata)
        {
            hata = null;
            var sm = belge.SketchManager;
            try
            {
                var yuz = HedefYuzBul(YuzleriOku(mu, belge, null), d.MerkezParca, d.NormalParca, d.CapMm * MM / 2);
                if (yuz == null) { hata = "hedef yüz bulunamadı"; return false; }
                belge.ClearSelection2(true);
                if (!((Entity)yuz).Select4(false, null)) { hata = "yüz seçilemedi"; return false; }
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
