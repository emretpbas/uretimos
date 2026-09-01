// Ag entegrasyonu: alan esleme, sayi/tarih cozumu, fark analizi, guvenlik
global.localStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
const A=require('../ag_entegrasyon.js');
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const pg=fs.readFileSync(path.join(KOK,'page_ag_entegrasyon.js'),'utf8');
const ht=fs.readFileSync(path.join(KOK,'.htaccess'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- AYAR SAKLAMA (coklu profil) --');
localStorage.removeItem(A.AYAR_ANAHTARI);
t('varsayilan ayar bos profil listesi', Array.isArray(A.ayarOku().profiller) && A.ayarOku().profiller.length===0);
t('yeniProfil GET/ice varsayilaniyla gelir', A.yeniProfil('siparis').yontem==='GET' && A.yeniProfil('siparis').yon==='ice');
t('bilinmeyen hedefTip siparis e duser', A.yeniProfil('bilinmeyen_tip').hedefTip==='siparis');
const ayar1=A.ayarOku();
const pTest=A.yeniProfil('siparis','Test Profili'); pTest.url='http://test.local/api';
ayar1.profiller.push(pTest);
t('ayar kaydediliyor', A.ayarYaz(ayar1)===true);
const ayar1b=A.ayarOku();
t('ayar geri okunuyor', ayar1b.profiller.length===1 && ayar1b.profiller[0].url==='http://test.local/api');
t('eksik alan varsayilanla tamamlaniyor', (()=>{
  localStorage.setItem(A.AYAR_ANAHTARI, JSON.stringify({profiller:[{id:'P1',hedefTip:'siparis',url:'x'}]}));
  const a=A.ayarOku(); return a.profiller[0].yontem==='GET' && !!a.profiller[0].eslesme && !!a.profiller[0].disaEslesme;
})());
t('bozuk ayar cokmeye yol acmiyor', (()=>{
  localStorage.setItem(A.AYAR_ANAHTARI,'bozuk{{');
  return Array.isArray(A.ayarOku().profiller);
})());

console.log('\n-- ESKI FORMATTAN GOC (v1 kullanicilari kaybolmasin) --');
localStorage.setItem(A.AYAR_ANAHTARI, JSON.stringify({
  siparis:{url:'http://logo.local/api/siparis', yontem:'GET', kimlikTipi:'yok', kokAlan:'data.orders',
    eslesme:{kod:'SIPARIS_NO', musteriAdi:'CARI_UNVAN', durum:'DURUM', kalemler:'SATIRLAR'},
    kalemEslesme:{urunKodu:'STOK_KODU'}},
  recete:{url:'', yontem:'GET'},   // hic yapilandirilmamis -> tasinmamali
  sonSenkron:{siparis:'2026-01-01T00:00:00.000Z', recete:null}
}));
const goc=A.ayarOku();
t('eski format 1 profile donusturuldu (bos recete tasinmadi)', goc.profiller.length===1);
t('goc eden profil hedefTip=siparis', goc.profiller[0].hedefTip==='siparis');
t('goc eden profil url korundu', goc.profiller[0].url==='http://logo.local/api/siparis');
t('eski "durum" eslemesi yeni "disDurum" anahtarina tasindi', goc.profiller[0].eslesme.disDurum==='DURUM');
t('goc kalici (bir daha calismiyor, ikinci okumada ayni id)', A.ayarOku().profiller[0].id===goc.profiller[0].id);
localStorage.removeItem(A.AYAR_ANAHTARI);

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

console.log('\n-- HEDEF TIPI GENELLESTIRMESI (urun_stok / cari) --');
const stokHam=[{KOD:'HRD-001',URUN_ADI:'Menteşe',BIRIM:'ADET',STOK:'150',FIYAT:'12,50'}];
const stokEs=A.kayitlariEsle(stokHam,{hedefTip:'urun_stok',
  eslesme:{kod:'KOD',ad:'URUN_ADI',birim:'BIRIM',stok:'STOK',fiyat:'FIYAT'}});
t('urun_stok eslendi', stokEs.kayitlar.length===1);
t('urun_stok sayisal alanlar cozuldu', stokEs.kayitlar[0].stok===150 && stokEs.kayitlar[0].fiyat===12.5);
const cariHam=[{CKOD:'',UNVAN:'Bossuz'},{CKOD:'C-100',UNVAN:'ACME A.Ş.',VERGI:'1234567890'}];
const cariEs=A.kayitlariEsle(cariHam,{hedefTip:'cari',eslesme:{kod:'CKOD',unvan:'UNVAN',vergiNo:'VERGI'}});
t('cari bos kod atlandi', cariEs.kayitlar.length===1 && cariEs.hatalar.length===1);
t('cari vergiNo tasindi', cariEs.kayitlar[0].vergiNo==='1234567890');
t('bilinmeyen hedefTip guvenli hata doner', A.kayitlariEsle([{}],{hedefTip:'yok_boyle_tip'}).kayitlar.length===0);

console.log('\n-- DISA AKTARIM (yazma — yalniz acik cagriyla) --');
const disaCfg={hedefTip:'urun_stok', disaEslesme:{kod:'STOK_KODU',ad:'URUN_ADI',stok:'MIKTAR'}};
const disaKayit=[{kod:'HRD-001',ad:'Menteşe',stok:150,birim:'ADET',fiyat:12.5}];
const yuk=A.disaPayloadOlustur(disaKayit,disaCfg);
t('disa payload yalnizca eslenmis alanlari iceriyor', yuk[0].STOK_KODU==='HRD-001' && yuk[0].URUN_ADI==='Menteşe' && yuk[0].MIKTAR===150);
t('disa payload eslenmemis alani ICERMIYOR (birim/fiyat)', yuk[0].birim===undefined && yuk[0].fiyat===undefined);
t('disaGonder fonksiyonu ayri ve acikca disa aktarilan bir fonksiyon', typeof A.disaGonder==='function');

console.log('\n-- GUVENLIK VE EKRAN --');
t('varsayilan yon "ice" (okuma) — disa aktarim yalnizca kullanici acikca secerse', A.yeniProfil('siparis').yon==='ice');
t('disaGonder yalnizca kullanicinin "Gonder" tikladiginda cagriliyor (confirmDialog icinde)',
  /function disaGonderTikla[\s\S]{0,200}confirmDialog[\s\S]{0,600}AgEntegrasyon\.disaGonder/.test(pg));
t('disa aktarimda karsi sisteme YAZAR uyarisi ekranda var', /karşı sisteme YAZAR/.test(pg));
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

(async () => {
  console.log('\n-- DISA GONDER (async ag cagrisi) --');
  const r=await A.disaGonder({url:''},[]);
  t('bos adres disaGonder\'i agdan once reddediyor', r.ok===false);

  console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');
  process.exit(bad?1:0);
})();
