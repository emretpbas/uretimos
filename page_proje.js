// ════════════════════════════════════════════════════════════════════════════
// PROJE YÖNETİMİ EKRANI
// Aşama takibi · hakediş · revizyon · kârlılık · termin riski
// ════════════════════════════════════════════════════════════════════════════
PageModules.proje = (() => {

  let seciliId = null;

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'satis', 'teklif_siparis', 'uretim_planlama', 'cari', 'pazarlama', 'muhasebe'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Proje ekranı Satış, Planlama, Cari, Muhasebe ve Yönetim rollerine açıktır.</div></div></div>`;
      return;
    }
    const [projeler, musteriler] = await Promise.all([Store.projeler.all(), Store.musteriler.all()]);
    if (seciliId) { await detayCiz(main, seciliId); return; }

    const acik = projeler.filter(p => !['tamamlandi', 'iptal'].includes(p.durum));
    const toplamBedel = acik.reduce((a, p) => a + (+p.sozlesmeBedeli || 0) + (+p.revizyonFarki || 0), 0);
    const toplamHakedis = projeler.reduce((a, p) =>
      a + (p.hakedisler || []).reduce((s, h) => s + (+h.tutar || 0), 0), 0);
    const riskli = acik.map(p => ({ p, r: ProjeMotor.terminRiski(p) }))
      .filter(x => x.r && (x.r.seviye === 'riskli' || x.r.seviye === 'kritik' || x.r.gecikti));

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">🏗 Proje Yönetimi</div>
          <div class="page-sub">Aşama, hakediş, revizyon ve proje kârlılığı</div></div>
        <div class="page-acts"><button class="btn btn-blue" id="pr-yeni">+ Yeni Proje</button></div>
      </div>

      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">AÇIK PROJE</div><div class="kpi-value">${acik.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">SÖZLEŞME BEDELİ</div><div class="kpi-value">${App.fmtTL(toplamBedel)}</div></div>
        <div class="kpi-card"><div class="kpi-label">KESİLEN HAKEDİŞ</div><div class="kpi-value">${App.fmtTL(toplamHakedis)}</div></div>
        <div class="kpi-card"><div class="kpi-label">TERMİN RİSKİ</div>
          <div class="kpi-value" style="color:${riskli.length ? 'var(--red-text)' : 'inherit'}">${riskli.length}</div></div>
      </div>

      ${riskli.length ? `<div class="card" style="margin-bottom:12px;background:var(--amber-bg);border:1px solid var(--amber-text)">
        <div style="padding:6px;font-size:12px;color:var(--amber-text)">
          <b>⚠ ${riskli.length} projede termin riski</b> — iş ilerlemesi zaman ilerlemesinin gerisinde.<br>
          ${riskli.slice(0, 5).map(x => `• <b>${App.escapeHtml(x.p.ad)}</b> — zaman %${x.r.zamanYuzde}, iş %${x.r.isYuzde}
            (${x.r.gecikti ? '<b>SÜRE DOLDU</b>' : x.r.kalanGun + ' gün kaldı'})`).join('<br>')}
        </div></div>` : ''}

      <div class="card">
        <div class="card-hdr"><div class="card-title">Projeler (${projeler.length})</div></div>
        ${projeler.length ? `<div class="tbl-wrap"><table class="dtable">
          <tr><th>Kod</th><th>Proje</th><th>Müşteri</th><th class="r">Bedel</th>
              <th>İlerleme</th><th>Termin</th><th>Durum</th><th></th></tr>
          ${projeler.map(p => {
            const il = ProjeMotor.ilerlemeHesapla(p);
            const r = ProjeMotor.terminRiski(p);
            const bedel = (+p.sozlesmeBedeli || 0) + (+p.revizyonFarki || 0);
            const rRenk = !r ? 'var(--muted)' : r.seviye === 'kritik' ? 'var(--red-text)'
              : r.seviye === 'riskli' ? 'var(--amber-text)' : 'var(--green-text)';
            return `<tr>
              <td class="mono" style="font-size:10.5px">${App.escapeHtml(p.kod || '')}</td>
              <td><b>${App.escapeHtml(p.ad)}</b>${p.revizyonFarki ? `<br><span class="muted" style="font-size:10px">revizyon: ${App.fmtTL(p.revizyonFarki)}</span>` : ''}</td>
              <td style="font-size:11.5px">${App.escapeHtml(p.musteriAdi || '')}</td>
              <td class="r">${App.fmtTL(bedel)}</td>
              <td style="min-width:110px">
                <div style="background:var(--surface2);border-radius:4px;height:16px;overflow:hidden">
                  <div style="width:${il.yuzde}%;height:100%;background:var(--blue);opacity:.8"></div></div>
                <span style="font-size:10.5px">%${il.yuzde}</span></td>
              <td style="font-size:11px;color:${rRenk}">${r ? (r.gecikti ? 'SÜRE DOLDU' : r.kalanGun + ' gün') : '—'}</td>
              <td><span class="pill ${p.durum === 'tamamlandi' ? 'pill-green' : p.durum === 'iptal' ? 'pill-red' : 'pill-blue'}"
                style="font-size:9.5px">${ProjeMotor.DURUMLAR[p.durum] || p.durum}</span></td>
              <td><button class="btn btn-sm pr-ac" data-id="${p.id}">Aç</button></td>
            </tr>`;
          }).join('')}
        </table></div>` : '<div class="muted" style="padding:12px;font-size:12px">Henüz proje yok. CRM\'de kazanılan proje işleri buraya aktarılabilir.</div>'}
      </div>`;

    document.getElementById('pr-yeni').onclick = () => yeniProjeFormu(main, musteriler);
    main.querySelectorAll('.pr-ac').forEach(b => b.onclick = () => { seciliId = b.dataset.id; render(main); });
  }

  // ── DETAY ────────────────────────────────────────────────────────────────
  async function detayCiz(main, id) {
    const [projeler, isemirleri, satinalmaSiparisleri] = await Promise.all([
      Store.projeler.all(), Store.isemirleri.all(), Store.satinalmaSiparisleri.all()
    ]);
    const p = projeler.find(x => x.id === id);
    if (!p) { seciliId = null; render(main); return; }

    const il = ProjeMotor.ilerlemeHesapla(p);
    const r = ProjeMotor.terminRiski(p);
    const hk = ProjeMotor.hakedisHesapla(p, il.yuzde);
    // Maliyet: projeye bağlı iş emri ve satınalmalardan
    const mUretim = isemirleri.filter(x => x.projeId === id)
      .reduce((a, x) => a + (+x.toplamMaliyet || 0), 0);
    const mMalzeme = satinalmaSiparisleri.filter(x => x.projeId === id)
      .reduce((a, x) => a + (+x.tutar || 0), 0);
    const kar = ProjeMotor.karlilik(p, { uretim: mUretim, malzeme: mMalzeme });
    const hakedisToplam = (p.hakedisler || []).reduce((a, h) => a + (+h.tutar || 0), 0);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">🏗 ${App.escapeHtml(p.ad)}</div>
          <div class="page-sub">${App.escapeHtml(p.kod || '')} · ${App.escapeHtml(p.musteriAdi || '')}
            ${p.sorumlu ? ' · sorumlu: ' + App.escapeHtml(p.sorumlu) : ''}
            ${p.firsatId ? ' · <span class="pill pill-blue" style="font-size:9.5px">CRM fırsatından geldi</span>' : ''}</div></div>
        <div class="page-acts">
          <button class="btn btn-blue" id="pr-teklif">📋 Proje Teklifi (Mahal)</button>
          <button class="btn" id="pr-geri">← Listeye Dön</button></div>
      </div>

      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">İLERLEME</div><div class="kpi-value">%${il.yuzde}</div>
          <div class="muted" style="font-size:9.5px">${il.tamamlanan}/${il.toplam} aşama</div></div>
        <div class="kpi-card"><div class="kpi-label">SÖZLEŞME + REVİZYON</div><div class="kpi-value">${App.fmtTL(kar.bedel)}</div></div>
        <div class="kpi-card"><div class="kpi-label">KESİLEN HAKEDİŞ</div><div class="kpi-value">${App.fmtTL(hakedisToplam)}</div>
          <div class="muted" style="font-size:9.5px">%${kar.bedel ? (hakedisToplam / kar.bedel * 100).toFixed(0) : 0}</div></div>
        <div class="kpi-card"><div class="kpi-label">KÂR MARJI</div>
          <div class="kpi-value" style="color:${kar.marj != null && kar.marj < 15 ? 'var(--red-text)' : 'var(--green-text)'}">
            ${kar.marj != null ? '%' + kar.marj.toFixed(1) : '—'}</div></div>
      </div>

      ${r ? `<div class="card" style="margin-bottom:12px;padding:10px 14px;background:${r.seviye === 'iyi' ? 'var(--surface)' : 'var(--amber-bg)'}">
        <div style="font-size:12px">
          <b>Termin durumu:</b> Zaman %${r.zamanYuzde} · İş %${r.isYuzde} ·
          Sapma <b style="color:${r.sapma < 0 ? 'var(--red-text)' : 'var(--green-text)'}">${r.sapma > 0 ? '+' : ''}${r.sapma}</b>
          ${r.gecikti ? ' · <b style="color:var(--red-text)">SÜRE DOLDU</b>' : ' · kalan ' + r.kalanGun + ' gün'}
          ${r.sapma < -10 ? '<br><span class="muted">İş, zamanın gerisinde — kapasite veya tedarik sorunu olabilir.</span>' : ''}
        </div></div>` : ''}

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Aşamalar</div></div>
        <div class="fhint" style="margin-bottom:8px">
          Ağırlık = aşamanın sözleşme bedelindeki payı (%). Toplamı 100 olmalı.
          Tamamlanma yüzdesi hakedişe esas ilerlemeyi belirler.
        </div>
        <table class="dtable">
          <tr><th>Aşama</th><th class="r">Ağırlık %</th><th class="r">Tamamlanma %</th><th>Not</th><th></th></tr>
          ${(p.asamalar || []).map(a => `<tr>
            <td><b>${App.escapeHtml(a.ad)}</b></td>
            <td class="r"><input class="finput pr-agirlik" data-a="${a.id}" type="number" min="0" max="100"
              value="${a.agirlik || 0}" style="width:70px;text-align:right;font-size:11.5px;padding:3px"></td>
            <td class="r"><input class="finput pr-tamam" data-a="${a.id}" type="number" min="0" max="100"
              value="${a.tamamlanmaYuzdesi || 0}" style="width:70px;text-align:right;font-size:11.5px;padding:3px"></td>
            <td><input class="finput pr-not" data-a="${a.id}" value="${App.escapeHtml(a.not || '')}"
              style="width:100%;font-size:11.5px;padding:3px" placeholder="—"></td>
            <td><button class="btn btn-sm pr-asama-kaydet" data-a="${a.id}">Kaydet</button></td>
          </tr>`).join('')}
          <tr style="background:var(--surface2);font-weight:600">
            <td>TOPLAM</td>
            <td class="r">${(p.asamalar || []).reduce((a, x) => a + (+x.agirlik || 0), 0)}%</td>
            <td class="r">%${il.yuzde}</td><td colspan="2"></td></tr>
        </table>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Hakedişler (${(p.hakedisler || []).length})</div>
          <button class="btn btn-sm btn-green" id="pr-hakedis">+ Hakediş Oluştur</button></div>
        <div class="fhint" style="margin-bottom:8px">
          Bu ilerlemeye göre kesilebilecek tutar: <b>${App.fmtTL(hk.tutar)}</b>
          (kümülatif %${hk.kumulatifOran.toFixed(1)} · önceki hakedişler ${App.fmtTL(hk.oncekiToplam)} düşülmüştür)
        </div>
        ${(p.hakedisler || []).length ? `<table class="dtable">
          <tr><th>No</th><th>Tarih</th><th class="r">İlerleme</th><th class="r">Tutar</th><th>Durum</th><th>Açıklama</th></tr>
          ${p.hakedisler.map(h => `<tr>
            <td>#${h.no}</td><td style="font-size:11px">${h.tarih}</td>
            <td class="r">%${h.ilerlemeYuzde}</td>
            <td class="r"><b>${App.fmtTL(h.tutar)}</b></td>
            <td><span class="pill pill-blue" style="font-size:9.5px">${ProjeMotor.HAKEDIS_DURUM[h.durum] || h.durum}</span></td>
            <td style="font-size:11px">${App.escapeHtml(h.aciklama || '')}</td>
          </tr>`).join('')}</table>` : '<div class="muted" style="padding:8px;font-size:12px">Henüz hakediş kesilmemiş.</div>'}
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Revizyonlar (${(p.revizyonlar || []).length})</div>
          <button class="btn btn-sm" id="pr-revizyon">+ Revizyon Ekle</button></div>
        ${(p.revizyonlar || []).length ? `<table class="dtable">
          <tr><th>No</th><th>Başlık</th><th class="r">Fiyat Farkı</th><th>Gerekçe</th><th>Tarih</th></tr>
          ${p.revizyonlar.map(x => `<tr>
            <td>#${x.no}</td><td>${App.escapeHtml(x.baslik)}</td>
            <td class="r" style="color:${x.fiyatFarki >= 0 ? 'var(--green-text)' : 'var(--red-text)'}">
              ${x.fiyatFarki >= 0 ? '+' : ''}${App.fmtTL(x.fiyatFarki)}</td>
            <td style="font-size:11px">${App.escapeHtml(x.gerekce)}</td>
            <td style="font-size:11px">${x.tarih}</td>
          </tr>`).join('')}</table>` : '<div class="muted" style="padding:8px;font-size:12px">Revizyon yok.</div>'}
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Kârlılık</div></div>
        <table class="dtable">
          <tr><td>Sözleşme bedeli</td><td class="r">${App.fmtTL(p.sozlesmeBedeli || 0)}</td></tr>
          <tr><td>Revizyon farkı</td><td class="r">${App.fmtTL(p.revizyonFarki || 0)}</td></tr>
          <tr style="font-weight:600"><td>Toplam gelir</td><td class="r">${App.fmtTL(kar.bedel)}</td></tr>
          <tr><td>Üretim maliyeti (iş emirleri)</td><td class="r">${App.fmtTL(kar.uretim)}</td></tr>
          <tr><td>Malzeme / satınalma</td><td class="r">${App.fmtTL(kar.malzeme)}</td></tr>
          <tr><td>Diğer giderler (montaj, nakliye…)
            <button class="btn btn-sm" id="pr-gider" style="margin-left:6px;font-size:10px;padding:1px 6px">düzenle</button></td>
            <td class="r">${App.fmtTL(kar.diger)}</td></tr>
          <tr style="font-weight:600"><td>Toplam maliyet</td><td class="r">${App.fmtTL(kar.toplamMaliyet)}</td></tr>
          <tr style="background:var(--surface2);font-weight:700">
            <td>KÂR</td><td class="r" style="color:${kar.kar >= 0 ? 'var(--green-text)' : 'var(--red-text)'}">
              ${App.fmtTL(kar.kar)} ${kar.marj != null ? '(%' + kar.marj.toFixed(1) + ')' : ''}</td></tr>
        </table>
        <div class="muted" style="font-size:11px;margin-top:8px">
          Üretim ve malzeme maliyeti, bu projeye bağlanmış iş emri ve satınalma siparişlerinden gelir.
          Montaj/nakliye gibi saha giderleri sistem tarafından bilinemez — elle girilmelidir.
        </div>
      </div>`;

    document.getElementById('pr-geri').onclick = () => { seciliId = null; render(main); };
    document.getElementById('pr-teklif').onclick = () => {
      if (PageModules.proje_teklif && PageModules.proje_teklif.ac) PageModules.proje_teklif.ac(id, null);
      App.goTo('proje_teklif', { projeId: id });
    };

    main.querySelectorAll('.pr-asama-kaydet').forEach(b => b.onclick = async () => {
      try {
        const aid = b.dataset.a;
        const g = (cls) => main.querySelector(`.${cls}[data-a="${aid}"]`).value;
        const res = await ProjeMotor.asamaGuncelle(id, aid, {
          agirlik: g('pr-agirlik'), tamamlanmaYuzdesi: g('pr-tamam'), not: g('pr-not')
        });
        if (!res.ok) { App.toast(res.hata, 'err'); return; }
        App.toast('Aşama güncellendi — ilerleme %' + res.ilerleme.yuzde, 'ok');
        detayCiz(main, id);
      } catch (e) { App.toast('Kaydedilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    });

    document.getElementById('pr-hakedis').onclick = () => hakedisFormu(main, p, hk);
    document.getElementById('pr-revizyon').onclick = () => revizyonFormu(main, id);
    document.getElementById('pr-gider').onclick = () => giderFormu(main, p);
  }

  function hakedisFormu(main, p, hk) {
    App.openModal({
      title: 'Hakediş Oluştur', sub: App.escapeHtml(p.ad),
      body: `<div class="fhint" style="margin-bottom:10px">
          Mevcut ilerlemeye göre hesaplanan tutar aşağıdadır. Önceki hakedişler
          (${App.fmtTL(hk.oncekiToplam)}) düşülmüştür — mükerrer fatura oluşmaz.
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Hakediş Tutarı (₺)</label>
            <input class="finput" id="hk-tutar" type="number" step="0.01" value="${hk.tutar}"></div>
        </div>
        <div class="fgroup"><label class="flbl">Açıklama</label>
          <input class="finput" id="hk-aciklama" placeholder="örn. 2. hakediş — üretim %50 tamamlandı"></div>`,
      footer: `<button class="btn" id="hk-vaz">Vazgeç</button><button class="btn btn-green" id="hk-kaydet">Oluştur</button>`
    });
    document.getElementById('hk-vaz').onclick = App.closeModal;
    document.getElementById('hk-kaydet').onclick = async () => {
      try {
        const r = await ProjeMotor.hakedisOlustur(p.id, {
          aciklama: document.getElementById('hk-aciklama').value,
          elleTutar: document.getElementById('hk-tutar').value
        });
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal(); App.toast('Hakediş #' + r.hakedis.no + ' oluşturuldu.', 'ok');
        detayCiz(main, p.id);
      } catch (e) { App.toast('Oluşturulamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  function revizyonFormu(main, id) {
    App.openModal({
      title: 'Revizyon Ekle',
      body: `<div class="fgroup"><label class="flbl">Revizyon Başlığı *</label>
          <input class="finput" id="rv-baslik" placeholder="örn. Kapak rengi değişikliği + 12 ilave dolap"></div>
        <div class="fgroup"><label class="flbl">Fiyat Farkı (₺) — azalışta negatif yazın</label>
          <input class="finput" id="rv-fark" type="number" step="0.01" value="0"></div>
        <div class="fgroup"><label class="flbl">Gerekçe *</label>
          <textarea class="ftextarea" id="rv-gerekce" rows="2"
            placeholder="Müşteri talebi, tasarım değişikliği, saha koşulu…"></textarea></div>
        <div class="fhint">Gerekçe zorunludur — fiyat farkı müşteriye ancak belgeyle savunulabilir.</div>`,
      footer: `<button class="btn" id="rv-vaz">Vazgeç</button><button class="btn btn-green" id="rv-kaydet">Ekle</button>`
    });
    document.getElementById('rv-vaz').onclick = App.closeModal;
    document.getElementById('rv-kaydet').onclick = async () => {
      try {
        const r = await ProjeMotor.revizyonEkle(id, {
          baslik: document.getElementById('rv-baslik').value,
          fiyatFarki: document.getElementById('rv-fark').value,
          gerekce: document.getElementById('rv-gerekce').value
        });
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal(); App.toast('Revizyon #' + r.revizyon.no + ' eklendi.', 'ok');
        detayCiz(main, id);
      } catch (e) { App.toast('Eklenemedi: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  function giderFormu(main, p) {
    App.openModal({
      title: 'Diğer Giderler',
      body: `<div class="fgroup"><label class="flbl">Montaj, nakliye, saha giderleri toplamı (₺)</label>
          <input class="finput" id="gd-tutar" type="number" step="0.01" value="${p.digerGiderler || 0}"></div>
        <div class="fhint">Bu giderler sistemde otomatik oluşmaz; proje kârlılığının doğru çıkması için elle girilir.</div>`,
      footer: `<button class="btn" id="gd-vaz">Vazgeç</button><button class="btn btn-green" id="gd-kaydet">Kaydet</button>`
    });
    document.getElementById('gd-vaz').onclick = App.closeModal;
    document.getElementById('gd-kaydet').onclick = async () => {
      try {
        const liste = await Store.projeler.all();
        const pr = liste.find(x => x.id === p.id);
        pr.digerGiderler = +document.getElementById('gd-tutar').value || 0;
        await App.persist(() => Store.topluGuncelle('projeler', [pr], 1));
        App.closeModal(); App.toast('Giderler güncellendi.', 'ok');
        detayCiz(main, p.id);
      } catch (e) { App.toast('Kaydedilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  function yeniProjeFormu(main, musteriler) {
    App.openModal({
      title: '+ Yeni Proje',
      body: `<div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Proje Adı *</label>
            <input class="finput" id="pj-ad" placeholder="örn. Grand Hotel — 120 oda mobilya"></div>
          <div class="fgroup"><label class="flbl">Sözleşme Bedeli (₺)</label>
            <input class="finput" id="pj-bedel" type="number" min="0" step="1000"></div>
        </div>
        <div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Müşteri *</label>
            <input class="finput" id="pj-musteri" list="pj-mlist">
            <datalist id="pj-mlist">${musteriler.slice(0, 500).map(m =>
              `<option value="${App.escapeHtml(m.unvan || m.ad || '')}"></option>`).join('')}</datalist></div>
          <div class="fgroup"><label class="flbl">Sorumlu</label>
            <input class="finput" id="pj-sorumlu" value="${App.escapeHtml(App.aktifRol())}"></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Başlangıç</label><input class="finput" id="pj-bas" type="date"></div>
          <div class="fgroup"><label class="flbl">Bitiş (termin)</label><input class="finput" id="pj-bit" type="date"></div>
        </div>
        <div class="fgroup"><label class="flbl">Açıklama</label>
          <textarea class="ftextarea" id="pj-aciklama" rows="2"></textarea></div>
        <div class="fhint">Varsayılan aşamalar otomatik oluşur (keşif, tasarım, sözleşme, üretim, sevkiyat, montaj, kabul).
          Ağırlıkları sözleşmenize göre düzenleyebilirsiniz.</div>`,
      footer: `<button class="btn" id="pj-vaz">Vazgeç</button><button class="btn btn-green" id="pj-kaydet">Projeyi Oluştur</button>`,
      wide: true
    });
    document.getElementById('pj-vaz').onclick = App.closeModal;
    document.getElementById('pj-kaydet').onclick = async () => {
      try {
        const musteriAdi = document.getElementById('pj-musteri').value.trim();
        const m = musteriler.find(x => (x.unvan || x.ad || '') === musteriAdi);
        const r = await ProjeMotor.projeOlustur({
          ad: document.getElementById('pj-ad').value,
          musteriId: m ? m.id : null, musteriAdi,
          sozlesmeBedeli: document.getElementById('pj-bedel').value,
          baslangic: document.getElementById('pj-bas').value,
          bitis: document.getElementById('pj-bit').value,
          sorumlu: document.getElementById('pj-sorumlu').value.trim(),
          aciklama: document.getElementById('pj-aciklama').value
        });
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.closeModal(); App.toast('Proje oluşturuldu: ' + r.proje.kod, 'ok');
        seciliId = r.proje.id; render(main);
      } catch (e) { App.toast('Oluşturulamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  return { render };
})();
