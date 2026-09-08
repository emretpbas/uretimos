// BULGU: analitik_motor.js (526 satır) — kârlılık, yaşlandırma, mali KPI,
// OTIF, Pareto, stok yaşlandırma, malzeme verimi ve satış hunisi gibi
// finansal/operasyonel hesapların TAMAMI için tek bir test bile yoktu.
// Bu dosya kâr/zarar ve tahsilat riski gibi doğrudan para etkisi olan
// rakamlar ürettiğinden, formüllerin gerçek verilerle doğrulanması gerekir.
// Düzeltme: analitik_motor.js dual-mode yapıldı (module.exports eklendi,
// mrp_motor.js ile aynı desen) — Store'a bağlı olan yalnızca veriYukle()/
// tumAnaliz(); geri kalan tüm hesap fonksiyonları saf veri (v objesi) alıp
// saf sonuç döndürüyor, bu yüzden gerçek birim testi yazılabiliyor.
const path = require('path');
const AnalitikMotor = require('../analitik_motor.js');

let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };
const yakin = (a, b, tol) => Math.abs(a - b) < (tol == null ? 0.01 : tol);

// siparisKarliligi 'urun' grubunda App.receteAltYarimamulleri'yi çağırıyor;
// bu, app.js'teki gerçek fonksiyonun kendisi (saf: yalnızca receteler
// parametresini okur) izole edilip global.App'e bağlanır — sahte/basitleştirilmiş
// bir yeniden yazım DEĞİL, gerçek kaynak kod çalıştırılıyor.
{
  const fs = require('fs');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const baslangic = appSrc.indexOf('function receteAltYarimamulleri(');
  let derinlik = 0, i = appSrc.indexOf('{', baslangic);
  for (; i < appSrc.length; i++) {
    const c = appSrc[i];
    if (c === '{') derinlik++;
    if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
  }
  const kaynak = appSrc.slice(baslangic, i);
  const izole = new Function(kaynak + '\nreturn receteAltYarimamulleri;');
  global.App = { receteAltYarimamulleri: izole() };
}

console.log('\n-- siparisKarliligi: gelir/maliyet/kâr doğru hesaplanıyor (yarimamul grubu) --');
{
  const v = {
    siparisler: [{ id: 'SIP-1', kod: 'SIP-1', durum: 'onaylandi', musteriId: 'M1', musteriAdi: 'ACME', tarih: '2026-01-10',
      kalemler: [{ grup: 'yarimamul', kod: 'YM1', netFiyat: 100, miktar: 10 }] }], // gelir = 1000
    teklifler: [], faturalar: [], tahsilatlar: [], musteriler: [], tedarikciler: [],
    tedarikciOdemeleri: [], satinalmaSiparisleri: [], stokRaf: [], stokHareketleri: [],
    yarimamuller: [{ id: 'Y1', kod: 'YM1', ad: 'Kapak' }],
    receteler: [{ yarimamulId: 'Y1', kalemler: [{ tip: 'hammadde', refId: 'H1', miktar: 2 }] }], // 2 birim H1 / YM1
    hammaddeler: [{ id: 'H1', birimFiyat: 5 }], // malzeme = 10 (adet) x 2 x 5 = 100
    irsaliyeler: [], musteriCekleri: [], firmaCekleri: [], iadeKalemleri: [], personeller: [],
    istasyonIsleri: [{ kaynakTip: 'sip', kaynakId: 'SIP-1', barkodZamani: '2026-01-10T08:00:00', bitisZamani: '2026-01-10T09:00:00', fireAdet: 0 }] // 60dk
  };
  const kar = AnalitikMotor.siparisKarliligi(v, { saatlikIscilik: 100, genelGiderYuzde: 0 });
  t('tek satır üretildi', kar.length === 1);
  const r = kar[0];
  t('gelir = 1000 (100 x 10)', yakin(r.gelir, 1000));
  t('malzeme = 100 (10 adet x 2 birim x 5 TL)', yakin(r.malzeme, 100));
  t('işçilik = 100 (60dk = 1 saat x 100 TL/saat)', yakin(r.iscilik, 100));
  t('toplamMaliyet = malzeme + işçilik (genel gider %0)', yakin(r.toplamMaliyet, 200));
  t('kar = gelir - maliyet = 800', yakin(r.kar, 800));
  t('marj = 800/1000 = 0.8', yakin(r.marj, 0.8));
  t('veriKalitesi = 2 (hem malzeme hem süre var → güvenilir)', r.veriKalitesi === 2);

  console.log('\n-- siparisKarliligi: fire maliyeti doğru dağıtılıyor --');
  const vFire = JSON.parse(JSON.stringify(v));
  vFire.istasyonIsleri[0].fireAdet = 3; // 3/10 adet fire
  const karFire = AnalitikMotor.siparisKarliligi(vFire, { saatlikIscilik: 100, genelGiderYuzde: 0 });
  // birimMalzeme = 100/10 = 10, fireMaliyet = 3 x 10 = 30
  t('fireMaliyet = fireAdet x birimMalzeme = 30', yakin(karFire[0].fireMaliyet, 30));
  t('fire olan kâr, fire olmayandan düşük', karFire[0].kar < r.kar);

  console.log('\n-- siparisKarliligi: draft/iptal siparişler hesaba katılmıyor --');
  const vTaslak = JSON.parse(JSON.stringify(v));
  vTaslak.siparisler[0].durum = 'taslak';
  t('taslak sipariş kârlılığa dahil edilmiyor', AnalitikMotor.siparisKarliligi(vTaslak, {}).length === 0);

  console.log('\n-- siparisKarliligi: genel gider yüzdesi doğru uygulanıyor --');
  const karGG = AnalitikMotor.siparisKarliligi(v, { saatlikIscilik: 100, genelGiderYuzde: 20 });
  // dogrudanMaliyet = 200, genelGider = 40, toplamMaliyet = 240
  t('genel gider %20 uygulanınca toplamMaliyet = 240', yakin(karGG[0].toplamMaliyet, 240));
}

