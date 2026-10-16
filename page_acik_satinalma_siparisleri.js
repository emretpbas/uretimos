// ════════════════════════════════════════════════════════════════════════════
// AÇIK SATINALMA SİPARİŞLERİ — yönetim onayından ÖNCEki siparişler (durum:
// 'yonetim_onayi_bekliyor') burada listelenir. Bu aşamada malzeme adı, fiyat
// ve miktar hâlâ düzenlenebilir. Tedarikçi bazlı gruplandırılmış Excel/PDF/
// Yazıcı çıktısı alınabilir — her tedarikçi için AYRI bir çıktı dosyası/sayfası.
// ════════════════════════════════════════════════════════════════════════════
PageModules.acik_satinalma_siparisleri = (() => {

  async function render(main) {
    const satinalmaSiparisleri = await Store.satinalmaSiparisleri.all();
    const acikSiparisler = satinalmaSiparisleri.filter(s => s.durum === 'yonetim_onayi_bekliyor');

    const gruplar = new Map();
    acikSiparisler.forEach(s => {
      const key = s.tedarikciId || 'belirsiz';
      if (!gruplar.has(key)) gruplar.set(key, { tedarikciAdi: s.tedarikciAdi || 'Tedarikçi Belirsiz', siparisler: [] });
      gruplar.get(key).siparisler.push(s);
    });

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Açık Satınalma Siparişleri</div>
          <div class="page-sub">Yönetim onayından önceki siparişler — malzeme, fiyat ve miktar burada düzenlenebilir. Tedarikçi bazında ayrı çıktı alınabilir.</div>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Açık Sipariş</div><div class="kpi-val amber">${acikSiparisler.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Tedarikçi Sayısı</div><div class="kpi-val blue">${gruplar.size}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam Tutar</div><div class="kpi-val purple">${App.fmtTL(acikSiparisler.reduce((a, s) => a + (s.toplamTRY || 0), 0))}</div></div>
      </div>

      <div id="ass-gruplar"></div>
    `;

    const wrap = document.getElementById('ass-gruplar');
    if (!gruplar.size) {
      wrap.innerHTML = `<div class="card"><div class="empty-state" style="padding:28px 10px"><div class="eicon">▤</div><div class="etitle">Açık satınalma siparişi yok</div><div class="edesc">Satınalma Paneli'nden "Fiyat Gir & Sipariş Aç" ile sipariş oluşturduğunuzda, yönetim onayına gidene kadar burada görünür.</div></div></div>`;
      return;
    }

    wrap.innerHTML = [...gruplar.entries()].map(([tedarikciId, grup]) => renderTedarikciGrubu(tedarikciId, grup)).join('');
    [...gruplar.entries()].forEach(([tedarikciId, grup]) => wireTedarikciGrubu(tedarikciId, grup, satinalmaSiparisleri, render, main));
  }

  function renderTedarikciGrubu(tedarikciId, grup) {
    const grupToplam = grup.siparisler.reduce((a, s) => a + (s.toplamTRY || 0), 0);
    return `
      <div class="card" data-tedarikci-id="${tedarikciId}">
        <div class="card-hdr">
          <div class="card-title">${App.escapeHtml(grup.tedarikciAdi)} <span class="pill pill-blue" style="margin-left:8px">${grup.siparisler.length} sipariş · ${App.fmtTL(grupToplam)}</span></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm ass-cikti-excel" data-tedarikci-id="${tedarikciId}">⬇ Excel</button>
            <button class="btn btn-sm ass-cikti-pdf" data-tedarikci-id="${tedarikciId}">⬇ PDF</button>
            <button class="btn btn-sm ass-yazdir" data-tedarikci-id="${tedarikciId}">🖨 Yazdır</button>
          </div>
        </div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Sipariş Kodu</th><th>Malzeme</th><th class="r">Miktar</th><th>Birim</th><th class="r">Birim Fiyat</th><th>Dvz</th><th class="r">Toplam (TL)</th><th>Termin</th></tr>
          ${grup.siparisler.map(s => `
            <tr data-siparis-id="${s.id}">
              <td class="mono">${s.kod}</td>
              <td><input class="finput ass-kalemadi" data-id="${s.id}" value="${App.escapeHtml(s.kalemAdi)}" style="font-size:11px;padding:4px 6px;min-width:160px"></td>
              <td class="r"><input class="finput ass-miktar" data-id="${s.id}" type="number" step="0.01" value="${s.miktar}" style="width:70px;text-align:right;font-size:11px;padding:4px 6px"></td>
              <td class="mono" style="font-size:10.5px">${App.escapeHtml(s.birim || '')}</td>
              <td class="r"><input class="finput ass-fiyat" data-id="${s.id}" type="number" step="0.0001" value="${s.birimFiyat}" style="width:80px;text-align:right;font-size:11px;padding:4px 6px"></td>
              <td>
                <select class="fselect ass-dvz" data-id="${s.id}" style="font-size:10.5px;padding:4px 4px">
                  <option value="TL" ${s.dvz === 'TL' ? 'selected' : ''}>TL</option>
                  <option value="USD" ${s.dvz === 'USD' ? 'selected' : ''}>USD</option>
                  <option value="EUR" ${s.dvz === 'EUR' ? 'selected' : ''}>EUR</option>
                </select>
              </td>
              <td class="r mono ass-toplam-cell" data-id="${s.id}"><b>${App.fmtTL(s.toplamTRY)}</b></td>
              <td style="font-size:10.5px">${s.tahminiGirisTarihi || '—'}</td>
            </tr>
          `).join('')}
        </table>
      </div>`;
  }

  function wireTedarikciGrubu(tedarikciId, grup, tumSiparisler, render, main) {
    const cardEl = document.querySelector(`[data-tedarikci-id="${tedarikciId}"]`);
    if (!cardEl) return;

    async function guncelle(siparisId, alan, deger) {
      const s = tumSiparisler.find(x => x.id === siparisId);
      if (!s) return;
      s[alan] = deger;
      s.toplamTRY = App.toTRY(s.birimFiyat * s.miktar, s.dvz, App.state.ayarlar);
      await App.persist(() => Store.satinalmaSiparisleri.upsert(s));
      const cell = cardEl.querySelector(`.ass-toplam-cell[data-id="${siparisId}"]`);
      if (cell) cell.innerHTML = `<b>${App.fmtTL(s.toplamTRY)}</b>`;
    }

    cardEl.querySelectorAll('.ass-kalemadi').forEach(inp => inp.onchange = () => guncelle(inp.dataset.id, 'kalemAdi', inp.value.trim()));
    cardEl.querySelectorAll('.ass-miktar').forEach(inp => inp.onchange = () => guncelle(inp.dataset.id, 'miktar', parseFloat(inp.value) || 0));
    cardEl.querySelectorAll('.ass-fiyat').forEach(inp => inp.onchange = () => guncelle(inp.dataset.id, 'birimFiyat', parseFloat(inp.value) || 0));
    cardEl.querySelectorAll('.ass-dvz').forEach(sel => sel.onchange = () => guncelle(sel.dataset.id, 'dvz', sel.value));

    cardEl.querySelector('.ass-cikti-excel').onclick = () => downloadGrupExcel(grup);
    cardEl.querySelector('.ass-cikti-pdf').onclick = () => downloadGrupPdf(grup, false);
    cardEl.querySelector('.ass-yazdir').onclick = () => downloadGrupPdf(grup, true);
  }

  function downloadGrupExcel(grup) {
    const wsData = [
      ['AÇIK SATINALMA SİPARİŞLERİ — ' + grup.tedarikciAdi],
      [],
      ['Sipariş Kodu', 'Malzeme', 'Miktar', 'Birim', 'Birim Fiyat', 'Para Birimi', 'Toplam (TL)', 'Termin (Gün)', 'Tahmini Giriş', 'Not']
    ];
    grup.siparisler.forEach(s => {
      wsData.push([s.kod, s.kalemAdi, s.miktar, s.birim, s.birimFiyat, s.dvz, s.toplamTRY, s.terminGun, s.tahminiGirisTarihi, s.not || '']);
    });
    const grupToplam = grup.siparisler.reduce((a, s) => a + (s.toplamTRY || 0), 0);
    wsData.push([], ['', '', '', '', '', '', 'GENEL TOPLAM:', grupToplam]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Acik Siparisler');
    const dosyaAdi = grup.tedarikciAdi.replace(/[^a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ -]/g, '_') + '_acik_siparisler.xlsx';
    XLSX.writeFile(wb, dosyaAdi);
    App.toast('Excel dosyası indirildi: ' + grup.tedarikciAdi, 'ok');
  }

  function downloadGrupPdf(grup, printMode) {
    const win = window.open('', '_blank');
    if (!win) { App.toast('Açılır pencere engellenmiş olabilir, lütfen izin verin', 'err'); return; }
    const grupToplam = grup.siparisler.reduce((a, s) => a + (s.toplamTRY || 0), 0);
    win.document.write(`
      <html><head><title>${App.escapeHtml(grup.tedarikciAdi)} - Açık Siparişler</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 36px; color: #1a1a1a; }
        h1 { font-size: 19px; border-bottom: 2px solid #1457a0; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 11.5px; }
        th { background: #f0f0f0; }
        .meta { margin: 14px 0; font-size: 12.5px; }
        .total { font-weight: bold; font-size: 14px; margin-top: 12px; text-align: right; }
        .r { text-align: right; }
      </style></head>
      <body>
        <h1>AÇIK SATINALMA SİPARİŞLERİ — ${App.escapeHtml(grup.tedarikciAdi)}</h1>
        <div class="meta">Toplam ${grup.siparisler.length} sipariş kalemi · Hazırlanma Tarihi: ${new Date().toISOString().slice(0, 10)}</div>
        <table>
          <tr><th>Sipariş Kodu</th><th>Malzeme</th><th class="r">Miktar</th><th>Birim</th><th class="r">Birim Fiyat</th><th>Dvz</th><th class="r">Toplam (TL)</th><th>Termin</th></tr>
          ${grup.siparisler.map(s => `<tr>
            <td>${App.escapeHtml(s.kod)}</td><td>${App.escapeHtml(s.kalemAdi)}</td>
            <td class="r">${s.miktar}</td><td>${App.escapeHtml(s.birim || '')}</td>
            <td class="r">${s.birimFiyat}</td><td>${s.dvz}</td>
            <td class="r">${App.fmtTL(s.toplamTRY)}</td><td>${s.tahminiGirisTarihi || '—'}</td>
          </tr>`).join('')}
        </table>
        <div class="total">GENEL TOPLAM: ${App.fmtTL(grupToplam)}</div>
        <script>window.onload = () => { window.print(); };</script>
      </body></html>
    `);
    win.document.close();
  }

  return { render };
})();
