// ════════════════════════════════════════════════════════════════════════════
// İADE / 2. KALİTE AMBARI — Kalite reddi sonrası iade ambarına düşen ürün ve
// malzemeleri yönetir:
//   - Yönetim fiyatlandırır (2. kalite / defolu / seri sonu) ve satışa sunar
//   - Satışa sunulan kalemler 2. kalite satış listesinde görünür
//   - Fotoğraflı kusur formu PDF/Excel indirilebilir
//   - Satınalma kaynaklı (hammadde) iadeler tedarikçiye İADE FATURASI ile
//     geri iade edilir
// ════════════════════════════════════════════════════════════════════════════
PageModules.iade_ambari = (() => {
  let activeTab = 'bekleyen';

  const KALITE_ETIKET = {
    '2_kalite': ['2. Kalite', 'pill-amber'],
    'defolu': ['Defolu', 'pill-red'],
    'seri_sonu': ['Seri Sonu', 'pill-blue']
  };
  const KAYNAK_ETIKET = { hammadde_girisi: 'Hammadde (Satınalma)', uretim_urun: 'Ürün (Üretim)' };

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const iadeler = await Store.iadeKalemleri.all();
    const rol = App.state.role;
    const yonetimMi = ['yonetim', 'arge', 'admin'].includes(rol);

    const bekleyenler = iadeler.filter(i => i.durum === 'fiyat_bekliyor');
    const satistakiler = iadeler.filter(i => i.durum === 'satista');
    const hammaddeIadeleri = iadeler.filter(i => i.kaynak === 'hammadde_girisi' && !i.tedarikciyeIadeEdildi);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">İade / 2. Kalite Ambarı</div>
        <div class="page-sub">Kalite reddi sonrası iade edilen ürün ve malzemeler — fiyatlandırma, 2. kalite satış ve tedarikçiye iade</div></div>
      </div>
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="kpi"><div class="kpi-lbl">Fiyat Bekleyen</div><div class="kpi-val" style="color:var(--red-text)">${bekleyenler.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Satışta (2. Kalite)</div><div class="kpi-val blue">${satistakiler.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Tedarikçiye İade Edilecek</div><div class="kpi-val purple">${hammaddeIadeleri.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam İade Kalemi</div><div class="kpi-val">${iadeler.length}</div></div>
      </div>
      <div class="tabs" style="margin-bottom:16px">
        <div class="tab ${activeTab === 'bekleyen' ? 'active' : ''}" data-tab="bekleyen">Fiyatlandırma Bekleyenler ${bekleyenler.length ? `<span class="pill pill-red" style="margin-left:4px">${bekleyenler.length}</span>` : ''}</div>
        <div class="tab ${activeTab === 'satis' ? 'active' : ''}" data-tab="satis">2. Kalite Satış Listesi ${satistakiler.length ? `<span class="pill pill-blue" style="margin-left:4px">${satistakiler.length}</span>` : ''}</div>
        <div class="tab ${activeTab === 'tedarikci' ? 'active' : ''}" data-tab="tedarikci">Tedarikçiye İade ${hammaddeIadeleri.length ? `<span class="pill pill-amber" style="margin-left:4px">${hammaddeIadeleri.length}</span>` : ''}</div>
      </div>
      <div id="ia-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('ia-content');
    if (activeTab === 'bekleyen') { content.innerHTML = renderBekleyenTab(bekleyenler, yonetimMi); wireBekleyenTab(bekleyenler, yonetimMi, render, main); }
    else if (activeTab === 'satis') { content.innerHTML = renderSatisTab(satistakiler, yonetimMi); wireSatisTab(satistakiler, render, main); }
    else { content.innerHTML = renderTedarikciTab(hammaddeIadeleri); wireTedarikciTab(hammaddeIadeleri, render, main); }
  }

  function fotoBtn(i) {
    return (i.fotograflar && i.fotograflar.length)
      ? `<button class="btn btn-sm btn-ghost ia-foto" data-id="${i.id}">📷 ${i.fotograflar.length}</button>` : '—';
  }

  function renderBekleyenTab(list, yonetimMi) {
    if (!list.length) return `<div class="card"><div class="empty-state" style="padding:30px"><div class="eicon">✓</div><div class="etitle">Fiyat bekleyen iade yok</div></div></div>`;
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Fiyatlandırma Bekleyen İadeler</div></div>
      <div class="fhint" style="margin-bottom:8px">${yonetimMi ? 'Her kalemi 2. kalite / defolu / seri sonu olarak sınıflandırıp fiyat belirleyin ve satışa sunun.' : 'Sadece yönetim fiyatlandırma yapabilir. Kalemleri görüntüleyebilirsiniz.'}</div>
      <table class="dtable"><tr><th>NCR</th><th>Kaynak</th><th>Kod / Ad</th><th class="r">Miktar</th><th>Kusur</th><th>Foto</th><th></th></tr>`;
    list.slice().reverse().forEach(i => {
      html += `<tr>
        <td class="mono">${i.ncrNo || '—'}</td>
        <td><span class="pill pill-gray" style="font-size:10px">${KAYNAK_ETIKET[i.kaynak] || i.kaynak}</span></td>
        <td><b>${App.escapeHtml(i.ad || i.kod)}</b><div class="mono" style="font-size:10px;color:var(--text3)">${App.escapeHtml(i.kod || '')}</div></td>
        <td class="r">${App.fmt(i.miktar, 2)} ${App.escapeHtml(i.birim || '')}</td>
        <td style="font-size:11px;max-width:200px">${App.escapeHtml(i.aciklama || '—')}</td>
        <td>${fotoBtn(i)}</td>
        <td>${yonetimMi ? `<button class="btn btn-sm btn-blue ia-fiyatlandir" data-id="${i.id}">Fiyatlandır & Satışa Sun</button>` : '<span class="muted">—</span>'}</td>
      </tr>`;
    });
    html += `</table></div>`;
    return html;
  }

  function wireBekleyenTab(list, yonetimMi, render, main) {
    document.querySelectorAll('.ia-foto').forEach(b => b.onclick = () => fotoGaleri(list.find(x => x.id === b.dataset.id)));
    document.querySelectorAll('.ia-fiyatlandir').forEach(b => b.onclick = () => {
      const i = list.find(x => x.id === b.dataset.id);
      fiyatlandirModal(i, render, main);
    });
  }

  function fiyatlandirModal(i, render, main) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="background:#F1F5F9;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px">
        <b>${App.escapeHtml(i.ad || i.kod)}</b> · ${App.fmt(i.miktar, 2)} ${App.escapeHtml(i.birim || '')} · Kusur: ${App.escapeHtml(i.aciklama || '—')}
      </div>
      <div class="fgroup"><label class="flbl">Kalite Sınıfı <span style="color:var(--red-text)">*</span></label>
        <select class="fselect" id="ia-kalite">
          <option value="2_kalite">2. Kalite</option>
          <option value="defolu">Defolu</option>
          <option value="seri_sonu">Seri Sonu</option>
        </select></div>
      <div class="frow">
        <div class="fgroup" style="flex:2"><label class="flbl">Satış Fiyatı (birim) <span style="color:var(--red-text)">*</span></label>
          <input type="number" class="finput" id="ia-fiyat" step="0.01" min="0" placeholder="0,00"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Döviz</label>
          <select class="fselect" id="ia-dvz"><option>TL</option><option>USD</option><option>EUR</option></select></div>
      </div>
      <div class="fgroup"><label class="flbl">Satış Notu (opsiyonel)</label>
        <input class="finput" id="ia-not" placeholder="Örn: Sınırlı stok, görsel kusurlu ancak sağlam"></div>
    `;
    const footer = `<button class="btn" id="ia-cancel">Vazgeç</button><button class="btn btn-green" id="ia-onayla">Fiyatlandır & Satışa Sun</button>`;
    App.openModal({ title: 'İade Kalemini Fiyatlandır', body, footer, wide: true });
    document.getElementById('ia-cancel').onclick = App.closeModal;
    document.getElementById('ia-onayla').onclick = async () => {
      const fiyat = parseFloat(document.getElementById('ia-fiyat').value);
      if (!(fiyat >= 0) || isNaN(fiyat)) { App.toast('Geçerli bir satış fiyatı girin', 'err'); return; }
      i.kalite = document.getElementById('ia-kalite').value;
      i.satisFiyati = fiyat;
      i.dvz = document.getElementById('ia-dvz').value;
      i.satisNotu = document.getElementById('ia-not').value.trim();
      i.fiyatlandirildi = true;
      i.satisaSunuldu = true;
      i.durum = 'satista';
      i.fiyatlandirmaTarihi = new Date().toISOString().slice(0, 10);
      await App.persist(() => Store.iadeKalemleri.upsert(i));
      App.toast('Fiyatlandırıldı ve 2. kalite satışa sunuldu', 'ok');
      App.closeModal(); render(main);
    };
  }

  function renderSatisTab(list, yonetimMi) {
    if (!list.length) return `<div class="card"><div class="empty-state" style="padding:30px"><div class="eicon">◌</div><div class="etitle">Satışta 2. kalite ürün yok</div><div class="edesc">Fiyatlandırılıp satışa sunulan iade kalemleri burada listelenir.</div></div></div>`;
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">2. Kalite / Defolu / Seri Sonu Satış Listesi</div>
      <button class="btn btn-sm btn-ghost" id="ia-liste-excel">⤓ Listeyi Excel İndir</button></div>
      <table class="dtable"><tr><th>Kod / Ad</th><th>Sınıf</th><th class="r">Miktar</th><th class="r">Satış Fiyatı</th><th>Kusur</th><th>Foto</th><th>Not</th><th></th></tr>`;
    list.slice().reverse().forEach(i => {
      const [kl, kc] = KALITE_ETIKET[i.kalite] || ['—', 'pill-gray'];
      const rezerveAdet = (i.rezervasyonlar || []).reduce((a, r) => a + (r.adet || 0), 0);
      const rezerveKimde = (i.rezervasyonlar || []).map(r => (r.teklifKod || 'Teklif') + (r.musteriAdi ? ' · ' + r.musteriAdi : '') + ' (' + r.adet + ')').join(', ');
      html += `<tr>
        <td><b>${App.escapeHtml(i.ad || i.kod)}</b><div class="mono" style="font-size:10px;color:var(--text3)">${App.escapeHtml(i.kod || '')}</div></td>
        <td><span class="pill ${kc}">${kl}</span></td>
        <td class="r">${App.fmt(i.miktar, 2)} ${App.escapeHtml(i.birim || '')}${rezerveAdet ? `<div style="font-size:9.5px;color:var(--amber-text)" title="${App.escapeHtml(rezerveKimde)}">🔒 Rezerve: ${rezerveAdet} · Serbest: ${Math.max(0, (i.miktar || 0) - rezerveAdet)}</div>` : ''}</td>
        <td class="r"><b>${App.fmt(i.satisFiyati, 2)} ${App.escapeHtml(i.dvz || 'TL')}</b></td>
        <td style="font-size:11px;max-width:180px">${App.escapeHtml(i.aciklama || '—')}</td>
        <td>${fotoBtn(i)}</td>
        <td style="font-size:11px">${App.escapeHtml(i.satisNotu || '—')}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-ghost ia-form" data-id="${i.id}" data-fmt="pdf">PDF</button>
          <button class="btn btn-sm btn-ghost ia-form" data-id="${i.id}" data-fmt="xlsx">Excel</button>
          ${yonetimMi ? `<button class="btn btn-sm btn-green ia-satildi" data-id="${i.id}">Satıldı</button>` : ''}
        </td>
      </tr>`;
    });
    html += `</table></div>`;
    return html;
  }

  function wireSatisTab(list, render, main) {
    document.querySelectorAll('.ia-foto').forEach(b => b.onclick = () => fotoGaleri(list.find(x => x.id === b.dataset.id)));
    document.querySelectorAll('.ia-form').forEach(b => b.onclick = () => {
      const i = list.find(x => x.id === b.dataset.id);
      if (b.dataset.fmt === 'pdf') kusurFormuPDF(i); else kusurFormuExcel(i);
    });
    document.querySelectorAll('.ia-satildi').forEach(b => b.onclick = () => {
      const i = list.find(x => x.id === b.dataset.id);
      App.confirmDialog(`"${i.ad || i.kod}" satıldı olarak işaretlensin mi?`, async () => {
        i.durum = 'satildi';
        i.satisTarihi = new Date().toISOString().slice(0, 10);
        await App.persist(() => Store.iadeKalemleri.upsert(i));
        // İade ambarı stoğundan düş
        const stokRaf = await Store.stokRaf.all();
        const s = stokRaf.find(x => x.ambar === 'iade_ambari' && x.refId === (i.refId || i.id));
        if (s) { s.miktar = Math.max(0, (s.miktar || 0) - i.miktar); await App.persist(() => Store.stokRaf.save(stokRaf)); }
        App.toast('Satıldı olarak işaretlendi', 'ok');
        render(main);
      });
    });
    const excelBtn = document.getElementById('ia-liste-excel');
    if (excelBtn) excelBtn.onclick = () => satisListesiExcel(list);
  }

  function renderTedarikciTab(list) {
    if (!list.length) return `<div class="card"><div class="empty-state" style="padding:30px"><div class="eicon">✓</div><div class="etitle">Tedarikçiye iade edilecek malzeme yok</div><div class="edesc">Kalite tarafından reddedilen hammaddeler burada tedarikçiye iade faturasıyla geri gönderilir.</div></div></div>`;
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Tedarikçiye İade Edilecek Malzemeler</div></div>
      <div class="fhint" style="margin-bottom:8px">Kaliteden dönen hammadde/malzemeler için tedarikçiye iade faturası oluşturun. Fatura oluşunca kalem listeden düşer.</div>
      <table class="dtable"><tr><th>NCR</th><th>Kod / Ad</th><th class="r">Miktar</th><th>Tedarikçi</th><th>Kusur</th><th>Foto</th><th></th></tr>`;
    list.slice().reverse().forEach(i => {
      html += `<tr>
        <td class="mono">${i.ncrNo || '—'}</td>
        <td><b>${App.escapeHtml(i.ad || i.kod)}</b><div class="mono" style="font-size:10px;color:var(--text3)">${App.escapeHtml(i.kod || '')}</div></td>
        <td class="r">${App.fmt(i.miktar, 2)} ${App.escapeHtml(i.birim || '')}</td>
        <td>${App.escapeHtml(i.kaynakTedarikciAdi || '—')}</td>
        <td style="font-size:11px;max-width:180px">${App.escapeHtml(i.aciklama || '—')}</td>
        <td>${fotoBtn(i)}</td>
        <td><button class="btn btn-sm btn-purple ia-iade-fatura" data-id="${i.id}">İade Faturası Oluştur</button></td>
      </tr>`;
    });
    html += `</table></div>`;
    return html;
  }

  function wireTedarikciTab(list, render, main) {
    document.querySelectorAll('.ia-foto').forEach(b => b.onclick = () => fotoGaleri(list.find(x => x.id === b.dataset.id)));
    document.querySelectorAll('.ia-iade-fatura').forEach(b => b.onclick = () => {
      const i = list.find(x => x.id === b.dataset.id);
      iadeFaturaModal(i, render, main);
    });
  }

  function iadeFaturaModal(i, render, main) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="background:#F1F5F9;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px">
        <b>${App.escapeHtml(i.ad || i.kod)}</b> · ${App.fmt(i.miktar, 2)} ${App.escapeHtml(i.birim || '')} · Tedarikçi: <b>${App.escapeHtml(i.kaynakTedarikciAdi || '—')}</b>
      </div>
      <div class="frow">
        <div class="fgroup" style="flex:2"><label class="flbl">İade Birim Fiyatı <span style="color:var(--red-text)">*</span></label>
          <input type="number" class="finput" id="if-fiyat" step="0.01" min="0" placeholder="Alış fiyatı"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Döviz</label>
          <select class="fselect" id="if-dvz"><option>TL</option><option>USD</option><option>EUR</option></select></div>
      </div>
      <div class="fgroup"><label class="flbl">İade Gerekçesi</label>
        <textarea class="ftextarea" id="if-gerekce" rows="2" placeholder="Kalite reddi gerekçesi">${App.escapeHtml(i.aciklama || '')}</textarea></div>
    `;
    const footer = `<button class="btn" id="if-cancel">Vazgeç</button><button class="btn btn-purple" id="if-olustur">İade Faturası Oluştur</button>`;
    App.openModal({ title: 'Tedarikçiye İade Faturası', body, footer, wide: true });
    document.getElementById('if-cancel').onclick = App.closeModal;
    document.getElementById('if-olustur').onclick = async () => {
      const fiyat = parseFloat(document.getElementById('if-fiyat').value);
      if (!(fiyat >= 0) || isNaN(fiyat)) { App.toast('Geçerli bir fiyat girin', 'err'); return; }
      const faturalar = await Store.tedarikciIadeFaturalari.all();
      const faturaNo = 'TIF-' + (faturalar.length + 1).toString().padStart(4, '0');
      const dvz = document.getElementById('if-dvz').value;
      const tutar = fiyat * i.miktar;
      const fatura = {
        id: App.uid('TIF'), no: faturaNo, ncrId: i.ncrId, ncrNo: i.ncrNo,
        iadeKalemId: i.id, kod: i.kod, ad: i.ad, miktar: i.miktar, birim: i.birim,
        birimFiyat: fiyat, tutar, dvz,
        tedarikciId: i.kaynakTedarikciId, tedarikciAdi: i.kaynakTedarikciAdi,
        gerekce: document.getElementById('if-gerekce').value.trim(),
        tarih: new Date().toISOString().slice(0, 10), olusturan: App.currentRoleLabel()
      };
      faturalar.push(fatura);
      await App.persist(() => Store.tedarikciIadeFaturalari.save(faturalar));
      // İade kalemini "tedarikçiye iade edildi" işaretle + iade ambarı stoğundan düş
      i.tedarikciyeIadeEdildi = true;
      i.durum = 'tedarikciye_iade';
      i.iadeFaturaNo = faturaNo;
      await App.persist(() => Store.iadeKalemleri.upsert(i));
      const stokRaf = await Store.stokRaf.all();
      const s = stokRaf.find(x => x.ambar === 'iade_ambari' && x.refId === (i.refId || i.id));
      if (s) { s.miktar = Math.max(0, (s.miktar || 0) - i.miktar); await App.persist(() => Store.stokRaf.save(stokRaf)); }

      // BULGU (T1-8): tedarikçiye iade ne tedarikçi borcundan mahsup
      // ediliyordu ne de muhasebeye yansıyordu — malzeme fiziksel olarak
      // geri gönderilse de sistemde hâlâ "borçlu/satın alınmış" görünüyordu.
      // Tutar TL'ye çevrilip (1) tedarikciOdemeleri'ne bir mahsup kaydı
      // (borcu azaltır — page_cari_panel.js'teki bakiye hesabı ÖDEMELERİ
      // tipe bakmaksızın topladığı için doğrudan çalışır), (2) 'gelir'
      // olarak bir muhasebe kaydı (orijinal hammadde alımı gideri kısmen
      // GERİ ALINDI — ters kayıt) eklenir.
      const tutarTRY = App.toTRY(tutar, dvz, App.state.ayarlar);
      if (tutarTRY > 0 && i.kaynakTedarikciId) {
        const tedarikciOdemeleri = await Store.tedarikciOdemeleri.all();
        tedarikciOdemeleri.push({
          id: App.uid('TO'), tarih: fatura.tarih, tedarikciId: i.kaynakTedarikciId, tedarikciAdi: i.kaynakTedarikciAdi,
          tip: 'iade_mahsup', detay: 'Tedarikçi iade faturası: ' + faturaNo, tutar: tutarTRY, iadeFaturaId: fatura.id
        });
        await App.persist(() => Store.tedarikciOdemeleri.save(tedarikciOdemeleri));
      }
      if (tutarTRY > 0) {
        await App.persist(() => App.muhasebeKaydiOlustur({
          tip: 'gelir', kategori: 'tedarikci_iade_mahsup',
          aciklama: 'Tedarikçiye iade: ' + faturaNo + ' — ' + (i.ad || i.kod) + (i.kaynakTedarikciAdi ? ' (' + i.kaynakTedarikciAdi + ')' : ''),
          tutar: tutarTRY, matrah: tutarTRY, kdvTutari: 0, kaynakId: fatura.id, kaynakTip: 'tedarikci_iade_faturasi'
        }));
      }

      App.closeModal();
      App.toast('İade faturası oluşturuldu: ' + faturaNo, 'ok');
      iadeFaturaPDF(fatura); // faturayı hemen yazdırılabilir aç
      render(main);
    };
  }

  // ── FOTO GALERİ ─────────────────────────────────────────────────────────
  function fotoGaleri(i) {
    if (!i) return;
    const body = document.createElement('div');
    body.innerHTML = `<div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">${App.escapeHtml(i.ad || i.kod)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">${(i.fotograflar || []).map(f => `<img src="${f}" style="max-width:280px;max-height:280px;border-radius:8px;border:1px solid var(--border)">`).join('')}</div>`;
    App.openModal({ title: '📷 Kusur Fotoğrafları', body, footer: `<button class="btn" id="fg-x">Kapat</button>`, wide: true });
    document.getElementById('fg-x').onclick = App.closeModal;
  }

  // ── ÇIKTILAR ────────────────────────────────────────────────────────────
  function kusurFormuExcel(i) {
    const wb = XLSX.utils.book_new();
    const [kl] = KALITE_ETIKET[i.kalite] || ['—'];
    const rows = [
      ['2. KALİTE / KUSUR FORMU'], [],
      ['İade No / NCR', i.ncrNo || ''],
      ['Kod', i.kod || ''], ['Ad', i.ad || ''],
      ['Miktar', (i.miktar || '') + ' ' + (i.birim || '')],
      ['Kalite Sınıfı', kl],
      ['Satış Fiyatı', (i.satisFiyati != null ? i.satisFiyati : '') + ' ' + (i.dvz || '')],
      ['Durum', i.durum], [], ['Kusur Açıklaması'], [i.aciklama || ''],
      ['Satış Notu', i.satisNotu || ''], ['Fotoğraf Sayısı', (i.fotograflar || []).length]
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws, '2.Kalite');
    XLSX.writeFile(wb, `2Kalite_${i.kod || i.id}.xlsx`);
    App.toast('Excel indirildi', 'ok');
  }

  function satisListesiExcel(list) {
    const wb = XLSX.utils.book_new();
    const header = ['Kod', 'Ad', 'Kalite Sınıfı', 'Miktar', 'Birim', 'Satış Fiyatı', 'Döviz', 'Kusur', 'Not'];
    const rows = [header];
    list.forEach(i => {
      const [kl] = KALITE_ETIKET[i.kalite] || ['—'];
      rows.push([i.kod || '', i.ad || '', kl, i.miktar || 0, i.birim || '', i.satisFiyati || 0, i.dvz || 'TL', i.aciklama || '', i.satisNotu || '']);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 30 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, '2.Kalite Satis');
    XLSX.writeFile(wb, '2Kalite_Satis_Listesi.xlsx');
    App.toast('Satış listesi indirildi', 'ok');
  }

  function kusurFormuPDF(i) {
    const w = window.open('', '_blank');
    if (!w) { App.toast('Açılır pencere engellendi', 'err'); return; }
    const [kl] = KALITE_ETIKET[i.kalite] || ['—'];
    const fotoHtml = (i.fotograflar || []).map(f => `<img src="${f}" style="max-width:48%;max-height:340px;margin:6px;border:1px solid #ccc;border-radius:6px">`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>2. Kalite Formu</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#1e293b;max-width:800px;margin:0 auto}
      h1{font-size:20px;border-bottom:3px solid #d97706;padding-bottom:8px;margin-bottom:4px}
      .sub{color:#64748b;font-size:12px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:13px}
      td{padding:7px 10px;border:1px solid #e2e8f0} td.lbl{background:#f1f5f9;font-weight:700;width:180px}
      .aciklama{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:13px;margin-bottom:18px}
      .foto-baslik{font-weight:700;font-size:13px;margin-bottom:8px}.fotolar{display:flex;flex-wrap:wrap}
      @media print{button{display:none}}</style></head><body>
      <h1>2. Kalite / Kusur Formu</h1><div class="sub">${i.ncrNo || ''} · ${i.fiyatlandirmaTarihi || ''}</div>
      <table>
        <tr><td class="lbl">Kod</td><td>${(i.kod || '').replace(/</g, '&lt;')}</td></tr>
        <tr><td class="lbl">Ad</td><td>${(i.ad || '').replace(/</g, '&lt;')}</td></tr>
        <tr><td class="lbl">Kalite Sınıfı</td><td><b>${kl}</b></td></tr>
        <tr><td class="lbl">Miktar</td><td>${i.miktar || ''} ${i.birim || ''}</td></tr>
        <tr><td class="lbl">Satış Fiyatı</td><td><b>${i.satisFiyati != null ? i.satisFiyati : ''} ${i.dvz || 'TL'}</b></td></tr>
        ${i.satisNotu ? `<tr><td class="lbl">Satış Notu</td><td>${(i.satisNotu || '').replace(/</g, '&lt;')}</td></tr>` : ''}
      </table>
      <div class="foto-baslik">Kusur Açıklaması</div>
      <div class="aciklama">${(i.aciklama || '—').replace(/</g, '&lt;')}</div>
      ${fotoHtml ? `<div class="foto-baslik">Kusur Fotoğrafları (${(i.fotograflar || []).length})</div><div class="fotolar">${fotoHtml}</div>` : ''}
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;background:#d97706;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 Yazdır / PDF olarak kaydet</button>
      </body></html>`);
    w.document.close();
    App.toast('Kusur formu açıldı', 'ok');
  }

  function iadeFaturaPDF(f) {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>İade Faturası ${f.no}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#1e293b;max-width:760px;margin:0 auto}
      h1{font-size:20px;border-bottom:3px solid #7c3aed;padding-bottom:8px}.sub{color:#64748b;font-size:12px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
      td,th{padding:8px 10px;border:1px solid #e2e8f0}th{background:#f1f5f9;text-align:left}
      .toplam{text-align:right;font-size:15px;font-weight:700;margin-top:12px}
      @media print{button{display:none}}</style></head><body>
      <h1>Tedarikçiye İade Faturası</h1><div class="sub">${f.no} · ${f.tarih}</div>
      <table><tr><th>Tedarikçi</th><td>${(f.tedarikciAdi || '—').replace(/</g, '&lt;')}</td><th>Bağlı NCR</th><td>${f.ncrNo || '—'}</td></tr></table>
      <table><tr><th>Kod</th><th>Ad</th><th>Miktar</th><th>Birim Fiyat</th><th>Tutar</th></tr>
        <tr><td>${(f.kod || '').replace(/</g, '&lt;')}</td><td>${(f.ad || '').replace(/</g, '&lt;')}</td>
        <td>${f.miktar} ${f.birim || ''}</td><td>${f.birimFiyat} ${f.dvz}</td><td>${f.tutar.toFixed(2)} ${f.dvz}</td></tr></table>
      ${f.gerekce ? `<div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:12px;font-size:12px"><b>İade Gerekçesi:</b> ${(f.gerekce || '').replace(/</g, '&lt;')}</div>` : ''}
      <div class="toplam">Toplam İade Tutarı: ${f.tutar.toFixed(2)} ${f.dvz}</div>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 Yazdır / PDF kaydet</button>
      </body></html>`);
    w.document.close();
  }

  return { render };
})();
