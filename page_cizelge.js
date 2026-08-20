// ════════════════════════════════════════════════════════════════════════════
// ÜRETİM ÇİZELGESİ — sonlu kapasiteye göre "hangi iş, hangi gün, hangi hatta"
//   Sekme 1: 📅 Gantt — işlerin hat bazlı zaman çizelgesi
//   Sekme 2: 📊 Hat Doluluk — günlük kapasite kullanımı, darboğaz tespiti
//   Sekme 3: ⏰ Termin Riski — sözü verilen termin vs çizelgeye göre gerçekçi
//            bitiş; geciken siparişler önceden görülür
// ════════════════════════════════════════════════════════════════════════════
PageModules.cizelge = (() => {
  let activeTab = 'gantt';
  let haftaSonuCalis = false;
  let sonuc = null;

  const bugun = () => new Date().toISOString().slice(0, 10);
  const gunFark = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

  async function render(main, params) {
    // Sayfaya her GİRİŞTE çizelge yeniden hesaplanır (veri değişmiş olabilir).
    // Sekme geçişlerinde önbellek korunur (koruCache) — gereksiz hesap olmasın.
    if (!(params && params.koruCache)) sonuc = null;
    if (params && params.tab) activeTab = params.tab;
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Üretim Çizelgesi</div>
        <div class="page-sub">Sonlu kapasite planlama — işler hat kapasitesine göre günlere dağıtılır, gerçekçi termin hesaplanır</div></div>
        <div class="page-acts">
          <label style="font-size:11.5px;display:flex;align-items:center;gap:6px;margin-right:8px">
            <input type="checkbox" id="cz-haftasonu" ${haftaSonuCalis ? 'checked' : ''}> Hafta sonu çalış</label>
          <button class="btn btn-blue" id="cz-yenile">↻ Çizelgeyi Yenile</button>
        </div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'gantt' ? 'active' : ''}" data-tab="gantt">📅 Çizelge (Gantt)</div>
        <div class="tab ${activeTab === 'doluluk' ? 'active' : ''}" data-tab="doluluk">📊 Hat Doluluk</div>
        <div class="tab ${activeTab === 'termin' ? 'active' : ''}" data-tab="termin">⏰ Termin Riski</div>
      </div>
      <div id="cz-content"><div style="padding:40px;text-align:center"><div class="loading-spin" style="margin:0 auto"></div></div></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => render(main, { tab: t.dataset.tab, koruCache: true }));
    document.getElementById('cz-yenile').onclick = () => render(main);
    document.getElementById('cz-haftasonu').onchange = (e) => { haftaSonuCalis = e.target.checked; render(main); };

    if (!sonuc) sonuc = await CizelgeMotor.tamCizelge({ haftaSonuCalis });
    const content = document.getElementById('cz-content');

    if (!sonuc.operasyonSayisi) {
      content.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Çizelgelenecek iş yok</div>
        <div class="edesc">Aktif iş emri veya üretimdeki sipariş bulunamadı. Rotası tanımlı olmayan yarı mamüller çizelgeye giremez — Yarı Mamül kartlarından rota atayın.</div></div></div>`;
      return;
    }

    if (activeTab === 'gantt') renderGantt(content, main);
    else if (activeTab === 'doluluk') renderDoluluk(content);
    else renderTermin(content, main);
  }

  // ── SEKME 1: GANTT ──────────────────────────────────────────────────────
  function renderGantt(content, main) {
    const y = sonuc.yerlesim;
    // Tarih aralığı
    const tarihler = [...new Set(y.flatMap(o => o.parcalar.map(p => p.tarih)))].sort();
    if (!tarihler.length) { content.innerHTML = '<div class="card"><div class="empty-state" style="padding:24px"><div class="edesc">Yerleşim üretilemedi.</div></div></div>'; return; }
    const ilk = tarihler[0], son = tarihler[tarihler.length - 1];

    // Hat bazında grupla
    const hatlar = new Map();
    y.forEach(o => {
      if (!hatlar.has(o.hat)) hatlar.set(o.hat, []);
      hatlar.get(o.hat).push(o);
    });

    // Gösterilecek gün listesi (en fazla 30 gün)
    const gunler = [];
    let t = ilk, guvenlik = 0;
    while (t <= son && guvenlik++ < 60) {
      gunler.push(t);
      const d = new Date(t + 'T00:00:00'); d.setDate(d.getDate() + 1);
      t = d.toISOString().slice(0, 10);
    }
    const GUN_AD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const gunBaslik = (g) => {
      const d = new Date(g + 'T00:00:00');
      return `<div style="font-size:9px;text-align:center;line-height:1.2">${GUN_AD[d.getDay()]}<br><b>${g.slice(8)}/${g.slice(5, 7)}</b></div>`;
    };

    let html = `<div class="card">
      <div class="fhint" style="margin-bottom:10px">Her satır bir <b>hat</b>, her sütun bir <b>gün</b>. Renkli bloklar o gün o hatta yapılacak işi gösterir; koyuluk doluluk oranıdır. Toplam ${sonuc.operasyonSayisi} operasyon, ${gunler.length} güne yayıldı.</div>
      <div style="overflow-x:auto">
      <table class="dtable" style="font-size:10.5px;min-width:${200 + gunler.length * 54}px">
        <tr><th style="min-width:180px;position:sticky;left:0;background:var(--surface)">Hat</th>
        ${gunler.map(g => `<th style="min-width:50px;padding:4px 2px">${gunBaslik(g)}</th>`).join('')}</tr>
        ${[...hatlar.entries()].map(([hat, ops]) => {
          const kap = sonuc.kapasite.get(hat) || CizelgeMotor.VARSAYILAN_GUNLUK_DK;
          return `<tr>
            <td style="position:sticky;left:0;background:var(--surface)"><b>${App.escapeHtml(hat)}</b><br>
              <span class="muted" style="font-size:9px">${kap} dk/gün · ${ops.length} operasyon</span></td>
            ${gunler.map(g => {
              const gunOps = ops.filter(o => o.parcalar.some(p => p.tarih === g));
              const dk = ops.reduce((a, o) => a + (o.parcalar.find(p => p.tarih === g) || { dk: 0 }).dk, 0);
              if (!dk) return `<td style="background:var(--bg)"></td>`;
              const doluluk = Math.min(1, dk / kap);
              const renk = doluluk >= 0.95 ? 'var(--red)' : doluluk >= 0.7 ? 'var(--amber)' : 'var(--blue)';
              const ipucu = gunOps.slice(0, 3).map(o => `${o.ymKod} @${o.istasyonKod} (${o.kaynakKod})`).join('\n');
              return `<td style="padding:2px" title="${App.escapeHtml(ipucu)}">
                <div style="background:${renk};opacity:${0.35 + doluluk * 0.65};border-radius:4px;padding:3px 2px;text-align:center;color:#fff;font-size:9px;font-weight:700">
                  ${Math.round(doluluk * 100)}%</div>
                <div style="font-size:8px;text-align:center;color:var(--text2)">${gunOps.length} iş</div></td>`;
            }).join('')}
          </tr>`;
        }).join('')}
      </table></div></div>`;

    // Operasyon detay listesi
    html += `<div class="card"><div class="card-hdr"><div class="card-title">📋 Operasyon Sırası (öncelik → termin)</div>
      <span class="pill pill-blue" style="font-size:10px">${y.length} operasyon</span></div>
      <div style="max-height:420px;overflow:auto">
      <table class="dtable" style="font-size:11px">
        <tr><th>#</th><th>Kaynak</th><th>Yarı Mamül</th><th>Adım</th><th>Hat / İstasyon</th>
        <th class="r">Adet</th><th class="r">Süre</th><th>Başlangıç</th><th>Bitiş</th></tr>
        ${y.map((o, i) => `<tr>
          <td class="r muted">${i + 1}</td>
          <td><span class="pill ${o.kaynakTip === 'ie' ? 'pill-purple' : 'pill-blue'}" style="font-size:9px">${o.kaynakTip === 'ie' ? 'İş Emri' : 'Sipariş'}</span>
            <span class="mono" style="font-size:9.5px">${App.escapeHtml(o.kaynakKod)}</span></td>
          <td><b class="mono" style="font-size:10px">${App.escapeHtml(o.ymKod)}</b></td>
          <td class="r" style="font-size:10px">${o.adimSira + 1}/${o.toplamAdim}</td>
          <td style="font-size:10px">${App.escapeHtml(o.hat)}<br><span class="mono muted" style="font-size:9px">${App.escapeHtml(o.istasyonKod)}</span></td>
          <td class="r">${App.fmt(o.adet, 0)}</td>
          <td class="r">${App.fmt(o.sureDk, 0)} dk</td>
          <td class="mono" style="font-size:10px">${o.baslangicTarihi}</td>
          <td class="mono" style="font-size:10px"><b>${o.bitisTarihi}</b></td>
        </tr>`).join('')}
      </table></div></div>`;
    content.innerHTML = html;
  }

  // ── SEKME 2: HAT DOLULUK ────────────────────────────────────────────────
  function renderDoluluk(content) {
    const hy = [...sonuc.hatYuku].sort((a, b) => b.doluluk - a.doluluk);
    if (!hy.length) { content.innerHTML = '<div class="card"><div class="empty-state" style="padding:24px"><div class="edesc">Yük verisi yok.</div></div></div>'; return; }
    const darbogaz = hy.filter(h => h.doluluk >= 0.9);

    let html = '';
    if (darbogaz.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🚧 DARBOĞAZ — ${darbogaz.length} hat kapasitesinin sınırında</div>
        ${darbogaz.map(h => `<div style="font-size:11.5px;padding:3px 0">⚠ <b>${App.escapeHtml(h.hat)}</b> — %${Math.round(h.doluluk * 100)} dolu (${h.gunSayisi} gün, ${App.fmt(h.toplamDk, 0)} dk iş). Vardiya eklenmezse gecikme kaçınılmaz.</div>`).join('')}
      </div>`;
    }

    html += `<div class="card"><div class="card-hdr"><div class="card-title">📊 Hat Bazında Kapasite Kullanımı</div></div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Hat</th><th class="r">Günlük Kapasite</th><th class="r">Yüklenen İş</th><th class="r">Gün</th><th>Doluluk</th></tr>
        ${hy.map(h => {
          const p = Math.min(100, Math.round(h.doluluk * 100));
          const renk = h.doluluk >= 0.9 ? 'red' : h.doluluk >= 0.7 ? 'amber' : 'green';
          return `<tr>
            <td><b>${App.escapeHtml(h.hat)}</b></td>
            <td class="r">${App.fmt(h.gunlukKapasite, 0)} dk</td>
            <td class="r">${App.fmt(h.toplamDk, 0)} dk</td>
            <td class="r">${h.gunSayisi}</td>
            <td style="min-width:160px">
              <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">
                <b style="color:var(--${renk}-text)">%${p}</b></div>
              <div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${p}%;background:var(--${renk})"></div></div></td>
          </tr>`;
        }).join('')}
      </table></div>`;

    // Günlük detay (ilk hat için)
    html += `<div class="card"><div class="card-hdr"><div class="card-title">📆 Günlük Yük Dağılımı</div></div>
      <div style="max-height:400px;overflow:auto">
      ${hy.map(h => `<div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px">${App.escapeHtml(h.hat)}
          <span class="muted" style="font-size:10px">— ${h.gunlukKapasite} dk/gün</span></div>
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          ${h.gunler.map(g => {
            const p = Math.min(100, Math.round(g.doluluk * 100));
            const renk = g.doluluk >= 0.95 ? 'var(--red)' : g.doluluk >= 0.7 ? 'var(--amber)' : 'var(--green)';
            return `<div style="min-width:56px;text-align:center" title="${g.tarih}: ${Math.round(g.dk)} dk">
              <div style="height:${Math.max(6, p * 0.5)}px;background:${renk};border-radius:3px 3px 0 0"></div>
              <div style="font-size:8.5px;color:var(--text2)">${g.tarih.slice(5)}</div>
              <div style="font-size:8.5px;font-weight:700">%${p}</div></div>`;
          }).join('')}
        </div></div>`).join('')}
      </div></div>`;
    content.innerHTML = html;
  }

  // ── SEKME 3: TERMİN RİSKİ ───────────────────────────────────────────────
  function renderTermin(content, main) {
    const siparisler = (sonuc.veri.siparisler || []).filter(s => s.durum === 'onaylandi' &&
      s.uretimDurumu !== 'tamamlandi' && s.uretimDurumu !== 'iade_ambarina_alindi');

    // Her siparişin çizelgeye göre gerçekçi bitişi
    const satirlar = siparisler.map(s => {
      // Doğrudan sipariş operasyonları + bu siparişe bağlı iş emirleri
      const ieIdler = (sonuc.veri.isemirleri || [])
        .filter(ie => (ie.kaynakSiparisIdler || []).includes(s.id)).map(ie => ie.id);
      const ilgili = sonuc.yerlesim.filter(o =>
        (o.kaynakTip === 'sip' && o.kaynakId === s.id) ||
        (o.kaynakTip === 'ie' && ieIdler.includes(o.kaynakId)));
      const cizelgeBitis = ilgili.reduce((en, o) => (!en || o.bitisTarihi > en) ? o.bitisTarihi : en, null);
      const sozVerilen = s.uretimTermini || null;
      const sapma = (cizelgeBitis && sozVerilen) ? gunFark(cizelgeBitis, sozVerilen) : null;
      return { s, cizelgeBitis, sozVerilen, sapma, opSayisi: ilgili.length };
    }).sort((a, b) => (b.sapma || -999) - (a.sapma || -999));

    const riskliler = satirlar.filter(r => r.sapma !== null && r.sapma > 0);
    const terminsizler = satirlar.filter(r => !r.sozVerilen);

    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Açık Sipariş</div><div class="kpi-val blue">${satirlar.length}</div></div>
      <div class="kpi"><div class="kpi-lbl">Termini Riskte</div><div class="kpi-val ${riskliler.length ? 'red' : 'green'}">${riskliler.length}</div>
        <div class="muted" style="font-size:10.5px">Çizelgeye göre gecikecek</div></div>
      <div class="kpi"><div class="kpi-lbl">Termini Girilmemiş</div><div class="kpi-val ${terminsizler.length ? 'amber' : 'green'}">${terminsizler.length}</div></div>
    </div>`;

    if (riskliler.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">⚠ ${riskliler.length} siparişin termini kapasiteye göre TUTMUYOR</div>
        <div class="fhint" style="margin-top:4px">Bu siparişler için ya termin revize edilmeli, ya öncelik yükseltilmeli, ya da kapasite (vardiya/fason) artırılmalı.</div></div>`;
    }

    html += `<div class="card"><div class="card-hdr"><div class="card-title">⏰ Sözü Verilen Termin vs Çizelge</div></div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Sipariş</th><th>Müşteri</th><th>Sözü Verilen</th><th>Çizelgeye Göre</th><th class="r">Sapma</th><th>Durum</th><th></th></tr>
        ${satirlar.map(r => {
          let durum, renk;
          if (!r.cizelgeBitis) { durum = 'Çizelgede iş yok'; renk = 'pill-gray'; }
          else if (!r.sozVerilen) { durum = 'Termin girilmemiş'; renk = 'pill-amber'; }
          else if (r.sapma > 0) { durum = r.sapma + ' gün GECİKECEK'; renk = 'pill-red'; }
          else { durum = 'Zamanında'; renk = 'pill-green'; }
          return `<tr${r.sapma > 0 ? ' style="background:var(--red-bg)"' : ''}>
            <td class="mono"><b>${App.escapeHtml(r.s.kod)}</b></td>
            <td>${App.escapeHtml(r.s.musteriAdi || '—')}</td>
            <td class="mono" style="font-size:10.5px">${r.sozVerilen || '<span class="muted">—</span>'}</td>
            <td class="mono" style="font-size:10.5px"><b>${r.cizelgeBitis || '<span class="muted">—</span>'}</b></td>
            <td class="r">${r.sapma !== null ? `<b style="color:var(--${r.sapma > 0 ? 'red' : 'green'}-text)">${r.sapma > 0 ? '+' : ''}${r.sapma} gün</b>` : '—'}</td>
            <td><span class="pill ${renk}" style="font-size:9.5px">${durum}</span></td>
            <td>${r.cizelgeBitis ? `<button class="btn btn-sm btn-ghost cz-termin-uygula" data-id="${r.s.id}" data-tarih="${r.cizelgeBitis}">📌 Çizelge Terminini Uygula</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </table></div>`;
    content.innerHTML = html;

    content.querySelectorAll('.cz-termin-uygula').forEach(b => b.onclick = async () => {
      const sip = siparisler.find(s => s.id === b.dataset.id);
      const yeni = b.dataset.tarih;
      App.confirmDialog(
        `<b>${App.escapeHtml(sip.kod)}</b> siparişinin üretim termini çizelgeye göre <b>${yeni}</b> olarak güncellenecek.<br><br>` +
        `Mevcut termin: ${sip.uretimTermini || 'girilmemiş'}<br><br>Bu, kapasiteye göre hesaplanmış gerçekçi tarihtir. Onaylıyor musunuz?`,
        async () => {
          const tumu = await Store.siparisler.all();
          const s = tumu.find(x => x.id === sip.id);
          if (!s) return;
          s.uretimTermini = yeni;
          s.terminKaynagi = 'cizelge';
          await App.persist(() => Store.siparisler.upsert(s));
          App.toast('Termin güncellendi: ' + sip.kod + ' → ' + yeni, 'ok');
          render(main, { tab: 'termin' });
        });
    });
  }

  return { render };
})();
