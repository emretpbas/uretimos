using System;
using System.Collections.Generic;
using System.Linq;

namespace UretimOSKesim
{
    // Nesting'e verilecek TEK bir parça tanımı (adet > 1 ise o kadar kopya
    // ayrı ayrı yerleştirilir — page_nesting.js'teki nestParcalar/items ile
    // AYNI mantık).
    public class NestingParcaGirdi
    {
        public string Ad;
        public double En, Boy; // mm
        public int Adet = 1;
        public bool GrainKilitli; // true ise ASLA döndürülmez (desen/tahıl yönü)
        // Nesting Ayarları penceresindeki parça listesinden PARÇA BAŞINA
        // yönlendirme (kullanıcı isteği: "her satırda grain yönüne uy
        // kutucuğu ve sabit açı kullan kutucuğu"). null ise Hesapla'ya
        // verilen genel ayar kullanılır.
        public bool? GrainYonuneUy;
        public bool? SabitAciKullan;
        public double SabitAciDerece;
        // Yalnızca pencerede gösterim için.
        public double KalinlikMm;
        public string Grup;
        public string YmKod;
        // Kullanıcı isteği: "nestingdeki parçanın üzerine yarımamül kodu ve
        // adı, ayrıca solidworks parça adını da yazalım" — etiket sketch'i için.
        public string SwParcaAdi;
        // Parçanın KENDİ (döndürülmemiş) yerel çerçevesinde, sol-alt (0,0)
        // referanslı delik merkezleri + çapı (mm) — page_nesting.js'teki
        // satir.delikler ile AYNI veri şekli (bkz. buildDxf/delikKoordDonustur).
        public List<(double x, double y, double cap)> Delikler = new List<(double, double, double)>();
        // Kullanıcı isteği: "ne delik ne kanal çıktı" — dairesel OLMAYAN
        // formlar (cep/kesik/kanal — bkz. DelikFormCikarici.FormBilgisi).
        // Her form, parçanın KENDİ yerel çerçevesinde kapalı bir nokta
        // dizisidir (ilk nokta son noktaya KAPANMALI — çağıran ekler).
        public List<List<(double x, double y)>> Formlar = new List<List<(double, double)>>();
        // Kullanıcı isteği: "parçanın gerçek dış hattını çiz" — parçanın
        // kenarına işlenmiş kertik/çentik gibi DÜZENSİZ dış sınırı (bkz.
        // DelikFormCikarici.GeometriCikar). Boş ise (çıkarım yapılmadı/
        // başarısız) nesting çıktısında düz bir dikdörtgene (En×Boy) GERİ
        // DÜŞÜLÜR — bu TAHMİN DEĞİL, açık bir varsayılan davranıştır.
        public List<(double x, double y)> DisHat = new List<(double, double)>();
    }

    // Bir plaka üzerinde yerleşmiş TEK bir parça örneği (kesilmiş kopya).
    public class NestingYerlesimOgesi
    {
        public string Ad;
        public double X, Y;   // mm, plakanın sol-alt köşesinden, kenar boşluğu DAHİL mutlak konum
        public double W, H;   // mm, yerleşmiş (döndürülmüş) halin sınırlayıcı kutusu
        public bool Rotated;  // AciDerece != 0
        // Parçanın plakadaki dönüş açısı (derece, saat yönünün TERSİ pozitif)
        // ve döndürülmemiş ölçüsü + plakadaki merkezi — etiket yazısını
        // parçanın uzun kenarına paralel yazıp sığdırmak için.
        public double AciDerece;
        public double ParcaEn, ParcaBoy;
        public double MerkezX, MerkezY;
        public string YmKod;
        public string SwParcaAdi;
        // Delik merkezleri, PLAKANIN mutlak koordinat sisteminde (X,Y'ye göre
        // ZATEN ofsetlenmiş) + çapı (mm) — rotated ise page_nesting.js'teki
        // delikKoordDonustur ile AYNI dönüşüm (dx,dy)->(dy, origW-dx) uygulanır.
        public List<(double x, double y, double cap)> Delikler = new List<(double, double, double)>();
        // Formlar, AYNI şekilde plakanın mutlak koordinatına dönüştürülmüş
        // (rotasyon dahil) kapalı nokta dizileri.
        public List<List<(double x, double y)>> Formlar = new List<List<(double, double)>>();
        // Plakanın mutlak koordinatına dönüştürülmüş GERÇEK dış hat (varsa) —
        // boşsa W×H dikdörtgenine geri düşülür (bkz. NestingParcaGirdi.DisHat).
        public List<(double x, double y)> DisHat = new List<(double, double)>();
    }

