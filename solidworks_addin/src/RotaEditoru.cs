using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json.Linq;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // ROTA EDİTÖRÜ (Hat/Makine/Süre) — kullanıcı isteği: "Son yaptığın rota
    // oluşturma ekranı üretimos.com.tr'ye bağlanıyor, bu ekranı 1 kez
    // indirelim ve sonra burada yeni rotaları oluşturalım ve uretimosa
    // buradan push edelim, hat ve makina galerisini süre ekleme ekranını
    // aynen buraya kopyala, üretimos.com.tr'ye bağlanmaya gerek kalmasın."
    //
    // Bu form, ÜretimOS'un KENDİ page_rota.js:renderEditor() işlevi ile AYNI
    // veri modelini kullanır — TAHMİN/yeniden icat DEĞİL, birebir taşıma:
    //   rota   = { id, kod, ad, tip, steps:[{uid,type,kod,tanim,hat,grup,dk}],
    //              toplamSureDk, toplamMaliyet }
    //   hatlar = { "HAT ADI": [ {kod,tanim,grup}, ... ], ... }  (storage.js'teki
    //              basit "hatlar" anahtarıyla AYNI, id'li kayıt DİZİSİ değil)
    // ve AYNI 3 sütunlu düzeni kullanır: sol = hat/makine seçimi + arama +
    // "yeni istasyon ekle", orta = adım listesi (sıra/süre/maliyet, yukarı/
    // aşağı/düzenle/sil), sağ = hat bazlı maliyet özeti. Tarayıcıya HİÇ
    // geçmeden doğrudan SolidWorks içinde çalışır; "Kaydet" sunucuya PUSH
    // etmeyi ÇAĞIRANA (ReceteAgaciPaneli.RotaSecVeyaOlusturDialogAc) bırakır
    // — bu form yalnızca SonucRota/HatlarDegisti/GuncelHatlar'ı doldurur,
    // ağ çağrısı YAPMAZ (YeniKartDialog ile AYNI "SonucKart" deseni).
    // ════════════════════════════════════════════════════════════════════════
    public class RotaEditoruDialog : Form
    {
        private readonly JObject _hatlarYerel;
        private readonly double _dkUcreti;
        private readonly List<JObject> _adimlar = new List<JObject>();
        private readonly string _mevcutId;
        private readonly string _tip;
        private int _uidSayaci = 1;
        private string _acikHat;

        private TextBox _kodKutu, _adKutu, _aramaKutu;
        private Panel _hatListesiPanel, _adimlarPanel, _ozetPanel;

        public JObject SonucRota { get; private set; }
        public bool HatlarDegisti { get; private set; }
        public JObject GuncelHatlar => _hatlarYerel;

        // mevcutRota: null veya "id" alanı boş bir taslak (kod/ad ön dolu,
        // henüz sunucuda yok) → YENİ rota, Kaydet()'te id BURADA üretilir.
        // "id" DOLU bir rota → MEVCUT rotanın adımları düzenleniyor.
        public RotaEditoruDialog(JObject mevcutRota, JObject hatlar, double dkUcreti)
        {
            _hatlarYerel = (JObject)(hatlar ?? new JObject()).DeepClone();
            _dkUcreti = dkUcreti;
            _mevcutId = (string)mevcutRota?["id"];
            _tip = (string)mevcutRota?["tip"] ?? "urun";
            if (mevcutRota?["steps"] is JArray mevcutAdimlar)
            {
                foreach (var s in mevcutAdimlar.OfType<JObject>())
                    _adimlar.Add((JObject)s.DeepClone());
                _uidSayaci = _adimlar.Count == 0 ? 1 : _adimlar.Max(s => (int?)s["uid"] ?? 0) + 1;
            }
            KurulumYap(mevcutRota);
        }

        private void KurulumYap(JObject mevcutRota)
        {
            Text = (string.IsNullOrEmpty(_mevcutId) ? "Yeni Rota" : "Rota Düzenle") + " — Hat/Makine/Süre (Yerel, ÜretimOS'a Kaydedilir)";
            Width = 1180;
            Height = 780;
            StartPosition = FormStartPosition.CenterParent;
            MinimizeBox = false;
            MaximizeBox = true;
            FormBorderStyle = FormBorderStyle.Sizable;
            Font = new Font(Control.DefaultFont.FontFamily, 9f);

            // ── ÜST: rota kodu/adı ──────────────────────────────────────────
            var ustPanel = new Panel { Dock = DockStyle.Top, Height = 64, Padding = new Padding(12) };
            var kodEtiket = new Label { Text = "Rota Kodu:", AutoSize = true, Location = new Point(12, 12) };
            _kodKutu = new TextBox { Text = (string)mevcutRota?["kod"] ?? "", Location = new Point(100, 9), Width = 240 };
            var adEtiket = new Label { Text = "Rota Adı:", AutoSize = true, Location = new Point(360, 12) };
            _adKutu = new TextBox { Text = (string)mevcutRota?["ad"] ?? "", Location = new Point(440, 9), Width = 420 };
            ustPanel.Controls.Add(kodEtiket);
            ustPanel.Controls.Add(_kodKutu);
            ustPanel.Controls.Add(adEtiket);
            ustPanel.Controls.Add(_adKutu);

            // ── ALT: kaydet/vazgeç ──────────────────────────────────────────
            var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 48, Padding = new Padding(8) };
            var kaydetBtn = new Button { Text = "✓ Rotayı ÜretimOS'a Kaydet", Dock = DockStyle.Right, Width = 220, Height = 34, Font = new Font(Font, FontStyle.Bold) };
            var vazgecBtn = new Button { Text = "Vazgeç", Dock = DockStyle.Right, Width = 100, Height = 34 };
            kaydetBtn.Click += (s, e) => Kaydet();
            vazgecBtn.Click += (s, e) => DialogResult = DialogResult.Cancel;
            CancelButton = vazgecBtn;
            altPanel.Controls.Add(kaydetBtn);
            altPanel.Controls.Add(vazgecBtn);

            // ── ORTA: 3 sütun (sol hat/makine, orta adımlar, sağ özet) ──────
            var anaGrid = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Padding = new Padding(8) };
            anaGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300));
            anaGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58));
            anaGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
            anaGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            var solPanel = new Panel { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 8, 0), BorderStyle = BorderStyle.FixedSingle };
            _hatListesiPanel = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
            var tasimaEkleBtn = new Button { Text = "Ara Taşıma Adımı Ekle", Dock = DockStyle.Top, Height = 30, BackColor = Color.LemonChiffon };
            tasimaEkleBtn.Click += (s, e) => AraTasimaEkle();
            var solUst = new Panel { Dock = DockStyle.Top, Height = 100, Padding = new Padding(8) };
            var solBaslik = new Label { Text = "Hat / Makine Seç", Dock = DockStyle.Top, Height = 20, Font = new Font(Font, FontStyle.Bold) };
            _aramaKutu = new TextBox { Dock = DockStyle.Top, Margin = new Padding(0, 4, 0, 4) };
            _aramaKutu.TextChanged += (s, e) => HatListesiniDoldur(_aramaKutu.Text);
            var yeniIstasyonBtn = new Button { Text = "+ Yeni İstasyon / Hat Ekle", Dock = DockStyle.Top, Height = 26 };
            yeniIstasyonBtn.Click += (s, e) => YeniIstasyonFormuAc();
            // Dock=Top: SON eklenen kontrol en ÜSTTE görünür (proje genelinde
            // kullanılan reverse-order kuralı, bkz. ReceteAgaciPaneli.cs).
            solUst.Controls.Add(yeniIstasyonBtn);
            solUst.Controls.Add(_aramaKutu);
            solUst.Controls.Add(solBaslik);
            solPanel.Controls.Add(_hatListesiPanel);
            solPanel.Controls.Add(tasimaEkleBtn);
            solPanel.Controls.Add(solUst);

            var ortaPanel = new Panel { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 8, 0), BorderStyle = BorderStyle.FixedSingle, AutoScroll = true };
            _adimlarPanel = ortaPanel;

            var sagPanel = new Panel { Dock = DockStyle.Fill, BorderStyle = BorderStyle.FixedSingle, AutoScroll = true, Padding = new Padding(10) };
            _ozetPanel = sagPanel;

            anaGrid.Controls.Add(solPanel, 0, 0);
            anaGrid.Controls.Add(ortaPanel, 1, 0);
            anaGrid.Controls.Add(sagPanel, 2, 0);

            Controls.Add(anaGrid);
            Controls.Add(altPanel);
            Controls.Add(ustPanel);

            HatListesiniDoldur(null);
            AdimlariCiz();
            OzetiCiz();
        }

        // ── SOL: HAT/MAKİNE LİSTESİ ──────────────────────────────────────────
        private void HatListesiniDoldur(string filtre)
        {
            _hatListesiPanel.Controls.Clear();
            string f = (filtre ?? "").Trim().ToLowerInvariant();
            // Doğal (yukarıdan aşağı) görünüm sırası önce düz bir listede
            // toplanır, sonra Dock=Top'ın "son eklenen en üstte" kuralına
            // göre TERS sırada Controls'e eklenir.
            var sirali = new List<Control>();
            foreach (var prop in _hatlarYerel.Properties())
            {
                string hat = prop.Name;
                var makineler = (prop.Value as JArray)?.OfType<JObject>().ToList() ?? new List<JObject>();
                var gorunur = string.IsNullOrEmpty(f) ? makineler
                    : makineler.Where(m => ((string)m["kod"] ?? "").ToLowerInvariant().Contains(f)
                        || ((string)m["tanim"] ?? "").ToLowerInvariant().Contains(f)
                        || hat.ToLowerInvariant().Contains(f)).ToList();
                if (!string.IsNullOrEmpty(f) && gorunur.Count == 0) continue;

                sirali.Add(HatBasligiSatiriOlustur(hat, makineler.Count));
                if (_acikHat == hat || !string.IsNullOrEmpty(f))
                {
                    foreach (var g in gorunur.GroupBy(m => (string)m["grup"] ?? "GENEL"))
                    {
                        sirali.Add(GrupEtiketiSatiriOlustur(g.Key));
                        foreach (var m in g) sirali.Add(MakineSatiriOlustur(hat, m));
                    }
                }
            }
            for (int i = sirali.Count - 1; i >= 0; i--)
                _hatListesiPanel.Controls.Add(sirali[i]);
        }

        private Panel HatBasligiSatiriOlustur(string hat, int sayi)
        {
            var p = new Panel { Dock = DockStyle.Top, Height = 28, Cursor = Cursors.Hand, BackColor = _acikHat == hat ? Color.FromArgb(219, 234, 254) : Color.WhiteSmoke };
            var lbl = new Label { Text = hat + "   (" + sayi + ")", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(8, 0, 0, 0), Font = new Font(Font, FontStyle.Bold), Cursor = Cursors.Hand };
            void Tikla(object s, EventArgs e) { _acikHat = _acikHat == hat ? null : hat; HatListesiniDoldur(_aramaKutu.Text); }
            p.Click += Tikla;
            lbl.Click += Tikla;
            p.Controls.Add(lbl);
            return p;
        }

        private Panel GrupEtiketiSatiriOlustur(string grup)
        {
            var p = new Panel { Dock = DockStyle.Top, Height = 18 };
            p.Controls.Add(new Label { Text = grup, Dock = DockStyle.Fill, ForeColor = Color.Gray, Font = new Font(Font.FontFamily, 7.5f, FontStyle.Bold), Padding = new Padding(20, 3, 0, 0) });
            return p;
        }

        private Panel MakineSatiriOlustur(string hat, JObject makine)
        {
            var p = new Panel { Dock = DockStyle.Top, Height = 40, Cursor = Cursors.Hand, Padding = new Padding(20, 2, 6, 0), BackColor = Color.White };
            var kodLbl = new Label { Text = (string)makine["kod"], Dock = DockStyle.Top, Height = 16, ForeColor = Color.DarkSlateGray, Font = new Font(Font.FontFamily, 7.5f, FontStyle.Bold), Cursor = Cursors.Hand };
            var tanimLbl = new Label { Text = (string)makine["tanim"], Dock = DockStyle.Top, Height = 18, AutoEllipsis = true, Cursor = Cursors.Hand };
            p.Controls.Add(tanimLbl);
            p.Controls.Add(kodLbl);
            void Tikla(object s, EventArgs e) => SureSor(new JObject { ["type"] = "machine", ["kod"] = (string)makine["kod"], ["tanim"] = (string)makine["tanim"], ["hat"] = hat, ["grup"] = (string)makine["grup"] });
            p.Click += Tikla; kodLbl.Click += Tikla; tanimLbl.Click += Tikla;
            p.MouseEnter += (s, e) => p.BackColor = Color.AliceBlue;
            p.MouseLeave += (s, e) => p.BackColor = Color.White;
            return p;
        }

        private void YeniIstasyonFormuAc()
        {
            using (var f = new Form { Text = "Yeni İstasyon / Hat Ekle", Width = 460, Height = 340, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
                var hatEtiket = new Label { Text = "Hat Seç (veya yeni hat adı yazın):", Dock = DockStyle.Top, Height = 20 };
                var hatKutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDown, Margin = new Padding(0, 0, 0, 10) };
                hatKutu.Items.AddRange(_hatlarYerel.Properties().Select(p => p.Name).Cast<object>().ToArray());
                var kodEtiket = new Label { Text = "Makina/İstasyon Kodu:", Dock = DockStyle.Top, Height = 20 };
                var kodKutu = new TextBox { Dock = DockStyle.Top, Margin = new Padding(0, 0, 0, 10) };
                var grupEtiket = new Label { Text = "Grup:", Dock = DockStyle.Top, Height = 20 };
                var grupKutu = new TextBox { Dock = DockStyle.Top, Text = "GENEL", Margin = new Padding(0, 0, 0, 10) };
                var tanimEtiket = new Label { Text = "Tanım / Açıklama:", Dock = DockStyle.Top, Height = 20 };
                var tanimKutu = new TextBox { Dock = DockStyle.Top, Margin = new Padding(0, 0, 0, 10) };

                var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 40 };
                var ekleBtn = new Button { Text = "İstasyonu Ekle", Dock = DockStyle.Right, Width = 130 };
                var vazgecBtn = new Button { Text = "Vazgeç", Dock = DockStyle.Right, Width = 90 };
                altPanel.Controls.Add(ekleBtn);
                altPanel.Controls.Add(vazgecBtn);
                f.CancelButton = vazgecBtn;
                vazgecBtn.Click += (s, e) => f.DialogResult = DialogResult.Cancel;
                ekleBtn.Click += (s, e) =>
                {
                    string hat = hatKutu.Text.Trim(), kod = kodKutu.Text.Trim(), tanim = tanimKutu.Text.Trim();
                    string grup = string.IsNullOrWhiteSpace(grupKutu.Text) ? "GENEL" : grupKutu.Text.Trim();
                    if (string.IsNullOrEmpty(hat) || string.IsNullOrEmpty(kod) || string.IsNullOrEmpty(tanim))
                    {
                        MessageBox.Show("Hat, kod ve tanım zorunlu.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    if (!(_hatlarYerel[hat] is JArray makineler))
                    {
                        makineler = new JArray();
                        _hatlarYerel[hat] = makineler;
                    }
                    if (makineler.OfType<JObject>().Any(m => (string)m["kod"] == kod))
                    {
                        MessageBox.Show("Bu kod zaten bu hatta tanımlı.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    makineler.Add(new JObject { ["kod"] = kod, ["tanim"] = tanim, ["grup"] = grup });
                    HatlarDegisti = true;
                    _acikHat = hat;
                    f.DialogResult = DialogResult.OK;
                };

                panel.Controls.Add(tanimKutu); panel.Controls.Add(tanimEtiket);
                panel.Controls.Add(grupKutu); panel.Controls.Add(grupEtiket);
                panel.Controls.Add(kodKutu); panel.Controls.Add(kodEtiket);
                panel.Controls.Add(hatKutu); panel.Controls.Add(hatEtiket);
                f.Controls.Add(panel);
                f.Controls.Add(altPanel);
                if (f.ShowDialog(this) == DialogResult.OK)
                    HatListesiniDoldur(_aramaKutu.Text);
            }
        }

        // ── SÜRE GİRİŞİ (adım ekleme/düzenleme) ─────────────────────────────
        private void AraTasimaEkle()
        {
            int n = _adimlar.Count(a => (string)a["type"] == "transport") + 1;
            SureSor(new JObject { ["type"] = "transport", ["kod"] = "TAS." + n.ToString("00"), ["tanim"] = "Ara Taşıma-" + n, ["hat"] = "TAŞIMA", ["grup"] = "TAŞIMA" });
        }

        private static double ParseCift(string s) => double.TryParse((s ?? "").Trim().Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out double v) ? v : 0;

        private void SureSor(JObject adimTaslak)
        {
            bool tamamlandi = false;
            using (var f = new Form { Text = "Adım " + (_adimlar.Count + 1) + " — Süre Girişi", Width = 380, Height = 240, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
                var onizleme = new Label { Text = "0 dakika girildi", Dock = DockStyle.Top, Height = 24, ForeColor = Color.Gray };
                var sureKutu = new TextBox { Dock = DockStyle.Top, Text = "0" };
                var sureEtiket = new Label { Text = "Süre (dakika):", Dock = DockStyle.Top, Height = 22, Padding = new Padding(0, 8, 0, 0) };
                var baslikLbl = new Label { Text = (string)adimTaslak["kod"] + "\n" + (string)adimTaslak["tanim"], Dock = DockStyle.Top, Height = 50, Font = new Font(Font, FontStyle.Bold) };
                void Guncelle()
                {
                    double dk = ParseCift(sureKutu.Text);
                    onizleme.Text = dk > 0 ? $"{dk} dk = {(dk / 60):0.000} saat → ₺{(dk * _dkUcreti):0.00} maliyet" : "0 dakika girildi";
                }
                sureKutu.TextChanged += (s, e) => Guncelle();

                var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 40 };
                var eklemBtn = new Button { Text = "Ekle", Dock = DockStyle.Right, Width = 90 };
                var vazgecBtn = new Button { Text = "Vazgeç", Dock = DockStyle.Right, Width = 90 };
                altPanel.Controls.Add(eklemBtn);
                altPanel.Controls.Add(vazgecBtn);
                f.CancelButton = vazgecBtn;
                vazgecBtn.Click += (s, e) => f.DialogResult = DialogResult.Cancel;
                eklemBtn.Click += (s, e) =>
                {
                    adimTaslak["uid"] = _uidSayaci++;
                    adimTaslak["dk"] = ParseCift(sureKutu.Text);
                    _adimlar.Add(adimTaslak);
                    tamamlandi = true;
                    f.DialogResult = DialogResult.OK;
                };

                panel.Controls.Add(onizleme);
                panel.Controls.Add(sureKutu);
                panel.Controls.Add(sureEtiket);
                panel.Controls.Add(baslikLbl);
                f.Controls.Add(panel);
                f.Controls.Add(altPanel);
                Guncelle();
                f.ShowDialog(this);
            }
            if (tamamlandi) { AdimlariCiz(); OzetiCiz(); }
        }

        // ── ORTA: ADIM LİSTESİ ───────────────────────────────────────────────
        private void AdimlariCiz()
        {
            _adimlarPanel.Controls.Clear();
            if (_adimlar.Count == 0)
            {
                _adimlarPanel.Controls.Add(new Label { Text = "Rota boş — soldan bir hat/makine seçerek adım ekleyin.", Dock = DockStyle.Top, Height = 40, Padding = new Padding(12), ForeColor = Color.Gray });
                return;
            }

            var baslik = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 50, FlowDirection = FlowDirection.LeftToRight, WrapContents = true, Padding = new Padding(10) };
            for (int i = 0; i < _adimlar.Count; i++)
            {
                var s = _adimlar[i];
                bool tasima = (string)s["type"] == "transport";
                baslik.Controls.Add(new Label
                {
                    Text = (i + 1) + (tasima ? " [T] " : " ") + (string)s["kod"],
                    AutoSize = true,
                    Padding = new Padding(6, 3, 6, 3),
                    Margin = new Padding(2),
                    BackColor = tasima ? Color.Moccasin : Color.LightSteelBlue,
                    BorderStyle = BorderStyle.FixedSingle
                });
            }

            var satirlar = new List<Control>();
            for (int i = 0; i < _adimlar.Count; i++) satirlar.Add(AdimSatiriOlustur(_adimlar[i], i));
            for (int i = satirlar.Count - 1; i >= 0; i--) _adimlarPanel.Controls.Add(satirlar[i]);
            _adimlarPanel.Controls.Add(baslik);
        }

        private Panel AdimSatiriOlustur(JObject s, int index)
        {
            bool tasima = (string)s["type"] == "transport";
            double dk = (double?)s["dk"] ?? 0;
            double mal = dk * _dkUcreti;
            var p = new Panel { Dock = DockStyle.Top, Height = 70, Padding = new Padding(10, 6, 10, 6), Margin = new Padding(0, 0, 0, 4), BackColor = tasima ? Color.FromArgb(255, 251, 235) : Color.White, BorderStyle = BorderStyle.FixedSingle };

            var btnPanel = new FlowLayoutPanel { Dock = DockStyle.Right, Width = 160, FlowDirection = FlowDirection.LeftToRight };
            var yukariBtn = new Button { Text = "↑", Width = 32, Height = 26 };
            var asagiBtn = new Button { Text = "↓", Width = 32, Height = 26 };
            var duzenleBtn = new Button { Text = "✎", Width = 32, Height = 26 };
            var silBtn = new Button { Text = "✕", Width = 32, Height = 26, ForeColor = Color.DarkRed };
            yukariBtn.Click += (s2, e2) => AdimTasi(index, -1);
            asagiBtn.Click += (s2, e2) => AdimTasi(index, 1);
            duzenleBtn.Click += (s2, e2) => AdimSuresiDuzenle(index);
            silBtn.Click += (s2, e2) => { _adimlar.RemoveAt(index); AdimlariCiz(); OzetiCiz(); };
            btnPanel.Controls.Add(yukariBtn);
            btnPanel.Controls.Add(asagiBtn);
            btnPanel.Controls.Add(duzenleBtn);
            btnPanel.Controls.Add(silBtn);

            var ustSatir = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 24, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
            ustSatir.Controls.Add(new Label { Text = (index + 1).ToString(), AutoSize = true, Font = new Font(Font, FontStyle.Bold), Padding = new Padding(0, 3, 10, 0) });
            ustSatir.Controls.Add(new Label { Text = (tasima ? "[Taşıma] " : "") + (string)s["kod"], AutoSize = true, Font = new Font(Font, FontStyle.Bold), Padding = new Padding(0, 3, 10, 0) });
            ustSatir.Controls.Add(new Label { Text = (string)s["tanim"], AutoSize = true, ForeColor = Color.DimGray, Padding = new Padding(0, 3, 10, 0) });
            ustSatir.Controls.Add(new Label { Text = (string)s["hat"], AutoSize = true, BackColor = tasima ? Color.Moccasin : Color.LightSteelBlue, Padding = new Padding(4, 2, 4, 2) });

            var altSatir = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 22, FlowDirection = FlowDirection.LeftToRight };
            altSatir.Controls.Add(new Label { Text = $"Süre: {dk} dk ({(dk / 60):0.000} sa)", AutoSize = true, Padding = new Padding(0, 2, 16, 0), ForeColor = Color.DimGray });
            altSatir.Controls.Add(new Label { Text = $"Maliyet: ₺{mal:0.00}", AutoSize = true, ForeColor = Color.DarkGreen });

            p.Controls.Add(altSatir);
            p.Controls.Add(ustSatir);
            p.Controls.Add(btnPanel);
            return p;
        }

        private void AdimTasi(int index, int yon)
        {
            int hedef = index + yon;
            if (hedef < 0 || hedef >= _adimlar.Count) return;
            var gecici = _adimlar[index];
            _adimlar[index] = _adimlar[hedef];
            _adimlar[hedef] = gecici;
            AdimlariCiz();
            OzetiCiz();
        }

        private void AdimSuresiDuzenle(int index)
        {
            var s = _adimlar[index];
            bool tamamlandi = false;
            using (var f = new Form { Text = "Süre Düzenle", Width = 340, Height = 190, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
                var kutu = new TextBox { Dock = DockStyle.Top, Text = ((double?)s["dk"] ?? 0).ToString(CultureInfo.InvariantCulture) };
                var baslik = new Label { Text = (string)s["kod"] + " — " + (string)s["tanim"], Dock = DockStyle.Top, Height = 44, Font = new Font(Font, FontStyle.Bold) };
                var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 40 };
                var tamamBtn = new Button { Text = "Güncelle", Dock = DockStyle.Right, Width = 90 };
                var iptalBtn = new Button { Text = "Vazgeç", Dock = DockStyle.Right, Width = 90 };
                altPanel.Controls.Add(tamamBtn);
                altPanel.Controls.Add(iptalBtn);
                f.CancelButton = iptalBtn;
                iptalBtn.Click += (s2, e2) => f.DialogResult = DialogResult.Cancel;
                tamamBtn.Click += (s2, e2) => { s["dk"] = ParseCift(kutu.Text); tamamlandi = true; f.DialogResult = DialogResult.OK; };
                panel.Controls.Add(kutu);
                panel.Controls.Add(baslik);
                f.Controls.Add(panel);
                f.Controls.Add(altPanel);
                f.ShowDialog(this);
            }
            if (tamamlandi) { AdimlariCiz(); OzetiCiz(); }
        }

        // ── SAĞ: MALİYET ÖZETİ ───────────────────────────────────────────────
        private void OzetiCiz()
        {
            _ozetPanel.Controls.Clear();
            if (_adimlar.Count == 0)
            {
                _ozetPanel.Controls.Add(new Label { Text = "Adım eklenince maliyet özeti burada görünür.", Dock = DockStyle.Top, Height = 60, ForeColor = Color.Gray });
                return;
            }
            double toplamDk = _adimlar.Sum(a => (double?)a["dk"] ?? 0);
            double toplamMal = toplamDk * _dkUcreti;

            var hatSirasi = new List<string>();
            var hatMap = new Dictionary<string, (double dk, int cnt)>();
            foreach (var a in _adimlar)
            {
                string hat = (string)a["hat"];
                if (!hatMap.ContainsKey(hat)) { hatMap[hat] = (0, 0); hatSirasi.Add(hat); }
                var mevcut = hatMap[hat];
                hatMap[hat] = (mevcut.dk + ((double?)a["dk"] ?? 0), mevcut.cnt + 1);
            }

            var kontroller = new List<Control>();
            kontroller.Add(new Label { Text = "Hat Bazlı Dağılım", Dock = DockStyle.Top, Height = 22, Font = new Font(Font, FontStyle.Bold) });
            foreach (var hat in hatSirasi)
            {
                var (dk, _) = hatMap[hat];
                double mal = dk * _dkUcreti;
                double pct = toplamMal > 0 ? mal / toplamMal * 100 : 0;
                var satirPanel = new Panel { Dock = DockStyle.Top, Height = 46, Padding = new Padding(0, 4, 0, 4) };
                var barDis = new Panel { Dock = DockStyle.Top, Height = 6, BackColor = Color.Gainsboro };
                var barIc = new Panel { Height = 6, Width = Math.Max(2, (int)(pct * 2.2)), BackColor = Color.SteelBlue, Dock = DockStyle.Left };
                barDis.Controls.Add(barIc);
                var altLbl = new Label { Text = $"{dk:0.0} dk · ₺{mal:0.00} · %{pct:0.0}", Dock = DockStyle.Top, Height = 16, ForeColor = Color.Gray, Font = new Font(Font.FontFamily, 7.5f) };
                var ustLbl = new Label { Text = hat, Dock = DockStyle.Top, Height = 16, Font = new Font(Font.FontFamily, 8f) };
                satirPanel.Controls.Add(altLbl);
                satirPanel.Controls.Add(barDis);
                satirPanel.Controls.Add(ustLbl);
                kontroller.Add(satirPanel);
            }

            var ustBaslikPanel = new Panel { Dock = DockStyle.Top, Height = 74, BackColor = Color.FromArgb(219, 234, 254), Padding = new Padding(10), Margin = new Padding(0, 0, 0, 10) };
            var t1 = new Label { Text = "Toplam İşçilik Maliyeti", Dock = DockStyle.Top, Height = 16, ForeColor = Color.FromArgb(30, 64, 175), Font = new Font(Font.FontFamily, 7.5f) };
            var t2 = new Label { Text = $"₺{toplamMal:0.00}", Dock = DockStyle.Top, Height = 30, ForeColor = Color.FromArgb(30, 64, 175), Font = new Font(Font.FontFamily, 15f, FontStyle.Bold) };
            var t3 = new Label { Text = $"{toplamDk:0.0} dk · {(toplamDk / 60):0.000} sa · {_adimlar.Count} adım", Dock = DockStyle.Top, Height = 16, ForeColor = Color.FromArgb(30, 64, 175), Font = new Font(Font.FontFamily, 7.5f) };
            ustBaslikPanel.Controls.Add(t3);
            ustBaslikPanel.Controls.Add(t2);
            ustBaslikPanel.Controls.Add(t1);

            for (int i = kontroller.Count - 1; i >= 0; i--) _ozetPanel.Controls.Add(kontroller[i]);
            _ozetPanel.Controls.Add(ustBaslikPanel);
        }

        // ── KAYDET (yalnızca yerel sonucu doldurur — ağ çağrısı ÇAĞIRANDA) ──
        private void Kaydet()
        {
            string kod = _kodKutu.Text.Trim(), ad = _adKutu.Text.Trim();
            if (string.IsNullOrEmpty(kod) || string.IsNullOrEmpty(ad))
            {
                MessageBox.Show("Rota kodu ve adı zorunlu.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            double toplamDk = _adimlar.Sum(a => (double?)a["dk"] ?? 0);
            double toplamMal = toplamDk * _dkUcreti;
            SonucRota = new JObject
            {
                ["id"] = string.IsNullOrEmpty(_mevcutId) ? "RT-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant() : _mevcutId,
                ["kod"] = kod,
                ["ad"] = ad,
                ["tip"] = _tip,
                ["steps"] = new JArray(_adimlar),
                ["toplamSureDk"] = toplamDk,
                ["toplamMaliyet"] = toplamMal
            };
            DialogResult = DialogResult.OK;
        }
    }
}
