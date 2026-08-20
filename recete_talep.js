// ════════════════════════════════════════════════════════════════════════════
// HAT OPERATÖRÜ → REÇETE TAMAMLAMA TALEP ZİNCİRİ
// ────────────────────────────────────────────────────────────────────────────
// Operatör hat takibinde bir yarı mamulü üretirken:
//   1) Reçetedeki malzemeleri ONAYLAR (gerçekten kullandı)
//   2) Reçetede OLMAYAN ama kullandığı malzemeyi hammadde listesinden ekler
//   3) Hammadde listesinde de yoksa MALZEME KARTI AÇMA TALEBİ yazar
// Bunların hepsi:
//   → PLANLAMA onayına düşer
//   → sonra ARGE + TEKNİK OFİS onayıyla reçeteye "alt kalem" olarak işlenir
//
// Görev ayrılığı (KayipKacak modülüyle aynı ilke): talep eden operatör,
// onaylayanlardan farklı olmalı. Operatör reçeteyi ASLA doğrudan değiştiremez.
//
// Saklama: `receteTalepleri` koleksiyonu.
// ════════════════════════════════════════════════════════════════════════════
const ReceteTalep = (() => {

  const TALEP_TIPLERI = {
    eksik_malzeme: 'Reçete dışı kullanılan malzeme (ekleme)',
    kart_talebi: 'Yeni malzeme kartı açma talebi',
    miktar_duzeltme: 'Reçete miktarı düzeltme (fiili kullanım)'
  };

  // Durum makinesi: iki kademeli onay
  const GECISLER = {
    planlama_bekliyor: ['arge_teknik_bekliyor', 'reddedildi'],
    arge_teknik_bekliyor: ['receteye_islendi', 'reddedildi'],
    receteye_islendi: [],
    reddedildi: []
  };
  function gecisGecerli(mevcut, yeni) {
    return (GECISLER[mevcut] || []).includes(yeni);
  }

  // Görev ayrılığı — talep eden onaylayamaz (KayipKacak ile aynı kural).
  function gorevAyriligiGecerli(talepEden, onaylayan) {
    if (!talepEden || !onaylayan) return { gecerli: false, sebep: 'Talep eden ve onaylayan belirtilmeli.' };
    if (talepEden === onaylayan)
      return { gecerli: false, sebep: 'Görev ayrılığı: Talebi açan kişi onaylayamaz. Farklı bir yetkili onaylamalı.' };
    return { gecerli: true, sebep: null };
  }

  function aktifKullanici() {
    return (typeof App !== 'undefined' && App.aktifRol) ? (App.aktifRol() || 'bilinmeyen') : 'bilinmeyen';
  }

  // ── EKSİK MALZEME TALEBİ (reçetede yok, hammadde kartı VAR) ───────────────
  async function eksikMalzemeTalep({ ymId, ymKod, ymAd, hammaddeId, hammaddeAd, miktar, birim, gerekce, operator }) {
    if (!ymId) return { ok: false, hata: 'Yarı mamul belirtilmeli.' };
    if (!hammaddeId) return { ok: false, hata: 'Hammadde seçilmeli.' };
    if (!miktar || miktar <= 0) return { ok: false, hata: 'Geçerli miktar girilmeli.' };

    const talep = {
      id: App.uid('RTL'), tip: 'eksik_malzeme',
      ymId, ymKod: ymKod || '', ymAd: ymAd || '',
      hammaddeId, hammaddeAd: hammaddeAd || '', miktar: +miktar, birim: birim || 'adet',
      kartAciklama: null,
      gerekce: (gerekce || '').trim(),
      operator: operator || aktifKullanici(),
      durum: 'planlama_bekliyor',
      planlamaOnay: null, argeTeknikOnay: null,
      receteKalemId: null, redSebebi: null,
      tarih: new Date().toISOString()
    };
    const liste = await Store.receteTalepleri.all();
    liste.push(talep);
    await App.persist(() => Store.receteTalepleri.save(liste));
    return { ok: true, talep };
  }

  // ── MALZEME KARTI AÇMA TALEBİ (hammadde listesinde de YOK) ────────────────
  async function kartTalep({ ymId, ymKod, ymAd, kartAciklama, miktar, birim, gerekce, operator }) {
    if (!ymId) return { ok: false, hata: 'Yarı mamul belirtilmeli.' };
    if (!kartAciklama || !kartAciklama.trim())
      return { ok: false, hata: 'Malzeme tanımı zorunlu — açılacak kartı tarif edin (marka, ölçü, tür).' };

    const talep = {
      id: App.uid('RTL'), tip: 'kart_talebi',
      ymId, ymKod: ymKod || '', ymAd: ymAd || '',
      hammaddeId: null, hammaddeAd: null,
      miktar: +miktar || 0, birim: birim || 'adet',
      kartAciklama: kartAciklama.trim(),
      gerekce: (gerekce || '').trim(),
      operator: operator || aktifKullanici(),
      durum: 'planlama_bekliyor',
      planlamaOnay: null, argeTeknikOnay: null,
      receteKalemId: null, redSebebi: null,
      tarih: new Date().toISOString()
    };
    const liste = await Store.receteTalepleri.all();
    liste.push(talep);
    await App.persist(() => Store.receteTalepleri.save(liste));
    return { ok: true, talep };
  }

  // ── MİKTAR DÜZELTME TALEBİ (reçetedeki miktar fiiliyle uyuşmuyor) ─────────
  // Operatör reçetede yazan miktarı değil, GERÇEKTE kullandığı miktarı bildirir.
  // Onaylanırsa mevcut reçete kaleminin miktarı güncellenir (yeni kalem EKLENMEZ).
  async function miktarDuzeltmeTalep({ ymId, ymKod, ymAd, receteKalemId, receteKalemIndex, hammaddeId, hammaddeAd, eskiMiktar, miktar, birim, gerekce, operator }) {
    if (!ymId) return { ok: false, hata: 'Yarı mamul belirtilmeli.' };
    // Eski reçete kalemlerinin (Excel'den gelen) `id` alanı olmayabilir; bu
    // durumda kalem SIRA NUMARASI + hammadde referansıyla eşleştirilir.
    const idVar = !!receteKalemId;
    const idxVar = Number.isInteger(receteKalemIndex) && receteKalemIndex >= 0;
    if (!idVar && !idxVar) return { ok: false, hata: 'Düzeltilecek reçete kalemi belirlenemedi.' };
    if (!miktar || miktar <= 0) return { ok: false, hata: 'Geçerli bir yeni miktar girin.' };
    if (+miktar === +eskiMiktar) return { ok: false, hata: 'Yeni miktar mevcut miktarla aynı — düzeltme gerekmiyor.' };

    const talep = {
      id: App.uid('RTL'), tip: 'miktar_duzeltme',
      ymId, ymKod: ymKod || '', ymAd: ymAd || '',
      receteKalemId: receteKalemId || null,
      receteKalemIndex: idxVar ? receteKalemIndex : null,
      hammaddeId: hammaddeId || null, hammaddeAd: hammaddeAd || '',
      eskiMiktar: +eskiMiktar || 0, miktar: +miktar, birim: birim || 'adet',
      kartAciklama: null,
      gerekce: (gerekce || '').trim(),
      operator: operator || aktifKullanici(),
      durum: 'planlama_bekliyor',
      planlamaOnay: null, argeTeknikOnay: null,
      redSebebi: null,
      tarih: new Date().toISOString()
    };
    const liste = await Store.receteTalepleri.all();
    liste.push(talep);
    await App.persist(() => Store.receteTalepleri.save(liste));
    return { ok: true, talep };
  }

  // ── PLANLAMA ONAYI (1. kademe) ────────────────────────────────────────────
  async function planlamaOnayla(talepId, onaylayan) {
    const liste = await Store.receteTalepleri.all();
    const t = liste.find(x => x.id === talepId);
    if (!t) return { ok: false, hata: 'Talep bulunamadı.' };
    if (!gecisGecerli(t.durum, 'arge_teknik_bekliyor'))
      return { ok: false, hata: `Talep '${t.durum}' durumunda, planlama onayı verilemez.` };
    const ga = gorevAyriligiGecerli(t.operator, onaylayan);
    if (!ga.gecerli) return { ok: false, hata: ga.sebep };

    t.durum = 'arge_teknik_bekliyor';
    t.planlamaOnay = { kim: onaylayan, tarih: new Date().toISOString() };
    await App.persist(() => Store.receteTalepleri.save(liste));
    return { ok: true, talep: t };
  }

  // ── ARGE/TEKNİK ONAYI + REÇETEYE İŞLEME (2. kademe) ───────────────────────
  // Onaylayan farklı olmalı VE planlama onaylayanından da farklı olmalı
  // (üç göz ilkesi: operatör, planlama, arge/teknik hepsi ayrı).
  async function argeTeknikOnayla(talepId, onaylayan) {
    const liste = await Store.receteTalepleri.all();
    const t = liste.find(x => x.id === talepId);
    if (!t) return { ok: false, hata: 'Talep bulunamadı.' };
    if (!gecisGecerli(t.durum, 'receteye_islendi'))
      return { ok: false, hata: `Talep '${t.durum}' durumunda, ARGE/Teknik onayı verilemez. Önce planlama onaylamalı.` };
    const ga = gorevAyriligiGecerli(t.operator, onaylayan);
    if (!ga.gecerli) return { ok: false, hata: ga.sebep };
    if (t.planlamaOnay && onaylayan === t.planlamaOnay.kim)
      return { ok: false, hata: 'Üç göz ilkesi: ARGE/Teknik onayı, planlama onaylayanından farklı olmalı.' };

    // Kart talebi ise: önce kart açılmalı; reçeteye eklenmeden geçemez.
    if (t.tip === 'kart_talebi' && !t.hammaddeId)
      return { ok: false, hata: 'Bu bir kart açma talebi. Önce hammadde kartını açıp talebe bağlayın (hammaddeId), sonra reçeteye işlenebilir.' };

    // Reçeteye işle
    const receteler = await Store.receteler.all();
    let recete = receteler.find(r => r.yarimamulId === t.ymId);

    // ── MİKTAR DÜZELTME: mevcut kalemin miktarını güncelle (yeni kalem ekleme) ──
    if (t.tip === 'miktar_duzeltme') {
      if (!recete) return { ok: false, hata: 'Bu yarı mamulün reçetesi bulunamadı.' };
      const kalemler = recete.kalemler || [];
      let kalem = t.receteKalemId ? kalemler.find(k => k.id === t.receteKalemId) : null;
      // id yoksa: sıra numarasıyla bul, hammadde referansı da tutuyorsa kabul et
      if (!kalem && Number.isInteger(t.receteKalemIndex) && kalemler[t.receteKalemIndex]) {
        const aday = kalemler[t.receteKalemIndex];
        if (!t.hammaddeId || aday.refId === t.hammaddeId) kalem = aday;
      }
      // son çare: aynı hammaddeye ait TEK kalem varsa onu güncelle
      if (!kalem && t.hammaddeId) {
        const eslesen = kalemler.filter(k => k.refId === t.hammaddeId);
        if (eslesen.length === 1) kalem = eslesen[0];
      }
      if (!kalem) return { ok: false, hata: 'Düzeltilecek reçete kalemi bulunamadı (reçete değişmiş olabilir).' };
      // Kalemin kalıcı kimliği yoksa şimdi ver (sonraki düzeltmeler kesin eşleşsin)
      if (!kalem.id) kalem.id = App.uid('RK');

      kalem.miktar = t.miktar;                    // fiili kullanım reçeteye yansır
      kalem.miktarDuzeltmeTalepId = t.id;         // izlenebilirlik: neden değişti
      kalem.oncekiMiktar = t.eskiMiktar;
      await App.persist(() => Store.receteler.save(receteler));

      t.durum = 'receteye_islendi';
      t.argeTeknikOnay = { kim: onaylayan, tarih: new Date().toISOString() };
      await App.persist(() => Store.receteTalepleri.save(liste));
      t.receteKalemId = kalem.id;
      return { ok: true, talep: t, receteKalemId: kalem.id, miktarGuncellendi: true };
    }

    if (!recete) {
      // Reçete yoksa oluştur (yarı mamul için)
      recete = { id: App.uid('RC'), yarimamulId: t.ymId, ad: (t.ymAd || 'Yarı Mamul') + ' Reçetesi', kalemler: [] };
      receteler.push(recete);
    }
    const kalemId = App.uid('RK');
    recete.kalemler.push({
      id: kalemId, tip: 'hammadde', refId: t.hammaddeId,
      miktar: t.miktar, birim: t.birim,
      kaynak: 'hat_talebi',            // bu kalem sahadan geldi (izlenebilir)
      talepId: t.id
    });
    await App.persist(() => Store.receteler.save(receteler));

    t.durum = 'receteye_islendi';
    t.argeTeknikOnay = { kim: onaylayan, tarih: new Date().toISOString() };
    t.receteKalemId = kalemId;
    await App.persist(() => Store.receteTalepleri.save(liste));
    return { ok: true, talep: t, receteKalemId: kalemId };
  }

  // ── REDDET (her iki kademede de olabilir) ─────────────────────────────────
  async function reddet(talepId, redEden, sebep) {
    const liste = await Store.receteTalepleri.all();
    const t = liste.find(x => x.id === talepId);
    if (!t) return { ok: false, hata: 'Talep bulunamadı.' };
    if (!gecisGecerli(t.durum, 'reddedildi'))
      return { ok: false, hata: `Talep '${t.durum}' durumunda, reddedilemez.` };
    if (!sebep || !sebep.trim()) return { ok: false, hata: 'Red sebebi zorunlu.' };
    const ga = gorevAyriligiGecerli(t.operator, redEden);
    if (!ga.gecerli) return { ok: false, hata: ga.sebep };

    t.durum = 'reddedildi';
    t.redSebebi = sebep.trim();
    t.redEden = redEden;
    t.redTarihi = new Date().toISOString();
    await App.persist(() => Store.receteTalepleri.save(liste));
    return { ok: true, talep: t };
  }

  // Kart talebine sonradan açılan hammadde kartını bağla (reçeteye işleme öncesi)
  async function karteHammaddeBagla(talepId, hammaddeId, hammaddeAd) {
    const liste = await Store.receteTalepleri.all();
    const t = liste.find(x => x.id === talepId);
    if (!t) return { ok: false, hata: 'Talep bulunamadı.' };
    if (t.tip !== 'kart_talebi') return { ok: false, hata: 'Bu bir kart talebi değil.' };
    t.hammaddeId = hammaddeId;
    t.hammaddeAd = hammaddeAd || '';
    await App.persist(() => Store.receteTalepleri.save(liste));
    return { ok: true, talep: t };
  }

  // Operatör kendi BEKLEYEN talebini geri çekebilir (henüz planlama onaylamadıysa).
  // Onaylanmış/işlenmiş talep geri çekilemez — iz bozulmaz.
  async function talepGeriCek(talepId, kim) {
    const liste = await Store.receteTalepleri.all();
    const t = liste.find(x => x.id === talepId);
    if (!t) return { ok: false, hata: 'Talep bulunamadı.' };
    if (t.durum !== 'planlama_bekliyor')
      return { ok: false, hata: 'Yalnızca planlama onayı bekleyen talep geri çekilebilir. Onaylanan işlemler geri çekilemez.' };
    if (t.operator !== kim)
      return { ok: false, hata: 'Yalnızca talebi açan kişi geri çekebilir.' };
    const yeni = liste.filter(x => x.id !== talepId);
    await App.persist(() => Store.receteTalepleri.save(yeni));
    return { ok: true };
  }

  return {
    TALEP_TIPLERI, gecisGecerli, gorevAyriligiGecerli, aktifKullanici,
    eksikMalzemeTalep, kartTalep, miktarDuzeltmeTalep, planlamaOnayla, argeTeknikOnayla, reddet, karteHammaddeBagla, talepGeriCek
  };
})();
