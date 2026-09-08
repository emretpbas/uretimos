<?php
// $gecici değişkeni çalıştırıcıdan gelir (bkz. 05_yetki_test.php'teki aynı not).
// Önceki test dosyaları (02/09 gibi) BİLEREK başarısız giriş denemeleri
// üretiyor; aynı IP'den (yerel test sunucusu) çalıştığımız için bu, kaba
// kuvvet sayacını (MAX_GIRIS_DENEME=10 / 15dk) bu dosyaya gelene kadar
// doldurabilir. Üretim güvenliğine DOKUNMADAN (sayacı büyütmek gerçek kaba
// kuvvet korumasını zayıflatır), yalnızca bu TEST veritabanındaki sayacı
// kendi girişimizden ÖNCE temizliyoruz — gerçek bir yöneticinin "başarısız
// giriş sayacını sıfırla" işlemiyle aynı, üretim koduna hiçbir etkisi yok.
try {
    $pdoTemizlik = new PDO('sqlite:' . $gecici . '/test.sqlite');
    $pdoTemizlik->exec('DELETE FROM login_attempts');
} catch (Exception $e) { /* tablo henüz yoksa sorun değil */ }

// ── CAD ENTEGRASYON ROLÜ (SolidWorks add-in) — BEYAZ LİSTE ERİŞİM TESTİ ─────
// 'cad_entegrasyon', hat_operator ile AYNI ilkeyle eklenen bir rol: bir İNSAN
// PERSONEL değil, kullanıcının kendi bilgisayarında çalışan bir SolidWorks
// eklentisinin kullandığı servis kimliği. Bu testler şunu garanti eder:
//   1) Kamuya açık hesap talebiyle DOĞRUDAN alınamaz (yalnızca mevcut bir
//      yönetim kullanıcısı onayda BİLEREK verebilir — 'yonetim' rolüyle aynı
//      korumaya sahip).
//   2) Yalnızca kendi beyaz listesindeki (hammaddeler/yarimamuller/paketler/
//      urunler/receteler) koleksiyonları okuyabilir — hassas veri (maaş,
//      cari, fatura, kullanıcı) TAMAMEN kapalı.
//   3) Yazma izni okumadan DAHA DAR: hammaddeler yalnızca OKUNABİLİR, MASTER
//      veri (plaka/hırdavat/kenar bandı tanımı) bu kimlikle DEĞİŞTİRİLEMEZ.
//   4) 'delete' ucu bu role TAMAMEN KAPALI — kendi yazabildiği bir koleksiyon
//      olsa bile (delete bir koleksiyonun TAMAMINI kaldırır).

Test::bolum('CAD Entegrasyon — self-servis talep ile ALINAMAZ');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Sahte CAD Entegrasyonu', 'email' => 'sahte.cad@ornek.com',
    'rol' => 'cad_entegrasyon', 'sifre' => 'GucluSifre123'
], false);
Test::esit(400, $r['kod'], '"cad_entegrasyon" rolüyle self-servis talep reddediliyor');

Test::bolum('CAD Entegrasyon — hazırlık: yönetim onayında BİLİNÇLİ yükseltme');

$eposta = 'cad.eklenti@ornek.com';
$sifre = 'CadEklentiSifre1';
Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'CAD Eklentisi (Servis)', 'email' => $eposta, 'rol' => 'arge', 'sifre' => $sifre
], false);
$talepler = Test::oku('hesapTalepleri');
$talep = null;
foreach ($talepler as $t) { if (($t['email'] ?? '') === $eposta) { $talep = $t; break; } }
Test::dogru($talep !== null && $talep['rol'] === 'arge', 'Talep "arge" rolüyle bekliyor (self-servis öyle sınırlı)');

$r = Test::istek('?action=hesapTalepiKarar', 'POST',
    ['id' => $talep['id'], 'karar' => 'onayla', 'rol' => 'cad_entegrasyon'], null);
Test::esit(200, $r['kod'], 'Yönetim, onayda "cad_entegrasyon" rolüne YÜKSELTEBİLİYOR');
$kadi = $r['veri']['kullaniciAdi'] ?? null;
Test::dogru(!empty($kadi), 'Kullanıcı adı döndü');

$kullanicilar = Test::oku('kullaniciler');
$olusan = null;
foreach ($kullanicilar as $k) { if (($k['kullaniciAdi'] ?? '') === $kadi) { $olusan = $k; break; } }
Test::dogru($olusan !== null && $olusan['rol'] === 'cad_entegrasyon', 'Oluşan kullanıcının rolü fiilen "cad_entegrasyon" oldu');

