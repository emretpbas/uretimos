using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json.Linq;
using SolidWorks.Interop.sldworks;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // REÇETE AĞACI PANELİ — kullanıcı isteği: "üretimostaki ağaç görünümünde
    // reçeteyi solidworkstede uygula, alt kalem ekle sürükle bırak, paket,
    // yarımamul, alt montaj, hırdavat, plaka, kenar bandı vb."
    //
    // SONRAKİ İSTEK (bu sürümde eklendi): "alt kırılımlı reçete almak için
    // soldaki parça ve alt montaj listesindeki kalemlerin hangi pakette
    // olduğunu ve paket ölçü ve ağırlığını yazalım, yarımamul alt
    // kırılımlarını ve rotalarını girelim ve bu ÜretimOS'taki reçete
    // sistemine AYNI ŞEKİLDE aktarılsın."
    //
    // ÇOK KATMANLI AĞAÇ (V1 sınırlaması KALDIRILDI): Ağaç artık ÜretimOS'un
    // kendi page_recete_agac.js:renderNode'u ile AYNI mantıkla ÇALIŞIYOR —
    // her kalem, KENDİ reçetesi varsa (urun/yarımamül/altmontaj/paket
    // tipindeyse) alt düğümler olarak o reçeteyi de gösterir; sürükle-bırak/
    // "Ekle" HANGİ düğümün üstüne bırakıldıysa O KARTIN reçetesine eklenir
    // (kök şart değil). Döngüsel/çok derin referanslara karşı MAKS_DERINLIK
    // ile sınırlanır (TAHMİN/otomatik düzeltme YAPILMAZ, yalnızca güvenlik).
    //
    // PAKET ÖLÇÜ/AĞIRLIK: ÜretimOS'un page_recete_agac.js:openPaketOlcuDuzenle
    // ile AYNI alanlar (en/boy/yükseklik/netAgirlik/brutAgirlik) — kök kart
    // bir paketse üst panelden, ağaçtaki HERHANGİ bir paket kaleminden sağ
    // tık menüsünden düzenlenir. "Taslak" mantığı AYNI: değişiklik yalnızca
    // '✓ ÜretimOS'a Kaydet' ile kalıcı olur.
    //
    // Aynı EtiketlemePaneli.cs gibi: düz WinForms (SolidWorks PropertyManager-
    // Page COM riski YOK), ÜretimOS bağlantısı BaglantiAyarlari.cs üzerinden
    // (kimlik bilgisi asla kod/git'e karışmaz).
    // ════════════════════════════════════════════════════════════════════════
    public class ReceteAgaciPaneli : Form
    {
        private readonly ModelDoc2 _hedefModel;
        private UretimOSApiClient _istemci;

        private JArray _urunler, _yarimamuller, _altMontajlar, _paketler, _hammaddeler, _receteler, _rotalar;
        private bool _verilerYuklendi;

        private string _kokTip;   // urun | yarimamul | altmontaj | paket
        private JObject _kokKart; // { id, kod, ad, ... }

        // Kalem tipinden bağımsız, HER SEVİYEDE aynı mantıkla kullanılan
        // "değişen reçeteler" kayıt defteri — anahtar "tip|kartId". Bir kart
        // henüz reçetesi yoksa (ilk kez kalem eklendiğinde) burada TASLAK
        // olarak oluşturulur, sunucuya YALNIZCA Kaydet'te yazılır.
        private readonly Dictionary<string, JObject> _degisenReceteler = new Dictionary<string, JObject>();
        // Ölçü/ağırlığı düzenlenen paket kartları — Kaydet'te 'paketler'e yazılır.
        // Kullanıcı isteği: "üretimosta nasıl reçete yapıp kaydediyorsak
        // solidde o şekilde reçete yapıp kaydedebilelim" — web'in inline Rota/
        // Amortisman/GYG düzenlemesiyle AYNI: bir kartın KENDİ alanları (paket
        // ölçüsü DAHİL, artık paket'e özel bir liste değil) burada tip+id'ye
        // göre tutulur, Kaydet'te KENDİ koleksiyonuna (urunler/yarimamuller/
        // altMontajlar/paketler) 'guncelle' olarak gönderilir.
        private readonly Dictionary<string, (string tip, JObject kart)> _degisenKartlar = new Dictionary<string, (string, JObject)>();

        // Döngüsel/çok derin referanslara karşı güvenlik sınırı — TAHMİN/
        // otomatik döngü tespiti YAPILMAZ, yalnızca sonsuz özyinelemeyi önler.
        private const int MAKS_DERINLIK = 6;

        private Label _durumEtiketi;
        private Label _kokKartEtiketi;
        private Button _kokKartSecBtn;
        // Kullanıcı isteği: "reçete ağacı sekmesine ilk bastığımda solidworkste
        // olan ve tüm componets, part ve assamblyler sıralansın" — bu ağaç
        // AKTİF belgedeki (parça/montaj) TÜM bileşenleri, panel açılır açılmaz
        // (herhangi bir ön-seçim GEREKMEDEN) listeler. Bir düğüme tıklanınca o
        // bileşenin ÜretimOS kartı (varsa URETIMOS_KOD'a göre otomatik, yoksa
        // elle) çözülür ve aşağıdaki reçete editörü O kart için açılır.
        // Kullanıcı isteği: "solidworks bileşen ağacı bölümünü olduğu gibi
        // reçete haline getirelim ve üretimosa atalım, her kalemin sınıfını
        // belirleyelim ... direkt bu haliyle uretimosa aktaralım" — artık
        // TreeView DEĞİL, kalem editörüyle AYNI "düz satır listesi + girinti"
        // deseninde (bkz. BilesenAgaciniCiz/BilesenAnaSatiriOlustur): her
        // satırda Sınıf seçici, (yarımamül/panel için) ölçü, (panel için)
        // 4 kenar bandı seçici, "+ Ek Kalem" ve sürükle-bırak ile taşıma var.
        private Panel _bilesenAgaciGorunumu;
        // İlk BilesenAgaci.Cikar çağrısından sonra BURADA saklanır — panel
        // kullanıcı tarafından sınıflandırıldıkça/taşındıkça bu YERİNDE
        // mutasyona uğrar, asla yeniden SolidWorks'ten OKUNMAZ (aksi halde
        // kullanıcının yaptığı tüm sınıflandırma/taşıma kaybolurdu).
        private List<BilesenDugumu> _bilesenKokListesi;
        private BilesenDugumu _seciliBilesenDugumu;
        // Kullanıcı isteği: "bu ekranla solidworksteki reçete ağaç editörünü
        // aynı esneklikte olsun" — artık bir TreeView DEĞİL, her reçete
        // kalemi kendi inline-düzenlenebilir satır Panel'i olarak (web'in
        // renderNode'u ile AYNI mantıkla) burada üst üste (Dock=Top) dizilir.
        private Panel _agacGorunumu;
        private ComboBox _paletTipKutusu;
        private TextBox _paletAramaKutusu;
        private ListBox _paletListesi;
        private List<PaletOgesi> _paletTumOgeler = new List<PaletOgesi>();
        private Button _kaydetBtn;

        // Rota (yarı mamül) alanı — kullanıcı isteği: "rota seç ve oluştur da
        // var, her yarımamülde onu da ekleyelim". ÜretimOS'ta yarımamul
        // kartının kendi 'rotaId' alanı vardır (bkz. page_yarimamul.js) —
        // bu panel hem KÖK kart bir yarımamül İSE, hem de ağaca eklenen HER
        // yarımamül kalemi için (sağ tık menüsünden) aynı seç/oluştur
        // akışını sunar.
        private Panel _rotaPanel;
        private ComboBox _rotaKutusu;

        // Paket ölçü/ağırlık alanı — KÖK kart bir paket İSE üst panelde
        // özet + "Düzenle…" gösterir (ağaçtaki paket kalemleri için AYNI
        // diyalog sağ tık menüsünden açılır — bkz. PaketOlcuAgirlikDuzenle).
        private Panel _paketOlcuPanel;
        private Label _paketOlcuEtiketi;

        private class PaletOgesi
        {
            public string KalemTipi;    // urun|yarimamul|altmontaj|paket|hammadde — receteye YAZILACAK tip
            public string GosterimTipi; // Paket/Yarı Mamül/Alt Montaj/Hırdavat/Plaka/Kenar Bandı — kullanıcıya gösterilen
            public string Id, Kod, Ad;
            // TAM "kullanıldığı yerler" analizi (yarımamül/altmontaj için) —
            // kullanıcı isteği: "hangi pakette olduğunu ... yazalım" ilk
            // sürümde yalnızca İLK eşleşen paketi gösteriyordu; bu SONRAKİ
            // istekle GENİŞLETİLDİ: artık bu kartın kalem olarak geçtiği
            // TÜM üst kartlar (paket/alt montaj/ürün fark etmeksizin, hepsi
            // aranır) burada tutulur — bkz. NeredeKullaniliyor.
            public List<(string ustTip, JObject ustKart, double miktar)> KullanimListesi;
            // Paket ölçü/ağırlık özeti (paket kalemleri için).
            public string OlcuAgirlikMetni;
            public override string ToString()
            {
                string ek = "";
                if (KullanimListesi != null && KullanimListesi.Count == 1)
                    ek += $"  [{TipGosterimAdi(KullanimListesi[0].ustTip)}: {KullanimListesi[0].ustKart["kod"]}]";
                else if (KullanimListesi != null && KullanimListesi.Count > 1)
                    ek += $"  [{KullanimListesi.Count} yerde kullanılıyor — sağ tık: detay]";
                if (!string.IsNullOrEmpty(OlcuAgirlikMetni)) ek += $"  ({OlcuAgirlikMetni})";
                return $"[{GosterimTipi}] {Kod} — {Ad}{ek}";
            }
        }

        public ReceteAgaciPaneli(ModelDoc2 hedefModel)
        {
            _hedefModel = hedefModel;
            KurulumYap();
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);
            await VerileriYukleVeBaslat();
        }

        private void KurulumYap()
        {
            Text = "ÜretimOS — Reçete Ağacı (Alt Kalem Ekle, Çok Katmanlı)";
            Width = 900;
            Height = 820;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(760, 520);

            // ── ÜST: kök kart bilgisi ────────────────────────────────────────
            var ustPanel = new Panel { Dock = DockStyle.Top, Height = 56, Padding = new Padding(10) };
            _kokKartEtiketi = new Label { AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Text = "Kart eşleştiriliyor…" };
            _kokKartSecBtn = new Button { Text = "Farklı Kart Seç…", Dock = DockStyle.Right, Width = 140, Enabled = false };
            _kokKartSecBtn.Click += (s, e) => KokKartSeciciAc();
            ustPanel.Controls.Add(_kokKartEtiketi);
            ustPanel.Controls.Add(_kokKartSecBtn);

            // ── ROTA (yalnızca kök kart bir YARI MAMÜL ise görünür) ──────────
            _rotaPanel = new Panel { Dock = DockStyle.Top, Height = 34, Padding = new Padding(10, 4, 10, 4), Visible = false };
            _rotaKutusu = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList, Enabled = false };
            var rotaBtn = new Button { Text = "Rota Seç / Oluştur…", Dock = DockStyle.Right, Width = 150 };
            rotaBtn.Click += async (s, e) => { if (_kokKart != null) { await RotaSecVeyaOlusturDialogAc(_kokKart); UstBilgiPanelleriGuncelle(); } };
            _rotaPanel.Controls.Add(_rotaKutusu);
            _rotaPanel.Controls.Add(rotaBtn);

            // ── PAKET ÖLÇÜ/AĞIRLIK (yalnızca kök kart bir PAKET ise görünür) ──
            // Kullanıcı isteği: "paket ölçü ve ağırlığını yazalım" — ÜretimOS'un
            // page_recete_agac.js:openPaketOlcuDuzenle ile AYNI alanlar.
            _paketOlcuPanel = new Panel { Dock = DockStyle.Top, Height = 34, Padding = new Padding(10, 4, 10, 4), Visible = false };
            _paketOlcuEtiketi = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.DarkSlateGray };
            var paketOlcuBtn = new Button { Text = "Paket Ölçü/Ağırlık Düzenle…", Dock = DockStyle.Right, Width = 190 };
            paketOlcuBtn.Click += (s, e) => { if (_kokKart != null) { PaketOlcuAgirlikDuzenle(_kokKart); UstBilgiPanelleriGuncelle(); } };
            _paketOlcuPanel.Controls.Add(_paketOlcuEtiketi);
            _paketOlcuPanel.Controls.Add(paketOlcuBtn);

            // ── SOL: ekleme paleti ───────────────────────────────────────────
            var solPanel = new Panel { Dock = DockStyle.Left, Width = 320, Padding = new Padding(8) };
            var paletBaslik = new Label { Text = "Ekle — sürükleyip ağaçta bir kartın ÜSTÜNE bırakın (o kartın reçetesine eklenir)", Dock = DockStyle.Top, Height = 32, AutoSize = false };
            _paletTipKutusu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
            _paletTipKutusu.Items.AddRange(new object[] { "Ürün", "Paket", "Yarı Mamül", "Alt Montaj", "Hırdavat", "Plaka", "Kenar Bandı", "Sarf Malzeme" });
            _paletTipKutusu.SelectedIndexChanged += (s, e) => PaletiFiltrele();
            _paletAramaKutusu = new TextBox { Dock = DockStyle.Top };
            _paletAramaKutusu.TextChanged += (s, e) => PaletiFiltrele();
            var aramaEtiket = new Label { Text = "Kod/ad ara:", Dock = DockStyle.Top, Height = 18, AutoSize = false };
            _paletListesi = new ListBox { Dock = DockStyle.Fill, AllowDrop = false, IntegralHeight = false };
            _paletListesi.MouseDown += PaletListesi_MouseDown;
            // TAM "kullanıldığı yerler" analizi — sağ tık ile detay diyaloğu.
            var paletSagTikMenu = new ContextMenuStrip();
            var neredeMenuOgesi = paletSagTikMenu.Items.Add("Nerede Kullanılıyor?", null, (s, e) =>
            {
                if (_paletListesi.SelectedItem is PaletOgesi oge) NeredeKullaniliyorGoster(oge);
            });
            paletSagTikMenu.Opening += (s, e) =>
            {
                var oge = _paletListesi.SelectedItem as PaletOgesi;
                neredeMenuOgesi.Enabled = oge?.KullanimListesi != null && oge.KullanimListesi.Count > 0;
            };
            _paletListesi.ContextMenuStrip = paletSagTikMenu;
            _paletListesi.MouseDown += (s, e) =>
            {
                if (e.Button == MouseButtons.Right)
                {
                    int idx = _paletListesi.IndexFromPoint(e.Location);
                    if (idx >= 0) _paletListesi.SelectedIndex = idx;
                }
            };
            // Her satırın kendi "+ Alt Kalem" butonu/sürükle-bırak hedefi
            // olduğu için (bkz. SatirPaneliOlustur), bu buton yalnızca KÖK
            // karta doğrudan eklemek için basit bir kısayoldur.
            var ekleBtn = new Button { Text = "Ekle → Kök Karta", Dock = DockStyle.Bottom };
            ekleBtn.Click += (s, e) =>
            {
                if (!(_paletListesi.SelectedItem is PaletOgesi oge))
                {
                    MessageBox.Show("Önce soldaki listeden bir öğe seçin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                KalemEkle(oge, _kokTip, _kokKart);
            };
            // Kullanıcı isteği: "Sıfırdan bir ürün için TÜM alt kartları
            // (hammadde, plaka, kenar bandı, hırdavat vb.) da SolidWorks
            // içinden, panel açıkken oluşturabilme özelliği istiyorum" —
            // yukarıdaki tip kutusunda SEÇİLİ olan tipte yeni bir kart
            // oluşturur (bkz. YeniKartFormlari.cs), ÜretimOS'a hemen kaydeder
            // ve paleti tazeler — reçeteye eklemek için ayrıca "Ekle"ye
            // basılır (kart oluşturma ile reçeteye ekleme BİLEREK ayrı adım,
            // ikisini birden yapmak zorunlu DEĞİL).
            var yeniKartBtn = new Button { Text = "+ Yeni Kart Oluştur…", Dock = DockStyle.Bottom };
            yeniKartBtn.Click += async (s, e) => await YeniKartOlustur();

            solPanel.Controls.Add(_paletListesi);
            solPanel.Controls.Add(ekleBtn);
            solPanel.Controls.Add(yeniKartBtn);
            solPanel.Controls.Add(_paletAramaKutusu);
            solPanel.Controls.Add(aramaEtiket);
            solPanel.Controls.Add(_paletTipKutusu);
            solPanel.Controls.Add(paletBaslik);

            // ── SAĞ: SolidWorks bileşen ağacı (ÜST) + seçili kartın reçetesi (ALT) ──
            var sagPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };

            // Kullanıcı isteği: "reçete ağaç editöründeki mantıkta bir düzenle
            // açılsın ... eğer bunu uretimostaki mevcut kartlarla eşleştirdiysem
            // yine o bilgilerle gelsin ancak istersem değiştirebileyim" — bu
            // bölüm SolidWorks'teki GERÇEK bileşen ağacını gösterir; ✓ zaten
            // eşleşmiş, ⚠ kod var ama karta karşılık gelmiyor, — hiç eşleşmemiş.
            var bilesenBaslik = new Label
            {
                Text = "SolidWorks bileşen ağacı — kod/ad'a tıkla (✓/⚠/—), sınıf seç, sürükle-bırakla taşı",
                Dock = DockStyle.Top, Height = 24
            };
            // Kullanıcı isteği: "bu bölümü biraz genişletelim" — sabit 240px
            // yerine daha büyük bir varsayılan yükseklik VERİLİR; aşağıdaki
            // Splitter ile kullanıcı bu sınırı istediği gibi sürükleyip
            // büyütüp küçültebilir (bkz. bilesenSplitter, aşağıda eklenir).
            _bilesenAgaciGorunumu = new Panel { Dock = DockStyle.Top, Height = 420, AutoScroll = true, BorderStyle = BorderStyle.FixedSingle };
            var bilesenSplitter = new Splitter { Dock = DockStyle.Top, Height = 4, BackColor = Color.Silver };

            // Kullanıcı isteği: "direkt bu haliyle uretimosa aktaralım ve
            // üretimos yeni kartlar ve kodları direkt kaydetsin" — tüm ağacı
            // TEK seferde tarayıp eşleşmeyen yarı mamül/alt montaj/paket/
            // ürünler için YENİ kart oluşturur, reçete yapısını kurar ve
            // hepsini sunucuya yazar (bkz. BilesenAgaciniReceteOlarakAktar).
            var bilesenAraPanel = new Panel { Dock = DockStyle.Top, Height = 30 };
            var receteOlarakAktarBtn = new Button { Text = "📤 Reçete Olarak ÜretimOS'a Aktar…", Dock = DockStyle.Left, Width = 240 };
            receteOlarakAktarBtn.Click += async (s, e) => await BilesenAgaciniReceteOlarakAktar();
            bilesenAraPanel.Controls.Add(receteOlarakAktarBtn);

            // Kullanıcı isteği: "bu ekranla solidworksteki reçete ağaç
            // editörünü aynı esneklikte olsun" — TreeView'daki çift tık/sağ
            // tık dolaylı akışı TAMAMEN kaldırıldı; ÜretimOS'un kendi
            // page_recete_agac.js:renderNode'u ile AYNI mantık: her SATIR
            // kendi miktar/birim kutusunu, "+ Alt Kalem"/"Değiştir"/"↕ Taşı"/
            // "Sil" butonlarını ve (hammadde hariç) inline Rota/Amortisman/
            // GYG alanlarını doğrudan taşır (bkz. SatirPaneliOlustur/
            // AyarPaneliOlustur). Sürükle-bırak da artık TreeView seviyesinde
            // DEĞİL, doğrudan HER SATIRIN kendi Panel'inde (o satırın kartı
            // hedef alınarak) çalışır.
            var agacBaslik = new Label { Text = "Seçili bileşenin ÜretimOS reçetesi ve alt kırılımları — her satırda miktar/birim doğrudan düzenlenebilir", Dock = DockStyle.Top, Height = 24 };
            _agacGorunumu = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BorderStyle = BorderStyle.FixedSingle };
            sagPanel.Controls.Add(_agacGorunumu);
            sagPanel.Controls.Add(agacBaslik);
            // NOT: Splitter, kendisinden SONRA eklenen aynı-kenarlı kontrolü
            // (burada _bilesenAgaciGorunumu) yeniden boyutlandırır — bu yüzden
            // agacBaslik'tan SONRA, _bilesenAgaciGorunumu'ndan ÖNCE eklenmesi
            // gerekir (bkz. .NET Splitter'ın standart kullanım deseni).
            sagPanel.Controls.Add(bilesenSplitter);
            sagPanel.Controls.Add(_bilesenAgaciGorunumu);
            sagPanel.Controls.Add(bilesenAraPanel);
            sagPanel.Controls.Add(bilesenBaslik);

            // ── ALT: durum + kaydet ──────────────────────────────────────────
            var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 50, Padding = new Padding(8) };
            _durumEtiketi = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.DarkSlateGray };
            _kaydetBtn = new Button { Text = "✓ ÜretimOS'a Kaydet", Dock = DockStyle.Right, Width = 160, Enabled = false, Font = new Font(Font, FontStyle.Bold) };
            _kaydetBtn.Click += async (s, e) => await KaydetTikla();
            // Kullanıcı isteği: "Üretimostaki reçeteleri xml formatında
            // kaydedelim ve her satırın benzersiz unique id bilgiside olsun"
            // — ÜretimOS'un kendi veri deposu (JSON) DEĞİŞMİYOR, bu SADECE
            // yerel bir dışa aktarma (export). Her <Kalem> zaten reçeteye
            // eklenirken atanan benzersiz "RK-..." id'yi taşır (bkz.
            // KalemEkle) — eski/id'siz kalemler için dışa aktarma ANINDA
            // (kalıcı olmayan) bir id üretilir, bkz. ReceteyiXmlOlarakDisaAktar.
            var xmlDisaAktarBtn = new Button { Text = "Reçeteyi XML Olarak Dışa Aktar…", Dock = DockStyle.Right, Width = 210 };
            xmlDisaAktarBtn.Click += (s, e) => ReceteyiXmlOlarakDisaAktar();
            altPanel.Controls.Add(_durumEtiketi);
            altPanel.Controls.Add(_kaydetBtn);
            altPanel.Controls.Add(xmlDisaAktarBtn);

            // NOT: Dock=Top/Bottom/Left panelleri arasında sıralama, Controls
            // koleksiyonuna EKLENME SIRASININ TERSİNE göre işler — SON eklenen
            // aynı kenara en YAKIN (en dıştaki) olur. _rotaPanel/_paketOlcuPanel
            // (ikisi de karşılıklı dışlayan görünürlükte) ustPanel'in HEMEN
            // ALTINDA görünmesi için ustPanel'den ÖNCE eklenmesi gerekir.
            Controls.Add(sagPanel);
            Controls.Add(solPanel);
            Controls.Add(altPanel);
            Controls.Add(_paketOlcuPanel);
            Controls.Add(_rotaPanel);
            Controls.Add(ustPanel);
        }

        // ── VERİ YÜKLEME ─────────────────────────────────────────────────────
        private async System.Threading.Tasks.Task VerileriYukleVeBaslat()
        {
            _durumEtiketi.Text = "ÜretimOS'a bağlanılıyor…";
            var ayar = BaglantiAyarlari.Yukle();
            if (ayar == null)
            {
                BaglantiAyarlari.OrnekDosyaOlustur();
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "Yerel bağlantı ayarı yok. Örnek dosya oluşturuldu: " + BaglantiAyarlari.DosyaYoluGoster();
                _kokKartEtiketi.Text = "ÜretimOS'a bağlanılamadı — bu panel sunucu erişimi gerektirir.";
                return;
            }

            try
            {
                _istemci = new UretimOSApiClient(ayar.SunucuUrl);
                if (!await _istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre))
                {
                    _durumEtiketi.ForeColor = Color.DarkRed;
                    _durumEtiketi.Text = "Giriş başarısız — " + BaglantiAyarlari.DosyaYoluGoster() + " içindeki bilgileri kontrol edin.";
                    return;
                }

                _urunler = JArray.Parse(await _istemci.Getir("urunler") ?? "[]");
                _yarimamuller = JArray.Parse(await _istemci.Getir("yarimamuller") ?? "[]");
                _altMontajlar = JArray.Parse(await _istemci.Getir("altMontajlar") ?? "[]");
                _paketler = JArray.Parse(await _istemci.Getir("paketler") ?? "[]");
                _hammaddeler = JArray.Parse(await _istemci.Getir("hammaddeler") ?? "[]");
                _receteler = JArray.Parse(await _istemci.Getir("receteler") ?? "[]");
                _rotalar = JArray.Parse(await _istemci.Getir("rotalar") ?? "[]");
                _verilerYuklendi = true;

                PaletiFiltrele();
                _kokKartSecBtn.Enabled = true;

                // Kullanıcı isteği: "ilk bastığımda solidworkste olan ve tüm
                // componets, part ve assamblyler sıralansın" — TEK bir önceden
                // seçilmiş bileşen yerine, aktif belgedeki (parça/montaj) TÜM
                // bileşen ağacı burada çıkarılır ve doğrudan listelenir. Her
                // düğümün ÜretimOS kart eşleşmesi (URETIMOS_KOD'a göre) ✓/⚠/—
                // simgesiyle gösterilir; TAHMİN/otomatik kart OLUŞTURMA YOK.
                var bilesenKokleri = BilesenAgaci.Cikar(_hedefModel);
                BilesenAgaciniCiz(bilesenKokleri);

                int toplamBilesen = ToplamBilesenSayisi(bilesenKokleri);
                _kokKartEtiketi.Text = toplamBilesen > 0
                    ? "Yukarıdaki bileşen ağacından bir bileşen seçin — kartı otomatik eşleşirse burada görünür, eşleşmezse 'Farklı Kart Seç…' ile eşleştirin."
                    : "Aktif belgede bileşen bulunamadı.";
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ Bağlandı — {toplamBilesen} bileşen listelendi, {_receteler.Count} reçete, {_hammaddeler.Count} hammadde yüklendi.";
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("ReceteAgaciPaneli.VerileriYukleVeBaslat HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Veri çekilemedi: " + ex.Message;
            }
        }

        // ── SOLIDWORKS BİLEŞEN AĞACI (TÜM component/part/assembly'ler) ───────
        private static int ToplamBilesenSayisi(List<BilesenDugumu> dugumler) =>
            dugumler.Sum(d => 1 + ToplamBilesenSayisi(d.Cocuklar));

        // kokDugumler verilirse (ilk yükleme) _bilesenKokListesi'ne KAYDEDİLİR;
        // sonraki çağrılarda (sınıf değişti / sürükle-bırak taşındı / +Ek Kalem
        // eklendi) parametresiz çağrılır — SolidWorks'ten YENİDEN OKUMAZ,
        // yalnızca mevcut (kullanıcı tarafından zaten düzenlenmiş) yapıyı
        // yeniden çizer.
        private void BilesenAgaciniCiz(List<BilesenDugumu> kokDugumler = null)
        {
            if (kokDugumler != null) _bilesenKokListesi = kokDugumler;
            if (_bilesenKokListesi == null) return;

            var satirlar = new List<Control>();
            foreach (var d in _bilesenKokListesi)
                BilesenSatirlariTopla(satirlar, d, 0);

            // Kullanıcı isteği: "birşey seçince sıra kayıyor tekrar onu bulmam
            // gerekiyor" — Controls.Clear() kaydırma konumunu sıfırlar; her
            // sınıf/eşleşme değişikliğinde TÜM satırlar yeniden oluşturulduğu
            // için (bkz. yukarıdaki NOT), kaydırma konumu elle saklanıp geri
            // yüklenmezse kullanıcı üzerinde çalıştığı satırı kaybediyordu.
            var kaydirmaKonumu = _bilesenAgaciGorunumu.AutoScrollPosition;

            _bilesenAgaciGorunumu.SuspendLayout();
            _bilesenAgaciGorunumu.Controls.Clear();
            // Dock=Top TERS sırada eklenir (bkz. KurulumYap'ın başındaki NOT).
            for (int i = satirlar.Count - 1; i >= 0; i--)
                _bilesenAgaciGorunumu.Controls.Add(satirlar[i]);
            _bilesenAgaciGorunumu.ResumeLayout();

            // AutoScrollPosition GETTER'ı zaten negatif döner — geri yazarken
            // TEKRAR negatiflemek gerekir (WinForms'un kendi tuhaf kuralı).
            _bilesenAgaciGorunumu.AutoScrollPosition = new Point(-kaydirmaKonumu.X, -kaydirmaKonumu.Y);
        }

        private void BilesenSatirlariTopla(List<Control> hedefListe, BilesenDugumu dugum, int derinlik)
        {
            hedefListe.Add(BilesenAnaSatiriOlustur(dugum, derinlik));
            if (!dugum.BelgeYuklenemedi && (dugum.Sinif == "yarimamul" || dugum.Sinif == "plaka"))
                hedefListe.Add(BilesenOlcuSatiriOlustur(dugum, derinlik));
            if (!dugum.BelgeYuklenemedi && dugum.Sinif == "plaka")
                hedefListe.Add(BilesenKenarBandiSatiriOlustur(dugum, derinlik));
            foreach (var cocuk in dugum.Cocuklar.ToList())
                BilesenSatirlariTopla(hedefListe, cocuk, derinlik + 1);
        }

        // Sınıf açılır kutusunun index<->sistem-tipi eşlemesi — gerçek sistem
        // tipleriyle AYNI değerler (KodileKartBul/KoleksiyonAdiTipten/FindKart
        // ile birebir uyumlu), TAHMİN edilen ayrı bir kelime dağarcığı DEĞİL.
        private static readonly string[] SinifEtiketleri = { "— Sınıf Seç —", "Hırdavat", "Panel (Plaka)", "Kenar Bandı", "Sarf Malzeme", "Yarı Mamül", "Alt Montaj", "Paket", "Ürün" };
        private static readonly string[] SinifDegerleri = { null, "hirdavat", "plaka", "kenar_bandi", "sarf", "yarimamul", "altmontaj", "paket", "urun" };
        private static int SinifIndexBul(string sinif) { int i = Array.IndexOf(SinifDegerleri, sinif); return i < 0 ? 0 : i; }
        private static string SinifKarsilikBul(int index) => index >= 0 && index < SinifDegerleri.Length ? SinifDegerleri[index] : null;

        // "panel seçtiğimde muhakkak hammadde de seçmem gerekiyor aksi
        // taktirde eşleşmemiş kalıyor" — hammadde ailesinden bir sınıf
        // seçilince "Farklı Kart Seç…" dialogunun HANGİ tipten başlaması
        // gerektiğini söyler (KokKartSeciciAc'in tipKutu listesindeki
        // etiketlerle birebir aynı yazım).
        private static readonly Dictionary<string, string> HammaddeSinifTipEtiketi = new Dictionary<string, string>
        {
            ["hirdavat"] = "Hırdavat",
            ["plaka"] = "Plaka",
            ["kenar_bandi"] = "Kenar Bandı",
            ["sarf"] = "Sarf Malzeme",
        };

        // Bileşen ağacındaki bir düğümün ANA satırı — kod/ad + eşleşme durumu
        // (tıklanınca BilesenSecildi çalışır, mevcut "Farklı Kart Seç…" akışı
        // AYNEN devam eder), "Sınıf" seçici, "+ Ek Kalem" ve sürükle-bırak
        // tutamacı. Kullanıcı isteği: "her kalemin sınıfını belirleyelim
        // (hırdavat, paket, hammadde, panel, kenar bandı, yarımamül vb.)".
        private Panel BilesenAnaSatiriOlustur(BilesenDugumu dugum, int derinlik)
        {
            var panel = new Panel { Dock = DockStyle.Top, Height = 30, BackColor = derinlik == 0 ? Color.AliceBlue : Color.White };
            var satir = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };

            satir.Controls.Add(new Panel { Width = 8 + derinlik * 22, Height = 1 });

            // Kullanıcı isteği: "üretimosa aktarılacak kalemleri bir kutucukla
            // seçeyim, sadece onlar aktarılsın" — işareti kaldırılan bir
            // düğüm (VE ALTINDAKİ TÜM ALT DALI) BilesenAgaciniReceteOlarakAktar
            // tarafından tamamen YOK SAYILIR (bkz. o metottaki Topla() closure'ı).
            if (!dugum.BelgeYuklenemedi)
            {
                var dahilKutu = new CheckBox { Checked = dugum.AktarimaDahil, AutoSize = true, Margin = new Padding(2, 7, 2, 0) };
                dahilKutu.CheckedChanged += (s, e) => { dugum.AktarimaDahil = dahilKutu.Checked; };
                satir.Controls.Add(dahilKutu);
            }

            if (!dugum.ElleEklendi && !dugum.BelgeYuklenemedi)
            {
                // Sürükle-bırak ile taşıma — kullanıcı isteği: "istediğimiz
                // kalemi sürükle bırak ile taşıyabilelim." Gerçek SolidWorks
                // montaj yapısına DOKUNMAZ — yalnızca bu taslak reçete
                // ağacındaki mantıksal ebeveyn/çocuk ilişkisini değiştirir.
                var tutamac = new Label { Text = "⠿", AutoSize = true, Cursor = Cursors.SizeAll, ForeColor = Color.Gray, Padding = new Padding(0, 6, 6, 0) };
                tutamac.MouseDown += (s, e) => { if (e.Button == MouseButtons.Left) tutamac.DoDragDrop(dugum, DragDropEffects.Move); };
                satir.Controls.Add(tutamac);
            }

            var durumLbl = new Label
            {
                Text = BilesenDugumMetni(dugum), AutoSize = true, Padding = new Padding(0, 6, 8, 0),
                Cursor = dugum.BelgeYuklenemedi ? Cursors.Default : Cursors.Hand
            };
            if (!dugum.BelgeYuklenemedi) durumLbl.Click += (s, e) => BilesenSecildi(dugum);
            satir.Controls.Add(durumLbl);

            if (!dugum.BelgeYuklenemedi)
            {
                var sinifKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 130, Margin = new Padding(3) };
                sinifKutusu.Items.AddRange(SinifEtiketleri);
                sinifKutusu.SelectedIndex = SinifIndexBul(dugum.Sinif);
                sinifKutusu.SelectedIndexChanged += (s, e) =>
                {
                    dugum.Sinif = SinifKarsilikBul(sinifKutusu.SelectedIndex);
                    BilesenAgaciniCiz();
                    // Kullanıcı isteği: "panel seçtiğimde muhakkak hammadde de
                    // seçmem gerekiyor aksi taktirde eşleşmemiş kalıyor" —
                    // hammadde ailesinden bir sınıf seçilince VE henüz bir
                    // hammadde kartıyla eşleşmemişse, "Farklı Kart Seç…"
                    // akışı O TİPTEN başlayarak HEMEN açılır (unutmayı önler).
                    if (HammaddeSinifTipEtiketi.TryGetValue(dugum.Sinif ?? "", out string tipEtiketi)
                        && KodileKartBul(dugum.MevcutKod).kart == null)
                    {
                        _seciliBilesenDugumu = dugum;
                        KokKartSeciciAc(tipEtiketi);
                    }
                };
                satir.Controls.Add(sinifKutusu);

                var ekKalemBtn = new Button { Text = "+ Ek Kalem", AutoSize = true, Margin = new Padding(3) };
                ekKalemBtn.Click += (s, e) => BilesenEkKalemEkleDialogAc(dugum);
                satir.Controls.Add(ekKalemBtn);
            }

            // Sürükle-bırak HEDEFİ — bu satırın üstüne bırakılan başka bir
            // bileşen, bu düğümün ÇOCUĞU olur (kendi alt dalına taşıma
            // engellenir, TAM döngü tespiti YAPILMAZ — yalnızca bu bariz
            // durum kontrol edilir).
            panel.AllowDrop = true;
            panel.DragEnter += (s, e) => { e.Effect = e.Data.GetDataPresent(typeof(BilesenDugumu)) ? DragDropEffects.Move : DragDropEffects.None; };
            panel.DragDrop += (s, e) =>
            {
                if (!(e.Data.GetData(typeof(BilesenDugumu)) is BilesenDugumu tasinan) || ReferenceEquals(tasinan, dugum)) return;
                if (BilesenAltIcindeMi(tasinan, dugum))
                {
                    MessageBox.Show("Bir bileşen kendi alt dalının içine taşınamaz.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                BilesenUstListesiniBul(tasinan)?.Remove(tasinan);
                dugum.Cocuklar.Add(tasinan);
                BilesenAgaciniCiz();
            };

            panel.Controls.Add(satir);
            return panel;
        }

        // "yarımamül seçince parçanın en boy yüksekliği gelsin" — Sinif ==
        // yarimamul/plaka iken görünür, BilesenAgaci'nin okuduğu ölçüden
        // (varsa) ön-doldurulmuş Taslak* alanlarını gösterir/düzenletir.
        private Panel BilesenOlcuSatiriOlustur(BilesenDugumu dugum, int derinlik)
        {
            var panel = new Panel { Dock = DockStyle.Top, Height = 28 };
            var satir = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
            satir.Controls.Add(new Panel { Width = 8 + (derinlik + 1) * 22, Height = 1 });

            void EkleOlcuKutusu(string etiket, Func<double> al, Action<double> yaz)
            {
                satir.Controls.Add(new Label { Text = etiket, AutoSize = true, Padding = new Padding(4, 6, 2, 0), ForeColor = Color.DarkSlateGray });
                var kutu = new TextBox { Width = 60, Text = al().ToString(CultureInfo.InvariantCulture), Margin = new Padding(3) };
                kutu.Leave += (s, e) => yaz(ParseCift(kutu.Text));
                satir.Controls.Add(kutu);
            }
            EkleOlcuKutusu("Boy(mm):", () => dugum.TaslakBoyMm, v => dugum.TaslakBoyMm = v);
            EkleOlcuKutusu("En(mm):", () => dugum.TaslakEnMm, v => dugum.TaslakEnMm = v);
            EkleOlcuKutusu("Kalınlık(mm):", () => dugum.TaslakKalinlikMm, v => dugum.TaslakKalinlikMm = v);
            if (dugum.OlcuVar)
                satir.Controls.Add(new Label { Text = "(SolidWorks ölçüsünden dolduruldu)", AutoSize = true, ForeColor = Color.Gray, Padding = new Padding(8, 6, 0, 0) });

            panel.Controls.Add(satir);
            return panel;
        }

        // "panele (plaka) kenar bandını 4 kenardan hangisine hangi tip
        // eklediğimizi de çıkartalım" — Sinif == plaka iken görünür; her
        // kenar için MEVCUT bir kenar_bandi hammadde kartı seçilir (yeni
        // hammadde burada OLUŞTURULMAZ — bkz. eşleşme kontrolü aktarımda).
        private Panel BilesenKenarBandiSatiriOlustur(BilesenDugumu dugum, int derinlik)
        {
            var panel = new Panel { Dock = DockStyle.Top, Height = 28 };
            var satir = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
            satir.Controls.Add(new Panel { Width = 8 + (derinlik + 1) * 22, Height = 1 });

            var kenarBandilari = _hammaddeler.Where(h => (string)h["tip"] == "kenar_bandi").Select(h => OgeyeHammadde(h, "Kenar Bandı")).ToList();
            void EkleKenarKutusu(string etiket, Func<string> al, Action<string> yaz)
            {
                satir.Controls.Add(new Label { Text = etiket, AutoSize = true, Padding = new Padding(4, 6, 2, 0), ForeColor = Color.DarkSlateGray });
                var kutu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown, Width = 150, Margin = new Padding(3), AutoCompleteMode = AutoCompleteMode.SuggestAppend, AutoCompleteSource = AutoCompleteSource.ListItems };
                kutu.Items.Add("— Yok —");
                foreach (var kb in kenarBandilari) kutu.Items.Add(kb);
                var mevcut = kenarBandilari.FirstOrDefault(kb => kb.Id == al());
                kutu.Text = mevcut?.ToString() ?? "— Yok —";
                void Uygula()
                {
                    var secilen = kutu.SelectedItem as PaletOgesi ?? kenarBandilari.FirstOrDefault(kb => kb.ToString() == kutu.Text);
                    yaz(secilen?.Id);
                }
                kutu.SelectedIndexChanged += (s, e) => Uygula();
                kutu.Leave += (s, e) => Uygula();
                satir.Controls.Add(kutu);
            }
            EkleKenarKutusu("Ön:", () => dugum.KenarOnId, v => dugum.KenarOnId = v);
            EkleKenarKutusu("Arka:", () => dugum.KenarArkaId, v => dugum.KenarArkaId = v);
            EkleKenarKutusu("Sol:", () => dugum.KenarSolId, v => dugum.KenarSolId = v);
            EkleKenarKutusu("Sağ:", () => dugum.KenarSagId, v => dugum.KenarSagId = v);

            panel.Controls.Add(satir);
            return panel;
        }

        private static bool BilesenAltIcindeMi(BilesenDugumu ata, BilesenDugumu hedef)
        {
            if (ReferenceEquals(ata, hedef)) return true;
            return ata.Cocuklar.Any(c => BilesenAltIcindeMi(c, hedef));
        }

        private List<BilesenDugumu> BilesenUstListesiniBul(BilesenDugumu aranan)
        {
            if (_bilesenKokListesi.Contains(aranan)) return _bilesenKokListesi;
            return BilesenUstListesiniBulRecursive(_bilesenKokListesi, aranan);
        }

        private List<BilesenDugumu> BilesenUstListesiniBulRecursive(List<BilesenDugumu> liste, BilesenDugumu aranan)
        {
            foreach (var d in liste)
            {
                if (d.Cocuklar.Contains(aranan)) return d.Cocuklar;
                var sonuc = BilesenUstListesiniBulRecursive(d.Cocuklar, aranan);
                if (sonuc != null) return sonuc;
            }
            return null;
        }

        // "+ Ek Kalem" — gerçek bir SolidWorks bileşenine karşılık GELMEYEN,
        // mevcut bir ÜretimOS kartına doğrudan işaret eden sentetik bir alt
        // düğüm ekler (ör. modellenmemiş bir vida/tutkal kalemi).
        private void BilesenEkKalemEkleDialogAc(BilesenDugumu ustDugum)
        {
            using (var dlg = new Form { Text = "Ek Kalem Ekle", Width = 480, Height = 520, StartPosition = FormStartPosition.CenterParent })
            {
                var tipKutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
                tipKutu.Items.AddRange(new object[] { "Hırdavat", "Plaka", "Kenar Bandı", "Sarf Malzeme", "Yarı Mamül", "Alt Montaj", "Paket", "Ürün" });
                tipKutu.SelectedIndex = 0;
                var aramaKutu = new TextBox { Dock = DockStyle.Top };
                var liste = new ListBox { Dock = DockStyle.Fill };
                var ekleBtn = new Button { Text = "Ekle", Dock = DockStyle.Bottom };
                List<PaletOgesi> mevcutListe = new List<PaletOgesi>();
                void Doldur()
                {
                    string tip = tipKutu.SelectedItem as string;
                    IEnumerable<PaletOgesi> kaynak = tip == "Hırdavat" ? _hammaddeler.Where(h => (string)h["tip"] == "hirdavat").Select(k => OgeyeHammadde(k, "Hırdavat"))
                        : tip == "Plaka" ? _hammaddeler.Where(h => (string)h["tip"] == "plaka").Select(k => OgeyeHammadde(k, "Plaka"))
                        : tip == "Kenar Bandı" ? _hammaddeler.Where(h => (string)h["tip"] == "kenar_bandi").Select(k => OgeyeHammadde(k, "Kenar Bandı"))
                        : tip == "Sarf Malzeme" ? _hammaddeler.Where(h => (string)h["tip"] == "sarf").Select(k => OgeyeHammadde(k, "Sarf Malzeme"))
                        : tip == "Yarı Mamül" ? _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül"))
                        : tip == "Alt Montaj" ? _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj"))
                        : tip == "Paket" ? _paketler.Select(k => Ogeye(k, "paket", "Paket"))
                        : _urunler.Select(k => Ogeye(k, "urun", "Ürün"));
                    string arama = (aramaKutu.Text ?? "").Trim().ToLowerInvariant();
                    mevcutListe = kaynak.Where(o => string.IsNullOrEmpty(arama) || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama))
                        .OrderBy(o => o.Kod).Take(300).ToList();
                    liste.Items.Clear();
                    liste.Items.AddRange(mevcutListe.ToArray());
                }
                tipKutu.SelectedIndexChanged += (s, e) => Doldur();
                aramaKutu.TextChanged += (s, e) => Doldur();
                ekleBtn.Click += (s, e) =>
                {
                    if (!(liste.SelectedItem is PaletOgesi secilen)) return;
                    var kart = FindKart(secilen.KalemTipi, secilen.Id);
                    if (kart == null) return;
                    // secilen.KalemTipi hammadde ailesinde hep "hammadde" olur
                    // (bkz. OgeyeHammadde) — Sınıf için kartın KENDİ 'tip'
                    // alanından (hirdavat/plaka/kenar_bandi) okunması gerekir.
                    string sinif = secilen.KalemTipi == "hammadde" ? (string)kart["tip"] : secilen.KalemTipi;
                    var yeniDugum = new BilesenDugumu
                    {
                        ElleEklendi = true,
                        GosterimAdi = secilen.Ad,
                        MevcutKod = (string)(kart["kod"] ?? kart["stokKodu"]),
                        Sinif = sinif
                    };
                    ustDugum.Cocuklar.Add(yeniDugum);
                    dlg.DialogResult = DialogResult.OK;
                };
                dlg.Controls.Add(liste);
                dlg.Controls.Add(ekleBtn);
                dlg.Controls.Add(aramaKutu);
                dlg.Controls.Add(tipKutu);
                Doldur();
                if (dlg.ShowDialog(this) == DialogResult.OK) BilesenAgaciniCiz();
            }
        }

        // ✓ = URETIMOS_KOD dolu VE bu koda sahip bir ÜretimOS kartı bulundu
        //     (ürün/yarımamül/altmontaj/paket VEYA hammadde — bkz. KodileKartBul).
        // ⚠ = URETIMOS_KOD dolu ama karşılığı bir kart YOK (silinmiş/yazım hatası olabilir).
        // — = URETIMOS_KOD hiç yazılmamış (henüz eşleştirilmemiş).
        // Kullanıcı isteği: "bu listeye parçanın ebatı en boy yükseklikte
        // gelmeli ve üzerinde olan delik ve formlarda buraya işlensin" —
        // BilesenAgaci.cs'te toplanan ölçü/delik/form bilgisi burada ek bilgi
        // olarak satırın sonuna eklenir (yalnızca parça belgelerinde dolu olur).
        private string BilesenDugumMetni(BilesenDugumu dugum)
        {
            if (dugum.BelgeYuklenemedi) return "⚠ " + dugum.GosterimAdi;

            // NOT: delik/form sayısı BİLEREK burada YOK — kullanıcı isteği:
            // "delik özelliğini şimdilik yazmayalım, onu CNC yerleşiminde
            // yapacağız" (bkz. BilesenAgaci.cs'teki AYNI gerekçe).
            string ekBilgi = "";
            if (dugum.OlcuVar)
            {
                string kaynakEtiket = dugum.OlcuKaynagi == "equations" ? " eq" : "";
                ekBilgi += $"  ({dugum.BoyMm.ToString("0.#", CultureInfo.InvariantCulture)}×{dugum.EnMm.ToString("0.#", CultureInfo.InvariantCulture)}×{dugum.KalinlikMm.ToString("0.#", CultureInfo.InvariantCulture)}mm{kaynakEtiket})";
            }

            if (string.IsNullOrWhiteSpace(dugum.MevcutKod)) return "— (eşleşmemiş)  " + dugum.GosterimAdi + ekBilgi;
            bool kartVar = KodileKartBul(dugum.MevcutKod).kart != null;
            return (kartVar ? "✓ " : "⚠ (kart bulunamadı) ") + dugum.MevcutKod + " — " + dugum.GosterimAdi + ekBilgi;
        }

        // ── BİLEŞEN AĞACINI TOPLU OLARAK REÇETE OLARAK AKTAR ─────────────────
        // Kullanıcı isteği: "solidworks bileşen ağacı bölümünü olduğu gibi
        // reçete haline getirelim ve üretimosa atalım ... direkt bu haliyle
        // uretimosa aktaralım ve üretimos yeni kartlar ve kodları direkt
        // kaydetsin." ÖN KONTROL (kullanıcı onayı): hiçbir hammadde kartı
        // SESSİZCE OLUŞTURULMAZ — sınıfı hırdavat/panel/kenar bandı olup
        // mevcut bir kartla eşleşmeyen düğüm varsa aktarım DURDURULUR.
        private async System.Threading.Tasks.Task BilesenAgaciniReceteOlarakAktar()
        {
            if (_bilesenKokListesi == null || _bilesenKokListesi.Count == 0)
            {
                MessageBox.Show("Aktarılacak bir bileşen ağacı yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            // "uretimosa aktarılacak kalemleri bir kutucukla seçeyim, sadece
            // onlar aktarılsın" — işareti kaldırılmış bir düğüm VE onun tüm
            // alt dalı burada tamamen atlanır (kök kök listesine dokunulmaz,
            // yalnızca bu tek seferlik aktarım taramasından hariç tutulur).
            var tumDugumler = new List<BilesenDugumu>();
            void Topla(BilesenDugumu d)
            {
                if (!d.AktarimaDahil) return;
                tumDugumler.Add(d);
                foreach (var c in d.Cocuklar) Topla(c);
            }
            foreach (var d in _bilesenKokListesi) Topla(d);

            var sinifsizlar = tumDugumler.Where(d => !d.BelgeYuklenemedi && string.IsNullOrEmpty(d.Sinif)).ToList();
            var hammaddeSiniflari = new[] { "hirdavat", "plaka", "kenar_bandi", "sarf" };
            var eslesmeyenHammaddeler = tumDugumler.Where(d =>
                !d.BelgeYuklenemedi && !d.ElleEklendi &&
                hammaddeSiniflari.Contains(d.Sinif) &&
                !HammaddeKoduGecerliMi(d.MevcutKod)).ToList();

            if (sinifsizlar.Count > 0 || eslesmeyenHammaddeler.Count > 0)
            {
                var mesaj = new System.Text.StringBuilder("Aktarım durduruldu — önce şunları düzeltin:\n");
                if (sinifsizlar.Count > 0)
                {
                    mesaj.Append("\nSınıflandırılmamış ").Append(sinifsizlar.Count).Append(" bileşen:\n");
                    foreach (var d in sinifsizlar.Take(20)) mesaj.Append("  • ").Append(d.GosterimAdi).Append('\n');
                    if (sinifsizlar.Count > 20) mesaj.Append("  ... ve ").Append(sinifsizlar.Count - 20).Append(" tane daha.\n");
                }
                if (eslesmeyenHammaddeler.Count > 0)
                {
                    mesaj.Append("\nMevcut bir hammadde kartıyla eşleşmeyen ").Append(eslesmeyenHammaddeler.Count).Append(" bileşen (Hırdavat/Panel/Kenar Bandı/Sarf Malzeme):\n");
                    foreach (var d in eslesmeyenHammaddeler.Take(20))
                        mesaj.Append("  • ").Append(d.GosterimAdi).Append(string.IsNullOrEmpty(d.MevcutKod) ? "" : $" (kod: {d.MevcutKod})").Append('\n');
                    if (eslesmeyenHammaddeler.Count > 20) mesaj.Append("  ... ve ").Append(eslesmeyenHammaddeler.Count - 20).Append(" tane daha.\n");
                    mesaj.Append("\nBu bileşenleri seçip 'Farklı Kart Seç…' ile mevcut bir hammadde kartına eşleştirin ya da '+ Yeni Kart Oluştur…' ile oluşturun.");
                }
                MessageBox.Show(mesaj.ToString(), "ÜretimOS — Eksik Bilgi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            int siniflandirilmisSayisi = tumDugumler.Count(d => !d.BelgeYuklenemedi);
            if (MessageBox.Show(
                $"{siniflandirilmisSayisi} bileşen taranacak; eşleşmeyen yarı mamül/alt montaj/paket/ürünler için YENİ KART OLUŞTURULACAK ve reçete yapısı ÜretimOS'a kaydedilecek. Devam edilsin mi?",
                "ÜretimOS", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Bileşen ağacı reçeteye dönüştürülüyor…";
            try
            {
                var yeniKartlar = new Dictionary<string, List<object>>();
                var kullanilanKodlar = new HashSet<string>(
                    _urunler.Concat(_yarimamuller).Concat(_altMontajlar).Concat(_paketler)
                        .Select(k => (string)k["kod"]).Where(k => !string.IsNullOrEmpty(k)), StringComparer.OrdinalIgnoreCase);

                var kartCozumleri = new Dictionary<BilesenDugumu, (string tip, JObject kart)>();
                foreach (var d in tumDugumler)
                {
                    if (d.BelgeYuklenemedi) continue;
                    (string tip, JObject kart) cozum;
                    if (hammaddeSiniflari.Contains(d.Sinif))
                    {
                        var hammadde = _hammaddeler.FirstOrDefault(h =>
                            string.Equals((string)h["stokKodu"], d.MevcutKod, StringComparison.OrdinalIgnoreCase)
                            || (string)h["id"] == d.MevcutKod) as JObject;
                        cozum = ("hammadde", hammadde);
                    }
                    else
                    {
                        var mevcut = KodileKartBul(d.MevcutKod);
                        if (mevcut.kart != null && mevcut.tip == d.Sinif)
                        {
                            cozum = mevcut;
                        }
                        else
                        {
                            // YENİ KART — kod SolidWorks bileşeninin GERÇEK adından
                            // türetilir (TAHMİN edilen bir numaralandırma DEĞİL).
                            string kod = BenzersizKodUret(d.GosterimAdi, kullanilanKodlar);
                            kullanilanKodlar.Add(kod);
                            var yeniKart = YeniKartUret(d.Sinif, kod, d);
                            string koleksiyon = KoleksiyonAdiTipten(d.Sinif);
                            if (koleksiyon == null) continue;
                            if (!yeniKartlar.ContainsKey(koleksiyon)) yeniKartlar[koleksiyon] = new List<object>();
                            yeniKartlar[koleksiyon].Add(yeniKart);
                            cozum = (d.Sinif, yeniKart);
                        }
                    }
                    kartCozumleri[d] = cozum;
                }

                foreach (var grup in yeniKartlar)
                {
                    bool basarili = await _istemci.ToplukaEkleGuncelle(grup.Key, grup.Value, new List<object>());
                    if (!basarili) throw new Exception($"Sunucu '{grup.Key}' kartlarını reddetti (HTTP hata / yetki sorunu olabilir).");
                }
                foreach (var grup in yeniKartlar)
                {
                    var hedefListe = grup.Key == "urunler" ? _urunler : grup.Key == "yarimamuller" ? _yarimamuller
                        : grup.Key == "altMontajlar" ? _altMontajlar : _paketler;
                    foreach (JObject k in grup.Value) hedefListe.Add(k);
                }

                // Her düğümün SolidWorks dosyasına eşleşen kodu yaz — kalıcılık
                // (bkz. EslesmeYazVeUygula'daki AYNI gerekçe).
                foreach (var d in tumDugumler)
                {
                    if (d.BelgeYuklenemedi || d.ElleEklendi || d.Model == null) continue;
                    if (!kartCozumleri.TryGetValue(d, out var cozum) || cozum.kart == null) continue;
                    string kod = (string)cozum.kart["kod"] ?? (string)cozum.kart["stokKodu"];
                    if (string.IsNullOrWhiteSpace(kod)) continue;
                    try { KesimListesiCikarici.OzelAlanYaz(d.Model, OzelAlanlar.KOD, kod); d.MevcutKod = kod; }
                    catch (Exception ex) { Tanilama.Kaydet("BilesenAgaciniReceteOlarakAktar (URETIMOS_KOD yazılamadı) HATA: " + ex); }
                }

                // Reçete yapısını kur: reçete-taşıyan (hammadde OLMAYAN) her
                // düğümün ÇOCUKLARINI kalem olarak ekle — AYNI karta çözülen
                // kardeşler TEK bir kalemde TOPLANIR (miktar = tekrar sayısı).
                var receteMap = new Dictionary<string, JObject>();
                JObject ReceteBul(string tip, JObject kart)
                {
                    string anahtar = tip + "|" + (string)kart["id"];
                    if (receteMap.TryGetValue(anahtar, out var mevcutR)) return mevcutR;
                    string alanAdi = AlanAdiTipten(tip);
                    var recete = _receteler.FirstOrDefault(r => (string)r[alanAdi] == (string)kart["id"]) as JObject
                        ?? new JObject { ["id"] = "RC-" + Guid.NewGuid().ToString("N").Substring(0, 12).ToUpperInvariant(), ["ad"] = (string)kart["ad"] + " Reçetesi", ["kalemler"] = new JArray(), [alanAdi] = (string)kart["id"] };
                    receteMap[anahtar] = recete;
                    return recete;
                }

                var etkilenenReceteler = new List<object>();
                foreach (var d in tumDugumler)
                {
                    if (d.BelgeYuklenemedi) continue;
                    if (!kartCozumleri.TryGetValue(d, out var ustCozum) || ustCozum.kart == null || ustCozum.tip == "hammadde") continue;
                    if (d.Cocuklar.Count == 0) continue;

                    var recete = ReceteBul(ustCozum.tip, ustCozum.kart);
                    var kalemler = (JArray)recete["kalemler"];
                    bool receteDegisti = false;

                    var gruplar = d.Cocuklar.Where(c => kartCozumleri.ContainsKey(c) && kartCozumleri[c].kart != null)
                        .GroupBy(c => kartCozumleri[c]);
                    foreach (var grup in gruplar)
                    {
                        var (cocukTip, cocukKart) = grup.Key;
                        bool zatenVar = kalemler.OfType<JObject>().Any(k => (string)k["tip"] == cocukTip && (string)k["refId"] == (string)cocukKart["id"]);
                        if (zatenVar) continue;

                        var ilkCocuk = grup.First();
                        var yeniKalem = new JObject
                        {
                            ["id"] = "RK-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                            ["tip"] = cocukTip,
                            ["refId"] = (string)cocukKart["id"],
                            ["miktar"] = grup.Count(),
                            ["birim"] = "ADET"
                        };
                        // "kenar bandını 4 kenardan hangisine hangi tip
                        // eklediğimizi de çıkartalım" — web'in kalemBaglami.
                        // kenarBantlari/olcu ile AYNI şekilde kaleme yazılır,
                        // ÜretimOS'un kendi Reçete Ağaç Editörü'nde de görünür.
                        if (ilkCocuk.Sinif == "plaka")
                        {
                            yeniKalem["olcu"] = new JObject { ["netEn"] = ilkCocuk.TaslakEnMm, ["netBoy"] = ilkCocuk.TaslakBoyMm, ["kabaEn"] = ilkCocuk.TaslakEnMm, ["kabaBoy"] = ilkCocuk.TaslakBoyMm };
                            var kenarlar = new JObject();
                            if (!string.IsNullOrEmpty(ilkCocuk.KenarOnId)) kenarlar["on"] = ilkCocuk.KenarOnId;
                            if (!string.IsNullOrEmpty(ilkCocuk.KenarArkaId)) kenarlar["arka"] = ilkCocuk.KenarArkaId;
                            if (!string.IsNullOrEmpty(ilkCocuk.KenarSolId)) kenarlar["sol"] = ilkCocuk.KenarSolId;
                            if (!string.IsNullOrEmpty(ilkCocuk.KenarSagId)) kenarlar["sag"] = ilkCocuk.KenarSagId;
                            if (kenarlar.Count > 0) yeniKalem["kenarBantlari"] = kenarlar;
                        }
                        kalemler.Add(yeniKalem);
                        receteDegisti = true;
                    }
                    if (receteDegisti && !etkilenenReceteler.Contains(recete)) etkilenenReceteler.Add(recete);
                }

                if (etkilenenReceteler.Count > 0)
                {
                    bool receteBasarili = await _istemci.ToplukaEkleGuncelle("receteler", etkilenenReceteler, new List<object>());
                    if (!receteBasarili) throw new Exception("Sunucu 'receteler' kaydını reddetti (HTTP hata).");
                    foreach (JObject r in etkilenenReceteler)
                        if (!_receteler.Contains(r)) _receteler.Add(r);
                }

                int yeniKartSayisi = yeniKartlar.Values.Sum(l => l.Count);
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ Bileşen ağacı ÜretimOS'a aktarıldı — {yeniKartSayisi} yeni kart, {etkilenenReceteler.Count} reçete kaydedildi.";
                Tanilama.Kaydet($"BilesenAgaciniReceteOlarakAktar: kart={yeniKartSayisi}, recete={etkilenenReceteler.Count}");
                BilesenAgaciniCiz();
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BilesenAgaciniReceteOlarakAktar HATA: " + ex);
                MessageBox.Show("Aktarım sırasında hata: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Aktarım başarısız: " + ex.Message;
            }
        }

        private bool HammaddeKoduGecerliMi(string kod)
        {
            if (string.IsNullOrWhiteSpace(kod)) return false;
            return _hammaddeler.Any(h => string.Equals((string)h["stokKodu"], kod, StringComparison.OrdinalIgnoreCase) || (string)h["id"] == kod);
        }

        // SolidWorks bileşeninin GERÇEK adından türetilmiş, benzersiz bir kod
        // üretir — TAHMİN EDİLEN bir şirket numaralandırma şeması DEĞİL,
        // doğrudan bileşenin kendi (kullanıcı tarafından SolidWorks'te
        // verilmiş) adına dayanır; çakışma olursa sayısal sonek eklenir.
        private static string BenzersizKodUret(string ad, HashSet<string> kullanilanKodlar)
        {
            string kaynak = (ad ?? "PARCA").ToUpperInvariant()
                .Replace('Ç', 'C').Replace('Ğ', 'G').Replace('İ', 'I').Replace('Ö', 'O').Replace('Ş', 'S').Replace('Ü', 'U');
            var sb = new System.Text.StringBuilder();
            foreach (char c in kaynak) sb.Append(char.IsLetterOrDigit(c) && c < 128 ? c : '_');
            string taban = sb.ToString();
            while (taban.Contains("__")) taban = taban.Replace("__", "_");
            taban = taban.Trim('_');
            if (string.IsNullOrEmpty(taban)) taban = "PARCA";
            string aday = taban;
            int sayac = 1;
            while (kullanilanKodlar.Contains(aday)) aday = taban + "_" + (++sayac);
            return aday;
        }

        // Bulk aktarımda eşleşmeyen bir düğüm için sıfırdan kart üretir —
        // YeniKartFormlari.cs'teki alan şemasıyla AYNI (yalnızca burada
        // diyalog YOK, tüm alanlar makul varsayılanlarla otomatik doldurulur;
        // kullanıcı isteği: "üretimos yeni kartlar ve kodları direkt kaydetsin").
        private static JObject YeniKartUret(string sinif, string kod, BilesenDugumu d)
        {
            var kart = new JObject { ["id"] = sinif.Substring(0, System.Math.Min(3, sinif.Length)).ToUpperInvariant() + "-" + Guid.NewGuid().ToString("N").Substring(0, 8).ToUpperInvariant() };
            kart["kod"] = kod;
            kart["ad"] = d.GosterimAdi;
            kart["gorseller"] = new JArray();
            kart["olusturmaTarihi"] = DateTime.Now.ToString("yyyy-MM-dd");
            switch (sinif)
            {
                case "yarimamul":
                    kart["netBoy"] = d.TaslakBoyMm > 0 ? (JToken)d.TaslakBoyMm : null;
                    kart["netEn"] = d.TaslakEnMm > 0 ? (JToken)d.TaslakEnMm : null;
                    kart["kalinlik"] = d.TaslakKalinlikMm > 0 ? (JToken)d.TaslakKalinlikMm : null;
                    kart["adet"] = 1;
                    kart["rotaId"] = null;
                    kart["amortismanGideri"] = 0;
                    kart["gygOraniYuzde"] = 0;
                    kart["kapasiteGunlukMax"] = 0; kart["kapasiteHaftalikMax"] = 0; kart["kapasiteAylikMax"] = 0;
                    kart["aciklama"] = "";
                    break;
                case "altmontaj":
                    kart["aciklama"] = "";
                    kart["rotaId"] = null; kart["amortismanGideri"] = 0; kart["gygOraniYuzde"] = 0;
                    break;
                case "paket":
                    kart["ambalajTipi"] = "Koli"; kart["koliIciAdet"] = 1;
                    kart["en"] = 0; kart["boy"] = 0; kart["yukseklik"] = 0; kart["netAgirlik"] = 0; kart["brutAgirlik"] = 0;
                    kart["aciklama"] = ""; kart["rotaId"] = null; kart["amortismanGideri"] = 0; kart["gygOraniYuzde"] = 0;
                    break;
                case "urun":
                    kart["tip"] = "bitmis_urun";
                    kart["aciklama"] = ""; kart["rotaId"] = null; kart["amortismanGideri"] = 0; kart["gygOraniYuzde"] = 0;
                    kart["kapasiteGunlukMax"] = 0; kart["kapasiteHaftalikMax"] = 0; kart["kapasiteAylikMax"] = 0;
                    kart["en"] = 0; kart["boy"] = 0; kart["yukseklik"] = 0; kart["netAgirlik"] = 0; kart["brutAgirlik"] = 0;
                    break;
            }
            return kart;
        }

        // URETIMOS_KOD custom property'sine göre önce 4 reçete-taşıyan
        // koleksiyonda (ürün/yarımamül/altmontaj/paket, 'kod' alanı), sonra
        // — kullanıcı isteği: "mevcut hammadde kartlarıyla ... eşleştirebileyim" —
        // hammaddeler'de ('stokKodu' alanı) arar. Bir SolidWorks bileşeni
        // doğrudan bir hammadde karşılığı olabilir (ör. modellenmiş bir plaka/
        // hırdavat parçası); hammadde kartlarının kendi reçetesi olmadığı için
        // bu durumda aşağıdaki reçete editörü BİLEREK boş kalır (bkz. BilesenSecildi).
        private (string tip, JObject kart) KodileKartBul(string kod)
        {
            if (string.IsNullOrWhiteSpace(kod)) return (null, null);
            foreach (var (liste, tip) in new[] { (_urunler, "urun"), (_yarimamuller, "yarimamul"), (_altMontajlar, "altmontaj"), (_paketler, "paket") })
            {
                var eslesen = liste?.FirstOrDefault(k => string.Equals((string)k["kod"], kod, StringComparison.OrdinalIgnoreCase)) as JObject;
                if (eslesen != null) return (tip, eslesen);
            }
            var hammaddeEslesen = _hammaddeler?.FirstOrDefault(h => string.Equals((string)h["stokKodu"], kod, StringComparison.OrdinalIgnoreCase)) as JObject;
            if (hammaddeEslesen != null) return ("hammadde", hammaddeEslesen);
            return (null, null);
        }

        // Alt taraftaki reçete editörünü/üst bilgi panellerini "kart yok"
        // durumuna sıfırlar — hem "hiç eşleşmemiş" hem "hammadde kartıyla
        // eşleşti" (reçetesi olmayan) durumları AYNI temizliği paylaşır.
        private void KokKartYokGoster(string mesaj)
        {
            _kokTip = null; _kokKart = null;
            _kaydetBtn.Enabled = false;
            _agacGorunumu.Controls.Clear();
            _rotaPanel.Visible = false;
            _paketOlcuPanel.Visible = false;
            _kokKartEtiketi.Text = mesaj;
        }

        // Bileşen ağacında bir düğüme tıklanınca çağrılır — kullanıcı isteği:
        // "eğer bunu uretimostaki mevcut kartlarla eşleştirdiysem yine o
        // bilgilerle gelsin ancak istersem değiştirebileyim": kod zaten
        // eşleşiyorsa OTOMATİK o kartın reçetesini açar; eşleşmiyorsa/boşsa
        // TAHMİN ETMEZ, kullanıcıyı 'Farklı Kart Seç…'e ya da '+ Yeni Kart
        // Oluştur…'a yönlendirir.
        private void BilesenSecildi(BilesenDugumu dugum)
        {
            _seciliBilesenDugumu = dugum;
            if (dugum == null || !_verilerYuklendi) return;

            if (dugum.BelgeYuklenemedi)
            {
                KokKartYokGoster(dugum.GosterimAdi);
                return;
            }

            var (bulunanTip, bulunanKart) = KodileKartBul(dugum.MevcutKod);
            if (bulunanTip == "hammadde" && bulunanKart != null)
            {
                KokKartYokGoster($"✓ '{dugum.MevcutKod}' bir HAMMADDE kartıyla eşleşti: {bulunanKart["ad"]}. " +
                    "Hammaddelerin kendi reçetesi olmadığı için burada düzenlenecek bir şey yok — eşleşme kaydedildi.");
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = "✓ Hammadde kartıyla eşleşme onaylandı.";
            }
            else if (bulunanKart != null)
            {
                KokKartAyarla(bulunanTip, bulunanKart);
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ '{dugum.MevcutKod}' koduna göre kart otomatik eşleşti.";
            }
            else
            {
                KokKartYokGoster(string.IsNullOrWhiteSpace(dugum.MevcutKod)
                    ? $"'{dugum.GosterimAdi}' henüz bir ÜretimOS kartıyla eşleştirilmemiş — 'Farklı Kart Seç…' ile eşleştirin ya da soldan '+ Yeni Kart Oluştur…' ile oluşturun."
                    : $"'{dugum.GosterimAdi}' için kayıtlı kod '{dugum.MevcutKod}' ile eşleşen bir ÜretimOS kartı bulunamadı — 'Farklı Kart Seç…' ile eşleştirin.");
            }
        }

        // Seçili SolidWorks bileşenini verilen karta eşleştirir VE bu eşleşmeyi
        // bileşenin KENDİ dosyasındaki URETIMOS_KOD özel alanına YAZAR —
        // kullanıcı isteği: "ister aynı dosyada ister farklı dosyada
        // çağrıldığında aynı bilgiler ile ... açılsın" — özel alan fiziksel
        // dosyayla birlikte taşındığı için bu, hangi montajdan açılırsa
        // açılsın (ya da dosya tek başına açılsa da) eşleşmenin KALICI
        // olmasını sağlar (bkz. KesimListesiCikarici.OzelAlanYaz).
        private void EslesmeYazVeUygula(string tip, JObject kart)
        {
            if (kart == null) return;
            if (_seciliBilesenDugumu?.Model != null)
            {
                string kod = (string)kart["kod"] ?? (string)kart["stokKodu"];
                if (!string.IsNullOrWhiteSpace(kod))
                {
                    try
                    {
                        KesimListesiCikarici.OzelAlanYaz(_seciliBilesenDugumu.Model, OzelAlanlar.KOD, kod);
                        _seciliBilesenDugumu.MevcutKod = kod;
                        BilesenAgaciniCiz();
                    }
                    catch (Exception ex)
                    {
                        Tanilama.Kaydet("EslesmeYazVeUygula (URETIMOS_KOD yazılamadı) HATA: " + ex);
                    }
                }
            }

            // Hammadde kartlarının kendi reçetesi yok — KokKartAyarla'yı
            // ÇAĞIRMAYIZ, aksi halde AlanAdiTipten'in bilmediği bir tip için
            // yanlış bir alanla (ör. paketId) hayalet bir 'hammadde reçetesi'
            // taslağı oluşturulabilirdi. Yalnızca eşleşme kaydedilir.
            if (tip == "hammadde")
            {
                KokKartYokGoster($"✓ Hammadde kartıyla eşleşti: {kart["stokKodu"] ?? kart["id"]} — {kart["ad"]}. " +
                    "Hammaddelerin kendi reçetesi olmadığı için burada düzenlenecek bir şey yok.");
                return;
            }
            KokKartAyarla(tip, kart);
        }

        // ── PALET (SOLDAKİ LİSTE) ────────────────────────────────────────────
        private void PaletiFiltrele()
        {
            if (!_verilerYuklendi) return;
            string secim = _paletTipKutusu.SelectedItem as string ?? "Paket";
            string arama = (_paletAramaKutusu.Text ?? "").Trim().ToLowerInvariant();

            IEnumerable<PaletOgesi> kaynak;
            switch (secim)
            {
                case "Ürün": kaynak = _urunler.Select(k => Ogeye(k, "urun", "Ürün")); break;
                case "Paket": kaynak = _paketler.Select(k => Ogeye(k, "paket", "Paket")); break;
                case "Yarı Mamül": kaynak = _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül")); break;
                case "Alt Montaj": kaynak = _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj")); break;
                case "Hırdavat": kaynak = _hammaddeler.Where(h => (string)h["tip"] == "hirdavat").Select(k => OgeyeHammadde(k, "Hırdavat")); break;
                case "Plaka": kaynak = _hammaddeler.Where(h => (string)h["tip"] == "plaka").Select(k => OgeyeHammadde(k, "Plaka")); break;
                case "Kenar Bandı": kaynak = _hammaddeler.Where(h => (string)h["tip"] == "kenar_bandi").Select(k => OgeyeHammadde(k, "Kenar Bandı")); break;
                case "Sarf Malzeme": kaynak = _hammaddeler.Where(h => (string)h["tip"] == "sarf").Select(k => OgeyeHammadde(k, "Sarf Malzeme")); break;
                default: kaynak = Enumerable.Empty<PaletOgesi>(); break;
            }

            _paletTumOgeler = kaynak.Where(o => o != null &&
                (string.IsNullOrEmpty(arama) || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama)))
                .OrderBy(o => o.Kod).Take(300).ToList();

            _paletListesi.Items.Clear();
            _paletListesi.Items.AddRange(_paletTumOgeler.ToArray());
        }

        private PaletOgesi Ogeye(JToken k, string kalemTipi, string gosterimTipi)
        {
            string id = (string)k["id"];
            // TAM "kullanıldığı yerler" analizi — yarımamül/altmontaj için,
            // bu kartın kalem olarak geçtiği TÜM üst kartlar (bkz. NeredeKullaniliyor).
            var kullanim = (kalemTipi == "yarimamul" || kalemTipi == "altmontaj") ? NeredeKullaniliyor(kalemTipi, id) : null;
            return new PaletOgesi
            {
                KalemTipi = kalemTipi, GosterimTipi = gosterimTipi,
                Id = id, Kod = (string)k["kod"] ?? id, Ad = (string)k["ad"] ?? "",
                KullanimListesi = kullanim,
                OlcuAgirlikMetni = kalemTipi == "paket" ? PaketOlcuOzeti(k as JObject) : null
            };
        }

        private PaletOgesi OgeyeHammadde(JToken k, string gosterimTipi) => new PaletOgesi
        {
            KalemTipi = "hammadde", GosterimTipi = gosterimTipi,
            Id = (string)k["id"], Kod = (string)k["stokKodu"] ?? (string)k["id"], Ad = (string)k["ad"] ?? ""
        };

        // ── YENİ KART OLUŞTUR ────────────────────────────────────────────────
        // Palette tip kutusunda seçili olan tipte (Paket/Yarı Mamül/Alt Montaj/
        // Hırdavat/Plaka/Kenar Bandı) sıfırdan bir kart oluşturur, ÜretimOS'a
        // HEMEN kaydeder (ÜretimOS'un kendi web ekranlarındaki "Kaydet"
        // davranışıyla AYNI — reçete taslak değişiklikleri gibi ertelenmez)
        // ve yerel listeye/palete ekler.
        private async System.Threading.Tasks.Task YeniKartOlustur()
        {
            if (!_verilerYuklendi || _istemci == null) return;

            string secim = _paletTipKutusu.SelectedItem as string ?? "Paket";
            string kartTipi;
            switch (secim)
            {
                case "Ürün": kartTipi = "urun"; break;
                case "Paket": kartTipi = "paket"; break;
                case "Yarı Mamül": kartTipi = "yarimamul"; break;
                case "Alt Montaj": kartTipi = "altmontaj"; break;
                case "Hırdavat": kartTipi = "hirdavat"; break;
                case "Plaka": kartTipi = "plaka"; break;
                case "Kenar Bandı": kartTipi = "kenar_bandi"; break;
                default: return;
            }

            JObject yeniKart;
            using (var dlg = new YeniKartDialog(kartTipi, _hammaddeler))
            {
                if (dlg.ShowDialog(this) != DialogResult.OK || dlg.SonucKart == null) return;
                yeniKart = dlg.SonucKart;
            }

            string koleksiyonAnahtari =
                (kartTipi == "plaka" || kartTipi == "kenar_bandi" || kartTipi == "hirdavat") ? "hammaddeler"
                : kartTipi == "yarimamul" ? "yarimamuller"
                : kartTipi == "altmontaj" ? "altMontajlar"
                : kartTipi == "urun" ? "urunler"
                : "paketler";

            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Kart ÜretimOS'a kaydediliyor…";

            bool basarili;
            try
            {
                basarili = await _istemci.ToplukaEkleGuncelle(koleksiyonAnahtari,
                    new List<object> { yeniKart }, new List<object>());
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("YeniKartOlustur HATA: " + ex);
                basarili = false;
            }

            if (!basarili)
            {
                // KESİN TANI (bkz. api.php CAD_ENT_YAZILABILIR): "cad_entegrasyon"
                // rolü yalnızca yarimamuller/paketler/urunler/receteler/rotalar'a
                // yazabilir — hammaddeler VE altMontajlar dahil DEĞİL. Sessizce
                // "başarısız" demek yerine kullanıcıya GERÇEK nedeni açıklıyoruz.
                string ekAciklama = (koleksiyonAnahtari == "hammaddeler" || koleksiyonAnahtari == "altMontajlar")
                    ? "\n\nNot: 'cad_entegrasyon' rolündeki hesaplar hammadde/alt montaj kartı OLUŞTURAMAZ " +
                      "(ÜretimOS sunucusunda bilinçli bir kısıtlama) — yalnızca yarı mamül/paket oluşturabilir. " +
                      "baglanti.json'da tam yetkili bir hesap kullanmanız gerekebilir."
                    : "";
                MessageBox.Show(
                    "Kart ÜretimOS'a kaydedilemedi (sunucu reddetti)." + ekAciklama,
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Kart kaydedilemedi.";
                return;
            }

            switch (koleksiyonAnahtari)
            {
                case "hammaddeler": _hammaddeler.Add(yeniKart); break;
                case "yarimamuller": _yarimamuller.Add(yeniKart); break;
                case "altMontajlar": _altMontajlar.Add(yeniKart); break;
                case "urunler": _urunler.Add(yeniKart); break;
                case "paketler": _paketler.Add(yeniKart); break;
            }

            PaletiFiltrele();
            string yeniId = (string)yeniKart["id"];
            for (int i = 0; i < _paletListesi.Items.Count; i++)
            {
                if (_paletListesi.Items[i] is PaletOgesi oge && oge.Id == yeniId)
                {
                    _paletListesi.SelectedIndex = i;
                    break;
                }
            }

            // Kullanıcı isteği doğrultusunda: yeni oluşturulan kart, KENDİ
            // reçetesi olabilen bir tip İSE (yarımamül/alt montaj/paket —
            // hammadde/plaka/kenar bandı/hırdavat DEĞİL, onların kendi
            // reçetesi olmaz) VE ağaçta o an seçili bir SolidWorks bileşeni
            // varsa, bu yeni kart OTOMATİK olarak o bileşenle eşleştirilir
            // (URETIMOS_KOD'a yazılarak kalıcı olur) — "boş bileşen seç →
            // yeni kart oluştur" akışını tek adıma indirir.
            if (_seciliBilesenDugumu != null && (kartTipi == "yarimamul" || kartTipi == "altmontaj" || kartTipi == "paket" || kartTipi == "urun"))
            {
                EslesmeYazVeUygula(kartTipi, yeniKart);
            }

            _durumEtiketi.ForeColor = Color.DarkGreen;
            _durumEtiketi.Text = $"✓ Yeni kart ÜretimOS'a kaydedildi: {(string)yeniKart["ad"]}";
        }

        // TAM "kullanıldığı yerler" analizi — bu (tip,id) kartının kalem
        // olarak geçtiği TÜM reçeteleri tarar (paket/alt montaj/ürün fark
        // etmeksizin — yalnızca paketId'li kayıtlarla SINIRLI DEĞİL, önceki
        // sürümdeki "yalnızca hangi pakette" sınırlaması KALDIRILDI).
        // O(n) — palet en fazla 300 öge gösterdiği ve reçete sayısı makul
        // olduğu için kabul edilebilir bir maliyettir. NOT: bu bir ANLIK
        // görüntüdür — ağaç panelinde yapılan (henüz Kaydet'e basılmamış)
        // taslak değişiklikler, palet yalnızca arama/tip filtresi
        // değiştiğinde yeniden hesaplandığı için hemen yansımayabilir.
        private List<(string ustTip, JObject ustKart, double miktar)> NeredeKullaniliyor(string tip, string id)
        {
            var sonuc = new List<(string, JObject, double)>();
            foreach (var r in _receteler.OfType<JObject>())
            {
                var kalemler = r["kalemler"] as JArray;
                if (kalemler == null) continue;
                foreach (var k in kalemler.OfType<JObject>())
                {
                    if ((string)k["tip"] == tip && (string)k["refId"] == id)
                    {
                        var (ustTip, ustKart) = SahipKartCoz(r);
                        if (ustKart != null) sonuc.Add((ustTip, ustKart, (double?)k["miktar"] ?? 1));
                    }
                }
            }
            return sonuc;
        }

        // Bir reçete kaydının SAHİBİ olan kartı bulur — urunId/yarimamulId/
        // altMontajId/paketId alanlarından hangisi doluysa o karttır.
        private (string tip, JObject kart) SahipKartCoz(JObject recete)
        {
            foreach (var tip in new[] { "urun", "yarimamul", "altmontaj", "paket" })
            {
                string kartId = (string)recete[AlanAdiTipten(tip)];
                if (string.IsNullOrEmpty(kartId)) continue;
                var kart = FindKart(tip, kartId);
                if (kart != null) return (tip, kart);
            }
            return (null, null);
        }

        private string PaketOlcuOzeti(JObject paket)
        {
            if (paket == null) return null;
            double en = (double?)paket["en"] ?? 0, boy = (double?)paket["boy"] ?? 0, yuk = (double?)paket["yukseklik"] ?? 0;
            double brut = (double?)paket["brutAgirlik"] ?? 0;
            if (en <= 0 && boy <= 0 && yuk <= 0 && brut <= 0) return "ölçü/ağırlık girilmemiş";
            return string.Format(CultureInfo.InvariantCulture, "{0:0.#}×{1:0.#}×{2:0.#} cm, {3:0.#} kg brüt", en, boy, yuk, brut);
        }

        // ── KÖK KART SEÇİMİ ──────────────────────────────────────────────────
        // baslangicTipi: "panel seçtiğimde muhakkak hammadde de seçmem
        // gerekiyor" — bir hammadde ailesi Sınıf'ı seçilir seçilmez dialog
        // doğrudan o tipten (ör. "Plaka") açılsın diye BilesenAnaSatiriOlustur
        // tarafından verilir; elle açılan normal kullanımda null kalır (Ürün).
        private void KokKartSeciciAc(string baslangicTipi = null)
        {
            using (var secici = new Form { Text = "Reçete Hedefi Seç", Width = 480, Height = 520, StartPosition = FormStartPosition.CenterParent })
            {
                var tipKutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
                // Kullanıcı isteği: "mevcut hammadde kartlarıyla ... sol
                // sütundaki tüm kompanentlerini eşleştirebileyim" — Plaka/
                // Kenar Bandı/Hırdavat da seçilebilir hedef tipleri arasına
                // eklendi (bkz. EslesmeYazVeUygula'nın "hammadde" dalı — bu
                // kartların kendi reçetesi olmaz, yalnızca eşleşme kaydedilir).
                tipKutu.Items.AddRange(new object[] { "Ürün", "Yarı Mamül", "Alt Montaj", "Paket", "Plaka", "Kenar Bandı", "Hırdavat", "Sarf Malzeme" });
                int baslangicIndex = baslangicTipi != null ? tipKutu.Items.IndexOf(baslangicTipi) : -1;
                tipKutu.SelectedIndex = baslangicIndex >= 0 ? baslangicIndex : 0;
                var aramaKutu = new TextBox { Dock = DockStyle.Top };
                var liste = new ListBox { Dock = DockStyle.Fill };
                var tamamBtn = new Button { Text = "Seç", Dock = DockStyle.Bottom };

                List<PaletOgesi> mevcutListe = new List<PaletOgesi>();
                void Doldur()
                {
                    string tip = tipKutu.SelectedItem as string;
                    IEnumerable<PaletOgesi> kaynak = tip == "Ürün" ? _urunler.Select(k => Ogeye(k, "urun", "Ürün"))
                        : tip == "Yarı Mamül" ? _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül"))
                        : tip == "Alt Montaj" ? _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj"))
                        : tip == "Paket" ? _paketler.Select(k => Ogeye(k, "paket", "Paket"))
                        : tip == "Plaka" ? _hammaddeler.Where(h => (string)h["tip"] == "plaka").Select(k => OgeyeHammadde(k, "Plaka"))
                        : tip == "Kenar Bandı" ? _hammaddeler.Where(h => (string)h["tip"] == "kenar_bandi").Select(k => OgeyeHammadde(k, "Kenar Bandı"))
                        : tip == "Sarf Malzeme" ? _hammaddeler.Where(h => (string)h["tip"] == "sarf").Select(k => OgeyeHammadde(k, "Sarf Malzeme"))
                        : _hammaddeler.Where(h => (string)h["tip"] == "hirdavat").Select(k => OgeyeHammadde(k, "Hırdavat"));
                    string arama = (aramaKutu.Text ?? "").Trim().ToLowerInvariant();
                    mevcutListe = kaynak.Where(o => string.IsNullOrEmpty(arama) || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama))
                        .OrderBy(o => o.Kod).Take(300).ToList();
                    liste.Items.Clear();
                    liste.Items.AddRange(mevcutListe.ToArray());
                }
                tipKutu.SelectedIndexChanged += (s, e) => Doldur();
                aramaKutu.TextChanged += (s, e) => Doldur();
                tamamBtn.Click += (s, e) =>
                {
                    if (liste.SelectedItem is PaletOgesi secilen)
                    {
                        var kart = FindKart(secilen.KalemTipi, secilen.Id);
                        // EslesmeYazVeUygula (KokKartAyarla YERİNE): seçilen kart,
                        // (varsa) ağaçta seçili SolidWorks bileşeninin KENDİ
                        // URETIMOS_KOD özel alanına da yazılır — böylece bu
                        // eşleşme, dosya tekrar açıldığında/başka bir montajdan
                        // çağrıldığında KALICI olarak aynen görünür.
                        if (kart != null) EslesmeYazVeUygula(secilen.KalemTipi, kart);
                        secici.DialogResult = DialogResult.OK;
                    }
                };

                secici.Controls.Add(liste);
                secici.Controls.Add(tamamBtn);
                secici.Controls.Add(aramaKutu);
                secici.Controls.Add(tipKutu);
                Doldur();
                secici.ShowDialog(this);
            }
        }

        private JObject FindKart(string tip, string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            var liste = tip == "urun" ? _urunler : tip == "yarimamul" ? _yarimamuller : tip == "altmontaj" ? _altMontajlar
                : tip == "paket" ? _paketler : _hammaddeler;
            return liste?.FirstOrDefault(k => (string)k["id"] == id) as JObject;
        }

        private void KokKartAyarla(string tip, JObject kart)
        {
            _kokTip = tip;
            _kokKart = kart;
            var recete = ReceteGetir(tip, kart);
            string tipEtiket = tip == "urun" ? "ÜRÜN" : tip == "yarimamul" ? "YARI MAMÜL" : tip == "altmontaj" ? "ALT MONTAJ" : "PAKET";
            _kokKartEtiketi.Text = $"[{tipEtiket}] {kart["kod"]} — {kart["ad"]}" + (recete == null ? "  (henüz reçetesi yok — kaydedince oluşturulacak)" : "");
            _kaydetBtn.Enabled = true;
            AgaciYenidenCiz();
            UstBilgiPanelleriGuncelle();
        }

        private void UstBilgiPanelleriGuncelle()
        {
            RotaPanelGuncelle();
            PaketOlcuPanelGuncelle();
        }

        // ── ROTA SEÇ / OLUŞTUR ───────────────────────────────────────────────
        private void RotaPanelGuncelle()
        {
            _rotaPanel.Visible = _kokTip == "yarimamul" && _kokKart != null;
            if (!_rotaPanel.Visible) return;
            string rotaId = (string)_kokKart["rotaId"];
            var rota = _rotalar?.FirstOrDefault(r => (string)r["id"] == rotaId);
            _rotaKutusu.Items.Clear();
            _rotaKutusu.Items.Add(rota != null ? $"Mevcut rota: {rota["ad"]}" : "Rota atanmamış");
            _rotaKutusu.SelectedIndex = 0;
        }

        // "her yarımamülde" isteği: bu diyalog hem KÖK kart bir yarımamül
        // olduğunda (üst paneldeki "Rota Seç/Oluştur" butonu) hem de ağaca
        // eklenen HER yarımamül KALEMİ için (sağ tık menüsü) AYNI şekilde
        // açılır — kartın kendisi parametre olarak verilir, ikisi de aynı
        // 'yarimamuller' koleksiyonundaki kaydı günceller.
        private async System.Threading.Tasks.Task RotaSecVeyaOlusturDialogAc(JObject yarimamulKart)
        {
            using (var dlg = new Form { Text = "Rota Seç / Oluştur — " + yarimamulKart["kod"], Width = 420, Height = 200, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var mevcutRotaId = (string)yarimamulKart["rotaId"];
                var kutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList, Margin = new Padding(10) };
                var rotaListesi = _rotalar.OfType<JObject>().ToList();
                kutu.Items.Add("— Seçilmedi —");
                foreach (var r in rotaListesi) kutu.Items.Add($"{r["kod"]} — {r["ad"]}");
                int mevcutIndex = rotaListesi.FindIndex(r => (string)r["id"] == mevcutRotaId);
                kutu.SelectedIndex = mevcutIndex >= 0 ? mevcutIndex + 1 : 0;

                var secBtn = new Button { Text = "Bu Rotayı Ata", Dock = DockStyle.Top };
                var ayirici = new Label { Text = "— veya —", Dock = DockStyle.Top, TextAlign = ContentAlignment.MiddleCenter, Height = 24 };
                var yeniKodKutu = new TextBox { Dock = DockStyle.Top };
                var yeniKodEtiket = new Label { Text = "Yeni rota kodu:", Dock = DockStyle.Top, Height = 18 };
                var yeniAdKutu = new TextBox { Dock = DockStyle.Top };
                var yeniAdEtiket = new Label { Text = "Yeni rota adı:", Dock = DockStyle.Top, Height = 18 };
                var yeniOlusturBtn = new Button { Text = "+ Yeni Rota Oluştur ve Ata", Dock = DockStyle.Top };

                bool degisti = false;
                secBtn.Click += async (s, e) =>
                {
                    string secilenId = kutu.SelectedIndex > 0 ? (string)rotaListesi[kutu.SelectedIndex - 1]["id"] : null;
                    yarimamulKart["rotaId"] = secilenId;
                    try
                    {
                        await _istemci.ToplukaEkleGuncelle("yarimamuller", new List<object>(), new List<object> { yarimamulKart });
                        degisti = true;
                        dlg.DialogResult = DialogResult.OK;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Kaydedilemedi: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                };
                yeniOlusturBtn.Click += async (s, e) =>
                {
                    string kod = yeniKodKutu.Text.Trim(), ad = yeniAdKutu.Text.Trim();
                    if (string.IsNullOrEmpty(kod) || string.IsNullOrEmpty(ad))
                    {
                        MessageBox.Show("Kod ve ad zorunlu.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    // Rota adımları (istasyon/süre) BİLİNÇLİ olarak boş bırakılır —
                    // ÜretimOS'un kendi Rota ekranındaki "hazır şablondan kur"
                    // akışı (rota_sablon.js) burada YENİDEN İNŞA EDİLMEDİ (fabrikanın
                    // gerçek hat/makine listesinden istasyon eşleştirmesi gerektirir,
                    // bu panelin kapsamı dışında) — kullanıcı adımları ÜretimOS'un
                    // kendi Rota ekranından tamamlar, TAHMİN EDİLMEZ.
                    var yeniRota = new JObject { ["id"] = "RT-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(), ["kod"] = kod, ["ad"] = ad, ["steps"] = new JArray() };
                    yarimamulKart["rotaId"] = (string)yeniRota["id"];
                    try
                    {
                        await _istemci.ToplukaEkleGuncelle("rotalar", new List<object> { yeniRota }, new List<object>());
                        await _istemci.ToplukaEkleGuncelle("yarimamuller", new List<object>(), new List<object> { yarimamulKart });
                        _rotalar.Add(yeniRota);
                        degisti = true;
                        MessageBox.Show(
                            "Rota oluşturuldu ve atandı. Adımları (istasyon/süre) ÜretimOS'un kendi " +
                            "'Rota' ekranından tamamlayın — burada TAHMİN EDİLMEDİ.",
                            "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        dlg.DialogResult = DialogResult.OK;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Oluşturulamadı: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                };

                dlg.Controls.Add(yeniOlusturBtn);
                dlg.Controls.Add(yeniAdKutu);
                dlg.Controls.Add(yeniAdEtiket);
                dlg.Controls.Add(yeniKodKutu);
                dlg.Controls.Add(yeniKodEtiket);
                dlg.Controls.Add(ayirici);
                dlg.Controls.Add(secBtn);
                dlg.Controls.Add(kutu);
                dlg.ShowDialog(this);
                if (degisti) _durumEtiketi.Text = "✓ Rota güncellendi: " + yarimamulKart["kod"];
            }
        }

        // ── PAKET ÖLÇÜ / AĞIRLIK DÜZENLE ─────────────────────────────────────
        // ÜretimOS'un page_recete_agac.js:openPaketOlcuDuzenle ile AYNI alanlar
        // ve AYNI "taslak, Kaydet'te kalıcı olur" davranışı.
        private void PaketOlcuAgirlikDuzenle(JObject paket)
        {
            using (var dlg = new Form
            {
                Text = "Paket Ölçü ve Ağırlığı — " + paket["kod"], Width = 420, Height = 330,
                FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
                MinimizeBox = false, MaximizeBox = false
            })
            {
                var tablo = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12) };
                tablo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
                tablo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
                void Satir(string etiket, Control kontrol)
                {
                    tablo.RowCount++;
                    tablo.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                    var lbl = new Label { Text = etiket, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 6, 0, 0) };
                    kontrol.Dock = DockStyle.Fill;
                    kontrol.Margin = new Padding(3, 3, 3, 8);
                    tablo.Controls.Add(lbl);
                    tablo.Controls.Add(kontrol);
                }

                string Deger(string alan) => paket[alan]?.ToString() ?? "";
                var enKutu = new TextBox { Text = Deger("en") }; Satir("En (cm)", enKutu);
                var boyKutu = new TextBox { Text = Deger("boy") }; Satir("Boy (cm)", boyKutu);
                var yukKutu = new TextBox { Text = Deger("yukseklik") }; Satir("Yükseklik (cm)", yukKutu);
                var netKutu = new TextBox { Text = Deger("netAgirlik") }; Satir("Net Ağırlık (kg)", netKutu);
                var brutKutu = new TextBox { Text = Deger("brutAgirlik") }; Satir("Brüt Ağırlık (kg)", brutKutu);

                var hint = new Label
                {
                    AutoSize = false, Height = 40, ForeColor = Color.DarkSlateGray,
                    Text = "Bu ölçüler ÜretimOS'ta çeki listesi ve sevkiyat hacim/ağırlık hesabının kaynağıdır."
                };
                tablo.Controls.Add(new Label());
                tablo.Controls.Add(hint);
                tablo.RowCount++; tablo.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));

                var altPanel = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(10) };
                var vazgecBtn = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, AutoSize = true };
                var uygulaBtn = new Button { Text = "Uygula (Taslağa)", AutoSize = true, Font = new Font(Font, FontStyle.Bold) };
                altPanel.Controls.Add(vazgecBtn);
                altPanel.Controls.Add(uygulaBtn);

                dlg.Controls.Add(tablo);
                dlg.Controls.Add(altPanel);
                dlg.AcceptButton = uygulaBtn;
                dlg.CancelButton = vazgecBtn;

                uygulaBtn.Click += (s, e) =>
                {
                    double Cift(TextBox t) => double.TryParse(t.Text.Trim().Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out double v) ? v : 0;
                    paket["en"] = Cift(enKutu);
                    paket["boy"] = Cift(boyKutu);
                    paket["yukseklik"] = Cift(yukKutu);
                    paket["netAgirlik"] = Cift(netKutu);
                    paket["brutAgirlik"] = Cift(brutKutu);
                    KartDegistiIsaretle("paket", paket);
                    dlg.DialogResult = DialogResult.OK;
                };
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    _durumEtiketi.ForeColor = Color.DarkOrange;
                    _durumEtiketi.Text = "● Paket ölçü/ağırlığı taslağa işlendi — '✓ ÜretimOS'a Kaydet'e basın.";
                }
            }
        }

        private void PaketOlcuPanelGuncelle()
        {
            _paketOlcuPanel.Visible = _kokTip == "paket" && _kokKart != null;
            if (!_paketOlcuPanel.Visible) return;
            _paketOlcuEtiketi.Text = "Ölçü/Ağırlık: " + PaketOlcuOzeti(_kokKart);
        }

        // ── NEREDE KULLANILIYOR (TAM "kullanıldığı yerler" analizi) ──────────
        // Kullanıcı isteği: "hangi pakette olduğunu ... yazalım" — ilk sürüm
        // yalnızca İLK eşleşeni gösteriyordu; bu, palette görünen kısa
        // etikete SIĞMAYAN TAM listeyi gösteren salt-okunur bir diyalog.
        private void NeredeKullaniliyorGoster(PaletOgesi oge)
        {
            using (var dlg = new Form
            {
                Text = "Nerede Kullanılıyor — " + oge.Kod, Width = 440, Height = 380,
                FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
                MinimizeBox = false, MaximizeBox = false
            })
            {
                var baslik = new Label
                {
                    Dock = DockStyle.Top, Height = 36, Padding = new Padding(10, 8, 10, 0),
                    Text = $"'{oge.Kod} — {oge.Ad}' şu kartların reçetesinde kalem olarak geçiyor:"
                };
                var liste = new ListBox { Dock = DockStyle.Fill };
                if (oge.KullanimListesi == null || oge.KullanimListesi.Count == 0)
                {
                    liste.Items.Add("Hiçbir reçetede kullanılmıyor.");
                }
                else
                {
                    foreach (var (ustTip, ustKart, miktar) in oge.KullanimListesi)
                        liste.Items.Add($"[{TipGosterimAdi(ustTip)}] {ustKart["kod"]} — {ustKart["ad"]}  (×{miktar.ToString("0.##", CultureInfo.InvariantCulture)})");
                }
                var kapatBtn = new Button { Text = "Kapat", Dock = DockStyle.Bottom, DialogResult = DialogResult.OK };
                dlg.Controls.Add(liste);
                dlg.Controls.Add(baslik);
                dlg.Controls.Add(kapatBtn);
                dlg.AcceptButton = kapatBtn;
                dlg.CancelButton = kapatBtn;
                dlg.ShowDialog(this);
            }
        }

        // ── REÇETE (ÇOK KATMANLI) ────────────────────────────────────────────
        // Anahtar: tip + "|" + kartId — bir kartın reçetesini benzersiz tanımlar.
        private static string ReceteAnahtari(string tip, string kartId) => tip + "|" + kartId;
        private static string AlanAdiTipten(string tip) => tip == "urun" ? "urunId" : tip == "yarimamul" ? "yarimamulId" : tip == "altmontaj" ? "altMontajId" : "paketId";

        // Salt okunur arama — YENİ bir reçete OLUŞTURMAZ (yalnızca görüntüleme/
        // ağaç genişletme için; boş bırakılan bir alt kırılım hayalet bir
        // taslak reçete YARATMAMALI).
        private JObject ReceteGetir(string tip, JObject kart)
        {
            if (kart == null) return null;
            string anahtar = ReceteAnahtari(tip, (string)kart["id"]);
            if (_degisenReceteler.TryGetValue(anahtar, out var d)) return d;
            string alanAdi = AlanAdiTipten(tip);
            return _receteler.FirstOrDefault(r => (string)r[alanAdi] == (string)kart["id"]) as JObject;
        }

        // tip/kart'a ait reçeteyi bulur; yoksa YENİ bir taslak oluşturur
        // (henüz sunucuya YAZILMAZ — yalnızca _degisenReceteler'e ve
        // görüntüleme amacıyla _receteler'e eklenir, Kaydet'te kalıcı olur).
        private JObject ReceteBulVeyaOlustur(string tip, JObject kart)
        {
            string anahtar = ReceteAnahtari(tip, (string)kart["id"]);
            if (_degisenReceteler.TryGetValue(anahtar, out var mevcut)) return mevcut;

            string alanAdi = AlanAdiTipten(tip);
            var recete = _receteler.FirstOrDefault(r => (string)r[alanAdi] == (string)kart["id"]) as JObject;
            if (recete == null)
            {
                recete = new JObject
                {
                    ["id"] = "YENI-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                    ["ad"] = (string)kart["ad"] + " Reçetesi",
                    ["kalemler"] = new JArray(),
                    [alanAdi] = (string)kart["id"]
                };
                _receteler.Add(recete);
            }
            _degisenReceteler[anahtar] = recete;
            return recete;
        }

        // Bir kartın (kendi rotaId/amortismanGideri/gygOraniYuzde ya da paket
        // ölçü/ağırlık alanları) inline düzenlendiğini işaretler — Kaydet'te
        // bu kart KENDİ koleksiyonuna 'guncelle' olarak gönderilir.
        private void KartDegistiIsaretle(string tip, JObject kart)
        {
            _degisenKartlar[tip + "|" + (string)kart["id"]] = (tip, kart);
            _durumEtiketi.ForeColor = Color.DarkOrange;
            _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
        }

        private static string KoleksiyonAdiTipten(string tip) =>
            tip == "urun" ? "urunler" : tip == "yarimamul" ? "yarimamuller"
            : tip == "altmontaj" ? "altMontajlar" : tip == "paket" ? "paketler" : null;

        private static double ParseCift(string metin) =>
            double.TryParse((metin ?? "").Trim().Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out double v) ? v : 0;

        // ── AĞAÇ GÖSTERİMİ — ÇOK KATMANLI, page_recete_agac.js:renderNode ile
        // AYNI mantık VE AYNI ESNEKLİK: TreeView değil, her kalem KENDİ inline
        // düzenlenebilir satır Panel'i — miktar/birim doğrudan kutuda, "+ Alt
        // Kalem"/"✏ Değiştir"/"↕ Taşı"/"🗑" butonları ve (hammadde hariç)
        // inline Rota/Amortisman/GYG alt-satırı. Kalemler DÜZ bir listede
        // (derinlik artırılmış girinti ile) üst üste dizilir — web'in DOM'daki
        // iç içe div'leri de görsel olarak margin-left ile aynı işi yapıyor,
        // burada da gerçek kapsayıcı iç içeliği yerine düz liste + girinti
        // kullanmak WinForms'ta çok daha basit ve AYNI görsel sonucu verir.
        // ────────────────────────────────────────────────────────────────────
        private void AgaciYenidenCiz()
        {
            var satirlar = new List<Control>();
            var recete = ReceteGetir(_kokTip, _kokKart);
            var kalemler = recete?["kalemler"] as JArray ?? new JArray();
            foreach (var kalem in kalemler.OfType<JObject>())
                KalemSatirlariEkle(satirlar, kalem, 0, _kokTip, _kokKart);

            _agacGorunumu.SuspendLayout();
            _agacGorunumu.Controls.Clear();
            // Dock=Top koleksiyona EKLENME SIRASININ TERSİNE göre işler (son
            // eklenen en dıştaki/en üstteki olur) — bu yüzden mantıksal
            // yukarıdan-aşağıya sırayı korumak için TERS sırada ekliyoruz
            // (bkz. KurulumYap'ın başındaki aynı gerekçeli NOT).
            for (int i = satirlar.Count - 1; i >= 0; i--)
                _agacGorunumu.Controls.Add(satirlar[i]);
            _agacGorunumu.ResumeLayout();
        }

        // hedefListe: sonuç DÜZ (derinlik sırasına göre) toplanır — ustTip/
        // ustKart, bu kalemin AİT OLDUĞU reçeteyi (miktar/birim/sil/taşı
        // değişikliklerinde ReceteBulVeyaOlustur'a) doğrudan verebilmek için
        // özyinelemeli çağrılarda TAŞINIR (eski TreeNode.Parent gezintisinin
        // yerine geçer — artık bir ağaç kontrolü olmadığı için gerekli).
        private void KalemSatirlariEkle(List<Control> hedefListe, JObject kalem, int derinlik, string ustTip, JObject ustKart)
        {
            string tip = (string)kalem["tip"];
            string refId = (string)kalem["refId"];
            var kart = FindKart(tip == "hammadde" ? "hammadde" : tip, refId);

            hedefListe.Add(SatirPaneliOlustur(kalem, tip, kart, derinlik, ustTip, ustKart));

            bool hammadde = tip == "hammadde";
            if (!hammadde && kart != null)
                hedefListe.Add(AyarPaneliOlustur(tip, kart, derinlik));

            // ALT KIRILIM: bu kalemin KENDİ reçetesi varsa (urun/yarımamül/
            // altmontaj/paket — hammadde HARİÇ) alt satırlar olarak GÖSTER.
            // Salt okunur arama (ReceteGetir) kullanılır — yalnızca GÖRMEK
            // hayalet bir taslak reçete YARATMAMALI.
            if (derinlik < MAKS_DERINLIK && !hammadde && kart != null)
            {
                var altRecete = ReceteGetir(tip, kart);
                if (altRecete != null)
                {
                    var altKalemler = altRecete["kalemler"] as JArray ?? new JArray();
                    foreach (var altKalem in altKalemler.OfType<JObject>())
                        KalemSatirlariEkle(hedefListe, altKalem, derinlik + 1, tip, kart);
                }
            }
        }

        // Bir reçete KALEMİNİN satırı: pill+kod/ad, miktar/birim (inline
        // düzenlenebilir), ve (hammadde hariç) + Alt Kalem/Değiştir/Taşı/Sil
        // butonları. Web'in ra-row'u ile AYNI bilgiyi taşır (maliyet sütunu
        // HARİÇ — bu panelde bir maliyet motoru YOK, TAHMİN EDİLMEDİ).
        private Panel SatirPaneliOlustur(JObject kalem, string tip, JObject kart, int derinlik, string ustTip, JObject ustKart)
        {
            string refId = (string)kalem["refId"];
            string kod = kart != null ? ((string)kart["kod"] ?? (string)kart["stokKodu"] ?? refId) : "(kart bulunamadı)";
            string ad = kart?["ad"]?.ToString() ?? "";
            string tipGosterim = tip == "hammadde" ? (kart != null ? HammaddeGosterimTipi((string)kart["tip"]) : "Hammadde") : TipGosterimAdi(tip);
            bool hammadde = tip == "hammadde";

            var panel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 30,
                BackColor = derinlik == 0 ? Color.AliceBlue : Color.White,
                Padding = new Padding(0)
            };
            var satir = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, AutoScroll = false };

            satir.Controls.Add(new Panel { Width = 8 + derinlik * 22, Height = 1 }); // girinti

            var etiketLbl = new Label
            {
                Text = "[" + tipGosterim + "]", AutoSize = true, Font = new Font(Font, FontStyle.Bold),
                Padding = new Padding(0, 7, 4, 0), ForeColor = Color.DarkSlateBlue
            };
            satir.Controls.Add(etiketLbl);

            var kartLbl = new Label { Text = $"{kod} — {ad}", AutoSize = true, Padding = new Padding(0, 7, 10, 0), MinimumSize = new Size(180, 0) };
            satir.Controls.Add(kartLbl);

            double miktar = (double?)kalem["miktar"] ?? 1;
            var miktarKutusu = new TextBox { Width = 55, Text = miktar.ToString(CultureInfo.InvariantCulture), TextAlign = HorizontalAlignment.Right, Margin = new Padding(3, 4, 3, 3) };
            void MiktarUygula()
            {
                double yeni = ParseCift(miktarKutusu.Text);
                if (yeni <= 0) { miktarKutusu.Text = ((double?)kalem["miktar"] ?? 1).ToString(CultureInfo.InvariantCulture); return; }
                if ((double?)kalem["miktar"] == yeni) return;
                kalem["miktar"] = yeni;
                ReceteBulVeyaOlustur(ustTip, ustKart);
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
            }
            miktarKutusu.Leave += (s, e) => MiktarUygula();
            miktarKutusu.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; MiktarUygula(); } };
            satir.Controls.Add(miktarKutusu);

            var birimKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 72, Margin = new Padding(3, 4, 8, 3) };
            birimKutusu.Items.AddRange(new object[] { "ADET", "M2", "METRE", "KG", "GRAM", "LITRE" });
            birimKutusu.SelectedItem = (string)kalem["birim"] ?? "ADET";
            if (birimKutusu.SelectedIndex < 0) birimKutusu.SelectedIndex = 0;
            birimKutusu.SelectedIndexChanged += (s, e) =>
            {
                kalem["birim"] = birimKutusu.SelectedItem as string;
                ReceteBulVeyaOlustur(ustTip, ustKart);
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
            };
            satir.Controls.Add(birimKutusu);

            if (!hammadde)
            {
                var altKalemBtn = new Button { Text = "+ Alt Kalem", AutoSize = true, Margin = new Padding(3) };
                altKalemBtn.Click += (s, e) => { if (kart != null) AltKalemEkleDialogAc(tip, kart); };
                satir.Controls.Add(altKalemBtn);

                var degistirBtn = new Button { Text = "✏ Değiştir", AutoSize = true, Margin = new Padding(3) };
                degistirBtn.Click += (s, e) => KalemDegistir(kalem, tip, ustTip, ustKart);
                satir.Controls.Add(degistirBtn);
            }

            if (tip == "paket" && kart != null)
            {
                var olcuBtn = new Button { Text = "📐 Ölçü/Ağırlık", AutoSize = true, Margin = new Padding(3) };
                olcuBtn.Click += (s, e) => { PaketOlcuAgirlikDuzenle(kart); AgaciYenidenCiz(); };
                satir.Controls.Add(olcuBtn);
            }

            var tasiBtn = new Button { Text = "↕ Taşı", AutoSize = true, Margin = new Padding(3) };
            tasiBtn.Click += (s, e) => KalemiTasiDialogAc(kalem, ustTip, ustKart);
            satir.Controls.Add(tasiBtn);

            var silBtn = new Button { Text = "🗑", AutoSize = true, ForeColor = Color.DarkRed, Margin = new Padding(3) };
            silBtn.Click += (s, e) =>
            {
                var recete = ReceteBulVeyaOlustur(ustTip, ustKart);
                ((JArray)recete["kalemler"]).Remove(kalem);
                AgaciYenidenCiz();
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
            };
            satir.Controls.Add(silBtn);

            // Sürükle-bırak hedefi: palet öğesi bu SATIRIN üstüne bırakılırsa,
            // o satırın KENDİ kartı hedef alınır (eskiden TreeView seviyesinde
            // GetNodeAt ile çözülüyordu — artık her satır KENDİ hedefini bilir).
            if (!hammadde && kart != null)
            {
                panel.AllowDrop = true;
                panel.DragEnter += (s, e) => { e.Effect = e.Data.GetDataPresent(typeof(PaletOgesi)) ? DragDropEffects.Copy : DragDropEffects.None; };
                panel.DragDrop += (s, e) => { if (e.Data.GetData(typeof(PaletOgesi)) is PaletOgesi oge) KalemEkle(oge, tip, kart); };
            }

            panel.Controls.Add(satir);
            return panel;
        }

        // Web'in "İNLİNE ROTA + AMORTİSMAN AYARI" alt-satırı ile AYNI —
        // hammadde HARİÇ her kart tipi için (ürün/yarımamül/altmontaj/paket)
        // KENDİ rotaId/amortismanGideri/gygOraniYuzde alanlarını doğrudan
        // düzenler; değişiklik KartDegistiIsaretle ile Kaydet'e taşınır.
        private Panel AyarPaneliOlustur(string tip, JObject kart, int derinlik)
        {
            var panel = new Panel { Dock = DockStyle.Top, Height = 28, BackColor = Color.White };
            var satir = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };

            satir.Controls.Add(new Panel { Width = 8 + (derinlik + 1) * 22, Height = 1 });

            satir.Controls.Add(new Label { Text = "⚙ Rota:", AutoSize = true, ForeColor = Color.DarkSlateGray, Padding = new Padding(0, 6, 2, 0) });
            var rotalarListe = _rotalar.OfType<JObject>().ToList();
            var rotaKutusu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 170, Margin = new Padding(3, 3, 8, 3) };
            rotaKutusu.Items.Add("— Rota Yok —");
            foreach (var r in rotalarListe) rotaKutusu.Items.Add($"{r["ad"]}");
            string rotaId = (string)kart["rotaId"];
            int mevcutRotaIndex = rotalarListe.FindIndex(r => (string)r["id"] == rotaId);
            rotaKutusu.SelectedIndex = mevcutRotaIndex >= 0 ? mevcutRotaIndex + 1 : 0;
            rotaKutusu.SelectedIndexChanged += (s, e) =>
            {
                kart["rotaId"] = rotaKutusu.SelectedIndex > 0 ? (string)rotalarListe[rotaKutusu.SelectedIndex - 1]["id"] : null;
                KartDegistiIsaretle(tip, kart);
            };
            satir.Controls.Add(rotaKutusu);

            var yeniRotaBtn = new Button { Text = "+ Yeni Rota", AutoSize = true, Margin = new Padding(3) };
            yeniRotaBtn.Click += async (s, e) => { await RotaSecVeyaOlusturDialogAc(kart); AgaciYenidenCiz(); };
            satir.Controls.Add(yeniRotaBtn);

            satir.Controls.Add(new Label { Text = "Amortisman (₺):", AutoSize = true, ForeColor = Color.DarkSlateGray, Padding = new Padding(8, 6, 2, 0) });
            var amortismanKutusu = new TextBox { Width = 60, Text = ((double?)kart["amortismanGideri"] ?? 0).ToString(CultureInfo.InvariantCulture), Margin = new Padding(3) };
            amortismanKutusu.Leave += (s, e) => { kart["amortismanGideri"] = ParseCift(amortismanKutusu.Text); KartDegistiIsaretle(tip, kart); };
            satir.Controls.Add(amortismanKutusu);

            satir.Controls.Add(new Label { Text = "GYG (%):", AutoSize = true, ForeColor = Color.DarkSlateGray, Padding = new Padding(8, 6, 2, 0) });
            var gygKutusu = new TextBox { Width = 50, Text = ((double?)kart["gygOraniYuzde"] ?? 0).ToString(CultureInfo.InvariantCulture), Margin = new Padding(3) };
            gygKutusu.Leave += (s, e) => { kart["gygOraniYuzde"] = ParseCift(gygKutusu.Text); KartDegistiIsaretle(tip, kart); };
            satir.Controls.Add(gygKutusu);

            panel.Controls.Add(satir);
            return panel;
        }

        // Bir kalemi FARKLI bir mevcut karta (AYNI tipte) bağlar — web'in
        // "✏️ Değiştir" ile AYNI amaç. Tip değiştirme (ör. yarımamülü paketle
        // değiştirme) BİLEREK desteklenmiyor — bu, o reçete YUVASININ ne tür
        // bir şey taşıdığını kökten değiştirir, TAHMİN EDİLECEK bir alan değil.
        private void KalemDegistir(JObject kalem, string tip, string ustTip, JObject ustKart)
        {
            string gosterimTip = tip == "hammadde" ? "Hammadde" : TipGosterimAdi(tip);
            using (var dlg = new Form { Text = "Değiştir — " + gosterimTip, Width = 440, Height = 480, StartPosition = FormStartPosition.CenterParent })
            {
                var aramaKutu = new TextBox { Dock = DockStyle.Top };
                var liste = new ListBox { Dock = DockStyle.Fill };
                var tamamBtn = new Button { Text = "Bu Kartla Değiştir", Dock = DockStyle.Bottom };
                List<PaletOgesi> mevcutListe = new List<PaletOgesi>();
                void Doldur()
                {
                    IEnumerable<PaletOgesi> kaynak = tip == "urun" ? _urunler.Select(k => Ogeye(k, "urun", "Ürün"))
                        : tip == "yarimamul" ? _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül"))
                        : tip == "altmontaj" ? _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj"))
                        : tip == "paket" ? _paketler.Select(k => Ogeye(k, "paket", "Paket"))
                        : _hammaddeler.Select(k => OgeyeHammadde(k, HammaddeGosterimTipi((string)((JObject)k)["tip"])));
                    string arama = (aramaKutu.Text ?? "").Trim().ToLowerInvariant();
                    mevcutListe = kaynak.Where(o => string.IsNullOrEmpty(arama) || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama))
                        .OrderBy(o => o.Kod).Take(300).ToList();
                    liste.Items.Clear();
                    liste.Items.AddRange(mevcutListe.ToArray());
                }
                aramaKutu.TextChanged += (s, e) => Doldur();
                tamamBtn.Click += (s, e) =>
                {
                    if (liste.SelectedItem is PaletOgesi secilen)
                    {
                        kalem["refId"] = secilen.Id;
                        ReceteBulVeyaOlustur(ustTip, ustKart);
                        dlg.DialogResult = DialogResult.OK;
                    }
                };
                dlg.Controls.Add(liste);
                dlg.Controls.Add(tamamBtn);
                dlg.Controls.Add(aramaKutu);
                Doldur();
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    AgaciYenidenCiz();
                    _durumEtiketi.ForeColor = Color.DarkOrange;
                    _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
                }
            }
        }

        // Bir satırın altına yeni bir kalem ekler — web'in "+ Alt Kalem"
        // butonuyla AYNI (sürükle-bırak GEREKMEDEN, tip+arama ile tek adımda).
        private void AltKalemEkleDialogAc(string hedefTip, JObject hedefKart)
        {
            using (var dlg = new Form { Text = "Alt Kalem Ekle — " + hedefKart["kod"], Width = 480, Height = 520, StartPosition = FormStartPosition.CenterParent })
            {
                var tipKutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
                tipKutu.Items.AddRange(new object[] { "Paket", "Yarı Mamül", "Alt Montaj", "Hırdavat", "Plaka", "Kenar Bandı", "Sarf Malzeme" });
                tipKutu.SelectedIndex = 0;
                var aramaKutu = new TextBox { Dock = DockStyle.Top };
                var liste = new ListBox { Dock = DockStyle.Fill };
                var ekleBtn = new Button { Text = "Ekle", Dock = DockStyle.Bottom };
                List<PaletOgesi> mevcutListe = new List<PaletOgesi>();
                void Doldur()
                {
                    string tip = tipKutu.SelectedItem as string;
                    IEnumerable<PaletOgesi> kaynak = tip == "Paket" ? _paketler.Select(k => Ogeye(k, "paket", "Paket"))
                        : tip == "Yarı Mamül" ? _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül"))
                        : tip == "Alt Montaj" ? _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj"))
                        : tip == "Hırdavat" ? _hammaddeler.Where(h => (string)h["tip"] == "hirdavat").Select(k => OgeyeHammadde(k, "Hırdavat"))
                        : tip == "Plaka" ? _hammaddeler.Where(h => (string)h["tip"] == "plaka").Select(k => OgeyeHammadde(k, "Plaka"))
                        : tip == "Sarf Malzeme" ? _hammaddeler.Where(h => (string)h["tip"] == "sarf").Select(k => OgeyeHammadde(k, "Sarf Malzeme"))
                        : _hammaddeler.Where(h => (string)h["tip"] == "kenar_bandi").Select(k => OgeyeHammadde(k, "Kenar Bandı"));
                    string arama = (aramaKutu.Text ?? "").Trim().ToLowerInvariant();
                    mevcutListe = kaynak.Where(o => string.IsNullOrEmpty(arama) || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama))
                        .OrderBy(o => o.Kod).Take(300).ToList();
                    liste.Items.Clear();
                    liste.Items.AddRange(mevcutListe.ToArray());
                }
                tipKutu.SelectedIndexChanged += (s, e) => Doldur();
                aramaKutu.TextChanged += (s, e) => Doldur();
                ekleBtn.Click += (s, e) =>
                {
                    if (liste.SelectedItem is PaletOgesi secilen)
                    {
                        KalemEkle(secilen, hedefTip, hedefKart);
                        dlg.DialogResult = DialogResult.OK;
                    }
                };
                dlg.Controls.Add(liste);
                dlg.Controls.Add(ekleBtn);
                dlg.Controls.Add(aramaKutu);
                dlg.Controls.Add(tipKutu);
                Doldur();
                dlg.ShowDialog(this);
            }
        }

        // Bir kalemi BAŞKA bir üst kartın reçetesine taşır — web'in "↕ Taşı"
        // ile AYNI (eski reçeteden çıkarır, yeni reçeteye ekler). TAM döngü
        // tespiti YAPILMAZ (web'deki gibi) — yalnızca "zaten aynı yere taşıma"
        // engellenir; MAKS_DERINLIK zaten sonsuz özyinelemeye karşı korur.
        private void KalemiTasiDialogAc(JObject kalem, string ustTip, JObject ustKart)
        {
            using (var dlg = new Form { Text = "Kalemi Taşı", Width = 480, Height = 520, StartPosition = FormStartPosition.CenterParent })
            {
                var tipKutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
                tipKutu.Items.AddRange(new object[] { "Ürün", "Yarı Mamül", "Alt Montaj", "Paket" });
                tipKutu.SelectedIndex = 0;
                var aramaKutu = new TextBox { Dock = DockStyle.Top };
                var liste = new ListBox { Dock = DockStyle.Fill };
                var tasiBtn = new Button { Text = "Buraya Taşı", Dock = DockStyle.Bottom };
                List<PaletOgesi> mevcutListe = new List<PaletOgesi>();
                void Doldur()
                {
                    string tip = tipKutu.SelectedItem as string;
                    IEnumerable<PaletOgesi> kaynak = tip == "Ürün" ? _urunler.Select(k => Ogeye(k, "urun", "Ürün"))
                        : tip == "Yarı Mamül" ? _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül"))
                        : tip == "Alt Montaj" ? _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj"))
                        : _paketler.Select(k => Ogeye(k, "paket", "Paket"));
                    string arama = (aramaKutu.Text ?? "").Trim().ToLowerInvariant();
                    mevcutListe = kaynak.Where(o => string.IsNullOrEmpty(arama) || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama))
                        .OrderBy(o => o.Kod).Take(300).ToList();
                    liste.Items.Clear();
                    liste.Items.AddRange(mevcutListe.ToArray());
                }
                tipKutu.SelectedIndexChanged += (s, e) => Doldur();
                aramaKutu.TextChanged += (s, e) => Doldur();
                tasiBtn.Click += (s, e) =>
                {
                    if (!(liste.SelectedItem is PaletOgesi secilen)) return;
                    var yeniKart = FindKart(secilen.KalemTipi, secilen.Id);
                    if (yeniKart == null) return;
                    if (secilen.KalemTipi == ustTip && secilen.Id == (string)ustKart["id"])
                    {
                        MessageBox.Show("Kalem zaten bu kartın reçetesinde.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }
                    var eskiRecete = ReceteBulVeyaOlustur(ustTip, ustKart);
                    ((JArray)eskiRecete["kalemler"]).Remove(kalem);
                    var yeniRecete = ReceteBulVeyaOlustur(secilen.KalemTipi, yeniKart);
                    ((JArray)yeniRecete["kalemler"]).Add(kalem);
                    dlg.DialogResult = DialogResult.OK;
                };
                dlg.Controls.Add(liste);
                dlg.Controls.Add(tasiBtn);
                dlg.Controls.Add(aramaKutu);
                dlg.Controls.Add(tipKutu);
                Doldur();
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    AgaciYenidenCiz();
                    _durumEtiketi.ForeColor = Color.DarkOrange;
                    _durumEtiketi.Text = "● Kaydedilmemiş değişiklik var — bitirince '✓ ÜretimOS'a Kaydet'e basın.";
                }
            }
        }

        // ── XML DIŞA AKTARMA ─────────────────────────────────────────────────
        // Kullanıcı isteği: "Üretimostaki reçeteleri xml formatında
        // kaydedelim ve her satırın benzersiz unique id bilgiside olsun."
        // AgaciYenidenCiz/KalemDugumuOlustur ile AYNI özyinelemeli gezinme
        // mantığı (aynı MAKS_DERINLIK güvenlik sınırı) — ama TreeNode yerine
        // XElement üretir. Sunucudaki (JSON) veri deposu HİÇ değişmiyor,
        // bu TAMAMEN yerel/isteğe bağlı bir dışa aktarma özelliğidir.
        private void ReceteyiXmlOlarakDisaAktar()
        {
            if (_kokKart == null)
            {
                MessageBox.Show("Önce üstten bir kart seçin ('Farklı Kart Seç…').", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var recete = ReceteGetir(_kokTip, _kokKart);
            var kokEleman = new System.Xml.Linq.XElement("Recete",
                new System.Xml.Linq.XAttribute("kokTip", _kokTip),
                new System.Xml.Linq.XAttribute("kokId", (string)_kokKart["id"] ?? ""),
                new System.Xml.Linq.XAttribute("kokKod", (string)_kokKart["kod"] ?? (string)_kokKart["stokKodu"] ?? ""),
                new System.Xml.Linq.XAttribute("kokAd", (string)_kokKart["ad"] ?? ""),
                new System.Xml.Linq.XAttribute("disaAktarmaTarihi", DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss")));

            if (recete != null)
            {
                var kalemler = recete["kalemler"] as JArray ?? new JArray();
                foreach (var kalem in kalemler.OfType<JObject>())
                    kokEleman.Add(KalemElemaniOlustur(kalem, 0));
            }

            string varsayilanAd = ((string)_kokKart["kod"] ?? (string)_kokKart["stokKodu"] ?? "recete")
                .Trim();
            foreach (char c in System.IO.Path.GetInvalidFileNameChars())
                varsayilanAd = varsayilanAd.Replace(c, '_');

            using (var kaydetDialog = new SaveFileDialog
            {
                Filter = "XML dosyası|*.xml",
                FileName = varsayilanAd + "_recete.xml"
            })
            {
                if (kaydetDialog.ShowDialog() != DialogResult.OK) return;
                try
                {
                    new System.Xml.Linq.XDocument(
                        new System.Xml.Linq.XDeclaration("1.0", "utf-8", "yes"),
                        kokEleman
                    ).Save(kaydetDialog.FileName);
                    _durumEtiketi.ForeColor = Color.DarkGreen;
                    _durumEtiketi.Text = "✓ Reçete XML olarak dışa aktarıldı: " + kaydetDialog.FileName;
                }
                catch (Exception ex)
                {
                    Tanilama.Kaydet("ReceteyiXmlOlarakDisaAktar HATA: " + ex);
                    MessageBox.Show("XML dosyası yazılamadı: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private System.Xml.Linq.XElement KalemElemaniOlustur(JObject kalem, int derinlik)
        {
            string tip = (string)kalem["tip"];
            string refId = (string)kalem["refId"];
            var kart = FindKart(tip == "hammadde" ? "hammadde" : tip, refId);
            string kod = kart != null ? ((string)kart["kod"] ?? (string)kart["stokKodu"] ?? refId) : refId;
            string ad = kart?["ad"]?.ToString() ?? "";
            double miktar = (double?)kalem["miktar"] ?? 1;
            string birim = (string)kalem["birim"] ?? "ADET";
            // Her satırın benzersiz id'si — normalde KalemEkle'de zaten
            // "RK-..." atanır; yalnızca (varsa) çok eski/id'siz kayıtlar için
            // burada GEÇİCİ (yalnızca bu XML çıktısına özel, kaydedilmeyen)
            // bir id üretilir — TAHMİN/sessiz veri değişikliği YOK, sadece
            // dışa aktarma anında dolduruluyor.
            string id = (string)kalem["id"];
            if (string.IsNullOrWhiteSpace(id)) id = "RK-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant();

            var eleman = new System.Xml.Linq.XElement("Kalem",
                new System.Xml.Linq.XAttribute("id", id),
                new System.Xml.Linq.XAttribute("tip", tip ?? ""),
                new System.Xml.Linq.XAttribute("refId", refId ?? ""),
                new System.Xml.Linq.XAttribute("kod", kod ?? ""),
                new System.Xml.Linq.XAttribute("ad", ad ?? ""),
                new System.Xml.Linq.XAttribute("miktar", miktar.ToString(CultureInfo.InvariantCulture)),
                new System.Xml.Linq.XAttribute("birim", birim ?? ""));

            if (derinlik < MAKS_DERINLIK && tip != "hammadde" && kart != null)
            {
                var altRecete = ReceteGetir(tip, kart);
                if (altRecete != null)
                {
                    var altKalemler = altRecete["kalemler"] as JArray ?? new JArray();
                    foreach (var altKalem in altKalemler.OfType<JObject>())
                        eleman.Add(KalemElemaniOlustur(altKalem, derinlik + 1));
                }
            }
            return eleman;
        }

        // static: PaletOgesi.ToString() (iç içe sınıf) de kullanır.
        private static string TipGosterimAdi(string tip) => tip == "urun" ? "Ürün" : tip == "yarimamul" ? "Yarı Mamül"
            : tip == "altmontaj" ? "Alt Montaj" : tip == "paket" ? "Paket" : tip;
        private string HammaddeGosterimTipi(string hammaddeTip) => hammaddeTip == "hirdavat" ? "Hırdavat"
            : hammaddeTip == "plaka" ? "Plaka" : hammaddeTip == "kenar_bandi" ? "Kenar Bandı"
            : hammaddeTip == "sarf" ? "Sarf Malzeme" : "Hammadde";

        // ── SÜRÜKLE-BIRAK / EKLE (HEDEF: bırakılan/seçili DÜĞÜMÜN kartı) ─────
        private void PaletListesi_MouseDown(object sender, MouseEventArgs e)
        {
            // YALNIZCA sol tık sürükleme başlatır — sağ tık, "Nerede
            // Kullanılıyor?" bağlam menüsü içindir (aşağıdaki ikinci
            // MouseDown abonesi seçimi günceller).
            if (e.Button == MouseButtons.Left && _paletListesi.SelectedItem is PaletOgesi oge)
            {
                _paletListesi.DoDragDrop(oge, DragDropEffects.Copy);
            }
        }

        private void KalemEkle(PaletOgesi oge, string hedefTip, JObject hedefKart)
        {
            if (hedefKart == null)
            {
                MessageBox.Show("Önce üstten bir hedef kart seçin ('Farklı Kart Seç…').", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            // Kendi kendine referans / basit döngü koruması — TAM döngü tespiti
            // (A→B→A gibi çok seviyeli) ÜretimOS'un kendi reçete ekranında
            // yapılıyor; burada YALNIZCA en bariz "kendini kendine eklemek"
            // durumu engellenir.
            if (oge.KalemTipi == hedefTip && oge.Id == (string)hedefKart["id"])
            {
                MessageBox.Show("Bir kart kendi reçetesine eklenemez.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            double miktar = MiktarSor("Miktar (ADET)", 1);
            if (miktar <= 0) return;

            var recete = ReceteBulVeyaOlustur(hedefTip, hedefKart);
            var yeniKalem = new JObject
            {
                ["id"] = "RK-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                ["tip"] = oge.KalemTipi,
                ["refId"] = oge.Id,
                ["miktar"] = miktar,
                ["birim"] = "ADET"
            };
            ((JArray)recete["kalemler"]).Add(yeniKalem);
            AgaciYenidenCiz();
            _durumEtiketi.ForeColor = Color.DarkOrange;
            _durumEtiketi.Text = $"● '{hedefKart["kod"]}' reçetesine eklendi — kaydedilmemiş değişiklik var, bitirince '✓ ÜretimOS'a Kaydet'e basın.";
        }

        // Basit bir sayı girme penceresi — .NET Framework WinForms'ta yerleşik
        // bir InputBox yok (Microsoft.VisualBasic.Interaction.InputBox yeni bir
        // derleme referansı gerektirirdi), bu yüzden minik bir Form ile.
        private double MiktarSor(string baslik, double varsayilan)
        {
            using (var f = new Form { Text = baslik, Width = 260, Height = 130, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var kutu = new TextBox { Text = varsayilan.ToString(CultureInfo.InvariantCulture), Dock = DockStyle.Top };
                var tamam = new Button { Text = "Tamam", Dock = DockStyle.Bottom, DialogResult = DialogResult.OK };
                f.Controls.Add(kutu);
                f.Controls.Add(tamam);
                f.AcceptButton = tamam;
                if (f.ShowDialog(this) != DialogResult.OK) return 0;
                return double.TryParse(kutu.Text.Trim().Replace(",", "."),
                    NumberStyles.Any, CultureInfo.InvariantCulture, out double sonuc)
                    ? sonuc : 0;
            }
        }

        // ── KAYDET (ÇOK KATMANLI — TÜM değişen reçeteler + paket ölçüleri TEK
        // seferde, ÜretimOS'un kendi reçete sistemine AYNI şekilde aktarılır) ─
        private async System.Threading.Tasks.Task KaydetTikla()
        {
            if (_kokKart == null)
            {
                MessageBox.Show("Önce bir hedef kart seçin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (_degisenReceteler.Count == 0 && _degisenKartlar.Count == 0)
            {
                MessageBox.Show("Kaydedilecek bir değişiklik yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            _kaydetBtn.Enabled = false;
            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Kaydediliyor…";
            try
            {
                int receteSayisi = 0;
                if (_degisenReceteler.Count > 0)
                {
                    var ekle = new List<object>();
                    var guncelle = new List<object>();
                    foreach (var recete in _degisenReceteler.Values)
                    {
                        bool yeniKayit = ((string)recete["id"]).StartsWith("YENI-");
                        if (yeniKayit) recete["id"] = "RC-" + Guid.NewGuid().ToString("N").Substring(0, 12).ToUpperInvariant();
                        (yeniKayit ? ekle : guncelle).Add(recete);
                    }
                    bool receteBasarili = await _istemci.ToplukaEkleGuncelle("receteler", ekle, guncelle);
                    if (!receteBasarili) throw new Exception("Sunucu 'receteler' kaydını reddetti (HTTP hata).");
                    receteSayisi = ekle.Count + guncelle.Count;
                    _degisenReceteler.Clear();
                }

                // Kullanıcı isteği: "üretimosta nasıl reçete yapıp kaydediyorsak
                // solidde o şekilde reçete yapıp kaydedebilelim" — inline Rota/
                // Amortisman/GYG/paket ölçüsü değişiklikleri artık TEK bir genel
                // sözlükte (_degisenKartlar), tip başına GRUPLANIP kendi
                // koleksiyonuna (urunler/yarimamuller/altMontajlar/paketler)
                // 'guncelle' olarak gönderilir.
                int kartSayisi = 0;
                if (_degisenKartlar.Count > 0)
                {
                    foreach (var grup in _degisenKartlar.Values.GroupBy(v => v.tip))
                    {
                        string koleksiyon = KoleksiyonAdiTipten(grup.Key);
                        if (koleksiyon == null) continue;
                        var guncelleListesi = grup.Select(v => (object)v.kart).ToList();
                        bool basarili = await _istemci.ToplukaEkleGuncelle(koleksiyon, new List<object>(), guncelleListesi);
                        if (!basarili) throw new Exception($"Sunucu '{koleksiyon}' kaydını reddetti (HTTP hata).");
                        kartSayisi += guncelleListesi.Count;
                    }
                    _degisenKartlar.Clear();
                }

                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ Kaydedildi — {receteSayisi} reçete, {kartSayisi} kart güncellemesi ({_kokKart["kod"]} ve alt kırılımları).";
                Tanilama.Kaydet($"ReceteAgaciPaneli: kaydedildi, kok={_kokKart["kod"]}, recete={receteSayisi}, kart={kartSayisi}");
                AgaciYenidenCiz();
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("ReceteAgaciPaneli.KaydetTikla HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Kaydedilemedi: " + ex.Message;
            }
            finally
            {
                _kaydetBtn.Enabled = true;
            }
        }
    }
}
