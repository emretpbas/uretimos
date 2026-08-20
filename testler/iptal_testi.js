// Is emri / siparis iptal: engelleme kurallari
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(KOK,'page_iptal_islemleri.js'),'utf8');
const app=fs.readFileSync(path.join(KOK,'app.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

// Uretimdeki engelleriBul mantiginin aynisi
function engelleriBul(kayit,tip,istasyonIsleri,stokHareketleri,kesimIhtiyaclari,depoGirisleri){
  const engeller=[]; const kaynakTip = tip==='isemri'?'ie':'sip';
  istasyonIsleri.filter(i=>i.kaynakTip===kaynakTip&&i.kaynakId===kayit.id).forEach(k=>{
    const ilerleme=(+k.kaliteOnayliAdet||0)+(+k.islemTamamAdet||0)+(+k.sevkEdilenAdet||0)+(+k.fireAdet||0);
    if(ilerleme>0) engeller.push('ilerleme');
    else if(k.barkodOkundu) engeller.push('qr');
    else if(k.durum&&k.durum!=='aktif') engeller.push('durum');
  });
  const sarflar=stokHareketleri.filter(h=>h.tip==='cikis'&&(h.isEmriId===kayit.id||h.siparisId===kayit.id||(h.kaynakId&&h.kaynakId===kayit.id)));
  if(sarflar.length) engeller.push('sarf');
  const kesimler=kesimIhtiyaclari.filter(ks=>(ks.kaynakSiparisler||[]).includes(kayit.id)&&(ks.sonucCache||ks.durum==='kapali'));
  if(kesimler.length) engeller.push('kesim');
  if(tip==='siparis'){
    const g=depoGirisleri.filter(x=>x.siparisId===kayit.id&&x.durum&&x.durum!=='bekliyor');
    if(g.length) engeller.push('depo');
  }
  return engeller;
}
const IE={id:'IE-1',kod:'IE-001'};

console.log('\n-- IPTAL EDILEBILIR (temiz durum) --');
t('hicbir hareket yoksa iptal edilebilir', engelleriBul(IE,'isemri',[],[],[],[]).length===0);
t('acik ama ilerlememis is karti ENGEL DEGIL',
  engelleriBul(IE,'isemri',[{kaynakTip:'ie',kaynakId:'IE-1',durum:'aktif',gelenAdet:10,kaliteOnayliAdet:0,islemTamamAdet:0,sevkEdilenAdet:0,fireAdet:0,barkodOkundu:false}],[],[],[]).length===0);

console.log('\n-- ENGELLER --');
t('kalite onayi varsa ENGEL',
  engelleriBul(IE,'isemri',[{kaynakTip:'ie',kaynakId:'IE-1',durum:'aktif',kaliteOnayliAdet:5}],[],[],[]).includes('ilerleme'));
t('islem tamam varsa ENGEL',
  engelleriBul(IE,'isemri',[{kaynakTip:'ie',kaynakId:'IE-1',durum:'aktif',islemTamamAdet:3}],[],[],[]).includes('ilerleme'));
t('sevk varsa ENGEL',
  engelleriBul(IE,'isemri',[{kaynakTip:'ie',kaynakId:'IE-1',durum:'aktif',sevkEdilenAdet:1}],[],[],[]).includes('ilerleme'));
t('FIRE varsa ENGEL (malzeme harcanmis)',
  engelleriBul(IE,'isemri',[{kaynakTip:'ie',kaynakId:'IE-1',durum:'aktif',fireAdet:2}],[],[],[]).includes('ilerleme'));
t('QR okutulmussa ENGEL (parca hatta girdi)',
  engelleriBul(IE,'isemri',[{kaynakTip:'ie',kaynakId:'IE-1',durum:'aktif',barkodOkundu:true}],[],[],[]).includes('qr'));
t('is karti tamamlandiysa ENGEL',
  engelleriBul(IE,'isemri',[{kaynakTip:'ie',kaynakId:'IE-1',durum:'tamamlandi'}],[],[],[]).includes('durum'));
t('STOK SARFI varsa ENGEL',
  engelleriBul(IE,'isemri',[],[{tip:'cikis',isEmriId:'IE-1',miktar:5}],[],[]).includes('sarf'));
t('giris hareketi engel DEGIL',
  engelleriBul(IE,'isemri',[],[{tip:'giris',isEmriId:'IE-1',miktar:5}],[],[]).length===0);
t('kesim plani kaydedilmisse ENGEL',
  engelleriBul({id:'SIP-1'},'siparis',[],[],[{kaynakSiparisler:['SIP-1'],sonucCache:{}}],[]).includes('kesim'));
t('kesim satiri acik ama plan yoksa engel DEGIL',
  engelleriBul({id:'SIP-1'},'siparis',[],[],[{kaynakSiparisler:['SIP-1'],durum:'acik'}],[]).length===0);
t('siparise depo girisi varsa ENGEL',
  engelleriBul({id:'SIP-1'},'siparis',[],[],[],[{siparisId:'SIP-1',durum:'tamamlandi'}]).includes('depo'));
t('bekleyen depo girisi engel DEGIL',
  engelleriBul({id:'SIP-1'},'siparis',[],[],[],[{siparisId:'SIP-1',durum:'bekliyor'}]).length===0);

console.log('\n-- KARISMA KONTROLU --');
t('baska kaydin hareketleri karismiyor',
  engelleriBul(IE,'isemri',[{kaynakTip:'ie',kaynakId:'IE-9',kaliteOnayliAdet:5}],[{tip:'cikis',isEmriId:'IE-9'}],[],[]).length===0);
t('siparis kartlari is emrine karismiyor',
  engelleriBul(IE,'isemri',[{kaynakTip:'sip',kaynakId:'IE-1',kaliteOnayliAdet:5}],[],[],[]).length===0);

console.log('\n-- KOD KONTROLLERI --');
t('yetki: planlama+yonetim+admin', /\['admin', 'yonetim', 'uretim_planlama'\]\.includes\(rol\)/.test(src));
t('iptal aninda TAZE veriyle yeniden kontrol', src.includes('SON KONTROL') && /taze1, taze2, taze3, taze4/.test(src) && /istasyonIsleri\.push\(\.\.\.taze1\)/.test(src));
t('kayit SILINMIYOR, durum iptal', /kayit\.durum = 'iptal'/.test(src) && !/\.filter\(x => x\.id !== id\)/.test(src));
t('iptal izi (kim/tarih/gerekce)', /iptalBilgi = \{[\s\S]{0,120}gerekce/.test(src));
t('gerekce zorunlu', /if \(!gerekce\) return;/.test(src));
t('bagli hat kartlari da kapatiliyor', /bagliKartlar\.forEach/.test(src));
t('menude tanimli', /id: 'iptal_islemleri'/.test(app));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
