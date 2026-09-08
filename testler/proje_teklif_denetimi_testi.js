// ── PROJE / TEKLİF EKRANI DENETİMİ (T54) ─────────────────────────────────
// Bağımsız bir denetim ajanı page_teklif.js, page_siparis.js,
// page_teklif_degerlendirme.js, teklif_takip_motor.js, proje_motor.js,
// page_proje.js, proje_teklif_motor.js, page_proje_teklif.js dosyalarını
// T1-T4 tarzında inceledi. T52/T53'te bu dosyalarda zaten düzeltilen
// bulgular (CRM müşteri eşleşmesi, fiyat listesi çakışması, CRM geri
// senkron) burada tekrar test edilmiyor.
//
// Düzeltilen bulgular (2 KRİTİK dahil):
//  1) [KRİTİK] TeklifTakipMotor.DURUMLAR'da 'siparise_donustu'/
//     'siparis_reddedildi'/'silme_talebinde' YOKTU — durumBul() bunları
//     tanımayıp sessizce 'taslak'a düşürüyordu. Teklif Değerlendirme'nin
//     durum <select>'i hiçbir seçenek 'selected' bulamadığından tarayıcı
//     İLK seçeneği (taslak) gösteriyordu — kullanıcı fark etmeden
//     "Kaydet"e basarsa GERÇEKTEN siparişe dönüşmüş/silme talebindeki bir
//     teklif veritabanında sessizce 'taslak'a GERİ DÖNÜYORDU (mükerrer
//     sipariş + silme-onay-atlatma riski). Ayrıca bu teklifler kazanma
//     oranı istatistiğine hiç girmiyordu.
//  2) [KRİTİK] Mahal Bazlı Proje Teklifi'nde "Siparişe Dönüştür" butonu
//     teklifin durumuna hiç bakmadan HER ZAMAN render ediliyordu — zaten
//     siparişe dönüştürülmüş bir teklif TEKRAR dönüştürülüp aynı mahal/
//     kalemlerden ikinci, ayrı bir sipariş oluşturulabiliyordu.
//  3) Proje hakedişinde elle girilen tutar için üst sınır yoktu (fiziksel
//     ilerlemenin çok üzerinde hakediş kesilebiliyordu) ve kaydedilen
//     kumulatifOran her zaman TEORİK azami tutarın oranıydı, GERÇEKTEN
//     girilen tutarı yansıtmıyordu.
//  4) crm_motor.js'te (T52) düzeltilen kimlik sınıfı hatası (App.aktifRol()
//     yerine App.aktifKullaniciAdi()) proje_motor.js, proje_teklif_motor.js,
//     page_proje.js, page_proje_teklif.js, page_teklif_degerlendirme.js'te
//     HENÜZ düzeltilmemişti.
//  5) Proje oluştururken eşleşmeyen müşteri adı sessizce musteriId:null ile
//     kaydediliyordu — bu ekranda sonradan düzeltecek bir yol da yok.
//  6) Teklif/Sipariş/Proje kaydetme butonlarında çift tıklama koruması
//     yoktu (tk-save-draft, sp-save-draft, pj-kaydet).
//
// (Sipariş 'toplam' alanının KDV dahil/hariç tutarsızlığı ve proje
// hakedişinin muhasebe entegrasyonu eksikliği — kod içi yorumlarla
// belgelendi, gerçek fatura/muhasebe akışına dokunan ayrı bir değişiklik
// gerektirdiğinden bu turda düzeltilmedi.)
//
// teklif_takip_motor.js ve proje_motor.js dual-mode (module.exports)
// olduğundan gerçek birim testi yapılır; page_*.js kaynak üzerinde regex
// ile kilitlenir.
const fs = require('fs'), path = require('path');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- BULGU 1: TeklifTakipMotor artık siparise_donustu/silme_talebinde/siparis_reddedildi\'yi tanıyor --');
delete require.cache[require.resolve('../teklif_takip_motor.js')];
const TTM = require('../teklif_takip_motor.js');
{
  t('siparise_donustu DURUMLAR\'da tanımlı', TTM.DURUMLAR.some(d => d.id === 'siparise_donustu'));
  t('silme_talebinde DURUMLAR\'da tanımlı', TTM.DURUMLAR.some(d => d.id === 'silme_talebinde'));
  t('siparis_reddedildi DURUMLAR\'da tanımlı', TTM.DURUMLAR.some(d => d.id === 'siparis_reddedildi'));
  t('durumBul artık siparise_donustu\'yu YANLIŞ "taslak"a düşürmüyor', TTM.durumBul('siparise_donustu').id === 'siparise_donustu');
  t('siparise_donustu KAPALI (acik:false) sayılıyor', TTM.durumBul('siparise_donustu').acik === false);

  console.log('\n  -- kazandiMi: siparişe dönüşen teklif artık "kazanıldı" istatistiğine giriyor --');
  t('kazandiMi(kazanildi) true', TTM.kazandiMi({ durum: 'kazanildi' }) === true);
  t('kazandiMi(siparise_donustu) true (fiilen kazanılmış)', TTM.kazandiMi({ durum: 'siparise_donustu' }) === true);
  t('kazandiMi(kaybedildi) false', TTM.kazandiMi({ durum: 'kaybedildi' }) === false);

  const liste = [
    { id: '1', durum: 'siparise_donustu', tutar: 100000, sorumlu: 'Ayşe' },
    { id: '2', durum: 'kaybedildi', tutar: 50000, sorumlu: 'Ayşe' }
  ];
  const oz = TTM.ozet(liste);
  t('ozet(): siparise_donustu artık kazanan sayısına giriyor (eskiden HİÇ girmiyordu)', oz.kazanan === 1);
  t('ozet(): kazanma oranı doğru hesaplanıyor (1/2 = %50)', oz.kazanmaOrani === 50);
  const perf = TTM.sorumluPerformansi(liste);
  t('sorumluPerformansi(): siparise_donustu sorumlunun kazanan sayısına giriyor', perf[0].kazanan === 1 && perf[0].tutar === 100000);

  console.log('\n  -- durumDegistirGecerli: bu 3 durum artık manuel dropdown\'dan seçilemiyor --');
  const teklif = { durum: 'gonderildi' };
  t('siparise_donustu\'ya manuel geçiş ENGELLENDİ (yalnızca gerçek işlem akışından)',
    TTM.durumDegistirGecerli(teklif, 'siparise_donustu').ok === false);
  t('silme_talebinde\'ye manuel geçiş ENGELLENDİ', TTM.durumDegistirGecerli(teklif, 'silme_talebinde').ok === false);
  t('siparis_reddedildi\'ye manuel geçiş ENGELLENDİ', TTM.durumDegistirGecerli(teklif, 'siparis_reddedildi').ok === false);
  t('normal geçişler (kaybedildi, sebeple) hâlâ çalışıyor',
    TTM.durumDegistirGecerli(teklif, 'kaybedildi', { kayipSebebi: 'Fiyat yüksek' }).ok === true);

  console.log('\n  -- Kritik senaryo: siparise_donustu bir teklif artık "zaten bu durumda" diye korunuyor --');
  const donusmusTeklif = { durum: 'siparise_donustu' };
  // Eskiden: <select> hiçbir seçenek bulamayıp "taslak" gösterirdi, kullanıcı
  // dokunmadan Kaydet'e basarsa yeni='taslak' olur ve durumDegistirGecerli
  // bunu GEÇERLİ bir geçiş sanıp izin verirdi (mevcut durum 'taslak' DEĞİLDİ).
  // Artık <option value="siparise_donustu" selected> doğru şekilde seçili
  // olacağından yeni=durum olur ve aşağıdaki "zaten bu durumda" bloklar.
  t('artık select doğru şekilde MEVCUT durumu seçili gösterecek (DURUMLAR\'da bulunuyor)',
    TTM.durumBul(donusmusTeklif.durum).id === donusmusTeklif.durum);
  t('dokunulmadan kaydedilirse (yeni=durum) "zaten bu durumda" ile bloklanır — sessiz taslağa dönüş YOK',
    TTM.durumDegistirGecerli(donusmusTeklif, 'siparise_donustu').ok === false &&
    TTM.durumDegistirGecerli(donusmusTeklif, 'siparise_donustu').hata.includes('zaten bu durumda'));
}

