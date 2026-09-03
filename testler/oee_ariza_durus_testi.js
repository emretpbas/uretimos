// BULGU (T3-30): kpi_motor.js'in OEE (kullanılabilirlik) hesabı yalnızca
// elle girilen "Duruş/Aksaklık Bildir" kayıtlarını (duruslar koleksiyonu,
// d.sureMin) sayıyordu — üretimi durduran ("acil" öncelikli) makina
// arızaları (arizaKayitlari) hiç hesaba katılmıyordu. Bu, gerçekte üretimi
// saatlerce durduran bir arıza varken bile OEE'nin olduğundan yüksek
// (sanki üretim hiç durmamış gibi) çıkmasına yol açıyordu.
// Düzeltme: durusDk artık İKİ kaynağın toplamı — (1) duruslar.sureMin
// (değişmedi) + (2) yalnızca oncelik==='acil' (formda "üretim duruyor"
// olarak tanımlı — 'normal' öncelikli arızalar üretimi durdurmaz) VE
// hassas zaman damgası (zaman alanı) olan arızaKayitlari'nın açılış-kapanış
// (ya da hâlâ açıksa "şu ana") arasındaki gerçek dakika farkı.
// page_uretim_panel.js'teki "Arıza Bildir" artık zaman (ISO timestamp)
// alanı ekliyor; page_bakim_panel.js'teki "✓ Tamamlandı" artık
// tamamlanmaZaman ekliyor. Hassas zaman damgası OLMAYAN eski arıza
// kayıtları (bu düzeltmeden önce açılmış) hesaba katılmaz — yalnızca
// tarih (gün) farkı almak gerçek dışı duruş süresi üretir.
// kpi_motor.js'in hesapla(v) fonksiyonu SAF'tır (Store/DOM'a hiç
// dokunmaz — yalnızca veriYukle() dokunur) — bu yüzden dosyanın TAMAMI
// gerçek Node'da eval edilip hesapla() doğrudan, gerçek sayısal
// senaryolarla çağrılabilir.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'kpi_motor.js'), 'utf8');
const uretimSrc = fs.readFileSync(path.join(__dirname, '..', 'page_uretim_panel.js'), 'utf8');
const bakimSrc = fs.readFileSync(path.join(__dirname, '..', 'page_bakim_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- page_uretim_panel.js / page_bakim_panel.js: arıza kayıtları artık hassas zaman damgası taşıyor --');
t('Arıza Bildir açılış zaman damgası ekliyor',
  /durum: 'bekliyor', tarih: new Date\(\)\.toISOString\(\)\.slice\(0, 10\),\s*\n\s*\/\/ BULGU \(T3-30\)[\s\S]{0,150}zaman: new Date\(\)\.toISOString\(\)/.test(uretimSrc));
t('Tamamlandı kapanış zaman damgası ekliyor',
  /a\.tamamlanmaTarihi = new Date\(\)\.toISOString\(\)\.slice\(0, 10\);\s*\n\s*\/\/ BULGU \(T3-30\)[\s\S]{0,300}a\.tamamlanmaZaman = new Date\(\)\.toISOString\(\);/.test(bakimSrc));

console.log('\n-- kpi_motor.js: durusDk artık iki kaynağın (duruslar + acil arızalar) toplamı --');
t('durusDkManuel duruslar.sureMin\'den (değişmedi)',
  /const durusDkManuel = \(v\.duruslar \|\| \[\]\)\.reduce\(\(a, d\) => a \+ \(d\.sureMin \|\| 0\), 0\);/.test(src));
t('durusDkAriza yalnızca acil + zaman damgalı arızaları sayıyor',
  /const durusDkAriza = \(v\.arizalar \|\| \[\]\)\.filter\(a => a\.oncelik === 'acil' && a\.zaman\)\.reduce\(/.test(src));
t('durusDk = durusDkManuel + durusDkAriza', /const durusDk = durusDkManuel \+ durusDkAriza;/.test(src));

console.log('\n-- Sayısal doğruluk: kpi_motor.js SAF olduğu için TAMAMI eval edilip hesapla() gerçek verilerle çağrılıyor --');
{
  const KpiMotor = new Function(src + '\nreturn KpiMotor;')();

  function tabanVeri(ekstra) {
    return Object.assign({
      istasyonIsleri: [], sureler: [{ dk: 100 }], rotalar: [], duruslar: [],
      siparisler: [], makinalar: [], arizalar: [], vardiyalar: [],
      iadeler: [], uygunsuzluklar: []
    }, ekstra);
  }

  console.log('\n  -- Senaryo 1: sadece manuel duruş kaydı (regresyon yok — eski davranış korunmalı) --');
  {
    const v1 = tabanVeri({ duruslar: [{ sureMin: 30 }, { sureMin: 20 }] });
    const kpi1 = KpiMotor.hesapla(v1);
    // gerceklesenDk=100, durusDk=50 -> kullanilabilirlik = 100/150
    t('yalnızca manuel duruş: kullanılabilirlik doğru (100/150)', Math.abs(kpi1.oee.kullanilabilirlik - (100 / 150)) < 1e-9);
  }

  console.log('\n  -- Senaryo 2: acil arıza (zaman damgalı, KAPANMIŞ) OEE\'ye ekleniyor --');
  {
    const simdi = new Date();
    const acilmis = new Date(simdi.getTime() - 60 * 60000).toISOString(); // 60 dk önce açıldı
    const kapanmis = new Date(simdi.getTime() - 20 * 60000).toISOString(); // 20 dk önce kapandı (40 dk sürmüş)
    const v2 = tabanVeri({ duruslar: [], arizalar: [{ oncelik: 'acil', zaman: acilmis, tamamlanmaZaman: kapanmis }] });
    const kpi2 = KpiMotor.hesapla(v2);
    // gerceklesenDk=100, durusDkAriza≈40 -> kullanilabilirlik ≈ 100/140
    t('kapanmış acil arıza ≈40 dk duruş olarak sayıldı', Math.abs(kpi2.oee.kullanilabilirlik - (100 / 140)) < 0.01);
  }

  console.log('\n  -- Senaryo 3: acil arıza HÂLÂ AÇIK — "şu ana" kadar geçen süre sayılıyor --');
  {
    const simdi = new Date();
    const acilmis = new Date(simdi.getTime() - 30 * 60000).toISOString(); // 30 dk önce açıldı, hâlâ açık
    const v3 = tabanVeri({ duruslar: [], arizalar: [{ oncelik: 'acil', zaman: acilmis }] }); // tamamlanmaZaman YOK
    const kpi3 = KpiMotor.hesapla(v3);
    t('açık acil arıza ≈30 dk duruş olarak sayıldı', Math.abs(kpi3.oee.kullanilabilirlik - (100 / 130)) < 0.02);
  }

  console.log('\n  -- Senaryo 4: NORMAL öncelikli arıza OEE\'ye HİÇ eklenmiyor (üretimi durdurmuyor) --');
  {
    const simdi = new Date();
    const acilmis = new Date(simdi.getTime() - 120 * 60000).toISOString();
    const v4 = tabanVeri({ duruslar: [], arizalar: [{ oncelik: 'normal', zaman: acilmis }] });
    const kpi4 = KpiMotor.hesapla(v4);
    t('normal öncelikli arıza sayılmadı (kullanılabilirlik=1)', Math.abs(kpi4.oee.kullanilabilirlik - 1) < 1e-9);
  }

  console.log('\n  -- Senaryo 5: hassas zaman damgası OLMAYAN eski arıza kaydı sayılmıyor (geriye dönük güvenli) --');
  {
    const v5 = tabanVeri({ duruslar: [], arizalar: [{ oncelik: 'acil', tarih: '2026-08-01' }] }); // zaman YOK
    const kpi5 = KpiMotor.hesapla(v5);
    t('zaman damgasız eski arıza sayılmadı (kullanılabilirlik=1)', Math.abs(kpi5.oee.kullanilabilirlik - 1) < 1e-9);
  }

  console.log('\n  -- Senaryo 6: manuel duruş + acil arıza AYNI ANDA toplanıyor --');
  {
    const simdi = new Date();
    const acilmis = new Date(simdi.getTime() - 20 * 60000).toISOString();
    const v6 = tabanVeri({ duruslar: [{ sureMin: 10 }], arizalar: [{ oncelik: 'acil', zaman: acilmis }] });
    const kpi6 = KpiMotor.hesapla(v6);
    // durusDk ≈ 10 + 20 = 30 -> kullanilabilirlik ≈ 100/130
    t('iki kaynak birlikte toplandı (≈30 dk)', Math.abs(kpi6.oee.kullanilabilirlik - (100 / 130)) < 0.02);
  }

  console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
  process.exit(bad ? 1 : 0);
}
