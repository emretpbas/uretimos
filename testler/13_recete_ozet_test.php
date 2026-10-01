<?php
// ── action=receteOzet ──────────────────────────────────────────────────────
// GERÇEK İHTİYAÇ: "Ürün Kartları & Reçete" ekranı 20.000+ ürün/96.000+ yarı
// mamül kartını "reçetesi var mı" bilgisine göre gruplamak istiyor —
// Store.receteler.all() ile TÜM reçeteleri (en ağır koleksiyon, her biri
// kalemler dizisiyle) indirmek yerine, bu uç sunucuda 'receteler' blobunu
// bir kez çözüp YALNIZCA bağlantı alanlarını (urunId/yarimamulId/
// altMontajId/paketId) + kalem SAYISINI döner; asıl ağır içerik (kalemler'in
// kendisi) hiç istemciye gönderilmez. Bu testler, boş reçetelerin atlandığını,
// dolu reçetelerin kalem sayısıyla birlikte geldiğini, ham kalem içeriğinin
// yanıtta HİÇ görünmediğini ve yetki kontrollerinin action=get/sayim ile
// BİREBİR AYNI olduğunu garanti eder.

Test::bolum('action=receteOzet — normal kullanım');

Test::yaz('receteler', [
    ['id' => 'RC1', 'urunId' => 'UR1', 'kalemler' => [['kod' => 'A'], ['kod' => 'B']]],
    ['id' => 'RC2', 'yarimamulId' => 'YM1', 'kalemler' => [['kod' => 'C']]],
    ['id' => 'RC3', 'altMontajId' => 'AM1', 'kalemler' => []],          // boş — atlanmalı
    ['id' => 'RC4', 'paketId' => 'PKT1'],                                // kalemler hiç yok — atlanmalı
]);

$r = Test::istek('?action=receteOzet', 'GET', null);
Test::esit(200, $r['kod'], 'Normal istek 200 dönüyor');
$ozet = $r['veri']['receteOzet'] ?? null;
Test::dogru(is_array($ozet), 'receteOzet bir dizi olarak dönüyor');
Test::esit(2, count($ozet), 'Yalnızca dolu (kalemli) reçeteler dönüyor, boş olanlar atlanıyor');

$urunGirdisi = null;
foreach ($ozet as $o) { if (($o['urunId'] ?? null) === 'UR1') { $urunGirdisi = $o; break; } }
Test::dogru($urunGirdisi !== null, 'UR1 için girdi bulundu');
Test::esit(2, $urunGirdisi['kalemSayisi'] ?? -1, 'Kalem sayısı doğru (2)');

$ymGirdisi = null;
foreach ($ozet as $o) { if (($o['yarimamulId'] ?? null) === 'YM1') { $ymGirdisi = $o; break; } }
Test::dogru($ymGirdisi !== null, 'YM1 için girdi bulundu');
Test::esit(1, $ymGirdisi['kalemSayisi'] ?? -1, 'Kalem sayısı doğru (1)');

Test::dogru(
    strpos(json_encode($ozet), '"kod"') === false,
    'Yanıt ham kalem İÇERİĞİNİ içermiyor — yalnızca bağlantı alanları + sayım (asıl amaç: ağır veriyi hiç göndermemek)'
);

Test::bolum('action=receteOzet — boş koleksiyon');

Test::yaz('receteler', []);
$r = Test::istek('?action=receteOzet', 'GET', null);
Test::esit(200, $r['kod'], 'Boş koleksiyon için bile 200 dönüyor');
Test::esit(0, count($r['veri']['receteOzet'] ?? ['x']), 'Boş koleksiyon için boş dizi dönüyor');

Test::bolum('action=receteOzet — yetki kontrolleri action=get/sayim ile BİREBİR AYNI');

$r = Test::istek('?action=receteOzet', 'GET', null, false);
Test::esit(401, $r['kod'], 'Tokensız istek reddediliyor');

// Hat operatörü: receteler HAT_OP_OKUNABILIR beyaz listesinde — erişebilmeli
Test::yaz('rotalar', [['id' => 'R1', 'steps' => [['hat' => 'RECETE OZET TEST HATTI', 'kod' => 'IST-01']]]]);
Test::yaz('hatOperatorleri', [[
    'id' => 'HOP1', 'isim' => 'Recete Ozet Test Operator', 'sifre' => 'receteozettest1',
    'hatlar' => ['RECETE OZET TEST HATTI'], 'durum' => 'aktif'
]]);
$opTok = (function () {
    $r = Test::istek('?action=hatGiris', 'POST', [
        'hat' => 'RECETE OZET TEST HATTI', 'isim' => 'Recete Ozet Test Operator', 'sifre' => 'receteozettest1'
    ], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($opTok), 'Hat operatörü girişi başarılı (receteOzet yetki testi için)');
if ($opTok) {
    $r = Test::istek('?action=receteOzet', 'GET', null, $opTok);
    Test::esit(200, $r['kod'], 'Hat operatörü receteOzet erişebiliyor (receteler kendi beyaz listesinde)');
}

// Yönetim her zaman erişebiliyor (bypass)
$r = Test::istek('?action=receteOzet', 'GET', null);
Test::esit(200, $r['kod'], 'Yönetim receteOzet erişebiliyor');
