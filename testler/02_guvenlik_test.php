<?php
// ── GÜVENLİK ────────────────────────────────────────────────────────────────
// Şifre saklama, operatör yetki sınırları ve oturum zorunluluğu.
// Bu testler v24'te kapatılan "düz metin şifre" açığının geri gelmesini önler.

Test::bolum('Şifre saklama — düz metin yasak');

Test::yaz('rotalar', [['id' => 'R1', 'steps' => [['hat' => 'TEST HATTI', 'kod' => 'IST-01']]]]);

// Operatör şifre talebi: düz metin ASLA saklanmamalı
$r = Test::istek('?action=hatSifreTalep', 'POST', [
    'isim' => 'Test Operatör', 'sifre' => 'gizli12345', 'hatlar' => ['TEST HATTI']
], false);
Test::esit(200, $r['kod'], 'Şifre talebi oluşturuluyor');
$talepler = Test::oku('hatSifreTalepleri');
$t = $talepler[0] ?? [];
Test::dogru(!isset($t['sifre']), 'Talepte düz metin şifre YOK');
Test::dogru(isset($t['sifreHash']) && strpos($t['sifreHash'], '$2y$') === 0,
            'Talepte bcrypt hash var');
Test::dogru(strpos(json_encode($talepler), 'gizli12345') === false,
            'Şifrenin kendisi hiçbir alanda geçmiyor');

Test::bolum('Eski düz metin kayıtların hash\'e göçü');

Test::yaz('hatOperatorleri', [[
    'id' => 'H1', 'isim' => 'Eski Kayıt', 'sifre' => 'duzmetin1',
    'hatlar' => ['TEST HATTI'], 'durum' => 'aktif'
]]);
$r = Test::istek('?action=hatGiris', 'POST', [
    'hat' => 'TEST HATTI', 'isim' => 'Eski Kayıt', 'sifre' => 'duzmetin1'
], false);
Test::dogru(!empty($r['veri']['ok']), 'Eski düz metin şifreyle giriş çalışıyor (kimse kilitlenmiyor)');

$op = (Test::oku('hatOperatorleri'))[0] ?? [];
Test::dogru(!isset($op['sifre']), 'Girişten sonra düz metin silindi');
Test::dogru(isset($op['sifreHash']), 'Girişten sonra hash oluştu');

$r = Test::istek('?action=hatGiris', 'POST', [
    'hat' => 'TEST HATTI', 'isim' => 'Eski Kayıt', 'sifre' => 'duzmetin1'
], false);
Test::dogru(!empty($r['veri']['ok']), 'Göçten sonra aynı şifreyle giriş devam ediyor');

$r = Test::istek('?action=hatGiris', 'POST', [
    'hat' => 'TEST HATTI', 'isim' => 'Eski Kayıt', 'sifre' => 'yanlissifre'
], false);
Test::dogru(empty($r['veri']['ok']), 'Yanlış şifre reddediliyor');

Test::bolum('Yetki sınırları');

// Operatör oturumu al
$r = Test::istek('?action=hatGiris', 'POST', [
    'hat' => 'TEST HATTI', 'isim' => 'Eski Kayıt', 'sifre' => 'duzmetin1'
], false);
$opToken = $r['veri']['token'] ?? null;
Test::dogru($opToken !== null, 'Operatör token alındı');

if ($opToken) {
    $r = Test::istek('?action=get&key=musteriler', 'GET', null, $opToken);
    Test::esit(403, $r['kod'], 'Operatör cari verisini OKUYAMIYOR');

    $r = Test::istek('?action=set', 'POST', ['key' => 'siparisler', 'value' => '[]'], $opToken);
    Test::esit(403, $r['kod'], 'Operatör sipariş verisine YAZAMIYOR');

    $r = Test::istek('?action=get&key=hatOperatorleri', 'GET', null, $opToken);
    Test::esit(403, $r['kod'], 'Operatör şifre kayıtlarını okuyamıyor');

    $r = Test::istek('?action=sifreHashle', 'POST', ['sifre' => 'denemesifre'], $opToken);
    Test::esit(403, $r['kod'], 'Operatör şifre hash ucunu kullanamıyor');

    $r = Test::istek('?action=set', 'POST', ['key' => 'istasyonIsleri', 'value' => '[]'], $opToken);
    Test::esit(200, $r['kod'], 'Operatör kendi iş kayıtlarına YAZABİLİYOR');
}

Test::bolum('Oturum zorunluluğu');
$r = Test::istek('?action=get&key=hammaddeler', 'GET', null, false);
Test::esit(401, $r['kod'], 'Tokensız okuma engelleniyor');
$r = Test::istek('?action=set', 'POST', ['key' => 'hammaddeler', 'value' => '[]'], false);
Test::esit(401, $r['kod'], 'Tokensız yazma engelleniyor');

Test::bolum('Korumalı koleksiyonlar');
$r = Test::istek('?action=set', 'POST', ['key' => 'kullaniciler', 'value' => '[]']);
Test::esit(403, $r['kod'], 'kullaniciler koleksiyonu set ucundan yazılamıyor');
$r = Test::istek('?action=patch', 'POST', ['key' => 'kullaniciler', 'guncelle' => [['id' => 'x']]]);
Test::esit(403, $r['kod'], 'kullaniciler koleksiyonu patch ucundan da yazılamıyor');

Test::bolum('Şifre hash ucu (yönetim)');
$r = Test::istek('?action=sifreHashle', 'POST', ['sifre' => 'yeterince-uzun']);
Test::dogru(isset($r['veri']['sifreHash']) && strpos($r['veri']['sifreHash'], '$2y$') === 0,
            'Yönetim bcrypt hash üretebiliyor');
$r = Test::istek('?action=sifreHashle', 'POST', ['sifre' => '12']);
Test::esit(400, $r['kod'], 'Kısa şifre reddediliyor');
