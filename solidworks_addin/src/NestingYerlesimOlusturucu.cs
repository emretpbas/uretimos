using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // NESTİNG YERLEŞİM OLUŞTURUCU — kullanıcı isteği: "ÜretimOS'ta istemiyorum,
    // SolidWorks'te oluşturup düzenleyip DXF alacağız optimize edilmiş nesting
    // çıktısını" — NestingHesaplayici'nin hesapladığı yerleşimi, her plaka için
    // AYRI bir SolidWorks parça (.SLDPRT) dosyasında, DÜZENLENEBİLİR bir sketch
    // olarak çizer (plaka sınırı + her parçanın konturu). Dosya KAPATILMAZ —
    // kullanıcı SolidWorks içinde açık bırakılan bu dosyada gerekirse elle
    // düzenleme yapıp, ardından SolidWorks'ün KENDİ "Dosya > Farklı Kaydet >
    // DXF/DWG" (sketch düzenleme modundayken) özelliğiyle DXF'e aktarır —
    // DelikFormCikarici.cs'teki ÖZEL ALANLAR GİBİ, ayrı/doğrulanmamış bir DXF
    // dışa aktarma COM API'si (ör. ExportToDWG2) TAHMİN EDİLMEDİ; SolidWorks'ün
    // kendi, kullanıcıların zaten bildiği standart menü akışı tercih edildi.
    //
    // GÜVENİLİRLİK UYARISI (AltiYuzKutuOlusturucu.cs'teki AYNI ilke):
    // NewDocument/SelectByID2/InsertSketch/CreateCornerRectangle/SaveAs
    // çağrıları BURADA AltiYuzKutuOlusturucu.cs'te GERÇEK SolidWorks 2017
    // derlemesinde ZATEN DOĞRULANMIŞ olan AYNI çağrılardır (aynı imza, aynı
    // birim [metre]) — yeni/doğrulanmamış bir API yüzeyi EKLENMEDİ.
    // ════════════════════════════════════════════════════════════════════════
    public class NestingYerlesimOlusturucu
    {
        private readonly ISldWorks _app;
        private readonly List<string> _uyarilar = new List<string>();
        public IReadOnlyList<string> Uyarilar => _uyarilar;

        public NestingYerlesimOlusturucu(ISldWorks app) { _app = app; }

        private const double MM_TO_M = 0.001; // SolidWorks dahili birimi METREDİR

        // Her plaka için ayrı bir .SLDPRT üretir, dosyaları KAPATMADAN döner
        // (kullanıcı SolidWorks'te üzerinde çalışmaya devam etsin). Başarısız
        // olan bir plaka varsa o atlanır (Uyarilar'a eklenir), diğerleri
        // yine de üretilmeye çalışılır.
        public List<string> Olustur(NestingSonucu sonuc, double plakaEn, double plakaBoy, string kod, string cikisKlasoru, string partSablonYolu)
        {
            _uyarilar.Clear();
            var uretilenDosyalar = new List<string>();
            if (sonuc == null || sonuc.Plakalar.Count == 0)
            {
                _uyarilar.Add("Yerleştirilecek plaka/parça yok.");
                return uretilenDosyalar;
            }
            Directory.CreateDirectory(cikisKlasoru);

            for (int i = 0; i < sonuc.Plakalar.Count; i++)
            {
                string dosyaYolu = PlakaOlustur(sonuc.Plakalar[i], i + 1, plakaEn, plakaBoy, kod, cikisKlasoru, partSablonYolu);
                if (dosyaYolu != null) uretilenDosyalar.Add(dosyaYolu);
            }
            return uretilenDosyalar;
        }

        // Kullanıcı isteği: "nestingdeki parçanın üzerine yarımamül kodu ve
        // adı, ayrıca solidworks parça adını da yazalım". Yazılar kesim
        // sketch'ine DEĞİL, ayrı bir "ETIKETLER" sketch'ine konur — CAM/DXF
        // tarafında kesim konturu sanılmasın, gerekirse tek tıkla
        // gizlenebilsin/silinebilsin. Her parçanın ortasına 3 satır: YM kodu,
        // ad, SolidWorks parça adı. Yazı yüksekliği parçanın kısa kenarına
        // göre ölçeklenir. Etiket başarısız olsa bile plaka yine kaydedilir.
        private const double KARAKTER_EN_ORANI = 0.85; // harf genişliği / yazı yüksekliği — ekran görüntüsünden ~0,8 ölçüldü, pay bırakıldı

        private void EtiketSketchiOlustur(ModelDoc2 belge, NestingPlakaSonucu plaka, int plakaNo)
        {
            try
            {
                belge.ClearSelection2(true);
                belge.Extension.SelectByID2("Top Plane", "PLANE", 0, 0, 0, false, 0, null, 0);
                belge.SketchManager.InsertSketch(true);

                foreach (var oge in plaka.Yerlesenler)
                {
                    var satirlar = new List<string>();
                    if (!string.IsNullOrWhiteSpace(oge.YmKod)) satirlar.Add(oge.YmKod);
                    if (!string.IsNullOrWhiteSpace(oge.Ad) && oge.Ad != oge.YmKod) satirlar.Add(oge.Ad);
                    if (!string.IsNullOrWhiteSpace(oge.SwParcaAdi) && oge.SwParcaAdi != oge.Ad) satirlar.Add("SW: " + oge.SwParcaAdi);
                    if (satirlar.Count == 0) continue;

                    // Kullanıcı isteği: "parça ismi ve tüm yazılar uzun kenara
                    // göre hizalanıp parça ölçüsüne sığdırılsın". Yazı yönü =
                    // parçanın uzun kenarının plakadaki yönü; okunaklı kalsın
                    // diye (-90°, 90°] aralığına çevrilir (baş aşağı yazı yok).
                    bool enUzun = oge.ParcaEn >= oge.ParcaBoy;
                    double uzunKenar = enUzun ? oge.ParcaEn : oge.ParcaBoy;
                    double kisaKenar = enUzun ? oge.ParcaBoy : oge.ParcaEn;
                    double yaziAci = oge.AciDerece + (enUzun ? 0 : 90);
                    yaziAci = ((yaziAci % 360) + 360) % 360;
                    if (yaziAci > 90 && yaziAci <= 270) yaziAci -= 180;
                    else if (yaziAci > 270) yaziAci -= 360;

                    // KULLANICI İSTEĞİ: "tamamen parçanın büyüklüğüne göre font
                    // büyüklüğü ayarlansın" — üst sınır (eski 30 mm) yok; en uzun
                    // satır uzun kenarın %85'ine, tüm satırlar (satır aralığı
                    // dahil) kısa kenarın %60'ına sığar. 3 mm'nin altına düşerse
                    // alttaki satırlar atılır, YM kodu her zaman kalır.
                    double YaziBoyu(double boyKenar, double enKenar)
                    {
                        int enUzunSatir = satirlar.Max(t => t.Length);
                        double satirSayisiYuksekligi = 1.0 + 1.5 * (satirlar.Count - 1);
                        return Math.Min(boyKenar * 0.85 / Math.Max(1, enUzunSatir * KARAKTER_EN_ORANI),
                                        enKenar * 0.6 / satirSayisiYuksekligi);
                    }
                    double yaziMm;
                    while (true)
                    {
                        yaziMm = YaziBoyu(uzunKenar, kisaKenar);
                        if (yaziMm >= 3.0 || satirlar.Count == 1) break;
                        satirlar.RemoveAt(satirlar.Count - 1);
                    }

                    // KULLANICI RAPORU (iki kez): Escapement ile açı verildiğinde
                    // SolidWorks biçimi kabul etmiş görünüyor (geri okununca
                    // açı/boy doğru) ama ekranda yazı YATAY ve VARSAYILAN boyda
                    // kalıyor; <rN> etiketi ise harfleri tek tek döndürüyor.
                    // Bu yüzden: yazı yatay eklenir, yalnızca boyu verilir, sonra
                    // seçilip ekleme noktası etrafında sketch döndürmesiyle
                    // (RotateOrCopy) çevrilir. Döndürme yapılamazsa yazı yatay
                    // bırakılır ve parçanın PLAKADAKİ genişliğine sığacak
                    // boyda, yatay ortalanmış olarak yeniden konumlanır.
                    double rad = yaziAci * Math.PI / 180.0;
                    bool dondurulebilir = true;
                    string aciYolu = Math.Abs(rad) < 1e-6 ? "yatay" : "dondurme";
                    for (int i = 0; i < satirlar.Count; i++)
                    {
                        double boy = yaziMm, a = dondurulebilir ? rad : 0;
                        if (!dondurulebilir) boy = YaziYatayBoyu(oge, satirlar);
                        var (x, y) = SatirKonumu(oge, satirlar, i, boy, a);
                        // Döndürme parça merkezi etrafında yapılır: yazı, döndürülünce
                        // (x, y)'ye gelecek noktaya (x0, y0) yatay eklenir. Böylece
                        // döndürmenin GERÇEKTEN uygulandığı ekleme noktasının yer
                        // değiştirmesinden doğrulanabilir (RotateOrCopy void döner).
                        double cos = Math.Cos(-a), sin = Math.Sin(-a);
                        double x0 = oge.MerkezX + (x - oge.MerkezX) * cos - (y - oge.MerkezY) * sin;
                        double y0 = oge.MerkezY + (x - oge.MerkezX) * sin + (y - oge.MerkezY) * cos;
                        if (Math.Abs(a) < 1e-6) { x0 = x; y0 = y; }
                        // Son iki parametre YÜZDE: genişlik çarpanı 100, harf
                        // aralığı 100 (0 verilince harfler üst üste biniyordu).
                        var yazi = belge.InsertSketchText(x0 * MM_TO_M, y0 * MM_TO_M, 0, satirlar[i], 0, 0, 0, 100, 100) as SketchText;
                        if (yazi == null) { Tanilama.Kaydet($"Nesting etiketi '{oge.Ad}': InsertSketchText null döndü"); continue; }
                        if (!BoyUygula(yazi, boy))
                            Tanilama.Kaydet($"Nesting etiketi '{oge.Ad}' satır {i + 1}: SetTextFormat BAŞARISIZ — yazı varsayılan boyda kalır");
                        if (Math.Abs(a) < 1e-6) continue;
                        if (SketchDondur(belge, yazi, oge.MerkezX, oge.MerkezY, a) &&
                            yazi.GetCoordinates() is double[] k && k.Length >= 2 &&
                            Math.Abs(k[0] / MM_TO_M - x) < 0.5 && Math.Abs(k[1] / MM_TO_M - y) < 0.5) continue;

                        // Döndürülemedi: bu ve sonraki satırlar yatay.
                        var okunanK = yazi.GetCoordinates() as double[];
                        Tanilama.Kaydet($"Nesting etiketi '{oge.Ad}': döndürme doğrulanamadı — beklenen ({x:0.#}, {y:0.#}) mm, okunan " +
                            (okunanK != null && okunanK.Length >= 2 ? $"({okunanK[0] / MM_TO_M:0.#}, {okunanK[1] / MM_TO_M:0.#})" : "yok") + " — yatay yazıya geçiliyor");
                        dondurulebilir = false;
                        aciYolu = "BASARISIZ → yatay";
                        boy = YaziYatayBoyu(oge, satirlar);
                        var (yx, yy) = SatirKonumu(oge, satirlar, i, boy, 0);
                        try { yazi.SetCoordinates(yx * MM_TO_M, yy * MM_TO_M, 0); } catch { }
                        BoyUygula(yazi, boy);
                    }
                    Tanilama.Kaydet($"Nesting etiketi '{oge.Ad}': açı yolu={aciYolu}");
                    Tanilama.Kaydet($"Nesting etiketi plaka={plakaNo} '{oge.Ad}': aci={yaziAci:0.#}° yazi={yaziMm:0.#}mm satir={satirlar.Count}");
                }

                belge.SketchManager.InsertSketch(true);
                var etiketSketchi = belge.FeatureByPositionReverse(0) as Feature;
                if (etiketSketchi != null) etiketSketchi.Name = "ETIKETLER";
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet($"NestingYerlesimOlusturucu.EtiketSketchiOlustur(plaka={plakaNo}) HATA (plaka yine kaydedilecek): " + ex);
                try { if (belge.SketchManager.ActiveSketch != null) belge.SketchManager.InsertSketch(true); } catch { }
            }
        }

        private static bool BoyUygula(SketchText yazi, double yaziMm)
        {
            var bicim = yazi.GetTextFormat() as TextFormat;
            if (bicim == null) return false;
            bicim.CharHeight = yaziMm * MM_TO_M;
            return yazi.SetTextFormat(false, bicim);
        }

        // Döndürme yapılamadığında yatay yazı boyu: parçanın plakadaki sınır
        // kutusuna (W yatay, H dikey) göre.
        private static double YaziYatayBoyu(NestingYerlesimOgesi oge, List<string> satirlar)
        {
            int enUzunSatir = satirlar.Max(t => t.Length);
            double satirSayisiYuksekligi = 1.0 + 1.5 * (satirlar.Count - 1);
            return Math.Max(1.0, Math.Min(oge.W * 0.85 / Math.Max(1, enUzunSatir * KARAKTER_EN_ORANI),
                                          oge.H * 0.6 / satirSayisiYuksekligi));
        }

        // i. satırın sol-alt ekleme noktası (mm, plaka): satırlar parça
        // merkezine göre ortalanır; u = yazı yönü, v = yazıya dik (yukarı).
        private static (double x, double y) SatirKonumu(NestingYerlesimOgesi oge, List<string> satirlar, int i, double yaziMm, double rad)
        {
            double ux = Math.Cos(rad), uy = Math.Sin(rad), vx = -uy, vy = ux;
            double satirAraligiMm = yaziMm * 1.5;
            double ustOfset = satirAraligiMm * (satirlar.Count - 1) / 2.0;
            double tahminiGenislik = satirlar[i].Length * yaziMm * KARAKTER_EN_ORANI;
            double dikOfset = ustOfset - i * satirAraligiMm - yaziMm / 2.0;
            return (oge.MerkezX - ux * tahminiGenislik / 2.0 + vx * dikOfset,
                    oge.MerkezY - uy * tahminiGenislik / 2.0 + vy * dikOfset);
        }

        // Yazıyı seçip (xMm, yMm) noktası etrafında sketch döndürmesi
        // (IModelDocExtension.RotateOrCopy, eksen Z) uygular. Sonuç çağıran
        // tarafta ekleme noktasının yeni konumundan doğrulanır.
        private static bool SketchDondur(ModelDoc2 belge, SketchText yazi, double xMm, double yMm, double rad)
        {
            try
            {
                var varlik = yazi as Entity;
                if (varlik == null) return false;
                belge.ClearSelection2(true);
                if (!varlik.Select4(false, null)) return false;
                // RotateOrCopy void döner — sonucu doğrulanamaz; istisna
                // atmadıysa uygulandı sayılır (log'da "dondurme").
                belge.Extension.RotateOrCopy(false, 1, false, xMm * MM_TO_M, yMm * MM_TO_M, 0, 0, 0, 1, rad);
                belge.ClearSelection2(true);
                return true;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("NestingYerlesimOlusturucu.SketchDondur HATA: " + ex.Message);
                return false;
            }
        }

        private string PlakaOlustur(NestingPlakaSonucu plaka, int plakaNo, double plakaEn, double plakaBoy, string kod, string cikisKlasoru, string partSablonYolu)
        {
            try
            {
                Tanilama.Kaydet($"NestingYerlesimOlusturucu.PlakaOlustur(plaka={plakaNo}) basladi, {plaka.Yerlesenler.Count} parca");
                var belge = (ModelDoc2)_app.NewDocument(partSablonYolu, 0, 0, 0);
                if (belge == null) { _uyarilar.Add($"Plaka {plakaNo}: yeni parça dosyası açılamadı."); return null; }

                belge.Extension.SelectByID2("Top Plane", "PLANE", 0, 0, 0, false, 0, null, 0);
                belge.SketchManager.InsertSketch(true);

                // AddToDB: çizilen öğeler SolidWorks'ün yakalama/çıkarım
                // (snap/inference) mantığından GEÇMEDEN doğrudan eklenir —
                // aksi halde dış hattaki/yaylardaki birbirine yakın noktalar
                // yakındaki çizgilere yapışıp şekli bozabiliyor ve yüzlerce
                // öğede çizim belirgin şekilde yavaşlıyor.
                belge.SketchManager.AddToDB = true;
                belge.SketchManager.DisplayWhenAdded = false;

                // Plaka sınırı — referans, kesilmeyecek (CAM operatörü bunu
                // AltiYuzKutuOlusturucu'daki panel dikdörtgenlerinden ayırt
                // edebilsin diye KASITLI OLARAK aynı sketch'te, en dışta).
                belge.SketchManager.CreateCornerRectangle(0, 0, 0, plakaEn * MM_TO_M, plakaBoy * MM_TO_M, 0);

                // Her yerleşen parça kendi dikdörtgeni — TEK YÜZEY KURALI
                // (bkz. NestingHesaplayici dosya başı notu): burada hiçbir
                // ayna/flip uygulanmaz, yalnızca Hesapla() içinde zaten
                // kararlaştırılmış (döndürülmüş veya düz) W×H boyutu çizilir.
                foreach (var oge in plaka.Yerlesenler)
                {
                    Tanilama.Kaydet($"NestingYerlesimOlusturucu plaka={plakaNo} '{oge.Ad}': X={oge.X} Y={oge.Y} W={oge.W} H={oge.H} " +
                        $"aci={oge.AciDerece:0.#} dishat={oge.DisHat.Count} delik={oge.Delikler.Count} form={oge.Formlar.Count}");
                    // KULLANICI RAPORU: "parçalarda yaptığım değişiklikler ne
                    // ölçüsel ne formsal olarak değişmiyor" — kenarına kertik/
                    // çentik işlenmiş parçalar artık düz dikdörtgen DEĞİL,
                    // DelikFormCikarici.GeometriCikar'ın çıkardığı GERÇEK dış hat
                    // olarak çizilir. Çıkarım yapılmadıysa/başarısızsa (DisHat
                    // boş — TAHMİN EDİLMEZ) düz dikdörtgene GERİ DÜŞÜLÜR.
                    if (oge.DisHat.Count >= 3)
                    {
                        for (int i = 0; i < oge.DisHat.Count; i++)
                        {
                            var p1 = oge.DisHat[i];
                            var p2 = oge.DisHat[(i + 1) % oge.DisHat.Count];
                            belge.SketchManager.CreateLine(p1.x * MM_TO_M, p1.y * MM_TO_M, 0, p2.x * MM_TO_M, p2.y * MM_TO_M, 0);
                        }
                    }
                    else
                    {
                        belge.SketchManager.CreateCornerRectangle(
                            oge.X * MM_TO_M, oge.Y * MM_TO_M, 0,
                            (oge.X + oge.W) * MM_TO_M, (oge.Y + oge.H) * MM_TO_M, 0);
                    }

                    // KULLANICI RAPORU: "parçaların üzerindeki delikler de
                    // çıkmadı" — delik merkezleri NestingHesaplayici'de ZATEN
                    // plaka mutlak koordinatına dönüştürülmüş durumda (bkz. o
                    // dosyadaki delikKoordDonustur mantığı). GÜVENİLİRLİK
                    // UYARISI (DelikFormCikarici.cs ile AYNI ilke):
                    // ISketchManager.CreateCircle BU DOSYADA/projede İLK KEZ
                    // kullanılıyor, SaveAs/CreateCornerRectangle'ın aksine
                    // GERÇEK bir SolidWorks derlemesinde HENÜZ doğrulanmadı —
                    // standart dokümante imza (Xc,Yc,Zc, Xp,Yp,Zp — merkez +
                    // çember üzerinde bir nokta) kullanıldı; yanlışsa en
                    // olası sonuç bir DERLEME HATASIDIR (güvenli).
                    foreach (var delik in oge.Delikler)
                    {
                        double r = delik.cap / 2.0;
                        belge.SketchManager.CreateCircle(
                            delik.x * MM_TO_M, delik.y * MM_TO_M, 0,
                            (delik.x + r) * MM_TO_M, delik.y * MM_TO_M, 0);
                    }

                    // KULLANICI RAPORU: "ne delik ne kanal çıktı" — dairesel
                    // OLMAYAN formlar (cep/kesik/kanal, bkz. DelikFormCikarici.
                    // FormBilgisi) kapalı bir nokta dizisi olarak CreateLine ile
                    // (ardışık noktaları birleştirip son noktayı ilkine kapatarak)
                    // çizilir — CreateCircle'daki AYNI GÜVENİLİRLİK UYARISI
                    // geçerli (bu projede İLK KEZ kullanılan, henüz gerçek
                    // derlemede doğrulanmamış bir çağrı).
                    foreach (var form in oge.Formlar)
                    {
                        if (form.Count < 2) continue;
                        for (int i = 0; i < form.Count; i++)
                        {
                            var p1 = form[i];
                            var p2 = form[(i + 1) % form.Count];
                            belge.SketchManager.CreateLine(p1.x * MM_TO_M, p1.y * MM_TO_M, 0, p2.x * MM_TO_M, p2.y * MM_TO_M, 0);
                        }
                    }
                }

                belge.SketchManager.AddToDB = false;
                belge.SketchManager.DisplayWhenAdded = true;
                belge.SketchManager.InsertSketch(true); // sketch'i kapat

                EtiketSketchiOlustur(belge, plaka, plakaNo);

                string dosyaKodu = kod + "_NESTING_PLAKA" + plakaNo;
                KesimListesiCikarici.OzelAlanYaz(belge, OzelAlanlar.AD, dosyaKodu);

                string dosyaYolu = Path.Combine(cikisKlasoru, dosyaKodu + ".SLDPRT");
                // KULLANICI TESTİ (log: SaveAs basarili=False hata=1): önceki
                // nesting'in aynı adlı plakası SolidWorks'te hâlâ açıkken
                // (aşağıdaki not: plaka bilerek açık bırakılıyor) üzerine
                // kaydedilemiyordu. Açık olanı kapatmak kullanıcının o dosyadaki
                // düzenlemelerini kaybettirebilir — bunun yerine sıradaki boş
                // ad (_2, _3 …) seçilir.
                for (int ek = 2; _app.GetOpenDocumentByName(dosyaYolu) != null && ek < 100; ek++)
                    dosyaYolu = Path.Combine(cikisKlasoru, dosyaKodu + "_" + ek + ".SLDPRT");
                int hata = 0, uyariKod = 0;
                // SaveAs imzası: bkz. AltiYuzKutuOlusturucu.cs'teki AYNI NOT —
                // gerçek derlemede CS7036 ile doğrulanmış 6 parametreli imza.
                bool basarili = belge.Extension.SaveAs(dosyaYolu, (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref hata, ref uyariKod);
                Tanilama.Kaydet($"NestingYerlesimOlusturucu.PlakaOlustur(plaka={plakaNo}) SaveAs basarili={basarili} hata={hata}");
                if (!basarili)
                {
                    _uyarilar.Add($"Plaka {plakaNo}: dosya kaydedilemedi (SaveAs hata kodu: {hata}).");
                    return null;
                }
                // NOT: AltiYuzKutuOlusturucu'nun aksine burada _app.CloseDoc
                // ÇAĞRILMAZ — kullanıcı isteği ("düzenleyip DXF alacağız")
                // gereği dosya SolidWorks'te AÇIK bırakılır.
                return dosyaYolu;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet($"NestingYerlesimOlusturucu.PlakaOlustur(plaka={plakaNo}) HATA: " + ex);
                _uyarilar.Add($"Plaka {plakaNo} oluşturulurken hata: {ex.Message}");
                return null;
            }
        }
    }
}
