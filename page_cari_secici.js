// ════════════════════════════════════════════════════════════════════════════
// CARİ SEÇİCİ — müşteri ve tedarikçi kartları arasından seçim yapmak için
// ortak, ayrı bir sayfa. Kalem Seçici ile aynı arama/filtreleme mantığı
// (genel arama + sütun bazlı filtre + sıralama). Seçiciden çıkmadan yeni
// müşteri/tedarikçi kartı da oluşturulabilir.
//
// Çağıran sayfa şu şekilde kullanır:
//   App.goTo('cari_secici', {
//     baslik: 'Tedarikçi Seç',
//     varsayilanGrup: 'tedarikci',     // 'tedarikci' | 'musteri' | null (ikisi de)
//     onSecildi: (secim) => { ... },   // {grup:'tedarikci'|'musteri', id, unvan, ...kayit}
//     geriDon: () => { App.goTo('satinalma_panel'); }
//   });
// ════════════════════════════════════════════════════════════════════════════
PageModules.cari_secici = (() => {
  let state = null;
  let filtreGrup = '';
  let filtreUnvan = '';
  let filtreTelefon = '';
  let filtreEmail = '';
  let serbestMetin = '';
  let siralamaKolon = 'unvan';
  let siralamaYon = 1;

  async function render(main, params) {
    if (params) {
      state = params;
      filtreGrup = params.varsayilanGrup || '';
      filtreUnvan = ''; filtreTelefon = ''; filtreEmail = ''; serbestMetin = '';
      siralamaKolon = 'unvan'; siralamaYon = 1;
    }
    if (!state) {
      main.innerHTML = `<div class="empty-state"><div class="etitle">Seçici parametreleri bulunamadı</div></div>`;
      return;
    }

    const [musteriler, tedarikciler] = await Promise.all([Store.musteriler.all(), Store.tedarikciler.all()]);
    const tumKayitlar = [
      ...musteriler.map(m => ({ grup: 'musteri', id: m.id, unvan: m.unvan, telefon: m.telefon, email: m.email, vergiNo: m.vergiNo, _kayit: m })),
      ...tedarikciler.map(t => ({ grup: 'tedarikci', id: t.id, unvan: t.unvan, telefon: t.telefon, email: t.email, vergiNo: t.vergiNo, _kayit: t }))
    ];
    const gruplar = { musteri: 'Müşteri', tedarikci: 'Tedarikçi' };

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${App.escapeHtml(state.baslik || 'Cari Kart Seç')}</div><div class="page-sub">Tüm müşteri ve tedarikçi kartlarına buradan ulaşabilir, sütun başlıklarındaki kutucuklarla filtreleyebilirsiniz</div></div>
        <div class="page-acts">
          <button class="btn btn-blue" id="cs-yeni-musteri">+ Yeni Müşteri Ekle</button>
          <button class="btn btn-blue" id="cs-yeni-tedarikci">+ Yeni Tedarikçi Ekle</button>
          <button class="btn" id="cs-geri">&larr; Vazgeç</button>
        </div>
      </div>

      <div class="card">
        <div class="fgroup" style="margin-bottom:14px">
          <label class="flbl">Genel Arama (ünvan, telefon, e-posta, vergi no — hepsinde birden arar)</label>
          <input class="finput" id="cs-serbest" placeholder="Yazmaya başlayın…" value="${App.escapeHtml(serbestMetin)}">
        </div>
        <div id="cs-table-wrap"></div>
      </div>
    `;

    document.getElementById('cs-geri').onclick = () => { if (state.geriDon) state.geriDon(); };
    document.getElementById('cs-yeni-musteri').onclick = () => {
      PageModules.cari_panel.openMusteriForm(null, async () => {
        const guncelMusteriler = await Store.musteriler.all();
        const yeni = guncelMusteriler[guncelMusteriler.length - 1];
        if (yeni && state.onSecildi) { state.onSecildi({ grup: 'musteri', id: yeni.id, unvan: yeni.unvan, ...yeni }); return; }
        render(main);
      });
    };
    document.getElementById('cs-yeni-tedarikci').onclick = () => {
      PageModules.cari_panel.openTedarikciForm(null, async () => {
        const guncelTedarikciler = await Store.tedarikciler.all();
        const yeni = guncelTedarikciler[guncelTedarikciler.length - 1];
        if (yeni && state.onSecildi) { state.onSecildi({ grup: 'tedarikci', id: yeni.id, unvan: yeni.unvan, ...yeni }); return; }
        render(main);
      });
    };

    const serbestInput = document.getElementById('cs-serbest');
    serbestInput.oninput = () => { serbestMetin = serbestInput.value; renderTbody(tumKayitlar, gruplar); };
    serbestInput.focus();
    serbestInput.setSelectionRange(serbestInput.value.length, serbestInput.value.length);

    renderTable(tumKayitlar, gruplar);

    function renderTable(tumKayitlar, gruplar) {
      const wrap = document.getElementById('cs-table-wrap');
      wrap.innerHTML = `<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table class="dtable">
        <thead>
          <tr id="cs-sort-row"></tr>
          <tr id="cs-filter-row" style="background:var(--bg)"></tr>
        </thead>
        <tbody id="cs-tbody"></tbody>
      </table></div>
      <div class="fhint" id="cs-count-hint" style="margin-top:8px"></div>`;
      renderSortRow(tumKayitlar, gruplar);
      renderFilterRow(tumKayitlar, gruplar);
      renderTbody(tumKayitlar, gruplar);
    }

    function renderSortRow(tumKayitlar, gruplar) {
      const sortIcon = (kol) => siralamaKolon === kol ? (siralamaYon === 1 ? ' ▲' : ' ▼') : '';
      const row = document.getElementById('cs-sort-row');
      row.innerHTML = `
        <th class="cs-sort-th" data-kol="grup" style="cursor:pointer">Tip${sortIcon('grup')}</th>
        <th class="cs-sort-th" data-kol="unvan" style="cursor:pointer">Ünvan${sortIcon('unvan')}</th>
        <th class="cs-sort-th" data-kol="telefon" style="cursor:pointer">Telefon${sortIcon('telefon')}</th>
        <th class="cs-sort-th" data-kol="email" style="cursor:pointer">E-posta${sortIcon('email')}</th>
        <th class="cs-sort-th" data-kol="vergiNo" style="cursor:pointer">Vergi No${sortIcon('vergiNo')}</th>
        <th></th>`;
      row.querySelectorAll('.cs-sort-th').forEach(th => th.onclick = () => {
        const kol = th.dataset.kol;
        if (siralamaKolon === kol) siralamaYon *= -1; else { siralamaKolon = kol; siralamaYon = 1; }
        renderSortRow(tumKayitlar, gruplar);
        renderTbody(tumKayitlar, gruplar);
      });
    }

    function renderFilterRow(tumKayitlar, gruplar) {
      const row = document.getElementById('cs-filter-row');
      row.innerHTML = `
        <th><select class="fselect cs-filter-grup" style="font-size:10.5px;padding:3px 4px">
          <option value="">Tümü</option>
          <option value="musteri" ${filtreGrup === 'musteri' ? 'selected' : ''}>Müşteri</option>
          <option value="tedarikci" ${filtreGrup === 'tedarikci' ? 'selected' : ''}>Tedarikçi</option>
        </select></th>
        <th><input class="finput cs-filter-unvan" placeholder="ara…" value="${App.escapeHtml(filtreUnvan)}" style="font-size:10.5px;padding:3px 4px"></th>
        <th><input class="finput cs-filter-telefon" placeholder="ara…" value="${App.escapeHtml(filtreTelefon)}" style="font-size:10.5px;padding:3px 4px"></th>
        <th><input class="finput cs-filter-email" placeholder="ara…" value="${App.escapeHtml(filtreEmail)}" style="font-size:10.5px;padding:3px 4px"></th>
        <th></th><th></th>`;
      row.querySelector('.cs-filter-grup').onchange = (e) => { filtreGrup = e.target.value; renderTbody(tumKayitlar, gruplar); };
      row.querySelector('.cs-filter-unvan').oninput = (e) => { filtreUnvan = e.target.value; renderTbody(tumKayitlar, gruplar); };
      row.querySelector('.cs-filter-telefon').oninput = (e) => { filtreTelefon = e.target.value; renderTbody(tumKayitlar, gruplar); };
      row.querySelector('.cs-filter-email').oninput = (e) => { filtreEmail = e.target.value; renderTbody(tumKayitlar, gruplar); };
    }

    function filtrele(tumKayitlar) {
      const sm = serbestMetin.trim().toLowerCase();
      return tumKayitlar.filter(k => {
        if (filtreGrup && k.grup !== filtreGrup) return false;
        if (filtreUnvan && !(k.unvan || '').toLowerCase().includes(filtreUnvan.toLowerCase())) return false;
        if (filtreTelefon && !(k.telefon || '').toLowerCase().includes(filtreTelefon.toLowerCase())) return false;
        if (filtreEmail && !(k.email || '').toLowerCase().includes(filtreEmail.toLowerCase())) return false;
        if (sm) {
          const hepsi = [k.unvan, k.telefon, k.email, k.vergiNo].join(' ').toLowerCase();
          if (!hepsi.includes(sm)) return false;
        }
        return true;
      });
    }

    function siralaListe(liste) {
      const sign = siralamaYon;
      return [...liste].sort((a, b) => {
        const av = (a[siralamaKolon] || '').toString().toLowerCase();
        const bv = (b[siralamaKolon] || '').toString().toLowerCase();
        return av.localeCompare(bv) * sign;
      });
    }

    function renderTbody(tumKayitlar, gruplar) {
      const tbody = document.getElementById('cs-tbody');
      const filtreliListe = siralaListe(filtrele(tumKayitlar));
      let html = '';
      if (!filtreliListe.length) {
        html = `<tr><td colspan="6"><div class="empty-state" style="padding:24px 0"><div class="edesc">Filtreyle eşleşen cari kart bulunamadı.</div></div></td></tr>`;
      } else {
        filtreliListe.forEach(k => {
          html += `<tr class="cs-row" data-grup="${k.grup}" data-id="${App.escapeHtml(k.id)}" style="cursor:pointer">
            <td><span class="pill ${k.grup === 'musteri' ? 'pill-blue' : 'pill-purple'}">${gruplar[k.grup]}</span></td>
            <td><b>${App.escapeHtml(k.unvan)}</b></td>
            <td style="font-size:11.5px">${App.escapeHtml(k.telefon || '—')}</td>
            <td style="font-size:11.5px">${App.escapeHtml(k.email || '—')}</td>
            <td class="mono" style="font-size:11px">${App.escapeHtml(k.vergiNo || '—')}</td>
            <td><button class="btn btn-sm btn-blue cs-sec-btn">Seç</button></td>
          </tr>`;
        });
      }
      tbody.innerHTML = html;
      document.getElementById('cs-count-hint').textContent = `${filtreliListe.length} / ${tumKayitlar.length} cari kart gösteriliyor`;

      tbody.querySelectorAll('.cs-row').forEach(row => {
        const secimYap = () => {
          const secim = tumKayitlar.find(k => k.grup === row.dataset.grup && k.id === row.dataset.id);
          if (secim && state.onSecildi) state.onSecildi(secim);
        };
        row.querySelector('.cs-sec-btn').onclick = (e) => { e.stopPropagation(); secimYap(); };
        row.onclick = secimYap;
      });
    }
  }

  return { render };
})();
