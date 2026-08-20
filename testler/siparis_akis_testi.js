// Siparis olusturan TUM kaynaklar ayni alan yapisini kullanmali
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const oku=(f)=>fs.readFileSync(path.join(KOK,f),'utf8');
const std=oku('page_siparis.js'), prj=oku('page_proje_teklif.js'),
      ag=oku('page_ag_entegrasyon.js'), tkf=oku('page_teklif.js'),
      cari=oku('page_cari_panel.js'), uretim=oku('page_uretim_panel.js');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- ONAY EKRANLARI NE ARIYOR --');
t('cari onay: cari_onay_bekliyor', /durum === 'cari_onay_bekliyor'/.test(cari));
t('planlama: cari_onay_bekliyor VEYA onaylandi', /durum === 'onaylandi' \|\| s\.durum === 'cari_onay_bekliyor'/.test(uretim));
t('planlama uretimKuyrugunda alanini kullaniyor', /s\.uretimKuyrugunda/.test(uretim));

console.log('\n-- TUM KAYNAKLAR AYNI DURUMU YAZIYOR MU --');
t('STANDART siparis -> cari_onay_bekliyor', /durum: 'cari_onay_bekliyor'/.test(std));
t('TEKLIFTEN siparis -> cari_onay_bekliyor', /durum: 'cari_onay_bekliyor'/.test(tkf));
t('PROJE teklifi -> cari_onay_bekliyor', /durum: 'cari_onay_bekliyor'/.test(prj));
t('LOGO entegrasyonu -> cari_onay_bekliyor', /durum: 'cari_onay_bekliyor'/.test(ag));
t('hicbir kaynakta taslak KALMADI',
  !/durum: 'taslak'/.test(prj) && !/durum: 'taslak'/.test(ag));

console.log('\n-- ZORUNLU ALANLAR (ekranlarin okudugu) --');
const alanlar=['toplam','araToplam','uretimKuyrugunda','uretimTermini','musteriAdi','kalemler','kod','tarih'];
alanlar.forEach(a=>{
  // Kısaltılmış nesne yazımı da geçerli: "kalemler," ile "kalemler:" aynı şey
  const bolum = prj.slice(prj.indexOf('const siparis = {'), prj.indexOf('const siparis = {')+1400);
  t('proje siparisinde "'+a+'" var', new RegExp('\\b'+a+'\\s*[:,]').test(bolum));
});
const agBolum = ag.slice(ag.indexOf('const govde = {'), ag.indexOf('const govde = {')+1600);
['toplam','araToplam','uretimKuyrugunda','uretimTermini'].forEach(a=>{
  t('logo siparisinde "'+a+'" var', new RegExp('\\b'+a+':').test(agBolum));
});

console.log('\n-- GERI UYUMLULUK --');
t('eski toplamTutar alani korundu', /toplamTutar: h\.matrah/.test(prj));
t('teklifId null olarak var (standart yapi)', /teklifId: null/.test(prj) && /teklifId: null/.test(ag));

console.log('\n-- SIMULASYON: siparis ekranlara dusuyor mu --');
const siparis={id:'S1',kod:'SIP-1',durum:'cari_onay_bekliyor',toplam:100000,
  uretimKuyrugunda:false,musteriAdi:'DOXA',kalemler:[{}],tarih:'2026-08-20'};
t('CARI ONAY ekranina duser', siparis.durum==='cari_onay_bekliyor');
t('PLANLAMA bekleyenler listesine duser',
  !siparis.uretimKuyrugunda && (siparis.durum==='onaylandi'||siparis.durum==='cari_onay_bekliyor'));
t('kuyruga alininca kuyruk listesine gecer',
  (()=>{const s2={...siparis,uretimKuyrugunda:true};
   return s2.uretimKuyrugunda && s2.durum!=='sevk_edildi' && s2.durum!=='reddedildi';})());
const taslak={...siparis,durum:'taslak'};
t('ESKI HATA: taslak hicbir ekranda GORUNMEZ',
  taslak.durum!=='cari_onay_bekliyor' &&
  !(taslak.durum==='onaylandi'||taslak.durum==='cari_onay_bekliyor'));


console.log('\n-- KALEM YAPISI (planlama/is emri/hat icin) --');
const uretim2=oku('page_uretim_panel.js');
t('planlama uretilebilir kalemi grup ile ayiriyor', /kalem\.grup === 'hammadde'/.test(uretim2));
t('is emri kalemi KOD ile urune bagliyor', /urunler\.find\(u => u\.kod === kalem\.kod\)/.test(uretim2));
t('urun kalemleri grup==urun ile suzuluyor', /k\.grup === 'urun'/.test(uretim2));

global.App={uid:p2=>p2+'-x'};
const MTM=require('../proje_teklif_motor.js');
const tk={mahaller:[{id:'m1',ad:'Oda',adet:80,kalemler:[
  {id:'k1',urunId:'UR-1',kod:'CT.D.80200',ad:'Gardırop',listeFiyati:12000,miktar:1,iskontoYuzde:10,birim:'ADET'},
  {id:'k2',urunId:null,kod:'',ad:'Duvar bandı',listeFiyati:50,miktar:12,iskontoYuzde:0,birim:'MT'}]}]};
const kk=MTM.siparisKalemleriUret(tk);
t('katalog urunu grup=urun', kk[0].grup==='urun');
t('katalog disi kalem grup=hammadde', kk[1].grup==='hammadde');
t('kod alani dolu (is emri baglanir)', kk[0].kod==='CT.D.80200');
t('netFiyat alani var', kk[0].netFiyat===10800);
t('birim tasiniyor', kk[0].birim==='ADET' && kk[1].birim==='MT');
t('ikinciKalite alani var', kk[0].ikinciKalite===false);
t('mahal bilgisi korunuyor', kk[0].mahal==='Oda');
t('miktar mahal adediyle carpildi', kk[0].miktar===80);
t('PLANLAMA suzgecinden geciyor', kk.filter(x=>x.grup==='urun'&&!x.ikinciKalite).length===1);

const agSrc=oku('page_ag_entegrasyon.js');
t('logo kaleminde de grup var', /grup: uKodlari\.has/.test(agSrc));
t('logo urun kodlari kumesi hazirlaniyor', /const uKodlari = new Set/.test(agSrc));
t('logo kaleminde netFiyat var', /netFiyat: x\.birimFiyat/.test(agSrc));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
