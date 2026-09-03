// BULGU (T3-25): Arıza kaydı açılınca makinaTechizat.durum hiç değişmiyordu
// — planlama/hat_takip makinanın arızalı olduğunu göremiyor, iş atanmaya
// devam edilebiliyordu. Düzeltme: page_uretim_panel.js'teki "Arıza Bildir"
// akışı artık ilgili makinayı 'arizali' durumuna çekiyor (önceki durumu
// oncekiDurumArizaOncesi'nde saklıyor); page_hat_takip.js hattaki arızalı
// makinaları kırmızı bir uyarı bandıyla gösteriyor; page_bakim_panel.js'in
// Envanter listesi artık 'arizali' makinaları da gösteriyor (⚠ Arızalı
// rozetiyle) — önceden bu makinalar yalnızca 'aktif' filtresine takılıp
// panelden tamamen kayboluyordu.
//
// BULGU (T3-26, bu düzeltmenin ÖN KOŞULU): arıza kayıtları 'islemde'den
// sonra hiç 'tamamlandi'ya geçemiyordu — durum haritasında etiket vardı
// ama set eden buton yoktu. Makinayı 'arizali'den geri döndürebilmek için
// arızayı KAPATABİLMEK gerekiyordu; bu yüzden iki bulgu birlikte çözüldü.
// Düzeltme: page_bakim_panel.js Arıza Kayıtları sekmesine 'islemde'
// durumundaki kayıtlar için "✓ Tamamlandı" butonu eklendi; kapatılınca
// AYNI makinada başka açık (bekliyor/islemde) arıza kalmadıysa makina
// oncekiDurumArizaOncesi'ne (yoksa 'aktif'e) geri döner.
//
// page_*.js Store/DOM'a derinden bağlı olduğu için (diğer page_* testleriyle
// aynı desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const uretimSrc = fs.readFileSync(path.join(__dirname, '..', 'page_uretim_panel.js'), 'utf8');
const bakimSrc = fs.readFileSync(path.join(__dirname, '..', 'page_bakim_panel.js'), 'utf8');
const hatTakipSrc = fs.readFileSync(path.join(__dirname, '..', 'page_hat_takip.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- page_uretim_panel.js: Arıza Bildir makinayı arizali durumuna çekiyor --');
t('makina dropdown zaten arızalı olanı etiketliyor',
  /\$\{m\.durum === 'arizali' \? ' \(⚠ zaten arızalı\)' : ''\}/.test(uretimSrc));
t('onay sonrası makinaTechizat taze okunuyor',
  /const tumMakinalar = await Store\.makinaTechizat\.all\(\);/.test(uretimSrc));
t('önceki durum kaybolmadan saklanıyor (yalnızca ilk arızada)',
  /if \(makina && makina\.durum !== 'arizali'\) \{\s*\n\s*makina\.oncekiDurumArizaOncesi = makina\.durum;\s*\n\s*makina\.durum = 'arizali';/.test(uretimSrc));
t('makina değişikliği persist ediliyor',
  /await App\.persist\(\(\) => Store\.makinaTechizat\.upsert\(makina\)\);/.test(uretimSrc));

console.log('\n-- page_bakim_panel.js: arıza "Tamamlandı" ile kapatılabiliyor, makina eski durumuna dönüyor --');
t('Envanter listesi artık arizali makinaları da gösteriyor',
  /const makinalar = tumMakinalar\.filter\(m => m\.durum === 'aktif' \|\| m\.durum === 'arizali'\);/.test(bakimSrc));
t('Envanter tablosunda ⚠ Arızalı rozeti var',
  /m\.durum === 'arizali' \? ' <span class="pill pill-red" style="font-size:9px">⚠ Arızalı<\/span>' : ''/.test(bakimSrc));
t('islemde durumundaki arızalar için Tamamlandı butonu render ediliyor',
  /a\.durum === 'islemde' \? `<button class="btn btn-sm btn-green bk-ariza-tamamla" data-id="\$\{a\.id\}">✓ Tamamlandı<\/button>` : ''/.test(bakimSrc));
t('bk-ariza-tamamla handler tanımlı',
  /document\.querySelectorAll\('\.bk-ariza-tamamla'\)\.forEach\(b => b\.onclick = async \(\) => \{/.test(bakimSrc));
t('kapatılınca durum tamamlandi olarak yazılıyor',
  /a\.durum = 'tamamlandi';/.test(bakimSrc));
t('AYNI makinada başka açık arıza var mı kontrol ediliyor',
  /const digerAcikArizalar = arizaKayitlari\.filter\(x => x\.id !== a\.id && x\.makinaId === a\.makinaId && \(x\.durum === 'bekliyor' \|\| x\.durum === 'islemde'\)\);/.test(bakimSrc));
t('başka açık arıza yoksa makina önceki durumuna (veya aktif) dönüyor',
  /makina\.durum = makina\.oncekiDurumArizaOncesi \|\| 'aktif';/.test(bakimSrc));
t('oncekiDurumArizaOncesi temizleniyor',
  /delete makina\.oncekiDurumArizaOncesi;/.test(bakimSrc));

console.log('\n-- page_hat_takip.js: hattaki arızalı makinalar için uyarı bandı var --');
t('hattaki makinalar önce filtreleniyor (tek geçiş)',
  /const hattaki = makinalar\.filter\(m => \(m\.hat \|\| m\.konum \|\| ''\) === seciliHat\);/.test(hatTakipSrc));
t('arizali makinalar ayrıca süzülüyor',
  /const arizaliMakinalar = hattaki\.filter\(m => m\.durum === 'arizali'\);/.test(hatTakipSrc));
t('ARIZALI MAKİNA banner\'ı var',
  /⛔ ARIZALI MAKİNA — bu hattaki \$\{arizaliMakinalar\.length\} makina şu anda arızalı, iş ataması yapılmamalı/.test(hatTakipSrc));
t('bakım alarmı bandı hâlâ korunuyor (regresyon yok)',
  /🔔 BAKIM ALARMI — bu hattaki \$\{alarmlar\.length\} makinanın rutin bakım süresi doldu/.test(hatTakipSrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
