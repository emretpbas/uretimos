// ════════════════════════════════════════════════════════════════════════════
// QR KOD ÜRETİCİ (bağımlılıksız, saf JavaScript)
//
// Neden QR? Code39 gibi çizgi barkodlar telefon kamerasıyla zor okunur:
// tam dik açı, iyi ışık ve yakın mesafe ister. QR kod ise açılı, uzaktan ve
// kısmen kirli/yıpranmış haldeyken bile okunur — üretim ortamı için doğru
// tercih budur. Ayrıca tüm modern telefonlar QR'ı yerel olarak destekler.
//
// Standart: ISO/IEC 18004. Bu uygulama:
//   • Byte (8-bit) modu — harf, rakam ve Türkçe karakter (UTF-8) destekler
//   • Hata düzeltme seviyesi M (%15 kurtarma) — üretim ortamı için uygun
//   • Sürüm 1–10 (21×21 – 57×57 modül), veri uzunluğuna göre otomatik seçilir
//   • 8 maskeleme deseninin tamamı denenip en iyisi seçilir (okunabilirlik)
// ════════════════════════════════════════════════════════════════════════════
const QrKod = (() => {

  // ── GALOIS ALANI (GF256) — Reed-Solomon için ────────────────────────────
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;   // QR'ın indirgenemez polinomu
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gfCarp = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  // Reed-Solomon üretici polinomu
  function rsUretecPolinomu(derece) {
    let poli = [1];
    for (let i = 0; i < derece; i++) {
      const yeni = new Array(poli.length + 1).fill(0);
      for (let j = 0; j < poli.length; j++) {
        yeni[j] ^= gfCarp(poli[j], EXP[i]);
        yeni[j + 1] ^= poli[j];
      }
      poli = yeni;
    }
    return poli;
  }

  // Hata düzeltme kodlarını üret (polinom bölmesi)
  function rsKodlari(veri, ecSayisi) {
    const uretec = rsUretecPolinomu(ecSayisi);
    const kalan = new Array(ecSayisi).fill(0);
    for (const bayt of veri) {
      const faktor = bayt ^ kalan[0];
      kalan.shift(); kalan.push(0);
      if (faktor !== 0) {
        // Üreteç polinomu dizide ARTAN dereceyle tutulur (uretec[0]=sabit terim).
        // Kalan yazmacında kalan[0] en yüksek dereceli terimdir; bu yüzden
        // katsayılar TERS sırayla uygulanmalıdır. Aksi halde üretilen hata
        // düzeltme kodları geçersiz olur ve okuyucular kodu çözemez.
        for (let i = 0; i < ecSayisi; i++) kalan[i] ^= gfCarp(uretec[ecSayisi - 1 - i], faktor);
      }
    }
    return kalan;
  }

  // ── SÜRÜM TABLOSU (Hata düzeltme seviyesi M) ────────────────────────────
  // [toplamKodSözcüğü, blokBaşınaEC, [ [blokSayısı, veriKodSözcüğü], ... ] ]
  const SURUMLER = {
    1:  [26,  10, [[1, 16]]],
    2:  [44,  16, [[1, 28]]],
    3:  [70,  26, [[1, 44]]],
    4:  [100, 18, [[2, 32]]],
    5:  [134, 24, [[2, 43]]],
    6:  [172, 16, [[4, 27]]],
    7:  [196, 18, [[4, 31]]],
    8:  [242, 22, [[2, 38], [2, 39]]],
    9:  [292, 22, [[3, 36], [2, 37]]],
    10: [346, 26, [[4, 43], [1, 44]]]
  };
  // Hizalama deseni merkez koordinatları
  const HIZALAMA = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  const veriKapasitesi = (surum) => SURUMLER[surum][2].reduce((a, [n, k]) => a + n * k, 0);

  // ── VERİ KODLAMA (byte modu) ────────────────────────────────────────────
  function veriyiKodla(metin, surum) {
    // UTF-8'e çevir (Türkçe karakterler için)
    const baytlar = [];
    for (const ch of metin) {
      const kod = ch.codePointAt(0);
      if (kod < 0x80) baytlar.push(kod);
      else if (kod < 0x800) baytlar.push(0xC0 | (kod >> 6), 0x80 | (kod & 0x3F));
      else if (kod < 0x10000) baytlar.push(0xE0 | (kod >> 12), 0x80 | ((kod >> 6) & 0x3F), 0x80 | (kod & 0x3F));
      else baytlar.push(0xF0 | (kod >> 18), 0x80 | ((kod >> 12) & 0x3F), 0x80 | ((kod >> 6) & 0x3F), 0x80 | (kod & 0x3F));
    }

    const bitler = [];
    const bitEkle = (deger, uzunluk) => {
      for (let i = uzunluk - 1; i >= 0; i--) bitler.push((deger >> i) & 1);
    };

    bitEkle(0b0100, 4);                                   // Byte modu göstergesi
    bitEkle(baytlar.length, surum <= 9 ? 8 : 16);         // Karakter sayısı
    baytlar.forEach(b => bitEkle(b, 8));

    const kapasiteBit = veriKapasitesi(surum) * 8;
    // Sonlandırıcı (en fazla 4 bit)
    for (let i = 0; i < 4 && bitler.length < kapasiteBit; i++) bitler.push(0);
    // Bayt sınırına tamamla
    while (bitler.length % 8 !== 0) bitler.push(0);
    // Dolgu baytları (standart: 236, 17 dönüşümlü)
    const dolgu = [0xEC, 0x11];
    let di = 0;
    while (bitler.length < kapasiteBit) { bitEkle(dolgu[di++ % 2], 8); }

    // Bitleri bayta çevir
    const kodSozcukleri = [];
    for (let i = 0; i < bitler.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bitler[i + j];
      kodSozcukleri.push(b);
    }
    return kodSozcukleri;
  }

  // ── BLOKLARA AYIR + EC EKLE + SERPİŞTİR ─────────────────────────────────
  function bloklariHazirla(kodSozcukleri, surum) {
    const [, ecSayisi, gruplar] = SURUMLER[surum];
    const veriBloklari = [], ecBloklari = [];
    let ofset = 0;
    gruplar.forEach(([blokSayisi, veriUzunlugu]) => {
      for (let i = 0; i < blokSayisi; i++) {
        const blok = kodSozcukleri.slice(ofset, ofset + veriUzunlugu);
        ofset += veriUzunlugu;
        veriBloklari.push(blok);
        ecBloklari.push(rsKodlari(blok, ecSayisi));
      }
    });
    // Serpiştirme (interleaving)
    const sonuc = [];
    const enUzunVeri = Math.max(...veriBloklari.map(b => b.length));
    for (let i = 0; i < enUzunVeri; i++) {
      veriBloklari.forEach(b => { if (i < b.length) sonuc.push(b[i]); });
    }
    for (let i = 0; i < ecSayisi; i++) {
      ecBloklari.forEach(b => sonuc.push(b[i]));
    }
    return sonuc;
  }

  // ── MATRİS OLUŞTURMA ────────────────────────────────────────────────────
  function matrisOlustur(surum) {
    const boyut = surum * 4 + 17;
    // null = henüz yerleştirilmedi (veri buraya yazılabilir)
    const m = Array.from({ length: boyut }, () => new Array(boyut).fill(null));
    const rezerve = Array.from({ length: boyut }, () => new Array(boyut).fill(false));

    const koy = (r, c, deger) => { m[r][c] = deger; rezerve[r][c] = true; };

    // Bulucu desenler (finder) — 3 köşe
    const bulucuKoy = (satir, sutun) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = satir + r, cc = sutun + c;
          if (rr < 0 || rr >= boyut || cc < 0 || cc >= boyut) continue;
          const icinde = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                         (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                         (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          koy(rr, cc, icinde ? 1 : 0);
        }
      }
    };
    bulucuKoy(0, 0); bulucuKoy(0, boyut - 7); bulucuKoy(boyut - 7, 0);

    // Zamanlama desenleri (timing)
    for (let i = 8; i < boyut - 8; i++) {
      koy(6, i, i % 2 === 0 ? 1 : 0);
      koy(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Hizalama desenleri (alignment)
    const merkezler = HIZALAMA[surum];
    merkezler.forEach(r => merkezler.forEach(c => {
      // Bulucu desenlerle çakışanları atla
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= boyut - 9) || (r >= boyut - 9 && c <= 8)) return;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const halka = Math.max(Math.abs(dr), Math.abs(dc));
          koy(r + dr, c + dc, (halka === 1) ? 0 : 1);
        }
      }
    }));

    // Karanlık modül (her zaman 1)
    koy(boyut - 8, 8, 1);

    // Format bilgisi alanlarını rezerve et
    for (let i = 0; i < 9; i++) {
      if (m[8][i] === null) { m[8][i] = 0; rezerve[8][i] = true; }
      if (m[i][8] === null) { m[i][8] = 0; rezerve[i][8] = true; }
    }
    for (let i = 0; i < 8; i++) {
      if (m[8][boyut - 1 - i] === null) { m[8][boyut - 1 - i] = 0; rezerve[8][boyut - 1 - i] = true; }
      if (m[boyut - 1 - i][8] === null) { m[boyut - 1 - i][8] = 0; rezerve[boyut - 1 - i][8] = true; }
    }
    // Sürüm bilgisi alanları (sürüm 7+)
    if (surum >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          if (m[i][boyut - 11 + j] === null) { m[i][boyut - 11 + j] = 0; rezerve[i][boyut - 11 + j] = true; }
          if (m[boyut - 11 + j][i] === null) { m[boyut - 11 + j][i] = 0; rezerve[boyut - 11 + j][i] = true; }
        }
      }
    }
    return { m, rezerve, boyut };
  }

  // Veri bitlerini zig-zag sırayla yerleştir
  function veriyiYerlestir(m, rezerve, boyut, kodSozcukleri) {
    const bitler = [];
    kodSozcukleri.forEach(b => { for (let i = 7; i >= 0; i--) bitler.push((b >> i) & 1); });
    let bi = 0, yukari = true;
    for (let sutunCift = boyut - 1; sutunCift > 0; sutunCift -= 2) {
      if (sutunCift === 6) sutunCift--;   // zamanlama sütununu atla
      for (let i = 0; i < boyut; i++) {
        const r = yukari ? boyut - 1 - i : i;
        for (let k = 0; k < 2; k++) {
          const c = sutunCift - k;
          if (rezerve[r][c]) continue;
          m[r][c] = bi < bitler.length ? bitler[bi++] : 0;
        }
      }
      yukari = !yukari;
    }
  }

  // ── MASKELEME ───────────────────────────────────────────────────────────
  const MASKE = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  // Format bilgisi: EC seviyesi (M = 0b00) + maske, BCH(15,5) ile korunur
  function formatBitleri(maskeNo) {
    const veri = (0b00 << 3) | maskeNo;   // M seviyesi
    let bch = veri << 10;
    for (let i = 4; i >= 0; i--) {
      if ((bch >> (10 + i)) & 1) bch ^= 0b10100110111 << i;
    }
    return ((veri << 10) | bch) ^ 0b101010000010010;
  }

  // Sürüm bilgisi: BCH(18,6)
  function surumBitleri(surum) {
    let bch = surum << 12;
    for (let i = 5; i >= 0; i--) {
      if ((bch >> (12 + i)) & 1) bch ^= 0b1111100100 << i;
    }
    return (surum << 12) | bch;
  }

  function formatYaz(m, boyut, maskeNo) {
    const bitler = formatBitleri(maskeNo);
    // ISO/IEC 18004 format bilgisi yerleşimi: bit 14 (MSB) → bit 0 (LSB).
    // Bu sıra STANDARTTIR; ters yazılırsa telefon kameraları ve ticari
    // okuyucular kodu çözemez.
    const kopya1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
                    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const kopya2 = [];
    for (let i = 0; i < 7; i++) kopya2.push([boyut - 1 - i, 8]);   // bit 14..8
    for (let i = 0; i < 8; i++) kopya2.push([8, boyut - 8 + i]);   // bit 7..0
    for (let i = 0; i < 15; i++) {
      const bit = (bitler >> (14 - i)) & 1;
      m[kopya1[i][0]][kopya1[i][1]] = bit;
      m[kopya2[i][0]][kopya2[i][1]] = bit;
    }
    m[boyut - 8][8] = 1;   // karanlık modül
  }

  function surumYaz(m, boyut, surum) {
    if (surum < 7) return;
    const bitler = surumBitleri(surum);
    for (let i = 0; i < 18; i++) {
      const bit = (bitler >> i) & 1;
      const r = Math.floor(i / 3), c = i % 3;
      m[r][boyut - 11 + c] = bit;
      m[boyut - 11 + c][r] = bit;
    }
  }

  // Maske kalite puanı (düşük = iyi) — ISO ceza kuralları
  function cezaPuani(m, boyut) {
    let ceza = 0;
    // Kural 1: aynı renkte 5+ ardışık modül
    for (let i = 0; i < boyut; i++) {
      for (const yon of ['satir', 'sutun']) {
        let say = 1, onceki = -1;
        for (let j = 0; j < boyut; j++) {
          const v = yon === 'satir' ? m[i][j] : m[j][i];
          if (v === onceki) { say++; if (say === 5) ceza += 3; else if (say > 5) ceza++; }
          else { say = 1; onceki = v; }
        }
      }
    }
    // Kural 2: 2×2 aynı renk bloklar
    for (let r = 0; r < boyut - 1; r++) {
      for (let c = 0; c < boyut - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) ceza += 3;
      }
    }
    // Kural 3: bulucu deseni taklit eden dizilimler
    const desen1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const desen2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const eslesir = (dizi, i, d) => d.every((x, k) => dizi[i + k] === x);
    for (let i = 0; i < boyut; i++) {
      const satir = m[i], sutun = m.map(r => r[i]);
      for (let j = 0; j <= boyut - 11; j++) {
        if (eslesir(satir, j, desen1) || eslesir(satir, j, desen2)) ceza += 40;
        if (eslesir(sutun, j, desen1) || eslesir(sutun, j, desen2)) ceza += 40;
      }
    }
    // Kural 4: siyah/beyaz dengesi
    let siyah = 0;
    m.forEach(r => r.forEach(v => { if (v) siyah++; }));
    const oran = (siyah * 100) / (boyut * boyut);
    ceza += Math.floor(Math.abs(oran - 50) / 5) * 10;
    return ceza;
  }

  // ── ANA ÜRETİM FONKSİYONU ───────────────────────────────────────────────
  // Dönen: { modules: [[0/1]], boyut, surum }
  function uret(metin) {
    const veri = String(metin == null ? '' : metin);
    // UTF-8 bayt uzunluğunu hesapla
    let baytUzunlugu = 0;
    for (const ch of veri) {
      const k = ch.codePointAt(0);
      baytUzunlugu += k < 0x80 ? 1 : k < 0x800 ? 2 : k < 0x10000 ? 3 : 4;
    }
    // Uygun en küçük sürümü seç
    let surum = 0;
    for (let s = 1; s <= 10; s++) {
      const basligBit = 4 + (s <= 9 ? 8 : 16);
      if (veriKapasitesi(s) * 8 >= basligBit + baytUzunlugu * 8) { surum = s; break; }
    }
    if (!surum) throw new Error('Veri çok uzun — QR sürüm 10 kapasitesi aşıldı (en fazla ~200 karakter)');

    const kodSozcukleri = veriyiKodla(veri, surum);
    const tumKodlar = bloklariHazirla(kodSozcukleri, surum);

    // 8 maskeyi dene, en düşük cezalıyı seç
    let enIyi = null, enIyiCeza = Infinity;
    for (let maskeNo = 0; maskeNo < 8; maskeNo++) {
      const { m, rezerve, boyut } = matrisOlustur(surum);
      veriyiYerlestir(m, rezerve, boyut, tumKodlar);
      // Maskeyi yalnızca veri modüllerine uygula
      for (let r = 0; r < boyut; r++) {
        for (let c = 0; c < boyut; c++) {
          if (!rezerve[r][c] && MASKE[maskeNo](r, c)) m[r][c] ^= 1;
        }
      }
      formatYaz(m, boyut, maskeNo);
      surumYaz(m, boyut, surum);
      const ceza = cezaPuani(m, boyut);
      if (ceza < enIyiCeza) { enIyiCeza = ceza; enIyi = { modules: m, boyut, surum, maske: maskeNo }; }
    }
    return enIyi;
  }

  // ── SVG ÇIKTISI ─────────────────────────────────────────────────────────
  // sessizAlan: QR'ın etrafındaki boşluk (standart 4 modül) — okunabilirlik
  // için ZORUNLUDUR, olmadan kamera QR'ı bulamaz.
  function svg(metin, pikselBoyut, opts) {
    const o = Object.assign({ sessizAlan: 4, arkaPlan: '#fff', renk: '#000' }, opts || {});
    const q = uret(metin);
    const toplamModul = q.boyut + o.sessizAlan * 2;
    const px = pikselBoyut || 160;
    const modulPx = px / toplamModul;
    let yollar = '';
    for (let r = 0; r < q.boyut; r++) {
      for (let c = 0; c < q.boyut; c++) {
        if (!q.modules[r][c]) continue;
        const x = (c + o.sessizAlan) * modulPx;
        const y = (r + o.sessizAlan) * modulPx;
        // Bitişik modülleri birleştirmek yerine tek tek çiz (baskıda net)
        yollar += `M${x.toFixed(2)} ${y.toFixed(2)}h${modulPx.toFixed(2)}v${modulPx.toFixed(2)}h-${modulPx.toFixed(2)}z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" shape-rendering="crispEdges">` +
      `<rect width="${px}" height="${px}" fill="${o.arkaPlan}"/>` +
      `<path d="${yollar}" fill="${o.renk}"/></svg>`;
  }

  return { uret, svg, veriKapasitesi, SURUMLER };
})();
