// ════════════════════════════════════════════════════════════════════════════
// MRP — MALZEME İHTİYAÇ PLANLAMASI EKRANI
//   Sekme 1: 🚨 Aksiyon Listesi — sipariş verilmesi gereken malzemeler
//   Sekme 2: 📅 Zaman Fazlı Plan — hafta hafta ihtiyaç / stok projeksiyonu
//   Sekme 3: 🔗 İhtiyaç Kaynağı — hangi sipariş hangi malzemeyi tetikliyor
// ════════════════════════════════════════════════════════════════════════════
PageModules.mrp = (() => {
  let activeTab = 'aksiyon';
  let ufukHafta = 12;
  let sonuc = null;
  let secili = new Set();

  const bugun = () => new Date().toISOString().slice(0, 10);
  const haftaEtiket = (t, i) => {
    const d = new Date(t + 'T00:00:00');
    return `H${i + 1}<br><span style="font-size:8.5px;font-weight:400">${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}</span>`;
  };

  async function render(main, params) {
    if (!(params && params.koruCache)) sonuc = null;
    if (params && params.tab) activeTab = params.tab;

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">MRP — Malzeme İhtiyaç Planlaması</div>
        <div class="page-sub">İleriye dönük malzeme planı: ne zaman, ne kadar, ne zaman sipariş verilmeli</div></div>
        <div class="page-acts">
          <select class="fselect" id="mrp-ufuk" style="max-width:130px;display:inline-block">
            ${[4, 8, 12, 16, 26].map(h => `<option value="${h}" ${ufukHafta === h ? 'selected' : ''}>${h} hafta</option>`).join('')}
          </select>
          <button class="btn btn-blue" id="mrp-yenile">↻ MRP Çalıştır</button></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'aksiyon' ? 'active' : ''}" data-tab="aksiyon">🚨 Aksiyon Listesi</div>
        <div class="tab ${activeTab === 'plan' ? 'active' : ''}" data-tab="plan">📅 Zaman Fazlı Plan</div>
        <div class="tab ${activeTab === 'kaynak' ? 'active' : ''}" data-tab="kaynak">🔗 İhtiyaç Kaynağı</div>
      </div>
      <div id="mrp-content"><div style="padding:40px;text-align:center"><div class="loading-spin" style="margin:0 auto"></div></div></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => render(main, { tab: t.dataset.tab, koruCache: true }));
    document.getElementById('mrp-yenile').onclick = () => render(main);
    document.getElementById('mrp-ufuk').onchange = (e) => { ufukHafta = parseInt(e.target.value); render(main); };

    if (!sonuc) { sonuc = await MrpMotor.tamMrp({ ufukHafta }); secili = new Set(); }
    const c = document.getElementById('mrp-content');

    if (!sonuc.satirlar.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Planlanacak malzeme ihtiyacı yok</div>
        <div class="edesc">MRP için (1) onaylı sipariş veya aktif iş emri, (2) ürün/yarı mamül reçetelerinde <b>hammadde</b> tanımı gerekir. Reçetelerde hammadde yoksa malzeme ihtiyacı hesaplanamaz.</div></div></div>`;
      return;
    }

    if (activeTab === 'aksiyon') aksiyonTab(c, main);
    else if (activeTab === 'plan') planTab(c);
    else kaynakTab(c);
  }

  // ── SEKME 1: AKSİYON LİSTESİ ────────────────────────────────────────────
  function aksiyonTab(c, main) {
    const o = sonuc.ozet;
    const aksiyonlular = sonuc.satirlar.filter(s => s.toplamOnerilen > 0);
    const aciller = aksiyonlular.filter(s => s.acilVar);

    let html = `<div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Sipariş Gereken Malzeme</div><div class="kpi-val ${aksiyonlular.length ? 'amber' : 'green'}">${aksiyonlular.length}</div>
        <div class="muted" style="font-size:10.5px">${o.malzemeSayisi} malzeme planlandı</div></div>
      <div class="kpi"><div class="kpi-lbl">ACİL (tarihi geçmiş)</div><div class="kpi-val ${aciller.length ? 'red' : 'green'}">${aciller.length}</div>
        <div class="muted" style="font-size:10.5px">Hemen sipariş verilmeli</div></div>
      <div class="kpi"><div class="kpi-lbl">Tahmini Satın Alma</div><div class="kpi-val blue">${App.fmtTL(o.toplamMaliyet)}</div>
        <div class="muted" style="font-size:10.5px">${o.ufukHafta} haftalık ufuk</div></div>
      <div class="kpi"><div class="kpi-lbl">Termini Olmayan Kalem</div><div class="kpi-val ${o.terminsizKalem ? 'amber' : 'green'}">${o.terminsizKalem}</div>
        <div class="muted" style="font-size:10.5px">2 hafta varsayıldı</div></div>
    </div>`;

    if (o.terminsizKalem) {
      html += `<div class="card" style="border:1px solid var(--amber);background:var(--amber-bg);margin-bottom:12px">
        <div style="font-size:11.5px">⚠ <b>${o.terminsizKalem} sipariş kaleminde üretim termini yok.</b> MRP bunlar için 2 hafta varsaydı — gerçek termin girilirse plan daha doğru olur (Üretim Panel → Siparişler & Termin).</div></div>`;
    }
    if (aciller.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🚨 ${aciller.length} malzemede SİPARİŞ TARİHİ GEÇMİŞ</div>
        <div class="fhint" style="margin-top:4px">Tedarik süresi dikkate alındığında bu malzemeler için sipariş tarihi geride kalmış. Bugün sipariş verilse bile ihtiyaç tarihinde yetişmeyebilir — hızlandırılmış tedarik veya termin revizyonu gerekir.</div>
        ${aciller.slice(0, 5).map(s => {
          const ilk = s.onerilenSiparisler.find(x => x.acilMi);
          return `<div style="font-size:11.5px;padding:3px 0">⚠ <b>${App.escapeHtml(s.kod)}</b> ${App.escapeHtml(s.ad.slice(0, 30))} — ${App.fmt(s.toplamOnerilen, 1)} ${s.birim} · sipariş tarihi <b>${ilk.siparisTarihi}</b> (${ilk.gecikmeGun} gün geçti)</div>`;
        }).join('')}
      </div>`;
    }

    html += `<div class="card">
      <div class="card-hdr"><div class="card-title">📋 Önerilen Satın Alma Planı</div>
        <button class="btn btn-sm btn-blue" id="mrp-talep" disabled>⚡ Seçilenleri Talebe Dönüştür (0)</button></div>
      <div class="fhint" style="margin-bottom:8px">
        <b>Net İhtiyaç</b> = Brüt İhtiyaç − Eldeki Stok − Yoldaki Sipariş + Emniyet Stoğu.
        <b>Sipariş Tarihi</b>, ihtiyaç tarihinden tedarik süresi kadar geriye gidilerek bulunur. Miktarlar fire oranı dahil hesaplanır.</div>
      <table class="dtable" style="font-size:11px">
        <tr><th style="width:28px"><input type="checkbox" id="mrp-hepsi"></th>
        <th>Malzeme</th><th class="r">Brüt İhtiyaç</th><th class="r">Eldeki</th><th class="r">Emniyet</th>
        <th class="r">Önerilen Sipariş</th><th>En Erken Sipariş T.</th><th class="r">Tedarik</th><th class="r">Tutar</th><th>Durum</th></tr>
        ${aksiyonlular.map(s => {
          const ilk = s.onerilenSiparisler[0];
          return `<tr${s.acilVar ? ' style="background:var(--red-bg)"' : ''}>
            <td><input type="checkbox" class="mrp-sec" data-id="${s.hammaddeId}"></td>
            <td><b class="mono" style="font-size:10.5px">${App.escapeHtml(s.kod || '—')}</b><br>
              <span class="muted" style="font-size:9.5px">${App.escapeHtml((s.ad || '').slice(0, 34))}</span>
              ${s.fireYuzde ? `<br><span class="muted" style="font-size:9px">fire %${s.fireYuzde} dahil</span>` : ''}</td>
            <td class="r">${App.fmt(s.toplamBrut, 1)} ${App.escapeHtml(s.birim || '')}</td>
            <td class="r">${App.fmt(s.eldeki, 1)}</td>
            <td class="r muted">${s.emniyet ? App.fmt(s.emniyet, 1) : '—'}</td>
            <td class="r"><b style="color:var(--blue-text)">${App.fmt(s.toplamOnerilen, 1)}</b>
              ${s.minSiparis ? `<br><span class="muted" style="font-size:9px">min ${App.fmt(s.minSiparis, 0)}</span>` : ''}</td>
            <td class="mono" style="font-size:10px">${ilk ? ilk.siparisTarihi : '—'}
              ${ilk && ilk.acilMi ? `<br><span class="pill pill-red" style="font-size:8.5px">${ilk.gecikmeGun} gün geçti</span>` : ''}</td>
            <td class="r">${s.tedarikSuresi} gün</td>
            <td class="r">${App.fmtTL(s.maliyet)}</td>
            <td>${s.acilVar ? '<span class="pill pill-red" style="font-size:9px">ACİL</span>'
              : '<span class="pill pill-amber" style="font-size:9px">Planla</span>'}</td>
          </tr>`;
        }).join('')}
      </table></div>`;
    c.innerHTML = html;

    const sayacGuncelle = () => {
      const n = c.querySelectorAll('.mrp-sec:checked').length;
      const btn = document.getElementById('mrp-talep');
      btn.disabled = !n;
      btn.textContent = `⚡ Seçilenleri Talebe Dönüştür (${n})`;
    };
    c.querySelectorAll('.mrp-sec').forEach(cb => cb.onchange = sayacGuncelle);
    const hepsi = document.getElementById('mrp-hepsi');
    if (hepsi) hepsi.onchange = () => {
      c.querySelectorAll('.mrp-sec').forEach(cb => cb.checked = hepsi.checked);
      sayacGuncelle();
    };

    document.getElementById('mrp-talep').onclick = () => {
      const idler = [...c.querySelectorAll('.mrp-sec:checked')].map(cb => cb.dataset.id);
      const secilenler = sonuc.satirlar.filter(s => idler.includes(s.hammaddeId));
      const toplam = secilenler.reduce((a, s) => a + s.maliyet, 0);
      App.confirmDialog(
        `<b>${secilenler.length} malzeme</b> için satın alma talebi açılacak (tahmini ${App.fmtTL(toplam)}):<br><br>` +
        secilenler.slice(0, 8).map(s => `• <b>${App.escapeHtml(s.kod)}</b> — ${App.fmt(s.toplamOnerilen, 1)} ${s.birim}${s.acilVar ? ' <span style="color:var(--red-text)">(ACİL)</span>' : ''}`).join('<br>') +
        (secilenler.length > 8 ? `<br>… ve ${secilenler.length - 8} kalem daha` : '') +
        `<br><br>Talepler <b>Satın Alma</b> panelinde işlenmeyi bekleyecek. Onaylıyor musunuz?`,
        async () => {
          const r = await App.persist(() => MrpMotor.taleplereDonustur(secilenler));
          App.toast(`${r.acilan} satın alma talebi açıldı${r.atlanan ? ` (${r.atlanan} kalemde zaten açık talep vardı)` : ''}`, 'ok');
          render(main);
        });
    };
  }

  // ── SEKME 2: ZAMAN FAZLI PLAN ───────────────────────────────────────────
  function planTab(c) {
    const h = sonuc.haftalar;
    c.innerHTML = `<div class="card">
      <div class="fhint" style="margin-bottom:8px">
        Her malzeme için hafta hafta: <b>İ</b>=ihtiyaç (brüt), <b>Y</b>=yoldaki sipariş, <b>S</b>=projeksiyon stok, <b>Ö</b>=önerilen sipariş.
        Projeksiyon stok <span style="color:var(--red-text)">kırmızı</span> ise o hafta malzeme biter.</div>
      <div style="overflow-x:auto">
      <table class="dtable" style="font-size:10px;min-width:${240 + h.length * 62}px">
        <tr><th style="min-width:170px;position:sticky;left:0;background:var(--surface);z-index:2">Malzeme</th>
        <th style="min-width:44px">Satır</th>
        ${h.map((t, i) => `<th style="min-width:58px;text-align:center">${haftaEtiket(t, i)}</th>`).join('')}</tr>
        ${sonuc.satirlar.map(s => {
          const sat = (etiket, alan, renkFn) => `<tr>
            ${etiket === 'İ' ? `<td rowspan="4" style="position:sticky;left:0;background:var(--surface);vertical-align:top;z-index:1">
              <b class="mono" style="font-size:10px">${App.escapeHtml(s.kod || '—')}</b><br>
              <span class="muted" style="font-size:9px">${App.escapeHtml((s.ad || '').slice(0, 26))}</span><br>
              <span class="muted" style="font-size:8.5px">Elde: ${App.fmt(s.eldeki, 0)} ${App.escapeHtml(s.birim || '')} · TS ${s.tedarikSuresi}g</span></td>` : ''}
            <td style="font-weight:700;font-size:9.5px;color:var(--text2)">${etiket}</td>
            ${s.haftaDetay.map(d => {
              const v = d[alan] || 0;
              const stil = renkFn ? renkFn(d) : '';
              return `<td style="text-align:center;${stil}">${v ? App.fmt(v, v < 10 ? 1 : 0) : '<span class="muted">·</span>'}</td>`;
            }).join('')}
          </tr>`;
          return sat('İ', 'brut') +
                 sat('Y', 'yolda') +
                 sat('S', 'projeksiyon', (d) => d.projeksiyon < 0 ? 'background:var(--red-bg);color:var(--red-text);font-weight:700'
                    : d.projeksiyon < s.emniyet ? 'background:var(--amber-bg)' : '') +
                 sat('Ö', 'onerilen', (d) => d.onerilen > 0 ? 'background:var(--blue-bg);color:var(--blue-text);font-weight:700' : '');
        }).join('')}
      </table></div></div>`;
  }

  // ── SEKME 3: İHTİYAÇ KAYNAĞI (pegging) ──────────────────────────────────
  function kaynakTab(c) {
    let html = `<div class="card">
      <div class="fhint" style="margin-bottom:8px">Hangi müşteri siparişi / iş emri hangi malzemeyi tetikliyor? Bir malzeme gecikirse hangi siparişlerin etkileneceğini gösterir (<i>pegging</i>).</div>`;
    sonuc.satirlar.filter(s => s.kaynaklar.length).slice(0, 25).forEach(s => {
      html += `<div style="margin-bottom:14px">
        <div style="background:var(--surface2);border-left:3px solid var(--blue);border-radius:8px;padding:8px 12px;margin-bottom:6px">
          <b class="mono" style="font-size:11.5px">${App.escapeHtml(s.kod || '—')}</b>
          <span style="font-size:11px"> — ${App.escapeHtml(s.ad || '')}</span>
          <span class="muted" style="font-size:10px;margin-left:8px">toplam ${App.fmt(s.toplamBrut, 1)} ${App.escapeHtml(s.birim || '')} · ${s.kaynaklar.length} kaynak</span></div>
        <table class="dtable" style="font-size:10.5px">
          <tr><th>Kaynak</th><th>Müşteri</th><th>İhtiyaç Tarihi</th><th class="r">Hafta</th><th class="r">Miktar</th></tr>
          ${s.kaynaklar.sort((a, b) => a.tarih.localeCompare(b.tarih)).slice(0, 12).map(k => `<tr>
            <td><span class="pill ${k.kaynakTip === 'ie' ? 'pill-purple' : 'pill-blue'}" style="font-size:8.5px">${k.kaynakTip === 'ie' ? 'İş Emri' : 'Sipariş'}</span>
              <span class="mono" style="font-size:10px">${App.escapeHtml(k.kaynakKod)}</span></td>
            <td>${App.escapeHtml(k.musteriAdi || '—')}</td>
            <td class="mono" style="font-size:10px">${k.tarih}</td>
            <td class="r">H${k.hafta + 1}</td>
            <td class="r"><b>${App.fmt(k.miktar, 1)}</b></td></tr>`).join('')}
        </table></div>`;
    });
    html += `</div>`;
    c.innerHTML = html;
  }

  return { render };
})();
