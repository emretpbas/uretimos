using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json.Linq;
using SolidWorks.Interop.sldworks;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // REÇETE AĞACI PANELİ — kullanıcı isteği: "üretimostaki ağaç görünümünde
    // reçeteyi solidworkstede uygula, alt kalem ekle sürükle bırak, paket,
    // yarımamul, alt montaj, hırdavat, plaka, kenar bandı vb."
    //
    // SONRAKİ İSTEK (bu sürümde eklendi): "alt kırılımlı reçete almak için
    // soldaki parça ve alt montaj listesindeki kalemlerin hangi pakette
    // olduğunu ve paket ölçü ve ağırlığını yazalım, yarımamul alt
    // kırılımlarını ve rotalarını girelim ve bu ÜretimOS'taki reçete
    // sistemine AYNI ŞEKİLDE aktarılsın."
    //
    // ÇOK KATMANLI AĞAÇ (V1 sınırlaması KALDIRILDI): Ağaç artık ÜretimOS'un
    // kendi page_recete_agac.js:renderNode'u ile AYNI mantıkla ÇALIŞIYOR —
    // her kalem, KENDİ reçetesi varsa (urun/yarımamül/altmontaj/paket
    // tipindeyse) alt düğümler olarak o reçeteyi de gösterir; sürükle-bırak/
    // "Ekle" HANGİ düğümün üstüne bırakıldıysa O KARTIN reçetesine eklenir
    // (kök şart değil). Döngüsel/çok derin referanslara karşı MAKS_DERINLIK
    // ile sınırlanır (TAHMİN/otomatik düzeltme YAPILMAZ, yalnızca güvenlik).
    //
    // PAKET ÖLÇÜ/AĞIRLIK: ÜretimOS'un page_recete_agac.js:openPaketOlcuDuzenle
    // ile AYNI alanlar (en/boy/yükseklik/netAgirlik/brutAgirlik) — kök kart
    // bir paketse üst panelden, ağaçtaki HERHANGİ bir paket kaleminden sağ
    // tık menüsünden düzenlenir. "Taslak" mantığı AYNI: değişiklik yalnızca
    // '✓ ÜretimOS'a Kaydet' ile kalıcı olur.
    //
    // Aynı EtiketlemePaneli.cs gibi: düz WinForms (SolidWorks PropertyManager-
    // Page COM riski YOK), ÜretimOS bağlantısı BaglantiAyarlari.cs üzerinden
    // (kimlik bilgisi asla kod/git'e karışmaz).
    // ════════════════════════════════════════════════════════════════════════
    public class ReceteAgaciPaneli : Form
    {
        private readonly ModelDoc2 _hedefModel;
        private UretimOSApiClient _istemci;

        private JArray _urunler, _yarimamuller, _altMontajlar, _paketler, _hammaddeler, _receteler, _rotalar;
        private bool _verilerYuklendi;

        private string _kokTip;   // urun | yarimamul | altmontaj | paket
        private JObject _kokKart; // { id, kod, ad, ... }

        // Kalem tipinden bağımsız, HER SEVİYEDE aynı mantıkla kullanılan
        // "değişen reçeteler" kayıt defteri — anahtar "tip|kartId". Bir kart
        // henüz reçetesi yoksa (ilk kez kalem eklendiğinde) burada TASLAK
        // olarak oluşturulur, sunucuya YALNIZCA Kaydet'te yazılır.
        private readonly Dictionary<string, JObject> _degisenReceteler = new Dictionary<string, JObject>();
        // Ölçü/ağırlığı düzenlenen paket kartları — Kaydet'te 'paketler'e yazılır.
        private readonly List<JObject> _degisenPaketler = new List<JObject>();

        // Döngüsel/çok derin referanslara karşı güvenlik sınırı — TAHMİN/
        // otomatik döngü tespiti YAPILMAZ, yalnızca sonsuz özyinelemeyi önler.
        private const int MAKS_DERINLIK = 6;

        private Label _durumEtiketi;
        private Label _kokKartEtiketi;
        private Button _kokKartSecBtn;
        // Kullanıcı isteği: "reçete ağacı sekmesine ilk bastığımda solidworkste
        // olan ve tüm componets, part ve assamblyler sıralansın" — bu ağaç
        // AKTİF belgedeki (parça/montaj) TÜM bileşenleri, panel açılır açılmaz
        // (herhangi bir ön-seçim GEREKMEDEN) listeler. Bir düğüme tıklanınca o
        // bileşenin ÜretimOS kartı (varsa URETIMOS_KOD'a göre otomatik, yoksa
        // elle) çözülür ve aşağıdaki reçete editörü O kart için açılır.
        private TreeView _bilesenAgaciGorunumu;
        private BilesenDugumu _seciliBilesenDugumu;
        private TreeView _agacGorunumu;
        private ComboBox _paletTipKutusu;
        private TextBox _paletAramaKutusu;
        private ListBox _paletListesi;
        private List<PaletOgesi> _paletTumOgeler = new List<PaletOgesi>();
        private Button _kaydetBtn;

        // Rota (yarı mamül) alanı — kullanıcı isteği: "rota seç ve oluştur da
        // var, her yarımamülde onu da ekleyelim". ÜretimOS'ta yarımamul
        // kartının kendi 'rotaId' alanı vardır (bkz. page_yarimamul.js) —
        // bu panel hem KÖK kart bir yarımamül İSE, hem de ağaca eklenen HER
        // yarımamül kalemi için (sağ tık menüsünden) aynı seç/oluştur
        // akışını sunar.
        private Panel _rotaPanel;
        private ComboBox _rotaKutusu;

        // Paket ölçü/ağırlık alanı — KÖK kart bir paket İSE üst panelde
        // özet + "Düzenle…" gösterir (ağaçtaki paket kalemleri için AYNI
        // diyalog sağ tık menüsünden açılır — bkz. PaketOlcuAgirlikDuzenle).
        private Panel _paketOlcuPanel;
        private Label _paketOlcuEtiketi;

        private class PaletOgesi
        {
            public string KalemTipi;    // urun|yarimamul|altmontaj|paket|hammadde — receteye YAZILACAK tip
            public string GosterimTipi; // Paket/Yarı Mamül/Alt Montaj/Hırdavat/Plaka/Kenar Bandı — kullanıcıya gösterilen
            public string Id, Kod, Ad;
            // TAM "kullanıldığı yerler" analizi (yarımamül/altmontaj için) —
            // kullanıcı isteği: "hangi pakette olduğunu ... yazalım" ilk
            // sürümde yalnızca İLK eşleşen paketi gösteriyordu; bu SONRAKİ
            // istekle GENİŞLETİLDİ: artık bu kartın kalem olarak geçtiği
            // TÜM üst kartlar (paket/alt montaj/ürün fark etmeksizin, hepsi
            // aranır) burada tutulur — bkz. NeredeKullaniliyor.
            public List<(string ustTip, JObject ustKart, double miktar)> KullanimListesi;
            // Paket ölçü/ağırlık özeti (paket kalemleri için).
            public string OlcuAgirlikMetni;
            public override string ToString()
            {
                string ek = "";
                if (KullanimListesi != null && KullanimListesi.Count == 1)
                    ek += $"  [{TipGosterimAdi(KullanimListesi[0].ustTip)}: {KullanimListesi[0].ustKart["kod"]}]";
                else if (KullanimListesi != null && KullanimListesi.Count > 1)
                    ek += $"  [{KullanimListesi.Count} yerde kullanılıyor — sağ tık: detay]";
                if (!string.IsNullOrEmpty(OlcuAgirlikMetni)) ek += $"  ({OlcuAgirlikMetni})";
                return $"[{GosterimTipi}] {Kod} — {Ad}{ek}";
            }
        }

        public ReceteAgaciPaneli(ModelDoc2 hedefModel)
        {
            _hedefModel = hedefModel;
            KurulumYap();
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            await VerileriYukleVeBaslat();
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — Reçete Ağacı (Alt Kalem Ekle, Çok Katmanlı)";
            Width = 900;
            Height = 680;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(760, 520);

            // ── ÜST: kök kart bilgisi ────────────────────────────────────────
            var ustPanel = new Panel { Dock = DockStyle.Top, Height = 56, Padding = new Padding(10) };
            _kokKartEtiketi = new Label { AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Text = "Kart eşleştiriliyor…" };
            _kokKartSecBtn = new Button { Text = "Farklı Kart Seç…", Dock = DockStyle.Right, Width = 140, Enabled = false };
            _kokKartSecBtn.Click += (s, e) => KokKartSeciciAc();
            ustPanel.Controls.Add(_kokKartEtiketi);
            ustPanel.Controls.Add(_kokKartSecBtn);

            // ── ROTA (yalnızca kök kart bir YARI MAMÜL ise görünür) ──────────
            _rotaPanel = new Panel { Dock = DockStyle.Top, Height = 34, Padding = new Padding(10, 4, 10, 4), Visible = false };
            _rotaKutusu = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList, Enabled = false };
            var rotaBtn = new Button { Text = "Rota Seç / Oluştur…", Dock = DockStyle.Right, Width = 150 };
            rotaBtn.Click += async (s, e) => { if (_kokKart != null) { await RotaSecVeyaOlusturDialogAc(_kokKart); UstBilgiPanelleriGuncelle(); } };
            _rotaPanel.Controls.Add(_rotaKutusu);
            _rotaPanel.Controls.Add(rotaBtn);

            // ── PAKET ÖLÇÜ/AĞIRLIK (yalnızca kök kart bir PAKET ise görünür) ──
            // Kullanıcı isteği: "paket ölçü ve ağırlığını yazalım" — ÜretimOS'un
            // page_recete_agac.js:openPaketOlcuDuzenle ile AYNI alanlar.
            _paketOlcuPanel = new Panel { Dock = DockStyle.Top, Height = 34, Padding = new Padding(10, 4, 10, 4), Visible = false };
            _paketOlcuEtiketi = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.DarkSlateGray };
            var paketOlcuBtn = new Button { Text = "Paket Ölçü/Ağırlık Düzenle…", Dock = DockStyle.Right, Width = 190 };
            paketOlcuBtn.Click += (s, e) => { if (_kokKart != null) { PaketOlcuAgirlikDuzenle(_kokKart); UstBilgiPanelleriGuncelle(); } };
            _paketOlcuPanel.Controls.Add(_paketOlcuEtiketi);
            _paketOlcuPanel.Controls.Add(paketOlcuBtn);

            // ── SOL: ekleme paleti ───────────────────────────────────────────
            var solPanel = new Panel { Dock = DockStyle.Left, Width = 320, Padding = new Padding(8) };
            var paletBaslik = new Label { Text = "Ekle — sürükleyip ağaçta bir kartın ÜSTÜNE bırakın (o kartın reçetesine eklenir)", Dock = DockStyle.Top, Height = 32, AutoSize = false };
            _paletTipKutusu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
            _paletTipKutusu.Items.AddRange(new object[] { "Paket", "Yarı Mamül", "Alt Montaj", "Hırdavat", "Plaka", "Kenar Bandı" });
            _paletTipKutusu.SelectedIndexChanged += (s, e) => PaletiFiltrele();
            _paletAramaKutusu = new TextBox { Dock = DockStyle.Top };
            _paletAramaKutusu.TextChanged += (s, e) => PaletiFiltrele();
            var aramaEtiket = new Label { Text = "Kod/ad ara:", Dock = DockStyle.Top, Height = 18, AutoSize = false };
            _paletListesi = new ListBox { Dock = DockStyle.Fill, AllowDrop = false, IntegralHeight = false };
            _paletListesi.MouseDown += PaletListesi_MouseDown;
            // TAM "kullanıldığı yerler" analizi — sağ tık ile detay diyaloğu.
            var paletSagTikMenu = new ContextMenuStrip();
            var neredeMenuOgesi = paletSagTikMenu.Items.Add("Nerede Kullanılıyor?", null, (s, e) =>
            {
                if (_paletListesi.SelectedItem is PaletOgesi oge) NeredeKullaniliyorGoster(oge);
            });
            paletSagTikMenu.Opening += (s, e) =>
            {
                var oge = _paletListesi.SelectedItem as PaletOgesi;
                neredeMenuOgesi.Enabled = oge?.KullanimListesi != null && oge.KullanimListesi.Count > 0;
            };
            _paletListesi.ContextMenuStrip = paletSagTikMenu;
            _paletListesi.MouseDown += (s, e) =>
            {
                if (e.Button == MouseButtons.Right)
                {
                    int idx = _paletListesi.IndexFromPoint(e.Location);
                    if (idx >= 0) _paletListesi.SelectedIndex = idx;
                }
            };
            var ekleBtn = new Button { Text = "Ekle → (seçili ağaç düğümüne, yoksa köke)", Dock = DockStyle.Bottom };
            ekleBtn.Click += (s, e) => SeciliPaletOgesiniEkle();
            // Kullanıcı isteği: "Sıfırdan bir ürün için TÜM alt kartları
            // (hammadde, plaka, kenar bandı, hırdavat vb.) da SolidWorks
            // içinden, panel açıkken oluşturabilme özelliği istiyorum" —
            // yukarıdaki tip kutusunda SEÇİLİ olan tipte yeni bir kart
            // oluşturur (bkz. YeniKartFormlari.cs), ÜretimOS'a hemen kaydeder
            // ve paleti tazeler — reçeteye eklemek için ayrıca "Ekle"ye
            // basılır (kart oluşturma ile reçeteye ekleme BİLEREK ayrı adım,
            // ikisini birden yapmak zorunlu DEĞİL).
            var yeniKartBtn = new Button { Text = "+ Yeni Kart Oluştur…", Dock = DockStyle.Bottom };
            yeniKartBtn.Click += async (s, e) => await YeniKartOlustur();

            solPanel.Controls.Add(_paletListesi);
            solPanel.Controls.Add(ekleBtn);
            solPanel.Controls.Add(yeniKartBtn);
            solPanel.Controls.Add(_paletAramaKutusu);
            solPanel.Controls.Add(aramaEtiket);
            solPanel.Controls.Add(_paletTipKutusu);
            solPanel.Controls.Add(paletBaslik);

            // ── SAĞ: SolidWorks bileşen ağacı (ÜST) + seçili kartın reçetesi (ALT) ──
            var sagPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };

            // Kullanıcı isteği: "reçete ağaç editöründeki mantıkta bir düzenle
            // açılsın ... eğer bunu uretimostaki mevcut kartlarla eşleştirdiysem
            // yine o bilgilerle gelsin ancak istersem değiştirebileyim" — bu
            // bölüm SolidWorks'teki GERÇEK bileşen ağacını gösterir; ✓ zaten
            // eşleşmiş, ⚠ kod var ama karta karşılık gelmiyor, — hiç eşleşmemiş.
            var bilesenBaslik = new Label
            {
                Text = "SolidWorks bileşen ağacı — bir bileşen seçin (✓ eşleşmiş, ⚠ kart bulunamadı, — eşleşmemiş)",
                Dock = DockStyle.Top, Height = 24
            };
            _bilesenAgaciGorunumu = new TreeView { Dock = DockStyle.Top, Height = 220, HideSelection = false };
            _bilesenAgaciGorunumu.AfterSelect += (s, e) => BilesenSecildi(e.Node?.Tag as BilesenDugumu);

            var agacBaslik = new Label { Text = "Seçili bileşenin ÜretimOS reçetesi ve alt kırılımları — çift tık: miktar değiştir, sağ tık: diğer işlemler", Dock = DockStyle.Top, Height = 24 };
            _agacGorunumu = new TreeView { Dock = DockStyle.Fill, AllowDrop = true, HideSelection = false, LabelEdit = false };
            _agacGorunumu.DragEnter += (s, e) => { e.Effect = e.Data.GetDataPresent(typeof(PaletOgesi)) ? DragDropEffects.Copy : DragDropEffects.None; };
            _agacGorunumu.DragDrop += AgacGorunumu_DragDrop;
            _agacGorunumu.NodeMouseDoubleClick += (s, e) => MiktarDuzenle(e.Node);
            var sagTikMenu = new ContextMenuStrip();
            sagTikMenu.Items.Add("Miktar Değiştir…", null, (s, e) => { if (_agacGorunumu.SelectedNode != null) MiktarDuzenle(_agacGorunumu.SelectedNode); });
            sagTikMenu.Items.Add("Kaldır", null, (s, e) => { if (_agacGorunumu.SelectedNode != null) KalemKaldir(_agacGorunumu.SelectedNode); });
            var rotaMenuOgesi = sagTikMenu.Items.Add("Rota Seç / Oluştur…", null, async (s, e) =>
            {
                if (_agacGorunumu.SelectedNode?.Tag is JObject kalem && (string)kalem["tip"] == "yarimamul")
                {
                    var kart = FindKart("yarimamul", (string)kalem["refId"]);
                    if (kart != null)
                    {
                        await RotaSecVeyaOlusturDialogAc(kart);
                        AgaciYenidenCiz();
                    }
                }
            });
            var paketOlcuMenuOgesi = sagTikMenu.Items.Add("Paket Ölçü / Ağırlık Düzenle…", null, (s, e) =>
            {
                if (_agacGorunumu.SelectedNode?.Tag is JObject kalem && (string)kalem["tip"] == "paket")
                {
                    var kart = FindKart("paket", (string)kalem["refId"]);
                    if (kart != null)
                    {
                        PaketOlcuAgirlikDuzenle(kart);
                        AgaciYenidenCiz();
                    }
                }
            });
            // Bu öğeler SADECE ilgili tipte bir kalem seçiliyken etkinleştirilir
            // — menü açılmadan hemen önce kontrol edilir (tahmin/yanlış işlem yok).
            sagTikMenu.Opening += (s, e) =>
            {
                string secilenTip = (_agacGorunumu.SelectedNode?.Tag as JObject)?["tip"]?.ToString();
                rotaMenuOgesi.Enabled = secilenTip == "yarimamul";
                paketOlcuMenuOgesi.Enabled = secilenTip == "paket";
            };
            _agacGorunumu.ContextMenuStrip = sagTikMenu;
            _agacGorunumu.NodeMouseClick += (s, e) => _agacGorunumu.SelectedNode = e.Node;
            sagPanel.Controls.Add(_agacGorunumu);
            sagPanel.Controls.Add(agacBaslik);
            sagPanel.Controls.Add(_bilesenAgaciGorunumu);
            sagPanel.Controls.Add(bilesenBaslik);

            // ── ALT: durum + kaydet ──────────────────────────────────────────
            var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 50, Padding = new Padding(8) };
            _durumEtiketi = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.DarkSlateGray };
            _kaydetBtn = new Button { Text = "✓ ÜretimOS'a Kaydet", Dock = DockStyle.Right, Width = 160, Enabled = false, Font = new Font(Font, FontStyle.Bold) };
            _kaydetBtn.Click += async (s, e) => await KaydetTikla();
            // Kullanıcı isteği: "Üretimostaki reçeteleri xml formatında
            // kaydedelim ve her satırın benzersiz unique id bilgiside olsun"
            // — ÜretimOS'un kendi veri deposu (JSON) DEĞİŞMİYOR, bu SADECE
            // yerel bir dışa aktarma (export). Her <Kalem> zaten reçeteye
            // eklenirken atanan benzersiz "RK-..." id'yi taşır (bkz.
            // KalemEkle) — eski/id'siz kalemler için dışa aktarma ANINDA
            // (kalıcı olmayan) bir id üretilir, bkz. ReceteyiXmlOlarakDisaAktar.
            var xmlDisaAktarBtn = new Button { Text = "Reçeteyi XML Olarak Dışa Aktar…", Dock = DockStyle.Right, Width = 210 };
            xmlDisaAktarBtn.Click += (s, e) => ReceteyiXmlOlarakDisaAktar();
            altPanel.Controls.Add(_durumEtiketi);
            altPanel.Controls.Add(_kaydetBtn);
            altPanel.Controls.Add(xmlDisaAktarBtn);

            // NOT: Dock=Top/Bottom/Left panelleri arasında sıralama, Controls
            // koleksiyonuna EKLENME SIRASININ TERSİNE göre işler — SON eklenen
            // aynı kenara en YAKIN (en dıştaki) olur. _rotaPanel/_paketOlcuPanel
            // (ikisi de karşılıklı dışlayan görünürlükte) ustPanel'in HEMEN
            // ALTINDA görünmesi için ustPanel'den ÖNCE eklenmesi gerekir.
            Controls.Add(sagPanel);
            Controls.Add(solPanel);
            Controls.Add(altPanel);
            Controls.Add(_paketOlcuPanel);
            Controls.Add(_rotaPanel);
            Controls.Add(ustPanel);
        }

        // ── VERİ YÜKLEME ─────────────────────────────────────────────────────
        private async System.Threading.Tasks.Task VerileriYukleVeBaslat()
        {
            _durumEtiketi.Text = "ÜretimOS'a bağlanılıyor…";
            var ayar = BaglantiAyarlari.Yukle();
            if (ayar == null)
            {
                BaglantiAyarlari.OrnekDosyaOlustur();
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "Yerel bağlantı ayarı yok. Örnek dosya oluşturuldu: " + BaglantiAyarlari.DosyaYoluGoster();
                _kokKartEtiketi.Text = "ÜretimOS'a bağlanılamadı — bu panel sunucu erişimi gerektirir.";
                return;
            }

            try
            {
                _istemci = new UretimOSApiClient(ayar.SunucuUrl);
                if (!await _istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre))
                {
                    _durumEtiketi.ForeColor = Color.DarkRed;
                    _durumEtiketi.Text = "Giriş başarısız — " + BaglantiAyarlari.DosyaYoluGoster() + " içindeki bilgileri kontrol edin.";
                    return;
                }

                _urunler = JArray.Parse(await _istemci.Getir("urunler") ?? "[]");
                _yarimamuller = JArray.Parse(await _istemci.Getir("yarimamuller") ?? "[]");
                _altMontajlar = JArray.Parse(await _istemci.Getir("altMontajlar") ?? "[]");
                _paketler = JArray.Parse(await _istemci.Getir("paketler") ?? "[]");
                _hammaddeler = JArray.Parse(await _istemci.Getir("hammaddeler") ?? "[]");
                _receteler = JArray.Parse(await _istemci.Getir("receteler") ?? "[]");
                _rotalar = JArray.Parse(await _istemci.Getir("rotalar") ?? "[]");
                _verilerYuklendi = true;

                PaletiFiltrele();
                _kokKartSecBtn.Enabled = true;

                // Kullanıcı isteği: "ilk bastığımda solidworkste olan ve tüm
                // componets, part ve assamblyler sıralansın" — TEK bir önceden
                // seçilmiş bileşen yerine, aktif belgedeki (parça/montaj) TÜM
                // bileşen ağacı burada çıkarılır ve doğrudan listelenir. Her
                // düğümün ÜretimOS kart eşleşmesi (URETIMOS_KOD'a göre) ✓/⚠/—
                // simgesiyle gösterilir; TAHMİN/otomatik kart OLUŞTURMA YOK.
                var bilesenKokleri = BilesenAgaci.Cikar(_hedefModel);
                BilesenAgaciniCiz(bilesenKokleri);

                int toplamBilesen = ToplamBilesenSayisi(bilesenKokleri);
                _kokKartEtiketi.Text = toplamBilesen > 0
                    ? "Yukarıdaki bileşen ağacından bir bileşen seçin — kartı otomatik eşleşirse burada görünür, eşleşmezse 'Farklı Kart Seç…' ile eşleştirin."
                    : "Aktif belgede bileşen bulunamadı.";
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ Bağlandı — {toplamBilesen} bileşen listelendi, {_receteler.Count} reçete, {_hammaddeler.Count} hammadde yüklendi.";
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("ReceteAgaciPaneli.VerileriYukleVeBaslat HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Veri çekilemedi: " + ex.Message;
            }
        }

        // ── SOLIDWORKS BİLEŞEN AĞACI (TÜM component/part/assembly'ler) ───────
        private static int ToplamBilesenSayisi(List<BilesenDugumu> dugumler) =>
            dugumler.Sum(d => 1 + ToplamBilesenSayisi(d.Cocuklar));

        private void BilesenAgaciniCiz(List<BilesenDugumu> kokDugumler)
        {
            _bilesenAgaciGorunumu.Nodes.Clear();
            foreach (var d in kokDugumler)
                _bilesenAgaciGorunumu.Nodes.Add(BilesenTreeNodeOlustur(d));
            _bilesenAgaciGorunumu.ExpandAll();
        }

        private TreeNode BilesenTreeNodeOlustur(BilesenDugumu dugum)
        {
            var node = new TreeNode(BilesenDugumMetni(dugum)) { Tag = dugum };
            foreach (var cocuk in dugum.Cocuklar)
                node.Nodes.Add(BilesenTreeNodeOlustur(cocuk));
            return node;
        }

        // ✓ = URETIMOS_KOD dolu VE bu koda sahip bir ÜretimOS kartı bulundu.
        // ⚠ = URETIMOS_KOD dolu ama karşılığı bir kart YOK (silinmiş/yazım hatası olabilir).
        // — = URETIMOS_KOD hiç yazılmamış (henüz eşleştirilmemiş).
        private string BilesenDugumMetni(BilesenDugumu dugum)
        {
            if (dugum.BelgeYuklenemedi) return "⚠ " + dugum.GosterimAdi;
            if (string.IsNullOrWhiteSpace(dugum.MevcutKod)) return "— (eşleşmemiş)  " + dugum.GosterimAdi;
            bool kartVar = KodileKartBul(dugum.MevcutKod).kart != null;
            return (kartVar ? "✓ " : "⚠ (kart bulunamadı) ") + dugum.MevcutKod + " — " + dugum.GosterimAdi;
        }

        // URETIMOS_KOD custom property'sine göre 4 reçete-taşıyan koleksiyonda
        // (ürün/yarımamül/altmontaj/paket) arar — hammadde kartları burada
        // ARANMAZ (bir SolidWorks bileşeni bir reçetenin KÖKÜ olabilir, ama
        // hammadde kartlarının kendi reçetesi yoktur).
        private (string tip, JObject kart) KodileKartBul(string kod)
        {
            if (string.IsNullOrWhiteSpace(kod)) return (null, null);
            foreach (var (liste, tip) in new[] { (_urunler, "urun"), (_yarimamuller, "yarimamul"), (_altMontajlar, "altmontaj"), (_paketler, "paket") })
            {
                var eslesen = liste?.FirstOrDefault(k => string.Equals((string)k["kod"], kod, StringComparison.OrdinalIgnoreCase)) as JObject;
                if (eslesen != null) return (tip, eslesen);
            }
            return (null, null);
        }

        // Bileşen ağacında bir düğüme tıklanınca çağrılır — kullanıcı isteği:
        // "eğer bunu uretimostaki mevcut kartlarla eşleştirdiysem yine o
        // bilgilerle gelsin ancak istersem değiştirebileyim": kod zaten
        // eşleşiyorsa OTOMATİK o kartın reçetesini açar; eşleşmiyorsa/boşsa
        // TAHMİN ETMEZ, kullanıcıyı 'Farklı Kart Seç…'e ya da '+ Yeni Kart
        // Oluştur…'a yönlendirir.
        private void BilesenSecildi(BilesenDugumu dugum)
        {
            _seciliBilesenDugumu = dugum;
            if (dugum == null || !_verilerYuklendi) return;

            if (dugum.BelgeYuklenemedi)
            {
                _kokTip = null; _kokKart = null;
                _kaydetBtn.Enabled = false;
                _agacGorunumu.Nodes.Clear();
                _rotaPanel.Visible = false;
                _paketOlcuPanel.Visible = false;
                _kokKartEtiketi.Text = dugum.GosterimAdi;
                return;
            }

            var (bulunanTip, bulunanKart) = KodileKartBul(dugum.MevcutKod);
            if (bulunanKart != null)
            {
                KokKartAyarla(bulunanTip, bulunanKart);
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ '{dugum.MevcutKod}' koduna göre kart otomatik eşleşti.";
            }
            else
            {
                _kokTip = null; _kokKart = null;
                _kaydetBtn.Enabled = false;
                _agacGorunumu.Nodes.Clear();
                _rotaPanel.Visible = false;
                _paketOlcuPanel.Visible = false;
                _kokKartEtiketi.Text = string.IsNullOrWhiteSpace(dugum.MevcutKod)
                    ? $"'{dugum.GosterimAdi}' henüz bir ÜretimOS kartıyla eşleştirilmemiş — 'Farklı Kart Seç…' ile eşleştirin ya da soldan '+ Yeni Kart Oluştur…' ile oluşturun."
                    : $"'{dugum.GosterimAdi}' için kayıtlı kod '{dugum.MevcutKod}' ile eşleşen bir ÜretimOS kartı bulunamadı — 'Farklı Kart Seç…' ile eşleştirin.";
            }
        }

        // Seçili SolidWorks bileşenini verilen karta eşleştirir VE bu eşleşmeyi
        // bileşenin KENDİ dosyasındaki URETIMOS_KOD özel alanına YAZAR —
        // kullanıcı isteği: "ister aynı dosyada ister farklı dosyada
        // çağrıldığında aynı bilgiler ile ... açılsın" — özel alan fiziksel
        // dosyayla birlikte taşındığı için bu, hangi montajdan açılırsa
        // açılsın (ya da dosya tek başına açılsa da) eşleşmenin KALICI
        // olmasını sağlar (bkz. KesimListesiCikarici.OzelAlanYaz).
        private void EslesmeYazVeUygula(string tip, JObject kart)
        {
            if (kart == null) return;
            if (_seciliBilesenDugumu?.Model != null)
            {
                string kod = (string)kart["kod"] ?? (string)kart["stokKodu"];
                if (!string.IsNullOrWhiteSpace(kod))
                {
                    try
                    {
                        KesimListesiCikarici.OzelAlanYaz(_seciliBilesenDugumu.Model, OzelAlanlar.KOD, kod);
                        _seciliBilesenDugumu.MevcutKod = kod;
                        if (_bilesenAgaciGorunumu.SelectedNode != null)
                            _bilesenAgaciGorunumu.SelectedNode.Text = BilesenDugumMetni(_seciliBilesenDugumu);
                    }
                    catch (Exception ex)
                    {
                        Tanilama.Kaydet("EslesmeYazVeUygula (URETIMOS_KOD yazılamadı) HATA: " + ex);
                    }
                }
            }
            KokKartAyarla(tip, kart);
        }

        // ── PALET (SOLDAKİ LİSTE) ────────────────────────────────────────────
        private void PaletiFiltrele()
        {
            if (!_verilerYuklendi) return;
            string secim = _paletTipKutusu.SelectedItem as string ?? "Paket";
            string arama = (_paletAramaKutusu.Text ?? "").Trim().ToLowerInvariant();

            IEnumerable<PaletOgesi> kaynak;
            switch (secim)
            {
                case "Paket": kaynak = _paketler.Select(k => Ogeye(k, "paket", "Paket")); break;
                case "Yarı Mamül": kaynak = _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül")); break;
                case "Alt Montaj": kaynak = _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj")); break;
                case "Hırdavat": kaynak = _hammaddeler.Where(h => (string)h["tip"] == "hirdavat").Select(k => OgeyeHammadde(k, "Hırdavat")); break;
                case "Plaka": kaynak = _hammaddeler.Where(h => (string)h["tip"] == "plaka").Select(k => OgeyeHammadde(k, "Plaka")); break;
                case "Kenar Bandı": kaynak = _hammaddeler.Where(h => (string)h["tip"] == "kenar_bandi").Select(k => OgeyeHammadde(k, "Kenar Bandı")); break;
                default: kaynak = Enumerable.Empty<PaletOgesi>(); break;
            }

            _paletTumOgeler = kaynak.Where(o => o != null &&
                (string.IsNullOrEmpty(arama) || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama)))
                .OrderBy(o => o.Kod).Take(300).ToList();

            _paletListesi.Items.Clear();
            _paletListesi.Items.AddRange(_paletTumOgeler.ToArray());
        }

        private PaletOgesi Ogeye(JToken k, string kalemTipi, string gosterimTipi)
        {
            string id = (string)k["id"];
            // TAM "kullanıldığı yerler" analizi — yarımamül/altmontaj için,
            // bu kartın kalem olarak geçtiği TÜM üst kartlar (bkz. NeredeKullaniliyor).
            var kullanim = (kalemTipi == "yarimamul" || kalemTipi == "altmontaj") ? NeredeKullaniliyor(kalemTipi, id) : null;
            return new PaletOgesi
            {
                KalemTipi = kalemTipi, GosterimTipi = gosterimTipi,
                Id = id, Kod = (string)k["kod"] ?? id, Ad = (string)k["ad"] ?? "",
                KullanimListesi = kullanim,
                OlcuAgirlikMetni = kalemTipi == "paket" ? PaketOlcuOzeti(k as JObject) : null
            };
        }

        private PaletOgesi OgeyeHammadde(JToken k, string gosterimTipi) => new PaletOgesi
        {
            KalemTipi = "hammadde", GosterimTipi = gosterimTipi,
            Id = (string)k["id"], Kod = (string)k["stokKodu"] ?? (string)k["id"], Ad = (string)k["ad"] ?? ""
        };

        // ── YENİ KART OLUŞTUR ────────────────────────────────────────────────
        // Palette tip kutusunda seçili olan tipte (Paket/Yarı Mamül/Alt Montaj/
        // Hırdavat/Plaka/Kenar Bandı) sıfırdan bir kart oluşturur, ÜretimOS'a
        // HEMEN kaydeder (ÜretimOS'un kendi web ekranlarındaki "Kaydet"
        // davranışıyla AYNI — reçete taslak değişiklikleri gibi ertelenmez)
        // ve yerel listeye/palete ekler.
        private async System.Threading.Tasks.Task YeniKartOlustur()
        {
            if (!_verilerYuklendi || _istemci == null) return;

            string secim = _paletTipKutusu.SelectedItem as string ?? "Paket";
            string kartTipi;
            switch (secim)
            {
                case "Paket": kartTipi = "paket"; break;
                case "Yarı Mamül": kartTipi = "yarimamul"; break;
                case "Alt Montaj": kartTipi = "altmontaj"; break;
                case "Hırdavat": kartTipi = "hirdavat"; break;
                case "Plaka": kartTipi = "plaka"; break;
                case "Kenar Bandı": kartTipi = "kenar_bandi"; break;
                default: return;
            }

            JObject yeniKart;
            using (var dlg = new YeniKartDialog(kartTipi, _hammaddeler))
            {
                if (dlg.ShowDialog(this) != DialogResult.OK || dlg.SonucKart == null) return;
                yeniKart = dlg.SonucKart;
            }

            string koleksiyonAnahtari =
                (kartTipi == "plaka" || kartTipi == "kenar_bandi" || kartTipi == "hirdavat") ? "hammaddeler"
                : kartTipi == "yarimamul" ? "yarimamuller"
                : kartTipi == "altmontaj" ? "altMontajlar"
                : "paketler";

            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Kart ÜretimOS'a kaydediliyor…";

            bool basarili;
            try
            {
                basarili = await _istemci.ToplukaEkleGuncelle(koleksiyonAnahtari,
                    new List<object> { yeniKart }, new List<object>());
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("YeniKartOlustur HATA: " + ex);
                basarili = false;
            }

            if (!basarili)
            {
                // KESİN TANI (bkz. api.php CAD_ENT_YAZILABILIR): "cad_entegrasyon"
                // rolü yalnızca yarimamuller/paketler/urunler/receteler/rotalar'a
                // yazabilir — hammaddeler VE altMontajlar dahil DEĞİL. Sessizce
                // "başarısız" demek yerine kullanıcıya GERÇEK nedeni açıklıyoruz.
                string ekAciklama = (koleksiyonAnahtari == "hammaddeler" || koleksiyonAnahtari == "altMontajlar")
                    ? "\n\nNot: 'cad_entegrasyon' rolündeki hesaplar hammadde/alt montaj kartı OLUŞTURAMAZ " +
                      "(ÜretimOS sunucusunda bilinçli bir kısıtlama) — yalnızca yarı mamül/paket oluşturabilir. " +
                      "baglanti.json'da tam yetkili bir hesap kullanmanız gerekebilir."
                    : "";
                MessageBox.Show(
                    "Kart ÜretimOS'a kaydedilemedi (sunucu reddetti)." + ekAciklama,
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Kart kaydedilemedi.";
                return;
            }

            switch (koleksiyonAnahtari)
            {
                case "hammaddeler": _hammaddeler.Add(yeniKart); break;
                case "yarimamuller": _yarimamuller.Add(yeniKart); break;
                case "altMontajlar": _altMontajlar.Add(yeniKart); break;
                case "paketler": _paketler.Add(yeniKart); break;
            }

            PaletiFiltrele();
            string yeniId = (string)yeniKart["id"];
            for (int i = 0; i < _paletListesi.Items.Count; i++)
            {
                if (_paletListesi.Items[i] is PaletOgesi oge && oge.Id == yeniId)
                {
                    _paletListesi.SelectedIndex = i;
                    break;
                }
            }

            // Kullanıcı isteği doğrultusunda: yeni oluşturulan kart, KENDİ
            // reçetesi olabilen bir tip İSE (yarımamül/alt montaj/paket —
            // hammadde/plaka/kenar bandı/hırdavat DEĞİL, onların kendi
            // reçetesi olmaz) VE ağaçta o an seçili bir SolidWorks bileşeni
            // varsa, bu yeni kart OTOMATİK olarak o bileşenle eşleştirilir
            // (URETIMOS_KOD'a yazılarak kalıcı olur) — "boş bileşen seç →
            // yeni kart oluştur" akışını tek adıma indirir.
            if (_seciliBilesenDugumu != null && (kartTipi == "yarimamul" || kartTipi == "altmontaj" || kartTipi == "paket"))
            {
                EslesmeYazVeUygula(kartTipi, yeniKart);
            }

            _durumEtiketi.ForeColor = Color.DarkGreen;
            _durumEtiketi.Text = $"✓ Yeni kart ÜretimOS'a kaydedildi: {(string)yeniKart["ad"]}";
        }

        // TAM "kullanıldığı yerler" analizi — bu (tip,id) kartının kalem
        // olarak geçtiği TÜM reçeteleri tarar (paket/alt montaj/ürün fark
        // etmeksizin — yalnızca paketId'li kayıtlarla SINIRLI DEĞİL, önceki
        // sürümdeki "yalnızca hangi pakette" sınırlaması KALDIRILDI).
        // O(n) — palet en fazla 300 öge gösterdiği ve reçete sayısı makul
        // olduğu için kabul edilebilir bir maliyettir. NOT: bu bir ANLIK
        // görüntüdür — ağaç panelinde yapılan (henüz Kaydet'e basılmamış)
        // taslak değişiklikler, palet yalnızca arama/tip filtresi
        // değiştiğinde yeniden hesaplandığı için hemen yansımayabilir.
        private List<(string ustTip, JObject ustKart, double miktar)> NeredeKullaniliyor(string tip, string id)
        {
            var sonuc = new List<(string, JObject, double)>();
            foreach (var r in _receteler.OfType<JObject>())
            {
                var kalemler = r["kalemler"] as JArray;
                if (kalemler == null) continue;
                foreach (var k in kalemler.OfType<JObject>())
                {
                    if ((string)k["tip"] == tip && (string)k["refId"] == id)
                    {
                        var (ustTip, ustKart) = SahipKartCoz(r);
                        if (ustKart != null) sonuc.Add((ustTip, ustKart, (double?)k["miktar"] ?? 1));
                    }
                }
            }
            return sonuc;
        }

        // Bir reçete kaydının SAHİBİ olan kartı bulur — urunId/yarimamulId/
        // altMontajId/paketId alanlarından hangisi doluysa o karttır.
        private (string tip, JObject kart) SahipKartCoz(JObject recete)
        {
            foreach (var tip in new[] { "urun", "yarimamul", "altmontaj", "paket" })
            {
                string kartId = (string)recete[AlanAdiTipten(tip)];
                if (string.IsNullOrEmpty(kartId)) continue;
                var kart = FindKart(tip, kartId);
                if (kart != null) return (tip, kart);
            }
            return (null, null);
        }

        private string PaketOlcuOzeti(JObject paket)
        {
            if (paket == null) return null;
            double en = (double?)paket["en"] ?? 0, boy = (double?)paket["boy"] ?? 0, yuk = (double?)paket["yukseklik"] ?? 0;
            double brut = (double?)paket["brutAgirlik"] ?? 0;
            if (en <= 0 && boy <= 0 && yuk <= 0 && brut <= 0) return "ölçü/ağırlık girilmemiş";
            return string.Format(CultureInfo.InvariantCulture, "{0:0.#}×{1:0.#}×{2:0.#} cm, {3:0.#} kg brüt", en, boy, yuk, brut);
        }

        // ── KÖK KART SEÇİMİ ──────────────────────────────────────────────────
        private void KokKartSeciciAc()
        {
            using (var secici = new Form { Text = "Reçete Hedefi Seç", Width = 480, Height = 520, StartPosition = FormStartPosition.CenterParent })
            {
                var tipKutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
                tipKutu.Items.AddRange(new object[] { "Ürün", "Yarı Mamül", "Alt Montaj", "Paket" });
                tipKutu.SelectedIndex = 0;
                var aramaKutu = new TextBox { Dock = DockStyle.Top };
                var liste = new ListBox { Dock = DockStyle.Fill };
                var tamamBtn = new Button { Text = "Seç", Dock = DockStyle.Bottom };

                List<PaletOgesi> mevcutListe = new List<PaletOgesi>();
                void Doldur()
                {
                    string tip = tipKutu.SelectedItem as string;
                    IEnumerable<PaletOgesi> kaynak = tip == "Ürün" ? _urunler.Select(k => Ogeye(k, "urun", "Ürün"))
                        : tip == "Yarı Mamül" ? _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül"))
                        : tip == "Alt Montaj" ? _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj"))
                        : _paketler.Select(k => Ogeye(k, "paket", "Paket"));
                    string arama = (aramaKutu.Text ?? "").Trim().ToLowerInvariant();
                    mevcutListe = kaynak.Where(o => string.IsNullOrEmpty(arama) || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama))
                        .OrderBy(o => o.Kod).Take(300).ToList();
                    liste.Items.Clear();
                    liste.Items.AddRange(mevcutListe.ToArray());
                }
                tipKutu.SelectedIndexChanged += (s, e) => Doldur();
                aramaKutu.TextChanged += (s, e) => Doldur();
                tamamBtn.Click += (s, e) =>
                {
                    if (liste.SelectedItem is PaletOgesi secilen)
                    {
                        var kart = FindKart(secilen.KalemTipi, secilen.Id);
                        // EslesmeYazVeUygula (KokKartAyarla YERİNE): seçilen kart,
                        // (varsa) ağaçta seçili SolidWorks bileşeninin KENDİ
                        // URETIMOS_KOD özel alanına da yazılır — böylece bu
                        // eşleşme, dosya tekrar açıldığında/başka bir montajdan
                        // çağrıldığında KALICI olarak aynen görünür.
                        if (kart != null) EslesmeYazVeUygula(secilen.KalemTipi, kart);
                        secici.DialogResult = DialogResult.OK;
                    }
                };

                secici.Controls.Add(liste);
                secici.Controls.Add(tamamBtn);
                secici.Controls.Add(aramaKutu);
                secici.Controls.Add(tipKutu);
                Doldur();
                secici.ShowDialog(this);
            }
        }

        private JObject FindKart(string tip, string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            var liste = tip == "urun" ? _urunler : tip == "yarimamul" ? _yarimamuller : tip == "altmontaj" ? _altMontajlar
                : tip == "paket" ? _paketler : _hammaddeler;
            return liste?.FirstOrDefault(k => (string)k["id"] == id) as JObject;
        }

        private void KokKartAyarla(string tip, JObject kart)
        {
            _kokTip = tip;
            _kokKart = kart;
            var recete = ReceteGetir(tip, kart);
            string tipEtiket = tip == "urun" ? "ÜRÜN" : tip == "yarimamul" ? "YARI MAMÜL" : tip == "altmontaj" ? "ALT MONTAJ" : "PAKET";
            _kokKartEtiketi.Text = $"[{tipEtiket}] {kart["kod"]} — {kart["ad"]}" + (recete == null ? "  (henüz reçetesi yok — kaydedince oluşturulacak)" : "");
            _kaydetBtn.Enabled = true;
            AgaciYenidenCiz();
            UstBilgiPanelleriGuncelle();
        }

        private void UstBilgiPanelleriGuncelle()
        {
            RotaPanelGuncelle();
            PaketOlcuPanelGuncelle();
        }

        // ── ROTA SEÇ / OLUŞTUR ───────────────────────────────────────────────
        private void RotaPanelGuncelle()
        {
            _rotaPanel.Visible = _kokTip == "yarimamul" && _kokKart != null;
            if (!_rotaPanel.Visible) return;
            string rotaId = (string)_kokKart["rotaId"];
            var rota = _rotalar?.FirstOrDefault(r => (string)r["id"] == rotaId);
            _rotaKutusu.Items.Clear();
            _rotaKutusu.Items.Add(rota != null ? $"Mevcut rota: {rota["ad"]}" : "Rota atanmamış");
            _rotaKutusu.SelectedIndex = 0;
        }

        // "her yarımamülde" isteği: bu diyalog hem KÖK kart bir yarımamül
        // olduğunda (üst paneldeki "Rota Seç/Oluştur" butonu) hem de ağaca
        // eklenen HER yarımamül KALEMİ için (sağ tık menüsü) AYNI şekilde
        // açılır — kartın kendisi parametre olarak verilir, ikisi de aynı
        // 'yarimamuller' koleksiyonundaki kaydı günceller.
        private async System.Threading.Tasks.Task RotaSecVeyaOlusturDialogAc(JObject yarimamulKart)
        {
            using (var dlg = new Form { Text = "Rota Seç / Oluştur — " + yarimamulKart["kod"], Width = 420, Height = 200, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var mevcutRotaId = (string)yarimamulKart["rotaId"];
                var kutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList, Margin = new Padding(10) };
                var rotaListesi = _rotalar.OfType<JObject>().ToList();
                kutu.Items.Add("— Seçilmedi —");
                foreach (var r in rotaListesi) kutu.Items.Add($"{r["kod"]} — {r["ad"]}");
                int mevcutIndex = rotaListesi.FindIndex(r => (string)r["id"] == mevcutRotaId);
                kutu.SelectedIndex = mevcutIndex >= 0 ? mevcutIndex + 1 : 0;

                var secBtn = new Button { Text = "Bu Rotayı Ata", Dock = DockStyle.Top };
                var ayirici = new Label { Text = "— veya —", Dock = DockStyle.Top, TextAlign = ContentAlignment.MiddleCenter, Height = 24 };
                var yeniKodKutu = new TextBox { Dock = DockStyle.Top };
                var yeniKodEtiket = new Label { Text = "Yeni rota kodu:", Dock = DockStyle.Top, Height = 18 };
                var yeniAdKutu = new TextBox { Dock = DockStyle.Top };
                var yeniAdEtiket = new Label { Text = "Yeni rota adı:", Dock = DockStyle.Top, Height = 18 };
                var yeniOlusturBtn = new Button { Text = "+ Yeni Rota Oluştur ve Ata", Dock = DockStyle.Top };

                bool degisti = false;
                secBtn.Click += async (s, e) =>
                {
                    string secilenId = kutu.SelectedIndex > 0 ? (string)rotaListesi[kutu.SelectedIndex - 1]["id"] : null;
                    yarimamulKart["rotaId"] = secilenId;
                    try
                    {
                        await _istemci.ToplukaEkleGuncelle("yarimamuller", new List<object>(), new List<object> { yarimamulKart });
                        degisti = true;
                        dlg.DialogResult = DialogResult.OK;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Kaydedilemedi: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                };
                yeniOlusturBtn.Click += async (s, e) =>
                {
                    string kod = yeniKodKutu.Text.Trim(), ad = yeniAdKutu.Text.Trim();
                    if (string.IsNullOrEmpty(kod) || string.IsNullOrEmpty(ad))
                    {
                        MessageBox.Show("Kod ve ad zorunlu.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    // Rota adımları (istasyon/süre) BİLİNÇLİ olarak boş bırakılır —
                    // ÜretimOS'un kendi Rota ekranındaki "hazır şablondan kur"
                    // akışı (rota_sablon.js) burada YENİDEN İNŞA EDİLMEDİ (fabrikanın
                    // gerçek hat/makine listesinden istasyon eşleştirmesi gerektirir,
                    // bu panelin kapsamı dışında) — kullanıcı adımları ÜretimOS'un
                    // kendi Rota ekranından tamamlar, TAHMİN EDİLMEZ.
                    var yeniRota = new JObject { ["id"] = "RT-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(), ["kod"] = kod, ["ad"] = ad, ["steps"] = new JArray() };
                    yarimamulKart["rotaId"] = (string)yeniRota["id"];
                    try
                    {
                        await _istemci.ToplukaEkleGuncelle("rotalar", new List<object> { yeniRota }, new List<object>());
                        await _istemci.ToplukaEkleGuncelle("yarimamuller", new List<object>(), new List<object> { yarimamulKart });
                        _rotalar.Add(yeniRota);
                        degisti = true;
                        MessageBox.Show(
                            "Rota oluşturuldu ve atandı. Adımları (istasyon/süre) ÜretimOS'un kendi " +
                            "'Rota' ekranından tamamlayın — burada TAHMİN EDİLMEDİ.",
                            "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        dlg.DialogResult = DialogResult.OK;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Oluşturulamadı: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                };

                dlg.Controls.Add(yeniOlusturBtn);
                dlg.Controls.Add(yeniAdKutu);
                dlg.Controls.Add(yeniAdEtiket);
                dlg.Controls.Add(yeniKodKutu);
                dlg.Controls.Add(yeniKodEtiket);
                dlg.Controls.Add(ayirici);
                dlg.Controls.Add(secBtn);
                dlg.Controls.Add(kutu);
                dlg.ShowDialog(this);
                if (degisti) _durumEtiketi.Text = "✓ Rota güncellendi: " + yarimamulKart["kod"];
            }
        }

        // ── PAKET ÖLÇÜ / AĞIRLIK DÜZENLE ─────────────────────────────────────
        // ÜretimOS'un page_recete_agac.js:openPaketOlcuDuzenle ile AYNI alanlar
        // ve AYNI "taslak, Kaydet'te kalıcı olur" davranışı.
        private void PaketOlcuAgirlikDuzenle(JObject paket)
        {
            using (var dlg = new Form
            {
                Text = "Paket Ölçü ve Ağırlığı — " + paket["kod"], Width = 420, Height = 330,
                FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
                MinimizeBox = false, MaximizeBox = false
            })
            {
                var tablo = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12) };
                tablo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
                tablo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
                void Satir(string etiket, Control kontrol)
                {
                    tablo.RowCount++;
                    tablo.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                    var lbl = new Label { Text = etiket, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 6, 0, 0) };
                    kontrol.Dock = DockStyle.Fill;
                    kontrol.Margin = new Padding(3, 3, 3, 8);
                    tablo.Controls.Add(lbl);
                    tablo.Controls.Add(kontrol);
                }

                string Deger(string alan) => paket[alan]?.ToString() ?? "";
                var enKutu = new TextBox { Text = Deger("en") }; Satir("En (cm)", enKutu);
                var boyKutu = new TextBox { Text = Deger("boy") }; Satir("Boy (cm)", boyKutu);
                var yukKutu = new TextBox { Text = Deger("yukseklik") }; Satir("Yükseklik (cm)", yukKutu);
                var netKutu = new TextBox { Text = Deger("netAgirlik") }; Satir("Net Ağırlık (kg)", netKutu);
                var brutKutu = new TextBox { Text = Deger("brutAgirlik") }; Satir("Brüt Ağırlık (kg)", brutKutu);

                var hint = new Label
                {
                    AutoSize = false, Height = 40, ForeColor = Color.DarkSlateGray,
                    Text = "Bu ölçüler ÜretimOS'ta çeki listesi ve sevkiyat hacim/ağırlık hesabının kaynağıdır."
                };
                tablo.Controls.Add(new Label());
                tablo.Controls.Add(hint);
                tablo.RowCount++; tablo.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));

                var altPanel = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(10) };
                var vazgecBtn = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, AutoSize = true };
                var uygulaBtn = new Button { Text = "Uygula (Taslağa)", AutoSize = true, Font = new Font(Font, FontStyle.Bold) };
                altPanel.Controls.Add(vazgecBtn);
                altPanel.Controls.Add(uygulaBtn);

                dlg.Controls.Add(tablo);
                dlg.Controls.Add(altPanel);
                dlg.AcceptButton = uygulaBtn;
                dlg.CancelButton = vazgecBtn;

                uygulaBtn.Click += (s, e) =>
                {
                    double Cift(TextBox t) => double.TryParse(t.Text.Trim().Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out double v) ? v : 0;
                    paket["en"] = Cift(enKutu);
                    paket["boy"] = Cift(boyKutu);
                    paket["yukseklik"] = Cift(yukKutu);
                    paket["netAgirlik"] = Cift(netKutu);
                    paket["brutAgirlik"] = Cift(brutKutu);
                    if (!_degisenPaketler.Contains(paket)) _degisenPaketler.Add(paket);
                    dlg.DialogResult = DialogResult.OK;
                };
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    _durumEtiketi.ForeColor = Color.DarkOrange;
                    _durumEtiketi.Text = "● Paket ölçü/ağırlığı taslağa işlendi — '✓ ÜretimOS'a Kaydet'e basın.";
                }
            }
        }

        private void PaketOlcuPanelGuncelle()
        {
            _paketOlcuPanel.Visible = _kokTip == "paket" && _kokKart != null;
            if (!_paketOlcuPanel.Visible) return;
            _paketOlcuEtiketi.Text = "Ölçü/Ağırlık: " + PaketOlcuOzeti(_kokKart);
        }

        // ── NEREDE KULLANILIYOR (TAM "kullanıldığı yerler" analizi) ──────────
        // Kullanıcı isteği: "hangi pakette olduğunu ... yazalım" — ilk sürüm
        // yalnızca İLK eşleşeni gösteriyordu; bu, palette görünen kısa
        // etikete SIĞMAYAN TAM listeyi gösteren salt-okunur bir diyalog.
        private void NeredeKullaniliyorGoster(PaletOgesi oge)
        {
            using (var dlg = new Form
            {
                Text = "Nerede Kullanılıyor — " + oge.Kod, Width = 440, Height = 380,
                FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
                MinimizeBox = false, MaximizeBox = false
            })
            {
                var baslik = new Label
                {
                    Dock = DockStyle.Top, Height = 36, Padding = new Padding(10, 8, 10, 0),
                    Text = $"'{oge.Kod} — {oge.Ad}' şu kartların reçetesinde kalem olarak geçiyor:"
                };
                var liste = new ListBox { Dock = DockStyle.Fill };
                if (oge.KullanimListesi == null || oge.KullanimListesi.Count == 0)
                {
                    liste.Items.Add("Hiçbir reçetede kullanılmıyor.");
                }
                else
                {
                    foreach (var (ustTip, ustKart, miktar) in oge.KullanimListesi)
                        liste.Items.Add($"[{TipGosterimAdi(ustTip)}] {ustKart["kod"]} — {ustKart["ad"]}  (×{miktar.ToString("0.##", CultureInfo.InvariantCulture)})");
                }
                var kapatBtn = new Button { Text = "Kapat", Dock = DockStyle.Bottom, DialogResult = DialogResult.OK };
                dlg.Controls.Add(liste);
                dlg.Controls.Add(baslik);
                dlg.Controls.Add(kapatBtn);
                dlg.AcceptButton = kapatBtn;
                dlg.CancelButton = kapatBtn;
                dlg.ShowDialog(this);
            }
        }

        // ── REÇETE (ÇOK KATMANLI) ────────────────────────────────────────────
        // Anahtar: tip + "|" + kartId — bir kartın reçetesini benzersiz tanımlar.
        private static string ReceteAnahtari(string tip, string kartId) => tip + "|" + kartId;
        private static string AlanAdiTipten(string tip) => tip == "urun" ? "urunId" : tip == "yarimamul" ? "yarimamulId" : tip == "altmontaj" ? "altMontajId" : "paketId";

        // Salt okunur arama — YENİ bir reçete OLUŞTURMAZ (yalnızca görüntüleme/
        // ağaç genişletme için; boş bırakılan bir alt kırılım hayalet bir
        // taslak reçete YARATMAMALI).
        private JObject ReceteGetir(string tip, JObject kart)
        {
            if (kart == null) return null;
            string anahtar = ReceteAnahtari(tip, (string)kart["id"]);
            if (_degisenReceteler.TryGetValue(anahtar, out var d)) return d;
            string alanAdi = AlanAdiTipten(tip);
            return _receteler.FirstOrDefault(r => (string)r[alanAdi] == (string)kart["id"]) as JObject;
        }

        // tip/kart'a ait reçeteyi bulur; yoksa YENİ bir taslak oluşturur
        // (henüz sunucuya YAZILMAZ — yalnızca _degisenReceteler'e ve
        // görüntüleme amacıyla _receteler'e eklenir, Kaydet'te kalıcı olur).
        private JObject ReceteBulVeyaOlustur(string tip, JObject kart)
        {
            string anahtar = ReceteAnahtari(tip, (string)kart["id"]);
            if (_degisenReceteler.TryGetValue(anahtar, out var mevcut)) return mevcut;

            string alanAdi = AlanAdiTipten(tip);
            var recete = _receteler.FirstOrDefault(r => (string)r[alanAdi] == (string)kart["id"]) as JObject;
            if (recete == null)
            {
                recete = new JObject
                {
                    ["id"] = "YENI-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                    ["ad"] = (string)kart["ad"] + " Reçetesi",
                    ["kalemler"] = new JArray(),
                    [alanAdi] = (string)kart["id"]
                };
                _receteler.Add(recete);
            }
            _degisenReceteler[anahtar] = recete;
            return recete;
        }

        // Bir ağaç düğümünden yukarı doğru giderek, İLK "kendi reçetesi olan"
        // (hammadde OLMAYAN) kartı bulur — sürükle-bırak/Ekle hedefini, ve
        // Kaldır/Miktar Değiştir'in HANGİ reçeteyi güncelleyeceğini belirler.
        // Kök bulunamazsa (boş alana bırakıldıysa) KÖK karta düşer.
        private (string tip, JObject kart) HedefKartCoz(TreeNode dugum)
        {
            while (dugum != null)
            {
                if (dugum.Tag is JObject kalem)
                {
                    string tip = (string)kalem["tip"];
                    if (tip != "hammadde")
                    {
                        var kart = FindKart(tip, (string)kalem["refId"]);
                        if (kart != null) return (tip, kart);
                    }
                }
                dugum = dugum.Parent;
            }
            return (_kokTip, _kokKart);
        }

        // ── AĞAÇ GÖSTERİMİ (ÇOK KATMANLI — page_recete_agac.js:renderNode ile
        // AYNI mantık: her kalem, kendi reçetesi varsa alt düğümler olarak onu
        // da gösterir) ────────────────────────────────────────────────────────
        private void AgaciYenidenCiz()
        {
            _agacGorunumu.Nodes.Clear();
            var recete = ReceteGetir(_kokTip, _kokKart);
            if (recete == null) return;
            var kalemler = recete["kalemler"] as JArray ?? new JArray();
            foreach (var kalem in kalemler.OfType<JObject>())
            {
                var dugum = KalemDugumuOlustur(kalem, 0);
                _agacGorunumu.Nodes.Add(dugum);
                dugum.Expand();
            }
        }

        private TreeNode KalemDugumuOlustur(JObject kalem, int derinlik)
        {
            string tip = (string)kalem["tip"];
            string refId = (string)kalem["refId"];
            var kart = FindKart(tip == "hammadde" ? "hammadde" : tip, refId);
            string kod = kart != null ? ((string)kart["kod"] ?? (string)kart["stokKodu"] ?? refId) : "(kart bulunamadı)";
            string ad = kart?["ad"]?.ToString() ?? "";
            double miktar = (double?)kalem["miktar"] ?? 1;
            string birim = (string)kalem["birim"] ?? "ADET";
            string tipGosterim = tip == "hammadde" ? (kart != null ? HammaddeGosterimTipi((string)kart["tip"]) : "Hammadde") : TipGosterimAdi(tip);
            string ekBilgi = "";
            if (tip == "yarimamul" && kart != null && !string.IsNullOrEmpty((string)kart["rotaId"])) ekBilgi += "  🔧rota";
            if (tip == "paket" && kart != null) ekBilgi += "  📐" + PaketOlcuOzeti(kart);
            var dugum = new TreeNode($"[{tipGosterim}] {kod} — {ad}  ×{miktar} {birim}{ekBilgi}") { Tag = kalem };

            // ALT KIRILIM: bu kalemin KENDİ reçetesi varsa (urun/yarımamül/
            // altmontaj/paket — hammadde HARİÇ) alt düğümler olarak GÖSTER.
            // Salt okunur arama (ReceteGetir) kullanılır — yalnızca GÖRMEK
            // hayalet bir taslak reçete YARATMAMALI.
            if (derinlik < MAKS_DERINLIK && tip != "hammadde" && kart != null)
            {
                var altRecete = ReceteGetir(tip, kart);
                if (altRecete != null)
                {
                    var altKalemler = altRecete["kalemler"] as JArray ?? new JArray();
                    foreach (var altKalem in altKalemler.OfType<JObject>())
                    {
                        dugum.Nodes.Add(KalemDugumuOlustur(altKalem, derinlik + 1));
                    }
                }
            }
            return dugum;
        }

        // ── XML DIŞA AKTARMA ─────────────────────────────────────────────────
        // Kullanıcı isteği: "Üretimostaki reçeteleri xml formatında
        // kaydedelim ve her satırın benzersiz unique id bilgiside olsun."
        // AgaciYenidenCiz/KalemDugumuOlustur ile AYNI özyinelemeli gezinme
        // mantığı (aynı MAKS_DERINLIK güvenlik sınırı) — ama TreeNode yerine
        // XElement üretir. Sunucudaki (JSON) veri deposu HİÇ değişmiyor,
        // bu TAMAMEN yerel/isteğe bağlı bir dışa aktarma özelliğidir.
        private void ReceteyiXmlOlarakDisaAktar()
        {
            if (_kokKart == null)
            {
                MessageBox.Show("Önce üstten bir kart seçin ('Farklı Kart Seç…').", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var recete = ReceteGetir(_kokTip, _kokKart);
            var kokEleman = new System.Xml.Linq.XElement("Recete",
                new System.Xml.Linq.XAttribute("kokTip", _kokTip),
                new System.Xml.Linq.XAttribute("kokId", (string)_kokKart["id"] ?? ""),
                new System.Xml.Linq.XAttribute("kokKod", (string)_kokKart["kod"] ?? (string)_kokKart["stokKodu"] ?? ""),
                new System.Xml.Linq.XAttribute("kokAd", (string)_kokKart["ad"] ?? ""),
                new System.Xml.Linq.XAttribute("disaAktarmaTarihi", DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss")));

            if (recete != null)
            {
                var kalemler = recete["kalemler"] as JArray ?? new JArray();
                foreach (var kalem in kalemler.OfType<JObject>())
                    kokEleman.Add(KalemElemaniOlustur(kalem, 0));
            }

            string varsayilanAd = ((string)_kokKart["kod"] ?? (string)_kokKart["stokKodu"] ?? "recete")
                .Trim();
            foreach (char c in System.IO.Path.GetInvalidFileNameChars())
                varsayilanAd = varsayilanAd.Replace(c, '_');

            using (var kaydetDialog = new SaveFileDialog
            {
                Filter = "XML dosyası|*.xml",
                FileName = varsayilanAd + "_recete.xml"
            })
            {
                if (kaydetDialog.ShowDialog() != DialogResult.OK) return;
                try
                {
                    new System.Xml.Linq.XDocument(
                        new System.Xml.Linq.XDeclaration("1.0", "utf-8", "yes"),
                        kokEleman
                    ).Save(kaydetDialog.FileName);
                    _durumEtiketi.ForeColor = Color.DarkGreen;
                    _durumEtiketi.Text = "✓ Reçete XML olarak dışa aktarıldı: " + kaydetDialog.FileName;
                }
                catch (Exception ex)
                {
                    Tanilama.Kaydet("ReceteyiXmlOlarakDisaAktar HATA: " + ex);
                    MessageBox.Show("XML dosyası yazılamadı: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private System.Xml.Linq.XElement KalemElemaniOlustur(JObject kalem, int derinlik)
        {
            string tip = (string)kalem["tip"];
            string refId = (string)kalem["refId"];
            var kart = FindKart(tip == "hammadde" ? "hammadde" : tip, refId);
            string kod = kart != null ? ((string)kart["kod"] ?? (string)kart["stokKodu"] ?? refId) : refId;
            string ad = kart?["ad"]?.ToString() ?? "";
            double miktar = (double?)kalem["miktar"] ?? 1;
            string birim = (string)kalem["birim"] ?? "ADET";
            // Her satırın benzersiz id'si — normalde KalemEkle'de zaten
            // "RK-..." atanır; yalnızca (varsa) çok eski/id'siz kayıtlar için
            // burada GEÇİCİ (yalnızca bu XML çıktısına özel, kaydedilmeyen)
            // bir id üretilir — TAHMİN/sessiz veri değişikliği YOK, sadece
            // dışa aktarma anında dolduruluyor.
            string id = (string)kalem["id"];
            if (string.IsNullOrWhiteSpace(id)) id = "RK-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant();

            var eleman = new System.Xml.Linq.XElement("Kalem",
                new System.Xml.Linq.XAttribute("id", id),
                new System.Xml.Linq.XAttribute("tip", tip ?? ""),
                new System.Xml.Linq.XAttribute("refId", refId ?? ""),
                new System.Xml.Linq.XAttribute("kod", kod ?? ""),
                new System.Xml.Linq.XAttribute("ad", ad ?? ""),
                new System.Xml.Linq.XAttribute("miktar", miktar.ToString(CultureInfo.InvariantCulture)),
                new System.Xml.Linq.XAttribute("birim", birim ?? ""));

            if (derinlik < MAKS_DERINLIK && tip != "hammadde" && kart != null)
            {
                var altRecete = ReceteGetir(tip, kart);
                if (altRecete != null)
                {
                    var altKalemler = altRecete["kalemler"] as JArray ?? new JArray();
                    foreach (var altKalem in altKalemler.OfType<JObject>())
                        eleman.Add(KalemElemaniOlustur(altKalem, derinlik + 1));
                }
            }
            return eleman;
        }

        // static: PaletOgesi.ToString() (iç içe sınıf) de kullanır.
        private static string TipGosterimAdi(string tip) => tip == "urun" ? "Ürün" : tip == "yarimamul" ? "Yarı Mamül"
            : tip == "altmontaj" ? "Alt Montaj" : tip == "paket" ? "Paket" : tip;
        private string HammaddeGosterimTipi(string hammaddeTip) => hammaddeTip == "hirdavat" ? "Hırdavat"
            : hammaddeTip == "plaka" ? "Plaka" : hammaddeTip == "kenar_bandi" ? "Kenar Bandı" : "Hammadde";

        // ── SÜRÜKLE-BIRAK / EKLE (HEDEF: bırakılan/seçili DÜĞÜMÜN kartı) ─────
        private void PaletListesi_MouseDown(object sender, MouseEventArgs e)
        {
            // YALNIZCA sol tık sürükleme başlatır — sağ tık, "Nerede
            // Kullanılıyor?" bağlam menüsü içindir (aşağıdaki ikinci
            // MouseDown abonesi seçimi günceller).
            if (e.Button == MouseButtons.Left && _paletListesi.SelectedItem is PaletOgesi oge)
            {
                _paletListesi.DoDragDrop(oge, DragDropEffects.Copy);
            }
        }

        private void AgacGorunumu_DragDrop(object sender, DragEventArgs e)
        {
            if (!(e.Data.GetData(typeof(PaletOgesi)) is PaletOgesi oge)) return;
            Point clientNoktasi = _agacGorunumu.PointToClient(new Point(e.X, e.Y));
            TreeNode hedefDugum = _agacGorunumu.GetNodeAt(clientNoktasi);
            var (hedefTip, hedefKart) = HedefKartCoz(hedefDugum);
            KalemEkle(oge, hedefTip, hedefKart);
        }

        private void SeciliPaletOgesiniEkle()
        {
            if (!(_paletListesi.SelectedItem is PaletOgesi oge))
            {
                MessageBox.Show("Önce soldaki listeden bir öğe seçin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            var (hedefTip, hedefKart) = HedefKartCoz(_agacGorunumu.SelectedNode);
            KalemEkle(oge, hedefTip, hedefKart);
        }

        private void KalemEkle(PaletOgesi oge, string hedefTip, JObject hedefKart)
        {
            if (hedefKart == null)
            {
                MessageBox.Show("Önce üstten bir hedef kart seçin ('Farklı Kart Seç…').", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            // Kendi kendine referans / basit döngü koruması — TAM döngü tespiti
            // (A→B→A gibi çok seviyeli) ÜretimOS'un kendi reçete ekranında
            // yapılıyor; burada YALNIZCA en bariz "kendini kendine eklemek"
            // durumu engellenir.
            if (oge.KalemTipi == hedefTip && oge.Id == (string)hedefKart["id"])
            {
                MessageBox.Show("Bir kart kendi reçetesine eklenemez.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            double miktar = MiktarSor("Miktar (ADET)", 1);
            if (miktar <= 0) return;

            var recete = ReceteBulVeyaOlustur(hedefTip, hedefKart);
            var yeniKalem = new JObject
            {
                ["id"] = "RK-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                ["tip"] = oge.KalemTipi,
                ["refId"] = oge.Id,
                ["miktar"] = miktar,
                ["birim"] = "ADET"
            };
            ((JArray)recete["kalemler"]).Add(yeniKalem);
            AgaciYenidenCiz();
            _durumEtiketi.ForeColor = Color.DarkOrange;
            _durumEtiketi.Text = $"● '{hedefKart["kod"]}' reçetesine eklendi — kaydedilmemiş değişiklik var, bitirince '✓ ÜretimOS'a Kaydet'e basın.";
        }

        private void KalemKaldir(TreeNode dugum)
        {
            if (!(dugum.Tag is JObject kalem)) return;
            var (ustTip, ustKart) = HedefKartCoz(dugum.Parent);
            if (ustKart == null) return;
            var recete = ReceteBulVeyaOlustur(ustTip, ustKart);
            ((JArray)recete["kalemler"]).Remove(kalem);
            AgaciYenidenCiz();
            _durumEtiketi.ForeColor = Color.DarkOrange;
            _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
        }

        private void MiktarDuzenle(TreeNode dugum)
        {
            if (!(dugum.Tag is JObject kalem)) return;
            double mevcut = (double?)kalem["miktar"] ?? 1;
            double yeni = MiktarSor("Yeni miktar", mevcut);
            if (yeni <= 0) return;
            kalem["miktar"] = yeni;
            // Kalemin AİT OLDUĞU reçeteyi dirty işaretle — aksi halde yalnızca
            // miktarı değişen ama hiç kalem eklenmemiş bir alt kırılım
            // Kaydet'e dahil edilmez.
            var (ustTip, ustKart) = HedefKartCoz(dugum.Parent);
            if (ustKart != null) ReceteBulVeyaOlustur(ustTip, ustKart);
            AgaciYenidenCiz();
            _durumEtiketi.ForeColor = Color.DarkOrange;
            _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
        }

        // Basit bir sayı girme penceresi — .NET Framework WinForms'ta yerleşik
        // bir InputBox yok (Microsoft.VisualBasic.Interaction.InputBox yeni bir
        // derleme referansı gerektirirdi), bu yüzden minik bir Form ile.
        private double MiktarSor(string baslik, double varsayilan)
        {
            using (var f = new Form { Text = baslik, Width = 260, Height = 130, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var kutu = new TextBox { Text = varsayilan.ToString(CultureInfo.InvariantCulture), Dock = DockStyle.Top };
                var tamam = new Button { Text = "Tamam", Dock = DockStyle.Bottom, DialogResult = DialogResult.OK };
                f.Controls.Add(kutu);
                f.Controls.Add(tamam);
                f.AcceptButton = tamam;
                if (f.ShowDialog(this) != DialogResult.OK) return 0;
                return double.TryParse(kutu.Text.Trim().Replace(",", "."),
                    NumberStyles.Any, CultureInfo.InvariantCulture, out double sonuc)
                    ? sonuc : 0;
            }
        }

        // ── KAYDET (ÇOK KATMANLI — TÜM değişen reçeteler + paket ölçüleri TEK
        // seferde, ÜretimOS'un kendi reçete sistemine AYNI şekilde aktarılır) ─
        private async System.Threading.Tasks.Task KaydetTikla()
        {
            if (_kokKart == null)
            {
                MessageBox.Show("Önce bir hedef kart seçin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (_degisenReceteler.Count == 0 && _degisenPaketler.Count == 0)
            {
                MessageBox.Show("Kaydedilecek bir değişiklik yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            _kaydetBtn.Enabled = false;
            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Kaydediliyor…";
            try
            {
                int receteSayisi = 0;
                if (_degisenReceteler.Count > 0)
                {
                    var ekle = new List<object>();
                    var guncelle = new List<object>();
                    foreach (var recete in _degisenReceteler.Values)
                    {
                        bool yeniKayit = ((string)recete["id"]).StartsWith("YENI-");
                        if (yeniKayit) recete["id"] = "RC-" + Guid.NewGuid().ToString("N").Substring(0, 12).ToUpperInvariant();
                        (yeniKayit ? ekle : guncelle).Add(recete);
                    }
                    bool receteBasarili = await _istemci.ToplukaEkleGuncelle("receteler", ekle, guncelle);
                    if (!receteBasarili) throw new Exception("Sunucu 'receteler' kaydını reddetti (HTTP hata).");
                    receteSayisi = ekle.Count + guncelle.Count;
                    _degisenReceteler.Clear();
                }

                int paketSayisi = 0;
                if (_degisenPaketler.Count > 0)
                {
                    bool paketBasarili = await _istemci.ToplukaEkleGuncelle("paketler", new List<object>(), _degisenPaketler.Cast<object>().ToList());
                    if (!paketBasarili) throw new Exception("Sunucu 'paketler' kaydını reddetti (HTTP hata).");
                    paketSayisi = _degisenPaketler.Count;
                    _degisenPaketler.Clear();
                }

                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ Kaydedildi — {receteSayisi} reçete, {paketSayisi} paket ölçüsü ({_kokKart["kod"]} ve alt kırılımları).";
                Tanilama.Kaydet($"ReceteAgaciPaneli: kaydedildi, kok={_kokKart["kod"]}, recete={receteSayisi}, paket={paketSayisi}");
                AgaciYenidenCiz();
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("ReceteAgaciPaneli.KaydetTikla HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Kaydedilemedi: " + ex.Message;
            }
            finally
            {
                _kaydetBtn.Enabled = true;
            }
        }
    }
}
