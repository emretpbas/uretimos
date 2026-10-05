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
        private readonly ISldWorks _app;
        private UretimOSApiClient _istemci;
        private JArray _hammaddeler = new JArray();
        private JArray _kesimIhtiyaclari = new JArray();
        private JArray _cncTakimlari = new JArray();
        private JObject _ayarlar = new JObject();
        private List<KesimSatiri> _satirlar = new List<KesimSatiri>();

        private ListView _liste;
        private Label _durumEtiketi;
        private Button _gonderBtn;
        private Button _yenileBtn;
        private Button _solidworksteNestleBtn;
        private TextBox _sonucKutusu;

        // Kullanıcı isteği: "3660x1830 ya da 2800x2100 ölçüsünde plakaya...
        // manuel giriş yapılarak" — malzeme (plaka) kodu SolidWorks'te hiç
        // atanmamış (URETIMOS_PLAKA_KODU boş) parçalar için, tam stok kodunu
        // bilmeye gerek kalmadan hızlı bir boyut seçimi. Bu, MİMARİ KARARI
        // (dosya başı not) BOZMAZ: hesap/yerleştirme YİNE ÜretimOS web
        // Nesting sayfasında yapılır — burada SADECE hangi plaka hammadde
        // kartına (boy×en eşleşmesiyle) gönderileceği seçilir, TAHMİN/yeni
        // hammadde OLUŞTURMA yapılmaz (eşleşen kart yoksa reddedilir, bkz.
        // SeciliOlanlariGonder).
        private double? _manuelPlakaBoy, _manuelPlakaEn;
        private Label _manuelPlakaEtiketi;

        public NestingGonderPaneli(ModelDoc2 aktifBelge, ISldWorks app)
        {
            _aktifBelge = aktifBelge;
            _app = app;
            Text = "Nesting'e Gönder (ÜretimOS)";
            // Kullanıcı raporu ("sayfanın yarısı gözükmüyor") — ReceteAgaciPaneli.
            // KurulumYap'taki AYNI düzeltme: sabit 900×640 piksel yerine ekranın
            // çalışma alanına göre boyutlanma + DPI ölçekleme (bkz. o dosyadaki
            // AYNI gerekçe).
            AutoScaleMode = AutoScaleMode.Dpi;
            var calismaAlani = Screen.FromPoint(Cursor.Position).WorkingArea;
            Width = Math.Min((int)(calismaAlani.Width * 0.92), calismaAlani.Width);
            Height = Math.Min((int)(calismaAlani.Height * 0.90), calismaAlani.Height);
            MinimumSize = new Size(Math.Min(760, calismaAlani.Width), Math.Min(480, calismaAlani.Height));
            MaximumSize = calismaAlani.Size;
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

            // NOT: "View" burada BİLEREK tam nitelenmiş (System.Windows.Forms.View) —
            // bu dosyada SolidWorks.Interop.sldworks de "View" adlı bir COM arayüzü
            // tanımlıyor (using SolidWorks.Interop.sldworks ModelDoc2/swDocumentTypes_e
            // için gerekli), gerçek bir derlemede CS0104 belirsiz başvuru hatası verdi.
            _liste = new ListView
            {
                Dock = DockStyle.Fill, View = System.Windows.Forms.View.Details, CheckBoxes = true,
                FullRowSelect = true, GridLines = true
            };
            _liste.Columns.Add("Parça", 220);
            _liste.Columns.Add("Kod", 110);
            _liste.Columns.Add("Malzeme (Plaka Kodu)", 160);
            _liste.Columns.Add("Boy×En (mm)", 110);
            _liste.Columns.Add("Adet", 50);
            _liste.Columns.Add("Teknik Resim", 160);
            // Kullanıcı isteği: "Reçete ağacı ekranına nesting yap tuşu ekle
            // ... teknik resim yoksa ölçüye göre yerleşim yap ... ayrıca
            // aynı bağlantıyı normal tuşa da bağla" — ESKİDEN burada teknik
            // resmi OLMAYAN satırlar hiç İŞARETLENEMİYORDU (ÜretimOS'a
            // gönderme ile AYNI kısıt kullanılıyordu). Artık TÜM satırlar
            // işaretlenebilir; onay kısıtı SADECE ÜretimOS'a gönderen yolda
            // (bkz. SeciliOlanlariGonder) uygulanıyor — "SolidWorks'te
            // Nestle" onaysız (gri) satırları da ölçüsüne göre kullanır.
            // Gri renk (bkz. VerileriYukleVeListele) görsel ipucu olarak
            // KALIYOR, sadece işaretlemeyi ENGELLEMİYOR.

            _durumEtiketi = new Label { Dock = DockStyle.Top, Height = 24, Padding = new Padding(8, 4, 8, 4), ForeColor = Color.DarkBlue };
            _sonucKutusu = new TextBox { Dock = DockStyle.Bottom, Height = 90, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };

            // ── Malzeme kodu atanmamış parçalar için hızlı plaka boyutu ─────
            var plakaPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Top, Height = 38, FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false, Padding = new Padding(8, 6, 8, 0)
            };
            plakaPanel.Controls.Add(new Label { Text = "Malzeme kodu atanmamış parçalar için plaka boyutu:", AutoSize = true, Margin = new Padding(0, 6, 8, 0) });
            var btn3660 = new Button { Text = "3660×1830 mm", Width = 115, Height = 26 };
            btn3660.Click += (s, e) => PlakaBoyutuSec(3660, 1830);
            var btn2800 = new Button { Text = "2800×2100 mm", Width = 115, Height = 26 };
            btn2800.Click += (s, e) => PlakaBoyutuSec(2800, 2100);
            var manuelBoyKutu = new NumericUpDown { Maximum = 10000, Minimum = 0, DecimalPlaces = 0, Width = 65, Margin = new Padding(14, 4, 2, 0) };
            var manuelEnKutu = new NumericUpDown { Maximum = 10000, Minimum = 0, DecimalPlaces = 0, Width = 65, Margin = new Padding(2, 4, 2, 0) };
            var manuelUygulaBtn = new Button { Text = "Manuel Uygula", Width = 100, Height = 26, Margin = new Padding(6, 0, 0, 0) };
            manuelUygulaBtn.Click += (s, e) => PlakaBoyutuSec((double)manuelBoyKutu.Value, (double)manuelEnKutu.Value);
            plakaPanel.Controls.Add(btn3660);
            plakaPanel.Controls.Add(btn2800);
            plakaPanel.Controls.Add(new Label { Text = "Boy×En:", AutoSize = true, Margin = new Padding(12, 6, 2, 0) });
            plakaPanel.Controls.Add(manuelBoyKutu);
            plakaPanel.Controls.Add(new Label { Text = "×", AutoSize = true, Margin = new Padding(2, 6, 2, 0) });
            plakaPanel.Controls.Add(manuelEnKutu);
            plakaPanel.Controls.Add(manuelUygulaBtn);
            _manuelPlakaEtiketi = new Label { Dock = DockStyle.Top, Height = 20, Padding = new Padding(8, 0, 8, 4), ForeColor = Color.DarkGreen };

            var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 44 };
            _gonderBtn = new Button { Text = "Seçilenleri Nesting'e Gönder (ÜretimOS Web)", Width = 260, Height = 30, Left = 8, Top = 7, Enabled = false };
            _gonderBtn.Click += async (s, e) => await SeciliOlanlariGonder();
            // Kullanıcı isteği: "üretimosta istemiyorum solidde oluşturu
            // düzenleyip dxf alacağız optimize edilmiş nesting çıktısını" —
            // yukarıdaki butonun aksine bu, ÜretimOS'a HİÇBİR ŞEY GÖNDERMEZ;
            // yerleştirmeyi burada (NestingHesaplayici) hesaplayıp SolidWorks'te
            // düzenlenebilir bir sketch/parça olarak üretir (bkz. SolidWorksteNestle).
            _solidworksteNestleBtn = new Button { Text = "SolidWorks'te Nestle (Sketch Oluştur)", Width = 260, Height = 30, Left = 276, Top = 7, Enabled = false };
            _solidworksteNestleBtn.Click += async (s, e) => await SolidWorksteNestle();
            _yenileBtn = new Button { Text = "Yenile", Width = 90, Height = 30, Left = 544, Top = 7 };
            _yenileBtn.Click += async (s, e) => await VerileriYukleVeListele();
            altPanel.Controls.Add(_gonderBtn);
            altPanel.Controls.Add(_solidworksteNestleBtn);
            altPanel.Controls.Add(_yenileBtn);

            Controls.Add(_sonucKutusu);
            Controls.Add(altPanel);
            Controls.Add(_liste);
            Controls.Add(_manuelPlakaEtiketi);
            Controls.Add(plakaPanel);
            Controls.Add(_durumEtiketi);
            Controls.Add(ustHint);
        }

        private void PlakaBoyutuSec(double boy, double en)
        {
            if (boy <= 0 || en <= 0)
            {
                MessageBox.Show("Geçerli bir boy/en girin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            _manuelPlakaBoy = boy;
            _manuelPlakaEn = en;
            _manuelPlakaEtiketi.Text = "Seçili plaka boyutu: " + boy.ToString("0") + "×" + en.ToString("0") +
                " mm — malzeme kodu ATANMAMIŞ seçili parçalar, Gönder'de bu boyuta eşleşen bir plaka hammaddesine yönlendirilecek.";
        }

        private async System.Threading.Tasks.Task VerileriYukleVeListele()
        {
            _gonderBtn.Enabled = false;
            _solidworksteNestleBtn.Enabled = false;
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

            // "SolidWorks'te Nestle" ÜretimOS'a bağlı DEĞİLDİR (kullanıcı isteği:
            // "üretimosta istemiyorum") — SolidWorks taraması tek başına yeterli,
            // bu yüzden sunucu denemesinden ÖNCE etkinleştirilir. Sunucuya
            // bağlanılabilirse kesim payı/kenar boşluğu ÜretimOS ayarlarından
            // (web Nesting sayfasıyla TUTARLI olsun diye) okunur; bağlanılamazsa
            // SolidWorksteNestle kendi (data.js'teki AYNI) varsayılanlarına düşer.
            _solidworksteNestleBtn.Enabled = _satirlar.Count > 0;

            _durumEtiketi.Text = _satirlar.Count + " parça bulundu — ÜretimOS'a bağlanılıyor…";

            var ayar = BaglantiAyarlari.Yukle();
            if (ayar == null)
            {
                BaglantiAyarlari.OrnekDosyaOlustur();
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "Yerel bağlantı ayarı yok (ÜretimOS'a gönderme devre dışı, ama SolidWorks'te Nestle yine kullanılabilir). Örnek dosya oluşturuldu: " + BaglantiAyarlari.DosyaYoluGoster();
                return;
            }

            try
            {
                _istemci = new UretimOSApiClient(ayar.SunucuUrl);
                bool girisBasarili = await _istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre);
                if (!girisBasarili)
                {
                    _durumEtiketi.ForeColor = Color.DarkRed;
                    _durumEtiketi.Text = "ÜretimOS'a giriş başarısız — " + BaglantiAyarlari.DosyaYoluGoster() + " içindeki bilgileri kontrol edin. (SolidWorks'te Nestle yine kullanılabilir.)";
                    return;
                }
                _hammaddeler = JArray.Parse(await _istemci.Getir("hammaddeler") ?? "[]");
                _kesimIhtiyaclari = JArray.Parse(await _istemci.Getir("kesimIhtiyaclari") ?? "[]");
                _cncTakimlari = JArray.Parse(await _istemci.Getir("cncTakimlari") ?? "[]");
                _ayarlar = JObject.Parse(await _istemci.Getir("ayarlar") ?? "{}");
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
            var tumSecilenler = _liste.Items.Cast<ListViewItem>()
                .Where(i => i.Checked)
                .Select(i => (KesimSatiri)i.Tag)
                .ToList();
            if (!tumSecilenler.Any())
            {
                MessageBox.Show("Hiç parça seçilmedi.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // ÜretimOS'a gönderme yolu, dosya başı mimari karar gereği
            // SADECE onaylı teknik resmi olan parçaları kabul eder — işaretleme
            // artık serbest olduğu için (bkz. ArayuzuKur'daki NOT) bu kısıt
            // burada, gönderim anında uygulanır.
            var secilenler = tumSecilenler.Where(s => Manifest.Bul(s.ModelYolu) != null).ToList();
            int onaysızAtlanan = tumSecilenler.Count - secilenler.Count;
            if (!secilenler.Any())
            {
                MessageBox.Show("Seçilen hiçbir parçanın onaylı teknik resmi yok — ÜretimOS'a gönderme bunu gerektirir. " +
                    "(Teknik resmi onaylanmadan nestlemek isterseniz 'SolidWorks'te Nestle' butonunu kullanın.)",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            _gonderBtn.Enabled = false;
            _durumEtiketi.Text = "Gönderiliyor…";
            var sonucSatirlari = new List<string>();
            var eslenemeyenler = new List<string>();
            if (onaysızAtlanan > 0)
                eslenemeyenler.Add(onaysızAtlanan + " seçili parça, onaylı teknik resmi olmadığı için ÜretimOS'a gönderilmedi (atlandı).");

            // ── GRUPLAMA: malzeme koduna (PLAKA_KODU) göre — bkz. dosya başı
            // "FARKLI KALINLIK/MALZEME = FARKLI NESTING" notu. Malzeme kodu
            // ATANMAMIŞ ama kullanıcı bu ekranda bir plaka boyutu seçmişse
            // (bkz. PlakaBoyutuSec), bu parçalar kod yerine o boyuta göre
            // (__MANUEL__ anahtarıyla) ayrı gruplanır.
            const string ManuelGrupAnahtari = "__MANUEL__";
            var gruplar = secilenler.GroupBy(s => string.IsNullOrWhiteSpace(s.Material)
                ? (_manuelPlakaBoy.HasValue && _manuelPlakaEn.HasValue ? ManuelGrupAnahtari : "")
                : s.Material.Trim());

            var yeniSatirlar = new List<object>();
            var guncellenenSatirlar = new List<object>();

            foreach (var grup in gruplar)
            {
                JObject hammadde;
                string grupEtiketi;

                if (grup.Key == ManuelGrupAnahtari)
                {
                    double boy = _manuelPlakaBoy.Value, en = _manuelPlakaEn.Value;
                    const double Tolerans = 0.5;
                    hammadde = _hammaddeler.OfType<JObject>().FirstOrDefault(h =>
                    {
                        if ((string)h["tip"] != "plaka") return false;
                        double hBoy = (double?)h["boy"] ?? 0, hEn = (double?)h["en"] ?? 0;
                        return (Math.Abs(hBoy - boy) < Tolerans && Math.Abs(hEn - en) < Tolerans) ||
                               (Math.Abs(hBoy - en) < Tolerans && Math.Abs(hEn - boy) < Tolerans);
                    });
                    grupEtiketi = boy.ToString("0") + "×" + en.ToString("0") + " mm (manuel seçim)";
                    if (hammadde == null)
                    {
                        eslenemeyenler.Add(grup.Count() + " parça — malzeme kodu atanmamış, seçtiğiniz " + grupEtiketi +
                            " boyutunda bir plaka hammaddesi ÜretimOS'ta bulunamadı (TAHMİN EDİLMEDİ). " +
                            "Önce Hammaddeler sayfasından bu boyutta bir plaka tanımlayın.");
                        continue;
                    }
                }
                else if (string.IsNullOrWhiteSpace(grup.Key))
                {
                    eslenemeyenler.Add(grup.Count() + " parça — malzeme (plaka) kodu ATANMAMIŞ, hangi plakaya kesileceği bilinmiyor. " +
                        "SolidWorks'te URETIMOS_PLAKA_KODU özel alanını doldurun, ya da yukarıdan bir plaka boyutu seçip tekrar deneyin.");
                    continue;
                }
                else
                {
                    grupEtiketi = grup.Key;
                    hammadde = _hammaddeler
                        .OfType<JObject>()
                        .FirstOrDefault(h => (string)h["tip"] == "plaka" &&
                            string.Equals((string)h["stokKodu"], grup.Key, StringComparison.OrdinalIgnoreCase));
                    if (hammadde == null)
                    {
                        eslenemeyenler.Add(grup.Count() + " parça — '" + grup.Key + "' kodlu bir plaka hammaddesi ÜretimOS'ta bulunamadı " +
                            "(TAHMİN EDİLMEDİ). Önce Hammaddeler sayfasından bu kodu tanımlayın.");
                        continue;
                    }
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
                    sonucSatirlari.Add("'" + grupEtiketi + "' — " + grup.Count() + " parça MEVCUT açık kesim satırına eklendi.");
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
                    sonucSatirlari.Add("'" + grupEtiketi + "' — " + grup.Count() + " parça için YENİ kesim satırı açıldı.");
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

        // page_nesting.js'teki kesimPayiHesapla'nın (CNC/Flat-Tabla/freze dalı
        // — bu panel sadece panel malzemesi nestler, lineer testere DEĞİL)
        // AYNI mantıkla C# portu: önce ÜretimOS'taki varsayılan freze takımının
        // çapı, o seçili değilse ayarlar.frezeKayipPayiMM, O DA yoksa (sunucuya
        // hiç bağlanılamadıysa) data.js'teki VARSAYILAN_AYARLAR sabiti (TAHMİN
        // DEĞİL, web'in kendi varsayılanı — bkz. o dosyadaki aynı satır).
        private (double kesimPayi, double kenarBosluk) KesimPayiVeKenarBosluguHesapla()
        {
            const double VarsayilanFrezeKayipPayiMM = 3;
            const double VarsayilanKenarBosluguMM = 10;

            double kenarBosluk = (double?)_ayarlar["plakaKenarBosluguMM"] ?? VarsayilanKenarBosluguMM;

            string frezeTakimId = (string)_ayarlar["varsayilanFrezeTakimId"];
            JObject takim = !string.IsNullOrEmpty(frezeTakimId)
                ? _cncTakimlari.OfType<JObject>().FirstOrDefault(k => (string)k["id"] == frezeTakimId)
                : null;
            double kesimPayi = (takim != null && (double?)takim["capMm"] > 0)
                ? (double)takim["capMm"]
                : ((double?)_ayarlar["frezeKayipPayiMM"] ?? VarsayilanFrezeKayipPayiMM);

            return (kesimPayi, kenarBosluk);
        }

        // Kullanıcı isteği: "üretimosta istemiyorum solidde oluşturu
        // düzenleyip dxf alacağız optimize edilmiş nesting çıktısını" —
        // ÜretimOS'a HİÇBİR ŞEY GÖNDERMEZ. Seçili parçaları, yukarıda
        // seçilmiş plaka boyutuna, NestingHesaplayici (page_nesting.js ile
        // AYNI skyline algoritması) ile yerleştirir; her plaka için AYRI,
        // SolidWorks'te AÇIK kalan, düzenlenebilir bir sketch/parça üretir.
        private async System.Threading.Tasks.Task SolidWorksteNestle()
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

            // Kullanıcı isteği: "kenar mesafelerini ve freze bıçak
            // mesafelerini ayarlamak için nesting modülüne eklemeler yap" —
            // Reçete Ağacı/ribbon ile AYNI ayar penceresi; yukarıda seçilmiş
            // plaka boyutu (varsa) önerilen değer olarak gelir.
            // KULLANICI İSTEĞİ: "hiçbir şekilde anma ölçüsü almasın nesting
            // yerleşiminde tamamen parça çizimi üzerinden işlem yapılsın" —
            // En/Boy, s.Width/s.Lenght (özel alan/denklem ölçüsü) yerine
            // parçanın gerçek geometrisinden (s.Geometri) alınır. Geometrisi
            // okunamayan parça anma ölçüsüne GERİ DÜŞMEZ, atlanır.
            // Girdiler ayar penceresinden ÖNCE hazırlanır — pencere her
            // parçayı En/Boy/Kalınlık ile listeleyip parça başına yön sorar.
            var atlananlar = secilenler
                .Where(s => s.Geometri == null || s.Geometri.GenislikMm <= 0 || s.Geometri.YukseklikMm <= 0)
                .Select(s => s.Desc + " (parça geometrisi okunamadı)")
                .ToList();
            var parcaGirdileri = secilenler
                .Where(s => s.Geometri != null && s.Geometri.GenislikMm > 0 && s.Geometri.YukseklikMm > 0)
                .Select(s =>
            {
                var geometri = s.Geometri;
                Tanilama.Kaydet($"Nesting girdisi '{s.Desc}': geometri={geometri.GenislikMm}x{geometri.YukseklikMm} " +
                    $"(anma ölçüsü {s.Width}x{s.Lenght} KULLANILMADI) | dishat={geometri.DisHat.Count} nokta, " +
                    $"delik={geometri.NestingDelikleri().Count}/{geometri.Delikler.Count} (yuzeye dik/toplam), form={geometri.Formlar.Count}");
                return new NestingParcaGirdi
                {
                    Ad = s.Desc,
                    En = geometri.GenislikMm,
                    Boy = geometri.YukseklikMm,
                    KalinlikMm = geometri.KalinlikMm,
                    Adet = s.Qty,
                    GrainKilitli = !string.IsNullOrWhiteSpace(s.TahilYonu),
                    YmKod = s.SapCode ?? "",
                    SwParcaAdi = string.IsNullOrEmpty(s.ModelYolu) ? "" : System.IO.Path.GetFileNameWithoutExtension(s.ModelYolu),
                    Delikler = geometri.NestingDelikleri(),
                    Formlar = geometri.NestingFormlari(),
                    DisHat = geometri.NestingDisHatti()
                };
            }).ToList();

            var (ufKesimPayi, ufKenarBosluk) = KesimPayiVeKenarBosluguHesapla();
            if (!NestingCalistirici.NestingAyarlariSor(this, ufKesimPayi, ufKenarBosluk, _manuelPlakaBoy, _manuelPlakaEn, parcaGirdileri, out var nestingAyari)) return;
            PlakaBoyutuSec(nestingAyari.PlakaBoyMm, nestingAyari.PlakaEnMm);

            string cikisKlasoru;
            using (var klasorDlg = new FolderBrowserDialog { Description = "Nesting sonucu parça dosyalarının kaydedileceği klasör" })
            {
                if (klasorDlg.ShowDialog() != DialogResult.OK) return;
                cikisKlasoru = klasorDlg.SelectedPath;
            }

            string partSablon = UretimOSAddin.SablonYoluBul(_app, "Part.prtdot", UretimOSAddin.PART_SABLON_YOLU);
            if (!System.IO.File.Exists(partSablon))
            {
                MessageBox.Show("Parça şablonu bulunamadı:\n" + partSablon +
                    "\n\nBu, SolidWorks'ün kendi stok şablonudur — normalde 'Sistem Seçenekleri > Dosya " +
                    "Konumları > Belge Şablonları' klasöründe hazır bulunur.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            _solidworksteNestleBtn.Enabled = false;
            _durumEtiketi.ForeColor = Color.DarkBlue;
            _durumEtiketi.Text = "Nesting hesaplanıyor…";
            Application.DoEvents();

            double kesimPayi = nestingAyari.BicakMesafesiMm, kenarBosluk = nestingAyari.KenarBoslukMm;

            // KULLANICI İSTEĞİ: "onaya gerek yok tüm yüzeydeki delikleri
            // nesting çizimine ekle" — SolidWorks nesting sketch'ine delik/
            // form/dış hat onay kapısı OLMADAN eklenir. ÜretimOS'a gönderme
            // yolundaki (ParcaNesnesiOlustur) onay kapısı DEĞİŞMEDİ.
            // (parcaGirdileri/atlananlar ayar penceresinden önce hazırlandı.)
            foreach (var a in atlananlar) Tanilama.Kaydet("Nesting girdisi ATLANDI: " + a);
            var sonuc = NestingHesaplayici.Hesapla(_manuelPlakaEn.Value, _manuelPlakaBoy.Value, kenarBosluk, kesimPayi, parcaGirdileri,
                nestingAyari.GrainYonuneUy, nestingAyari.EtkinSabitAci);
            if (atlananlar.Count > 0)
                sonuc.YerlesemeyenUyarilari.Insert(0, "ATLANAN parçalar: " + string.Join(", ", atlananlar));

            if (sonuc.Plakalar.Count == 0)
            {
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Hiçbir parça yerleştirilemedi.";
                _sonucKutusu.Text = string.Join("\r\n", sonuc.YerlesemeyenUyarilari);
                _solidworksteNestleBtn.Enabled = true;
                return;
            }

            string kod = System.IO.Path.GetFileNameWithoutExtension(_aktifBelge.GetPathName());
            if (string.IsNullOrWhiteSpace(kod)) kod = "NESTING";

            _durumEtiketi.Text = sonuc.Plakalar.Count + " plaka için SolidWorks'te sketch oluşturuluyor…";
            Application.DoEvents();

            var olusturucu = new NestingYerlesimOlusturucu(_app);
            var dosyalar = olusturucu.Olustur(sonuc, _manuelPlakaEn.Value, _manuelPlakaBoy.Value, kod, cikisKlasoru, partSablon);

            var raporSatirlari = new List<string>();
            raporSatirlari.Add(sonuc.Plakalar.Count + " plaka, " + dosyalar.Count + " dosya başarıyla oluşturuldu (SolidWorks'te AÇIK bırakıldı):");
            raporSatirlari.AddRange(dosyalar);
            if (sonuc.YerlesemeyenUyarilari.Count > 0)
            {
                raporSatirlari.Add("");
                raporSatirlari.Add("UYARILAR:");
                raporSatirlari.AddRange(sonuc.YerlesemeyenUyarilari);
            }
            if (olusturucu.Uyarilar.Count > 0)
            {
                raporSatirlari.Add("");
                raporSatirlari.AddRange(olusturucu.Uyarilar);
            }
            raporSatirlari.Add("");
            raporSatirlari.Add("DXF almak için: SolidWorks'te açılan parçada sketch'i düzenleme moduna girip " +
                "Dosya > Farklı Kaydet'te dosya tipini DXF/DWG seçin (SolidWorks'ün kendi, standart sketch-DXF dışa aktarımı).");
            _sonucKutusu.Text = string.Join("\r\n", raporSatirlari);

            _durumEtiketi.ForeColor = dosyalar.Count > 0 ? Color.DarkGreen : Color.DarkRed;
            _durumEtiketi.Text = dosyalar.Count + "/" + sonuc.Plakalar.Count + " plaka SolidWorks'te oluşturuldu.";
            _solidworksteNestleBtn.Enabled = true;

            if (dosyalar.Count > 0)
            {
                MessageBox.Show(dosyalar.Count + " plaka SolidWorks'te oluşturuldu ve açık bırakıldı. " +
                    "Düzenleyip DXF olarak dışa aktarabilirsiniz (sketch düzenleme modunda Dosya > Farklı Kaydet > DXF/DWG).",
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