console.log('\n-- BULGU 2: page_proje_teklif.js artık siparişe dönüşmüş tekliften mükerrer sipariş üretmiyor --');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'page_proje_teklif.js'), 'utf8');
  t('ozetCiz artık t.durum === \'siparise_dondu\' kontrolü yapıyor', /const donustu = t\.durum === 'siparise_dondu';/.test(src));
  t('dönüşmüşse buton yerine "✓ Siparişe dönüştürüldü" pill gösteriliyor', /✓ Siparişe dönüştürüldü/.test(src));
  t('pt-siparis butonu artık koşullu render ediliyor (varsa onclick bağlanıyor)', /const siparisBtn = document\.getElementById\('pt-siparis'\);\s*\n\s*if \(siparisBtn\)/.test(src));
  t('siparisFormu içinde de savunma amaçlı tekrar kontrolü var', /if \(t\.durum === 'siparise_dondu'\) \{ App\.toast\('Bu teklif zaten siparişe dönüştürülmüş\.', 'err'\); return; \}/.test(src));
}

console.log('\n-- BULGU 3: proje_motor.js hakediş elle tutarı artık üst sınırlı, kumulatifOran GERÇEK tutarı yansıtıyor --');
global.App = { uid: p => p + '-x', persist: async f => f(), aktifRol: () => 'yonetim' };
{
  const proje = {
    sozlesmeBedeli: 100000, revizyonFarki: 0,
    asamalar: [{ id: 'a', agirlik: 100, tamamlanmaYuzdesi: 20 }],   // %20 fiziksel ilerleme -> izin verilen azami 20.000
    hakedisler: []
  };
  global.Store = { projeler: { all: async () => [{ id: 'P1', ...proje }] }, topluGuncelle: async () => { } };
  delete require.cache[require.resolve('../proje_motor.js')];
  const PM = require('../proje_motor.js');

  (async () => {
    let r = await PM.hakedisOlustur('P1', { elleTutar: 90000 });
    t('fiziksel ilerlemenin ÇOK üzerinde elle tutar artık REDDEDİLİYOR (eskiden serbestçe kabul edilirdi)', r.ok === false);
    t('red mesajı azami tutarı açıkça belirtiyor', /azami tutarı/.test(r.hata || ''));

    r = await PM.hakedisOlustur('P1', { elleTutar: 15000 });
    t('izin verilen tutarın altındaki elle tutar kabul ediliyor', r.ok === true);
    t('kumulatifOran artık GERÇEK girilen tutarı yansıtıyor (15000/100000=%15, teorik %20 DEĞİL)',
      Math.abs(r.hakedis.kumulatifOran - 15) < 0.1);

    console.log('\n-- BULGU 4: proje_motor.js/proje_teklif_motor.js artık App.aktifKullaniciAdi() önceliyor --');
    global.App = {
      uid: p => p + '-x', persist: async f => f(),
      aktifKullaniciAdi: () => 'mehmet.proje', aktifRol: () => 'yonetim'
    };
    const db2 = { projeler: [{ id: 'P1', ...proje, hakedisler: [] }] };
    global.Store = {
      projeler: { all: async () => db2.projeler },
      topluGuncelle: async () => { },
      topluEkle: async (k, arr) => { db2[k].push(...arr); }
    };
    delete require.cache[require.resolve('../proje_motor.js')];
    const PM2 = require('../proje_motor.js');
    const projeR = await PM2.projeOlustur({ ad: 'Test Proje', musteriAdi: 'X' });
    t('projeOlustur: sorumlu varsayılanı ROL DEĞİL gerçek kullanıcı adı', projeR.proje.sorumlu === 'mehmet.proje');
    const hkR = await PM2.hakedisOlustur('P1', {});
    t('hakedisOlustur: olusturan gerçek kullanıcı adı', hkR.hakedis.olusturan === 'mehmet.proje');
    const revR = await PM2.revizyonEkle('P1', { baslik: 'Kapsam değişti', gerekce: 'Müşteri talebi' });
    t('revizyonEkle: kim gerçek kullanıcı adı', revR.revizyon.kim === 'mehmet.proje');

    const projeTeklifSrc = fs.readFileSync(path.join(__dirname, '..', 'proje_teklif_motor.js'), 'utf8');
    t('proje_teklif_motor.js: olusturan artık App.aktifKullaniciAdi() önceliyor',
      /olusturan: \(App\.aktifKullaniciAdi \? App\.aktifKullaniciAdi\(\) : \(App\.aktifRol \? App\.aktifRol\(\) : ''\)\),/.test(projeTeklifSrc));

    console.log('\n-- BULGU 4 (devam): page_proje.js / page_proje_teklif.js / page_teklif_degerlendirme.js kaynak kilidi --');
    const pjSrc = fs.readFileSync(path.join(__dirname, '..', 'page_proje.js'), 'utf8');
    t('page_proje.js: Sorumlu varsayılanı artık App.aktifKullaniciAdi() önceliyor',
      /App\.escapeHtml\(App\.aktifKullaniciAdi \? App\.aktifKullaniciAdi\(\) : App\.aktifRol\(\)\)/.test(pjSrc));
    const ptSrc = fs.readFileSync(path.join(__dirname, '..', 'page_proje_teklif.js'), 'utf8');
    t('page_proje_teklif.js: sipariş olusturan artık App.aktifKullaniciAdi() önceliyor',
      /olusturan: App\.aktifKullaniciAdi \? App\.aktifKullaniciAdi\(\) : App\.aktifRol\(\)/.test(ptSrc));
    const degSrc = fs.readFileSync(path.join(__dirname, '..', 'page_teklif_degerlendirme.js'), 'utf8');
    t('page_teklif_degerlendirme.js: revizyon kim artık App.aktifKullaniciAdi() önceliyor',
      /kim: App\.aktifKullaniciAdi \? App\.aktifKullaniciAdi\(\) : App\.aktifRol\(\)/.test(degSrc));

    console.log('\n-- BULGU 5: page_proje.js artık eşleşmeyen müşteriyi sessizce null kaydetmiyor --');
    t('eşleşmeyen müşteri adı için açık hata/uyarı eklendi',
      /Müşteri sistemde bulunamadı — lütfen listeden seçin/.test(pjSrc));
    t('eşleşmeyen müşteri durumunda kayıt ENGELLENİYOR (return var)',
      /if \(musteriAdi && !m\) \{[\s\S]{0,300}return;/.test(pjSrc));

    console.log('\n-- BULGU 6: kritik kaydetme butonlarında artık çift tıklama koruması var --');
    const teklifSrc = fs.readFileSync(path.join(__dirname, '..', 'page_teklif.js'), 'utf8');
    const siparisSrc = fs.readFileSync(path.join(__dirname, '..', 'page_siparis.js'), 'utf8');
    t('page_teklif.js: tk-save-draft artık disabled koruması kullanıyor',
      /tk-save-draft'\)\.onclick = async \(ev\) => \{[\s\S]{0,400}btn\.disabled = true;/.test(teklifSrc));
    t('page_siparis.js: sp-save-draft artık disabled koruması kullanıyor',
      /sp-save-draft'\)\.onclick = async \(ev\) => \{[\s\S]{0,400}btn\.disabled = true;/.test(siparisSrc));
    t('page_proje.js: pj-kaydet artık disabled koruması kullanıyor',
      /pj-kaydet'\)\.onclick = async \(ev\) => \{\s*\n\s*const btn = ev\.currentTarget;\s*\n\s*btn\.disabled = true;/.test(pjSrc));

    console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
    process.exit(bad ? 1 : 0);
  })();
}
