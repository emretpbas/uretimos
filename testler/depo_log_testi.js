// Depo giris defteri + irsaliye tekilligi + onay izleri
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const depo=fs.readFileSync(path.join(KOK,'page_depo_panel.js'),'utf8');
const kalite=fs.readFileSync(path.join(KOK,'page_kalite_panel.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- ONAY IZLERI (kim + ne zaman) --');
t('depo onaylayan kaydediliyor', /g\.depoOnaylayan = App\.aktifRol\(\)/.test(depo));
t('depo onay zamani kaydediliyor', /g\.depoOnayZamani = new Date\(\)\.toISOString\(\)/.test(depo));
t('kalite onaylayan kaydediliyor', /giris\.kaliteOnaylayan = App\.aktifRol\(\)/.test(kalite));
t('kalite onay zamani kaydediliyor', /giris\.kaliteOnayZamani/.test(kalite));
t('SEVK ONCESI kalite izi (paket bazli)', /p\.kaliteOnaylayan = _onaylayan/.test(kalite) && /p\.kaliteOnayZamani = _onayZamani/.test(kalite));

console.log('\n-- IRSALIYE TEKILLIGI --');
t('kural mevcut', depo.includes('İRSALİYE TEKİLLİĞİ'));
t('ayni cari + ayni irsaliye eslesmesi', /x\.irsaliyeNo && String\(x\.irsaliyeNo\)[\s\S]{0,160}tedarikciId \|\| ''\)/.test(depo));
t('bu islemdeki kayitlar haric tutuluyor', /!girisler\.some\(sg => sg\.id === x\.id\)/.test(depo));
t('farkli malzeme tespiti', /const cakisan = girisler\.filter\(g => !izinliler\.has/.test(depo));
t('cakisma varsa giris ENGELLENIYOR', /irs-kapat'\)\.onclick = App\.closeModal;\s*\n\s*return;/.test(depo));
t('kullaniciya mevcut kayitlar gosteriliyor', /Bu irsaliyede kayıtlı olanlar/.test(depo));

console.log('\n-- GIRIS KAYIT DEFTERI --');
t('sekme eklendi', depo.includes("data-tab=\"giris_log\""));
t('render fonksiyonu var', depo.includes('function renderGirisLogTab'));
t('tarih/irsaliye/fatura sutunlari', /İrsaliye No<\/th><th>Fatura No/.test(depo));
t('depo ve kalite onay sutunlari', /Depo Onayı<\/th><th>Kalite Onayı/.test(depo));
t('cari (tedarikci) gosteriliyor', /Cari \(Tedarikçi\)/.test(depo));
t('bekleyen girisler defterde yok (fiili giris)', /filter\(g => g\.durum !== 'bekliyor'\)/.test(depo));
t('en yeni ustte siralaniyor', /sort\(\(a, b\) => \(b\.depoOnayZamani/.test(depo));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
