// Otomasyon motoru: durum modeli, otonom karar, nabiz, OEE, olgunluk
const O=require('../otomasyon_motor.js');
const fs=require('fs'),path=require('path');
const api=fs.readFileSync(path.join(__dirname,'..','api.php'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
const g=(n)=>new Date(Date.now()-n*1000).toISOString();
const M={id:'M1',ad:'CNC-1',durum:'calisiyor',sonNabiz:g(5),nabizEsigiSn:120,
         uretilenToplam:180,redToplam:0,durumBaslangic:g(600)};

console.log('\n-- DURUM MODELI --');
t('9 durum tanimli', Object.keys(O.DURUMLAR).length===9);
t('gecerli gecis kabul', O.gecisGecerli('calisiyor','ariza').ok===true);
t('GECERSIZ gecis RED (kapali->calisiyor)', O.gecisGecerli('kapali','calisiyor').ok===false);
t('acil stop HER durumdan gecerli', O.gecisGecerli('bakim','acil_stop').ok && O.gecisGecerli('kapali','acil_stop').ok);
t('bilinmeyen durum red', O.gecisGecerli('hazir','uydurma').ok===false);
t('ayni duruma gecis degisim degil', O.gecisGecerli('hazir','hazir').degisim===false);
t('uretken durum isaretli', O.DURUMLAR.calisiyor.uretken===true);
t('ariza insan gerektiriyor', O.DURUMLAR.ariza.insanGerek===true);

console.log('\n-- NABIZ (sessiz durus tespiti) --');
t('taze nabiz canli', O.nabizDurumu({sonNabiz:g(10),nabizEsigiSn:120}).canli===true);
t('esik asilinca olu', O.nabizDurumu({sonNabiz:g(300),nabizEsigiSn:120}).canli===false);
t('hic sinyal yoksa olu', O.nabizDurumu({}).canli===false);
t('gecen sure raporlaniyor', O.nabizDurumu({sonNabiz:g(300),nabizEsigiSn:120}).gecenSn>=299);

console.log('\n-- OTONOM KARAR (gece 03:00) --');
let r=O.olayIsle(M,{tip:'parca_bitti',adet:1},null);
t('normal uretimde MUDAHALE YOK', r.tetiklenen.length===0 && !r.insanGerekli);
t('uretim sayaci artiyor', r.sayaclar.uretilen===1);

r=O.olayIsle({...M,redToplam:15},{tip:'parca_red',adet:1},null);
t('hurda esigi asinca DURAKLAT', r.eylemler.includes('duraklat'));
t('hurda uyarisi kritik', r.enYuksekSeviye==='kritik');
r=O.olayIsle({...M,uretilenToplam:5,redToplam:2},{tip:'parca_red',adet:1},null);
t('AZ ORNEKLEMDE oran tetiklenmiyor (yaniltici)', !r.eylemler.includes('duraklat'));

r=O.olayIsle({...M,sonNabiz:g(400)},{tip:'nabiz'},null);
t('sinyal kesilince INSAN CAGIR', r.eylemler.includes('insan_cagir'));

r=O.olayIsle(M,{tip:'durum',durum:'acil_stop'},null);
t('ACIL STOP hatti durduruyor', r.eylemler.includes('hat_durdur'));
t('acil seviyesi en yuksek', r.enYuksekSeviye==='acil');
t('acil stop durumu kabul edildi', r.yeniDurum==='acil_stop');

r=O.olayIsle(M,{tip:'program_yukle',program:'P-102',beklenenProgram:'P-101'},null);
t('YANLIS PROGRAM duraklatiyor', r.eylemler.includes('duraklat'));
t('otomatik duzeltme YOK (insan onaylar)', !r.eylemler.includes('devam'));
r=O.olayIsle(M,{tip:'program_yukle',program:'P-101',beklenenProgram:'P-101'},null);
t('dogru program sorun degil', r.tetiklenen.length===0);

r=O.olayIsle({...M,durum:'tikandi',durumBaslangic:g(400)},{tip:'durum',durum:'tikandi'},null);
t('uzun tikanma hat durduruyor', r.eylemler.includes('hat_durdur'));
r=O.olayIsle({...M,durum:'tikandi',durumBaslangic:g(60)},{tip:'durum',durum:'tikandi'},null);
t('kisa tikanma tolere ediliyor', !r.eylemler.includes('hat_durdur'));

r=O.olayIsle({...M,durum:'bekliyor',durumBaslangic:g(900)},{tip:'durum',durum:'bekliyor'},null);
t('uzun malzeme beklemesi bildiriliyor', r.eylemler.includes('insan_cagir'));

r=O.olayIsle(M,{tip:'olcum',toleransDisi:true,deger:18.4},null);
t('tolerans disi olcum IZOLE ediyor', r.eylemler.includes('izole'));
t('izole ederken uretim durmuyor', !r.eylemler.includes('hat_durdur'));

console.log('\n-- BOZUK SINYAL (guvenli durus ilkesi) --');
r=O.olayIsle({...M,durum:'kapali'},{tip:'durum',durum:'calisiyor'},null);
t('gecersiz gecis REDDEDILDI', r.kabul===false);
t('sessizce yutulmuyor, YUKSELTILIYOR', r.tetiklenen.some(x=>x.eylem==='insan_cagir'));
r=O.olayIsle(M,{tip:'olmayan_tip'},null);
t('bilinmeyen olay tipi red', r.kabul===false);

console.log('\n-- OEE --');
const oee=O.oeeHesapla({calismaSuresiSn:57600,planliDurusSn:3600,uretilenToplam:920,
  redToplam:30,idealCevrimSn:60},86400);
t('kullanilabilirlik hesaplandi', oee.kullanilabilirlik>0 && oee.kullanilabilirlik<=100);
t('kalite = 920/950', Math.abs(oee.kalite-96.8)<0.2);
t('OEE = K x P x Q', Math.abs(oee.oee-(oee.kullanilabilirlik*oee.performans*oee.kalite/10000))<0.5);
t('veri tamsa guvenilir', oee.guvenilir===true);
t('ideal cevrim yoksa GUVENILMEZ', O.oeeHesapla({calismaSuresiSn:100,uretilenToplam:50}).guvenilir===false);

console.log('\n-- OLGUNLUK DEGERLENDIRMESI --');
t('7 alan tanimli', O.OLGUNLUK_ALANLARI.length===7);
t('agirliklar toplami 100', O.OLGUNLUK_ALANLARI.reduce((a,x)=>a+x.agirlik,0)===100);
t('bos puan Seviye 0', O.olgunlukHesapla({}).skor===0);
t('tam puan Seviye 4', O.olgunlukHesapla(
  Object.fromEntries(O.OLGUNLUK_ALANLARI.map(a=>[a.id,4]))).skor===100);
t('makine baglantisi en agirlikli', O.OLGUNLUK_ALANLARI[0].agirlik===25);
const orta=O.olgunlukHesapla({makine_baglanti:4,malzeme_besleme:2,parca_takip:2,
  kalite_olcum:2,tasima:2,istisna_yonetimi:2,uzaktan_izleme:2});
t('orta skor Seviye 2-3 arasi', orta.skor>=40 && orta.skor<80);
t('seviye aciklamasi var', !!orta.aciklama);

console.log('\n-- MAKINE OLAY UCU (API) --');
t('makineOlay ucu var', /action === 'makineOlay'/.test(api));
t('CIHAZ JETONU ile dogrulama', /HTTP_X_CIHAZ_JETON/.test(api));
t('zamanlama saldirisina karsi hash_equals', /hash_equals/.test(api));
t('tanimsiz makine reddediliyor', /Makine tanımlı değil/.test(api));
t('append-only tablo (cakisma yok)', /CREATE TABLE IF NOT EXISTS makine_olaylari/.test(api));
t('indeks var (hizli okuma)', /CREATE INDEX IF NOT EXISTS ix_makine_olay/.test(api));
t('toplu olay siniri (500)', /en fazla 500 olay/.test(api));
t('islem (transaction) kullaniliyor', /beginTransaction[\s\S]{0,600}makine_olaylari|makine_olaylari[\s\S]{0,900}commit/.test(api));
t('okuma ucu oturum istiyor', /action === 'makineOlaylari'[\s\S]{0,120}oturumZorunlu/.test(api));
t('jeton YALNIZCA yazma yetkisi', !/HTTP_X_CIHAZ_JETON[\s\S]{0,2000}koleksiyonYetkiKontrol/.test(api));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
