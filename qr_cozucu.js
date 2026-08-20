// ════════════════════════════════════════════════════════════════════════════
// QR KOD ÇÖZÜCÜ (bağımsız, saf JavaScript)
//
// NEDEN GEREKLİ: Tarayıcıların yerleşik BarcodeDetector API'si yalnızca
// Chrome/Edge ve Android'de var. Firefox, Safari (macOS + iOS) ve iOS'taki
// TÜM tarayıcılar (Chrome dahil, çünkü hepsi WebKit kullanır) bu API'yi
// desteklemez. "Chrome kullanın" demek sahada çözüm değildir.
//
// Bu modül kamera görüntüsünü doğrudan çözer; hiçbir tarayıcı API'sine veya
// dış kütüphaneye bağımlı değildir. Böylece QR okuma HER cihazda çalışır.
//
// İŞLEYİŞ:
//   1. Uyarlamalı eşikleme  — değişken ışıkta bile siyah/beyaz ayrımı
//   2. Bulucu deseni tespiti — 1:1:3:1:1 oranını yatay/dikey tarayarak
//   3. Yönelim ve ızgara     — 3 bulucudan perspektif dönüşümü kurulur
//   4. Modül örnekleme       — her modülün merkezinden okunur
//   5. Format çözme          — maske ve hata düzeltme seviyesi (BCH)
//   6. Reed-Solomon düzeltme — kirli/hasarlı kodlar da okunur
//   7. Byte modu çözümü      — UTF-8 metin (Türkçe karakter dahil)
// ════════════════════════════════════════════════════════════════════════════
const QrCozucu = (() => {

  // ── GF(256) — Reed-Solomon için (üreticiyle aynı polinom) ───────────────
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gfCarp = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  const gfBol = (a, b) => { if (b === 0) throw new Error('sıfıra bölme'); return a === 0 ? 0 : EXP[(LOG[a] + 255 - LOG[b]) % 255]; };
  const gfTers = (a) => EXP[255 - LOG[a]];

  // ── REED-SOLOMON HATA DÜZELTME (Berlekamp-Massey + Chien + Forney) ─────
  // Kirli, çizik veya kısmen kapalı QR kodları bu sayede okunabilir.
  // QR standardında üreteç polinomunun kökleri α^0'dan başlar; sendromlar
  // buna göre S_i = C(α^i) şeklinde hesaplanır.
  function rsDuzelt(veri, ecSayisi) {
    const n = veri.length;

    // 1) Sendromlar
    const S = new Array(ecSayisi).fill(0);
    let hataVar = false;
    for (let i = 0; i < ecSayisi; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s = gfCarp(s, EXP[i]) ^ veri[j];
      S[i] = s;
      if (s !== 0) hataVar = true;
    }
    if (!hataVar) return veri;   // hata yok, olduğu gibi dön

    // 2) Berlekamp-Massey — hata konum polinomu Λ(x)
    let C = new Array(ecSayisi + 2).fill(0); C[0] = 1;
    let B = new Array(ecSayisi + 2).fill(0); B[0] = 1;
    let L = 0, m = 1, b = 1;
    for (let r = 0; r < ecSayisi; r++) {
      let d = S[r];
      for (let i = 1; i <= L; i++) d ^= gfCarp(C[i], S[r - i]);
      if (d === 0) { m++; }
      else if (2 * L <= r) {
        const T = C.slice();
        const olcek = gfCarp(d, gfTers(b));
        for (let i = 0; i + m < C.length; i++) C[i + m] ^= gfCarp(olcek, B[i]);
        L = r + 1 - L; B = T; b = d; m = 1;
      } else {
        const olcek = gfCarp(d, gfTers(b));
        for (let i = 0; i + m < C.length; i++) C[i + m] ^= gfCarp(olcek, B[i]);
        m++;
      }
    }
    if (L === 0 || L > ecSayisi / 2) throw new Error('Düzeltilemeyecek kadar çok hata');
    const lambda = C.slice(0, L + 1);

    // 3) Chien araması — Λ(α^-p)=0 olan p konumları hatalıdır
    const konumlar = [];
    for (let p = 0; p < n; p++) {
      let deger = 0;
      for (let i = 0; i < lambda.length; i++) {
        deger ^= gfCarp(lambda[i], EXP[(i * (255 - p % 255)) % 255]);
      }
      if (deger === 0) konumlar.push(p);
    }
    if (konumlar.length !== L) throw new Error('Hata konumları bulunamadı');

    // 4) Ω(x) = [S(x)·Λ(x)] mod x^ec
    const omega = new Array(ecSayisi).fill(0);
    for (let i = 0; i < ecSayisi; i++) {
      let t = 0;
      for (let j = 0; j <= i && j < lambda.length; j++) t ^= gfCarp(S[i - j], lambda[j]);
      omega[i] = t;
    }

    // 5) Forney — hata değerleri (kökler α^0'dan başladığı için X_k çarpanı var)
    const sonuc = veri.slice();
    for (const p of konumlar) {
      const xTers = EXP[(255 - p % 255) % 255];       // X^-1 = α^-p
      let om = 0;
      for (let i = 0; i < ecSayisi; i++) om ^= gfCarp(omega[i], EXP[(i * (255 - p % 255)) % 255]);
      let turev = 0;                                   // Λ'(X^-1): tek dereceli terimler
      for (let i = 1; i < lambda.length; i += 2) {
        turev ^= gfCarp(lambda[i], EXP[((i - 1) * (255 - p % 255)) % 255]);
      }
      if (turev === 0) throw new Error('Forney: türev sıfır');
      const X = EXP[p % 255];
      const hataDegeri = gfCarp(X, gfCarp(om, gfTers(turev)));
      const idx = n - 1 - p;
      if (idx < 0 || idx >= n) throw new Error('Hata konumu aralık dışı');
      sonuc[idx] ^= hataDegeri;
    }
    return sonuc;
  }

  // ── SÜRÜM TABLOSU (üreticiyle aynı — seviye M) ──────────────────────────
  const SURUMLER = {
    1: [26, 10, [[1, 16]]],       2: [44, 16, [[1, 28]]],
    3: [70, 26, [[1, 44]]],       4: [100, 18, [[2, 32]]],
    5: [134, 24, [[2, 43]]],      6: [172, 16, [[4, 27]]],
    7: [196, 18, [[4, 31]]],      8: [242, 22, [[2, 38], [2, 39]]],
    9: [292, 22, [[3, 36], [2, 37]]], 10: [346, 26, [[4, 43], [1, 44]]]
  };
  // Diğer EC seviyeleri (L, Q, H) — dışarıdan gelen QR'lar için
  const SURUMLER_L = {
    1: [26, 7, [[1, 19]]], 2: [44, 10, [[1, 34]]], 3: [70, 15, [[1, 55]]],
    4: [100, 20, [[1, 80]]], 5: [134, 26, [[1, 108]]], 6: [172, 18, [[2, 68]]],
    7: [196, 20, [[2, 78]]], 8: [242, 24, [[2, 97]]], 9: [292, 30, [[2, 116]]],
    10: [346, 18, [[2, 68], [2, 69]]]
  };
  const HIZALAMA = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  const MASKE = [
    (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  // ── 1) UYARLAMALI EŞİKLEME ──────────────────────────────────────────────
  // Görüntüyü bloklara bölüp her blok için ayrı eşik hesaplar. Fabrikadaki
  // düzensiz aydınlatmada sabit eşikten çok daha başarılıdır.
  function ikiliyeCevir(gri, gen, yuk) {
    const BLOK = 8;
    const bx = Math.max(1, Math.ceil(gen / BLOK)), by = Math.max(1, Math.ceil(yuk / BLOK));
    const esikler = new Float32Array(bx * by);
    for (let j = 0; j < by; j++) {
      for (let i = 0; i < bx; i++) {
        let min = 255, max = 0, top = 0, n = 0;
        const x0 = i * BLOK, y0 = j * BLOK;
        for (let y = y0; y < Math.min(y0 + BLOK, yuk); y++) {
          for (let x = x0; x < Math.min(x0 + BLOK, gen); x++) {
            const v = gri[y * gen + x];
            if (v < min) min = v; if (v > max) max = v;
            top += v; n++;
          }
        }
        // Kontrast düşükse komşu bloklardan yardım al
        esikler[j * bx + i] = (max - min > 24) ? (min + max) / 2 : (n ? top / n - 12 : 128);
      }
    }
    // Eşikleri yumuşat (blok sınırlarında kesiklik olmasın)
    const ikili = new Uint8Array(gen * yuk);
    for (let y = 0; y < yuk; y++) {
      const j = Math.min(by - 1, Math.floor(y / BLOK));
      for (let x = 0; x < gen; x++) {
        const i = Math.min(bx - 1, Math.floor(x / BLOK));
        let toplam = 0, say = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const jj = j + dj, ii = i + di;
            if (jj >= 0 && jj < by && ii >= 0 && ii < bx) { toplam += esikler[jj * bx + ii]; say++; }
          }
        }
        ikili[y * gen + x] = gri[y * gen + x] < (toplam / say) ? 1 : 0;   // 1 = siyah
      }
    }
    return ikili;
  }

  // ── 2) BULUCU DESENİ TESPİTİ (1:1:3:1:1) ────────────────────────────────
  function oranUygunMu(s) {
    const toplam = s[0] + s[1] + s[2] + s[3] + s[4];
    if (toplam < 7) return false;
    const birim = toplam / 7, tolerans = birim * 0.6;
    return Math.abs(birim - s[0]) < tolerans && Math.abs(birim - s[1]) < tolerans &&
           Math.abs(3 * birim - s[2]) < 3 * tolerans && Math.abs(birim - s[3]) < tolerans &&
           Math.abs(birim - s[4]) < tolerans;
  }

  function bulucuAra(ikili, gen, yuk) {
    const adaylar = [];
    const dikeyDogrula = (merkezX, merkezY, birim) => {
      // Dikey eksende de 1:1:3:1:1 var mı?
      const s = [0, 0, 0, 0, 0];
      let y = merkezY;
      while (y >= 0 && ikili[y * gen + merkezX]) { s[2]++; y--; }
      while (y >= 0 && !ikili[y * gen + merkezX] && s[1] < birim * 2) { s[1]++; y--; }
      while (y >= 0 && ikili[y * gen + merkezX] && s[0] < birim * 2) { s[0]++; y--; }
      y = merkezY + 1;
      while (y < yuk && ikili[y * gen + merkezX]) { s[2]++; y++; }
      while (y < yuk && !ikili[y * gen + merkezX] && s[3] < birim * 2) { s[3]++; y++; }
      while (y < yuk && ikili[y * gen + merkezX] && s[4] < birim * 2) { s[4]++; y++; }
      return oranUygunMu(s) ? s : null;
    };

    for (let y = 0; y < yuk; y += 2) {          // her 2 satırda bir (hız)
      const s = [0, 0, 0, 0, 0];
      let durum = 0;
      for (let x = 0; x < gen; x++) {
        const siyah = ikili[y * gen + x];
        if (durum % 2 === (siyah ? 0 : 1)) {
          s[durum]++;
        } else {
          if (durum === 4) {
            if (oranUygunMu(s)) {
              const toplam = s.reduce((a, b) => a + b, 0);
              const birim = toplam / 7;
              const merkezX = Math.round(x - s[4] - s[3] - s[2] / 2);
              const dv = dikeyDogrula(merkezX, y, birim);
              if (dv) {
                const dToplam = dv.reduce((a, b) => a + b, 0);
                adaylar.push({ x: merkezX, y, birim: (birim + dToplam / 7) / 2 });
              }
            }
            s[0] = s[2]; s[1] = s[3]; s[2] = s[4]; s[3] = 1; s[4] = 0; durum = 3;
            if (siyah) { s[3] = 0; s[4] = 0; durum = 4; s[3] = 1; }
          } else { durum++; s[durum] = 1; }
        }
      }
      if (durum === 4 && oranUygunMu(s)) {
        const toplam = s.reduce((a, b) => a + b, 0), birim = toplam / 7;
        const merkezX = Math.round(gen - s[4] - s[3] - s[2] / 2);
        const dv = dikeyDogrula(merkezX, y, birim);
        if (dv) adaylar.push({ x: merkezX, y, birim });
      }
    }

    // Yakın adayları birleştir (aynı bulucu birden çok satırda görülür)
    const kumeler = [];
    adaylar.forEach(a => {
      const k = kumeler.find(c => Math.abs(c.x - a.x) < a.birim * 2 && Math.abs(c.y - a.y) < a.birim * 3);
      if (k) { k.x = (k.x * k.n + a.x) / (k.n + 1); k.y = (k.y * k.n + a.y) / (k.n + 1);
               k.birim = (k.birim * k.n + a.birim) / (k.n + 1); k.n++; }
      else kumeler.push({ x: a.x, y: a.y, birim: a.birim, n: 1 });
    });
    // En az 2 satırda görülenler gerçek bulucudur
    return kumeler.filter(k => k.n >= 2).sort((a, b) => b.n - a.n).slice(0, 12);
  }

  // 3 bulucudan sol-üst, sağ-üst, sol-alt belirle
  function bulucuYerlestir(b) {
    const mesafe = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    let enIyi = null;
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        for (let k = j + 1; k < b.length; k++) {
          const ucl = [b[i], b[j], b[k]];
          // Modül boyutları benzer olmalı
          const bir = ucl.map(p => p.birim);
          if (Math.max(...bir) / Math.min(...bir) > 1.6) continue;
          // Hipotenüs = en uzun kenar; karşısındaki nokta SOL ÜST
          const d01 = mesafe(ucl[0], ucl[1]), d02 = mesafe(ucl[0], ucl[2]), d12 = mesafe(ucl[1], ucl[2]);
          let solUst, a, c;
          if (d01 >= d02 && d01 >= d12) { solUst = ucl[2]; a = ucl[0]; c = ucl[1]; }
          else if (d02 >= d01 && d02 >= d12) { solUst = ucl[1]; a = ucl[0]; c = ucl[2]; }
          else { solUst = ucl[0]; a = ucl[1]; c = ucl[2]; }
          // Dik açı kontrolü
          const v1 = { x: a.x - solUst.x, y: a.y - solUst.y };
          const v2 = { x: c.x - solUst.x, y: c.y - solUst.y };
          const nokta = v1.x * v2.x + v1.y * v2.y;
          const uz = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
          if (uz === 0) continue;
          const cosA = Math.abs(nokta / uz);
          if (cosA > 0.35) continue;   // ~70°–110° dışı ise ele
          // Kenar uzunlukları benzer olmalı (kare)
          const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
          if (Math.max(l1, l2) / Math.min(l1, l2) > 1.5) continue;
          // Çapraz çarpım işareti → sağ üst / sol alt ayrımı
          const capraz = v1.x * v2.y - v1.y * v2.x;
          const sagUst = capraz > 0 ? a : c;
          const solAlt = capraz > 0 ? c : a;
          const puan = cosA + Math.abs(l1 - l2) / Math.max(l1, l2);
          if (!enIyi || puan < enIyi.puan) enIyi = { solUst, sagUst, solAlt, puan };
        }
      }
    }
    return enIyi;
  }

  // ── 3) PERSPEKTİF DÖNÜŞÜMÜ ──────────────────────────────────────────────
  // Kamera açılı tutulduğunda QR yamuk görünür; bu dönüşüm düzeltir.
  function perspektifKur(x0, y0, x1, y1, x2, y2, x3, y3, X0, Y0, X1, Y1, X2, Y2, X3, Y3) {
    // Birim kareden hedefe dönüşüm (ZXing yaklaşımı)
    const kareyeDonusum = (X0, Y0, X1, Y1, X2, Y2, X3, Y3) => {
      const dx3 = X0 - X1 + X2 - X3, dy3 = Y0 - Y1 + Y2 - Y3;
      if (dx3 === 0 && dy3 === 0) {
        return [X1 - X0, X2 - X1, X0, Y1 - Y0, Y2 - Y1, Y0, 0, 0, 1];
      }
      const dx1 = X1 - X2, dx2 = X3 - X2, dy1 = Y1 - Y2, dy2 = Y3 - Y2;
      const payda = dx1 * dy2 - dx2 * dy1;
      if (payda === 0) return null;
      const a13 = (dx3 * dy2 - dx2 * dy3) / payda;
      const a23 = (dx1 * dy3 - dx3 * dy1) / payda;
      return [X1 - X0 + a13 * X1, X3 - X0 + a23 * X3, X0,
              Y1 - Y0 + a13 * Y1, Y3 - Y0 + a23 * Y3, Y0, a13, a23, 1];
    };
    const t = kareyeDonusum(X0, Y0, X1, Y1, X2, Y2, X3, Y3);
    if (!t) return null;
    // Kaynak (ızgara) → birim kare dönüşümünün tersi
    const s = kareyeDonusum(x0, y0, x1, y1, x2, y2, x3, y3);
    if (!s) return null;
    const ters = [
      s[4] * s[8] - s[5] * s[7], s[2] * s[7] - s[1] * s[8], s[1] * s[5] - s[2] * s[4],
      s[5] * s[6] - s[3] * s[8], s[0] * s[8] - s[2] * s[6], s[2] * s[3] - s[0] * s[5],
      s[3] * s[7] - s[4] * s[6], s[1] * s[6] - s[0] * s[7], s[0] * s[4] - s[1] * s[3]
    ];
    // t × ters
    const m = new Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        m[i * 3 + j] = t[i * 3] * ters[j] + t[i * 3 + 1] * ters[3 + j] + t[i * 3 + 2] * ters[6 + j];
      }
    }
    return (x, y) => {
      const payda = m[6] * x + m[7] * y + m[8];
      return { x: (m[0] * x + m[1] * y + m[2]) / payda, y: (m[3] * x + m[4] * y + m[5]) / payda };
    };
  }

  // ── 4) IZGARA ÖRNEKLEME ─────────────────────────────────────────────────
  function izgarayiOku(ikili, gen, yuk, konum, boyut) {
    const { solUst, sagUst, solAlt } = konum;
    // Bulucu merkezleri modül koordinatında (3.5, 3.5), (boyut-3.5, 3.5), (3.5, boyut-3.5)
    const k = 3.5, sonK = boyut - 3.5;
    // 4. köşe: paralelkenar varsayımıyla tahmin
    const sagAltX = sagUst.x + solAlt.x - solUst.x;
    const sagAltY = sagUst.y + solAlt.y - solUst.y;
    const donusum = perspektifKur(
      k, k, sonK, k, sonK, sonK, k, sonK,
      solUst.x, solUst.y, sagUst.x, sagUst.y, sagAltX, sagAltY, solAlt.x, solAlt.y
    );
    if (!donusum) return null;

    const m = Array.from({ length: boyut }, () => new Array(boyut).fill(0));
    for (let r = 0; r < boyut; r++) {
      for (let c = 0; c < boyut; c++) {
        const p = donusum(c + 0.5, r + 0.5);
        const px = Math.round(p.x), py = Math.round(p.y);
        if (px < 0 || px >= gen || py < 0 || py >= yuk) return null;
        // 3×3 çoğunluk oyu — gürültüye dayanıklılık
        let siyah = 0, toplam = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const qx = px + dx, qy = py + dy;
            if (qx < 0 || qx >= gen || qy < 0 || qy >= yuk) continue;
            siyah += ikili[qy * gen + qx]; toplam++;
          }
        }
        m[r][c] = (siyah * 2 > toplam) ? 1 : 0;
      }
    }
    return m;
  }

  // ── 5) FORMAT BİLGİSİ ÇÖZME ─────────────────────────────────────────────
  function formatCoz(m, boyut) {
    const oku = (konumlar) => {
      let v = 0;
      konumlar.forEach(([r, c]) => { v = (v << 1) | m[r][c]; });
      return v;
    };
    // Birincil kopya (sol üst)
    const k1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    // İkincil kopya
    const k2 = [];
    for (let i = 0; i < 7; i++) k2.push([boyut - 1 - i, 8]);
    for (let i = 0; i < 8; i++) k2.push([8, boyut - 8 + i]);

    for (const konumlar of [k1, k2]) {
      let ham = oku(konumlar) ^ 0b101010000010010;
      // Ters sırada okunmuş olabilir — her iki yönü dene
      for (const aday of [ham, parseInt(ham.toString(2).padStart(15, '0').split('').reverse().join(''), 2)]) {
        // BCH ile en yakın geçerli format bilgisini bul
        let enIyi = null, enIyiMesafe = 99;
        for (let veri = 0; veri < 32; veri++) {
          let bch = veri << 10;
          for (let i = 4; i >= 0; i--) if ((bch >> (10 + i)) & 1) bch ^= 0b10100110111 << i;
          const gecerli = (veri << 10) | bch;
          const mesafe = ((gecerli ^ aday) >>> 0).toString(2).split('1').length - 1;
          if (mesafe < enIyiMesafe) { enIyiMesafe = mesafe; enIyi = veri; }
        }
        if (enIyiMesafe <= 3) {
          const ecKod = (enIyi >> 3) & 0b11;   // 01=L, 00=M, 11=Q, 10=H
          const maske = enIyi & 0b111;
          return { ecKod, maske, seviye: ['M', 'L', 'H', 'Q'][ecKod] };
        }
      }
    }
    return null;
  }

  // ── 6) VERİ ÇIKARMA ─────────────────────────────────────────────────────
  function rezerveHarita(surum, boyut) {
    const rez = Array.from({ length: boyut }, () => new Array(boyut).fill(false));
    const isaret = (r, c) => { if (r >= 0 && r < boyut && c >= 0 && c < boyut) rez[r][c] = true; };
    const bulucu = (sr, sc) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) isaret(sr + r, sc + c); };
    bulucu(0, 0); bulucu(0, boyut - 7); bulucu(boyut - 7, 0);
    for (let i = 0; i < boyut; i++) { isaret(6, i); isaret(i, 6); }
    const mk = HIZALAMA[surum] || [];
    mk.forEach(r => mk.forEach(c => {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= boyut - 9) || (r >= boyut - 9 && c <= 8)) return;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) isaret(r + dr, c + dc);
    }));
    isaret(boyut - 8, 8);
    for (let i = 0; i < 9; i++) { isaret(8, i); isaret(i, 8); }
    for (let i = 0; i < 8; i++) { isaret(8, boyut - 1 - i); isaret(boyut - 1 - i, 8); }
    if (surum >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { isaret(i, boyut - 11 + j); isaret(boyut - 11 + j, i); }
    return rez;
  }

  function bitleriOku(m, boyut, surum, maske) {
    const rez = rezerveHarita(surum, boyut);
    const bitler = [];
    let yukari = true;
    for (let sc = boyut - 1; sc > 0; sc -= 2) {
      if (sc === 6) sc--;
      for (let i = 0; i < boyut; i++) {
        const r = yukari ? boyut - 1 - i : i;
        for (let k = 0; k < 2; k++) {
          const c = sc - k;
          if (rez[r][c]) continue;
          let bit = m[r][c];
          if (MASKE[maske](r, c)) bit ^= 1;   // maskeyi kaldır
          bitler.push(bit);
        }
      }
      yukari = !yukari;
    }
    const kodlar = [];
    for (let i = 0; i + 8 <= bitler.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bitler[i + j];
      kodlar.push(b);
    }
    return kodlar;
  }

  function bloklariCoz(kodlar, surum, seviye) {
    const tablo = seviye === 'L' ? SURUMLER_L : SURUMLER;
    const bilgi = tablo[surum];
    if (!bilgi) throw new Error('Sürüm desteklenmiyor: ' + surum);
    const [, ecSayisi, gruplar] = bilgi;
    const veriUzunluklari = [];
    gruplar.forEach(([n, k]) => { for (let i = 0; i < n; i++) veriUzunluklari.push(k); });
    const blokSayisi = veriUzunluklari.length;

    // Serpiştirmeyi geri al
    const veriBloklari = veriUzunluklari.map(() => []);
    const enUzun = Math.max(...veriUzunluklari);
    let idx = 0;
    for (let i = 0; i < enUzun; i++) {
      for (let b = 0; b < blokSayisi; b++) {
        if (i < veriUzunluklari[b]) veriBloklari[b].push(kodlar[idx++]);
      }
    }
    const ecBloklari = veriBloklari.map(() => []);
    for (let i = 0; i < ecSayisi; i++) {
      for (let b = 0; b < blokSayisi; b++) ecBloklari[b].push(kodlar[idx++]);
    }
    // Her bloğu Reed-Solomon ile düzelt
    const sonuc = [];
    for (let b = 0; b < blokSayisi; b++) {
      const tam = veriBloklari[b].concat(ecBloklari[b]);
      const duzeltilmis = rsDuzelt(tam, ecSayisi);
      sonuc.push(...duzeltilmis.slice(0, veriUzunluklari[b]));
    }
    return sonuc;
  }

  function metniCoz(veri, surum) {
    const bitler = [];
    veri.forEach(b => { for (let i = 7; i >= 0; i--) bitler.push((b >> i) & 1); });
    let p = 0;
    const al = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | (bitler[p++] || 0); return v; };
    let metin = '';
    let guvenlik = 0;
    while (p < bitler.length - 4 && guvenlik++ < 40) {
      const mod = al(4);
      if (mod === 0b0000) break;                       // sonlandırıcı
      if (mod === 0b0100) {                            // byte modu
        const uz = al(surum <= 9 ? 8 : 16);
        const baytlar = [];
        for (let i = 0; i < uz; i++) baytlar.push(al(8));
        metin += new TextDecoder('utf-8').decode(new Uint8Array(baytlar));
      } else if (mod === 0b0010) {                     // alfanumerik
        const uz = al(surum <= 9 ? 9 : 11);
        const KARAKTER = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
        let kalan = uz;
        while (kalan >= 2) { const v = al(11); metin += KARAKTER[Math.floor(v / 45)] + KARAKTER[v % 45]; kalan -= 2; }
        if (kalan === 1) metin += KARAKTER[al(6)];
      } else if (mod === 0b0001) {                     // sayısal
        const uz = al(surum <= 9 ? 10 : 12);
        let kalan = uz;
        while (kalan >= 3) { metin += String(al(10)).padStart(3, '0'); kalan -= 3; }
        if (kalan === 2) metin += String(al(7)).padStart(2, '0');
        else if (kalan === 1) metin += String(al(4));
      } else break;                                     // desteklenmeyen mod
    }
    return metin;
  }

  // ── ANA ÇÖZÜM FONKSİYONU ────────────────────────────────────────────────
  // Girdi: gri tonlamalı piksel dizisi (0-255), genişlik, yükseklik
  // Çıktı: okunan metin veya null
  function griCoz(gri, gen, yuk) {
    const ikili = ikiliyeCevir(gri, gen, yuk);
    const bulucular = bulucuAra(ikili, gen, yuk);
    if (bulucular.length < 3) return null;
    const konum = bulucuYerlestir(bulucular);
    if (!konum) return null;

    // Sürümü tahmin et: bulucular arası mesafe / modül boyutu
    const mesafe = Math.hypot(konum.sagUst.x - konum.solUst.x, konum.sagUst.y - konum.solUst.y);
    const birim = (konum.solUst.birim + konum.sagUst.birim + konum.solAlt.birim) / 3;
    if (birim <= 0) return null;
    const tahminBoyut = Math.round(mesafe / birim) + 7;
    const tahminSurum = Math.round((tahminBoyut - 17) / 4);

    // Komşu sürümleri de dene (tahmin bir kayabilir)
    for (const s of [tahminSurum, tahminSurum - 1, tahminSurum + 1, tahminSurum - 2, tahminSurum + 2]) {
      if (s < 1 || s > 10) continue;
      const boyut = s * 4 + 17;
      const m = izgarayiOku(ikili, gen, yuk, konum, boyut);
      if (!m) continue;
      const format = formatCoz(m, boyut);
      if (!format) continue;
      try {
        const kodlar = bitleriOku(m, boyut, s, format.maske);
        const veri = bloklariCoz(kodlar, s, format.seviye);
        const metin = metniCoz(veri, s);
        if (metin && metin.length) return metin;
      } catch (e) { /* bu sürüm tutmadı, sonrakini dene */ }
    }
    return null;
  }

  // Canvas bağlamından oku (kamera karesi için)
  function canvastanOku(ctx, gen, yuk) {
    let veri;
    try { veri = ctx.getImageData(0, 0, gen, yuk).data; } catch (e) { return null; }
    const gri = new Uint8Array(gen * yuk);
    for (let i = 0, j = 0; i < veri.length; i += 4, j++) {
      // Luma (insan gözüne göre ağırlıklı gri)
      gri[j] = (veri[i] * 77 + veri[i + 1] * 150 + veri[i + 2] * 29) >> 8;
    }
    // Önce tam kare, olmazsa merkez bölgeyi büyüterek dene (uzak QR için)
    let sonuc = griCoz(gri, gen, yuk);
    if (sonuc) return sonuc;
    const kx = Math.floor(gen * 0.2), ky = Math.floor(yuk * 0.2);
    const kg = gen - kx * 2, kyy = yuk - ky * 2;
    if (kg > 60 && kyy > 60) {
      const merkez = new Uint8Array(kg * kyy);
      for (let y = 0; y < kyy; y++) {
        for (let x = 0; x < kg; x++) merkez[y * kg + x] = gri[(y + ky) * gen + (x + kx)];
      }
      sonuc = griCoz(merkez, kg, kyy);
    }
    return sonuc;
  }

  return { canvastanOku, griCoz, ikiliyeCevir, bulucuAra, rsDuzelt };
})();
