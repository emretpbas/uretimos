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
    }

    // Tek bir form (cep/kesik/pah gibi dairesel OLMAYAN profil): kapalı
    // poligon köşe noktaları, parçanın KENDİ yerel düzleminde, mm.
    public class FormBilgisi
    {
        public List<double[]> NoktalarXY = new List<double[]>(); // [[x,y], [x,y], ...]
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
    //            noktalarına indirgenir (yay/eğri kenarlar başlangıç
    //            noktasına basitleştirilir — v1 YAKLAŞIKLAMASI, hassas CAM
    //            yolu üretimi için YETERLİ DEĞİLDİR, yalnızca nesting'de
    //            görsel/yer ayırma amaçlıdır).
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

        public static (List<DelikBilgisi> delikler, List<FormBilgisi> formlar) Cikar(ModelDoc2 modelDoc, double kalinlikMm)
        {
            var delikler = new List<DelikBilgisi>();
            var formlar = new List<FormBilgisi>();
            try
            {
                var partDoc = modelDoc as PartDoc;
                if (partDoc == null) return (delikler, formlar);

                object[] govdelerObj = (object[])partDoc.GetBodies2((int)swBodyType_e.swSolidBody, true);
                if (govdelerObj == null || govdelerObj.Length == 0) return (delikler, formlar);

                Face2 enBuyukDuzYuz = null;
                double enBuyukAlanM2 = 0;

                foreach (Body2 govde in govdelerObj.Cast<Body2>())
                {
                    object[] yuzeylerObj = (object[])govde.GetFaces();
                    if (yuzeylerObj == null) continue;

                    foreach (Face2 yuz in yuzeylerObj.Cast<Face2>())
                    {
                        DelikYuzeyiyseEkle(yuz, delikler);

                        // En büyük DÜZ yüzeyi ayrıca not al (form çıkarımı için) —
                        // panel/plaka parçalarda bu, ön veya arka yüzdür.
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

                if (enBuyukDuzYuz != null)
                {
                    FormlariCikar(enBuyukDuzYuz, formlar);
                }

                // Derinliği parça kalınlığına yakın (±%10 tolerans) delikleri
                // "tüm boyu" (through-hole) say — CNC'de bu bilgi işleme
                // stratejisini (tek taraf/çift taraf) doğrudan etkiler.
                if (kalinlikMm > 0)
                {
                    foreach (var d in delikler)
                    {
                        d.TumBoyu = d.DerinlikMm >= kalinlikMm * 0.9;
                    }
                }
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("DelikFormCikarici.Cikar HATA (yakalandi, bos liste donduruldu): " + ex.Message);
                return (new List<DelikBilgisi>(), new List<FormBilgisi>());
            }
            return (delikler, formlar);
        }

        private static void DelikYuzeyiyseEkle(Face2 yuz, List<DelikBilgisi> delikler)
        {
            try
            {
                Surface yuzey = (Surface)yuz.GetSurface();
                if (yuzey == null || !yuzey.IsCylinder()) return;

                double[] parametreler = (double[])yuzey.CylinderParams;
                if (parametreler == null || parametreler.Length < 7) return;

                double yaricapMm = parametreler[6] * METRE_TO_MM;
                double capMm = yaricapMm * 2;
                if (capMm < MIN_DELIK_CAP_MM || capMm > MAKS_DELIK_CAP_MM) return;

                double eksenX = parametreler[0], eksenY = parametreler[1], eksenZ = parametreler[2];
                double yonX = parametreler[3], yonY = parametreler[4], yonZ = parametreler[5];

                // Derinlik: yüzün sınır kutusunun eksen yönündeki izdüşüm
                // uzunluğu (kaba ama makul bir yaklaşıklama — bkz. dosya başı
                // güvenilirlik notu).
                double[] kutu = (double[])yuz.GetBox();
                double derinlikMm = 0;
                if (kutu != null && kutu.Length >= 6)
                {
                    double dx = kutu[3] - kutu[0], dy = kutu[4] - kutu[1], dz = kutu[5] - kutu[2];
                    // Kutu köşegeninin eksen yönüne izdüşümü (nokta çarpımı, |yon|=1 varsayılır)
                    derinlikMm = Math.Abs(dx * yonX + dy * yonY + dz * yonZ) * METRE_TO_MM;
                    if (derinlikMm < 0.01)
                    {
                        // Eksen tam XY/XZ/YZ düzleminde değilse kutu köşegeni
                        // yetersiz kalabilir — bu durumda kutunun en uzun
                        // kenarını KABA bir üst sınır olarak kullan.
                        derinlikMm = Math.Max(Math.Abs(dx), Math.Max(Math.Abs(dy), Math.Abs(dz))) * METRE_TO_MM;
                    }
                }

                delikler.Add(new DelikBilgisi
                {
                    XMm = Math.Round(eksenX * METRE_TO_MM, 2),
                    YMm = Math.Round(eksenY * METRE_TO_MM, 2),
                    CapMm = Math.Round(capMm, 2),
                    DerinlikMm = Math.Round(derinlikMm, 2),
                    TumBoyu = false // Cikar() içinde parça kalınlığıyla karşılaştırılıp güncellenir
                });
            }
            catch
            {
                // Tek bir yüzeyin okunması başarısız olsa bile diğer yüzeylerin
                // taranmasını engellemesin — bu yüzey sessizce atlanır.
            }
        }

        private static void FormlariCikar(Face2 duzYuz, List<FormBilgisi> formlar)
        {
            try
            {
                object[] looplarObj = (object[])duzYuz.GetLoops();
                if (looplarObj == null) return;

                foreach (Loop2 loop in looplarObj.Cast<Loop2>())
                {
                    if (loop.IsOuterLoop()) continue; // dış sınır = parçanın kendi kenarı, form DEĞİL

                    object[] kenarlarObj = (object[])loop.GetEdges();
                    if (kenarlarObj == null || kenarlarObj.Length == 0) continue;

                    var form = new FormBilgisi();
                    foreach (Edge2 kenar in kenarlarObj.Cast<Edge2>())
                    {
                        // v1 YAKLAŞIKLAMASI: her kenarın yalnızca BAŞLANGIÇ
                        // noktası alınır (yay/eğrilerin tam profili değil) —
                        // nesting'de "burada bir kesik/cep var, alan ayır"
                        // amacına yeter, hassas CAM yolu üretmez.
                        Vertex bas = (Vertex)kenar.IGetStartVertex();
                        if (bas == null) continue;
                        double[] nokta = (double[])bas.GetPoint();
                        if (nokta == null || nokta.Length < 2) continue;
                        form.NoktalarXY.Add(new[] { Math.Round(nokta[0] * METRE_TO_MM, 2), Math.Round(nokta[1] * METRE_TO_MM, 2) });
                    }
                    if (form.NoktalarXY.Count >= 3) formlar.Add(form);
                }
            }
            catch
            {
                // Form çıkarımı başarısız olursa delik verisini ETKİLEMESİN —
                // formlar boş liste olarak kalır, delikler yine de kullanılabilir.
            }
        }
    }
}
