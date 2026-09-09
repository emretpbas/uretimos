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
    // Ölçülendirme BİLİNÇLİ olarak koda eklenmedi: resmi InsertModelAnnotations3
    // API'sinin bitmask parametreleri (swInsertAnnotation_e) belgelerde net
    // değil, yanlış bir bitmask ÇÖKME değil ama SESSİZ YANLIŞ/eksik ölçü
    // riski taşır. Madem zaten elle düzenleme adımı var, ölçülendirmeyi
    // SolidWorks'ün kendi "Insert > Annotations > Model Items" menüsünden
    // elle yapın — daha güvenilir, tam kontrol sizde.
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
            out string kaydedilenDwg, out string kaydedilenPdf, out string kaydedilenJpg)
        {
            kaydedilenDwg = null;
            kaydedilenPdf = null;
            kaydedilenJpg = null;
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

                return kaydedilenDwg != null || kaydedilenPdf != null || kaydedilenJpg != null;
            }
            catch (Exception ex)
            {
                Tanilama.Kaydet("AcikCizimiKaydet HATA (managed exception): " + ex);
                _uyarilar.Add("Çizim kaydedilirken hata: " + ex.Message);
                return kaydedilenDwg != null || kaydedilenPdf != null || kaydedilenJpg != null;
            }
        }

        private string FarkliKaydet(IModelDocExtension ext, string cikisKlasoru, string dosyaAdiOnEki, string uzanti, string modelYoluLog)
        {
            string dosyaAdi = System.IO.Path.Combine(cikisKlasoru, (dosyaAdiOnEki ?? "teknik_resim") + "." + uzanti);
            int hata = 0, uyari = 0;
            Tanilama.Kaydet($"SaveAs3 ({uzanti}) cagriliyor: " + dosyaAdi);
            bool basarili = ext.SaveAs3(dosyaAdi, (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, null, ref hata, ref uyari);
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
