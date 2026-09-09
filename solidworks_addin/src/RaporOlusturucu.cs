using System;
using System.Collections.Generic;
using System.IO;
using ClosedXML.Excel;
using PdfSharp.Drawing;
using PdfSharp.Pdf;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // RAPOR OLUŞTURUCU — kullanıcı isteği: CSV'nin yerine, hem Excel (.xlsx)
    // hem çok sayfalı PDF üretilsin. Yapı ikisinde de AYNI:
    //   - "Genel" sayfa/sekme: MontajiGez'in ürettiği TÜM parçaların birleşik
    //     kesim listesi tablosu + montajın kendi onaylanmış JPG'i (varsa).
    //   - Her parça için AYRI bir sayfa/sekme: o parçanın TEK satırı + o
    //     parçanın kendi onaylanmış JPG'i (TeknikResimOnaylaCalistir'de
    //     Manifest'e kaydedilen, "2) Teknik Resmi Onayla" ile üretilen JPG —
    //     "bu jpegleri onayladığım teknik resimlerden oluştur" isteği).
    // Bir parça henüz onaylanmadıysa (Manifest'te kaydı yoksa) o sayfa JPG
    // yerine bir UYARI METNİ taşır — TAHMİN EDİLMEZ, sessizce atlanmaz.
    //
    // GÜVENLİK AĞI: ClosedXML/PdfSharp bu projede İLK KEZ kullanılıyor —
    // SolidWorks COM API'si değiller (çökme riski çok daha düşük, ikisi de
    // saf .NET kütüphaneleri) ama yine de her adımdan sonra Tanilama.Kaydet
    // ile iz bırakılıyor.
    // ════════════════════════════════════════════════════════════════════════
    public class RaporOlusturucu
    {
        private readonly List<string> _uyarilar = new List<string>();
        public IReadOnlyList<string> Uyarilar => _uyarilar;

        private static readonly string[] Basliklar =
        {
            "DESC", "SAP_CODE", "LENGHT", "WIDTH", "QTY", "MATERIAL",
            "EBF", "EBB", "EBL", "EBR", "PAKET_KODU", "PAKET_ADI", "USTPAKET_KODU"
        };

        // xlsxYolu: kullanıcının seçtiği tam yol (örn. ...\rapor.xlsx) — PDF
        // AYNI ada, .pdf uzantısıyla aynı klasöre yazılır. genelModelYolu:
        // aktif montajın kendi dosya yolu (Manifest'te onun JPG'ini bulmak
        // için — bkz. sınıf açıklaması "Genel sayfa").
        public bool RaporUret(List<KesimSatiri> satirlar, string genelModelYolu, string xlsxYolu,
            out string uretilenXlsx, out string uretilenPdf)
        {
            uretilenXlsx = null;
            uretilenPdf = null;
            Tanilama.Kaydet("RaporUret basladi: " + xlsxYolu);
            try
            {
                var genelGirdi = Manifest.Bul(genelModelYolu);
                if (genelGirdi?.JpgYolu == null)
                {
                    _uyarilar.Add("Montajın kendi teknik resmi henüz onaylanmadı — Genel sayfada resim olmayacak.");
                }

                Tanilama.Kaydet("Excel uretiliyor");
                uretilenXlsx = ExcelUret(satirlar, genelGirdi?.JpgYolu, xlsxYolu);
                Tanilama.Kaydet("Excel uretildi: " + uretilenXlsx);

                string pdfYolu = Path.Combine(
                    Path.GetDirectoryName(xlsxYolu) ?? "",
                    Path.GetFileNameWithoutExtension(xlsxYolu) + ".pdf");
                Tanilama.Kaydet("PDF uretiliyor");
                uretilenPdf = PdfUret(satirlar, genelGirdi?.JpgYolu, pdfYolu);
                Tanilama.Kaydet("PDF uretildi: " + uretilenPdf);

                return uretilenXlsx != null || uretilenPdf != null;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("RaporUret HATA: " + ex);
                _uyarilar.Add("Rapor oluşturulurken hata: " + ex.Message);
                return uretilenXlsx != null || uretilenPdf != null;
            }
        }

        private string ExcelUret(List<KesimSatiri> satirlar, string genelJpgYolu, string xlsxYolu)
        {
            using (var workbook = new XLWorkbook())
            {
                var genelSayfa = workbook.Worksheets.Add("Genel");
                SatirYaz(genelSayfa, 1, Basliklar);
                int satirNo = 2;
                foreach (var s in satirlar)
                {
                    SatirYazVeri(genelSayfa, satirNo, s);
                    satirNo++;
                }
                ResimEkle(genelSayfa, genelJpgYolu, satirNo + 2, "Montajın teknik resmi henüz onaylanmadı.");

                var kullanilanAdlar = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Genel" };
                foreach (var s in satirlar)
                {
                    string sayfaAdi = BenzersizSayfaAdi(s.SapCode, s.Desc, kullanilanAdlar);
                    var sayfa = workbook.Worksheets.Add(sayfaAdi);
                    SatirYaz(sayfa, 1, Basliklar);
                    SatirYazVeri(sayfa, 2, s);

                    var girdi = Manifest.Bul(s.ModelYolu);
                    if (girdi?.JpgYolu == null)
                    {
                        _uyarilar.Add($"'{s.Desc}' henüz onaylanmadı ('1) Teknik Resim Oluştur' → '2) Teknik Resmi Onayla') — sayfasında resim yok.");
                    }
                    ResimEkle(sayfa, girdi?.JpgYolu, 4, "Bu parçanın teknik resmi henüz onaylanmadı.");
                }

                workbook.SaveAs(xlsxYolu);
            }
            return xlsxYolu;
        }

        private void SatirYaz(IXLWorksheet sayfa, int satirNo, string[] degerler)
        {
            for (int i = 0; i < degerler.Length; i++)
            {
                sayfa.Cell(satirNo, i + 1).Value = degerler[i];
            }
        }

        private void SatirYazVeri(IXLWorksheet sayfa, int satirNo, KesimSatiri s)
        {
            sayfa.Cell(satirNo, 1).Value = s.Desc ?? "";
            sayfa.Cell(satirNo, 2).Value = s.SapCode ?? "";
            sayfa.Cell(satirNo, 3).Value = s.Lenght;
            sayfa.Cell(satirNo, 4).Value = s.Width;
            sayfa.Cell(satirNo, 5).Value = s.Qty;
            sayfa.Cell(satirNo, 6).Value = s.Material ?? "";
            sayfa.Cell(satirNo, 7).Value = s.Ebf ?? "";
            sayfa.Cell(satirNo, 8).Value = s.Ebb ?? "";
            sayfa.Cell(satirNo, 9).Value = s.Ebl ?? "";
            sayfa.Cell(satirNo, 10).Value = s.Ebr ?? "";
            sayfa.Cell(satirNo, 11).Value = s.PaketKodu ?? "";
            sayfa.Cell(satirNo, 12).Value = s.PaketAdi ?? "";
            sayfa.Cell(satirNo, 13).Value = s.UstPaketKodu ?? "";
        }

        private void ResimEkle(IXLWorksheet sayfa, string jpgYolu, int satirNo, string yokMesaji)
        {
            if (!string.IsNullOrWhiteSpace(jpgYolu) && File.Exists(jpgYolu))
            {
                sayfa.AddPicture(jpgYolu).MoveTo(sayfa.Cell(satirNo, 1));
            }
            else
            {
                sayfa.Cell(satirNo, 1).Value = yokMesaji;
            }
        }

        // Excel sekme adları: en fazla 31 karakter, \ / * ? [ ] : içeremez.
        // Ayrıca aynı isim tekrar edemez (örn. iki parça aynı SAP_CODE'a
        // sahipse) — bu yüzden çakışırsa sona sayaç eklenir.
        private string BenzersizSayfaAdi(string sapCode, string desc, HashSet<string> kullanilanlar)
        {
            string temel = !string.IsNullOrWhiteSpace(sapCode) ? sapCode : (desc ?? "Parça");
            foreach (char c in "\\/*?[]:") temel = temel.Replace(c, '-');
            if (temel.Length > 28) temel = temel.Substring(0, 28);
            if (string.IsNullOrWhiteSpace(temel)) temel = "Parca";

            string aday = temel;
            int sayac = 2;
            while (kullanilanlar.Contains(aday))
            {
                aday = temel + "_" + sayac;
                sayac++;
            }
            kullanilanlar.Add(aday);
            return aday;
        }

        private string PdfUret(List<KesimSatiri> satirlar, string genelJpgYolu, string pdfYolu)
        {
            using (var belge = new PdfDocument())
            {
                var baslikFontu = new XFont("Arial", 14, XFontStyle.Bold);
                var normalFontu = new XFont("Arial", 9, XFontStyle.Regular);
                var uyariFontu = new XFont("Arial", 9, XFontStyle.Italic);

                PdfPage sayfa = belge.AddPage();
                XGraphics gfx = XGraphics.FromPdfPage(sayfa);
                gfx.DrawString("Genel Kesim Listesi", baslikFontu, XBrushes.Black,
                    new XRect(0, 20, sayfa.Width, 30), XStringFormats.TopCenter);

                double y = 60;
                gfx.DrawString(string.Join(" | ", Basliklar), normalFontu, XBrushes.Black, new XPoint(20, y));
                y += 16;

                foreach (var s in satirlar)
                {
                    if (y > sayfa.Height - 40)
                    {
                        sayfa = belge.AddPage();
                        gfx = XGraphics.FromPdfPage(sayfa);
                        y = 40;
                    }
                    string metin = $"{s.Desc} | {s.SapCode} | {s.Lenght} | {s.Width} | {s.Qty} | {s.Material} | " +
                                   $"{s.Ebf}/{s.Ebb}/{s.Ebl}/{s.Ebr} | {s.PaketKodu} | {s.PaketAdi} | {s.UstPaketKodu}";
                    gfx.DrawString(metin, normalFontu, XBrushes.Black, new XPoint(20, y));
                    y += 14;
                }

                y += 20;
                y = ResimVeyaUyariCiz(belge, ref sayfa, ref gfx, genelJpgYolu,
                    "Montajın teknik resmi henüz onaylanmadı.", y, uyariFontu);

                foreach (var s in satirlar)
                {
                    sayfa = belge.AddPage();
                    gfx = XGraphics.FromPdfPage(sayfa);
                    gfx.DrawString(s.Desc ?? "(isimsiz parça)", baslikFontu, XBrushes.Black,
                        new XRect(0, 20, sayfa.Width, 30), XStringFormats.TopCenter);

                    double py = 60;
                    gfx.DrawString(
                        $"SAP_CODE: {s.SapCode}   LENGHT: {s.Lenght}   WIDTH: {s.Width}   QTY: {s.Qty}   MATERIAL: {s.Material}",
                        normalFontu, XBrushes.Black, new XPoint(20, py));
                    py += 16;
                    gfx.DrawString(
                        $"Kenar bandı — Ön:{s.Ebf} Arka:{s.Ebb} Sol:{s.Ebl} Sağ:{s.Ebr}   Paket: {s.PaketKodu} / {s.PaketAdi}",
                        normalFontu, XBrushes.Black, new XPoint(20, py));
                    py += 24;

                    var girdi = Manifest.Bul(s.ModelYolu);
                    ResimVeyaUyariCiz(belge, ref sayfa, ref gfx, girdi?.JpgYolu,
                        "Bu parçanın teknik resmi henüz onaylanmadı.", py, uyariFontu);
                }

                belge.Save(pdfYolu);
            }
            return pdfYolu;
        }

        // Bir JPG'yi (varsa) mevcut sayfaya, sığmıyorsa YENİ bir sayfaya çizer;
        // yoksa uyarı metni yazar. Dönüş: bir sonraki çizim için kullanılabilir Y.
        private double ResimVeyaUyariCiz(PdfDocument belge, ref PdfPage sayfa, ref XGraphics gfx,
            string jpgYolu, string yokMesaji, double y, XFont uyariFontu)
        {
            if (string.IsNullOrWhiteSpace(jpgYolu) || !File.Exists(jpgYolu))
            {
                gfx.DrawString(yokMesaji, uyariFontu, XBrushes.DarkRed, new XPoint(20, y));
                return y + 20;
            }

            using (var resim = XImage.FromFile(jpgYolu))
            {
                double genislik = sayfa.Width - 40;
                double yukseklik = genislik * resim.PixelHeight / resim.PixelWidth;

                if (y + yukseklik > sayfa.Height - 20)
                {
                    sayfa = belge.AddPage();
                    gfx = XGraphics.FromPdfPage(sayfa);
                    y = 40;
                }

                gfx.DrawImage(resim, 20, y, genislik, yukseklik);
                return y + yukseklik + 10;
            }
        }
    }
}
