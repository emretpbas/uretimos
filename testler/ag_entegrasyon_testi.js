// Ag entegrasyonu: alan esleme, sayi/tarih cozumu, fark analizi, guvenlik
global.localStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
const A=require('../ag_entegrasyon.js');
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const pg=fs.readFileSync(path.join(KOK,'page_ag_entegrasyon.js'),'utf8');
const ht=fs.readFileSync(path.join(KOK,'.htaccess'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- AYAR SAKLAMA --');
t('varsayilan ayar var', A.ayarOku().siparis.yontem==='GET');
const a1=A.ayarOku(); a1.siparis.url='http://test.local/api';
t('ayar kaydediliyor', A.ayarYaz(a1)===true);
t('ayar geri okunuyor', A.ayarOku().siparis.url==='http://test.local/api');
t('eksik alan varsayilanla tamamlaniyor', (()=>{
  localStorage.setItem(A.AYAR_ANAHTARI,'{"siparis":{"url":"x"}}');
  const a=A.ayarOku(); return a.siparis.yontem==='GET' && !!a.recete && !!a.siparis.eslesme;
})());
t('bozuk ayar cokmeye yol acmiyor', (()=>{
  localStorage.setItem(A.AYAR_ANAHTARI,'bozuk{{');
  return A.ayarOku().siparis.yontem==='GET';
})());

console.log('\n-- YOL COZUMU --');
t('noktali yol okunuyor', A.yolOku({a:{b:{c:5}}},'a.b.c')===5);
t('olmayan yol undefined', A.yolOku({a:1},'x.y.z')===undefined);
t('bos yol kokU doner', A.yolOku({a:1},'')  .a===1);

console.log('\n-- KIMLIK BASLIKLARI --');
t('bearer', A.basliklarKur({kimlikTipi:'bearer',kimlik:'ABC'}).Authorization==='Bearer ABC');
t('ozel baslik', A.basliklarKur({kimlikTipi:'baslik',kimlik:'K1',basligAdi:'X-Api'})['X-Api']==='K1');
t('kimlik yoksa Authorization YOK', !A.basliklarKur({kimlikTipi:'yok'}).Authorization);
t('Accept json her zaman', A.basliklarKur({kimlikTipi:'yok'}).Accept==='application/json');

console.log('\n-- LOGO SIPARIS ESLEME (gercekci) --');
const logo={data:{orders:[
 {SIPARIS_NO:'SIP-001',CARI_UNVAN:'DOXA',TARIH:'2026-08-15T00:00:00',TERMIN:'2026-09-30',
  TUTAR:'125.400,50',DURUM:'ONAY_BEKLIYOR',SATIRLAR:[
   {STOK_KODU:'CT.D.80200',STOK_ADI:'Dolap',MIKTAR:'12',BIRIM:'ADET',FIYAT:'8500'},
   {STOK_KODU:'CT.M.14070',STOK_ADI:'Masa',MIKTAR:'6',BIRIM:'ADET',FIYAT:'3900'}]},
 {SIPARIS_NO:'',CARI_UNVAN:'BOS'}]}};
const cfg={kokAlan:'data.orders',
 eslesme:{kod:'SIPARIS_NO',musteriAdi:'CARI_UNVAN',tarih:'TARIH',terminTarihi:'TERMIN',
          tutar:'TUTAR',durum:'DURUM',kalemler:'SATIRLAR'},
 kalemEslesme:{urunKodu:'STOK_KODU',urunAdi:'STOK_ADI',miktar:'MIKTAR',birim:'BIRIM',birimFiyat:'FIYAT'}};
const ham=A.yolOku(logo,'data.orders');
const r=A.siparisleriEsle(ham,cfg);
t('1 gecerli siparis', r.kayitlar.length===1);
t('kodsuz satir atlandi + bildirildi', r.hatalar.length===1);
t('TURKCE sayi cozuldu (125.400,50)', r.kayitlar[0].tutar===125400.5);
t('ISO tarih kisaltildi', r.kayitlar[0].tarih==='2026-08-15');
t('2 kalem eslendi', r.kayitlar[0].kalemler.length===2);
t('kalem miktari sayiya cevrildi', r.kayitlar[0].kalemler[0].miktar===12);
t('ham kayit saklaniyor (izlenebilirlik)', !!r.kayitlar[0].hamKayit);
t('kaynak isaretli', r.kayitlar[0].kaynak==='logo');

console.log('\n-- ALAN KESFI --');
const o=A.ornekAlanlar(logo,'data.orders');
t('kayit sayisi bulundu', o.kayitSayisi===2);
t('7 alan kesfedildi', o.alanlar.length===7);
t('ilk kayit ornegi var', !!o.ilkKayit);
t('kok alan yoksa dizi otomatik bulunuyor', A.ornekAlanlar({liste:[{a:1}]}).kayitSayisi===1);
t('bos yanit guvenli', A.ornekAlanlar({}).kayitSayisi===0);

console.log('\n-- COST RECETE ESLEME --');
const cost=[{URUN:'CT.D.80200',AD:'Dolap',BIRIM:'ADET',
  BOM:[{MLZ:'50.002.218',MLZ_AD:'Suntalam',MIK:'2,5',BR:'M2'}]}];
const rc=A.receteleriEsle(cost,{eslesme:{kod:'URUN',ad:'AD',birim:'BIRIM',kalemler:'BOM'},
  kalemEslesme:{malzemeKodu:'MLZ',malzemeAdi:'MLZ_AD',miktar:'MIK',birim:'BR'}});
t('recete eslendi', rc.kayitlar.length===1);
t('ondalik virgul cozuldu (2,5)', rc.kayitlar[0].kalemler[0].miktar===2.5);
t('malzeme kodu tasindi', rc.kayitlar[0].kalemler[0].malzemeKodu==='50.002.218');

console.log('\n-- FARK ANALIZI (mukerrer yazma korumasi) --');
const f=A.farkCikar(r.kayitlar,[{id:'S1',kod:'SIP-001',toplamTutar:125400.5,kalemler:[1,2]}],'kod');
t('ayni kayit AYNI sayildi', f.ayni.length===1 && f.yeni.length===0);
const f2=A.farkCikar(r.kayitlar,[{id:'S1',kod:'SIP-001',toplamTutar:99999,kalemler:[1,2]}],'kod');
t('tutar degisince DEGISMIS', f2.degisen.length===1);
const f3=A.farkCikar(r.kayitlar,[],'kod');
t('mevcut yoksa YENI', f3.yeni.length===1);
t('mevcut id tasiniyor', f2.degisen[0].mevcutId==='S1');

console.log('\n-- GUVENLIK VE EKRAN --');
t('YALNIZCA OKUMA (yazma yok)', !/method:\s*['"]P(UT|ATCH)|method:\s*['"]DELETE/.test(fs.readFileSync(path.join(KOK,'ag_entegrasyon.js'),'utf8')));
t('kimlik yerel saklaniyor', /yalnızca bu bilgisayarda/.test(pg));
t('zaman asimi var (30sn)', /ZAMAN_ASIMI = 30000/.test(fs.readFileSync(path.join(KOK,'ag_entegrasyon.js'),'utf8')));
t('CORS hatasi aciklaniyor', /CORS izni yok/.test(fs.readFileSync(path.join(KOK,'ag_entegrasyon.js'),'utf8')));
t('401/403 aciklaniyor', /kimlik bilgisi hatalı veya yetki yok/.test(fs.readFileSync(path.join(KOK,'ag_entegrasyon.js'),'utf8')));
t('onizleme ZORUNLU (onaysiz yazma yok)', /Verileri Çek ve Önizle/.test(pg));
t('"ayni" kayitlar varsayilan SECILI DEGIL', /d\[0\] !== 'aynı' \? 'checked' : ''/.test(pg));
t('sartname ekranda var', /BILGI ISLEM|Bilgi İşlem Şartnamesi/.test(pg));
t('sartname CORS gereğini yaziyor'.replace('ğ','g'), /Access-Control-Allow-Origin/.test(pg));
t('sartname teslim listesi iceriyor', /TESLİM EDİLECEKLER/.test(pg));
t('CSP yerel aga acildi', /connect-src 'self' http:\/\/\*\.local/.test(ht));
t('CIDR yazilamayacagi belgelenmis', /IP ARALIĞI \(192\.168\.0\.0\/16\) yazılamaz/.test(ht));
t('parcali yazma kullaniliyor (413 korumasi)', /topluEkle\('siparisler', eklenecek, 200\)/.test(pg));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
