using System;
using System.Collections.Generic;
using System.IO;
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

        private string PlakaOlustur(NestingPlakaSonucu plaka, int plakaNo, double plakaEn, double plakaBoy, string kod, string cikisKlasoru, string partSablonYolu)
        {
            try
            {
                Tanilama.Kaydet($"NestingYerlesimOlusturucu.PlakaOlustur(plaka={plakaNo}) basladi, {plaka.Yerlesenler.Count} parca");
                var belge = (ModelDoc2)_app.NewDocument(partSablonYolu, 0, 0, 0);
                if (belge == null) { _uyarilar.Add($"Plaka {plakaNo}: yeni parça dosyası açılamadı."); return null; }

                belge.Extension.SelectByID2("Top Plane", "PLANE", 0, 0, 0, false, 0, null, 0);
                belge.SketchManager.InsertSketch(true);

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
                    belge.SketchManager.CreateCornerRectangle(
                        oge.X * MM_TO_M, oge.Y * MM_TO_M, 0,
                        (oge.X + oge.W) * MM_TO_M, (oge.Y + oge.H) * MM_TO_M, 0);

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

                belge.SketchManager.InsertSketch(true); // sketch'i kapat

                string dosyaKodu = kod + "_NESTING_PLAKA" + plakaNo;
                KesimListesiCikarici.OzelAlanYaz(belge, OzelAlanlar.AD, dosyaKodu);

                string dosyaYolu = Path.Combine(cikisKlasoru, dosyaKodu + ".SLDPRT");
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
