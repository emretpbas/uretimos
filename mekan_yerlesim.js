// ════════════════════════════════════════════════════════════════════════════
// MEKAN YERLEŞİM MODÜLÜ
// ────────────────────────────────────────────────────────────────────────────
// Amaç: Dolap Tasarım ve Masa Tasarım modüllerinde oluşturulan tasarımları,
// bir ODA planı (kuş bakışı / 2D üstten görünüm) üzerine yerleştirmek.
//
// Bu, bir 3D/fotogerçekçi sunum aracı DEĞİLDİR. Odaklandığı şey:
//   1) Boş oda tanımı  — duvar ölçüleri, kapı, pencere
//   2) Yerleşim         — kayıtlı dolap/masa tasarımlarını plana koyma,
//                         sürükleme, döndürme, duvara yaslama
//   3) Proje toplamı    — yerleştirilen tasarımların kesim/hacim/adet özeti
//
// Kesim listesi, maliyet ve reçete ZATEN tasarımların kendisinden gelir; bu
// modül onları bir "mekan projesi" altında toplar ve konumlandırır. Böylece
// "bu mutfakta hangi dolaplar var, toplam kaç metre tezgah, kaç m² plaka"
// sorusu tek ekrandan cevaplanır.
//
// Saklama: `mekanlar` koleksiyonu. Bir mekan kaydı:
//   { id, kod, ad, oda:{en,boy,duvarYuksekligi}, acikliklar:[...],
//     yerlesimler:[{ id, tip:'dolap'|'masa', tasarimId, x, y, aci, ad, ... }] }
//   Ölçüler mm cinsindendir (sistemin geri kalanıyla tutarlı).
// ════════════════════════════════════════════════════════════════════════════
const MekanYerlesim = (() => {
  let mekan = null;          // üzerinde çalışılan mekan kaydı
  let seciliYerlesimId = null;
  let onKapat = null;
  let dolapTasarimlari = [], masaTasarimlari = [];

  const VARSAYILAN_ODA = { en: 4000, boy: 3000, duvarYuksekligi: 2400 }; // mm

  // ── Bir tasarımın plan üzerindeki AYAK İZİ (genişlik × derinlik, mm) ──────
  // Dolap: yapilandirma.genislik × derinlik. Masa: tabla dizilimine göre.
  // Tasarım bulunamazsa güvenli varsayılan döner (kullanıcı yine de taşıyabilir).
  function tasarimAyakIzi(tip, tasarimId) {
    if (tip === 'dolap') {
      const t = dolapTasarimlari.find(x => x.id === tasarimId);
      const c = (t && t.yapilandirma) || {};
      return { en: +c.genislik || 800, derinlik: +c.derinlik || 500, ad: t ? t.ad : 'Dolap', kod: t ? t.kod : '' };
    }
    const t = masaTasarimlari.find(x => x.id === tasarimId);
    const c = (t && t.yapilandirma) || {};
    // Masa boyu: kişi başı tabla × kişi sayısı (yaklaşık); yoksa tablaBoy.
    const kisi = +c.kisiSayisi || +c.tablaAdet || 1;
    const boy = (+c.tablaBoy || 1600) * (kisi > 0 ? kisi : 1);
    const derinlik = c.dizilim === 'karsilikli'
      ? (+c.tablaEn || 700) * 2 + (+c.siraArasiBosluk || 50)
      : (+c.tablaEn || 700);
    return { en: boy, derinlik, ad: t ? t.ad : 'Masa', kod: t ? t.kod : '' };
  }

  // ── ANA GİRİŞ ────────────────────────────────────────────────────────────
  async function ac(onSaved) {
    onKapat = onSaved;
    [dolapTasarimlari, masaTasarimlari] = await Promise.all([
      Store.dolapTasarimlari.all(), Store.masaTasarimlari.all()
    ]);
    if (!mekan) yeniMekan();
    render();
  }

  function yeniMekan() {
    mekan = {
      id: App.uid('MKN'),
      kod: 'MKN-' + Date.now().toString(36).toUpperCase().slice(-5),
      ad: 'Yeni Mekan',
      oda: Object.assign({}, VARSAYILAN_ODA),
      acikliklar: [],       // { tip:'kapi'|'pencere', duvar:'alt'|'ust'|'sol'|'sag', konum, genislik }
      yerlesimler: [],
      olusturmaTarihi: new Date().toISOString().slice(0, 10)
    };
    seciliYerlesimId = null;
  }

  // ── KAYITLI MEKAN LİSTESİ ────────────────────────────────────────────────
  async function listeAc(onSaved) {
    onKapat = onSaved;
    const liste = await Store.mekanlar.all();
    const body = document.createElement('div');
    if (!liste.length) {
      body.innerHTML = `<div class="empty-state" style="padding:22px 10px"><div class="edesc">
        Henüz kayıtlı mekan yok. "🏠 Mekan Yerleşim" ile bir oda oluşturup tasarımlarınızı yerleştirin.</div></div>`;
      App.openModal({ title: '🏠 Kayıtlı Mekanlar', body, footer: `<button class="btn" id="mk-kapat">Kapat</button>` });
      document.getElementById('mk-kapat').onclick = App.closeModal;
      return;
    }
    body.innerHTML = `<table class="dtable" style="font-size:11.5px">
      <tr><th>Kod</th><th>Ad</th><th class="r">Oda (m)</th><th class="r">Yerleşim</th><th>Tarih</th><th></th></tr>
      ${liste.map(m => `<tr>
        <td class="mono">${App.escapeHtml(m.kod)}</td>
        <td>${App.escapeHtml(m.ad)}</td>
        <td class="r">${App.fmt((m.oda.en||0)/1000,2)}×${App.fmt((m.oda.boy||0)/1000,2)}</td>
        <td class="r">${(m.yerlesimler||[]).length} parça</td>
        <td>${m.guncellemeTarihi || m.olusturmaTarihi || '—'}</td>
        <td><button class="btn btn-sm btn-blue mk-ac" data-id="${m.id}">Aç</button></td>
      </tr>`).join('')}
    </table>`;
    App.openModal({ title: '🏠 Kayıtlı Mekanlar', body, footer: `<button class="btn" id="mk-kapat">Kapat</button>`, wide: true });
    document.getElementById('mk-kapat').onclick = App.closeModal;
    body.querySelectorAll('.mk-ac').forEach(b => b.onclick = async () => {
      const secilen = liste.find(x => x.id === b.dataset.id);
      if (secilen) { mekan = JSON.parse(JSON.stringify(secilen)); seciliYerlesimId = null; App.closeModal(); await ac(onKapat); }
    });
  }

  // ── ANA EKRAN ────────────────────────────────────────────────────────────
  function render() {
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:280px">
          <div class="flbl" style="margin-bottom:6px">Oda Ölçüleri (mm)</div>
          <div class="frow">
            <div class="fgroup"><label class="flbl">En (X)</label><input class="finput mk-oda" id="mk-oda-en" type="number" min="500" step="10" value="${mekan.oda.en}"></div>
            <div class="fgroup"><label class="flbl">Boy (Y)</label><input class="finput mk-oda" id="mk-oda-boy" type="number" min="500" step="10" value="${mekan.oda.boy}"></div>
            <div class="fgroup"><label class="flbl">Duvar Yük.</label><input class="finput mk-oda" id="mk-oda-h" type="number" min="1000" step="10" value="${mekan.oda.duvarYuksekligi}"></div>
          </div>
          <div class="fgroup"><label class="flbl">Mekan Adı</label><input class="finput" id="mk-ad" value="${App.escapeHtml(mekan.ad)}"></div>

          <div class="hr"></div>
          <div class="flbl" style="margin-bottom:6px">Tasarım Ekle (kayıtlı tasarımlar)</div>
          <div class="fhint" style="margin-bottom:6px">Bir tasarım seçip "+ Yerleştir" deyin; plana sol-üst köşeye eklenir, sonra sürükleyin.</div>
          <div class="frow">
            <div class="fgroup" style="flex:2"><label class="flbl">Tasarım</label>
              <select class="finput" id="mk-tasarim-sec">
                <optgroup label="Dolap Tasarımları">
                  ${dolapTasarimlari.map(t => `<option value="dolap:${t.id}">${App.escapeHtml(t.kod)} — ${App.escapeHtml(t.ad)}</option>`).join('') || '<option disabled>— kayıtlı dolap yok —</option>'}
                </optgroup>
                <optgroup label="Masa Tasarımları">
                  ${masaTasarimlari.map(t => `<option value="masa:${t.id}">${App.escapeHtml(t.kod)} — ${App.escapeHtml(t.ad)}</option>`).join('') || '<option disabled>— kayıtlı masa yok —</option>'}
                </optgroup>
              </select>
            </div>
            <div class="fgroup" style="align-self:flex-end"><button class="btn btn-blue" id="mk-yerlestir">+ Yerleştir</button></div>
          </div>

          <div class="hr"></div>
          <div id="mk-secili-panel"></div>
        </div>

        <div style="flex:1;min-width:320px">
          <div class="flbl" style="margin-bottom:6px">Plan (üstten görünüm)</div>
          <div id="mk-plan" style="border:1px solid var(--border);border-radius:8px;background:var(--surface2);overflow:hidden;touch-action:none"></div>
          <div id="mk-ozet" style="margin-top:10px"></div>
        </div>
      </div>`;

    const footer = `
      <button class="btn" id="mk-kapat">Kapat</button>
      <button class="btn" id="mk-yeni">+ Yeni Mekan</button>
      <button class="btn btn-blue" id="mk-liste">📂 Kayıtlılar</button>
      <button class="btn btn-green" id="mk-kaydet">💾 Mekanı Kaydet</button>`;

    App.openModal({ title: '🏠 Mekan Yerleşim', sub: mekan.kod, body, footer, xwide: true });

    // Oda ölçüsü değişince planı yeniden çiz
    body.querySelectorAll('.mk-oda').forEach(i => i.oninput = () => {
      mekan.oda.en = +document.getElementById('mk-oda-en').value || VARSAYILAN_ODA.en;
      mekan.oda.boy = +document.getElementById('mk-oda-boy').value || VARSAYILAN_ODA.boy;
      mekan.oda.duvarYuksekligi = +document.getElementById('mk-oda-h').value || VARSAYILAN_ODA.duvarYuksekligi;
      planCiz();
    });
    document.getElementById('mk-ad').oninput = (e) => { mekan.ad = e.target.value; };

    document.getElementById('mk-yerlestir').onclick = () => {
      const sec = document.getElementById('mk-tasarim-sec').value;
      if (!sec || !sec.includes(':')) { App.toast('Önce kayıtlı bir tasarım seçin', 'err'); return; }
      const [tip, tasarimId] = sec.split(':');
      const iz = tasarimAyakIzi(tip, tasarimId);
      mekan.yerlesimler.push({
        id: App.uid('YRL'), tip, tasarimId,
        x: 50, y: 50, aci: 0,          // sol-üstten 50 mm içeride
        en: iz.en, derinlik: iz.derinlik, ad: iz.ad, kod: iz.kod
      });
      seciliYerlesimId = mekan.yerlesimler[mekan.yerlesimler.length - 1].id;
      planCiz(); seciliPanelCiz(); ozetCiz();
    };

    document.getElementById('mk-kapat').onclick = () => { App.closeModal(); if (onKapat) onKapat(); };
    document.getElementById('mk-yeni').onclick = () => { yeniMekan(); App.closeModal(); ac(onKapat); };
    document.getElementById('mk-liste').onclick = () => { App.closeModal(); listeAc(onKapat); };
    document.getElementById('mk-kaydet').onclick = kaydet;

    planCiz(); seciliPanelCiz(); ozetCiz();
  }

  // ── PLAN ÇİZİMİ (SVG, üstten görünüm) ────────────────────────────────────
  function planCiz() {
    const kap = document.getElementById('mk-plan');
    if (!kap) return;
    const W = mekan.oda.en, H = mekan.oda.boy;
    const enBoyMax = 520;                 // px cinsinden çizim alanı üst sınırı
    const olcek = Math.min(enBoyMax / W, enBoyMax / H);
    const pw = Math.round(W * olcek), ph = Math.round(H * olcek);
    const px = (mm) => mm * olcek;

    // Yerleştirilen parçalar
    let parcalarSvg = '';
    (mekan.yerlesimler || []).forEach(y => {
      const secili = y.id === seciliYerlesimId;
      const w = px(y.en), d = px(y.derinlik);
      const cx = px(y.x) + w / 2, cy = px(y.y) + d / 2;
      const renk = y.tip === 'dolap' ? '#3b82f6' : '#10b981';
      parcalarSvg += `
        <g class="mk-parca" data-id="${y.id}" transform="rotate(${y.aci} ${cx} ${cy})" style="cursor:grab">
          <rect x="${px(y.x)}" y="${px(y.y)}" width="${w}" height="${d}"
            fill="${renk}${secili ? '55' : '33'}" stroke="${renk}" stroke-width="${secili ? 2.5 : 1.5}" rx="2"/>
          <text x="${cx}" y="${cy}" font-size="9" text-anchor="middle" dominant-baseline="middle"
            fill="var(--text)" style="pointer-events:none">${App.escapeHtml((y.kod || y.ad || '').slice(0, 14))}</text>
        </g>`;
    });

    // Açıklıklar (kapı/pencere) — duvar kenarına çizilir
    let acikSvg = '';
    (mekan.acikliklar || []).forEach(a => {
      const g = px(a.genislik || 800);
      let x1, y1, x2, y2;
      if (a.duvar === 'alt') { y1 = y2 = ph; x1 = px(a.konum); x2 = x1 + g; }
      else if (a.duvar === 'ust') { y1 = y2 = 0; x1 = px(a.konum); x2 = x1 + g; }
      else if (a.duvar === 'sol') { x1 = x2 = 0; y1 = px(a.konum); y2 = y1 + g; }
      else { x1 = x2 = pw; y1 = px(a.konum); y2 = y1 + g; }
      acikSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${a.tip === 'kapi' ? '#f59e0b' : '#8b5cf6'}" stroke-width="4"/>`;
    });

    kap.innerHTML = `
      <svg id="mk-svg" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}" style="display:block;max-width:100%">
        <rect x="0" y="0" width="${pw}" height="${ph}" fill="none" stroke="var(--text3)" stroke-width="2"/>
        ${parcalarSvg}
        ${acikSvg}
        <text x="${pw/2}" y="${ph-4}" font-size="9" text-anchor="middle" fill="var(--text3)">${App.fmt(W/1000,2)} m</text>
        <text x="4" y="${ph/2}" font-size="9" fill="var(--text3)" transform="rotate(-90 4 ${ph/2})">${App.fmt(H/1000,2)} m</text>
      </svg>
      <div class="fhint" style="padding:6px 8px">Mavi = dolap · Yeşil = masa. Parçaya tıklayıp sürükleyin.</div>`;

    surukleBagla(olcek);
  }

  // Basit sürükleme: pointer olaylarıyla parçayı plan içinde taşır, oda
  // sınırında kırpar (parça odadan taşmaz).
  function surukleBagla(olcek) {
    const svg = document.getElementById('mk-svg');
    if (!svg) return;
    let aktif = null, baslaX = 0, baslaY = 0, parcaBasX = 0, parcaBasY = 0;

    svg.querySelectorAll('.mk-parca').forEach(g => {
      g.addEventListener('pointerdown', (e) => {
        const id = g.dataset.id;
        seciliYerlesimId = id;
        const y = mekan.yerlesimler.find(x => x.id === id);
        if (!y) return;
        aktif = y; baslaX = e.clientX; baslaY = e.clientY; parcaBasX = y.x; parcaBasY = y.y;
        g.setPointerCapture(e.pointerId);
        seciliPanelCiz();
      });
    });
    svg.addEventListener('pointermove', (e) => {
      if (!aktif) return;
      const dxMm = (e.clientX - baslaX) / olcek;
      const dyMm = (e.clientY - baslaY) / olcek;
      // Oda sınırında kırp
      const maxX = mekan.oda.en - aktif.en, maxY = mekan.oda.boy - aktif.derinlik;
      aktif.x = Math.max(0, Math.min(maxX < 0 ? 0 : maxX, parcaBasX + dxMm));
      aktif.y = Math.max(0, Math.min(maxY < 0 ? 0 : maxY, parcaBasY + dyMm));
      planCiz();
    });
    const bitir = () => { if (aktif) { aktif = null; ozetCiz(); } };
    svg.addEventListener('pointerup', bitir);
    svg.addEventListener('pointercancel', bitir);
  }

  // ── SEÇİLİ PARÇA PANELİ ──────────────────────────────────────────────────
  function seciliPanelCiz() {
    const kap = document.getElementById('mk-secili-panel');
    if (!kap) return;
    const y = (mekan.yerlesimler || []).find(x => x.id === seciliYerlesimId);
    if (!y) { kap.innerHTML = `<div class="fhint">Bir parça seçilmedi. Plandan tıklayın veya yukarıdan ekleyin.</div>`; return; }
    kap.innerHTML = `
      <div class="flbl" style="margin-bottom:6px">Seçili: <b>${App.escapeHtml(y.kod || y.ad)}</b> (${y.tip})</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">X (mm)</label><input class="finput mk-pos" id="mk-px" type="number" step="10" value="${Math.round(y.x)}"></div>
        <div class="fgroup"><label class="flbl">Y (mm)</label><input class="finput mk-pos" id="mk-py" type="number" step="10" value="${Math.round(y.y)}"></div>
        <div class="fgroup"><label class="flbl">Açı (°)</label>
          <select class="finput mk-pos" id="mk-aci">
            ${[0,90,180,270].map(a => `<option value="${a}" ${y.aci===a?'selected':''}>${a}°</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="btn btn-sm" id="mk-yasla-ust">⬆ Üst duvar</button>
        <button class="btn btn-sm" id="mk-yasla-alt">⬇ Alt duvar</button>
        <button class="btn btn-sm" id="mk-yasla-sol">⬅ Sol</button>
        <button class="btn btn-sm" id="mk-yasla-sag">➡ Sağ</button>
        <button class="btn btn-sm" id="mk-parca-sil" style="color:var(--red-text);margin-left:auto">Sil</button>
      </div>`;

    kap.querySelectorAll('.mk-pos').forEach(i => i.onchange = () => {
      y.x = +document.getElementById('mk-px').value || 0;
      y.y = +document.getElementById('mk-py').value || 0;
      y.aci = +document.getElementById('mk-aci').value || 0;
      planCiz();
    });
    const yasla = (kenar) => {
      // Döndürülmüş parçada plan ayak izi en/derinlik yer değiştirir
      const dik = (y.aci === 90 || y.aci === 270);
      const w = dik ? y.derinlik : y.en, d = dik ? y.en : y.derinlik;
      if (kenar === 'ust') y.y = 0;
      else if (kenar === 'alt') y.y = Math.max(0, mekan.oda.boy - d);
      else if (kenar === 'sol') y.x = 0;
      else if (kenar === 'sag') y.x = Math.max(0, mekan.oda.en - w);
      planCiz(); seciliPanelCiz();
    };
    document.getElementById('mk-yasla-ust').onclick = () => yasla('ust');
    document.getElementById('mk-yasla-alt').onclick = () => yasla('alt');
    document.getElementById('mk-yasla-sol').onclick = () => yasla('sol');
    document.getElementById('mk-yasla-sag').onclick = () => yasla('sag');
    document.getElementById('mk-parca-sil').onclick = () => {
      mekan.yerlesimler = mekan.yerlesimler.filter(x => x.id !== y.id);
      seciliYerlesimId = null;
      planCiz(); seciliPanelCiz(); ozetCiz();
    };
  }

  // ── PROJE ÖZETİ ──────────────────────────────────────────────────────────
  // Yerleştirilen tasarımları sayar; dolap tezgah metresi ve toplam parçayı özetler.
  function ozetCiz() {
    const kap = document.getElementById('mk-ozet');
    if (!kap) return;
    const yer = mekan.yerlesimler || [];
    const dolapSay = yer.filter(y => y.tip === 'dolap').length;
    const masaSay = yer.filter(y => y.tip === 'masa').length;
    // Dolapların toplam ön genişliği (yaklaşık tezgah/cephe metresi)
    const dolapEnMm = yer.filter(y => y.tip === 'dolap').reduce((s, y) => s + (y.en || 0), 0);
    if (!yer.length) { kap.innerHTML = `<div class="fhint">Henüz parça yerleştirilmedi.</div>`; return; }
    kap.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:11.5px">
        <div style="font-weight:700;margin-bottom:6px">📋 Mekan Özeti</div>
        <div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:var(--text2)">Dolap sayısı</span><span class="mono">${dolapSay}</span></div>
        <div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:var(--text2)">Masa sayısı</span><span class="mono">${masaSay}</span></div>
        <div style="display:flex;justify-content:space-between;padding:2px 0;font-weight:700"><span style="color:var(--text2)">Toplam cephe (dolap)</span><span class="mono">${App.fmt(dolapEnMm/1000,2)} m</span></div>
        <div class="fhint" style="margin-top:6px">Kesim listesi ve maliyet her tasarımın kendi ekranından alınır. Bu özet yerleşimi gösterir.</div>
      </div>`;
  }

  // ── KAYDET ───────────────────────────────────────────────────────────────
  async function kaydet() {
    const liste = await Store.mekanlar.all();
    const mevcut = liste.find(x => x.id === mekan.id);
    mekan.guncellemeTarihi = new Date().toISOString().slice(0, 10);
    if (mevcut) Object.assign(mevcut, mekan);
    else liste.push(JSON.parse(JSON.stringify(mekan)));
    await App.persist(() => Store.mekanlar.save(liste));
    App.toast('Mekan kaydedildi: ' + mekan.kod, 'ok');
  }

  return { ac, listeAc, tasarimAyakIzi };
})();
