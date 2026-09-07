<?php
// ── MONTAJ ŞEMASI — GOOGLE CLOUD VISION OCR ─────────────────────────────────
// İki katman test edilir (06/07 ile AYNI desen):
//   1) googleOcrYanitAyristir() — SAF fonksiyon, sabit (fixture) Google Vision
//      TEXT_DETECTION yanıtlarıyla, ağa/DB'ye hiç dokunmadan.
//   2) api.php?action=montajSemasiOkuGoogle uç noktası — gerçek HTTP üzerinden,
//      ama yalnızca ağ ÇAĞRISINDAN ÖNCEKİ davranış (auth, rol, doğrulama,
//      API anahtarı yapılandırılmamışsa DÜRÜST hata). Gerçek Google çağrısı
//      test ortamında YAPILMAZ (URETIMOS_GOOGLE_VISION_KEY bilerek tanımsız
//      bırakılır) — bu yüzden 503 + yapilandirmaEksik beklenir.

require_once __DIR__ . '/../google_ocr_ai.php';

Test::bolum('Google Vision OCR — saf yanıt ayrıştırma (ağsız)');

// Geçerli bir TEXT_DETECTION yanıtı — fullTextAnnotation.text tek blok, satırlar \n ile
$gecerliYanit = [
    'responses' => [[
        'fullTextAnnotation' => ['text' => "1 Oturma minderi 1\nVida M6X25MM 4\nsadece metin, adet yok\n2 Boş isim 0\n"]
    ]]
];
$r = googleOcrYanitAyristir($gecerliYanit);
Test::dogru($r['ok'] === true, 'Geçerli fullTextAnnotation ok:true döner');
Test::esit(2, count($r['parcalar'] ?? []), 'Geçersiz satırlar (adet yok / adet<=0) sessizce elenir');
Test::esit('1', $r['parcalar'][0]['no'] ?? null, 'NO + AD + ADET deseni: no doğru ayrıştırılır');
Test::esit('Oturma minderi', $r['parcalar'][0]['tahminiAd'] ?? null, 'NO + AD + ADET deseni: ad doğru ayrıştırılır');
Test::esit(1.0, $r['parcalar'][0]['adet'] ?? null, 'NO + AD + ADET deseni: adet doğru ayrıştırılır');
Test::esit('', $r['parcalar'][1]['no'] ?? null, 'AD + ADET deseni (no yok): no boş kalır');
Test::esit('Vida M6X25MM', $r['parcalar'][1]['tahminiAd'] ?? null, 'AD + ADET deseni: ad/ölçü ayrımı yapılamaz, birlikte kalır');
Test::esit(4.0, $r['parcalar'][1]['adet'] ?? null, 'AD + ADET deseni: adet doğru ayrıştırılır');
Test::dogru(strpos($r['genelNot'] ?? '', 'Google Cloud Vision') !== false, 'genelNot Google Vision uyarısı taşır');

// textAnnotations[0].description da desteklenmeli (fullTextAnnotation yoksa geri düşüş)
$sadeceTextAnnotations = [
    'responses' => [[
        'textAnnotations' => [['description' => "5 Somun M6 10"]]
    ]]
];
$r2 = googleOcrYanitAyristir($sadeceTextAnnotations);
Test::dogru($r2['ok'] === true, 'fullTextAnnotation yoksa textAnnotations[0].description kullanılır');
Test::esit('Somun M6', $r2['parcalar'][0]['tahminiAd'] ?? null, 'textAnnotations yolundan doğru ayrıştırılır');

// Google Vision hata döndürdüğünde (responses[0].error)
$hataYaniti = ['responses' => [['error' => ['message' => 'Invalid image content']]]];
$r3 = googleOcrYanitAyristir($hataYaniti);
Test::dogru($r3['ok'] === false, 'responses[0].error varsa ok:false döner');
Test::dogru(strpos($r3['hata'] ?? '', 'Invalid image content') !== false, 'Google hata mesajı taşınır');

$sonucYok = ['responses' => [['fullTextAnnotation' => ['text' => '']]]];
$r4 = googleOcrYanitAyristir($sonucYok);
Test::dogru($r4['ok'] === false, 'Boş metin ok:false döner');
Test::dogru(strpos($r4['hata'] ?? '', 'geçerli bir satır/tablo bulamadı') !== false, 'Hata mesajı anlaşılır');

