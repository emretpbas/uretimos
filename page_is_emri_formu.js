// ════════════════════════════════════════════════════════════════════════════
// İŞ EMRİ FORMU EKRANI (FR.29) — teknik resimden üretim
// STEP / DWG / PDF yükle → düzenlenebilir tablo → antetli Excel + PDF
// ════════════════════════════════════════════════════════════════════════════
PageModules.is_emri_formu = (() => {

  let form = null;      // { baslik, satirlar, kaynak }
  let ekBilgi = null;   // PDF'ten gelen malzeme/ölçü önerileri

  function bosForm() {
    return {
      isEmriIsmi: '', isEmriKodu: IsEmriUretici.isEmriKodu(),
      acilisTarihi: new Date().toISOString().slice(0, 10),
      grup: '', altBaslik: '',
      holzma: '', ima: '', rover: '', delik: '',
      satirlar: [], kaynak: ''
    };
  }

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'uretim_planlama', 'arge', 'teknik_ofis', 'uretim'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">İş emri formu Planlama, Ar-Ge, Teknik Ofis ve Üretim rollerine açıktır.</div></div></div>`;
      return;
    }
    if (!form) form = bosForm();

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">📋 İş Emri Formu (FR.29)</div>
          <div class="page-sub">Teknik resimden iş emri — STEP, DWG veya PDF yükleyin</div></div>
        <div class="page-acts">
          <button class="btn" id="ie-temizle">Yeni Form</button>
          <button class="btn btn-blue" id="ie-excel">⤓ Excel</button>
          <button class="btn btn-green" id="ie-pdf">🖨 Antetli PDF</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">1️⃣ Teknik Resim Yükle</div></div>
        <div class="fhint" style="margin-bottom:8px">
          <b>STEP (AP203/AP214) en iyi sonucu verir</b> — Boy, En ve Kalınlık geometriden
          kesin okunur, elle girmeye gerek kalmaz.<br>
          <b>PDF/DWG</b>'de ölçüler bağımsız yazılardır; hangi ölçünün hangi parçaya ait
          olduğu kesin bilinemez. Bu kaynaklarda malzeme kodları ve parça adları okunur,
          ölçüleri siz doldurursunuz. Yanlış ölçüyle iş emri açmak, boş bırakmaktan pahalıdır.
        </div>
        <input type="file" id="ie-dosya" accept=".step,.stp,.STEP,.STP,.pdf,.dwg" style="font-size:12px">
        <div id="ie-durum" style="margin-top:6px;font-size:11.5px"></div>
        <div id="ie-ek" style="margin-top:8px"></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">2️⃣ İş Emri Başlığı</div></div>
        <div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">İŞ EMRİ İSMİ</label>
            <input class="finput ie-b" data-k="isEmriIsmi" value="${App.escapeHtml(form.isEmriIsmi)}"
              placeholder="örn. SOFİNE"></div>
          <div class="fgroup"><label class="flbl">AÇILIŞ TARİHİ</label>
            <input class="finput ie-b" data-k="acilisTarihi" type="date" value="${form.acilisTarihi}"></div>
          <div class="fgroup"><label class="flbl">İŞ EMRİ KODU</label>
            <input class="finput ie-b" data-k="isEmriKodu" value="${App.escapeHtml(form.isEmriKodu)}"></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Grup</label>
            <input class="finput ie-b" data-k="grup" value="${App.escapeHtml(form.grup)}" placeholder="SOFINE"></div>
          <div class="fgroup" style="flex:2"><label class="flbl">Alt Başlık</label>
            <input class="finput ie-b" data-k="altBaslik" value="${App.escapeHtml(form.altBaslik)}"
              placeholder="100LÜK YAN KUTU"></div>
        </div>
        <div class="frow">
          ${['holzma', 'ima', 'rover', 'delik'].map(k => `
            <div class="fgroup"><label class="flbl">${k.toUpperCase()}</label>
              <input class="finput ie-b" data-k="${k}" value="${App.escapeHtml(form[k])}"></div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">3️⃣ Parça Satırları (${form.satirlar.length})</div>
          <button class="btn btn-sm" id="ie-satir-ekle">+ Satır</button></div>
        <div id="ie-tablo"></div>
      </div>`;

    document.getElementById('ie-dosya').onchange = (e) => dosyaOku(main, e);
    document.getElementById('ie-temizle').onclick = () => {
      App.confirmDialog('Form temizlensin mi? Girilen veriler kaybolur.', () => {
        form = bosForm(); ekBilgi = null; render(main);
      });
    };
    document.getElementById('ie-satir-ekle').onclick = () => {
      form.satirlar.push(IsEmriUretici.satirKur(
        { parcaAdi: '', boy: 0, en: 0, kalinlik: 0, adet: 1 },
        form.satirlar.length + 1, 0, {}));
      render(main);
    };
    document.getElementById('ie-excel').onclick = () => excelIndir();
    document.getElementById('ie-pdf').onclick = () => pdfYazdir();
    main.querySelectorAll('.ie-b').forEach(el =>
      el.onchange = () => { form[el.dataset.k] = el.value; });

    tabloCiz(main);
    if (ekBilgi) ekBilgiCiz();
  }

  // ── PARÇA KODU ↔ HAMMADDE/HIRDAVAT/KENAR BANDI/YARI MAMÜL KARTI ──────────
  // Satırdaki parcaKodu, mevcut bir hammadde (stokKodu) veya yarı mamül (kod)
  // kartıyla eşleşiyorsa otomatik bağlanır — parcaKartId/parcaKartTipi doldurulur
  // ve boşsa parça adı karttan alınır. Eşleşme yoksa satır yine de serbest
  // metin olarak kullanılabilir kalır.
  async function kartlaEslestir(satir) {
    if (!satir || !satir.parcaKodu) { if (satir) { satir.parcaKartId = null; satir.parcaKartTipi = ''; } return; }
    try {
      const [hammaddeler, yarimamuller] = await Promise.all([
        Store.hammaddeler.all(), Store.yarimamuller.all()
      ]);
      const h = hammaddeler.find(x => x.stokKodu === satir.parcaKodu);
      if (h) {
        satir.parcaKartId = h.id; satir.parcaKartTipi = 'hammadde';
        if (!satir.parcaAdi) satir.parcaAdi = h.ad || '';
        return;
      }
      const y = yarimamuller.find(x => x.kod === satir.parcaKodu);
      if (y) {
        satir.parcaKartId = y.id; satir.parcaKartTipi = 'yarimamul';
        if (!satir.parcaAdi) satir.parcaAdi = y.ad || '';
        return;
      }
      satir.parcaKartId = null; satir.parcaKartTipi = '';
    } catch (e) { /* eşleştirme başarısız olsa da satır serbest metinle kullanılabilir kalır */ }
  }

  async function tumSatirlariEslestir() {
    await Promise.all(form.satirlar.map(kartlaEslestir));
  }

  // Manuel seçim: hammadde/hırdavat/kenar bandı/yarı mamül kartlarından birini
  // "kalem_secici" ekranı üzerinden seçtirir, satıra bağlar.
  async function parcaKoduSec(i) {
    let hammaddeler = [], yarimamuller = [];
    try {
      [hammaddeler, yarimamuller] = await Promise.all([
        Store.hammaddeler.all(), Store.yarimamuller.all()
      ]);
    } catch (e) { App.toast('Kartlar yüklenemedi: ' + ((e && e.message) || e), 'err'); return; }

    const secenekler = [
      ...hammaddeler.filter(h => h.stokKodu).map(h => ({
        grup: h.tip || 'hirdavat', kod: h.stokKodu, ad: h.ad || '',
        birim: h.birim || '', netFiyat: 0, maliyetYok: true, _id: h.id, _tip: 'hammadde'
      })),
      ...yarimamuller.filter(y => y.kod).map(y => ({
        grup: 'yarimamul', kod: y.kod, ad: y.ad || '',
        birim: y.birim || '', netFiyat: 0, maliyetYok: true, _id: y.id, _tip: 'yarimamul'
      }))
    ];

    App.goTo('kalem_secici', {
      baslik: 'Parça Kodu Seç — Hammadde / Hırdavat / Kenar Bandı / Yarı Mamül',
      secenekler,
      gruplar: { plaka: 'Plaka', hirdavat: 'Hırdavat', kenar_bandi: 'Kenar Bandı', sarf: 'Sarf', yarimamul: 'Yarı Mamül' },
      geriDon: () => App.goTo('is_emri_formu'),
      onSecildi: (secim) => {
        const s = form.satirlar[i];
        if (s) {
          s.parcaKodu = secim.kod;
          if (!s.parcaAdi) s.parcaAdi = secim.ad;
          s.parcaKartId = secim._id;
          s.parcaKartTipi = secim._tip;
        }
        App.goTo('is_emri_formu');
      }
    });
  }

  // ── TABLO ────────────────────────────────────────────────────────────────
  function tabloCiz(main) {
    const el = document.getElementById('ie-tablo');
    if (!form.satirlar.length) {
      el.innerHTML = '<div class="muted" style="padding:12px;font-size:12px">' +
        'Henüz satır yok. Teknik resim yükleyin veya "+ Satır" ile elle ekleyin.</div>';
      return;
    }
    const ozet = IsEmriUretici.ozet(form.satirlar);
    const g = (i, k) => `data-i="${i}" data-k="${k}"`;

    el.innerHTML = `<div class="tbl-wrap" style="overflow-x:auto">
      <table class="dtable" style="font-size:10.5px;min-width:1400px">
        <tr>
          <th rowspan="2" style="width:44px">Paket<br>No</th>
          <th rowspan="2" style="width:46px">Paket<br>Adedi</th>
          <th rowspan="2" style="width:100px">Parç.Kodu</th>
          <th rowspan="2" style="min-width:130px">Parça Adı</th>
          <th rowspan="2" style="width:52px">Kalınlık</th>
          <th rowspan="2" style="width:80px">Renk</th>
          <th colspan="3" style="text-align:center">Net Ölçü</th>
          <th colspan="3" style="text-align:center">Kaba Ölçü</th>
          <th rowspan="2" style="width:56px">Üretim<br>miktarı</th>
          <th rowspan="2" style="width:40px">Yarı<br>Mamül</th>
          <th rowspan="2" style="width:36px">Yatar</th>
          <th rowspan="2" style="width:40px">M.Hiz<br>(+)</th>
          ${['PVC 2mm', 'PVC 1mm', 'PVC 0,40', 'SOFT', 'DÜZ'].map(x =>
            `<th colspan="2" style="text-align:center;width:64px">${x}</th>`).join('')}
          <th rowspan="2" style="min-width:120px">AÇIKLAMALAR</th>
          <th rowspan="2" style="width:56px">birim m²</th>
          <th rowspan="2" style="width:30px"></th>
        </tr>
        <tr>
          <th style="width:36px">Adet</th><th style="width:48px">Boy</th><th style="width:48px">En</th>
          <th style="width:36px">Adet</th><th style="width:48px">Boy</th><th style="width:48px">En</th>
          ${'<th style="width:32px">Boy</th><th style="width:32px">En</th>'.repeat(5)}
        </tr>
        ${form.satirlar.map((s, i) => satirHtml(s, i, g)).join('')}
        <tr style="background:var(--surface2);font-weight:600">
          <td colspan="12">TOPLAM</td>
          <td class="r">${ozet.toplamParca}</td>
          <td colspan="13"></td>
          <td class="r">${ozet.toplamM2}</td><td></td>
        </tr>
      </table></div>

      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        ${ozet.gruplar.map(gr => `<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px">
          <b style="font-size:12px">${gr.grup}</b>
          <div style="font-size:11px;color:var(--muted)">
            ${gr.satir} satır · ${gr.m2.toFixed(3)} m²</div>
        </div>`).join('')}
      </div>`;

    // Alan düzenleme
    el.querySelectorAll('.ie-h').forEach(inp => {
      inp.onchange = () => {
        const i = +inp.dataset.i, k = inp.dataset.k;
        const s = form.satirlar[i];
        if (k.includes('.')) {
          const [a, b] = k.split('.');
          s[a][b] = inp.value;
        } else {
          s[k] = (/^(netAdet|netBoy|netEn|kabaAdet|kabaBoy|kabaEn|kalinlik|paketAdedi|uretimMiktari)$/.test(k))
            ? (+inp.value || 0) : inp.value;
        }
        // Türetilen alanları yeniden hesapla
        if (['netBoy', 'netEn', 'netAdet', 'kalinlik'].includes(k)) {
          const bg = IsEmriUretici.bantGrubu(s.kalinlik);
          s.bantGrup = bg.grup; s.bantInce = bg.ince; s.bantKalin = bg.kalin;
          s.birimM2 = Math.round((s.netBoy * s.netEn) / 1e6 * 1000) / 1000;
          s.toplamM2 = Math.round(s.birimM2 * s.netAdet * 1000) / 1000;
        }
        // Parça kodu elle değiştirildiyse mevcut kartla yeniden eşleştir
        if (k === 'parcaKodu') { kartlaEslestir(s).then(() => tabloCiz(main)); return; }
        tabloCiz(main);
      };
    });
    el.querySelectorAll('.ie-kod-sec').forEach(b => b.onclick = () => parcaKoduSec(+b.dataset.i));
    el.querySelectorAll('.ie-sil').forEach(b => b.onclick = () => {
      form.satirlar.splice(+b.dataset.i, 1);
      form.satirlar.forEach((s, j) => s.sira = j + 1);
      tabloCiz(main);
    });
  }

  function satirHtml(s, i, g) {
    const inp = (k, deger, tip, gen) =>
      `<input class="finput ie-h" ${g(i, k)} ${tip ? 'type="' + tip + '"' : ''}
        value="${App.escapeHtml(deger == null ? '' : String(deger))}"
        style="width:${gen || 100}%;font-size:10.5px;padding:2px;text-align:${tip === 'number' ? 'right' : 'left'}">`;
    const bant = (ad) => `<td>${inp(ad + '.boy', s[ad].boy, 'number')}</td>
                          <td>${inp(ad + '.en', s[ad].en, 'number')}</td>`;
    return `<tr>
      <td>${inp('paketNo', s.paketNo)}</td>
      <td>${inp('paketAdedi', s.paketAdedi, 'number')}</td>
      <td style="white-space:nowrap">${inp('parcaKodu', s.parcaKodu, null, 66)}<button
        class="btn btn-sm ie-kod-sec" data-i="${i}" style="padding:1px 3px;font-size:9px;margin-left:2px"
        title="${s.parcaKartId ? 'Hammadde/Yarı Mamül kartına bağlı: ' + App.escapeHtml(s.parcaKartTipi || '') : 'Kart seç (Hammadde/Hırdavat/Kenar Bandı/Yarı Mamül)'}"
        >${s.parcaKartId ? '🔗' : '🔍'}</button></td>
      <td>${inp('parcaAdi', s.parcaAdi)}</td>
      <td>${inp('kalinlik', s.kalinlik, 'number')}</td>
      <td>${inp('renk', s.renk)}</td>
      <td>${inp('netAdet', s.netAdet, 'number')}</td>
      <td>${inp('netBoy', s.netBoy, 'number')}</td>
      <td>${inp('netEn', s.netEn, 'number')}</td>
      <td>${inp('kabaAdet', s.kabaAdet, 'number')}</td>
      <td>${inp('kabaBoy', s.kabaBoy, 'number')}</td>
      <td>${inp('kabaEn', s.kabaEn, 'number')}</td>
      <td>${inp('uretimMiktari', s.uretimMiktari, 'number')}</td>
      <td>${inp('yariMamul', s.yariMamul)}</td>
      <td>${inp('yatar', s.yatar)}</td>
      <td>${inp('mHiz', s.mHiz)}</td>
      ${bant('pvc2')}${bant('pvc1')}${bant('pvc040')}${bant('soft')}${bant('duz')}
      <td>${inp('aciklamalar', s.aciklamalar)}</td>
      <td class="r">${s.birimM2}</td>
      <td><button class="btn btn-sm ie-sil" data-i="${i}" style="color:var(--red-text);padding:1px 5px">✕</button></td>
    </tr>`;
  }

  // ── DOSYA OKUMA ──────────────────────────────────────────────────────────
  async function dosyaOku(main, e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const durum = document.getElementById('ie-durum');
    const ad = (f.name || '').toLowerCase();
    durum.innerHTML = '<span class="muted">Okunuyor…</span>';
    try {
      if (/\.(step|stp)$/.test(ad)) {
        const metin = await f.text();
        const agac = StepOkuyucu.oku(metin);
        const geo = StepOkuyucu.geometriCikar(metin);
        if (!geo.geometriVar) {
          durum.innerHTML = '<span style="color:var(--amber-text)">⚠ STEP okundu ama geometri yok. ' +
            'SolidWorks\'te "Output as: Solid/Surface geometry" seçili olmalı — ' +
            'Wireframe seçilirse ölçüler çıkmaz.</span>';
          return;
        }
        form.satirlar = IsEmriUretici.stepDenUret(agac, geo, {});
        form.kaynak = 'STEP: ' + f.name;
        if (!form.isEmriIsmi && agac.kok) form.isEmriIsmi = agac.kok.ad;
        durum.innerHTML = `<span style="color:var(--green-text)">✓ ${form.satirlar.length} parça satırı ` +
          `üretildi · ölçüler geometriden KESİN alındı</span>`;
        ekBilgi = null;
        await tumSatirlariEslestir();
        render(main);
        return;
      }

      if (/\.pdf$/.test(ad)) {
        const r = await PlanOkuyucu.metindenCoz(f, 1);   // metin nesnelerini alır
        const metinler = (r && r.mahaller) ? [] : [];
        // metindenCoz mahal odaklıdır; ham metinler için doğrudan okuyucu:
        const ham = await pdfMetinleri(f);
        const u = IsEmriUretici.pdfDenUret(ham, {});
        form.satirlar = u.satirlar;
        form.kaynak = 'PDF: ' + f.name;
        ekBilgi = u;
        durum.innerHTML = `<span style="color:var(--amber-text)">✓ ${u.malzemeler.length} malzeme kodu, ` +
          `${u.urunler.length} ürün bulundu — <b>ölçüleri doldurmanız gerekiyor</b></span>`;
        await tumSatirlariEslestir();
        render(main);
        return;
      }

      if (/\.dwg$/.test(ad)) {
        if (DwgOkuyucu.mobilMi() && !window.confirm(DwgOkuyucu.mobilUyari())) {
          durum.innerHTML = '<span class="muted">İptal edildi.</span>'; return;
        }
        const d = await DwgOkuyucu.metinleriCikar(f,
          (m) => { durum.innerHTML = '<span class="muted">' + App.escapeHtml(m) + '</span>'; });
        const u = IsEmriUretici.pdfDenUret(d.metinler, {});
        form.satirlar = u.satirlar;
        form.kaynak = 'DWG: ' + f.name;
        ekBilgi = u;
        durum.innerHTML = `<span style="color:var(--amber-text)">✓ DWG okundu · ` +
          `${u.malzemeler.length} malzeme kodu — <b>ölçüleri doldurun</b></span>`;
        await tumSatirlariEslestir();
        render(main);
        return;
      }

      durum.innerHTML = '<span style="color:var(--red-text)">Desteklenmeyen dosya. ' +
        'STEP (.step/.stp), PDF veya DWG yükleyin.</span>';
    } catch (err) {
      durum.innerHTML = '<span style="color:var(--red-text)">✕ ' +
        App.escapeHtml((err && err.message) || String(err)) + '</span>';
    }
  }

  // PDF'in ham metin nesnelerini konumlarıyla alır
  async function pdfMetinleri(dosya) {
    if (!window.pdfjsLib) {
      await new Promise((cz, rd) => {
        const s = document.createElement('script');
        s.src = 'pdf.min.js'; s.onload = cz; s.onerror = () => rd(new Error('PDF motoru yüklenemedi.'));
        document.head.appendChild(s);
      });
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions
          && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
      }
    }
    const buf = await dosya.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const tc = await (await doc.getPage(1)).getTextContent();
    return tc.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
  }

  function ekBilgiCiz() {
    const el = document.getElementById('ie-ek');
    if (!el || !ekBilgi) return;
    el.innerHTML = `
      <div style="border:1px solid var(--amber-text);background:var(--amber-bg);
        border-radius:8px;padding:8px;font-size:11.5px">
        <b style="color:var(--amber-text)">⚠ ${App.escapeHtml(ekBilgi.uyari)}</b>
        ${ekBilgi.olcuAdaylari.length ? `<div style="margin-top:5px">
          <b>Plandaki ölçüler:</b> ${ekBilgi.olcuAdaylari.join(' · ')} mm</div>` : ''}
      </div>
      ${ekBilgi.malzemeler.length ? `<table class="dtable" style="margin-top:8px">
        <tr><th>Malzeme Kodu</th><th>Açıklama</th><th>Tip</th><th></th></tr>
        ${ekBilgi.malzemeler.map(m => `<tr>
          <td class="mono" style="font-size:10.5px">${App.escapeHtml(m.kod)}</td>
          <td style="font-size:11px">${App.escapeHtml(m.ad)}</td>
          <td style="font-size:11px">${m.tip === 'kenar_bandi' ? 'Kenar bandı'
            : m.tip === 'kaplama' ? 'Kaplama' : m.tip === 'plaka' ? 'Plaka' : 'Diğer'}</td>
          <td><button class="btn btn-sm ie-kod-ata" data-kod="${App.escapeHtml(m.kod)}">Satırlara ata</button></td>
        </tr>`).join('')}
      </table>` : ''}`;
    el.querySelectorAll('.ie-kod-ata').forEach(b => b.onclick = async () => {
      form.satirlar.forEach(s => { if (!s.parcaKodu) s.parcaKodu = b.dataset.kod; });
      await tumSatirlariEslestir();
      App.toast('Kod boş satırlara atandı.', 'ok');
      render(document.querySelector('main') || document.body);
    });
  }

  // ── EXCEL ÇIKTISI ────────────────────────────────────────────────────────
  function excelIndir() {
    try {
      if (!window.XLSX) throw new Error('Excel kütüphanesi yüklenemedi.');
      if (!form.satirlar.length) { App.toast('Önce satır ekleyin.', 'err'); return; }
      const S = [];
      S.push(['İŞ EMRİ', '', '', '', '', '', '', '', 'Doküman No', 'FR.29']);
      S.push(['İŞ EMRİ İSMİ', form.isEmriIsmi, '', '', '', '', '', '', 'Yayın Tarihi', '15.10.2007']);
      S.push(['İŞ EMRİ AÇILIŞ TARİHİ', form.acilisTarihi, '', '', '', '', '', '', 'Revizyon No', '01']);
      S.push(['İŞ EMRİ KODU', form.isEmriKodu, '', '', '', '', '', '', 'Revizyon Tarihi', '12.12.2012']);
      S.push([]);
      S.push(['Holzma', form.holzma, 'Ima', form.ima, 'Rover', form.rover, 'Delik', form.delik]);
      S.push([]);
      S.push([form.grup, form.altBaslik]);
      S.push(['Paket No', 'Paket Adedi', 'Parç.Kodu', 'Parça Adı', 'Kalınlık', 'Renk',
        'Net Adet', 'Net Boy', 'Net En', 'Kaba Adet', 'Kaba Boy', 'Kaba En',
        'Üretim miktarı', 'Yarı Mamül', 'Yatar', 'M.Hiz(+)',
        'PVC2 Boy', 'PVC2 En', 'PVC1 Boy', 'PVC1 En', 'PVC0,40 Boy', 'PVC0,40 En',
        'SOFT Boy', 'SOFT En', 'DÜZ Boy', 'DÜZ En', 'AÇIKLAMALAR', 'birim m²', 'Bant grubu']);
      form.satirlar.forEach(s => S.push([
        s.paketNo, s.paketAdedi, s.parcaKodu, s.parcaAdi, s.kalinlik, s.renk,
        s.netAdet, s.netBoy, s.netEn, s.kabaAdet, s.kabaBoy, s.kabaEn,
        s.uretimMiktari, s.yariMamul, s.yatar, s.mHiz,
        s.pvc2.boy, s.pvc2.en, s.pvc1.boy, s.pvc1.en, s.pvc040.boy, s.pvc040.en,
        s.soft.boy, s.soft.en, s.duz.boy, s.duz.en, s.aciklamalar, s.birimM2, s.bantGrup
      ]));
      const oz = IsEmriUretici.ozet(form.satirlar);
      S.push([]);
      S.push(['TOPLAM', '', '', '', '', '', '', '', '', '', '', '', oz.toplamParca,
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', oz.toplamM2]);
      oz.gruplar.forEach(g => S.push([g.grup, g.satir + ' satır', g.m2.toFixed(3) + ' m²']));

      const ws = XLSX.utils.aoa_to_sheet(S);
      ws['!cols'] = [{ wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 28 }, { wch: 8 }, { wch: 12 },
        ...Array(6).fill({ wch: 8 }), { wch: 10 }, ...Array(3).fill({ wch: 7 }),
        ...Array(10).fill({ wch: 7 }), { wch: 24 }, { wch: 9 }, { wch: 9 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'İş Emri');
      XLSX.writeFile(wb, (form.isEmriKodu || 'is_emri').replace(/[^\w.-]/g, '_') + '.xlsx');
      App.toast('İş emri Excel\'e aktarıldı.', 'ok');
    } catch (e) { App.toast('Aktarılamadı: ' + ((e && e.message) || e), 'err'); }
  }

  // ── ANTETLİ PDF ──────────────────────────────────────────────────────────
  async function pdfYazdir() {
    try {
      if (!form.satirlar.length) { App.toast('Önce satır ekleyin.', 'err'); return; }
      let firma = {}, logo = null;
      try {
        const fb = await Store.firmaBilgileri.all();
        firma = (Array.isArray(fb) ? fb[0] : fb) || {};
      } catch (e) { }
      try { logo = localStorage.getItem('uretimos_firma_logo'); } catch (e) { }
      const oz = IsEmriUretici.ozet(form.satirlar);
      const esc = App.escapeHtml;
      const w = window.open('', '_blank');
      if (!w) throw new Error('Açılır pencere engellendi.');
      w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${esc(form.isEmriKodu)} — İş Emri</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  body { font-family: Arial, sans-serif; font-size: 8.5px; color: #000; }
  .ust { display:flex; justify-content:space-between; align-items:flex-start;
         border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; }
  .ust img { max-height:44px; max-width:170px; object-fit:contain; }
  h1 { font-size:22px; margin:0; letter-spacing:2px; text-align:center; flex:1; }
  .dok { border:1px solid #000; padding:4px 7px; font-size:8px; line-height:1.5; }
  .bilgi { display:flex; gap:26px; margin-bottom:8px; font-size:10px }
  .bilgi b { display:inline-block; min-width:130px }
  .mak { display:flex; gap:16px; font-size:9.5px; margin-bottom:8px }
  .grup { background:#9e9e9e; color:#000; font-weight:bold; padding:3px 8px; font-size:11px }
  table { width:100%; border-collapse:collapse; }
  th,td { border:1px solid #000; padding:2px 3px; }
  th { background:#d9d9d9; font-size:7.5px; text-align:center }
  td { font-size:8px; height:15px }
  .r{text-align:right} .c{text-align:center}
  tfoot td { background:#eee; font-weight:bold }
</style></head><body>
  <div class="ust">
    <div>${logo ? `<img src="${logo}" alt="">` : `<b style="font-size:17px">${esc(firma.unvan || '')}</b>`}</div>
    <h1>İŞ EMRİ</h1>
    <div class="dok">Doküman No : FR.29<br>Yayın Tarihi : 15.10.2007<br>
      Revizyon No : 01<br>Revizyon Tarihi: 12.12.2012</div>
  </div>
  <div style="display:flex;justify-content:space-between">
    <div class="bilgi" style="flex-direction:column;gap:2px">
      <div><b>İŞ EMRİ İSMİ</b> ${esc(form.isEmriIsmi)}</div>
      <div><b>İŞ EMRİ AÇILIŞ TARİHİ</b> ${esc(form.acilisTarihi)}</div>
      <div><b>İŞ EMRİ KODU</b> ${esc(form.isEmriKodu)}</div>
    </div>
    <div class="mak" style="flex-direction:column;gap:2px">
      <div><b>Holzma :</b> ${esc(form.holzma)}</div><div><b>Ima :</b> ${esc(form.ima)}</div>
      <div><b>Rover :</b> ${esc(form.rover)}</div><div><b>Delik :</b> ${esc(form.delik)}</div>
    </div>
  </div>
  <div style="display:flex;margin-bottom:4px">
    <div class="grup" style="width:200px">${esc(form.grup)}</div>
    <div class="grup" style="flex:1;background:#bdbdbd">${esc(form.altBaslik)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2">Paket<br>No</th><th rowspan="2">Paket<br>Adedi</th>
        <th rowspan="2">Parç.Kodu</th><th rowspan="2">Parça Adı</th>
        <th rowspan="2">Kalınlık</th><th rowspan="2">Renk</th>
        <th colspan="3">Net Ölçü</th><th colspan="3">Kaba Ölçü</th>
        <th rowspan="2">Üretim<br>miktarı</th><th rowspan="2">Yarı<br>Mamül</th>
        <th rowspan="2">Yatar</th><th rowspan="2">M.Hiz<br>(+)</th>
        <th colspan="2">PVC<br>2 mm</th><th colspan="2">PVC<br>1 mm</th>
        <th colspan="2">PVC<br>0,40 mm</th><th colspan="2">SOFT</th><th colspan="2">DÜZ</th>
        <th rowspan="2">AÇIKLAMALAR</th><th rowspan="2">birim m²</th>
      </tr>
      <tr>
        <th>Adet</th><th>Boy</th><th>En</th><th>Adet</th><th>Boy</th><th>En</th>
        ${'<th>Boy</th><th>En</th>'.repeat(5)}
      </tr>
    </thead>
    <tbody>
      ${form.satirlar.map(s => `<tr>
        <td class="c">${esc(s.paketNo)}</td><td class="c">${s.paketAdedi}</td>
        <td>${esc(s.parcaKodu)}</td><td>${esc(s.parcaAdi)}</td>
        <td class="c">${s.kalinlik || ''}</td><td>${esc(s.renk)}</td>
        <td class="c">${s.netAdet || ''}</td><td class="r">${s.netBoy || ''}</td><td class="r">${s.netEn || ''}</td>
        <td class="c">${s.kabaAdet || ''}</td><td class="r">${s.kabaBoy || ''}</td><td class="r">${s.kabaEn || ''}</td>
        <td class="c">${s.uretimMiktari || ''}</td>
        <td class="c">${esc(s.yariMamul)}</td><td class="c">${esc(s.yatar)}</td><td class="c">${esc(s.mHiz)}</td>
        ${['pvc2', 'pvc1', 'pvc040', 'soft', 'duz'].map(b =>
          `<td class="c">${esc(s[b].boy)}</td><td class="c">${esc(s[b].en)}</td>`).join('')}
        <td>${esc(s.aciklamalar)}</td><td class="r">${s.birimM2 || ''}</td>
      </tr>`).join('')}
      ${Array(Math.max(0, 6 - form.satirlar.length)).fill(
        '<tr>' + '<td></td>'.repeat(28) + '</tr>').join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="12" class="r">TOPLAM</td><td class="c">${oz.toplamParca}</td>
      <td colspan="14"></td><td class="r">${oz.toplamM2}</td>
    </tr></tfoot>
  </table>
  <div style="margin-top:8px;display:flex;gap:16px;font-size:9px">
    ${oz.gruplar.map(g => `<div style="border:1px solid #000;padding:3px 8px">
      <b>${g.grup}</b> — ${g.satir} satır · ${g.m2.toFixed(3)} m²</div>`).join('')}
  </div>
  <div style="margin-top:14px;display:flex;justify-content:space-between;font-size:9px">
    <div>Hazırlayan: ______________</div><div>Onaylayan: ______________</div>
    <div>Üretim Sorumlusu: ______________</div>
  </div>
</body></html>`);
      w.document.close();
      setTimeout(() => { try { w.print(); } catch (e) { } }, 450);
    } catch (e) { App.toast('Yazdırılamadı: ' + ((e && e.message) || e), 'err'); }
  }

  return { render };
})();
