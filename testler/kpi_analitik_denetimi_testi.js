// ════════════════════════════════════════════════════════════════════════════
// KPI / ANALİTİK / KOKPİT EKRANI DENETİMİ (T56) — dedicated test file
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let gecti = 0, kaldi = 0;
function test(ad, fn) {
  try { fn(); console.log('  GECTI ' + ad); gecti++; }
  catch (e) { console.log('  KALDI ' + ad + ' -> ' + e.message); kaldi++; }
}

const KpiMotor = require('../kpi_motor.js');
const AnalitikMotor = require('../analitik_motor.js');

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- kpi_motor.js: tarihStr yerel tarih kullanıyor (UTC gece yarısı hatası yok) --');
test('tarihStr UTC round-trip yapmıyor (kaynak kilidi)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../kpi_motor.js'), 'utf8');
  assert.ok(/const tarihStr = \(dt\) => \{ const p = /.test(src), 'tarihStr yardımcısı bulunamadı');
  // bakım alarmı, donemAraligiHesapla ve hesapla() artık .toISOString().slice(0,10) DEĞİL tarihStr kullanmalı
  // (tek kalan eşleşme, bulguyu açıklayan yorum satırıdır, gerçek kod değil)
  const eskiUtcKullanimi = (src.match(/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/g) || []).length;
  assert.strictEqual(eskiUtcKullanimi, 1, 'yalnızca açıklayıcı yorumda geçmeli, kod içinde hâlâ UTC güne düşen kullanım var');
});

test('donemAraligiHesapla ve hesapla() bugünü tarihStr(new Date()) ile hesaplıyor', () => {
  const src = fs.readFileSync(path.join(__dirname, '../kpi_motor.js'), 'utf8');
  assert.ok(/const bugunStr = tarihStr\(ref\)/.test(src));
  assert.ok(/const bugun = tarihStr\(new Date\(\)\)/.test(src));
});

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- kpi_motor.js: Personel Performansı çifte sayım düzeltmesi --');
test('bir kart hem islemOnaylari hem sevkler içerdiğinde adet YALNIZCA sevklerden sayılır', () => {
  const v = {
    istasyonIsleri: [{
      id: 'k1', durum: 'tamamlandi', gelenAdet: 10, fireAdet: 0,
      barkodZamani: '2026-01-01T08:00:00', bitisZamani: '2026-01-01T09:00:00',
      islemOnaylari: [{ kisi: 'Ali', adet: 10 }],
      sevkler: [{ kisi: 'Ali', adet: 10 }]
    }],
    rotalar: [], vardiyalar: [], siparisler: [], makinalar: [], arizalar: [],
    duruslar: [], sureler: [{ dk: 60 }], talepler: [], satinalmaTalepleri: [], iadeler: []
  };
  const sonuc = KpiMotor.hesapla(v);
  const ali = sonuc.personel.liste.find(p => p.kisi === 'Ali');
  assert.ok(ali, 'Ali personel listesinde bulunamadı');
  // Eski (hatalı) davranışta 10+10=20 olurdu; doğrusu tek partinin gerçek çıkışı olan 10'dur
  assert.strictEqual(ali.adet, 10, 'adet çifte sayılmamalı (islemOnaylari + sevkler AYNI partiyi temsil eder)');
  assert.strictEqual(ali.kart, 1, 'kart sayısı 1 olmalı');
});

