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
        public static (int dosya, int plaka) Calistir(ISldWorks app, IWin32Window sahip, string kod,
            Dictionary<string, List<NestingParcaKaynagi>> gruplar, double kesimPayi, double kenarBosluk)
        {
            if (gruplar == null || gruplar.Values.All(l => l.Count == 0))
            {
                MessageBox.Show(sahip, "Nesting'e girecek parça yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return (0, 0);
            }

            if (!PlakaBoyutuSor(sahip, out double plakaBoy, out double plakaEn)) return (0, 0);

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

            foreach (var grup in gruplar)
            {
                if (grup.Value.Count == 0) continue;
                var (parcaGirdileri, atlananlar) = GirdileriOlustur(grup.Value);
                if (atlananlar.Count > 0)
                    rapor.Add("'" + grup.Key + "' grubunda ATLANAN parçalar: " + string.Join(", ", atlananlar));
                if (parcaGirdileri.Count == 0) continue;

                var sonuc = NestingHesaplayici.Hesapla(plakaEn, plakaBoy, kenarBosluk, kesimPayi, parcaGirdileri);
                if (sonuc.Plakalar.Count == 0)
                {
                    rapor.Add("'" + grup.Key + "' grubu: hiçbir parça yerleştirilemedi — " + string.Join(" ", sonuc.YerlesemeyenUyarilari));
                    continue;
                }

                string grupDosyaKodu = kod + "_" + GuvenliDosyaAdi(grup.Key);
                var dosyalar = olusturucu.Olustur(sonuc, plakaEn, plakaBoy, grupDosyaKodu, cikisKlasoru, partSablon);
                toplamDosya += dosyalar.Count;
                toplamPlaka += sonuc.Plakalar.Count;
                rapor.Add("'" + grup.Key + "': " + sonuc.Plakalar.Count + " plaka, " + dosyalar.Count + " dosya.");
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

        // Basit modal: hazır 2 boyut butonu + manuel Boy×En — NestingGonderPaneli.
        // PlakaBoyutuSec'teki AYNI iki hazır ölçü (kullanıcı isteği: "3660x1830
        // ya da 2800x2100 ölçüsünde plakaya yada manuel giriş yapılarak").
        public static bool PlakaBoyutuSor(IWin32Window sahip, out double boy, out double en)
        {
            double sonucBoy = 0, sonucEn = 0;
            bool tamam = false;
            using (var dlg = new Form
            {
                Text = "Plaka Boyutu", Width = 420, Height = 200, FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false, Font = ReceteAgaciPaneli.Tema.TabanFont
            })
            {
                var ustEtiket = new Label { Text = "Nesting için plaka boyutu seçin:", Dock = DockStyle.Top, Height = 28, Padding = new Padding(10, 8, 10, 0) };
                var hazirPanel = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 40, Padding = new Padding(10, 4, 10, 0), WrapContents = false };
                var btn3660 = new Button { Text = "3660×1830 mm", Width = 130, Height = 28 };
                var btn2800 = new Button { Text = "2800×2100 mm", Width = 130, Height = 28 };
                hazirPanel.Controls.Add(btn3660);
                hazirPanel.Controls.Add(btn2800);

                var manuelPanel = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 36, Padding = new Padding(10, 4, 10, 0), WrapContents = false };
                manuelPanel.Controls.Add(new Label { Text = "Manuel Boy×En (mm):", AutoSize = true, Margin = new Padding(0, 6, 4, 0) });
                var boyKutu = new NumericUpDown { Maximum = 10000, Minimum = 0, DecimalPlaces = 0, Width = 70 };
                var enKutu = new NumericUpDown { Maximum = 10000, Minimum = 0, DecimalPlaces = 0, Width = 70, Margin = new Padding(4, 0, 0, 0) };
                manuelPanel.Controls.Add(boyKutu);
                manuelPanel.Controls.Add(new Label { Text = "×", AutoSize = true, Margin = new Padding(2, 6, 2, 0) });
                manuelPanel.Controls.Add(enKutu);

                var altBtnPanel = new Panel { Dock = DockStyle.Bottom, Height = 44 };
                var tamamBtn = new Button { Text = "Tamam", Width = 90, Height = 30, Left = 220, Top = 7 };
                ReceteAgaciPaneli.Tema.BirincilButon(tamamBtn);
                var vazgecBtn = new Button { Text = "Vazgeç", Width = 90, Height = 30, Left = 320, Top = 7 };
                ReceteAgaciPaneli.Tema.IkincilButon(vazgecBtn);
                altBtnPanel.Controls.Add(tamamBtn);
                altBtnPanel.Controls.Add(vazgecBtn);

                btn3660.Click += (s, e) => { boyKutu.Value = 3660; enKutu.Value = 1830; };
                btn2800.Click += (s, e) => { boyKutu.Value = 2800; enKutu.Value = 2100; };
                tamamBtn.Click += (s, e) =>
                {
                    if (boyKutu.Value <= 0 || enKutu.Value <= 0)
                    {
                        MessageBox.Show("Geçerli bir boy/en girin (hazır bir boyut seçin veya manuel girin).", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    sonucBoy = (double)boyKutu.Value; sonucEn = (double)enKutu.Value; tamam = true;
                    dlg.DialogResult = DialogResult.OK;
                };
                vazgecBtn.Click += (s, e) => dlg.DialogResult = DialogResult.Cancel;

                dlg.Controls.Add(manuelPanel);
                dlg.Controls.Add(hazirPanel);
                dlg.Controls.Add(ustEtiket);
                dlg.Controls.Add(altBtnPanel);
                dlg.AcceptButton = tamamBtn;
                dlg.CancelButton = vazgecBtn;
                dlg.ShowDialog(sahip);
            }
            boy = sonucBoy; en = sonucEn;
            return tamam;
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
