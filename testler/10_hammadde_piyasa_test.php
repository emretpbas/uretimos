<?php
// ── HAMMADDE FİYAT ANOMALİ TESPİTİ — kur sapması + piyasa (internet) araması ──
// Üç katman test edilir:
//   1) tcmbXmlAyristir() / hammaddeKurSapmalariHesapla() — SAF fonksiyonlar,
//      TCMB'nin gerçek XML biçimine benzer sabit (fixture) verilerle.
//   2) aramaSonucundanFiyatCikar() / hammaddePiyasaSapmasiHesapla() — SAF
//      fonksiyonlar, Google Custom Search JSON biçimine benzer fixture'larla.
//   3) api.php uç noktaları — yalnızca ağ ÇAĞRISINDAN ÖNCEKİ davranış (auth,
//      rol). hammaddeKurKarsilastir GERÇEKTEN TCMB'ye bağlanmaya çalıştığından
//      (anahtarsız tasarım — kısa devre noktası yok) başarı yolu burada
//      DENENMEZ, yalnızca 401/403 sınırları test edilir. hammaddePiyasaArama
//      için URETIMOS_GOOGLE_SEARCH_KEY test ortamında BİLEREK tanımsız
//      bırakılır — diğer AI/OCR testleriyle AYNI desen (503 + yapilandirmaEksik).

require_once __DIR__ . '/../piyasa_fiyat_ai.php';

Test::bolum('TCMB Kur — XML ayrıştırma (ağsız)');

$ornekXml = <<<XML
<?xml version="1.0" encoding="ISO-8859-9"?>
<Tarih_Date Tarih="02.09.2026" Date="09/02/2026" Bulten_No="2026/166">
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
<Unit>1</Unit>
<Isim>ABD DOLARI</Isim>
<CurrencyName>US DOLLAR</CurrencyName>
<ForexBuying>34,1234</ForexBuying>
<ForexSelling>34,1876</ForexSelling>
</Currency>
<Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
<Unit>1</Unit>
<Isim>EURO</Isim>
<CurrencyName>EURO</CurrencyName>
<ForexBuying>37,0000</ForexBuying>
<ForexSelling>37,0891</ForexSelling>
</Currency>
</Tarih_Date>
XML;

$kur = tcmbXmlAyristir($ornekXml);
Test::dogru($kur !== null, 'Geçerli TCMB XML\'i ayrıştırılıyor');
Test::esit(34.1876, $kur['usdTry'] ?? null, 'USD satış kuru doğru okunuyor (virgül → nokta)');
Test::esit(37.0891, $kur['eurTry'] ?? null, 'EUR satış kuru doğru okunuyor');
Test::esit('02.09.2026', $kur['tarih'] ?? null, 'Bülten tarihi doğru okunuyor');

Test::dogru(tcmbXmlAyristir('') === null, 'Boş metin null döner (çökmeden)');
Test::dogru(tcmbXmlAyristir('<gecersiz><xml') === null, 'Bozuk XML null döner (çökmeden)');
Test::dogru(tcmbXmlAyristir('<Tarih_Date Tarih="x"><Currency CurrencyCode="USD"><ForexSelling>10</ForexSelling></Currency></Tarih_Date>') === null,
    'Yalnızca USD varsa (EUR eksik) null döner');

Test::bolum('Kur Sapması Hesabı (ağsız)');

$hammaddeler = [
    ['id' => 'HM1', 'stokKodu' => 'VDA-001', 'ad' => 'Vida M6', 'birimFiyat' => 0.10, 'dvz' => 'USD'],
    ['id' => 'HM2', 'stokKodu' => 'KUM-002', 'ad' => 'Kumaş Metre', 'birimFiyat' => 5.0, 'dvz' => '€'],
    ['id' => 'HM3', 'stokKodu' => 'TL-003', 'ad' => 'Yerli Malzeme', 'birimFiyat' => 100, 'dvz' => 'TL'],
];
$guncelKurlar = ['usdTry' => 40.0, 'eurTry' => 44.0, 'tarih' => '02.09.2026'];
// Sistemde ESKİ kur kayıtlı: USD=34 (güncelden %17,6 sapma → eşik %5'i aşar),
// EUR=43,8 (güncelden ~%0,45 sapma → eşiği AŞMAZ, listeye girmemeli)
$ayarlar = ['usdTry' => 34.0, 'eurTry' => 43.8];

