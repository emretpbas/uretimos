// ════════════════════════════════════════════════════════════════════════════
// OPERASYON YÖNETİMİ — beş modül tek sayfada
//   1) Vardiyalar        : kapasite tabanı (KPI/OEE bunu kullanır)
//   2) Lot / Parti Takibi: hammadde girişinden ürüne izlenebilirlik zinciri
//   3) Envanter Sayımı   : sistem vs fiili stok, fark analizi, düzeltme
//   4) Tedarikçi Karnesi : teslim performansı, kalite reddi, fiyat istikrarı
//   5) Plan vs Fiili     : reçete maliyeti ile gerçekleşen maliyet farkı
// ════════════════════════════════════════════════════════════════════════════
PageModules.operasyon = (() => {
  let activeTab = 'vardiya';

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Operasyon Yönetimi</div>
        <div class="page-sub">Vardiya, parti izlenebilirliği, envanter sayımı, tedarikçi karnesi ve maliyet sapma analizi</div></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'vardiya' ? 'active' : ''}" data-tab="vardiya">🕐 Vardiyalar</div>
        <div class="tab ${activeTab === 'lot' ? 'active' : ''}" data-tab="lot">🔖 Lot / Parti Takibi</div>
        <div class="tab ${activeTab === 'sayim' ? 'active' : ''}" data-tab="sayim">📋 Envanter Sayımı</div>
        <div class="tab ${activeTab === 'tedarikci' ? 'active' : ''}" data-tab="tedarikci">🏅 Tedarikçi Karnesi</div>
        <div class="tab ${activeTab === 'maliyet' ? 'active' : ''}" data-tab="maliyet">💹 Plan vs Fiili Maliyet</div>
      </div>
      <div id="op-content"><div style="padding:40px;text-align:center"><div class="loading-spin" style="margin:0 auto"></div></div></div>`;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const c = document.getElementById('op-content');
    if (activeTab === 'vardiya') await renderVardiya(c, render, main);
    else if (activeTab === 'lot') await renderLot(c, render, main);
    else if (activeTab === 'sayim') await renderSayim(c, render, main);
    else if (activeTab === 'tedarikci') await renderTedarikci(c);
    else await renderMaliyet(c);
  }

  // ══ 1) VARDİYALAR ═══════════════════════════════════════════════════════
  async function renderVardiya(c, render, main) {
    const [vardiyalar, rotalar, duzeltmeler] = await Promise.all([
      Store.vardiyalar.all(), Store.rotalar.all(), Store.kapasiteDuzeltmeleri.all()
    ]);
    const hatlar = [...new Set(rotalar.flatMap(r => (r.steps || []).map(s => s.hat)).filter(h => h && h !== 'TAŞIMA'))].sort();
    const aktif = vardiyalar.filter(v => v.aktif !== false);
    const toplamDk = aktif.reduce((a, v) => a + (v.netCalismaDk || 0), 0);
    const bugun = new Date().toISOString().slice(0, 10);
    // Geçmiş düzeltmeler arşiv sayılır — varsayılan görünümde yalnızca
    // bugün ve ileri tarihli olanlar gösterilir (liste zamanla şişmesin).
    const guncelDuzeltmeler = [...duzeltmeler].filter(d => d.tarih >= bugun).sort((a, b) => a.tarih.localeCompare(b.tarih));
    const gecmisSayisi = duzeltmeler.length - guncelDuzeltmeler.length;

    c.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Aktif Vardiya</div><div class="kpi-val blue">${aktif.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Günlük Net Kapasite (taban)</div><div class="kpi-val green">${App.fmt(toplamDk / 60, 1)} saat</div>
          <div class="muted" style="font-size:10.5px">Hat başına ${toplamDk} dk</div></div>
        <div class="kpi"><div class="kpi-lbl">Tanımlı Hat</div><div class="kpi-val purple">${hatlar.length}</div></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="card-hdr"><div class="card-title">Vardiya Tanımları</div>
          <button class="btn btn-sm btn-blue" id="op-vardiya-ekle">+ Vardiya Ekle</button></div>
        <div class="fhint" style="margin-bottom:8px">KPI panelindeki <b>Kapasite Kullanımı</b> ve <b>OEE</b> hesabı bu vardiya sürelerini taban alır. Vardiya tanımlanmazsa tek vardiya (8 saat) varsayılır — çift vardiya çalışıyorsanız mutlaka tanımlayın. <b>Kalıcı</b> bir kapasite artışı (yeni bir vardiya AÇILDIYSA, sürekli geçerli olacaksa) buraya girilir.</div>
        ${vardiyalar.length ? `<table class="dtable" style="font-size:11.5px">
          <tr><th>Vardiya</th><th>Saat</th><th class="r">Brüt</th><th class="r">Mola</th><th class="r">Net Çalışma</th><th>Hatlar</th><th>Durum</th><th></th></tr>
          ${vardiyalar.map(v => `<tr${v.aktif === false ? ' style="opacity:.5"' : ''}>
            <td><b>${App.escapeHtml(v.ad)}</b></td>
            <td class="mono" style="font-size:10.5px">${App.escapeHtml(v.baslangic || '')} – ${App.escapeHtml(v.bitis || '')}</td>
            <td class="r">${v.brutDk || 0} dk</td>
            <td class="r">${v.molaDk || 0} dk</td>
            <td class="r"><b>${v.netCalismaDk || 0} dk</b></td>
            <td style="font-size:10.5px">${(v.hatlar || []).length ? App.escapeHtml((v.hatlar || []).join(', ')) : '<span class="muted">Tüm hatlar</span>'}</td>
            <td><span class="pill ${v.aktif === false ? 'pill-gray' : 'pill-green'}" style="font-size:9.5px">${v.aktif === false ? 'Pasif' : 'Aktif'}</span></td>
            <td style="display:flex;gap:4px">
              <button class="btn btn-sm btn-ghost op-v-duzenle" data-id="${v.id}">Düzenle</button>
              <button class="btn btn-sm btn-ghost op-v-sil" data-id="${v.id}" style="color:var(--red-text)">&times;</button></td>
          </tr>`).join('')}</table>`
        : `<div class="empty-state" style="padding:24px"><div class="edesc">Henüz vardiya tanımlanmadı — kapasite hesabı tek vardiya (480 dk) varsayımıyla yapılıyor.</div></div>`}
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">📅 Günlük Kapasite Düzeltmeleri</div>
          <button class="btn btn-sm btn-blue" id="op-duzeltme-ekle">+ Düzeltme Ekle</button></div>
        <div class="fhint" style="margin-bottom:8px">Belirli bir GÜN için GEÇİCİ artış/azalış (fazla mesai, arıza, planlı duruş, tek seferlik ek vardiya). <b>Kalıcı</b> bir değişiklik için yukarıdan Vardiya ekleyin/düzenleyin — bu liste yalnızca seçtiğiniz tek günü etkiler ve Üretim Çizelgesi'nde anında yansır.</div>
        ${guncelDuzeltmeler.length ? `<table class="dtable" style="font-size:11.5px">
          <tr><th>Tarih</th><th>Hat</th><th class="r">Dakika Farkı</th><th>Açıklama</th><th>Ekleyen</th><th></th></tr>
          ${guncelDuzeltmeler.map(d => `<tr${d.tarih === bugun ? ' style="background:var(--blue-bg)"' : ''}>
            <td class="mono" style="font-size:10.5px">${App.escapeHtml(d.tarih)}${d.tarih === bugun ? ' <span class="pill pill-blue" style="font-size:8.5px">BUGÜN</span>' : ''}</td>
            <td><b>${App.escapeHtml(d.hat)}</b></td>
            <td class="r"><b style="color:var(--${d.dakikaFarki >= 0 ? 'green' : 'red'}-text)">${d.dakikaFarki >= 0 ? '+' : ''}${d.dakikaFarki} dk</b></td>
            <td style="font-size:10.5px">${App.escapeHtml(d.aciklama || '')}</td>
            <td style="font-size:10.5px" class="muted">${App.escapeHtml(d.olusturan || '')}</td>
            <td><button class="btn btn-sm btn-ghost op-d-sil" data-id="${d.id}" style="color:var(--red-text)">&times;</button></td>
          </tr>`).join('')}</table>`
        : `<div class="empty-state" style="padding:20px"><div class="edesc">Bugün veya ileri tarihli bir kapasite düzeltmesi yok.</div></div>`}
        ${gecmisSayisi ? `<div class="muted" style="font-size:10.5px;margin-top:8px">${gecmisSayisi} geçmiş düzeltme (arşiv, listede gösterilmiyor)</div>` : ''}
      </div>`;

    document.getElementById('op-vardiya-ekle').onclick = () => vardiyaFormu(null, hatlar, render, main);
    c.querySelectorAll('.op-v-duzenle').forEach(b => b.onclick = () =>
      vardiyaFormu(vardiyalar.find(v => v.id === b.dataset.id), hatlar, render, main));
    c.querySelectorAll('.op-v-sil').forEach(b => b.onclick = () => {
      const v = vardiyalar.find(x => x.id === b.dataset.id);
      App.confirmDialog(`<b>${App.escapeHtml(v.ad)}</b> vardiyası silinecek. Kapasite hesabı değişecektir. Onaylıyor musunuz?`, async () => {
        await App.persist(() => Store.vardiyalar.save(vardiyalar.filter(x => x.id !== v.id)));
        App.toast('Vardiya silindi', 'ok');
        render(main);
      });
    });

    document.getElementById('op-duzeltme-ekle').onclick = () => duzeltmeFormu(hatlar, render, main);
    c.querySelectorAll('.op-d-sil').forEach(b => b.onclick = () => {
      const d = duzeltmeler.find(x => x.id === b.dataset.id);
      App.confirmDialog(`${App.escapeHtml(d.hat)} — ${App.escapeHtml(d.tarih)} tarihli kapasite düzeltmesi silinecek. Onaylıyor musunuz?`, async () => {
        await App.persist(() => Store.kapasiteDuzeltmeleri.save(duzeltmeler.filter(x => x.id !== d.id)));
        App.toast('Kapasite düzeltmesi silindi', 'ok');
        render(main);
      });
    });
  }

  function duzeltmeFormu(hatlar, render, main) {
    const bugun = new Date().toISOString().slice(0, 10);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup" style="flex:1.2"><label class="flbl">Hat <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="kd-hat">
            <option value="">— seçin —</option>
            ${hatlar.map(h => `<option value="${App.escapeHtml(h)}">${App.escapeHtml(h)}</option>`).join('')}
          </select></div>
        <div class="fgroup"><label class="flbl">Tarih <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="kd-tarih" type="date" value="${bugun}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Dakika Farkı <span style="color:var(--red-text)">*</span></label>
        <input class="finput" id="kd-dakika" type="number" placeholder="örn. 120 (artış) veya -180 (azalış)">
        <div class="fhint">Pozitif = ek kapasite (fazla mesai, ek vardiya) · Negatif = kayıp kapasite (arıza, planlı duruş)</div></div>
      <div class="fgroup"><label class="flbl">Açıklama</label>
        <input class="finput" id="kd-aciklama" placeholder="örn. Pres arızası, 3 saat duruş"></div>`;
    App.openModal({ title: '📅 Kapasite Düzeltmesi Ekle', body,
      footer: `<button class="btn" id="kd-cancel">Vazgeç</button><button class="btn btn-blue" id="kd-ok">Kaydet</button>` });
    document.getElementById('kd-cancel').onclick = App.closeModal;
    document.getElementById('kd-ok').onclick = async () => {
      const hat = document.getElementById('kd-hat').value;
      const tarih = document.getElementById('kd-tarih').value;
      const dakika = parseInt(document.getElementById('kd-dakika').value);
      if (!hat) { App.toast('Hat seçimi zorunlu', 'err'); return; }
      if (!tarih) { App.toast('Tarih zorunlu', 'err'); return; }
      if (!dakika || isNaN(dakika)) { App.toast('Dakika farkı zorunlu ve 0 olamaz', 'err'); return; }
      const tumu = await Store.kapasiteDuzeltmeleri.all();
      tumu.push({
        id: App.uid('KD'), hat, tarih, dakikaFarki: dakika,
        aciklama: document.getElementById('kd-aciklama').value.trim(),
        olusturan: App.aktifRol(), olusturmaTarihi: new Date().toISOString()
      });
      await App.persist(() => Store.kapasiteDuzeltmeleri.save(tumu));
      App.toast(`Kapasite düzeltmesi kaydedildi: ${hat} · ${tarih} · ${dakika >= 0 ? '+' : ''}${dakika} dk`, 'ok');
      App.closeModal();
      render(main);
    };
  }

  function vardiyaFormu(v, hatlar, render, main) {
    const d = v || { ad: '', baslangic: '08:00', bitis: '17:00', molaDk: 60, hatlar: [], aktif: true };
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup" style="flex:1.3"><label class="flbl">Vardiya Adı <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="vd-ad" value="${App.escapeHtml(d.ad)}" placeholder="örn. 1. Vardiya"></div>
        <div class="fgroup"><label class="flbl">Başlangıç</label><input class="finput vd-saat" id="vd-bas" type="time" value="${d.baslangic}"></div>
        <div class="fgroup"><label class="flbl">Bitiş</label><input class="finput vd-saat" id="vd-bit" type="time" value="${d.bitis}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Mola (dk)</label><input class="finput vd-saat" id="vd-mola" type="number" min="0" value="${d.molaDk || 0}"></div>
        <div class="fgroup"><label class="flbl">Net Çalışma</label>
          <input class="finput" id="vd-net" readonly style="background:var(--bg)"></div>
        <div class="fgroup"><label class="flbl">Durum</label>
          <select class="fselect" id="vd-aktif">
            <option value="1" ${d.aktif !== false ? 'selected' : ''}>Aktif</option>
            <option value="0" ${d.aktif === false ? 'selected' : ''}>Pasif</option></select></div>
      </div>
      <div class="fgroup"><label class="flbl">Bu Vardiyanın Çalıştığı Hatlar</label>
        <div class="fhint" style="margin-bottom:6px">Hiçbiri seçilmezse vardiya <b>tüm hatlar</b> için geçerli sayılır.</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:140px;overflow:auto">
          ${hatlar.map(h => `<label style="display:flex;align-items:center;gap:4px;font-size:11.5px;background:var(--bg);padding:4px 8px;border-radius:6px">
            <input type="checkbox" class="vd-hat" value="${App.escapeHtml(h)}" ${(d.hatlar || []).includes(h) ? 'checked' : ''}>${App.escapeHtml(h)}</label>`).join('') || '<span class="muted" style="font-size:11px">Rotalarda hat tanımı yok</span>'}
        </div></div>`;
    App.openModal({ title: v ? 'Vardiya Düzenle' : 'Yeni Vardiya', body,
      footer: `<button class="btn" id="vd-cancel">Vazgeç</button><button class="btn btn-blue" id="vd-ok">Kaydet</button>`, wide: true });

    const netHesapla = () => {
      const [bh, bm] = (document.getElementById('vd-bas').value || '0:0').split(':').map(Number);
      const [eh, em] = (document.getElementById('vd-bit').value || '0:0').split(':').map(Number);
      let brut = (eh * 60 + em) - (bh * 60 + bm);
      if (brut < 0) brut += 24 * 60; // gece vardiyası
      const net = Math.max(0, brut - (parseInt(document.getElementById('vd-mola').value) || 0));
      document.getElementById('vd-net').value = net + ' dk (' + (net / 60).toFixed(1) + ' saat)';
      return { brut, net };
    };
    body.querySelectorAll('.vd-saat').forEach(i => i.oninput = netHesapla);
    netHesapla();

    document.getElementById('vd-cancel').onclick = App.closeModal;
    document.getElementById('vd-ok').onclick = async () => {
      const ad = document.getElementById('vd-ad').value.trim();
      if (!ad) { App.toast('Vardiya adı zorunlu', 'err'); return; }
      const { brut, net } = netHesapla();
      const tumu = await Store.vardiyalar.all();
      const kayit = {
        id: (v && v.id) || App.uid('VRD'), ad,
        baslangic: document.getElementById('vd-bas').value,
        bitis: document.getElementById('vd-bit').value,
        molaDk: parseInt(document.getElementById('vd-mola').value) || 0,
        brutDk: brut, netCalismaDk: net,
        hatlar: [...body.querySelectorAll('.vd-hat:checked')].map(x => x.value),
        aktif: document.getElementById('vd-aktif').value === '1'
      };
      const i = tumu.findIndex(x => x.id === kayit.id);
      if (i >= 0) tumu[i] = kayit; else tumu.push(kayit);
      await App.persist(() => Store.vardiyalar.save(tumu));
      App.toast('Vardiya kaydedildi: ' + ad + ' (' + net + ' dk net)', 'ok');
      App.closeModal();
      render(main);
    };
  }

  // ══ 2) LOT / PARTİ TAKİBİ ═══════════════════════════════════════════════
  async function renderLot(c, render, main) {
    const [lotlar, hareketler, hammaddeler] = await Promise.all([
      Store.lotlar.all(), Store.lotHareketleri.all(), Store.hammaddeler.all()]);
    const acik = lotlar.filter(l => (l.kalanMiktar || 0) > 0);

    c.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Kayıtlı Parti</div><div class="kpi-val blue">${lotlar.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Stokta Parti</div><div class="kpi-val green">${acik.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Tüketim Hareketi</div><div class="kpi-val purple">${hareketler.length}</div></div>
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">Parti / Lot Kayıtları</div>
          <button class="btn btn-sm btn-blue" id="op-lot-ekle">+ Parti Girişi</button></div>
        <div class="fhint" style="margin-bottom:8px">Hammadde girişinde parti numarası kaydedin — üretimde tüketildiğinde hangi siparişe gittiği izlenir. Mobilyada <b>aynı kodun farklı partisi farklı renk tonu</b> demektir; müşteri şikâyetinde kaynağı buradan bulursunuz.</div>
        <input class="finput" id="op-lot-ara" placeholder="🔍 Parti no, malzeme kodu veya tedarikçi ara" style="margin-bottom:10px">
        ${lotlar.length ? `<table class="dtable" style="font-size:11.5px" id="op-lot-tablo">
          <tr><th>Parti No</th><th>Malzeme</th><th>Tedarikçi</th><th>Giriş</th><th class="r">Giren</th><th class="r">Kalan</th><th>Durum</th><th></th></tr>
          ${lotlar.sort((a, b) => (b.girisTarihi || '').localeCompare(a.girisTarihi || '')).map(l => {
            const kalan = l.kalanMiktar || 0;
            const tuketildi = kalan <= 0;
            return `<tr class="op-lot-satir" data-ara="${App.escapeHtml(((l.lotNo || '') + ' ' + (l.malzemeKod || '') + ' ' + (l.malzemeAd || '') + ' ' + (l.tedarikciAdi || '')).toLowerCase())}"${tuketildi ? ' style="opacity:.55"' : ''}>
              <td><b class="mono">${App.escapeHtml(l.lotNo)}</b></td>
              <td><span class="mono" style="font-size:10.5px">${App.escapeHtml(l.malzemeKod || '')}</span><br><span class="muted" style="font-size:10px">${App.escapeHtml(l.malzemeAd || '')}</span></td>
              <td style="font-size:10.5px">${App.escapeHtml(l.tedarikciAdi || '—')}</td>
              <td style="font-size:10.5px">${l.girisTarihi || '—'}</td>
              <td class="r">${App.fmt(l.girenMiktar || 0, 2)} ${App.escapeHtml(l.birim || '')}</td>
              <td class="r"><b>${App.fmt(kalan, 2)}</b></td>
              <td><span class="pill ${tuketildi ? 'pill-gray' : 'pill-green'}" style="font-size:9.5px">${tuketildi ? 'Tükendi' : 'Stokta'}</span></td>
              <td><button class="btn btn-sm btn-ghost op-lot-izle" data-id="${l.id}">🔍 İzle</button></td>
            </tr>`;
          }).join('')}</table>`
        : `<div class="empty-state" style="padding:24px"><div class="edesc">Henüz parti kaydı yok. Hammadde girişlerinde parti numarası girerek izlenebilirliği başlatın.</div></div>`}
      </div>`;

    const ara = document.getElementById('op-lot-ara');
    if (ara) ara.oninput = () => {
      const f = ara.value.toLowerCase().trim();
      c.querySelectorAll('.op-lot-satir').forEach(tr => {
        tr.style.display = !f || tr.dataset.ara.includes(f) ? '' : 'none';
      });
    };
    document.getElementById('op-lot-ekle').onclick = () => lotFormu(hammaddeler, render, main);
    c.querySelectorAll('.op-lot-izle').forEach(b => b.onclick = () =>
      lotIzlenebilirlik(lotlar.find(l => l.id === b.dataset.id), hareketler));
  }

  async function lotFormu(hammaddeler, render, main) {
    const tedarikciler = await Store.tedarikciler.all();
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Parti / Lot No <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="lt-no" placeholder="örn. MDF-2026-0714-A"></div>
        <div class="fgroup" style="flex:1.4"><label class="flbl">Malzeme <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="lt-malzeme">
            <option value="">— Seçin —</option>
            ${hammaddeler.map(h => `<option value="${h.id}">${App.escapeHtml(h.stokKodu)} — ${App.escapeHtml(h.ad)}</option>`).join('')}
          </select></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Giren Miktar <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="lt-miktar" type="number" min="0" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Giriş Tarihi</label>
          <input class="finput" id="lt-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="fgroup" style="flex:1.3"><label class="flbl">Tedarikçi</label>
          <select class="fselect" id="lt-tedarikci"><option value="">—</option>
            ${tedarikciler.map(t => `<option value="${t.id}">${App.escapeHtml(t.unvan)}</option>`).join('')}</select></div>
      </div>
      <div class="fgroup"><label class="flbl">Not (renk tonu, sertifika no vb.)</label><input class="finput" id="lt-not"></div>`;
    App.openModal({ title: '🔖 Parti / Lot Girişi', body,
      footer: `<button class="btn" id="lt-cancel">Vazgeç</button><button class="btn btn-blue" id="lt-ok">Kaydet</button>`, wide: true });
    document.getElementById('lt-cancel').onclick = App.closeModal;
    document.getElementById('lt-ok').onclick = async () => {
      const no = document.getElementById('lt-no').value.trim();
      const hmId = document.getElementById('lt-malzeme').value;
      const miktar = parseFloat(document.getElementById('lt-miktar').value) || 0;
      if (!no || !hmId || miktar <= 0) { App.toast('Parti no, malzeme ve miktar zorunlu', 'err'); return; }
      const hm = hammaddeler.find(h => h.id === hmId);
      const tedId = document.getElementById('lt-tedarikci').value;
      const ted = tedarikciler.find(t => t.id === tedId);
      const tumu = await Store.lotlar.all();
      if (tumu.some(l => l.lotNo === no && l.malzemeId === hmId)) {
        App.toast('Bu malzeme için aynı parti no zaten kayıtlı', 'err'); return;
      }
      tumu.push({
        id: App.uid('LOT'), lotNo: no, malzemeId: hmId,
        malzemeKod: hm ? hm.stokKodu : '', malzemeAd: hm ? hm.ad : '',
        birim: hm ? hm.birim : '', girenMiktar: miktar, kalanMiktar: miktar,
        tedarikciId: tedId || null, tedarikciAdi: ted ? ted.unvan : '',
        girisTarihi: document.getElementById('lt-tarih').value,
        not: document.getElementById('lt-not').value.trim()
      });
      await App.persist(() => Store.lotlar.save(tumu));
      App.toast('Parti kaydedildi: ' + no, 'ok');
      App.closeModal();
      render(main);
    };
  }

  // İZLENEBİLİRLİK: partiden ileriye (hangi işlere/siparişlere gitti)
  function lotIzlenebilirlik(lot, hareketler) {
    const ilgili = hareketler.filter(h => h.lotId === lot.id);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="card" style="padding:12px;margin-bottom:12px;background:var(--surface2)">
        <div style="font-size:12.5px"><b class="mono">${App.escapeHtml(lot.lotNo)}</b> — ${App.escapeHtml(lot.malzemeAd || '')}</div>
        <div class="muted" style="font-size:11px;margin-top:4px">
          Tedarikçi: ${App.escapeHtml(lot.tedarikciAdi || '—')} · Giriş: ${lot.girisTarihi || '—'} ·
          Giren: ${App.fmt(lot.girenMiktar || 0, 2)} ${App.escapeHtml(lot.birim || '')} ·
          Kalan: <b>${App.fmt(lot.kalanMiktar || 0, 2)}</b></div>
        ${lot.not ? `<div class="muted" style="font-size:10.5px;margin-top:4px">Not: ${App.escapeHtml(lot.not)}</div>` : ''}
      </div>
      <div class="flbl" style="margin-bottom:6px">📍 Bu Parti Nerelere Gitti?</div>
      ${ilgili.length ? `<table class="dtable" style="font-size:11px">
        <tr><th>Tarih</th><th>Hedef</th><th>Referans</th><th class="r">Miktar</th><th>Kişi</th></tr>
        ${ilgili.sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).map(h => `<tr>
          <td style="font-size:10.5px">${h.tarih || '—'}</td>
          <td>${App.escapeHtml(h.hedefTip || '—')}</td>
          <td class="mono" style="font-size:10.5px">${App.escapeHtml(h.hedefKod || '—')}</td>
          <td class="r">${App.fmt(h.miktar || 0, 2)}</td>
          <td style="font-size:10.5px">${App.escapeHtml(h.kisi || '—')}</td>
        </tr>`).join('')}</table>`
      : `<div class="empty-state" style="padding:18px"><div class="edesc">Bu partiden henüz tüketim yapılmadı.</div></div>`}`;
    App.openModal({ title: '🔍 Parti İzlenebilirlik Zinciri', sub: lot.lotNo, body,
      footer: `<button class="btn" id="li-kapat">Kapat</button>`, wide: true });
    document.getElementById('li-kapat').onclick = App.closeModal;
  }

  // ══ 3) ENVANTER SAYIMI ══════════════════════════════════════════════════
  async function renderSayim(c, render, main) {
    const sayimlar = (await Store.stokSayimlari.all()).sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''));
    const acikSayim = sayimlar.find(s => s.durum === 'acik');

    c.innerHTML = `
      <div class="card">
        <div class="card-hdr"><div class="card-title">Envanter Sayımları</div>
          ${acikSayim ? `<button class="btn btn-sm btn-green" id="op-sayim-devam">Açık Sayıma Devam Et</button>`
            : `<button class="btn btn-sm btn-blue" id="op-sayim-yeni">+ Yeni Sayım Başlat</button>`}</div>
        <div class="fhint" style="margin-bottom:8px">Sistem stoğu ile raftaki fiili stok zamanla ayrışır (fire, kayıt hatası, yanlış düşüm). Düzenli sayım yapılmazsa stok verisi güvenilmez olur ve <b>takımlama, iş emri ve satın alma önerileri yanlış çalışır</b>.</div>
        ${sayimlar.length ? `<table class="dtable" style="font-size:11.5px">
          <tr><th>Sayım</th><th>Tarih</th><th>Ambar</th><th class="r">Kalem</th><th class="r">Farklı</th><th class="r">Net Fark</th><th>Durum</th><th></th></tr>
          ${sayimlar.map(s => {
            const farkli = (s.satirlar || []).filter(x => (x.fiili != null) && x.fiili !== x.sistem).length;
            const netFark = (s.satirlar || []).reduce((a, x) => a + ((x.fiili != null ? x.fiili : x.sistem) - x.sistem), 0);
            return `<tr>
              <td><b class="mono">${App.escapeHtml(s.kod)}</b></td>
              <td>${s.tarih}</td><td style="font-size:10.5px">${App.escapeHtml(s.ambar || 'Tümü')}</td>
              <td class="r">${(s.satirlar || []).length}</td>
              <td class="r" style="color:var(--amber-text)">${farkli}</td>
              <td class="r"><b style="color:var(--${netFark === 0 ? 'text' : netFark > 0 ? 'green' : 'red'}-text)">${netFark > 0 ? '+' : ''}${App.fmt(netFark, 2)}</b></td>
              <td><span class="pill ${s.durum === 'acik' ? 'pill-amber' : 'pill-green'}" style="font-size:9.5px">${s.durum === 'acik' ? 'Açık' : 'Kapandı'}</span></td>
              <td><button class="btn btn-sm btn-ghost op-sayim-ac" data-id="${s.id}">${s.durum === 'acik' ? 'Devam' : 'Görüntüle'}</button></td>
            </tr>`;
          }).join('')}</table>`
        : `<div class="empty-state" style="padding:24px"><div class="edesc">Henüz sayım yapılmadı.</div></div>`}
      </div>`;

    const yeniBtn = document.getElementById('op-sayim-yeni');
    if (yeniBtn) yeniBtn.onclick = () => sayimBaslat(render, main);
    const devamBtn = document.getElementById('op-sayim-devam');
    if (devamBtn) devamBtn.onclick = () => sayimEkrani(acikSayim, render, main);
    c.querySelectorAll('.op-sayim-ac').forEach(b => b.onclick = () =>
      sayimEkrani(sayimlar.find(s => s.id === b.dataset.id), render, main));
  }

  async function sayimBaslat(render, main) {
    const [stokRaf, hammaddeler, yarimamuller] = await Promise.all([
      Store.stokRaf.all(), Store.hammaddeler.all(), Store.yarimamuller.all()]);
    const ambarlar = [...new Set(stokRaf.map(s => s.ambar).filter(Boolean))];
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Sayım fişi açılınca sistemdeki mevcut miktarlar <b>dondurulur</b>; fiili sayımı girip farkları onayladığınızda stok düzeltilir.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Ambar</label>
          <select class="fselect" id="sy-ambar"><option value="">Tüm ambarlar</option>
            ${ambarlar.map(a => `<option value="${App.escapeHtml(a)}">${App.escapeHtml(a)}</option>`).join('')}</select></div>
        <div class="fgroup"><label class="flbl">Kapsam</label>
          <select class="fselect" id="sy-tip"><option value="">Tümü</option>
            <option value="hammadde">Sadece Hammadde</option>
            <option value="yarimamul">Sadece Yarı Mamül</option></select></div>
      </div>
      <div class="fgroup"><label class="flbl">Sayımı Yapan</label><input class="finput" id="sy-kisi" placeholder="Ad Soyad"></div>`;
    App.openModal({ title: '📋 Yeni Envanter Sayımı', body,
      footer: `<button class="btn" id="sy-cancel">Vazgeç</button><button class="btn btn-blue" id="sy-ok">Sayımı Başlat</button>`, wide: true });
    document.getElementById('sy-cancel').onclick = App.closeModal;
    document.getElementById('sy-ok').onclick = async () => {
      const ambar = document.getElementById('sy-ambar').value;
      const tip = document.getElementById('sy-tip').value;
      const kisi = document.getElementById('sy-kisi').value.trim();
      const kapsam = stokRaf.filter(s => (!ambar || s.ambar === ambar) && (!tip || s.tip === tip));
      if (!kapsam.length) { App.toast('Bu kapsamda stok kaydı yok', 'err'); return; }
      const tumu = await Store.stokSayimlari.all();
      const sayim = {
        id: App.uid('SYM'), kod: 'SAY-' + Date.now().toString(36).toUpperCase(),
        tarih: new Date().toISOString().slice(0, 10), ambar: ambar || '', tip: tip || '',
        kisi, durum: 'acik',
        satirlar: kapsam.map(s => ({
          stokId: s.id, tip: s.tip, refId: s.refId, kod: s.refKod, ad: s.refAd,
          ambar: s.ambar, birim: s.birim, sistem: s.miktar || 0, fiili: null
        }))
      };
      tumu.push(sayim);
      await App.persist(() => Store.stokSayimlari.save(tumu));
      App.toast('Sayım başlatıldı: ' + sayim.kod + ' (' + kapsam.length + ' kalem)', 'ok');
      App.closeModal();
      sayimEkrani(sayim, render, main);
    };
  }

  function sayimEkrani(sayim, render, main) {
    const kapali = sayim.durum !== 'acik';
    const body = document.createElement('div');
    const ciz = () => {
      const farkli = sayim.satirlar.filter(x => x.fiili != null && x.fiili !== x.sistem);
      const girilmis = sayim.satirlar.filter(x => x.fiili != null).length;
      body.innerHTML = `
        <div style="display:flex;gap:14px;flex-wrap:wrap;background:var(--surface2);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:11.5px">
          <span>Kalem: <b>${sayim.satirlar.length}</b></span>
          <span>Girilen: <b>${girilmis}</b></span>
          <span style="color:var(--amber-text)">Farklı: <b>${farkli.length}</b></span>
          <span>Sayan: <b>${App.escapeHtml(sayim.kisi || '—')}</b></span>
        </div>
        <input class="finput" id="sy-ara" placeholder="🔍 Kod veya ad ara" style="margin-bottom:8px">
        <div style="max-height:380px;overflow:auto">
        <table class="dtable" style="font-size:11px">
          <tr><th>Malzeme</th><th>Ambar</th><th class="r">Sistem</th><th class="r">Fiili Sayım</th><th class="r">Fark</th></tr>
          ${sayim.satirlar.map((x, i) => {
            const fark = x.fiili != null ? x.fiili - x.sistem : null;
            return `<tr class="sy-satir" data-ara="${App.escapeHtml(((x.kod || '') + ' ' + (x.ad || '')).toLowerCase())}"${fark ? ' style="background:var(--amber-bg)"' : ''}>
              <td><b class="mono" style="font-size:10.5px">${App.escapeHtml(x.kod || '')}</b><br><span class="muted" style="font-size:9.5px">${App.escapeHtml(x.ad || '')}</span></td>
              <td style="font-size:10px">${App.escapeHtml(x.ambar || '')}</td>
              <td class="r">${App.fmt(x.sistem, 2)}</td>
              <td class="r">${kapali ? App.fmt(x.fiili != null ? x.fiili : x.sistem, 2)
                : `<input class="finput sy-fiili" data-i="${i}" type="number" step="0.01" value="${x.fiili != null ? x.fiili : ''}" style="width:90px;text-align:right">`}</td>
              <td class="r"><b style="color:var(--${!fark ? 'text' : fark > 0 ? 'green' : 'red'}-text)">${fark != null ? (fark > 0 ? '+' : '') + App.fmt(fark, 2) : '—'}</b></td>
            </tr>`;
          }).join('')}
        </table></div>`;
      const ara = body.querySelector('#sy-ara');
      ara.oninput = () => {
        const f = ara.value.toLowerCase().trim();
        body.querySelectorAll('.sy-satir').forEach(tr => { tr.style.display = !f || tr.dataset.ara.includes(f) ? '' : 'none'; });
      };
      body.querySelectorAll('.sy-fiili').forEach(inp => inp.onchange = () => {
        const i = parseInt(inp.dataset.i);
        sayim.satirlar[i].fiili = inp.value === '' ? null : parseFloat(inp.value);
        ciz();
      });
    };
    ciz();
    App.openModal({
      title: '📋 Sayım — ' + sayim.kod, sub: sayim.tarih + (kapali ? ' · KAPANDI' : ' · açık'), body,
      footer: kapali ? `<button class="btn" id="sy-kapat">Kapat</button>`
        : `<button class="btn" id="sy-kaydet">Ara Kaydet</button><button class="btn btn-green" id="sy-onayla">✓ Sayımı Bitir ve Stoğu Düzelt</button><button class="btn" id="sy-kapat">Kapat</button>`,
      xwide: true
    });
    document.getElementById('sy-kapat').onclick = () => { App.closeModal(); render(main); };

    const kaydet = async () => {
      const tumu = await Store.stokSayimlari.all();
      const i = tumu.findIndex(s => s.id === sayim.id);
      if (i >= 0) tumu[i] = sayim;
      await App.persist(() => Store.stokSayimlari.save(tumu));
    };
    const kaydetBtn = document.getElementById('sy-kaydet');
    if (kaydetBtn) kaydetBtn.onclick = async () => { await kaydet(); App.toast('Sayım kaydedildi', 'ok'); };

    const onaylaBtn = document.getElementById('sy-onayla');
    if (onaylaBtn) onaylaBtn.onclick = async () => {
      const farkli = sayim.satirlar.filter(x => x.fiili != null && x.fiili !== x.sistem);
      const girilmemis = sayim.satirlar.filter(x => x.fiili == null).length;
      App.confirmDialog(
        `<b>${farkli.length}</b> kalemde fark bulundu; bu kalemlerin stoğu <b>fiili sayıma göre düzeltilecek</b>.` +
        (girilmemis ? `<br><br><span style="color:var(--amber-text)">${girilmemis} kaleme fiili sayım girilmedi — bunlar değişmeden kalacak.</span>` : '') +
        `<br><br>Sayım kapatılacak ve stok hareketi olarak işlenecek. Onaylıyor musunuz?`,
        async () => {
          const stokRaf = await Store.stokRaf.all();
          const hareketler = await Store.stokHareketleri.all();
          farkli.forEach(x => {
            const s = stokRaf.find(r => r.id === x.stokId);
            if (!s) return;
            const fark = x.fiili - x.sistem;
            s.miktar = x.fiili;
            hareketler.push({
              id: App.uid('SH'), tarih: new Date().toISOString().slice(0, 10),
              tip: fark > 0 ? 'sayim_fazlasi' : 'sayim_eksigi',
              refTip: x.tip, refId: x.refId, refKod: x.kod, refAd: x.ad,
              ambar: x.ambar, miktar: Math.abs(fark), birim: x.birim,
              aciklama: `Envanter sayımı ${sayim.kod}: sistem ${App.fmt(x.sistem, 2)} → fiili ${App.fmt(x.fiili, 2)} (${fark > 0 ? '+' : ''}${App.fmt(fark, 2)})`,
              kisi: sayim.kisi || ''
            });
          });
          sayim.durum = 'kapandi';
          sayim.kapanisTarihi = new Date().toISOString().slice(0, 10);
          sayim.duzeltilenKalem = farkli.length;
          const tumu = await Store.stokSayimlari.all();
          const i = tumu.findIndex(s => s.id === sayim.id);
          if (i >= 0) tumu[i] = sayim; else tumu.push(sayim);
          await App.persist(async () => {
            await Store.stokSayimlari.save(tumu);
            await Store.stokRaf.save(stokRaf);
            await Store.stokHareketleri.save(hareketler);
          });
          App.toast(`✓ Sayım kapandı — ${farkli.length} kalemde stok düzeltildi`, 'ok');
          App.closeModal();
          render(main);
        });
    };
  }

  // ══ 4) TEDARİKÇİ KARNESİ ════════════════════════════════════════════════
  async function renderTedarikci(c) {
    const [tedarikciler, satinalmaSiparisleri, depoGirisleri, uygunsuzluklar] = await Promise.all([
      Store.tedarikciler.all(), Store.satinalmaSiparisleri.all(),
      Store.depoGirisleri.all(), Store.uygunsuzlukKayitlari.all()]);

    const karne = tedarikciler.map(t => {
      const siparisler = satinalmaSiparisleri.filter(s => s.tedarikciId === t.id && s.durum !== 'reddedildi');
      const girisler = depoGirisleri.filter(g => g.tedarikciId === t.id);
      // Zamanında teslim: teslim tarihi ≤ termin
      const terminli = girisler.filter(g => g.beklenenTarih && g.girisTarihi);
      const zamaninda = terminli.filter(g => g.girisTarihi <= g.beklenenTarih).length;
      const teslimSkor = terminli.length ? zamaninda / terminli.length : null;
      // Kalite: bu tedarikçiden gelen NCR sayısı
      const ncr = uygunsuzluklar.filter(u => u.tedarikciId === t.id || (u.kaynak === 'hammadde_girisi' && u.tedarikciAdi === t.unvan));
      const kaliteSkor = girisler.length ? Math.max(0, 1 - ncr.length / girisler.length) : null;
      const toplamTutar = siparisler.reduce((a, s) => a + (s.genelToplam || s.toplam || 0), 0);
      // Genel skor: teslim %50, kalite %50 (veri yoksa hariç tutulur)
      const skorlar = [teslimSkor, kaliteSkor].filter(x => x != null);
      const genel = skorlar.length ? skorlar.reduce((a, b) => a + b, 0) / skorlar.length : null;
      return { t, siparisSayisi: siparisler.length, girisSayisi: girisler.length, toplamTutar,
        teslimSkor, kaliteSkor, genel, ncrSayisi: ncr.length, geciken: terminli.length - zamaninda };
    }).filter(k => k.siparisSayisi > 0 || k.girisSayisi > 0)
      .sort((a, b) => (b.genel != null ? b.genel : -1) - (a.genel != null ? a.genel : -1));

    if (!karne.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Değerlendirilecek tedarikçi yok</div>
        <div class="edesc">Satınalma siparişi veya depo girişi kaydedildikçe performans karnesi otomatik oluşur.</div></div></div>`;
      return;
    }
    const yuzde = (x) => x == null ? '—' : '%' + Math.round(x * 100);
    const renk = (x) => x == null ? 'muted' : x >= 0.9 ? 'green' : x >= 0.7 ? 'amber' : 'red';

    c.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">🏅 Tedarikçi Performans Karnesi</div></div>
      <div class="fhint" style="margin-bottom:8px">Teslim performansı (termine uyum) ve kalite performansı (uygunsuzluk oranı) verilerden otomatik hesaplanır. Genel skoru düşük tedarikçilerle fiyat görüşmesi veya alternatif tedarikçi değerlendirmesi yapın.</div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Tedarikçi</th><th class="r">Sipariş</th><th class="r">Toplam Tutar</th><th class="r">Teslim Perf.</th><th class="r">Kalite Perf.</th><th class="r">Uygunsuzluk</th><th class="r">Geciken</th><th>Genel Skor</th></tr>
        ${karne.map(k => `<tr>
          <td><b>${App.escapeHtml(k.t.unvan)}</b></td>
          <td class="r">${k.siparisSayisi}</td>
          <td class="r">${App.fmtTL(k.toplamTutar)}</td>
          <td class="r" style="color:var(--${renk(k.teslimSkor)}-text)"><b>${yuzde(k.teslimSkor)}</b></td>
          <td class="r" style="color:var(--${renk(k.kaliteSkor)}-text)"><b>${yuzde(k.kaliteSkor)}</b></td>
          <td class="r" style="color:var(--red-text)">${k.ncrSayisi || '—'}</td>
          <td class="r" style="color:var(--amber-text)">${k.geciken || '—'}</td>
          <td>${k.genel == null ? '<span class="muted">Veri yok</span>'
            : `<span class="pill pill-${renk(k.genel) === 'green' ? 'green' : renk(k.genel) === 'amber' ? 'amber' : 'red'}" style="font-size:9.5px">${yuzde(k.genel)} ${k.genel >= 0.9 ? 'İyi' : k.genel >= 0.7 ? 'Orta' : 'Zayıf'}</span>`}</td>
        </tr>`).join('')}
      </table></div>`;
  }

  // ══ 5) PLAN vs FİİLİ MALİYET ════════════════════════════════════════════
  async function renderMaliyet(c) {
    const [istasyonIsleri, sureler, rotalar, yarimamuller, ayarlar] = await Promise.all([
      Store.istasyonIsleri.all(), Store.gerceklesenSureKayitlari.all(),
      Store.rotalar.all(), Store.yarimamuller.all(), Store.get('ayarlar', {})]);
    const saatlikIscilik = (ayarlar && ayarlar.iscilikSaatUcreti) || 150;

    // Yarı mamül bazında: planlanan (rota dk) vs gerçekleşen (ölçülen dk)
    const grup = new Map();
    sureler.forEach(s => {
      const anahtar = s.ymKod + '|' + s.istasyonKod;
      if (!grup.has(anahtar)) {
        grup.set(anahtar, { ymKod: s.ymKod, ymAd: s.ymAd, istasyonKod: s.istasyonKod,
          adet: 0, gercekDk: 0, planDk: 0, kayit: 0 });
      }
      const g = grup.get(anahtar);
      g.adet += s.adet || 0;
      g.gercekDk += s.dk || 0;
      g.kayit++;
      // Plan: yarı mamülün rotasındaki ilgili adımın dk'sı × adet
      const ym = yarimamuller.find(y => y.id === s.ymId);
      const rota = rotalar.find(r => r.id === (ym && ym.rotaId));
      const step = rota ? (rota.steps || []).find(st => st.kod === s.istasyonKod) : null;
      g.planDk += (step ? (step.dk || 0) : 0) * (s.adet || 0);
    });
    const satirlar = [...grup.values()].map(g => {
      const sapmaDk = g.gercekDk - g.planDk;
      const sapmaYuzde = g.planDk > 0 ? sapmaDk / g.planDk : null;
      const planTL = (g.planDk / 60) * saatlikIscilik;
      const gercekTL = (g.gercekDk / 60) * saatlikIscilik;
      return { ...g, sapmaDk, sapmaYuzde, planTL, gercekTL, sapmaTL: gercekTL - planTL };
    }).sort((a, b) => b.sapmaTL - a.sapmaTL);

    // Fire maliyeti
    const fireAdet = istasyonIsleri.reduce((a, k) => a + (k.fireAdet || 0), 0);

    if (!satirlar.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Karşılaştırma için veri yok</div>
        <div class="edesc">Hat & İstasyon Takibi'nde işler tamamlandıkça gerçekleşen süreler birikir ve rota planıyla karşılaştırılır.</div></div></div>`;
      return;
    }
    const toplamPlan = satirlar.reduce((a, x) => a + x.planTL, 0);
    const toplamGercek = satirlar.reduce((a, x) => a + x.gercekTL, 0);
    const toplamSapma = toplamGercek - toplamPlan;

    c.innerHTML = `
      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Planlanan İşçilik</div><div class="kpi-val blue">${App.fmtTL(toplamPlan)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Gerçekleşen İşçilik</div><div class="kpi-val purple">${App.fmtTL(toplamGercek)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Sapma</div>
          <div class="kpi-val ${toplamSapma <= 0 ? 'green' : 'red'}">${toplamSapma > 0 ? '+' : ''}${App.fmtTL(toplamSapma)}</div>
          <div class="muted" style="font-size:10.5px">${toplamPlan > 0 ? '%' + Math.round(toplamSapma / toplamPlan * 100) : '—'}</div></div>
        <div class="kpi"><div class="kpi-lbl">Fire (adet)</div><div class="kpi-val ${fireAdet ? 'red' : 'green'}">${fireAdet}</div></div>
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">💹 Yarı Mamül / İstasyon Bazında Maliyet Sapması</div></div>
        <div class="fhint" style="margin-bottom:8px">Rotada tanımlı standart süre ile istasyonlarda ölçülen gerçek süre karşılaştırılır. İşçilik saat ücreti: <b>${App.fmtTL(saatlikIscilik)}/saat</b> (Sistem Ayarları'ndan). <b>Pozitif sapma = zarar</b>; rota süresi güncellenmeli veya darboğaz giderilmeli.</div>
        <table class="dtable" style="font-size:11px">
          <tr><th>Yarı Mamül</th><th>İstasyon</th><th class="r">Adet</th><th class="r">Plan (dk)</th><th class="r">Fiili (dk)</th><th class="r">Sapma</th><th class="r">Plan ₺</th><th class="r">Fiili ₺</th><th class="r">Fark ₺</th></tr>
          ${satirlar.map(x => `<tr${x.sapmaTL > 0 ? ' style="background:var(--red-bg)"' : ''}>
            <td><b class="mono" style="font-size:10.5px">${App.escapeHtml(x.ymKod)}</b><br><span class="muted" style="font-size:9.5px">${App.escapeHtml(x.ymAd || '')}</span></td>
            <td class="mono" style="font-size:10.5px">${App.escapeHtml(x.istasyonKod)}</td>
            <td class="r">${App.fmt(x.adet, 0)}</td>
            <td class="r">${App.fmt(x.planDk, 1)}</td>
            <td class="r">${App.fmt(x.gercekDk, 1)}</td>
            <td class="r"><b style="color:var(--${x.sapmaDk <= 0 ? 'green' : 'red'}-text)">${x.sapmaYuzde != null ? (x.sapmaYuzde > 0 ? '+' : '') + Math.round(x.sapmaYuzde * 100) + '%' : '—'}</b></td>
            <td class="r">${App.fmtTL(x.planTL)}</td>
            <td class="r">${App.fmtTL(x.gercekTL)}</td>
            <td class="r"><b style="color:var(--${x.sapmaTL <= 0 ? 'green' : 'red'}-text)">${x.sapmaTL > 0 ? '+' : ''}${App.fmtTL(x.sapmaTL)}</b></td>
          </tr>`).join('')}
        </table></div>`;
  }

  return { render };
})();
