// ════════════════════════════════════════════════════════════════════════════
// MİMARİ PLAN OKUYUCU — PDF'ten Mahal Listesi Çıkarımı
// ────────────────────────────────────────────────────────────────────────────
// NASIL ÇALIŞIR:
// Mimari planlarda mahaller LEJANTTA tanımlı renklerle boyanır. Bu motor
// PDF'in çizim komutlarını okur, dolgu renklerini ve boyanmış alanları çıkarır,
// her rengin plandaki alan sayısını verir.
//
// GERÇEK DOSYAYLA DOĞRULANDI (NBK 10. kat planı):
//   14 farklı dolgu rengi bulundu · lejanttaki 13 mahal tipiyle örtüştü
//
// NE OTOMATİK, NE DEĞİL — dürüst sınır:
//   ✅ Renkler, alan sayıları ve alan büyüklükleri OTOMATİK
//   ✅ Lejant bölgesi ve renk kutucukları OTOMATİK bulunur
//   ❌ Mahal ADLARI çoğu planda metin değil, VEKTÖR ÇİZİMDİR (yazı outline'a
//      çevrilmiş). Bu dosyada da öyle: 2384×1684 sayfada yalnızca 29 metin
//      nesnesi var, lejant yazıları yok. Bu yüzden adlar kullanıcıdan alınır —
//      lejant görüntüsü yanında gösterilir, bir kez yazılır.
//
// Ad tahmini uydurmak yerine sormayı seçtim: yanlış mahal adı, yanlış teklif
// ve yanlış üretim demektir.
// ════════════════════════════════════════════════════════════════════════════
const PlanOkuyucu = (() => {

  let _pdfjsHazir = false;

  // PDF.js'i yükle (yerel dosyadan; CDN'e bağımlı değil)
  async function pdfjsYukle() {
    if (_pdfjsHazir && window.pdfjsLib) return window.pdfjsLib;
    if (!window.pdfjsLib) {
      await new Promise((cz, rd) => {
        const s = document.createElement('script');
        s.src = 'pdf.min.js';
        s.onload = cz; s.onerror = () => rd(new Error('PDF motoru (pdf.min.js) yüklenemedi.'));
        document.head.appendChild(s);
      });
    }
    // Worker yalnızca tarayıcıda ve henüz ayarlanmamışsa kurulur
    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions
        && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
    }
    _pdfjsHazir = true;
    return window.pdfjsLib;
  }

  // PDF.js renkleri 0-255 aralığında ve bazen DİZİ yerine NESNE olarak verir
  // ({0:246,1:223,2:208}). Her iki biçimi de güvenle okuyalım.
  function renkNormalle(a) {
    if (!a) return null;
    const r = [a[0], a[1], a[2]].map(v => {
      const n = +v;
      if (!isFinite(n)) return null;
      return n <= 1.0001 ? Math.round(n * 255) : Math.round(n);   // 0-1 veya 0-255
    });
    return r.every(v => v !== null && v >= 0 && v <= 255) ? r : null;
  }
  const renkAnahtar = (a) => a.join(',');
  const renkCss = (a) => 'rgb(' + a.join(',') + ')';

  // ── ANA ÇÖZÜMLEME ────────────────────────────────────────────────────────
  async function coz(dosya, sayfaNo) {
    const pdfjs = await pdfjsYukle();
    const buf = await dosya.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const sayfa = await doc.getPage(sayfaNo || 1);
    const vp = sayfa.getViewport({ scale: 1 });
    const ops = await sayfa.getOperatorList();
    const OPS = pdfjs.OPS;

    // 1) Boyalı şekilleri topla: renk + konum + alan
    const sekiller = [];
    let aktifRenk = null;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], arg = ops.argsArray[i];
      if (fn === OPS.setFillRGBColor) { aktifRenk = renkNormalle(arg); continue; }
      if (fn !== OPS.constructPath || !aktifRenk) continue;
      const kutu = yolSiniri(arg);
      if (!kutu) continue;
      sekiller.push({
        renk: aktifRenk.slice(), anahtar: renkAnahtar(aktifRenk),
        x: kutu.x0, y: kutu.y0, w: kutu.x1 - kutu.x0, h: kutu.y1 - kutu.y0
      });
    }

    // 2) Lejant kutucuklarını bul: küçük, kare, dikey sıralı, farklı renkli
    // Lejant kutucuğu: kareye yakın, sayfa genişliğinin %0.2–%2'si kadar.
    // Sabit piksel eşiği kullanmıyoruz — PDF'ler farklı ölçeklerde üretilir
    // ve bu dosyada koordinatlar sayfa biriminin ~7 katı ölçekte geliyor.
    const tumG = sekiller.map(x => x.w).filter(x => x > 0).sort((a, b) => a - b);
    const enBuyuk = tumG.length ? tumG[tumG.length - 1] : 1;
    const altSinir = enBuyuk * 0.002, ustSinir = enBuyuk * 0.05;
    const kareler = sekiller.filter(s =>
      s.w > altSinir && s.w < ustSinir && s.h > altSinir && s.h < ustSinir
      && Math.abs(s.w - s.h) < Math.max(s.w, s.h) * 0.45);
    const lejant = lejantBul(kareler);

    // 3) Plandaki alanları say (lejant bölgesi hariç, üst üste binenler tekil)
    const sayim = new Map();
    const gorulen = new Set();
    sekiller.forEach(s => {
      const alan = s.w * s.h;
      if (alan < 300) return;                                  // çizgi/tarama artığı
      if (lejant.bolge && iceriyor(lejant.bolge, s)) return;   // lejant kutusu
      // Bir oda birden çok çokgenden oluşabilir; ızgara ile tekilleştir
      const yer = s.anahtar + ':' + Math.round(s.x / 40) + ':' + Math.round(s.y / 40);
      if (gorulen.has(yer)) return;
      gorulen.add(yer);
      if (griTonuMu(s.renk)) return;              // duvar, gölge, tarama
      const k = sayim.get(s.anahtar) || { renk: s.renk, adet: 0, alan: 0 };
      k.adet++; k.alan += alan;
      sayim.set(s.anahtar, k);
    });

    // 4) Lejant sırasıyla eşleştir; lejantta olmayan renkler sona
    const sonuc = [];
    lejant.renkler.forEach((r, i) => {
      const k = sayim.get(r.anahtar);
      if (!k) return;
      sonuc.push({
        anahtar: r.anahtar, renk: r.renk, css: renkCss(r.renk),
        sira: i + 1, adet: k.adet, alan: Math.round(k.alan), lejantta: true, ad: ''
      });
    });
    sayim.forEach((k, anahtar) => {
      if (sonuc.some(s => s.anahtar === anahtar)) return;
      if (k.adet < 2) return;                     // tek parça: muhtemelen artık
      if (griTonuMu(k.renk)) return;              // gri/siyah: çizgi, duvar, gölge
      sonuc.push({
        anahtar, renk: k.renk, css: renkCss(k.renk),
        sira: 999, adet: k.adet, alan: Math.round(k.alan), lejantta: false, ad: ''
      });
    });
    sonuc.sort((a, b) => a.sira - b.sira || b.adet - a.adet);

    return {
      sayfaSayisi: doc.numPages,
      genislik: Math.round(vp.width), yukseklik: Math.round(vp.height),
      lejantBolge: lejant.bolge,
      mahaller: sonuc,
      _doc: doc, _sayfa: sayfa
    };
  }

  // constructPath argümanlarından sınır kutusu çıkar.
  // PDF.js yapısı: arg = [opKodlari, koordinatlar, sinirKutusu]
  // Üçüncü öğe HAZIR sınır kutusudur: [x0, x1, y0, y1] (x'ler ve y'ler ayrı!)
  // Bu doğrudan kullanılır; yoksa koordinatlardan hesaplanır.
  function yolSiniri(arg) {
    if (!Array.isArray(arg)) return null;
    const sk = arg[2];
    if (sk && sk.length === 4) {
      const x0 = Math.min(sk[0], sk[1]), x1 = Math.max(sk[0], sk[1]);
      const y0 = Math.min(sk[2], sk[3]), y1 = Math.max(sk[2], sk[3]);
      if (isFinite(x0) && isFinite(y0)) return { x0, y0, x1, y1 };
    }
    // Yedek: koordinat listesinden hesapla
    const koord = arg[1];
    if (!koord || koord.length < 4) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < koord.length; i += 2) {
      const x = koord[i], y = koord[i + 1];
      if (!isFinite(x) || !isFinite(y)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!isFinite(x0) || !isFinite(y0)) return null;
    return { x0, y0, x1, y1 };
  }

  // Lejant: aynı x'te dikey dizilmiş, RENKLİ (gri olmayan), birbirinden farklı
  // renkte küçük kareler. Gri/siyah kareler duvar, tarama ve çizgi artığıdır;
  // bunlar lejant sanılırsa mahal sıralaması tamamen bozulur.
  function lejantBul(kareler) {
    const renkli = kareler.filter(k => !griTonuMu(k.renk));
    if (renkli.length < 3) return { bolge: null, renkler: [] };
    const sutunlar = new Map();
    renkli.forEach(k => {
      const sx = Math.round(k.x / 25);
      if (!sutunlar.has(sx)) sutunlar.set(sx, []);
      sutunlar.get(sx).push(k);
    });
    let enIyi = null;
    sutunlar.forEach(liste => {
      const farkli = new Set(liste.map(x => x.anahtar));
      if (farkli.size < 3) return;
      if (!enIyi || farkli.size > enIyi.farkli) enIyi = { liste, farkli: farkli.size };
    });
    if (!enIyi) return { bolge: null, renkler: [] };
    const l = [...enIyi.liste].sort((a, b) => b.y - a.y);   // PDF y ekseni ters
    const gorulen = new Set(); const renkler = [];
    l.forEach(k => {
      if (gorulen.has(k.anahtar)) return;
      gorulen.add(k.anahtar);
      renkler.push({ anahtar: k.anahtar, renk: k.renk, y: k.y });
    });
    const xs = l.map(k => k.x), ys = l.map(k => k.y);
    const genislik = Math.max(...l.map(k => k.w));
    return {
      bolge: {
        x0: Math.min(...xs) - genislik, y0: Math.min(...ys) - genislik,
        x1: Math.max(...xs) + genislik * 25, y1: Math.max(...ys) + genislik * 2
      },
      renkler
    };
  }

  const iceriyor = (b, s) => s.x >= b.x0 && s.x <= b.x1 && s.y >= b.y0 && s.y <= b.y1;
  const griTonuMu = (r) => {
    const [a, b, c] = r;
    return Math.abs(a - b) < 12 && Math.abs(b - c) < 12;
  };

  // Lejant bölgesini görüntü olarak çiz — kullanıcı adları buradan okuyup yazar
  async function lejantGoruntusu(sonuc, olcek) {
    if (!sonuc || !sonuc._sayfa || !sonuc.lejantBolge) return null;
    const s = olcek || 3;
    const b = sonuc.lejantBolge;
    const vp = sonuc._sayfa.getViewport({ scale: s });
    const cv = document.createElement('canvas');
    cv.width = Math.min(1400, Math.round((b.x1 - b.x0) * s));
    cv.height = Math.min(1400, Math.round((b.y1 - b.y0) * s));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    // PDF y ekseni ters: dönüşümü buna göre kaydır
    ctx.translate(-b.x0 * s, -(vp.height - b.y1 * s));
    await sonuc._sayfa.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv.toDataURL('image/png');
  }


  // ══════════════════════════════════════════════════════════════════════════
  // METİN MODU — plandaki YAZILI mahal adlarını okur
  // ────────────────────────────────────────────────────────────────────────────
  // Bazı planlar renk kodlu değildir; mahaller doğrudan yazıyla belirtilir
  // (MUTFAK, WC, KORİDOR…). Bu mod o yazıları bulur ve aynı adın kaç kez
  // geçtiğini sayar — "WC" iki yerde yazılıysa 2 adet demektir.
  //
  // ÖLÇÜ AYIRIMI: Planlarda çok sayıda ölçü yazısı vardır (135, 90/200, 1725).
  // Bunlar mahal DEĞİLDİR. Ayrım kuralı: mahal adı HARF içerir, ölçü içermez.
  // ══════════════════════════════════════════════════════════════════════════
  const OLCU_KALIBI = /^[\d\s.,\/x×*+\-()]+$/;          // yalnız rakam ve ayraç
  const BASLIK_SOZCUK = /(PLAN|PROJE|ÖLÇEK|OLCEK|SCALE|KAT YÜKSEK|REVIZ|REVİZ|TARİH|TARIH|ÇİZEN|CIZEN|KONTROL|NOT|LEGEND|LEJANT|DRAWING|SHEET|CLIENT|PROJECT)/i;

  function mahalAdiMi(metin, yaziYuksekligi, ortalamaYukseklik) {
    const s = String(metin || '').trim();
    // Mahal adları KISADIR (WC, MUTFAK, TOPLANTI SALONU). Uzun metinler genel
    // not, şartname veya açıklamadır — mahal sanılırsa liste çöple dolar.
    if (s.length < 2 || s.length > 28) return false;
    if (s.split(/\s+/).length > 4) return false;          // 4 kelimeden uzun = cümle
    if (/[.;:]$|^[-–—•]/.test(s)) return false;            // cümle sonu / madde işareti
    if (/\b(SHALL|MUST|REFER|ASSUME|NOTE|UNLESS|WITH|AND|THE|FOR|ALL|TO BE)\b/i.test(s)) return false;
    // Teknik/şartname fiilleri: mahal adları isimdir, eylem bildirmez
    if (/\b(ABSORB|VERIFY|SUBMIT|PROVIDE|INSTALL|COMPLY|INDICATED|SPECIFIED|APPROVED|REQUIRED|CARRIED|LOCATED)\b/i.test(s)) return false;
    if (/±|=|%/.test(s)) return false;                     // teknik not
    if (OLCU_KALIBI.test(s)) return false;                 // saf ölçü
    if (!/[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(s)) return false; // harf yoksa mahal değil
    if (BASLIK_SOZCUK.test(s)) return false;               // antet/başlık yazısı
    // Ölçü + birim karışımı ("350 cm", "12 m2") mahal değildir
    if (/^\d+[\d\s.,\/]*\s*(cm|mm|m2|m²|m|adet|ad)\.?$/i.test(s)) return false;
    // Aşırı büyük yazı = çizim başlığı (mahal adları gövde boyutundadır)
    if (ortalamaYukseklik && yaziYuksekligi > ortalamaYukseklik * 2.2) return false;
    return true;
  }

  async function metindenCoz(dosya, sayfaNo) {
    const pdfjs = await pdfjsYukle();
    const buf = await dosya.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const sayfa = await doc.getPage(sayfaNo || 1);
    const tc = await sayfa.getTextContent();

    // Yazı yüksekliklerinin ortancası: başlık ayıklamak için ölçek referansı
    const yuk = tc.items.map(i => Math.abs(i.transform[3])).filter(h => h > 0).sort((a, b) => a - b);
    const ortanca = yuk.length ? yuk[Math.floor(yuk.length / 2)] : 0;

    const bulunan = new Map();
    tc.items.forEach(i => {
      const ham = (i.str || '').trim();
      const h = Math.abs(i.transform[3]);
      if (!mahalAdiMi(ham, h, ortanca)) return;
      // Aynı ad farklı yazımlarda olabilir; büyük harfe normalle
      const ad = ham.replace(/\s+/g, ' ').trim();
      const anahtar = ad.toLocaleUpperCase('tr');
      const k = bulunan.get(anahtar) || { ad, adet: 0, konumlar: [] };
      k.adet++;
      k.konumlar.push({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) });
      bulunan.set(anahtar, k);
    });

    const mahaller = [...bulunan.values()]
      .sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, 'tr'));
    return {
      kaynak: 'metin',
      sayfaSayisi: doc.numPages,
      metinSayisi: tc.items.length,
      mahaller
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // MAHAL BAZLI KEŞİF — detayları ait oldukları mahale atar
  // ────────────────────────────────────────────────────────────────────────────
  // Mimari planda her mahalin içinde/çevresinde o mahale ait detaylar yazılıdır:
  // kapı tipi (LK1 110/220), duvar koruma bandı, küpeşte, askılık, kaplama
  // tarifleri... Keşif yapan mimar bunları mahal mahal gruplar.
  //
  // YÖNTEM: Her detay yazısı, kendisine EN YAKIN mahal etiketine atanır
  // (öklit uzaklığı). Uzaklık eşiği aşılırsa atanmaz — plan kenarındaki genel
  // notlar rastgele bir mahale yapışmasın diye.
  //
  // SINIR: Bu mekânsal bir tahmindir, oda sınırı analizi değil. Bitişik iki
  // mahalin arasındaki bir detay yanlış tarafa düşebilir. Bu yüzden sonuç
  // "keşif taslağı" olarak sunulur ve düzenlenebilir — mimar onaylamadan
  // hakedişe esas alınmamalıdır.
  // ══════════════════════════════════════════════════════════════════════════
  const DETAY_SINIFLARI = [
    // Kapı: "LK1 110/220" (etiketli) veya sade "90/200" (AutoCAD'de yaygın).
    // Sade biçim ölçü yazısına benzer; bu yüzden makul kapı ölçüsü aralığıyla
    // sınırlanır (genişlik 60-160 cm, yükseklik 190-260 cm).
    { ad: 'Kapı', kalip: /^(LK|SK|YDK|ALCK|KP)\d?\s*\d{2,3}\s*\/\s*\d{2,3}$|^(6\d|[7-9]\d|1[0-6]\d)\s*\/\s*(19\d|2[0-6]\d)$|kompakt kapı|menfezli demir kapı|alüminyum doğrama kapı/i, birim: 'ADET' },
    { ad: 'Duvar koruma bandı', kalip: /duvar koruma band/i, birim: 'MT' },
    { ad: 'Küpeşte / korkuluk', kalip: /küpeşte|korkuluk/i, birim: 'MT' },
    { ad: 'Askılık', kalip: /askılık/i, birim: 'ADET' },
    { ad: 'Lavabo / tezgah / banko', kalip: /lavabo|tezgah|banko|hilton/i, birim: 'ADET' },
    { ad: 'Dolap / mobilya', kalip: /dolab[ıi]|mutfak dolab|gardırop|vestiyer|kitaplık/i, birim: 'ADET' },
    { ad: 'Döşeme kaplaması', kalip: /^DÖŞEME\s*KAP/i, birim: 'M2' },
    { ad: 'Duvar kaplaması', kalip: /^DUVAR\s*KAPL/i, birim: 'M2' },
    { ad: 'Tavan kaplaması', kalip: /^TAVAN\s*KAPL/i, birim: 'M2' },
    { ad: 'Süpürgelik', kalip: /süpürgelik/i, birim: 'MT' },
    { ad: 'Merdiven basamağı', kalip: /^MERD\.\s*BAS/i, birim: 'M2' },
    { ad: 'Akustik panel', kalip: /akustik panel|akustik kumaş/i, birim: 'M2' },
    { ad: 'Cam / doğrama', kalip: /alüminyum doğrama|pvc\s*\d|vasistas|cam tuğla/i, birim: 'M2' }
  ];

  // Mahal etiketi: BÜYÜK HARFLE yazılmış kısa ad. Türk mimari çiziminde
  // mahal adları büyük harfle, açıklamalar normal yazılır — bu ayrımı kullanırız.
  // Mahal etiketi: BÜYÜK harfli kısa ad. En az 2 karakter — "WC" gibi yaygın
  // kısaltmalar mimari planlarda tek başına mahal adıdır ve elenmemeli.
  const MAHAL_ETIKET = /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ0-9\s.\-]{1,28}$/;
  // Mahal gibi görünen ama mahal OLMAYAN etiketler (malzeme/uyarı yazıları)
  const MAHAL_DEGIL = /KAPLAMA|KİREMİT|GALERİ BOŞ|ÖZEL-|DETAY|EĞİM|BRÜT|KOTU|PLANI|AMAÇLI|YANACAK|OLACAK|UYGULANACAK|BAKINIZ|^[A-ZÇĞİÖŞÜ]$/i;

  // Alan bilgisi: "55.00 m²" biçimindeki yazılar mahale ait metrekaredir
  const ALAN_KALIBI = /^([\d.,]+)\s*m²$/i;

  // DWG ve PDF için ORTAK keşif çekirdeği. Girdi: {str, x, y} listesi.
  // İki kaynak da aynı mantıkla işlenir — mahal/detay ayrımı ve mekânsal
  // atama tek yerde tanımlıdır, kaynak başına kopyalanmaz.
  function kesifCekirdek(metinler, secenek) {
    const ayar = secenek || {};
    const esik = ayar.uzaklikEsigi || 400;

    const mahaller = [], detaylar = [], alanlar = [];
    (metinler || []).forEach(i => {
      const s = (i.str || '').trim();
      if (s.length < 2) return;
      const x = +i.x || 0, y = +i.y || 0;
      const alanE = s.match(ALAN_KALIBI);
      if (alanE) { alanlar.push({ m2: parseFloat(alanE[1].replace(',', '.')), x, y }); return; }
      if (MAHAL_ETIKET.test(s) && !/^\d/.test(s) && !MAHAL_DEGIL.test(s)) {
        mahaller.push({ ad: s, x, y, detaylar: [], m2: null });
        return;
      }
      const sf = DETAY_SINIFLARI.find(c => c.kalip.test(s));
      if (sf) detaylar.push({ metin: s, x, y, sinif: sf.ad, birim: sf.birim });
    });

    const enYakin = (nesne, liste) => {
      let en = null, enU = Infinity;
      liste.forEach(m => {
        const u = Math.hypot(m.x - nesne.x, m.y - nesne.y);
        if (u < enU) { enU = u; en = m; }
      });
      return { mahal: en, uzaklik: enU };
    };

    // Alanları mahallere ata (her mahal en yakın alan yazısını alır)
    alanlar.forEach(a => {
      const { mahal, uzaklik } = enYakin(a, mahaller);
      if (mahal && uzaklik < 200 && mahal.m2 == null) mahal.m2 = a.m2;
    });

    // Detayları mahallere ata
    let atanmayan = 0;
    detaylar.forEach(d => {
      const { mahal, uzaklik } = enYakin(d, mahaller);
      if (!mahal || uzaklik > esik) { atanmayan++; return; }
      const v = mahal.detaylar.find(x => x.sinif === d.sinif);
      if (v) { v.adet++; if (!v.ornekler.includes(d.metin) && v.ornekler.length < 3) v.ornekler.push(d.metin); }
      else mahal.detaylar.push({ sinif: d.sinif, birim: d.birim, adet: 1, ornekler: [d.metin] });
    });

    // Aynı adlı mahalleri BİRLEŞTİR: "DERSLİK" 10 kez geçiyorsa 10 adet demektir.
    // Detaylar toplanır, m² ortalaması alınır (dersliklerin hepsi 55 m² gibi).
    const grup = new Map();
    mahaller.forEach(m => {
      const k = m.ad.toLocaleUpperCase('tr');
      const g = grup.get(k) || { ad: m.ad, adet: 0, m2Toplam: 0, m2Adet: 0, detaylar: new Map() };
      g.adet++;
      if (m.m2) { g.m2Toplam += m.m2; g.m2Adet++; }
      m.detaylar.forEach(d => {
        const v = g.detaylar.get(d.sinif) || { sinif: d.sinif, birim: d.birim, adet: 0, ornekler: [] };
        v.adet += d.adet;
        d.ornekler.forEach(o => { if (!v.ornekler.includes(o) && v.ornekler.length < 3) v.ornekler.push(o); });
        g.detaylar.set(d.sinif, v);
      });
      grup.set(k, g);
    });

    const sonuc = [...grup.values()].map(g => ({
      ad: g.ad, adet: g.adet,
      birimM2: g.m2Adet ? Math.round(g.m2Toplam / g.m2Adet * 100) / 100 : null,
      toplamM2: g.m2Adet ? Math.round(g.m2Toplam * 100) / 100 : null,
      detaylar: [...g.detaylar.values()].sort((a, b) => b.adet - a.adet)
    })).sort((a, b) => b.adet - a.adet || b.detaylar.length - a.detaylar.length);

    return {
      kaynak: 'kesif',
      // Blok (tefriş) ataması için ham mahal konumları da döner
      mahalKonumlari: mahaller.map(m => ({ ad: m.ad, x: m.x, y: m.y })),
      metinSayisi: (metinler || []).length,
      mahaller: sonuc,
      atanmayanDetay: atanmayan,
      toplamDetay: detaylar.length
    };
  }

  // PDF'ten keşif
  async function kesifCikar(dosya, sayfaNo, secenek) {
    const pdfjs = await pdfjsYukle();
    const buf = await dosya.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const sayfa = await doc.getPage(sayfaNo || 1);
    const tc = await sayfa.getTextContent();
    const metinler = tc.items.map(i => ({
      str: i.str, x: i.transform[4], y: i.transform[5]
    }));
    return kesifCekirdek(metinler, secenek);
  }

  // DWG'den keşif — aynı çekirdek, farklı kaynak
  async function dwgKesif(dosya, secenek, ilerleme) {
    if (typeof DwgOkuyucu === 'undefined') {
      throw new Error('DWG okuyucu modülü yüklenmemiş.');
    }
    const d = await DwgOkuyucu.metinleriCikar(dosya, ilerleme);
    const sonuc = kesifCekirdek(d.metinler, secenek);
    sonuc.kaynak = 'dwg';
    sonuc.dwgSurum = d.surum;
    sonuc.varlikSayisi = d.varlikSayisi;
    // TEFRİŞ: DWG blokları (mobilya/donatı sembolleri) mahallere atanır.
    // Bu bilgi PDF'te YOKTUR — DWG'nin asıl üstünlüğü budur.
    if (d.bloklar && d.bloklar.length) {
      bloklariMahallereAta(sonuc, d.bloklar, sonuc.mahalKonumlari,
        (secenek && secenek.uzaklikEsigi) || 400);
    }
    return sonuc;
  }


  // ══════════════════════════════════════════════════════════════════════════
  // TEFRİŞ YORUMLAMA — çizimdeki isimsiz semboller ne olabilir?
  // ────────────────────────────────────────────────────────────────────────────
  // Mimari planlarda mobilya/donatı sembolleri planda YAZILI değildir; DWG'de
  // blok adı olarak durur ("120 etajerli masa", "WC3", "LAV"). Bu adlar kısaltma
  // ve firma içi kodlamalarla doludur. Aşağıdaki sözlük onları mimari karşılığa
  // çevirir ve keşif kalemi olarak mahale ekler.
  //
  // DÜRÜST SINIR: Bu bir YORUMDUR, kesin bilgi değil. "NVBNY" gibi anlamsız
  // kodlar çözülemez ve olduğu gibi "tanımsız blok" olarak listelenir —
  // uydurma bir isim vermek yanlış keşif üretir. Kullanıcı düzenleyebilir.
  // ══════════════════════════════════════════════════════════════════════════
  const BLOK_SOZLUGU = [
    { kalip: /kloz|wc\d|klozet|toilet|w\.?c\b/i, ad: 'Klozet', birim: 'ADET' },
    { kalip: /^lav|lavabo|washbasin|hilton/i, ad: 'Lavabo', birim: 'ADET' },
    { kalip: /pisuar|urinal/i, ad: 'Pisuar', birim: 'ADET' },
    { kalip: /dus|shower/i, ad: 'Duş', birim: 'ADET' },
    { kalip: /door|kapi|kapı/i, ad: 'Kapı', birim: 'ADET' },
    { kalip: /window|pencere|cam\b/i, ad: 'Pencere', birim: 'ADET' },
    { kalip: /masa|desk|table|etajer/i, ad: 'Masa', birim: 'ADET' },
    { kalip: /sandaly|chair|koltuk|seat/i, ad: 'Sandalye / Koltuk', birim: 'ADET' },
    { kalip: /dolap|cabinet|wardrobe|gardirop|gardırop/i, ad: 'Dolap', birim: 'ADET' },
    { kalip: /raf|shelf|kitapl/i, ad: 'Raf / Kitaplık', birim: 'ADET' },
    { kalip: /sira|sıra|okul\s*sıra|student/i, ad: 'Okul sırası', birim: 'ADET' },
    { kalip: /tahta|board|whiteboard|yazı\s*tahta/i, ad: 'Yazı tahtası', birim: 'ADET' },
    { kalip: /saksı|saksi|plant|tree|agac|ağaç|arb/i, ad: 'Bitki / peyzaj', birim: 'ADET' },
    { kalip: /asansor|asansör|lift|elevator/i, ad: 'Asansör', birim: 'ADET' },
    { kalip: /merdiven|stair/i, ad: 'Merdiven', birim: 'ADET' },
    { kalip: /tezgah|counter|banko/i, ad: 'Tezgah / banko', birim: 'ADET' },
    { kalip: /ocak|fırın|firin|buzdolab|mutfak/i, ad: 'Mutfak donanımı', birim: 'ADET' },
    { kalip: /klima|hvac|fancoil|radyator|radyatör/i, ad: 'İklimlendirme', birim: 'ADET' },
    { kalip: /aydinlat|aydınlat|light|armatur|armatür/i, ad: 'Aydınlatma armatürü', birim: 'ADET' },
    { kalip: /priz|socket|anahtar|switch/i, ad: 'Elektrik tesisat elemanı', birim: 'ADET' }
  ];

  // Mahal tipine göre BEKLENEN tefriş — plan sembol taşımıyorsa mimarın
  // deneyimle eklediği kalemler. ÖNERİ olarak sunulur, otomatik eklenmez.
  const MAHAL_TEFRISI = [
    { kalip: /derslik|sinif|classroom/i, kalemler: [
      { ad: 'Okul sırası (çift kişilik)', birim: 'ADET', varsayilan: 15 },
      { ad: 'Öğretmen masası', birim: 'ADET', varsayilan: 1 },
      { ad: 'Öğretmen sandalyesi', birim: 'ADET', varsayilan: 1 },
      { ad: 'Yazı tahtası', birim: 'ADET', varsayilan: 1 },
      { ad: 'Askılık', birim: 'ADET', varsayilan: 1 },
      { ad: 'Dolap / kitaplık', birim: 'ADET', varsayilan: 1 }
    ]},
    { kalip: /\bwc\b|tuvalet|lavabo|abdesthane|toilet/i, kalemler: [
      { ad: 'Klozet', birim: 'ADET', varsayilan: 2 },
      { ad: 'Lavabo', birim: 'ADET', varsayilan: 2 },
      { ad: 'Ayna', birim: 'ADET', varsayilan: 1 },
      { ad: 'Kompakt kabin bölme', birim: 'ADET', varsayilan: 2 },
      { ad: 'Tezgah (lavabo altı)', birim: 'MT', varsayilan: 2 }
    ]},
    { kalip: /mudur|idari|ofis|buro|office/i, kalemler: [
      { ad: 'Çalışma masası', birim: 'ADET', varsayilan: 1 },
      { ad: 'Makam koltuğu', birim: 'ADET', varsayilan: 1 },
      { ad: 'Misafir sandalyesi', birim: 'ADET', varsayilan: 2 },
      { ad: 'Dosya dolabı', birim: 'ADET', varsayilan: 1 },
      { ad: 'Kitaplık', birim: 'ADET', varsayilan: 1 }
    ]},
    { kalip: /ogretmenler|toplanti|meeting/i, kalemler: [
      { ad: 'Toplantı masası', birim: 'ADET', varsayilan: 1 },
      { ad: 'Toplantı sandalyesi', birim: 'ADET', varsayilan: 12 },
      { ad: 'Dolap', birim: 'ADET', varsayilan: 2 }
    ]},
    { kalip: /mutfak|kantin|yemekhane|kitchen/i, kalemler: [
      { ad: 'Mutfak tezgahı', birim: 'MT', varsayilan: 4 },
      { ad: 'Alt dolap', birim: 'MT', varsayilan: 4 },
      { ad: 'Üst dolap', birim: 'MT', varsayilan: 3 },
      { ad: 'Evye', birim: 'ADET', varsayilan: 1 }
    ]},
    { kalip: /koridor|\bhol\b|lobi|corridor|lobby/i, kalemler: [
      { ad: 'Duvar koruma bandı', birim: 'MT', varsayilan: 20 },
      { ad: 'Askılık', birim: 'ADET', varsayilan: 4 },
      { ad: 'Pano / duyuru panosu', birim: 'ADET', varsayilan: 2 }
    ]},
    { kalip: /kutuphane|library/i, kalemler: [
      { ad: 'Kitaplık rafı', birim: 'MT', varsayilan: 12 },
      { ad: 'Okuma masası', birim: 'ADET', varsayilan: 6 },
      { ad: 'Sandalye', birim: 'ADET', varsayilan: 24 }
    ]},
    { kalip: /laboratuvar|labora|atolye|lab\b/i, kalemler: [
      { ad: 'Laboratuvar tezgahı', birim: 'MT', varsayilan: 8 },
      { ad: 'Tabure', birim: 'ADET', varsayilan: 16 },
      { ad: 'Malzeme dolabı', birim: 'ADET', varsayilan: 2 }
    ]}
  ];

  function blokYorumla(blokAdi) {
    const s = String(blokAdi || '');
    const e = BLOK_SOZLUGU.find(x => x.kalip.test(s) || x.kalip.test(trSadeles(s)));
    return e ? { ad: e.ad, birim: e.birim, cozuldu: true, ham: s }
             : { ad: 'Tanımsız blok: ' + s, birim: 'ADET', cozuldu: false, ham: s };
  }

  // Türkçe büyük/küçük harf tuzağı: "DERSLİK" küçültülünce "derslik" olmalı
  // ama JS'in toLowerCase'i "İ" harfini "i̇" (noktalı i + birleşen nokta) yapar
  // ve /derslik/i kalıbı EŞLEŞMEZ. Bu yüzden Türkçe harfler önce sadeleştirilir.
  function trSadeles(x) {
    return String(x || '')
      .replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
      .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c')
      .toLowerCase();
  }

  function mahalTefrisi(mahalAdi) {
    const sade = trSadeles(mahalAdi);
    const e = MAHAL_TEFRISI.find(x => x.kalip.test(sade) || x.kalip.test(String(mahalAdi || '')));
    return e ? e.kalemler : [];
  }

  // Blokları en yakın mahale ata (metin detaylarıyla aynı mekânsal mantık)
  function bloklariMahallereAta(kesifSonuc, bloklar, mahalKonumlari, esik) {
    if (!bloklar || !bloklar.length || !mahalKonumlari || !mahalKonumlari.length) return kesifSonuc;
    const sinir = esik || 400;
    const atanan = new Map();   // mahalAdi -> Map(kalemAdi -> {adet, ornekler})
    let atanmayan = 0;
    bloklar.forEach(b => {
      let en = null, enU = Infinity;
      mahalKonumlari.forEach(m => {
        const u = Math.hypot(m.x - b.x, m.y - b.y);
        if (u < enU) { enU = u; en = m; }
      });
      if (!en || enU > sinir) { atanmayan++; return; }
      const y = blokYorumla(b.ad);
      const k = en.ad.toLocaleUpperCase('tr');
      if (!atanan.has(k)) atanan.set(k, new Map());
      const harita = atanan.get(k);
      const v = harita.get(y.ad) || { sinif: y.ad, birim: y.birim, adet: 0, ornekler: [], tefris: true, cozuldu: y.cozuldu };
      v.adet++;
      if (!v.ornekler.includes(y.ham) && v.ornekler.length < 3) v.ornekler.push(y.ham);
      harita.set(y.ad, v);
    });
    (kesifSonuc.mahaller || []).forEach(m => {
      const harita = atanan.get(m.ad.toLocaleUpperCase('tr'));
      if (!harita) return;
      harita.forEach(v => m.detaylar.push(v));
      m.detaylar.sort((a, b) => b.adet - a.adet);
    });
    kesifSonuc.atanmayanBlok = atanmayan;
    kesifSonuc.toplamBlok = bloklar.length;
    return kesifSonuc;
  }

  // ── OTOMATİK MOD SEÇİMİ ──────────────────────────────────────────────────
  // Önce metin denenir (adlar doğrudan okunur, en güvenilir yol). Yeterli mahal
  // adı bulunamazsa renk moduna geçilir. İkisi de sonuç vermezse durum bildirilir.
  async function otomatikCoz(dosya, sayfaNo) {
    let metin = null, renk = null;
    try { metin = await metindenCoz(dosya, sayfaNo); } catch (e) { }
    if (metin && metin.mahaller.length >= 2) return { mod: 'metin', metin, renk: null };
    try { renk = await coz(dosya, sayfaNo); } catch (e) { }
    if (renk && renk.mahaller.length >= 2) return { mod: 'renk', metin, renk };
    return { mod: metin && metin.mahaller.length ? 'metin' : 'yok', metin, renk };
  }

  return { coz, metindenCoz, kesifCikar, dwgKesif, kesifCekirdek, otomatikCoz,
    blokYorumla, mahalTefrisi, bloklariMahallereAta, BLOK_SOZLUGU, MAHAL_TEFRISI, mahalAdiMi, lejantGoruntusu, renkCss, DETAY_SINIFLARI };
})();

if (typeof module !== 'undefined') module.exports = PlanOkuyucu;
