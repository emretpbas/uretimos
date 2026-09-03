// BULGU: mrp_motor.js iki yerde yanlış durum filtresi kullanıyordu:
//  1) mpsOlustur — 'durum !== tamamlandi' ile PLANLAMANIN HENÜZ ÜRETİME
//     ALMADIĞI (durum='taslak') iş emirlerini de MRP'ye dahil ediyordu;
//     bu da henüz kesinleşmemiş bir ihtiyaç için satınalma önerisi/talebi
//     tetikleyebiliyordu (cizelge_motor.js/page_cizelge.js/page_hat_takip.js
//     ile aynı kök bulgu — sadece durum='uretimde' MRP'ye girmeli).
//  2) calistir — "yoldaki siparişler" filtresi 'teslim_alindi' diye HİÇ
//     kullanılmayan bir durum string'ini hariç tutuyordu; gerçek tamamlanma
//     durumu 'tamamlandi' (bkz. page_depo_panel.js:542) hiç hariç
//     tutulmadığından TAMAMLANMIŞ satınalma siparişleri de hâlâ "yolda"
//     sayılıp brüt ihtiyaçtan hatalı şekilde düşülüyordu (net ihtiyaç
//     olduğundan az hesaplanıyordu). 'reddedildi' de artık hariç tutuluyor.
// mrp_motor.js artık dual-mode (module.exports) — gerçek birim testi yapılır.
const MrpMotor = require('../mrp_motor.js');

let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

const bugun = new Date().toISOString().slice(0, 10);

function ornekVeri() {
  return {
    siparisler: [],
    isemirleri: [
      { id: 'IE-TASLAK', kod: 'IE-TASLAK', durum: 'taslak', tarih: bugun,
        uretimListesi: [{ tip: 'yarimamul', refId: 'Y1', gerekliToplam: 100 }] },
      { id: 'IE-URETIMDE', kod: 'IE-URETIMDE', durum: 'uretimde', tarih: bugun,
        uretimListesi: [{ tip: 'yarimamul', refId: 'Y1', gerekliToplam: 50 }] },
      { id: 'IE-TAMAMLANDI', kod: 'IE-TAMAMLANDI', durum: 'tamamlandi', tarih: bugun,
        uretimListesi: [{ tip: 'yarimamul', refId: 'Y1', gerekliToplam: 999 }] }
    ],
    urunler: [],
    yarimamuller: [{ id: 'Y1', kod: 'YM1', ad: 'Kapak' }],
    receteler: [{ yarimamulId: 'Y1', kalemler: [{ tip: 'hammadde', refId: 'H1', miktar: 10 }] }],
    hammaddeler: [{ id: 'H1', stokKodu: 'HM1', ad: 'Vida', birim: 'ADET', emniyetStogu: 0, tedarikSuresiGun: 7, minSiparisMiktari: 0, birimFiyat: 1 }],
    stokRaf: [],
    satinalmaSiparisleri: [
      { id: 'SAS-TAMAMLANDI', hammaddeId: 'H1', durum: 'tamamlandi', miktar: 200, tarih: bugun, tahminiGirisTarihi: bugun },
      { id: 'SAS-GONDERILDI', hammaddeId: 'H1', durum: 'gonderildi', miktar: 100, tarih: bugun, tahminiGirisTarihi: bugun },
      { id: 'SAS-REDDEDILDI', hammaddeId: 'H1', durum: 'reddedildi', miktar: 300, tarih: bugun, tahminiGirisTarihi: bugun },
      { id: 'SAS-IPTAL', hammaddeId: 'H1', durum: 'iptal', miktar: 400, tarih: bugun, tahminiGirisTarihi: bugun }
    ],
    talepler: [],
    satinalmaTalepleri: []
  };
}

console.log('\n-- mpsOlustur: taslak iş emri MRP\'ye HİÇ girmiyor --');
{
  const v = ornekVeri();
  const mps = MrpMotor.mpsOlustur(v);
  const kaynaklar = mps.map(m => m.kaynakId);
  t('IE-TASLAK mps\'de YOK', !kaynaklar.includes('IE-TASLAK'));
  t('IE-URETIMDE mps\'de VAR', kaynaklar.includes('IE-URETIMDE'));
  t('IE-TAMAMLANDI mps\'de YOK (üretimde değil)', !kaynaklar.includes('IE-TAMAMLANDI'));
  const uretimdeKalem = mps.find(m => m.kaynakId === 'IE-URETIMDE');
  t('IE-URETIMDE adedi doğru taşınıyor (gerekliToplam=50)', uretimdeKalem && uretimdeKalem.adet === 50);
}

console.log('\n-- calistir: tamamlanmış/reddedilmiş satınalma siparişi "yolda" sayılmıyor --');
{
  const v = ornekVeri();
  const sonuc = MrpMotor.calistir(v, { ufukHafta: 12 });
  const satir = sonuc.satirlar.find(s => s.hammaddeId === 'H1');
  t('H1 için satır üretildi (taslak/tamamlandi iş emirleri hariç, sadece uretimde brüt ihtiyaç yaratıyor)', !!satir);
  if (satir) {
    // Brüt ihtiyaç yalnızca IE-URETIMDE'den gelmeli: 50 adet YM1 x 10 H1/YM1 = 500
    t('brüt ihtiyaç yalnızca uretimde iş emrinden geliyor (500)', satir.toplamBrut === 500);
    const buHaftaDetay = satir.haftaDetay[0];
    // "yolda" yalnızca SAS-GONDERILDI (100) olmalı; SAS-TAMAMLANDI/REDDEDILDI/IPTAL dahil DEĞİL
    t('yolda miktarı yalnızca gönderilmiş siparişten geliyor (100, tamamlanmış/reddedilmiş/iptal hariç)', buHaftaDetay.yolda === 100);
  }
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
