using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Reflection;
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

        // ADIM 1'de (TeknikResimOlusturCalistir) hangi modelin çizimi
        // açıldıysa burada tutulur — ADIM 2 (TeknikResimOnaylaCalistir)
        // kaydı Manifest'e bu model yoluyla yazabilsin diye (kullanıcı
        // isteği: her parçanın onaylanan JPG'i, o parçanın kesim satırıyla
        // eşleşsin — bkz. RaporOlusturucu.cs / KesimSatiri.ModelYolu).
        private string _sonOlusturulanModelYolu;

        // Montaj Şeması Oluştur/Onayla için AYRI bir "son model yolu" alanı —
        // teknik resim ve montaj şeması akışları BAĞIMSIZ çalışabilsin diye
        // (kullanıcı aynı oturumda önce montaj şeması sonra teknik resim
        // üzerinde çalışabilir, biri diğerinin durumunu EZMESIN).
        private string _sonMontajSemasiModelYolu;

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
                // SolidWorks (SLDWORKS.exe) kendi .NET derleme arama yolunu
                // kullanır — ClosedXML/PdfSharp'ın NuGet'ten gelen alt
                // bağımlılıkları (ör. SixLabors.Fonts, DocumentFormat.OpenXml)
                // eklentimizin KENDİ klasöründe dursa bile SolidWorks bunları
                // otomatik bulamayabiliyor ("tür bulunamadı" hatası — gerçek
                // denemede doğrulandı). Bu olay, bulunamayan her derlemeyi
                // BİZİM klasörümüzden elle yüklemeyi dener.
                AppDomain.CurrentDomain.AssemblyResolve += BagimliliklariCoz;
                Tanilama.Kaydet("AssemblyResolve kaydedildi");

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

        // Eklentimizin (.dll) bulunduğu klasörde, istenen ada uyan bir DLL
        // varsa onu yükler — SolidWorks'ün kendi arama yolunda bulamadığı
        // NuGet alt bağımlılıklarımızı (ClosedXML/PdfSharp'ın getirdiği
        // SixLabors.Fonts, DocumentFormat.OpenXml, ExcelNumberFormat, RBush,
        // XLParser vb.) devreye sokan güvenlik ağı.
        private static Assembly BagimliliklariCoz(object sender, ResolveEventArgs args)
        {
            try
            {
                string klasor = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                string istenenAd = new AssemblyName(args.Name).Name;
                string dllYolu = Path.Combine(klasor, istenenAd + ".dll");
                Tanilama.Kaydet($"AssemblyResolve: '{args.Name}' isteniyor, denenen yol: {dllYolu}");
                if (File.Exists(dllYolu))
                {
                    return Assembly.LoadFrom(dllYolu);
                }
                return null;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("BagimliliklariCoz HATA: " + ex);
                return null;
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
            const int ID_TEKNIK_OLUSTUR = 103;
            const int ID_TEKNIK_ONAYLA = 104;
            const int ID_SWOOD_PAKET = 105;
            const int ID_MONTAJ_SEMASI_OLUSTUR = 106;
            const int ID_MONTAJ_SEMASI_ONAYLA = 107;
            int[] komutIdleri = new int[] {
                ID_KESIM, ID_ETIKET, ID_TEKNIK_OLUSTUR, ID_TEKNIK_ONAYLA, ID_SWOOD_PAKET,
                ID_MONTAJ_SEMASI_OLUSTUR, ID_MONTAJ_SEMASI_ONAYLA
            };

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
                "Kesim Listesi + Teknik Resim Raporu Oluştur", -1,
                "Etiketlenmiş parça/alt montajların kesim listesini ve o ana kadar onaylanmış " +
                "teknik resimlerini (bkz. '2) Teknik Resmi Onayla') tek bir Excel (.xlsx) ve " +
                "çok sayfalı PDF raporunda birleştirir — 'Genel' sayfası tüm parçaları ve montajın " +
                "kendi teknik resmini, ayrı sayfalar/sekmeler ise her parçanın kesim satırını ve " +
                "kendi teknik resmini içerir.",
                "Rapor Oluştur", 0, "PaketOlusturCalistir", "PaketOlusturEtkinMi",
                ID_KESIM, itemTipi);
            Tanilama.Kaydet("1. AddCommandItem2 tamamlandi");

            Tanilama.Kaydet("2. AddCommandItem2 cagriliyor");
            grup.AddCommandItem2(
                "Paket/Parça Etiketle (Kütüphane)", -1,
                "Seçili bileşene ÜretimOS paket/parça/malzeme/kenar bandı etiketi atar — Faz 2",
                "Etiketle", 1, "EtiketlePaneliAc", "PaketOlusturEtkinMi",
                ID_ETIKET, itemTipi);
            Tanilama.Kaydet("2. AddCommandItem2 tamamlandi");

            // İKİ ADIMLI TEKNİK RESİM AKIŞI (kullanıcı isteği: "önce solidde
            // yapsın ben düzenleyeyim, sonra onayla dwg ve pdf alsın") —
            // otomatik yerleşim antete taşma sorununu tam çözemediği için
            // araya bilinçli bir insan-düzenleme adımı eklendi.
            Tanilama.Kaydet("3. AddCommandItem2 cagriliyor");
            grup.AddCommandItem2(
                "1) Teknik Resim Oluştur (Düzenlemek İçin Aç)", -1,
                "Aktif parça/montaj için 4 görünüşlü bir çizim oluşturur ve SolidWorks'te AÇIK bırakır — " +
                "yerleşimi/ölçeği elle düzenleyin, sonra '2) Teknik Resmi Onayla'ya basın.",
                "Teknik Resim Oluştur", 0, "TeknikResimOlusturCalistir", "PaketOlusturEtkinMi",
                ID_TEKNIK_OLUSTUR, itemTipi);
            Tanilama.Kaydet("3. AddCommandItem2 tamamlandi");

            Tanilama.Kaydet("4. AddCommandItem2 cagriliyor");
            grup.AddCommandItem2(
                "2) Teknik Resmi Onayla (DWG+PDF Kaydet)", -1,
                "Şu an SolidWorks'te AÇIK olan (elle düzenlediğiniz) çizimi hem .dwg hem .pdf olarak kaydeder.",
                "Onayla ve Kaydet", 1, "TeknikResimOnaylaCalistir", "PaketOlusturEtkinMi",
                ID_TEKNIK_ONAYLA, itemTipi);
            Tanilama.Kaydet("4. AddCommandItem2 tamamlandi");

            // KOMUT 5 — kullanıcı isteği: "üretimostaki reçete ve rota
            // sistemine uyacak şekilde ve iş emri formatına uygun olacak
            // şekilde". ÜretimOS'un ZATEN ÇALIŞAN, test edilmiş bir SWOOD ZIP
            // içe aktarım köprüsü var (bkz. swood_okuyucu.js/is_emri_uretici.js
            // içindeki geniş test paketi) — bu komut kesim listesini o
            // köprünün beklediği ZIP yapısına (Saw Cut Export/*.csv + PDFS/)
            // dönüştürür, ÜretimOS tarafında hiçbir değişiklik gerekmeden
            // "İş Emri Formu > SWOOD İçe Aktar" ekranından doğrudan
            // yüklenebilir (bkz. SwoodPaketOlusturucu.cs).
            Tanilama.Kaydet("5. AddCommandItem2 cagriliyor");
            grup.AddCommandItem2(
                "ÜretimOS'a Aktar (SWOOD Uyumlu Paket)", -1,
                "Kesim listesini ve o ana kadar onaylanmış teknik resimleri, ÜretimOS'un " +
                "'İş Emri Formu > SWOOD İçe Aktar' ekranının doğrudan okuyabileceği bir " +
                ".zip paketine (Saw Cut Export/*.csv + PDFS/) dönüştürür — hırdavat " +
                "(minifix/rafix/menteşe vb.), birleşim tipi (45° gönye) ve yabancı parça " +
                "(satın alınan, plakadan kesilmeyen) bilgileri de dahil edilir.",
                "SWOOD Paketi", 2, "SwoodPaketOlusturCalistir", "PaketOlusturEtkinMi",
                ID_SWOOD_PAKET, itemTipi);
            Tanilama.Kaydet("5. AddCommandItem2 tamamlandi");

            // KOMUT 6-7 — MONTAJ ŞEMASI (kullanıcı isteği: "önce parça ve alt
            // montajdaki tüm parçaları listeleyen, sonra montaj aşamalarını
            // benim yaptığım explode sırasına göre çizsin, yine ben onaylayıp
            // düzenleyeyim, dwg/pdf çıktı alalım"). Teknik resimle AYNI iki
            // adımlı mimari (Oluştur → elle düzenle → Onayla) — ayrı
            // komutlar olarak tutuldu ki her ikisi de (normal teknik resim +
            // montaj şeması) AYNI montaj için BAĞIMSIZ onaylanabilsin
            // (bkz. Manifest.cs KaydetMontajSemasi — ayrı anahtar).
            Tanilama.Kaydet("6. AddCommandItem2 cagriliyor");
            grup.AddCommandItem2(
                "Montaj Şeması Oluştur (Patlatılmış, Düzenlemek İçin Aç)", -1,
                "Aktif montaj için parça listesini çıkarır ve montajın KENDİ patlatılmış " +
                "(exploded) görünümünü çizime aktarıp SolidWorks'te AÇIK bırakır — aşamaları/" +
                "balonları elle düzenleyin, sonra 'Montaj Şemasını Onayla'ya basın. Montajda " +
                "kayıtlı bir patlatılmış görünüm yoksa çizim normal/toplanmış açılır, önce " +
                "SolidWorks'te bir Exploded View oluşturun.",
                "Montaj Şeması Oluştur", 5, "MontajSemasiOlusturCalistir", "PaketOlusturEtkinMi",
                ID_MONTAJ_SEMASI_OLUSTUR, itemTipi);
            Tanilama.Kaydet("6. AddCommandItem2 tamamlandi");

            Tanilama.Kaydet("7. AddCommandItem2 cagriliyor");
            grup.AddCommandItem2(
                "Montaj Şemasını Onayla (DWG+PDF Kaydet)", -1,
                "Şu an SolidWorks'te AÇIK olan (elle düzenlediğiniz) montaj şeması çizimini " +
                "hem .dwg hem .pdf olarak kaydeder — bu görsel, Kesim Raporu'nun 'Genel' " +
                "sayfasına parça listesinden hemen sonra otomatik eklenir.",
                "Montaj Şemasını Onayla", 6, "MontajSemasiOnaylaCalistir", "PaketOlusturEtkinMi",
                ID_MONTAJ_SEMASI_ONAYLA, itemTipi);
            Tanilama.Kaydet("7. AddCommandItem2 tamamlandi");

            Tanilama.Kaydet("HasToolbar/HasMenu ayarlaniyor");
            grup.HasToolbar = true;
            grup.HasMenu = true;
            Tanilama.Kaydet("HasToolbar/HasMenu tamamlandi");

            Tanilama.Kaydet("Activate cagriliyor");
            grup.Activate();
            Tanilama.Kaydet("Activate tamamlandi");

            // KULLANICI İSTEĞİ: "tabs ta yapalım" — SolidWorks'ün kendi
            // Features/Sketch/Evaluate şeridine benzer, özel bir "ÜretimOS"
            // SEKMESİ. CommandManager sekmeleri belge türüne göre kapsamlı
            // olduğu için Parça/Montaj/Çizim'in HER BİRİ için ayrı kuruluyor
            // (4 komutumuz da üçünde de görünür — hangi komutun hangi belge
            // türünde anlamlı olduğunu her komutun kendi metodu zaten
            // kontrol ediyor, bkz. PaketOlusturCalistir/
            // TeknikResimOnaylaCalistir'deki "yanlış belge türü" uyarıları).
            Tanilama.Kaydet("Sekme kuruluyor - Parca");
            SekmeKur(grup, (int)swDocumentTypes_e.swDocPART);
            Tanilama.Kaydet("Sekme kuruldu - Parca");

            Tanilama.Kaydet("Sekme kuruluyor - Montaj");
            SekmeKur(grup, (int)swDocumentTypes_e.swDocASSEMBLY);
            Tanilama.Kaydet("Sekme kuruldu - Montaj");

            Tanilama.Kaydet("Sekme kuruluyor - Cizim");
            SekmeKur(grup, (int)swDocumentTypes_e.swDocDRAWING);
            Tanilama.Kaydet("Sekme kuruldu - Cizim");

            Tanilama.Kaydet("KomutlariKur bitti");
        }

        // Resmi SolidWorks API "Create CommandManager Tab and Tab Boxes"
        // örneğindeki AYNI örüntü: cmdGroup.get_CommandID(index) ile HAM
        // UserID (101/102/...) değil, CommandTabBox'ın beklediği BİRLEŞİK
        // komut kimliği alınıyor (index, AddCommandItem2'ye eklenme SIRASINA
        // göre — 0=Kesim, 1=Etiketle, 2=Teknik Resim Oluştur, 3=Onayla).
        // Önceki denemeden kalan bozuk/eski bir sekme varsa (ör. komut
        // sayısı değiştiyse) ÖNCE KALDIRILIP TEMİZ oluşturuluyor —
        // CommandGroup'ta yaşadığımız kayıt defteri önbellek sorununun
        // aynısını burada da önlemek için (bkz. yukarıdaki KESİN TANI #5).
        private void SekmeKur(ICommandGroup grup, int belgeTuru)
        {
            Tanilama.Kaydet($"GetCommandTab cagriliyor (belgeTuru={belgeTuru})");
            ICommandTab mevcutSekme = _cmdMgr.GetCommandTab(belgeTuru, "ÜretimOS");
            Tanilama.Kaydet("GetCommandTab tamamlandi, mevcutSekme null mu=" + (mevcutSekme == null));
            if (mevcutSekme != null)
            {
                Tanilama.Kaydet("RemoveCommandTab cagriliyor (eski sekme temizleniyor)");
                // NOT: RemoveCommandTab parametresi ICommandTab ARAYÜZÜNÜ değil,
                // somut CommandTab SINIFINI bekliyor — gerçek derlemede tespit
                // edildi ("ICommandTab'dan CommandTab'a dönüştürülemiyor").
                _cmdMgr.RemoveCommandTab((CommandTab)mevcutSekme);
                Tanilama.Kaydet("RemoveCommandTab tamamlandi");
            }

            Tanilama.Kaydet("AddCommandTab cagriliyor");
            ICommandTab sekme = _cmdMgr.AddCommandTab(belgeTuru, "ÜretimOS");
            Tanilama.Kaydet("AddCommandTab tamamlandi, sekme null mu=" + (sekme == null));
            if (sekme == null) return;

            Tanilama.Kaydet("AddCommandTabBox cagriliyor");
            ICommandTabBox kutu = sekme.AddCommandTabBox();
            Tanilama.Kaydet("AddCommandTabBox tamamlandi, kutu null mu=" + (kutu == null));
            if (kutu == null) return;

            int[] cmdIdleri = new int[7];
            int[] metinTipi = new int[7];
            for (int i = 0; i < 7; i++)
            {
                cmdIdleri[i] = grup.get_CommandID(i);
                metinTipi[i] = (int)swCommandTabButtonTextDisplay_e.swCommandTabButton_TextBelow;
            }

            Tanilama.Kaydet("AddCommands cagriliyor");
            bool eklendi = kutu.AddCommands(cmdIdleri, metinTipi);
            Tanilama.Kaydet("AddCommands tamamlandi, eklendi=" + eklendi);
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
        // 4 komutumuz olduğu için her boyutta yan yana 4 kareli tek bir
        // şerit görüntü üretiliyor; ImageListIndex bu şeritteki kareyi
        // (0-3) seçiyor. Her komut için AYRI, ANLAMLI bir simge çiziliyor
        // (düz renkli kare DEĞİL) — kesim/etiket/teknik resim/onay
        // eylemlerini kabaca çağrıştıran basit piktogramlar. Dosya adı
        // BİLİNÇLİ olarak "_v2" ile değişti: eski 2 kareli sürüm zaten
        // diskte varsa (önceki denemelerden), "dosya zaten var" kontrolü
        // onu YENİDEN KULLANIR ve yeni 4 kareli tasarımla İNDEKS
        // UYUŞMAZLIĞINA yol açar — yeni dosya adı bunu önlüyor.
        private string[] IkonlariHazirla()
        {
            string klasor = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "UretimOSKesim", "ikonlar");
            Directory.CreateDirectory(klasor);

            // NOT: dosya adı "_v4" oldu (v3'ten) — 5 kareli şeritten 7 kareli
            // şeride geçildi (Montaj Şeması Oluştur/Onayla eklendi); "dosya
            // zaten var" kontrolü eski 5 kareli dosyayı YENİDEN KULLANMASIN
            // diye (aksi halde 6-7. komutların ikonu boş/yanlış kalır) —
            // bkz. _v2/_v3 için verilen aynı gerekçe.
            string yol20 = Path.Combine(klasor, "komutlar_v4_20.png");
            string yol32 = Path.Combine(klasor, "komutlar_v4_32.png");
            string yol40 = Path.Combine(klasor, "komutlar_v4_40.png");

            SeritIkonUret(yol20, 20);
            SeritIkonUret(yol32, 32);
            SeritIkonUret(yol40, 40);

            return new string[] { yol20, yol32, yol40 };
        }

        // Şerit sırası (ImageListIndex ile eşleşmeli — bkz. KomutlariKur'daki
        // AddCommandItem2 çağrıları): 0=Kesim, 1=Etiketle, 2=Teknik Resim
        // Oluştur, 3=Teknik Resmi Onayla, 4=SWOOD Paketi, 5=Montaj Şeması
        // Oluştur, 6=Montaj Şemasını Onayla.
        private void SeritIkonUret(string dosyaYolu, int kareBoyutu)
        {
            if (File.Exists(dosyaYolu)) return;

            int genislik = kareBoyutu * 7;
            using (var bmp = new Bitmap(genislik, kareBoyutu))
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                KesimIkonuCiz(g, 0, kareBoyutu);
                EtiketIkonuCiz(g, kareBoyutu, kareBoyutu);
                TeknikResimIkonuCiz(g, kareBoyutu * 2, kareBoyutu);
                OnayIkonuCiz(g, kareBoyutu * 3, kareBoyutu);
                SwoodPaketIkonuCiz(g, kareBoyutu * 4, kareBoyutu);
                MontajSemasiIkonuCiz(g, kareBoyutu * 5, kareBoyutu);
                MontajSemasiOnayIkonuCiz(g, kareBoyutu * 6, kareBoyutu);
                bmp.Save(dosyaYolu, ImageFormat.Png);
            }
        }

        // 0: Kesim Listesi — mavi zemin, kesik çizgili panel (bir plakanın
        // ortadan kesilmesini çağrıştırır).
        private void KesimIkonuCiz(Graphics g, int x, int s)
        {
            g.FillRectangle(Brushes.SteelBlue, x, 0, s, s);
            float m = s * 0.2f;
            using (var kalem = new Pen(Color.White, Math.Max(1f, s / 14f)))
            {
                g.DrawRectangle(kalem, x + m, m, s - 2 * m, s - 2 * m);
            }
            using (var kesikKalem = new Pen(Color.White, Math.Max(1f, s / 18f)))
            {
                kesikKalem.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
                g.DrawLine(kesikKalem, x + s / 2f, m, x + s / 2f, s - m);
            }
        }

        // 1: Paket/Parça Etiketle — yeşil zemin, delikli etiket (fiyat/ürün
        // etiketi) şekli.
        private void EtiketIkonuCiz(Graphics g, int x, int s)
        {
            g.FillRectangle(Brushes.SeaGreen, x, 0, s, s);
            var ucgen = new PointF[]
            {
                new PointF(x + s * 0.2f, s * 0.25f),
                new PointF(x + s * 0.6f, s * 0.25f),
                new PointF(x + s * 0.85f, s * 0.5f),
                new PointF(x + s * 0.6f, s * 0.75f),
                new PointF(x + s * 0.2f, s * 0.75f),
            };
            g.FillPolygon(Brushes.White, ucgen);
            float d = s * 0.1f;
            g.FillEllipse(Brushes.SeaGreen, x + s * 0.3f - d / 2f, s * 0.5f - d / 2f, d, d);
        }

        // 2: Teknik Resim Oluştur — turuncu zemin, çizgili doküman (teknik
        // resim sayfası) şekli.
        private void TeknikResimIkonuCiz(Graphics g, int x, int s)
        {
            g.FillRectangle(Brushes.DarkOrange, x, 0, s, s);
            float mx = s * 0.25f, my = s * 0.15f;
            var kagit = new RectangleF(x + mx, my, s - 2 * mx, s - 2 * my);
            g.FillRectangle(Brushes.White, kagit);
            using (var kalem = new Pen(Color.DarkOrange, Math.Max(1f, s / 20f)))
            {
                float satirAraligi = kagit.Height / 4f;
                for (int i = 1; i <= 3; i++)
                {
                    float y = kagit.Y + satirAraligi * i;
                    g.DrawLine(kalem, kagit.X + kagit.Width * 0.15f, y, kagit.X + kagit.Width * 0.85f, y);
                }
            }
        }

        // 3: Teknik Resmi Onayla — mor zemin, onay (✓) işareti.
        private void OnayIkonuCiz(Graphics g, int x, int s)
        {
            g.FillRectangle(Brushes.MediumPurple, x, 0, s, s);
            using (var kalem = new Pen(Color.White, Math.Max(2f, s / 8f)))
            {
                kalem.StartCap = System.Drawing.Drawing2D.LineCap.Round;
                kalem.EndCap = System.Drawing.Drawing2D.LineCap.Round;
                kalem.LineJoin = System.Drawing.Drawing2D.LineJoin.Round;
                var noktalar = new PointF[]
                {
                    new PointF(x + s * 0.22f, s * 0.52f),
                    new PointF(x + s * 0.42f, s * 0.72f),
                    new PointF(x + s * 0.8f, s * 0.28f),
                };
                g.DrawLines(kalem, noktalar);
            }
        }

        // TANI GÜNLÜĞÜ artık Tanilama.cs'te paylaşılan bir sınıfa taşındı —
        // TeknikResimOlusturucu.cs de aynı güvenlik ağını kullanabilsin diye
        // (bkz. Tanilama.cs'teki gerekçe yorumu). Bu dosyadaki tüm eski
        // Kaydet(...) çağrıları Tanilama.Kaydet(...) olarak güncellendi.

        // Kendi .drwdot çizim şablonunuzun TAM YOLU (Tools > Options >
        // System Options > Default Templates'te görebilirsiniz).
        // 4: ÜretimOS'a Aktar (SWOOD Uyumlu Paket) — teal zemin, dışa ok +
        // kutu (paketleme/gönderme) şekli.
        private void SwoodPaketIkonuCiz(Graphics g, int x, int s)
        {
            g.FillRectangle(Brushes.Teal, x, 0, s, s);
            float kutuY = s * 0.55f, kutuYuk = s * 0.3f;
            using (var kalem = new Pen(Color.White, Math.Max(1f, s / 16f)))
            {
                g.DrawRectangle(kalem, x + s * 0.2f, kutuY, s * 0.6f, kutuYuk);
                var okNoktalari = new PointF[]
                {
                    new PointF(x + s * 0.5f, s * 0.12f),
                    new PointF(x + s * 0.5f, s * 0.48f),
                };
                g.DrawLines(kalem, okNoktalari);
                g.DrawLines(kalem, new PointF[]
                {
                    new PointF(x + s * 0.35f, s * 0.34f),
                    new PointF(x + s * 0.5f, s * 0.48f),
                    new PointF(x + s * 0.65f, s * 0.34f),
                });
            }
        }

        // 5: Montaj Şeması Oluştur — indigo zemin, birbirinden AYRILMIŞ (patlatılmış)
        // üç küçük kare — "exploded view" çağrışımı.
        private void MontajSemasiIkonuCiz(Graphics g, int x, int s)
        {
            g.FillRectangle(Brushes.Indigo, x, 0, s, s);
            float k = s * 0.22f;
            using (var beyazFircasi = new SolidBrush(Color.White))
            {
                g.FillRectangle(beyazFircasi, x + s * 0.14f, s * 0.14f, k, k);
                g.FillRectangle(beyazFircasi, x + s * 0.62f, s * 0.30f, k, k);
                g.FillRectangle(beyazFircasi, x + s * 0.38f, s * 0.62f, k, k);
            }
            using (var kesikKalem = new Pen(Color.White, Math.Max(1f, s / 20f)))
            {
                kesikKalem.DashStyle = System.Drawing.Drawing2D.DashStyle.Dot;
                g.DrawLine(kesikKalem, x + s * 0.36f, s * 0.25f, x + s * 0.62f, s * 0.40f);
                g.DrawLine(kesikKalem, x + s * 0.55f, s * 0.53f, x + s * 0.50f, s * 0.62f);
            }
        }

        // 6: Montaj Şemasını Onayla — indigo zemin (5 ile eşleşsin diye), onay (✓).
        private void MontajSemasiOnayIkonuCiz(Graphics g, int x, int s)
        {
            g.FillRectangle(Brushes.MediumSlateBlue, x, 0, s, s);
            using (var kalem = new Pen(Color.White, Math.Max(2f, s / 8f)))
            {
                kalem.StartCap = System.Drawing.Drawing2D.LineCap.Round;
                kalem.EndCap = System.Drawing.Drawing2D.LineCap.Round;
                kalem.LineJoin = System.Drawing.Drawing2D.LineJoin.Round;
                var noktalar = new PointF[]
                {
                    new PointF(x + s * 0.22f, s * 0.52f),
                    new PointF(x + s * 0.42f, s * 0.72f),
                    new PointF(x + s * 0.8f, s * 0.28f),
                };
                g.DrawLines(kalem, noktalar);
            }
        }

        private const string SABLON_YOLU = @"C:\ProgramData\SolidWorks\SOLIDWORKS 2025\templates\uretimos.drwdot";

        // ── KOMUT: KESİM LİSTESİ + TEKNİK RESİM RAPORU OLUŞTUR ───────────────
        // CommandManager bu adı (case-sensitive) [ComVisible] genel metod
        // olarak public class üzerinde arar — imza değişmemeli. Kullanıcı
        // isteği üzerine eski ZIP/CSV çıktısının YERİNİ ALDI: şimdi Excel
        // (.xlsx, "Genel" sekmesi + her parça için ayrı sekme) VE çok
        // sayfalı PDF (genel özet sayfası + her parça için ayrı sayfa)
        // birlikte üretiliyor (bkz. RaporOlusturucu.cs). Her parçanın
        // teknik resmi, o parça için DAHA ÖNCE '2) Teknik Resmi Onayla'
        // ile onaylanmış JPG'den gelir (bkz. Manifest.cs) — bu komut
        // teknik resim ÜRETMEZ, sadece o ana kadar onaylanmış olanları
        // toplar.
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

            string xlsxYolu;
            using (var kaydetDialog = new SaveFileDialog { Filter = "Excel dosyası|*.xlsx", FileName = "uretimos_kesim_raporu.xlsx" })
            {
                if (kaydetDialog.ShowDialog() != DialogResult.OK) return;
                xlsxYolu = kaydetDialog.FileName;
            }

            var raporUretici = new RaporOlusturucu();
            bool basarili = raporUretici.RaporUret(satirlar, aktifBelge.GetPathName(), xlsxYolu,
                out string uretilenXlsx, out string uretilenPdf);

            string ozet = basarili
                ? $"{satirlar.Count} parça satırı içeren rapor oluşturuldu:\n{uretilenXlsx ?? "(xlsx başarısız)"}\n{uretilenPdf ?? "(pdf başarısız)"}"
                : "Rapor oluşturulamadı.";
            var tumUyarilar = new List<string>(cikarici.Uyarilar);
            tumUyarilar.AddRange(raporUretici.Uyarilar);
            if (tumUyarilar.Count > 0)
                ozet += $"\n\n{tumUyarilar.Count} uyarı:\n- " + string.Join("\n- ", tumUyarilar);

            MessageBox.Show(ozet, "ÜretimOS Kesim Raporu", MessageBoxButtons.OK,
                !basarili ? MessageBoxIcon.Error : tumUyarilar.Count > 0 ? MessageBoxIcon.Warning : MessageBoxIcon.Information);
        }

        // ── KOMUT: ÜRETİMOS'A AKTAR (SWOOD UYUMLU PAKET) ─────────────────────
        // Kesim listesini, ÜretimOS'un ZATEN çalışan/test edilmiş SWOOD ZIP
        // içe aktarım köprüsünün (swood_okuyucu.js + is_emri_uretici.js:
        // swoodDenUret) beklediği ZIP yapısına dönüştürür — bkz.
        // SwoodPaketOlusturucu.cs. Excel/PDF raporunun (PaketOlusturCalistir)
        // YERİNE değil, YANINDA kullanılır: o insan onayı için, bu ise
        // ÜretimOS'a doğrudan makine-okunabilir içe aktarım için.
        public void SwoodPaketOlusturCalistir()
        {
            IModelDoc2 aktifBelge = (IModelDoc2)_app.ActiveDoc;
            if (aktifBelge == null)
            {
                MessageBox.Show("Önce bir montaj (.sldasm) açın.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var cikarici = new KesimListesiCikarici();
            var satirlar = cikarici.MontajiGez(aktifBelge);

            string zipYolu;
            using (var kaydetDialog = new SaveFileDialog { Filter = "ZIP dosyası|*.zip", FileName = "uretimos_swood_paketi.zip" })
            {
                if (kaydetDialog.ShowDialog() != DialogResult.OK) return;
                zipYolu = kaydetDialog.FileName;
            }

            // PDF'ler: montajın kendi onaylanmış PDF'i + her benzersiz parçanın
            // (ModelYolu'na göre) onaylanmış PDF'i — Manifest'te kaydı yoksa
            // (henüz "2) Teknik Resmi Onayla" yapılmadıysa) o parça için PDF
            // eklenmez, TAHMİN EDİLMEZ.
            var pdfYollari = new List<string>();
            var genelGirdi = Manifest.Bul(aktifBelge.GetPathName());
            if (genelGirdi?.PdfYolu != null) pdfYollari.Add(genelGirdi.PdfYolu);
            var montajSemasiGirdi = Manifest.BulMontajSemasi(aktifBelge.GetPathName());
            if (montajSemasiGirdi?.PdfYolu != null) pdfYollari.Add(montajSemasiGirdi.PdfYolu);
            var eklenenModelYollari = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var s in satirlar)
            {
                if (string.IsNullOrWhiteSpace(s.ModelYolu) || !eklenenModelYollari.Add(s.ModelYolu)) continue;
                var girdi = Manifest.Bul(s.ModelYolu);
                if (girdi?.PdfYolu != null) pdfYollari.Add(girdi.PdfYolu);
            }

            string uretilenZip;
            try
            {
                uretilenZip = SwoodPaketOlusturucu.Uret(satirlar, pdfYollari, zipYolu);
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("SwoodPaketOlusturCalistir HATA: " + ex);
                MessageBox.Show("Paket oluşturulurken hata: " + ex.Message, "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            int onaysizParcaSayisi = satirlar.Count(s => Manifest.Bul(s.ModelYolu)?.PdfYolu == null);
            string ozet = $"{satirlar.Count} parça satırı içeren SWOOD uyumlu paket oluşturuldu:\n{uretilenZip}\n\n" +
                $"({pdfYollari.Count} teknik resim dahil edildi.)\n\n" +
                "ÜretimOS'ta 'İş Emri Formu' ekranından 'SWOOD İçe Aktar' ile bu .zip dosyasını yükleyin.";
            if (onaysizParcaSayisi > 0)
                ozet += $"\n\n⚠ {onaysizParcaSayisi} parçanın teknik resmi henüz onaylanmamış (bkz. '2) Teknik Resmi Onayla').";
            var tumUyarilar = new List<string>(cikarici.Uyarilar);
            if (tumUyarilar.Count > 0)
                ozet += $"\n\n{tumUyarilar.Count} uyarı:\n- " + string.Join("\n- ", tumUyarilar);

            MessageBox.Show(ozet, "ÜretimOS SWOOD Paketi", MessageBoxButtons.OK,
                tumUyarilar.Count > 0 || onaysizParcaSayisi > 0 ? MessageBoxIcon.Warning : MessageBoxIcon.Information);
        }

        // ── KOMUT: MONTAJ ŞEMASI OLUŞTUR (ADIM 1) ────────────────────────────
        // Montajın kendi patlatılmış (exploded) görünümünü çizime aktarır ve
        // SolidWorks'te AÇIK BIRAKIR — kaydetmez, kapatmaz (teknik resimle
        // BİREBİR aynı iki adımlı mimari, bkz. TeknikResimOlusturucu.cs
        // MontajSemasiAcVeDuzenlemeyeBirak).
        public void MontajSemasiOlusturCalistir()
        {
            if (string.IsNullOrWhiteSpace(SABLON_YOLU) || !File.Exists(SABLON_YOLU))
            {
                MessageBox.Show($"Çizim şablonu bulunamadı:\n{SABLON_YOLU}\n\nSwAddin.cs'teki SABLON_YOLU sabitini kontrol edin.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            IModelDoc2 aktifBelge = (IModelDoc2)_app.ActiveDoc;
            if (aktifBelge == null || aktifBelge.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                MessageBox.Show("Önce bir montaj (.sldasm) açın.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string aktifYol = aktifBelge.GetPathName();
            Tanilama.Kaydet("MontajSemasiOlusturCalistir: " + aktifYol);
            var resimUretici = new TeknikResimOlusturucu(_app);
            bool basarili = resimUretici.MontajSemasiAcVeDuzenlemeyeBirak(aktifYol, SABLON_YOLU);
            if (basarili) _sonMontajSemasiModelYolu = aktifYol;

            string ozet = basarili
                ? "Montaj şeması çizimi oluşturuldu ve SolidWorks'te açık — patlatılmış görünüm " +
                  "(varsa) yansıtıldı, aşamaları/balonları elle düzenleyin, bitince " +
                  "'Montaj Şemasını Onayla'ya basın."
                : "Montaj şeması çizimi oluşturulamadı.";
            if (resimUretici.Uyarilar.Count > 0)
                ozet += "\n\n" + string.Join("\n", resimUretici.Uyarilar);

            MessageBox.Show(ozet, "ÜretimOS Montaj Şeması", MessageBoxButtons.OK,
                basarili ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        // ── KOMUT: MONTAJ ŞEMASINI ONAYLA (ADIM 2) ───────────────────────────
        public void MontajSemasiOnaylaCalistir()
        {
            var aktifBelge = _app.ActiveDoc as IModelDoc2;
            if (aktifBelge == null || aktifBelge.GetType() != (int)swDocumentTypes_e.swDocDRAWING)
            {
                MessageBox.Show(
                    "Onaylamak için önce bir ÇİZİM (.slddrw) belgesini aktif hale getirin\n" +
                    "('Montaj Şeması Oluştur' ile açtığınız çizim).",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string dwgYolu;
            using (var kaydetDialog = new SaveFileDialog { Filter = "DWG dosyası|*.dwg", FileName = "montaj_semasi.dwg" })
            {
                if (kaydetDialog.ShowDialog() != DialogResult.OK) return;
                dwgYolu = kaydetDialog.FileName;
            }

            Tanilama.Kaydet("MontajSemasiOnaylaCalistir: " + dwgYolu);
            var resimUretici = new TeknikResimOlusturucu(_app);
            bool basarili = resimUretici.AcikCizimiKaydet(aktifBelge, dwgYolu,
                out string kaydedilenDwg, out string kaydedilenPdf, out string kaydedilenJpg);

            if (basarili && !string.IsNullOrWhiteSpace(_sonMontajSemasiModelYolu))
            {
                Manifest.KaydetMontajSemasi(_sonMontajSemasiModelYolu, kaydedilenDwg, kaydedilenPdf, kaydedilenJpg);
                Tanilama.Kaydet("Manifest.KaydetMontajSemasi tamamlandi: " + _sonMontajSemasiModelYolu);
            }

            string ozet = basarili
                ? $"Kaydedildi:\n{kaydedilenDwg ?? "(dwg başarısız)"}\n{kaydedilenPdf ?? "(pdf başarısız)"}\n{kaydedilenJpg ?? "(jpg başarısız)"}\n\n" +
                  "Bu görsel, Kesim Raporu'nun 'Genel' sayfasına otomatik eklenecek."
                : "Kaydetme başarısız.";
            if (resimUretici.Uyarilar.Count > 0)
                ozet += "\n\n" + string.Join("\n", resimUretici.Uyarilar);

            MessageBox.Show(ozet, "ÜretimOS Montaj Şeması", MessageBoxButtons.OK,
                basarili ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        // ── KOMUT: TEKNİK RESİM OLUŞTUR (ADIM 1) ─────────────────────────────
        // Çizimi oluşturur ve SolidWorks'te AÇIK BIRAKIR — kaydetmez,
        // kapatmaz. Kullanıcı isteği: "önce solidde yapsın ben düzenleyeyim,
        // sonra onayla dwg ve pdf alsın" — otomatik görünüş yerleşimi antete
        // taşabildiği için (kullanıcı geri bildirimi) bu adım BİLİNÇLİ olarak
        // insana bırakıldı.
        public void TeknikResimOlusturCalistir()
        {
            if (string.IsNullOrWhiteSpace(SABLON_YOLU) || !File.Exists(SABLON_YOLU))
            {
                MessageBox.Show($"Çizim şablonu bulunamadı:\n{SABLON_YOLU}\n\nSwAddin.cs'teki SABLON_YOLU sabitini kontrol edin.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            IModelDoc2 aktifBelge = (IModelDoc2)_app.ActiveDoc;
            if (aktifBelge == null)
            {
                MessageBox.Show("Önce bir parça veya montaj açın.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string aktifYol = aktifBelge.GetPathName();
            Tanilama.Kaydet("TeknikResimOlusturCalistir: " + aktifYol);
            var resimUretici = new TeknikResimOlusturucu(_app);
            bool basarili = resimUretici.TeknikResimAcVeDuzenlemeyeBirak(aktifYol, SABLON_YOLU);
            if (basarili) _sonOlusturulanModelYolu = aktifYol;

            string ozet = basarili
                ? "Çizim oluşturuldu ve SolidWorks'te açık — yerleşimi/ölçeği elle düzenleyin, " +
                  "bitince '2) Teknik Resmi Onayla'ya basın."
                : "Çizim oluşturulamadı.";
            if (resimUretici.Uyarilar.Count > 0)
                ozet += "\n\n" + string.Join("\n", resimUretici.Uyarilar);

            MessageBox.Show(ozet, "ÜretimOS Teknik Resim", MessageBoxButtons.OK,
                basarili ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        // ── KOMUT: TEKNİK RESMİ ONAYLA (ADIM 2) ──────────────────────────────
        // Şu an SolidWorks'te AÇIK olan (kullanıcının elle düzenlediği)
        // çizimi hem .dwg hem .pdf olarak kaydeder. Çizim İÇERİĞİNE dokunmaz.
        public void TeknikResimOnaylaCalistir()
        {
            var aktifBelge = _app.ActiveDoc as IModelDoc2;
            if (aktifBelge == null || aktifBelge.GetType() != (int)swDocumentTypes_e.swDocDRAWING)
            {
                MessageBox.Show(
                    "Onaylamak için önce bir ÇİZİM (.slddrw) belgesini aktif hale getirin\n" +
                    "('1) Teknik Resim Oluştur' ile açtığınız çizim).",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string dwgYolu;
            using (var kaydetDialog = new SaveFileDialog { Filter = "DWG dosyası|*.dwg", FileName = "teknik_resim.dwg" })
            {
                if (kaydetDialog.ShowDialog() != DialogResult.OK) return;
                dwgYolu = kaydetDialog.FileName;
            }

            Tanilama.Kaydet("TeknikResimOnaylaCalistir: " + dwgYolu);
            var resimUretici = new TeknikResimOlusturucu(_app);
            bool basarili = resimUretici.AcikCizimiKaydet(aktifBelge, dwgYolu,
                out string kaydedilenDwg, out string kaydedilenPdf, out string kaydedilenJpg);

            if (basarili && !string.IsNullOrWhiteSpace(_sonOlusturulanModelYolu))
            {
                Manifest.Kaydet(_sonOlusturulanModelYolu, kaydedilenDwg, kaydedilenPdf, kaydedilenJpg);
                Tanilama.Kaydet("Manifest.Kaydet tamamlandi: " + _sonOlusturulanModelYolu);
            }

            string ozet = basarili
                ? $"Kaydedildi:\n{kaydedilenDwg ?? "(dwg başarısız)"}\n{kaydedilenPdf ?? "(pdf başarısız)"}\n{kaydedilenJpg ?? "(jpg başarısız)"}"
                : "Kaydetme başarısız.";
            if (resimUretici.Uyarilar.Count > 0)
                ozet += "\n\n" + string.Join("\n", resimUretici.Uyarilar);

            MessageBox.Show(ozet, "ÜretimOS Teknik Resim", MessageBoxButtons.OK,
                basarili ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        // ── KOMUT: ETİKETLEME PANELİ ──────────────────────────────────────────
        // ARTIK GERÇEK BİR ARAYÜZ (EtiketlemePaneli.cs) — eskiden burada
        // yalnızca "SolidWorks'ün kendi Özel Özellikler'inden elle girin"
        // yönlendirmesi vardı. Aktif belge bir PARÇA ise doğrudan onu, bir
        // MONTAJ ise montaj ağacında SEÇİLİ bileşeni hedef alır (bu yüzden
        // montaj açıkken önce bir bileşen seçilmesi gerekir).
        public void EtiketlePaneliAc()
        {
            IModelDoc2 aktifBelge = (IModelDoc2)_app.ActiveDoc;
            if (aktifBelge == null)
            {
                MessageBox.Show("Önce bir parça veya montaj açın.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            ModelDoc2 hedefModel;
            if (aktifBelge.GetType() == (int)swDocumentTypes_e.swDocPART)
            {
                hedefModel = (ModelDoc2)aktifBelge;
            }
            else if (aktifBelge.GetType() == (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                var selMgr = (ISelectionMgr)aktifBelge.SelectionManager;
                if (selMgr.GetSelectedObjectCount2(-1) == 0)
                {
                    MessageBox.Show(
                        "Önce montaj ağacında (FeatureManager) etiketlemek istediğiniz bileşeni " +
                        "(parça veya alt montaj) seçin, sonra tekrar deneyin.",
                        "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                var bilesen = selMgr.GetSelectedObjectsComponent4(1, "") as Component2;
                if (bilesen == null)
                {
                    MessageBox.Show("Seçili öğe bir bileşen (parça/alt montaj) değil.", "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                hedefModel = (ModelDoc2)bilesen.GetModelDoc2();
                if (hedefModel == null)
                {
                    MessageBox.Show("Seçili bileşenin belgesi yüklenemedi (baskılanmış/eksik referans olabilir).",
                        "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
            }
            else
            {
                MessageBox.Show("Etiketleme yalnızca parça veya montaj belgelerinde kullanılabilir.",
                    "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            Tanilama.Kaydet("EtiketlePaneliAc: " + hedefModel.GetPathName());
            using (var panel = new EtiketlemePaneli(hedefModel))
            {
                if (panel.ShowDialog() == DialogResult.OK)
                {
                    MessageBox.Show("Etiket kaydedildi: " + hedefModel.GetPathName(),
                        "ÜretimOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
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
