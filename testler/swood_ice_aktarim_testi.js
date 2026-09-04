// SWOOD RAPORU İÇE AKTARIMI — SolidWorks SWOOD eklentisinin ürettiği rapor
// ZIP'i (mobilya/ahşap işleme için kesim listesi + teknik resim) doğrudan
// İş Emri Formu'na (FR.29) besler. Kullanıcının paylaştığı gerçek bir SWOOD
// raporu incelendi: "Saw Cut Export/*.csv" (DESC;LENGHT;WIDTH;QTY;MATERIAL;
// EBF;EBB;EBL;EBR;...;SAP_CODE) İş Emri Formu'nun satır şemasıyla neredeyse
// birebir örtüşüyor — bu STEP'ten bile daha güvenilir bir kaynak, çünkü
// ölçü/malzeme SWOOD'un kendi kesim listesinden gelir, tahmin gerekmez.
//
// GÜVENLİK İLKESİ (STEP/PDF/DWG okuyucularıyla AYNI): EBF/EBB/EBL/EBR (4
// kenarın hangisinde bant olduğu) alanları hangi SWOOD sürümünde nasıl
// dolduğu doğrulanmadan BOY/EN yönüne KESİN eşlenmiyor — otomatik PVC/SOFT
// doldurma YAPILMIYOR, yalnızca açıklamaya not düşülüyor, kullanıcı elle
// işaretliyor. Bu test SERTÇE bu davranışı doğruluyor (pvc grupları hep
// {boy:0,en:0} kalmalı).
//
// swood_okuyucu.js (ZIP'ten CSV/görsel çıkarma) ve is_emri_uretici.js
// (CSV → satır dönüşümü) dual-mode olduğu için doğrudan require edilip
// gerçek verilerle test edilebilir. page_is_emri_formu.js Store/DOM'a bağlı
// olduğu için (diğer page_* testleriyle aynı desende) kaynak kod üzerinde
// regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const SwoodOkuyucu = require('../swood_okuyucu.js');
const IsEmriUretici = require('../is_emri_uretici.js');
const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'page_is_emri_formu.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- index.html: JSZip ve swood_okuyucu.js yükleniyor --');
t('jszip.min.js script etiketi var', /<script src="jszip\.min\.js">/.test(indexSrc));
t('swood_okuyucu.js script etiketi var', /<script src="swood_okuyucu\.js\?v=\d+">/.test(indexSrc));

console.log('\n-- swood_okuyucu.js: CSV ayrıştırma (saf fonksiyon) --');
{
  const GERCEK_BASLIK = 'DESC;LENGHT;WIDTH;QTY;MATERIAL;EBF;EBB;EBL;EBR;INFO1;TYPE_ASSEMBLY;EB_DIAGRAM;GRAIN;PRJNUM;MATSUPPLIER;CABINET_NAME;CABINET_POSITION;SAP_CODE;;';

  t('boş CSV (yalnızca başlık, gerçek kullanıcı dosyasındaki gibi) -> 0 satır',
    SwoodOkuyucu.csvSatirlariniAyristir(GERCEK_BASLIK).length === 0);

  const iki = GERCEK_BASLIK + '\n' +
    'ÜST TABLA;752,00;370,00;1;SUNTALAM ÇY 18MM KAR BEYAZ;X;;X;;;;;boyuna;;;ALT TABLA;pos1;50.002.218.01.012.00;;\n' +
    'YAN PANEL;700,50;400;2;SUNTALAM ÇY 8MM ORMA;;;;;;;;;;;ALT TABLA;pos2;;;\n';
  const satirlar = SwoodOkuyucu.csvSatirlariniAyristir(iki);
  t('iki veri satırı doğru ayrıştırıldı', satirlar.length === 2);
  t('sondaki isimsiz sütunlar (;;) satır nesnesine sızmıyor', !Object.keys(satirlar[0]).includes(''));
  t('DESC doğru okundu', satirlar[0].DESC === 'ÜST TABLA');
  t('EBF/EBL dolu, EBB/EBR boş okundu', satirlar[0].EBF === 'X' && satirlar[0].EBL === 'X' && satirlar[0].EBB === '' && satirlar[0].EBR === '');
  t('tamamen boş satırlar atlanıyor',
    SwoodOkuyucu.csvSatirlariniAyristir(GERCEK_BASLIK + '\n;;;;;;;;;;;;;;;;;;;\n').length === 0);
  t('BOM işaretli dosya da doğru ayrıştırılıyor',
    SwoodOkuyucu.csvSatirlariniAyristir('﻿' + iki).length === 2);
  t('CRLF satır sonu da destekleniyor',
    SwoodOkuyucu.csvSatirlariniAyristir(iki.replace(/\n/g, '\r\n')).length === 2);
}

