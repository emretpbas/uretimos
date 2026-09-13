using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SolidWorks.Interop.sldworks;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // CNC YERLEŞİMİ + OPERASYON PANELİ — kullanıcı isteği: "parçaya sağ
    // tıklayıp bir CNC fincan ya da sıfırlama bölümüne yerleştir ... freze
    // bıçaklarını takım yollarından seçebildiğim, bıçak yükseklik kalınlık ve
    // bull/ball/düz/V uçlu, özel profilli bıçak ayarlarını yapabileceğim,
    // fincan yüksekliği ve 5 eksen freze ayarlarını, giriş ve çıkış
    // ayarlarını, pasoları, dönüş ve ilerleme hızı ayarlarını yapabildiğim
    // bir [CAM] programı" (Biesse bSolid 5 eksen düz tabla + fincan makinesi).
    //
    // İKİ SEKME:
    //   Genel        — fincan/sıfırlama köşesi + otomatik tespit edilen
    //                  deliklerin ONAY kapısı (bkz. DelikFormCikarici.cs).
    //   Operasyonlar — HER delik grubu/kontur için AYRI takım (ÜretimOS
    //                  CNC Takım Kütüphanesi'nden), fincan yüksekliği, giriş/
    //                  çıkış stratejisi, paso, devir/ilerleme; sağda BASİT
    //                  bir 2D takım yolu önizlemesi.
    //
    // BİLEREK YAPILMAYAN (kritik, üç kez tekrarlanacak kadar önemli):
    //   1) Gerçek G-kodu/postprocessor/XNC üretimi YOK — kullanıcı Biesse
    //      bSolid postprocessor'ünü ve örnek makine kodunu gönderene kadar
    //      TAHMİN EDİLMEZ. Burada yalnızca parametreler SAKLANIR.
    //   2) Gerçek 5 eksen takım ekseni hesabı (yüzey normaline göre takım
    //      eğimi) YOK — yalnızca bir "eğim açısı" sayısı SAKLANIR.
    //   3) Kontur/cep önizlemesindeki "takım yolu" GERÇEK bir poligon-offset
    //      algoritması DEĞİLDİR — merkez etrafında kaba bir ölçekleme ile
    //      YAKLAŞIK bir fikir verir, üretim için KULLANILAMAZ.
    // ════════════════════════════════════════════════════════════════════════
    public class CncYerlesimPaneli : Form
    {
        private readonly ModelDoc2 _hedefModel;
        private double _boyMm, _enMm, _kalinlikMm;

        // ── Genel sekmesi ────────────────────────────────────────────────────
        private ListBox _delikListesi;
        private CheckBox _deliklerOnaylandiKutusu;
        private TextBox _fincanKutusu;
        private ComboBox _sifirlamaKoseKutusu;
        private TextBox _ofsetXKutusu, _ofsetYKutusu, _ofsetZKutusu;

        // ── Operasyonlar sekmesi ─────────────────────────────────────────────
        private List<CncOperasyonu> _operasyonlar = new List<CncOperasyonu>();
        private List<TakimOzet> _takimListesi = new List<TakimOzet>();
        private ListBox _operasyonListesi;
        private ComboBox _takimSecKutusu;
        private TextBox _opFincanYukKutusu, _besEksenAciKutusu;
        private ComboBox _girisKutusu, _cikisKutusu;
        private TextBox _pasoDerinlikKutusu, _pasoSayisiKutusu;
        private TextBox _devirKutusu, _ilerlemeKutusu, _dalmaIlerlemeKutusu;
        private Panel _onizlemePaneli;
        private Label _takimDurumEtiketi;
        private bool _operasyonYukleniyor; // UI<->model eşitleme sırasında olay döngüsünü engeller

        private Label _durumEtiketi;

        private class TakimOzet
        {
            public string Id, Kod, Ad, ProfilTipi;
            public double CapMm;
            public override string ToString() =>
                string.Format(System.Globalization.CultureInfo.InvariantCulture,
                    "{0} — {1} (Ø{2:0.0} {3})", Kod, Ad, CapMm, ProfilTipi);
        }

        public CncYerlesimPaneli(ModelDoc2 hedefModel)
        {
            _hedefModel = hedefModel;
            KurulumYap();
            OlculeriOku();
            DelikleriTaraVeGoster();
            MevcutDegerleriYukle();
        }

        private void OlculeriOku()
        {
            double.TryParse(KesimListesiCikarici.OzelAlanOku(_hedefModel, OzelAlanlar.BOY_MM), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out _boyMm);
            double.TryParse(KesimListesiCikarici.OzelAlanOku(_hedefModel, OzelAlanlar.EN_MM), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out _enMm);
            double.TryParse(KesimListesiCikarici.OzelAlanOku(_hedefModel, OzelAlanlar.KALINLIK_MM), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out _kalinlikMm);
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — CNC Yerleşimi ve Operasyonlar (Biesse bSolid)";
            Width = 920;
            Height = 700;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.Sizable;
            MinimizeBox = false;

            var sekmeler = new TabControl { Dock = DockStyle.Fill };
            var genelSekme = new TabPage("Genel");
            var opSekme = new TabPage("Operasyonlar (Takım/Parametre)");
            sekmeler.TabPages.Add(genelSekme);
            sekmeler.TabPages.Add(opSekme);

            GenelSekmeKur(genelSekme);
            OperasyonSekmeKur(opSekme);

            _durumEtiketi = new Label { Dock = DockStyle.Bottom, Height = 34, ForeColor = Color.DarkSlateGray, Padding = new Padding(10, 6, 10, 6), Text = "" };

            var altPanel = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(10) };
            var vazgecBtn = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, AutoSize = true };
            var kaydetBtn = new Button { Text = "✓ Tümünü Kaydet", AutoSize = true, Font = new Font(Font, FontStyle.Bold) };
            kaydetBtn.Click += KaydetBtn_Click;
            altPanel.Controls.Add(vazgecBtn);
            altPanel.Controls.Add(kaydetBtn);

            Controls.Add(sekmeler);
            Controls.Add(_durumEtiketi);
            Controls.Add(altPanel);
            AcceptButton = kaydetBtn;
            CancelButton = vazgecBtn;
        }

        // ── GENEL SEKME ──────────────────────────────────────────────────────
        private void GenelSekmeKur(TabPage sekme)
        {
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

            var uyariEtiketi = new Label
            {
                AutoSize = false, Height = 56, ForeColor = Color.DarkSlateGray,
                Text = "Bu panel yalnızca fincan/sıfırlama/operasyon BİLGİSİNİ saklar — gerçek " +
                       "G-kodu/XNC postprocessor bilgisi gelmeden ÜRETİLMEZ."
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

            sekme.Controls.Add(ana);
        }

        // ── OPERASYONLAR SEKME ───────────────────────────────────────────────
        private void OperasyonSekmeKur(TabPage sekme)
        {
            var kok = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
            kok.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            kok.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            var ustPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, Padding = new Padding(8, 4, 8, 4) };
            var cekBtn = new Button { Text = "🌐 Takım Kütüphanesini ÜretimOS'tan Çek", AutoSize = true };
            cekBtn.Click += TakimKutuphanesiCekBtn_Click;
            _takimDurumEtiketi = new Label { AutoSize = true, Padding = new Padding(10, 6, 0, 0), ForeColor = Color.DarkSlateGray };
            ustPanel.Controls.Add(cekBtn);
            ustPanel.Controls.Add(_takimDurumEtiketi);

            var govdeSplit = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 240 };

            _operasyonListesi = new ListBox { Dock = DockStyle.Fill };
            _operasyonListesi.SelectedIndexChanged += OperasyonListesi_SelectedIndexChanged;
            govdeSplit.Panel1.Controls.Add(_operasyonListesi);

            var sagSplit = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 300 };

            var parametreTablo = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(10), AutoScroll = true };
            parametreTablo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
            parametreTablo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));

            void PSatir(string etiket, Control kontrol)
            {
                parametreTablo.RowCount++;
                parametreTablo.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                var lbl = new Label { Text = etiket, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 5, 0, 0) };
                kontrol.Dock = DockStyle.Fill;
                kontrol.Margin = new Padding(3, 2, 3, 6);
                parametreTablo.Controls.Add(lbl);
                parametreTablo.Controls.Add(kontrol);
            }

            _takimSecKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _takimSecKutusu.SelectedIndexChanged += (s, e) => { OperasyonModeldenUiyeYazBayrak(); OnizlemeYenile(); };
            PSatir("Takım (ÜretimOS Takım Kütüphanesi)", _takimSecKutusu);

            _opFincanYukKutusu = new TextBox();
            PSatir("Fincan Yüksekliği (mm)", _opFincanYukKutusu);

            _besEksenAciKutusu = new TextBox();
            PSatir("5 Eksen Eğim Açısı (derece)\n(YALNIZCA sayı saklanır — gerçek takım ekseni HESAPLANMAZ)", _besEksenAciKutusu);

            _girisKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _girisKutusu.Items.AddRange(new object[] { "", "dikey", "rampa", "onceden_delik" });
            PSatir("Giriş Stratejisi", _girisKutusu);

            _cikisKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
            _cikisKutusu.Items.AddRange(new object[] { "", "dikey", "rampa" });
            PSatir("Çıkış Stratejisi", _cikisKutusu);

            _pasoDerinlikKutusu = new TextBox();
            PSatir("Paso Derinliği (mm)", _pasoDerinlikKutusu);

            _pasoSayisiKutusu = new TextBox();
            PSatir("Paso Sayısı (0 = otomatik)", _pasoSayisiKutusu);

            _devirKutusu = new TextBox();
            PSatir("Devir (RPM)", _devirKutusu);

            _ilerlemeKutusu = new TextBox();
            PSatir("Kesme İlerlemesi (mm/dk)", _ilerlemeKutusu);

            _dalmaIlerlemeKutusu = new TextBox();
            PSatir("Dalma İlerlemesi (mm/dk)", _dalmaIlerlemeKutusu);

            foreach (Control c in new Control[] { _opFincanYukKutusu, _besEksenAciKutusu, _pasoDerinlikKutusu, _pasoSayisiKutusu, _devirKutusu, _ilerlemeKutusu, _dalmaIlerlemeKutusu })
                c.TextChanged += (s, e) => OnizlemeYenile();
            _girisKutusu.SelectedIndexChanged += (s, e) => OnizlemeYenile();
            _cikisKutusu.SelectedIndexChanged += (s, e) => OnizlemeYenile();

            sagSplit.Panel1.Controls.Add(parametreTablo);

            _onizlemePaneli = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, BorderStyle = BorderStyle.FixedSingle };
            _onizlemePaneli.Paint += OnizlemePaneli_Paint;
            sagSplit.Panel2.Controls.Add(_onizlemePaneli);

            govdeSplit.Panel2.Controls.Add(sagSplit);

            kok.Controls.Add(ustPanel, 0, 0);
            kok.Controls.Add(govdeSplit, 0, 1);
            sekme.Controls.Add(kok);
        }

        // Bazı kontroller (takım seçimi gibi) model senkronizasyonunu tetiklerken
        // sonsuz döngüye girmesin diye — bu metot şu an yalnızca önizlemeyi
        // güncel tutmak için var, model senkronu ayrı bir yerde (SecimDegisti)
        // yapılıyor.
        private void OperasyonModeldenUiyeYazBayrak() { }

        // ── DELİK/FORM TARAMA (Genel sekme listesi) ─────────────────────────
        private List<DelikBilgisi> _delikler = new List<DelikBilgisi>();
        private List<FormBilgisi> _formlar = new List<FormBilgisi>();

        private void DelikleriTaraVeGoster()
        {
            try
            {
                var (delikler, formlar) = DelikFormCikarici.Cikar(_hedefModel, _kalinlikMm);
                _delikler = delikler;
                _formlar = formlar;
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

                _operasyonlar = CncOperasyonlariOlustur.Olustur(_delikler, _formlar);
                string mevcutJson = KesimListesiCikarici.OzelAlanOku(_hedefModel, OzelAlanlar.CNC_OPERASYONLAR);
                if (!string.IsNullOrWhiteSpace(mevcutJson))
                {
                    try
                    {
                        var kayitlar = JsonConvert.DeserializeObject<List<CncOperasyonKaydi>>(mevcutJson);
                        CncOperasyonlariOlustur.KayitlariUygula(_operasyonlar, kayitlar);
                    }
                    catch (Exception ex)
                    {
                        Tanilama.Kaydet("CncYerlesimPaneli: CNC_OPERASYONLAR JSON okunamadı: " + ex.Message);
                    }
                }

                _operasyonListesi.Items.Clear();
                foreach (var op in _operasyonlar) _operasyonListesi.Items.Add(op.Etiket);
                if (_operasyonlar.Count == 0)
                {
                    _operasyonListesi.Items.Add("(işlenecek delik/form tespit edilmedi)");
                }
                else
                {
                    _operasyonListesi.SelectedIndex = 0;
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

        private int _oncekiOperasyonIndex = -1;

        private void OperasyonListesi_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (_operasyonYukleniyor) return;
            // Önce, ayrılınan operasyonun UI'daki güncel değerlerini modele yaz.
            if (_oncekiOperasyonIndex >= 0 && _oncekiOperasyonIndex < _operasyonlar.Count)
                UidenOperasyonaYaz(_operasyonlar[_oncekiOperasyonIndex]);

            _oncekiOperasyonIndex = _operasyonListesi.SelectedIndex;
            if (_oncekiOperasyonIndex < 0 || _oncekiOperasyonIndex >= _operasyonlar.Count) return;
            OperasyondanUiyeYukle(_operasyonlar[_oncekiOperasyonIndex]);
            OnizlemeYenile();
        }

        private void OperasyondanUiyeYukle(CncOperasyonu op)
        {
            _operasyonYukleniyor = true;
            try
            {
                _takimSecKutusu.SelectedIndex = -1;
                if (!string.IsNullOrEmpty(op.TakimId))
                {
                    var eslesen = _takimListesi.FirstOrDefault(t => t.Id == op.TakimId);
                    if (eslesen != null) _takimSecKutusu.SelectedItem = eslesen;
                }
                _opFincanYukKutusu.Text = op.FincanYuksekligiMm > 0 ? op.FincanYuksekligiMm.ToString(System.Globalization.CultureInfo.InvariantCulture) : "";
                _besEksenAciKutusu.Text = op.BesEksenEgimAcisiDerece != 0 ? op.BesEksenEgimAcisiDerece.ToString(System.Globalization.CultureInfo.InvariantCulture) : "";
                _girisKutusu.SelectedItem = _girisKutusu.Items.Contains(op.GirisStratejisi) ? op.GirisStratejisi : "";
                _cikisKutusu.SelectedItem = _cikisKutusu.Items.Contains(op.CikisStratejisi) ? op.CikisStratejisi : "";
                _pasoDerinlikKutusu.Text = op.PasoDerinligiMm > 0 ? op.PasoDerinligiMm.ToString(System.Globalization.CultureInfo.InvariantCulture) : "";
                _pasoSayisiKutusu.Text = op.PasoSayisi > 0 ? op.PasoSayisi.ToString() : "";
                _devirKutusu.Text = op.DevirRpm > 0 ? op.DevirRpm.ToString(System.Globalization.CultureInfo.InvariantCulture) : "";
                _ilerlemeKutusu.Text = op.IlerlemeMmDak > 0 ? op.IlerlemeMmDak.ToString(System.Globalization.CultureInfo.InvariantCulture) : "";
                _dalmaIlerlemeKutusu.Text = op.DalmaIlerlemeMmDak > 0 ? op.DalmaIlerlemeMmDak.ToString(System.Globalization.CultureInfo.InvariantCulture) : "";
            }
            finally { _operasyonYukleniyor = false; }
        }

        private void UidenOperasyonaYaz(CncOperasyonu op)
        {
            double Cift(string metin) => double.TryParse(metin, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double v) ? v : 0;
            int Tam(string metin) => int.TryParse(metin, out int v) ? v : 0;

            var takim = _takimSecKutusu.SelectedItem as TakimOzet;
            op.TakimId = takim?.Id ?? op.TakimId;
            op.TakimKodu = takim?.Kod ?? op.TakimKodu;
            op.FincanYuksekligiMm = Cift(_opFincanYukKutusu.Text);
            op.BesEksenEgimAcisiDerece = Cift(_besEksenAciKutusu.Text);
            op.GirisStratejisi = _girisKutusu.SelectedItem?.ToString() ?? "";
            op.CikisStratejisi = _cikisKutusu.SelectedItem?.ToString() ?? "";
            op.PasoDerinligiMm = Cift(_pasoDerinlikKutusu.Text);
            op.PasoSayisi = Tam(_pasoSayisiKutusu.Text);
            op.DevirRpm = Cift(_devirKutusu.Text);
            op.IlerlemeMmDak = Cift(_ilerlemeKutusu.Text);
            op.DalmaIlerlemeMmDak = Cift(_dalmaIlerlemeKutusu.Text);
        }

        // ── TAKIM KÜTÜPHANESİ (ÜretimOS, salt okunur) ────────────────────────
        private async void TakimKutuphanesiCekBtn_Click(object sender, EventArgs e)
        {
            _takimDurumEtiketi.Text = "Bağlanılıyor…";
            var ayar = BaglantiAyarlari.Yukle();
            if (ayar == null)
            {
                BaglantiAyarlari.OrnekDosyaOlustur();
                _takimDurumEtiketi.ForeColor = Color.DarkOrange;
                _takimDurumEtiketi.Text = "Yerel bağlantı ayarı bulunamadı: " + BaglantiAyarlari.DosyaYoluGoster();
                return;
            }
            try
            {
                var istemci = new UretimOSApiClient(ayar.SunucuUrl);
                bool girisBasarili = await istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre);
                if (!girisBasarili)
                {
                    _takimDurumEtiketi.ForeColor = Color.DarkRed;
                    _takimDurumEtiketi.Text = "Giriş başarısız — kullanıcı adı/şifreyi kontrol edin.";
                    return;
                }
                string json = await istemci.Getir("cncTakimlari");
                var dizi = JArray.Parse(json ?? "[]");
                _takimListesi = dizi.Where(o => (bool?)o["aktif"] != false).Select(o => new TakimOzet
                {
                    Id = (string)o["id"],
                    Kod = (string)o["kod"] ?? "",
                    Ad = (string)o["ad"] ?? "",
                    ProfilTipi = (string)o["profilTipi"] ?? "",
                    CapMm = (double?)o["capMm"] ?? 0
                }).ToList();

                _takimSecKutusu.Items.Clear();
                _takimSecKutusu.Items.AddRange(_takimListesi.Cast<object>().ToArray());

                _takimDurumEtiketi.ForeColor = Color.DarkGreen;
                _takimDurumEtiketi.Text = $"✓ {_takimListesi.Count} takım yüklendi.";

                // Zaten seçili bir operasyon varsa, atanmış takımı yeniden eşle.
                if (_oncekiOperasyonIndex >= 0 && _oncekiOperasyonIndex < _operasyonlar.Count)
                    OperasyondanUiyeYukle(_operasyonlar[_oncekiOperasyonIndex]);
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("CncYerlesimPaneli.TakimKutuphanesiCekBtn_Click HATA: " + ex);
                _takimDurumEtiketi.ForeColor = Color.DarkRed;
                _takimDurumEtiketi.Text = "Takım kütüphanesi çekilemedi: " + ex.Message;
            }
        }

        // ── 2D ÖNİZLEME (BASİT — GERÇEK TAKIM YOLU DEĞİL) ────────────────────
        private void OnizlemeYenile() { _onizlemePaneli?.Invalidate(); }

        private void OnizlemePaneli_Paint(object sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var panel = (Panel)sender;

            using (var uyariFont = new Font(Font.FontFamily, 7.5f, FontStyle.Italic))
                g.DrawString("Basit önizleme — GERÇEK takım yolu/G-kodu DEĞİLDİR, yalnızca fikir verir.",
                    uyariFont, Brushes.DimGray, 4, panel.Height - 16);

            if (_boyMm <= 0 || _enMm <= 0)
            {
                g.DrawString("Parça ölçüsü (BOY_MM/EN_MM) yok — önizleme çizilemiyor.", Font, Brushes.Gray, 8, 8);
                return;
            }
            if (_oncekiOperasyonIndex < 0 || _oncekiOperasyonIndex >= _operasyonlar.Count) return;
            var op = _operasyonlar[_oncekiOperasyonIndex];

            const double kenarBosluk = 20;
            double olcek = Math.Min((panel.Width - 2 * kenarBosluk) / _enMm, (panel.Height - 2 * kenarBosluk) / _boyMm);
            if (olcek <= 0 || double.IsNaN(olcek) || double.IsInfinity(olcek)) return;

            float PX(double x) => (float)(kenarBosluk + x * olcek);
            float PY(double y) => (float)(panel.Height - kenarBosluk - y * olcek);

            using (var kalem = new Pen(Color.Black, 1.5f))
                g.DrawRectangle(kalem, PX(0), PY(_boyMm), (float)(_enMm * olcek), (float)(_boyMm * olcek));

            var secilenTakim = _takimSecKutusu.SelectedItem as TakimOzet;

            if (op.Tip == "delme")
            {
                double capMm = secilenTakim != null && secilenTakim.CapMm > 0 ? secilenTakim.CapMm
                    : (op.Delikler.Count > 0 ? op.Delikler[0].CapMm : 5);
                using (var kalem = new Pen(Color.Red, 1.5f))
                using (var kesikKalem = new Pen(Color.Gray))
                {
                    foreach (var d in op.Delikler)
                    {
                        float cx = PX(d.XMm), cy = PY(d.YMm);
                        float r = (float)(capMm / 2 * olcek);
                        if (r > 0.5f) g.DrawEllipse(kalem, cx - r, cy - r, r * 2, r * 2);
                        g.DrawLine(kesikKalem, cx - 4, cy, cx + 4, cy);
                        g.DrawLine(kesikKalem, cx, cy - 4, cx, cy + 4);
                    }
                }
            }
            else if (op.Tip == "kontur" && op.Form != null && op.Form.NoktalarXY.Count >= 3)
            {
                var noktalar = op.Form.NoktalarXY;
                var gercekNoktalar = noktalar.Select(p => new PointF(PX(p[0]), PY(p[1]))).ToArray();
                using (var kalem = new Pen(Color.Blue, 1.2f))
                    g.DrawPolygon(kalem, gercekNoktalar);

                // YAKLAŞIK "takım yolu" — merkez etrafında kaba bir ölçekleme.
                // GERÇEK bir poligon-ofset algoritması DEĞİLDİR (bkz. sınıf başı uyarı).
                double takimYaricapMm = secilenTakim != null && secilenTakim.CapMm > 0 ? secilenTakim.CapMm / 2 : 4;
                double cx0 = noktalar.Average(p => p[0]), cy0 = noktalar.Average(p => p[1]);
                double ortalamaYaricap = noktalar.Average(p => Math.Sqrt(Math.Pow(p[0] - cx0, 2) + Math.Pow(p[1] - cy0, 2)));
                double faktor = ortalamaYaricap > 0.01 ? (ortalamaYaricap + takimYaricapMm) / ortalamaYaricap : 1;
                var ofsetNoktalar = noktalar.Select(p => new PointF(
                    PX(cx0 + (p[0] - cx0) * faktor), PY(cy0 + (p[1] - cy0) * faktor))).ToArray();
                using (var kesikKalem = new Pen(Color.OrangeRed, 1.2f) { DashStyle = DashStyle.Dash })
                    g.DrawPolygon(kesikKalem, ofsetNoktalar);
            }
        }

        // ── GENEL SEKME DEĞER YÜKLE/KAYDET ───────────────────────────────────
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
            // Ekranda kalan (henüz seçim değiştirilmediği için modele yazılmamış)
            // operasyon parametrelerini de kaydet.
            if (_oncekiOperasyonIndex >= 0 && _oncekiOperasyonIndex < _operasyonlar.Count)
                UidenOperasyonaYaz(_operasyonlar[_oncekiOperasyonIndex]);

            void Yaz(string alan, string deger) => KesimListesiCikarici.OzelAlanYaz(_hedefModel, alan, deger ?? "");

            Yaz(OzelAlanlar.DELIKLER_ONAYLANDI, _deliklerOnaylandiKutusu.Checked ? "evet" : "");
            Yaz(OzelAlanlar.CNC_FINCAN, _fincanKutusu.Text.Trim());
            Yaz(OzelAlanlar.CNC_SIFIRLAMA_KOSE, _sifirlamaKoseKutusu.SelectedItem?.ToString() ?? "");
            Yaz(OzelAlanlar.CNC_SIFIRLAMA_OFSET_X, _ofsetXKutusu.Text.Trim());
            Yaz(OzelAlanlar.CNC_SIFIRLAMA_OFSET_Y, _ofsetYKutusu.Text.Trim());
            Yaz(OzelAlanlar.CNC_SIFIRLAMA_OFSET_Z, _ofsetZKutusu.Text.Trim());

            var kayitlar = CncOperasyonlariOlustur.KayitlariCikar(_operasyonlar);
            string json = JsonConvert.SerializeObject(kayitlar);
            Yaz(OzelAlanlar.CNC_OPERASYONLAR, json);

            Tanilama.Kaydet("CncYerlesimPaneli: " + _hedefModel.GetPathName() +
                " kaydedildi (fincan=" + _fincanKutusu.Text.Trim() +
                ", " + _operasyonlar.Count + " operasyon, deliklerOnaylandi=" + _deliklerOnaylandiKutusu.Checked + ")");
            DialogResult = DialogResult.OK;
            Close();
        }
    }
}