$anomaliler = hammaddeKurSapmalariHesapla($hammaddeler, $guncelKurlar, $ayarlar);
Test::esit(1, count($anomaliler), 'Yalnızca eşiği aşan (USD) sapma listede — EUR ve TL elenir');
Test::esit('HM1', $anomaliler[0]['hammaddeId'] ?? null, 'Doğru hammadde işaretlendi');
Test::esit('kur_sapmasi', $anomaliler[0]['tur'] ?? null, 'Tür kur_sapmasi olarak işaretlendi');
Test::dogru(($anomaliler[0]['sapmaYuzde'] ?? 0) > 0, 'Sapma yüzdesi pozitif (fiyat artmış)');
Test::esit(3.4, $anomaliler[0]['sistemFiyatTL'] ?? null, 'Sistem TL fiyatı doğru hesaplandı (0.10 × 34)');
Test::esit(4.0, $anomaliler[0]['guncelFiyatTL'] ?? null, 'Güncel TL fiyatı doğru hesaplandı (0.10 × 40)');

Test::dogru(hammaddeKurSapmalariHesapla([], $guncelKurlar, $ayarlar) === [], 'Boş hammadde listesi boş sonuç döner');
Test::dogru(hammaddeKurSapmalariHesapla($hammaddeler, $guncelKurlar, []) === [], 'Sistemde kur hiç tanımlı değilse sessizce atlanır (çökmez)');

Test::bolum('Piyasa Araması — sonuçtan fiyat çıkarma (ağsız)');

$aramaYanitiTL = ['items' => [
    ['title' => 'Vida M6x25 Fiyatı', 'snippet' => 'Ürün fiyatı 12,50 TL, stoklarda mevcut.', 'link' => 'https://ornek.com/vida'],
]];
$bulunanTL = aramaSonucundanFiyatCikar($aramaYanitiTL);
Test::dogru($bulunanTL !== null, 'TL fiyat kalıbı yakalanıyor');
Test::esit(12.50, $bulunanTL['fiyat'] ?? null, 'Türkçe ondalık (virgül) doğru sayıya çevriliyor');
Test::esit('TL', $bulunanTL['dvz'] ?? null, 'Para birimi TL olarak işaretlendi');
Test::esit('https://ornek.com/vida', $bulunanTL['kaynak'] ?? null, 'Kaynak linki taşınıyor');

$aramaYanitiBinlik = ['items' => [
    ['title' => 'Toptan Kumaş', 'snippet' => 'Fiyatı ₺1.234,56 olarak listelenmiştir.', 'link' => 'https://ornek.com/kumas'],
]];
$bulunanBinlik = aramaSonucundanFiyatCikar($aramaYanitiBinlik);
Test::esit(1234.56, $bulunanBinlik['fiyat'] ?? null, 'Binlik ayraçlı (nokta) TL fiyatı doğru ayrıştırılıyor');

$aramaYanitiUsd = ['items' => [
    ['title' => 'Import Part', 'snippet' => 'Price is $3.99 per unit, no local currency mentioned.', 'link' => 'https://ornek.com/parca'],
]];
$bulunanUsd = aramaSonucundanFiyatCikar($aramaYanitiUsd);
Test::esit(3.99, $bulunanUsd['fiyat'] ?? null, 'TL bulunamazsa USD kalıbı ikincil olarak yakalanıyor');
Test::esit('USD', $bulunanUsd['dvz'] ?? null, 'Para birimi USD olarak işaretlendi');

$aramaYanitiBos = ['items' => [['title' => 'Alakasız sonuç', 'snippet' => 'Hiç fiyat bilgisi yok.', 'link' => 'https://ornek.com/x']]];
Test::dogru(aramaSonucundanFiyatCikar($aramaYanitiBos) === null, 'Fiyat kalıbı yoksa null döner');
Test::dogru(aramaSonucundanFiyatCikar([]) === null, 'Boş yanıt null döner (çökmeden)');
Test::dogru(aramaSonucundanFiyatCikar(null) === null, 'null girdi çökmeden null döner');

Test::bolum('Piyasa Sapması Hesabı (ağsız)');

$hmVida = ['id' => 'HM1', 'stokKodu' => 'VDA-001', 'ad' => 'Vida M6', 'birimFiyat' => 5.0, 'dvz' => 'TL'];
$bulunanYuksek = ['fiyat' => 12.50, 'dvz' => 'TL', 'kaynak' => 'https://ornek.com/vida', 'baslik' => 'Vida M6x25'];
$anomaliPiyasa = hammaddePiyasaSapmasiHesapla($hmVida, $bulunanYuksek, []);
Test::dogru($anomaliPiyasa !== null, 'Büyük sapma (5 TL → 12.50 TL, %150) anomali olarak işaretleniyor');
Test::esit('piyasa_sapmasi', $anomaliPiyasa['tur'] ?? null, 'Tür piyasa_sapmasi olarak işaretlendi');
Test::dogru(strpos($anomaliPiyasa['aciklama'] ?? '', 'TAHMİNİDİR') !== false, 'Açıklama TAHMİNİ olduğunu açıkça belirtiyor');