console.log('\n-- is_emri_uretici.js: swoodDenUret CSV satırlarını İş Emri Formu satırına çeviriyor --');
{
  const satirlar1 = [{
    DESC: 'ÜST TABLA', LENGHT: '752,00', WIDTH: '370,00', QTY: '1',
    MATERIAL: 'SUNTALAM ÇY 18MM KAR BEYAZ', EBF: 'X', EBB: '', EBL: 'X', EBR: '',
    GRAIN: 'boyuna', CABINET_NAME: 'ALT TABLA', CABINET_POSITION: 'pos1',
    SAP_CODE: '50.002.218.01.012.00'
  }];
  const r1 = IsEmriUretici.swoodDenUret(satirlar1, {});
  const s = r1.satirlar[0];
  t('1 satır üretildi', r1.satirlar.length === 1);
  t('virgüllü ondalık (752,00) doğru sayıya çevrildi', s.netBoy === 752);
  t('genişlik doğru', s.netEn === 370);
  t('adet doğru', s.netAdet === 1);
  t('kalınlık MATERIAL metninden çıkarıldı (18)', s.kalinlik === 18);
  t('renk MATERIAL metninden çıkarıldı (BEYAZ)', s.renk === 'BEYAZ');
  t('SAP_CODE parcaKodu\'na atandı', s.parcaKodu === '50.002.218.01.012.00');
  t('CABINET_NAME paketNo\'ya atandı', s.paketNo === 'ALT TABLA');
  t('parcaAdi DESC\'ten geldi', s.parcaAdi === 'ÜST TABLA');

  console.log('\n  -- KRİTİK GÜVENLİK KONTROLÜ: kenar bandı yönü OTOMATİK doldurulmuyor --');
  ['pvc2', 'pvc1', 'pvc040', 'soft'].forEach(grup => {
    t(`${grup}.boy hâlâ 0 (EBF/EBL dolu olmasına rağmen otomatik atanmadı)`, s[grup].boy === 0);
    t(`${grup}.en hâlâ 0`, s[grup].en === 0);
  });
  t('hangi kenarlarda bant olduğu açıklamaya NOT düşüldü (Ön,Sol)', /SWOOD kenar bantlı: Ön,Sol/.test(s.aciklamalar));
  t('dolap adı/pozisyonu açıklamaya eklendi', /Dolap: ALT TABLA \(pos1\)/.test(s.aciklamalar));
  t('tahıl yönü açıklamaya eklendi', /Tahıl: boyuna/.test(s.aciklamalar));
  t('uyarı metni kenar bandını kontrol etmeyi hatırlatıyor', /kenar bandı.*yönleri.*OTOMATİK doldurulmadı/.test(r1.uyari));

  console.log('\n  -- Kenar bandı hiç yoksa açıklamada kenar notu OLMAMALI --');
  const satirlar2 = [{ DESC: 'PARÇA', LENGHT: '500', WIDTH: '300', QTY: '3', MATERIAL: 'MDF 18MM', EBF: '', EBB: '', EBL: '', EBR: '' }];
  const r2 = IsEmriUretici.swoodDenUret(satirlar2, {});
  t('bant yoksa "SWOOD kenar bantlı" notu eklenmiyor', !/SWOOD kenar bantlı/.test(r2.satirlar[0].aciklamalar));

  console.log('\n  -- Birden fazla satır bağımsız işleniyor (paketNo karışmıyor) --');
  const satirlarCoklu = [
    { DESC: 'A', LENGHT: '100', WIDTH: '100', QTY: '1', MATERIAL: 'MDF 18MM', CABINET_NAME: 'DOLAP-1' },
    { DESC: 'B', LENGHT: '200', WIDTH: '200', QTY: '1', MATERIAL: 'MDF 8MM', CABINET_NAME: 'DOLAP-2' }
  ];
  const rCoklu = IsEmriUretici.swoodDenUret(satirlarCoklu, {});
  t('ilk satırın paketNo\'su DOLAP-1', rCoklu.satirlar[0].paketNo === 'DOLAP-1');
  t('ikinci satırın paketNo\'su DOLAP-2 (bağımsız, karışmadı)', rCoklu.satirlar[1].paketNo === 'DOLAP-2');

  console.log('\n  -- Boş CSV listesi (gerçek kullanıcı dosyasındaki durum) --');
  const rBos = IsEmriUretici.swoodDenUret([], {});
  t('boş liste -> 0 satır', rBos.satirlar.length === 0);
  t('boş liste için uygun uyarı', /kesim listesi.*bulunamadı/.test(rBos.uyari));
}

