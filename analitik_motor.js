// ════════════════════════════════════════════════════════════════════════════
// ANALİTİK MOTOR — GAP analizindeki rapor ve KPI boşluklarını kapatır.
//
// Tasarım ilkesi: HİÇBİR YENİ VERİ GİRİŞİ GEREKTİRMEZ. Tüm çıktılar sistemde
// hâlihazırda toplanan veriden türetilir (sipariş, fatura, tahsilat, stok
// hareketi, istasyon işleri, gerçekleşen süreler, duruşlar, teklifler).
//
// Ürettiği analizler:
//   1) Kârlılık      — sipariş / müşteri / ürün bazlı gerçek kâr
//   2) Yaşlandırma   — alacak ve borç (0-30/31-60/61-90/90+)
//   3) Mali KPI      — brüt marj, DSO, DPO, stok devir, nakit döngüsü (CCC)
//   4) Teslimat      — OTIF, ortalama teslim süresi, termin sapması
//   5) Pareto        — duruş kök nedeni, fire kök nedeni
//   6) Stok          — yaşlandırma, ölü stok
//   7) Levha verimi  — panel mobilyaya özgü malzeme kullanım oranı
//   8) Satış hunisi  — teklif → sipariş dönüşüm oranı
//   9) İzlenebilirlik— lot → müşteri zinciri
// ════════════════════════════════════════════════════════════════════════════
const AnalitikMotor = (() => {
  const bugun = () => new Date().toISOString().slice(0, 10);
  const gunFark = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
  const gunEkle = (t, g) => { const d = new Date(t + 'T00:00:00'); d.setDate(d.getDate() + g); return d.toISOString().slice(0, 10); };

  async function veriYukle() {
    const [siparisler, teklifler, faturalar, tahsilatlar, musteriler, tedarikciler,
           tedarikciOdemeleri, satinalmaSiparisleri, stokRaf, stokHareketleri,
           istasyonIsleri, sureler, duruslar, rotalar, yarimamuller, urunler, receteler,
           hammaddeler, irsaliyeler, musteriCekleri, firmaCekleri, iadeKalemleri, personeller] = await Promise.all([
      Store.siparisler.all(), Store.teklifler.all(), Store.faturalar.all(), Store.tahsilatlar.all(),
      Store.musteriler.all(), Store.tedarikciler.all(), Store.tedarikciOdemeleri.all(),
      Store.satinalmaSiparisleri.all(), Store.stokRaf.all(), Store.stokHareketleri.all(),
      Store.istasyonIsleri.all(), Store.gerceklesenSureKayitlari.all(), Store.duruslar.all(),
      Store.rotalar.all(), Store.yarimamuller.all(), Store.urunler.all(), Store.receteler.all(),
      Store.hammaddeler.all(), Store.irsaliyeler.all(), Store.musteriCekleri.all(),
      Store.firmaCekleri.all(), Store.iadeKalemleri.all(), Store.personeller.all()
    ]);
    return { siparisler, teklifler, faturalar, tahsilatlar, musteriler, tedarikciler,
             tedarikciOdemeleri, satinalmaSiparisleri, stokRaf, stokHareketleri,
             istasyonIsleri, sureler, duruslar, rotalar, yarimamuller, urunler, receteler,
             hammaddeler, irsaliyeler, musteriCekleri, firmaCekleri, iadeKalemleri, personeller };
  }

  // ── 1) SİPARİŞ KÂRLILIĞI ────────────────────────────────────────────────
  // Gelir  = sipariş kalemlerinin net tutarı (KDV hariç)
  // Maliyet= malzeme (reçeteden) + işçilik (gerçekleşen süre × saatlik ücret)
  //          + fire maliyeti + genel gider payı
  // NOT: Genel gider oranı ve saatlik işçilik ücreti parametredir; şirket
  // muhasebesinden alınmalıdır. Varsayılanlar sektör ortalamasıdır.
  function siparisKarliligi(v, opts) {
    const o = Object.assign({ saatlikIscilik: 250, genelGiderYuzde: 15 }, opts || {});

    // Yarı mamül birim malzeme maliyeti (reçetedeki hammaddelerden)
    const ymMaliyetCache = new Map();
    const ymMalzemeMaliyeti = (ymId, derinlik) => {
      if (derinlik > 6) return 0;
      if (ymMaliyetCache.has(ymId)) return ymMaliyetCache.get(ymId);
      const rc = v.receteler.find(r => r.yarimamulId === ymId);
      let toplam = 0;
      (rc ? rc.kalemler : []).forEach(k => {
        if (k.tip === 'hammadde') {
          const hm = v.hammaddeler.find(h => h.id === k.refId);
          toplam += (k.miktar || 0) * ((hm && hm.birimFiyat) || 0);
        } else if (k.tip === 'yarimamul') {
          toplam += (k.miktar || 0) * ymMalzemeMaliyeti(k.refId, (derinlik || 0) + 1);
        }
      });
      ymMaliyetCache.set(ymId, toplam);
      return toplam;
    };

    const satirlar = v.siparisler
      .filter(s => s.durum === 'onaylandi' || s.durum === 'sevk_edildi' || s.durum === 'kismi_sevk_edildi')
      .map(s => {
        // GELİR (KDV hariç net)
        const gelir = (s.kalemler || []).reduce((a, k) =>
          a + (k.netFiyat || 0) * (k.miktar || 1), 0);

        // MALZEME MALİYETİ — ürün reçetesi rekürsif patlatılır
        let malzeme = 0;
        (s.kalemler || []).forEach(kalem => {
          if (kalem.grup === 'urun') {
            const urun = v.urunler.find(u => u.kod === kalem.kod);
            if (!urun) return;
            App.receteAltYarimamulleri('urun', urun.id, v.receteler, { carpan: kalem.miktar || 1 })
              .forEach((mik, ymId) => { malzeme += mik * ymMalzemeMaliyeti(ymId, 0); });
          } else if (kalem.grup === 'yarimamul') {
            const ym = v.yarimamuller.find(y => y.kod === kalem.kod);
            if (ym) malzeme += (kalem.miktar || 1) * ymMalzemeMaliyeti(ym.id, 0);
          }
        });

        // İŞÇİLİK — bu siparişe ait istasyon kartlarının gerçekleşen süresi
        const ieIdler = new Set(); // bu siparişe bağlı iş emirleri
        (v.siparisler || []); // (iş emri bağı aşağıda kartlardan kurulur)
        const kartlar = v.istasyonIsleri.filter(k =>
          (k.kaynakTip === 'sip' && k.kaynakId === s.id));
        const gercekDk = kartlar.reduce((a, k) => {
          if (!k.barkodZamani || !k.bitisZamani) return a;
          return a + Math.max(0, (new Date(k.bitisZamani) - new Date(k.barkodZamani)) / 60000);
        }, 0);
        const iscilik = (gercekDk / 60) * o.saatlikIscilik;

        // FİRE MALİYETİ — fire adedi × birim malzeme maliyeti (yaklaşık)
        const fireAdet = kartlar.reduce((a, k) => a + (k.fireAdet || 0), 0);
        const toplamAdet = (s.kalemler || []).reduce((a, k) => a + (k.miktar || 1), 0);
        const birimMalzeme = toplamAdet > 0 ? malzeme / toplamAdet : 0;
        const fireMaliyet = fireAdet * birimMalzeme;

        const dogrudanMaliyet = malzeme + iscilik + fireMaliyet;
        const genelGider = dogrudanMaliyet * (o.genelGiderYuzde / 100);
        const toplamMaliyet = dogrudanMaliyet + genelGider;
        const kar = gelir - toplamMaliyet;

        return {
          siparisId: s.id, kod: s.kod, musteriId: s.musteriId, musteriAdi: s.musteriAdi || '—',
          tarih: s.tarih, durum: s.durum, gelir, malzeme, iscilik, fireMaliyet, genelGider,
          toplamMaliyet, kar, marj: gelir > 0 ? kar / gelir : 0,
          gercekDk: Math.round(gercekDk), fireAdet,
          veriKalitesi: (malzeme > 0 ? 1 : 0) + (gercekDk > 0 ? 1 : 0) // 2 = güvenilir, 0 = zayıf
        };
      });

    return satirlar.sort((a, b) => b.kar - a.kar);
  }

  // Müşteri kârlılığı — sipariş kârlılıklarının müşteri bazında toplanması
  function musteriKarliligi(karSatirlari, v) {
    const grup = new Map();
    karSatirlari.forEach(r => {
      const k = r.musteriId || r.musteriAdi;
      if (!grup.has(k)) grup.set(k, { musteriId: r.musteriId, musteriAdi: r.musteriAdi,
        gelir: 0, maliyet: 0, kar: 0, siparisSayisi: 0, iade: 0 });
      const g = grup.get(k);
      g.gelir += r.gelir; g.maliyet += r.toplamMaliyet; g.kar += r.kar; g.siparisSayisi++;
    });
    // İade etkisi
    (v.iadeKalemleri || []).forEach(i => {
      const g = [...grup.values()].find(x => x.musteriId && x.musteriId === i.musteriId);
      if (g) g.iade += (i.tutar || 0);
    });
    return [...grup.values()].map(g => ({ ...g, netKar: g.kar - g.iade,
      marj: g.gelir > 0 ? (g.kar - g.iade) / g.gelir : 0 })).sort((a, b) => b.netKar - a.netKar);
  }

  // Ürün kârlılığı + ABC analizi (Pareto: cironun %80'ini üreten ürünler = A)
  function urunKarliligi(v, karSatirlari) {
    const grup = new Map();
    v.siparisler.filter(s => s.durum === 'onaylandi' || s.durum === 'sevk_edildi' || s.durum === 'kismi_sevk_edildi').forEach(s => {
      const sipKar = karSatirlari.find(r => r.siparisId === s.id);
      const sipGelir = sipKar ? sipKar.gelir : 0;
      (s.kalemler || []).forEach(k => {
        const kod = k.kod || '—';
        if (!grup.has(kod)) grup.set(kod, { kod, ad: k.ad || '', adet: 0, gelir: 0, kar: 0 });
        const g = grup.get(kod);
        const kalemGelir = (k.netFiyat || 0) * (k.miktar || 1);
        g.adet += k.miktar || 1;
        g.gelir += kalemGelir;
        // Siparişin kârını kalem gelirine oranla dağıt
        if (sipKar && sipGelir > 0) g.kar += sipKar.kar * (kalemGelir / sipGelir);
      });
    });
    const liste = [...grup.values()].sort((a, b) => b.gelir - a.gelir);
    const toplamGelir = liste.reduce((a, x) => a + x.gelir, 0);
    let kumulatif = 0;
    return liste.map(x => {
      // ABC sınıfı, kalemden ÖNCEKİ kümülatife göre belirlenir: cironun ilk
      // %80'ini üreten kalemler A. (Kalem sonrası kümülatife bakılırsa, tek
      // ürünlü veya çok az ürünlü şirkette her ürün C sınıfına düşerdi.)
      const oncekiKum = toplamGelir > 0 ? kumulatif / toplamGelir : 0;
      kumulatif += x.gelir;
      const kumOran = toplamGelir > 0 ? kumulatif / toplamGelir : 0;
      return { ...x, marj: x.gelir > 0 ? x.kar / x.gelir : 0,
        kumulatifOran: kumOran,
        abc: oncekiKum < 0.8 ? 'A' : oncekiKum < 0.95 ? 'B' : 'C' };
    });
  }

  // ── 2) YAŞLANDIRMA (AGING) ──────────────────────────────────────────────
  const KOVA = [
    { ad: 'Vadesi Gelmedi', min: -99999, max: 0 },
    { ad: '0-30 gün', min: 1, max: 30 },
    { ad: '31-60 gün', min: 31, max: 60 },
    { ad: '61-90 gün', min: 61, max: 90 },
    { ad: '90+ gün', min: 91, max: 99999 }
  ];
  function kovaBul(gecikmeGun) {
    return KOVA.find(k => gecikmeGun >= k.min && gecikmeGun <= k.max) || KOVA[0];
  }

  function alacakYaslandirma(v) {
    // Faturanın ödenmemiş bakiyesi = genelToplam - o faturaya yapılan tahsilatlar
    const satirlar = [];
    (v.faturalar || []).forEach(f => {
      const odenen = (v.tahsilatlar || [])
        .filter(t => t.faturaId === f.id || t.faturaNo === f.faturaNo)
        .reduce((a, t) => a + (t.tutar || 0), 0);
      const bakiye = (f.genelToplam || 0) - (f.pesinatMahsup || 0) - odenen;
      if (bakiye <= 0.01) return;
      const vade = f.vadeTarihi || f.tarih;
      const gecikme = gunFark(bugun(), vade);
      satirlar.push({
        faturaNo: f.faturaNo, musteriId: f.musteriId, musteriAdi: f.musteriAdi || '—',
        tarih: f.tarih, vadeTarihi: vade, tutar: f.genelToplam || 0, odenen, bakiye,
        gecikmeGun: gecikme, kova: kovaBul(gecikme).ad
      });
    });
    // Kova özeti
    const ozet = KOVA.map(k => ({ ad: k.ad, tutar: 0, adet: 0 }));
    satirlar.forEach(s => {
      const i = KOVA.findIndex(k => k.ad === s.kova);
      if (i >= 0) { ozet[i].tutar += s.bakiye; ozet[i].adet++; }
    });
    // Müşteri bazlı
    const musteriGrup = new Map();
    satirlar.forEach(s => {
      const k = s.musteriId || s.musteriAdi;
      if (!musteriGrup.has(k)) musteriGrup.set(k, { musteriAdi: s.musteriAdi, toplam: 0, kovalar: {} });
      const g = musteriGrup.get(k);
      g.toplam += s.bakiye;
      g.kovalar[s.kova] = (g.kovalar[s.kova] || 0) + s.bakiye;
    });
    return {
      satirlar: satirlar.sort((a, b) => b.gecikmeGun - a.gecikmeGun),
      ozet, toplam: satirlar.reduce((a, s) => a + s.bakiye, 0),
      musteriler: [...musteriGrup.values()].sort((a, b) => b.toplam - a.toplam),
      riskli: satirlar.filter(s => s.gecikmeGun > 90).reduce((a, s) => a + s.bakiye, 0)
    };
  }

  function borcYaslandirma(v) {
    const satirlar = [];
    (v.satinalmaSiparisleri || []).filter(s => s.durum !== 'iptal').forEach(sp => {
      const tutar = sp.genelToplam || sp.toplamTutar || 0;
      if (!tutar) return;
      const odenen = (v.tedarikciOdemeleri || [])
        .filter(o => o.ilgiliSiparisId === sp.id).reduce((a, o) => a + (o.tutar || 0), 0);
      const bakiye = tutar - odenen;
      if (bakiye <= 0.01) return;
      const vade = sp.vadeTarihi || sp.tarih;
      const gecikme = gunFark(bugun(), vade);
      satirlar.push({
        kod: sp.kod || sp.siparisNo, tedarikciAdi: sp.tedarikciAdi || '—',
        tarih: sp.tarih, vadeTarihi: vade, tutar, odenen, bakiye,
        gecikmeGun: gecikme, kova: kovaBul(gecikme).ad
      });
    });
    const ozet = KOVA.map(k => ({ ad: k.ad, tutar: 0, adet: 0 }));
    satirlar.forEach(s => {
      const i = KOVA.findIndex(k => k.ad === s.kova);
      if (i >= 0) { ozet[i].tutar += s.bakiye; ozet[i].adet++; }
    });
    return { satirlar: satirlar.sort((a, b) => b.gecikmeGun - a.gecikmeGun), ozet,
      toplam: satirlar.reduce((a, s) => a + s.bakiye, 0) };
  }

  // ── 3) MALİ KPI'LAR ─────────────────────────────────────────────────────
  function maliKpi(v, karSatirlari, alacak, borc) {
    // Gün sayısı: sabit 365 yerine verinin gerçek kapsadığı aralık kullanılır.
    // Sistem 3 aydır kullanılıyorsa 365'e bölmek DSO'yu yapay olarak şişirir.
    const tarihler = [
      ...karSatirlari.map(r => r.tarih),
      ...(v.faturalar || []).map(f => f.tarih),
      ...(v.satinalmaSiparisleri || []).map(s => s.tarih)
    ].filter(Boolean).sort();
    let gunSayisi = 365;
    if (tarihler.length >= 2) {
      const span = gunFark(tarihler[tarihler.length - 1], tarihler[0]) + 1;
      gunSayisi = Math.max(30, Math.min(365, span)); // en az 30, en çok 365 gün
    }
    const toplamGelir = karSatirlari.reduce((a, r) => a + r.gelir, 0);
    const toplamMaliyet = karSatirlari.reduce((a, r) => a + r.toplamMaliyet, 0);
    const brutKar = toplamGelir - toplamMaliyet;
    const brutMarj = toplamGelir > 0 ? brutKar / toplamGelir : 0;

    const gunlukSatis = toplamGelir / gunSayisi;
    const gunlukAlis = (v.satinalmaSiparisleri || [])
      .reduce((a, s) => a + (s.genelToplam || s.toplamTutar || 0), 0) / gunSayisi;

    // Stok değeri (hammadde + yarı mamül)
    const stokDegeri = (v.stokRaf || []).reduce((a, s) => {
      if (s.tip === 'hammadde') {
        const hm = v.hammaddeler.find(h => h.id === s.refId);
        return a + (s.miktar || 0) * ((hm && hm.birimFiyat) || 0);
      }
      return a;
    }, 0);

    const dso = gunlukSatis > 0 ? alacak.toplam / gunlukSatis : 0;
    const dpo = gunlukAlis > 0 ? borc.toplam / gunlukAlis : 0;
    const stokDevirGun = toplamMaliyet > 0 ? (stokDegeri / toplamMaliyet) * gunSayisi : 0;
    const stokDevirHizi = stokDegeri > 0 ? toplamMaliyet / stokDegeri : 0;
    const ccc = dso + stokDevirGun - dpo;

    return {
      toplamGelir, toplamMaliyet, brutKar, brutMarj, donemGun: gunSayisi,
      dso: Math.round(dso), dpo: Math.round(dpo),
      stokDegeri, stokDevirGun: Math.round(stokDevirGun),
      stokDevirHizi: Math.round(stokDevirHizi * 10) / 10,
      ccc: Math.round(ccc)
    };
  }

  // ── 4) TESLİMAT PERFORMANSI (OTIF) ──────────────────────────────────────
  function teslimatPerformansi(v) {
    const teslimEdilenler = v.siparisler.filter(s => s.durum === 'sevk_edildi' || s.uretimDurumu === 'tamamlandi');
    const satirlar = teslimEdilenler.map(s => {
      const irs = (v.irsaliyeler || []).filter(i => i.siparisId === s.id)
        .sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));
      const teslimTarihi = irs.length ? irs[irs.length - 1].tarih : null;
      const termin = s.uretimTermini || null;
      const zamanindaMi = (teslimTarihi && termin) ? teslimTarihi <= termin : null;
      // Eksiksizlik: irsaliye kalemleri sipariş kalemlerini karşılıyor mu
      const sipAdet = (s.kalemler || []).reduce((a, k) => a + (k.miktar || 1), 0);
      const irsAdet = irs.reduce((a, i) => a + (i.kalemler || []).reduce((b, k) => b + (k.miktar || 1), 0), 0);
      const eksiksizMi = irs.length ? irsAdet >= sipAdet - 0.001 : null;
      const leadTime = (teslimTarihi && s.tarih) ? gunFark(teslimTarihi, s.tarih) : null;
      const sapma = (teslimTarihi && termin) ? gunFark(teslimTarihi, termin) : null;
      return { kod: s.kod, musteriAdi: s.musteriAdi || '—', siparisTarihi: s.tarih,
        termin, teslimTarihi, zamanindaMi, eksiksizMi, leadTime, sapma,
        otif: (zamanindaMi === true && eksiksizMi === true) };
    });
    const olculebilir = satirlar.filter(r => r.zamanindaMi !== null && r.eksiksizMi !== null);
    const otifSayi = olculebilir.filter(r => r.otif).length;
    const zamanindaSayi = satirlar.filter(r => r.zamanindaMi === true).length;
    const zamanOlculebilir = satirlar.filter(r => r.zamanindaMi !== null).length;
    const leadTimeler = satirlar.map(r => r.leadTime).filter(x => x !== null);
    const sapmalar = satirlar.map(r => r.sapma).filter(x => x !== null);
    return {
      satirlar: satirlar.sort((a, b) => (b.teslimTarihi || '').localeCompare(a.teslimTarihi || '')),
      otifOrani: olculebilir.length ? otifSayi / olculebilir.length : null,
      zamanindaOrani: zamanOlculebilir ? zamanindaSayi / zamanOlculebilir : null,
      ortLeadTime: leadTimeler.length ? leadTimeler.reduce((a, b) => a + b, 0) / leadTimeler.length : null,
      ortSapma: sapmalar.length ? sapmalar.reduce((a, b) => a + b, 0) / sapmalar.length : null,
      olculebilirSayi: olculebilir.length, toplamTeslim: satirlar.length
    };
  }

  // ── 5) PARETO ANALİZLERİ ────────────────────────────────────────────────
  function paretoOlustur(kayitlar, anahtarFn, degerFn) {
    const grup = new Map();
    kayitlar.forEach(k => {
      const a = anahtarFn(k) || 'Belirtilmemiş';
      grup.set(a, (grup.get(a) || 0) + (degerFn(k) || 0));
    });
    const liste = [...grup.entries()].map(([ad, deger]) => ({ ad, deger }))
      .filter(x => x.deger > 0).sort((a, b) => b.deger - a.deger);
    const toplam = liste.reduce((a, x) => a + x.deger, 0);
    let kum = 0;
    return liste.map(x => {
      kum += x.deger;
      return { ...x, oran: toplam > 0 ? x.deger / toplam : 0,
        kumulatif: toplam > 0 ? kum / toplam : 0 };
    });
  }

  function durusPareto(v) {
    return paretoOlustur(v.duruslar || [],
      d => (d.aciklama || d.sebep || d.tip || 'Belirtilmemiş').slice(0, 40),
      d => d.sureMin || 0);
  }

  function firePareto(v) {
    // Red kayıtlarındaki gerekçeler
    const redler = [];
    (v.istasyonIsleri || []).forEach(k => {
      (k.redler || []).forEach(r => redler.push({ ...r, istasyonKod: k.istasyonKod, ymKod: k.ymKod }));
    });
    return {
      gerekce: paretoOlustur(redler, r => (r.gerekce || 'Belirtilmemiş').slice(0, 40), r => r.adet || 0),
      istasyon: paretoOlustur(redler, r => r.istasyonKod, r => r.adet || 0),
      urun: paretoOlustur(redler, r => r.ymKod, r => r.adet || 0),
      toplamRed: redler.reduce((a, r) => a + (r.adet || 0), 0)
    };
  }

  // ── 6) STOK YAŞLANDIRMA & ÖLÜ STOK ──────────────────────────────────────
  function stokYaslandirma(v) {
    // Son hareket tarihi = stokHareketleri içinde o kalemin en son hareketi
    const sonHareket = new Map();
    (v.stokHareketleri || []).forEach(h => {
      const ad = h.kalemAdi || '';
      if (!sonHareket.has(ad) || (h.tarih || '') > sonHareket.get(ad)) sonHareket.set(ad, h.tarih || '');
    });
    const satirlar = (v.stokRaf || []).filter(s => (s.miktar || 0) > 0).map(s => {
      const son = sonHareket.get(s.refAd) || sonHareket.get(s.refKod) || null;
      const gun = son ? gunFark(bugun(), son) : null;
      let deger = 0;
      if (s.tip === 'hammadde') {
        const hm = v.hammaddeler.find(h => h.id === s.refId);
        deger = (s.miktar || 0) * ((hm && hm.birimFiyat) || 0);
      }
      return { kod: s.refKod, ad: s.refAd, tip: s.tip, ambar: s.ambar,
        miktar: s.miktar, birim: s.birim, deger, sonHareket: son, bekleyenGun: gun,
        kova: gun === null ? 'Hareket kaydı yok' : gun <= 30 ? '0-30 gün' :
              gun <= 90 ? '31-90 gün' : gun <= 180 ? '91-180 gün' : '180+ gün (ÖLÜ)' };
    });
    const oluStok = satirlar.filter(s => s.bekleyenGun !== null && s.bekleyenGun > 180);
    const kovalar = ['0-30 gün', '31-90 gün', '91-180 gün', '180+ gün (ÖLÜ)', 'Hareket kaydı yok']
      .map(ad => ({ ad, adet: satirlar.filter(s => s.kova === ad).length,
        deger: satirlar.filter(s => s.kova === ad).reduce((a, s) => a + s.deger, 0) }));
    return { satirlar: satirlar.sort((a, b) => (b.bekleyenGun || 0) - (a.bekleyenGun || 0)),
      kovalar, oluStokAdet: oluStok.length,
      oluStokDeger: oluStok.reduce((a, s) => a + s.deger, 0),
      toplamDeger: satirlar.reduce((a, s) => a + s.deger, 0) };
  }

  // ── 7) LEVHA / MALZEME VERİMİ (mobilyaya özgü) ──────────────────────────
  // Teorik ihtiyaç (reçeteden) vs fiili tüketim (stok çıkışlarından).
  // Aradaki fark = fire + kayıp. Panel mobilyada en kritik maliyet göstergesi.
  function malzemeVerimi(v) {
    // Teorik: üretilen yarı mamüller × reçete miktarı
    const teorik = new Map(); // hammaddeId -> miktar
    (v.istasyonIsleri || []).filter(k => k.durum === 'tamamlandi').forEach(k => {
      const uretilen = (k.gelenAdet || 0) - (k.fireAdet || 0);
      if (uretilen <= 0) return;
      const rc = v.receteler.find(r => r.yarimamulId === k.yarimamulId);
      (rc ? rc.kalemler : []).forEach(rk => {
        if (rk.tip !== 'hammadde') return;
        teorik.set(rk.refId, (teorik.get(rk.refId) || 0) + (rk.miktar || 0) * uretilen);
      });
    });
    // Fiili: üretimde sarf edilen stok çıkışları
    const fiili = new Map();
    (v.stokHareketleri || []).filter(h => h.tip === 'cikis' &&
      /sarf|tüket|üretim/i.test(h.aciklama || '')).forEach(h => {
      const hm = v.hammaddeler.find(x => x.ad === h.kalemAdi || x.stokKodu === h.kalemAdi);
      if (hm) fiili.set(hm.id, (fiili.get(hm.id) || 0) + (h.miktar || 0));
    });

    const satirlar = [];
    const tumIdler = new Set([...teorik.keys(), ...fiili.keys()]);
    tumIdler.forEach(id => {
      const hm = v.hammaddeler.find(h => h.id === id);
      if (!hm) return;
      const t = teorik.get(id) || 0, f = fiili.get(id) || 0;
      if (t === 0 && f === 0) return;
      const sapma = f - t;
      satirlar.push({
        kod: hm.stokKodu, ad: hm.ad, birim: hm.birim, birimFiyat: hm.birimFiyat || 0,
        teorik: t, fiili: f, sapma, sapmaYuzde: t > 0 ? sapma / t : null,
        verimYuzde: f > 0 ? t / f : null, sapmaTutar: sapma * (hm.birimFiyat || 0)
      });
    });
    const toplamTeorik = satirlar.reduce((a, s) => a + s.teorik * s.birimFiyat, 0);
    const toplamFiili = satirlar.reduce((a, s) => a + s.fiili * s.birimFiyat, 0);
    return {
      satirlar: satirlar.sort((a, b) => Math.abs(b.sapmaTutar) - Math.abs(a.sapmaTutar)),
      genelVerim: toplamFiili > 0 ? toplamTeorik / toplamFiili : null,
      toplamTeorikTutar: toplamTeorik, toplamFiiliTutar: toplamFiili,
      kayipTutar: toplamFiili - toplamTeorik
    };
  }

  // ── 8) SATIŞ HUNİSİ — teklif dönüşüm oranı ──────────────────────────────
  function satisHunisi(v) {
    const teklifler = v.teklifler || [];
    const toplam = teklifler.length;
    const siparise = teklifler.filter(t => t.durum === 'siparise_donustu' || t.siparisId).length;
    const reddedilen = teklifler.filter(t => t.durum === 'reddedildi' || t.durum === 'siparis_reddedildi').length;
    const bekleyen = toplam - siparise - reddedilen;
    const toplamTutar = teklifler.reduce((a, t) => a + (t.dipToplam || t.araToplam || 0), 0);
    const kazanilanTutar = teklifler.filter(t => t.durum === 'siparise_donustu' || t.siparisId)
      .reduce((a, t) => a + (t.dipToplam || t.araToplam || 0), 0);
    // Aylık trend
    const aylik = new Map();
    teklifler.forEach(t => {
      const ay = (t.tarih || '').slice(0, 7);
      if (!ay) return;
      if (!aylik.has(ay)) aylik.set(ay, { ay, teklif: 0, kazanilan: 0 });
      const g = aylik.get(ay);
      g.teklif++;
      if (t.durum === 'siparise_donustu' || t.siparisId) g.kazanilan++;
    });
    return {
      toplam, siparise, reddedilen, bekleyen,
      donusumOrani: toplam > 0 ? siparise / toplam : null,
      tutarDonusumOrani: toplamTutar > 0 ? kazanilanTutar / toplamTutar : null,
      toplamTutar, kazanilanTutar,
      aylik: [...aylik.values()].sort((a, b) => a.ay.localeCompare(b.ay))
    };
  }

  // ── 9) İZLENEBİLİRLİK — lot → müşteri ───────────────────────────────────
  function lotIzlenebilirlik(v, lotNo) {
    // Lot numarası geçen istasyon kartları → kaynak sipariş → irsaliye → müşteri
    const kartlar = (v.istasyonIsleri || []).filter(k =>
      (k.lotNo && k.lotNo === lotNo) || (k.kaynakKod === lotNo));
    const siparisIdler = new Set(kartlar.filter(k => k.kaynakTip === 'sip').map(k => k.kaynakId));
    const musteriler = [];
    siparisIdler.forEach(sid => {
      const s = v.siparisler.find(x => x.id === sid);
      if (!s) return;
      const irs = (v.irsaliyeler || []).filter(i => i.siparisId === sid);
      musteriler.push({ siparisKod: s.kod, musteriAdi: s.musteriAdi,
        irsaliyeler: irs.map(i => i.irsaliyeNo), teslimTarihi: irs.length ? irs[0].tarih : null });
    });
    return { lotNo, kartSayisi: kartlar.length, musteriler };
  }

  // ── TÜMÜNÜ HESAPLA ──────────────────────────────────────────────────────
  async function tumAnaliz(opts) {
    const v = await veriYukle();
    const kar = siparisKarliligi(v, opts);
    const alacak = alacakYaslandirma(v);
    const borc = borcYaslandirma(v);
    return {
      veri: v,
      karlilik: kar,
      musteriKarlilik: musteriKarliligi(kar, v),
      urunKarlilik: urunKarliligi(v, kar),
      alacak, borc,
      mali: maliKpi(v, kar, alacak, borc),
      teslimat: teslimatPerformansi(v),
      durusPareto: durusPareto(v),
      firePareto: firePareto(v),
      stok: stokYaslandirma(v),
      malzeme: malzemeVerimi(v),
      huni: satisHunisi(v)
    };
  }

  return { tumAnaliz, veriYukle, siparisKarliligi, musteriKarliligi, urunKarliligi,
           alacakYaslandirma, borcYaslandirma, maliKpi, teslimatPerformansi,
           durusPareto, firePareto, stokYaslandirma, malzemeVerimi, satisHunisi,
           lotIzlenebilirlik, paretoOlustur };
})();
