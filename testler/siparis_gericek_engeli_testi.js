// BULGU: "Geri Çek / Düzenle" durum kontrolü olmadan HER siparişte
// gösteriliyordu — sevk edilmiş (irsaliye/fatura kesilmiş) bir sipariş bile
// tekrar "Cari Onayında"ya çekilip düzenlenebiliyordu; bu da ödeme planı,
// vade farkı ve kesim ihtiyacını İKİNCİ KEZ işleterek çift kayıt riski
// doğuruyordu. page_siparis.js Store/DOM'a bağlı olduğu için (diğer page_*
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_siparis.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- Üç katmanlı engel: giriş noktası + görünürlük + kayıt anı --');
// T3-23: kısmi sevkiyat desteği eklenince guard'lar 'kismi_sevk_edildi'yi
// de (tam 'sevk_edildi' ile AYNI şekilde) reddedecek biçimde genişletildi.
t('startEditSiparis girişte sevk_edildi VE kismi_sevk_edildi\'yi reddediyor',
  /function startEditSiparis\(main, siparis\) \{/.test(src) &&
  /if \(siparis\.durum === 'sevk_edildi' \|\| siparis\.durum === 'kismi_sevk_edildi'\) \{[\s\S]{0,200}return;\s*\}/.test(src));
t('"Geri Çek / Düzenle" butonu sevk_edildi/kismi_sevk_edildi\'de RENDER EDİLMİYOR',
  /\$\{\(s\.durum !== 'sevk_edildi' && s\.durum !== 'kismi_sevk_edildi'\) \? '<button class="btn btn-amber" id="sp-geri-cek">/.test(src));
t('buton yoksa .onclick atarken çökmüyor (null kontrolü)',
  /const geriCekBtn = document\.getElementById\('sp-geri-cek'\);\s*if \(geriCekBtn\)/.test(src));
t('kayıt anında TAZE veriyle tekrar kontrol ediliyor (mevcut.durum, kismi dahil)',
  /if \(mevcut\.durum === 'sevk_edildi' \|\| mevcut\.durum === 'kismi_sevk_edildi'\) \{[\s\S]{0,150}return;/.test(src));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
