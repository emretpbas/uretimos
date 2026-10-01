// ── Renk Eşleştirme Anahtarı ekranı — satır üretimi + canlı eşleşme ─────────
// GERÇEK İHTİYAÇ: aynı (renk, kategori) içinde BİRDEN FAZLA ÖLÇÜ VARYANTI
// olabiliyor — "18mm için bir satır, 30mm için bir satır, 8mm için bir satır
// kullanalım... kenar bandında 0,40*22, 0,40*33, ... 2*54" — bu testler
// page_renk_anahtari.js'in SAF satır üretimi (satirlariUret) ve canlı
// eşleşme (kartlarEslesen) fonksiyonlarını, aynı "fonksiyon çıkar + Function
// ile izole çalıştır" teknikle (bkz. kartlar_hiyerarsi_testi.js) doğrular.

const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_renk_anahtari.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

function fonksiyonCikar(ad) {
  const baslangic = kaynak.indexOf('function ' + ad + '(');
  let derinlik = 0, i = kaynak.indexOf('{', baslangic);
  for (; i < kaynak.length; i++) { const c = kaynak[i]; if (c === '{') derinlik++; if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } } }
  return kaynak.slice(baslangic, i);
}

console.log('\n-- KOD KONTROLU: yeni alanlar/ekranlar tanımlı --');
t('page_hammadde.js: ölçü alanı (f-renk-olcu) eklendi', fs.readFileSync(path.join(__dirname, '..', 'page_hammadde.js'), 'utf8').includes('f-renk-olcu'));
t('page_hammadde.js: sunta/mdf seçilince SADECE plaka hammaddeleri önerilir (kartSecModal tipFiltre ile)', kaynak.includes("tipFiltre: 'plaka'"));
t('page_yarimamul.js: renk etiketi alanları eklendi', fs.readFileSync(path.join(__dirname, '..', 'page_yarimamul.js'), 'utf8').includes('f-renk-kartela'));
t('boya kategorisi HAMMADDE koleksiyonundan, tip=sarf ile aranıyor (gerçek dosyada "LK." öneki renk kodu DEĞİL, LOGO boya kategorisi kodu olduğu doğrulandı)',
  kaynak.includes("boya: { etiket: 'Boya', kaynak: 'hammadde', tipFiltre: 'sarf'"));
t('arama kutusu isimle/kodla filtreleme yapıyor (native select DEĞİL)', kaynak.includes("id=\"ra-ara\"") && !kaynak.includes('id="ra-hm-ara"'));
t('zaten tanımlı bir renge YENİ bir kısaltma eklerken İKİNCİ bir kayıt AÇILMIYOR (var olan kayıt güncelleniyor)',
  kaynak.includes('renkler.find(r => r.renkKodu === kod) || null'));
t('Reçete Yapım Raporu\'ndan gelen önerilen kısaltma otomatik dolduruluyor', kaynak.includes('onerilenKisaltma'));

const izoleKod = [
  "const RenkKartelasi = require('../renk_kartelasi.js');",
  "const KATEGORI_TANIM = " + kaynak.match(/const KATEGORI_TANIM = (\{[\s\S]*?\n  \};)/)[1],
  "const KATEGORI_SIRA = " + kaynak.match(/const KATEGORI_SIRA = (\[[\s\S]*?\]);/)[1] + ';',
  fonksiyonCikar('satirlariUret'),
  fonksiyonCikar('kartlarEslesen'),
  'module.exports = { satirlariUret, kartlarEslesen, KATEGORI_TANIM };'
].join('\n');
fs.writeFileSync(path.join(__dirname, '_renk_anahtari_izole.js'), izoleKod);
const izole = require('./_renk_anahtari_izole.js');
fs.unlinkSync(path.join(__dirname, '_renk_anahtari_izole.js'));

