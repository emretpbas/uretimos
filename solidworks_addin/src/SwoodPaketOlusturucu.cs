using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // SWOOD UYUMLU PAKET OLUŞTURUCU — kullanıcı isteği: "üretimostaki reçete
    // ve rota sistemine uyacak şekilde ve iş emri formatına uygun olacak
    // şekilde" bir çıktı. ÜretimOS'un ana deposunda ZATEN kanıtlanmış, test
    // edilmiş bir SWOOD ZIP içe aktarım köprüsü var (swood_okuyucu.js +
    // is_emri_uretici.js:swoodDenUret, bkz. testler/swood_ice_aktarim_testi.js) —
    // bu sınıfın TEK işi, bizim SolidWorks kesim listemizi O KÖPRÜNÜN
    // BEKLEDİĞİ BİREBİR ZIP yapısına dönüştürmek:
    //
    //   uretimos_swood_paketi.zip
    //     ├── Saw Cut Export/kesim_listesi.csv   (noktalı virgülle ayrılmış)
    //     └── PDFS/*.pdf                          (onaylanmış teknik resimler)
    //
    // Bu sayede ÜretimOS TARAFINDA HİÇBİR DEĞİŞİKLİK GEREKMEDEN (mevcut "İş
    // Emri Formu > SWOOD İçe Aktar" ekranı zaten .zip kabul ediyor), üretilen
    // paket doğrudan içe aktarılabilir. RaporOlusturucu.cs'teki Excel/PDF
    // raporu BUNUN YERİNE DEĞİL, YANINDA üretilir — o insan onayı/incelemesi
    // için, bu ise ÜretimOS'a MAKİNE OKUNABİLİR içe aktarım için.
    //
    // SÜTUN ŞEMASI is_emri_uretici.js:swoodDenUret ile BİREBİR eşleşir:
    //   DESC, SAP_CODE, LENGHT, WIDTH, QTY, MATERIAL, EBF/EBB/EBL/EBR (kenar
    //   bandı — dolu=bantlı, SWOOD'daki gibi sadece varlık kontrolü edilir),
    //   GRAIN (tahıl/desen yönü — GERÇEK SWOOD sütun adı, is_emri_uretici.js
    //   bunu zaten SWOOD raporları için okuyordu; burada SolidWorks add-in'i
    //   de AYNI sütunu doldurur),
    //   PAKET_KODU (üst alt-montaj kodu — CABINET_NAME yoksa bunu kullanır),
    //   HIRDAVAT ("kod:adet,kod:adet" — hirdavatAdaylariniAyristir okur),
    //   BIRLESIM_TIPI, YABANCI_PARCA — SWOOD'un KENDİSİ bu son ikisini hiç
    //   üretmez, is_emri_uretici.js bunları SolidWorks add-in'e ÖZEL, güvenle
    //   yok sayılabilir ekstra sütunlar olarak okur.
    // ════════════════════════════════════════════════════════════════════════
    public static class SwoodPaketOlusturucu
    {
        private static readonly string[] Basliklar =
        {
            "DESC", "SAP_CODE", "LENGHT", "WIDTH", "QTY", "MATERIAL",
            "EBF", "EBB", "EBL", "EBR", "GRAIN", "PAKET_KODU", "HIRDAVAT",
            "BIRLESIM_TIPI", "YABANCI_PARCA",
            // YENİ: CNC yerleşimi (bkz. OzelAlanlar.CNC_*) — SWOOD bunları
            // ÜRETMEZ, is_emri_uretici.js güvenle yok sayılabilir ekstra
            // sütunlar olarak okur (BIRLESIM_TIPI/YABANCI_PARCA ile aynı desen).
            "CNC_FINCAN", "CNC_SIFIRLAMA_KOSE",
            // YENİ (Cam Modülü — başlangıç): bkz. OzelAlanlar.CAM_*.
            "CAM_KODU", "CAM_TEMPERLI", "CAM_KENAR_ISLEME"
        };

        // zipYolu: kullanıcının seçtiği .zip yolu. pdfYollari: Manifest'te
        // kayıtlı, o ana kadar onaylanmış her parçanın PDF'i (montajın kendi
        // PDF'i dahil) — bulunanlar "PDFS/" altına kopyalanır, bulunamayanlar
        // sessizce atlanır (ÜretimOS tarafı teknik resmi olmayan satırları
        // zaten destekler, boş bırakmak yanlış resim koymaktan iyidir).
        public static string Uret(List<KesimSatiri> satirlar, IEnumerable<string> pdfYollari, string zipYolu)
        {
            Tanilama.Kaydet("SwoodPaketOlusturucu.Uret basladi: " + zipYolu);
            if (File.Exists(zipYolu)) File.Delete(zipYolu);

            using (var zipAkisi = new FileStream(zipYolu, FileMode.Create))
            using (var zip = new ZipArchive(zipAkisi, ZipArchiveMode.Create))
            {
                var csvGirdisi = zip.CreateEntry("Saw Cut Export/kesim_listesi.csv", CompressionLevel.Optimal);
                using (var yazici = new StreamWriter(csvGirdisi.Open(), new UTF8Encoding(true)))
                {
                    yazici.WriteLine(string.Join(";", Basliklar));
                    foreach (var s in satirlar)
                    {
                        yazici.WriteLine(SatirCsvYaz(s));
                    }
                }

                int pdfSayaci = 0;
                foreach (var pdfYolu in pdfYollari)
                {
                    if (string.IsNullOrWhiteSpace(pdfYolu) || !File.Exists(pdfYolu)) continue;
                    pdfSayaci++;
                    string girdiAdi = "PDFS/" + pdfSayaci + "_" + Path.GetFileName(pdfYolu);
                    zip.CreateEntryFromFile(pdfYolu, girdiAdi, CompressionLevel.Optimal);
                }

                // YENİ: Delik/Form sidecar — CSV şeması SWOOD ile birebir
                // uyumlu kalmalı (bu yüzden delik/form buraya SÜTUN olarak
                // EKLENMEDİ), ama ÜretimOS'un nesting modülüne taşınabilmesi
                // için ayrı bir JSON dosyası olarak paketlenir. YALNIZCA
                // kullanıcının SolidWorks'te DELIKLER_ONAYLANDI="evet" dediği
                // parçalar için yazılır (bkz. DelikFormCikarici.cs güvenilirlik
                // notu) — onaylanmamış delikler CNC'ye asla sessizce gitmez.
                int delikDosyaSayaci = 0;
                foreach (var s in satirlar)
                {
                    if (!s.DeliklerOnaylandi) continue;
                    if ((s.Delikler == null || s.Delikler.Count == 0) && (s.Formlar == null || s.Formlar.Count == 0)) continue;

                    var sidecar = new JObject
                    {
                        ["sapCode"] = s.SapCode,
                        ["paketKodu"] = s.UstPaketKodu,
                        ["delikler"] = new JArray((s.Delikler ?? new List<DelikBilgisi>()).Select(d => new JObject
                        {
                            ["x"] = d.XMm, ["y"] = d.YMm, ["cap"] = d.CapMm,
                            ["derinlik"] = d.DerinlikMm, ["tumBoyu"] = d.TumBoyu
                        })),
                        ["formlar"] = new JArray((s.Formlar ?? new List<FormBilgisi>()).Select(f => new JObject
                        {
                            ["noktalar"] = new JArray(f.NoktalarXY.Select(p => new JArray(p[0], p[1])))
                        }))
                    };

                    delikDosyaSayaci++;
                    string dosyaAdi = "Delikler/" + Guvenli(s.SapCode, delikDosyaSayaci) + ".json";
                    var delikGirdisi = zip.CreateEntry(dosyaAdi, CompressionLevel.Optimal);
                    using (var yazici = new StreamWriter(delikGirdisi.Open(), new UTF8Encoding(true)))
                    {
                        yazici.Write(sidecar.ToString(Formatting.None));
                    }
                }

                Tanilama.Kaydet($"SwoodPaketOlusturucu.Uret tamamlandi: {satirlar.Count} satir, {pdfSayaci} pdf, {delikDosyaSayaci} delik/form dosyasi");
            }

            return zipYolu;
        }

        private static string SatirCsvYaz(KesimSatiri s)
        {
            string[] hucreler =
            {
                Kacis(s.Desc),
                Kacis(s.SapCode),
                s.Lenght.ToString(System.Globalization.CultureInfo.InvariantCulture),
                s.Width.ToString(System.Globalization.CultureInfo.InvariantCulture),
                s.Qty.ToString(System.Globalization.CultureInfo.InvariantCulture),
                Kacis(s.Material),
                Kacis(s.Ebf), Kacis(s.Ebb), Kacis(s.Ebl), Kacis(s.Ebr),
                Kacis(s.TahilYonu),
                Kacis(s.UstPaketKodu),
                Kacis(s.HirdavatListesi),
                Kacis(s.BirlesimTipi),
                s.YabanciParca ? "evet" : "",
                Kacis(s.CncFincan),
                Kacis(s.CncSifirlamaKose),
                Kacis(s.CamKodu),
                s.CamTemperli ? "evet" : "",
                Kacis(s.CamKenarIsleme)
            };
            return string.Join(";", hucreler);
        }

        // Delik/form sidecar dosya adı için SAP_CODE'u dosya sistemi açısından
        // güvenli hale getirir; boşsa/karakter kalmazsa sıra numarasına düşer.
        private static string Guvenli(string sapCode, int sira)
        {
            if (string.IsNullOrWhiteSpace(sapCode)) return "parca_" + sira;
            var temiz = new string(sapCode.Select(ch => char.IsLetterOrDigit(ch) || ch == '-' || ch == '_' ? ch : '_').ToArray());
            return string.IsNullOrEmpty(temiz) ? "parca_" + sira : temiz;
        }

        // CSV ayırıcısı ';' olduğu için HERHANGİ bir alanda (kullanıcının
        // Özel Özellikler'e yanlışlıkla yazmış olabileceği bir ';' dahil)
        // rastlanan noktalı virgül, sütun kaymasını önlemek için virgülle
        // değiştirilir. HIRDAVAT alanı da BUNUN İÇİNDİR — iç ayırıcısı zaten
        // virgül (bkz. OzelAlanlar.cs HIRDAVAT_LISTESI), bu yüzden bu metottan
        // geçmesi güvenlidir ve tutarlılığı garantiler. Satır sonu karakterleri
        // de (CSV'yi çok satırlı hale getirmesin diye) boşlukla değiştirilir.
        private static string Kacis(string deger)
        {
            if (string.IsNullOrEmpty(deger)) return "";
            return deger.Replace(';', ',').Replace('\r', ' ').Replace('\n', ' ');
        }
    }
}
