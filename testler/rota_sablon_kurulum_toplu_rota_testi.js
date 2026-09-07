// ── ROTA ŞABLONLARI / KURULUM DURUMU / TOPLU ROTA — hiç test edilmemiş 3 dosya ─
// rota_sablon.js, kurulum_durumu.js ve toplu_rota.js için hiç test yoktu.
// İlk ikisinin dışa açtığı asıl mantık (adaylariBul, olc) DOM'a hiç
// dokunmadığından mrp_motor.js ile aynı desende dual-mode yapıldı
// (module.exports eklendi) ve Store sahte (in-memory) uygulamalarla gerçek
// birim testi yazıldı. toplu_rota.js'in TEK export'u (ac) baştan sona
// DOM/modal kurulumu olduğundan (page_*.js desenindeki gibi) kaynak kod
// üzerinde regex ile güvenlik/mantık doğrulaması yapılır.
//     node testler/rota_sablon_kurulum_toplu_rota_testi.js
const fs = require('fs'), path = require('path');
const RotaSablon = require('../rota_sablon.js');
const KurulumDurumu = require('../kurulum_durumu.js');

let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- RotaSablon.SABLONLAR: yapı bütünlüğü (her şablon eksiksiz tanımlı) --');
{
  t('en az 5 şablon tanımlı', RotaSablon.SABLONLAR.length >= 5);
  const hepsiGecerli = RotaSablon.SABLONLAR.every(s =>
    s.id && s.ad && s.aciklama && Array.isArray(s.adimlar) && s.adimlar.length > 0 &&
    s.adimlar.every(a => a.islem && Array.isArray(a.grupIpucu) && a.grupIpucu.length > 0 && a.dk > 0));
  t('her şablonun her adımı islem/grupIpucu/dk alanlarına sahip', hepsiGecerli);
  const idler = RotaSablon.SABLONLAR.map(s => s.id);
  t('şablon id\'leri BENZERSİZ (çakışma yok)', new Set(idler).size === idler.length);
}

console.log('\n-- RotaSablon.adaylariBul: fabrikanın kendi hat/makine listesinden eşleşme --');
{
  const hatlar = {
    'HAT-1': [
      { kod: 'MK-1', tanim: 'Panel Ebatlama Testeresi', grup: 'PANEL EBATLAMA' },
      { kod: 'MK-2', tanim: 'Kenar Bantlama Makinesi', grup: 'KENAR BANTLAMA' }
    ],
    'HAT-2': [
      { kod: 'MK-3', tanim: 'CNC İşleme Merkezi', grup: 'CNC İŞLEM' },
      { kod: 'MK-4', tanim: 'Daire Testere', grup: 'DAİRE TESTERE' }
    ]
  };
  const sonuc = RotaSablon.adaylariBul(hatlar, ['PANEL EBATLAMA', 'DAİRE TESTERE']);
  t('2 aday bulundu (PANEL EBATLAMA + DAİRE TESTERE)', sonuc.length === 2);
  t('birincil ipucu (PANEL EBATLAMA) puanı DAHA DÜŞÜK (daha güçlü) — önce sıralanıyor',
    sonuc[0].kod === 'MK-1' && sonuc[0].puan < sonuc[1].puan);
  t('eşleşmeyen ipucunda BOŞ dizi döner', RotaSablon.adaylariBul(hatlar, ['OLMAYAN GRUP']).length === 0);

  console.log('\n  -- büyük/küçük harf duyarsız (Türkçe locale) eşleşme --');
  const hatlarKucuk = { 'HAT-3': [{ kod: 'MK-5', tanim: 'test', grup: 'kenar bantlama' }] };
  t('küçük harfli grup adı da (Türkçe upper-case ile) eşleşiyor',
    RotaSablon.adaylariBul(hatlarKucuk, ['KENAR BANTLAMA']).length === 1);

  console.log('\n  -- eşit puanlıysa hat adına göre alfabetik sıralanıyor --');
  const esitPuan = {
    'HAT-Z': [{ kod: 'MK-Z', tanim: 't', grup: 'ZIMPARA VE YÜZEY' }],
    'HAT-A': [{ kod: 'MK-A', tanim: 't', grup: 'ZIMPARA VE YÜZEY' }]
  };
  const s2 = RotaSablon.adaylariBul(esitPuan, ['ZIMPARA VE YÜZEY']);
  t('aynı puanlı adaylar hat adına göre alfabetik (HAT-A önce)', s2[0].hat === 'HAT-A' && s2[1].hat === 'HAT-Z');
}

function sahteStoreKur(veri) {
  const varsayilan = {
    ayarlar: {}, musteriler: [], tedarikciler: [], hammaddeler: [], rotalar: [],
    yarimamuller: [], urunler: [], receteler: [], stokRaf: [], kontrolPlanlari: []
  };
  const v = Object.assign({}, varsayilan, veri);
  global.Store = { ayarlar: async () => v.ayarlar };
  ['musteriler', 'tedarikciler', 'hammaddeler', 'rotalar', 'yarimamuller', 'urunler', 'receteler', 'stokRaf', 'kontrolPlanlari']
    .forEach(k => { global.Store[k] = { all: async () => v[k] }; });
}

