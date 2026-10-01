// ── "Ürün Kartları & Reçete" ekranı — 3 kademeli gruplama (YENİ) ────────────
// GERÇEK ÜRETİM SORUNU: 20.000+ ürün / 96.000+ yarı mamül kartı TEK bir düz
// liste (grid) olarak basılıyordu — aynı kök neden sınıfı (page_kalem_secici.js/
// page_dashboard.js'te daha önce düzeltilen "80k+ kayıt" sorunu). Kullanıcı
// isteği: "1. kademe yüklendiği yer, 2. kademe alt kırılım/ürün ağacı var mı,
// 3. kademe ürün model adına göre akordeon menü + arama satırı."
//
// page_kartlar.js Store/DOM'a derinden bağlı olduğundan (diğer page_* test
// dosyalarıyla AYNI desende, bkz. ikinci_kalite_rezervasyon_testi.js) saf
// gruplama fonksiyonları (kaynakEtiketi/receteVarIdSeti/kartlariUclKademeyeGrupla)
// kaynaktan izole edilip GERÇEK verilerle çalıştırılır.

const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_kartlar.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

function fonksiyonCikar(ad) {
  const baslangic = kaynak.indexOf('function ' + ad + '(');
  let derinlik = 0, i = kaynak.indexOf('{', baslangic), sonuc = '';
  for (; i < kaynak.length; i++) {
    const c = kaynak[i];
    if (c === '{') derinlik++;
    if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
  }
  return kaynak.slice(baslangic, i);
}

console.log('\n-- KOD KONTROLU: yardımcılar tanımlı --');
t('kaynakEtiketi tanımlı', kaynak.includes('function kaynakEtiketi(kaynak)'));
t('receteVarIdSeti tanımlı', kaynak.includes('function receteVarIdSeti(receteOzet, tip)'));
t('kartlariUclKademeyeGrupla tanımlı', kaynak.includes('function kartlariUclKademeyeGrupla(liste, receteVarSeti)'));
t('Store.receteOzetGetir kullanılıyor (TAM receteler.all() DEĞİL)', kaynak.includes('Store.receteOzetGetir()'));
t('eski receteler.all() ile tam reçete indirme YOK (BULGU: 96k+ kayıt sorunu)',
  !/Store\.urunler\.all\(\), Store\.yarimamuller\.all\(\), Store\.altMontajlar\.all\(\), Store\.paketler\.all\(\), Store\.receteler\.all\(\)/.test(kaynak));
t('3. kademe (model) kartları TEMBEL üretiliyor (dataset.dolduruldu koruması)', kaynak.includes("if (govde.dataset.dolduruldu) return;"));
t('arama satırı eklendi (kt-arama)', kaynak.includes('id="kt-arama"'));

const srcKaynakEtiketi = fonksiyonCikar('kaynakEtiketi');
const srcReceteVarIdSeti = fonksiyonCikar('receteVarIdSeti');
const srcGrupla = fonksiyonCikar('kartlariUclKademeyeGrupla');
const izole = new Function(
  srcKaynakEtiketi + '\n' + srcReceteVarIdSeti + '\n' + srcGrupla +
  '\nreturn { kaynakEtiketi, receteVarIdSeti, kartlariUclKademeyeGrupla };'
)();

console.log('\n-- 1. KADEME: kaynakEtiketi (yüklendiği yer) --');
t('tiger -> Logo Tiger Aktarımı', izole.kaynakEtiketi('tiger') === 'Logo Tiger Aktarımı');
t('tiger_acilis -> Logo Tiger Aktarımı', izole.kaynakEtiketi('tiger_acilis') === 'Logo Tiger Aktarımı');
t('tiger_guncelleme -> Logo Tiger Aktarımı', izole.kaynakEtiketi('tiger_guncelleme') === 'Logo Tiger Aktarımı');
t('ag_entegrasyon -> ERP Entegrasyon Merkezi', izole.kaynakEtiketi('ag_entegrasyon') === 'ERP Entegrasyon Merkezi');
t('tanımsız/boş (elle oluşturulan) -> Elle Oluşturuldu grubu', izole.kaynakEtiketi(undefined).includes('Elle Oluşturuldu'));
t('bilinmeyen bir kaynak da Elle Oluşturuldu grubuna düşüyor (TAHMİN edip uydurma yeni grup açmıyor)',
  izole.kaynakEtiketi('bilinmeyen_bir_sey').includes('Elle Oluşturuldu'));