test('islemOnaylari veren ama sevk yapmayan kişi kart sayılır, adede dahil olmaz', () => {
  const v = {
    istasyonIsleri: [{
      id: 'k2', durum: 'tamamlandi', gelenAdet: 5, fireAdet: 0,
      barkodZamani: '2026-01-01T08:00:00', bitisZamani: '2026-01-01T08:30:00',
      islemOnaylari: [{ kisi: 'Veli', adet: 5 }],
      sevkler: [{ kisi: 'Ayşe', adet: 5 }]
    }],
    rotalar: [], vardiyalar: [], siparisler: [], makinalar: [], arizalar: [],
    duruslar: [], sureler: [], talepler: [], satinalmaTalepleri: [], iadeler: []
  };
  const sonuc = KpiMotor.hesapla(v);
  const veli = sonuc.personel.liste.find(p => p.kisi === 'Veli');
  const ayse = sonuc.personel.liste.find(p => p.kisi === 'Ayşe');
  assert.ok(veli && veli.kart === 1 && veli.adet === 0, 'Veli sadece kart paylaşımına dahil olmalı, adet 0');
  assert.ok(ayse && ayse.adet === 5, 'Ayşe sevk ettiği adedi almalı');
});

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- kpi_motor.js: bakım alarmı yerel tarihle karşılaştırıyor --');
test('bakım süresi tam bugüne denk geldiğinde alarm doğru tetiklenir (UTC kaymasından etkilenmez)', () => {
  const bugun = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const bugunYerel = `${bugun.getFullYear()}-${p(bugun.getMonth() + 1)}-${p(bugun.getDate())}`;
  const v = {
    istasyonIsleri: [], rotalar: [], vardiyalar: [], siparisler: [],
    makinalar: [{ id: 'm1', durum: 'aktif', bakimAralikGun: 1, sonBakimTarihi: gunOnce(bugunYerel, -1) }],
    arizalar: [], duruslar: [], sureler: [], talepler: [], satinalmaTalepleri: [], iadeler: []
  };
  const sonuc = KpiMotor.hesapla(v);
  assert.strictEqual(sonuc.makineDoluluk.deger, 0, 'sonBakim+1gün = bugün olan makina alarm vermeli (kullanılamaz)');
  assert.strictEqual(sonuc.makineDoluluk.bakimda, 1);
});
function gunOnce(tarihStr, g) {
  const d = new Date(tarihStr + 'T00:00:00');
  d.setDate(d.getDate() + g);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- analitik_motor.js: tarihStr yerel tarih (T45 bulgusu artık düzeltildi) --');
test('bugun()/gunEkle() artık toISOString kullanmıyor (kaynak kilidi)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../analitik_motor.js'), 'utf8');
  assert.ok(/const tarihStr = \(dt\) => \{ const p = /.test(src), 'tarihStr yardımcısı bulunamadı');
  assert.ok(/const bugun = \(\) => tarihStr\(new Date\(\)\)/.test(src));
  assert.ok(/const gunEkle = \(t, g\) => \{ const d = new Date/.test(src));
  const eskiUtcKullanimi = (src.match(/\.toISOString\(\)\.slice\(0,\s*10\)/g) || []).length;
  assert.strictEqual(eskiUtcKullanimi, 0, 'hâlâ toISOString().slice(0,10) ile UTC güne düşen kod var');
});

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- analitik_motor.js: satisHunisi durum filtresi düzeltmesi --');
test('reddedilen artık gerçek durum değerlerini (kaybedildi/iptal/siparis_reddedildi) sayıyor', () => {
  const v = {
    teklifler: [
      { durum: 'kaybedildi' },
      { durum: 'iptal' },
      { durum: 'siparise_donustu' },
      { durum: 'beklemede' }
    ],
    siparisler: []
  };
  const sonuc = AnalitikMotor.satisHunisi(v);
  assert.strictEqual(sonuc.toplam, 4);
  assert.strictEqual(sonuc.siparise, 1);
  assert.strictEqual(sonuc.reddedilen, 2, 'kaybedildi + iptal reddedilen sayılmalı');
  assert.strictEqual(sonuc.bekleyen, 1);
});

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- analitik_motor.js: stokDegeri/stokYaslandirma yarımamül+ürün değerlemesi --');
test('maliKpi.stokDegeri artık yarımamül ve ürün stoklarını da değerliyor (yalnız hammadde değil)', () => {
  const v = {
    stokRaf: [
      { tip: 'hammadde', refId: 'h1', miktar: 10 },
      { tip: 'yarimamul', refId: 'y1', miktar: 5 },
      { tip: 'urun', refId: 'u1', miktar: 2 }
    ],
    hammaddeler: [{ id: 'h1', birimFiyat: 3 }],
    yarimamuller: [{ id: 'y1', referansFiyat: 20 }],
    urunler: [{ id: 'u1', referansFiyat: 100 }],
    satinalmaSiparisleri: []
  };
  const sonuc = AnalitikMotor.maliKpi(v, [], { toplam: 0 }, { toplam: 0 });
  // 10*3 (hammadde) + 5*20 (yarımamül) + 2*100 (ürün) = 30+100+200 = 330
  assert.strictEqual(sonuc.stokDegeri, 330, 'stokDegeri hammadde+yarımamül+ürün toplamı olmalı');
});

