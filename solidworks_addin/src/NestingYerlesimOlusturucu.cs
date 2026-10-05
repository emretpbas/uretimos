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
        private const double KARAKTER_EN_ORANI = 0.7; // ortalama harf genişliği / yazı yüksekliği (tahmini)

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

                    // Sığdırma: en uzun satır uzun kenarın %90'ına, tüm satırlar
                    // (satır aralığı dahil) kısa kenarın %80'ine sığmalı; en çok
                    // 30 mm. 3 mm'nin altına düşüyorsa alttaki satır (önce "SW:",
                    // sonra ad) atılır — YM kodu her zaman kalır ve ne kadar
                    // küçük olursa olsun parçanın İÇİNDE kalır.
                    double yaziMm;
                    while (true)
                    {
                        int enUzunSatir = satirlar.Max(t => t.Length);
                        double satirSayisiYuksekligi = 1.0 + 1.5 * (satirlar.Count - 1);
                        yaziMm = Math.Min(30.0, uzunKenar * 0.9 / Math.Max(1, enUzunSatir * KARAKTER_EN_ORANI));
                        yaziMm = Math.Min(yaziMm, kisaKenar * 0.8 / satirSayisiYuksekligi);
                        if (yaziMm >= 3.0 || satirlar.Count == 1) break;
                        satirlar.RemoveAt(satirlar.Count - 1);
                    }
                    double satirAraligiMm = yaziMm * 1.5;

                    // Yazının kendi ekseninde: u = yazı yönü, v = yazıya dik
                    // (yukarı). Satırlar parça merkezine göre ortalanır.
                    double rad = yaziAci * Math.PI / 180.0;
                    double ux = Math.Cos(rad), uy = Math.Sin(rad);
                    double vx = -uy, vy = ux;
                    double ustOfset = satirAraligiMm * (satirlar.Count - 1) / 2.0;

                    for (int i = 0; i < satirlar.Count; i++)
                    {
                        // Sol-alt hizalı yazı: yaklaşık genişliğin yarısı kadar
                        // yazı yönünün tersine kaydırılarak merkeze getirilir.
                        double tahminiGenislik = satirlar[i].Length * yaziMm * KARAKTER_EN_ORANI;
                        double dikOfset = ustOfset - i * satirAraligiMm - yaziMm / 2.0;
                        double x = oge.MerkezX - ux * tahminiGenislik / 2.0 + vx * dikOfset;
                        double y = oge.MerkezY - uy * tahminiGenislik / 2.0 + vy * dikOfset;
                        // Son iki parametre YÜZDE: genişlik çarpanı 100, harf
                        // aralığı 100. (KULLANICI RAPORU: "yazılar okunmuyor" —
                        // harf aralığı 0 verilmişti, tüm harfler üst üste
                        // biniyordu.)
                        // KULLANICI RAPORU: "yazılar kocaman çıkmış" — açı
                        // Escapement ile verildiğinde biçim hiç uygulanmamıştı
                        // (dönüş değeri kontrol edilmiyordu). BicimUygula artık
                        // başarısızsa açısız tekrar dener, boy her durumda tutar.
                        // KULLANICI RAPORU: "yazılar dikey değil ve okunmuyor,
                        // parça resminden dışarı çıkmış" — <rN> etiketi her
                        // KARAKTERİ ayrı döndürüyor, satır yatay kalıyordu
                        // (harfler yan yatıp satır parçadan taşıyordu). Satır
                        // yatay eklenir, açısı önce TextFormat.Escapement ile
                        // verilir; geri okununca tutmamışsa yazı seçilip ekleme
                        // noktası etrafında sketch döndürmesiyle çevrilir.
                        var yazi = belge.InsertSketchText(x * MM_TO_M, y * MM_TO_M, 0, satirlar[i], 0, 0, 0, 100, 100) as SketchText;
                        if (yazi == null) { Tanilama.Kaydet($"Nesting etiketi '{oge.Ad}': InsertSketchText null döndü"); continue; }
                        bool bicimTamam = BicimUygula(yazi, yaziMm, rad);
                        if (!bicimTamam && Math.Abs(rad) > 1e-6) bicimTamam = BicimUygula(yazi, yaziMm, 0); // açısız tekrar dene — en azından boy tutsun
                        if (!bicimTamam)
                            Tanilama.Kaydet($"Nesting etiketi '{oge.Ad}' satır {i + 1}: SetTextFormat BAŞARISIZ — yazı varsayılan boyda kalır");

                        string aciYolu = "yok";
                        if (Math.Abs(rad) > 1e-6)
                        {
                            var okunan = yazi.GetTextFormat() as TextFormat;
                            if (okunan != null && Math.Abs(okunan.Escapement - rad) < 0.01)
                                aciYolu = "escapement";
                            else
                                aciYolu = SketchDondur(belge, yazi, x, y, rad) ? "dondurme" : "BASARISIZ";
                        }
                        if (i == 0) Tanilama.Kaydet($"Nesting etiketi '{oge.Ad}': açı yolu={aciYolu}");
                    }
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

        private static bool BicimUygula(SketchText yazi, double yaziMm, double rad)
        {
            var bicim = yazi.GetTextFormat() as TextFormat;
            if (bicim == null) return false;
            bicim.CharHeight = yaziMm * MM_TO_M;
            bicim.Escapement = rad;
            return yazi.SetTextFormat(false, bicim);
        }

        // Escapement tutmadığında yedek yol: yazıyı seçip ekleme noktası
        // (xMm, yMm) etrafında sketch döndürmesi (IModelDocExtension.
        // RotateOrCopy, eksen Z) uygular.
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
