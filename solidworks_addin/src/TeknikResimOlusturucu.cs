using System;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // TEKNİK RESİM OLUŞTURUCU — İKİ ADIMLI akış (kullanıcı isteği: "önce
    // solidde yapsın ben düzenleyeyim, sonra onayla dwg ve pdf alsın"):
    //   1) TeknikResimAcVeDuzenlemeyeBirak: çizimi oluşturur, ŞABLONDAKİ
    //      ÖNCEDEN TANIMLI (predefined) görünüş yerlerine modeli yerleştirir,
    //      SolidWorks'te AÇIK bırakır — kaydetmez, kapatmaz.
    //   2) AcikCizimiKaydet: kullanıcı düzenlemeyi (ölçülendirme dahil)
    //      bitirip "Onayla"ya bastığında, O AN AÇIK olan çizimi hem .dwg
    //      hem .pdf olarak kaydeder — çizim İÇERİĞİNE dokunmaz.
    //
    // HİZALAMA MİMARİSİ DEĞİŞTİ (kullanıcı geri bildirimi: görünüşler antete
    // taşıyor, birbirine hizasız): önceki sürüm 4 görünüşü KODDAN, bağımsız
    // X/Y koordinatlarıyla oluşturuyordu — bu hiçbir zaman gerçek hizalama
    // (üst görünüş tam ön görünüşün üstünde, vb.) SAĞLAYAMAZ ve antetin
    // gerçek boyutunu bilmediğimiz için taşma riski hep vardı. Bunun yerine
    // resmi SolidWorks API'si InsertModelInPredefinedView kullanılıyor:
    // hizalama/yerleşim artık KODDA DEĞİL, SİZİN .drwdot ŞABLONUNUZDA
    // tanımlanır (SolidWorks'te BİR KEZ: Insert > Drawing View > Predefined
    // ile Ön/Üst/Sağ/İzometrik için doğru hizalı, antetten uzak 4 boş
    // görünüş yeri yerleştirip şablonu kaydedin). Bu API o boş yerlere
    // modeli otomatik doldurur — SİZİN yerleştirdiğiniz konumda kalır.
    //
    // ÖLÇÜLENDİRME (kullanıcı isteği: "teknik resim otomatik ölçülendirme
    // ile gelsin resimdeki gibi"): SolidWorks'ün "Insert > Annotations >
    // Model Items" menü komutuyla AYNI, resmi IDrawingDoc.InsertModelAnnotations3
    // API'si kullanılıyor. İLK sürüm bu üyeyi 'dynamic' ile (hangi arayüzde
    // olduğundan emin olunamadığı için) üç ayrı aday nesnede deneyip 5
    // parametreyle çağırıyordu — GERÇEK ÇALIŞMA ZAMANI HATASI (yerel günlük:
    // "__ComObject ... Geçersiz dizin 0x8002000B DISP_E_BADINDEX") bunun
    // YANLIŞ olduğunu kanıtladı. Yerel interop DLL'inden YANSIMA (reflection)
    // ile okunan GERÇEK imza artık doğrudan, TİPLİ çağrılıyor: üye yalnızca
    // IDrawingDoc'ta var (Extension/ModelDoc2'de YOK), 6 parametre alıyor
    // (5 değil) ve bool DEĞİL bir object (eklenen annotation DİZİSİ) döner —
    // başarı artık dizinin boş olup olmamasına bakılarak değerlendirilir.
    //
    // YEDEK (kullanıcı isteği: "SWOOD panellerinde ölçüler çoğu zaman
    // denklem/global değişkenle sürülüyor, model ölçüleri az/dağınık
    // gelebilir"): InsertModelAnnotations3 hiç annotation eklemezse,
    // IDrawingDoc.AutoDimension her görünüş AYRI AYRI seçilerek denenir —
    // bu, dış ölçüleri (en/boy) model ölçülerinden bağımsız koyar. İLK sürüm
    // tüm parametreleri 0 ile çağırıyordu — yerel interop swconst'tan
    // YANSIMA ile okunan GERÇEK enum değerleri bunun İKİ YÖNDEN yanlış
    // olduğunu kanıtladı: Scheme/Placement 0 ilgili enum'larda (swAutodimScheme_e
    // 1-4, swAutodimHorizontal/VerticalPlacement_e ±1) GEÇERSİZ olduğundan her
    // çağrı swAutodimStatusBadOptionValue ile reddediliyordu, ÜSTÜNE ÜSTLÜK
    // başarı kodu (swAutodimStatusSuccess=0) "!= 0" ile YANLIŞ yönde
    // yorumlanıyordu. Artık gerçek enum değerleriyle çağrılıp dönen kod
    // swAutodimStatusSuccess'e eşitlenerek değerlendiriliyor. Her iki yol da
    // başarısız olursa elle düzenleme adımı (zaten var olan "1) Oluştur →
    // düzenle → 2) Onayla"
    // akışı) her durumda bir güvenlik ağı olarak kalır.
    // ════════════════════════════════════════════════════════════════════════
    public class TeknikResimOlusturucu
    {
        private readonly ISldWorks _app;
        private readonly List<string> _uyarilar = new List<string>();
        public IReadOnlyList<string> Uyarilar => _uyarilar;

        public TeknikResimOlusturucu(ISldWorks app) { _app = app; }

        // ADIM 1 — çizimi oluşturur, ŞABLONDAKİ önceden tanımlı görünüş
        // yerlerine modeli yerleştirir, AÇIK BIRAKIR (save/close YOK).
        // sablonYolu'ndaki .drwdot dosyasında ÖNCEDEN (SolidWorks UI'ında,
        // Insert > Drawing View > Predefined ile) tanımlanmış görünüş
        // yerleri OLMALI — yoksa InsertModelInPredefinedView hiçbir görünüş
        // eklemez (aşağıdaki uyarı bunu bildirir).
        public bool TeknikResimAcVeDuzenlemeyeBirak(string modelYolu, string sablonYolu)
        {
            Tanilama.Kaydet($"TeknikResimAcVeDuzenlemeyeBirak basladi: model={modelYolu}, sablon={sablonYolu}");
            try
            {
                Tanilama.Kaydet("NewDocument cagriliyor");
                var cizimBelge = (IModelDoc2)_app.NewDocument(sablonYolu, (int)swDwgPaperSizes_e.swDwgPaperA3size, 0.42, 0.297);
                Tanilama.Kaydet("NewDocument tamamlandi, cizimBelge null mu=" + (cizimBelge == null));
                if (cizimBelge == null)
                {
                    _uyarilar.Add($"'{sablonYolu}' şablonundan çizim oluşturulamadı — yol doğru mu?");
                    return false;
                }

                var cizim = (IDrawingDoc)cizimBelge;

                Tanilama.Kaydet("InsertModelInPredefinedView cagriliyor");
                bool eklendi = cizim.InsertModelInPredefinedView(modelYolu);
                Tanilama.Kaydet("InsertModelInPredefinedView tamamlandi, eklendi=" + eklendi);

                if (!eklendi)
                {
                    _uyarilar.Add(
                        "Model, şablondaki önceden tanımlı görünüş yerlerine eklenemedi. " +
                        "Şablonunuzda (.drwdot) Insert > Drawing View > Predefined ile " +
                        "Ön/Üst/Sağ/İzometrik görünüş yerleri tanımlanmış mı kontrol edin.");
                    return false;
                }

                // Kullanıcı isteği: "teknik resim otomatik ölçülendirme ile
                // gelsin" — bkz. yukarıdaki sınıf başlığı notu (dürüstlük).
                // GERÇEK HATA (yerel günlük, 11:15/11:21): yukarıdaki 'dynamic'
                // + 5-parametreli çağrı her denemede "__ComObject ... Geçersiz
                // dizin (0x8002000B DISP_E_BADINDEX)" ile başarısız oluyordu.
                // Yerel interop DLL'inden YANSIMA (reflection) ile okunan
                // GERÇEK imza (TAHMİN değil): IDrawingDoc.InsertModelAnnotations3
                // (Option, Types, AllViews, DuplicateDims, HiddenFeatureDims,
                // UsePlacementInSketch) → object (eklenen annotation dizisi) —
                // 5 DEĞİL 6 parametre alıyor VE bool DEĞİL object döndürüyor;
                // ayrıca bu üye IModelDocExtension/IModelDoc2'de YOK, yalnızca
                // IDrawingDoc'ta var. 'dynamic' ile üç aday nesneyi (Extension/
                // IDrawingDoc/ModelDoc2) sırayla deneyip EN ÇOK Extension/
                // ModelDoc2'de YANLIŞ üye arayan, DOĞRU tek ev sahibine
                // (IDrawingDoc — zaten typed 'cizim' değişkeni) YANLIŞ sayıda
                // argümanla seslenen bir kod buydu; artık doğrudan, TİPLİ
                // olarak çağrılıyor — 'dynamic' GEÇ BAĞLAMAYA gerek kalmadı.
                object olculendirmeSonucu = null;
                try
                {
                    // "swInsertDimensionsMarkedForDrawing" TEK BAŞINA yalnızca
                    // modelde ELLE "mark for drawing" işaretlenmiş ölçüleri
                    // getirir — kullanıcıların neredeyse hiçbiri bu işaretlemeyi
                    // yapmaz, bu yüzden çağrı BAŞARILI dönüp GÖRÜNMEZ SIFIR ölçü
                    // eklerdi (sessiz başarısızlık). "NotMarkedForDrawing" ile
                    // BİRLİKTE (bit bayrağı OR'lanarak) verilince modeldeki TÜM
                    // ölçüler gelir — "Insert > Annotations > Model Items"
                    // menüsünde "Ölçüler" işaretliyken varsayılan davranış budur.
                    // UsePlacementInSketch=true: SWOOD gibi denklem/global
                    // değişken sürümlü panellerde (bkz. EquationsOlcuOku) ölçü
                    // yerleşimi skeçteki konumu esas alsın diye.
                    olculendirmeSonucu = cizim.InsertModelAnnotations3(
                        (int)swImportModelItemsSource_e.swImportModelItemsFromEntireModel,
                        (int)swInsertAnnotation_e.swInsertDimensionsMarkedForDrawing
                            | (int)swInsertAnnotation_e.swInsertDimensionsNotMarkedForDrawing,
                        true, false, false, true);
                }
                catch (Exception ex)
                {
                    Tanilama.Kaydet("InsertModelAnnotations3 basarisiz: " + ex.Message);
                }
                var eklenenler = olculendirmeSonucu as object[];
                bool olculendirildi = eklenenler != null && eklenenler.Length > 0;
                Tanilama.Kaydet(olculendirildi
                    ? $"InsertModelAnnotations3 basarili: {eklenenler.Length} annotation eklendi"
                    : "InsertModelAnnotations3 hicbir annotation eklemedi (model ölçüleri boş/dağınık olabilir — bkz. AutoDimension yedeği)");

                // YEDEK (kullanıcı isteği: "model ölçüleri az veya dağınık
                // gelebilir... dönen dizi boşsa yedek olarak AutoDimension
                // çağrılabilir, bu dış ölçüleri model ölçülerinden bağımsız
                // koyar"). İLK sürüm tüm parametreleri 0 ile çağırıp sonucu
                // "!= 0 ise başarılı" sayıyordu — yerel interop swconst'tan
                // YANSIMA ile okunan GERÇEK enum değerleri bunun İKİ YÖNDEN
                // yanlış olduğunu kanıtladı: Scheme 0 swAutodimScheme_e'de
                // GEÇERSİZ (1-4 arası), Placement 0 swAutodimHorizontal/
                // VerticalPlacement_e'de GEÇERSİZ (±1) — bu yüzden her çağrı
                // swAutodimStatusBadOptionValue (=1) ile REDDEDİLİYORDU; ÜSTÜNE
                // ÜSTLÜK başarı kodu swAutodimStatusSuccess=0 İKEN "!= 0"
                // kontrolü bunu BAŞARISIZLIK sayıyordu (tam tersi). Artık
                // gerçek enum değerleriyle çağrılıp dönen kod
                // swAutodimStatusSuccess'e eşitlenerek değerlendiriliyor.
                if (!olculendirildi)
                {
                    // GERÇEK HATA (yerel interop swconst'tan reflection ile
                    // okundu): 0,0,0,0,0 İKİ YÖNDEN yanlıştı — (1) Scheme 0
                    // swAutodimScheme_e'de GEÇERSİZ (1-4 arası), Placement 0
                    // swAutodimHorizontalPlacement_e/Vertical'da GEÇERSİZ
                    // (±1) olduğundan her çağrı swAutodimStatusBadOptionValue
                    // (=1) ile reddediliyordu; (2) başarı kodu 0
                    // (swAutodimStatusSuccess) iken "!= 0" kontrolü bunu
                    // BAŞARISIZLIK sayıyordu — tam tersi. Artık gerçek enum
                    // değerleriyle çağrılıp dönen kod swAutodimStatusSuccess'e
                    // eşitlenerek değerlendiriliyor; başarısızsa durum kodu
                    // loglanıyor.
                    int otomatikOlculendirilenGorunus = 0;
                    var sayfaGorunusu = cizim.GetFirstView() as IView;
                    var v = sayfaGorunusu?.GetNextView() as IView;
                    while (v != null)
                    {
                        try
                        {
                            bool secildi = cizimBelge.Extension.SelectByID2(v.Name, "DRAWINGVIEW", 0, 0, 0, false, 0, null, 0);
                            int durum = secildi ? cizim.AutoDimension(
                                (int)swAutodimEntities_e.swAutodimEntitiesAll,
                                (int)swAutodimScheme_e.swAutodimSchemeBaseline,
                                (int)swAutodimHorizontalPlacement_e.swAutodimHorizontalPlacementBelow,
                                (int)swAutodimScheme_e.swAutodimSchemeBaseline,
                                (int)swAutodimVerticalPlacement_e.swAutodimVerticalPlacementLeft)
                                : (int)swAutodimStatus_e.swAutodimStatusBadOptionValue;
                            if (durum == (int)swAutodimStatus_e.swAutodimStatusSuccess)
                                otomatikOlculendirilenGorunus++;
                            else
                                Tanilama.Kaydet($"AutoDimension basarisiz ({v.Name}): durum={durum}, secildi={secildi}");
                        }
                        catch (Exception ex)
                        {
                            Tanilama.Kaydet($"AutoDimension denemesi basarisiz ({v.Name}): {ex.Message}");
                        }
                        v = v.GetNextView() as IView;
                    }
                    Tanilama.Kaydet($"AutoDimension yedegi: {otomatikOlculendirilenGorunus} gorunuste dis olcu basarili");
                    olculendirildi = otomatikOlculendirilenGorunus > 0;
                }

                if (!olculendirildi)
                    _uyarilar.Add("Otomatik ölçülendirme eklenemedi — Insert > Annotations > Model Items ile elle ekleyebilirsiniz.");

                Tanilama.Kaydet("ViewZoomtofit2 cagriliyor");
                cizimBelge.ViewZoomtofit2();
                Tanilama.Kaydet("ViewZoomtofit2 tamamlandi - cizim ACIK birakildi (kapatilmadi/kaydedilmedi)");
                return true;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("TeknikResimAcVeDuzenlemeyeBirak HATA (managed exception): " + ex);
                _uyarilar.Add($"'{modelYolu}' için teknik resim oluşturulurken hata: {ex.Message}");
                return false;
            }
        }

        // ADIM 2 — ŞU AN AÇIK olan (kullanıcının elle düzenlediği) çizim
        // belgesini hem .dwg hem .pdf HEM .jpg olarak kaydeder. dwgYolu'nun
        // klasörü ve dosya adı (uzantısız) esas alınır, diğer 2 format AYNI
        // ada farklı uzantıyla aynı klasöre yazılır. JPG, kullanıcının
        // istediği çok sayfalı Excel/PDF RAPORUNA (bkz. RaporOlusturucu.cs)
        // gömülecek görüntü — "bu jpegleri onayladığım teknik resimlerden
        // oluştur" isteği burada karşılanıyor: JPG, tam olarak bu onay
        // anındaki (kullanıcının elle düzenlediği) çizimden üretiliyor.
        // Çizim KAPATILMAZ.
        public bool AcikCizimiKaydet(IModelDoc2 cizimBelge, string dwgYolu,
            out string kaydedilenDwg, out string kaydedilenPdf, out string kaydedilenJpg, out string kaydedilenDxf)
        {
            kaydedilenDwg = null;
            kaydedilenPdf = null;
            kaydedilenJpg = null;
            kaydedilenDxf = null;
            Tanilama.Kaydet("AcikCizimiKaydet basladi: " + dwgYolu);
            try
            {
                var ext = (IModelDocExtension)cizimBelge.Extension;
                string klasor = System.IO.Path.GetDirectoryName(dwgYolu);
                string adOnEki = System.IO.Path.GetFileNameWithoutExtension(dwgYolu);
                string baslikLog = cizimBelge.GetPathName();

                kaydedilenDwg = FarkliKaydet(ext, klasor, adOnEki, "dwg", baslikLog);
                kaydedilenPdf = FarkliKaydet(ext, klasor, adOnEki, "pdf", baslikLog);
                kaydedilenJpg = FarkliKaydet(ext, klasor, adOnEki, "jpg", baslikLog);
                // Kullanıcı isteği: "gerekli dxf dwg ve pdf oluşup yüklensin" —
                // CNC/lazer kesim gibi dış akışlar genelde DXF ister; diğer
                // üçüyle AYNI SaveAs3 tabanlı yardımcıyla üretilir.
                kaydedilenDxf = FarkliKaydet(ext, klasor, adOnEki, "dxf", baslikLog);

                return kaydedilenDwg != null || kaydedilenPdf != null || kaydedilenJpg != null || kaydedilenDxf != null;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("AcikCizimiKaydet HATA (managed exception): " + ex);
                _uyarilar.Add("Çizim kaydedilirken hata: " + ex.Message);
                return kaydedilenDwg != null || kaydedilenPdf != null || kaydedilenJpg != null || kaydedilenDxf != null;
            }
        }

        // ── MONTAJ ŞEMASI (YENİ) — kullanıcı isteği: "önce parça ve alt
        // montajdaki tüm parçaları listeleyen, sonra montaj aşamalarını
        // BENİM YAPTIĞIM explode sırasına göre çizsin, yine ben onaylayıp
        // düzenleyeyim". Parça listesi zaten KesimListesiCikarici'den geliyor
        // (bkz. SwAddin.cs:MontajSemasiOlusturCalistir → RaporOlusturucu'nun
        // "Genel" sayfası). BURADAKİ İŞ sadece görsel: montajın patlatılmış
        // (exploded) durumunu çizime aktarmak.
        //
        // BİLİNÇLİ SINIR: SolidWorks'ün patlatılmış görünüm ADIMLARINI
        // (hangi parça hangi sırada, ne kadar hareket ediyor) tek tek okuyup
        // yeniden oynatan API (IExplodedView/IExplodeStep ailesi) resmi
        // dokümantasyon bu ortamda doğrulanamadığından KULLANILMADI — yanlış
        // bir varsayım burada ÇÖKME riski taşımasa da (güçlü tipli COM
        // interop, yanlış üye adı derleme hatası verir, çalışma zamanı
        // çökmesi değil) SESSİZCE YANLIŞ bir sahne üretebilirdi. Onun yerine
        // yalnızca resmi, belgelenmiş IView.ShowExploded özelliği kullanılır:
        // bu, SİZİN SolidWorks'te ZATEN oluşturduğunuz patlatılmış görünümü
        // olduğu gibi çizime yansıtır — TAHMİN ETMEZ, sadece VARSA gösterir.
        // Aşamaların ince ayarı (hangi görünüşte hangi patlatma adımı
        // durdurulacak, balon/numara yerleşimi vb.) her zamanki gibi "elle
        // düzenle" adımında SİZİN kontrolünüzde kalır.
        public bool MontajSemasiAcVeDuzenlemeyeBirak(string modelYolu, string sablonYolu)
        {
            Tanilama.Kaydet($"MontajSemasiAcVeDuzenlemeyeBirak basladi: model={modelYolu}, sablon={sablonYolu}");
            try
            {
                Tanilama.Kaydet("NewDocument cagriliyor");
                var cizimBelge = (IModelDoc2)_app.NewDocument(sablonYolu, (int)swDwgPaperSizes_e.swDwgPaperA3size, 0.42, 0.297);
                Tanilama.Kaydet("NewDocument tamamlandi, cizimBelge null mu=" + (cizimBelge == null));
                if (cizimBelge == null)
                {
                    _uyarilar.Add($"'{sablonYolu}' şablonundan çizim oluşturulamadı — yol doğru mu?");
                    return false;
                }

                var cizim = (IDrawingDoc)cizimBelge;

                Tanilama.Kaydet("InsertModelInPredefinedView cagriliyor");
                bool eklendi = cizim.InsertModelInPredefinedView(modelYolu);
                Tanilama.Kaydet("InsertModelInPredefinedView tamamlandi, eklendi=" + eklendi);

                if (!eklendi)
                {
                    _uyarilar.Add(
                        "Model, şablondaki önceden tanımlı görünüş yerlerine eklenemedi. " +
                        "Şablonunuzda (.drwdot) Insert > Drawing View > Predefined ile " +
                        "Ön/Üst/Sağ/İzometrik görünüş yerleri tanımlanmış mı kontrol edin.");
                    return false;
                }

                // Eklenen HER görünüşü, mümkünse, montajın kendi patlatılmış
                // durumunda göstermeyi dener. GetFirstView() sayfanın KENDİSİNİ
                // döndürür (resmi API deseni) — ilk gerçek model görünüşü
                // GetNextView()'dan başlar. Bir görünüşte başarısız olmak
                // (ör. o yöndeki görünüşte patlatma anlamsızsa) diğerlerini
                // ETKİLEMEZ — her biri kendi try/catch'inde.
                int patlatilanSayisi = 0, denenenSayisi = 0;
                var sayfaGorunusu = cizim.GetFirstView() as IView;
                var v = sayfaGorunusu?.GetNextView() as IView;
                while (v != null)
                {
                    denenenSayisi++;
                    try
                    {
                        // GERÇEK SolidWorks 2025 derlemesinde ortaya çıktı: ShowExploded
                        // bu interop sürümünde PROPERTY değil, bool parametreli bir
                        // METOT (CS1656 "method group" hatası bunu doğruladı).
                        v.ShowExploded(true);
                        patlatilanSayisi++;
                        Tanilama.Kaydet("Gorunus patlatildi: " + v.Name);
                    }
                    catch (Exception ex)
                    {
                        Tanilama.Kaydet("Gorunus patlatilamadi (" + v.Name + "): " + ex.Message);
                    }
                    v = v.GetNextView() as IView;
                }
                Tanilama.Kaydet($"Patlatma denemesi bitti: {patlatilanSayisi}/{denenenSayisi} basarili");

                if (patlatilanSayisi == 0)
                {
                    _uyarilar.Add(
                        "Hiçbir görünüş patlatılmış duruma geçirilemedi — montajda kayıtlı bir " +
                        "patlatılmış görünüm (exploded view) bulunamamış olabilir. Çizim normal/toplanmış " +
                        "görünüşle açıldı; SolidWorks'te montajı önce patlatıp (Insert > Exploded View) " +
                        "tekrar deneyin, ya da çizimdeki görünüşe sağ tıklayıp 'Show In Exploded State' ile " +
                        "elle açın.");
                }

                Tanilama.Kaydet("ViewZoomtofit2 cagriliyor");
                cizimBelge.ViewZoomtofit2();
                Tanilama.Kaydet("ViewZoomtofit2 tamamlandi - cizim ACIK birakildi (kapatilmadi/kaydedilmedi)");
                return true;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("MontajSemasiAcVeDuzenlemeyeBirak HATA (managed exception): " + ex);
                _uyarilar.Add($"'{modelYolu}' için montaj şeması oluşturulurken hata: {ex.Message}");
                return false;
            }
        }

        private string FarkliKaydet(IModelDocExtension ext, string cikisKlasoru, string dosyaAdiOnEki, string uzanti, string modelYoluLog)
        {
            string dosyaAdi = System.IO.Path.Combine(cikisKlasoru, (dosyaAdiOnEki ?? "teknik_resim") + "." + uzanti);
            int hata = 0, uyari = 0;
            Tanilama.Kaydet($"SaveAs3 ({uzanti}) cagriliyor: " + dosyaAdi);
            // NOT: SolidWorks 2017'de IModelDocExtension.SaveAs3 6 parametreli
            // (Name, Version, Options, ExportData, ref Errors, ref Warnings) —
            // gerçek derlemede (SolidWorks 2017) doğrulandı, bkz. AltiYuzKutuOlusturucu.cs.
            bool basarili = ext.SaveAs3(dosyaAdi, (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref hata, ref uyari);
            Tanilama.Kaydet($"SaveAs3 ({uzanti}) tamamlandi, basarili=" + basarili + ", hata=" + hata);
            if (!basarili)
            {
                _uyarilar.Add($"'{modelYoluLog}' → {uzanti.ToUpperInvariant()} kaydedilemedi (SaveAs3 hata kodu: {hata}).");
                return null;
            }
            return dosyaAdi;
        }
    }
}
