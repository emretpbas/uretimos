// ── SATIŞ SONRASI SERVİS & GARANTİ EKRANI DENETİMİ (T55) ─────────────────
// Bağımsız bir denetim ajanı page_servis.js'i T1-T4 tarzında inceledi; 11
// gerçek bulgu bulundu, 9'u düzeltildi (2'si — yedek parça stoktan
// düşülmemesi ve garanti dışı ücretin muhasebeye yansımaması — gerçek
// stok/muhasebe akışına dokunan ayrı değişiklikler gerektirdiğinden kod
// içi yorumlarla belgelenip bu turun kapsamı dışında bırakıldı):
//  1) bugun()/ayEkle() new Date().toISOString() ile UTC'ye çevirip geri
//     okuyordu — Türkiye (UTC+3) gibi ileri dilimlerde HER garanti bitiş
//     hesabı 1 gün erken çıkıyordu; gece 00:00-03:00'da "bugün" bir gün
//     geriye kayıyordu.
//  2) garantiDurumu, siparişin ürün bağımsız EN ERKEN irsaliyesini
//     kullanıyordu — kısmi/parçalı sevkiyatta şikayet konusu ürünün GERÇEK
//     teslim tarihi yerine başka bir kalemin (çok daha erken/geç) tarihi
//     kullanılıp garanti kapsamı yanlış hesaplanabiliyordu.
//  3) Doğrudan "+ Servis Talebi" akışında müşteri seçimi için hiçbir alan
//     yoktu — kayıt musteriId:null ile kalıcı olarak açılıp geriye dönük
//     izlenemez hale geliyordu.
//  4) "Şikayet çözüldü olarak işaretlendi" toast'u, işaretlenecek bağlı
//     bir şikayet olmasa bile (durum tamamlandi ise) gösteriliyordu.
//  5) Garanti dışı bulunup 'reddedildi' yapılmış (kapatılmış) bir şikayete
//     bağlı servis kaydı sadece teknisyen/adres güncellemek için tekrar
//     kaydedilse bile şikayet sessizce 'servis_planlandi'ya (yeniden açık)
//     döndürülüyordu.
//  6) Şikayet/Servis "Kaydet" butonlarında çift tıklama koruması yoktu.
//  7) Servis talepleri için "İptal" durumu yoktu — yanlışlıkla açılan bir
//     kayıt sonsuza dek "açık" sayılmaya devam ediyordu.
//  8) app.js'teki kaliteUygunsuzlukOlustur/dofOlustur (page_servis.js'in
//     NCR açma checkbox'ının tetiklediği) "olusturan" alanına rolün
//     Türkçe etiketini yazıyordu — aynı role sahip FARKLI çalışanlar aynı
//     kişi sayılıyordu (crm_motor.js'te T52'de düzeltilen aynı sınıf hata).
//  9) Şikayet/servis kayıtlarında kimin oluşturduğuna dair hiçbir iz
//     tutulmuyordu.
//
// page_servis.js dual-mode değil (PageModules.servis) ama garantiDurumu
// dışa aktarılmış durumda; saf tarih yardımcıları (tarihStr/bugun/ayEkle)
// izole edilip gerçek verilerle doğrulanır. DOM'a bağlı akışlar (form
// validasyonları, toast/durum düzeltmeleri) kaynak kod üzerinde regex ile
// kilitlenir (diğer page_*.js testleriyle aynı desen).
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_servis.js'), 'utf8');

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
  sabitCikar('ayEkle') + '\n' + fonksiyonCikar('garantiDurumu');
const izole = new Function(kaynak + '\nreturn { bugun, gunFark, ayEkle, tarihStr, garantiDurumu };');
const { bugun, ayEkle, tarihStr, garantiDurumu } = izole();

console.log('\n-- BULGU 1: bugun()/ayEkle() artık UTC dönüşümü YAPMIYOR (yerel tarih) --');
{
  const simdi = new Date();
  const beklenen = simdi.getFullYear() + '-' + String(simdi.getMonth() + 1).padStart(2, '0') + '-' + String(simdi.getDate()).padStart(2, '0');
  t('bugun() yerel tarih bileşenlerinden üretiliyor (UTC\'ye hiç çevrilmiyor)', bugun() === beklenen);
  t('ayEkle 24 ay doğru ekliyor, round-trip kaybı yok (2024-01-15 + 24 = 2026-01-15)', ayEkle('2024-01-15', 24) === '2026-01-15');
  t('ayEkle yıl sınırını doğru aşıyor (2024-12-25 + 2 = 2025-02-25)', ayEkle('2024-12-25', 2) === '2025-02-25');
}