Test::dogru(googleOcrYanitAyristir([])['ok'] === false, 'Boş dizi girdisi çökmeden ok:false döner');
Test::dogru(googleOcrYanitAyristir(null)['ok'] === false, 'null girdi çökmeden ok:false döner (is_array korumaları)');

Test::bolum('Google Vision OCR — YATAY NO/SIZE/QTY tablosu (konum tabanlı yeniden inşa)');

// Gerçek bir montaj şeması PDF'inde görülen düzeni taklit eder: NO satırı
// 1..6, SIZE satırı yalnızca bazı sütunlarda dolu (4/5/6 vidalı, 1/2/3'te
// ölçü yok), QTY satırı hepsinde dolu. Ayrıca sayfanın BAŞKA bir yerinde
// ("Step 1".."Step 3" diyagram alt yazıları gibi) tabloyla İLGİSİZ kelimeler
// var — eski satır-bazlı ayrıştırmanın yanlış eşleştirdiği tam senaryo.
function kelimeOlustur($metin, $x, $y) {
    return ['description' => $metin, 'boundingPoly' => ['vertices' => [
        ['x' => $x - 10, 'y' => $y - 8], ['x' => $x + 10, 'y' => $y - 8],
        ['x' => $x + 10, 'y' => $y + 8], ['x' => $x - 10, 'y' => $y + 8],
    ]]];
}
$sutunX = [100, 150, 200, 250, 300, 350];
$kelimeler = [
    ['description' => 'TÜM SAYFA METNİ (kullanılmaz)', 'boundingPoly' => ['vertices' => []]], // index 0
    // Tabloyla İLGİSİZ diyagram alt yazıları — başka bir y bandında
    kelimeOlustur('Step', 60, 50), kelimeOlustur('1', 90, 50),
    kelimeOlustur('Step', 160, 50), kelimeOlustur('2', 190, 50),
    kelimeOlustur('Step', 260, 50), kelimeOlustur('3', 290, 50),
    // NO satırı (etiket + 6 sütun)
    kelimeOlustur('NO', 50, 500),
    kelimeOlustur('1', $sutunX[0], 500), kelimeOlustur('2', $sutunX[1], 500),
    kelimeOlustur('3', $sutunX[2], 500), kelimeOlustur('4', $sutunX[3], 500),
    kelimeOlustur('5', $sutunX[4], 500), kelimeOlustur('6', $sutunX[5], 500),
    // SIZE satırı — yalnızca 4/5/6. sütunlarda değer var (1/2/3 vidasız parça)
    kelimeOlustur('SIZE', 50, 550),
    kelimeOlustur('M4X20MM', $sutunX[3], 550), kelimeOlustur('M4X30MM', $sutunX[4], 550),
    kelimeOlustur('M5X40MM', $sutunX[5], 550),
    // QTY satırı (etiket + 6 sütun)
    kelimeOlustur('QTY', 50, 600),
    kelimeOlustur('1pcs', $sutunX[0], 600), kelimeOlustur('1pcs', $sutunX[1], 600),
    kelimeOlustur('1pcs', $sutunX[2], 600), kelimeOlustur('2pcs', $sutunX[3], 600),
    kelimeOlustur('2pcs', $sutunX[4], 600), kelimeOlustur('3pcs', $sutunX[5], 600),
];
$yatayTabloYaniti = ['responses' => [['textAnnotations' => $kelimeler]]];
$r5 = googleOcrYanitAyristir($yatayTabloYaniti);
Test::dogru($r5['ok'] === true, 'Yatay tablo ok:true döner');
Test::esit(6, count($r5['parcalar'] ?? []), 'Tam 6 sütun/parça bulundu ("Step N" dağıtıcıları dahil değil)');
Test::esit('1', $r5['parcalar'][0]['no'] ?? null, '1. sütunun NO değeri doğru');
Test::esit(1.0, $r5['parcalar'][0]['adet'] ?? null, '1. sütunun adedi doğru (1pcs → 1)');
Test::esit('', $r5['parcalar'][0]['olcuSpec'] ?? null, '1. sütunda SIZE yok — boş kalır (vidasız parça)');
Test::esit('M4X20MM', $r5['parcalar'][3]['olcuSpec'] ?? null, '4. sütunun SIZE değeri doğru eşleşti');
Test::esit(3.0, $r5['parcalar'][5]['adet'] ?? null, '6. sütunun adedi doğru (3pcs → 3)');
Test::dogru(strpos($r5['parcalar'][0]['tahminiAd'] ?? '', 'Step') === false,
    '"Step" dağıtıcı kelimesi YANLIŞLIKLA parça adına karışmadı');
