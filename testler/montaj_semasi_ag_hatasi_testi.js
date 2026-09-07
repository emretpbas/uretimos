// MONTAJ ŞEMASI — AĞ HATASI ÇEVİRİSİ (kaynak doğrulama)
// ────────────────────────────────────────────────────────────────────────────
// Kullanıcı gerçek kullanımda "✕ Failed to fetch" gibi bağlamsız, İngilizce
// bir tarayıcı hatasıyla karşılaştı — bu, sunucudan HİÇBİR yanıt alınamadığı
// (bağlantı koptu / zaman aşımı / geçici sunucu sorunu) anlamına gelir, api.php
// KENDİSİ döndürdüğü (zaten Türkçe, açıklayıcı) hatalardan FARKLIDIR. Bu test,
// page_montaj_semasi.js'in artık bu tür ham ağ hatalarını agHatasiCevirMontaj()
// ile anlaşılır bir mesaja çevirdiğini ve api.php'nin KENDİ hatalarını
// OLDUĞU GİBİ bıraktığını (üstüne yazmadığını) doğrular.
//
// page_montaj_semasi.js Store/DOM'a bağlı olduğu için (diğer page_* testleriyle
// AYNI desende — bkz. swood_ice_aktarim_testi.js üstündeki açıklama) doğrudan
// çağrılamaz; kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_montaj_semasi.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- agHatasiCevirMontaj: fonksiyon ve kullanım --');
t('fonksiyon tanımlı', /function agHatasiCevirMontaj\(err\) \{/.test(src));
t('"Failed to fetch"/NetworkError/"Load failed" yakalanıyor',
  /Failed to fetch\|NetworkError\|Load failed/.test(src));
t('anlaşılır, olası sebep sıralayan bir mesaj döndürüyor', /Sunucuya ulaşılamadı/.test(src));
t('api.php\'nin KENDİ hata mesajı OLDUĞU GİBİ geçiyor (üstüne yazılmıyor)', /return m;\s*\n\s*\}/.test(src));

console.log('\n-- Üç sunucu tabanlı okuma yöntemi de bu çeviriyi kullanıyor --');
// Yalnızca api.php'ye AĞ ÜZERİNDEN giden 3 yöntem (AI/Baidu/Google) hedeflenir
// — dosyaSecildi() (pdf.js önizleme hatası) ve ocrIleOku() (tamamen istemci
// içi Tesseract, ağ çağrısı yapmaz) bilerek DIŞARIDA bırakılır, kapsamları
// farklıdır.
const cagriSayisi = (src.match(/App\.escapeHtml\(agHatasiCevirMontaj\(err\)\)/g) || []).length;
t('aiIleOku, baiduIleOku, googleIleOku hepsi agHatasiCevirMontaj çağırıyor (3 kez)', cagriSayisi === 3);

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