// ── toplu_rota.js: DOM'a bağlı olduğundan kaynak kod üzerinde regex doğrulaması ──
console.log('\n-- toplu_rota.js: güvenlik ve geri-alma mantığı kaynakta doğru --');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'toplu_rota.js'), 'utf8');
  t('rota atanabilen tipler yalnızca yarimamul/urun/altmontaj (paket DAHİL DEĞİL)',
    /anahtar: 'yarimamul'/.test(src) && /anahtar: 'urun'/.test(src) && /anahtar: 'altmontaj'/.test(src) &&
    !/anahtar: 'paket'/.test(src));
  t('rotası olan kartlar "üzerine yaz" işaretlenmeden ATLANIYOR',
    /const uygulanacak = uzerine \? secim : secim\.filter\(k => !k\.rotaId \|\| k\.rotaId === rotaId\)/.test(src));
  t('üzerine yazmadan önce window.confirm ile ek onay isteniyor',
    /window\.confirm\(rotaliOlan\.length \+ ' kartın mevcut rotası DEĞİŞTİRİLECEK/.test(src));
  t('atama öncesi eski rotaId sonIslem\'e kaydediliyor (geri alma için)',
    /sonIslem\.push\(\{ store: storeAdi, id: k\.id, oncekiRotaId: kayit\.rotaId \|\| null \}\)/.test(src));
  t('geri alma tam olarak oncekiRotaId\'yi geri yazıyor',
    /kayit\.rotaId = g\.oncekiRotaId;/.test(src));
  t('geri alma penceresi otomatik kapanıyor (12 saniye sonra)', /setTimeout\(kaldir, 12000\)/.test(src));
}

async function calistir() {

console.log('\n-- KurulumDurumu.olc(): boş sistemde tüm ölçülebilir adımlar %0 --');
{
    sahteStoreKur({});
    const adimlar = await KurulumDurumu.olc();
    t('8 adım döner', adimlar.length === 8);
    t('adım 1 (Ayarlar) %0 — saatlikIscilikUcreti yok', adimlar[0].deger === 0);
    t('adım 4 (Rota) %0 — hiç rota yok', adimlar[3].deger === 0);
    t('adım 5 (Yarı mamül+reçete) %0 — rotaHedef boşsa bölme hatası değil, 0 döner', adimlar[4].deger === 0);
    t('adım 6 (QR etiket) ölçülemez (deger=null, elle takip)', adimlar[5].deger === null && adimlar[5].elle === true);
    t('rota adımı KRİTİK olarak işaretli', adimlar[3].kritik === true);

    console.log('\n-- KurulumDurumu.olc(): kısmen doldurulmuş sistemde oranlar doğru hesaplanıyor --');
    sahteStoreKur({
      ayarlar: { saatlikIscilikUcreti: 250 },
      musteriler: [{ id: 'M1' }], tedarikciler: [],
      hammaddeler: [{ id: 'H1' }], rotalar: [{ id: 'RT1' }],
      yarimamuller: [{ id: 'Y1', rotaId: 'RT1' }, { id: 'Y2', rotaId: null }],
      urunler: [{ id: 'U1', rotaId: 'RT1' }],
      receteler: [{ urunId: 'U1', kalemler: [{ tip: 'hammadde', refId: 'H1', miktar: 1 }] }],
      stokRaf: [{ id: 'S1' }],
      kontrolPlanlari: [{ aktif: true, maddeler: [{ ad: 'kontrol1' }] }]
    });
    const a2 = await KurulumDurumu.olc();
    t('adım 1 (Ayarlar) %100 — saatlik ücret girilmiş', a2[0].deger === 100);
    t('adım 2 (Cari) %100 — en az 1 müşteri var', a2[1].deger === 100);
    t('adım 3 (Hammadde) %100', a2[2].deger === 100);
    t('adım 4 (Rota) %100', a2[3].deger === 100);
    t('adım 5: 3 karttan 2\'sine rota atanmış → %67', a2[4].deger === 67);
    t('adım 5 özetinde "2/3 karta rota atanmış" geçiyor', /2\/3 karta rota atanmış/.test(a2[4].ozet));
    t('adım 5 özetinde "1/1 üründe reçete var" geçiyor', /1\/1 üründe reçete var/.test(a2[4].ozet));
    t('adım 7 (Açılış stoğu) %100', a2[6].deger === 100);
    t('adım 8: 1 planlı parça → %20 (parça başına 20 puan)', a2[7].deger === 20);

}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
}

calistir().catch(e => { console.error(e); process.exit(1); });
