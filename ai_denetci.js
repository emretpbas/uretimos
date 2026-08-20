// ════════════════════════════════════════════════════════════════════════════
// AI DENETÇİSİ — TÜM BİRİMLERDE ÇALIŞAN OTOMASYON MOTORU
//
// Her birim için kritik durum kuralları tanımlıdır. Motor tüm veriyi tarar,
// kritik bulguları çıkarır ve OTOMATİK DÜZELTME (revizyon) uygulayabilir.
// Uyguladığı her düzeltme aiRaporlari koleksiyonuna yazılır ve raporlanır;
// sunucu sürümünde denetim kaydından (audit log) geri de alınabilir.
//
// ÖNEMLİ TASARIM: motor asla veri SİLMEZ ve para/fiyat değiştirmez. Yalnızca
// eksik kayıt tamamlama, ihtiyaç/talep açma, tutarsız durum düzeltme ve
// işaretleme yapar. Riskli görülen bulgular "öneri" olarak kalır (otomatik
// uygulanmaz), yönetim onayı ister.
// ════════════════════════════════════════════════════════════════════════════
const AiDenetci = (() => {
  const BIRIM_ETIKET = {
    uretim: '🏭 Üretim',
    kalite: '🔬 Kalite',
    bakim: '🔧 Bakım',
    satinalma: '🛒 Satın Alma',
    depo: '📦 Depo & Stok',
    satis: '💼 Satış & Sipariş',
    planlama: '📋 Planlama',
    ik: '👥 İnsan Kaynakları',
    isg: '🦺 İSG',
    satis: '💼 Satış',
    finans: '💰 Finans & Çek',
    yonetim: '📊 Yönetim'
  };
  const SEVIYE = { kritik: ['KRİTİK', 'pill-red'], uyari: ['UYARI', 'pill-amber'], bilgi: ['BİLGİ', 'pill-blue'] };

  // ── TARAMA: tüm birimlerin kritik durumlarını çıkarır ───────────────────
  // Her bulgu: {id, birim, seviye, baslik, aciklama, otomatik(bool), aksiyonTip, veri}
  async function tara() {
    const { kpi, veri } = await KpiMotor.tumKpi();
    const [musteriCekleri, firmaCekleri, faturalar, musteriler] = await Promise.all([
      Store.musteriCekleri.all(), Store.firmaCekleri.all(), Store.faturalar.all(), Store.musteriler.all()]);
    const bulgular = [];
    const bugun = new Date().toISOString().slice(0, 10);
    const ekle = (b) => bulgular.push({ id: App.uid('AIB'), tarih: bugun, ...b });

    // ══ ÜRETİM ══
    if (kpi.oee.deger < KpiMotor.ESIK.oee && kpi._ham.bitenKart > 0) {
      const zayif = kpi.oee.kullanilabilirlik < 0.7 ? 'kullanılabilirlik (duruşlar)'
        : kpi.oee.performans < 0.7 ? 'performans (hız)' : 'kalite (fire)';
      ekle({ birim: 'uretim', seviye: 'kritik', baslik: 'OEE hedefin altında (%' + Math.round(kpi.oee.deger * 100) + ')',
        aciklama: `En zayıf bileşen: ${zayif}. Kullanılabilirlik %${Math.round(kpi.oee.kullanilabilirlik * 100)}, Performans %${Math.round(kpi.oee.performans * 100)}, Kalite %${Math.round(kpi.oee.kalite * 100)}.`,
        otomatik: false, aksiyonTip: 'oee_analiz' });
    }
    if (kpi.fire.deger > KpiMotor.ESIK.fire) {
      // Fire kaynağı istasyonlar
      const fireliler = (veri.istasyonIsleri || []).filter(k => (k.fireAdet || 0) > 0);
      const istGrup = {};
      fireliler.forEach(k => { istGrup[k.istasyonKod] = (istGrup[k.istasyonKod] || 0) + k.fireAdet; });
      const enKotu = Object.entries(istGrup).sort((a, b) => b[1] - a[1])[0];
      ekle({ birim: 'uretim', seviye: 'kritik', baslik: 'Fire oranı yüksek (%' + (kpi.fire.deger * 100).toFixed(1) + ')',
        aciklama: `${kpi.fire.adet} adet fire / ${kpi.fire.toplam} adet üretim.` + (enKotu ? ` En çok fire veren istasyon: ${enKotu[0]} (${enKotu[1]} adet).` : ''),
        otomatik: false, aksiyonTip: 'fire_analiz' });
    }
    if (kpi.verimlilik.deger > 0 && kpi.verimlilik.deger < KpiMotor.ESIK.verimlilik) {
      ekle({ birim: 'uretim', seviye: 'uyari', baslik: 'Üretim verimliliği düşük (%' + Math.round(kpi.verimlilik.deger * 100) + ')',
        aciklama: `Standart süre ${kpi.verimlilik.standartDk} dk, gerçekleşen ${kpi.verimlilik.gerceklesenDk} dk. Rota süreleri güncellenmeli veya darboğaz giderilmeli.`,
        otomatik: false, aksiyonTip: 'verim_analiz' });
    }
    // Rotasız yarı mamüller — hatta düşemez, üretim durur
    const rotasizYm = (veri.yarimamuller || []).filter(y => !y.rotaId);
    const rotasizAktif = rotasizYm.filter(y =>
      (veri.isemirleri || []).some(ie => ie.durum !== 'tamamlandi' && (ie.uretimListesi || []).some(k => k.refId === y.id)));
    if (rotasizAktif.length) {
      ekle({ birim: 'uretim', seviye: 'kritik', baslik: rotasizAktif.length + ' aktif yarı mamülde ROTA YOK',
        aciklama: 'Rotası olmayan yarı mamüller hat/istasyon takibine düşmez, üretim başlayamaz: ' + rotasizAktif.slice(0, 5).map(y => y.kod).join(', ') + (rotasizAktif.length > 5 ? '…' : ''),
        otomatik: false, aksiyonTip: 'rota_eksik', veri: { ymIdler: rotasizAktif.map(y => y.id) } });
    }
    // Barkodu okutulmamış, uzun süredir bekleyen kartlar
    const bekleyenKart = (veri.istasyonIsleri || []).filter(k => k.durum === 'aktif' && !k.barkodOkundu &&
      k.olusturmaTarihi && (new Date(bugun) - new Date(k.olusturmaTarihi)) / 86400000 >= 3);
    if (bekleyenKart.length) {
      ekle({ birim: 'uretim', seviye: 'uyari', baslik: bekleyenKart.length + ' iş 3+ gündür istasyonda BAŞLAMADI',
        aciklama: 'QR kodu okutulmamış kartlar: ' + bekleyenKart.slice(0, 4).map(k => k.ymKod + '@' + k.istasyonKod).join(', '),
        otomatik: false, aksiyonTip: 'is_bekliyor' });
    }

    // ══ KALİTE ══
    // Kalite bekliyor ama kalite kaydı yok (tutarsızlık) → OTOMATİK DÜZELTİLİR
    const kaliteKayitlari = await Store.urunKaliteOnaylari.all();
    const hayaletKalite = (veri.siparisler || []).filter(s =>
      s.uretimDurumu === 'kalite_bekliyor' && !kaliteKayitlari.some(u => u.siparisId === s.id));
    if (hayaletKalite.length) {
      ekle({ birim: 'kalite', seviye: 'kritik', baslik: hayaletKalite.length + ' sipariş kalitede ASKIDA (kaydı yok)',
        aciklama: 'Bu siparişler "Kalite Onayı Bekliyor" görünüyor ama kalite ekranında kaydı yok — süreç tıkanmış. AI eksik kalite kayıtlarını oluşturabilir.',
        otomatik: true, aksiyonTip: 'kalite_kaydi_olustur', veri: { siparisIdler: hayaletKalite.map(s => s.id) } });
    }
    // Açık NCR / DÖF birikmesi
    const acikNcr = (veri.uygunsuzluklar || []).filter(u => u.durum !== 'kapandi' && u.durum !== 'kapatildi');
    if (acikNcr.length >= 5) {
      ekle({ birim: 'kalite', seviye: 'uyari', baslik: acikNcr.length + ' açık uygunsuzluk (NCR) birikti',
        aciklama: 'Kapatılmamış uygunsuzluk sayısı yüksek. Kök neden analizi ve DÖF açılması gerekiyor.',
        otomatik: false, aksiyonTip: 'ncr_birikme' });
    }

    // ══ BAKIM ══
    const bakimAlarmli = (veri.makinalar || []).filter(m => {
      if (!m.bakimAralikGun || m.durum === 'hurda') return false;
      const son = m.sonBakimTarihi || m.alisTarihi;
      if (!son) return true;
      return new Date(new Date(son).getTime() + m.bakimAralikGun * 86400000).toISOString().slice(0, 10) <= bugun;
    });
    if (bakimAlarmli.length) {
      ekle({ birim: 'bakim', seviye: 'kritik', baslik: bakimAlarmli.length + ' makinada RUTİN BAKIM süresi doldu',
        aciklama: bakimAlarmli.slice(0, 5).map(m => m.ad + (m.bakimSorumlusu ? ' (' + m.bakimSorumlusu + ')' : '')).join(', ') + '. Bakım yapılmazsa arıza ve duruş riski.',
        otomatik: false, aksiyonTip: 'bakim_alarm', veri: { makinaIdler: bakimAlarmli.map(m => m.id) } });
    }
    const acikAriza = (veri.arizalar || []).filter(a => a.durum === 'bekliyor');
    if (acikAriza.length) {
      ekle({ birim: 'bakim', seviye: acikAriza.length >= 3 ? 'kritik' : 'uyari',
        baslik: acikAriza.length + ' açık arıza bildirimi',
        aciklama: 'Bekleyen arızalar makine dolulugunu düşürüyor (şu an %' + Math.round(kpi.makineDoluluk.deger * 100) + ').',
        otomatik: false, aksiyonTip: 'ariza_acik' });
    }
    if (kpi.makineDoluluk.deger < KpiMotor.ESIK.makineDoluluk && kpi.makineDoluluk.toplam > 0) {
      ekle({ birim: 'bakim', seviye: 'uyari', baslik: 'Makine doluluğu düşük (%' + Math.round(kpi.makineDoluluk.deger * 100) + ')',
        aciklama: `${kpi.makineDoluluk.toplam} makinanın ${kpi.makineDoluluk.arizali}'i arızalı, ${kpi.makineDoluluk.bakimda}'i bakım alarmında.`,
        otomatik: false, aksiyonTip: 'makine_doluluk' });
    }

    // ══ DEPO & STOK ══
    // Kritik seviyenin altına düşen hammaddeler → OTOMATİK satın alma talebi
    const kritikDusenler = [];
    (veri.kritikStok || []).forEach(ks => {
      const stok = (veri.stokRaf || []).filter(s => s.tip === 'hammadde' && s.refId === ks.hammaddeId)
        .reduce((a, s) => a + (s.miktar || 0), 0);
      if (stok < (ks.kritikSeviye || 0)) {
        const hm = (veri.hammaddeler || []).find(h => h.id === ks.hammaddeId);
        // Zaten açık talep varsa tekrar açma
        const acikTalep = (veri.talepler || []).some(t => t.hammaddeId === ks.hammaddeId && t.durum === 'beklemede') ||
          (veri.satinalmaTalepleri || []).some(s => s.hammaddeId === ks.hammaddeId && s.durum === 'teklif_bekleniyor');
        if (!acikTalep && hm) {
          kritikDusenler.push({ hammaddeId: ks.hammaddeId, kod: hm.stokKodu, ad: hm.ad, birim: hm.birim,
            stok, kritik: ks.kritikSeviye, oneri: Math.max(1, Math.ceil((ks.kritikSeviye || 0) * 2 - stok)) });
        }
      }
    });
    if (kritikDusenler.length) {
      ekle({ birim: 'depo', seviye: 'kritik', baslik: kritikDusenler.length + ' hammadde KRİTİK STOK seviyesinin altında',
        aciklama: kritikDusenler.slice(0, 4).map(k => `${k.kod}: ${k.stok}/${k.kritik} ${k.birim}`).join(', ') +
          '. AI, eksik malzemeler için otomatik satın alma talebi açabilir.',
        otomatik: true, aksiyonTip: 'satinalma_talebi_ac', veri: { kalemler: kritikDusenler } });
    }

    // ══ SATIN ALMA ══
    if (kpi.satinalma.deger > KpiMotor.ESIK.satinalma) {
      ekle({ birim: 'satinalma', seviye: 'uyari', baslik: kpi.satinalma.deger + ' satın alma işlemi BEKLİYOR',
        aciklama: `${kpi.satinalma.talep} talep işlenmeyi, ${kpi.satinalma.teklif} kalem tedarikçi teklifi bekliyor. Gecikme üretimi durdurabilir.`,
        otomatik: false, aksiyonTip: 'satinalma_birikme' });
    }

    // ══ PLANLAMA / SATIŞ ══
    if (kpi.geciken.adet >= KpiMotor.ESIK.gecikenAdet) {
      ekle({ birim: 'planlama', seviye: 'kritik', baslik: kpi.geciken.adet + ' sipariş TERMİNİ GEÇTİ',
        aciklama: kpi.geciken.liste.slice(0, 4).map(s => `${s.kod} (${s.musteriAdi || ''}, termin ${s.uretimTermini})`).join('; ') +
          '. Müşteri bilgilendirmesi ve yeni termin gerekiyor.',
        otomatik: false, aksiyonTip: 'geciken_siparis', veri: { siparisIdler: kpi.geciken.liste.map(s => s.id) } });
    }
    // Termini belirlenmemiş üretimdeki siparişler
    const terminsiz = (veri.siparisler || []).filter(s => s.durum === 'onaylandi' && !s.uretimTermini &&
      s.uretimDurumu !== 'tamamlandi');
    if (terminsiz.length) {
      ekle({ birim: 'planlama', seviye: 'uyari', baslik: terminsiz.length + ' onaylı siparişte ÜRETİM TERMİNİ yok',
        aciklama: 'Termini olmayan siparişler gecikme takibine giremez: ' + terminsiz.slice(0, 4).map(s => s.kod).join(', '),
        otomatik: false, aksiyonTip: 'termin_eksik' });
    }
    // Açık iş emri ihtiyacı birikmesi
    const acikIhtiyac = await Store.uretimIsEmriIhtiyaclari.all();
    const bekleyenIhtiyac = acikIhtiyac.filter(x => x.durum === 'acik');
    if (bekleyenIhtiyac.length >= 5) {
      ekle({ birim: 'planlama', seviye: 'uyari', baslik: bekleyenIhtiyac.length + ' iş emri ihtiyacı BEKLİYOR',
        aciklama: 'Rafta karşılanamayan yarı mamüller iş emrine dönüştürülmedi — üretim başlamıyor.',
        otomatik: false, aksiyonTip: 'ihtiyac_birikme' });
    }
    // Kapasite kullanımı düşük
    if (kpi.kapasite.deger < KpiMotor.ESIK.kapasite && kpi._ham.aktifKart > 0) {
      ekle({ birim: 'planlama', seviye: 'bilgi', baslik: 'Kapasite kullanımı düşük (%' + Math.round(kpi.kapasite.deger * 100) + ')',
        aciklama: `${kpi.kapasite.hatSayisi} hatta ${Math.round(kpi.kapasite.kullanilanDk)} dk çalışıldı (kapasite ${kpi.kapasite.kapasiteDk} dk/vardiya). Hat dengeleme ile iş dağıtılabilir.`,
        otomatik: false, aksiyonTip: 'kapasite_dusuk' });
    }

    // ══ FİNANS & ÇEK ══
    // Vadesi geçmiş ama hâlâ portföyde duran müşteri çekleri
    const gecikenGelenCek = musteriCekleri.filter(c => c.durum === 'elde' && c.vadeTarihi && c.vadeTarihi < bugun);
    if (gecikenGelenCek.length) {
      const tutar = gecikenGelenCek.reduce((a, c) => a + (c.tutar || 0), 0);
      ekle({ birim: 'finans', seviye: 'kritik', baslik: gecikenGelenCek.length + ' müşteri çekinin VADESİ GEÇTİ (' + App.fmtTL(tutar) + ')',
        aciklama: 'Portföyde vadesi dolmuş çekler var: ' + gecikenGelenCek.slice(0, 4).map(c => `${c.cekNo || '—'} (${c.musteriAdi || ''}, ${c.vadeTarihi})`).join('; ') +
          '. Tahsil edildiyse "Tahsil Et", banka ödemediyse "Karşılıksız" olarak işlenmeli — aksi halde alacak tablosu yanlış görünür.',
        otomatik: false, aksiyonTip: 'cek_vadesi_gecti' });
    }
    // Vadesi geçmiş kendi çekimiz (ödenmemiş görünüyor)
    const gecikenGidenCek = firmaCekleri.filter(c => c.durum === 'beklemede' && c.vadeTarihi && c.vadeTarihi < bugun);
    if (gecikenGidenCek.length) {
      const tutar = gecikenGidenCek.reduce((a, c) => a + (c.tutar || 0), 0);
      ekle({ birim: 'finans', seviye: 'kritik', baslik: gecikenGidenCek.length + ' KENDİ ÇEKİMİZİN vadesi geçti (' + App.fmtTL(tutar) + ')',
        aciklama: 'Vadesi dolmuş kendi çeklerimiz hâlâ "ödendi" işaretlenmemiş. Banka ödediyse kapatılmalı; ödenmediyse acil nakit gerekiyor.',
        otomatik: false, aksiyonTip: 'firma_cek_gecikti' });
    }
    // Yaklaşan 15 gün nakit açığı
    const yakinTarih = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    const yakinGiris = musteriCekleri.filter(c => c.durum === 'elde' && c.vadeTarihi && c.vadeTarihi <= yakinTarih)
      .reduce((a, c) => a + (c.tutar || 0), 0);
    const yakinCikis = firmaCekleri.filter(c => c.durum === 'beklemede' && c.vadeTarihi && c.vadeTarihi <= yakinTarih)
      .reduce((a, c) => a + (c.tutar || 0), 0);
    if (yakinCikis > yakinGiris && yakinCikis > 0) {
      ekle({ birim: 'finans', seviye: 'kritik', baslik: 'NAKİT AÇIĞI riski — 15 gün içinde ' + App.fmtTL(yakinCikis - yakinGiris),
        aciklama: `Önümüzdeki 15 günde çek çıkışı ${App.fmtTL(yakinCikis)}, çek girişi ${App.fmtTL(yakinGiris)}. Aradaki fark için nakit planlanmalı.`,
        otomatik: false, aksiyonTip: 'nakit_acigi' });
    }
    // Karşılıksız çıkmış çeki olan müşteriye açık sipariş
    const karsiliksizMusteriler = new Set(musteriCekleri.filter(c => c.durum === 'karsiliksiz').map(c => c.musteriId));
    if (karsiliksizMusteriler.size) {
      const riskliSiparisler = (veri.siparisler || []).filter(s =>
        karsiliksizMusteriler.has(s.musteriId) && s.durum !== 'reddedildi' && s.uretimDurumu !== 'tamamlandi');
      if (riskliSiparisler.length) {
        ekle({ birim: 'finans', seviye: 'kritik', baslik: 'Karşılıksız çeki olan müşterinin ' + riskliSiparisler.length + ' AÇIK SİPARİŞİ var',
          aciklama: riskliSiparisler.slice(0, 4).map(s => `${s.kod} (${s.musteriAdi || ''})`).join('; ') +
            '. Tahsilat riski yüksek — teminat veya peşin ödeme istenmeli.',
          otomatik: false, aksiyonTip: 'karsiliksiz_riskli_musteri' });
      }
    }
    // Faturası kesilmiş ama tahsil edilmemiş, vadesi geçmiş alacaklar
    const vadesiGecenFatura = (faturalar || []).filter(f => {
      const kalan = (f.odenecekBakiye != null ? f.odenecekBakiye : f.genelToplam) || 0;
      return kalan > 0 && f.vadeTarihi && f.vadeTarihi < bugun;
    });
    if (vadesiGecenFatura.length) {
      const t = vadesiGecenFatura.reduce((a, f) => a + ((f.odenecekBakiye != null ? f.odenecekBakiye : f.genelToplam) || 0), 0);
      ekle({ birim: 'finans', seviye: 'uyari', baslik: vadesiGecenFatura.length + ' faturanın VADESİ GEÇTİ (' + App.fmtTL(t) + ')',
        aciklama: 'Ödenmemiş ve vadesi dolmuş satış faturaları var — tahsilat takibi başlatılmalı.',
        otomatik: false, aksiyonTip: 'fatura_vadesi_gecti' });
    }

    // ══ ÇİZELGE / KAPASİTE ══
    // Sonlu kapasite çizelgesine göre gerçekten gecikecek siparişler ve
    // darboğaz hatlar önceden tespit edilir.
    try {
      const cz = await CizelgeMotor.tamCizelge({ haftaSonuCalis: false });
      if (cz.operasyonSayisi) {
        // Darboğaz hatlar
        const darbogaz = (cz.hatYuku || []).filter(h => h.doluluk >= 0.9);
        if (darbogaz.length) {
          ekle({ birim: 'planlama', seviye: 'kritik', baslik: darbogaz.length + ' hat DARBOĞAZ (kapasite sınırında)',
            aciklama: darbogaz.slice(0, 3).map(h => `${h.hat}: %${Math.round(h.doluluk * 100)} dolu`).join(', ') +
              '. Vardiya eklenmez veya fason verilmezse termin gecikmeleri kaçınılmaz.',
            otomatik: false, aksiyonTip: 'darbogaz_hat' });
        }
        // Çizelgeye göre gecikecek siparişler (henüz gecikmemiş ama gecikecek)
        const riskli = [];
        (veri.siparisler || []).filter(s => s.durum === 'onaylandi' &&
          s.uretimDurumu !== 'tamamlandi' && s.uretimTermini).forEach(s => {
          const ieIdler = (veri.isemirleri || []).filter(ie => (ie.kaynakSiparisIdler || []).includes(s.id)).map(ie => ie.id);
          const ilgili = cz.yerlesim.filter(o =>
            (o.kaynakTip === 'sip' && o.kaynakId === s.id) || (o.kaynakTip === 'ie' && ieIdler.includes(o.kaynakId)));
          if (!ilgili.length) return;
          const bitis = ilgili.reduce((en, o) => (!en || o.bitisTarihi > en) ? o.bitisTarihi : en, null);
          if (bitis && bitis > s.uretimTermini) {
            riskli.push({ kod: s.kod, musteri: s.musteriAdi || '', termin: s.uretimTermini, cizelge: bitis,
              gun: Math.round((new Date(bitis) - new Date(s.uretimTermini)) / 86400000) });
          }
        });
        if (riskli.length) {
          ekle({ birim: 'planlama', seviye: 'kritik', baslik: riskli.length + ' siparişin termini KAPASİTEYE GÖRE TUTMUYOR',
            aciklama: riskli.slice(0, 4).map(r => `${r.kod} (${r.musteri}): söz ${r.termin}, çizelge ${r.cizelge} → ${r.gun} gün gecikecek`).join('; ') +
              '. Üretim Çizelgesi → Termin Riski ekranından revize edilmeli.',
            otomatik: false, aksiyonTip: 'cizelge_termin_riski' });
        }
      }
    } catch (e) { /* çizelge hesaplanamadıysa bulgu üretme */ }

    // ══ KÂRLILIK & TESLİMAT (analitik motordan) ══
    try {
      const AN = await AnalitikMotor.tumAnaliz();
      // Zararına satılan siparişler
      const zararlilar = AN.karlilik.filter(r => r.kar < 0 && r.veriKalitesi === 2);
      if (zararlilar.length) {
        ekle({ birim: 'yonetim', seviye: 'kritik', baslik: zararlilar.length + ' sipariş ZARARINA satılmış',
          aciklama: zararlilar.slice(0, 4).map(r => `${r.kod} (${r.musteriAdi}): ${App.fmtTL(r.kar)} zarar, marj ${(r.marj * 100).toFixed(0)}%`).join('; ') +
            '. Fiyatlandırma veya maliyet yapısı gözden geçirilmeli.',
          otomatik: false, aksiyonTip: 'zararina_siparis' });
      }
      // 90+ gün riskli alacak
      if (AN.alacak.riskli > 0) {
        ekle({ birim: 'finans', seviye: 'kritik', baslik: '90+ gün gecikmiş alacak: ' + App.fmtTL(AN.alacak.riskli),
          aciklama: AN.alacak.satirlar.filter(s => s.gecikmeGun > 90).slice(0, 4)
            .map(s => `${s.musteriAdi}: ${App.fmtTL(s.bakiye)} (${s.gecikmeGun} gün)`).join('; ') +
            '. Hukuki takip veya yapılandırma değerlendirilmeli.',
          otomatik: false, aksiyonTip: 'riskli_alacak' });
      }
      // OTIF düşük
      if (AN.teslimat.otifOrani !== null && AN.teslimat.otifOrani < 0.85 && AN.teslimat.olculebilirSayi >= 3) {
        ekle({ birim: 'planlama', seviye: 'kritik', baslik: 'OTIF hedefin altında: %' + Math.round(AN.teslimat.otifOrani * 100),
          aciklama: `${AN.teslimat.olculebilirSayi} teslimatın sadece %${Math.round(AN.teslimat.otifOrani * 100)}'i zamanında ve eksiksiz. Sektör standardı %95. Ortalama termin sapması ${AN.teslimat.ortSapma !== null ? AN.teslimat.ortSapma.toFixed(1) : '—'} gün.`,
          otomatik: false, aksiyonTip: 'otif_dusuk' });
      }
      // Malzeme verimi düşük (mobilyada kritik)
      if (AN.malzeme.genelVerim !== null && AN.malzeme.genelVerim < 0.85) {
        ekle({ birim: 'uretim', seviye: 'kritik', baslik: 'MALZEME VERİMİ düşük: %' + Math.round(AN.malzeme.genelVerim * 100),
          aciklama: `Reçeteye göre ${App.fmtTL(AN.malzeme.toplamTeorikTutar)} malzeme yeterken ${App.fmtTL(AN.malzeme.toplamFiiliTutar)} tüketilmiş — ${App.fmtTL(AN.malzeme.kayipTutar)} kayıp. Panel mobilyada malzeme maliyetin %55-65'idir; kesim optimizasyonu ve fire kontrolü öncelikli.`,
          otomatik: false, aksiyonTip: 'malzeme_verimi' });
      }
      // Ölü stok
      if (AN.stok.toplamDeger > 0 && AN.stok.oluStokDeger / AN.stok.toplamDeger > 0.1) {
        ekle({ birim: 'depo', seviye: 'uyari', baslik: 'ÖLÜ STOK payı yüksek: %' + Math.round(AN.stok.oluStokDeger / AN.stok.toplamDeger * 100),
          aciklama: `${AN.stok.oluStokAdet} kalem 180+ gündür hareketsiz (${App.fmtTL(AN.stok.oluStokDeger)}). Sermaye bağlı — elden çıkarma veya üretimde kullanma değerlendirilmeli.`,
          otomatik: false, aksiyonTip: 'olu_stok' });
      }
      // Nakit döngüsü uzun
      if (AN.mali.ccc > 90) {
        ekle({ birim: 'finans', seviye: 'uyari', baslik: 'Nakit döngüsü uzun: ' + AN.mali.ccc + ' gün',
          aciklama: `Tahsilat ${AN.mali.dso} gün + stokta bekleme ${AN.mali.stokDevirGun} gün − tedarikçi ödemesi ${AN.mali.dpo} gün. Bu süre boyunca işletme sermayesi bağlı kalıyor.`,
          otomatik: false, aksiyonTip: 'nakit_dongusu' });
      }
      // Teklif dönüşümü düşük
      if (AN.huni.donusumOrani !== null && AN.huni.donusumOrani < 0.15 && AN.huni.toplam >= 5) {
        ekle({ birim: 'satis', seviye: 'uyari', baslik: 'Teklif dönüşüm oranı düşük: %' + Math.round(AN.huni.donusumOrani * 100),
          aciklama: `${AN.huni.toplam} teklifin sadece ${AN.huni.siparise} tanesi siparişe döndü. Fiyatlandırma, teslim süresi veya takip süreci gözden geçirilmeli.`,
          otomatik: false, aksiyonTip: 'dusuk_donusum' });
      }
    } catch (e) { /* analitik hesaplanamadıysa bulgu üretme */ }

    // ══ MRP — MALZEME YOKLUĞU RİSKİ ══
    try {
      const mrp = await MrpMotor.tamMrp({ ufukHafta: 8 });
      const aciller = mrp.satirlar.filter(s => s.acilVar);
      if (aciller.length) {
        const enKotu = aciller.map(s => {
          const ilk = s.onerilenSiparisler.find(x => x.acilMi);
          return { kod: s.kod, ad: s.ad, gun: ilk ? ilk.gecikmeGun : 0, miktar: s.toplamOnerilen, birim: s.birim };
        }).sort((a, b) => b.gun - a.gun);
        ekle({ birim: 'satinalma', seviye: 'kritik',
          baslik: aciller.length + ' malzemede SİPARİŞ TARİHİ GEÇTİ — üretim durabilir',
          aciklama: enKotu.slice(0, 4).map(x => `${x.kod}: ${App.fmt(x.miktar, 1)} ${x.birim} (${x.gun} gün gecikme)`).join('; ') +
            '. Tedarik süresi dikkate alındığında bu malzemeler ihtiyaç tarihinde yetişmeyecek. MRP ekranından acilen talep açılmalı.',
          otomatik: false, aksiyonTip: 'mrp_acil_malzeme' });
      }
      // Planlanmış ama talebe dönüşmemiş ihtiyaçlar
      const planlanan = mrp.satirlar.filter(s => s.toplamOnerilen > 0 && !s.acilVar);
      if (planlanan.length >= 5) {
        ekle({ birim: 'satinalma', seviye: 'uyari',
          baslik: planlanan.length + ' malzeme için satın alma planlanmalı',
          aciklama: `Önümüzdeki 8 haftada ${App.fmtTL(mrp.ozet.toplamMaliyet)} tutarında malzeme ihtiyacı öngörülüyor. MRP ekranından toplu talep açılabilir.`,
          otomatik: false, aksiyonTip: 'mrp_planlama' });
      }
      // Termini olmayan siparişler MRP doğruluğunu bozar
      if (mrp.ozet.terminsizKalem >= 3) {
        ekle({ birim: 'planlama', seviye: 'uyari',
          baslik: mrp.ozet.terminsizKalem + ' sipariş kaleminde ÜRETİM TERMİNİ yok',
          aciklama: 'MRP bu kalemler için 2 hafta varsayıyor — malzeme planı gerçekçi olmuyor. Üretim Çizelgesi\'nden kapasiteye göre termin verilebilir.',
          otomatik: false, aksiyonTip: 'mrp_terminsiz' });
      }
    } catch (e) { /* MRP hesaplanamadıysa bulgu üretme */ }

    // ══ İSG (YASAL UYUM) ══
    try {
      const [kazalar, riskler, kkd, egitimler, saglik] = await Promise.all([
        Store.isgKazalar.all(), Store.isgRiskler.all(), Store.isgKkdZimmet.all(),
        Store.isgEgitimler.all(), Store.isgSaglikMuayene.all()]);

      // Risk değerlendirmesi hiç yapılmamış — yasal zorunluluk
      if (!riskler.length) {
        ekle({ birim: 'isg', seviye: 'kritik', baslik: 'RİSK DEĞERLENDİRMESİ yapılmamış',
          aciklama: '6331 sayılı kanun gereği her işyeri risk değerlendirmesi yapmak ve güncel tutmak ZORUNLUDUR. Denetimde ilk istenen belgedir; yokluğu idari para cezası doğurur.',
          otomatik: false, aksiyonTip: 'isg_risk_yok' });
      } else {
        const yuksek = riskler.filter(r => (r.skor || 0) >= 9 && r.durum !== 'kapandi');
        if (yuksek.length) {
          ekle({ birim: 'isg', seviye: 'kritik', baslik: yuksek.length + ' YÜKSEK RİSK açık durumda',
            aciklama: yuksek.slice(0, 3).map(r => `${r.bolum}: ${(r.tehlike || '').slice(0, 45)} (skor ${r.skor})`).join('; ') +
              '. Yüksek riskler için acil önlem alınmalı.',
            otomatik: false, aksiyonTip: 'isg_yuksek_risk' });
        }
        const gecikmisOnlem = riskler.filter(r => r.termin && r.termin < bugun && r.durum !== 'kapandi');
        if (gecikmisOnlem.length) {
          ekle({ birim: 'isg', seviye: 'uyari', baslik: gecikmisOnlem.length + ' risk önleminin TERMİNİ GEÇTİ',
            aciklama: 'Planlanan İSG önlemleri zamanında uygulanmamış.',
            otomatik: false, aksiyonTip: 'isg_onlem_gecikti' });
        }
      }

      // KKD yenileme
      const kkdGecen = kkd.filter(k => k.yenilemeTarihi && k.yenilemeTarihi <= bugun);
      if (kkdGecen.length) {
        ekle({ birim: 'isg', seviye: 'kritik', baslik: kkdGecen.length + ' KKD yenileme süresi GEÇTİ',
          aciklama: kkdGecen.slice(0, 4).map(k => `${k.personelAdi} — ${k.kkdTuru}`).join('; ') +
            '. Ömrünü doldurmuş koruyucu donanım koruma sağlamaz ve işveren sorumluluğu doğurur.',
          otomatik: false, aksiyonTip: 'isg_kkd_gecikti' });
      }

      // Eğitim geçerliliği
      const egitimGecen = egitimler.filter(e => e.gecerlilikTarihi && e.gecerlilikTarihi <= bugun);
      if (egitimGecen.length) {
        ekle({ birim: 'isg', seviye: 'kritik', baslik: egitimGecen.length + ' İSG eğitiminin süresi DOLDU',
          aciklama: 'Tazeleme eğitimi verilmeden çalıştırma, kaza durumunda işveren kusurunu ağırlaştırır.',
          otomatik: false, aksiyonTip: 'isg_egitim_gecikti' });
      }

      // Sağlık muayenesi
      const saglikGecen = saglik.filter(s => s.sonrakiMuayene && s.sonrakiMuayene <= bugun);
      if (saglikGecen.length) {
        ekle({ birim: 'isg', seviye: 'kritik', baslik: saglikGecen.length + ' personelin SAĞLIK MUAYENESİ gecikmiş',
          aciklama: 'Periyodik sağlık muayenesi yasal zorunluluktur.',
          otomatik: false, aksiyonTip: 'isg_saglik_gecikti' });
      }

      // Kaza sonrası kök neden yapılmamış
      const kokNedensiz = kazalar.filter(k => k.tip !== 'ramak_kala' && !k.kokNeden && k.durum !== 'kapandi');
      if (kokNedensiz.length) {
        ekle({ birim: 'isg', seviye: 'uyari', baslik: kokNedensiz.length + ' kazada KÖK NEDEN analizi yapılmamış',
          aciklama: 'Kök nedeni bulunmayan kaza tekrar eder. 5 Neden yöntemiyle analiz edilmeli ve önlem tanımlanmalı.',
          otomatik: false, aksiyonTip: 'isg_koknedeni_yok' });
      }

      // SGK bildirimi yapılmamış iş kazası
      const sgksiz = kazalar.filter(k => (k.tip === 'is_gunu_kaybi' || k.tip === 'agir' || k.tip === 'olumlu') && k.sgkBildirim !== 'evet');
      if (sgksiz.length) {
        ekle({ birim: 'isg', seviye: 'kritik', baslik: sgksiz.length + ' iş kazası SGK\'ya BİLDİRİLMEMİŞ',
          aciklama: 'İş kazaları 3 iş günü içinde SGK\'ya bildirilmek zorundadır. Bildirilmemesi idari para cezası doğurur.',
          otomatik: false, aksiyonTip: 'isg_sgk_bildirim' });
      }
    } catch (e) { /* İSG verisi okunamadıysa bulgu üretme */ }

    // ══ İK ══
    if (kpi.personel.kisiSayisi > 1) {
      const liste = kpi.personel.liste.filter(p => p.birimDk > 0);
      if (liste.length > 1) {
        const ort = liste.reduce((a, p) => a + p.birimDk, 0) / liste.length;
        const yavaslar = liste.filter(p => p.birimDk > ort * 1.8);
        if (yavaslar.length) {
          ekle({ birim: 'ik', seviye: 'bilgi', baslik: yavaslar.length + ' personelde birim süre ortalamanın çok üzerinde',
            aciklama: yavaslar.slice(0, 3).map(p => `${p.kisi}: ${p.birimDk} dk/adet (ort. ${ort.toFixed(1)})`).join('; ') +
              '. Eğitim veya iş yükü dengelemesi değerlendirilebilir.',
            otomatik: false, aksiyonTip: 'personel_performans' });
        }
      }
    }

    // ══ HAT → REÇETE TALEPLERİ (kayıp-kaçak / reçete tamamlama) ══
    // Operatörün sahadan gönderdiği eksik malzeme ve kart açma taleplerini
    // ilgili birime yönlendirir. Bekleyen onaylar + operatör örüntüsü.
    try {
      const receteTalepleri = await Store.receteTalepleri.all();
      if (receteTalepleri && receteTalepleri.length) {
        const planlamaBekleyen = receteTalepleri.filter(t => t.durum === 'planlama_bekliyor');
        const argeTeknikBekleyen = receteTalepleri.filter(t => t.durum === 'arge_teknik_bekliyor');
        const kartTalepleri = receteTalepleri.filter(t => t.tip === 'kart_talebi' && t.durum !== 'reddedildi' && t.durum !== 'receteye_islendi');

        if (planlamaBekleyen.length) {
          ekle({
            birim: 'uretim_planlama', seviye: planlamaBekleyen.length >= 5 ? 'kritik' : 'uyari',
            baslik: planlamaBekleyen.length + ' hat talebi PLANLAMA onayı bekliyor',
            aciklama: `Operatörlerin sahadan gönderdiği ${planlamaBekleyen.length} reçete/malzeme talebi planlama onayında bekliyor. ` +
              `İşlenmezse: kullanılan malzeme reçetede görünmez, maliyet ve stok tutmaz. → Üretim Planlama değerlendirmeli.`,
            otomatik: false, aksiyonTip: 'recete_talep_planlama'
          });
        }
        if (argeTeknikBekleyen.length) {
          ekle({
            birim: 'teknik_ofis', seviye: argeTeknikBekleyen.length >= 5 ? 'kritik' : 'uyari',
            baslik: argeTeknikBekleyen.length + ' hat talebi ARGE/TEKNİK onayı bekliyor',
            aciklama: `Planlamanın onayladığı ${argeTeknikBekleyen.length} talep, reçeteye işlenmek için ARGE/Teknik Ofis onayı bekliyor. ` +
              `"Alt kalem ekle" ile reçeteye kalıcı işlenmeli. → ARGE + Teknik Ofis.`,
            otomatik: false, aksiyonTip: 'recete_talep_arge'
          });
        }
        if (kartTalepleri.length) {
          ekle({
            birim: 'teknik_ofis', seviye: 'uyari',
            baslik: kartTalepleri.length + ' yeni MALZEME KARTI açma talebi bekliyor',
            aciklama: `Operatörler, sistemde kartı olmayan ${kartTalepleri.length} malzeme için kart açma talep etti. ` +
              `Kart açılıp talebe bağlanmadan reçeteye işlenemez. → Teknik Ofis/Satınalma kart açmalı.`,
            otomatik: false, aksiyonTip: 'recete_kart_talebi'
          });
        }

        // Miktar düzeltmeleri: reçete teorik miktarı sahayla uyuşmuyorsa reçete hatalıdır.
        const miktarDuzeltmeleri = receteTalepleri.filter(t => t.tip === 'miktar_duzeltme');
        if (miktarDuzeltmeleri.length >= 3) {
          // Aynı yarı mamulde tekrar eden düzeltme = reçete gerçekten yanlış
          const ymSayac = {};
          miktarDuzeltmeleri.forEach(t => { ymSayac[t.ymKod || t.ymId] = (ymSayac[t.ymKod || t.ymId] || 0) + 1; });
          const sorunlular = Object.entries(ymSayac).filter(([, adet]) => adet >= 2).map(([k]) => k);
          if (sorunlular.length) {
            ekle({
              birim: 'teknik_ofis', seviye: 'uyari',
              baslik: sorunlular.length + ' yarı mamulde tekrar eden miktar düzeltmesi',
              aciklama: `Şu parçalarda saha, reçetedekinden farklı miktar bildirdi: ${sorunlular.slice(0, 5).join(', ')}. ` +
                `Tekrar eden düzeltme, reçetenin teorik miktarının gerçeği yansıtmadığını gösterir — maliyet ve MRP hesapları da yanlış çıkar. ` +
                `→ Teknik Ofis bu reçeteleri gözden geçirmeli.`,
              otomatik: false, aksiyonTip: 'recete_miktar_sapmasi'
            });
          }
        }

        // Operatör örüntüsü: bir operatör sürekli reçete dışı malzeme ekliyorsa
        // ya eğitim eksik ya reçete hatalı — sinyal.
        const islenmisVeBekleyen = receteTalepleri.filter(t => t.tip === 'eksik_malzeme');
        const opSayac = {};
        islenmisVeBekleyen.forEach(t => { opSayac[t.operator] = (opSayac[t.operator] || 0) + 1; });
        Object.entries(opSayac).forEach(([op, adet]) => {
          if (adet >= 5) {
            ekle({
              birim: 'teknik_ofis', seviye: 'uyari',
              baslik: `"${op}" ${adet} kez reçete dışı malzeme ekledi`,
              aciklama: `Bir operatör/rol sürekli reçete dışı malzeme talep ediyorsa iki olasılık var: ` +
                `(1) ilgili yarı mamulün reçetesi eksik/hatalı — güncellenmeli, (2) operatör yanlış malzeme kullanıyor — eğitim gerekli. ` +
                `→ Teknik Ofis reçeteleri gözden geçirmeli.`,
              otomatik: false, aksiyonTip: 'operator_recete_orolu'
            });
          }
        });
      }
    } catch (e) { /* receteTalepleri yoksa sessizce geç */ }

    return { bulgular, kpi };
  }

  // ── OTOMATİK DÜZELTME (REVİZYON) ────────────────────────────────────────
  // Yalnızca otomatik:true bulgular uygulanır. Uygulanan her düzeltme rapora
  // yazılır (ne yaptı, kaç kayıt, hangi birim).
  async function duzelt(bulgu) {
    const now = new Date();
    const rapor = {
      id: App.uid('AIR'), bulguId: bulgu.id, birim: bulgu.birim, baslik: bulgu.baslik,
      aksiyonTip: bulgu.aksiyonTip, tarih: now.toISOString().slice(0, 10),
      zaman: now.toISOString(), kullanici: (App.state && App.state.kullanici) || 'AI',
      degisiklikler: [], etkilenenKayit: 0, sonuc: ''
    };

    if (bulgu.aksiyonTip === 'kalite_kaydi_olustur') {
      const [siparisler, kaliteKayitlari] = await Promise.all([Store.siparisler.all(), Store.urunKaliteOnaylari.all()]);
      let n = 0;
      (bulgu.veri.siparisIdler || []).forEach(sid => {
        const s = siparisler.find(x => x.id === sid);
        if (!s || kaliteKayitlari.some(u => u.siparisId === sid)) return;
        (s.kalemler || []).forEach(kalem => {
          if (kalem.grup === 'hammadde' || kalem.ikinciKalite) return;
          kaliteKayitlari.push({
            id: App.uid('UKO'), siparisId: s.id, siparisKod: s.kod, urunId: null,
            urunKod: kalem.kod, urunAd: kalem.ad || '', kalemGrup: kalem.grup || 'urun',
            miktar: kalem.miktar || 1, durum: 'bekliyor', tarih: rapor.tarih
          });
          n++;
          rapor.degisiklikler.push(`Kalite kaydı açıldı: ${s.kod} → ${kalem.kod} (${kalem.miktar || 1} adet)`);
        });
      });
      await App.persist(() => Store.urunKaliteOnaylari.save(kaliteKayitlari));
      rapor.etkilenenKayit = n;
      rapor.sonuc = `${n} eksik kalite kaydı oluşturuldu — siparişler artık Kalite Kontrol ekranında görünüyor.`;
    }

    else if (bulgu.aksiyonTip === 'satinalma_talebi_ac') {
      const talepler = await Store.talepler.all();
      let n = 0;
      (bulgu.veri.kalemler || []).forEach(k => {
        if (talepler.some(t => t.hammaddeId === k.hammaddeId && t.durum === 'beklemede')) return;
        talepler.push({
          id: App.uid('TLP'), hammaddeId: k.hammaddeId, hammaddeKod: k.kod, hammaddeAd: k.ad,
          miktar: k.oneri, birim: k.birim, durum: 'beklemede',
          talepEden: 'AI Denetçisi (otomatik)', tarih: rapor.tarih,
          aciklama: `Kritik stok altına düştü (mevcut ${k.stok}, kritik ${k.kritik}). AI tarafından otomatik açıldı.`
        });
        n++;
        rapor.degisiklikler.push(`Satın alma talebi: ${k.kod} — ${k.oneri} ${k.birim} (stok ${k.stok}/${k.kritik})`);
      });
      await App.persist(() => Store.talepler.save(talepler));
      rapor.etkilenenKayit = n;
      rapor.sonuc = `${n} kritik hammadde için satın alma talebi açıldı — Satın Alma panelinde işlenmeyi bekliyor.`;
    }

    else {
      rapor.sonuc = 'Bu bulgu otomatik düzeltilemez — yönetim kararı gerektirir.';
      return { rapor, uygulandi: false };
    }

    const raporlar = await Store.aiRaporlari.all();
    raporlar.push(rapor);
    await App.persist(() => Store.aiRaporlari.save(raporlar));
    return { rapor, uygulandi: true };
  }

  // Tüm otomatik düzeltilebilir bulguları uygular
  async function hepsiniDuzelt(bulgular) {
    const uygulananlar = [];
    for (const b of bulgular.filter(x => x.otomatik)) {
      const r = await duzelt(b);
      if (r.uygulandi) uygulananlar.push(r.rapor);
    }
    return uygulananlar;
  }

  return { tara, duzelt, hepsiniDuzelt, BIRIM_ETIKET, SEVIYE };
})();
