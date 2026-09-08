const fs=require('fs'), path=require('path'); const src=fs.readFileSync(path.join(__dirname,'..','kayip_kacak.js'),'utf8');
const al=(ad)=>{const i=src.indexOf('function '+ad+'(');if(i<0)throw new Error(ad);let d=0,j=src.indexOf('{',i);do{if(src[j]==='{')d++;else if(src[j]==='}')d--;j++;}while(d>0);return src.slice(i,j);};
eval(al('gorevAyriligiGecerli'));
const CIFT_ONAY_TUTAR_ESIGI_VARSAYILAN=50000; eval(al('ciftOnayGerekli'));
const GECERLI_GECISLER={beklemede:['onaylandi','reddedildi'],onaylandi:['teslim_edildi','reddedildi'],teslim_edildi:['kapatildi'],reddedildi:[],kapatildi:[]};
eval(al('gecisGecerli'));
eval(al('aktifKullanici'));
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a);}else{bad++;console.log('  KALDI '+a);}};

console.log('\n-- GÖREV AYRILIĞI (çekirdek kural) --');
t('talep eden = onaylayan REDDEDILIR', gorevAyriligiGecerli('ahmet','ahmet').gecerli===false);
t('farkli kisi onaylayabilir', gorevAyriligiGecerli('ahmet','mehmet').gecerli===true);
t('talepEden bos ise red', gorevAyriligiGecerli('','mehmet').gecerli===false);
t('onaylayan bos ise red', gorevAyriligiGecerli('ahmet','').gecerli===false);
t('ayni kisi red sebebi net', gorevAyriligiGecerli('a','a').sebep.includes('kendisi onaylayamaz'));

console.log('\n-- ÇİFT ONAY EŞİĞİ: ayarlar verilmezse VARSAYILAN 50.000 TRY --');
t('49.999 -> tek onay (varsayılan eşik)', ciftOnayGerekli(49999)===false);
t('50.000 -> çift onay (varsayılan eşik)', ciftOnayGerekli(50000)===true);
t('100.000 -> çift onay (varsayılan eşik)', ciftOnayGerekli(100000)===true);
t('0/bos -> tek onay', ciftOnayGerekli(0)===false);
t('ayarlar objesi verilir ama esik alani yoksa yine VARSAYILAN kullanilir', ciftOnayGerekli(50000, {})===true);

console.log('\n-- BULGU (T49): ÇİFT ONAY EŞİĞİ artık Ayarlar\'dan GELİYOR (sabit değil) --');
t('Ayarlar\'da düşük eşik (10.000) tanımlıysa ona göre çift onay istenir',
  ciftOnayGerekli(15000, {ciftOnayTutarEsigi:10000})===true);
t('Ayarlar\'daki eşiğin altındaki tutar tek onay yeterli sayılır (varsayılan 50.000 ile karışmıyor)',
  ciftOnayGerekli(15000, {ciftOnayTutarEsigi:20000})===false);
t('Ayarlar\'da YÜKSEK eşik (200.000) tanımlıysa varsayılan 50.000 ARTIK uygulanmaz',
  ciftOnayGerekli(80000, {ciftOnayTutarEsigi:200000})===false);
t('ciftOnayTutarEsigi 0 olarak AÇIKÇA ayarlanmışsa (özellik kapatılmak istenmiş) her tutar çift onay ister',
  ciftOnayGerekli(1, {ciftOnayTutarEsigi:0})===true);

console.log('\n-- BULGU (T49): aktifKullanici() artık ROL değil GERÇEK kullanıcı kimliği döndürüyor --');
{
  // Bireysel hesapla giriş yapılmışsa (App.aktifKullaniciAdi mevcut ve dolu):
  global.App = { aktifKullaniciAdi: () => 'ahmet.yilmaz', aktifRol: () => 'depo' };
  t('bireysel hesap kullanıcı adını döner (rol DEĞİL)', aktifKullanici()==='ahmet.yilmaz');

  // Eski rol-bazlı girişte (bireysel hesap yok, aktifKullaniciAdi boş döner):
  global.App = { aktifKullaniciAdi: () => null, aktifRol: () => 'depo' };
  t('bireysel hesap yoksa role DÜŞER (geriye dönük uyum)', aktifKullanici()==='depo');

  // BULGU senaryosu: iki farklı depo çalışanı AYNI role sahipse, eski kod
  // ikisini de "depo" string'i olarak görüp GÖREV AYRILIĞINI YANLIŞ
  // değerlendirirdi (biri talep, role'de aynı olan biri onaylasa bile
  // "kendisi onaylayamaz" derdi). Artık gerçek kimlikle bu ayrım netleşir:
  global.App = { aktifKullaniciAdi: () => 'depo_ali', aktifRol: () => 'depo' };
  const kimlikAli = aktifKullanici();
  global.App = { aktifKullaniciAdi: () => 'depo_veli', aktifRol: () => 'depo' };
  const kimlikVeli = aktifKullanici();
  t('aynı role sahip iki farklı depo çalışanı artık FARKLI kimlik olarak ayırt ediliyor', kimlikAli !== kimlikVeli);
  t('görev ayrılığı artık gerçek kişiye göre doğru çalışır (Ali talep etti, Veli onaylayabilir)',
    gorevAyriligiGecerli(kimlikAli, kimlikVeli).gecerli === true);
}

console.log('\n-- DURUM MAKİNESİ --');
t('beklemede -> onaylandi gecerli', gecisGecerli('beklemede','onaylandi')===true);
t('beklemede -> reddedildi gecerli', gecisGecerli('beklemede','reddedildi')===true);
t('beklemede -> teslim_edildi GECERSIZ (once onay)', gecisGecerli('beklemede','teslim_edildi')===false);
t('onaylandi -> teslim_edildi gecerli', gecisGecerli('onaylandi','teslim_edildi')===true);
t('teslim_edildi -> kapatildi gecerli', gecisGecerli('teslim_edildi','kapatildi')===true);
t('reddedildi -> hicbir gecis (kapali)', gecisGecerli('reddedildi','onaylandi')===false);
t('kapatildi -> hicbir gecis', gecisGecerli('kapatildi','teslim_edildi')===false);
t('teslim_edildi -> onaylandi GERI DONUS engel', gecisGecerli('teslim_edildi','onaylandi')===false);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');
process.exit(bad?1:0);
