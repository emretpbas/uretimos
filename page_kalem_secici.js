// ════════════════════════════════════════════════════════════════════════════
// KALEM SEÇİCİ — Sipariş, Teklif, Nesting hammadde seçimi gibi tüm dropdown
// bazlı seçimler için ortak, ayrı bir sayfa. Sütun bazlı (kod/ad/birim/fiyat)
// ve serbest metin (satır bazlı) arama/filtreleme sunar.
//
// Çağıran sayfa şu şekilde kullanır:
//   App.goTo('kalem_secici', {
//     baslik: 'Sipariş için Kalem Seç',
//     secenekler: [{grup, kod, ad, netFiyat, maliyetYok, birim}, ...],
//     gruplar: {urun:'Bitmiş Ürünler', yarimamul:'Yarı Mamüller', hammadde:'Hammadde/Hırdavat'}, // opsiyonel
//     onSecildi: (secim) => { ... },   // kullanıcı bir satır seçince çağrılır
//     geriDon: () => { App.goTo('siparis'); }  // "Vazgeç" butonunda çağrılır
//   });
// ════════════════════════════════════════════════════════════════════════════
PageModules.kalem_secici = (() => {
  let state = null; // {baslik, secenekler, gruplar, onSecildi, geriDon}
  let filtreGrup = '';   // sütun bazlı: grup filtresi
  let filtreKod = '';    // sütun bazlı: kod içerir
  let filtreAd = '';     // sütun bazlı: ad içerir
  let filtreBirim = '';  // sütun bazlı: birim içerir
  let serbestMetin = ''; // satır bazlı: herhangi bir alanda geçen serbest arama
  let siralamaKolon = 'kod';
  let siralamaYon = 1;

  async function render(main, params) {
    if (params) {
      state = params;
      // Yeni bir seçici açıldığında filtreleri sıfırla
      filtreGrup = ''; filtreKod = ''; filtreAd = ''; filtreBirim = ''; serbestMetin = '';
      siralamaKolon = 'kod'; siralamaYon = 1;
    }
    if (!state) {
      main.innerHTML = `<div class="empty-state"><div class="etitle">Seçici parametreleri bulunamadı</div></div>`;
      return;
    }

    const gruplar = state.gruplar || {};
    const grupDegerleri = [...new Set(state.secenekler.map(s => s.grup).filter(Boolean))];

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${App.escapeHtml(state.baslik || 'Kalem Seç')}</div><div class="page-sub">Sütun başlıklarındaki kutucuklarla filtreleyin, veya genel arama kullanın</div></div>
        <div class="page-acts">
          ${state.yeniKartEklenebilir ? '<button class="btn btn-green" id="ks-yeni-kart">+ Yeni Kart Ekle</button>' : ''}
          ${state.ekstraButon ? `<button class="btn btn-blue" id="ks-ekstra-btn">${App.escapeHtml(state.ekstraButon.etiket)}</button>` : ''}
          <button class="btn" id="ks-geri">&larr; Vazgeç</button>
        </div>
      </div>

      <div class="card">
        <div class="fgroup" style="margin-bottom:14px">
          <label class="flbl">Genel Arama (kod, ad, birim — hepsinde birden arar)</label>
          <input class="finput" id="ks-serbest" placeholder="Yazmaya başlayın…" value="${App.escapeHtml(serbestMetin)}">
        </div>
        <div id="ks-table-wrap"></div>
      </div>
    `;

    document.getElementById('ks-geri').onclick = () => { if (state.geriDon) state.geriDon(); };
    const yeniKartBtn = document.getElementById('ks-yeni-kart');
    if (yeniKartBtn) yeniKartBtn.onclick = () => openYeniKartIstegiModal();
    const ekstraBtn = document.getElementById('ks-ekstra-btn');
    if (ekstraBtn) ekstraBtn.onclick = () => { if (state.ekstraButon && state.ekstraButon.onClick) state.ekstraButon.onClick(); };
    const serbestInput = document.getElementById('ks-serbest');
    serbestInput.oninput = () => { serbestMetin = serbestInput.value; renderTable(); };
    // Input focus'unu koru (her tuş vuruşunda tüm tabloyu yeniden çizdiğimiz için)
    serbestInput.focus();
    serbestInput.setSelectionRange(serbestInput.value.length, serbestInput.value.length);

    renderTable();

    function filtrele() {
      const sm = serbestMetin.trim().toLowerCase();
      return state.secenekler.filter(s => {
        if (filtreGrup && s.grup !== filtreGrup) return false;
        if (filtreKod && !(s.kod || '').toLowerCase().includes(filtreKod.toLowerCase())) return false;
        if (filtreAd && !(s.ad || '').toLowerCase().includes(filtreAd.toLowerCase())) return false;
        if (filtreBirim && !(s.birim || '').toLowerCase().includes(filtreBirim.toLowerCase())) return false;
        if (sm) {
          const hepsi = [s.kod, s.ad, s.birim, gruplar[s.grup] || s.grup].join(' ').toLowerCase();
          if (!hepsi.includes(sm)) return false;
        }
        return true;
      });
    }

    function siralaListe(liste) {
      const sign = siralamaYon;
      return [...liste].sort((a, b) => {
        let av = a[siralamaKolon], bv = b[siralamaKolon];
        if (siralamaKolon === 'netFiyat') { av = av || 0; bv = bv || 0; return (av - bv) * sign; }
        av = (av || '').toString().toLowerCase(); bv = (bv || '').toString().toLowerCase();
        return av.localeCompare(bv) * sign;
      });
    }

    function renderTable() {
      const wrap = document.getElementById('ks-table-wrap');
      // İlk çağrıda tüm tabloyu (header + filtre satırı + tbody) kur; sonraki
      // çağrılarda SADECE tbody'i güncelle ki filtre input'ları focus kaybetmesin.
      if (!wrap.querySelector('table')) {
        wrap.innerHTML = `<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table class="dtable">
          <thead>
            <tr id="ks-sort-row"></tr>
            <tr id="ks-filter-row" style="background:var(--bg)"></tr>
          </thead>
          <tbody id="ks-tbody"></tbody>
        </table></div>
        <div class="fhint" id="ks-count-hint" style="margin-top:8px"></div>`;
        renderSortRow();
        renderFilterRow();
      }
      renderTbody();
    }

    function renderSortRow() {
      const sortIcon = (kol) => siralamaKolon === kol ? (siralamaYon === 1 ? ' ▲' : ' ▼') : '';
      const row = document.getElementById('ks-sort-row');
      row.innerHTML = `
        <th class="ks-sort-th" data-kol="grup" style="cursor:pointer">Grup${sortIcon('grup')}</th>
        <th class="ks-sort-th" data-kol="kod" style="cursor:pointer">Kod${sortIcon('kod')}</th>
        <th class="ks-sort-th" data-kol="ad" style="cursor:pointer">Ad${sortIcon('ad')}</th>
        <th class="ks-sort-th" data-kol="birim" style="cursor:pointer">Birim${sortIcon('birim')}</th>
        <th class="ks-sort-th r" data-kol="netFiyat" style="cursor:pointer">Fiyat${sortIcon('netFiyat')}</th>
        <th></th>`;
      row.querySelectorAll('.ks-sort-th').forEach(th => th.onclick = () => {
        const kol = th.dataset.kol;
        if (siralamaKolon === kol) siralamaYon *= -1; else { siralamaKolon = kol; siralamaYon = 1; }
        renderSortRow();
        renderTbody();
      });
    }

    function renderFilterRow() {
      const row = document.getElementById('ks-filter-row');
      row.innerHTML = `
        <th><select class="fselect ks-filter-grup" style="font-size:10.5px;padding:3px 4px">
          <option value="">Tümü</option>
          ${grupDegerleri.map(g => `<option value="${g}" ${filtreGrup === g ? 'selected' : ''}>${App.escapeHtml(gruplar[g] || g)}</option>`).join('')}
        </select></th>
        <th><input class="finput ks-filter-kod" placeholder="ara…" value="${App.escapeHtml(filtreKod)}" style="font-size:10.5px;padding:3px 4px"></th>
        <th><input class="finput ks-filter-ad" placeholder="ara…" value="${App.escapeHtml(filtreAd)}" style="font-size:10.5px;padding:3px 4px"></th>
        <th><input class="finput ks-filter-birim" placeholder="ara…" value="${App.escapeHtml(filtreBirim)}" style="font-size:10.5px;padding:3px 4px"></th>
        <th></th><th></th>`;
      row.querySelector('.ks-filter-grup').onchange = (e) => { filtreGrup = e.target.value; renderTbody(); };
      row.querySelector('.ks-filter-kod').oninput = (e) => { filtreKod = e.target.value; renderTbody(); };
      row.querySelector('.ks-filter-ad').oninput = (e) => { filtreAd = e.target.value; renderTbody(); };
      row.querySelector('.ks-filter-birim').oninput = (e) => { filtreBirim = e.target.value; renderTbody(); };
    }

    function renderTbody() {
      const tbody = document.getElementById('ks-tbody');
      const filtreliListe = siralaListe(filtrele());
      let html = '';
      if (!filtreliListe.length) {
        html = `<tr><td colspan="6"><div class="empty-state" style="padding:24px 0"><div class="edesc">Filtreyle eşleşen kalem bulunamadı.</div></div></td></tr>`;
      } else {
        filtreliListe.forEach(s => {
          html += `<tr class="ks-row" data-grup="${s.grup}" data-kod="${App.escapeHtml(s.kod)}" style="cursor:pointer">
            <td><span class="pill pill-gray">${App.escapeHtml(gruplar[s.grup] || s.grup || '—')}</span></td>
            <td class="mono"><b>${App.escapeHtml(s.kod)}</b></td>
            <td>${App.escapeHtml(s.ad)}</td>
            <td class="mono" style="font-size:11px">${App.escapeHtml(s.birim || '—')}</td>
            <td class="r">${s.maliyetYok ? '<span class="pill pill-red">MALİYET YOK</span>' : App.fmtTL(s.netFiyat)}</td>
            <td><button class="btn btn-sm btn-blue ks-sec-btn">Seç</button></td>
          </tr>`;
        });
      }
      tbody.innerHTML = html;
      document.getElementById('ks-count-hint').textContent = `${filtreliListe.length} / ${state.secenekler.length} kalem gösteriliyor`;

      tbody.querySelectorAll('.ks-row').forEach(row => {
        const secimYap = () => {
          const secim = state.secenekler.find(s => s.grup === row.dataset.grup && s.kod === row.dataset.kod);
          if (secim && state.onSecildi) state.onSecildi(secim);
        };
        row.querySelector('.ks-sec-btn').onclick = (e) => { e.stopPropagation(); secimYap(); };
        row.onclick = secimYap;
      });
    }
  }

  // "+ Yeni Kart Ekle": sistemde henüz olmayan bir kart için kod/ad alır,
  // gerçek oluşturma işlemini (hangi koleksiyona ekleneceği dahil) çağıran
  // sayfanın onYeniKartIstendi callback'ine bırakır.
  function openYeniKartIstegiModal() {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Listede bulamadığınız bir kalem için kod ve ad girin; kart tipini bir sonraki adımda seçeceksiniz.</div>
      <div class="fgroup"><label class="flbl">Kod</label><input class="finput" id="ks-yk-kod" placeholder="örn. YM.YENI.001"></div>
      <div class="fgroup"><label class="flbl">Ad</label><input class="finput" id="ks-yk-ad" placeholder="örn. Yan Panel Sol"></div>
    `;
    const footer = `<button class="btn" id="ks-yk-cancel">Vazgeç</button><button class="btn btn-green" id="ks-yk-confirm">Devam Et</button>`;
    App.openModal({ title: 'Yeni Kart İçin Bilgi Girin', body, footer });
    document.getElementById('ks-yk-cancel').onclick = App.closeModal;
    document.getElementById('ks-yk-confirm').onclick = () => {
      const kod = document.getElementById('ks-yk-kod').value.trim();
      const ad = document.getElementById('ks-yk-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      App.closeModal();
      if (state.onYeniKartIstendi) state.onYeniKartIstendi({ kod, ad });
    };
  }

  return { render };
})();
