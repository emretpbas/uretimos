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
    // ETİKETLEME PANELİ — "Faz 2" olarak bırakılan Kütüphane/Etiketleme
    // ekranının gerçek hâli. Kullanıcı isteği (üst düzey ahşap teknik ofis
    // programı): minifix/rafix/menteşe (HIRDAVAT), 45° birleşim (BIRLESIM_TIPI),
    // yabancı parça (YABANCI_PARCA) dahil TÜM URETIMOS_* özel alanlarını
    // SolidWorks'ün genel "Özel Özellikler" ekranından TEK TEK elle
    // yazdırmak yerine, GRUPLANMIŞ, ETİKETLİ, ön-doldurmalı TEK bir form.
    //
    // BİLİNÇLİ TASARIM — neden IPropertyManagerPage2 (SolidWorks'ün kendi
    // native panel API'si) DEĞİL, düz bir WinForms Form: PropertyManagerPage
    // COM arayüzü (IPropertyManagerPage2, callback handler'ları vb.) resmi
    // dokümantasyona bu ortamda erişimim olmadan güvenle doğrulanamayacak,
    // OLDUKÇA geniş bir COM yüzeyi — yanlış bir varsayım en azından derleme
    // hatasına (güvenli), muhtemelen de karmaşık runtime callback
    // hatalarına yol açardı. WinForms ise .NET'in KENDİ, SolidWorks'ten
    // bağımsız, sıfır COM riski taşıyan, zaten bu eklentide (MessageBox,
    // SaveFileDialog) kanıtlanmış bir teknolojisi — aynı güvenilirlikle
    // çok daha hızlı, daha az riskli teslim edilebilir.
    //
    // ÜretimOS'tan CANLI liste çekme (plaka/kenar bandı/hırdavat kodları)
    // TAMAMEN OPSİYONELDİR: BaglantiAyarlari.Yukle() null dönerse (yerel
    // ayar dosyası yok/okunamıyor) veya sunucuya bağlanılamazsa, panel
    // SESSİZCE serbest-metin moduna düşer — özellik hiçbir zaman paneli
    // KULLANILAMAZ hale getirmez, sadece "kolaylık" katmanı devre dışı kalır.
    // ════════════════════════════════════════════════════════════════════════
    public class EtiketlemePaneli : Form
    {
        private readonly ModelDoc2 _hedefModel;

        private ComboBox _tipKutusu;
        private TextBox _kodKutusu, _adKutusu;
        private TextBox _boyKutusu, _enKutusu, _kalinlikKutusu;
        private ComboBox _plakaKutusu;
        private ComboBox _kenarOnKutusu, _kenarArkaKutusu, _kenarSolKutusu, _kenarSagKutusu;
        private TextBox _hirdavatKutusu;
        private TextBox _ustPaketKutusu;
        private ComboBox _birlesimKutusu;
        private CheckBox _yabanciParcaKutusu;
        private Label _durumEtiketi;

        public EtiketlemePaneli(ModelDoc2 hedefModel)
        {
            _hedefModel = hedefModel;
            KurulumYap();
            MevcutDegerleriYukle();
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — Parça/Paket Etiketle";
            Width = 560;
            Height = 640;
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

            void Satir(string etiket, Control kontrol)
            {
                ana.RowCount++;
                ana.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                var lbl = new Label { Text = etiket, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 6, 0, 0) };
                kontrol.Dock = DockStyle.Fill;
                kontrol.Margin = new Padding(3, 3, 3, 8);
                ana.Controls.Add(lbl);
                ana.Controls.Add(kontrol);
            }

            _tipKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _tipKutusu.Items.AddRange(new object[] { "parca", "alt_montaj", "kok" });
            Satir("URETIMOS_TIP *", _tipKutusu);

            _kodKutusu = new TextBox();
            Satir("URETIMOS_KOD", _kodKutusu);

            _adKutusu = new TextBox();
            Satir("URETIMOS_AD\n(boşsa dosya adı kullanılır)", _adKutusu);

            _boyKutusu = new TextBox();
            Satir("URETIMOS_BOY_MM", _boyKutusu);

            _enKutusu = new TextBox();
            Satir("URETIMOS_EN_MM", _enKutusu);

            _kalinlikKutusu = new TextBox();
            Satir("URETIMOS_KALINLIK_MM", _kalinlikKutusu);

            _plakaKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown };
            Satir("URETIMOS_PLAKA_KODU", _plakaKutusu);

            _kenarOnKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown };
            Satir("URETIMOS_KENAR_ON (EBF)", _kenarOnKutusu);
            _kenarArkaKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown };
            Satir("URETIMOS_KENAR_ARKA (EBB)", _kenarArkaKutusu);
            _kenarSolKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown };
            Satir("URETIMOS_KENAR_SOL (EBL)", _kenarSolKutusu);
            _kenarSagKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown };
            Satir("URETIMOS_KENAR_SAG (EBR)", _kenarSagKutusu);

            // NOT: TextBox.PlaceholderText .NET Framework 4.8 WinForms'ta YOK
            // (yalnızca .NET 5+ WinForms'ta eklendi) — bu projede net48
            // hedeflendiği için (bkz. .csproj) kullanılmadı, ipucu doğrudan
            // etikete yazıldı.
            _hirdavatKutusu = new TextBox();
            Satir("URETIMOS_HIRDAVAT\nörn. MINIFIX-15:2,RAFIX-5:4\n(kod:adet, VİRGÜLLE ayırın)", _hirdavatKutusu);

            _ustPaketKutusu = new TextBox();
            Satir("URETIMOS_UST_PAKET_KODU", _ustPaketKutusu);

            _birlesimKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown };
            _birlesimKutusu.Items.AddRange(new object[] { "", "duz", "45_derece" });
            Satir("URETIMOS_BIRLESIM_TIPI", _birlesimKutusu);

            _yabanciParcaKutusu = new CheckBox { Text = "Bu parça bir plakadan KESİLMEZ (satın alınır — cam/ayna/hazır profil vb.)" };
            Satir("URETIMOS_YABANCI_PARCA", _yabanciParcaKutusu);

            var cekButonu = new Button { Text = "🌐 ÜretimOS'tan Listeleri Çek (opsiyonel)", AutoSize = true };
            cekButonu.Click += CekButonu_Click;
            ana.Controls.Add(new Label());
            ana.Controls.Add(cekButonu);
            ana.RowCount++; ana.RowStyles.Add(new RowStyle(SizeType.AutoSize));

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

        private void MevcutDegerleriYukle()
        {
            string Oku(string alan) => KesimListesiCikarici.OzelAlanOku(_hedefModel, alan) ?? "";

            string tip = Oku(OzelAlanlar.TIP);
            _tipKutusu.SelectedItem = _tipKutusu.Items.Contains(tip) ? tip : null;
            _kodKutusu.Text = Oku(OzelAlanlar.KOD);
            _adKutusu.Text = Oku(OzelAlanlar.AD);
            _boyKutusu.Text = Oku(OzelAlanlar.BOY_MM);
            _enKutusu.Text = Oku(OzelAlanlar.EN_MM);
            _kalinlikKutusu.Text = Oku(OzelAlanlar.KALINLIK_MM);
            _plakaKutusu.Text = Oku(OzelAlanlar.PLAKA_KODU);
            _kenarOnKutusu.Text = Oku(OzelAlanlar.KENAR_ON);
            _kenarArkaKutusu.Text = Oku(OzelAlanlar.KENAR_ARKA);
            _kenarSolKutusu.Text = Oku(OzelAlanlar.KENAR_SOL);
            _kenarSagKutusu.Text = Oku(OzelAlanlar.KENAR_SAG);
            _hirdavatKutusu.Text = Oku(OzelAlanlar.HIRDAVAT_LISTESI);
            _ustPaketKutusu.Text = Oku(OzelAlanlar.UST_PAKET_KODU);
            _birlesimKutusu.Text = Oku(OzelAlanlar.BIRLESIM_TIPI);
            _yabanciParcaKutusu.Checked = string.Equals(Oku(OzelAlanlar.YABANCI_PARCA), "evet", StringComparison.OrdinalIgnoreCase);
        }

        private void KaydetBtn_Click(object sender, EventArgs e)
        {
            if (_tipKutusu.SelectedItem == null)
            {
                MessageBox.Show("URETIMOS_TIP seçimi zorunlu (parca / alt_montaj / kok).", "ÜretimOS",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            void Yaz(string alan, string deger) => KesimListesiCikarici.OzelAlanYaz(_hedefModel, alan, deger ?? "");

            Yaz(OzelAlanlar.TIP, _tipKutusu.SelectedItem.ToString());
            Yaz(OzelAlanlar.KOD, _kodKutusu.Text.Trim());
            Yaz(OzelAlanlar.AD, _adKutusu.Text.Trim());
            Yaz(OzelAlanlar.BOY_MM, _boyKutusu.Text.Trim());
            Yaz(OzelAlanlar.EN_MM, _enKutusu.Text.Trim());
            Yaz(OzelAlanlar.KALINLIK_MM, _kalinlikKutusu.Text.Trim());
            Yaz(OzelAlanlar.PLAKA_KODU, _plakaKutusu.Text.Trim());
            Yaz(OzelAlanlar.KENAR_ON, _kenarOnKutusu.Text.Trim());
            Yaz(OzelAlanlar.KENAR_ARKA, _kenarArkaKutusu.Text.Trim());
            Yaz(OzelAlanlar.KENAR_SOL, _kenarSolKutusu.Text.Trim());
            Yaz(OzelAlanlar.KENAR_SAG, _kenarSagKutusu.Text.Trim());
            Yaz(OzelAlanlar.HIRDAVAT_LISTESI, _hirdavatKutusu.Text.Trim());
            Yaz(OzelAlanlar.UST_PAKET_KODU, _ustPaketKutusu.Text.Trim());
            Yaz(OzelAlanlar.BIRLESIM_TIPI, _birlesimKutusu.Text.Trim());
            Yaz(OzelAlanlar.YABANCI_PARCA, _yabanciParcaKutusu.Checked ? "evet" : "");

            Tanilama.Kaydet("EtiketlemePaneli: " + _hedefModel.GetPathName() + " etiketlendi (TIP=" + _tipKutusu.SelectedItem + ")");
            DialogResult = DialogResult.OK;
            Close();
        }

        // Sunucudan hammadde listesini çekip Plaka/Kenar Bandı kutularına
        // ÖNERİ (autocomplete kaynağı) olarak yükler — BAŞARISIZ olursa
        // panel serbest-metin moduna düşer, HİÇBİR ŞEYİ bloklamaz.
        private async void CekButonu_Click(object sender, EventArgs e)
        {
            _durumEtiketi.Text = "Bağlanılıyor…";
            var ayar = BaglantiAyarlari.Yukle();
            if (ayar == null)
            {
                BaglantiAyarlari.OrnekDosyaOlustur();
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "Yerel bağlantı ayarı bulunamadı. Örnek dosya oluşturuldu:\n" +
                    BaglantiAyarlari.DosyaYoluGoster() + "\nBu dosyayı düzenleyip tekrar deneyin.";
                return;
            }

            try
            {
                var istemci = new UretimOSApiClient(ayar.SunucuUrl);
                bool girisBasarili = await istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre);
                if (!girisBasarili)
                {
                    _durumEtiketi.ForeColor = Color.DarkRed;
                    _durumEtiketi.Text = "Giriş başarısız — kullanıcı adı/şifreyi kontrol edin:\n" + BaglantiAyarlari.DosyaYoluGoster();
                    return;
                }

                string hamJson = await istemci.Getir("hammaddeler");
                var dizi = JArray.Parse(hamJson ?? "[]");

                var plakalar = new List<string>();
                var kenarlar = new List<string>();
                foreach (var oge in dizi)
                {
                    string tip = (string)oge["tip"];
                    string kod = (string)oge["stokKodu"];
                    if (string.IsNullOrWhiteSpace(kod)) continue;
                    if (tip == "plaka") plakalar.Add(kod);
                    else if (tip == "kenar_bandi") kenarlar.Add(kod);
                }

                _plakaKutusu.Items.Clear();
                _plakaKutusu.Items.AddRange(plakalar.Distinct().OrderBy(x => x).ToArray());
                foreach (var kutu in new[] { _kenarOnKutusu, _kenarArkaKutusu, _kenarSolKutusu, _kenarSagKutusu })
                {
                    kutu.Items.Clear();
                    kutu.Items.AddRange(kenarlar.Distinct().OrderBy(x => x).ToArray());
                }

                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ {plakalar.Count} plaka, {kenarlar.Count} kenar bandı kodu yüklendi (aşağı ok ile seçebilirsiniz).";
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("EtiketlemePaneli.CekButonu_Click HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Sunucudan liste çekilemedi: " + ex.Message + "\n(Alanları serbest metin olarak elle doldurabilirsiniz.)";
            }
        }
    }
}
