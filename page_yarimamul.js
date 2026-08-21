// ════════════════════════════════════════════════════════════════════════════
// YARI MAMÜLLER — yarı mamül kartı, dwg/step/pdf görsel yükleme, hammadde ataması
// ════════════════════════════════════════════════════════════════════════════
PageModules.yarimamul = (() => {
  let searchTxt = '';

  async function render(main) {
    const [list, hammaddeler, rotalar] = await Promise.all([Store.yarimamuller.all(), Store.hammaddeler.all(), Store.rotalar.all()]);
    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Yarı Mamüller</div>
          <div class="page-sub">Üretimde oluşturulan yarı mamülleri tanımlayın; ölçü, hammadde, rota ve teknik resim/görsel bilgilerini yönetin</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="ym-new">+ Yarı Mamül Oluştur</button></div>
      </div>

      <div class="card" style="padding:12px 16px">
        <input class="finput" id="ym-search" placeholder="Kod veya ad ara…" style="max-width:280px">
      </div>

      <div class="grid grid-3" id="ym-grid"></div>
    `;
    document.getElementById('ym-new').onclick = () => openForm(main, null, hammaddeler, rotalar, () => render(main));
    document.getElementById('ym-search').oninput = (e) => { searchTxt = e.target.value.toLowerCase(); renderGrid(list); };
    renderGrid(list);

    function renderGrid(list) {
      const grid = document.getElementById('ym-grid');
      let filtered = list;
      if (searchTxt) filtered = filtered.filter(y => (y.kod || '').toLowerCase().includes(searchTxt) || (y.ad || '').toLowerCase().includes(searchTxt));
      if (!filtered.length) {
        grid.style.display = 'block';
        grid.innerHTML = `<div class="empty-state"><div class="eicon">◫</div><div class="etitle">Yarı mamül bulunamadı</div><div class="edesc">Yeni yarı mamül oluşturarak BOM ağacınızı kurmaya başlayın.</div></div>`;
        return;
      }
      grid.style.display = 'grid';
      grid.innerHTML = filtered.map(y => {
        const hm = hammaddeler.find(h => h.id === y.hammaddeId);
        const rota = rotalar.find(r => r.id === y.rotaId);
        // Görsel sunucuya taşınmış olabilir; adres QrDosya.gorselUrl ile çözülür.
        const yg0 = (y.gorseller && y.gorseller[0]) || null;
        const yg0url = (yg0 && QrDosya.gorselMi(yg0)) ? QrDosya.gorselUrl(yg0) : '';
        const thumb = yg0url ? `<img src="${yg0url}" loading="lazy">` : '◫';
        return `<div class="card ym-card" data-id="${y.id}" style="cursor:pointer">
          <div class="flex-gap" style="margin-bottom:10px">
            <div class="thumb">${thumb}</div>
            <div style="min-width:0;flex:1">
              <div style="font-weight:800;font-size:12.5px" class="mono">${App.escapeHtml(y.kod)}</div>
              <div style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.escapeHtml(y.ad)}</div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text3);display:flex;flex-direction:column;gap:3px">
            <div>Ölçü: ${y.netBoy && y.netEn ? `${y.netBoy}×${y.netEn} mm` : '—'}${y.kalinlik ? ' · ' + y.kalinlik + 'mm' : ''}</div>
            <div>Hammadde: ${hm ? App.escapeHtml(hm.ad) : '<span class="muted">atanmadı</span>'}</div>
            <div>Rota: ${rota ? App.escapeHtml(rota.ad) : '<span class="muted">atanmadı</span>'}</div>
            <div>Dosyalar: ${(y.gorseller || []).length} adet</div>
          </div>
          <div class="flex-gap" style="margin-top:8px;gap:6px">
            <button class="btn btn-sm ym-etiket" data-id="${y.id}" style="flex:1">🔲 QR Etiketi</button>
            <button class="btn btn-sm ym-agac" data-id="${y.id}" style="flex:1" title="Bu yarı mamülün alt kalemlerini (BOM) ağaç editöründe düzenle">🌳 Ağaç</button>
          </div>
        </div>`;
      }).join('');
      grid.querySelectorAll('.ym-card').forEach(c => c.onclick = (e) => {
        if (e.target.classList.contains('ym-etiket') || e.target.classList.contains('ym-agac')) return;
        const item = list.find(x => x.id === c.dataset.id);
        openForm(main, item, hammaddeler, rotalar, () => render(main));
      });
      grid.querySelectorAll('.ym-etiket').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        const item = list.find(x => x.id === b.dataset.id);
        const rota = rotalar.find(r => r.id === item.rotaId);
        yazdirQrEtiketi(item, rota);
      });
      grid.querySelectorAll('.ym-agac').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        const item = list.find(x => x.id === b.dataset.id);
        PageModules.recete_agac.ac(main, item, 'yarimamul', () => render(main));
      });
    }
  }

  // ── BARKOD ETİKETİ ────────────────────────────────────────────────────────
  // Her yarımamül için QR KOD + rotanın istasyon aşamalarının 4 harfli
  // kısaltmalarla (ISTASYON_KISALTMA, data.js) yazıldığı bir etiket oluşturur.
  // QR, telefon kamerasıyla okunmak üzere gerçek (taranabilir) koddur.
  function yazdirQrEtiketi(ym, rota) {
    const istasyonlar = rota ? rota.steps.filter(s => s.type !== 'transport').map(s => App.istasyonKisaltmasi(s.kod)) : [];
    const win = window.open('', '_blank');
    if (!win) { App.toast('Açılır pencere engellenmiş olabilir, lütfen izin verin', 'err'); return; }
    win.document.write(`
      <html><head><title>Etiket - ${App.escapeHtml(ym.kod)}</title><meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 16px; }
        .etiket { width: 320px; border: 2px solid #1a1a1a; border-radius: 6px; padding: 12px; }
        .kod { font-size: 18px; font-weight: 800; font-family: monospace; text-align: center; margin-bottom: 4px; }
        .ad { font-size: 12px; text-align: center; color: #333; margin-bottom: 8px; }
        .qr-wrap { text-align: center; margin-bottom: 8px; }
        .qr-wrap svg { display: inline-block; }
        .rota-aslari { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 6px; }
        .istasyon-pill { background: #1457a0; color: white; font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: 4px; font-family: monospace; }
        .ok { font-size: 10px; color: #888; }
        @media print { body { padding: 0; } }
      </style></head>
      <body>
        <div class="etiket">
          <div class="kod">${App.escapeHtml(ym.kod)}</div>
          <div class="ad">${App.escapeHtml(ym.ad)}</div>
          <div class="qr-wrap">${App.qrSvg(ym.kod, 130)}</div>
          <div style="font-size:10px;text-align:center;color:#888;margin-top:-4px">Rota Aşamaları:</div>
          <div class="rota-aslari">
            ${istasyonlar.length ? istasyonlar.map((i, idx) => `<span class="istasyon-pill">${i}</span>${idx < istasyonlar.length - 1 ? '<span class="ok">&rarr;</span>' : ''}`).join('') : '<span style="font-size:10px;color:#aaa">Rota atanmamış</span>'}
          </div>
        </div>
        <script>window.onload = () => { window.print(); };</script>
      </body></html>
    `);
    win.document.close();
  }

  function openForm(main, item, hammaddeler, rotalar, onSaved) {
    const isEdit = !!item;
    const d = item || { gorseller: [] };
    let gorseller = [...(d.gorseller || [])];

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Yarı Mamül Kodu</label><input class="finput" id="f-kod" value="${App.escapeHtml(d.kod || '')}" placeholder="örn. JD.E17050.P1"></div>
        <div class="fgroup"><label class="flbl">Adı</label><input class="finput" id="f-ad" value="${App.escapeHtml(d.ad || '')}" placeholder="örn. ÜST TABLA"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Net Boy (mm)</label><input class="finput" id="f-netboy" type="number" value="${d.netBoy ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Net En (mm)</label><input class="finput" id="f-neten" type="number" value="${d.netEn ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Kalınlık (mm)</label><input class="finput" id="f-kalinlik" type="number" value="${d.kalinlik ?? ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kaba Boy (mm)</label><input class="finput" id="f-kababoy" type="number" value="${d.kabaBoy ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Kaba En (mm)</label><input class="finput" id="f-kabaen" type="number" value="${d.kabaEn ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Adet</label><input class="finput" id="f-adet" type="number" value="${d.adet ?? 1}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Renk</label><input class="finput" id="f-renk" value="${App.escapeHtml(d.renk || '')}"></div>
      </div>

      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Referans Fiyat (opsiyonel — Excel'den veya manuel)</div>
      <div class="fhint" style="margin-top:-4px;margin-bottom:10px">Bu alan, sistemin BOM'dan hesapladığı maliyetten BAĞIMSIZ bir referans/kontrol değeridir (örn. Excel'den içe aktarılan satın alma fiyatı). Maliyet & Liste Fiyatı sayfası önce BOM hesabını kullanır, BOM hesaplanamıyorsa bu referans fiyata düşer.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Referans Fiyat</label><input class="finput" id="f-reffiyat" type="number" step="0.0001" value="${d.referansFiyat ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Para Birimi</label>
          <select class="fselect" id="f-refdvz">
            <option value="TL" ${(d.referansDvz || 'TL') === 'TL' ? 'selected' : ''}>₺ TL</option>
            <option value="USD" ${d.referansDvz === 'USD' ? 'selected' : ''}>$ USD</option>
            <option value="EUR" ${d.referansDvz === 'EUR' ? 'selected' : ''}>€ EUR</option>
          </select>
        </div>
      </div>

      <div class="hr"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Atanan Hammadde (Plaka/Hırdavat)</label>
          <select class="fselect" id="f-hammadde">
            <option value="">— Seçilmedi —</option>
            ${hammaddeler.map(h => `<option value="${h.id}" ${d.hammaddeId === h.id ? 'selected' : ''}>${h.tip === 'plaka' ? '▭' : '⚙'} ${App.escapeHtml(h.ad)}</option>`).join('')}
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Üretim Rotası</label>
          <div class="flex-gap" style="gap:6px">
            <select class="fselect" id="f-rota" style="flex:1">
              <option value="">— Seçilmedi —</option>
              ${rotalar.map(r => `<option value="${r.id}" ${d.rotaId === r.id ? 'selected' : ''}>${App.escapeHtml(r.ad)}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-sm" id="f-yeni-rota">+ Yeni Rota</button>
          </div>
        </div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama / Not</label><textarea class="ftextarea" id="f-aciklama">${App.escapeHtml(d.aciklama || '')}</textarea></div>

      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Amortisman ve GYG (Maliyete Eklenir)</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Amortisman Gideri (₺, sabit rakam)</label><input class="finput" id="f-amortisman" type="number" step="0.01" value="${d.amortismanGideri || 0}"></div>
        <div class="fgroup"><label class="flbl">GYG Oranı (%, manuel — kalem+rota maliyetine uygulanır)</label><input class="finput" id="f-gyg" type="number" step="0.1" value="${d.gygOraniYuzde || 0}"></div>
      </div>

      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Teknik Dosyalar (STEP / DWG / DXF / PDF / Excel / Resim)</div>
      <input type="file" id="f-file" accept=".step,.stp,.dwg,.dxf,.pdf,.xls,.xlsx,.csv,image/*" multiple style="font-size:12px;margin-bottom:10px">
      <div class="fhint" style="margin-top:-6px;margin-bottom:10px">Kaydettiğinizde dosyalar <b>QR dosya alanına</b> da aktarılır: QR okutulunca veya iş kartındaki <b>📁 Dosyalar</b> tuşuyla telefondan görüntülenip indirilebilir.</div>
      <div id="f-gorsel-list" style="display:flex;flex-wrap:wrap;gap:10px"></div>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = `
      ${isEdit ? '<button class="btn btn-red" id="f-del" style="margin-right:auto">Sil</button>' : ''}
      ${isEdit ? '<button class="btn" id="f-agac">🌳 Ağaç Görünümünde Düzenle</button>' : ''}
      <button class="btn" id="f-cancel">Vazgeç</button>
      <button class="btn btn-blue" id="f-save">${isEdit ? 'Güncelle' : 'Kaydet'}</button>
    `;
    App.openModal({ title: isEdit ? 'Yarı Mamül Düzenle' : 'Yeni Yarı Mamül Oluştur', sub: isEdit ? d.kod : 'Ölçü, hammadde, rota ve teknik resim bilgilerini girin', body, footer, wide: true });
    // Bu yarı mamülün alt kalemlerini (BOM/reçete) düzenlemek — "Atanan
    // Hammadde" alanı yalnızca TEK bir hammaddeye bağlanan basit bir
    // referanstır; birden çok hammadde/yarı mamülden oluşan gerçek ürün
    // ağacı (reçete) buradan, page_recete_agac.js üzerinden yönetilir.
    if (isEdit) document.getElementById('f-agac').onclick = () => {
      App.closeModal();
      PageModules.recete_agac.ac(main, d, 'yarimamul', () => render(main));
    };

    function renderGorselList() {
      const wrap = document.getElementById('f-gorsel-list');
      if (!gorseller.length) { wrap.innerHTML = `<div class="muted" style="font-size:11px">Henüz dosya yüklenmedi.</div>`; return; }
      wrap.innerHTML = gorseller.map((g, i) => `
        <div style="position:relative">
          <div class="thumb" style="width:64px;height:64px">${QrDosya.gorselMi(g) ? `<img src="${QrDosya.gorselUrl(g)}" loading="lazy">` : '📄'}</div>
          <div style="font-size:9px;color:var(--text3);max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">${App.escapeHtml(g.name)}</div>
          <button class="modal-x" data-i="${i}" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;font-size:10px;background:var(--red-bg);color:var(--red-text)">✕</button>
        </div>`).join('');
      wrap.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { gorseller.splice(parseInt(b.dataset.i), 1); renderGorselList(); });
    }
    renderGorselList();

    document.getElementById('f-file').onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        try {
          const dataUrl = await App.fileToDataUrl(f);
          gorseller.push({ name: f.name, dataUrl, uploadedAt: new Date().toISOString() });
        } catch (err) { App.toast('Dosya yüklenemedi: ' + f.name, 'err'); }
      }
      renderGorselList();
      e.target.value = '';
    };

    if (isEdit) document.getElementById('f-del').onclick = () => {
      App.confirmDialog(`"${d.ad}" yarı mamülünü silmek istediğinize emin misiniz?`, async () => {
        await App.persist(() => Store.yarimamuller.remove(d.id));
        App.toast('Yarı mamül silindi', 'ok');
        onSaved();
      });
    };
    document.getElementById('f-cancel').onclick = App.closeModal;
    document.getElementById('f-yeni-rota').onclick = () => {
      const guncelD = {
        ...d,
        kod: document.getElementById('f-kod').value, ad: document.getElementById('f-ad').value,
        netBoy: document.getElementById('f-netboy').value, netEn: document.getElementById('f-neten').value,
        kalinlik: document.getElementById('f-kalinlik').value,
        kabaBoy: document.getElementById('f-kababoy').value, kabaEn: document.getElementById('f-kabaen').value,
        adet: document.getElementById('f-adet').value, renk: document.getElementById('f-renk').value,
        referansFiyat: document.getElementById('f-reffiyat').value, referansDvz: document.getElementById('f-refdvz').value,
        hammaddeId: document.getElementById('f-hammadde').value,
        amortismanGideri: document.getElementById('f-amortisman').value, gygOraniYuzde: document.getElementById('f-gyg').value,
        aciklama: document.getElementById('f-aciklama').value
      };
      App.closeModal();
      PageModules.rota.openRotaEditorModal(null, async (yeniRota) => {
        if (yeniRota) guncelD.rotaId = yeniRota.id;
        const guncelRotalar = await Store.rotalar.all();
        openForm(guncelD, hammaddeler, guncelRotalar, onSaved);
      });
    };
    document.getElementById('f-save').onclick = async () => {
      const kod = document.getElementById('f-kod').value.trim();
      const ad = document.getElementById('f-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      const next = {
        id: d.id || App.uid('YM'),
        kod, ad,
        netBoy: parseFloat(document.getElementById('f-netboy').value) || null,
        netEn: parseFloat(document.getElementById('f-neten').value) || null,
        kalinlik: parseFloat(document.getElementById('f-kalinlik').value) || null,
        kabaBoy: parseFloat(document.getElementById('f-kababoy').value) || null,
        kabaEn: parseFloat(document.getElementById('f-kabaen').value) || null,
        adet: parseFloat(document.getElementById('f-adet').value) || 1,
        renk: document.getElementById('f-renk').value.trim(),
        referansFiyat: parseFloat(document.getElementById('f-reffiyat').value) || null,
        referansDvz: document.getElementById('f-refdvz').value,
        hammaddeId: document.getElementById('f-hammadde').value || null,
        rotaId: document.getElementById('f-rota').value || null,
        amortismanGideri: parseFloat(document.getElementById('f-amortisman').value) || 0,
        gygOraniYuzde: parseFloat(document.getElementById('f-gyg').value) || 0,
        aciklama: document.getElementById('f-aciklama').value.trim(),
        gorseller
      };
      await App.persist(() => Store.yarimamuller.upsert(next));
      // ── QR DOSYA ALANINA AKTAR ────────────────────────────────────────
      // Formdan yüklenen dosyalar kartın içine gömülür; QR/telefon sayfasında
      // görünmeleri için sunucudaki dosya alanına da yüklenir. Aktarım
      // sonrası kayda 'sunucuId' işlendiği için karta tekrar yazıyoruz.
      try {
        const aktarilan = await QrDosya.kartDosyalariniSunucuyaAktar('yarimamul', next.id, next.kod, next.ad, gorseller);
        if (aktarilan) {
          await App.persist(() => Store.yarimamuller.upsert(next));
          App.toast(aktarilan + ' dosya QR alanına aktarıldı — telefondan görüntülenebilir', 'ok');
        }
      } catch (e) { console.error('QR dosya aktarımı:', e); }
      App.toast(isEdit ? 'Yarı mamül güncellendi' : 'Yarı mamül oluşturuldu', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render, openForm };
})();