// Gerçek bir SWOOD kullanıcı raporu incelendiğinde "Saw Cut Export" CSV'sinin
// bazı kurulumlarda HİÇ dolmadığı görüldü (yalnızca başlık) — ama aynı raporun
// "Docs/*_ReportStocks.html" dosyası her panel için LENGTH/WIDTH/THICKNESS/
// Material/Edgeband(N) bilgisini GERÇEK verilerle taşıyor. Aşağıdaki fixture,
// gerçek raporun (2 panel, biri kenar bantlı biri bantsız) yapısını birebir
// yansıtır — HTML sayısal karakter referansları (&#220;=Ü, &#199;=Ç) ve
// "&nbsp" (noktalı virgülsüz) dahil.
const STOKLAR_HTML_ORNEK = `
<tr class="cellule_menu"><td colspan="5"><a><b>ALT TABLA</b></a></td></tr>
<tr><td rowspan="1000"><a href="ALT TABLA_Default_PanelDetails.html"><img src="IMAGE/x.jpg"></a></td>
<td></td><td><b><center>LENGTH</center></b></td><td><b><center>WIDTH</center></b></td><td><b><center>THICKNESS</center></b></td></tr>
<tr><td>Dimensions (Stock)</td><td><center><b>664.00</b></center></td><td><center><b>370.00</b></center></td><td><center><b>18.00</b></center></td></tr>
<tr><td>Material</td><td colspan="2"><center>SUNTALAM &#199;Y 18MM KAR BEYAZ</center></td><td><center>&nbsp</center></td></tr>
<tr><td>Edgeband (1)</td><td colspan="2"><center>KENAR BANT PVC BEYAZ 1*22 5778GB EGGER</center></td><td><center>1.00</center></td></tr>
<tr><td>Edgeband (2)</td><td colspan="2"><center>KENAR BANT PVC ANTRASİT GRİ 1*22 EGGER</center></td><td><center>1.00</center></td></tr>
<tr><td colspan="3">Description: Alt tabla_2</td><td colspan="1">Quantity:<script>if (0==0){document.write (1);}else {document.write (Math.round(1*0));}</script></td></tr>
<tr class="cellule_menu"><td colspan="5"><a><b>&#220;ST TABLA</b></a></td></tr>
<tr><td rowspan="1000"><a href="ÜST TABLA_Default_PanelDetails.html"><img src="IMAGE/y.jpg"></a></td>
<td></td><td><b><center>LENGTH</center></b></td><td><b><center>WIDTH</center></b></td><td><b><center>THICKNESS</center></b></td></tr>
<tr><td>Dimensions (Stock)</td><td><center><b>700.00</b></center></td><td><center><b>400.00</b></center></td><td><center><b>18.00</b></center></td></tr>
<tr><td>Material</td><td colspan="2"><center>SUNTALAM &#199;Y 18MM KAR BEYAZ</center></td><td><center>&nbsp</center></td></tr>
<tr><td>Edgeband (1)</td><td colspan="2"><center>KENAR BANT PVC ANTRASİT GRİ 0,40*22 EGGER</center></td><td><center>0.00</center></td></tr>
<tr><td colspan="3">Description: &#220;st tabla_2</td><td colspan="1">Quantity:<script>if (0==0){document.write (2);}else {document.write (Math.round(1*0));}</script></td></tr>
`;

