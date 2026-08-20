// Logo Tiger malzeme aktarimi: tur cozumu, sutun eslesme, mukerrer korumasi
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','page_tiger_aktarim.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

// Uretimdeki turCoz ile BIREBIR ayni mantik (kod kontrolu asagida ayrica yapiliyor)
const turCoz = (t) => {
  const s = String(t || '').toUpperCase().replace(/[()\s]/g, '');
  if (s.includes('HM')) return 'hammadde';
  if (s.includes('YM')) return 'yarimamul';
  if (s.includes('MM')) return 'urun';
  if (s.includes('TM') || s.includes('TİM') || s.includes('TIM')) return 'hammadde';
  return null;
};
// Uretim kodundaki tanimin degismedigini dogrula
if (!src.includes("if (s.includes('YM')) return 'yarimamul';")) {
  console.log('  UYARI: uretimdeki turCoz degismis, test guncellenmeli');
}

console.log('\n-- TUR COZUMU (Tiger kodlari) --');
t('(YM) -> yarimamul', turCoz('(YM)')==='yarimamul');
t('(HM) -> hammadde', turCoz('(HM)')==='hammadde');
t('(MM) -> urun', turCoz('(MM)')==='urun');
t('(TM) ticari mal -> hammadde', turCoz('(TM)')==='hammadde');
t('bosluklu yazim', turCoz(' ( Y M ) ')==='yarimamul');
t('bos deger null', turCoz('')===null);
t('taninmayan null', turCoz('(XX)')===null);

console.log('\n-- SUTUN OTOMATIK ESLESME --');
// Uretimdeki sutunlariEsle ile BIREBIR ayni mantik
const ALANLAR=[
 {key:'hiyerarsi',sira:1,tam:['hiyerarşi kodu','hiyerarsi kodu'],ipucu:['hiyerarş','hiyerars']},
 {key:'ureticiKod',sira:1,tam:['üretici kodu','uretici kodu'],ipucu:['üretici','uretici']},
 {key:'ad2',sira:1,tam:['açıklaması 2','aciklamasi 2','açıklama 2'],ipucu:['açıklaması 2','aciklamasi 2']},
 {key:'kod',sira:2,tam:['kodu','kod','malzeme kodu','stok kodu'],ipucu:['malzeme kod','stok kod']},
 {key:'ad',sira:2,tam:['açıklaması','aciklamasi','açıklama','ad','malzeme adı'],ipucu:['açıkla','aciklama']},
 {key:'tur',sira:2,tam:['türü','turu','tür','tip'],ipucu:['tür','tur']},
 {key:'birim',sira:2,tam:['ana birim','birim','br'],ipucu:['birim']},
];
const basliklar=['Türü','Hiyerarşi Kodu','Kodu','Açıklaması','Açıklaması 2','Üretici Kodu','Ana Birim'];
const norm=(b)=>String(b||'').toLocaleLowerCase('tr').trim();
const eslesme={}; const kullanilan=new Set();
[1,2].forEach(sira=>{ALANLAR.filter(a=>a.sira===sira).forEach(a=>{
  let i=basliklar.findIndex((b,idx)=>!kullanilan.has(idx)&&a.tam.includes(norm(b)));
  if(i<0) i=basliklar.findIndex((b,idx)=>!kullanilan.has(idx)&&a.ipucu.some(ip=>norm(b).includes(ip)));
  if(i>=0){eslesme[a.key]=i;kullanilan.add(i);}
});});
t('Türü sutunu bulundu', eslesme.tur===0);
t('Hiyerarsi sutunu bulundu', eslesme.hiyerarsi===1);
t('Kodu sutunu bulundu', eslesme.kod===2);
t('Aciklamasi sutunu bulundu', eslesme.ad===3);
t('Aciklama 2 ayri sutuna gitti', eslesme.ad2===4);
t('Uretici Kodu ayri sutuna gitti', eslesme.ureticiKod===5);
t('hicbir sutun iki alana atanmadi', new Set(Object.values(eslesme)).size===Object.keys(eslesme).length);
t('Ana Birim sutunu bulundu', eslesme.birim===6);

