// ════════════════════════════════════════════════════════════════════════════
// OTOMASYON MOTORU — Karanlık fabrika altyapısı
// ────────────────────────────────────────────────────────────────────────────
// KARANLIK FABRİKA NEDİR: İnsan müdahalesi olmadan çalışan üretim. ERP açısından
// temel fark şudur — mevcut sistemde her adımı OPERATÖR onaylar (barkod okutur,
// "başladı/bitti" der). Karanlık fabrikada bunu MAKİNE bildirir.
//
// BU MOTORUN SORUMLULUĞU:
//   1) Makine durum modeli — her makinenin nerede olduğunu tek biçimde tutar
//   2) Olay işleme — makineden gelen sinyali iş emrine/işe bağlar
//   3) Otonom karar — gece 03:00'te kimse yokken ne yapılacağını belirler
//   4) İstisna yükseltme — insana SADECE gerektiğinde haber verir
//
// TASARIM İLKESİ — "GÜVENLİ DURUŞ":
// Karar verilemeyen her durumda üretim DURUR ve insan çağrılır. Otomasyonda
// en pahalı hata, sistemin emin olmadığı halde devam edip 400 parçayı hatalı
// üretmesidir. Şüphede duraklamak, şüphede devam etmekten her zaman ucuzdur.
// ════════════════════════════════════════════════════════════════════════════
const OtomasyonMotor = (() => {

  // ── MAKİNE DURUM MODELİ ──────────────────────────────────────────────────
  // Endüstride yerleşik model (SEMI E10 / OEE'ye uyumlu). Her makine her an
  // TEK bir durumdadır; geçişler kayıt altına alınır.
  const DURUMLAR = {
    kapali:    { ad: 'Kapalı',            renk: '#616161', uretken: false, insanGerek: false },
    hazir:     { ad: 'Hazır (boşta)',     renk: '#1976d2', uretken: false, insanGerek: false },
    calisiyor: { ad: 'Çalışıyor',         renk: '#2e7d32', uretken: true,  insanGerek: false },
    bekliyor:  { ad: 'Malzeme Bekliyor',  renk: '#f57c00', uretken: false, insanGerek: false },
    tikandi:   { ad: 'Çıkış Tıkandı',     renk: '#f57c00', uretken: false, insanGerek: false },
    ariza:     { ad: 'Arıza',             renk: '#c62828', uretken: false, insanGerek: true  },
    bakim:     { ad: 'Planlı Bakım',      renk: '#7b1fa2', uretken: false, insanGerek: false },
    kurulum:   { ad: 'Kurulum / Ayar',    renk: '#0097a7', uretken: false, insanGerek: false },
    acil_stop: { ad: 'ACİL DURDURMA',     renk: '#b71c1c', uretken: false, insanGerek: true  }
  };

  // Geçerli geçişler. Tanımsız geçiş REDDEDİLİR — bozuk sinyal veya yanlış
  // yapılandırma sessizce kabul edilirse makine durumu gerçeği yansıtmaz.
  const GECISLER = {
    kapali:    ['hazir', 'bakim', 'ariza'],
    hazir:     ['calisiyor', 'kurulum', 'bakim', 'kapali', 'ariza', 'acil_stop'],
    calisiyor: ['hazir', 'bekliyor', 'tikandi', 'ariza', 'acil_stop', 'bakim'],
    bekliyor:  ['calisiyor', 'hazir', 'ariza', 'acil_stop'],
    tikandi:   ['calisiyor', 'hazir', 'ariza', 'acil_stop'],
    ariza:     ['bakim', 'hazir', 'kapali', 'acil_stop'],
    bakim:     ['hazir', 'kapali', 'ariza'],
    kurulum:   ['hazir', 'calisiyor', 'ariza', 'acil_stop'],
    acil_stop: ['hazir', 'bakim', 'kapali']
  };

  // ── OLAY TİPLERİ ─────────────────────────────────────────────────────────
  // Makine/geçit (gateway) bu tiplerde sinyal gönderir.
  const OLAY_TIPLERI = {
    durum:        { ad: 'Durum değişimi',      kritik: false },
    parca_bitti:  { ad: 'Parça tamamlandı',    kritik: false },
    parca_red:    { ad: 'Parça reddedildi',    kritik: true  },
    alarm:        { ad: 'Alarm',               kritik: true  },
    sayac:        { ad: 'Sayaç okuması',       kritik: false },
    olcum:        { ad: 'Ölçüm/kalite verisi', kritik: false },
    nabiz:        { ad: 'Nabız (heartbeat)',   kritik: false },
    program_yukle:{ ad: 'Program yüklendi',    kritik: false }
  };

  const durumBilgi = (d) => DURUMLAR[d] || DURUMLAR.kapali;

  function gecisGecerli(eski, yeni) {
    if (!DURUMLAR[yeni]) return { ok: false, hata: 'Bilinmeyen durum: ' + yeni };
    if (eski === yeni) return { ok: true, degisim: false };
    // ACİL DURDURMA her durumdan gelebilir — güvenlik önceliklidir
    if (yeni === 'acil_stop') return { ok: true, degisim: true };
    const izinli = GECISLER[eski] || [];
    if (!izinli.includes(yeni)) {
      return { ok: false, hata: `Geçersiz geçiş: ${eski} → ${yeni}. ` +
        'Makine sinyali beklenmedik sırada geldi; yapılandırma veya sensör hatası olabilir.' };
    }
    return { ok: true, degisim: true };
  }

  // ── NABIZ DENETİMİ ───────────────────────────────────────────────────────
  // Karanlık fabrikada en tehlikeli durum makinenin arızalanması değil,
  // SESSİZCE susmasıdır: kimse fark etmez, hat boşa döner. Nabız kesilmesi
  // arıza kadar ciddi bir olaydır.
  function nabizDurumu(makine, simdi) {
    const t = simdi || Date.now();
    const esik = (+makine.nabizEsigiSn || 120) * 1000;
    if (!makine.sonNabiz) return { canli: false, gecenSn: null, sebep: 'Hiç sinyal alınmadı' };
    const gecen = t - new Date(makine.sonNabiz).getTime();
    return {
      canli: gecen <= esik,
      gecenSn: Math.round(gecen / 1000),
      esikSn: Math.round(esik / 1000),
      sebep: gecen > esik ? `${Math.round(gecen / 1000)} sn'dir sinyal yok` : null
    };
  }

  // ── OTONOM KARAR MOTORU ──────────────────────────────────────────────────
  // Gece 03:00, kimse yok. Ne olacak? Kural tablosu bunu belirler.
  // Her kuralın bir EYLEMİ ve bir YÜKSELTME seviyesi vardır.
  const EYLEMLER = {
    devam:        'Üretime devam',
    duraklat:     'Makineyi duraklat',
    hat_durdur:   'Hattı durdur',
    yonlendir:    'Alternatif makineye yönlendir',
    izole:        'Parçayı karantinaya al',
    bakim_ac:     'Bakım iş emri aç',
    insan_cagir:  'İnsan çağır'
  };

  const SEVIYELER = {
    bilgi:   { ad: 'Bilgi',    oncelik: 0, bildirim: false },
    uyari:   { ad: 'Uyarı',    oncelik: 1, bildirim: false },
    onemli:  { ad: 'Önemli',   oncelik: 2, bildirim: true  },
    kritik:  { ad: 'Kritik',   oncelik: 3, bildirim: true  },
    acil:    { ad: 'ACİL',     oncelik: 4, bildirim: true  }
  };

  // Varsayılan kural seti. Fabrikaya göre düzenlenir; ama varsayılanlar
  // GÜVENLİ tarafta durur — emin olunmayan her durumda insan çağrılır.
  const VARSAYILAN_KURALLAR = [
    { id: 'acil_stop', ad: 'Acil durdurma basıldı',
      kosul: 'durum=acil_stop', eylem: 'hat_durdur', seviye: 'acil',
      aciklama: 'Güvenlik olayı — hat durur, insan çağrılır, otomatik devam YOK' },
    { id: 'ariza', ad: 'Makine arızası',
      kosul: 'durum=ariza', eylem: 'bakim_ac', seviye: 'kritik',
      aciklama: 'Bakım iş emri açılır; alternatif makine varsa yönlendirilir' },
    { id: 'nabiz_kesildi', ad: 'Makine sinyali kesildi',
      kosul: 'nabiz_yok', eylem: 'insan_cagir', seviye: 'kritik',
      aciklama: 'Sessiz duruş — hattın boşa dönmesini engeller' },
    { id: 'red_orani', ad: 'Hurda oranı eşiği aştı',
      kosul: 'red_orani>5', eylem: 'duraklat', seviye: 'kritik',
      aciklama: 'Süreç kaymış olabilir. Duraklamak, 400 hatalı parça üretmekten ucuzdur' },
    { id: 'olcum_disi', ad: 'Ölçüm tolerans dışı',
      kosul: 'olcum_tolerans_disi', eylem: 'izole', seviye: 'onemli',
      aciklama: 'Parça karantinaya alınır, üretim sürer; art arda 3 olursa duraklat' },
    { id: 'malzeme_bekle', ad: 'Malzeme bekleniyor',
      kosul: 'durum=bekliyor>10dk', eylem: 'insan_cagir', seviye: 'onemli',
      aciklama: 'Besleme sistemi tıkanmış olabilir' },
    { id: 'cikis_tikandi', ad: 'Çıkış konveyörü tıkandı',
      kosul: 'durum=tikandi>5dk', eylem: 'hat_durdur', seviye: 'kritik',
      aciklama: 'Birikme fiziksel hasara yol açabilir' },
    { id: 'program_uyusmaz', ad: 'Yüklenen program iş emriyle uyuşmuyor',
      kosul: 'program_farkli', eylem: 'duraklat', seviye: 'kritik',
      aciklama: 'Yanlış program = yanlış parça. Otomatik düzeltme YAPILMAZ, insan onaylar' }
  ];

  // ── OLAY İŞLEME ──────────────────────────────────────────────────────────
  // Gelen olayı doğrular, durumu günceller, tetiklenen kuralları döndürür.
  // Bu fonksiyon SAF'tır (yan etkisiz) — kaydetme çağıranın işidir. Böylece
  // test edilebilir ve olay tekrar oynatılabilir (replay).
  function olayIsle(makine, olay, kurallar, secenek) {
    const ay = secenek || {};
    const simdi = ay.simdi || Date.now();
    const sonuc = {
      kabul: true, hatalar: [], tetiklenen: [],
      yeniDurum: makine.durum, sayaclar: {}, eylemler: []
    };

    if (!olay || !olay.tip || !OLAY_TIPLERI[olay.tip]) {
      sonuc.kabul = false;
      sonuc.hatalar.push('Bilinmeyen olay tipi: ' + ((olay && olay.tip) || '—'));
      return sonuc;
    }

    // Durum değişimi
    if (olay.tip === 'durum') {
      const g = gecisGecerli(makine.durum || 'kapali', olay.durum);
      if (!g.ok) {
        sonuc.kabul = false;
        sonuc.hatalar.push(g.hata);
        // Geçersiz geçiş bir SORUN İŞARETİDİR — yutulmaz, yükseltilir
        sonuc.tetiklenen.push({
          kuralId: 'gecersiz_gecis', ad: 'Beklenmedik makine sinyali',
          eylem: 'insan_cagir', seviye: 'onemli', detay: g.hata
        });
        return sonuc;
      }
      sonuc.yeniDurum = olay.durum;
    }

    // Sayaçlar
    if (olay.tip === 'parca_bitti') sonuc.sayaclar.uretilen = (+olay.adet || 1);
    if (olay.tip === 'parca_red') sonuc.sayaclar.red = (+olay.adet || 1);

    // Kural değerlendirme
    const aktifKurallar = (kurallar && kurallar.length) ? kurallar : VARSAYILAN_KURALLAR;
    const durum = sonuc.yeniDurum;
    const uretilen = (+makine.uretilenToplam || 0) + (sonuc.sayaclar.uretilen || 0);
    const red = (+makine.redToplam || 0) + (sonuc.sayaclar.red || 0);
    const redOrani = (uretilen + red) ? (red / (uretilen + red) * 100) : 0;

    aktifKurallar.forEach(k => {
      if (k.pasif) return;
      let tetiklendi = false, detay = '';
      const kosul = String(k.kosul || '');

      if (kosul === 'durum=' + durum) { tetiklendi = true; detay = durumBilgi(durum).ad; }
      else if (kosul === 'nabiz_yok') {
        const n = nabizDurumu(makine, simdi);
        if (!n.canli) { tetiklendi = true; detay = n.sebep; }
      }
      else if (/^red_orani>(\d+)/.test(kosul)) {
        const esik = +kosul.match(/^red_orani>(\d+)/)[1];
        // Anlamlı örneklem olmadan oran yanıltıcıdır — en az 20 parça beklenir
        if ((uretilen + red) >= 20 && redOrani > esik) {
          tetiklendi = true;
          detay = `Hurda oranı %${redOrani.toFixed(1)} (eşik %${esik}, ${uretilen + red} parçada)`;
        }
      }
      else if (kosul === 'olcum_tolerans_disi' && olay.tip === 'olcum') {
        if (olay.toleransDisi) { tetiklendi = true; detay = 'Ölçüm: ' + (olay.deger ?? '—'); }
      }
      else if (/^durum=(\w+)>(\d+)dk$/.test(kosul)) {
        const m = kosul.match(/^durum=(\w+)>(\d+)dk$/);
        if (durum === m[1] && makine.durumBaslangic) {
          const dk = (simdi - new Date(makine.durumBaslangic).getTime()) / 60000;
          if (dk > +m[2]) { tetiklendi = true; detay = `${Math.round(dk)} dakikadır ${durumBilgi(durum).ad}`; }
        }
      }
      else if (kosul === 'program_farkli' && olay.tip === 'program_yukle') {
        if (olay.beklenenProgram && olay.program !== olay.beklenenProgram) {
          tetiklendi = true;
          detay = `Yüklenen: ${olay.program} · Beklenen: ${olay.beklenenProgram}`;
        }
      }

      if (tetiklendi) {
        sonuc.tetiklenen.push({ kuralId: k.id, ad: k.ad, eylem: k.eylem, seviye: k.seviye, detay });
        if (!sonuc.eylemler.includes(k.eylem)) sonuc.eylemler.push(k.eylem);
      }
    });

    // En yüksek öncelikli seviye
    sonuc.enYuksekSeviye = sonuc.tetiklenen.reduce((en, t) =>
      (SEVIYELER[t.seviye].oncelik > (SEVIYELER[en] ? SEVIYELER[en].oncelik : -1) ? t.seviye : en),
      null);
    sonuc.insanGerekli = sonuc.tetiklenen.some(t => SEVIYELER[t.seviye].bildirim);
    return sonuc;
  }

  // ── OEE HESABI ───────────────────────────────────────────────────────────
  // Karanlık fabrikanın tek gerçek başarı ölçüsü. Üç bileşen:
  //   Kullanılabilirlik × Performans × Kalite
  function oeeHesapla(makine, pencereSn) {
    const p = pencereSn || 86400;   // varsayılan 24 saat
    const calismaSn = +makine.calismaSuresiSn || 0;
    const planliDurusSn = +makine.planliDurusSn || 0;
    const uretilen = +makine.uretilenToplam || 0;
    const red = +makine.redToplam || 0;
    const idealCevrimSn = +makine.idealCevrimSn || 0;

    const planliSure = Math.max(0, p - planliDurusSn);
    const kullanilabilirlik = planliSure ? (calismaSn / planliSure) : 0;
    const performans = (calismaSn && idealCevrimSn)
      ? Math.min(1, (uretilen * idealCevrimSn) / calismaSn) : 0;
    const kalite = (uretilen + red) ? (uretilen / (uretilen + red)) : 0;
    const oee = kullanilabilirlik * performans * kalite;
    return {
      kullanilabilirlik: Math.round(kullanilabilirlik * 1000) / 10,
      performans: Math.round(performans * 1000) / 10,
      kalite: Math.round(kalite * 1000) / 10,
      oee: Math.round(oee * 1000) / 10,
      // Ölçüm için gereken veri eksikse oran yanıltıcıdır
      guvenilir: !!(idealCevrimSn && calismaSn && (uretilen + red) >= 20)
    };
  }

  // ── OLGUNLUK DEĞERLENDİRMESİ ─────────────────────────────────────────────
  // "Karanlık fabrikaya hazır mıyız?" sorusunu ölçülebilir hale getirir.
  const OLGUNLUK_ALANLARI = [
    { id: 'makine_baglanti', ad: 'Makine bağlantısı',
      soru: 'Makineler durumlarını otomatik bildiriyor mu?', agirlik: 25 },
    { id: 'malzeme_besleme', ad: 'Otomatik malzeme besleme',
      soru: 'Hammadde insan olmadan makineye ulaşıyor mu?', agirlik: 20 },
    { id: 'parca_takip', ad: 'Otomatik parça takibi',
      soru: 'Parçalar okutulmadan (RFID/görüntü) izleniyor mu?', agirlik: 15 },
    { id: 'kalite_olcum', ad: 'Otomatik kalite ölçümü',
      soru: 'Ölçüm insansız yapılıp sisteme düşüyor mu?', agirlik: 15 },
    { id: 'tasima', ad: 'Otomatik taşıma (AGV/konveyör)',
      soru: 'İstasyonlar arası taşıma otomatik mi?', agirlik: 10 },
    { id: 'istisna_yonetimi', ad: 'İstisna yönetimi',
      soru: 'Hata durumunda sistem ne yapacağını biliyor mu?', agirlik: 10 },
    { id: 'uzaktan_izleme', ad: 'Uzaktan izleme ve müdahale',
      soru: 'Fabrika dışından izlenip durdurulabiliyor mu?', agirlik: 5 }
  ];

  function olgunlukHesapla(puanlar) {
    // puanlar: { alanId: 0-4 } — 0 yok, 1 kısmi, 2 orta, 3 iyi, 4 tam otonom
    let toplam = 0, agirlikToplam = 0;
    const detay = OLGUNLUK_ALANLARI.map(a => {
      const p = Math.max(0, Math.min(4, +((puanlar || {})[a.id]) || 0));
      toplam += (p / 4) * a.agirlik;
      agirlikToplam += a.agirlik;
      return { ...a, puan: p, yuzde: Math.round(p / 4 * 100) };
    });
    const skor = agirlikToplam ? Math.round(toplam / agirlikToplam * 100) : 0;
    let seviye, aciklama;
    if (skor < 20) { seviye = 'Seviye 0 — Manuel';
      aciklama = 'Üretim tamamen insana bağlı. Önce veri toplama otomatikleşmeli.'; }
    else if (skor < 40) { seviye = 'Seviye 1 — İzlenebilir';
      aciklama = 'Makineler veri veriyor ama kararları insan alıyor.'; }
    else if (skor < 60) { seviye = 'Seviye 2 — Yarı otonom';
      aciklama = 'Rutin kararlar otomatik; istisnalar insana geliyor.'; }
    else if (skor < 80) { seviye = 'Seviye 3 — Vardiyasız';
      aciklama = 'Bir vardiya insansız çalışabilir; kurulum ve istisna insan ister.'; }
    else { seviye = 'Seviye 4 — Karanlık fabrika';
      aciklama = 'Uzun süreli insansız üretim. İnsan yalnızca istisnada devreye girer.'; }
    return { skor, seviye, aciklama, detay };
  }

  return {
    DURUMLAR, GECISLER, OLAY_TIPLERI, EYLEMLER, SEVIYELER,
    VARSAYILAN_KURALLAR, OLGUNLUK_ALANLARI,
    durumBilgi, gecisGecerli, nabizDurumu, olayIsle, oeeHesapla, olgunlukHesapla
  };
})();

if (typeof module !== 'undefined') module.exports = OtomasyonMotor;
