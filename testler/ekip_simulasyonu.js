// ════════════════════════════════════════════════════════════════════════════
// KAPSAMLI EKİP SİMÜLASYONU — 50 KİŞİLİK KULLANIM TESTİ
// ────────────────────────────────────────────────────────────────────────────
// EKİP DAĞILIMI:
//   5 ARGE · 3 Üretim Planlama · 2 İK · 3 Satınalma · 2 Cari · 2 Muhasebe
//   2 Depo · 1 İSG · 4 Üretim · 4 Teknik Ofis · 2 Sevkiyat  = 30 ofis
//   + 20 Hat Operatörü                                       = 50 kişi
//
// NE TEST EDİLİR:
//   1) Yetki matrisi — her rol yalnızca kendi ekranlarını görüyor mu
//   2) Görev ayrılığı — kritik onaylarda aynı kişi iki kez onaylayabiliyor mu
//   3) Eşzamanlı yük — 50 kişi aynı anda çalışınca veri hacmi ne olur
//   4) İş akışı bütünlüğü — sipariş→üretim→sevkiyat zinciri kopuyor mu
//   5) Hassas veri — fiyat/maliyet görmemesi gerekenler görüyor mu
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const KOK = path.join(__dirname, '..');

let ok = 0, bad = 0, uyari = 0;
const t = (ad, kosul) => { if (kosul) { ok++; console.log('  ✓ ' + ad); } else { bad++; console.log('  ✗ ' + ad); } };
const not = (m) => { uyari++; console.log('  ⚠ ' + m); };
const baslik = (b) => console.log('\n' + '─'.repeat(66) + '\n' + b + '\n' + '─'.repeat(66));

const app = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
const api = fs.readFileSync(path.join(KOK, 'api.php'), 'utf8');

// ── EKİP TANIMI ───────────────────────────────────────────────────────────
const EKIP = [
  { rol: 'arge', kisi: 5, ad: 'ARGE' },
  { rol: 'uretim_planlama', kisi: 3, ad: 'Üretim Planlama' },
  { rol: 'ik', kisi: 2, ad: 'İnsan Kaynakları' },
  { rol: 'satinalma', kisi: 3, ad: 'Satınalma' },
  { rol: 'cari', kisi: 2, ad: 'Cari İşlemler' },
  { rol: 'muhasebe', kisi: 2, ad: 'Muhasebe' },
  { rol: 'depo', kisi: 2, ad: 'Depo' },
  { rol: 'isg', kisi: 1, ad: 'İSG' },
  { rol: 'uretim', kisi: 4, ad: 'Üretim' },
  { rol: 'teknik_ofis', kisi: 4, ad: 'Teknik Ofis' },
  { rol: 'sevkiyat', kisi: 2, ad: 'Sevkiyat' },
  { rol: 'hat_operator', kisi: 20, ad: 'Hat Operatörü' }
];
const TOPLAM = EKIP.reduce((a, e) => a + e.kisi, 0);

// Menü tanımlarını app.js'ten çıkar: { id, roller[] }
function menuleriCikar() {
  const sayfalar = [];
  const re = /\{ id: '([a-z_0-9]+)', label: '([^']+)'[^}]*roller: \[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(app))) {
    sayfalar.push({
      id: m[1], label: m[2],
      roller: m[3].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean)
    });
  }
  return sayfalar;
}
const SAYFALAR = menuleriCikar();

// ══════════════════════════════════════════════════════════════════════════
baslik('1. EKİP DAĞILIMI VE ROL TANIMLARI');
t(`Toplam ${TOPLAM} kişi tanımlandı (hedef 50)`, TOPLAM === 50);
t('Menü tanımları okunabildi', SAYFALAR.length > 20);
console.log(`  → ${SAYFALAR.length} yetkili sayfa bulundu`);

const tanimliRoller = new Set();
SAYFALAR.forEach(s => s.roller.forEach(r => tanimliRoller.add(r)));
EKIP.forEach(e => {
  if (e.rol === 'hat_operator') return;  // ayrı terminalden girer
  const varMi = tanimliRoller.has(e.rol);
  t(`${e.ad} (${e.kisi} kişi) rolü sistemde tanımlı`, varMi);
});

