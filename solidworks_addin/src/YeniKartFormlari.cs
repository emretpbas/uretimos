using System;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json.Linq;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // YENİ KART OLUŞTURMA — kullanıcı isteği: "Sıfırdan bir ürün için TÜM alt
    // kartları (hammadde, plaka, kenar bandı, hırdavat, sarf malzemesi vb.)
    // da SolidWorks içinden, panel açıkken oluşturabilme özelliği istiyorum."
    //
    // Alan listeleri ÜretimOS'un KENDİ web formlarından (page_hammadde.js
    // openForm/save, page_yarimamul.js openForm/save, page_kartlar.js
    // openAltMontajForm/openPaketForm) BİREBİR alındı — TAHMİN EDİLMEDİ,
    // gerçek kaynak koddan çıkarıldı. Yeni kart, ÜretimOS'un action=patch
    // ucuna (mevcut UretimOSApiClient.ToplukaEkleGuncelle üzerinden) AYNI
    // şekle sahip bir nesne olarak gönderilir; sunucu id'ye göre birleştirme
    // yaptığı için 'ekle' listesine koymak yeterli (bkz. api.php action=patch).
    //
    // ═══ ROL/YETKİ UYARISI (ÖNEMLİ) ═══════════════════════════════════════
    // api.php'deki CAD_ENT_YAZILABILIR beyaz listesi yalnızca
    // yarimamuller/paketler/urunler/receteler/rotalar içeriyor —
    // hammaddeler VE altMontajlar dahil DEĞİL. Yani baglanti.json'daki
    // hesap "cad_entegrasyon" rolündeyse, Plaka/Kenar Bandı/Hırdavat/Alt
    // Montaj kartı oluşturma sunucudan 403 ile reddedilir (Yarı Mamül ve
    // Paket her zaman çalışır). Tam yetkili (örn. "yonetim") bir hesapla
    // veya CAD_ENT_YAZILABILIR sunucu tarafında genişletilerek çözülür —
    // bu dosya bunu TESPİT EDER ve kullanıcıya açık Türkçe hata gösterir,
    // sessizce başarısız OLMAZ.
    // ════════════════════════════════════════════════════════════════════════
    public class YeniKartDialog : Form
    {
        // "plaka" | "kenar_bandi" | "hirdavat" | "yarimamul" | "altmontaj" | "paket"
        private readonly string _kartTipi;
        private readonly JArray _hammaddelerListesi; // yarımamül için "hammadde ata" alanı

        public JObject SonucKart { get; private set; }

        private TextBox _kodKutusu, _adKutusu;

        public YeniKartDialog(string kartTipi, JArray hammaddelerListesi)
        {
            _kartTipi = kartTipi;
            _hammaddelerListesi = hammaddelerListesi ?? new JArray();
            KurulumYap();
        }

        private static double Cift(TextBox t, double varsayilan = 0) =>
            double.TryParse((t.Text ?? "").Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out double v) ? v : varsayilan;

        private static int Tam(TextBox t, int varsayilan = 0) =>
            int.TryParse((t.Text ?? "").Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out int v) ? v : varsayilan;

        // ÜretimOS'un kendi App.uid(prefix) ile AYNI amaçla — TAM aynı bit
        // deseni gerekmiyor, yalnızca çakışmasız ve ön ekli benzersiz bir id.
        private static string YeniId(string onEk)
        {
            long zaman = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string rastgele = Guid.NewGuid().ToString("N").Substring(0, 8);
            return $"{onEk}-{Base36(zaman)}{rastgele}";
        }

        private static string Base36(long deger)
        {
            const string basamaklar = "0123456789abcdefghijklmnopqrstuvwxyz";
            if (deger <= 0) return "0";
            var sb = new System.Text.StringBuilder();
            while (deger > 0) { sb.Insert(0, basamaklar[(int)(deger % 36)]); deger /= 36; }
            return sb.ToString();
        }

        private static string BaslikYaz(string kartTipi)
        {
            switch (kartTipi)
            {
                case "plaka": return "Yeni Plaka (Hammadde)";
                case "kenar_bandi": return "Yeni Kenar Bandı (Hammadde)";
                case "hirdavat": return "Yeni Hırdavat (Hammadde)";
                case "yarimamul": return "Yeni Yarı Mamül";
                case "altmontaj": return "Yeni Alt Montaj";
                case "paket": return "Yeni Paket";
                default: return "Yeni Kart";
            }
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — " + BaslikYaz(_kartTipi);
            Width = 560;
            Height = 620;
            StartPosition = FormStartPosition.CenterParent;
            MinimizeBox = false;
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;

            var ana = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                Padding = new Padding(14),
                AutoScroll = true
            };
            ana.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
            ana.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 62));

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

            bool hammaddeAilesi = _kartTipi == "plaka" || _kartTipi == "kenar_bandi" || _kartTipi == "hirdavat";

            // ── ORTAK: kod/stokKodu + ad ────────────────────────────────────
            _kodKutusu = new TextBox();
            Satir(hammaddeAilesi ? "Stok Kodu" : "Kod *", _kodKutusu);
            _adKutusu = new TextBox();
            Satir("Ad *", _adKutusu);

            // ── HAMMADDE AİLESİ (plaka/kenar_bandi/hirdavat ORTAK alanları) ──
            TextBox kategoriKutusu = null, fireYuzdeKutusu = null, birimFiyatKutusu = null,
                kdvKutusu = null, tedarikSuresiKutusu = null, minSiparisKutusu = null, emniyetStoguKutusu = null;
            ComboBox birimKutusu = null, dvzKutusu = null;
            // plaka'ya özel:
            TextBox enKutusu = null, boyKutusu = null, kalinlikKutusu = null, renkKutusu = null;
            CheckBox tahilYonluKutusu = null;
            // hirdavat'a özel:
            TextBox delikSablonuKutusu = null;

            if (hammaddeAilesi)
            {
                kategoriKutusu = new TextBox { Text = _kartTipi == "plaka" ? "Plaka" : _kartTipi == "kenar_bandi" ? "Kenar Bandı" : "Hırdavat" };
                Satir("Kategori", kategoriKutusu);

                birimKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
                birimKutusu.Items.AddRange(new object[] { "M2", "METRE", "ADET", "KG", "GRAM", "LITRE" });
                birimKutusu.SelectedItem = _kartTipi == "plaka" ? "M2" : _kartTipi == "kenar_bandi" ? "METRE" : "ADET";
                Satir("Birim", birimKutusu);

                if (_kartTipi == "plaka")
                {
                    enKutusu = new TextBox { Text = "1830" };
                    Satir("En (mm)", enKutusu);
                    boyKutusu = new TextBox { Text = "3660" };
                    Satir("Boy (mm)", boyKutusu);
                    kalinlikKutusu = new TextBox();
                    Satir("Kalınlık (mm)", kalinlikKutusu);
                    renkKutusu = new TextBox();
                    Satir("Renk/Desen", renkKutusu);
                    tahilYonluKutusu = new CheckBox { Text = "Yönlü (Grain — tahıl yönü var)" };
                    Satir("", tahilYonluKutusu);
                }

                if (_kartTipi == "hirdavat")
                {
                    delikSablonuKutusu = new TextBox();
                    Satir("Delik Şablonu (x,y,çap; x,y,çap — mm)", delikSablonuKutusu);
                }

                fireYuzdeKutusu = new TextBox { Text = _kartTipi == "plaka" ? "8" : "2" };
                Satir("Fire %", fireYuzdeKutusu);
                birimFiyatKutusu = new TextBox { Text = "0" };
                Satir("Birim Fiyat", birimFiyatKutusu);
                dvzKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
                dvzKutusu.Items.AddRange(new object[] { "TL", "USD", "EUR" });
                dvzKutusu.SelectedItem = "TL";
                Satir("Döviz", dvzKutusu);
                kdvKutusu = new TextBox { Text = "18" };
                Satir("KDV Oranı %", kdvKutusu);
                tedarikSuresiKutusu = new TextBox { Text = "14" };
                Satir("Tedarik Süresi (gün)", tedarikSuresiKutusu);
                minSiparisKutusu = new TextBox { Text = "0" };
                Satir("Min. Sipariş Miktarı", minSiparisKutusu);
                emniyetStoguKutusu = new TextBox { Text = "0" };
                Satir("Emniyet Stoğu", emniyetStoguKutusu);
            }

            // ── YARI MAMÜL ────────────────────────────────────────────────────
            TextBox netBoyKutusu = null, netEnKutusu = null, ymKalinlikKutusu = null,
                kabaBoyKutusu = null, kabaEnKutusu = null, adetKutusu = null, ymRenkKutusu = null,
                referansFiyatKutusu = null, amortismanKutusu = null, gygKutusu = null, aciklamaKutusu = null;
            ComboBox referansDvzKutusu = null, hammaddeKutusu = null;

            if (_kartTipi == "yarimamul")
            {
                netBoyKutusu = new TextBox(); Satir("Net Boy (mm)", netBoyKutusu);
                netEnKutusu = new TextBox(); Satir("Net En (mm)", netEnKutusu);
                ymKalinlikKutusu = new TextBox(); Satir("Kalınlık (mm)", ymKalinlikKutusu);
                kabaBoyKutusu = new TextBox(); Satir("Kaba Boy (mm)", kabaBoyKutusu);
                kabaEnKutusu = new TextBox(); Satir("Kaba En (mm)", kabaEnKutusu);
                adetKutusu = new TextBox { Text = "1" }; Satir("Adet", adetKutusu);
                ymRenkKutusu = new TextBox(); Satir("Renk", ymRenkKutusu);

                hammaddeKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
                hammaddeKutusu.Items.Add("— Seçilmedi —");
                foreach (var h in _hammaddelerListesi.Where(x => (string)x["tip"] == "plaka" || (string)x["tip"] == "hirdavat"))
                    hammaddeKutusu.Items.Add(new HammaddeSecenegi((JObject)h));
                hammaddeKutusu.SelectedIndex = 0;
                Satir("Atanacak Hammadde", hammaddeKutusu);

                referansFiyatKutusu = new TextBox(); Satir("Referans Fiyat (opsiyonel)", referansFiyatKutusu);
                referansDvzKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
                referansDvzKutusu.Items.AddRange(new object[] { "TL", "USD", "EUR" });
                referansDvzKutusu.SelectedItem = "TL";
                Satir("Referans Döviz", referansDvzKutusu);

                var rotaBilgi = new Label { Text = "Rota, kart oluşturulduktan sonra bu panelin\n\"Rota Seç / Oluştur…\" seçeneğiyle atanabilir.", AutoSize = true, ForeColor = Color.DarkSlateGray };
                Satir("", rotaBilgi);
            }

            if (_kartTipi == "yarimamul" || _kartTipi == "altmontaj" || _kartTipi == "paket")
            {
                amortismanKutusu = new TextBox { Text = "0" }; Satir("Amortisman Gideri (₺)", amortismanKutusu);
                gygKutusu = new TextBox { Text = "0" }; Satir("GYG Oranı %", gygKutusu);
            }

            // ── ALT MONTAJ ────────────────────────────────────────────────────
            if (_kartTipi == "altmontaj")
            {
                aciklamaKutusu = new TextBox { Multiline = true, Height = 60 };
                Satir("Açıklama", aciklamaKutusu);
            }

            // ── PAKET ─────────────────────────────────────────────────────────
            ComboBox ambalajTipiKutusu = null;
            TextBox koliIciAdetKutusu = null, pkEnKutusu = null, pkBoyKutusu = null, pkYukseklikKutusu = null,
                netAgirlikKutusu = null, brutAgirlikKutusu = null;

            if (_kartTipi == "paket")
            {
                ambalajTipiKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
                ambalajTipiKutusu.Items.AddRange(new object[] { "Koli", "Kutu", "Esas Kutu", "Ambalaj", "Diğer" });
                ambalajTipiKutusu.SelectedItem = "Koli";
                Satir("Ambalaj Tipi", ambalajTipiKutusu);
                koliIciAdetKutusu = new TextBox { Text = "1" }; Satir("Koli İçi Adet", koliIciAdetKutusu);
                pkEnKutusu = new TextBox { Text = "0" }; Satir("En (cm)", pkEnKutusu);
                pkBoyKutusu = new TextBox { Text = "0" }; Satir("Boy (cm)", pkBoyKutusu);
                pkYukseklikKutusu = new TextBox { Text = "0" }; Satir("Yükseklik (cm)", pkYukseklikKutusu);
                netAgirlikKutusu = new TextBox { Text = "0" }; Satir("Net Ağırlık (kg)", netAgirlikKutusu);
                brutAgirlikKutusu = new TextBox { Text = "0" }; Satir("Brüt Ağırlık (kg)", brutAgirlikKutusu);
                aciklamaKutusu = new TextBox { Multiline = true, Height = 60 };
                Satir("Açıklama", aciklamaKutusu);
            }

            // ── ALT: OK/İptal ─────────────────────────────────────────────────
            var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 44 };
            var tamamBtn = new Button { Text = "Oluştur", DialogResult = DialogResult.None, Width = 100, Dock = DockStyle.Right };
            var iptalBtn = new Button { Text = "İptal", DialogResult = DialogResult.Cancel, Width = 90, Dock = DockStyle.Right };
            altPanel.Controls.Add(tamamBtn);
            altPanel.Controls.Add(iptalBtn);
            CancelButton = iptalBtn;

            tamamBtn.Click += (s, e) =>
            {
                string ad = (_adKutusu.Text ?? "").Trim();
                string kod = (_kodKutusu.Text ?? "").Trim();
                if (string.IsNullOrEmpty(ad))
                {
                    MessageBox.Show("Ad zorunludur.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (!hammaddeAilesi && string.IsNullOrEmpty(kod))
                {
                    MessageBox.Show("Kod zorunludur.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                var kart = new JObject();
                try
                {
                    if (hammaddeAilesi)
                    {
                        kart["id"] = YeniId("HM");
                        kart["tip"] = _kartTipi;
                        kart["kategori"] = (kategoriKutusu.Text ?? "").Trim();
                        kart["stokKodu"] = kod;
                        kart["ad"] = ad;
                        kart["birim"] = birimKutusu.SelectedItem as string ?? "ADET";
                        kart["fireYuzde"] = Cift(fireYuzdeKutusu);
                        kart["tedarikSuresiGun"] = Tam(tedarikSuresiKutusu, 14);
                        kart["minSiparisMiktari"] = Cift(minSiparisKutusu);
                        kart["emniyetStogu"] = Cift(emniyetStoguKutusu);
                        kart["birimFiyat"] = Cift(birimFiyatKutusu);
                        kart["dvz"] = dvzKutusu.SelectedItem as string ?? "TL";
                        kart["nakliyeBirimMaliyeti"] = 0;
                        kart["nakliyeDvz"] = "TL";
                        kart["kdvOraniYuzde"] = Cift(kdvKutusu, 18);
                        kart["grainYonu"] = (_kartTipi == "plaka" && tahilYonluKutusu.Checked) ? "var" : "yok";

                        if (_kartTipi == "plaka")
                        {
                            kart["en"] = Cift(enKutusu);
                            kart["boy"] = Cift(boyKutusu);
                            kart["kalinlik"] = Cift(kalinlikKutusu);
                            kart["renk"] = (renkKutusu.Text ?? "").Trim();
                        }
                        else
                        {
                            kart["en"] = null; kart["boy"] = null; kart["kalinlik"] = null; kart["renk"] = null;
                        }

                        if (_kartTipi == "hirdavat")
                        {
                            kart["delikSablonu"] = DelikSablonuAyristir((delikSablonuKutusu.Text ?? "").Trim());
                        }
                        else
                        {
                            kart["delikSablonu"] = new JArray();
                        }
                    }
                    else if (_kartTipi == "yarimamul")
                    {
                        kart["id"] = YeniId("YM");
                        kart["kod"] = kod;
                        kart["ad"] = ad;
                        kart["netBoy"] = string.IsNullOrWhiteSpace(netBoyKutusu.Text) ? (JToken)null : Cift(netBoyKutusu);
                        kart["netEn"] = string.IsNullOrWhiteSpace(netEnKutusu.Text) ? (JToken)null : Cift(netEnKutusu);
                        kart["kalinlik"] = string.IsNullOrWhiteSpace(ymKalinlikKutusu.Text) ? (JToken)null : Cift(ymKalinlikKutusu);
                        kart["kabaBoy"] = string.IsNullOrWhiteSpace(kabaBoyKutusu.Text) ? (JToken)null : Cift(kabaBoyKutusu);
                        kart["kabaEn"] = string.IsNullOrWhiteSpace(kabaEnKutusu.Text) ? (JToken)null : Cift(kabaEnKutusu);
                        kart["adet"] = Tam(adetKutusu, 1);
                        kart["renk"] = (ymRenkKutusu.Text ?? "").Trim();
                        kart["referansFiyat"] = string.IsNullOrWhiteSpace(referansFiyatKutusu.Text) ? (JToken)null : Cift(referansFiyatKutusu);
                        kart["referansDvz"] = referansDvzKutusu.SelectedItem as string ?? "TL";
                        kart["hammaddeId"] = (hammaddeKutusu.SelectedItem as HammaddeSecenegi)?.Id;
                        kart["rotaId"] = null;
                        kart["amortismanGideri"] = Cift(amortismanKutusu);
                        kart["gygOraniYuzde"] = Cift(gygKutusu);
                        kart["kapasiteGunlukMax"] = 0;
                        kart["kapasiteHaftalikMax"] = 0;
                        kart["kapasiteAylikMax"] = 0;
                        kart["aciklama"] = "";
                        kart["gorseller"] = new JArray();
                    }
                    else if (_kartTipi == "altmontaj")
                    {
                        kart["id"] = YeniId("AM");
                        kart["kod"] = kod;
                        kart["ad"] = ad;
                        kart["aciklama"] = (aciklamaKutusu.Text ?? "").Trim();
                        kart["rotaId"] = null;
                        kart["amortismanGideri"] = Cift(amortismanKutusu);
                        kart["gygOraniYuzde"] = Cift(gygKutusu);
                        kart["gorseller"] = new JArray();
                        kart["olusturmaTarihi"] = DateTime.Now.ToString("yyyy-MM-dd");
                    }
                    else if (_kartTipi == "paket")
                    {
                        kart["id"] = YeniId("PKT");
                        kart["kod"] = kod;
                        kart["ad"] = ad;
                        kart["ambalajTipi"] = ambalajTipiKutusu.SelectedItem as string ?? "Koli";
                        kart["koliIciAdet"] = Math.Max(1, Tam(koliIciAdetKutusu, 1));
                        kart["en"] = Cift(pkEnKutusu);
                        kart["boy"] = Cift(pkBoyKutusu);
                        kart["yukseklik"] = Cift(pkYukseklikKutusu);
                        kart["netAgirlik"] = Cift(netAgirlikKutusu);
                        kart["brutAgirlik"] = Cift(brutAgirlikKutusu);
                        kart["aciklama"] = (aciklamaKutusu.Text ?? "").Trim();
                        kart["rotaId"] = null;
                        kart["amortismanGideri"] = Cift(amortismanKutusu);
                        kart["gygOraniYuzde"] = Cift(gygKutusu);
                        kart["gorseller"] = new JArray();
                        kart["olusturmaTarihi"] = DateTime.Now.ToString("yyyy-MM-dd");
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Alan hatası: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                SonucKart = kart;
                DialogResult = DialogResult.OK;
                Close();
            };

            Controls.Add(ana);
            Controls.Add(altPanel);
        }

        // ÜretimOS'un page_hammadde.js:delikSablonuAyristir ile AYNI biçim
        // ("x,y,çap;x,y,çap", mm) — boş girişte boş dizi döner, hatalı üçlü
        // sessizce ATLANMAZ, kullanıcıya net bir hata gösterilir (TAHMİN YOK).
        private static JArray DelikSablonuAyristir(string metin)
        {
            var sonuc = new JArray();
            if (string.IsNullOrWhiteSpace(metin)) return sonuc;
            foreach (var parca in metin.Split(';'))
            {
                string p = parca.Trim();
                if (p.Length == 0) continue;
                var parcalar = p.Split(',');
                if (parcalar.Length != 3)
                    throw new FormatException($"Delik şablonu '{p}' geçersiz — 'x,y,çap' biçiminde olmalı.");
                double x = double.Parse(parcalar[0].Trim(), CultureInfo.InvariantCulture);
                double y = double.Parse(parcalar[1].Trim(), CultureInfo.InvariantCulture);
                double cap = double.Parse(parcalar[2].Trim(), CultureInfo.InvariantCulture);
                if (cap <= 0) throw new FormatException($"Delik şablonu '{p}' — çap 0'dan büyük olmalı.");
                sonuc.Add(new JObject { ["x"] = x, ["y"] = y, ["cap"] = cap });
            }
            return sonuc;
        }

        private class HammaddeSecenegi
        {
            public string Id;
            private readonly string _gosterim;
            public HammaddeSecenegi(JObject h)
            {
                Id = (string)h["id"];
                _gosterim = ((string)h["stokKodu"] ?? Id) + " — " + (string)h["ad"];
            }
            public override string ToString() => _gosterim;
        }
    }
}