Test::dogru(strpos($r5['genelNot'] ?? '', 'KONUM') !== false, 'genelNot yeniden inşa yöntemini açıklıyor');
Test::dogru(strpos($r5['genelNot'] ?? '', 'SİZ adlandırmalısınız') !== false,
    'genelNot, parça adının OCR ile OKUNAMAYACAĞINI (yer tutucu olduğunu) açıkça belirtiyor');

// NO/QTY etiketleri yoksa (bu tablo düzeninde değilse) eski satır-bazlı
// ayrıştırmaya SESSİZCE düşülmeli — yukarıdaki "Geçerli fullTextAnnotation"
// testi zaten bunu dolaylı doğruluyor (o yanıtta textAnnotations[1..] yok).
$sadeceDagiticiKelimeler = ['responses' => [['textAnnotations' => [
    ['description' => 'hepsi', 'boundingPoly' => ['vertices' => []]],
    kelimeOlustur('Step', 60, 50), kelimeOlustur('1', 90, 50),
]]]];
$r6 = googleOcrYanitAyristir($sadeceDagiticiKelimeler);
Test::dogru($r6['ok'] === false, 'NO/QTY etiketi yoksa VE dağınık ölçü kodu da yoksa ok:false (yalnızca "Step"/"1" gibi alakasız kelimeler kod sayılmaz)');

Test::bolum('Google Vision OCR — DAĞINIK ÖLÇÜ/VİDA KODU (ikon/aksesuar ızgarası — ne tablo ne AD+ADET satırı var)');

// Gerçek bir kullanıcı raporunda görülen senaryo: "Accessories Diagram" /
// "Installation Diagram" gibi ayrı başlıklı ikon ızgaraları — her ikonun
// altında SADECE bir ölçü/vida kodu yazar (H6X45, M6X45...), ne NO/QTY
// tablosu ne düzenli "ad adet" satırı vardır. Başlık kelimeleri ve adım
// numaraları (Accessories/Diagram/Installation/1/2/3) KOD SAYILMAMALI.
$ikonIzgarasi = ['responses' => [['textAnnotations' => array_merge(
    [['description' => 'hepsi', 'boundingPoly' => ['vertices' => []]]],
    [kelimeOlustur('Accessories', 50, 20), kelimeOlustur('Diagram', 150, 20)],
    [kelimeOlustur('H6X45', 60, 120), kelimeOlustur('M6X45', 160, 120),
     kelimeOlustur('M6X35', 260, 120), kelimeOlustur('M6X25', 360, 120), kelimeOlustur('M6', 460, 120)],
    [kelimeOlustur('Installation', 50, 300), kelimeOlustur('Diagram', 180, 300)],
    [kelimeOlustur('1', 60, 350), kelimeOlustur('2', 160, 350), kelimeOlustur('3', 260, 350)]
)]]];
$r7 = googleOcrYanitAyristir($ikonIzgarasi);
Test::dogru($r7['ok'] === true, 'İkon ızgarası bile olsa ok:true döner (dağınık kod taraması devreye girer)');
Test::esit(5, count($r7['parcalar'] ?? []), 'Tam 5 ölçü/vida kodu bulundu (başlık/adım kelimeleri hariç)');
$kodlar = array_column($r7['parcalar'], 'olcuSpec');
Test::dogru(in_array('H6X45', $kodlar) && in_array('M6X45', $kodlar) && in_array('M6X35', $kodlar)
    && in_array('M6X25', $kodlar) && in_array('M6', $kodlar), 'Tüm kodlar (H6X45/M6X45/M6X35/M6X25/M6) doğru okundu');
Test::dogru(!in_array('ACCESSORIES', $kodlar) && !in_array('DIAGRAM', $kodlar) && !in_array('INSTALLATION', $kodlar),
    'Bölüm başlıkları ("Accessories"/"Diagram"/"Installation") kod SAYILMADI');