    public class NestingPlakaSonucu
    {
        public List<NestingYerlesimOgesi> Yerlesenler = new List<NestingYerlesimOgesi>();
    }

    public class NestingSonucu
    {
        public List<NestingPlakaSonucu> Plakalar = new List<NestingPlakaSonucu>();
        // Hiçbir plakaya sığmayan parça/parçalar olursa buraya açıklama eklenir
        // (TAHMİN EDİLMEZ/zorla sıkıştırılmaz — bkz. page_nesting.js AYNI davranış).
        public List<string> YerlesemeyenUyarilari = new List<string>();
    }

    // ════════════════════════════════════════════════════════════════════════
    // NESTİNG ALGORİTMASI — page_nesting.js'teki nestParcalar/packOnePlaka
    // (SKYLINE bottom-left bin packing, "CNC/Flat-Tabla" modu) ile BİREBİR
    // AYNI mantığın C# portu. Kullanıcı isteği: "solidde oluşturup
    // düzenleyip dxf alacağız optimize edilmiş nesting çıktısını" —
    // hesaplama artık burada (C#) yapılıyor, ama SONUÇ web'deki ALGORİTMA
    // İLE TUTARLI olsun diye mantık KASITLI OLARAK değiştirilmedi, satır
    // satır çevrildi (bkz. page_nesting.js satır ~511-651).
    //
    // TEK YÜZEY KURALI (AYNI, bkz. page_nesting.js dosya başı notu): parça
    // yalnızca DÖNDÜRÜLÜR, ASLA ayna/flip edilmez — bir delik hangi yönde
    // yerleşirse yerleşsin HER ZAMAN plakanın aynı (üst) yüzeyinde kalır.
    //
    // YÖNLENDİRME (kullanıcı isteği: "grain kutucuğu işaretli olduğunda
    // parçanın boy tarafı plakanın boy tarafına hizalı olsun, işaret
    // kaldırıldığında her türlü açı ve yerleşim; açı kutucuğu aktifse girilen
    // açıya göre yerleşsin"):
    //   - GrainKilitli (parçada URETIMOS_TAHIL_YONU dolu) → her modda 0°.
    //   - sabitAciDerece verilmişse → diğer tüm parçalar o açıyla.
    //   - grainYonuneUy → parçanın UZUN kenarı plakanın Boy (Y) eksenine.
    //   - ikisi de yoksa → 0° ve 90° denenir, daha alttaki/soldaki seçilir.
    //     (Skyline yerleştirici sınırlayıcı kutu ile çalıştığı için 180°/270°
    //     0°/90° ile AYNI kutuyu verir — ayrıca denenmez.)
    // Plaka koordinatı: X = plaka En, Y = plaka Boy (bkz. NestingYerlesim-
    // Olusturucu'daki plaka dikdörtgeni).
    // ════════════════════════════════════════════════════════════════════════
    public static class NestingHesaplayici
    {
        private class Item
        {
            public string Ad; public double W, H; public bool GrainKilitli; public string YmKod; public string SwParcaAdi;
            public bool GrainYonuneUy; public double? SabitAci; // genel ayar + parça ayarı birleşmiş hali
            // OrigW: rotated=true olduğunda delik koordinatlarını doğru
            // dönüştürebilmek için parçanın orijinal (döndürülmemiş) genişliği
            // (page_nesting.js'teki item.origW ile AYNI amaç).
            public double OrigW;
            public List<(double x, double y, double cap)> Delikler;
            public List<List<(double x, double y)>> Formlar;
            public List<(double x, double y)> DisHat;
        }

