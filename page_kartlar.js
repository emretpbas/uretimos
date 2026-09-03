// ════════════════════════════════════════════════════════════════════════════
// ÜRÜN KARTLARI — bitmiş ürün + yarı mamül kartları, hiyerarşik BOM ağacı
// ════════════════════════════════════════════════════════════════════════════

// ── ÜRÜN KARTI SİLİNİRKEN YARI MAMÜL CASCADE'İ (saf mantık, test edilebilir) ─
// Bir ürün kartı silindiğinde, reçetesindeki yarı mamül bileşenleri de
// GEREKSİZ hale gelir — ama yalnızca BAŞKA HİÇBİR YERDE kullanılmıyorlarsa.
// "Başka yerde kullanım": başka bir reçetede bileşen olmak (başka bir ürün,
// alt montaj, paket veya yarı mamülün reçetesinde), açık bir sipariş/teklifte
// geçmek, aktif bir iş emrinde olmak, ya da stokta bakiyesi olmak — bunların
// HERHANGİ biri varsa kart SİLİNMEZ (kart-silme akışındaki "engeller"
// kontrolüyle aynı güvenlik mantığı, tek tek yarı mamüller için tekrarlanır).
function yarimamulCascadeSilinebilirMi(ym, receteVar, tumReceteler, siparisler, teklifler, isemirleri, stokRaf) {
  const baskaYerdeKullanimda = tumReceteler.some(r => r.id !== receteVar.id &&
    (r.kalemler || []).some(k => k.tip === 'yarimamul' && k.refId === ym.id));
  if (baskaYerdeKullanimda) return false;
  const acikSip = siparisler.some(s => s.durum !== 'reddedildi' && (s.kalemler || []).some(k => k.kod === ym.kod));
  const acikTeklif = teklifler.some(t => (t.kalemler || []).some(k => k.kod === ym.kod));
  const aktifIe = isemirleri.some(ie => ie.durum !== 'tamamlandi' &&
    ((ie.urunId === ym.id) || (ie.uretimListesi || []).some(k => k.refId === ym.id)));
  const stokVar = stokRaf.some(s => s.refId === ym.id && (s.miktar || 0) > 0);
  return !acikSip && !acikTeklif && !aktifIe && !stokVar;
}

// receteVar: silinecek ürünün kendi reçetesi. Döndürür: cascade ile birlikte
// silinecek yarı mamül KARTLARININ listesi (boş olabilir).
function urunSilYarimamulCascade(receteVar, tumYarimamuller, tumReceteler, siparisler, teklifler, isemirleri, stokRaf) {
  if (!receteVar) return [];
  const adaylar = [...new Set((receteVar.kalemler || [])
    .filter(k => k.tip === 'yarimamul' && k.refId).map(k => k.refId))];
  return adaylar.map(id => tumYarimamuller.find(y => y.id === id)).filter(Boolean)
    .filter(ym => yarimamulCascadeSilinebilirMi(ym, receteVar, tumReceteler, siparisler, teklifler, isemirleri, stokRaf));
}

