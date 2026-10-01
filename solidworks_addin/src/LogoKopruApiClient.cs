using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // LOGO KÖPRÜ API İSTEMCİSİ — SolidWorks eklentisinin, ÜretimOS'a hiç
    // uğramadan, logo_koprusu/index.php HTTP köprüsünden DOĞRUDAN LOGO SQL
    // Server verisi (hammadde/ürün/yarı mamül master data: StokKodu/StokAdi/
    // Urun_AnaBirim) çekmesini sağlar. Kullanıcı isteği: "SolidWorks'teki
    // arayüz ÜretimOS'a bağlanmadan direkt LOGO'ya bağlanıp veri çeksin."
    //
    // NEDEN AYRI BİR İSTEMCİ (UretimOSApiClient'tan FARKLI): köprü farklı bir
    // kimlik doğrulama şeması kullanır (Bearer token DEĞİL, sabit X-API-Key
    // başlığı — bkz. logo_koprusu/index.php) ve farklı bir yanıt zarfı döner
    // ({kayitlar, adet, toplam, sayfa, sayfaBoyutu, sonSayfaMi, tip}).
    //
    // KAPSAM BİLİNÇLİ OLARAK SINIRLI (gerçek kullanıcı onayıyla): bu istemci
    // yalnızca SAF REFERANS verisi (id/reçete/rota/delikSablonu gibi ÜretimOS'a
    // özgü bağlantısı OLMAYAN) ekranlarda kullanılır — ör. EtiketlemePaneli'nin
    // Plaka/Kenar Bandı/Hırdavat kod önerileri. ReceteAgaciPaneli.cs (reçete
    // ağacı) ve YeniKartFormlari.cs'nin "Atanacak Hammadde" arama kutusu BUNU
    // KULLANMAZ — onlar ÜretimOS kartlarındaki id/delikSablonu/reçeteler/rota
    // bağlantılarına muhtaçtır, bunlar LOGO'da yoktur; o akışı LOGO'ya
    // taşımak reçete ağacı özelliğini kırardı.
    // ════════════════════════════════════════════════════════════════════════
    public class LogoKopruApiClient
    {
        private readonly string _tabanUrl;      // örn. https://kopru.firmaniz.local:8443/index.php
        private readonly HttpClient _http;

        // ag_entegrasyon.js'teki SAYFALAMA_MAKS_SAYFA ile AYNI gerekçe:
        // sonSayfaMi hiç true dönmeyen bozuk bir köprü/ayar yüzünden sonsuz
        // sayfalama döngüsüne girmemek için bir güvenlik tavanı.
        private const int AZAMI_SAYFA = 200;

        public LogoKopruApiClient(string tabanUrl, string apiAnahtari)
        {
            // UretimOSApiClient'taki AYNI gerekçe: .NET Framework 4.8'in
            // varsayılan SecurityProtocol'ü TLS 1.2'yi içermeyebilir.
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            _tabanUrl = (tabanUrl ?? "").TrimEnd('/');
            _http = new HttpClient();
            _http.DefaultRequestHeaders.Add("X-API-Key", apiAnahtari ?? "");
        }

        // tip: "hammadde" | "urun" | "yarimamul" | "tumu" (bkz. logo_koprusu/
        // index.php — ayarlar.php'deki 'kosullar' ile köprü tarafında
        // özelleştirilebilir). TÜM sayfaları otomatik gezip (sonSayfaMi
        // alanına bakarak) tek bir düz JArray olarak birleştirir — çağıran
        // taraf sayfalamayla hiç uğraşmaz.
        public async Task<JArray> KayitlariGetir(string tip)
        {
            var tumKayitlar = new JArray();
            for (int sayfa = 1; sayfa <= AZAMI_SAYFA; sayfa++)
            {
                var yanit = await _http.GetAsync(
                    _tabanUrl + "?tip=" + Uri.EscapeDataString(tip) + "&sayfa=" + sayfa + "&adet=2000");
                string govde = await yanit.Content.ReadAsStringAsync();

                JObject obj;
                try { obj = JObject.Parse(govde); }
                catch (Exception ex)
                {
                    // ag_entegrasyon.js'teki "ara sayfa hata verince ÖNCEKİ
                    // kayıtlarla devam edilir" ilkesiyle AYNI: ilk sayfa hiç
                    // çözümlenemezse tam hata, ara sayfa bozuksa o ana kadar
                    // toplanan kayıtlar KAYBOLMAZ.
                    if (sayfa == 1) throw new Exception("Köprü yanıtı çözümlenemedi: " + ex.Message);
                    break;
                }

                if (!yanit.IsSuccessStatusCode || obj["hata"] != null)
                {
                    string hata = (string)obj["hata"] ?? ("HTTP " + (int)yanit.StatusCode);
                    if (sayfa == 1) throw new Exception(hata);
                    break;
                }

                var kayitlar = obj["kayitlar"] as JArray ?? new JArray();
                foreach (var k in kayitlar) tumKayitlar.Add(k);

                bool sonSayfaMi = (bool?)obj["sonSayfaMi"] ?? true;
                if (sonSayfaMi || kayitlar.Count == 0) break;
            }
            return tumKayitlar;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // LOGO ham verisinde hammadde alt tipi (plaka/kenar_bandi/hirdavat/sarf)
    // AYRI bir sütun olarak GELMEZ — Urun_Kart_Turu_Kodu yalnızca Hammadde(10)/
    // TüketimMalı(13) olduğunu söyler, ÜretimOS'un kendi iç sınıflandırmasını
    // (plaka/kenar_bandi/hirdavat/sarf) bilmez. page_tiger_aktarim.js ve
    // page_ag_entegrasyon.js'teki tipBelirle() ile BİREBİR AYNI kural burada
    // C#'a taşındı — iki taraf da aynı ad/birim kalıbından aynı sonucu
    // üretsin diye. "cam" burada YOK: ÜretimOS'ta cam HER ZAMAN elle atanan
    // bir tip, LOGO verisinden hiçbir zaman çıkarılamaz (bkz. EtiketlemePaneli.cs).
    public static class LogoHammaddeSiniflandirici
    {
        public static string TipBelirle(string ad, string birim)
        {
            string a = (ad ?? "").ToUpperInvariant();
            string b = (birim ?? "").ToUpperInvariant();
            if (a.Contains("KENAR BANT") || a.Contains("KENARBANT")) return "kenar_bandi";
            if (b == "M2" || b == "M²") return "plaka";
            if (b == "GRAM" || b == "KG" || b == "LITRE" || b == "LT" || b == "L") return "sarf";
            return "hirdavat";
        }
    }
}
