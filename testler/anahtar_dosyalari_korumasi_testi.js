// API ANAHTAR DOSYALARI — İKİNCİ KATMAN WEB KORUMASI
// ────────────────────────────────────────────────────────────────────────────
// anthropic_anahtari.php, baidu_anahtari.php, google_anahtari.php,
// google_arama_anahtari.php — dördü de api.php tarafından aynı desenle
// (önce ortam değişkeni, sonra bu yerel dosya) okunur ve .gitignore'da
// aynı şekilde listelenir (git/FTP deploy hiçbirini görmez). Yalnızca
// Anthropic'inki .htaccess'te FilesMatch ile korunuyordu — diğer üçü
// PHP çalıştırma yanlışlıkla bozulursa çıplak kalırdı. Bu test dördünün
// de AYNI ikinci koruma katmanına sahip olduğunu doğrular.
const fs = require('fs'), path = require('path');
const ht = fs.readFileSync(path.join(__dirname, '..', '.htaccess'), 'utf8');
const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const ANAHTAR_DOSYALARI = ['anthropic_anahtari.php', 'baidu_anahtari.php', 'google_anahtari.php', 'google_arama_anahtari.php'];

console.log('-- .htaccess: dördü de FilesMatch ile web erişiminden korunuyor --');
const blok = (ht.match(/<FilesMatch "\^\(anthropic_anahtari[^>]*>\s*Require all denied\s*<\/FilesMatch>/) || [])[0] || '';
t('koruma bloğu bulundu', !!blok);
ANAHTAR_DOSYALARI.forEach(dosya => {
  const ad = dosya.replace('.php', '');
  t(`${dosya} FilesMatch deseninde geçiyor`, new RegExp('\\b' + ad + '\\b').test(blok));
});

console.log('\n-- .gitignore: dördü de listelenmiş (deploy asla üzerine yazmaz) --');
ANAHTAR_DOSYALARI.forEach(dosya => {
  t(`${dosya} .gitignore\'da`, ht && gi.includes(dosya));
});

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
