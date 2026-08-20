// ════════════════════════════════════════════════════════════════════════════
// PROJE TEKLİFİ EKRANI — Mahal bazlı teklif, iskonto, maliyet kırılımı
// ────────────────────────────────────────────────────────────────────────────
// İki çıktı üretir: müşteriye giden TEKLİF (maliyet görünmez) ve üst yönetime
// giden MALİYET RAPORU (hammadde + rota + ek gider kırılımı, kâr marjı).
// ════════════════════════════════════════════════════════════════════════════
PageModules.proje_teklif = (() => {

  let projeId = null, teklifId = null, sekme = 'mahal';
  let _maliyetSoz = {};   // urunId -> {hammadde, rota}

  function ac(pid, tid) { projeId = pid; teklifId = tid; sekme = 'mahal'; }

  async function render(main, params) {
    if (params && params.projeId) { projeId = params.projeId; teklifId = params.teklifId || null; }
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'satis', 'teklif_siparis', 'uretim_planlama', 'pazarlama', 'muhasebe'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran Satış, Planlama, Pazarlama, Muhasebe ve Yönetim rollerine açıktır.</div></div></div>`;
      return;
    }
    const projeler = await Store.projeler.all();
    const p = projeler.find(x => x.id === projeId);
    if (!p) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Proje seçilmedi. Proje Yönetimi ekranından bir proje açıp "Teklif" sekmesine geçin.</div>
        <button class="btn btn-blue" id="pt-projeler" style="margin-top:10px">Proje Yönetimine Git</button></div></div>`;
      const b = document.getElementById('pt-projeler');
      if (b) b.onclick = () => App.goTo('proje');
      return;
    }
    const teklifler = p.teklifler || [];
    const t = teklifler.find(x => x.id === teklifId) || teklifler[teklifler.length - 1];
    if (!t) { teklifListesi(main, p); return; }
    teklifId = t.id;

    await maliyetSozluguKur();
    const h = ProjeTeklifMotor.teklifHesapla(t);
    const mk = ProjeTeklifMotor.maliyetKirilimi(t, _maliyetSoz);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">📋 ${App.escapeHtml(t.ad)}</div>
          <div class="page-sub">${App.escapeHtml(p.ad)} · ${App.escapeHtml(p.musteriAdi || '')} · ${App.escapeHtml(t.kod)}</div></div>
        <div class="page-acts"><button class="btn" id="pt-geri">← Projeye Dön</button></div>
      </div>

      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">MAHAL</div><div class="kpi-value">${(t.mahaller || []).length}</div></div>
        <div class="kpi-card"><div class="kpi-label">TEKLİF (KDV hariç)</div><div class="kpi-value">${App.fmtTL(h.matrah)}</div></div>
        <div class="kpi-card"><div class="kpi-label">GENEL TOPLAM</div><div class="kpi-value">${App.fmtTL(h.genelToplam)}</div></div>
        <div class="kpi-card"><div class="kpi-label">KÂR MARJI</div>
          <div class="kpi-value" style="color:${mk.marj == null ? 'inherit' : mk.marj < 15 ? 'var(--red-text)' : 'var(--green-text)'}">
            ${mk.marj != null ? '%' + mk.marj.toFixed(1) : '—'}</div>
          ${!mk.guvenilir ? '<div class="muted" style="font-size:9.5px">eksik maliyet var</div>' : ''}</div>
      </div>

      ${!mk.guvenilir ? `<div class="card" style="margin-bottom:12px;background:var(--amber-bg);border:1px solid var(--amber-text)">
        <div style="padding:6px;font-size:12px;color:var(--amber-text)">
          <b>⚠ ${mk.bilinmeyenAdet} kalemin maliyeti hesaplanamadı</b> — bu kalemler reçetesiz veya
          maliyeti tanımsız. Kâr marjı <b>olduğundan yüksek</b> görünüyor.<br>
          ${mk.bilinmeyenler.slice(0, 4).map(b => `• ${App.escapeHtml(b.mahal)} → ${App.escapeHtml(b.kalem)}`).join('<br>')}
        </div></div>` : ''}

      <div class="tabs" style="margin-bottom:12px">
        <div class="tab ${sekme === 'mahal' ? 'active' : ''}" data-s="mahal">Mahaller</div>
        <div class="tab ${sekme === 'gider' ? 'active' : ''}" data-s="gider">Ek Giderler (montaj/nakliye)</div>
        <div class="tab ${sekme === 'ozet' ? 'active' : ''}" data-s="ozet">Müşteri Teklifi</div>
        <div class="tab ${sekme === 'maliyet' ? 'active' : ''}" data-s="maliyet">🔒 Yönetim — Maliyet</div>
      </div>
      <div id="pt-icerik"></div>`;

    document.getElementById('pt-geri').onclick = () => { teklifId = null; App.goTo('proje'); };
    main.querySelectorAll('.tab').forEach(x => x.onclick = () => { sekme = x.dataset.s; render(main); });

    const el = document.getElementById('pt-icerik');
    if (sekme === 'mahal') mahalCiz(el, p, t, h, main);
    else if (sekme === 'gider') giderCiz(el, p, t, main);
    else if (sekme === 'ozet') ozetCiz(el, p, t, h);
    else maliyetCiz(el, p, t, h, mk);
  }

  // ── ÜRÜN MALİYET VE LİSTE FİYATI SÖZLÜĞÜ ─────────────────────────────────
  // urunMaliyetHesapla SENKRONDUR ve 9 parametre ister; koleksiyonlar bir kez
  // yüklenip tüm ürünler için tek geçişte hesaplanır (her ürün için ayrı
  // yükleme yapmak 25.000 üründe tarayıcıyı kilitler).
  // Liste fiyatı, Ürün Kartları ekranındaki AYNI formülle üretilir:
  //   maliyet × GYG × Nakliye × Kâr ÷ Bölü katsayısı
  async function maliyetSozluguKur() {
    _maliyetSoz = {};
    try {
      const [urunler, receteler, yarimamuller, hammaddeler, rotalar,
             altMontajlar, paketler] = await Promise.all([
        Store.urunler.all(), Store.receteler.all(), Store.yarimamuller.all(),
        Store.hammaddeler.all(), Store.rotalar.all(),
        Store.altMontajlar.all(), Store.paketler.all()
      ]);
      // Ayarlar bir koleksiyon DEĞİL — uygulama durumunda tutulur (App.state).
      const ay = (App.state && App.state.ayarlar) || {};
      const gyg = 1 + (ay.fiyatGygYuzde ?? 10) / 100;
      const nakliye = 1 + (ay.fiyatNakliyeYuzde ?? 7) / 100;
      const kar = 1 + (ay.fiyatKarYuzde ?? 54) / 100;
      const bolu = ay.fiyatBoluKatsayisi ?? 0.45;

      urunler.forEach(u => {
        try {
          const m = App.urunMaliyetHesapla(u, receteler, yarimamuller, hammaddeler,
            rotalar, ay, altMontajlar, urunler, paketler);
          if (!m) return;
          const araToplam = (+m.toplam || 0) * gyg * nakliye * kar;
          _maliyetSoz[u.id] = {
            hammadde: +m.kalemToplami || 0,
            rota: +m.rotaMaliyeti || 0,
            amortisman: +m.amortismanGideri || 0,
            gyg: +m.gygGideri || 0,
            toplamMaliyet: +m.toplam || 0,
            listeFiyati: bolu > 0 ? araToplam / bolu : araToplam,
            eksik: (m.eksikKalemler || []).length
          };
        } catch (e) { /* maliyeti çıkmayan ürün: raporda "bilinmeyen" olarak uyarılır */ }
      });
    } catch (e) { /* sözlük kurulamazsa maliyet bilinmiyor sayılır */ }
  }

  function teklifListesi(main, p) {
    main.innerHTML = `
      <div class="page-hdr"><div><div class="page-title">📋 Proje Teklifleri</div>
        <div class="page-sub">${App.escapeHtml(p.ad)}</div></div>
        <div class="page-acts"><button class="btn btn-blue" id="pt-yeni">+ Yeni Teklif</button>
          <button class="btn" id="pt-geri2">← Projeye Dön</button></div></div>
      <div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu proje için henüz teklif oluşturulmamış. Mahal bazlı teklif hazırlamak için
        "+ Yeni Teklif" ile başlayın.</div></div></div>`;
    document.getElementById('pt-geri2').onclick = () => App.goTo('proje');
    document.getElementById('pt-yeni').onclick = async () => {
      const r = await ProjeTeklifMotor.teklifOlustur(p.id, {});
      if (!r.ok) { App.toast(r.hata, 'err'); return; }
      teklifId = r.teklif.id; App.toast('Teklif oluşturuldu: ' + r.teklif.kod, 'ok');
      render(main);
    };
  }

  // ── MAHALLER ─────────────────────────────────────────────────────────────
  function mahalCiz(el, p, t, h, main) {
    el.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Mahaller (${(t.mahaller || []).length})</div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" id="pt-mahal-ice">📄 Mahal Listesi İçe Aktar</button>
            <button class="btn btn-sm btn-blue" id="pt-mahal-yeni">+ Mahal Ekle</button>
          </div></div>
        <div class="fhint" style="margin-bottom:8px">
          Mahal = mekân tipi (Standart Oda, Suit, Lobi…). Adet kadar çarpılır.
          Kalemler mahal içinde satır iskontosu alır; dip iskonto teklif geneline uygulanır.
        </div>
        ${(t.mahaller || []).length ? (t.mahaller || []).map((m, mi) => {
          const mh = h.mahaller[mi];
          return `<div style="border:1px solid var(--border);border-radius:9px;margin-bottom:10px">
            <div style="padding:8px 10px;background:var(--surface2);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <div><b style="font-size:13px">${App.escapeHtml(m.ad)}</b>
                <span class="muted" style="font-size:11.5px"> × ${m.adet} ${m.adet > 1 ? 'mahal' : ''}
                  · birim ${App.fmtTL(mh.birimNet)}</span></div>
              <div style="display:flex;gap:5px;align-items:center">
                <b style="font-size:12.5px">${App.fmtTL(mh.toplamNet)}</b>
                <button class="btn btn-sm pt-kalem-ekle" data-m="${m.id}">+ Kalem</button>
                <button class="btn btn-sm pt-mahal-kopya" data-m="${m.id}" title="Bu mahali kalemleriyle kopyala">⧉</button>
                <button class="btn btn-sm pt-mahal-duzenle" data-m="${m.id}">✎</button>
                <button class="btn btn-sm pt-mahal-sil" data-m="${m.id}" style="color:var(--red-text)">✕</button>
              </div>
            </div>
            ${(m.kalemler || []).length ? `<table class="dtable" style="margin:0">
              <tr><th>Ürün / Kalem</th><th class="r">Miktar</th><th class="r">Liste Fiyatı</th>
                  <th class="r">İsk %</th><th class="r">Net</th><th></th></tr>
              ${m.kalemler.map((k, ki) => {
                const d = mh.detay[ki];
                return `<tr>
                  <td>${App.escapeHtml(k.ad)}${k.kod ? `<br><span class="muted mono" style="font-size:10px">${App.escapeHtml(k.kod)}</span>` : ''}</td>
                  <td class="r"><input class="finput pt-k-miktar" data-m="${m.id}" data-k="${k.id}" type="number" min="0" step="0.01"
                    value="${k.miktar}" style="width:70px;text-align:right;font-size:11.5px;padding:3px"></td>
                  <td class="r"><input class="finput pt-k-fiyat" data-m="${m.id}" data-k="${k.id}" type="number" min="0" step="0.01"
                    value="${k.listeFiyati}" style="width:90px;text-align:right;font-size:11.5px;padding:3px"></td>
                  <td class="r"><input class="finput pt-k-isk" data-m="${m.id}" data-k="${k.id}" type="number" min="0" max="100" step="0.1"
                    value="${k.iskontoYuzde || 0}" style="width:60px;text-align:right;font-size:11.5px;padding:3px"></td>
                  <td class="r"><b>${App.fmtTL(d.satirNet)}</b></td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm pt-k-kaydet" data-m="${m.id}" data-k="${k.id}">✓</button>
                    <button class="btn btn-sm pt-k-tasi" data-m="${m.id}" data-k="${k.id}" title="Başka mahale taşı">⇄</button>
                    <button class="btn btn-sm pt-k-sil" data-m="${m.id}" data-k="${k.id}" style="color:var(--red-text)">✕</button>
                  </td></tr>`;
              }).join('')}
            </table>` : '<div class="muted" style="padding:10px;font-size:11.5px">Bu mahalde kalem yok. "+ Kalem" ile ekleyin.</div>'}
          </div>`;
        }).join('') : '<div class="muted" style="padding:12px;font-size:12px">Henüz mahal yok.</div>'}
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">İskonto ve Toplam</div></div>
        <table class="dtable">
          <tr><td>Ara toplam (liste fiyatı)</td><td class="r">${App.fmtTL(h.araToplamListe)}</td></tr>
          <tr><td>Satır iskontoları</td><td class="r" style="color:var(--red-text)">−${App.fmtTL(h.satirIskontoToplam)}</td></tr>
          <tr><td>Ara toplam (net)</td><td class="r">${App.fmtTL(h.araToplamNet)}</td></tr>
          <tr><td>Dip iskonto
            <input class="finput" id="pt-dip" type="number" min="0" max="100" step="0.1" value="${t.dipIskonto || 0}"
              style="width:70px;text-align:right;font-size:11.5px;padding:3px;margin-left:6px">%
            <button class="btn btn-sm" id="pt-dip-kaydet">Uygula</button></td>
            <td class="r" style="color:var(--red-text)">−${App.fmtTL(h.dipIskontoTutar)}</td></tr>
          <tr style="font-weight:600"><td>İskontolu toplam</td><td class="r">${App.fmtTL(h.iskontoluToplam)}</td></tr>
          <tr><td>Müşteriye yansıyan giderler</td><td class="r">${App.fmtTL(h.yansiyanGider)}</td></tr>
          <tr style="font-weight:600"><td>Matrah (KDV hariç)</td><td class="r">${App.fmtTL(h.matrah)}</td></tr>
          <tr><td>KDV (%${t.kdvOrani || 20})</td><td class="r">${App.fmtTL(h.kdv)}</td></tr>
          <tr style="background:var(--surface2);font-weight:700">
            <td>GENEL TOPLAM</td><td class="r">${App.fmtTL(h.genelToplam)}</td></tr>
        </table>
      </div>`;

    document.getElementById('pt-mahal-yeni').onclick = () => mahalFormu(main, t, null);
    document.getElementById('pt-mahal-ice').onclick = () => mahalIceAktar(main, t);
    document.getElementById('pt-dip-kaydet').onclick = async () => {
      await guncelle(t, x => { x.dipIskonto = +document.getElementById('pt-dip').value || 0; });
      App.toast('Dip iskonto uygulandı.', 'ok'); render(main);
    };
    el.querySelectorAll('.pt-mahal-duzenle').forEach(b => b.onclick = () =>
      mahalFormu(main, t, (t.mahaller || []).find(m => m.id === b.dataset.m)));
    el.querySelectorAll('.pt-mahal-kopya').forEach(b => b.onclick = async () => {
      const m = (t.mahaller || []).find(x => x.id === b.dataset.m);
      await guncelle(t, x => { x.mahaller.push(ProjeTeklifMotor.mahalKopyala(m)); });
      App.toast('Mahal kopyalandı — kalemler de kopyalandı.', 'ok'); render(main);
    });
    el.querySelectorAll('.pt-mahal-sil').forEach(b => b.onclick = () => {
      App.confirmDialog('Bu mahal ve içindeki tüm kalemler silinecek. Onaylıyor musunuz?', async () => {
        await guncelle(t, x => { x.mahaller = x.mahaller.filter(m => m.id !== b.dataset.m); });
        App.toast('Mahal silindi.', 'ok'); render(main);
      });
    });
    el.querySelectorAll('.pt-kalem-ekle').forEach(b => b.onclick = () => kalemEkleFormu(main, t, b.dataset.m));
    el.querySelectorAll('.pt-k-kaydet').forEach(b => b.onclick = async () => {
      const { m, k } = b.dataset;
      const g = (c) => +el.querySelector(`.${c}[data-m="${m}"][data-k="${k}"]`).value || 0;
      await guncelle(t, x => {
        const kal = x.mahaller.find(y => y.id === m).kalemler.find(y => y.id === k);
        kal.miktar = g('pt-k-miktar'); kal.listeFiyati = g('pt-k-fiyat'); kal.iskontoYuzde = g('pt-k-isk');
      });
      App.toast('Kalem güncellendi.', 'ok'); render(main);
    });
    el.querySelectorAll('.pt-k-sil').forEach(b => b.onclick = async () => {
      await guncelle(t, x => {
        const mm = x.mahaller.find(y => y.id === b.dataset.m);
        mm.kalemler = mm.kalemler.filter(y => y.id !== b.dataset.k);
      });
      App.toast('Kalem silindi.', 'ok'); render(main);
    });
    el.querySelectorAll('.pt-k-tasi').forEach(b => b.onclick = () => kalemTasiFormu(main, t, b.dataset.m, b.dataset.k));
  }

  async function guncelle(t, fn) {
    const liste = await Store.projeler.all();
    const p = liste.find(x => x.id === projeId);
    const tk = (p.teklifler || []).find(x => x.id === t.id);
    tk.mahaller = tk.mahaller || [];
    fn(tk);
    await App.persist(() => Store.topluGuncelle('projeler', [p], 1));
  }

  function mahalFormu(main, t, mevcut) {
    App.openModal({
      title: mevcut ? 'Mahal Düzenle' : '+ Mahal Ekle',
      body: `<div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Mahal Adı *</label>
            <input class="finput" id="mh-ad" value="${App.escapeHtml(mevcut ? mevcut.ad : '')}"
              placeholder="örn. Standart Oda, Suit, Lobi"></div>
          <div class="fgroup"><label class="flbl">Adet</label>
            <input class="finput" id="mh-adet" type="number" min="1" value="${mevcut ? mevcut.adet : 1}"></div>
        </div>
        <div class="fgroup"><label class="flbl">Açıklama</label>
          <input class="finput" id="mh-aciklama" value="${App.escapeHtml(mevcut ? (mevcut.aciklama || '') : '')}"></div>`,
      footer: `<button class="btn" id="mh-vaz">Vazgeç</button><button class="btn btn-green" id="mh-kaydet">Kaydet</button>`
    });
    document.getElementById('mh-vaz').onclick = App.closeModal;
    document.getElementById('mh-kaydet').onclick = async () => {
      const ad = document.getElementById('mh-ad').value.trim();
      if (!ad) { App.toast('Mahal adı zorunlu.', 'err'); return; }
      const adet = Math.max(1, +document.getElementById('mh-adet').value || 1);
      const aciklama = document.getElementById('mh-aciklama').value.trim();
      await guncelle(t, x => {
        if (mevcut) {
          const m = x.mahaller.find(y => y.id === mevcut.id);
          m.ad = ad; m.adet = adet; m.aciklama = aciklama;
        } else x.mahaller.push({ id: App.uid('MHL'), ad, adet, aciklama, kalemler: [] });
      });
      App.closeModal(); App.toast('Mahal kaydedildi.', 'ok'); render(main);
    };
  }

  // ── MAHAL LİSTESİ İÇE AKTARIM ────────────────────────────────────────────
  function mahalIceAktar(main, t) {
    App.openModal({
      title: '📄 Mahal Listesi İçe Aktar',
      body: `<div class="fhint" style="margin-bottom:10px">
          <b>Nasıl kullanılır:</b> AutoCAD'de mahal listesi tablosunu seçip kopyalayın
          (Ctrl+C), ya da PDF'ten metni kopyalayın; aşağıya yapıştırın.<br><br>
          <b>Dürüst uyarı:</b> DWG/PDF dosyasından <b>otomatik</b> mahal çıkarımı güvenilir
          değildir — her ofisin çizim katmanı ve yazı biçimi farklıdır. Bu araç yapıştırdığınız
          <b>metinden</b> mahal adı + adet örüntüsü yakalar ve <b>öneri</b> sunar.
          Listeyi mutlaka gözden geçirin.<br><br>
          <b>Tanınan kalıplar:</b> "Standart Oda x80" · "12 adet Suit" · "Lobi (1)"
        </div>
        <div style="border:1px solid var(--border);border-radius:9px;padding:10px;margin-bottom:12px;background:var(--surface2)">
          <b style="font-size:12.5px">📐 Mimari Plan PDF'inden Otomatik Çıkarım</b>
          <div class="fhint" style="margin:6px 0">
            Mimari plan <b>PDF veya DWG</b> yükleyin. Motor üç biçimi de tanır:<br>
            • <b>DWG (AutoCAD)</b> — çizimdeki mahal adları, ölçüler ve ürün kodları
            doğrudan okunur. CAD motoru ilk kullanımda indirilir (~9,5 MB), sonra
            tarayıcıda saklanır.<br>
            • <b>Yazı modu</b> — mahal adları plana yazılmışsa (MUTFAK, WC, KORİDOR)
            doğrudan okunur. Ölçüler ve teknik notlar ayıklanır.<br>
            • <b>Renk modu</b> — plan lejantla renk kodluysa renkler ve alan sayıları
            bulunur; adları lejant görüntüsüne bakarak siz yazarsınız (yazılar çoğu
            planda vektöre çevrilmiş olduğu için okunamaz).
          </div>
          <input type="file" id="mi-pdf" accept=".pdf,.dwg" style="font-size:12px">
          <div id="mi-pdf-durum" style="margin-top:6px;font-size:11.5px"></div>
        </div>

        <div style="font-size:12.5px;font-weight:600;margin-bottom:4px">veya metin yapıştırın</div>
        <textarea class="ftextarea" id="mi-metin" rows="5"
          placeholder="Standart Oda x80&#10;12 adet Suit&#10;Lobi (1)&#10;Toplantı Salonu x3"></textarea>
        <button class="btn btn-sm btn-blue" id="mi-coz" style="margin-top:6px">Metni Çözümle</button>
        <div id="mi-sonuc" style="margin-top:10px"></div>`,
      footer: `<button class="btn" id="mi-vaz">Kapat</button>`,
      wide: true
    });
    document.getElementById('mi-vaz').onclick = App.closeModal;

    // ── PDF'TEN OTOMATİK ÇIKARIM ─────────────────────────────────────────
    document.getElementById('mi-pdf').onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const durum = document.getElementById('mi-pdf-durum');
      durum.innerHTML = '<span class="muted">Plan çözümleniyor… (büyük planlarda 10-20 saniye sürebilir)</span>';
      try {
        // ── DWG (AutoCAD) ────────────────────────────────────────────────
        if (typeof DwgOkuyucu !== 'undefined' && DwgOkuyucu.dwgDosyasiMi(f)) {
          if (DwgOkuyucu.mobilMi()) {
            const devam = window.confirm(DwgOkuyucu.mobilUyari());
            if (!devam) {
              durum.innerHTML = '<span class="muted">İptal edildi. ' +
                'Bilgisayarda deneyin ya da AutoCAD\'den PDF çıkarıp yükleyin.</span>';
              e.target.value = '';
              return;
            }
          }
          const dk = await PlanOkuyucu.dwgKesif(f, {},
            (m) => { durum.innerHTML = '<span class="muted">' + App.escapeHtml(m) + '</span>'; });
          if (!dk.mahaller.length) {
            durum.innerHTML = '<span style="color:var(--amber-text)">⚠ Çizimde mahal adı bulunamadı. ' +
              'Mahaller yazıyla belirtilmemiş olabilir — elle ekleyin.</span>';
            return;
          }
          kesifGoster(main, t, dk, durum);
          const ek = document.getElementById('mi-sonuc');
          if (ek) ek.insertAdjacentHTML('afterbegin',
            `<div class="fhint" style="margin-bottom:8px">
              <b>DWG okundu.</b> ${dk.varlikSayisi} varlık${dk.dwgSurum ? ', sürüm ' + App.escapeHtml(String(dk.dwgSurum)) : ''} ·
              ${dk.metinSayisi} yazı çözümlendi.</div>`);
          return;
        }

        // ── KEŞİF MODU (mimari plan) ─────────────────────────────────────
        // Önce mahal + DETAY çıkarımı denenir: kapı, duvar bandı, küpeşte,
        // kaplamalar ait oldukları mahale atanır (keşif/icmal mantığı).
        let kesif = null;
        try { kesif = await PlanOkuyucu.kesifCikar(f, 1); } catch (x) { }
        if (kesif && kesif.mahaller.length >= 2 && kesif.toplamDetay >= 5) {
          kesifGoster(main, t, kesif, durum);
          return;
        }

        // Otomatik mod: YAZILI mahal adları, bulunamazsa renk kodlu plan.
        const oto = await PlanOkuyucu.otomatikCoz(f, 1);

        if (oto.mod === 'metin') {
          const liste = oto.metin.mahaller;
          durum.innerHTML = `<span style="color:var(--green-text)">✓ ${liste.length} mahal adı okundu` +
            ` <b>(yazı modu)</b> — adlar plandan geldi, düzeltebilirsiniz</span>`;
          const hedef = document.getElementById('mi-sonuc');
          hedef.innerHTML = `
            <div style="font-size:12px;margin-bottom:6px">
              <b>Plandaki yazılar okundu.</b> Adet, o adın planda kaç kez geçtiğidir.
              Ölçü yazıları (135, 90/200) ve teknik notlar ayıklandı.</div>
            <table class="dtable">
              <tr><th style="width:32px"></th><th>Mahal Adı</th><th class="r">Adet</th></tr>
              ${liste.map((m, i) => `<tr>
                <td><input type="checkbox" class="mp-sec" data-i="${i}" checked></td>
                <td><input class="finput mp-ad" data-i="${i}" value="${App.escapeHtml(m.ad)}"
                  style="width:100%;font-size:11.5px;padding:3px"></td>
                <td class="r"><input class="finput mp-adet" data-i="${i}" type="number" min="1"
                  value="${m.adet}" style="width:70px;text-align:right;font-size:11.5px;padding:3px"></td>
              </tr>`).join('')}
            </table>
            <button class="btn btn-green" id="mp-ekle" style="margin-top:8px">Seçilenleri Mahal Olarak Ekle</button>
            <div class="fhint" style="margin-top:6px">
              WC gibi tekrar eden mahaller birden çok kez yazıldığı için doğru sayılır;
              tek yazılmış büyük mahallerde adedi elle düzeltin.
            </div>`;
          document.getElementById('mp-ekle').onclick = () => mahalleriEkle(main, t, liste.length);
          return;
        }

        const r = oto.renk || { mahaller: [] };
        if (!r.mahaller.length) {
          durum.innerHTML = '<span style="color:var(--amber-text)">⚠ Renk kodlu mahal bulunamadı. ' +
            'Plan renkli boyalı değilse bu yöntem çalışmaz — mahalleri elle ekleyin.</span>';
          return;
        }
        let lejantImg = null;
        try { lejantImg = await PlanOkuyucu.lejantGoruntusu(r, 3); } catch (x) { }
        durum.innerHTML = `<span style="color:var(--green-text)">✓ ${r.mahaller.length} mahal rengi bulundu` +
          `${r.lejantBolge ? ' · lejant sırası algılandı' : ''}</span>`;

        const hedef = document.getElementById('mi-sonuc');
        hedef.innerHTML = `
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            ${lejantImg ? `<div style="flex:0 0 260px">
              <div style="font-size:11.5px;font-weight:600;margin-bottom:4px">Plandaki lejant</div>
              <img src="${lejantImg}" style="width:100%;border:1px solid var(--border);border-radius:6px">
              <div class="muted" style="font-size:10.5px;margin-top:3px">Adları buradan okuyup sağa yazın</div>
            </div>` : ''}
            <div style="flex:1;min-width:340px">
              <div style="font-size:12px;margin-bottom:6px">
                <b>${r.mahaller.length} renk bulundu.</b> Sıra lejanttaki sırayla aynıdır.
                Adları yazın, gerekmeyenlerin işaretini kaldırın:</div>
              <table class="dtable">
                <tr><th style="width:32px"></th><th style="width:44px">Renk</th>
                    <th>Mahal Adı</th><th class="r">Adet</th></tr>
                ${r.mahaller.map((m, i) => `<tr>
                  <td><input type="checkbox" class="mp-sec" data-i="${i}" ${m.lejantta ? 'checked' : ''}></td>
                  <td><span style="display:inline-block;width:22px;height:22px;border-radius:4px;
                    border:1px solid #999;background:${m.css}"></span></td>
                  <td><input class="finput mp-ad" data-i="${i}" placeholder="örn. VIP Alanı"
                    style="width:100%;font-size:11.5px;padding:3px"></td>
                  <td class="r"><input class="finput mp-adet" data-i="${i}" type="number" min="1"
                    value="${m.adet}" style="width:70px;text-align:right;font-size:11.5px;padding:3px"></td>
                </tr>`).join('')}
              </table>
              <button class="btn btn-green" id="mp-ekle" style="margin-top:8px">Seçilenleri Mahal Olarak Ekle</button>
              <div class="fhint" style="margin-top:6px">
                Adet, plandaki boyalı alan sayısıdır. Bitişik parçalar birleştirilir ama
                <b>mutlaka kontrol edin</b> — bölünmüş odalar fazla sayılabilir.
              </div>
            </div>
          </div>`;

        document.getElementById('mp-ekle').onclick = () => mahalleriEkle(main, t, r.mahaller.length);
      } catch (err) {
        const mesaj = err && err.message ? err.message : String(err);
        durum.innerHTML = '<span style="color:var(--red-text)">✕ ' + App.escapeHtml(mesaj) + '</span>' +
          '<div style="margin-top:6px"><button class="btn btn-sm" id="mi-teshis">🔎 Sunucu Ayarlarını Kontrol Et</button></div>' +
          '<div id="mi-teshis-sonuc" style="margin-top:6px"></div>';
        const tb = document.getElementById('mi-teshis');
        if (tb) tb.onclick = async () => {
          const h = document.getElementById('mi-teshis-sonuc');
          h.innerHTML = '<span class="muted" style="font-size:11.5px">Kontrol ediliyor…</span>';
          try {
            const r = await DwgOkuyucu.sunucuTeshisi();
            h.innerHTML = `<div style="font-size:11.5px;border:1px solid var(--border);border-radius:8px;padding:8px">
              <b>Sunucudan gelen ayarlar</b><br>
              • CSP başlığı: ${r.csp ? '<span class="mono" style="font-size:10px">' + App.escapeHtml(r.csp.slice(0, 200)) + '</span>' : '<i>gönderilmiyor</i>'}<br>
              • WebAssembly izni: ${r.cspWasmIzni ? '<span style="color:var(--green-text)">VAR</span>'
                : '<span style="color:var(--red-text)">YOK</span>'}<br>
              • CAD motoru dosyası: ${r.wasmUlasilir ? '<span style="color:var(--green-text)">erişilebilir</span>'
                : '<span style="color:var(--red-text)">bulunamadı</span>'}
                ${r.wasmTipi ? ' · tip: <span class="mono" style="font-size:10px">' + App.escapeHtml(r.wasmTipi) + '</span>' : ''}<br>
              • CAD klasörü izni: ${r.workerCsp && /'unsafe-eval'/.test(r.workerCsp)
                ? '<span style="color:var(--green-text)">VAR</span>'
                : '<span style="color:var(--red-text)">YOK — vendor/dwg/.htaccess eksik</span>'}<br>
              <div style="margin-top:6px;color:${r.yenilemeGerekli ? 'var(--green-text)' : 'var(--amber-text)'}">
                ${r.notlar.map(n => '• ' + App.escapeHtml(n)).join('<br>')}
              </div>
              ${r.yenilemeGerekli ? `<button class="btn btn-sm btn-blue" id="mi-yenile"
                style="margin-top:8px">↻ Sayfayı Yenile ve Tekrar Dene</button>` : ''}
            </div>`;
            const yb = document.getElementById('mi-yenile');
            if (yb) yb.onclick = () => window.location.reload(true);
          } catch (e) {
            h.innerHTML = '<span style="color:var(--red-text);font-size:11.5px">Teşhis çalıştırılamadı: ' +
              App.escapeHtml((e && e.message) || String(e)) + '</span>';
          }
        };
      }
    };

    document.getElementById('mi-coz').onclick = () => {
      const oneriler = ProjeTeklifMotor.mahalListesiCikar(document.getElementById('mi-metin').value);
      const hedef = document.getElementById('mi-sonuc');
      if (!oneriler.length) {
        hedef.innerHTML = `<div style="font-size:12px;color:var(--amber-text)">
          Tanınan kalıpta mahal bulunamadı. Satırları "Ad x Adet" biçimine getirip tekrar deneyin,
          ya da mahalleri elle ekleyin.</div>`;
        return;
      }
      hedef.innerHTML = `<div style="font-size:12px;margin-bottom:6px"><b>${oneriler.length} mahal önerisi</b>
          — eklemek istemediklerinizin işaretini kaldırın:</div>
        <table class="dtable">
          <tr><th style="width:36px"></th><th>Mahal</th><th class="r">Adet</th><th>Kaynak satır</th></tr>
          ${oneriler.map((o, i) => `<tr>
            <td><input type="checkbox" class="mi-sec" data-i="${i}" checked></td>
            <td><input class="finput mi-ad" data-i="${i}" value="${App.escapeHtml(o.ad)}" style="font-size:11.5px;padding:3px"></td>
            <td class="r"><input class="finput mi-adet" data-i="${i}" type="number" min="1" value="${o.adet}"
              style="width:70px;text-align:right;font-size:11.5px;padding:3px"></td>
            <td class="muted" style="font-size:10.5px">${App.escapeHtml(o.kaynakSatir)}</td></tr>`).join('')}
        </table>
        <button class="btn btn-green" id="mi-ekle" style="margin-top:8px">Seçilenleri Mahal Olarak Ekle</button>`;
      document.getElementById('mi-ekle').onclick = async () => {
        const secili = [...document.querySelectorAll('.mi-sec:checked')].map(c => +c.dataset.i);
        if (!secili.length) { App.toast('Hiç mahal seçilmedi.', 'err'); return; }
        await guncelle(t, x => {
          secili.forEach(i => {
            const ad = document.querySelector(`.mi-ad[data-i="${i}"]`).value.trim();
            const adet = Math.max(1, +document.querySelector(`.mi-adet[data-i="${i}"]`).value || 1);
            if (ad) x.mahaller.push({ id: App.uid('MHL'), ad, adet, aciklama: '', kalemler: [] });
          });
        });
        App.closeModal(); App.toast(secili.length + ' mahal eklendi.', 'ok'); render(main);
      };
    };
  }

  // ── KEŞİF SONUCU GÖSTERİMİ ───────────────────────────────────────────────
  // Mahaller ve içlerindeki detaylar. Adet ve ad düzenlenebilir; detaylar
  // mahalin kalemleri olarak teklife aktarılır.
  function kesifGoster(main, t, kesif, durum) {
    durum.innerHTML = `<span style="color:var(--green-text)">✓ ${kesif.mahaller.length} mahal ve
      ${kesif.toplamDetay} detay okundu <b>(keşif modu)</b></span>`;
    const hedef = document.getElementById('mi-sonuc');
    hedef.innerHTML = `
      <div class="fhint" style="margin-bottom:8px">
        <b>Keşif taslağı hazır.</b> Her detay, plandaki konumuna göre en yakın mahale atandı —
        derslikteki kapı dersliğin, koridordaki küpeşte koridorun altına yazıldı.<br>
        <b>Kontrol edin:</b> Bu mekânsal bir tahmindir, oda sınırı analizi değil. Bitişik
        mahaller arasındaki bir detay yanlış tarafa düşmüş olabilir. Adet ve adları
        düzenleyebilir, gerekmeyen mahalleri çıkarabilirsiniz.
      </div>
      <div style="max-height:420px;overflow:auto">
      ${kesif.mahaller.map((m, i) => `
        <div style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="checkbox" class="mp-sec" data-i="${i}" checked>
            <input class="finput mp-ad" data-i="${i}" value="${App.escapeHtml(m.ad)}"
              style="flex:1;min-width:180px;font-size:12px;padding:3px;font-weight:600">
            <span class="muted" style="font-size:11px">adet</span>
            <input class="finput mp-adet" data-i="${i}" type="number" min="1" value="${m.adet}"
              style="width:70px;text-align:right;font-size:11.5px;padding:3px">
            ${m.birimM2 ? `<span class="pill pill-blue" style="font-size:9.5px">${m.birimM2} m²/adet · toplam ${m.toplamM2} m²</span>` : ''}
          </div>
          ${(() => {
            // MİMARİ YORUM: mahal tipine göre beklenen tefriş. Planda sembol
            // yoksa bile bir mimarın keşifte ekleyeceği kalemler önerilir.
            const oneri = (typeof PlanOkuyucu !== 'undefined' && PlanOkuyucu.mahalTefrisi)
              ? PlanOkuyucu.mahalTefrisi(m.ad) : [];
            if (!oneri.length) return '';
            // Zaten çizimden gelen kalemler tekrar önerilmez
            const mevcut = new Set((m.detaylar || []).map(d => (d.sinif || '').toLocaleLowerCase('tr')));
            const yeniler = oneri.filter(o => !mevcut.has(o.ad.toLocaleLowerCase('tr')));
            if (!yeniler.length) return '';
            return `<div style="margin-top:6px;padding:6px 8px;background:var(--surface2);border-radius:6px">
              <div style="font-size:11px;font-weight:600;color:var(--blue)">
                💡 Bu mahal tipi için tipik tefriş (çizimde sembolü yok — mimari yorum)</div>
              <table class="dtable" style="margin-top:4px">
                ${yeniler.map((o, oi) => `<tr>
                  <td style="width:30px"><input type="checkbox" class="mp-t-sec" data-i="${i}" data-t="${oi}"></td>
                  <td style="font-size:11.5px">${App.escapeHtml(o.ad)}</td>
                  <td class="r"><input class="finput mp-t-adet" data-i="${i}" data-t="${oi}" type="number"
                    min="0" value="${o.varsayilan}" style="width:64px;text-align:right;font-size:11px;padding:2px"></td>
                  <td style="font-size:11px;width:50px">${o.birim}</td>
                </tr>`).join('')}
              </table>
              <div class="muted" style="font-size:10px;margin-top:3px">
                İşaretlediklerinizin adedi mahal başınadır; ${m.adet} mahal için çarpılır.</div>
            </div>`;
          })()}
          ${m.detaylar.length ? `<table class="dtable" style="margin-top:6px">
            <tr><th style="width:30px"></th><th>Kalem</th><th class="r">Miktar</th><th>Birim</th><th>Plandaki karşılığı</th></tr>
            ${m.detaylar.map((d, di) => `<tr>
              <td><input type="checkbox" class="mp-d-sec" data-i="${i}" data-d="${di}" checked></td>
              <td style="font-size:11.5px">${App.escapeHtml(d.sinif)}
                ${d.tefris ? '<span class="pill pill-blue" style="font-size:8.5px;margin-left:3px">tefriş</span>' : ''}
                ${d.cozuldu === false ? '<span class="pill pill-amber" style="font-size:8.5px;margin-left:3px">adı çözülemedi</span>' : ''}</td>
              <td class="r"><input class="finput mp-d-adet" data-i="${i}" data-d="${di}" type="number"
                min="0" step="0.01" value="${d.adet}" style="width:70px;text-align:right;font-size:11px;padding:2px"></td>
              <td style="font-size:11px">${d.birim}</td>
              <td class="muted" style="font-size:10px">${App.escapeHtml((d.ornekler || []).slice(0, 2).join(' · ').slice(0, 60))}</td>
            </tr>`).join('')}
          </table>` : '<div class="muted" style="font-size:11px;padding:4px">Bu mahale atanmış detay yok.</div>'}
        </div>`).join('')}
      </div>
      <button class="btn btn-green" id="mp-kesif-ekle" style="margin-top:8px">
        Mahalleri ve Kalemleri Teklife Aktar</button>`;

    document.getElementById('mp-kesif-ekle').onclick = async () => {
      try {
        const secili = [...document.querySelectorAll('.mp-sec:checked')].map(c => +c.dataset.i);
        if (!secili.length) { App.toast('Hiç mahal seçilmedi.', 'err'); return; }
        let mahalSayisi = 0, kalemSayisi = 0;
        await guncelle(t, x => {
          secili.forEach(i => {
            const ad = document.querySelector(`.mp-ad[data-i="${i}"]`).value.trim();
            const adet = Math.max(1, +document.querySelector(`.mp-adet[data-i="${i}"]`).value || 1);
            if (!ad) return;
            const kalemler = [];
            // Seçili tefriş önerileri
            const oneri = (typeof PlanOkuyucu !== 'undefined' && PlanOkuyucu.mahalTefrisi)
              ? PlanOkuyucu.mahalTefrisi(kesif.mahaller[i].ad) : [];
            const mevcutAd = new Set((kesif.mahaller[i].detaylar || []).map(d => (d.sinif || '').toLocaleLowerCase('tr')));
            oneri.filter(o => !mevcutAd.has(o.ad.toLocaleLowerCase('tr'))).forEach((o, oi) => {
              const sec = document.querySelector(`.mp-t-sec[data-i="${i}"][data-t="${oi}"]`);
              if (!sec || !sec.checked) return;
              const mik = +document.querySelector(`.mp-t-adet[data-i="${i}"][data-t="${oi}"]`).value || 0;
              if (mik <= 0) return;
              kalemler.push({
                id: App.uid('MK'), urunId: null, kod: '',
                ad: o.ad, birim: o.birim, miktar: mik,
                listeFiyati: 0, iskontoYuzde: 0,
                planNotu: 'Mimari yorum — çizimde sembolü yok'
              });
              kalemSayisi++;
            });
            (kesif.mahaller[i].detaylar || []).forEach((d, di) => {
              const sec = document.querySelector(`.mp-d-sec[data-i="${i}"][data-d="${di}"]`);
              if (!sec || !sec.checked) return;
              const mik = +document.querySelector(`.mp-d-adet[data-i="${i}"][data-d="${di}"]`).value || 0;
              if (mik <= 0) return;
              kalemler.push({
                id: App.uid('MK'), urunId: null, kod: '',
                ad: d.sinif, birim: d.birim,
                miktar: mik, listeFiyati: 0, iskontoYuzde: 0,
                planNotu: (d.ornekler || []).join(' · ')
              });
              kalemSayisi++;
            });
            x.mahaller.push({
              id: App.uid('MHL'), ad, adet,
              aciklama: kesif.mahaller[i].birimM2 ? kesif.mahaller[i].birimM2 + ' m² (plandan)' : 'Plandan keşif',
              m2: kesif.mahaller[i].birimM2 || null,
              kalemler
            });
            mahalSayisi++;
          });
        });
        App.closeModal();
        App.toast(`${mahalSayisi} mahal, ${kalemSayisi} kalem aktarıldı — fiyatları girin.`, 'ok');
        render(main);
      } catch (e) { App.toast('Aktarılamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  // Her iki plan modunda da ortak: işaretli satırları mahal olarak ekler
  async function mahalleriEkle(main, t, toplam) {
    const secili = [...document.querySelectorAll('.mp-sec:checked')].map(c => +c.dataset.i);
    const eklenecek = [];
    secili.forEach(i => {
      const adEl = document.querySelector(`.mp-ad[data-i="${i}"]`);
      const adetEl = document.querySelector(`.mp-adet[data-i="${i}"]`);
      if (!adEl) return;
      const ad = adEl.value.trim();
      const adet = Math.max(1, +(adetEl ? adetEl.value : 1) || 1);
      if (ad) eklenecek.push({ ad, adet });
    });
    if (!eklenecek.length) { App.toast('Ad yazılmış mahal yok — adları girin.', 'err'); return; }
    await guncelle(t, x => {
      eklenecek.forEach(m => x.mahaller.push({
        id: App.uid('MHL'), ad: m.ad, adet: m.adet, aciklama: 'Plandan çıkarıldı', kalemler: []
      }));
    });
    App.closeModal();
    App.toast(eklenecek.length + ' mahal eklendi.', 'ok');
    render(main);
  }

  async function kalemEkleFormu(main, t, mahalId) {
    const urunler = await Store.urunler.all();
    App.openModal({
      title: '+ Kalem Ekle',
      body: `<div class="fgroup"><label class="flbl">Ürün (bitmiş ürün kataloğundan)</label>
          <input class="finput" id="ke-urun" list="ke-liste" placeholder="Ürün adı veya kodu yazın">
          <datalist id="ke-liste">${urunler.slice(0, 800).map(u =>
            `<option value="${App.escapeHtml((u.kod || '') + ' — ' + (u.ad || ''))}"></option>`).join('')}</datalist></div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Miktar</label>
            <input class="finput" id="ke-miktar" type="number" min="0" step="0.01" value="1"></div>
          <div class="fgroup"><label class="flbl">Liste Fiyatı (₺)</label>
            <input class="finput" id="ke-fiyat" type="number" min="0" step="0.01" value="0"></div>
          <div class="fgroup"><label class="flbl">İskonto %</label>
            <input class="finput" id="ke-isk" type="number" min="0" max="100" step="0.1" value="0"></div>
        </div>
        <div id="ke-bilgi" style="font-size:11.5px;margin:4px 0 8px;min-height:16px"></div>
        <div class="fhint">Ürün seçilirse önerilen liste fiyatı otomatik gelir (maliyet × GYG × nakliye × kâr ÷ bölü).
          Katalog dışı kalem için ürün alanını boş bırakıp adı elle yazabilirsiniz.</div>
        <div class="fgroup"><label class="flbl">Katalog dışı kalem adı</label>
          <input class="finput" id="ke-ad" placeholder="(ürün seçtiyseniz boş bırakın)"></div>`,
      footer: `<button class="btn" id="ke-vaz">Vazgeç</button><button class="btn btn-green" id="ke-kaydet">Ekle</button>`,
      wide: true
    });
    const urunInp = document.getElementById('ke-urun');
    // Ürün seçilince ÖNERİLEN LİSTE FİYATI otomatik gelir (maliyet sözlüğünden).
    const fiyatGetir = () => {
      const v = urunInp.value.split('—')[0].trim();
      const u = urunler.find(x => (x.kod || '') === v);
      const bilgi = document.getElementById('ke-bilgi');
      if (!u) { if (bilgi) bilgi.innerHTML = ''; return; }
      const m = _maliyetSoz[u.id];
      if (m && m.listeFiyati) {
        document.getElementById('ke-fiyat').value = Math.round(m.listeFiyati);
        if (bilgi) bilgi.innerHTML = `<span style="color:var(--green-text)">
          Önerilen liste fiyatı: <b>${App.fmtTL(m.listeFiyati)}</b></span>
          <span class="muted"> · maliyet ${App.fmtTL(m.toplamMaliyet)}
          (hammadde ${App.fmtTL(m.hammadde)} + rota ${App.fmtTL(m.rota)})</span>
          ${m.eksik ? `<br><span style="color:var(--amber-text)">⚠ ${m.eksik} kalemin maliyeti eksik</span>` : ''}`;
      } else if (bilgi) {
        bilgi.innerHTML = '<span style="color:var(--amber-text)">⚠ Bu ürünün maliyeti hesaplanamadı — fiyatı elle girin.</span>';
      }
    };
    urunInp.onchange = fiyatGetir;
    urunInp.oninput = () => { setTimeout(fiyatGetir, 100); };
    document.getElementById('ke-vaz').onclick = App.closeModal;
    document.getElementById('ke-kaydet').onclick = async () => {
      const v = urunInp.value.split('—')[0].trim();
      const u = urunler.find(x => (x.kod || '') === v);
      const elleAd = document.getElementById('ke-ad').value.trim();
      const ad = u ? (u.ad || u.kod) : elleAd;
      if (!ad) { App.toast('Ürün seçin veya kalem adı yazın.', 'err'); return; }
      await guncelle(t, x => {
        const m = x.mahaller.find(y => y.id === mahalId);
        m.kalemler = m.kalemler || [];
        m.kalemler.push({
          id: App.uid('MK'), urunId: u ? u.id : null, kod: u ? u.kod : '',
          ad, miktar: +document.getElementById('ke-miktar').value || 1,
          listeFiyati: +document.getElementById('ke-fiyat').value || 0,
          iskontoYuzde: +document.getElementById('ke-isk').value || 0
        });
      });
      App.closeModal(); App.toast('Kalem eklendi.', 'ok'); render(main);
    };
  }

  function kalemTasiFormu(main, t, mahalId, kalemId) {
    const digerleri = (t.mahaller || []).filter(m => m.id !== mahalId);
    if (!digerleri.length) { App.toast('Taşınacak başka mahal yok.', 'err'); return; }
    App.openModal({
      title: 'Kalemi Taşı',
      body: `<div class="fgroup"><label class="flbl">Hedef Mahal</label>
        <select class="fselect" id="kt-hedef">${digerleri.map(m =>
          `<option value="${m.id}">${App.escapeHtml(m.ad)} (×${m.adet})</option>`).join('')}</select></div>`,
      footer: `<button class="btn" id="kt-vaz">Vazgeç</button><button class="btn btn-green" id="kt-tasi">Taşı</button>`
    });
    document.getElementById('kt-vaz').onclick = App.closeModal;
    document.getElementById('kt-tasi').onclick = async () => {
      const hedef = document.getElementById('kt-hedef').value;
      let sonuc = null;
      await guncelle(t, x => { sonuc = ProjeTeklifMotor.kalemTasi(x, mahalId, kalemId, hedef); });
      if (sonuc && !sonuc.ok) { App.toast(sonuc.hata, 'err'); return; }
      App.closeModal(); App.toast('Kalem taşındı.', 'ok'); render(main);
    };
  }

  // ── EK GİDERLER ──────────────────────────────────────────────────────────
  function giderCiz(el, p, t, main) {
    const ekler = t.ekGiderler || [];
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Ek Giderler</div>
        <button class="btn btn-sm btn-blue" id="pt-gider-ekle">+ Gider Ekle</button></div>
      <div class="fhint" style="margin-bottom:8px">
        Montaj, nakliye, taşıma, şantiye, konaklama gibi kalemler. <b>"Müşteriye yansıt"</b>
        işaretliyse teklif tutarına eklenir; işaretli değilse yalnızca <b>maliyete</b> girer
        (yani kârdan düşer, müşteri görmez).
      </div>
      ${ekler.length ? `<table class="dtable">
        <tr><th>Gider</th><th class="r">Tutar</th><th style="text-align:center">Müşteriye Yansıt</th><th>Not</th><th></th></tr>
        ${ekler.map((g, i) => `<tr>
          <td>${App.escapeHtml(g.ad)}</td>
          <td class="r">${App.fmtTL(g.tutar)}</td>
          <td style="text-align:center">${g.musteriyeYansit
            ? '<span class="pill pill-green" style="font-size:9.5px">Evet</span>'
            : '<span class="pill pill-gray" style="font-size:9.5px">Hayır (iç maliyet)</span>'}</td>
          <td style="font-size:11px">${App.escapeHtml(g.not || '')}</td>
          <td><button class="btn btn-sm pt-gider-sil" data-i="${i}" style="color:var(--red-text)">✕</button></td>
        </tr>`).join('')}
        <tr style="background:var(--surface2);font-weight:600">
          <td>TOPLAM</td><td class="r">${App.fmtTL(ekler.reduce((a, g) => a + (+g.tutar || 0), 0))}</td>
          <td colspan="3"></td></tr>
      </table>` : '<div class="muted" style="padding:12px;font-size:12px">Ek gider yok.</div>'}
    </div>`;

    document.getElementById('pt-gider-ekle').onclick = () => {
      const turler = ['Montaj / Kurulum', 'Nakliye / Taşıma', 'Şantiye Gideri', 'Konaklama',
        'Vinç / Ekipman', 'Ambalaj', 'Sigorta', 'Proje / Danışmanlık', 'Diğer'];
      App.openModal({
        title: '+ Ek Gider',
        body: `<div class="frow">
            <div class="fgroup" style="flex:2"><label class="flbl">Gider Türü *</label>
              <input class="finput" id="gd-ad" list="gd-liste" placeholder="Seçin veya yazın">
              <datalist id="gd-liste">${turler.map(x => `<option value="${x}"></option>`).join('')}</datalist></div>
            <div class="fgroup"><label class="flbl">Tutar (₺) *</label>
              <input class="finput" id="gd-tutar" type="number" min="0" step="0.01" value="0"></div>
          </div>
          <div class="fgroup"><label class="flbl">Müşteriye yansıtılsın mı?</label>
            <select class="fselect" id="gd-yansit">
              <option value="1">Evet — teklif tutarına eklensin</option>
              <option value="">Hayır — yalnızca iç maliyet (kârdan düşer)</option></select></div>
          <div class="fgroup"><label class="flbl">Not</label><input class="finput" id="gd-not"></div>`,
        footer: `<button class="btn" id="gd-vaz">Vazgeç</button><button class="btn btn-green" id="gd-kaydet">Ekle</button>`
      });
      document.getElementById('gd-vaz').onclick = App.closeModal;
      document.getElementById('gd-kaydet').onclick = async () => {
        const ad = document.getElementById('gd-ad').value.trim();
        const tutar = +document.getElementById('gd-tutar').value || 0;
        if (!ad) { App.toast('Gider türü zorunlu.', 'err'); return; }
        if (tutar <= 0) { App.toast('Tutar sıfırdan büyük olmalı.', 'err'); return; }
        await guncelle(t, x => {
          x.ekGiderler = x.ekGiderler || [];
          x.ekGiderler.push({ ad, tutar, musteriyeYansit: !!document.getElementById('gd-yansit').value,
            not: document.getElementById('gd-not').value.trim() });
        });
        App.closeModal(); App.toast('Gider eklendi.', 'ok'); render(main);
      };
    };
    el.querySelectorAll('.pt-gider-sil').forEach(b => b.onclick = async () => {
      await guncelle(t, x => { x.ekGiderler.splice(+b.dataset.i, 1); });
      App.toast('Gider silindi.', 'ok'); render(main);
    });
  }

  // ── MÜŞTERİ TEKLİFİ (maliyet GÖRÜNMEZ) ───────────────────────────────────
  function ozetCiz(el, p, t, h) {
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Müşteri Teklifi — Yazdırılabilir Özet</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm" id="pt-yazdir">🖨 Antetli Yazdır / PDF</button>
          <button class="btn btn-sm" id="pt-excel">⤓ Excel Teklif</button>
          <button class="btn btn-sm" id="pt-icmal">📑 Yönetim İcmali (Excel)</button>
          <button class="btn btn-sm" id="pt-logo">🖼 Logolar</button>
          <button class="btn btn-sm btn-green" id="pt-siparis">→ Siparişe Dönüştür</button>
        </div></div>
      <div class="fhint" style="margin-bottom:10px">
        Bu görünümde <b>maliyet bilgisi yer almaz</b> — müşteriye giden belgede yalnızca
        liste fiyatı, iskonto ve net tutar görünür.
      </div>
      <div id="pt-yazdirilacak">
        <div style="padding:10px 0;border-bottom:2px solid var(--border);margin-bottom:10px">
          <div style="font-size:16px;font-weight:700">${App.escapeHtml(p.ad)}</div>
          <div style="font-size:12.5px;color:var(--muted)">
            Müşteri: ${App.escapeHtml(p.musteriAdi || '')} · Teklif No: ${App.escapeHtml(t.kod)} ·
            Tarih: ${new Date().toLocaleDateString('tr')}</div>
        </div>
        ${(t.mahaller || []).map((m, mi) => {
          const mh = h.mahaller[mi];
          return `<div style="margin-bottom:12px">
            <div style="font-weight:600;font-size:13px;padding:5px 0;border-bottom:1px solid var(--border)">
              ${App.escapeHtml(m.ad)} ${m.adet > 1 ? `<span class="muted">× ${m.adet}</span>` : ''}</div>
            <table class="dtable" style="margin-top:4px">
              <tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">İsk %</th><th class="r">Tutar</th></tr>
              ${(m.kalemler || []).map((k, ki) => `<tr>
                <td>${App.escapeHtml(k.ad)}</td>
                <td class="r">${k.miktar}</td>
                <td class="r">${App.fmtTL(k.listeFiyati)}</td>
                <td class="r">${k.iskontoYuzde || 0}%</td>
                <td class="r">${App.fmtTL(mh.detay[ki].satirNet)}</td></tr>`).join('')}
              <tr style="font-weight:600"><td colspan="4">${App.escapeHtml(m.ad)} toplamı
                ${m.adet > 1 ? `(birim ${App.fmtTL(mh.birimNet)} × ${m.adet})` : ''}</td>
                <td class="r">${App.fmtTL(mh.toplamNet)}</td></tr>
            </table></div>`;
        }).join('')}
        <table class="dtable" style="margin-top:10px">
          <tr><td>Ara toplam</td><td class="r">${App.fmtTL(h.araToplamNet)}</td></tr>
          ${h.dipIskontoTutar ? `<tr><td>Dip iskonto (%${h.dipIskontoOran})</td>
            <td class="r">−${App.fmtTL(h.dipIskontoTutar)}</td></tr>` : ''}
          ${h.yansiyanGider ? `<tr><td>Montaj / nakliye vb.</td><td class="r">${App.fmtTL(h.yansiyanGider)}</td></tr>` : ''}
          <tr style="font-weight:600"><td>Toplam (KDV hariç)</td><td class="r">${App.fmtTL(h.matrah)}</td></tr>
          <tr><td>KDV (%${t.kdvOrani || 20})</td><td class="r">${App.fmtTL(h.kdv)}</td></tr>
          <tr style="background:var(--surface2);font-weight:700">
            <td>GENEL TOPLAM</td><td class="r">${App.fmtTL(h.genelToplam)}</td></tr>
        </table>
      </div></div>`;
    document.getElementById('pt-yazdir').onclick = async () => {
      try {
        const { firma, musteri, logolar } = await antetVerisi(p);
        TeklifExcel.yazdir(t, h, firma, musteri, logolar);
      } catch (e) { App.toast('Yazdırılamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
    document.getElementById('pt-excel').onclick = async () => {
      try {
        const { firma, musteri } = await antetVerisi(p);
        TeklifExcel.indir(t, h, firma, musteri);
        App.toast('Excel teklif indirildi.', 'ok');
      } catch (e) { App.toast('İndirilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    };
    document.getElementById('pt-icmal').onclick = () => {
      try {
        TeklifExcel.icmalIndir(t, h, _maliyetSoz, { gygYuzde: (App.state && App.state.ayarlar && App.state.ayarlar.fiyatGygYuzde) || 10 });
        App.toast('Yönetim maliyet icmali indirildi.', 'ok');
      } catch (e) { App.toast('İndirilemedi: ' + (e && e.message ? e.message : e), 'err'); }
    };
    document.getElementById('pt-logo').onclick = () => logoFormu(main, p);
    document.getElementById('pt-siparis').onclick = () => siparisFormu(p, t, h);
  }

  // ── YÖNETİM MALİYET RAPORU ───────────────────────────────────────────────
  function maliyetCiz(el, p, t, h, mk) {
    const oran = (v) => mk.toplam ? (v / mk.toplam * 100).toFixed(1) : '0';
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">🔒 Üst Yönetim — Maliyet Kırılımı</div></div>
      <div class="fhint" style="margin-bottom:10px">
        Bu görünüm <b>yalnızca iç kullanım içindir</b>, müşteri teklifinde yer almaz.
        Hammadde ve rota maliyetleri ürün reçetelerinden hesaplanır.
      </div>
      <table class="dtable">
        <tr><th>Kalem</th><th class="r">Tutar</th><th class="r">Payı</th></tr>
        <tr><td>Hammadde (reçetelerden)</td><td class="r">${App.fmtTL(mk.hammadde)}</td><td class="r">%${oran(mk.hammadde)}</td></tr>
        <tr><td>Rota / işçilik (rotalardan)</td><td class="r">${App.fmtTL(mk.rota)}</td><td class="r">%${oran(mk.rota)}</td></tr>
        <tr><td>Amortisman</td><td class="r">${App.fmtTL(mk.amortisman || 0)}</td><td class="r">%${oran(mk.amortisman || 0)}</td></tr>
        <tr><td>GYG (genel yönetim gideri)</td><td class="r">${App.fmtTL(mk.gygGider || 0)}</td><td class="r">%${oran(mk.gygGider || 0)}</td></tr>
        <tr><td>Ek giderler (montaj, nakliye…)</td><td class="r">${App.fmtTL(mk.ekGider)}</td><td class="r">%${oran(mk.ekGider)}</td></tr>
        <tr style="font-weight:600"><td>TOPLAM MALİYET</td><td class="r">${App.fmtTL(mk.toplam)}</td><td class="r">%100</td></tr>
      </table>

      <table class="dtable" style="margin-top:12px">
        <tr><td>Net gelir (KDV hariç, iskontolu)</td><td class="r">${App.fmtTL(mk.gelir)}</td></tr>
        <tr><td>Toplam maliyet</td><td class="r">−${App.fmtTL(mk.toplam)}</td></tr>
        <tr style="background:var(--surface2);font-weight:700">
          <td>KÂR</td><td class="r" style="color:${mk.kar >= 0 ? 'var(--green-text)' : 'var(--red-text)'}">
            ${App.fmtTL(mk.kar)} ${mk.marj != null ? `(%${mk.marj.toFixed(1)})` : ''}</td></tr>
      </table>

      ${!mk.guvenilir ? `<div style="margin-top:12px;padding:10px;background:var(--amber-bg);border-radius:8px;font-size:12px;color:var(--amber-text)">
        <b>⚠ Bu rapor eksik:</b> ${mk.bilinmeyenAdet} kalemin maliyeti hesaplanamadı
        (reçetesi yok veya maliyeti tanımsız). Gerçek kâr <b>gösterilenden düşüktür</b>.
        <div style="margin-top:6px;font-size:11px">
          ${mk.bilinmeyenler.slice(0, 10).map(b => `• ${App.escapeHtml(b.mahal)} → ${App.escapeHtml(b.kalem)} (${b.miktar} adet)`).join('<br>')}
          ${mk.bilinmeyenler.length > 10 ? `<br>… ve ${mk.bilinmeyenler.length - 10} kalem daha` : ''}
        </div></div>` : ''}

      <div style="margin-top:12px">
        <div style="font-weight:600;font-size:12.5px;margin-bottom:6px">Mahal Bazlı Kârlılık</div>
        <table class="dtable">
          <tr><th>Mahal</th><th class="r">Adet</th><th class="r">Gelir (net)</th><th class="r">Payı</th></tr>
          ${(t.mahaller || []).map((m, mi) => {
            const mh = h.mahaller[mi];
            return `<tr><td>${App.escapeHtml(m.ad)}</td><td class="r">${m.adet}</td>
              <td class="r">${App.fmtTL(mh.toplamNet)}</td>
              <td class="r">%${h.araToplamNet ? (mh.toplamNet / h.araToplamNet * 100).toFixed(1) : 0}</td></tr>`;
          }).join('')}
        </table>
      </div></div>`;
  }

  // ── SİPARİŞE DÖNÜŞTÜR ────────────────────────────────────────────────────
  function siparisFormu(p, t, h) {
    const kalemler = ProjeTeklifMotor.siparisKalemleriUret(t);
    if (!kalemler.length) { App.toast('Teklifte kalem yok — önce mahal ve kalem ekleyin.', 'err'); return; }
    App.openModal({
      title: '→ Siparişe Dönüştür', sub: App.escapeHtml(t.ad),
      body: `<div class="fhint" style="margin-bottom:10px">
          Mahaller düzleştirilip sipariş kalemine çevrilecek. Her kalemin miktarı
          <b>mahal adediyle çarpılır</b>. Aynı ürün farklı mahallerde ise ayrı satır kalır —
          hangi mahale ait olduğu üretim ve sevkiyatta gereklidir.
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Termin Tarihi</label>
            <input class="finput" id="so-termin" type="date" value="${p.bitis || ''}"></div>
          <div class="fgroup"><label class="flbl">Sipariş Notu</label>
            <input class="finput" id="so-not" value="Proje: ${App.escapeHtml(p.ad)} · Teklif: ${App.escapeHtml(t.kod)}"></div>
        </div>
        <div style="max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin-top:8px">
          <table class="dtable" style="margin:0">
            <tr><th>Mahal</th><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim</th><th class="r">Tutar</th></tr>
            ${kalemler.slice(0, 50).map(k => `<tr>
              <td style="font-size:11px">${App.escapeHtml(k.mahal)}</td>
              <td style="font-size:11.5px">${App.escapeHtml(k.ad)}</td>
              <td class="r">${k.miktar}</td>
              <td class="r">${App.fmtTL(k.birimFiyat)}</td>
              <td class="r">${App.fmtTL(k.tutar)}</td></tr>`).join('')}
          </table>
        </div>
        <div style="margin-top:8px;font-size:12.5px">
          <b>${kalemler.length}</b> kalem · Toplam <b>${App.fmtTL(h.matrah)}</b> (KDV hariç)
          ${kalemler.length > 50 ? '<br><span class="muted">(ilk 50 gösteriliyor)</span>' : ''}
        </div>`,
      footer: `<button class="btn" id="so-vaz">Vazgeç</button>
               <button class="btn btn-green" id="so-olustur">Siparişi Oluştur</button>`,
      wide: true
    });
    document.getElementById('so-vaz').onclick = App.closeModal;
    document.getElementById('so-olustur').onclick = async () => {
      try {
        // ÖNEMLİ: Alan adları STANDART sipariş kaydıyla BİREBİR aynı olmalı.
        // Cari onay ekranı 'cari_onay_bekliyor' durumunu, planlama ekranı
        // 'toplam' ve 'uretimKuyrugunda' alanlarını arar. Farklı isim
        // kullanılırsa sipariş hiçbir ekranda görünmez.
        const siparis = {
          id: App.uid('SIP'),
          kod: 'SIP-' + Date.now().toString(36).toUpperCase(),
          teklifId: null,
          musteriId: p.musteriId || null, musteriAdi: p.musteriAdi || '',
          projeId: p.id, projeTeklifId: t.id,
          tarih: new Date().toISOString().slice(0, 10),
          terminTarihi: document.getElementById('so-termin').value || '',
          uretimTermini: document.getElementById('so-termin').value || null,
          not: document.getElementById('so-not').value.trim(),
          kalemler,
          ekGiderler: (t.ekGiderler || []).filter(g => g.musteriyeYansit),
          araToplam: h.araToplamNet,
          genelIskontoYuzde: h.dipIskontoOran || 0,
          toplam: h.matrah,
          toplamTutar: h.matrah,          // eski ekranlarla uyum
          durum: 'cari_onay_bekliyor',    // cari onay ekranına düşer
          uretimKuyrugunda: false,
          kaynak: 'proje_teklifi',
          olusturan: App.aktifRol()
        };
        await App.persist(() => Store.topluEkle('siparisler', [siparis], 1));
        // Teklif ve proje ile bağla (çift yönlü iz)
        const liste = await Store.projeler.all();
        const pr = liste.find(x => x.id === p.id);
        const tk = (pr.teklifler || []).find(x => x.id === t.id);
        if (tk) { tk.siparisId = siparis.id; tk.durum = 'siparise_dondu'; }
        pr.siparisler = pr.siparisler || [];
        pr.siparisler.push(siparis.id);
        await App.persist(() => Store.topluGuncelle('projeler', [pr], 1));
        App.closeModal();
        App.toast('Sipariş oluşturuldu: ' + siparis.kod + ' (' + kalemler.length + ' kalem)', 'ok');
        App.goTo('siparis');
      } catch (e) { App.toast('Sipariş oluşturulamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };
  }

  // ── ANTET VERİSİ ─────────────────────────────────────────────────────────
  // Firma bilgisi ayarlardan, müşteri bilgisi cari karttan, logolar yerel
  // saklamadan gelir. Logolar sunucuya gönderilmez — antet için yerel yeterli.
  async function antetVerisi(proje) {
    let firma = {};
    try {
      const fb = await Store.firmaBilgileri.all();
      firma = (Array.isArray(fb) ? fb[0] : fb) || {};
    } catch (e) { }
    let musteri = {};
    try {
      const ms = await Store.musteriler.all();
      musteri = ms.find(x => x.id === proje.musteriId) || { unvan: proje.musteriAdi };
    } catch (e) { musteri = { unvan: proje.musteriAdi }; }
    let logolar = {};
    try {
      logolar = {
        firmaLogo: localStorage.getItem('uretimos_firma_logo') || null,
        musteriLogo: localStorage.getItem('uretimos_musteri_logo_' + (proje.musteriId || 'genel')) || null
      };
    } catch (e) { }
    return { firma, musteri, logolar };
  }

  function logoFormu(main, proje) {
    const mevcutF = (() => { try { return localStorage.getItem('uretimos_firma_logo'); } catch (e) { return null; } })();
    const anahtarM = 'uretimos_musteri_logo_' + (proje.musteriId || 'genel');
    const mevcutM = (() => { try { return localStorage.getItem(anahtarM); } catch (e) { return null; } })();
    App.openModal({
      title: '🖼 Teklif Antedi — Logolar',
      body: `<div class="fhint" style="margin-bottom:10px">
          Logolar <b>antetli yazdırma / PDF</b> çıktısında görünür. En fazla 400 KB,
          PNG veya JPG. Bilgisayarınızda saklanır, sunucuya gönderilmez.<br>
          <b>Not:</b> Excel çıktısına logo gömülemez (kütüphane kısıtı) — Excel'de
          firma bilgileri metin olarak yer alır. Logolu belge için "Antetli Yazdır" kullanın.
        </div>
        <div class="frow">
          <div class="fgroup" style="flex:1">
            <label class="flbl">Kendi Firma Logonuz</label>
            <div id="lg-f-onizle" style="min-height:56px;border:1px dashed var(--border);border-radius:8px;
              padding:6px;text-align:center;margin-bottom:6px">
              ${mevcutF ? `<img src="${mevcutF}" style="max-height:52px;max-width:100%">`
                : '<span class="muted" style="font-size:11px">Logo yok</span>'}</div>
            <input type="file" id="lg-firma" accept="image/*" style="font-size:11.5px">
            <button class="btn btn-sm" id="lg-f-sil" style="margin-top:5px;${mevcutF ? '' : 'display:none'}">Logoyu Kaldır</button>
          </div>
          <div class="fgroup" style="flex:1">
            <label class="flbl">Müşteri Logosu (${App.escapeHtml(proje.musteriAdi || 'genel')})</label>
            <div id="lg-m-onizle" style="min-height:56px;border:1px dashed var(--border);border-radius:8px;
              padding:6px;text-align:center;margin-bottom:6px">
              ${mevcutM ? `<img src="${mevcutM}" style="max-height:52px;max-width:100%">`
                : '<span class="muted" style="font-size:11px">Logo yok</span>'}</div>
            <input type="file" id="lg-musteri" accept="image/*" style="font-size:11.5px">
            <button class="btn btn-sm" id="lg-m-sil" style="margin-top:5px;${mevcutM ? '' : 'display:none'}">Logoyu Kaldır</button>
          </div>
        </div>`,
      footer: `<button class="btn" id="lg-kapat">Kapat</button>`,
      wide: true
    });
    document.getElementById('lg-kapat').onclick = App.closeModal;
    const yukle = async (girdiId, anahtar, onizleId) => {
      const el = document.getElementById(girdiId);
      if (!el) return;
      el.onchange = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const r = await TeklifExcel.logoOku(f);
        if (!r.ok) { App.toast(r.hata, 'err'); return; }
        try {
          localStorage.setItem(anahtar, r.veri);
          document.getElementById(onizleId).innerHTML =
            `<img src="${r.veri}" style="max-height:52px;max-width:100%">`;
          const silBtn = document.getElementById(onizleId === 'lg-f-onizle' ? 'lg-f-sil' : 'lg-m-sil');
          if (silBtn) silBtn.style.display = '';
          App.toast('Logo kaydedildi.', 'ok');
        } catch (x) { App.toast('Logo kaydedilemedi (depolama dolu olabilir).', 'err'); }
      };
    };
    yukle('lg-firma', 'uretimos_firma_logo', 'lg-f-onizle');
    yukle('lg-musteri', anahtarM, 'lg-m-onizle');
    const logoSil = (anahtar, onizleId, btn) => {
      try { localStorage.removeItem(anahtar); } catch (e) { }
      const o = document.getElementById(onizleId);
      if (o) o.innerHTML = '<span class="muted" style="font-size:11px">Logo yok</span>';
      if (btn) btn.style.display = 'none';
      App.toast('Logo kaldırıldı.', 'ok');
    };
    document.getElementById('lg-f-sil').onclick = (e) =>
      logoSil('uretimos_firma_logo', 'lg-f-onizle', e.currentTarget);
    document.getElementById('lg-m-sil').onclick = (e) =>
      logoSil(anahtarM, 'lg-m-onizle', e.currentTarget);
  }

  return { render, ac };
})();