Test::dogru($r7['parcalar'][0]['adet'] === 1, 'Adet gerçek bilgi yokken dürüstçe varsayılan 1');
Test::dogru($r7['parcalar'][0]['no'] === '', 'no alanı boş bırakılır (şemada numara yok)');
Test::dogru(strpos($r7['parcalar'][0]['tahminiAd'], 'siz yazın') !== false, 'Ad UYDURULMAZ — ikona bakıp yazması için kullanıcıya yönlendirir');
Test::dogru(strpos($r7['genelNot'] ?? '', 'OKUYAMAZ') !== false, 'genelNot dürüstçe OCR\'ın ikonu okuyamadığını belirtiyor');

// Salt sayılar (sayfa no, yıl gibi) ve harf-only kelimeler kod sayılmamalı
Test::dogru(googleOcrOlcuKodlariBul([
    ['metin' => '2026', 'x' => 0, 'y' => 0], ['metin' => 'Adet', 'x' => 0, 'y' => 0],
    ['metin' => 'STEP', 'x' => 0, 'y' => 0]
]) === [], 'Salt sayı / harf-only kelimeler dağınık kod taramasında YOK sayılır');
Test::dogru(in_array('M6X45', googleOcrOlcuKodlariBul([['metin' => 'm6x45', 'x' => 0, 'y' => 0]])),
    'Küçük harfli kod da (m6x45) normalize edilip tanınır');

Test::bolum('Google Vision OCR — HARF+ADET REFERANS ETİKETLERİ (A#1, G#4 gibi) — GERÇEK bir kullanıcı şeması');

// Kullanıcının paylaştığı gerçek bir sandalye montaj şemasını taklit eder:
// "Accessories Diagram" bölümünde HER ikonun üstünde bir harf+GERÇEK adet
// etiketi var (A#1..F#1 tekil parçalar, G#4 dört tekerlek, H#1, sonra
// vidalı grupta hem harf+adet HEM ölçü kodu birlikte: I#6/M6X45, J#4/M6X35,
// K#3/M8X25, L#10/M6, ardından M#2/N#1/P#1). Önceki sürüm YALNIZCA ölçü
// kodlarını (M6X45 gibi) buluyordu, harf+adet etiketli 15 parçayı (asıl
// çoğunluk!) tamamen KAÇIRIYORDU — kullanıcı "tüm parçaları alması gerekli"
// diye bildirdi.
$aksesuarIzgarasi = ['responses' => [['textAnnotations' => array_merge(
    [['description' => 'hepsi', 'boundingPoly' => ['vertices' => []]]],
    [kelimeOlustur('Accessories', 50, 20), kelimeOlustur('Diagram', 150, 20)],
    [kelimeOlustur('A#1', 60, 70), kelimeOlustur('B#1', 160, 70), kelimeOlustur('C#1', 260, 70),
     kelimeOlustur('D#1', 360, 70), kelimeOlustur('E#1', 460, 70), kelimeOlustur('F#1', 560, 70),
     kelimeOlustur('G#4', 660, 70)],
    [kelimeOlustur('H#1', 60, 120),
     kelimeOlustur('I#6', 160, 120), kelimeOlustur('M6X45', 160, 150),
     kelimeOlustur('J#4', 260, 120), kelimeOlustur('M6X35', 260, 150),
     kelimeOlustur('K#3', 360, 120), kelimeOlustur('M8X25', 360, 150),
     kelimeOlustur('L#10', 460, 120), kelimeOlustur('M6', 460, 150),
     kelimeOlustur('M#2', 560, 120), kelimeOlustur('N#1', 660, 120), kelimeOlustur('P#1', 760, 120)]
)]]];
$r8 = googleOcrYanitAyristir($aksesuarIzgarasi);
Test::dogru($r8['ok'] === true, 'ok:true döner');
Test::esit(19, count($r8['parcalar'] ?? []), 'TÜM parçalar bulundu: 15 harf+adet etiketi + 4 ölçü kodu = 19 satır');
$harfler = array_column($r8['parcalar'], 'no');
foreach (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'P'] as $beklenen) {
    Test::dogru(in_array($beklenen, $harfler, true), "\"$beklenen\" harfli referans etiketi satıra dönüştü");
}
$harfAdetleri = [];
foreach ($r8['parcalar'] as $p) if ($p['no'] !== '') $harfAdetleri[$p['no']] = $p['adet'];
Test::esit(4, $harfAdetleri['G'] ?? null, 'G#4 -> adet GERÇEKTEN 4 (varsayılan 1 DEĞİL — şemada yazılı)');
Test::esit(6, $harfAdetleri['I'] ?? null, 'I#6 -> adet 6');
Test::esit(10, $harfAdetleri['L'] ?? null, 'L#10 -> iki haneli adet (10) doğru okundu');
Test::esit(1, $harfAdetleri['A'] ?? null, 'A#1 -> adet 1');
$olcuKodlari = array_column(array_filter($r8['parcalar'], fn($p) => $p['no'] === ''), 'olcuSpec');
Test::dogru(in_array('M6X45', $olcuKodlari) && in_array('M6X35', $olcuKodlari)
    && in_array('M8X25', $olcuKodlari) && in_array('M6', $olcuKodlari),
    'Harf etiketleriyle AYNI hücrelerde duran ölçü kodları da AYRICA satıra eklendi');
