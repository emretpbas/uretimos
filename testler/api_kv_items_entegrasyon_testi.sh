#!/bin/bash
# ── api.php — SATIR SATIR (kv_items) depolama entegrasyon testi ────────────
# GERÇEK ÜRETİM SORUNU (3. tur): kullanıcı "basıldığı belli ama reçeteyi
# kaydetmiyor/güncellemiyor" diye bildirdi; sonraki testte "Kaydediliyor:
# Yarı Mamül/Alt Montaj/Paket..." adımının 4+ dakika HİÇBİR hata/değişiklik
# olmadan donuk kaldığı doğrulandı. Kök neden: api.php'nin 'patch' ucu, TEK
# BİR kayıt bile değişse, ilgili koleksiyonun TAMAMINI (tek JSON blob) 1 GB
# RAM'lı sunucuda okuyup çözüp yeniden kodlayıp yazıyordu — 96.000+ kayıtlı
# 'yarimamuller' gibi koleksiyonlarda bu maliyet dakikalarca sürebiliyor,
# hatta sunucuyu kilitleyebiliyordu.
#
# DERİN DÜZELTME: en büyük 6 koleksiyon (KV_ITEMS_KOLEKSIYONLAR — bkz.
# api.php) artık SATIR SATIR (kv_items tablosu) saklanır; eski blob tek bir
# SENTİNEL değerle ("göçtü") işaretlenip kv_items'a bölünür (göç, bir
# koleksiyona İLK dokunulduğunda OTOMATİK ve SESSİZCE olur). Bir patch artık
# yalnızca DEĞİŞEN kayıtlara dokunur — maliyet koleksiyon boyutundan
# BAĞIMSIZDIR. Diğer ~75 küçük koleksiyon ESKİ (tek blob) modelde kalır.
#
# Bu test, GERÇEK PHP sunucu sürecini (php -S) GEÇİCİ bir SQLite dosyasına
# karşı çalıştırıp GERÇEK HTTP istekleriyle (curl) doğrular — birim testi
# DEĞİL, uçtan uca entegrasyon testidir (api.php tek parça prosedürel bir
# betik olduğundan fonksiyonları izole şekilde "require" ile test etmek
# mümkün değildir). Gerçek üretim ölçeğinde (96.692 yarımamül, 20.585 ürün)
# çalıştırılarak hem DOĞRULUK hem de PERFORMANS kazancı kanıtlanır.
#
# Çalıştırma: bash testler/api_kv_items_entegrasyon_testi.sh
# (php CLI + pdo_sqlite + curl gerektirir; testler/*.js suite'inin PARÇASI
# DEĞİLDİR — ayrı çalıştırılır, çünkü node değil php/bash tabanlıdır.)

set -e
cd "$(dirname "$0")/.."

TMPDB=$(mktemp /tmp/uretimos_kvitems_test_XXXX.sqlite)
rm -f "$TMPDB"
PORT=8947
export URETIMOS_DB="$TMPDB"
LOG=$(mktemp /tmp/uretimos_kvitems_test_log_XXXX)

php -S 127.0.0.1:$PORT -t "$(pwd)" >"$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; rm -f "$TMPDB" "$TMPDB-wal" "$TMPDB-shm" "$LOG"' EXIT

for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api.php?action=list"; then break; fi
  sleep 0.2
done

BASE="http://127.0.0.1:$PORT/api.php"
OK=0; BAD=0
t() { if [ "$1" = "1" ]; then OK=$((OK+1)); echo "  GECTI $2"; else BAD=$((BAD+1)); echo "  KALDI $2 -- $3"; fi; }

LOGIN=$(curl -s -X POST "$BASE?action=login" -H 'Content-Type: application/json' -d '{"kullaniciAdi":"yonetim","sifre":"yonetim1234"}')
TOKEN=$(echo "$LOGIN" | php -r '$d=json_decode(file_get_contents("php://stdin"),true); echo $d["token"] ?? "";')
if [ -z "$TOKEN" ]; then echo "GIRIS BASARISIZ: $LOGIN"; cat "$LOG"; exit 1; fi
AUTH=(-H "Authorization: Bearer $TOKEN")

