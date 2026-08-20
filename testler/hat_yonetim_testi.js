// Hat yonetimi: beklet / isleri sifirla / geri cagir — yetki ve mantik
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
const src=fs.readFileSync(path.join(KOK,'page_hat_takip.js'),'utf8');
const st=fs.readFileSync(path.join(KOK,'storage.js'),'utf8');

console.log('\n-- YETKI --');
t('yalnizca admin/yonetim/uretim_planlama', /hatYonetebilir = \['admin', 'yonetim', 'uretim_planlama'\]/.test(src));
t('butonlar yetkisizde render edilmiyor', /hatYonetebilir \? `<div/.test(src));

console.log('\n-- KOLEKSIYON --');
t('hatDurumlari coll tanimli', st.includes("hatDurumlari: coll('hatDurumlari')"));
t('hatDurumlari setIfAbsent', st.includes("setIfAbsent('hatDurumlari', [])"));
t('hatDurumlari senkron listesinde', /'receteTalepleri', 'hatDurumlari'/.test(st));

console.log('\n-- GEREKCE (promise sarmalayici) --');
t('gerekceSor yardimcisi var', src.includes('function gerekceSor(baslik, uyari)'));
t('callback promise e cevriliyor', /new Promise\([\s\S]{0,120}redGerekceDialog\(baslik, uyari \|\| '', \(gerekce\) => resolve/.test(src));
t('await App.redGerekceDialog KULLANILMIYOR (hatali desen)', !/await App\.redGerekceDialog/.test(src));

console.log('\n-- SIFIRLAMA / GERI CAGIRMA --');
t('sifirlanan durum=sifirlandi', /k\.durum = 'sifirlandi'/.test(src));
t('onceki durum saklaniyor', /oncekiDurum = k\.durum/.test(src));
t('sifirlama izi (kim/tarih/gerekce)', /sifirlamaBilgi = damga/.test(src) && /kim: App\.aktifRol\(\), tarih:[\s\S]{0,40}gerekce/.test(src));
t('geri cagirma onceki duruma donuyor', /k\.durum = k\.oncekiDurum \|\| 'aktif'/.test(src));
t('geri cagirma izi tutuluyor', src.includes('geriCagirmaBilgi'));
t('sifirlanan isler ayri filtreleniyor', /durum === 'sifirlandi'/.test(src));
t('aktif liste sifirlanani gostermiyor', /x\.durum === 'aktif'/.test(src));

console.log('\n-- BEKLETME --');
t('beklet durumu kaydediliyor', /durum: yeniDurum/.test(src));
t('beklemede banner gosteriliyor', src.includes('BU HAT BEKLETİLİYOR'));
t('beklet/kaldir ayni butonda', /beklemede \? '▶ Beklemeyi Kaldır' : '⏸ Hattı Beklet'/.test(src));


console.log('\n-- BEKLETME KILIDI (ilerleme engeli) --');
const term=fs.readFileSync(path.join(KOK,'page_hat_terminal.js'),'utf8');
const api=fs.readFileSync(path.join(KOK,'api.php'),'utf8');
t('hat takipte kilitli buton listesi var', /KILITLI = \['ht-qr', 'ht-kalite', 'ht-islem', 'ht-sevk', 'ht-red', 'ht-barkod'\]/.test(src));
t('hat takipte capture ile tiklama durduruluyor', /stopPropagation\(\)[\s\S]{0,200}\}, true\)/.test(src));
t('hat takipte butonlar gorsel pasif', /cursor = 'not-allowed'/.test(src));
t('terminalde bekleyen hat seti kuruluyor', /new Set\(\(hatDurumlari \|\| \[\]\)/.test(term));
t('terminal kilidi IS BAZINDA (hat kontrolu)', /bekleyen\.has\(is\.hat\)/.test(term));
t('terminalde kilitli butonlar', /KILITLI = \['ho-barkod', 'ho-kalite', 'ho-islem', 'ho-sevk', 'ho-red'\]/.test(term));
t('terminalde capture ile durduruluyor', /stopPropagation\(\)[\s\S]{0,200}\}, true\)/.test(term));
t('operator hatDurumlari OKUYABILIR (beyaz liste)', /HAT_OP_OKUNABILIR[\s\S]{0,400}hatDurumlari/.test(api));
t('hata olursa uretim engellenmiyor (try/catch)', /catch \(e\) \{ \/\* hat durumu okunamazsa/.test(term));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
