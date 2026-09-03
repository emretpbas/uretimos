// ════════════════════════════════════════════════════════════════════════════
// KPI MOTORU — tüm göstergeler TEK yerden hesaplanır; hem KPI Paneli hem de
// AI Denetçisi aynı sayıları kullanır (tutarlılık için).
//
// Göstergeler:
//   1) OEE (Genel Ekipman Etkinliği) = Kullanılabilirlik × Performans × Kalite
//   2) Kapasite Kullanımı
//   3) Fire Oranı
//   4) Hurda (fire kararıyla hurdaya ayrılan + iade/2.kalite)
//   5) Üretim Verimliliği (standart süre / gerçekleşen süre)
//   6) Geciken Sipariş
//   7) Makine Doluluk
//   8) Personel Performansı
//   9) Satın Alma Bekleyenleri
// ════════════════════════════════════════════════════════════════════════════
const KpiMotor = (() => {
  const VARDIYA_DK = 480; // vardiya tanımlanmamışsa varsayılan: 8 saat

  async function veriYukle() {
    const [istasyonIsleri, sureler, rotalar, duruslar, siparisler, makinalar, arizalar,
           talepler, satinalmaTalepleri, iadeler, uygunsuzluklar, yarimamuller, hammaddeler,
           kritikStok, stokRaf, isemirleri, personeller] = await Promise.all([
      Store.istasyonIsleri.all(), Store.gerceklesenSureKayitlari.all(), Store.rotalar.all(),
      Store.duruslar.all(), Store.siparisler.all(), Store.makinaTechizat.all(), Store.arizaKayitlari.all(),
      Store.talepler.all(), Store.satinalmaTalepleri.all(), Store.iadeKalemleri.all(),
      Store.uygunsuzlukKayitlari.all(), Store.yarimamuller.all(), Store.hammaddeler.all(),
      Store.kritikStokSeviyeleri.all(), Store.stokRaf.all(), Store.isemirleri.all(), Store.personeller.all()
    ]);
    const vardiyalar = await Store.vardiyalar.all();
    return { istasyonIsleri, sureler, rotalar, duruslar, siparisler, makinalar, arizalar,
             talepler, satinalmaTalepleri, iadeler, uygunsuzluklar, yarimamuller, hammaddeler,
             kritikStok, stokRaf, isemirleri, personeller, vardiyalar };
  }

  // Bir iş kartının rotadaki standart süresi (dk) — adet × adım dk
  function standartDk(kart, rotalar) {
    const rota = rotalar.find(r => r.id === kart.rotaId);
    if (!rota) return 0;
    const step = (rota.steps || [])[kart.stepIndex];
    const birim = step ? (step.dk || 0) : 0;
    return birim * Math.max(0, kart.gelenAdet - (kart.fireAdet || 0));
  }

  // ── DÖNEMSEL FİLTRE (T3-32) ──────────────────────────────────────────────
  // BULGU: hesapla() daima TÜM GEÇMİŞİ (ömür boyu kümülatif) topluyordu —
  // "bugünün OEE'si ne?" gibi bir soruya cevap verilemiyordu. donemFiltre
  // OPSİYONELDİR (verilmezse eski davranış AYNEN korunur, geriye dönük
  // uyumlu): {baslangic, bitis} (ISO YYYY-MM-DD) verilirse OEE/fire/hurda/
  // verimlilik girdisi olan tarih taşıyan koleksiyonlar bu aralığa göre
  // önceden süzülür. Geciken sipariş, makine doluluk, satın alma bekleyen
  // ve personel performansı gibi ANLIK DURUM göstergeleri kasıtlı olarak
  // filtrelenmez — bunlar "şu an" sorularıdır, geçmiş bir dönemin değil.
  // "vardiya" filtresi KAPSAM DIŞI: vardiyalar koleksiyonunda saat bazlı
  // başlangıç/bitiş bilgisi yok (yalnızca günlük net çalışma dakikası),
  // bu yüzden "şu an hangi vardiyadayız" güvenilir hesaplanamaz.
  function donemAraligiHesapla(tip, referansTarihStr) {
    const ref = referansTarihStr ? new Date(referansTarihStr + 'T00:00:00') : new Date();
    const bugunStr = ref.toISOString().slice(0, 10);
    if (tip === 'gun') return { baslangic: bugunStr, bitis: bugunStr };
    if (tip === 'hafta') {
      const gunIndex = (ref.getDay() + 6) % 7; // Pazartesi=0 ... Pazar=6
      const pzt = new Date(ref);
      pzt.setDate(ref.getDate() - gunIndex);
      return { baslangic: pzt.toISOString().slice(0, 10), bitis: bugunStr };
    }
    return null; // 'tumZamanlar' veya tanımsız tip -> filtresiz (ömür boyu)
  }

  // Filtre yoksa her zaman true (eski davranış); filtre varken tarihsiz
  // kayıt GÜVENLİ VARSAYILAN olarak dışarıda bırakılır.
  function tarihAralikta(tarihStr, donemFiltre) {
    if (!donemFiltre) return true;
    if (!tarihStr) return false;
    return tarihStr >= donemFiltre.baslangic && tarihStr <= donemFiltre.bitis;
  }

  function hesapla(v, donemFiltre) {
    if (donemFiltre) {
      v = Object.assign({}, v, {
        istasyonIsleri: (v.istasyonIsleri || []).filter(k => tarihAralikta(k.olusturmaTarihi, donemFiltre)),
        sureler: (v.sureler || []).filter(s => tarihAralikta(s.tarih, donemFiltre)),
        duruslar: (v.duruslar || []).filter(d => tarihAralikta(d.tarih, donemFiltre)),
        arizalar: (v.arizalar || []).filter(a => tarihAralikta(a.zaman ? a.zaman.slice(0, 10) : a.tarih, donemFiltre)),
        iadeler: (v.iadeler || []).filter(i => tarihAralikta(i.olusturmaTarihi || i.satisTarihi, donemFiltre))
      });
    }
    const bugun = new Date().toISOString().slice(0, 10);
    const kartlar = v.istasyonIsleri || [];
    const bitenler = kartlar.filter(k => k.durum === 'tamamlandi');
    const aktifler = kartlar.filter(k => k.durum === 'aktif');

    // ── Ortak sayılar
    const toplamGelen = kartlar.reduce((a, k) => a + (k.gelenAdet || 0), 0);
    const toplamFire = kartlar.reduce((a, k) => a + (k.fireAdet || 0), 0);
    const gerceklesenDk = (v.sureler || []).reduce((a, s) => a + (s.dk || 0), 0);
    const standartToplamDk = bitenler.reduce((a, k) => a + standartDk(k, v.rotalar), 0);
    // BULGU (T3-30): OEE duruş süresi yalnızca elle girilen "Duruş/Aksaklık
    // Bildir" kayıtlarını (duruslar) sayıyordu — üretimi durduran makina
    // arızaları (arizaKayitlari) hiç hesaba katılmıyordu, OEE olduğundan
    // yüksek çıkıyordu. Yalnızca oncelik==='acil' (formda "üretim duruyor"
    // olarak tanımlı) arızalar sayılır — 'normal' öncelikli arızalar
    // üretimi durdurmaz. Süre: arızanın açılış zamanından, kapandıysa
    // kapanış zamanına, hâlâ açıksa "şu ana" kadar geçen dakikadır. Bu
    // hassas zaman damgaları (zaman/tamamlanmaZaman) olmayan ESKİ arıza
    // kayıtları (bu düzeltmeden önce açılmış) hesaba katılmaz — tarih
    // (gün) bazlı bir fark hesaplamak gerçek dışı (saatlerce değil günlerce)
    // duruş süresi üretebileceğinden dahil edilmezler.
    const simdi = new Date();
    const durusDkManuel = (v.duruslar || []).reduce((a, d) => a + (d.sureMin || 0), 0);
    const durusDkAriza = (v.arizalar || []).filter(a => a.oncelik === 'acil' && a.zaman).reduce((a, ar) => {
      const baslangic = new Date(ar.zaman);
      const bitis = ar.tamamlanmaZaman ? new Date(ar.tamamlanmaZaman) : simdi;
      return a + Math.max(0, (bitis - baslangic) / 60000);
    }, 0);
    const durusDk = durusDkManuel + durusDkAriza;

    // ── 1) OEE
    // Kullanılabilirlik = (çalışılan süre) / (çalışılan + duruş)
    const calisilanDk = gerceklesenDk;
    const kullanilabilirlik = (calisilanDk + durusDk) > 0 ? calisilanDk / (calisilanDk + durusDk) : 0;
    // Performans = standart süre / gerçekleşen süre (1'i aşamaz)
    const performans = gerceklesenDk > 0 ? Math.min(1, standartToplamDk / gerceklesenDk) : 0;
    // Kalite = sağlam adet / toplam adet
    const kalite = toplamGelen > 0 ? (toplamGelen - toplamFire) / toplamGelen : 0;
    const oee = kullanilabilirlik * performans * kalite;

    // ── 2) Kapasite Kullanımı
    // Hatlarda çalışılan süre / (hat sayısı × 1 vardiya)
    const hatlar = [...new Set((v.rotalar || []).flatMap(r => (r.steps || []).map(s => s.hat)).filter(h => h && h !== 'TAŞIMA'))];
    // KAPASİTE TABANI: tanımlı AKTİF vardiyaların net çalışma süreleri toplanır.
    // Bir hat için özel vardiya atanmışsa o kullanılır; atanmamışsa genel
    // vardiyalar geçerlidir. Hiç vardiya tanımlı değilse tek vardiya varsayılır.
    const aktifVardiyalar = (v.vardiyalar || []).filter(x => x.aktif !== false);
    const hatKapasitesi = (hat) => {
      const ozel = aktifVardiyalar.filter(x => (x.hatlar || []).includes(hat));
      const gecerli = ozel.length ? ozel : aktifVardiyalar.filter(x => !(x.hatlar || []).length);
      if (!gecerli.length) return VARDIYA_DK;
      return gecerli.reduce((a, x) => a + (x.netCalismaDk || VARDIYA_DK), 0);
    };
    const kapasiteDk = hatlar.length
      ? hatlar.reduce((a, h) => a + hatKapasitesi(h), 0)
      : VARDIYA_DK;
    const kapasiteKullanim = Math.min(1, gerceklesenDk / kapasiteDk);

    // ── 3) Fire Oranı
    const fireOrani = toplamGelen > 0 ? toplamFire / toplamGelen : 0;

    // ── 4) Hurda: fire kararıyla hurdaya ayrılanlar + 2. kalite/iade ambarı
    const fireRedleri = kartlar.reduce((a, k) =>
      a + (k.redler || []).filter(r => r.karar === 'fire').reduce((b, r) => b + (r.adet || 0), 0), 0);
    const iadeAdet = (v.iadeler || []).reduce((a, i) => a + (i.adet || i.miktar || 0), 0);
    const hurdaAdet = fireRedleri + iadeAdet;
    const hurdaOrani = toplamGelen > 0 ? hurdaAdet / toplamGelen : 0;

    // ── 5) Üretim Verimliliği = standart / gerçekleşen
    const verimlilik = gerceklesenDk > 0 ? standartToplamDk / gerceklesenDk : 0;

    // ── 6) Geciken Sipariş: termini geçmiş ve üretimi bitmemiş
    const acikSiparisler = (v.siparisler || []).filter(s =>
      s.durum === 'onaylandi' && s.uretimDurumu !== 'tamamlandi' && s.uretimDurumu !== 'iade_ambarina_alindi');
    const gecikenler = acikSiparisler.filter(s => s.uretimTermini && s.uretimTermini < bugun);
    const gecikenOrani = acikSiparisler.length > 0 ? gecikenler.length / acikSiparisler.length : 0;

    // ── 7) Makine Doluluk: arızalı/bakımdaki olmayan aktif makinalar
    const aktifMakinalar = (v.makinalar || []).filter(m => m.durum !== 'hurda');
    const arizaliIdler = new Set((v.arizalar || []).filter(a => a.durum === 'bekliyor').map(a => a.makinaId));
    const bakimAlarmli = aktifMakinalar.filter(m => {
      if (!m.bakimAralikGun) return false;
      const son = m.sonBakimTarihi || m.alisTarihi;
      if (!son) return true;
      return new Date(new Date(son).getTime() + m.bakimAralikGun * 86400000).toISOString().slice(0, 10) <= bugun;
    });
    const kullanilamayan = new Set([...arizaliIdler, ...bakimAlarmli.map(m => m.id)]);
    const calisabilir = aktifMakinalar.filter(m => !kullanilamayan.has(m.id));
    const makineDoluluk = aktifMakinalar.length > 0 ? calisabilir.length / aktifMakinalar.length : 0;

    // ── 8) Personel Performansı: kişi başı işlenen adet ve dk/adet
    const personelHarita = new Map();
    kartlar.forEach(k => {
      const dk = k.barkodZamani && k.bitisZamani
        ? Math.max(0, (new Date(k.bitisZamani) - new Date(k.barkodZamani)) / 60000) : 0;
      const onaylar = [...(k.islemOnaylari || []), ...(k.sevkler || [])];
      onaylar.forEach(o => {
        if (!o.kisi) return;
        if (!personelHarita.has(o.kisi)) personelHarita.set(o.kisi, { kisi: o.kisi, adet: 0, kart: 0, dk: 0 });
        const p = personelHarita.get(o.kisi);
        p.adet += o.adet || 0;
      });
      // Süreyi kartın işleyenlerine dağıt
      const kisiler = [...new Set(onaylar.map(o => o.kisi).filter(Boolean))];
      kisiler.forEach(ki => {
        const p = personelHarita.get(ki);
        if (p) { p.kart++; p.dk += dk / kisiler.length; }
      });
    });
    const personelListesi = [...personelHarita.values()].map(p => ({
      ...p, dk: Math.round(p.dk * 10) / 10,
      birimDk: p.adet > 0 ? Math.round(p.dk / p.adet * 10) / 10 : 0
    })).sort((a, b) => b.adet - a.adet);
    const ortBirimDk = personelListesi.length
      ? personelListesi.reduce((a, p) => a + p.birimDk, 0) / personelListesi.length : 0;

    // ── 9) Satın Alma Bekleyenleri
    const bekleyenTalepler = (v.talepler || []).filter(t => t.durum === 'beklemede');
    const teklifBekleyen = (v.satinalmaTalepleri || []).filter(s => s.durum === 'teklif_bekleniyor');
    const satinalmaBekleyen = bekleyenTalepler.length + teklifBekleyen.length;

    return {
      oee: { deger: oee, kullanilabilirlik, performans, kalite },
      kapasite: { deger: kapasiteKullanim, kullanilanDk: gerceklesenDk, kapasiteDk, hatSayisi: hatlar.length,
        vardiyaSayisi: aktifVardiyalar.length, vardiyaTanimli: aktifVardiyalar.length > 0 },
      fire: { deger: fireOrani, adet: toplamFire, toplam: toplamGelen },
      hurda: { deger: hurdaOrani, adet: hurdaAdet, fireKarari: fireRedleri, iade: iadeAdet },
      verimlilik: { deger: verimlilik, standartDk: Math.round(standartToplamDk), gerceklesenDk: Math.round(gerceklesenDk) },
      geciken: { deger: gecikenOrani, adet: gecikenler.length, toplam: acikSiparisler.length, liste: gecikenler },
      makineDoluluk: { deger: makineDoluluk, calisabilir: calisabilir.length, toplam: aktifMakinalar.length, arizali: arizaliIdler.size, bakimda: bakimAlarmli.length },
      personel: { deger: ortBirimDk, liste: personelListesi, kisiSayisi: personelListesi.length },
      satinalma: { deger: satinalmaBekleyen, talep: bekleyenTalepler.length, teklif: teklifBekleyen.length },
      _ham: { aktifKart: aktifler.length, bitenKart: bitenler.length, durusDk }
    };
  }

  // KPI eşikleri — AI denetçisi bunlara göre kritik durum açar
  const ESIK = {
    oee: 0.60,            // altında kritik (dünya standardı ~0.85)
    kapasite: 0.50,       // altında düşük kapasite kullanımı
    fire: 0.05,           // üstünde kritik fire
    hurda: 0.05,          // üstünde kritik hurda
    verimlilik: 0.70,     // altında düşük verimlilik
    gecikenAdet: 1,       // 1 ve üstü geciken sipariş kritik
    makineDoluluk: 0.80,  // altında makine kaybı kritik
    personelBirimDk: 0,   // bilgi amaçlı
    satinalma: 5          // üstünde birikmiş satın alma
  };

  async function tumKpi(donemFiltre) {
    const v = await veriYukle();
    return { kpi: hesapla(v, donemFiltre), veri: v };
  }

  return { tumKpi, hesapla, veriYukle, ESIK, VARDIYA_DK, donemAraligiHesapla, tarihAralikta };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = KpiMotor;
