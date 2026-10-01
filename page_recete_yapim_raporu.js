// ════════════════════════════════════════════════════════════════════════════
// REÇETE YAPIM RAPORU — bir "master" (tam tanımlı, tek renkli) reçete Excel'i
// yükleyip, AYNI parça ailesindeki kardeş (başka renklerdeki) yarı mamül
// kartlarını otomatik etiketleyen ekran.
// ────────────────────────────────────────────────────────────────────────────
// Kullanım: "dafne ile ilgili tanımlamaları yaptım... bu reçeteyi
// yüklediğimde diğer tüm benzer renkli reçeteler bu reçeteye göre
// düzenlensin" — bkz. recete_yapim_raporu_motoru.js (asıl mantık, SAF).
// Bu dosya sadece Excel yükleme + rapor/aksiyon arayüzüdür.
// ════════════════════════════════════════════════════════════════════════════
PageModules.recete_yapim_raporu = (() => {
  const ROLLER = ['admin', 'arge', 'teknik_ofis', 'yonetim'];
  let sonMasterKodlar = null; // {rootKod, stokKodlari} — "Yeniden Kontrol Et" için bellekte tutulur

  async function render(main) {
    const rol = App.aktifRol();
    if (!ROLLER.includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE, Teknik Ofis ve Yönetim tarafından kullanılır.</div></div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="page-hdr"><div>
        <div class="page-title">📋 Reçete Yapım Raporu</div>
        <div class="page-sub">Tam tanımlı tek bir renk reçetesini yükleyin — aynı parça ailesindeki diğer renklerin yarı mamülleri otomatik etiketlensin</div>
      </div></div>
      <div class="card" style="margin-bottom:12px">
        <div class="fhint" style="margin-bottom:10px">
          Hiyerarşik (LevelNo/PathKod/StokKod) formatındaki bir reçete Excel'i yükleyin. Sistem, bu reçetenin alt ağacındaki
          her yarı mamül parça için (ör. "...3.DAF") AYNI aileden (ör. "...3.ANT") ama henüz etiketlenmemiş kardeş
          kartları bulur; master parçanın (Hammaddeler/Yarı Mamüller ekranında) zaten girilmiş malzeme kategorisi +
          ölçüsünü, kardeşin KENDİ kod ekinden bulunan rengiyle birleştirip otomatik etiketler. Hammaddeler (sunta/mdf/
          boya) bu şekilde YAYILMAZ — onlar elle, Renk Eşleştirme Anahtarı'ndan tanımlanır (bkz. not).
        </div>
        <input type="file" id="ryr-file" accept=".xlsx,.xls" style="font-size:12px">
        <div id="ryr-status" style="margin-top:10px;font-size:12px;color:var(--text2)"></div>
      </div>
      <div id="ryr-rapor"></div>
    `;

    document.getElementById('ryr-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const statusEl = document.getElementById('ryr-status');
      statusEl.textContent = 'Dosya okunuyor…';
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const parsed = HiyerarsikReceteParser.parseExceleReceteRows(rows, file.name);
        if (!parsed.items.length) {
          statusEl.innerHTML = '<span style="color:var(--red-text)">Dosyada okunabilir satır bulunamadı. Sütun başlıklarının (LevelNo, PathKod, LineType, StokKod, ...) doğru olduğundan emin olun.</span>';
          return;
        }
        sonMasterKodlar = { rootKod: parsed.rootKod, stokKodlari: parsed.items.map(i => i.stokKod) };
        statusEl.innerHTML = `<b>${App.escapeHtml(parsed.rootKod)}</b> okundu — ${parsed.items.length} satır (tüm alt ağaç dahil).`;
        await kontrolEtVeCiz(main);
      } catch (err) {
        statusEl.innerHTML = '<span style="color:var(--red-text)">Dosya okunamadı: ' + App.escapeHtml(err.message) + '</span>';
      }
    };
  }

  async function kontrolEtVeCiz(main) {
    if (!sonMasterKodlar) return;
    const [yarimamuller, renkKisaltmalari] = await Promise.all([Store.yarimamuller.all(), Store.renkKisaltmalari.all()]);
    const rapor = ReceteYapimRaporuMotoru.raporOlustur(sonMasterKodlar.stokKodlari, { yarimamuller, renkKisaltmalari });
    raporCiz(main, rapor);
  }

  function raporCiz(main, rapor) {
    const kapsayici = document.getElementById('ryr-rapor');
    if (!rapor.duzenlenen.length && !rapor.eksikRenkTanimi.length && !rapor.eksikKategoriTanimi.length) {
      kapsayici.innerHTML = `<div class="empty-state"><div class="eicon">✓</div>
        <div class="etitle">Düzenlenecek veya eksik bir şey bulunamadı</div>
        <div class="edesc">Bu reçetenin parça ailesinde kardeş renk bulunamadı, ya da hepsi zaten doğru etiketli.</div></div>`;
      return;
    }

    kapsayici.innerHTML = `
      ${rapor.duzenlenen.length ? `
        <div class="card" style="margin-bottom:12px">
          <div class="card-hdr">
            <div class="card-title">✅ Otomatik Düzenlenecek Reçeteler/Parçalar (${rapor.duzenlenen.length})</div>
            <button class="btn btn-green" id="ryr-uygula">Uygula</button>
          </div>
          <div class="tbl-wrap" style="max-height:320px;overflow:auto"><table class="dtable" style="font-size:11.5px">
            <tr><th>Kod</th><th>Ad</th><th>Atanacak Renk</th><th>Kategori</th><th>Ölçü</th><th>Kaynak (Master) Parça</th></tr>
            ${rapor.duzenlenen.map(d => `<tr>
              <td class="mono">${App.escapeHtml(d.kod)}</td>
              <td>${App.escapeHtml(d.ad || '')}</td>
              <td><span class="pill pill-green">${App.escapeHtml(d.renkKartelaKodu)} - ${App.escapeHtml(d.renkAdi)}</span></td>
              <td>${App.escapeHtml(d.malzemeKategorisi)}</td>
              <td>${App.escapeHtml(d.renkOlcuEtiketi || '—')}</td>
              <td class="muted" style="font-size:10.5px">${App.escapeHtml(d.masterKod)}</td>
            </tr>`).join('')}
          </table></div>
        </div>` : ''}

      ${rapor.eksikRenkTanimi.length ? `
        <div class="card" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:8px">⚠ Renk Tanımı Eksik — Tanınmayan Kod Son Ekleri (${rapor.eksikRenkTanimi.length})</div>
          <div class="fhint" style="margin-bottom:10px">Bu son eklerin hangi renge karşılık geldiği Renk Eşleştirme Anahtarı'nda tanımlı değil — önce orada bu ekleri bir renge bağlayın, sonra bu raporu yeniden kontrol edin.</div>
          <table class="dtable" style="font-size:11.5px">
            <tr><th>Son Ek</th><th>Etkilenen Parçalar</th><th></th></tr>
            ${rapor.eksikRenkTanimi.map(e => `<tr>
              <td class="mono"><b>.${App.escapeHtml(e.sonEk)}</b></td>
              <td style="font-size:10.5px">${e.kayitlar.map(k => App.escapeHtml(k.kod)).join(', ')}</td>
              <td class="r"><button class="btn btn-sm ryr-renk-tanimla" data-sonek="${App.escapeHtml(e.sonEk)}">Bu Son Ek İçin Renk Tanımla →</button></td>
            </tr>`).join('')}
          </table>
        </div>` : ''}

      ${rapor.eksikKategoriTanimi.length ? `
        <div class="card" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:8px">⚠ Kategori/Ölçü Tanımı Eksik — Ana Reçetedeki Şu Parçalar (${rapor.eksikKategoriTanimi.length})</div>
          <div class="fhint" style="margin-bottom:10px">Bu parçaların kardeşleri (başka renklerde) bulundu ama bu parçanın KENDİSİ henüz malzeme kategorisiyle (sunta/mdf/pvc kenar bandı/boya) etiketlenmemiş — önce bunu tanımlayın, sonra kardeşlerine otomatik yayılabilsin.</div>
          <table class="dtable" style="font-size:11.5px">
            <tr><th>Kod</th><th>Ad</th><th class="r">Kardeş Sayısı</th><th></th></tr>
            ${rapor.eksikKategoriTanimi.map(e => `<tr>
              <td class="mono">${App.escapeHtml(e.masterKod)}</td>
              <td>${App.escapeHtml(e.masterAd || '')}</td>
              <td class="r">${e.kardesSayisi}</td>
              <td class="r"><button class="btn btn-sm ryr-kategori-tanimla" data-id="${e.masterId}">Bu Parçayı Tanımla →</button></td>
            </tr>`).join('')}
          </table>
        </div>` : ''}
    `;

    const uygulaBtn = document.getElementById('ryr-uygula');
    if (uygulaBtn) uygulaBtn.onclick = () => uygula(main, rapor.duzenlenen);

    kapsayici.querySelectorAll('.ryr-renk-tanimla').forEach(btn => {
      btn.onclick = () => App.goTo('renk_anahtari', { onerilenKisaltma: btn.dataset.sonek });
    });
    kapsayici.querySelectorAll('.ryr-kategori-tanimla').forEach(btn => {
      btn.onclick = async () => {
        const [yarimamuller, hammaddeler, rotalar] = await Promise.all([Store.yarimamuller.all(), Store.hammaddeler.all(), Store.rotalar.all()]);
        const kart = yarimamuller.find(y => y.id === btn.dataset.id);
        if (!kart) { App.toast('Kart bulunamadı (silinmiş olabilir)', 'err'); return; }
        PageModules.yarimamul.openForm(main, kart, hammaddeler, rotalar, () => kontrolEtVeCiz(main));
      };
    });
  }

  async function uygula(main, duzenlenen) {
    if (!duzenlenen.length) return;
    await App.persist(async () => {
      const yarimamuller = await Store.yarimamuller.all();
      const guncellenecek = [];
      duzenlenen.forEach(d => {
        const kart = yarimamuller.find(y => y.id === d.id);
        if (!kart) return;
        kart.renkKartelaKodu = d.renkKartelaKodu;
        kart.malzemeKategorisi = d.malzemeKategorisi;
        kart.renkOlcuEtiketi = d.renkOlcuEtiketi;
        guncellenecek.push(kart);
      });
      if (guncellenecek.length) await Store.topluGuncelle('yarimamuller', guncellenecek);
    });
    App.toast(duzenlenen.length + ' parça etiketlendi', 'ok');
    await kontrolEtVeCiz(main);
  }

  return { render };
})();
