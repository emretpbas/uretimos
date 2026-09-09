using System;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using SolidWorks.Interop.swpublished;

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
    [Guid("11111111-2222-3333-4444-555555555555"), ComVisible(true)]
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
        // TANI AMAÇLI GEÇİCİ DURUM: gerçek denemede SolidWorks'ün KENDİ
        // native modülünde (sldappu) tam çökme oluştu — bu, KomutlariKur()
        // içindeki CreateCommandGroup2/AddCommandItem2 çağrılarının YANLIŞ
        // parametrelerle SolidWorks'ün belleğini bozduğunu gösteriyor (bu tür
        // bir çökme managed try/catch ile YAKALANAMAZ). Araç çubuğu kodu
        // BİLİNÇLİ olarak devre dışı bırakıldı — önce eklentinin ÇÖKMEDEN
        // yüklendiği kanıtlanacak, sonra CommandManager API'si Nesne
        // Gezgini/Go to Definition ile doğrulanıp GERİ eklenecek.
        public bool ConnectToSW(object ThisSW, int Cookie)
        {
            try
            {
                _app = (ISldWorks)ThisSW;
                _cookie = Cookie;
                _cmdMgr = _app.GetCommandManager(_cookie);

                // KomutlariKur();  // GEÇİCİ OLARAK KAPALI — bkz. yukarıdaki not.

                _app.SetAddinCallbackInfo2(0, this, _cookie);
                return true;
            }
            catch (Exception ex)
            {
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
                // CommandGroup ID, KomutlariKur() içindeki ile AYNI olmalı.
                _cmdMgr.RemoveCommandGroup(1);
            }
            _cmdMgr = null;
            _app = null;
            GC.Collect();
            GC.WaitForPendingFinalizers();
            return true;
        }

        // ── ARAÇ ÇUBUĞU / KOMUTLAR ───────────────────────────────────────────
        private void KomutlariKur()
        {
            int hataKodu = 0;
            ICommandGroup grup = _cmdMgr.CreateCommandGroup2(
                1, "ÜretimOS", "ÜretimOS kesim listesi ve teknik resim araçları",
                "", -1, false, ref hataKodu);

            int idKesim = grup.AddCommandItem2(
                "Kesim Listesi + Teknik Resim Paketi Oluştur", -1,
                "Etiketlenmiş parça/alt montajlardan ZIP paketi üretir (ÜretimOS SWOOD İçe Aktarım ekranına yüklenebilir)",
                "Kesim Paketi Oluştur", 0, "PaketOlusturCalistir", "PaketOlusturEtkinMi",
                1, (int)swCommandItemType_e.swMenuItem + (int)swCommandItemType_e.swToolbarItem);

            int idEtiket = grup.AddCommandItem2(
                "Paket/Parça Etiketle (Kütüphane)", -1,
                "Seçili bileşene ÜretimOS paket/parça/malzeme/kenar bandı etiketi atar — Faz 2",
                "Etiketle", 1, "EtiketlePaneliAc", "PaketOlusturEtkinMi",
                2, (int)swCommandItemType_e.swMenuItem + (int)swCommandItemType_e.swToolbarItem);

            grup.HasToolbar = true;
            grup.HasMenu = true;
            grup.Activate();
        }

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
