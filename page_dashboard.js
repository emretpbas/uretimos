// ════════════════════════════════════════════════════════════════════════════
// PANEL (DASHBOARD)
// ════════════════════════════════════════════════════════════════════════════
PageModules.dashboard = (() => {

  async function render(main) {
    const [hammaddeler, yarimamuller, urunler, isemirleri, rotalar, fiyatListeleri] = await Promise.all([
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.urunler.all(),
      Store.isemirleri.all(), Store.rotalar.all(), Store.fiyatListeleri.all()
    ]);

    const acikIsEmri = isemirleri.filter(i => i.durum !== 'tamamlandi').length;
    const plakaSayisi = hammaddeler.filter(h => h.tip === 'plaka').length;
    const hirdavatSayisi = hammaddeler.filter(h => h.tip === 'hirdavat').length;

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Üretim Yönetim Paneli</div>
          <div class="page-sub">Hammadde, reçete, rota, iş emri ve fiyatlandırma akışınızın genel görünümü</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="db-kurulum" title="Kurulumun hangi adımda olduğunu ölçer ve eksikleri gösterir">🚦 Kurulum Durumu</button>
          <button class="btn btn-blue" id="db-new-isemri">+ Yeni İş Emri</button>
        </div>
      </div>

      <div class="grid grid-4">
        <div class="kpi"><div class="kpi-lbl">Bitmiş Ürün Kartı</div><div class="kpi-val blue">${urunler.length}</div><div class="kpi-sub">Tanımlı ürün</div></div>
        <div class="kpi"><div class="kpi-lbl">Yarı Mamül</div><div class="kpi-val purple">${yarimamuller.length}</div><div class="kpi-sub">Tanımlı yarı mamül</div></div>
        <div class="kpi"><div class="kpi-lbl">Hammadde</div><div class="kpi-val green">${hammaddeler.length}</div><div class="kpi-sub">${plakaSayisi} plaka · ${hirdavatSayisi} hırdavat</div></div>
        <div class="kpi"><div class="kpi-lbl">Açık İş Emri</div><div class="kpi-val amber">${acikIsEmri}</div><div class="kpi-sub">${isemirleri.length} toplam iş emri</div></div>
      </div>

      <div class="grid grid-2" style="margin-top:14px">
        <div class="card">
          <div class="card-hdr"><div class="card-title">Hızlı Erişim</div></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div class="qa-row" data-go="hammadde">▭ &nbsp; Hammadde tanımla (plaka / hırdavat, fiyat, fire)</div>
            <div class="qa-row" data-go="yarimamul">◫ &nbsp; Yarı mamül oluştur (dwg/step/pdf yükle)</div>
            <div class="qa-row" data-go="rota">→ &nbsp; Hat ve rota tanımla, işçilik süresi gir</div>
            <div class="qa-row" data-go="isemri">▤ &nbsp; Üretime iş emri ver</div>
            <div class="qa-row" data-go="nesting">▦ &nbsp; Kesim optimizasyonu (nesting) çalıştır</div>
            <div class="qa-row" data-go="fiyat">₺ &nbsp; Fiyat listesi hazırla, kârlılık gör</div>
          </div>
        </div>
        <div class="card">
          <div class="card-hdr"><div class="card-title">Son İş Emirleri</div></div>
          ${renderRecentIsEmri(isemirleri)}
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Sistem Durumu</div></div>
        <div class="grid grid-3">
          <div class="flex-gap"><span class="pill ${rotalar.length ? 'pill-green' : 'pill-amber'}">${rotalar.length ? '✓' : '!'}</span><span style="font-size:12px">${rotalar.length} rota tanımlı</span></div>
          <div class="flex-gap"><span class="pill ${fiyatListeleri.length ? 'pill-green' : 'pill-amber'}">${fiyatListeleri.length ? '✓' : '!'}</span><span style="font-size:12px">${fiyatListeleri.length} fiyat listesi oluşturuldu</span></div>
          <div class="flex-gap"><span class="pill pill-blue">i</span><span style="font-size:12px">Veriler bu tarayıcıda kalıcı saklanıyor</span></div>
        </div>
      </div>
    `;

    main.querySelectorAll('.qa-row').forEach(r => {
      // ROL FİLTRESİ: her hızlı erişim satırı yalnızca o sayfaya yetkisi olan
      // birime gösterilir — diğer birimlerin alanları TAMAMEN gizlenir.
      if (!App.sayfayaErisebilir(r.dataset.go)) { r.remove(); return; }
      r.style.cssText = 'padding:9px 12px;border-radius:8px;background:var(--bg);font-size:12.5px;font-weight:600;cursor:pointer;color:var(--text2)';
      r.onmouseenter = () => r.style.background = 'var(--blue-bg)';
      r.onmouseleave = () => r.style.background = 'var(--bg)';
      r.onclick = () => App.goTo(r.dataset.go);
    });
    // 🚦 Kurulum durumu — kurulumun hangi adımda olduğunu ölçer
    const kurulumBtn = document.getElementById('db-kurulum');
    if (kurulumBtn) kurulumBtn.onclick = () => KurulumDurumu.ac();
    const yeniIsemriBtn = document.getElementById('db-new-isemri');
    if (yeniIsemriBtn) {
      if (!App.sayfayaErisebilir('isemri')) yeniIsemriBtn.remove();
      else yeniIsemriBtn.onclick = () => App.goTo('isemri', { openNew: true });
    }
  }

  function renderRecentIsEmri(list) {
    if (!list.length) return `<div class="empty-state" style="padding:24px 10px"><div class="eicon">▤</div><div class="etitle">Henüz iş emri yok</div><div class="edesc">İş Emirleri sayfasından üretime ilk emrinizi verin.</div></div>`;
    const sorted = [...list].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).slice(0, 5);
    let html = `<table class="dtable"><tr><th>Kod</th><th>Ürün</th><th>Durum</th><th class="r">Adet</th></tr>`;
    sorted.forEach(i => {
      html += `<tr><td class="mono">${i.kod}</td><td>${App.escapeHtml(i.urunAdi || '—')}</td><td>${durumPill(i.durum)}</td><td class="r">${i.adet || 1}</td></tr>`;
    });
    html += `</table>`;
    return html;
  }
  function durumPill(d) {
    const map = { taslak: ['Taslak', 'pill-gray'], uretimde: ['Üretimde', 'pill-amber'], tamamlandi: ['Tamamlandı', 'pill-green'] };
    const [label, cls] = map[d] || ['Taslak', 'pill-gray'];
    return `<span class="pill ${cls}">${label}</span>`;
  }

  return { render };
})();
