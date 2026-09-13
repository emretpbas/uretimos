using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json.Linq;
using SolidWorks.Interop.sldworks;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // KUTU → FRAME YERLEŞTİRME PANELİ — kullanıcı isteği: "Frame dosyasında
    // oluşturduğumuz gövde içerisine ... bir box atalım ... hırdavatların
    // bağlantı deliklerini ... atıldığı yüzeyi delecek şekilde ... frame'in
    // içine atıldığında panelde delik ve kanal oluştursun".
    //
    // AKIŞ: (1) Kullanıcı Frame montajında, box'ı YERLEŞTİRECEĞİ PANEL
    // bileşenini FeatureManager'da SEÇER (örn. Frame'in "alt" paneli), (2) bu
    // komutu çalıştırır, (3) box şablon dosyasını + konumu girer, (4) panel:
    //   a) KutuYerlestirmeYoneticisi ile box'ı ÖZERK (PackAndGo, yeni adlarla)
    //      kopyalar ve Frame montajına ekler,
    //   b) box'ın temas eden panelini (aynı yüz adına sahip alt bileşeni)
    //      bulup HIRDAVAT_LISTESI'ndeki hırdavatların delik şablonlarını
    //      ÜretimOS'tan çekip o panelde CutExtrude ile deler,
    //   c) AYNI delikleri (yalnızca box'ın Frame'deki konum ofseti kadar
    //      kaydırarak — bkz. HirdavatDelikUygulayici.cs tasarım notu) 1.
    //      adımda SEÇİLEN Frame paneline de açar.
    //
    // "Temas yüzü" AYRICA SORULMAZ: seçilen Frame panelinin KENDİ KOD'undan
    // (AltiYuzKutuOlusturucu'nun ürettiği "..._ALT"/"..._UST" gibi bir sonek)
    // otomatik okunur — box'ın AYNI isimli paneli temas eden panel SAYILIR
    // (yalnızca AltiYuzKutuOlusturucu ile üretilmiş box/frame çiftleri için
    // GEÇERLİ bir varsayım, bkz. dosya başı ve HirdavatDelikUygulayici.cs).
    // ════════════════════════════════════════════════════════════════════════
    public class KutuFrameYerlestirPaneli : Form
    {
        private readonly ISldWorks _app;
        private readonly ModelDoc2 _frameMontajBelge;   // aktif Frame montaj belgesi
        private readonly ModelDoc2 _secilenFramePaneli; // kullanıcının önceden seçtiği panel

        private TextBox _sablonYoluKutusu;
        private TextBox _xKutusu, _yKutusu, _zKutusu;
        private CheckBox _deliklerAcKutusu;
        private Label _hedefPanelEtiketi, _durumEtiketi;

        public KutuFrameYerlestirPaneli(ISldWorks app, ModelDoc2 frameMontajBelge, ModelDoc2 secilenFramePaneli)
        {
            _app = app;
            _frameMontajBelge = frameMontajBelge;
            _secilenFramePaneli = secilenFramePaneli;
            KurulumYap();
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — Kutuyu Frame'e Yerleştir";
            Width = 560; Height = 420;
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

            string kodOku = KesimListesiCikarici.OzelAlanOku(_secilenFramePaneli, OzelAlanlar.KOD) ?? "";
            string temasYuzu = TemasYuzunuKoddanCikar(kodOku);
            _hedefPanelEtiketi = new Label
            {
                AutoSize = false, Height = 50, ForeColor = Color.DarkSlateGray,
                Text = temasYuzu != null
                    ? $"Hedef Frame paneli: {kodOku} (yüz: {temasYuzu}) — box'ın AYNI yüzü temas eden panel sayılacak."
                    : $"UYARI: seçili panelin ('{kodOku}') yüzü KOD'undan anlaşılamadı (_UST/_ALT/_SOL/_SAG/_ON/_ARKA soneki yok) — " +
                      "bu panel AltiYuzKutuOlusturucu ile üretilmemiş olabilir, delik aktarımı YAPILAMAZ."
            };
            ana.Controls.Add(new Label());
            ana.Controls.Add(_hedefPanelEtiketi);
            ana.RowCount++; ana.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));

            var sablomSarmalayici = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.LeftToRight, Margin = new Padding(0) };
            _sablonYoluKutusu = new TextBox { Width = 320 };
            var gozatBtn = new Button { Text = "Gözat…", AutoSize = true };
            gozatBtn.Click += (s, e) =>
            {
                using (var dlg = new OpenFileDialog { Filter = "SolidWorks Montaj (*.sldasm)|*.sldasm", Title = "Box Şablon Montaj Dosyası Seç" })
                {
                    if (dlg.ShowDialog() == DialogResult.OK) _sablonYoluKutusu.Text = dlg.FileName;
                }
            };
            sablomSarmalayici.Controls.Add(_sablonYoluKutusu);
            sablomSarmalayici.Controls.Add(gozatBtn);
            Satir("Box Şablon Dosyası (.SLDASM)", sablomSarmalayici);

            _xKutusu = new TextBox(); Satir("Konum X (mm)", _xKutusu);
            _yKutusu = new TextBox(); Satir("Konum Y (mm)", _yKutusu);
            _zKutusu = new TextBox(); Satir("Konum Z (mm)", _zKutusu);

            _deliklerAcKutusu = new CheckBox { Text = "Hırdavat bağlantı deliklerini de aç (box + hedef panel)", Checked = true };
            Satir("", _deliklerAcKutusu);

            _durumEtiketi = new Label { AutoSize = false, Height = 60, ForeColor = Color.DarkSlateGray, Text = "" };
            ana.Controls.Add(new Label());
            ana.Controls.Add(_durumEtiketi);
            ana.RowCount++; ana.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));

            var altPanel = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(10) };
            var vazgecBtn = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, AutoSize = true };
            var yerlestirBtn = new Button { Text = "✓ Yerleştir", AutoSize = true, Font = new Font(Font, FontStyle.Bold) };
            yerlestirBtn.Click += YerlestirBtn_Click;
            altPanel.Controls.Add(vazgecBtn);
            altPanel.Controls.Add(yerlestirBtn);

            Controls.Add(ana);
            Controls.Add(altPanel);
            AcceptButton = yerlestirBtn;
            CancelButton = vazgecBtn;
        }

        // AltiYuzKutuOlusturucu, panel kodlarını "<Kod>_UST" / "..._ALT" / vb.
        // biçiminde üretir (bkz. o dosyadaki PanelOlustur) — burada AYNI son
        // eki tersten okuyoruz.
        private static string TemasYuzunuKoddanCikar(string kod)
        {
            if (string.IsNullOrEmpty(kod)) return null;
            string[] yuzler = { "UST", "ALT", "SOL", "SAG", "ON", "ARKA" };
            foreach (var y in yuzler)
            {
                if (kod.EndsWith("_" + y, StringComparison.OrdinalIgnoreCase)) return y.ToLowerInvariant();
            }
            return null;
        }

        private async void YerlestirBtn_Click(object sender, EventArgs e)
        {
            string sablonYolu = _sablonYoluKutusu.Text.Trim();
            if (string.IsNullOrEmpty(sablonYolu) || !File.Exists(sablonYolu))
            {
                MessageBox.Show("Geçerli bir box şablon dosyası (.SLDASM) seçin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            double.TryParse(_xKutusu.Text, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double xMm);
            double.TryParse(_yKutusu.Text, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double yMm);
            double.TryParse(_zKutusu.Text, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double zMm);

            string frameKod = KesimListesiCikarici.OzelAlanOku(_frameMontajBelge, OzelAlanlar.KOD) ?? "FRAME";
            string temasYuzu = TemasYuzunuKoddanCikar(KesimListesiCikarici.OzelAlanOku(_secilenFramePaneli, OzelAlanlar.KOD) ?? "");

            var onayMesaji =
                "Bu işlem:\n" +
                "  1) Seçilen box şablonunu YENİ, BAĞIMSIZ dosya adlarıyla kopyalayacak,\n" +
                "  2) Frame montajına bileşen olarak ekleyecek" +
                (_deliklerAcKutusu.Checked ? ",\n  3) Box'ta VE seçili Frame panelinde GERÇEK kesim (CutExtrude) özellikleri oluşturacak." : ".") +
                "\n\nBu adımlar SolidWorks'ün Geri Al (Ctrl+Z) desteğiyle geri alınabilir, ama " +
                "OLUŞAN DELİKLERİ İLK ÇALIŞTIRMADA MUTLAKA ELLE ÖLÇÜP DOĞRULAYIN " +
                "(bu geometri gerçek CNC işlemesine gidebilir). Devam edilsin mi?";
            if (MessageBox.Show(onayMesaji, "ÜretimOS — Onay", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
                return;

            _durumEtiketi.Text = "Kopyalanıyor ve yerleştiriliyor…";
            string cikisKlasoru = Path.GetDirectoryName(_frameMontajBelge.GetPathName());

            List<string> uyarilar;
            var sonuc = KutuYerlestirmeYoneticisi.KutuyuYerlestir(_app, sablonYolu, _frameMontajBelge, frameKod, cikisKlasoru, xMm, yMm, zMm, out uyarilar);
            if (sonuc == null)
            {
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Yerleştirme başarısız: " + string.Join(" ", uyarilar);
                return;
            }

            string ozet = "✓ Box yerleştirildi: " + Path.GetFileName(sonuc.MontajYolu);

            if (_deliklerAcKutusu.Checked)
            {
                if (temasYuzu == null || sonuc.YerlestirilenBilesen == null)
                {
                    ozet += "\n⚠ Delikler AÇILMADI — temas yüzü belirlenemedi veya bileşen eklenemedi.";
                }
                else
                {
                    var delikUyarilari = new List<string>();
                    string sonucDeligi = await DeliklerUygulaAsync(sonuc.YerlestirilenBilesen, temasYuzu, xMm, yMm, zMm, delikUyarilari);
                    ozet += "\n" + sonucDeligi;
                    if (delikUyarilari.Count > 0) ozet += "\n" + string.Join("\n", delikUyarilari);
                }
            }

            _durumEtiketi.ForeColor = Color.DarkGreen;
            _durumEtiketi.Text = ozet;
            Tanilama.Kaydet("KutuFrameYerlestirPaneli: " + ozet.Replace("\n", " | "));
            DialogResult = DialogResult.OK;
        }

        // ÜretimOS'tan hammaddeler çekip box paneli + Frame panelinde delik açar.
        private async System.Threading.Tasks.Task<string> DeliklerUygulaAsync(Component2 kutuBileseni, string temasYuzu, double xMm, double yMm, double zMm, List<string> uyarilar)
        {
            var ayar = BaglantiAyarlari.Yukle();
            if (ayar == null)
            {
                BaglantiAyarlari.OrnekDosyaOlustur();
                return "⚠ Delikler açılamadı — ÜretimOS bağlantı ayarı yok: " + BaglantiAyarlari.DosyaYoluGoster();
            }
            JArray hammaddeler;
            try
            {
                var istemci = new UretimOSApiClient(ayar.SunucuUrl);
                if (!await istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre))
                    return "⚠ Delikler açılamadı — ÜretimOS girişi başarısız.";
                hammaddeler = JArray.Parse(await istemci.Getir("hammaddeler") ?? "[]");
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("KutuFrameYerlestirPaneli.DeliklerUygulaAsync HATA: " + ex);
                return "⚠ Delikler açılamadı — hammaddeler çekilemedi: " + ex.Message;
            }

            // Box'ın temas eden panelini bul: aynı yüz kodunu taşıyan alt bileşen.
            ModelDoc2 kutuPaneli = null;
            object[] cocuklar = (object[])kutuBileseni.GetChildren();
            if (cocuklar != null)
            {
                foreach (Component2 c in cocuklar.Cast<Component2>())
                {
                    var m = (ModelDoc2)c.GetModelDoc2();
                    if (m == null) continue;
                    string k = KesimListesiCikarici.OzelAlanOku(m, OzelAlanlar.KOD) ?? "";
                    if (k.EndsWith("_" + temasYuzu.ToUpperInvariant(), StringComparison.OrdinalIgnoreCase)) { kutuPaneli = m; break; }
                }
            }
            if (kutuPaneli == null) return "⚠ Box'ın '" + temasYuzu + "' paneli bulunamadı — delik açılmadı.";

            string hirdavatListesi = KesimListesiCikarici.OzelAlanOku(kutuPaneli, OzelAlanlar.HIRDAVAT_LISTESI);
            var delikler = HirdavatDelikUygulayici.HirdavatDeliklerTopla(hirdavatListesi, hammaddeler, uyarilar);
            if (delikler.Count == 0) return "(box panelinde delik şablonlu hırdavat yok — delik açılmadı)";

            string hataBox, hataFrame;
            bool boxBasarili = HirdavatDelikUygulayici.DeliklerAc(kutuPaneli, temasYuzu, delikler, out hataBox);
            if (!boxBasarili) uyarilar.Add("Box panelinde delik açılamadı: " + hataBox);

            // Frame panelindeki delikler: box'ın Frame içindeki (temas
            // düzlemine dik OLMAYAN iki eksendeki) konum ofseti kadar kaydırılır
            // — bkz. HirdavatDelikUygulayici.cs dosya başı notu.
            double ofset1, ofset2;
            switch (temasYuzu)
            {
                case "ust": case "alt": ofset1 = xMm; ofset2 = zMm; break;
                case "sol": case "sag": ofset1 = zMm; ofset2 = yMm; break;
                default: ofset1 = xMm; ofset2 = yMm; break; // on, arka
            }
            var kaydirilmisDelikler = delikler.Select(d => (d.x + ofset1, d.y + ofset2, d.cap)).ToList();
            bool frameBasarili = HirdavatDelikUygulayici.DeliklerAc(_secilenFramePaneli, temasYuzu, kaydirilmisDelikler, out hataFrame);
            if (!frameBasarili) uyarilar.Add("Frame panelinde delik açılamadı: " + hataFrame);

            return "✓ " + delikler.Count + " delik: box paneli " + (boxBasarili ? "OK" : "BAŞARISIZ") +
                ", Frame paneli " + (frameBasarili ? "OK" : "BAŞARISIZ");
        }
    }
}