PageModules.kartlar = (() => {

  // ── PARÇALI KAYIT (HTTP 413 koruması) ─────────────────────────────────────
  // Binlerce kartlı koleksiyonun tamamını tek istekte göndermek sunucuda
  // "Payload Too Large" hatası verir. Bu yardımcı, koleksiyonu kaydetmek yerine
  // YALNIZCA değişen/yeni kayıtları partiler halinde gönderir.
  //   oncekiIdler: işlem başlamadan önceki id kümesi (yeni olanları ayırmak için)
  async function parcaliKaydet(koleksiyonAdi, liste, oncekiIdler, degisenIdler) {
    const yeniler = [], guncellenenler = [];
    (liste || []).forEach(k => {
      if (!k || k.id === undefined) return;
      if (!oncekiIdler.has(k.id)) yeniler.push(k);
      else if (!degisenIdler || degisenIdler.has(k.id)) guncellenenler.push(k);
    });
    if (yeniler.length) await Store.topluEkle(koleksiyonAdi, yeniler, 200);
    if (guncellenenler.length) await Store.topluGuncelle(koleksiyonAdi, guncellenenler, 200);
    return { yeni: yeniler.length, guncel: guncellenenler.length };
  }


  let detayKartId = null; // { id, tip: 'urun'|'yarimamul'|'altmontaj'|'paket' }
  let activeTab = 'urunler';

  async function render(main) {
    const [urunler, yarimamuller, altMontajlar, paketler] = await Promise.all([Store.urunler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(), Store.paketler.all()]);
    if (detayKartId) {
      let kart = urunler.find(x => x.id === detayKartId.id && detayKartId.tip === 'urun');
      if (!kart) kart = yarimamuller.find(x => x.id === detayKartId.id && detayKartId.tip === 'yarimamul');
      if (!kart) kart = altMontajlar.find(x => x.id === detayKartId.id && detayKartId.tip === 'altmontaj');
      if (!kart) kart = paketler.find(x => x.id === detayKartId.id && detayKartId.tip === 'paket');
      if (kart) { renderDetay(main, kart, detayKartId.tip); return; }
      detayKartId = null;
    }
    renderGrid(main, urunler, yarimamuller, altMontajlar, paketler);
  }

  function renderGrid(main, urunler, yarimamuller, altMontajlar, paketler) {
    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Ürün, Yarı Mamül, Alt Montaj & Paket Kartları — Reçete (BOM) Yap</div>
          <div class="page-sub">Bitmiş ürün, yarı mamül, alt montaj ve paket kartlarının her birine tıklayıp reçetesini (hammadde/hırdavat/yarı mamül/alt montaj/paket/mamül kalemlerini) düzenleyin</div>
        </div>
        <div class="page-acts">
          <button class="btn btn-blue" id="kt-new">+ Ürün Kartı Oluştur</button>
          <button class="btn btn-blue" id="kt-new-ym">+ Yarı Mamül Kartı Oluştur</button>
          <button class="btn btn-blue" id="kt-new-am">+ Alt Montaj Kartı Oluştur</button>
          <button class="btn btn-blue" id="kt-new-pkt">+ Paket Kodu Oluştur</button>
          <button class="btn btn-green" id="kt-wizard">+ Sıfırdan Ürün (Reçete + Hammadde + İşçilik)</button>
          <button class="btn btn-green" id="kt-dolap">🗄 Dolap Tasarım</button>
          <button class="btn" id="kt-dolap-liste">📐 Kayıtlı Dolap Tasarımları</button>
          <button class="btn btn-green" id="kt-masa">🪑 Masa Tasarım</button>
          <button class="btn" id="kt-masa-liste">📐 Kayıtlı Masa Tasarımları</button>
          <button class="btn btn-green" id="kt-mekan">🏠 Mekan Yerleşim</button>
          <button class="btn" id="kt-mekan-liste">📂 Kayıtlı Mekanlar</button>
          <button class="btn" id="kt-excel-import">⬆ Excelden Reçete İçe Aktar</button>
        </div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'urunler' ? 'active' : ''}" data-tab="urunler">Bitmiş Ürünler ${urunler.length ? '<span class="pill pill-gray" style="margin-left:4px">' + urunler.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'yarimamuller' ? 'active' : ''}" data-tab="yarimamuller">Yarı Mamüller ${yarimamuller.length ? '<span class="pill pill-gray" style="margin-left:4px">' + yarimamuller.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'altmontajlar' ? 'active' : ''}" data-tab="altmontajlar">Alt Montajlar ${altMontajlar.length ? '<span class="pill pill-gray" style="margin-left:4px">' + altMontajlar.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'paketler' ? 'active' : ''}" data-tab="paketler">Paketler ${paketler.length ? '<span class="pill pill-gray" style="margin-left:4px">' + paketler.length + '</span>' : ''}</div>
      </div>
      <div class="grid grid-3" id="kt-grid"></div>
    `;
    document.getElementById('kt-new').onclick = () => openForm(null, () => render(main));
    document.getElementById('kt-new-ym').onclick = () => openYmForm(main, null, () => render(main));
    document.getElementById('kt-new-am').onclick = () => openAltMontajForm(null, () => render(main));
    document.getElementById('kt-new-pkt').onclick = () => openPaketForm(null, () => render(main));
    document.getElementById('kt-wizard').onclick = () => openWizard(main);
    // 🗄 Dolap Tasarım — parametrik dolabı ürün ağacına işler (dolap_tasarim.js)
    const dolapBtn = document.getElementById('kt-dolap');
    if (dolapBtn) dolapBtn.onclick = () => DolapTasarim.ac(() => render(main));
    // 📐 Kayıtlı dolap tasarımları — açıp düzenle, yeni revizyon üret
    const dolapListeBtn = document.getElementById('kt-dolap-liste');
    if (dolapListeBtn) dolapListeBtn.onclick = () => DolapTasarim.listeAc(() => render(main));
    // 🪑 Masa / Workstation tasarım (masa_tasarim.js)
    const masaBtn = document.getElementById('kt-masa');
    if (masaBtn) masaBtn.onclick = () => MasaTasarim.ac(() => render(main));
    const masaListeBtn = document.getElementById('kt-masa-liste');
    if (masaListeBtn) masaListeBtn.onclick = () => MasaTasarim.listeAc(() => render(main));
    // 🏠 Mekan Yerleşim — kayıtlı dolap/masa tasarımlarını oda planına yerleştir
    const mekanBtn = document.getElementById('kt-mekan');
    if (mekanBtn) mekanBtn.onclick = () => MekanYerlesim.ac(() => render(main));
    const mekanListeBtn = document.getElementById('kt-mekan-liste');
    if (mekanListeBtn) mekanListeBtn.onclick = () => MekanYerlesim.listeAc(() => render(main));
    document.getElementById('kt-excel-import').onclick = () => openExcelImport(main);
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const grid = document.getElementById('kt-grid');
    const tipMap = { urunler: ['urun', urunler], yarimamuller: ['yarimamul', yarimamuller], altmontajlar: ['altmontaj', altMontajlar], paketler: ['paket', paketler] };
    const [tip, liste] = tipMap[activeTab];
    const tipAdi = { urun: 'ürün', yarimamul: 'yarı mamül', altmontaj: 'alt montaj', paket: 'paket' }[tip];
    if (!liste.length) {
      grid.style.display = 'block';
      grid.innerHTML = `<div class="empty-state"><div class="eicon">▥</div><div class="etitle">Henüz ${tipAdi} kartı yok</div></div>`;
      return;
    }
    grid.innerHTML = liste.map(u => {
      // Görsel artık karta gömülü olmayabilir (sunucuya taşınmış olabilir);
      // adres QrDosya.gorselUrl ile çözülür. Eski gömülü kayıtlar da çalışır.
      const g0 = (u.gorseller && u.gorseller[0]) || null;
      const g0url = (g0 && QrDosya.gorselMi(g0)) ? QrDosya.gorselUrl(g0) : '';
      const thumb = g0url ? `<img src="${g0url}" loading="lazy">` : (tip === 'urun' ? '▥' : (tip === 'altmontaj' ? '⬡' : (tip === 'paket' ? '📦' : '◫')));
      return `<div class="card kt-card" data-id="${u.id}" data-tip="${tip}" style="cursor:pointer">
        <div class="thumb" style="width:100%;height:120px;margin-bottom:10px;font-size:28px">${thumb}</div>
        <div style="font-weight:800;font-size:12.5px" class="mono">${App.escapeHtml(u.kod)}</div>
        <div style="font-size:12.5px;color:var(--text2);margin-top:2px">${App.escapeHtml(u.ad)}</div>
        <div class="muted" style="font-size:10.5px;margin-top:6px">${App.escapeHtml(u.aciklama || '')}</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.kt-card').forEach(c => c.onclick = () => { detayKartId = { id: c.dataset.id, tip: c.dataset.tip }; render(main); });
  }

  async function renderDetay(main, kartParam, tip) {
    const [receteler, yarimamuller, urunler, altMontajlar, hammaddeler, rotalar, paketler] = await Promise.all([
      Store.receteler.all(), Store.yarimamuller.all(), Store.urunler.all(), Store.altMontajlar.all(), Store.hammaddeler.all(), Store.rotalar.all(), Store.paketler.all()
    ]);
    // KRİTİK: kartParam, çağıran tarafın closure'ından gelen ESKİ bir referans
    // olabilir (örn. "Düzenle" formu rotaId/amortisman/GYG günceller, Store'a
    // yazar, ama geri dönüş callback'i hâlâ eski `kart` objesini yakalamış
    // olabilir). Bu yüzden burada kartı HER ZAMAN ilgili koleksiyondan ID'sine
    // göre TAZE olarak yeniden okuyoruz — aksi halde rota/amortisman/GYG gibi
    // az önce kaydedilen değişiklikler maliyet kartında "₺0,00" görünür.
    const tazeListe = tip === 'urun' ? urunler : tip === 'yarimamul' ? yarimamuller : tip === 'altmontaj' ? altMontajlar : paketler;
    const kart = tazeListe.find(x => x.id === kartParam.id) || kartParam;
    // Reçete kaydı: ürünlerde urunId, yarımamüllerde yarimamulId, alt montajda altMontajId, pakette paketId ile bağlanır.
    let recete = tip === 'urun' ? receteler.find(r => r.urunId === kart.id)
      : tip === 'yarimamul' ? receteler.find(r => r.yarimamulId === kart.id)
      : tip === 'altmontaj' ? receteler.find(r => r.altMontajId === kart.id)
      : receteler.find(r => r.paketId === kart.id);
    const tipEtiketleri = { urun: ['Bitmiş Ürün', 'pill-blue'], yarimamul: ['Yarı Mamül', 'pill-gray'], altmontaj: ['Alt Montaj', 'pill-amber'], paket: ['Paket', 'pill-green'] };
    const [tipEtiket, tipRenk] = tipEtiketleri[tip];

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title mono">${App.escapeHtml(kart.kod)}</div>
          <div class="page-sub">${App.escapeHtml(kart.ad)} <span class="pill ${tipRenk}" style="margin-left:6px">${tipEtiket}</span></div>
        </div>
        <div class="page-acts">
          <button class="btn" id="kt-back">&larr; Kartlara Dön</button>
          <button class="btn btn-green" id="kt-agac-gorunum">🌳 Ağaç Görünümünde Düzenle</button>
          <button class="btn" id="kt-qr-dosya" title="QR etiketi + step/dwg/pdf/excel/resim dosya alanı">📎 QR &amp; Teknik Dosyalar</button>
          <button class="btn" id="kt-teknik-dosya" title="STEP'ten üretilmiş patlatılmış şema, görünüşler ve montaj sırası">📐 Teknik Dosya</button>
          <button class="btn" id="kt-excel-aktar">📥 Alt Kırılım Excel</button>
          <button class="btn" id="kt-edit">Düzenle</button>
          <button class="btn" id="kt-copy" title="Kartı ve reçetesini kopyalayıp yeni kart olarak kaydet">⧉ Kartı + Reçeteyi Kopyala</button>
          <button class="btn" id="kt-recete-sil" title="Reçetenin TÜM kalemlerini sil (kart kalır)">🗑 Reçeteyi Boşalt</button>
          <button class="btn btn-red" id="kt-kart-sil" title="Kartı ve reçetesini tamamen sil">✗ Kartı Sil</button>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-hdr"><div class="card-title">${tipEtiket} Bilgisi</div></div>
          <div id="kt-gorsel-grid" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px"></div>
          <div style="font-size:12.5px;color:var(--text2)">${App.escapeHtml(kart.aciklama || 'Açıklama girilmemiş.')}</div>
          <div class="muted" style="font-size:11px;margin-top:8px">Oluşturma tarihi: ${kart.olusturmaTarihi || '—'}</div>
          ${tip === 'paket' ? `<div class="muted" style="font-size:11px;margin-top:4px">${App.escapeHtml(kart.ambalajTipi || 'Koli')} içi: ${kart.koliIciAdet || 1} adet</div>
            <div class="fhint" style="margin-top:8px">📦 Bu kart SANALDIR — Satınalma/MRP/Depo süreçlerine girmez, sadece Üretim Tamamla → Kalite Onayı → Sevkiyat İrsaliyesi zincirinde adet kontrolü için kullanılır.</div>` : ''}
          ${kart.rotaId ? `<div class="muted" style="font-size:11px;margin-top:4px">Rota atanmış (maliyete dahil)</div>` : ''}
          ${(kart.amortismanGideri || kart.gygOraniYuzde) ? `<div class="muted" style="font-size:11px;margin-top:2px">Amortisman: ${App.fmtTL(kart.amortismanGideri || 0)} · GYG: %${kart.gygOraniYuzde || 0}</div>` : ''}
          ${(() => {
            // ── ÖLÇÜ / HACİM / AĞIRLIK ─────────────────────────────────────
            // Elle girilmişse o, değilse reçetedeki paket kalemlerinden
            // hesaplanan değer gösterilir. Kaynak rozetle belirtilir ki
            // kullanıcı hangi verinin kullanıldığını görebilsin.
            const ozet = tip === 'urun'
              ? App.urunPaketOzeti(kart.id, receteler, paketler, 1) : null;
            const coz = App.olcuAgirlikCoz(kart, ozet, 1);
            if (coz.kaynak === 'yok') {
              return `<div class="fhint" style="margin-top:8px">Ölçü ve ağırlık girilmemiş — kartı düzenleyip ekleyebilirsiniz.</div>`;
            }
            const h = App.olculerdenHacim(coz.en, coz.boy, coz.yukseklik);
            return `
              <div class="hr" style="margin:10px 0 8px"></div>
              <div class="flex-gap" style="align-items:center;gap:6px;margin-bottom:6px">
                <span class="flbl" style="margin:0">Ölçü · Hacim · Ağırlık</span>
                ${App.olcuKaynakRozeti(coz)}
              </div>
              <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px">
                ${(coz.en && coz.boy && coz.yukseklik)
                  ? `<span>Ölçü: <b>${App.fmt(coz.en, 0)}×${App.fmt(coz.boy, 0)}×${App.fmt(coz.yukseklik, 0)}</b> cm</span>` : ''}
                ${coz.m3 ? `<span>Hacim: <b>${App.fmt(coz.m3, 4)} m³</b></span>` : ''}
                ${(coz.desi || h.desi) ? `<span>Desi: <b>${App.fmt(coz.desi || h.desi, 2)}</b></span>` : ''}
                ${coz.netKg ? `<span>Net: <b>${App.fmt(coz.netKg, 2)} kg</b></span>` : ''}
                ${coz.brutKg ? `<span>Brüt: <b>${App.fmt(coz.brutKg, 2)} kg</b></span>` : ''}
                ${coz.paketSayisi ? `<span>Koli: <b>${App.fmt(coz.paketSayisi, 0)}</b></span>` : ''}
              </div>
              ${(coz.kaynak === 'manuel' && coz.receteVar && coz.receteOzet.m3
                 && Math.abs(coz.receteOzet.m3 - coz.m3) > 0.0005)
                ? `<div class="fhint" style="margin-top:6px;color:var(--amber-text)">⚠ Reçetedeki paketlerden hesaplanan değer farklı: ${App.fmt(coz.receteOzet.m3, 4)} m³ · ${App.fmt(coz.receteOzet.brutKg, 2)} kg. Elle girilen değer kullanılıyor.</div>`
                : ''}
            `;
          })()}
        </div>
        <div class="card">
          <div class="card-hdr"><div class="card-title">Reçete (BOM) — Hammadde / Hırdavat / Yarı Mamül / Alt Montaj / Paket / Mamül Kalemleri</div>
            <button class="btn btn-sm" id="kt-add-kalem">+ Satıra Kalem Ekle</button>
          </div>
          <div id="kt-bom-tree"></div>
          ${(recete && recete.kalemler.length) ? '<div class="fhint" style="margin-top:8px">Miktar hücresine tıklayıp değiştirebilir, Enter\'a basıp kaydedebilirsiniz. Her satırın sonundaki "Nerede Kullanılıyor" ile o kartın başka hangi reçetelerde geçtiğini görebilirsiniz.</div>' : ''}
        </div>
      </div>

      <div class="card" id="kt-maliyet-card"></div>
    `;
    document.getElementById('kt-back').onclick = () => { detayKartId = null; render(main); };
    // 📎 QR & TEKNİK DOSYALAR: kartın QR etiketi + telefondan erişilen dosya alanı
    document.getElementById('kt-qr-dosya').onclick = () => QrDosya.ac(tip, kart.id, kart.kod, kart.ad);
    document.getElementById('kt-agac-gorunum').onclick = () => {
      PageModules.recete_agac.ac(main, kart, tip, () => { detayKartId = { id: kart.id, tip }; render(main); });
    };
    document.getElementById('kt-teknik-dosya').onclick = () => {
      const td = kart && kart.teknikDosya;
      if (!td) {
        App.openModal({
          title: '📐 Teknik Dosya',
          body: `<div class="fhint">
              Bu kart için teknik dosya kaydedilmemiş.<br><br>
              Üretmek için: <b>STEP'ten Ürün Ağacı (CAD)</b> ekranından STEP dosyasını
              yükleyin, ürün kodunu <b>${App.escapeHtml(kart ? (kart.kod || '') : '')}</b> girin ve
              "📐 Teknik Dosya" → "💾 Ürün Kartına Kaydet" deyin.
            </div>`,
          footer: `<button class="btn" id="td-kapat">Kapat</button>
                   <button class="btn btn-blue" id="td-git">STEP Ekranına Git</button>`
        });
        document.getElementById('td-kapat').onclick = App.closeModal;
        document.getElementById('td-git').onclick = () => { App.closeModal(); App.goTo('step_ice_aktar'); };
        return;
      }
      App.openModal({
        title: '📐 Teknik Dosya',
        sub: `${App.escapeHtml(kart.kod || '')} · ${td.genelOlcu ? td.genelOlcu.join(' × ') + ' mm' : ''} · ${td.parcaSayisi || 0} parça`,
        body: `<div class="fhint" style="margin-bottom:8px">
            ${App.escapeHtml(td.kaynak || '')} · ${(td.olusturmaTarihi || '').slice(0, 10)}
            ${td.olusturan ? ' · ' + App.escapeHtml(td.olusturan) : ''}
          </div>
          <div style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px">
            <div style="font-size:11.5px;font-weight:600;margin-bottom:4px">Patlatılmış Montaj Şeması</div>
            <div style="max-height:300px;overflow:hidden">${td.patlatmaSvg || ''}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${(td.gorunusler || []).map(g => `<div style="border:1px solid var(--border);border-radius:8px;padding:6px">
              <div style="font-size:11px;font-weight:600;color:var(--blue)">${App.escapeHtml(g.ad)} · ${g.genislik}×${g.yukseklik} mm</div>
              <div style="max-height:160px;overflow:hidden">${g.svg}</div></div>`).join('')}
          </div>
          ${(td.balonlar || []).length ? `<table class="dtable" style="margin-top:8px">
            <tr><th style="width:44px">Balon</th><th>Parça</th><th class="r">Ölçü (mm)</th></tr>
            ${td.balonlar.map(b => `<tr><td class="c">${b.balon}</td>
              <td>${App.escapeHtml(b.ad)}</td>
              <td class="r">${(b.olcu || []).join(' × ')}</td></tr>`).join('')}
          </table>` : ''}`,
        footer: `<button class="btn" id="td-kapat2">Kapat</button>
                 <button class="btn btn-green" id="td-yazdir">🖨 PDF / Yazdır</button>`,
        wide: true
      });
      document.getElementById('td-kapat2').onclick = App.closeModal;
      document.getElementById('td-yazdir').onclick = () => {
        // Kaydedilmiş SVG'lerden yazdırılabilir sayfa kur
        const w = window.open('', '_blank');
        if (!w) { App.toast('Açılır pencere engellendi.', 'err'); return; }
        w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
          <title>${App.escapeHtml(kart.kod || '')} Teknik Dosya</title>
          <style>@page{size:A4;margin:12mm}body{font-family:Arial;font-size:11px}
            h1{font-size:18px;color:#1f4e79;margin:0 0 8px}
            h2{font-size:13px;color:#1f4e79;border-bottom:2px solid #1f4e79;margin:16px 0 8px}
            svg{width:100%;height:auto;max-height:400px}
            .ikili{display:grid;grid-template-columns:1fr 1fr;gap:10px}
            table{width:100%;border-collapse:collapse;margin-top:6px}
            th{background:#1f4e79;color:#fff;padding:5px;font-size:10px;text-align:left}
            td{padding:4px 6px;border-bottom:1px solid #e3e3e3}.r{text-align:right}.c{text-align:center}
          </style></head><body>
          <h1>${App.escapeHtml(kart.ad || kart.kod || '')}</h1>
          <div style="font-size:11px;color:#555">${App.escapeHtml(kart.kod || '')} ·
            ${td.genelOlcu ? td.genelOlcu.join(' × ') + ' mm' : ''} · ${new Date().toLocaleDateString('tr')}</div>
          <h2>Patlatılmış Montaj Şeması</h2>${td.patlatmaSvg || ''}
          <table><tr><th class="c">Balon</th><th>Parça</th><th class="r">Ölçü (mm)</th></tr>
            ${(td.balonlar || []).map(b => `<tr><td class="c">${b.balon}</td>
              <td>${App.escapeHtml(b.ad)}</td><td class="r">${(b.olcu || []).join(' × ')}</td></tr>`).join('')}
          </table>
          <div style="page-break-before:always"></div>
          <h2>Görünüşler ve Ölçülendirme</h2>
          <div class="ikili">${(td.gorunusler || []).map(g =>
            `<div><b style="font-size:11px">${App.escapeHtml(g.ad)} — ${g.genislik}×${g.yukseklik} mm</b>${g.svg}</div>`).join('')}</div>
          ${(td.montajAdimlari || []).length ? `<div style="page-break-before:always"></div>
            <h2>Montaj Sırası</h2>${td.montajAdimlari.map(a =>
              `<div style="border:1px solid #ddd;border-radius:6px;padding:7px;margin-bottom:7px">
                <b>${a.no}. ${a.anaMontajMi ? 'ANA MONTAJ' : 'Alt montaj'}: ${App.escapeHtml(a.hedef)}</b>
                ${(a.parcalar || []).length ? '<div style="font-size:10.5px">' +
                  a.parcalar.map(p => App.escapeHtml(p.ad) + ' ×' + p.adet).join(' · ') + '</div>' : ''}
                ${(a.baglantilar || []).length ? '<div style="font-size:10.5px;color:#555">Bağlantı: ' +
                  a.baglantilar.map(b => App.escapeHtml(b.ad) + ' ×' + b.adet).join(' · ') + '</div>' : ''}
              </div>`).join('')}` : ''}
        </body></html>`);
        w.document.close();
        setTimeout(() => { try { w.print(); } catch (e) { } }, 500);
      };
    };

    document.getElementById('kt-edit').onclick = () => {
      if (tip === 'urun') openForm(kart, () => renderDetay(main, kart, tip));
      else if (tip === 'yarimamul') openYmForm(main, kart, () => renderDetay(main, kart, tip));
      else if (tip === 'altmontaj') openAltMontajForm(kart, () => renderDetay(main, kart, tip));
      else openPaketForm(kart, () => renderDetay(main, kart, tip));
    };
    // KART + REÇETE KOPYALAMA: ürün / yarı mamül / alt montaj / paket kartı
    // yeni kod ve "(Kopya)" adıyla çoğaltılır; reçetesi varsa reçete de yeni
    // karta bağlanarak kopyalanır. Değişiklik yapıp yeni kart olarak kullanın.
    document.getElementById('kt-copy').onclick = async () => {
      const yeniKart = JSON.parse(JSON.stringify(kart));
      yeniKart.id = App.uid(tip === 'urun' ? 'URN' : tip === 'yarimamul' ? 'YM' : tip === 'altmontaj' ? 'AM' : 'PKT');
      yeniKart.kod = (kart.kod || '') + '-KOPYA';
      yeniKart.ad = (kart.ad || '') + ' (Kopya)';
      const storeMap = { urun: Store.urunler, yarimamul: Store.yarimamuller, altmontaj: Store.altMontajlar, paket: Store.paketler };
      await App.persist(() => storeMap[tip].upsert(yeniKart));
      // Reçete kopyası (varsa) — yeni karta bağla
      const tumReceteler = await Store.receteler.all();
      const kaynakRecete = tip === 'urun' ? tumReceteler.find(r => r.urunId === kart.id)
        : tip === 'yarimamul' ? tumReceteler.find(r => r.yarimamulId === kart.id)
        : tip === 'altmontaj' ? tumReceteler.find(r => r.altMontajId === kart.id)
        : tumReceteler.find(r => r.paketId === kart.id);
      if (kaynakRecete) {
        const yeniRecete = JSON.parse(JSON.stringify(kaynakRecete));
        yeniRecete.id = App.uid('RC');
        if (tip === 'urun') yeniRecete.urunId = yeniKart.id;
        else if (tip === 'yarimamul') yeniRecete.yarimamulId = yeniKart.id;
        else if (tip === 'altmontaj') yeniRecete.altMontajId = yeniKart.id;
        else yeniRecete.paketId = yeniKart.id;
        // Yalnızca yeni reçete gönderilir (tüm koleksiyon değil — 413 koruması)
        await App.persist(() => Store.topluEkle('receteler', [yeniRecete], 1));
      }
      App.toast('Kart kopyalandı: ' + yeniKart.kod + (kaynakRecete ? ' (reçetesiyle birlikte)' : '') + ' — Düzenle ile değişiklik yapabilirsiniz', 'ok');
      detayKartId = { id: yeniKart.id, tip };
      render(main);
    };

    // ── REÇETEYİ BOŞALT ───────────────────────────────────────────────────
    // Kartı korur, reçetesindeki tüm kalemleri siler.
    document.getElementById('kt-recete-sil').onclick = async () => {
      const tumReceteler = await Store.receteler.all();
      const r = tip === 'urun' ? tumReceteler.find(x => x.urunId === kart.id)
        : tip === 'yarimamul' ? tumReceteler.find(x => x.yarimamulId === kart.id)
        : tip === 'altmontaj' ? tumReceteler.find(x => x.altMontajId === kart.id)
        : tumReceteler.find(x => x.paketId === kart.id);
      if (!r || !(r.kalemler || []).length) { App.toast('Bu kartın reçetesinde kalem yok', 'err'); return; }
      App.confirmDialog(
        `<b>${App.escapeHtml(kart.kod)}</b> kartının reçetesindeki <b>${r.kalemler.length} kalem</b> silinecek.<br><br>` +
        `Kartın kendisi silinmez, reçete boşalır. Bu işlem geri alınamaz.<br><br>Onaylıyor musunuz?`,
        async () => {
          await App.persist(() => Store.receteler.remove(r.id));
          App.toast('Reçete boşaltıldı: ' + kart.kod, 'ok');
          renderDetay(main, kart, tip);
        });
    };

    // ── KARTI SİL ─────────────────────────────────────────────────────────
    // GÜVENLİK: Kart başka reçetelerde, açık siparişlerde, iş emirlerinde veya
    // stokta kullanılıyorsa SİLİNMEZ — veri bütünlüğü bozulur. Nerede
    // kullanıldığı gösterilir.
    document.getElementById('kt-kart-sil').onclick = async () => {
      const [tumReceteler, siparisler, isemirleri, stokRaf, teklifler, tumYarimamuller] = await Promise.all([
        Store.receteler.all(), Store.siparisler.all(), Store.isemirleri.all(),
        Store.stokRaf.all(), Store.teklifler.all(), Store.yarimamuller.all()
      ]);
      const engeller = [];

      // 1) Başka reçetelerde bileşen olarak kullanılıyor mu?
      const kullananReceteler = tumReceteler.filter(r =>
        (r.kalemler || []).some(k => k.refId === kart.id && k.tip === tip));
      if (kullananReceteler.length) {
        const adlar = kullananReceteler.map(r => r.ad || r.id).slice(0, 5).join(', ');
        engeller.push(`<b>${kullananReceteler.length} reçetede</b> bileşen olarak kullanılıyor: ${App.escapeHtml(adlar)}`);
      }
      // 2) Açık sipariş / tekliflerde geçiyor mu?
      const acikSip = siparisler.filter(s => s.durum !== 'reddedildi' &&
        (s.kalemler || []).some(k => k.kod === kart.kod));
      if (acikSip.length) engeller.push(`<b>${acikSip.length} siparişte</b> geçiyor: ${acikSip.slice(0, 4).map(s => s.kod).join(', ')}`);
      const acikTeklif = teklifler.filter(t => (t.kalemler || []).some(k => k.kod === kart.kod));
      if (acikTeklif.length) engeller.push(`<b>${acikTeklif.length} teklifte</b> geçiyor`);
      // 3) Aktif iş emirlerinde var mı?
      const ieler = isemirleri.filter(ie => ie.durum !== 'tamamlandi' &&
        ((ie.urunId === kart.id) || (ie.uretimListesi || []).some(k => k.refId === kart.id)));
      if (ieler.length) engeller.push(`<b>${ieler.length} aktif iş emrinde</b> var: ${ieler.slice(0, 4).map(x => x.kod).join(', ')}`);
      // 4) Stokta bakiyesi var mı?
      const stok = stokRaf.filter(s => s.refId === kart.id && (s.miktar || 0) > 0);
      if (stok.length) {
        const toplam = stok.reduce((a, s) => a + (s.miktar || 0), 0);
        engeller.push(`Stokta <b>${App.fmt(toplam, 2)}</b> bakiye var`);
      }

      if (engeller.length) {
        const body = document.createElement('div');
        body.innerHTML = `
          <div style="border:1.5px solid var(--red);background:var(--red-bg);border-radius:8px;padding:12px">
            <b style="color:var(--red-text);font-size:12.5px">🚫 Bu kart silinemez — kullanımda</b>
            <div style="font-size:11.5px;margin-top:8px">
              ${engeller.map(e => `<div style="padding:3px 0">• ${e}</div>`).join('')}
            </div>
          </div>
          <div class="fhint" style="margin-top:10px">Kartı silmek için önce bu bağlantıları kaldırın. Alternatif olarak kartı <b>pasife alabilirsiniz</b> (Düzenle → durum), böylece yeni işlemlerde seçilemez ama geçmiş kayıtlar bozulmaz.</div>`;
        App.openModal({ title: '✗ Kart Silinemedi', body, footer: `<button class="btn" id="ks-kapat">Anladım</button>`, wide: true });
        document.getElementById('ks-kapat').onclick = App.closeModal;
        return;
      }

      // Engel yok → sil
      const receteVar = tip === 'urun' ? tumReceteler.find(x => x.urunId === kart.id)
        : tip === 'yarimamul' ? tumReceteler.find(x => x.yarimamulId === kart.id)
        : tip === 'altmontaj' ? tumReceteler.find(x => x.altMontajId === kart.id)
        : tumReceteler.find(x => x.paketId === kart.id);

      // ── ÜRÜN KARTI SİLİNİRKEN: reçetesindeki yarı mamülleri de birlikte
      // sil — AMA yalnızca başka HİÇBİR yerde (başka bir reçetede bileşen
      // olarak, açık sipariş/teklifte, aktif iş emrinde veya stokta)
      // kullanılmayanları. Başka bir karta da bağlıysa DOKUNULMAZ.
      const silinecekYm = tip === 'urun'
        ? urunSilYarimamulCascade(receteVar, tumYarimamuller, tumReceteler, siparisler, teklifler, isemirleri, stokRaf)
        : [];

      App.confirmDialog(
        `<b>${App.escapeHtml(kart.kod)} — ${App.escapeHtml(kart.ad || '')}</b> kartı kalıcı olarak silinecek.` +
        (receteVar ? `<br><br>Reçetesi de silinecek (<b>${(receteVar.kalemler || []).length} kalem</b>).` : '') +
        (silinecekYm.length ? `<br><br>Ayrıca, başka hiçbir yerde kullanılmayan <b>${silinecekYm.length} yarı mamül kartı</b> da silinecek: ` +
          App.escapeHtml(silinecekYm.map(y => y.kod).join(', ')) +
          `<br><span style="font-size:11px;color:var(--text3)">(Başka bir ürün/alt montaj/paket/yarı mamül kartında kullanılan yarı mamüller korunur.)</span>` : '') +
        `<br><br>Kontrol edildi: bu kart hiçbir reçete, sipariş, teklif, iş emri veya stok kaydında kullanılmıyor.` +
        `<br><br><span style="color:var(--red-text)">Bu işlem geri alınamaz.</span> Onaylıyor musunuz?`,
        async () => {
          const storeMap = { urun: Store.urunler, yarimamul: Store.yarimamuller, altmontaj: Store.altMontajlar, paket: Store.paketler };
          await App.persist(async () => {
            if (receteVar) await Store.receteler.remove(receteVar.id);
            for (const ym of silinecekYm) {
              const ymRecete = tumReceteler.find(r => r.yarimamulId === ym.id);
              if (ymRecete) await Store.receteler.remove(ymRecete.id);
              await Store.yarimamuller.remove(ym.id);
            }
            await storeMap[tip].remove(kart.id);
          });
          App.toast('Kart silindi: ' + kart.kod + (silinecekYm.length ? ' · ' + silinecekYm.length + ' yarı mamül de silindi' : ''), 'ok');
          detayKartId = null;
          render(main);
        });
    };
    document.getElementById('kt-add-kalem').onclick = () => openKalemEkleSecici(kart, tip, recete, main);
    document.getElementById('kt-excel-aktar').onclick = () => {
      App.receteAltKirilimExcelIndir(kart, tip, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, App.state.ayarlar, paketler);
    };

    const gg = document.getElementById('kt-gorsel-grid');
    if (kart.gorseller && kart.gorseller.length) {
      gg.innerHTML = kart.gorseller.map(g => `<div class="thumb" style="width:70px;height:70px">${QrDosya.gorselMi(g) ? `<img src="${QrDosya.gorselUrl(g)}" loading="lazy">` : '📄'}</div>`).join('');
    } else gg.innerHTML = `<div class="muted" style="font-size:11px">Görsel yüklenmemiş.</div>`;

    const bomEl = document.getElementById('kt-bom-tree');
    if (recete && recete.kalemler.length) {
      bomEl.innerHTML = renderSimpleBom(recete, yarimamuller, urunler, hammaddeler, altMontajlar, paketler);
      wireBomEditing(bomEl, recete, yarimamuller, urunler, hammaddeler, altMontajlar, () => renderDetay(main, kart, tip), main, paketler);
    } else {
      bomEl.innerHTML = `<div class="empty-state" style="padding:20px 6px"><div class="edesc">Bu ${tipEtiket.toLowerCase()} için henüz reçete kalemi eklenmemiş.</div></div>`;
    }

    // ── MALİYET / LİSTE FİYATI / KÂRLILIK ÖZETİ ─────────────────────────────
    const maliyetCard = document.getElementById('kt-maliyet-card');
    renderMaliyetKarti(maliyetCard, kart, tip, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, paketler);
  }

  // Bir kartın toplam maliyetini (kalem+rota+amortisman+GYG), önerilen liste
  // fiyatını ve kullanıcının girdiği satır/dip iskontosuna göre kârlılık
  // oranını gösterir. Satır iskontosu en fazla %50, dip iskontosu en fazla
  // %10 olabilir (input'larda da bu sınırlar uygulanır).
  function renderMaliyetKarti(cardEl, kart, tip, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, paketler) {
    const ayarlar = App.state.ayarlar;
    const sonuc = App.kartMaliyetHesapla(kart, tip, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar, undefined, paketler);

    let satirIsk = kart._son_satirIsk || 0;
    let dipIsk = kart._son_dipIsk || 0;

    cardEl.style.display = 'block';
    function ciz() {
      // Liste fiyatı: Fiyatlama'daki AYNI formülle (GYG+Nakliye+Kâr/Bölü) hesaplanır.
      const gyg = 1 + (ayarlar.fiyatGygYuzde ?? 10) / 100;
      const nakliye = 1 + (ayarlar.fiyatNakliyeYuzde ?? 7) / 100;
      const kar = 1 + (ayarlar.fiyatKarYuzde ?? 54) / 100;
      const bolu = ayarlar.fiyatBoluKatsayisi ?? 0.45;
      const araToplam = sonuc.toplam * gyg * nakliye * kar;
      const listeFiyati = bolu > 0 ? araToplam / bolu : araToplam;

      const ik = App.iskontoluFiyatVeKarlilikHesapla(listeFiyati, satirIsk, dipIsk, sonuc.toplam, ayarlar);

      cardEl.innerHTML = `
        <div class="card-hdr"><div class="card-title">Maliyet, Liste Fiyatı ve Kârlılık</div></div>
        <div class="grid grid-4" style="margin-bottom:14px">
          <div class="kpi"><div class="kpi-lbl">Kalem Maliyeti</div><div class="kpi-val">${App.fmtTL(sonuc.kalemToplami)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Rota (İşçilik)</div><div class="kpi-val">${App.fmtTL(sonuc.rotaMaliyeti)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Amortisman</div><div class="kpi-val">${App.fmtTL(sonuc.amortismanGideri)}</div></div>
          <div class="kpi"><div class="kpi-lbl">GYG (Reçeteye Özel)</div><div class="kpi-val">${App.fmtTL(sonuc.gygGideri)}</div></div>
        </div>
        <div class="grid grid-2" style="margin-bottom:14px">
          <div class="kpi"><div class="kpi-lbl">TOPLAM MALİYET</div><div class="kpi-val blue">${App.fmtTL(sonuc.toplam)}</div></div>
          <div class="kpi"><div class="kpi-lbl">ÖNERİLEN LİSTE FİYATI</div><div class="kpi-val green">${App.fmtTL(listeFiyati)}</div></div>
        </div>
        ${sonuc.eksikKalemler.length ? `<div class="fhint" style="color:var(--red-text);margin-bottom:10px">⚠ ${sonuc.eksikKalemler.length} kalemin maliyeti hesaplanamadı, toplam eksik olabilir.</div>` : ''}
        ${(() => {
          // Hacim ve ağırlık maliyet ekranında da görünür — navlun ve birim
          // başına taşıma maliyeti değerlendirmesi buradan yapılır.
          const ozet = tip === 'urun' ? App.urunPaketOzeti(kart.id, receteler, paketler, 1) : null;
          const coz = App.olcuAgirlikCoz(kart, ozet, 1);
          if (coz.kaynak === 'yok') return '';
          const h = App.olculerdenHacim(coz.en, coz.boy, coz.yukseklik);
          const desi = coz.desi || h.desi;
          // m³ başına maliyet, konteyner/araç doluluk kararında kullanılır
          const m3Maliyet = coz.m3 ? sonuc.toplam / coz.m3 : 0;
          const kgMaliyet = coz.brutKg ? sonuc.toplam / coz.brutKg : 0;
          return `
            <div class="hr"></div>
            <div class="flex-gap" style="align-items:center;gap:6px;margin-bottom:8px">
              <span class="flbl" style="margin:0">Hacim ve Ağırlık</span>${App.olcuKaynakRozeti(coz)}
            </div>
            <div class="grid grid-4" style="margin-bottom:6px">
              <div class="kpi"><div class="kpi-lbl">Hacim</div><div class="kpi-val">${coz.m3 ? App.fmt(coz.m3, 4) + ' m³' : '—'}</div></div>
              <div class="kpi"><div class="kpi-lbl">Brüt Ağırlık</div><div class="kpi-val">${coz.brutKg ? App.fmt(coz.brutKg, 2) + ' kg' : '—'}</div></div>
              <div class="kpi"><div class="kpi-lbl">Maliyet / m³</div><div class="kpi-val">${m3Maliyet ? App.fmtTL(m3Maliyet) : '—'}</div></div>
              <div class="kpi"><div class="kpi-lbl">Maliyet / kg</div><div class="kpi-val">${kgMaliyet ? App.fmtTL(kgMaliyet) : '—'}</div></div>
            </div>
            <div class="muted" style="font-size:11px">
              ${(coz.en && coz.boy && coz.yukseklik) ? `Ölçü: ${App.fmt(coz.en, 0)}×${App.fmt(coz.boy, 0)}×${App.fmt(coz.yukseklik, 0)} cm · ` : ''}
              ${desi ? `Desi: ${App.fmt(desi, 2)} · ` : ''}
              ${coz.netKg ? `Net: ${App.fmt(coz.netKg, 2)} kg` : ''}
              ${coz.paketSayisi ? ` · Koli: ${App.fmt(coz.paketSayisi, 0)}` : ''}
            </div>`;
        })()}

        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">İskonto Girerek Kârlılık Hesapla</div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Satır İskontosu (en fazla %50)</label><input class="finput" id="kt-satir-isk" type="number" min="0" max="50" step="0.5" value="${satirIsk}"></div>
          <div class="fgroup"><label class="flbl">Dip (Genel) İskontosu (en fazla %10)</label><input class="finput" id="kt-dip-isk" type="number" min="0" max="10" step="0.5" value="${dipIsk}"></div>
        </div>
        <table class="dtable" style="margin-top:8px">
          <tr><td>Liste Fiyatı</td><td class="r">${App.fmtTL(listeFiyati)}</td></tr>
          <tr><td>Satır İskontosu Sonrası</td><td class="r">${App.fmtTL(ik.satirSonrasiFiyat)}</td></tr>
          <tr class="total-row"><td>SON İSKONTOLU FİYAT</td><td class="r">${App.fmtTL(ik.sonIskontoluFiyat)}</td></tr>
          <tr><td>Maliyet × (1+GYG%${ayarlar.fiyatGygYuzde ?? 10}) × (1+Nakliye%${ayarlar.fiyatNakliyeYuzde ?? 7})</td><td class="r">${App.fmtTL(ik.maliyetGygNakliyeli)}</td></tr>
          <tr><td><b>Fark (Son İskontolu Fiyat − Maliyet+GYG+Nakliye)</b></td><td class="r"><b style="color:${ik.fark >= 0 ? 'var(--green-text)' : 'var(--red-text)'}">${App.fmtTL(ik.fark)}</b></td></tr>
          <tr class="total-row"><td>KÂRLILIK ORANI</td><td class="r" style="color:${ik.karlilikOrani >= 0 ? 'var(--green-text)' : 'var(--red-text)'}">${App.fmtPct(ik.karlilikOrani)}</td></tr>
        </table>
      `;
      document.getElementById('kt-satir-isk').onchange = (e) => { satirIsk = Math.min(Math.max(parseFloat(e.target.value) || 0, 0), 50); kart._son_satirIsk = satirIsk; ciz(); };
      document.getElementById('kt-dip-isk').onchange = (e) => { dipIsk = Math.min(Math.max(parseFloat(e.target.value) || 0, 0), 10); kart._son_dipIsk = dipIsk; ciz(); };
    }
    ciz();
  }

  // "Satıra Kalem Ekle" tıklanınca Kalem Seçici sayfası açılır — yarımamül,
  // mamül, hammadde, hırdavat seçenekleri ile. Seçici içinde "+ Yeni Kart
  // Ekle" seçeneği de sunulur (sistemde henüz olmayan bir kart girilirse
  // otomatik oluşturulup hem ilgili koleksiyona hem bu reçeteye eklenir).
  async function openKalemEkleSecici(kart, tip, recete, main, onTamamlandi) {
    const [urunler, yarimamuller, altMontajlar, hammaddeler, paketler] = await Promise.all([
      Store.urunler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(), Store.hammaddeler.all(), Store.paketler.all()
    ]);
    // Kendi kendine referans / döngüsel reçeteyi önlemek için: aynı tipte
    // düzenleniyorsa kendisini seçenek listesine koymuyoruz. Kenar bandı
    // tipi hammaddeler ana listede GÖRÜNMEZ — sadece plaka seçilince açılan
    // ölçü formunda kenar bandı olarak seçilebilirler (ayrı bir reçete
    // kalemi değildirler, plakanın bir özelliğidir).
    const secenekler = [
      ...urunler.filter(u => !(tip === 'urun' && u.id === kart.id)).map(u => ({ grup: 'urun', kod: u.kod, ad: u.ad, netFiyat: 0, birim: 'ADET', _id: u.id })),
      ...yarimamuller.filter(y => !(tip === 'yarimamul' && y.id === kart.id)).map(y => ({ grup: 'yarimamul', kod: y.kod, ad: y.ad, netFiyat: 0, birim: 'ADET', _id: y.id })),
      ...altMontajlar.filter(a => !(tip === 'altmontaj' && a.id === kart.id)).map(a => ({ grup: 'altmontaj', kod: a.kod, ad: a.ad, netFiyat: 0, birim: 'ADET', _id: a.id })),
      ...paketler.filter(p => !(tip === 'paket' && p.id === kart.id)).map(p => ({ grup: 'paket', kod: p.kod, ad: p.ad, netFiyat: 0, birim: 'ADET', _id: p.id })),
      ...hammaddeler.filter(h => h.tip !== 'kenar_bandi').map(h => ({ grup: h.tip === 'plaka' ? 'hammadde' : 'hirdavat', kod: h.stokKodu || h.id, ad: h.ad, netFiyat: App.toTRY(h.birimFiyat, h.dvz, App.state.ayarlar), birim: h.birim, _id: h.id }))
    ];
    // onTamamlandi verilmişse (sihirbaz içinden çağrılmışsa), "geri dön"
    // normal Reçete Yap ekranına gitmez — sihirbaza geri döner. Bu kartın
    // reçete ekranı, sihirbazın akışı İÇİNDE bir ara durak gibi davranır.
    const donusFn = onTamamlandi
      ? () => onTamamlandi()
      : () => { App.goTo('kartlar'); detayKartId = { id: kart.id, tip }; render(main); };
    App.goTo('kalem_secici', {
      baslik: 'Reçeteye Kalem Ekle: ' + kart.kod,
      secenekler,
      gruplar: { urun: 'Bitmiş Ürünler', yarimamul: 'Yarı Mamüller', altmontaj: 'Alt Montajlar', paket: 'Paketler', hammadde: 'Hammadde (Plaka)', hirdavat: 'Hırdavat' },
      yeniKartEklenebilir: true,
      geriDon: donusFn,
      onSecildi: (secim) => {
        if (onTamamlandi) {
          // Sihirbaz akışında: kalemi DOĞRUDAN bu kartın reçetesine ekleyip
          // tekrar aynı kalem ekleme ekranına dönülür (kullanıcı birden
          // fazla kalem ekleyebilsin), bitirince "Tamam" ile sihirbaza döner.
          openMiktarBirimForm(kart, tip, recete, secim, () => openKalemEkleSecici(kart, tip, recete, main, onTamamlandi));
        } else {
          App.goTo('kartlar'); detayKartId = { id: kart.id, tip }; render(main);
          setTimeout(() => openMiktarBirimForm(kart, tip, recete, secim, () => render(main)), 0);
        }
      },
      onYeniKartIstendi: (yeniKartBilgisi) => {
        if (onTamamlandi) {
          openYeniKartVeMiktarForm(kart, tip, recete, yeniKartBilgisi, () => openKalemEkleSecici(kart, tip, recete, main, onTamamlandi));
        } else {
          App.goTo('kartlar'); detayKartId = { id: kart.id, tip }; render(main);
          setTimeout(() => openYeniKartVeMiktarForm(kart, tip, recete, yeniKartBilgisi, () => render(main)), 0);
        }
      },
      ekstraButon: onTamamlandi ? { etiket: '✓ Tamam, Sihirbaza Dön', onClick: onTamamlandi } : null
    });
  }

  // Kalem Seçici'den bir kart seçildiğinde, reçeteye eklenecek miktar/birim
  // sorulur. Eğer seçilen kalem PLAKA tipi bir hammaddeyse (sunta/MDF gibi),
  // ayrıca adet + en/boy (kaba ve net) ölçüleri ve 4 kenar (ön/arka/sağ/sol)
  // için kenar bandı seçimi de istenir. Seçilen her kenar bandının maliyeti
  // (net ölçü + 50mm) × metre fiyatı ile hesaplanır ve malzeme ihtiyaç
  // listesine (sipariş onayı sırasında) otomatik yansır.
  async function openMiktarBirimForm(kart, tip, recete, secim, onSaved) {
    const kalemTip = secim.grup === 'urun' ? 'urun' : (secim.grup === 'yarimamul' ? 'yarimamul' : (secim.grup === 'altmontaj' ? 'altmontaj' : (secim.grup === 'paket' ? 'paket' : 'hammadde')));
    const hammaddeler = await Store.hammaddeler.all();
    const _onceki_hammaddeler = new Set(hammaddeler.map(x => x && x.id));
    const secilenHm = kalemTip === 'hammadde' ? hammaddeler.find(h => h.id === secim._id) : null;
    const isPlaka = secilenHm && secilenHm.tip === 'plaka';
    const kenarBantlari = hammaddeler.filter(h => h.tip === 'kenar_bandi');

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b class="mono">${App.escapeHtml(secim.kod)}</b> — ${App.escapeHtml(secim.ad)}</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Miktar${isPlaka ? ' (Adet)' : ''}</label><input class="finput" id="mb-miktar" type="number" value="1" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Birim</label>
          <select class="fselect" id="mb-birim">
            <option value="ADET" ${secim.birim === 'ADET' ? 'selected' : ''}>ADET</option>
            <option value="M2" ${secim.birim === 'M2' ? 'selected' : ''}>M2</option>
            <option value="METRE" ${secim.birim === 'METRE' ? 'selected' : ''}>METRE</option>
            <option value="KG" ${secim.birim === 'KG' ? 'selected' : ''}>KG</option>
          </select>
        </div>
      </div>
      ${isPlaka ? `
        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">Ölçü Bilgisi (mm)</div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Kaba En</label><input class="finput" id="mb-kaba-en" type="number" step="1"></div>
          <div class="fgroup"><label class="flbl">Kaba Boy</label><input class="finput" id="mb-kaba-boy" type="number" step="1"></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Net En</label><input class="finput" id="mb-net-en" type="number" step="1"></div>
          <div class="fgroup"><label class="flbl">Net Boy</label><input class="finput" id="mb-net-boy" type="number" step="1"></div>
        </div>
        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">Kenar Bandı (Net Ölçü + 50mm Üzerinden Hesaplanır)</div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Ön Kenar (Net Boy)</label>
            <select class="fselect" id="mb-bant-on">
              <option value="">— Bantsız —</option>
              ${kenarBantlari.map(b => `<option value="${b.id}">${App.escapeHtml(b.ad)}</option>`).join('')}
            </select>
          </div>
          <div class="fgroup"><label class="flbl">Arka Kenar (Net Boy)</label>
            <select class="fselect" id="mb-bant-arka">
              <option value="">— Bantsız —</option>
              ${kenarBantlari.map(b => `<option value="${b.id}">${App.escapeHtml(b.ad)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Sağ Kenar (Net En)</label>
            <select class="fselect" id="mb-bant-sag">
              <option value="">— Bantsız —</option>
              ${kenarBantlari.map(b => `<option value="${b.id}">${App.escapeHtml(b.ad)}</option>`).join('')}
            </select>
          </div>
          <div class="fgroup"><label class="flbl">Sol Kenar (Net En)</label>
            <select class="fselect" id="mb-bant-sol">
              <option value="">— Bantsız —</option>
              ${kenarBantlari.map(b => `<option value="${b.id}">${App.escapeHtml(b.ad)}</option>`).join('')}
            </select>
          </div>
        </div>
        ${!kenarBantlari.length ? `<div class="fhint" style="color:var(--amber-text)">⚠ Henüz kenar bandı tanımlanmamış. Hammaddeler sayfasından "Kenar Bandı (metre bazlı)" tipinde kart oluşturabilirsiniz.</div>` : ''}
      ` : ''}
    `;
    const footer = `<button class="btn" id="mb-cancel">Vazgeç</button><button class="btn btn-blue" id="mb-save">Reçeteye Ekle</button>`;
    App.openModal({ title: 'Miktar Girin', sub: kart.kod, body, footer, wide: isPlaka });
    document.getElementById('mb-cancel').onclick = App.closeModal;
    document.getElementById('mb-save').onclick = async () => {
      const miktar = parseFloat(document.getElementById('mb-miktar').value);
      if (!miktar) { App.toast('Miktar zorunlu', 'err'); return; }
      const yeniKalem = { tip: kalemTip, refId: secim._id, miktar, birim: document.getElementById('mb-birim').value };
      if (isPlaka) {
        yeniKalem.olcu = {
          kabaEn: parseFloat(document.getElementById('mb-kaba-en').value) || null,
          kabaBoy: parseFloat(document.getElementById('mb-kaba-boy').value) || null,
          netEn: parseFloat(document.getElementById('mb-net-en').value) || null,
          netBoy: parseFloat(document.getElementById('mb-net-boy').value) || null
        };
        yeniKalem.kenarBantlari = {
          on: document.getElementById('mb-bant-on').value || null,
          arka: document.getElementById('mb-bant-arka').value || null,
          sag: document.getElementById('mb-bant-sag').value || null,
          sol: document.getElementById('mb-bant-sol').value || null
        };
      }
      await kalemiReceteyeEkle(kart, tip, recete, yeniKalem);
      App.toast('Kalem reçeteye eklendi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // Kalem Seçici'de "+ Yeni Kart Ekle" ile sistemde olmayan bir kart girilince:
  // önce kartı ilgili koleksiyona (urunler/yarimamuller/hammaddeler) gerçekten
  // oluşturur, ardından miktar sorup reçeteye ekler.
  async function openYeniKartVeMiktarForm(kart, tip, recete, yeniKartBilgisi, onSaved) {
    const kategoriler = await Store.hammaddeKategorileriGetir();
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Bu kart sistemde bulunamadı, yeni olarak oluşturulacak.</div>
      <div class="fgroup"><label class="flbl">Kart Tipi</label>
        <select class="fselect" id="yk-tip">
          <option value="urun">Bitmiş Ürün</option>
          <option value="yarimamul">Yarı Mamül</option>
          <option value="altmontaj">Alt Montaj</option>
          <option value="paket">📦 Paket (sevkiyat/koli takibi — sanal, MRP'ye girmez)</option>
          <option value="hirdavat">Hırdavat (Hammadde)</option>
          <option value="diger">Diğer (Yeni Hammadde Kategorisi)</option>
        </select>
      </div>
      <div id="yk-kategori-wrap" style="display:none">
        <div class="fgroup"><label class="flbl">Kategori Adı (örn. Yedek Parça, Sarf Malzemesi)</label>
          <input class="finput" id="yk-kategori" list="yk-kategori-list" placeholder="Mevcut kategoriden seçin veya yeni yazın">
          <datalist id="yk-kategori-list">${kategoriler.map(k => `<option value="${App.escapeHtml(k)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kod</label><input class="finput" id="yk-kod" value="${App.escapeHtml(yeniKartBilgisi.kod || '')}"></div>
        <div class="fgroup"><label class="flbl">Ad</label><input class="finput" id="yk-ad" value="${App.escapeHtml(yeniKartBilgisi.ad || '')}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Miktar (bu reçetede)</label><input class="finput" id="yk-miktar" type="number" value="1" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Birim</label>
          <select class="fselect" id="yk-birim">
            <option value="ADET">ADET</option><option value="M2">M2</option><option value="METRE">METRE</option><option value="KG">KG</option>
          </select>
        </div>
      </div>
    `;
    const footer = `<button class="btn" id="yk-cancel">Vazgeç</button><button class="btn btn-green" id="yk-save">Kartı Oluştur ve Reçeteye Ekle</button>`;
    App.openModal({ title: 'Yeni Kart Oluştur', body, footer, wide: true });
    document.getElementById('yk-cancel').onclick = App.closeModal;
    const tipSelect = document.getElementById('yk-tip');
    tipSelect.onchange = () => { document.getElementById('yk-kategori-wrap').style.display = tipSelect.value === 'diger' ? 'block' : 'none'; };

    document.getElementById('yk-save').onclick = async () => {
      const yeniTip = tipSelect.value;
      const kod = document.getElementById('yk-kod').value.trim();
      const ad = document.getElementById('yk-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      const miktar = parseFloat(document.getElementById('yk-miktar').value) || 1;
      const birim = document.getElementById('yk-birim').value;

      // Yarımamül, Alt Montaj veya Paket oluşturulduğunda: kart kaydedilir,
      // reçeteye kalem olarak eklenir, ve HEMEN ARDINDAN kullanıcı isteği
      // gereği o kartın KENDİ reçete ekranı (Satıra Kalem Ekle) otomatik açılır.
      if (yeniTip === 'yarimamul' || yeniTip === 'altmontaj' || yeniTip === 'paket') {
        let yeniKartId;
        if (yeniTip === 'yarimamul') {
          const yarimamuller = await Store.yarimamuller.all();
    const _onceki_yarimamuller = new Set(yarimamuller.map(x => x && x.id));
          const yeniYm = { id: App.uid('YM'), kod, ad, hammaddeId: null, rotaId: null, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
          yarimamuller.push(yeniYm);
          await App.persist(() => parcaliKaydet('yarimamuller', yarimamuller, _onceki_yarimamuller));
          yeniKartId = yeniYm.id;
        } else if (yeniTip === 'altmontaj') {
          const altMontajlar = await Store.altMontajlar.all();
    const _onceki_altMontajlar = new Set(altMontajlar.map(x => x && x.id));
          const yeniAm = { id: App.uid('AM'), kod, ad, aciklama: '', rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
          altMontajlar.push(yeniAm);
          await App.persist(() => parcaliKaydet('altMontajlar', altMontajlar, _onceki_altMontajlar));
          yeniKartId = yeniAm.id;
        } else {
          const paketler = await Store.paketler.all();
    const _onceki_paketler = new Set(paketler.map(x => x && x.id));
          const yeniPkt = { id: App.uid('PKT'), kod, ad, aciklama: '', ambalajTipi: 'Koli', koliIciAdet: 1, rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
          paketler.push(yeniPkt);
          await App.persist(() => parcaliKaydet('paketler', paketler, _onceki_paketler));
          yeniKartId = yeniPkt.id;
        }
        await kalemiReceteyeEkle(kart, tip, recete, { tip: yeniTip, refId: yeniKartId, miktar, birim });
        App.closeModal();
        App.toast('Kart oluşturuldu. Şimdi bu kartın kendi reçetesini girebilirsiniz.', 'ok');
        const sahteKart = { id: yeniKartId, kod, ad };
        openKalemEkleSecici(sahteKart, yeniTip, null, document.getElementById('main'), onSaved);
        return;
      }

      // Hırdavat / Diğer (yeni kategori) — doğrudan hammaddeler koleksiyonuna eklenir
      const hammaddeler = await Store.hammaddeler.all();
    const _onceki_hammaddeler = new Set(hammaddeler.map(x => x && x.id));
      let kategori = 'Hırdavat';
      if (yeniTip === 'diger') {
        kategori = (document.getElementById('yk-kategori').value || '').trim() || 'Diğer';
        if (!kategoriler.includes(kategori)) { kategoriler.push(kategori); await Store.hammaddeKategorileriKaydet(kategoriler); }
      }
      const yeniHm = { id: App.uid('HM'), tip: 'hirdavat', kategori, stokKodu: kod, ad, birim, fireYuzde: 0, birimFiyat: 0, dvz: 'TL', kdvOraniYuzde: 18 };
      hammaddeler.push(yeniHm);
      await App.persist(() => parcaliKaydet('hammaddeler', hammaddeler, _onceki_hammaddeler));
      await kalemiReceteyeEkle(kart, tip, recete, { tip: 'hammadde', refId: yeniHm.id, miktar, birim });
      App.toast(`Yeni kart oluşturuldu (${kod}) ve reçeteye eklendi`, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // Bir kalemi (hammadde/hırdavat/yarımamül/alt montaj/mamül) verilen karta
  // ait reçeteye ekler. Reçete henüz yoksa (ürün/yarımamül/alt montaj için
  // ilk kalem ekleniyorsa) otomatik oluşturulur — ürün için urunId, yarımamül
  // için yarimamulId, alt montaj için altMontajId ile.
  async function kalemiReceteyeEkle(kart, tip, recete, yeniKalem) {
    let r = recete;
    if (!r) {
      r = tip === 'urun' ? { id: 'RC-' + kart.kod, urunId: kart.id, ad: kart.ad + ' Reçetesi', kalemler: [] }
        : tip === 'yarimamul' ? { id: 'RC-YM-' + kart.kod, yarimamulId: kart.id, ad: kart.ad + ' Reçetesi', kalemler: [] }
        : tip === 'altmontaj' ? { id: 'RC-AM-' + kart.kod, altMontajId: kart.id, ad: kart.ad + ' Reçetesi', kalemler: [] }
        : { id: 'RC-PKT-' + kart.kod, paketId: kart.id, ad: kart.ad + ' Reçetesi', kalemler: [] };
    }
    r.kalemler.push(yeniKalem);
    await App.persist(() => Store.receteler.upsert(r));
    return r;
  }

  function wireBomEditing(bomEl, recete, yarimamuller, urunler, hammaddeler, altMontajlar, onChanged, main, paketler) {
    bomEl.querySelectorAll('.bom-yukari').forEach(b => b.onclick = async () => {
      const i = parseInt(b.dataset.i);
      if (i <= 0) return;
      [recete.kalemler[i - 1], recete.kalemler[i]] = [recete.kalemler[i], recete.kalemler[i - 1]];
      await App.persist(() => Store.receteler.upsert(recete));
      App.toast('Satır yukarı taşındı', 'ok');
      onChanged();
    });
    bomEl.querySelectorAll('.bom-asagi').forEach(b => b.onclick = async () => {
      const i = parseInt(b.dataset.i);
      if (i >= recete.kalemler.length - 1) return;
      [recete.kalemler[i], recete.kalemler[i + 1]] = [recete.kalemler[i + 1], recete.kalemler[i]];
      await App.persist(() => Store.receteler.upsert(recete));
      App.toast('Satır aşağı taşındı', 'ok');
      onChanged();
    });
    bomEl.querySelectorAll('.bom-birim-select').forEach(sel => sel.onchange = async () => {
      const i = parseInt(sel.dataset.i);
      recete.kalemler[i].birim = sel.value;
      await App.persist(() => Store.receteler.upsert(recete));
      App.toast('Birim güncellendi', 'ok');
    });
    bomEl.querySelectorAll('.bom-miktar-input').forEach(inp => {
      const commit = async () => {
        const i = parseInt(inp.dataset.i);
        const yeni = parseFloat(inp.value);
        if (isNaN(yeni) || yeni <= 0) { App.toast('Geçerli bir miktar girin', 'err'); return; }
        recete.kalemler[i].miktar = yeni;
        await App.persist(() => Store.receteler.upsert(recete));
        App.toast('Reçete miktarı güncellendi', 'ok');
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); commit(); } };
      inp.onblur = commit;
    });
    bomEl.querySelectorAll('.bom-del-kalem').forEach(b => b.onclick = async () => {
      const i = parseInt(b.dataset.i);
      App.confirmDialog('Bu reçete kalemini silmek istediğinize emin misiniz?', async () => {
        recete.kalemler.splice(i, 1);
        await App.persist(() => Store.receteler.upsert(recete));
        App.toast('Kalem silindi', 'ok');
        onChanged();
      });
    });
    bomEl.querySelectorAll('.bom-nerede-kullanilir').forEach(b => b.onclick = async () => {
      const i = parseInt(b.dataset.i);
      const kalem = recete.kalemler[i];
      await openNeredeKullaniliyorModal(kalem, yarimamuller, urunler, hammaddeler, altMontajlar, paketler);
    });
  }

  // Bir kartın hangi reçete(ler)de kullanıldığını listeleyen modal.
  async function openNeredeKullaniliyorModal(kalem, yarimamuller, urunler, hammaddeler, altMontajlar, paketler) {
    let kartAdi = '';
    if (kalem.tip === 'urun') { const u = urunler.find(x => x.id === kalem.refId); kartAdi = u ? u.kod + ' — ' + u.ad : kalem.refId; }
    else if (kalem.tip === 'yarimamul') { const y = yarimamuller.find(x => x.id === kalem.refId); kartAdi = y ? y.kod + ' — ' + y.ad : kalem.refId; }
    else if (kalem.tip === 'altmontaj') { const a = (altMontajlar || []).find(x => x.id === kalem.refId); kartAdi = a ? a.kod + ' — ' + a.ad : kalem.refId; }
    else if (kalem.tip === 'paket') { const p = (paketler || []).find(x => x.id === kalem.refId); kartAdi = p ? p.kod + ' — ' + p.ad : kalem.refId; }
    else { const h = hammaddeler.find(x => x.id === kalem.refId); kartAdi = h ? (h.stokKodu || h.ad) + ' — ' + h.ad : kalem.refId; }

    const tipLabelMap = { urun: 'Ürün', yarimamul: 'Yarı Mamül', altmontaj: 'Alt Montaj', paket: 'Paket' };
    const tipPillMap = { urun: 'pill-blue', yarimamul: 'pill-gray', altmontaj: 'pill-amber', paket: 'pill-green' };
    const kullanimYerleri = await App.kartNeredeKullaniliyor(kalem.tip, kalem.refId);
    const body = document.createElement('div');
    if (!kullanimYerleri.length) {
      body.innerHTML = `<div class="empty-state" style="padding:20px 6px"><div class="edesc">Bu kart başka hiçbir reçetede kullanılmıyor.</div></div>`;
    } else {
      body.innerHTML = `<table class="dtable"><tr><th>Tip</th><th>Kod</th><th>Ad</th><th class="r">Bu Reçetedeki Miktarı</th></tr>
        ${kullanimYerleri.map(k => `<tr><td><span class="pill ${tipPillMap[k.ustTip] || 'pill-gray'}">${tipLabelMap[k.ustTip] || k.ustTip}</span></td>
          <td class="mono">${App.escapeHtml(k.ustKod)}</td><td>${App.escapeHtml(k.ustAd)}</td>
          <td class="r">${App.fmt(k.miktar, 2)} ${App.escapeHtml(k.birim || '')}</td></tr>`).join('')}
      </table>`;
    }
    App.openModal({ title: 'Nerede Kullanılıyor', sub: kartAdi, body, footer: '<button class="btn" id="nk-close">Kapat</button>', wide: true });
    document.getElementById('nk-close').onclick = App.closeModal;
  }

  function renderSimpleBom(recete, yarimamuller, urunler, hammaddeler, altMontajlar, paketler) {
    const tipEtiket = { yarimamul: ['YM', 'pill-gray'], urun: ['ÜRÜN', 'pill-blue'], altmontaj: ['ALT MONTAJ', 'pill-amber'], paket: ['PAKET', 'pill-green'], hammadde: ['HM', 'pill-amber'] };
    const kenarEtiketleri = { on: 'Ön', arka: 'Arka', sag: 'Sağ', sol: 'Sol' };
    let html = `<div style="display:flex;flex-direction:column;gap:8px">`;
    recete.kalemler.forEach((k, i) => {
      let kod = k.refId, ad = '', hm = null;
      if (k.tip === 'yarimamul') { const y = yarimamuller.find(x => x.id === k.refId); if (y) { kod = y.kod; ad = y.ad; } }
      else if (k.tip === 'urun') { const u = urunler.find(x => x.id === k.refId); if (u) { kod = u.kod; ad = u.ad; } }
      else if (k.tip === 'altmontaj') { const a = (altMontajlar || []).find(x => x.id === k.refId); if (a) { kod = a.kod; ad = a.ad; } }
      else if (k.tip === 'paket') { const p = (paketler || []).find(x => x.id === k.refId); if (p) { kod = p.kod; ad = p.ad; } }
      else { hm = hammaddeler.find(x => x.id === k.refId); if (hm) { kod = hm.stokKodu || hm.id; ad = hm.ad; } }
      const [etiket, renk] = tipEtiket[k.tip] || ['?', 'pill-gray'];
      html += `<div style="padding:8px 10px;background:var(--bg);border-radius:8px">
        <div class="flex-gap">
          <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
            <button class="btn btn-icon btn-ghost bom-yukari" data-i="${i}" title="Yukarı Taşı" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>▲</button>
            <button class="btn btn-icon btn-ghost bom-asagi" data-i="${i}" title="Aşağı Taşı" ${i === recete.kalemler.length - 1 ? 'disabled style="opacity:.3"' : ''}>▼</button>
          </div>
          <span class="pill ${renk}" style="font-size:9.5px">${etiket}</span>
          <div style="flex:1;font-size:12px"><b class="mono">${App.escapeHtml(kod)}</b> — ${App.escapeHtml(ad)}</div>
          <input class="finput bom-miktar-input" data-i="${i}" type="number" step="0.01" value="${k.miktar}" style="width:70px;text-align:right;font-size:11px;padding:4px 6px">
          <select class="fselect bom-birim-select" data-i="${i}" style="width:78px;font-size:11px;padding:4px 4px">
            ${['ADET','M2','METRE','KG','GRAM','LITRE'].map(u => `<option value="${u}" ${k.birim === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-ghost bom-nerede-kullanilir" data-i="${i}" title="Bu kart nerede kullanılıyor?">📍 Nerede Kullanılıyor</button>
          <button class="btn btn-icon btn-ghost bom-del-kalem" data-i="${i}" style="color:var(--red-text)">&times;</button>
        </div>
        ${hm && hm.tip === 'plaka' && k.olcu ? `
          <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);font-size:10.5px;color:var(--text3);display:flex;gap:14px;flex-wrap:wrap">
            <span>Kaba: ${k.olcu.kabaEn || '—'}×${k.olcu.kabaBoy || '—'} mm</span>
            <span>Net: ${k.olcu.netEn || '—'}×${k.olcu.netBoy || '—'} mm</span>
            ${k.kenarBantlari ? Object.entries(k.kenarBantlari).filter(([, v]) => v).map(([kenar, bantId]) => {
              const bant = hammaddeler.find(x => x.id === bantId);
              return `<span>${kenarEtiketleri[kenar]} Bant: ${bant ? App.escapeHtml(bant.ad) : '—'}</span>`;
            }).join('') : ''}
          </div>
        ` : ''}
      </div>`;
    });
    html += `</div>`;
    return html;
  }


  // RDM ham hiyerarşisini (sv seviyeli R/S kayıtları) ağaç olarak render eder
  function renderRdmHiyerarsi(rows) {
    let html = `<div style="max-height:480px;overflow-y:auto;display:flex;flex-direction:column;gap:3px">`;
    rows.forEach(r => {
      const indent = (r.sv || 0) * 18;
      const isR = r.tip === 'R';
      const dvzSym = r.dvz === '€' ? '€' : r.dvz === '$' ? '$' : '₺';
      html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-left:${indent}px;border-left:${r.sv > 0 ? '2px solid var(--border)' : 'none'}">
        <span class="${isR ? 'tag-r' : 'tag-s'}">${isR ? 'R' : 'S'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11.5px;${isR ? 'font-weight:700' : ''}" class="mono">${App.escapeHtml(r.kod.trim())}</div>
          <div style="font-size:11px;color:var(--text2)">${App.escapeHtml(r.ad.trim())}${r.olcu ? ` · ${r.olcu}` : ''}</div>
        </div>
        <div style="text-align:right;font-size:10.5px;color:var(--text3);flex-shrink:0">
          ${r.miktar} ${r.birim}<br>${dvzSym}${App.fmt(r.toplamFiyat, 2)}
        </div>
      </div>`;
    });
    html += `</div>`;
    return html;
  }

  async function openForm(item, onSaved) {
    const isEdit = !!item;
    const d = item || { gorseller: [] };
    let gorseller = [...(d.gorseller || [])];
    const rotalar = await Store.rotalar.all();
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Ürün Kodu</label><input class="finput" id="f-kod" value="${App.escapeHtml(d.kod || '')}"></div>
        <div class="fgroup"><label class="flbl">Ürün Adı</label><input class="finput" id="f-ad" value="${App.escapeHtml(d.ad || '')}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="f-aciklama">${App.escapeHtml(d.aciklama || '')}</textarea></div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Rota, Amortisman ve GYG (Maliyete Eklenir)</div>
      <div class="fgroup"><label class="flbl">Üretim Rotası</label>
        <div class="flex-gap" style="gap:6px">
          <select class="fselect" id="f-rota" style="flex:1">
            <option value="">— Rota Yok —</option>
            ${rotalar.map(r => `<option value="${r.id}" ${d.rotaId === r.id ? 'selected' : ''}>${App.escapeHtml(r.ad)} (${App.fmtTL(r.toplamMaliyet || 0)})</option>`).join('')}
          </select>
          <button type="button" class="btn btn-sm" id="f-yeni-rota">+ Yeni Rota</button>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Amortisman Gideri (₺, sabit rakam)</label><input class="finput" id="f-amortisman" type="number" step="0.01" value="${d.amortismanGideri || 0}"></div>
        <div class="fgroup"><label class="flbl">GYG Oranı (%, manuel — kalem+rota maliyetine uygulanır)</label><input class="finput" id="f-gyg" type="number" step="0.1" value="${d.gygOraniYuzde || 0}"></div>
      </div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Üretim Kapasitesi (Planlama) — boş/0 = sınırsız</div>
      <div class="fhint" style="margin-top:-4px;margin-bottom:8px">Bu üründen belirli bir dönemde en fazla kaç adet üretilebileceğini sınırlar. Üretim Çizelgesi'ndeki <b>🎯 Ürün Kapasitesi</b> sekmesinde bu limitle o dönemde PLANLANAN (siparişlerden gelen) adet karşılaştırılır.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Günlük Maks. Adet</label><input class="finput" id="f-kap-gunluk" type="number" min="0" value="${d.kapasiteGunlukMax || ''}"></div>
        <div class="fgroup"><label class="flbl">Haftalık Maks. Adet</label><input class="finput" id="f-kap-haftalik" type="number" min="0" value="${d.kapasiteHaftalikMax || ''}"></div>
        <div class="fgroup"><label class="flbl">Aylık Maks. Adet</label><input class="finput" id="f-kap-aylik" type="number" min="0" value="${d.kapasiteAylikMax || ''}"></div>
      </div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Ölçü, Hacim ve Ağırlık (Elle — Maliyet, Fiyat, Üretim ve Sevkiyat Ekranlarında Görünür)</div>
      <div class="fhint" style="margin-bottom:8px">Boş bırakırsanız reçetedeki paket kalemlerinden otomatik hesaplanır. Değer girerseniz o değer kullanılır.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">En (cm)</label><input class="finput urn-olcu" id="f-en" type="number" min="0" step="0.1" value="${d.en || ''}"></div>
        <div class="fgroup"><label class="flbl">Boy (cm)</label><input class="finput urn-olcu" id="f-boy" type="number" min="0" step="0.1" value="${d.boy || ''}"></div>
        <div class="fgroup"><label class="flbl">Yükseklik (cm)</label><input class="finput urn-olcu" id="f-yukseklik" type="number" min="0" step="0.1" value="${d.yukseklik || ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Net Ağırlık (kg)</label><input class="finput" id="f-netagirlik" type="number" min="0" step="0.01" value="${d.netAgirlik || ''}"></div>
        <div class="fgroup"><label class="flbl">Brüt Ağırlık (kg)</label><input class="finput" id="f-brutagirlik" type="number" min="0" step="0.01" value="${d.brutAgirlik || ''}"></div>
        <div class="fgroup"><label class="flbl">Hacim (otomatik)</label>
          <input class="finput" id="f-hacim" readonly style="background:var(--bg)" value="">
          <div class="fhint" id="f-hacim-bilgi"></div>
        </div>
      </div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Ürün Görselleri</div>
      <input type="file" id="f-file" accept="image/*,.pdf" multiple style="margin-bottom:10px">
      <div id="f-gorsel-list" style="display:flex;flex-wrap:wrap;gap:10px"></div>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = `
      ${isEdit ? '<button class="btn btn-red" id="f-del" style="margin-right:auto">Sil</button>' : ''}
      <button class="btn" id="f-cancel">Vazgeç</button>
      <button class="btn btn-blue" id="f-save">${isEdit ? 'Güncelle' : 'Kaydet'}</button>
    `;
    App.openModal({ title: isEdit ? 'Ürün Kartını Düzenle' : 'Yeni Ürün Kartı', body, footer, wide: true });

    function renderGorselList() {
      const wrap = document.getElementById('f-gorsel-list');
      if (!gorseller.length) { wrap.innerHTML = `<div class="muted" style="font-size:11px">Henüz görsel yüklenmedi.</div>`; return; }
      wrap.innerHTML = gorseller.map((g, i) => `
        <div style="position:relative">
          <div class="thumb" style="width:64px;height:64px">${QrDosya.gorselMi(g) ? `<img src="${QrDosya.gorselUrl(g)}" loading="lazy">` : '📄'}</div>
          <button class="modal-x" data-i="${i}" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;font-size:10px;background:var(--red-bg);color:var(--red-text)">&times;</button>
        </div>`).join('');
      wrap.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { gorseller.splice(parseInt(b.dataset.i), 1); renderGorselList(); });
    }
    renderGorselList();
    // Ölçü girildikçe hacmi canlı göster — App.olculerdenHacim tek kaynaktır,
    // formül burada tekrar yazılmaz.
    const urnHacimHesapla = () => {
      const h = App.olculerdenHacim(
        document.getElementById('f-en').value,
        document.getElementById('f-boy').value,
        document.getElementById('f-yukseklik').value);
      const el = document.getElementById('f-hacim');
      const bilgi = document.getElementById('f-hacim-bilgi');
      if (h.gecerli) {
        el.value = App.fmt(h.m3, 4) + ' m³';
        bilgi.textContent = App.fmt(h.desi, 2) + ' desi';
      } else {
        el.value = '';
        bilgi.textContent = 'En, boy ve yükseklik girilince hesaplanır';
      }
    };
    body.querySelectorAll('.urn-olcu').forEach(i => i.oninput = urnHacimHesapla);
    urnHacimHesapla();
    document.getElementById('f-file').onchange = async (e) => {
      for (const f of Array.from(e.target.files || [])) {
        try { gorseller.push({ name: f.name, dataUrl: await App.fileToDataUrl(f) }); } catch (err) {}
      }
      renderGorselList();
      e.target.value = '';
    };
    if (isEdit) document.getElementById('f-del').onclick = () => {
      App.confirmDialog(`"${d.ad}" ürün kartını silmek istediğinize emin misiniz?`, async () => {
        await App.persist(() => Store.urunler.remove(d.id));
        App.toast('Ürün kartı silindi', 'ok');
        detayKartId = null;
        onSaved();
      });
    };
    document.getElementById('f-cancel').onclick = App.closeModal;
    document.getElementById('f-yeni-rota').onclick = () => {
      const guncelD = { ...d, kod: document.getElementById('f-kod').value, ad: document.getElementById('f-ad').value, aciklama: document.getElementById('f-aciklama').value, amortismanGideri: document.getElementById('f-amortisman').value, gygOraniYuzde: document.getElementById('f-gyg').value,
        kapasiteGunlukMax: document.getElementById('f-kap-gunluk').value, kapasiteHaftalikMax: document.getElementById('f-kap-haftalik').value, kapasiteAylikMax: document.getElementById('f-kap-aylik').value, gorseller };
      App.closeModal();
      PageModules.rota.openRotaEditorModal(null, (yeniRota) => {
        if (yeniRota) guncelD.rotaId = yeniRota.id;
        openForm(guncelD, onSaved);
      });
    };
    document.getElementById('f-save').onclick = async () => {
      const kod = document.getElementById('f-kod').value.trim();
      const ad = document.getElementById('f-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      const next = {
        id: d.id || App.uid('URN'),
        kod, ad, tip: 'bitmis_urun',
        aciklama: document.getElementById('f-aciklama').value.trim(),
        rotaId: document.getElementById('f-rota').value || null,
        amortismanGideri: parseFloat(document.getElementById('f-amortisman').value) || 0,
        gygOraniYuzde: parseFloat(document.getElementById('f-gyg').value) || 0,
        kapasiteGunlukMax: parseFloat(document.getElementById('f-kap-gunluk').value) || 0,
        kapasiteHaftalikMax: parseFloat(document.getElementById('f-kap-haftalik').value) || 0,
        kapasiteAylikMax: parseFloat(document.getElementById('f-kap-aylik').value) || 0,
        // Ölçü / hacim / ağırlık — elle girilir, boşsa reçeteden hesaplanır.
        // Birimler: cm ve kg. Hacim türetilmiş değerdir, SAKLANMAZ; her
        // gösterimde App.olculerdenHacim ile yeniden hesaplanır ki ölçü
        // değişince hacim asla eskimiş kalmasın.
        en: parseFloat(document.getElementById('f-en').value) || 0,
        boy: parseFloat(document.getElementById('f-boy').value) || 0,
        yukseklik: parseFloat(document.getElementById('f-yukseklik').value) || 0,
        netAgirlik: parseFloat(document.getElementById('f-netagirlik').value) || 0,
        brutAgirlik: parseFloat(document.getElementById('f-brutagirlik').value) || 0,
        gorseller,
        olusturmaTarihi: d.olusturmaTarihi || new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.urunler.upsert(next));
      // Formdan yüklenen teknik dosyaları QR dosya alanına aktar (telefondan
      // QR okutulunca görünmeleri için) — bkz. qr_dosya.js
      try {
        const aktarilan = await QrDosya.kartDosyalariniSunucuyaAktar('urun', next.id, next.kod, next.ad, gorseller);
        if (aktarilan) {
          await App.persist(() => Store.urunler.upsert(next));
          App.toast(aktarilan + ' dosya QR alanına aktarıldı', 'ok');
        }
      } catch (e) { console.error('QR dosya aktarımı:', e); }
      App.toast(isEdit ? 'Ürün kartı güncellendi' : 'Ürün kartı oluşturuldu', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // ── SIFIRDAN ÜRÜN SİHİRBAZI ─────────────────────────────────────────────
  // ARGE/Teknik Ofis tek akışta: 1) ürün bilgisi, 2) reçete kalemleri
  // (mevcut yarı mamülden seç VEYA yeni yarı mamül + hammadde oluştur),
  // 3) işçilik/rota ataması. Her adımda mevcut hammadde/yarımamül/rota
  // formları (openForm fonksiyonları) tekrar kullanılır.
  async function openWizard(main) {
    const wiz = {
      step: 1,
      urun: { kod: '', ad: '', aciklama: '' },
      kalemler: [] // { refId, miktar, birim }
    };
    renderWizardStep(main, wiz);
  }

  async function renderWizardStep(main, wiz) {
    if (wiz.step === 1) return renderWizardStep1(main, wiz);
    if (wiz.step === 2) return renderWizardStep2(main, wiz);
    if (wiz.step === 3) return renderWizardStep3(main, wiz);
  }

  function wizardProgress(step) {
    const adlar = ['Ürün Bilgisi', 'Reçete (Hammadde/Yarı Mamül)', 'İşçilik / Rota'];
    return `<div style="display:flex;gap:6px;margin-bottom:14px">
      ${adlar.map((a, i) => `<div style="flex:1;padding:7px 10px;border-radius:8px;font-size:11px;font-weight:700;text-align:center;background:${i + 1 === step ? 'var(--blue)' : i + 1 < step ? 'var(--green-bg)' : 'var(--bg)'};color:${i + 1 === step ? '#fff' : i + 1 < step ? 'var(--green-text)' : 'var(--text3)'}">${i + 1}. ${a}</div>`).join('')}
    </div>`;
  }

  function renderWizardStep1(main, wiz) {
    const body = document.createElement('div');
    body.innerHTML = `
      ${wizardProgress(1)}
      <div class="frow">
        <div class="fgroup"><label class="flbl">Ürün Kodu</label><input class="finput" id="wz-kod" value="${App.escapeHtml(wiz.urun.kod)}"></div>
        <div class="fgroup"><label class="flbl">Ürün Adı</label><input class="finput" id="wz-ad" value="${App.escapeHtml(wiz.urun.ad)}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="wz-aciklama">${App.escapeHtml(wiz.urun.aciklama)}</textarea></div>
      <div class="fhint">Sonraki adımda bu ürünün reçetesini (hammadde + yarı mamül kalemlerini) oluşturacaksınız.</div>
    `;
    const footer = `<button class="btn" id="wz-cancel">Vazgeç</button><button class="btn btn-blue" id="wz-next">İleri: Reçete &rarr;</button>`;
    App.openModal({ title: 'Sıfırdan Ürün Oluştur', sub: 'Adım 1/3', body, footer, wide: true });
    document.getElementById('wz-cancel').onclick = App.closeModal;
    document.getElementById('wz-next').onclick = () => {
      const kod = document.getElementById('wz-kod').value.trim();
      const ad = document.getElementById('wz-ad').value.trim();
      if (!kod || !ad) { App.toast('Ürün kodu ve adı zorunlu', 'err'); return; }
      wiz.urun.kod = kod; wiz.urun.ad = ad;
      wiz.urun.aciklama = document.getElementById('wz-aciklama').value.trim();
      wiz.step = 2;
      renderWizardStep(main, wiz);
    };
  }

  async function renderWizardStep2(main, wiz) {
    const [yarimamuller, altMontajlar, hammaddeler] = await Promise.all([Store.yarimamuller.all(), Store.altMontajlar.all(), Store.hammaddeler.all()]);
    const body = document.createElement('div');
    body.innerHTML = `
      ${wizardProgress(2)}
      <div class="flex-between" style="margin-bottom:10px">
        <div class="flbl" style="margin:0">Reçete Kalemleri</div>
        <button class="btn btn-sm btn-blue" id="wz-add-kalem">+ Satıra Kalem Ekle</button>
      </div>
      <div id="wz-kalem-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px"></div>
      <div class="fhint">Yarı Mamül, Alt Montaj, Hammadde, Hırdavat veya "Diğer" (kendi kategoriniz) kalemlerini ekleyebilirsiniz. Yeni bir yarı mamül/alt montaj oluşturursanız, hemen ardından onun kendi reçetesini girmeniz istenecektir.</div>
    `;
    const footer = `<button class="btn" id="wz-back">&larr; Geri</button><button class="btn" id="wz-cancel">Vazgeç</button><button class="btn btn-blue" id="wz-next">İleri: İşçilik &rarr;</button>`;
    App.openModal({ title: 'Sıfırdan Ürün Oluştur', sub: 'Adım 2/3 — ' + wiz.urun.kod, body, footer, wide: true });

    const tipEtiket = { yarimamul: ['YM', 'pill-gray'], altmontaj: ['ALT MONTAJ', 'pill-amber'], hammadde: ['HM', 'pill-blue'] };
    function kartBul(k) {
      if (k.tip === 'yarimamul') return yarimamuller.find(y => y.id === k.refId);
      if (k.tip === 'altmontaj') return altMontajlar.find(a => a.id === k.refId);
      return hammaddeler.find(h => h.id === k.refId);
    }
    function renderKalemList() {
      const wrap = document.getElementById('wz-kalem-list');
      if (!wiz.kalemler.length) { wrap.innerHTML = `<div class="empty-state" style="padding:14px 8px"><div class="edesc">Henüz reçete kalemi eklenmedi.</div></div>`; return; }
      wrap.innerHTML = wiz.kalemler.map((k, i) => {
        const kart = kartBul(k);
        const [etiket, renk] = tipEtiket[k.tip] || ['?', 'pill-gray'];
        return `<div class="flex-gap" style="padding:8px 10px;background:var(--bg);border-radius:8px">
          <span class="pill ${renk}" style="font-size:9.5px">${etiket}</span>
          <div style="flex:1;font-size:12px"><b>${kart ? App.escapeHtml(kart.kod || kart.stokKodu) : k.refId}</b> — ${kart ? App.escapeHtml(kart.ad) : ''}</div>
          <span class="mono" style="font-size:11px;color:var(--text3)">${k.miktar} ${k.birim}</span>
          <button class="btn btn-icon btn-ghost wz-del-kalem" data-i="${i}" style="color:var(--red-text)">&times;</button>
        </div>`;
      }).join('');
      wrap.querySelectorAll('.wz-del-kalem').forEach(b => b.onclick = () => { wiz.kalemler.splice(parseInt(b.dataset.i), 1); renderKalemList(); });
    }
    renderKalemList();

    document.getElementById('wz-back').onclick = () => { wiz.step = 1; renderWizardStep(main, wiz); };
    document.getElementById('wz-cancel').onclick = App.closeModal;
    document.getElementById('wz-next').onclick = () => {
      if (!wiz.kalemler.length) { App.toast('En az 1 reçete kalemi eklemelisiniz', 'err'); return; }
      wiz.step = 3;
      renderWizardStep(main, wiz);
    };

    document.getElementById('wz-add-kalem').onclick = () => openWizardKalemSecici(main, wiz);
  }

  // Sihirbazın 2. adımında "+ Satıra Kalem Ekle" — Reçete Yap ekranındaki
  // aynı Kalem Seçici'yi kullanır: Yarı Mamül / Alt Montaj / Hammadde /
  // Hırdavat / kullanıcı tanımlı "Diğer" kategorileri (hammaddeKategorileri
  // listesinden) hepsi seçilebilir. "+ Yeni Kart Ekle" ile sistemde olmayan
  // bir kart girilirse GERÇEKTEN oluşturulur ve — yarı mamül/alt montaj ise —
  // hemen ardından kendi reçete ekranı (Reçete Yap'taki aynı akış) açılır.
  async function openWizardKalemSecici(main, wiz) {
    const [yarimamuller, altMontajlar, paketler, hammaddeler, kategoriler] = await Promise.all([
      Store.yarimamuller.all(), Store.altMontajlar.all(), Store.paketler.all(), Store.hammaddeler.all(), Store.hammaddeKategorileriGetir()
    ]);
    const hmGruplar = {};
    hammaddeler.forEach(h => {
      const kat = h.kategori || 'Diğer';
      const grupKey = 'hm_' + kat.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (!hmGruplar[grupKey]) hmGruplar[grupKey] = { ad: kat, kalemler: [] };
      hmGruplar[grupKey].kalemler.push(h);
    });

    const secenekler = [
      ...yarimamuller.map(y => ({ grup: 'yarimamul', kod: y.kod, ad: y.ad, netFiyat: 0, birim: 'ADET', _id: y.id })),
      ...altMontajlar.map(a => ({ grup: 'altmontaj', kod: a.kod, ad: a.ad, netFiyat: 0, birim: 'ADET', _id: a.id })),
      ...paketler.map(p => ({ grup: 'paket', kod: p.kod, ad: p.ad, netFiyat: 0, birim: 'ADET', _id: p.id })),
      ...Object.entries(hmGruplar).flatMap(([grupKey, g]) => g.kalemler.map(h => ({ grup: grupKey, kod: h.stokKodu || h.id, ad: h.ad, netFiyat: App.toTRY(h.birimFiyat, h.dvz, App.state.ayarlar), birim: h.birim, _id: h.id })))
    ];
    const gruplar = { yarimamul: 'Yarı Mamüller', altmontaj: 'Alt Montajlar', paket: 'Paketler' };
    Object.entries(hmGruplar).forEach(([grupKey, g]) => { gruplar[grupKey] = g.ad; });

    App.goTo('kalem_secici', {
      baslik: 'Reçeteye Kalem Ekle: ' + wiz.urun.kod,
      secenekler, gruplar,
      yeniKartEklenebilir: true,
      yeniKategoriEklenebilir: true,
      geriDon: () => { App.goTo('kartlar'); renderWizardStep2(main, wiz); },
      onSecildi: (secim) => {
        App.goTo('kartlar');
        const kalemTip = secim.grup === 'yarimamul' ? 'yarimamul' : (secim.grup === 'altmontaj' ? 'altmontaj' : (secim.grup === 'paket' ? 'paket' : 'hammadde'));
        openWizardMiktarForm(main, wiz, kalemTip, secim._id, secim.kod, secim.ad, secim.birim);
      },
      onYeniKartIstendi: (yeniKartBilgisi) => {
        App.goTo('kartlar');
        openWizardYeniKartForm(main, wiz, yeniKartBilgisi, kategoriler);
      }
    });
  }

  function openWizardMiktarForm(main, wiz, kalemTip, refId, kod, ad, birim) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b class="mono">${App.escapeHtml(kod)}</b> — ${App.escapeHtml(ad)}</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Miktar</label><input class="finput" id="wmf-miktar" type="number" value="1" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Birim</label>
          <select class="fselect" id="wmf-birim">
            <option value="ADET" ${birim === 'ADET' ? 'selected' : ''}>ADET</option>
            <option value="M2" ${birim === 'M2' ? 'selected' : ''}>M2</option>
            <option value="METRE" ${birim === 'METRE' ? 'selected' : ''}>METRE</option>
            <option value="KG" ${birim === 'KG' ? 'selected' : ''}>KG</option>
          </select>
        </div>
      </div>
    `;
    const footer = `<button class="btn" id="wmf-cancel">Vazgeç</button><button class="btn btn-blue" id="wmf-save">Reçeteye Ekle</button>`;
    App.openModal({ title: 'Miktar Girin', sub: kod, body, footer });
    document.getElementById('wmf-cancel').onclick = App.closeModal;
    document.getElementById('wmf-save').onclick = () => {
      const miktar = parseFloat(document.getElementById('wmf-miktar').value) || 1;
      wiz.kalemler.push({ tip: kalemTip, refId, miktar, birim: document.getElementById('wmf-birim').value });
      App.closeModal();
      renderWizardStep2(main, wiz);
    };
  }

  // "+ Yeni Kart Ekle": kullanıcı kart tipini (Yarı Mamül/Alt Montaj/Hırdavat/
  // Hammadde/Diğer-yeni kategori) seçer, kart GERÇEKTEN oluşturulur. Yarı
  // mamül veya alt montaj oluşturulduysa, hemen ardından KENDİ reçete ekranı
  // (Reçete Yap'taki "Satıra Kalem Ekle" akışı) açılır — kullanıcı isteği:
  // "yarımamülün altına reçete gir dediğinde yeniden hammadde/yarımamül/alt
  // montaj eklenebilsin". Bitirince sihirbaza geri döner ve yeni kartı miktar
  // sorup reçeteye ekler.
  function openWizardYeniKartForm(main, wiz, yeniKartBilgisi, kategoriler) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Bu kart sistemde bulunamadı, yeni olarak oluşturulacak.</div>
      <div class="fgroup"><label class="flbl">Kart Tipi</label>
        <select class="fselect" id="wyk-tip">
          <option value="yarimamul">Yarı Mamül</option>
          <option value="altmontaj">Alt Montaj</option>
          <option value="paket">📦 Paket (sevkiyat/koli takibi — sanal, MRP'ye girmez)</option>
          <option value="hirdavat">Hırdavat (Hammadde)</option>
          <option value="diger">Diğer (Yeni Hammadde Kategorisi)</option>
        </select>
      </div>
      <div id="wyk-kategori-wrap" style="display:none">
        <div class="fgroup"><label class="flbl">Kategori Adı (örn. Yedek Parça, Sarf Malzemesi)</label>
          <input class="finput" id="wyk-kategori" list="wyk-kategori-list" placeholder="Mevcut kategoriden seçin veya yeni yazın">
          <datalist id="wyk-kategori-list">${kategoriler.map(k => `<option value="${App.escapeHtml(k)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kod</label><input class="finput" id="wyk-kod" value="${App.escapeHtml(yeniKartBilgisi.kod || '')}"></div>
        <div class="fgroup"><label class="flbl">Ad</label><input class="finput" id="wyk-ad" value="${App.escapeHtml(yeniKartBilgisi.ad || '')}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Miktar (bu reçetede)</label><input class="finput" id="wyk-miktar" type="number" value="1" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Birim</label>
          <select class="fselect" id="wyk-birim">
            <option value="ADET">ADET</option><option value="M2">M2</option><option value="METRE">METRE</option><option value="KG">KG</option>
          </select>
        </div>
      </div>
    `;
    const footer = `<button class="btn" id="wyk-cancel">Vazgeç</button><button class="btn btn-green" id="wyk-save">Kartı Oluştur</button>`;
    App.openModal({ title: 'Yeni Kart Oluştur', body, footer, wide: true });
    document.getElementById('wyk-cancel').onclick = App.closeModal;

    const tipSelect = document.getElementById('wyk-tip');
    tipSelect.onchange = () => { document.getElementById('wyk-kategori-wrap').style.display = tipSelect.value === 'diger' ? 'block' : 'none'; };

    document.getElementById('wyk-save').onclick = async () => {
      const yeniTip = tipSelect.value;
      const kod = document.getElementById('wyk-kod').value.trim();
      const ad = document.getElementById('wyk-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      const miktar = parseFloat(document.getElementById('wyk-miktar').value) || 1;
      const birim = document.getElementById('wyk-birim').value;

      if (yeniTip === 'yarimamul' || yeniTip === 'altmontaj' || yeniTip === 'paket') {
        let yeniKartId;
        if (yeniTip === 'yarimamul') {
          const yarimamuller = await Store.yarimamuller.all();
    const _onceki_yarimamuller = new Set(yarimamuller.map(x => x && x.id));
          const yeniYm = { id: App.uid('YM'), kod, ad, hammaddeId: null, rotaId: null, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
          yarimamuller.push(yeniYm);
          await App.persist(() => parcaliKaydet('yarimamuller', yarimamuller, _onceki_yarimamuller));
          yeniKartId = yeniYm.id;
        } else if (yeniTip === 'altmontaj') {
          const altMontajlar = await Store.altMontajlar.all();
    const _onceki_altMontajlar = new Set(altMontajlar.map(x => x && x.id));
          const yeniAm = { id: App.uid('AM'), kod, ad, aciklama: '', rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
          altMontajlar.push(yeniAm);
          await App.persist(() => parcaliKaydet('altMontajlar', altMontajlar, _onceki_altMontajlar));
          yeniKartId = yeniAm.id;
        } else {
          const paketler = await Store.paketler.all();
    const _onceki_paketler = new Set(paketler.map(x => x && x.id));
          const yeniPkt = { id: App.uid('PKT'), kod, ad, aciklama: '', ambalajTipi: 'Koli', koliIciAdet: 1, rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
          paketler.push(yeniPkt);
          await App.persist(() => parcaliKaydet('paketler', paketler, _onceki_paketler));
          yeniKartId = yeniPkt.id;
        }
        App.closeModal();
        wiz.kalemler.push({ tip: yeniTip, refId: yeniKartId, miktar, birim });
        // Kullanıcı isteği: yeni yarımamül/alt montaj oluşturulduğunda hemen
        // ardından KENDİ reçetesi girilsin (hammadde/yarımamül/alt montaj ekle).
        App.toast('Kart oluşturuldu. Şimdi bu kartın kendi reçetesini girebilirsiniz.', 'ok');
        openWizardAltKartReceteEkrani(main, wiz, yeniTip, yeniKartId, kod, ad);
        return;
      }

      // Hırdavat / Diğer (yeni kategori) — doğrudan hammaddeler koleksiyonuna eklenir
      const hammaddeler = await Store.hammaddeler.all();
    const _onceki_hammaddeler = new Set(hammaddeler.map(x => x && x.id));
      let kategori = 'Hırdavat';
      if (yeniTip === 'diger') {
        kategori = (document.getElementById('wyk-kategori').value || '').trim() || 'Diğer';
        const kategoriler = await Store.hammaddeKategorileriGetir();
        if (!kategoriler.includes(kategori)) { kategoriler.push(kategori); await Store.hammaddeKategorileriKaydet(kategoriler); }
      }
      const yeniHm = { id: App.uid('HM'), tip: 'hirdavat', kategori, stokKodu: kod, ad, birim, fireYuzde: 0, birimFiyat: 0, dvz: 'TL', kdvOraniYuzde: 18 };
      hammaddeler.push(yeniHm);
      await App.persist(() => parcaliKaydet('hammaddeler', hammaddeler, _onceki_hammaddeler));
      wiz.kalemler.push({ tip: 'hammadde', refId: yeniHm.id, miktar, birim });
      App.toast(`Yeni kart oluşturuldu (${kod}) ve reçeteye eklendi`, 'ok');
      App.closeModal();
      renderWizardStep2(main, wiz);
    };
  }

  // Sihirbaz içinde yeni oluşturulan bir yarımamül/alt montaj için, kendi alt
  // reçetesini girme ekranı — Reçete Yap'taki "Satıra Kalem Ekle" mantığının
  // AYNISI, ama bittiğinde sihirbazın 2. adımına geri döner.
  function openWizardAltKartReceteEkrani(main, wiz, kartTip, kartId, kod, ad) {
    const sahteKart = { id: kartId, kod, ad };
    openKalemEkleSecici(sahteKart, kartTip, null, main, () => renderWizardStep2(main, wiz));
  }

  async function renderWizardStep3(main, wiz) {
    let rotalar = await Store.rotalar.all();
    if (!wiz.secilenRotaId) wiz.secilenRotaId = '';
    const body = document.createElement('div');

    function renderBody() {
      body.innerHTML = `
        ${wizardProgress(3)}
        <div class="flex-between" style="margin-bottom:4px">
          <label class="flbl" style="margin:0">Bu ürün için üretim rotası (opsiyonel — işçilik+amortisman+GYG maliyeti buradan hesaplanır)</label>
          <button type="button" class="btn btn-sm btn-green" id="wz-yeni-rota">+ Yeni Rota Oluştur</button>
        </div>
        <select class="fselect" id="wz-rota" style="margin-bottom:6px">
          <option value="">— Rota seçilmedi —</option>
          ${rotalar.map(r => `<option value="${r.id}" ${wiz.secilenRotaId === r.id ? 'selected' : ''}>${App.escapeHtml(r.kod)} — ${App.escapeHtml(r.ad)} (${App.fmtTL(r.toplamMaliyet || 0)})</option>`).join('')}
        </select>
        <div class="fhint">Rota seçmezseniz ürünün işçilik maliyeti 0 olarak hesaplanır; sonradan Reçete Yap ekranından "Düzenle" ile ekleyebilirsiniz. "+ Yeni Rota Oluştur" ile istasyon/hat seçip (gerekirse yeni istasyon tanımlayıp) ayrı sayfaya gitmeden rota oluşturabilirsiniz.</div>
        <div class="hr"></div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Amortisman Gideri (₺, sabit rakam)</label><input class="finput" id="wz-amortisman" type="number" step="0.01" value="0"></div>
          <div class="fgroup"><label class="flbl">GYG Oranı (%, manuel)</label><input class="finput" id="wz-gyg" type="number" step="0.1" value="0"></div>
        </div>
        <div class="hr"></div>
        <div style="font-size:12px;color:var(--text2)">
          <b>Özet:</b> ${App.escapeHtml(wiz.urun.kod)} — ${App.escapeHtml(wiz.urun.ad)}<br>
          Reçete kalemi sayısı: ${wiz.kalemler.length}
        </div>
      `;
      document.getElementById('wz-rota').onchange = (e) => { wiz.secilenRotaId = e.target.value; };
      document.getElementById('wz-yeni-rota').onclick = () => {
        PageModules.rota.openRotaEditorModal(null, async (yeniRota) => {
          if (yeniRota) {
            rotalar = await Store.rotalar.all();
            wiz.secilenRotaId = yeniRota.id;
          }
          renderBody();
        });
      };
    }

    const footer = `<button class="btn" id="wz-back">&larr; Geri</button><button class="btn" id="wz-cancel">Vazgeç</button><button class="btn btn-green" id="wz-finish">Ürünü Oluştur</button>`;
    App.openModal({ title: 'Sıfırdan Ürün Oluştur', sub: 'Adım 3/3 — ' + wiz.urun.kod, body, footer, wide: true });
    renderBody();
    document.getElementById('wz-back').onclick = () => { wiz.step = 2; renderWizardStep(main, wiz); };
    document.getElementById('wz-cancel').onclick = App.closeModal;
    document.getElementById('wz-finish').onclick = async () => {
      const rotaId = document.getElementById('wz-rota').value || null;
      const amortismanGideri = parseFloat(document.getElementById('wz-amortisman').value) || 0;
      const gygOraniYuzde = parseFloat(document.getElementById('wz-gyg').value) || 0;
      const urun = {
        id: App.uid('URN'),
        kod: wiz.urun.kod, ad: wiz.urun.ad, tip: 'bitmis_urun',
        aciklama: wiz.urun.aciklama, gorseller: [],
        rotaId, amortismanGideri, gygOraniYuzde,
        olusturmaTarihi: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.urunler.upsert(urun));

      const recete = {
        id: 'RC-' + urun.kod,
        urunId: urun.id,
        ad: urun.ad + ' Reçetesi',
        kalemler: wiz.kalemler.map(k => ({ tip: k.tip || 'yarimamul', refId: k.refId, miktar: k.miktar, birim: k.birim }))
      };
      await App.persist(() => Store.receteler.upsert(recete));

      App.toast('Ürün, reçetesiyle birlikte oluşturuldu: ' + urun.kod, 'ok');
      App.closeModal();
      detayKartId = { id: urun.id, tip: 'urun' };
      render(main);
    };
  }

  // ── EXCELDEN REÇETE İÇE AKTARMA ─────────────────────────────────────────
  // Hiyerarşik BOM export formatı (LevelNo/PathKod/LineType/StokKod/Miktar/
  // BirimFiyat/DovizKod/en/Boy sütunlu) bir Excel dosyasından otomatik olarak
  // hammadde + yarı mamül + ürün + reçete oluşturur. Var olan StokKod'lar
  // güncellenir (üzerine yazılır), yeni StokKod'lar için yeni kayıt açılır.
  function openExcelImport(main) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">
        İki format desteklenir:<br>
        <b>1) Hiyerarşik reçete/BOM</b> — LevelNo, PathKod, LineType, StokKod, Miktar, en, Boy sütunlu.<br>
        <b>2) SolidWorks PVC'li BOM</b> — PARÇA KODU, PANEL/HAMMADDE KODU, PARÇA ADI, ADET, NET BOY/EN, PVC bant kolonlu.<br>
        Sistem formatı otomatik algılar, kaydetmeden önce önizleme gösterir.
      </div>
      <input type="file" id="ei-file" accept=".xlsx,.xls" style="font-size:12px">
      <div id="ei-status" style="margin-top:10px;font-size:12px;color:var(--text2)"></div>
    `;
    const footer = `<button class="btn" id="ei-cancel">Vazgeç</button>`;
    App.openModal({ title: 'Excelden Reçete İçe Aktar', body, footer, wide: true });
    document.getElementById('ei-cancel').onclick = App.closeModal;

    document.getElementById('ei-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById('ei-status').textContent = 'Dosya okunuyor…';
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // FORMAT ALGILAMA: SolidWorks PVC'li BOM mu, hiyerarşik format mı?
        if (solidworksBomMu(rows)) {
          const parsed = parseSolidworksBom(rows, file.name);
          if (!parsed.items.length) {
            document.getElementById('ei-status').innerHTML = '<span style="color:var(--red-text)">SolidWorks BOM formatı algılandı ama okunabilir parça satırı bulunamadı.</span>';
            return;
          }
          renderImportPreview(main, parsed);
          return;
        }

        const parsed = parseExceleReceteRows(rows, file.name);
        if (!parsed.items.length) {
          document.getElementById('ei-status').innerHTML = '<span style="color:var(--red-text)">Dosyada okunabilir satır bulunamadı. Sütun başlıklarının (LevelNo, PathKod, LineType, StokKod, ...) doğru olduğundan emin olun.</span>';
          return;
        }
        renderImportPreview(main, parsed);
      } catch (err) {
        document.getElementById('ei-status').innerHTML = '<span style="color:var(--red-text)">Dosya okunamadı: ' + App.escapeHtml(err.message) + '</span>';
      }
    };
  }

  // ── SolidWorks PVC'li BOM ALGILAMA ────────────────────────────────────────
  // İlk 3 satırda "PARÇA KODU", "PANEL", "PVC", "NET BOY/EN", "ADET" gibi
  // başlıklar aranır. Bu format hiyerarşik değildir; DÜZ bir parça listesidir.
  function solidworksBomMu(rows) {
    const ilk = rows.slice(0, 4).map(r => r.map(c => String(c || '').toUpperCase()).join(' | ')).join(' || ');
    const sinyaller = ['PARÇA KODU', 'PARCA KODU', 'PVC BOY', 'PVC EN', 'NET BOY', 'NET EN', 'PANEL HAMMADDE', 'HIRDAVAT'];
    const skor = sinyaller.filter(s => ilk.includes(s)).length;
    return skor >= 3;
  }

  // Başlık satırındaki sütun adını bulup index döndürür (kısmi eşleşme, TR-normalize)
  function bomKolonBul(basliklar, adaylar) {
    const norm = s => String(s || '').toUpperCase().replace(/İ/g, 'I').replace(/\s+/g, ' ').replace(/\\N/g, ' ').trim();
    for (let i = 0; i < basliklar.length; i++) {
      const b = norm(basliklar[i]);
      for (const a of adaylar) {
        if (b.includes(norm(a))) return i;
      }
    }
    return -1;
  }

  // SolidWorks PVC'li BOM'u ÜretimOS "ham" kalemlerine çevirir:
  //   - Her plaka satırı: plaka hammadde + 4 kenar bandı ataması (olcu + kenarBantlari)
  //   - Her hırdavat satırı: hırdavat hammadde
  // Kök ürün oluşur; tüm kalemler kökün DOĞRUDAN kalemi olur (seviye 0, düz liste)
  // Böylece kullanıcı sonradan yarımamül/paket/rota ekleyip ağacı yeniden kurar.
  function parseSolidworksBom(rows, fileName) {
    // Başlık satırını bul (PARÇA KODU / PARÇA ADI geçen ilk satır)
    let hIdx = -1;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const j = rows[i].map(c => String(c || '').toUpperCase()).join('|');
      if (j.includes('PARÇA') || j.includes('PARCA') || j.includes('NET BOY') || j.includes('NET EN')) { hIdx = i; break; }
    }
    if (hIdx < 0) hIdx = 0;
    const H = rows[hIdx];

    const col = {
      parcaKod: bomKolonBul(H, ['PARÇA KODU', 'PARCA KODU']),
      hirdavatKod: bomKolonBul(H, ['HIRDAVAT', 'HAMMADDE KODU', 'HIRDAVAT+ HAMMADDE']),
      panelKod: bomKolonBul(H, ['PANEL HAMMADDE KODU', 'PANEL HAMMADDE']),
      parcaAd: bomKolonBul(H, ['PARÇA ADI', 'PARCA ADI']),
      kalinlik: bomKolonBul(H, ['KALINLIK']),
      malzeme: bomKolonBul(H, ['RENK', 'MALZEME', 'RENK - MALZEME']),
      adet: bomKolonBul(H, ['ADET']),
      netBoy: bomKolonBul(H, ['NET BOY']),
      netEn: bomKolonBul(H, ['NET EN']),
      // PVC bant: her kenar için ad + hammadde kodu + metraj
      pvcOnAd: bomKolonBul(H, ['PVC BOY ÖN']),
      pvcOnKod: bomKolonBul(H, ['PVC BOY ÖN HAMMADDE', 'PVC BOY ON HAMMADDE']),
      pvcSolAd: bomKolonBul(H, ['PVC EN SOL']),
      pvcSolKod: bomKolonBul(H, ['PVC EN SOL HAMMADDE']),
      pvcArkaKod: bomKolonBul(H, ['PVC BOY ARKA HAMMADDE']),
      pvcArkaAd: bomKolonBul(H, ['PVC BOY ARKA']),
      pvcSagAd: bomKolonBul(H, ['PVC EN SAĞ', 'PVC EN SAG']),
      pvcSagKod: bomKolonBul(H, ['PVC EN SAĞ HAMMADDE', 'PVC EN SAG HAMMADDE']),
    };

    // Kök ürün kodu/adı: dosya adından
    const rootKod = (fileName || 'SW_URUN').replace(/\.(xlsx|xls)$/i, '').replace(/[\\/:*?"<>|]/g, '_');
    const rootAd = rootKod;

    const items = [];               // önizleme için düz liste
    const receteKalemleri = new Map(); // rootKod -> [kalem...]
    const kokKalemler = [];
    const hammaddeSet = new Map();  // stokKod -> {stokKod, stokAd, tip, birim}
    const bantSet = new Map();      // bant kodu -> ad (kenar bandı hammaddeleri)

    const val = (row, idx) => idx >= 0 && idx < row.length ? row[idx] : '';

    for (let i = hIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c === '' || c == null)) continue;

      const parcaAd = String(val(row, col.parcaAd) || '').replace(/[\r\n]+/g, ' ').replace(/_1\^/g, '').trim();
      const adet = parseTRNumber(val(row, col.adet)) || 1;
      const netBoy = parseTRNumber(val(row, col.netBoy));
      const netEn = parseTRNumber(val(row, col.netEn));
      const hirdavatKod = String(val(row, col.hirdavatKod) || '').trim();
      const panelKod = String(val(row, col.panelKod) || '').trim();
      const malzeme = String(val(row, col.malzeme) || '').trim();
      const kalinlik = String(val(row, col.kalinlik) || '').trim();

      if (!parcaAd && !hirdavatKod) continue;

      // PLAKA MI HIRDAVAT MI?
      // Net en/boy varsa VE malzeme adı plaka anahtarı içeriyorsa plaka.
      const plakaMi = (netBoy > 0 && netEn > 0) || /SUNTA|MDF|SLM|LAM|PLAKA/i.test(malzeme);

      if (plakaMi) {
        // Plaka stok kodu: panelKod varsa o, yoksa malzeme adından türet
        const plakaKod = panelKod || ('PLK-' + (malzeme || parcaAd).replace(/[^A-Za-z0-9]/g, '').slice(0, 20).toUpperCase());
        const plakaAd = malzeme || parcaAd;
        if (!hammaddeSet.has(plakaKod)) {
          hammaddeSet.set(plakaKod, { stokKod: plakaKod, stokAd: plakaAd, tip: 'plaka', birim: 'M2' });
        }

        // 4 kenar bandını topla
        const kenarlar = {};
        const kenarTanim = [
          ['on',   col.pvcOnKod,   col.pvcOnAd],
          ['sol',  col.pvcSolKod,  col.pvcSolAd],
          ['arka', col.pvcArkaKod, col.pvcArkaAd],
          ['sag',  col.pvcSagKod,  col.pvcSagAd],
        ];
        kenarTanim.forEach(([kenar, kodIdx, adIdx]) => {
          const bKod = String(val(row, kodIdx) || '').trim();
          const bAd = String(val(row, adIdx) || '').trim();
          if (bKod && /^\d/.test(bKod)) { // geçerli bir kod (rakamla başlar)
            kenarlar[kenar] = bKod;
            if (!bantSet.has(bKod)) bantSet.set(bKod, bAd || ('KENAR BANT ' + bKod));
          }
        });

        const kalem = {
          tip: 'hammadde', hmTip: 'plaka', stokKod: plakaKod, stokAd: plakaAd + (kalinlik ? ' (' + kalinlik + 'mm)' : ''),
          miktar: adet, birim: 'M2',
          olcu: { kabaEn: netEn, kabaBoy: netBoy, netEn: netEn, netBoy: netBoy },
          kenarBantKodlari: kenarlar,  // {on, sol, arka, sag} -> bant stok kodları
          parcaAdi: parcaAd
        };
        kokKalemler.push(kalem);
        items.push({ stokKod: plakaKod, stokAd: kalem.stokAd, tip: 'plaka', miktar: adet, birim: 'M2', en: netEn, boy: netBoy, parcaAdi: parcaAd, kenarSayisi: Object.keys(kenarlar).length });
      } else {
        // HIRDAVAT
        const hKod = hirdavatKod || ('HRD-' + parcaAd.replace(/[^A-Za-z0-9]/g, '').slice(0, 20).toUpperCase());
        const hAd = parcaAd || hKod;
        if (!hammaddeSet.has(hKod)) {
          hammaddeSet.set(hKod, { stokKod: hKod, stokAd: hAd, tip: 'hirdavat', birim: 'ADET' });
        }
        const kalem = { tip: 'hammadde', hmTip: 'hirdavat', stokKod: hKod, stokAd: hAd, miktar: adet, birim: 'ADET' };
        kokKalemler.push(kalem);
        items.push({ stokKod: hKod, stokAd: hAd, tip: 'hirdavat', miktar: adet, birim: 'ADET', en: '', boy: '', parcaAdi: parcaAd });
      }
    }

    // Kenar bandı hammaddelerini de hammadde setine ekle
    bantSet.forEach((ad, kod) => {
      if (!hammaddeSet.has(kod)) hammaddeSet.set(kod, { stokKod: kod, stokAd: ad, tip: 'kenar_bandi', birim: 'METRE' });
    });

    receteKalemleri.set(rootKod, kokKalemler);

    return {
      solidworksBom: true,
      items,
      rootKod, rootAd,
      hammaddeler: Array.from(hammaddeSet.values()),
      bantlar: Array.from(bantSet.entries()).map(([kod, ad]) => ({ stokKod: kod, stokAd: ad })),
      kokKalemler,
      receteKalemleri
    };
  }

  function parseTRNumber(str) {
    if (str === '' || str == null) return 0;
    if (typeof str === 'number') return str;
    const cleaned = String(str).replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function guessHammaddeTip(stokAd, birim) {
    const ad = (stokAd || '').toUpperCase();
    const bantKeywords = ['KENAR BANT', 'KENAR BAND', 'K.BANT', 'BANT PVC', 'BANT ABS', 'BANT LAMINAT', 'BANT MELAMIN', 'ABS BANT', 'PVC BANT'];
    if (bantKeywords.some(k => ad.includes(k)) || (birim === 'METRE' && (ad.includes('BANT') || ad.includes('BAND')))) return 'kenar_bandi';
    // SAC kelimesi için birim kontrolü: SAC GRAM/KG ise hırdavat (demir/metal hırdavat),
    // M2 veya boyutlu (SAC S=... 1X2M gibi) ise plaka sayılır.
    const plakaKeywords = ['SUNTA', 'MDF', 'SLM', 'LAM', 'KAPLAMA', 'PLAKA'];
    const sacPlaka = ad.includes('SAC ') && birim === 'M2'; // SAC plaka: sadece M2 biriminde (GRAM/KG → hırdavat)
    if (birim === 'M2' || plakaKeywords.some(k => ad.includes(k)) || sacPlaka) return 'plaka';
    return 'hirdavat';
  }

  function parseExceleReceteRows(rows, fileName) {
    if (!rows.length) return { items: [], yarimamuller: [], hammaddeler: [], receteKalemleri: new Map(), rootKod: '', rootAd: '' };
    const dataRows = rows.slice(1).filter(r => r[4] !== '' && r[4] != null);

    const items = dataRows.map(r => ({
      level: String(r[0] ?? ''), path: String(r[1] || ''), type: r[2],
      stokKod: String(r[4]), stokAd: r[6] || r[5] || String(r[4]),
      miktar: parseTRNumber(r[7]) || 1, birim: r[8] || 'ADET',
      birimFiyat: parseTRNumber(r[9]), dvz: (r[11] || 'TL').toString().trim() || 'TL',
      en: parseTRNumber(r[12]), boy: parseTRNumber(r[13])
    }));

    const parentCodes = new Set();
    items.forEach(i => {
      const parts = i.path.split('>').map(s => s.trim()).filter(Boolean);
      if (parts.length) parentCodes.add(parts[parts.length - 1]);
    });

    const byStokKod = new Map();
    items.forEach(i => { if (!byStokKod.has(i.stokKod)) byStokKod.set(i.stokKod, i); });

    const yarimamuller = [];
    const hammaddeler = [];
    byStokKod.forEach((item, stokKod) => {
      if (parentCodes.has(stokKod)) {
        // Paket sezgisel tespiti: stok kodunda "PKT" geçiyorsa VEYA stok
        // adı/açıklamasında "paket" kelimesi geçiyorsa, bu kalem muhtemelen
        // gerçek bir üretim parçası değil, sevkiyat öncesi paketleme/koli
        // sayısını takip etmek için kullanılan SANAL bir karttır. Bu sadece
        // bir ÖNERİDİR — kullanıcı önizleme ekranında her satırın tipini
        // (Yarı Mamül / Alt Montaj / Paket) değiştirebilir.
        const kodUpper = stokKod.toUpperCase();
        const adLower = (item.stokAd || '').toLowerCase();
        item.onerilenTip = (kodUpper.includes('PKT') || adLower.includes('paket')) ? 'paket' : 'yarimamul';
        yarimamuller.push(item);
      } else hammaddeler.push(item);
    });

    const receteKalemleri = new Map(); // parentStokKod -> [{stokKod, miktar, birim, en, boy}]
    items.forEach(i => {
      const parts = i.path.split('>').map(s => s.trim()).filter(Boolean);
      const parent = parts.length ? parts[parts.length - 1] : null;
      if (!parent) return;
      if (!receteKalemleri.has(parent)) receteKalemleri.set(parent, []);
      receteKalemleri.get(parent).push(i);
    });

    // Kök seviye (level=0) kalemlerin path'inin son parçası -> dosyanın temsil ettiği nihai ürün kodu
    const level0 = items.filter(i => i.level === '0');
    const rootParts = level0.length ? level0[0].path.split('>').map(s => s.trim()).filter(Boolean) : [];
    const rootKodRaw = rootParts.length ? rootParts[rootParts.length - 1] : fileName.replace(/\.(xlsx|xls)$/i, '');
    const rootKod = rootKodRaw;
    const rootAd = fileName.replace(/\.(xlsx|xls)$/i, '').replace(/_/g, ' ');

    return { items, yarimamuller, hammaddeler, receteKalemleri, rootKod, rootAd, level0 };
  }

  // ── SOLIDWORKS BOM: ÖNİZLEME + KAYDETME ───────────────────────────────────
  async function renderSolidworksBomPreview(main, parsed) {
    const [mevcutHammaddeler, mevcutUrunler] = await Promise.all([
      Store.hammaddeler.all(), Store.urunler.all()
    ]);
    const plakalar = parsed.items.filter(i => i.tip === 'plaka');
    const hirdavatlar = parsed.items.filter(i => i.tip === 'hirdavat');
    const urunMevcut = mevcutUrunler.find(u => u.kod === parsed.rootKod);
    const yeniHmSayisi = parsed.hammaddeler.filter(h => !mevcutHammaddeler.find(x => x.stokKodu === h.stokKod)).length;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:12px;background:#EEF2FF;border:1px solid #C7D2FE;padding:10px 12px;border-radius:8px">
        <b>SolidWorks PVC'li BOM algılandı.</b> Bu BOM <b>HAM</b> olarak aktarılır:
        tüm parçalar nihai ürünün doğrudan altına düz liste halinde eklenir (plakalar ölçüleri
        ve 4 kenar bandı atamasıyla, hırdavatlar adediyle). Sonra Ağaç Editörü'nde kendi
        yarımamül / paket / alt montaj kartlarınızı ve rotalarınızı ekleyip ağacı yeniden
        kurgulayabilirsiniz.
      </div>
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Plaka (panel)</div><div class="kpi-val blue">${plakalar.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Hırdavat</div><div class="kpi-val purple">${hirdavatlar.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Kenar Bandı</div><div class="kpi-val" style="color:var(--teal,#0d9488)">${parsed.bantlar.length}</div></div>
      </div>

      <div class="fgroup"><label class="flbl">Nihai Ürün Kodu</label>
        <input class="finput" id="ei-urunkod" value="${App.escapeHtml(parsed.rootKod)}"></div>
      <div class="fgroup"><label class="flbl">Nihai Ürün Adı</label>
        <input class="finput" id="ei-urunad" value="${App.escapeHtml(parsed.rootAd)}"></div>
      ${urunMevcut ? '<div class="fhint" style="color:var(--amber-text)">⚠ Bu kod ile mevcut ürün var, reçetesi HAM haliyle yeniden kurulacak (eski reçete kalemleri değişir).</div>' : ''}
      <div class="fhint">${yeniHmSayisi} yeni hammadde/bant kartı oluşturulacak, mevcutlar stok koduyla eşleşecek.</div>

      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">🪵 Plakalar (panel) — ölçü ve kenar bandı sayısı</div>
      <div class="tbl-wrap" style="max-height:200px;overflow:auto"><table class="dtable" style="font-size:11px">
        <tr><th>Parça</th><th>Stok Kodu</th><th class="r">Adet</th><th class="r">En×Boy</th><th class="r">Bant</th></tr>
        ${plakalar.map(p => `<tr>
          <td>${App.escapeHtml(p.parcaAdi || '')}</td>
          <td class="mono">${App.escapeHtml(p.stokKod)}</td>
          <td class="r">${p.miktar}</td>
          <td class="r mono">${p.en}×${p.boy}</td>
          <td class="r">${p.kenarSayisi > 0 ? '⌐ ' + p.kenarSayisi : '—'}</td>
        </tr>`).join('')}
      </table></div>

      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">🔩 Hırdavatlar</div>
      <div class="tbl-wrap" style="max-height:160px;overflow:auto"><table class="dtable" style="font-size:11px">
        <tr><th>Ad</th><th>Stok Kodu</th><th class="r">Adet</th></tr>
        ${hirdavatlar.map(h => `<tr>
          <td>${App.escapeHtml(h.stokAd)}</td>
          <td class="mono">${App.escapeHtml(h.stokKod)}</td>
          <td class="r">${h.miktar}</td>
        </tr>`).join('')}
      </table></div>
    `;
    const footer = `<button class="btn" id="ei-back">Vazgeç</button><button class="btn btn-green" id="ei-confirm">Ham Reçeteyi İçe Aktar</button>`;
    App.openModal({ title: 'SolidWorks BOM Önizlemesi', sub: parsed.items.length + ' parça · HAM aktarım', body, footer, xwide: true });
    document.getElementById('ei-back').onclick = App.closeModal;

    document.getElementById('ei-confirm').onclick = async () => {
      const urunKod = document.getElementById('ei-urunkod').value.trim() || parsed.rootKod;
      const urunAd = document.getElementById('ei-urunad').value.trim() || urunKod;
      try {
        await solidworksBomKaydet(parsed, urunKod, urunAd);
        App.closeModal();
        App.toast('SolidWorks BOM ham olarak aktarıldı: ' + urunKod, 'ok');
        detayKartId = null;
        render(main);
      } catch (err) {
        App.toast('Aktarma hatası: ' + err.message, 'err');
      }
    };
  }

  async function solidworksBomKaydet(parsed, urunKod, urunAd) {
    const bugun = new Date().toISOString().slice(0, 10);
    // 1) HAMMADDELER (plaka + hırdavat + kenar bandı) — stok koduyla eşleştir
    const hammaddeler = await Store.hammaddeler.all();
    const _onceki_hammaddeler = new Set(hammaddeler.map(x => x && x.id));
    const stokKodToHmId = new Map();
    parsed.hammaddeler.forEach(h => {
      let kayit = hammaddeler.find(x => x.stokKodu === h.stokKod);
      if (kayit) {
        if (!kayit.ad) kayit.ad = h.stokAd;
        // tip yalnızca boşsa güncellenir — kullanıcı elle değiştirdiyse ezmeyelim
        if (!kayit.tip) kayit.tip = h.tip;
      } else {
        kayit = {
          id: App.uid('HM'), tip: h.tip, stokKodu: h.stokKod, ad: h.stokAd,
          birim: h.tip === 'plaka' ? 'M2' : (h.tip === 'kenar_bandi' ? 'METRE' : 'ADET'),
          birimFiyat: 0, dvz: 'TL', fireYuzde: h.tip === 'plaka' ? 8 : 2,
          grainYonu: 'yok', en: h.tip === 'plaka' ? 1830 : null, boy: h.tip === 'plaka' ? 3660 : null,
          kdvOraniYuzde: 20, sonAlisTarihi: bugun
        };
        hammaddeler.push(kayit);
      }
      stokKodToHmId.set(h.stokKod, kayit.id);
    });
    await parcaliKaydet('hammaddeler', hammaddeler, _onceki_hammaddeler);

    // 2) ÜRÜN — mevcutsa bul, yoksa oluştur
    const urunler = await Store.urunler.all();
    const _onceki_urunler = new Set(urunler.map(x => x && x.id));
    let urun = urunler.find(u => u.kod === urunKod);
    if (!urun) {
      urun = { id: App.uid('URN'), kod: urunKod, ad: urunAd, tip: 'bitmis_urun', aciklama: 'SolidWorks BOM (ham)', gorseller: [], olusturmaTarihi: bugun };
      urunler.push(urun);
    } else {
      urun.ad = urunAd;
    }
    await parcaliKaydet('urunler', urunler, _onceki_urunler);

    // 3) REÇETE — kök ürünün altına DÜZ kalem listesi. Her plaka kalemine
    // olcu + kenarBantlari (kenar->hammaddeId) yazılır; hırdavatlar adetli.
    const receteler = await Store.receteler.all();
    const _onceki_receteler = new Set(receteler.map(x => x && x.id));
    const kalemler = parsed.kokKalemler.map(k => {
      const refId = stokKodToHmId.get(k.stokKod);
      if (!refId) return null;
      const kalem = { tip: 'hammadde', refId, miktar: k.miktar || 1, birim: k.birim || 'ADET' };
      if (k.olcu) kalem.olcu = k.olcu;
      // Kenar bandı kodlarını hammadde ID'lerine çevir
      if (k.kenarBantKodlari) {
        const kb = {};
        ['on', 'arka', 'sag', 'sol'].forEach(kenar => {
          const bkod = k.kenarBantKodlari[kenar];
          if (bkod && stokKodToHmId.has(bkod)) kb[kenar] = stokKodToHmId.get(bkod);
          else kb[kenar] = null;
        });
        if (Object.values(kb).some(v => v)) kalem.kenarBantlari = kb;
      }
      return kalem;
    }).filter(Boolean);

    let recete = receteler.find(r => r.urunId === urun.id);
    if (recete) {
      recete.kalemler = kalemler;
      recete.ad = urunAd + ' Reçetesi';
    } else {
      receteler.push({ id: App.uid('RC'), urunId: urun.id, ad: urunAd + ' Reçetesi', kalemler });
    }
    await parcaliKaydet('receteler', receteler, _onceki_receteler);
  }

  async function renderImportPreview(main, parsed) {
    // SolidWorks PVC'li BOM ise ayrı önizleme/kaydetme akışı
    if (parsed.solidworksBom) {
      return renderSolidworksBomPreview(main, parsed);
    }

    const [mevcutHammaddeler, mevcutYarimamuller, mevcutUrunler, mevcutAltMontajlar, mevcutPaketler] = await Promise.all([
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.urunler.all(), Store.altMontajlar.all(), Store.paketler.all()
    ]);

    const hmEslesme = parsed.hammaddeler.map(h => ({
      ...h, mevcut: mevcutHammaddeler.find(x => x.stokKodu === h.stokKod), tip: guessHammaddeTip(h.stokAd, h.birim)
    }));
    const ymEslesme = parsed.yarimamuller.map(y => ({
      ...y, mevcut: mevcutYarimamuller.find(x => x.kod === y.stokKod) || mevcutAltMontajlar.find(x => x.kod === y.stokKod) || mevcutPaketler.find(x => x.kod === y.stokKod)
    }));
    const urunMevcut = mevcutUrunler.find(u => u.kod === parsed.rootKod);

    const yeniHm = hmEslesme.filter(h => !h.mevcut).length;
    const guncelHm = hmEslesme.filter(h => h.mevcut).length;
    const yeniYm = ymEslesme.filter(y => !y.mevcut).length;
    const guncelYm = ymEslesme.filter(y => y.mevcut).length;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="grid grid-2" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Hammadde/Hırdavat</div><div class="kpi-val blue">${hmEslesme.length}</div><div class="muted" style="font-size:10px">${yeniHm} yeni, ${guncelHm} güncellenecek</div></div>
        <div class="kpi"><div class="kpi-lbl">Yarı Mamül/Montaj</div><div class="kpi-val purple">${ymEslesme.length}</div><div class="muted" style="font-size:10px">${yeniYm} yeni, ${guncelYm} güncellenecek</div></div>
      </div>

      <div class="fgroup"><label class="flbl">Nihai Ürün Kodu</label>
        <input class="finput" id="ei-urunkod" value="${App.escapeHtml(parsed.rootKod)}"></div>
      <div class="fgroup"><label class="flbl">Nihai Ürün Adı</label>
        <input class="finput" id="ei-urunad" value="${App.escapeHtml(parsed.rootAd)}"></div>
      ${urunMevcut ? '<div class="fhint" style="color:var(--amber-text)">⚠ Bu kod ile mevcut bir ürün var, reçetesi güncellenecek.</div>' : ''}

      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Hammadde/Hırdavat Önizleme (tip düzenlenebilir)</div>
      <div class="tbl-wrap" style="max-height:220px;overflow:auto"><table class="dtable" style="font-size:11px">
        <tr><th>Durum</th><th>Stok Kodu</th><th>Ad</th><th>Tip</th><th class="r">Fiyat</th></tr>
        ${hmEslesme.map((h, i) => `<tr>
          <td>${h.mevcut ? '<span class="pill pill-amber">Güncelle</span>' : '<span class="pill pill-green">Yeni</span>'}</td>
          <td class="mono">${App.escapeHtml(h.stokKod)}</td>
          <td>${App.escapeHtml(h.stokAd)}</td>
          <td><select class="fselect ei-hm-tip" data-i="${i}" style="font-size:10.5px;padding:3px 6px">
            <option value="plaka" ${h.tip === 'plaka' ? 'selected' : ''}>🪵 Plaka (m²)</option>
            <option value="kenar_bandi" ${h.tip === 'kenar_bandi' ? 'selected' : ''}>📏 Kenar Bandı (m)</option>
            <option value="hirdavat" ${h.tip === 'hirdavat' ? 'selected' : ''}>🔩 Hırdavat/Diğer</option>
          </select></td>
          <td class="r">${App.fmt(h.birimFiyat, 2)} ${App.escapeHtml(h.dvz)}</td>
        </tr>`).join('')}
      </table></div>

      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Yarı Mamül/Alt Montaj/Paket Önizleme (tip düzenlenebilir — PKT kodlu veya açıklamasında "paket" geçenler otomatik Paket olarak işaretlenmiştir)</div>
      <div class="tbl-wrap" style="max-height:220px;overflow:auto"><table class="dtable" style="font-size:11px">
        <tr><th>Durum</th><th>Stok Kodu</th><th>Ad</th><th>Tip</th><th class="r">Referans Fiyat</th></tr>
        ${ymEslesme.map((y, i) => `<tr>
          <td>${y.mevcut ? '<span class="pill pill-amber">Güncelle</span>' : '<span class="pill pill-green">Yeni</span>'}</td>
          <td class="mono">${App.escapeHtml(y.stokKod)}</td>
          <td>${App.escapeHtml(y.stokAd)}</td>
          <td><select class="fselect ei-ym-tip" data-i="${i}" style="font-size:10.5px;padding:3px 6px">
            <option value="yarimamul" ${y.onerilenTip === 'yarimamul' ? 'selected' : ''}>Yarı Mamül</option>
            <option value="altmontaj" ${y.onerilenTip === 'altmontaj' ? 'selected' : ''}>Alt Montaj</option>
            <option value="paket" ${y.onerilenTip === 'paket' ? 'selected' : ''}>📦 Paket</option>
          </select></td>
          <td class="r">${App.fmt(y.birimFiyat, 2)} ${App.escapeHtml(y.dvz)}</td>
        </tr>`).join('')}
      </table></div>
    `;
    const footer = `<button class="btn" id="ei-back">Vazgeç</button><button class="btn btn-green" id="ei-confirm">İçe Aktar ve Kaydet</button>`;
    App.openModal({ title: 'İçe Aktarma Önizlemesi', sub: parsed.items.length + ' satır okundu', body, footer, xwide: true });
    document.getElementById('ei-back').onclick = App.closeModal;

    document.getElementById('ei-confirm').onclick = async () => {
      const urunKod = document.getElementById('ei-urunkod').value.trim();
      const urunAd = document.getElementById('ei-urunad').value.trim();
      if (!urunKod || !urunAd) { App.toast('Ürün kodu ve adı zorunlu', 'err'); return; }

      // Kullanıcının düzenlediği tip seçimlerini al
      document.querySelectorAll('.ei-hm-tip').forEach(sel => {
        hmEslesme[parseInt(sel.dataset.i)].tip = sel.value;
      });
      // Yarı Mamül / Alt Montaj / Paket seçimleri — kullanıcı önizlemede değiştirmiş olabilir
      document.querySelectorAll('.ei-ym-tip').forEach(sel => {
        ymEslesme[parseInt(sel.dataset.i)].secilenTip = sel.value;
      });

      await App.persist(async () => {
        // 1) Hammaddeler: StokKod eşleşirse güncelle, yoksa yeni oluştur
        const hammaddeler = await Store.hammaddeler.all();
    const _onceki_hammaddeler = new Set(hammaddeler.map(x => x && x.id));
        const stokKodToHmId = new Map();
        const stokKodToHmTip = new Map(); // stokKod -> 'plaka'|'hirdavat'|... (kalem oluşturulurken olcu ekleneceği zaman lazım)
        hmEslesme.forEach(h => {
          let kayit = hammaddeler.find(x => x.stokKodu === h.stokKod);
          if (kayit) {
            kayit.ad = h.stokAd; kayit.birimFiyat = h.birimFiyat; kayit.dvz = h.dvz;
            kayit.birim = h.tip === 'plaka' ? 'M2' : (h.birim || 'ADET');
            kayit.tip = h.tip;
          } else {
            kayit = {
              id: App.uid('HM'), tip: h.tip, stokKodu: h.stokKod, ad: h.stokAd,
              birim: h.tip === 'plaka' ? 'M2' : (h.birim || 'ADET'),
              birimFiyat: h.birimFiyat, dvz: h.dvz, fireYuzde: h.tip === 'plaka' ? 8 : 2,
              grainYonu: 'yok', en: h.tip === 'plaka' ? 1830 : null, boy: h.tip === 'plaka' ? 3660 : null,
              sonAlisTarihi: new Date().toISOString().slice(0, 10)
            };
            hammaddeler.push(kayit);
          }
          stokKodToHmId.set(h.stokKod, kayit.id);
          stokKodToHmTip.set(h.stokKod, kayit.tip || h.tip || 'hirdavat');
        });
        await parcaliKaydet('hammaddeler', hammaddeler, _onceki_hammaddeler);

        // 2) Yarı Mamül / Alt Montaj / Paket: her kalem, KULLANICININ ÖNİZLEMEDE
        // SEÇTİĞİ TİPE göre DOĞRU koleksiyona (yarimamuller/altMontajlar/paketler)
        // yazılır. PKT kodlu veya açıklamasında "paket" geçenler varsayılan
        // olarak Paket önerilmişti, ama kullanıcı her satırı değiştirebilir.
        const yarimamuller = await Store.yarimamuller.all();
    const _onceki_yarimamuller = new Set(yarimamuller.map(x => x && x.id));
        const altMontajlar = await Store.altMontajlar.all();
    const _onceki_altMontajlar = new Set(altMontajlar.map(x => x && x.id));
        const paketler = await Store.paketler.all();
    const _onceki_paketler = new Set(paketler.map(x => x && x.id));
        const stokKodToId = new Map();   // her tipten kart için ortak id haritası
        const stokKodToTip = new Map();  // stokKod -> 'yarimamul'|'altmontaj'|'paket'

        ymEslesme.forEach(y => {
          const tip = y.secilenTip || y.onerilenTip || 'yarimamul';
          stokKodToTip.set(y.stokKod, tip);
          const kalemler = parsed.receteKalemleri.get(y.stokKod) || [];
          const hmKalem = kalemler.find(k => stokKodToHmId.has(k.stokKod) && (k.en || k.boy));

          if (tip === 'altmontaj') {
            let kayit = altMontajlar.find(x => x.kod === y.stokKod);
            if (kayit) { kayit.ad = y.stokAd; }
            else {
              kayit = { id: App.uid('AM'), kod: y.stokKod, ad: y.stokAd, aciklama: 'Excelden içe aktarıldı: ' + parsed.rootKod, rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
              altMontajlar.push(kayit);
            }
            stokKodToId.set(y.stokKod, kayit.id);
          } else if (tip === 'paket') {
            let kayit = paketler.find(x => x.kod === y.stokKod);
            if (kayit) { kayit.ad = y.stokAd; }
            else {
              kayit = { id: App.uid('PKT'), kod: y.stokKod, ad: y.stokAd, aciklama: 'Excelden içe aktarıldı: ' + parsed.rootKod, ambalajTipi: 'Koli', koliIciAdet: 1, rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
              paketler.push(kayit);
            }
            stokKodToId.set(y.stokKod, kayit.id);
          } else {
            let kayit = mevcutYarimamuller_ref(yarimamuller, y.stokKod);
            if (kayit) {
              kayit.ad = y.stokAd;
              kayit.referansFiyat = y.birimFiyat || kayit.referansFiyat;
              kayit.referansDvz = y.dvz || kayit.referansDvz;
              if (hmKalem) { kayit.netEn = hmKalem.en || kayit.netEn; kayit.netBoy = hmKalem.boy || kayit.netBoy; kayit.hammaddeId = stokKodToHmId.get(hmKalem.stokKod) || kayit.hammaddeId; }
            } else {
              kayit = {
                id: App.uid('YM'), kod: y.stokKod, ad: y.stokAd,
                netEn: hmKalem ? hmKalem.en : null, netBoy: hmKalem ? hmKalem.boy : null,
                kabaEn: hmKalem ? hmKalem.en : null, kabaBoy: hmKalem ? hmKalem.boy : null,
                adet: 1, renk: '', hammaddeId: hmKalem ? stokKodToHmId.get(hmKalem.stokKod) : null,
                rotaId: null, referansFiyat: y.birimFiyat || null, referansDvz: y.dvz || 'TL',
                aciklama: 'Excelden içe aktarıldı: ' + parsed.rootKod, gorseller: []
              };
              yarimamuller.push(kayit);
            }
            stokKodToId.set(y.stokKod, kayit.id);
          }
        });
        await parcaliKaydet('yarimamuller', yarimamuller, _onceki_yarimamuller);
        await parcaliKaydet('altMontajlar', altMontajlar, _onceki_altMontajlar);
        await parcaliKaydet('paketler', paketler, _onceki_paketler);

        // 3) Ürün + reçete: kök seviyedeki (level=0) kalemler bu ürünün doğrudan reçete kalemleridir
        const urunler = await Store.urunler.all();
    const _onceki_urunler = new Set(urunler.map(x => x && x.id));
        let urun = urunler.find(u => u.kod === urunKod);
        if (urun) { urun.ad = urunAd; }
        else {
          urun = { id: App.uid('URN'), kod: urunKod, ad: urunAd, tip: 'bitmis_urun', aciklama: 'Excelden içe aktarıldı', gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
          urunler.push(urun);
        }
        await parcaliKaydet('urunler', urunler, _onceki_urunler);

        // Excel'deki en/boy verilerini reçete kalemine olcu objesi olarak yaz.
        // Sadece plaka tipi hammadde kalemleri için geçerlidir; diğerlerinde null.
        function olcuObjesiOlustur(k) {
          if (!k.en && !k.boy) return null;
          const isHmPlaka = stokKodToHmId.has(k.stokKod) && stokKodToHmTip.get(k.stokKod) === 'plaka';
          if (!isHmPlaka) return null;
          return { kabaEn: k.en || null, kabaBoy: k.boy || null, netEn: k.en || null, netBoy: k.boy || null };
        }

        const receteler = await Store.receteler.all();
    const _onceki_receteler = new Set(receteler.map(x => x && x.id));
        let recete = receteler.find(r => r.urunId === urun.id);
        const kokKalemler = (parsed.level0 || []).map(k => {
          if (k.stokKod === urunKod) return null; // ürünün kendisi kendi reçetesinde olamaz
          const tip = stokKodToTip.get(k.stokKod) || 'hammadde';
          const refId = stokKodToId.get(k.stokKod) || stokKodToHmId.get(k.stokKod);
          const olcu = olcuObjesiOlustur(k);
          const kalem = { tip: stokKodToId.has(k.stokKod) ? tip : 'hammadde', refId, miktar: k.miktar, birim: k.birim };
          if (olcu) kalem.olcu = olcu;
          return kalem;
        }).filter(k => k && k.refId);
        if (recete) { recete.kalemler = kokKalemler; }
        else { recete = { id: 'RC-' + urun.kod, urunId: urun.id, ad: urunAd + ' Reçetesi', kalemler: kokKalemler }; receteler.push(recete); }
        await parcaliKaydet('receteler', receteler, _onceki_receteler);

        // 4) Her yarımamül/alt montaj/paketin KENDİ alt reçetesini de kaydet
        // (montaj hiyerarşisi) — kart tipine göre DOĞRU alana (yarimamulId/
        // altMontajId/paketId) bağlanır.
        for (const y of ymEslesme) {
          const tip = stokKodToTip.get(y.stokKod) || 'yarimamul';
          const kalemler = (parsed.receteKalemleri.get(y.stokKod) || []).map(k => {
            // KENDİNE REFERANS KORUMASI: Bazı ERP exportlarında bir kart,
            // kendi alt reçetesinde KENDİSİNİ kalem olarak içerebiliyor
            // (örn. TFM..PKT05 altında yine TFM..PKT05 satırı). Bu döngü,
            // maliyet hesabında "hesaplanamayan kalem" hatasına yol açar —
            // bu tür satırlar sessizce atlanır.
            if (k.stokKod === y.stokKod) return null;
            const altTip = stokKodToTip.get(k.stokKod);
            const refId = stokKodToId.get(k.stokKod) || stokKodToHmId.get(k.stokKod);
            if (!refId) return null;
            const olcu = olcuObjesiOlustur(k);
            const kalem = { tip: altTip || (stokKodToHmId.has(k.stokKod) ? 'hammadde' : 'yarimamul'), refId, miktar: k.miktar, birim: k.birim };
            if (olcu) kalem.olcu = olcu;
            return kalem;
          }).filter(Boolean);
          if (!kalemler.length) continue;
          const kartId = stokKodToId.get(y.stokKod);
          const alanAdi = tip === 'altmontaj' ? 'altMontajId' : tip === 'paket' ? 'paketId' : 'yarimamulId';
          const altReceteId = (tip === 'altmontaj' ? 'RC-AM-' : tip === 'paket' ? 'RC-PKT-' : 'RC-YM-') + kartId;
          let altRecete = receteler.find(r => r.id === altReceteId);
          if (altRecete) { altRecete.kalemler = kalemler; }
          else { receteler.push({ id: altReceteId, [alanAdi]: kartId, ad: y.stokAd + ' Alt Reçete', kalemler }); }
        }
        await parcaliKaydet('receteler', receteler, _onceki_receteler);
      });

      const paketSayisi = ymEslesme.filter(y => (y.secilenTip || y.onerilenTip) === 'paket').length;
      const altMontajSayisi = ymEslesme.filter(y => (y.secilenTip || y.onerilenTip) === 'altmontaj').length;
      App.toast(`İçe aktarma tamamlandı: ${hmEslesme.length} hammadde, ${ymEslesme.length - paketSayisi - altMontajSayisi} yarı mamül, ${altMontajSayisi} alt montaj, ${paketSayisi} paket, 1 ürün`, 'ok');
      App.closeModal();
      detayKartId = null;
      render(main);
    };
  }

  function mevcutYarimamuller_ref(arr, kod) {
    return arr.find(x => x.kod === kod);
  }

  // Yarımamül kartı oluşturma/düzenleme formu, Yarı Mamüller sayfasındaki
  // (page_yarimamul.js) AYNI formu (export edilmiş openForm) kullanır —
  // tek bir form mantığı her iki ekrandan da yönetilir, kod tekrarı olmaz.
  async function openYmForm(main, yarimamul, onSaved) {
    const [hammaddeler, rotalar] = await Promise.all([Store.hammaddeler.all(), Store.rotalar.all()]);
    PageModules.yarimamul.openForm(main, yarimamul, hammaddeler, rotalar, onSaved);
  }

  // Alt Montaj kartı: yarımamülden BAĞIMSIZ, kendi ID'si ve kodu olan 4.
  // kart tipi. Tamamen reçete tabanlı çalışır (kendi rotası, amortismanı,
  // GYG oranı bu formda girilir; reçete kalemleri ise detay ekranında
  // "+ Satıra Kalem Ekle" ile düzenlenir).
  async function openAltMontajForm(altMontaj, onSaved) {
    const rotalar = await Store.rotalar.all();
    const d = altMontaj || { kod: '', ad: '', aciklama: '', rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0 };
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kod</label><input class="finput" id="am-kod" value="${App.escapeHtml(d.kod)}" placeholder="örn. AM.CEKMECE.GOVDE"></div>
        <div class="fgroup"><label class="flbl">Ad</label><input class="finput" id="am-ad" value="${App.escapeHtml(d.ad)}" placeholder="örn. Çekmece Gövdesi Montajı"></div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="am-aciklama">${App.escapeHtml(d.aciklama || '')}</textarea></div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Rota, Amortisman ve GYG (Maliyete Eklenir)</div>
      <div class="fgroup"><label class="flbl">Rota</label>
        <div class="flex-gap" style="gap:6px">
          <select class="fselect" id="am-rota" style="flex:1">
            <option value="">— Rota Yok —</option>
            ${rotalar.map(r => `<option value="${r.id}" ${d.rotaId === r.id ? 'selected' : ''}>${App.escapeHtml(r.ad)} (${App.fmtTL(r.toplamMaliyet || 0)})</option>`).join('')}
          </select>
          <button type="button" class="btn btn-sm" id="am-yeni-rota">+ Yeni Rota</button>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Amortisman Gideri (₺, sabit rakam)</label><input class="finput" id="am-amortisman" type="number" step="0.01" value="${d.amortismanGideri || 0}"></div>
        <div class="fgroup"><label class="flbl">GYG Oranı (%, manuel — kalem+rota maliyetine uygulanır)</label><input class="finput" id="am-gyg" type="number" step="0.1" value="${d.gygOraniYuzde || 0}"></div>
      </div>
    `;
    const footer = `<button class="btn" id="am-cancel">Vazgeç</button><button class="btn btn-blue" id="am-save">Kaydet</button>`;
    App.openModal({ title: altMontaj ? 'Alt Montaj Düzenle' : 'Yeni Alt Montaj Kartı', body, footer, wide: true });
    document.getElementById('am-cancel').onclick = App.closeModal;
    document.getElementById('am-yeni-rota').onclick = () => {
      const guncelD = { ...d, kod: document.getElementById('am-kod').value, ad: document.getElementById('am-ad').value, aciklama: document.getElementById('am-aciklama').value, amortismanGideri: document.getElementById('am-amortisman').value, gygOraniYuzde: document.getElementById('am-gyg').value };
      App.closeModal();
      PageModules.rota.openRotaEditorModal(null, (yeniRota) => {
        if (yeniRota) guncelD.rotaId = yeniRota.id;
        openAltMontajForm(guncelD, onSaved);
      });
    };
    document.getElementById('am-save').onclick = async () => {
      const kod = document.getElementById('am-kod').value.trim();
      const ad = document.getElementById('am-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      const altMontajlar = await Store.altMontajlar.all();
    const _onceki_altMontajlar = new Set(altMontajlar.map(x => x && x.id));
      const next = {
        id: d.id || App.uid('AM'),
        kod, ad,
        aciklama: document.getElementById('am-aciklama').value.trim(),
        rotaId: document.getElementById('am-rota').value || null,
        amortismanGideri: parseFloat(document.getElementById('am-amortisman').value) || 0,
        gygOraniYuzde: parseFloat(document.getElementById('am-gyg').value) || 0,
        gorseller: d.gorseller || [],
        olusturmaTarihi: d.olusturmaTarihi || new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.altMontajlar.upsert(next));
      App.toast('Alt montaj kartı kaydedildi: ' + kod, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // ── PAKET KODU OLUŞTUR ───────────────────────────────────────────────────
  // Paket: 5. kart tipi, ürün/yarımamül/alt montaj/hammaddeden BAĞIMSIZ. Esas
  // amacı SANAL bir takip birimidir — gerçek bir üretim parçası değildir,
  // sevkiyat öncesi paketleme/kutu/koli adedini reçeteyle karşılaştırmak için
  // kullanılır. Bu nedenle planlama/satınalma/MRP/depo akışlarına HİÇ girmez
  // (bkz. app.js: kalemIsle → k.tip==='paket' özel dalı). Kendi reçetesi
  // olabilir (Reçete Yap'taki gibi — örn. "1 Koli = 1 Tabla + 1 Aksesuar").
  async function openPaketForm(paket, onSaved) {
    const rotalar = await Store.rotalar.all();
    const d = paket || { kod: '', ad: '', aciklama: '', koliIciAdet: 1, ambalajTipi: 'Koli', rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0 };
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">📦 Paket, sevkiyat öncesi paketleme/koli adedini takip etmek için kullanılan SANAL bir karttır — Satınalma/MRP/Depo süreçlerine hiç girmez, sadece Üretim Tamamla → Kalite Onayı → Sevkiyat İrsaliyesi zincirinde kullanılır.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Paket Kodu</label><input class="finput" id="pkt-kod" value="${App.escapeHtml(d.kod)}" placeholder="örn. RDM.14080.S2.PKT01.15"></div>
        <div class="fgroup"><label class="flbl">Paket Adı</label><input class="finput" id="pkt-ad" value="${App.escapeHtml(d.ad)}" placeholder="örn. Radical 14080 — Paket 1/3"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Ambalaj Tipi</label>
          <select class="fselect" id="pkt-ambalaj">
            <option value="Koli" ${d.ambalajTipi === 'Koli' ? 'selected' : ''}>Koli</option>
            <option value="Kutu" ${d.ambalajTipi === 'Kutu' ? 'selected' : ''}>Kutu</option>
            <option value="Esas Kutu" ${d.ambalajTipi === 'Esas Kutu' ? 'selected' : ''}>Esas Kutu</option>
            <option value="Ambalaj" ${d.ambalajTipi === 'Ambalaj' ? 'selected' : ''}>Ambalaj</option>
            <option value="Diğer" ${d.ambalajTipi === 'Diğer' ? 'selected' : ''}>Diğer</option>
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Koli/Kutu İçi Adet</label><input class="finput" id="pkt-koliadet" type="number" min="1" step="1" value="${d.koliIciAdet || 1}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="pkt-aciklama" placeholder="örn. Paket 1/3 — Beyaz">${App.escapeHtml(d.aciklama || '')}</textarea></div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">📐 Paket Ölçüleri ve Ağırlık — teklif ve sipariş listelerinde gösterilir, navlun/desi hesabında kullanılır</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">En (cm)</label><input class="finput pkt-olcu" id="pkt-en" type="number" min="0" step="0.1" value="${d.en || ''}"></div>
        <div class="fgroup"><label class="flbl">Boy (cm)</label><input class="finput pkt-olcu" id="pkt-boy" type="number" min="0" step="0.1" value="${d.boy || ''}"></div>
        <div class="fgroup"><label class="flbl">Yükseklik (cm)</label><input class="finput pkt-olcu" id="pkt-yukseklik" type="number" min="0" step="0.1" value="${d.yukseklik || ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Net Ağırlık (kg)</label><input class="finput" id="pkt-netagirlik" type="number" min="0" step="0.01" value="${d.netAgirlik || ''}"></div>
        <div class="fgroup"><label class="flbl">Brüt Ağırlık (kg)</label><input class="finput" id="pkt-brutagirlik" type="number" min="0" step="0.01" value="${d.brutAgirlik || ''}"></div>
        <div class="fgroup"><label class="flbl">Hacim / Desi</label>
          <input class="finput" id="pkt-desi" readonly style="background:var(--bg)" value="">
          <div class="fhint" id="pkt-hacim-bilgi">Ölçüler girilince otomatik hesaplanır</div></div>
      </div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Rota, Amortisman ve GYG (Opsiyonel — Paketleme işçiliği maliyeti için)</div>
      <div class="fgroup"><label class="flbl">Rota</label>
        <div class="flex-gap" style="gap:6px">
          <select class="fselect" id="pkt-rota" style="flex:1">
            <option value="">— Rota Yok —</option>
            ${rotalar.map(r => `<option value="${r.id}" ${d.rotaId === r.id ? 'selected' : ''}>${App.escapeHtml(r.ad)} (${App.fmtTL(r.toplamMaliyet || 0)})</option>`).join('')}
          </select>
          <button type="button" class="btn btn-sm" id="pkt-yeni-rota">+ Yeni Rota</button>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Amortisman Gideri (₺, sabit rakam)</label><input class="finput" id="pkt-amortisman" type="number" step="0.01" value="${d.amortismanGideri || 0}"></div>
        <div class="fgroup"><label class="flbl">GYG Oranı (%, manuel)</label><input class="finput" id="pkt-gyg" type="number" step="0.1" value="${d.gygOraniYuzde || 0}"></div>
      </div>
    `;
    const footer = `<button class="btn" id="pkt-cancel">Vazgeç</button><button class="btn btn-blue" id="pkt-save">Kaydet</button>`;
    App.openModal({ title: paket ? 'Paket Kodu Düzenle' : 'Yeni Paket Kodu Oluştur', body, footer, wide: true });
    document.getElementById('pkt-cancel').onclick = App.closeModal;
    // Hacim (m³) ve desi — formül App.olculerdenHacim'de TEK yerde tanımlı,
    // burada tekrar yazılmaz ki iki yerde farklı hesaplanma riski olmasın.
    const olcuHesapla = () => {
      const h = App.olculerdenHacim(
        document.getElementById('pkt-en').value,
        document.getElementById('pkt-boy').value,
        document.getElementById('pkt-yukseklik').value);
      const desiEl = document.getElementById('pkt-desi');
      const bilgiEl = document.getElementById('pkt-hacim-bilgi');
      if (h.gecerli) {
        desiEl.value = App.fmt(h.desi, 2) + ' desi';
        bilgiEl.textContent = 'Hacim: ' + App.fmt(h.m3, 4) + ' m³';
      } else { desiEl.value = ''; bilgiEl.textContent = 'Ölçüler girilince otomatik hesaplanır'; }
    };
    body.querySelectorAll('.pkt-olcu').forEach(i => i.oninput = olcuHesapla);
    olcuHesapla();

    document.getElementById('pkt-yeni-rota').onclick = () => {
      const guncelD = {
        ...d, kod: document.getElementById('pkt-kod').value, ad: document.getElementById('pkt-ad').value,
        ambalajTipi: document.getElementById('pkt-ambalaj').value, koliIciAdet: document.getElementById('pkt-koliadet').value,
        aciklama: document.getElementById('pkt-aciklama').value, amortismanGideri: document.getElementById('pkt-amortisman').value, gygOraniYuzde: document.getElementById('pkt-gyg').value
      };
      App.closeModal();
      PageModules.rota.openRotaEditorModal(null, (yeniRota) => {
        if (yeniRota) guncelD.rotaId = yeniRota.id;
        openPaketForm(guncelD, onSaved);
      });
    };
    document.getElementById('pkt-save').onclick = async () => {
      const kod = document.getElementById('pkt-kod').value.trim();
      const ad = document.getElementById('pkt-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      const paketler = await Store.paketler.all();
    const _onceki_paketler = new Set(paketler.map(x => x && x.id));
      const next = {
        id: d.id || App.uid('PKT'),
        kod, ad,
        ambalajTipi: document.getElementById('pkt-ambalaj').value,
        koliIciAdet: parseInt(document.getElementById('pkt-koliadet').value) || 1,
        // Paket ölçüleri ve ağırlık — teklif/sipariş listelerinde ve navlun
        // hesabında kullanılır. Desi = (en×boy×yükseklik)/3000 (kargo standardı)
        en: parseFloat(document.getElementById('pkt-en').value) || 0,
        boy: parseFloat(document.getElementById('pkt-boy').value) || 0,
        yukseklik: parseFloat(document.getElementById('pkt-yukseklik').value) || 0,
        netAgirlik: parseFloat(document.getElementById('pkt-netagirlik').value) || 0,
        brutAgirlik: parseFloat(document.getElementById('pkt-brutagirlik').value) || 0,
        aciklama: document.getElementById('pkt-aciklama').value.trim(),
        rotaId: document.getElementById('pkt-rota').value || null,
        amortismanGideri: parseFloat(document.getElementById('pkt-amortisman').value) || 0,
        gygOraniYuzde: parseFloat(document.getElementById('pkt-gyg').value) || 0,
        gorseller: d.gorseller || [],
        olusturmaTarihi: d.olusturmaTarihi || new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.paketler.upsert(next));
      App.toast('Paket kodu kaydedildi: ' + kod, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();

// Node ortamında (test) — yalnızca saf mantık fonksiyonları dışa aktarılır.
// PageModules.kartlar'ın kendisi (DOM'a bağımlı) test edilmez.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { yarimamulCascadeSilinebilirMi, urunSilYarimamulCascade };
}
