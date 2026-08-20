// ════════════════════════════════════════════════════════════════════════════
// SİSTEM DENETİMİ — "tuş işlevsiz" hatalarını yakalar
// ────────────────────────────────────────────────────────────────────────────
// İki sınıf hatayı arar:
//  1) BAĞLANMAMIŞ BUTON: bir <button id="x"> tanımlanmış ama hiçbir yerde
//     handler bağlanmamış → tıklayınca hiçbir şey olmaz.
//  2) KORUMASIZ KAYDET: async kaydetme handler'ı try/catch içinde değilse,
//     bir hata oluştuğunda tıklama SESSİZCE ölür (kullanıcı "çalışmıyor" der).
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const KOK = path.join(__dirname, '..');

let gecti = 0, kaldi = 0;
const t = (ad, ok) => { if (ok) { gecti++; } else { kaldi++; console.log('  KALDI ' + ad); } };

const dosyalar = fs.readdirSync(KOK)
  .filter(f => f.endsWith('.js') && !['three.min.js', 'build.js', 'sw.js'].includes(f));

// ── 1) Bağlanmamış buton taraması ──────────────────────────────────────────
const bagsizRapor = [];
for (const f of dosyalar) {
  const s = fs.readFileSync(path.join(KOK, f), 'utf8');
  const ids = new Set();
  const re = /<button[^>]*\sid="([^"${]+)"/g;
  let m;
  while ((m = re.exec(s))) ids.add(m[1]);

  const bagsiz = [];
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Desenler: getElementById('x'), querySelector('#x'), $('x'), byId('x')
    const bagli = new RegExp(
      "getElementById\\(['\"]" + esc + "['\"]\\)" +
      "|querySelector\\(['\"]#" + esc + "['\"]\\)" +
      "|\\$\\(['\"]" + esc + "['\"]\\)" +
      "|byId\\(['\"]" + esc + "['\"]\\)"
    ).test(s);
    if (!bagli) bagsiz.push(id);
  }
  if (bagsiz.length) bagsizRapor.push(f + ': ' + bagsiz.join(', '));
}
t('Bağlanmamış buton yok' + (bagsizRapor.length ? '\n    → ' + bagsizRapor.join('\n    → ') : ''), bagsizRapor.length === 0);

// ── 2) Kaydetme handler'ları korumalı mı (sessiz hata olmasın) ─────────────
// Kritik kaydetme butonları: kaydedip kapatan, kullanıcının en çok kullandığı akışlar.
const kritikKaydetler = [
  { dosya: 'page_hammadde.js', id: 'f-save', ad: 'Hammadde Kaydet/Güncelle' },
  { dosya: 'page_cari_panel.js', id: 'tf-save', ad: 'Tedarikçi Kaydet' },
  { dosya: 'page_cari_panel.js', id: 'mf-save', ad: 'Müşteri Kaydet' },
];
for (const k of kritikKaydetler) {
  const s = fs.readFileSync(path.join(KOK, k.dosya), 'utf8');
  const i = s.indexOf(`getElementById('${k.id}').onclick`);
  if (i < 0) { t(k.ad + ' handler bulundu', false); continue; }
  // Handler gövdesinin ilk 400 karakterinde try var mı?
  const govde = s.slice(i, i + 400);
  t(k.ad + ' hata koruması (try/catch) var', /\btry\s*\{/.test(govde));
}

// ── 3) Global sessiz hata avcısı kurulu mu ────────────────────────────────
const appJs = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
t('Global hata dinleyicisi (error) kurulu', /addEventListener\('error'/.test(appJs));
t('Global hata dinleyicisi (unhandledrejection) kurulu', /addEventListener\('unhandledrejection'/.test(appJs));

console.log('\nSONUC: ' + gecti + ' gecti, ' + kaldi + ' kaldi');
process.exit(kaldi ? 1 : 0);
