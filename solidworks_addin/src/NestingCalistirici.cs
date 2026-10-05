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
    // Kullanıcının nesting penceresinde girdiği plaka boyutu, kenar boşluğu
    // ve iki parça arası freze bıçak mesafesi — %LOCALAPPDATA%\UretimOSKesim\
    // nesting_ayarlari.json'da saklanır, bir sonraki nesting'de hazır gelir.
    public class NestingAyarlari
    {
        public double PlakaBoyMm, PlakaEnMm;
        public double KenarBoslukMm;
        public double BicakMesafesiMm;
        // Yönlendirme (bkz. NestingHesaplayici dosya başı notu). Eski kayıt
        // dosyasında bu alanlar yoksa alan başlangıç değerleri kullanılır:
        // grain varsayılan olarak AÇIK.
        public bool GrainYonuneUy = true;
        public bool SabitAciKullan;
        public double SabitAciDerece;

        [Newtonsoft.Json.JsonIgnore]
        public double? EtkinSabitAci => SabitAciKullan ? SabitAciDerece : (double?)null;

        [Newtonsoft.Json.JsonIgnore]
        public string YonlendirmeAciklamasi => SabitAciKullan
            ? $"sabit açı {SabitAciDerece:0.#}°"
            : (GrainYonuneUy ? "grain yönüne uy (parça boyu → plaka boyu)" : "serbest (0°/90°)");

        private static string DosyaYolu => Path.Combine(
            System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "UretimOSKesim", "nesting_ayarlari.json");

        public static NestingAyarlari Yukle()
        {
            try
            {
                if (!File.Exists(DosyaYolu)) return null;
                return Newtonsoft.Json.JsonConvert.DeserializeObject<NestingAyarlari>(File.ReadAllText(DosyaYolu));
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("NestingAyarlari.Yukle HATA (yok sayıldı): " + ex.Message);
                return null;
            }
        }

        public void Kaydet()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(DosyaYolu));
                File.WriteAllText(DosyaYolu, Newtonsoft.Json.JsonConvert.SerializeObject(this, Newtonsoft.Json.Formatting.Indented));
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("NestingAyarlari.Kaydet HATA (yok sayıldı): " + ex.Message);
            }
        }
    }

    // Nesting'e girecek TEK bir SolidWorks parçası. Ölçü TAŞIMAZ — kullanıcı
    // isteği: "hiçbir şekilde anma ölçüsü almasın nesting yerleşiminde
    // tamamen parça çizimi üzerinden işlem yapılsın". Boyut, dış hat, delik
    // ve kanallar nesting anında Model'in geometrisinden okunur.
    public class NestingParcaKaynagi
    {
        public ModelDoc2 Model;
        public string Ad;
        public string YmKod;
        public int Adet = 1;
        public double KalinlikMm; // yalnızca delik "tüm boyu" tespiti için (bkz. DelikFormCikarici)
        public ParcaGeometrisi Geometri; // null ise Calistir içinde çıkarılır
    }

    // ════════════════════════════════════════════════════════════════════════
    // ORTAK NESTING AKIŞI — kullanıcı isteği: "parçaları seçip nesting ribbon
    // tuşuna basınca da aynı işlevi çalıştır". Reçete Ağacı'ndaki "Nesting
    // Yap" ile ribbon'daki seçim tabanlı nesting AYNI kodu kullanır: plaka
    // boyutu sor → klasör sor → her malzeme grubu için geometriden girdi
    // oluştur → yerleştir → SolidWorks'te plaka parçası oluştur → rapor.
    // ════════════════════════════════════════════════════════════════════════
    public static class NestingCalistirici
    {
        private const double VarsayilanFrezeKayipPayiMM = 3;
        private const double VarsayilanKenarBosluguMM = 10;

        // Dönüş: (oluşturulan dosya sayısı, plaka sayısı); kullanıcı
        // vazgeçtiyse (0, 0).
        // varsayilanKesimPayi/varsayilanKenarBosluk: ÜretimOS'tan gelen
        // değerler — yalnızca pencerede ilk öneri olarak kullanılır, asıl
        // değerler kullanıcının pencerede onayladıklarıdır.
        public static (int dosya, int plaka) Calistir(ISldWorks app, IWin32Window sahip, string kod,
            Dictionary<string, List<NestingParcaKaynagi>> gruplar, double varsayilanKesimPayi, double varsayilanKenarBosluk)
        {
            if (gruplar == null || gruplar.Values.All(l => l.Count == 0))
            {
                MessageBox.Show(sahip, "Nesting'e girecek parça yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return (0, 0);
            }

            // Geometri ayar penceresinden ÖNCE çıkarılır — pencere her parçayı
            // En/Boy/Kalınlık ile listeleyip parça başına yön sorabilsin.
            var grupGirdileri = new List<(string grup, List<NestingParcaGirdi> girdiler, List<string> atlananlar)>();
            foreach (var grup in gruplar)
            {
                if (grup.Value.Count == 0) continue;
                var (girdiler, atlananlar) = GirdileriOlustur(grup.Value);
                foreach (var g in girdiler) g.Grup = grup.Key;
                grupGirdileri.Add((grup.Key, girdiler, atlananlar));
            }

            if (!NestingAyarlariSor(sahip, varsayilanKesimPayi, varsayilanKenarBosluk, null, null,
                grupGirdileri.SelectMany(g => g.girdiler).ToList(), out var ayar)) return (0, 0);
            double plakaBoy = ayar.PlakaBoyMm, plakaEn = ayar.PlakaEnMm;
            double kesimPayi = ayar.BicakMesafesiMm, kenarBosluk = ayar.KenarBoslukMm;

            string cikisKlasoru;
            using (var klasorDlg = new FolderBrowserDialog { Description = "Nesting sonucu parça dosyalarının kaydedileceği klasör" })
            {
                if (klasorDlg.ShowDialog(sahip) != DialogResult.OK) return (0, 0);
                cikisKlasoru = klasorDlg.SelectedPath;
            }

            string partSablon = UretimOSAddin.SablonYoluBul(app, "Part.prtdot", UretimOSAddin.PART_SABLON_YOLU);
            if (!File.Exists(partSablon))
            {
                MessageBox.Show(sahip, "Parça şablonu bulunamadı:\n" + partSablon +
                    "\n\nBu, SolidWorks'ün kendi stok şablonudur — normalde 'Sistem Seçenekleri > Dosya " +
                    "Konumları > Belge Şablonları' klasöründe hazır bulunur.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return (0, 0);
            }
            if (string.IsNullOrWhiteSpace(kod)) kod = "NESTING";

            var olusturucu = new NestingYerlesimOlusturucu(app);
            var rapor = new List<string>();
            int toplamDosya = 0, toplamPlaka = 0;

            foreach (var (grupAdi, parcaGirdileri, atlananlar) in grupGirdileri)
            {
                if (atlananlar.Count > 0)
                    rapor.Add("'" + grupAdi + "' grubunda ATLANAN parçalar: " + string.Join(", ", atlananlar));
                if (parcaGirdileri.Count == 0) continue;

                var sonuc = NestingHesaplayici.Hesapla(plakaEn, plakaBoy, kenarBosluk, kesimPayi, parcaGirdileri, ayar.GrainYonuneUy, ayar.EtkinSabitAci);
                if (sonuc.Plakalar.Count == 0)
                {
                    rapor.Add("'" + grupAdi + "' grubu: hiçbir parça yerleştirilemedi — " + string.Join(" ", sonuc.YerlesemeyenUyarilari));
                    continue;
                }

                string grupDosyaKodu = kod + "_" + GuvenliDosyaAdi(grupAdi);
                var dosyalar = olusturucu.Olustur(sonuc, plakaEn, plakaBoy, grupDosyaKodu, cikisKlasoru, partSablon);
                toplamDosya += dosyalar.Count;
                toplamPlaka += sonuc.Plakalar.Count;
                rapor.Add("'" + grupAdi + "': " + sonuc.Plakalar.Count + " plaka, " + dosyalar.Count + " dosya " +
                    $"(kenar boşluğu {kenarBosluk:0.#} mm, bıçak mesafesi {kesimPayi:0.#} mm, {ayar.YonlendirmeAciklamasi}).");
                if (sonuc.YerlesemeyenUyarilari.Count > 0)
                    rapor.Add("    UYARI: " + string.Join(" ", sonuc.YerlesemeyenUyarilari));
                if (olusturucu.Uyarilar.Count > 0)
                    rapor.Add("    UYARI: " + string.Join(" ", olusturucu.Uyarilar));
            }

            MessageBox.Show(sahip, string.Join("\r\n", rapor) +
                "\r\n\r\nDXF almak için: açılan her parçada sketch'i düzenleme moduna girip Dosya > Farklı Kaydet'te DXF/DWG seçin.",
                "ÜretimOS", MessageBoxButtons.OK, toplamDosya > 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            return (toplamDosya, toplamPlaka);
        }

        // Geometrisi okunamayan parça anma ölçüsüne GERİ DÜŞMEZ — atlanır.
        private static (List<NestingParcaGirdi> girdiler, List<string> atlananlar) GirdileriOlustur(List<NestingParcaKaynagi> parcalar)
        {
            var girdiler = new List<NestingParcaGirdi>();
            var atlananlar = new List<string>();
            foreach (var p in parcalar)
            {
                if (p.Model == null)
                {
                    Tanilama.Kaydet($"Nesting girdisi '{p.Ad}': SolidWorks modeli yok — atlandı");
                    atlananlar.Add(p.Ad + " (SolidWorks parçası yok)");
                    continue;
                }
                var geometri = p.Geometri ?? DelikFormCikarici.GeometriCikar(p.Model, p.KalinlikMm);
                string swAdi = Path.GetFileNameWithoutExtension(p.Model.GetPathName() ?? "");
                if (geometri.GenislikMm <= 0 || geometri.YukseklikMm <= 0)
                {
                    Tanilama.Kaydet($"Nesting girdisi '{p.Ad}' ({swAdi}): geometri okunamadı — atlandı");
                    atlananlar.Add(p.Ad + " (parça geometrisi okunamadı)");
                    continue;
                }
                var girdi = new NestingParcaGirdi
                {
                    Ad = p.Ad,
                    En = geometri.GenislikMm,
                    Boy = geometri.YukseklikMm,
                    KalinlikMm = geometri.KalinlikMm > 0 ? geometri.KalinlikMm : p.KalinlikMm,
                    Adet = Math.Max(1, p.Adet),
                    GrainKilitli = !string.IsNullOrWhiteSpace(KesimListesiCikarici.OzelAlanOku(p.Model, OzelAlanlar.TAHIL_YONU)),
                    YmKod = p.YmKod ?? "",
                    SwParcaAdi = swAdi,
                    Delikler = geometri.NestingDelikleri(),
                    Formlar = geometri.NestingFormlari(),
                    DisHat = geometri.NestingDisHatti()
                };
                Tanilama.Kaydet($"Nesting girdisi '{girdi.Ad}' ({swAdi}): geometri={girdi.En}x{girdi.Boy}, kalınlık={geometri.KalinlikMm}, adet={girdi.Adet} | " +
                    $"dishat={girdi.DisHat.Count} nokta, delik={girdi.Delikler.Count}/{geometri.Delikler.Count} (yuzeye dik/toplam), form={girdi.Formlar.Count}");
                girdiler.Add(girdi);
            }
            return (girdiler, atlananlar);
        }

        public static string GuvenliDosyaAdi(string metin)
        {
            foreach (char c in Path.GetInvalidFileNameChars()) metin = metin.Replace(c, '_');
            return metin.Replace(" ", "_");
        }

        // Kullanıcı isteği: "kenar mesafelerini ve freze bıçak mesafelerini
        // (iki parça arası) ayarlamak için nesting modülüne eklemeler yap" —
        // plaka boyutu penceresi artık kenar boşluğu ve iki parça arası freze
        // bıçak mesafesini de sorar. İlk açılışta ÜretimOS ayarlarından gelen
        // değerler (varsayilanKesimPayi/varsayilanKenarBosluk) gösterilir;
        // kullanıcının girdiği değerler NestingAyarlari ile yerel olarak
        // saklanıp bir sonraki nesting'de hazır gelir.
        public static bool NestingAyarlariSor(IWin32Window sahip, double varsayilanKesimPayi, double varsayilanKenarBosluk,
            double? onerilenBoy, double? onerilenEn, IList<NestingParcaGirdi> parcalar, out NestingAyarlari sonuc)
        {
            var kayitli = NestingAyarlari.Yukle();
            sonuc = null;
            NestingAyarlari secilen = null;
            bool listeVar = parcalar != null && parcalar.Count > 0;

            // KULLANICI RAPORU (ekran görüntüsü): etiketler ve Tamam/Vazgeç
            // düğmeleri kesiliyordu — pencere büyütüldü, boyutlandırılabilir
            // yapıldı, düğmeler sağa sabitlendi.
            using (var dlg = new Form
            {
                Text = "Nesting Ayarları", Width = listeVar ? 1050 : 560, Height = listeVar ? 780 : 470,
                MinimumSize = new Size(560, 470), FormBorderStyle = FormBorderStyle.Sizable,
                StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = listeVar, Font = ReceteAgaciPaneli.Tema.TabanFont
            })
            {
                var tablo = new TableLayoutPanel
                {
                    Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink,
                    ColumnCount = 2, Padding = new Padding(10, 10, 10, 0)
                };
                tablo.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 360));
                tablo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

                NumericUpDown Sayi(decimal deger, int ondalik) => new NumericUpDown
                {
                    Maximum = 10000, Minimum = 0, DecimalPlaces = ondalik, Width = 90,
                    Increment = ondalik > 0 ? 0.5m : 1m, Value = Math.Max(0, Math.Min(10000, deger))
                };
                void Satir(string etiket, Control kontrol)
                {
                    tablo.RowCount++;
                    tablo.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
                    tablo.Controls.Add(new Label { Text = etiket, AutoSize = true, Margin = new Padding(0, 7, 6, 0) });
                    tablo.Controls.Add(kontrol);
                }

                var hazirPanel = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
                var btn3660 = new Button { Text = "3660×1830", Width = 90, Height = 26 };
                var btn2800 = new Button { Text = "2800×2100", Width = 90, Height = 26 };
                hazirPanel.Controls.Add(btn3660);
                hazirPanel.Controls.Add(btn2800);

                double ilkBoy = onerilenBoy ?? kayitli?.PlakaBoyMm ?? 0;
                double ilkEn = onerilenEn ?? kayitli?.PlakaEnMm ?? 0;
                var boyKutu = Sayi((decimal)ilkBoy, 0);
                var enKutu = Sayi((decimal)ilkEn, 0);
                var kenarKutu = Sayi((decimal)(kayitli?.KenarBoslukMm ?? varsayilanKenarBosluk), 1);
                var bicakKutu = Sayi((decimal)(kayitli?.BicakMesafesiMm ?? varsayilanKesimPayi), 1);

                Satir("Hazır plaka boyutu:", hazirPanel);
                Satir("Plaka Boy (mm):", boyKutu);
                Satir("Plaka En (mm):", enKutu);
                Satir("Kenar boşluğu — plaka kenarından (mm):", kenarKutu);
                Satir("Freze bıçak mesafesi — iki parça arası (mm):", bicakKutu);

                // Kullanıcı isteği: "grain kutucuğu işaretli olduğunda parçanın
                // boy tarafı plakanın boy tarafına hizalı olsun, işaret
                // kaldırıldığında her türlü açı ve yerleşim; birde açı girilsin,
                // bunu aktif etmek için bir kutucuk daha olsun".
                var grainKutu = new CheckBox { Text = "parça boyu → plaka boyu", AutoSize = true, Margin = new Padding(0, 6, 0, 0), Checked = kayitli?.GrainYonuneUy ?? true };
                var aciAktifKutu = new CheckBox { Text = "", AutoSize = true, Margin = new Padding(0, 6, 4, 0), Checked = kayitli?.SabitAciKullan ?? false };
                var aciKutu = new NumericUpDown
                {
                    Minimum = -180, Maximum = 180, DecimalPlaces = 1, Increment = 1m, Width = 70,
                    Value = (decimal)Math.Max(-180, Math.Min(180, kayitli?.SabitAciDerece ?? 0))
                };
                var aciPanel = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
                aciPanel.Controls.Add(aciAktifKutu);
                aciPanel.Controls.Add(aciKutu);
                aciPanel.Controls.Add(new Label { Text = "°", AutoSize = true, Margin = new Padding(2, 7, 0, 0) });
                void YonKutulariniGuncelle()
                {
                    // Sabit açı Grain'den önceliklidir — açık iken Grain pasif.
                    aciKutu.Enabled = aciAktifKutu.Checked;
                    grainKutu.Enabled = !aciAktifKutu.Checked;
                }
                aciAktifKutu.CheckedChanged += (s, e) => YonKutulariniGuncelle();
                YonKutulariniGuncelle();

                Satir(listeVar ? "Grain yönüne uy (tüm parçalar):" : "Grain yönüne uy:", grainKutu);
                Satir(listeVar ? "Sabit açı kullan — tüm parçalar (saat yönü tersi +):" : "Sabit açı kullan (saat yönü tersi +):", aciPanel);

                // Kullanıcı isteği: "seçilen her parçayı nesting ayarlarında
                // listele ... parça - en - boy - kalınlık ölçüsü olsun, her
                // satırda grain yönüne uy kutucuğu ve sabit açı kullan kutucuğu".
                // Üstteki genel kutucuklar değişince tüm satırlara uygulanır;
                // satırda yapılan değişiklik yalnızca o parçayı etkiler.
                DataGridView grid = null;
                GroupBox gridKutu = null;
                if (listeVar)
                {
                    grid = new DataGridView
                    {
                        Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false,
                        RowHeadersVisible = false, SelectionMode = DataGridViewSelectionMode.CellSelect, MultiSelect = false,
                        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = SystemColors.Window,
                        EditMode = DataGridViewEditMode.EditOnEnter
                    };
                    DataGridViewTextBoxColumn Metin(string ad, string baslik, float agirlik, bool sayi)
                    {
                        var k = new DataGridViewTextBoxColumn { Name = ad, HeaderText = baslik, ReadOnly = true, FillWeight = agirlik, SortMode = DataGridViewColumnSortMode.NotSortable };
                        if (sayi) k.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
                        return k;
                    }
                    grid.Columns.Add(Metin("grup", "Malzeme", 90, false));
                    grid.Columns.Add(Metin("parca", "Parça", 220, false));
                    grid.Columns.Add(Metin("adet", "Adet", 40, true));
                    grid.Columns.Add(Metin("en", "En (mm)", 55, true));
                    grid.Columns.Add(Metin("boy", "Boy (mm)", 55, true));
                    grid.Columns.Add(Metin("kalinlik", "Kalınlık (mm)", 60, true));
                    grid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "grain", HeaderText = "Grain yönüne uy", FillWeight = 60, SortMode = DataGridViewColumnSortMode.NotSortable });
                    grid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "sabit", HeaderText = "Sabit açı kullan", FillWeight = 60, SortMode = DataGridViewColumnSortMode.NotSortable });
                    var aciKolon = Metin("aci", "Açı (°)", 45, true);
                    aciKolon.ReadOnly = false;
                    grid.Columns.Add(aciKolon);
                    grid.Columns["grup"].Visible = parcalar.Any(p => !string.IsNullOrEmpty(p.Grup));

                    foreach (var p in parcalar)
                    {
                        bool grain = !p.GrainKilitli && (p.GrainYonuneUy ?? grainKutu.Checked);
                        bool sabit = !p.GrainKilitli && (p.SabitAciKullan ?? aciAktifKutu.Checked);
                        double aci = p.SabitAciKullan.HasValue ? p.SabitAciDerece : (double)aciKutu.Value;
                        int r = grid.Rows.Add(p.Grup ?? "", p.Ad + (p.GrainKilitli ? "  (desen yönü kilitli — döndürülmez)" : ""),
                            Math.Max(1, p.Adet), p.En.ToString("0.#"), p.Boy.ToString("0.#"),
                            p.KalinlikMm > 0 ? p.KalinlikMm.ToString("0.#") : "—", grain, sabit, aci.ToString("0.#"));
                        grid.Rows[r].Tag = p;
                    }

                    void SatirDurumu(DataGridViewRow satir)
                    {
                        var p = (NestingParcaGirdi)satir.Tag;
                        bool sabit = satir.Cells["sabit"].Value is bool b && b;
                        void Ayarla(string kolon, bool saltOkunur)
                        {
                            var hucre = satir.Cells[kolon];
                            hucre.ReadOnly = saltOkunur;
                            hucre.Style.BackColor = saltOkunur ? Color.Gainsboro : SystemColors.Window;
                            hucre.Style.ForeColor = saltOkunur ? Color.Gray : SystemColors.ControlText;
                        }
                        // Sabit açı satırda da Grain'den önceliklidir.
                        Ayarla("grain", p.GrainKilitli || sabit);
                        Ayarla("sabit", p.GrainKilitli);
                        Ayarla("aci", p.GrainKilitli || !sabit);
                    }
                    foreach (DataGridViewRow satir in grid.Rows) SatirDurumu(satir);

                    grid.CurrentCellDirtyStateChanged += (s, e) =>
                    {
                        if (grid.IsCurrentCellDirty && grid.CurrentCell is DataGridViewCheckBoxCell)
                            grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
                    };
                    grid.CellValueChanged += (s, e) => { if (e.RowIndex >= 0) SatirDurumu(grid.Rows[e.RowIndex]); };

                    void TumSatirlara(string kolon, object deger)
                    {
                        grid.EndEdit();
                        foreach (DataGridViewRow satir in grid.Rows)
                            if (!((NestingParcaGirdi)satir.Tag).GrainKilitli) satir.Cells[kolon].Value = deger;
                    }
                    grainKutu.CheckedChanged += (s, e) => TumSatirlara("grain", grainKutu.Checked);
                    aciAktifKutu.CheckedChanged += (s, e) => TumSatirlara("sabit", aciAktifKutu.Checked);
                    aciKutu.ValueChanged += (s, e) => TumSatirlara("aci", aciKutu.Value.ToString("0.#"));

                    gridKutu = new GroupBox { Text = $"Seçilen parçalar ({parcalar.Count})", Dock = DockStyle.Fill, Padding = new Padding(8) };
                    gridKutu.Controls.Add(grid);
                }

                var ipucu = new Label
                {
                    Text = $"ÜretimOS varsayılanı: kenar {varsayilanKenarBosluk:0.#} mm, bıçak {varsayilanKesimPayi:0.#} mm. " +
                           "Girdiğiniz değerler bir sonraki nesting için hatırlanır. Parçada desen yönü " +
                           "(URETIMOS_TAHIL_YONU) tanımlıysa o parça her modda döndürülmeden yerleşir.",
                    Dock = DockStyle.Bottom, Height = 52, Padding = new Padding(10, 4, 10, 0), ForeColor = Color.DimGray
                };

                var altBtnPanel = new Panel { Dock = DockStyle.Bottom, Height = 48, Width = dlg.ClientSize.Width };
                var varsayilanBtn = new Button { Text = "ÜretimOS Varsayılanı", AutoSize = true, MinimumSize = new Size(170, 32), Left = 10, Top = 8, Anchor = AnchorStyles.Left | AnchorStyles.Top };
                var tamamBtn = new Button { Text = "Tamam", AutoSize = true, MinimumSize = new Size(110, 32), Top = 8, Anchor = AnchorStyles.Right | AnchorStyles.Top };
                ReceteAgaciPaneli.Tema.BirincilButon(tamamBtn);
                var vazgecBtn = new Button { Text = "Vazgeç", AutoSize = true, MinimumSize = new Size(110, 32), Top = 8, Anchor = AnchorStyles.Right | AnchorStyles.Top };
                ReceteAgaciPaneli.Tema.IkincilButon(vazgecBtn);
                vazgecBtn.Left = altBtnPanel.Width - 12 - vazgecBtn.MinimumSize.Width;
                tamamBtn.Left = vazgecBtn.Left - 8 - tamamBtn.MinimumSize.Width;
                altBtnPanel.Controls.Add(varsayilanBtn);
                altBtnPanel.Controls.Add(tamamBtn);
                altBtnPanel.Controls.Add(vazgecBtn);

                btn3660.Click += (s, e) => { boyKutu.Value = 3660; enKutu.Value = 1830; };
                btn2800.Click += (s, e) => { boyKutu.Value = 2800; enKutu.Value = 2100; };
                varsayilanBtn.Click += (s, e) =>
                {
                    kenarKutu.Value = (decimal)varsayilanKenarBosluk;
                    bicakKutu.Value = (decimal)varsayilanKesimPayi;
                };
                tamamBtn.Click += (s, e) =>
                {
                    double boy = (double)boyKutu.Value, en = (double)enKutu.Value, kenar = (double)kenarKutu.Value;
                    if (boy <= 0 || en <= 0)
                    {
                        MessageBox.Show(dlg, "Geçerli bir plaka boy/en girin (hazır bir boyut seçin veya elle girin).", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    if (2 * kenar >= Math.Min(boy, en))
                    {
                        MessageBox.Show(dlg, "Kenar boşluğu plakaya göre çok büyük — plakada yerleşim alanı kalmıyor.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    if (grid != null)
                    {
                        grid.EndEdit();
                        var satirAyarlari = new List<(NestingParcaGirdi p, bool grain, bool sabit, double aci)>();
                        foreach (DataGridViewRow satir in grid.Rows)
                        {
                            var p = (NestingParcaGirdi)satir.Tag;
                            bool sabit = satir.Cells["sabit"].Value is bool b1 && b1;
                            bool grain = satir.Cells["grain"].Value is bool b2 && b2;
                            string aciMetni = Convert.ToString(satir.Cells["aci"].Value ?? "0").Trim().Replace(',', '.');
                            if (!double.TryParse(aciMetni, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double aci)
                                || aci < -180 || aci > 180)
                            {
                                if (!sabit || p.GrainKilitli) aci = 0;
                                else
                                {
                                    MessageBox.Show(dlg, $"'{p.Ad}' için açı -180 ile 180 arasında bir sayı olmalı.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                                    grid.CurrentCell = satir.Cells["aci"];
                                    return;
                                }
                            }
                            satirAyarlari.Add((p, grain, sabit, aci));
                        }
                        foreach (var (p, grain, sabit, aci) in satirAyarlari)
                        {
                            p.GrainYonuneUy = grain;
                            p.SabitAciKullan = sabit;
                            p.SabitAciDerece = aci;
                            Tanilama.Kaydet($"Nesting parça yönü '{p.Ad}': {(p.GrainKilitli ? "desen kilitli (0°)" : sabit ? $"sabit açı {aci:0.#}°" : grain ? "grain" : "serbest")}");
                        }
                    }
                    secilen = new NestingAyarlari
                    {
                        PlakaBoyMm = boy, PlakaEnMm = en,
                        KenarBoslukMm = kenar, BicakMesafesiMm = (double)bicakKutu.Value,
                        GrainYonuneUy = grainKutu.Checked,
                        SabitAciKullan = aciAktifKutu.Checked,
                        SabitAciDerece = (double)aciKutu.Value
                    };
                    dlg.DialogResult = DialogResult.OK;
                };
                vazgecBtn.Click += (s, e) => dlg.DialogResult = DialogResult.Cancel;

                // Dock sırası: SON eklenen ÖNCE yerleşir — alt panel, ipucu ve
                // üst tablo kenarlara oturur, parça listesi kalan alanı doldurur.
                if (gridKutu != null) dlg.Controls.Add(gridKutu);
                dlg.Controls.Add(tablo);
                dlg.Controls.Add(ipucu);
                dlg.Controls.Add(altBtnPanel);
                dlg.AcceptButton = tamamBtn;
                dlg.CancelButton = vazgecBtn;
                dlg.ShowDialog(sahip);
            }

            if (secilen == null) return false;
            secilen.Kaydet();
            Tanilama.Kaydet($"Nesting ayarları: plaka {secilen.PlakaBoyMm}x{secilen.PlakaEnMm}, kenar {secilen.KenarBoslukMm} mm, bıçak {secilen.BicakMesafesiMm} mm, yön: {secilen.YonlendirmeAciklamasi}");
            sonuc = secilen;
            return true;
        }

        // page_nesting.js'teki kesimPayiHesapla'nın (CNC/Flat-Tabla/freze dalı)
        // AYNI mantıkla C# portu: önce ÜretimOS'taki varsayılan freze takımının
        // çapı, o seçili değilse ayarlar.frezeKayipPayiMM, O DA yoksa (sunucuya
        // hiç bağlanılamadıysa) data.js'teki VARSAYILAN_AYARLAR sabiti.
        public static (double kesimPayi, double kenarBosluk) KesimPayiVeKenarBoslugu(JObject ayarlar, JArray cncTakimlari)
        {
            double kenarBosluk = (double?)ayarlar?["plakaKenarBosluguMM"] ?? VarsayilanKenarBosluguMM;

            string frezeTakimId = (string)ayarlar?["varsayilanFrezeTakimId"];
            JObject takim = !string.IsNullOrEmpty(frezeTakimId)
                ? cncTakimlari?.OfType<JObject>().FirstOrDefault(k => (string)k["id"] == frezeTakimId)
                : null;
            double kesimPayi = (takim != null && (double?)takim["capMm"] > 0)
                ? (double)takim["capMm"]
                : ((double?)ayarlar?["frezeKayipPayiMM"] ?? VarsayilanFrezeKayipPayiMM);

            return (kesimPayi, kenarBosluk);
        }

        // Ribbon yolu için: ÜretimOS'tan ayarlar + CNC takımlarını SENKRON
        // çeker (await devamının yanlış iş parçacığında çalışma riskine — bkz.
        // ReceteAgaciPaneli.AnaPencerede — HİÇ girmemek için ağ çağrısı
        // Task.Run içinde, sonuç burada beklenir). Bağlanılamazsa (null, null)
        // döner ve KesimPayiVeKenarBoslugu varsayılanlara düşer.
        public static (JObject ayarlar, JArray cncTakimlari) AyarlariCek()
        {
            try
            {
                var ayar = BaglantiAyarlari.Yukle();
                if (ayar == null) return (null, null);
                var gorev = System.Threading.Tasks.Task.Run(async () =>
                {
                    var istemci = new UretimOSApiClient(ayar.SunucuUrl);
                    if (!await istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre).ConfigureAwait(false)) return ((JObject)null, (JArray)null);
                    var ayarlar = JObject.Parse(await istemci.Getir("ayarlar").ConfigureAwait(false) ?? "{}");
                    var takimlar = JArray.Parse(await istemci.Getir("cncTakimlari").ConfigureAwait(false) ?? "[]");
                    return (ayarlar, takimlar);
                });
                if (!gorev.Wait(TimeSpan.FromSeconds(15)))
                {
                    Tanilama.Kaydet("NestingCalistirici.AyarlariCek: zaman aşımı — varsayılan kesim payı/kenar boşluğu kullanılacak");
                    return (null, null);
                }
                return gorev.Result;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("NestingCalistirici.AyarlariCek HATA (varsayılanlar kullanılacak): " + ex.Message);
                return (null, null);
            }
        }
    }
}
