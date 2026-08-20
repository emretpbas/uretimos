// ════════════════════════════════════════════════════════════════════════════
// TOPLU ROTA ATAMA
//
// Kurulumun en yavaş adımı, onlarca karta tek tek rota atamaktır. Mobilya
// üretiminde kartların çoğu aynı akışı izler (kesim → bantlama → delik →
// montaj → paketleme); farklılık ölçüde ve malzemededir, rotada değil.
//
// Bu araç bir rotayı SEÇİLEN TÜM KARTLARA tek işlemde atar. Süzme, arama ve
// "yalnızca rotasızları seç" kısayolu ile 36 kartlık iş dakikalar sürer.
//
// Güvenlik: rotası ZATEN olan kartlar varsayılan olarak korunur — üzerine
// yazmak için ayrıca onay istenir. Yapılan atama geri alınabilsin diye
// işlem öncesi durum bellekte tutulur ve "geri al" sunulur.
// ════════════════════════════════════════════════════════════════════════════
const TopluRota = (() => {

  const esc = (s) => (window.App ? App.escapeHtml(s) : String(s == null ? '' : s));

  // Rota atanabilen kart tipleri (paketler üretim akışına girmez, dahil değil)
  const TIPLER = [
    { anahtar: 'yarimamul', etiket: 'Yarı Mamül', store: 'yarimamuller' },
    { anahtar: 'urun', etiket: 'Bitmiş Ürün', store: 'urunler' },
    { anahtar: 'altmontaj', etiket: 'Alt Montaj', store: 'altMontajlar' }
  ];

  let sonIslem = null;   // geri alma için: [{store, id, oncekiRotaId}]

  async function kartlariTopla() {
    const hepsi = [];
    for (const t of TIPLER) {
      let liste = [];
      try { liste = await Store[t.store].all(); } catch (e) { continue; }
      liste.forEach(k => hepsi.push({
        tip: t.anahtar, tipEtiket: t.etiket, store: t.store,
        id: k.id, kod: k.kod || '', ad: k.ad || '', rotaId: k.rotaId || null
      }));
    }
    return hepsi;
  }

  async function ac(yenile) {
    const [rotalar, kartlar] = await Promise.all([Store.rotalar.all(), kartlariTopla()]);

    if (!rotalar.length) {
      App.toast('Önce en az bir rota tanımlayın — atanacak rota yok', 'err');
      return;
    }

    const rotaAdi = (id) => {
      const r = rotalar.find(x => x.id === id);
      return r ? (r.ad || r.kod || id) : null;
    };

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Atanacak Rota <span style="color:var(--red-text)">*</span></label>
        <select class="fselect" id="tr-rota">
          ${rotalar.map(r => `<option value="${esc(r.id)}">${esc(r.ad || r.kod || r.id)} — ${(r.steps || []).length} adım</option>`).join('')}
        </select>
        <div class="fhint" id="tr-rota-ozet"></div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px">
        <div class="fgroup" style="margin:0;flex:1;min-width:150px">
          <label class="flbl">Kart Tipi</label>
          <select class="fselect" id="tr-tip">
            <option value="">Tümü</option>
            ${TIPLER.map(t => `<option value="${t.anahtar}">${t.etiket}</option>`).join('')}
          </select>
        </div>
        <div class="fgroup" style="margin:0;flex:1;min-width:150px">
          <label class="flbl">Rota Durumu</label>
          <select class="fselect" id="tr-durum">
            <option value="rotasiz">Yalnızca rotası olmayanlar</option>
            <option value="hepsi">Tümü</option>
            <option value="rotali">Yalnızca rotası olanlar</option>
          </select>
        </div>
        <div class="fgroup" style="margin:0;flex:2;min-width:170px">
          <label class="flbl">Ara</label>
          <input class="finput" id="tr-ara" placeholder="kod veya ad">
        </div>
      </div>

      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
        <button class="btn btn-sm" id="tr-tum">Görünenleri seç</button>
        <button class="btn btn-sm" id="tr-hic">Seçimi temizle</button>
        <span id="tr-sayac" style="font-size:11.5px;font-weight:700;color:var(--text2);margin-left:auto"></span>
      </div>

      <div style="max-height:330px;overflow:auto;border:1px solid var(--border);border-radius:10px">
        <table class="dtable" style="font-size:11.5px;margin:0" id="tr-tablo">
          <tr><th style="width:34px"></th><th>Kod</th><th>Ad</th><th>Tip</th><th>Mevcut Rota</th></tr>
          ${kartlar.map((k, i) => `
            <tr class="tr-satir" data-i="${i}" data-tip="${k.tip}"
                data-rotali="${k.rotaId ? '1' : '0'}"
                data-ara="${esc(((k.kod || '') + ' ' + (k.ad || '')).toLocaleLowerCase('tr'))}">
              <td><input type="checkbox" class="tr-sec" data-i="${i}"></td>
              <td class="mono">${esc(k.kod)}</td>
              <td>${esc(k.ad)}</td>
              <td><span class="pill pill-gray" style="font-size:9px">${esc(k.tipEtiket)}</span></td>
              <td>${k.rotaId
                ? `<span style="font-size:10.5px;color:var(--amber-text)">${esc(rotaAdi(k.rotaId) || 'tanımsız')}</span>`
                : '<span class="muted" style="font-size:10.5px">—</span>'}</td>
            </tr>`).join('')}
        </table>
      </div>

      <label style="display:flex;align-items:center;gap:7px;font-size:11.5px;margin-top:10px;cursor:pointer">
        <input type="checkbox" id="tr-uzerine"> Rotası olan kartların üzerine de yaz
      </label>
      <div id="tr-uyari" style="font-size:11.5px;color:var(--red-text);min-height:16px;margin-top:4px"></div>`;

    App.openModal({
      title: '⇉ Toplu Rota Atama', body, wide: true,
      footer: `<button class="btn" id="tr-vaz">Vazgeç</button><button class="btn btn-blue" id="tr-uygula">Seçilenlere Ata</button>`
    });

    const $ = (id) => document.getElementById(id);
    const satirlar = [...body.querySelectorAll('.tr-satir')];

    // Rota özeti (kaç adım, hangi hatlar)
    const rotaOzetiYaz = () => {
      const r = rotalar.find(x => x.id === $('tr-rota').value);
      if (!r) { $('tr-rota-ozet').textContent = ''; return; }
      const adimlar = (r.steps || []).filter(s => s.hat && s.hat !== 'TAŞIMA');
      $('tr-rota-ozet').innerHTML = adimlar.length
        ? 'Akış: ' + adimlar.map(s => esc(s.kod || s.hat)).join(' → ')
        : '<span style="color:var(--red-text)">Bu rotanın adımı yok — atanırsa iş akışa düşmez.</span>';
    };
    $('tr-rota').onchange = rotaOzetiYaz;
    rotaOzetiYaz();

    // Süzme
    const suz = () => {
      const tip = $('tr-tip').value, durum = $('tr-durum').value;
      const q = $('tr-ara').value.trim().toLocaleLowerCase('tr');
      satirlar.forEach(tr => {
        const tipOk = !tip || tr.dataset.tip === tip;
        const rotali = tr.dataset.rotali === '1';
        const durumOk = durum === 'hepsi' || (durum === 'rotasiz' ? !rotali : rotali);
        const araOk = !q || tr.dataset.ara.includes(q);
        tr.style.display = (tipOk && durumOk && araOk) ? '' : 'none';
      });
      sayacYaz();
    };
    ['tr-tip', 'tr-durum'].forEach(id => { $(id).onchange = suz; });
    $('tr-ara').oninput = suz;

    const secililer = () => [...body.querySelectorAll('.tr-sec')].filter(c => c.checked);
    const sayacYaz = () => {
      const gorunen = satirlar.filter(t => t.style.display !== 'none').length;
      $('tr-sayac').textContent = secililer().length + ' seçili · ' + gorunen + ' kart görünüyor';
    };
    body.querySelectorAll('.tr-sec').forEach(c => c.onchange = sayacYaz);

    $('tr-tum').onclick = () => {
      satirlar.forEach(tr => {
        if (tr.style.display === 'none') return;
        tr.querySelector('.tr-sec').checked = true;
      });
      sayacYaz();
    };
    $('tr-hic').onclick = () => {
      body.querySelectorAll('.tr-sec').forEach(c => { c.checked = false; });
      sayacYaz();
    };
    $('tr-vaz').onclick = App.closeModal;
    suz();

    // ── UYGULA ─────────────────────────────────────────────────────────────
    $('tr-uygula').onclick = async () => {
      const rotaId = $('tr-rota').value;
      const uzerine = $('tr-uzerine').checked;
      const secim = secililer().map(c => kartlar[parseInt(c.dataset.i, 10)]);
      const uyari = $('tr-uyari');
      uyari.textContent = '';

      if (!secim.length) { uyari.textContent = 'En az bir kart seçin'; return; }
      const rotaliOlan = secim.filter(k => k.rotaId && k.rotaId !== rotaId);
      const uygulanacak = uzerine ? secim : secim.filter(k => !k.rotaId || k.rotaId === rotaId);
      if (!uygulanacak.length) {
        uyari.textContent = 'Seçilenlerin hepsinde zaten rota var. Üzerine yazmak için alttaki kutuyu işaretleyin.';
        return;
      }
      if (rotaliOlan.length && uzerine &&
          !window.confirm(rotaliOlan.length + ' kartın mevcut rotası DEĞİŞTİRİLECEK. Devam edilsin mi?')) return;

      // Store bazında grupla, tek kayıtta yaz
      sonIslem = [];
      const gruplar = {};
      uygulanacak.forEach(k => { (gruplar[k.store] = gruplar[k.store] || []).push(k); });

      let toplam = 0;
      for (const [storeAdi, kartGrubu] of Object.entries(gruplar)) {
        const liste = await Store[storeAdi].all();
        kartGrubu.forEach(k => {
          const kayit = liste.find(x => x.id === k.id);
          if (!kayit) return;
          sonIslem.push({ store: storeAdi, id: k.id, oncekiRotaId: kayit.rotaId || null });
          kayit.rotaId = rotaId;
          toplam++;
        });
        await App.persist(() => Store[storeAdi].save(liste));
      }

      App.closeModal();
      const rAd = rotaAdi(rotaId) || rotaId;
      App.toast(toplam + ' karta "' + rAd + '" rotası atandı', 'ok');
      geriAlSun(toplam, rAd, yenile);
      if (yenile) yenile();
    };
  }

  // ── GERİ AL ──────────────────────────────────────────────────────────────
  // Yanlış rota atamak kolaydır; 30 kartı elle geri almak zordur.
  function geriAlSun(adet, rotaAd, yenile) {
    if (!sonIslem || !sonIslem.length) return;
    const kutu = document.createElement('div');
    kutu.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:22px;z-index:99990;' +
      'background:var(--surface);border:1.5px solid var(--blue);border-radius:12px;padding:10px 14px;' +
      'box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:12px;font-size:12px';
    kutu.innerHTML = `<span>${adet} karta <b>${esc(rotaAd)}</b> atandı</span>
      <button class="btn btn-sm" id="tr-geri">↶ Geri Al</button>`;
    document.body.appendChild(kutu);
    const kaldir = () => { if (kutu.parentNode) kutu.remove(); };
    const zaman = setTimeout(kaldir, 12000);
    kutu.querySelector('#tr-geri').onclick = async () => {
      clearTimeout(zaman);
      const gruplar = {};
      sonIslem.forEach(k => { (gruplar[k.store] = gruplar[k.store] || []).push(k); });
      for (const [storeAdi, grup] of Object.entries(gruplar)) {
        const liste = await Store[storeAdi].all();
        grup.forEach(g => {
          const kayit = liste.find(x => x.id === g.id);
          if (kayit) kayit.rotaId = g.oncekiRotaId;
        });
        await App.persist(() => Store[storeAdi].save(liste));
      }
      sonIslem = null;
      kaldir();
      App.toast('Rota ataması geri alındı', 'ok');
      if (yenile) yenile();
    };
  }

  return { ac };
})();
