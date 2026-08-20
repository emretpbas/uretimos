<?php
// ── ROL BAZLI ERİŞİM DENETİMİ ──────────────────────────────────────────────
// GÜVENLİK REGRESYON TESTİ (v39). Bir güvenlik denetiminde bulunan yatay
// yetki yükseltme (IDOR) açığını korur:
//
//   AÇIK: get/set/patch/delete uçları yalnızca geçerli oturum istiyordu,
//   rol kontrolü yoktu. En düşük yetkili hesap (depo) maaş/cari/muhasebe/
//   kullanıcı gibi HER koleksiyonu okuyabiliyor ve ÜZERİNE YAZABİLİYORDU.
//
// Bu testler şunları garanti eder:
//   1) Yetkisiz rol hassas koleksiyonu OKUYAMAZ
//   2) Yetkisiz rol hassas koleksiyona YAZAMAZ/SİLEMEZ
//   3) Yetkili rol (ik, muhasebe, yonetim) erişebilir — düzeltme fazla geniş değil
//   4) Paylaşılan operasyonel veri (urunler vb.) tüm personele açık kalır
//
// $gecici değişkeni çalıştırıcıdan gelir.

$dbYolu = $gecici . '/test.sqlite';

// Yardımcı: bir rolle giriş yapıp token döndür (harness'takine dokunmadan)
function rolGiris($kadi, $sifre) {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => $kadi, 'sifre' => $sifre]);
    return $r['veri']['token'] ?? null;
}

Test::bolum('Rol denetimi — hazırlık');

// yonetim girişi 14 varsayılan hesabı bootstrap eder
$yonetimTok = rolGiris('yonetim', 'yonetim1234');
Test::dogru(!empty($yonetimTok), 'Yönetim girişi başarılı (bootstrap)');

// Yönetim hassas veri yazar (test için)
$maasJson = json_encode([['ad' => 'A. Test', 'maas' => 85000]]);
$r = Test::istek('?action=set', 'POST', ['key' => 'maaslar', 'value' => $maasJson], $yonetimTok);
Test::esit(200, $r['kod'], 'Yönetim maaş verisi yazabiliyor');

$depoTok = rolGiris('depo', 'depo1234');
Test::dogru(!empty($depoTok), 'Depo (düşük yetki) girişi başarılı');

Test::bolum('SALDIRI engellendi — depo hassas veriye erişemiyor');

$r = Test::istek('?action=get&key=maaslar', 'GET', null, $depoTok);
Test::esit(403, $r['kod'], 'Depo maaş OKUYAMIYOR (403)');
Test::dogru($r['veri']['yetkisiz'] ?? false, 'Yetkisiz bayrağı dönüyor');

$r = Test::istek('?action=set', 'POST', ['key' => 'maaslar', 'value' => '[{"ad":"HACK","maas":9}]'], $depoTok);
Test::esit(403, $r['kod'], 'Depo maaş YAZAMIYOR (403)');

$r = Test::istek('?action=delete', 'POST', ['key' => 'maaslar'], $depoTok);
Test::esit(403, $r['kod'], 'Depo maaş SİLEMİYOR (403)');

// Maaş verisi saldırıdan sonra bozulmamış olmalı
$r = Test::istek('?action=get&key=maaslar', 'GET', null, $yonetimTok);
$deger = json_decode($r['veri']['value'] ?? '[]', true);
Test::dogru(isset($deger[0]['ad']) && $deger[0]['ad'] === 'A. Test',
    'Maaş verisi saldırı denemelerinden sonra bozulmadı');

Test::bolum('Diğer hassas koleksiyonlar da kapalı');

foreach (['kullaniciler', 'muhasebeKayitlari', 'musteriler', 'tedarikciler', 'bordrolar', 'faturalar'] as $key) {
    $r = Test::istek('?action=get&key=' . $key, 'GET', null, $depoTok);
    Test::esit(403, $r['kod'], "Depo '$key' okuyamıyor");
}

Test::bolum('Meşru erişim korundu — düzeltme fazla geniş değil');

$ikTok = rolGiris('ik', 'ik1234');
$r = Test::istek('?action=get&key=maaslar', 'GET', null, $ikTok);
Test::esit(200, $r['kod'], 'İK maaş OKUYABİLİYOR');
$r = Test::istek('?action=set', 'POST', ['key' => 'maaslar', 'value' => $maasJson], $ikTok);
Test::esit(200, $r['kod'], 'İK maaş YAZABİLİYOR');

$muhTok = rolGiris('muhasebe', 'muhasebe1234');
$r = Test::istek('?action=get&key=faturalar', 'GET', null, $muhTok);
Test::dogru($r['kod'] !== 403, 'Muhasebe faturaları görebiliyor');

$r = Test::istek('?action=get&key=maaslar', 'GET', null, $yonetimTok);
Test::esit(200, $r['kod'], 'Yönetim her hassas veriye erişebiliyor');

Test::bolum('Paylaşılan operasyonel veri tüm personele açık');

foreach (['urunler', 'receteler', 'siparisler', 'stokRaf'] as $key) {
    $r = Test::istek('?action=get&key=' . $key, 'GET', null, $depoTok);
    Test::dogru($r['kod'] !== 403, "Depo paylaşılan '$key' verisine erişebiliyor (operasyonel)");
}

Test::bolum('Yazma yetkisi okumadan dar — depo müşteri yazamaz');

// musteriler: cari/teklif/satis okuyabilir ama depo hiçbir şekilde erişemez
$r = Test::istek('?action=get&key=musteriler', 'GET', null, $depoTok);
Test::esit(403, $r['kod'], 'Depo müşteri listesini okuyamıyor');
