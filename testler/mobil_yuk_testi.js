// Mobilde giris sonrasi agir tarama YAPILMAMALI (kilitlenme sebebi)
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
console.log('\n-- MOBIL AGIR IS KORUMASI --');
t('dar ekran tespiti var', /_darEkran[\s\S]{0,120}innerWidth <= 768/.test(src));
t('mobil kullanici ajani da kontrol ediliyor', /Android\|iPhone\|iPad\|Mobile/.test(src));
t('masaustunde otomatik tarama SURUYOR', /if \(!_darEkran\) \{[\s\S]{0,120}bildirimleriTazele\(\)/.test(src));
t('mobilde tam tarama YOK, sadece rozet', /else \{[\s\S]{0,320}bildirimRozetiGuncelle\(mevcut\.filter/.test(src));
t('bildirim merkezi acilinca tarama hala var (bilgi kaybi yok)', /await bildirimleriTazele\(\);/.test(src));
t('mobilde tarama oncesi kullanici bilgilendiriliyor', /Bildirimler taranıyor/.test(src));
console.log('\n-- GEZINME KILIDI KORUNUYOR --');
t('gezinme kilidi hala yerinde', /_gezinmeCalisiyor = true;/.test(src));
console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
