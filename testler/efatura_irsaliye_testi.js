// e-Irsaliye: UBL-TR DespatchAdvice uretimi ve gonderim kontrolu
const E=require('../efatura_motor.js');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

const firma={unvan:'ABC Uretim A.S.', vergiNo:'1000000000', vergiDairesi:'Kadikoy', adres:'Test Mah. No:1'};
const musteri={unvan:'XYZ Ticaret Ltd.', vergiNo:'2000000002', adres:'Deneme Cad. No:2'};
const kalemler=[
  {ad:'Vida M6', kod:'STK-001', miktar:100, birim:'C62'},
  {ad:'Somun M6', kod:'STK-002', miktar:50, birim:'C62'}
];
const irsaliye={irsaliyeNo:'IRS2026000000001', tarih:'2026-09-01', sevkTarihi:'2026-09-02'};

console.log('\n-- IRSALIYE NUMARASI --');
t('varsayilan seri IRS', E.irsaliyeNoUret().slice(0,3)==='IRS');
t('ozel seri kullaniliyor', E.irsaliyeNoUret('SVK',2026,5).startsWith('SVK2026'));
t('sira 9 haneye tamamlaniyor', E.irsaliyeNoUret('IRS',2026,7).endsWith('000000007'));

console.log('\n-- IRSALIYE UBL URETIMI --');
const r=E.irsaliyeUblOlustur(irsaliye, musteri, firma, kalemler);
t('xml uretiliyor', typeof r.xml==='string' && r.xml.length>0);
t('ettn uretiliyor', typeof r.ettn==='string' && r.ettn.length>0);
t('kok eleman DespatchAdvice', r.xml.includes('<DespatchAdvice'));
t('profil TEMELIRSALIYE', r.xml.includes('<cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>'));
t('tip kodu SEVK', r.xml.includes('<cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>'));
t('irsaliye no yaziliyor', r.xml.includes('IRS2026000000001'));
t('sevk tarihi ActualDeliveryDate icinde', r.xml.includes('<cbc:ActualDeliveryDate>2026-09-02</cbc:ActualDeliveryDate>'));
t('2 despatch satiri var', (r.xml.match(/<cac:DespatchLine>/g)||[]).length===2);
t('miktar dogru yaziliyor', r.xml.includes('<cbc:DeliveredQuantity unitCode="C62">100.00</cbc:DeliveredQuantity>'));
t('urun adlari geciyor', r.xml.includes('Vida M6') && r.xml.includes('Somun M6'));
t('KDV/parasal tutar YOK (irsaliyede fiyat olmaz)', !r.xml.includes('TaxTotal') && !r.xml.includes('LegalMonetaryTotal'));
t('tedarikci DespatchSupplierParty', r.xml.includes('<cac:DespatchSupplierParty>'));
t('alici DeliveryCustomerParty', r.xml.includes('<cac:DeliveryCustomerParty>'));
t('XML kacis uygulaniyor', (()=>{
  const rr=E.irsaliyeUblOlustur(irsaliye, {unvan:'A & B "Ltd" <ozel>', vergiNo:'2000000002'}, firma, kalemler);
  return rr.xml.includes('A &amp; B &quot;Ltd&quot; &lt;ozel&gt;');
})());

console.log('\n-- IRSALIYE GONDERIM KONTROLU --');
const gk1=E.irsaliyeGonderimKontrol(irsaliye, musteri, firma, kalemler);
t('gecerli irsaliye gonderilebilir', gk1.gonderilebilir===true && gk1.hatalar.length===0);

const gk2=E.irsaliyeGonderimKontrol({}, musteri, firma, kalemler);
t('irsaliye no eksikse reddediliyor', gk2.gonderilebilir===false && gk2.hatalar.some(h=>h.includes('numarası')));

const gk3=E.irsaliyeGonderimKontrol(irsaliye, null, firma, kalemler);
t('musteri yoksa reddediliyor', gk3.gonderilebilir===false && gk3.hatalar.some(h=>h.includes('Müşteri kaydı')));

const gk4=E.irsaliyeGonderimKontrol(irsaliye, musteri, {unvan:'', vergiNo:'123'}, kalemler);
t('gecersiz firma VKN reddediliyor', gk4.gonderilebilir===false);

const gk5=E.irsaliyeGonderimKontrol(irsaliye, musteri, firma, []);
t('kalemsiz irsaliye reddediliyor', gk5.gonderilebilir===false && gk5.hatalar.some(h=>h.includes('kalem yok')));

const gk6=E.irsaliyeGonderimKontrol(irsaliye, musteri, firma, [{ad:'X', kod:'K1', miktar:0}]);
t('sifir miktarli kalem reddediliyor', gk6.gonderilebilir===false && gk6.hatalar.some(h=>h.includes('miktar')));

const gk7=E.irsaliyeGonderimKontrol(irsaliye, musteri, firma, [{miktar:5}]);
t('ad/kod eksikse reddediliyor', gk7.gonderilebilir===false && gk7.hatalar.some(h=>h.includes('ürün adı/kodu')));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');
process.exit(bad?1:0);
