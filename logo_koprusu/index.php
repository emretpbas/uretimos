<?php
// ════════════════════════════════════════════════════════════════════════════
// LOGO SQL KÖPRÜSÜ — ÜretimOS'un "ERP Entegrasyon Merkezi"ne LOGO'nun SQL
// Server veritabanından salt-okunur veri sağlayan BAĞIMSIZ bir HTTP köprüsü.
// ────────────────────────────────────────────────────────────────────────────
// NEDEN GEREKLİ: ÜretimOS'un mevcut Entegrasyon Merkezi (bkz. ag_entegrasyon.js
// / page_ag_entegrasyon.js) TARAYICIDAN doğrudan JSON döndüren bir HTTP
// adresine bağlanır — bu, tasarım gereği güvenlik politikasıyla yalnızca
// aynı-origin veya *.local adreslerle sınırlıdır (bkz. .htaccess CSP). LOGO'nun
// SQL Server veritabanı ise HTTP değil TDS protokolü konuşur; tarayıcı ham bir
// veritabanı bağlantısı AÇAMAZ. Bu script o farkı kapatır: LOGO SQL Server'a
// PHP ile bağlanır, sonucu ÜretimOS'un beklediği düz JSON kayıt dizisine
// çevirir — ÜretimOS'un kendisinde HİÇBİR kod değişikliği GEREKMEZ, yalnızca
// Entegrasyon Merkezi'ne bu köprünün adresini bir "Bağlantı Profili" olarak
// eklemeniz yeterlidir (bkz. logo_koprusu/README.md).
//
// NEREYE KURULUR: cPanel'deki ana ÜretimOS klasörüne DEĞİL — LOGO SQL
// sunucusuna ağ üzerinden erişebilen, şirket içi (yerel ağ) bir bilgisayara/
// sunucuya. En basiti: "Doxa_Logo_Sql_Server" ODBC veri kaynağının zaten
// tanımlı olduğu AYNI Windows bilgisayar (bkz. README "Yöntem 1").
//
// GÜVENLİK: Gerçek kullanıcı adı/şifre bu dosyada DEĞİL, yanındaki
// ayarlar.php dosyasında tutulur. ayarlar.php .gitignore'dadır, ASLA git'e
// eklenmez — bu klasördeki ayarlar.ornek.php'yi ayarlar.php olarak kopyalayıp
// kendi bilgilerinizi oraya yazın. Bu köprü SALT OKUNUR sorgular çalıştırır;
// LOGO veritabanına asla yazma/güncelleme yapmaz.
// ════════════════════════════════════════════════════════════════════════════

