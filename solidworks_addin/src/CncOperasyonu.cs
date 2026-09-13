using System;
using System.Collections.Generic;
using System.Linq;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // CNC OPERASYONU — kullanıcı isteği: "takım yollarından seçebildiğim ...
    // fincan yüksekliği ve 5 eksen freze ayarlarını yapabildiğim ... giriş ve
    // çıkış ayarlarını, pasoları yapabildiğim, dönüş ve ilerleme hızı
    // ayarlarını yapabildiğim" — bir parçadaki HER delik grubu/kontur, kendi
    // takımı ve kendi işleme parametreleriyle AYRI bir "operasyon" olarak
    // ele alınır (kullanıcının seçtiği "operasyon bazında" atama modeli).
    //
    // BİLEREK BURADA OLMAYAN: gerçek takım yolu (toolpath) HESAPLAMASI/G-kodu
    // — bu sınıf yalnızca operasyonları GRUPLAR ve kullanıcının atadığı
    // parametreleri TAŞIR. Postprocessor geldiğinde bu veriler G-koda çevrilir.
    // ════════════════════════════════════════════════════════════════════════
    public class CncOperasyonu
    {
        public string Id;      // sadece UI/eşleme amaçlı basit anahtar
        public string Tip;     // "delme" | "kontur"
        public string Etiket;  // örn. "Delme — Ø8.0mm (4 adet)"

        public List<DelikBilgisi> Delikler = new List<DelikBilgisi>(); // Tip=="delme" ise dolu
        public FormBilgisi Form; // Tip=="kontur" ise dolu

        // ── Kullanıcının CncOperasyonPaneli.cs'te atadığı takım/parametreler ──
        public string TakimId, TakimKodu;
        public double FincanYuksekligiMm;
        // 5 EKSEN NOTU: burada yalnızca basit "eğim/lead açısı" gibi SAYISAL
        // parametreler tutulur — gerçek 5 eksen takım ekseni hesaplaması
        // (yüzey normaline göre takım eğimi) BURADA YAPILMAZ, bkz. dosya başı.
        public double BesEksenEgimAcisiDerece;
        public string GirisStratejisi = "";  // "dikey" | "rampa" | "onceden_delik"
        public string CikisStratejisi = "";  // "dikey" | "rampa"
        public double PasoDerinligiMm;
        public int PasoSayisi;               // 0 = otomatik (toplam derinlik / paso derinliği)
        public double DevirRpm;
        public double IlerlemeMmDak;
        public double DalmaIlerlemeMmDak;     // dalma (plunge) ilerlemesi — kesme ilerlemesinden AYRI, genellikle daha düşük
    }

    // Kalıcı olarak saklanan KISIM — CncOperasyonu'nun yalnızca KULLANICI
    // tarafından atanan alanları (geometri her açılışta yeniden taranır,
    // burada TEKRAR saklanmaz). OzelAlanlar.CNC_OPERASYONLAR altında bir
    // JSON dizisi olarak tutulur, Id ile geometriden türeyen operasyona
    // (bkz. CncOperasyonlariOlustur.Olustur) eşlenir.
    public class CncOperasyonKaydi
    {
        public string Id;
        public string TakimId, TakimKodu;
        public double FincanYuksekligiMm;
        public double BesEksenEgimAcisiDerece;
        public string GirisStratejisi, CikisStratejisi;
        public double PasoDerinligiMm;
        public int PasoSayisi;
        public double DevirRpm, IlerlemeMmDak, DalmaIlerlemeMmDak;
    }

    public static class CncOperasyonlariOlustur
    {
        // Delikleri ÇAPA göre gruplar (±0.05mm tolerans içinde aynı çap sayılır)
        // — aynı takımla işlenecek delikler TEK operasyonda toplanır. Her form
        // KENDİ operasyonu olur (v1 sınırlaması: dış kontur/iç cep ayrımı
        // YAPILMAZ, bkz. DelikFormCikarici.cs — form TİPİ operatör tarafından
        // panelde elle belirlenir).
        public static List<CncOperasyonu> Olustur(List<DelikBilgisi> delikler, List<FormBilgisi> formlar)
        {
            var operasyonlar = new List<CncOperasyonu>();

            if (delikler != null && delikler.Count > 0)
            {
                var gruplar = delikler
                    .GroupBy(d => Math.Round(d.CapMm / 0.1) * 0.1)
                    .OrderBy(g => g.Key);
                foreach (var grup in gruplar)
                {
                    double cap = grup.Key;
                    var liste = grup.ToList();
                    operasyonlar.Add(new CncOperasyonu
                    {
                        Id = "OP-DELME-" + cap.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture),
                        Tip = "delme",
                        Etiket = string.Format(System.Globalization.CultureInfo.InvariantCulture,
                            "Delme — Ø{0:0.0}mm ({1} adet)", cap, liste.Count),
                        Delikler = liste
                    });
                }
            }

            if (formlar != null)
            {
                int i = 1;
                foreach (var form in formlar)
                {
                    operasyonlar.Add(new CncOperasyonu
                    {
                        Id = "OP-KONTUR-" + i,
                        Tip = "kontur",
                        Etiket = "Kontur/Cep #" + i + " (" + form.NoktalarXY.Count + " nokta)",
                        Form = form
                    });
                    i++;
                }
            }

            return operasyonlar;
        }

        // Kaydedilmiş kullanıcı parametrelerini (Id eşleşmesiyle) yeniden
        // taranan operasyon listesine uygular — geometri değişmediyse
        // (delik/form aynıysa) kullanıcı ayarları kaybolmaz.
        public static void KayitlariUygula(List<CncOperasyonu> operasyonlar, List<CncOperasyonKaydi> kayitlar)
        {
            if (operasyonlar == null || kayitlar == null) return;
            var haritalanmis = kayitlar.Where(k => !string.IsNullOrEmpty(k.Id)).ToDictionary(k => k.Id);
            foreach (var op in operasyonlar)
            {
                if (!haritalanmis.TryGetValue(op.Id, out var k)) continue;
                op.TakimId = k.TakimId;
                op.TakimKodu = k.TakimKodu;
                op.FincanYuksekligiMm = k.FincanYuksekligiMm;
                op.BesEksenEgimAcisiDerece = k.BesEksenEgimAcisiDerece;
                op.GirisStratejisi = k.GirisStratejisi ?? "";
                op.CikisStratejisi = k.CikisStratejisi ?? "";
                op.PasoDerinligiMm = k.PasoDerinligiMm;
                op.PasoSayisi = k.PasoSayisi;
                op.DevirRpm = k.DevirRpm;
                op.IlerlemeMmDak = k.IlerlemeMmDak;
                op.DalmaIlerlemeMmDak = k.DalmaIlerlemeMmDak;
            }
        }

        public static List<CncOperasyonKaydi> KayitlariCikar(List<CncOperasyonu> operasyonlar)
        {
            return (operasyonlar ?? new List<CncOperasyonu>()).Select(op => new CncOperasyonKaydi
            {
                Id = op.Id,
                TakimId = op.TakimId,
                TakimKodu = op.TakimKodu,
                FincanYuksekligiMm = op.FincanYuksekligiMm,
                BesEksenEgimAcisiDerece = op.BesEksenEgimAcisiDerece,
                GirisStratejisi = op.GirisStratejisi,
                CikisStratejisi = op.CikisStratejisi,
                PasoDerinligiMm = op.PasoDerinligiMm,
                PasoSayisi = op.PasoSayisi,
                DevirRpm = op.DevirRpm,
                IlerlemeMmDak = op.IlerlemeMmDak,
                DalmaIlerlemeMmDak = op.DalmaIlerlemeMmDak
            }).ToList();
        }
    }
}
