// ════════════════════════════════════════════════════════════════════════════
// MASA / WORKSTATION TEKNİK RESİM ÇİZİM MOTORU
//
// dolap_cizim.js ile aynı ilke: SAF ÇİZİM. Girdisi doğrudan
// MasaHesap.hesapla() çıktısıdır.
//
// Üç görünüş üretir:
//   ustten()  — PLAN görünüşü: tablalar, sıra ayrımı, ayak konumları, ölçüler
//               Tablalar tıklanabilir (class="mc-tabla" data-i="sıra no")
//   onden()   — cephe: ayak yüksekliği, tabla kalınlığı, travers, perde
//   ucBoyut() — 30° paralel projeksiyon
// ════════════════════════════════════════════════════════════════════════════
const MasaCizim = (() => {

  const C = {
    hat: 'var(--text2, #555)', ince: 'var(--border, #ccc)',
    tabla: 'var(--blue-bg, #e8f0fe)', govde: 'var(--surface2, #f2f2f2)',
    metal: 'var(--amber-bg, #fdf2d0)', metalHat: 'var(--amber-text, #8a5a00)',
    olcu: 'var(--blue-text, #1a56db)', yazi: 'var(--text, #222)',
    secili: 'var(--green-bg, #d9f2e3)', seciliHat: 'var(--green-text, #067647)'
  };

  function ok(x1, y1, x2, y2, etiket, dikey) {
    const u = 5;
    const bas = dikey ? `M${x1 - 3},${y1 + u} L${x1},${y1} L${x1 + 3},${y1 + u}`
                      : `M${x1 + u},${y1 - 3} L${x1},${y1} L${x1 + u},${y1 + 3}`;
    const son = dikey ? `M${x2 - 3},${y2 - u} L${x2},${y2} L${x2 + 3},${y2 - u}`
                      : `M${x2 - u},${y2 - 3} L${x2},${y2} L${x2 - u},${y2 + 3}`;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const at = dikey ? `x="${mx - 5}" y="${my}" text-anchor="middle" transform="rotate(-90 ${mx - 5} ${my})"`
                     : `x="${mx}" y="${my - 5}" text-anchor="middle"`;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.olcu}" stroke-width="1"/>
      <path d="${bas}" fill="none" stroke="${C.olcu}" stroke-width="1"/>
      <path d="${son}" fill="none" stroke="${C.olcu}" stroke-width="1"/>
      <text ${at} font-size="10" fill="${C.olcu}" font-family="ui-monospace,monospace">${etiket}</text>`;
  }
  const baslik = (W, H, m) =>
    `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="10.5" fill="${C.yazi}" font-weight="700" font-family="system-ui">${m}</text>`;
  const bos = (m) => `<svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
      <text x="100" y="58" text-anchor="middle" font-size="11" fill="${C.hat}" font-family="system-ui">${m}</text></svg>`;

  function geo(h) {
    const c = h.yapilandirma, y = h.yerlesim;
    return {
      c, y,
      TB: +c.tablaBoy, TE: +c.tablaEn, TK: +c.tablaKalinlik,
      ara: +c.siraArasiBosluk || 0,
      ayakY: +c.ayakYukseklik || 720,
      boy: y.toplamBoy, en: y.toplamEn
    };
  }

  // ── ÜSTTEN GÖRÜNÜŞ (PLAN) ────────────────────────────────────────────────
  function ustten(h, secili) {
    if (!h || !h.paneller.length) return bos('Geçerli ölçü girin');
    const g = geo(h);
    const W = 470, HH = 330, pad = 52;
    const sc = Math.min((W - 2 * pad) / g.boy, (HH - 2 * pad) / g.en);
    const p = (mm) => mm * sc;
    const gw = p(g.boy), gh = p(g.en);
    const x0 = (W - gw) / 2, y0 = (HH - gh) / 2 - 4;

    let s = `<svg class="mc-svg" viewBox="0 0 ${W} ${HH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">`;
    // Gabari
    s += `<rect x="${x0}" y="${y0}" width="${gw}" height="${gh}" fill="none" stroke="${C.ince}" stroke-width="1" stroke-dasharray="4 3"/>`;

    const siraSayisi = g.y.siraSayisi, siraTabla = g.y.siraBasiTabla;
    const tw = p(g.TB), th = p(g.TE);
    let sayac = 0;
    for (let r = 0; r < siraSayisi; r++) {
      const sy = y0 + (r === 0 ? 0 : th + p(g.ara));
      for (let i = 0; i < siraTabla; i++) {
        // Tek sayıda kişide ikinci sıra eksik kalabilir
        if (sayac >= g.y.siraBasiTabla * siraSayisi) break;
        if (r === 1 && (sayac >= h.ozet.tablaAdedi)) break;
        const tx = x0 + i * tw;
        const sec = (secili === sayac);
        s += `<rect class="mc-tabla" data-i="${sayac}" x="${tx + 1}" y="${sy + 1}" width="${tw - 2}" height="${th - 2}" rx="2"
          fill="${sec ? C.secili : C.tabla}" stroke="${sec ? C.seciliHat : C.hat}" stroke-width="${sec ? 2 : 1}" style="cursor:pointer"/>`;
        s += `<text x="${tx + tw / 2}" y="${sy + th / 2 + 3}" text-anchor="middle" font-size="9.5"
          fill="${C.hat}" font-family="ui-monospace,monospace" pointer-events="none">${sayac + 1}</text>`;
        sayac++;
      }
    }
    // Sıra arası boşluk (karşılıklı)
    if (siraSayisi === 2 && g.ara > 0) {
      s += `<rect x="${x0}" y="${y0 + th}" width="${gw}" height="${p(g.ara)}" fill="${C.govde}" stroke="${C.ince}" stroke-width=".6"/>`;
    }
    // Ayak konumları — plan üzerinde kare sembol
    const konum = g.y.ayakKonumSayisi;
    for (let k = 0; k < konum; k++) {
      const ax = x0 + (gw * k / (konum - 1 || 1));
      const ucMu = (k === 0 || k === konum - 1);
      const boyut = 9;
      s += `<rect x="${ax - boyut / 2}" y="${y0 + gh / 2 - boyut / 2}" width="${boyut}" height="${boyut}" rx="1.5"
        fill="${C.metal}" stroke="${C.metalHat}" stroke-width="1.2"/>`;
      s += `<text x="${ax}" y="${y0 + gh + 14}" text-anchor="middle" font-size="8" fill="${C.metalHat}"
        font-family="system-ui">${ucMu ? 'uç' : (g.y.araAyakTipi === 'kutu' ? 'kutu' : 'çift')}</text>`;
    }
    // Ölçüler
    s += ok(x0, y0 - 16, x0 + gw, y0 - 16, g.boy + ' mm', false);
    s += ok(x0 - 16, y0, x0 - 16, y0 + gh, g.en + ' mm', true);
    s += baslik(W, HH, 'ÜSTTEN GÖRÜNÜŞ (PLAN) — tablaya tıklayın');
    return s + '</svg>';
  }

  // ── ÖNDEN GÖRÜNÜŞ (CEPHE) ────────────────────────────────────────────────
  function onden(h) {
    if (!h || !h.paneller.length) return bos('—');
    const g = geo(h);
    const W = 470, HH = 250, pad = 46;
    const toplamY = g.ayakY + g.TK;
    const sc = Math.min((W - 2 * pad) / g.boy, (HH - 2 * pad) / toplamY);
    const p = (mm) => mm * sc;
    const gw = p(g.boy), gh = p(toplamY);
    const x0 = (W - gw) / 2, y0 = (HH - gh) / 2 - 4;

    let s = `<svg class="mc-svg" viewBox="0 0 ${W} ${HH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">`;
    // Tabla (üstte, kalınlığı ölçekli)
    s += `<rect x="${x0}" y="${y0}" width="${gw}" height="${Math.max(p(g.TK), 2)}" fill="${C.tabla}" stroke="${C.hat}" stroke-width="1.2"/>`;
    // Tabla ekleri (kişi başına bölünme çizgileri)
    for (let i = 1; i < g.y.siraBasiTabla; i++) {
      const lx = x0 + gw * i / g.y.siraBasiTabla;
      s += `<line x1="${lx}" y1="${y0}" x2="${lx}" y2="${y0 + Math.max(p(g.TK), 2)}" stroke="${C.hat}" stroke-width=".8"/>`;
    }
    // Ayaklar
    const konum = g.y.ayakKonumSayisi;
    const ayakGen = Math.max(6, p(60));
    for (let k = 0; k < konum; k++) {
      let ax = x0 + (gw * k / (konum - 1 || 1)) - ayakGen / 2;
      ax = Math.max(x0, Math.min(ax, x0 + gw - ayakGen));
      s += `<rect x="${ax}" y="${y0 + p(g.TK)}" width="${ayakGen}" height="${p(g.ayakY)}" fill="${C.metal}" stroke="${C.metalHat}" stroke-width="1.1"/>`;
      // Ayarlı pingo ayak
      s += `<rect x="${ax + 1}" y="${y0 + gh - 3}" width="${ayakGen - 2}" height="3" fill="${C.metalHat}" opacity=".55"/>`;
    }
    // Travers (ayaklar arası yatay bağ)
    if (g.c.traversVar) {
      const ty = y0 + p(g.TK) + p(g.ayakY) * 0.28;
      s += `<rect x="${x0 + ayakGen / 2}" y="${ty}" width="${gw - ayakGen}" height="${Math.max(4, p(60))}"
        fill="${C.metal}" stroke="${C.metalHat}" stroke-width="1" opacity=".85"/>`;
      s += `<text x="${x0 + gw / 2}" y="${ty + Math.max(4, p(60)) / 2 + 3}" text-anchor="middle" font-size="8"
        fill="${C.metalHat}" font-family="system-ui">TRAVERS</text>`;
    }
    // Perde / modesty
    if (g.c.perdeVar || g.c.modestyVar) {
      const py = y0 + p(g.TK);
      const ph = p(g.c.perdeVar ? g.c.perdeYukseklik : g.c.modestyYukseklik);
      s += `<rect x="${x0 + ayakGen}" y="${py}" width="${gw - 2 * ayakGen}" height="${ph}"
        fill="${C.tabla}" stroke="${C.hat}" stroke-width=".9" opacity=".8"/>`;
      s += `<text x="${x0 + gw / 2}" y="${py + ph / 2 + 3}" text-anchor="middle" font-size="8" fill="${C.hat}"
        font-family="system-ui">${g.c.perdeVar ? 'PERDE' : 'MODESTY'}</text>`;
    }
    s += ok(x0, y0 - 16, x0 + gw, y0 - 16, g.boy + ' mm', false);
    s += ok(x0 + gw + 14, y0, x0 + gw + 14, y0 + gh, 'H ' + Math.round(toplamY), true);
    s += baslik(W, HH, 'ÖNDEN GÖRÜNÜŞ (CEPHE)');
    return s + '</svg>';
  }

  // ── 3B PERSPEKTİF ────────────────────────────────────────────────────────
  function ucBoyut(h) {
    if (!h || !h.paneller.length) return bos('—');
    const g = geo(h);
    const W = 340, HH = 300, aci = Math.PI / 6, kx = Math.cos(aci), ky = Math.sin(aci), pad = 30;
    const toplamY = g.ayakY + g.TK;
    const sc = Math.min((W - 2 * pad) / (g.boy + g.en * kx), (HH - 2 * pad) / (toplamY + g.en * ky));
    const p = (mm) => mm * sc;
    const gw = p(g.boy), dd = p(g.en);
    const ox = dd * kx, oy = dd * ky;
    const x0 = pad, y0 = HH - pad - p(toplamY) - 12;

    let s = `<svg class="mc-svg" viewBox="0 0 ${W} ${HH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">`;
    // Tabla üst yüzü
    s += `<path d="M${x0},${y0} L${x0 + ox},${y0 - oy} L${x0 + ox + gw},${y0 - oy} L${x0 + gw},${y0} Z"
      fill="${C.tabla}" stroke="${C.hat}" stroke-width="1.2"/>`;
    // Tabla kalınlığı (ön kenar)
    const tk = Math.max(p(g.TK), 2.5);
    s += `<rect x="${x0}" y="${y0}" width="${gw}" height="${tk}" fill="${C.govde}" stroke="${C.hat}" stroke-width="1"/>`;
    s += `<path d="M${x0 + gw},${y0} L${x0 + gw + ox},${y0 - oy} L${x0 + gw + ox},${y0 - oy + tk} L${x0 + gw},${y0 + tk} Z"
      fill="${C.govde}" stroke="${C.hat}" stroke-width="1"/>`;
    // Tabla ayrım çizgileri (üst yüzde)
    for (let i = 1; i < g.y.siraBasiTabla; i++) {
      const fx = x0 + gw * i / g.y.siraBasiTabla;
      s += `<line x1="${fx}" y1="${y0}" x2="${fx + ox}" y2="${y0 - oy}" stroke="${C.hat}" stroke-width=".7"/>`;
    }
    if (g.y.siraSayisi === 2) {
      // Karşılıklı sıra ayrımı — derinliğin ortasında
      const my = 0.5;
      s += `<line x1="${x0 + ox * my}" y1="${y0 - oy * my}" x2="${x0 + gw + ox * my}" y2="${y0 - oy * my}"
        stroke="${C.hat}" stroke-width=".9" stroke-dasharray="4 3"/>`;
    }
    // Ayaklar
    const konum = g.y.ayakKonumSayisi, ag = Math.max(5, p(60));
    for (let k = 0; k < konum; k++) {
      let ax = x0 + (gw * k / (konum - 1 || 1)) - ag / 2;
      ax = Math.max(x0, Math.min(ax, x0 + gw - ag));
      s += `<rect x="${ax}" y="${y0 + tk}" width="${ag}" height="${p(g.ayakY)}" fill="${C.metal}" stroke="${C.metalHat}" stroke-width="1"/>`;
      // Arka ayak izi
      s += `<rect x="${ax + ox * 0.85}" y="${y0 + tk - oy * 0.85}" width="${ag}" height="${p(g.ayakY)}"
        fill="${C.metal}" stroke="${C.metalHat}" stroke-width=".7" opacity=".5"/>`;
    }
    s += ok(x0 + gw + 8, y0 + 2, x0 + gw + ox + 8, y0 - oy + 2, String(g.en), false);
    s += baslik(W, HH, '3B PERSPEKTİF');
    return s + '</svg>';
  }

  return { ustten, onden, ucBoyut };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MasaCizim;
