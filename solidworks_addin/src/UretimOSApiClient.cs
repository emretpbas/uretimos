using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // ÜretimOS API İSTEMCİSİ — mevcut api.php uçlarını (login/get/list/patch)
    // kullanır. YENİ bir uç GEREKTİRMEZ; yalnızca ÜretimOS tarafında kısıtlı
    // yetkili bir rol (örn. "cad_entegrasyon") tanımlanması önerilir — bkz.
    // README.md "ÜretimOS tarafında gereken küçük değişiklik".
    //
    // Neden mevcut uçlar yeterli: api.php zaten "hat_operator" için AYNI
    // desende bir beyaz-liste (HAT_OP_OKUNABILIR/HAT_OP_YAZILABILIR) uyguluyor
    // (bkz. api.php, action=get/set/patch). CAD entegrasyonu için de aynı
    // ilkeyle yalnızca hammaddeler/yarimamuller/paketler/urunler/receteler
    // okunabilir+yazılabilir yapılır; cari/fiyat/İK/muhasebe TAMAMEN kapalı
    // kalır. Bu dosya o modeli varsayar.
    // ════════════════════════════════════════════════════════════════════════
    public class UretimOSApiClient
    {
        private readonly string _tabanUrl;      // örn. https://uretimos.firmaniz.com/api.php
        private readonly HttpClient _http;
        private CookieContainer _cookieler;

        public UretimOSApiClient(string tabanUrl)
        {
            _tabanUrl = tabanUrl.TrimEnd('/');
            _cookieler = new CookieContainer();
            var handler = new HttpClientHandler { CookieContainer = _cookieler };
            _http = new HttpClient(handler);
        }

        // api.php'nin login ucu oturum çerezi (PHP session) döner; sonraki
        // istekler bu çerezle kimliklenir — tarayıcı akışıyla birebir aynı.
        public async Task<bool> GirisYap(string kullaniciAdi, string sifre)
        {
            var icerik = new StringContent(
                Newtonsoft.Json.JsonConvert.SerializeObject(new { kullaniciAdi, sifre }),
                Encoding.UTF8, "application/json");
            var yanit = await _http.PostAsync(_tabanUrl + "?action=login", icerik);
            return yanit.IsSuccessStatusCode;
        }

        // action=get&key=... → { key, value(JSON string), surum }
        // value'yi çağıran taraf JSON.parse eder (burada ham string döner,
        // tip-özel modele çevirmek KutuphaneSenkron.cs'nin işi).
        public async Task<string> Getir(string anahtar)
        {
            var yanit = await _http.GetAsync(_tabanUrl + "?action=get&key=" + Uri.EscapeDataString(anahtar));
            yanit.EnsureSuccessStatusCode();
            var govde = await yanit.Content.ReadAsStringAsync();
            dynamic obj = Newtonsoft.Json.JsonConvert.DeserializeObject(govde);
            return obj.value;
        }

        // action=patch → { key, ekle:[...], guncelle:[...], sil:[...] }
        // Atomik, sürüm çakışması sunucuda otomatik çözülür (bkz. api.php
        // action=patch dokümantasyonu) — add-in'in "beklenenSurum" göndermesi
        // GEREKMEZ, patch zaten kayıt bazlı birleştirme yapar.
        public async Task<bool> ToplukaEkleGuncelle(string anahtar, List<object> ekle, List<object> guncelle)
        {
            var govdeNesne = new Dictionary<string, object>
            {
                ["key"] = anahtar,
                ["ekle"] = ekle ?? new List<object>(),
                ["guncelle"] = guncelle ?? new List<object>(),
                ["sil"] = new List<string>(),
                ["sayfa"] = "solidworks_addin"
            };
            var icerik = new StringContent(
                Newtonsoft.Json.JsonConvert.SerializeObject(govdeNesne),
                Encoding.UTF8, "application/json");
            var yanit = await _http.PostAsync(_tabanUrl + "?action=patch", icerik);
            return yanit.IsSuccessStatusCode;
        }
    }
}

// NOT: Bu dosya Newtonsoft.Json'a bağımlı (SolidWorks eklentilerinde en
// yaygın JSON kütüphanesi, NuGet'ten kolayca eklenir). .NET sürümünüz
// System.Text.Json destekliyorsa onunla da birebir aynı mantıkla yazılabilir.
