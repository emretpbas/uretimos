<?php
// ── HESAP TALEBİ (e-posta ile kayıt + yönetim onayı) VE GÜÇLÜ ŞİFRE KURALI ──
// İki katman:
//   1) hesapTalepEt (oturumsuz) / hesapTalepiKarar (yalnızca yonetim) —
//      giriş ekranındaki "Hesap Talep Et" akışı. Talep DÜZ METİN şifre
//      taşımaz, yalnızca bcrypt hash'i tutulur ve onayda aynen devredilir.
//   2) changePassword / resetPasswords artık GÜÇLÜ şifre kuralını
//      (en az 10 karakter + büyük/küçük harf + rakam) uygular; resetPasswords
//      artık tahmin edilebilir [kullaniciadi]1234 yerine güçlü RASTGELE
//      şifreler üretir ve bunları TEK seferlik yanıtta döner.

Test::bolum('Hesap Talebi — doğrulama kuralları');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => '', 'email' => 'test@ornek.com', 'rol' => 'arge', 'sifre' => 'GucluSifre123'
], false);
Test::esit(400, $r['kod'], 'Boş ad reddediliyor');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Test Kişi', 'email' => 'gecersiz-eposta', 'rol' => 'arge', 'sifre' => 'GucluSifre123'
], false);
Test::esit(400, $r['kod'], 'Geçersiz e-posta formatı reddediliyor');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Test Kişi', 'email' => 'test1@ornek.com', 'rol' => 'boyle_bir_rol_yok', 'sifre' => 'GucluSifre123'
], false);
Test::esit(400, $r['kod'], 'Geçersiz rol/birim reddediliyor');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Test Kişi', 'email' => 'test2@ornek.com', 'rol' => 'arge', 'sifre' => 'kisa1'
], false);
Test::esit(400, $r['kod'], 'Kısa şifre (< 10 karakter) reddediliyor');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Test Kişi', 'email' => 'test3@ornek.com', 'rol' => 'arge', 'sifre' => 'gecerlisifre1'
], false);
Test::esit(400, $r['kod'], 'Büyük harf içermeyen şifre reddediliyor');

Test::bolum('Hesap Talebi — başarılı akış ve düz metin şifre yasağı');

$eposta1 = 'ayse.arge@ornek.com';
$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Ayşe Arge', 'email' => $eposta1, 'rol' => 'arge', 'sifre' => 'GucluSifre123'
], false);
Test::esit(200, $r['kod'], 'Geçerli talep oluşturuluyor');

$talepler = Test::oku('hesapTalepleri');
$t1 = null;
foreach ($talepler as $t) { if (($t['email'] ?? '') === $eposta1) { $t1 = $t; break; } }
Test::dogru($t1 !== null, 'Talep listede görünüyor');
Test::esit('bekliyor', $t1['durum'] ?? null, 'Yeni talep durum=bekliyor ile başlıyor');
Test::dogru(!isset($t1['sifre']), 'Talepte düz metin şifre YOK');
Test::dogru(isset($t1['sifreHash']) && strpos($t1['sifreHash'], '$2y$') === 0, 'Talepte bcrypt hash var');
Test::dogru(strpos(json_encode($talepler), 'GucluSifre123') === false, 'Şifrenin kendisi hiçbir alanda geçmiyor');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Ayşe Arge', 'email' => $eposta1, 'rol' => 'arge', 'sifre' => 'BaskaSifre456'
], false);
Test::esit(409, $r['kod'], 'Aynı e-posta ile bekleyen ikinci talep reddediliyor');

Test::bolum('Hesap Talebi Kararı — yetki sınırları');

$r = Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $t1['id'], 'karar' => 'onayla'], false);
Test::esit(401, $r['kod'], 'Oturumsuz karar isteği reddediliyor');

$depoTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'depo', 'sifre' => 'depo1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($depoTok), 'Depo girişi başarılı (rol testi için)');
$r = Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $t1['id'], 'karar' => 'onayla'], $depoTok);
Test::esit(403, $r['kod'], 'Yetkisiz rol (depo) karar veremiyor — yalnızca yönetim');

Test::bolum('Hesap Talebi Kararı — onay akışı (uçtan uca giriş doğrulaması)');

$oncekiKullanicilar = Test::oku('kullaniciler');
$oncekiSayi = count($oncekiKullanicilar ?? []);

$r = Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $t1['id'], 'karar' => 'onayla'], null);
Test::esit(200, $r['kod'], 'Yönetim talebi onaylıyor');
$atananKadi = $r['veri']['kullaniciAdi'] ?? null;
Test::esit('aysearge', $atananKadi, 'Kullanıcı adı e-postanın @ öncesinden türetiliyor (nokta gibi özel karakterler atılır)');