$bulunanYakin = ['fiyat' => 5.20, 'dvz' => 'TL', 'kaynak' => 'https://ornek.com/vida2', 'baslik' => 'Vida'];
Test::dogru(hammaddePiyasaSapmasiHesapla($hmVida, $bulunanYakin, []) === null, 'Küçük sapma (%4) eşiği aşmadığından anomali SAYILMIYOR');

Test::dogru(hammaddePiyasaSapmasiHesapla($hmVida, null, []) === null, 'Arama sonucu yoksa null döner (çökmeden)');

Test::bolum('Hammadde Piyasa Uç Noktaları — yetki sınırları (HTTP)');

$r = Test::istek('?action=hammaddeKurKarsilastir', 'GET', null, false);
Test::esit(401, $r['kod'], 'hammaddeKurKarsilastir: oturumsuz istek reddediliyor');

// NOT: sabit 'depo'/'depo1234' gibi bootstrap şifrelerine GÜVENİLMEZ —
// 09_hesap_talep_test.php bu dosyadan ÖNCE çalışıp resetPasswords ile TÜM
// varsayılan hesapların şifresini değiştiriyor (paylaşılan test veritabanı,
// dosyalar arası sıralı çalışır). Bunun yerine, şifresini KENDİMİZİN
// belirlediği taze bir 'depo' rollü hesap self-registration akışıyla
// (hesapTalepEt + hesapTalepiKarar) oluşturulup rol sınırı bu hesapla
// test edilir — hiçbir başka dosyanın durumuna bağımlı değildir.
$depoEposta = 'test-depo-piyasa@ornek.com';
Test::istek('?action=hesapTalepEt', 'POST', [
    'ad' => 'Test Depo Piyasa', 'email' => $depoEposta, 'rol' => 'depo', 'sifre' => 'DepoTestSifre123'
], false);
$talepler = Test::oku('hesapTalepleri');
$depoTalep = null;
foreach ($talepler as $t) { if (($t['email'] ?? '') === $depoEposta) { $depoTalep = $t; break; } }
Test::dogru($depoTalep !== null, 'Test için geçici depo hesabı talebi oluşturuldu');
Test::istek('?action=hesapTalepiKarar', 'POST', ['id' => $depoTalep['id'], 'karar' => 'onayla'], null);

$depoTok = (function () use ($depoEposta) {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'testdepopiyasa', 'sifre' => 'DepoTestSifre123'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($depoTok), 'Geçici depo hesabıyla giriş başarılı (rol testi için)');
$r = Test::istek('?action=hammaddeKurKarsilastir', 'GET', null, $depoTok);
Test::esit(403, $r['kod'], 'hammaddeKurKarsilastir: yetkisiz rol (depo) reddediliyor');

$r = Test::istek('?action=hammaddePiyasaArama', 'POST', ['hammaddeIds' => ['HM1']], false);
Test::esit(401, $r['kod'], 'hammaddePiyasaArama: oturumsuz istek reddediliyor');

$r = Test::istek('?action=hammaddePiyasaArama', 'POST', ['hammaddeIds' => ['HM1']], $depoTok);
Test::esit(403, $r['kod'], 'hammaddePiyasaArama: yetkisiz rol (depo) reddediliyor');

// Bundan sonraki kontroller rol sınırını değil, doğrulama/yapılandırma
// davranışını test ediyor — varsayılan (yönetim) test oturumu yeterli.
$r = Test::istek('?action=hammaddePiyasaArama', 'POST', ['hammaddeIds' => []], null);
Test::esit(400, $r['kod'], 'Boş hammaddeIds reddediliyor');

$cokFazla = array_map(fn($i) => 'HM' . $i, range(1, 25));
$r = Test::istek('?action=hammaddePiyasaArama', 'POST', ['hammaddeIds' => $cokFazla], null);
Test::esit(400, $r['kod'], '20\'den fazla id (kota) reddediliyor');

// Test sunucusunda URETIMOS_GOOGLE_SEARCH_KEY BİLEREK tanımsız — gerçek
// anahtar olmadan Google\'a bağlanmaya ÇALIŞMADAN dürüst bir yapılandırma
// hatası dönmesi beklenir (diğer AI/OCR uçlarıyla AYNI desen).
$r = Test::istek('?action=hammaddePiyasaArama', 'POST', ['hammaddeIds' => ['HM1']], null);
Test::esit(503, $r['kod'], 'API anahtarı yapılandırılmamışken 503 döner (ağa hiç çıkmadan)');
Test::dogru($r['veri']['yapilandirmaEksik'] ?? false, 'yapilandirmaEksik bayrağı true — istemci bunu ayırt edebilir');
