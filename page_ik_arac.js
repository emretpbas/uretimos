// ════════════════════════════════════════════════════════════════════════════
// İK — ARAÇ & ZİMMET — şirket araçlarının kime zimmetlendiği, araç giderleri,
// tüm personel giderleri (maaş dışı: yemek, seyahat, konaklama, prim vb.)
// ════════════════════════════════════════════════════════════════════════════
PageModules.ik_arac = (() => {
  let activeTab = 'araclar';

  async function render(main) {
    const [araclar, personeller, aracGiderleri, personelGiderleri] = await Promise.all([
      Store.araclar.all(), Store.personeller.all(), Store.aracGiderleri.all(), Store.personelGiderleri.all()
    ]);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Araç & Zimmet</div><div class="page-sub">Şirket araçları, zimmet, araç ve personel giderleri (maaş dışı)</div></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'araclar' ? 'active' : ''}" data-tab="araclar">Araçlar & Zimmet</div>
        <div class="tab ${activeTab === 'aracgider' ? 'active' : ''}" data-tab="aracgider">Araç Giderleri</div>
        <div class="tab ${activeTab === 'persongider' ? 'active' : ''}" data-tab="persongider">Personel Giderleri</div>
      </div>
      <div id="ika-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('ika-tab-content');
    if (activeTab === 'araclar') { content.innerHTML = renderAraclarTab(araclar, personeller); wireAraclarTab(araclar, personeller, render, main); }
    else if (activeTab === 'aracgider') { content.innerHTML = renderAracGiderTab(araclar, aracGiderleri); wireAracGiderTab(araclar, render, main); }
    else { content.innerHTML = renderPersonelGiderTab(personeller, personelGiderleri); wirePersonelGiderTab(personeller, render, main); }
  }

  function renderAraclarTab(araclar, personeller) {
    let html = `<div class="page-acts" style="margin-bottom:14px;text-align:right"><button class="btn btn-blue" id="ika-new-arac">+ Yeni Araç</button></div>`;
    html += `<div class="card"><table class="dtable">
      <tr><th>Plaka</th><th>Marka/Model</th><th>Tip</th><th>Zimmetli Personel</th><th>Durum</th><th></th></tr>`;
    araclar.forEach(a => {
      const p = personeller.find(x => x.id === a.zimmetliPersonelId);
      html += `<tr><td class="mono"><b>${App.escapeHtml(a.plaka)}</b></td>
        <td>${App.escapeHtml(a.marka)} ${App.escapeHtml(a.model || '')}</td>
        <td><span class="pill pill-gray">${App.escapeHtml(a.tip || '—')}</span></td>
        <td>${p ? App.escapeHtml(p.adSoyad) : '<span class="muted">Zimmetli değil</span>'}</td>
        <td>${a.durum === 'aktif' ? '<span class="pill pill-green">Aktif</span>' : '<span class="pill pill-red">Pasif</span>'}</td>
        <td><button class="btn btn-sm btn-ghost ika-arac-duzenle" data-id="${a.id}">Düzenle</button></td></tr>`;
    });
    html += `</table></div>`;
    return html;
  }

  function wireAraclarTab(araclar, personeller, render, main) {
    document.getElementById('ika-new-arac').onclick = () => openAracForm(null, personeller, () => render(main));
    document.querySelectorAll('.ika-arac-duzenle').forEach(b => b.onclick = () => {
      const a = araclar.find(x => x.id === b.dataset.id);
      openAracForm(a, personeller, () => render(main));
    });
  }

  function openAracForm(arac, personeller, onSaved) {
    const d = arac || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Plaka</label><input class="finput" id="arf-plaka" value="${App.escapeHtml(d.plaka || '')}"></div>
        <div class="fgroup"><label class="flbl">Tip</label><input class="finput" id="arf-tip" value="${App.escapeHtml(d.tip || '')}" placeholder="örn. Binek, Servis Aracı, Kamyonet"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Marka</label><input class="finput" id="arf-marka" value="${App.escapeHtml(d.marka || '')}"></div>
        <div class="fgroup"><label class="flbl">Model (Yıl)</label><input class="finput" id="arf-model" value="${App.escapeHtml(d.model || '')}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Zimmetli Personel</label>
        <select class="fselect" id="arf-zimmet">
          <option value="">— Zimmetli değil —</option>
          ${personeller.map(p => `<option value="${p.id}" ${d.zimmetliPersonelId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
        </select>
      </div>
      <div class="fcheck"><input type="checkbox" id="arf-aktif" ${(d.durum || 'aktif') === 'aktif' ? 'checked' : ''}><label for="arf-aktif">Aktif kullanımda</label></div>
    `;
    const footer = `<button class="btn" id="arf-cancel">Vazgeç</button><button class="btn btn-blue" id="arf-save">Kaydet</button>`;
    App.openModal({ title: arac ? 'Aracı Düzenle' : 'Yeni Araç', body, footer, wide: true });
    document.getElementById('arf-cancel').onclick = App.closeModal;
    document.getElementById('arf-save').onclick = async () => {
      const plaka = document.getElementById('arf-plaka').value.trim();
      if (!plaka) { App.toast('Plaka zorunlu', 'err'); return; }
      const a = {
        id: d.id || App.uid('ARC'), plaka,
        marka: document.getElementById('arf-marka').value.trim(),
        model: document.getElementById('arf-model').value.trim(),
        tip: document.getElementById('arf-tip').value.trim(),
        zimmetliPersonelId: document.getElementById('arf-zimmet').value || null,
        durum: document.getElementById('arf-aktif').checked ? 'aktif' : 'pasif'
      };
      await App.persist(() => Store.araclar.upsert(a));
      App.toast('Araç kaydedildi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function renderAracGiderTab(araclar, aracGiderleri) {
    const toplam = aracGiderleri.reduce((a, g) => a + g.tutar, 0);
    let html = `<div class="grid grid-2" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Araç Gideri</div><div class="kpi-val amber">${App.fmtTL(toplam)}</div></div>
      <div class="kpi" style="display:flex;align-items:center;justify-content:flex-end"><button class="btn btn-blue" id="ika-new-aracgider">+ Gider Ekle</button></div>
    </div>`;
    html += `<div class="card">`;
    if (!aracGiderleri.length) {
      html += `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Henüz araç gideri kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>Araç</th><th>Gider Tipi</th><th>Açıklama</th><th class="r">Tutar</th></tr>`;
      [...aracGiderleri].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(g => {
        const arac = araclar.find(a => a.id === g.aracId);
        html += `<tr><td style="font-size:11px">${g.tarih}</td><td>${arac ? App.escapeHtml(arac.plaka) : '—'}</td>
          <td><span class="pill pill-gray">${App.escapeHtml(g.tip)}</span></td>
          <td style="font-size:11.5px">${App.escapeHtml(g.aciklama || '')}</td>
          <td class="r">${App.fmtTL(g.tutar)}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireAracGiderTab(araclar, render, main) {
    document.getElementById('ika-new-aracgider').onclick = () => openAracGiderForm(araclar, () => render(main));
  }

  function openAracGiderForm(araclar, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Araç</label>
        <select class="fselect" id="agf-arac">
          ${araclar.map(a => `<option value="${a.id}">${App.escapeHtml(a.plaka)} — ${App.escapeHtml(a.marka)}</option>`).join('')}
        </select>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Tarih</label><input class="finput" id="agf-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="fgroup"><label class="flbl">Gider Tipi</label>
          <select class="fselect" id="agf-tip">
            <option value="Yakıt">Yakıt</option><option value="Bakım/Servis">Bakım/Servis</option>
            <option value="Sigorta">Sigorta</option><option value="Muayene/Vergi">Muayene/Vergi</option>
            <option value="Diğer">Diğer</option>
          </select>
        </div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><input class="finput" id="agf-aciklama"></div>
      <div class="fgroup"><label class="flbl">Tutar (₺)</label><input class="finput" id="agf-tutar" type="number"></div>
    `;
    const footer = `<button class="btn" id="agf-cancel">Vazgeç</button><button class="btn btn-blue" id="agf-save">Kaydet</button>`;
    App.openModal({ title: 'Araç Gideri Ekle', body, footer, wide: true });
    document.getElementById('agf-cancel').onclick = App.closeModal;
    document.getElementById('agf-save').onclick = async () => {
      const tutar = parseFloat(document.getElementById('agf-tutar').value);
      if (!tutar) { App.toast('Tutar zorunlu', 'err'); return; }
      const kayit = {
        id: App.uid('AGD'), aracId: document.getElementById('agf-arac').value,
        tarih: document.getElementById('agf-tarih').value, tip: document.getElementById('agf-tip').value,
        aciklama: document.getElementById('agf-aciklama').value.trim(), tutar
      };
      await App.persist(() => Store.aracGiderleri.upsert(kayit));
      await App.persist(() => App.muhasebeKaydiOlustur({
        tip: 'gider', kategori: 'arac_gideri',
        aciklama: 'Araç gideri (' + kayit.tip + '): ' + (kayit.aciklama || ''),
        tutar, matrah: tutar, kdvOrani: 0, kdvTutari: 0,
        kaynakId: kayit.id, kaynakTip: 'arac_gideri'
      }));
      App.toast('Araç gideri kaydedildi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function renderPersonelGiderTab(personeller, personelGiderleri) {
    const toplam = personelGiderleri.reduce((a, g) => a + g.tutar, 0);
    const tipeGoreToplam = {};
    personelGiderleri.forEach(g => { tipeGoreToplam[g.tip] = (tipeGoreToplam[g.tip] || 0) + g.tutar; });

    let html = `<div class="grid grid-2" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Personel Gideri (Maaş Dışı)</div><div class="kpi-val amber">${App.fmtTL(toplam)}</div></div>
      <div class="kpi" style="display:flex;align-items:center;justify-content:flex-end"><button class="btn btn-blue" id="ika-new-persongider">+ Gider Ekle</button></div>
    </div>`;

    if (Object.keys(tipeGoreToplam).length) {
      html += `<div class="card"><div class="card-hdr"><div class="card-title">Gider Tipine Göre Dağılım</div></div>
        <div class="grid grid-4">
          ${Object.entries(tipeGoreToplam).map(([tip, t]) => `<div class="kpi"><div class="kpi-lbl">${App.escapeHtml(tip)}</div><div class="kpi-val blue">${App.fmtTL(t)}</div></div>`).join('')}
        </div></div>`;
    }

    html += `<div class="card">`;
    if (!personelGiderleri.length) {
      html += `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Henüz personel gideri kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>Personel</th><th>Gider Tipi</th><th>Açıklama</th><th class="r">Tutar</th></tr>`;
      [...personelGiderleri].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(g => {
        const p = personeller.find(x => x.id === g.personelId);
        html += `<tr><td style="font-size:11px">${g.tarih}</td><td>${p ? App.escapeHtml(p.adSoyad) : '—'}</td>
          <td><span class="pill pill-gray">${App.escapeHtml(g.tip)}</span></td>
          <td style="font-size:11.5px">${App.escapeHtml(g.aciklama || '')}</td>
          <td class="r">${App.fmtTL(g.tutar)}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wirePersonelGiderTab(personeller, render, main) {
    document.getElementById('ika-new-persongider').onclick = () => openPersonelGiderForm(personeller, () => render(main));
  }

  function openPersonelGiderForm(personeller, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Personel</label>
        <select class="fselect" id="pgf-personel">
          ${personeller.map(p => `<option value="${p.id}">${App.escapeHtml(p.adSoyad)}</option>`).join('')}
        </select>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Tarih</label><input class="finput" id="pgf-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="fgroup"><label class="flbl">Gider Tipi</label>
          <select class="fselect" id="pgf-tip">
            <option value="Yemek">Yemek</option><option value="Yol">Yol</option>
            <option value="Seyahat">Seyahat</option><option value="Konaklama">Konaklama</option>
            <option value="Prim">Prim</option><option value="Diğer">Diğer</option>
          </select>
        </div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><input class="finput" id="pgf-aciklama"></div>
      <div class="fgroup"><label class="flbl">Tutar (₺)</label><input class="finput" id="pgf-tutar" type="number"></div>
    `;
    const footer = `<button class="btn" id="pgf-cancel">Vazgeç</button><button class="btn btn-blue" id="pgf-save">Kaydet</button>`;
    App.openModal({ title: 'Personel Gideri Ekle', body, footer, wide: true });
    document.getElementById('pgf-cancel').onclick = App.closeModal;
    document.getElementById('pgf-save').onclick = async () => {
      const tutar = parseFloat(document.getElementById('pgf-tutar').value);
      if (!tutar) { App.toast('Tutar zorunlu', 'err'); return; }
      const kayit = {
        id: App.uid('PGD'), personelId: document.getElementById('pgf-personel').value,
        tarih: document.getElementById('pgf-tarih').value, tip: document.getElementById('pgf-tip').value,
        aciklama: document.getElementById('pgf-aciklama').value.trim(), tutar
      };
      await App.persist(() => Store.personelGiderleri.upsert(kayit));
      await App.persist(() => App.muhasebeKaydiOlustur({
        tip: 'gider', kategori: 'personel_gideri',
        aciklama: 'Personel gideri (' + kayit.tip + '): ' + (kayit.aciklama || ''),
        tutar, matrah: tutar, kdvOrani: 0, kdvTutari: 0,
        kaynakId: kayit.id, kaynakTip: 'personel_gideri'
      }));
      App.toast('Personel gideri kaydedildi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();