$yeniKullanicilar = Test::oku('kullaniciler');
Test::esit($oncekiSayi + 1, count($yeniKullanicilar ?? []), 'Onaydan sonra kullanıcı listesi 1 arttı');

$guncelTalepler = Test::oku('hesapTalepleri');
$t1Guncel = null;
foreach ($guncelTalepler as $t) { if ($t['id'] === $t1['id']) { $t1Guncel = $t; break; } }
Test::esit('onaylandi', $t1Guncel['durum'] ?? null, 'Talep durumu onaylandi olarak güncellendi');

// UÇTAN UCA: onaylanan hesap, talep sırasında girilen şifreyle GERÇEKTEN
// giriş yapabiliyor mu? (hash'in doğru taşındığının nihai kanıtı)
$r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => $atananKadi, 'sifre' => 'GucluSifre123'], false);
Test::esit(200, $r['kod'], 'Onaylanan hesap, talepte belirlenen şifreyle giriş yapabiliyor');
Test::dogru(!empty($r['veri']['ok']), 'Giriş yanıtı ok:true');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Ayşe Arge', 'email' => $eposta1, 'rol' => 'arge', 'sifre' => 'BaskaSifre456'
], false);
Test::esit(409, $r['kod'], 'Artık gerçek hesabı olan e-postayla yeni talep reddediliyor');

Test::bolum('Hesap Talebi Kararı — red akışı');

$eposta2 = 'mehmet.depo@ornek.com';
Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Mehmet Depo', 'email' => $eposta2, 'rol' => 'depo', 'sifre' => 'GucluSifre789'
], false);
$talepler = Test::oku('hesapTalepleri');
$t2 = null;
foreach ($talepler as $t) { if (($t['email'] ?? '') === $eposta2) { $t2 = $t; break; } }
Test::dogru($t2 !== null, 'İkinci talep oluşturuldu');

$sayiOnce = count(Test::oku('kullaniciler') ?? []);
$r = Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $t2['id'], 'karar' => 'reddet'], null);
Test::esit(200, $r['kod'], 'Yönetim talebi reddediyor');
$sayiSonra = count(Test::oku('kullaniciler') ?? []);
Test::esit($sayiOnce, $sayiSonra, 'Reddedilen talep yeni kullanıcı OLUŞTURMUYOR');

$guncelTalepler = Test::oku('hesapTalepleri');
$t2Guncel = null;
foreach ($guncelTalepler as $t) { if ($t['id'] === $t2['id']) { $t2Guncel = $t; break; } }
Test::esit('reddedildi', $t2Guncel['durum'] ?? null, 'Talep durumu reddedildi olarak güncellendi');

$r = Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $t2['id'], 'karar' => 'onayla'], null);
Test::esit(404, $r['kod'], 'Zaten karara bağlanmış talep tekrar onaylanamıyor');

Test::bolum('Kullanıcı adı çakışması otomatik çözülüyor');

$eposta3 = 'ayse.arge@baskadomain.com'; // aynı yerel kısım (ayse.arge), farklı domain
Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Ayşe Arge İkinci', 'email' => $eposta3, 'rol' => 'satis', 'sifre' => 'UcuncuSifre123'
], false);
$talepler = Test::oku('hesapTalepleri');
$t3 = null;
foreach ($talepler as $t) { if (($t['email'] ?? '') === $eposta3) { $t3 = $t; break; } }
$r = Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $t3['id'], 'karar' => 'onayla'], null);
Test::esit('aysearge2', $r['veri']['kullaniciAdi'] ?? null, 'Çakışan kullanıcı adının sonuna sayı eklendi');

// ── "Üst Yönetim" self-servis kayıtta seçilemez, yalnızca onaylayan ────────
// yönetim, mevcut bir başvuruyu bilinçli şekilde yükseltebilir. Bu, kendi
// kendine tam yetkili hesap talep etme yetki yükseltme açığını kapatır.
Test::bolum('Kendi kendine kayıtta "yonetim" rolü seçilemez, onayda yükseltilebilir');

$r = Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Sahte Yönetici', 'email' => 'sahteyonetici@ornek.com', 'rol' => 'yonetim', 'sifre' => 'GucluSifre789'
], false);
Test::esit(400, $r['kod'], '"yonetim" rolüyle self-servis talep reddediliyor');

$eposta4 = 'terfi.adayi@ornek.com';
Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Terfi Adayı', 'email' => $eposta4, 'rol' => 'depo', 'sifre' => 'TerfiSifre123'
], false);
$talepler = Test::oku('hesapTalepleri');
$t4 = null;
foreach ($talepler as $t) { if (($t['email'] ?? '') === $eposta4) { $t4 = $t; break; } }
Test::dogru($t4 !== null && $t4['rol'] === 'depo', 'Talep "depo" rolüyle bekliyor');

