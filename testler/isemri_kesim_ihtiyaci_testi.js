// BULGU (T3-29): page_isemri.js'in "Kesim Optimizasyonuna Aktar" butonu
// App.goTo('nesting') çağırıyordu ama hiçbir parametre/veri taşımıyordu;
// page_nesting.js zaten yalnızca Store.kesimIhtiyaclari'nı okuyor (params
// almıyor). Asıl kök neden: MRP'den (rafta eksik yarımamül → İş Emri
// İhtiyaçları) ya da manuel (İş Emirleri sayfası "+ Yeni İş Emri",
// "Bitmiş Ürün Stok İş Emri") açılan iş emirleri için kesim ihtiyacı HİÇ
// oluşmuyordu — yalnızca sipariş onayında tetiklenen
// siparisOnaylaninceKesimIhtiyaciOlustur bu üretimlerden habersizdi.
// Düzeltme: yeni App.isEmriKesimIhtiyaciOlustur(isEmri) fonksiyonu iş
// emrinin uretimListesi'ni gezip plaka referanslarını kesimIhtiyaclari'na
// yazıyor; DÖRT iş emri oluşturma noktasının (page_uretim_panel.js x3,
// page_isemri.js x1) hepsine bu çağrı eklendi. "Kesim Optimizasyonuna
// Aktar" butonu da artık (idempotent) bu fonksiyonu çağırıp SONRA
// nesting'e gidiyor — eski (düzeltmeden önce açılmış) iş emirleri için
// güvence ağı. Ayrıca page_isemri.js:openNewForm'daki uretimListesi
// eşlemesi artık k.olcu/k.kenarBantlari'nı da taşıyor (önceden bu veri
// hiç kopyalanmıyordu, ürün reçetesinde doğrudan plaka referansı varsa
// kesim ihtiyacı çıkarılamıyordu).
// app.js/page_*.js Store/DOM'a derinden bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır;
// isEmriKesimIhtiyaciOlustur izole edilip sahte bir Store ile gerçek
// sayısal davranışla da doğrulanır.
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const uretimSrc = fs.readFileSync(path.join(__dirname, '..', 'page_uretim_panel.js'), 'utf8');
const isemriSrc = fs.readFileSync(path.join(__dirname, '..', 'page_isemri.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- app.js: isEmriKesimIhtiyaciOlustur tanımlı, idempotent, dışa aktarılmış --');
t('fonksiyon tanımlı', /async function isEmriKesimIhtiyaciOlustur\(isEmri\) \{/.test(appSrc));
t('idempotentlik bayrağı kontrolü ilk satırda',
  /async function isEmriKesimIhtiyaciOlustur\(isEmri\) \{[\s\S]{0,220}if \(isEmri\.kesimIhtiyaciIslendi\) return null;/.test(appSrc));
t('App\'ten dışa aktarılıyor', /siparisOnaylaninceKesimIhtiyaciOlustur, isEmriKesimIhtiyaciOlustur, hammaddeIhtiyaciOnaylaSatinalmayaGonder,/.test(appSrc));

console.log('\n-- page_uretim_panel.js: DÖRT (üçü burada) iş emri oluşturma noktasına da tetikleyici eklendi --');
const uretimTetikSayisi = (uretimSrc.match(/await App\.persist\(\(\) => App\.isEmriKesimIhtiyaciOlustur\(ie\)\);/g) || []).length;
t('page_uretim_panel.js\'te 3 tetikleyici çağrısı var (toplu dönüştür, tekli dönüştür, ürün stok iş emri)', uretimTetikSayisi === 3);

console.log('\n-- page_isemri.js: manuel oluşturma + "Kesim Optimizasyonuna Aktar" butonu --');
t('manuel iş emri oluşturulunca tetikleyici çağrılıyor',
  /await App\.persist\(\(\) => Store\.isemirleri\.upsert\(ie\)\);\s*\n\s*\/\/ BULGU \(T3-29\): manuel iş emri açılınca[\s\S]{0,150}await App\.persist\(\(\) => App\.isEmriKesimIhtiyaciOlustur\(ie\)\);/.test(isemriSrc));
t('uretimListesi artık olcu/kenarBantlari taşıyor',
  /olcu: k\.olcu \|\| null, kenarBantlari: k\.kenarBantlari \|\| null/.test(isemriSrc));
t('Kesim Optimizasyonuna Aktar butonu artık async, önce veri aktarıyor sonra goTo çağırıyor',
  /document\.getElementById\('ie-goto-nesting'\)\.onclick = async \(\) => \{[\s\S]{0,400}const sonuc = await App\.persist\(\(\) => App\.isEmriKesimIhtiyaciOlustur\(ie\)\);[\s\S]{0,300}App\.goTo\('nesting'\);/.test(isemriSrc));

console.log('\n-- Sayısal doğruluk: isEmriKesimIhtiyaciOlustur izole edilip sahte Store ile doğrulanıyor --');
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
  const src = fonksiyonCikar('isEmriKesimIhtiyaciOlustur', 'async function');

  function ortamKur(receteler, hammaddeler, kesimIhtiyaclari, isemirleriKayitli) {
    const Store = {
      receteler: { all: async () => receteler.slice() },
      hammaddeler: { all: async () => hammaddeler.slice() },
      kesimIhtiyaclari: { all: async () => kesimIhtiyaclari.slice(), save: async (arr) => { kesimIhtiyaclari.length = 0; kesimIhtiyaclari.push(...arr); } },
      isemirleri: { upsert: async (ie) => { isemirleriKayitli.push(ie); } }
    };
    const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const izole = new Function('Store', 'uid', src + '\nreturn isEmriKesimIhtiyaciOlustur;');
    return izole(Store, uid);
  }

  (async () => {
    const PLAKA1 = { id: 'HM-PLK1', ad: 'MDF 18mm Beyaz', tip: 'plaka', grainYonu: 'yok' };
    const PLAKA2 = { id: 'HM-PLK2', ad: 'MDF 8mm Arka Panel', tip: 'plaka', grainYonu: 'yok' };
    const hammaddeler = [PLAKA1, PLAKA2];

    console.log('\n  -- Senaryo 1: yarımamül üzerinden nested plaka (yarımamül reçetesi plaka içeriyor) --');
    const receteler1 = [
      { yarimamulId: 'YM-1', kalemler: [
        { tip: 'hammadde', refId: PLAKA1.id, miktar: 1, olcu: { netEn: 400, netBoy: 600 } }
      ] }
    ];
    const kesimIhtiyaclari1 = [];
    const isemirleriKayitli1 = [];
    const fn1 = ortamKur(receteler1, hammaddeler, kesimIhtiyaclari1, isemirleriKayitli1);
    const ie1 = { id: 'IE-1', kod: 'IE-2026-001', kesimIhtiyaciIslendi: false, uretimListesi: [{ tip: 'yarimamul', refId: 'YM-1', gerekliToplam: 5 }] };
    const sonuc1 = await fn1(ie1);
    t('1 yeni satır oluşturuldu', sonuc1.olusturulan === 1 && sonuc1.guncellenen === 0);
    t('plaka1 satırı açıldı', kesimIhtiyaclari1.length === 1 && kesimIhtiyaclari1[0].hammaddeId === PLAKA1.id);
    t('parça adedi doğru (5 yarımamül × 1 kalem/adet = 5)', kesimIhtiyaclari1[0].parcalar[0].adet === 5);
    t('ölçüler doğru aktarıldı (400x600)', kesimIhtiyaclari1[0].parcalar[0].en === 400 && kesimIhtiyaclari1[0].parcalar[0].boy === 600);
    t('isEmri.kesimIhtiyaciIslendi true oldu ve kaydedildi', ie1.kesimIhtiyaciIslendi === true && isemirleriKayitli1.length === 1);

    console.log('\n  -- Senaryo 2: İDEMPOTENTLİK — aynı iş emri tekrar işlenirse no-op --');
    const sonuc2 = await fn1(ie1);
    t('ikinci çağrı null dönüyor (zaten işlenmiş)', sonuc2 === null);
    t('parça adedi İKİNCİ KEZ artmadı (hâlâ 5)', kesimIhtiyaclari1[0].parcalar[0].adet === 5);

    console.log('\n  -- Senaryo 3: doğrudan hammadde (plaka) uretimListesi kalemi --');
    const kesimIhtiyaclari3 = [];
    const isemirleriKayitli3 = [];
    const fn3 = ortamKur([], hammaddeler, kesimIhtiyaclari3, isemirleriKayitli3);
    const ie3 = { id: 'IE-3', kod: 'IE-2026-003', kesimIhtiyaciIslendi: false, uretimListesi: [{ tip: 'hammadde', refId: PLAKA2.id, refIdMiktar: 1, gerekliToplam: 12, olcu: { netEn: 300, netBoy: 300 } }] };
    ie3.uretimListesi[0].refId = PLAKA2.id;
    const sonuc3 = await fn3(ie3);
    t('doğrudan hammadde (plaka) kalemi de kesim satırına düşüyor', kesimIhtiyaclari3.length === 1 && kesimIhtiyaclari3[0].hammaddeId === PLAKA2.id);
    t('adet doğru (12)', kesimIhtiyaclari3[0].parcalar[0].adet === 12);

    console.log('\n  -- Senaryo 4: aynı hammaddeye zaten AÇIK bir satır varsa GÜNCELLENİYOR (yeni satır açılmıyor) --');
    const kesimIhtiyaclari4 = [{ id: 'KSI-EXISTING', hammaddeId: PLAKA1.id, durum: 'acik', parcalar: [], kaynakSiparisler: [] }];
    const receteler4 = [{ yarimamulId: 'YM-4', kalemler: [{ tip: 'hammadde', refId: PLAKA1.id, miktar: 2, olcu: { netEn: 100, netBoy: 200 } }] }];
    const isemirleriKayitli4 = [];
    const fn4 = ortamKur(receteler4, hammaddeler, kesimIhtiyaclari4, isemirleriKayitli4);
    const ie4 = { id: 'IE-4', kod: 'IE-2026-004', kesimIhtiyaciIslendi: false, uretimListesi: [{ tip: 'yarimamul', refId: 'YM-4', gerekliToplam: 3 }] };
    const sonuc4 = await fn4(ie4);
    t('mevcut açık satır GÜNCELLENDİ, yeni satır açılmadı', sonuc4.olusturulan === 0 && sonuc4.guncellenen === 1);
    t('kaynakIsEmirleri iz bırakıyor', kesimIhtiyaclari4[0].kaynakIsEmirleri.includes('IE-4'));

    console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
    process.exit(bad ? 1 : 0);
  })();
}
