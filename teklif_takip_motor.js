// ════════════════════════════════════════════════════════════════════════════
// TEKLİF DEĞERLENDİRME MOTORU
// ────────────────────────────────────────────────────────────────────────────
// "Teklif verdik ama ne oldu?" sorusunu cevaplar. Satışta en pahalı kayıp,
// teklifin unutulmasıdır: müşteri beklerken kimse aramaz, rakip araya girer.
//
// TAKİP EDİLENLER:
//   • Kaç teklif verildi, kaçı bekliyor, kaçı kazanıldı/kaybedildi
//   • Kaç kez revize edildi (çok revizyon = kapsam belirsizliği sinyali)
//   • Kaç gündür bekliyor (yaşlandırma analizi)
//   • İrtibat kişisi ve teklif sorumlusu — sahipsiz teklif takip edilmez
//   • Kaybedildiyse NEDEN, bekliyorsa NEDEN bekliyor
// ════════════════════════════════════════════════════════════════════════════
const TeklifTakipMotor = (() => {

  const DURUMLAR = [
    { id: 'taslak', ad: 'Taslak', renk: '#9e9e9e', acik: false },
    { id: 'gonderildi', ad: 'Gönderildi', renk: '#1976d2', acik: true },
    { id: 'beklemede', ad: 'Müşteride Bekliyor', renk: '#f57c00', acik: true },
    { id: 'revize', ad: 'Revize İsteniyor', renk: '#7b1fa2', acik: true },
    { id: 'kazanildi', ad: 'Kazanıldı', renk: '#2e7d32', acik: false },
    { id: 'kaybedildi', ad: 'Kaybedildi', renk: '#c62828', acik: false },
    { id: 'iptal', ad: 'İptal / Vazgeçildi', renk: '#616161', acik: false },
    // BULGU (T54): bu 3 durum page_teklif.js akışından OTOMATİK yazılır
    // (Siparişe Dönüştür / İptal Onayı / Silme Talebi) ama DURUMLAR
    // listesinde HİÇ YOKTU. Sonuç: durumBul() bunları tanımayıp sessizce
    // DURUMLAR[0] ('taslak')'a düşürüyordu — hem YANLIŞ pill gösteriliyordu
    // (siparişe dönüşmüş bir teklif "Taslak" görünüyordu) hem de Teklif
    // Değerlendirme'nin durum <select>'i hiçbir seçenek 'selected'
    // bulamadığından tarayıcı görsel olarak İLK seçeneği (taslak) seçili
    // gösteriyordu — kullanıcı farkında olmadan "Kaydet"e basarsa GERÇEKTEN
    // siparişe dönüşmüş/silme talebindeki bir teklif veritabanında sessizce
    // 'taslak'a GERİ DÖNÜYORDU (mükerrer sipariş ve silme-onay-atlatma riski).
    { id: 'siparise_donustu', ad: 'Siparişe Dönüştü', renk: '#2e7d32', acik: false },
    { id: 'siparis_reddedildi', ad: 'Siparişi Reddedildi', renk: '#c62828', acik: false },
    { id: 'silme_talebinde', ad: 'Silme Talebinde', renk: '#f57c00', acik: false }
  ];

  // Kayıp sebepleri — serbest metin yerine sabit liste: ancak böyle SAYILABİLİR.
  // "fiyat yüksek" 20 farklı cümleyle yazılırsa analiz yapılamaz.
  const KAYIP_SEBEPLERI = [
    'Fiyat yüksek', 'Termin uygun değil', 'Rakip tercih edildi',
    'Müşteri vazgeçti', 'Teknik şartname karşılanmadı', 'Bütçe iptal',
    'Geç dönüş yapıldı', 'Diğer'
  ];

  const BEKLEME_SEBEPLERI = [
    'Müşteri karar aşamasında', 'Bütçe onayı bekleniyor', 'Teknik değerlendirme',
    'Rakip teklifler karşılaştırılıyor', 'Proje ertelendi', 'İrtibat kurulamıyor', 'Diğer'
  ];

  const durumBul = (id) => DURUMLAR.find(d => d.id === id) || DURUMLAR[0];
  const acikMi = (t) => durumBul(t.durum).acik;
  // Siparişe dönüşmüş bir teklif fiilen KAZANILMIŞTIR — istatistiklerde
  // (kazanma oranı, sorumlu performansı) 'kazanildi' ile birlikte sayılır.
  const kazandiMi = (t) => t.durum === 'kazanildi' || t.durum === 'siparise_donustu';

  const gunFarki = (tarih) => {
    if (!tarih) return null;
    const t = new Date(tarih).getTime();
    if (!isFinite(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
  };

  // ── BEKLEME SÜRESİ ───────────────────────────────────────────────────────
  // Gönderim tarihinden bu yana geçen gün. Kapanmış tekliflerde kapanışa kadar.
  function bekleyenGun(teklif) {
    if (!teklif.gonderimTarihi) return null;
    if (!acikMi(teklif) && teklif.kapanisTarihi) {
      const g = new Date(teklif.gonderimTarihi).getTime();
      const k = new Date(teklif.kapanisTarihi).getTime();
      if (isFinite(g) && isFinite(k)) return Math.max(0, Math.floor((k - g) / 86400000));
    }
    return gunFarki(teklif.gonderimTarihi);
  }

  // ── ÖZET İSTATİSTİK ──────────────────────────────────────────────────────
  function ozet(teklifler) {
    const l = teklifler || [];
    const acik = l.filter(acikMi);
    const kazanan = l.filter(kazandiMi);
    const kaybeden = l.filter(t => t.durum === 'kaybedildi');
    const kapanan = kazanan.length + kaybeden.length;
    const bekleyenler = acik.map(bekleyenGun).filter(g => g != null);
    return {
      toplam: l.length,
      acik: acik.length,
      kazanan: kazanan.length,
      kaybeden: kaybeden.length,
      kazanmaOrani: kapanan ? (kazanan.length / kapanan * 100) : null,
      guvenilir: kapanan >= 10,
      acikTutar: acik.reduce((a, t) => a + (+t.tutar || 0), 0),
      kazanilanTutar: kazanan.reduce((a, t) => a + (+t.tutar || 0), 0),
      kaybedilenTutar: kaybeden.reduce((a, t) => a + (+t.tutar || 0), 0),
      ortBekleme: bekleyenler.length
        ? Math.round(bekleyenler.reduce((a, b) => a + b, 0) / bekleyenler.length) : null,
      toplamRevizyon: l.reduce((a, t) => a + ((t.revizyonlar || []).length), 0),
      sorumlusuz: l.filter(t => !t.sorumlu || !String(t.sorumlu).trim()).length
    };
  }

  // ── YAŞLANDIRMA ──────────────────────────────────────────────────────────
  // Bekleyen teklifleri süre kovalarına ayırır. 30 günü geçen teklif pratikte
  // kaybedilmiştir; kovalar bunu görünür kılar.
  function yaslandirma(teklifler) {
    const kova = [
      { ad: '0-7 gün', min: 0, max: 7, adet: 0, tutar: 0 },
      { ad: '8-15 gün', min: 8, max: 15, adet: 0, tutar: 0 },
      { ad: '16-30 gün', min: 16, max: 30, adet: 0, tutar: 0 },
      { ad: '31-60 gün', min: 31, max: 60, adet: 0, tutar: 0 },
      { ad: '60+ gün', min: 61, max: Infinity, adet: 0, tutar: 0 }
    ];
    (teklifler || []).filter(acikMi).forEach(t => {
      const g = bekleyenGun(t);
      if (g == null) return;
      const k = kova.find(x => g >= x.min && g <= x.max);
      if (k) { k.adet++; k.tutar += (+t.tutar || 0); }
    });
    return kova;
  }

  // ── KAYIP ANALİZİ ────────────────────────────────────────────────────────
  function kayipAnalizi(teklifler) {
    const kaybeden = (teklifler || []).filter(t => t.durum === 'kaybedildi');
    const say = new Map();
    kaybeden.forEach(t => {
      const s = t.kayipSebebi || 'Belirtilmemiş';
      const k = say.get(s) || { sebep: s, adet: 0, tutar: 0 };
      k.adet++; k.tutar += (+t.tutar || 0);
      say.set(s, k);
    });
    return [...say.values()].sort((a, b) => b.adet - a.adet);
  }

  // Bekleme sebeplerinin dağılımı — hangi darboğaz en çok teklifi tutuyor
  function beklemeAnalizi(teklifler) {
    const say = new Map();
    (teklifler || []).filter(acikMi).forEach(t => {
      const s = t.beklemeSebebi || 'Belirtilmemiş';
      const k = say.get(s) || { sebep: s, adet: 0, tutar: 0 };
      k.adet++; k.tutar += (+t.tutar || 0);
      say.set(s, k);
    });
    return [...say.values()].sort((a, b) => b.adet - a.adet);
  }

  // ── SORUMLU BAZLI PERFORMANS ─────────────────────────────────────────────
  function sorumluPerformansi(teklifler) {
    const m = new Map();
    (teklifler || []).forEach(t => {
      const s = (t.sorumlu || '—').trim() || '—';
      const k = m.get(s) || { sorumlu: s, toplam: 0, acik: 0, kazanan: 0, kaybeden: 0, tutar: 0, revizyon: 0 };
      k.toplam++;
      if (acikMi(t)) k.acik++;
      if (kazandiMi(t)) { k.kazanan++; k.tutar += (+t.tutar || 0); }
      if (t.durum === 'kaybedildi') k.kaybeden++;
      k.revizyon += (t.revizyonlar || []).length;
      m.set(s, k);
    });
    return [...m.values()].map(k => ({
      ...k,
      oran: (k.kazanan + k.kaybeden) ? (k.kazanan / (k.kazanan + k.kaybeden) * 100) : null
    })).sort((a, b) => b.toplam - a.toplam);
  }

  // ── TAKİP UYARILARI ──────────────────────────────────────────────────────
  // Aksiyon gerektiren teklifler: uzun süre bekleyen, sebebi yazılmamış,
  // sorumlusu olmayan, çok revize edilen.
  function uyarilar(teklifler, gunEsigi) {
    const esik = gunEsigi || 14;
    const l = [];
    (teklifler || []).forEach(t => {
      const g = bekleyenGun(t);
      if (acikMi(t) && g != null && g >= esik) {
        l.push({ tip: 'gecikme', teklif: t, mesaj: `${g} gündür bekliyor`, oncelik: g });
      }
      if (acikMi(t) && !t.beklemeSebebi) {
        l.push({ tip: 'sebepsiz', teklif: t, mesaj: 'Bekleme sebebi girilmemiş', oncelik: 20 });
      }
      if (!t.sorumlu || !String(t.sorumlu).trim()) {
        l.push({ tip: 'sorumsuz', teklif: t, mesaj: 'Teklif sorumlusu atanmamış', oncelik: 100 });
      }
      if ((t.revizyonlar || []).length >= 3) {
        l.push({
          tip: 'cok_revizyon', teklif: t,
          mesaj: `${t.revizyonlar.length} kez revize edildi — kapsam belirsiz olabilir`, oncelik: 40
        });
      }
      if (t.durum === 'kaybedildi' && !t.kayipSebebi) {
        l.push({ tip: 'kayip_sebepsiz', teklif: t, mesaj: 'Kayıp sebebi girilmemiş', oncelik: 30 });
      }
    });
    return l.sort((a, b) => b.oncelik - a.oncelik);
  }

  // ── DURUM DEĞİŞTİRME ─────────────────────────────────────────────────────
  // Kapanış sebepleri ZORUNLU: sebepsiz kapatılan teklif, analiz için kayıptır.
  function durumDegistirGecerli(teklif, yeniDurum, ek) {
    if (!DURUMLAR.some(d => d.id === yeniDurum)) return { ok: false, hata: 'Geçersiz durum.' };
    if (teklif.durum === yeniDurum) return { ok: false, hata: 'Teklif zaten bu durumda.' };
    // BULGU (T54): siparise_donustu/siparis_reddedildi/silme_talebinde
    // yalnızca ilgili gerçek işlem akışından (page_teklif.js'in Siparişe
    // Dönüştür/Silme Talebi, app.js'in sipariş reddi) sistem tarafından
    // yazılır — buradan manuel seçilirse arkasında GERÇEK bir sipariş/talep
    // olmadan sahte bir "kazanıldı/silindi" durumu üretilebilir.
    if (['siparise_donustu', 'siparis_reddedildi', 'silme_talebinde'].includes(yeniDurum)) {
      return { ok: false, hata: 'Bu durum yalnızca ilgili işlem akışından (sipariş/silme talebi) otomatik ayarlanır, buradan manuel seçilemez.' };
    }
    if (yeniDurum === 'kaybedildi' && !(ek && ek.kayipSebebi)) {
      return { ok: false, hata: 'Kayıp sebebi zorunlu — bu bilgi olmadan kayıp analizi yapılamaz.' };
    }
    if (yeniDurum === 'beklemede' && !(ek && ek.beklemeSebebi)) {
      return { ok: false, hata: 'Bekleme sebebi zorunlu — neyin beklendiği bilinmeli.' };
    }
    if (yeniDurum === 'gonderildi' && !(teklif.sorumlu || (ek && ek.sorumlu))) {
      return { ok: false, hata: 'Teklif sorumlusu atanmadan gönderilemez.' };
    }
    return { ok: true };
  }

  return {
    DURUMLAR, KAYIP_SEBEPLERI, BEKLEME_SEBEPLERI,
    durumBul, acikMi, kazandiMi, bekleyenGun, gunFarki,
    ozet, yaslandirma, kayipAnalizi, beklemeAnalizi,
    sorumluPerformansi, uyarilar, durumDegistirGecerli
  };
})();

if (typeof module !== 'undefined') module.exports = TeklifTakipMotor;
