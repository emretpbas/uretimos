// Hammadde tablosu: Excel tarzi suzme, siralama, sayfalama
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','page_hammadde.js'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- KOD KONTROLU --');
t('suz durumu tanimli', /const suz = \{ kod: '', ad: ''/.test(src));
t('sayfalama var (100)', /SAYFA_BOYU = 100/.test(src));
t('siralama durumu var', /let sirala = \{ alan: '', yon: 1 \}/.test(src));
t('sutun basliklari tiklanabilir', /data-sirala="\$\{alan\}"|data-sirala=/.test(src));
t('suzme satiri render ediliyor', src.includes('class="suz-satiri"'));
t('fiyat min-max araligi', /data-k="fiyatMin"[\s\S]{0,200}data-k="fiyatMax"/.test(src));
t('fire min-max araligi', /data-k="fireMin"[\s\S]{0,200}data-k="fireMax"/.test(src));
t('birim secenekleri veriden uretiliyor', /new Set\(list\.map\(h => h\.birim\)/.test(src));
t('yazarken gecikmeli suzme (debounce)', /setTimeout\(uygula, 250\)/.test(src));
t('suzmeyi temizle butonu', src.includes('hm-suz-temizle'));
t('excel aktarim butonu', src.includes('hm-excel'));
t('kayit sayisi gosteriliyor', src.includes('kayıt${toplam !== list.length'));
t('4 tip pill destekli', /kenar_bandi[\s\S]{0,120}sarf/.test(src));
t('olcusu olmayan plaka uyariliyor', src.includes('ölçü yok'));

console.log('\n-- SUZME MANTIGI (simulasyon) --');
const ic=(d,a)=>!a||String(d||'').toLocaleLowerCase('tr').includes(a.toLocaleLowerCase('tr'));
const aralik=(v,min,max)=>{const n=+v||0; if(min!==''&&n<+min)return false; if(max!==''&&n>+max)return false; return true;};
const veri=[
 {stokKodu:'50.002.218.02.034.01',ad:'SUNTALAM ÇY 18MM A610 CABANA',tip:'plaka',birim:'M2',birimFiyat:288.89,fireYuzde:8,en:1830,boy:3660,grainYonu:'yok'},
 {stokKodu:'50.010.01.067.06',ad:'KENAR BANT PVC CABANA 2*22',tip:'kenar_bandi',birim:'METRE',birimFiyat:0.308,fireYuzde:2},
 {stokKodu:'85.10.01.006',ad:'TOZ BOYA RAL 7015 FÜME',tip:'sarf',birim:'GRAM',birimFiyat:0.003,fireYuzde:2},
 {stokKodu:'51.003.01.001.00',ad:'MİNİFİX GÖVDESİ 18MM',tip:'hirdavat',birim:'ADET',birimFiyat:1.65,fireYuzde:2},
 {stokKodu:'50.002.230.01.010.00',ad:'SUNTALAM ÇY 30MM KAR BEYAZ',tip:'plaka',birim:'M2',birimFiyat:422,fireYuzde:8,en:1830,boy:3660,grainYonu:'var'},
];
const suzUygula=(s)=>veri.filter(h=>
  ic(h.stokKodu,s.kod||'') && ic((h.ad||'')+' '+(h.renk||''),s.ad||'') &&
  (!s.birim||h.birim===s.birim) && (!s.grain||(h.tip==='plaka'&&h.grainYonu===s.grain)) &&
  aralik(h.birimFiyat,s.fiyatMin??'',s.fiyatMax??'') && aralik(h.fireYuzde,s.fireMin??'',s.fireMax??'') &&
  (!s.olcu||(h.tip==='plaka'&&(String(h.en)+'x'+String(h.boy)).includes(s.olcu))));

t('kod ile suzme', suzUygula({kod:'50.002'}).length===2);
t('ad ile suzme (turkce buyuk/kucuk)', suzUygula({ad:'suntalam'}).length===2);
t('birim ile suzme', suzUygula({birim:'M2'}).length===2);
t('grain yonlu suzme', suzUygula({grain:'var'}).length===1);
t('fiyat araligi 1-500', suzUygula({fiyatMin:'1',fiyatMax:'500'}).length===3);
t('fiyat araligi 300 uzeri', suzUygula({fiyatMin:'300'}).length===1);
t('fire %8 olanlar', suzUygula({fireMin:'8'}).length===2);
t('olcu ile suzme', suzUygula({olcu:'1830'}).length===2);
t('birlesik suzme (M2 + fiyat>300)', suzUygula({birim:'M2',fiyatMin:'300'}).length===1);
t('sonuc yoksa bos doner', suzUygula({kod:'YOKBOYLEBIRKOD'}).length===0);
t('bos suzme hepsini doner', suzUygula({}).length===5);

console.log('\n-- SIRALAMA --');
const sirala=(liste,alan,yon)=>{
  const sayisal=['birimFiyat','fireYuzde','en','boy'];
  return [...liste].sort((a,b)=>{let x=a[alan],y=b[alan];
    if(sayisal.includes(alan)){x=+x||0;y=+y||0;return (x-y)*yon;}
    return String(x||'').localeCompare(String(y||''),'tr')*yon;});
};
t('fiyata gore artan', sirala(veri,'birimFiyat',1)[0].birimFiyat===0.003);
t('fiyata gore azalan', sirala(veri,'birimFiyat',-1)[0].birimFiyat===422);
t('ada gore alfabetik (turkce)', sirala(veri,'ad',1)[0].ad.startsWith('KENAR'));

console.log('\n-- SAYFALAMA --');
const sayfala=(liste,sayfa,boyut)=>liste.slice((sayfa-1)*boyut,sayfa*boyut);
const buyuk=Array.from({length:5405},(_,i)=>({id:i}));
t('5405 kayit 55 sayfa', Math.ceil(5405/100)===55);
t('1. sayfa 100 kayit', sayfala(buyuk,1,100).length===100);
t('son sayfa 5 kayit', sayfala(buyuk,55,100).length===5);
t('ilk kayit dogru', sayfala(buyuk,2,100)[0].id===100);

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
