// ── DOLAP PANEL / REVİZYON ÖZELLİKLERİ TESTİ ────────────────────────────────
// Panel bazlı kalınlık-hammadde-kenar bandı, manuel raf konumları, rafın altına
// askı borusu, manuel kapak yükseklikleri ve taç kalınlık/konum kontrolleri.
//     node testler/dolap_panel_test.js

const D = require('../dolap_hesap.js');
let gecti = 0, kaldi = 0;
const es = (ad, beklenen, gercek) => {
  const ok = Math.abs(beklenen - gercek) < 0.01;
  console.log('  ' + (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad +
    (ok ? '' : '  \x1b[33mbeklenen ' + beklenen + ', gelen ' + gercek + '\x1b[0m'));
  ok ? gecti++ : kaldi++;
};
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

const temel = {
  genislik: 800, yukseklik: 2000, derinlik: 500, panelKalinlik: 18,
  govdeTipi: 'yan_tam', bazaTipi: 'baza', bazaYukseklik: 100,
  kapakSayisi: 2, kapakTipi: 'tam_bini', fuga: 3, rafSabit: 1, rafHareketli: 3
};
const bul = (r, rol) => r.paneller.find(p => p.rol === rol);

// ── 1) GERİYE UYUMLULUK ────────────────────────────────────────────────────
console.log('\n\x1b[1mGeriye uyumluluk — yeni alanlar verilmezse çıktı değişmez\x1b[0m');
const a = D.hesapla(temel);
const b = D.hesapla(Object.assign({}, temel, { panelAyarlari: {}, raflar: [], kapakYukseklikleri: [] }));
dogru('Boş yeni alanlar çıktıyı değiştirmiyor', JSON.stringify(a.paneller) === JSON.stringify(b.paneller));
dogru('Panellerde bantIds alanı var (varsayılan null)', bul(a, 'yan').bantIds === null);
dogru('Panellerde hammaddeId alanı var (varsayılan null)', bul(a, 'yan').hammaddeId === null);

// ── 2) PANEL BAZLI KALINLIK VE HAMMADDE ────────────────────────────────────
console.log('\n\x1b[1mPanel bazlı kalınlık ve hammadde seçimi\x1b[0m');
const pa = D.hesapla(Object.assign({}, temel, {
  panelAyarlari: {
    yan: { kalinlik: 25, hammaddeId: 'HM-SUNTA25' },
    kapak: { kalinlik: 22, hammaddeId: 'HM-MDFLAK' },
    arkalik: { kalinlik: 10, hammaddeId: 'HM-HDF10' }
  }
}));
es('Yan panel kalınlığı 25 (genel 18 yerine)', 25, bul(pa, 'yan').kalinlik);
es('Kapak kalınlığı 22', 22, bul(pa, 'kapak').kalinlik);
es('Arkalık kalınlığı 10', 10, bul(pa, 'arkalik').kalinlik);
es('Ayarsız panel genel kalınlığı korur (üst panel 18)', 18, bul(pa, 'ust').kalinlik);
dogru('Yan panele hammadde bağlandı', bul(pa, 'yan').hammaddeId === 'HM-SUNTA25');
dogru('Ayarsız panelin hammaddesi boş kalır', bul(pa, 'ust').hammaddeId === null);
dogru('Kalınlık değişimi ölçüyü bozmuyor', bul(pa, 'yan').netBoy === bul(a, 'yan').netBoy);

// ── 3) KENAR BANDI — ATANMAYAN KENAR BOŞ KALIR ─────────────────────────────
console.log('\n\x1b[1mKenar bandı ataması (atanmayan kenar bantsız)\x1b[0m');
const bt = D.hesapla(Object.assign({}, temel, {
  kesimPayi: 0,
  panelAyarlari: {
    kapak: { bantlar: { on: 'BANT-PVC1', arka: 'BANT-PVC1', sag: 'BANT-PVC1', sol: 'BANT-PVC1' } },
    yan:   { bantlar: { on: 'BANT-PVC1' } }                      // yalnız ön kenar
  }
}));
const kp = bul(bt, 'kapak'), yn = bul(bt, 'yan');
dogru('Kapağın 4 kenarında da bant var',
  kp.bantIds.on && kp.bantIds.arka && kp.bantIds.sag && kp.bantIds.sol);
dogru('Yan panelin yalnız ön kenarında bant var',
  yn.bantIds.on === 'BANT-PVC1' && !yn.bantIds.arka && !yn.bantIds.sag && !yn.bantIds.sol);
// Kenar eşlemesi: ön/arka → NET BOY, sağ/sol → NET EN (app.js ile aynı)
es('4 kenar bant metresi = çevre (2×(en+boy)) × adet / 1000',
  2 * (kp.netEn + kp.netBoy) * kp.adet / 1000, kp.bantMetre);
es('Tek ön kenar bandı = netBoy × adet / 1000', yn.netBoy * yn.adet / 1000, yn.bantMetre);
const bantsiz = D.hesapla(Object.assign({}, temel, { panelAyarlari: { arkalik: { bantlar: {} } } }));
es('Hiç kenar atanmayan panelin bant metresi 0', 0, bul(bantsiz, 'arkalik').bantMetre);

// ── 4) MANUEL RAF KONUMLARI ────────────────────────────────────────────────
console.log('\n\x1b[1mManuel raf konumları\x1b[0m');
const mr = D.hesapla(Object.assign({}, temel, {
  rafSabit: 0, rafHareketli: 0,
  raflar: [
    { konum: 400, tip: 'sabit' },
    { konum: 900, tip: 'hareketli' },
    { konum: 1300, tip: 'hareketli' }
  ]
}));
es('Manuel listede 1 sabit raf', 1, bul(mr, 'raf_sabit').adet);
es('Manuel listede 2 hareketli raf', 2, bul(mr, 'raf_hareketli').adet);
const kon = mr.bolmeler[0].raflar.map(r => r.konum);
dogru('Raf konumları girildiği gibi korunuyor', kon.join(',') === '400,900,1300');
const mrSirasiz = D.hesapla(Object.assign({}, temel, {
  rafSabit: 0, rafHareketli: 0,
  raflar: [{ konum: 1300 }, { konum: 400 }, { konum: 900 }]
}));
dogru('Karışık girilen konumlar sıralanıyor',
  mrSirasiz.bolmeler[0].raflar.map(r => r.konum).join(',') === '400,900,1300');
dogru('Manuel liste boşsa eşit dağıtım devam ediyor',
  D.hesapla(temel).bolmeler[0].raflar.length === 4);

// ── 5) RAFIN ALTINA ASKI BORUSU ────────────────────────────────────────────
console.log('\n\x1b[1mRafın altına askı borusu\x1b[0m');
const ab = D.hesapla(Object.assign({}, temel, {
  rafSabit: 0, rafHareketli: 0,
  raflar: [{ konum: 400, tip: 'sabit', askiBorusu: true }, { konum: 1200, tip: 'hareketli' }]
}));
const boru = ab.hirdavat.find(h => h.ad === 'Askı borusu');
const flans = ab.hirdavat.find(h => h.ad === 'Askı borusu flanşı');
dogru('Askı borusu hırdavata eklendi', !!boru);
es('1 askı borusu', 1, boru.adet);
es('Her boruya 2 flanş', 2, flans.adet);
dogru('Boru boyu bölme genişliğinden 4mm dar (764−4=760)', /760 mm/.test(boru.model));
dogru('Boru hangi rafın altında olduğunu yazıyor', /1\. rafın altı/.test(boru.model));
dogru('Askı borusuna marka atanmıyor', boru.marka === '');
es('Özette askı borusu sayısı', 1, ab.ozet.askiBoruAdedi);
dogru('Askı borusu istenmezse hiç eklenmiyor', !D.hesapla(temel).hirdavat.find(h => h.ad === 'Askı borusu'));

// ── 6) MANUEL KAPAK YÜKSEKLİKLERİ (ÜST ÜSTE) ───────────────────────────────
console.log('\n\x1b[1mManuel kapak yükseklikleri (üst üste dizilim)\x1b[0m');
const mk = D.hesapla(Object.assign({}, temel, {
  kapakSayisi: 3, kapakDizilim: 'ustuste', kapakYukseklikleri: [600, 700, 580]
}));
const kapaklar = mk.paneller.filter(p => p.rol === 'kapak');
es('3 kapak paneli üretildi', 3, kapaklar.length);
es('1. kapak yüksekliği 600', 600, kapaklar[0].netBoy);
es('2. kapak yüksekliği 700', 700, kapaklar[1].netBoy);
es('3. kapak yüksekliği 580', 580, kapaklar[2].netBoy);
dogru('Üst üste kapaklar tam en (fuga düşülmüş)', kapaklar[0].netEn === 800 - 3);
const mkEksik = D.hesapla(Object.assign({}, temel, {
  kapakSayisi: 3, kapakDizilim: 'ustuste', kapakYukseklikleri: [600]
}));
const ke = mkEksik.paneller.filter(p => p.rol === 'kapak');
dogru('Eksik verilen yükseklikler kalan alana eşit bölünüyor',
  Math.abs(ke[1].netBoy - ke[2].netBoy) < 0.01 && ke[0].netBoy === 600);
const mkTasan = D.hesapla(Object.assign({}, temel, {
  kapakSayisi: 2, kapakDizilim: 'ustuste', kapakYukseklikleri: [1500, 1500]
}));
dogru('Toplam alanı aşan yükseklikler uyarı veriyor',
  mkTasan.uyarilar.some(u => /toplamı/.test(u)));

// ── 7) TAÇ: KALINLIK + KONUM ───────────────────────────────────────────────
console.log('\n\x1b[1mÜst taç — kalınlık ve konum\x1b[0m');
const tacUst = D.hesapla(Object.assign({}, temel, { ustTac: true, ustTacKalinlik: 18, ustTacKonum: 'ustune' }));
const tacAra = D.hesapla(Object.assign({}, temel, { ustTac: true, ustTacKalinlik: 18, ustTacKonum: 'aralarina' }));
es('Üstüne konumda taç eni tam en (800)', 800, bul(tacUst, 'ust_tac').netEn);
es('Arasına konumda taç eni W−2t (764)', 764, bul(tacAra, 'ust_tac').netEn);
es('Taç derinliği gövde derinliği (500)', 500, bul(tacUst, 'ust_tac').netBoy);
es('Taç kalınlığı verilen değer (18)', 18, bul(tacUst, 'ust_tac').kalinlik);
es('Taç gövde yüksekliğinden kalınlığı kadar düşer (2000−100−18=1882)', 1882, tacUst.ozet.govdeYukseklik);
const tacKalin = D.hesapla(Object.assign({}, temel, { ustTac: true, ustTacKalinlik: 30, ustTacKonum: 'ustune' }));
es('Kalınlık 30 → gövde 1870', 1870, tacKalin.ozet.govdeYukseklik);
es('Taç kalınlığı 30 panele yansıyor', 30, bul(tacKalin, 'ust_tac').kalinlik);
const tacEski = D.hesapla(Object.assign({}, temel, { ustTac: true, ustTacYukseklik: 80 }));
es('Kalınlık verilmezse eski davranış (gövde 2000−100−80=1820)', 1820, tacEski.ozet.govdeYukseklik);
es('Eski davranışta taç boyu = yükseklik (80)', 80, bul(tacEski, 'ust_tac').netBoy);
dogru('Arasına konumu adında belirtiliyor', /arasına/.test(bul(tacAra, 'ust_tac').ad));
const tacD = D.hesapla(Object.assign({}, temel, { ustTac: true, ustTacKalinlik: 18, ustTacDerinlik: 300 }));
es('Taç derinliği ayrıca verilebiliyor (300)', 300, bul(tacD, 'ust_tac').netBoy);

// ── 8) BÖLME BAZLI MANUEL RAF + ASKI BORUSU ────────────────────────────────
console.log('\n\x1b[1mÇok bölmeli — bölme bazlı manuel raf ve askı borusu\x1b[0m');
const cb = D.hesapla(Object.assign({}, temel, {
  genislik: 1600, kapakSayisi: 0,
  bolmeler: [
    { oran: 1, raflar: [{ konum: 300, tip: 'sabit', askiBorusu: true }], kapakSayisi: 1 },
    { oran: 1, rafHareketli: 3, kapakSayisi: 1 }
  ]
}));
es('Bölme 1 manuel rafı: 1 sabit', 1, cb.paneller.find(p => p.ad.indexOf('Sabit raf (Bölme 1)') === 0).adet);
es('Bölme 2 eşit dağıtım: 3 hareketli', 3, cb.paneller.find(p => p.ad.indexOf('Hareketli raf (Bölme 2)') === 0).adet);
dogru('Bölme 1 askı borusu eklendi',
  cb.hirdavat.some(h => h.ad === 'Askı borusu' && /Bölme 1/.test(h.model)));
es('Toplam askı borusu 1', 1, cb.ozet.askiBoruAdedi);

console.log('\n' + '─'.repeat(50));
if (kaldi === 0) { console.log('\x1b[1;32m✓ ' + gecti + ' kontrolün tamamı geçti\x1b[0m'); process.exit(0); }
console.log('\x1b[1;31m✗ ' + kaldi + ' kontrol başarısız (' + gecti + ' geçti)\x1b[0m'); process.exit(1);
