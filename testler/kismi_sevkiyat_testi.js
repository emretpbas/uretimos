// BULGU (T3-23): page_sevkiyat_panel.js irsaliye ekranı zaten kalem
// çıkarmaya/miktar azaltmaya izin veriyordu (kısmi sevkiyat FİİLEN
// mümkündü) ama bir kez irsaliye kesilince:
//  1) siparis.durum KOŞULSUZ 'sevk_edildi' oluyordu,
//  2) sevkEdilebilir filtresi "irsaliyeler.some(...)" ile siparişi
//     TAMAMEN listeden çıkarıyordu,
//  3) fatura HER ZAMAN siparis.kalemler (TAM sipariş) üzerinden
//     kesiliyordu — kısmi sevkiyat sonrası ikinci bir irsaliye kesilirse
//     fatura yine TAM tutar üzerinden çıkardı (çift/aşırı faturalama riski).
// Düzeltme: App.siparisKismiSevkGuncelle ile per-kalem sevkEdilenMiktar
// takibi eklendi; durum yalnızca TÜM ürün kalemleri sevk edildiyse
// 'sevk_edildi', aksi halde 'kismi_sevk_edildi' olur; sevkEdilebilir artık
// duruma bakar (irsaliye varlığına değil); fatura artık GERÇEKTEN sevk
// edilen kalemlerden (irsaliye.kalemler) hesaplanır; sipariş onayında
// tahsil edilmiş avans (odemePlaniNetKasaToplami) yalnızca İLK faturada
// mahsup edilir (çifte mahsup önlenir).
// app.js/page_*.js Store/DOM'a derinden bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır;
// paylaşılan hesaplama fonksiyonu (siparisKismiSevkGuncelle) izole edilip
// gerçek sayısal davranışla da doğrulanır.
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const sevkSrc = fs.readFileSync(path.join(__dirname, '..', 'page_sevkiyat_panel.js'), 'utf8');
const cariSrc = fs.readFileSync(path.join(__dirname, '..', 'page_cari_panel.js'), 'utf8');
const siparisSrc = fs.readFileSync(path.join(__dirname, '..', 'page_siparis.js'), 'utf8');
const iptalSrc = fs.readFileSync(path.join(__dirname, '..', 'page_iptal_islemleri.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- app.js: siparisKismiSevkGuncelle paylaşılan fonksiyonu tanımlı ve dışa aktarılmış --');
t('fonksiyon tanımlı', /function siparisKismiSevkGuncelle\(siparis, irsaliyeKalemleri\) \{/.test(appSrc));
t('yalnızca urun kalemleri sipariş ilerlemesini etkiliyor',
  /if \(ik\.kaynak !== 'urun'\) return;/.test(appSrc));
t('tüm ürün kalemleri tam sevk edildiyse sevk_edildi, aksi halde kismi_sevk_edildi',
  /siparis\.durum = tamamiSevkEdildiMi \? 'sevk_edildi' : 'kismi_sevk_edildi';/.test(appSrc));
t('App\'ten dışa aktarılıyor', /sevkiyatYapilinceStoktanDus, siparisKismiSevkGuncelle,/.test(appSrc));

console.log('\n-- page_sevkiyat_panel.js: sevkEdilebilir artık duruma bakıyor, irsaliye varlığına değil --');
t('sevkEdilebilir filtresi kismi_sevk_edildi\'yi de içeriyor',
  /const sevkEdilebilir = siparisler\.filter\(s => \(s\.durum === 'onaylandi' \|\| s\.durum === 'kismi_sevk_edildi'\) && s\.uretimDurumu === 'tamamlandi'\);/.test(sevkSrc));
t('eski "irsaliyeler.some(...)" dışlaması ARTIK YOK', !/&& !irsaliyeler\.some\(i => i\.siparisId === s\.id\)\);/.test(sevkSrc));
t('irsaliye kesilince durum artık App.siparisKismiSevkGuncelle ile belirleniyor',
  /App\.siparisKismiSevkGuncelle\(siparis, irsaliye\.kalemler\);/.test(sevkSrc));
t('irsaliye formu KALAN miktarla başlıyor (tam miktarla değil)',
  /const kalan = k\.grup === 'urun' \? Math\.max\(0, \(k\.miktar \|\| 1\) - \(k\.sevkEdilenMiktar \|\| 0\)\) : \(k\.miktar \|\| 1\);/.test(sevkSrc));
t('tamamı zaten sevk edilmiş kalemler listeye hiç eklenmiyor (miktar>0 filtresi)',
  /\.filter\(k => k\.miktar > 0\);/.test(sevkSrc));

console.log('\n-- page_cari_panel.js: hızlı Fatura&İrsaliye formu da paylaşılan fonksiyonu kullanıyor --');
t('openFaturaIrsaliyeForm da App.siparisKismiSevkGuncelle çağırıyor',
  /App\.siparisKismiSevkGuncelle\(siparis, irsaliye\.kalemler\);/.test(cariSrc));
t('gecikmiş sipariş raporu kismi_sevk_edildi\'yi de kapsıyor',
  /s\.durum === 'onaylandi' \|\| s\.durum === 'sevk_edildi' \|\| s\.durum === 'kismi_sevk_edildi'/.test(cariSrc));

console.log('\n-- app.js: irsaliyeKesilinceFaturaOlustur artık GERÇEK sevk edilen kalemlerden hesaplıyor --');
t('faturaKaynakKalemleri irsaliye.kalemler\'i tercih ediyor',
  /const faturaKaynakKalemleri = \(irsaliye\.kalemler && irsaliye\.kalemler\.length\) \? irsaliye\.kalemler : siparis\.kalemler;/.test(appSrc));
t('KDV grupları artık faturaKaynakKalemleri\'nden hesaplanıyor',
  /kalemleriKdvGrupla\(faturaKaynakKalemleri, siparis\.genelIskontoYuzde\)/.test(appSrc));
t('fatura.kalemler de aynı kaynaktan türetiliyor',
  /const faturaKalemleri = \(faturaKaynakKalemleri \|\| \[\]\)\.map\(k => \(\{/.test(appSrc));

console.log('\n-- app.js: avans (onayindaKasayaGirenNet) yalnızca İLK faturada mahsup ediliyor (çifte mahsup önleniyor) --');
t('mevcut faturalar kontrol edilip ilk fatura mı belirleniyor',
  /const buIlkFaturaMi = !mevcutFaturalar\.some\(f => f\.siparisId === siparis\.id\);/.test(appSrc));
t('ilk fatura değilse avans 0 kabul ediliyor',
  /const onayindaKasayaGirenNet = buIlkFaturaMi\s*\n\s*\? \(siparis\.odemePlaniNetKasaToplami != null \? siparis\.odemePlaniNetKasaToplami : pesinatTutar\)\s*\n\s*: 0;/.test(appSrc));
t('pesinatMahsup gösterimi de yalnızca ilk faturada tam tutar',
  /pesinatMahsup: buIlkFaturaMi \? pesinatTutar : 0, odenecekBakiye, vadeTarihi,/.test(appSrc));

console.log('\n-- Kapatma/düzenleme guard\'ları kismi_sevk_edildi\'yi de sevk_edildi ile AYNI şekilde ele alıyor --');
t('page_siparis.js startEditSiparis girişte reddediyor',
  /if \(siparis\.durum === 'sevk_edildi' \|\| siparis\.durum === 'kismi_sevk_edildi'\) \{/.test(siparisSrc));
t('page_siparis.js kayıt anında taze kontrol de kapsıyor',
  /if \(mevcut\.durum === 'sevk_edildi' \|\| mevcut\.durum === 'kismi_sevk_edildi'\) \{/.test(siparisSrc));
t('page_siparis.js "Geri Çek" butonu kismi_sevk_edildi\'de render edilmiyor',
  /\$\{\(s\.durum !== 'sevk_edildi' && s\.durum !== 'kismi_sevk_edildi'\) \? '<button class="btn btn-amber" id="sp-geri-cek">/.test(siparisSrc));
t('page_siparis.js durum pill\'inde Kısmi Sevk Edildi etiketi var',
  /kismi_sevk_edildi: \['Kısmi Sevk Edildi', 'pill-amber'\],/.test(siparisSrc));
t('page_iptal_islemleri.js iptalEdilebilirDurum kismi_sevk_edildi\'yi de kapsıyor',
  /!\['iptal', 'tamamlandi', 'kapatildi', 'sevk_edildi', 'kismi_sevk_edildi', 'reddedildi'\]\.includes\(d\);/.test(iptalSrc));

console.log('\n-- Sayısal doğruluk: siparisKismiSevkGuncelle izole edilip gerçek davranışla doğrulanıyor --');
{
  function fonksiyonCikar(ad) {
    const baslangic = appSrc.indexOf('function ' + ad + '(');
    let derinlik = 0, i = appSrc.indexOf('{', baslangic), sonuc = '';
    for (; i < appSrc.length; i++) {
      const c = appSrc[i];
      if (c === '{') derinlik++;
      if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
    }
    return appSrc.slice(baslangic, i);
  }
  const src1 = fonksiyonCikar('siparisKismiSevkGuncelle');
  const izole = new Function(src1 + '\nreturn siparisKismiSevkGuncelle;');
  const siparisKismiSevkGuncelle = izole();

  const siparis = { kalemler: [
    { grup: 'urun', kod: 'U1', miktar: 10 },
    { grup: 'urun', kod: 'U2', miktar: 5 }
  ] };

  console.log('\n  -- İlk kısmi sevkiyat: U1\'den 4 adet --');
  let tam = siparisKismiSevkGuncelle(siparis, [{ kaynak: 'urun', kod: 'U1', miktar: 4 }]);
  t('tamamiSevkEdildiMi false dönüyor', tam === false);
  t('durum kismi_sevk_edildi oldu', siparis.durum === 'kismi_sevk_edildi');
  t('U1 sevkEdilenMiktar 4', siparis.kalemler[0].sevkEdilenMiktar === 4);
  t('U2 sevkEdilenMiktar hâlâ 0/undefined', !siparis.kalemler[1].sevkEdilenMiktar);

  console.log('\n  -- İkinci kısmi sevkiyat: U1\'den kalan 6, U2\'den 3 adet --');
  tam = siparisKismiSevkGuncelle(siparis, [{ kaynak: 'urun', kod: 'U1', miktar: 6 }, { kaynak: 'urun', kod: 'U2', miktar: 3 }]);
  t('hâlâ tamamlanmadı (U2 kalan var)', tam === false);
  t('durum hâlâ kismi_sevk_edildi', siparis.durum === 'kismi_sevk_edildi');
  t('U1 tam sevk edildi (10)', siparis.kalemler[0].sevkEdilenMiktar === 10);
  t('U2 sevkEdilenMiktar 3', siparis.kalemler[1].sevkEdilenMiktar === 3);

  console.log('\n  -- Üçüncü (son) kısmi sevkiyat: U2\'den kalan 2 adet --');
  tam = siparisKismiSevkGuncelle(siparis, [{ kaynak: 'urun', kod: 'U2', miktar: 2 }]);
  t('artık TAMAMEN sevk edildi', tam === true);
  t('durum sevk_edildi oldu', siparis.durum === 'sevk_edildi');

  console.log('\n  -- yarımamül/hammadde kalemleri (kaynak !== urun) sipariş ilerlemesini ETKİLEMEZ --');
  const siparis2 = { kalemler: [{ grup: 'urun', kod: 'U1', miktar: 10 }] };
  siparisKismiSevkGuncelle(siparis2, [{ kaynak: 'yarimamul', kod: 'U1', miktar: 10 }]);
  t('yarimamul kaynaklı kalem urun ilerlemesine SAYILMIYOR', !siparis2.kalemler[0].sevkEdilenMiktar);
  t('bu yüzden sipariş hâlâ kismi_sevk_edildi (hiç ürün sevk edilmemiş sayılır)', siparis2.durum === 'kismi_sevk_edildi');
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
