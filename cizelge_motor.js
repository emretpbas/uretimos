// ════════════════════════════════════════════════════════════════════════════
// ÇİZELGELEME MOTORU (Sonlu Kapasite / Finite Capacity Scheduling)
//
// Amaç: "hangi iş, hangi gün, hangi hatta" sorusunu cevaplamak ve buradan
// GERÇEKÇİ TERMİN üretmek. Önceden terminler elle giriliyordu; kapasiteye
// bakılmadığı için gecikme kaçınılmazdı.
//
// Yöntem — ileri yönlü sonlu kapasite yükleme (forward finite loading):
//   1. Yapılacak işler rotalarına göre OPERASYON'lara ayrılır
//      (her yarı mamül × rota adımı = 1 operasyon, süresi adet × dk).
//   2. Operasyonlar önceliğe göre sıralanır (öncelik → termin → FIFO).
//   3. Her operasyon, ait olduğu HATTIN takvimine, o hattın günlük net
//      kapasitesi (vardiyalardan) dolana kadar yerleştirilir; dolarsa
//      ertesi güne taşar. Hafta sonu çalışılmaz (ayarlanabilir).
//   4. Aynı yarı mamülün adımları SIRALIDIR: bir sonraki adım, öncekinin
//      bitişinden önce başlayamaz (rota kısıtı).
//   5. Bir işin son operasyonunun bittiği gün = o işin TAHMİNİ TERMİNİ.
//
// Bu motor hem Üretim Çizelgesi ekranını hem de sipariş girişindeki
// "kapasiteye göre termin öner" özelliğini besler.
// ════════════════════════════════════════════════════════════════════════════
const CizelgeMotor = (() => {
  const VARSAYILAN_GUNLUK_DK = 480; // vardiya tanımlanmamışsa 8 saat

  const gunEkle = (tarihStr, gun) => {
    const d = new Date(tarihStr + 'T00:00:00');
    d.setDate(d.getDate() + gun);
    return d.toISOString().slice(0, 10);
  };
  const haftaSonuMu = (tarihStr) => {
    const g = new Date(tarihStr + 'T00:00:00').getDay();
    return g === 0 || g === 6;
  };
  // Çalışılan bir sonraki günü bulur (hafta sonu atlanır)
  const sonrakiIsGunu = (tarihStr, haftaSonuCalis) => {
    let t = gunEkle(tarihStr, 1);
    while (!haftaSonuCalis && haftaSonuMu(t)) t = gunEkle(t, 1);
    return t;
  };
  const ilkIsGunu = (tarihStr, haftaSonuCalis) => {
    let t = tarihStr;
    while (!haftaSonuCalis && haftaSonuMu(t)) t = gunEkle(t, 1);
    return t;
  };

  // Hat başına GÜNLÜK NET kapasite (dk) — vardiyalardan hesaplanır
  function hatKapasiteleri(vardiyalar, hatlar) {
    const kap = new Map();
    hatlar.forEach(h => kap.set(h, 0));
    (vardiyalar || []).filter(v => v.aktif !== false).forEach(v => {
      const net = v.netCalismaDk || 0;
      // hatlar boşsa vardiya TÜM hatlara uygulanır
      const hedefler = (v.hatlar && v.hatlar.length) ? v.hatlar : hatlar;
      hedefler.forEach(h => { if (kap.has(h)) kap.set(h, kap.get(h) + net); });
    });
    // Hiç vardiya tanımlanmamış hatlara varsayılan ver
    kap.forEach((v, k) => { if (v <= 0) kap.set(k, VARSAYILAN_GUNLUK_DK); });
    return kap;
  }

  // ── OPERASYON LİSTESİ ÇIKAR ─────────────────────────────────────────────
  // Aktif iş emirlerinden ve üretimdeki siparişlerden yapılacak operasyonları
  // üretir. Halihazırda istasyonda tamamlanmış adımlar ATLANIR (çizelge
  // yalnızca KALAN işi planlar).
  function operasyonlariCikar(v) {
    const ops = [];
    const bitmisAdimlar = new Set(
      (v.istasyonIsleri || []).filter(k => k.durum === 'tamamlandi')
        .map(k => k.kaynakTip + ':' + k.kaynakId + ':' + k.yarimamulId + ':' + k.stepIndex));

    const isEkle = (kaynakTip, kaynakId, kaynakKod, ymId, adet, rotaId, termin, oncelik) => {
      const ym = (v.yarimamuller || []).find(y => y.id === ymId);
      const rota = (v.rotalar || []).find(r => r.id === (rotaId || (ym && ym.rotaId)));
      if (!rota || !ym) return;
      const adimlar = (rota.steps || []).filter(s => s.hat && s.hat !== 'TAŞIMA');
      adimlar.forEach((st, si) => {
        const gercekIndex = (rota.steps || []).indexOf(st);
        if (bitmisAdimlar.has(kaynakTip + ':' + kaynakId + ':' + ymId + ':' + gercekIndex)) return;
        ops.push({
          id: kaynakId + '|' + ymId + '|' + gercekIndex,
          kaynakTip, kaynakId, kaynakKod,
          ymId, ymKod: ym.kod, ymAd: ym.ad,
          adimSira: si, toplamAdim: adimlar.length,
          istasyonKod: st.kod, istasyonTanim: st.tanim, hat: st.hat,
          adet, birimDk: st.dk || 0, sureDk: (st.dk || 0) * adet,
          termin: termin || null, oncelik: oncelik || 5,
          isAnahtari: kaynakId + '|' + ymId   // aynı YM'nin adımları sıralı olmalı
        });
      });
    };

    // İş emirleri
    (v.isemirleri || []).filter(ie => ie.durum !== 'tamamlandi').forEach(ie => {
      // İş emrinin bağlı olduğu siparişin termini öncelik verir
      const bagliSip = (v.siparisler || []).find(s => (ie.kaynakSiparisIdler || []).includes(s.id));
      (ie.uretimListesi || []).filter(k => k.tip === 'yarimamul').forEach(k => {
        isEkle('ie', ie.id, ie.kod, k.refId, k.gerekliToplam || ie.adet || 1, k.rotaId,
          (bagliSip && bagliSip.uretimTermini) || null, ie.oncelik || 5);
      });
    });

    // Üretimdeki siparişler (doğrudan YM + ürün reçetesinden patlatma)
    (v.siparisler || []).filter(s => s.durum === 'onaylandi' &&
      (s.uretimDurumu === 'uretimde' || !s.uretimDurumu)).forEach(s => {
      const ymAdet = new Map();
      (s.kalemler || []).forEach(kalem => {
        if (kalem.ikinciKalite) return;
        if (kalem.grup === 'yarimamul') {
          const ym = (v.yarimamuller || []).find(y => y.kod === kalem.kod);
          if (ym) ymAdet.set(ym.id, (ymAdet.get(ym.id) || 0) + (kalem.miktar || 1));
        } else if (kalem.grup === 'urun') {
          const urun = (v.urunler || []).find(u => u.kod === kalem.kod);
          if (!urun) return;
          App.receteAltYarimamulleri('urun', urun.id, v.receteler, { carpan: kalem.miktar || 1 })
            .forEach((mik, ymId) => ymAdet.set(ymId, (ymAdet.get(ymId) || 0) + mik));
        }
      });
      ymAdet.forEach((adet, ymId) => {
        isEkle('sip', s.id, s.kod, ymId, adet, null, s.uretimTermini || null, s.oncelik || 5);
      });
    });

    return ops;
  }

  // ── ÇİZELGELE ───────────────────────────────────────────────────────────
  // ops: operasyon listesi, kapasite: Map(hat -> günlük dk)
  // Dönen: { yerlesim[], isTerminleri: Map(isAnahtari -> bitisTarihi), hatYuku }
  function cizelgele(ops, kapasite, baslangicTarihi, haftaSonuCalis) {
    const bas = ilkIsGunu(baslangicTarihi, haftaSonuCalis);
    // Öncelik → termin → adım sırası
    const sirali = [...ops].sort((a, b) => {
      if (a.oncelik !== b.oncelik) return a.oncelik - b.oncelik;
      const at = a.termin || '9999-12-31', bt = b.termin || '9999-12-31';
      if (at !== bt) return at.localeCompare(bt);
      return a.adimSira - b.adimSira;
    });

    // Hat takvimi: hat -> { tarih -> kullanılan dk }
    const takvim = new Map();
    const kullanilan = (hat, tarih) => {
      if (!takvim.has(hat)) takvim.set(hat, new Map());
      return takvim.get(hat).get(tarih) || 0;
    };
    const yaz = (hat, tarih, dk) => {
      if (!takvim.has(hat)) takvim.set(hat, new Map());
      takvim.get(hat).set(tarih, (takvim.get(hat).get(tarih) || 0) + dk);
    };

    // Aynı işin bir önceki adımının bitişi (rota kısıtı)
    const isSonBitis = new Map();
    const yerlesim = [];

    sirali.forEach(op => {
      const gunlukKap = kapasite.get(op.hat) || VARSAYILAN_GUNLUK_DK;
      // Başlangıç: hattın müsaitliği VE önceki adımın bitişi
      let gun = bas;
      const oncekiBitis = isSonBitis.get(op.isAnahtari);
      if (oncekiBitis && oncekiBitis > gun) gun = oncekiBitis;
      gun = ilkIsGunu(gun, haftaSonuCalis);

      let kalan = op.sureDk;
      const parcalar = [];
      let guvenlik = 0;
      while (kalan > 0 && guvenlik++ < 2000) {
        const bosluk = Math.max(0, gunlukKap - kullanilan(op.hat, gun));
        if (bosluk <= 0) { gun = sonrakiIsGunu(gun, haftaSonuCalis); continue; }
        const konan = Math.min(bosluk, kalan);
        yaz(op.hat, gun, konan);
        parcalar.push({ tarih: gun, dk: konan });
        kalan -= konan;
        if (kalan > 0) gun = sonrakiIsGunu(gun, haftaSonuCalis);
      }
      const baslangic = parcalar.length ? parcalar[0].tarih : gun;
      const bitis = parcalar.length ? parcalar[parcalar.length - 1].tarih : gun;
      isSonBitis.set(op.isAnahtari, bitis);
      yerlesim.push({ ...op, baslangicTarihi: baslangic, bitisTarihi: bitis, parcalar });
    });

    // İş bazında en geç bitiş = tahmini termin
    const isTerminleri = new Map();
    yerlesim.forEach(y => {
      const anahtar = y.kaynakTip + ':' + y.kaynakId;
      const mevcut = isTerminleri.get(anahtar);
      if (!mevcut || y.bitisTarihi > mevcut) isTerminleri.set(anahtar, y.bitisTarihi);
    });

    // Hat yükü özeti
    const hatYuku = [];
    takvim.forEach((gunler, hat) => {
      const kap = kapasite.get(hat) || VARSAYILAN_GUNLUK_DK;
      const toplam = [...gunler.values()].reduce((a, b) => a + b, 0);
      const gunSayisi = gunler.size;
      hatYuku.push({
        hat, gunlukKapasite: kap, toplamDk: toplam, gunSayisi,
        doluluk: gunSayisi > 0 ? toplam / (gunSayisi * kap) : 0,
        gunler: [...gunler.entries()].map(([t, d]) => ({ tarih: t, dk: d, doluluk: d / kap }))
          .sort((a, b) => a.tarih.localeCompare(b.tarih))
      });
    });

    return { yerlesim, isTerminleri, hatYuku, takvim };
  }

  async function veriYukle() {
    const [isemirleri, siparisler, rotalar, yarimamuller, urunler, receteler,
           istasyonIsleri, vardiyalar] = await Promise.all([
      Store.isemirleri.all(), Store.siparisler.all(), Store.rotalar.all(),
      Store.yarimamuller.all(), Store.urunler.all(), Store.receteler.all(),
      Store.istasyonIsleri.all(), Store.vardiyalar.all()
    ]);
    return { isemirleri, siparisler, rotalar, yarimamuller, urunler, receteler, istasyonIsleri, vardiyalar };
  }

  // Tam çizelge üretir
  async function tamCizelge(opts) {
    const o = opts || {};
    const v = await veriYukle();
    const hatlar = [...new Set((v.rotalar || []).flatMap(r => (r.steps || []).map(s => s.hat))
      .filter(h => h && h !== 'TAŞIMA'))];
    const kapasite = hatKapasiteleri(v.vardiyalar, hatlar);
    const ops = operasyonlariCikar(v);
    const bas = o.baslangic || new Date().toISOString().slice(0, 10);
    const sonuc = cizelgele(ops, kapasite, bas, !!o.haftaSonuCalis);
    return { ...sonuc, kapasite, hatlar, veri: v, operasyonSayisi: ops.length };
  }

  // ── TERMİN ÖNERİSİ ──────────────────────────────────────────────────────
  // Yeni bir sipariş için: mevcut yük ÜZERİNE bu siparişin işleri eklenirse
  // ne zaman biter? (Mevcut çizelge bozulmadan, sona eklenir.)
  async function terminOner(kalemler, opts) {
    const o = opts || {};
    const v = await veriYukle();
    const hatlar = [...new Set((v.rotalar || []).flatMap(r => (r.steps || []).map(s => s.hat))
      .filter(h => h && h !== 'TAŞIMA'))];
    const kapasite = hatKapasiteleri(v.vardiyalar, hatlar);
    const mevcutOps = operasyonlariCikar(v);

    // Yeni siparişin operasyonları (en düşük öncelik = sona eklenir)
    const yeniOps = [];
    const ymAdet = new Map();
    (kalemler || []).forEach(kalem => {
      if (kalem.grup === 'yarimamul') {
        const ym = (v.yarimamuller || []).find(y => y.kod === kalem.kod);
        if (ym) ymAdet.set(ym.id, (ymAdet.get(ym.id) || 0) + (kalem.miktar || 1));
      } else if (kalem.grup === 'urun') {
        const urun = (v.urunler || []).find(u => u.kod === kalem.kod);
        if (!urun) return;
        App.receteAltYarimamulleri('urun', urun.id, v.receteler, { carpan: kalem.miktar || 1 })
          .forEach((mik, ymId) => ymAdet.set(ymId, (ymAdet.get(ymId) || 0) + mik));
      }
    });
    ymAdet.forEach((adet, ymId) => {
      const ym = (v.yarimamuller || []).find(y => y.id === ymId);
      const rota = (v.rotalar || []).find(r => r.id === (ym && ym.rotaId));
      if (!rota || !ym) return;
      (rota.steps || []).filter(s => s.hat && s.hat !== 'TAŞIMA').forEach((st, si, arr) => {
        yeniOps.push({
          id: 'YENI|' + ymId + '|' + si, kaynakTip: 'yeni', kaynakId: 'YENI', kaynakKod: 'YENİ SİPARİŞ',
          ymId, ymKod: ym.kod, ymAd: ym.ad, adimSira: si, toplamAdim: arr.length,
          istasyonKod: st.kod, istasyonTanim: st.tanim, hat: st.hat,
          adet, birimDk: st.dk || 0, sureDk: (st.dk || 0) * adet,
          termin: null, oncelik: 9, isAnahtari: 'YENI|' + ymId
        });
      });
    });

    if (!yeniOps.length) {
      return { bulundu: false, mesaj: 'Kalemlerin rotası tanımlı olmadığı için termin hesaplanamadı. Yarı mamül kartlarında rota seçin.' };
    }

    const bas = o.baslangic || new Date().toISOString().slice(0, 10);
    const sonuc = cizelgele([...mevcutOps, ...yeniOps], kapasite, bas, !!o.haftaSonuCalis);
    const yeniYerlesim = sonuc.yerlesim.filter(y => y.kaynakTip === 'yeni');
    const bitis = yeniYerlesim.reduce((en, y) => (!en || y.bitisTarihi > en) ? y.bitisTarihi : en, null);
    const toplamDk = yeniOps.reduce((a, x) => a + x.sureDk, 0);
    // Kuyruk etkisi: mevcut yük olmasaydı ne zaman biterdi?
    const yalnizYeni = cizelgele(yeniOps, kapasite, bas, !!o.haftaSonuCalis);
    const yalnizBitis = yalnizYeni.yerlesim.reduce((en, y) => (!en || y.bitisTarihi > en) ? y.bitisTarihi : en, null);

    return {
      bulundu: true, terminTarihi: bitis, yalnizBuIsBitis: yalnizBitis,
      toplamIsDk: toplamDk, operasyonSayisi: yeniOps.length,
      kuyrukGecikmesiGun: bitis && yalnizBitis
        ? Math.round((new Date(bitis) - new Date(yalnizBitis)) / 86400000) : 0,
      detay: yeniYerlesim
    };
  }

  return { tamCizelge, terminOner, operasyonlariCikar, cizelgele, hatKapasiteleri, VARSAYILAN_GUNLUK_DK };
})();