console.log('\n-- swood_okuyucu.js: "Stoklar" raporu (ReportStocks.html) ayrıştırma — Saw Cut Export boş geldiğinde yedek kaynak --');
{
  const paneller = SwoodOkuyucu.stoklarHtmlAyristir(STOKLAR_HTML_ORNEK);
  t('2 panel ayrıştırıldı', paneller.length === 2);
  t('panel adı HTML varlık kodundan doğru çözüldü (&#199;->Ç, düz metin)', paneller[0].ad === 'ALT TABLA');
  t('ikinci panelin adında &#220; -> Ü doğru çözüldü', paneller[1].ad === 'ÜST TABLA');
  t('boy (LENGTH) doğru okundu', paneller[0].boy === 664);
  t('en (WIDTH) doğru okundu', paneller[0].en === 370);
  t('kalınlık (THICKNESS) MATERIAL metninden DEĞİL doğrudan HTML sütunundan okundu', paneller[0].kalinlik === 18);
  t('malzeme metni &nbsp/varlık kodlarından temizlendi', paneller[0].malzeme === 'SUNTALAM ÇY 18MM KAR BEYAZ');
  t('description doğru okundu', paneller[0].description === 'Alt tabla_2');
  t('quantity document.write\'tan okundu', paneller[0].adet === 1 && paneller[1].adet === 2);
  t('1. panelde 2 kenar bandı (adet>0) listelendi', paneller[0].kenarBantlari.length === 2);
  t('kenar bandı malzeme adı doğru', paneller[0].kenarBantlari[0].malzeme === 'KENAR BANT PVC BEYAZ 1*22 5778GB EGGER');
  t('kenar bandı adedi doğru', paneller[0].kenarBantlari[0].adet === 1);
  t('adedi 0.00 olan Edgeband satırı (2. panel) FİLTRELENDİ — kenar bandı YOK sayıldı',
    paneller[1].kenarBantlari.length === 0);
  t('Dimensions (Stock) olmayan/bozuk bloklar atlanıyor (boş HTML -> 0 panel)',
    SwoodOkuyucu.stoklarHtmlAyristir('<tr class="cellule_menu"><td><b>GÜRÜLTÜ</b></td></tr>').length === 0);
  t('boş girdi -> 0 panel', SwoodOkuyucu.stoklarHtmlAyristir('').length === 0);
}

console.log('\n-- is_emri_uretici.js: swoodStoklarDenUret "Stoklar" panellerini İş Emri Formu satırına çeviriyor --');
{
  const paneller = SwoodOkuyucu.stoklarHtmlAyristir(STOKLAR_HTML_ORNEK);
  const r = IsEmriUretici.swoodStoklarDenUret(paneller, {});
  t('2 satır üretildi', r.satirlar.length === 2);
  const s0 = r.satirlar[0];
  t('parçaAdı panel adından geldi', s0.parcaAdi === 'ALT TABLA');
  t('netBoy HTML\'den geldi', s0.netBoy === 664);
  t('netEn HTML\'den geldi', s0.netEn === 370);
  t('kalınlık HTML\'den geldi (MATERIAL metninden tahmin YOK)', s0.kalinlik === 18);
  t('renk MATERIAL metninden çıkarıldı', /BEYAZ/.test(s0.renk));
  t('netAdet document.write\'tan geldi', s0.netAdet === 1);

  console.log('\n  -- KRİTİK GÜVENLİK KONTROLÜ: kenar bandı yönü (boy/en) OTOMATİK doldurulmuyor --');
  ['pvc2', 'pvc1', 'pvc040', 'soft'].forEach(grup => {
    t(`${grup}.boy hâlâ 0 (Edgeband malzeme+adet bilgisine rağmen yön atanmadı)`, s0[grup].boy === 0);
    t(`${grup}.en hâlâ 0`, s0[grup].en === 0);
  });
  t('kenar bandı malzeme+adedi açıklamaya not düşüldü',
    /SWOOD kenar bandı: 1x KENAR BANT PVC BEYAZ 1\*22 5778GB EGGER, 1x KENAR BANT PVC ANTRASİT GRİ 1\*22 EGGER/.test(s0.aciklamalar));
  t('uyarı "Stoklar" raporundan geldiğini ve yönün otomatik atanmadığını belirtiyor',
    /Stoklar.*raporundan.*OTOMATİK doldurulmadı/.test(r.uyari));

  const s1 = r.satirlar[1];
  t('kenar bandı olmayan panelde (2. panel) "SWOOD kenar bandı" notu YOK', !/SWOOD kenar bandı/.test(s1.aciklamalar));

  console.log('\n  -- Boş panel listesi --');
  const rBos = IsEmriUretici.swoodStoklarDenUret([], {});
  t('boş liste -> 0 satır', rBos.satirlar.length === 0);
  t('boş liste için uygun uyarı', /ne kesim listesi.*ne de Stoklar raporunda/.test(rBos.uyari));
}

