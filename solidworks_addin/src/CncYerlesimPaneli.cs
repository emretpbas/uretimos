using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // CNC YERLEŞİMİ PANELİ — kullanıcı isteği: "parçaya sağ tıklayıp bir CNC
    // fincan ya da sıfırlama bölümüne yerleştir. Biesse bSolid 5 eksen düz
    // tablalı ve fincanlı bir makina ile işleme yapacağız, sana postprocessor
    // ve makina kodunu atacağım."
    //
    // KAPSAM (BİLEREK SINIRLI): Gerçek postprocessor/G-kodu/XNC üretimi
    // BURADA YAPILMAZ — kullanıcı postprocessor + örnek makine kodu
    // gönderene kadar bu eşleme TAHMİN EDİLMEZ (dürüstlük ilkesi: yanlış bir
    // G-kod eşlemesi gerçek malzeme/takım hasarına yol açabilir, bu boş
    // bırakmaktan çok daha pahalıdır). Bu panel yalnızca parça başına şu
    // KALICI kurulum bilgisini SolidWorks özel özelliklerine yazar:
    //   - hangi fincan/pod grubu bu parçayı tutacak (serbest metin/no),
    //   - sıfır noktası hangi köşe + varsa ek ofset.
    // Postprocessor geldiğinde bu veriler doğrudan kullanılabilir olacak.
    //
    // AYRICA (gerçek sağ-tık DEĞİL): SolidWorks'ün native context-menu API'si
    // (bkz. ICommandGroup context menu bit'leri) bu ortamda resmi
    // dokümantasyona erişim olmadan GÜVENLE doğrulanamadı — bu yüzden
    // EtiketlemePaneli/ReceteAgaciPaneli ile AYNI, KANITLANMIŞ desen
    // kullanıldı: bileşeni FeatureManager'da SEÇİP komut şeridinden bu
    // paneli açmak. Kullanıcı gerçek bir sağ-tık menüsü isterse, Visual
    // Studio'da Object Browser ile doğru context-menu üyesi bulunup tek
    // satırda eklenebilir — şimdilik risksiz, kanıtlanmış yol tercih edildi.
    //
    // DELİK ONAY KAPISI: DelikFormCikarici.cs'in geometriden otomatik
    // çıkardığı delikler burada LİSTELENİR (salt okunur) — kullanıcı
    // SolidWorks'teki gerçek parçayla karşılaştırıp "doğruladım" kutusunu
    // işaretlemeden bu delikler dışa aktarıma (SWOOD ZIP/nesting) DAHİL
    // EDİLMEZ (bkz. OzelAlanlar.DELIKLER_ONAYLANDI, SwoodPaketOlusturucu.cs).
    // ════════════════════════════════════════════════════════════════════════
    public class CncYerlesimPaneli : Form
    {
        private readonly ModelDoc2 _hedefModel;

        private ListBox _delikListesi;
        private CheckBox _deliklerOnaylandiKutusu;
        private TextBox _fincanKutusu;
        private ComboBox _sifirlamaKoseKutusu;
        private TextBox _ofsetXKutusu, _ofsetYKutusu, _ofsetZKutusu;
        private Label _durumEtiketi;

        public CncYerlesimPaneli(ModelDoc2 hedefModel)
        {
            _hedefModel = hedefModel;
            KurulumYap();
            DelikleriTaraVeGoster();
            MevcutDegerleriYukle();
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — CNC Yerleşimi (Biesse bSolid)";
            Width = 560;
            Height = 620;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            var ana = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                Padding = new Padding(14),
                AutoScroll = true
            };
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

            var uyariEtiketi = new Label
            {
                AutoSize = false, Height = 56, ForeColor = Color.DarkSlateGray,
                Text = "Bu panel yalnızca fincan/sıfırlama BİLGİSİNİ saklar — gerçek G-kodu/XNC " +
                       "postprocessor bilgisi gelmeden ÜRETİLMEZ."
            };
            ana.Controls.Add(new Label());
            ana.Controls.Add(uyariEtiketi);
            ana.RowCount++; ana.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));

            _delikListesi = new ListBox { Height = 110 };
            Satir("Tespit Edilen Delikler\n(otomatik, salt okunur)", _delikListesi, 118);

            _deliklerOnaylandiKutusu = new CheckBox
            {
                Text = "Yukarıdaki delikleri SolidWorks'teki parçayla karşılaştırıp doğruladım — dışa aktarıma dahil et"
            };
            Satir("URETIMOS_DELIKLER_ONAYLANDI", _deliklerOnaylandiKutusu);

            _fincanKutusu = new TextBox();
            Satir("URETIMOS_CNC_FINCAN\n(fincan/pod no — örn. F3)", _fincanKutusu);

            _sifirlamaKoseKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _sifirlamaKoseKutusu.Items.AddRange(new object[] { "", "sol_alt", "sag_alt", "sol_ust", "sag_ust", "merkez" });
            Satir("URETIMOS_CNC_SIFIRLAMA_KOSE", _sifirlamaKoseKutusu);

            _ofsetXKutusu = new TextBox();
            Satir("URETIMOS_CNC_SIFIRLAMA_OFSET_X (mm)", _ofsetXKutusu);
            _ofsetYKutusu = new TextBox();
            Satir("URETIMOS_CNC_SIFIRLAMA_OFSET_Y (mm)", _ofsetYKutusu);
            _ofsetZKutusu = new TextBox();
            Satir("URETIMOS_CNC_SIFIRLAMA_OFSET_Z (mm)", _ofsetZKutusu);

            _durumEtiketi = new Label { AutoSize = false, Height = 40, ForeColor = Color.DarkSlateGray, Text = "" };
            ana.Controls.Add(new Label());
            ana.Controls.Add(_durumEtiketi);
            ana.RowCount++; ana.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            var altPanel = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(10) };
            var vazgecBtn = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, AutoSize = true };
            var kaydetBtn = new Button { Text = "✓ Kaydet", AutoSize = true, Font = new Font(Font, FontStyle.Bold) };
            kaydetBtn.Click += KaydetBtn_Click;
            altPanel.Controls.Add(vazgecBtn);
            altPanel.Controls.Add(kaydetBtn);

            Controls.Add(ana);
            Controls.Add(altPanel);
            AcceptButton = kaydetBtn;
            CancelButton = vazgecBtn;
        }

        // Panel her açıldığında GÜNCEL geometriden yeniden tarar — kullanıcı
        // SolidWorks'te delik ekleyip/silip paneli tekrar açabilir, eski
        // (yanlış) liste asla gösterilmez.
        private void DelikleriTaraVeGoster()
        {
            try
            {
                double kalinlik = 0;
                double.TryParse(KesimListesiCikarici.OzelAlanOku(_hedefModel, OzelAlanlar.KALINLIK_MM), out kalinlik);
                var (delikler, _) = DelikFormCikarici.Cikar(_hedefModel, kalinlik);
                _delikListesi.Items.Clear();
                if (delikler.Count == 0)
                {
                    _delikListesi.Items.Add("(delik bulunamadı — veya geometri okunamadı)");
                    _deliklerOnaylandiKutusu.Enabled = false;
                }
                else
                {
                    foreach (var d in delikler)
                    {
                        _delikListesi.Items.Add($"X={d.XMm} mm, Y={d.YMm} mm, Çap={d.CapMm} mm, " +
                            $"Derinlik≈{d.DerinlikMm} mm, TümBoyu={(d.TumBoyu ? "Evet" : "Hayır")}");
                    }
                    _deliklerOnaylandiKutusu.Enabled = true;
                }
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("CncYerlesimPaneli.DelikleriTaraVeGoster HATA: " + ex.Message);
                _delikListesi.Items.Clear();
                _delikListesi.Items.Add("(tarama başarısız: " + ex.Message + ")");
                _deliklerOnaylandiKutusu.Enabled = false;
            }
        }

        private void MevcutDegerleriYukle()
        {
            string Oku(string alan) => KesimListesiCikarici.OzelAlanOku(_hedefModel, alan) ?? "";

            _deliklerOnaylandiKutusu.Checked = string.Equals(Oku(OzelAlanlar.DELIKLER_ONAYLANDI), "evet", StringComparison.OrdinalIgnoreCase);
            _fincanKutusu.Text = Oku(OzelAlanlar.CNC_FINCAN);
            string kose = Oku(OzelAlanlar.CNC_SIFIRLAMA_KOSE);
            _sifirlamaKoseKutusu.SelectedItem = _sifirlamaKoseKutusu.Items.Contains(kose) ? kose : "";
            _ofsetXKutusu.Text = Oku(OzelAlanlar.CNC_SIFIRLAMA_OFSET_X);
            _ofsetYKutusu.Text = Oku(OzelAlanlar.CNC_SIFIRLAMA_OFSET_Y);
            _ofsetZKutusu.Text = Oku(OzelAlanlar.CNC_SIFIRLAMA_OFSET_Z);
        }

        private void KaydetBtn_Click(object sender, EventArgs e)
        {
            void Yaz(string alan, string deger) => KesimListesiCikarici.OzelAlanYaz(_hedefModel, alan, deger ?? "");

            Yaz(OzelAlanlar.DELIKLER_ONAYLANDI, _deliklerOnaylandiKutusu.Checked ? "evet" : "");
            Yaz(OzelAlanlar.CNC_FINCAN, _fincanKutusu.Text.Trim());
            Yaz(OzelAlanlar.CNC_SIFIRLAMA_KOSE, _sifirlamaKoseKutusu.SelectedItem?.ToString() ?? "");
            Yaz(OzelAlanlar.CNC_SIFIRLAMA_OFSET_X, _ofsetXKutusu.Text.Trim());
            Yaz(OzelAlanlar.CNC_SIFIRLAMA_OFSET_Y, _ofsetYKutusu.Text.Trim());
            Yaz(OzelAlanlar.CNC_SIFIRLAMA_OFSET_Z, _ofsetZKutusu.Text.Trim());

            Tanilama.Kaydet("CncYerlesimPaneli: " + _hedefModel.GetPathName() +
                " kaydedildi (fincan=" + _fincanKutusu.Text.Trim() +
                ", köşe=" + (_sifirlamaKoseKutusu.SelectedItem ?? "") +
                ", deliklerOnaylandi=" + _deliklerOnaylandiKutusu.Checked + ")");
            DialogResult = DialogResult.OK;
            Close();
        }
    }
}
