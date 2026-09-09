using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // Tek bir dışa aktarım satırı — mevcut ÜretimOS SWOOD içe aktarımının
    // (swood_okuyucu.js + is_emri_uretici.js:swoodDenUret) okuduğu sütun
    // adlarıyla BİREBİR uyumlu + 3 YENİ, GERİYE UYUMLU sütun (PAKET_KODU/
    // PAKET_ADI/USTPAKET_KODU). Mevcut ayrıştırıcı satır başına dict kurduğu
    // için bilmediği sütunları sorunsuz yok sayar — eski SWOOD ZIP'leri de
    // bu değişiklikten ETKİLENMEZ.
    public class KesimSatiri
    {
        public string Desc;            // DESC — parça adı
        public string SapCode;         // SAP_CODE — parça kodu
        public double Lenght;          // LENGHT — boy, mm (SWOOD'un kendi yazım hatası korunuyor, kasıtlı)
        public double Width;           // WIDTH — en, mm
        public int Qty;                // QTY — adet
        public string Material;        // MATERIAL — plaka kodu/adı (varsa)
        public string Ebf, Ebb, Ebl, Ebr; // kenar bandı (Ön/Arka/Sol/Sağ) — kod veya boş
        public string PaketKodu, PaketAdi, UstPaketKodu; // YENİ: alt kırılım için
        public string OlcuKaynagi;     // tanılama: "bbox" | "elle" (dışa AKTARILMAZ, log'a yazılır)
    }

    public class KesimListesiCikarici
    {
        private readonly List<string> _uyarilar = new List<string>();
        public IReadOnlyList<string> Uyarilar => _uyarilar;

        // ── ANA GİRİŞ NOKTASI ────────────────────────────────────────────────
        // Aktif montajı gezer, URETIMOS_TIP="parca" etiketli her bileşen için
        // bir kesim satırı üretir. Etiketlenmemiş bileşenler UYARIYA yazılır,
        // TAHMİN EDİLMEZ (bu repo genelinde kurulu ilke: yanlış veri, boş
        // veriden daha pahalıdır — bkz. step_okuyucu.js, swood_okuyucu.js).
        public List<KesimSatiri> MontajiGez(IModelDoc2 kokBelge)
        {
            _uyarilar.Clear();
            var satirlar = new List<KesimSatiri>();

            if (kokBelge == null || kokBelge.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                _uyarilar.Add("Aktif belge bir montaj (.sldasm) değil — kesim listesi yalnızca montajdan çıkarılabilir.");
                return satirlar;
            }

            var asmDoc = (AssemblyDoc)kokBelge;
            // GetComponents(true) TÜM alt bileşenleri (iç içe montajlar dahil)
            // DÜZ liste olarak verir; ama biz kendi ağacımızı KENDİMİZ kurmak
            // istiyoruz (adet/hiyerarşi doğru sayılsın diye) — bu yüzden en üst
            // seviye bileşenlerden başlayıp GetChildren2 ile ELLE ineceğiz.
            object[] enUstBilesenler = (object[])asmDoc.GetComponents(true /* TopLevelOnly */);
            if (enUstBilesenler == null || enUstBilesenler.Length == 0)
            {
                _uyarilar.Add("Montajda hiç bileşen bulunamadı.");
                return satirlar;
            }

            foreach (Component2 bilesen in enUstBilesenler.Cast<Component2>())
            {
                GezRecursive(bilesen, adetCarpani: 1, ustPaketKodu: null, satirlar: satirlar);
            }

            if (!satirlar.Any())
            {
                _uyarilar.Add("Hiçbir bileşende URETIMOS_TIP=\"parca\" etiketi bulunamadı — " +
                    "Kütüphane panelinden önce bileşenleri etiketlemeniz gerekiyor.");
            }
            return satirlar;
        }

        private void GezRecursive(Component2 bilesen, int adetCarpani, string ustPaketKodu, List<KesimSatiri> satirlar)
        {
            if (bilesen == null || bilesen.IsSuppressed()) return;

            var modelDoc = (ModelDoc2)bilesen.GetModelDoc2();
            if (modelDoc == null)
            {
                _uyarilar.Add($"'{bilesen.Name2}' bileşeninin belgesi yüklenemedi (baskılanmış/eksik referans olabilir) — atlandı.");
                return;
            }

            string tip = OzelAlanOku(modelDoc, OzelAlanlar.TIP);
            string kendiKodu = OzelAlanOku(modelDoc, OzelAlanlar.KOD);
            string kendiAdi = OzelAlanOku(modelDoc, OzelAlanlar.AD);
            if (string.IsNullOrWhiteSpace(kendiAdi)) kendiAdi = Path.GetFileNameWithoutExtension(modelDoc.GetPathName());

            object[] cocuklar = (object[])bilesen.GetChildren();
            bool altMontajMi = cocuklar != null && cocuklar.Length > 0;

            if (tip == "alt_montaj" || (altMontajMi && tip != "parca"))
            {
                // Bu düğüm bir PAKET (ÜretimOS anlamında) — kendi kodu yoksa
                // üretmek yerine UYAR (paket kodu/adı kullanıcı tarafından
                // Kütüphane panelinden BİLİNÇLİ atanmalı, otomatik türetilmez —
                // aksi halde ÜretimOS'taki gerçek paket kartlarıyla eşleşmez).
                if (string.IsNullOrWhiteSpace(kendiKodu))
                {
                    _uyarilar.Add($"Alt montaj '{bilesen.Name2}' bir PAKET KODU almamış — " +
                        "altındaki parçalar PAKET_KODU boş olarak dışa aktarılacak.");
                }
                // Adet çarpanı: bu alt montajın üst montajdaki tekrar sayısı da
                // dahil edilerek alt seviyeye TAŞINIR (step_okuyucu.js'teki
                // agacKur/duzlestir'in aynı çarpım mantığı).
                int buSeviyeAdedi = adetCarpani; // montaj içindeki tekil örnek zaten Component2 başına 1
                foreach (Component2 cocukBilesen in cocuklar.Cast<Component2>())
                {
                    GezRecursive(cocukBilesen, buSeviyeAdedi, kendiKodu, satirlar);
                }
                return;
            }

            if (tip != "parca")
            {
                // Etiketlenmemiş yaprak bileşen — TAHMİN ETME, uyar ve atla.
                _uyarilar.Add($"'{bilesen.Name2}' etiketlenmemiş (URETIMOS_TIP boş) — dışa aktarıma dahil edilmedi.");
                return;
            }

            var (boy, en, kalinlik, kaynak) = OlcuHesapla(modelDoc);
            if (kaynak == "eksik")
            {
                _uyarilar.Add($"'{bilesen.Name2}' için BOY_MM/EN_MM özel alanları boş veya geçersiz — ölçü sütunları boş bırakıldı (bkz. OzelAlanlar.cs).");
            }

            var satir = new KesimSatiri
            {
                Desc = kendiAdi,
                SapCode = kendiKodu ?? "",
                Lenght = Math.Round(boy, 1),
                Width = Math.Round(en, 1),
                Qty = Math.Max(1, adetCarpani),
                Material = OzelAlanOku(modelDoc, OzelAlanlar.PLAKA_KODU) ?? "",
                Ebf = OzelAlanOku(modelDoc, OzelAlanlar.KENAR_ON) ?? "",
                Ebb = OzelAlanOku(modelDoc, OzelAlanlar.KENAR_ARKA) ?? "",
                Ebl = OzelAlanOku(modelDoc, OzelAlanlar.KENAR_SOL) ?? "",
                Ebr = OzelAlanOku(modelDoc, OzelAlanlar.KENAR_SAG) ?? "",
                UstPaketKodu = ustPaketKodu ?? "",
                OlcuKaynagi = kaynak
            };
            satirlar.Add(satir);
        }

        // ── ÖLÇÜ OKUMA ───────────────────────────────────────────────────────
        // v1 BİLİNÇLİ TASARIM: ölçü SolidWorks geometrisinden OTOMATİK
        // hesaplanmıyor — malzeme/kenar bandı kodu gibi, kullanıcının Özel
        // Özellikler'den ELLE girdiği 3 sayı (bkz. OzelAlanlar.BOY_MM/EN_MM/
        // KALINLIK_MM) okunuyor. Gerekçe: SolidWorks'ün kütle özellikleri
        // (IMassProperty) ARAYÜZÜ gerçek denemede doğrulandı — sınır kutusu
        // (bounding box) için HİÇBİR üyesi yok; doğru API'yi (muhtemelen bir
        // Body/Component düzeyinde ayrı bir metot) resmi SolidWorks API
        // dokümantasyonu olmadan güvenilir tahmin etmek mümkün değildi.
        // Yanlış bir geometri API'si çağrısı YANLIŞ ölçü üretebilir (gerçek
        // plaka israfı); elle giriş daha yavaş ama HER ZAMAN doğrudur — bu
        // repodaki yerleşik ilkeyle birebir aynı (bkz. step_okuyucu.js:
        // "yanlış varsaymaktan boş bırakmak/elle girdirmek daha ucuzdur").
        // Otomatik geometri okuma, gerçek API doğrulanınca Faz 2'de eklenebilir.
        private (double boy, double en, double kalinlik, string kaynak) OlcuHesapla(ModelDoc2 modelDoc)
        {
            double boy = OzelAlanSayiOku(modelDoc, OzelAlanlar.BOY_MM);
            double en = OzelAlanSayiOku(modelDoc, OzelAlanlar.EN_MM);
            double kalinlik = OzelAlanSayiOku(modelDoc, OzelAlanlar.KALINLIK_MM);
            if (boy <= 0 || en <= 0)
            {
                return (boy, en, kalinlik, "eksik");
            }
            return (boy, en, kalinlik, "elle");
        }

        // Bir özel alanı ondalıklı sayı olarak okur (virgül/nokta ayracı
        // ikisi de kabul edilir); alan boşsa veya sayı değilse 0 döner.
        private double OzelAlanSayiOku(ModelDoc2 modelDoc, string alanAdi)
        {
            string metin = OzelAlanOku(modelDoc, alanAdi);
            if (string.IsNullOrWhiteSpace(metin)) return 0;
            metin = metin.Trim().Replace(",", ".");
            return double.TryParse(metin, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out double deger) ? deger : 0;
        }

        // ── ÖZEL ALAN OKUMA ──────────────────────────────────────────────────
        private string OzelAlanOku(ModelDoc2 modelDoc, string alanAdi)
        {
            try
            {
                ICustomPropertyManager cpm = modelDoc.Extension.CustomPropertyManager[""];
                string deger, cozulmusDeger;
                cpm.Get5(alanAdi, false, out deger, out cozulmusDeger, out _);
                return string.IsNullOrWhiteSpace(cozulmusDeger) ? deger : cozulmusDeger;
            }
            catch
            {
                return null;
            }
        }

        // Etiketleme paneli bu yazıcıyı kullanacak (Faz 2 UI'ı bu metodu çağırır).
        public void OzelAlanYaz(ModelDoc2 modelDoc, string alanAdi, string deger)
        {
            ICustomPropertyManager cpm = modelDoc.Extension.CustomPropertyManager[""];
            cpm.Add3(alanAdi, (int)swCustomInfoType_e.swCustomInfoText, deger ?? "",
                (int)swCustomPropertyAddOption_e.swCustomPropertyReplaceValue);
        }

        // ── CSV + ZIP PAKETLEME ──────────────────────────────────────────────
        // Mevcut ÜretimOS içe aktarıcısının beklediği klasör yapısı BİREBİR
        // korunuyor: "Saw Cut Export/*.csv" (bkz. swood_okuyucu.js zipDosyaBul
        // deseni). teknikResimDosyalari VERİLDİYSE (TeknikResimOlusturucu'nun
        // ürettiği .dwg/.pdf dosyalarının tam yolları), bunlar AYNI ZIP'e
        // "Teknik Resimler/" klasörü altında eklenir — kullanıcı isteği:
        // kesim listesi ve teknik resimler tek dosyada birlikte gitsin.
        public void ZipOlustur(string cikisYolu, List<KesimSatiri> satirlar, IEnumerable<string> teknikResimDosyalari = null)
        {
            using (var zip = ZipFile.Open(cikisYolu, ZipArchiveMode.Create))
            {
                var csv = CsvUret(satirlar);
                var girdi = zip.CreateEntry("Saw Cut Export/kesim_listesi.csv");
                using (var yazici = new StreamWriter(girdi.Open(), new UTF8Encoding(true)))
                {
                    yazici.Write(csv);
                }

                if (teknikResimDosyalari != null)
                {
                    foreach (var dosyaYolu in teknikResimDosyalari)
                    {
                        if (string.IsNullOrWhiteSpace(dosyaYolu) || !File.Exists(dosyaYolu)) continue;
                        zip.CreateEntryFromFile(dosyaYolu, "Teknik Resimler/" + Path.GetFileName(dosyaYolu));
                    }
                }
            }
        }

        private string CsvUret(List<KesimSatiri> satirlar)
        {
            var sb = new StringBuilder();
            sb.AppendLine("DESC;SAP_CODE;LENGHT;WIDTH;QTY;MATERIAL;EBF;EBB;EBL;EBR;PAKET_KODU;PAKET_ADI;USTPAKET_KODU");
            foreach (var s in satirlar)
            {
                sb.AppendLine(string.Join(";", new[]
                {
                    KacisEt(s.Desc), KacisEt(s.SapCode),
                    s.Lenght.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    s.Width.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    s.Qty.ToString(), KacisEt(s.Material),
                    KacisEt(s.Ebf), KacisEt(s.Ebb), KacisEt(s.Ebl), KacisEt(s.Ebr),
                    KacisEt(s.PaketKodu), KacisEt(s.PaketAdi), KacisEt(s.UstPaketKodu)
                }));
            }
            return sb.ToString();
        }

        private string KacisEt(string s) => (s ?? "").Replace(";", ",").Replace("\r", " ").Replace("\n", " ");
    }
}
