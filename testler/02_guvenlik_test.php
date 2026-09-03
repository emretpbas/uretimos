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

// ── hatSifresiDogrula: ham liste HİÇ ifşa edilmeden sunucuda doğrulama ────
// Önceki sürümde Store.hatSifreleri.all() ile TÜM hat/birim şifreleri
// istemciye iniyordu (page_yukleme_onay.js). Artık bu uç yalnızca true/false
// döner; ham koleksiyon da hassas listede olduğu için genel get ile
// düz personel tarafından okunamaz.
Test::bolum('Hat/birim şifresi — sunucu tarafı doğrulama, ifşa yok');

$r = Test::istek('?action=hatSifresiDogrula', 'POST', ['hat' => 'TANIMSIZ HAT', 'sifre' => 'x'], false);
Test::esit(401, $r['kod'], 'hatSifresiDogrula: oturumsuz istek reddediliyor');

$depoEposta2 = 'test-depo-guvenlik@ornek.com';
Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Test Depo Guvenlik', 'email' => $depoEposta2, 'rol' => 'depo', 'sifre' => 'DepoTestSifre456'
], false);
$talepler2 = Test::oku('hesapTalepleri');
$depoTalep2 = null;
foreach ($talepler2 as $t) { if (($t['email'] ?? '') === $depoEposta2) { $depoTalep2 = $t; break; } }
Test::dogru($depoTalep2 !== null, 'Test için geçici depo hesabı talebi oluşturuldu (güvenlik testi)');
Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $depoTalep2['id'], 'karar' => 'onayla'], null);
$depoTok2 = (function () use ($depoEposta2) {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'testdepoguvenlik', 'sifre' => 'DepoTestSifre456'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($depoTok2), 'Geçici depo hesabıyla giriş başarılı (güvenlik testi)');

// Tanımsız hat/birim için varsayılan '1234' sunucuda doğrulanıyor
$r = Test::istek('?action=hatSifresiDogrula', 'POST', ['hat' => 'TANIMSIZ HAT', 'sifre' => '1234'], $depoTok2);
Test::dogru(!empty($r['veri']['ok']), 'Varsayılan 1234 şifresi doğru kabul ediliyor (herhangi bir giriş yapmış rol çağırabiliyor)');
$r = Test::istek('?action=hatSifresiDogrula', 'POST', ['hat' => 'TANIMSIZ HAT', 'sifre' => 'yanlis'], $depoTok2);
Test::dogru(empty($r['veri']['ok']), 'Yanlış birim şifresi reddediliyor');
Test::dogru(strpos(json_encode($r), '1234') === false, 'Yanıt hiçbir şifreyi düz metin göstermiyor');

Test::yaz('hatSifreleri', [['hat' => 'ÖZEL BİRİM', 'sifreHash' => password_hash('gizliBirim9', PASSWORD_DEFAULT)]]);
$r = Test::istek('?action=hatSifresiDogrula', 'POST', ['hat' => 'ÖZEL BİRİM', 'sifre' => 'gizliBirim9'], $depoTok2);
Test::dogru(!empty($r['veri']['ok']), 'Tanımlı birim şifresi (depo rolü) doğru kabul ediliyor');
Test::dogru(strpos(json_encode($r), 'gizliBirim9') === false, 'Doğru şifre bile yanıtta düz metin görünmüyor');

// Ham koleksiyon artık genel get ile düz personel tarafından okunamıyor
$r = Test::istek('?action=get&key=hatSifreleri', 'GET', null, $depoTok2);
Test::esit(403, $r['kod'], 'hatSifreleri genel get ile (depo rolü) okunamıyor');
$r = Test::istek('?action=get&key=hatOperatorleri', 'GET', null, $depoTok2);
Test::esit(403, $r['kod'], 'hatOperatorleri genel get ile (depo rolü) okunamıyor');
$r = Test::istek('?action=get&key=hatSifreTalepleri', 'GET', null, $depoTok2);
Test::esit(403, $r['kod'], 'hatSifreTalepleri genel get ile (depo rolü) okunamıyor');
$r = Test::istek('?action=get&key=bankaKredileri', 'GET', null, $depoTok2);
Test::esit(403, $r['kod'], 'bankaKredileri genel get ile (depo rolü) okunamıyor');

// Yönetim yine erişebiliyor (yönetim bypass + doğru yetkilendirilmiş roller)
$r = Test::istek('?action=get&key=hatSifreleri', 'GET', null);
Test::esit(200, $r['kod'], 'hatSifreleri yönetim tarafından okunabiliyor');
$r = Test::istek('?action=get&key=bankaKredileri', 'GET', null);
Test::esit(200, $r['kod'], 'bankaKredileri yönetim tarafından okunabiliyor');