console.log('\n-- BULGU 2: garantiDurumu artık urunKod verilince o ürünü GERÇEKTEN içeren irsaliyeyi kullanıyor --');
{
  const irsaliyeler = [
    { siparisId: 'SIP1', tarih: '2024-01-01', kalemler: [{ kod: 'MASA-1' }] },
    { siparisId: 'SIP1', tarih: '2024-06-01', kalemler: [{ kod: 'SANDALYE-1' }] }
  ];
  const gEski = garantiDurumu('SIP1', irsaliyeler, 24);
  t('urunKod verilmezse (geriye dönük uyum) sipariş bazında EN ERKEN irsaliye kullanılıyor', gEski.teslimTarihi === '2024-01-01');

  const gDogru = garantiDurumu('SIP1', irsaliyeler, 24, 'SANDALYE-1');
  t('urunKod verilince o ürünü GERÇEKTEN içeren irsaliye kullanılıyor (2024-06-01, masa DEĞİL)', gDogru.teslimTarihi === '2024-06-01');
  t('bu ürünün garanti bitişi buna göre doğru hesaplanıyor (2026-06-01)', gDogru.bitisTarihi === '2026-06-01');

  const gEslesmeyen = garantiDurumu('SIP1', irsaliyeler, 24, 'OLMAYAN-KOD');
  t('eşleşen irsaliye yoksa sessizce sipariş bazında en erkene düşülüyor (çökmeden)', gEslesmeyen.teslimTarihi === '2024-01-01');

  t('irsaliye kaydı hiç yoksa anlamlı "bilinmiyor" dönüyor', garantiDurumu('YOK', [], 24).biliniyor === false);
}

console.log('\n-- BULGU 3: page_servis.js artık doğrudan servis talebinde müşteri seçimini zorunlu kılıyor --');
{
  t('sk yokken müşteri seçici (sv-musteri + datalist) render ediliyor', /id="sv-musteri" list="sv-mlist"/.test(src));
  t('kaydetmeden önce sk yokken gerçek bir cari kart eşleşmesi zorunlu', /if \(!adi \|\| !m\) \{[\s\S]{0,200}Müşteri seçilmeli/.test(src));
}

console.log('\n-- BULGU 4: yanlış "şikayet çözüldü" toast\'u artık yalnızca GERÇEKTEN bir şikayet güncellendiyse gösteriliyor --');
{
  t('sikayetGuncellendi bayrağı eklendi', /let sikayetGuncellendi = false;/.test(src));
  t('toast koşulu artık sikayetGuncellendi\'yi de kontrol ediyor', /durum === 'tamamlandi' && sikayetGuncellendi/.test(src));
}

console.log('\n-- BULGU 5: reddedilmiş (kapatılmış) şikayet artık servis kaydı düzenlenince sessizce yeniden açılmıyor --');
{
  t('koşul artık reddedildi durumunu da hariç tutuyor', /k\.durum !== 'cozuldu' && k\.durum !== 'reddedildi'/.test(src));
}

console.log('\n-- BULGU 6: Şikayet/Servis Kaydet butonlarında artık çift tıklama koruması var --');
{
  t('sk-ok artık ev.currentTarget ile buton referansı alıp disabled yapıyor', /sk-ok'\)\.onclick = async \(ev\) => \{[\s\S]{0,150}btn\.disabled = true;/.test(src));
  t('sv-ok artık ev.currentTarget ile buton referansı alıp disabled yapıyor', /sv-ok'\)\.onclick = async \(ev\) => \{[\s\S]{0,150}btn\.disabled = true;/.test(src));
}

console.log('\n-- BULGU 7: Servis talepleri için artık "İptal" durumu var --');
{
  t('durum seçeneklerine iptal eklendi', /<option value="iptal" \$\{s\.durum === 'iptal' \? 'selected' : ''\}>İptal<\/option>/.test(src));
  t('"açık servis" filtresi artık iptal\'i hariç tutuyor', /s\.durum !== 'tamamlandi' && s\.durum !== 'iptal'/.test(src));
  t('maliyet toplamları artık iptal edilmiş kayıtları hariç tutuyor (en az 2 yerde)',
    (src.match(/s\.durum !== 'iptal'/g) || []).length >= 2);
}

console.log('\n-- BULGU 8: app.js NCR/DÖF açılışı artık App.aktifKullaniciAdi() önceliyor --');
{
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  t('aktifKullaniciEtiketi() yardımcı fonksiyonu eklendi', /function aktifKullaniciEtiketi\(\) \{/.test(appSrc));
  t('kaliteUygunsuzlukOlustur artık aktifKullaniciEtiketi() kullanıyor', /olusturan: aktifKullaniciEtiketi\(\), dofId: null/.test(appSrc));
  t('dofOlustur artık aktifKullaniciEtiketi() kullanıyor', /olusturmaTarihi: bugun, olusturan: aktifKullaniciEtiketi\(\)\s*\n\s*\};/.test(appSrc));
  t('currentRoleLabel() artık NCR/DÖF olusturan alanında DOĞRUDAN kullanılmıyor (yalnızca fallback içinde)',
    !/olusturan: currentRoleLabel\(\)/.test(appSrc));
}

console.log('\n-- BULGU 9: şikayet/servis kayıtlarına artık "olusturan" izi ekleniyor --');
{
  t('sikayetFormu kaydında olusturan alanı var', /olusturan: s\.olusturan \|\| \(App\.aktifKullaniciAdi \? App\.aktifKullaniciAdi\(\) : App\.aktifRol\(\)\)/.test(src));
  t('servisFormu kaydında da olusturan alanı var',
    (src.match(/olusturan: s\.olusturan \|\| \(App\.aktifKullaniciAdi \? App\.aktifKullaniciAdi\(\) : App\.aktifRol\(\)\)/g) || []).length === 2);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
