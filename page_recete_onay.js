// ════════════════════════════════════════════════════════════════════════════
// REÇETE TALEP ONAY EKRANI (Katman D + E)
// Hattan gelen eksik malzeme / kart açma taleplerini gösterir ve onaylatır:
//   • PLANLAMA rolü → "planlama_bekliyor" taleplerini onaylar/reddeder (1. kademe)
//   • ARGE / TEKNİK rolü → "arge_teknik_bekliyor" taleplerini reçeteye işler (2. kademe)
// Görev ayrılığı ve üç göz ilkesi ReceteTalep modülünde zorlanır; bu ekran sadece
// arayüz. Kart talepleri için "önce kart aç" yönlendirmesi yapılır.
// ════════════════════════════════════════════════════════════════════════════
PageModules.recete_onay = (() => {

  async function render(main) {
    const [talepler, hammaddeler, yarimamuller] = await Promise.all([
      Store.receteTalepleri.all(), Store.hammaddeler.all(), Store.yarimamuller.all()
    ]);
    const rol = App.aktifRol();
    const planlamaBekleyen = talepler.filter(t => t.durum === 'planlama_bekliyor');
    const argeBekleyen = talepler.filter(t => t.durum === 'arge_teknik_bekliyor');
    const islenmis = talepler.filter(t => t.durum === 'receteye_islendi').slice(-15).reverse();
    const reddedilen = talepler.filter(t => t.durum === 'reddedildi').slice(-10).reverse();

    const hmAd = (id) => { const h = hammaddeler.find(x => x.id === id); return h ? h.ad : (id || '—'); };
    const tipRozet = (t) => t.tip === 'kart_talebi'
      ? '<span class="pill" style="background:#ede4ff;color:#5a3ec8;font-size:9px">KART TALEBİ</span>'
      : t.tip === 'miktar_duzeltme'
      ? '<span class="pill" style="background:#fff3cd;color:#8a6100;font-size:9px">MİKTAR DÜZELTME</span>'
      : '<span class="pill pill-blue" style="font-size:9px">EKSİK MALZEME</span>';

    const talepKart = (t, kademe) => {
      const malzeme = t.tip === 'kart_talebi'
        ? `🆕 <b>${App.escapeHtml(t.kartAciklama || '')}</b>`
        : t.tip === 'miktar_duzeltme'
        ? `<b>${App.escapeHtml(t.hammaddeAd || hmAd(t.hammaddeId))}</b> — reçete: <s>${t.eskiMiktar}</s> → <b style="color:var(--amber-text)">${t.miktar}</b> ${App.escapeHtml(t.birim || '')}`
        : `<b>${App.escapeHtml(t.hammaddeAd || hmAd(t.hammaddeId))}</b> — ${t.miktar} ${App.escapeHtml(t.birim || '')}`;
      const kartUyari = (kademe === 'arge' && t.tip === 'kart_talebi' && !t.hammaddeId)
        ? `<div style="font-size:11px;color:var(--amber-text);background:var(--amber-bg);padding:6px 8px;border-radius:6px;margin:6px 0">
             ⚠ Bu bir kart açma talebi. Reçeteye işlemek için önce hammadde kartını açıp bağlayın.
             <div style="margin-top:6px;font-size:11px;color:var(--muted)">Operatörün tanımı: <b>${App.escapeHtml(t.kartAciklama || '')}</b></div>
             <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
               <input list="ro-hm-${t.id}" id="ro-hmsec-${t.id}" placeholder="Mevcut kartı ara..." style="flex:1;min-width:140px;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:11.5px">
               <datalist id="ro-hm-${t.id}">${hammaddeler.slice(0,500).map(h=>`<option value="${App.escapeHtml(h.ad)}" data-id="${h.id}"></option>`).join('')}</datalist>
               <button class="btn btn-sm ro-bagla" data-id="${t.id}">Bağla</button>
               <button class="btn btn-sm ro-yenikart" data-id="${t.id}" data-tanim="${App.escapeHtml(t.kartAciklama || '')}" style="background:var(--blue);color:#fff;border:none">+ Yeni Hammadde Tanımla</button>
             </div>
           </div>` : '';
      return `<div style="border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin-bottom:8px;background:var(--surface2)">
        <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap">
          <div style="flex:1">${tipRozet(t)} <span class="mono" style="font-size:11px">${App.escapeHtml(t.ymKod||'')}</span> — ${App.escapeHtml(t.ymAd||'')}<br>
            <div style="margin-top:3px;font-size:12.5px">${malzeme}</div>
            <div class="muted" style="font-size:10.5px;margin-top:2px">Talep eden: <b>${App.escapeHtml(t.operator)}</b> · ${(t.tarih||'').slice(0,10)}${t.gerekce ? ' · ' + App.escapeHtml(t.gerekce) : ''}</div>
            ${t.planlamaOnay ? `<div class="muted" style="font-size:10px">✓ Planlama: ${App.escapeHtml(t.planlamaOnay.kim)}</div>` : ''}
          </div>
        </div>
        ${kartUyari}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          ${kademe === 'planlama'
            ? `<button class="btn btn-sm btn-green ro-planla-onay" data-id="${t.id}">✓ Planlama Onayı</button>`
            : `<button class="btn btn-sm btn-green ro-arge-onay" data-id="${t.id}">${t.tip === 'miktar_duzeltme' ? '✓ Onayla & Miktarı Güncelle' : '✓ Onayla & Reçeteye Ekle'}</button>`}
          <button class="btn btn-sm ro-red" data-id="${t.id}" style="background:var(--red);color:#fff;border:none">✕ Reddet</button>
        </div>
      </div>`;
    };

    // Rol bazlı görünüm: planlama rolü planlama kademesini, teknik/arge rolü 2. kademeyi görür
    const planlamaGorur = ['admin', 'yonetim', 'uretim_planlama'].includes(rol);
    const argeGorur = ['admin', 'yonetim', 'arge', 'teknik_ofis'].includes(rol);

    let html = `<div class="page-hdr"><div>
      <div class="page-title">🔗 Reçete Talep Onayları</div>
      <div class="page-sub">Hattan gelen eksik malzeme ve kart açma talepleri — Planlama → ARGE/Teknik onay zinciri</div>
    </div></div>`;

    if (!planlamaGorur && !argeGorur) {
      html += `<div class="card"><div class="empty-state" style="padding:24px"><div class="edesc">Bu ekranı görüntüleme yetkiniz yok. Planlama, ARGE veya Teknik Ofis rolü gerekir.</div></div></div>`;
      main.innerHTML = html; return;
    }

    if (planlamaGorur) {
      html += `<div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">1️⃣ Planlama Onayı Bekleyenler (${planlamaBekleyen.length})</div></div>
        ${planlamaBekleyen.length ? planlamaBekleyen.map(t => talepKart(t, 'planlama')).join('') : '<div class="muted" style="padding:10px;font-size:12px">Bekleyen talep yok.</div>'}
      </div>`;
    }
    if (argeGorur) {
      html += `<div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">2️⃣ ARGE / Teknik Onayı Bekleyenler (${argeBekleyen.length})</div></div>
        ${argeBekleyen.length ? argeBekleyen.map(t => talepKart(t, 'arge')).join('') : '<div class="muted" style="padding:10px;font-size:12px">Bekleyen talep yok.</div>'}
      </div>`;
    }
    if (islenmis.length) {
      html += `<div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">✓ Reçeteye İşlenenler (son ${islenmis.length})</div></div>
        ${islenmis.map(t => `<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--border)">
          ✓ <b>${App.escapeHtml(t.hammaddeAd || t.kartAciklama || '')}</b> → <span class="mono">${App.escapeHtml(t.ymKod||'')}</span>
          <span class="muted">· ${App.escapeHtml(t.operator)} → ${t.argeTeknikOnay ? App.escapeHtml(t.argeTeknikOnay.kim) : ''}</span></div>`).join('')}
      </div>`;
    }
    if (reddedilen.length) {
      html += `<div class="card">
        <div class="card-hdr"><div class="card-title">✕ Reddedilenler (son ${reddedilen.length})</div></div>
        ${reddedilen.map(t => `<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--border);color:var(--muted)">
          ✕ ${App.escapeHtml(t.hammaddeAd || t.kartAciklama || '')} <span class="mono">${App.escapeHtml(t.ymKod||'')}</span> — ${App.escapeHtml(t.redSebebi || '')}</div>`).join('')}
      </div>`;
    }

    main.innerHTML = html;

    // Kart → hammadde bağla
    main.querySelectorAll('.ro-bagla').forEach(b => b.onclick = async () => {
      const id = b.dataset.id;
      const inp = document.getElementById('ro-hmsec-' + id);
      const opt = [...document.querySelectorAll('#ro-hm-' + id + ' option')].find(o => o.value === inp.value);
      if (!opt) { App.toast('Listeden bir hammadde seçin.', 'err'); return; }
      const h = hammaddeler.find(x => x.id === opt.dataset.id);
      const r = await ReceteTalep.karteHammaddeBagla(id, opt.dataset.id, h ? h.ad : inp.value);
      if (r.ok) { App.toast('Kart bağlandı. Artık reçeteye işlenebilir.', 'ok'); render(main); }
      else App.toast(r.hata, 'err');
    });

    // Kart → YENİ hammadde tanımla (bu ekrandan çıkmadan) + otomatik bağla
    main.querySelectorAll('.ro-yenikart').forEach(b => b.onclick = () => {
      const talepId = b.dataset.id;
      const tanim = b.dataset.tanim || '';
      if (!PageModules.hammadde || !PageModules.hammadde.openForm) {
        App.toast('Hammadde tanımlama modülü yüklenemedi.', 'err'); return;
      }
      // Hammadde formunu aç (ad alanı operatörün tanımıyla ön-dolu); kaydedilince otomatik bağla
      PageModules.hammadde.openForm(null, async (yeniKayit) => {
        if (yeniKayit && yeniKayit.id) {
          const r = await ReceteTalep.karteHammaddeBagla(talepId, yeniKayit.id, yeniKayit.ad || '');
          if (r.ok) App.toast('Yeni kart açıldı ve talebe bağlandı. Artık reçeteye işlenebilir.', 'ok');
          else App.toast('Kart açıldı ama bağlanamadı: ' + r.hata, 'err');
        }
        render(main);
      }, { ad: tanim });
    });

    // Planlama onayı
    main.querySelectorAll('.ro-planla-onay').forEach(b => b.onclick = async () => {
      const r = await ReceteTalep.planlamaOnayla(b.dataset.id, App.aktifRol());
      if (r.ok) { App.toast('Planlama onayı verildi — ARGE/Teknik onayına geçti.', 'ok'); render(main); }
      else App.toast(r.hata, 'err');
    });

    // ARGE/Teknik onayı → reçeteye işle
    main.querySelectorAll('.ro-arge-onay').forEach(b => b.onclick = async () => {
      const r = await ReceteTalep.argeTeknikOnayla(b.dataset.id, App.aktifRol());
      if (r.ok) { App.toast(r.miktarGuncellendi ? 'Onaylandı — reçetedeki miktar güncellendi.' : 'Onaylandı ve reçeteye alt kalem olarak eklendi.', 'ok'); render(main); }
      else App.toast(r.hata, 'err');
    });

    // Reddet
    main.querySelectorAll('.ro-red').forEach(b => b.onclick = async () => {
      const sebep = await App.redGerekceDialog ? await App.redGerekceDialog('Talep reddi') : prompt('Red sebebi:');
      if (!sebep) return;
      const r = await ReceteTalep.reddet(b.dataset.id, App.aktifRol(), sebep);
      if (r.ok) { App.toast('Talep reddedildi.', 'ok'); render(main); }
      else App.toast(r.hata, 'err');
    });
  }

  return { render };
})();