console.log('\n-- 2. KADEME: receteVarIdSeti (alt kırılım/ürün ağacı var mı) --');
const receteOzetOrnek = [
  { urunId: 'UR1', kalemSayisi: 3 },
  { yarimamulId: 'YM1', kalemSayisi: 1 },
  { altMontajId: 'AM1', kalemSayisi: 5 },
  { paketId: 'PKT1', kalemSayisi: 2 },
];
t('urun tipi için doğru id seti', izole.receteVarIdSeti(receteOzetOrnek, 'urun').has('UR1'));
t('urun tipi başka tipin id\'sini YANLIŞLIKLA içermiyor', !izole.receteVarIdSeti(receteOzetOrnek, 'urun').has('YM1'));
t('yarimamul tipi için doğru id seti', izole.receteVarIdSeti(receteOzetOrnek, 'yarimamul').has('YM1'));
t('altmontaj tipi için doğru id seti', izole.receteVarIdSeti(receteOzetOrnek, 'altmontaj').has('AM1'));
t('paket tipi için doğru id seti', izole.receteVarIdSeti(receteOzetOrnek, 'paket').has('PKT1'));
t('boş/null receteOzet çökmeden boş set döner', izole.receteVarIdSeti(null, 'urun').size === 0);

console.log('\n-- 3. KADEME: kartlariUclKademeyeGrupla (model adına göre) --');
const kartlar = [
  { id: 'UR1', kod: '24.DK.BKS.01100.A', ad: 'BEKS TEKLİ BEKLEME KOLTUĞU', kaynak: 'tiger' },
  { id: 'UR2', kod: '24.DK.BKS.01100.B', ad: 'BEKS TEKLİ BEKLEME KOLTUĞU', kaynak: 'tiger' },
  { id: 'UR3', kod: '24.DK.BKS.01100.C', ad: 'BEKS TEKLİ BEKLEME KOLTUĞU', kaynak: 'tiger' },
  { id: 'UR4', kod: '24.DK.BKS.02100.00.A', ad: 'BEKS İKİLİ BEKLEME KOLTUĞU', kaynak: 'tiger' },
  { id: 'UR5', kod: 'ELK-001', ad: 'Elle Girilen Ürün', kaynak: undefined },
];
const receteVarSeti = new Set(['UR1', 'UR4']); // UR1 ve UR4'ün reçetesi var, diğerlerinin yok
const gruplar = izole.kartlariUclKademeyeGrupla(kartlar, receteVarSeti);

t('1. kademede 2 ayrı kaynak grubu var (Logo Tiger Aktarımı + Elle Oluşturuldu)', gruplar.size === 2);
const tigerGrubu = gruplar.get('Logo Tiger Aktarımı');
t('Logo Tiger Aktarımı grubu bulundu', !!tigerGrubu);
t('UR1 reçetesi var grubunda (2. kademe doğru ayrılmış)',
  (tigerGrubu.receteVar.get('BEKS TEKLİ BEKLEME KOLTUĞU') || []).some(k => k.id === 'UR1'));
t('UR2/UR3 reçetesi yok grubunda', (() => {
  const recetesizler = tigerGrubu.receteYok.get('BEKS TEKLİ BEKLEME KOLTUĞU') || [];
  return recetesizler.some(k => k.id === 'UR2') && recetesizler.some(k => k.id === 'UR3');
})());
t('3. kademe: "BEKS TEKLİ BEKLEME KOLTUĞU" model grubunda 3 varyant (A/B/C) TEK başlık altında toplanmış',
  (tigerGrubu.receteVar.get('BEKS TEKLİ BEKLEME KOLTUĞU') || []).length +
  (tigerGrubu.receteYok.get('BEKS TEKLİ BEKLEME KOLTUĞU') || []).length === 3);
t('"BEKS İKİLİ BEKLEME KOLTUĞU" AYRI bir model grubu (farklı ad -> farklı başlık)',
  (tigerGrubu.receteVar.get('BEKS İKİLİ BEKLEME KOLTUĞU') || []).some(k => k.id === 'UR4'));

const elleGrubu = [...gruplar.entries()].find(([ad]) => ad.includes('Elle Oluşturuldu'));
t('Elle oluşturulan kart ayrı (Elle Oluşturuldu) grubunda', !!elleGrubu);
t('UR5 o grubun reçetesi-yok kovasında', (elleGrubu[1].receteYok.get('Elle Girilen Ürün') || []).some(k => k.id === 'UR5'));

console.log('\n-- UÇ DURUMLAR --');
t('boş liste çökmeden boş Map döner', izole.kartlariUclKademeyeGrupla([], new Set()).size === 0);
t('ad alanı boş/eksik olan kart "(Adsız)" grubuna düşüyor, ÇÖKMÜYOR', (() => {
  const g = izole.kartlariUclKademeyeGrupla([{ id: 'X', kod: 'X1', ad: '', kaynak: 'tiger' }], new Set());
  return (g.get('Logo Tiger Aktarımı').receteYok.get('(Adsız)') || []).some(k => k.id === 'X');
})());

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
