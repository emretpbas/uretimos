// ════════════════════════════════════════════════════════════════════════════
// HAMMADDELER — plaka / hırdavat tanımı, fiyat (tarihli), fire, grain yönü
// ════════════════════════════════════════════════════════════════════════════
PageModules.hammadde = (() => {

  // ── EXCEL TARZI SÜZME DURUMU ──────────────────────────────────────────────
  // Sütun bazlı filtreler, sıralama ve sayfalama. 5000+ karttan sonra tabloyu
  // tek seferde çizmek tarayıcıyı (özellikle telefonu) kilitler; bu yüzden
  // sayfalama zorunludur.
  const suz = { kod: '', ad: '', birim: '', grain: '', fiyatMin: '', fiyatMax: '', fireMin: '', fireMax: '', olcu: '' };
  let sirala = { alan: '', yon: 1 };
  let sayfa = 1;
  const SAYFA_BOYU = 100;
  let filterTip = 'hepsi';
  let searchTxt = '';

  async function render(main) {
    const list = await Store.hammaddeler.all();
    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Hammaddeler</div>
          <div class="page-sub">Plaka ve hırdavat hammaddelerini tanımlayın; fiyat, fire ve plaka için grain (desen) yönünü yönetin</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="hm-new">+ Hammadde Tanımla</button></div>
      </div>

      <div class="card" style="padding:12px 16px">
        <div class="flex-gap" style="flex-wrap:wrap">
          <input class="finput" id="hm-search" placeholder="Stok kodu veya ad ara…" style="max-width:260px">
          <div class="flex-gap" style="margin-left:auto">
            <button class="btn btn-sm tip-filter ${filterTip === 'hepsi' ? 'btn-blue' : ''}" data-tip="hepsi">Hepsi</button>
            <button class="btn btn-sm tip-filter ${filterTip === 'plaka' ? 'btn-blue' : ''}" data-tip="plaka">Plaka</button>
            <button class="btn btn-sm tip-filter ${filterTip === 'hirdavat' ? 'btn-blue' : ''}" data-tip="hirdavat">Hırdavat</button>
            <button class="btn btn-sm tip-filter ${filterTip === 'kenar_bandi' ? 'btn-blue' : ''}" data-tip="kenar_bandi">Kenar Bandı</button>
            <button class="btn btn-sm tip-filter ${filterTip === 'sarf' ? 'btn-blue' : ''}" data-tip="sarf">Sarf</button>
          </div>
        </div>
      </div>

      <div class="card" id="hm-table-wrap"></div>
    `;
    document.getElementById('hm-new').onclick = () => openForm(null, () => render(main));
    document.getElementById('hm-search').oninput = (e) => { searchTxt = e.target.value.toLowerCase(); renderTable(list); };
    main.querySelectorAll('.tip-filter').forEach(b => b.onclick = () => { filterTip = b.dataset.tip; render(main); });
    renderTable(list);

    function renderTable(list) {
      const wrap = document.getElementById('hm-table-wrap');

      // ── SÜZME ────────────────────────────────────────────────────────────
      const ic = (deger, aranan) => !aranan ||
        String(deger || '').toLocaleLowerCase('tr').includes(aranan.toLocaleLowerCase('tr'));
      const araliktaMi = (v, min, max) => {
        const n = +v || 0;
        if (min !== '' && n < +min) return false;
        if (max !== '' && n > +max) return false;
        return true;
      };

      let filtered = list;
      if (filterTip !== 'hepsi') filtered = filtered.filter(h => h.tip === filterTip);
      if (searchTxt) filtered = filtered.filter(h =>
        (h.stokKodu || '').toLowerCase().includes(searchTxt) || (h.ad || '').toLowerCase().includes(searchTxt));
      filtered = filtered.filter(h =>
        ic(h.stokKodu, suz.kod) &&
        ic((h.ad || '') + ' ' + (h.renk || ''), suz.ad) &&
        (!suz.birim || h.birim === suz.birim) &&
        (!suz.grain || (h.tip === 'plaka' && h.grainYonu === suz.grain)) &&
        araliktaMi(h.birimFiyat, suz.fiyatMin, suz.fiyatMax) &&
        araliktaMi(h.fireYuzde, suz.fireMin, suz.fireMax) &&
        (!suz.olcu || (h.tip === 'plaka' && (String(h.en) + 'x' + String(h.boy)).includes(suz.olcu)))
      );

      // ── SIRALAMA ─────────────────────────────────────────────────────────
      if (sirala.alan) {
        const sayisal = ['birimFiyat', 'fireYuzde', 'en', 'boy'];
        filtered = [...filtered].sort((a, b) => {
          let x = a[sirala.alan], y = b[sirala.alan];
          if (sayisal.includes(sirala.alan)) { x = +x || 0; y = +y || 0; return (x - y) * sirala.yon; }
          return String(x || '').localeCompare(String(y || ''), 'tr') * sirala.yon;
        });
      }

      const toplam = filtered.length;
      const sayfaSayisi = Math.max(1, Math.ceil(toplam / SAYFA_BOYU));
      if (sayfa > sayfaSayisi) sayfa = sayfaSayisi;
      const gorunen = filtered.slice((sayfa - 1) * SAYFA_BOYU, sayfa * SAYFA_BOYU);

      // Süzme kutularında kullanılacak seçenekler (mevcut veriden)
      const birimler = [...new Set(list.map(h => h.birim).filter(Boolean))].sort();
      const suzmeAktif = Object.values(suz).some(v => v !== '');


      const basSut = (etiket, alan, ekSinif) => {
        const aktif = sirala.alan === alan;
        const ok = aktif ? (sirala.yon === 1 ? ' ▲' : ' ▼') : '';
        return `<th class="${ekSinif || ''}" style="cursor:pointer;user-select:none" data-sirala="${alan}"
          title="Sıralamak için tıklayın">${etiket}${ok}</th>`;
      };

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 4px">
          <div style="font-size:12px" class="muted">
            <b>${App.fmt(toplam, 0)}</b> kayıt${toplam !== list.length ? ` <span class="muted">(${App.fmt(list.length, 0)} içinden süzüldü)</span>` : ''}
            ${toplam > SAYFA_BOYU ? ` · sayfa ${sayfa}/${sayfaSayisi}` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${suzmeAktif ? '<button class="btn btn-sm" id="hm-suz-temizle">✕ Süzmeyi Temizle</button>' : ''}
            <button class="btn btn-sm" id="hm-excel">⤓ Excel'e Aktar</button>
          </div>
        </div>
        <div class="tbl-wrap"><table class="dtable">
        <tr>
          ${basSut('Tip', 'tip')}${basSut('Stok Kodu', 'stokKodu')}${basSut('Ad', 'ad')}
          <th>Ölçü/Birim</th><th>Grain</th>${basSut('Birim Fiyat', 'birimFiyat', 'r')}${basSut('Fire %', 'fireYuzde', 'r')}
          <th>Son Alış</th><th>Son Teklif</th><th></th>
        </tr>
        <tr class="suz-satiri" style="background:var(--surface2)">
          <td></td>
          <td><input class="finput hm-suz" data-k="kod" value="${App.escapeHtml(suz.kod)}" placeholder="kod…" style="width:100%;font-size:11px;padding:4px"></td>
          <td><input class="finput hm-suz" data-k="ad" value="${App.escapeHtml(suz.ad)}" placeholder="ad / renk…" style="width:100%;font-size:11px;padding:4px"></td>
          <td>
            <input class="finput hm-suz" data-k="olcu" value="${App.escapeHtml(suz.olcu)}" placeholder="ölçü…" style="width:100%;font-size:11px;padding:4px;margin-bottom:2px">
            <select class="fselect hm-suz" data-k="birim" style="width:100%;font-size:11px;padding:3px">
              <option value="">birim…</option>
              ${birimler.map(b => `<option value="${App.escapeHtml(b)}" ${suz.birim === b ? 'selected' : ''}>${App.escapeHtml(b)}</option>`).join('')}
            </select></td>
          <td><select class="fselect hm-suz" data-k="grain" style="width:100%;font-size:11px;padding:3px">
              <option value="">hepsi</option>
              <option value="yok" ${suz.grain === 'yok' ? 'selected' : ''}>Yönsüz</option>
              <option value="var" ${suz.grain === 'var' ? 'selected' : ''}>Yönlü</option>
            </select></td>
          <td><input class="finput hm-suz" data-k="fiyatMin" value="${suz.fiyatMin}" placeholder="min" style="width:48%;font-size:11px;padding:4px">
              <input class="finput hm-suz" data-k="fiyatMax" value="${suz.fiyatMax}" placeholder="max" style="width:48%;font-size:11px;padding:4px"></td>
          <td><input class="finput hm-suz" data-k="fireMin" value="${suz.fireMin}" placeholder="min" style="width:48%;font-size:11px;padding:4px">
              <input class="finput hm-suz" data-k="fireMax" value="${suz.fireMax}" placeholder="max" style="width:48%;font-size:11px;padding:4px"></td>
          <td></td><td></td><td></td>
        </tr>`;

      if (!gorunen.length) {
        html += `<tr><td colspan="10" style="padding:20px;text-align:center;color:var(--muted)">
          Süzme sonucunda kayıt bulunamadı. Filtreleri gevşetin veya temizleyin.</td></tr>`;
      }

      gorunen.forEach(h => {
        const olcu = h.tip === 'plaka' ? (h.en && h.boy ? `${h.en}×${h.boy} mm` : '<span style="color:var(--amber-text)">ölçü yok</span>') : '—';
        const dvzSym = h.dvz === 'USD' ? '$' : h.dvz === 'EUR' ? '€' : '₺';
        html += `<tr>
          <td>
            <select class="fselect hm-tip-sec" data-id="${h.id}" data-ilk="${App.escapeHtml(h.tip || 'hirdavat')}"
              style="font-size:11px;padding:3px 4px;width:100%;min-width:104px">
              <option value="plaka" ${h.tip === 'plaka' ? 'selected' : ''}>Plaka</option>
              <option value="kenar_bandi" ${h.tip === 'kenar_bandi' ? 'selected' : ''}>Kenar Bandı</option>
              <option value="sarf" ${h.tip === 'sarf' ? 'selected' : ''}>Sarf</option>
              <option value="hirdavat" ${h.tip === 'hirdavat' || !h.tip ? 'selected' : ''}>Hırdavat</option>
            </select>
            <button class="btn btn-sm hm-tip-kaydet" data-id="${h.id}" style="display:none;margin-top:3px;width:100%;font-size:10px;padding:2px 4px;background:var(--green);color:#fff;border:none">✓ Kaydet</button>
          </td>
          <td class="mono" style="font-size:11px">${App.escapeHtml(h.stokKodu || '')}</td>
          <td>${App.escapeHtml(h.ad)}${h.renk ? `<br><span style="font-size:10px;color:var(--text3)"><span class="swatch" style="background:${colorToHex(h.renk)}"></span> ${App.escapeHtml(h.renk)}${h.kalinlik ? ' · ' + h.kalinlik + 'mm' : ''}</span>` : ''}</td>
          <td style="font-size:11.5px">${olcu}<br><span class="muted" style="font-size:10px">${App.escapeHtml(h.birim || '')}</span></td>
          <td>${h.tip === 'plaka' ? grainPill(h.grainYonu) : '—'}</td>
          <td class="r mono">${h.birimFiyat ? dvzSym + App.fmt(h.birimFiyat, h.birimFiyat < 1 ? 4 : 2) : '<span class="muted">—</span>'}</td>
          <td class="r">${App.fmt(h.fireYuzde, 1)}%</td>
          <td style="font-size:11px">${h.sonAlisTarihi || '—'}</td>
          <td style="font-size:11px">${h.sonTeklifTarihi || '—'}</td>
          <td style="display:flex;gap:4px"><button class="btn btn-sm btn-ghost hm-edit" data-id="${h.id}">Düzenle</button>
          <button class="btn btn-sm btn-ghost hm-copy" data-id="${h.id}" title="Hammadde kartını kopyala">⧉</button>
          <button class="btn btn-sm btn-ghost hm-qr" data-id="${h.id}" title="QR etiketi + teknik dosya alanı">📎</button></td>
        </tr>`;
      });
      html += `</table></div>`;

      // ── SAYFALAMA ────────────────────────────────────────────────────────
      if (sayfaSayisi > 1) {
        html += `<div style="display:flex;gap:6px;align-items:center;justify-content:center;padding:10px;flex-wrap:wrap">
          <button class="btn btn-sm hm-sayfa" data-s="1" ${sayfa === 1 ? 'disabled' : ''}>« İlk</button>
          <button class="btn btn-sm hm-sayfa" data-s="${sayfa - 1}" ${sayfa === 1 ? 'disabled' : ''}>‹ Önceki</button>
          <span style="font-size:12px;padding:0 8px">Sayfa <b>${sayfa}</b> / ${sayfaSayisi}</span>
          <button class="btn btn-sm hm-sayfa" data-s="${sayfa + 1}" ${sayfa === sayfaSayisi ? 'disabled' : ''}>Sonraki ›</button>
          <button class="btn btn-sm hm-sayfa" data-s="${sayfaSayisi}" ${sayfa === sayfaSayisi ? 'disabled' : ''}>Son »</button>
        </div>`;
      }
      wrap.innerHTML = html;

      // ── OLAY BAĞLARI ─────────────────────────────────────────────────────
      wrap.querySelectorAll('.hm-suz').forEach(inp => {
        const uygula = () => { suz[inp.dataset.k] = inp.value.trim(); sayfa = 1; renderTable(list); };
        if (inp.tagName === 'SELECT') inp.onchange = uygula;
        else {
          let zaman = null;
          inp.oninput = () => { clearTimeout(zaman); zaman = setTimeout(uygula, 250); };
        }
      });
      wrap.querySelectorAll('[data-sirala]').forEach(th => th.onclick = () => {
        const a = th.dataset.sirala;
        if (sirala.alan === a) sirala.yon = -sirala.yon; else { sirala.alan = a; sirala.yon = 1; }
        renderTable(list);
      });
      wrap.querySelectorAll('.hm-sayfa').forEach(b => b.onclick = () => { sayfa = +b.dataset.s; renderTable(list); });
      const temizle = document.getElementById('hm-suz-temizle');
      if (temizle) temizle.onclick = () => { Object.keys(suz).forEach(k => suz[k] = ''); sayfa = 1; renderTable(list); };
      const excel = document.getElementById('hm-excel');
      if (excel) excel.onclick = () => excelAktar(filtered);

      // ── SATIR İÇİ TİP DEĞİŞTİRME ─────────────────────────────────────────
      // Kart açmadan tip düzeltilebilir. Değişiklik yapılınca satırda "Kaydet"
      // belirir; kaydedilmeden sayfa değişirse değişiklik uygulanmaz (kasıtlı:
      // yanlışlıkla toplu değişiklik yapılmasın).
      wrap.querySelectorAll('.hm-tip-sec').forEach(sel => {
        const btn = wrap.querySelector(`.hm-tip-kaydet[data-id="${sel.dataset.id}"]`);
        sel.onchange = () => {
          const degisti = sel.value !== sel.dataset.ilk;
          if (btn) btn.style.display = degisti ? 'block' : 'none';
          sel.style.borderColor = degisti ? 'var(--amber-text)' : '';
        };
      });
      wrap.querySelectorAll('.hm-tip-kaydet').forEach(btn => btn.onclick = async () => {
        try {
          const id = btn.dataset.id;
          const sel = wrap.querySelector(`.hm-tip-sec[data-id="${id}"]`);
          if (!sel) return;
          btn.disabled = true; btn.textContent = '…';
          const hepsi = await Store.hammaddeler.all();
          const kart = hepsi.find(x => x.id === id);
          if (!kart) { App.toast('Kart bulunamadı.', 'err'); return; }
          const yeniTip = sel.value;
          kart.tip = yeniTip;
          // Tipe göre makul varsayılanlar — YALNIZCA boş olanlar doldurulur
          if (yeniTip === 'plaka') {
            if (!kart.grainYonu) kart.grainYonu = 'yok';
            if (kart.fireYuzde == null) kart.fireYuzde = 8;
          } else if (kart.fireYuzde == null) kart.fireYuzde = 2;
          // YALNIZCA bu kartı gönder — tüm koleksiyonu göndermek binlerce
          // kartta HTTP 413 verir (payload too large).
          await App.persist(() => Store.topluGuncelle('hammaddeler', [kart], 1));
          // Bellekteki listeyi de güncelle ki tablo tazelenince doğru görünsün
          const yerel = list.find(x => x.id === id);
          if (yerel) { yerel.tip = yeniTip; yerel.grainYonu = kart.grainYonu; yerel.fireYuzde = kart.fireYuzde; }
          sel.dataset.ilk = yeniTip;
          sel.style.borderColor = '';
          btn.style.display = 'none';
          btn.disabled = false; btn.textContent = '✓ Kaydet';
          App.toast(`${kart.stokKodu || ''} → ${yeniTip} olarak kaydedildi.`, 'ok');
        } catch (e) {
          btn.disabled = false; btn.textContent = '✓ Kaydet';
          App.toast('Kaydedilemedi: ' + (e && e.message ? e.message : e), 'err');
        }
      });

      // HAMMADDE KARTI KOPYALAMA: değişiklik yapıp yeni kart olarak kaydedin
      wrap.querySelectorAll('.hm-copy').forEach(b => b.onclick = async () => {
        const hepsi = await Store.hammaddeler.all();
        const kaynak = hepsi.find(x => x.id === b.dataset.id);
        if (!kaynak) return;
        const kopya = JSON.parse(JSON.stringify(kaynak));
        kopya.id = App.uid('HM');
        kopya.stokKodu = (kaynak.stokKodu || '') + '-KOPYA';
        kopya.ad = (kaynak.ad || '') + ' (Kopya)';
        await App.persist(() => Store.topluEkle('hammaddeler', [kopya], 1));
        App.toast('Hammadde kartı kopyalandı: ' + kopya.stokKodu + ' — Düzenle ile değiştirin', 'ok');
        render(main);
      });
      // 📎 QR & TEKNİK DOSYALAR: hammadde/hırdavat kartının QR etiketi +
      // telefondan erişilen dosya alanı (step/dwg/pdf/excel/resim)
      wrap.querySelectorAll('.hm-qr').forEach(b => b.onclick = () => {
        const item = list.find(x => x.id === b.dataset.id);
        if (item) QrDosya.ac('hammadde', item.id, item.stokKodu || item.id, item.ad || '');
      });
      wrap.querySelectorAll('.hm-edit').forEach(b => b.onclick = async () => {
        const item = list.find(x => x.id === b.dataset.id);
        openForm(item, () => render(main));
      });
    }
  }

  function grainPill(g) {
    if (g === 'var') return '<span class="pill pill-purple">↕ Yönlü</span>';
    return '<span class="pill pill-gray">Yönsüz</span>';
  }
  // Süzülmüş listeyi Excel'e aktarır — ekranda ne görüyorsanız o iner.
  function excelAktar(liste) {
    try {
      const TIP_AD = { plaka: 'Plaka', hirdavat: 'Hırdavat', kenar_bandi: 'Kenar Bandı', sarf: 'Sarf' };
      const veri = liste.map(h => ({
        'Tip': TIP_AD[h.tip] || h.tip || '',
        'Stok Kodu': h.stokKodu || '',
        'Ad': h.ad || '',
        'Renk': h.renk || '',
        'En (mm)': h.tip === 'plaka' ? (h.en || '') : '',
        'Boy (mm)': h.tip === 'plaka' ? (h.boy || '') : '',
        'Kalınlık (mm)': h.kalinlik || '',
        'Birim': h.birim || '',
        'Grain': h.tip === 'plaka' ? (h.grainYonu === 'var' ? 'Yönlü' : 'Yönsüz') : '',
        'Birim Fiyat': h.birimFiyat ?? '',
        'Para Birimi': h.dvz || 'TL',
        'Fire %': h.fireYuzde ?? '',
        'Tedarik Süresi (gün)': h.tedarikSuresi ?? '',
        'Min. Sipariş': h.minSiparis ?? '',
        'Emniyet Stoğu': h.emniyetStogu ?? '',
        'Son Alış': h.sonAlisTarihi || '',
        'Son Teklif': h.sonTeklifTarihi || ''
      }));
      const ws = XLSX.utils.json_to_sheet(veri);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Hammaddeler');
      const tarih = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `hammaddeler_${tarih}.xlsx`);
      App.toast(veri.length + ' kayıt Excel\'e aktarıldı.', 'ok');
    } catch (e) {
      App.toast('Excel aktarımı başarısız: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  function colorToHex(renk) {
    const r = (renk || '').toLowerCase();
    if (r.includes('beyaz')) return '#f5f4f0';
    if (r.includes('siyah')) return '#26241f';
    if (r.includes('barok')) return '#8a6a45';
    if (r.includes('fume') || r.includes('füme')) return '#5c574f';
    if (r.includes('çinko') || r.includes('cinko')) return '#b6b8bb';
    return '#cfcabd';
  }

  async function openForm(item, onSaved, onDeger) {
    const isEdit = !!item;
    const d = item || { tip: 'plaka', kategori: 'Plaka', birim: 'M2', dvz: 'TL', grainYonu: 'yok', fireYuzde: 8, en: 1830, boy: 3660 };
    // Yeni kart açılırken çağıran bir ad önerisi geçebilir (örn. operatörün kart tanımı)
    if (!isEdit && onDeger && onDeger.ad) d.ad = onDeger.ad;
    const kategoriler = await Store.hammaddeKategorileriGetir();
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Hammadde Tipi</label>
          <select class="fselect" id="f-tip">
            <option value="plaka" ${d.tip === 'plaka' ? 'selected' : ''}>Plaka (levha malzeme — sunta/MDF)</option>
            <option value="kenar_bandi" ${d.tip === 'kenar_bandi' ? 'selected' : ''}>Kenar Bandı (metre bazlı)</option>
            <option value="hirdavat" ${d.tip === 'hirdavat' ? 'selected' : ''}>Hırdavat (parça/aksesuar)</option>
            <option value="sarf" ${d.tip === 'sarf' ? 'selected' : ''}>Sarf Malzeme (boya, tutkal, kimyasal — gram/kg)</option>
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Stok Kodu</label>
          <input class="finput" id="f-stokkodu" value="${App.escapeHtml(d.stokKodu || '')}" placeholder="örn. 50.002.230.01.010.00"></div>
      </div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Kategori (Stok Sınıflandırması)</label>
          <select class="fselect" id="f-kategori">
            ${kategoriler.map(k => `<option value="${App.escapeHtml(k)}" ${d.kategori === k ? 'selected' : ''}>${App.escapeHtml(k)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:flex-end"><button type="button" class="btn btn-sm" id="f-yeni-kategori">+ Yeni Kategori</button></div>
      </div>
      <div class="fgroup"><label class="flbl">Hammadde Adı</label>
        <input class="finput" id="f-ad" value="${App.escapeHtml(d.ad || '')}" placeholder="örn. SUNTALAM CY 30MM KAR BEYAZ"></div>

      <div id="f-plaka-fields">
        <div class="frow">
          <div class="fgroup"><label class="flbl">En (mm)</label><input class="finput" id="f-en" type="number" value="${d.en ?? ''}"></div>
          <div class="fgroup"><label class="flbl">Boy (mm)</label><input class="finput" id="f-boy" type="number" value="${d.boy ?? ''}"></div>
          <div class="fgroup"><label class="flbl">Kalınlık (mm)</label><input class="finput" id="f-kalinlik" type="number" value="${d.kalinlik ?? ''}"></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Renk / Desen</label><input class="finput" id="f-renk" value="${App.escapeHtml(d.renk || '')}" placeholder="örn. Beyaz, Barok, Siyah"></div>
          <div class="fgroup"><label class="flbl">Grain (Desen) İşlem Yönü</label>
            <select class="fselect" id="f-grain">
              <option value="yok" ${d.grainYonu === 'yok' ? 'selected' : ''}>Yönsüz (her yöne kesilebilir)</option>
              <option value="var" ${d.grainYonu === 'var' ? 'selected' : ''}>Yönlü (desen tek eksende — nesting'de korunur)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="frow">
        <div class="fgroup"><label class="flbl">Birim</label>
          <select class="fselect" id="f-birim">
            ${['M2','METRE','ADET','KG','GRAM','LITRE'].map(u => `<option value="${u}" ${d.birim === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Fire Oranı (%)</label><input class="finput" id="f-fire" type="number" step="0.1" value="${d.fireYuzde ?? 0}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Tedarik Süresi (gün)</label>
          <input class="finput" id="f-tedariksuresi" type="number" min="0" value="${d.tedarikSuresiGun ?? 14}">
          <div class="fhint">MRP, sipariş tarihini bu süreye göre geriye alır</div></div>
        <div class="fgroup"><label class="flbl">Min. Sipariş Miktarı</label>
          <input class="finput" id="f-minsiparis" type="number" min="0" step="0.01" value="${d.minSiparisMiktari ?? 0}">
          <div class="fhint">Tedarikçinin kabul ettiği en düşük parti</div></div>
        <div class="fgroup"><label class="flbl">Emniyet Stoğu</label>
          <input class="finput" id="f-emniyet" type="number" min="0" step="0.01" value="${d.emniyetStogu ?? 0}">
          <div class="fhint">Bu seviyenin altına düşülmez</div></div>
      </div>

      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Fiyat & Tarih Bilgisi</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Birim Fiyat (mal bedeli)</label><input class="finput" id="f-fiyat" type="number" step="0.0001" value="${d.birimFiyat ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Nakliye / Kargo Payı (birim başına, ₺)</label>
          <input class="finput" id="f-nakliye-birim" type="number" step="0.0001" value="${d.nakliyeBirimMaliyeti ?? ''}">
          <div class="fhint">${d.nakliyeKaynakBelge ? 'Satınalmadan geldi: ' + App.escapeHtml(d.nakliyeKaynakBelge) + (d.nakliyeGuncellemeTarihi ? ' (' + d.nakliyeGuncellemeTarihi + ')' : '') : 'Toplam nakliye bedeli / alınan adet. Maliyete mal bedeline EK olarak girer.'}</div>
        </div>
        <div class="fgroup"><label class="flbl">Para Birimi</label>
          <select class="fselect" id="f-dvz">
            <option value="TL" ${d.dvz === 'TL' ? 'selected' : ''}>₺ TL</option>
            <option value="USD" ${d.dvz === 'USD' ? 'selected' : ''}>$ USD</option>
            <option value="EUR" ${d.dvz === 'EUR' ? 'selected' : ''}>€ EUR</option>
          </select>
        </div>
        <div class="fgroup"><label class="flbl">KDV Oranı (%)</label><input class="finput" id="f-kdv" type="number" step="1" min="0" max="100" value="${d.kdvOraniYuzde ?? 18}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Satınalma Tarihi</label><input class="finput" id="f-alistarih" type="date" value="${d.sonAlisTarihi || ''}"></div>
        <div class="fgroup"><label class="flbl">Teklif Tarihi</label><input class="finput" id="f-tekliftarih" type="date" value="${d.sonTeklifTarihi || ''}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Tedarikçi (Serbest Not)</label><input class="finput" id="f-tedarikci" value="${App.escapeHtml(d.tedarikci || '')}"></div>
      <div class="fgroup"><label class="flbl">Varsayılan Tedarikçi (Cari)</label>
        <div class="flex-gap" style="gap:8px">
          <input class="finput" id="f-varsayilan-tedarikci-ad" value="${App.escapeHtml(d.varsayilanTedarikciAdi || '')}" placeholder="Seçilmedi (her satınalmada sorulur)" readonly style="flex:1;background:var(--bg)">
          <input type="hidden" id="f-varsayilan-tedarikci-id" value="${d.varsayilanTedarikciId || ''}">
          <button type="button" class="btn" id="f-varsayilan-tedarikci-sec">🔍 Cari Seç</button>
        </div>
      </div>
      <div class="fhint" style="margin-top:-4px">Bir kere seçildiğinde, bu hammadde için açılan tüm satınalma siparişlerinde tedarikçi otomatik gelir — tekrar sorulmaz.</div>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = `
      ${isEdit ? '<button class="btn btn-red" id="f-del" style="margin-right:auto">Sil</button>' : ''}
      <button class="btn" id="f-cancel">Vazgeç</button>
      <button class="btn btn-blue" id="f-save">${isEdit ? 'Güncelle' : 'Kaydet'}</button>
    `;
    App.openModal({ title: isEdit ? 'Hammadde Düzenle' : 'Yeni Hammadde Tanımla', sub: isEdit ? d.stokKodu : 'Plaka veya hırdavat hammadde kartı oluşturun', body, footer, wide: true });

    function togglePlakaFields() {
      document.getElementById('f-plaka-fields').style.display = document.getElementById('f-tip').value === 'plaka' ? 'block' : 'none';
    }
    document.getElementById('f-tip').onchange = togglePlakaFields;
    togglePlakaFields();

    document.getElementById('f-yeni-kategori').onclick = () => {
      const yeniAd = window.prompt('Yeni kategori adı (örn. Yedek Parça, Boya Malzemesi):');
      if (!yeniAd || !yeniAd.trim()) return;
      const guncelD = { ...d, ...okuFormDegerleri() };
      App.persist(async () => {
        const liste = await Store.hammaddeKategorileriGetir();
        if (!liste.includes(yeniAd.trim())) {
          liste.push(yeniAd.trim());
          await Store.hammaddeKategorileriKaydet(liste);
        }
        guncelD.kategori = yeniAd.trim();
      }).then(() => {
        App.closeModal();
        openForm(guncelD, onSaved);
      });
    };

    if (isEdit) document.getElementById('f-del').onclick = () => {
      App.confirmDialog(`"${d.ad}" hammaddesini silmek istediğinize emin misiniz?`, async () => {
        await App.persist(() => Store.hammaddeler.remove(d.id));
        App.toast('Hammadde silindi', 'ok');
        onSaved();
      });
    };
    document.getElementById('f-cancel').onclick = App.closeModal;
    document.getElementById('f-varsayilan-tedarikci-sec').onclick = () => {
      const guncelD = { ...d, ...okuFormDegerleri() };
      App.closeModal();
      App.goTo('cari_secici', {
        baslik: 'Bu Hammadde İçin Varsayılan Tedarikçi Seç',
        varsayilanGrup: 'tedarikci',
        geriDon: () => { App.goTo('hammadde'); openForm(guncelD, onSaved); },
        onSecildi: (secim) => {
          App.goTo('hammadde');
          openForm({ ...guncelD, varsayilanTedarikciId: secim.id, varsayilanTedarikciAdi: secim.unvan }, onSaved);
        }
      });
    };

    function okuFormDegerleri() {
      // Modal kapatılmadan önce formdaki güncel değerleri toplar (Cari Seç sırasında kaybolmasın)
      return {
        tip: document.getElementById('f-tip').value,
        kategori: document.getElementById('f-kategori').value,
        stokKodu: document.getElementById('f-stokkodu').value,
        ad: document.getElementById('f-ad').value,
        birim: document.getElementById('f-birim').value,
        fireYuzde: document.getElementById('f-fire').value,
        birimFiyat: document.getElementById('f-fiyat').value,
        dvz: document.getElementById('f-dvz').value,
        kdvOraniYuzde: document.getElementById('f-kdv').value,
        tedarikci: document.getElementById('f-tedarikci').value,
        tedarikSuresiGun: document.getElementById('f-tedariksuresi').value,
        minSiparisMiktari: document.getElementById('f-minsiparis').value,
        emniyetStogu: document.getElementById('f-emniyet').value
      };
    }

    document.getElementById('f-save').onclick = async () => {
     try {
      const tip = document.getElementById('f-tip').value;
      const ad = document.getElementById('f-ad').value.trim();
      if (!ad) { App.toast('Hammadde adı zorunlu', 'err'); return; }
      const next = {
        id: d.id || App.uid('HM'),
        tip,
        kategori: document.getElementById('f-kategori').value,
        stokKodu: document.getElementById('f-stokkodu').value.trim(),
        ad,
        en: tip === 'plaka' ? parseFloat(document.getElementById('f-en').value) || null : null,
        boy: tip === 'plaka' ? parseFloat(document.getElementById('f-boy').value) || null : null,
        kalinlik: tip === 'plaka' ? parseFloat(document.getElementById('f-kalinlik').value) || null : null,
        renk: tip === 'plaka' ? document.getElementById('f-renk').value.trim() : null,
        grainYonu: tip === 'plaka' ? document.getElementById('f-grain').value : 'yok',
        birim: document.getElementById('f-birim').value,
        fireYuzde: parseFloat(document.getElementById('f-fire').value) || 0,
        // MRP parametreleri: tedarik süresi sipariş tarihini belirler,
        // min sipariş ve emniyet stoğu önerilen miktarı etkiler.
        tedarikSuresiGun: parseInt(document.getElementById('f-tedariksuresi').value) || 14,
        minSiparisMiktari: parseFloat(document.getElementById('f-minsiparis').value) || 0,
        emniyetStogu: parseFloat(document.getElementById('f-emniyet').value) || 0,
        birimFiyat: parseFloat(document.getElementById('f-fiyat').value) || 0,
        dvz: document.getElementById('f-dvz').value,
        // Kargo payı AYRI saklanır: fiyatın içine gömülürse ne kadarının
        // kargo olduğu görünmez ve fiyat elle güncellenince sessizce silinir.
        nakliyeBirimMaliyeti: parseFloat(document.getElementById('f-nakliye-birim').value) || 0,
        nakliyeDvz: 'TL',
        nakliyeKaynakBelge: d.nakliyeKaynakBelge || null,
        nakliyeGuncellemeTarihi: d.nakliyeGuncellemeTarihi || null,
        kdvOraniYuzde: parseFloat(document.getElementById('f-kdv').value) ?? 18,
        sonAlisTarihi: document.getElementById('f-alistarih').value || null,
        sonTeklifTarihi: document.getElementById('f-tekliftarih').value || null,
        tedarikci: document.getElementById('f-tedarikci').value.trim(),
        varsayilanTedarikciId: document.getElementById('f-varsayilan-tedarikci-id').value || null,
        varsayilanTedarikciAdi: document.getElementById('f-varsayilan-tedarikci-ad').value || null
      };
      await App.persist(() => Store.hammaddeler.upsert(next));
      App.toast(isEdit ? 'Hammadde güncellendi' : 'Hammadde tanımlandı', 'ok');
      App.closeModal();
      if (typeof onSaved === 'function') await onSaved(next);   // kaydedilen kaydı geç
     } catch (e) {
      App.toast('Hammadde kaydedilemedi: ' + (e && e.message ? e.message : e), 'err');
     }
    };
  }

  return { render, openForm };
})();
