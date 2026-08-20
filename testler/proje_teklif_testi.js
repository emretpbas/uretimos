// Mahal bazli proje teklifi: iskonto sirasi, ek gider, maliyet kirilimi, kopyala/tasi
global.App={uid:p=>p+'-'+Math.random().toString(36).slice(2,7)};
const M=require('../proje_teklif_motor.js');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

const teklif=()=>({dipIskonto:5,kdvOrani:20,
 mahaller:[
  {id:'m1',ad:'Standart Oda',adet:80,kalemler:[
    {id:'k1',urunId:'U1',ad:'Gardirop',listeFiyati:12000,miktar:1,iskontoYuzde:10},
    {id:'k2',urunId:'U2',ad:'Komodin',listeFiyati:3000,miktar:2,iskontoYuzde:0}]},
  {id:'m2',ad:'Suit',adet:12,kalemler:[
    {id:'k3',urunId:'U1',ad:'Gardirop',listeFiyati:12000,miktar:2,iskontoYuzde:5}]}],
 ekGiderler:[{ad:'Montaj',tutar:150000,musteriyeYansit:true},
             {ad:'Nakliye',tutar:80000,musteriyeYansit:false}]});

console.log('\n-- MAHAL HESABI --');
const mh=M.mahalHesapla(teklif().mahaller[0]);
t('birim liste 18.000 (12000+6000)', mh.birimListe===18000);
t('birim net 16.800 (gardirop %10)', mh.birimNet===16800);
t('mahal adedi ile carpiliyor (x80)', mh.toplamNet===1344000);
t('adet 0/bos ise 1 sayilir', M.mahalHesapla({adet:0,kalemler:[{listeFiyati:100,miktar:1}]}).adet===1);
t('bos mahal sifir doner', M.mahalHesapla({adet:5,kalemler:[]}).toplamNet===0);

console.log('\n-- ISKONTO SIRASI (satir -> dip) --');
const h=M.teklifHesapla(teklif());
t('ara toplam liste 1.728.000', h.araToplamListe===1728000);
t('satir iskontolari 110.400', h.satirIskontoToplam===110400);
t('ara toplam net 1.617.600', h.araToplamNet===1617600);
t('dip iskonto NET uzerinden (%5 = 80.880)', h.dipIskontoTutar===80880);
t('iskontolu toplam 1.536.720', h.iskontoluToplam===1536720);
t('yansiyan gider SADECE isaretli (150k)', h.yansiyanGider===150000);
t('ic gider TUMU (230k)', h.icGiderToplam===230000);
t('matrah = iskontolu + yansiyan', h.matrah===1686720);
t('KDV %20 dogru', h.kdv===337344);
t('genel toplam 2.024.064', h.genelToplam===2024064);

console.log('\n-- ISKONTO SINIRLARI --');
const t2=teklif(); t2.mahaller[0].kalemler[0].iskontoYuzde=150;
t('satir iskontosu %100 u asamaz', M.teklifHesapla(t2).mahaller[0].detay[0].satirNet===0);
const t3=teklif(); t3.mahaller[0].kalemler[0].iskontoYuzde=-10;
t('negatif iskonto 0 a cekiliyor', M.teklifHesapla(t3).mahaller[0].detay[0].satirNet===12000);
const t4=teklif(); t4.dipIskonto=200;
t('dip iskonto %100 u asamaz', M.teklifHesapla(t4).iskontoluToplam===0);

console.log('\n-- MALIYET KIRILIMI --');
const soz={U1:{hammadde:4000,rota:1200},U2:{hammadde:900,rota:300}};
const mk=M.maliyetKirilimi(teklif(),soz);
t('hammadde 560.000', mk.hammadde===560000);
t('rota 172.800', mk.rota===172800);
t('ek gider TUMU maliyete girer (230k)', mk.ekGider===230000);
t('toplam maliyet 962.800', mk.toplam===962800);
t('gelir KDV HARIC (1.686.720)', mk.gelir===1686720);
t('kar 723.920', mk.kar===723920);
t('marj %42.9', Math.abs(mk.marj-42.9)<0.1);
t('tum maliyetler bilindi -> guvenilir', mk.guvenilir===true);

console.log('\n-- EKSIK MALIYET UYARISI (kritik) --');
const mk2=M.maliyetKirilimi(teklif(),{U1:{hammadde:4000,rota:1200}});  // U2 yok
t('bilinmeyen kalem sayildi', mk2.bilinmeyenAdet===1);
t('guvenilir DEGIL isaretlendi', mk2.guvenilir===false);
t('bilinmeyen kalem listelendi', mk2.bilinmeyenler[0].kalem==='Komodin');
t('eksik maliyet kari YUKSEK gosteriyor', mk2.kar>mk.kar);

