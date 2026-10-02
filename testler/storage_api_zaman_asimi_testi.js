// ── apiFetch — sunucu yanıt vermezse SONSUZA KADAR beklenmemeli ────────────
// GERÇEK ÜRETİM SORUNU: "Excelden Reçete İçe Aktar" akışında kullanıcı
// "basıldığı belli ama reçeteyi kaydetmiyor/güncellemiyor" diye bildirdi;
// sonraki testte ekranın "Kaydediliyor: Yarı Mamül/Alt Montaj/Paket..."
// yazısında 2 dakikadan fazla, HİÇBİR hata/değişiklik olmadan tıkılı
// kaldığı doğrulandı. Kök neden: tarayıcının fetch()'i için varsayılan bir
// zaman aşımı YOK — sunucu (1 GB RAM'lı paylaşımlı barındırma) büyük bir
// koleksiyonu (96.000+ yarımamül, tek JSON blob) 'patch' ucunda işlerken
// donar/çok yavaşlarsa istek sonsuza kadar asılı kalır, ne hata gelir ne
// de (zaten var olan) patchUygulaTekrarli yeniden deneme mekanizması
// devreye girer. Bu test, apiFetch'in artık AbortController ile bir
// zaman aşımı uyguladığını ve zaman aşımında ANLAŞILIR bir hata
// fırlattığını kaynak metin üzerinden doğrular.

const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'storage.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- KOD KONTROLU: apiFetch artık AbortController ile zaman aşımı uyguluyor --');
t('AbortController kullanılarak bir zaman aşımı sinyali oluşturuluyor',
  kaynak.includes('new AbortController()') && kaynak.includes('opts.signal = denetleyici.signal;'));
t('zaman aşımı süresi tanımlı bir sabitte (ISTEK_ZAMAN_ASIMI_MS) tutuluyor, sihirli sayı değil',
  /const ISTEK_ZAMAN_ASIMI_MS = \d+;/.test(kaynak));
t('zaman aşımında fetch() iptal ediliyor (denetleyici.abort())',
  kaynak.includes('denetleyici.abort()'));
t('zaman aşımı sonucu ANLAŞILIR bir Türkçe hata mesajıyla fırlatılıyor (sessizce yutulmuyor)',
  kaynak.includes("Sunucu zamanında yanıt vermedi"));
t('zamanlayıcı her durumda (başarı/hata) temizleniyor (clearTimeout, sızıntı yok)',
  kaynak.includes('if (zamanlayici) clearTimeout(zamanlayici);'));
t('401 kontrolü zaman aşımı eklendikten SONRA da korunuyor (oturum düşürme davranışı bozulmadı)',
  kaynak.includes("if (res.status === 401) { oturumDustu();"));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
