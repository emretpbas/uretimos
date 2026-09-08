// ── CRM EKRANI DENETİMİ (T52) ────────────────────────────────────────────
// Bağımsız bir denetim ajanı CRM modülünü (crm_motor.js, page_crm.js) ve
// bağlandığı Teklif/Pazarlama akışlarını T1-T4 tarzında inceledi; 6 gerçek
// bulgu bulundu ve düzeltildi:
//  1) crm_motor.js her yerde App.aktifRol() kullanıyordu — aynı role sahip
//     FARKLI çalışanlar (ör. iki satış temsilcisi) AYNI kişi sayılıyordu;
//     "bu aktiviteyi/aşama değişikliğini kim yaptı" bilgisi kayboluyordu.
//     Artık App.aktifKullaniciAdi() (gerçek kişi) önce denenir.
//  2) CRM fırsatından teklife geçişte, eşleşmeyen müşteri adı (CRM'de henüz
//     cari kartı olmayan bir aday) SESSİZCE listedeki İLK müşteriye
//     bağlanıyordu — kullanıcı fark etmeden alakasız müşteriye teklif
//     kesebiliyordu. Artık eşleşme yoksa müşteri boş bırakılır, kullanıcı
//     uyarılır ve boş müşteriyle kayıt engellenir.
//  3) Teklif "Kazanıldı/Kaybedildi/İptal/Siparişe Dönüştü" olduğunda bağlı
//     CRM fırsatı hâlâ eski aşamada (ör. "Teklif Verildi") kalıyordu — CRM
//     boru hattı/tahmin ve "ihmal edilen fırsat" uyarısı zaten kapanmış bir
//     anlaşmayı hâlâ açık sayıyordu. Artık iki yönde de otomatik senkron.
//  4) Fırsat/proje/aktivite kaydeden butonlarda çift-tıklama koruması
//     (disabled) yoktu — mükerrer kayıt/proje riski.
//  5) page_crm.js "6 Aylık Tahmin" tablosu new Date().toISOString() ile ay
//     etiketi üretiyordu — UTC+3'te ayın 1'i gece yarısından sonraki ~3 saat
//     yanlış (bir önceki) ayı gösteriyordu.
//  6) pazarlama_motor.js kampanya geçerliliği ve numune tarihleri aynı UTC
//     dönüşüm hatasını taşıyordu (kampanya bitiş/başlangıç sınırında ~3
//     saatlik yanlış pencere).
// crm_motor.js ve pazarlama_motor.js dual-mode (module.exports) olduğundan
// gerçek birim testi yapılır; DOM'a bağlı page_*.js akışları kaynak kod
// üzerinde regex ile kilitlenir (diğer page_*.js testleriyle aynı desen).

const fs = require('fs'), path = require('path');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

// ── 1) crm_motor.js: kimlik() gerçek kullanıcı kimliğini önceliyor ─────────
console.log('\n-- BULGU 1: crm_motor.js artık App.aktifKullaniciAdi() önceliyor --');
{
  const db = { firsatlar: [], crmAktiviteler: [] };
  global.Store = {
    firsatlar: { all: async () => db.firsatlar },
    crmAktiviteler: { all: async () => db.crmAktiviteler },
    topluEkle: async (k, arr) => { db[k].push(...arr); },
    topluGuncelle: async () => { }
  };
  global.App = {
    uid: p => p + '-' + Math.random().toString(36).slice(2, 7),
    persist: async f => f(),
    aktifKullaniciAdi: () => 'ayse.satis',   // gerçek kişi kimliği (bireysel hesap)
    aktifRol: () => 'satis'                    // rolü PAYLAŞAN başka bir çalışan da olabilir
  };
  delete require.cache[require.resolve('../crm_motor.js')];
  const CRM = require('../crm_motor.js');

  return (async () => {
    const r = await CRM.firsatOlustur({ musteriAdi: 'Test AŞ', baslik: 'Fırsat', tutar: 1000 });
    t('firsat olustu', r.ok === true);
    t('temsilci varsayılanı ROL DEĞİL gerçek kullanıcı adı', r.firsat.temsilci === 'ayse.satis');
    t('asamaGecmisi kim alanı gerçek kullanıcı adı', r.firsat.asamaGecmisi[0].kim === 'ayse.satis');

    const d = await CRM.asamaDegistir(r.firsat.id, 'nitelendi');
    t('asamaDegistir kim alanı gerçek kullanıcı adı', d.firsat.asamaGecmisi[1].kim === 'ayse.satis');

    const a = await CRM.aktiviteEkle({ firsatId: r.firsat.id, ozet: 'Görüşüldü' });
    t('aktiviteEkle kim alanı gerçek kullanıcı adı', a.aktivite.kim === 'ayse.satis');

    const b = await CRM.teklifBagla(r.firsat.id, 'TKF-1', 'TKF-1');
    t('teklifBagla asama geçmişi kim alanı gerçek kullanıcı adı',
      b.firsat.asamaGecmisi[b.firsat.asamaGecmisi.length - 1].kim === 'ayse.satis');

    console.log('\n-- Geriye dönük uyumluluk: aktifKullaniciAdi yoksa role düşer --');
    global.App = { uid: p => p + '-' + Math.random().toString(36).slice(2, 7), persist: async f => f(), aktifRol: () => 'satis' };
    delete require.cache[require.resolve('../crm_motor.js')];
    const CRM2 = require('../crm_motor.js');
    const r2 = await CRM2.firsatOlustur({ musteriAdi: 'X', baslik: 'Y', tutar: 1 });
    t('aktifKullaniciAdi tanımsızsa role düşülüyor', r2.firsat.temsilci === 'satis');

    devam();
  })();
}