console.log('\n-- satirlariUret: ölçü boyutu olan kategorilerde HER ölçü AYRI satır --');
const satirlar = izole.satirlariUret();
t('toplam satır sayısı doğru (sunta 3 + mdf 3 + pvc_bant 12 + boya 1 + diğer 1 = 20)', satirlar.length === 20);
t('sunta için TAM OLARAK 3 satır (8mm/18mm/30mm)', satirlar.filter(s => s.kategori === 'sunta').length === 3);
t('mdf için TAM OLARAK 3 satır', satirlar.filter(s => s.kategori === 'mdf').length === 3);
t('pvc_bant için TAM OLARAK 12 satır (4 kalınlık × 3 genişlik)', satirlar.filter(s => s.kategori === 'pvc_bant').length === 12);
t('boya için TEK, ölçüsüz satır', satirlar.filter(s => s.kategori === 'boya').length === 1 &&
  satirlar.find(s => s.kategori === 'boya').olcu === '');
t('diğer için TEK, ölçüsüz satır', satirlar.filter(s => s.kategori === 'diger').length === 1 &&
  satirlar.find(s => s.kategori === 'diger').olcu === '');
t('sunta satırlarında 8mm/18mm/30mm ÜÇÜ de var, başka bir şey YOK',
  JSON.stringify(satirlar.filter(s => s.kategori === 'sunta').map(s => s.olcu).sort()) === JSON.stringify(['18mm', '30mm', '8mm']));
t('pvc_bant satırlarında "0,40x22" ve "2x54" uçları mevcut',
  satirlar.some(s => s.kategori === 'pvc_bant' && s.olcu === '0,40x22') &&
  satirlar.some(s => s.kategori === 'pvc_bant' && s.olcu === '2x54'));

console.log('\n-- kartlarEslesen: ölçü boyutu KARIŞTIRILMIYOR --');
const kartlar = [
  { id: 'A', renkKartelaKodu: '24', malzemeKategorisi: 'sunta', renkOlcuEtiketi: '8mm' },
  { id: 'B', renkKartelaKodu: '24', malzemeKategorisi: 'sunta', renkOlcuEtiketi: '18mm' },
  { id: 'C', renkKartelaKodu: '24', malzemeKategorisi: 'mdf', renkOlcuEtiketi: '18mm' },
  { id: 'D', renkKartelaKodu: '24', malzemeKategorisi: 'boya' }
];
t('8mm sunta SADECE A ile eşleşir', kartlarEslesenSonuc(kartlar, '24', 'sunta', '8mm').map(x => x.id).join(',') === 'A');
t('18mm sunta SADECE B ile eşleşir (mdf ile karışmaz)', kartlarEslesenSonuc(kartlar, '24', 'sunta', '18mm').map(x => x.id).join(',') === 'B');
t('18mm mdf SADECE C ile eşleşir', kartlarEslesenSonuc(kartlar, '24', 'mdf', '18mm').map(x => x.id).join(',') === 'C');
t('30mm sunta için HİÇ eşleşme yok (tanımsız)', kartlarEslesenSonuc(kartlar, '24', 'sunta', '30mm').length === 0);
t('ölçüsüz boya kategorisi doğru eşleşir', kartlarEslesenSonuc(kartlar, '24', 'boya', '').map(x => x.id).join(',') === 'D');
function kartlarEslesenSonuc(liste, renk, kat, olcu) { return izole.kartlarEslesen(liste, renk, kat, olcu); }

console.log('\n-- KATEGORI_TANIM: her kategorinin DOĞRU kaynaktan arandığı --');
t('sunta/mdf/pvc_bant/diğer -> hammadde koleksiyonundan', ['sunta', 'mdf', 'pvc_bant', 'diger'].every(k => izole.KATEGORI_TANIM[k].kaynak === 'hammadde'));
t('boya -> hammadde koleksiyonundan, SADECE sarf tipi (LK. öneki LOGO kategori kodu, renk kodu değil)',
  izole.KATEGORI_TANIM.boya.kaynak === 'hammadde' && izole.KATEGORI_TANIM.boya.tipFiltre === 'sarf');
t('sunta/mdf SADECE plaka tipi hammaddeyi önerir', izole.KATEGORI_TANIM.sunta.tipFiltre === 'plaka' && izole.KATEGORI_TANIM.mdf.tipFiltre === 'plaka');
t('pvc_bant SADECE kenar_bandi tipi hammaddeyi önerir', izole.KATEGORI_TANIM.pvc_bant.tipFiltre === 'kenar_bandi');

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
