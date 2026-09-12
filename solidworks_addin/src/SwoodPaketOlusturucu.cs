using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;

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
            "BIRLESIM_TIPI", "YABANCI_PARCA"
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
                Tanilama.Kaydet($"SwoodPaketOlusturucu.Uret tamamlandi: {satirlar.Count} satir, {pdfSayaci} pdf");
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
                s.YabanciParca ? "evet" : ""
            };
            return string.Join(";", hucreler);
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