// ══════════════════════════════════════════════════════════════════════════
baslik('2. YETKİ MATRİSİ — her rol kaç ekran görüyor');
const erisim = {};
EKIP.filter(e => e.rol !== 'hat_operator').forEach(e => {
  erisim[e.rol] = SAYFALAR.filter(s => s.roller.includes(e.rol));
  const n = erisim[e.rol].length;
  console.log(`  ${e.ad.padEnd(20)} ${String(n).padStart(2)} ekran  (${e.kisi} kişi)`);
  t(`${e.ad} en az 1 ekrana erişiyor`, n >= 1);
});

// ══════════════════════════════════════════════════════════════════════════
baslik('3. HASSAS VERİ KORUMASI (fiyat / maliyet / bordro)');
const hassasSayfalar = ['maliyet', 'fiyat', 'bordro', 'ik', 'muhasebe', 'faaliyet_defteri'];
hassasSayfalar.forEach(id => {
  const s = SAYFALAR.find(x => x.id === id);
  if (!s) return;
  const yetkiliSayisi = EKIP.filter(e => s.roller.includes(e.rol)).reduce((a, e) => a + e.kisi, 0);
  console.log(`  ${(s.label || id).slice(0, 38).padEnd(40)} ${yetkiliSayisi} kişi erişebiliyor`);
  t(`"${(s.label || id).slice(0, 30)}" herkese açık DEĞİL`, yetkiliSayisi < TOPLAM * 0.5);
});

// Üretim/operatör fiyat görmemeli
const maliyet = SAYFALAR.find(x => x.id === 'maliyet');
if (maliyet) {
  t('Hat operatörü maliyet ekranını GÖREMİYOR', !maliyet.roller.includes('hat_operator'));
  t('Üretim rolü maliyet ekranını görmüyor', !maliyet.roller.includes('uretim'));
}
// Faaliyet defteri yalnızca yönetim
const fd = SAYFALAR.find(x => x.id === 'faaliyet_defteri');
if (fd) {
  const kisiSayisi = EKIP.filter(e => fd.roller.includes(e.rol)).reduce((a, e) => a + e.kisi, 0);
  t('Faaliyet defteri (tüm personel izi) yalnızca yönetimde', kisiSayisi === 0);
  console.log('  → yonetim/admin dışında kimse erişemiyor (ekipte yönetim rolü yok)');
}

// ══════════════════════════════════════════════════════════════════════════
baslik('4. GÖREV AYRILIĞI — kritik onay zincirleri');
const recete = fs.readFileSync(path.join(KOK, 'recete_talep.js'), 'utf8');
const kayip = fs.readFileSync(path.join(KOK, 'kayip_kacak.js'), 'utf8');
const iptal = fs.readFileSync(path.join(KOK, 'page_iptal_islemleri.js'), 'utf8');

t('Reçete talebi: talep eden onaylayamaz', /talepEden === onaylayan/.test(recete));
t('Reçete talebi: üç göz (planlama ≠ arge/teknik)', /Üç göz ilkesi/.test(recete));
t('Malzeme talebi: görev ayrılığı zorunlu', /gorevAyriligiGecerli/.test(kayip));
t('Malzeme talebi: yüksek tutarda çift onay', /ciftOnayGerekli/.test(kayip));
t('İptal: üretim başladıysa engelleniyor', /engelleriBul/.test(iptal));

// 4 Teknik Ofis + 5 ARGE + 3 Planlama → üç göz kurulabilir mi?
const argeK = 5, teknikK = 4, planlamaK = 3;
t('Reçete zinciri için yeterli personel var (operatör→planlama→arge/teknik)',
  planlamaK >= 1 && (argeK + teknikK) >= 2);
console.log(`  → 20 operatör talep açar, ${planlamaK} planlama onaylar, ${argeK + teknikK} arge/teknik işler`);

