// ════════════════════════════════════════════════════════════════════════════
// DOLAP TEKNİK RESİM ÇİZİM MOTORU
//
// Bu dosya da SAF ÇİZİMDİR — Store'a, App'e dokunmaz. Girdisi doğrudan
// DolapHesap.hesapla() çıktısıdır; ondan başka hiçbir şey bilmez. Böylece
// ölçü hesabı ile çizim tek kaynaktan beslenir: tabloda gördüğünüz ölçü ile
// resimde gördüğünüz ölçü ayrışamaz.
//
// Üç görünüş üretir:
//   onden()  — bölmeler tıklanabilir (class="dc-bolme" data-i="bölme sırası"),
//              raf/kapak/çekmece sembolleri, genişlik-yükseklik ölçü okları
//   yandan() — derinlik kesiti: arkalık ve arkadan mesafesi, raf geri çekmesi
//   ucBoyut()— 30° paralel projeksiyon (izometrik benzeri) perspektif
//
// Renkler CSS değişkenlerinden gelir; açık/koyu temada resim kendiliğinden uyar.
// Ölçekleme her görünüşte otomatiktir: hangi ölçüyü girerseniz girin resim
// çerçeveye sığar.
// ════════════════════════════════════════════════════════════════════════════
const DolapCizim = (() => {

  const C = {
    hat: 'var(--text2, #555)',
    ince: 'var(--border, #ccc)',
    govde: 'var(--surface2, var(--bg2, #f2f2f2))',
    panel: 'var(--blue-bg, #e8f0fe)',
    olcu: 'var(--blue-text, #1a56db)',
    yazi: 'var(--text, #222)',
    secili: 'var(--green-bg, #d9f2e3)',
    seciliHat: 'var(--green-text, #067647)',
    vurgu: 'var(--amber-bg, #fdf2d0)'
  };

  // Ölçü oku: iki uçta ok başı, ortada mm etiketi
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

  const baslik = (W, H, metin) =>
    `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="10.5" fill="${C.yazi}" font-weight="700" font-family="system-ui">${metin}</text>`;

  // Hesap çıktısından ortak geometri
  function geo(h) {
    const c = h.yapilandirma;
    const t = +c.panelKalinlik;
    return {
      c, t,
      W: +c.genislik, D: +c.derinlik,
      govdeH: h.ozet.govdeYukseklik,
      // Taç kalınlık verilmişse gövde üstünde kalınlığı kadar yer kaplar
      tacY: c.ustTac ? ((+c.ustTacKalinlik > 0) ? +c.ustTacKalinlik : (+c.ustTacYukseklik || 0)) : 0,
      tacAralarinaMi: c.ustTacKonum === 'aralarina',
      bazaY: c.bazaTipi === 'baza' ? +c.bazaYukseklik : 0,
      ayakY: c.bazaTipi === 'ayak' ? (+c.ayakYukseklik || 0) : 0,
      arkaT: +c.arkalikKalinlik,
      arkaMes: +c.arkalikArkadanMesafe || 0,
      bolmeler: h.bolmeler || []
    };
  }

  // ── ÖNDEN GÖRÜNÜŞ ─────────────────────────────────────────────────────────
  function onden(h, secili) {
    if (!h || !h.paneller.length) return bosCizim('Geçerli ölçü girin');
    const g = geo(h), c = g.c;
    const EN = 460, BOY = 430, pay = 50;
    const toplam = g.tacY + g.govdeH + g.bazaY + g.ayakY;
    const sc = Math.min((EN - 2 * pay) / g.W, (BOY - 2 * pay) / toplam);
    const p = (mm) => mm * sc;
    const gw = p(g.W), gh = p(g.govdeH), t = p(g.t);
    const x0 = (EN - gw) / 2 + 6;
    const y0 = (BOY - p(toplam)) / 2 + p(g.tacY);
    const X = (mm) => x0 + p(mm), Y = (mm) => y0 + p(mm);

    let s = `<svg class="dc-svg" viewBox="0 0 ${EN} ${BOY}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;touch-action:none">`;

    // Üst taç
    if (g.tacY > 0) {
      // 'aralarina' konumunda taç yanların arasına girer → yanlar kadar dışarı taşmaz
      const tx = g.tacAralarinaMi ? x0 + t : x0 - 2;
      const tw = g.tacAralarinaMi ? gw - 2 * t : gw + 4;
      s += `<rect x="${tx}" y="${y0 - p(g.tacY)}" width="${tw}" height="${p(g.tacY)}" fill="${C.panel}" stroke="${C.hat}" stroke-width="1"/>`;
    }
    // Gövde gövdesi ve panel kalınlıkları
    s += `<rect x="${x0}" y="${y0}" width="${gw}" height="${gh}" fill="${C.govde}" stroke="${C.hat}" stroke-width="1.5"/>`;
    s += `<rect x="${x0}" y="${y0}" width="${t}" height="${gh}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".6"/>`;
    s += `<rect x="${x0 + gw - t}" y="${y0}" width="${t}" height="${gh}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".6"/>`;
    s += `<rect x="${x0 + t}" y="${y0}" width="${gw - 2 * t}" height="${t}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".6"/>`;
    s += `<rect x="${x0 + t}" y="${y0 + gh - t}" width="${gw - 2 * t}" height="${t}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".6"/>`;

    // Bölmeler
    g.bolmeler.forEach((b, i) => {
      const bx = X(b.x), by = Y(b.y), bw = p(b.genislik), bh = p(b.yukseklik);
      const sec = (secili === i);
      const cekH = (b.cekmeceSayisi || 0) * (b.cekmeceYukseklik || 0);
      const ustAlan = bh - p(cekH);

      // Tıklanabilir alan
      s += `<rect class="dc-bolme" data-i="${i}" x="${bx}" y="${by}" width="${bw}" height="${bh}"
        fill="${sec ? C.secili : 'transparent'}" stroke="${sec ? C.seciliHat : 'transparent'}"
        stroke-width="${sec ? 2 : 0}" style="cursor:pointer"/>`;

      // Raflar — sabit dolu, hareketli kesikli. Manuel konum verilmişse
      // raf tam o mm konumuna çizilir; verilmemişse eşit dağıtılır.
      const raflar = b.raflar || [];
      raflar.forEach((rf, ri) => {
        const ry = (rf.konum > 0) ? Y(b.y + rf.konum)
                                  : by + ustAlan * (ri + 1) / (raflar.length + 1);
        s += `<rect x="${bx}" y="${ry - Math.max(t, 1.4) / 2}" width="${bw}" height="${Math.max(t, 1.4)}"
          fill="${C.panel}" stroke="${C.hat}" stroke-width=".6" ${rf.tip === 'sabit' ? '' : 'stroke-dasharray="5 2"'}/>`;
        // Rafın ALTINA askı borusu: kesitte daire, önden görünüşte çizgi
        if (rf.askiBorusu) {
          const ay = ry + Math.max(t, 1.4) / 2 + 6;
          s += `<line x1="${bx + 5}" y1="${ay}" x2="${bx + bw - 5}" y2="${ay}" stroke="${C.seciliHat}" stroke-width="2.6" stroke-linecap="round"/>`;
          s += `<circle cx="${bx + 5}" cy="${ay}" r="2.2" fill="${C.seciliHat}"/><circle cx="${bx + bw - 5}" cy="${ay}" r="2.2" fill="${C.seciliHat}"/>`;
        }
      });
      // Çekmeceler (alt bölge)
      if (b.cekmeceSayisi > 0) {
        const ch = p(cekH) / b.cekmeceSayisi;
        for (let k = 0; k < b.cekmeceSayisi; k++) {
          const cy = by + ustAlan + k * ch;
          s += `<rect x="${bx + 1}" y="${cy + 1}" width="${bw - 2}" height="${ch - 2}" rx="1.5" fill="none" stroke="${C.hat}" stroke-width="1"/>`;
          s += `<line x1="${bx + bw / 2 - 10}" y1="${cy + ch / 2}" x2="${bx + bw / 2 + 10}" y2="${cy + ch / 2}" stroke="${C.hat}" stroke-width="2.2" stroke-linecap="round"/>`;
        }
      }
      // Kapaklar — kesikli çerçeve (arkasındaki raflar görünsün) + kulp
      if (b.kapakSayisi > 0) {
        const kw = bw / b.kapakSayisi;
        for (let k = 0; k < b.kapakSayisi; k++) {
          const kx = bx + k * kw;
          s += `<rect x="${kx + 1}" y="${by + 1}" width="${kw - 2}" height="${ustAlan - 2}" rx="1.5"
            fill="none" stroke="${C.hat}" stroke-width="1.1" stroke-dasharray="5 3"/>`;
          if (c.kulpVar) {
            const solMu = (b.kapakSayisi === 1) ? true : (k < b.kapakSayisi / 2);
            const hx = solMu ? kx + kw - 7 : kx + 7;
            s += `<line x1="${hx}" y1="${by + ustAlan / 2 - 11}" x2="${hx}" y2="${by + ustAlan / 2 + 11}" stroke="${C.hat}" stroke-width="2.4" stroke-linecap="round"/>`;
          }
        }
      }
      // Bölme numarası
      s += `<text x="${bx + 4}" y="${by + 12}" font-size="9" fill="${C.hat}" font-family="ui-monospace,monospace" pointer-events="none">${i + 1}</text>`;
    });

    // Dikey ayraçlar (bölmeler arasındaki boşluklar)
    for (let i = 0; i < g.bolmeler.length - 1; i++) {
      const b = g.bolmeler[i];
      s += `<rect x="${X(b.x + b.genislik)}" y="${Y(b.y)}" width="${t}" height="${p(b.yukseklik)}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".6"/>`;
    }

    // Üst kayıt / profil
    if (c.ustSistem === 'kayit_yatay' || c.ustSistem === 'profil_metal' || c.ustSistem === 'profil_aluminyum') {
      const kg = p(+c.kayitGenislik || 100);
      const metal = c.ustSistem !== 'kayit_yatay';
      const adet = Math.max(1, +c.kayitAdet || 1);
      for (let i = 0; i < adet; i++) {
        const cy = i === 0 ? y0 + t : y0 + gh - t - kg;
        s += `<rect x="${x0 + t}" y="${cy}" width="${gw - 2 * t}" height="${kg}" fill="${metal ? C.vurgu : C.panel}" stroke="${C.hat}" stroke-width=".8"/>`;
      }
    } else if (c.ustSistem === 'kayit_dikey') {
      const kg = p(+c.kayitGenislik || 100);
      const adet = Math.max(1, +c.kayitAdet || 1);
      for (let i = 0; i < adet; i++) {
        const cx = x0 + t + (gw - 2 * t) * (i + 1) / (adet + 1);
        s += `<rect x="${cx - kg / 2}" y="${y0 + t}" width="${kg}" height="${gh - 2 * t}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".8"/>`;
      }
    }

    // Baza / ayak
    if (g.bazaY > 0) {
      s += `<rect x="${x0}" y="${y0 + gh}" width="${gw}" height="${p(g.bazaY)}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".8"/>`;
    } else if (g.ayakY > 0) {
      const adet = Math.max(2, Math.round((c.ayakOtomatik ? (g.W <= 900 ? 4 : g.W <= 1500 ? 6 : 8) : (+c.ayakAdet || 4)) / 2));
      for (let i = 0; i < adet; i++) {
        const ax = x0 + 8 + (gw - 16 - 8) * (adet === 1 ? 0.5 : i / (adet - 1));
        s += `<rect x="${ax}" y="${y0 + gh}" width="8" height="${p(g.ayakY)}" rx="1.5" fill="${C.panel}" stroke="${C.hat}" stroke-width=".8"/>`;
      }
    }

    // Ölçü okları
    s += ok(x0, y0 - p(g.tacY) - 16, x0 + gw, y0 - p(g.tacY) - 16, g.W + ' mm', false);
    s += ok(x0 - 16, y0, x0 - 16, y0 + gh, 'gövde ' + g.govdeH, true);
    s += ok(x0 + gw + 14, y0 - p(g.tacY), x0 + gw + 14, y0 + gh + p(g.bazaY + g.ayakY), 'toplam ' + (g.tacY + g.govdeH + g.bazaY + g.ayakY), true);
    s += baslik(EN, BOY, g.bolmeler.length > 1 ? 'ÖNDEN GÖRÜNÜŞ — bölmeye tıklayın' : 'ÖNDEN GÖRÜNÜŞ');
    return s + '</svg>';
  }

  // ── YANDAN GÖRÜNÜŞ (derinlik kesiti) ──────────────────────────────────────
  function yandan(h) {
    if (!h || !h.paneller.length) return bosCizim('—');
    const g = geo(h), c = g.c;
    const EN = 250, BOY = 430, pay = 48;
    const toplam = g.tacY + g.govdeH + g.bazaY + g.ayakY;
    const sc = Math.min((EN - 2 * pay) / g.D, (BOY - 2 * pay) / toplam);
    const p = (mm) => mm * sc;
    const dw = p(g.D), gh = p(g.govdeH), t = p(g.t);
    const x0 = (EN - dw) / 2 + 4;
    const y0 = (BOY - p(toplam)) / 2 + p(g.tacY);
    const arka = Math.max(p(g.arkaT), 1.4), arkaMes = p(g.arkaMes);
    const rafGeri = p(+c.rafGeriCekme || 0);

    let s = `<svg class="dc-svg" viewBox="0 0 ${EN} ${BOY}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">`;
    if (g.tacY > 0) s += `<rect x="${x0}" y="${y0 - p(g.tacY)}" width="${dw}" height="${p(g.tacY)}" fill="${C.panel}" stroke="${C.hat}" stroke-width="1"/>`;
    s += `<rect x="${x0}" y="${y0}" width="${dw}" height="${gh}" fill="${C.govde}" stroke="${C.hat}" stroke-width="1.5"/>`;
    // Üst / alt tabla kesiti
    s += `<rect x="${x0}" y="${y0}" width="${dw}" height="${t}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".7"/>`;
    s += `<rect x="${x0}" y="${y0 + gh - t}" width="${dw}" height="${t}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".7"/>`;
    // Arkalık — arkadan mesafesiyle konumlanır
    if (c.arkalikTipi !== 'yok') {
      const ax = x0 + dw - arkaMes - arka;
      const ay = c.arkalikTipi === 'sirtli' ? y0 : y0 + t;
      const ah = c.arkalikTipi === 'sirtli' ? gh : gh - 2 * t;
      s += `<rect x="${ax}" y="${ay}" width="${arka}" height="${ah}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".7"/>`;
      if (g.arkaMes > 0) s += ok(ax + arka, y0 + gh + 12, x0 + dw, y0 + gh + 12, g.arkaMes + '', false);
    }
    // Raflar — arkaya dayalı, önden geri çekik
    const rafD = dw - arkaMes - arka - rafGeri;
    g.bolmeler.forEach(b => {
      const raflar = b.raflar || [];
      const cekH = (b.cekmeceSayisi || 0) * (b.cekmeceYukseklik || 0);
      const ustAlan = p(b.yukseklik - cekH);
      raflar.forEach((rf, ri) => {
        const ry = (rf.konum > 0) ? y0 + p(b.y + rf.konum)
                                  : y0 + p(b.y) + ustAlan * (ri + 1) / (raflar.length + 1);
        s += `<rect x="${x0 + dw - arkaMes - arka - rafD}" y="${ry - 1}" width="${rafD}" height="${Math.max(t, 1.4)}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".5" ${rf.tip === 'sabit' ? '' : 'stroke-dasharray="4 2"'}/>`;
        // Askı borusu kesitte daire olarak görünür
        if (rf.askiBorusu) {
          s += `<circle cx="${x0 + dw - arkaMes - arka - rafD / 2}" cy="${ry + 8}" r="3.2" fill="none" stroke="${C.seciliHat}" stroke-width="1.6"/>`;
        }
      });
      // Çekmece kutuları (kesit)
      for (let k = 0; k < (b.cekmeceSayisi || 0); k++) {
        const cy = y0 + p(b.y) + ustAlan + k * p(b.cekmeceYukseklik);
        s += `<rect x="${x0 + 3}" y="${cy + 2}" width="${rafD - 4}" height="${p(b.cekmeceYukseklik) - 4}" fill="none" stroke="${C.hat}" stroke-width=".8" stroke-dasharray="3 2"/>`;
      }
    });
    // Baza / ayak
    if (g.bazaY > 0) s += `<rect x="${x0}" y="${y0 + gh}" width="${dw}" height="${p(g.bazaY)}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".8"/>`;
    else if (g.ayakY > 0) [x0 + 8, x0 + dw - 16].forEach(ax => {
      s += `<rect x="${ax}" y="${y0 + gh}" width="8" height="${p(g.ayakY)}" rx="1.5" fill="${C.panel}" stroke="${C.hat}" stroke-width=".8"/>`;
    });

    s += ok(x0, y0 - p(g.tacY) - 16, x0 + dw, y0 - p(g.tacY) - 16, g.D + ' mm', false);
    s += baslik(EN, BOY, 'YANDAN GÖRÜNÜŞ (kesit)');
    return s + '</svg>';
  }

  // ── 3B PERSPEKTİF (30° paralel projeksiyon) ───────────────────────────────
  function ucBoyut(h) {
    if (!h || !h.paneller.length) return bosCizim('—');
    const g = geo(h), c = g.c;
    const EN = 320, BOY = 430, aci = Math.PI / 6, kx = Math.cos(aci), ky = Math.sin(aci), pay = 30;
    const toplam = g.tacY + g.govdeH + g.bazaY + g.ayakY;
    const sc = Math.min((EN - 2 * pay) / (g.W + g.D * kx), (BOY - 2 * pay) / (toplam + g.D * ky));
    const p = (mm) => mm * sc;
    const gw = p(g.W), gh = p(g.govdeH), dd = p(g.D);
    const ox = dd * kx, oy = dd * ky;
    const x0 = pay, y0 = BOY - pay - gh - p(g.bazaY + g.ayakY) - 14;

    let s = `<svg class="dc-svg" viewBox="0 0 ${EN} ${BOY}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">`;
    // Üst yüz
    s += `<path d="M${x0},${y0} L${x0 + ox},${y0 - oy} L${x0 + ox + gw},${y0 - oy} L${x0 + gw},${y0} Z" fill="${C.panel}" stroke="${C.hat}" stroke-width="1.1"/>`;
    // Sağ yan yüz
    s += `<path d="M${x0 + gw},${y0} L${x0 + gw + ox},${y0 - oy} L${x0 + gw + ox},${y0 - oy + gh} L${x0 + gw},${y0 + gh} Z" fill="${C.govde}" stroke="${C.hat}" stroke-width="1.1"/>`;
    // Ön yüz
    s += `<rect x="${x0}" y="${y0}" width="${gw}" height="${gh}" fill="var(--card, #fff)" stroke="${C.hat}" stroke-width="1.4"/>`;

    const P = (mm) => p(mm);
    const tP = P(g.t), fpx = P(+c.fuga || 0);
    g.bolmeler.forEach((b, i) => {
      const bx = x0 + P(b.x), by = y0 + P(b.y), bw = P(b.genislik), bh = P(b.yukseklik);
      const cekH = (b.cekmeceSayisi || 0) * (b.cekmeceYukseklik || 0);
      const ustAlan = bh - P(cekH);
      if (i < g.bolmeler.length - 1) {
        s += `<line x1="${bx + bw}" y1="${y0}" x2="${bx + bw}" y2="${y0 + gh}" stroke="${C.hat}" stroke-width="1"/>`;
      }
      if (b.kapakSayisi > 0) {
        // Kapak tipi (tam bini/yarım bini/içerlek) kapağın bölme boşluğuna
        // göre KONUMUNU değiştirir — dolap_hesap.js'teki kapakOlcu() ve
        // dolap_render.js'teki aynı mantık (bkz. oradaki yorum).
        let kapX, kapW, kapY, kapH;
        if (c.kapakTipi === 'icerlek') {
          kapX = bx + tP + fpx; kapW = bw - 2 * (tP + fpx);
          kapY = by + tP + fpx; kapH = ustAlan - 2 * (tP + fpx);
        } else {
          const tasma = c.kapakTipi === 'yarim_bini' ? tP / 2 : tP;
          kapX = bx - tasma; kapW = bw + 2 * tasma;
          kapY = by - tasma; kapH = ustAlan + 2 * tasma;
        }
        const adet = b.kapakSayisi;
        const kw = (kapW - (adet - 1) * fpx) / adet;
        for (let k = 0; k < adet; k++) {
          const kx = kapX + k * (kw + fpx);
          s += `<rect x="${kx}" y="${kapY}" width="${kw}" height="${kapH}" fill="none" stroke="${C.hat}" stroke-width=".9"/>`;
        }
      } else {
        const rafTop = (b.rafSabit || 0) + (b.rafHareketli || 0);
        for (let r = 1; r <= rafTop; r++) {
          const ry = by + ustAlan * r / (rafTop + 1);
          s += `<line x1="${bx}" y1="${ry}" x2="${bx + bw}" y2="${ry}" stroke="${C.ince}" stroke-width="1"/>`;
        }
      }
      for (let k = 0; k < (b.cekmeceSayisi || 0); k++) {
        const ch = P(cekH) / b.cekmeceSayisi;
        s += `<rect x="${bx + 1}" y="${by + ustAlan + k * ch + 1}" width="${bw - 2}" height="${ch - 2}" fill="none" stroke="${C.hat}" stroke-width=".9"/>`;
      }
    });

    if (g.bazaY > 0) s += `<rect x="${x0}" y="${y0 + gh}" width="${gw}" height="${p(g.bazaY)}" fill="${C.panel}" stroke="${C.hat}" stroke-width=".9"/>`;
    else if (g.ayakY > 0) [x0 + 6, x0 + gw - 14].forEach(ax => {
      s += `<rect x="${ax}" y="${y0 + gh}" width="8" height="${p(g.ayakY)}" rx="1.5" fill="${C.panel}" stroke="${C.hat}" stroke-width=".9"/>`;
    });
    s += ok(x0 + gw + 8, y0 + 2, x0 + gw + ox + 8, y0 - oy + 2, String(g.D), false);
    s += baslik(EN, BOY, '3B PERSPEKTİF');
    return s + '</svg>';
  }

  function bosCizim(metin) {
    return `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
      <text x="100" y="62" text-anchor="middle" font-size="11" fill="${C.hat}" font-family="system-ui">${metin}</text></svg>`;
  }

  // Üç görünüşü tek satırda döndürür (yazdırma ve önizleme için)
  function hepsi(h, secili) {
    return { onden: onden(h, secili), yandan: yandan(h), ucBoyut: ucBoyut(h) };
  }

  return { onden, yandan, ucBoyut, hepsi };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DolapCizim;
