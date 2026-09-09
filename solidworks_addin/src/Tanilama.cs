using System;
using System.IO;

namespace UretimOSKesim
{
    // ════════════════════════════════════════════════════════════════════════
    // PAYLAŞILAN TANI GÜNLÜĞÜ — native SolidWorks çökmeleri managed try/catch
    // ile YAKALANAMADIĞI için (bkz. SwAddin.cs'teki KomutlariKur() çökmesinin
    // gerçek teşhis süreci), çökmeden HEMEN ÖNCEKİ adımı diske kalıcı kanıt
    // olarak bırakan bu mekanizma önce SwAddin.cs içinde özel (private) olarak
    // yazılmıştı; TeknikResimOlusturucu.cs'nin de aynı güvenlik ağını
    // kullanabilmesi için ortak bir sınıfa taşındı — henüz canlıda hiç
    // denenmemiş NewDocument/CreateDrawViewFromModelView3/SaveAs3 çağrıları
    // bu dosyada kullanılıyor.
    // ════════════════════════════════════════════════════════════════════════
    internal static class Tanilama
    {
        private static readonly string LogDosyasi = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "uretimos_addin_log.txt");

        public static void Kaydet(string mesaj)
        {
            try
            {
                File.AppendAllText(LogDosyasi, DateTime.Now.ToString("HH:mm:ss.fff") + " - " + mesaj + Environment.NewLine);
            }
            catch { /* günlük yazılamazsa sessizce geç — bu tanı amaçlı, işlevi etkilemesin */ }
        }
    }
}