$r = Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $t4['id'], 'karar' => 'onayla', 'rol' => 'boyle_bir_rol_yok'], null);
Test::esit(400, $r['kod'], 'Onayda geçersiz rol override reddediliyor');

$r = Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $t4['id'], 'karar' => 'onayla', 'rol' => 'yonetim'], null);
Test::esit(200, $r['kod'], 'Yönetim, onayda "yonetim" rolüne YÜKSELTEBİLİYOR');
$kullanicilar = Test::oku('kullaniciler');
$yeniKullanici = null;
foreach ($kullanicilar as $k) { if (($k['kullaniciAdi'] ?? '') === ($r['veri']['kullaniciAdi'] ?? null)) { $yeniKullanici = $k; break; } }
Test::dogru($yeniKullanici !== null && $yeniKullanici['rol'] === 'yonetim', 'Oluşan kullanıcının rolü fiilen "yonetim" oldu');
$talepGuncel = null;
foreach (Test::oku('hesapTalepleri') as $t) { if ($t['id'] === $t4['id']) { $talepGuncel = $t; break; } }
Test::esit('yonetim', $talepGuncel['atananRol'] ?? null, 'İstenenden farklı verilen rol izi (atananRol) tutuldu');

Test::bolum('Şifre Değiştirme — güç kuralı');

$r = Test::istek('?action=changePassword', 'POST', ['userId' => 'USR-arge', 'yeniSifre' => 'kisa1'], null);
Test::esit(400, $r['kod'], 'Zayıf yeni şifre reddediliyor (changePassword)');
Test::dogru(strpos($r['veri']['error'] ?? '', 'karakter') !== false, 'Hata mesajı kuralı açıklıyor');

$r = Test::istek('?action=changePassword', 'POST', ['userId' => 'USR-arge', 'yeniSifre' => 'YeniGucluSifre1'], null);
Test::esit(200, $r['kod'], 'Güçlü yeni şifre kabul ediliyor (changePassword)');

Test::bolum('Toplu Şifre Sıfırlama — tahmin edilemeyen güçlü rastgele şifreler');

$depoTok2 = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'depo', 'sifre' => 'depo1234'], false);
    return $r['veri']['token'] ?? null;
})();
$r = Test::istek('?action=resetPasswords', 'POST', [], $depoTok2);
Test::esit(403, $r['kod'], 'Yetkisiz rol (depo) tüm şifreleri sıfırlayamıyor');

$r = Test::istek('?action=resetPasswords', 'POST', [], null);
Test::esit(200, $r['kod'], 'Yönetim tüm şifreleri sıfırlayabiliyor');
$yeniSifreler = $r['veri']['yeniSifreler'] ?? [];
Test::dogru(count($yeniSifreler) > 0, 'Her kullanıcı için yeni bir şifre döndü');
$hepsiGuclu = true; $hicBiriEskiDesenDegil = true;
foreach ($yeniSifreler as $ys) {
    $s = $ys['sifre'] ?? '';
    if (mb_strlen($s) < 10 || !preg_match('/[a-z]/', $s) || !preg_match('/[A-Z]/', $s) || !preg_match('/[0-9]/', $s)) {
        $hepsiGuclu = false;
    }
    if (preg_match('/^' . preg_quote($ys['kullaniciAdi'] ?? '\x00', '/') . '1234$/', $s)) {
        $hicBiriEskiDesenDegil = false;
    }
}
Test::dogru($hepsiGuclu, 'Üretilen tüm şifreler güç kuralını karşılıyor (10+ karakter, büyük/küçük/rakam)');
Test::dogru($hicBiriEskiDesenDegil, 'Hiçbir şifre eski tahmin edilebilir [kullaniciadi]1234 desenine uymuyor');

// Uçtan uca: sıfırlanan bir kullanıcı, dönen YENİ şifreyle giriş yapabiliyor mu?
$depoYeni = null;
foreach ($yeniSifreler as $ys) { if (($ys['kullaniciAdi'] ?? '') === 'depo') { $depoYeni = $ys['sifre']; break; } }
Test::dogru($depoYeni !== null, 'Depo için de yeni şifre üretildi');
$r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'depo', 'sifre' => $depoYeni], false);
Test::esit(200, $r['kod'], 'Depo, toplu sıfırlamadan dönen yeni şifreyle giriş yapabiliyor');
$r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'depo', 'sifre' => 'depo1234'], false);
Test::esit(401, $r['kod'], 'Depo artık ESKİ şifreyle giriş yapamıyor');
