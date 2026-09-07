// ── MASA / WORKSTATION TASARIM EKRANI — ürün ağacına işleme testi ──────────
// masa_tasarim.js (795 satır) hiç test edilmemişti. DOM'a derinden bağlı
// olsa da (ac(), listeAc()), asıl iş mantığı olan urunAgacinaIsle() saf
// Store/App çağrılarından ibarettir ve document'e HİÇ dokunmaz — bu yüzden
// dosya dolap_tasarim.js ile aynı desende dual-mode yapıldı (module.exports
// eklendi, davranış değişmedi) ve Store/App sahte (in-memory) uygulamalarla
// gerçek birim testi yazılabildi.
// NOT: masa_tasarim.js modül gövdesinde üstte "const M = MasaHesap;" bare
// global referansı var — bu yüzden require'dan ÖNCE global.MasaHesap (ve
// global.MasaCizim) tanımlanmalı; aksi halde ReferenceError fırlatır.
//     node testler/masa_tasarim_testi.js
global.MasaHesap = require('../masa_hesap.js');
global.MasaCizim = require('../masa_cizim.js');

let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

function sahteOrtamKur(mevcutHammaddeler) {
  const db = {
    yarimamuller: [], urunler: [], receteler: [],
    hammaddeler: mevcutHammaddeler || [], paketler: [], masaTasarimlari: []
  };
  let uidSayac = 0;
  global.App = {
    uid: (prefix) => prefix + '-' + (++uidSayac),
    persist: async (fn) => fn(),
    toast: () => {}, closeModal: () => {}
  };
  global.Store = {};
  Object.keys(db).forEach(k => {
    global.Store[k] = {
      all: async () => db[k],
      save: async (arr) => { db[k] = arr; }
    };
  });
  return db;
}

