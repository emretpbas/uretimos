using System;
using System.Collections.Generic;
using System.IO;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // KUTU YERLEŞTİRME YÖNETİCİSİ — kullanıcı isteği: "Box özerk ve kendi alt
    // montaj ve part dosyalarını oluştursun ancak box her sürükle bırakta yine
    // özerk dosya haline gelsin ve başka dosyalarda değişerek karışıklık
    // çıkarmasın" — HER yerleştirmede box'ın montaj+parça dosyaları YENİ,
    // BAĞIMSIZ adlarla kopyalanır (aynı şablona bağlı KALMAZ) — bir kopyayı
    // düzenlemek diğerlerini ETKİLEMEZ.
    //
    // YÖNTEM: SolidWorks'ün TAM DA bu iş için var olan resmi API'si —
    // IPackAndGo ("Farklı Kaydet" gibi ama bir montajın TÜM alt dosyalarını
    // birden, aralarındaki referansları OTOMATİK düzelterek kopyalar). Bu,
    // dosyaları elle kopyalayıp "dangling reference" (kırık referans) riski
    // almaktan çok daha güvenlidir — SolidWorks'ün KENDİ resmi çözümüdür.
    //
    // ════ GÜVENİLİRLİK UYARISI (bu dosyadaki EN belirsiz API — ÇOK ÖNEMLİ) ════
    // IPackAndGo arayüzü (GetPackAndGo/GetDocumentNames/SetSaveToName/
    // SavePackAndGo) resmi dokümantasyona bu ortamda erişim ENGELLENDİ
    // (ağ erişimi kapalıydı) — yalnızca kamuya açık makro örneklerinden
    // BİLİNEN genel kullanım şekli uygulandı. ÖZELLİKLE SetSaveToName'in tam
    // parametre sırası/ref kullanımı DOĞRULANAMADI. Yanlışsa derleme hatası
    // verir (güvenli) — ilk denemede Visual Studio'da bu satırda hata
    // çıkarsa, Nesne Gezgini'nde IPackAndGo arayüzünü açıp doğru imzayı
    // bulup bildirin, tek satır düzeltiriz.
    // ════════════════════════════════════════════════════════════════════════
    // Yerleştirme sonucu — YerlestirilenBilesen, yeni kopyalanan box'ın
    // Frame montajındaki bileşenidir (hırdavat delik uygulaması bunun
    // ÇOCUKLARINI (panellerini) gezmek için kullanır, bkz. HirdavatDelikUygulayici.cs).
    public class KutuYerlestirmeSonucu
    {
        public string MontajYolu;
        public Component2 YerlestirilenBilesen;
    }

    public static class KutuYerlestirmeYoneticisi
    {
        // boxSablonMontajYolu: kullanıcının kütüphanesindeki ŞABLON box montaj
        // dosyası (örn. "CEKMECE_STANDART.SLDASM"). frameMontaj: AÇIK Frame
        // montaj belgesi — kopyalanan box buna bileşen olarak eklenir.
        // frameAdi: yeni dosya adlarının TÜRETİLECEĞİ isim (kullanıcı isteği:
        // "Frame dosyasına atılınca ONUN İSMİNE GÖRE yeni isimlerle kaydolsun").
        // Konum (xMm,yMm,zMm): box'ın Frame içindeki hedef konumu.
        public static KutuYerlestirmeSonucu KutuyuYerlestir(ISldWorks app, string boxSablonMontajYolu,
            ModelDoc2 frameMontaj, string frameAdi, string cikisKlasoru,
            double xMm, double yMm, double zMm, out List<string> uyarilar)
        {
            uyarilar = new List<string>();
            if (!File.Exists(boxSablonMontajYolu))
            {
                uyarilar.Add("Box şablon dosyası bulunamadı: " + boxSablonMontajYolu);
                return null;
            }
            Directory.CreateDirectory(cikisKlasoru);

            ModelDoc2 sablonBelge = null;
            try
            {
                Tanilama.Kaydet("KutuYerlestirmeYoneticisi: sablon aciliyor: " + boxSablonMontajYolu);
                int hata = 0, uyariKod = 0;
                sablonBelge = (ModelDoc2)app.OpenDoc6(boxSablonMontajYolu, (int)swDocumentTypes_e.swDocASSEMBLY,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref hata, ref uyariKod);
                if (sablonBelge == null)
                {
                    uyarilar.Add("Box şablonu açılamadı (hata kodu: " + hata + ").");
                    return null;
                }

                var pgo = sablonBelge.Extension.GetPackAndGo();
                object dosyalarObj;
                pgo.GetDocumentNames(out dosyalarObj);
                string[] dosyalar = (string[])dosyalarObj;
                if (dosyalar == null || dosyalar.Length == 0)
                {
                    uyarilar.Add("PackAndGo hiçbir dosya bulamadı.");
                    return null;
                }

                // Benzersiz ek: Frame adı + zaman damgası — AYNI Frame'e birden
                // fazla box atılsa bile isim ÇAKIŞMASI olmaz (dürüstlük ilkesi:
                // sessizce üstüne yazmak yerine her zaman YENİ, ayırt edilebilir
                // bir dosya üretilir).
                string frameGuvenli = new string(Array.FindAll((frameAdi ?? "FRAME").ToCharArray(),
                    ch => char.IsLetterOrDigit(ch) || ch == '-' || ch == '_'));
                string benzersizEk = "_" + frameGuvenli + "_" + DateTime.Now.ToString("HHmmssfff");

                var yeniDosyalar = new string[dosyalar.Length];
                for (int i = 0; i < dosyalar.Length; i++)
                {
                    string ad = Path.GetFileNameWithoutExtension(dosyalar[i]);
                    string uzanti = Path.GetExtension(dosyalar[i]);
                    yeniDosyalar[i] = Path.Combine(cikisKlasoru, ad + benzersizEk + uzanti);
                }

                // GERÇEK SolidWorks 2025 derlemesinde ortaya çıktı (dürüstlük notu):
                // SetSaveToName'in 2. parametresi bu interop sürümünde `ref` DEĞİL
                // (CS1615), SavePackAndGo ise `bool` değil `object` döndürüyor
                // (CS0266) — ikisi de burada düzeltildi.
                object yeniDosyalarObj = yeniDosyalar;
                bool adAyarlandi = pgo.SetSaveToName(true, yeniDosyalarObj);
                Tanilama.Kaydet("KutuYerlestirmeYoneticisi: SetSaveToName basarili=" + adAyarlandi);

                bool kaydedildi = (bool)sablonBelge.Extension.SavePackAndGo(pgo);
                Tanilama.Kaydet("KutuYerlestirmeYoneticisi: SavePackAndGo basarili=" + kaydedildi);
                app.CloseDoc(sablonBelge.GetTitle());
                sablonBelge = null;

                if (!kaydedildi)
                {
                    uyarilar.Add("PackAndGo (özerk kopyalama) başarısız oldu.");
                    return null;
                }

                string yeniMontajYolu = null;
                for (int i = 0; i < dosyalar.Length; i++)
                {
                    if (string.Equals(Path.GetExtension(dosyalar[i]), ".sldasm", StringComparison.OrdinalIgnoreCase))
                        yeniMontajYolu = yeniDosyalar[i];
                }
                if (yeniMontajYolu == null || !File.Exists(yeniMontajYolu))
                {
                    uyarilar.Add("Kopyalanan montaj dosyası bulunamadı.");
                    return null;
                }

                var asmDoc = (AssemblyDoc)frameMontaj;
                object bilesenObj = asmDoc.AddComponent5(yeniMontajYolu,
                    (int)swAddComponentConfigOptions_e.swAddComponentConfigOptions_CurrentSelectedConfig,
                    "", false, "", xMm * 0.001, yMm * 0.001, zMm * 0.001);
                var bilesen = bilesenObj as Component2;
                if (bilesen == null)
                {
                    uyarilar.Add("Box, Frame montajına bileşen olarak eklenemedi (kopyalandı ama eklenmedi: " + yeniMontajYolu + ").");
                    return new KutuYerlestirmeSonucu { MontajYolu = yeniMontajYolu, YerlestirilenBilesen = null };
                }
                bilesen.Select4(false, null, false);
                asmDoc.FixComponent();

                Tanilama.Kaydet("KutuYerlestirmeYoneticisi: TAMAMLANDI, yeni montaj=" + yeniMontajYolu);
                return new KutuYerlestirmeSonucu { MontajYolu = yeniMontajYolu, YerlestirilenBilesen = bilesen };
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("KutuYerlestirmeYoneticisi HATA: " + ex);
                uyarilar.Add("Kutu yerleştirilirken hata: " + ex.Message);
                if (sablonBelge != null)
                {
                    try { app.CloseDoc(sablonBelge.GetTitle()); } catch { /* en iyi çaba — kapatma başarısız olsa da asıl hata zaten bildirildi */ }
                }
                return null;
            }
        }
    }
}
