// ── Ölçü Eşleştirme Anahtarı sayfası — kaynak metin kontrolü ────────────────
// page_renk_anahtari.js testleriyle AYNI desende (DOM/Store bağımlı kod).
const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_olcu_anahtari.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- KOD KONTROLU: sayfa Store.olcuEslestirmeAnahtari koleksiyonunu kullanıyor --');
t('sayfa Store.olcuEslestirmeAnahtari.all() ile aileleri okuyor', kaynak.includes('Store.olcuEslestirmeAnahtari.all()'));
t('yeni aile Store.olcuEslestirmeAnahtari.upsert ile kaydediliyor', kaynak.includes('Store.olcuEslestirmeAnahtari.upsert(aile)'));
t('aile silme Store.olcuEslestirmeAnahtari.remove ile yapılıyor', kaynak.includes('Store.olcuEslestirmeAnahtari.remove(aileId)'));
t('rol kontrolü ARGE/Teknik Ofis/Yönetim ile sınırlı (hassas üretim verisi)', kaynak.includes("const ROLLER = ['admin', 'arge', 'teknik_ofis', 'yonetim']"));
t('ölçü eklerken hem ölçü hem kod parçası zorunlu tutuluyor', kaynak.includes("if (!deger || !kodParcasi)"));
t('aynı ölçü veya aynı kod parçası tekrar eklenmeye karşı korunuyor (mükerrer kayıt önlenir)',
  kaynak.includes("aile.olculer.some(o => String(o.olcu) === deger)") &&
  kaynak.includes("aile.olculer.some(o => o.kodParcasi === kodParcasi)"));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