Test::dogru(strpos($r8['genelNot'] ?? '', 'GÜVENİLİRDİR') !== false,
    'genelNot harf+adet etiketlerinin adedinin TAHMİN değil GERÇEK olduğunu belirtiyor');

Test::dogru(googleOcrParcaEtiketleriBul([
    ['metin' => 'Accessories', 'x' => 0, 'y' => 0], ['metin' => 'Diagram', 'x' => 0, 'y' => 0],
    ['metin' => '1', 'x' => 0, 'y' => 0], ['metin' => 'M6X45', 'x' => 0, 'y' => 0]
]) === [], 'Başlık kelimeleri, salt sayılar ve ölçü kodları harf+adet etiketiyle KARIŞMAZ');
Test::esit(0, count(googleOcrParcaEtiketleriBul([['metin' => 'AB#0', 'x' => 0, 'y' => 0]])),
    'Adet 0 (ör. yanlış OCR okuması) geçersiz sayılır — atlanır');
$tekrarli = googleOcrParcaEtiketleriBul([
    ['metin' => 'A#1', 'x' => 0, 'y' => 0], ['metin' => 'A#1', 'x' => 100, 'y' => 100]
]);
Test::esit(1, count($tekrarli), 'Aynı harf iki kez geçerse (nadir OCR tekrarı) yalnızca BİR satır üretilir');

Test::bolum('Google Vision OCR — uç nokta (HTTP, gerçek ağ çağrısı YOK)');

$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], false);
Test::esit(401, $r['kod'], 'Oturumsuz istek reddedilir (401)');

$depoTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'depo', 'sifre' => 'depo1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($depoTok), 'Depo girişi başarılı (rol testi için)');
$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], $depoTok);
Test::esit(403, $r['kod'], 'Yetkisiz rol (depo) reddedilir (403) — ARGE/Teknik Ofis/Yönetim dışı erişemez');

$argeTok = (function () {
    $r = Test::istek('?action=login', 'POST', ['kullaniciAdi' => 'arge', 'sifre' => 'arge1234'], false);
    return $r['veri']['token'] ?? null;
})();
Test::dogru(!empty($argeTok), 'ARGE girişi başarılı');

$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => '', 'mediaType' => 'image/png'], $argeTok);
Test::esit(400, $r['kod'], 'Boş görsel reddedilir (400)');

$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/gif'], $argeTok);
Test::esit(400, $r['kod'], 'Desteklenmeyen görsel türü reddedilir (400)');

// Test sunucusunda URETIMOS_GOOGLE_VISION_KEY BİLEREK tanımsız — gerçek
// anahtar olmadan Google'a bağlanmaya ÇALIŞMADAN, dürüst bir yapılandırma
// hatası dönmesi beklenir (fabrikasyon veri değil).
$r = Test::istek('?action=montajSemasiOkuGoogle', 'POST', ['gorselB64' => 'x', 'mediaType' => 'image/png'], $argeTok);
Test::esit(503, $r['kod'], 'API anahtarı yapılandırılmamışken 503 döner (ağa hiç çıkmadan)');
Test::dogru($r['veri']['yapilandirmaEksik'] ?? false, 'yapilandirmaEksik bayrağı true — istemci bunu ayırt edebilir');
