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
        public string YmKod;
        // Parçanın KENDİ (döndürülmemiş) yerel çerçevesinde, sol-alt (0,0)
        // referanslı delik merkezleri + çapı (mm) — page_nesting.js'teki
        // satir.delikler ile AYNI veri şekli (bkz. buildDxf/delikKoordDonustur).
        public List<(double x, double y, double cap)> Delikler = new List<(double, double, double)>();
    }

    // Bir plaka üzerinde yerleşmiş TEK bir parça örneği (kesilmiş kopya).
    public class NestingYerlesimOgesi
    {
        public string Ad;
        public double X, Y;   // mm, plakanın sol-alt köşesinden, kenar boşluğu DAHİL mutlak konum
        public double W, H;   // mm, yerleşmiş (olası 90° döndürülmüş) ölçü
        public bool Rotated;
        public string YmKod;
        // Delik merkezleri, PLAKANIN mutlak koordinat sisteminde (X,Y'ye göre
        // ZATEN ofsetlenmiş) + çapı (mm) — rotated ise page_nesting.js'teki
        // delikKoordDonustur ile AYNI dönüşüm (dx,dy)->(dy, origW-dx) uygulanır.
        public List<(double x, double y, double cap)> Delikler = new List<(double, double, double)>();
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
    // GrainKilitli DEĞİLSE sadece 90° DÖNDÜRÜLÜR (Rotated bayrağı), ASLA
    // ayna/flip edilmez — bir delik hangi yönde yerleşirse yerleşsin HER
    // ZAMAN plakanın aynı (üst) yüzeyinde kalır.
    // ════════════════════════════════════════════════════════════════════════
    public static class NestingHesaplayici
    {
        private class Item
        {
            public string Ad; public double W, H; public bool GrainKilitli; public string YmKod;
            // OrigW: rotated=true olduğunda delik koordinatlarını doğru
            // dönüştürebilmek için parçanın orijinal (döndürülmemiş) genişliği
            // (page_nesting.js'teki item.origW ile AYNI amaç).
            public double OrigW;
            public List<(double x, double y, double cap)> Delikler;
        }

        private class Placed
        {
            public Item Item; public double X, Y, W, H; public bool Rotated;
        }

        private class SkylineSeg { public double X0, X1, Y; }

        public static NestingSonucu Hesapla(double plakaEn, double plakaBoy, double kenarBosluk, double kesimPayi, List<NestingParcaGirdi> parcalar)
        {
            var items = new List<Item>();
            foreach (var p in parcalar)
                for (int k = 0; k < Math.Max(1, p.Adet); k++)
                    items.Add(new Item { Ad = p.Ad, W = p.En, H = p.Boy, GrainKilitli = p.GrainKilitli, YmKod = p.YmKod, OrigW = p.En, Delikler = p.Delikler });
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
                var (placed, remaining) = PackOnePlaka(usableW, usableH, kalan, kesimPayi);
                if (placed.Count == 0)
                {
                    sonuc.YerlesemeyenUyarilari.Add(kalan.Count + " parça kopyası hiçbir plakaya sığmadı (plaka veya parça ölçüsünü, ya da kenar boşluğu/kesim payını kontrol edin).");
                    break;
                }
                var plaka = new NestingPlakaSonucu();
                foreach (var pl in placed)
                {
                    double mutlakX = pl.X + kenarBosluk, mutlakY = pl.Y + kenarBosluk;
                    // page_nesting.js'teki delikKoordDonustur ile AYNI dönüşüm:
                    // rotated ise (dx,dy) -> (dy, origW-dx), sonra plakadaki
                    // mutlak konuma (kenar boşluğu dahil) ofsetlenir.
                    var delikler = (pl.Item.Delikler ?? new List<(double, double, double)>())
                        .Select(d =>
                        {
                            var (dx, dy) = pl.Rotated ? (d.y, pl.Item.OrigW - d.x) : (d.x, d.y);
                            return (x: mutlakX + dx, y: mutlakY + dy, cap: d.cap);
                        })
                        .ToList();
                    plaka.Yerlesenler.Add(new NestingYerlesimOgesi
                    {
                        Ad = pl.Item.Ad,
                        X = mutlakX,
                        Y = mutlakY,
                        W = pl.W,
                        H = pl.H,
                        Rotated = pl.Rotated,
                        YmKod = pl.Item.YmKod,
                        Delikler = delikler
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
                var pos = FindBestPosition(item.W, item.H);
                bool rotated = false;
                if (!item.GrainKilitli)
                {
                    var posRot = FindBestPosition(item.H, item.W);
                    if (posRot != null && (pos == null || posRot.Value.y < pos.Value.y - 0.001 ||
                        (Math.Abs(posRot.Value.y - pos.Value.y) < 0.001 && posRot.Value.x < pos.Value.x)))
                    { pos = posRot; rotated = true; }
                }
                if (pos != null)
                {
                    double w = rotated ? item.H : item.W;
                    double h = rotated ? item.W : item.H;
                    PlaceAt(pos.Value.x, pos.Value.y, w, h);
                    placed.Add(new Placed { Item = item, X = pos.Value.x, Y = pos.Value.y, W = w, H = h, Rotated = rotated });
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
