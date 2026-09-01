// ════════════════════════════════════════════════════════════════════════════
// E-FATURA / E-ARŞİV HAZIRLIK MOTORU
//
// Türkiye'de belirli ciro eşiğini aşan mükellefler için e-Fatura ZORUNLUDUR.
// Bu modül, GİB'e gönderim için gereken tüm HAZIRLIĞI yapar:
//   • VKN / TCKN doğrulama (resmî algoritma)
//   • Fatura senaryosu belirleme (TEMEL / TİCARİ / E-ARŞİV)
//   • UBL-TR 1.2 uyumlu XML üretimi
//   • Gönderim durumu takibi (taslak → gönderildi → kabul/red)
//
// ÖNEMLİ: Gerçek GİB gönderimi bir ENTEGRATÖR anlaşması gerektirir
// (Uyumsoft, İzibiz, Logo, Paraşüt, Foriba vb.). Bu modül entegratöre
// verilecek XML'i üretir ve süreç takibini yapar; entegratör API bağlantısı
// firma anlaşması yapıldıktan sonra ayarlardaki bilgilerle kurulur.
// ════════════════════════════════════════════════════════════════════════════
const EFaturaMotor = (() => {

  // ── VKN DOĞRULAMA (10 haneli — resmî algoritma) ─────────────────────────
  // Maliye Bakanlığı VKN kontrol algoritması
  function vknGecerliMi(vkn) {
    const s = String(vkn || '').replace(/\D/g, '');
    if (s.length !== 10) return false;
    if (/^0+$/.test(s)) return false;
    const d = s.split('').map(Number);
    let toplam = 0;
    for (let i = 0; i < 9; i++) {
      const tmp = (d[i] + (10 - (i + 1))) % 10;
      if (tmp === 9) {
        toplam += tmp;
      } else {
        toplam += (tmp * Math.pow(2, 10 - (i + 1))) % 9;
      }
    }
    const kontrol = (10 - (toplam % 10)) % 10;
    return kontrol === d[9];
  }

  // ── TCKN DOĞRULAMA (11 haneli — resmî algoritma) ────────────────────────
  function tcknGecerliMi(tckn) {
    const s = String(tckn || '').replace(/\D/g, '');
    if (s.length !== 11) return false;
    const d = s.split('').map(Number);
    if (d[0] === 0) return false;
    const tek = d[0] + d[2] + d[4] + d[6] + d[8];   // 1,3,5,7,9. haneler
    const cift = d[1] + d[3] + d[5] + d[7];          // 2,4,6,8. haneler
    const h10 = ((tek * 7) - cift) % 10;
    if (((h10 % 10) + 10) % 10 !== d[9]) return false;
    const ilk10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
    return ilk10 % 10 === d[10];
  }

  // Vergi kimliğini doğrula ve tipini belirle
  function vergiKimligiKontrol(no) {
    const s = String(no || '').replace(/\D/g, '');
    if (!s) return { gecerli: false, tip: null, mesaj: 'Vergi/TC kimlik numarası girilmemiş' };
    if (s.length === 10) {
      return vknGecerliMi(s)
        ? { gecerli: true, tip: 'VKN', no: s, mesaj: 'Geçerli VKN (tüzel kişi)' }
        : { gecerli: false, tip: 'VKN', no: s, mesaj: 'VKN kontrol hanesi hatalı — numara geçersiz' };
    }
    if (s.length === 11) {
      return tcknGecerliMi(s)
        ? { gecerli: true, tip: 'TCKN', no: s, mesaj: 'Geçerli TCKN (gerçek kişi)' }
        : { gecerli: false, tip: 'TCKN', no: s, mesaj: 'TCKN kontrol hanesi hatalı — numara geçersiz' };
    }
    return { gecerli: false, tip: null, no: s, mesaj: `Uzunluk hatalı (${s.length} hane). VKN 10, TCKN 11 hane olmalıdır.` };
  }

  // ── FATURA SENARYOSU BELİRLEME ──────────────────────────────────────────
  // Alıcı e-Fatura mükellefi ise → E-FATURA (TEMEL veya TİCARİ)
  // Değilse → E-ARŞİV (elektronik arşiv faturası)
  function senaryoBelirle(musteri, tutar) {
    if (!musteri) return { senaryo: 'EARSIV', tip: 'SATIS', aciklama: 'Müşteri kaydı yok — e-Arşiv' };
    if (musteri.efaturaMukellefi) {
      // TİCARİ senaryo: alıcının kabul/red hakkı vardır (iade süreci işler)
      // TEMEL senaryo: alıcı red edemez, sadece itiraz eder
      const tip = musteri.efaturaSenaryo === 'TICARI' ? 'TICARIFATURA' : 'TEMELFATURA';
      return { senaryo: 'EFATURA', tip,
        aciklama: `e-Fatura mükellefi — ${tip === 'TICARIFATURA' ? 'Ticari' : 'Temel'} senaryo` };
    }
    return { senaryo: 'EARSIV', tip: 'SATIS',
      aciklama: 'Alıcı e-Fatura mükellefi değil — e-Arşiv faturası düzenlenecek' };
  }

  // ── ETTN (Evrensel Tekil Tanımlama Numarası) ────────────────────────────
  function ettnUret() {
    const h = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
    return `${h()}${h()}-${h()}-4${h().slice(1)}-${((8 + Math.floor(Math.random() * 4)).toString(16))}${h().slice(1)}-${h()}${h()}${h()}`;
  }

  // ── FATURA NUMARASI (GİB formatı: ABC2026000000001) ─────────────────────
  // 3 harf seri + 4 hane yıl + 9 hane sıra = 16 karakter
  function faturaNoUret(seri, yil, sira) {
    const s = (seri || 'UOS').toUpperCase().slice(0, 3).padEnd(3, 'X');
    const y = String(yil || new Date().getFullYear());
    return s + y + String(sira || 1).padStart(9, '0');
  }

  // ── İRSALİYE NUMARASI — aynı GİB desenini kullanır ───────────────────────
  function irsaliyeNoUret(seri, yil, sira) {
    const s = (seri || 'IRS').toUpperCase().slice(0, 3).padEnd(3, 'X');
    const y = String(yil || new Date().getFullYear());
    return s + y + String(sira || 1).padStart(9, '0');
  }

  // ── UBL-TR 1.2 XML ÜRETİMİ ──────────────────────────────────────────────
  function xmlKacis(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function ublOlustur(fatura, musteri, firma, kalemler, opts) {
    const o = opts || {};
    const ettn = fatura.ettn || ettnUret();
    const senaryo = senaryoBelirle(musteri);
    const tarih = fatura.tarih || new Date().toISOString().slice(0, 10);
    const saat = new Date().toTimeString().slice(0, 8);
    const paraBirimi = fatura.paraBirimi || 'TRY';

    // KDV gruplarını hesapla
    const kdvGruplari = {};
    let matrahToplam = 0, kdvToplam = 0;
    (kalemler || []).forEach(k => {
      const miktar = k.miktar || 1;
      const birimFiyat = k.netFiyat || 0;
      const oran = k.kdvOrani == null ? 20 : k.kdvOrani;
      const satirTutar = miktar * birimFiyat;
      const kdv = satirTutar * oran / 100;
      matrahToplam += satirTutar;
      kdvToplam += kdv;
      if (!kdvGruplari[oran]) kdvGruplari[oran] = { matrah: 0, kdv: 0 };
      kdvGruplari[oran].matrah += satirTutar;
      kdvGruplari[oran].kdv += kdv;
    });
    const genelToplam = matrahToplam + kdvToplam;
    const n = (x) => (Math.round((x || 0) * 100) / 100).toFixed(2);

    const musteriVergiNo = String((musteri && (musteri.vergiNo || musteri.tckn)) || '').replace(/\D/g, '');
    const musteriTipi = musteriVergiNo.length === 11 ? 'TCKN' : 'VKN';

    const satirlar = (kalemler || []).map((k, i) => {
      const miktar = k.miktar || 1;
      const birimFiyat = k.netFiyat || 0;
      const oran = k.kdvOrani == null ? 20 : k.kdvOrani;
      const satirTutar = miktar * birimFiyat;
      return `    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${xmlKacis(k.birim || 'C62')}">${n(miktar)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${paraBirimi}">${n(satirTutar)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${paraBirimi}">${n(satirTutar * oran / 100)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${paraBirimi}">${n(satirTutar)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${paraBirimi}">${n(satirTutar * oran / 100)}</cbc:TaxAmount>
          <cbc:Percent>${n(oran)}</cbc:Percent>
          <cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${xmlKacis(k.ad || k.kod || 'Ürün')}</cbc:Name>
        ${k.kod ? `<cac:SellersItemIdentification><cbc:ID>${xmlKacis(k.kod)}</cbc:ID></cac:SellersItemIdentification>` : ''}
      </cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="${paraBirimi}">${n(birimFiyat)}</cbc:PriceAmount></cac:Price>
    </cac:InvoiceLine>`;
    }).join('\n');

    const kdvAltToplamlar = Object.entries(kdvGruplari).map(([oran, g]) => `      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${paraBirimi}">${n(g.matrah)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${paraBirimi}">${n(g.kdv)}</cbc:TaxAmount>
        <cbc:Percent>${n(parseFloat(oran))}</cbc:Percent>
        <cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
      </cac:TaxSubtotal>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${senaryo.tip}</cbc:ProfileID>
  <cbc:ID>${xmlKacis(fatura.faturaNo || '')}</cbc:ID>
  <cbc:UUID>${ettn}</cbc:UUID>
  <cbc:IssueDate>${tarih}</cbc:IssueDate>
  <cbc:IssueTime>${saat}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${paraBirimi}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${(kalemler || []).length}</cbc:LineCountNumeric>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">${xmlKacis(String((firma && firma.vergiNo) || '').replace(/\D/g, ''))}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xmlKacis((firma && firma.unvan) || 'Firma')}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlKacis((firma && firma.adres) || '')}</cbc:StreetName>
        <cbc:CitySubdivisionName>${xmlKacis((firma && firma.ilce) || '')}</cbc:CitySubdivisionName>
        <cbc:CityName>${xmlKacis((firma && firma.il) || '')}</cbc:CityName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${xmlKacis((firma && firma.vergiDairesi) || '')}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="${musteriTipi}">${xmlKacis(musteriVergiNo)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xmlKacis((musteri && musteri.unvan) || fatura.musteriAdi || '')}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlKacis((musteri && musteri.adres) || '')}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${xmlKacis((musteri && musteri.vergiDairesi) || '')}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${paraBirimi}">${n(kdvToplam)}</cbc:TaxAmount>
${kdvAltToplamlar}
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${paraBirimi}">${n(matrahToplam)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${paraBirimi}">${n(matrahToplam)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${paraBirimi}">${n(genelToplam)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${paraBirimi}">${n(genelToplam)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${satirlar}
</Invoice>`;

    return { xml, ettn, senaryo, matrahToplam, kdvToplam, genelToplam, kdvGruplari };
  }

  // ── FATURA GÖNDERİME HAZIR MI? ──────────────────────────────────────────
  // Gönderim öncesi zorunlu alan kontrolü — eksik varsa GİB reddeder.
  function gonderimKontrol(fatura, musteri, firma, kalemler) {
    const hatalar = [], uyarilar = [];

    // Satıcı (firma) bilgileri
    if (!firma || !firma.unvan) hatalar.push('Firma ünvanı tanımlı değil (Ayarlar → Firma Bilgileri)');
    const firmaVkn = vergiKimligiKontrol(firma && firma.vergiNo);
    if (!firmaVkn.gecerli) hatalar.push('Firma VKN geçersiz: ' + firmaVkn.mesaj);
    if (!firma || !firma.vergiDairesi) uyarilar.push('Firma vergi dairesi boş');
    if (!firma || !firma.adres) uyarilar.push('Firma adresi boş');

    // Alıcı (müşteri) bilgileri
    if (!musteri) hatalar.push('Müşteri kaydı bulunamadı');
    else {
      const mv = vergiKimligiKontrol(musteri.vergiNo || musteri.tckn);
      if (!mv.gecerli) hatalar.push('Müşteri vergi kimliği geçersiz: ' + mv.mesaj);
      if (!musteri.adres) uyarilar.push('Müşteri adresi boş');
      if (!musteri.vergiDairesi && mv.tip === 'VKN') uyarilar.push('Müşteri vergi dairesi boş');
    }

    // Fatura içeriği
    if (!kalemler || !kalemler.length) hatalar.push('Faturada kalem yok');
    else {
      (kalemler || []).forEach((k, i) => {
        if (!k.ad && !k.kod) hatalar.push(`${i + 1}. kalemde ürün adı/kodu yok`);
        if ((k.netFiyat || 0) <= 0) uyarilar.push(`${i + 1}. kalemde birim fiyat sıfır`);
        if (k.kdvOrani == null) uyarilar.push(`${i + 1}. kalemde KDV oranı belirtilmemiş (varsayılan %20)`);
      });
    }
    if (!fatura.faturaNo) hatalar.push('Fatura numarası yok');
    if (!fatura.tarih) hatalar.push('Fatura tarihi yok');

    return { gonderilebilir: hatalar.length === 0, hatalar, uyarilar };
  }

  // ── e-İRSALİYE (SEVK BELGESİ) UBL-TR ÜRETİMİ ─────────────────────────────
  // İrsaliye parasal tutar/KDV taşımaz — yalnızca sevk edilen kalem + miktar + tarih.
  function irsaliyeUblOlustur(irsaliye, musteri, firma, kalemler) {
    const ettn = irsaliye.ettn || ettnUret();
    const tarih = irsaliye.tarih || new Date().toISOString().slice(0, 10);
    const saat = new Date().toTimeString().slice(0, 8);
    const sevkTarihi = irsaliye.sevkTarihi || tarih;
    const n = (x) => (Math.round((x || 0) * 100) / 100).toFixed(2);

    const musteriVergiNo = String((musteri && (musteri.vergiNo || musteri.tckn)) || '').replace(/\D/g, '');
    const musteriTipi = musteriVergiNo.length === 11 ? 'TCKN' : 'VKN';

    const satirlar = (kalemler || []).map((k, i) => {
      const miktar = k.miktar || 1;
      return `    <cac:DespatchLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:DeliveredQuantity unitCode="${xmlKacis(k.birim || 'C62')}">${n(miktar)}</cbc:DeliveredQuantity>
      <cac:Item>
        <cbc:Name>${xmlKacis(k.ad || k.kod || 'Ürün')}</cbc:Name>
        ${k.kod ? `<cac:SellersItemIdentification><cbc:ID>${xmlKacis(k.kod)}</cbc:ID></cac:SellersItemIdentification>` : ''}
      </cac:Item>
    </cac:DespatchLine>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>${xmlKacis(irsaliye.irsaliyeNo || '')}</cbc:ID>
  <cbc:UUID>${ettn}</cbc:UUID>
  <cbc:IssueDate>${tarih}</cbc:IssueDate>
  <cbc:IssueTime>${saat}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  <cbc:LineCountNumeric>${(kalemler || []).length}</cbc:LineCountNumeric>

  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">${xmlKacis(String((firma && firma.vergiNo) || '').replace(/\D/g, ''))}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xmlKacis((firma && firma.unvan) || 'Firma')}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlKacis((firma && firma.adres) || '')}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:DespatchSupplierParty>

  <cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="${musteriTipi}">${xmlKacis(musteriVergiNo)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xmlKacis((musteri && musteri.unvan) || irsaliye.musteriAdi || '')}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlKacis((musteri && musteri.adres) || '')}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:DeliveryCustomerParty>

  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cac:Delivery>
      <cbc:ActualDeliveryDate>${sevkTarihi}</cbc:ActualDeliveryDate>
    </cac:Delivery>
  </cac:Shipment>

${satirlar}
</DespatchAdvice>`;

    return { xml, ettn };
  }

  // ── İRSALİYE GÖNDERİME HAZIR MI? ─────────────────────────────────────────
  function irsaliyeGonderimKontrol(irsaliye, musteri, firma, kalemler) {
    const hatalar = [], uyarilar = [];

    if (!firma || !firma.unvan) hatalar.push('Firma ünvanı tanımlı değil (Ayarlar → Firma Bilgileri)');
    const firmaVkn = vergiKimligiKontrol(firma && firma.vergiNo);
    if (!firmaVkn.gecerli) hatalar.push('Firma VKN geçersiz: ' + firmaVkn.mesaj);

    if (!musteri) hatalar.push('Müşteri kaydı bulunamadı');
    else {
      const mv = vergiKimligiKontrol(musteri.vergiNo || musteri.tckn);
      if (!mv.gecerli) hatalar.push('Müşteri vergi kimliği geçersiz: ' + mv.mesaj);
      if (!musteri.adres) uyarilar.push('Müşteri adresi boş');
    }

    if (!kalemler || !kalemler.length) hatalar.push('İrsaliyede kalem yok');
    else {
      (kalemler || []).forEach((k, i) => {
        if (!k.ad && !k.kod) hatalar.push(`${i + 1}. kalemde ürün adı/kodu yok`);
        if ((k.miktar || 0) <= 0) hatalar.push(`${i + 1}. kalemde miktar geçersiz`);
      });
    }
    if (!irsaliye || !irsaliye.irsaliyeNo) hatalar.push('İrsaliye numarası yok');
    if (!irsaliye || !irsaliye.tarih) hatalar.push('İrsaliye tarihi yok');

    return { gonderilebilir: hatalar.length === 0, hatalar, uyarilar };
  }

  // ── GÖNDERİM DURUMU AKIŞI ───────────────────────────────────────────────
  const DURUMLAR = {
    taslak: ['Taslak', 'pill-gray', 'Henüz gönderilmedi'],
    hazir: ['Gönderime Hazır', 'pill-blue', 'Kontroller geçti, entegratöre gönderilebilir'],
    gonderildi: ['Gönderildi', 'pill-amber', 'Entegratöre iletildi, GİB yanıtı bekleniyor'],
    kabul: ['Kabul Edildi', 'pill-green', 'GİB/alıcı kabul etti — süreç tamamlandı'],
    red: ['Reddedildi', 'pill-red', 'Alıcı reddetti (ticari senaryo) — düzeltilip yeniden gönderilmeli'],
    hata: ['Hata', 'pill-red', 'Gönderimde teknik hata oluştu']
  };

  return { vknGecerliMi, tcknGecerliMi, vergiKimligiKontrol, senaryoBelirle,
           ettnUret, faturaNoUret, ublOlustur, gonderimKontrol, DURUMLAR, xmlKacis,
           irsaliyeNoUret, irsaliyeUblOlustur, irsaliyeGonderimKontrol };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = EFaturaMotor;