        // Bir parçanın tek bir dönüş açısındaki hali: döndürülmüş En×Boy
        // dikdörtgeninin sınırlayıcı kutusu (W×H) ve kutuyu (0,0)'a oturtmak
        // için gereken kaydırma (MinX/MinY).
        private class Yon
        {
            public double Aci, W, H, MinX, MinY;
        }

        private class Placed
        {
            public Item Item; public double X, Y; public Yon Yon;
        }

        private class SkylineSeg { public double X0, X1, Y; }

        // 90'ın katlarında sin/cos'u TAM değerle kullanır — kayan nokta
        // artıkları (ör. 6e-17) koordinatlara sızmasın, eski 90° dönüşümüyle
        // (dx,dy)->(dy, origW-dx) birebir aynı sonuç çıksın.
        private static (double x, double y) Dondur(double x, double y, double aciDerece)
        {
            double a = ((aciDerece % 360) + 360) % 360;
            if (Math.Abs(a) < 1e-9) return (x, y);
            if (Math.Abs(a - 90) < 1e-9) return (-y, x);
            if (Math.Abs(a - 180) < 1e-9) return (-x, -y);
            if (Math.Abs(a - 270) < 1e-9) return (y, -x);
            double r = a * Math.PI / 180.0, c = Math.Cos(r), s = Math.Sin(r);
            return (x * c - y * s, x * s + y * c);
        }

        private static Yon YonHesapla(double en, double boy, double aciDerece)
        {
            var koseler = new[] { Dondur(0, 0, aciDerece), Dondur(en, 0, aciDerece), Dondur(en, boy, aciDerece), Dondur(0, boy, aciDerece) };
            double minX = koseler.Min(k => k.x), minY = koseler.Min(k => k.y);
            return new Yon
            {
                Aci = aciDerece,
                MinX = minX, MinY = minY,
                W = koseler.Max(k => k.x) - minX,
                H = koseler.Max(k => k.y) - minY
            };
        }

        private static List<Yon> AdayYonler(Item item)
        {
            if (item.GrainKilitli) return new List<Yon> { YonHesapla(item.W, item.H, 0) };
            if (item.SabitAci.HasValue) return new List<Yon> { YonHesapla(item.W, item.H, item.SabitAci.Value) };
            // -90: eski yerleştiricinin 90° dönüşüyle AYNI yön (saat yönünde).
            if (item.GrainYonuneUy) return new List<Yon> { YonHesapla(item.W, item.H, item.W > item.H + 0.001 ? -90 : 0) };
            return new List<Yon> { YonHesapla(item.W, item.H, 0), YonHesapla(item.W, item.H, -90) };
        }