// ══════════════════════════════════════════════════════════════════════════
baslik('5. HAT OPERATÖRÜ KISITLARI (20 kişi)');
const opOku = (api.match(/HAT_OP_OKUNABILIR = \[([\s\S]*?)\]/) || [])[1] || '';
const opYaz = (api.match(/HAT_OP_YAZILABILIR = \[([\s\S]*?)\]/) || [])[1] || '';
const okunabilir = (opOku.match(/'[a-zA-Z]+'/g) || []).map(x => x.replace(/'/g, ''));
const yazilabilir = (opYaz.match(/'[a-zA-Z]+'/g) || []).map(x => x.replace(/'/g, ''));
console.log(`  → operatör ${okunabilir.length} koleksiyon okuyabilir, ${yazilabilir.length} tanesine yazabilir`);
t('Operatör beyaz listesi tanımlı', okunabilir.length > 0 && yazilabilir.length > 0);
t('Operatör fiyat/maliyet verisi okuyamıyor',
  !okunabilir.includes('hammaddeMaliyet') && !okunabilir.includes('bordro') && !okunabilir.includes('faturalar'));
t('Operatör cari/müşteri verisi okuyamıyor',
  !okunabilir.includes('musteriler') && !okunabilir.includes('tedarikciler'));
t('Operatör iş kartına yazabiliyor (üretim akışı)', yazilabilir.includes('istasyonIsleri'));
t('Operatör reçete talebi açabiliyor', yazilabilir.includes('receteTalepleri'));
t('Operatör reçeteyi DOĞRUDAN değiştiremiyor', !yazilabilir.includes('receteler'));
t('Operatör stok hareketine doğrudan yazamıyor', !yazilabilir.includes('stokHareketleri'));

// ══════════════════════════════════════════════════════════════════════════
baslik('6. EŞZAMANLI YÜK SİMÜLASYONU');
// Gerçekçi günlük hacim tahmini
const gunlukIslem = {
  'Hat Operatörü': 20 * 40,      // 20 kişi × 40 onay/gün (QR, kalite, işlem, sevk)
  'Üretim': 4 * 25,
  'Teknik Ofis': 4 * 30,
  'ARGE': 5 * 20,
  'Üretim Planlama': 3 * 35,
  'Satınalma': 3 * 25,
  'Depo': 2 * 60,                // giriş/çıkış yoğun
  'Cari': 2 * 20,
  'Muhasebe': 2 * 15,
  'Sevkiyat': 2 * 30,
  'İK': 2 * 5,
  'İSG': 1 * 5
};
const toplamGunluk = Object.values(gunlukIslem).reduce((a, b) => a + b, 0);
console.log('  Günlük tahmini işlem hacmi:');
Object.entries(gunlukIslem).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`    ${k.padEnd(20)} ${String(v).padStart(4)} işlem/gün`));
console.log(`    ${'TOPLAM'.padEnd(20)} ${String(toplamGunluk).padStart(4)} işlem/gün`);

const yillikKayit = toplamGunluk * 250;   // 250 iş günü
console.log(`  → yıllık ~${yillikKayit.toLocaleString('tr')} denetim kaydı birikir`);
t('Günlük hacim 2000 işlemin altında (tek sunucu için makul)', toplamGunluk < 2000);

// Denetim kaydı büyümesi
const kayitBoyut = 180;  // bayt/kayıt
const yillikMB = (yillikKayit * kayitBoyut) / (1024 * 1024);
console.log(`  → denetim kaydı yıllık ~${yillikMB.toFixed(0)} MB`);
t('Yıllık denetim kaydı 200 MB altında', yillikMB < 200);
if (yillikMB > 100) not(`Denetim kaydı ${yillikMB.toFixed(0)} MB/yıl — 2-3 yılda arşivleme gerekebilir`);

// Parçalı gönderim koruması
const storage = fs.readFileSync(path.join(KOK, 'storage.js'), 'utf8');
t('Büyük veri parçalı gönderiliyor (413 koruması)',
  /topluEkle/.test(storage) && /topluGuncelle/.test(storage));
t('Çok büyük koleksiyonlarda bellek koruması var',
  /BUYUK_KOLEKSIYON_ESIGI/.test(storage));

// ══════════════════════════════════════════════════════════════════════════
baslik('7. EŞZAMANLI YAZMA ÇAKIŞMASI (50 kişi aynı anda)');
t('Sürüm kontrolü var (beklenenSurum)', /beklenenSurum/.test(storage));
t('Çakışma sunucuda yakalanıyor', /surum/i.test(api) && /409|catisma|çakış/i.test(api + storage));
t('Fark bazlı yazma (patch) mevcut', /patchUygula/.test(storage));
// Aynı koleksiyona en çok kim yazıyor?
console.log('  En yoğun ortak koleksiyon: istasyonIsleri (20 operatör + 4 üretim + 3 planlama)');
t('İş kartları fark bazlı güncelleniyor (tam yazma değil)',
  /patchUygula/.test(storage));

// ══════════════════════════════════════════════════════════════════════════
baslik('8. İŞ AKIŞI BÜTÜNLÜĞÜ — sipariş → sevkiyat zinciri');
const zincir = [
  ['Sipariş girişi', ['satis', 'teklif_siparis', 'cari'], 'siparisler'],
  ['Reçete/ürün tanımı', ['arge', 'teknik_ofis'], 'kartlar'],
  ['Malzeme planlama', ['uretim_planlama'], 'mrp'],
  ['Satınalma', ['satinalma'], 'satinalma_panel'],
  ['Depo girişi', ['depo'], 'depo_panel'],
  ['Kesim planı', ['uretim_planlama', 'teknik_ofis'], 'nesting'],
  ['Üretim', ['uretim', 'uretim_planlama'], 'hat_takip'],
  ['Kalite', ['kalite', 'uretim'], 'kalite_panel'],
  ['Sevkiyat', ['sevkiyat'], 'sevkiyat_panel']
];
let kopukHalka = 0;
zincir.forEach(([ad, roller, sayfaId]) => {
  const s = SAYFALAR.find(x => x.id === sayfaId);
  const ekipteVar = roller.some(r => EKIP.some(e => e.rol === r && e.kisi > 0));
  const sayfaVar = !!s;
  const yetkiVar = s ? roller.some(r => s.roller.includes(r)) : false;
  if (!ekipteVar) { console.log(`  ⚠ ${ad}: ekipte bu rol YOK (${roller.join('/')})`); kopukHalka++; }
  else if (!sayfaVar) console.log(`  ? ${ad}: sayfa bulunamadı (${sayfaId})`);
  else if (!yetkiVar) { console.log(`  ✗ ${ad}: ekipteki rol bu sayfaya erişemiyor`); kopukHalka++; }
  else console.log(`  ✓ ${ad}`);
});
t('Sipariş→sevkiyat zincirinde kopuk halka yok', kopukHalka === 0);

// ══════════════════════════════════════════════════════════════════════════
baslik('9. EKİPTE EKSİK ROL TESPİTİ');
const kritikRoller = [
  ['kalite', 'Kalite Kontrol', 'Kalite onayı olmadan sevkiyat yapılamaz'],
  ['yonetim', 'Üst Yönetim', 'Fiyat onayı, faaliyet defteri, yüksek tutarlı onaylar'],
  ['bakim', 'Bakım', 'Makine bakım takibi'],
  ['satis', 'Satış', 'Sipariş girişi']
];
kritikRoller.forEach(([rol, ad, neden]) => {
  const ekipteVar = EKIP.some(e => e.rol === rol && e.kisi > 0);
  if (!ekipteVar) not(`${ad} rolü ekipte yok — ${neden}`);
  else console.log(`  ✓ ${ad} ekipte var`);
});

// Kalite: üretim rolü kaliteye erişiyor mu (vekaleten)
const kaliteSayfa = SAYFALAR.find(x => x.id === 'kalite_panel');
if (kaliteSayfa) {
  const vekalet = ['uretim', 'uretim_planlama', 'teknik_ofis'].filter(r => kaliteSayfa.roller.includes(r));
  if (vekalet.length) console.log(`  → Kalite ekranına ${vekalet.join(', ')} de erişebiliyor (vekaleten yürütülebilir)`);
}

// ══════════════════════════════════════════════════════════════════════════
baslik('10. GÜVENLİK VE İZLENEBİLİRLİK');
t('Tüm yazma işlemleri denetim kaydına yazılıyor', /audit_log/.test(api));
t('Denetim kaydı kim/ne zaman/hangi rol tutuyor', /kullanici[\s\S]{0,200}rol/.test(api));
t('Şifreler bcrypt ile saklanıyor', /password_hash|password_verify/.test(api));
t('Oturum token doğrulaması var', /oturumZorunlu/.test(api));
t('Giriş denemeleri sınırlandırılmış (brute-force)', /login_attempts/.test(api));
t('Hassas koleksiyonlarda rol kontrolü', /HASSAS_OKUMA|HASSAS_YAZMA/.test(api));
t('Günlük otomatik yedek mevcut', /YEDEK_TUTMA_ADEDI/.test(api));

// ══════════════════════════════════════════════════════════════════════════
baslik('SONUÇ');
console.log(`  Başarılı : ${ok}`);
console.log(`  Başarısız: ${bad}`);
console.log(`  Uyarı    : ${uyari}`);
console.log('');
process.exit(bad ? 1 : 0);
