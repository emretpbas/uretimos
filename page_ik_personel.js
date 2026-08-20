// ════════════════════════════════════════════════════════════════════════════
// İK — PERSONEL & ÖZLÜK — bölüm bazlı personel sayısı, özlük dosyası (TC, iletişim,
// adres), görev tanımı/sorumlulukları, vekalet (izinli olduğunda kim bakar),
// brüt maaş bilgisi.
// ════════════════════════════════════════════════════════════════════════════
PageModules.ik_personel = (() => {
  let detayId = null;
  let filtreBolum = '';

  async function render(main) {
    const personeller = await Store.personeller.all();

    if (detayId) {
      const p = personeller.find(x => x.id === detayId);
      if (p) { renderDetay(main, p, personeller); return; }
      detayId = null;
    }

    const bolumler = App.BOLUMLER;
    const bolumeGoreSayim = {};
    bolumler.forEach(b => bolumeGoreSayim[b.id] = personeller.filter(p => p.bolum === b.id && p.durum === 'aktif').length);
    const aktifToplam = personeller.filter(p => p.durum === 'aktif').length;

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Personel & Özlük</div><div class="page-sub">Bölüm bazlı personel sayısı, özlük dosyaları, görev tanımları ve vekalet ataması</div></div>
        <div class="page-acts"><button class="btn btn-blue" id="ikp-new">+ Yeni Personel</button></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Bölüm Bazlı Personel Sayısı (Toplam Aktif: ${aktifToplam})</div></div>
        <div class="grid grid-4">
          ${bolumler.map(b => `<div class="kpi"><div class="kpi-lbl">${App.escapeHtml(b.label)}</div><div class="kpi-val blue">${bolumeGoreSayim[b.id] || 0}</div></div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Personel Listesi</div>
          <select class="fselect" id="ikp-bolum-filtre" style="width:auto">
            <option value="">Tüm Bölümler</option>
            ${bolumler.map(b => `<option value="${b.id}" ${filtreBolum === b.id ? 'selected' : ''}>${App.escapeHtml(b.label)}</option>`).join('')}
          </select>
        </div>
        <div id="ikp-list"></div>
      </div>
    `;
    document.getElementById('ikp-new').onclick = () => openPersonelForm(null, personeller, () => render(main));
    document.getElementById('ikp-bolum-filtre').onchange = (e) => { filtreBolum = e.target.value; renderListe(); };

    renderListe();

    function renderListe() {
      const wrap = document.getElementById('ikp-list');
      const filtreli = personeller.filter(p => !filtreBolum || p.bolum === filtreBolum);
      if (!filtreli.length) { wrap.innerHTML = `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Personel bulunamadı.</div></div>`; return; }
      let html = `<table class="dtable"><tr><th>Ad Soyad</th><th>Bölüm</th><th>Görev</th><th class="r">Brüt Maaş</th><th>Durum</th><th></th></tr>`;
      filtreli.forEach(p => {
        const bolum = bolumler.find(b => b.id === p.bolum);
        html += `<tr><td><b>${App.escapeHtml(p.adSoyad)}</b></td>
          <td><span class="pill pill-gray">${bolum ? App.escapeHtml(bolum.label) : App.escapeHtml(p.bolum || '—')}</span></td>
          <td style="font-size:11.5px">${App.escapeHtml(p.gorevUnvani || '—')}</td>
          <td class="r">${App.fmtTL(p.brutMaas || 0)}</td>
          <td>${p.durum === 'aktif' ? '<span class="pill pill-green">Aktif</span>' : '<span class="pill pill-red">Ayrıldı</span>'}</td>
          <td><button class="btn btn-sm btn-ghost ikp-detay" data-id="${p.id}">Özlük Dosyası</button></td></tr>`;
      });
      html += `</table>`;
      wrap.innerHTML = html;
      wrap.querySelectorAll('.ikp-detay').forEach(b => b.onclick = () => { detayId = b.dataset.id; render(main); });
    }
  }

  function renderDetay(main, p, tumPersonel) {
    const bolum = App.BOLUMLER.find(b => b.id === p.bolum);
    const vekalet = tumPersonel.find(x => x.id === p.vekaletPersonelId);
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${App.escapeHtml(p.adSoyad)}</div><div class="page-sub">${App.escapeHtml(p.gorevUnvani || '')} — ${bolum ? App.escapeHtml(bolum.label) : ''}</div></div>
        <div class="page-acts">
          <button class="btn" id="ikp-back">&larr; Listeye Dön</button>
          <button class="btn" id="ikp-edit">Düzenle</button>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Brüt Maaş</div><div class="kpi-val blue">${App.fmtTL(p.brutMaas || 0)}</div></div>
        <div class="kpi"><div class="kpi-lbl">İşe Giriş Tarihi</div><div class="kpi-val purple">${p.iseGirisTarihi || '—'}</div></div>
        <div class="kpi"><div class="kpi-lbl">Durum</div><div style="margin-top:4px">${p.durum === 'aktif' ? '<span class="pill pill-green">Aktif</span>' : '<span class="pill pill-red">Ayrıldı</span>'}</div></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Özlük Bilgileri</div></div>
        <div style="font-size:12.5px;display:flex;flex-direction:column;gap:4px">
          <div>TC Kimlik No: <b class="mono">${App.escapeHtml(p.tcKimlik || '—')}</b></div>
          <div>Telefon: <b>${App.escapeHtml(p.telefon || '—')}</b></div>
          <div>E-posta: <b>${App.escapeHtml(p.email || '—')}</b></div>
          <div>Adres: <b>${App.escapeHtml(p.adres || '—')}</b></div>
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Görev Tanımı & Sorumlulukları</div></div>
        <div style="font-size:12.5px;line-height:1.6">${App.escapeHtml(p.gorevTanimi || 'Görev tanımı girilmemiş.')}</div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">İzinli Olduğunda Vekalet Eden</div></div>
        <div style="font-size:12.5px">${vekalet ? `<b>${App.escapeHtml(vekalet.adSoyad)}</b> — ${App.escapeHtml(vekalet.gorevUnvani || '')}` : '<span class="muted">Vekalet ataması yapılmamış.</span>'}</div>
      </div>
    `;
    document.getElementById('ikp-back').onclick = () => { detayId = null; render(main); };
    document.getElementById('ikp-edit').onclick = () => openPersonelForm(p, tumPersonel, () => render(main));
  }

  function openPersonelForm(personel, tumPersonel, onSaved) {
    const d = personel || {};
    const bolumler = App.BOLUMLER;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Ad Soyad</label><input class="finput" id="pf-adsoyad" value="${App.escapeHtml(d.adSoyad || '')}"></div>
        <div class="fgroup"><label class="flbl">TC Kimlik No</label><input class="finput" id="pf-tc" value="${App.escapeHtml(d.tcKimlik || '')}" maxlength="11"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Bölüm</label>
          <select class="fselect" id="pf-bolum">
            ${bolumler.map(b => `<option value="${b.id}" ${d.bolum === b.id ? 'selected' : ''}>${App.escapeHtml(b.label)}</option>`).join('')}
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Görev Unvanı</label><input class="finput" id="pf-gorev" value="${App.escapeHtml(d.gorevUnvani || '')}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">İşe Giriş Tarihi</label><input class="finput" id="pf-isegiris" type="date" value="${d.iseGirisTarihi || ''}"></div>
        <div class="fgroup"><label class="flbl">Brüt Maaş (₺)</label><input class="finput" id="pf-brutmaas" type="number" value="${d.brutMaas || ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Telefon</label><input class="finput" id="pf-tel" value="${App.escapeHtml(d.telefon || '')}"></div>
        <div class="fgroup"><label class="flbl">E-posta</label><input class="finput" id="pf-email" value="${App.escapeHtml(d.email || '')}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Adres</label><textarea class="ftextarea" id="pf-adres">${App.escapeHtml(d.adres || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">Görev Tanımı & Sorumlulukları</label><textarea class="ftextarea" id="pf-gorevtanimi">${App.escapeHtml(d.gorevTanimi || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">İzinli Olduğunda Vekalet Eden</label>
        <select class="fselect" id="pf-vekalet">
          <option value="">— Atanmadı —</option>
          ${tumPersonel.filter(p => p.id !== d.id).map(p => `<option value="${p.id}" ${d.vekaletPersonelId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
        </select>
      </div>
      <div class="fcheck"><input type="checkbox" id="pf-aktif" ${(d.durum || 'aktif') === 'aktif' ? 'checked' : ''}><label for="pf-aktif">Aktif çalışıyor (işaretsizse "Ayrıldı" olarak işaretlenir)</label></div>
    `;
    const footer = `<button class="btn" id="pf-cancel">Vazgeç</button><button class="btn btn-blue" id="pf-save">Kaydet</button>`;
    App.openModal({ title: personel ? 'Personeli Düzenle' : 'Yeni Personel', body, footer, wide: true });
    document.getElementById('pf-cancel').onclick = App.closeModal;
    document.getElementById('pf-save').onclick = async () => {
      const adSoyad = document.getElementById('pf-adsoyad').value.trim();
      if (!adSoyad) { App.toast('Ad Soyad zorunlu', 'err'); return; }
      const p = {
        id: d.id || App.uid('PRS'),
        adSoyad, tcKimlik: document.getElementById('pf-tc').value.trim(),
        bolum: document.getElementById('pf-bolum').value,
        gorevUnvani: document.getElementById('pf-gorev').value.trim(),
        iseGirisTarihi: document.getElementById('pf-isegiris').value,
        brutMaas: parseFloat(document.getElementById('pf-brutmaas').value) || 0,
        telefon: document.getElementById('pf-tel').value.trim(),
        email: document.getElementById('pf-email').value.trim(),
        adres: document.getElementById('pf-adres').value.trim(),
        gorevTanimi: document.getElementById('pf-gorevtanimi').value.trim(),
        vekaletPersonelId: document.getElementById('pf-vekalet').value || null,
        durum: document.getElementById('pf-aktif').checked ? 'aktif' : 'ayrildi'
      };
      await App.persist(() => Store.personeller.upsert(p));
      App.toast('Personel kaydedildi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();