// ── ÖLÜMCÜL HATA YAKALAMA ─────────────────────────────────────────────────
// GERÇEK TESTTE YAKALANDI: bir sorgu PHP'nin max_execution_time sınırını
// aşınca (ör. kötü bir SQL Server sorgu planı), PHP varsayılan olarak HTTP
// 200 ile düz metin/HTML bir hata sayfası basıyordu — ÜretimOS bunu JSON
// sanıp sessizce "beklenmeyen biçim" diye bozuluyordu, gerçek sebep hiç
// görünmüyordu. display_errors kapatılıp (üretimde zaten olması gereken),
// register_shutdown_function ile her türlü ölümcül hata (zaman aşımı dahil)
// yakalanıp düzgün bir 500 + JSON hata gövdesine çevriliyor.
ini_set('display_errors', '0');
register_shutdown_function(function () {
    $hata = error_get_last();
    if (!$hata || !in_array($hata['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) return;
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode([
        'hata' => 'Sunucuda beklenmeyen/ölümcül bir hata oluştu: ' . $hata['message']
            . ' (' . basename($hata['file']) . ':' . $hata['line'] . ')'
            . ' — süre aşımıysa muhtemelen kötü bir SQL sorgu planı; ayarlar.php\'deki tablo adlarını ve varsa indeksleri kontrol edin.',
    ], JSON_UNESCAPED_UNICODE);
});

header('Content-Type: application/json; charset=utf-8');

$ayarYolu = __DIR__ . '/ayarlar.php';
if (!file_exists($ayarYolu)) {
    http_response_code(500);
    echo json_encode(['hata' => 'ayarlar.php bulunamadı. ayarlar.ornek.php dosyasını ayarlar.php olarak kopyalayıp kendi bilgilerinizi girin.'], JSON_UNESCAPED_UNICODE);
    exit;
}
$ayar = require $ayarYolu;

// ── CORS (tarayıcıdan çapraz-kaynak erişim) ──────────────────────────────
// GERÇEK TESTTE YAKALANDI: bu köprünün adresi ÜretimOS'un kendi origininden
// FARKLI (host/port farklı) olduğu için tarayıcı önce bir OPTIONS
// "preflight" isteği gönderir. Preflight, X-API-Key başlığını TAŞIMAZ —
// özel başlıklar yalnızca asıl istekte gönderilir — bu yüzden CORS/OPTIONS
// yanıtı aşağıdaki API anahtarı kontrolünden ÖNCE ve o kontrole HİÇ
// TAKILMADAN verilmelidir; aksi halde preflight 401 alır ve tarayıcı asıl
// isteği hiç göndermez.
$izinliKaynaklar = $ayar['izinliKaynaklar'] ?? [];
$gelenKaynak = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($gelenKaynak !== '' && in_array($gelenKaynak, $izinliKaynaklar, true)) {
    header('Access-Control-Allow-Origin: ' . $gelenKaynak);
    header('Vary: Origin');
    // Chrome'un "Private Network Access" politikası: herkese açık bir
    // origin (ör. https://uretimos.com.tr) özel/yerel bir adrese (bu
    // köprü) istek atınca ayrıca bu izni ister — yoksa preflight sessizce
    // reddedilir, X-API-Key doğru olsa bile isteğe hiç sıra gelmez.
    header('Access-Control-Allow-Private-Network: true');
}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: X-API-Key');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── ERİŞİM KONTROLÜ ──────────────────────────────────────────────────────
// Bu köprüye rastgele/dışarıdan erişimi engelleyen paylaşımlı anahtar.
// ÜretimOS'un Entegrasyon Merkezi'nde "Başlık ile" kimlik doğrulama seçilip
// başlık adı X-API-Key, değer bu anahtar olarak girilir.
$gelenAnahtar = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['anahtar'] ?? '');
if (empty($ayar['apiAnahtari']) || !hash_equals((string)$ayar['apiAnahtari'], (string)$gelenAnahtar)) {
    http_response_code(401);
    echo json_encode(['hata' => 'Geçersiz veya eksik API anahtarı (X-API-Key başlığı ya da ?anahtar= parametresi).'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── SORGU SEÇİMİ ─────────────────────────────────────────────────────────
// GERÇEK ÜRETİM VERİSİYLE DOĞRULANDI (bir önceki sürümdeki Urun_Kart_Turu_Adi
// metin tahmini YANLIŞTI): sınıflandırma Urun_Kart_Turu_Kodu sayısal
// sütununda — 10 Hammadde, 11 Yarı Mamul, 12 Mamul, 13 Tüketim Malı.
// Aktiflik URUN_AKTIF sütunuyla süzülür. Gerçek aktif kayıt sayıları çok
// büyük (Mamul 20.581, Yarı Mamul 63.792) — bu yüzden TOP N yerine
// OFFSET/FETCH ile SAYFALAMA yapılıyor; çağıran taraf ?sayfa=1,2,3…
// diyerek tüm kayıtları adım adım çeker, tek istekte hepsini çekmeye çalışıp
// zaman aşımına/bellek hatasına girmez.
$tip = $_GET['tip'] ?? 'tumu';
$sayfa = max(1, (int)($_GET['sayfa'] ?? 1));
$adet = min(5000, max(1, (int)($_GET['adet'] ?? 2000)));
$offset = ($sayfa - 1) * $adet;

$tablo = $ayar['tablo'] ?? '';
$siraSutunu = $ayar['siraSutunu'] ?? 'StokKodu';

// ── FİYAT SORGULARI — GERÇEK ÜRETİM VERİSİYLE (LogoRead ile doğrudan SSMS
// sorgusuyla) DOĞRULANDI. Ana ürün tablosuna JOIN + (fiyat listesinde ürün
// başına BİRDEN FAZLA tarih-aralıklı satır olabildiği için) ROW_NUMBER ile
// tekilleştirme gerektirdiğinden basit WHERE-koşulu kalıbına (aşağıdaki
// $KOSULLAR) SIĞMAZLAR; ayrı, tam SQL şablonları olarak tanımlandı.
function fiyatSorgulari(array $ayar, string $urunTablo, int $offset, int $adet): array
{
    // "SonSatinalmaFiyati" GÖRÜNÜMÜ zaten ürün başına TEK satır üretiyor
    // (11.176 satır ↔ 11.176 farklı ürün, doğrulandı) — ayrıca tekilleştirme
    // gerekmiyor.
    $sonAlisTablo = $ayar['sonAlisTablo'] ?? 'Doxa_Programs.dbo.ww_SonSatinalmaFiyati';
    $sonAlisSql = "SELECT t.StokKodu, t.StokAdi, t.Urun_AnaBirim, s.SONFIYAT AS FIYAT, s.SAY
        FROM $urunTablo t INNER JOIN $sonAlisTablo s ON s.STOCKREF = t.StokLogic
        WHERE t.URUN_AKTIF = 1
        ORDER BY t.StokKodu
        OFFSET $offset ROWS FETCH NEXT $adet ROWS ONLY";
    $sonAlisSayim = "SELECT COUNT(*) FROM $urunTablo t INNER JOIN $sonAlisTablo s ON s.STOCKREF = t.StokLogic
        WHERE t.URUN_AKTIF = 1";

    // LOGO fiyat listesi (LG_222_PRCLIST) AYRI BİR VERİTABANINDA (firma
    // dönemine göre isimlenir, ör. DOXA_2022 — YIL DEĞİŞİNCE bu ayarı
    // güncellemeniz gerekebilir, bkz. ayarlar.ornek.php). PTYPE: 1=satınalma,
    // 2=satış. ACTIVE=0 GÜNCEL demektir (LOGO kuralı, ters gibi görünse de
    // doğrulandı). Ürün başına birden fazla tarih-aralıklı satır olabildiği
    // için GETDATE() aralığa düşen VE en yeni BEGDATE'e sahip TEK satır
    // seçiliyor (ROW_NUMBER).
    $fiyatDb = $ayar['fiyatListesiVeritabani'] ?? 'DOXA_2022';
    $fiyatTablo = $ayar['fiyatListesiTablo'] ?? 'dbo.LG_222_PRCLIST';
    // CURRENCY=160(TL) ile SINIRLI — GERÇEK VERİDE USD(1)/EUR(20) satırları
    // da bulundu. ÜretimOS tarafı (ag_entegrasyon.js) bugün fiyatı DÖVİZ
    // AYRIMI YAPMADAN doğrudan TL varsayarak yazıyor (`h.dvz = 'TL'`) — döviz
    // satırını filtrelemeden bırakmak YANLIŞ TL fiyatı kaydına yol açardı.
    // Döviz dönüşümü/çok para birimli akış ayrı bir iş — istenirse
    // ayarlar.php'de bu koşulu değiştirin.
    $paraBirimi = (int)($ayar['fiyatParaBirimiKodu'] ?? 160);
    $fiyatListesi = function (int $ptype) use ($urunTablo, $fiyatDb, $fiyatTablo, $paraBirimi, $offset, $adet) {
        return "WITH FiyatSirali AS (
                SELECT p.CARDREF, p.PRICE, p.CURRENCY, p.BEGDATE, p.ENDDATE, p.CODE,
                       ROW_NUMBER() OVER (PARTITION BY p.CARDREF ORDER BY p.BEGDATE DESC) AS sira
                FROM $fiyatDb.$fiyatTablo p
                WHERE p.PTYPE = $ptype AND p.ACTIVE = 0 AND p.CURRENCY = $paraBirimi
                  AND GETDATE() BETWEEN p.BEGDATE AND p.ENDDATE
            )
            SELECT t.StokKodu, t.StokAdi, t.Urun_AnaBirim, f.PRICE AS FIYAT, f.CURRENCY, f.BEGDATE, f.ENDDATE, f.CODE
            FROM $urunTablo t INNER JOIN FiyatSirali f ON f.CARDREF = t.StokLogic AND f.sira = 1
            WHERE t.URUN_AKTIF = 1
            ORDER BY t.StokKodu
            OFFSET $offset ROWS FETCH NEXT $adet ROWS ONLY";
    };
    $fiyatListesiSayim = function (int $ptype) use ($urunTablo, $fiyatDb, $fiyatTablo, $paraBirimi) {
        return "WITH FiyatSirali AS (
                SELECT p.CARDREF,
                       ROW_NUMBER() OVER (PARTITION BY p.CARDREF ORDER BY p.BEGDATE DESC) AS sira
                FROM $fiyatDb.$fiyatTablo p
                WHERE p.PTYPE = $ptype AND p.ACTIVE = 0 AND p.CURRENCY = $paraBirimi
                  AND GETDATE() BETWEEN p.BEGDATE AND p.ENDDATE
            )
            SELECT COUNT(*) FROM $urunTablo t INNER JOIN FiyatSirali f ON f.CARDREF = t.StokLogic AND f.sira = 1
            WHERE t.URUN_AKTIF = 1";
    };

    return [
        'son_alis'    => ['sorgu' => $sonAlisSql, 'sayim' => $sonAlisSayim],
        'fiyat_satis' => ['sorgu' => $fiyatListesi(2), 'sayim' => $fiyatListesiSayim(2)],
        'fiyat_alis'  => ['sorgu' => $fiyatListesi(1), 'sayim' => $fiyatListesiSayim(1)],
    ];
}

// ── SİPARİŞ SORGULARI — GERÇEK ÜRETİM VERİSİYLE (LogoRead ile doğrudan SSMS
// sorgusuyla) DOĞRULANDI. Kaynak tablo DÜZ (satır bazında, başlık bilgisi
// her kalemde TEKRAR EDİYOR) — ÜretimOS'un "Sipariş" hedefi ise İÇ İÇE bir
// yapı (sipariş → kalemler dizisi) bekliyor. Bu yüzden sayfalama SİPARİŞ
// bazında yapılır (satır bazında DEĞİL): aksi halde bir siparişin kalemleri
// iki sayfaya bölünüp aynı sipariş iki eksik parça halinde görünebilirdi —
// önce OFFSET/FETCH ile bir "sipariş no" sayfası seçilir, SONRA o siparişlerin
// TÜM kalemleri (sayfa sınırına bakılmaksızın) çekilir.
function siparisSorgulari(array $ayar, int $offset, int $adet): array
{
    $siparisTablo = $ayar['siparisTablo'] ?? 'Doxa_Programs.dbo.tbl_Mel_Siparis_Tablosu_222_01';
    $cariTablo = $ayar['cariTablo'] ?? 'Doxa_Programs..tbl_Mel_Cariler_222';
    $urunTablo = $ayar['tablo'] ?? 'Doxa_Programs..tbl_Mel_Urunler_222';

    $satirSecim = "s.sipNo AS SipNo, s.siparisTarihi AS SiparisTarihi, s.siparisTerminTarihi AS TerminTarihi,
            c.Cari AS CariKodu, c.CariAdi AS CariAdi,
            u.StokKodu AS StokKodu, u.StokAdi AS StokAdi, u.Urun_AnaBirim AS Birim,
            s.sipMiktar AS Miktar, s.bekleyenMiktar AS BekleyenMiktar, s.sipNetTutar AS Tutar";
    $joinler = "FROM $siparisTablo s
        JOIN $cariTablo c ON c.CariLogic = s.cariRef
        JOIN $urunTablo u ON u.StokLogic = s.stockref";

    $siparisSorgu = function (string $kosul) use ($satirSecim, $joinler, $siparisTablo, $offset, $adet): array {
        $sorgu = "WITH SiparisTarihleri AS (
                SELECT sipNo, MIN(siparisTarihi) AS siparisTarihi
                FROM $siparisTablo s WHERE $kosul GROUP BY sipNo
            ), SiparisSayfasi AS (
                SELECT sipNo FROM SiparisTarihleri
                ORDER BY siparisTarihi DESC, sipNo
                OFFSET $offset ROWS FETCH NEXT $adet ROWS ONLY
            )
            SELECT $satirSecim
            $joinler
            JOIN SiparisSayfasi sp ON sp.sipNo = s.sipNo
            WHERE $kosul
            ORDER BY s.sipNo, s.sipSiraNo";
        $sayim = "SELECT COUNT(DISTINCT sipNo) FROM $siparisTablo s WHERE $kosul";
        return ['sorgu' => $sorgu, 'sayim' => $sayim];
    };

    // tip=siparis — AÇIK (bekleyen) siparişler. Küçük hacim (~199 sipariş/
    // 849 satır, doğrulandı) — varsayılan sayfa boyutuna rahatça sığar.
    $acik = $siparisSorgu('s.lineType = 0 AND s.bekleyenMiktar > 0');
    // tip=siparis_tumu — SON 1 YIL (34.797 siparişin TAMAMI değil — her
    // seferinde 4+ yıllık geçmişi çekmek pratik değil; ihtiyaç olursa
    // ayarlar.php'de 'siparisKosullari.tumu' ile tarih aralığını genişletin).
    $tumu = $siparisSorgu("s.lineType = 0 AND s.siparisTarihi >= DATEADD(YEAR, -1, CAST(GETDATE() AS DATE))");

    return [
        'siparis'      => $acik,
        'siparis_tumu' => $tumu,
    ];
}

// Satır bazlı (ham) sonucu, her sipariş TEK kayıt + Kalemler dizisi olacak
// şekilde yeniden şekillendirir. GRUPLAMA, sayfalamadan SONRA ama JSON
// kodlamadan ÖNCE yapılır — SiparisSayfasi CTE'si zaten o sayfaya düşen
// siparişlerin TÜM kalemlerini (bölünmeden) getirdiği için burada eksik
// kalem riski yoktur.
function satirlariSiparisOlarakGrupla(array $satirlar): array
{
    $siparisler = [];
    foreach ($satirlar as $s) {
        $kod = $s['SipNo'] ?? '';
        if ($kod === '') continue;
        if (!isset($siparisler[$kod])) {
            $siparisler[$kod] = [
                'SipNo' => $s['SipNo'], 'CariKodu' => $s['CariKodu'] ?? null, 'CariAdi' => $s['CariAdi'] ?? null,
                'SiparisTarihi' => $s['SiparisTarihi'] ?? null, 'TerminTarihi' => $s['TerminTarihi'] ?? null,
                'Tutar' => 0, 'Kalemler' => [],
            ];
        }
        $siparisler[$kod]['Tutar'] += (float)($s['Tutar'] ?? 0);
        // Termin tarihi GERÇEK VERİDE satır bazında farklı çıkabiliyor
        // (doğrulandı) — başlıkta siparişin EN ERKEN terminini gösteriyoruz.
        if (!empty($s['TerminTarihi']) && (empty($siparisler[$kod]['TerminTarihi']) || $s['TerminTarihi'] < $siparisler[$kod]['TerminTarihi'])) {
            $siparisler[$kod]['TerminTarihi'] = $s['TerminTarihi'];
        }
        $miktar = (float)($s['Miktar'] ?? 0);
        $siparisler[$kod]['Kalemler'][] = [
            'StokKodu' => $s['StokKodu'] ?? null, 'StokAdi' => $s['StokAdi'] ?? null, 'Birim' => $s['Birim'] ?? null,
            'Miktar' => $s['Miktar'] ?? null, 'BekleyenMiktar' => $s['BekleyenMiktar'] ?? null,
            // Birim fiyat ayrı bir sütun DEĞİL — LOGO'da satır tutarından
            // türetiliyor (doğrulandı): tutar / miktar.
            'BirimFiyat' => $miktar != 0 ? round(((float)($s['Tutar'] ?? 0)) / $miktar, 4) : null,
        ];
    }
    return array_values($siparisler);
}

// ── CARİ SORGULARI — GERÇEK ÜRETİM VERİSİYLE (LogoRead ile doğrudan SSMS
// sorgusuyla) DOĞRULANDI. Ana kart LG_222_CLCARD'da (AYRI veritabanında,
// fiyat listesiyle aynı DOXA_2022 — o da dönemsel, bkz. ayarlar.ornek.php).
// Adres TEK bir alana (ADDR1+ADDR2+DISTRICT+TOWN+CITY) SUNUCU TARAFINDA
// birleştiriliyor — ÜretimOS'un "Cari" hedefinde tek bir 'adres' alanı var,
// altı ayrı LOGO sütununu birbirinden bağımsız eşleyecek bir mekanizma yok.
// Bakiye CariBakiye tablosunda cari başına BİRDEN FAZLA satırda (bölüm/
// işyeri kırılımı) durduğundan SUM ile tekilleştiriliyor (doğrulandı:
// tbl_Mel_CariFinansalDurumlar_222 ile 880/880 birebir eşleşti).
// KVKK: TC kimlik no, yetkili kişi adı ve IBAN'lar VARSAYILAN OLARAK
// DÖNDÜRÜLMEZ — ayarlar.php'de 'kvkkAlanlariDahilEt' açıkça true
// yapılmadıkça. Müşteri/tedarikçi LOGO'da ayrı bir alan DEĞİL (CARDTYPE
// neredeyse hepsinde "Alıcı+Satıcı"); ayrım satış/sipariş ile satınalma
// hareketlerinde o cariye ait EN AZ bir kayıt olup olmadığından çıkarılıyor.
function cariSorgulari(array $ayar, int $offset, int $adet): array
{
    $clcardDb = $ayar['cariKartVeritabani'] ?? ($ayar['fiyatListesiVeritabani'] ?? 'DOXA_2022');
    $clcardTablo = $ayar['cariKartTablo'] ?? 'dbo.LG_222_CLCARD';
    $cariTablo = $ayar['cariTablo'] ?? 'Doxa_Programs..tbl_Mel_Cariler_222';
    $bakiyeTablo = $ayar['cariBakiyeTablo'] ?? 'Doxa_Programs..tbl_Mel_CariBakiye_222';
    $riskTablo = $ayar['cariRiskTablo'] ?? 'Doxa_Programs..tbl_Mel_CariRiskBilgileri_222';
    $satisTablo = $ayar['satisTablo'] ?? 'Doxa_Programs.dbo.tbl_Mel_Satis_Tablosu_222_01';
    $siparisTablo = $ayar['siparisTablo'] ?? 'Doxa_Programs.dbo.tbl_Mel_Siparis_Tablosu_222_01';
    $satinalmaAlimTablo = $ayar['satinalmaAlimTablo'] ?? 'Doxa_Programs.dbo.tbl_Mel_Satinalma_Tablosu_Alim_222_01';
    $satinalmaSiparisTablo = $ayar['satinalmaSiparisTablo'] ?? 'Doxa_Programs.dbo.tbl_Mel_Satinalma_Tablosu_Siparis_222_01';
    $kvkkDahil = !empty($ayar['kvkkAlanlariDahilEt']);

    $adresIfade = "LTRIM(RTRIM(
            ISNULL(cl.ADDR1,'')
            + (CASE WHEN ISNULL(cl.ADDR2,'') <> '' THEN ' ' + cl.ADDR2 ELSE '' END)
            + (CASE WHEN ISNULL(cl.DISTRICT,'') <> '' THEN ' ' + cl.DISTRICT ELSE '' END)
            + (CASE WHEN ISNULL(cl.TOWN,'') <> '' THEN '/' + cl.TOWN ELSE '' END)
            + (CASE WHEN ISNULL(cl.CITY,'') <> '' THEN '/' + cl.CITY ELSE '' END)
        ))";
    $kvkkSutunlari = $kvkkDahil
        ? ", cl.TCKNO AS TcKimlikNo, cl.INCHARGE AS YetkiliKisi,
             cl.BANKIBANS1 AS Iban1, cl.BANKIBANS2 AS Iban2, cl.BANKIBANS3 AS Iban3"
        : '';

    $secim = "cl.CODE AS Cari, cl.DEFINITION_ AS CariAdi,
        cl.TAXNR AS VergiNo, cl.TAXOFFICE AS VergiDairesi,
        $adresIfade AS Adres,
        cl.TELNRS1 AS Telefon, cl.EMAILADDR AS Email,
        cl.CCURRENCY AS ParaBirimiKodu, cl.CARDTYPE AS KartTipi,
        t.Cari_OK1Adi AS OzelDurum,
        ISNULL(bk.Bakiye, 0) AS Bakiye,
        rk.RISKI AS RiskLimiti
        $kvkkSutunlari";
    $joinler = "FROM $clcardDb.$clcardTablo cl
        LEFT JOIN $cariTablo t ON t.CariLogic = cl.LOGICALREF
        LEFT JOIN (SELECT CARILOGIC, SUM(BAKIYE) AS Bakiye FROM $bakiyeTablo GROUP BY CARILOGIC) bk ON bk.CARILOGIC = cl.LOGICALREF
        LEFT JOIN $riskTablo rk ON rk.CARILOGIC = cl.LOGICALREF";

    $musteriKosulu = "(EXISTS (SELECT 1 FROM $satisTablo st WHERE st.ClientRef = cl.LOGICALREF)
        OR EXISTS (SELECT 1 FROM $siparisTablo sp WHERE sp.cariRef = cl.LOGICALREF))";
    $tedarikciKosulu = "(EXISTS (SELECT 1 FROM $satinalmaAlimTablo sa WHERE sa.ClientRef = cl.LOGICALREF)
        OR EXISTS (SELECT 1 FROM $satinalmaSiparisTablo ss WHERE ss.cariRef = cl.LOGICALREF))";

    $cariSorgu = function (string $ekKosul) use ($secim, $joinler, $clcardDb, $clcardTablo, $offset, $adet): array {
        $kosul = "cl.ACTIVE = 0" . ($ekKosul !== '' ? " AND $ekKosul" : '');
        // GERÇEK TESTTE ÖLÇÜLDÜ: EXISTS alt sorguları (cari_musteri/
        // cari_tedarikci) ClientRef/cariRef üzerinde İNDEKS OLMADIĞI için
        // SQL Server kötü bir plana düşüyor — adet=2000'de 92 sn, PHP'nin
        // max_execution_time'ını (30 sn) aşıyordu. OPTION (HASH JOIN)
        // zorlanınca 92 sn → 0,04 sn (sonuç DEĞİŞMEDİ, 993 kayıt). Düz
        // 'cari' sorgusunda (EXISTS yok, zaten hızlı test edildi) bu ipucu
        // GEREKSİZ VE TEST EDİLMEMİŞ bir değişiklik olacağından yalnızca
        // EXISTS içeren varyantlara uygulanıyor.
        $ipucu = $ekKosul !== '' ? ' OPTION (HASH JOIN)' : '';
        $sorgu = "SELECT $secim $joinler WHERE $kosul ORDER BY cl.CODE OFFSET $offset ROWS FETCH NEXT $adet ROWS ONLY" . $ipucu;
        $sayim = "SELECT COUNT(*) FROM $clcardDb.$clcardTablo cl WHERE $kosul" . $ipucu;
        return ['sorgu' => $sorgu, 'sayim' => $sayim];
    };

    return [
        'cari'           => $cariSorgu(''),
        'cari_musteri'   => $cariSorgu($musteriKosulu),
        'cari_tedarikci' => $cariSorgu($tedarikciKosulu),
    ];
}

