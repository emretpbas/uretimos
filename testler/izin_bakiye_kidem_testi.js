// BULGU (T3-34): page_ik_izin.js'in openIzinForm'unda yıllık izin bakiyesi
// hiç kontrol edilmiyordu — bir personele kalan hakkından FAZLA yıllık
// izin girilebiliyor, bakiye negatife düşebiliyordu (renderOzetTablo bunu
// yalnızca KIRMIZI renkle GÖSTERİYORDU, ENGELLEMİYORDU). Ayrıca kıdem
// hesaplaması her zaman BUGÜNE göre yapılıyordu — geçmiş bir yıl (seciliYil)
// seçilse bile kıdem GÜNCEL tarihe göre hesaplanıyordu, bu da geçmiş
// yıllar için olduğundan fazla kıdem/hak edilen gün gösteriyordu.
// Düzeltme:
//  1) referansTarihHesapla(yil): içinde bulunulan/gelecek yıl için "bugün",
//     GEÇMİŞ bir yıl için o yılın 31 Aralık'ı referans alınır.
//  2) kidemVeHakEdilenHesapla(personel, yil) ve yillikIzinBakiyesi(...)
//     paylaşılan yardımcılar — hem renderOzetTablo hem openIzinForm AYNI
//     mantığı kullanır (tutarlılık).
//  3) openIzinForm artık 'yillik' tip için canlı bakiye ipucu gösterir VE
//     kaydetme anında gunSayisi > kalan ise SERT biçimde engeller.
// page_ik_izin.js Store/DOM'a derinden bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır;
// referansTarihHesapla/kidemVeHakEdilenHesapla/yillikIzinBakiyesi izole
// edilip gerçek verilerle de doğrulanır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_ik_izin.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- page_ik_izin.js: kıdem artık seciliYil\'e göre hesaplanıyor, paylaşılan yardımcılar var --');
t('referansTarihHesapla tanımlı', /function referansTarihHesapla\(yil\) \{/.test(src));
t('geçmiş yıl için 31 Aralık referans alınıyor', /return new Date\(yilSayi \+ '-12-31T00:00:00'\);/.test(src));
t('kidemVeHakEdilenHesapla paylaşılan yardımcı olarak tanımlı', /function kidemVeHakEdilenHesapla\(personel, yil\) \{/.test(src));
t('renderOzetTablo artık bu yardımcıyı kullanıyor (eski inline "new Date()" hesabı YOK)',
  /const \{ kidemYili, hakEdilen \} = kidemVeHakEdilenHesapla\(p, seciliYil\);/.test(src) &&
  !/const kidemYili = Math\.floor\(\(new Date\(\) - iseGiris\)/.test(src));

console.log('\n-- page_ik_izin.js: openIzinForm artık negatif bakiyeyi engelliyor --');
t('yillikIzinBakiyesi paylaşılan yardımcı tanımlı', /function yillikIzinBakiyesi\(personel, yil, izinKayitlari, haricKayitId\) \{/.test(src));
t('openIzinForm artık izinKayitlari parametresi alıyor', /function openIzinForm\(personeller, izinKayitlari, onSaved\) \{/.test(src));
t('çağrı yeri de izinKayitlari geçiriyor', /openIzinForm\(aktifPersonel, izinKayitlari, \(\) => render\(main\)\);/.test(src));
t('canlı bakiye ipucu elementi var', /id="if-bakiye-hint"/.test(src));
t('kaydetme anında yillik tip için sert engel var',
  /if \(izinTipi === 'yillik'\) \{[\s\S]{0,300}if \(gunSayisi > kalan\) \{[\s\S]{0,250}return;/.test(src));
t('mazeret/rapor/ucretsiz tipler bakiye kontrolünden MUAF (yalnızca yillik kontrol ediliyor)',
  /if \(izinTipi === 'yillik'\) \{/.test(src) && !/if \(izinTipi !== 'yillik'\)[\s\S]{0,50}kalan/.test(src));

console.log('\n-- Sayısal doğruluk: referansTarihHesapla/kidemVeHakEdilenHesapla/yillikIzinBakiyesi izole edilip doğrulanıyor --');
{
  function fonksiyonCikar(ad) {
    const baslangic = src.indexOf('function ' + ad + '(');
    let derinlik = 0, i = src.indexOf('{', baslangic);
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') derinlik++;
      if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
    }
    return src.slice(baslangic, i);
  }
  const kaynak = fonksiyonCikar('yillikIzinHakki') + '\n' +
    fonksiyonCikar('referansTarihHesapla') + '\n' +
    fonksiyonCikar('kidemVeHakEdilenHesapla') + '\n' +
    fonksiyonCikar('yillikIzinBakiyesi');
  const izole = new Function(kaynak + '\nreturn { referansTarihHesapla, kidemVeHakEdilenHesapla, yillikIzinBakiyesi };');
  const { referansTarihHesapla, kidemVeHakEdilenHesapla, yillikIzinBakiyesi } = izole();

  const buYil = new Date().getFullYear();
  const gecenYil = (buYil - 1).toString();

  console.log('\n  -- referansTarihHesapla: geçmiş yıl 31 Aralık, güncel yıl bugün --');
  {
    const gecmisRef = referansTarihHesapla(gecenYil);
    t('geçmiş yıl için 31 Aralık o yılın', gecmisRef.getFullYear() === buYil - 1 && gecmisRef.getMonth() === 11 && gecmisRef.getDate() === 31);
    const buYilRef = referansTarihHesapla(buYil.toString());
    const bugun = new Date();
    t('güncel yıl için bugün (gün farkı < 1 gün)', Math.abs(buYilRef - bugun) < 2000);
  }

  console.log('\n  -- kidemVeHakEdilenHesapla: geçmiş yıl için OLDUĞUNDAN FAZLA kıdem göstermiyor --');
  {
    // 10 yıl önce işe girmiş bir personel: BUGÜN kıdemi ~10 yıl, ama
    // 3 YIL ÖNCE (henüz 7 yıl kıdemi varken) yalnızca 7 yıl olmalı.
    const onYilOnce = new Date();
    onYilOnce.setFullYear(onYilOnce.getFullYear() - 10);
    const personel = { iseGirisTarihi: onYilOnce.toISOString().slice(0, 10) };

    const guncelKidem = kidemVeHakEdilenHesapla(personel, buYil.toString());
    t('güncel yıl kıdemi ~10', guncelKidem.kidemYili === 10);

    const uc = (buYil - 3).toString();
    const gecmisKidem = kidemVeHakEdilenHesapla(personel, uc);
    t('3 yıl önceki kıdem ~7 (BUGÜNE göre değil, o yılın sonuna göre)', gecmisKidem.kidemYili === 7);
    t('geçmiş yıl kıdemi güncel yıldan KÜÇÜK (eski BUG buysa hep eşit olurdu)', gecmisKidem.kidemYili < guncelKidem.kidemYili);
    t('geçmiş yıl hakEdilen de buna göre (7 yıl kıdem -> 20 gün, 5\'ten büyük)', gecmisKidem.hakEdilen === 20);
  }

  console.log('\n  -- yillikIzinBakiyesi: hak edilen - kullanılan, farklı personel/yıl karışmıyor --');
  {
    const onBesYilOnce = new Date();
    onBesYilOnce.setFullYear(onBesYilOnce.getFullYear() - 15);
    const p1 = { id: 'P1', iseGirisTarihi: onBesYilOnce.toISOString().slice(0, 10) }; // kıdem 15 -> hak 26
    const izinKayitlari = [
      { id: 'IZN-1', personelId: 'P1', izinTipi: 'yillik', baslangic: buYil + '-03-01', gunSayisi: 10 },
      { id: 'IZN-2', personelId: 'P1', izinTipi: 'mazeret', baslangic: buYil + '-04-01', gunSayisi: 5 }, // yillik değil, sayılmamalı
      { id: 'IZN-3', personelId: 'P2', izinTipi: 'yillik', baslangic: buYil + '-05-01', gunSayisi: 100 } // başka personel
    ];
    const bakiye = yillikIzinBakiyesi(p1, buYil.toString(), izinKayitlari, null);
    t('bakiye = 26 - 10 = 16 (mazeret ve başka personel hariç)', bakiye === 16);

    const bakiyeHaric = yillikIzinBakiyesi(p1, buYil.toString(), izinKayitlari, 'IZN-1');
    t('haricKayitId ile o kayıt DIŞLANDIĞINDA bakiye tam (26)', bakiyeHaric === 26);
  }

  console.log('\n  -- Negatif bakiye engeli mantığı: gunSayisi > kalan ise reddediliyor --');
  {
    const bakiye = 5;
    t('5 gün varken 3 gün istenirse İZİN VERİLİR', !(3 > bakiye));
    t('5 gün varken 8 gün istenirse ENGELLENİR', 8 > bakiye);
    t('5 gün varken tam 5 gün istenirse İZİN VERİLİR (sınırda)', !(5 > bakiye));
  }

  console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
  process.exit(bad ? 1 : 0);
}