console.log('\n-- siparisKarliligi: "urun" grubu, gerçek receteAltYarimamulleri ile rekürsif kırılım --');
{
  const v = {
    siparisler: [{ id: 'SIP-2', kod: 'SIP-2', durum: 'sevk_edildi', musteriId: 'M2', musteriAdi: 'Beta', tarih: '2026-01-15',
      kalemler: [{ grup: 'urun', kod: 'URN1', netFiyat: 500, miktar: 2 }] }], // gelir = 1000
    teklifler: [], faturalar: [], tahsilatlar: [], musteriler: [], tedarikciler: [],
    tedarikciOdemeleri: [], satinalmaSiparisleri: [], stokRaf: [], stokHareketleri: [],
    urunler: [{ id: 'U1', kod: 'URN1' }],
    yarimamuller: [{ id: 'Y1', kod: 'YM1' }],
    receteler: [
      { urunId: 'U1', kalemler: [{ tip: 'yarimamul', refId: 'Y1', miktar: 3 }] }, // 1 ürün = 3 YM1
      { yarimamulId: 'Y1', kalemler: [{ tip: 'hammadde', refId: 'H1', miktar: 4 }] } // 1 YM1 = 4 H1
    ],
    hammaddeler: [{ id: 'H1', birimFiyat: 2 }], // birim ürün malzeme = 3 x 4 x 2 = 24; 2 adet = 48
    irsaliyeler: [], musteriCekleri: [], firmaCekleri: [], iadeKalemleri: [], personeller: [],
    istasyonIsleri: []
  };
  const kar = AnalitikMotor.siparisKarliligi(v, { saatlikIscilik: 100, genelGiderYuzde: 0 });
  t('urun grubu rekürsif kırılımla malzeme maliyeti doğru (2 adet x 3 YM x 4 H1 x 2 TL = 48)', yakin(kar[0].malzeme, 48));
}

console.log('\n-- musteriKarliligi: aynı müşterinin siparişleri toplanıyor, iade netKar\'dan düşülüyor --');
{
  const karSatirlari = [
    { musteriId: 'M1', musteriAdi: 'ACME', gelir: 1000, toplamMaliyet: 600, kar: 400 },
    { musteriId: 'M1', musteriAdi: 'ACME', gelir: 500, toplamMaliyet: 300, kar: 200 },
    { musteriId: 'M2', musteriAdi: 'Beta', gelir: 800, toplamMaliyet: 700, kar: 100 }
  ];
  const v = { iadeKalemleri: [{ musteriId: 'M1', tutar: 150 }] };
  const sonuc = AnalitikMotor.musteriKarliligi(karSatirlari, v);
  const acme = sonuc.find(x => x.musteriId === 'M1');
  t('ACME gelir toplamı = 1500', yakin(acme.gelir, 1500));
  t('ACME kar toplamı = 600', yakin(acme.kar, 600));
  t('ACME siparişSayısı = 2', acme.siparisSayisi === 2);
  t('ACME netKar = kar - iade = 450', yakin(acme.netKar, 450));
  t('Beta iade almadığından netKar = kar (100)', sonuc.find(x => x.musteriId === 'M2').netKar === 100);
  t('sonuç netKar\'a göre azalan sıralı', sonuc[0].netKar >= sonuc[1].netKar);
}