$r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => $kadi, 'sifre' => $sifre], false);
Test::esit(200, $r['kod'], 'cad_entegrasyon kullanıcısı kendi şifresiyle giriş yapabiliyor');
$cadTok = $r['veri']['token'] ?? null;
Test::dogru(!empty($cadTok), 'Token alındı');

// KRİTİK: token boşsa Test::istek'e $token=null geçmek "varsayılan (yönetim)
// token'ı kullan" anlamına gelir — bu durumda aşağıdaki tüm erişim testleri
// SESSİZCE yönetim yetkisiyle çalışıp YANLIŞ POZİTİF (sahte geçti) üretir.
// Böyle bir riski almak yerine token yoksa kalan testleri AÇIKÇA atlıyoruz.
if (!$cadTok) {
    Test::dogru(false, 'cadTok alınamadı — kalan erişim testleri GÜVENLİ ŞEKİLDE ATLANDI (yönetim tokenıyla yanlış-pozitif üretmemek için)');
    return;
}

Test::bolum('CAD Entegrasyon — OKUMA: yalnızca kendi beyaz listesi');

foreach (['hammaddeler', 'yarimamuller', 'paketler', 'urunler', 'receteler'] as $key) {
    $r = Test::istek('?action=get&key=' . $key, 'GET', null, $cadTok);
    Test::esit(200, $r['kod'], "cad_entegrasyon '$key' okuyabiliyor (beyaz listede)");
}

foreach (['maaslar', 'musteriler', 'faturalar', 'kullaniciler', 'bordrolar', 'bankaKredileri', 'hatSifreleri'] as $key) {
    $r = Test::istek('?action=get&key=' . $key, 'GET', null, $cadTok);
    Test::esit(403, $r['kod'], "cad_entegrasyon '$key' OKUYAMIYOR (beyaz listede değil)");
}

Test::bolum('CAD Entegrasyon — YAZMA: okumadan daha dar (hammaddeler salt okunur)');

$r = Test::istek('?action=patch', 'POST', [
    'key' => 'yarimamuller',
    'ekle' => [['id' => 'YM-CAD-TEST-1', 'ad' => 'CAD Eklentisinden Test Parça', 'tip' => 'yarimamul']]
], $cadTok);
Test::esit(200, $r['kod'], "cad_entegrasyon 'yarimamuller' üzerine PATCH yazabiliyor");

$yarimamullerGuncel = Test::oku('yarimamuller');
$eklenenVarMi = false;
foreach ((array)$yarimamullerGuncel as $y) { if (($y['id'] ?? '') === 'YM-CAD-TEST-1') { $eklenenVarMi = true; break; } }
Test::dogru($eklenenVarMi, 'Eklenen kayıt gerçekten kalıcı oldu (yönetim okumasında görünüyor)');

foreach (['paketler', 'urunler', 'receteler'] as $key) {
    $r = Test::istek('?action=patch', 'POST', ['key' => $key, 'ekle' => []], $cadTok);
    Test::esit(200, $r['kod'], "cad_entegrasyon '$key' üzerine PATCH gönderebiliyor (boş ekle de kabul edilir)");
}

$r = Test::istek('?action=patch', 'POST', [
    'key' => 'hammaddeler', 'ekle' => [['id' => 'HM-CAD-TEST', 'ad' => 'Sahte Plaka', 'tip' => 'plaka']]
], $cadTok);
Test::esit(403, $r['kod'], "cad_entegrasyon 'hammaddeler' üzerine YAZAMIYOR (yalnızca okunabilir)");

$r = Test::istek('?action=set', 'POST', [
    'key' => 'maaslar', 'value' => json_encode([['ad' => 'HACK', 'maas' => 1]])
], $cadTok);
Test::esit(403, $r['kod'], "cad_entegrasyon hassas 'maaslar' koleksiyonuna YAZAMIYOR");

Test::bolum('CAD Entegrasyon — SİLME tamamen kapalı');

// 'yarimamuller' kendi YAZILABİLİR beyaz listesinde olsa bile delete engellenir.
$r = Test::istek('?action=delete', 'POST', ['key' => 'yarimamuller'], $cadTok);
Test::esit(403, $r['kod'], "cad_entegrasyon 'yarimamuller' SİLEMİYOR (kendi yazabildiği koleksiyon olsa bile)");

$yarimamullerSonrasi = Test::oku('yarimamuller');
Test::dogru(is_array($yarimamullerSonrasi) && count($yarimamullerSonrasi) > 0,
    'Silme denemesinden sonra veri hâlâ duruyor (silme gerçekten engellenmiş)');
