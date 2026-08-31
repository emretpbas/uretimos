// ════════════════════════════════════════════════════════════════════════════
// DOLAP MEKÂN RENDERİ
//
// Dolabı bir oda sahnesinde, panellere atanmış hammaddenin GERÇEK MATERYAL
// GÖRSELİYLE (varsa) veya renk/dokusuyla çizer.
//
// ── MATERYAL GÖRSELİ NEREDEN GELİR ─────────────────────────────────────────
// Hammadde kartının 📎 (QR & Teknik Dosyalar) alanına yüklenen jpg/png/webp
// dosyası sunucuda saklanır ve `api.php?action=dosyaIndir&…&goster=1`
// adresinden doğrudan görüntü olarak sunulur. Arayüz bu adresleri toplayıp
// `materyalUrl` haritasıyla buraya verir; render onları SVG desenine gömer.
// Görsel yoksa dekor adından renk/doku tahmini yapılır (Akçaağaç, Ceviz,
// Antrasit…), o da tutmazsa nötr gri kullanılır.
//
// ── FOTOGERÇEKÇİLİK ────────────────────────────────────────────────────────
// Bu bir VEKTÖR sahnedir, ışın izleme yoktur. Gerçekçilik şunlarla sağlanır:
//   · gerçek materyal fotoğrafının yüzeylere kaplanması
//   · yönlü ışık (sol üstten) + yüzey bazlı parlaklık farkı
//   · köşe karartması (ambient occlusion) ve yumuşak temas gölgesi
//   · zeminde soluk yansıma
//   · kenar aydınlatması (panel üst kenarlarında ince ışık çizgisi)
//   · köşe koyulaştırma (vignette) ve derinlik sisi
// Ekran renkleri gerçek dekor kartelasıyla birebir eşleşmez.
//
// ── İKİ MOD ────────────────────────────────────────────────────────────────
//   mekan(h, hammaddeler, { kapak: 'kapali' })  → kapaklar takılı
//   mekan(h, hammaddeler, { kapak: 'acik'   })  → kapaklar kaldırılmış,
//                                                  iç düzen görünür
// ════════════════════════════════════════════════════════════════════════════
const DolapRender = (() => {

  // ── DEKOR ADI → RENK + DOKU (materyal görseli yoksa) ─────────────────────
  const DEKOR = [
    { re: /antik\s*meşe|antik\s*mese/i,     renk: '#8a6a4a', doku: 'ahsap', ad: 'Antik Meşe' },
    { re: /akçaağaç|akcaagac|maple/i,       renk: '#d9b184', doku: 'ahsap', ad: 'Akçaağaç' },
    { re: /ceviz|walnut/i,                  renk: '#6b4a33', doku: 'ahsap', ad: 'Ceviz' },
    { re: /wenge|venge/i,                   renk: '#3e2f26', doku: 'ahsap', ad: 'Wenge' },
    { re: /zebrano/i,                       renk: '#8b6a45', doku: 'ahsap', ad: 'Zebrano' },
    { re: /kiraz|cherry/i,                  renk: '#9b5a3c', doku: 'ahsap', ad: 'Kiraz' },
    { re: /meşe|mese\b|oak/i,               renk: '#c49a6c', doku: 'ahsap', ad: 'Meşe' },
    { re: /teak|tik\b/i,                    renk: '#b07d4d', doku: 'ahsap', ad: 'Teak' },
    { re: /huş|hus\b|birch/i,               renk: '#e2cba6', doku: 'ahsap', ad: 'Huş' },
    { re: /antrasit/i,                      renk: '#3a3d40', doku: 'duz',   ad: 'Antrasit' },
    { re: /füme|fume/i,                     renk: '#5a5f63', doku: 'duz',   ad: 'Füme' },
    { re: /siyah|black|9005/i,              renk: '#232527', doku: 'duz',   ad: 'Siyah' },
    { re: /beyaz|white|9003|9016/i,         renk: '#f1f0ed', doku: 'duz',   ad: 'Beyaz' },
    { re: /krem|kirli\s*beyaz|ivory/i,      renk: '#e8e1d2', doku: 'duz',   ad: 'Krem' },
    { re: /bej|beige|cappuccino/i,          renk: '#ddd0ba', doku: 'duz',   ad: 'Bej' },
    { re: /gri|grey|gray|7035|7016/i,       renk: '#9a9d9f', doku: 'duz',   ad: 'Gri' },
    { re: /mavi|blue/i,                     renk: '#4a6b8a', doku: 'duz',   ad: 'Mavi' },
    { re: /yeşil|yesil|green/i,             renk: '#5b7a5e', doku: 'duz',   ad: 'Yeşil' },
    { re: /mermer|marble|carrara/i,         renk: '#e9e7e2', doku: 'mermer', ad: 'Mermer' },
    { re: /beton|concrete/i,                renk: '#a9a6a1', doku: 'beton', ad: 'Beton' },
    { re: /alüminyum|aluminyum|inox|krom/i, renk: '#b8bdc2', doku: 'metal', ad: 'Alüminyum' }
  ];

  // hammadde → { renk, doku, ad, url }  (url varsa gerçek materyal fotoğrafı)
  function dekorCoz(hammadde, materyalUrl) {
    const url = (hammadde && materyalUrl) ? (materyalUrl[hammadde.id] || null) : null;
    if (hammadde) {
      if (hammadde.renkKodu && /^#[0-9a-f]{6}$/i.test(hammadde.renkKodu)) {
        return { renk: hammadde.renkKodu, doku: hammadde.doku || 'duz', ad: hammadde.ad || '', url };
      }
      const ad = String(hammadde.ad || '');
      for (const d of DEKOR) if (d.re.test(ad)) return { renk: d.renk, doku: d.doku, ad: d.ad, url };
      return { renk: '#c9c7c3', doku: 'duz', ad: ad || 'Tanımsız', url };
    }
    return { renk: '#c9c7c3', doku: 'duz', ad: 'Tanımsız', url: null };
  }

  const CAMLAR = {
    seffaf:         { ad: 'Şeffaf',         renk: '#cfe3ea', opak: 0.20, desen: 'yok'      },
    kumlu:          { ad: 'Kumlu (buzlu)',  renk: '#e6eae9', opak: 0.60, desen: 'kum'      },
    bronz_reflekte: { ad: 'Bronz reflekte', renk: '#8a6a45', opak: 0.70, desen: 'reflekte' },
    gumus_reflekte: { ad: 'Gümüş reflekte', renk: '#b6bec5', opak: 0.72, desen: 'reflekte' },
    nervurlu:       { ad: 'Nervürlü',       renk: '#d3e0e5', opak: 0.46, desen: 'nervur'   },
    fume:           { ad: 'Füme',           renk: '#4a4f55', opak: 0.52, desen: 'yok'      }
  };
  const LED_RENK = { gunisigi: '#ffd39a', ilikbeyaz: '#fff1d9', beyaz: '#eaf4ff', rgb: '#9fe0ff' };

  function ton(hex, k) {
    const n = parseInt(String(hex).slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const kacis = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  // ── DESENLER ─────────────────────────────────────────────────────────────
  // Her dekor için ayrı desen kimliği üretilir (gövde ve kapak farklı olabilir)
  function dekorDesen(id, dekor, olcek) {
    const r = dekor.renk;
    if (dekor.url) {
      // Gerçek materyal fotoğrafı — yüzeye kaplanır, tekrarlanır
      const b = 150 * (olcek || 1);
      return `<pattern id="${id}" width="${b}" height="${b}" patternUnits="userSpaceOnUse">
        <image href="${kacis(dekor.url)}" x="0" y="0" width="${b}" height="${b}"
          preserveAspectRatio="xMidYMid slice"/></pattern>`;
    }
    if (dekor.doku === 'ahsap') {
      return `<pattern id="${id}" width="70" height="16" patternUnits="userSpaceOnUse">
        <rect width="70" height="16" fill="${r}"/>
        <path d="M0,3 Q18,1 35,3 T70,3" stroke="${ton(r, .86)}" stroke-width="1" fill="none" opacity=".5"/>
        <path d="M0,9 Q22,11 44,9 T70,10" stroke="${ton(r, .93)}" stroke-width="1.5" fill="none" opacity=".42"/>
        <path d="M0,14 Q28,12.5 52,14.5 T70,14" stroke="${ton(r, .8)}" stroke-width=".8" fill="none" opacity=".38"/></pattern>`;
    }
    if (dekor.doku === 'mermer') {
      return `<pattern id="${id}" width="90" height="90" patternUnits="userSpaceOnUse">
        <rect width="90" height="90" fill="${r}"/>
        <path d="M0,22 Q28,36 50,20 T90,29" stroke="${ton(r, .78)}" stroke-width="1.3" fill="none" opacity=".5"/>
        <path d="M0,62 Q34,50 58,68 T90,58" stroke="${ton(r, .85)}" stroke-width="1" fill="none" opacity=".4"/></pattern>`;
    }
    if (dekor.doku === 'beton') {
      return `<pattern id="${id}" width="28" height="28" patternUnits="userSpaceOnUse">
        <rect width="28" height="28" fill="${r}"/>
        <circle cx="7" cy="9" r="1.2" fill="${ton(r, .9)}" opacity=".45"/>
        <circle cx="19" cy="17" r="1.5" fill="${ton(r, .86)}" opacity=".4"/>
        <circle cx="13" cy="24" r=".9" fill="${ton(r, .95)}" opacity=".45"/></pattern>`;
    }
    if (dekor.doku === 'metal') {
      return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${ton(r, .8)}"/><stop offset=".42" stop-color="${ton(r, 1.08)}"/>
        <stop offset=".6" stop-color="${ton(r, .88)}"/><stop offset="1" stop-color="${ton(r, 1.03)}"/></linearGradient>`;
    }
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ton(r, 1.03)}"/><stop offset="1" stop-color="${ton(r, .95)}"/></linearGradient>`;
  }

  function defs(dGovde, dKapak, camTipi, ledRenk) {
    const cm = CAMLAR[camTipi] || CAMLAR.seffaf;
    const lr = LED_RENK[ledRenk] || LED_RENK.ilikbeyaz;
    let d = `<defs>`;
    d += dekorDesen('mt-govde', dGovde, 1);
    d += dekorDesen('mt-kapak', dKapak, 1);
    // Yönlü ışık: sol üstten gelen aydınlık, sağ alta doğru sönümlenir
    d += `<linearGradient id="mt-isik" x1="0" y1="0" x2=".85" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/>
      <stop offset=".45" stop-color="#fff" stop-opacity=".04"/>
      <stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>`;
    // Köşe karartması (ambient occlusion) — iç hacimde derinlik hissi
    d += `<linearGradient id="mt-ao-ust" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`;
    d += `<linearGradient id="mt-ao-sol" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`;
    d += `<linearGradient id="mt-ao-sag" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`;
    // Yumuşak temas gölgesi
    d += `<filter id="mt-golge" x="-40%" y="-60%" width="180%" height="260%">
      <feGaussianBlur stdDeviation="9"/></filter>`;
    d += `<filter id="mt-golge-yumusak" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3.5"/></filter>`;
    d += `<radialGradient id="mt-temas"><stop offset="0" stop-color="#000" stop-opacity=".45"/>
      <stop offset=".65" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
    // LED
    d += `<filter id="mt-glow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    d += `<linearGradient id="mt-led" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${lr}" stop-opacity="0"/><stop offset=".12" stop-color="${lr}" stop-opacity=".9"/>
      <stop offset=".88" stop-color="${lr}" stop-opacity=".9"/><stop offset="1" stop-color="${lr}" stop-opacity="0"/></linearGradient>`;
    d += `<radialGradient id="mt-ledyay"><stop offset="0" stop-color="${lr}" stop-opacity=".5"/>
      <stop offset="1" stop-color="${lr}" stop-opacity="0"/></radialGradient>`;
    // Cam
    d += `<linearGradient id="mt-cam-parla" x1="0" y1="0" x2=".75" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".46"/><stop offset=".34" stop-color="#fff" stop-opacity=".05"/>
      <stop offset=".6" stop-color="${cm.renk}" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".32"/></linearGradient>`;
    d += `<pattern id="mt-nervur" width="10" height="12" patternUnits="userSpaceOnUse">
      <rect width="10" height="12" fill="${cm.renk}" opacity="${cm.opak}"/>
      <rect x="0" width="5" height="12" fill="#fff" opacity=".24"/>
      <rect x="5" width="1.2" height="12" fill="#000" opacity=".08"/></pattern>`;
    d += `<pattern id="mt-kum" width="7" height="7" patternUnits="userSpaceOnUse">
      <rect width="7" height="7" fill="${cm.renk}" opacity="${cm.opak}"/>
      <circle cx="2" cy="2.5" r=".7" fill="#fff" opacity=".3"/>
      <circle cx="5.2" cy="5" r=".55" fill="#fff" opacity=".22"/></pattern>`;
    // Oda
    d += `<linearGradient id="mt-duvar" x1="0" y1="0" x2=".3" y2="1">
      <stop offset="0" stop-color="#f7f5f1"/><stop offset=".55" stop-color="#eae5dd"/><stop offset="1" stop-color="#d8d2c8"/></linearGradient>`;
    d += `<linearGradient id="mt-zemin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a8998a"/><stop offset=".35" stop-color="#93857a"/><stop offset="1" stop-color="#6f6459"/></linearGradient>`;
    d += `<linearGradient id="mt-yansima" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".20"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    d += `<radialGradient id="mt-vignette" cx=".5" cy=".45" r=".78">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></radialGradient>`;
    return d + `</defs>`;
  }

  const camDolgu = (tip) => {
    const cm = CAMLAR[tip] || CAMLAR.seffaf;
    if (cm.desen === 'nervur') return 'url(#mt-nervur)';
    if (cm.desen === 'kum') return 'url(#mt-kum)';
    return cm.renk;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MEKÂN RENDERİ
  //   secenek = { kapak:'kapali'|'acik', duvarRengi, materyalUrl:{hmId:url} }
  // ══════════════════════════════════════════════════════════════════════════
  function mekan(h, hammaddeler, secenek) {
    if (!h || !h.paneller || !h.paneller.length) {
      return `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%"><text x="100" y="62"
        text-anchor="middle" font-size="11" fill="#888" font-family="system-ui">Geçerli ölçü girin</text></svg>`;
    }
    const o = secenek || {};
    const kapakGizli = o.kapak === 'acik';
    const c = h.yapilandirma;
    const hmBul = (id) => (hammaddeler || []).find(x => x.id === id);

    const pGovde = h.paneller.find(p => p.rol === 'yan') || h.paneller[0];
    const pKapak = h.paneller.find(p => p.rol === 'kapak' || p.rol === 'surgulu_kanat' || p.rol === 'surgulu_dolgu') || pGovde;
    const dGovde = dekorCoz(hmBul(pGovde.hammaddeId), o.materyalUrl);
    const dKapak = dekorCoz(hmBul(pKapak.hammaddeId), o.materyalUrl);

    const W = 680, HH = 470;
    const G = +c.genislik, Y = h.ozet.toplamYukseklik, D = +c.derinlik;
    const sc = (HH * 0.60) / Y;
    const dw = G * sc, dh = Y * sc, dd = D * sc * 0.48;
    const x0 = W * 0.50 - dw / 2;
    const zemin = HH * 0.80;
    const y0 = zemin - dh;
    const dy = dd * 0.34;                 // derinlik kaçışının dikey bileşeni

    let s = `<svg viewBox="0 0 ${W} ${HH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;border-radius:12px">`;
    s += defs(dGovde, dKapak, c.camTipi, c.ledRenk);

    // ── ODA ──────────────────────────────────────────────────────────────
    s += `<rect x="0" y="0" width="${W}" height="${zemin}" fill="${o.duvarRengi || 'url(#mt-duvar)'}"/>`;
    s += `<rect x="0" y="${zemin}" width="${W}" height="${HH - zemin}" fill="url(#mt-zemin)"/>`;
    // Zemin tahta derzleri (perspektif kaçışlı)
    for (let i = -8; i <= 8; i++) {
      const zx = W / 2 + i * (W / 9);
      s += `<line x1="${zx}" y1="${HH}" x2="${W / 2 + i * 14}" y2="${zemin}" stroke="#000" stroke-width=".7" opacity=".08"/>`;
    }
    for (let j = 1; j <= 5; j++) {
      const zy = zemin + (HH - zemin) * Math.pow(j / 5, 1.7);
      s += `<line x1="0" y1="${zy}" x2="${W}" y2="${zy}" stroke="#000" stroke-width=".6" opacity=".07"/>`;
    }
    // Duvar dibi gölgesi + süpürgelik
    s += `<rect x="0" y="${zemin - 26}" width="${W}" height="26" fill="#000" opacity=".07"/>`;
    s += `<rect x="0" y="${zemin - 9}" width="${W}" height="9" fill="#f0ebe3" stroke="#cec6b9" stroke-width=".7"/>`;

    // ── ZEMİN YANSIMASI (dolabın soluk aksi) ─────────────────────────────
    s += `<g opacity=".16" transform="translate(0,${2 * zemin}) scale(1,-1)">
      <rect x="${x0}" y="${y0}" width="${dw}" height="${dh}" fill="url(#mt-govde)"/>
      <rect x="${x0}" y="${y0}" width="${dw}" height="${dh}" fill="url(#mt-yansima)"/></g>`;
    s += `<rect x="${x0 - 20}" y="${zemin}" width="${dw + 40}" height="${HH - zemin}" fill="url(#mt-zemin)" opacity=".55"/>`;

    // ── TEMAS GÖLGESİ ────────────────────────────────────────────────────
    s += `<ellipse cx="${x0 + dw / 2}" cy="${zemin + 4}" rx="${dw * 0.60}" ry="9" fill="url(#mt-temas)"/>`;
    s += `<ellipse cx="${x0 + dw / 2 + 16}" cy="${zemin + 2}" rx="${dw * 0.52}" ry="6" fill="#000" opacity=".22" filter="url(#mt-golge)"/>`;

    const t = (+c.panelKalinlik) * sc;
    const altY = (c.bazaTipi === 'baza' ? +c.bazaYukseklik : c.bazaTipi === 'ayak' ? (+c.ayakYukseklik || 0) : 0) * sc;

    // ── GÖVDE: SAĞ YAN YÜZ (derinlik) ────────────────────────────────────
    s += `<path d="M${x0 + dw},${y0} L${x0 + dw + dd},${y0 - dy} L${x0 + dw + dd},${zemin - dy} L${x0 + dw},${zemin} Z"
      fill="url(#mt-govde)"/>`;
    s += `<path d="M${x0 + dw},${y0} L${x0 + dw + dd},${y0 - dy} L${x0 + dw + dd},${zemin - dy} L${x0 + dw},${zemin} Z"
      fill="#000" opacity=".26"/>`;
    // ── ÜST YÜZ ──────────────────────────────────────────────────────────
    s += `<path d="M${x0},${y0} L${x0 + dd},${y0 - dy} L${x0 + dw + dd},${y0 - dy} L${x0 + dw},${y0} Z" fill="url(#mt-govde)"/>`;
    s += `<path d="M${x0},${y0} L${x0 + dd},${y0 - dy} L${x0 + dw + dd},${y0 - dy} L${x0 + dw},${y0} Z" fill="#fff" opacity=".13"/>`;

    // ── ÖN GÖVDE ─────────────────────────────────────────────────────────
    s += `<rect x="${x0}" y="${y0}" width="${dw}" height="${dh}" fill="url(#mt-govde)"/>`;

    // ── İÇ HACİM ─────────────────────────────────────────────────────────
    const icX = x0 + t, icY = y0 + t, icW = dw - 2 * t, icH = dh - altY - 2 * t;
    // İç arka yüzey — dışarıdan daha koyu, üstte ve yanlarda AO
    s += `<rect x="${icX}" y="${icY}" width="${icW}" height="${icH}" fill="url(#mt-govde)"/>`;
    s += `<rect x="${icX}" y="${icY}" width="${icW}" height="${icH}" fill="#000" opacity=".30"/>`;
    // İç yan yüzeyler (derinlik hissi) — sol iç yüz aydınlık, sağ iç yüz koyu
    const icD = Math.min(icW * 0.10, dd * 0.5);
    s += `<path d="M${icX},${icY} L${icX + icD},${icY + icD * .35} L${icX + icD},${icY + icH - icD * .35} L${icX},${icY + icH} Z"
      fill="url(#mt-govde)" opacity=".9"/><path d="M${icX},${icY} L${icX + icD},${icY + icD * .35} L${icX + icD},${icY + icH - icD * .35} L${icX},${icY + icH} Z"
      fill="#000" opacity=".14"/>`;
    s += `<path d="M${icX + icW},${icY} L${icX + icW - icD},${icY + icD * .35} L${icX + icW - icD},${icY + icH - icD * .35} L${icX + icW},${icY + icH} Z"
      fill="url(#mt-govde)"/><path d="M${icX + icW},${icY} L${icX + icW - icD},${icY + icD * .35} L${icX + icW - icD},${icY + icH - icD * .35} L${icX + icW},${icY + icH} Z"
      fill="#000" opacity=".30"/>`;
    // AO
    s += `<rect x="${icX}" y="${icY}" width="${icW}" height="${Math.min(34, icH * .3)}" fill="url(#mt-ao-ust)"/>`;
    s += `<rect x="${icX}" y="${icY}" width="${Math.min(26, icW * .22)}" height="${icH}" fill="url(#mt-ao-sol)"/>`;
    s += `<rect x="${icX + icW - Math.min(26, icW * .22)}" y="${icY}" width="${Math.min(26, icW * .22)}" height="${icH}" fill="url(#mt-ao-sag)"/>`;

    // ── RAFLAR / ASKI BORUSU / LED ───────────────────────────────────────
    const bolmeler = h.bolmeler || [];
    const icYukMM = h.ozet.govdeYukseklik - 2 * (+c.panelKalinlik);
    bolmeler.forEach((b) => {
      const bx = x0 + b.x * sc, bw = b.genislik * sc;
      // Dikey ayraç gölgesi
      if (b.index > 0) s += `<rect x="${bx - t}" y="${icY}" width="${t}" height="${icH}" fill="url(#mt-govde)"/>
        <rect x="${bx - t}" y="${icY}" width="${t}" height="${icH}" fill="#000" opacity=".12"/>`;
      (b.raflar || []).forEach((rf, ri) => {
        const kon = (rf.konum > 0) ? rf.konum : (icYukMM * (ri + 1) / ((b.raflar || []).length + 1));
        const ry = y0 + (b.y + kon) * sc;
        if (ry > icY + icH - 2) return;
        const kal = Math.max(t, 2.4);
        // Rafın üst yüzü (aydınlık) + ön kenar
        s += `<path d="M${bx},${ry} L${bx + icD * .6},${ry - icD * .22} L${bx + bw - icD * .6},${ry - icD * .22} L${bx + bw},${ry} Z"
          fill="url(#mt-govde)"/><path d="M${bx},${ry} L${bx + icD * .6},${ry - icD * .22} L${bx + bw - icD * .6},${ry - icD * .22} L${bx + bw},${ry} Z"
          fill="#fff" opacity=".1"/>`;
        s += `<rect x="${bx}" y="${ry}" width="${bw}" height="${kal}" fill="url(#mt-govde)"/>`;
        s += `<rect x="${bx}" y="${ry}" width="${bw}" height="${kal}" fill="url(#mt-isik)"/>`;
        // Rafın altına düşen gölge
        s += `<rect x="${bx}" y="${ry + kal}" width="${bw}" height="${Math.min(16, icH * .08)}" fill="url(#mt-ao-ust)" opacity=".8"/>`;
        if (c.ledRaf) {
          s += `<rect x="${bx + 3}" y="${ry + kal}" width="${bw - 6}" height="2.6" rx="1.3" fill="url(#mt-led)" filter="url(#mt-glow)"/>`;
          s += `<ellipse cx="${bx + bw / 2}" cy="${ry + 22}" rx="${bw * .48}" ry="18" fill="url(#mt-ledyay)"/>`;
        }
        if (rf.askiBorusu) {
          s += `<rect x="${bx + 5}" y="${ry + kal + 10}" width="${bw - 10}" height="3.4" rx="1.7" fill="#c3c9ce"/>`;
          s += `<rect x="${bx + 5}" y="${ry + kal + 10}" width="${bw - 10}" height="1.4" rx=".7" fill="#fff" opacity=".55"/>`;
        }
      });
    });
    if (c.ledYan) {
      [icX + 2, icX + icW - 4.6].forEach(lx => {
        s += `<rect x="${lx}" y="${icY + 5}" width="2.6" height="${icH - 10}" rx="1.3" fill="url(#mt-led)" filter="url(#mt-glow)"/>`;
      });
      s += `<rect x="${icX}" y="${icY}" width="${icW}" height="${icH}" fill="url(#mt-ledyay)" opacity=".45"/>`;
    }

    // ── KAPAKLAR (kapaksız modda çizilmez) ───────────────────────────────
    const sistem = c.kapakSistemi || 'menteseli';
    if (!kapakGizli && sistem === 'surgulu' && h.surgulu) {
      const kanat = h.surgulu.kanat;
      const kw = h.surgulu.kanatEn * sc, kh = h.surgulu.kanatBoy * sc;
      const adim = (dw - kw) / (kanat - 1 || 1);
      for (let i = 0; i < kanat; i++) {
        const kx = x0 + i * adim, ky = y0 + 2;
        // Öne gelen kanat arkadakine gölge düşürür
        if (i > 0) s += `<rect x="${kx - 5}" y="${ky}" width="7" height="${kh}" fill="#000" opacity=".2" filter="url(#mt-golge-yumusak)"/>`;
        if (h.surgulu.cerceve === 'aluminyum') {
          const pe = (+c.surguluProfilEn || 20) * sc;
          s += `<rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" fill="#b9bec3"/>`;
          s += `<rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" fill="url(#mt-isik)"/>`;
          s += `<rect x="${kx}" y="${ky}" width="${kw}" height="2" fill="#fff" opacity=".5"/>`;
          const ix = kx + pe, iy = ky + pe, iw = kw - 2 * pe, ih = kh - 2 * pe;
          s += h.surgulu.camVar ? camCiz(ix, iy, iw, ih, c.camTipi)
            : `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="url(#mt-kapak)"/>
               <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="url(#mt-isik)"/>`;
        } else {
          s += `<rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" fill="url(#mt-kapak)"/>`;
          s += `<rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" fill="url(#mt-isik)"/>`;
          s += `<rect x="${kx}" y="${ky}" width="${kw}" height="1.6" fill="#fff" opacity=".35"/>`;
          if (h.surgulu.camVar) {
            s += camCiz(kx + h.surgulu.camYan * sc, ky + h.surgulu.camUst * sc,
              h.surgulu.camEn * sc, h.surgulu.camBoy * sc, c.camTipi);
          }
        }
        if (c.kulpVar) s += kulpDikey(kx + kw - 14, ky + kh / 2);
        s += `<rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" fill="none" stroke="#000" stroke-width=".8" opacity=".22"/>`;
      }
    } else if (!kapakGizli && sistem === 'menteseli') {
      // Kapak tipi, kapağın gövdeye göre KONUMUNU belirler — dolap_hesap.js'teki
      // kapakOlcu() ile AYNI mantık (bkz. o fonksiyonun başındaki yorum):
      //   tam_bini  : kapak gövdeyi ÖNDEN öreter, panel kalınlığı kadar taşar
      //   yarim_bini: yarısı kadar taşar (komşu bölmeyle paylaşılan dikmede)
      //   icerlek   : kapak boşluğun İÇİNE oturur, panel kalınlığı + fuga kadar içeri çekilir
      // Öncesinde bölmenin İÇ boşluğu (bx/by/bw/bh) HER ZAMAN aynı şekilde
      // çizilip kapak tipi hiç dikkate alınmıyordu — bu yüzden seçim ne olursa
      // olsun render hep "içerlek" gibi görünüyordu.
      const fpx = (+c.fuga || 0) * sc;
      bolmeler.forEach((b) => {
        if (!b.kapakSayisi) return;
        const bx = x0 + b.x * sc, bw = b.genislik * sc;
        const cek = (b.cekmeceSayisi || 0) * (b.cekmeceYukseklik || 0) * sc;
        const bh = b.yukseklik * sc - cek;
        const by = y0 + b.y * sc;

        let kapX, kapW, kapY, kapH;
        if (c.kapakTipi === 'icerlek') {
          kapX = bx + t + fpx; kapW = bw - 2 * (t + fpx);
          kapY = by + t + fpx; kapH = bh - 2 * (t + fpx);
        } else {
          const tasma = c.kapakTipi === 'yarim_bini' ? t / 2 : t;
          kapX = bx - tasma; kapW = bw + 2 * tasma;
          kapY = by - tasma; kapH = bh + 2 * tasma;
        }
        const adet = b.kapakSayisi;
        const kw = (kapW - (adet - 1) * fpx) / adet;
        for (let i = 0; i < adet; i++) {
          const kx = kapX + i * (kw + fpx);
          s += `<rect x="${kx}" y="${kapY}" width="${kw}" height="${kapH}" rx="1.5" fill="url(#mt-kapak)"/>`;
          s += `<rect x="${kx}" y="${kapY}" width="${kw}" height="${kapH}" rx="1.5" fill="url(#mt-isik)"/>`;
          s += `<rect x="${kx}" y="${kapY}" width="${kw}" height="1.6" fill="#fff" opacity=".4"/>`;
          s += `<rect x="${kx}" y="${kapY}" width="${kw}" height="${kapH}" rx="1.5" fill="none" stroke="#000" stroke-width=".8" opacity=".22"/>`;
          if (c.kulpVar) {
            const solMu = (adet === 1) || (i < adet / 2);
            s += kulpDikey(solMu ? kx + kw - 11 : kx + 8, kapY + kapH / 2);
          }
        }
        for (let k = 0; k < (b.cekmeceSayisi || 0); k++) {
          const ch = b.cekmeceYukseklik * sc;
          const cy = by + bh + k * ch;
          s += `<rect x="${bx + .6}" y="${cy + 1}" width="${bw - 1.2}" height="${ch - 2}" rx="1.5" fill="url(#mt-kapak)"/>`;
          s += `<rect x="${bx + .6}" y="${cy + 1}" width="${bw - 1.2}" height="${ch - 2}" rx="1.5" fill="url(#mt-isik)"/>`;
          s += `<rect x="${bx + .6}" y="${cy + 1}" width="${bw - 1.2}" height="1.4" fill="#fff" opacity=".38"/>`;
          s += `<rect x="${bx + bw / 2 - 16}" y="${cy + ch / 2 - 2}" width="32" height="4" rx="2" fill="#adb4b9"/>`;
          s += `<rect x="${bx + bw / 2 - 16}" y="${cy + ch / 2 - 2}" width="32" height="1.6" rx=".8" fill="#fff" opacity=".5"/>`;
        }
      });
    }

    // ── BAZA / AYAK ──────────────────────────────────────────────────────
    if (altY > 0) {
      if (c.bazaTipi === 'baza') {
        const bIc = (+c.bazaIcKacikligi || 0) * sc;
        s += `<rect x="${x0 + bIc}" y="${zemin - altY}" width="${dw - 2 * bIc}" height="${altY}" fill="url(#mt-govde)"/>`;
        s += `<rect x="${x0 + bIc}" y="${zemin - altY}" width="${dw - 2 * bIc}" height="${altY}" fill="#000" opacity=".22"/>`;
      } else {
        [x0 + 10, x0 + dw - 22].forEach(ax => {
          s += `<rect x="${ax}" y="${zemin - altY}" width="12" height="${altY}" rx="2.5" fill="#5f6469"/>`;
          s += `<rect x="${ax}" y="${zemin - altY}" width="4" height="${altY}" rx="2" fill="#fff" opacity=".18"/>`;
        });
        s += `<rect x="${x0}" y="${zemin - altY}" width="${dw}" height="${altY}" fill="#000" opacity=".12"/>`;
      }
    }

    // ── ÜST TAÇ ──────────────────────────────────────────────────────────
    if (c.ustTac) {
      const tk = ((+c.ustTacKalinlik > 0) ? +c.ustTacKalinlik : (+c.ustTacYukseklik || 0)) * sc;
      const ara = c.ustTacKonum === 'aralarina';
      const tx = ara ? x0 + t : x0 - 3, tw2 = ara ? dw - 2 * t : dw + 6;
      s += `<rect x="${tx}" y="${y0 - tk}" width="${tw2}" height="${tk}" fill="url(#mt-govde)"/>`;
      s += `<rect x="${tx}" y="${y0 - tk}" width="${tw2}" height="${tk}" fill="url(#mt-isik)"/>`;
      s += `<path d="M${tx},${y0 - tk} L${tx + dd * .5},${y0 - tk - dy * .5} L${tx + tw2 + dd * .5},${y0 - tk - dy * .5} L${tx + tw2},${y0 - tk} Z"
        fill="url(#mt-govde)"/><path d="M${tx},${y0 - tk} L${tx + dd * .5},${y0 - tk - dy * .5} L${tx + tw2 + dd * .5},${y0 - tk - dy * .5} L${tx + tw2},${y0 - tk} Z"
        fill="#fff" opacity=".14"/>`;
    }

    // ── GÖVDE DIŞ HAT + GENEL IŞIK ───────────────────────────────────────
    s += `<rect x="${x0}" y="${y0}" width="${dw}" height="${dh}" fill="none" stroke="#000" stroke-width="1" opacity=".28"/>`;
    s += `<rect x="0" y="0" width="${W}" height="${HH}" fill="url(#mt-vignette)" pointer-events="none"/>`;

    // ── ÖLÇEK: 1,75 m insan silueti ──────────────────────────────────────
    const ih2 = 1750 * sc, ix2 = x0 - ih2 * 0.46;
    if (ix2 > 14) {
      s += `<g opacity=".2" fill="#22262a">
        <ellipse cx="${ix2}" cy="${zemin + 2}" rx="${ih2 * .07}" ry="3" opacity=".5"/>
        <circle cx="${ix2}" cy="${zemin - ih2 * .925}" r="${ih2 * .058}"/>
        <path d="M${ix2 - ih2 * .072},${zemin - ih2 * .855} Q${ix2},${zemin - ih2 * .875} ${ix2 + ih2 * .072},${zemin - ih2 * .855}
          L${ix2 + ih2 * .058},${zemin - ih2 * .45} L${ix2 - ih2 * .058},${zemin - ih2 * .45} Z"/>
        <rect x="${ix2 - ih2 * .052}" y="${zemin - ih2 * .46}" width="${ih2 * .042}" height="${ih2 * .46}" rx="${ih2 * .015}"/>
        <rect x="${ix2 + ih2 * .01}" y="${zemin - ih2 * .46}" width="${ih2 * .042}" height="${ih2 * .46}" rx="${ih2 * .015}"/></g>`;
    }

    // ── BİLGİ ŞERİDİ ─────────────────────────────────────────────────────
    const dokuNot = (dGovde.url ? 'materyal görseli' : 'renk tahmini');
    s += `<rect x="0" y="${HH - 28}" width="${W}" height="28" fill="#12151a" opacity=".72"/>`;
    s += `<text x="12" y="${HH - 10}" font-size="11" fill="#fff" font-family="system-ui">${
      G}×${Y}×${D} mm · ${kapakGizli ? 'İÇ DÜZEN (kapaksız)' : 'KAPAKLI'} · Gövde: ${kacis(dGovde.ad)} (${dokuNot})${
      (c.camTipi && c.camTipi !== 'yok') ? ' · Cam: ' + (CAMLAR[c.camTipi] || {}).ad : ''}${
      (c.ledYan || c.ledRaf) ? ' · LED ' + h.ozet.ledMetre + ' m' : ''}</text>`;
    return s + '</svg>';
  }

  function kulpDikey(x, cy) {
    return `<rect x="${x}" y="${cy - 17}" width="4.4" height="34" rx="2.2" fill="#a7aeb4"/>
      <rect x="${x}" y="${cy - 17}" width="1.8" height="34" rx=".9" fill="#fff" opacity=".55"/>
      <rect x="${x}" y="${cy - 17}" width="4.4" height="34" rx="2.2" fill="none" stroke="#000" stroke-width=".5" opacity=".3"/>`;
  }

  function camCiz(x, y, w, h, tip) {
    if (w <= 0 || h <= 0) return '';
    const cm = CAMLAR[tip] || CAMLAR.seffaf;
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${camDolgu(tip)}" opacity="${cm.desen === 'yok' ? cm.opak : 1}"/>`;
    if (cm.desen === 'reflekte') {
      s += `<path d="M${x},${y + h * .78} L${x + w * .5},${y} L${x + w * .78},${y} L${x},${y + h} Z" fill="#fff" opacity=".18"/>`;
    }
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#mt-cam-parla)"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width=".9" opacity=".25"/>`;
    s += `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="1.2" fill="#fff" opacity=".3"/>`;
    return s;
  }

  return { mekan, dekorCoz, DEKOR, CAMLAR, LED_RENK };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DolapRender;
