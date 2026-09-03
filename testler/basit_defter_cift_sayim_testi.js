// BULGU: page_muhasebe_panel.js renderDefterTab (Basit Usul Defter sekmesi)
// hem muhasebeKayitlari (fatura kesilince TAHAKKUK esasıyla oluşan
// "satis_faturasi" geliri) hem tahsilatlar (aynı satışın DAHA SONRA tahsil
// edilmesiyle oluşan kayıt) toplamını AYRI AYRI "gelir" satırı olarak
// topluyordu — aynı satış İKİ KEZ sayılıyordu, kümülatif bakiye şişiyordu.
// Gelir-Gider Özeti'ndeki (renderOzetTab) doğru mantık — YALNIZCA
// muhasebeKayitlari (tahakkuk esası) — Defter sekmesine de uygulandı.
// page_muhasebe_panel.js Store/DOM'a derinden bağlı olduğu için (diğer
// page_* testleriyle aynı desende) kaynak kod üzerinde regex doğrulama
// yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_muhasebe_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- renderDefterTab artık tahsilatlar\'ı gelire İKİNCİ KEZ eklemiyor --');
t('renderDefterTab artık tek parametre alıyor (tahsilatlar parametresi kaldırıldı)',
  /function renderDefterTab\(muhasebeKayitlari\) \{/.test(src));
t('tahsilatlar.map(...) ile ikinci bir "gelir" satırı ARTIK OLUŞTURULMUYOR',
  !/tahsilatlar\.map\(t => \(\{ tarih: t\.tarih, aciklama: 'Tahsilat: '/.test(src));
t('tumKayitlar artık YALNIZCA muhasebeKayitlari\'ndan geliyor',
  /const tumKayitlar = muhasebeKayitlari\s*\n\s*\.map\(k => \(\{ tarih: k\.tarih, aciklama: k\.aciklama, tip: k\.tip, tutar: k\.tutar, kategori: k\.kategori \}\)\)\s*\n\s*\.sort\(/.test(src));

console.log('\n-- Çağıran taraf da güncellendi --');
t('render() içinde renderDefterTab artık tahsilatlar olmadan çağrılıyor',
  /content\.innerHTML = renderDefterTab\(muhasebeKayitlari\);/.test(src));

console.log('\n-- Gelir-Gider Özeti (referans doğru mantık) hâlâ sadece muhasebeKayitlari kullanıyor (regresyon yok) --');
t('renderOzetTab hâlâ tek parametre (muhasebeKayitlari) alıyor — çift sayım riski yok',
  /function renderOzetTab\(muhasebeKayitlari\) \{/.test(src));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
