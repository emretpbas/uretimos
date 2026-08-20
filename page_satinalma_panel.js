// ════════════════════════════════════════════════════════════════════════════
// SATINALMA PANELİ — üretim/depo taleplerini görme, hammadde fiyatlarını
// güncelleme, tedarikçiye satınalma siparişi açma (Excel/PDF çıktılı).
// ════════════════════════════════════════════════════════════════════════════
PageModules.satinalma_panel = (() => {
  let activeTab = 'talepler';

  async function render(main) {
    const [talepler, satinalmaTalepleri, hammaddeler, tedarikciler, satinalmaSiparisleri, stokRaf, kritikStokSeviyeleri] = await Promise.all([
      Store.talepler.all(), Store.satinalmaTalepleri.all(), Store.hammaddeler.all(), Store.tedarikciler.all(), Store.satinalmaSiparisleri.all(),
      Store.stokRaf.all(), Store.kritikStokSeviyeleri.all()
    ]);

    const acikTalepler = talepler.filter(t => t.durum === 'beklemede');
    const bekleyenSatinalma = satinalmaTalepleri.filter(s => s.durum === 'teklif_bekleniyor');

    // ── YETERSİZ/KRİTİK STOK TESPİTİ ────────────────────────────────────────
    // Bir hammadde: (a) stoğu sıfır veya altındaysa ("yetersiz") ya da
    // (b) Depo Panel'de tanımlı kritik seviyenin altındaysa ("kritik")
    // burada listelenir. Zaten satınalma sürecinde olan (teklif_bekleniyor/
    // siparis_acildi durumunda bekleyen bir talebi/siparişi olan) kalemler
    // tekrar "ihtiyaç" gibi gösterilmez — mükerrer talep oluşmasın.
    const bekleyenHammaddeIdleri = new Set([
      ...satinalmaTalepleri.filter(s => s.durum === 'teklif_bekleniyor').map(s => s.hammaddeId),
      ...satinalmaSiparisleri.filter(s => !['tamamlandi', 'reddedildi'].includes(s.durum)).map(s => s.hammaddeId)
    ].filter(Boolean));
    const stokUyarilari = hammaddeler.map(h => {
      const stokMiktar = App.stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', h.id);
      const kritik = kritikStokSeviyeleri.find(k => k.hammaddeId === h.id);
      const kritikMiktar = kritik ? kritik.miktar : null;
      const yetersiz = stokMiktar <= 0;
      const kritikAltinda = kritikMiktar != null && stokMiktar < kritikMiktar;
      return { hammadde: h, stokMiktar, kritikMiktar, yetersiz, kritikAltinda };
    }).filter(x => (x.yetersiz || x.kritikAltinda) && !bekleyenHammaddeIdleri.has(x.hammadde.id));

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Satınalma Paneli</div>
          <div class="page-sub">Üretim/depo/planlamadan gelen talepleri görün, fiyat güncelleyip tedarikçiye satınalma siparişi açın</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="sp-goto-hammadde">Hammadde Fiyatlarını Güncelle</button>
        </div>
      </div>

      <div class="grid grid-4">
        <div class="kpi"><div class="kpi-lbl">Bekleyen Talep</div><div class="kpi-val amber">${acikTalepler.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Sipariş Açılacak Kalem</div><div class="kpi-val blue">${bekleyenSatinalma.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Açık Satınalma Siparişi</div><div class="kpi-val purple">${satinalmaSiparisleri.filter(s => s.durum !== 'tamamlandi' && s.durum !== 'reddedildi').length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Yetersiz/Kritik Stok</div><div class="kpi-val ${stokUyarilari.length ? 'red' : 'green'}">${stokUyarilari.length}</div></div>
      </div>

      <div class="tabs">
        <div class="tab ${activeTab === 'talepler' ? 'active' : ''}" data-tab="talepler">Gelen Talepler</div>
        <div class="tab ${activeTab === 'siparisler' ? 'active' : ''}" data-tab="siparisler">Satınalma Siparişleri</div>
        <div class="tab ${activeTab === 'stokdurumu' ? 'active' : ''}" data-tab="stokdurumu">Yetersiz/Kritik Stok ${stokUyarilari.length ? '<span class="pill pill-red" style="margin-left:4px">' + stokUyarilari.length + '</span>' : ''}</div>
      </div>
      <div id="sp-tab-content"></div>
    `;

    document.getElementById('sp-goto-hammadde').onclick = () => App.goTo('hammadde');
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('sp-tab-content');
    if (activeTab === 'talepler') {
      content.innerHTML = renderTalepTab(talepler, satinalmaTalepleri, hammaddeler);
      wireTalepTab(talepler, satinalmaTalepleri, hammaddeler, tedarikciler, render, main);
    } else if (activeTab === 'siparisler') {
      content.innerHTML = renderSiparisTab(satinalmaSiparisleri);
      wireSiparisTab(satinalmaSiparisleri, render, main);
    } else {
      content.innerHTML = renderStokDurumuTab(stokUyarilari);
      wireStokDurumuTab(stokUyarilari, tedarikciler, render, main);
    }
  }

  // ── YETERSİZ/KRİTİK STOK — SATINALMADAN DOĞRUDAN SİPARİŞ OLUŞTUR ─────────
  function renderStokDurumuTab(stokUyarilari) {
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Yetersiz veya Kritik Seviyenin Altındaki Hammaddeler</div></div>
      <div class="fhint" style="margin-bottom:8px">Stoğu tükenmiş ("Yetersiz") veya Depo Panel'de tanımlı kritik seviyenin altına düşmüş ("Kritik") hammaddeler burada listelenir. Zaten bekleyen bir talebi/siparişi olan kalemler mükerrer görünmez.</div>`;
    if (!stokUyarilari.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="eicon">✓</div><div class="etitle">Yetersiz veya kritik stok yok</div><div class="edesc">Tüm hammaddeler yeterli seviyede veya zaten satınalma sürecinde.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Stok Kodu</th><th>Hammadde</th><th class="r">Mevcut Stok</th><th class="r">Kritik Seviye</th><th>Durum</th><th></th></tr>`;
      [...stokUyarilari].sort((a, b) => (a.yetersiz === b.yetersiz) ? 0 : (a.yetersiz ? -1 : 1)).forEach(x => {
        html += `<tr style="background:${x.yetersiz ? 'var(--red-bg)' : 'var(--amber-bg)'}">
          <td class="mono" style="font-size:11px">${App.escapeHtml(x.hammadde.stokKodu || '')}</td>
          <td>${App.escapeHtml(x.hammadde.ad)}</td>
          <td class="r">${App.fmt(x.stokMiktar, 1)} ${App.escapeHtml(x.hammadde.birim)}</td>
          <td class="r">${x.kritikMiktar != null ? App.fmt(x.kritikMiktar, 1) + ' ' + App.escapeHtml(x.hammadde.birim) : '<span class="muted">Tanımsız</span>'}</td>
          <td>${x.yetersiz ? '<span class="pill pill-red">⚠ Yetersiz (Stok Yok)</span>' : '<span class="pill pill-amber">⚠ Kritik Seviye Altında</span>'}</td>
          <td><button class="btn btn-sm btn-green sp-stok-siparis-olustur" data-id="${x.hammadde.id}">+ Sipariş Oluştur</button></td>
        </tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireStokDurumuTab(stokUyarilari, tedarikciler, render, main) {
    document.querySelectorAll('.sp-stok-siparis-olustur').forEach(b => b.onclick = async () => {
      const x = stokUyarilari.find(u => u.hammadde.id === b.dataset.id);
      if (!x) return;
      // Kritik seviye tanımlıysa, kritik seviyeye ulaşacak kadar (en az
      // kritik miktar kadar) sipariş önerilir; tanımsızsa makul bir
      // varsayılan (örn. 10 birim) önerilir — kullanıcı miktarı değiştirebilir.
      const onerilenMiktar = x.kritikMiktar != null ? Math.max(1, x.kritikMiktar - x.stokMiktar) : 10;
      const satinalmaTalebi = {
        id: App.uid('SAT'), kod: 'SAT-' + Date.now().toString(36).toUpperCase(),
        kaynakTalepId: null, kalemAdi: x.hammadde.ad, hammaddeId: x.hammadde.id,
        miktar: Math.ceil(onerilenMiktar), birim: x.hammadde.birim,
        tedarikciId: x.hammadde.varsayilanTedarikciId || null, tedarikciAdi: x.hammadde.varsayilanTedarikciAdi || null,
        not: x.yetersiz ? 'Stok tükendi — otomatik satınalma talebi (Satınalma Paneli)' : 'Kritik seviye altına düştü — otomatik satınalma talebi (Satınalma Paneli)',
        durum: 'teklif_bekleniyor', tarih: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.satinalmaTalepleri.upsert(satinalmaTalebi));
      App.toast('Satınalma talebi oluşturuldu: ' + satinalmaTalebi.kod + ' — "Gelen Talepler" sekmesinden sipariş açabilirsiniz', 'ok');
      activeTab = 'talepler';
      render(main);
    });
  }

  function renderTalepTab(talepler, satinalmaTalepleri, hammaddeler) {
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Üretim / Depo / Planlamadan Gelen Talepler</div></div>`;
    if (!talepler.length) {
      html += `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Henüz talep yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Talep Kodu</th><th>Kaynak</th><th>Kalem</th><th class="r">Miktar</th><th>Durum</th><th>Tarih</th><th></th></tr>`;
      [...talepler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(t => {
        html += `<tr>
          <td class="mono">${t.kod}</td>
          <td><span class="pill ${t.kaynak === 'uretim' ? 'pill-blue' : 'pill-purple'}">${t.kaynak === 'uretim' ? 'Üretim' : 'Depo'}</span></td>
          <td>${App.escapeHtml(t.kalemAdi)}</td>
          <td class="r">${App.fmt(t.miktar, 0)} ${t.birim || ''}</td>
          <td>${talepDurumPill(t.durum)}</td>
          <td style="font-size:11px">${t.tarih}</td>
          <td>${t.durum === 'beklemede' ? `<button class="btn btn-sm btn-blue sp-isle" data-id="${t.id}">Talebe Dönüştür</button>` : '—'}</td>
        </tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    html += `<div class="card">
      <div class="card-hdr"><div class="card-title">Satınalma Bekleyen Kalemler (Sipariş Açılacak) — Tedarikçi Bazlı</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-green" id="sp-toplu-onayla" style="display:none">✓ Seçilenleri Toplu Onayla (Sadece Miktar)</button>
          <button class="btn btn-sm btn-blue" id="sp-new-satinalma">+ Manuel Satınalma İhtiyacı</button>
        </div>
      </div>`;
    const bekleyen = satinalmaTalepleri.filter(s => s.durum === 'teklif_bekleniyor');
    if (!bekleyen.length) {
      html += `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Sipariş açılacak kalem yok.</div></div>`;
    } else {
      html += `<div class="fhint" style="margin-bottom:8px">Tedarikçisi kayıtlı (✓ işaretli) kalemler toplu seçilip, sadece miktar girilerek tek seferde sipariş açılabilir. Liste, kalemin kayıtlı/tercih edilen tedarikçisine göre gruplanmıştır.</div>`;

      // Tedarikçi bazlı gruplama: hammaddenin kayıtlı varsayılan tedarikçisi
      // veya talepteki tercih edilen tedarikçi kullanılır; ikisi de yoksa
      // "Tedarikçi Belirlenmemiş" grubuna düşer.
      const gruplar = new Map();
      bekleyen.forEach(s => {
        const hm = hammaddeler.find(h => h.id === s.hammaddeId);
        const tedAdi = (hm && hm.varsayilanTedarikciAdi) || s.tedarikciAdi || null;
        const grupAnahtari = tedAdi || '__belirsiz__';
        if (!gruplar.has(grupAnahtari)) gruplar.set(grupAnahtari, { tedarikciAdi: tedAdi, kalemler: [] });
        gruplar.get(grupAnahtari).kalemler.push({ talep: s, hm, varsayilanTedarikci: hm ? hm.varsayilanTedarikciAdi : null });
      });

      // Tedarikçisi belirli gruplar önce, belirsiz olan en son gösterilir.
      const siraliGruplar = [...gruplar.entries()].sort((a, b) => {
        if (a[0] === '__belirsiz__') return 1;
        if (b[0] === '__belirsiz__') return -1;
        return a[1].tedarikciAdi.localeCompare(b[1].tedarikciAdi);
      });

      siraliGruplar.forEach(([anahtar, grup]) => {
        html += `<div style="margin-bottom:14px">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px">
            ${grup.tedarikciAdi ? App.escapeHtml(grup.tedarikciAdi) : '<span class="muted">Tedarikçi Belirlenmemiş</span>'}
            <span class="pill pill-gray">${grup.kalemler.length} kalem</span>
          </div>
          <table class="dtable"><tr><th></th><th>Kod</th><th>Kalem</th><th class="r">Miktar</th><th>Kaynak</th><th>Tarih</th><th></th></tr>`;
        grup.kalemler.forEach(({ talep: s, varsayilanTedarikci }) => {
          const kaynakLabel = s.kaynakHammaddeIhtiyaciId ? 'Planlama (Hammadde İhtiyacı)' : (s.kaynakTalepId ? 'Üretim/Depo Talebi' : 'Manuel');
          html += `<tr>
            <td>${varsayilanTedarikci ? `<input type="checkbox" class="sp-toplu-check" data-id="${s.id}">` : ''}</td>
            <td class="mono">${s.kod}</td>
            <td>${App.escapeHtml(s.kalemAdi)}</td>
            <td class="r">${App.fmt(s.miktar, 0)} ${s.birim || ''}</td>
            <td><span class="pill pill-gray">${kaynakLabel}</span></td>
            <td style="font-size:11px">${s.tarih}</td>
            <td><button class="btn btn-sm btn-green sp-siparis-ac" data-id="${s.id}">Fiyat Gir & Sipariş Aç</button></td>
          </tr>`;
        });
        html += `</table></div>`;
      });
    }
    html += `</div>`;
    return html;
  }

  function wireTalepTab(talepler, satinalmaTalepleri, hammaddeler, tedarikciler, render, main) {
    document.getElementById('sp-new-satinalma').onclick = () => openSatinalmaForm(null, hammaddeler, tedarikciler, () => render(main));
    document.querySelectorAll('.sp-isle').forEach(b => b.onclick = () => {
      const t = talepler.find(x => x.id === b.dataset.id);
      openSatinalmaForm(t, hammaddeler, tedarikciler, () => render(main));
    });
    document.querySelectorAll('.sp-siparis-ac').forEach(b => b.onclick = () => {
      const s = satinalmaTalepleri.find(x => x.id === b.dataset.id);
      openSiparisAcForm(s, hammaddeler, tedarikciler, () => render(main));
    });

    const topluBtn = document.getElementById('sp-toplu-onayla');
    const checkboxlar = document.querySelectorAll('.sp-toplu-check');
    function topluButonGorunurlugu() {
      const seciliCheckboxlar = [...checkboxlar].filter(c => c.checked);
      const seciliSayisi = seciliCheckboxlar.length;
      const seciliToplam = seciliCheckboxlar.reduce((a, c) => {
        const talep = satinalmaTalepleri.find(s => s.id === c.dataset.id);
        const hm = talep ? hammaddeler.find(h => h.id === talep.hammaddeId) : null;
        if (!talep || !hm) return a;
        return a + App.toTRY(hm.birimFiyat * talep.miktar, hm.dvz, App.state.ayarlar);
      }, 0);
      if (topluBtn) {
        topluBtn.style.display = seciliSayisi > 0 ? 'inline-block' : 'none';
        topluBtn.textContent = seciliSayisi > 0 ? `✓ Seçilenleri Toplu Onayla (${seciliSayisi} kalem — ${App.fmtTL(seciliToplam)})` : '✓ Seçilenleri Toplu Onayla (Sadece Miktar)';
      }
    }
    checkboxlar.forEach(c => c.onchange = topluButonGorunurlugu);
    if (topluBtn) topluBtn.onclick = () => {
      const seciliIdler = [...checkboxlar].filter(c => c.checked).map(c => c.dataset.id);
      const seciliTalepler = satinalmaTalepleri.filter(s => seciliIdler.includes(s.id));
      openTopluOnayForm(seciliTalepler, hammaddeler, tedarikciler, () => render(main));
    };
  }

  // Tedarikçisi zaten kayıtlı (hammaddenin varsayılanTedarikciId'si) talepler
  // için, kullanıcıdan SADECE miktar bilgisi istenir; fiyat son kayıtlı
  // hammadde fiyatından, tedarikçi de varsayılandan alınır.
  function openTopluOnayForm(secilenTalepler, hammaddeler, tedarikciler, onSaved) {
    const ayarlarOnizleme = App.state.ayarlar;
    const genelToplamOnizleme = secilenTalepler.reduce((a, s) => {
      const hm = hammaddeler.find(h => h.id === s.hammaddeId);
      return a + (hm ? App.toTRY(hm.birimFiyat * s.miktar, hm.dvz, ayarlarOnizleme) : 0);
    }, 0);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">${secilenTalepler.length} kalem için tedarikçi otomatik atanacak. Sadece miktarları kontrol edip onaylayın.</div>
      <table class="dtable"><tr><th>Kalem</th><th>Tedarikçi</th><th class="r">Miktar</th><th class="r">Son Fiyat</th><th class="r">Tutar (₺)</th></tr>
        ${secilenTalepler.map(s => {
          const hm = hammaddeler.find(h => h.id === s.hammaddeId);
          const tutarTRY = hm ? App.toTRY(hm.birimFiyat * s.miktar, hm.dvz, ayarlarOnizleme) : 0;
          return `<tr>
            <td>${App.escapeHtml(s.kalemAdi)}</td>
            <td><span class="pill pill-green">${App.escapeHtml(hm ? hm.varsayilanTedarikciAdi : '—')}</span></td>
            <td class="r"><input class="finput tof-miktar" data-id="${s.id}" type="number" value="${s.miktar}" style="width:80px;text-align:right"></td>
            <td class="r">${hm ? App.fmt(hm.birimFiyat, 2) + ' ' + hm.dvz : '—'}</td>
            <td class="r" id="tof-tutar-${s.id}">${App.fmtTL(tutarTRY)}</td>
          </tr>`;
        }).join('')}
        <tr class="total-row"><td colspan="4">GENEL TOPLAM</td><td class="r" id="tof-genel-toplam">${App.fmtTL(genelToplamOnizleme)}</td></tr>
      </table>
    `;
    const footer = `<button class="btn" id="tof-cancel">Vazgeç</button><button class="btn btn-green" id="tof-confirm">Toplu Sipariş Aç</button>`;
    App.openModal({ title: 'Toplu Satınalma Onayı', body, footer, wide: true });
    document.getElementById('tof-cancel').onclick = App.closeModal;

    // Miktar değiştirilince ilgili satırın ve genel toplamın anlık güncellenmesi
    document.querySelectorAll('.tof-miktar').forEach(inp => inp.oninput = () => {
      let genelToplam = 0;
      secilenTalepler.forEach(s => {
        const hm = hammaddeler.find(h => h.id === s.hammaddeId);
        const miktarInput = document.querySelector(`.tof-miktar[data-id="${s.id}"]`);
        const miktar = parseFloat(miktarInput.value) || 0;
        const tutarTRY = hm ? App.toTRY(hm.birimFiyat * miktar, hm.dvz, ayarlarOnizleme) : 0;
        const tutarEl = document.getElementById('tof-tutar-' + s.id);
        if (tutarEl) tutarEl.textContent = App.fmtTL(tutarTRY);
        genelToplam += tutarTRY;
      });
      const genelToplamEl = document.getElementById('tof-genel-toplam');
      if (genelToplamEl) genelToplamEl.textContent = App.fmtTL(genelToplam);
    });

    document.getElementById('tof-confirm').onclick = async () => {
      const ayarlar = App.state.ayarlar;
      const satinalmaSiparisleri = await Store.satinalmaSiparisleri.all();
      const tumSatinalmaTalepleri = await Store.satinalmaTalepleri.all();
      const acilanSiparisler = [];
      let acilanSayisi = 0;
      for (const talep of secilenTalepler) {
        const hm = hammaddeler.find(h => h.id === talep.hammaddeId);
        const ted = tedarikciler.find(t => t.id === hm.varsayilanTedarikciId);
        if (!hm || !ted) continue;
        const miktarInput = document.querySelector(`.tof-miktar[data-id="${talep.id}"]`);
        const miktar = parseFloat(miktarInput.value) || talep.miktar;
        const toplamTRY = App.toTRY(hm.birimFiyat * miktar, hm.dvz, ayarlar);
        const yeniSiparis = {
          id: App.uid('SAS'), kod: 'SAS-' + Date.now().toString(36).toUpperCase() + '-' + acilanSayisi,
          kaynakSatinalmaTalepId: talep.id, hammaddeId: talep.hammaddeId, kalemAdi: talep.kalemAdi,
          miktar, birim: talep.birim, tedarikciId: ted.id, tedarikciAdi: ted.unvan,
          birimFiyat: hm.birimFiyat, dvz: hm.dvz, toplamTRY, terminGun: 7,
          not: 'Toplu onay ile (kayıtlı tedarikçi) oluşturuldu.',
          durum: 'yonetim_onayi_bekliyor', tarih: new Date().toISOString().slice(0, 10),
          tahminiGirisTarihi: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
        };
        satinalmaSiparisleri.push(yeniSiparis);
        acilanSiparisler.push(yeniSiparis);
        const tIndex = tumSatinalmaTalepleri.findIndex(t => t.id === talep.id);
        if (tIndex >= 0) tumSatinalmaTalepleri[tIndex].durum = 'siparis_acildi';
        acilanSayisi++;
      }
      await App.persist(() => Store.satinalmaSiparisleri.save(satinalmaSiparisleri));
      await App.persist(() => Store.satinalmaTalepleri.save(tumSatinalmaTalepleri));
      App.toast(`${acilanSayisi} satınalma siparişi toplu olarak açıldı`, 'ok');
      App.closeModal();

      // ── KULLANICI İSTEĞİ: Toplu açılan siparişlerin HİÇBİRİNİN henüz
      // ödeme planı (peşinat/çek/kredi kartı) yok — bu yüzden Yönetim
      // Onayı'na göndermeden önce, her biri için SIRAYLA ödeme planı formu
      // açılır (çek seçimi/rezervasyonu dahil). Form kapandığında otomatik
      // olarak sıradaki sipariş için form açılır.
      // KRİTİK DÜZELTME: musteriCekleri her adımda TAZE çekilmelidir — aksi
      // halde 1. siparişte rezerve edilen bir çek, 2./3. sipariş formunda
      // hâlâ "elde" görünüp tekrar seçilebilir (görünüşte 3 çek seçilmiş gibi
      // olur, ama gerçekte aynı çek birden fazla siparişe rezerve edilmeye
      // çalışılır ve sadece biri gerçekten işlenir — "3 çek seçtim ama
      // Tedarikçi Ödemeleri'nde 1 tane görünüyor" şikayetinin kök nedeni).
      let sira = 0;
      const siradakiniAc = async () => {
        if (sira >= acilanSiparisler.length) { onSaved(); return; }
        const s = acilanSiparisler[sira];
        sira++;
        const musteriCekleriTaze = await Store.musteriCekleri.all();
        const icerikHtml = `
          <table class="dtable"><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">Toplam</th></tr>
            <tr><td>${App.escapeHtml(s.kalemAdi)}</td>
              <td class="r">${App.fmt(s.miktar, 2)} ${App.escapeHtml(s.birim || '')}</td>
              <td class="r">${App.fmt(s.birimFiyat, 4)} ${s.dvz}</td>
              <td class="r">${App.fmtTL(s.toplamTRY)}</td></tr>
            <tr class="total-row"><td colspan="3">TOPLAM</td><td class="r">${App.fmtTL(s.toplamTRY)}</td></tr>
          </table>`;
        App.siparisIcerikVeOdemeFormuAc(s, {
          mod: 'satinalma',
          musteriCekleri: musteriCekleriTaze,
          baslikOnEki: 'Ödeme Planı Girin (' + sira + '/' + acilanSiparisler.length + '): ',
          baslikSub: s.tedarikciAdi,
          icerikHtml,
          onaylaButonMetni: 'Kaydet ve Sıradakine Geç',
          onOnayla: async (odemePlani) => {
            const guncelSiparisler = await Store.satinalmaSiparisleri.all();
            const sGuncel = guncelSiparisler.find(x => x.id === s.id);
            if (sGuncel) { sGuncel.odemePlani = odemePlani; await Store.satinalmaSiparisleri.save(guncelSiparisler); }
            siradakiniAc();
          }
        });
      };
      siradakiniAc();
    };
  }

  function openSiparisAcForm(talep, hammaddeler, tedarikciler, onSaved, secilenTedarikciId) {
    const hm = hammaddeler.find(h => h.id === talep.hammaddeId);
    const onerilenFiyat = hm ? hm.birimFiyat : '';
    const onerilenDvz = hm ? hm.dvz : 'TL';
    // Hammaddenin kayıtlı varsayılan tedarikçisi varsa otomatik doldurulur,
    // kullanıcıdan tekrar "tedarikçi seç" bilgisi istenmez.
    const baslangicTedarikciId = secilenTedarikciId || talep.tedarikciId || (hm ? hm.varsayilanTedarikciId : null) || null;
    const secilenTed = baslangicTedarikciId ? tedarikciler.find(t => t.id === baslangicTedarikciId) : null;
    const varsayilandanGeldi = !secilenTedarikciId && !talep.tedarikciId && hm && hm.varsayilanTedarikciId;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b class="mono">${App.escapeHtml(talep.kod)}</b> — ${App.escapeHtml(talep.kalemAdi)} · İhtiyaç: ${App.fmt(talep.miktar, 0)} ${talep.birim || ''}</div>
      ${varsayilandanGeldi ? `<div class="fhint" style="color:var(--green-text);margin-bottom:8px">✓ Bu hammaddenin kayıtlı tedarikçisi otomatik seçildi, tekrar girmenize gerek yok.</div>` : ''}
      <div class="fgroup"><label class="flbl">Tedarikçi</label>
        <div class="flex-gap" style="gap:8px">
          <input class="finput" id="sa-tedarikci-ad" value="${secilenTed ? App.escapeHtml(secilenTed.unvan) : ''}" placeholder="Henüz seçilmedi" readonly style="flex:1;background:var(--bg)">
          <input type="hidden" id="sa-tedarikci-id" value="${secilenTed ? secilenTed.id : ''}">
          <button type="button" class="btn btn-blue" id="sa-tedarikci-sec-sayfa">🔍 Tedarikçi Seç</button>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Birim Fiyat</label><input class="finput" id="sa-fiyat" type="number" step="0.0001" value="${onerilenFiyat}"></div>
        <div class="fgroup"><label class="flbl">Para Birimi</label>
          <select class="fselect" id="sa-dvz">
            <option value="TL" ${onerilenDvz === 'TL' ? 'selected' : ''}>₺ TL</option>
            <option value="USD" ${onerilenDvz === 'USD' ? 'selected' : ''}>$ USD</option>
            <option value="EUR" ${onerilenDvz === 'EUR' ? 'selected' : ''}>€ EUR</option>
          </select>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Miktar</label><input class="finput" id="sa-miktar" type="number" value="${talep.miktar}" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Termin (gün)</label><input class="finput" id="sa-termin" type="number" value="7"></div>
      </div>
      <div class="fcheck"><input type="checkbox" id="sa-fiyat-guncelle" checked><label for="sa-fiyat-guncelle">Hammadde kartındaki güncel fiyatı da bu değerle güncelle</label></div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Nakliye Bilgisi</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Nakliye Yöntemi</label>
          <select class="fselect" id="sa-nakliye-yontemi">
            <option value="">— Belirtilmedi —</option>
            <option value="kargo">Kargo</option>
            <option value="parsiyel">Parsiyel</option>
            <option value="ambar">Ambar</option>
            <option value="kamyon">Kamyon</option>
            <option value="tir">Tır</option>
            <option value="konteyner">Konteyner</option>
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Nakliye Bedeli</label><input class="finput" id="sa-nakliye-bedel" type="number" step="0.01" value="0"></div>
        <div class="fgroup"><label class="flbl">Para Birimi</label>
          <select class="fselect" id="sa-nakliye-dvz">
            <option value="TL">₺ TL</option><option value="USD">$ USD</option><option value="EUR">€ EUR</option>
          </select>
        </div>
      </div>
      <div class="fcheck"><input type="checkbox" id="sa-nakliye-maliyete-ekle" checked><label for="sa-nakliye-maliyete-ekle">Nakliye bedelini hammadde birim maliyetine ekle</label></div>
      <div class="fgroup"><label class="flbl">Not</label><textarea class="ftextarea" id="sa-not"></textarea></div>
    `;
    const footer = `<button class="btn" id="sa-cancel">Vazgeç</button><button class="btn btn-green" id="sa-confirm">İleri: Ödeme Planı</button>`;
    App.openModal({ title: 'Fiyat Gir & Sipariş Aç', body, footer, wide: true });
    document.getElementById('sa-cancel').onclick = App.closeModal;

    // "Tedarikçi Seç" tıklanınca: girilmiş form değerlerini sakla, modalı kapat,
    // Cari Seçici sayfasına geç. Seçim yapılınca (veya yeni tedarikçi/müşteri
    // kartı oluşturulunca) bu formu aynı değerlerle yeniden açıyoruz.
    document.getElementById('sa-tedarikci-sec-sayfa').onclick = () => {
      const formDurumu = {
        fiyat: document.getElementById('sa-fiyat').value,
        dvz: document.getElementById('sa-dvz').value,
        miktar: document.getElementById('sa-miktar').value,
        termin: document.getElementById('sa-termin').value,
        fiyatGuncelle: document.getElementById('sa-fiyat-guncelle').checked,
        not: document.getElementById('sa-not').value
      };
      App.closeModal();
      App.goTo('cari_secici', {
        baslik: 'Tedarikçi Seç (Satınalma Siparişi İçin)',
        varsayilanGrup: 'tedarikci',
        geriDon: () => { App.goTo('satinalma_panel'); reopenWithState(talep, hammaddeler, tedarikciler, onSaved, baslangicTedarikciId, formDurumu); },
        onSecildi: async (secim) => {
          App.goTo('satinalma_panel');
          const guncelTedarikciler = await Store.tedarikciler.all();
          reopenWithState(talep, hammaddeler, guncelTedarikciler, onSaved, secim.id, formDurumu);
        }
      });
    };

    document.getElementById('sa-confirm').onclick = async () => {
      const tedarikciId = document.getElementById('sa-tedarikci-id').value;
      const ted = tedarikciler.find(t => t.id === tedarikciId);
      if (!ted) { App.toast('Tedarikçi seçmelisiniz', 'err'); return; }
      const birimFiyat = parseFloat(document.getElementById('sa-fiyat').value);
      if (!birimFiyat) { App.toast('Birim fiyat girmelisiniz', 'err'); return; }
      const dvz = document.getElementById('sa-dvz').value;
      const miktar = parseFloat(document.getElementById('sa-miktar').value) || talep.miktar;
      const terminGun = parseInt(document.getElementById('sa-termin').value) || 7;
      const ayarlar = App.state.ayarlar;

      // Nakliye bedeli (TL karşılığı), istenirse birim maliyete eklenir
      const nakliyeYontemi = document.getElementById('sa-nakliye-yontemi').value;
      const nakliyeBedelHam = parseFloat(document.getElementById('sa-nakliye-bedel').value) || 0;
      const nakliyeDvz = document.getElementById('sa-nakliye-dvz').value;
      const nakliyeBedelTRY = App.toTRY(nakliyeBedelHam, nakliyeDvz, ayarlar);
      const nakliyeMaliyeteEklensin = document.getElementById('sa-nakliye-maliyete-ekle').checked;
      const fiyatGuncelle = document.getElementById('sa-fiyat-guncelle').checked;
      const notMetni = document.getElementById('sa-not').value.trim();
      const toplamTRY = App.toTRY(birimFiyat * miktar, dvz, ayarlar) + nakliyeBedelTRY;

      // Taslak satınalma siparişi — ortak ödeme planı formu bunun üzerinden açılır.
      const taslakSiparis = {
        id: App.uid('SAS'),
        kod: 'SAS-' + Date.now().toString(36).toUpperCase(),
        kaynakSatinalmaTalepId: talep.id,
        hammaddeId: talep.hammaddeId, kalemAdi: talep.kalemAdi,
        miktar, birim: talep.birim,
        tedarikciId: ted.id, tedarikciAdi: ted.unvan,
        birimFiyat, dvz, toplamTRY, terminGun,
        nakliyeYontemi, nakliyeBedel: nakliyeBedelHam, nakliyeDvz, nakliyeBedelTRY,
        not: notMetni,
        durum: 'yonetim_onayi_bekliyor',
        tarih: new Date().toISOString().slice(0, 10),
        tahminiGirisTarihi: new Date(Date.now() + terminGun * 86400000).toISOString().slice(0, 10)
      };

      App.closeModal();
      const musteriCekleri = await Store.musteriCekleri.all();
      const icerikHtml = `
        <table class="dtable"><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">Toplam</th></tr>
          <tr><td>${App.escapeHtml(taslakSiparis.kalemAdi)}</td>
            <td class="r">${App.fmt(taslakSiparis.miktar, 2)} ${App.escapeHtml(taslakSiparis.birim || '')}</td>
            <td class="r">${App.fmt(taslakSiparis.birimFiyat, 4)} ${taslakSiparis.dvz}</td>
            <td class="r">${App.fmtTL(taslakSiparis.toplamTRY - nakliyeBedelTRY)}</td></tr>
          ${nakliyeBedelTRY > 0 ? `<tr><td colspan="3">Nakliye (${taslakSiparis.nakliyeYontemi || '—'})</td><td class="r">${App.fmtTL(nakliyeBedelTRY)}</td></tr>` : ''}
          <tr class="total-row"><td colspan="3">TOPLAM</td><td class="r">${App.fmtTL(taslakSiparis.toplamTRY)}</td></tr>
        </table>`;

      App.siparisIcerikVeOdemeFormuAc(taslakSiparis, {
        mod: 'satinalma',
        musteriCekleri,
        baslikOnEki: 'Satınalma Siparişi: ',
        baslikSub: ted.unvan,
        icerikHtml,
        onOnayla: async (odemePlani) => {
          taslakSiparis.odemePlani = odemePlani;
          await App.persist(() => Store.satinalmaSiparisleri.upsert(taslakSiparis));

          // ── NAKLİYE (KARGO) PAYI ────────────────────────────────────────
          // Toplam nakliye bedeli alınan ADEDE bölünüp hammadde kartına AYRI
          // bir alan olarak yazılır. Ayrı tutulmasının sebebi: fiyatın içine
          // gömülürse (eski davranış) hem ne kadarının kargo olduğu
          // görünmezdi hem de kullanıcı fiyatı elle güncelleyince kargo payı
          // sessizce silinirdi.
          //
          // ÖNEMLİ: bu, "fiyatı güncelle" kutusundan BAĞIMSIZ çalışır.
          // Eskiden yalnızca o kutu işaretliyse uygulanıyordu; kullanıcı
          // kutuyu kapattığında kargo maliyete hiç girmiyordu.
          if (talep.hammaddeId && (nakliyeMaliyeteEklensin || fiyatGuncelle)) {
            const hammaddeler2 = await Store.hammaddeler.all();
            const hm2 = hammaddeler2.find(h => h.id === talep.hammaddeId);
            if (hm2) {
              if (nakliyeMaliyeteEklensin) {
                hm2.nakliyeBirimMaliyeti = miktar > 0 ? nakliyeBedelTRY / miktar : 0;
                hm2.nakliyeDvz = 'TL';   // bölme TL üzerinden yapıldı
                hm2.nakliyeKaynakBelge = taslakSiparis.kod;
                hm2.nakliyeGuncellemeTarihi = new Date().toISOString().slice(0, 10);
              }
              if (fiyatGuncelle) {
                // Mal bedeli kendi para biriminde saklanır — kargo AYRI alanda
                hm2.birimFiyat = birimFiyat;
                hm2.dvz = dvz;
                hm2.sonAlisTarihi = new Date().toISOString().slice(0, 10);
                if (!hm2.varsayilanTedarikciId) { hm2.varsayilanTedarikciId = ted.id; hm2.varsayilanTedarikciAdi = ted.unvan; }
              }
              await App.persist(() => Store.hammaddeler.upsert(hm2));
            }
          }

          talep.durum = 'siparis_acildi';
          await App.persist(() => Store.satinalmaTalepleri.upsert(talep));

          App.toast('Satınalma siparişi oluşturuldu ve yönetim onayına gönderildi: ' + taslakSiparis.kod, 'ok');
          onSaved();
        }
      });
    };
  }

  // Tedarikçi seçiminden sonra formu, kullanıcının önceden girdiği değerlerle
  // (fiyat, miktar, termin, not vb.) yeniden açar.
  function reopenWithState(talep, hammaddeler, tedarikciler, onSaved, tedarikciId, formDurumu) {
    openSiparisAcForm(talep, hammaddeler, tedarikciler, onSaved, tedarikciId);
    if (!formDurumu) return;
    setTimeout(() => {
      const f = (id) => document.getElementById(id);
      if (f('sa-fiyat')) f('sa-fiyat').value = formDurumu.fiyat;
      if (f('sa-dvz')) f('sa-dvz').value = formDurumu.dvz;
      if (f('sa-miktar')) f('sa-miktar').value = formDurumu.miktar;
      if (f('sa-termin')) f('sa-termin').value = formDurumu.termin;
      if (f('sa-fiyat-guncelle')) f('sa-fiyat-guncelle').checked = formDurumu.fiyatGuncelle;
      if (f('sa-not')) f('sa-not').value = formDurumu.not;
    }, 0);
  }

  function renderSiparisTab(satinalmaSiparisleri) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Satınalma Siparişleri — Tedarikçi Bazlı</div></div>`;
    if (!satinalmaSiparisleri.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz satınalma siparişi oluşturulmadı.</div></div>`;
    } else {
      const gruplar = new Map();
      satinalmaSiparisleri.forEach(s => {
        const anahtar = s.tedarikciAdi || '—';
        if (!gruplar.has(anahtar)) gruplar.set(anahtar, []);
        gruplar.get(anahtar).push(s);
      });
      [...gruplar.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([tedarikciAdi, liste], grupIndex) => {
        const grupToplam = liste.reduce((a, s) => a + (s.toplamTRY || 0), 0);
        const gonderilebilenler = liste.filter(s => s.durum === 'onaylandi');
        html += `<div style="margin-bottom:14px">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${App.escapeHtml(tedarikciAdi)} <span class="pill pill-gray">${liste.length} sipariş</span>
            <span class="pill pill-blue">${App.fmtTL(grupToplam)}</span>
            <span style="flex:1"></span>
            ${gonderilebilenler.length ? `<button class="btn btn-sm btn-blue sp-toplu-gonder" data-grup="${grupIndex}" style="display:none">📤 Seçilenleri Toplu Gönder</button>` : ''}
            <button class="btn btn-sm sp-toplu-excel" data-ted="${App.escapeHtml(tedarikciAdi)}">⬇ Toplu Excel</button>
            <button class="btn btn-sm sp-toplu-pdf" data-ted="${App.escapeHtml(tedarikciAdi)}">⬇ Toplu PDF</button>
          </div>
          <table class="dtable"><tr><th></th><th>Kod</th><th>Kalem</th><th class="r">Toplam</th><th>Ödeme & Nakliye</th><th>Durum</th><th>Tahmini Giriş</th><th></th></tr>`;
        [...liste].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(s => {
          const op = s.odemePlani || {};
          const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı', nakit: 'Nakit', diger: 'Diğer' };
          const ozetEtiketler = [...new Set((op.odemeKalemleri || []).map(k => tipLabel[k.tip]))];
          const odemeOzeti = [
            op.pesinatTutar ? 'Peşinat: ' + App.fmtTL(op.pesinatTutar) : null,
            ozetEtiketler.length ? ozetEtiketler.join(', ') : null,
            s.nakliyeBedelTRY > 0 ? 'Nakliye: ' + App.fmtTL(s.nakliyeBedelTRY) + ' (' + (s.nakliyeYontemi || '—') + ')' : null
          ].filter(Boolean);
          html += `<tr>
            <td>${s.durum === 'onaylandi' ? `<input type="checkbox" class="sp-gonder-check" data-grup="${grupIndex}" data-id="${s.id}">` : ''}</td>
            <td class="mono">${s.kod}</td>
            <td>${App.escapeHtml(s.kalemAdi)}</td>
            <td class="r"><b>${App.fmtTL(s.toplamTRY)}</b></td>
            <td style="font-size:10.5px">${odemeOzeti.length ? odemeOzeti.join('<br>') : '<span class="muted">Girilmedi</span>'}</td>
            <td>${satinalmaSiparisDurumPill(s.durum)}</td>
            <td style="font-size:11px">${s.tahminiGirisTarihi || '—'}</td>
            <td style="display:flex;gap:6px">
              ${s.durum === 'onaylandi' ? `<button class="btn btn-sm btn-blue sp-gonder" data-id="${s.id}">Gönderildi İşaretle</button>` : ''}
              ${s.durum === 'birime_dondu' ? `<button class="btn btn-sm btn-amber sp-duzenle-gonder" data-id="${s.id}">✎ Düzenle & Yeniden Gönder</button>` : ''}
              <button class="btn btn-sm btn-ghost sp-cikti" data-id="${s.id}">Çıktı Al</button>
            </td>
          </tr>`;
          if (s.durum === 'birime_dondu' && s.redGerekce) {
            html += `<tr><td></td><td colspan="7" style="background:#FEF2F2;border-left:3px solid #EF4444;font-size:11px;padding:6px 10px">
              <b style="color:#B91C1C">⟲ Geri gönderme gerekçesi</b> (${App.escapeHtml(s.redEden || 'Yönetim')}, ${App.escapeHtml(s.redTarihi || '')}): ${App.escapeHtml(s.redGerekce)}
            </td></tr>`;
          }
        });
        html += `</table></div>`;
      });
    }
    html += `</div>`;
    return html;
  }

  function wireSiparisTab(satinalmaSiparisleri, render, main) {
    document.querySelectorAll('.sp-cikti').forEach(b => b.onclick = () => {
      const s = satinalmaSiparisleri.find(x => x.id === b.dataset.id);
      openCiktiModal(s);
    });
    document.querySelectorAll('.sp-gonder').forEach(b => b.onclick = () => {
      App.confirmDialog('Bu siparişi tedarikçiye gönderildi olarak işaretlemek istediğinize emin misiniz?', async () => {
        const s = satinalmaSiparisleri.find(x => x.id === b.dataset.id);
        s.durum = 'gonderildi';
        await App.persist(() => Store.satinalmaSiparisleri.upsert(s));
        App.toast('Sipariş tedarikçiye gönderildi olarak işaretlendi', 'ok');
        render(main);
      });
    });
    document.querySelectorAll('.sp-duzenle-gonder').forEach(b => b.onclick = () => {
      const s = satinalmaSiparisleri.find(x => x.id === b.dataset.id);
      // Siparişin içeriğini ve ödeme planını düzenleme formunda aç; kaydedince
      // tekrar yönetim onayına gönder (gerekçe temizlenir).
      const icerikHtml = `
        <div style="background:#FEF2F2;border-left:3px solid #EF4444;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:11.5px">
          <b style="color:#B91C1C">⟲ Yönetim geri gönderme gerekçesi:</b> ${App.escapeHtml(s.redGerekce || '—')}
        </div>
        <table class="dtable"><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">Toplam</th></tr>
          <tr><td>${App.escapeHtml(s.kalemAdi)}</td>
            <td class="r">${App.fmt(s.miktar, 2)} ${App.escapeHtml(s.birim || '')}</td>
            <td class="r">${App.fmt(s.birimFiyat, 4)} ${App.escapeHtml(s.dvz || 'TL')}</td>
            <td class="r">${App.fmtTL(s.toplamTRY)}</td></tr>
        </table>`;
      App.siparisIcerikVeOdemeFormuAc(s, {
        mod: 'satinalma',
        duzenlenebilir: true,
        baslikOnEki: 'Düzelt & Yeniden Gönder: ',
        baslikSub: s.tedarikciAdi,
        icerikHtml,
        onaylaButonMetni: 'Kaydet, Yönetim Onayına Yeniden Gönder',
        onOnayla: async (odemePlani) => {
          s.odemePlani = odemePlani;
          s.durum = 'yonetim_onayi_bekliyor';
          s.yenidenGonderildi = true;
          s.oncekiRedGerekce = s.redGerekce;
          delete s.redGerekce; delete s.redTarihi; delete s.redEden;
          await App.persist(() => Store.satinalmaSiparisleri.upsert(s));
          App.toast('Sipariş düzeltildi ve yönetim onayına yeniden gönderildi: ' + s.kod, 'ok');
          render(main);
        },
        onReddet: null
      });
    });
    document.querySelectorAll('.sp-toplu-pdf').forEach(b => b.onclick = () => {
      const tedarikciAdi = b.dataset.ted;
      const liste = satinalmaSiparisleri.filter(s => (s.tedarikciAdi || '—') === tedarikciAdi);
      App.satinalmaCiktiPdf(liste, tedarikciAdi);
    });

    // Her tedarikçi grubu kendi checkbox setini ve "Seçilenleri Toplu Gönder"
    // butonunu yönetir — bir gruptaki seçim diğerini etkilemez.
    document.querySelectorAll('.sp-toplu-gonder').forEach(topluBtn => {
      const grupIndex = topluBtn.dataset.grup;
      const checkboxlar = document.querySelectorAll(`.sp-gonder-check[data-grup="${grupIndex}"]`);
      function gorunurlugunuGuncelle() {
        const seciliCheckboxlar = [...checkboxlar].filter(c => c.checked);
        const seciliSayisi = seciliCheckboxlar.length;
        const seciliToplam = seciliCheckboxlar.reduce((a, c) => {
          const s = satinalmaSiparisleri.find(x => x.id === c.dataset.id);
          return a + (s ? (s.toplamTRY || 0) : 0);
        }, 0);
        topluBtn.style.display = seciliSayisi > 0 ? 'inline-block' : 'none';
        topluBtn.textContent = seciliSayisi > 0 ? `📤 Seçilenleri Toplu Gönder (${seciliSayisi} sipariş — ${App.fmtTL(seciliToplam)})` : '📤 Seçilenleri Toplu Gönder';
      }
      checkboxlar.forEach(c => c.onchange = gorunurlugunuGuncelle);
      topluBtn.onclick = () => {
        const seciliIdler = [...checkboxlar].filter(c => c.checked).map(c => c.dataset.id);
        if (!seciliIdler.length) return;
        App.confirmDialog(`Seçilen ${seciliIdler.length} siparişi topluca tedarikçiye gönderildi olarak işaretlemek istediğinize emin misiniz?`, async () => {
          const tumSiparisler = await Store.satinalmaSiparisleri.all();
          seciliIdler.forEach(id => {
            const s = tumSiparisler.find(x => x.id === id);
            if (s) s.durum = 'gonderildi';
          });
          await App.persist(() => Store.satinalmaSiparisleri.save(tumSiparisler));
          App.toast(`${seciliIdler.length} sipariş toplu olarak gönderildi işaretlendi`, 'ok');
          render(main);
        });
      };
    });
  }

  function openCiktiModal(siparis) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:14px"><b class="mono">${App.escapeHtml(siparis.kod)}</b> — ${App.escapeHtml(siparis.kalemAdi)} → ${App.escapeHtml(siparis.tedarikciAdi)}</div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-blue" id="cikti-excel" style="flex:1">⬇ Excel (.xlsx) İndir</button>
        <button class="btn btn-blue" id="cikti-pdf" style="flex:1">⬇ PDF İndir</button>
      </div>
    `;
    App.openModal({ title: 'Satınalma Siparişi Çıktısı', body, footer: `<button class="btn" id="cikti-cancel">Kapat</button>` });
    document.getElementById('cikti-cancel').onclick = App.closeModal;
    document.getElementById('cikti-excel').onclick = () => downloadSiparisExcel(siparis);
    document.getElementById('cikti-pdf').onclick = () => downloadSiparisPdf(siparis);
  }

  function downloadSiparisExcel(siparis) {
    App.satinalmaCiktiExcel([siparis], siparis.tedarikciAdi);
  }

  function downloadSiparisPdf(siparis) {
    App.satinalmaCiktiPdf([siparis], siparis.tedarikciAdi);
  }

  function talepDurumPill(d) {
    const map = { beklemede: ['Beklemede', 'pill-amber'], islendi: ['İşlendi', 'pill-green'] };
    const [l, c] = map[d] || ['Beklemede', 'pill-amber'];
    return `<span class="pill ${c}">${l}</span>`;
  }
  function satinalmaSiparisDurumPill(d) {
    const map = {
      yonetim_onayi_bekliyor: ['Yönetim Onayında', 'pill-amber'],
      onaylandi: ['Onaylandı (Tedarikçiye Gönderilebilir)', 'pill-green'],
      gonderildi: ['Tedarikçiye Gönderildi', 'pill-blue'],
      tamamlandi: ['Tamamlandı', 'pill-green'],
      birime_dondu: ['⟲ Yönetimden Geri Döndü', 'pill-red'],
      reddedildi: ['Reddedildi', 'pill-red']
    };
    const [l, c] = map[d] || ['Beklemede', 'pill-gray'];
    return `<span class="pill ${c}">${l}</span>`;
  }

  function openSatinalmaForm(talep, hammaddeler, tedarikciler, onSaved) {
    const d = talep || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Kalem Adı</label>
        <input class="finput" id="f-kalemadi" value="${App.escapeHtml(d.kalemAdi || '')}" placeholder="örn. SUNTALAM CY 18MM BEYAZ"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">İlgili Hammadde (opsiyonel)</label>
          <select class="fselect" id="f-hammadde">
            <option value="">— Seçilmedi —</option>
            ${hammaddeler.map(h => `<option value="${h.id}" ${d.hammaddeId === h.id ? 'selected' : ''}>${App.escapeHtml(h.ad)}</option>`).join('')}
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Miktar</label><input class="finput" id="f-miktar" type="number" value="${d.miktar || ''}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Tercih Edilen Tedarikçi (opsiyonel)</label>
        <select class="fselect" id="f-tedarikci">
          <option value="">— Henüz seçilmedi —</option>
          ${tedarikciler.map(t => `<option value="${t.id}">${App.escapeHtml(t.unvan)}</option>`).join('')}
        </select>
      </div>
      <div class="fgroup"><label class="flbl">Not</label><textarea class="ftextarea" id="f-not"></textarea></div>
    `;
    const footer = `<button class="btn" id="f-cancel">Vazgeç</button><button class="btn btn-blue" id="f-save">Satınalma İhtiyacı Oluştur</button>`;
    App.openModal({ title: 'Satınalma İhtiyacı', sub: talep ? 'Üretim talebinden oluşturuluyor: ' + talep.kod : 'Manuel satınalma ihtiyacı', body, footer, wide: true });

    document.getElementById('f-cancel').onclick = App.closeModal;
    document.getElementById('f-save').onclick = async () => {
      const kalemAdi = document.getElementById('f-kalemadi').value.trim();
      const miktar = parseFloat(document.getElementById('f-miktar').value);
      if (!kalemAdi || !miktar) { App.toast('Kalem adı ve miktar zorunlu', 'err'); return; }
      const hmId = document.getElementById('f-hammadde').value || null;
      const hm = hammaddeler.find(h => h.id === hmId);
      const tedId = document.getElementById('f-tedarikci').value || null;
      const ted = tedarikciler.find(t => t.id === tedId);

      const satinalmaTalebi = {
        id: App.uid('SAT'),
        kod: 'SAT-' + Date.now().toString(36).toUpperCase(),
        kaynakTalepId: talep ? talep.id : null,
        kalemAdi, hammaddeId: hmId, miktar,
        birim: hm ? hm.birim : 'ADET',
        tedarikciId: tedId, tedarikciAdi: ted ? ted.unvan : null,
        not: document.getElementById('f-not').value.trim(),
        durum: 'teklif_bekleniyor',
        tarih: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.satinalmaTalepleri.upsert(satinalmaTalebi));

      if (talep) {
        talep.durum = 'islendi';
        await App.persist(() => Store.talepler.upsert(talep));
      }

      App.toast('Satınalma ihtiyacı oluşturuldu: ' + satinalmaTalebi.kod, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();
