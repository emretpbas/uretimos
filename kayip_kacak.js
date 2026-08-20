// ════════════════════════════════════════════════════════════════════════════
// KAYIP-KAÇAK KONTROLÜ — KATMAN 1+2
// Malzeme Talep → Onay → Teslim/Sarf Zinciri + Görev Ayrılığı
// ────────────────────────────────────────────────────────────────────────────
// AMAÇ: Her stok çıkışının bir SAHİBİ (talep eden), bir GEREKÇESİ ve bir
// ONAYLAYANI olsun. İşe bağlı olmayan, gerekçesiz, tek kişinin baştan sona
// kontrol ettiği çıkışlar kayıp-kaçağın ana yoludur; bu modül onu kapatır.
//
// TEMEL KURAL (görev ayrılığı / segregation of duties):
//   onaylayan ≠ talep eden. Aynı kişi hem isteyip hem onaylayamaz.
//
// DURUM MAKİNESİ:
//   beklemede → onaylandi → teslim_edildi → kapatildi
//                    ↓
//                reddedildi
//
// Saklama: `malzemeTalepleri` koleksiyonu. Her kayıt bir talebin tüm yaşam
// döngüsünü + kim/ne zaman/neden izini taşır. Onaylanan talep teslim edilince
// stokHareketleri'ne SAHİPLİ bir çıkış yazılır (talepEden+onaylayan+sarfEden).
// ════════════════════════════════════════════════════════════════════════════
const KayipKacak = (() => {

  // Kayıp/çıkış tipleri — her çıkış sınıflandırılır (rapor ve analiz için).
  const KAYIP_TIPLERI = [
    { id: 'uretim_sarf', ad: 'Üretim Sarfı (işe bağlı)', normal: true },
    { id: 'bakim_onarim', ad: 'Bakım / Onarım', normal: true },
    { id: 'numune_arge', ad: 'Numune / ARGE', normal: true },
    { id: 'fire', ad: 'Fire (kesim/işleme kaybı)', normal: false },
    { id: 'hasar', ad: 'Hasar / Kırılma', normal: false },
    { id: 'kayip', ad: 'Kayıp / Bulunamıyor', normal: false },
    { id: 'iade', ad: 'İade (tedarikçiye/depoya geri)', normal: true }
  ];

  // ── GÖREV AYRILIĞI KONTROLÜ (çekirdek kural) ─────────────────────────────
  // Bir talebi onaylayan kişi, talep edenle AYNI olamaz. Bu fonksiyon tüm
  // onay akışının kalbidir; test edilebilir olması için saf (pure) tutuldu.
  function gorevAyriligiGecerli(talepEdenId, onaylayanId) {
    if (!talepEdenId || !onaylayanId) return { gecerli: false, sebep: 'Talep eden ve onaylayan belirtilmeli.' };
    if (talepEdenId === onaylayanId)
      return { gecerli: false, sebep: 'Görev ayrılığı: Bir talebi talep eden kişi kendisi onaylayamaz. Onayı farklı bir yetkili vermeli.' };
    return { gecerli: true, sebep: null };
  }

  // Belirli tutar/miktar üstü talepler çift onay ister mi?
  // (Eşik yönetim ayarından gelebilir; şimdilik sabit örnek eşik.)
  const CIFT_ONAY_TUTAR_ESIGI = 50000; // TRY — bu tutar üstü ikinci onay ister
  function ciftOnayGerekli(tahminiTutar) {
    return (+tahminiTutar || 0) >= CIFT_ONAY_TUTAR_ESIGI;
  }

  // Durum geçişinin geçerli olup olmadığını kontrol eder (durum makinesi).
  const GECERLI_GECISLER = {
    beklemede: ['onaylandi', 'reddedildi'],
    onaylandi: ['teslim_edildi', 'reddedildi'],
    teslim_edildi: ['kapatildi'],
    reddedildi: [],
    kapatildi: []
  };
  function gecisGecerli(mevcutDurum, yeniDurum) {
    return (GECERLI_GECISLER[mevcutDurum] || []).includes(yeniDurum);
  }

  // ── AKTİF KULLANICI ───────────────────────────────────────────────────────
  // Mevcut sistemde kimlik rol bazlı (state.role). Kişi bazlı izleme için
  // rolü kullanıcı kimliği olarak alıyoruz; ileride gerçek kullanıcı hesabı
  // eklenince buraya kullanıcı ID'si gelir.
  function aktifKullanici() {
    const rol = (typeof App !== 'undefined' && App.aktifRol) ? App.aktifRol() : null;
    return rol || 'bilinmeyen';
  }

  // ── TALEP OLUŞTUR ─────────────────────────────────────────────────────────
  async function talepOlustur({ kalemAdi, hammaddeId, miktar, birim, kayipTipi, gerekce, isEmriId, tahminiTutar }) {
    if (!kalemAdi || !miktar || miktar <= 0)
      return { ok: false, hata: 'Kalem ve geçerli miktar zorunlu.' };
    if (!gerekce || !gerekce.trim())
      return { ok: false, hata: 'Gerekçe zorunlu — her çıkışın bir nedeni olmalı.' };
    const tip = KAYIP_TIPLERI.find(t => t.id === kayipTipi);
    if (!tip) return { ok: false, hata: 'Geçerli bir kayıp/çıkış tipi seçin.' };

    const talep = {
      id: App.uid('MTL'),
      kalemAdi, hammaddeId: hammaddeId || null, miktar: +miktar, birim: birim || 'adet',
      kayipTipi, kayipTipiAd: tip.ad, normalMi: tip.normal,
      gerekce: gerekce.trim(),
      isEmriId: isEmriId || null,
      tahminiTutar: +tahminiTutar || 0,
      ciftOnayGerekli: ciftOnayGerekli(tahminiTutar),
      durum: 'beklemede',
      talepEden: aktifKullanici(),
      talepTarihi: new Date().toISOString(),
      onaylayan: null, onayTarihi: null,
      ikinciOnaylayan: null, ikinciOnayTarihi: null,
      teslimEden: null, teslimTarihi: null,
      redSebebi: null
    };

    const liste = await Store.malzemeTalepleri.all();
    liste.push(talep);
    await App.persist(() => Store.malzemeTalepleri.save(liste));
    return { ok: true, talep };
  }

  // ── ONAYLA ────────────────────────────────────────────────────────────────
  async function onayla(talepId, onaylayanId) {
    const liste = await Store.malzemeTalepleri.all();
    const talep = liste.find(t => t.id === talepId);
    if (!talep) return { ok: false, hata: 'Talep bulunamadı.' };
    if (!gecisGecerli(talep.durum, 'onaylandi'))
      return { ok: false, hata: `Bu talep '${talep.durum}' durumunda, onaylanamaz.` };

    // GÖREV AYRILIĞI — çekirdek kural
    const ga = gorevAyriligiGecerli(talep.talepEden, onaylayanId);
    if (!ga.gecerli) return { ok: false, hata: ga.sebep };

    // Çift onay gerekiyorsa: ilk onay işaretlenir ama durum beklemede kalır
    if (talep.ciftOnayGerekli && !talep.onaylayan) {
      talep.onaylayan = onaylayanId;
      talep.onayTarihi = new Date().toISOString();
      await App.persist(() => Store.malzemeTalepleri.save(liste));
      return { ok: true, ikinciOnayBekliyor: true, talep };
    }

    // Çift onayın İKİNCİ onayı: ikinci kişi de farklı olmalı
    if (talep.ciftOnayGerekli && talep.onaylayan) {
      if (onaylayanId === talep.onaylayan)
        return { ok: false, hata: 'Çift onay: İkinci onay ilk onaylayandan FARKLI bir yetkili tarafından verilmeli.' };
      if (onaylayanId === talep.talepEden)
        return { ok: false, hata: 'Görev ayrılığı: Talep eden onaylayamaz.' };
      talep.ikinciOnaylayan = onaylayanId;
      talep.ikinciOnayTarihi = new Date().toISOString();
      talep.durum = 'onaylandi';
      await App.persist(() => Store.malzemeTalepleri.save(liste));
      return { ok: true, talep };
    }

    // Tek onay yeterli
    talep.onaylayan = onaylayanId;
    talep.onayTarihi = new Date().toISOString();
    talep.durum = 'onaylandi';
    await App.persist(() => Store.malzemeTalepleri.save(liste));
    return { ok: true, talep };
  }

  // ── REDDET ────────────────────────────────────────────────────────────────
  async function reddet(talepId, redEdenId, sebep) {
    const liste = await Store.malzemeTalepleri.all();
    const talep = liste.find(t => t.id === talepId);
    if (!talep) return { ok: false, hata: 'Talep bulunamadı.' };
    if (!gecisGecerli(talep.durum, 'reddedildi'))
      return { ok: false, hata: `Bu talep '${talep.durum}' durumunda, reddedilemez.` };
    if (!sebep || !sebep.trim()) return { ok: false, hata: 'Red sebebi zorunlu.' };
    const ga = gorevAyriligiGecerli(talep.talepEden, redEdenId);
    if (!ga.gecerli) return { ok: false, hata: ga.sebep };

    talep.durum = 'reddedildi';
    talep.onaylayan = redEdenId;
    talep.redSebebi = sebep.trim();
    talep.onayTarihi = new Date().toISOString();
    await App.persist(() => Store.malzemeTalepleri.save(liste));
    return { ok: true, talep };
  }

  // ── TESLİM ET (onaylı talebi stoktan düş, SAHİPLİ hareket yaz) ────────────
  async function teslimEt(talepId, teslimEdenId) {
    const liste = await Store.malzemeTalepleri.all();
    const talep = liste.find(t => t.id === talepId);
    if (!talep) return { ok: false, hata: 'Talep bulunamadı.' };
    if (!gecisGecerli(talep.durum, 'teslim_edildi'))
      return { ok: false, hata: `Talep '${talep.durum}' durumunda, teslim edilemez. Önce onaylanmalı.` };

    // Stoktan düş + SAHİPLİ hareket kaydı (talepEden + onaylayan + teslimEden)
    const stokHareketleri = await Store.stokHareketleri.all();
    stokHareketleri.push({
      id: App.uid('HRK'), tip: 'cikis', ambar: 'hammadde_deposu',
      kalemAdi: talep.kalemAdi, hammaddeId: talep.hammaddeId || null, miktar: talep.miktar, birim: talep.birim,
      aciklama: `${talep.kayipTipiAd} — ${talep.gerekce}`,
      // KAYIP-KAÇAK İZ ALANLARI (Katman 1):
      talepId: talep.id,
      talepEden: talep.talepEden,
      onaylayan: talep.onaylayan,
      teslimEden: teslimEdenId,
      kayipTipi: talep.kayipTipi,
      normalMi: talep.normalMi,
      isEmriId: talep.isEmriId,
      tarih: new Date().toISOString().slice(0, 10)
    });
    await Store.stokHareketleri.save(stokHareketleri);

    talep.durum = 'teslim_edildi';
    talep.teslimEden = teslimEdenId;
    talep.teslimTarihi = new Date().toISOString();
    await App.persist(() => Store.malzemeTalepleri.save(liste));
    return { ok: true, talep };
  }

  return {
    KAYIP_TIPLERI, CIFT_ONAY_TUTAR_ESIGI,
    gorevAyriligiGecerli, ciftOnayGerekli, gecisGecerli, aktifKullanici,
    talepOlustur, onayla, reddet, teslimEt
  };
})();
