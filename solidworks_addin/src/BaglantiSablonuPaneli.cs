using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // BAĞLANTI ŞABLONLARI PANELİ — iki sekme:
    //   Birleşimler       : SolidWorks'te seçilen birleşim YÜZEYLERİ üstte bir
    //                       satırda sıralanır; seçilen birleşimin ayarları
    //                       (şablon, dizi, ofsetler, aralıklar, yön) altta,
    //                       her birleşim için AYRI tutulur. Değer değiştikçe
    //                       sarı SolidWorks önizlemesi (geçici gövdeler)
    //                       yenilenir; "Tümünü Uygula" hepsini keser.
    //   Şablon Kütüphanesi: delik şablonları + 3B model (kütüphane klasörüne
    //                       kopyalanır).
    // Kullanıcı isteği: "ön izleye basınca sarı solidworks ön izlemesi
    // görülsün ... eleman sayısı offset ve aralıkları değiştirince yerleri
    // belli olsun, panelleri seçmek yerine panellerin birleştiği yüzeyleri
    // seçebilelim, birkaç farklı birleşme yüzeyi seçtiğimde bu yüzeylerin
    // ayarlarını ayrı ayrı yapabileyim".
    // Reçete Ağacı ile AYNI modeless desen (bkz. SwAddin.BaglantiSablonuAcCalistir).
    // ════════════════════════════════════════════════════════════════════════
    public class BaglantiSablonuPaneli : Form
    {
        private class BirlesimAyari
        {
            public BirlesimSecimi Secim;
            public string SablonAdi;
            public BaglantiSablonu Sablon; // şablonun kopyası; dizi ayarları bu birleşime özel
            public BaglantiUygulamaSecenekleri Sec = new BaglantiUygulamaSecenekleri();
            public BaglantiPlani SonPlan;
        }

        private readonly ISldWorks _app;
        private List<BaglantiSablonu> _sablonlar;
        private readonly List<BirlesimAyari> _birlesimler = new List<BirlesimAyari>();
        private BirlesimAyari _aktifBirlesim;
        private ModelDoc2 _montaj;
        private List<BaglantiUygulayici.OnizlemeGovdesi> _onizleme = new List<BaglantiUygulayici.OnizlemeGovdesi>();
        private readonly Timer _onizlemeZamanlayici = new Timer { Interval = 450 };
        private bool _yukleniyor;

        // Birleşimler sekmesi
        private FlowLayoutPanel _birlesimSeridi;
        private ComboBox _bSablonKutu, _bModKutu;
        private NumericUpDown _bElemanSayisi;
        private TextBox _bSolOfset, _bSagOfset, _bAraliklar, _sonucKutu;
        private CheckBox _bGovdeTers, _bIcYuzTers, _bYonTers, _canliOnizleme;
        private Label _bBilgi;
        private TableLayoutPanel _bAyarlar;

        // Şablon kütüphanesi sekmesi
        private BaglantiSablonu _secili;
        private ListBox _liste;
        private TextBox _adKutu, _aciklamaKutu, _araliklarKutu, _solOfsetKutu, _sagOfsetKutu;
        private DataGridView _delikTablosu;
        private ComboBox _modKutu;
        private NumericUpDown _elemanSayisi;
        private Label _modelEtiketi;

        private static readonly string[] TUR_ADLARI = { "Gövde yüzey", "Gövde kenar", "Karşı yüzey" };
        private static readonly string[] MOD_ADLARI = { "Soldan (sol ofset + aralıklar)", "Sağdan (sağ ofset + aralıklar)", "Eşit dağıt (sol..sağ ofset arası)" };

        public BaglantiSablonuPaneli(ISldWorks app)
        {
            _app = app;
            _sablonlar = BaglantiSablonKutuphanesi.Yukle();
            _sonKaydedilen = Newtonsoft.Json.JsonConvert.SerializeObject(_sablonlar);
            _onizlemeZamanlayici.Tick += (s, e) => { _onizlemeZamanlayici.Stop(); OnizlemeYenile(); };
            KurulumYap();
            ListeyiDoldur(0);
            BirlesimSeridiniYenile();
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — Bağlantı Şablonları";
            Width = 1000; Height = 760;
            StartPosition = FormStartPosition.CenterScreen;
            TopMost = true;

            var sekmeler = new TabControl { Dock = DockStyle.Fill };
            var birlesimSekmesi = new TabPage("Birleşimler");
            var kutuphaneSekmesi = new TabPage("Şablon Kütüphanesi");
            sekmeler.TabPages.Add(birlesimSekmesi);
            sekmeler.TabPages.Add(kutuphaneSekmesi);
            sekmeler.SelectedIndexChanged += (s, e) =>
            {
                // Kütüphanede yapılan değişiklikler birleşim sekmesindeki şablon listesine yansısın.
                FormdanOku();
                SablonKutusunuDoldur();
            };
            Controls.Add(sekmeler);
            BirlesimSekmesiniKur(birlesimSekmesi);
            KutuphaneSekmesiniKur(kutuphaneSekmesi);

            FormClosing += (s, e) =>
            {
                FormdanOku();
                if (KaydedilmemisDegisiklikVar())
                {
                    var c = MessageBox.Show(this, "Kaydedilmemiş şablon değişiklikleri var. Kaydedilsin mi?", "ÜretimOS",
                        MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
                    if (c == DialogResult.Cancel) { e.Cancel = true; return; }
                    if (c == DialogResult.Yes) KutuphaneyiKaydet();
                }
                _onizlemeZamanlayici.Stop();
                BaglantiUygulayici.OnizlemeTemizle(_montaj, _onizleme);
            };
        }

        // ════ BİRLEŞİMLER SEKMESİ ═══════════════════════════════════════════
        private void BirlesimSekmesiniKur(TabPage sayfa)
        {
            // KULLANICI İSTEĞİ: "biraz düzen gerekli" — birleşim satırı kesiliyordu,
            // ayarlarla düğmeler arasında büyük boşluk vardı. Satırlar: birleşim
            // düğmeleri (alt alta sarılır) / işlem düğmeleri / ayarlar (kendi
            // yüksekliği) / alt düğmeler / sonuç (kalan alan).
            var ana = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 5, ColumnCount = 1, Padding = new Padding(8) };
            ana.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            ana.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            ana.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            ana.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            ana.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            ana.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            sayfa.Controls.Add(ana);

            _birlesimSeridi = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, WrapContents = true,
                MinimumSize = new Size(0, 34), BorderStyle = BorderStyle.FixedSingle, Padding = new Padding(2)
            };
            ana.Controls.Add(_birlesimSeridi, 0, 0);

            var ustButonlar = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = true, Margin = new Padding(0, 4, 0, 0) };
            ustButonlar.Controls.Add(Buton("🔎 Seçili Panellerin Birleşimlerini Bul", (s, e) => SeciliPanellerdenBul()));
            ustButonlar.Controls.Add(Buton("+ Seçili Yüzeyleri Ekle", (s, e) => SeciliYuzeyleriEkle()));
            ustButonlar.Controls.Add(Buton("− Seçili Birleşimi Kaldır", (s, e) =>
            {
                if (_aktifBirlesim == null) return;
                _birlesimler.Remove(_aktifBirlesim);
                _aktifBirlesim = _birlesimler.LastOrDefault();
                BirlesimSeridiniYenile();
                OnizlemeYenile();
            }));
            ustButonlar.Controls.Add(Buton("Tümünü Temizle", (s, e) =>
            {
                _birlesimler.Clear(); _aktifBirlesim = null;
                BaglantiUygulayici.OnizlemeTemizle(_montaj, _onizleme);
                BirlesimSeridiniYenile();
            }));
            ana.Controls.Add(ustButonlar, 0, 1);

            // Seçili birleşimin ayarları
            _bAyarlar = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, AutoSize = true, Padding = new Padding(0, 8, 0, 0) };
            _bAyarlar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
            _bAyarlar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            void Satir(string etiket, Control k)
            {
                _bAyarlar.RowCount++;
                _bAyarlar.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                _bAyarlar.Controls.Add(new Label { Text = etiket, AutoSize = true, Padding = new Padding(0, 6, 0, 0) });
                k.Dock = DockStyle.Fill; k.Margin = new Padding(3, 3, 3, 6);
                _bAyarlar.Controls.Add(k);
            }
            _bBilgi = new Label { AutoSize = true, ForeColor = Color.DimGray, Text = "" };
            Satir("Birleşim", _bBilgi);
            _bSablonKutu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _bSablonKutu.SelectedIndexChanged += (s, e) =>
            {
                if (_yukleniyor || _aktifBirlesim == null || _bSablonKutu.SelectedIndex < 0) return;
                var sablon = _sablonlar[_bSablonKutu.SelectedIndex];
                _aktifBirlesim.SablonAdi = sablon.Ad;
                _aktifBirlesim.Sablon = sablon.Kopya(); // dizi ayarları şablonun varsayılanına döner
                BirlesimAyarlariniGoster();
                BirlesimSeridiniYenile();
                OnizlemeIste();
            };
            Satir("Şablon", _bSablonKutu);
            _bModKutu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _bModKutu.Items.AddRange(MOD_ADLARI);
            _bModKutu.SelectedIndexChanged += (s, e) => BirlesimAyariDegisti();
            Satir("Dizi", _bModKutu);
            _bElemanSayisi = new NumericUpDown { Minimum = 1, Maximum = 50, Value = 2 };
            _bElemanSayisi.ValueChanged += (s, e) => BirlesimAyariDegisti();
            Satir("Eleman sayısı", _bElemanSayisi);
            _bSolOfset = new TextBox(); _bSolOfset.TextChanged += (s, e) => BirlesimAyariDegisti();
            Satir("Sol ofset (mm)", _bSolOfset);
            _bSagOfset = new TextBox(); _bSagOfset.TextChanged += (s, e) => BirlesimAyariDegisti();
            Satir("Sağ ofset (mm)", _bSagOfset);
            _bAraliklar = new TextBox(); _bAraliklar.TextChanged += (s, e) => BirlesimAyariDegisti();
            Satir("Aralıklar (mm)", _bAraliklar);
            Satir("", new Label { AutoSize = true, ForeColor = Color.DimGray, Text = "Aralıklar ';' ile: 224 ya da 224;192;224 — eksikse son değer tekrar eder." });
            var secenekler = new FlowLayoutPanel { AutoSize = true };
            _bGovdeTers = new CheckBox { Text = "Gövde/karşı paneli değiştir", AutoSize = true };
            _bIcYuzTers = new CheckBox { Text = "Diğer yüze al", AutoSize = true };
            _bYonTers = new CheckBox { Text = "Diziyi diğer uçtan başlat", AutoSize = true };
            foreach (var cb in new[] { _bGovdeTers, _bIcYuzTers, _bYonTers }) cb.CheckedChanged += (s, e) => BirlesimAyariDegisti();
            secenekler.Controls.AddRange(new Control[] { _bGovdeTers, _bIcYuzTers, _bYonTers });
            Satir("Yön", secenekler);
            ana.Controls.Add(_bAyarlar, 0, 2);

            // Alt düğmeler
            var alt = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill };
            _canliOnizleme = new CheckBox { Text = "Canlı önizleme (sarı)", Checked = true, AutoSize = true, Padding = new Padding(0, 6, 12, 0) };
            _canliOnizleme.CheckedChanged += (s, e) => { if (_canliOnizleme.Checked) OnizlemeIste(); else BaglantiUygulayici.OnizlemeTemizle(_montaj, _onizleme); };
            alt.Controls.Add(_canliOnizleme);
            alt.Controls.Add(Buton("🔍 Önizle", (s, e) => OnizlemeYenile()));
            alt.Controls.Add(Buton("Önizlemeyi Temizle", (s, e) => BaglantiUygulayici.OnizlemeTemizle(_montaj, _onizleme)));
            var uygula = Buton("✓ Tümünü Uygula", (s, e) => TumunuUygula());
            uygula.Font = new Font(Font, FontStyle.Bold);
            alt.Controls.Add(uygula);
            ana.Controls.Add(alt, 0, 3);

            _sonucKutu = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill };
            ana.Controls.Add(_sonucKutu, 0, 4);
        }

        private void SablonKutusunuDoldur()
        {
            _yukleniyor = true;
            _bSablonKutu.Items.Clear();
            foreach (var s in _sablonlar) _bSablonKutu.Items.Add(s.Ad);
            _yukleniyor = false;
            BirlesimAyarlariniGoster();
        }

        // Seçili PANELLER (bileşenler; herhangi bir yüzüne/kenarına tıklanmış
        // ya da ağaçtan seçilmiş olabilir) diğer panellere dayandığı tüm
        // birleşimleriyle listeye eklenir.
        private void SeciliPanellerdenBul()
        {
            var montaj = MontajiHazirla();
            if (montaj == null) return;
            var sm = montaj.SelectionManager as SelectionMgr;
            int adet = sm?.GetSelectedObjectCount2(-1) ?? 0;
            var paneller = new List<Component2>();
            for (int i = 1; i <= adet; i++)
                if (sm.GetSelectedObjectsComponent4(i, -1) is Component2 c && !paneller.Any(p => p.Name2 == c.Name2)) paneller.Add(c);
            if (paneller.Count == 0)
            {
                _sonucKutu.Text = "SolidWorks'te en az bir panel seçin (modelde paneline ya da ağaçta adına tıklayın; birden fazlası için Ctrl).";
                return;
            }
            var uyarilar = new List<string>();
            Cursor = Cursors.WaitCursor;
            List<BirlesimSecimi> bulunan;
            try { bulunan = BaglantiUygulayici.BirlesimleriBul(_app, montaj, paneller, uyarilar); }
            finally { Cursor = Cursors.Default; }
            int eklenen = bulunan.Count(b => BirlesimEkle(b));
            uyarilar.Insert(0, $"{paneller.Count} panelde {bulunan.Count} birleşim bulundu, {eklenen} yeni birleşim eklendi." +
                (bulunan.Count == 0 ? " (Seçili paneller başka bir panele alından dayanmıyor olabilir.)" : ""));
            _sonucKutu.Text = string.Join(System.Environment.NewLine, uyarilar);
            BirlesimSeridiniYenile();
            OnizlemeYenile();
        }

        private ModelDoc2 MontajiHazirla()
        {
            var montaj = _app.ActiveDoc as ModelDoc2;
            if (montaj == null || montaj.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                _sonucKutu.Text = "Aktif belge bir montaj olmalı.";
                return null;
            }
            if (_montaj != null && !ReferenceEquals(_montaj, montaj) && _birlesimler.Count > 0)
            {
                if (MessageBox.Show(this, "Başka bir montaja geçtiniz — mevcut birleşim listesi temizlensin mi?", "ÜretimOS",
                        MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return null;
                BaglantiUygulayici.OnizlemeTemizle(_montaj, _onizleme);
                _birlesimler.Clear();
            }
            _montaj = montaj;
            return montaj;
        }

        // Aynı panel çifti + aynı düzlem zaten listede değilse ekler.
        private bool BirlesimEkle(BirlesimSecimi secim)
        {
            bool ayni = _birlesimler.Any(b =>
                ((b.Secim.A.Name2 == secim.A.Name2 && b.Secim.B.Name2 == secim.B.Name2) || (b.Secim.A.Name2 == secim.B.Name2 && b.Secim.B.Name2 == secim.A.Name2)) &&
                Math.Abs(b.Secim.N[0] * (secim.P[0] - b.Secim.P[0]) + b.Secim.N[1] * (secim.P[1] - b.Secim.P[1]) + b.Secim.N[2] * (secim.P[2] - b.Secim.P[2])) < 0.0001);
            if (ayni) return false;
            var sablon = _aktifBirlesim != null ? _sablonlar.FirstOrDefault(s => s.Ad == _aktifBirlesim.SablonAdi) : null;
            sablon = sablon ?? _secili ?? _sablonlar.FirstOrDefault();
            if (sablon == null) return false;
            var yeni = new BirlesimAyari { Secim = secim, SablonAdi = sablon.Ad, Sablon = sablon.Kopya() };
            _birlesimler.Add(yeni);
            _aktifBirlesim = yeni;
            return true;
        }

        private void SeciliYuzeyleriEkle()
        {
            var montaj = MontajiHazirla();
            if (montaj == null) return;
            var sm = montaj.SelectionManager as SelectionMgr;
            int adet = sm?.GetSelectedObjectCount2(-1) ?? 0;
            var mesajlar = new List<string>();
            int eklenen = 0, yuzSayisi = 0;
            Cursor = Cursors.WaitCursor;
            try
            {
                for (int i = 1; i <= adet; i++)
                {
                    if (sm.GetSelectedObjectType3(i, -1) != (int)swSelectType_e.swSelFACES) continue;
                    var yuz = sm.GetSelectedObject6(i, -1) as Face2;
                    var bilesen = sm.GetSelectedObjectsComponent4(i, -1) as Component2;
                    if (yuz == null || bilesen == null) continue;
                    yuzSayisi++;
                    var secim = BaglantiUygulayici.YuzdenBirlesimBul(_app, montaj, bilesen, yuz, out string hata);
                    if (secim == null) { mesajlar.Add($"Yüzey {i} ({bilesen.Name2}): {hata}"); continue; }
                    if (BirlesimEkle(secim)) eklenen++;
                    else mesajlar.Add($"Yüzey {i}: {secim.Ad} zaten listede.");
                }
            }
            finally { Cursor = Cursors.Default; }
            if (yuzSayisi == 0)
                mesajlar.Add("SolidWorks'te birleşim yüzeyi seçili değil. Yüzeyler bitişik olduğu için seçmek zorsa paneli seçip '🔎 Seçili Panellerin Birleşimlerini Bul'u kullanın.");
            mesajlar.Insert(0, $"{eklenen} birleşim eklendi.");
            _sonucKutu.Text = string.Join(System.Environment.NewLine, mesajlar);
            BirlesimSeridiniYenile();
            OnizlemeYenile();
        }

        private void BirlesimSeridiniYenile()
        {
            _birlesimSeridi.SuspendLayout();
            _birlesimSeridi.Controls.Clear();
            for (int i = 0; i < _birlesimler.Count; i++)
            {
                var b = _birlesimler[i];
                var rb = new RadioButton
                {
                    Appearance = Appearance.Button, AutoSize = true, Checked = ReferenceEquals(b, _aktifBirlesim),
                    Text = $"{i + 1}  {b.Secim.Ad}  [{b.SablonAdi}]", Margin = new Padding(3), Padding = new Padding(4, 2, 4, 2)
                };
                rb.CheckedChanged += (s, e) => { if (rb.Checked && !_yukleniyor) { _aktifBirlesim = b; BirlesimAyarlariniGoster(); OnizlemeYenile(); } };
                _birlesimSeridi.Controls.Add(rb);
            }
            if (_birlesimler.Count == 0)
                _birlesimSeridi.Controls.Add(new Label { AutoSize = true, ForeColor = Color.DimGray, Padding = new Padding(4, 8, 0, 0),
                    Text = "Panelleri seçip '🔎 Seçili Panellerin Birleşimlerini Bul'a basın (seçili birleşim turuncu, diğerleri mavi gösterilir)." });
            _birlesimSeridi.ResumeLayout();
            BirlesimAyarlariniGoster();
        }

        private void BirlesimAyarlariniGoster()
        {
            _yukleniyor = true;
            var b = _aktifBirlesim;
            _bAyarlar.Enabled = b != null;
            if (b != null)
            {
                _bSablonKutu.SelectedIndex = _sablonlar.FindIndex(s => s.Ad == b.SablonAdi);
                _bModKutu.SelectedIndex = (int)b.Sablon.Mod;
                _bElemanSayisi.Value = Math.Max(1, Math.Min(50, b.Sablon.ElemanSayisi));
                _bSolOfset.Text = Sayi(b.Sablon.SolOfsetMm);
                _bSagOfset.Text = Sayi(b.Sablon.SagOfsetMm);
                _bAraliklar.Text = string.Join(";", (b.Sablon.AraliklarMm ?? new List<double>()).Select(Sayi));
                _bGovdeTers.Checked = b.Sec.GovdeKarsiTers;
                _bIcYuzTers.Checked = b.Sec.IcYuzTers;
                _bYonTers.Checked = b.Sec.YonTers;
                BilgiYaz(b);
            }
            else _bBilgi.Text = "";
            _yukleniyor = false;
        }

        private void BilgiYaz(BirlesimAyari b)
        {
            var p = b.SonPlan;
            if (p == null) { _bBilgi.Text = b.Secim.Ad; return; }
            if (p.Hata != null) { _bBilgi.Text = b.Secim.Ad + "  —  ✗ " + p.Hata; return; }
            int g = p.Delikler.Count(d => d.GovdeyeMi);
            _bBilgi.Text = $"Gövde: {p.Govde?.Name2} ({p.GovdeKalinlikMm:0.#} mm)   Karşı: {p.Karsi?.Name2}   Boy: {p.BirlesimBoyuMm:0.#} mm\n" +
                           $"Konumlar: {string.Join(", ", p.ElemanKonumlariMm.Select(Sayi))}   Delik: {p.Delikler.Count} (gövde {g}, karşı {p.Delikler.Count - g})" +
                           (p.Uyarilar.Count > 0 ? $"   ⚠ {p.Uyarilar.Count} uyarı" : "");
        }

        private void BirlesimAyariDegisti()
        {
            if (_yukleniyor || _aktifBirlesim == null) return;
            var s = _aktifBirlesim.Sablon;
            s.Mod = (DiziModu)Math.Max(0, _bModKutu.SelectedIndex);
            s.ElemanSayisi = (int)_bElemanSayisi.Value;
            s.SolOfsetMm = Oku(_bSolOfset.Text);
            s.SagOfsetMm = Oku(_bSagOfset.Text);
            s.AraliklarMm = _bAraliklar.Text.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries).Select(t => Oku(t)).ToList();
            _aktifBirlesim.Sec.GovdeKarsiTers = _bGovdeTers.Checked;
            _aktifBirlesim.Sec.IcYuzTers = _bIcYuzTers.Checked;
            _aktifBirlesim.Sec.YonTers = _bYonTers.Checked;
            OnizlemeIste();
        }

        private void OnizlemeIste()
        {
            if (!_canliOnizleme.Checked) return;
            _onizlemeZamanlayici.Stop();
            _onizlemeZamanlayici.Start();
        }

        // Tüm birleşimlerin planını hesaplar, sarı önizlemeyi yeniler.
        private void OnizlemeYenile()
        {
            if (_montaj == null) return;
            Cursor = Cursors.WaitCursor;
            try
            {
                foreach (var b in _birlesimler) b.SonPlan = BaglantiUygulayici.Hesapla(_app, b.Secim, b.Sablon, b.Sec);
                BaglantiUygulayici.OnizlemeTemizle(_montaj, _onizleme);
                _onizleme = BaglantiUygulayici.OnizlemeGoster(_app, _montaj, _birlesimler.Where(b => b.SonPlan?.Hata == null).Select(b => b.SonPlan), _aktifBirlesim?.SonPlan);
                if (_aktifBirlesim != null) { _yukleniyor = true; BilgiYaz(_aktifBirlesim); _yukleniyor = false; }
                _sonucKutu.Text = string.Join(System.Environment.NewLine, _birlesimler.Select((b, i) =>
                {
                    var p = b.SonPlan;
                    string bas = $"{i + 1}  {b.Secim.Ad}: ";
                    if (p.Hata != null) return bas + "✗ " + p.Hata;
                    return bas + $"{p.Delikler.Count} delik, konumlar {string.Join(", ", p.ElemanKonumlariMm.Select(Sayi))}" +
                           string.Concat(p.Uyarilar.Select(u => System.Environment.NewLine + "   ⚠ " + u));
                }));
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BaglantiSablonuPaneli.OnizlemeYenile HATA: " + ex);
                _sonucKutu.Text = "Önizleme hatası: " + ex.Message;
            }
            finally { Cursor = Cursors.Default; }
        }

        private void TumunuUygula()
        {
            if (_birlesimler.Count == 0 || _montaj == null) { _sonucKutu.Text = "Önce birleşim yüzeylerini ekleyin."; return; }
            OnizlemeYenile();
            var uygulanabilir = _birlesimler.Where(b => b.SonPlan != null && b.SonPlan.Hata == null && b.SonPlan.Delikler.Count > 0).ToList();
            int toplamDelik = uygulanabilir.Sum(b => b.SonPlan.Delikler.Count);
            int modelli = uygulanabilir.Count(b => b.SonPlan.ModelYolu != null);
            string onay = $"{uygulanabilir.Count} birleşimde toplam {toplamDelik} delik gerçek kesim (CutExtrude) olarak açılacak" +
                          (modelli > 0 ? $", {modelli} birleşime 3B model yerleştirilecek" : "") +
                          ".\nGeri almak için ilgili parçalarda 'UOS …' adlı kesimleri silin. Devam edilsin mi?";
            if (uygulanabilir.Count == 0) { _sonucKutu.Text = "Uygulanabilir birleşim yok (önizleme sonuçlarına bakın)."; return; }
            if (MessageBox.Show(this, onay, "ÜretimOS — Bağlantı Uygula", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

            BaglantiUygulayici.OnizlemeTemizle(_montaj, _onizleme);
            var satirlar = new List<string>();
            Cursor = Cursors.WaitCursor;
            try
            {
                foreach (var b in uygulanabilir)
                {
                    var uyarilar = new List<string>();
                    int acilan = BaglantiUygulayici.Uygula(_app, _montaj, b.SonPlan, b.SablonAdi, uyarilar);
                    satirlar.Add($"{b.Secim.Ad}: ✓ {acilan}/{b.SonPlan.Delikler.Count} delik");
                    satirlar.AddRange(uyarilar.Select(u => "   ✗ " + u));
                }
            }
            finally { Cursor = Cursors.Default; }
            // Uygulanan birleşimler listeden çıkar (geometri değişti, tekrar önizlenmesin).
            _birlesimler.RemoveAll(b => uygulanabilir.Contains(b));
            _aktifBirlesim = _birlesimler.LastOrDefault();
            BirlesimSeridiniYenile();
            _sonucKutu.Text = string.Join(System.Environment.NewLine, satirlar);
        }

        // ════ ŞABLON KÜTÜPHANESİ SEKMESİ ═══════════════════════════════════
        private void KutuphaneSekmesiniKur(TabPage sayfa)
        {
            var bolme = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1 };
            sayfa.Controls.Add(bolme);
            Load += (s, e) => bolme.SplitterDistance = 240;

            var sol = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, Padding = new Padding(8) };
            sol.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            sol.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            _liste = new ListBox { Dock = DockStyle.Fill, IntegralHeight = false };
            _liste.SelectedIndexChanged += (s, e) => { FormdanOku(); SablonuGoster(_liste.SelectedIndex); };
            sol.Controls.Add(_liste, 0, 0);
            var solButonlar = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            solButonlar.Controls.Add(Buton("+ Yeni", (s, e) => { FormdanOku(); _sablonlar.Add(new BaglantiSablonu()); ListeyiDoldur(_sablonlar.Count - 1); }));
            solButonlar.Controls.Add(Buton("Kopyala", (s, e) =>
            {
                if (_secili == null) return;
                FormdanOku();
                var k = _secili.Kopya(); k.Ad += " (kopya)";
                _sablonlar.Add(k); ListeyiDoldur(_sablonlar.Count - 1);
            }));
            solButonlar.Controls.Add(Buton("Sil", (s, e) =>
            {
                if (_secili == null) return;
                if (MessageBox.Show(this, $"'{_secili.Ad}' silinsin mi?", "ÜretimOS", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
                int i = _sablonlar.IndexOf(_secili);
                _sablonlar.Remove(_secili); _secili = null;
                ListeyiDoldur(Math.Min(i, _sablonlar.Count - 1));
            }));
            sol.Controls.Add(solButonlar, 0, 1);
            bolme.Panel1.Controls.Add(sol);

            var sag = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(8), AutoScroll = true };
            sag.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
            sag.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            void Satir(string etiket, Control k, int yukseklik = 0)
            {
                sag.RowCount++;
                sag.RowStyles.Add(yukseklik > 0 ? new RowStyle(SizeType.Absolute, yukseklik) : new RowStyle(SizeType.AutoSize));
                sag.Controls.Add(new Label { Text = etiket, AutoSize = true, Padding = new Padding(0, 6, 0, 0) });
                k.Dock = DockStyle.Fill; k.Margin = new Padding(3, 3, 3, 6);
                sag.Controls.Add(k);
            }

            _adKutu = new TextBox(); Satir("Şablon adı", _adKutu);
            _aciklamaKutu = new TextBox(); Satir("Açıklama", _aciklamaKutu);

            _delikTablosu = new DataGridView
            {
                AllowUserToAddRows = true, AllowUserToDeleteRows = true, RowHeadersWidth = 24,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
            };
            var turKolonu = new DataGridViewComboBoxColumn { HeaderText = "Delik türü", FlatStyle = FlatStyle.Flat, FillWeight = 160 };
            turKolonu.Items.AddRange(TUR_ADLARI);
            _delikTablosu.Columns.Add(turKolonu);
            _delikTablosu.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "X (mm)", FillWeight = 70 });
            _delikTablosu.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Ofset (mm)", FillWeight = 80 });
            _delikTablosu.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Çap (mm)", FillWeight = 70 });
            _delikTablosu.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Derinlik (mm)", FillWeight = 80 });
            _delikTablosu.DataError += (s, e) => { e.ThrowException = false; };
            Satir("Delikler (bir eleman)", _delikTablosu, 190);
            Satir("", new Label
            {
                AutoSize = true, ForeColor = Color.DimGray,
                Text = "Gövde yüzey: gövde panelinin iç yüzüne; Ofset = birleşim yüzeyinden uzaklık.\n" +
                       "Gövde kenar: gövde panelinin alnına; Karşı yüzey: diğer panelin yüzeyine — Ofset = gövde kalınlığının ortasından kaydırma.\n" +
                       "X = elemanın merkezine göre birleşim boyunca kaydırma."
            });

            // 3B model
            var modelSatiri = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
            _modelEtiketi = new Label { AutoSize = true, Padding = new Padding(0, 6, 8, 0) };
            modelSatiri.Controls.Add(_modelEtiketi);
            modelSatiri.Controls.Add(Buton("📦 3B Model Ekle…", (s, e) => ModelEkle()));
            modelSatiri.Controls.Add(Buton("Modeli Kaldır", (s, e) =>
            {
                if (_secili == null) return;
                _secili.ModelDosyasi = null; ModelEtiketiniYaz();
            }));
            modelSatiri.Controls.Add(Buton("Klasörü Aç", (s, e) =>
            {
                Directory.CreateDirectory(BaglantiSablonKutuphanesi.ModelKlasoru);
                System.Diagnostics.Process.Start("explorer.exe", "\"" + BaglantiSablonKutuphanesi.ModelKlasoru + "\"");
            }));
            Satir("3B model", modelSatiri);
            Satir("", new Label
            {
                AutoSize = true, ForeColor = Color.DimGray,
                Text = "Model orijini: bağlantı elemanının merkezi (birleşim yüzeyinde, gövde kalınlığının ortasında).\n" +
                       "X: birleşim boyunca, Y: gövde paneline doğru, Z: gövdenin iç yüzüne doğru."
            });

            _modKutu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _modKutu.Items.AddRange(MOD_ADLARI);
            Satir("Varsayılan dizi", _modKutu);
            _elemanSayisi = new NumericUpDown { Minimum = 1, Maximum = 50, Value = 2 };
            Satir("Eleman sayısı", _elemanSayisi);
            _solOfsetKutu = new TextBox(); Satir("Sol ofset (mm)", _solOfsetKutu);
            _sagOfsetKutu = new TextBox(); Satir("Sağ ofset (mm)", _sagOfsetKutu);
            _araliklarKutu = new TextBox(); Satir("Aralıklar (mm)", _araliklarKutu);
            Satir("", Buton("💾 Kütüphaneyi Kaydet", (s, e) => KutuphaneyiKaydet()));
            bolme.Panel2.Controls.Add(sag);
        }

        private void ModelEkle()
        {
            if (_secili == null) return;
            using (var dlg = new OpenFileDialog { Title = "Bağlantı 3B modeli", Filter = "SolidWorks parça/montaj (*.sldprt;*.sldasm)|*.sldprt;*.sldasm" })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    _secili.ModelDosyasi = BaglantiSablonKutuphanesi.ModeliKutuphaneyeKopyala(dlg.FileName);
                    ModelEtiketiniYaz();
                    string not = dlg.FileName.EndsWith(".sldasm", StringComparison.OrdinalIgnoreCase)
                        ? " — montaj modelinin alt parçaları kopyalanmaz, aynı klasöre ayrıca koyun." : "";
                    MessageBox.Show(this, "Model kütüphaneye kopyalandı:\n" + _secili.ModelYolu() + not +
                        "\n\nŞablonu kalıcı yapmak için '💾 Kütüphaneyi Kaydet'e basın.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, "Model kopyalanamadı: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void ModelEtiketiniYaz()
        {
            string yol = _secili?.ModelYolu();
            _modelEtiketi.Text = yol == null ? "(model yok)" : (File.Exists(yol) ? _secili.ModelDosyasi : _secili.ModelDosyasi + "  ⚠ dosya yok");
        }

        private static Button Buton(string metin, EventHandler tik)
        {
            var b = new Button { Text = metin, AutoSize = true };
            b.Click += tik;
            return b;
        }

        private void ListeyiDoldur(int secilecek)
        {
            _yukleniyor = true;
            _liste.Items.Clear();
            foreach (var s in _sablonlar) _liste.Items.Add(s.Ad);
            _yukleniyor = false;
            _secili = null;
            if (secilecek >= 0 && secilecek < _sablonlar.Count) _liste.SelectedIndex = secilecek;
            else SablonuGoster(-1);
            SablonKutusunuDoldur();
        }

        private void SablonuGoster(int i)
        {
            if (_yukleniyor) return;
            _secili = i >= 0 && i < _sablonlar.Count ? _sablonlar[i] : null;
            var s = _secili ?? new BaglantiSablonu();
            _yukleniyor = true;
            _adKutu.Text = s.Ad;
            _aciklamaKutu.Text = s.Aciklama;
            _delikTablosu.Rows.Clear();
            foreach (var d in s.Delikler)
                _delikTablosu.Rows.Add(TUR_ADLARI[(int)d.Tur], Sayi(d.XMm), Sayi(d.OfsetMm), Sayi(d.CapMm), Sayi(d.DerinlikMm));
            _modKutu.SelectedIndex = (int)s.Mod;
            _elemanSayisi.Value = Math.Max(1, Math.Min(50, s.ElemanSayisi));
            _solOfsetKutu.Text = Sayi(s.SolOfsetMm);
            _sagOfsetKutu.Text = Sayi(s.SagOfsetMm);
            _araliklarKutu.Text = string.Join(";", (s.AraliklarMm ?? new List<double>()).Select(Sayi));
            ModelEtiketiniYaz();
            _yukleniyor = false;
        }

        // Kütüphane sekmesindeki değerleri seçili şablona yazar.
        private void FormdanOku()
        {
            if (_yukleniyor || _secili == null) return;
            string eskiAd = _secili.Ad;
            _secili.Ad = string.IsNullOrWhiteSpace(_adKutu.Text) ? "Adsız" : _adKutu.Text.Trim();
            _secili.Aciklama = _aciklamaKutu.Text.Trim();
            _secili.Delikler = new List<DelikTanimi>();
            foreach (DataGridViewRow r in _delikTablosu.Rows)
            {
                if (r.IsNewRow) continue;
                int tur = Array.IndexOf(TUR_ADLARI, r.Cells[0].Value as string);
                double cap = Oku(r.Cells[3].Value), derinlik = Oku(r.Cells[4].Value);
                if (tur < 0 || cap <= 0) continue;
                _secili.Delikler.Add(new DelikTanimi
                {
                    Tur = (DelikTuru)tur, XMm = Oku(r.Cells[1].Value), OfsetMm = Oku(r.Cells[2].Value),
                    CapMm = cap, DerinlikMm = derinlik
                });
            }
            _secili.Mod = (DiziModu)Math.Max(0, _modKutu.SelectedIndex);
            _secili.ElemanSayisi = (int)_elemanSayisi.Value;
            _secili.SolOfsetMm = Oku(_solOfsetKutu.Text);
            _secili.SagOfsetMm = Oku(_sagOfsetKutu.Text);
            _secili.AraliklarMm = _araliklarKutu.Text.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries).Select(t => Oku(t)).ToList();
            // Ad değiştiyse bu şablonu kullanan birleşimler yeni adı izlesin.
            foreach (var b in _birlesimler.Where(b => b.SablonAdi == eskiAd)) b.SablonAdi = _secili.Ad;
            int i = _sablonlar.IndexOf(_secili);
            if (i >= 0 && i < _liste.Items.Count && (string)_liste.Items[i] != _secili.Ad)
            {
                _yukleniyor = true; _liste.Items[i] = _secili.Ad; _yukleniyor = false;
            }
        }

        private string _sonKaydedilen;
        private bool KaydedilmemisDegisiklikVar() =>
            Newtonsoft.Json.JsonConvert.SerializeObject(_sablonlar) != _sonKaydedilen;

        private void KutuphaneyiKaydet()
        {
            FormdanOku();
            try
            {
                BaglantiSablonKutuphanesi.Kaydet(_sablonlar);
                _sonKaydedilen = Newtonsoft.Json.JsonConvert.SerializeObject(_sablonlar);
                _sonucKutu.Text = "Kütüphane kaydedildi: " + BaglantiSablonKutuphanesi.DosyaYolu;
                SablonKutusunuDoldur();
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Kaydedilemedi: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static string Sayi(double d) => d.ToString("0.###", CultureInfo.InvariantCulture);
        private static double Oku(object o)
        {
            string t = (o as string ?? o?.ToString() ?? "").Trim().Replace(',', '.');
            return double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out double d) ? d : 0;
        }
    }
}
