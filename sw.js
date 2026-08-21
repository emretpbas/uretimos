// ÜretimOS Service Worker — VPS sürümü (v4, ÖNCE-AĞ stratejisi)
//
// ÖNEMLİ DEĞİŞİKLİK: Önceki sürüm "önce önbellek" (cache-first) çalışıyordu;
// bu, hosting'e yeni sürüm yüklendiğinde tarayıcıların ESKİ JS'i çalıştırmaya
// devam etmesine yol açıyordu (ancak Ctrl+Shift+R ile düzeliyordu).
// Bu sürüm "ÖNCE AĞ" (network-first) çalışır:
//   - İnternet varken HER ZAMAN sunucudaki güncel dosya kullanılır
//     → hosting'e atılan güncellemeler anında herkese yansır
//   - İnternet yoksa son başarılı kopya önbellekten sunulur (acil yedek)
//   - api.php istekleri HİÇBİR ZAMAN önbelleğe alınmaz
const CACHE_NAME = 'uretimos-v121'; // v121: logo secimi, proje kalemi/cari karta dosya ekleme, tarihli klasor gezgini

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Veri istekleri: her zaman ağ, asla önbellek
  if (url.pathname.includes('api.php') || e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }
  // Uygulama dosyaları (HTML/JS/CSS/ikon): ÖNCE AĞ, başarısızsa önbellek
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && r.status === 200) {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
