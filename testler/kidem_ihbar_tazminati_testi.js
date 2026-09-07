// BULGU: kidemIhbarHesapla (app.js) kıdem tazminatını yalnızca BRÜT olarak
// hesaplıyordu — oysa kıdem tazminatı damga vergisine tabidir (gelir
// vergisinden istisna olsa da). Şirketin gerçekte ödeyeceği/karşılayacağı
// NET tutar, KPI ve dashboard'larda BRÜT tutarla karıştırılıyordu.
// Düzeltme:
//  1) kidemIhbarHesapla artık kidemDamgaVergisi ve netKidemTazminati alanlarını
//     da döndürüyor (binde oranı ayarlar.damgaVergisiOraniBinde'den, yoksa 7.59
//     varsayılanından okunur — bordroHesapla'daki AYNI ayar, kod tekrarı yok).
//  2) toplamTazminat artık netKidemTazminati + ihbarTazminati (brüt kıdem değil).
//  3) page_ik_tazminat.js tabloya "Damga Vergisi" ve "Kıdem Tazminatı (Net)"
//     kolonları eklendi, KPI kartları netleştirildi.
//  4) page_ust_yonetim_kokpit.js'teki "toplam kıdem tazminatı yükü" KPI'ı da
//     artık netKidemTazminati kullanıyor (eskiden brüt kullanıyordu).
// app.js/page_*.js Store/DOM'a derinden bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır;
// kidemIhbarHesapla izole edilip gerçek verilerle de doğrulanır.
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const tazminatSrc = fs.readFileSync(path.join(__dirname, '..', 'page_ik_tazminat.js'), 'utf8');
const kokpitSrc = fs.readFileSync(path.join(__dirname, '..', 'page_ust_yonetim_kokpit.js'), 'utf8');
const dataSrc = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- app.js: kidemIhbarHesapla artık damga vergisi + net kıdem tazminatı hesaplıyor --');
t('kidemDamgaVergisi hesaplanıyor (damgaVergisiOraniBinde, yoksa 7.59 varsayılan)',
  /const kidemDamgaVergisi = kidemTazminati \* \(\(ayarlar\.damgaVergisiOraniBinde \?\? 7\.59\) \/ 1000\);/.test(appSrc));
t('netKidemTazminati = kidemTazminati - kidemDamgaVergisi', /const netKidemTazminati = kidemTazminati - kidemDamgaVergisi;/.test(appSrc));
t('toplamTazminat artık NET kıdem + brüt ihbar (brüt kıdem DEĞİL)',
  /toplamTazminat: netKidemTazminati \+ ihbarTazminati/.test(appSrc) &&
  !/toplamTazminat: kidemTazminati \+ ihbarTazminati/.test(appSrc));
