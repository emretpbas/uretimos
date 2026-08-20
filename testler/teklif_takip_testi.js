// Teklif degerlendirme: durum, bekleme, revizyon, sorumlu zorunlulugu, rapor
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const T=require('../teklif_takip_motor.js');
const tx=fs.readFileSync(path.join(KOK,'teklif_excel.js'),'utf8');
const td=fs.readFileSync(path.join(KOK,'page_teklif_degerlendirme.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};
const g=(n)=>new Date(Date.now()-n*86400000).toISOString();

const veri=[
 {kod:'T1',durum:'beklemede',tutar:500000,gonderimTarihi:g(45),sorumlu:'Ahmet',beklemeSebebi:'Bütçe onayı bekleniyor',revizyonlar:[1,2,3]},
 {kod:'T2',durum:'gonderildi',tutar:200000,gonderimTarihi:g(5),sorumlu:'Ayşe',revizyonlar:[]},
 {kod:'T3',durum:'kazanildi',tutar:800000,gonderimTarihi:g(60),kapanisTarihi:g(40),sorumlu:'Ahmet',revizyonlar:[1]},
 {kod:'T4',durum:'kaybedildi',tutar:300000,gonderimTarihi:g(30),kapanisTarihi:g(10),sorumlu:'Ayşe',kayipSebebi:'Fiyat yüksek',revizyonlar:[]},
 {kod:'T5',durum:'beklemede',tutar:150000,gonderimTarihi:g(20),revizyonlar:[]},
];

console.log('\n-- OZET --');
const o=T.ozet(veri);
t('toplam 5', o.toplam===5);
t('acik 3 (taslak/kapali haric)', o.acik===3);
t('kazanma orani %50 (1/2)', o.kazanmaOrani===50);
t('az veride guvenilir degil', o.guvenilir===false);
t('acik tutar 850k', o.acikTutar===850000);
t('sorumsuz teklif 1 tespit edildi', o.sorumlusuz===1);
t('toplam revizyon 4', o.toplamRevizyon===4);

console.log('\n-- BEKLEME SURESI --');
t('acik teklifte bugune kadar', T.bekleyenGun(veri[0])===45);
t('KAPALI teklifte kapanisa kadar (30-10=20)', T.bekleyenGun(veri[3])===20);
t('gonderim yoksa null', T.bekleyenGun({durum:'taslak'})===null);

console.log('\n-- YASLANDIRMA --');
const y=T.yaslandirma(veri);
t('0-7 kovasinda 1', y[0].adet===1);
t('16-30 kovasinda 1', y[2].adet===1);
t('31-60 kovasinda 1', y[3].adet===1);
t('KAPALI teklifler yaslandirmaya girmiyor', y.reduce((a,k)=>a+k.adet,0)===3);

console.log('\n-- SEBEP ANALIZLERI --');
const ka=T.kayipAnalizi(veri);
t('kayip sebebi gruplandi', ka.length===1 && ka[0].sebep==='Fiyat yüksek');
t('kayip tutari toplandi', ka[0].tutar===300000);
const ba=T.beklemeAnalizi(veri);
t('bekleme sebebi gruplandi', ba.length===2);
t('sebepsiz olanlar "Belirtilmemis"', ba.some(x=>x.sebep==='Belirtilmemiş'));

console.log('\n-- SORUMLU PERFORMANSI --');
const p=T.sorumluPerformansi(veri);
t('3 sorumlu (Ahmet, Ayse, atanmamis)', p.length===3);
t('Ahmet 2 teklif', p.find(x=>x.sorumlu==='Ahmet').toplam===2);
t('Ahmet orani %100', p.find(x=>x.sorumlu==='Ahmet').oran===100);
t('Ayse orani %0', p.find(x=>x.sorumlu==='Ayşe').oran===0);
t('atanmamis ayri gosteriliyor', p.some(x=>x.sorumlu==='—'));

console.log('\n-- UYARILAR --');
const u=T.uyarilar(veri,14);
t('sorumsuz teklif EN YUKSEK oncelik', u[0].tip==='sorumsuz');
t('45 gunluk gecikme yakalandi', u.some(x=>x.tip==='gecikme'&&x.teklif.kod==='T1'));
t('5 gunluk teklif gecikme sayilmadi', !u.some(x=>x.tip==='gecikme'&&x.teklif.kod==='T2'));
t('3+ revizyon uyarisi', u.some(x=>x.tip==='cok_revizyon'&&x.teklif.kod==='T1'));
t('sebepsiz bekleme uyarisi', u.some(x=>x.tip==='sebepsiz'));

console.log('\n-- DURUM DEGISTIRME KURALLARI --');
t('kayip sebebi ZORUNLU',
  T.durumDegistirGecerli({durum:'beklemede',sorumlu:'A'},'kaybedildi',{}).ok===false);
t('sebeple kaybedilebilir',
  T.durumDegistirGecerli({durum:'beklemede',sorumlu:'A'},'kaybedildi',{kayipSebebi:'Fiyat yüksek'}).ok===true);
t('bekleme sebebi ZORUNLU',
  T.durumDegistirGecerli({durum:'gonderildi',sorumlu:'A'},'beklemede',{}).ok===false);
t('SORUMLU olmadan gonderilemez',
  T.durumDegistirGecerli({durum:'taslak'},'gonderildi',{}).ok===false);
t('sorumlu varsa gonderilir',
  T.durumDegistirGecerli({durum:'taslak'},'gonderildi',{sorumlu:'Ahmet'}).ok===true);
t('ayni duruma gecis engelli',
  T.durumDegistirGecerli({durum:'beklemede'},'beklemede',{}).ok===false);
t('gecersiz durum reddediliyor',
  T.durumDegistirGecerli({durum:'taslak'},'olmayan',{}).ok===false);

console.log('\n-- EXCEL / ANTET --');
t('logo boyut siniri 400KB', /AZAMI_LOGO = 400 \* 1024/.test(tx));
t('sadece resim kabul ediliyor', /image\\\/\(png\|jpeg\|jpg\|gif\|webp\)/.test(tx));
t('Excel uretimi var', /function excelUret/.test(tx));
t('antetli HTML uretimi var', /function htmlUret/.test(tx));
t('firma ve musteri logosu ayri', /firmaLogo/.test(tx) && /musteriLogo/.test(tx));
// Musteri ciktisi = htmlUret govdesi (icmalUret ayri, o YONETIM belgesi)
const musteriGovde=(tx.split('function htmlUret')[1]||'').split('function yazdir')[0];
t('MALIYET musteri ciktisina YAZILMIYOR', !/maliyet|hammadde|rotaMaliyet|karMarj/i.test(musteriGovde));
t('yonetim icmali AYRI belge', /function icmalUret/.test(tx));
t('Excel de logo kisiti kodda aciklanmis', /Logo görselleri XLSX/.test(tx));
t('kullaniciya da bildiriliyor', /kütüphane kısıtı/.test(fs.readFileSync(path.join(KOK,'page_proje_teklif.js'),'utf8')));
t('teklif kosullari var', /Fiyatlarımıza KDV dahil değildir/.test(tx));

console.log('\n-- EKRAN --');
t('tum teklifler sekmesi', td.includes("data-s=\"tumu\""));
t('standart teklifler AYRI sekme', td.includes("data-s=\"standart\""));
t('proje teklifleri AYRI sekme', td.includes("data-s=\"proje\""));
t('yonetim raporu sekmesi', td.includes("data-s=\"rapor\""));
t('sorumlu zorunlu kontrolu', /Teklif sorumlusu zorunludur/.test(td));
t('rapor Excel e aktarilabiliyor', /function raporExcel/.test(td));
t('proje teklifleri projelerden toplaniyor', /p\.teklifler \|\| \[\]/.test(td));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
