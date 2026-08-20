// ════════════════════════════════════════════════════════════════════════════
// QR ETİKET MERKEZİ — barkoddan QR'a toplu dönüşüm ve etiket basımı
//
// Amaç: Sistemdeki tüm kartlar (ürün, yarı mamül, alt montaj, paket,
// hammadde) için tek ekrandan QR etiketi üretmek ve A4 sayfada toplu basmak.
//
// İKİ KULLANIM:
//   1) YENİ QR: kartın kendi kodundan (kod / stokKodu) QR üretilir.
//   2) BARKOD DÖNÜŞÜMÜ: eski sistemden gelen barkod numarası kartta kayıtlıysa
//      ("Eski Barkod" alanı) QR o numarayı taşır — böylece eski etiketler
//      QR'a geçerken numara bütünlüğü korunur.
//
// QR daima KAREDİR (ISO 18004 gereği) ve etrafında sessiz alan bırakılır;
// bu boşluk olmadan kamera QR'ı bulamaz.
// ════════════════════════════════════════════════════════════════════════════
PageModules.qr_etiket = (() => {
  let kartTipi = 'yarimamul';
  let arama = '';
  let etiketBoyutu = 'orta';
  let kaynak = 'kod';          // 'kod' | 'barkod' — QR'a hangi değer yazılacak
  const secili = new Set();

  const TIPLER = {
    urun:       { ad: 'Bitmiş Ürün', store: () => Store.urunler,     kodAlan: 'kod' },
    yarimamul:  { ad: 'Yarı Mamül',  store: () => Store.yarimamuller, kodAlan: 'kod' },
    altmontaj:  { ad: 'Alt Montaj',  store: () => Store.altMontajlar, kodAlan: 'kod' },
    paket:      { ad: 'Paket',       store: () => Store.paketler,     kodAlan: 'kod' },
    hammadde:   { ad: 'Hammadde',    store: () => Store.hammaddeler,  kodAlan: 'stokKodu' }
  };
  // Etiket boyutları: [genişlik mm, QR piksel, sayfa başına sütun]
  const BOYUTLAR = {
    kucuk: { ad: 'Küçük (35×35 mm)', mm: 35, qr: 90,  sutun: 5, aciklama: 'Küçük parçalar, hırdavat' },
    orta:  { ad: 'Orta (50×50 mm)',  mm: 50, qr: 130, sutun: 3, aciklama: 'Yarı mamül, panel' },
    buyuk: { ad: 'Büyük (70×70 mm)', mm: 70, qr: 180, sutun: 2, aciklama: 'Koli, sevkiyat' }
  };

  async function render(main, params) {
    if (params && params.tip) kartTipi = params.tip;
    const tip = TIPLER[kartTipi];
    const kartlar = await tip.store().all();

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">QR Etiket Merkezi</div>
        <div class="page-sub">Kartlardan toplu QR etiketi üretin ve A4 sayfada yazdırın — eski barkod numaraları da QR'a taşınabilir</div></div>
        <div class="page-acts">
          <button class="btn" id="qe-barkod-aktar">📥 Eski Barkod Numaralarını Gir</button>
          <button class="btn btn-blue" id="qe-yazdir" disabled>🖨 Seçilenleri Yazdır (0)</button></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="frow">
          <div class="fgroup" style="flex:1"><label class="flbl">Kart Tipi</label>
            <select class="fselect" id="qe-tip">
              ${Object.entries(TIPLER).map(([k, v]) => `<option value="${k}" ${kartTipi === k ? 'selected' : ''}>${v.ad}</option>`).join('')}
            </select></div>
          <div class="fgroup" style="flex:1.4"><label class="flbl">Ara / Süz</label>
            <input class="finput" id="qe-ara" value="${App.escapeHtml(arama)}" placeholder="Kod veya ad… (örn. CEVIZ, YM-GOVDE)"></div>
          <div class="fgroup" style="flex:1"><label class="flbl">Etiket Boyutu</label>
            <select class="fselect" id="qe-boyut">
              ${Object.entries(BOYUTLAR).map(([k, v]) => `<option value="${k}" ${etiketBoyutu === k ? 'selected' : ''}>${v.ad}</option>`).join('')}
            </select>
            <div class="fhint">${BOYUTLAR[etiketBoyutu].aciklama} · sayfada ${BOYUTLAR[etiketBoyutu].sutun} sütun</div></div>
          <div class="fgroup" style="flex:1"><label class="flbl">QR İçeriği</label>
            <select class="fselect" id="qe-kaynak">
              <option value="kod" ${kaynak === 'kod' ? 'selected' : ''}>Kart kodu (önerilen)</option>
              <option value="barkod" ${kaynak === 'barkod' ? 'selected' : ''}>Eski barkod numarası</option>
            </select>
            <div class="fhint">${kaynak === 'barkod' ? 'Eski barkodu olmayan kartlar atlanır' : 'Sistemdeki kod QR\'a yazılır'}</div></div>
        </div>
      </div>
      <div id="qe-liste"></div>`;

    document.getElementById('qe-tip').onchange = (e) => { kartTipi = e.target.value; secili.clear(); render(main); };
    document.getElementById('qe-boyut').onchange = (e) => { etiketBoyutu = e.target.value; render(main); };
    document.getElementById('qe-kaynak').onchange = (e) => { kaynak = e.target.value; secili.clear(); render(main); };
    const araInp = document.getElementById('qe-ara');
    araInp.oninput = () => { arama = araInp.value; listeCiz(main, kartlar); };
    document.getElementById('qe-barkod-aktar').onclick = () => barkodAktarModal(kartlar, render, main);

    listeCiz(main, kartlar);
  }

  function kartDegeri(k, tipAnahtar) {
    const alan = TIPLER[tipAnahtar].kodAlan;
    return kaynak === 'barkod' ? (k.eskiBarkod || '') : (k[alan] || '');
  }

  function listeCiz(main, kartlar) {
    const el = document.getElementById('qe-liste');
    const f = arama.toLowerCase().trim();
    const tip = TIPLER[kartTipi];
    let liste = kartlar.filter(k => {
      const kod = (k[tip.kodAlan] || '').toLowerCase();
      const ad = (k.ad || '').toLowerCase();
      return !f || kod.includes(f) || ad.includes(f);
    });
    // Eski barkod modunda barkodu olmayanları ayır
    const barkodsuz = kaynak === 'barkod' ? liste.filter(k => !k.eskiBarkod) : [];
    if (kaynak === 'barkod') liste = liste.filter(k => k.eskiBarkod);

    const barkodluSayi = kartlar.filter(k => k.eskiBarkod).length;

    let html = '';
    if (kaynak === 'barkod' && barkodsuz.length) {
      html += `<div class="card" style="border:1px solid var(--amber);background:var(--amber-bg);margin-bottom:12px">
        <div style="font-size:11.5px">⚠ <b>${barkodsuz.length} kartta eski barkod numarası yok</b> — listede gösterilmiyor.
        "📥 Eski Barkod Numaralarını Gir" ile toplu aktarabilirsiniz.</div></div>`;
    }
    if (kaynak === 'kod' && barkodluSayi) {
      html += `<div class="card" style="border:1px solid var(--blue-light);background:var(--blue-bg);margin-bottom:12px">
        <div style="font-size:11.5px">ℹ <b>${barkodluSayi} kartta eski barkod numarası kayıtlı.</b>
        QR'ın eski numarayı taşımasını istiyorsanız "QR İçeriği" seçimini <b>Eski barkod numarası</b> yapın.</div></div>`;
    }

    if (!liste.length) {
      html += `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Kart bulunamadı</div>
        <div class="edesc">${f ? 'Arama kriterine uyan kayıt yok.' : 'Bu tipte kart tanımlanmamış.'}</div></div></div>`;
      el.innerHTML = html;
      return;
    }

    html += `<div class="card">
      <div class="card-hdr">
        <div class="card-title">${tip.ad} — ${liste.length} kayıt</div>
        <label style="font-size:11.5px;display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="qe-hepsi"> Görünenlerin tümünü seç</label>
      </div>
      <div class="fhint" style="margin-bottom:8px">QR önizlemeleri gerçek etiketin küçültülmüş halidir. Yazdırmada <b>${BOYUTLAR[etiketBoyutu].mm}×${BOYUTLAR[etiketBoyutu].mm} mm</b> boyutunda basılır.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;max-height:520px;overflow:auto">
        ${liste.map(k => {
          const deger = kartDegeri(k, kartTipi);
          const sec = secili.has(k.id);
          return `<div class="qe-kart" data-id="${k.id}" style="border:2px solid ${sec ? 'var(--blue)' : 'var(--border)'};border-radius:10px;padding:10px;cursor:pointer;background:${sec ? 'var(--blue-bg)' : 'var(--surface)'};text-align:center">
            <div style="display:flex;justify-content:flex-start;margin-bottom:4px">
              <input type="checkbox" class="qe-sec" data-id="${k.id}" ${sec ? 'checked' : ''}></div>
            <div style="background:#fff;border-radius:6px;padding:4px;display:inline-block">${App.qrSvg(deger, 96)}</div>
            <div class="mono" style="font-size:10.5px;font-weight:700;margin-top:5px;word-break:break-all">${App.escapeHtml(deger)}</div>
            <div class="muted" style="font-size:9.5px;margin-top:2px">${App.escapeHtml((k.ad || '').slice(0, 32))}</div>
            ${kaynak === 'barkod' ? `<div class="muted" style="font-size:9px;margin-top:2px">kart kodu: ${App.escapeHtml(k[tip.kodAlan] || '')}</div>` : ''}
          </div>`;
        }).join('')}
      </div></div>`;
    el.innerHTML = html;

    const sayacGuncelle = () => {
      const btn = document.getElementById('qe-yazdir');
      btn.disabled = !secili.size;
      btn.textContent = `🖨 Seçilenleri Yazdır (${secili.size})`;
    };
    el.querySelectorAll('.qe-kart').forEach(kart => {
      const id = kart.dataset.id;
      const cb = kart.querySelector('.qe-sec');
      const degistir = (yeni) => {
        if (yeni) secili.add(id); else secili.delete(id);
        cb.checked = yeni;
        kart.style.border = '2px solid ' + (yeni ? 'var(--blue)' : 'var(--border)');
        kart.style.background = yeni ? 'var(--blue-bg)' : 'var(--surface)';
        sayacGuncelle();
      };
      kart.onclick = (e) => { if (e.target !== cb) degistir(!secili.has(id)); };
      cb.onclick = (e) => { e.stopPropagation(); degistir(cb.checked); };
    });
    const hepsi = document.getElementById('qe-hepsi');
    if (hepsi) hepsi.onchange = () => {
      liste.forEach(k => hepsi.checked ? secili.add(k.id) : secili.delete(k.id));
      listeCiz(main, kartlar);
      document.getElementById('qe-hepsi').checked = hepsi.checked;
    };
    sayacGuncelle();

    document.getElementById('qe-yazdir').onclick = () => {
      const secilenler = liste.filter(k => secili.has(k.id));
      if (!secilenler.length) return;
      etiketYazdir(secilenler);
    };
  }

  // ── A4 SAYFADA TOPLU ETİKET BASIMI ──────────────────────────────────────
  function etiketYazdir(kartlar) {
    const b = BOYUTLAR[etiketBoyutu];
    const tip = TIPLER[kartTipi];
    const etiketler = kartlar.map(k => {
      const deger = kartDegeri(k, kartTipi);
      const kartKodu = k[tip.kodAlan] || '';
      return `<div class="et">
        <div class="qr">${App.qrSvg(deger, b.qr)}</div>
        <div class="kod">${App.escapeHtml(deger)}</div>
        <div class="ad">${App.escapeHtml((k.ad || '').slice(0, 40))}</div>
        ${kaynak === 'barkod' && kartKodu !== deger ? `<div class="alt">${App.escapeHtml(kartKodu)}</div>` : ''}
      </div>`;
    }).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>QR Etiketleri — ${kartlar.length} adet</title>
      <style>
        @page { size: A4; margin: 8mm; }
        body { font-family: Arial, sans-serif; margin: 0; }
        .sayfa { display: grid; grid-template-columns: repeat(${b.sutun}, ${b.mm}mm); gap: 3mm; }
        .et {
          width: ${b.mm}mm; height: ${b.mm}mm;
          border: 1px solid #000; border-radius: 2mm;
          padding: 2mm; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
          page-break-inside: avoid; overflow: hidden;
        }
        .qr { line-height: 0; }
        .qr svg { display: block; }
        .kod { font-family: monospace; font-size: ${b.mm >= 70 ? 11 : b.mm >= 50 ? 9 : 7}px;
               font-weight: bold; margin-top: 1mm; text-align: center; word-break: break-all; line-height: 1.15; }
        .ad { font-size: ${b.mm >= 70 ? 8 : 6.5}px; color: #444; text-align: center; line-height: 1.15; margin-top: 0.5mm; }
        .alt { font-size: 6px; color: #888; margin-top: 0.5mm; }
        @media print { .et { border: 1px solid #000; } }
      </style></head><body>
      <div class="sayfa">${etiketler}</div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
      </body></html>`);
    w.document.close();
    App.toast(kartlar.length + ' QR etiketi yazdırma penceresine gönderildi', 'ok');
  }

  // ── ESKİ BARKOD NUMARALARINI TOPLU AKTAR ────────────────────────────────
  // Eski sistemden gelen barkod numaralarını kartlara işler. Böylece QR,
  // mevcut barkod numarasını taşıyabilir ve numara bütünlüğü korunur.
  function barkodAktarModal(kartlar, render, main) {
    const tip = TIPLER[kartTipi];
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">
        Eski sisteminizdeki barkod numaralarını buraya yapıştırın. Her satır: <b>KART KODU ; BARKOD NUMARASI</b><br>
        (ayraç olarak noktalı virgül, virgül veya sekme kullanabilirsiniz)<br><br>
        Örnek:<br>
        <span class="mono" style="font-size:10.5px">YM-GOVDE ; 8691234567890<br>YM-RAF ; 8691234567906</span>
      </div>
      <div class="fgroup"><label class="flbl">Barkod Listesi (${tip.ad})</label>
        <textarea class="ftextarea" id="qa-veri" style="height:200px;font-family:monospace;font-size:11px"
          placeholder="KOD ; BARKOD"></textarea></div>
      <div id="qa-onizleme"></div>`;
    App.openModal({ title: '📥 Eski Barkod Numaralarını Aktar', body, xwide: true,
      footer: `<button class="btn" id="qa-cancel">Vazgeç</button>
        <button class="btn" id="qa-kontrol">Kontrol Et</button>
        <button class="btn btn-blue" id="qa-ok" disabled>Aktar</button>` });
    document.getElementById('qa-cancel').onclick = App.closeModal;

    let hazir = null;
    document.getElementById('qa-kontrol').onclick = () => {
      const satirlar = document.getElementById('qa-veri').value.split('\n')
        .map(s => s.trim()).filter(Boolean);
      const eslesen = [], eslesmeyen = [];
      satirlar.forEach(s => {
        const parcalar = s.split(/[;,\t]/).map(x => x.trim()).filter(Boolean);
        if (parcalar.length < 2) { eslesmeyen.push({ satir: s, sebep: 'Ayraç bulunamadı' }); return; }
        const [kod, barkod] = parcalar;
        const kart = kartlar.find(k => String(k[tip.kodAlan] || '').toUpperCase() === kod.toUpperCase());
        if (!kart) { eslesmeyen.push({ satir: s, sebep: 'Kart bulunamadı: ' + kod }); return; }
        eslesen.push({ kart, barkod });
      });
      hazir = eslesen;
      document.getElementById('qa-onizleme').innerHTML = `
        <div style="border:1px solid var(--${eslesen.length ? 'green' : 'red'});background:var(--${eslesen.length ? 'green' : 'red'}-bg);border-radius:8px;padding:10px;margin-top:10px">
          <b style="font-size:12px">${eslesen.length} kayıt eşleşti${eslesmeyen.length ? `, ${eslesmeyen.length} satır eşleşmedi` : ''}</b>
          ${eslesen.length ? `<table class="dtable" style="font-size:10.5px;margin-top:6px">
            <tr><th>Kart</th><th>Ad</th><th>Barkod → QR</th></tr>
            ${eslesen.slice(0, 12).map(e => `<tr>
              <td class="mono">${App.escapeHtml(e.kart[tip.kodAlan] || '')}</td>
              <td>${App.escapeHtml((e.kart.ad || '').slice(0, 26))}</td>
              <td class="mono"><b>${App.escapeHtml(e.barkod)}</b></td></tr>`).join('')}
          </table>${eslesen.length > 12 ? `<div class="muted" style="font-size:10px;margin-top:4px">… ve ${eslesen.length - 12} kayıt daha</div>` : ''}` : ''}
          ${eslesmeyen.length ? `<div style="margin-top:8px;font-size:10.5px;color:var(--red-text)">
            <b>Eşleşmeyenler:</b>${eslesmeyen.slice(0, 6).map(e => `<div>• ${App.escapeHtml(e.satir.slice(0, 40))} — ${App.escapeHtml(e.sebep)}</div>`).join('')}</div>` : ''}
        </div>`;
      document.getElementById('qa-ok').disabled = !eslesen.length;
    };

    document.getElementById('qa-ok').onclick = async () => {
      if (!hazir || !hazir.length) return;
      const store = tip.store();
      const tumu = await store.all();
      let n = 0;
      hazir.forEach(({ kart, barkod }) => {
        const k = tumu.find(x => x.id === kart.id);
        if (k) { k.eskiBarkod = barkod; n++; }
      });
      await App.persist(() => store.save(tumu));
      App.toast(n + ' karta eski barkod numarası işlendi — QR İçeriği seçimini "Eski barkod" yapıp etiket basabilirsiniz', 'ok');
      App.closeModal();
      kaynak = 'barkod';
      secili.clear();
      render(main);
    };
  }

  return { render };
})();