        public static NestingSonucu Hesapla(double plakaEn, double plakaBoy, double kenarBosluk, double kesimPayi, List<NestingParcaGirdi> parcalar,
            bool grainYonuneUy = false, double? sabitAciDerece = null)
        {
            var items = new List<Item>();
            foreach (var p in parcalar)
            {
                bool grain = p.GrainYonuneUy ?? grainYonuneUy;
                double? sabitAci = p.SabitAciKullan.HasValue
                    ? (p.SabitAciKullan.Value ? p.SabitAciDerece : (double?)null)
                    : sabitAciDerece;
                for (int k = 0; k < Math.Max(1, p.Adet); k++)
                    items.Add(new Item { Ad = p.Ad, W = p.En, H = p.Boy, GrainKilitli = p.GrainKilitli, GrainYonuneUy = grain, SabitAci = sabitAci, YmKod = p.YmKod, SwParcaAdi = p.SwParcaAdi, OrigW = p.En, Delikler = p.Delikler, Formlar = p.Formlar, DisHat = p.DisHat });
            }
            items = items.OrderByDescending(i => i.W * i.H).ToList();

            double usableW = plakaEn - 2 * kenarBosluk;
            double usableH = plakaBoy - 2 * kenarBosluk;

            var sonuc = new NestingSonucu();
            if (usableW <= 0 || usableH <= 0)
            {
                sonuc.YerlesemeyenUyarilari.Add("Plaka boyutu, kenar boşluğu çıkarıldıktan sonra kullanılamaz hale geliyor (plaka çok küçük / kenar boşluğu çok büyük).");
                return sonuc;
            }

            var kalan = new List<Item>(items);
            while (kalan.Count > 0)
            {
                // Bıçak payı her parçanın sağına/üstüne ekleniyor (PackOnePlaka) —
                // plaka kenarına dayanan SON parçanın arkasında kesilecek komşu
                // olmadığı için bu pay kullanılabilir alana eklenir; aksi halde
                // kenar boşluğuna tam sığan parça "sığmadı" sayılıyordu.
                var (placed, remaining) = PackOnePlaka(usableW + kesimPayi, usableH + kesimPayi, kalan, kesimPayi);
                if (placed.Count == 0)
                {
                    sonuc.YerlesemeyenUyarilari.Add(kalan.Count + " parça kopyası hiçbir plakaya sığmadı (plaka veya parça ölçüsünü, ya da kenar boşluğu/kesim payını kontrol edin).");
                    break;
                }
                var plaka = new NestingPlakaSonucu();
                foreach (var pl in placed)
                {
                    double mutlakX = pl.X + kenarBosluk, mutlakY = pl.Y + kenarBosluk;
                    var yon = pl.Yon;
                    // Parçanın yerel noktası (x,y) → açıyla döndür → kutuyu
                    // (0,0)'a oturt → plakadaki mutlak konuma (kenar boşluğu
                    // dahil) ofsetle. -90°'de page_nesting.js'teki
                    // delikKoordDonustur ile AYNI sonuç: (dx,dy) -> (dy, origW-dx).
                    (double x, double y) Donustur(double x, double y)
                    {
                        var (rx, ry) = Dondur(x, y, yon.Aci);
                        return (mutlakX + rx - yon.MinX, mutlakY + ry - yon.MinY);
                    }
                    var delikler = (pl.Item.Delikler ?? new List<(double, double, double)>())
                        .Select(d =>
                        {
                            var (x, y) = Donustur(d.x, d.y);
                            return (x, y, cap: d.cap);
                        })
                        .ToList();
                    var formlar = (pl.Item.Formlar ?? new List<List<(double, double)>>())
                        .Select(form => form.Select(nokta => Donustur(nokta.x, nokta.y)).ToList())
                        .ToList();
                    var disHat = (pl.Item.DisHat ?? new List<(double, double)>())
                        .Select(nokta => Donustur(nokta.x, nokta.y))
                        .ToList();
                    // Dış hat çıkarılamadıysa çizici W×H kutusunu dikdörtgen
                    // olarak çizer — 90'ın katı OLMAYAN açıda bu kutu parçanın
                    // kendisi değildir, bu yüzden döndürülmüş En×Boy
                    // dikdörtgeninin 4 köşesi dış hat olarak verilir.
                    bool dikAci = Math.Abs(Math.IEEERemainder(yon.Aci, 90)) < 1e-9;
                    if (disHat.Count < 3 && !dikAci)
                        disHat = new List<(double x, double y)> { Donustur(0, 0), Donustur(pl.Item.W, 0), Donustur(pl.Item.W, pl.Item.H), Donustur(0, pl.Item.H) };
                    var merkez = Donustur(pl.Item.W / 2.0, pl.Item.H / 2.0);
                    plaka.Yerlesenler.Add(new NestingYerlesimOgesi
                    {
                        Ad = pl.Item.Ad,
                        X = mutlakX,
                        Y = mutlakY,
                        W = yon.W,
                        H = yon.H,
                        Rotated = Math.Abs(yon.Aci) > 1e-9,
                        AciDerece = yon.Aci,
                        ParcaEn = pl.Item.W,
                        ParcaBoy = pl.Item.H,
                        MerkezX = merkez.x,
                        MerkezY = merkez.y,
                        YmKod = pl.Item.YmKod,
                        SwParcaAdi = pl.Item.SwParcaAdi,
                        Delikler = delikler,
                        Formlar = formlar,
                        DisHat = disHat
                    });
                }
                sonuc.Plakalar.Add(plaka);
                kalan = remaining;
            }
            return sonuc;
        }

