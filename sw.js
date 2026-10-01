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
const CACHE_NAME = 'uretimos-v192'; // v192: GERÇEK TESTTE YAKALANDI — fetch dinleyicisi BAŞKA ORİJİNLERE (ör. logo_koprusu) giden istekleri de yakalayıp eski/kurulu SW'nin CSP'siyle engelliyordu; artık yalnızca kendi orijinine bakıyor. .catch dalı caches.match() undefined dönünce "Failed to convert value to 'Response'" hatası veriyordu, düzeltildi. Sürüm artışı, önceden yanlışlıkla önbelleğe alınmış çapraz-orijin (KVKK'lı cari verisi dahil) yanıtları activate'teki eski önbellek silme adımıyla temizler.

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // GERÇEK TESTTE YAKALANDI: bu SW yalnızca KENDİ ÜretimOS orijinini
  // yönetmeli. Başka bir orijine (ör. LOGO köprüsü https://dpc145...:8443)
  // giden istekler buraya düşerse, SW'nin KURULU OLDUĞU ANDAKİ CSP'si
  // (sayfa sonradan .htaccess'ten güncellense bile SW güncellenene kadar
  // DEĞİŞMEZ) isteği reddedip "connect-src" ihlali olarak engelliyordu —
  // tarayıcı konsolunda görülen "violates ... connect-src" hatası buydu.
  // Çapraz orijin isteklerini SW'ye HİÇ UĞRATMADAN tarayıcının normal
  // fetch'ine bırakıyoruz; CSP kontrolünü zaten tarayıcı kendisi, GÜNCEL
  // .htaccess politikasıyla yapar.
  if (url.origin !== self.location.origin) return;
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
    }).catch(() => caches.match(e.request).then(r => r || Response.error()))
  );
});
