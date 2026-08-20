// ════════════════════════════════════════════════════════════════════════════
// KANBAN / AKIŞ PANOSU
//
// Hat & İstasyon Takibi'nin ikinci görünümü. Aynı iş kartlarını liste yerine
// yan yana istasyon sütunlarında gösterir; parçanın hatta nerede olduğu ve
// nerede biriktiği tek bakışta görünür.
//
// Pano üç şeyi ölçer ve gösterir:
//   • WIP (iş yükü)  — her istasyonda bekleyen iş ve adet
//   • DARBOĞAZ       — en çok iş biriken istasyon kırmızı başlıkla işaretlenir
//   • BEKLEME SÜRESİ — kartın o istasyona düştüğünden beri geçen gün
//
// Kanban kuralı: darboğazın önündeki istasyona iş yığmak akışı hızlandırmaz,
// yalnızca stoğu artırır. Pano bunu görünür kılar.
// ════════════════════════════════════════════════════════════════════════════
const Kanban = (() => {

  const esc = (s) => (window.App ? App.escapeHtml(s) : String(s == null ? '' : s));

  // Kartın bu istasyonda kaç gündür beklediği
  function bekleyenGun(is) {
    const kaynak = is.istasyonaGiris || is.olusturma || is.tarih;
    if (!kaynak) return null;
    const t = new Date(kaynak).getTime();
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }

  // Bir işin ilerleme yüzdesi (sevk edilen / gelen)
  function ilerleme(is) {
    const gelen = (is.gelenAdet || 0) - (is.fireAdet || 0);
    if (gelen <= 0) return 0;
    return Math.min(100, Math.round(((is.sevkEdilenAdet || 0) / gelen) * 100));
  }

  // ── PANOYU ÇİZ ───────────────────────────────────────────────────────────
  // sirali: [{kod, tanim, sira, isler[]}]  — hat_takip'in hazırladığı yapı
  function panoCiz(el, hat, sirali, hatIsleri, isKartiAc) {
    // Darboğaz: en çok iş biriken istasyon (en az 2 iş varsa anlamlı)
    let darbogaz = null, enCok = 1;
    sirali.forEach(i => { if (i.isler.length > enCok) { enCok = i.isler.length; darbogaz = i.kod; } });

    const toplamAdet = hatIsleri.reduce((t, x) => t + ((x.gelenAdet || 0) - (x.fireAdet || 0)), 0);
    const bekleyen = hatIsleri.filter(x => (x.sevkEdilenAdet || 0) === 0).length;

    el.innerHTML = `
      <div class="card" style="padding:12px 16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div><b style="font-size:14px">${esc(hat)}</b>
            <span class="muted" style="font-size:11px;margin-left:8px">
              ${sirali.length} istasyon · ${hatIsleri.length} iş kartı · ${toplamAdet} adet akışta</span></div>
          ${darbogaz ? `<span class="pill pill-red" style="font-size:10px">Darboğaz: ${esc(darbogaz)} (${enCok} iş)</span>`
                     : '<span class="pill pill-green" style="font-size:10px">Dengeli akış</span>'}
        </div>
        <div class="fhint" style="margin:8px 0 0">
          Sütunlar rota sırasındadır — parça soldan sağa akar. Kırmızı başlıklı sütun
          <b>darboğaz</b>dır: akışı hızlandırmak için önce orayı rahatlatın, öncesine iş
          yığmak yalnızca yarı mamül stoğunu artırır.
        </div>
      </div>

      <div id="kb-pano" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:10px;align-items:flex-start">
        ${sirali.map((ist, i) => {
          const bu = ist.isler.length;
          const adet = ist.isler.reduce((t, x) => t + ((x.gelenAdet || 0) - (x.fireAdet || 0)), 0);
          const darMi = ist.kod === darbogaz;
          const bosMu = bu === 0;
          return `
          <div style="flex:0 0 232px;background:var(--surface2);border:1px solid ${darMi ? 'var(--red)' : 'var(--border)'};
                      border-radius:12px;overflow:hidden">
            <div style="padding:8px 10px;background:${darMi ? 'var(--red-bg)' : 'var(--surface)'};
                        border-bottom:1px solid ${darMi ? 'var(--red-light)' : 'var(--border)'}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                <b class="mono" style="font-size:11.5px;${darMi ? 'color:var(--red-text)' : ''}">${esc(ist.kod)}</b>
                <span class="pill ${bosMu ? 'pill-gray' : darMi ? 'pill-red' : 'pill-amber'}" style="font-size:9.5px">${bu} iş</span>
              </div>
              <div style="font-size:10.5px;color:var(--text3);margin-top:2px">
                ${esc(ist.tanim || '')}${adet ? ' · ' + adet + ' adet' : ''}
              </div>
              <div style="height:3px;background:var(--border);border-radius:3px;margin-top:6px;overflow:hidden">
                <div style="height:100%;width:${Math.min(100, bu * 20)}%;background:${darMi ? 'var(--red)' : bu ? 'var(--amber)' : 'transparent'}"></div>
              </div>
            </div>
            <div style="padding:8px;min-height:60px;max-height:520px;overflow-y:auto">
              ${bosMu ? `<div class="muted" style="font-size:10.5px;text-align:center;padding:14px 4px">
                  ${i === 0 ? 'Bu istasyona iş düşmedi' : 'Boş — önceki istasyondan bekleniyor'}</div>`
                : ist.isler.map(x => kartHtml(x)).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;

    // Karta tıklayınca liste görünümündeki ayrıntıya/işlemlere götür
    el.querySelectorAll('.kb-kart').forEach(k => k.onclick = () => {
      if (isKartiAc) isKartiAc(k.dataset.id);
    });
  }

  // ── TEK KART ─────────────────────────────────────────────────────────────
  function kartHtml(x) {
    const gelen = (x.gelenAdet || 0) - (x.fireAdet || 0);
    const yuzde = ilerleme(x);
    const gun = bekleyenGun(x);
    // Aşama rozetleri: hangi adıma kadar gelmiş
    const adimlar = [
      ['QR', x.barkodOkundu],
      ['KAL', (x.kaliteOnayliAdet || 0) >= gelen && gelen > 0],
      ['İŞL', (x.islemTamamAdet || 0) >= gelen && gelen > 0],
      ['SVK', (x.sevkEdilenAdet || 0) >= gelen && gelen > 0]
    ];
    const bekliyorMu = gun != null && gun >= 3;
    return `
      <div class="kb-kart" data-id="${esc(x.id)}" style="background:var(--surface);border:1px solid var(--border);
           border-left:3px solid ${yuzde === 100 ? 'var(--green)' : yuzde > 0 ? 'var(--amber)' : 'var(--border2)'};
           border-radius:8px;padding:8px 9px;margin-bottom:7px;cursor:pointer">
        <div class="mono" style="font-size:10.5px;font-weight:800;word-break:break-all;line-height:1.3">${esc(x.ymKod || '')}</div>
        <div style="font-size:10px;color:var(--text3);margin:2px 0 5px;line-height:1.3;
                    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(x.ymAd || '')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:5px">
          <span style="font-size:10px;color:var(--text2)"><b>${gelen}</b> adet</span>
          ${bekliyorMu ? `<span class="pill pill-red" style="font-size:8.5px">${gun} gündür</span>`
            : gun != null ? `<span class="muted" style="font-size:9px">${gun} gün</span>` : ''}
        </div>
        <div style="height:4px;background:var(--bg);border-radius:3px;overflow:hidden;margin-bottom:5px">
          <div style="height:100%;width:${yuzde}%;background:${yuzde === 100 ? 'var(--green)' : 'var(--amber)'}"></div>
        </div>
        <div style="display:flex;gap:3px">
          ${adimlar.map(([ad, tamam]) => `<span style="flex:1;text-align:center;font-size:8px;font-weight:800;
            padding:2px 0;border-radius:4px;letter-spacing:.3px;
            background:${tamam ? 'var(--green-bg)' : 'var(--bg)'};
            color:${tamam ? 'var(--green-text)' : 'var(--text3)'}">${ad}</span>`).join('')}
        </div>
      </div>`;
  }

  return { panoCiz, bekleyenGun, ilerleme };
})();