        private static (List<Placed> placed, List<Item> remaining) PackOnePlaka(double W, double H, List<Item> items, double kerf)
        {
            var skyline = new List<SkylineSeg> { new SkylineSeg { X0 = 0, X1 = W, Y = 0 } };
            var placed = new List<Placed>();
            var remaining = new List<Item>();

            (double x, double y)? SeviyeBul(int baslaIdx, double genislik)
            {
                double x0 = skyline[baslaIdx].X0;
                double xBitis = x0 + genislik;
                if (xBitis > W + 0.001) return null;
                double y = 0;
                for (int j = baslaIdx; j < skyline.Count; j++)
                {
                    if (skyline[j].X0 >= xBitis - 0.001) break;
                    if (skyline[j].X1 <= x0 + 0.001) continue;
                    if (skyline[j].Y > y) y = skyline[j].Y;
                }
                return (x0, y);
            }

            (double x, double y)? FindBestPosition(double w, double h)
            {
                double wk = w + kerf;
                (double x, double y)? best = null;
                for (int i = 0; i < skyline.Count; i++)
                {
                    var seviye = SeviyeBul(i, wk);
                    if (seviye == null) continue;
                    if (seviye.Value.y + h > H + 0.001) continue;
                    if (best == null || seviye.Value.y < best.Value.y - 0.001 ||
                        (Math.Abs(seviye.Value.y - best.Value.y) < 0.001 && seviye.Value.x < best.Value.x))
                        best = seviye;
                }
                return best;
            }

            void PlaceAt(double x, double y, double w, double h)
            {
                double wk = w + kerf;
                double yeniY = y + h + kerf;
                double xBitis = x + wk;
                var yeni = new List<SkylineSeg>();
                foreach (var seg in skyline)
                {
                    if (seg.X1 <= x + 0.001 || seg.X0 >= xBitis - 0.001) { yeni.Add(seg); continue; }
                    if (seg.X0 < x - 0.001) yeni.Add(new SkylineSeg { X0 = seg.X0, X1 = x, Y = seg.Y });
                    if (seg.X1 > xBitis + 0.001) yeni.Add(new SkylineSeg { X0 = xBitis, X1 = seg.X1, Y = seg.Y });
                }
                yeni.Add(new SkylineSeg { X0 = x, X1 = xBitis, Y = yeniY });
                yeni = yeni.OrderBy(s => s.X0).ToList();
                var merged = new List<SkylineSeg>();
                foreach (var s in yeni)
                {
                    var son = merged.Count > 0 ? merged[merged.Count - 1] : null;
                    if (son != null && Math.Abs(son.Y - s.Y) < 0.001 && Math.Abs(son.X1 - s.X0) < 0.001)
                        son.X1 = s.X1;
                    else
                        merged.Add(new SkylineSeg { X0 = s.X0, X1 = s.X1, Y = s.Y });
                }
                skyline = merged;
            }

            foreach (var item in items)
            {
                // Adaylar sırayla denenir; eşitlikte ÖNCEKİ aday kalır (0°
                // önce gelir — eski davranışla aynı).
                (double x, double y)? pos = null;
                Yon secilenYon = null;
                foreach (var aday in AdayYonler(item))
                {
                    var p = FindBestPosition(aday.W, aday.H);
                    if (p != null && (pos == null || p.Value.y < pos.Value.y - 0.001 ||
                        (Math.Abs(p.Value.y - pos.Value.y) < 0.001 && p.Value.x < pos.Value.x)))
                    { pos = p; secilenYon = aday; }
                }
                if (pos != null)
                {
                    PlaceAt(pos.Value.x, pos.Value.y, secilenYon.W, secilenYon.H);
                    placed.Add(new Placed { Item = item, X = pos.Value.x, Y = pos.Value.y, Yon = secilenYon });
                }
                else
                {
                    remaining.Add(item);
                }
            }
            return (placed, remaining);
        }
    }
}
