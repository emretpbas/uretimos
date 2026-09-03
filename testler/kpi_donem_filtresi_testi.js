// BULGU (T3-32): kpi_motor.js'in hesapla(v) fonksiyonu her zaman TÜM
// GEÇMİŞİ (ömür boyu kümülatif) topluyordu — "bugünün OEE'si ne?" ya da
// "bu haftaki fire oranı ne?" gibi sorulara cevap verilemiyordu.
// Düzeltme: hesapla(v, donemFiltre) artık OPSİYONEL bir ikinci parametre
// alıyor. Verilmezse (undefined/null) davranış AYNEN eskisi gibi kalır
// (geriye dönük tam uyumlu — ai_denetci.js hâlâ parametresiz çağırıyor).
// {baslangic, bitis} verilirse tarih taşıyan koleksiyonlar (istasyonIsleri
// via olusturmaTarihi, sureler via tarih, duruslar via tarih, arizalar via
// zaman, iadeler via olusturmaTarihi/satisTarihi) bu aralığa göre süzülür;
// geciken sipariş/makine doluluk/satınalma bekleyen/personel gibi ANLIK
// DURUM göstergeleri KASITLI olarak filtrelenmez (bunlar "şu an" sorusudur).
// Yeni yardımcılar: donemAraligiHesapla('gun'|'hafta'|diğer, referansTarih)
// ve tarihAralikta(tarihStr, donemFiltre). page_kpi_panel.js'e "Bugün / Bu
// Hafta / Tüm Zamanlar" seçici eklendi.
// kpi_motor.js'in hesapla(v) fonksiyonu SAF'tır (Store/DOM'a hiç dokunmaz)
// — bu yüzden dosya doğrudan require edilip gerçek verilerle test edilebilir.
const fs = require('fs'), path = require('path');
const KpiMotor = require('../kpi_motor.js');
const kpiPanelSrc = fs.readFileSync(path.join(__dirname, '..', 'page_kpi_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- page_kpi_panel.js: dönem seçici eklendi, KpiMotor.tumKpi filtreyle çağrılıyor --');
t('donemTip modül durumu tanımlı', /let donemTip = 'tumZamanlar';/.test(kpiPanelSrc));
t('renderKpiTab donemAraligiHesapla kullanıyor', /const donemFiltre = KpiMotor\.donemAraligiHesapla\(donemTip\);/.test(kpiPanelSrc));
t('KpiMotor.tumKpi artık donemFiltre ile çağrılıyor', /const \{ kpi \} = await KpiMotor\.tumKpi\(donemFiltre\);/.test(kpiPanelSrc));
t('Bugün/Bu Hafta/Tüm Zamanlar butonları var', /donemBtn\('gun', 'Bugün'\)\}\$\{donemBtn\('hafta', 'Bu Hafta'\)\}\$\{donemBtn\('tumZamanlar', 'Tüm Zamanlar'\)/.test(kpiPanelSrc));
t('buton tıklanınca donemTip güncellenip yeniden çiziliyor', /donemTip = b\.dataset\.tip;\s*\n\s*renderKpiTab\(content\);/.test(kpiPanelSrc));

console.log('\n-- kpi_motor.js: dışa aktarılan yeni yardımcılar --');
t('donemAraligiHesapla dışa aktarılıyor', typeof KpiMotor.donemAraligiHesapla === 'function');
t('tarihAralikta dışa aktarılıyor', typeof KpiMotor.tarihAralikta === 'function');

console.log('\n-- donemAraligiHesapla: gun/hafta/diğer doğru aralık üretiyor --');
{
  const gun = KpiMotor.donemAraligiHesapla('gun', '2026-09-03'); // Perşembe
  t('gun: baslangic=bitis=referans tarih', gun.baslangic === '2026-09-03' && gun.bitis === '2026-09-03');

  const hafta = KpiMotor.donemAraligiHesapla('hafta', '2026-09-03'); // Perşembe -> Pazartesi 2026-08-31
  t('hafta: Pazartesi\'den referans tarihe kadar', hafta.baslangic === '2026-08-31' && hafta.bitis === '2026-09-03');

  const haftaPzt = KpiMotor.donemAraligiHesapla('hafta', '2026-08-31'); // referansın kendisi Pazartesi
  t('hafta: referans zaten Pazartesiyse başlangıç=referans', haftaPzt.baslangic === '2026-08-31' && haftaPzt.bitis === '2026-08-31');

  const tumZ = KpiMotor.donemAraligiHesapla('tumZamanlar', '2026-09-03');
  t('tumZamanlar/tanımsız: null döner (filtre yok)', tumZ === null);
  t('bilinmeyen tip de null döner', KpiMotor.donemAraligiHesapla('vardiya', '2026-09-03') === null);
}

console.log('\n-- tarihAralikta: filtre yoksa hep true, filtre varken tarihsiz kayıt dışarıda, aralık doğru --');
{
  t('filtre yok -> her zaman true', KpiMotor.tarihAralikta('2020-01-01', null) === true);
  t('filtre var, tarih yok -> false (güvenli varsayılan)', KpiMotor.tarihAralikta(null, { baslangic: '2026-01-01', bitis: '2026-12-31' }) === false);
  t('aralık içinde -> true', KpiMotor.tarihAralikta('2026-06-15', { baslangic: '2026-01-01', bitis: '2026-12-31' }) === true);
  t('aralık dışında (önce) -> false', KpiMotor.tarihAralikta('2025-12-31', { baslangic: '2026-01-01', bitis: '2026-12-31' }) === false);
  t('aralık dışında (sonra) -> false', KpiMotor.tarihAralikta('2027-01-01', { baslangic: '2026-01-01', bitis: '2026-12-31' }) === false);
}

console.log('\n-- Sayısal doğruluk: hesapla(v, donemFiltre) gerçek verilerle doğrulanıyor --');
{
  function tabanVeri(ekstra) {
    return Object.assign({
      istasyonIsleri: [], sureler: [], rotalar: [], duruslar: [], siparisler: [],
      makinalar: [], arizalar: [], vardiyalar: [], iadeler: [], uygunsuzluklar: [],
      talepler: [], satinalmaTalepleri: [], isemirleri: [], personeller: [],
      yarimamuller: [], hammaddeler: [], kritikStok: [], stokRaf: []
    }, ekstra);
  }

  console.log('\n  -- Senaryo 1: donemFiltre VERİLMEZSE eski davranış (tüm geçmiş) korunur --');
  {
    const v1 = tabanVeri({ sureler: [{ dk: 50, tarih: '2020-01-01' }, { dk: 30, tarih: '2026-09-03' }] });
    const kpi1a = KpiMotor.hesapla(v1); // parametre yok
    const kpi1b = KpiMotor.hesapla(v1, null); // açıkça null
    t('parametresiz çağrı TÜM sureler toplanıyor (80 dk)', kpi1a.verimlilik.gerceklesenDk === 80);
    t('null filtre de aynı sonucu veriyor', kpi1b.verimlilik.gerceklesenDk === 80);
  }

  console.log('\n  -- Senaryo 2: donemFiltre verilince yalnızca aralıktaki sureler sayılıyor --');
  {
    const v2 = tabanVeri({ sureler: [{ dk: 50, tarih: '2020-01-01' }, { dk: 30, tarih: '2026-09-03' }] });
    const filtre = { baslangic: '2026-09-01', bitis: '2026-09-30' };
    const kpi2 = KpiMotor.hesapla(v2, filtre);
    t('yalnızca aralıktaki (30 dk) sayıldı, eski kayıt (50 dk) dışarıda', kpi2.verimlilik.gerceklesenDk === 30);
  }

  console.log('\n  -- Senaryo 3: duruslar da filtreleniyor (OEE kullanılabilirlik) --');
  {
    const v3 = tabanVeri({
      sureler: [{ dk: 100, tarih: '2026-09-03' }],
      duruslar: [{ sureMin: 500, tarih: '2020-01-01' }, { sureMin: 20, tarih: '2026-09-03' }]
    });
    const filtre = { baslangic: '2026-09-01', bitis: '2026-09-30' };
    const kpi3 = KpiMotor.hesapla(v3, filtre);
    // gerceklesenDk=100, durusDk yalnızca aralıktaki 20 dk -> 100/120
    t('eski (2020) 500 dk\'lık duruş kaydı hesaba katılmadı', Math.abs(kpi3.oee.kullanilabilirlik - (100 / 120)) < 1e-9);
  }

  console.log('\n  -- Senaryo 4: istasyonIsleri (kartlar) olusturmaTarihi\'ne göre filtreleniyor --');
  {
    const v4 = tabanVeri({
      sureler: [{ dk: 10, tarih: '2026-09-03' }],
      istasyonIsleri: [
        { durum: 'tamamlandi', gelenAdet: 100, fireAdet: 0, olusturmaTarihi: '2020-01-01' },
        { durum: 'tamamlandi', gelenAdet: 20, fireAdet: 2, olusturmaTarihi: '2026-09-03' }
      ]
    });
    const filtre = { baslangic: '2026-09-01', bitis: '2026-09-30' };
    const kpi4 = KpiMotor.hesapla(v4, filtre);
    t('yalnızca aralıktaki kart sayıldı (gelen=20)', kpi4.fire.toplam === 20);
    t('fire de yalnızca aralıktaki karttan (2)', kpi4.fire.adet === 2);
  }

  console.log('\n  -- Senaryo 5: geciken sipariş gibi ANLIK DURUM göstergeleri filtrelenmiyor --');
  {
    const v5 = tabanVeri({
      siparisler: [{ id: 'S1', durum: 'onaylandi', uretimDurumu: 'uretimde', uretimTermini: '2020-01-01' }]
    });
    const filtre = { baslangic: '2026-09-01', bitis: '2026-09-30' };
    const kpiFiltresiz = KpiMotor.hesapla(v5);
    const kpiFiltreli = KpiMotor.hesapla(v5, filtre);
    t('geciken sipariş sayısı filtre ile DEĞİŞMEDİ (anlık durum)', kpiFiltresiz.geciken.adet === kpiFiltreli.geciken.adet && kpiFiltreli.geciken.adet === 1);
  }

  console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
  process.exit(bad ? 1 : 0);
}
