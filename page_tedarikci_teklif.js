// ════════════════════════════════════════════════════════════════════════════
// TEKLİF KARŞILAŞTIRMA — 3 tedarikçi firmadan fiyat teklifi alıp komisyon oluşturma,
// yönetim onayına sunma
// ════════════════════════════════════════════════════════════════════════════
PageModules.tedarikci_teklif = (() => {
  let detayId = null;

  async function render(main, params) {
    if (params && params.satinalmaTalepId) {
      await openNewKomisyon(params.satinalmaTalepId, main);
      return;
    }
    const komisyonlar = await Store.teklifKarsilastirma.all();
    if (detayId) {
      const k = komisyonlar.find(x => x.id === detayId);
      if (k) { renderDetay(main, k); return; }
      detayId = null;
    }
    renderList(main, komisyonlar);
  }

  function renderList(main, komisyonlar) {
    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Teklif Karşılaştırma</div>
          <div class="page-sub">3 tedarikçi firmadan alınan fiyat tekliflerini karşılaştırın, komisyon oluşturup yönetim onayına sunun</div>
        </div>
      </div>
      <div class="card" id="tt-list"></div>
    `;
    const wrap = document.getElementById('tt-list');
    if (!komisyonlar.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="eicon">⇄</div><div class="etitle">Henüz teklif karşılaştırması yok</div><div class="edesc">Satınalma Paneli'nden bir talebi "Teklif Gir" ile buraya aktarın.</div></div>`;
      return;
    }
    let html = `<table class="dtable"><tr><th>Kod</th><th>Kalem</th><th class="r">En Uygun Fiyat</th><th>Durum</th><th>Tarih</th><th></th></tr>`;
    [...komisyonlar].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(k => {
      const enUygun = enUygunTeklif(k);
      html += `<tr>
        <td class="mono">${k.kod}</td>
        <td>${App.escapeHtml(k.kalemAdi)}</td>
        <td class="r">${enUygun ? App.fmtTL(enUygun.toplamTL) : '—'}</td>
        <td>${komisyonDurumPill(k.durum)}</td>
        <td style="font-size:11px">${k.tarih}</td>
        <td><button class="btn btn-sm btn-ghost tt-detay" data-id="${k.id}">Detay</button></td>
      </tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll('.tt-detay').forEach(b => b.onclick = () => { detayId = b.dataset.id; render(main); });
  }

  function komisyonDurumPill(d) {
    const map = {
      teklif_giriliyor: ['Teklif Giriliyor', 'pill-amber'],
      onay_bekliyor: ['Yönetim Onayında', 'pill-purple'],
      onaylandi: ['Onaylandı', 'pill-green'],
      reddedildi: ['Reddedildi', 'pill-red']
    };
    const [l, c] = map[d] || ['Beklemede', 'pill-gray'];
    return `<span class="pill ${c}">${l}</span>`;
  }

  function enUygunTeklif(k) {
    const gecerli = (k.teklifler || []).filter(t => t.toplamTL > 0);
    if (!gecerli.length) return null;
    return gecerli.reduce((min, t) => t.toplamTL < min.toplamTL ? t : min, gecerli[0]);
  }

  async function openNewKomisyon(satinalmaTalepId, main) {
    const satinalmaTalepleri = await Store.satinalmaTalepleri.all();
    const sat = satinalmaTalepleri.find(s => s.id === satinalmaTalepId);
    if (!sat) { App.toast('Satınalma talebi bulunamadı', 'err'); App.goTo('tedarikci_teklif'); return; }

    const tedarikciler = await Store.tedarikciler.all();
    const komisyon = {
      id: App.uid('KOM'),
      kod: 'KOM-' + Date.now().toString(36).toUpperCase(),
      satinalmaTalepId: sat.id,
      kalemAdi: sat.kalemAdi,
      miktar: sat.miktar,
      birim: sat.birim,
      teklifler: [
        { tedarikciId: '', tedarikciAdi: '', birimFiyat: 0, dvz: 'TL', terminGun: 0, toplamTL: 0 },
        { tedarikciId: '', tedarikciAdi: '', birimFiyat: 0, dvz: 'TL', terminGun: 0, toplamTL: 0 },
        { tedarikciId: '', tedarikciAdi: '', birimFiyat: 0, dvz: 'TL', terminGun: 0, toplamTL: 0 }
      ],
      secilenIndex: null,
      not: '',
      durum: 'teklif_giriliyor',
      tarih: new Date().toISOString().slice(0, 10)
    };
    detayId = komisyon.id;
    await App.persist(() => Store.teklifKarsilastirma.upsert(komisyon));
    renderDetay(main, komisyon, tedarikciler);
  }

  async function renderDetay(main, k) {
    const [tedarikciler, ayarlar] = await Promise.all([Store.tedarikciler.all(), Promise.resolve(App.state.ayarlar)]);

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">${k.kod}</div>
          <div class="page-sub">${App.escapeHtml(k.kalemAdi)} · ${App.fmt(k.miktar, 0)} ${k.birim}</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="tt-back">&larr; Listeye Dön</button>
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">3 Tedarikçi Firma Teklifi</div></div>
        <div class="tbl-wrap"><table class="dtable">
          <tr><th>Tedarikçi</th><th class="r">Birim Fiyat</th><th>Döviz</th><th class="r">Termin (gün)</th><th class="r">Toplam (₺)</th><th></th></tr>
          ${k.teklifler.map((t, i) => `
            <tr>
              <td>
                <select class="fselect tt-ted" data-i="${i}" style="font-size:11.5px">
                  <option value="">— Tedarikçi seçin —</option>
                  ${tedarikciler.map(td => `<option value="${td.id}" ${t.tedarikciId === td.id ? 'selected' : ''}>${App.escapeHtml(td.unvan)}</option>`).join('')}
                </select>
              </td>
              <td class="r"><input class="finput tt-fiyat" data-i="${i}" type="number" step="0.01" value="${t.birimFiyat || ''}" style="width:100px;text-align:right"></td>
              <td>
                <select class="fselect tt-dvz" data-i="${i}" style="width:75px">
                  <option value="TL" ${t.dvz === 'TL' ? 'selected' : ''}>₺ TL</option>
                  <option value="USD" ${t.dvz === 'USD' ? 'selected' : ''}>$ USD</option>
                  <option value="EUR" ${t.dvz === 'EUR' ? 'selected' : ''}>€ EUR</option>
                </select>
              </td>
              <td class="r"><input class="finput tt-termin" data-i="${i}" type="number" value="${t.terminGun || ''}" style="width:70px;text-align:right"></td>
              <td class="r mono tt-toplam" data-i="${i}">${App.fmtTL(t.toplamTL || 0)}</td>
              <td>${k.secilenIndex === i ? '<span class="pill pill-green">✓ Seçildi</span>' : (k.durum === 'teklif_giriliyor' ? `<button class="btn btn-sm tt-sec" data-i="${i}">Bunu Seç</button>` : '')}</td>
            </tr>`).join('')}
        </table></div>
        <div class="fgroup" style="margin-top:14px"><label class="flbl">Komisyon Notu / Gerekçe</label>
          <textarea class="ftextarea" id="tt-not">${App.escapeHtml(k.not || '')}</textarea></div>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
          ${k.durum === 'teklif_giriliyor' ? '<button class="btn btn-blue" id="tt-save-draft">Teklifleri Kaydet</button>' : ''}
          ${k.durum === 'teklif_giriliyor' ? '<button class="btn btn-green" id="tt-submit-onay" ' + (k.secilenIndex == null ? 'disabled' : '') + '>Yönetim Onayına Gönder</button>' : ''}
        </div>
        ${k.secimGerekcesi ? `<div class="card" style="background:var(--blue-bg);border-color:var(--blue-light);margin-top:10px"><div style="font-size:11.5px;color:var(--blue-text)"><b>Seçim Gerekçesi:</b> ${App.escapeHtml(k.secimGerekcesi)}</div></div>` : ''}
        ${k.durum === 'onay_bekliyor' ? '<div class="fhint" style="margin-top:10px">Bu komisyon yönetim onayında. Onaylanmadıkça satınalma işlemi tamamlanamaz.</div>' : ''}
        ${k.durum === 'onaylandi' ? '<div class="pill pill-green" style="margin-top:10px">Yönetim tarafından onaylandı, satınalma talebi tamamlandı olarak işaretlendi.</div>' : ''}
        ${k.durum === 'reddedildi' ? '<div class="pill pill-red" style="margin-top:10px">Yönetim tarafından reddedildi: ' + App.escapeHtml(k.reddNotu || '') + '</div>' : ''}
      </div>
    `;

    document.getElementById('tt-back').onclick = () => { detayId = null; render(main); };

    function updateToplam(i) {
      const t = k.teklifler[i];
      t.toplamTL = App.toTRY(t.birimFiyat * k.miktar, t.dvz, ayarlar);
      const cell = main.querySelector(`.tt-toplam[data-i="${i}"]`);
      if (cell) cell.textContent = App.fmtTL(t.toplamTL);
    }
    k.teklifler.forEach((t, i) => updateToplam(i));

    main.querySelectorAll('.tt-ted').forEach(sel => sel.onchange = () => {
      const i = parseInt(sel.dataset.i);
      const td = tedarikciler.find(x => x.id === sel.value);
      k.teklifler[i].tedarikciId = sel.value;
      k.teklifler[i].tedarikciAdi = td ? td.unvan : '';
    });
    main.querySelectorAll('.tt-fiyat').forEach(inp => inp.onchange = () => {
      const i = parseInt(inp.dataset.i);
      k.teklifler[i].birimFiyat = parseFloat(inp.value) || 0;
      updateToplam(i);
    });
    main.querySelectorAll('.tt-dvz').forEach(sel => sel.onchange = () => {
      const i = parseInt(sel.dataset.i);
      k.teklifler[i].dvz = sel.value;
      updateToplam(i);
    });
    main.querySelectorAll('.tt-termin').forEach(inp => inp.onchange = () => {
      const i = parseInt(inp.dataset.i);
      k.teklifler[i].terminGun = parseFloat(inp.value) || 0;
    });
    main.querySelectorAll('.tt-sec').forEach(b => b.onclick = () => {
      const i = parseInt(b.dataset.i);
      const secilenTeklif = k.teklifler[i];
      if (!secilenTeklif.tedarikciAdi) { App.toast('Önce tedarikçi seçin', 'err'); return; }
      openGerekceForm(i, secilenTeklif, k, main, tedarikciler);
    });

    const saveDraftBtn = document.getElementById('tt-save-draft');
    if (saveDraftBtn) saveDraftBtn.onclick = async () => {
      k.not = document.getElementById('tt-not').value.trim();
      await App.persist(() => Store.teklifKarsilastirma.upsert(k));
      App.toast('Teklifler kaydedildi', 'ok');
    };

    const submitBtn = document.getElementById('tt-submit-onay');
    if (submitBtn) submitBtn.onclick = async () => {
      if (k.secilenIndex == null) { App.toast('Önce bir tedarikçi seçin', 'err'); return; }
      k.not = document.getElementById('tt-not').value.trim();
      k.durum = 'onay_bekliyor';
      await App.persist(() => Store.teklifKarsilastirma.upsert(k));
      App.toast('Komisyon yönetim onayına gönderildi', 'ok');
      renderDetay(main, k, tedarikciler);
    };
  }

  // Bir tedarikçi "seçildiğinde", neden o tedarikçinin tercih edildiğinin
  // (fiyat/termin/kalite/güvenilirlik vb.) gerekçesi sorulur. Bu gerekçe
  // Yönetim Onayları'nda diğer tedarikçi fiyatlarıyla birlikte gösterilir.
  function openGerekceForm(secilenIndex, secilenTeklif, k, main, tedarikciler) {
    const digerTeklifler = k.teklifler.filter((t, i) => i !== secilenIndex && t.tedarikciAdi);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Seçilen: <b>${App.escapeHtml(secilenTeklif.tedarikciAdi)}</b> — ${App.fmtTL(secilenTeklif.toplamTL)}</div>
      ${digerTeklifler.length ? `<div class="fhint" style="margin-bottom:10px">Diğer teklifler: ${digerTeklifler.map(t => App.escapeHtml(t.tedarikciAdi) + ' (' + App.fmtTL(t.toplamTL) + ')').join(', ')}</div>` : ''}
      <div class="fgroup"><label class="flbl">Bu Tedarikçinin Neden Seçildiğinin Gerekçesi</label>
        <textarea class="ftextarea" id="gf-gerekce" placeholder="örn. En uygun fiyat, daha kısa termin, geçmiş tedarik kalitesi, ödeme koşulları vb."></textarea>
      </div>
    `;
    const footer = `<button class="btn" id="gf-cancel">Vazgeç</button><button class="btn btn-green" id="gf-confirm">Tedarikçiyi Onayla</button>`;
    App.openModal({ title: 'Seçim Gerekçesi', body, footer, wide: true });
    document.getElementById('gf-cancel').onclick = App.closeModal;
    document.getElementById('gf-confirm').onclick = async () => {
      const gerekce = document.getElementById('gf-gerekce').value.trim();
      if (!gerekce) { App.toast('Gerekçe girilmesi zorunludur', 'err'); return; }
      k.secilenIndex = secilenIndex;
      k.secimGerekcesi = gerekce;
      await App.persist(() => Store.teklifKarsilastirma.upsert(k));
      App.toast('Tedarikçi seçildi: ' + secilenTeklif.tedarikciAdi, 'ok');
      App.closeModal();
      renderDetay(main, k, tedarikciler);
    };
  }

  return { render };
})();
