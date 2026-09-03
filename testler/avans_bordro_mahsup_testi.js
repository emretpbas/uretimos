// BULGU (T3-33): page_ik_bordro.js openAvansForm hiçbir muhasebe kaydı
// oluşturmuyordu — avans ödemesi GERÇEK bir nakit çıkışı olduğu halde
// Gelir-Gider Özeti'nde hiç görünmüyordu. Ayrıca netOdenecek (net maaş -
// avans kesintisi) bordro kaydına HİÇ yazılmıyordu; renderBordroTab her
// açılışta Store'dan taze avans listesini çekip CANLI yeniden
// hesaplıyordu — bu da "mahsup" kavramının fiilen hiçbir yere
// işlenmediği, yalnızca ekranda geçici bir çıkarma işlemi olduğu
// anlamına geliyordu (avans hep "mahsup edilmemiş" görünen bir kayıt
// olarak kalıyordu, bordroya kalıcı bağlanmıyordu).
// Düzeltme:
//  1) openAvansForm artık App.muhasebeKaydiOlustur çağırıp avansı
//     'personel_avans' kategorisiyle gider olarak kaydediyor.
//  2) Bordro hesaplanırken o ayın MAHSUP EDİLMEMİŞ avansları toplanıp
//     avansKesintisi/netOdenecek bordro kaydına KALICI yazılıyor VE bu
//     avanslar mahsupEdildi=true + mahsupBordroId ile bordroya
//     bağlanıyor (mahsup artık fiilen bordroya işleniyor).
//  3) renderBordroTab artık netOdenecek/avansKesintisi'yi CANLI
//     hesaplamak yerine doğrudan bordro kaydından okuyor (eski canlı
//     hesap zaten YANLIŞ sonuç verirdi: bordro hesaplanınca ilgili
//     avanslar mahsupEdildi=true olur, "!a.mahsupEdildi" filtresi
//     bordrodan SONRA hep 0 dönerdi).
// page_ik_bordro.js Store/DOM'a derinden bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır;
// mahsup/netOdenecek hesap mantığı izole edilip gerçek verilerle de
// doğrulanır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_ik_bordro.js'), 'utf8');
const muhasebeSrc = fs.readFileSync(path.join(__dirname, '..', 'page_muhasebe_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- page_muhasebe_panel.js: personel_avans kategorisi eklendi --');
t('GIDER_KATEGORI_LABEL personel_avans içeriyor', /personel_avans: 'Personel Avansı'/.test(muhasebeSrc));

console.log('\n-- page_ik_bordro.js: openAvansForm artık muhasebe kaydı oluşturuyor --');
t('avans kaydından SONRA App.muhasebeKaydiOlustur çağrılıyor',
  /await App\.persist\(\(\) => Store\.avanslar\.upsert\(kayit\)\);\s*\n\s*\/\/ BULGU \(T3-33\)[\s\S]{0,300}await App\.persist\(\(\) => App\.muhasebeKaydiOlustur\(\{\s*\n\s*tip: 'gider', kategori: 'personel_avans',/.test(src));
t('kaynakTip avans olarak işaretleniyor', /kaynakId: kayit\.id, kaynakTip: 'avans'/.test(src));

console.log('\n-- page_ik_bordro.js: bordro hesaplanırken netOdenecek/avansKesintisi kalıcı yazılıyor --');
t('o ayın mahsup edilmemiş avansları toplanıyor',
  /const buAyinAvanslari = guncelAvanslar\.filter\(a => a\.personelId === p\.id && a\.ay === seciliAy && !a\.mahsupEdildi\);/.test(src));
t('netOdenecek negatife düşmüyor (Math.max(0, ...))', /const netOdenecek = Math\.max\(0, hesap\.netMaas - avansKesintisi\);/.test(src));
t('bordro nesnesi avansKesintisi/netOdenecek alanlarını taşıyor', /\.\.\.hesap, avansKesintisi, netOdenecek, hesaplamaTarihi:/.test(src));
t('mahsup edilen avanslar mahsupEdildi=true + mahsupBordroId ile bordroya bağlanıyor',
  /buAyinAvanslari\.forEach\(a => \{ a\.mahsupEdildi = true; a\.mahsupBordroId = bordro\.id; \}\);/.test(src));

console.log('\n-- page_ik_bordro.js: renderBordroTab artık kayıttan okuyor, canlı hesaplamıyor --');
t('eski canlı "avanslar.filter(...).reduce" hesaplaması ARTIK YOK',
  !/const ayinAvanslari = avanslar\.filter\(a => a\.personelId === p\.id && a\.ay === seciliAy && !a\.mahsupEdildi\)\.reduce/.test(src));
t('avansKesintisi artık bordro kaydından okunuyor', /const avansKesintisi = mevcutBordro\.avansKesintisi \|\| 0;/.test(src));
t('netOdenecek artık bordro kaydından okunuyor', /const netOdenecek = mevcutBordro\.netOdenecek != null \? mevcutBordro\.netOdenecek : mevcutBordro\.netMaas;/.test(src));
t('renderBordroTab artık avanslar parametresi almıyor (kullanılmayan parametre temizlendi)',
  /function renderBordroTab\(personeller, bordrolar\) \{/.test(src));

console.log('\n-- Sayısal doğruluk: mahsup/netOdenecek hesap mantığı gerçek verilerle doğrulanıyor --');
{
  // wireBordroTab'daki ikb-hesapla handler'ının çekirdek mantığını
  // (Store/DOM'dan bağımsız) izole edip gerçek senaryolarla doğruluyoruz.
  function bordroHesaplaMantik(personelId, ay, netMaas, tumAvanslar) {
    const buAyinAvanslari = tumAvanslar.filter(a => a.personelId === personelId && a.ay === ay && !a.mahsupEdildi);
    const avansKesintisi = buAyinAvanslari.reduce((a, x) => a + x.tutar, 0);
    const netOdenecek = Math.max(0, netMaas - avansKesintisi);
    const bordroId = 'BRD-TEST';
    buAyinAvanslari.forEach(a => { a.mahsupEdildi = true; a.mahsupBordroId = bordroId; });
    return { avansKesintisi, netOdenecek, bordroId, mahsupSayisi: buAyinAvanslari.length };
  }

  console.log('\n  -- Senaryo 1: avans yok — netOdenecek = netMaas --');
  {
    const avanslar = [];
    const r = bordroHesaplaMantik('P1', '2026-09', 20000, avanslar);
    t('avansKesintisi 0', r.avansKesintisi === 0);
    t('netOdenecek = netMaas (20000)', r.netOdenecek === 20000);
  }

  console.log('\n  -- Senaryo 2: iki avans (toplam 5000) — netOdenecek düşüyor, avanslar mahsup ediliyor --');
  {
    const avanslar = [
      { id: 'AVN-1', personelId: 'P1', ay: '2026-09', tutar: 3000, mahsupEdildi: false },
      { id: 'AVN-2', personelId: 'P1', ay: '2026-09', tutar: 2000, mahsupEdildi: false },
      { id: 'AVN-3', personelId: 'P2', ay: '2026-09', tutar: 9999, mahsupEdildi: false } // başka personel — etkilenmemeli
    ];
    const r = bordroHesaplaMantik('P1', '2026-09', 20000, avanslar);
    t('avansKesintisi = 5000', r.avansKesintisi === 5000);
    t('netOdenecek = 20000 - 5000 = 15000', r.netOdenecek === 15000);
    t('P1\'in iki avansı da mahsup edildi', avanslar[0].mahsupEdildi === true && avanslar[1].mahsupEdildi === true);
    t('mahsupBordroId doğru bağlandı', avanslar[0].mahsupBordroId === 'BRD-TEST');
    t('başka personelin (P2) avansı ETKİLENMEDİ', avanslar[2].mahsupEdildi === false);
  }

  console.log('\n  -- Senaryo 3: avans netMaas\'ı aşıyor — netOdenecek 0\'ın altına düşmüyor --');
  {
    const avanslar = [{ id: 'AVN-4', personelId: 'P1', ay: '2026-09', tutar: 25000, mahsupEdildi: false }];
    const r = bordroHesaplaMantik('P1', '2026-09', 20000, avanslar);
    t('avansKesintisi tam tutar (25000)', r.avansKesintisi === 25000);
    t('netOdenecek negatife düşmüyor (0)', r.netOdenecek === 0);
  }

  console.log('\n  -- Senaryo 4: zaten mahsup edilmiş avans TEKRAR sayılmıyor --');
  {
    const avanslar = [{ id: 'AVN-5', personelId: 'P1', ay: '2026-09', tutar: 1000, mahsupEdildi: true, mahsupBordroId: 'BRD-ONCEKI' }];
    const r = bordroHesaplaMantik('P1', '2026-09', 20000, avanslar);
    t('zaten mahsup edilmiş avans hesaba katılmadı (kesinti 0)', r.avansKesintisi === 0);
    t('mahsupBordroId değişmedi (dokunulmadı)', avanslar[0].mahsupBordroId === 'BRD-ONCEKI');
  }

  console.log('\n  -- Senaryo 5: farklı aya ait avans bu ayın bordrosuna karışmıyor --');
  {
    const avanslar = [{ id: 'AVN-6', personelId: 'P1', ay: '2026-08', tutar: 1000, mahsupEdildi: false }];
    const r = bordroHesaplaMantik('P1', '2026-09', 20000, avanslar);
    t('farklı aydaki avans bu ayın hesabına dahil edilmedi', r.avansKesintisi === 0 && avanslar[0].mahsupEdildi === false);
  }

  console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
  process.exit(bad ? 1 : 0);
}
