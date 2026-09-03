// BULGU: Sipariş yönetim onayı yeniden tetiklenirse (aynı siparişin ikinci
// kez onaylanması — ör. iki yönetici aynı anda, ya da Onaylar ekranının
// bayat listesinden ikinci kez "Onayla") kesim/hammadde ihtiyacı miktarları
// İKİNCİ KEZ üste ekleniyor, raf stoğu (yarımamül) İKİNCİ KEZ düşülüyor ve
// ödeme planı (çek/kredi kartı) İKİNCİ KEZ "elde"/kasaya işleniyordu — hiçbir
// idempotentlik koruması yoktu. Düzeltme üç katmanlı:
//  1) page_onaylar.js: onOnayla çağrılmadan hemen önce sunucudaki GÜNCEL
//     sipariş durumu tekrar kontrol edilir ('yonetim_onay_bekliyor' değilse
//     işlem durdurulur).
//  2) app.js: siparisOnaylaninceKesimIhtiyaciOlustur kendi üzerinde
//     'kesimIhtiyaciIslendi' bayrağını kontrol eder/yazar.
//  3) app.js: siparisOnaylaninceOdemePlaniniAnindaIsle kendi üzerinde
//     'odemePlaniIslendi' bayrağını kontrol eder/yazar.
// app.js ve page_onaylar.js Store/DOM'a derinden bağlı olduğu için (diğer
// page_* testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const onaySrc = fs.readFileSync(path.join(__dirname, '..', 'page_onaylar.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- Katman 1: Onaylar ekranı, onOnayla çağrılmadan önce GÜNCEL durumu kontrol ediyor --');
t('onOnayla içinde güncel sipariş sunucudan tekrar okunuyor',
  /onOnayla: async \(odemePlani\) => \{[\s\S]{0,600}const guncelSiparisler = await Store\.siparisler\.all\(\);/.test(onaySrc));
t('durum yonetim_onay_bekliyor değilse işlem DURDURULUYOR (return)',
  /if \(!guncel \|\| guncel\.durum !== 'yonetim_onay_bekliyor'\) \{[\s\S]{0,200}return;\s*\}/.test(onaySrc));

console.log('\n-- Katman 2: siparisOnaylaninceKesimIhtiyaciOlustur kendi bayrağını kontrol ediyor --');
t('fonksiyon başında kesimIhtiyaciIslendi kontrolü var (erken return)',
  /async function siparisOnaylaninceKesimIhtiyaciOlustur\(siparis\) \{[\s\S]{0,300}if \(siparis\.kesimIhtiyaciIslendi\) return null;/.test(appSrc));
t('işlem sonunda kesimIhtiyaciIslendi = true yazılıp kaydediliyor',
  /siparis\.kesimIhtiyaciIslendi = true;\s*\n\s*await Store\.siparisler\.upsert\(siparis\);/.test(appSrc));

console.log('\n-- Katman 3: siparisOnaylaninceOdemePlaniniAnindaIsle kendi bayrağını kontrol ediyor --');
t('fonksiyon başında odemePlaniIslendi kontrolü var (erken return)',
  /async function siparisOnaylaninceOdemePlaniniAnindaIsle\(siparis, musteri\) \{[\s\S]{0,300}if \(siparis\.odemePlaniIslendi\) return null;/.test(appSrc));
t('işlem sonunda odemePlaniIslendi = true yazılıyor',
  /siparis\.odemePlaniIslendi = true;/.test(appSrc));

console.log('\n-- Çağıran taraf, null dönüşünde çökmüyor (mevcut null-güvenli kontrol korunmuş) --');
t('odemeSonuc null olabilir, if (odemeSonuc) ile korunuyor',
  /if \(odemeSonuc\) \{/.test(onaySrc));
t('kesimSonuc null olabilir, if (kesimSonuc && ...) ile korunuyor',
  /if \(kesimSonuc && \(kesimSonuc\.olusturulan \|\| kesimSonuc\.guncellenen\)\)/.test(onaySrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
