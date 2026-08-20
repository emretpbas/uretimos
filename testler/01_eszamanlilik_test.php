<?php
// ── EŞZAMANLI YAZMA KORUMASI ────────────────────────────────────────────────
// Bu testler v23'te düzeltilen KRİTİK hatayı korur: iki kullanıcı aynı anda
// farklı kayıtları değiştirdiğinde birinin değişikliği kaybolmamalıdır.
// Bu dosya bir daha asla o hatanın geri gelmemesini garanti eder.

Test::bolum('Eşzamanlı yazma — sürüm kontrolü');

Test::yaz('t_eszaman', [
    ['id' => 'A', 'ad' => 'Ali', 'v' => 1],
    ['id' => 'B', 'ad' => 'Bora', 'v' => 1],
    ['id' => 'C', 'ad' => 'Can', 'v' => 1]
]);

$s1 = Test::surum('t_eszaman');
Test::dogru(is_int($s1) && $s1 > 0, 'Okuma sürüm numarası döndürüyor', 'sürüm: ' . json_encode($s1));

// Araya başka bir yazma girsin
Test::yaz('t_eszaman', [['id' => 'A', 'ad' => 'araya-giren', 'v' => 2]]);

// Eski sürümle yazmaya çalış → 409 beklenir
$r = Test::istek('?action=set', 'POST', [
    'key' => 't_eszaman', 'value' => json_encode([]), 'beklenenSurum' => $s1
]);
Test::esit(409, $r['kod'], 'Eski sürümle yazma 409 ile reddediliyor');
Test::dogru(!empty($r['veri']['cakisma']), 'Yanıt çakışma bayrağı taşıyor');
Test::dogru(isset($r['veri']['guncelDeger']), 'Çakışma yanıtı güncel veriyi geri veriyor');

Test::bolum('Atomik patch — kayıt bazlı güncelleme');

Test::yaz('t_patch', [
    ['id' => 'A', 'fiyat' => 100],
    ['id' => 'B', 'fiyat' => 200],
    ['id' => 'C', 'fiyat' => 300]
]);

// İki farklı kaydı ardışık patch ile değiştir — ikisi de korunmalı
Test::istek('?action=patch', 'POST', ['key' => 't_patch', 'guncelle' => [['id' => 'A', 'fiyat' => 999]]]);
Test::istek('?action=patch', 'POST', ['key' => 't_patch', 'guncelle' => [['id' => 'B', 'fiyat' => 888]]]);
$son = Test::oku('t_patch');
$harita = [];
foreach ($son as $k) $harita[$k['id']] = $k['fiyat'];
Test::esit(999, $harita['A'] ?? null, 'Birinci kullanıcının değişikliği korundu');
Test::esit(888, $harita['B'] ?? null, 'İkinci kullanıcının değişikliği korundu');
Test::esit(300, $harita['C'] ?? null, 'Dokunulmayan kayıt bozulmadı');

// Ekleme + silme birlikte
Test::istek('?action=patch', 'POST', [
    'key' => 't_patch', 'ekle' => [['id' => 'D', 'fiyat' => 400]], 'sil' => ['C']
]);
$son = Test::oku('t_patch');
$idler = array_column($son, 'id');
Test::dogru(in_array('D', $idler, true), 'Patch ile eklenen kayıt var');
Test::dogru(!in_array('C', $idler, true), 'Patch ile silinen kayıt yok');
Test::esit(3, count($son), 'Kayıt sayısı doğru (A, B, D)');

// Silinmiş kaydı güncellemek onu geri eklemeli (veri kaybını önler)
Test::istek('?action=patch', 'POST', ['key' => 't_patch', 'guncelle' => [['id' => 'C', 'fiyat' => 350]]]);
$idler = array_column(Test::oku('t_patch'), 'id');
Test::dogru(in_array('C', $idler, true), 'Arada silinmiş kaydın güncellenmesi onu geri ekliyor');

// Boş patch güvenli olmalı
$r = Test::istek('?action=patch', 'POST', ['key' => 't_patch']);
Test::esit(200, $r['kod'], 'Boş patch hata vermiyor');

Test::bolum('Sürüm numarası her yazmada artıyor');
$a = Test::surum('t_patch');
Test::istek('?action=patch', 'POST', ['key' => 't_patch', 'guncelle' => [['id' => 'A', 'fiyat' => 111]]]);
$b = Test::surum('t_patch');
Test::dogru($b > $a, 'Patch sonrası sürüm arttı', "önce: $a  sonra: $b");
