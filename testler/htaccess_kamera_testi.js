// .htaccess güvenlik başlıklarının kamerayı ENGELLEMEDİĞİNİ doğrular.
// v44'te camera=() yazıp kamerayı kazara kapatmıştık; bu test onu yakalar.
const fs = require('fs');
const path = require('path');
const ht = fs.readFileSync(path.join(__dirname, '..', '.htaccess'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('-- Permissions-Policy kamera --');
// camera=() veya camera=(...) YOKken self yoksa hata. camera=(self) olmalı.
const pp = (ht.match(/Permissions-Policy\s+"([^"]+)"/) || [])[1] || '';
t('Permissions-Policy tanımlı', !!pp);
t('camera=() ile TAMAMEN kapatılmamış (self içeriyor)', /camera=\(self\)/.test(pp));
t('camera=() (boş) YOK — bu kamerayı öldürür', !/camera=\(\)/.test(pp));

console.log('-- CSP kamera/medya --');
const csp = (ht.match(/Content-Security-Policy\s+"([^"]+)"/) || [])[1] || '';
t('CSP tanımlı', !!csp);
t('media-src blob içeriyor (kamera fotoğraf/video)', /media-src[^;]*blob:/.test(csp));

console.log('-- Güvenlik başlıkları korunmuş --');
t('HSTS var', /Strict-Transport-Security/.test(ht));
t('X-Frame-Options var', /X-Frame-Options/.test(ht));
t('X-Content-Type-Options var', /X-Content-Type-Options/.test(ht));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
