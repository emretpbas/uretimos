// BULGU (T3-24): Sevkiyat ekranındaki "+ Kalem Ekle" ile irsaliyeye
// DOĞRUDAN eklenen 2. kalite/defolu kalemler App.ikinciKaliteKullanilabilirAdet
// (rezervasyon farkındalıklı kullanılabilir miktar) kontrolünden HİÇ
// geçmiyordu — bir teklifte REZERVE edilmiş bir kalem burada da seçilip
// aynı fiziksel parça iki farklı müşteriye satılabiliyordu; kayıt anında
// iade.miktar hiç düşülmüyor, durum KOŞULSUZ 'satildi' yazılıyordu (kısmi
// satış desteklenmiyordu). Düzeltme: yeni App.ikinciKaliteDogrudanSatisIsle
// fonksiyonu, teklif akışındaki (ikinciKaliteKalemleriSatildiIsaretle) AYNI
// kuralları — son kontrol, kısmi satışa duyarlı miktar/durum, satış
// geçmişi, ambar stok düşümü — doğrudan irsaliyeye eklenen kalemlere de
// uygular; page_sevkiyat_panel.js artık kalem seçim listesini gerçek
// kullanılabilir miktara göre filtreler/etiketler, taslak satırlarını
// kullanılabilir sınıra göre kelepçeler ve kayıttan ÖNCE bu fonksiyonu
// çağırıp yetersizse HİÇBİR ŞEY kaydetmez.
// app.js/page_*.js Store/DOM'a derinden bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır;
// ikinciKaliteDogrudanSatisIsle izole edilip sahte bir Store ile gerçek
// sayısal davranışla da doğrulanır.
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const sevkSrc = fs.readFileSync(path.join(__dirname, '..', 'page_sevkiyat_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- app.js: ikinciKaliteDogrudanSatisIsle tanımlı, dışa aktarılmış, aggregate kontrol yapıyor --');
t('fonksiyon tanımlı', /async function ikinciKaliteDogrudanSatisIsle\(ikKalemler, baglam\) \{/.test(appSrc));
t('aynı iadeKalemId birden fazla satırda TOPLANIYOR (evasion önleniyor)',
  /const toplanmis = new Map\(\); \/\/ iadeKalemId -> \{kod, miktar\}/.test(appSrc));
t('son kontrol ikinciKaliteKullanilabilirAdet ile (haricTeklifId=null)',
  /const kullanilabilir = ikinciKaliteKullanilabilirAdet\(iade, null\);/.test(appSrc));
t('yetersizse hiçbir şey yazılmadan hata dönüyor',
  /return \{ ok: false, hata: `"\$\{iade\.ad \|\| iade\.kod\}" için yeterli stok yok/.test(appSrc));
t('kısmi satışa duyarlı: miktar>0 kalırsa durum satista kalıyor',
  /if \(iade\.miktar <= 0\) iade\.durum = 'satildi';/.test(appSrc));
t('App\'ten dışa aktarılıyor', /ikinciKaliteKalemleriSatildiIsaretle, ikinciKaliteSevkBilgisiIsle, ikinciKaliteDogrudanSatisIsle, sayfayaErisebilir,/.test(appSrc));

console.log('\n-- page_sevkiyat_panel.js: kalem seçim listesi gerçek kullanılabilir miktara göre filtreleniyor --');
t('secenekler App.ikinciKaliteKullanilabilirAdet kullanıyor',
  /kullanilabilir: App\.ikinciKaliteKullanilabilirAdet\(i, null\)/.test(sevkSrc));
t('kullanılabilir 0 olanlar listeye hiç girmiyor',
  /\.filter\(x => x\.kullanilabilir > 0\)/.test(sevkSrc));
t('Ekle handler taslakta zaten eklenen miktarı düşüp kelepçeliyor',
  /const taslaktaEklenen = kalemler\.filter\(k => k\.iadeKalemId === s\.iadeKalemId\)\.reduce\(\(a, k\) => a \+ \(k\.miktar \|\| 0\), 0\);/.test(sevkSrc));
t('miktar onchange handler da kullanılabilir sınıra göre kelepçeliyor',
  /const izinliMax = Math\.max\(0, kalem\.kullanilabilir - digerSatirlarToplami\);/.test(sevkSrc));
t('ir-save KAYITTAN ÖNCE App.ikinciKaliteDogrudanSatisIsle çağırıyor',
  /const ikSonuc = await App\.persist\(\(\) => App\.ikinciKaliteDogrudanSatisIsle\(ikKalemler, \{/.test(sevkSrc));
t('doğrulama başarısızsa irsaliye HİÇ oluşturulmadan return ediliyor',
  /if \(!ikSonuc\.ok\) \{ App\.toast\(ikSonuc\.hata, 'err'\); return; \}/.test(sevkSrc));
t('eski koşulsuz "durum = \'satildi\'" ad-hoc bloğu ARTIK YOK',
  !/if \(iade\.durum !== 'satildi'\) \{\s*\n\s*iade\.durum = 'satildi';\s*\n\s*iade\.satisTarihi = irsaliye\.tarih;/.test(sevkSrc));

console.log('\n-- Sayısal doğruluk: ikinciKaliteDogrudanSatisIsle izole edilip sahte Store ile doğrulanıyor --');
{
  function fonksiyonCikar(ad, girisNoktasi) {
    const baslangic = appSrc.indexOf(girisNoktasi + ' ' + ad + '(');
    let derinlik = 0, i = appSrc.indexOf('{', baslangic), sonuc = '';
    for (; i < appSrc.length; i++) {
      const c = appSrc[i];
      if (c === '{') derinlik++;
      if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
    }
    return appSrc.slice(baslangic, i);
  }
  const srcRezerve = fonksiyonCikar('ikinciKaliteRezerveToplam', 'function');
  const srcKullanilabilir = fonksiyonCikar('ikinciKaliteKullanilabilirAdet', 'function');
  const srcDogrudanSatis = fonksiyonCikar('ikinciKaliteDogrudanSatisIsle', 'async function');

  function ortamKur(iadeler, stokRaf) {
    const Store = {
      iadeKalemleri: { all: async () => iadeler.slice(), save: async (arr) => { iadeler.length = 0; iadeler.push(...arr); } },
      stokRaf: { all: async () => stokRaf.slice(), save: async (arr) => { stokRaf.length = 0; stokRaf.push(...arr); } }
    };
    const izole = new Function('Store', srcRezerve + '\n' + srcKullanilabilir + '\n' + srcDogrudanSatis + '\nreturn ikinciKaliteDogrudanSatisIsle;');
    return izole(Store);
  }

  (async () => {
    console.log('\n  -- Senaryo 1: rezerve edilmiş kalem doğrudan satılamaz --');
    let iadeler = [{ id: 'IAD-1', kod: 'K-1', ad: 'Sandalye 2.Kalite', durum: 'satista', miktar: 5, rezervasyonlar: [{ teklifId: 'TKL-1', teklifKod: 'T-1', adet: 5 }] }];
    let stokRaf = [];
    let fn = ortamKur(iadeler, stokRaf);
    let sonuc = await fn([{ iadeKalemId: 'IAD-1', kod: 'K-1', miktar: 1 }], { kaynakId: 'SIP-1', kaynakKod: 'S-1', tarih: '2026-09-01' });
    t('tamamen rezerve edilmiş kalem reddediliyor', sonuc.ok === false);
    t('iade.miktar değişmiyor (yazma yapılmadı)', iadeler[0].miktar === 5);

    console.log('\n  -- Senaryo 2: kısmen rezerve, kullanılabilir kısım satılabilir --');
    iadeler = [{ id: 'IAD-2', kod: 'K-2', ad: 'Masa 2.Kalite', durum: 'satista', miktar: 10, rezervasyonlar: [{ teklifId: 'TKL-2', teklifKod: 'T-2', adet: 6 }] }];
    stokRaf = [{ ambar: 'iade_ambari', refId: 'IAD-2', miktar: 10 }];
    fn = ortamKur(iadeler, stokRaf);
    sonuc = await fn([{ iadeKalemId: 'IAD-2', kod: 'K-2', miktar: 4 }], { kaynakId: 'SIP-2', kaynakKod: 'S-2', musteriAdi: 'ABC', tarih: '2026-09-02', irsaliyeNo: 'IRS-2' });
    t('kullanılabilir (4) kadarlık satış kabul ediliyor', sonuc.ok === true);
    t('iade.miktar 10-4=6 oldu', iadeler[0].miktar === 6);
    t('miktar>0 kaldığı için durum hâlâ satista', iadeler[0].durum === 'satista');
    t('stokRaf da 4 düştü (10->6)', stokRaf[0].miktar === 6);
    t('satisGecmisi kaydı eklendi', iadeler[0].satisGecmisi.length === 1 && iadeler[0].satisGecmisi[0].adet === 4);
    sonuc = await fn([{ iadeKalemId: 'IAD-2', kod: 'K-2', miktar: 1 }], { kaynakId: 'SIP-2', kaynakKod: 'S-2', musteriAdi: 'ABC', tarih: '2026-09-02', irsaliyeNo: 'IRS-2' });
    t('kalan kullanılabilirin (10-6-6=0 rezerve dahil) üzerine satış reddediliyor', sonuc.ok === false);

    console.log('\n  -- Senaryo 3: rezervasyon yokken tam satış -> durum satildi olur --');
    iadeler = [{ id: 'IAD-3', kod: 'K-3', ad: 'Sehpa 2.Kalite', durum: 'satista', miktar: 2, rezervasyonlar: [] }];
    stokRaf = [{ ambar: 'iade_ambari', refId: 'IAD-3', miktar: 2 }];
    fn = ortamKur(iadeler, stokRaf);
    sonuc = await fn([{ iadeKalemId: 'IAD-3', kod: 'K-3', miktar: 2 }], { kaynakId: 'SIP-3', kaynakKod: 'S-3', tarih: '2026-09-03' });
    t('satış kabul ediliyor', sonuc.ok === true);
    t('miktar 0 oldu', iadeler[0].miktar === 0);
    t('durum satildi oldu', iadeler[0].durum === 'satildi');

    console.log('\n  -- Senaryo 4: aynı kalem için AGGREGATE edilmiş çoklu satır sınırı aşarsa reddediliyor (evasion önlendi) --');
    iadeler = [{ id: 'IAD-4', kod: 'K-4', ad: 'Dolap 2.Kalite', durum: 'satista', miktar: 5, rezervasyonlar: [] }];
    stokRaf = [{ ambar: 'iade_ambari', refId: 'IAD-4', miktar: 5 }];
    fn = ortamKur(iadeler, stokRaf);
    sonuc = await fn([
      { iadeKalemId: 'IAD-4', kod: 'K-4', miktar: 3 },
      { iadeKalemId: 'IAD-4', kod: 'K-4', miktar: 3 }
    ], { kaynakId: 'SIP-4', kaynakKod: 'S-4', tarih: '2026-09-04' });
    t('toplam 6 > kullanılabilir 5 olduğu için TÜMÜ reddediliyor', sonuc.ok === false);
    t('hiçbir yazma yapılmadı (miktar hâlâ 5)', iadeler[0].miktar === 5);

    console.log('\n  -- Senaryo 5: durum satista değilse (örn. zaten satılmış) reddediliyor --');
    iadeler = [{ id: 'IAD-5', kod: 'K-5', ad: 'Vitrin 2.Kalite', durum: 'satildi', miktar: 0, rezervasyonlar: [] }];
    stokRaf = [];
    fn = ortamKur(iadeler, stokRaf);
    sonuc = await fn([{ iadeKalemId: 'IAD-5', kod: 'K-5', miktar: 1 }], { kaynakId: 'SIP-5', kaynakKod: 'S-5', tarih: '2026-09-05' });
    t('zaten satılmış kalem reddediliyor', sonuc.ok === false);

    console.log('\n  -- Senaryo 6: boş liste her zaman ok döner (no-op) --');
    sonuc = await fn([], { kaynakId: 'SIP-6', kaynakKod: 'S-6', tarih: '2026-09-06' });
    t('boş liste ok:true', sonuc.ok === true);

    console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
    process.exit(bad ? 1 : 0);
  })();
}
