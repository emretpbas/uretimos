// ════════════════════════════════════════════════════════════════════════════
// PAZARLAMA EKRANI — Kampanya · Fiyat Listesi · Numune Takibi
// ════════════════════════════════════════════════════════════════════════════
PageModules.pazarlama = (() => {

  let sekme = 'kampanya';

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'pazarlama', 'satis', 'teklif_siparis', 'cari'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Pazarlama ekranı Pazarlama, Satış, Cari ve Yönetim rollerine açıktır.</div></div></div>`;
      return;
    }
    const [kampanyalar, numuneler, fiyatListeleri, musteriler] = await Promise.all([
      Store.kampanyalar.all(), Store.numuneler.all(),
      Store.fiyatListeleri.all(), Store.musteriler.all()
    ]);

    const bugun = new Date().toISOString().slice(0, 10);
    const aktifKmp = kampanyalar.filter(k => PazarlamaMotor.gecerliMi(k, bugun));
    const don = PazarlamaMotor.numuneDonusOrani(numuneler);
    const takip = PazarlamaMotor.takipBekleyenler(numuneler, 21);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">📣 Pazarlama</div>
          <div class="page-sub">Kampanya, fiyat listesi ve numune dönüş takibi</div></div>
      </div>

      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">AKTİF KAMPANYA</div><div class="kpi-value">${aktifKmp.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">BEKLEYEN NUMUNE</div><div class="kpi-value">${don.bekleyen}</div></div>
        <div class="kpi-card" title="Sonuçlanan numunelerin siparişe dönme oranı">
          <div class="kpi-label">NUMUNE DÖNÜŞ ORANI</div>
          <div class="kpi-value">${don.oran != null ? '%' + don.oran.toFixed(0) : '—'}</div>
          ${!don.guvenilir && don.sonuclanan > 0 ? '<div class="muted" style="font-size:9.5px">az veri</div>' : ''}</div>
        <div class="kpi-card"><div class="kpi-label">NUMUNEDEN GELEN SİPARİŞ</div>
          <div class="kpi-value">${App.fmtTL(don.donenSiparis)}</div></div>
      </div>

      ${takip.length ? `<div class="card" style="margin-bottom:12px;background:var(--amber-bg);border:1px solid var(--amber-text)">
        <div style="padding:6px;font-size:12px;color:var(--amber-text)">
          <b>⚠ ${takip.length} numunede 21 günden uzun süredir geri bildirim yok</b> —
          numune yatırımı takip edilmezse boşa gider.<br>
          ${takip.slice(0, 5).map(n => `• <b>${App.escapeHtml(n.urunAdi)}</b> → ${App.escapeHtml(n.musteriAdi)} (${n.bekleyenGun} gün)`).join('<br>')}
        </div></div>` : ''}

      <div class="tabs" style="margin-bottom:12px">
        <div class="tab ${sekme === 'kampanya' ? 'active' : ''}" data-s="kampanya">Kampanyalar (${kampanyalar.length})</div>
        <div class="tab ${sekme === 'numune' ? 'active' : ''}" data-s="numune">Numune Takibi (${numuneler.length})</div>
        <div class="tab ${sekme === 'fiyat' ? 'active' : ''}" data-s="fiyat">Fiyat Listeleri (${fiyatListeleri.length})</div>
      </div>
      <div id="pz-icerik"></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { sekme = t.dataset.s; render(main); });

    const el = document.getElementById('pz-icerik');
    if (sekme === 'kampanya') kampanyaCiz(el, kampanyalar, bugun, main);
    else if (sekme === 'numune') numuneCiz(el, numuneler, don, musteriler, main);
    else fiyatCiz(el, fiyatListeleri, main);
  }

  // ── KAMPANYALAR ──────────────────────────────────────────────────────────
  function kampanyaCiz(el, kampanyalar, bugun, main) {
    const sirali = [...kampanyalar].sort((a, b) => (b.baslangic || '').localeCompare(a.baslangic || ''));
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Kampanyalar</div>
        <button class="btn btn-sm btn-blue" id="pz-yeni-kmp">+ Yeni Kampanya</button></div>
      <div class="fhint" style="margin-bottom:8px">
        Kampanyalar <b>üst üste binmez</b> — bir teklifte yalnızca en avantajlı olan uygulanır.
        Bu kasıtlıdır: çakışan kampanyalar kontrolsüz iskonto üretir ve marjı görünmez şekilde eritir.
      </div>
      ${sirali.length ? `<div class="tbl-wrap"><table class="dtable">
        <tr><th>Kod</th><th>Kampanya</th><th>Tip</th><th class="r">Değer</th>
            <th>Segment</th><th>Dönem</th><th>Durum</th><th></th></tr>
        ${sirali.map(k => {
          const tip = PazarlamaMotor.KAMPANYA_TIPLERI.find(x => x.id === k.tip);
          const gecerli = PazarlamaMotor.gecerliMi(k, bugun);
          const bitmis = k.bitis && bugun > k.bitis;
          return `<tr style="${gecerli ? '' : 'opacity:.6'}">
            <td class="mono" style="font-size:10.5px">${App.escapeHtml(k.kod || '')}</td>
            <td><b>${App.escapeHtml(k.ad)}</b>${k.kapsam ? `<br><span class="muted" style="font-size:10px">${App.escapeHtml(k.kapsam)}</span>` : ''}</td>
            <td style="font-size:11px">${tip ? tip.ad : k.tip}</td>
            <td class="r"><b>${k.deger}${tip ? tip.birim : ''}</b></td>
            <td style="font-size:11px">${App.escapeHtml(k.segment || 'Tümü')}</td>
            <td style="font-size:11px">${k.baslangic || '—'} → ${k.bitis || '—'}</td>
            <td>${gecerli ? '<span class="pill pill-green" style="font-size:9.5px">Yürürlükte</span>'
              : bitmis ? '<span class="pill pill-gray" style="font-size:9.5px">Süresi doldu</span>'
              : k.durum !== 'aktif' ? '<span class="pill pill-red" style="font-size:9.5px">Pasif</span>'
              : '<span class="pill pill-blue" style="font-size:9.5px">Beklemede</span>'}</td>
            <td><button class="btn btn-sm pz-kmp-durum" data-id="${k.id}" data-d="${k.durum}">
              ${k.durum === 'aktif' ? 'Pasifleştir' : 'Aktifleştir'}</button></td>
          </tr>`;
        }).join('')}
      </table></div>` : '<div class="muted" style="padding:12px;font-size:12px">Henüz kampanya yok.</div>'}
    </div>`;

    document.getElementById('pz-yeni-kmp').onclick = () => kampanyaFormu(main);
    el.querySelectorAll('.pz-kmp-durum').forEach(b => b.onclick = async () => {
      try {
        const liste = await Store.kampanyalar.all();
        const k = liste.find(x => x.id === b.dataset.id);
        if (!k) return;
        k.durum = k.durum === 'aktif' ? 'pasif' : 'aktif';
        await App.persist(() => Store.topluGuncelle('kampanyalar', [k], 1));
        App.toast('Kampanya ' + (k.durum === 'aktif' ? 'aktifleştirildi' : 'pasifleştirildi') + '.', 'ok');
        render(main);
      } catch (e) { App.toast('Değiştirilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    });
  }

  function kampanyaFormu(main) {
    App.openModal({
      title: '+ Yeni Kampanya',
      body: `<div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Kampanya Adı *</label>
            <input class="finput" id="km-ad" placeholder="örn. Bahar Bayi Kampanyası"></div>
          <div class="fgroup"><label class="flbl">Tip *</label>
            <select class="fselect" id="km-tip">${PazarlamaMotor.KAMPANYA_TIPLERI.map(t =>
              `<option value="${t.id}">${t.ad}</option>`).join('')}</select></div>
          <div class="fgroup"><label class="flbl">Değer</label>
            <input class="finput" id="km-deger" type="number" step="0.01" min="0" value="0"></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Segment</label>
            <select class="fselect" id="km-segment">${PazarlamaMotor.SEGMENTLER.map(x =>
              `<option value="${x}">${x}</option>`).join('')}</select></div>
          <div class="fgroup"><label class="flbl">Başlangıç</label><input class="finput" id="km-bas" type="date"></div>
          <div class="fgroup"><label class="flbl">Bitiş</label><input class="finput" id="km-bit" type="date"></div>
        </div>
        <div class="fgroup"><label class="flbl">Kapsam (hangi ürün grubu)</label>
          <input class="finput" id="km-kapsam" placeholder="örn. Tüm dolap grubu, Titan serisi"></div>
        <div class="fgroup"><label class="flbl">Açıklama / Koşullar</label>
          <textarea class="ftextarea" id="km-aciklama" rows="2" placeholder="Asgari sipariş tutarı, ödeme koşulu…"></textarea></div>`,
      footer: `<button class="btn" id="km-vaz">Vazgeç</button><button class="btn btn-green" id="km-kaydet">Oluştur</button>`,
      wide: true
    });
    document.getElementById('km-vaz').onclick = App.closeModal;
    document.getElementById('km-kaydet').onclick = async () => {
      try {
        const r = await PazarlamaMotor.kampanyaOlustur({
          ad: document.getElementById('km-ad').value,
          tip: document.getElementById('km-tip').value,
          deger: document.getElementById('km-deger').value,
          segment: document.getElementById('km-segment').value,
          baslangic: document.getElementById('km-bas').value,
          bitis: document.getElementById('km-bit').value,
          kapsam: document.getElementById('km-kapsam').value,
          aciklama: document.getElementById('km-aciklama').value
        });
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal(); App.toast('Kampanya oluşturuldu: ' + r.kampanya.kod, 'ok');
        render(main);
      } catch (e) { App.toast('Oluşturulamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  // ── NUMUNE ───────────────────────────────────────────────────────────────
  function numuneCiz(el, numuneler, don, musteriler, main) {
    const sirali = [...numuneler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''));
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Numune Takibi</div>
        <button class="btn btn-sm btn-blue" id="pz-yeni-num">+ Numune Gönder</button></div>
      <div class="fhint" style="margin-bottom:8px">
        Numune maliyeti: <b>${App.fmtTL(don.maliyet)}</b> ·
        Dönen sipariş: <b>${App.fmtTL(don.donenSiparis)}</b>
        ${don.maliyet > 0 ? ` · Getiri: <b>${(don.donenSiparis / don.maliyet).toFixed(1)}x</b>` : ''}
      </div>
      ${sirali.length ? `<div class="tbl-wrap"><table class="dtable">
        <tr><th>Kod</th><th>Ürün</th><th>Müşteri</th><th class="r">Adet</th>
            <th class="r">Maliyet</th><th>Durum</th><th>Geri Bildirim</th><th></th></tr>
        ${sirali.map(n => `<tr>
          <td class="mono" style="font-size:10.5px">${App.escapeHtml(n.kod || '')}</td>
          <td><b>${App.escapeHtml(n.urunAdi)}</b><br><span class="muted" style="font-size:10px">${n.tarih || ''}</span></td>
          <td style="font-size:11.5px">${App.escapeHtml(n.musteriAdi || '')}</td>
          <td class="r">${n.adet}</td>
          <td class="r">${n.maliyet ? App.fmtTL(n.maliyet) : '—'}</td>
          <td><span class="pill ${n.durum === 'siparise_dondu' ? 'pill-green' : n.durum === 'olumsuz' ? 'pill-red' : 'pill-blue'}"
            style="font-size:9.5px">${PazarlamaMotor.NUMUNE_DURUM[n.durum] || n.durum}</span>
            ${n.siparisTutari ? `<br><span style="font-size:10px;color:var(--green-text)">${App.fmtTL(n.siparisTutari)}</span>` : ''}</td>
          <td style="font-size:11px">${App.escapeHtml((n.geriBildirim || '').slice(0, 40))}</td>
          <td><button class="btn btn-sm pz-num-durum" data-id="${n.id}">Güncelle</button></td>
        </tr>`).join('')}
      </table></div>` : '<div class="muted" style="padding:12px;font-size:12px">Henüz numune kaydı yok.</div>'}
    </div>`;

    document.getElementById('pz-yeni-num').onclick = () => numuneFormu(main, musteriler);
    el.querySelectorAll('.pz-num-durum').forEach(b => b.onclick = () => numuneDurumFormu(main, b.dataset.id, numuneler));
  }

  function numuneFormu(main, musteriler) {
    App.openModal({
      title: '+ Numune Gönderimi',
      body: `<div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Ürün / Numune *</label>
            <input class="finput" id="nm-urun" placeholder="örn. Titan 80 masa ayağı — füme"></div>
          <div class="fgroup"><label class="flbl">Adet</label>
            <input class="finput" id="nm-adet" type="number" min="1" value="1"></div>
        </div>
        <div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Müşteri *</label>
            <input class="finput" id="nm-musteri" list="nm-mlist">
            <datalist id="nm-mlist">${musteriler.slice(0, 500).map(m =>
              `<option value="${App.escapeHtml(m.unvan || m.ad || '')}"></option>`).join('')}</datalist></div>
          <div class="fgroup"><label class="flbl">Maliyet (₺)</label>
            <input class="finput" id="nm-maliyet" type="number" min="0" step="0.01" value="0"></div>
        </div>
        <div class="fgroup"><label class="flbl">Not</label>
          <input class="finput" id="nm-not" placeholder="Kargo bilgisi, özel talep…"></div>
        <div class="fhint">Maliyet girilirse numune yatırımının geri dönüşü ölçülebilir.</div>`,
      footer: `<button class="btn" id="nm-vaz">Vazgeç</button><button class="btn btn-green" id="nm-kaydet">Kaydet</button>`,
      wide: true
    });
    document.getElementById('nm-vaz').onclick = App.closeModal;
    document.getElementById('nm-kaydet').onclick = async () => {
      try {
        const musteriAdi = document.getElementById('nm-musteri').value.trim();
        const m = musteriler.find(x => (x.unvan || x.ad || '') === musteriAdi);
        const r = await PazarlamaMotor.numuneGonder({
          musteriId: m ? m.id : null, musteriAdi,
          urunAdi: document.getElementById('nm-urun').value,
          adet: document.getElementById('nm-adet').value,
          maliyet: document.getElementById('nm-maliyet').value,
          not: document.getElementById('nm-not').value
        });
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal(); App.toast('Numune kaydedildi: ' + r.numune.kod, 'ok');
        render(main);
      } catch (e) { App.toast('Kaydedilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  function numuneDurumFormu(main, id, numuneler) {
    const n = numuneler.find(x => x.id === id);
    if (!n) return;
    App.openModal({
      title: 'Numune Durumu', sub: App.escapeHtml(n.urunAdi + ' → ' + (n.musteriAdi || '')),
      body: `<div class="fgroup"><label class="flbl">Yeni Durum</label>
          <select class="fselect" id="nd-durum">${Object.entries(PazarlamaMotor.NUMUNE_DURUM).map(([k, v]) =>
            `<option value="${k}" ${n.durum === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="fgroup"><label class="flbl">Geri Bildirim</label>
          <textarea class="ftextarea" id="nd-geri" rows="2"
            placeholder="Müşteri ne dedi? Beğenilmediyse neden?">${App.escapeHtml(n.geriBildirim || '')}</textarea></div>
        <div class="fgroup"><label class="flbl">Siparişe döndüyse tutar (₺)</label>
          <input class="finput" id="nd-tutar" type="number" min="0" step="0.01" value="${n.siparisTutari || 0}"></div>
        <div class="fhint">Olumsuz sonuçta geri bildirim, siparişe dönüşte tutar zorunludur —
          bu bilgiler olmadan numune yatırımının getirisi ölçülemez.</div>`,
      footer: `<button class="btn" id="nd-vaz">Vazgeç</button><button class="btn btn-green" id="nd-kaydet">Kaydet</button>`
    });
    document.getElementById('nd-vaz').onclick = App.closeModal;
    document.getElementById('nd-kaydet').onclick = async () => {
      try {
        const r = await PazarlamaMotor.numuneDurumGuncelle(id,
          document.getElementById('nd-durum').value, {
            geriBildirim: document.getElementById('nd-geri').value,
            siparisTutari: document.getElementById('nd-tutar').value
          });
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal(); App.toast('Numune durumu güncellendi.', 'ok');
        render(main);
      } catch (e) { App.toast('Güncellenemedi: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  // ── FİYAT LİSTELERİ ──────────────────────────────────────────────────────
  function fiyatCiz(el, listeler, main) {
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Fiyat Listeleri</div>
        <button class="btn btn-sm btn-blue" id="pz-yeni-fl">+ Yeni Liste</button></div>
      <div class="fhint" style="margin-bottom:8px">
        Segment bazlı liste fiyatları. Teklif hazırlanırken önce müşterinin segmentine ait liste,
        yoksa "Tümü" listesi, o da yoksa ürünün temel fiyatı kullanılır.
      </div>
      ${listeler.length ? `<table class="dtable">
        <tr><th>Liste</th><th>Segment</th><th class="r">Kalem</th><th>Geçerlilik</th><th>Durum</th></tr>
        ${listeler.map(l => `<tr>
          <td><b>${App.escapeHtml(l.ad)}</b></td>
          <td>${App.escapeHtml(l.segment || 'Tümü')}</td>
          <td class="r">${(l.kalemler || []).length}</td>
          <td style="font-size:11px">${l.baslangic || '—'} → ${l.bitis || '—'}</td>
          <td><span class="pill ${l.durum === 'aktif' ? 'pill-green' : 'pill-gray'}" style="font-size:9.5px">
            ${l.durum === 'aktif' ? 'Aktif' : 'Pasif'}</span></td>
        </tr>`).join('')}
      </table>` : `<div class="empty-state" style="padding:20px">
        <div class="edesc">Henüz fiyat listesi yok. Farklı bayi/segmentlere farklı fiyat veriyorsanız
        burada tanımlayın — teklif aşamasında otomatik kullanılır.</div></div>`}
    </div>`;
    document.getElementById('pz-yeni-fl').onclick = () => fiyatListesiFormu(main);
  }

  function fiyatListesiFormu(main) {
    App.openModal({
      title: '+ Yeni Fiyat Listesi',
      body: `<div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Liste Adı *</label>
            <input class="finput" id="fl-ad" placeholder="örn. 2026 Bayi Fiyat Listesi"></div>
          <div class="fgroup"><label class="flbl">Segment</label>
            <select class="fselect" id="fl-segment">${PazarlamaMotor.SEGMENTLER.map(x =>
              `<option value="${x}">${x}</option>`).join('')}</select></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Başlangıç</label><input class="finput" id="fl-bas" type="date"></div>
          <div class="fgroup"><label class="flbl">Bitiş</label><input class="finput" id="fl-bit" type="date"></div>
        </div>
        <div class="fhint">Liste oluşturulduktan sonra ürün fiyatları eklenir.
          Toplu fiyat girişi için Excel aktarımı ileride eklenebilir.</div>`,
      footer: `<button class="btn" id="fl-vaz">Vazgeç</button><button class="btn btn-green" id="fl-kaydet">Oluştur</button>`
    });
    document.getElementById('fl-vaz').onclick = App.closeModal;
    document.getElementById('fl-kaydet').onclick = async () => {
      try {
        const ad = document.getElementById('fl-ad').value.trim();
        if (!ad) { App.toast('Liste adı zorunlu.', 'err'); return; }
        const l = {
          id: App.uid('FLS'), ad,
          segment: document.getElementById('fl-segment').value,
          baslangic: document.getElementById('fl-bas').value,
          bitis: document.getElementById('fl-bit').value,
          durum: 'aktif', kalemler: [],
          olusturmaTarihi: new Date().toISOString()
        };
        await App.persist(() => Store.topluEkle('fiyatListeleri', [l], 1));
        App.closeModal(); App.toast('Fiyat listesi oluşturuldu.', 'ok');
        render(main);
      } catch (e) { App.toast('Oluşturulamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  return { render };
})();
