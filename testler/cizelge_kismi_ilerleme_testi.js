// BULGU (T3-31): cizelge_motor.js:operasyonlariCikar bir istasyon adımını
// yalnızca TAM tamamlandi ise (durum==='tamamlandi') atlıyordu — bir kart
// kalite/işlem'de KISMİ ilerleme kaydetmiş (örn. işlemTamamAdet>0) ama
// henüz TAMAMEN sevk edilmediği için durum hâlâ 'aktif' ise, çizelge o
// adımın TÜM (gerekli) adedini yeniden planlıyordu — zaten yapılmış işi
// ikinci kez kapasiteye yüklüyor, hat yükü/termin tahmini olduğundan
// yüksek çıkıyordu.
// Düzeltme: kaynakTip:kaynakId:ymId:stepIndex anahtarına göre bir kart
// haritası kurulur; kart 'tamamlandi' ise adım tamamen atlanır (değişmedi);
// kart 'aktif' ise KALAN adet = max(0, gelenAdet - fireAdet -
// işlemTamamAdet) olarak hesaplanıp yalnızca bu kalan miktar çizelgeye
// girer (işlemi biten ama henüz sevk edilmemiş adet, ayrı kapasite
// tüketmediği için tekrar planlanmaz); kart hiç yoksa (iş henüz o adıma
// hiç girmemiş) eskisi gibi TAM adet planlanır (regresyon yok).
// cizelge_motor.js dual-mode olduğu için doğrudan require edilip
// operasyonlariCikar gerçek verilerle çağrılabilir.
const CizelgeMotor = require('../cizelge_motor.js');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

function tabanVeri(ekstra) {
  return Object.assign({
    isemirleri: [], siparisler: [], istasyonIsleri: [],
    yarimamuller: [{ id: 'YM-1', kod: 'YM1', ad: 'Yan Panel', rotaId: 'ROTA-1' }],
    rotalar: [{ id: 'ROTA-1', steps: [
      { kod: 'S1', tanim: 'Kesim', hat: 'HAT-A', dk: 2 },
      { kod: 'S2', tanim: 'Montaj', hat: 'HAT-B', dk: 3 }
    ] }],
    receteler: [], urunler: []
  }, ekstra);
}

console.log('\n-- Senaryo 1: hiç kart yok (iş henüz başlamamış) — TAM adet planlanıyor (regresyon yok) --');
{
  const v = tabanVeri({
    isemirleri: [{ id: 'IE-1', kod: 'IE-001', durum: 'uretimde', kaynakSiparisIdler: [],
      uretimListesi: [{ tip: 'yarimamul', refId: 'YM-1', gerekliToplam: 100, rotaId: 'ROTA-1' }] }]
  });
  const ops = CizelgeMotor.operasyonlariCikar(v);
  t('2 operasyon üretildi (S1+S2)', ops.length === 2);
  t('S1 için TAM adet (100) planlandı', ops.find(o => o.istasyonKod === 'S1').adet === 100);
  t('S2 için de TAM adet (100) planlandı', ops.find(o => o.istasyonKod === 'S2').adet === 100);
}

console.log('\n-- Senaryo 2: S1 kartı TAMAMLANDI — S1 tamamen atlanıyor, S2 hâlâ TAM adet (kart yok orada) --');
{
  const v = tabanVeri({
    isemirleri: [{ id: 'IE-2', kod: 'IE-002', durum: 'uretimde', kaynakSiparisIdler: [],
      uretimListesi: [{ tip: 'yarimamul', refId: 'YM-1', gerekliToplam: 100, rotaId: 'ROTA-1' }] }],
    istasyonIsleri: [{ kaynakTip: 'ie', kaynakId: 'IE-2', yarimamulId: 'YM-1', stepIndex: 0,
      durum: 'tamamlandi', gelenAdet: 100, fireAdet: 0, islemTamamAdet: 100, sevkEdilenAdet: 100 }]
  });
  const ops = CizelgeMotor.operasyonlariCikar(v);
  t('yalnızca 1 operasyon üretildi (S1 atlandı)', ops.length === 1);
  t('kalan operasyon S2', ops[0].istasyonKod === 'S2');
  t('S2 için TAM adet (100) planlandı', ops[0].adet === 100);
}

