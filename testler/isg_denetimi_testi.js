// ── İSG (İş Sağlığı ve Güvenliği) EKRANI DENETİMİ (T51) ────────────────────
// Bağımsız bir denetim ajanı page_isg.js'i T1-T4 tarzında inceledi; 6 gerçek
// bulgu bulundu ve düzeltildi:
//  1) bugun()/gunEkle() UTC'ye çevirip geri okuyordu — Türkiye (UTC+3) gibi
//     ileri dilimlerde yerel saatle 00:00-03:00 arası HER GÜN "bugün" yanlışlıkla
//     BİR GÜN ÖNCEYE düşüyordu; her KKD/eğitim/sağlık yenileme tarihi de aynı
//     nedenle bir gün erken hesaplanıyordu.
//  2) Personel seçim kutuları yalnızca AKTİF personeli listeliyordu — işten
//     ayrılan bir personelin mevcut KKD/eğitim/sağlık/kaza kaydı DÜZENLENEMEZ
//     hale geliyor, kullanıcı zorunlu alanı doldurmak için başka bir aktif
//     personel seçerse kayıt SESSİZCE BAŞKA KİŞİYE mal ediliyordu.
//  3) Uyum uyarıları (KKD yenileme/eğitim süresi/sağlık muayenesi) personelin
//     hâlâ çalışıp çalışmadığına bakmıyordu — ayrılmış personelin kaydı
//     sonsuza dek "aksiyon gerekli" sayılırdı.
//  4) "Kazasız Gün" KPI'ı yalnızca ramak kala bildirimi olan (gerçek kaza
//     SIFIR) durumlarda yanlışlıkla KIRMIZI "0" gösteriyordu.
//  5) Kaza kaydı, kök neden analizi hiç girilmeden "Kapandı" durumuna
//     alınabiliyordu — bu, AI Denetçi'nin "kök neden yapılmamış" uyarısını
//     kalıcı olarak susturuyordu.
//  6) Kaza tarihi için gelecek tarih engeli yoktu — "Kazasız Gün" negatif
//     bir sayıya dönüşebiliyordu. Ayrıca kayıp gün toplamı ramak kala
//     kayıtlarını da (yanlışlıkla) dahil ediyordu.
// page_isg.js DOM'a derinden bağlı olduğundan (diğer page_*.js testleriyle
// aynı desende) saf yardımcı fonksiyonlar (bugun, gunEkle, personelSecenekleri,
// personelAktifMi) izole edilip gerçek verilerle doğrulanır; DOM'a bağlı
// akışlar (kazaFormu doğrulamaları, panoTab/tab filtreleri) kaynak kod
// üzerinde regex ile kilitlenir.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_isg.js'), 'utf8');

let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

function fonksiyonCikar(ad) {
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
function sabitCikar(ad) {
  const baslangic = src.indexOf('const ' + ad + ' =');
  if (baslangic === -1) throw new Error(ad + ' bulunamadı');
  let i = baslangic, derinlik = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') derinlik++;
    else if (c === '}') derinlik--;
    else if (c === ';' && derinlik === 0) { i++; break; }
  }
  return src.slice(baslangic, i);
}

const kaynak = sabitCikar('tarihStr') + '\n' + sabitCikar('bugun') + '\n' + sabitCikar('gunFark') + '\n' +
  sabitCikar('gunEkle') + '\n' + fonksiyonCikar('personelSecenekleri') + '\n' + sabitCikar('personelAktifMi');
// App.escapeHtml gerektiği için basit bir sahte App tanımlanır
global.App = { escapeHtml: (s) => String(s == null ? '' : s) };
const izole = new Function(kaynak + '\nreturn { bugun, gunFark, gunEkle, personelSecenekleri, personelAktifMi, tarihStr };');
const { bugun, gunFark, gunEkle, personelSecenekleri, personelAktifMi, tarihStr } = izole();

