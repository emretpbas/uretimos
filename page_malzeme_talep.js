// ════════════════════════════════════════════════════════════════════════════
// KAYIP-KAÇAK KATMAN 1+2 — MALZEME TALEP / ONAY / TESLİM EKRANI
// ────────────────────────────────────────────────────────────────────────────
// Her stok çıkışının SAHİBİ (talep eden), GEREKÇESİ ve ONAYLAYANI olur.
// Görev ayrılığı ve çift onay kuralları KayipKacak modülünde zorlanır;
// bu ekran yalnızca arayüzdür.
//   1) Talep aç  → 2) Onay (talep edenden farklı kişi) → 3) Depo teslimi
// Teslimde stokHareketleri'ne sahipli çıkış yazılır (kim istedi/onayladı/verdi).
// ════════════════════════════════════════════════════════════════════════════
PageModules.malzeme_talep = (() => {

  const DURUM_AD = {
    beklemede: 'Onay bekliyor',
    onaylandi: 'Onaylandı — teslim bekliyor',
    teslim_edildi: 'Teslim edildi',
    reddedildi: 'Reddedildi',
    kapatildi: 'Kapatıldı'
  };
  const DURUM_RENK = {
    beklemede: 'pill-amber', onaylandi: 'pill-blue',
    teslim_edildi: 'pill-green', reddedildi: 'pill-red', kapatildi: 'pill-gray'
  };

  async function render(main) {
    if (typeof KayipKacak === 'undefined') {
      main.innerHTML = '<div class="card"><div class="empty-state" style="padding:24px"><div class="edesc">Kayıp-kaçak modülü yüklenemedi.</div></div></div>';
      return;
    }
    const [talepler, hammaddeler, isemirleri] = await Promise.all([
      Store.malzemeTalepleri.all(), Store.hammaddeler.all(), Store.isemirleri.all()
    ]);
    const rol = App.aktifRol();
    const bekleyen = talepler.filter(t => t.durum === 'beklemede');
    const onayli = talepler.filter(t => t.durum === 'onaylandi');
    const gecmis = talepler.filter(t => ['teslim_edildi', 'reddedildi', 'kapatildi'].includes(t.durum)).slice(-20).reverse();

    // Onay yetkisi olan roller (görev ayrılığı ayrıca kişi bazında zorlanır)
    const onaylayabilir = ['admin', 'yonetim', 'uretim_planlama', 'depo', 'satinalma'].includes(rol);
    const teslimEdebilir = ['admin', 'yonetim', 'depo'].includes(rol);

    const anormalToplam = talepler.filter(t => t.normalMi === false && t.durum === 'teslim_edildi')
      .reduce((s, t) => s + (+t.miktar || 0), 0);

    const talepKart = (t, mod) => {
      const tipRozet = t.normalMi === false
        ? `<span class="pill pill-red" style="font-size:9px">${App.escapeHtml(t.kayipTipiAd || '')}</span>`
        : `<span class="pill pill-blue" style="font-size:9px">${App.escapeHtml(t.kayipTipiAd || '')}</span>`;
      const ciftOnay = t.ciftOnayGerekli
        ? `<span class="pill pill-amber" style="font-size:9px">ÇİFT ONAY${t.onaylayan ? ' — 1/2 verildi (' + App.escapeHtml(t.onaylayan) + ')' : ''}</span>` : '';
      return `<div style="border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin-bottom:8px;background:var(--surface2)">
        <div>${tipRozet} ${ciftOnay}
          <div style="margin-top:4px;font-size:13px"><b>${App.escapeHtml(t.kalemAdi || '')}</b> — ${t.miktar} ${App.escapeHtml(t.birim || '')}</div>
          <div class="muted" style="font-size:11px;margin-top:2px">Gerekçe: ${App.escapeHtml(t.gerekce || '')}</div>
          <div class="muted" style="font-size:10.5px;margin-top:2px">
            Talep eden: <b>${App.escapeHtml(t.talepEden || '')}</b> · ${(t.talepTarihi || '').slice(0, 10)}
            ${t.isEmriId ? ' · İş emri: ' + App.escapeHtml(t.isEmriId) : ' · <span style="color:var(--amber-text)">işe bağlı değil</span>'}
            ${t.tahminiTutar ? ' · ~' + App.fmtTL(t.tahminiTutar) : ''}
          </div>
          ${t.onaylayan ? `<div class="muted" style="font-size:10px">✓ Onay: ${App.escapeHtml(t.onaylayan)}${t.ikinciOnaylayan ? ' + ' + App.escapeHtml(t.ikinciOnaylayan) : ''}</div>` : ''}
          ${t.teslimEden ? `<div class="muted" style="font-size:10px">📦 Teslim: ${App.escapeHtml(t.teslimEden)}</div>` : ''}
          ${t.redSebebi ? `<div style="font-size:10.5px;color:var(--red-text)">✕ ${App.escapeHtml(t.redSebebi)}</div>` : ''}
        </div>
        ${mod === 'onay' && onaylayabilir ? `<div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn btn-sm btn-green mt-onay" data-id="${t.id}">✓ Onayla</button>
          <button class="btn btn-sm mt-red" data-id="${t.id}" style="background:var(--red);color:#fff;border:none">✕ Reddet</button>
        </div>` : ''}
        ${mod === 'teslim' && teslimEdebilir ? `<div style="margin-top:8px">
          <button class="btn btn-sm btn-blue mt-teslim" data-id="${t.id}">📦 Depodan Teslim Et</button>
        </div>` : ''}
      </div>`;
    };

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">📦 Malzeme Talep & Kayıp Kontrolü</div>
          <div class="page-sub">Her stok çıkışının sahibi, gerekçesi ve onaylayanı olur — talep → onay → teslim</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="mt-yeni">+ Malzeme Talebi Aç</button></div>
      </div>

      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">ONAY BEKLEYEN</div><div class="kpi-value">${bekleyen.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">TESLİM BEKLEYEN</div><div class="kpi-value">${onayli.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">ANORMAL ÇIKIŞ (fire/hasar/kayıp)</div><div class="kpi-value">${App.fmt(anormalToplam)}</div></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">1️⃣ Onay Bekleyenler (${bekleyen.length})</div></div>
        ${bekleyen.length ? bekleyen.map(t => talepKart(t, 'onay')).join('')
          : '<div class="muted" style="padding:10px;font-size:12px">Onay bekleyen talep yok.</div>'}
        ${!onaylayabilir && bekleyen.length ? '<div class="muted" style="padding:6px 10px;font-size:11px">Onay yetkiniz yok — Planlama/Depo/Satınalma/Yönetim onaylayabilir.</div>' : ''}
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">2️⃣ Teslim Bekleyenler (${onayli.length})</div></div>
        ${onayli.length ? onayli.map(t => talepKart(t, 'teslim')).join('')
          : '<div class="muted" style="padding:10px;font-size:12px">Teslim bekleyen talep yok.</div>'}
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Geçmiş (son ${gecmis.length})</div></div>
        ${gecmis.length ? gecmis.map(t => `<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--border)">
            <span class="pill ${DURUM_RENK[t.durum]}" style="font-size:9px">${DURUM_AD[t.durum]}</span>
            <b>${App.escapeHtml(t.kalemAdi || '')}</b> — ${t.miktar} ${App.escapeHtml(t.birim || '')}
            <span class="muted">· ${App.escapeHtml(t.kayipTipiAd || '')} · ${App.escapeHtml(t.talepEden || '')}${t.onaylayan ? ' → ' + App.escapeHtml(t.onaylayan) : ''}${t.teslimEden ? ' → ' + App.escapeHtml(t.teslimEden) : ''}</span>
          </div>`).join('') : '<div class="muted" style="padding:10px;font-size:12px">Kayıt yok.</div>'}
      </div>`;

    // ── Yeni talep ─────────────────────────────────────────────────────────
    document.getElementById('mt-yeni').onclick = () => {
      const body = `
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">
          Depodan çıkacak her malzeme için talep açın. Gerekçe zorunludur; işe bağlı olmayan
          çıkışlar ayrıca raporlanır. Talebinizi kendiniz onaylayamazsınız.
        </div>
        <div style="position:relative;margin-bottom:6px">
          <input id="mt-kalem" placeholder="🔍 Hammadde seç / ara..." autocomplete="off" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:7px;font-size:12.5px">
          <div id="mt-panel" style="display:none;position:absolute;z-index:50;left:0;right:0;top:calc(100% + 2px);max-height:200px;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18)"></div>
        </div>
        <input type="hidden" id="mt-hmid">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input id="mt-miktar" type="number" step="0.001" min="0" placeholder="Miktar" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:7px;font-size:12.5px">
          <input id="mt-birim" placeholder="birim" style="width:80px;padding:8px;border:1px solid var(--border);border-radius:7px;font-size:12.5px">
          <input id="mt-tutar" type="number" step="0.01" min="0" placeholder="~Tutar ₺" style="width:100px;padding:8px;border:1px solid var(--border);border-radius:7px;font-size:12.5px" title="Tahmini tutar — ${KayipKacak.CIFT_ONAY_TUTAR_ESIGI} ₺ üstü çift onay ister">
        </div>
        <label class="flbl">Çıkış / Kayıp Tipi</label>
        <select id="mt-tip" class="fselect" style="width:100%;margin-bottom:6px">
          ${KayipKacak.KAYIP_TIPLERI.map(t => `<option value="${t.id}">${App.escapeHtml(t.ad)}</option>`).join('')}
        </select>
        <label class="flbl">İş Emri (varsa — işe bağlı olmayan çıkış ayrı izlenir)</label>
        <select id="mt-isemri" class="fselect" style="width:100%;margin-bottom:6px">
          <option value="">— işe bağlı değil —</option>
          ${isemirleri.slice(-100).reverse().map(i => `<option value="${App.escapeHtml(i.id)}">${App.escapeHtml((i.kod || i.id) + ' — ' + (i.ad || ''))}</option>`).join('')}
        </select>
        <label class="flbl">Gerekçe (zorunlu)</label>
        <textarea id="mt-gerekce" rows="2" placeholder="Örn: Kesimde ölçü hatası, plaka fire oldu" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:7px;font-size:12.5px;resize:vertical"></textarea>`;

      App.openModal({
        title: '+ Malzeme Talebi', sub: 'Talep eden: ' + App.escapeHtml(KayipKacak.aktifKullanici()),
        body,
        footer: '<button class="btn" id="mt-vaz">Vazgeç</button><button class="btn btn-green" id="mt-kaydet">Talebi Gönder</button>'
      });

      const inp = document.getElementById('mt-kalem');
      const panel = document.getElementById('mt-panel');
      const hmid = document.getElementById('mt-hmid');
      const ciz = (f) => {
        const q = (f || '').toLocaleLowerCase('tr');
        const liste = hammaddeler.filter(h => !q || (h.ad || '').toLocaleLowerCase('tr').includes(q) || (h.stokKodu || '').toLocaleLowerCase('tr').includes(q)).slice(0, 80);
        panel.innerHTML = liste.length ? liste.map(h => `<div class="mt-sec" data-id="${h.id}" data-ad="${App.escapeHtml(h.ad)}" data-birim="${App.escapeHtml(h.birim || '')}" style="padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;font-size:12.5px"><b>${App.escapeHtml(h.ad)}</b>${h.stokKodu ? ` <span class="muted mono" style="font-size:10.5px">${App.escapeHtml(h.stokKodu)}</span>` : ''}</div>`).join('')
          : '<div style="padding:10px;font-size:12px;color:var(--muted)">Eşleşme yok — adı elle yazabilirsiniz.</div>';
        panel.querySelectorAll('.mt-sec').forEach(s => s.onclick = () => {
          inp.value = s.dataset.ad; hmid.value = s.dataset.id;
          if (s.dataset.birim && !document.getElementById('mt-birim').value) document.getElementById('mt-birim').value = s.dataset.birim;
          panel.style.display = 'none';
        });
      };
      inp.onfocus = () => { ciz(inp.value); panel.style.display = 'block'; };
      inp.oninput = () => { hmid.value = ''; ciz(inp.value); panel.style.display = 'block'; };

      document.getElementById('mt-vaz').onclick = App.closeModal;
      document.getElementById('mt-kaydet').onclick = async () => {
        try {
          const r = await KayipKacak.talepOlustur({
            kalemAdi: inp.value.trim(),
            hammaddeId: hmid.value || null,
            miktar: parseFloat(document.getElementById('mt-miktar').value),
            birim: document.getElementById('mt-birim').value.trim() || 'adet',
            kayipTipi: document.getElementById('mt-tip').value,
            gerekce: document.getElementById('mt-gerekce').value,
            isEmriId: document.getElementById('mt-isemri').value || null,
            tahminiTutar: parseFloat(document.getElementById('mt-tutar').value) || 0
          });
          if (!r.ok) { App.toast(r.hata, 'err'); return; }
          App.closeModal();
          App.toast(r.talep.ciftOnayGerekli ? 'Talep gönderildi — tutar eşiği nedeniyle ÇİFT ONAY gerekiyor.' : 'Talep gönderildi, onaya düştü.', 'ok');
          render(main);
        } catch (e) {
          App.toast('Talep gönderilemedi: ' + (e && e.message ? e.message : e), 'err');
        }
      };
    };

    // ── Onayla / Reddet / Teslim ───────────────────────────────────────────
    main.querySelectorAll('.mt-onay').forEach(b => b.onclick = async () => {
      try {
        const r = await KayipKacak.onayla(b.dataset.id, App.aktifRol());
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.toast(r.ikinciOnayBekliyor ? 'İlk onay verildi — ikinci onay farklı bir yetkiliden gerekiyor.' : 'Talep onaylandı, teslime hazır.', 'ok');
        render(main);
      } catch (e) { App.toast('Onaylanamadı: ' + (e && e.message ? e.message : e), 'err'); }
    });

    main.querySelectorAll('.mt-red').forEach(b => b.onclick = async () => {
      try {
        const sebep = App.redGerekceDialog ? await App.redGerekceDialog('Talep reddi') : prompt('Red sebebi:');
        if (!sebep) return;
        const r = await KayipKacak.reddet(b.dataset.id, App.aktifRol(), sebep);
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.toast('Talep reddedildi.', 'ok');
        render(main);
      } catch (e) { App.toast('Reddedilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    });

    main.querySelectorAll('.mt-teslim').forEach(b => b.onclick = async () => {
      try {
        const r = await KayipKacak.teslimEt(b.dataset.id, App.aktifRol());
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        App.toast('Teslim edildi — stok hareketi sahipli olarak kaydedildi.', 'ok');
        render(main);
      } catch (e) { App.toast('Teslim edilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    });
  }

  return { render };
})();