t('dönüş nesnesi yeni alanları içeriyor', /return \{\s*yilSayisi, kidemTazminati, kidemDamgaVergisi, netKidemTazminati,/.test(appSrc));

console.log('\n-- page_ik_tazminat.js: tablo/KPI net tutarı gösteriyor --');
t('KPI: Toplam Kıdem Tazminatı Yükü (Net)', /Toplam Kıdem Tazminatı Yükü \(Net\)/.test(tazminatSrc));
t('KPI: Toplam İhbar Tazminatı Yükü (Brüt)', /Toplam İhbar Tazminatı Yükü \(Brüt\)/.test(tazminatSrc));
t('tablo: Damga Vergisi kolonu var', /<th class="r">Damga Vergisi<\/th>/.test(tazminatSrc));
t('tablo: Kıdem Tazminatı (Net) kolonu var', /<th class="r">Kıdem Tazminatı \(Net\)<\/th>/.test(tazminatSrc));
t('satırda h.hesap.kidemDamgaVergisi ve netKidemTazminati kullanılıyor',
  /h\.hesap\.kidemDamgaVergisi/.test(tazminatSrc) && /h\.hesap\.netKidemTazminati/.test(tazminatSrc));
t('GENEL TOPLAM satırı da net/damga/brüt ayrımını yansıtıyor',
  /toplamKidemBrut/.test(tazminatSrc) && /toplamKidemDamga/.test(tazminatSrc) && /toplamKidemNet/.test(tazminatSrc));

console.log('\n-- page_ust_yonetim_kokpit.js: kıdem tazminatı yükü KPI\'ı da NET tutarı kullanıyor --');
t('toplamKidemYuku artık h.netKidemTazminati kullanıyor (h.kidemTazminati DEĞİL)',
  /netKidemTazminati/.test(kokpitSrc));

console.log('\n-- Sayısal doğruluk: kidemIhbarHesapla izole edilip gerçek verilerle doğrulanıyor --');
{
  function fonksiyonCikar(src, ad) {
    const baslangic = src.indexOf('function ' + ad + '(');
    if (baslangic === -1) throw new Error(ad + ' bulunamadı');
    let derinlik = 0, i = src.indexOf('{', baslangic);
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') derinlik++;
      if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
    }
    return src.slice(baslangic, i);
  }
  function sabitCikar(src, ad) {
    const baslangic = src.indexOf('const ' + ad + ' = {');
    if (baslangic === -1) throw new Error(ad + ' bulunamadı');
    let derinlik = 0, i = src.indexOf('{', baslangic);
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') derinlik++;
      if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
    }
    let sonu = src.indexOf(';', i);
    return src.slice(baslangic, sonu + 1);
  }
  const kaynak = sabitCikar(dataSrc, 'BORDRO_AYARLARI_VARSAYILAN') + '\n' +
    fonksiyonCikar(appSrc, 'kidemIhbarHesapla');
  const izole = new Function(kaynak + '\nreturn { kidemIhbarHesapla };');
  const { kidemIhbarHesapla } = izole();

  console.log('\n  -- Tam yıl, tavan altı maaş: damga vergisi doğru kesiliyor --');
  {
    const besYilOnce = new Date();
    besYilOnce.setFullYear(besYilOnce.getFullYear() - 5);
    const personel = { iseGirisTarihi: besYilOnce.toISOString().slice(0, 10), brutMaas: 30000 };
    const ayarlar = { kidemTazminatiTavani: 53919.68, damgaVergisiOraniBinde: 7.59 };
    const h = kidemIhbarHesapla(personel, null, ayarlar);

    t('yilSayisi ~5', Math.abs(h.yilSayisi - 5) < 0.02);
    const beklenenBrut = (30000 / 30) * 30 * h.yilSayisi;
    t('kidemTazminati brüt doğru (tavan altı, günlük ücret × 30 × yıl)', Math.abs(h.kidemTazminati - beklenenBrut) < 1);
    const beklenenDamga = h.kidemTazminati * (7.59 / 1000);
    t('kidemDamgaVergisi = brüt × 7.59‰', Math.abs(h.kidemDamgaVergisi - beklenenDamga) < 0.01);
    t('netKidemTazminati = brüt - damga', Math.abs(h.netKidemTazminati - (h.kidemTazminati - h.kidemDamgaVergisi)) < 0.001);
    t('net < brüt (damga vergisi gerçekten düşülmüş)', h.netKidemTazminati < h.kidemTazminati);
    t('toplamTazminat = net kıdem + brüt ihbar', Math.abs(h.toplamTazminat - (h.netKidemTazminati + h.ihbarTazminati)) < 0.001);
  }

  console.log('\n  -- damgaVergisiOraniBinde ayarlarda tanımsızsa 7.59 varsayılanı kullanılıyor --');
  {
    const ikiYilOnce = new Date();
    ikiYilOnce.setFullYear(ikiYilOnce.getFullYear() - 2);
    const personel = { iseGirisTarihi: ikiYilOnce.toISOString().slice(0, 10), brutMaas: 25000 };
    const ayarlarEksik = { kidemTazminatiTavani: 53919.68 }; // damgaVergisiOraniBinde YOK
    const h = kidemIhbarHesapla(personel, null, ayarlarEksik);
    const beklenenDamga = h.kidemTazminati * (7.59 / 1000);
    t('damgaVergisiOraniBinde tanımsızken 7.59 varsayılanı kullanılıyor', Math.abs(h.kidemDamgaVergisi - beklenenDamga) < 0.01);
  }

  console.log('\n  -- Tavan üstü maaş: kıdem tazminatı tavanla sınırlanıyor, damga vergisi de tavanlı tutar üzerinden --');
  {
    const ucYilOnce = new Date();
    ucYilOnce.setFullYear(ucYilOnce.getFullYear() - 3);
    const personel = { iseGirisTarihi: ucYilOnce.toISOString().slice(0, 10), brutMaas: 200000 }; // tavanın çok üstünde
    const ayarlar = { kidemTazminatiTavani: 53919.68, damgaVergisiOraniBinde: 7.59 };
    const h = kidemIhbarHesapla(personel, null, ayarlar);
    const beklenenBrut = (ayarlar.kidemTazminatiTavani / 30) * 30 * h.yilSayisi;
    t('kidemTazminati tavanla sınırlı (aylık brüt maaş DEĞİL, tavan kullanılıyor)', Math.abs(h.kidemTazminati - beklenenBrut) < 1);
    const beklenenDamga = h.kidemTazminati * (7.59 / 1000);
    t('damga vergisi tavanlı (sınırlanmış) tutar üzerinden hesaplanıyor', Math.abs(h.kidemDamgaVergisi - beklenenDamga) < 0.01);
  }

  console.log('\n  -- İhbar tazminatı hesaba dahil, kıdem yılına göre hafta sayısı doğru --');
  {
    const dortYilOnce = new Date();
    dortYilOnce.setFullYear(dortYilOnce.getFullYear() - 4);
    const personel = { iseGirisTarihi: dortYilOnce.toISOString().slice(0, 10), brutMaas: 40000 };
    const ayarlar = { kidemTazminatiTavani: 53919.68, damgaVergisiOraniBinde: 7.59 };
    const h = kidemIhbarHesapla(personel, null, ayarlar);
    t('4 yıl kıdem -> 8 hafta ihbar (3 yıl üstü)', h.ihbarHaftasi === 8);
    const beklenenIhbar = (40000 / 4.33) * 8;
    t('ihbarTazminati = haftalık brüt × hafta sayısı (brüt, vergisiz)', Math.abs(h.ihbarTazminati - beklenenIhbar) < 1);
  }

  console.log('\n  -- Belirli bir ayrılma tarihi verildiğinde bugün yerine o tarih kullanılıyor --');
  {
    const personel = { iseGirisTarihi: '2020-01-10', brutMaas: 35000 };
    const ayarlar = { kidemTazminatiTavani: 53919.68, damgaVergisiOraniBinde: 7.59 };
    const h = kidemIhbarHesapla(personel, '2024-01-10', ayarlar);
    t('yilSayisi ~4 (2020-01-10 -> 2024-01-10)', Math.abs(h.yilSayisi - 4) < 0.02);
  }
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
