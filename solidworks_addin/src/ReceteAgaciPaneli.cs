using System;
using System.Collections.Generic;
using System.Drawing;
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
    // ÜretimOS'un KENDİ Reçete Ağaç Editörü'nün (page_recete_agac.js) temel
    // "alt kalem ekle" işlevini SolidWorks içine taşır — SolidWorks'te bir
    // montaj/parça üzerinde çalışırken, o parçanın karşılık geldiği ÜretimOS
    // kartının reçetesine SolidWorks'ten AYRILMADAN paket/yarı mamül/alt
    // montaj/hırdavat/plaka/kenar bandı ekleyebilirsiniz.
    //
    // BİLİNÇLİ KAPSAM SINIRI (V1): ÜretimOS'un tam Reçete Ağaç Editörü
    // ÇOK KATMANLI bir ağacı (her alt kartın KENDİ reçetesi) tek ekranda
    // gezip TÜMÜNÜ düzenleyebiliyor, artı maliyet/rota/amortisman hesapları
    // gösteriyor. Burada YALNIZCA seçili kartın KENDİ (tek seviye) kalem
    // listesi düzenlenir — bir alt kalemin KENDİ reçetesini düzenlemek için
    // kullanıcı ÜretimOS'un kendi ekranına gitmeye devam eder. Bu bilinçli
    // bir basitleştirme: "alt kalem ekle" isteğinin BİREBİR karşılığı budur,
    // çok katmanlı maliyet ağacını SolidWorks içinde yeniden inşa etmek
    // ayrı, çok daha büyük bir iştir.
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
        private JObject _aktifRecete; // null ise bu kartın henüz reçetesi yok

        private Label _durumEtiketi;
        private Label _kokKartEtiketi;
        private Button _kokKartSecBtn;
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

        private class PaletOgesi
        {
            public string KalemTipi;    // urun|yarimamul|altmontaj|paket|hammadde — receteye YAZILACAK tip
            public string GosterimTipi; // Paket/Yarı Mamül/Alt Montaj/Hırdavat/Plaka/Kenar Bandı — kullanıcıya gösterilen
            public string Id, Kod, Ad;
            public override string ToString() => $"[{GosterimTipi}] {Kod} — {Ad}";
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
            Text = "ÜretimOS — Reçete Ağacı (Alt Kalem Ekle)";
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
            // Kullanıcı isteği: "rota seç ve oluştur da var, her yarımamülde
            // onu da ekleyelim" — ÜretimOS'ta yarımamul kartının kendi
            // 'rotaId' alanı var (bkz. page_yarimamul.js). Aynı seç/oluştur
            // akışı, ağaçtaki HER yarımamül kalemi için sağ tık menüsünden de
            // açılabilir (bkz. RotaSecVeyaOlusturDialogAc).
            _rotaPanel = new Panel { Dock = DockStyle.Top, Height = 34, Padding = new Padding(10, 4, 10, 4), Visible = false };
            _rotaKutusu = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList, Enabled = false };
            var rotaBtn = new Button { Text = "Rota Seç / Oluştur…", Dock = DockStyle.Right, Width = 150 };
            rotaBtn.Click += async (s, e) => { if (_kokKart != null) { await RotaSecVeyaOlusturDialogAc(_kokKart); RotaPanelGuncelle(); } };
            _rotaPanel.Controls.Add(_rotaKutusu);
            _rotaPanel.Controls.Add(rotaBtn);

            // ── SOL: ekleme paleti ───────────────────────────────────────────
            var solPanel = new Panel { Dock = DockStyle.Left, Width = 300, Padding = new Padding(8) };
            var paletBaslik = new Label { Text = "Ekle — sürükleyip ağaca bırakın (veya seçip 'Ekle →')", Dock = DockStyle.Top, Height = 32, AutoSize = false };
            _paletTipKutusu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
            _paletTipKutusu.Items.AddRange(new object[] { "Paket", "Yarı Mamül", "Alt Montaj", "Hırdavat", "Plaka", "Kenar Bandı" });
            _paletTipKutusu.SelectedIndexChanged += (s, e) => PaletiFiltrele();
            _paletAramaKutusu = new TextBox { Dock = DockStyle.Top };
            _paletAramaKutusu.TextChanged += (s, e) => PaletiFiltrele();
            var aramaEtiket = new Label { Text = "Kod/ad ara:", Dock = DockStyle.Top, Height = 18, AutoSize = false };
            _paletListesi = new ListBox { Dock = DockStyle.Fill, AllowDrop = false };
            _paletListesi.MouseDown += PaletListesi_MouseDown;
            var ekleBtn = new Button { Text = "Ekle → (sürüklemek yerine)", Dock = DockStyle.Bottom };
            ekleBtn.Click += (s, e) => SeciliPaletOgesiniKokeEkle();

            solPanel.Controls.Add(_paletListesi);
            solPanel.Controls.Add(ekleBtn);
            solPanel.Controls.Add(_paletAramaKutusu);
            solPanel.Controls.Add(aramaEtiket);
            solPanel.Controls.Add(_paletTipKutusu);
            solPanel.Controls.Add(paletBaslik);

            // ── SAĞ: reçete ağacı ────────────────────────────────────────────
            var sagPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };
            var agacBaslik = new Label { Text = "Bu kartın reçetesi (kalemler) — çift tık: miktar değiştir, sağ tık: kaldır", Dock = DockStyle.Top, Height = 24 };
            _agacGorunumu = new TreeView { Dock = DockStyle.Fill, AllowDrop = true, HideSelection = false, LabelEdit = false };
            _agacGorunumu.DragEnter += (s, e) => { e.Effect = e.Data.GetDataPresent(typeof(PaletOgesi)) ? DragDropEffects.Copy : DragDropEffects.None; };
            _agacGorunumu.DragDrop += AgacGorunumu_DragDrop;
            _agacGorunumu.NodeMouseDoubleClick += (s, e) => MiktarDuzenle(e.Node);
            var sagTikMenu = new ContextMenuStrip();
            sagTikMenu.Items.Add("Kaldır", null, (s, e) => { if (_agacGorunumu.SelectedNode != null) KalemKaldir(_agacGorunumu.SelectedNode); });
            var rotaMenuOgesi = sagTikMenu.Items.Add("Rota Seç / Oluştur…", null, async (s, e) =>
            {
                if (_agacGorunumu.SelectedNode?.Tag is JObject kalem && (string)kalem["tip"] == "yarimamul")
                {
                    var kart = FindKart("yarimamul", (string)kalem["refId"]);
                    if (kart != null)
                    {
                        await RotaSecVeyaOlusturDialogAc(kart);
                        _agacGorunumu.SelectedNode.Text = KalemDugumuOlustur(kalem).Text;
                    }
                }
            });
            // Bu öğe SADECE seçili düğüm bir YARI MAMÜL kalemi ise etkinleştirilir
            // — menü açılmadan hemen önce kontrol edilir (tahmin/yanlış işlem yok).
            sagTikMenu.Opening += (s, e) =>
            {
                bool yarimamulMu = _agacGorunumu.SelectedNode?.Tag is JObject k && (string)k["tip"] == "yarimamul";
                rotaMenuOgesi.Enabled = yarimamulMu;
            };
            _agacGorunumu.ContextMenuStrip = sagTikMenu;
            _agacGorunumu.NodeMouseClick += (s, e) => _agacGorunumu.SelectedNode = e.Node;
            sagPanel.Controls.Add(_agacGorunumu);
            sagPanel.Controls.Add(agacBaslik);

            // ── ALT: durum + kaydet ──────────────────────────────────────────
            var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 50, Padding = new Padding(8) };
            _durumEtiketi = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.DarkSlateGray };
            _kaydetBtn = new Button { Text = "✓ ÜretimOS'a Kaydet", Dock = DockStyle.Right, Width = 160, Enabled = false, Font = new Font(Font, FontStyle.Bold) };
            _kaydetBtn.Click += async (s, e) => await KaydetTikla();
            altPanel.Controls.Add(_durumEtiketi);
            altPanel.Controls.Add(_kaydetBtn);

            // NOT: Dock=Top/Bottom/Left panelleri arasında sıralama, Controls
            // koleksiyonuna EKLENME SIRASININ TERSİNE göre işler — SON eklenen
            // aynı kenara en YAKIN (en dıştaki) olur. _rotaPanel'in ustPanel'in
            // HEMEN ALTINDA görünmesi için ustPanel'den ÖNCE eklenmesi gerekir.
            Controls.Add(sagPanel);
            Controls.Add(solPanel);
            Controls.Add(altPanel);
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

                // İlk açılışta, aktif/seçili SolidWorks bileşeninin URETIMOS_KOD'una
                // göre otomatik eşleştirmeyi DENE — bulunamazsa kullanıcı elle seçer
                // (TAHMİN ETMEZ, otomatik kart OLUŞTURMAZ).
                string kod = KesimListesiCikarici.OzelAlanOku(_hedefModel, OzelAlanlar.KOD);
                JObject bulunanKart = null; string bulunanTip = null;
                if (!string.IsNullOrWhiteSpace(kod))
                {
                    foreach (var (liste, tip) in new[] { (_urunler, "urun"), (_yarimamuller, "yarimamul"), (_altMontajlar, "altmontaj"), (_paketler, "paket") })
                    {
                        var eslesen = liste.FirstOrDefault(k => string.Equals((string)k["kod"], kod, StringComparison.OrdinalIgnoreCase)) as JObject;
                        if (eslesen != null) { bulunanKart = eslesen; bulunanTip = tip; break; }
                    }
                }

                if (bulunanKart != null)
                {
                    KokKartAyarla(bulunanTip, bulunanKart);
                    _durumEtiketi.ForeColor = Color.DarkGreen;
                    _durumEtiketi.Text = $"✓ Bağlandı — '{kod}' koduna göre kart otomatik eşleşti.";
                }
                else
                {
                    _kokKartEtiketi.Text = string.IsNullOrWhiteSpace(kod)
                        ? "Bu bileşende URETIMOS_KOD yok — 'Farklı Kart Seç…' ile hangi ÜretimOS kartının reçetesini düzenleyeceğinizi seçin."
                        : $"'{kod}' koduyla eşleşen bir ÜretimOS kartı bulunamadı — 'Farklı Kart Seç…' ile elle seçin.";
                    _durumEtiketi.ForeColor = Color.DarkGreen;
                    _durumEtiketi.Text = $"✓ Bağlandı — {_receteler.Count} reçete, {_hammaddeler.Count} hammadde yüklendi.";
                }
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("ReceteAgaciPaneli.VerileriYukleVeBaslat HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Veri çekilemedi: " + ex.Message;
            }
        }

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

        private PaletOgesi Ogeye(JToken k, string kalemTipi, string gosterimTipi) => new PaletOgesi
        {
            KalemTipi = kalemTipi, GosterimTipi = gosterimTipi,
            Id = (string)k["id"], Kod = (string)k["kod"] ?? (string)k["id"], Ad = (string)k["ad"] ?? ""
        };

        private PaletOgesi OgeyeHammadde(JToken k, string gosterimTipi) => new PaletOgesi
        {
            KalemTipi = "hammadde", GosterimTipi = gosterimTipi,
            Id = (string)k["id"], Kod = (string)k["stokKodu"] ?? (string)k["id"], Ad = (string)k["ad"] ?? ""
        };

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
                        if (kart != null) KokKartAyarla(secilen.KalemTipi, kart);
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
            var liste = tip == "urun" ? _urunler : tip == "yarimamul" ? _yarimamuller : tip == "altmontaj" ? _altMontajlar
                : tip == "paket" ? _paketler : _hammaddeler;
            return liste.FirstOrDefault(k => (string)k["id"] == id) as JObject;
        }

        private void KokKartAyarla(string tip, JObject kart)
        {
            _kokTip = tip;
            _kokKart = kart;
            string alanAdi = tip == "urun" ? "urunId" : tip == "yarimamul" ? "yarimamulId" : tip == "altmontaj" ? "altMontajId" : "paketId";
            _aktifRecete = _receteler.FirstOrDefault(r => (string)r[alanAdi] == (string)kart["id"]) as JObject;

            string tipEtiket = tip == "urun" ? "ÜRÜN" : tip == "yarimamul" ? "YARI MAMÜL" : tip == "altmontaj" ? "ALT MONTAJ" : "PAKET";
            _kokKartEtiketi.Text = $"[{tipEtiket}] {kart["kod"]} — {kart["ad"]}" + (_aktifRecete == null ? "  (henüz reçetesi yok — kaydedince oluşturulacak)" : "");
            _kaydetBtn.Enabled = true;
            AgaciYenidenCiz();
            RotaPanelGuncelle();
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

        // ── AĞAÇ GÖSTERİMİ ───────────────────────────────────────────────────
        private void AgaciYenidenCiz()
        {
            _agacGorunumu.Nodes.Clear();
            if (_aktifRecete == null) return;
            var kalemler = _aktifRecete["kalemler"] as JArray ?? new JArray();
            foreach (var kalem in kalemler.OfType<JObject>())
            {
                _agacGorunumu.Nodes.Add(KalemDugumuOlustur(kalem));
            }
        }

        private TreeNode KalemDugumuOlustur(JObject kalem)
        {
            string tip = (string)kalem["tip"];
            string refId = (string)kalem["refId"];
            var kart = FindKart(tip == "hammadde" ? "hammadde" : tip, refId);
            string kod = kart != null ? ((string)kart["kod"] ?? (string)kart["stokKodu"] ?? refId) : "(kart bulunamadı)";
            string ad = kart?["ad"]?.ToString() ?? "";
            double miktar = (double?)kalem["miktar"] ?? 1;
            string birim = (string)kalem["birim"] ?? "ADET";
            string tipGosterim = tip == "hammadde" ? (kart != null ? HammaddeGosterimTipi((string)kart["tip"]) : "Hammadde") : TipGosterimAdi(tip);
            var dugum = new TreeNode($"[{tipGosterim}] {kod} — {ad}  ×{miktar} {birim}") { Tag = kalem };
            return dugum;
        }

        private string TipGosterimAdi(string tip) => tip == "urun" ? "Ürün" : tip == "yarimamul" ? "Yarı Mamül"
            : tip == "altmontaj" ? "Alt Montaj" : tip == "paket" ? "Paket" : tip;
        private string HammaddeGosterimTipi(string hammaddeTip) => hammaddeTip == "hirdavat" ? "Hırdavat"
            : hammaddeTip == "plaka" ? "Plaka" : hammaddeTip == "kenar_bandi" ? "Kenar Bandı" : "Hammadde";

        // ── SÜRÜKLE-BIRAK ────────────────────────────────────────────────────
        private void PaletListesi_MouseDown(object sender, MouseEventArgs e)
        {
            if (_paletListesi.SelectedItem is PaletOgesi oge)
            {
                _paletListesi.DoDragDrop(oge, DragDropEffects.Copy);
            }
        }

        private void AgacGorunumu_DragDrop(object sender, DragEventArgs e)
        {
            if (!(e.Data.GetData(typeof(PaletOgesi)) is PaletOgesi oge)) return;
            KalemEkle(oge);
        }

        private void SeciliPaletOgesiniKokeEkle()
        {
            if (_paletListesi.SelectedItem is PaletOgesi oge) KalemEkle(oge);
            else MessageBox.Show("Önce soldaki listeden bir öğe seçin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void KalemEkle(PaletOgesi oge)
        {
            if (_kokKart == null)
            {
                MessageBox.Show("Önce üstten bir hedef kart seçin ('Farklı Kart Seç…').", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            // Kendi kendine referans / basit döngü koruması — TAM döngü tespiti
            // (A→B→A gibi çok seviyeli) ÜretimOS'un kendi reçete ekranında
            // yapılıyor; burada YALNIZCA en bariz "kendini kendine eklemek"
            // durumu engellenir.
            if (oge.KalemTipi == _kokTip && oge.Id == (string)_kokKart["id"])
            {
                MessageBox.Show("Bir kart kendi reçetesine eklenemez.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            double miktar = MiktarSor("Miktar (ADET)", 1);
            if (miktar <= 0) return;

            if (_aktifRecete == null)
            {
                _aktifRecete = new JObject
                {
                    ["id"] = "YENI-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                    ["ad"] = (string)_kokKart["ad"] + " Reçetesi",
                    ["kalemler"] = new JArray()
                };
            }
            var yeniKalem = new JObject
            {
                ["id"] = "RK-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                ["tip"] = oge.KalemTipi,
                ["refId"] = oge.Id,
                ["miktar"] = miktar,
                ["birim"] = "ADET"
            };
            ((JArray)_aktifRecete["kalemler"]).Add(yeniKalem);
            _agacGorunumu.Nodes.Add(KalemDugumuOlustur(yeniKalem));
            _durumEtiketi.ForeColor = Color.DarkOrange;
            _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
        }

        private void KalemKaldir(TreeNode dugum)
        {
            if (!(dugum.Tag is JObject kalem) || _aktifRecete == null) return;
            ((JArray)_aktifRecete["kalemler"]).Remove(kalem);
            _agacGorunumu.Nodes.Remove(dugum);
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
            dugum.Text = KalemDugumuOlustur(kalem).Text;
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
                var kutu = new TextBox { Text = varsayilan.ToString(System.Globalization.CultureInfo.InvariantCulture), Dock = DockStyle.Top };
                var tamam = new Button { Text = "Tamam", Dock = DockStyle.Bottom, DialogResult = DialogResult.OK };
                f.Controls.Add(kutu);
                f.Controls.Add(tamam);
                f.AcceptButton = tamam;
                if (f.ShowDialog(this) != DialogResult.OK) return 0;
                return double.TryParse(kutu.Text.Trim().Replace(",", "."),
                    System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double sonuc)
                    ? sonuc : 0;
            }
        }

        // ── KAYDET ───────────────────────────────────────────────────────────
        private async System.Threading.Tasks.Task KaydetTikla()
        {
            if (_kokKart == null || _aktifRecete == null)
            {
                MessageBox.Show("Kaydedilecek bir değişiklik yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            _kaydetBtn.Enabled = false;
            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Kaydediliyor…";
            try
            {
                bool yeniKayit = ((string)_aktifRecete["id"]).StartsWith("YENI-");
                if (yeniKayit)
                {
                    _aktifRecete["id"] = "RC-" + Guid.NewGuid().ToString("N").Substring(0, 12).ToUpperInvariant();
                    string alanAdi = _kokTip == "urun" ? "urunId" : _kokTip == "yarimamul" ? "yarimamulId" : _kokTip == "altmontaj" ? "altMontajId" : "paketId";
                    _aktifRecete[alanAdi] = (string)_kokKart["id"];
                }

                var ekle = new List<object>();
                var guncelle = new List<object>();
                if (yeniKayit) ekle.Add(_aktifRecete); else guncelle.Add(_aktifRecete);

                bool basarili = await _istemci.ToplukaEkleGuncelle("receteler", ekle, guncelle);
                if (basarili)
                {
                    _durumEtiketi.ForeColor = Color.DarkGreen;
                    _durumEtiketi.Text = "✓ Kaydedildi: " + _kokKart["kod"];
                    Tanilama.Kaydet("ReceteAgaciPaneli: recete kaydedildi, kart=" + _kokKart["kod"]);
                }
                else
                {
                    _durumEtiketi.ForeColor = Color.DarkRed;
                    _durumEtiketi.Text = "Sunucu kaydı reddetti (HTTP hata). Tekrar deneyin.";
                }
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