console.log('\n-- BULGU 1: bugun()/gunEkle() artık UTC dönüşümü YAPMIYOR (yerel tarih) --');
{
  // tarihStr'nin ürettiği tarih, new Date()'in YEREL yıl/ay/gün bileşenleriyle
  // birebir aynı olmalı — hangi saat diliminde çalıştırılırsa çalıştırılsun.
  const simdi = new Date();
  const beklenen = simdi.getFullYear() + '-' + String(simdi.getMonth() + 1).padStart(2, '0') + '-' + String(simdi.getDate()).padStart(2, '0');
  t('bugun() yerel tarih bileşenlerinden üretiliyor (UTC\'ye hiç çevrilmiyor)', bugun() === beklenen);

  // gunEkle 0 gün eklerse GİRDİYLE AYNI tarihi dönmeli — eski (hatalı) UTC
  // dönüşümlü halinde ileri saat dilimlerinde bu bile 1 gün geriye kayardı.
  t('gunEkle(t, 0) girdiyle birebir aynı tarihi döner (round-trip kaybı yok)', gunEkle('2026-09-08', 0) === '2026-09-08');
  t('gunEkle 360 gün doğru ekliyor (2026-09-08 + 360 = 2027-09-03)', gunEkle('2026-09-08', 360) === '2027-09-03');
  t('gunEkle yıl sınırını doğru aşıyor (2026-12-25 + 10 = 2027-01-04)', gunEkle('2026-12-25', 10) === '2027-01-04');
}

console.log('\n-- BULGU 2: personelSecenekleri artık ayrılmış personeli de (etiketli) listeliyor --');
{
  const personeller = [
    { id: 'P1', adSoyad: 'Ahmet Yılmaz', durum: 'aktif' },
    { id: 'P2', adSoyad: 'Ayşe Demir', durum: 'aktif' },
    { id: 'P3', adSoyad: 'Mehmet Kaya', durum: 'ayrildi' }
  ];
  const htmlAktifSecili = personelSecenekleri(personeller, 'P1', '— Seçiniz —');
  t('aktif personel normal şekilde listede', /value="P1"/.test(htmlAktifSecili) && /value="P2"/.test(htmlAktifSecili));
  t('ayrılmış personel, seçili OLMADIĞINDA listede YOK (gereksiz kalabalık yapmaz)', !/value="P3"/.test(htmlAktifSecili));

  const htmlAyrilmisSecili = personelSecenekleri(personeller, 'P3', '— Seçiniz —');
  t('kaydın sahibi ayrılmış olsa bile seçili personel listede GÖRÜNÜR (eski bug: düzenleme imkansızdı)', /value="P3"[^>]*selected/.test(htmlAyrilmisSecili));
  t('ayrılmış personel "(ayrılmış)" etiketiyle ayırt ediliyor', /Mehmet Kaya \(ayrılmış\)/.test(htmlAyrilmisSecili));
  t('diğer aktif personel de hâlâ listede (P3 eklenmesi P1/P2\'yi silmiyor)', /value="P1"/.test(htmlAyrilmisSecili) && /value="P2"/.test(htmlAyrilmisSecili));
}

console.log('\n-- BULGU 3: personelAktifMi ile uyum kontrolleri artık AYRILMIŞ personeli hariç tutuyor --');
{
  const personeller = [{ id: 'P1', durum: 'aktif' }, { id: 'P2', durum: 'ayrildi' }];
  t('aktif personel -> true (uyum uyarısı geçerli sayılır)', personelAktifMi(personeller, 'P1') === true);
  t('ayrılmış personel -> false (uyum uyarısından hariç tutulur)', personelAktifMi(personeller, 'P2') === false);
  t('eşleşmeyen/serbest personelId -> true (güvenli varsayılan: uyarı gizlenmez)', personelAktifMi(personeller, 'YOK') === true);
}

