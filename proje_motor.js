// ════════════════════════════════════════════════════════════════════════════
// PROJE YÖNETİMİ MOTORU — Aşama, Hakediş, Revizyon
// ────────────────────────────────────────────────────────────────────────────
// Proje işi (otel, toplu konut, mağaza zinciri) standart siparişten YAPISAL
// olarak farklıdır:
//   • Uzun vadeli ve aşamalıdır (keşif→sözleşme→üretim→montaj→kabul)
//   • Ödeme peşin/vadeli değil, HAKEDİŞE bağlıdır (iş ilerledikçe fatura)
//   • Revizyon olağandır ve fiyat farkı doğurur
//   • Kârlılık sipariş bazında değil, PROJE bazında ölçülür
//
// Bu modül CRM fırsatına ve mevcut sipariş akışına bağlanır: fırsat kazanılınca
// proje açılır, proje aşamaları sipariş/iş emri doğurur.
// ════════════════════════════════════════════════════════════════════════════
const ProjeMotor = (() => {

  const ASAMALAR = [
    { id: 'kesif', ad: 'Keşif / Ölçü', varsayilanOran: 0 },
    { id: 'tasarim', ad: 'Tasarım & Onay', varsayilanOran: 10 },
    { id: 'sozlesme', ad: 'Sözleşme', varsayilanOran: 30 },
    { id: 'uretim', ad: 'Üretim', varsayilanOran: 40 },
    { id: 'sevkiyat', ad: 'Sevkiyat', varsayilanOran: 10 },
    { id: 'montaj', ad: 'Montaj', varsayilanOran: 5 },
    { id: 'kabul', ad: 'Geçici/Kesin Kabul', varsayilanOran: 5 }
  ];

  const DURUMLAR = {
    planlaniyor: 'Planlanıyor', devam: 'Devam Ediyor',
    beklemede: 'Beklemede', tamamlandi: 'Tamamlandı', iptal: 'İptal'
  };

  const HAKEDIS_DURUM = {
    hazirlaniyor: 'Hazırlanıyor', onayda: 'Onay Bekliyor',
    onaylandi: 'Onaylandı', faturalandi: 'Faturalandı', tahsil: 'Tahsil Edildi'
  };

  // ── İLERLEME HESABI ──────────────────────────────────────────────────────
  // Fiziksel ilerleme = tamamlanan aşamaların ağırlıklı toplamı.
  // Ağırlık, sözleşme bedelindeki payıdır — bu yüzden ilerleme yüzdesi aynı
  // zamanda hakedişe esas orandır.
  function ilerlemeHesapla(proje) {
    const asamalar = (proje && proje.asamalar) || [];
    const toplamAgirlik = asamalar.reduce((a, x) => a + (+x.agirlik || 0), 0);
    if (!toplamAgirlik) return { yuzde: 0, tamamlanan: 0, toplam: asamalar.length };
    const kazanilan = asamalar.reduce((a, x) =>
      a + (+x.agirlik || 0) * ((+x.tamamlanmaYuzdesi || 0) / 100), 0);
    return {
      yuzde: Math.round(kazanilan / toplamAgirlik * 1000) / 10,
      tamamlanan: asamalar.filter(x => (+x.tamamlanmaYuzdesi || 0) >= 100).length,
      toplam: asamalar.length
    };
  }

  // ── HAKEDİŞ HESABI ───────────────────────────────────────────────────────
  // Bu hakedişte fatura edilecek tutar = (güncel ilerleme − önceki hakedişler)
  // × sözleşme bedeli. Böylece mükerrer fatura kesilmez.
  function hakedisHesapla(proje, yeniIlerlemeYuzde) {
    const bedel = (+proje.sozlesmeBedeli || 0) + (+proje.revizyonFarki || 0);
    const oncekiToplam = (proje.hakedisler || [])
      .filter(h => h.durum !== 'iptal')
      .reduce((a, h) => a + (+h.tutar || 0), 0);
    const hedefTutar = bedel * (yeniIlerlemeYuzde / 100);
    const buHakedis = hedefTutar - oncekiToplam;
    return {
      bedel, oncekiToplam,
      kumulatifOran: bedel ? (hedefTutar / bedel * 100) : 0,
      tutar: Math.round(buHakedis * 100) / 100,
      gecerli: buHakedis > 0
    };
  }

  // ── PROJE KÂRLILIĞI ──────────────────────────────────────────────────────
  // Gerçek maliyet, projeye bağlı iş emirleri ve satınalmalardan gelir.
  // Not: montaj/nakliye gibi saha giderleri elle eklenir — sistem bunları
  // otomatik bilemez, o yüzden 'digerGiderler' ayrı tutulur.
  function karlilik(proje, maliyetler) {
    const bedel = (+proje.sozlesmeBedeli || 0) + (+proje.revizyonFarki || 0);
    const uretim = (+maliyetler.uretim || 0);
    const malzeme = (+maliyetler.malzeme || 0);
    const diger = (+proje.digerGiderler || 0);
    const toplamMaliyet = uretim + malzeme + diger;
    const kar = bedel - toplamMaliyet;
    return {
      bedel, uretim, malzeme, diger, toplamMaliyet, kar,
      marj: bedel ? (kar / bedel * 100) : null
    };
  }

  // ── TERMİN RİSKİ ─────────────────────────────────────────────────────────
  // Zaman ilerlemesi ile fiziksel ilerlemeyi karşılaştırır. Zaman %70 geçmiş
  // ama iş %40'taysa proje gecikmeye adaydır — erken uyarı verir.
  function terminRiski(proje) {
    if (!proje.baslangic || !proje.bitis) return null;
    const bas = new Date(proje.baslangic).getTime();
    const bit = new Date(proje.bitis).getTime();
    const simdi = Date.now();
    if (bit <= bas) return null;
    const zamanYuzde = Math.min(100, Math.max(0, (simdi - bas) / (bit - bas) * 100));
    const isYuzde = ilerlemeHesapla(proje).yuzde;
    const sapma = isYuzde - zamanYuzde;
    let seviye = 'iyi';
    if (sapma < -20) seviye = 'kritik';
    else if (sapma < -10) seviye = 'riskli';
    const kalanGun = Math.ceil((bit - simdi) / 86400000);
    return {
      zamanYuzde: Math.round(zamanYuzde * 10) / 10,
      isYuzde, sapma: Math.round(sapma * 10) / 10,
      seviye, kalanGun, gecikti: simdi > bit && isYuzde < 100
    };
  }

  async function projeOlustur({ ad, musteriId, musteriAdi, sozlesmeBedeli,
    baslangic, bitis, firsatId, sorumlu, aciklama }) {
    if (!ad || !ad.trim()) return { ok: false, hata: 'Proje adı zorunlu.' };
    if (!musteriAdi && !musteriId) return { ok: false, hata: 'Müşteri seçilmeli.' };
    const p = {
      id: App.uid('PRJ'),
      kod: 'PRJ-' + Date.now().toString(36).toUpperCase(),
      ad: ad.trim(),
      musteriId: musteriId || null, musteriAdi: musteriAdi || '',
      sozlesmeBedeli: +sozlesmeBedeli || 0,
      revizyonFarki: 0, digerGiderler: 0,
      baslangic: baslangic || '', bitis: bitis || '',
      durum: 'planlaniyor',
      sorumlu: sorumlu || (App.aktifRol ? App.aktifRol() : ''),
      firsatId: firsatId || null,
      aciklama: (aciklama || '').trim(),
      // Varsayılan aşamalar — ağırlıklar sözleşmeye göre düzenlenebilir
      asamalar: ASAMALAR.map(a => ({
        id: a.id, ad: a.ad, agirlik: a.varsayilanOran,
        tamamlanmaYuzdesi: 0, baslangic: '', bitis: '', not: ''
      })),
      hakedisler: [], revizyonlar: [], siparisler: [],
      olusturmaTarihi: new Date().toISOString()
    };
    await App.persist(() => Store.topluEkle('projeler', [p], 1));
    return { ok: true, proje: p };
  }

  async function asamaGuncelle(projeId, asamaId, { tamamlanmaYuzdesi, agirlik, baslangic, bitis, not }) {
    const liste = await Store.projeler.all();
    const p = liste.find(x => x.id === projeId);
    if (!p) return { ok: false, hata: 'Proje bulunamadı.' };
    const a = (p.asamalar || []).find(x => x.id === asamaId);
    if (!a) return { ok: false, hata: 'Aşama bulunamadı.' };
    if (tamamlanmaYuzdesi != null) {
      const v = +tamamlanmaYuzdesi;
      if (isNaN(v) || v < 0 || v > 100) return { ok: false, hata: 'Tamamlanma yüzdesi 0-100 arası olmalı.' };
      a.tamamlanmaYuzdesi = v;
    }
    if (agirlik != null) a.agirlik = +agirlik || 0;
    if (baslangic != null) a.baslangic = baslangic;
    if (bitis != null) a.bitis = bitis;
    if (not != null) a.not = String(not).trim();
    // Proje durumu otomatik ilerler
    const il = ilerlemeHesapla(p);
    if (il.yuzde > 0 && p.durum === 'planlaniyor') p.durum = 'devam';
    if (il.yuzde >= 100) p.durum = 'tamamlandi';
    await App.persist(() => Store.topluGuncelle('projeler', [p], 1));
    return { ok: true, proje: p, ilerleme: il };
  }

  async function hakedisOlustur(projeId, { aciklama, elleTutar }) {
    const liste = await Store.projeler.all();
    const p = liste.find(x => x.id === projeId);
    if (!p) return { ok: false, hata: 'Proje bulunamadı.' };
    const il = ilerlemeHesapla(p);
    const h = hakedisHesapla(p, il.yuzde);
    const tutar = (elleTutar != null && elleTutar !== '') ? +elleTutar : h.tutar;
    if (!tutar || tutar <= 0) {
      return { ok: false, hata: 'Hakediş tutarı sıfır veya negatif. Önceki hakedişler ilerlemeyi zaten kapsıyor.' };
    }
    const kayit = {
      id: App.uid('HKD'),
      no: (p.hakedisler || []).length + 1,
      tarih: new Date().toISOString().slice(0, 10),
      ilerlemeYuzde: il.yuzde,
      kumulatifOran: Math.round(h.kumulatifOran * 10) / 10,
      tutar: Math.round(tutar * 100) / 100,
      durum: 'hazirlaniyor',
      aciklama: (aciklama || '').trim(),
      olusturan: App.aktifRol ? App.aktifRol() : ''
    };
    p.hakedisler = p.hakedisler || [];
    p.hakedisler.push(kayit);
    await App.persist(() => Store.topluGuncelle('projeler', [p], 1));
    return { ok: true, hakedis: kayit, proje: p };
  }

  async function revizyonEkle(projeId, { baslik, fiyatFarki, gerekce }) {
    const liste = await Store.projeler.all();
    const p = liste.find(x => x.id === projeId);
    if (!p) return { ok: false, hata: 'Proje bulunamadı.' };
    if (!baslik || !baslik.trim()) return { ok: false, hata: 'Revizyon başlığı zorunlu.' };
    if (!gerekce || !gerekce.trim()) return { ok: false, hata: 'Revizyon gerekçesi zorunlu — fiyat farkı ancak böyle savunulabilir.' };
    const r = {
      id: App.uid('REV'),
      no: (p.revizyonlar || []).length + 1,
      baslik: baslik.trim(),
      fiyatFarki: +fiyatFarki || 0,
      gerekce: gerekce.trim(),
      tarih: new Date().toISOString().slice(0, 10),
      kim: App.aktifRol ? App.aktifRol() : ''
    };
    p.revizyonlar = p.revizyonlar || [];
    p.revizyonlar.push(r);
    p.revizyonFarki = (p.revizyonlar || []).reduce((a, x) => a + (+x.fiyatFarki || 0), 0);
    await App.persist(() => Store.topluGuncelle('projeler', [p], 1));
    return { ok: true, revizyon: r, proje: p };
  }

  return {
    ASAMALAR, DURUMLAR, HAKEDIS_DURUM,
    ilerlemeHesapla, hakedisHesapla, karlilik, terminRiski,
    projeOlustur, asamaGuncelle, hakedisOlustur, revizyonEkle
  };
})();

if (typeof module !== 'undefined') module.exports = ProjeMotor;