console.log('\n-- urunKarliligi: ABC sınıflandırması kümülatif ciroya göre doğru --');
{
  const v = {
    siparisler: [
      { id: 'S1', durum: 'onaylandi', kalemler: [{ kod: 'A', ad: 'Ürün A', netFiyat: 800, miktar: 1 }] }, // %80
      { id: 'S2', durum: 'onaylandi', kalemler: [{ kod: 'B', ad: 'Ürün B', netFiyat: 150, miktar: 1 }] }, // %15 -> kümülatif %95
      { id: 'S3', durum: 'onaylandi', kalemler: [{ kod: 'C', ad: 'Ürün C', netFiyat: 50, miktar: 1 }] }  // %5 -> kümülatif %100
    ]
  };
  const karSatirlari = [
    { siparisId: 'S1', gelir: 800, kar: 400 },
    { siparisId: 'S2', gelir: 150, kar: 50 },
    { siparisId: 'S3', gelir: 50, kar: 10 }
  ];
  const sonuc = AnalitikMotor.urunKarliligi(v, karSatirlari);
  t('Ürün A (kümülatif öncesi %0 < %80) sınıfı A', sonuc.find(x => x.kod === 'A').abc === 'A');
  t('Ürün B (kümülatif öncesi %80, %80-%95 arası) sınıfı B', sonuc.find(x => x.kod === 'B').abc === 'B');
  t('Ürün C (kümülatif öncesi %95) sınıfı C', sonuc.find(x => x.kod === 'C').abc === 'C');
  t('gelire göre azalan sıralı (A, B, C)', sonuc.map(x => x.kod).join(',') === 'A,B,C');
}

console.log('\n-- alacakYaslandirma: bakiye ve kova ataması doğru --');
{
  const bugun = new Date().toISOString().slice(0, 10);
  const gunOnce = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const v = {
    faturalar: [
      { id: 'F1', faturaNo: 'F1', musteriId: 'M1', musteriAdi: 'ACME', tarih: gunOnce(100), vadeTarihi: gunOnce(95), genelToplam: 1000 }, // 95 gün gecikme -> 90+
      { id: 'F2', faturaNo: 'F2', musteriId: 'M2', musteriAdi: 'Beta', tarih: gunOnce(20), vadeTarihi: gunOnce(10), genelToplam: 500 }, // 10 gün gecikme -> 0-30
      { id: 'F3', faturaNo: 'F3', musteriId: 'M3', musteriAdi: 'Gama', tarih: bugun, vadeTarihi: bugun, genelToplam: 200, pesinatMahsup: 200 } // tam ödenmiş -> hariç
    ],
    tahsilatlar: [{ faturaId: 'F1', tutar: 200 }] // F1 bakiyesi 800 kalıyor
  };
  const sonuc = AnalitikMotor.alacakYaslandirma(v);
  t('tam ödenmiş fatura (F3) listeye girmiyor', !sonuc.satirlar.find(s => s.faturaNo === 'F3'));
  const f1 = sonuc.satirlar.find(s => s.faturaNo === 'F1');
  t('F1 bakiyesi tahsilat düşülerek 800', yakin(f1.bakiye, 800));
  t('F1 kovası 90+ gün', f1.kova === '90+ gün');
  const f2 = sonuc.satirlar.find(s => s.faturaNo === 'F2');
  t('F2 kovası 0-30 gün', f2.kova === '0-30 gün');
  t('toplam bakiye = 800 + 500 = 1300', yakin(sonuc.toplam, 1300));
  t('riskli (90+ gün) tutar = 800', yakin(sonuc.riskli, 800));
  t('müşteri bazlı gruplama 2 müşteri içeriyor (M3 hariç)', sonuc.musteriler.length === 2);
}

