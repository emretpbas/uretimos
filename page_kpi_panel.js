// ════════════════════════════════════════════════════════════════════════════
// KPI PANELİ & AI DENETÇİSİ
//   Sekme 1 — KPI: OEE, Kapasite Kullanımı, Fire, Hurda, Üretim Verimliliği,
//              Geciken Sipariş, Makine Doluluk, Personel Performansı,
//              Satın Alma Bekleyenleri
//   Sekme 2 — AI Denetçisi: tüm birimlerdeki kritik durumlar; otomatik
//              düzeltilebilenler tek tuşla (veya toplu) uygulanır.
//   Sekme 3 — AI Revizyon Raporları: AI'ın yaptığı her düzeltmenin dökümü.
// ════════════════════════════════════════════════════════════════════════════
PageModules.kpi_panel = (() => {
  let activeTab = 'kpi';
  let sonBulgular = null;
  // BULGU (T3-32): KPI/OEE her zaman ÖMÜR BOYU KÜMÜLATİF veriyi
  // gösteriyordu — "bugünün OEE'si ne?" sorusuna cevap verilemiyordu.
  // donemTip: 'gun' | 'hafta' | 'tumZamanlar' (varsayılan, eski davranış).
  let donemTip = 'tumZamanlar';

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">KPI Paneli & AI Denetçisi</div>
        <div class="page-sub">Anlık performans göstergeleri ve tüm birimleri tarayan yapay zekâ denetçisi</div></div>
        <div class="page-acts"><button class="btn btn-blue" id="kp-tara">🤖 AI Taraması Yap</button></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'kpi' ? 'active' : ''}" data-tab="kpi">📊 KPI Göstergeleri</div>
        <div class="tab ${activeTab === 'ai' ? 'active' : ''}" data-tab="ai">🤖 AI Denetçisi</div>
        <div class="tab ${activeTab === 'rapor' ? 'active' : ''}" data-tab="rapor">📝 AI Revizyon Raporları</div>
      </div>
      <div id="kp-content"><div style="padding:40px;text-align:center"><div class="loading-spin" style="margin:0 auto"></div></div></div>`;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });
    document.getElementById('kp-tara').onclick = () => { activeTab = 'ai'; sonBulgular = null; render(main); };

    const content = document.getElementById('kp-content');
    if (activeTab === 'kpi') await renderKpiTab(content);
    else if (activeTab === 'ai') await renderAiTab(content, render, main);
    else await renderRaporTab(content);
  }

  // ── SEKME 1: KPI GÖSTERGELERİ ───────────────────────────────────────────
  async function renderKpiTab(content) {
    const donemFiltre = KpiMotor.donemAraligiHesapla(donemTip);
    const { kpi } = await KpiMotor.tumKpi(donemFiltre);
    const yuzde = (x) => Math.round((x || 0) * 100);
    // Renk: iyi=yeşil, sınırda=amber, kötü=kırmızı
    const renk = (deger, esik, tersMi) => {
      const iyi = tersMi ? deger <= esik : deger >= esik;
      const sinir = tersMi ? deger <= esik * 1.5 : deger >= esik * 0.85;
      return iyi ? 'green' : sinir ? 'amber' : 'red';
    };
    const kart = (baslik, deger, altBilgi, renkSinif, ekstra) => `
      <div class="kpi" style="position:relative">
        <div class="kpi-lbl">${baslik}</div>
        <div class="kpi-val ${renkSinif}">${deger}</div>
        <div class="muted" style="font-size:10.5px;margin-top:2px">${altBilgi}</div>
        ${ekstra || ''}</div>`;
    const cubuk = (oran, sinif) => `<div style="height:5px;background:var(--bg);border-radius:3px;overflow:hidden;margin-top:6px">
      <div style="height:100%;width:${Math.min(100, Math.max(0, oran * 100))}%;background:var(--${sinif === 'green' ? 'green' : sinif === 'amber' ? 'amber' : 'red'})"></div></div>`;

    const oeeRenk = renk(kpi.oee.deger, KpiMotor.ESIK.oee);
    const kapRenk = renk(kpi.kapasite.deger, KpiMotor.ESIK.kapasite);
    const fireRenk = renk(kpi.fire.deger, KpiMotor.ESIK.fire, true);
    const hurdaRenk = renk(kpi.hurda.deger, KpiMotor.ESIK.hurda, true);
    const verimRenk = renk(kpi.verimlilik.deger, KpiMotor.ESIK.verimlilik);
    const gecikenRenk = kpi.geciken.adet === 0 ? 'green' : kpi.geciken.adet <= 2 ? 'amber' : 'red';
    const makineRenk = renk(kpi.makineDoluluk.deger, KpiMotor.ESIK.makineDoluluk);
    const satinRenk = kpi.satinalma.deger <= KpiMotor.ESIK.satinalma ? 'green' : 'amber';

    const donemBtn = (tip, etiket) => `<button class="btn btn-sm ${donemTip === tip ? 'btn-blue' : ''} kp-donem" data-tip="${tip}">${etiket}</button>`;
    let html = `<div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:10px">
      ${donemBtn('gun', 'Bugün')}${donemBtn('hafta', 'Bu Hafta')}${donemBtn('tumZamanlar', 'Tüm Zamanlar')}
    </div>
    <div class="grid grid-3" style="margin-bottom:14px">
      ${kart('OEE — Genel Ekipman Etkinliği', '%' + yuzde(kpi.oee.deger),
        `Kullanılabilirlik %${yuzde(kpi.oee.kullanilabilirlik)} × Performans %${yuzde(kpi.oee.performans)} × Kalite %${yuzde(kpi.oee.kalite)}`,
        oeeRenk, cubuk(kpi.oee.deger, oeeRenk))}
      ${kart('Kapasite Kullanımı', '%' + yuzde(kpi.kapasite.deger),
        `${Math.round(kpi.kapasite.kullanilanDk)} dk / ${kpi.kapasite.kapasiteDk} dk · ${kpi.kapasite.hatSayisi} hat`,
        kapRenk, cubuk(kpi.kapasite.deger, kapRenk))}
      ${kart('Üretim Verimliliği', '%' + yuzde(kpi.verimlilik.deger),
        `Standart ${kpi.verimlilik.standartDk} dk / Gerçekleşen ${kpi.verimlilik.gerceklesenDk} dk`,
        verimRenk, cubuk(kpi.verimlilik.deger, verimRenk))}
    </div>
    <div class="grid grid-3" style="margin-bottom:14px">
      ${kart('Fire Oranı', '%' + (kpi.fire.deger * 100).toFixed(1),
        `${kpi.fire.adet} fire / ${kpi.fire.toplam} adet üretim`, fireRenk)}
      ${kart('Hurda', App.fmt(kpi.hurda.adet, 0) + ' adet',
        `Fire kararı ${kpi.hurda.fireKarari} + iade/2.kalite ${kpi.hurda.iade} · oran %${(kpi.hurda.deger * 100).toFixed(1)}`, hurdaRenk)}
      ${kart('Geciken Sipariş', kpi.geciken.adet + ' / ' + kpi.geciken.toplam,
        kpi.geciken.adet ? 'Termini geçmiş açık sipariş' : 'Gecikme yok', gecikenRenk)}
    </div>
    <div class="grid grid-3" style="margin-bottom:14px">
      ${kart('Makine Doluluk', '%' + yuzde(kpi.makineDoluluk.deger),
        `${kpi.makineDoluluk.calisabilir}/${kpi.makineDoluluk.toplam} çalışabilir · ${kpi.makineDoluluk.arizali} arızalı, ${kpi.makineDoluluk.bakimda} bakım alarmında`,
        makineRenk, cubuk(kpi.makineDoluluk.deger, makineRenk))}
      ${kart('Personel Performansı', kpi.personel.kisiSayisi + ' kişi',
        kpi.personel.deger ? 'Ortalama ' + App.fmt(kpi.personel.deger, 1) + ' dk/adet' : 'Henüz veri yok', 'blue')}
      ${kart('Satın Alma Bekleyenleri', kpi.satinalma.deger + ' işlem',
        `${kpi.satinalma.talep} talep · ${kpi.satinalma.teklif} teklif bekliyor`, satinRenk)}
    </div>`;

    // ── MALİ & TESLİMAT KPI'LARI (analitik motordan) ──────────────────────
    try {
      const AN = await AnalitikMotor.tumAnaliz();
      const m = AN.mali, t = AN.teslimat, mz = AN.malzeme, hn = AN.huni;
      const y = (x, b) => x === null || x === undefined ? '—' : '%' + App.fmt(x * 100, b === undefined ? 1 : b);
      html += `<div class="flbl" style="margin:18px 0 8px;font-size:13px">💰 MALİ & TİCARİ GÖSTERGELER</div>
        <div class="grid grid-3" style="margin-bottom:14px">
          ${kart('Brüt Kâr Marjı', y(m.brutMarj), App.fmtTL(m.brutKar) + ' brüt kâr',
            m.brutMarj >= 0.25 ? 'green' : m.brutMarj >= 0.15 ? 'amber' : 'red')}
          ${kart('Nakit Döngüsü (CCC)', m.ccc + ' gün', `DSO ${m.dso} + Stok ${m.stokDevirGun} − DPO ${m.dpo}`,
            m.ccc <= 30 ? 'green' : m.ccc <= 60 ? 'amber' : 'red')}
          ${kart('Stok Devir Hızı', App.fmt(m.stokDevirHizi, 1) + ' kez/yıl', App.fmtTL(m.stokDegeri) + ' stok değeri',
            m.stokDevirHizi >= 4 ? 'green' : m.stokDevirHizi >= 2 ? 'amber' : 'red')}
        </div>
        <div class="grid grid-3" style="margin-bottom:14px">
          ${kart('OTIF — Zamanında & Eksiksiz', y(t.otifOrani), t.olculebilirSayi + ' ölçülebilir teslimat',
            t.otifOrani === null ? 'blue' : t.otifOrani >= 0.95 ? 'green' : t.otifOrani >= 0.85 ? 'amber' : 'red')}
          ${kart('Malzeme Verimi', y(mz.genelVerim), mz.kayipTutar > 0 ? App.fmtTL(mz.kayipTutar) + ' fazla tüketim' : 'Sapma yok',
            mz.genelVerim === null ? 'blue' : mz.genelVerim >= 0.9 ? 'green' : mz.genelVerim >= 0.8 ? 'amber' : 'red')}
          ${kart('Teklif Dönüşüm Oranı', y(hn.donusumOrani), hn.siparise + '/' + hn.toplam + ' teklif siparişe döndü',
            hn.donusumOrani === null ? 'blue' : hn.donusumOrani >= 0.3 ? 'green' : hn.donusumOrani >= 0.15 ? 'amber' : 'red')}
        </div>
        <div class="grid grid-3" style="margin-bottom:14px">
          ${kart('Riskli Alacak (90+ gün)', App.fmtTL(AN.alacak.riskli), 'Toplam alacak ' + App.fmtTL(AN.alacak.toplam),
            AN.alacak.riskli > 0 ? 'red' : 'green')}
          ${kart('Ölü Stok (180+ gün)', App.fmtTL(AN.stok.oluStokDeger), AN.stok.oluStokAdet + ' kalem hareketsiz',
            AN.stok.oluStokDeger > 0 ? 'red' : 'green')}
          ${kart('Ort. Teslim Süresi', t.ortLeadTime !== null ? App.fmt(t.ortLeadTime, 1) + ' gün' : '—', 'Sipariş → teslim', 'blue')}
        </div>
        <div class="fhint" style="margin-bottom:14px">Mali göstergelerin detayı ve kırılımı için <b>Analitik Raporlar</b> sayfasına bakın.</div>`;
    } catch (e) { /* analitik hesaplanamazsa üretim KPI'ları yine gösterilir */ }

    // Personel performans detayı
    if (kpi.personel.liste.length) {
      html += `<div class="card"><div class="card-hdr"><div class="card-title">👥 Personel Performansı — İstasyon Onayları</div></div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Personel</th><th class="r">İşlenen Adet</th><th class="r">İş Kartı</th><th class="r">Toplam Süre</th><th class="r">Birim Süre</th></tr>
          ${kpi.personel.liste.slice(0, 15).map(p => `<tr>
            <td><b>${App.escapeHtml(p.kisi)}</b></td>
            <td class="r">${App.fmt(p.adet, 0)}</td>
            <td class="r">${p.kart}</td>
            <td class="r">${App.fmt(p.dk, 1)} dk</td>
            <td class="r"><b>${p.birimDk ? App.fmt(p.birimDk, 1) + ' dk/adet' : '—'}</b></td>
          </tr>`).join('')}
        </table></div>`;
    }

    // Geciken sipariş listesi
    if (kpi.geciken.liste.length) {
      html += `<div class="card" style="border:1px solid var(--red);background:var(--red-bg)">
        <div class="card-hdr"><div class="card-title" style="color:var(--red-text)">⏰ Termini Geçen Siparişler</div></div>
        <table class="dtable" style="font-size:11.5px"><tr><th>Sipariş</th><th>Müşteri</th><th>Termin</th><th>Üretim Durumu</th></tr>
          ${kpi.geciken.liste.slice(0, 10).map(s => `<tr>
            <td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi || '—')}</td>
            <td style="color:var(--red-text)"><b>${s.uretimTermini}</b></td>
            <td>${App.escapeHtml(s.uretimDurumu || 'üretimde')}</td></tr>`).join('')}
        </table></div>`;
    }
    content.innerHTML = html;
    content.querySelectorAll('.kp-donem').forEach(b => b.onclick = () => {
      donemTip = b.dataset.tip;
      renderKpiTab(content);
    });
  }

  // ── SEKME 2: AI DENETÇİSİ ───────────────────────────────────────────────
  async function renderAiTab(content, render, main) {
    if (!sonBulgular) {
      const r = await AiDenetci.tara();
      sonBulgular = r.bulgular;
    }
    const bulgular = sonBulgular;
    const kritikler = bulgular.filter(b => b.seviye === 'kritik');
    const otomatikler = bulgular.filter(b => b.otomatik);

    // Birime göre grupla
    const gruplar = new Map();
    bulgular.forEach(b => {
      if (!gruplar.has(b.birim)) gruplar.set(b.birim, []);
      gruplar.get(b.birim).push(b);
    });

    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Bulgu</div><div class="kpi-val blue">${bulgular.length}</div>
        <div class="muted" style="font-size:10.5px">${gruplar.size} birimde</div></div>
      <div class="kpi"><div class="kpi-lbl">Kritik Durum</div><div class="kpi-val ${kritikler.length ? 'red' : 'green'}">${kritikler.length}</div>
        <div class="muted" style="font-size:10.5px">${kritikler.length ? 'Acil müdahale gerekli' : 'Kritik durum yok'}</div></div>
      <div class="kpi"><div class="kpi-lbl">AI Otomatik Düzeltebilir</div><div class="kpi-val ${otomatikler.length ? 'amber' : 'green'}">${otomatikler.length}</div>
        <div class="muted" style="font-size:10.5px">Tek tuşla uygulanabilir</div></div>
    </div>`;

    if (otomatikler.length) {
      html += `<div class="card" style="border:1.5px solid var(--amber);background:var(--amber-bg);margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><b style="font-size:12.5px">🤖 AI ${otomatikler.length} sorunu otomatik düzeltebilir</b>
          <div class="muted" style="font-size:11px">Eksik kayıt tamamlama, kritik stok için satın alma talebi açma gibi güvenli düzeltmeler. Veri silinmez, fiyat değiştirilmez.</div></div>
        <button class="btn btn-blue" id="ai-hepsi">⚡ Tümünü Düzelt ve Raporla</button>
      </div>`;
    }

    if (!bulgular.length) {
      html += `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="eicon">✓</div><div class="etitle">Kritik durum bulunamadı</div>
        <div class="edesc">AI tüm birimleri taradı: üretim, kalite, bakım, satın alma, depo, planlama ve İK'da müdahale gerektiren durum yok.</div></div></div>`;
    } else {
      [...gruplar.entries()].sort((a, b) => {
        const kritikA = a[1].filter(x => x.seviye === 'kritik').length;
        const kritikB = b[1].filter(x => x.seviye === 'kritik').length;
        return kritikB - kritikA;
      }).forEach(([birim, liste]) => {
        const kritikSayi = liste.filter(x => x.seviye === 'kritik').length;
        html += `<div class="card" style="margin-bottom:12px">
          <div class="card-hdr"><div class="card-title">${AiDenetci.BIRIM_ETIKET[birim] || birim}</div>
            <span class="pill ${kritikSayi ? 'pill-red' : 'pill-amber'}" style="font-size:10px">${liste.length} bulgu${kritikSayi ? ' · ' + kritikSayi + ' kritik' : ''}</span></div>`;
        liste.forEach(b => {
          const [sevEtiket, sevRenk] = AiDenetci.SEVIYE[b.seviye] || ['—', 'pill-gray'];
          html += `<div style="border:1px solid var(--border);border-left:3px solid var(--${b.seviye === 'kritik' ? 'red' : b.seviye === 'uyari' ? 'amber' : 'blue'});border-radius:8px;padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
              <div style="flex:1;min-width:220px">
                <span class="pill ${sevRenk}" style="font-size:9px">${sevEtiket}</span>
                <b style="font-size:12px;margin-left:6px">${App.escapeHtml(b.baslik)}</b>
                <div class="muted" style="font-size:11px;margin-top:4px">${App.escapeHtml(b.aciklama)}</div>
              </div>
              ${b.otomatik
                ? `<button class="btn btn-sm btn-green ai-duzelt" data-id="${b.id}">🤖 AI Düzeltsin</button>`
                : `<span class="pill pill-gray" style="font-size:9px;white-space:nowrap">Yönetim kararı</span>`}
            </div>
          </div>`;
        });
        html += `</div>`;
      });
    }
    content.innerHTML = html;

    // Tekli düzeltme
    content.querySelectorAll('.ai-duzelt').forEach(b => b.onclick = async () => {
      const bulgu = bulgular.find(x => x.id === b.dataset.id);
      if (!bulgu) return;
      App.confirmDialog(
        `<b>${App.escapeHtml(bulgu.baslik)}</b><br><br>AI bu sorunu otomatik düzeltecek ve yaptığı değişiklikleri raporlayacak.<br><br>${App.escapeHtml(bulgu.aciklama)}<br><br>Onaylıyor musunuz?`,
        async () => {
          const r = await AiDenetci.duzelt(bulgu);
          if (r.uygulandi) {
            App.toast('🤖 AI düzeltti: ' + r.rapor.sonuc, 'ok');
            sonBulgular = null;
            activeTab = 'rapor';
            render(main);
          } else {
            App.toast(r.rapor.sonuc, 'err');
          }
        });
    });

    // Toplu düzeltme
    const hepsiBtn = document.getElementById('ai-hepsi');
    if (hepsiBtn) hepsiBtn.onclick = async () => {
      App.confirmDialog(
        `AI, otomatik düzeltilebilir <b>${otomatikler.length}</b> sorunu uygulayacak:<br><br>` +
        otomatikler.map(b => `• ${App.escapeHtml(b.baslik)}`).join('<br>') +
        `<br><br>Yapılan her değişiklik raporlanacak (sunucu sürümünde denetim kaydından geri alınabilir). Onaylıyor musunuz?`,
        async () => {
          const raporlar = await AiDenetci.hepsiniDuzelt(otomatikler);
          const toplam = raporlar.reduce((a, r) => a + r.etkilenenKayit, 0);
          App.toast(`🤖 AI ${raporlar.length} sorunu düzeltti, ${toplam} kayıt güncellendi — rapor hazır`, 'ok');
          sonBulgular = null;
          activeTab = 'rapor';
          render(main);
        });
    };
  }

  // ── SEKME 3: AI REVİZYON RAPORLARI ──────────────────────────────────────
  async function renderRaporTab(content) {
    const raporlar = (await Store.aiRaporlari.all()).sort((a, b) => (b.zaman || '').localeCompare(a.zaman || ''));
    if (!raporlar.length) {
      content.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Henüz AI düzeltmesi yok</div>
        <div class="edesc">AI Denetçisi sekmesinden tarama yapıp otomatik düzeltmeleri uygulayın — yapılan her revizyon burada raporlanır.</div></div></div>`;
      return;
    }
    const toplamKayit = raporlar.reduce((a, r) => a + (r.etkilenenKayit || 0), 0);
    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">AI Düzeltmesi</div><div class="kpi-val blue">${raporlar.length}</div></div>
      <div class="kpi"><div class="kpi-lbl">Güncellenen Kayıt</div><div class="kpi-val purple">${toplamKayit}</div></div>
      <div class="kpi"><div class="kpi-lbl">Son Düzeltme</div><div class="kpi-val amber" style="font-size:15px">${(raporlar[0].zaman || '').slice(0, 10)}</div></div>
    </div>
    <div class="fhint" style="margin-bottom:10px">AI'ın uyguladığı her revizyon aşağıda. Sunucu (PHP) sürümünde bu değişiklikler <b>Denetim Kaydı → ↩ Geri Al</b> ile geri alınabilir.</div>`;

    raporlar.forEach(r => {
      html += `<div class="card" style="margin-bottom:10px">
        <div class="card-hdr">
          <div class="card-title">${AiDenetci.BIRIM_ETIKET[r.birim] || r.birim} — ${App.escapeHtml(r.baslik)}</div>
          <span class="pill pill-green" style="font-size:9.5px">${r.etkilenenKayit} kayıt</span>
        </div>
        <div class="muted" style="font-size:10.5px;margin-bottom:6px">
          ${(r.zaman || '').replace('T', ' ').slice(0, 19)} · Uygulayan: ${App.escapeHtml(r.kullanici && r.kullanici.kullaniciAdi ? r.kullanici.kullaniciAdi : (typeof r.kullanici === 'string' ? r.kullanici : 'AI'))}
        </div>
        <div style="background:var(--green-bg);border-radius:8px;padding:8px 10px;font-size:11.5px;margin-bottom:8px">
          <b>Sonuç:</b> ${App.escapeHtml(r.sonuc)}</div>
        ${(r.degisiklikler || []).length ? `<div class="flbl" style="margin-bottom:4px">Yapılan Değişiklikler</div>
          <div style="max-height:160px;overflow:auto">
          ${r.degisiklikler.map(d => `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)">✓ ${App.escapeHtml(d)}</div>`).join('')}
          </div>` : ''}
      </div>`;
    });
    content.innerHTML = html;
  }

  return { render };
})();
