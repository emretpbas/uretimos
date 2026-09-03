// ════════════════════════════════════════════════════════════════════════════
// UYGUNSUZLUK & DÖF — Kalite redlerinde açılan uygunsuzluk kayıtlarını (NCR) ve
// bunlara bağlı Düzeltici/Önleyici Faaliyetleri (DÖF/CAPA) yönetir.
//   - Uygunsuzluklar sekmesi: tüm NCR'ler, kaynak/sorumlu birim/durum filtresi,
//     fotoğraflı kusur detayı, uygunsuzluk formu PDF/Excel çıktısı
//   - DÖF sekmesi: sorumlu birim kök neden + düzeltici/önleyici faaliyet +
//     termin doldurup DÖF'ü kapatır
// Sorumlu birim (satınalma/üretim) kendi NCR/DÖF'lerini görür; kalite ve
// yönetim hepsini görür.
// ════════════════════════════════════════════════════════════════════════════
PageModules.uygunsuzluk_dof = (() => {
  let activeTab = 'ncr';

  const BIRIM_ETIKET = {
    satinalma: 'Satınalma', uretim_planlama: 'Üretim Planlama', kalite: 'Kalite',
    depo: 'Depo', arge: 'ARGE', teknik_ofis: 'Teknik Ofis'
  };
  const KAYNAK_ETIKET = { hammadde_girisi: 'Hammadde Girişi', uretim_urun: 'Üretim / Ürün', uretim_istasyon: 'Üretim / İstasyon Reddi', musteri_sikayeti: 'Müşteri Şikayeti (Saha)' };

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const [ncrler, dofler] = await Promise.all([
      Store.uygunsuzlukKayitlari.all(), Store.dofKayitlari.all()
    ]);
    const rol = App.state.role;
    // Sorumlu birim sadece kendi kayıtlarını görür; kalite/yönetim/arge hepsini
    const hepsiniGor = ['kalite', 'yonetim', 'arge', 'admin'].includes(rol);
    const gorunenNcr = hepsiniGor ? ncrler : ncrler.filter(n => n.sorumluBirim === rol);
    const gorunenDof = hepsiniGor ? dofler : dofler.filter(d => d.sorumluBirim === rol);

    const acikNcr = gorunenNcr.filter(n => n.durum === 'acik').length;
    const acikDof = gorunenDof.filter(d => d.durum !== 'kapandi').length;

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Uygunsuzluk & DÖF</div>
        <div class="page-sub">Kalite redlerinden doğan uygunsuzluk kayıtları (NCR) ve düzeltici/önleyici faaliyetler</div></div>
      </div>
      <div class="tabs" style="margin-bottom:16px">
        <div class="tab ${activeTab === 'ncr' ? 'active' : ''}" data-tab="ncr">Uygunsuzluklar (NCR) ${acikNcr ? `<span class="pill pill-red" style="margin-left:4px">${acikNcr}</span>` : ''}</div>
        <div class="tab ${activeTab === 'dof' ? 'active' : ''}" data-tab="dof">Düzeltici/Önleyici Faaliyet (DÖF) ${acikDof ? `<span class="pill pill-amber" style="margin-left:4px">${acikDof}</span>` : ''}</div>
      </div>
      <div id="ud-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('ud-content');
    if (activeTab === 'ncr') { content.innerHTML = renderNcrTab(gorunenNcr); wireNcrTab(gorunenNcr, dofler, render, main); }
    else { content.innerHTML = renderDofTab(gorunenDof, ncrler); wireDofTab(gorunenDof, render, main); }
  }

  function ncrDurumPill(d) {
    const map = { acik: ['Açık', 'pill-red'], inceleniyor: ['İnceleniyor', 'pill-amber'], kapandi: ['Kapandı', 'pill-green'] };
    const [l, c] = map[d] || ['Açık', 'pill-red'];
    return `<span class="pill ${c}">${l}</span>`;
  }
  function dofDurumPill(d) {
    const map = { acik: ['Açık', 'pill-red'], aksiyon_alindi: ['Aksiyon Alındı', 'pill-amber'], kapandi: ['Kapandı', 'pill-green'] };
    const [l, c] = map[d] || ['Açık', 'pill-red'];
    return `<span class="pill ${c}">${l}</span>`;
  }

  function renderNcrTab(ncrler) {
    if (!ncrler.length) {
      return `<div class="card"><div class="empty-state" style="padding:30px"><div class="eicon">✓</div><div class="etitle">Uygunsuzluk kaydı yok</div><div class="edesc">Kalite kontrolde bir hammadde veya ürün reddedildiğinde burada uygunsuzluk kaydı açılır.</div></div></div>`;
    }
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Uygunsuzluk Kayıtları (${ncrler.length})</div></div>
      <div class="fhint" style="margin-bottom:8px">Her kayıt için fotoğraflı kusur formunu PDF veya Excel olarak indirebilirsiniz.</div>
      <table class="dtable"><tr><th>NCR No</th><th>Kaynak</th><th>Kod / Ad</th><th class="r">Miktar</th><th>Sorumlu Birim</th><th>Açıklama</th><th>Foto</th><th>Durum</th><th>DÖF</th><th></th></tr>`;
    ncrler.slice().reverse().forEach(n => {
      html += `<tr>
        <td class="mono"><b>${n.no}</b><div style="font-size:10px;color:var(--text3)">${n.olusturmaTarihi || ''}</div></td>
        <td><span class="pill pill-gray">${KAYNAK_ETIKET[n.kaynak] || n.kaynak}</span></td>
        <td><b>${App.escapeHtml(n.ad || n.kod)}</b><div style="font-size:10px;color:var(--text3)" class="mono">${App.escapeHtml(n.kod || '')}</div></td>
        <td class="r">${App.fmt(n.miktar, 2)} ${App.escapeHtml(n.birim || '')}</td>
        <td>${BIRIM_ETIKET[n.sorumluBirim] || n.sorumluBirim}</td>
        <td style="font-size:11.5px;max-width:220px">${App.escapeHtml(n.aciklama || '—')}</td>
        <td class="r">${(n.fotograflar && n.fotograflar.length) ? `<button class="btn btn-sm btn-ghost ncr-foto" data-id="${n.id}">📷 ${n.fotograflar.length}</button>` : '—'}</td>
        <td>${ncrDurumPill(n.durum)}</td>
        <td>${n.dofId ? '<span class="pill pill-blue">Var</span>' : `<button class="btn btn-sm btn-ghost ncr-dof-ac" data-id="${n.id}">+ DÖF Aç</button>`}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-ghost ncr-form" data-id="${n.id}" data-fmt="pdf" title="Kusur formu PDF">PDF</button>
          <button class="btn btn-sm btn-ghost ncr-form" data-id="${n.id}" data-fmt="xlsx" title="Kusur formu Excel">Excel</button>
          ${n.durum !== 'kapandi' ? `<button class="btn btn-sm btn-green ncr-kapat" data-id="${n.id}">Kapat</button>` : ''}
        </td>
      </tr>`;
    });
    html += `</table></div>`;
    return html;
  }

  function wireNcrTab(ncrler, dofler, render, main) {
    document.querySelectorAll('.ncr-foto').forEach(b => b.onclick = () => {
      const n = ncrler.find(x => x.id === b.dataset.id);
      fotoGalerisiGoster(n);
    });
    document.querySelectorAll('.ncr-dof-ac').forEach(b => b.onclick = async () => {
      const n = ncrler.find(x => x.id === b.dataset.id);
      const dof = await App.dofOlustur(n);
      n.dofId = dof.id;
      await App.persist(() => Store.uygunsuzlukKayitlari.upsert(n));
      App.toast('DÖF açıldı: ' + dof.no, 'ok');
      render(main);
    });
    document.querySelectorAll('.ncr-kapat').forEach(b => b.onclick = () => {
      const n = ncrler.find(x => x.id === b.dataset.id);
      // BULGU (T3-28): NCR kapatılırken bağlı DÖF'ün durumu/kök neden girilip
      // girilmediği hiç kontrol edilmiyordu — açık veya kök nedeni boş bir DÖF
      // varken uygunsuzluk serbestçe kapatılabiliyor, kalite sorununun kök
      // nedeni araştırılmadan/aksiyon alınmadan unutulabiliyordu.
      if (n.dofId) {
        const dof = dofler.find(x => x.id === n.dofId);
        if (dof && dof.durum !== 'kapandi') {
          App.toast('Bu uygunsuzluğa bağlı DÖF (' + dof.no + ') henüz kapanmadı — kök neden analizi ve aksiyon tamamlanmadan NCR kapatılamaz.', 'err');
          return;
        }
      }
      App.confirmDialog('Bu uygunsuzluk kaydını kapatmak istediğinize emin misiniz?', async () => {
        n.durum = 'kapandi';
        n.kapanisTarihi = new Date().toISOString().slice(0, 10);
        await App.persist(() => Store.uygunsuzlukKayitlari.upsert(n));
        App.toast('Uygunsuzluk kapatıldı: ' + n.no, 'ok');
        render(main);
      });
    });
    document.querySelectorAll('.ncr-form').forEach(b => b.onclick = () => {
      const n = ncrler.find(x => x.id === b.dataset.id);
      if (b.dataset.fmt === 'pdf') kusurFormuPDF(n);
      else kusurFormuExcel(n);
    });
  }

  function fotoGalerisiGoster(n) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">${n.no} — ${App.escapeHtml(n.ad || n.kod)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${(n.fotograflar || []).map(f => `<img src="${f}" style="max-width:280px;max-height:280px;border-radius:8px;border:1px solid var(--border)">`).join('')}
      </div>`;
    App.openModal({ title: '📷 Kusur Fotoğrafları', body, footer: `<button class="btn" id="fg-kapat">Kapat</button>`, wide: true });
    document.getElementById('fg-kapat').onclick = App.closeModal;
  }

  function renderDofTab(dofler, ncrler) {
    if (!dofler.length) {
      return `<div class="card"><div class="empty-state" style="padding:30px"><div class="eicon">✓</div><div class="etitle">DÖF kaydı yok</div><div class="edesc">Uygunsuzluklara bağlı düzeltici/önleyici faaliyetler burada listelenir.</div></div></div>`;
    }
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Düzeltici / Önleyici Faaliyetler (${dofler.length})</div></div>
      <div class="fhint" style="margin-bottom:8px">Sorumlu birim kök neden analizini, düzeltici ve önleyici faaliyetleri ve terminini doldurup DÖF'ü kapatır.</div>
      <table class="dtable"><tr><th>DÖF No</th><th>Bağlı NCR</th><th>Konu</th><th>Sorumlu</th><th>Kök Neden</th><th>Termin</th><th>Durum</th><th></th></tr>`;
    dofler.slice().reverse().forEach(d => {
      html += `<tr>
        <td class="mono"><b>${d.no}</b><div style="font-size:10px;color:var(--text3)">${d.olusturmaTarihi || ''}</div></td>
        <td class="mono">${d.ncrNo || '—'}</td>
        <td style="font-size:11.5px;max-width:200px">${App.escapeHtml(d.konu || '—')}</td>
        <td>${BIRIM_ETIKET[d.sorumluBirim] || d.sorumluBirim}</td>
        <td style="font-size:11px;max-width:180px">${d.kokNeden ? App.escapeHtml(d.kokNeden) : '<span style="color:var(--red-text)">Doldurulmadı</span>'}</td>
        <td style="font-size:11px">${d.termin || '—'}</td>
        <td>${dofDurumPill(d.durum)}</td>
        <td><button class="btn btn-sm btn-blue dof-duzenle" data-id="${d.id}">${d.durum === 'kapandi' ? 'Görüntüle' : 'Doldur / Kapat'}</button></td>
      </tr>`;
    });
    html += `</table></div>`;
    return html;
  }

  function wireDofTab(dofler, render, main) {
    document.querySelectorAll('.dof-duzenle').forEach(b => b.onclick = () => {
      const d = dofler.find(x => x.id === b.dataset.id);
      dofDuzenleModal(d, render, main);
    });
  }

  function dofDuzenleModal(d, render, main) {
    const kapali = d.durum === 'kapandi';
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="background:#F1F5F9;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px">
        <b>${d.no}</b> · Bağlı Uygunsuzluk: <b>${d.ncrNo || '—'}</b> · Konu: ${App.escapeHtml(d.konu || '')}
      </div>
      <div class="fgroup"><label class="flbl">Kök Neden Analizi ${kapali ? '' : '<span style="color:var(--red-text)">*</span>'}</label>
        <textarea class="ftextarea" id="dof-koknedeni" rows="2" ${kapali ? 'disabled' : ''} placeholder="Sorunun asıl kaynağı nedir?">${App.escapeHtml(d.kokNeden || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">Düzeltici Faaliyet (mevcut sorunu gidermek için)</label>
        <textarea class="ftextarea" id="dof-duzeltici" rows="2" ${kapali ? 'disabled' : ''} placeholder="Bu sorunu düzeltmek için ne yapıldı/yapılacak?">${App.escapeHtml(d.duzelticiFaaliyet || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">Önleyici Faaliyet (tekrarını önlemek için)</label>
        <textarea class="ftextarea" id="dof-onleyici" rows="2" ${kapali ? 'disabled' : ''} placeholder="Tekrar yaşanmaması için ne yapılacak?">${App.escapeHtml(d.onleyiciFaaliyet || '')}</textarea></div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Termin Tarihi</label>
          <input type="date" class="finput" id="dof-termin" ${kapali ? 'disabled' : ''} value="${d.termin || ''}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Sorumlu Birim</label>
          <input class="finput" value="${BIRIM_ETIKET[d.sorumluBirim] || d.sorumluBirim}" disabled></div>
      </div>
    `;
    const footer = kapali
      ? `<button class="btn" id="dof-kapat-modal">Kapat</button>`
      : `<button class="btn" id="dof-kapat-modal">Vazgeç</button>
         <button class="btn btn-blue" id="dof-kaydet">Kaydet</button>
         <button class="btn btn-green" id="dof-tamamla">Kaydet & DÖF'ü Kapat</button>`;
    App.openModal({ title: '⚙ DÖF Detayı — ' + d.no, body, footer, wide: true });
    document.getElementById('dof-kapat-modal').onclick = App.closeModal;

    if (!kapali) {
      const topla = () => {
        d.kokNeden = document.getElementById('dof-koknedeni').value.trim();
        d.duzelticiFaaliyet = document.getElementById('dof-duzeltici').value.trim();
        d.onleyiciFaaliyet = document.getElementById('dof-onleyici').value.trim();
        d.termin = document.getElementById('dof-termin').value;
      };
      document.getElementById('dof-kaydet').onclick = async () => {
        topla();
        d.durum = (d.kokNeden || d.duzelticiFaaliyet) ? 'aksiyon_alindi' : 'acik';
        await App.persist(() => Store.dofKayitlari.upsert(d));
        App.toast('DÖF kaydedildi: ' + d.no, 'ok');
        App.closeModal(); render(main);
      };
      document.getElementById('dof-tamamla').onclick = async () => {
        topla();
        if (!d.kokNeden) { App.toast('Kök neden analizi zorunlu', 'err'); return; }
        d.durum = 'kapandi';
        d.kapanisTarihi = new Date().toISOString().slice(0, 10);
        await App.persist(() => Store.dofKayitlari.upsert(d));
        App.toast('DÖF kapatıldı: ' + d.no, 'ok');
        App.closeModal(); render(main);
      };
    }
  }

  // ── KUSUR FORMU ÇIKTILARI (PDF / Excel) ─────────────────────────────────
  function kusurFormuExcel(n) {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['UYGUNSUZLUK / KUSUR FORMU'],
      [],
      ['NCR No', n.no],
      ['Tarih', n.olusturmaTarihi || ''],
      ['Kaynak', KAYNAK_ETIKET[n.kaynak] || n.kaynak],
      ['Kod', n.kod || ''],
      ['Ad', n.ad || ''],
      ['Miktar', (n.miktar || '') + ' ' + (n.birim || '')],
      ['Sorumlu Birim', BIRIM_ETIKET[n.sorumluBirim] || n.sorumluBirim],
      ['Tedarikçi', n.tedarikciAdi || '—'],
      ['Durum', n.durum],
      ['Oluşturan', n.olusturan || ''],
      [],
      ['Kusur Açıklaması'],
      [n.aciklama || ''],
      [],
      ['Fotoğraf Sayısı', (n.fotograflar || []).length]
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Uygunsuzluk');
    XLSX.writeFile(wb, `Uygunsuzluk_${n.no}.xlsx`);
    App.toast('Excel indirildi: ' + n.no, 'ok');
  }

  function kusurFormuPDF(n) {
    // Yazdırılabilir HTML penceresi (tarayıcı "PDF olarak kaydet" ile PDF üretir).
    // Fotoğraflar 1080p'ye küçültülmüş dataURL olarak gömülür.
    const w = window.open('', '_blank');
    if (!w) { App.toast('Açılır pencere engellendi, izin verin', 'err'); return; }
    const fotoHtml = (n.fotograflar || []).map(f =>
      `<img src="${f}" style="max-width:48%;max-height:340px;margin:6px;border:1px solid #ccc;border-radius:6px">`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Uygunsuzluk Formu ${n.no}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;color:#1e293b;max-width:800px;margin:0 auto}
        h1{font-size:20px;border-bottom:3px solid #1d4ed8;padding-bottom:8px;margin-bottom:4px}
        .sub{color:#64748b;font-size:12px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:13px}
        td{padding:7px 10px;border:1px solid #e2e8f0}
        td.lbl{background:#f1f5f9;font-weight:700;width:180px}
        .aciklama{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:13px;margin-bottom:18px}
        .foto-baslik{font-weight:700;font-size:13px;margin-bottom:8px}
        .fotolar{display:flex;flex-wrap:wrap}
        @media print{button{display:none}}
      </style></head><body>
      <h1>Uygunsuzluk / Kusur Formu</h1>
      <div class="sub">${n.no} · ${n.olusturmaTarihi || ''}</div>
      <table>
        <tr><td class="lbl">Kaynak</td><td>${KAYNAK_ETIKET[n.kaynak] || n.kaynak}</td></tr>
        <tr><td class="lbl">Kod</td><td>${(n.kod || '').replace(/</g, '&lt;')}</td></tr>
        <tr><td class="lbl">Ad</td><td>${(n.ad || '').replace(/</g, '&lt;')}</td></tr>
        <tr><td class="lbl">Miktar</td><td>${n.miktar || ''} ${n.birim || ''}</td></tr>
        <tr><td class="lbl">Sorumlu Birim</td><td>${BIRIM_ETIKET[n.sorumluBirim] || n.sorumluBirim}</td></tr>
        ${n.tedarikciAdi ? `<tr><td class="lbl">Tedarikçi</td><td>${(n.tedarikciAdi || '').replace(/</g, '&lt;')}</td></tr>` : ''}
        <tr><td class="lbl">Durum</td><td>${n.durum}</td></tr>
        <tr><td class="lbl">Oluşturan</td><td>${(n.olusturan || '').replace(/</g, '&lt;')}</td></tr>
      </table>
      <div class="foto-baslik">Kusur Açıklaması</div>
      <div class="aciklama">${(n.aciklama || '—').replace(/</g, '&lt;')}</div>
      ${fotoHtml ? `<div class="foto-baslik">Kusur Fotoğrafları (${(n.fotograflar || []).length})</div><div class="fotolar">${fotoHtml}</div>` : ''}
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 Yazdır / PDF olarak kaydet</button>
      </body></html>`);
    w.document.close();
    App.toast('Kusur formu açıldı — Yazdır ile PDF kaydedin', 'ok');
  }

  return { render };
})();