function devam() {
  // ── 2/3/4/5) page_crm.js kaynak kilidi ────────────────────────────────────
  console.log('\n-- BULGU 1 (devam): page_crm.js Temsilci varsayılanı --');
  const crmSrc = fs.readFileSync(path.join(__dirname, '..', 'page_crm.js'), 'utf8');
  t('Temsilci alanı önce App.aktifKullaniciAdi() deniyor',
    /App\.escapeHtml\(App\.aktifKullaniciAdi \? App\.aktifKullaniciAdi\(\) : App\.aktifRol\(\)\)/.test(crmSrc));

  console.log('\n-- BULGU 4: page_crm.js çift-tıklama koruması (disabled) --');
  const disabledSayisi = (crmSrc.match(/btn\.disabled = true/g) || []).length;
  t('en az 4 kaydetme butonunda disabled koruması var (fırsat/proje/aktivite/aşama)', disabledSayisi >= 4);
  t('fr-kaydet artık ev.currentTarget ile buton referansı alıyor', /fr-kaydet.*onclick = async \(ev\)/.test(crmSrc.replace(/\n/g, ' ')));
  t('pd-olustur artık ev.currentTarget ile buton referansı alıyor', /pd-olustur.*onclick = async \(ev\)/.test(crmSrc.replace(/\n/g, ' ')));
  t('fd-akt-ekle artık ev.currentTarget ile buton referansı alıyor', /fd-akt-ekle.*onclick = async \(ev\)/.test(crmSrc.replace(/\n/g, ' ')));
  t('fd-asama forEach artık ev.currentTarget ile buton referansı alıyor', /fd-asama.*forEach\(b => b\.onclick = async \(ev\)/.test(crmSrc.replace(/\n/g, ' ')));

  console.log('\n-- BULGU 5: page_crm.js "6 Aylık Tahmin" artık yerel tarih kullanıyor --');
  {
    const start = crmSrc.indexOf('const aylar = [];');
    const end = crmSrc.indexOf('const adlar = [');
    t('aylar bloğu bulundu', start !== -1 && end !== -1);
    const blok = crmSrc.slice(start, end);
    t('blokta artık toISOString KULLANILMIYOR', !/toISOString/.test(blok));
    t('blokta getFullYear/getMonth ile yerel bileşen okunuyor', /getFullYear\(\)/.test(blok) && /getMonth\(\)/.test(blok));

    // Gerçek kodu çalıştırıp bugünün yerel ay/yıl bileşenleriyle bire bir
    // eşleştiğini doğrula (isg_denetimi_testi.js'teki aynı desen).
    const aylarFn = new Function(blok + '\nreturn aylar;');
    const aylar = aylarFn();
    const simdi = new Date();
    const beklenenIlkAy = simdi.getFullYear() + '-' + String(simdi.getMonth() + 1).padStart(2, '0');
    t('6 ay üretiliyor', aylar.length === 6);
    t('ilk ay YEREL bugünün ay/yılıyla birebir aynı (UTC kaymasi yok)', aylar[0] === beklenenIlkAy);
    const altinci = new Date(simdi.getFullYear(), simdi.getMonth() + 5, 1);
    const beklenenAltinciAy = altinci.getFullYear() + '-' + String(altinci.getMonth() + 1).padStart(2, '0');
    t('altıncı ay doğru yıl sınırını aşıyor (gerekirse)', aylar[5] === beklenenAltinciAy);
  }

  // ── 2/3) page_teklif.js kaynak kilidi ─────────────────────────────────────
  console.log('\n-- BULGU 2: page_teklif.js CRM\'den eşleşmeyen müşteri artık SESSİZCE ilk müşteriye düşmüyor --');
  const teklifSrc = fs.readFileSync(path.join(__dirname, '..', 'page_teklif.js'), 'utf8');
  t('musteriBulundu bayrağı eklendi', /let musteriBulundu = true;/.test(teklifSrc));
  t('eşleşme yoksa musteriBulundu false yapılıyor', /else musteriBulundu = false;/.test(teklifSrc));
  t('eşleşme yoksa draft\\.musteriId boşaltılıyor', /draft\.musteriId = '';/.test(teklifSrc));
  t('eşleşme yoksa kullanıcı err toast ile uyarılıyor',
    /CRM fırsatındaki müşteri.*sistemde bulunamadı/.test(teklifSrc.replace(/\n/g, ' ')));
  t('kaydetmeden önce geçerli müşteri zorunlu kılınıyor',
    /if \(!musteri\) \{ App\.toast\('Müşteri seçilmeli', 'err'\); return; \}/.test(teklifSrc));
  t('müşteri eşleşmiyorsa dropdown artık YANLIŞLIKLA ilk müşteriyi göstermiyor (placeholder eklendi)',
    /!musteriler\.some\(m => m\.id === d\.musteriId\) \? '<option value="" selected>— Müşteri seçin —<\/option>'/.test(teklifSrc));

  console.log('\n-- BULGU 3: page_teklif.js sipariş dönüşümünde CRM fırsatı otomatik "Kazanıldı"ya taşınıyor --');
  t('siparise_donustu sonrası CRM.asamaDegistir çağrılıyor',
    /t\.durum = 'siparise_donustu';[\s\S]{0,700}CRM\.asamaDegistir\(t\.firsatId, 'kazanildi'/.test(teklifSrc));

  // ── 3) page_teklif_degerlendirme.js kaynak kilidi ─────────────────────────
  console.log('\n-- BULGU 3 (devam): page_teklif_degerlendirme.js Kazanıldı/Kaybedildi/İptal CRM\'e geri yazılıyor --');
  const degSrc = fs.readFileSync(path.join(__dirname, '..', 'page_teklif_degerlendirme.js'), 'utf8');
  t('tk artık paylaşılan (let) değişken, her iki dalda da atanıyor', /let tk;/.test(degSrc));
  t('kazanildi/kaybedildi/iptal durumlarında CRM.asamaDegistir tetikleniyor',
    /\['kazanildi', 'kaybedildi', 'iptal'\]\.includes\(yeni\)\)/.test(degSrc) && /CRM\.asamaDegistir\(tk\.firsatId, hedefAsama, crmGerekce\)/.test(degSrc));
  t('kaybedildi CRM aşamasına, kazanildi kendi aşamasına eşleniyor',
    /const hedefAsama = yeni === 'kazanildi' \? 'kazanildi' : 'kaybedildi';/.test(degSrc));

  // ── 6) pazarlama_motor.js / page_pazarlama.js kaynak kilidi + gerçek test ──
  console.log('\n-- BULGU 6: pazarlama_motor.js artık yerel "bugün" (bugunYerel) kullanıyor --');
  delete require.cache[require.resolve('../pazarlama_motor.js')];
  global.App = { uid: p => p + '-x', persist: async f => f(), aktifRol: () => 'pazarlama' };
  global.Store = {
    kampanyalar: { all: async () => [] }, numuneler: { all: async () => [] },
    topluEkle: async () => { }, topluGuncelle: async () => { }
  };
  const PazarlamaMotor = require('../pazarlama_motor.js');
  t('bugunYerel dışa aktarılıyor', typeof PazarlamaMotor.bugunYerel === 'function');
  {
    const simdi = new Date();
    const beklenen = simdi.getFullYear() + '-' + String(simdi.getMonth() + 1).padStart(2, '0') + '-' + String(simdi.getDate()).padStart(2, '0');
    t('bugunYerel() yerel tarih bileşenlerinden üretiliyor (UTC\'ye çevrilmiyor)', PazarlamaMotor.bugunYerel() === beklenen);
  }
  const pazSrc = fs.readFileSync(path.join(__dirname, '..', 'pazarlama_motor.js'), 'utf8');
  t('gecerliMi artık toISOString KULLANMIYOR', !/const g = \(tarih \|\| new Date\(\)\.toISOString/.test(pazSrc));
  t('numune oluşturma tarihi artık bugunYerel()', /tarih: bugunYerel\(\)/.test(pazSrc));
  t('numune gönderim tarihi artık bugunYerel()', /n\.gonderimTarihi = bugunYerel\(\);/.test(pazSrc));

  console.log('\n-- BULGU 6 (devam): page_pazarlama.js artık kendi UTC kopyasını üretmiyor --');
  const pazPageSrc = fs.readFileSync(path.join(__dirname, '..', 'page_pazarlama.js'), 'utf8');
  t('bugun artık PazarlamaMotor.bugunYerel() ile üretiliyor', /const bugun = PazarlamaMotor\.bugunYerel\(\);/.test(pazPageSrc));
  t('page_pazarlama.js artık kendi toISOString tabanlı "bugün" kopyasını üretmiyor',
    !/const bugun = new Date\(\)\.toISOString/.test(pazPageSrc));

  console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
  process.exit(bad ? 1 : 0);
}
