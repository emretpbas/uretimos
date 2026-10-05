using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // BAĞLANTI ŞABLONLARI PANELİ — delik/bağlantı şablonlarını tanımlar ve
    // montajda seçili iki panele uygular (bkz. BaglantiSablonlari.cs,
    // BaglantiUygulayici.cs). Reçete Ağacı ile AYNI modeless desen: panel
    // açıkken SolidWorks'te panel seçimi değiştirilip tekrar uygulanabilir.
    // ════════════════════════════════════════════════════════════════════════
    public class BaglantiSablonuPaneli : Form
    {
        private readonly ISldWorks _app;
        private List<BaglantiSablonu> _sablonlar;
        private BaglantiSablonu _secili;
        private bool _yukleniyor;

        private ListBox _liste;
        private TextBox _adKutu, _aciklamaKutu, _araliklarKutu, _sonucKutu;
        private DataGridView _delikTablosu;
        private ComboBox _modKutu;
        private NumericUpDown _elemanSayisi;
        private TextBox _solOfsetKutu, _sagOfsetKutu;
        private CheckBox _govdeTersKutu, _icYuzTersKutu, _yonTersKutu;

        private static readonly string[] TUR_ADLARI = { "Gövde yüzey", "Gövde kenar", "Karşı yüzey" };
        private static readonly string[] MOD_ADLARI = { "Soldan (sol ofset + aralıklar)", "Sağdan (sağ ofset + aralıklar)", "Eşit dağıt (sol..sağ ofset arası)" };

        public BaglantiSablonuPaneli(ISldWorks app)
        {
            _app = app;
            _sablonlar = BaglantiSablonKutuphanesi.Yukle();
            KurulumYap();
            ListeyiDoldur(0);
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — Bağlantı Şablonları";
            Width = 980; Height = 700;
            StartPosition = FormStartPosition.CenterScreen;
            TopMost = true;

            var bolme = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 240 };
            Controls.Add(bolme);

            // ── Sol: şablon listesi ─────────────────────────────────────────
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

            // ── Sağ: şablon düzenleyici + uygulama ─────────────────────────
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

            _modKutu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _modKutu.Items.AddRange(MOD_ADLARI);
            Satir("Dizi", _modKutu);
            _elemanSayisi = new NumericUpDown { Minimum = 1, Maximum = 50, Value = 2 };
            Satir("Eleman sayısı", _elemanSayisi);
            _solOfsetKutu = new TextBox(); Satir("Sol ofset (mm)", _solOfsetKutu);
            _sagOfsetKutu = new TextBox(); Satir("Sağ ofset (mm)", _sagOfsetKutu);
            _araliklarKutu = new TextBox(); Satir("Aralıklar (mm)", _araliklarKutu);
            Satir("", new Label { AutoSize = true, ForeColor = Color.DimGray, Text = "Aralıklar ';' ile: 224 ya da 224;192;224 — eksikse son değer tekrar eder." });
            var kaydetBtn = Buton("💾 Kütüphaneyi Kaydet", (s, e) => KutuphaneyiKaydet());
            Satir("", kaydetBtn);

            var secenekler = new FlowLayoutPanel { AutoSize = true };
            _govdeTersKutu = new CheckBox { Text = "Gövde/karşı paneli değiştir", AutoSize = true };
            _icYuzTersKutu = new CheckBox { Text = "Diğer yüze al", AutoSize = true };
            _yonTersKutu = new CheckBox { Text = "Diziyi diğer uçtan başlat", AutoSize = true };
            secenekler.Controls.AddRange(new Control[] { _govdeTersKutu, _icYuzTersKutu, _yonTersKutu });
            Satir("Uygulama", secenekler);

            var uygulaButonlar = new FlowLayoutPanel { AutoSize = true };
            uygulaButonlar.Controls.Add(Buton("🔍 Seçili İki Panelde Önizle", (s, e) => Calistir(sadeceOnizle: true)));
            var uygulaBtn = Buton("✓ Seçili İki Panele Uygula", (s, e) => Calistir(sadeceOnizle: false));
            uygulaBtn.Font = new Font(Font, FontStyle.Bold);
            uygulaButonlar.Controls.Add(uygulaBtn);
            Satir("", uygulaButonlar);

            _sonucKutu = new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
            Satir("Sonuç", _sonucKutu, 150);
            bolme.Panel2.Controls.Add(sag);

            FormClosing += (s, e) =>
            {
                FormdanOku();
                if (!KaydedilmemisDegisiklikVar()) return;
                var c = MessageBox.Show(this, "Kaydedilmemiş şablon değişiklikleri var. Kaydedilsin mi?", "ÜretimOS",
                    MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
                if (c == DialogResult.Cancel) e.Cancel = true;
                else if (c == DialogResult.Yes) KutuphaneyiKaydet();
            };
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
            _yukleniyor = false;
        }

        // Formdaki değerleri seçili şablona yazar (hatalı sayılar 0 olur).
        private void FormdanOku()
        {
            if (_yukleniyor || _secili == null) return;
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
            _secili.AraliklarMm = _araliklarKutu.Text.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(t => Oku(t)).ToList();
            int i = _sablonlar.IndexOf(_secili);
            if (i >= 0 && i < _liste.Items.Count && (string)_liste.Items[i] != _secili.Ad)
            {
                _yukleniyor = true; _liste.Items[i] = _secili.Ad; _yukleniyor = false;
            }
        }

        private string _sonKaydedilen;
        private bool KaydedilmemisDegisiklikVar()
        {
            string simdi = Newtonsoft.Json.JsonConvert.SerializeObject(_sablonlar);
            if (_sonKaydedilen == null) _sonKaydedilen = Newtonsoft.Json.JsonConvert.SerializeObject(BaglantiSablonKutuphanesi.Yukle());
            return simdi != _sonKaydedilen;
        }

        private void KutuphaneyiKaydet()
        {
            FormdanOku();
            try
            {
                BaglantiSablonKutuphanesi.Kaydet(_sablonlar);
                _sonKaydedilen = Newtonsoft.Json.JsonConvert.SerializeObject(_sablonlar);
                _sonucKutu.Text = "Kütüphane kaydedildi: " + BaglantiSablonKutuphanesi.DosyaYolu;
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Kaydedilemedi: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void Calistir(bool sadeceOnizle)
        {
            FormdanOku();
            if (_secili == null || _secili.Delikler.Count == 0)
            {
                _sonucKutu.Text = "Önce delikleri olan bir şablon seçin.";
                return;
            }
            var montaj = _app.ActiveDoc as ModelDoc2;
            if (montaj == null || montaj.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                _sonucKutu.Text = "Aktif belge bir montaj olmalı. Montajda birbirine dayanan İKİ paneli seçin (Ctrl ile).";
                return;
            }
            var bilesenler = SeciliBilesenler(montaj);
            if (bilesenler.Count != 2)
            {
                _sonucKutu.Text = $"Montajda tam olarak İKİ panel seçili olmalı (şu an {bilesenler.Count}). Ctrl ile iki panele (ya da yüzlerine) tıklayın.";
                return;
            }

            var sec = new BaglantiUygulamaSecenekleri
            {
                GovdeKarsiTers = _govdeTersKutu.Checked, IcYuzTers = _icYuzTersKutu.Checked, YonTers = _yonTersKutu.Checked
            };
            Cursor = Cursors.WaitCursor;
            BaglantiPlani plan;
            try { plan = BaglantiUygulayici.Hesapla(_app, bilesenler[0], bilesenler[1], _secili, sec); }
            finally { Cursor = Cursors.Default; }

            var ozet = new List<string>();
            if (plan.Hata != null)
            {
                _sonucKutu.Text = "✗ " + plan.Hata;
                return;
            }
            int govdeDelik = plan.Delikler.Count(d => d.GovdeyeMi);
            ozet.Add($"Gövde paneli: {plan.Govde.Name2}  (kalınlık {plan.GovdeKalinlikMm:0.#} mm)");
            ozet.Add($"Karşı panel: {plan.Karsi.Name2}");
            ozet.Add($"Birleşim boyu: {plan.BirlesimBoyuMm:0.#} mm — eleman konumları: " +
                     string.Join(", ", _secili.ElemanKonumlari(plan.BirlesimBoyuMm).Select(k => k.ToString("0.#", CultureInfo.InvariantCulture))));
            ozet.Add($"Açılacak delik: {plan.Delikler.Count} (gövdede {govdeDelik}, karşı panelde {plan.Delikler.Count - govdeDelik})");
            ozet.AddRange(plan.Uyarilar.Select(u => "⚠ " + u));

            if (sadeceOnizle || plan.Delikler.Count == 0)
            {
                _sonucKutu.Text = string.Join(System.Environment.NewLine, ozet);
                return;
            }

            string onay = string.Join(System.Environment.NewLine, ozet) + System.Environment.NewLine + System.Environment.NewLine +
                          "Bu delikler İKİ parçada gerçek kesim (CutExtrude) olarak açılacak. Geri almak için ilgili parçada Ctrl+Z ya da kesim özelliklerini silin. Devam edilsin mi?";
            if (MessageBox.Show(this, onay, "ÜretimOS — Bağlantı Uygula", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            {
                _sonucKutu.Text = string.Join(System.Environment.NewLine, ozet) + System.Environment.NewLine + "İptal edildi.";
                return;
            }

            var uyarilar = new List<string>();
            Cursor = Cursors.WaitCursor;
            int acilan;
            try { acilan = BaglantiUygulayici.Uygula(_app, montaj, plan, _secili.Ad, uyarilar); }
            finally { Cursor = Cursors.Default; }
            ozet.Add($"✓ {acilan}/{plan.Delikler.Count} delik açıldı.");
            ozet.AddRange(uyarilar.Select(u => "✗ " + u));
            _sonucKutu.Text = string.Join(System.Environment.NewLine, ozet);
        }

        private static List<Component2> SeciliBilesenler(ModelDoc2 montaj)
        {
            var liste = new List<Component2>();
            var sm = montaj.SelectionManager as SelectionMgr;
            if (sm == null) return liste;
            int adet = sm.GetSelectedObjectCount2(-1);
            for (int i = 1; i <= adet; i++)
                if (sm.GetSelectedObjectsComponent4(i, -1) is Component2 c && !liste.Any(l => l.Name2 == c.Name2))
                    liste.Add(c);
            return liste;
        }

        private static string Sayi(double d) => d.ToString("0.###", CultureInfo.InvariantCulture);
        private static double Oku(object o)
        {
            string t = (o as string ?? o?.ToString() ?? "").Trim().Replace(',', '.');
            return double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out double d) ? d : 0;
        }
    }
}
