// BULGU: Tedarikçi net borç bakiyesi hesaplamaları (Cari İşlemler ana ekran
// KPI/liste, Cari Mutabakat Mektubu, Muhasebe Panel → Tedarikçi Ödemeleri
// formu) yalnızca durum==='reddedildi' olan satınalma siparişlerini hariç
// tutuyordu — 'yonetim_onayi_bekliyor' (henüz tedarikçiye HİÇ gönderilmedi)
// ve 'birime_dondu' (yönetim reddetti, düzenleme bekliyor) siparişler de
// borca DAHİL ediliyordu; bu da olmayan bir borç için "Ödeme Yap" akışını
// tetikleyip gerçek bakiyeyi şişiriyordu. Düzeltme: borç artık yalnızca
// GERÇEK BİR TAAHHÜDE dönüşmüş durumlar (onaylandi/gonderildi/tamamlandi)
// üzerinden hesaplanıyor. page_cari_panel.js ve page_muhasebe_panel.js
// Store/DOM'a derinden bağlı olduğu için (diğer page_* testleriyle aynı
// desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const cariSrc = fs.readFileSync(path.join(__dirname, '..', 'page_cari_panel.js'), 'utf8');
const muhSrc = fs.readFileSync(path.join(__dirname, '..', 'page_muhasebe_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- page_cari_panel.js: ortak taahhüt durumları listesi tanımlı --');
t('SATINALMA_BORC_DURUMLARI = onaylandi/gonderildi/tamamlandi',
  /const SATINALMA_BORC_DURUMLARI = \['onaylandi', 'gonderildi', 'tamamlandi'\];/.test(cariSrc));

console.log('\n-- page_cari_panel.js: tedarikçi bakiye KPI/listesi artık taahhüt durumlarını kullanıyor --');
t('render() içindeki borç hesaplaması SATINALMA_BORC_DURUMLARI kullanıyor',
  /satinalmaSiparisleri\.filter\(s => s\.tedarikciId === t\.id && SATINALMA_BORC_DURUMLARI\.includes\(s\.durum\)\)/.test(cariSrc));
t('eski gevşek filtre (sadece reddedildi hariç) KULLANILMIYOR (tedarikciId === t.id)',
  !/s\.tedarikciId === t\.id && s\.durum !== 'reddedildi'/.test(cariSrc));

console.log('\n-- page_cari_panel.js: Mutabakat Mektubu tedarikçi tarafı da düzeltildi --');
t('cariSiparisleri artık SATINALMA_BORC_DURUMLARI kullanıyor',
  /const cariSiparisleri = satinalmaSiparisleri\.filter\(s => s\.tedarikciId === cariId && SATINALMA_BORC_DURUMLARI\.includes\(s\.durum\)\);/.test(cariSrc));

console.log('\n-- page_muhasebe_panel.js: Tedarikçi Ödemeleri formu borç hesaplaması düzeltildi --');
t('tedarikciBakiyesi artık onaylandi/gonderildi/tamamlandi ile sınırlı',
  /const borc = satinalmaSiparisleri\.filter\(s => s\.tedarikciId === tedarikciId && \(s\.durum === 'onaylandi' \|\| s\.durum === 'gonderildi' \|\| s\.durum === 'tamamlandi'\)\)/.test(muhSrc));
t('eski gevşek filtre (sadece reddedildi hariç) KULLANILMIYOR (tedarikciId === tedarikciId)',
  !/s\.tedarikciId === tedarikciId && s\.durum !== 'reddedildi'\)/.test(muhSrc));
t('ilişkilendirilebilecek açık siparişler listesi de artık onaylandi/gonderildi ile sınırlı',
  /const acikSatinalmaSiparisleri = satinalmaSiparisleri\.filter\(s => s\.durum === 'onaylandi' \|\| s\.durum === 'gonderildi'\);/.test(muhSrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
