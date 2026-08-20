// ════════════════════════════════════════════════════════════════════════════
// KESİM OPTİMİZASYONU (NESTING) — HAMMADDE BAZLI ÇOK SATIRLI YAPI
// Her satır ("kesim ihtiyacı") tek bir plaka hammaddesine aittir ve o
// hammaddeden kesilecek tüm parçaları toplar. Satırlar şu şekilde oluşur:
//   - Sipariş onaylandığında OTOMATİK (App.siparisOnaylaninceKesimIhtiyaciOlustur)
//   - Bu sayfadan "+ Manuel Kesim Satırı Aç" ile elle
// Her satırda: parça listesi (adetler manuel düzenlenebilir, hammadde
// değiştirilebilir), "Nesting Çalıştır" ile 2D bin-packing sonucu, DXF export.
//
// Algoritma: Skyline / Shelf tabanlı yerleştirme (büyükten küçüğe, alan azalan sırada)
//   - Grain (desen) yönü "var" olan parçalar döndürülemez (90° rotasyon kapalı)
//   - Testere kesim payı (kerf) ve plaka kenar boşluğu ayarlardan okunur
//   - Bir plaka dolunca yeni plaka açılır
// ════════════════════════════════════════════════════════════════════════════
PageModules.nesting = (() => {
  let kesimModlari = {}; // satırId -> 'cnc' | 'lineer' (satır bazlı seçim, varsayılan cnc)

  async function render(main) {
    const [hammaddeler, kesimIhtiyaclari, kesimPlanlari] = await Promise.all([
      Store.hammaddeler.all(), Store.kesimIhtiyaclari.all(), Store.kesimPlanlari.all()
    ]);
    const plakalar = hammaddeler.filter(h => h.tip === 'plaka');
    const acikSatirlar = kesimIhtiyaclari.filter(k => k.durum === 'acik');
    const kapaliSatirlar = kesimIhtiyaclari.filter(k => k.durum !== 'acik');

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Kesim Optimizasyonu</div>
          <div class="page-sub">Her satır bir hammaddeye aittir. Sipariş onaylandığında otomatik satır açılır; manuel de açabilir, adetleri ve hammaddeyi değiştirebilirsiniz.</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="ns-new-satir">+ Manuel Kesim Satırı Aç</button></div>
      </div>

      <div id="ns-satirlar"></div>

      <div class="card" id="ns-saved-wrap"></div>
    `;
    document.getElementById('ns-new-satir').onclick = () => openHammaddeSecici(plakalar, async (hammaddeId) => {
      const kesimIhtiyaclariGuncel = await Store.kesimIhtiyaclari.all();
      const yeniSatir = { id: App.uid('KSI'), hammaddeId, durum: 'acik', parcalar: [], kaynakSiparisler: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
      kesimIhtiyaclariGuncel.push(yeniSatir);
      await App.persist(() => Store.kesimIhtiyaclari.save(kesimIhtiyaclariGuncel));
      App.toast('Manuel kesim satırı açıldı', 'ok');
      render(main);
    }, null, () => render(main));

    renderSatirlar(acikSatirlar, kapaliSatirlar, plakalar);
    renderSavedPlans(kesimPlanlari);

    function renderSatirlar(acik, kapali, plakalar) {
      const wrap = document.getElementById('ns-satirlar');
      if (!acik.length) {
        wrap.innerHTML = `<div class="card"><div class="empty-state" style="padding:28px 10px"><div class="eicon">▦</div><div class="etitle">Açık kesim satırı yok</div><div class="edesc">Bir sipariş onaylandığında otomatik satır açılır, veya "+ Manuel Kesim Satırı Aç" ile başlayın.</div></div></div>`;
        return;
      }
      wrap.innerHTML = acik.map(satir => renderSatirCard(satir, plakalar)).join('');
      acik.forEach(satir => wireSatirCard(satir, plakalar));
    }

    function renderSavedPlans(kesimPlanlari) {
      const wrap = document.getElementById('ns-saved-wrap');
      wrap.innerHTML = `<div class="card-hdr"><div class="card-title">Kayıtlı Kesim Planları (Geçmiş)</div></div>`;
      if (!kesimPlanlari.length) {
        wrap.innerHTML += `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Henüz kaydedilmiş kesim planı yok.</div></div>`;
        return;
      }
      let html = `<table class="dtable"><tr><th>Plan Kodu</th><th>Plaka</th><th class="r">Plaka Sayısı</th><th class="r">Fire %</th><th>Tarih</th><th></th></tr>`;
      kesimPlanlari.forEach(pl => {
        html += `<tr>
          <td class="mono">${pl.kod}</td><td>${App.escapeHtml(pl.plakaAdi)}</td>
          <td class="r">${pl.plakaSayisi}</td><td class="r">${App.fmt(pl.fireYuzde, 1)}%</td>
          <td style="font-size:11px">${pl.tarih}</td>
          <td><button class="btn btn-sm btn-ghost ns-view-plan" data-id="${pl.id}">Görüntüle</button></td>
        </tr>`;
      });
      html += `</table>`;
      wrap.innerHTML += html;
      wrap.querySelectorAll('.ns-view-plan').forEach(b => b.onclick = () => {
        const pl = kesimPlanlari.find(x => x.id === b.dataset.id);
        showResultViewer(pl.sonuc, pl.plaka, true, null);
      });
    }

    function renderSatirCard(satir, plakalar) {
      const plaka = plakalar.find(p => p.id === satir.hammaddeId);
      const kesimModu = kesimModlari[satir.id] || satir.kesimModu || 'cnc';
      const toplamAdet = (satir.parcalar || []).reduce((a, p) => a + p.adet, 0);
      return `
      <div class="card" id="satir-${satir.id}" data-satir-id="${satir.id}">
        <div class="card-hdr">
          <div class="card-title">${plaka ? App.escapeHtml(plaka.ad) : '<span style="color:var(--red-text)">⚠ Hammadde bulunamadı</span>'}
            <span class="pill pill-blue" style="margin-left:8px">${toplamAdet} parça</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm ns-degistir-hammadde" data-id="${satir.id}">Hammadde Değiştir</button>
            <button class="btn btn-sm btn-ghost ns-kapat-satir" data-id="${satir.id}" style="color:var(--red-text)">Satırı Kapat</button>
          </div>
        </div>

        ${satir.kaynakSiparisler && satir.kaynakSiparisler.length ? `<div class="fhint" style="margin-bottom:10px">Kaynak siparişler: ${satir.kaynakSiparisler.join(', ')}</div>` : '<div class="fhint" style="margin-bottom:10px">Manuel açılmış satır.</div>'}

        ${plaka ? `<div style="font-size:11.5px;color:var(--text2);margin-bottom:10px">
          Ölçü: ${plaka.en} × ${plaka.boy} mm · Kalınlık: ${plaka.kalinlik || '—'} mm ·
          Grain: ${plaka.grainYonu === 'var' ? 'Yönlü (döndürülemez)' : 'Yönsüz'}
        </div>` : ''}

        <div class="flex-between" style="margin-bottom:8px">
          <div class="flbl" style="margin:0">Parça Listesi</div>
          <button class="btn btn-sm btn-blue ns-add-parca" data-id="${satir.id}">+ Parça Ekle</button>
        </div>
        <div id="parca-table-${satir.id}"></div>

        <div class="hr"></div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
          <label class="fcheck" style="padding:7px;background:${kesimModu === 'cnc' ? 'var(--blue-bg)' : 'var(--bg)'};border-radius:8px;cursor:pointer">
            <input type="radio" name="kesim-modu-${satir.id}" value="cnc" ${kesimModu === 'cnc' ? 'checked' : ''} class="ns-kesim-modu" data-id="${satir.id}">
            <div><b style="font-size:11.5px">Flat-Tabla Router / CNC (Freze)</b></div>
            <div class="muted" style="font-size:10px">Kesim payı: Freze payı (Ayarlar'dan)</div>
          </label>
          <label class="fcheck" style="padding:7px;background:${kesimModu === 'lineer' ? 'var(--blue-bg)' : 'var(--bg)'};border-radius:8px;cursor:pointer">
            <input type="radio" name="kesim-modu-${satir.id}" value="lineer" ${kesimModu === 'lineer' ? 'checked' : ''} class="ns-kesim-modu" data-id="${satir.id}">
            <div><b style="font-size:11.5px">Lineer Testere</b></div>
            <div class="muted" style="font-size:10px">Kesim payı: Testere payı (Ayarlar'dan)</div>
          </label>
        </div>

        <button class="btn btn-green ns-run" data-id="${satir.id}" ${!plaka || !(satir.parcalar || []).length ? 'disabled' : ''}>▦ Nesting Çalıştır</button>
        <div id="result-${satir.id}" style="margin-top:14px"></div>
      </div>`;
    }

    function wireSatirCard(satir, plakalar) {
      const cardEl = document.getElementById('satir-' + satir.id);
      if (!cardEl) return;
      renderParcaTable(satir);

      cardEl.querySelector('.ns-add-parca').addEventListener('click', () => openParcaForm(satir, () => { renderParcaTable(satir); refreshRunButton(satir); }));
      cardEl.querySelector('.ns-degistir-hammadde').onclick = () => openHammaddeSecici(plakalar, async (yeniHammaddeId) => {
        satir.hammaddeId = yeniHammaddeId;
        await persistSatir(satir);
        App.toast('Hammadde değiştirildi', 'ok');
        render(main);
      }, satir.hammaddeId, () => render(main));
      cardEl.querySelector('.ns-kapat-satir').onclick = () => {
        App.confirmDialog('Bu kesim satırını kapatmak istediğinize emin misiniz? (Geçmişe taşınır, listeden kalkar)', async () => {
          satir.durum = 'kapatildi';
          await persistSatir(satir);
          App.toast('Satır kapatıldı', 'ok');
          render(main);
        });
      };
      cardEl.querySelectorAll('.ns-kesim-modu').forEach(r => r.onchange = (e) => { kesimModlari[satir.id] = e.target.value; });
      cardEl.querySelector('.ns-run').onclick = () => runNesting(satir, plakalar);

      function renderParcaTable(satir) {
        const wrap = document.getElementById('parca-table-' + satir.id);
        const parcalar = satir.parcalar || [];
        if (!parcalar.length) {
          wrap.innerHTML = `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Parça listesi boş.</div></div>`;
          return;
        }
        let html = `<table class="dtable" style="font-size:11.5px"><tr><th>Parça</th><th>Yarı Mamül</th><th>Sipariş</th><th>Müşteri</th><th class="r">Boy(mm)</th><th class="r">En(mm)</th><th class="r">Adet</th><th>Kaynak</th><th></th></tr>`;
        parcalar.forEach((p, i) => {
          html += `<tr>
            <td>${App.escapeHtml(p.ad)}${p.renk ? `<br><span class="muted" style="font-size:10px">${App.escapeHtml(p.renk)}</span>` : ''}</td>
            <td>${p.ymKod || p.ymAd
              ? `<b style="font-size:11px">${App.escapeHtml(p.ymKod || '')}</b>${p.ymAd ? `<br><span class="muted" style="font-size:10px">${App.escapeHtml(p.ymAd)}</span>` : ''}`
              : '<span class="muted">—</span>'}</td>
            <td style="font-size:10.5px">${(p.siparisKodlari && p.siparisKodlari.length)
              ? p.siparisKodlari.map(k => `<div class="mono">${App.escapeHtml(k)}</div>`).join('')
              : '<span class="muted">—</span>'}</td>
            <td style="font-size:10.5px">${(p.musteriler && p.musteriler.length)
              ? p.musteriler.map(m => `<div>${App.escapeHtml(m)}</div>`).join('')
              : '<span class="muted">—</span>'}</td>
            <td class="r mono">${p.boy}</td>
            <td class="r mono">${p.en}</td>
            <td class="r"><input class="finput ns-adet-input" data-i="${i}" type="number" min="1" value="${p.adet}" style="width:60px;text-align:right;padding:3px 6px;font-size:11px"></td>
            <td>${p.manuel ? '<span class="pill pill-gray">Manuel</span>' : '<span class="pill pill-blue">Sipariş</span>'}</td>
            <td><button class="btn btn-icon btn-ghost ns-del-parca" data-i="${i}" style="color:var(--red-text)">&times;</button></td>
          </tr>`;
        });
        html += `</table>`;
        wrap.innerHTML = html;

        wrap.querySelectorAll('.ns-adet-input').forEach(inp => inp.onchange = async () => {
          const i = parseInt(inp.dataset.i);
          const yeni = parseInt(inp.value) || 1;
          satir.parcalar[i].adet = yeni;
          await persistSatir(satir);
          App.toast('Adet güncellendi', 'ok');
        });
        wrap.querySelectorAll('.ns-del-parca').forEach(b => b.onclick = async () => {
          const i = parseInt(b.dataset.i);
          satir.parcalar.splice(i, 1);
          await persistSatir(satir);
          renderParcaTable(satir);
          refreshRunButton(satir);
        });
      }

      function refreshRunButton(satir) {
        const btn = cardEl.querySelector('.ns-run');
        if (btn) btn.disabled = !satir.hammaddeId || !(satir.parcalar || []).length;
        const badge = cardEl.querySelector('.card-title .pill');
        if (badge) badge.textContent = (satir.parcalar || []).reduce((a, p) => a + p.adet, 0) + ' parça';
      }
    }

    async function persistSatir(satir) {
      await App.persist(() => Store.kesimIhtiyaclari.upsert(satir));
    }

    async function runNesting(satir, plakalar) {
      const plaka = plakalar.find(p => p.id === satir.hammaddeId);
      if (!plaka) { App.toast('Bu satır için geçerli bir hammadde seçilmedi', 'err'); return; }
      const ayarlar = App.state.ayarlar;
      const kesimModu = kesimModlari[satir.id] || satir.kesimModu || 'cnc';
      // CNC/Flat-Tabla (freze) ve Lineer Testere FARKLI kesim payı kullanır —
      // freze ucu kalınlığı testere bıçağından farklı olduğu için ayrı parametre.
      const kesimPayi = kesimModu === 'lineer' ? ayarlar.testereKayipPayiMM : ayarlar.frezeKayipPayiMM;
      const sonucNesting = kesimModu === 'lineer'
        ? nestLineerTestere(plaka.en, plaka.boy, ayarlar.plakaKenarBosluguMM, kesimPayi, satir.parcalar)
        : nestParcalar(plaka.en, plaka.boy, ayarlar.plakaKenarBosluguMM, kesimPayi, satir.parcalar);
      satir.kesimModu = kesimModu;
      satir.sonucCache = sonucNesting;
      await persistSatir(satir);
      showResultViewer(sonucNesting, plaka, false, satir);
    }

    function showResultViewer(sonucNesting, plaka, readonly, satir) {
      const targetId = satir ? 'result-' + satir.id : null;
      const wrap = targetId ? document.getElementById(targetId) : null;
      const plakaSayisi = sonucNesting.plakalarOut.length;
      const totalUsed = sonucNesting.plakalarOut.reduce((a, p) => a + p.usedArea, 0);
      const totalAvail = plakaSayisi * sonucNesting.usableW * sonucNesting.usableH;
      const fireYuzde = totalAvail > 0 ? (1 - totalUsed / totalAvail) * 100 : 0;
      const fullPlakaArea = plaka.en * plaka.boy;
      const m2PerPlaka = fullPlakaArea / 1e6;
      const toplamM2 = plakaSayisi * m2PerPlaka;
      const dvzSym = plaka.dvz === 'USD' ? '$' : plaka.dvz === 'EUR' ? '€' : '₺';
      const birimFiyatTRY = App.toTRY(plaka.birimFiyat, plaka.dvz, App.state.ayarlar);
      const toplamMaliyet = plaka.birim === 'M2' ? toplamM2 * birimFiyatTRY : plakaSayisi * birimFiyatTRY;
      const uniqueSuffix = satir ? satir.id : 'modal';

      let html = `
        <div class="grid grid-4" style="margin-bottom:14px">
          <div class="kpi"><div class="kpi-lbl">Gereken Plaka</div><div class="kpi-val blue">${plakaSayisi}</div><div class="kpi-sub">adet plaka</div></div>
          <div class="kpi"><div class="kpi-lbl">Fire Oranı</div><div class="kpi-val ${fireYuzde > 20 ? 'red' : fireYuzde > 12 ? 'amber' : 'green'}">${App.fmt(fireYuzde, 1)}%</div><div class="kpi-sub">kullanılmayan alan</div></div>
          <div class="kpi"><div class="kpi-lbl">Toplam Alan</div><div class="kpi-val purple">${App.fmt(toplamM2, 2)} m²</div><div class="kpi-sub">${plakaSayisi} plaka</div></div>
          <div class="kpi"><div class="kpi-lbl">Tahmini Maliyet</div><div class="kpi-val amber">₺${App.fmt(toplamMaliyet, 2)}</div><div class="kpi-sub">${dvzSym}${App.fmt(plaka.birimFiyat, 2)}/${plaka.birim}</div></div>
        </div>
        <div id="svg-pages-${uniqueSuffix}" style="display:flex;flex-direction:column;gap:18px"></div>
        <div style="margin-top:14px;display:flex;gap:8px">
          ${(!readonly && satir) ? `<button class="btn btn-green" id="save-plan-${uniqueSuffix}">Kesim Planını Kaydet</button>` : ''}
          <button class="btn" id="download-dxf-${uniqueSuffix}">⬇ DXF İndir (Tüm Plakalar)</button>
        </div>
      `;

      if (!wrap) {
        App.openModal({ title: 'Kesim Planı', sub: plaka.ad, body: (() => { const d = document.createElement('div'); d.innerHTML = html; return d; })(), xwide: true });
        renderSvgPages(sonucNesting, plaka, uniqueSuffix);
        const dxfBtnModal = document.getElementById('download-dxf-' + uniqueSuffix);
        if (dxfBtnModal) dxfBtnModal.onclick = () => downloadDxf(sonucNesting, plaka);
        return;
      }
      wrap.innerHTML = html;
      renderSvgPages(sonucNesting, plaka, uniqueSuffix);
      const saveBtn = document.getElementById('save-plan-' + uniqueSuffix);
      if (saveBtn) saveBtn.onclick = () => savePlan(sonucNesting, plaka, plakaSayisi, fireYuzde, satir);
      document.getElementById('download-dxf-' + uniqueSuffix).onclick = () => downloadDxf(sonucNesting, plaka);
    }

    async function savePlan(sonucNesting, plaka, plakaSayisi, fireYuzde, satir) {
      const plan = {
        id: App.uid('NST'),
        kod: 'KSM-' + Date.now().toString(36).toUpperCase(),
        hammaddeId: plaka.id,
        plakaAdi: plaka.ad,
        plaka: plaka,
        parcaListesi: satir ? satir.parcalar : [],
        sonuc: sonucNesting,
        plakaSayisi,
        fireYuzde,
        kesimModu: satir ? (kesimModlari[satir.id] || satir.kesimModu) : 'cnc',
        kesimIhtiyaciId: satir ? satir.id : null,
        tarih: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.kesimPlanlari.upsert(plan));

      // Kesim planı kaydedilince kullanılan plaka adedi Hammadde Deposu'ndan
      // otomatik düşer; stok yetersizse eksik miktar için otomatik satınalma açılır.
      const dusumSonuc = await App.persist(() => App.kesimPlaniKaydedildiginceStokDus(plaka, plakaSayisi));

      let mesaj = 'Kesim planı kaydedildi: ' + plan.kod + ` — Hammadde Deposu'ndan ${plakaSayisi} plaka düşüldü.`;
      if (dusumSonuc.otomatikSatinalmaAcildi) {
        mesaj += ` ⚠ Stok yetersizdi (mevcut: ${App.fmt(dusumSonuc.mevcutStok, 0)}), ${App.fmt(dusumSonuc.eksikMiktar, 0)} adet için otomatik satınalma ihtiyacı açıldı.`;
      }
      App.toast(mesaj, dusumSonuc.otomatikSatinalmaAcildi ? 'err' : 'ok');
      render(main);
    }

    // ── PERFORMANS: AYNI ÖLÇÜ TEKRARLARINI ÇAKIŞTIRARAK ÇİZME ──────────────
    // 100'lerce parça olan kesim planlarında, her parçayı ayrı <rect>+<text>
    // olarak çizmek (binlerce SVG elementi) tarayıcıyı çökertiyordu. Çözüm:
    // bir plaka içinde AYNI ÖLÇÜDEKİ (w×h, rotasyon dahil) tüm parçalar TEK
    // bir temsilci kutuya indirilir — kutu, bu ölçüdeki parçalardan birinin
    // GERÇEK konumuna çizilir (konum bilgisi kaybolmaz, sadece TEKRARLAR
    // çakıştırılır), yanına "×N" etiketiyle kaç adet olduğu yazılır. Gerçek
    // kesim planı verisi (sonucNesting.plakalarOut) DEĞİŞMEZ — sadece görsel
    // temsil basitleştirilir, programın çökmesi önlenir.
    function renderSvgPages(sonucNesting, plaka, suffix) {
      const target = document.getElementById('svg-pages-' + suffix);
      if (!target) return;
      const scale = Math.min(560 / plaka.en, 380 / plaka.boy);
      const colors = ['#1457a0', '#236b32', '#a85e0a', '#5c38a0', '#0d6450', '#b03025', '#7a5230', '#3d6b8f'];

      // ── AYNI YERLEŞİMLİ PLAKALARI ORTAKLA ────────────────────────────────
      // Seri üretimde plakaların çoğu birebir aynı desende kesilir. 12 plakayı
      // 12 kez çizmek hem ekranı şişirir hem operatörü yorar. Aynı yerleşime
      // sahip plakalar TEK çizimde toplanır, kaç kez tekrarlanacağı yazılır.
      // İmza: her parçanın konum + ölçü + dönüş bilgisi (sıradan bağımsız).
      // İmzaya SİPARİŞ ve YARI MAMÜL de dahildir: iki plaka aynı desende olsa
      // bile farklı siparişin parçalarını taşıyorsa AYRI gösterilmelidir —
      // yoksa operatör hangi plakanın hangi işe ait olduğunu göremez.
      const imzaCikar = (pl) => pl.placed
        .map(p => `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.w)},${Math.round(p.h)},${p.rotated ? 1 : 0}` +
          `,${p.ymKod || ''},${(p.siparisKodlari || []).join('|')}`)
        .sort().join(';');

      const gruplar = [];
      sonucNesting.plakalarOut.forEach((pl, i) => {
        const imza = imzaCikar(pl);
        const mevcut = gruplar.find(g => g.imza === imza);
        if (mevcut) { mevcut.adet++; mevcut.noLar.push(i + 1); }
        else gruplar.push({ imza, plaka: pl, adet: 1, noLar: [i + 1] });
      });

      const noAraligi = (noLar) => {
        if (noLar.length === 1) return 'Plaka ' + noLar[0];
        // Ardışıksa aralık olarak yaz (Plaka 1–11), değilse ilk birkaçını listele
        const ardisik = noLar.every((n, k) => k === 0 || n === noLar[k - 1] + 1);
        if (ardisik) return `Plaka ${noLar[0]}–${noLar[noLar.length - 1]}`;
        return 'Plaka ' + noLar.slice(0, 6).join(', ') + (noLar.length > 6 ? '…' : '');
      };

      target.innerHTML = gruplar.map(grup => {
        const pl = grup.plaka;
        const W = sonucNesting.usableW, H = sonucNesting.usableH;
        const ofs = sonucNesting.kenarBosluk;
        const svgW = plaka.en * scale, svgH = plaka.boy * scale;
        let rects = `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#fdfcf9" stroke="#c9c5bc" stroke-width="1.5"/>`;
        rects += `<rect x="${ofs * scale}" y="${ofs * scale}" width="${W * scale}" height="${H * scale}" fill="none" stroke="#e2dfd8" stroke-dasharray="4,3"/>`;

        // Renk ataması ölçüye göre: aynı ölçüdeki parçalar aynı renkte görünür.
        const olcuRenk = new Map();
        const renkAl = (p) => {
          const k = Math.round(p.w) + 'x' + Math.round(p.h);
          if (!olcuRenk.has(k)) olcuRenk.set(k, colors[olcuRenk.size % colors.length]);
          return olcuRenk.get(k);
        };

        // TÜM parçalar çizilir — operatör gerçek kesim desenini görmeli.
        pl.placed.forEach(p => {
          const x = (ofs + p.x) * scale, y = (ofs + p.y) * scale, w = p.w * scale, h = p.h * scale;
          const col = renkAl(p);
          rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}22" stroke="${col}" stroke-width="1.1"/>`;
          if (w > 26 && h > 13) {
            // Yarı mamül kodu varsa parça adı yerine ONU göster — operatör için
            // asıl anlamlı bilgi budur (parça adı zaten plaka adıyla aynı).
            const ustSatir = p.ymKod || (p.ad || '').slice(0, 12);
            rects += `<text x="${x + w / 2}" y="${y + h / 2 - 5}" font-size="8" text-anchor="middle" fill="${col}" font-weight="700">${App.escapeHtml(ustSatir)}${p.rotated ? ' ↻' : ''}</text>`;
            rects += `<text x="${x + w / 2}" y="${y + h / 2 + 4}" font-size="7.5" text-anchor="middle" fill="${col}99">${Math.round(p.w)}×${Math.round(p.h)}</text>`;
            if (h > 34 && p.siparisKodlari && p.siparisKodlari.length) {
              rects += `<text x="${x + w / 2}" y="${y + h / 2 + 13}" font-size="6.5" text-anchor="middle" fill="${col}88">${App.escapeHtml(p.siparisKodlari[0])}${p.siparisKodlari.length > 1 ? '+' : ''}</text>`;
            }
            if (h > 46 && p.musteriler && p.musteriler.length) {
              rects += `<text x="${x + w / 2}" y="${y + h / 2 + 22}" font-size="6.5" text-anchor="middle" fill="${col}77">${App.escapeHtml(p.musteriler[0].slice(0, 18))}${p.musteriler.length > 1 ? '+' : ''}</text>`;
            }
          }
        });

        const pctUsed = (pl.usedArea / (W * H) * 100).toFixed(1);
        const cevrilen = pl.placed.filter(p => p.rotated).length;
        return `<div style="margin-bottom:14px">
          <div class="flex-between" style="margin-bottom:6px;flex-wrap:wrap;gap:6px">
            <b style="font-size:12px">${noAraligi(grup.noLar)}${grup.adet > 1 ? ` <span class="pill" style="background:#e8f0fe;color:#1457a0">aynı yerleşim ×${grup.adet}</span>` : ''}</b>
            <span class="pill pill-blue">${pl.placed.length} parça · %${pctUsed} kullanım${cevrilen ? ' · ' + cevrilen + ' çevrik ↻' : ''}</span>
          </div>
          <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="border-radius:8px;background:#fff">${rects}</svg>
        </div>`;
      }).join('') +
        (gruplar.length < sonucNesting.plakalarOut.length
          ? `<div class="fhint">${sonucNesting.plakalarOut.length} plakanın ${gruplar.length} farklı yerleşim deseni var — aynı desenler tek çizimde toplandı.</div>`
          : '');
    }
  }

  function openParcaForm(satir, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Parça Adı</label><input class="finput" id="pf-ad" placeholder="örn. ÜST TABLA"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Boy (mm)</label><input class="finput" id="pf-boy" type="number"></div>
        <div class="fgroup"><label class="flbl">En (mm)</label><input class="finput" id="pf-en" type="number"></div>
        <div class="fgroup"><label class="flbl">Adet</label><input class="finput" id="pf-adet" type="number" value="1"></div>
      </div>
      <div class="fcheck"><input type="checkbox" id="pf-grain"><label for="pf-grain">Bu parça döndürülemez (desen/grain yönü sabit)</label></div>
    `;
    const footer = `<button class="btn" id="pf-cancel">Vazgeç</button><button class="btn btn-blue" id="pf-add">Ekle</button>`;
    App.openModal({ title: 'Parça Ekle', body, footer });
    document.getElementById('pf-cancel').onclick = App.closeModal;
    document.getElementById('pf-add').onclick = async () => {
      const ad = document.getElementById('pf-ad').value.trim();
      const boy = parseFloat(document.getElementById('pf-boy').value);
      const en = parseFloat(document.getElementById('pf-en').value);
      const adet = parseInt(document.getElementById('pf-adet').value) || 1;
      if (!ad || !boy || !en) { App.toast('Ad, boy ve en zorunlu', 'err'); return; }
      if (!satir.parcalar) satir.parcalar = [];
      satir.parcalar.push({ ad, boy, en, adet, grainKilitli: document.getElementById('pf-grain').checked, manuel: true });
      await App.persist(() => Store.kesimIhtiyaclari.upsert(satir));
      App.toast('Parça eklendi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function openHammaddeSecici(plakalar, onSecildi, mevcutSecim, geriDonRender) {
    if (!plakalar.length) {
      const body = document.createElement('div');
      body.innerHTML = `<div class="empty-state"><div class="edesc">Tanımlı plaka hammaddesi yok. Önce Hammaddeler sayfasından bir plaka tanımlayın.</div></div>`;
      App.openModal({ title: 'Plaka Hammadde Seç', body, footer: `<button class="btn" id="hs-cancel">Kapat</button>` });
      document.getElementById('hs-cancel').onclick = App.closeModal;
      return;
    }
    const secenekler = plakalar.map(p => ({
      grup: 'plaka', kod: p.stokKodu || p.id, ad: p.ad, birim: `${p.en}×${p.boy}mm`, netFiyat: App.toTRY(p.birimFiyat, p.dvz, App.state.ayarlar), maliyetYok: !p.birimFiyat, _id: p.id
    }));
    App.goTo('kalem_secici', {
      baslik: 'Plaka Hammadde Seç',
      secenekler,
      gruplar: { plaka: 'Plaka Hammaddeler' },
      geriDon: geriDonRender || (() => App.goTo('nesting')),
      onSecildi: (secim) => {
        const plaka = plakalar.find(p => p.id === secim._id || (p.stokKodu || p.id) === secim.kod);
        onSecildi(plaka ? plaka.id : secim._id);
      }
    });
  }

  // ── NESTING ALGORİTMASI (CNC / Flat-Tabla) ──────────────────────────────
  function nestParcalar(plakaEn, plakaBoy, kenarBosluk, kesimPayi, parcalar) {
    let items = [];
    parcalar.forEach((p, pi) => {
      for (let k = 0; k < p.adet; k++) {
        items.push({
          id: pi + '_' + k, ad: p.ad, w: p.en, h: p.boy,
          grainKilitli: p.grainKilitli, renk: p.renk,
          // İzlenebilirlik: parça hangi yarı mamüle / siparişe ait (DXF'e de yazılır)
          ymKod: p.ymKod || '', ymAd: p.ymAd || '',
          siparisKodlari: p.siparisKodlari || [],
          musteriler: p.musteriler || []
        });
      }
    });
    items.sort((a, b) => (b.w * b.h) - (a.w * a.h));

    const usableW = plakaEn - 2 * kenarBosluk;
    const usableH = plakaBoy - 2 * kenarBosluk;

    const plakalarOut = [];
    let kalanItems = [...items];

    while (kalanItems.length > 0) {
      const plan = packOnePlaka(usableW, usableH, kalanItems, kesimPayi);
      if (plan.placed.length === 0) {
        plan.placed = [];
        plan.skipped = kalanItems;
        plakalarOut.push(plan);
        break;
      }
      plakalarOut.push(plan);
      kalanItems = plan.remaining;
    }

    return { plakalarOut, kenarBosluk, kesimPayi, usableW, usableH, plakaEn, plakaBoy };
  }

  function packOnePlaka(W, H, items, kerf) {
    // ── SKYLINE (bottom-left) BIN PACKING ────────────────────────────────────
    // Skyline = plakanın üst profilini temsil eden, x'e göre sıralı, bitişik
    // segmentler dizisi. Her segment {x0, x1, y}: [x0,x1] aralığında dolu
    // yükseklik y. Bir parça yerleştirilirken:
    //   1) Skyline üzerinde parçanın (w+kerf) genişliğinde sığabileceği en
    //      düşük y'li konumu ararız (bottom-left mantığı).
    //   2) O konuma yerleştirip skyline'ı güncelleriz (o aralığın y'si
    //      parça yüksekliği + kerf kadar yükselir).
    // Kerf yalnızca skyline yükseltmesinde ve genişlik rezervasyonunda
    // uygulanır; parçanın GERÇEK ölçüsü (w,h) placed'e yazılır.
    let skyline = [{ x0: 0, x1: W, y: 0 }];
    const placed = [];
    const remaining = [];

    // Verilen genişlik için, x konumundan başlayarak skyline'daki en yüksek
    // y'yi bulur (parça o genişlik boyunca bu y'nin üstüne oturmalı).
    function seviyeBul(baslaIdx, genislik) {
      const x0 = skyline[baslaIdx].x0;
      const xBitis = x0 + genislik;
      if (xBitis > W + 0.001) return null;
      let y = 0;
      for (let j = baslaIdx; j < skyline.length; j++) {
        if (skyline[j].x0 >= xBitis - 0.001) break;
        if (skyline[j].x1 <= x0 + 0.001) continue;
        if (skyline[j].y > y) y = skyline[j].y;
      }
      return { x: x0, y };
    }

    function findBestPosition(w, h) {
      const wk = w + kerf;
      let best = null;
      for (let i = 0; i < skyline.length; i++) {
        const seviye = seviyeBul(i, wk);
        if (!seviye) continue;
        if (seviye.y + h > H + 0.001) continue; // yükseklik aşımı
        // bottom-left: en düşük y, eşitse en soldaki x
        if (!best || seviye.y < best.y - 0.001 || (Math.abs(seviye.y - best.y) < 0.001 && seviye.x < best.x)) {
          best = { x: seviye.x, y: seviye.y };
        }
      }
      return best;
    }

    // [x, x+wk] aralığını y+h+kerf yüksekliğine çıkarır, skyline'ı yeniden kurar
    function placeAt(x, y, w, h) {
      const wk = w + kerf;
      const yeniY = y + h + kerf;
      const xBitis = x + wk;
      const yeni = [];
      skyline.forEach(seg => {
        // Kaplama aralığının tamamen dışındaki segmentler aynen kalır
        if (seg.x1 <= x + 0.001 || seg.x0 >= xBitis - 0.001) { yeni.push(seg); return; }
        // Soldan taşan kısım korunur
        if (seg.x0 < x - 0.001) yeni.push({ x0: seg.x0, x1: x, y: seg.y });
        // Sağdan taşan kısım korunur
        if (seg.x1 > xBitis + 0.001) yeni.push({ x0: xBitis, x1: seg.x1, y: seg.y });
      });
      // Kaplanan aralığı tek segment olarak ekle
      yeni.push({ x0: x, x1: xBitis, y: yeniY });
      yeni.sort((a, b) => a.x0 - b.x0);
      // Aynı y'ye sahip bitişik segmentleri birleştir (skyline'ı sadeleştir)
      const merged = [];
      yeni.forEach(s => {
        const son = merged[merged.length - 1];
        if (son && Math.abs(son.y - s.y) < 0.001 && Math.abs(son.x1 - s.x0) < 0.001) {
          son.x1 = s.x1;
        } else {
          merged.push({ x0: s.x0, x1: s.x1, y: s.y });
        }
      });
      skyline = merged;
    }

    // Parçaları sırayla yerleştir (items zaten alan azalan sıralı gelir)
    items.forEach(item => {
      let pos = findBestPosition(item.w, item.h);
      let rotated = false;
      if (!item.grainKilitli) {
        const posRot = findBestPosition(item.h, item.w);
        // Döndürülmüş konum daha düşükse (veya düz sığmıyorsa) onu kullan
        if (posRot && (!pos || posRot.y < pos.y - 0.001 || (Math.abs(posRot.y - pos.y) < 0.001 && posRot.x < pos.x))) {
          pos = posRot; rotated = true;
        }
      }
      if (pos) {
        const w = rotated ? item.h : item.w;
        const h = rotated ? item.w : item.h;
        placeAt(pos.x, pos.y, w, h);
        placed.push({ ...item, x: pos.x, y: pos.y, w, h, rotated });
      } else {
        remaining.push(item);
      }
    });

    const usedArea = placed.reduce((a, p) => a + p.w * p.h, 0);
    return { placed, remaining, skyline, totalArea: W * H, usedArea };
  }

  // ── LİNEER TESTERE ALGORİTMASI ───────────────────────────────────────────
  function nestLineerTestere(plakaEn, plakaBoy, kenarBosluk, kesimPayi, parcalar) {
    let items = [];
    parcalar.forEach((p, pi) => {
      for (let k = 0; k < p.adet; k++) {
        items.push({
          id: pi + '_' + k, ad: p.ad, w: p.en, h: p.boy,
          grainKilitli: p.grainKilitli, renk: p.renk,
          // İzlenebilirlik: parça hangi yarı mamüle / siparişe ait (DXF'e de yazılır)
          ymKod: p.ymKod || '', ymAd: p.ymAd || '',
          siparisKodlari: p.siparisKodlari || [],
          musteriler: p.musteriler || []
        });
      }
    });
    items.sort((a, b) => b.h - a.h);

    const usableW = plakaEn - 2 * kenarBosluk;
    const usableH = plakaBoy - 2 * kenarBosluk;

    const plakalarOut = [];
    let kalan = [...items];

    while (kalan.length > 0) {
      // ── YÖN DENEMESİ (lineer testere) ──────────────────────────────────
      // Testere plakayı boydan boya keser; şeritler tek yönde ilerler. Bu
      // yüzden bir plakada parçaların TOPLU yönü belirleyicidir. Örnek:
      // 398×760 parça, 1830×3660 plaka →
      //   düz  : 1830/398=4 sütun × 3660/760=4 sıra = 16 adet
      //   çevir: 1830/760=2 sütun × 3660/398=9 sıra = 18 adet  ← %12 daha iyi
      // Her plaka için iki yönü de deneyip DAHA ÇOK parça yerleşeni seçiyoruz.
      // (Grain'i kilitli parçalar çevrilmez — desen yönü bozulmasın.)
      const planDuz = packOnePlakaSerit(usableW, usableH, kalan, kesimPayi, false);
      const planCevrik = packOnePlakaSerit(usableW, usableH, kalan, kesimPayi, true);
      const plan = (planCevrik.placed.length > planDuz.placed.length ||
        (planCevrik.placed.length === planDuz.placed.length && planCevrik.usedArea > planDuz.usedArea))
        ? planCevrik : planDuz;
      if (plan.placed.length === 0) {
        plan.skipped = kalan;
        plakalarOut.push(plan);
        break;
      }
      plakalarOut.push(plan);
      kalan = plan.remaining;
    }
    return { plakalarOut, kenarBosluk, kesimPayi, usableW, usableH, plakaEn, plakaBoy, mod: 'lineer' };
  }

  function packOnePlakaSerit(W, H, items, kerf, cevir) {
    const placed = [];
    const remaining = [];
    let curY = 0;
    // Çevrilmiş deneme: grain kilitli OLMAYAN parçaların en/boyu takas edilir.
    // Orijinal ölçüler 'oW/oH' olarak saklanır; sonuçta rotated bayrağı yazılır.
    let kalanItems = items.map(it => (cevir && !it.grainKilitli)
      ? { ...it, w: it.h, h: it.w, _cevrildi: true }
      : { ...it, _cevrildi: false });
    // Şerit mantığı en yüksek parçadan başlar; çevirdiysek yeniden sırala
    if (cevir) kalanItems.sort((a, b) => b.h - a.h);

    while (kalanItems.length > 0 && curY < H) {
      // Şeridin yüksekliği: bu turdaki en büyük parçanın yüksekliği
      // (items en yüksekten sıralı geldiği için kalanItems[0].h şerit yüksekliği)
      const seritYukseklik = kalanItems[0].h;
      if (curY + seritYukseklik > H + 0.001) break;

      let curX = 0;
      const seritKalanlar = [];
      kalanItems.forEach(item => {
        // Bu şeride sığabilmek için: yüksekliği <= şerit yüksekliği VE x'te yer var
        if (item.h <= seritYukseklik + 0.001 && curX + item.w <= W + 0.001) {
          placed.push({ ...item, x: curX, y: curY, w: item.w, h: item.h, rotated: !!item._cevrildi });
          curX += item.w + kerf;
        } else {
          seritKalanlar.push(item);
        }
      });
      curY += seritYukseklik + kerf;
      kalanItems = seritKalanlar;
      // Sonsuz döngü koruması: bu turda hiç yerleşim olmadıysa çık
      if (kalanItems.length === items.length) break;
    }
    // Yerleşmeyenler bir sonraki plakada yeniden değerlendirilir; ölçüleri
    // ORİJİNAL haline döndürülür ki o plakada da iki yön denenebilsin.
    remaining.push(...kalanItems.map(it => it._cevrildi
      ? { ...it, w: it.h, h: it.w, _cevrildi: false }
      : it));
    const usedArea = placed.reduce((a, p) => a + p.w * p.h, 0);
    return { placed, remaining, usedArea };
  }

  // ── DXF EXPORT ───────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  // DXF DIŞA AKTARIM — CNC/CAM'e gönderilebilir kesim planı
  // ────────────────────────────────────────────────────────────────────────────
  // BİÇİM KARARI: Dolap tasarım modülünün DXF'i sahada sorunsuz açılıyor; o
  // dosya ÇOK SADE — yalnızca SECTION/ENTITIES + LWPOLYLINE. Nesting DXF'i ise
  // handle ('5') ve alt sınıf işaretçisi ('100' AcDbEntity/AcDbPolyline)
  // içeriyordu; sürüm başlığı olmayan bir dosyada bu kodlar ayrıştırıcıyı
  // bozup TÜM geometrinin düşmesine yol açıyordu (yalnızca yazılar kalıyordu).
  // Bu yüzden burada da AYNI kanıtlanmış sade biçim kullanılır.
  //
  // KATMANLAR (CAM'de seçim için):
  //   KESIM  → kesilecek parça konturları (işlenecek katman)
  //   PLAKA  → ham plaka sınırı (referans, kesilmez)
  //   ETIKET → yazılar (kesim öncesi kapatılır)
  //
  // KERF (testere/freze payı): Parçalar zaten yerleşim aşamasında kesim payı
  // kadar ARALIKLI konumlandırılır; DXF bu konumları birebir yazar. Yani
  // kutular arasındaki boşluk = makine payı.
  // ══════════════════════════════════════════════════════════════════════════
  function buildDxf(sonucNesting, plaka) {
    const s = [];
    const c = (code, val) => { s.push(String(code)); s.push(String(val)); };
    const n = (v) => (Math.round(v * 100) / 100).toString();

    // Kapalı dikdörtgen — çalışan dolap ihracatıyla birebir aynı desen
    const dortgen = (x, y, w, h, katman) => {
      c(0, 'LWPOLYLINE'); c(8, katman); c(90, 4); c(70, 1);
      [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
        .forEach(([px, py]) => { c(10, n(px)); c(20, n(py)); });
    };
    const yazi = (x, y, yuk, metin, katman) => {
      // Türkçe karakterler CAM okuyucularında bozulduğu için ASCII'ye çevrilir.
      // BÜYÜK harf BÜYÜK karşılığına gider (Ç→C), aksi halde "ÇANAKCILAR"
      // "cANAKCILAR" olur ve müşteri adı okunaksız görünür.
      const TR_ASCII = {
        'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S',
        'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
      };
      const temiz = String(metin)
        .replace(/[ğĞüÜşŞıİöÖçÇ]/g, (ch) => TR_ASCII[ch] || ch)
        .replace(/[^\x20-\x7E]/g, '');
      c(0, 'TEXT'); c(8, katman); c(10, n(x)); c(20, n(y)); c(30, 0);
      c(40, n(yuk)); c(1, temiz);
    };

    c(0, 'SECTION'); c(2, 'ENTITIES');

    const ofs = sonucNesting.kenarBosluk || 0;
    const ARA = 300;                       // plakalar arası mesafe (mm)
    const toplam = sonucNesting.plakalarOut.length;
    let xOffset = 0;

    sonucNesting.plakalarOut.forEach((pl, pIdx) => {
      // Ham plaka sınırı (stok çizgisi)
      dortgen(xOffset, 0, plaka.en, plaka.boy, 'PLAKA');

      // Plaka başlığı — kesim alanının DIŞINDA
      const alan = (plaka.en - 2 * ofs) * (plaka.boy - 2 * ofs);
      const kullanim = alan > 0 ? (pl.usedArea / alan * 100).toFixed(1) : '0';
      yazi(xOffset, plaka.boy + 40, 40,
        `PLAKA ${pIdx + 1}/${toplam} - ${plaka.en}x${plaka.boy} - ${pl.placed.length} parca - %${kullanim}`,
        'ETIKET');

      // Kesilecek parçalar — aralarındaki boşluk makine kesim payıdır
      pl.placed.forEach((p, i) => {
        const px = xOffset + ofs + p.x;
        const py = ofs + p.y;
        dortgen(px, py, p.w, p.h, 'KESIM');
        // ETİKET: parçanın kimliği + İZLENEBİLİRLİK (yarı mamül / sipariş).
        // Operatör plakadaki her parçanın hangi işe ait olduğunu görebilmeli;
        // ayrıştırma ve sevkiyat hatalarının en sık sebebi bu bilginin
        // kesimden sonra kaybolmasıdır.
        const yh = Math.max(7, Math.min(20, Math.min(p.w, p.h) / 7));
        const sipMetni = (p.siparisKodlari && p.siparisKodlari.length)
          ? p.siparisKodlari.join(',')
          : '';
        const mustMetni = (p.musteriler && p.musteriler.length)
          ? p.musteriler.join(', ')
          : '';
        const satirlar = [
          `${i + 1} ${Math.round(p.w)}x${Math.round(p.h)}${p.rotated ? ' R' : ''}`,
          p.ymKod ? `YM: ${p.ymKod}` : (p.ymAd ? `YM: ${p.ymAd.slice(0, 18)}` : ''),
          sipMetni ? `SIP: ${sipMetni}` : '',
          mustMetni ? `MUS: ${mustMetni.slice(0, 28)}` : ''
        ].filter(Boolean);
        // Satırları parçanın ortasına dikey olarak yay
        const toplamYuk = satirlar.length * yh * 1.25;
        satirlar.forEach((satirMetni, si) => {
          yazi(px + p.w * 0.05,
            py + p.h / 2 + toplamYuk / 2 - (si + 1) * yh * 1.25,
            yh, satirMetni, 'ETIKET');
        });
      });

      xOffset += plaka.en + ARA;
    });

    c(0, 'ENDSEC'); c(0, 'EOF');
    return s.join('\r\n') + '\r\n';
  }

  function downloadDxf(sonucNesting, plaka) {
    const dxfText = buildDxf(sonucNesting, plaka);
    const blob = new Blob([dxfText], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (plaka.ad || 'kesim-plani').replace(/[^a-zA-Z0-9_-]/g, '_') + '_nesting.dxf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    App.toast('DXF dosyası indirildi, AutoCAD veya başka bir CAD programında açabilirsiniz', 'ok');
  }

  return { render };
})();