$grupAlani = null;
if ($tip === 'siparis' || $tip === 'siparis_tumu') {
    $TAM_SORGULAR = siparisSorgulari($ayar, $offset, $adet);
    $sql = $TAM_SORGULAR[$tip]['sorgu'];
    $sayimSql = $TAM_SORGULAR[$tip]['sayim'];
    $grupAlani = 'SipNo';
} elseif (in_array($tip, ['cari', 'cari_musteri', 'cari_tedarikci'], true)) {
    $TAM_SORGULAR = cariSorgulari($ayar, $offset, $adet);
    $sql = $TAM_SORGULAR[$tip]['sorgu'];
    $sayimSql = $TAM_SORGULAR[$tip]['sayim'];
} elseif ($tablo !== '' && array_key_exists($tip, $TAM_SORGULAR = fiyatSorgulari($ayar, $tablo, $offset, $adet))) {
    $sql = $TAM_SORGULAR[$tip]['sorgu'];
    $sayimSql = $TAM_SORGULAR[$tip]['sayim'];
} else {
    $ozelKosullar = $ayar['kosullar'] ?? [];
    $KOSULLAR = [
        'urun'      => $ozelKosullar['urun']      ?? "Urun_Kart_Turu_Kodu = 12 AND URUN_AKTIF = 1",
        'yarimamul' => $ozelKosullar['yarimamul'] ?? "Urun_Kart_Turu_Kodu = 11 AND URUN_AKTIF = 1",
        'hammadde'  => $ozelKosullar['hammadde']  ?? "Urun_Kart_Turu_Kodu IN (10, 13) AND URUN_AKTIF = 1",
        'tumu'      => $ozelKosullar['tumu']      ?? "URUN_AKTIF = 1",
    ];
    if ($tablo === '' || !array_key_exists($tip, $KOSULLAR)) {
        http_response_code(400);
        echo json_encode(['hata' => "ayarlar.php'de 'tablo' boş ya da bilinmeyen tip: $tip. Geçerli tipler: " . implode(', ', array_merge(array_keys($KOSULLAR), ['son_alis', 'fiyat_satis', 'fiyat_alis', 'siparis', 'siparis_tumu', 'cari', 'cari_musteri', 'cari_tedarikci']))], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $kosul = $KOSULLAR[$tip];
    // $offset/$adet (int)/(min/max) ile sabitlendi, $tablo/$siraSutunu/$kosul
    // yalnızca yerel ayarlar.php'den gelir (kullanıcı girdisi değil) — SQL
    // enjeksiyonu riski yok.
    $sql = "SELECT * FROM $tablo WHERE $kosul ORDER BY $siraSutunu OFFSET $offset ROWS FETCH NEXT $adet ROWS ONLY";
    $sayimSql = "SELECT COUNT(*) FROM $tablo WHERE $kosul";
}

// ── BAĞLANTI ─────────────────────────────────────────────────────────────
// Sırayla dener: 1) Windows ODBC DSN adıyla (en basit — DSN zaten Windows'ta
// tanımlıysa sunucu/veritabanı adını bilmeye GEREK YOK), 2) PDO sqlsrv
// sürücüsüyle doğrudan sunucu adresine, 3) PDO dblib (FreeTDS — çoğunlukla
// Linux barındırmalarda bulunur).
function logoyaBaglan(array $ayar): PDO
{
    $denemeler = [];

    if (!empty($ayar['dsnAdi']) && in_array('odbc', PDO::getAvailableDrivers(), true)) {
        try {
            return new PDO('odbc:' . $ayar['dsnAdi'], $ayar['kullanici'] ?? '', $ayar['sifre'] ?? '');
        } catch (Throwable $e) {
            $denemeler[] = 'odbc(' . $ayar['dsnAdi'] . '): ' . $e->getMessage();
        }
    }
    if (!empty($ayar['sunucu']) && in_array('sqlsrv', PDO::getAvailableDrivers(), true)) {
        try {
            return new PDO('sqlsrv:Server=' . $ayar['sunucu'] . ';Database=' . ($ayar['veritabani'] ?? ''), $ayar['kullanici'] ?? '', $ayar['sifre'] ?? '');
        } catch (Throwable $e) {
            $denemeler[] = 'sqlsrv: ' . $e->getMessage();
        }
    }
    if (!empty($ayar['sunucu']) && in_array('dblib', PDO::getAvailableDrivers(), true)) {
        try {
            return new PDO('dblib:host=' . $ayar['sunucu'] . ';dbname=' . ($ayar['veritabani'] ?? ''), $ayar['kullanici'] ?? '', $ayar['sifre'] ?? '');
        } catch (Throwable $e) {
            $denemeler[] = 'dblib: ' . $e->getMessage();
        }
    }
    throw new RuntimeException('Hiçbir bağlantı yöntemi çalışmadı: ' . implode(' | ', $denemeler ?: ['uygun sürücü yok veya ayarlar.php\'de dsnAdi/sunucu boş — PDO::getAvailableDrivers() çıktısını kontrol edin']));
}

try {
    $pdo = logoyaBaglan($ayar);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $toplam = (int)$pdo->query($sayimSql)->fetchColumn();

    $stmt = $pdo->query($sql);
    $satirlar = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ── KODLAMA DÜZELTMESİ ─────────────────────────────────────────────────
    // GERÇEK TESTTE YAKALANDI: LOGO'nun SQL Server ODBC sürücüsü Türkçe
    // metni genellikle Windows-1254 (CP1254) döndürür, UTF-8 DEĞİL.
    // json_encode bunu UTF-8 sanıp "Malformed UTF-8 characters" hatasıyla
    // false dönüyor ve yanıt sessizce BOŞ kalıyordu. Her string alan açıkça
    // UTF-8'e çevriliyor; kaynak kodlama ayarlar.php'de değiştirilebilir
    // (sürücü zaten UTF-8 dönüyorsa 'kaynakKodlama' => 'UTF-8' yapın, bu
    // durumda çeviri atlanır).
    $kaynakKodlama = $ayar['kaynakKodlama'] ?? 'Windows-1254';
    if ($kaynakKodlama !== '' && strtoupper($kaynakKodlama) !== 'UTF-8') {
        array_walk_recursive($satirlar, function (&$deger) use ($kaynakKodlama) {
            if (is_string($deger)) {
                $cevrilen = @mb_convert_encoding($deger, 'UTF-8', $kaynakKodlama);
                if ($cevrilen !== false) $deger = $cevrilen;
            }
        });
    }

    // Sipariş tipleri için düz satırları sipariş+kalemler yapısına çevir.
    // Bu noktadan sonra $satirlar artık "satır sayısı" değil "sipariş
    // sayısı" taşıyor — aşağıdaki adet/sonSayfaMi hesapları otomatik doğru
    // birime (sipariş) oturur, ayrı bir sayaç gerekmez.
    if ($grupAlani !== null) {
        $satirlar = satirlariSiparisOlarakGrupla($satirlar);
    }

    $govde = [
        'kayitlar' => $satirlar,
        'adet' => count($satirlar),
        'toplam' => $toplam,
        'sayfa' => $sayfa,
        'sayfaBoyutu' => $adet,
        'sonSayfaMi' => ($offset + count($satirlar)) >= $toplam,
        'tip' => $tip,
    ];
    // JSON_INVALID_UTF8_SUBSTITUTE: yukarıdaki çeviri atlanan/beklenmedik
    // bir ikili değer kalırsa json_encode yine de false DÖNMEZ, o karakteri
    // "�" ile değiştirir — sessiz boş yanıt yerine en kötü ihtimalle bozuk
    // TEK bir karakter.
    $json = json_encode($govde, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        http_response_code(500);
        echo json_encode(['hata' => 'JSON kodlama hatası: ' . json_last_error_msg()], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo $json;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['hata' => 'LOGO bağlantı/sorgu hatası: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
