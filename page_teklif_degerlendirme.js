// ════════════════════════════════════════════════════════════════════════════
// TEKLİF DEĞERLENDİRME EKRANI
// Tüm teklifler · Proje teklifleri · Yönetim raporu
// ════════════════════════════════════════════════════════════════════════════
PageModules.teklif_degerlendirme = (() => {

  let sekme = 'tumu';

  // Farklı kaynaklardan gelen teklifleri ortak biçime çevirir:
  // standart teklifler (teklifler koleksiyonu) + proje teklifleri (projeler içinde)
  async function teklifleriTopla() {
    const [teklifler, projeler, musteriler] = await Promise.all([
      Store.teklifler.all(), Store.projeler.all(), Store.musteriler.all()
    ]);
    const mAd = (id) => {
      const m = musteriler.find(x => x.id === id);
      return m ? (m.unvan || m.ad || '') : '';
    };
    const standart = teklifler.map(t => ({
      ...t, tip: 'standart',
      musteriAdi: t.musteriAdi || mAd(t.musteriId),
      tutar: +t.genelToplam || +t.toplamTutar || +t.tutar || 0,
      durum: t.durum || 'taslak',
      revizyonlar: t.revizyonlar || []
    }));
    const projeT = [];
    projeler.forEach(p => (p.teklifler || []).forEach(t => projeT.push({
      ...t, tip: 'proje',
      projeAd: p.ad, projeId: p.id,
      musteriAdi: t.musteriAdi || p.musteriAdi || mAd(p.musteriId),
      tutar: +t.genelToplam || +t.tutar || hesapla(t),
      durum: t.durum === 'siparise_dondu' ? 'kazanildi' : (t.durum || 'taslak'),
      revizyonlar: t.revizyonlar || []
    })));
    return { standart, projeT, tumu: standart.concat(projeT), musteriler };
  }

  function hesapla(t) {
    try {
      if (typeof ProjeTeklifMotor === 'undefined') return 0;
      return ProjeTeklifMotor.teklifHesapla(t).matrah || 0;
    } catch (e) { return 0; }
  }

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'satis', 'teklif_siparis', 'cari', 'pazarlama', 'muhasebe'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran Satış, Pazarlama, Cari, Muhasebe ve Yönetim rollerine açıktır.</div></div></div>`;
      return;
    }

    const veri = await teklifleriTopla();
    const liste = sekme === 'proje' ? veri.projeT : sekme === 'standart' ? veri.standart : veri.tumu;
    const oz = TeklifTakipMotor.ozet(veri.tumu);
    const uyari = TeklifTakipMotor.uyarilar(veri.tumu, 14);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">📊 Teklif Değerlendirme</div>
          <div class="page-sub">Kaç teklif verildi, ne oldu, neyi bekliyor — takip ve yönetim raporu</div></div>
      </div>

      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">AÇIK TEKLİF</div><div class="kpi-value">${oz.acik}</div>
          <div class="muted" style="font-size:9.5px">${App.fmtTL(oz.acikTutar)}</div></div>
        <div class="kpi-card"><div class="kpi-label">KAZANMA ORANI</div>
          <div class="kpi-value">${oz.kazanmaOrani != null ? '%' + oz.kazanmaOrani.toFixed(0) : '—'}</div>
          ${!oz.guvenilir && (oz.kazanan + oz.kaybeden) > 0 ? '<div class="muted" style="font-size:9.5px">az veri</div>' : ''}</div>
        <div class="kpi-card"><div class="kpi-label">ORT. BEKLEME</div>
          <div class="kpi-value">${oz.ortBekleme != null ? oz.ortBekleme + ' gün' : '—'}</div></div>
        <div class="kpi-card"><div class="kpi-label">TOPLAM REVİZYON</div><div class="kpi-value">${oz.toplamRevizyon}</div></div>
        <div class="kpi-card"><div class="kpi-label">SORUMSUZ TEKLİF</div>
          <div class="kpi-value" style="color:${oz.sorumlusuz ? 'var(--red-text)' : 'inherit'}">${oz.sorumlusuz}</div></div>
      </div>

      ${uyari.length ? `<div class="card" style="margin-bottom:12px;background:var(--amber-bg);border:1px solid var(--amber-text)">
        <div style="padding:6px;font-size:12px;color:var(--amber-text)">
          <b>⚠ ${uyari.length} teklif aksiyon bekliyor</b><br>
          ${uyari.slice(0, 6).map(u => `• <b>${App.escapeHtml(u.teklif.kod || '')}</b>
            ${App.escapeHtml(u.teklif.musteriAdi || '')} — ${App.escapeHtml(u.mesaj)}`).join('<br>')}
          ${uyari.length > 6 ? `<br>… ve ${uyari.length - 6} teklif daha` : ''}
        </div></div>` : ''}

      <div class="tabs" style="margin-bottom:12px">
        <div class="tab ${sekme === 'tumu' ? 'active' : ''}" data-s="tumu">Tüm Teklifler (${veri.tumu.length})</div>
        <div class="tab ${sekme === 'standart' ? 'active' : ''}" data-s="standart">Standart Teklifler (${veri.standart.length})</div>
        <div class="tab ${sekme === 'proje' ? 'active' : ''}" data-s="proje">Proje Teklifleri (${veri.projeT.length})</div>
        <div class="tab ${sekme === 'rapor' ? 'active' : ''}" data-s="rapor">📈 Yönetim Raporu</div>
      </div>
      <div id="td-icerik"></div>`;

    main.querySelectorAll('.tab').forEach(x => x.onclick = () => { sekme = x.dataset.s; render(main); });
    const el = document.getElementById('td-icerik');
    if (sekme === 'rapor') raporCiz(el, veri.tumu, veri);
    else listeCiz(el, liste, main);
  }

  // ── TEKLİF LİSTESİ ───────────────────────────────────────────────────────
  function listeCiz(el, liste, main) {
    const sirali = [...liste].sort((a, b) => {
      const ga = TeklifTakipMotor.bekleyenGun(a) ?? -1;
      const gb = TeklifTakipMotor.bekleyenGun(b) ?? -1;
      return gb - ga;
    });
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Teklifler (${sirali.length})</div></div>
      ${sirali.length ? `<div class="tbl-wrap"><table class="dtable">
        <tr><th>Kod</th><th>Müşteri / Konu</th><th>Tip</th><th class="r">Tutar</th>
            <th>Durum</th><th class="r">Bekleme</th><th class="r">Rev.</th>
            <th>Sorumlu</th><th>İrtibat</th><th>Sebep</th><th></th></tr>
        ${sirali.map(t => {
          const d = TeklifTakipMotor.durumBul(t.durum);
          const g = TeklifTakipMotor.bekleyenGun(t);
          const gecikme = TeklifTakipMotor.acikMi(t) && g != null && g >= 14;
          const sebep = t.durum === 'kaybedildi' ? (t.kayipSebebi || '—')
            : TeklifTakipMotor.acikMi(t) ? (t.beklemeSebebi || '—') : '';
          return `<tr>
            <td class="mono" style="font-size:10.5px">${App.escapeHtml(t.kod || '')}</td>
            <td><b style="font-size:11.5px">${App.escapeHtml(t.musteriAdi || '')}</b>
              ${t.projeAd ? `<br><span class="muted" style="font-size:10px">${App.escapeHtml(t.projeAd)}</span>`
                : t.konu ? `<br><span class="muted" style="font-size:10px">${App.escapeHtml(t.konu)}</span>` : ''}</td>
            <td>${t.tip === 'proje' ? '<span class="pill pill-blue" style="font-size:9px">PROJE</span>'
              : '<span class="pill pill-gray" style="font-size:9px">STANDART</span>'}</td>
            <td class="r">${App.fmtTL(t.tutar)}</td>
            <td><span class="pill" style="background:${d.renk}22;color:${d.renk};font-size:9.5px">${d.ad}</span></td>
            <td class="r" style="font-size:11px;${gecikme ? 'color:var(--red-text);font-weight:600' : ''}">
              ${g != null ? g + ' gün' : '—'}</td>
            <td class="r" style="font-size:11px;${(t.revizyonlar || []).length >= 3 ? 'color:var(--amber-text);font-weight:600' : ''}">
              ${(t.revizyonlar || []).length}</td>
            <td style="font-size:11px;${!t.sorumlu ? 'color:var(--red-text)' : ''}">
              ${App.escapeHtml(t.sorumlu || '⚠ atanmamış')}</td>
            <td style="font-size:11px">${App.escapeHtml(t.irtibatKisi || '—')}</td>
            <td style="font-size:10.5px">${App.escapeHtml(sebep)}</td>
            <td><button class="btn btn-sm td-durum" data-id="${t.id}" data-tip="${t.tip}"
              data-proje="${t.projeId || ''}">Güncelle</button></td>
          </tr>`;
        }).join('')}
      </table></div>` : '<div class="muted" style="padding:12px;font-size:12px">Bu bölümde teklif yok.</div>'}
    </div>`;
    el.querySelectorAll('.td-durum').forEach(b => b.onclick = () =>
      durumFormu(main, b.dataset.id, b.dataset.tip, b.dataset.proje, liste));
  }

  // ── DURUM / TAKİP GÜNCELLEME ─────────────────────────────────────────────
  function durumFormu(main, id, tip, projeId, liste) {
    const t = liste.find(x => x.id === id);
    if (!t) return;
    App.openModal({
      title: 'Teklif Takibi', sub: `${App.escapeHtml(t.kod || '')} · ${App.escapeHtml(t.musteriAdi || '')}`,
      body: `<div class="frow">
          <div class="fgroup"><label class="flbl">Durum</label>
            <select class="fselect" id="td-d">${TeklifTakipMotor.DURUMLAR.map(d =>
              `<option value="${d.id}" ${t.durum === d.id ? 'selected' : ''}>${d.ad}</option>`).join('')}</select></div>
          <div class="fgroup"><label class="flbl">Teklif Sorumlusu <span style="color:var(--red-text)">*</span></label>
            <input class="finput" id="td-sorumlu" value="${App.escapeHtml(t.sorumlu || '')}"
              placeholder="Zorunlu"></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">İrtibat Kişisi (müşteri tarafı)</label>
            <input class="finput" id="td-irtibat" value="${App.escapeHtml(t.irtibatKisi || '')}"></div>
          <div class="fgroup"><label class="flbl">İrtibat Telefon</label>
            <input class="finput" id="td-tel" value="${App.escapeHtml(t.irtibatTelefon || '')}"></div>
          <div class="fgroup"><label class="flbl">Gönderim Tarihi</label>
            <input class="finput" id="td-gonderim" type="date"
              value="${(t.gonderimTarihi || '').slice(0, 10)}"></div>
        </div>
        <div class="fgroup" id="td-bekleme-alan"><label class="flbl">Bekleme Sebebi</label>
          <select class="fselect" id="td-bekleme"><option value="">— seçin —</option>
            ${TeklifTakipMotor.BEKLEME_SEBEPLERI.map(s =>
              `<option value="${s}" ${t.beklemeSebebi === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="fgroup" id="td-kayip-alan"><label class="flbl">Kayıp Sebebi</label>
          <select class="fselect" id="td-kayip"><option value="">— seçin —</option>
            ${TeklifTakipMotor.KAYIP_SEBEPLERI.map(s =>
              `<option value="${s}" ${t.kayipSebebi === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="fgroup"><label class="flbl">Not</label>
          <textarea class="ftextarea" id="td-not" rows="2">${App.escapeHtml(t.takipNotu || '')}</textarea></div>
        <div class="fhint">
          Sorumlu zorunludur — sahipsiz teklif takip edilmez. Kapanış ve bekleme
          sebepleri sabit listeden seçilir; ancak böyle sayılabilir ve raporlanabilir.
        </div>`,
      footer: `<button class="btn" id="td-vaz">Vazgeç</button>
               <button class="btn btn-green" id="td-kaydet">Kaydet</button>`,
      wide: true
    });

    const alanlariAyarla = () => {
      const d = document.getElementById('td-d').value;
      document.getElementById('td-bekleme-alan').style.display =
        ['beklemede', 'gonderildi', 'revize'].includes(d) ? '' : 'none';
      document.getElementById('td-kayip-alan').style.display = d === 'kaybedildi' ? '' : 'none';
    };
    document.getElementById('td-d').onchange = alanlariAyarla;
    alanlariAyarla();

    document.getElementById('td-vaz').onclick = App.closeModal;
    document.getElementById('td-kaydet').onclick = async () => {
      try {
        const yeni = document.getElementById('td-d').value;
        const sorumlu = document.getElementById('td-sorumlu').value.trim();
        if (!sorumlu) { App.toast('Teklif sorumlusu zorunludur.', 'err'); return; }
        const ek = {
          sorumlu,
          beklemeSebebi: document.getElementById('td-bekleme').value,
          kayipSebebi: document.getElementById('td-kayip').value
        };
        if (yeni !== t.durum) {
          const g = TeklifTakipMotor.durumDegistirGecerli(t, yeni, ek);
          if (!g.ok) { App.toast(g.hata, 'err'); return; }
        }
        const yama = (x) => {
          const oncekiDurum = x.durum;
          x.durum = yeni;
          x.sorumlu = sorumlu;
          x.irtibatKisi = document.getElementById('td-irtibat').value.trim();
          x.irtibatTelefon = document.getElementById('td-tel').value.trim();
          x.gonderimTarihi = document.getElementById('td-gonderim').value || x.gonderimTarihi;
          x.beklemeSebebi = ek.beklemeSebebi;
          if (yeni === 'kaybedildi') x.kayipSebebi = ek.kayipSebebi;
          x.takipNotu = document.getElementById('td-not').value.trim();
          if (['kazanildi', 'kaybedildi', 'iptal'].includes(yeni) && !x.kapanisTarihi) {
            x.kapanisTarihi = new Date().toISOString();
          }
          if (yeni === 'revize') {
            x.revizyonlar = x.revizyonlar || [];
            x.revizyonlar.push({ tarih: new Date().toISOString(), kim: App.aktifRol(), oncekiDurum });
          }
        };

        if (tip === 'proje') {
          const projeler = await Store.projeler.all();
          const p = projeler.find(x => x.id === projeId);
          const tk = p && (p.teklifler || []).find(x => x.id === id);
          if (!tk) { App.toast('Teklif bulunamadı.', 'err'); return; }
          yama(tk);
          await App.persist(() => Store.topluGuncelle('projeler', [p], 1));
        } else {
          const teklifler = await Store.teklifler.all();
          const tk = teklifler.find(x => x.id === id);
          if (!tk) { App.toast('Teklif bulunamadı.', 'err'); return; }
          yama(tk);
          await App.persist(() => Store.topluGuncelle('teklifler', [tk], 1));
        }
        App.closeModal(); App.toast('Teklif takibi güncellendi.', 'ok');
        render(main);
      } catch (e) { App.toast('Kaydedilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  // ── YÖNETİM RAPORU ───────────────────────────────────────────────────────
  function raporCiz(el, tumu, veri) {
    const oz = TeklifTakipMotor.ozet(tumu);
    const yas = TeklifTakipMotor.yaslandirma(tumu);
    const kayip = TeklifTakipMotor.kayipAnalizi(tumu);
    const bekleme = TeklifTakipMotor.beklemeAnalizi(tumu);
    const perf = TeklifTakipMotor.sorumluPerformansi(tumu);
    const enBuyukKova = Math.max(1, ...yas.map(k => k.adet));

    el.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Genel Durum</div>
          <button class="btn btn-sm" id="td-excel">⤓ Raporu Excel'e Aktar</button></div>
        <table class="dtable">
          <tr><td>Toplam teklif</td><td class="r"><b>${oz.toplam}</b></td>
              <td>Standart / Proje</td><td class="r">${veri.standart.length} / ${veri.projeT.length}</td></tr>
          <tr><td>Açık teklif</td><td class="r"><b>${oz.acik}</b> · ${App.fmtTL(oz.acikTutar)}</td>
              <td>Ortalama bekleme</td><td class="r">${oz.ortBekleme != null ? oz.ortBekleme + ' gün' : '—'}</td></tr>
          <tr><td>Kazanılan</td><td class="r" style="color:var(--green-text)">${oz.kazanan} · ${App.fmtTL(oz.kazanilanTutar)}</td>
              <td>Kaybedilen</td><td class="r" style="color:var(--red-text)">${oz.kaybeden} · ${App.fmtTL(oz.kaybedilenTutar)}</td></tr>
          <tr><td>Kazanma oranı</td><td class="r"><b>${oz.kazanmaOrani != null ? '%' + oz.kazanmaOrani.toFixed(1) : '—'}</b>
              ${!oz.guvenilir ? ' <span class="muted" style="font-size:10px">(az veri)</span>' : ''}</td>
              <td>Toplam revizyon</td><td class="r">${oz.toplamRevizyon}</td></tr>
        </table>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Bekleme Yaşlandırması</div></div>
        <div class="fhint" style="margin-bottom:8px">
          30 günü geçen teklifler pratikte kaybedilmiştir. Bu tablo hangi tekliflerin
          soğuduğunu gösterir.</div>
        ${yas.map(k => `<div style="margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;font-size:12px">
            <span>${k.ad}</span><span><b>${k.adet}</b> teklif · ${App.fmtTL(k.tutar)}</span></div>
          <div style="background:var(--surface2);border-radius:4px;height:14px;overflow:hidden">
            <div style="width:${k.adet / enBuyukKova * 100}%;height:100%;
              background:${k.min >= 31 ? 'var(--red)' : k.min >= 16 ? 'var(--amber)' : 'var(--blue)'};opacity:.8"></div>
          </div></div>`).join('')}
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Neden Bekliyor?</div></div>
        ${bekleme.length ? `<table class="dtable">
          <tr><th>Bekleme Sebebi</th><th class="r">Teklif</th><th class="r">Tutar</th></tr>
          ${bekleme.map(b => `<tr><td>${App.escapeHtml(b.sebep)}</td>
            <td class="r">${b.adet}</td><td class="r">${App.fmtTL(b.tutar)}</td></tr>`).join('')}
        </table>` : '<div class="muted" style="padding:10px;font-size:12px">Açık teklif yok.</div>'}
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Neden Kaybedildi?</div></div>
        ${kayip.length ? `<table class="dtable">
          <tr><th>Kayıp Sebebi</th><th class="r">Teklif</th><th class="r">Kaybedilen Tutar</th><th class="r">Pay</th></tr>
          ${kayip.map(k => `<tr><td>${App.escapeHtml(k.sebep)}</td><td class="r">${k.adet}</td>
            <td class="r">${App.fmtTL(k.tutar)}</td>
            <td class="r">%${oz.kaybeden ? (k.adet / oz.kaybeden * 100).toFixed(0) : 0}</td></tr>`).join('')}
        </table>` : '<div class="muted" style="padding:10px;font-size:12px">Kaybedilen teklif yok.</div>'}
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Sorumlu Bazlı Performans</div></div>
        <table class="dtable">
          <tr><th>Sorumlu</th><th class="r">Toplam</th><th class="r">Açık</th><th class="r">Kazanan</th>
              <th class="r">Kaybeden</th><th class="r">Oran</th><th class="r">Revizyon</th><th class="r">Kazanılan Tutar</th></tr>
          ${perf.map(p => `<tr>
            <td>${App.escapeHtml(p.sorumlu)}${p.sorumlu === '—' ? ' <span class="pill pill-red" style="font-size:9px">atanmamış</span>' : ''}</td>
            <td class="r">${p.toplam}</td><td class="r">${p.acik}</td>
            <td class="r" style="color:var(--green-text)">${p.kazanan}</td>
            <td class="r" style="color:var(--red-text)">${p.kaybeden}</td>
            <td class="r">${p.oran != null ? '%' + p.oran.toFixed(0) : '—'}</td>
            <td class="r">${p.revizyon}</td>
            <td class="r">${App.fmtTL(p.tutar)}</td></tr>`).join('')}
        </table>
        <div class="fhint" style="margin-top:8px">
          Kazanma oranı az sayıda kapanmış teklifte yanıltıcıdır — 10'un altında
          kişisel performans yorumu yapmayın.
        </div>
      </div>`;

    document.getElementById('td-excel').onclick = () => raporExcel(tumu, veri);
  }

  function raporExcel(tumu, veri) {
    try {
      const oz = TeklifTakipMotor.ozet(tumu);
      const S = [['TEKLİF DEĞERLENDİRME RAPORU'], ['Tarih', new Date().toLocaleDateString('tr')], []];
      S.push(['GENEL DURUM']);
      S.push(['Toplam teklif', oz.toplam]);
      S.push(['Standart teklif', veri.standart.length]);
      S.push(['Proje teklifi', veri.projeT.length]);
      S.push(['Açık teklif', oz.acik]);
      S.push(['Açık tutar', oz.acikTutar]);
      S.push(['Kazanılan', oz.kazanan]); S.push(['Kazanılan tutar', oz.kazanilanTutar]);
      S.push(['Kaybedilen', oz.kaybeden]); S.push(['Kaybedilen tutar', oz.kaybedilenTutar]);
      S.push(['Kazanma oranı %', oz.kazanmaOrani != null ? +oz.kazanmaOrani.toFixed(1) : '']);
      S.push(['Ortalama bekleme (gün)', oz.ortBekleme != null ? oz.ortBekleme : '']);
      S.push(['Toplam revizyon', oz.toplamRevizyon]);
      S.push(['Sorumlusu atanmamış', oz.sorumlusuz]);
      S.push([]);
      S.push(['TEKLİF LİSTESİ']);
      S.push(['Kod', 'Müşteri', 'Tip', 'Tutar', 'Durum', 'Bekleme (gün)',
        'Revizyon', 'Sorumlu', 'İrtibat', 'Bekleme Sebebi', 'Kayıp Sebebi']);
      tumu.forEach(t => S.push([
        t.kod || '', t.musteriAdi || '', t.tip === 'proje' ? 'Proje' : 'Standart',
        +t.tutar || 0, TeklifTakipMotor.durumBul(t.durum).ad,
        TeklifTakipMotor.bekleyenGun(t) ?? '', (t.revizyonlar || []).length,
        t.sorumlu || '', t.irtibatKisi || '', t.beklemeSebebi || '', t.kayipSebebi || ''
      ]));
      const ws = XLSX.utils.aoa_to_sheet(S);
      ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 20 },
        { wch: 13 }, { wch: 9 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 22 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Teklif Raporu');
      XLSX.writeFile(wb, 'teklif_raporu_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      App.toast('Rapor Excel\'e aktarıldı.', 'ok');
    } catch (e) { App.toast('Aktarılamadı: ' + (e && e.message ? e.message : e), 'err'); }
  }

  return { render };
})();
