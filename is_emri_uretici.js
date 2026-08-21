// ════════════════════════════════════════════════════════════════════════════
// İŞ EMRİ ÜRETİCİ — teknik resimden FR.29 iş emri formu
// ────────────────────────────────────────────────────────────────────────────
// ÜÇ KAYNAKTAN OKUR:
//   • STEP (AP203/AP214) — en iyisi. Boy/En/Kalınlık geometriden KESİN gelir.
//   • DWG (AutoCAD)      — blok adları ve yazılar okunur, ölçü elle girilir.
//   • PDF teknik resim   — malzeme kodları ve ölçü yazıları metinden çıkarılır.
//
// NEDEN STEP TERCİH EDİLİR: PDF'te ölçüler ayrı yazılar olarak durur; hangi
// ölçünün hangi parçaya ait olduğu ancak konumdan TAHMİN edilir. STEP'te ise
// her parçanın sınır kutusu kesindir — tahmin yoktur.
//
// FORM: DOXA FR.29 (Rev.01, 12.12.2012) sütun yapısına birebir uyar.
// ════════════════════════════════════════════════════════════════════════════
const IsEmriUretici = (() => {

  // Kaba ölçü payı: kesim + kaplama + zımpara payı. Kaplamalı işte her kenardan
  // pay bırakılır; bu değer fabrikaya göre ayarlanabilir olmalıdır.
  const VARSAYILAN_PAY = { kaplamali: 20, duz: 10 };   // mm, TOPLAM (iki kenar)

  // Bant tipi, kalınlığa göre seçilir. Formdaki sağ blok bu hesabı gösterir:
  //   18mm → 0,4x22 veya 2x22   ·   30mm → 0,4x33 / 2x33   ·   8mm → 0,4x22 / 2x22
  const BANT_TABLOSU = [
    { kalinlikMin: 25, ince: '0,4x33', kalin: '2x33', grup: '30mm' },
    { kalinlikMin: 15, ince: '0,4x22', kalin: '2x22', grup: '18mm' },
    { kalinlikMin: 0,  ince: '0,4x22', kalin: '2x22', grup: '8mm'  }
  ];
  const bantGrubu = (k) => (BANT_TABLOSU.find(b => (+k || 0) >= b.kalinlikMin) || BANT_TABLOSU[2]);

  const say = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; };

  // ── MALZEME KODU AYIKLAMA ────────────────────────────────────────────────
  // Teknik resimdeki not satırları şu biçimdedir:
  //   "50.001.008.001.00 8mm ham mdf üzeri"
  //   "çift yüz 99.999.044.01 KAPLAMA FREZE MEŞE 360*22*24"
  //   "50.011.10.014.00 KENAR BANT DOĞAL KAPLAMA 0,6*22 MEŞE FR"
  const KOD_KALIBI = /\b(\d{2}\.\d{3}\.\d{2,3}\.\d{2,3}\.\d{2}|\d{2}\.\d{3}\.\d{2}\.\d{3}\.\d{2}|\d{2}\.\d{2,3}\.\d{2,3}\.\d{2,3})\b/g;

  function malzemeCikar(metinler) {
    const bulunan = new Map();
    (metinler || []).forEach(m => {
      const s = String(m.str || m || '').trim();
      const kodlar = s.match(KOD_KALIBI);
      if (!kodlar) return;
      kodlar.forEach(kod => {
        // Kodun hemen ardındaki açıklama malzemenin adıdır
        const i = s.indexOf(kod);
        const ad = s.slice(i + kod.length).replace(/^[\s:.-]+/, '').trim() || s.trim();
        const mevcut = bulunan.get(kod);
        // Aynı kod farklı satırlarda geçebilir; en uzun açıklama en bilgilendiricidir
        if (!mevcut || ad.length > mevcut.ad.length) {
          bulunan.set(kod, {
            kod, ad,
            tip: /kenar\s*bant/i.test(s) ? 'kenar_bandi'
               : /kaplama/i.test(s) ? 'kaplama'
               : /mdf|suntalam|yonga|plaka/i.test(s) ? 'plaka' : 'diger',
            kalinlik: (s.match(/(\d+(?:[.,]\d+)?)\s*mm/i) || [])[1] || null,
            renk: (s.match(/\b(ME[ŞS]E|CEV[İI]Z|BEYAZ|ANTRAS[İI]T|SİYAH|GRİ|Bİ[Nn]OM|LAM[İI]NANT)[\wçğıöşüÇĞİÖŞÜ ]{0,18}/i) || [])[0] || ''
          });
        }
      });
    });
    return [...bulunan.values()];
  }

  // ── PARÇA ADI VE ADET (PDF açıklama satırlarından) ───────────────────────
  // "So fine 100cm çekmece yan kutu" + "2 adet yapılacak"
  function urunlerCikar(metinler) {
    const urunler = [];
    const liste = (metinler || []).map(m => ({
      s: String(m.str || m || '').trim(),
      x: +(m.x || 0), y: +(m.y || 0)
    })).filter(m => m.s);
    liste.forEach(m => {
      const adet = m.s.match(/^(\d{1,4})\s*adet\s*yap[ıi]lacak/i);
      if (!adet) return;
      // Adet yazısına en yakın "ürün adı" satırı (aynı yükseklikte, solda)
      let en = null, enU = Infinity;
      liste.forEach(k => {
        if (k === m) return;
        if (/adet\s*yap|^\d+$/i.test(k.s)) return;
        if (k.s.length < 6) return;
        const u = Math.abs(k.y - m.y) * 3 + Math.abs(k.x - m.x);
        if (u < enU) { enU = u; en = k; }
      });
      if (en) urunler.push({ ad: en.s, adet: +adet[1] });
    });
    return urunler;
  }

  // ── STEP'TEN SATIR ÜRET (en güvenilir yol) ───────────────────────────────
  function stepDenUret(stepSonuc, geometri, secenek) {
    const ay = secenek || {};
    const pay = ay.kabaPay != null ? +ay.kabaPay : VARSAYILAN_PAY.kaplamali;
    const satirlar = [];
    const parcalar = (geometri && geometri.parcalar) || [];

    // Aynı ad + aynı ölçüdeki parçalar TEK SATIRDA toplanır (adet artar) —
    // iş emrinde 4 ayrı "yan panel" satırı değil, "yan panel ×4" olmalı.
    const harita = new Map();
    parcalar.forEach(p => {
      const o = [...p.olcu].sort((a, b) => b - a);   // boy ≥ en ≥ kalınlık
      const boy = o[0], en = o[1], kalinlik = o[2];
      const anahtar = `${p.ad}|${boy}|${en}|${kalinlik}`;
      const v = harita.get(anahtar) || {
        parcaAdi: p.ad, boy, en, kalinlik, adet: 0
      };
      v.adet++;
      harita.set(anahtar, v);
    });

    [...harita.values()].forEach((v, i) => satirlar.push(satirKur(v, i + 1, pay, ay)));
    return satirlar;
  }

  function satirKur(v, sira, pay, ay) {
    const b = bantGrubu(v.kalinlik);
    const kabaBoy = v.boy + pay, kabaEn = v.en + pay;
    const netM2 = (v.boy * v.en) / 1e6;
    return {
      paketNo: ay.paketNo || '',
      paketAdedi: ay.paketAdedi || 1,
      parcaKodu: v.parcaKodu || '',
      // Hammadde/hırdavat/kenar bandı/yarı mamül kartına bağlantı — kod eşleşince
      // veya kullanıcı elle kart seçince doldurulur (page_is_emri_formu.js).
      parcaKartId: null, parcaKartTipi: '',
      parcaAdi: v.parcaAdi,
      // Bu parçanın kesildiği plaka hammadde kartı (tip:'plaka') — ayrı bir
      // bağlantı, parcaKodu'ndan bağımsız: parça kendi kodunu taşıyabilir,
      // ama hangi plakadan kesildiği ayrıca izlenir.
      plakaKartId: null, plakaKodu: '',
      kalinlik: v.kalinlik,
      renk: ay.renk || '',
      netAdet: v.adet, netBoy: v.boy, netEn: v.en,
      kabaAdet: v.adet, kabaBoy, kabaEn,
      uretimMiktari: v.adet * (+ay.paketAdedi || 1),
      yariMamul: '', yatar: '', mHiz: '',
      // Bant sütunları: hangi kenara hangi bant — varsayılan boş, kullanıcı doldurur.
      // bandKartId/bandKodu: o kenar grubunda kullanılan kenar bandı (tip:'kenar_bandi')
      // hammadde kartına bağlantı — DÜZ kenarda bant olmadığından bağlantı taşımaz.
      pvc2: { boy: '', en: '', bandKartId: null, bandKodu: '' },
      pvc1: { boy: '', en: '', bandKartId: null, bandKodu: '' },
      pvc040: { boy: '', en: '', bandKartId: null, bandKodu: '' },
      soft: { boy: '', en: '', bandKartId: null, bandKodu: '' },
      duz: { boy: '', en: '' },
      aciklamalar: v.aciklama || '',
      // Sağ blok hesapları
      birimM2: Math.round(netM2 * 1000) / 1000,
      toplamM2: Math.round(netM2 * v.adet * 1000) / 1000,
      bantGrup: b.grup, bantInce: b.ince, bantKalin: b.kalin,
      bantInceMt: 0, bantKalinMt: 0,
      sira
    };
  }

  // ── KENAR BANDI HESABI ───────────────────────────────────────────────────
  // Kullanıcı hangi kenara bant geleceğini işaretler; metraj buradan çıkar.
  // Boy kenarı 2 adet, en kenarı 2 adet varsayılır (tam çevre bantlıysa).
  function bantHesapla(satir) {
    const b = (x) => (x === '' || x == null) ? 0 : (+x || 0);
    const boyKenar = b(satir.pvc2.boy) + b(satir.pvc1.boy) + b(satir.pvc040.boy)
                   + b(satir.soft.boy) + b(satir.duz.boy);
    const enKenar = b(satir.pvc2.en) + b(satir.pvc1.en) + b(satir.pvc040.en)
                  + b(satir.soft.en) + b(satir.duz.en);
    // Metraj: (kenar sayısı × kenar uzunluğu × parça adedi) / 1000
    const mt = (boyKenar * satir.netBoy + enKenar * satir.netEn) * satir.netAdet / 1000;
    return Math.round(mt * 100) / 100;
  }

  // ── PDF'TEN ÜRET ─────────────────────────────────────────────────────────
  // Ölçüler PDF'te bağımsız yazılar hâlindedir; hangi parçaya ait olduğu
  // KESİN bilinemez. Bu yüzden ölçü sütunları BOŞ bırakılır ve kullanıcıdan
  // istenir. Yanlış ölçüyle iş emri açmak, boş bırakmaktan çok daha pahalıdır.
  function pdfDenUret(metinler, secenek) {
    const ay = secenek || {};
    const malzemeler = malzemeCikar(metinler);
    const urunler = urunlerCikar(metinler);
    // Ölçü adayları: plandaki sayı yazıları (bilgi amaçlı listelenir)
    const olcuAdaylari = [...new Set((metinler || [])
      .map(m => String(m.str || m || '').trim())
      .filter(s => /^\d{2,4}$/.test(s))
      .map(Number))].sort((a, b) => b - a);

    const satirlar = [];
    const plakalar = malzemeler.filter(m => m.tip === 'plaka' || m.tip === 'kaplama');
    (urunler.length ? urunler : [{ ad: ay.urunAdi || 'Ürün', adet: 1 }]).forEach((u, i) => {
      const p = plakalar[0];
      satirlar.push(satirKur({
        parcaAdi: u.ad,
        parcaKodu: p ? p.kod : '',
        boy: 0, en: 0,
        kalinlik: p && p.kalinlik ? +p.kalinlik : 0,
        adet: u.adet,
        aciklama: p ? p.ad : ''
      }, i + 1, ay.kabaPay != null ? +ay.kabaPay : VARSAYILAN_PAY.kaplamali, ay));
    });
    return {
      satirlar, malzemeler, urunler, olcuAdaylari,
      uyari: 'PDF\'ten ölçüler parçalara KESİN eşlenemez — Boy/En sütunlarını ' +
        'doldurun. Plandaki ölçü yazıları aşağıda listelenmiştir.'
    };
  }

  // ── ÖZET (formun sağ bloğu) ──────────────────────────────────────────────
  function ozet(satirlar) {
    const gruplar = {};
    let toplamM2 = 0;
    (satirlar || []).forEach(s => {
      toplamM2 += (+s.toplamM2 || 0);
      const g = s.bantGrup || '8mm';
      if (!gruplar[g]) gruplar[g] = { grup: g, ince: 0, kalin: 0, m2: 0, satir: 0 };
      gruplar[g].ince += (+s.bantInceMt || 0);
      gruplar[g].kalin += (+s.bantKalinMt || 0);
      gruplar[g].m2 += (+s.toplamM2 || 0);
      gruplar[g].satir++;
    });
    return {
      toplamM2: Math.round(toplamM2 * 1000) / 1000,
      satirSayisi: (satirlar || []).length,
      toplamParca: (satirlar || []).reduce((a, s) => a + (+s.uretimMiktari || 0), 0),
      gruplar: Object.values(gruplar)
    };
  }

  function isEmriKodu() {
    const d = new Date();
    return 'IE-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0') + '-' + Date.now().toString(36).slice(-4).toUpperCase();
  }

  return {
    VARSAYILAN_PAY, BANT_TABLOSU, bantGrubu,
    malzemeCikar, urunlerCikar, stepDenUret, pdfDenUret,
    satirKur, bantHesapla, ozet, isEmriKodu
  };
})();

if (typeof module !== 'undefined') module.exports = IsEmriUretici;