async function calistir() {

console.log('\n-- urunAgacinaIsle: panel + metal + hırdavat + paket doğru ürün ağacına işleniyor --');
{
  const db = sahteOrtamKur([]);
  delete require.cache[require.resolve('../masa_tasarim.js')];
  const MasaTasarim = require('../masa_tasarim.js');

  const h = global.MasaHesap.hesapla({
    kisiSayisi: 4, dizilim: 'karsilikli', tablaBoy: 1600, tablaEn: 700, tablaKalinlik: 30,
    ayakModeli: 'Iron', ayakYukseklik: 720, traversVar: true, aksesuarVar: true, paketleme: true,
    panelAyarlari: { tabla: { hammaddeId: 'PL-1', bantlar: { on: 'B-1', arka: 'B-1', sag: 'B-1', sol: 'B-1' } } }
  });

  let onSavedCagrildi = false;
  await MasaTasarim.urunAgacinaIsle('Test Workstation', h, () => { onSavedCagrildi = true; });

  t('1 ürün kartı oluşturuldu', db.urunler.length === 1);
  t('ürün tipi bitmis_urun', db.urunler[0].tip === 'bitmis_urun');
  t('yarı mamül sayısı = panel + metal sayısı', db.yarimamuller.length === h.paneller.length + h.metaller.length);
  const anaRecete = db.receteler.find(r => r.urunId === db.urunler[0].id);
  t('ana reçete oluşturuldu', !!anaRecete);
  t('ana reçete kalem sayısı = panel+metal+hırdavat+paket', anaRecete &&
    anaRecete.kalemler.length === h.paneller.length + h.metaller.length + h.hirdavat.length + h.paketler.length);
  t('panel yarı mamülüne plaka reçetesi (hammaddeId dolu) eklendi',
    !!db.receteler.find(r => r.yarimamulId && r.kalemler[0] && r.kalemler[0].refId === 'PL-1'));
  t('plaka reçete kaleminde 4 kenar bant taşınıyor',
    (() => {
      const rc = db.receteler.find(r => r.kalemler[0] && r.kalemler[0].refId === 'PL-1');
      const kb = rc.kalemler[0].kenarBantlari;
      return kb && kb.on === 'B-1' && kb.arka === 'B-1' && kb.sag === 'B-1' && kb.sol === 'B-1';
    })());
  t('sistemde olmayan hırdavatlar (Minifix, Köşe koruyucu, Aksesuar) otomatik açıldı',
    db.hammaddeler.length === h.hirdavat.length);
  t('paket kartları oluşturuldu (h.paketler kadar)', db.paketler.length === h.paketler.length);
  t('metal parça açıklamasında ALT REÇETE HENÜZ GİRİLMEDİ uyarısı var (reçete henüz yok)',
    db.yarimamuller.some(y => /ALT REÇETE HENÜZ GİRİLMEDİ/.test(y.aciklama)));
  t('tasarım kaydı revizyon 1 ile oluşturuldu', db.masaTasarimlari.length === 1 && db.masaTasarimlari[0].revizyon === 1);
  t('revizyon kaydında üretilen ürün kodu doğru bağlandı',
    db.masaTasarimlari[0].revizyonlar[0].urunId === db.urunler[0].id);
  t('onSaved callback çağrıldı', onSavedCagrildi === true);
}

console.log('\n-- urunAgacinaIsle: mevcut hammadde (Minifix) varsa YENİDEN AÇILMIYOR, mevcut karta bağlanıyor --');
{
  const mevcutMinifix = { id: 'HM-MEVCUT', ad: 'Minifix metal dübel takım', tip: 'hirdavat', birim: 'ADET' };
  const db = sahteOrtamKur([mevcutMinifix]);
  delete require.cache[require.resolve('../masa_tasarim.js')];
  const MasaTasarim = require('../masa_tasarim.js');

  const h = global.MasaHesap.hesapla({ kisiSayisi: 2, dizilim: 'tek_sira', tablaBoy: 1400, tablaEn: 800, minifixTablaBasi: 8, aksesuarVar: false });
  await MasaTasarim.urunAgacinaIsle('Tekli Masa', h, null);

  t('mevcut Minifix kartı yeniden AÇILMADI (toplam hammadde sayısı hırdavat sayısından az)',
    db.hammaddeler.length < h.hirdavat.length + 1);
  const anaRecete = db.receteler.find(r => r.urunId === db.urunler[0].id);
  const minifixKalemi = anaRecete.kalemler.find(k => k.refId === 'HM-MEVCUT');
  t('ana reçetede minifix kalemi MEVCUT karta bağlandı', !!minifixKalemi);
}

console.log('\n-- urunAgacinaIsle: aynı tasarım ikinci kez işlenince revizyon numarası ARTIYOR --');
{
  const db = sahteOrtamKur([]);
  delete require.cache[require.resolve('../masa_tasarim.js')];
  const MasaTasarim = require('../masa_tasarim.js');
  const h = global.MasaHesap.hesapla({ kisiSayisi: 2, dizilim: 'tek_sira', tablaBoy: 1400, tablaEn: 800 });

  await MasaTasarim.urunAgacinaIsle('İkinci Revizyon Testi', h, null);
  await MasaTasarim.urunAgacinaIsle('İkinci Revizyon Testi', h, null);

  t('tek tasarım kaydı var (yeni kayıt AÇILMADI, aynı kayıt revize edildi)', db.masaTasarimlari.length === 1);
  t('revizyon sayısı 2 (R1 ve R2)', db.masaTasarimlari[0].revizyonlar.length === 2);
  t('ikinci işlemede revizyon no 2 olarak damgalandı', db.masaTasarimlari[0].revizyon === 2);
  t('2 ayrı ürün kartı oluştu (her revizyon kendi ürününü üretir)', db.urunler.length === 2);
  t('ikinci ürünün kodu -R2 ile bitiyor', /-R2$/.test(db.urunler[1].kod));
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
}

calistir().catch(e => { console.error(e); process.exit(1); });
