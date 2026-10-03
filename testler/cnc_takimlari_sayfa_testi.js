// ── CNC Takım Kütüphanesi — ebatlama/frezeleme ayrımı kaynak metin kontrolü ──
// GERÇEK İHTİYAÇ: "ebatlama için bir takım, frezeleme için farklı
// kalınlıklarda ve kafa yapısında takımları tanımlayabilelim." Bu testler,
// (a) iki takım ailesinin AYRI alan setleriyle tanımlanabildiğini, (b) eski
// (takımTipi alanı olmayan) kayıtların GERİYE UYUMLU "frezeleme" sayıldığını,
// (c) doğrulamanın her ailede DOĞRU alana (kalınlık vs çap) baktığını
// doğrular.
const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_cnc_takimlari.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- İKİ TAKIM AİLESİ: frezeleme (freze bıçağı) vs ebatlama (testere bıçağı) --');
t('takimTipiOku geriye uyumlu — alan yoksa "frezeleme" sayılır', kaynak.includes("k.takimTipi || 'frezeleme'"));
t('form Takım Ailesi seçici frezeleme/ebatlama arasında geçiş yapıyor', kaynak.includes("id=\"f-tip\"") && kaynak.includes("value=\"ebatlama\""));
t('tip değişince frezeleme/ebatlama alan blokları karşılıklı gizlenip gösteriliyor',
  kaynak.includes('f-frezeleme-alanlari') && kaynak.includes('f-ebatlama-alanlari') &&
  kaynak.includes("document.getElementById('f-tip').onchange"));

console.log('\n-- EBATLAMA (testere) alanları --');
t('ebatlama takımı KALINLIK (kerf) alanı tutuyor', kaynak.includes('f-eb-kalinlik') && kaynak.includes('kalinlikMm'));
t('ebatlama takımı diş yapısı NOTU (opsiyonel) tutuyor', kaynak.includes('disYapisiAciklama'));
t('ebatlama kaydında profil/bull/v alanları YOK (frezeleme-özel alanlar ebatlamaya karışmıyor)',
  /takimTipi === .ebatlama.[\s\S]{0,400}kalinlikMm/.test(kaynak) &&
  !/takimTipi === .ebatlama.[\s\S]{0,400}profilTipi/.test(kaynak));
t('ebatlama için kalınlık (>0) zorunlu — boş/0 geçersiz', kaynak.includes('Ebatlama takımı için geçerli bir kalınlık/kesim payı (>0) zorunlu'));

console.log('\n-- FREZELEME (freze bıçağı) alanları — mevcut davranış korunuyor --');
t('frezeleme takımı için çap (>0) zorunlu', kaynak.includes('Frezeleme takımı için geçerli bir çap (>0) zorunlu'));
t('frezeleme profil tipleri (düz/bull/ball/v/özel) hâlâ destekleniyor', ['duz', 'bull', 'ball', 'v', 'ozel'].every(p => kaynak.includes(`'${p}'`)));

console.log('\n-- LİSTE/FİLTRE: iki aile tabloda ayırt edilebiliyor --');
t('Tip filtresi (Hepsi/Frezeleme/Ebatlama) var', kaynak.includes("data-tip=\"frezeleme\"") && kaynak.includes("data-tip=\"ebatlama\""));
t('Profil filtresi SADECE frezeleme takımlarına uygulanıyor (ebatlamada profilTipi yok)',
  kaynak.includes("takimTipiOku(k) === 'frezeleme' && k.profilTipi === filterProfil"));
t('tabloda takım tipi rozeti (pill) gösteriliyor', kaynak.includes("tip === 'ebatlama' ? 'pill-amber' : 'pill-blue'"));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
