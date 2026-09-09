using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using SolidWorks.Interop.swpublished;
// SolidWorks.Interop.sldworks'ün KENDİ "Environment" tipiyle System.Environment
// çakışıyordu (CS0104) — gerçek denemede tespit edildi. Takma ad ile netleştirildi.
using Environment = System.Environment;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // ÜRETİMOS KESİM & TEKNİK RESİM EKLENTİSİ — SolidWorks COM Add-In iskeleti.
    //
    // KURULUM (özet — README.md'de ayrıntılı):
    //   1) Visual Studio'da bu projeyi .NET Framework 4.7.2+ Class Library
    //      olarak açın, SolidWorks.Interop.sldworks / .swconst / .swpublished
    //      referanslarını SolidWorks kurulumunuzun api\redist klasöründen ekleyin.
    //   2) Proje özelliklerinde "Register for COM Interop" işaretleyin (bu,
    //      RegisterFunction/UnregisterFunction'ın derleme sonrası otomatik
    //      çalışmasını sağlar — regasm'i elle çağırmanıza gerek kalmaz).
    //   3) Derleyin (Visual Studio'yu YÖNETİCİ olarak çalıştırmanız gerekir —
    //      COM kaydı HKEY_LOCAL_MACHINE'e yazar).
    //   4) SolidWorks'ü açın → Tools > Add-Ins → "ÜretimOS Kesim & Teknik Resim"
    //      işaretli görünmeli.
    //
    // GUID'İ KENDİNİZ ÜRETİN (Visual Studio > Tools > Create GUID) ve
    // aşağıdaki iki [Guid] özniteliğine de AYNISINI yazın — bu GUID, SolidWorks
    // kayıt defterinde eklentinizin kimliğidir, ASLA değiştirmeyin (değişirse
    // SolidWorks eklentiyi "yeni" sanır, ayarlar sıfırlanır).
    // ════════════════════════════════════════════════════════════════════════
    // NOT: sınıf BİLEREK "UretimOSAddin" olarak adlandırıldı, "SwAddin" DEĞİL —
    // gerçek derlemede tam bu isim çakışması bir hataya yol açtı: aşağıdaki
    // [SolidWorksTools.SwAddinAttribute(...)] özniteliği, sınıf da "SwAddin"
    // adında olsaydı KENDİ SINIFIMIZLA çakışıp "SwAddin bir öznitelik sınıfı
    // değildir" (CS0616) hatası veriyordu. Doğru sınıf Nesne Gezgini'nde
    // (Object Browser) doğrulandı: SolidWorksTools ad alanında,
    // System.Attribute'ten türeyen SwAddinAttribute — SolidWorks.Interop.
    // swpublished'daki "SwAddin" ise ayrı, ilgisiz bir ARAYÜZ (interface).
    // KESİN TANI #5: SolidWorks hata raporundaki çökme ADRESİ (sldappu:
    // 003bb971 / 45ABB971) her denemede BİREBİR AYNI kaldı — IconList,
    // MainIconList, bayrak kombinasyonu değiştirilmesine RAĞMEN. Bu, artık
    // KomutlariKur() içeriğinin sorun olmadığını, bunun yerine İLK (henüz
    // hiçbir düzeltme yapılmamış) çökmüş denemeden bu GUID+komut grubu
    // kimliğine ÖZEL kalan bozuk bir toolbar/UI önbellek kaydından
    // kaynaklandığını gösteriyor — GetGroupDataFromRegistry bizim dar
    // kapsamlı kontrolümüzdü, SolidWorks'ün asıl toolbar düzeni önbelleği
    // ayrı bir yerde (HKCU\...\User Interface\Custom API Toolbars\...)
    // tutuluyor ve hiç temizlemedik. En güvenli test: kayıt defterini elle
    // silmek (riskli, IT gerektirebilir) yerine TAMAMEN YENİ bir GUID +
    // yeni komut/grup ID'leri kullanmak — böylece eski bozuk kayıttan hiç
    // etkilenmeyen, sıfırdan temiz bir kimlikle test ediliyor.
    [Guid("A7F3C912-4B6E-4D81-9C2A-E5F108B3D7A6"), ComVisible(true)]
    [SolidWorksTools.SwAddinAttribute(
        Description = "ÜretimOS için kesim listesi ve teknik resim üretir; parça/paket kütüphanesini ÜretimOS ile senkronlar.",
        Title = "ÜretimOS Kesim & Teknik Resim",
        LoadAtStartup = true
    )]
    public class UretimOSAddin : ISwAddin
    {
        private ISldWorks _app;
        private int _cookie;
        private ICommandManager _cmdMgr;

        // ── SolidWorks YAŞAM DÖNGÜSÜ ─────────────────────────────────────────
        // GEÇMİŞ TANI: gerçek denemede SolidWorks'ün KENDİ native modülünde
        // (sldappu) tam çökme oluştu. KomutlariKur() önce tamamen devre dışı
        // bırakılıp eklentinin ÇÖKMEDEN yüklendiği kanıtlandı; ardından
        // CreateCommandGroup2/AddCommandItem2'nin imzaları Nesne Gezgini +
        // Go to Definition ile doğrulanıp koddaki parametrelerle TAM eşleştiği
        // görüldü (parametre sayısı/tipi hatası DEĞİL). Kalan tek şüpheli
        // nokta: hiç IconList atanmadan ImageListIndex=0/1 ile araç çubuğu
        // (HasToolbar=true) açmaya çalışmaktı — bu yüzden KomutlariKur() artık
        // ImageListIndex=-1 (ikon yok) ve HasToolbar=false (sadece menü) ile
        // GERİ etkinleştirildi. Araç çubuğu/ikonlar, gerçek bir ikon listesi
        // hazırlanınca ayrı bir adımda eklenecek.
        public bool ConnectToSW(object ThisSW, int Cookie)
        {
            Tanilama.Kaydet("=== ConnectToSW basladi ===");
            try
            {
                _app = (ISldWorks)ThisSW;
                _cookie = Cookie;
                _cmdMgr = _app.GetCommandManager(_cookie);
                Tanilama.Kaydet("GetCommandManager tamamlandi");

                // KESİN TANI #7: doğru SolidWorks (2) interop DLL'lerine
                // geçilmesine RAĞMEN çökme yine birebir aynı noktada
                // (Activate()) devam etti — bu da sürüm uyuşmazlığı
                // teorisini eledi. Kalan şüpheli nokta ÇAĞRI SIRASI:
                // SetAddinCallbackInfo2 önceden Activate()'TEN SONRA
                // çağrılıyordu. Resmi SolidWorks add-in şablonlarında bu
                // çağrı CommandManager/komut grubu kurulumundan ÖNCE yapılır
                // — mantık: Activate(), PaketOlusturCalistir gibi callback
                // metotlarını eklentiye geri bağlamaya çalışır; eklenti
                // SolidWorks'e "callback'lerim burada" diye kendini HENÜZ
                // tanıtmamışken bu bağlamayı yapmaya çalışmak çökmeye yol
                // açıyor olabilir. Sıra değiştirildi: şimdi ÖNCE.
                _app.SetAddinCallbackInfo2(0, this, _cookie);
                Tanilama.Kaydet("SetAddinCallbackInfo2 tamamlandi");

                KomutlariKur();

                Tanilama.Kaydet("=== ConnectToSW basariyla bitti ===");
                return true;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("=== ConnectToSW HATA (managed exception): " + ex + " ===");
                MessageBox.Show(
                    "ÜretimOS eklentisi yüklenirken hata oluştu:\n\n" + ex,
                    "ÜretimOS Kesim & Teknik Resim — Yükleme Hatası",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        public bool DisconnectFromSW()
        {
            if (_cmdMgr != null)
            {
                // CommandGroup ID, KomutlariKur() içindeki GRUP_ID ile AYNI olmalı.
                _cmdMgr.RemoveCommandGroup(100);
            }
            _cmdMgr = null;
            _app = null;
            GC.Collect();
            GC.WaitForPendingFinalizers();
            return true;
        }

        // ── ARAÇ ÇUBUĞU / KOMUTLAR ───────────────────────────────────────────
        // KESİN TANI #2 (kayıt defteri düzeltmesi de AYNI çökmeyi verdi):
        // kullanıcının paylaştığı gerçek SolidWorks SWERR günlüğü şunu
        // gösterdi: "Access Violation ... virtual address 0" (NULL POINTER
        // okuma) ve çağrı izi (<AD5>) tam olarak Activate()'e kadar gidiyordu.
        // Kök neden: ICommandGroup.IconList/MainIconList HİÇ ATANMAMIŞTI —
        // SolidWorks 2020+ sürümlerinde (bizimki 2025 SP3.0) bu artık
        // ZORUNLU; boş bırakılırsa Activate() null ikon dizisini okumaya
        // çalışıp tam bu şekilde çöküyor (resmi SolidWorks API "IconList
        // Property (ICommandGroup)" dokümanıyla doğrulandı — 20x20/32x32/
        // 40x40 piksel şerit görüntüleri gerektiriyor, her komut için
        // ImageListIndex o şeritteki kareyi seçiyor). Gerçek tasarlanmış
        // ikon dosyamız olmadığından basit renkli kareler PROGRAMLA
        // üretiliyor (bkz. IkonlariHazirla/SeritIkonUret) — estetik değil,
        // sadece SolidWorks'ün beklediği dizi dolu olsun diye.
        //
        // GÜVENLİK AĞI: bu düzeltme de yetmezse bir daha "arama oyunu"na
        // dönmemek için her adımdan önce/sonra diske log yazılıyor (Kaydet).
        // Çökme olursa Masaüstü\uretimos_addin_log.txt dosyasının SON
        // satırı, tam olarak hangi çağrının çökerttiğini gösterir.
        private void KomutlariKur()
        {
            Tanilama.Kaydet("KomutlariKur basladi");
            const int GRUP_ID = 100;
            const int ID_KESIM = 101;
            const int ID_ETIKET = 102;
            int[] komutIdleri = new int[] { ID_KESIM, ID_ETIKET };

            bool eskisiniYokSay = false;
            object kayitliIdler;
            Tanilama.Kaydet("GetGroupDataFromRegistry cagriliyor");
            bool kayitVarMi = _cmdMgr.GetGroupDataFromRegistry(GRUP_ID, out kayitliIdler);
            Tanilama.Kaydet("GetGroupDataFromRegistry tamamlandi, kayitVarMi=" + kayitVarMi);
            if (kayitVarMi)
            {
                eskisiniYokSay = !IdlerAyniMi((int[])kayitliIdler, komutIdleri);
            }

            int hataKodu = 0;
            Tanilama.Kaydet("CreateCommandGroup2 cagriliyor, eskisiniYokSay=" + eskisiniYokSay);
            ICommandGroup grup = _cmdMgr.CreateCommandGroup2(
                GRUP_ID, "ÜretimOS", "ÜretimOS kesim listesi ve teknik resim araçları",
                "", -1, eskisiniYokSay, ref hataKodu);
            Tanilama.Kaydet("CreateCommandGroup2 tamamlandi, hataKodu=" + hataKodu);

            Tanilama.Kaydet("IkonlariHazirla cagriliyor");
            string[] ikonlar = IkonlariHazirla();
            Tanilama.Kaydet("IkonlariHazirla tamamlandi: " + string.Join(" | ", ikonlar));

            Tanilama.Kaydet("IconList atanıyor");
            grup.IconList = ikonlar;
            Tanilama.Kaydet("IconList atandi");

            // KESİN TANI #3: log, çökmenin tam olarak Activate() içinde
            // olduğunu kanıtladı (IconList atandıktan, AddCommandItem2'ler
            // tamamlandıktan SONRA bile). GitHub'daki gerçek, çalışan bir
            // SolidWorks eklenti framework'ü (Weingartner/
            // SolidworksAddinFramework) incelendi: orada IconList/
            // LargeIconList'in YANINDA HER ZAMAN bir "ana ikon" (MainIcon/
            // MainIconList) de atanıyor. Resmi 2025 API dokümanı da
            // "MainIconList ve IconList sırası eşleşmeli" diyerek ikisinin
            // BİRLİKTE kullanılmasını ima ediyor. MainIconList hiç
            // atanmamıştı — Activate() muhtemelen CommandTab/ana ikon
            // temsilini oluştururken bunu okuyup null'a takılıyordu.
            Tanilama.Kaydet("MainIconList atanıyor");
            grup.MainIconList = ikonlar;
            Tanilama.Kaydet("MainIconList atandi");

            // KESİN TANI #4: log yine Activate()'te çöktüğünü gösterdi —
            // IconList VE MainIconList atanmış olmasına rağmen. GitHub'daki
            // aynı çalışan framework'ün AddCommandItem2 çağrıları incelendi:
            // orada menuToolbarOption HER ZAMAN "swToolbarItem | swMenuItem"
            // (İKİ bayrak BİRLİKTE) — HasToolbar ayarından BAĞIMSIZ. Bizim
            // kodda sadece swMenuItem vardı; HasToolbar=false yaptığımızda
            // ikinci bayrağı da kaldırmıştık — bu, "bu öğe hangi tipte"
            // bayrağıyla "şu an görünür mü" ayarını (HasToolbar) karıştırmak
            // olmuş. Aynı örnekte HasToolbar de hep true — o yüzden buraya
            // da geri alındı.
            int itemTipi = (int)swCommandItemType_e.swMenuItem | (int)swCommandItemType_e.swToolbarItem;

            Tanilama.Kaydet("1. AddCommandItem2 cagriliyor");
            grup.AddCommandItem2(
                "Kesim Listesi + Teknik Resim Paketi Oluştur", -1,
                "Etiketlenmiş parça/alt montajlardan ZIP paketi üretir (ÜretimOS SWOOD İçe Aktarım ekranına yüklenebilir)",
                "Kesim Paketi Oluştur", 0, "PaketOlusturCalistir", "PaketOlusturEtkinMi",
                ID_KESIM, itemTipi);
            Tanilama.Kaydet("1. AddCommandItem2 tamamlandi");

            Tanilama.Kaydet("2. AddCommandItem2 cagriliyor");
            grup.AddCommandItem2(
                "Paket/Parça Etiketle (Kütüphane)", -1,
                "Seçili bileşene ÜretimOS paket/parça/malzeme/kenar bandı etiketi atar — Faz 2",
                "Etiketle", 1, "EtiketlePaneliAc", "PaketOlusturEtkinMi",
                ID_ETIKET, itemTipi);
            Tanilama.Kaydet("2. AddCommandItem2 tamamlandi");

            Tanilama.Kaydet("HasToolbar/HasMenu ayarlaniyor");
            grup.HasToolbar = true;
            grup.HasMenu = true;
            Tanilama.Kaydet("HasToolbar/HasMenu tamamlandi");

            Tanilama.Kaydet("Activate cagriliyor");
            grup.Activate();
            Tanilama.Kaydet("Activate tamamlandi - KomutlariKur bitti");
        }

        // Resmi SolidWorks Add-in şablonundaki CompareIDs karşılığı — kayıt
        // defterindeki eski komut ID listesiyle bizim şu anki ID listemiz
        // (sıradan bağımsız) birebir aynı mı diye bakar.
        private static bool IdlerAyniMi(int[] kayitli, int[] guncel)
        {
            if (kayitli == null || kayitli.Length != guncel.Length) return false;
            var a = new List<int>(kayitli); a.Sort();
            var b = new List<int>(guncel); b.Sort();
            for (int i = 0; i < a.Count; i++)
            {
                if (a[i] != b[i]) return false;
            }
            return true;
        }

        // ── İKON ŞERİDİ ÜRETİMİ (SolidWorks'ün ICommandGroup.IconList'i
        // boş bırakılamıyor — bkz. yukarıdaki KESİN TANI #2 notu) ───────────
        // 2 komutumuz olduğu için her boyutta yan yana 2 kareli tek bir şerit
        // görüntü üretiliyor; ImageListIndex bu şeritteki kareyi (0 veya 1)
        // seçiyor. Dosyalar bir kere üretilip diskte kalıcı tutuluyor
        // (Kullanıcı\AppData\Local\UretimOSKesim\ikonlar).
        private string[] IkonlariHazirla()
        {
            string klasor = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "UretimOSKesim", "ikonlar");
            Directory.CreateDirectory(klasor);

            string yol20 = Path.Combine(klasor, "komutlar_20.png");
            string yol32 = Path.Combine(klasor, "komutlar_32.png");
            string yol40 = Path.Combine(klasor, "komutlar_40.png");

            SeritIkonUret(yol20, 20);
            SeritIkonUret(yol32, 32);
            SeritIkonUret(yol40, 40);

            return new string[] { yol20, yol32, yol40 };
        }

        private void SeritIkonUret(string dosyaYolu, int kareBoyutu)
        {
            if (File.Exists(dosyaYolu)) return;

            int genislik = kareBoyutu * 2;
            using (var bmp = new Bitmap(genislik, kareBoyutu))
            using (var g = Graphics.FromImage(bmp))
            {
                g.FillRectangle(Brushes.SteelBlue, 0, 0, kareBoyutu, kareBoyutu);
                g.FillRectangle(Brushes.SeaGreen, kareBoyutu, 0, kareBoyutu, kareBoyutu);
                bmp.Save(dosyaYolu, ImageFormat.Png);
            }
        }

        // TANI GÜNLÜĞÜ artık Tanilama.cs'te paylaşılan bir sınıfa taşındı —
        // TeknikResimOlusturucu.cs de aynı güvenlik ağını kullanabilsin diye
        // (bkz. Tanilama.cs'teki gerekçe yorumu). Bu dosyadaki tüm eski
        // Kaydet(...) çağrıları Tanilama.Kaydet(...) olarak güncellendi.

        // GEÇİCİ TEST SABİTİ: TeknikResimOlusturucu'nun canlıda İLK KEZ
        // denenmesi için — kendi .drwdot çizim şablonunuzun TAM YOLUNU buraya
        // yazın (Tools > Options > System Options > Default Templates'te
        // görebilirsiniz). Boş bırakılırsa veya dosya bulunamazsa teknik
        // resim adımı sessizce ATLANIR — kesim listesi/ZIP akışı BUNDAN
        // ETKİLENMEZ (zaten kanıtlanmış, ayrı bir mekanizma).
        private const string TEST_SABLON_YOLU = @"C:\ProgramData\SolidWorks\SOLIDWORKS 2025\templates\Drawing.drwdot";

        // ── KOMUT: KESİM PAKETİ OLUŞTUR ──────────────────────────────────────
        // CommandManager bu adı (case-sensitive) [ComVisible] genel metod
        // olarak public class üzerinde arar — imza değişmemeli.
        public void PaketOlusturCalistir()
        {
            IModelDoc2 aktifBelge = (IModelDoc2)_app.ActiveDoc;
            if (aktifBelge == null)
            {
                MessageBox.Show("Önce bir montaj (.sldasm) açın.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var cikarici = new KesimListesiCikarici();
            var satirlar = cikarici.MontajiGez(aktifBelge);

            using (var kaydetDialog = new SaveFileDialog { Filter = "ZIP dosyası|*.zip", FileName = "uretimos_kesim_paketi.zip" })
            {
                if (kaydetDialog.ShowDialog() != DialogResult.OK) return;
                cikarici.ZipOlustur(kaydetDialog.FileName, satirlar);
            }

            string ozet = $"{satirlar.Count} parça satırı dışa aktarıldı.";
            if (cikarici.Uyarilar.Count > 0)
                ozet += $"\n\n{cikarici.Uyarilar.Count} uyarı:\n- " + string.Join("\n- ", cikarici.Uyarilar);

            // GEÇİCİ TEST: teknik resim üretim mekanizmasının ilk denemesi —
            // sadece AKTİF montajın kendisi için TEK bir PDF üretir (her
            // etiketli parça için ayrı ayrı üretim, mekanizma kanıtlandıktan
            // SONRA KesimListesiCikarici'ye entegre edilecek). TEST_SABLON_YOLU
            // boşsa/geçersizse bu adım tamamen atlanır.
            if (!string.IsNullOrWhiteSpace(TEST_SABLON_YOLU) && File.Exists(TEST_SABLON_YOLU))
            {
                Tanilama.Kaydet("Teknik resim TEST adımı basliyor");
                var resimUretici = new TeknikResimOlusturucu(_app);
                string aktifYol = aktifBelge.GetPathName();
                string cikisKlasoru = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string pdfYolu = resimUretici.TeknikResimOlustur(aktifYol, TEST_SABLON_YOLU, cikisKlasoru, "uretimos_teknik_resim_test");

                if (pdfYolu != null)
                {
                    ozet += $"\n\nTeknik resim testi: BAŞARILI → {pdfYolu}";
                }
                else
                {
                    ozet += "\n\nTeknik resim testi: BAŞARISIZ.";
                }
                if (resimUretici.Uyarilar.Count > 0)
                {
                    ozet += "\n" + string.Join("\n", resimUretici.Uyarilar);
                }
            }

            MessageBox.Show(ozet, "ÜretimOS Kesim Paketi", MessageBoxButtons.OK,
                cikarici.Uyarilar.Count > 0 ? MessageBoxIcon.Warning : MessageBoxIcon.Information);
        }

        // ── KOMUT: ETİKETLEME PANELİ (Faz 2 — şimdilik yer tutucu) ───────────
        // v1 taslağının kapsamı BİLİNÇLİ olarak kesim listesi + teknik resim
        // çekirdeğiyle sınırlı tutuldu (kullanıcının bu mesajdaki BİRİNCİL
        // isteği). Kütüphane senkronu + PropertyManagerPage tabanlı etiketleme
        // UI'ı, ÜretimOS API'sinden gerçek hammadde/paket/kenar bandı listesi
        // gerektirdiğinden ayrı bir adım olarak README.md Faz 2'de tarif edildi.
        public void EtiketlePaneliAc()
        {
            MessageBox.Show(
                "Etiketleme paneli Faz 2 kapsamında. Şimdilik özel alanları\n" +
                "(URETIMOS_TIP, URETIMOS_KOD, URETIMOS_PLAKA_KODU, ...) SolidWorks'ün\n" +
                "kendi 'Özel Özellikler' (Custom Properties) sekmesinden elle girebilirsiniz\n" +
                "— bkz. OzelAlanlar.cs'teki tam alan listesi ve README.md.",
                "ÜretimOS — Yakında", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        public int PaketOlusturEtkinMi() => 1; // her zaman etkin; ileride "montaj açık mı" kontrolü eklenebilir

        // ── COM KAYIT (regasm otomatik çağırır — Register for COM Interop) ───
        [ComRegisterFunction]
        public static void RegisterFunction(Type t)
        {
            string anahtarYolu = "SOFTWARE\\SolidWorks\\Addins\\{" + t.GUID.ToString() + "}";
            using (var anahtar = Registry.LocalMachine.CreateSubKey(anahtarYolu))
            {
                anahtar.SetValue(null, 0);
                anahtar.SetValue("Description", "ÜretimOS için kesim listesi ve teknik resim üretir");
                anahtar.SetValue("Title", "ÜretimOS Kesim & Teknik Resim");
            }

            string baglantiYolu = "Software\\SolidWorks\\AddInsStartup\\{" + t.GUID.ToString() + "}";
            using (var anahtar = Registry.CurrentUser.CreateSubKey(baglantiYolu))
            {
                anahtar.SetValue(null, 1); // SolidWorks açılışında otomatik yükle
            }
        }

        [ComUnregisterFunction]
        public static void UnregisterFunction(Type t)
        {
            Registry.LocalMachine.DeleteSubKeyTree("SOFTWARE\\SolidWorks\\Addins\\{" + t.GUID.ToString() + "}", false);
            Registry.CurrentUser.DeleteSubKeyTree("Software\\SolidWorks\\AddInsStartup\\{" + t.GUID.ToString() + "}", false);
        }
    }
}