echo "== BÖLÜM 1: doğruluk (orta ölçek, 20.000 kayıt) =="
php -r '
$pdo = new PDO("sqlite:" . getenv("URETIMOS_DB"));
$pdo->exec("PRAGMA journal_mode=WAL");
$liste = [];
for ($i = 0; $i < 20000; $i++) {
    $liste[] = ["id" => "YM-$i", "kod" => "YM.TEST.$i", "ad" => "Test Yarimamul $i", "adet" => 1, "renk" => "", "referansFiyat" => 12.5];
}
$json = json_encode($liste, JSON_UNESCAPED_UNICODE);
$now = date("c");
$st = $pdo->prepare("INSERT INTO kv_store (store_key, store_value, updated_at, surum) VALUES (:k,:v,:t,1) ON CONFLICT(store_key) DO UPDATE SET store_value=:v2, updated_at=:t2, surum=1");
$st->execute([":k"=>"yarimamuller", ":v"=>$json, ":t"=>$now, ":v2"=>$json, ":t2"=>$now]);
'
SAYIM=$(curl -s "${AUTH[@]}" "$BASE?action=sayim&key=yarimamuller")
ADET=$(echo "$SAYIM" | php -r '$d=json_decode(file_get_contents("php://stdin"),true); echo $d["adet"] ?? -1;')
t "$([ "$ADET" = "20000" ] && echo 1 || echo 0)" "sayim göçten SONRA 20000 dönüyor" "donen: $ADET"

