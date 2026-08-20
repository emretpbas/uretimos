// ════════════════════════════════════════════════════════════════════════════
// TEKNİK ÇİZİM ÜRETİCİ — patlatılmış şema + görünüşler + ölçülendirme
// ────────────────────────────────────────────────────────────────────────────
// STEP'ten çıkarılan parça sınır kutularından SVG çizim üretir. Üç çıktı:
//   • Patlatılmış izometrik şema (balon numaralı)
//   • Görünüşler: ön / üst / sağ (ölçülendirmeli)
//   • Ölçü tablosu
//
// NEDEN SVG: Tarayıcıda 3B motor kurmadan, yazdırıldığında keskin kalan
// vektörel çizim üretir; doğrudan PDF'e döner. Ölçü çizgileri ve yazılar
// ölçeklenince bozulmaz.
//
// SINIR — dürüstçe: Parçalar SINIR KUTUSU olarak çizilir. Panel, raf, kapak
// gibi prizmatik parçalarda bu gerçek şeklin kendisidir. Eğri veya karmaşık
// parçalar (kulp, ayak, dökme parça) kutu olarak görünür — kapladığı hacim
// doğru, şekli temsilîdir. Çizimlerde bu not yer alır.
// ════════════════════════════════════════════════════════════════════════════
const TeknikCizim = (() => {

  // İzometrik izdüşüm: 3B noktayı 2B'ye çevirir (30° standart izometri)
  const KOK3 = Math.sqrt(3);
  function izo(x, y, z) {
    return {
      x: (x - y) * Math.cos(Math.PI / 6),
      y: (x + y) * Math.sin(Math.PI / 6) - z
    };
  }

  // Ortografik izdüşümler — mühendislik çizimi standardı
  const GORUNUSLER = {
    on:  { ad: 'ÖN GÖRÜNÜŞ',  f: (p) => ({ x: p[0], y: -p[2] }), eksen: ['Genişlik', 'Yükseklik'], i: [0, 2] },
    ust: { ad: 'ÜST GÖRÜNÜŞ', f: (p) => ({ x: p[0], y: p[1] }),  eksen: ['Genişlik', 'Derinlik'],  i: [0, 1] },
    sag: { ad: 'SAĞ GÖRÜNÜŞ', f: (p) => ({ x: p[1], y: -p[2] }), eksen: ['Derinlik', 'Yükseklik'], i: [1, 2] },
    sol: { ad: 'SOL GÖRÜNÜŞ', f: (p) => ({ x: -p[1], y: -p[2] }), eksen: ['Derinlik', 'Yükseklik'], i: [1, 2] }
  };

  const esc = (x) => String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ── PATLATMA VEKTÖRÜ ─────────────────────────────────────────────────────
  // Her parça, montaj merkezinden dışa doğru itilir. Yön, parçanın merkezinin
  // montaj merkezine göre konumundan gelir — böylece parçalar birbirinden
  // ayrılır ve iç parçalar görünür hale gelir.
  function patlatmaVektoru(parca, genel, katsayi) {
    const k = katsayi == null ? 0.6 : katsayi;
    const gm = [(genel.min[0] + genel.max[0]) / 2,
                (genel.min[1] + genel.max[1]) / 2,
                (genel.min[2] + genel.max[2]) / 2];
    const boy = Math.max(genel.olcu[0], genel.olcu[1], genel.olcu[2]) || 1;
    const v = [parca.merkez[0] - gm[0], parca.merkez[1] - gm[1], parca.merkez[2] - gm[2]];
    const uz = Math.hypot(v[0], v[1], v[2]) || 1;
    // En baskın eksende it: panel montajında bu, parçanın söküm yönüdür
    const enBuyuk = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
    const yon = v.map(c => (Math.abs(c) === enBuyuk ? Math.sign(c) : c / uz * 0.35));
    return yon.map(c => c * boy * k);
  }

  // ── PATLATILMIŞ İZOMETRİK ŞEMA ───────────────────────────────────────────
  function patlatilmisSvg(geo, secenek) {
    const ay = secenek || {};
    if (!geo || !geo.geometriVar) return null;
    const kat = ay.patlatma == null ? 0.6 : ay.patlatma;
    const G = geo.genel;

    // Her parçanın 8 köşesini patlatılmış konumda izometriye çevir
    const kutular = geo.parcalar.map((p, i) => {
      const d = patlatmaVektoru(p, G, kat);
      const kose = [];
      for (const x of [p.min[0], p.max[0]])
        for (const y of [p.min[1], p.max[1]])
          for (const z of [p.min[2], p.max[2]])
            kose.push(izo(x + d[0], y + d[1], z + d[2]));
      // Görünen üç yüz (izometride yeterli): üst, ön, yan
      const c = (ix) => kose[ix];
      return {
        balon: i + 1, ad: p.ad, olcu: p.olcu,
        // köşe sırası: [x,y,z] ikili döngüsüne göre indeksler
        ust:  [c(1), c(3), c(7), c(5)],
        on:   [c(0), c(1), c(5), c(4)],
        yan:  [c(4), c(5), c(7), c(6)],
        merkezIzo: izo(p.merkez[0] + d[0], p.merkez[1] + d[1], p.merkez[2] + d[2]),
        derinlik: (p.merkez[0] + d[0]) + (p.merkez[1] + d[1]) - (p.merkez[2] + d[2])
      };
    });

    // Arkadan öne çiz (ressam algoritması) — öndeki parçalar üstte kalsın
    kutular.sort((a, b) => a.derinlik - b.derinlik);

    // Görünüm alanını hesapla
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    kutular.forEach(k => [...k.ust, ...k.on, ...k.yan].forEach(pt => {
      x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x);
      y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y);
    }));
    const pay = Math.max(x1 - x0, y1 - y0) * 0.12;
    x0 -= pay; y0 -= pay; x1 += pay; y1 += pay;
    const g = x1 - x0, y = y1 - y0;

    const poli = (pts, dolgu) =>
      `<polygon points="${pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')}" fill="${dolgu}" stroke="#2c3e50" stroke-width="${g / 900}"/>`;

    let ic = '';
    kutular.forEach(k => {
      ic += poli(k.on, '#dce6f1') + poli(k.yan, '#c3d3e8') + poli(k.ust, '#eaf1f8');
    });
    // Balon numaraları — parçaların üstünde
    const bYari = g / 45;
    kutular.forEach(k => {
      ic += `<circle cx="${k.merkezIzo.x.toFixed(1)}" cy="${k.merkezIzo.y.toFixed(1)}" r="${bYari.toFixed(1)}"
        fill="#1f4e79" stroke="#fff" stroke-width="${(g / 700).toFixed(2)}"/>
        <text x="${k.merkezIzo.x.toFixed(1)}" y="${(k.merkezIzo.y + bYari * 0.36).toFixed(1)}"
        font-size="${(bYari * 1.1).toFixed(1)}" fill="#fff" text-anchor="middle"
        font-family="Arial" font-weight="bold">${k.balon}</text>`;
    });

    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${g.toFixed(1)} ${y.toFixed(1)}">${ic}</svg>`,
      balonlar: kutular.map(k => ({ balon: k.balon, ad: k.ad, olcu: k.olcu }))
        .sort((a, b) => a.balon - b.balon)
    };
  }

  // ── GÖRÜNÜŞ (ölçülendirmeli) ─────────────────────────────────────────────
  function gorunusSvg(geo, gorunusAdi) {
    if (!geo || !geo.geometriVar) return null;
    const V = GORUNUSLER[gorunusAdi];
    if (!V) return null;
    const G = geo.genel;

    // Parçaları düzleme indir
    const dortgenler = geo.parcalar.map((p, i) => {
      const a = V.f(p.min), b = V.f(p.max);
      return {
        balon: i + 1, ad: p.ad,
        x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y)
      };
    });

    let x0 = Math.min(...dortgenler.map(d => d.x));
    let y0 = Math.min(...dortgenler.map(d => d.y));
    let x1 = Math.max(...dortgenler.map(d => d.x + d.w));
    let y1 = Math.max(...dortgenler.map(d => d.y + d.h));
    const g = x1 - x0, y = y1 - y0;
    const pay = Math.max(g, y) * 0.18;      // ölçü çizgilerine yer
    const cizgi = Math.max(g, y) / 500;
    const yazi = Math.max(g, y) / 32;

    let ic = '';
    dortgenler.forEach(d => {
      ic += `<rect x="${d.x.toFixed(1)}" y="${d.y.toFixed(1)}" width="${d.w.toFixed(1)}"
        height="${d.h.toFixed(1)}" fill="#eef3f9" stroke="#2c3e50" stroke-width="${cizgi.toFixed(2)}"/>`;
    });

    // ── ÖLÇÜLENDİRME ───────────────────────────────────────────────────────
    // Genel genişlik (altta) ve yükseklik (solda). Teknik resim geleneğine
    // uygun: ölçü çizgisi, uzatma çizgileri ve ok uçları.
    const oy = y1 + pay * 0.45;              // yatay ölçü çizgisi yüksekliği
    const ox = x0 - pay * 0.45;              // dikey ölçü çizgisi konumu
    const okB = Math.max(g, y) / 90;
    const ok = (px, py, yon) =>
      `<polygon points="${px},${py} ${px + yon * okB},${py - okB * 0.4} ${px + yon * okB},${py + okB * 0.4}" fill="#c0392b"/>`;
    const okD = (px, py, yon) =>
      `<polygon points="${px},${py} ${px - okB * 0.4},${py + yon * okB} ${px + okB * 0.4},${py + yon * okB}" fill="#c0392b"/>`;

    const genisMm = Math.round(g);
    const yuksekMm = Math.round(y);
    ic += `
      <line x1="${x0}" y1="${y1}" x2="${x0}" y2="${oy + okB}" stroke="#c0392b" stroke-width="${cizgi * 0.7}"/>
      <line x1="${x1}" y1="${y1}" x2="${x1}" y2="${oy + okB}" stroke="#c0392b" stroke-width="${cizgi * 0.7}"/>
      <line x1="${x0}" y1="${oy}" x2="${x1}" y2="${oy}" stroke="#c0392b" stroke-width="${cizgi}"/>
      ${ok(x0, oy, 1)}${ok(x1, oy, -1)}
      <text x="${((x0 + x1) / 2).toFixed(1)}" y="${(oy - okB * 0.6).toFixed(1)}"
        font-size="${yazi.toFixed(1)}" fill="#c0392b" text-anchor="middle"
        font-family="Arial" font-weight="bold">${genisMm} mm</text>

      <line x1="${x0}" y1="${y0}" x2="${ox - okB}" y2="${y0}" stroke="#c0392b" stroke-width="${cizgi * 0.7}"/>
      <line x1="${x0}" y1="${y1}" x2="${ox - okB}" y2="${y1}" stroke="#c0392b" stroke-width="${cizgi * 0.7}"/>
      <line x1="${ox}" y1="${y0}" x2="${ox}" y2="${y1}" stroke="#c0392b" stroke-width="${cizgi}"/>
      ${okD(ox, y0, 1)}${okD(ox, y1, -1)}
      <text x="${(ox - okB * 0.8).toFixed(1)}" y="${((y0 + y1) / 2).toFixed(1)}"
        font-size="${yazi.toFixed(1)}" fill="#c0392b" text-anchor="middle"
        font-family="Arial" font-weight="bold"
        transform="rotate(-90 ${(ox - okB * 0.8).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)})">${yuksekMm} mm</text>`;

    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(x0 - pay).toFixed(1)} ${(y0 - pay * 0.3).toFixed(1)} ${(g + pay * 2).toFixed(1)} ${(y + pay * 1.1).toFixed(1)}">${ic}</svg>`,
      ad: V.ad, genislik: genisMm, yukseklik: yuksekMm, eksen: V.eksen
    };
  }

  // ── TAM TEKNİK DOSYA (yazdırılabilir / PDF) ──────────────────────────────
  function teknikDosyaHtml(geo, kilavuz, bilgi) {
    const B = bilgi || {};
    const patlatma = patlatilmisSvg(geo, {});
    const gorunusler = ['on', 'ust', 'sag', 'sol'].map(g => gorunusSvg(geo, g)).filter(Boolean);
    if (!patlatma) return null;
    const G = geo.genel;

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${esc(B.urunAdi || 'Ürün')} — Teknik Dosya</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; }
  h1 { font-size: 19px; color: #1f4e79; margin: 0 0 3px; }
  h2 { font-size: 13.5px; color: #1f4e79; border-bottom: 2px solid #1f4e79;
       padding-bottom: 3px; margin: 18px 0 8px; page-break-after: avoid; }
  .ust { display: flex; justify-content: space-between; border-bottom: 2px solid #1f4e79;
         padding-bottom: 8px; margin-bottom: 12px; }
  .sayfa { page-break-after: always; }
  .sayfa:last-child { page-break-after: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #1f4e79; color: #fff; padding: 5px; font-size: 10px; text-align: left; }
  td { padding: 4px 6px; border-bottom: 1px solid #e3e3e3; }
  .r { text-align: right; } .c { text-align: center; }
  .cizim { border: 1px solid #d5d9e0; border-radius: 6px; padding: 8px; background: #fff; }
  .cizim svg { width: 100%; height: auto; max-height: 420px; display: block; }
  .ikili { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .gbaslik { font-size: 11px; font-weight: bold; color: #1f4e79; margin-bottom: 4px; }
  .not { border-left: 3px solid #f0ad4e; background: #fff8ec; padding: 7px 10px;
         font-size: 10px; margin-top: 10px; }
</style></head><body>

<div class="sayfa">
  <div class="ust">
    <div><h1>${esc(B.urunAdi || 'Ürün')}</h1>
      <div style="font-size:11.5px;color:#555">Teknik Dosya${B.urunKodu ? ' · ' + esc(B.urunKodu) : ''}</div></div>
    <div style="text-align:right;font-size:10px;color:#555">
      ${B.firma ? '<b>' + esc(B.firma) + '</b><br>' : ''}
      ${new Date().toLocaleDateString('tr')}<br>
      Genel ölçü: ${G.olcu[0]} × ${G.olcu[1]} × ${G.olcu[2]} mm
    </div>
  </div>

  <h2>1. Patlatılmış Montaj Şeması</h2>
  <div class="cizim">${patlatma.svg}</div>
  <table>
    <tr><th class="c" style="width:44px">Balon</th><th>Parça</th><th class="r">Ölçü (mm)</th></tr>
    ${patlatma.balonlar.map(b => `<tr><td class="c">${b.balon}</td>
      <td>${esc(b.ad)}</td><td class="r">${b.olcu.join(' × ')}</td></tr>`).join('')}
  </table>
</div>

<div class="sayfa">
  <h2>2. Görünüşler ve Ölçülendirme</h2>
  <div class="ikili">
    ${gorunusler.map(g => `<div>
      <div class="gbaslik">${esc(g.ad)} — ${g.eksen[0]} ${g.genislik} mm × ${g.eksen[1]} ${g.yukseklik} mm</div>
      <div class="cizim">${g.svg}</div>
    </div>`).join('')}
  </div>
  <div class="not">
    <b>Çizim notu:</b> Parçalar sınır kutusu olarak gösterilmiştir. Panel, raf ve
    kapak gibi prizmatik parçalarda bu gerçek şekildir; eğri veya karmaşık
    parçalarda (kulp, ayak) yalnızca kapladığı hacmi temsil eder.
    Ölçüler milimetredir, ölçek çizim üzerinde değişkendir.
  </div>
</div>

${kilavuz ? `<div class="sayfa">
  <h2>3. Montaj Sırası</h2>
  ${kilavuz.adimlar.map(a => `<div style="border:1px solid #d5d9e0;border-radius:6px;padding:8px;margin-bottom:8px">
    <b>${a.no}. ${a.anaMontajMi ? 'ANA MONTAJ' : 'Alt montaj'}: ${esc(a.hedef)}</b>
    ${a.parcalar.length ? '<div style="font-size:10.5px;margin-top:3px">' +
      a.parcalar.map(p => esc(p.ad) + ' ×' + p.adet).join(' · ') + '</div>' : ''}
    ${a.baglantilar.length ? '<div style="font-size:10.5px;color:#555">Bağlantı: ' +
      a.baglantilar.map(b => esc(b.ad) + ' ×' + b.adet).join(' · ') + '</div>' : ''}
  </div>`).join('')}
  <div style="margin-top:12px;display:flex;justify-content:space-between;font-size:10.5px">
    <div>Hazırlayan: ______________</div><div>Kontrol: ______________</div>
    <div>Tarih: __________</div>
  </div>
</div>` : ''}

</body></html>`;
  }

  function yazdir(geo, kilavuz, bilgi) {
    const html = teknikDosyaHtml(geo, kilavuz, bilgi);
    if (!html) throw new Error('Çizim üretilemedi — STEP dosyasında geometri bulunamadı.');
    const w = window.open('', '_blank');
    if (!w) throw new Error('Açılır pencere engellendi. Tarayıcı ayarlarından izin verin.');
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) { } }, 500);
  }

  return { izo, patlatmaVektoru, patlatilmisSvg, gorunusSvg, teknikDosyaHtml, yazdir, GORUNUSLER };
})();

if (typeof module !== 'undefined') module.exports = TeknikCizim;