console.log('\n-- borcYaslandirma: iptal siparişler ve ödenen tutar hariç tutuluyor --');
{
  const bugun = new Date().toISOString().slice(0, 10);
  const gunOnce = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const v = {
    satinalmaSiparisleri: [
      { id: 'SAS1', kod: 'SAS1', tedarikciAdi: 'Tedarikci A', durum: 'tamamlandi', genelToplam: 1000, tarih: gunOnce(40), vadeTarihi: gunOnce(35) },
      { id: 'SAS2', kod: 'SAS2', tedarikciAdi: 'Tedarikci B', durum: 'iptal', genelToplam: 2000, tarih: bugun, vadeTarihi: bugun }
    ],
    tedarikciOdemeleri: [{ ilgiliSiparisId: 'SAS1', tutar: 300 }]
  };
  const sonuc = AnalitikMotor.borcYaslandirma(v);
  t('iptal edilen sipariş (SAS2) borca dahil değil', !sonuc.satirlar.find(s => s.kod === 'SAS2'));
  t('SAS1 bakiyesi ödeme düşülerek 700', yakin(sonuc.satirlar[0].bakiye, 700));
  t('SAS1 kovası 31-60 gün', sonuc.satirlar[0].kova === '31-60 gün');
}

console.log('\n-- maliKpi: brüt marj, DSO, DPO, CCC doğru hesaplanıyor --');
{
  const v = { faturalar: [{ tarih: '2026-01-01' }], satinalmaSiparisleri: [{ tarih: '2026-01-31', genelToplam: 3650 }], stokRaf: [] };
  const karSatirlari = [{ tarih: '2026-01-01', gelir: 10000, toplamMaliyet: 6000 }];
  const alacak = { toplam: 2000 };
  const borc = { toplam: 730 };
  const sonuc = AnalitikMotor.maliKpi(v, karSatirlari, alacak, borc);
  t('donemGun en az 30 (30 günlük aralık)', sonuc.donemGun >= 30);
  t('brutKar = 10000 - 6000 = 4000', yakin(sonuc.brutKar, 4000));
  t('brutMarj = 4000/10000 = 0.4', yakin(sonuc.brutMarj, 0.4));
  // gunlukSatis = 10000/donemGun, dso = alacak.toplam / gunlukSatis = 2000 * donemGun / 10000
  const beklenenDso = Math.round(2000 / (10000 / sonuc.donemGun));
  t('dso doğru formülle hesaplanıyor', sonuc.dso === beklenenDso);
  t('stokDegeri sıfır olduğunda stokDevirGun sıfır', sonuc.stokDevirGun === 0);
}

console.log('\n-- teslimatPerformansi: OTIF hem zamanında hem eksiksiz olmayı gerektiriyor --');
{
  const v = {
    siparisler: [
      { id: 'S1', kod: 'S1', musteriAdi: 'ACME', durum: 'sevk_edildi', tarih: '2026-01-01', uretimTermini: '2026-01-10',
        kalemler: [{ miktar: 10 }] },
      { id: 'S2', kod: 'S2', musteriAdi: 'Beta', durum: 'sevk_edildi', tarih: '2026-01-01', uretimTermini: '2026-01-10',
        kalemler: [{ miktar: 10 }] }
    ],
    irsaliyeler: [
      { siparisId: 'S1', tarih: '2026-01-08', kalemler: [{ miktar: 10 }] }, // zamanında + eksiksiz -> OTIF
      { siparisId: 'S2', tarih: '2026-01-15', kalemler: [{ miktar: 10 }] }  // geç -> OTIF değil
    ]
  };
  const sonuc = AnalitikMotor.teslimatPerformansi(v);
  const s1 = sonuc.satirlar.find(r => r.kod === 'S1');
  const s2 = sonuc.satirlar.find(r => r.kod === 'S2');
  t('S1 zamanında teslim edildi', s1.zamanindaMi === true);
  t('S1 OTIF (zamanında + eksiksiz)', s1.otif === true);
  t('S2 geç teslim, OTIF değil', s2.zamanindaMi === false && s2.otif === false);
  t('otifOrani = 1/2 = 0.5', yakin(sonuc.otifOrani, 0.5));
}

console.log('\n-- paretoOlustur / durusPareto: kümülatif oran ve azalan sıralama doğru --');
{
  const v = { duruslar: [
    { aciklama: 'Arıza', sureMin: 60 },
    { aciklama: 'Arıza', sureMin: 40 },
    { aciklama: 'Malzeme Bekleme', sureMin: 30 },
    { aciklama: 'Mola', sureMin: 10 }
  ] };
  const sonuc = AnalitikMotor.durusPareto(v);
  t('Arıza toplam 100dk ile ilk sırada', sonuc[0].ad === 'Arıza' && yakin(sonuc[0].deger, 100));
  t('toplam kümülatif oran 1.0\'a ulaşıyor', yakin(sonuc[sonuc.length - 1].kumulatif, 1));
  t('azalan sıralı (deger)', sonuc[0].deger >= sonuc[1].deger && sonuc[1].deger >= sonuc[2].deger);
}