console.log('\n-- Senaryo 3 (ANA BULGU): S1 kartı KISMİ ilerlemiş (işlemTamamAdet=60/100) — yalnızca KALAN 40 planlanıyor --');
{
  const v = tabanVeri({
    isemirleri: [{ id: 'IE-3', kod: 'IE-003', durum: 'uretimde', kaynakSiparisIdler: [],
      uretimListesi: [{ tip: 'yarimamul', refId: 'YM-1', gerekliToplam: 100, rotaId: 'ROTA-1' }] }],
    istasyonIsleri: [{ kaynakTip: 'ie', kaynakId: 'IE-3', yarimamulId: 'YM-1', stepIndex: 0,
      durum: 'aktif', gelenAdet: 100, fireAdet: 0, islemTamamAdet: 60, sevkEdilenAdet: 30 }]
  });
  const ops = CizelgeMotor.operasyonlariCikar(v);
  const s1 = ops.find(o => o.istasyonKod === 'S1');
  t('S1 hâlâ operasyon listesinde (tamamen bitmedi)', !!s1);
  t('S1 için ESKİ HATALI davranışta 100 planlanırdı, ARTIK yalnızca KALAN 40 planlanıyor', s1.adet === 40);
  t('sureDk da kalan adede göre (40*2=80)', s1.sureDk === 80);
}

console.log('\n-- Senaryo 4: fire düşülüyor — kalan = gelenAdet - fireAdet - islemTamamAdet --');
{
  const v = tabanVeri({
    isemirleri: [{ id: 'IE-4', kod: 'IE-004', durum: 'uretimde', kaynakSiparisIdler: [],
      uretimListesi: [{ tip: 'yarimamul', refId: 'YM-1', gerekliToplam: 100, rotaId: 'ROTA-1' }] }],
    istasyonIsleri: [{ kaynakTip: 'ie', kaynakId: 'IE-4', yarimamulId: 'YM-1', stepIndex: 0,
      durum: 'aktif', gelenAdet: 100, fireAdet: 10, islemTamamAdet: 50, sevkEdilenAdet: 0 }]
  });
  const ops = CizelgeMotor.operasyonlariCikar(v);
  const s1 = ops.find(o => o.istasyonKod === 'S1');
  t('kalan = 100 - 10 - 50 = 40', s1.adet === 40);
}

console.log('\n-- Senaryo 5: işlem TAMAMEN bitti ama henüz sevk edilmedi (yalnızca sevk kaldı) — S1 çizelgeye HİÇ girmiyor --');
{
  const v = tabanVeri({
    isemirleri: [{ id: 'IE-5', kod: 'IE-005', durum: 'uretimde', kaynakSiparisIdler: [],
      uretimListesi: [{ tip: 'yarimamul', refId: 'YM-1', gerekliToplam: 100, rotaId: 'ROTA-1' }] }],
    istasyonIsleri: [{ kaynakTip: 'ie', kaynakId: 'IE-5', yarimamulId: 'YM-1', stepIndex: 0,
      durum: 'aktif', gelenAdet: 100, fireAdet: 0, islemTamamAdet: 100, sevkEdilenAdet: 20 }]
  });
  const ops = CizelgeMotor.operasyonlariCikar(v);
  t('S1 çizelgeye hiç girmiyor (işlem bitti, sevk kapasite tüketmiyor)', !ops.find(o => o.istasyonKod === 'S1'));
  t('yalnızca S2 var', ops.length === 1 && ops[0].istasyonKod === 'S2');
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
