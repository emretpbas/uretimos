using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json.Linq;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
// CS0104 (gerçek derleme hatası, yerel oturum bildirdi): SolidWorks.Interop.
// sldworks'ün KENDİ bir "Environment" tipi var — System.Environment ile
// ÇAKIŞIYOR. SwAddin.cs'te AYNI çakışma AYNI şekilde çözülmüş (bkz. o
// dosyanın "using Environment = System.Environment;" satırı) — burada da
// AYNI çözüm uygulanıyor (tek tek System.Environment. ile niteleme yerine,
// ileride eklenecek yeni Environment. kullanımlarını da kapsasın diye).
using Environment = System.Environment;

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
        private readonly ISldWorks _app;
        private UretimOSApiClient _istemci;

        private JArray _urunler, _yarimamuller, _altMontajlar, _paketler, _hammaddeler, _receteler, _rotalar;
        // "hatlar" (hat adı → makine listesi) VE "ayarlar" (saatlikIscilikUcreti
        // dahil), storage.js'teki AYNI basit obje anahtarları — id'li kayıt
        // DİZİSİ olmadıkları için _urunler vb. gibi JArray değil JObject.
        // Kullanıcı isteği: "hat ve makina galerisini... buraya kopyala" —
        // bkz. RotaEditoru.cs.
        private JObject _hatlar, _ayarlar;
        private bool _verilerYuklendi;

        // BaglantiAyarlari.cs'teki AYNI klasör (%LocalAppData%\UretimOSKesim\)
        // — ⬇ İndir butonuyla yazılan dosya buraya konur ki her SolidWorks
        // açılışında OTOMATİK bulunsun (kullanıcı isteği: "indirdiğim
        // dosyadan çalışsın ve tekrar üretimosa bağlanmasın"). Bkz.
        // YerelOnbellektenYukle / MasterVeriyiYerelIndir.
        private static readonly string YerelVeriOnbellekYolu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UretimOSKesim", "veri_onbellek.json");

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

        // KRİTİK, İKİNCİ bir GDI tanıtıcı sızıntısı kaynağı (Controls.Clear()
        // Dispose düzeltmesinden BAĞIMSIZ): "new Font(Font, FontStyle.Bold)"
        // her satır çiziminde (KalemSatirlariEkle — alttaki ÜretimOS reçete
        // ağacının HER kalemi için, AgaciYenidenCiz HER değişiklikte tümünü
        // yeniden çizdiği için) YENİ bir GDI font tanıtıcısı oluşturuyordu.
        // Control.Dispose() bir Label'ın KENDİ Font'unu Dispose ETMEZ — bu
        // yüzden bu belleği önceki Controls.Clear() düzeltmesi bile
        // KAPSAMIYORDU. Tek bir paylaşılan/önbelleğe alınmış font kullanmak
        // bu sızıntıyı tamamen ortadan kaldırır (kullanıcı raporu: "yine
        // kilitlendi" — SolidWorks'ün kendisi native çöktü, sürecin PAYLAŞILAN
        // GDI/USER tanıtıcı kotası tükendiğinde tam da böyle davranır).
        private Font _kalinFontOnbellek;
        private Font KalinFont => _kalinFontOnbellek ?? (_kalinFontOnbellek = new Font(Font, FontStyle.Bold));

        // "📐 Teknik Resim Oluştur" (ADIM 1, satır bazlı) ile "✓ Teknik
        // Resmi Onayla ve ÜretimOS'a Yükle" (ADIM 2, global — bkz. altPanel)
        // arasındaki durumu taşır: hangi kalem (tip/kart) için hangi
        // SolidWorks model yolundan çizim açıldığı. null = bekleyen yok.
        //
        // GERÇEK ÇÖKME/HATA (kullanıcı raporu, ekran görüntüsü): bu TEK global
        // alan olduğu için, kullanıcı bir satırda "Oluştur"a basıp ONAYLAMADAN
        // BAŞKA bir satırda TEKRAR "Oluştur"a basınca bu alan SESSİZCE
        // ÜZERİNE YAZILIYORDU — SolidWorks'te İKİ çizim açık kalıyor ama
        // yalnızca SONUNCUSU izleniyordu. "Onayla" ise ActiveDoc'u (o an
        // SolidWorks'te ODAKLANMIŞ HANGİ pencere ise) kullandığı için, eğer
        // odak yanlışlıkla İLK çizimdeyse, İLK çizimin İÇERİĞİ SONUNCU
        // kartın kimliğiyle (kod/ad/refId) yüklenip YANLIŞ karta karışıyordu —
        // tam olarak "teknik resimler tüm yarımamüllerde görünüyor" bulgusu.
        // Çözüm: hangi ÇİZİM BELGESİNİN (COM nesne referansı) oluşturulduğu
        // da saklanır; Onayla, ActiveDoc'un TAM OLARAK bu nesne olduğunu
        // doğrular — eşleşmezse SESSİZCE yanlış karta yüklemek yerine AÇIKÇA
        // reddeder.
        private (string tip, JObject kart, string modelYolu, IModelDoc2 cizimBelgesi)? _bekleyenTeknikResim;
        private Button _teknikResimOnaylaBtn;
        // Kullanıcı isteği: "seçilen dosyaların isimlerini ... seçtiğim
        // satırda göster" — anahtar "tip|refId", değer o kart için sunucudan
        // en son çekilen dosya adları listesi (bkz. TeknikDosyaYukleDialogAc'ın
        // ListeyiYenile'i). Yalnızca kullanıcı o satırın "📎 Teknik Resim"
        // diyaloğunu en az bir kez açtıktan SONRA doldurulur (tüm ağaç için
        // önceden toplu sorgu YAPILMAZ — performans/gecikme riski).
        private readonly Dictionary<string, List<string>> _teknikDosyaAdlariOnbellek = new Dictionary<string, List<string>>();

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

        // app: kullanıcı isteği "teknik resim ekle ... bağlantılı ürünün
        // teknik resmini oluşturup kaydedelim" — TeknikResimOlusturucu
        // (yeni çizim belgesi oluşturma) ISldWorks uygulama nesnesini
        // gerektirir; ModelDoc2'nin kendisinde buna erişim YOKTUR, bu yüzden
        // UretimOSAddin.cs'teki (SwAddin.cs dosyası) tek çağrı noktasından
        // elle geçirilir. null olabilir (eski/test amaçlı çağrılarda) —
        // bu durumda "📐 Teknik Resim Oluştur" nazikçe devre dışı kalır
        // (TeknikResimOlusturDialogAc içindeki kontrol).
        public ReceteAgaciPaneli(ModelDoc2 hedefModel, ISldWorks app = null)
        {
            _hedefModel = hedefModel;
            _app = app;
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
            rotaBtn.Click += async (s, e) => { if (_kokKart != null) { await RotaSecVeyaOlusturDialogAc("yarimamul", _kokKart); UstBilgiPanelleriGuncelle(); } };
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
            // Kullanıcı isteği: "solidworkste bileşen ağacı için ayrı xml
            // altta çıkan üretimos reçete ağacı için ayrı xml almak için
            // ayrı sekmeler oluştur" — bu, YUKARIDAKİ SolidWorks bileşen
            // ağacının (Sınıf/ölçü/kenar bandı taslağı dahil, henüz
            // ÜretimOS'a hiç aktarılmamış olsa BİLE) kendi XML çıktısı;
            // alttaki "Reçeteyi XML Olarak Dışa Aktar…" ise sunucudaki
            // GERÇEK kaydedilmiş reçete ağacını dışa aktarır — ikisi
            // BİLEREK ayrı butonlar/dosyalardır, birbirini kapsamaz.
            var bilesenXmlBtn = new Button { Text = "Bileşen Ağacını XML Olarak Dışa Aktar…", Dock = DockStyle.Left, Width = 240 };
            bilesenXmlBtn.Click += async (s, e) => await BilesenAgaciniXmlOlarakDisaAktar();
            // Kullanıcı isteği: "hammadde ve yarımamül bant plaka sarf ürün
            // kodlarını ve ürün ağacı reçetelerini indir diye bir tuş koy ve
            // bu tuşa basarak hammaddeleri komple indir ancak tüm ürün,
            // yarımamül, paket ve altmontaj kodlarını komple mi yoksa sadece
            // bağlantılı olanları mı indireceğini sor" — bkz. MasterVeriyiYerelIndir.
            var veriIndirBtn = new Button { Text = "⬇ Hammadde/Ürün Kodları ve Reçeteleri İndir…", Dock = DockStyle.Left, Width = 290 };
            veriIndirBtn.Click += async (s, e) => await MasterVeriyiYerelIndir();
            // Kullanıcı isteği: "yeni parça ekledim teknik resim sekmesi bu
            // satırda çıkmıyor... diğer sınıf seçimler ve teknik resim ve alt
            // kalemler tamamen boş geldi" — panel açıldığında SolidWorks
            // bileşen ağacı YALNIZCA BİR KEZ taranıyordu (VerileriYukleVeBaslat);
            // montaja SONRADAN eklenen bir parçayı görmenin TEK yolu paneli
            // kapatıp yeniden açmaktı, bu da o oturumda elle yapılmış TÜM
            // sınıf/eşleştirme seçimlerini SIFIRLIYORDU (Sinif hiçbir yerde
            // kalıcı tutulmaz — bkz. BilesenAgaci.cs'teki BilesenDugumu.Sinif
            // yorumu). Bu buton paneli KAPATMADAN yeniden tarar VE eski
            // ağaçtaki (kod/dosya yoluyla eşleşen) düğümlerin sınıf/kenar
            // bandı/taslak ölçü/dahil-mi durumunu yeni ağaca AKTARIR — yalnızca
            // GERÇEKTEN yeni olan bileşenler boş/varsayılan gelir.
            var agaciYenileBtn = new Button { Text = "🔄 Ağacı Yenile (Yeni SolidWorks Bileşenlerini Getir)", Dock = DockStyle.Left, Width = 300 };
            agaciYenileBtn.Click += (s, e) => AgaciYenile();
            bilesenAraPanel.Controls.Add(receteOlarakAktarBtn);
            bilesenAraPanel.Controls.Add(bilesenXmlBtn);
            bilesenAraPanel.Controls.Add(veriIndirBtn);
            bilesenAraPanel.Controls.Add(agaciYenileBtn);

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
            _kaydetBtn = new Button { Text = "✓ ÜretimOS'a Kaydet", Dock = DockStyle.Right, Width = 160, Enabled = false, Font = KalinFont };
            _kaydetBtn.Click += async (s, e) => await KaydetTikla();
            // Kullanıcı isteği: "solidworkse kaydet dosyası ekleyelim ve buna
            // basınca tüm dosya isimleri ilgili reçete bağlantıları ve tüm
            // çalışmalar kaydedilsin, dosyayı açtığımda artık hazırlanan
            // üretimos reçetesi gelsin" — URETIMOS_KOD yazma/bileşen adı
            // değiştirme (EslesmeYazVeUygula, BilesenKartDuzenle,
            // BilesenAgaciniReceteOlarakAktar) şu ana kadar SADECE AÇIK
            // BELGENİN BELLEĞİNDE kalıyordu; dosya SolidWorks'te elle
            // kaydedilmezse bu bilgiler kaybolur ve dosya tekrar açıldığında
            // eşleşme görünmez. Bu buton, ağaçtaki TÜM parça/montaj
            // belgelerini (ve kök montajı) tek seferde diske kaydeder.
            var solidworksKaydetBtn = new Button { Text = "💾 SolidWorks'e Kaydet", Dock = DockStyle.Right, Width = 190 };
            solidworksKaydetBtn.Click += (s, e) => TumBilesenleriSolidWorksKaydet();
            // Kullanıcı isteği: "Üretimostaki reçeteleri xml formatında
            // kaydedelim ve her satırın benzersiz unique id bilgiside olsun"
            // — ÜretimOS'un kendi veri deposu (JSON) DEĞİŞMİYOR, bu SADECE
            // yerel bir dışa aktarma (export). Her <Kalem> zaten reçeteye
            // eklenirken atanan benzersiz "RK-..." id'yi taşır (bkz.
            // KalemEkle) — eski/id'siz kalemler için dışa aktarma ANINDA
            // (kalıcı olmayan) bir id üretilir, bkz. ReceteyiXmlOlarakDisaAktar.
            var xmlDisaAktarBtn = new Button { Text = "Reçeteyi XML Olarak Dışa Aktar…", Dock = DockStyle.Right, Width = 210 };
            xmlDisaAktarBtn.Click += async (s, e) => await ReceteyiXmlOlarakDisaAktar();
            // ADIM 2 (bkz. TeknikResimOnaylaVeYukleCalistir) — reçete
            // ağacındaki bir satırda "📐 Teknik Resim Oluştur"a (ADIM 1)
            // basılıp SolidWorks'te çizim düzenlenene kadar DEVRE DIŞI.
            _teknikResimOnaylaBtn = new Button { Text = "✓ Teknik Resmi Onayla ve ÜretimOS'a Yükle", Dock = DockStyle.Right, Width = 260, Enabled = false };
            _teknikResimOnaylaBtn.Click += async (s, e) => await TeknikResimOnaylaVeYukleCalistir();
            altPanel.Controls.Add(_durumEtiketi);
            altPanel.Controls.Add(solidworksKaydetBtn);
            altPanel.Controls.Add(_teknikResimOnaylaBtn);
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
                // Kullanıcı isteği: "hammadde ve ürün kodlarını indirdikten
                // sonra indirdiğim dosyadan çalışsın ve tekrar üretimosa
                // bağlanmasın, ben tekrar indir butonuna basarsam indirilsin."
                // Giriş (kaydetme/gönderme YAZMA işlemleri için gerekli)
                // YİNE denenir, ama BAŞARISIZ olsa BİLE (ör. internet yok)
                // yerel önbellek varsa onunla ÇALIŞMAYA DEVAM edilir — tam
                // çevrimdışı görüntüleme/hazırlık mümkün olsun diye. Giriş
                // başarısızsa yazma denemeleri (Kaydet vb.) zaten kendi
                // try/catch'lerinde "kaydedilemedi" diyerek nazikçe başarısız
                // olur (bkz. UrunKokuOlustur, KaydetTikla vb.) — burada ayrıca
                // bir engelleme GEREKMEZ.
                bool girisBasarili;
                try { girisBasarili = await _istemci.GirisYap(ayar.KullaniciAdi, ayar.Sifre); }
                catch (Exception ex) { Tanilama.Kaydet("VerileriYukleVeBaslat GirisYap HATA (çevrimdışı olabilir): " + ex); girisBasarili = false; }

                bool onbellektenMi = YerelOnbellektenYukle(out string onbellekKapsam, out string onbellekTarih);

                if (!onbellektenMi)
                {
                    if (!girisBasarili)
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
                    _hatlar = JObject.Parse(await _istemci.Getir("hatlar") ?? "{}");
                    // data.js'teki VARSAYILAN_AYARLAR.saatlikIscilikUcreti = 500 ile
                    // AYNI varsayılan — sunucuda "ayarlar" hiç yazılmamışsa (ilk
                    // kurulum) bu değere düşülür, TAHMİN değil web'in kendi varsayılanı.
                    _ayarlar = JObject.Parse(await _istemci.Getir("ayarlar") ?? "{}");
                }
                _verilerYuklendi = true;

                PaletiFiltrele();
                _kokKartSecBtn.Enabled = true;

                // Kullanıcı isteği: "ilk bastığımda solidworkste olan ve tüm
                // componets, part ve assamblyler sıralansın" — TEK bir önceden
                // seçilmiş bileşen yerine, aktif belgedeki (parça/montaj) TÜM
                // bileşen ağacı burada çıkarılır ve doğrudan listelenir. Her
                // düğümün ÜretimOS kart eşleşmesi (URETIMOS_KOD'a göre) ✓/⚠/—
                // simgesiyle gösterilir; TAHMİN/otomatik kart OLUŞTURMA YOK.
                var bilesenKokleri = BilesenAgaci.Cikar(_hedefModel, _hammaddeler.OfType<JObject>());
                // TANI (bkz. BilesenAgaci.cs'teki ölçüm önbelleği yorumu):
                // Cikar()'ın kendisi artık temiz/hızlı çalıştığı doğrulandı
                // (uretimos_addin_log.txt'de tekrar yok) ama çökme HÂLÂ
                // devam ediyor ve Cikar() SONRASI hiçbir adımda günlük satırı
                // yoktu — bu yüzden buradan itibaren HER adımdan sonra tek
                // satırlık bir "nerede kaldık" izi bırakılıyor; bir sonraki
                // çökmede günlüğün SON satırı sorunun TAM olarak hangi
                // adımda olduğunu (UrunKokuOlustur / PaketleriOlustur /
                // BilesenAgaciniCiz) kesin olarak gösterecek.
                Tanilama.Kaydet($"VerileriYukleVeBaslat: Cikar() bitti, kok={bilesenKokleri.Count}, toplam={ToplamBilesenSayisi(bilesenKokleri)}");

                // Kullanıcı isteği: "ürün ağacı komutunu açınca dosyanın adı
                // ile yeni ürün kartı ekranı çıksın ve bu tüm ürünün en üst
                // başlangıç kodu olsun, sonra yaptığım paket/yarımamül/
                // hammadde kırılımları bu kodun altında kırılım olarak
                // eklensin" — ürün kartı kaydedilince (ya da dosyanın zaten
                // eşleştiği bir kart varsa OTOMATİK bulununca) tüm bileşen
                // kökleri bu ürün düğümünün ÇOCUĞU olur (iptal edilirse ağaç
                // eskisi gibi, ürün kökü olmadan çizilir).
                var urunKoku = await UrunKokuOlustur();
                Tanilama.Kaydet("VerileriYukleVeBaslat: UrunKokuOlustur() bitti, urunKoku null mu=" + (urunKoku == null));

                // Kullanıcı isteği: "1 sonraki adıma geç dediğinde paket
                // adedi ve paket kodlarını oluştur desin bunlarda oluşup
                // listeye eklensin" — 2. adım. Ürünün reçetesinde DAHA ÖNCE
                // eklenmiş bir paket kalemi varsa (bu dosya zaten kurulmuş)
                // TEKRAR sorulmaz — dialog kendi içindeki "Bu Adımı Geç" ile
                // her durumda atlanabilir.
                var paketKokleri = new List<BilesenDugumu>();
                if (urunKoku != null)
                {
                    var mevcutRecete = ReceteGetir(_kokTip, _kokKart);
                    bool paketleriVarMi = mevcutRecete != null &&
                        ((JArray)mevcutRecete["kalemler"]).OfType<JObject>().Any(k => (string)k["tip"] == "paket");
                    if (!paketleriVarMi)
                        paketKokleri = await PaketleriOlustur(_kokKart);
                }
                Tanilama.Kaydet($"VerileriYukleVeBaslat: PaketleriOlustur asamasi bitti, paket={paketKokleri.Count}");

                int toplamBilesen = ToplamBilesenSayisi(bilesenKokleri);
                if (urunKoku != null)
                {
                    // "sonra mevcut componentler oluşan ürün kartı ve
                    // paketlerin altına gelsin ve paketlerin içine sürükleyip
                    // bırakalım" — paketler VE gerçek bileşenler ürün kökünün
                    // KARDEŞ çocukları olarak yerleştirilir; bileşenler
                    // buradan istenen paketin üstüne sürüklenip bırakılabilir
                    // (mevcut sürükle-bırak mekanizması aynen kullanılır).
                    urunKoku.Cocuklar.AddRange(paketKokleri);
                    urunKoku.Cocuklar.AddRange(bilesenKokleri);
                    bilesenKokleri = new List<BilesenDugumu> { urunKoku };
                }
                Tanilama.Kaydet("VerileriYukleVeBaslat: BilesenAgaciniCiz() cagriliyor");
                BilesenAgaciniCiz(bilesenKokleri);
                Tanilama.Kaydet("VerileriYukleVeBaslat: BilesenAgaciniCiz() bitti");

                // urunKoku kurulduysa KokKartAyarla (UrunKokuOlustur içinde)
                // zaten _kokKartEtiketi'ni "[ÜRÜN] kod — ad" olarak ayarladı —
                // bunu genel mesajla EZMEYELİM.
                if (urunKoku == null)
                {
                    _kokKartEtiketi.Text = toplamBilesen > 0
                        ? "Yukarıdaki bileşen ağacından bir bileşen seçin — kartı otomatik eşleşirse burada görünür, eşleşmezse 'Farklı Kart Seç…' ile eşleştirin."
                        : "Aktif belgede bileşen bulunamadı.";
                }
                string kaynakNotu = onbellektenMi
                    ? $" — yerel önbellekten yüklendi ({(onbellekKapsam == "baglantili" ? "yalnızca önceki dosyaya bağlantılı" : "komple")}, {onbellekTarih}); güncellemek için ⬇ İndir'e basın."
                    : "";
                string baglantiNotu = girisBasarili ? "" : "  ⚠ ÜretimOS'a giriş yapılamadı — kaydetme/gönderme işlemleri şu an ÇALIŞMAYACAK, yalnızca görüntüleme/hazırlık yapabilirsiniz.";
                _durumEtiketi.ForeColor = !girisBasarili || (onbellektenMi && onbellekKapsam == "baglantili") ? Color.DarkOrange : Color.DarkGreen;
                _durumEtiketi.Text = $"✓ {toplamBilesen} bileşen listelendi, {_receteler.Count} reçete, {_hammaddeler.Count} hammadde yüklendi.{kaynakNotu}{baglantiNotu}";
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("ReceteAgaciPaneli.VerileriYukleVeBaslat HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Veri çekilemedi: " + ex.Message;
            }
        }

        // ⬇ İndir butonuyla (MasterVeriyiYerelIndir) daha önce yazılmış bir
        // yerel önbellek dosyası varsa TÜM başlangıç verisini (hammaddeler,
        // ürün/yarımamül/paket/altmontaj kartları, reçeteler, rotalar,
        // hatlar, ayarlar) sunucuya HİÇ gitmeden bu dosyadan doldurur.
        // Dosya yoksa/bozuksa false döner (çağıran canlı çekmeye düşer).
        private bool YerelOnbellektenYukle(out string kapsam, out string tarih)
        {
            kapsam = null; tarih = null;
            try
            {
                if (!File.Exists(YerelVeriOnbellekYolu)) return false;
                var kok = JObject.Parse(File.ReadAllText(YerelVeriOnbellekYolu));
                _hammaddeler = kok["hammaddeler"] as JArray ?? new JArray();
                _urunler = kok["urunler"] as JArray ?? new JArray();
                _yarimamuller = kok["yarimamuller"] as JArray ?? new JArray();
                _paketler = kok["paketler"] as JArray ?? new JArray();
                _altMontajlar = kok["altMontajlar"] as JArray ?? new JArray();
                _receteler = kok["receteler"] as JArray ?? new JArray();
                _rotalar = kok["rotalar"] as JArray ?? new JArray();
                _hatlar = kok["hatlar"] as JObject ?? new JObject();
                _ayarlar = kok["ayarlar"] as JObject ?? new JObject();
                kapsam = (string)kok["kapsam"] ?? "komple";
                tarih = (string)kok["indirmeTarihi"] ?? "?";
                return true;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("YerelOnbellektenYukle HATA (canlı veriye düşülüyor): " + ex);
                return false;
            }
        }

        // Ürün kodu/kartı oluşturma ekranını açar (ya da belge zaten bir ürün
        // kartıyla eşleşmişse TEKRAR SORMADAN onu kullanır), kartı gerekirse
        // ÜretimOS'a kaydeder, kalıcılık için belgenin KENDİ URETIMOS_KOD özel
        // alanına yazar (EslesmeYazVeUygula'daki AYNI gerekçe) ve ağacın en
        // üstüne konacak sentetik ürün düğümünü döndürür (iptal veya kayıt
        // hatasında null). _kokKart/_kokTip de bu karta ayarlanır — böylece üst
        // özet/Kaydet/Rota panelleri de aynı kökü yansıtır.
        private async System.Threading.Tasks.Task<BilesenDugumu> UrunKokuOlustur()
        {
            JObject urunKarti = null;
            string mevcutKod = KesimListesiCikarici.OzelAlanOku(_hedefModel, OzelAlanlar.KOD);
            if (!string.IsNullOrWhiteSpace(mevcutKod))
                urunKarti = _urunler.OfType<JObject>().FirstOrDefault(k => (string)k["kod"] == mevcutKod);

            if (urunKarti == null)
            {
                string dosyaAdi = Path.GetFileNameWithoutExtension(_hedefModel.GetPathName());
                using (var dlg = new YeniKartDialog("urun", _hammaddeler, dosyaAdi))
                {
                    dlg.Text = "Ürün Kodu ve Kartı Oluştur — reçetenin en üst kalemi";
                    if (dlg.ShowDialog(this) != DialogResult.OK || dlg.SonucKart == null) return null;
                    urunKarti = dlg.SonucKart;
                }

                bool basarili;
                try
                {
                    basarili = await _istemci.ToplukaEkleGuncelle("urunler", new List<object> { urunKarti }, new List<object>());
                }
                catch (Exception ex)
                {
                    Tanilama.Kaydet("UrunKokuOlustur HATA: " + ex);
                    basarili = false;
                }
                if (!basarili)
                {
                    MessageBox.Show("Ürün kartı ÜretimOS'a kaydedilemedi (sunucu reddetti). Ağaç ürün kökü olmadan açılacak.",
                        "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return null;
                }
                _urunler.Add(urunKarti);
                PaletiFiltrele();

                string kod = (string)urunKarti["kod"];
                try { KesimListesiCikarici.OzelAlanYaz(_hedefModel, OzelAlanlar.KOD, kod); }
                catch (Exception ex) { Tanilama.Kaydet("UrunKokuOlustur (URETIMOS_KOD yazılamadı) HATA: " + ex); }
            }

            KokKartAyarla("urun", urunKarti);
            return new BilesenDugumu
            {
                Sinif = "urun",
                ElleEklendi = true,
                MevcutKod = (string)urunKarti["kod"],
                GosterimAdi = (string)urunKarti["ad"]
            };
        }

        // Kullanıcı isteği: "1 sonraki adıma geç dediğinde paket adedi ve
        // paket kodlarını oluştur desin bunlarda oluşup listeye eklensin" —
        // 2. adım: kaç paket olacağı sorulur, her biri için kod/ad
        // düzenlenebilir bir satır üretilir, "Oluştur ve Devam Et" ile
        // HEPSİ TEK seferde ÜretimOS'a kaydedilir. Ambalaj tipi/ölçü/ağırlık
        // gibi diğer paket alanları varsayılan kalır — paket ağaçta seçili
        // karta atanınca zaten görünen "Paket Ölçü/Ağırlık Düzenle…" ile
        // (bkz. PaketOlcuAgirlikDuzenle) sonradan doldurulur; bu ekran o
        // formu TEKRARLAMAZ. "Bu Adımı Geç" ile tamamen atlanabilir.
        private async System.Threading.Tasks.Task<List<BilesenDugumu>> PaketleriOlustur(JObject urunKarti)
        {
            var sonuc = new List<BilesenDugumu>();
            using (var dlg = new Form { Text = "Paket Sayısı ve Kodlarını Oluştur — 2. Adım", Width = 560, Height = 480, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, MinimizeBox = false, MaximizeBox = false })
            {
                var ustPanel = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 40, Padding = new Padding(10, 8, 0, 0) };
                var adetLbl = new Label { Text = "Paket Adedi:", AutoSize = true, Padding = new Padding(0, 6, 6, 0) };
                var adetKutu = new NumericUpDown { Minimum = 1, Maximum = 50, Value = 1, Width = 60, Margin = new Padding(0, 3, 8, 0) };
                var uretBtn = new Button { Text = "Satırları Oluştur", AutoSize = true };
                ustPanel.Controls.Add(adetLbl);
                ustPanel.Controls.Add(adetKutu);
                ustPanel.Controls.Add(uretBtn);

                var satirPanel = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(10) };

                string urunKodu = (string)urunKarti["kod"] ?? "";
                string urunAdi = (string)urunKarti["ad"] ?? "";
                var satirlar = new List<(TextBox kod, TextBox ad)>();

                void SatirlariUret()
                {
                    satirPanel.Controls.Clear();
                    satirlar.Clear();
                    int adet = (int)adetKutu.Value;
                    // Dock=Top TERS sırada eklenir (bkz. KurulumYap'ın başındaki NOT).
                    for (int i = adet; i >= 1; i--)
                    {
                        var satirFlow = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 32, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
                        satirFlow.Controls.Add(new Label { Text = $"Paket {i}:", AutoSize = true, Width = 65, Padding = new Padding(0, 6, 4, 0) });
                        var kodKutu = new TextBox { Width = 160, Margin = new Padding(3), Text = $"{urunKodu}-PKT{i:00}" };
                        var adKutu = new TextBox { Width = 230, Margin = new Padding(3), Text = $"{urunAdi} - Paket {i}" };
                        satirFlow.Controls.Add(kodKutu);
                        satirFlow.Controls.Add(adKutu);
                        satirPanel.Controls.Add(satirFlow);
                        satirlar.Insert(0, (kodKutu, adKutu));
                    }
                }
                uretBtn.Click += (s, e) => SatirlariUret();
                SatirlariUret();

                var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 44 };
                var gecBtn = new Button { Text = "Bu Adımı Geç", Dock = DockStyle.Left, Width = 130 };
                var olusturBtn = new Button { Text = "Oluştur ve Devam Et", Dock = DockStyle.Right, Width = 160 };
                altPanel.Controls.Add(gecBtn);
                altPanel.Controls.Add(olusturBtn);

                gecBtn.Click += (s, e) => { dlg.DialogResult = DialogResult.Cancel; };

                List<JObject> yeniPaketler = null;
                olusturBtn.Click += async (s, e) =>
                {
                    var girilenler = satirlar.Select(t => (kod: t.kod.Text.Trim(), ad: t.ad.Text.Trim())).ToList();
                    if (girilenler.Any(g => string.IsNullOrEmpty(g.kod) || string.IsNullOrEmpty(g.ad)))
                    {
                        MessageBox.Show("Her paket için Kod ve Ad zorunludur.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    olusturBtn.Enabled = false;
                    var yeniler = girilenler.Select(g => new JObject
                    {
                        ["id"] = "PKT-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                        ["kod"] = g.kod,
                        ["ad"] = g.ad,
                        ["ambalajTipi"] = "Koli",
                        ["koliIciAdet"] = 1,
                        ["en"] = 0,
                        ["boy"] = 0,
                        ["yukseklik"] = 0,
                        ["netAgirlik"] = 0,
                        ["brutAgirlik"] = 0,
                        ["aciklama"] = "",
                        ["rotaId"] = null,
                        ["amortismanGideri"] = 0,
                        ["gygOraniYuzde"] = 0,
                        ["gorseller"] = new JArray(),
                        ["olusturmaTarihi"] = DateTime.Now.ToString("yyyy-MM-dd")
                    }).ToList();

                    bool basarili;
                    try
                    {
                        basarili = await _istemci.ToplukaEkleGuncelle("paketler", yeniler.Cast<object>().ToList(), new List<object>());
                    }
                    catch (Exception ex)
                    {
                        Tanilama.Kaydet("PaketleriOlustur HATA: " + ex);
                        basarili = false;
                    }
                    if (!basarili)
                    {
                        MessageBox.Show("Paketler ÜretimOS'a kaydedilemedi (sunucu reddetti).", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        olusturBtn.Enabled = true;
                        return;
                    }
                    foreach (var p in yeniler) _paketler.Add(p);
                    PaletiFiltrele();
                    yeniPaketler = yeniler;
                    dlg.DialogResult = DialogResult.OK;
                };

                dlg.Controls.Add(satirPanel);
                dlg.Controls.Add(altPanel);
                dlg.Controls.Add(ustPanel);

                if (dlg.ShowDialog(this) == DialogResult.OK && yeniPaketler != null)
                {
                    foreach (var p in yeniPaketler)
                    {
                        sonuc.Add(new BilesenDugumu
                        {
                            Sinif = "paket",
                            ElleEklendi = true,
                            MevcutKod = (string)p["kod"],
                            GosterimAdi = (string)p["ad"]
                        });
                    }
                }
            }
            return sonuc;
        }

        // ── SOLIDWORKS BİLEŞEN AĞACI (TÜM component/part/assembly'ler) ───────
        private static int ToplamBilesenSayisi(List<BilesenDugumu> dugumler) =>
            dugumler.Sum(d => 1 + ToplamBilesenSayisi(d.Cocuklar));

        // GERÇEK ÇÖKME (kullanıcı raporu, ekran görüntüsü): SwAddin.cs'e
        // WindowsFormsSynchronizationContext KURULMASINA RAĞMEN, iç içe modal
        // pencerelerden (ShowDialog) sonra gelen bir "await"in devamı BAZEN
        // hâlâ yanlış iş parçacığında çalışıyor — hem "OLE... STA" hem
        // "denetimler farklı iş parçacığında oluşturulmuş" hatasıyla
        // SolidWorks'ü çökertti. Ambient SynchronizationContext'in bu
        // barındırılmış (Application.Run olmayan) ortamda HER senaryoda
        // güvenilir olmadığı KANITLANDI (tahmin değil, gerçek çökme). Bu
        // yardımcı, riskli (SolidWorks COM çağrısı veya WinForms kontrolü
        // oluşturan) kodu doğrudan BU Form'un — mesaj aldığı KANITLANMIŞ —
        // kendi InvokeRequired/Invoke mekanizmasıyla çalıştırır; SolidWorks'ün
        // mesaj döngüsünün otomatik marshaling ile nasıl etkileştiğine dair
        // HİÇBİR varsayımda bulunmaz.
        private void AnaPencerede(Action eylem)
        {
            if (IsDisposed) return;
            if (InvokeRequired) Invoke(eylem);
            else eylem();
        }

        // "🔄 Ağacı Yenile" — bkz. buton tanımındaki NOT. SolidWorks'ü yeniden
        // tarar (yeni eklenen bileşenler görünür) ve eski ağaçtaki (kod veya
        // dosya yoluyla eşleşen) düğümlerin sınıf/kenar bandı/taslak ölçü/
        // dahil-mi durumunu yeni düğümlere aktarır. "Ürün Kökü" ve "Paket"
        // gibi SENTETİK düğümler (Model == null) dokunulmadan korunur —
        // yalnızca GERÇEK (Model != null) SolidWorks bileşenleri değiştirilir.
        private void AgaciYenile()
        {
            if (_hedefModel == null || _bilesenKokListesi == null) return;

            string Kimlik(BilesenDugumu d) =>
                !string.IsNullOrWhiteSpace(d.MevcutKod) ? "kod:" + d.MevcutKod
                : "yol:" + (d.Model?.GetPathName() ?? "").ToLowerInvariant();

            var eskiHarita = new Dictionary<string, BilesenDugumu>();
            void EskiTara(List<BilesenDugumu> liste)
            {
                foreach (var d in liste)
                {
                    if (d.Model != null) eskiHarita[Kimlik(d)] = d;
                    EskiTara(d.Cocuklar);
                }
            }
            EskiTara(_bilesenKokListesi);

            List<BilesenDugumu> yeniBilesenler;
            try { yeniBilesenler = BilesenAgaci.Cikar(_hedefModel, _hammaddeler.OfType<JObject>()); }
            catch (Exception ex)
            {
                Tanilama.Kaydet("AgaciYenile HATA: " + ex);
                MessageBox.Show("Ağaç yenilenirken hata: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            int korunanSayisi = 0, yeniSayisi = 0;
            void Boya(List<BilesenDugumu> liste)
            {
                foreach (var d in liste)
                {
                    if (eskiHarita.TryGetValue(Kimlik(d), out var eski))
                    {
                        d.Sinif = eski.Sinif;
                        d.KenarOnId = eski.KenarOnId; d.KenarArkaId = eski.KenarArkaId;
                        d.KenarSolId = eski.KenarSolId; d.KenarSagId = eski.KenarSagId;
                        d.TaslakBoyMm = eski.TaslakBoyMm; d.TaslakEnMm = eski.TaslakEnMm; d.TaslakKalinlikMm = eski.TaslakKalinlikMm;
                        d.AktarimaDahil = eski.AktarimaDahil;
                        korunanSayisi++;
                    }
                    else yeniSayisi++;
                    Boya(d.Cocuklar);
                }
            }
            Boya(yeniBilesenler);

            void GercekleriDegistir(List<BilesenDugumu> liste)
            {
                var sentetikler = liste.Where(c => c.Model == null).ToList();
                liste.Clear();
                liste.AddRange(sentetikler);
                liste.AddRange(yeniBilesenler);
            }
            if (_bilesenKokListesi.Count == 1 && _bilesenKokListesi[0].Model == null
                && _bilesenKokListesi[0].ElleEklendi && _bilesenKokListesi[0].Sinif == "urun")
                GercekleriDegistir(_bilesenKokListesi[0].Cocuklar);
            else
                GercekleriDegistir(_bilesenKokListesi);

            Tanilama.Kaydet($"AgaciYenile: Cikar() bitti (korunan={korunanSayisi}, yeni={yeniSayisi}), BilesenAgaciniCiz() cagriliyor");
            BilesenAgaciniCiz();
            Tanilama.Kaydet("AgaciYenile: BilesenAgaciniCiz() bitti");
            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = $"🔄 Ağaç SolidWorks'ten yenilendi — {korunanSayisi} bileşenin sınıf/eşleşme durumu korundu, {yeniSayisi} yeni bileşen bulundu.";
        }

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
            // TANI: bir sonraki çökmede bu satırın günlükte GÖRÜNÜP
            // GÖRÜNMEDİĞİ, sorunun satır/kontrol OLUŞTURMA (yukarısı) mı yoksa
            // Dispose/Clear/Add (aşağısı) aşamasında mı olduğunu ayırt eder.
            Tanilama.Kaydet($"BilesenAgaciniCiz: {satirlar.Count} satir kontrolu olusturuldu, Dispose/Clear basliyor");

            // Kullanıcı isteği: "birşey seçince sıra kayıyor tekrar onu bulmam
            // gerekiyor" — Controls.Clear() kaydırma konumunu sıfırlar; her
            // sınıf/eşleşme değişikliğinde TÜM satırlar yeniden oluşturulduğu
            // için (bkz. yukarıdaki NOT), kaydırma konumu elle saklanıp geri
            // yüklenmezse kullanıcı üzerinde çalıştığı satırı kaybediyordu.
            var kaydirmaKonumu = _bilesenAgaciGorunumu.AutoScrollPosition;

            _bilesenAgaciGorunumu.SuspendLayout();

            // KULLANICI RAPORU: "parçalar ve alt kırılımlar fazlalaşınca
            // kilitlenip kapanıyor." GERÇEK KÖK NEDEN: Controls.Clear() eski
            // kontrolleri koleksiyondan ÇIKARIR ama ASLA Dispose ETMEZ — her
            // satır (ComboBox/Button/Label dolu bir Panel) kendi Win32
            // pencere tanıtıcısını (HWND/GDI handle) canlı tutmaya devam
            // eder. BilesenAgaciniCiz HER etkileşimde (sınıf seçimi, kenar
            // bandı, ek kalem, vb.) TÜM ağacı SIFIRDAN yeniden çiziyor — bu
            // yüzden büyük bir ağaçta (çok parça/alt kırılım) her tıklama
            // YÜZLERCE/BİNLERCE tanıtıcı SIZDIRIYORDU. Windows'un işlem
            // başına varsayılan USER/GDI tanıtıcı kotası (10.000) dolunca
            // yeni pencere/kontrol oluşturma BAŞARISIZ olur — tam olarak
            // gözlemlenen "kilitlenip kapanma" budur (küçük ağaçlarda fark
            // edilmez, büyüdükçe daha hızlı dolar). Control.Dispose() KENDİ
            // alt kontrollerini de özyinelemeli olarak Dispose ettiği için,
            // Clear()'dan ÖNCE her üst satırı Dispose etmek YETERLİDİR.
            foreach (Control eskiSatir in _bilesenAgaciGorunumu.Controls)
                eskiSatir.Dispose();
            _bilesenAgaciGorunumu.Controls.Clear();
            Tanilama.Kaydet("BilesenAgaciniCiz: eski satirlar Dispose/Clear edildi, Controls.Add basliyor");
            // Dock=Top TERS sırada eklenir (bkz. KurulumYap'ın başındaki NOT).
            for (int i = satirlar.Count - 1; i >= 0; i--)
                _bilesenAgaciGorunumu.Controls.Add(satirlar[i]);
            _bilesenAgaciGorunumu.ResumeLayout();
            Tanilama.Kaydet("BilesenAgaciniCiz: Controls.Add + ResumeLayout bitti");

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
            // Kullanıcı isteği: "alt kırılımı olan satırları akordion sekme
            // gibi açıp kapatabileyim" — düğüm KATLANMIŞSA (Genisletildi ==
            // false) alt dalı HİÇ oluşturulmaz (yalnızca gizlenmez — büyük
            // ağaçlarda hem görsel kalabalık hem de kontrol/tanıtıcı sayısı
            // azalır, bkz. BilesenAgaciniCiz'deki Dispose notu).
            if (!dugum.Genisletildi) return;
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
        // taktirde eşleşmemiş kalıyor" + "yarımamül seçtiğimde otomatik ekle
        // yada yarımamül seç sekmesi gelsin" — HERHANGİ bir sınıf seçilince
        // (yalnızca hammadde ailesi DEĞİL, artık yarımamül/alt montaj/paket/
        // ürün de dahil) "Ekle / Seç" seçim penceresinin HANGİ tipten
        // başlaması gerektiğini söyler (KokKartSeciciAc'in tipKutu
        // listesindeki etiketlerle birebir aynı yazım).
        private static readonly Dictionary<string, string> SinifTipEtiketiTumu = new Dictionary<string, string>
        {
            ["hirdavat"] = "Hırdavat",
            ["plaka"] = "Plaka",
            ["kenar_bandi"] = "Kenar Bandı",
            ["sarf"] = "Sarf Malzeme",
            ["yarimamul"] = "Yarı Mamül",
            ["altmontaj"] = "Alt Montaj",
            ["paket"] = "Paket",
            ["urun"] = "Ürün",
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

            // Kullanıcı isteği: "satır doluyor... alt kırılımı olan satırları
            // akordion sekme gibi açıp kapatabileyim" — yalnızca GERÇEKTEN
            // çocuğu olan düğümlerde katla/aç düğmesi gösterilir; katlanınca
            // BilesenSatirlariTopla alt dalı hiç oluşturmaz (bkz. o metottaki
            // NOT). Çocuğu olmayan satırlarda AYNI genişlikte boş alan
            // bırakılır ki tüm satırların metin sütunu hizalı kalsın.
            if (dugum.Cocuklar.Count > 0)
            {
                var katlaBtn = new Label
                {
                    Text = dugum.Genisletildi ? "▼" : "▶",
                    AutoSize = true, Cursor = Cursors.Hand, Font = KalinFont,
                    Padding = new Padding(0, 6, 4, 0), ForeColor = Color.DimGray,
                    MinimumSize = new Size(16, 0)
                };
                katlaBtn.Click += (s, e) => { dugum.Genisletildi = !dugum.Genisletildi; BilesenAgaciniCiz(); };
                satir.Controls.Add(katlaBtn);
            }
            else
            {
                satir.Controls.Add(new Panel { Width = 16, Height = 1 });
            }

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
                sinifKutusu.SelectedIndexChanged += async (s, e) =>
                {
                    dugum.Sinif = SinifKarsilikBul(sinifKutusu.SelectedIndex);
                    // Kullanıcı isteği: "tüm yaptığım değişiklikleri aynen
                    // kaydettiğim gibi geri gelmesini sağla" — Sınıf artık
                    // KOD/AD ile AYNI ilkeyle dosyanın kendisine de yazılır
                    // (bkz. OzelAlanlar.SINIF/BilesenAgaci.DugumOlustur) —
                    // 💾 SolidWorks'e Kaydet ile diske işlenince SolidWorks
                    // kapanıp açılsa/Ağacı Yenile'de bile kaybolmaz.
                    if (dugum.Model != null)
                    {
                        try { KesimListesiCikarici.OzelAlanYaz(dugum.Model, OzelAlanlar.SINIF, dugum.Sinif ?? ""); }
                        catch (Exception ex) { Tanilama.Kaydet("Sinif ozel alani yazilamadi HATA: " + ex); }
                    }
                    BilesenAgaciniCiz();
                    // Kullanıcı isteği: "yarımamül seçtiğimde otomatik ekle
                    // yada yarımamül seç sekmesi gelsin ekle'de yeni yarımamül
                    // oluşturma ekranı açılsın ekle'de üretimostan yarımamül
                    // seçme ekranı" — HERHANGİ bir sınıf seçilince (yalnızca
                    // hammadde ailesi değil, artık yarımamül/alt montaj/paket/
                    // ürün de dahil) VE henüz bir kartla eşleşmemişse, "+ Yeni
                    // Kart Oluştur" / "🔍 Mevcut Karttan Seç" seçim penceresi
                    // HEMEN açılır (unutmayı önler).
                    if (!string.IsNullOrEmpty(dugum.Sinif) && KodileKartBul(dugum.MevcutKod).kart == null)
                    {
                        await DugumEslestirmeSeciciAc(dugum);
                    }
                };
                satir.Controls.Add(sinifKutusu);

                var ekKalemBtn = new Button { Text = "+ Ek Kalem", AutoSize = true, Margin = new Padding(3) };
                ekKalemBtn.Click += (s, e) => BilesenEkKalemEkleDialogAc(dugum);
                satir.Controls.Add(ekKalemBtn);

                // Kullanıcı isteği: "tüm satırları düzenleyebileyim düzenle
                // tuşuna bastığımda seçtiğim (ürün kartı, yarımamül, alt
                // montaj vb.) düzenleme ekranı açılsın ... özellikle
                // yarımamül seçtiğim kalemlerde direkt yarımamül düzenleme
                // ekranı açılsın" — "+ Ek Kalem" ile AYNI şekilde HER satırda
                // gösterilir (sadece eşleşenlerde değil): eşleşen kart varsa
                // düzenleme formu, henüz eşleşmemiş ama sınıflandırılmış bir
                // satırsa YENİ kart oluşturup HEMEN eşleştiren form açılır
                // (bkz. BilesenKartDuzenle).
                var duzenleBtn = new Button { Text = "✎ Düzenle", AutoSize = true, Margin = new Padding(3) };
                duzenleBtn.Click += async (s, e) => await BilesenKartDuzenle(dugum);
                satir.Controls.Add(duzenleBtn);

                // Kullanıcı isteği: "rota ekranı ... her yarımamül ve paket
                // satırına eklensin" — yalnızca zaten bir karta eşleşmiş
                // yarımamül/paket satırlarında anlamlı (rota, KARTIN kendi
                // alanıdır — henüz oluşmamış bir karta rota atanamaz).
                if ((dugum.Sinif == "yarimamul" || dugum.Sinif == "paket") && KodileKartBul(dugum.MevcutKod).kart is JObject rotaKarti)
                {
                    var rotaBtnSatir = new Button { Text = "⚙ Rota", AutoSize = true, Margin = new Padding(3) };
                    rotaBtnSatir.Click += async (s, e) => await RotaSecVeyaOlusturDialogAc(dugum.Sinif, rotaKarti);
                    satir.Controls.Add(rotaBtnSatir);
                }

                // Kullanıcı isteği: "reçete oluşturduğumuz her kalemin teknik
                // resmini de pdf ve dwg olarak üretimosa atabilelim ... her
                // yarımamül, her plaka, her hırdavat, her alt montaj vb." —
                // eşleşmiş HER sınıf için (KodileKartBul hammadde ailesinde
                // hep "hammadde" tipini döner — plaka/hırdavat/kenar bandı/
                // sarf FARK ETMEZ, aynı buton çalışır) ÜretimOS'un KENDİ
                // "Teknik Dosyalar" deposuna (api.php: dosyaYukle — page_
                // kartlar.js'in/QrDosya'nın kullandığı AYNI uç, qr_dosya.js)
                // PDF/DWG/DXF/STEP yüklenebilir.
                var (tdTip, tdKart) = KodileKartBul(dugum.MevcutKod);
                if (tdKart != null)
                {
                    // Kullanıcı isteği: "seçilen dosyaların isimlerini ...
                    // seçtiğim satırda göster" — bu oturumda en az bir kez
                    // "📎 Teknik Resim" açıldıysa (TeknikDosyaYukleDialogAc'ın
                    // ListeyiYenile'i doldurur), buton metnine dosya sayısı
                    // eklenir; hiç açılmadıysa sunucuya SORULMAZ (etiket boş
                    // kalır) — tüm ağaç için baştan toplu sorgu YOK.
                    string tdOnbellekAnahtari = tdTip + "|" + (string)tdKart["id"];
                    string tdSayiEtiketi = _teknikDosyaAdlariOnbellek.TryGetValue(tdOnbellekAnahtari, out var tdListe) && tdListe.Count > 0 ? $" ({tdListe.Count})" : "";
                    var teknikResimBtn = new Button { Text = "📎 Teknik Resim" + tdSayiEtiketi, AutoSize = true, Margin = new Padding(3) };
                    teknikResimBtn.Click += async (s, e) => await TeknikDosyaYukleDialogAc(tdTip, tdKart, dugum.Model);
                    satir.Controls.Add(teknikResimBtn);
                }

                // Kullanıcı isteği: "eklediğim kalemleri ve parçaları
                // silebileyim" — bu, gerçek SolidWorks montaj yapısına
                // DOKUNMAZ, yalnızca bu oturumun taslak ağacından düğümü (ve
                // varsa tüm alt dalını) kaldırır; SolidWorks'ten yeniden
                // açılırsa (panel kapatılıp tekrar açılırsa) gerçek bileşen
                // yine listelenir — yanlışlıkla eklenen "+ Ek Kalem"
                // tekrarlarını/hatalı sınıflandırmaları temizlemek içindir.
                var silBtn = new Button { Text = "🗑", AutoSize = true, Margin = new Padding(3), ForeColor = Color.DarkRed };
                silBtn.Click += (s, e) =>
                {
                    string uyari = dugum.Cocuklar.Count > 0
                        ? $"'{dugum.GosterimAdi}' ve {dugum.Cocuklar.Count} alt kalemi taslak listeden kaldırılsın mı?\n\nSolidWorks dosyaları ETKİLENMEZ — yalnızca bu ekrandaki taslaktan kaldırılır."
                        : $"'{dugum.GosterimAdi}' taslak listeden kaldırılsın mı?\n\nSolidWorks dosyaları ETKİLENMEZ — yalnızca bu ekrandaki taslaktan kaldırılır.";
                    if (MessageBox.Show(uyari, "ÜretimOS", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
                    BilesenUstListesiniBul(dugum)?.Remove(dugum);
                    if (ReferenceEquals(_seciliBilesenDugumu, dugum)) _seciliBilesenDugumu = null;
                    BilesenAgaciniCiz();
                };
                satir.Controls.Add(silBtn);
            }

            // Sürükle-bırak HEDEFİ — bu satırın üstüne bırakılan başka bir
            // bileşen, bu düğümün ÇOCUĞU olur (kendi alt dalına taşıma
            // engellenir, TAM döngü tespiti YAPILMAZ — yalnızca bu bariz
            // durum kontrol edilir). Kullanıcı isteği: "sol taraftaki
            // solidworks component seçim kolonundan ekleyebileyim" — soldaki
            // ÜretimOS kart paleti (PaletOgesi) buraya bırakılırsa, "+ Ek
            // Kalem" dialogu AÇMADAN aynı sentetik alt kalem doğrudan eklenir.
            panel.AllowDrop = true;
            panel.DragEnter += (s, e) =>
            {
                e.Effect = e.Data.GetDataPresent(typeof(BilesenDugumu)) ? DragDropEffects.Move
                    : e.Data.GetDataPresent(typeof(PaletOgesi)) ? DragDropEffects.Copy
                    : DragDropEffects.None;
            };
            panel.DragDrop += (s, e) =>
            {
                if (e.Data.GetData(typeof(BilesenDugumu)) is BilesenDugumu tasinan)
                {
                    if (ReferenceEquals(tasinan, dugum)) return;
                    if (BilesenAltIcindeMi(tasinan, dugum))
                    {
                        MessageBox.Show("Bir bileşen kendi alt dalının içine taşınamaz.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    BilesenUstListesiniBul(tasinan)?.Remove(tasinan);
                    dugum.Cocuklar.Add(tasinan);
                    BilesenAgaciniCiz();
                }
                else if (e.Data.GetData(typeof(PaletOgesi)) is PaletOgesi secilen)
                {
                    var yeniDugum = BilesenSentetikCocukOlustur(secilen, dugum);
                    if (yeniDugum == null) return;
                    dugum.Cocuklar.Add(yeniDugum);
                    BilesenAgaciniCiz();
                }
            };

            panel.Controls.Add(satir);
            return panel;
        }

        // ── TEKNİK RESİM YÜKLE (PDF/DWG/DXF/STEP) ────────────────────────────
        // Kullanıcı isteği: "reçete oluşturduğumuz her kalemin teknik resmini
        // de pdf ve dwg olarak üretimosa atabilelim." ÜretimOS'un KENDİ
        // "Teknik Dosyalar" deposunu (api.php: qrKayit/dosyaYukle — page_
        // kartlar.js ekranında kartların QR'lı dosya alanıyla AYNI depo,
        // "teknikDosyalar" kv anahtarı) kullanır — YENİ bir sunucu ucu
        // GEREKMEDİ. "qrKayit" ÖN ŞART DEĞİL: api.php'nin dosyaYukle işleyicisi
        // kayıt yoksa kendisi oluşturuyor (bkz. UretimOSApiClient.DosyaYukle).
        // Kullanıcı isteği: "seçilen dosyaların isimlerini teknik resim
        // yükle ekranında ve seçtiğim satırda göster" — bu diyalog artık
        // KAPANMADAN sunucudaki GÜNCEL dosya listesini gösterir (her
        // yükleme/silmeden sonra kendini tazeler) ve "buna teknik resim
        // sekmesine bastığımda silip yenisini ekleyip güncelleyebileyim"
        // isteği için her dosyanın yanında 🗑 (sil) butonu vardır — TEK bir
        // açılışta birden fazla ekle/sil yapılabilir, "Kapat"a kadar sürer.
        private async System.Threading.Tasks.Task TeknikDosyaYukleDialogAc(string tip, JObject kart, ModelDoc2 model)
        {
            if (_istemci == null)
            {
                MessageBox.Show("ÜretimOS bağlantısı yok — teknik dosya yüklenemez.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            string refId = (string)kart["id"];
            string kod = (string)(kart["kod"] ?? kart["stokKodu"]);
            string ad = (string)kart["ad"];

            // Bu GERÇEK SolidWorks belgesi için daha önce "1) Teknik Resim
            // Oluştur → elle düzenle → 2) Onayla" akışıyla (bkz.
            // TeknikResimOlusturucu.cs) ONAYLANMIŞ bir DWG/PDF varsa
            // (Manifest.cs), kullanıcıya doğrudan ONU yüklemesi TEKLİF
            // edilir — burada yeni bir çizim TAHMİN/otomatik üretilmez,
            // yalnızca zaten onaylanmış dosyalar sunulur.
            ManifestGirdisi manifestGirdisi = null;
            string varsayilanKlasor = null;
            if (model != null)
            {
                try
                {
                    manifestGirdisi = Manifest.Bul(model.GetPathName());
                    string modelKlasoru = Path.GetDirectoryName(model.GetPathName());
                    if (!string.IsNullOrEmpty(modelKlasoru) && Directory.Exists(modelKlasoru)) varsayilanKlasor = modelKlasoru;
                }
                catch (Exception ex) { Tanilama.Kaydet("TeknikDosyaYukleDialogAc Manifest.Bul HATA: " + ex); }
            }

            bool acVeDuzenleIstendi = false, teknikResimOlusturIstendi = false;
            using (var dlg = new Form { Text = "Teknik Resim Yükle — " + kod, Width = 560, Height = 540, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
                var baslikLbl = new Label
                {
                    Text = $"{kod} — {ad}\nÜretimOS'un 'Teknik Dosyalar' alanı (kart ekranındaki aynı depo).",
                    Dock = DockStyle.Top, Height = 40
                };
                var listeBaslikLbl = new Label { Text = "Mevcut Teknik Dosyalar:", Dock = DockStyle.Top, Height = 20, Font = KalinFont, Padding = new Padding(0, 6, 0, 0) };
                var listePanel = new Panel { Dock = DockStyle.Top, Height = 130, AutoScroll = true, BorderStyle = BorderStyle.FixedSingle, Margin = new Padding(0, 0, 0, 10) };

                async System.Threading.Tasks.Task ListeyiYenile()
                {
                    listePanel.Controls.Clear();
                    List<JObject> dosyalar;
                    try { dosyalar = (await _istemci.TeknikDosyalariGetir(tip, refId, kod, ad)).OfType<JObject>().ToList(); }
                    catch (Exception ex) { Tanilama.Kaydet("TeknikDosyaYukleDialogAc ListeyiYenile HATA: " + ex); dosyalar = new List<JObject>(); }

                    _teknikDosyaAdlariOnbellek[tip + "|" + refId] = dosyalar.Select(d => (string)d["ad"]).ToList();

                    if (dosyalar.Count == 0)
                    {
                        listePanel.Controls.Add(new Label { Text = "(henüz dosya yok)", Dock = DockStyle.Top, Height = 22, ForeColor = Color.Gray, Padding = new Padding(4, 4, 0, 0) });
                        return;
                    }
                    var siraliSatirlar = new List<Control>();
                    foreach (var d in dosyalar)
                    {
                        var satirPanel = new Panel { Dock = DockStyle.Top, Height = 26 };
                        var adLbl = new Label { Text = $"{d["ad"]}  ({d["tarih"]})", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(4, 0, 0, 0), AutoEllipsis = true };
                        var silBtn2 = new Button { Text = "🗑", Dock = DockStyle.Right, Width = 32, ForeColor = Color.DarkRed };
                        string dosyaId = (string)d["id"];
                        string dosyaAdiLog = (string)d["ad"];
                        silBtn2.Click += async (s, e) =>
                        {
                            if (MessageBox.Show($"'{dosyaAdiLog}' silinsin mi?", "ÜretimOS", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
                            bool silindi = await _istemci.DosyaSil(tip, refId, dosyaId);
                            if (!silindi)
                            {
                                MessageBox.Show("Dosya silinemedi.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                                return;
                            }
                            await ListeyiYenile();
                            BilesenAgaciniCiz();
                        };
                        satirPanel.Controls.Add(silBtn2);
                        satirPanel.Controls.Add(adLbl);
                        siraliSatirlar.Add(satirPanel);
                    }
                    for (int i = siraliSatirlar.Count - 1; i >= 0; i--) listePanel.Controls.Add(siraliSatirlar[i]);
                }

                async System.Threading.Tasks.Task YukleVeYenile(IEnumerable<string> dosyaYollari)
                {
                    int basariliSayisi = 0;
                    var hatalar = new List<string>();
                    foreach (var dosyaYolu in dosyaYollari)
                    {
                        try
                        {
                            byte[] icerik = DosyaBaytlariniPaylasimliOku(dosyaYolu);
                            string dosyaAdi = Path.GetFileName(dosyaYolu);
                            var (yuklendi, hata) = await _istemci.DosyaYukle(tip, refId, dosyaAdi, icerik, kod, ad);
                            if (yuklendi) basariliSayisi++;
                            else hatalar.Add($"{dosyaAdi}: {hata}");
                        }
                        catch (Exception ex)
                        {
                            Tanilama.Kaydet("TeknikDosyaYukleDialogAc (yükleme) HATA: " + ex);
                            hatalar.Add($"{Path.GetFileName(dosyaYolu)}: {ex.Message}");
                        }
                    }
                    await ListeyiYenile();
                    BilesenAgaciniCiz();
                    if (hatalar.Count == 0)
                    {
                        _durumEtiketi.ForeColor = Color.DarkGreen;
                        _durumEtiketi.Text = $"✓ {basariliSayisi} teknik dosya '{kod}' kartına yüklendi.";
                    }
                    else
                    {
                        _durumEtiketi.ForeColor = Color.DarkOrange;
                        _durumEtiketi.Text = $"{basariliSayisi} dosya yüklendi, {hatalar.Count} dosya başarısız.";
                        MessageBox.Show("Bazı dosyalar yüklenemedi:\n\n" + string.Join("\n", hatalar), "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }

                Button onayliBtn = null;
                if (manifestGirdisi != null && (manifestGirdisi.DwgYolu != null || manifestGirdisi.PdfYolu != null))
                {
                    string ozet = string.Join(" + ", new[] { manifestGirdisi.DwgYolu != null ? "DWG" : null, manifestGirdisi.PdfYolu != null ? "PDF" : null }.Where(x => x != null));
                    onayliBtn = new Button { Text = $"✓ Daha önce onaylanmış teknik resmi yükle ({ozet})", Dock = DockStyle.Top, Height = 44, Margin = new Padding(0, 0, 0, 10) };
                    onayliBtn.Click += async (s, e) =>
                    {
                        var dosyalar = new List<string>();
                        if (manifestGirdisi.DwgYolu != null) dosyalar.Add(manifestGirdisi.DwgYolu);
                        if (manifestGirdisi.PdfYolu != null) dosyalar.Add(manifestGirdisi.PdfYolu);
                        await YukleVeYenile(dosyalar);
                    };
                }

                Button acVeDuzenleBtn = null, olusturBtn = null;
                if (model != null)
                {
                    acVeDuzenleBtn = new Button { Text = "📂 SLDPRT/SLDASM Dosyasını Aç ve Düzenle", Dock = DockStyle.Top, Height = 40, Margin = new Padding(0, 0, 0, 10) };
                    acVeDuzenleBtn.Click += (s, e) => { acVeDuzenleIstendi = true; dlg.DialogResult = DialogResult.Cancel; };

                    olusturBtn = new Button { Text = "📐 Teknik Resim Oluştur", Dock = DockStyle.Top, Height = 40, Margin = new Padding(0, 0, 0, 10) };
                    olusturBtn.Click += (s, e) => { teknikResimOlusturIstendi = true; dlg.DialogResult = DialogResult.Cancel; };
                }

                var secBtn = new Button { Text = "Bilgisayardan Dosya Seç… (PDF/DWG/DXF/STEP)", Dock = DockStyle.Top, Height = 40 };
                secBtn.Click += async (s, e) =>
                {
                    using (var acDialog = new OpenFileDialog { Filter = "Teknik dosyalar|*.pdf;*.dwg;*.dxf;*.step;*.stp|Tüm dosyalar|*.*", Multiselect = true, InitialDirectory = varsayilanKlasor ?? "" })
                    {
                        if (acDialog.ShowDialog(dlg) != DialogResult.OK) return;
                        await YukleVeYenile(acDialog.FileNames);
                    }
                };

                var kapatBtn = new Button { Text = "Kapat", Dock = DockStyle.Bottom, Height = 34 };
                kapatBtn.Click += (s, e) => dlg.DialogResult = DialogResult.Cancel;
                dlg.CancelButton = kapatBtn;

                panel.Controls.Add(secBtn);
                if (olusturBtn != null) panel.Controls.Add(olusturBtn);
                if (acVeDuzenleBtn != null) panel.Controls.Add(acVeDuzenleBtn);
                if (onayliBtn != null) panel.Controls.Add(onayliBtn);
                panel.Controls.Add(listePanel);
                panel.Controls.Add(listeBaslikLbl);
                panel.Controls.Add(baslikLbl);
                dlg.Controls.Add(panel);
                dlg.Controls.Add(kapatBtn);

                await ListeyiYenile();
                dlg.ShowDialog(this);
            }

            if (acVeDuzenleIstendi) ModelDosyasiniAcVeAktifYap(model?.GetPathName());
            else if (teknikResimOlusturIstendi) await TeknikResimOlusturDialogAc(tip, kart);
        }

        // Gerçek derleme/çalıştırma sonucu bulunan hata (yerel oturum
        // log'u, 20 Eylül 20:41): "📎 Teknik Resim" yükleme akışında
        // File.ReadAllBytes(yol), o dosya SolidWorks'te (veya başka bir
        // programda) AÇIKKEN "The process cannot access the file because
        // it is being used by another process" (IOException) ile ÇÖKÜYORDU
        // — SolidWorks bir SLDPRT/SLDASM'ı EXCLUSIVE değil PAYLAŞIMLI
        // (read/write share) kilitle açar, ama File.ReadAllBytes VARSAYILAN
        // olarak paylaşım İZNİ istemeden okumaya çalışır. FileShare.ReadWrite
        // İLE açmak, dosya başka bir işlemde açıkken bile okunabilmesini
        // sağlar (Windows'un standart, belgelenmiş paylaşımlı okuma modeli
        // — TAHMİN değil). Hem "📎 Teknik Resim" (elle seçilen herhangi bir
        // dosya, SLDPRT/SLDASM dahil — kullanıcı 'Tüm dosyalar' filtresiyle
        // açık bir 3B model dosyasını da seçebilir) hem "✓ Teknik Resmi
        // Onayla ve ÜretimOS'a Yükle" (SaveAs3'ten hemen sonra kendi ürettiği
        // DWG/PDF'i okur) AYNI riski taşıdığı için TEK bir paylaşımlı okuma
        // yardımcısında birleştirildi.
        private static byte[] DosyaBaytlariniPaylasimliOku(string yol)
        {
            using (var akis = new FileStream(yol, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var bellekAkisi = new MemoryStream())
            {
                akis.CopyTo(bellekAkisi);
                return bellekAkisi.ToArray();
            }
        }

        // "📂 SLDPRT/SLDASM Dosyasını Aç ve Düzenle" — kullanıcı isteği:
        // "burada bağlantılı dosyayı açıp teknik resim oluşturabileyim."
        // GERÇEK, bu projede ZATEN kullanılan/doğrulanmış SolidWorks API
        // (bkz. KutuYerlestirmeYoneticisi.cs'teki AYNI OpenDoc6 çağrısı) —
        // belge zaten bellekte açıksa (bu montajın bir parçası olarak)
        // SolidWorks onu YENİDEN OKUMADAN aktif pencereye getirir, bu
        // TAHMİN değil SolidWorks'ün belgelenmiş standart davranışıdır.
        private void ModelDosyasiniAcVeAktifYap(string modelYolu)
        {
            if (_app == null)
            {
                MessageBox.Show("SolidWorks uygulama bağlantısı yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (string.IsNullOrEmpty(modelYolu) || !File.Exists(modelYolu))
            {
                MessageBox.Show("Dosya bulunamadı: " + modelYolu, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try
            {
                int docType = modelYolu.EndsWith(".sldasm", StringComparison.OrdinalIgnoreCase)
                    ? (int)swDocumentTypes_e.swDocASSEMBLY : (int)swDocumentTypes_e.swDocPART;
                int hata = 0, uyari = 0;
                var acilan = _app.OpenDoc6(modelYolu, docType, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref hata, ref uyari);
                if (acilan == null)
                    MessageBox.Show($"Dosya açılamadı (hata kodu: {hata}).", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("ModelDosyasiniAcVeAktifYap HATA: " + ex);
                MessageBox.Show("Dosya açılamadı: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // Reçete kalemi (tip/refId) ile bileşen ağacındaki GERÇEK bir
        // SolidWorks bileşenini eşleştirir — kalem sadece {tip,refId} taşır,
        // hangi SolidWorks dosyasına karşılık geldiğini BİLMEZ; bunu, o KARTA
        // eşleşmiş (KodileKartBul ile) bir bileşen ağacı düğümü arayarak
        // ÇÖZERİZ. Sentetik ("+ Ek Kalem" ile eklenmiş, Model=null) düğümler
        // ATLANIR — onların gerçek bir SolidWorks belgesi yoktur.
        private BilesenDugumu GercekBilesenDugumuBulKartId(string tip, string refId)
        {
            if (_bilesenKokListesi == null || string.IsNullOrEmpty(refId)) return null;
            BilesenDugumu Ara(List<BilesenDugumu> liste)
            {
                foreach (var d in liste)
                {
                    if (d.Model != null && !string.IsNullOrEmpty(d.MevcutKod))
                    {
                        var (bulunanTip, bulunanKart) = KodileKartBul(d.MevcutKod);
                        if (bulunanTip == tip && bulunanKart != null && (string)bulunanKart["id"] == refId)
                            return d;
                    }
                    var altSonuc = Ara(d.Cocuklar);
                    if (altSonuc != null) return altSonuc;
                }
                return null;
            }
            return Ara(_bilesenKokListesi);
        }

        // ── TEKNİK RESİM OLUŞTUR (ADIM 1) → ONAYLA VE ÜRETİMOS'A YÜKLE (ADIM 2) ──
        // Kullanıcı isteği: "teknik resim ekle sekmeleri ekle her satıra ve
        // bağlantılı ürünün teknik resmini oluşturup kaydedelim sekmeye
        // basınca" — SONRA netleştirme: "çizimi önce ben düzenleyeyim ve
        // kontrol edeyim sonra onaylanıp kaydedilsin." İlk sürüm ARADA
        // DURMADAN otomatik kaydediyordu; bu SwAddin.cs'teki "1) Oluştur →
        // elle düzenle → 2) Onayla" ile AYNI, BİLEREK iki adımlı mimariye
        // (bkz. TeknikResimOlusturucu.cs üstteki notlar — otomatik görünüş
        // yerleşimi antete taşabildiği için elle kontrol GEREKİR) geri
        // döndürüldü — yalnızca ADIM 2'de (SaveAs3'ten sonra) ekstra olarak
        // ÜretimOS'a da yüklenir.
        //
        // ADIM 1 — çizimi oluşturur, SolidWorks'te AÇIK BIRAKIR (kaydetmez,
        // kapatmaz); hangi kalem için oluşturulduğunu _bekleyenTeknikResim
        // alanına yazar ki ADIM 2 (aşağıdaki global "✓ Teknik Resmi Onayla
        // ve ÜretimOS'a Yükle" butonu) doğru karta yükleyebilsin.
        private async System.Threading.Tasks.Task TeknikResimOlusturDialogAc(string tip, JObject kart)
        {
            if (_app == null)
            {
                MessageBox.Show("SolidWorks uygulama bağlantısı yok — teknik resim oluşturulamaz.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // GERÇEK BULGU: kullanıcı bir satırda "Oluştur"a basıp
            // ONAYLAMADAN başka bir satırda tekrar "Oluştur"a basınca, ilk
            // çizim SolidWorks'te açık kalırken _bekleyenTeknikResim SESSİZCE
            // ikincinin kartına geçiyordu — sonra "Onayla" hangi pencere
            // aktifse ONUN içeriğini YANLIŞ kartla yüklüyordu ("teknik
            // resimler tüm yarımamüllerde görünüyor" bulgusunun kök nedeni).
            // Farklı bir kart için hâlâ bekleyen (onaylanmamış) bir çizim
            // varsa şimdi AÇIKÇA uyarılıyor.
            if (_bekleyenTeknikResim != null && (string)_bekleyenTeknikResim.Value.kart["id"] != (string)kart["id"])
            {
                string bekleyenKod = (string)(_bekleyenTeknikResim.Value.kart["kod"] ?? _bekleyenTeknikResim.Value.kart["stokKodu"]);
                if (MessageBox.Show(
                    $"'{bekleyenKod}' için oluşturduğunuz teknik resim HENÜZ ONAYLANMADI. Onu tamamlamadan " +
                    "yeni bir çizim oluşturursanız, hangi çiziminizin hangi karta yükleneceği KARIŞABİLİR " +
                    "(SolidWorks'te iki çizim penceresi açık kalır, 'Onayla' o an odaklanmış olanı kullanır).\n\n" +
                    "Yine de devam edip yeni bir çizim oluşturulsun mu? (Önceki çizimi kaybetmeden önce onu " +
                    "onaylamanız/kaydetmeniz önerilir.)",
                    "ÜretimOS — Bekleyen Onaylanmamış Çizim Var", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
                {
                    return;
                }
            }

            string refId = (string)kart["id"];
            var dugum = GercekBilesenDugumuBulKartId(tip, refId);
            if (dugum?.Model == null)
            {
                MessageBox.Show(
                    "Bu kalem için, açık olan SolidWorks belgesinde eşleşmiş GERÇEK bir bileşen bulunamadı " +
                    "(bileşen ağacında bu kartla eşleşen bir bileşen görünmüyor olabilir, ya da bu kalem " +
                    "'+ Ek Kalem' ile elle eklenmiş bir referans olabilir).\n\n" +
                    "Teknik resim otomatik oluşturulamıyor — bunun yerine '📎 Teknik Resim' ile elle bir " +
                    "PDF/DWG dosyası yükleyebilirsiniz.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string modelYolu = dugum.Model.GetPathName();
            string sablonYolu = UretimOSAddin.SablonYoluBul(_app, "uretimos.drwdot", UretimOSAddin.SABLON_YOLU);
            if (string.IsNullOrWhiteSpace(sablonYolu) || !File.Exists(sablonYolu))
            {
                MessageBox.Show($"Çizim şablonu bulunamadı:\n{sablonYolu}\n\nSolidWorks'ün Sistem Seçenekleri > Dosya Konumları > " +
                    "Belge Şablonları klasörlerinden birine 'uretimos.drwdot' kopyalayın.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string kod = (string)(kart["kod"] ?? kart["stokKodu"]);
            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = $"📐 '{kod}' için teknik resim oluşturuluyor…";

            // NOT: SolidWorks COM nesneleri STA (UI) iş parçacığına bağlıdır —
            // diğer tüm SolidWorks API çağrıları gibi (bkz. SwAddin.cs'teki
            // AYNI çağrı) burada da senkron/doğrudan çağrılır, Task.Run GİBİ
            // arka plan iş parçacığına TAŞINMAZ (COM marshaling hatası riski).
            var resimUretici = new TeknikResimOlusturucu(_app);
            bool eklendi = resimUretici.TeknikResimAcVeDuzenlemeyeBirak(modelYolu, sablonYolu);
            if (!eklendi)
            {
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Teknik resim oluşturulamadı.";
                MessageBox.Show("Çizim oluşturulamadı.\n\n" + string.Join("\n", resimUretici.Uyarilar), "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Yeni çizim, TeknikResimAcVeDuzenlemeyeBirak içindeki NewDocument
            // çağrısından beri hâlâ ActiveDoc olmalı — "Onayla" adımının
            // (bkz. TeknikResimOnaylaVeYukleCalistir) YANLIŞ bir çizimi bu
            // karta karıştırmaması için referansı BURADA, kesin doğru anda
            // yakalıyoruz (öne getirmeden/başka pencereyle etkileşmeden ÖNCE).
            var yeniCizimBelgesi = _app.ActiveDoc as IModelDoc2;

            // Kullanıcı isteği: "teknik resim sayfası açılıyor ama arkada
            // kalıyor onu öne getir" — SolidWorks'ün ana penceresini,
            // kendi (WinForms) panelimizin ARKASINDA kalmaması için ön
            // plana getirir. Başarısız olsa bile çizim zaten oluşturuldu —
            // bu yalnızca bir görünürlük iyileştirmesi, akışı ENGELLEMEZ.
            SolidWorksPenceresiniOnePlanaGetir();

            _bekleyenTeknikResim = (tip, kart, modelYolu, yeniCizimBelgesi);
            if (_teknikResimOnaylaBtn != null) _teknikResimOnaylaBtn.Enabled = true;
            _durumEtiketi.ForeColor = Color.DarkOrange;
            _durumEtiketi.Text = $"'{kod}' için çizim oluşturuldu ve SolidWorks'te açık — düzenleyip/ölçülendirip kontrol edin, " +
                "bitince alttaki '✓ Teknik Resmi Onayla ve ÜretimOS'a Yükle' butonuna basın.";
            if (resimUretici.Uyarilar.Count > 0)
                MessageBox.Show(string.Join("\n", resimUretici.Uyarilar), "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        // GERÇEK, uzun süredir belgelenen/yaygın kullanılan SolidWorks API
        // deseni (ISldWorks.Frame() → IFrame.GetHWnd()) — bu ortamda (SDK
        // yok) CANLI test EDİLEMEDİ, ama RenameComponent2/Save3 sürecindeki
        // AYNI dürüstlük ilkesiyle: try/catch içine alınmış, başarısızlığı
        // SESSİZCE yutuyor (yalnızca log'a yazıyor) ve akışı ENGELLEMİYOR —
        // yanlışsa gerçek derleme/çalıştırma geri bildirimiyle düzeltilir.
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        private void SolidWorksPenceresiniOnePlanaGetir()
        {
            try
            {
                if (_app == null) return;
                _app.Visible = true;
                var cerceve = _app.Frame() as IFrame;
                IntPtr hwnd = cerceve != null ? (IntPtr)cerceve.GetHWnd() : IntPtr.Zero;
                if (hwnd != IntPtr.Zero) SetForegroundWindow(hwnd);
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("SolidWorksPenceresiniOnePlanaGetir HATA: " + ex);
            }
        }

        // ADIM 2 — global buton (altPanel): ŞU AN SolidWorks'te AÇIK olan
        // (kullanıcının elle düzenlediği) çizimi hem .dwg hem .pdf olarak
        // kaydeder (çizim İÇERİĞİNE dokunmaz, TeknikResimOnaylaCalistir'deki
        // AYNI mantık) ve ADIM 1'de işaretlenen kalemin ÜretimOS kartına
        // yükler. Çizim BİLEREK kapatılmaz (elle akışla AYNI davranış —
        // kullanıcı isterse tekrar düzenleyip tekrar onaylayabilir).
        private async System.Threading.Tasks.Task TeknikResimOnaylaVeYukleCalistir()
        {
            if (_bekleyenTeknikResim == null)
            {
                MessageBox.Show("Önce bir satırda '📐 Teknik Resim Oluştur'a basıp çizimi hazırlayın.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (_istemci == null)
            {
                MessageBox.Show("ÜretimOS bağlantısı yok — teknik resim yüklenemez.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            var (tip, kart, modelYolu, beklenenCizim) = _bekleyenTeknikResim.Value;
            string refId = (string)kart["id"];
            string kod = (string)(kart["kod"] ?? kart["stokKodu"]);
            string ad = (string)kart["ad"];

            var cizimBelge = _app.ActiveDoc as IModelDoc2;
            if (cizimBelge == null || cizimBelge.GetType() != (int)swDocumentTypes_e.swDocDRAWING)
            {
                MessageBox.Show(
                    "Onaylamak için önce '📐 Teknik Resim Oluştur' ile açtığınız ÇİZİM (.slddrw) belgesini aktif hale getirin.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // GERÇEK BULGU (bkz. _bekleyenTeknikResim tanımındaki NOT):
            // "Onayla" YALNIZCA o an SolidWorks'te odaklanmış (ActiveDoc)
            // çizimi kullanırdı — bu, '📐 Oluştur'un işaretlediği kartla
            // AYNI çizim OLMAYABİLİR (ör. arada başka bir satırda ikinci bir
            // çizim daha açıldıysa). Yanlış çizimi YANLIŞ karta SESSİZCE
            // yüklemek yerine, aktif çizimin GERÇEKTEN bu kart için
            // oluşturulan çizim olduğu (COM nesne kimliği) doğrulanır.
            if (beklenenCizim != null && !ReferenceEquals(cizimBelge, beklenenCizim))
            {
                MessageBox.Show(
                    $"Şu an SolidWorks'te AKTİF olan çizim, '{kod}' için oluşturduğunuz çizim DEĞİL — " +
                    "büyük ihtimalle araya başka bir satırda '📐 Teknik Resim Oluştur' ile ikinci bir çizim açtınız.\n\n" +
                    $"Lütfen '{kod} — {ad}' için oluşturduğunuz çizim penceresini SolidWorks'te aktif hale " +
                    "getirip (pencereler arasından seçip) tekrar 'Onayla'ya basın — böylece yanlış karta " +
                    "yükleme YAPILMAZ.",
                    "ÜretimOS — Çizim/Kart Uyuşmuyor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // Kullanıcı isteği: "hepsi çizim dosyasının uzantılı klasöründe
            // oluşsun ancak daha önceden bağlantılı çizim varsa o
            // oluşturulduğu klasörde kalabilir. daha önceden oluşturulan
            // klasörleri otomatik getir." — varsayılan klasör: bu model
            // için DAHA ÖNCE onaylanmış bir DWG varsa (Manifest.cs) O
            // KLASÖR, yoksa modelin (SLDPRT/SLDASM) kendi klasörü. Kullanıcı
            // "otomatik getirilen" bu klasörle açılan diyalogda isterse
            // değiştirebilir/onaylayabilir.
            var mevcutManifest = Manifest.Bul(modelYolu);
            string varsayilanKlasor = null;
            string manifestKlasoru = mevcutManifest?.DwgYolu != null ? Path.GetDirectoryName(mevcutManifest.DwgYolu) : null;
            if (!string.IsNullOrEmpty(manifestKlasoru) && Directory.Exists(manifestKlasoru))
                varsayilanKlasor = manifestKlasoru;
            else
            {
                string modelKlasoru = Path.GetDirectoryName(modelYolu);
                if (!string.IsNullOrEmpty(modelKlasoru) && Directory.Exists(modelKlasoru))
                    varsayilanKlasor = modelKlasoru;
            }

            // Kullanıcı isteği: "dosyayı kaydederken bu isimle dosya
            // oluşsun" — "📎 Teknik Resim" diyaloğundaki AYNI "{kod} — {ad}"
            // biçimi (ör. "54.001.400.051.00 — KAVELA PLASTİK 8mm SİYAH").
            string dosyaAdOnEki = !string.IsNullOrWhiteSpace(kod) && !string.IsNullOrWhiteSpace(ad) ? $"{kod} — {ad}" : (kod ?? ad ?? "teknik_resim");
            foreach (char c in Path.GetInvalidFileNameChars()) dosyaAdOnEki = dosyaAdOnEki.Replace(c, '_');

            string dwgHedefYolu;
            using (var kaydetDialog = new SaveFileDialog
            {
                Title = "Teknik Resmi Kaydet (DWG) — PDF de aynı klasöre aynı adla kaydedilecek",
                Filter = "DWG dosyası|*.dwg",
                FileName = dosyaAdOnEki + ".dwg",
                InitialDirectory = varsayilanKlasor ?? ""
            })
            {
                if (kaydetDialog.ShowDialog(this) != DialogResult.OK) return;
                dwgHedefYolu = kaydetDialog.FileName;
            }

            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Çizim kaydediliyor…";

            var resimUretici = new TeknikResimOlusturucu(_app);
            bool kaydedildi = resimUretici.AcikCizimiKaydet(cizimBelge, dwgHedefYolu,
                out string kaydedilenDwg, out string kaydedilenPdf, out string kaydedilenJpg);
            if (!kaydedildi)
            {
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Teknik resim kaydedilemedi.";
                MessageBox.Show("DWG/PDF kaydedilemedi.\n\n" + string.Join("\n", resimUretici.Uyarilar), "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            // SwAddin.cs'teki elle "2) Onayla" akışıyla AYNI manifest kaydı —
            // böylece bu model için sonradan '📎 Teknik Resim' butonuna
            // basılırsa ("Daha önce onaylanmış teknik resmi yükle") aynı
            // dosyalar önerilir.
            Manifest.Kaydet(modelYolu, kaydedilenDwg, kaydedilenPdf, kaydedilenJpg);

            int basariliSayisi = 0;
            var hatalar = new List<string>();
            foreach (var dosyaYolu in new[] { kaydedilenDwg, kaydedilenPdf })
            {
                if (dosyaYolu == null) continue;
                try
                {
                    byte[] icerik = DosyaBaytlariniPaylasimliOku(dosyaYolu);
                    var (yuklendi, hata) = await _istemci.DosyaYukle(tip, refId, Path.GetFileName(dosyaYolu), icerik, kod, ad);
                    if (yuklendi) basariliSayisi++;
                    else hatalar.Add($"{Path.GetFileName(dosyaYolu)}: {hata}");
                }
                catch (Exception ex)
                {
                    Tanilama.Kaydet("TeknikResimOnaylaVeYukleCalistir (yükleme) HATA: " + ex);
                    hatalar.Add($"{Path.GetFileName(dosyaYolu)}: {ex.Message}");
                }
            }

            if (hatalar.Count == 0)
            {
                _bekleyenTeknikResim = null;
                if (_teknikResimOnaylaBtn != null) _teknikResimOnaylaBtn.Enabled = false;
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ '{kod}' için teknik resim onaylandı ve {basariliSayisi} dosya (DWG+PDF) ÜretimOS'a yüklendi.";
            }
            else
            {
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = $"Çizim kaydedildi ama {hatalar.Count} dosya ÜretimOS'a yüklenemedi — düzeltip tekrar onaylayabilirsiniz.";
                MessageBox.Show("Çizim kaydedildi ama bazı dosyalar ÜretimOS'a yüklenemedi:\n\n" + string.Join("\n", hatalar), "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            if (resimUretici.Uyarilar.Count > 0)
                Tanilama.Kaydet("TeknikResimOnaylaVeYukleCalistir uyarilari: " + string.Join(" | ", resimUretici.Uyarilar));
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
            // Kullanıcı isteği: "kenar bantlarını da arayabileceğim bir arama
            // ekle" — eski AutoCompleteMode.SuggestAppend, ToString()'in
            // "[Kenar Bandı] " ön ekiyle BAŞLAMASI yüzünden kod/ada göre
            // yazarak aramayı ÇALIŞTIRMIYORDU (SuggestAppend yalnızca baştan
            // eşleşir). Bunun yerine her tuş vuruşunda kod/ad İÇİNDE arayıp
            // listeyi CANLI filtreleyen bir kutu kullanılıyor (KokKartSeciciAc
            // ile aynı "içeriyor" mantığı).
            void EkleKenarKutusu(string etiket, string ozelAlanAdi, Func<string> al, Action<string> yaz)
            {
                satir.Controls.Add(new Label { Text = etiket, AutoSize = true, Padding = new Padding(4, 6, 2, 0), ForeColor = Color.DarkSlateGray });
                // Kullanıcı isteği: "bant ararken okuyamıyorum, seçim
                // sütununu genişlet" — kapalıyken kutu dar kalsın (4'ü yan
                // yana sığsın) ama AÇILAN liste çok daha geniş olsun ki uzun
                // kod/ad metinleri kesilmesin.
                var kutu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown, Width = 170, DropDownWidth = 420, Margin = new Padding(3), AutoCompleteMode = AutoCompleteMode.None };

                void ListeyiDoldur(string arama)
                {
                    kutu.Items.Clear();
                    kutu.Items.Add("— Yok —");
                    string a = (arama ?? "").Trim().ToLowerInvariant();
                    foreach (var kb in kenarBandilari.Where(kb => string.IsNullOrEmpty(a) || (kb.Kod ?? "").ToLowerInvariant().Contains(a) || (kb.Ad ?? "").ToLowerInvariant().Contains(a)))
                        kutu.Items.Add(kb);
                }
                ListeyiDoldur(null);
                var mevcut = kenarBandilari.FirstOrDefault(kb => kb.Id == al());
                kutu.Text = mevcut?.ToString() ?? "— Yok —";

                // TextChanged, YALNIZCA yukarıdaki başlangıç ataması BİTTİKTEN
                // SONRA bağlanır — aksi halde ilk kutu.Text ataması listeyi
                // (kendi tam etiketiyle eşleşmediği için) BOŞ filtreler.
                kutu.TextChanged += (s, e) =>
                {
                    if (kutu.SelectedItem is PaletOgesi secili && secili.ToString() == kutu.Text) return;
                    if (kutu.Text == "— Yok —") return;
                    ListeyiDoldur(kutu.Text);
                    kutu.DroppedDown = true;
                    kutu.SelectionStart = kutu.Text.Length;
                };
                void Uygula()
                {
                    var secilen = kutu.SelectedItem as PaletOgesi ?? kenarBandilari.FirstOrDefault(kb => kb.ToString() == kutu.Text);
                    yaz(secilen?.Id);
                    // Kullanıcı isteği: "tüm yaptığım değişiklikleri aynen
                    // kaydettiğim gibi geri gelmesini sağla" — kenar bandı
                    // ataması KOD olarak (KesimListesiCikarici ile AYNI kural)
                    // SolidWorks dosyasının kendisine de yazılır ki 💾
                    // SolidWorks'e Kaydet ile diske işlenince kalıcı olsun.
                    if (dugum.Model != null)
                    {
                        try { KesimListesiCikarici.OzelAlanYaz(dugum.Model, ozelAlanAdi, secilen?.Kod ?? ""); }
                        catch (Exception ex) { Tanilama.Kaydet("Kenar bandi ozel alani yazilamadi HATA: " + ex); }
                    }
                }
                kutu.SelectedIndexChanged += (s, e) => Uygula();
                kutu.Leave += (s, e) => Uygula();
                satir.Controls.Add(kutu);
            }
            EkleKenarKutusu("Ön:", OzelAlanlar.KENAR_ON, () => dugum.KenarOnId, v => dugum.KenarOnId = v);
            EkleKenarKutusu("Arka:", OzelAlanlar.KENAR_ARKA, () => dugum.KenarArkaId, v => dugum.KenarArkaId = v);
            EkleKenarKutusu("Sol:", OzelAlanlar.KENAR_SOL, () => dugum.KenarSolId, v => dugum.KenarSolId = v);
            EkleKenarKutusu("Sağ:", OzelAlanlar.KENAR_SAG, () => dugum.KenarSagId, v => dugum.KenarSagId = v);

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

        // Seçilen bir palet öğesinden (mevcut ÜretimOS kartı), gerçek bir
        // SolidWorks bileşenine karşılık GELMEYEN sentetik bir alt düğüm
        // üretir — hem "+ Ek Kalem" dialogu hem de sol paletten doğrudan
        // sürükle-bırak (bkz. BilesenAnaSatiriOlustur'un DragDrop'u) AYNI
        // mantığı kullanır (kart bulunamazsa null döner).
        // ustDugum: bu sentetik kalemin EKLENDİĞİ üst düğüm — plaka için ölçü
        // kaynağı olarak kullanılır (aşağıdaki nota bakın). null olabilir
        // (ör. ileride kök seviyeye ekleme eklenirse) — bu durumda plaka
        // ölçüsü TAHMİN EDİLMEZ, 0 kalır.
        private BilesenDugumu BilesenSentetikCocukOlustur(PaletOgesi secilen, BilesenDugumu ustDugum)
        {
            var kart = FindKart(secilen.KalemTipi, secilen.Id);
            if (kart == null) return null;
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

            // Kullanıcı isteği: "solidworks bileşen ağacında alt kalem
            // ekleyince gelen boy en ve kalınlık ölçülerini otomatik olarak
            // parça ölçüsünden doldur." DÜZELTME (ekran görüntüsü ile bildirilen
            // yanlış aktarım): plaka için kartın KENDİ en/boy alanları STOK
            // LEVHA ölçüsüdür (ör. 3660×1830) — bir parçanın malzemesi olarak
            // eklenen plakaya bu ölçüyü yazmak YANLIŞ (parça 800×400 iken
            // "3660×1830" görünüyordu). Doğrusu: boy/en, bu plakadan kesilen
            // GERÇEK PARÇANIN (=ustDugum, SolidWorks'ten bbox/equations ile
            // zaten bilinen) kendi ölçüsüdür; kalınlık plakanın KENDİ malzeme
            // kalınlığıdır (kart boşsa/0 ise üst düğümün kalınlığına düşülür).
            // Yarımamül İÇİN bu sorun YOK: netEn/netBoy zaten O YARIMAMÜLE
            // özel gerçek ölçüdür (bir stok levha değil), kartın kendisinden
            // okunması doğru.
            double en = 0, boy = 0, kalinlik = 0;
            string kaynak = "karttan";
            if (sinif == "plaka")
            {
                boy = ustDugum?.TaslakBoyMm ?? 0;
                en = ustDugum?.TaslakEnMm ?? 0;
                kalinlik = (double?)kart["kalinlik"] ?? 0;
                if (kalinlik <= 0) kalinlik = ustDugum?.TaslakKalinlikMm ?? 0;
                kaynak = "ustdugumden";
            }
            else if (sinif == "yarimamul")
            {
                en = (double?)kart["netEn"] ?? 0; boy = (double?)kart["netBoy"] ?? 0; kalinlik = (double?)kart["kalinlik"] ?? 0;
            }
            if (en > 0 || boy > 0 || kalinlik > 0)
            {
                yeniDugum.BoyMm = boy; yeniDugum.EnMm = en; yeniDugum.KalinlikMm = kalinlik;
                yeniDugum.TaslakBoyMm = boy; yeniDugum.TaslakEnMm = en; yeniDugum.TaslakKalinlikMm = kalinlik;
                yeniDugum.OlcuVar = true; yeniDugum.OlcuKaynagi = kaynak;
            }
            return yeniDugum;
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
                    var yeniDugum = BilesenSentetikCocukOlustur(secilen, ustDugum);
                    if (yeniDugum == null) return;
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
                string kaynakEtiket = dugum.OlcuKaynagi == "equations" ? " eq" : dugum.OlcuKaynagi == "ozelalan" ? " oa" : dugum.OlcuKaynagi == "bbox" ? " bb" : dugum.OlcuKaynagi == "karttan" ? " kt" : dugum.OlcuKaynagi == "ustdugumden" ? " üd" : "";
                ekBilgi += $"  ({dugum.BoyMm.ToString("0.#", CultureInfo.InvariantCulture)}×{dugum.EnMm.ToString("0.#", CultureInfo.InvariantCulture)}×{dugum.KalinlikMm.ToString("0.#", CultureInfo.InvariantCulture)}mm{kaynakEtiket})";
            }

            // Montajda aynı tanımdan (aynı kod/dosya) birden çok kalem birleştirildiyse
            // (bkz. BilesenAgaci.AyniTanimliKardesleriBirlestir) burada "×N" gösterilir.
            string adetEtiketi = dugum.Miktar > 1 ? $"  ×{dugum.Miktar}" : "";

            if (string.IsNullOrWhiteSpace(dugum.MevcutKod)) return "— (eşleşmemiş)  " + dugum.GosterimAdi + ekBilgi + adetEtiketi;
            bool kartVar = KodileKartBul(dugum.MevcutKod).kart != null;
            return (kartVar ? "✓ " : "⚠ (kart bulunamadı) ") + dugum.MevcutKod + " — " + dugum.GosterimAdi + ekBilgi + adetEtiketi;
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

                // Kullanıcı isteği: "tekrar tekrar sınıf seçmem gerekiyor" —
                // bir düğüm ZATEN mevcut bir ÜretimOS kartıyla eşleşmişse, o
                // kart kendi yapısını ÜretimOS tarafında taşır; SolidWorks'teki
                // İÇ geometrisini (ör. bir MiniFix bağlantı takımının içindeki
                // vida/somun gibi münferit standart parçalar) HER aktarımda
                // yeniden sınıflandırmaya ZORLAMAK gereksiz ve tekrarlayıcıydı.
                // Eşleşmiş bir düğüm, ÇOCUKLARINDAN HİÇBİRİ kullanıcı tarafından
                // AYRICA ele alınmadıysa (sınıflandırılmadı/eşleştirilmedi) bir
                // "kara kutu" gibi ele alınır — alt kırılımı zorunlu DEĞİLDİR.
                // Kullanıcı en az bir çocuğu bilinçli olarak sınıflandırmışsa
                // (o alt kırılımla da ilgilenmek istediğinin işareti), eskisi
                // gibi TÜM çocuklar için sınıflandırma aranmaya devam eder.
                bool zatenEslesmis = !d.ElleEklendi && !string.IsNullOrWhiteSpace(d.MevcutKod) && KodileKartBul(d.MevcutKod).kart != null;
                bool altKirilimlaIlgileniliyor = d.Cocuklar.Any(c => !string.IsNullOrEmpty(c.Sinif) || !string.IsNullOrWhiteSpace(c.MevcutKod));
                if (zatenEslesmis && !altKirilimlaIlgileniliyor) return;

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
                // (bkz. EslesmeYazVeUygula'daki AYNI gerekçe). AnaPencerede:
                // bkz. tanımındaki NOT — bu "await" sonrası COM çağrı döngüsü
                // GERÇEKTE yanlış iş parçacığında çalışıp SolidWorks'ü çökertmişti.
                AnaPencerede(() =>
                {
                    foreach (var d in tumDugumler)
                    {
                        if (d.BelgeYuklenemedi || d.ElleEklendi || d.Model == null) continue;
                        if (!kartCozumleri.TryGetValue(d, out var cozum) || cozum.kart == null) continue;
                        string kod = (string)cozum.kart["kod"] ?? (string)cozum.kart["stokKodu"];
                        if (string.IsNullOrWhiteSpace(kod)) continue;
                        try { KesimListesiCikarici.OzelAlanYaz(d.Model, OzelAlanlar.KOD, kod); d.MevcutKod = kod; }
                        catch (Exception ex) { Tanilama.Kaydet("BilesenAgaciniReceteOlarakAktar (URETIMOS_KOD yazılamadı) HATA: " + ex); }
                    }
                });

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
                void ReceteKurEkle(string ustTip, JObject ustKart, List<BilesenDugumu> cocuklar)
                {
                    var recete = ReceteBul(ustTip, ustKart);
                    var kalemler = (JArray)recete["kalemler"];
                    bool receteDegisti = false;

                    var gruplar = cocuklar.Where(c => kartCozumleri.ContainsKey(c) && kartCozumleri[c].kart != null)
                        .GroupBy(c => kartCozumleri[c]);
                    foreach (var grup in gruplar)
                    {
                        var (cocukTip, cocukKart) = grup.Key;
                        var ilkCocuk = grup.First();
                        // grup.Count() değil grup.Sum(Miktar) — kardeşler
                        // SolidWorks tarafında ZATEN Miktar'a birleştirilmiş
                        // olabilir (bkz. BilesenAgaci.AyniTanimliKardesleriBirlestir);
                        // gerçek toplam tekrar sayısı ancak Miktar'ların toplamıdır.
                        int yeniMiktar = grup.Sum(c => c.Miktar);
                        JObject yeniOlcu = null, yeniKenarlar = null;
                        // "kenar bandını 4 kenardan hangisine hangi tip
                        // eklediğimizi de çıkartalım" — web'in kalemBaglami.
                        // kenarBantlari/olcu ile AYNI şekilde kaleme yazılır,
                        // ÜretimOS'un kendi Reçete Ağaç Editörü'nde de görünür.
                        if (ilkCocuk.Sinif == "plaka")
                        {
                            yeniOlcu = new JObject { ["netEn"] = ilkCocuk.TaslakEnMm, ["netBoy"] = ilkCocuk.TaslakBoyMm, ["kabaEn"] = ilkCocuk.TaslakEnMm, ["kabaBoy"] = ilkCocuk.TaslakBoyMm };
                            var kenarlar = new JObject();
                            if (!string.IsNullOrEmpty(ilkCocuk.KenarOnId)) kenarlar["on"] = ilkCocuk.KenarOnId;
                            if (!string.IsNullOrEmpty(ilkCocuk.KenarArkaId)) kenarlar["arka"] = ilkCocuk.KenarArkaId;
                            if (!string.IsNullOrEmpty(ilkCocuk.KenarSolId)) kenarlar["sol"] = ilkCocuk.KenarSolId;
                            if (!string.IsNullOrEmpty(ilkCocuk.KenarSagId)) kenarlar["sag"] = ilkCocuk.KenarSagId;
                            if (kenarlar.Count > 0) yeniKenarlar = kenarlar;
                        }

                        var mevcutKalem = kalemler.OfType<JObject>().FirstOrDefault(k => (string)k["tip"] == cocukTip && (string)k["refId"] == (string)cocukKart["id"]);
                        if (mevcutKalem != null)
                        {
                            // GERÇEK HATA (kullanıcı raporu: "üretimos reçetesi
                            // güncellenmedi"): burası ÖNCEDEN kalem zaten varsa
                            // TAMAMEN ATLIYORDU — bu yüzden kenar bandı/miktar
                            // gibi SONRADAN yapılan değişiklikler "Reçete Olarak
                            // Aktar" tekrar çalıştırılsa BİLE sunucuya HİÇ
                            // yansımıyordu. Artık miktar/ölçü/kenar bandı
                            // GÜNCELLENİR (yalnızca gerçekten değiştiyse).
                            if ((int?)mevcutKalem["miktar"] != yeniMiktar) { mevcutKalem["miktar"] = yeniMiktar; receteDegisti = true; }
                            if (!JToken.DeepEquals(mevcutKalem["olcu"], yeniOlcu)) { mevcutKalem["olcu"] = yeniOlcu; receteDegisti = true; }
                            var eskiKenarlar = mevcutKalem["kenarBantlari"];
                            if (!JToken.DeepEquals(eskiKenarlar, yeniKenarlar))
                            {
                                if (yeniKenarlar != null) mevcutKalem["kenarBantlari"] = yeniKenarlar;
                                else ((JObject)mevcutKalem).Remove("kenarBantlari");
                                receteDegisti = true;
                            }
                            continue;
                        }

                        var yeniKalem = new JObject
                        {
                            ["id"] = "RK-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                            ["tip"] = cocukTip,
                            ["refId"] = (string)cocukKart["id"],
                            ["miktar"] = yeniMiktar,
                            ["birim"] = "ADET"
                        };
                        if (yeniOlcu != null) yeniKalem["olcu"] = yeniOlcu;
                        if (yeniKenarlar != null) yeniKalem["kenarBantlari"] = yeniKenarlar;
                        kalemler.Add(yeniKalem);
                        receteDegisti = true;
                    }
                    if (receteDegisti && !etkilenenReceteler.Contains(recete)) etkilenenReceteler.Add(recete);
                }

                // NOT: _bilesenKokListesi artık (UrunKokuOlustur kurulduysa)
                // TEK bir sentetik "urun" düğümü (urunKoku) içeriyor, gerçek
                // üst düzey SolidWorks bileşenleri onun Cocuklar'ı — bu yüzden
                // urunKoku da tumDugumler'in İÇİNDE ve aşağıdaki döngü onun
                // reçetesini de (kendi Cocuklar'ından) AYNEN diğer düğümler
                // gibi kurar; kök kart için AYRI bir çağrıya gerek YOK (aksi
                // halde urunKarti kendi reçetesine kendini referans eden bir
                // kalem olarak eklenirdi).
                foreach (var d in tumDugumler)
                {
                    if (d.BelgeYuklenemedi) continue;
                    if (!kartCozumleri.TryGetValue(d, out var ustCozum) || ustCozum.kart == null || ustCozum.tip == "hammadde") continue;
                    if (d.Cocuklar.Count == 0) continue;
                    ReceteKurEkle(ustCozum.tip, ustCozum.kart, d.Cocuklar);
                }

                if (etkilenenReceteler.Count > 0)
                {
                    bool receteBasarili = await _istemci.ToplukaEkleGuncelle("receteler", etkilenenReceteler, new List<object>());
                    if (!receteBasarili) throw new Exception("Sunucu 'receteler' kaydını reddetti (HTTP hata).");
                    foreach (JObject r in etkilenenReceteler)
                        if (!_receteler.Contains(r)) _receteler.Add(r);
                }

                int yeniKartSayisi = yeniKartlar.Values.Sum(l => l.Count);
                Tanilama.Kaydet($"BilesenAgaciniReceteOlarakAktar: kart={yeniKartSayisi}, recete={etkilenenReceteler.Count}");
                AnaPencerede(() =>
                {
                    _durumEtiketi.ForeColor = Color.DarkGreen;
                    _durumEtiketi.Text = $"✓ Bileşen ağacı ÜretimOS'a aktarıldı — {yeniKartSayisi} yeni kart, {etkilenenReceteler.Count} reçete kaydedildi.";
                    BilesenAgaciniCiz();
                });
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BilesenAgaciniReceteOlarakAktar HATA: " + ex);
                // AnaPencerede: bu catch bloğu, "await" sonrası yanlış iş
                // parçacığında oluşan bir istisnayı yakalıyor OLABİLİR — o
                // durumda MessageBox.Show/Control özelliklerine dokunmak da
                // AYNI şekilde çökebilirdi (bkz. tanımındaki NOT).
                AnaPencerede(() =>
                {
                    MessageBox.Show("Aktarım sırasında hata: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    _durumEtiketi.ForeColor = Color.DarkRed;
                    _durumEtiketi.Text = "Aktarım başarısız: " + ex.Message;
                });
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
            foreach (Control eskiSatir in _agacGorunumu.Controls)
                eskiSatir.Dispose();
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

        // Verilen kartı (zaten YeniKartDialog'dan çıkmış JObject) ÜretimOS'a
        // kaydeder ve yerel koleksiyona/palete ekler — hem sol paletteki "+
        // Yeni Kart Oluştur…" hem de "Farklı Kart Seç…" ve bileşen ağacı
        // içindeki inline kart oluşturma akışları AYNI mantığı paylaşır
        // (kullanıcı isteği: "sol taraftan yeni kart oluşturmaya ek olarak
        // buradada kart oluşturalım").
        private async System.Threading.Tasks.Task<bool> KartApiyaKaydet(string kartTipi, JObject yeniKart)
        {
            string koleksiyonAnahtari =
                (kartTipi == "plaka" || kartTipi == "kenar_bandi" || kartTipi == "hirdavat" || kartTipi == "sarf") ? "hammaddeler"
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
                Tanilama.Kaydet("KartApiyaKaydet HATA: " + ex);
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
                return false;
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
            return true;
        }

        // Kullanıcı isteği: "tüm satırları düzenleyebileyim düzenle tuşuna
        // bastığımda seçtiğim (ürün kartı, yarımamül, alt montaj vb.)
        // düzenleme ekranı açılsın ... kodunu ismini ve diğer özelliklerini
        // değiştirebileyim" — KartApiyaKaydet'in TERSİ: kart zaten var,
        // sadece güncellenir (ekle listesi BOŞ, güncelle listesine kart
        // konur). 'kart' zaten yerel koleksiyonun İÇİNDEKİ nesnenin ta
        // kendisi (YeniKartDialog düzenleme modunda AYNI referansı
        // mutasyona uğratır) — bu yüzden yerel listeye TEKRAR eklenmez,
        // sadece palet tazelenir.
        private async System.Threading.Tasks.Task<bool> KartApiyaGuncelle(string kartTipi, JObject kart)
        {
            string koleksiyonAnahtari =
                (kartTipi == "plaka" || kartTipi == "kenar_bandi" || kartTipi == "hirdavat" || kartTipi == "sarf") ? "hammaddeler"
                : kartTipi == "yarimamul" ? "yarimamuller"
                : kartTipi == "altmontaj" ? "altMontajlar"
                : kartTipi == "urun" ? "urunler"
                : "paketler";

            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Kart güncelleniyor…";
            bool basarili;
            try
            {
                basarili = await _istemci.ToplukaEkleGuncelle(koleksiyonAnahtari, new List<object>(), new List<object> { kart });
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("KartApiyaGuncelle HATA: " + ex);
                basarili = false;
            }
            if (!basarili)
            {
                MessageBox.Show("Kart güncellenemedi (sunucu reddetti).", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "Kart güncellenemedi.";
                return false;
            }
            PaletiFiltrele();
            _durumEtiketi.ForeColor = Color.DarkGreen;
            _durumEtiketi.Text = $"✓ Kart güncellendi: {(string)kart["ad"]}";
            return true;
        }

        // "✎ Düzenle" — bileşen ağacındaki bir satırın eşleştiği kartı
        // (tipi ne olursa olsun: ürün/yarımamül/alt montaj/paket/hammadde)
        // YeniKartDialog'u DÜZENLEME modunda açarak kod/ad/diğer alanları
        // değiştirmeye izin verir. "özellikle yarımamül seçtiğim kalemlerde
        // direkt yarımamül düzenleme ekranı açılsın" — tip otomatik
        // KodileKartBul'dan çözülür, ayrıca bir seçim gerekmez.
        private async System.Threading.Tasks.Task BilesenKartDuzenle(BilesenDugumu dugum)
        {
            var (bulunanTip, bulunanKart) = KodileKartBul(dugum.MevcutKod);
            if (bulunanKart == null)
            {
                // Kullanıcı isteği: "sınıflandırılmış ama henüz eşleşmemiş"
                // satırlarda da bu buton çalışsın — burada YENİ kart
                // oluşturulup HEMEN bu düğümle eşleştirilir (Farklı Kart
                // Seç… → + Yeni Kart Oluştur… akışının kısayolu). Sinif
                // değerleri (hirdavat/plaka/kenar_bandi/sarf/yarimamul/
                // altmontaj/paket/urun) zaten YeniKartDialog/KartApiyaKaydet
                // ile birebir aynı sözlüğü kullanıyor.
                if (string.IsNullOrEmpty(dugum.Sinif))
                {
                    MessageBox.Show("Önce yukarıdaki 'Sınıf' açılır kutusundan bir sınıf seçin (Panel, Yarı Mamül, Hırdavat vb.) — kart buradan sonra oluşturulabilir.",
                        "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                await DugumeYeniKartOlusturVeEslestir(dugum);
                return;
            }
            // KodileKartBul hammadde ailesinde genel "hammadde" döner —
            // YeniKartDialog'un doğru form alanlarını açması için kartın
            // KENDİ 'tip' alanından (plaka/kenar_bandi/hirdavat/sarf) okunur.
            string kartTipi = bulunanTip == "hammadde" ? (string)bulunanKart["tip"] : bulunanTip;

            string eskiAd = (string)bulunanKart["ad"];

            JObject guncellenmisKart;
            using (var dlg = new YeniKartDialog(kartTipi, _hammaddeler, null, bulunanKart))
            {
                if (dlg.ShowDialog(this) != DialogResult.OK || dlg.SonucKart == null) return;
                guncellenmisKart = dlg.SonucKart;
            }
            if (!await KartApiyaGuncelle(kartTipi, guncellenmisKart)) return;

            // AnaPencerede: bkz. tanımındaki NOT — bu "await" sonrası kod
            // (COM çağrısı + kontrol oluşturma) GERÇEKTE yanlış iş parçacığında
            // çalışıp SolidWorks'ü çökertmişti.
            AnaPencerede(() =>
            {
                // Kod değişmiş olabilir — düğümün taslak bilgisini VE (gerçek
                // bir SolidWorks bileşeniyse) dosyanın kendi özel alanını da
                // güncelleyip kalıcı kılıyoruz (EslesmeYazVeUygula'daki AYNI
                // gerekçe).
                string yeniKod = (string)(guncellenmisKart["kod"] ?? guncellenmisKart["stokKodu"]);
                string yeniAd = (string)guncellenmisKart["ad"];
                dugum.MevcutKod = yeniKod;
                dugum.GosterimAdi = yeniAd ?? dugum.GosterimAdi;
                if (dugum.Model != null && !string.IsNullOrWhiteSpace(yeniKod))
                {
                    try { KesimListesiCikarici.OzelAlanYaz(dugum.Model, OzelAlanlar.KOD, yeniKod); }
                    catch (Exception ex) { Tanilama.Kaydet("BilesenKartDuzenle (URETIMOS_KOD yazılamadı) HATA: " + ex); }
                }

                // Kullanıcı isteği: "burada yaptığım ürün ismi değişiklikleri
                // solidworksteki part ve assembly component isimlerinide
                // değiştirsin" — ad gerçekten değiştiyse VE bu gerçek bir
                // SolidWorks bileşenine karşılık geliyorsa (sentetik "+ Ek
                // Kalem"/ürün/paket düğümlerinde dugum.Bilesen hep null'dur),
                // bileşenin FeatureManager ağacındaki adı da eşitlenir.
                if (dugum.Bilesen != null && !string.IsNullOrWhiteSpace(yeniAd) && !string.Equals(eskiAd, yeniAd, StringComparison.Ordinal))
                {
                    SolidWorksBilesenAdiniDegistir(dugum, yeniAd);
                }

                BilesenAgaciniCiz();
            });
        }

        // "sınıflandırılmış ama henüz eşleşmemiş" bir düğüm için YENİ kart
        // oluşturup HEMEN bu düğümle eşleştirir. BilesenKartDuzenle'nin
        // eski "kart yok" dalından ÇIKARILDI ki DugumEslestirmeSeciciAc'in
        // "+ Yeni Kart Oluştur" seçeneği de AYNI kodu (kopyalamadan) kullansın.
        private async System.Threading.Tasks.Task<bool> DugumeYeniKartOlusturVeEslestir(BilesenDugumu dugum)
        {
            if (string.IsNullOrEmpty(dugum.Sinif)) return false;
            string yeniKartTipi = dugum.Sinif;
            JObject yeniKart;
            using (var dlg = new YeniKartDialog(yeniKartTipi, _hammaddeler, dugum.GosterimAdi))
            {
                if (dlg.ShowDialog(this) != DialogResult.OK || dlg.SonucKart == null) return false;
                yeniKart = dlg.SonucKart;
            }
            if (!await KartApiyaKaydet(yeniKartTipi, yeniKart)) return false;

            // AnaPencerede: bkz. tanımındaki NOT — bu "await" sonrası kod
            // (COM çağrısı + kontrol oluşturma) GERÇEKTE yanlış iş parçacığında
            // çalışıp SolidWorks'ü çökertmişti.
            AnaPencerede(() =>
            {
                string yeniOlusanKod = (string)(yeniKart["kod"] ?? yeniKart["stokKodu"]);
                dugum.MevcutKod = yeniOlusanKod;
                dugum.GosterimAdi = (string)yeniKart["ad"] ?? dugum.GosterimAdi;
                if (dugum.Model != null && !string.IsNullOrWhiteSpace(yeniOlusanKod))
                {
                    try { KesimListesiCikarici.OzelAlanYaz(dugum.Model, OzelAlanlar.KOD, yeniOlusanKod); }
                    catch (Exception ex) { Tanilama.Kaydet("DugumeYeniKartOlusturVeEslestir (URETIMOS_KOD yazılamadı) HATA: " + ex); }
                }
                BilesenAgaciniCiz();
            });
            return true;
        }

        // Sınıfa göre "mevcut kartlardan seç" listesinin kaynağı —
        // KokKartSeciciAc'in Doldur()'ündeki AYNI eşleme, yalnızca dış
        // görünüm etiketi yerine iç sınıf değerine göre anahtarlanmış.
        private List<PaletOgesi> SinifKaynakListesi(string sinif)
        {
            IEnumerable<PaletOgesi> kaynak =
                sinif == "urun" ? _urunler.Select(k => Ogeye(k, "urun", "Ürün"))
                : sinif == "yarimamul" ? _yarimamuller.Select(k => Ogeye(k, "yarimamul", "Yarı Mamül"))
                : sinif == "altmontaj" ? _altMontajlar.Select(k => Ogeye(k, "altmontaj", "Alt Montaj"))
                : sinif == "paket" ? _paketler.Select(k => Ogeye(k, "paket", "Paket"))
                : sinif == "plaka" ? _hammaddeler.Where(h => (string)h["tip"] == "plaka").Select(k => OgeyeHammadde(k, "Plaka"))
                : sinif == "kenar_bandi" ? _hammaddeler.Where(h => (string)h["tip"] == "kenar_bandi").Select(k => OgeyeHammadde(k, "Kenar Bandı"))
                : sinif == "sarf" ? _hammaddeler.Where(h => (string)h["tip"] == "sarf").Select(k => OgeyeHammadde(k, "Sarf Malzeme"))
                : sinif == "hirdavat" ? _hammaddeler.Where(h => (string)h["tip"] == "hirdavat").Select(k => OgeyeHammadde(k, "Hırdavat"))
                : Enumerable.Empty<PaletOgesi>();
            return kaynak.ToList();
        }

        // Bir düğümü, ÜretimOS'ta ZATEN VAR olan bir karttan arayıp seçerek
        // eşleştirir. KokKartSeciciAc'ten BİLEREK AYRI: o, PANELİN KÖK
        // kartını (_kokKart/_kokTip, "Kaydet" butonu, rota paneli) değiştirir
        // — burada yalnızca BU düğümün kendi eşleşmesi değişir, panelin geri
        // kalanı ETKİLENMEZ.
        private void DugumeMevcutKartSecVeEslestir(BilesenDugumu dugum, string tipEtiketi)
        {
            using (var secici = new Form { Text = "Mevcut " + tipEtiketi + " Kartından Seç", Width = 420, Height = 480, StartPosition = FormStartPosition.CenterParent })
            {
                var aramaKutu = new TextBox { Dock = DockStyle.Top };
                var liste = new ListBox { Dock = DockStyle.Fill };
                var tamamBtn = new Button { Text = "Seç", Dock = DockStyle.Bottom };

                var kaynakListe = SinifKaynakListesi(dugum.Sinif);
                void Doldur()
                {
                    string arama = (aramaKutu.Text ?? "").Trim().ToLowerInvariant();
                    var eslesenler = kaynakListe.Where(o => string.IsNullOrEmpty(arama)
                        || (o.Kod ?? "").ToLowerInvariant().Contains(arama) || (o.Ad ?? "").ToLowerInvariant().Contains(arama))
                        .OrderBy(o => o.Kod).Take(300).ToList();
                    liste.Items.Clear();
                    liste.Items.AddRange(eslesenler.ToArray());
                }
                aramaKutu.TextChanged += (s, e) => Doldur();

                void SeciliyiUygula()
                {
                    if (!(liste.SelectedItem is PaletOgesi secilen)) return;
                    dugum.MevcutKod = secilen.Kod;
                    dugum.GosterimAdi = secilen.Ad;
                    if (dugum.Model != null && !string.IsNullOrWhiteSpace(secilen.Kod))
                    {
                        try { KesimListesiCikarici.OzelAlanYaz(dugum.Model, OzelAlanlar.KOD, secilen.Kod); }
                        catch (Exception ex) { Tanilama.Kaydet("DugumeMevcutKartSecVeEslestir (URETIMOS_KOD yazılamadı) HATA: " + ex); }
                    }
                    BilesenAgaciniCiz();
                    secici.DialogResult = DialogResult.OK;
                }
                tamamBtn.Click += (s, e) => SeciliyiUygula();
                liste.DoubleClick += (s, e) => SeciliyiUygula();

                secici.Controls.Add(liste);
                secici.Controls.Add(tamamBtn);
                secici.Controls.Add(aramaKutu);
                Doldur();
                secici.ShowDialog(this);
            }
        }

        // Sınıf seçilir seçilmez (henüz eşleşmemiş bir düğümde) HEMEN sorulan
        // iki seçenekli küçük pencere: "+ Yeni Kart Oluştur" / "🔍 Mevcut
        // Karttan Seç" — kullanıcı isteği: "yarımamül seçtiğimde otomatik
        // ekle yada yarımamül seç sekmesi gelsin". Daha önce bu davranış
        // yalnızca hammadde ailesinde (KokKartSeciciAc üzerinden) vardı;
        // artık TÜM sınıflarda tutarlı çalışır.
        private async System.Threading.Tasks.Task DugumEslestirmeSeciciAc(BilesenDugumu dugum)
        {
            if (!SinifTipEtiketiTumu.TryGetValue(dugum.Sinif ?? "", out string tipEtiketi)) return;

            DialogResult secim;
            using (var secimDlg = new Form { Text = "ÜretimOS — " + tipEtiketi, Width = 380, Height = 190, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, MinimizeBox = false, MaximizeBox = false })
            {
                var bilgi = new Label
                {
                    Text = $"'{dugum.GosterimAdi}' henüz bir ÜretimOS kartıyla eşleştirilmemiş.\nNe yapmak istersiniz?",
                    Dock = DockStyle.Top, Height = 50, Padding = new Padding(12, 10, 12, 0)
                };
                var ortaPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(12, 4, 12, 4) };
                var olusturBtn = new Button { Text = "+ Yeni " + tipEtiketi + " Oluştur", Width = 330, Height = 34, Margin = new Padding(0, 4, 0, 4) };
                var secBtn = new Button { Text = "🔍 Mevcut " + tipEtiketi + " Kartından Seç", Width = 330, Height = 34, Margin = new Padding(0, 4, 0, 4) };
                var vazgecBtn = new Button { Text = "Sonra (Şimdilik Atla)", Dock = DockStyle.Bottom, Height = 30 };
                olusturBtn.Click += (s, e) => { secimDlg.DialogResult = DialogResult.Yes; };
                secBtn.Click += (s, e) => { secimDlg.DialogResult = DialogResult.No; };
                vazgecBtn.Click += (s, e) => { secimDlg.DialogResult = DialogResult.Cancel; };
                ortaPanel.Controls.Add(olusturBtn);
                ortaPanel.Controls.Add(secBtn);

                secimDlg.Controls.Add(ortaPanel);
                secimDlg.Controls.Add(vazgecBtn);
                secimDlg.Controls.Add(bilgi);
                secim = secimDlg.ShowDialog(this);
            }

            if (secim == DialogResult.Yes) await DugumeYeniKartOlusturVeEslestir(dugum);
            else if (secim == DialogResult.No) DugumeMevcutKartSecVeEslestir(dugum, tipEtiketi);
        }

        // GERÇEK SolidWorks API: IAssemblyDoc::RenameComponent2(mevcutAd,
        // yeniAd) — bileşenin FeatureManager ağacındaki adını (ve SolidWorks'ün
        // kendi "Yeniden Adlandır" davranışıyla AYNI şekilde, bağlı dosyayı da)
        // değiştirir. Bu, bu makinede HENÜZ CANLI test edilmedi — derleme/
        // çalışma zamanı hatası çıkarsa TAHMİN EDİLMEDEN gerçek hataya göre
        // düzeltilecek (bkz. Tanilama günlüğü, EquationsOlcuOku'da olduğu gibi).
        private void SolidWorksBilesenAdiniDegistir(BilesenDugumu dugum, string yeniAd)
        {
            try
            {
                // AssemblyDoc.RenameComponent2 bu interop sürümünde YOK (CS1061);
                // IComponent2.Name2 ayarlanabilir (get/set) ve bileşen örneğini
                // yeniden adlandırır. İç içe bileşenlerde Name2 "Alt-1/Parca-1"
                // biçimindedir — yalnızca son parça (yaprak ad) değiştirilir.
                string mevcutTam = dugum.Bilesen.Name2;
                int bolme = mevcutTam.LastIndexOf('/');
                string onEk = bolme >= 0 ? mevcutTam.Substring(0, bolme + 1) : "";
                string mevcutAd = bolme >= 0 ? mevcutTam.Substring(bolme + 1) : mevcutTam;
                var gecersizler = Path.GetInvalidFileNameChars();
                string temizAd = new string(yeniAd.Select(c => gecersizler.Contains(c) ? '_' : c).ToArray()).Trim();
                if (string.IsNullOrEmpty(temizAd) || string.Equals(mevcutAd, temizAd, StringComparison.OrdinalIgnoreCase)) return;

                dugum.Bilesen.Name2 = temizAd;
                bool basarili = string.Equals(dugum.Bilesen.Name2, onEk + temizAd, StringComparison.OrdinalIgnoreCase);
                if (!basarili)
                {
                    Tanilama.Kaydet($"SolidWorksBilesenAdiniDegistir: Name2 ataması başarısız — '{mevcutAd}' -> '{temizAd}'");
                    _durumEtiketi.ForeColor = Color.DarkOrange;
                    _durumEtiketi.Text = "Kart güncellendi ama SolidWorks bileşen adı değiştirilemedi (isim çakışması olabilir — log'a bakın).";
                }
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("SolidWorksBilesenAdiniDegistir HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkOrange;
                _durumEtiketi.Text = "Kart güncellendi ama SolidWorks bileşen adı değiştirilirken hata oluştu (log'a bakın).";
            }
        }

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
                case "Sarf Malzeme": kartTipi = "sarf"; break;
                default: return;
            }

            JObject yeniKart;
            using (var dlg = new YeniKartDialog(kartTipi, _hammaddeler))
            {
                if (dlg.ShowDialog(this) != DialogResult.OK || dlg.SonucKart == null) return;
                yeniKart = dlg.SonucKart;
            }

            if (!await KartApiyaKaydet(kartTipi, yeniKart)) return;

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
                // Kullanıcı isteği: "seçilen yarımamül hammadde alt montaj
                // plaka ve kartlara yeni kart oluşturup burada etkinleştir ve
                // o oluşan karta göre uretimosa atalım ... sol taraftan yeni
                // kart oluşturmaya ek olarak buradada kart oluşturalım" —
                // mevcut kart bulunamayan bir bileşen için, palete gitmeden,
                // doğrudan bu ekrandan yeni kart oluşturulup HEMEN eşleştirilir.
                var yeniKartBtn = new Button { Text = "+ Yeni Kart Oluştur…", Dock = DockStyle.Bottom };

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
                void SeciliyiUygula()
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
                }
                tamamBtn.Click += (s, e) => SeciliyiUygula();
                // Kullanıcı isteği: "eklemeye basmanın yanında seçtiğim kaleme
                // çift tıklayınca da eklensin" — ListBox'ta çift tık, "Seç"
                // butonuna basmakla AYNI işlemi tetikler.
                liste.DoubleClick += (s, e) => SeciliyiUygula();

                yeniKartBtn.Click += async (s, e) =>
                {
                    string tipEtiket = tipKutu.SelectedItem as string ?? "Paket";
                    string kartTipi = tipEtiket == "Ürün" ? "urun"
                        : tipEtiket == "Yarı Mamül" ? "yarimamul"
                        : tipEtiket == "Alt Montaj" ? "altmontaj"
                        : tipEtiket == "Paket" ? "paket"
                        : tipEtiket == "Plaka" ? "plaka"
                        : tipEtiket == "Kenar Bandı" ? "kenar_bandi"
                        : tipEtiket == "Sarf Malzeme" ? "sarf"
                        : "hirdavat";

                    JObject yeniKart;
                    using (var kartDlg = new YeniKartDialog(kartTipi, _hammaddeler, (aramaKutu.Text ?? "").Trim()))
                    {
                        if (kartDlg.ShowDialog(secici) != DialogResult.OK || kartDlg.SonucKart == null) return;
                        yeniKart = kartDlg.SonucKart;
                    }
                    if (!await KartApiyaKaydet(kartTipi, yeniKart)) return;

                    EslesmeYazVeUygula(kartTipi == "plaka" || kartTipi == "kenar_bandi" || kartTipi == "hirdavat" || kartTipi == "sarf" ? "hammadde" : kartTipi, yeniKart);
                    secici.DialogResult = DialogResult.OK;
                };

                secici.Controls.Add(liste);
                secici.Controls.Add(tamamBtn);
                secici.Controls.Add(yeniKartBtn);
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
        // Kullanıcı isteği: "rota ekranı çok küçük ve okunmuyor ayrıca her
        // yarımamül ve paket satırına eklensin" — (1) pencere büyütüldü ve
        // her kontrole nefes payı (Margin/Padding) verildi, (2) kartTipi
        // parametresi eklendi — önceden bu metot HER ZAMAN "yarimamuller"
        // koleksiyonuna yazıyordu; bir paket/alt montaj/ürün kartı için
        // çağrıldığında (bkz. AyarPaneliOlustur'un genel kullanımı) YANLIŞ
        // koleksiyona PATCH göndermiş olurdu — artık kartTipi'ye göre doğru
        // koleksiyon seçiliyor.
        private async System.Threading.Tasks.Task RotaSecVeyaOlusturDialogAc(string kartTipi, JObject kart)
        {
            string koleksiyon = kartTipi == "paket" ? "paketler" : kartTipi == "altmontaj" ? "altMontajlar" : kartTipi == "urun" ? "urunler" : "yarimamuller";
            // data.js'teki VARSAYILAN_AYARLAR.saatlikIscilikUcreti = 500 ile
            // AYNI varsayılan (bkz. VerileriYukleVeBaslat'taki _ayarlar notu).
            double dkUcreti = ((double?)_ayarlar?["saatlikIscilikUcreti"] ?? 500) / 60.0;
            using (var dlg = new Form { Text = "Rota Seç / Oluştur — " + kart["kod"], Width = 520, Height = 480, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false, Font = new Font(Control.DefaultFont.FontFamily, 10f) })
            {
                var icPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
                var mevcutRotaId = (string)kart["rotaId"];
                var kutu = new ComboBox { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList, Height = 30, Margin = new Padding(0, 0, 0, 12) };
                var rotaListesi = _rotalar.OfType<JObject>().ToList();
                kutu.Items.Add("— Seçilmedi —");
                foreach (var r in rotaListesi) kutu.Items.Add($"{r["kod"]} — {r["ad"]}");
                int mevcutIndex = rotaListesi.FindIndex(r => (string)r["id"] == mevcutRotaId);
                kutu.SelectedIndex = mevcutIndex >= 0 ? mevcutIndex + 1 : 0;

                var secBtn = new Button { Text = "Bu Rotayı Ata", Dock = DockStyle.Top, Height = 34, Margin = new Padding(0, 0, 0, 10) };
                // Kullanıcı isteği: "son yaptığın rota oluşturma ekranı
                // üretimos.com.tr'ye bağlanıyor, bu ekranı indirelim ve
                // burada yeni rotaları oluşturalım ve üretimosa buradan push
                // edelim, hat ve makina galerisini süre ekleme ekranını
                // aynen buraya kopyala, üretimos.com.tr'ye bağlanmaya gerek
                // kalmasın" — RotaEditoru.cs artık page_rota.js'in hat/
                // makine/süre/maliyet mantığını BİREBİR SolidWorks içinde
                // (tarayıcıya geçmeden) çalıştırır; bkz. RotaEditoruAcVeKaydet.
                var duzenleBtn = new Button { Text = "✎ Seçili Rotanın Hat/Makine/Süre Adımlarını Düzenle…", Dock = DockStyle.Top, Height = 34, Margin = new Padding(0, 0, 0, 16) };
                var ayirici = new Label { Text = "— veya yeni bir rota oluştur —", Dock = DockStyle.Top, TextAlign = ContentAlignment.MiddleCenter, Height = 28, ForeColor = Color.DarkSlateGray };
                var yeniKodEtiket = new Label { Text = "Yeni rota kodu:", Dock = DockStyle.Top, Height = 22, Padding = new Padding(0, 6, 0, 0) };
                var yeniKodKutu = new TextBox { Dock = DockStyle.Top, Height = 28, Margin = new Padding(0, 0, 0, 10) };
                var yeniAdEtiket = new Label { Text = "Yeni rota adı:", Dock = DockStyle.Top, Height = 22, Padding = new Padding(0, 6, 0, 0) };
                var yeniAdKutu = new TextBox { Dock = DockStyle.Top, Height = 28, Margin = new Padding(0, 0, 0, 14) };
                var yeniOlusturBtn = new Button { Text = "+ Yeni Rota Oluştur (Hat/Makine/Süre Girerek)", Dock = DockStyle.Top, Height = 34 };

                bool degisti = false;

                // RotaEditoruDialog'u açar; "rota" parametresinde "id" varsa
                // (mevcut bir rota düzenleniyor) sunucuya 'guncelle', yoksa
                // (yeni rota, id BİLEREK boş bırakılır — editör kendisi
                // üretir) 'ekle' olarak PATCH edilir. Kullanıcı hat/istasyon
                // galerisine yeni bir makine eklediyse "hatlar" anahtarı da
                // ayrıca Kaydet() ile sunucuya yazılır.
                async System.Threading.Tasks.Task<JObject> RotaEditoruAcVeKaydet(JObject rota)
                {
                    bool yeniMi = string.IsNullOrEmpty((string)rota?["id"]);
                    using (var editor = new RotaEditoruDialog(rota, _hatlar, dkUcreti))
                    {
                        if (editor.ShowDialog(dlg) != DialogResult.OK) return null;
                        var sonuc = editor.SonucRota;
                        try
                        {
                            if (yeniMi)
                                await _istemci.ToplukaEkleGuncelle("rotalar", new List<object> { sonuc }, new List<object>());
                            else
                                await _istemci.ToplukaEkleGuncelle("rotalar", new List<object>(), new List<object> { sonuc });
                            if (editor.HatlarDegisti)
                            {
                                _hatlar = editor.GuncelHatlar;
                                await _istemci.Kaydet("hatlar", _hatlar);
                            }
                            return sonuc;
                        }
                        catch (Exception ex)
                        {
                            MessageBox.Show("Rota kaydedilemedi: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                            return null;
                        }
                    }
                }

                secBtn.Click += async (s, e) =>
                {
                    string secilenId = kutu.SelectedIndex > 0 ? (string)rotaListesi[kutu.SelectedIndex - 1]["id"] : null;
                    kart["rotaId"] = secilenId;
                    try
                    {
                        await _istemci.ToplukaEkleGuncelle(koleksiyon, new List<object>(), new List<object> { kart });
                        degisti = true;
                        dlg.DialogResult = DialogResult.OK;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Kaydedilemedi: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                };
                duzenleBtn.Click += async (s, e) =>
                {
                    if (kutu.SelectedIndex <= 0)
                    {
                        MessageBox.Show("Önce üstteki listeden bir rota seçin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }
                    var hedefRota = rotaListesi[kutu.SelectedIndex - 1];
                    var guncellenen = await RotaEditoruAcVeKaydet(hedefRota);
                    if (guncellenen == null) return;
                    var eskiKayit = _rotalar.FirstOrDefault(r => (string)r["id"] == (string)guncellenen["id"]);
                    if (eskiKayit != null) _rotalar[_rotalar.IndexOf(eskiKayit)] = guncellenen;
                    degisti = true;
                    dlg.DialogResult = DialogResult.OK;
                };
                yeniOlusturBtn.Click += async (s, e) =>
                {
                    string kod = yeniKodKutu.Text.Trim(), ad = yeniAdKutu.Text.Trim();
                    if (string.IsNullOrEmpty(kod) || string.IsNullOrEmpty(ad))
                    {
                        MessageBox.Show("Kod ve ad zorunlu.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    var taslak = new JObject { ["kod"] = kod, ["ad"] = ad, ["steps"] = new JArray() };
                    var yeniRota = await RotaEditoruAcVeKaydet(taslak);
                    if (yeniRota == null) return;
                    kart["rotaId"] = (string)yeniRota["id"];
                    try
                    {
                        await _istemci.ToplukaEkleGuncelle(koleksiyon, new List<object>(), new List<object> { kart });
                        _rotalar.Add(yeniRota);
                        degisti = true;
                        dlg.DialogResult = DialogResult.OK;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Kart güncellenemedi: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                };

                icPanel.Controls.Add(yeniOlusturBtn);
                icPanel.Controls.Add(yeniAdKutu);
                icPanel.Controls.Add(yeniAdEtiket);
                icPanel.Controls.Add(yeniKodKutu);
                icPanel.Controls.Add(yeniKodEtiket);
                icPanel.Controls.Add(ayirici);
                icPanel.Controls.Add(duzenleBtn);
                icPanel.Controls.Add(secBtn);
                icPanel.Controls.Add(kutu);
                dlg.Controls.Add(icPanel);
                dlg.ShowDialog(this);
                if (degisti) _durumEtiketi.Text = "✓ Rota güncellendi: " + kart["kod"];
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
                var uygulaBtn = new Button { Text = "Uygula (Taslağa)", AutoSize = true, Font = KalinFont };
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
            // BilesenAgaciniCiz'deki AYNI gerçek kök neden/düzeltme (bkz. o
            // fonksiyondaki NOT): Controls.Clear() eski kontrolleri Dispose
            // ETMEDEN koleksiyondan çıkarır — büyük bir reçete ağacında her
            // düzenleme (miktar/rota/kenar bandı) TÜM alt ağacı yeniden
            // çizdiği için tanıtıcılar (HWND/GDI) hızla sızardı.
            foreach (Control eskiSatir in _agacGorunumu.Controls)
                eskiSatir.Dispose();
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
                Text = "[" + tipGosterim + "]", AutoSize = true, Font = KalinFont,
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

            // Kullanıcı isteği: "teknik resim ekle sekmeleri ekle her satıra
            // ve bağlantılı ürünün teknik resmini oluşturup kaydedelim
            // sekmeye basınca", sonra netleştirme: "çizimi önce ben
            // düzenleyeyim ve kontrol edeyim sonra onaylanıp kaydedilsin" —
            // reçete ağacındaki HER satırda (paket/yarımamül/altmontaj/
            // ürün/hammadde FARK ETMEZ) görünür; bu ADIM 1'dir (çizimi
            // oluşturup SolidWorks'te AÇIK bırakır) — ADIM 2 (kaydet+yükle)
            // alttaki global "✓ Teknik Resmi Onayla ve ÜretimOS'a Yükle"
            // butonuyla yapılır (bkz. TeknikResimOlusturDialogAc/
            // TeknikResimOnaylaVeYukleCalistir).
            if (kart != null)
            {
                var teknikResimOlusturBtn = new Button { Text = "📐 Teknik Resim Oluştur", AutoSize = true, Margin = new Padding(3) };
                teknikResimOlusturBtn.Click += async (s, e) => await TeknikResimOlusturDialogAc(tip, kart);
                satir.Controls.Add(teknikResimOlusturBtn);
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
            yeniRotaBtn.Click += async (s, e) => { await RotaSecVeyaOlusturDialogAc(tip, kart); AgaciYenidenCiz(); };
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
        private async System.Threading.Tasks.Task ReceteyiXmlOlarakDisaAktar()
        {
            if (_kokKart == null)
            {
                MessageBox.Show("Önce üstten bir kart seçin ('Farklı Kart Seç…').", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var recete = ReceteGetir(_kokTip, _kokKart);

            // Kullanıcı isteği: "tüm yüklenen plaka ve bantları, teknik
            // resimleri ve teknik resimlerin yüklendiği dosya konumlarını
            // xml olarak ... uretimos xml'ine işle" — XML kurulmadan ÖNCE,
            // ağaçtaki HER kalem (ve kök kart) için ÜretimOS'un KENDİ Teknik
            // Dosyalar deposundan (TeknikDosyaYukleDialogAc'ın kullandığı
            // AYNI uç) GÜNCEL dosya listesi TOPLU çekilir — TAHMİN/yerel
            // önbellek DEĞİL, dışa aktarma anındaki gerçek sunucu verisi.
            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "Teknik dosya bilgileri sunucudan toplanıyor…";
            var teknikDosyaHaritasi = await TeknikDosyaHaritasiTopla(recete, _kokTip, _kokKart);

            var kokEleman = new System.Xml.Linq.XElement("Recete",
                new System.Xml.Linq.XAttribute("kokTip", _kokTip),
                new System.Xml.Linq.XAttribute("kokId", (string)_kokKart["id"] ?? ""),
                new System.Xml.Linq.XAttribute("kokKod", (string)_kokKart["kod"] ?? (string)_kokKart["stokKodu"] ?? ""),
                new System.Xml.Linq.XAttribute("kokAd", (string)_kokKart["ad"] ?? ""),
                new System.Xml.Linq.XAttribute("disaAktarmaTarihi", DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss")));

            var kokTeknikEl = TeknikDosyalarElemaniOlustur(_kokTip, (string)_kokKart["id"], teknikDosyaHaritasi, GercekBilesenDugumuBulKartId(_kokTip, (string)_kokKart["id"])?.Model);
            if (kokTeknikEl != null) kokEleman.Add(kokTeknikEl);

            if (recete != null)
            {
                var kalemler = recete["kalemler"] as JArray ?? new JArray();
                foreach (var kalem in kalemler.OfType<JObject>())
                    kokEleman.Add(KalemElemaniOlustur(kalem, 0, teknikDosyaHaritasi));
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

        // Reçete ağacını (kök + tüm alt kırılım) baştan tek tek dolaşıp,
        // her benzersiz kalem için ÜretimOS'un Teknik Dosyalar deposundan
        // dosya listesini TOPLU çeker — KalemElemaniOlustur'un kendisi
        // (özyinelemeli, senkron çalışması gereken) her adımda ayrı ayrı
        // "await" YAPMASIN diye bu ön-toplama AYRI bir adımdır.
        private async System.Threading.Tasks.Task<Dictionary<string, JArray>> TeknikDosyaHaritasiTopla(JObject kokRecete, string kokTip, JObject kokKart)
        {
            var harita = new Dictionary<string, JArray>();
            if (_istemci == null) return harita;

            var toplanan = new List<(string tip, string refId, string kod, string ad)>();
            if (kokKart != null)
                toplanan.Add((kokTip, (string)kokKart["id"], (string)(kokKart["kod"] ?? kokKart["stokKodu"]), (string)kokKart["ad"]));

            void Topla(JObject recete)
            {
                if (recete == null) return;
                var kalemler = recete["kalemler"] as JArray ?? new JArray();
                foreach (var k in kalemler.OfType<JObject>())
                {
                    string tip = (string)k["tip"], refId = (string)k["refId"];
                    var kart = FindKart(tip == "hammadde" ? "hammadde" : tip, refId);
                    if (kart == null) continue;
                    toplanan.Add((tip, refId, (string)(kart["kod"] ?? kart["stokKodu"]), (string)kart["ad"]));
                    if (tip != "hammadde") Topla(ReceteGetir(tip, kart));
                }
            }
            Topla(kokRecete);

            foreach (var (tip, refId, kod, ad) in toplanan.Distinct())
            {
                string anahtar = tip + "|" + refId;
                if (harita.ContainsKey(anahtar)) continue;
                try { harita[anahtar] = await _istemci.TeknikDosyalariGetir(tip, refId, kod, ad); }
                catch (Exception ex)
                {
                    Tanilama.Kaydet("TeknikDosyaHaritasiTopla HATA (" + anahtar + "): " + ex);
                    harita[anahtar] = new JArray();
                }
            }
            return harita;
        }

        // Bir kalemin/bileşenin "TeknikDosyalar" XML bölümünü kurar: sunucudaki
        // dosya listesi (ad/uzantı/boyut/tarih/yükleyen) VE — varsa — bu model
        // için daha önce onaylanmış teknik resmin YEREL DİSK KONUMU (Manifest.cs
        // — kullanıcı isteği: "teknik resimlerin yüklendiği dosya konumlarını
        // da xml'e işle"). Hiçbir bilgi yoksa null döner (boş eleman eklenmez).
        private System.Xml.Linq.XElement TeknikDosyalarElemaniOlustur(string tip, string refId, Dictionary<string, JArray> teknikDosyaHaritasi, ModelDoc2 modelAramaIcin)
        {
            var el = new System.Xml.Linq.XElement("TeknikDosyalar");
            if (teknikDosyaHaritasi != null && teknikDosyaHaritasi.TryGetValue(tip + "|" + refId, out var dosyalar))
            {
                foreach (var d in dosyalar.OfType<JObject>())
                {
                    el.Add(new System.Xml.Linq.XElement("Dosya",
                        new System.Xml.Linq.XAttribute("ad", (string)d["ad"] ?? ""),
                        new System.Xml.Linq.XAttribute("uzanti", (string)d["uzanti"] ?? ""),
                        new System.Xml.Linq.XAttribute("boyutBayt", d["boyut"]?.ToString() ?? ""),
                        new System.Xml.Linq.XAttribute("tarih", (string)d["tarih"] ?? ""),
                        new System.Xml.Linq.XAttribute("yukleyen", (string)d["yukleyen"] ?? "")));
                }
            }
            if (modelAramaIcin != null)
            {
                try
                {
                    var girdi = Manifest.Bul(modelAramaIcin.GetPathName());
                    if (girdi != null)
                    {
                        el.Add(new System.Xml.Linq.XElement("YerelOnayliDosyaKonumu",
                            new System.Xml.Linq.XAttribute("dwgYolu", girdi.DwgYolu ?? ""),
                            new System.Xml.Linq.XAttribute("pdfYolu", girdi.PdfYolu ?? ""),
                            new System.Xml.Linq.XAttribute("jpgYolu", girdi.JpgYolu ?? ""),
                            new System.Xml.Linq.XAttribute("onayZamani", girdi.OnayZamani.ToString("yyyy-MM-ddTHH:mm:ss"))));
                    }
                }
                catch (Exception ex) { Tanilama.Kaydet("TeknikDosyalarElemaniOlustur Manifest HATA: " + ex); }
            }
            return el.HasElements ? el : null;
        }

        private System.Xml.Linq.XElement KalemElemaniOlustur(JObject kalem, int derinlik, Dictionary<string, JArray> teknikDosyaHaritasi)
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

            // Kullanıcı isteği: "xml dosyasına eklediğim plaka ve hangi
            // kenarda hangi bant olduğu bilgisi girdiğim en boy yükseklik
            // ağırlık bilgileri rota bilgileri vb. bilgilerde gelsin yani
            // xmlde bütün girdiğim bilgiler gelsin" — kartın KENDİ ölçü/
            // ağırlık/rota alanları (panelde görülen değerlerin gerçek
            // kaynağı) buraya eklenir.
            string Sayi(JToken deger) => deger != null ? ((double?)deger)?.ToString(CultureInfo.InvariantCulture) ?? "" : "";
            if (kart != null)
            {
                if (tip == "yarimamul")
                {
                    eleman.Add(new System.Xml.Linq.XElement("Olcu",
                        new System.Xml.Linq.XAttribute("netBoy", Sayi(kart["netBoy"])),
                        new System.Xml.Linq.XAttribute("netEn", Sayi(kart["netEn"])),
                        new System.Xml.Linq.XAttribute("kalinlik", Sayi(kart["kalinlik"])),
                        new System.Xml.Linq.XAttribute("kabaBoy", Sayi(kart["kabaBoy"])),
                        new System.Xml.Linq.XAttribute("kabaEn", Sayi(kart["kabaEn"]))));
                }
                else if (tip == "paket" || tip == "urun")
                {
                    eleman.Add(new System.Xml.Linq.XElement("OlcuAgirlik",
                        new System.Xml.Linq.XAttribute("en", Sayi(kart["en"])),
                        new System.Xml.Linq.XAttribute("boy", Sayi(kart["boy"])),
                        new System.Xml.Linq.XAttribute("yukseklik", Sayi(kart["yukseklik"])),
                        new System.Xml.Linq.XAttribute("netAgirlik", Sayi(kart["netAgirlik"])),
                        new System.Xml.Linq.XAttribute("brutAgirlik", Sayi(kart["brutAgirlik"]))));
                }
                else if (tip == "hammadde" && (string)kart["tip"] == "plaka")
                {
                    // Plakanın KENDİ stok ölçüsü (ör. 1830x3660) — kalemin
                    // KesimOlcusu'ndan (aşağıda) FARKLI: bu tam levha ölçüsü.
                    eleman.Add(new System.Xml.Linq.XElement("StokOlcusu",
                        new System.Xml.Linq.XAttribute("en", Sayi(kart["en"])),
                        new System.Xml.Linq.XAttribute("boy", Sayi(kart["boy"])),
                        new System.Xml.Linq.XAttribute("kalinlik", Sayi(kart["kalinlik"]))));
                }

                if (tip == "yarimamul" || tip == "altmontaj" || tip == "paket" || tip == "urun")
                {
                    string rotaId = (string)kart["rotaId"];
                    var rota = string.IsNullOrEmpty(rotaId) ? null : _rotalar.OfType<JObject>().FirstOrDefault(r => (string)r["id"] == rotaId);
                    if (rota != null)
                    {
                        eleman.Add(new System.Xml.Linq.XElement("Rota",
                            new System.Xml.Linq.XAttribute("kod", (string)rota["kod"] ?? ""),
                            new System.Xml.Linq.XAttribute("ad", (string)rota["ad"] ?? "")));
                    }
                }
            }

            // Kalemin KENDİ kesim ölçüsü/kenar bandı ataması — SolidWorks
            // bileşen ağacından toplu aktarımda panel çocukları için
            // yazılır (bkz. BilesenAgaciniReceteOlarakAktar'ın olcu/
            // kenarBantlari alanları).
            // Kullanıcı isteği: "xmldeki banta çekilen kısmına göre ön arka
            // için net boy +30mm, sağ ve sol için net en+30mm olarak
            // hesapla (30mm başlangıç ve sondaki fire) panel m2 si ile
            // birlikte xml'e ekle" — bant uzunluğu VE panel m²'si burada
            // hesaplanıp XML'e eklenir (sunucudaki veri değişmez, sadece
            // dışa aktarma anında hesaplanır).
            const double FIRE_PAYI_MM = 30;
            JObject kalemOlcuObj = kalem["olcu"] as JObject;
            double? kalemNetEn = kalemOlcuObj != null ? (double?)kalemOlcuObj["netEn"] : null;
            double? kalemNetBoy = kalemOlcuObj != null ? (double?)kalemOlcuObj["netBoy"] : null;
            if (kalemOlcuObj != null)
            {
                double? panelM2 = (kalemNetEn > 0 && kalemNetBoy > 0) ? kalemNetEn * kalemNetBoy / 1_000_000.0 : (double?)null;
                eleman.Add(new System.Xml.Linq.XElement("KesimOlcusu",
                    new System.Xml.Linq.XAttribute("netEn", Sayi(kalemOlcuObj["netEn"])),
                    new System.Xml.Linq.XAttribute("netBoy", Sayi(kalemOlcuObj["netBoy"])),
                    new System.Xml.Linq.XAttribute("kabaEn", Sayi(kalemOlcuObj["kabaEn"])),
                    new System.Xml.Linq.XAttribute("kabaBoy", Sayi(kalemOlcuObj["kabaBoy"])),
                    new System.Xml.Linq.XAttribute("panelM2", panelM2.HasValue ? panelM2.Value.ToString("0.####", CultureInfo.InvariantCulture) : "")));
            }
            if (kalem["kenarBantlari"] is JObject kenarlar)
            {
                var kenarEleman = new System.Xml.Linq.XElement("KenarBantlari");
                void KenarEkle(string yon, string bantId, double? uzunlukMm)
                {
                    if (string.IsNullOrEmpty(bantId)) return;
                    var bantKart = _hammaddeler?.OfType<JObject>().FirstOrDefault(h => (string)h["id"] == bantId);
                    var kenarBantEl = new System.Xml.Linq.XElement(yon,
                        new System.Xml.Linq.XAttribute("kod", bantKart != null ? (string)bantKart["stokKodu"] ?? "" : ""),
                        new System.Xml.Linq.XAttribute("ad", bantKart != null ? (string)bantKart["ad"] ?? "" : ""));
                    if (uzunlukMm.HasValue) kenarBantEl.Add(new System.Xml.Linq.XAttribute("uzunlukMm", uzunlukMm.Value.ToString(CultureInfo.InvariantCulture)));
                    kenarEleman.Add(kenarBantEl);
                }
                double? onArkaUzunluk = kalemNetBoy > 0 ? kalemNetBoy + FIRE_PAYI_MM : (double?)null;
                double? solSagUzunluk = kalemNetEn > 0 ? kalemNetEn + FIRE_PAYI_MM : (double?)null;
                KenarEkle("On", (string)kenarlar["on"], onArkaUzunluk);
                KenarEkle("Arka", (string)kenarlar["arka"], onArkaUzunluk);
                KenarEkle("Sol", (string)kenarlar["sol"], solSagUzunluk);
                KenarEkle("Sag", (string)kenarlar["sag"], solSagUzunluk);
                if (kenarEleman.HasElements) eleman.Add(kenarEleman);
            }

            var teknikEl = TeknikDosyalarElemaniOlustur(tip, refId, teknikDosyaHaritasi, GercekBilesenDugumuBulKartId(tip, refId)?.Model);
            if (teknikEl != null) eleman.Add(teknikEl);

            if (derinlik < MAKS_DERINLIK && tip != "hammadde" && kart != null)
            {
                var altRecete = ReceteGetir(tip, kart);
                if (altRecete != null)
                {
                    var altKalemler = altRecete["kalemler"] as JArray ?? new JArray();
                    foreach (var altKalem in altKalemler.OfType<JObject>())
                        eleman.Add(KalemElemaniOlustur(altKalem, derinlik + 1, teknikDosyaHaritasi));
                }
            }
            return eleman;
        }

        // Kullanıcı isteği: "solidworkste bileşen ağacı için ayrı xml
        // altta çıkan üretimos reçete ağacı için ayrı xml almak için ayrı
        // sekmeler oluştur" — bu, YUKARIDAKİ SolidWorks bileşen ağacının
        // (henüz ÜretimOS'a hiç aktarılmamış olsa BİLE — Sınıf, taslak
        // ölçü, kenar bandı ataması, dahil/hariç işareti dahil) kendi XML
        // çıktısıdır; ReceteyiXmlOlarakDisaAktar (aşağıda) ise sunucudaki
        // GERÇEK kaydedilmiş reçeteyi dışa aktarır — ikisi BİLEREK ayrı
        // butonlar/dosyalardır.
        private async System.Threading.Tasks.Task BilesenAgaciniXmlOlarakDisaAktar()
        {
            if (_bilesenKokListesi == null || _bilesenKokListesi.Count == 0)
            {
                MessageBox.Show("Dışa aktarılacak bir bileşen ağacı yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            // Kullanıcı isteği: "tüm yüklenen plaka ve bantları, teknik
            // resimleri ve teknik resimlerin yüklendiği dosya konumlarını
            // xml olarak hem solidworks xml'ine hem uretimos xml'ine işle" —
            // ağaçtaki HER eşleşmiş düğüm için ÜretimOS'un Teknik Dosyalar
            // deposundan (server) GÜNCEL dosya listesi TOPLU çekilir.
            var teknikDosyaHaritasi = new Dictionary<string, JArray>();
            if (_istemci != null)
            {
                _durumEtiketi.ForeColor = Color.DarkSlateGray;
                _durumEtiketi.Text = "Teknik dosya bilgileri sunucudan toplanıyor…";
                var toplanan = new List<(string tip, string refId, string kod, string ad)>();
                void Topla(List<BilesenDugumu> liste)
                {
                    foreach (var d in liste)
                    {
                        var (bulunanTip, bulunanKart) = KodileKartBul(d.MevcutKod);
                        if (bulunanKart != null)
                            toplanan.Add((bulunanTip, (string)bulunanKart["id"], (string)(bulunanKart["kod"] ?? bulunanKart["stokKodu"]), (string)bulunanKart["ad"]));
                        Topla(d.Cocuklar);
                    }
                }
                Topla(_bilesenKokListesi);
                foreach (var (tip, refId, kod, ad) in toplanan.Distinct())
                {
                    string anahtar = tip + "|" + refId;
                    if (teknikDosyaHaritasi.ContainsKey(anahtar)) continue;
                    try { teknikDosyaHaritasi[anahtar] = await _istemci.TeknikDosyalariGetir(tip, refId, kod, ad); }
                    catch (Exception ex)
                    {
                        Tanilama.Kaydet("BilesenAgaciniXmlOlarakDisaAktar (teknik dosya) HATA: " + ex);
                        teknikDosyaHaritasi[anahtar] = new JArray();
                    }
                }
            }

            System.Xml.Linq.XElement BilesenElemaniOlustur(BilesenDugumu d)
            {
                var el = new System.Xml.Linq.XElement("Bilesen",
                    new System.Xml.Linq.XAttribute("ad", d.GosterimAdi ?? ""),
                    new System.Xml.Linq.XAttribute("kod", d.MevcutKod ?? ""),
                    new System.Xml.Linq.XAttribute("sinif", d.Sinif ?? ""),
                    new System.Xml.Linq.XAttribute("elleEklendi", d.ElleEklendi),
                    new System.Xml.Linq.XAttribute("aktarimaDahil", d.AktarimaDahil),
                    new System.Xml.Linq.XAttribute("belgeYuklenemedi", d.BelgeYuklenemedi));

                if (!d.BelgeYuklenemedi && (d.Sinif == "yarimamul" || d.Sinif == "plaka"))
                {
                    // Kullanıcı isteği: "burdaki xml'de de bant ve panel
                    // m2'lerini hesapla ve xml'e ekle" — bileşen ağacı
                    // XML'i de reçete XML'iyle AYNI fire payı (30mm) ve
                    // panel m² mantığını kullanır (bkz. KalemElemaniOlustur).
                    const double FIRE_PAYI_MM = 30;
                    double? panelM2 = (d.TaslakEnMm > 0 && d.TaslakBoyMm > 0) ? d.TaslakEnMm * d.TaslakBoyMm / 1_000_000.0 : (double?)null;
                    el.Add(new System.Xml.Linq.XElement("Olcu",
                        new System.Xml.Linq.XAttribute("boy", d.TaslakBoyMm.ToString(CultureInfo.InvariantCulture)),
                        new System.Xml.Linq.XAttribute("en", d.TaslakEnMm.ToString(CultureInfo.InvariantCulture)),
                        new System.Xml.Linq.XAttribute("kalinlik", d.TaslakKalinlikMm.ToString(CultureInfo.InvariantCulture)),
                        new System.Xml.Linq.XAttribute("kaynak", d.OlcuKaynagi ?? ""),
                        new System.Xml.Linq.XAttribute("panelM2", panelM2.HasValue ? panelM2.Value.ToString("0.####", CultureInfo.InvariantCulture) : "")));

                    if (d.Sinif == "plaka")
                    {
                        var kenarEl = new System.Xml.Linq.XElement("KenarBantlari");
                        void KenarEkle(string yon, string bantId, double? uzunlukMm)
                        {
                            if (string.IsNullOrEmpty(bantId)) return;
                            var bant = _hammaddeler?.OfType<JObject>().FirstOrDefault(h => (string)h["id"] == bantId);
                            var kenarBantEl = new System.Xml.Linq.XElement(yon,
                                new System.Xml.Linq.XAttribute("kod", bant != null ? (string)bant["stokKodu"] ?? "" : ""),
                                new System.Xml.Linq.XAttribute("ad", bant != null ? (string)bant["ad"] ?? "" : ""));
                            if (uzunlukMm.HasValue) kenarBantEl.Add(new System.Xml.Linq.XAttribute("uzunlukMm", uzunlukMm.Value.ToString(CultureInfo.InvariantCulture)));
                            kenarEl.Add(kenarBantEl);
                        }
                        double? onArkaUzunluk = d.TaslakBoyMm > 0 ? d.TaslakBoyMm + FIRE_PAYI_MM : (double?)null;
                        double? solSagUzunluk = d.TaslakEnMm > 0 ? d.TaslakEnMm + FIRE_PAYI_MM : (double?)null;
                        KenarEkle("On", d.KenarOnId, onArkaUzunluk);
                        KenarEkle("Arka", d.KenarArkaId, onArkaUzunluk);
                        KenarEkle("Sol", d.KenarSolId, solSagUzunluk);
                        KenarEkle("Sag", d.KenarSagId, solSagUzunluk);
                        if (kenarEl.HasElements) el.Add(kenarEl);
                    }
                }

                var (bulunanTip, bulunanKart) = KodileKartBul(d.MevcutKod);
                if (bulunanKart != null)
                {
                    var teknikEl = TeknikDosyalarElemaniOlustur(bulunanTip, (string)bulunanKart["id"], teknikDosyaHaritasi, d.Model);
                    if (teknikEl != null) el.Add(teknikEl);
                }

                foreach (var c in d.Cocuklar) el.Add(BilesenElemaniOlustur(c));
                return el;
            }

            var kokEleman = new System.Xml.Linq.XElement("BilesenAgaci",
                new System.Xml.Linq.XAttribute("disaAktarmaTarihi", DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss")));
            foreach (var d in _bilesenKokListesi) kokEleman.Add(BilesenElemaniOlustur(d));

            using (var kaydetDialog = new SaveFileDialog { Filter = "XML dosyası|*.xml", FileName = "bilesen_agaci.xml" })
            {
                if (kaydetDialog.ShowDialog() != DialogResult.OK) return;
                try
                {
                    new System.Xml.Linq.XDocument(
                        new System.Xml.Linq.XDeclaration("1.0", "utf-8", "yes"),
                        kokEleman
                    ).Save(kaydetDialog.FileName);
                    _durumEtiketi.ForeColor = Color.DarkGreen;
                    _durumEtiketi.Text = "✓ Bileşen ağacı XML olarak dışa aktarıldı: " + kaydetDialog.FileName;
                }
                catch (Exception ex)
                {
                    Tanilama.Kaydet("BilesenAgaciniXmlOlarakDisaAktar HATA: " + ex);
                    MessageBox.Show("XML dosyası yazılamadı: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        // ── VERİYİ YEREL DOSYAYA İNDİR ─────────────────────────────────────
        // Kullanıcı isteği: "hammadde ve yarımamül bant plaka sarf ürün
        // kodlarını ve ürün ağacı reçetelerini indir diye bir tuş koy ve bu
        // tuşa basarak hammaddeleri komple indir ancak tüm ürün, yarımamül,
        // paket ve altmontaj kodlarını komple mi yoksa sadece bağlantılı
        // olanları mı indireceğini sor." Hammadde ailesi (plaka/kenar
        // bandı/sarf/hırdavat) zaten TEK bir koleksiyon (_hammaddeler) ve
        // panel açılırken HER ZAMAN komple çekiliyor — burada olduğu gibi
        // dışa yazılır. Ürün/yarımamül/paket/altmontaj İÇİN kapsam sorulur:
        // "komple" tüm kayıtları, "bağlantılı" ise yalnızca bu SolidWorks
        // dosyasındaki (kök kart + bileşen ağacında eşleşmiş) kartlardan
        // erişilebilen reçete ağacını (transitif kapanış) içerir.
        private async System.Threading.Tasks.Task MasterVeriyiYerelIndir()
        {
            if (_istemci == null)
            {
                MessageBox.Show("Önce ÜretimOS'a bağlanılması gerekiyor.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            // Kullanıcı isteği: "ben tekrar indir butonuna basarsam
            // indirilsin" — bu buton HER TIKLANDIĞINDA (oturum daha önce
            // yerel önbellekten açılmış, potansiyel olarak ESKİ veriyle
            // çalışıyor olsa BİLE) sunucudan TAZE veri çeker; bellekteki
            // kaydedilmemiş taslak değişiklikler varsa (henüz '✓ ÜretimOS'a
            // Kaydet'e basılmadıysa) bu taze veriyle EZİLEBİLİR (görünmez
            // hale gelebilir) — kullanıcı açıkça onaylamadan devam edilmez.
            if (_degisenReceteler.Count > 0 || _degisenKartlar.Count > 0)
            {
                var uyariSonuc = MessageBox.Show(
                    "Kaydedilmemiş değişiklikleriniz var.\n\n" +
                    "ÜretimOS'tan yeniden indirmek, henüz '✓ ÜretimOS'a Kaydet' ile kaydetmediğiniz " +
                    "değişikliklerin ekranda GÖRÜNMEZ hale gelmesine yol açabilir (sunucudaki veri asıl kaynak olur).\n\n" +
                    "Yine de devam etmek istiyor musunuz?",
                    "ÜretimOS", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (uyariSonuc != DialogResult.Yes) return;
            }

            string kapsam = KapsamSecimiSor();
            if (kapsam == null) return;

            _durumEtiketi.ForeColor = Color.DarkSlateGray;
            _durumEtiketi.Text = "⬇ ÜretimOS'tan güncel veri indiriliyor…";
            try
            {
                _urunler = JArray.Parse(await _istemci.Getir("urunler") ?? "[]");
                _yarimamuller = JArray.Parse(await _istemci.Getir("yarimamuller") ?? "[]");
                _altMontajlar = JArray.Parse(await _istemci.Getir("altMontajlar") ?? "[]");
                _paketler = JArray.Parse(await _istemci.Getir("paketler") ?? "[]");
                _hammaddeler = JArray.Parse(await _istemci.Getir("hammaddeler") ?? "[]");
                _receteler = JArray.Parse(await _istemci.Getir("receteler") ?? "[]");
                _rotalar = JArray.Parse(await _istemci.Getir("rotalar") ?? "[]");
                _hatlar = JObject.Parse(await _istemci.Getir("hatlar") ?? "{}");
                _ayarlar = JObject.Parse(await _istemci.Getir("ayarlar") ?? "{}");
                _verilerYuklendi = true;
                PaletiFiltrele();
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("MasterVeriyiYerelIndir (canlı çekme) HATA: " + ex);
                _durumEtiketi.ForeColor = Color.DarkRed;
                _durumEtiketi.Text = "ÜretimOS'a bağlanılamadı — indirme iptal edildi.";
                MessageBox.Show("ÜretimOS'tan veri çekilemedi: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            JArray urunlerDisa, yarimamullerDisa, paketlerDisa, altMontajlarDisa, receteleroDisa;
            if (kapsam == "komple")
            {
                urunlerDisa = _urunler;
                yarimamullerDisa = _yarimamuller;
                paketlerDisa = _paketler;
                altMontajlarDisa = _altMontajlar;
                receteleroDisa = _receteler;
            }
            else
            {
                var ziyaretEdilen = new HashSet<string>();
                var toplanan = new Dictionary<string, List<JObject>>();
                if (_kokKart != null) BaglantiliKartlariTopla(_kokTip, _kokKart, ziyaretEdilen, toplanan);
                void Gez(BilesenDugumu d)
                {
                    if (!string.IsNullOrEmpty(d.MevcutKod) && (d.Sinif == "urun" || d.Sinif == "yarimamul" || d.Sinif == "altmontaj" || d.Sinif == "paket"))
                    {
                        var (bulunanTip, bulunanKart) = KodileKartBul(d.MevcutKod);
                        if (bulunanKart != null) BaglantiliKartlariTopla(bulunanTip, bulunanKart, ziyaretEdilen, toplanan);
                    }
                    foreach (var c in d.Cocuklar) Gez(c);
                }
                if (_bilesenKokListesi != null)
                    foreach (var kok in _bilesenKokListesi) Gez(kok);

                List<JObject> Al(string tip) => toplanan.TryGetValue(tip, out var liste) ? liste : new List<JObject>();
                urunlerDisa = new JArray(Al("urun"));
                yarimamullerDisa = new JArray(Al("yarimamul"));
                paketlerDisa = new JArray(Al("paket"));
                altMontajlarDisa = new JArray(Al("altmontaj"));

                var receteSet = new List<JObject>();
                var receteIdGorulen = new HashSet<string>();
                foreach (var kv in toplanan)
                    foreach (var kart in kv.Value)
                    {
                        var r = ReceteGetir(kv.Key, kart);
                        if (r != null && receteIdGorulen.Add((string)r["id"]))
                            receteSet.Add(r);
                    }
                receteleroDisa = new JArray(receteSet);

                if (urunlerDisa.Count == 0 && yarimamullerDisa.Count == 0 && paketlerDisa.Count == 0 && altMontajlarDisa.Count == 0)
                {
                    MessageBox.Show(
                        "Bu SolidWorks dosyasında bağlantılı (eşleşmiş) hiçbir ürün/yarımamül/paket/alt montaj kartı bulunamadı.\n\n" +
                        "Önce bileşenleri sınıflandırıp bir ÜretimOS kartıyla eşleştirin, ya da 'TÜMÜNÜ İndir' seçeneğini kullanın.",
                        "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
            }

            // rotalar/hatlar/ayarlar HER ZAMAN komple dahil edilir (hammaddeler
            // ile AYNI gerekçe — küçük, ürün/yarımamül'e özel olmayan referans
            // veriler) ki bir sonraki açılışta TÜM başlangıç verisi (bkz.
            // YerelOnbellektenYukle) sunucuya hiç gitmeden bu dosyadan gelsin.
            var kokNesne = new JObject
            {
                ["indirmeTarihi"] = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss"),
                ["kapsam"] = kapsam,
                ["hammaddeler"] = _hammaddeler,
                ["urunler"] = urunlerDisa,
                ["yarimamuller"] = yarimamullerDisa,
                ["paketler"] = paketlerDisa,
                ["altMontajlar"] = altMontajlarDisa,
                ["receteler"] = receteleroDisa,
                ["rotalar"] = _rotalar,
                ["hatlar"] = _hatlar,
                ["ayarlar"] = _ayarlar
            };

            // Kullanıcı isteği: "indirdiğim dosyadan çalışsın" — SABİT, iyi
            // bilinen bir konuma yazılır (SaveFileDialog ile HER SEFERİNDE
            // farklı bir yer/isim seçilseydi bir sonraki açılış onu
            // OTOMATİK bulamazdı).
            try
            {
                string klasor = Path.GetDirectoryName(YerelVeriOnbellekYolu);
                Directory.CreateDirectory(klasor);
                File.WriteAllText(YerelVeriOnbellekYolu, kokNesne.ToString(Newtonsoft.Json.Formatting.Indented));
                _durumEtiketi.ForeColor = Color.DarkGreen;
                _durumEtiketi.Text = $"✓ Güncel veri indirildi ve yerel önbelleğe kaydedildi ({(kapsam == "komple" ? "komple" : "bağlantılı")}): {YerelVeriOnbellekYolu} — " +
                    $"{_hammaddeler.Count} hammadde, {urunlerDisa.Count} ürün, {yarimamullerDisa.Count} yarımamül, " +
                    $"{paketlerDisa.Count} paket, {altMontajlarDisa.Count} alt montaj, {receteleroDisa.Count} reçete. " +
                    "Bir sonraki açılışta ÜretimOS'a tekrar bağlanıp bu veriler indirilmeden bu dosyadan çalışılacak.";
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("MasterVeriyiYerelIndir (dosya yazma) HATA: " + ex);
                MessageBox.Show("Dosya yazılamadı: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // "Komple mi, bağlantılı mı?" seçimi — MessageBox'ın Yes/No/Cancel
        // buton metinleri özelleştirilemediği için ("hiçbir şey bilmeyen bir
        // insan" ilkesiyle net olsun diye) küçük özel bir diyalog kullanılır.
        private string KapsamSecimiSor()
        {
            string sonuc = null;
            using (var f = new Form { Text = "İndirme Kapsamı", Width = 540, Height = 300, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var etiket = new Label
                {
                    Text = "Hammadde/bant/plaka/sarf kodları HER ZAMAN komple indirilecek.\n\n" +
                           "Ürün, yarımamül, paket ve alt montaj kodları + reçeteleri için:",
                    Dock = DockStyle.Top, Height = 90, Padding = new Padding(16, 16, 16, 0)
                };
                var baglantiliBtn = new Button { Text = "Yalnızca Bu SolidWorks Dosyasına BAĞLANTILI Olanları İndir", Dock = DockStyle.Top, Height = 44, Margin = new Padding(16, 6, 16, 6) };
                var kompleBtn = new Button { Text = "TÜMÜNÜ (Komple Veritabanını) İndir", Dock = DockStyle.Top, Height = 44, Margin = new Padding(16, 6, 16, 6) };
                var vazgecBtn = new Button { Text = "Vazgeç", Dock = DockStyle.Bottom, Height = 34 };
                kompleBtn.Click += (s, e) => { sonuc = "komple"; f.DialogResult = DialogResult.OK; };
                baglantiliBtn.Click += (s, e) => { sonuc = "baglantili"; f.DialogResult = DialogResult.OK; };
                vazgecBtn.Click += (s, e) => f.DialogResult = DialogResult.Cancel;
                f.CancelButton = vazgecBtn;
                var icPanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(4) };
                icPanel.Controls.Add(kompleBtn);
                icPanel.Controls.Add(baglantiliBtn);
                f.Controls.Add(icPanel);
                f.Controls.Add(vazgecBtn);
                f.Controls.Add(etiket);
                f.ShowDialog(this);
            }
            return sonuc;
        }

        // "Bağlantılı" kapsamı için: verilen kart kökünden başlayıp KENDİ
        // reçetesindeki her ürün/yarımamül/paket/altmontaj referansını
        // (hammadde HARİÇ — o zaten her zaman komple dahil) özyinelemeli
        // olarak toplar. ziyaretEdilen seti döngüsel referanslara karşı
        // MAKS_DERINLIK'ten BAĞIMSIZ, kesin bir güvenlik sağlar (her kart
        // yalnızca bir kez ziyaret edilir).
        private void BaglantiliKartlariTopla(string tip, JObject kart, HashSet<string> ziyaretEdilen, Dictionary<string, List<JObject>> sonuc)
        {
            if (kart == null || string.IsNullOrEmpty(tip)) return;
            string anahtar = tip + "|" + (string)kart["id"];
            if (!ziyaretEdilen.Add(anahtar)) return;
            if (!sonuc.TryGetValue(tip, out var liste)) sonuc[tip] = liste = new List<JObject>();
            liste.Add(kart);

            var recete = ReceteGetir(tip, kart);
            if (recete == null) return;
            foreach (var kalem in ((JArray)recete["kalemler"])?.OfType<JObject>() ?? Enumerable.Empty<JObject>())
            {
                string altTip = (string)kalem["tip"];
                if (altTip == "hammadde") continue;
                var altKart = FindKart(altTip, (string)kalem["refId"]);
                if (altKart != null) BaglantiliKartlariTopla(altTip, altKart, ziyaretEdilen, sonuc);
            }
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

            // Kullanıcı isteği: "yarımamüle plaka çekerken sadece adet
            // çıkıyor ... plaka seçtiğimde uretimostaki gibi kaba en boy
            // net en boy hangi kenara hangi bantın çekileceğini
            // seçebileceğim ... ekranı ekle" — web'in "Kalem Ekle (Taslak)"
            // ekranıyla AYNI alanlar (page_recete_agac.js).
            var eklenenKart = FindKart(oge.KalemTipi, oge.Id);
            bool plakaMi = oge.KalemTipi == "hammadde" && eklenenKart != null && (string)eklenenKart["tip"] == "plaka";

            double miktar;
            JObject olcu = null, kenarBantlari = null;
            if (plakaMi)
            {
                var sonuc = PlakaMiktarOlcuKenarBandiSor((string)eklenenKart["birim"] ?? "M2");
                if (sonuc == null) return;
                (miktar, olcu, kenarBantlari) = sonuc.Value;
            }
            else
            {
                miktar = MiktarSor("Miktar (ADET)", 1);
                if (miktar <= 0) return;
            }

            var recete = ReceteBulVeyaOlustur(hedefTip, hedefKart);
            var yeniKalem = new JObject
            {
                ["id"] = "RK-" + Guid.NewGuid().ToString("N").Substring(0, 10).ToUpperInvariant(),
                ["tip"] = oge.KalemTipi,
                ["refId"] = oge.Id,
                ["miktar"] = miktar,
                ["birim"] = "ADET"
            };
            if (olcu != null) yeniKalem["olcu"] = olcu;
            if (kenarBantlari != null && kenarBantlari.Count > 0) yeniKalem["kenarBantlari"] = kenarBantlari;
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

        // Web'in "Kalem Ekle (Taslak)" → "Miktar Girin" ekranıyla AYNI alanlar
        // (page_recete_agac.js) — bir yarımamül/paket/alt montaj/ürün
        // reçetesine PLAKA eklenirken sadece miktar değil, kaba/net en-boy
        // ve 4 kenardan hangisine hangi kenar bandının çekileceği de
        // sorulur. İptal edilirse null döner.
        private (double miktar, JObject olcu, JObject kenarBantlari)? PlakaMiktarOlcuKenarBandiSor(string birim)
        {
            double sonucMiktar = 0;
            JObject sonucOlcu = null, sonucKenar = null;
            bool tamamlandi = false;

            // Kullanıcı isteği: "bant seçim satırını genişlet en az 3 katı
            // uzunlukta ve arama fonksiyonu ekle" — diyalog eskiden 420px
            // genişliğindeydi (kenar bandı kutuları ~230px kalıyordu);
            // şimdi kutular en az 3 katı geniş VE BilesenKenarBandiSatiriOlustur
            // ile AYNI canlı arama mantığını kullanıyor.
            using (var f = new Form { Text = "Miktar / Ölçü / Kenar Bandı", Width = 1050, Height = 560, FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false })
            {
                var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(14), AutoScroll = true };
                panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
                panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 75));
                void Satir(string etiket, Control kontrol)
                {
                    panel.RowCount++;
                    panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                    var lbl = new Label { Text = etiket, AutoSize = true, Anchor = AnchorStyles.Left, Padding = new Padding(0, 6, 0, 0) };
                    kontrol.Dock = DockStyle.Fill;
                    kontrol.Margin = new Padding(3, 3, 3, 8);
                    panel.Controls.Add(lbl);
                    panel.Controls.Add(kontrol);
                }

                var miktarKutu = new TextBox { Text = "1" };
                Satir("Miktar", miktarKutu);
                var birimKutu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
                birimKutu.Items.AddRange(new object[] { "ADET", "M2", "METRE" });
                birimKutu.SelectedItem = birimKutu.Items.Contains(birim) ? birim : "ADET";
                Satir("Birim", birimKutu);

                var kabaEnKutu = new TextBox();
                Satir("Kaba En (mm)", kabaEnKutu);
                var kabaBoyKutu = new TextBox();
                Satir("Kaba Boy (mm)", kabaBoyKutu);
                var netEnKutu = new TextBox();
                Satir("Net En (mm)", netEnKutu);
                var netBoyKutu = new TextBox();
                Satir("Net Boy (mm)", netBoyKutu);

                var kenarBandilari = _hammaddeler.Where(h => (string)h["tip"] == "kenar_bandi").Select(h => OgeyeHammadde(h, "Kenar Bandı")).ToList();
                // BilesenKenarBandiSatiriOlustur'daki EkleKenarKutusu ile AYNI
                // canlı arama mantığı — DropDownList yerine DropDown, her
                // tuş vuruşunda kod/ad içinde arayıp listeyi filtreler.
                ComboBox KenarKutusuOlustur()
                {
                    var kutu = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown, DropDownWidth = 620, AutoCompleteMode = AutoCompleteMode.None };
                    void ListeyiDoldur(string arama)
                    {
                        kutu.Items.Clear();
                        kutu.Items.Add("— Yok —");
                        string a = (arama ?? "").Trim().ToLowerInvariant();
                        foreach (var kb in kenarBandilari.Where(kb => string.IsNullOrEmpty(a) || (kb.Kod ?? "").ToLowerInvariant().Contains(a) || (kb.Ad ?? "").ToLowerInvariant().Contains(a)))
                            kutu.Items.Add(kb);
                    }
                    ListeyiDoldur(null);
                    kutu.Text = "— Yok —";
                    kutu.TextChanged += (s, e) =>
                    {
                        if (kutu.SelectedItem is PaletOgesi secili && secili.ToString() == kutu.Text) return;
                        if (kutu.Text == "— Yok —") return;
                        ListeyiDoldur(kutu.Text);
                        kutu.DroppedDown = true;
                        kutu.SelectionStart = kutu.Text.Length;
                    };
                    return kutu;
                }
                string KenarKutusuId(ComboBox kutu) => (kutu.SelectedItem as PaletOgesi ?? kenarBandilari.FirstOrDefault(kb => kb.ToString() == kutu.Text))?.Id;
                var onKutu = KenarKutusuOlustur();
                Satir("Ön (Net Boy)", onKutu);
                var arkaKutu = KenarKutusuOlustur();
                Satir("Arka (Net Boy)", arkaKutu);
                var sagKutu = KenarKutusuOlustur();
                Satir("Sağ (Net En)", sagKutu);
                var solKutu = KenarKutusuOlustur();
                Satir("Sol (Net En)", solKutu);

                var altPanel = new Panel { Dock = DockStyle.Bottom, Height = 44 };
                var tamamBtn = new Button { Text = "Taslağa Ekle", Dock = DockStyle.Right, Width = 120 };
                var iptalBtn = new Button { Text = "Vazgeç", Dock = DockStyle.Right, Width = 90 };
                altPanel.Controls.Add(tamamBtn);
                altPanel.Controls.Add(iptalBtn);
                f.CancelButton = iptalBtn;

                double ParseOpsiyonel(TextBox t) => double.TryParse((t.Text ?? "").Trim().Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out double v) ? v : 0;

                tamamBtn.Click += (s, e) =>
                {
                    if (!double.TryParse(miktarKutu.Text.Trim().Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out sonucMiktar) || sonucMiktar <= 0)
                    {
                        MessageBox.Show("Geçerli bir miktar girin.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    sonucOlcu = new JObject
                    {
                        ["kabaEn"] = ParseOpsiyonel(kabaEnKutu),
                        ["kabaBoy"] = ParseOpsiyonel(kabaBoyKutu),
                        ["netEn"] = ParseOpsiyonel(netEnKutu),
                        ["netBoy"] = ParseOpsiyonel(netBoyKutu)
                    };
                    sonucKenar = new JObject();
                    string onId = KenarKutusuId(onKutu); if (onId != null) sonucKenar["on"] = onId;
                    string arkaId = KenarKutusuId(arkaKutu); if (arkaId != null) sonucKenar["arka"] = arkaId;
                    string sagId = KenarKutusuId(sagKutu); if (sagId != null) sonucKenar["sag"] = sagId;
                    string solId = KenarKutusuId(solKutu); if (solId != null) sonucKenar["sol"] = solId;
                    tamamlandi = true;
                    f.DialogResult = DialogResult.OK;
                };
                iptalBtn.Click += (s, e) => f.DialogResult = DialogResult.Cancel;

                f.Controls.Add(panel);
                f.Controls.Add(altPanel);
                if (f.ShowDialog(this) != DialogResult.OK || !tamamlandi) return null;
            }
            return (sonucMiktar, sonucOlcu, sonucKenar);
        }

        // ── KAYDET (ÇOK KATMANLI — TÜM değişen reçeteler + paket ölçüleri TEK
        // seferde, ÜretimOS'un kendi reçete sistemine AYNI şekilde aktarılır) ─
        // "💾 SolidWorks'e Kaydet" — kullanıcı isteği: "buna basınca tüm
        // dosya isimleri ilgili reçete bağlantıları ve tüm çalışmalar
        // kaydedilsin dosyayı açtığımda artık hazırlanan üretimos reçetesi
        // gelsin." Bileşen ağacındaki (kök montaj dahil) HER BENZERSİZ
        // parça/montaj belgesi tek seferde diske kaydedilir — URETIMOS_KOD
        // yazma (EslesmeYazVeUygula/BilesenKartDuzenle/toplu aktarım) ve
        // bileşen adı değiştirme (SolidWorksBilesenAdiniDegistir) şimdiye
        // kadar sadece BELLEKTE duruyordu; dosya kaydedilmeden kapatılırsa
        // bu bilgiler kaybolur ve BilesenAgaci.Cikar bir sonraki açılışta
        // eşleşmeleri GÖREMEZ. GERÇEK SolidWorks API: IModelDoc2.Save3 — bu
        // makinede henüz canlı test edilmedi, başarısızlık sessizce
        // yutulmuyor (Tanilama günlüğü + durum etiketinde uyarı).
        private void TumBilesenleriSolidWorksKaydet()
        {
            if (_bilesenKokListesi == null || _bilesenKokListesi.Count == 0)
            {
                MessageBox.Show("Kaydedilecek bir bileşen ağacı yok.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var modeller = new List<ModelDoc2>();
            void Topla(List<BilesenDugumu> liste)
            {
                foreach (var d in liste)
                {
                    if (d.Model != null && !modeller.Contains(d.Model)) modeller.Add(d.Model);
                    Topla(d.Cocuklar);
                }
            }
            Topla(_bilesenKokListesi);
            if (_hedefModel != null && !modeller.Contains(_hedefModel)) modeller.Add(_hedefModel);

            if (modeller.Count == 0)
            {
                MessageBox.Show("Kaydedilecek yüklü bir SolidWorks belgesi bulunamadı.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (MessageBox.Show(
                $"{modeller.Count} SolidWorks dosyası (parça/montaj) kaydedilecek — buradaki reçete eşleşmeleri (kod) ve bileşen adı değişiklikleri kalıcı olacak.\n\nDevam edilsin mi?",
                "ÜretimOS", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

            // Alt parçalar/montajlar ÖNCE, kök montaj (_hedefModel) EN SON
            // kaydedilir — böylece kök, alttaki değişiklikleri (kod/isim)
            // zaten güncellenmiş halde referanslar.
            var siraliListe = modeller.Where(m => !ReferenceEquals(m, _hedefModel))
                .Concat(_hedefModel != null ? new[] { _hedefModel } : new ModelDoc2[0]);

            int basarili = 0, hatali = 0;
            foreach (var model in siraliListe)
            {
                try
                {
                    int hata = 0, uyari = 0;
                    bool sonuc = model.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref hata, ref uyari);
                    if (sonuc) basarili++;
                    else
                    {
                        hatali++;
                        Tanilama.Kaydet($"TumBilesenleriSolidWorksKaydet: kaydedilemedi '{model.GetPathName()}' hata={hata} uyari={uyari}");
                    }
                }
                catch (Exception ex)
                {
                    hatali++;
                    Tanilama.Kaydet($"TumBilesenleriSolidWorksKaydet HATA '{model?.GetPathName()}': " + ex);
                }
            }

            // KULLANICI RAPORU: "kapatıp açtığımda alt ek kalem ve pvc...
            // görünmüyordu" — kök neden KOD DEĞİL, YANLIŞ BEKLENTİ: bu buton
            // YALNIZCA SolidWorks dosyalarındaki özel alanları (kod/ad/sınıf/
            // kenar bandı — ama YALNIZCA gerçek bir SolidWorks bileşenine
            // karşılık gelen düğümlerde) diske yazar. "+ Ek Kalem" ile eklenen
            // sentetik kalemlerin (gerçek bir SolidWorks dosyası YOK, yazacak
            // yer yok) VE genel BOM/reçete yapısının ÜretimOS'ta kalıcı olması
            // için AYRI, BAĞIMSIZ bir adım olan "📤 Reçete Olarak ÜretimOS'a
            // Aktar" gerekir — bu buton onu YERİNE GEÇMEZ. Sessizce unutulmasın
            // diye başarı mesajına AÇIKÇA eklendi.
            _durumEtiketi.ForeColor = hatali == 0 ? Color.DarkGreen : Color.DarkOrange;
            _durumEtiketi.Text = (hatali == 0
                ? $"✓ {basarili} SolidWorks dosyası kaydedildi."
                : $"⚠ {basarili} dosya kaydedildi, {hatali} dosya kaydedilemedi — Masaüstündeki uretimos_addin_log.txt'ye bakın.")
                + " ÖNEMLİ: bu yalnızca SolidWorks dosyalarını kaydeder — \"+ Ek Kalem\" ile eklenenler ve genel BOM yapısının ÜretimOS'ta kalıcı olması için AYRICA \"📤 Reçete Olarak ÜretimOS'a Aktar\"a da basın.";
        }

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
