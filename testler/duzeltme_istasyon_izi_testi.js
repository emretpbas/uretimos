// BULGU (T3-22): page_uretim_panel.js:duzeltmeIsleModal (bitmiş ürün kalite
// reddi düzeltmesi) hiçbir istasyon kartı (istasyonIsleri) oluşturmuyor/
// güncellemiyordu — yarımamül düzeyindeki red akışlarından
// (page_hat_takip.js/page_hat_terminal.js, ikisi de "kim/hangi istasyon"
// izini tam istasyon kartlarıyla tutuyor) KOPUKtu. Yalnızca
// App.currentRoleLabel() ile ROL adı tutuluyordu — kişi/istasyon bilgisi
// hiç yoktu.
// Düzeltme: en azından bir iz bırakan iki ZORUNLU alan eklendi — "İşlemi
// Yapan (Ad Soyad)" ve "İstasyon/Bölüm" — duzeltmeGiderleri kaydına
// yazılıyor ve Yönetim Raporlama'daki "Kalite Düzeltme Giderleri"
// tablosunda gösteriliyor.
// page_uretim_panel.js/page_yonetim_raporlama.js Store/DOM'a derinden
// bağlı olduğu için (diğer page_* testleriyle aynı desende) kaynak kod
// üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const uretimSrc = fs.readFileSync(path.join(__dirname, '..', 'page_uretim_panel.js'), 'utf8');
const raporSrc = fs.readFileSync(path.join(__dirname, '..', 'page_yonetim_raporlama.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- Form: İşlemi Yapan ve İstasyon/Bölüm alanları eklendi --');
t('İşlemi Yapan input alanı (dz-yapan) var',
  /<input class="finput" id="dz-yapan" placeholder="Ad Soyad" value="\$\{App\.escapeHtml\(yapanDeger\)\}">/.test(uretimSrc));
t('İstasyon\/Bölüm input alanı (dz-istasyon) var',
  /<input class="finput" id="dz-istasyon" placeholder="örn\. Montaj-2, Boyahane" value="\$\{App\.escapeHtml\(istasyonDeger\)\}">/.test(uretimSrc));
t('ciz() re-render\'da mevcut değerler kaybolmuyor (dk ile aynı desen: oku-sonra-yaz)',
  /const yapanDeger = \(body\.querySelector\('#dz-yapan'\) \|\| \{\}\)\.value \|\| '';/.test(uretimSrc) &&
  /const istasyonDeger = \(body\.querySelector\('#dz-istasyon'\) \|\| \{\}\)\.value \|\| '';/.test(uretimSrc));

console.log('\n-- Kaydet: iki alan da ZORUNLU, kayda yazılıyor --');
t('boşsa kayıt reddediliyor',
  /if \(!islemiYapan \|\| !istasyon\) \{ App\.toast\('İşlemi yapan ve istasyon\/bölüm zorunlu', 'err'\); return; \}/.test(uretimSrc));
t('duzeltmeGiderleri kaydına islemiYapan ve istasyon yazılıyor',
  /islemiYapan, istasyon,\s*\n\s*kaydeden: App\.currentRoleLabel\(\)/.test(uretimSrc));

console.log('\n-- Yönetim Raporlama: yeni alanlar tabloda gösteriliyor --');
t('tablo başlığına İşlemi Yapan / İstasyon-Bölüm sütunları eklendi',
  /<th>İşlemi Yapan<\/th><th>İstasyon\/Bölüm<\/th>/.test(raporSrc));
t('satırlarda g.islemiYapan ve g.istasyon gösteriliyor',
  /App\.escapeHtml\(g\.islemiYapan \|\| '—'\)/.test(raporSrc) && /App\.escapeHtml\(g\.istasyon \|\| '—'\)/.test(raporSrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
