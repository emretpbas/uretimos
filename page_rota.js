// ════════════════════════════════════════════════════════════════════════════
// HAT & ROTA YÖNETİMİ — üretim rotası: hat/makine + taşıma adımları, süre, maliyet
// ════════════════════════════════════════════════════════════════════════════
PageModules.rota = (() => {
  let rotaList = [];
  let activeRotaId = null;   // düzenlenmekte olan rota (null = liste görünümü)
  let steps = [];            // {uid, type, kod, tanim, hat, grup, dk}
  let uidC = 0;
  let openHat = null;
  let pendingStep = null;
  let rotaMeta = { kod: '', ad: '', tip: 'urun' };

  async function render(main) {
    rotaList = await Store.rotalar.all();
    if (activeRotaId === 'NEW' || rotaList.find(r => r.id === activeRotaId)) {
      renderEditor(main);
    } else {
      renderList(main);
    }
  }

  function renderList(main) {
    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Hat & Rota Yönetimi</div>
          <div class="page-sub">Ürün/yarı mamül için üretim akışı tanımlayın: hangi hat, hangi makine, kaç dakika</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="rt-sablon" title="Panel mobilya için hazır akışlar — kendi makinelerinizle eşleştirilir">📐 Rota Şablonları</button>
          <button class="btn" id="rt-toplu" title="Bir rotayı seçilen tüm kartlara tek işlemde ata">⇉ Toplu Rota Ata</button>
          <button class="btn btn-blue" id="rt-new">+ Yeni Rota Oluştur</button>
        </div>
      </div>
      <div class="card" id="rt-list"></div>
    `;
    // ⇉ Toplu rota atama — kurulumun en yavaş adımını hızlandırır
    document.getElementById('rt-sablon').onclick = () => RotaSablon.ac(() => render(main));
    document.getElementById('rt-toplu').onclick = () => TopluRota.ac(() => render(main));
    document.getElementById('rt-new').onclick = () => {
      rotaMeta = { kod: '', ad: '', tip: 'urun' };
      steps = []; uidC = 0; openHat = null;
      activeRotaId = 'NEW';
      render(main);
    };

    const wrap = document.getElementById('rt-list');
    if (!rotaList.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="eicon">&rarr;</div><div class="etitle">Henüz rota tanımlanmadı</div><div class="edesc">Yeni rota oluşturarak hat/makine adımlarını ve sürelerini girin.</div></div>`;
      return;
    }
    let html = `<table class="dtable"><tr><th>Kod</th><th>Ad</th><th class="r">Adım</th><th class="r">Toplam Süre</th><th class="r">İşçilik Maliyeti</th><th></th></tr>`;
    rotaList.forEach(r => {
      const totalDk = (r.steps || []).reduce((a, s) => a + (s.dk || 0), 0);
      html += `<tr>
        <td class="mono">${App.escapeHtml(r.kod)}</td>
        <td>${App.escapeHtml(r.ad)}</td>
        <td class="r">${(r.steps || []).length}</td>
        <td class="r">${App.fmt(totalDk, 1)} dk</td>
        <td class="r">${App.fmtTL(r.toplamMaliyet || 0)}</td>
        <td style="display:flex;gap:4px"><button class="btn btn-sm btn-ghost rt-edit" data-id="${r.id}">Düzenle</button>
        <button class="btn btn-sm btn-ghost rt-copy" data-id="${r.id}" title="Rotayı kopyalayıp yeni rota olarak kaydet">⧉ Kopyala</button>
        <button class="btn btn-sm btn-ghost rt-sil" data-id="${r.id}" title="Rotayı sil" style="color:var(--red-text)">✗</button></td>
      </tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
    // ROTA KOPYALAMA: hat dengeleme için mevcut rotadan türetilmiş yeni rota
    wrap.querySelectorAll('.rt-copy').forEach(b => b.onclick = async () => {
      const tumRotalar = await Store.rotalar.all();
      const kaynak = tumRotalar.find(r => r.id === b.dataset.id);
      if (!kaynak) return;
      const kopya = JSON.parse(JSON.stringify(kaynak));
      kopya.id = App.uid('RT');
      kopya.kod = (kaynak.kod || 'RT') + '-K' + (tumRotalar.filter(r => (r.kod || '').startsWith((kaynak.kod || 'RT') + '-K')).length + 1);
      kopya.ad = (kaynak.ad || '') + ' (Kopya)';
      (kopya.steps || []).forEach((s, i) => s.uid = i + 1);
      tumRotalar.push(kopya);
      await App.persist(() => Store.rotalar.save(tumRotalar));
      App.toast('Rota kopyalandı: ' + kopya.kod + ' — Düzenle ile istasyonları değiştirebilirsiniz', 'ok');
      render(main);
    });

    // ── ROTA SİLME (güvenlik kontrollü) ───────────────────────────────────
    // Rota; yarı mamül kartlarında, iş emirlerinde veya aktif istasyon
    // işlerinde kullanılıyorsa silinemez — üretim takibi bozulur.
    wrap.querySelectorAll('.rt-sil').forEach(b => b.onclick = async () => {
      const rotaId = b.dataset.id;
      const [tumRotalar, yarimamuller, isemirleri, istasyonIsleri] = await Promise.all([
        Store.rotalar.all(), Store.yarimamuller.all(), Store.isemirleri.all(), Store.istasyonIsleri.all()
      ]);
      const r = tumRotalar.find(x => x.id === rotaId);
      if (!r) return;
      const engeller = [];
      const kartlar = yarimamuller.filter(y => y.rotaId === rotaId);
      if (kartlar.length) engeller.push(`<b>${kartlar.length} yarı mamül kartında</b> atanmış: ${kartlar.slice(0, 5).map(y => App.escapeHtml(y.kod)).join(', ')}`);
      const ieler = isemirleri.filter(ie => ie.durum !== 'tamamlandi' &&
        (ie.uretimListesi || []).some(k => k.rotaId === rotaId));
      if (ieler.length) engeller.push(`<b>${ieler.length} aktif iş emrinde</b> seçili: ${ieler.slice(0, 4).map(x => App.escapeHtml(x.kod)).join(', ')}`);
      const isler = istasyonIsleri.filter(x => x.rotaId === rotaId && x.durum === 'aktif');
      if (isler.length) engeller.push(`<b>${isler.length} aktif istasyon işi</b> bu rotayı kullanıyor`);

      if (engeller.length) {
        const body = document.createElement('div');
        body.innerHTML = `<div style="border:1.5px solid var(--red);background:var(--red-bg);border-radius:8px;padding:12px">
            <b style="color:var(--red-text);font-size:12.5px">🚫 Bu rota silinemez — kullanımda</b>
            <div style="font-size:11.5px;margin-top:8px">${engeller.map(e => `<div style="padding:3px 0">• ${e}</div>`).join('')}</div>
          </div>
          <div class="fhint" style="margin-top:10px">Silmek için önce bu bağlantıları kaldırın (yarı mamül kartlarından rotayı değiştirin veya iş emirlerini tamamlayın).</div>`;
        App.openModal({ title: '✗ Rota Silinemedi', body, footer: `<button class="btn" id="rs-kapat">Anladım</button>`, wide: true });
        document.getElementById('rs-kapat').onclick = App.closeModal;
        return;
      }
      App.confirmDialog(
        `<b>${App.escapeHtml(r.kod || '')} — ${App.escapeHtml(r.ad || '')}</b> rotası silinecek (${(r.steps || []).length} istasyon adımı).<br><br>` +
        `Kontrol edildi: bu rota hiçbir kartta, iş emrinde veya aktif istasyon işinde kullanılmıyor.<br><br>` +
        `<span style="color:var(--red-text)">Bu işlem geri alınamaz.</span> Onaylıyor musunuz?`,
        async () => {
          await App.persist(() => Store.rotalar.remove(rotaId));
          App.toast('Rota silindi: ' + (r.kod || ''), 'ok');
          render(main);
        });
    });

    wrap.querySelectorAll('.rt-edit').forEach(b => b.onclick = () => {
      const r = rotaList.find(x => x.id === b.dataset.id);
      rotaMeta = { kod: r.kod, ad: r.ad, tip: r.tip || 'urun' };
      steps = (r.steps || []).map(s => ({ ...s }));
      uidC = Math.max(0, ...steps.map(s => s.uid || 0)) + 1;
      openHat = null;
      activeRotaId = r.id;
      render(document.getElementById('main'));
    });
  }

  async function renderEditor(main, onSaved) {
    const ayarlar = App.state.ayarlar;
    const DK_UCRETI = ayarlar.saatlikIscilikUcreti / 60;
    let HATLAR_RUNTIME = await Store.hatlarGetir();

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">${activeRotaId === 'NEW' ? 'Yeni Rota' : 'Rota Düzenle'}</div>
          <div class="page-sub">Hat/makine seçip süre girin, rota akışını oluşturun</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="rt-back">&larr; ${onSaved ? 'Vazgeç' : 'Listeye Dön'}</button>
          <button class="btn btn-green" id="rt-save">&check; Rotayı Kaydet</button>
        </div>
      </div>

      <div class="card">
        <div class="frow">
          <div class="fgroup"><label class="flbl">Rota Kodu</label><input class="finput" id="rm-kod" value="${App.escapeHtml(rotaMeta.kod)}" placeholder="örn. JD.E17050.ROTA"></div>
          <div class="fgroup"><label class="flbl">Rota Adı</label><input class="finput" id="rm-ad" value="${App.escapeHtml(rotaMeta.ad)}" placeholder="örn. Judge Etajer Üretim Rotası"></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:280px 1fr 300px;gap:14px;margin-top:14px;align-items:start">
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:12px 14px;border-bottom:1px solid var(--border)">
            <div class="flbl" style="margin-bottom:7px">Hat / Makine Seç</div>
            <input class="finput" id="rt-search" placeholder="Ara..." style="margin-bottom:8px">
            <button class="btn btn-sm btn-green" id="rt-yeni-istasyon" style="width:100%">+ Yeni İstasyon / Hat Ekle</button>
          </div>
          <div id="rt-transport-add" style="margin:10px 12px;padding:9px 12px;background:var(--amber-bg);border:1.5px dashed var(--amber);border-radius:8px;cursor:pointer;font-size:11.5px;font-weight:700;color:var(--amber-text)">Ara Taşıma Adımı Ekle</div>
          <div id="rt-hat-list" style="max-height:540px;overflow-y:auto;padding-bottom:10px"></div>
        </div>

        <div class="card" id="rt-steps-wrap" style="min-height:300px"></div>

        <div class="card" id="rt-right-panel"></div>
      </div>
    `;

    document.getElementById('rt-back').onclick = () => { activeRotaId = null; if (onSaved) onSaved(null); else render(main); };
    document.getElementById('rt-save').onclick = () => saveRota(onSaved);
    document.getElementById('rt-transport-add').onclick = addTransport;
    document.getElementById('rt-search').oninput = (e) => buildHatList(e.target.value);
    document.getElementById('rt-yeni-istasyon').onclick = () => openYeniIstasyonForm();

    buildHatList();
    renderSteps();
    renderRightPanel(DK_UCRETI);

    // Yeni istasyon/hat ekleme: mevcut bir hata yeni makina eklenebilir,
    // veya tamamen yeni bir hat adı girilip altına ilk makina eklenebilir.
    // Kaydedilince Store.hatlarKaydet ile KALICI olarak storage'a yazılır —
    // bundan sonra tüm rota ekranlarında ve sihirbazlarda görünür.
    function openYeniIstasyonForm() {
      const hatAdlari = Object.keys(HATLAR_RUNTIME);
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fgroup"><label class="flbl">Hat Seç (veya yeni hat adı yazın)</label>
          <input class="finput" id="yi-hat" list="yi-hat-list" placeholder="örn. BANYO MAKİNE HATTI veya yeni bir hat adı">
          <datalist id="yi-hat-list">${hatAdlari.map(h => `<option value="${App.escapeHtml(h)}">`).join('')}</datalist>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Makina/İstasyon Kodu</label><input class="finput" id="yi-kod" placeholder="örn. CNC.02"></div>
          <div class="fgroup"><label class="flbl">Grup</label><input class="finput" id="yi-grup" placeholder="örn. CNC İŞLEM MERKEZLERİ"></div>
        </div>
        <div class="fgroup"><label class="flbl">Tanım / Açıklama</label><input class="finput" id="yi-tanim" placeholder="örn. BIESSE ROVER B 1638 CNC İŞLEM MERKEZİ"></div>
      `;
      const footer = `<button class="btn" id="yi-cancel">Vazgeç</button><button class="btn btn-green" id="yi-save">İstasyonu Ekle</button>`;
      App.openModal({ title: 'Yeni İstasyon / Hat Ekle', body, footer, wide: true });
      document.getElementById('yi-cancel').onclick = App.closeModal;
      document.getElementById('yi-save').onclick = async () => {
        const hat = document.getElementById('yi-hat').value.trim();
        const kod = document.getElementById('yi-kod').value.trim();
        const tanim = document.getElementById('yi-tanim').value.trim();
        const grup = document.getElementById('yi-grup').value.trim() || 'GENEL';
        if (!hat || !kod || !tanim) { App.toast('Hat, kod ve tanım zorunlu', 'err'); return; }
        if (!HATLAR_RUNTIME[hat]) HATLAR_RUNTIME[hat] = [];
        if (HATLAR_RUNTIME[hat].some(m => m.kod === kod)) { App.toast('Bu kod zaten bu hatta tanımlı', 'err'); return; }
        HATLAR_RUNTIME[hat].push({ kod, tanim, grup });
        await App.persist(() => Store.hatlarKaydet(HATLAR_RUNTIME));
        App.toast('Yeni istasyon eklendi: ' + kod + ' (' + hat + ')', 'ok');
        App.closeModal();
        openHat = hat;
        buildHatList(document.getElementById('rt-search').value);
      };
    }

    function buildHatList(filter) {
      const el = document.getElementById('rt-hat-list');
      el.innerHTML = '';
      const f = (filter || '').toLowerCase();
      Object.entries(HATLAR_RUNTIME).forEach(([hat, maks]) => {
        const vis = f ? maks.filter(m => m.kod.toLowerCase().includes(f) || m.tanim.toLowerCase().includes(f) || hat.toLowerCase().includes(f)) : maks;
        if (f && vis.length === 0) return;
        const grpEl = document.createElement('div');
        grpEl.style.borderBottom = '1px solid var(--border)';
        const hdr = document.createElement('div');
        hdr.style.cssText = 'padding:7px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;background:' + (openHat === hat ? 'var(--blue-bg)' : 'var(--bg)');
        hdr.innerHTML = `<span style="font-size:12px;font-weight:700;color:${openHat === hat ? 'var(--blue-text)' : 'var(--text)'}">${hat}</span><span class="pill pill-gray">${maks.length}</span>`;
        hdr.onclick = () => { openHat = openHat === hat ? null : hat; buildHatList(document.getElementById('rt-search').value); };
        grpEl.appendChild(hdr);
        if (openHat === hat || f) {
          const groups = {};
          vis.forEach(m => { if (!groups[m.grup]) groups[m.grup] = []; groups[m.grup].push(m); });
          Object.entries(groups).forEach(([g, ms]) => {
            const gl = document.createElement('div');
            gl.style.cssText = 'padding:5px 14px 2px 22px;font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase';
            gl.textContent = g;
            grpEl.appendChild(gl);
            ms.forEach(m => {
              const mi = document.createElement('div');
              mi.style.cssText = 'padding:6px 14px 6px 22px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(0,0,0,.04)';
              mi.innerHTML = `<div style="flex:1;min-width:0"><div style="font-size:10px;font-weight:700;color:var(--text3)" class="mono">${m.kod}</div><div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.tanim}</div></div><span style="font-size:9px;color:var(--text3);flex-shrink:0">+ ekle</span>`;
              mi.onmouseenter = () => mi.style.background = 'var(--bg)';
              mi.onmouseleave = () => mi.style.background = '';
              mi.onclick = () => askDk({ type: 'machine', kod: m.kod, tanim: m.tanim, hat, grup: m.grup });
              grpEl.appendChild(mi);
            });
          });
        }
        el.appendChild(grpEl);
      });
    }

    function askDk(stepObj) {
      pendingStep = stepObj;
      const sira = steps.length + 1;
      const body = `
        <div style="margin-bottom:10px"><strong class="mono">${stepObj.kod}</strong><br>${App.escapeHtml(stepObj.tanim)}${stepObj.hat !== 'TAŞIMA' ? `<br><span style="font-size:10px;color:var(--text3)">${stepObj.hat}</span>` : ''}</div>
        <div class="fgroup"><label class="flbl">Süre (dakika)</label><input class="finput" id="dk-input" type="number" min="0" step="0.5" autofocus></div>
        <div id="dk-preview" style="font-size:11px;color:var(--text3)">0 dakika girildi</div>`;
      const footer = `<button class="btn" id="dk-cancel">Vazgeç</button><button class="btn btn-blue" id="dk-ok">Ekle</button>`;
      App.openModal({ title: `Adım ${sira} — Süre Girişi`, body, footer });
      const inp = document.getElementById('dk-input');
      const updatePrev = () => {
        const dk = parseFloat(inp.value) || 0;
        const sa = dk / 60, mal = dk * DK_UCRETI;
        document.getElementById('dk-preview').textContent = dk > 0 ? `${dk} dk = ${sa.toFixed(3)} saat → ₺${mal.toFixed(2)} maliyet` : '0 dakika girildi';
      };
      inp.oninput = updatePrev;
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmStep(); } };
      setTimeout(() => inp.focus(), 60);
      document.getElementById('dk-cancel').onclick = App.closeModal;
      document.getElementById('dk-ok').onclick = confirmStep;
      function confirmStep() {
        const dk = parseFloat(inp.value) || 0;
        steps.push({ uid: ++uidC, ...pendingStep, dk });
        pendingStep = null;
        App.closeModal();
        renderSteps(); renderRightPanel(DK_UCRETI);
      }
    }

    function addTransport() {
      const n = steps.filter(s => s.type === 'transport').length + 1;
      askDk({ type: 'transport', kod: 'TAS.' + String(n).padStart(2, '0'), tanim: 'Ara Taşıma-' + n, hat: 'TAŞIMA', grup: 'TAŞIMA' });
    }

    function renderSteps() {
      const wrap = document.getElementById('rt-steps-wrap');
      if (!steps.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="eicon">&rarr;</div><div class="etitle">Rota boş</div><div class="edesc">Soldan bir hat/makine seçerek adım ekleyin.</div></div>`;
        return;
      }
      let html = `<div class="flbl" style="margin-bottom:10px">Rota Akışı (${steps.length} adım)</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">`;
      steps.forEach((s, i) => {
        if (i > 0) html += `<span style="color:var(--text3);align-self:center">&rarr;</span>`;
        html += `<span class="pill ${s.type === 'transport' ? 'pill-amber' : 'pill-blue'}"><b>${i + 1}</b> ${s.type === 'transport' ? '[T] ' : ''}${s.kod}</span>`;
      });
      html += `</div><div class="hr"></div><div style="display:flex;flex-direction:column;gap:10px">`;
      steps.forEach((s, i) => {
        const saat = s.dk / 60, mal = (s.dk * DK_UCRETI).toFixed(2);
        html += `<div class="card" style="padding:11px 13px;${s.type === 'transport' ? 'border-color:#f3d199;background:var(--amber-bg)' : ''}">
          <div class="flex-gap">
            <span class="pill pill-gray" style="width:20px;height:20px;justify-content:center;border-radius:50%">${i + 1}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:11.5px;font-weight:800" class="mono">${s.type === 'transport' ? '[Taşıma] ' : ''}${s.kod}</div>
              <div style="font-size:11px;color:var(--text2)">${App.escapeHtml(s.tanim)}</div>
            </div>
            <span class="pill ${s.type === 'transport' ? 'pill-amber' : 'pill-blue'}">${s.hat}</span>
            <button class="btn btn-icon btn-ghost rt-up" data-uid="${s.uid}" title="Yukarı">&uarr;</button>
            <button class="btn btn-icon btn-ghost rt-down" data-uid="${s.uid}" title="Aşağı">&darr;</button>
            <button class="btn btn-icon btn-ghost rt-editdk" data-uid="${s.uid}" title="Süreyi düzenle" style="color:var(--blue)">&#9998;</button>
            <button class="btn btn-icon btn-ghost rt-del" data-uid="${s.uid}" title="Sil" style="color:var(--red-text)">&times;</button>
          </div>
          <div style="display:flex;gap:18px;margin-top:8px;font-size:11px;color:var(--text3)">
            <div>Süre: <b style="color:var(--text)">${s.dk} dk</b> (${saat.toFixed(3)} sa)</div>
            <div>Maliyet: <b style="color:var(--green-text)">₺${mal}</b></div>
          </div>
        </div>`;
      });
      html += `</div>`;
      wrap.innerHTML = html;
      wrap.querySelectorAll('.rt-up').forEach(b => b.onclick = () => moveStep(b.dataset.uid, -1));
      wrap.querySelectorAll('.rt-down').forEach(b => b.onclick = () => moveStep(b.dataset.uid, 1));
      wrap.querySelectorAll('.rt-del').forEach(b => b.onclick = () => { steps = steps.filter(s => s.uid !== parseInt(b.dataset.uid)); renderSteps(); renderRightPanel(DK_UCRETI); });
      wrap.querySelectorAll('.rt-editdk').forEach(b => b.onclick = () => editDk(parseInt(b.dataset.uid)));
    }

    function moveStep(uidStr, dir) {
      const uidNum = parseInt(uidStr);
      const i = steps.findIndex(s => s.uid === uidNum); if (i < 0) return;
      const ni = i + dir; if (ni < 0 || ni >= steps.length) return;
      [steps[i], steps[ni]] = [steps[ni], steps[i]];
      renderSteps(); renderRightPanel(DK_UCRETI);
    }

    function editDk(uidNum) {
      const s = steps.find(x => x.uid === uidNum); if (!s) return;
      const body = `<div style="margin-bottom:10px"><strong class="mono">${s.kod}</strong><br>${App.escapeHtml(s.tanim)}</div>
        <div class="fgroup"><label class="flbl">Süre (dakika)</label><input class="finput" id="dk-input2" type="number" min="0" step="0.5" value="${s.dk}"></div>`;
      const footer = `<button class="btn" id="dk-cancel2">Vazgeç</button><button class="btn btn-blue" id="dk-ok2">Güncelle</button>`;
      App.openModal({ title: 'Süre Düzenle', body, footer });
      setTimeout(() => document.getElementById('dk-input2').focus(), 60);
      document.getElementById('dk-cancel2').onclick = App.closeModal;
      document.getElementById('dk-ok2').onclick = () => {
        s.dk = parseFloat(document.getElementById('dk-input2').value) || 0;
        App.closeModal(); renderSteps(); renderRightPanel(DK_UCRETI);
      };
    }

    function renderRightPanel(DK_UCRETI) {
      const rb = document.getElementById('rt-right-panel');
      if (!steps.length) {
        rb.innerHTML = `<div class="flbl" style="margin-bottom:10px">Maliyet Özeti</div><div class="empty-state" style="padding:24px 6px"><div class="edesc">Adım eklenince özet görünür</div></div>`;
        return;
      }
      const totalDk = steps.reduce((a, s) => a + s.dk, 0);
      const totalMal = steps.reduce((a, s) => a + s.dk * DK_UCRETI, 0);
      const hatMap = {};
      steps.forEach(s => { const k = s.hat; if (!hatMap[k]) hatMap[k] = { dk: 0, mal: 0, cnt: 0 }; hatMap[k].dk += s.dk; hatMap[k].mal += s.dk * DK_UCRETI; hatMap[k].cnt++; });

      let html = `
        <div style="background:var(--blue-bg);border-radius:10px;padding:14px;margin-bottom:14px">
          <div class="flbl" style="color:var(--blue-text);opacity:.7">Toplam İşçilik Maliyeti</div>
          <div style="font-size:22px;font-weight:800;color:var(--blue-text)">₺${totalMal.toFixed(2)}</div>
          <div style="font-size:11px;color:var(--blue-text);opacity:.7">${totalDk.toFixed(1)} dk · ${(totalDk / 60).toFixed(3)} sa · ${steps.length} adım</div>
        </div>
        <div class="flbl" style="margin-bottom:8px">Hat Bazlı Dağılım</div>`;
      Object.entries(hatMap).forEach(([hat, d]) => {
        const pct = totalMal > 0 ? d.mal / totalMal * 100 : 0;
        html += `<div style="margin-bottom:9px">
          <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:3px"><span>${hat}</span><span class="mono">₺${d.mal.toFixed(2)}</span></div>
          <div style="height:5px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct.toFixed(1)}%;background:var(--blue)"></div></div>
          <div style="font-size:9px;color:var(--text3);margin-top:1px">${d.dk.toFixed(1)} dk · %${pct.toFixed(1)}</div>
        </div>`;
      });
      rb.innerHTML = html;
    }
  }

  async function saveRota(onSaved) {
    const kod = document.getElementById('rm-kod').value.trim();
    const ad = document.getElementById('rm-ad').value.trim();
    if (!kod || !ad) { App.toast('Rota kodu ve adı zorunlu', 'err'); return; }
    const totalMal = steps.reduce((a, s) => a + s.dk * (App.state.ayarlar.saatlikIscilikUcreti / 60), 0);
    const rota = {
      id: activeRotaId === 'NEW' ? App.uid('RT') : activeRotaId,
      kod, ad, tip: rotaMeta.tip,
      steps: steps.map(s => ({ ...s })),
      toplamSureDk: steps.reduce((a, s) => a + s.dk, 0),
      toplamMaliyet: totalMal
    };
    await App.persist(() => Store.rotalar.upsert(rota));
    App.toast('Rota kaydedildi', 'ok');
    activeRotaId = null;
    if (onSaved) onSaved(rota);
    else render(document.getElementById('main'));
  }

  // Reçete Yap ekranı veya Sıfırdan Ürün sihirbazı İÇİNDEN (başka sayfaya
  // gitmeden) rota oluşturma/düzenleme modalı açar. Aynı renderEditor
  // mantığını, modal'ın body alanına render ederek kullanır — istasyon/hat
  // seçimi, yeni istasyon ekleme, taşıma adımı, süre girişi hepsi aynen
  // çalışır. Kaydedilince onSaved(rota) çağrılır, kapatılırsa onSaved(null).
  function openRotaEditorModal(mevcutRota, onSaved) {
    if (mevcutRota) {
      rotaMeta = { kod: mevcutRota.kod, ad: mevcutRota.ad, tip: mevcutRota.tip || 'urun' };
      steps = (mevcutRota.steps || []).map(s => ({ ...s }));
      uidC = Math.max(0, ...steps.map(s => s.uid || 0)) + 1;
      activeRotaId = mevcutRota.id;
    } else {
      rotaMeta = { kod: '', ad: '', tip: 'urun' };
      steps = []; uidC = 0;
      activeRotaId = 'NEW';
    }
    openHat = null;
    const overlay = document.createElement('div');
    overlay.id = 'rt-modal-overlay';
    overlay.className = 'app-embed-overlay';
    // z-index: App.yeniZIndexAl() ile DİNAMİK olarak alınır — bu pencere ne
    // zaman açılırsa, o anda var olan TÜM diğer pencerelerden (sihirbaz dahil)
    // daha üstte görünür. Sabit bir değer kullanılırsa, "sihirbaz içinden rota
    // aç" ile "rota içinden süre formu aç" senaryoları birbirini bozar (biri
    // her zaman üstte olmalıyken diğeri her zaman üstte kalır) — bkz. app.js
    // içindeki zIndexSayaci açıklaması.
    const z = App.yeniZIndexAl();
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:${z};display:flex;align-items:center;justify-content:center;padding:20px`;
    const panel = document.createElement('div');
    panel.style.cssText = 'background:var(--bg-card,#fff);border-radius:14px;padding:20px;width:100%;max-width:1200px;max-height:92vh;overflow-y:auto';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    renderEditor(panel, (rota) => {
      overlay.remove();
      if (onSaved) onSaved(rota);
    });
  }

  return { render, openRotaEditorModal };
})();