GOC_KONTROL=$(php -r '
$pdo = new PDO("sqlite:" . getenv("URETIMOS_DB"));
$sv = $pdo->query("SELECT store_value FROM kv_store WHERE store_key=\"yarimamuller\"")->fetchColumn();
$c = $pdo->query("SELECT COUNT(*) FROM kv_items WHERE store_key=\"yarimamuller\"")->fetchColumn();
echo ($sv === "__kv_items_satirlarda__" ? "GOCMUS" : "DOLU") . "|" . $c;
')
t "$([ "$GOC_KONTROL" = "GOCMUS|20000" ] && echo 1 || echo 0)" "göç sonrası store_value SENTİNEL ve kv_items'ta 20000 satır var" "$GOC_KONTROL"

GET_SONUC=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=yarimamuller")
GET_KONTROL=$(echo "$GET_SONUC" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$arr = json_decode($d["value"], true);
if (!is_array($arr) || count($arr) !== 20000) { echo "SAYI_YANLIS"; exit; }
if (($arr[0]["id"] ?? "") !== "YM-0" || ($arr[19999]["id"] ?? "") !== "YM-19999") { echo "SIRA_YANLIS"; exit; }
echo "OK";
')
t "$([ "$GET_KONTROL" = "OK" ] && echo 1 || echo 0)" "get action'i 20000 kaydı EKSİKSİZ ve SIRALI döndürüyor" "$GET_KONTROL"

BASLA=$(date +%s.%N)
PATCH_BODY=$(php -r '
$g = [];
for ($i = 0; $i < 11; $i++) { $g[] = ["id"=>"YM-$i", "kod"=>"YM.TEST.$i", "ad"=>"GUNCELLENDI $i", "adet"=>2, "renk"=>"DAF", "referansFiyat"=>99.9]; }
echo json_encode(["key"=>"yarimamuller", "ekle"=>[], "guncelle"=>$g, "sil"=>[]], JSON_UNESCAPED_UNICODE);
')
PATCH_SONUC=$(curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d "$PATCH_BODY" "$BASE?action=patch")
BITIS=$(date +%s.%N)
SURE=$(php -r "echo round($BITIS - $BASLA, 3);")
DEGISEN=$(echo "$PATCH_SONUC" | php -r '$d=json_decode(file_get_contents("php://stdin"),true); echo $d["degisiklik"] ?? -1;')
KAYITSAYISI=$(echo "$PATCH_SONUC" | php -r '$d=json_decode(file_get_contents("php://stdin"),true); echo $d["kayitSayisi"] ?? -1;')
t "$([ "$DEGISEN" = "11" ] && echo 1 || echo 0)" "patch tam olarak 11 değişiklik raporluyor" "donen: $DEGISEN"
t "$([ "$KAYITSAYISI" = "20000" ] && echo 1 || echo 0)" "patch sonrası toplam kayıt sayısı HALA 20000" "donen: $KAYITSAYISI"
t "$(php -r "echo ($SURE < 3.0) ? 1 : 0;")" "11 kayıtlık patch 3 saniyeden KISA sürede tamamlandı" "sure: ${SURE}s"

GET_SONUC2=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=yarimamuller")
ICERIK_KONTROL=$(echo "$GET_SONUC2" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$arr = json_decode($d["value"], true);
if (count($arr) !== 20000) { echo "SAYI_YANLIS"; exit; }
for ($i = 0; $i < 11; $i++) {
    if ($arr[$i]["id"] !== "YM-$i" || $arr[$i]["ad"] !== "GUNCELLENDI $i" || $arr[$i]["renk"] !== "DAF") { echo "GUNCELLENEN_YANLIS:$i"; exit; }
}
if ($arr[15000]["ad"] !== "Test Yarimamul 15000") { echo "DEGISMEYEN_BOZULMUS"; exit; }
if ($arr[19999]["id"] !== "YM-19999") { echo "SON_KAYIT_YANLIS"; exit; }
echo "OK";
')
t "$([ "$ICERIK_KONTROL" = "OK" ] && echo 1 || echo 0)" "patch sonrası içerik tam doğru: güncellenenler değişti, diğerleri bozulmadı, sıra korundu" "$ICERIK_KONTROL"

curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"key":"yarimamuller","ekle":[{"id":"YM-YENI-1","kod":"YM.YENI.1","ad":"Yepyeni Kayit","adet":1,"renk":"","referansFiyat":5}],"guncelle":[],"sil":[]}' "$BASE?action=patch" > /dev/null
GET_SONUC3=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=yarimamuller")
EKLE_KONTROL=$(echo "$GET_SONUC3" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$arr = json_decode($d["value"], true);
if (count($arr) !== 20001 || ($arr[20000]["id"] ?? "") !== "YM-YENI-1") { echo "YANLIS"; exit; }
echo "OK";
')
t "$([ "$EKLE_KONTROL" = "OK" ] && echo 1 || echo 0)" "yeni kayıt doğru eklendi VE sona eklendi (ekleme sırası korunuyor)" "$EKLE_KONTROL"

curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"key":"yarimamuller","ekle":[],"guncelle":[],"sil":["YM-YENI-1","YM-5"]}' "$BASE?action=patch" > /dev/null
GET_SONUC4=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=yarimamuller")
SIL_KONTROL=$(echo "$GET_SONUC4" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$arr = json_decode($d["value"], true);
if (count($arr) !== 19999) { echo "SAYI_YANLIS"; exit; }
foreach ($arr as $k) { if ($k["id"] === "YM-YENI-1" || $k["id"] === "YM-5") { echo "SILINMEMIS"; exit; } }
echo "OK";
')
t "$([ "$SIL_KONTROL" = "OK" ] && echo 1 || echo 0)" "silme doğru çalıştı, kayıtlar kalıcı olarak kayboldu" "$SIL_KONTROL"

SURUM1=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=yarimamuller" | php -r '$d=json_decode(file_get_contents("php://stdin"),true); echo $d["surum"];')
curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"key":"yarimamuller","ekle":[],"guncelle":[{"id":"YM-1","kod":"YM.TEST.1","ad":"x","adet":1,"renk":"","referansFiyat":1}],"sil":[]}' "$BASE?action=patch" > /dev/null
SURUM2=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=yarimamuller" | php -r '$d=json_decode(file_get_contents("php://stdin"),true); echo $d["surum"];')
t "$([ "$SURUM2" -gt "$SURUM1" ] && echo 1 || echo 0)" "surum patch sonrası artıyor ($SURUM1 -> $SURUM2)"

SET_BODY=$(php -r '
$liste = [["id"=>"YM-SET-1","kod"=>"X","ad"=>"Set Testi","adet"=>1,"renk"=>"","referansFiyat"=>1]];
echo json_encode(["key"=>"yarimamuller", "value"=>json_encode($liste, JSON_UNESCAPED_UNICODE)]);
')
curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d "$SET_BODY" "$BASE?action=set" > /dev/null
GET_SONUC5=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=yarimamuller")
SET_KONTROL=$(echo "$GET_SONUC5" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$arr = json_decode($d["value"], true);
echo (count($arr) === 1 && $arr[0]["id"] === "YM-SET-1") ? "OK" : "YANLIS";
')
t "$([ "$SET_KONTROL" = "OK" ] && echo 1 || echo 0)" "action=set TAM değiştirme (yedekten geri yükleme yolu) doğru çalıştı" "$SET_KONTROL"

curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"key":"yarimamuller"}' "$BASE?action=delete" > /dev/null
DELETE_KONTROL=$(php -r '
$pdo = new PDO("sqlite:" . getenv("URETIMOS_DB"));
$kv = $pdo->query("SELECT COUNT(*) FROM kv_store WHERE store_key=\"yarimamuller\"")->fetchColumn();
$ki = $pdo->query("SELECT COUNT(*) FROM kv_items WHERE store_key=\"yarimamuller\"")->fetchColumn();
echo "$kv|$ki";
')
t "$([ "$DELETE_KONTROL" = "0|0" ] && echo 1 || echo 0)" "delete hem kv_store hem kv_items satırlarını temizledi (yetim kayıt kalmadı)" "$DELETE_KONTROL"

curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"key":"yarimamuller","ekle":[{"id":"YM-YENIDEN-1","kod":"X","ad":"Yeniden","adet":1,"renk":"","referansFiyat":1}],"guncelle":[],"sil":[]}' "$BASE?action=patch" > /dev/null
GET_SONUC6=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=yarimamuller")
YENIDEN_KONTROL=$(echo "$GET_SONUC6" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$arr = json_decode($d["value"], true);
echo (count($arr) === 1 && $arr[0]["id"] === "YM-YENIDEN-1") ? "OK" : "YANLIS";
')
t "$([ "$YENIDEN_KONTROL" = "OK" ] && echo 1 || echo 0)" "silinen anahtar yeniden kullanılınca ESKİ veri hortlamıyor" "$YENIDEN_KONTROL"

php -r '
$pdo = new PDO("sqlite:" . getenv("URETIMOS_DB"));
$liste = [
    ["id"=>"RC-URN1","urunId"=>"URN-1","ad"=>"Kok Recete","kalemler"=>[["tip"=>"hammadde","refId"=>"HM-1","miktar"=>2]]],
    ["id"=>"RC-YM-YM1","yarimamulId"=>"YM-1","ad"=>"Alt Recete","kalemler"=>[["tip"=>"hammadde","refId"=>"HM-2","miktar"=>1]]],
    ["id"=>"RC-BASKA","urunId"=>"URN-999","ad"=>"Baska Urun","kalemler"=>[]],
];
$json = json_encode($liste, JSON_UNESCAPED_UNICODE);
$now = date("c");
$st = $pdo->prepare("INSERT INTO kv_store (store_key, store_value, updated_at, surum) VALUES (\"receteler\",:v,:t,1) ON CONFLICT(store_key) DO UPDATE SET store_value=:v2, updated_at=:t2, surum=1");
$st->execute([":v"=>$json, ":t"=>$now, ":v2"=>$json, ":t2"=>$now]);
'
RB_SONUC=$(curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"ids":["RC-YM-YM1"],"urunIds":["URN-1"]}' "$BASE?action=receteBul")
RB_KONTROL=$(echo "$RB_SONUC" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$r = $d["receteler"] ?? [];
if (count($r) !== 2) { echo "SAYI_YANLIS"; exit; }
$idler = array_column($r, "id"); sort($idler);
echo ($idler === ["RC-URN1","RC-YM-YM1"]) ? "OK" : "YANLIS_KAYITLAR";
')
t "$([ "$RB_KONTROL" = "OK" ] && echo 1 || echo 0)" "receteBul hem id hem urunId eşleşmesini DOĞRU buluyor, BAŞKA ürünü getirmiyor" "$RB_KONTROL"

RO_SONUC=$(curl -s "${AUTH[@]}" "$BASE?action=receteOzet")
RO_KONTROL=$(echo "$RO_SONUC" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$ozet = $d["receteOzet"] ?? [];
echo (count($ozet) === 2) ? "OK" : "SAYI_YANLIS";
')
t "$([ "$RO_KONTROL" = "OK" ] && echo 1 || echo 0)" "receteOzet boş kalemli reçeteyi doğru atlıyor" "$RO_KONTROL"

HV_SONUC=$(curl -s "${AUTH[@]}" "$BASE?action=hatVerisi&hat=TestHat")
HV_KONTROL=$(echo "$HV_SONUC" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
echo (isset($d["hat"]) && !isset($d["error"])) ? "OK" : "HATA";
')
t "$([ "$HV_KONTROL" = "OK" ] && echo 1 || echo 0)" "hatVerisi action'ı göç sonrası hatasız çalışıyor" "$HV_KONTROL"

echo ""
echo "== BÖLÜM 2: GERÇEK ÜRETİM ÖLÇEĞİ (96.692 yarımamül + 20.585 ürün) =="
php -r '
$pdo = new PDO("sqlite:" . getenv("URETIMOS_DB"));
function yaz($pdo, $key, $n, $prefix) {
    $liste = [];
    for ($i = 0; $i < $n; $i++) {
        $liste[] = ["id" => "$prefix-$i", "kod" => "$prefix.KOD.$i", "ad" => "Kayit $i", "adet" => 1, "renk" => "", "referansFiyat" => 12.5, "aciklama" => str_repeat("x", 80)];
    }
    $json = json_encode($liste, JSON_UNESCAPED_UNICODE);
    $now = date("c");
    $st = $pdo->prepare("INSERT INTO kv_store (store_key, store_value, updated_at, surum) VALUES (:k,:v,:t,1) ON CONFLICT(store_key) DO UPDATE SET store_value=:v2, updated_at=:t2, surum=1");
    $st->execute([":k"=>$key, ":v"=>$json, ":t"=>$now, ":v2"=>$json, ":t2"=>$now]);
}
yaz($pdo, "yarimamuller", 96692, "BYM");
yaz($pdo, "urunler", 20585, "BURN");
'
BASLA4=$(date +%s.%N)
R4=$(curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"key":"yarimamuller","ekle":[],"guncelle":[{"id":"BYM-5","kod":"BYM.KOD.5","ad":"Guncel","adet":1,"renk":"","referansFiyat":1}],"sil":[]}' "$BASE?action=patch")
BITIS4=$(date +%s.%N)
SURE4=$(php -r "echo round($BITIS4 - $BASLA4, 3);")
echo "  yarimamuller (96.692 kayıt, İLK dokunma = göç DAHİL) patch süresi: ${SURE4}s"
t "$(php -r "echo ($SURE4 < 5.0) ? 1 : 0;")" "96.692 kayıtlı koleksiyonda göç+patch 5 saniyeden kısa (önceden dakikalarca/sonsuza kadar sürüyordu)" "sure: ${SURE4}s"

BASLA5=$(date +%s.%N)
curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"key":"yarimamuller","ekle":[],"guncelle":[{"id":"BYM-6","kod":"BYM.KOD.6","ad":"Guncel2","adet":1,"renk":"","referansFiyat":1}],"sil":[]}' "$BASE?action=patch" > /dev/null
BITIS5=$(date +%s.%N)
SURE5=$(php -r "echo round($BITIS5 - $BASLA5, 3);")
echo "  yarimamuller (96.692 kayıt, 2. dokunma = göç YOK, salt patch) patch süresi: ${SURE5}s"
t "$(php -r "echo ($SURE5 < 0.5) ? 1 : 0;")" "göç tamamlandıktan SONRAKİ patch'ler çok daha hızlı (yarım saniyeden kısa)" "sure: ${SURE5}s"

echo ""
echo "== BÖLÜM 3: regresyon — beyaz listede OLMAYAN koleksiyonlar ESKİ yoldan değişmeden çalışıyor =="
curl -s -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"key":"siparisler","ekle":[{"id":"SIP-1","musteriAdi":"Test"}],"guncelle":[],"sil":[]}' "$BASE?action=patch" > /dev/null
SIP_GET=$(curl -s "${AUTH[@]}" "$BASE?action=get&key=siparisler")
SIP_KONTROL=$(echo "$SIP_GET" | php -r '
$d = json_decode(file_get_contents("php://stdin"), true);
$arr = json_decode($d["value"], true);
echo (count($arr) === 1 && $arr[0]["id"] === "SIP-1") ? "OK" : "YANLIS";
')
t "$([ "$SIP_KONTROL" = "OK" ] && echo 1 || echo 0)" "beyaz listede olmayan koleksiyon (siparisler) ESKİ yoldan hatasız çalışıyor" "$SIP_KONTROL"
SIP_RAW=$(php -r '$pdo = new PDO("sqlite:" . getenv("URETIMOS_DB")); echo $pdo->query("SELECT store_value FROM kv_store WHERE store_key=\"siparisler\"")->fetchColumn();')
t "$(php -r 'echo (strpos($argv[1], "SIP-1") !== false) ? 1 : 0;' "$SIP_RAW")" "siparisler HALA eski blob formatında saklanıyor (kv_items'a göçmedi — kapsam dışı)"

echo ""
echo "SONUC: $OK gecti, $BAD kaldi"
exit $([ $BAD -eq 0 ] && echo 0 || echo 1)
