using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace UretimOSKesim
{
    public class ManifestGirdisi
    {
        public string ModelYolu;
        public string DwgYolu;
        public string PdfYolu;
        public string JpgYolu;
        public DateTime OnayZamani;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Kullanıcı isteği: "önce dosya isminde tüm montajı sonra tek tek her
    // parçanın teknik resmini onaylayarak dwg ve pdf yapalım" — yani montaj
    // + her parça AYRI AYRI, ayrı zamanlarda "1) Oluştur → elle düzenle →
    // 2) Onayla" akışından geçiyor. Bu manifest, her "Onayla" tıklamasının
    // sonucunu (o modelin DWG/PDF/JPG yolları) DİSKE KALICI olarak biriktirir
    // — böylece "3) Raporu Oluştur" komutu, o ana kadar onaylanmış TÜM
    // parçaları tek seferde toplayıp birleştirebilir. Anahtar: onaylanan
    // modelin TAM dosya yolu (büyük/küçük harf duyarsız — Windows öyle).
    // ════════════════════════════════════════════════════════════════════════
    public static class Manifest
    {
        private static readonly string DosyaYolu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UretimOSKesim", "rapor_manifest.json");

        public static void Kaydet(string modelYolu, string dwgYolu, string pdfYolu, string jpgYolu)
        {
            var tum = Oku();
            tum[Anahtar(modelYolu)] = new ManifestGirdisi
            {
                ModelYolu = modelYolu,
                DwgYolu = dwgYolu,
                PdfYolu = pdfYolu,
                JpgYolu = jpgYolu,
                OnayZamani = DateTime.Now
            };
            Yaz(tum);
        }

        public static ManifestGirdisi Bul(string modelYolu)
        {
            var tum = Oku();
            return tum.TryGetValue(Anahtar(modelYolu), out var girdi) ? girdi : null;
        }

        // ── MONTAJ ŞEMASI — AYRI bir anahtar altında saklanır ────────────────
        // Aynı montaj için hem normal teknik resim hem montaj şeması
        // onaylanabilir; ikisi de AYNI model yoluna bağlı olduğundan tek bir
        // Kaydet/Bul çiftini paylaşsalardı biri diğerinin üzerine yazardı.
        // Bu yüzden montaj şeması, aynı JSON dosyasında ama farklı bir
        // anahtarda (":: MONTAJ_SEMASI" soneki) tutulur — Kaydet/Bul (normal
        // teknik resim) HİÇ değiştirilmedi, bu tamamen katma bir eklenti.
        public static void KaydetMontajSemasi(string modelYolu, string dwgYolu, string pdfYolu, string jpgYolu)
        {
            var tum = Oku();
            tum[MontajSemasiAnahtari(modelYolu)] = new ManifestGirdisi
            {
                ModelYolu = modelYolu,
                DwgYolu = dwgYolu,
                PdfYolu = pdfYolu,
                JpgYolu = jpgYolu,
                OnayZamani = DateTime.Now
            };
            Yaz(tum);
        }

        public static ManifestGirdisi BulMontajSemasi(string modelYolu)
        {
            var tum = Oku();
            return tum.TryGetValue(MontajSemasiAnahtari(modelYolu), out var girdi) ? girdi : null;
        }

        private static string MontajSemasiAnahtari(string modelYolu) => Anahtar(modelYolu) + "::MONTAJ_SEMASI";

        // Yeni bir montaj/rapor turuna başlarken eski onayları temizlemek
        // için — şu an hiçbir komuttan çağrılmıyor, ama kullanıcı "eski
        // parçalar rapora karışıyor" derse EtiketlePaneliAc'ın yanına kolayca
        // bir "Manifesti Temizle" komutu eklenebilir.
        public static void Temizle()
        {
            Yaz(new Dictionary<string, ManifestGirdisi>());
        }

        private static string Anahtar(string modelYolu) => (modelYolu ?? "").Trim().ToUpperInvariant();

        private static Dictionary<string, ManifestGirdisi> Oku()
        {
            try
            {
                if (!File.Exists(DosyaYolu)) return new Dictionary<string, ManifestGirdisi>();
                string json = File.ReadAllText(DosyaYolu);
                return JsonConvert.DeserializeObject<Dictionary<string, ManifestGirdisi>>(json)
                    ?? new Dictionary<string, ManifestGirdisi>();
            }
            catch
            {
                return new Dictionary<string, ManifestGirdisi>();
            }
        }

        private static void Yaz(Dictionary<string, ManifestGirdisi> tum)
        {
            string klasor = Path.GetDirectoryName(DosyaYolu);
            Directory.CreateDirectory(klasor);
            string json = JsonConvert.SerializeObject(tum, Formatting.Indented);
            File.WriteAllText(DosyaYolu, json);
        }
    }
}
