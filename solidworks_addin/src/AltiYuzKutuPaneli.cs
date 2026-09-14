using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // 6 YÜZ KUTU PANELİ — kullanıcı isteği: "Frame ... 6 yüz eksende ...
    // box'ı da 6 yüz olarak yap". Frame (gövde) VEYA Box (çekmece/kapak/
    // arkalık/raf/dikme vb. kütüphane elemanı) — İKİSİ İÇİN DE bu panel
    // kullanılır (aynı AltiYuzKutuOlusturucu.cs motoru).
    // ════════════════════════════════════════════════════════════════════════
    public class AltiYuzKutuPaneli : Form
    {
        private readonly ISldWorks _app;
        private TextBox _kodKutusu, _adKutusu, _genislikKutusu, _yukseklikKutusu, _derinlikKutusu, _kalinlikKutusu;
        private TextBox _klasorKutusu;
        private CheckBox _ustKutusu, _altKutusu, _solKutusu, _sagKutusu, _onKutusu, _arkaKutusu;
        private Label _durumEtiketi;

        public AltiYuzKutuPaneli(ISldWorks app)
        {
            _app = app;
            KurulumYap();
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — 6 Yüz Kutu Oluştur (Frame / Box)";
            Width = 560; Height = 560;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false; MinimizeBox = false;

            var ana = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(14), AutoScroll = true };
            ana.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 34));
            ana.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 66));

            void Satir(string etiket, Control kontrol, int yukseklik = 0)
            {
                ana.RowCount++;
                ana.RowStyles.Add(yukseklik > 0 ? new RowStyle(SizeType.Absolute, yukseklik) : new RowStyle(SizeType.AutoSize));
                var lbl = new Label { Text = etiket, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 6, 0, 0) };
                kontrol.Dock = DockStyle.Fill;
                kontrol.Margin = new Padding(3, 3, 3, 8);
                ana.Controls.Add(lbl);
                ana.Controls.Add(kontrol);
            }

            _kodKutusu = new TextBox(); Satir("Kod (dosya adlarının temeli)\nörn. DOLAP-01 veya CEKMECE-STD", _kodKutusu, 40);
            _adKutusu = new TextBox(); Satir("Ad", _adKutusu);
            _genislikKutusu = new TextBox(); Satir("Genişlik (mm) — X ekseni", _genislikKutusu);
            _yukseklikKutusu = new TextBox(); Satir("Yükseklik (mm) — Y ekseni", _yukseklikKutusu);
            _derinlikKutusu = new TextBox(); Satir("Derinlik (mm) — Z ekseni", _derinlikKutusu);
            _kalinlikKutusu = new TextBox { Text = "18" }; Satir("Panel Kalınlığı (mm)\n(TÜM paneller için aynı — v1 sınırlaması)", _kalinlikKutusu, 40);

            var yuzlerPanel = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight, Margin = new Padding(0) };
            _ustKutusu = new CheckBox { Text = "Üst", Checked = true, AutoSize = true, Margin = new Padding(3, 3, 12, 3) };
            _altKutusu = new CheckBox { Text = "Alt", Checked = true, AutoSize = true, Margin = new Padding(3, 3, 12, 3) };
            _solKutusu = new CheckBox { Text = "Sol", Checked = true, AutoSize = true, Margin = new Padding(3, 3, 12, 3) };
            _sagKutusu = new CheckBox { Text = "Sağ", Checked = true, AutoSize = true, Margin = new Padding(3, 3, 12, 3) };
            _onKutusu = new CheckBox { Text = "Ön", Checked = true, AutoSize = true, Margin = new Padding(3, 3, 12, 3) };
            _arkaKutusu = new CheckBox { Text = "Arka", Checked = true, AutoSize = true, Margin = new Padding(3, 3, 12, 3) };
            foreach (var cb in new[] { _ustKutusu, _altKutusu, _solKutusu, _sagKutusu, _onKutusu, _arkaKutusu }) yuzlerPanel.Controls.Add(cb);
            Satir("Dahil Edilecek Yüzler\n(örn. çekmece kutusunda Üst kapalı olmayabilir)", yuzlerPanel, 40);

            var klasorSarmalayici = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight, Margin = new Padding(0) };
            _klasorKutusu = new TextBox { Width = 320 };
            var gozatBtn = new Button { Text = "Gözat…", AutoSize = true };
            gozatBtn.Click += (s, e) =>
            {
                using (var dlg = new FolderBrowserDialog { Description = "Panel/montaj dosyalarının kaydedileceği klasör" })
                {
                    if (dlg.ShowDialog() == DialogResult.OK) _klasorKutusu.Text = dlg.SelectedPath;
                }
            };
            klasorSarmalayici.Controls.Add(_klasorKutusu);
            klasorSarmalayici.Controls.Add(gozatBtn);
            Satir("Çıkış Klasörü", klasorSarmalayici);

            _durumEtiketi = new Label { AutoSize = false, Height = 60, ForeColor = Color.DarkSlateGray, Text = "" };
            ana.Controls.Add(new Label());
            ana.Controls.Add(_durumEtiketi);
            ana.RowCount++; ana.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));

            var altPanel = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(10) };
            var vazgecBtn = new Button { Text = "Kapat", DialogResult = DialogResult.Cancel, AutoSize = true };
            var olusturBtn = new Button { Text = "✓ Oluştur", AutoSize = true, Font = new Font(Font, FontStyle.Bold) };
            olusturBtn.Click += OlusturBtn_Click;
            altPanel.Controls.Add(vazgecBtn);
            altPanel.Controls.Add(olusturBtn);

            Controls.Add(ana);
            Controls.Add(altPanel);
            AcceptButton = olusturBtn;
            CancelButton = vazgecBtn;
        }

        private void OlusturBtn_Click(object sender, EventArgs e)
        {
            string kod = _kodKutusu.Text.Trim();
            if (string.IsNullOrEmpty(kod)) { MessageBox.Show("Kod zorunlu.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            string klasor = _klasorKutusu.Text.Trim();
            if (string.IsNullOrEmpty(klasor)) { MessageBox.Show("Çıkış klasörü zorunlu.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }

            double Cift(TextBox t) => double.TryParse(t.Text, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double v) ? v : 0;
            var p = new AltiYuzKutuParametreleri
            {
                Kod = kod,
                Ad = _adKutusu.Text.Trim(),
                GenislikMm = Cift(_genislikKutusu),
                YukseklikMm = Cift(_yukseklikKutusu),
                DerinlikMm = Cift(_derinlikKutusu),
                KalinlikMm = Cift(_kalinlikKutusu)
            };
            p.DahilYuzler.Clear();
            if (_ustKutusu.Checked) p.DahilYuzler.Add("ust");
            if (_altKutusu.Checked) p.DahilYuzler.Add("alt");
            if (_solKutusu.Checked) p.DahilYuzler.Add("sol");
            if (_sagKutusu.Checked) p.DahilYuzler.Add("sag");
            if (_onKutusu.Checked) p.DahilYuzler.Add("on");
            if (_arkaKutusu.Checked) p.DahilYuzler.Add("arka");
            if (p.DahilYuzler.Count == 0) { MessageBox.Show("En az bir yüz seçili olmalı.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }

            // Sürüm/kurulumdan BAĞIMSIZ arama (2017-2025+ aynı derleme) —
            // bkz. UretimOSAddin.SablonYoluBul: SolidWorks'ün KENDİ "Dosya
            // Konumları > Belge Şablonları" ayarı okunur, bulunamazsa
            // SwAddin.cs'teki sabit yola (yedek) düşülür. NOT: dosya adı
            // SwAddin.cs olsa da içindeki sınıfın GERÇEK adı UretimOSAddin'dir
            // (bkz. SwAddin.cs başındaki isimlendirme notu) — gerçek 2025
            // derlemesinde "SwAddin adı geçerli bağlamda yok" (CS0103) hatası
            // BUNU doğruladı.
            string partSablon = UretimOSAddin.SablonYoluBul(_app, "Part.prtdot", UretimOSAddin.PART_SABLON_YOLU);
            string montajSablon = UretimOSAddin.SablonYoluBul(_app, "Assembly.asmdot", UretimOSAddin.ASSEMBLY_SABLON_YOLU);
            if (!File.Exists(partSablon) || !File.Exists(montajSablon))
            {
                MessageBox.Show($"Parça/Montaj şablonu bulunamadı:\n{partSablon}\n{montajSablon}\n\n" +
                    "Bunlar SolidWorks'ün kendi stok şablonlarıdır — normalde 'Sistem Seçenekleri > Dosya " +
                    "Konumları > Belge Şablonları' klasöründe hazır bulunur. Bulunamıyorsa SwAddin.cs'teki " +
                    "PART_SABLON_YOLU/ASSEMBLY_SABLON_YOLU sabitlerini (yedek yol) kontrol edin.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Oluşturuluyor…";
            Application.DoEvents();

            var olusturucu = new AltiYuzKutuOlusturucu(_app);
            string montajYolu = olusturucu.Olustur(p, klasor, partSablon, montajSablon);
            if (montajYolu == null)
            {
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Başarısız: " + string.Join(" ", olusturucu.Uyarilar);
                return;
            }

            _durumEtiketi.ForeColor = Color.DarkGreen;
            _durumEtiketi.Text = "✓ Oluşturuldu: " + montajYolu +
                (olusturucu.Uyarilar.Count > 0 ? "\n⚠ " + string.Join(" ", olusturucu.Uyarilar) : "");
            Tanilama.Kaydet("AltiYuzKutuPaneli: olusturuldu " + montajYolu);
        }
    }
}