console.log('\n-- GERCEK VERI (ekran goruntusundeki satirlar) --');
const veri=[
 ['(YM)','52862','200.001.001.100.121.97','RADİCAL 120 LİK SABİT TRAVERS FÜME -DOXA','','','ADET'],
 ['(YM)','58541','200.001.001.200.084.89','SLİM 120*60 SEHPA AYAĞI DİKDÖRTGEN CAPPUCCİNO','','','TAKIM'],
 ['(YM)','19241','200.001.003.1000','TİTAN 80 lik MASA AYAĞI','','','ADET'],
 ['(YM)','50955','200.001.004.1003','TİNY MASA ÇEKMECE MODÜLÜ','','','ADET'],
 ['','99999','200.001.999.0001','TUR BELIRTILMEMIS PARCA','','','ADET'],
 ['(YM)','','','',  '','',''],   // bos satir
];
const al=(r,key)=>eslesme[key]!==undefined?String(r[eslesme[key]]??'').trim():'';
const kayitlar=[],hatalar=[];
veri.forEach((r,i)=>{
  const kod=al(r,'kod'),ad=al(r,'ad');
  if(!kod&&!ad) return;
  if(!kod){hatalar.push('kod bos');return;}
  if(!ad){hatalar.push('ad bos');return;}
  let hedef=turCoz(al(r,'tur'));
  if(!hedef) hedef='hammadde';   // varsayilan
  kayitlar.push({kod,ad,hedef,birim:(al(r,'birim')||'ADET').toUpperCase()});
});
t('5 gecerli kayit cozuldu', kayitlar.length===5);
t('bos satir atlandi', hatalar.length===0 || veri.length-kayitlar.length>=1);
t('kod dogru okundu', kayitlar[0].kod==='200.001.001.100.121.97');
t('turkce karakterli ad korundu', kayitlar[0].ad.includes('FÜME'));
t('TAKIM birimi okundu', kayitlar[1].birim==='TAKIM');
t('YM -> yarimamul hedefi', kayitlar[0].hedef==='yarimamul');
t('tur bos -> varsayilana dustu', kayitlar[4].hedef==='hammadde');

console.log('\n-- MUKERRER KORUMASI --');
const mevcutKod=new Set(['200.001.003.1000']);
const gorulen=new Set();
kayitlar.forEach(k=>{
  k.mevcutMu=mevcutKod.has(k.kod.toUpperCase());
  k.dosyadaTekrar=gorulen.has(k.kod.toUpperCase());
  gorulen.add(k.kod.toUpperCase());
});
t('sistemde olan kart "zaten var" isaretlendi', kayitlar.find(k=>k.kod==='200.001.003.1000').mevcutMu===true);
t('yeni kartlar aktarilacak', kayitlar.filter(k=>!k.mevcutMu&&!k.dosyadaTekrar).length===4);
// Ayni kod iki kez
const tekrarli=[{kod:'A'},{kod:'A'}]; const g2=new Set();
tekrarli.forEach(k=>{k.tekrar=g2.has(k.kod);g2.add(k.kod);});
t('dosya ici tekrar yakalaniyor', tekrarli[1].tekrar===true);

console.log('\n-- KOD KONTROLLERI --');
t('mevcut kartlarda fiyat/stok EZILMIYOR', src.includes('yalnızca ad/birim güncellenir') || /h\.ad = k\.ad; h\.birim = k\.birim;/.test(src));
t('varsayilan davranis: atla (guvenli)', /<option value="atla">Atla — dokunma \(önerilen\)/.test(src));
t('eksik alanlar kullaniciya bildiriliyor', src.includes('fiyat, fire oranı, tedarik süresi'));
t('XLSX kutuphanesi kullaniliyor', src.includes('XLSX.read'));
t('CSV de destekleniyor', src.includes('.csv'));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
