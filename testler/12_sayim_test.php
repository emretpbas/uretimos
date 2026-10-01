<?php
// ── action=sayim ────────────────────────────────────────────────────────────
// GERÇEK ÜRETİM TESTİNDE YAKALANDI: LOGO'dan toplu aktarım sonrası urunler/
// yarimamuller 80.000+ kayda çıkınca, panel açılışında bu koleksiyonları
// SADECE bir sayı (.length) göstermek için Store.<koleksiyon>.all() ile TAM
// indirip ayrıştırmak girişi gözle görülür yavaşlatıyordu. action=sayim bu
// koleksiyonun yalnızca KAÇ KAYIT olduğunu, sunucuda bir kez çözüp döner —
// bu testler, action=get ile BİREBİR AYNI yetki/oturum kurallarına uyduğunu
// ve sayının doğru geldiğini garanti eder.

Test::bolum('action=sayim — normal kullanım');

Test::yaz('urunler', [['id' => 'U1'], ['id' => 'U2'], ['id' => 'U3']]);
$r = Test::istek('?action=sayim&key=urunler', 'GET', null);
Test::esit(200, $r['kod'], 'Bilinen koleksiyon için 200 dönüyor');
Test::esit(3, $r['veri']['adet'] ?? -1, 'Dizi uzunluğu doğru sayılıyor');
Test::esit('urunler', $r['veri']['key'] ?? '', 'Yanıt hangi key için sayıldığını belirtiyor');

Test::yaz('urunler', []);
$r = Test::istek('?action=sayim&key=urunler', 'GET', null);
Test::esit(0, $r['veri']['adet'] ?? -1, 'Boş koleksiyon 0 dönüyor');

$r = Test::istek('?action=sayim&key=hic-boyle-bir-koleksiyon-yok', 'GET', null);
Test::esit(200, $r['kod'], 'Hiç yazılmamış key için bile hata değil, 200 dönüyor');
Test::esit(0, $r['veri']['adet'] ?? -1, 'Hiç yazılmamış key için adet 0');

Test::dogru(
    !isset($r['veri']['value']) && !array_key_exists('ekle', $r['veri'] ?? []),
    'Yanıt ham kayıtları İÇERMİYOR — sadece adet dönüyor (asıl amaç: trafik/ayrıştırma yükünü kaldırmak)'
);

Test::bolum('action=sayim — eksik parametre');

$r = Test::istek('?action=sayim', 'GET', null);
Test::esit(400, $r['kod'], 'key parametresi olmadan 400 dönüyor');

Test::bolum('action=sayim — yetki kontrolleri action=get ile BİREBİR AYNI');

Test::yaz('maaslar', [['ad' => 'A. Test', 'maas' => 85000]]);

// Oturumsuz istek reddediliyor (action=get ile aynı davranış)
$r = Test::istek('?action=sayim&key=urunler', 'GET', null, false);
Test::esit(401, $r['kod'], 'Tokensız sayım isteği reddediliyor');

// Düşük yetkili rol (depo) hassas koleksiyonu SAYAMIYOR da.
// NOT (10_hammadde_piyasa_test.php'teki ile AYNI gerekçe): sabit
// 'depo'/'depo1234' bootstrap şifresine GÜVENİLMEZ — 09_hesap_talep_test.php
// bu şifreyi action=resetPasswords ile geçersiz kılıyor. Bunun yerine kendi
// belirlediğimiz taze bir 'depo' rollü hesabı self-registration akışıyla
// oluşturup onaylıyoruz.
$depoEposta = 'test-depo-sayim@ornek.com';
Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Test Depo Sayım', 'email' => $depoEposta, 'rol' => 'depo', 'sifre' => 'DepoSayimSifre123'
], false);
$talepler = Test::oku('hesapTalepleri');
$depoTalep = null;
foreach ($talepler as $t) { if (($t['email'] ?? '') === $depoEposta) { $depoTalep = $t; break; } }
Test::dogru($depoTalep !== null, 'Test için geçici depo hesabı talebi oluşturuldu (sayım testi)');
Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $depoTalep['id'], 'karar' => 'onayla'], null);
$depoTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'testdeposayim', 'sifre' => 'DepoSayimSifre123'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($depoTok), 'Geçici depo hesabıyla giriş başarılı (sayım yetki testi için)');

if ($depoTok) {
    $r = Test::istek('?action=get&key=maaslar', 'GET', null, $depoTok);
    Test::esit(403, $r['kod'], 'Karşılaştırma: Depo maaş verisini OKUYAMIYOR (get)');

    $r = Test::istek('?action=sayim&key=maaslar', 'GET', null, $depoTok);
    Test::esit(403, $r['kod'], 'Depo maaş verisini SAYAMIYOR da — aynı yetki duvarı sayım ucunda da geçerli');

    // Herkese açık operasyonel veriyi sayabiliyor
    $r = Test::istek('?action=sayim&key=urunler', 'GET', null, $depoTok);
    Test::esit(200, $r['kod'], 'Depo paylaşılan operasyonel veriyi (urunler) sayabiliyor');
}

// hat_operator ve cad_entegrasyon beyaz listeleri de sayım ucunda uygulanıyor
$opTok = (function () {
    Test::yaz('rotalar', [['id' => 'R1', 'steps' => [['hat' => 'SAYIM TEST HATTI', 'kod' => 'IST-01']]]]);
    Test::yaz('hatOperatorleri', [[
        'id' => 'HOP1', 'isim' => 'Sayım Test Operatör', 'sifre' => 'sayimtest1',
        'hatlar' => ['SAYIM TEST HATTI'], 'durum' => 'aktif'
    ]]);
    $r = Test::istek('?action=hatGiris', 'POST', [
        'hat' => 'SAYIM TEST HATTI', 'isim' => 'Sayım Test Operatör', 'sifre' => 'sayimtest1'
    ], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($opTok), 'Hat operatörü girişi başarılı (sayım yetki testi için)');

if ($opTok) {
    $r = Test::istek('?action=sayim&key=musteriler', 'GET', null, $opTok);
    Test::esit(403, $r['kod'], 'Hat operatörü beyaz listesi dışındaki koleksiyonu SAYAMIYOR (cari)');
}

Test::yaz('musteriler', [['id' => 'U1'], ['id' => 'U2'], ['id' => 'U3']]);
$r = Test::istek('?action=sayim&key=musteriler', 'GET', null);
Test::esit(3, $r['veri']['adet'] ?? -1, 'Yönetim her koleksiyonu sayabiliyor (bypass)');