test('stokYaslandirma satır bazında yarımamül/ürün deger hesaplıyor', () => {
  const v = {
    stokRaf: [
      { tip: 'yarimamul', refId: 'y1', refAd: 'YM1', refKod: 'YM1', miktar: 5, birim: 'adet', ambar: 'uretim_ambari' },
      { tip: 'urun', refId: 'u1', refAd: 'U1', refKod: 'U1', miktar: 2, birim: 'adet', ambar: 'sevkiyat_deposu' }
    ],
    hammaddeler: [],
    yarimamuller: [{ id: 'y1', referansFiyat: 20 }],
    urunler: [{ id: 'u1', referansFiyat: 100 }],
    stokHareketleri: []
  };
  const sonuc = AnalitikMotor.stokYaslandirma(v);
  // 5*20 (yarımamül) + 2*100 (ürün) = 100+200 = 300
  assert.strictEqual(sonuc.toplamDeger, 300, 'yarımamül+ürün değeri toplama katılmalı');
});

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- page_dashboard.js: iptal edilmiş iş emri açık sayılmıyor --');
test('acikIsEmri hesaplaması iptal durumunu da hariç tutuyor (kaynak kilidi)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../page_dashboard.js'), 'utf8');
  assert.ok(/i\.durum !== 'tamamlandi' && i\.durum !== 'iptal'/.test(src), 'acikIsEmri filtresi iptal durumunu hariç tutmuyor');
});

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- page_kpi_panel.js: Mali & Ticari blok rol kısıtı + dönem etiketi --');
test('Mali & Ticari Göstergeler bloğu yalnızca yetkili rollere gösteriliyor (kaynak kilidi)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../page_kpi_panel.js'), 'utf8');
  assert.ok(/const maliGorunurRoller = \['admin', 'yonetim', 'arge', 'cari', 'muhasebe'\]/.test(src));
  assert.ok(/if \(maliGorunurRoller\.includes\(App\.aktifRol\(\)\)\) try \{/.test(src));
});

test('Mali & Ticari Göstergeler başlığında "ömür boyu kümülatif" uyarı etiketi var', () => {
  const src = fs.readFileSync(path.join(__dirname, '../page_kpi_panel.js'), 'utf8');
  assert.ok(/ömür boyu kümülatif — üstteki dönem seçiciden etkilenmez/.test(src));
});

// ────────────────────────────────────────────────────────────────────────────
console.log('\n-- page_analitik.js: yanlış etiketlenmiş kart düzeltmesi --');
test('"açık sipariş" yerine "açık satınalma siparişi" yazıyor (kaynak kilidi)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../page_analitik.js'), 'utf8');
  assert.ok(/açık satınalma siparişi/.test(src), 'düzeltilmiş etiket bulunamadı');
  assert.ok(!/\$\{b\.satirlar\.length\}\s*açık sipariş<\/div>/.test(src), 'eski yanlış etiket hâlâ mevcut');
});

console.log(`\nSONUC: ${gecti} gecti, ${kaldi} kaldi`);
process.exit(kaldi > 0 ? 1 : 0);
