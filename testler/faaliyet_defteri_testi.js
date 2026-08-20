// Aylik faaliyet defteri + arsiv: uc noktalari, donem filtresi, yetki
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const api=fs.readFileSync(path.join(KOK,'api.php'),'utf8');
const st=fs.readFileSync(path.join(KOK,'storage.js'),'utf8');
const pg=fs.readFileSync(path.join(KOK,'page_faaliyet_defteri.js'),'utf8');
const app=fs.readFileSync(path.join(KOK,'app.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- SUNUCU UCLARI --');
t('donem filtresi (YYYY-MM) dogrulaniyor', api.includes("preg_match('/^\\d{4}-\\d{2}$/', $donem)"));
t('donem SQL substr(ts,1,7) ile suzuluyor', /substr\(ts,1,7\) = :dn/.test(api));
t('rol filtresi eklendi', /AND rol = :ro/.test(api));
t('auditDonemler ucu var', api.includes("elseif ($action === 'auditDonemler')"));
t('auditBirimOzet ucu var', api.includes("elseif ($action === 'auditBirimOzet')"));
t('donem listesi gruplaniyor', /GROUP BY donem ORDER BY donem DESC/.test(api));
t('birim ozeti rol bazinda gruplaniyor', /GROUP BY rol ORDER BY islem DESC/.test(api));
t('uclar yalnizca yonetime acik', (api.match(/Sadece yönetim/g)||[]).length >= 2);

console.log('\n-- ISTEMCI YARDIMCILARI --');
t('auditDonemleri tanimli', st.includes('async function auditDonemleri()'));
t('auditBirimOzeti tanimli', st.includes('async function auditBirimOzeti(donem)'));
t('auditGetir donem parametresi aliyor', /filtre\.donem\) url \+= '&donem='/.test(st));
t('yardimcilar disa acildi', /auditGetir, auditDonemleri, auditBirimOzeti/.test(st));

console.log('\n-- EKRAN --');
t('iki sekme: bu ay + arsiv', pg.includes("data-s=\"bu_ay\"") && pg.includes("data-s=\"arsiv\""));
t('yetki kontrolu (yonetim/admin)', /rol !== 'yonetim' && rol !== 'admin'/.test(pg));
t('departman kirilimi tablosu', /Departman Özeti/.test(pg));
t('hareket kaydi tablosu', /Hareket Kaydı/.test(pg));
t('gecmis aylar arsivde (bu ay haric)', /filter\(d => d\.donem !== buAy\(\)\)/.test(pg));
t('turkce ay adlari', /Temmuz', 'Ağustos/.test(pg));
t('veri SILINMIYOR vurgusu', /silinmez/.test(pg));
t('kendi fetch yerine Store kullaniliyor', !pg.includes("fetch('api.php") && pg.includes('Store.auditDonemleri()'));
t('menuye eklendi (yalnizca yonetim)', /id: 'faaliyet_defteri'[\s\S]{0,120}roller: \['admin','yonetim'\]/.test(app));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