console.log('\n-- swood_okuyucu.js: oku() Saw Cut Export boşsa Stoklar raporuna düşüyor (kaynak-doğrulama) --');
{
  const okuSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'swood_okuyucu.js'), 'utf8');
  t('ReportStocks.html aranıyor', /ReportStocks\\\.html\$/.test(okuSrc));
  t('csvSatirlari boşsa stoklarHtmlAyristir çağrılıyor', /if \(!csvSatirlari\.length\) \{[\s\S]{0,400}stoklarHtmlAyristir\(html\)/.test(okuSrc));
  t('sonuç nesnesi stokPanelleri alanı içeriyor', /return \{ dosyaAdi: file\.name, csvSatirlari, stokPanelleri, teknikResimler, uyarilar \};/.test(okuSrc));
}

console.log('\n-- page_is_emri_formu.js: SWOOD ZIP\'i içe aktarım akışına bağlandı --');
t('.zip dosya uzantısı kabul ediliyor', /accept="\.step,\.stp,\.STEP,\.STP,\.pdf,\.dwg,\.zip,\.ZIP"/.test(pageSrc));
t('dosyaOku artık .zip dalını işliyor', /if \(\/\\\.zip\$\/\.test\(ad\)\) \{/.test(pageSrc));
t('SwoodOkuyucu.oku çağrılıyor', /const sonuc = await SwoodOkuyucu\.oku\(f\);/.test(pageSrc));
t('csvSatirlari doluysa swoodDenUret çağrılıyor', /const u = sonuc\.csvSatirlari\.length[\s\S]{0,20}\? IsEmriUretici\.swoodDenUret\(sonuc\.csvSatirlari, \{\}\)/.test(pageSrc));
t('csvSatirlari boşsa swoodStoklarDenUret\'e (yedek kaynak) düşülüyor', /: IsEmriUretici\.swoodStoklarDenUret\(sonuc\.stokPanelleri, \{\}\);/.test(pageSrc));
t('ipucu metni "Stoklar" raporu yedek kaynağını açıklıyor', /"Stoklar" raporu \(ReportStocks\) yedek olarak otomatik denenir/.test(pageSrc));
t('PDF önizleme artık href="#" kullanıyor (data: URL\'ye doğrudan navigasyon YOK — Chrome bunu engelliyor)',
  /<a href="#" class="ie-swood-pdf"/.test(pageSrc));
t('dataUrlBlobUrlYap fonksiyonu tanımlı (data: -> blob: dönüşümü)', /function dataUrlBlobUrlYap\(dataUrl\) \{/.test(pageSrc));
t('PDF tıklamasında blob: URL\'si window.open ile açılıyor', /window\.open\(dataUrlBlobUrlYap\(r\.dataUrl\), '_blank', 'noopener'\);/.test(pageSrc));
t('swoodResimler modül durumu tanımlı', /let swoodResimler = \[\];/.test(pageSrc));
t('"Yeni Form" ile swoodResimler de temizleniyor', /form = bosForm\(\); ekBilgi = null; swoodResimler = \[\]; render\(main\);/.test(pageSrc));
t('teknikResimlerCiz fonksiyonu tanımlı', /function teknikResimlerCiz\(\) \{/.test(pageSrc));
t('render() teknik resimleri gösteriyor', /if \(swoodResimler\.length\) teknikResimlerCiz\(\);/.test(pageSrc));
t('şablon SWOOD teknik resim alanı içeriyor (id="ie-swood-resim")', /id="ie-swood-resim"/.test(pageSrc));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