console.log('\n-- Kaynak kilit: uyum filtreleri artık personelAktifMi kontrolü içeriyor --');
t('panoTab: kkdYenileme personelAktifMi kontrolü içeriyor', /kkdYenileme = d\.kkd\.filter\(k => k\.yenilemeTarihi && k\.yenilemeTarihi <= bugun\(\) && personelAktifMi\(d\.personeller, k\.personelId\)\)/.test(src));
t('panoTab: egitimSuresiDolan personelAktifMi kontrolü içeriyor', /egitimSuresiDolan = d\.egitimler\.filter\(e => e\.gecerlilikTarihi && e\.gecerlilikTarihi <= bugun\(\) && personelAktifMi\(d\.personeller, e\.personelId\)\)/.test(src));
t('panoTab: muayeneSuresiDolan personelAktifMi kontrolü içeriyor', /muayeneSuresiDolan = d\.saglik\.filter\(s => s\.sonrakiMuayene && s\.sonrakiMuayene <= bugun\(\) && personelAktifMi\(d\.personeller, s\.personelId\)\)/.test(src));
t('kkdTab: yenilemeGeldi personelAktifMi kontrolü içeriyor', /yenilemeGeldi = d\.kkd\.filter\(k => k\.yenilemeTarihi && k\.yenilemeTarihi <= bugun\(\) && personelAktifMi/.test(src));
t('egitimTab: suresiDolan personelAktifMi kontrolü içeriyor', /suresiDolan = d\.egitimler\.filter\(e => e\.gecerlilikTarihi && e\.gecerlilikTarihi <= bugun\(\) && personelAktifMi/.test(src));
t('saglikTab: gecikmis personelAktifMi kontrolü içeriyor', /gecikmis = d\.saglik\.filter\(s => s\.sonrakiMuayene && s\.sonrakiMuayene <= bugun\(\) && personelAktifMi/.test(src));

console.log('\n-- BULGU 4: "Kazasız Gün" hesabı artık yalnızca GERÇEK kazaları esas alıyor --');
{
  // panoTab'daki GERÇEK mantık izole edilip test edilir.
  function kazasizGunHesapla(kazalar) {
    const tumGercekKazalar = kazalar.filter(k => k.tip !== 'ramak_kala' && k.tarih);
    return tumGercekKazalar.length
      ? gunFark(bugun(), [...tumGercekKazalar].map(k => k.tarih).sort().pop())
      : null;
  }
  t('kaynak: panoTab artık tumGercekKazalar üzerinden hesaplıyor (d.kazalar.length DEĞİL)',
    /const tumGercekKazalar = d\.kazalar\.filter\(k => k\.tip !== 'ramak_kala' && k\.tarih\);/.test(src) &&
    /const kazasizGun = tumGercekKazalar\.length/.test(src));
  t('yalnızca ramak kala varsa (gerçek kaza SIFIR) sonuç null (eski bug: kırmızı "0" olurdu)',
    kazasizGunHesapla([{ tip: 'ramak_kala', tarih: bugun() }]) === null);
  t('hiç kayıt yoksa da null', kazasizGunHesapla([]) === null);
  t('gerçek bir kaza varsa gün farkı doğru hesaplanır', kazasizGunHesapla([{ tip: 'agir', tarih: gunEkle(bugun(), -10) }]) === 10);
  t('birden fazla kayıtta EN SON gerçek kaza esas alınır (ramak kala YOK sayılır)',
    kazasizGunHesapla([
      { tip: 'agir', tarih: gunEkle(bugun(), -30) },
      { tip: 'ramak_kala', tarih: bugun() },          // en yeni ama ramak kala -> yok sayılmalı
      { tip: 'ilk_yardim', tarih: gunEkle(bugun(), -5) }
    ]) === 5);
}

console.log('\n-- BULGU 5: kök neden analizi olmadan kaza kaydı KAPATILAMIYOR --');
t('kaydet handler\'ında tip!==ramak_kala && durum===kapandi && !kokNeden kontrolü var',
  /if \(tip !== 'ramak_kala' && durum === 'kapandi' && !kokNeden\) \{/.test(src));
t('bu durumda anlamlı bir hata mesajıyla KAYIT ENGELLENIYOR (return var)',
  /Kök neden analizi yapılmadan kaza kaydı KAPATILAMAZ[\s\S]{0,20}return;/.test(src));

console.log('\n-- BULGU 6: gelecek tarihli kaza engelleniyor, kayıp gün ramak kala\'yı dışlıyor --');
t('kaydet handler\'ında tarih > bugun() kontrolü var (gelecek tarih reddedilir)',
  /if \(tarih > bugun\(\)\) \{ App\.toast\('Kaza\/ramak kala tarihi gelecekte olamaz'/.test(src));
t('HTML max="${bugun()}" ile tarayıcı seviyesinde de gelecek tarih engelleniyor', /id="kz-tarih" type="date" value="\$\{k\.tarih \|\| bugun\(\)\}" max="\$\{bugun\(\)\}"/.test(src));
t('panoTab kayıp gün toplamı artık gercekKazalar üzerinden (ramak kala HARİÇ)',
  /const kayipGun = gercekKazalar\.reduce\(\(a, k\) => a \+ \(k\.kayipGun \|\| 0\), 0\);/.test(src));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
