// ════════════════════════════════════════════════════════════════════════════
// LOGO TIGER — MALZEME KARTI TOPLU İÇE AKTARIM
// ────────────────────────────────────────────────────────────────────────────
// Tiger'ın "Malzemeler" ekranından alınan Excel/CSV çıktısını okur ve
// ÜretimOS'a hammadde / yarı mamül kartı olarak aktarır.
//
// TIGER SÜTUNLARI (tipik):
//   Türü · Hiyerarşi Kodu · Kodu · Açıklaması · Açıklaması 2 · Üretici Kodu · Ana Birim
//
// TÜR EŞLEME:
//   (HM) Hammadde        → hammaddeler
//   (YM) Yarı Mamul      → yarimamuller
//   (MM) Mamul           → urunler
//   (TM/TİM) Ticari Mal  → hammaddeler (satın alınan hazır parça)
//
// MÜKERRER KORUMASI: Aynı kod sistemde varsa YENİ KART AÇILMAZ. Kullanıcı
// "mevcutları güncelle" derse yalnızca ad/birim güncellenir; fiyat, stok ve
// reçete gibi ÜretimOS'ta üretilmiş veriler korunur — dış sistem bunları
// ezmemelidir.
// ════════════════════════════════════════════════════════════════════════════
PageModules.tiger_aktarim = (() => {

  let satirlar = [];      // ham satırlar (dizi dizisi)
  let basliklar = [];
  let eslesme = {};       // alan -> sütun index
  let dosyaAdi = '';

  // ÖNEMLİ: eşleme sırası ve TAM eşleşme önceliği kritiktir. Tiger'da hem
  // "Kodu" hem "Hiyerarşi Kodu" hem "Üretici Kodu" sütunları var; sadece
  // "içeriyor" bakılırsa "Kodu" yanlış sütuna düşer. Bu yüzden:
  //   1) önce ÖZEL sütunlar (hiyerarşi, üretici, açıklama 2) eşlenir
  //   2) sonra genel olanlar, ve TAM eşleşme kısmi eşleşmeye tercih edilir
  const ALANLAR = [
    { key: 'hiyerarsi', ad: 'Hiyerarşi Kodu', zorunlu: false, sira: 1, tam: ['hiyerarşi kodu', 'hiyerarsi kodu'], ipucu: ['hiyerarş', 'hiyerars'] },
    { key: 'ureticiKod', ad: 'Üretici Kodu', zorunlu: false, sira: 1, tam: ['üretici kodu', 'uretici kodu'], ipucu: ['üretici', 'uretici'] },
    { key: 'ad2', ad: 'Açıklama 2', zorunlu: false, sira: 1, tam: ['açıklaması 2', 'aciklamasi 2', 'açıklama 2'], ipucu: ['açıklaması 2', 'aciklamasi 2'] },
    { key: 'kod', ad: 'Kod', zorunlu: true, sira: 2, tam: ['kodu', 'kod', 'malzeme kodu', 'stok kodu'], ipucu: ['malzeme kod', 'stok kod'] },
    { key: 'ad', ad: 'Açıklama / Ad', zorunlu: true, sira: 2, tam: ['açıklaması', 'aciklamasi', 'açıklama', 'ad', 'malzeme adı'], ipucu: ['açıkla', 'aciklama'] },
    { key: 'tur', ad: 'Türü', zorunlu: false, sira: 2, tam: ['türü', 'turu', 'tür', 'tip'], ipucu: ['tür', 'tur'] },
    { key: 'birim', ad: 'Ana Birim', zorunlu: false, sira: 2, tam: ['ana birim', 'birim', 'br'], ipucu: ['birim'] },
    { key: 'alisFiyat', ad: 'Son Alış Fiyatı', zorunlu: false, sira: 1, tam: ['son s.alma fiyatı (net)', 'son alış fiyatı', 'son alis fiyati'], ipucu: ['s.alma fiyat', 'alış fiyat', 'alis fiyat'] },
    { key: 'stok', ad: 'Fiili Stok', zorunlu: false, sira: 1, tam: ['fiili stok'], ipucu: ['fiili stok'] },
    { key: 'grupKod', ad: 'Grup Kodu', zorunlu: false, sira: 1, tam: ['grup kodu'], ipucu: ['grup kod'] },
    { key: 'ozelKod', ad: 'Özel Kodu', zorunlu: false, sira: 1, tam: ['özel kodu', 'ozel kodu'], ipucu: ['özel kod', 'ozel kod'] }
  ];

  // ── MALZEME TİPİ SINIFLANDIRMA ────────────────────────────────────────────
  // Tiger tüm kartları (HM) olarak verir; plaka/kenar bandı/sarf ayrımı yoktur.
  // Ayrım BİRİM + AD üzerinden yapılır. Kural gerçek veriyle doğrulanmıştır:
  //   M2            → plaka (levha: suntalam, MDF, kaplamalı)
  //   ad'da KENAR BANT → kenar_bandi (birim METRE)
  //   GRAM/KG/LT    → sarf (boya, tutkal, koruyucu, kimyasal)
  //   diğer         → hirdavat
  function tipBelirle(ad, birim) {
    const a = String(ad || '').toLocaleUpperCase('tr');
    const b = String(birim || '').toLocaleUpperCase('tr');
    if (a.includes('KENAR BANT') || a.includes('KENARBANT')) return 'kenar_bandi';
    if (b === 'M2' || b === 'M²') return 'plaka';
    if (['GRAM', 'KG', 'LITRE', 'LT', 'L'].includes(b)) return 'sarf';
    return 'hirdavat';
  }

  // Plaka ölçüsünü addan çıkar: "183*366" veya "210x280" → mm (×10)
  // Yalnızca MAKUL aralıktakiler kabul edilir; yanlış ölçü yanlış kesim demektir.
  function plakaOlcusu(ad) {
    const m = String(ad || '').match(/(\d{2,3})\s*[*xX×]\s*(\d{2,4})/);
    if (!m) return null;
    let en = +m[1], boy = +m[2];
    // cm cinsinden yazılmışsa mm'ye çevir (183 → 1830)
    if (en < 400) en *= 10;
    if (boy < 400) boy *= 10;
    if (en < 300 || en > 3000 || boy < 300 || boy > 6000) return null;
    return { en, boy };
  }

  const sayiCoz = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  // Sütunları eşle: özel alanlar önce, tam eşleşme kısmi eşleşmeden önce,
  // ve bir sütun yalnızca BİR alana atanır (çakışma olmaz).
  function sutunlariEsle(basliklar) {
    const es = {};
    const kullanilan = new Set();
    const norm = (b) => String(b || '').toLocaleLowerCase('tr').trim();
    [1, 2].forEach(sira => {
      ALANLAR.filter(a => a.sira === sira).forEach(a => {
        let i = basliklar.findIndex((b, idx) => !kullanilan.has(idx) && a.tam.includes(norm(b)));
        if (i < 0) i = basliklar.findIndex((b, idx) => !kullanilan.has(idx) && a.ipucu.some(ip => norm(b).includes(ip)));
        if (i >= 0) { es[a.key] = i; kullanilan.add(i); }
      });
    });
    return es;
  }

  const turCoz = (t) => {
    const s = String(t || '').toUpperCase().replace(/[()\s]/g, '');
    if (s.includes('HM')) return 'hammadde';
    if (s.includes('YM')) return 'yarimamul';
    if (s.includes('MM')) return 'urun';
    if (s.includes('TM') || s.includes('TİM') || s.includes('TIM')) return 'hammadde';
    return null;
  };

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'arge', 'teknik_ofis', 'satinalma'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE, Teknik Ofis ve Satınalma tarafından kullanılır.</div></div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="page-hdr"><div>
        <div class="page-title">🔄 Logo Tiger — Malzeme Kartı Aktarımı</div>
        <div class="page-sub">Tiger'daki malzeme kartlarını Excel/CSV ile toplu olarak ÜretimOS'a aktarın</div>
      </div></div>

      <div class="card" style="margin-bottom:12px">
        <div class="fhint" style="margin-bottom:10px">
          <b>Nasıl yapılır:</b> Tiger → Malzemeler ekranı → listeyi Excel'e aktarın (sağ tık veya
          rapor/dışa aktar). Aldığınız dosyayı buraya yükleyin. Sütunlar otomatik eşleştirilir,
          onaylamadan önce önizlersiniz.<br>
          <b>Güvenlik:</b> Aynı kodlu kart varsa yenisi <b>açılmaz</b>. ÜretimOS'ta girilmiş
          fiyat, stok ve reçete bilgileri hiçbir durumda ezilmez.
        </div>
        <input type="file" id="tg-dosya" accept=".xlsx,.xls,.csv"
          style="padding:9px;border:1px solid var(--border);border-radius:8px;width:100%;max-width:420px;font-size:12.5px">
        <div id="tg-durum" style="margin-top:8px;font-size:12px"></div>
      </div>
      <div id="tg-icerik"></div>`;

    document.getElementById('tg-dosya').onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const durum = document.getElementById('tg-durum');
      durum.innerHTML = '<span class="muted">Dosya okunuyor…</span>';
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const tumu = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (tumu.length < 2) throw new Error('Dosyada veri satırı yok.');

        // Başlık satırını bul: "kod" benzeri bir hücre içeren ilk satır
        let bIdx = 0;
        for (let i = 0; i < Math.min(10, tumu.length); i++) {
          const s = tumu[i].map(x => String(x).toLocaleLowerCase('tr')).join('|');
          if (s.includes('kod') && (s.includes('açıkla') || s.includes('aciklama') || s.includes('ad'))) { bIdx = i; break; }
        }
        basliklar = tumu[bIdx].map(x => String(x).trim());
        satirlar = tumu.slice(bIdx + 1).filter(r => r.some(c => String(c).trim() !== ''));
        dosyaAdi = f.name;

        eslesme = sutunlariEsle(basliklar);

        durum.innerHTML = `<span style="color:var(--green-text)">✓ ${App.escapeHtml(f.name)} okundu — ` +
          `${satirlar.length} satır, ${basliklar.length} sütun</span>`;
        eslemeCiz(main);
      } catch (err) {
        durum.innerHTML = `<span style="color:var(--red-text)">✕ ${App.escapeHtml(err.message || String(err))}</span>`;
        document.getElementById('tg-icerik').innerHTML = '';
      }
    };
  }

  function eslemeCiz(main) {
    const el = document.getElementById('tg-icerik');
    el.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">1️⃣ Sütun Eşleme</div></div>
        <div class="fhint" style="margin-bottom:8px">Otomatik eşleştirildi; yanlışsa düzeltin.</div>
        <div class="frow" style="flex-wrap:wrap">
          ${ALANLAR.map(a => `<div class="fgroup" style="min-width:200px">
            <label class="flbl">${a.ad}${a.zorunlu ? ' <span style="color:var(--red-text)">*</span>' : ''}</label>
            <select class="fselect tg-esle" data-key="${a.key}">
              <option value="">— yok —</option>
              ${basliklar.map((b, i) => `<option value="${i}" ${eslesme[a.key] === i ? 'selected' : ''}>${App.escapeHtml(b || ('Sütun ' + (i + 1)))}</option>`).join('')}
            </select></div>`).join('')}
        </div>
        <div class="frow" style="margin-top:8px">
          <div class="fgroup" style="min-width:240px">
            <label class="flbl">Türü belirtilmemişse hedef</label>
            <select class="fselect" id="tg-varsayilan">
              <option value="hammadde">Hammadde olarak aktar</option>
              <option value="yarimamul">Yarı mamül olarak aktar</option>
              <option value="atla">Atla (aktarma)</option>
            </select></div>
          <div class="fgroup" style="min-width:240px">
            <label class="flbl">Sistemde zaten olan kodlar</label>
            <select class="fselect" id="tg-mevcut">
              <option value="atla">Atla — dokunma (önerilen)</option>
              <option value="guncelle">Ad ve birimi güncelle</option>
            </select></div>
        </div>
        <button class="btn btn-blue" id="tg-onizle" style="margin-top:8px">Önizle</button>
      </div>
      <div id="tg-onizleme"></div>`;

    el.querySelectorAll('.tg-esle').forEach(s => s.onchange = () => {
      eslesme[s.dataset.key] = s.value === '' ? undefined : +s.value;
    });
    document.getElementById('tg-onizle').onclick = () => onizle(main);
  }

  function satirlariCoz() {
    const varsayilan = document.getElementById('tg-varsayilan').value;
    const al = (r, key) => (eslesme[key] !== undefined ? String(r[eslesme[key]] ?? '').trim() : '');
    const kayitlar = [];
    const hatalar = [];
    satirlar.forEach((r, i) => {
      const kod = al(r, 'kod'), ad = al(r, 'ad');
      if (!kod && !ad) return;
      if (!kod) { hatalar.push(`Satır ${i + 2}: kod boş — atlandı`); return; }
      if (!ad) { hatalar.push(`Satır ${i + 2}: açıklama boş — atlandı (${kod})`); return; }
      let hedef = turCoz(al(r, 'tur'));
      if (!hedef) {
        if (varsayilan === 'atla') { hatalar.push(`Satır ${i + 2}: tür belirsiz — atlandı (${kod})`); return; }
        hedef = varsayilan;
      }
      const birim = (al(r, 'birim') || 'ADET').toUpperCase();
      kayitlar.push({
        kod, ad, hedef, birim,
        tip: tipBelirle(ad, birim),
        alisFiyat: sayiCoz(al(r, 'alisFiyat')),
        stok: sayiCoz(al(r, 'stok')),
        hiyerarsi: al(r, 'hiyerarsi'),
        ad2: al(r, 'ad2'),
        ureticiKod: al(r, 'ureticiKod'),
        grupKod: al(r, 'grupKod'),
        ozelKod: al(r, 'ozelKod')
      });
    });
    return { kayitlar, hatalar };
  }

  async function onizle(main) {
    const { kayitlar, hatalar } = satirlariCoz();
    const [hammaddeler, yarimamuller, urunler] = await Promise.all([
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.urunler.all()
    ]);
    const mevcutKod = new Set([
      ...hammaddeler.map(x => String(x.stokKodu || x.kod || '').toUpperCase()),
      ...yarimamuller.map(x => String(x.kod || '').toUpperCase()),
      ...urunler.map(x => String(x.kod || '').toUpperCase())
    ]);

    // Dosya içi mükerrer
    const gorulen = new Set();
    kayitlar.forEach(k => {
      k.mevcutMu = mevcutKod.has(k.kod.toUpperCase());
      k.dosyadaTekrar = gorulen.has(k.kod.toUpperCase());
      gorulen.add(k.kod.toUpperCase());
    });

    const yeni = kayitlar.filter(k => !k.mevcutMu && !k.dosyadaTekrar);
    const mevcut = kayitlar.filter(k => k.mevcutMu);
    const tekrar = kayitlar.filter(k => k.dosyadaTekrar);
    const sayim = (h) => yeni.filter(k => k.hedef === h).length;

    document.getElementById('tg-onizleme').innerHTML = `
      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">YENİ KART</div><div class="kpi-value">${yeni.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">ZATEN VAR</div><div class="kpi-value">${mevcut.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">DOSYADA TEKRAR</div><div class="kpi-value">${tekrar.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">HATALI SATIR</div><div class="kpi-value">${hatalar.length}</div></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Aktarılacaklar — hedef dağılımı</div></div>
        <div style="padding:6px;font-size:12.5px;line-height:1.9">
          • Hammadde: <b>${sayim('hammadde')}</b><br>
          • Yarı mamül: <b>${sayim('yarimamul')}</b><br>
          • Ürün: <b>${sayim('urun')}</b>
        </div>
        <div style="padding:6px;font-size:12.5px;line-height:1.9;border-top:1px solid var(--border);margin-top:6px">
          <b>Hammadde tip dağılımı:</b><br>
          • Plaka: <b>${yeni.filter(k => k.tip === 'plaka').length}</b> ·
          Kenar bandı: <b>${yeni.filter(k => k.tip === 'kenar_bandi').length}</b> ·
          Sarf: <b>${yeni.filter(k => k.tip === 'sarf').length}</b> ·
          Hırdavat: <b>${yeni.filter(k => k.tip === 'hirdavat').length}</b><br>
          • Alış fiyatı olan: <b>${yeni.filter(k => k.alisFiyat != null && k.alisFiyat > 0).length}</b> ·
          Açılış stoğu olan: <b>${yeni.filter(k => k.stok != null && k.stok !== 0).length}</b>
        </div>
      </div>

      ${hatalar.length ? `<div class="card" style="margin-bottom:12px;background:var(--amber-bg)">
        <div style="padding:6px;font-size:11.5px;color:var(--amber-text)">
          ${hatalar.slice(0, 8).map(h => '⚠ ' + App.escapeHtml(h)).join('<br>')}
          ${hatalar.length > 8 ? `<br>… ve ${hatalar.length - 8} satır daha` : ''}
        </div></div>` : ''}

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Önizleme (ilk 25 kayıt)</div></div>
        <div style="overflow-x:auto"><table class="dtable">
          <tr><th>Kod</th><th>Ad</th><th>Tip</th><th>Birim</th><th class="r">Alış Fiyatı</th><th class="r">Stok</th><th>Durum</th></tr>
          ${kayitlar.slice(0, 25).map(k => `<tr>
            <td class="mono" style="font-size:11px">${App.escapeHtml(k.kod)}</td>
            <td style="font-size:11.5px">${App.escapeHtml(k.ad)}</td>
            <td style="font-size:11px">${k.hedef === 'hammadde'
              ? `<span class="pill ${k.tip === 'plaka' ? 'pill-blue' : k.tip === 'sarf' ? 'pill-amber' : 'pill-gray'}" style="font-size:9px">${k.tip}</span>`
              : k.hedef}</td>
            <td style="font-size:11px">${App.escapeHtml(k.birim)}</td>
            <td class="r" style="font-size:11px">${k.alisFiyat != null ? App.fmtTL(k.alisFiyat) : '<span class="muted">—</span>'}</td>
            <td class="r" style="font-size:11px">${k.stok != null && k.stok !== 0 ? App.fmt(k.stok, 1) : '<span class="muted">—</span>'}</td>
            <td>${k.dosyadaTekrar ? '<span class="pill pill-amber" style="font-size:9px">dosyada tekrar</span>'
              : k.mevcutMu ? '<span class="pill pill-gray" style="font-size:9px">zaten var</span>'
              : '<span class="pill pill-green" style="font-size:9px">yeni</span>'}</td>
          </tr>`).join('')}
        </table></div>
      </div>

      <div class="card">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-green" id="tg-aktar" style="font-size:13px;padding:9px 16px" ${yeni.length ? '' : 'disabled'}>
            ✓ ${yeni.length} Yeni Kartı Aktar</button>
          <button class="btn btn-blue" id="tg-guncelle" style="font-size:13px;padding:9px 16px" ${mevcut.length ? '' : 'disabled'}>
            ⟳ ${mevcut.length} Mevcut Kartı Güncelle</button>
        </div>
        <div class="fhint" style="margin-top:6px">
          <b>Güncelle ne yapar:</b> Aynı listeyi tekrar yüklediğinizde, sistemde zaten olan kartların
          <b>tipini</b> (plaka / kenar bandı / sarf / hırdavat), <b>alış fiyatını</b>, <b>birimini</b> ve
          <b>açılış stoğunu</b> Tiger'daki güncel değerlerle düzeltir. İlk aktarımda tip ayrımı
          yapılmamışsa bu işlem onu tamamlar.<br>
          <b>Korunanlar:</b> reçeteler, ölçüler, fire oranı, tedarik süresi ve elle girdiğiniz diğer
          alanlar — bunlara dokunulmaz.
        </div>
        <div class="fhint" style="margin-top:6px">
          Aktarılan kartlarda <b>fiyat, fire, tedarik süresi ve stok boştur</b> — Tiger bu bilgileri
          bu listede taşımaz. Kartları açtıktan sonra Hammaddeler ekranından tamamlayın.
        </div>
      </div>`;

    const btn = document.getElementById('tg-aktar');
    if (btn) btn.onclick = () => aktar(main, yeni, mevcut);
    const gbtn = document.getElementById('tg-guncelle');
    if (gbtn) gbtn.onclick = () => guncelle(main, mevcut);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MEVCUT KARTLARI GÜNCELLE
  // Aynı liste tekrar yüklendiğinde, sistemdeki kartların Tiger'dan gelen
  // GÜNCEL değerlerini düzeltir: tip sınıflandırması, alış fiyatı, birim ve
  // açılış stoğu. İlk aktarımda tip ayrımı yapılmadıysa bu işlem onu tamamlar.
  //
  // DOKUNULMAYANLAR: reçeteler, ölçüler (en/boy/kalınlık), fire oranı, tedarik
  // süresi, emniyet stoğu ve elle girilmiş her alan. Dış sistem, ÜretimOS'ta
  // üretilmiş bilgiyi ezmemelidir.
  // ══════════════════════════════════════════════════════════════════════════
  async function guncelle(main, mevcutOlanlar) {
    try {
      const gbtn = document.getElementById('tg-guncelle');
      if (gbtn) { gbtn.disabled = true; gbtn.textContent = 'Güncelleniyor…'; }

      const hammaddeler = await Store.hammaddeler.all();
      const stokRaf = await Store.stokRaf.all();
      const indeks = new Map();
      hammaddeler.forEach(h => indeks.set(String(h.stokKodu || h.kod || '').toUpperCase(), h));

      let tipDuzeltilen = 0, fiyatGuncel = 0, olcuEklenen = 0, stokGuncel = 0, degisenKart = 0;
      const degisenler = [];
      const yeniStoklar = [];
      const degisenStoklar = [];

      mevcutOlanlar.forEach(k => {
        const h = indeks.get(k.kod.toUpperCase());
        if (!h) return;
        let degisti = false;

        // 1) TİP sınıflandırması (asıl eksik olan buydu)
        if (k.tip && h.tip !== k.tip) { h.tip = k.tip; tipDuzeltilen++; degisti = true; }

        // 2) Alış fiyatı — yalnızca Tiger'da dolu ise
        if (k.alisFiyat != null && k.alisFiyat > 0 && h.birimFiyat !== k.alisFiyat) {
          h.birimFiyat = k.alisFiyat; h.dvz = h.dvz || 'TL';
          h.fiyatKaynak = 'tiger_son_alis';
          fiyatGuncel++; degisti = true;
        }

        // 3) Birim (boşsa veya farklıysa)
        if (k.birim && h.birim !== k.birim) { h.birim = k.birim; degisti = true; }

        // 4) Plaka ölçüsü — YALNIZCA boşsa doldurulur, dolu olan EZİLMEZ
        if (k.tip === 'plaka') {
          if (!h.grainYonu) h.grainYonu = 'yok';
          if (h.fireYuzde == null) h.fireYuzde = 8;
          if (!h.en || !h.boy) {
            const o = plakaOlcusu(k.ad);
            if (o) { h.en = o.en; h.boy = o.boy; h.olcuKaynak = 'ad'; olcuEklenen++; degisti = true; }
          }
        }
        if ((k.tip === 'sarf' || k.tip === 'kenar_bandi') && h.fireYuzde == null) h.fireYuzde = 2;

        // 5) Açılış stoğu — kayıt yoksa oluştur, varsa miktarı Tiger'a eşitle
        if (k.stok != null && k.stok !== 0) {
          const s = stokRaf.find(x => x.ambar === 'hammadde_deposu' && x.tip === 'hammadde' && x.refId === h.id);
          if (!s) {
            yeniStoklar.push({
              id: App.uid('STK'), ambar: 'hammadde_deposu', tip: 'hammadde',
              refId: h.id, refKod: h.stokKodu, refAd: h.ad, birim: h.birim,
              miktar: k.stok, kaynak: 'tiger_guncelleme', tarih: new Date().toISOString().slice(0, 10)
            });
            stokGuncel++;
          } else if (s.miktar !== k.stok) {
            s.miktar = k.stok; s.kaynak = 'tiger_guncelleme';
            s.tarih = new Date().toISOString().slice(0, 10);
            degisenStoklar.push(s);
            stokGuncel++;
          }
        }

        if (degisti) { degisenler.push(h); degisenKart++; }
      });

      if (!degisenKart && !yeniStoklar.length && !degisenStoklar.length) {
        if (gbtn) { gbtn.disabled = false; gbtn.textContent = '⟳ Güncelle'; }
        App.toast('Güncellenecek fark bulunamadı — kartlar zaten güncel.', 'ok');
        return;
      }

      // PARÇALI GÖNDERİM: 5000+ kartı tek istekte göndermek HTTP 413 verir.
      // Yalnızca DEĞİŞEN kayıtlar, partiler halinde gönderilir.
      await App.persist(async () => {
        if (degisenler.length) {
          await Store.topluGuncelle('hammaddeler', degisenler, 200,
            (e, t2) => { if (gbtn) gbtn.textContent = `Kart: ${e}/${t2} güncellendi…`; });
        }
        if (yeniStoklar.length) {
          await Store.topluEkle('stokRaf', yeniStoklar, 200,
            (e, t2) => { if (gbtn) gbtn.textContent = `Stok: ${e}/${t2} eklendi…`; });
        }
        if (degisenStoklar.length) {
          await Store.topluGuncelle('stokRaf', degisenStoklar, 200,
            (e, t2) => { if (gbtn) gbtn.textContent = `Stok: ${e}/${t2} güncellendi…`; });
        }
      });

      App.openModal({
        title: '⟳ Güncelleme Tamamlandı',
        sub: App.escapeHtml(dosyaAdi),
        body: `<div style="font-size:12.5px;line-height:1.9">
            • <b>${degisenKart}</b> kartta değişiklik yapıldı<br>
            • <b>${tipDuzeltilen}</b> kartın <b>tipi düzeltildi</b> (plaka / kenar bandı / sarf / hırdavat)<br>
            • <b>${fiyatGuncel}</b> kartın alış fiyatı güncellendi<br>
            • <b>${olcuEklenen}</b> plakaya ölçü eklendi (boş olanlara)<br>
            • <b>${stokGuncel}</b> kalemde stok miktarı güncellendi
          </div>
          <div style="margin-top:10px;padding:8px;background:var(--surface2);border-radius:8px;font-size:11.5px">
            <b>Dokunulmayanlar:</b> reçeteler, dolu olan ölçüler, fire oranı, tedarik süresi ve
            elle girdiğiniz diğer alanlar korundu.
          </div>`,
        footer: `<button class="btn" id="tg-gkapat">Kapat</button>
                 <button class="btn btn-blue" id="tg-ggit">Hammaddeler'e Git</button>`
      });
      document.getElementById('tg-gkapat').onclick = () => { App.closeModal(); render(main); };
      document.getElementById('tg-ggit').onclick = () => { App.closeModal(); App.goTo('hammadde'); };

    } catch (e) {
      const gbtn = document.getElementById('tg-guncelle');
      if (gbtn) { gbtn.disabled = false; gbtn.textContent = '⟳ Yeniden Dene'; }
      App.toast('Güncelleme başarısız: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  async function aktar(main, yeni, mevcutOlanlar) {
    try {
      const mevcutDavranis = document.getElementById('tg-mevcut').value;
      const btn = document.getElementById('tg-aktar');
      if (btn) { btn.disabled = true; btn.textContent = 'Aktarılıyor…'; }

      const [hammaddeler, yarimamuller, urunler] = await Promise.all([
        Store.hammaddeler.all(), Store.yarimamuller.all(), Store.urunler.all()
      ]);
      let hm = 0, ym = 0, ur = 0, guncel = 0, stokSayisi = 0;
      // Yeni kayıtlar ayrı listelerde toplanır; PARÇALI olarak gönderilecek.
      // Tümünü tek istekte göndermek binlerce kartta HTTP 413 verir.
      const yeniHm = [], yeniYm = [], yeniUr = [];
      const stokYuklenecek = [];   // { kart, miktar } — hammadde deposuna açılış stoğu

      yeni.forEach(k => {
        const ortak = {
          ad: k.ad, birim: k.birim,
          kaynak: 'tiger', tigerHiyerarsi: k.hiyerarsi || null,
          ureticiKod: k.ureticiKod || null, aciklama2: k.ad2 || null,
          olusturmaTarihi: new Date().toISOString().slice(0, 10)
        };
        if (k.hedef === 'hammadde') {
          const kart = { id: App.uid('HM'), stokKodu: k.kod, tip: k.tip, ...ortak };
          // FİYAT: Tiger'ın son alış fiyatı, kartın birim fiyatı olur
          if (k.alisFiyat != null && k.alisFiyat > 0) {
            kart.birimFiyat = k.alisFiyat; kart.dvz = 'TL';
            kart.fiyatKaynak = 'tiger_son_alis';
          }
          // PLAKA: standart alanlar + addan ölçü çıkarımı
          if (k.tip === 'plaka') {
            kart.grainYonu = 'yok';
            kart.fireYuzde = 8;
            const o = plakaOlcusu(k.ad);
            if (o) { kart.en = o.en; kart.boy = o.boy; kart.olcuKaynak = 'ad'; }
          }
          if (k.tip === 'sarf' || k.tip === 'kenar_bandi') kart.fireYuzde = 2;
          yeniHm.push(kart); hm++;
          if (k.stok != null && k.stok !== 0) stokYuklenecek.push({ kart, miktar: k.stok });
        }
        else if (k.hedef === 'yarimamul') { yeniYm.push({ id: App.uid('YM'), kod: k.kod, ...ortak }); ym++; }
        else { yeniUr.push({ id: App.uid('UR'), kod: k.kod, ...ortak }); ur++; }
      });

      // Mevcut kartlar: yalnızca ad/birim güncellenir; fiyat/stok/reçete KORUNUR
      const guncelHm = [], guncelYm = [], guncelUr = [];
      if (mevcutDavranis === 'guncelle') {
        mevcutOlanlar.forEach(k => {
          const K = k.kod.toUpperCase();
          const h = hammaddeler.find(x => String(x.stokKodu || x.kod || '').toUpperCase() === K);
          if (h) { h.ad = k.ad; h.birim = k.birim; guncelHm.push(h); guncel++; return; }
          const y = yarimamuller.find(x => String(x.kod || '').toUpperCase() === K);
          if (y) { y.ad = k.ad; y.birim = k.birim; guncelYm.push(y); guncel++; return; }
          const u = urunler.find(x => String(x.kod || '').toUpperCase() === K);
          if (u) { u.ad = k.ad; guncelUr.push(u); guncel++; }
        });
      }

      // PARÇALI GÖNDERİM: her parti ayrı istek — sunucu sınırına takılmaz.
      const ilerlemeYaz = (etiket) => (eklenen, toplam) => {
        if (btn) btn.textContent = `${etiket}: ${eklenen}/${toplam} aktarıldı…`;
      };
      await App.persist(async () => {
        if (yeniHm.length) await Store.topluEkle('hammaddeler', yeniHm, 250, ilerlemeYaz('Hammadde'));
        if (yeniYm.length) await Store.topluEkle('yarimamuller', yeniYm, 250, ilerlemeYaz('Yarı mamül'));
        if (yeniUr.length) await Store.topluEkle('urunler', yeniUr, 250, ilerlemeYaz('Ürün'));

        // ── AÇILIŞ STOĞU ────────────────────────────────────────────────────
        // Tiger'daki FİİLİ STOK, hammadde deposuna açılış miktarı olarak yazılır.
        // Böylece stok ekranları ve kritik seviye uyarıları ilk günden canlı çalışır.
        if (stokYuklenecek.length) {
          const stokKayitlari = stokYuklenecek.map(x => ({
            id: App.uid('STK'),
            ambar: 'hammadde_deposu', tip: 'hammadde',
            refId: x.kart.id, refKod: x.kart.stokKodu, refAd: x.kart.ad,
            birim: x.kart.birim, miktar: x.miktar,
            kaynak: 'tiger_acilis', tarih: new Date().toISOString().slice(0, 10)
          }));
          await Store.topluEkle('stokRaf', stokKayitlari, 250, ilerlemeYaz('Stok'));
          stokSayisi = stokKayitlari.length;
        }
        // Güncellenen mevcut kayıtlar da PARÇALI gönderilir (413 koruması)
        if (guncelHm.length) await Store.topluGuncelle('hammaddeler', guncelHm, 200, ilerlemeYaz('Güncelleme'));
        if (guncelYm.length) await Store.topluGuncelle('yarimamuller', guncelYm, 200, ilerlemeYaz('Güncelleme'));
        if (guncelUr.length) await Store.topluGuncelle('urunler', guncelUr, 200, ilerlemeYaz('Güncelleme'));
      });

      App.openModal({
        title: '✓ Aktarım Tamamlandı',
        sub: App.escapeHtml(dosyaAdi),
        body: `<div style="font-size:12.5px;line-height:1.9">
            • <b>${hm}</b> hammadde kartı<br>
            • <b>${ym}</b> yarı mamül kartı<br>
            • <b>${ur}</b> ürün kartı<br>
            ${guncel ? `• <b>${guncel}</b> mevcut kart güncellendi (yalnızca ad/birim)<br>` : ''}
            ${stokSayisi ? `• <b>${stokSayisi}</b> kalem için <b>açılış stoğu</b> hammadde deposuna yazıldı<br>` : ''}
          </div>
          <div style="margin-top:10px;padding:8px;background:var(--amber-bg);border-radius:8px;font-size:11.5px;color:var(--amber-text)">
            <b>Eksik kalanlar:</b> fiyat, fire oranı, tedarik süresi, ölçü ve stok.
            Tiger'ın malzeme listesi bunları taşımaz — Hammaddeler ekranından tamamlayın.
          </div>`,
        footer: `<button class="btn" id="tg-kapat">Kapat</button>
                 <button class="btn btn-blue" id="tg-git">Hammaddeler'e Git</button>`
      });
      document.getElementById('tg-kapat').onclick = () => { App.closeModal(); render(main); };
      document.getElementById('tg-git').onclick = () => { App.closeModal(); App.goTo('hammadde'); };
    } catch (e) {
      const btn = document.getElementById('tg-aktar');
      if (btn) { btn.disabled = false; btn.textContent = '✓ Yeniden Dene'; }
      App.toast('Aktarım başarısız: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  return { render, _ic: { turCoz } };
})();
