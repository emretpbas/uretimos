using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json.Linq;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // NESTİNG'E GÖNDER PANELİ — kullanıcı isteği: "...SolidWorks'te panel
    // malzemelerin otomatik teknik resmini alıp plakaya yerleştir, SolidWorks
    // üzerinde gerekli teknik resimler açılsın, nestinge girecek parçaları
    // kutucuklarla seçebilelim ve kalınlık ve farklı malzemeler için farklı
    // nestingler yapılacak... Teknik Resim Oluştur'daki çizimlerden alacaksın
    // ... seçilen tek yüz yeterli."
    //
    // MİMARİ KARAR (kullanıcıyla netleştirildi — bkz. sohbet geçmişi): web'den
    // masaüstündeki SolidWorks'ü UZAKTAN tetiklemek ("nesting butonuna
    // basınca SolidWorks otomatik açılsın") şu an YOK ve inşası ayrı/büyük bir
    // iştir (sürekli çalışan bir arka plan servisi/bildirim köprüsü gerekir —
    // UretimOSApiClient SADECE eklenti→sunucu yönünde çalışır, tersi yok). Bu
    // yüzden akış TERSİNE çevrildi: kullanıcı SolidWorks'te model AÇIKKEN bu
    // panele basar, parçaları seçer, panel ÜretimOS'un kesim satırlarına
    // CANLI olarak yazar. Web tarafında (page_nesting.js) HİÇBİR DEĞİŞİKLİK
    // gerekmedi — zaten var olan "kesim ihtiyacı satırı" (Store.kesimIhtiyaclari)
    // modelini kullanır, kullanıcı orada normal şekilde "Nesting Çalıştır"a
    // basıp DXF indirir.
    //
    // VERİ KAYNAĞI (kullanıcıyla netleştirildi — "Teknik Resim Oluştur
    // çizimlerinden türetelim" istendi, AMA çizim dosyasını YENİDEN
    // AYRIŞTIRMADAN): ölçü/malzeme/delik verisi çizimden DEĞİL, zaten var
    // olan ve doğrulanmış KesimListesiCikarici.cs (Özel Özellikler) +
    // DelikFormCikarici.cs (geometri) yolundan okunur — bkz.
    // KesimListesiCikarici.OlcuHesapla'nın kendi gerekçesi: geometriden/
    // çizimden ölçü türetmek GÜVENİLMEZ bulunup BİLİNÇLİ OLARAK terk
    // edilmişti; bunu şimdi tersine çevirmek aynı riski geri getirir. "Teknik
    // Resim Oluştur'daki çizimlerden alacaksın" isteği burada SEÇİLEBİLİR
    // parça kümesini Manifest.cs'teki ONAYLANMIŞ bir teknik resmi OLAN
    // parçalarla SINIRLAMAK olarak karşılanır (bkz. aşağıdaki ItemCheck) —
    // yani "teknik resmi onaylanmış, dolayısıyla kesime hazır" parçalar
    // listelenir ve varsayılan işaretli gelir; ölçü o çizimden değil
    // doğrulanmış özellik verisinden gelir.
    //
    // TEK YÜZEY: nesting algoritması (page_nesting.js) zaten SADECE 90°
    // döndürür, hiçbir ayna/flip işlemi YOK (bkz. testler/nesting_testi.js
    // "TEK YUZEYDE DELIK KURALI" bölümü) — "seçilen tek yüz yeterli" isteği
    // ek koda GEREK BIRAKMADI, mevcut tasarım bunu zaten sağlıyor.
    //
    // FARKLI KALINLIK/MALZEME = FARKLI NESTING: her KesimSatiri'nin Material
    // alanı (URETIMOS_PLAKA_KODU) ÜretimOS'taki BİR plaka hammadde kartına
    // eşlenir; o kart kendi kalınlığını/malzemesini TAŞIR — yani malzeme
    // koduna göre gruplamak, kalınlığa göre de otomatik ayrışmış olur (aynı
    // kod iki farklı kalınlıkta OLAMAZ, aksi halde ÜretimOS'ta zaten İKİ ayrı
    // hammadde kartı olurdu). Her grup kendi "kesim ihtiyacı satırı"na
    // (= kendi nesting çalıştırmasına) gider.
    // ════════════════════════════════════════════════════════════════════════
    public class NestingGonderPaneli : Form
    {
        private readonly ModelDoc2 _aktifBelge;
        private UretimOSApiClient _istemci;
        private JArray _hammaddeler = new JArray();
        private JArray _kesimIhtiyaclari = new JArray();
        private List<KesimSatiri> _satirlar = new List<KesimSatiri>();

        private ListView _liste;
        private Label _durumEtiketi;
        private Button _gonderBtn;
        private Button _yenileBtn;
        private TextBox _sonucKutusu;

        public NestingGonderPaneli(ModelDoc2 aktifBelge)
        {
            _aktifBelge = aktifBelge;
            Text = "Nesting'e Gönder (ÜretimOS)";
            Width = 900; Height = 640;
            StartPosition = FormStartPosition.CenterScreen;
            ArayuzuKur();
            Load += async (s, e) => await VerileriYukleVeListele();
        }

        private void ArayuzuKur()
        {
            var ustHint = new Label
            {
                Text = "Sadece '1) Teknik Resim Oluştur → 2) Teknik Resmi Onayla' akışından geçmiş " +
                       "(onaylanmış teknik resmi olan) parçalar seçilebilir — gri satırlar henüz onaylanmadı. " +
                       "Seçilen parçalar malzeme koduna (= kalınlık+malzeme) göre otomatik gruplanıp ayrı " +
                       "kesim satırlarına (ayrı nesting'lere) gönderilir.",
                Dock = DockStyle.Top, Height = 54, Padding = new Padding(8), ForeColor = Color.DimGray
            };

            _liste = new ListView
            {
                Dock = DockStyle.Fill, View = View.Details, CheckBoxes = true,
                FullRowSelect = true, GridLines = true
            };
            _liste.Columns.Add("Parça", 220);
            _liste.Columns.Add("Kod", 110);
            _liste.Columns.Add("Malzeme (Plaka Kodu)", 160);
            _liste.Columns.Add("Boy×En (mm)", 110);
            _liste.Columns.Add("Adet", 50);
            _liste.Columns.Add("Teknik Resim", 160);
            // Teknik resmi OLMAYAN (Manifest.cs'te onay kaydı bulunmayan)
            // satırlar İŞARETLENEMEZ — bkz. dosya başı mimari karar.
            _liste.ItemCheck += (s, e) =>
            {
                var item = _liste.Items[e.Index];
                if (item.Tag is KesimSatiri ks && Manifest.Bul(ks.ModelYolu) == null)
                    e.NewValue = CheckState.Unchecked;
            };

            _durumEtiketi = new Label { Dock = DockStyle.Top, Height = 24, Padding = new Padding(8, 4, 8, 4), ForeColor = Color.DarkBlue };
            _sonucKutusu = new TextBox { Dock = DockStyle.Bottom, Height = 90, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };

            var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 44 };
            _gonderBtn = new Button { Text = "Seçilenleri Nesting'e Gönder", Width = 220, Height = 30, Left = 8, Top = 7, Enabled = false };
            _gonderBtn.Click += async (s, e) => await SeciliOlanlariGonder();
            _yenileBtn = new Button { Text = "Yenile", Width = 90, Height = 30, Left = 236, Top = 7 };
            _yenileBtn.Click += async (s, e) => await VerileriYukleVeListele();
            altPanel.Controls.Add(_gonderBtn);
            altPanel.Controls.Add(_yenileBtn);

            Controls.Add(_sonucKutusu);
            Controls.Add(altPanel);
            Controls.Add(_liste);
            Controls.Add(_durumEtiketi);
            Controls.Add(ustHint);
        }

        private async System.Threading.Tasks.Task VerileriYukleVeListele()
        {
            _gonderBtn.Enabled = false;
            _durumEtiketi.ForeColor = Color.DarkBlue;
            _durumEtiketi.Text = "Montaj taranıyor…";
            _liste.Items.Clear();
            _sonucKutusu.Clear();

            if (_aktifBelge == null || _aktifBelge.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Aktif belge bir montaj değil — bu panel yalnızca montajlarda kullanılabilir.";
                return;
            }

            var cikarici = new KesimListesiCikarici();
            _satirlar = cikarici.MontajiGez(_aktifBelge);
            if (cikarici.Uyarilar.Count > 0)
                _sonucKutusu.Text = "Taramada uyarılar:\r\n" + string.Join("\r\n", cikarici.Uyarilar);

            foreach (var satir in _satirlar)
            {
                var manifestKaydi = Manifest.Bul(satir.ModelYolu);
                var item = new ListViewItem(new[]
                {
                    satir.Desc, satir.SapCode ?? "",
                    string.IsNullOrWhiteSpace(satir.Material) ? "(atanmamış)" : satir.Material,
                    satir.Lenght.ToString("0.#") + "×" + satir.Width.ToString("0.#"),
                    satir.Qty.ToString(),
                    manifestKaydi != null ? "✓ Onaylı (" + manifestKaydi.OnayZamani.ToString("dd.MM.yyyy HH:mm") + ")" : "— Henüz yok"
                })
                { Tag = satir };
                item.Checked = manifestKaydi != null; // onaylı olanlar varsayılan İŞARETLİ gelir
                if (manifestKaydi == null) item.ForeColor = Color.Gray;
                _liste.Items.Add(item);
            }

            _durumEtiketi.Text = _satirlar.Count + " parça bulundu — ÜretimOS'a bağlanılıyor…";

            var ayar = BaglantiAyarlari.Yukle();
            if (ayar == null)
            {
                BaglantiAyarlari.OrnekDosyaOlustur();
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "Yerel bağlantı ayarı yok. Örnek dosya oluşturuldu: " + BaglantiAyarlari.DosyaYoluGoster();
                return;
            }

            try
            {
                _istemci = new UretimOSApiClient(ayar.SunucuUrl);
                bool girisBasarili = await _istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre);
                if (!girisBasarili)
                {
                    _durumEtiketi.ForeColor = Color.DarkRed;
                    _durumEtiketi.Text = "ÜretimOS'a giriş başarısız — " + BaglantiAyarlari.DosyaYoluGoster() + " içindeki bilgileri kontrol edin.";
                    return;
                }
                _hammaddeler = JArray.Parse(await _istemci.Getir("hammaddeler") ?? "[]");
                _kesimIhtiyaclari = JArray.Parse(await _istemci.Getir("kesimIhtiyaclari") ?? "[]");
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = _satirlar.Count + " parça bulundu, ÜretimOS'a bağlandı — onaylı teknik resmi olanları seçip gönderebilirsiniz.";
                _gonderBtn.Enabled = true;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("NestingGonderPaneli VerileriYukleVeListele HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "ÜretimOS'a bağlanırken hata: " + ex.Message;
            }
        }

        private async System.Threading.Tasks.Task SeciliOlanlariGonder()
        {
            var secilenler = _liste.Items.Cast<ListViewItem>()
                .Where(i => i.Checked)
                .Select(i => (KesimSatiri)i.Tag)
                .ToList();
            if (!secilenler.Any())
            {
                MessageBox.Show("Hiç parça seçilmedi.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            _gonderBtn.Enabled = false;
            _durumEtiketi.Text = "Gönderiliyor…";
            var sonucSatirlari = new List<string>();
            var eslenemeyenler = new List<string>();

            // ── GRUPLAMA: malzeme koduna (PLAKA_KODU) göre — bkz. dosya başı
            // "FARKLI KALINLIK/MALZEME = FARKLI NESTING" notu.
            var gruplar = secilenler.GroupBy(s => (s.Material ?? "").Trim());

            var yeniSatirlar = new List<object>();
            var guncellenenSatirlar = new List<object>();

            foreach (var grup in gruplar)
            {
                if (string.IsNullOrWhiteSpace(grup.Key))
                {
                    eslenemeyenler.Add(grup.Count() + " parça — malzeme (plaka) kodu ATANMAMIŞ, hangi plakaya kesileceği bilinmiyor. " +
                        "SolidWorks'te URETIMOS_PLAKA_KODU özel alanını doldurup tekrar deneyin.");
                    continue;
                }

                JObject hammadde = _hammaddeler
                    .OfType<JObject>()
                    .FirstOrDefault(h => (string)h["tip"] == "plaka" &&
                        string.Equals((string)h["stokKodu"], grup.Key, StringComparison.OrdinalIgnoreCase));
                if (hammadde == null)
                {
                    eslenemeyenler.Add(grup.Count() + " parça — '" + grup.Key + "' kodlu bir plaka hammaddesi ÜretimOS'ta bulunamadı " +
                        "(TAHMİN EDİLMEDİ). Önce Hammaddeler sayfasından bu kodu tanımlayın.");
                    continue;
                }
                string hammaddeId = (string)hammadde["id"];

                var yeniParcalar = grup.Select(ParcaNesnesiOlustur).ToList();

                JObject acikSatir = _kesimIhtiyaclari
                    .OfType<JObject>()
                    .FirstOrDefault(k => (string)k["hammaddeId"] == hammaddeId && (string)k["durum"] == "acik");

                if (acikSatir != null)
                {
                    var mevcutParcalar = acikSatir["parcalar"] as JArray ?? new JArray();
                    foreach (var p in yeniParcalar) mevcutParcalar.Add(JObject.FromObject(p));
                    acikSatir["parcalar"] = mevcutParcalar;
                    guncellenenSatirlar.Add(acikSatir);
                    sonucSatirlari.Add("'" + grup.Key + "' — " + grup.Count() + " parça MEVCUT açık kesim satırına eklendi.");
                }
                else
                {
                    string yeniSatirId = "KSI-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant();
                    var yeniSatir = new JObject
                    {
                        ["id"] = yeniSatirId,
                        ["hammaddeId"] = hammaddeId,
                        ["durum"] = "acik",
                        ["parcalar"] = JArray.FromObject(yeniParcalar),
                        ["kaynakSiparisler"] = new JArray(),
                        ["kaynak"] = "solidworks_addin",
                        ["olusturmaTarihi"] = DateTime.Now.ToString("yyyy-MM-dd")
                    };
                    yeniSatirlar.Add(yeniSatir);
                    sonucSatirlari.Add("'" + grup.Key + "' — " + grup.Count() + " parça için YENİ kesim satırı açıldı.");
                }
            }

            bool basarili = true;
            if (yeniSatirlar.Count > 0 || guncellenenSatirlar.Count > 0)
            {
                try { basarili = await _istemci.ToplukaEkleGuncelle("kesimIhtiyaclari", yeniSatirlar, guncellenenSatirlar); }
                catch (Exception ex)
                {
                    Tanilama.Kaydet("NestingGonderPaneli SeciliOlanlariGonder HATA: " + ex);
                    basarili = false;
                    sonucSatirlari.Add("GÖNDERME HATASI: " + ex.Message);
                }
            }

            _sonucKutusu.Text = string.Join("\r\n", sonucSatirlari.Concat(eslenemeyenler));
            _durumEtiketi.ForeColor = basarili ? Color.DarkGreen : Color.DarkRed;
            _durumEtiketi.Text = basarili
                ? "Gönderildi — ÜretimOS'ta Kesim Optimizasyonu sayfasından devam edebilirsiniz."
                : "Gönderim sırasında hata oluştu, aşağıdaki ayrıntıya bakın.";
            _gonderBtn.Enabled = true;

            if (basarili && eslenemeyenler.Count == 0)
            {
                MessageBox.Show("Gönderildi. ÜretimOS'ta Kesim Optimizasyonu sayfasından nesting'i çalıştırıp DXF indirebilirsiniz.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        // page_nesting.js'in "kesim ihtiyacı satırı" parça şemasıyla BİREBİR
        // uyumlu (bkz. page_nesting.js openParcaForm/delikMetniniAyristir).
        // Delikler SADECE DeliklerOnaylandi=true ise dahil edilir (AYNI onay
        // kapısı KesimListesiCikarici/SwoodPaketOlusturucu'da da var).
        private object ParcaNesnesiOlustur(KesimSatiri satir)
        {
            var delikler = satir.DeliklerOnaylandi
                ? satir.Delikler.Select(d => new Dictionary<string, object>
                  {
                      ["x"] = d.XMm, ["y"] = d.YMm, ["cap"] = d.CapMm,
                      ["derinlik"] = d.DerinlikMm, ["tumBoyu"] = d.TumBoyu
                  }).ToList()
                : new List<Dictionary<string, object>>();

            return new Dictionary<string, object>
            {
                ["ad"] = satir.Desc,
                ["boy"] = satir.Lenght,
                ["en"] = satir.Width,
                ["adet"] = satir.Qty,
                // Tahıl/desen yönü tanımlıysa parça ASLA döndürülemez —
                // page_nesting.js'teki grainKilitli ile AYNI anlam (bkz.
                // OzelAlanlar.TAHIL_YONU).
                ["grainKilitli"] = !string.IsNullOrWhiteSpace(satir.TahilYonu),
                ["manuel"] = false,
                ["ymKod"] = satir.SapCode ?? "",
                ["delikler"] = delikler
            };
        }
    }
}
