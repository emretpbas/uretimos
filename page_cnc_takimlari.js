// ════════════════════════════════════════════════════════════════════════════
// CNC TAKIM KÜTÜPHANESİ — freze bıçağı (kesici takım) tanımları.
// ────────────────────────────────────────────────────────────────────────────
// Kullanıcı isteği: "swoodcam ya da topsolid cam gibi freze bıçaklarını takım
// yollarından seçebildiğim bıçak yükseklik kalınlık ve bull, ball, düz noss,
// v noss, özel profilli bıçak ayarlarını yapabileceğim ... bir cam programı"
// — CAM (Computer-Aided Manufacturing) modülünün TEMEL veri kaynağı: bu
// ekranda tanımlanan takımlar, SolidWorks eklentisinin CNC Operasyon
// Paneli'nde (bkz. solidworks_addin/src/CncOperasyonPaneli.cs) her delik/
// kontur/cep operasyonuna ATANIR.
//
// BİLEREK BURADA OLMAYAN: gerçek G-kodu/postprocessor üretimi, tam 5 eksen
// takım yolu hesabı (surface-normal bazlı takım eğimi). Bunlar, kullanıcının
// göndereceği Biesse bSolid postprocessor'ü ve örnek makine koduna göre AYRI
// bir fazda ele alınacak — burada yalnızca takım TANIMI (kütüphane) var.
//
// PAYLAŞIM GEREKÇESİ (kullanıcı seçimi): takım kütüphanesi ÜretimOS
// sunucusunda TUTULUR (hammaddeler gibi) — tüm operatörler/makineler AYNI
// takım listesini görür, SolidWorks eklentisi bunu salt-okunur çeker
// (cad_entegrasyon rolü CAD_ENT_OKUNABILIR listesine cncTakimlari eklendi).
// ════════════════════════════════════════════════════════════════════════════
PageModules.cnc_takimlari = (() => {

  const PROFIL_ETIKET = {
    duz: 'Düz Uç (Flat End Mill)',
    bull: 'Bull Nose (Köşe Radyuslu)',
    ball: 'Ball Nose (Tam Yuvarlak Uç)',
    v: 'V Uç (Gravür/Pah)',
    ozel: 'Özel Profil'
  };

  let searchTxt = '';
  let filterProfil = 'hepsi';

  async function render(main) {
    const list = await Store.cncTakimlari.all();
    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">CNC Takım Kütüphanesi</div>
          <div class="page-sub">Freze bıçağı (kesici takım) tanımları — SolidWorks CNC Operasyon Paneli'nde takım seçimi için kullanılır</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="ct-new">+ Takım Tanımla</button></div>
      </div>

      <div class="card" style="padding:12px 16px">
        <div class="flex-gap" style="flex-wrap:wrap">
          <input class="finput" id="ct-search" placeholder="Takım kodu veya ad ara…" style="max-width:260px">
          <div class="flex-gap" style="margin-left:auto;flex-wrap:wrap">
            <button class="btn btn-sm profil-filter ${filterProfil === 'hepsi' ? 'btn-blue' : ''}" data-profil="hepsi">Hepsi</button>
            <button class="btn btn-sm profil-filter ${filterProfil === 'duz' ? 'btn-blue' : ''}" data-profil="duz">Düz</button>
            <button class="btn btn-sm profil-filter ${filterProfil === 'bull' ? 'btn-blue' : ''}" data-profil="bull">Bull</button>
            <button class="btn btn-sm profil-filter ${filterProfil === 'ball' ? 'btn-blue' : ''}" data-profil="ball">Ball</button>
            <button class="btn btn-sm profil-filter ${filterProfil === 'v' ? 'btn-blue' : ''}" data-profil="v">V</button>
            <button class="btn btn-sm profil-filter ${filterProfil === 'ozel' ? 'btn-blue' : ''}" data-profil="ozel">Özel</button>
          </div>
        </div>
      </div>

      <div class="card" id="ct-table-wrap"></div>
    `;
    document.getElementById('ct-new').onclick = () => openForm(null, () => render(main));
    document.getElementById('ct-search').oninput = (e) => { searchTxt = e.target.value.toLowerCase(); renderTable(list); };
    main.querySelectorAll('.profil-filter').forEach(b => b.onclick = () => { filterProfil = b.dataset.profil; render(main); });
    renderTable(list);

    function renderTable(list) {
      const wrap = document.getElementById('ct-table-wrap');
      let filtered = list;
      if (filterProfil !== 'hepsi') filtered = filtered.filter(k => k.profilTipi === filterProfil);
      if (searchTxt) filtered = filtered.filter(k =>
        (k.kod || '').toLowerCase().includes(searchTxt) || (k.ad || '').toLowerCase().includes(searchTxt));

      if (!filtered.length) {
        wrap.innerHTML = `<div class="empty-state" style="padding:28px 10px"><div class="eicon">🔧</div>
          <div class="etitle">Tanımlı takım yok</div>
          <div class="edesc">"+ Takım Tanımla" ile ilk freze bıçağınızı ekleyin.</div></div>`;
        return;
      }

      wrap.innerHTML = `<table class="dtable">
        <tr><th>Kod</th><th>Ad</th><th>Profil</th><th class="r">Çap (mm)</th>
          <th class="r">Kesme Boyu (mm)</th><th class="r">Sap Çapı (mm)</th>
          <th class="r">Maks. Devir (rpm)</th><th class="r">Maks. İlerleme (mm/dk)</th><th></th></tr>
        ${filtered.map(k => `
          <tr>
            <td class="mono">${App.escapeHtml(k.kod || '')}</td>
            <td>${App.escapeHtml(k.ad || '')}${k.aktif === false ? ' <span class="pill" style="background:var(--bg);color:var(--text2)">pasif</span>' : ''}</td>
            <td>${App.escapeHtml(PROFIL_ETIKET[k.profilTipi] || k.profilTipi || '—')}
              ${k.profilTipi === 'bull' && k.bullYaricapMm ? ' <span class="muted">(R' + App.fmt(k.bullYaricapMm, 1) + ')</span>' : ''}
              ${k.profilTipi === 'v' && k.vAcisiDerece ? ' <span class="muted">(' + App.fmt(k.vAcisiDerece, 0) + '°)</span>' : ''}
            </td>
            <td class="r">${App.fmt(k.capMm, 2)}</td>
            <td class="r">${k.kesmeBoyuMm ? App.fmt(k.kesmeBoyuMm, 1) : '—'}</td>
            <td class="r">${k.sapCapMm ? App.fmt(k.sapCapMm, 1) : '—'}</td>
            <td class="r">${k.maxDevirRpm ? App.fmt(k.maxDevirRpm, 0) : '—'}</td>
            <td class="r">${k.maxIlerlemeMmDak ? App.fmt(k.maxIlerlemeMmDak, 0) : '—'}</td>
            <td><button class="btn btn-sm ct-edit" data-id="${k.id}">Düzenle</button>
              <button class="btn btn-sm ct-sil" data-id="${k.id}" style="color:var(--red-text)">Sil</button></td>
          </tr>`).join('')}
      </table>`;
      wrap.querySelectorAll('.ct-edit').forEach(b => b.onclick = () => {
        const kart = list.find(k => k.id === b.dataset.id);
        openForm(kart, () => render(main));
      });
      wrap.querySelectorAll('.ct-sil').forEach(b => b.onclick = () => {
        App.confirmDialog('Bu takımı silmek istediğinize emin misiniz?', async () => {
          const guncel = (await Store.cncTakimlari.all()).filter(k => k.id !== b.dataset.id);
          await App.persist(() => Store.cncTakimlari.save(guncel));
          App.toast('Takım silindi', 'ok');
          render(main);
        });
      });
    }
  }

  function openForm(item, onSaved) {
    const isEdit = !!item;
    const d = item || { profilTipi: 'duz', aktif: true };
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Takım Kodu</label><input class="finput" id="f-kod" value="${App.escapeHtml(d.kod || '')}" placeholder="örn. FR-DUZ-8"></div>
        <div class="fgroup"><label class="flbl">Ad</label><input class="finput" id="f-ad" value="${App.escapeHtml(d.ad || '')}" placeholder="örn. 8mm Düz Uç Karbür Freze"></div>
      </div>
      <div class="fgroup"><label class="flbl">Profil Tipi</label>
        <select class="fselect" id="f-profil">
          <option value="duz" ${d.profilTipi === 'duz' ? 'selected' : ''}>${PROFIL_ETIKET.duz}</option>
          <option value="bull" ${d.profilTipi === 'bull' ? 'selected' : ''}>${PROFIL_ETIKET.bull}</option>
          <option value="ball" ${d.profilTipi === 'ball' ? 'selected' : ''}>${PROFIL_ETIKET.ball}</option>
          <option value="v" ${d.profilTipi === 'v' ? 'selected' : ''}>${PROFIL_ETIKET.v}</option>
          <option value="ozel" ${d.profilTipi === 'ozel' ? 'selected' : ''}>${PROFIL_ETIKET.ozel}</option>
        </select>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Çap (mm)</label><input class="finput" id="f-cap" type="number" step="0.01" value="${d.capMm || ''}"></div>
        <div class="fgroup"><label class="flbl">Kesme Boyu (mm)</label><input class="finput" id="f-kesme-boyu" type="number" step="0.1" value="${d.kesmeBoyuMm || ''}"></div>
        <div class="fgroup"><label class="flbl">Sap Çapı (mm)</label><input class="finput" id="f-sap-cap" type="number" step="0.1" value="${d.sapCapMm || ''}"></div>
      </div>
      <div class="frow" id="f-bull-row" style="${d.profilTipi === 'bull' ? '' : 'display:none'}">
        <div class="fgroup"><label class="flbl">Köşe Yarıçapı R (mm)</label><input class="finput" id="f-bull-r" type="number" step="0.1" value="${d.bullYaricapMm || ''}"></div>
      </div>
      <div class="frow" id="f-v-row" style="${d.profilTipi === 'v' ? '' : 'display:none'}">
        <div class="fgroup"><label class="flbl">Uç Açısı (derece)</label><input class="finput" id="f-v-aci" type="number" step="1" value="${d.vAcisiDerece || ''}"></div>
      </div>
      <div class="fgroup" id="f-ozel-row" style="${d.profilTipi === 'ozel' ? '' : 'display:none'}">
        <label class="flbl">Özel Profil Açıklaması</label>
        <input class="finput" id="f-ozel-aciklama" value="${App.escapeHtml(d.ozelProfilAciklama || '')}" placeholder="örn. çift taraflı pah + yarıçap kombinasyonu">
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Maks. Devir (rpm)</label><input class="finput" id="f-max-devir" type="number" step="100" value="${d.maxDevirRpm || ''}"></div>
        <div class="fgroup"><label class="flbl">Maks. İlerleme (mm/dk)</label><input class="finput" id="f-max-ilerleme" type="number" step="100" value="${d.maxIlerlemeMmDak || ''}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Not</label><input class="finput" id="f-not" value="${App.escapeHtml(d.aciklama || '')}" placeholder="örn. üretici/model, hangi malzemeler için uygun"></div>
      <div class="fcheck"><input type="checkbox" id="f-aktif" ${d.aktif !== false ? 'checked' : ''}><label for="f-aktif">Aktif (takım seçicilerde görünür)</label></div>
    `;
    const footer = `<button class="btn" id="f-cancel">Vazgeç</button><button class="btn btn-blue" id="f-save">${isEdit ? 'Güncelle' : 'Kaydet'}</button>`;
    App.openModal({ title: isEdit ? 'Takımı Düzenle' : 'Yeni Takım Tanımla', body, footer });
    document.getElementById('f-cancel').onclick = App.closeModal;
    document.getElementById('f-profil').onchange = (e) => {
      document.getElementById('f-bull-row').style.display = e.target.value === 'bull' ? '' : 'none';
      document.getElementById('f-v-row').style.display = e.target.value === 'v' ? '' : 'none';
      document.getElementById('f-ozel-row').style.display = e.target.value === 'ozel' ? '' : 'none';
    };
    document.getElementById('f-save').onclick = async () => {
      const kod = document.getElementById('f-kod').value.trim();
      const ad = document.getElementById('f-ad').value.trim();
      const capMm = parseFloat(document.getElementById('f-cap').value);
      if (!kod || !ad || !capMm || capMm <= 0) {
        App.toast('Kod, ad ve geçerli bir çap (>0) zorunlu', 'err');
        return;
      }
      const profilTipi = document.getElementById('f-profil').value;
      const kayit = {
        id: d.id || App.uid('CNCT'),
        kod, ad, profilTipi, capMm,
        kesmeBoyuMm: parseFloat(document.getElementById('f-kesme-boyu').value) || null,
        sapCapMm: parseFloat(document.getElementById('f-sap-cap').value) || null,
        bullYaricapMm: profilTipi === 'bull' ? (parseFloat(document.getElementById('f-bull-r').value) || null) : null,
        vAcisiDerece: profilTipi === 'v' ? (parseFloat(document.getElementById('f-v-aci').value) || null) : null,
        ozelProfilAciklama: profilTipi === 'ozel' ? document.getElementById('f-ozel-aciklama').value.trim() : '',
        maxDevirRpm: parseFloat(document.getElementById('f-max-devir').value) || null,
        maxIlerlemeMmDak: parseFloat(document.getElementById('f-max-ilerleme').value) || null,
        aciklama: document.getElementById('f-not').value.trim(),
        aktif: document.getElementById('f-aktif').checked
      };
      const list = await Store.cncTakimlari.all();
      const i = list.findIndex(k => k.id === kayit.id);
      if (i >= 0) list[i] = kayit; else list.push(kayit);
      await App.persist(() => Store.cncTakimlari.save(list));
      App.toast(isEdit ? 'Takım güncellendi' : 'Takım tanımlandı', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PageModules.cnc_takimlari;
