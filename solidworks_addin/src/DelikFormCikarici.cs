using System;
using System.Collections.Generic;
using System.Linq;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // Tek bir delik: parçanın KENDİ yerel düzleminde (bkz. aşağıdaki not),
    // sol-alt köşe (0,0) referanslı X/Y konumu + çap + derinlik, mm.
    public class DelikBilgisi
    {
        public double XMm, YMm;
        public double CapMm;
        public double DerinlikMm;
        public bool TumBoyu; // parça kalınlığına yakınsa (± tolerans) delik TAM BOYUNCA sayılır
        // Delik ekseni referans yüzeyin normaline paralel mi (yüzden delinen
        // delik) — false ise kenardan delinmiş (minifix/kavela gibi) bir
        // deliktir; X/Y'si yine yüzey düzlemine izdüşümdür ama nesting
        // sketch'inde yüzeyde bir delik olarak ÇİZİLMEMELİDİR.
        public bool YuzeyeDik = true;
    }

    // Tek bir form (cep/kesik/pah gibi dairesel OLMAYAN profil): kapalı
    // poligon köşe noktaları, parçanın KENDİ yerel düzleminde, mm.
    public class FormBilgisi
    {
        public List<double[]> NoktalarXY = new List<double[]>(); // [[x,y], [x,y], ...]
    }

    // Bir parçanın TÜM düzlemsel geometrisi — delikler, formlar ve dış hat
    // AYNI çerçevede: en büyük düz yüzeyin düzlemi, o yüzeyin sınır
    // kutusunun sol-alt köşesi (0,0). GenislikMm/YukseklikMm bu çerçevenin
    // X/Y boyutudur (0 ise çerçeve kurulamadı, koordinatlar ham kalır).
    public class ParcaGeometrisi
    {
        public List<DelikBilgisi> Delikler = new List<DelikBilgisi>();
        public List<FormBilgisi> Formlar = new List<FormBilgisi>();
        public List<double[]> DisHat = new List<double[]>(); // [[x,y], ...] — kapalı, ilk nokta tekrarlanmaz
        public double GenislikMm, YukseklikMm;

        // Çerçevenin X ekseni parçanın hangi ölçüsüne (En mi Boy mu) denk
        // geliyor, geometriden bilinemez — En/Boy farklı kaynaklardan
        // (denklem, özel alan, sınır kutusu) gelebiliyor. Nesting/CNC
        // önizlemesi X=En, Y=Boy beklediği için, çerçeve boyutları En/Boy ile
        // ters eşleşiyorsa X↔Y yer değiştirilmiş bir KOPYA döner.
        public ParcaGeometrisi EnBoyaHizala(double enMm, double boyMm)
        {
            if (GenislikMm <= 0 || YukseklikMm <= 0 || enMm <= 0 || boyMm <= 0) return this;
            double duz = Math.Abs(GenislikMm - enMm) + Math.Abs(YukseklikMm - boyMm);
            double ters = Math.Abs(GenislikMm - boyMm) + Math.Abs(YukseklikMm - enMm);
            if (ters >= duz) return this;

            double[] Cevir(double[] n) => new[] { n[1], n[0] };
            return new ParcaGeometrisi
            {
                Delikler = Delikler.Select(d => new DelikBilgisi
                {
                    XMm = d.YMm, YMm = d.XMm, CapMm = d.CapMm, DerinlikMm = d.DerinlikMm,
                    TumBoyu = d.TumBoyu, YuzeyeDik = d.YuzeyeDik
                }).ToList(),
                Formlar = Formlar.Select(f => new FormBilgisi { NoktalarXY = f.NoktalarXY.Select(Cevir).ToList() }).ToList(),
                DisHat = DisHat.Select(Cevir).ToList(),
                GenislikMm = YukseklikMm,
                YukseklikMm = GenislikMm
            };
        }

        // Nesting girdisi biçimleri — yalnızca yüzeyden delinen delikler.
        public List<(double x, double y, double cap)> NestingDelikleri() =>
            Delikler.Where(d => d.YuzeyeDik).Select(d => (x: d.XMm, y: d.YMm, cap: d.CapMm)).ToList();
        public List<List<(double x, double y)>> NestingFormlari() =>
            Formlar.Select(f => f.NoktalarXY.Select(n => (x: n[0], y: n[1])).ToList()).ToList();
        public List<(double x, double y)> NestingDisHatti() =>
            DisHat.Select(n => (x: n[0], y: n[1])).ToList();
    }

    // ════════════════════════════════════════════════════════════════════════
    // DELİK/FORM ÇIKARICI — kullanıcı isteği: "nestinge alt montaj ve parça
    // üzerindeki delikleri ve formları da ekle". Menteşe/minifix/rafix deliği,
    // kulp deliği, kablo geçiş deliği gibi konumlar parça sayısı arttıkça elle
    // girilemeyecek kadar çoktur — bu yüzden BOY_MM/EN_MM'nin aksine (bkz.
    // KesimListesiCikarici.OlcuHesapla) burada GEOMETRİDEN otomatik çıkarım
    // deneniyor.
    //
    // YÖNTEM:
    //   Delik  → gövdenin TÜM yüzeyleri gezilir; IFace2.GetSurface() bir
    //            SİLİNDİR ise (ISurface.IsCylinder()) ve yarıçapı makul bir
    //            "delik" aralığındaysa (MIN..MAKS_DELIK_CAP_MM) bu bir delik
    //            adayı sayılır. Derinlik, o yüzün sınır kutusunun silindir
    //            ekseni yönündeki uzunluğundan yaklaşık hesaplanır.
    //   Form   → en büyük DÜZ (planar) yüzeyin İÇ loop'ları (dış sınır
    //            OLMAYAN, yani bir cep/kesik/menfez gibi kapalı iç konturlar)
    //            noktalarına indirgenir (yay/eğri kenarlar örneklenerek
    //            noktalara açılır — hassas CAM yolu üretimi için YETERLİ
    //            DEĞİLDİR, yalnızca nesting'de görsel/yer ayırma amaçlıdır).
    //   Dış hat→ AYNI yüzeyin DIŞ loop'u (kertik/çentik dahil gerçek silüet).
    //   Hepsi  → en büyük düz yüzeyin düzlemine izdüşürülür, o yüzeyin
    //            sınır kutusunun sol-alt köşesi (0,0) kabul edilir.
    //
    // GÜVENİLİRLİK UYARISI (ÇOK ÖNEMLİ): Bu dosyadaki ISurface.IsCylinder /
    // ISurface.CylinderParams / IFace2.GetBox / IFace2.GetLoops / ILoop2.
    // IsOuterLoop / ILoop2.GetEdges / IEdge2.GetCurve çağrıları, SolidWorks'ün
    // 2001'den beri değişmeyen, kamuya açık makrolarda yaygın kullanılan
    // TEMEL geometri API'leridir — ama bu ortamda GERÇEK bir SolidWorks/
    // Visual Studio derleyicisi YOK ve resmi dokümantasyon sayfalarına ağ
    // erişimi bu oturumda ENGELLENDİ, yani üye adları/dizin sırası (özellikle
    // CylinderParams'ın döndürdüğü double[7] dizisinin [0..2]=eksen noktası,
    // [3..5]=eksen yönü, [6]=yarıçap sırası) BİZZAT DOĞRULANAMADI. Yanlışsa
    // iki türlü ortaya çıkar: (a) derleme hatası — güvenli, Visual Studio'da
    // hemen görülür, tek satır düzeltilir; (b) DERLENIR ama YANLIŞ sayısal
    // değerler üretir — bu YAKALANAMAZ, bu yüzden:
    //   1) Çıkan delik/form verisi OzelAlanlar.DELIKLER_ONAYLANDI kullanıcı
    //      "evet" demeden dışa aktarıma (SWOOD ZIP / rapor) DAHİL EDİLMEZ.
    //   2) Etiketleme Panelinde bulunan delikler LİSTELENİR — kullanıcı
    //      SolidWorks'teki gerçek parçayla GÖRSEL KARŞILAŞTIRMA yapıp
    //      onaylamalı, körlemesine CNC'ye gönderilmemelidir.
    // ════════════════════════════════════════════════════════════════════════
    public static class DelikFormCikarici
    {
        private const double MAKS_DELIK_CAP_MM = 60.0;  // bundan büyük silindirik yüzey = dış kontur/köşe yuvarlatma, delik SAYILMAZ
        private const double MIN_DELIK_CAP_MM = 1.5;    // ölçüm gürültüsü/çok küçük yüzeyleri ele
        private const double METRE_TO_MM = 1000.0;      // SolidWorks dahili birimi METREDİR
        private const double YAY_ADIM_RAD = Math.PI / 18; // yaylar ~10°'de bir noktayla çizilir
        private const int EGRI_ORNEK_SAYISI = 12;       // spline/elips gibi diğer eğriler için sabit örnek sayısı

        // Geriye dönük uyumluluk: delik + form (dış hat olmadan).
        public static (List<DelikBilgisi> delikler, List<FormBilgisi> formlar) Cikar(ModelDoc2 modelDoc, double kalinlikMm)
        {
            var g = GeometriCikar(modelDoc, kalinlikMm);
            return (g.Delikler, g.Formlar);
        }

        // KULLANICI İSTEĞİ: "gerçek dış hattı çiz" — ESKİ KÖK NEDEN: noktalar
        // parçanın HAM model koordinatından (x,y) alınıyordu. Parça orijine
        // göre ortalanmış/kaymışsa her şey plakada kayık; Üst/Sağ düzlemde
        // modellenmişse (yüzey normali Z değil) dış hat bir ÇİZGİYE
        // çöküyordu. Ayrıca her kenarın yalnızca "başlangıç" noktası
        // alınıyordu — SolidWorks'te kenar yönü loop boyunca tutarlı DEĞİLDİR,
        // köşeler atlanıp çokgen zikzak çizebilirdi.
        //
        // ŞİMDİ: en büyük düz yüzey referans alınır; tüm noktalar o yüzeyin
        // düzlemine izdüşürülüp yüzeyin sınır kutusunun sol-alt köşesine
        // (0,0) taşınır (DelikBilgisi'nin belgelenmiş sözleşmesi). Loop'lar
        // CoEdge sırasıyla gezilir, her kenar loop yönüne çevrilir, yaylar
        // ve eğriler örneklenerek noktalara açılır.
        public static ParcaGeometrisi GeometriCikar(ModelDoc2 modelDoc, double kalinlikMm)
        {
            var sonuc = new ParcaGeometrisi();
            try
            {
                var partDoc = modelDoc as PartDoc;
                if (partDoc == null) return sonuc;

                object[] govdelerObj = (object[])partDoc.GetBodies2((int)swBodyType_e.swSolidBody, true);
                if (govdelerObj == null || govdelerObj.Length == 0) return sonuc;

                var delikAdaylari = new List<(DelikBilgisi delik, double[] eksenNoktasi, double[] eksenYonu)>();
                Face2 enBuyukDuzYuz = null;
                double enBuyukAlanM2 = 0;

                foreach (Body2 govde in govdelerObj.Cast<Body2>())
                {
                    object[] yuzeylerObj = (object[])govde.GetFaces();
                    if (yuzeylerObj == null) continue;

                    foreach (Face2 yuz in yuzeylerObj.Cast<Face2>())
                    {
                        var aday = DelikAdayi(yuz);
                        if (aday.HasValue) delikAdaylari.Add(aday.Value);

                        // En büyük DÜZ yüzeyi ayrıca not al — panel/plaka
                        // parçalarda bu, ön veya arka yüzdür.
                        Surface yuzey = (Surface)yuz.GetSurface();
                        if (yuzey != null && yuzey.IsPlane())
                        {
                            double alan = yuz.GetArea();
                            if (alan > enBuyukAlanM2)
                            {
                                enBuyukAlanM2 = alan;
                                enBuyukDuzYuz = yuz;
                            }
                        }
                    }
                }

                var cerceve = enBuyukDuzYuz != null ? YuzeyCercevesi.Kur(enBuyukDuzYuz) : null;
                if (cerceve != null)
                {
                    sonuc.GenislikMm = cerceve.GenislikMm;
                    sonuc.YukseklikMm = cerceve.YukseklikMm;
                }

                foreach (var (delik, eksenNoktasi, eksenYonu) in delikAdaylari)
                {
                    if (cerceve != null)
                    {
                        var xy = cerceve.Izdusur(eksenNoktasi);
                        delik.XMm = xy[0];
                        delik.YMm = xy[1];
                        delik.YuzeyeDik = cerceve.NormaleParalel(eksenYonu);
                    }
                    else
                    {
                        // Çerçeve kurulamadı (düz yüzey yok) — eski davranış: ham X/Y.
                        delik.XMm = Math.Round(eksenNoktasi[0] * METRE_TO_MM, 2);
                        delik.YMm = Math.Round(eksenNoktasi[1] * METRE_TO_MM, 2);
                    }
                    // Derinliği parça kalınlığına yakın (±%10 tolerans) delikleri
                    // "tüm boyu" (through-hole) say — CNC'de bu bilgi işleme
                    // stratejisini (tek taraf/çift taraf) doğrudan etkiler.
                    if (kalinlikMm > 0) delik.TumBoyu = delik.DerinlikMm >= kalinlikMm * 0.9;
                    sonuc.Delikler.Add(delik);
                }

                if (cerceve != null) LooplariCikar(enBuyukDuzYuz, cerceve, sonuc);
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("DelikFormCikarici.GeometriCikar HATA (yakalandi, bos sonuc donduruldu): " + ex.Message);
                return new ParcaGeometrisi();
            }
            return sonuc;
        }

        // Referans yüzeyin düzlemi: normalin en baskın ekseni atılır, kalan
        // iki model ekseni (X/Y/Z sırasıyla) yerel X/Y olur; orijin yüzeyin
        // sınır kutusunun alt köşesidir. Mobilya panelleri pratikte hep model
        // eksenlerine hizalı olduğundan bu, gerçek izdüşümle aynı sonucu
        // verir — eğik modellenmiş bir parçada yaklaşık kalır.
        private class YuzeyCercevesi
        {
            private int _u, _v;
            private double _minU, _minV;
            private double[] _normal;
            public double GenislikMm, YukseklikMm;

            public static YuzeyCercevesi Kur(Face2 yuz)
            {
                double[] n = yuz.Normal as double[];
                double[] kutu = yuz.GetBox() as double[];
                if (n == null || n.Length < 3 || kutu == null || kutu.Length < 6) return null;
                double boy = Math.Sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
                if (boy < 1e-9) return null;

                int k = 0;
                for (int i = 1; i < 3; i++) if (Math.Abs(n[i]) > Math.Abs(n[k])) k = i;
                int u = k == 0 ? 1 : 0;
                int v = k == 2 ? 1 : 2;

                return new YuzeyCercevesi
                {
                    _u = u, _v = v,
                    _minU = Math.Min(kutu[u], kutu[u + 3]),
                    _minV = Math.Min(kutu[v], kutu[v + 3]),
                    _normal = new[] { n[0] / boy, n[1] / boy, n[2] / boy },
                    GenislikMm = Math.Round(Math.Abs(kutu[u + 3] - kutu[u]) * METRE_TO_MM, 2),
                    YukseklikMm = Math.Round(Math.Abs(kutu[v + 3] - kutu[v]) * METRE_TO_MM, 2)
                };
            }

            public double[] Izdusur(double[] p) => new[]
            {
                Math.Round((p[_u] - _minU) * METRE_TO_MM, 2),
                Math.Round((p[_v] - _minV) * METRE_TO_MM, 2)
            };

            public bool NormaleParalel(double[] yon)
            {
                double boy = Math.Sqrt(yon[0] * yon[0] + yon[1] * yon[1] + yon[2] * yon[2]);
                if (boy < 1e-9) return false;
                double nokta = (yon[0] * _normal[0] + yon[1] * _normal[1] + yon[2] * _normal[2]) / boy;
                return Math.Abs(nokta) > 0.99;
            }
        }

        private static (DelikBilgisi, double[], double[])? DelikAdayi(Face2 yuz)
        {
            try
            {
                Surface yuzey = (Surface)yuz.GetSurface();
                if (yuzey == null || !yuzey.IsCylinder()) return null;

                double[] parametreler = (double[])yuzey.CylinderParams;
                if (parametreler == null || parametreler.Length < 7) return null;

                double capMm = parametreler[6] * METRE_TO_MM * 2;
                if (capMm < MIN_DELIK_CAP_MM || capMm > MAKS_DELIK_CAP_MM) return null;

                var eksenNoktasi = new[] { parametreler[0], parametreler[1], parametreler[2] };
                var eksenYonu = new[] { parametreler[3], parametreler[4], parametreler[5] };

                // Derinlik: yüzün sınır kutusunun eksen yönündeki izdüşüm
                // uzunluğu (kaba ama makul bir yaklaşıklama — bkz. dosya başı
                // güvenilirlik notu).
                double[] kutu = (double[])yuz.GetBox();
                double derinlikMm = 0;
                if (kutu != null && kutu.Length >= 6)
                {
                    double dx = kutu[3] - kutu[0], dy = kutu[4] - kutu[1], dz = kutu[5] - kutu[2];
                    derinlikMm = Math.Abs(dx * eksenYonu[0] + dy * eksenYonu[1] + dz * eksenYonu[2]) * METRE_TO_MM;
                    if (derinlikMm < 0.01)
                    {
                        // Eksen tam XY/XZ/YZ düzleminde değilse kutu köşegeni
                        // yetersiz kalabilir — bu durumda kutunun en uzun
                        // kenarını KABA bir üst sınır olarak kullan.
                        derinlikMm = Math.Max(Math.Abs(dx), Math.Max(Math.Abs(dy), Math.Abs(dz))) * METRE_TO_MM;
                    }
                }

                var delik = new DelikBilgisi
                {
                    CapMm = Math.Round(capMm, 2),
                    DerinlikMm = Math.Round(derinlikMm, 2),
                    TumBoyu = false // GeometriCikar içinde parça kalınlığıyla karşılaştırılıp güncellenir
                };
                return (delik, eksenNoktasi, eksenYonu);
            }
            catch
            {
                // Tek bir yüzeyin okunması başarısız olsa bile diğer yüzeylerin
                // taranmasını engellemesin — bu yüzey sessizce atlanır.
                return null;
            }
        }

        // Dış loop → DisHat; iç loop'lar → Formlar. Yalnızca yay/dairelerden
        // oluşan ve delik çapı aralığındaki iç loop'lar, zaten silindirik
        // yüzeyden delik olarak bulunduğu için form olarak TEKRAR eklenmez.
        private static void LooplariCikar(Face2 duzYuz, YuzeyCercevesi cerceve, ParcaGeometrisi sonuc)
        {
            object[] looplarObj;
            try { looplarObj = (object[])duzYuz.GetLoops(); }
            catch (Exception ex)
            {
                Tanilama.Kaydet("DelikFormCikarici.LooplariCikar GetLoops HATA: " + ex.Message);
                return;
            }
            if (looplarObj == null) return;

            foreach (Loop2 loop in looplarObj.Cast<Loop2>())
            {
                try
                {
                    // GERÇEK SolidWorks 2025 derlemesinde doğrulandı: "IsOuter"
                    // bir PROPERTY değil, parametresiz bir METOT (CS0428).
                    bool dis = loop.IsOuter();
                    var noktalar = LoopNoktalari(loop, out bool hepsiDaire);
                    if (noktalar.Count < 3) continue;
                    var xy = noktalar.Select(cerceve.Izdusur).ToList();

                    if (dis)
                    {
                        sonuc.DisHat = xy;
                        continue;
                    }
                    if (hepsiDaire)
                    {
                        double cap = Math.Max(xy.Max(n => n[0]) - xy.Min(n => n[0]), xy.Max(n => n[1]) - xy.Min(n => n[1]));
                        if (cap >= MIN_DELIK_CAP_MM && cap <= MAKS_DELIK_CAP_MM) continue;
                    }
                    sonuc.Formlar.Add(new FormBilgisi { NoktalarXY = xy });
                }
                catch (Exception ex)
                {
                    // Tek bir loop başarısız olsa bile diğerlerini engellemesin.
                    Tanilama.Kaydet("DelikFormCikarici.LooplariCikar loop HATA (atlandi): " + ex.Message);
                }
            }
        }

        // Loop'un 3B noktaları, loop sırasıyla. Her CoEdge'in kenarı
        // örneklenir (doğru → iki uç, yay → ~10°'de bir, diğer eğri → sabit
        // sayıda), CoEdge yönüne (GetSense) çevrilir; yine de bir önceki
        // kenarın bitişine ters düşüyorsa (yön bilgisi güvenilmezse) ters
        // çevrilir. Her kenarın SON noktası, bir sonraki kenarın başlangıcıyla
        // aynı olduğu için eklenmez.
        private static List<double[]> LoopNoktalari(Loop2 loop, out bool hepsiDaire)
        {
            var noktalar = new List<double[]>();
            hepsiDaire = true;
            object[] coEdgelerObj = (object[])loop.GetCoEdges();
            if (coEdgelerObj == null) return noktalar;

            double[] oncekiBitis = null;
            foreach (CoEdge coEdge in coEdgelerObj.Cast<CoEdge>())
            {
                Edge kenar = (Edge)coEdge.GetEdge();
                if (kenar == null) continue;
                var kenarNoktalari = KenarNoktalari(kenar, out bool daire);
                if (kenarNoktalari.Count < 2) continue;
                if (!daire) hepsiDaire = false;

                if (!coEdge.GetSense()) kenarNoktalari.Reverse();
                if (oncekiBitis != null &&
                    Uzaklik(oncekiBitis, kenarNoktalari[kenarNoktalari.Count - 1]) < Uzaklik(oncekiBitis, kenarNoktalari[0]))
                {
                    kenarNoktalari.Reverse();
                }

                for (int i = 0; i < kenarNoktalari.Count - 1; i++) noktalar.Add(kenarNoktalari[i]);
                oncekiBitis = kenarNoktalari[kenarNoktalari.Count - 1];
            }
            return noktalar;
        }

        // Kenarın başlangıçtan bitişe 3B noktaları (metre).
        private static List<double[]> KenarNoktalari(Edge kenar, out bool daire)
        {
            var sonuc = new List<double[]>();
            daire = false;
            double[] prm = kenar.GetCurveParams2() as double[]; // [0..2]=başlangıç, [3..5]=bitiş, [6]=t başlangıç, [7]=t bitiş
            if (prm == null || prm.Length < 8) return sonuc;
            var bas = new[] { prm[0], prm[1], prm[2] };
            var bit = new[] { prm[3], prm[4], prm[5] };

            Curve egri = kenar.GetCurve() as Curve;
            if (egri == null || egri.IsLine())
            {
                sonuc.Add(bas);
                sonuc.Add(bit);
                return sonuc;
            }

            daire = egri.IsCircle();
            double t0 = prm[6], t1 = prm[7];
            int adim = daire
                ? Math.Max(2, (int)Math.Ceiling(Math.Abs(t1 - t0) / YAY_ADIM_RAD))
                : EGRI_ORNEK_SAYISI;
            for (int i = 0; i <= adim; i++)
            {
                double t = t0 + (t1 - t0) * i / adim;
                double[] p = egri.Evaluate2(t, 0) as double[];
                if (p == null || p.Length < 3) continue;
                sonuc.Add(new[] { p[0], p[1], p[2] });
            }
            if (sonuc.Count < 2)
            {
                sonuc.Clear();
                sonuc.Add(bas);
                sonuc.Add(bit);
                return sonuc;
            }
            // Eğri parametresi kenarla ters yönlüyse örnekler bitişten başlar.
            if (Uzaklik(sonuc[0], bit) < Uzaklik(sonuc[0], bas)) sonuc.Reverse();
            return sonuc;
        }

        private static double Uzaklik(double[] a, double[] b)
        {
            double dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
            return Math.Sqrt(dx * dx + dy * dy + dz * dz);
        }
    }
}