console.log('\n-- MAHAL KOPYALA (derin kopya) --');
const orj=teklif().mahaller[0];
const kop=M.mahalKopyala(orj,'Standart Oda B');
t('yeni id verildi', kop.id!==orj.id);
t('ad degisti', kop.ad==='Standart Oda B');
t('kalem sayisi ayni', kop.kalemler.length===orj.kalemler.length);
t('kalemlere YENI id verildi', kop.kalemler[0].id!==orj.kalemler[0].id);
kop.kalemler[0].listeFiyati=999;
t('DERIN kopya: orjinal etkilenmedi', orj.kalemler[0].listeFiyati===12000);
t('ad verilmezse (kopya) ekleniyor', M.mahalKopyala(orj).ad.includes('kopya'));

console.log('\n-- KALEM TASIMA --');
const tt=teklif();
let r=M.kalemTasi(tt,'m1','k1','m2');
t('kalem tasindi', r.ok===true);
t('kaynaktan cikti', tt.mahaller[0].kalemler.length===1);
t('hedefe eklendi', tt.mahaller[1].kalemler.length===2);
t('ayni mahale tasima engelli', M.kalemTasi(tt,'m2','k1','m2').ok===false);
t('olmayan mahal reddediliyor', M.kalemTasi(tt,'m1','k2','yok').ok===false);
t('olmayan kalem reddediliyor', M.kalemTasi(tt,'m1','yok','m2').ok===false);

console.log('\n-- MAHAL LISTESI CIKARIMI --');
const o=M.mahalListesiCikar('Standart Oda x80\n12 adet Suit\nLobi (1)\nToplanti Salonu x3\nalakasiz bir satir\n');
t('4 mahal cikarildi', o.length===4);
t('x kalibi (Standart Oda 80)', o.find(x=>x.ad==='Standart Oda').adet===80);
t('adet kalibi (Suit 12)', o.find(x=>x.ad==='Suit').adet===12);
t('parantez kalibi (Lobi 1)', o.find(x=>x.ad==='Lobi').adet===1);
t('alakasiz satir atlandi', !o.some(x=>x.ad.includes('alakasiz')));
t('ayni mahal tekrarinda adet toplanir',
  M.mahalListesiCikar('Oda x10\nOda x5').length===1 && M.mahalListesiCikar('Oda x10\nOda x5')[0].adet===15);
t('sacma adet reddediliyor', M.mahalListesiCikar('X x99999').length===0);
t('bos metin bos dizi', M.mahalListesiCikar('').length===0);


console.log('\n-- SIPARISE DONUSTURME --');
const st=teklif();
const sk=M.siparisKalemleriUret(st);
t('3 kalem uretildi', sk.length===3);
t('miktar mahal adediyle carpildi (1x80)', sk.find(k=>k.mahal==='Standart Oda'&&k.ad==='Gardirop').miktar===80);
t('komodin 2x80=160', sk.find(k=>k.ad==='Komodin').miktar===160);
t('suit gardirop 2x12=24', sk.find(k=>k.mahal==='Suit').miktar===24);
t('AYNI urun farkli mahalde AYRI satir', sk.filter(k=>k.ad==='Gardirop').length===2);
t('mahal adi kalemde tasiniyor', sk.every(k=>!!k.mahal));
t('birim fiyat iskontolu (12000 -%10 = 10800)', sk.find(k=>k.mahal==='Standart Oda'&&k.ad==='Gardirop').birimFiyat===10800);
t('satir tutari = birim x miktar', sk.find(k=>k.ad==='Komodin').tutar===3000*160);
t('bos teklifte bos dizi', M.siparisKalemleriUret({mahaller:[]}).length===0);

console.log('\n-- MALIYET: amortisman + GYG dahil --');
const soz2={U1:{hammadde:4000,rota:1200,amortisman:200,gyg:500},U2:{hammadde:900,rota:300,amortisman:50,gyg:100}};
const mk3=M.maliyetKirilimi(teklif(),soz2);
t('amortisman hesaplandi', mk3.amortisman>0);
t('gyg hesaplandi', mk3.gygGider>0);
t('toplam = hammadde+rota+amortisman+gyg+ekgider',
  Math.abs(mk3.toplam-(mk3.hammadde+mk3.rota+mk3.amortisman+mk3.gygGider+mk3.ekGider))<0.01);
t('amortisman dahil kar DAHA DUSUK', mk3.kar < M.maliyetKirilimi(teklif(),{U1:{hammadde:4000,rota:1200},U2:{hammadde:900,rota:300}}).kar);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
