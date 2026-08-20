// Tiger guncelleme + satir ici tip degistirme
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const tg=fs.readFileSync(path.join(KOK,'page_tiger_aktarim.js'),'utf8');
const hm=fs.readFileSync(path.join(KOK,'page_hammadde.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- TIGER GUNCELLE BUTONU --');
t('guncelle butonu var', tg.includes('id="tg-guncelle"'));
t('mevcut kart sayisi gosteriliyor', /\$\{mevcut\.length\} Mevcut Kartı Güncelle/.test(tg));
t('guncelle fonksiyonu tanimli', tg.includes('async function guncelle(main, mevcutOlanlar)'));
t('handler bagli', /gbtn\.onclick = \(\) => guncelle\(main, mevcut\)/.test(tg));

console.log('\n-- GUNCELLEME KAPSAMI --');
t('TIP duzeltiliyor (asil eksik)', /h\.tip !== k\.tip.*h\.tip = k\.tip.*tipDuzeltilen\+\+/s.test(tg));
t('alis fiyati guncelleniyor', /h\.birimFiyat = k\.alisFiyat/.test(tg));
t('birim guncelleniyor', /h\.birim = k\.birim/.test(tg));
t('stok miktari Tiger a esitleniyor', /s\.miktar = k\.stok/.test(tg));
t('stok kaydi yoksa olusturuluyor', /yeniStoklar\.push/.test(tg));

console.log('\n-- KORUMA KURALLARI (kritik) --');
t('DOLU olcu EZILMIYOR', /if \(!h\.en \|\| !h\.boy\)/.test(tg));
t('fire orani yalnizca bossa yaziliyor', /if \(h\.fireYuzde == null\) h\.fireYuzde = 8/.test(tg));
t('grain yalnizca bossa yaziliyor', /if \(!h\.grainYonu\) h\.grainYonu = 'yok'/.test(tg));
t('fiyat yalnizca Tiger da doluysa', /k\.alisFiyat != null && k\.alisFiyat > 0/.test(tg));
t('kullaniciya korunanlar bildiriliyor', tg.includes('Dokunulmayanlar'));
t('degisiklik yoksa bos islem yapilmiyor', /Güncellenecek fark bulunamadı/.test(tg));

console.log('\n-- SATIR ICI TIP DEGISTIRME --');
t('tip secim kutusu var', hm.includes('hm-tip-sec'));
t('4 tip secenegi', /value="plaka"[\s\S]{0,400}value="kenar_bandi"[\s\S]{0,200}value="sarf"[\s\S]{0,200}value="hirdavat"/.test(hm));
t('satir bazli kaydet butonu', hm.includes('hm-tip-kaydet'));
t('kaydet butonu baslangicta gizli', /hm-tip-kaydet[\s\S]{0,120}display:none/.test(hm));
t('degisince buton beliriyor', /btn\.style\.display = degisti \? 'block' : 'none'/.test(hm));
t('degisen alan gorsel isaretleniyor', /borderColor = degisti \? 'var\(--amber-text\)'/.test(hm));
t('kaydetmeden gecerse uygulanmiyor (kasitli)', hm.includes('kaydedilmeden sayfa değişirse'));
t('plakaya varsayilan grain/fire', /yeniTip === 'plaka'[\s\S]{0,140}grainYonu = 'yok'/.test(hm));
t('varsayilanlar yalnizca bos alana', /if \(kart\.fireYuzde == null\)/.test(hm));
t('bellekteki liste de guncelleniyor', /const yerel = list\.find\(x => x\.id === id\)/.test(hm));
t('hata yakalama var', /Kaydedilemedi: /.test(hm));


console.log('\n-- HTTP 413 KORUMASI (parcali gonderim) --');
const st=fs.readFileSync(path.join(KOK,'storage.js'),'utf8');
t('topluGuncelle tanimli', st.includes('async function topluGuncelle(key, kayitlar, partiBoyu, ilerleme)'));
t('patch guncelle dizisini kullaniyor', /topluGuncelle[\s\S]{0,700}ekle: \[\], guncelle: dilim/.test(st));
t('disa acilmis', /topluEkle, topluGuncelle/.test(st) && /sunucuModu/.test(st));
t('Tiger guncelleme PARCALI', /topluGuncelle\('hammaddeler', degisenler, 200/.test(tg));
t('stok eklemeleri parcali', /topluEkle\('stokRaf', yeniStoklar, 200/.test(tg));
t('stok guncellemeleri parcali', /topluGuncelle\('stokRaf', degisenStoklar, 200/.test(tg));
t('aktarimda mevcut guncellemeler parcali', /topluGuncelle\('hammaddeler', guncelHm, 200/.test(tg));
t('TAM kayit (save) KALMADI - tiger', !/hammaddeler\.save\(/.test(tg));
t('TAM kayit (save) KALMADI - hammadde ekrani', !/hammaddeler\.save\(/.test(hm));
t('satir ici kaydet yalnizca O karti gonderiyor', /topluGuncelle\('hammaddeler', \[kart\], 1\)/.test(hm));
t('kart kopyalama yalnizca yeni karti gonderiyor', /topluEkle\('hammaddeler', \[kopya\], 1\)/.test(hm));
t('ilerleme kullaniciya gosteriliyor', /güncellendi…/.test(tg));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