console.log('\n-- stokYaslandirma: 180+ gün hareketsiz kalem ÖLÜ STOK sayılıyor --');
{
  const gunOnce = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const v = {
    stokRaf: [
      { refKod: 'HM1', refAd: 'Vida', refId: 'H1', tip: 'hammadde', miktar: 100, birim: 'ADET', ambar: 'A1' },
      { refKod: 'HM2', refAd: 'Somun', refId: 'H2', tip: 'hammadde', miktar: 50, birim: 'ADET', ambar: 'A1' }
    ],
    stokHareketleri: [
      { kalemAdi: 'Vida', tarih: gunOnce(200) }, // 200 gün önce -> ölü stok
      { kalemAdi: 'Somun', tarih: gunOnce(5) }   // 5 gün önce -> taze
    ],
    hammaddeler: [{ id: 'H1', birimFiyat: 2 }, { id: 'H2', birimFiyat: 3 }]
  };
  const sonuc = AnalitikMotor.stokYaslandirma(v);
  t('Vida 180+ gün (ÖLÜ) kovasında', sonuc.satirlar.find(s => s.kod === 'HM1').kova === '180+ gün (ÖLÜ)');
  t('Somun 0-30 gün kovasında', sonuc.satirlar.find(s => s.kod === 'HM2').kova === '0-30 gün');
  t('oluStokAdet = 1', sonuc.oluStokAdet === 1);
  t('oluStokDeger = 100 x 2 = 200', yakin(sonuc.oluStokDeger, 200));
}

console.log('\n-- satisHunisi: dönüşüm oranı ve tutar dönüşümü doğru --');
{
  // BULGU (T56): önceki fixture 'reddedildi' kullanıyordu — ama teklif
  // durumu GERÇEKTE hiçbir zaman bu değeri almaz (bkz. teklif_takip_motor.js
  // DURUMLAR: taslak/gonderildi/beklemede/revize/kazanildi/kaybedildi/iptal/
  // siparise_donustu/siparis_reddedildi/silme_talebinde). Test, koddaki asıl
  // hatayı (reddedilen filtresi 'kaybedildi'/'iptal'i hiç yakalamıyordu) o
  // yanlış durum stringiyle birebir örtüştüğü için "yeşil" geçiyordu — gerçek
  // veriyi temsil etmiyordu. Artık gerçek bir durum ('kaybedildi') kullanılır.
  const v = { teklifler: [
    { tarih: '2026-01-05', durum: 'siparise_donustu', dipToplam: 1000 },
    { tarih: '2026-01-10', durum: 'kaybedildi', dipToplam: 500 },
    { tarih: '2026-01-15', durum: 'beklemede', dipToplam: 300 }
  ] };
  const sonuc = AnalitikMotor.satisHunisi(v);
  t('toplam = 3', sonuc.toplam === 3);
  t('siparise = 1', sonuc.siparise === 1);
  t('reddedilen (kaybedildi dahil) = 1', sonuc.reddedilen === 1);
  t('bekleyen = 1', sonuc.bekleyen === 1);
  t('donusumOrani = 1/3', yakin(sonuc.donusumOrani, 1 / 3));
  t('tutarDonusumOrani = 1000/1800', yakin(sonuc.tutarDonusumOrani, 1000 / 1800));
}

console.log('\n-- lotIzlenebilirlik: lot -> sipariş -> müşteri zinciri kuruluyor --');
{
  const v = {
    istasyonIsleri: [{ lotNo: 'LOT-1', kaynakTip: 'sip', kaynakId: 'S1' }],
    siparisler: [{ id: 'S1', kod: 'S1', musteriAdi: 'ACME' }],
    irsaliyeler: [{ siparisId: 'S1', irsaliyeNo: 'IRS-1', tarih: '2026-01-05' }]
  };
  const sonuc = AnalitikMotor.lotIzlenebilirlik(v, 'LOT-1');
  t('kartSayisi = 1', sonuc.kartSayisi === 1);
  t('ACME müşterisine ulaşılıyor', sonuc.musteriler[0].musteriAdi === 'ACME');
  t('irsaliye numarası taşınıyor', sonuc.musteriler[0].irsaliyeler.includes('IRS-1'));
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
