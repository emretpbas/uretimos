// ════════════════════════════════════════════════════════════════════════════
// DEPO PANELİ — 3 AMBAR YAPISI (Hammadde/Hırdavat Deposu, Üretim Ambarı,
// Sevkiyat Deposu). Depo Girişi (satınalma siparişi onayında otomatik
// "beklenen giriş" oluşur; depocu irsaliye/fatura no girip cari kontrolü
// yapıp onaylar, kalite problemi bildirebilir, eksik teslimat sistemi
// otomatik tespit eder). Sipariş/hammadde ihtiyacı karşılama oranı (eksiye
// düşenler alarm), kritik stok seviyesi (manuel, miktar bazlı).
// ════════════════════════════════════════════════════════════════════════════
PageModules.depo_panel = (() => {
  let activeTab = 'giris';

  async function render(main) {
    const [hammaddeler, yarimamuller, urunler, stokRaf, talepler, satinalmaTalepleri, stokHareketleri,
           hammaddeIhtiyaclari, kritikStokSeviyeleri, depoGirisleri, musteriler, tedarikciler, satinalmaSiparisleri] = await Promise.all([
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.urunler.all(),
      Store.stokRaf.all(), Store.talepler.all(), Store.satinalmaTalepleri.all(), Store.stokHareketleri.all(),
      Store.hammaddeIhtiyaclari.all(), Store.kritikStokSeviyeleri.all(), Store.depoGirisleri.all(),
      Store.musteriler.all(), Store.tedarikciler.all(), Store.satinalmaSiparisleri.all()
    ]);

    const bekleyenGirisSayisi = depoGirisleri.filter(g => g.durum === 'bekliyor').length;

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Depo Paneli</div>
          <div class="page-sub">3 ambar yapısı: Hammadde/Hırdavat Deposu → Üretim Ambarı → Sevkiyat Deposu</div>
        </div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'giris' ? 'active' : ''}" data-tab="giris">Depo Girişi ${bekleyenGirisSayisi ? '<span class="pill pill-amber" style="margin-left:4px">' + bekleyenGirisSayisi + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'stok' ? 'active' : ''}" data-tab="stok">Tüm Stoklar (3 Ambar)</div>
        <div class="tab ${activeTab === 'karsilama' ? 'active' : ''}" data-tab="karsilama">Sipariş Karşılama</div>
        <div class="tab ${activeTab === 'kritik' ? 'active' : ''}" data-tab="kritik">Kritik Stok Seviyeleri</div>
        <div class="tab ${activeTab === 'dusum' ? 'active' : ''}" data-tab="dusum">Malzeme Düşümü</div>
        <div class="tab ${activeTab === 'sayim' ? 'active' : ''}" data-tab="sayim">Envanter Sayımı</div>
        <div class="tab ${activeTab === 'hareket' ? 'active' : ''}" data-tab="hareket">Ambar Hareketleri</div>
        <div class="tab ${activeTab === 'giris_log' ? 'active' : ''}" data-tab="giris_log">📒 Giriş Kayıt Defteri</div>
      </div>
      <div id="dp-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('dp-tab-content');
    if (activeTab === 'giris') { content.innerHTML = renderGirisTab(depoGirisleri, tedarikciler); wireGirisTab(depoGirisleri, hammaddeler, tedarikciler, render, main); }
    else if (activeTab === 'stok') { content.innerHTML = renderStokTab(hammaddeler, yarimamuller, urunler, stokRaf); wireStokTab(hammaddeler, yarimamuller, urunler, stokRaf, render, main); }
    else if (activeTab === 'karsilama') { content.innerHTML = renderKarsilamaTab(hammaddeIhtiyaclari, hammaddeler, stokRaf, satinalmaTalepleri, satinalmaSiparisleri); wireKarsilamaTab(); }
    else if (activeTab === 'kritik') { content.innerHTML = renderKritikStokTab(hammaddeler, stokRaf, kritikStokSeviyeleri, stokHareketleri, satinalmaTalepleri); wireKritikStokTab(hammaddeler, stokRaf, kritikStokSeviyeleri, render, main); }
    else if (activeTab === 'giris_log') { content.innerHTML = renderGirisLogTab(depoGirisleri, tedarikciler); wireGirisLogTab(); }
    else if (activeTab === 'dusum') { content.innerHTML = renderDusumTab(talepler); wireDusumTab(talepler, stokRaf, render, main); }
    else if (activeTab === 'sayim') {
      // Envanter sayımı sekmesi kendi içeriğini asenkron çizer (sayim.js)
      content.innerHTML = '<div style="padding:30px;text-align:center"><div class="loading-spin" style="margin:0 auto"></div></div>';
      Sayim.sekmeCiz(content, () => render(main));
    }
    else content.innerHTML = renderHareketTab(stokHareketleri);
  }

  // ── DEPO GİRİŞİ — satınalma siparişi onayında otomatik "beklenen giriş" ────
  // oluşur (bkz. app.js: satinalmaSiparisiOnaylaninceDepoGirisiOlustur). Depocu
  // irsaliye/fatura no girer; cari kart (tedarikçi) kontrolü yapılır; gelen
  // miktar sipariş miktarından azsa "eksik teslimat" otomatik tespit edilip
  // satınalmaya bildirim düşer; kalite problemi bildirilirse karantina stoğuna
  // alınır. Onaylanan giriş Hammadde Deposu'na stok ekler.

  // ══════════════════════════════════════════════════════════════════════════
  // GİRİŞ KAYIT DEFTERİ (LOG)
  // Hangi malzeme, hangi tarihte, hangi irsaliye/fatura ile, hangi cariden
  // geldi; DEPO onayını kim/ne zaman verdi; KALİTE onayını kim/ne zaman verdi.
  // Kayıtlar depoGirisleri üzerinden okunur (ayrı log tablosu tutulmaz — tek
  // kaynak ilkesi: veri çoğaltmak tutarsızlık üretir).
  // ══════════════════════════════════════════════════════════════════════════
  function renderGirisLogTab(depoGirisleri, tedarikciler) {
    const tedAd = (id) => { const t = tedarikciler.find(x => x.id === id); return t ? t.unvan : (id || '—'); };
    const DURUM = {
      bekliyor: ['Giriş bekliyor', 'pill-gray'],
      depo_onayladi_kalite_bekliyor: ['Depo onayladı — kalite bekliyor', 'pill-amber'],
      karantina: ['KARANTİNA (kalite sorunu)', 'pill-red'],
      tamamlandi: ['Stoğa alındı', 'pill-green'],
      reddedildi: ['Reddedildi / iade', 'pill-red']
    };
    const kayitlar = (depoGirisleri || [])
      .filter(g => g.durum !== 'bekliyor')      // fiilen giriş yapılmış olanlar
      .sort((a, b) => (b.depoOnayZamani || b.girisTarihi || '').localeCompare(a.depoOnayZamani || a.girisTarihi || ''));

    if (!kayitlar.length) {
      return `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Henüz işlenmiş depo girişi yok. Giriş yapıldıkça kayıtlar burada tarih, irsaliye ve onay bilgisiyle listelenir.</div>
      </div></div>`;
    }

    return `<div class="card">
      <div class="card-hdr"><div class="card-title">📒 Giriş Kayıt Defteri (${kayitlar.length} kayıt)</div></div>
      <div class="fhint" style="margin-bottom:8px">
        Her satır bir mal girişinin tam izidir: <b>ne geldi, ne zaman, hangi belgeyle, kimden</b> ve
        <b>hangi onaylarla</b> stoğa alındı. Denetimde ilk bakılacak yer burasıdır.
      </div>
      <div style="overflow-x:auto">
      <table class="dtable"><tr>
        <th>Giriş Tarihi</th><th>Malzeme</th><th class="r">Gelen</th>
        <th>Cari (Tedarikçi)</th><th>İrsaliye No</th><th>Fatura No</th>
        <th>Depo Onayı</th><th>Kalite Onayı</th><th>Durum</th></tr>
        ${kayitlar.map(g => {
          const d = DURUM[g.durum] || [g.durum || '—', 'pill-gray'];
          const zaman = (v) => v ? String(v).slice(0, 16).replace('T', ' ') : '';
          return `<tr>
            <td style="font-size:11.5px">${App.escapeHtml(g.girisTarihi || '')}</td>
            <td>${App.escapeHtml(g.kalemAdi || '')}${g.siparisKod ? `<br><span class="muted mono" style="font-size:10px">${App.escapeHtml(g.siparisKod)}</span>` : ''}</td>
            <td class="r">${App.fmt(g.gelenMiktar || 0, 1)} ${App.escapeHtml(g.birim || '')}${(g.siparisMiktari && g.gelenMiktar < g.siparisMiktari) ? `<br><span class="muted" style="font-size:10px">sipariş ${App.fmt(g.siparisMiktari, 1)}</span>` : ''}</td>
            <td style="font-size:11.5px">${App.escapeHtml(g.tedarikciAdi || tedAd(g.tedarikciId))}${g.faturaCariUnvan ? `<br><span class="muted" style="font-size:10px">fatura: ${App.escapeHtml(g.faturaCariUnvan)}</span>` : ''}</td>
            <td class="mono" style="font-size:11px">${g.irsaliyeNo ? App.escapeHtml(g.irsaliyeNo) : '<span class="muted">—</span>'}</td>
            <td class="mono" style="font-size:11px">${g.faturaNo ? App.escapeHtml(g.faturaNo) : '<span class="muted">—</span>'}</td>
            <td style="font-size:11px">${g.depoOnaylayan ? `<b>${App.escapeHtml(g.depoOnaylayan)}</b><br><span class="muted" style="font-size:10px">${zaman(g.depoOnayZamani)}</span>` : '<span class="muted">—</span>'}</td>
            <td style="font-size:11px">${g.kaliteOnaylayan ? `<b>${App.escapeHtml(g.kaliteOnaylayan)}</b><br><span class="muted" style="font-size:10px">${zaman(g.kaliteOnayZamani || g.kaliteOnayTarihi)}</span>` : (g.kaliteOnayTarihi ? App.escapeHtml(g.kaliteOnayTarihi) : '<span class="muted">bekliyor</span>')}</td>
            <td><span class="pill ${d[1]}" style="font-size:9px">${d[0]}</span></td>
          </tr>`;
        }).join('')}
      </table></div>
    </div>`;
  }

  function wireGirisLogTab() { /* salt okunur defter — etkileşim yok */ }

  function renderGirisTab(depoGirisleri, tedarikciler) {
    const bekleyenler = depoGirisleri.filter(g => g.durum === 'bekliyor');
    const kaliteBekleyenler = depoGirisleri.filter(g => g.durum === 'depo_onayladi_kalite_bekliyor' || g.durum === 'karantina');
    const tamamlananlar = depoGirisleri.filter(g => g.durum !== 'bekliyor');

    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Beklenen Depo Girişleri (Onaylanmış Satınalma Siparişleri)</div></div>`;
    if (!bekleyenler.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="eicon">▭</div><div class="etitle">Bekleyen depo girişi yok</div><div class="edesc">Yönetim bir satınalma siparişini onayladığında burada otomatik bir "beklenen giriş" kaydı oluşur.</div></div>`;
    } else {
      const gruplar = new Map();
      bekleyenler.forEach(g => {
        const anahtar = g.tedarikciAdi || '—';
        if (!gruplar.has(anahtar)) gruplar.set(anahtar, []);
        gruplar.get(anahtar).push(g);
      });
      [...gruplar.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([tedarikciAdi, liste], grupIndex) => {
        html += `<div style="margin-bottom:14px">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${App.escapeHtml(tedarikciAdi)} <span class="pill pill-gray">${liste.length} giriş</span>
            <span style="flex:1"></span>
            <button class="btn btn-sm btn-blue dp-toplu-giris" data-grup="${grupIndex}" style="display:none">📥 Seçilenleri Toplu Gir</button>
          </div>
          <table class="dtable"><tr><th></th><th>Satınalma Sipariş No</th><th>Ürün/Kalem</th><th class="r">Sipariş Miktarı</th><th></th></tr>`;
        liste.forEach(g => {
          html += `<tr><td><input type="checkbox" class="dp-giris-check" data-grup="${grupIndex}" data-id="${g.id}"></td>
            <td class="mono">${g.satinalmaSiparisKod}</td>
            <td>${App.escapeHtml(g.kalemAdi)}</td><td class="r">${App.fmt(g.siparisMiktari, 2)} ${g.birim || ''}</td>
            <td><button class="btn btn-sm btn-blue dp-giris-isle" data-id="${g.id}">Tek Tek Gir</button></td></tr>`;
        });
        html += `</table></div>`;
      });
    }
    html += `</div>`;

    if (kaliteBekleyenler.length) {
      html += `<div class="card" style="background:var(--blue-bg);border-color:var(--blue-light)">
        <div style="font-size:13px;color:var(--blue-text);font-weight:700;margin-bottom:6px">⏳ ${kaliteBekleyenler.length} giriş Kalite Kontrol onayında — stoğa HENÜZ EKLENMEDİ</div>
        <div style="font-size:11.5px;color:var(--blue-text);margin-bottom:10px">Bu girişler depo tarafından onaylandı ama miktarları Hammadde Deposu stoğuna işlenmedi. Stoğun gerçekten artması için <b>Kalite Kontrol</b> ekranından da onaylanmaları gerekir.</div>
        <table class="dtable"><tr><th>Satınalma Sipariş No</th><th>Tedarikçi</th><th>Ürün</th><th class="r">Gelen Miktar</th></tr>
          ${kaliteBekleyenler.map(g => `<tr><td class="mono">${g.satinalmaSiparisKod}</td><td>${App.escapeHtml(g.tedarikciAdi)}</td>
            <td>${App.escapeHtml(g.kalemAdi)}</td><td class="r">${App.fmt(g.gelenMiktar || 0, 2)} ${g.birim || ''}</td></tr>`).join('')}
        </table>
      </div>`;
    }

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Tamamlanmış / Karantinadaki Girişler</div></div>`;
    if (!tamamlananlar.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz tamamlanmış giriş yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Giriş No</th><th>Tedarikçi</th><th>Ürün</th><th class="r">Gelen Miktar</th><th>Durum</th><th>Tarih</th></tr>`;
      [...tamamlananlar].sort((a, b) => (b.girisTarihi || '').localeCompare(a.girisTarihi || '')).forEach(g => {
        html += `<tr><td class="mono">${g.id.slice(-8)}</td><td>${App.escapeHtml(g.tedarikciAdi)}</td>
          <td>${App.escapeHtml(g.kalemAdi)}</td><td class="r">${App.fmt(g.gelenMiktar || 0, 2)} ${g.birim || ''}</td>
          <td>${depoGirisDurumPill(g.durum)}</td><td style="font-size:11px">${g.girisTarihi || '—'}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function depoGirisDurumPill(d) {
    const map = {
      bekliyor: ['Depo Onayı Bekliyor', 'pill-amber'],
      depo_onayladi_kalite_bekliyor: ['Depo Onayladı — Kalite Bekliyor', 'pill-blue'],
      tamamlandi: ['Kalite Onaylı — Stoğa Eklendi', 'pill-green'],
      kalite_reddetti: ['Kalite Reddetti (İade)', 'pill-red'],
      karantina: ['Karantinada (Kalite Problemi)', 'pill-red'],
      eksik_teslimat: ['Eksik Teslimat', 'pill-amber']
    };
    const [l, c] = map[d] || ['Bilinmiyor', 'pill-gray'];
    return `<span class="pill ${c}">${l}</span>`;
  }

  function wireGirisTab(depoGirisleri, hammaddeler, tedarikciler, render, main) {
    document.querySelectorAll('.dp-giris-isle').forEach(b => b.onclick = () => {
      const g = depoGirisleri.find(x => x.id === b.dataset.id);
      openDepoGirisForm(g, tedarikciler, () => render(main));
    });

    // Her tedarikçi grubu kendi checkbox setini ve "Seçilenleri Toplu Gir"
    // butonunu yönetir.
    document.querySelectorAll('.dp-toplu-giris').forEach(topluBtn => {
      const grupIndex = topluBtn.dataset.grup;
      const checkboxlar = document.querySelectorAll(`.dp-giris-check[data-grup="${grupIndex}"]`);
      function gorunurlugunuGuncelle() {
        const seciliSayisi = [...checkboxlar].filter(c => c.checked).length;
        topluBtn.style.display = seciliSayisi > 0 ? 'inline-block' : 'none';
        topluBtn.textContent = seciliSayisi > 0 ? `📥 Seçilenleri Toplu Gir (${seciliSayisi})` : '📥 Seçilenleri Toplu Gir';
      }
      checkboxlar.forEach(c => c.onchange = gorunurlugunuGuncelle);
      topluBtn.onclick = () => {
        const seciliIdler = [...checkboxlar].filter(c => c.checked).map(c => c.dataset.id);
        if (!seciliIdler.length) return;
        const secilenGirisler = depoGirisleri.filter(g => seciliIdler.includes(g.id));
        openTopluDepoGirisForm(secilenGirisler, tedarikciler, () => render(main));
      };
    });
  }

  // Aynı tedarikçiye ait seçilen tüm bekleyen girişler için TEK bir formda:
  // ortak bilgiler (tedarikçi/irsaliye/fatura/fatura cari/giriş tarihi) bir kere
  // girilir, her kalemin kendi gelen miktarı ve kalite problemi ayrı ayrı
  // belirtilebilir. Onaylandığında her kalem kendi akışından (eksik teslimat/
  // kalite kontrolü) geçer — tıpkı tek tek girilmiş gibi.
  function openTopluDepoGirisForm(girisler, tedarikciler, onSaved) {
    const ilkGiris = girisler[0];
    const tedarikciAdi = ilkGiris.tedarikciAdi;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b>${App.escapeHtml(tedarikciAdi)}</b> için ${girisler.length} kalem topluca giriş yapılacak.</div>
      <div class="fgroup"><label class="flbl">Tedarikçi (Cari Kart Kontrolü)</label>
        <select class="fselect" id="tdg-tedarikci">
          ${tedarikciler.map(t => `<option value="${t.id}" ${ilkGiris.tedarikciId === t.id ? 'selected' : ''}>${App.escapeHtml(t.unvan)}</option>`).join('')}
        </select>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">İrsaliye No</label><input class="finput" id="tdg-irsaliye"></div>
        <div class="fgroup"><label class="flbl">Fatura No</label><input class="finput" id="tdg-fatura"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Fatura Üzerindeki Cari Ünvan</label><input class="finput" id="tdg-fatura-cari" placeholder="Faturadaki tedarikçi ünvanı"></div>
        <div class="fgroup"><label class="flbl">Giriş Tarihi</label><input class="finput" id="tdg-giristarihi" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Kalem Bazlı Gelen Miktarlar</div>
      <table class="dtable"><tr><th>Kalem</th><th class="r">Sipariş Miktarı</th><th class="r">Gelen Miktar</th><th>Kalite Problemi</th></tr>
        ${girisler.map(g => `<tr>
          <td>${App.escapeHtml(g.kalemAdi)}<br><span class="muted mono" style="font-size:10px">${g.satinalmaSiparisKod}</span></td>
          <td class="r">${App.fmt(g.siparisMiktari, 2)} ${g.birim || ''}</td>
          <td class="r"><input class="finput tdg-miktar" data-id="${g.id}" type="number" step="0.01" value="${g.siparisMiktari}" style="width:100px;text-align:right"></td>
          <td><input type="checkbox" class="tdg-kalite-problemi" data-id="${g.id}"></td>
        </tr>`).join('')}
      </table>
    `;
    const footer = `<button class="btn" id="tdg-cancel">Vazgeç</button><button class="btn btn-green" id="tdg-confirm">Toplu Depo Girişini Onayla</button>`;
    App.openModal({ title: 'Toplu Depo Girişi', sub: tedarikciAdi + ' — ' + girisler.length + ' kalem', body, footer, wide: true });
    document.getElementById('tdg-cancel').onclick = App.closeModal;

    document.getElementById('tdg-confirm').onclick = async () => {
      const tedarikciId = document.getElementById('tdg-tedarikci').value;
      const ted = tedarikciler.find(t => t.id === tedarikciId);
      const faturaCari = document.getElementById('tdg-fatura-cari').value.trim();
      const cariUyusmuyor = faturaCari && ted && !ted.unvan.toLowerCase().includes(faturaCari.toLowerCase()) && !faturaCari.toLowerCase().includes(ted.unvan.toLowerCase());
      if (cariUyusmuyor) { App.toast('⚠ Fatura cari kartı tedarikçi ile uyuşmuyor.', 'err'); return; }

      const irsaliyeNo = document.getElementById('tdg-irsaliye').value.trim();
      const faturaNo = document.getElementById('tdg-fatura').value.trim();
      const girisTarihi = document.getElementById('tdg-giristarihi').value;

      // BELGE ZORUNLULUĞU (kayıp-kaçak kontrolü): belgesiz mal girişi, hayali
      // alım ve sonradan düzeltme yoluyla kaçağın en kolay girdiği yerdir.
      if (!irsaliyeNo && !faturaNo) {
        App.toast('İrsaliye veya fatura numarası olmadan depo girişi onaylanamaz.', 'err');
        return;
      }

      // ── İRSALİYE TEKİLLİĞİ ────────────────────────────────────────────────
      // Aynı cariye ait aynı irsaliye numarası, FARKLI bir malzeme için tekrar
      // kullanılamaz. Bu, en sık görülen kaçak/hata biçimlerinden birini kapatır:
      // gerçek bir irsaliye numarasının arkasına başka malzeme girilmesi.
      if (irsaliyeNo) {
        const oncekiler = (await Store.depoGirisleri.all()).filter(x =>
          x.irsaliyeNo && String(x.irsaliyeNo).trim().toLocaleLowerCase('tr') === irsaliyeNo.toLocaleLowerCase('tr') &&
          (x.tedarikciId || '') === (tedarikciId || '') &&
          !girisler.some(sg => sg.id === x.id));          // bu işlemdekiler hariç
        if (oncekiler.length) {
          const izinliler = new Set(oncekiler.map(x => x.hammaddeId || x.kalemAdi));
          const cakisan = girisler.filter(g => !izinliler.has(g.hammaddeId || g.kalemAdi));
          if (cakisan.length) {
            App.openModal({
              title: '⛔ İrsaliye Numarası Çakışması',
              sub: 'Aynı cari + aynı irsaliye, farklı malzeme',
              body: `<div style="font-size:12.5px;margin-bottom:8px">
                  <b>${App.escapeHtml(irsaliyeNo)}</b> numaralı irsaliye bu cari için daha önce
                  <b>${[...izinliler].length}</b> kalemde kullanılmış. Aynı irsaliye numarasıyla
                  <b>farklı malzeme</b> girilemez.
                </div>
                <div style="font-size:11.5px;border:1px solid var(--border);border-radius:8px;padding:8px">
                  <div style="font-weight:600;margin-bottom:4px">Bu irsaliyede kayıtlı olanlar:</div>
                  ${oncekiler.slice(0, 8).map(x => '• ' + App.escapeHtml(x.kalemAdi || '') + ' — ' + App.fmt(x.gelenMiktar || 0, 1) + ' ' + App.escapeHtml(x.birim || '') + ' (' + App.escapeHtml(x.girisTarihi || '') + ')').join('<br>')}
                  <div style="font-weight:600;margin:8px 0 4px;color:var(--red-text)">Girilmek istenen farklı malzeme:</div>
                  ${cakisan.slice(0, 8).map(x => '• ' + App.escapeHtml(x.kalemAdi || '')).join('<br>')}
                </div>
                <div class="muted" style="font-size:11px;margin-top:8px">
                  Doğru irsaliye numarasını girin; irsaliye gerçekten aynıysa malzemeyi o irsaliyenin
                  ilk girişiyle birlikte işleyin.
                </div>`,
              footer: '<button class="btn" id="irs-kapat">Anladım</button>'
            });
            document.getElementById('irs-kapat').onclick = App.closeModal;
            return;
          }
        }
      }

      const guncelDepoGirisleri = await Store.depoGirisleri.all();
      let eksikSayisi = 0, kaliteSorunluSayisi = 0;

      for (const giris of girisler) {
        const g = guncelDepoGirisleri.find(x => x.id === giris.id);
        if (!g) continue;
        const gelenMiktar = parseFloat(document.querySelector(`.tdg-miktar[data-id="${giris.id}"]`).value) || 0;
        const kaliteProblemi = document.querySelector(`.tdg-kalite-problemi[data-id="${giris.id}"]`).checked;
        const eksikMi = gelenMiktar < g.siparisMiktari;
        const eksikMiktar = eksikMi ? g.siparisMiktari - gelenMiktar : 0;

        g.tedarikciId = tedarikciId;
        g.irsaliyeNo = irsaliyeNo;
        g.faturaNo = faturaNo;
        g.depoOnaylayan = App.aktifRol();
        g.depoOnayZamani = new Date().toISOString();
        g.faturaCariUnvan = faturaCari;
        g.girisTarihi = girisTarihi;
        g.gelenMiktar = gelenMiktar;
        g.aciklama = (g.aciklama || '') + (eksikMi ? ` [Toplu girişte ${eksikMiktar} ${g.birim || ''} eksik geldi]` : '');

        if (kaliteProblemi) {
          g.durum = 'karantina';
          g.kaliteProblemiBildirildi = true;
          kaliteSorunluSayisi++;
        } else {
          g.durum = 'depo_onayladi_kalite_bekliyor';
        }
        if (eksikMi) eksikSayisi++;
        await Store.depoGirisleri.upsert(g);
      }

      let mesaj = `${girisler.length} kalem toplu olarak Depo Girişi yapıldı, Kalite Kontrol onayına gönderildi (stok HENÜZ EKLENMEDİ).`;
      if (eksikSayisi > 0) mesaj += ` ⚠ ${eksikSayisi} kalemde eksik teslimat var.`;
      if (kaliteSorunluSayisi > 0) mesaj += ` ⚠ ${kaliteSorunluSayisi} kalem karantinaya alındı.`;
      App.toast(mesaj, (eksikSayisi > 0 || kaliteSorunluSayisi > 0) ? 'err' : 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function openDepoGirisForm(giris, tedarikciler, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b class="mono">${giris.satinalmaSiparisKod}</b> — ${App.escapeHtml(giris.kalemAdi)} · Sipariş Miktarı: ${App.fmt(giris.siparisMiktari, 2)} ${giris.birim || ''}</div>
      <div class="fgroup"><label class="flbl">Tedarikçi (Cari Kart Kontrolü)</label>
        <select class="fselect" id="dg-tedarikci">
          ${tedarikciler.map(t => `<option value="${t.id}" ${giris.tedarikciId === t.id ? 'selected' : ''}>${App.escapeHtml(t.unvan)}</option>`).join('')}
        </select>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">İrsaliye No</label><input class="finput" id="dg-irsaliye"></div>
        <div class="fgroup"><label class="flbl">Fatura No</label><input class="finput" id="dg-fatura"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Fatura Üzerindeki Cari Ünvan</label><input class="finput" id="dg-fatura-cari" placeholder="Faturadaki tedarikçi ünvanı"></div>
        <div class="fgroup"><label class="flbl">Giriş Tarihi</label><input class="finput" id="dg-giristarihi" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Gelen Miktar</label><input class="finput" id="dg-gelenmiktar" type="number" step="0.01" value="${giris.siparisMiktari}"></div>
        <div class="fgroup"><label class="flbl">Depo Lokasyonu</label><input class="finput" id="dg-lokasyon" placeholder="örn. Raf A-12"></div>
      </div>
      <div class="fgroup"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="dg-aciklama"></textarea></div>
      <div class="hr"></div>
      <div class="fcheck"><input type="checkbox" id="dg-kalite-problemi"><label for="dg-kalite-problemi">⚠ Kalite problemi şüphesi var (Kalite Kontrol'e not olarak iletilir)</label></div>
      <div class="fgroup" id="dg-kalite-aciklama-wrap" style="display:none"><label class="flbl">Kalite Problemi Açıklaması</label><textarea class="ftextarea" id="dg-kalite-aciklama" placeholder="Fotoğraf/numune referansı da not edebilirsiniz"></textarea></div>
    `;
    const footer = `<button class="btn" id="dg-cancel">Vazgeç</button><button class="btn btn-green" id="dg-confirm">Depo Girişini Onayla</button>`;
    App.openModal({ title: 'Depo Girişi', body, footer, wide: true });
    document.getElementById('dg-cancel').onclick = App.closeModal;
    document.getElementById('dg-kalite-problemi').onchange = (e) => {
      document.getElementById('dg-kalite-aciklama-wrap').style.display = e.target.checked ? 'block' : 'none';
    };

    document.getElementById('dg-confirm').onclick = async () => {
      const tedarikciId = document.getElementById('dg-tedarikci').value;
      const ted = tedarikciler.find(t => t.id === tedarikciId);
      const faturaCari = document.getElementById('dg-fatura-cari').value.trim();
      const cariUyusmuyor = faturaCari && ted && !ted.unvan.toLowerCase().includes(faturaCari.toLowerCase()) && !faturaCari.toLowerCase().includes(ted.unvan.toLowerCase());

      if (cariUyusmuyor) {
        App.toast('⚠ Fatura cari kartı satınalma siparişi ile uyuşmuyor.', 'err');
        return;
      }

      const gelenMiktar = parseFloat(document.getElementById('dg-gelenmiktar').value) || 0;
      const kaliteProblemi = document.getElementById('dg-kalite-problemi').checked;
      const eksikMi = gelenMiktar < giris.siparisMiktari;
      const eksikMiktar = eksikMi ? giris.siparisMiktari - gelenMiktar : 0;

      const _irs = document.getElementById('dg-irsaliye').value.trim();
      const _fat = document.getElementById('dg-fatura').value.trim();
      if (!_irs && !_fat) {
        App.toast('İrsaliye veya fatura numarası olmadan depo girişi onaylanamaz.', 'err');
        return;
      }
      giris.tedarikciId = tedarikciId;
      giris.irsaliyeNo = _irs;
      giris.faturaNo = _fat;
      giris.faturaCariUnvan = faturaCari;
      giris.girisTarihi = document.getElementById('dg-giristarihi').value;
      giris.gelenMiktar = gelenMiktar;
      giris.lokasyon = document.getElementById('dg-lokasyon').value.trim();
      giris.aciklama = document.getElementById('dg-aciklama').value.trim();
      giris.eksikMiktar = eksikMiktar;
      giris.kaliteProblemiBildirildi = kaliteProblemi;
      if (kaliteProblemi) giris.kaliteAciklama = document.getElementById('dg-kalite-aciklama').value.trim();

      // Depo onayı artık stoğa DİREKT eklemez — tüm girişler (kalite problemi
      // bildirilsin ya da bildirilmesin) Kalite Kontrol onayını bekler. Stok,
      // sadece Kalite onayladıktan sonra eklenir.
      giris.durum = 'depo_onayladi_kalite_bekliyor';
      await App.persist(() => Store.depoGirisleri.upsert(giris));

      if (eksikMi) {
        App.toast(`Depo onayı verildi, Kalite onayına gönderildi (stok HENÜZ EKLENMEDİ). ⚠ Eksik teslimat: ${eksikMiktar} ${giris.birim} eksik geldi, Satınalma birimine bildirim gönderildi.`, 'err');
      } else {
        App.toast('⏳ Depo onayı verildi ama stok HENÜZ EKLENMEDİ — Kalite Kontrol onayladığında stoğa işlenecek: ' + giris.kalemAdi, 'ok');
      }
      App.closeModal();
      onSaved();
    };
  }

  function renderStokTab(hammaddeler, yarimamuller, urunler, stokRaf) {
    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Hammadde Deposu Çeşit</div><div class="kpi-val blue">${hammaddeler.length}</div></div>
      <div class="kpi"><div class="kpi-lbl">Üretim Ambarı Çeşit</div><div class="kpi-val purple">${yarimamuller.length}</div></div>
      <div class="kpi"><div class="kpi-lbl">Sevkiyat Deposu Çeşit</div><div class="kpi-val green">${urunler.length}</div></div>
    </div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">📦 Hammadde ve Hırdavat Deposu</div></div>
      <div class="fhint" style="margin-bottom:8px">Satınalma ile gelen tüm ürünler ilk olarak bu depoya giriş yapar. Miktar hücresine tıklayıp manuel düzenleyebilirsiniz. <b>Not:</b> Depo Girişi onaylandığında stok henüz eklenmez — Kalite Kontrol onayı gerekir (Depo Girişi sekmesine bakın).</div>
      <div class="tbl-wrap"><table class="dtable"><tr><th>Stok Kodu</th><th>Ad</th><th class="r">Miktar</th><th>Birim</th></tr>`;
    let eksiSayisi = 0;
    hammaddeler.forEach(h => {
      const miktar = App.stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', h.id);
      const eksiMi = miktar < 0;
      if (eksiMi) eksiSayisi++;
      html += `<tr style="${eksiMi ? 'background:var(--red-bg)' : ''}"><td class="mono" style="font-size:11px">${App.escapeHtml(h.stokKodu || '')}</td><td>${App.escapeHtml(h.ad)}</td>
        <td class="r"><input class="finput dp-stok-input" data-ambar="hammadde_deposu" data-tip="hammadde" data-id="${h.id}" data-birim="${App.escapeHtml(h.birim)}" type="number" step="0.01" value="${miktar}" style="width:100px;text-align:right;${eksiMi ? 'color:var(--red-text);font-weight:700' : ''}"></td>
        <td class="mono" style="font-size:11px">${App.escapeHtml(h.birim)}</td></tr>`;
    });
    html += `</table></div>`;
    if (eksiSayisi > 0) {
      html += `<div style="margin-top:10px;padding:10px;background:var(--red-bg);border-radius:6px;font-size:11.5px;color:var(--red-text)">⚠ ${eksiSayisi} hammaddenin stoğu EKSİ bakiyede. Bu, sistemde kayıtlı stoktan fazla sarf/sipariş edildiği anlamına gelir. Karşılığında Depo Girişi yapıp <b>Kalite Kontrol</b> ekranından onaylayarak bakiyeyi düzeltebilirsiniz, ya da miktar hücresine tıklayıp doğrudan düzeltebilirsiniz.</div>`;
    }
    html += `</div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">🏭 Üretim Ambarı</div></div>
      <div class="fhint" style="margin-bottom:8px">Üretime sevk edilen hammadde ve yarı mamuller bu ambarda takip edilir.</div>
      <div class="tbl-wrap"><table class="dtable"><tr><th>Kod</th><th>Ad</th><th class="r">Miktar</th></tr>`;
    yarimamuller.forEach(y => {
      const miktar = App.stokMiktarAmbar(stokRaf, 'uretim_ambari', 'yarimamul', y.id);
      const eksiMi = miktar < 0;
      html += `<tr style="${eksiMi ? 'background:var(--red-bg)' : ''}"><td class="mono">${App.escapeHtml(y.kod)}</td><td>${App.escapeHtml(y.ad)}</td>
        <td class="r"><input class="finput dp-stok-input" data-ambar="uretim_ambari" data-tip="yarimamul" data-id="${y.id}" data-birim="ADET" type="number" step="1" value="${miktar}" style="width:100px;text-align:right;${eksiMi ? 'color:var(--red-text);font-weight:700' : ''}"></td></tr>`;
    });
    html += `</table></div></div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">🚚 Sevkiyat Deposu</div></div>
      <div class="fhint" style="margin-bottom:8px">Üretimi tamamlanan bitmiş ürünler bu depoda tutulur, sevkiyatlar buradan gerçekleştirilir.</div>
      <div class="tbl-wrap"><table class="dtable"><tr><th>Kod</th><th>Ad</th><th class="r">Miktar</th></tr>`;
    urunler.forEach(u => {
      const miktar = App.stokMiktarAmbar(stokRaf, 'sevkiyat_deposu', 'urun', u.id);
      html += `<tr><td class="mono">${App.escapeHtml(u.kod)}</td><td>${App.escapeHtml(u.ad)}</td>
        <td class="r"><input class="finput dp-stok-input" data-ambar="sevkiyat_deposu" data-tip="urun" data-id="${u.id}" data-birim="ADET" type="number" min="0" step="1" value="${miktar}" style="width:100px;text-align:right"></td></tr>`;
    });
    html += `</table></div></div>`;
    return html;
  }

  function wireStokTab(hammaddeler, yarimamuller, urunler, stokRaf, render, main) {
    document.querySelectorAll('.dp-stok-input').forEach(inp => inp.onchange = async () => {
      const ambar = inp.dataset.ambar, tip = inp.dataset.tip, id = inp.dataset.id, birim = inp.dataset.birim;
      const yeniMiktar = parseFloat(inp.value) || 0;
      let refKod = '', refAd = '';
      if (tip === 'hammadde') { const h = hammaddeler.find(x => x.id === id); refKod = h ? h.stokKodu : ''; refAd = h ? h.ad : ''; }
      else if (tip === 'yarimamul') { const y = yarimamuller.find(x => x.id === id); refKod = y ? y.kod : ''; refAd = y ? y.ad : ''; }
      else { const u = urunler.find(x => x.id === id); refKod = u ? u.kod : ''; refAd = u ? u.ad : ''; }

      const eskiMiktar = App.stokMiktarAmbar(stokRaf, ambar, tip, id);
      const fark = yeniMiktar - eskiMiktar;
      const tumStok = await Store.stokRaf.all();
      App.stokMiktarGuncelle(tumStok, ambar, tip, id, refKod, refAd, birim, fark);
      await App.persist(() => Store.stokRaf.save(tumStok));

      if (fark !== 0) {
        const hareket = {
          id: App.uid('HRK'), tip: fark > 0 ? 'giris' : 'cikis', ambar, kalemAdi: refAd,
          miktar: Math.abs(fark), aciklama: 'Depo manuel stok girişi/düzenlemesi', tarih: new Date().toISOString().slice(0, 10)
        };
        await App.persist(() => Store.stokHareketleri.upsert(hareket));
      }
      App.toast('Stok güncellendi: ' + refAd, 'ok');
    });
  }

  // ── SİPARİŞ / HAMMADDE İHTİYACI KARŞILAMA (Hammadde Deposu'na göre) ───────
  function renderKarsilamaTab(hammaddeIhtiyaclari, hammaddeler, stokRaf, satinalmaTalepleri, satinalmaSiparisleri) {
    const tumKalemler = [];
    hammaddeIhtiyaclari.filter(p => p.durum === 'acik' || p.durum === 'onaylandi').forEach(parti => {
      parti.kalemler.forEach(k => tumKalemler.push({ ...k, partiId: parti.id, partiDurum: parti.durum }));
    });

    if (!tumKalemler.length) {
      return `<div class="card"><div class="empty-state" style="padding:28px 10px"><div class="eicon">▭</div><div class="etitle">Karşılaştırılacak hammadde ihtiyacı yok</div><div class="edesc">Bir sipariş onaylandığında veya Planlama manuel ekleme yaptığında burada görünür.</div></div></div>`;
    }

    const birlesik = new Map();
    tumKalemler.forEach(k => {
      const mevcut = birlesik.get(k.hammaddeId);
      if (mevcut) mevcut.miktar += k.miktar;
      else birlesik.set(k.hammaddeId, { hammaddeId: k.hammaddeId, miktar: k.miktar, birim: k.birim });
    });

    // Bu hammadde için "satınalma bekleyen" miktarı: henüz tamamlanmamış
    // satınalma talepleri + henüz depo girişi yapılmamış satınalma siparişleri.
    function satinalmaBekleyenMiktar(hammaddeId) {
      let toplam = 0;
      satinalmaTalepleri.filter(s => s.hammaddeId === hammaddeId && s.durum !== 'siparis_acildi').forEach(s => toplam += s.miktar || 0);
      satinalmaSiparisleri.filter(s => s.hammaddeId === hammaddeId && s.durum !== 'tamamlandi' && s.durum !== 'reddedildi').forEach(s => toplam += s.miktar || 0);
      return toplam;
    }

    let eksiSayisi = 0;
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Hammadde İhtiyacı — 3'lü Stok Görünümü</div></div>
      <div class="fhint" style="margin-bottom:8px">Her hammadde için: depo stoğu, satınalmada bekleyen miktar, üretimde kullanılacak (ihtiyaç) ve üretim sonrası depoda kalacak miktar bir arada gösterilir.</div>
      <table class="dtable"><tr><th>Hammadde</th><th class="r">Depo Stoğu</th><th class="r">Satınalma Bekleyen</th><th class="r">Üretimde Kullanılacak</th><th class="r">Üretim Sonrası Kalan</th><th>Durum</th></tr>`;
    birlesik.forEach(k => {
      const hm = hammaddeler.find(h => h.id === k.hammaddeId);
      const stokMiktar = App.stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', k.hammaddeId);
      const bekleyenSatinalma = satinalmaBekleyenMiktar(k.hammaddeId);
      const karsilama = stokMiktar - k.miktar;
      const karsilamaSatinalmaDahil = stokMiktar + bekleyenSatinalma - k.miktar;
      const eksiMi = karsilama < 0;
      if (eksiMi) eksiSayisi++;
      html += `<tr style="${eksiMi ? 'background:var(--red-bg)' : ''}">
        <td>${hm ? App.escapeHtml(hm.ad) : '⚠ Bulunamadı'}<br><span class="muted mono" style="font-size:10px">${hm ? App.escapeHtml(hm.stokKodu || '') : ''}</span></td>
        <td class="r">${App.fmt(stokMiktar, 1)} ${k.birim || ''}</td>
        <td class="r">${bekleyenSatinalma > 0 ? '<span class="pill pill-blue">' + App.fmt(bekleyenSatinalma, 1) + '</span>' : '—'}</td>
        <td class="r">${App.fmt(k.miktar, 1)} ${k.birim || ''}</td>
        <td class="r"><b style="color:${eksiMi ? 'var(--red-text)' : 'var(--green-text)'}">${karsilama >= 0 ? '+' : ''}${App.fmt(karsilama, 1)}</b>
          ${eksiMi && bekleyenSatinalma > 0 ? `<br><span class="muted" style="font-size:10px">Satınalma dahil: ${karsilamaSatinalmaDahil >= 0 ? '+' : ''}${App.fmt(karsilamaSatinalmaDahil, 1)}</span>` : ''}</td>
        <td>${eksiMi ? '<span class="pill pill-red">⚠ EKSİ — YETERSİZ STOK</span>' : '<span class="pill pill-green">Karşılanıyor</span>'}</td>
      </tr>`;
    });
    html += `</table></div>`;

    if (eksiSayisi > 0) {
      html = `<div class="card" style="background:var(--red-bg);border-color:var(--red-light)">
        <div style="font-size:12px;color:var(--red-text);font-weight:700">⚠ ${eksiSayisi} hammadde stoktan karşılanamıyor — eksi bakiyeye düşüyor. Satınalma talebi açmanız gerekebilir.</div>
      </div>` + html;
    }
    return html;
  }

  function wireKarsilamaTab() { /* salt görüntüleme, ek aksiyon yok */ }

  // ── KRİTİK STOK SEVİYELERİ (Hammadde Deposu'na göre) ──────────────────────
  // ── SARF ANALİZİ ─────────────────────────────────────────────────────────
  // Bir hammaddenin son N gündeki depo çıkışını (sarfını) toplar.
  // Eşleştirme: önce hammaddeId, yoksa kalem ADI (üretim sarf kayıtları ad
  // taşıyor, id taşımıyor — bu yüzden iki kademeli eşleşme şart).
  // Sarf indeksi: TÜM hareketleri TEK geçişte tarayıp hammadde bazında
  // 30/60/120/180 günlük toplamları çıkarır.
  // ÖNEMLİ: Eskiden her hammadde için 4 kez tüm hareket listesi taranıyordu
  // (200 hammadde × 4 × 20.000 hareket = ~16 milyon adım) — telefonda sayfa
  // kilitleniyordu. Tek geçiş bunu hareket sayısı kadar adıma indirir.
  function sarfIndeksiKur(hareketler) {
    const bugun = Date.now();
    const s30 = new Date(bugun - 30 * 86400000).toISOString().slice(0, 10);
    const s60 = new Date(bugun - 60 * 86400000).toISOString().slice(0, 10);
    const s120 = new Date(bugun - 120 * 86400000).toISOString().slice(0, 10);
    const s180 = new Date(bugun - 180 * 86400000).toISOString().slice(0, 10);
    const idx = new Map();
    const al = (anahtar) => {
      let v = idx.get(anahtar);
      if (!v) { v = { g30: 0, g60: 0, g120: 0, g180: 0 }; idx.set(anahtar, v); }
      return v;
    };
    for (const k of (hareketler || [])) {
      if (k.tip !== 'cikis') continue;
      if (k.ambar && k.ambar !== 'hammadde_deposu') continue;
      const tarih = k.tarih || '';
      if (tarih < s180) continue;                    // 180 günden eski: hiç ilgilenme
      const miktar = +k.miktar || 0;
      if (!miktar) continue;
      // Hareket hammaddeId taşıyorsa id ile, taşımıyorsa AD ile eşleşir
      const anahtar = k.hammaddeId
        ? 'id:' + k.hammaddeId
        : 'ad:' + (k.kalemAdi || '').trim().toLocaleLowerCase('tr');
      const v = al(anahtar);
      v.g180 += miktar;
      if (tarih >= s120) v.g120 += miktar;
      if (tarih >= s60) v.g60 += miktar;
      if (tarih >= s30) v.g30 += miktar;
    }
    return idx;
  }

  // Bir hammaddenin sarfını indeksten okur (id + ad kayıtlarını birleştirir).
  function sarfAl(idx, h) {
    const a = idx.get('id:' + h.id);
    const b = idx.get('ad:' + (h.ad || '').trim().toLocaleLowerCase('tr'));
    if (!a && !b) return { g30: 0, g60: 0, g120: 0, g180: 0 };
    return {
      g30: ((a && a.g30) || 0) + ((b && b.g30) || 0),
      g60: ((a && a.g60) || 0) + ((b && b.g60) || 0),
      g120: ((a && a.g120) || 0) + ((b && b.g120) || 0),
      g180: ((a && a.g180) || 0) + ((b && b.g180) || 0)
    };
  }

  // Önerilen kritik seviye = günlük ortalama sarf × (tedarik süresi + emniyet payı)
  // Günlük ortalama: kısa dönem daha güncel olduğu için AĞIRLIKLI ortalama
  // (30g ×3, 60g ×2, 120g ×1.5, 180g ×1). Veri yoksa öneri üretilmez.
  function oneriHesapla(sarflar, h) {
    const oranlar = [
      { gun: 30, sarf: sarflar.g30, agirlik: 3 },
      { gun: 60, sarf: sarflar.g60, agirlik: 2 },
      { gun: 120, sarf: sarflar.g120, agirlik: 1.5 },
      { gun: 180, sarf: sarflar.g180, agirlik: 1 }
    ].filter(o => o.sarf > 0);
    if (!oranlar.length) return null;
    let pay = 0, payda = 0;
    oranlar.forEach(o => { pay += (o.sarf / o.gun) * o.agirlik; payda += o.agirlik; });
    const gunlukOrt = pay / payda;
    const tedarikGun = (+h.tedarikSuresi || 14);
    const emniyetPayi = 7;   // tedarik gecikmesine karşı tampon (gün)
    return { gunlukOrt, oneri: gunlukOrt * (tedarikGun + emniyetPayi), tedarikGun };
  }

  let _topluAdaylar = [];   // toplu talep adayları (render → wire aktarımı)

  function renderKritikStokTab(hammaddeler, stokRaf, kritikStokSeviyeleri, stokHareketleri, satinalmaTalepleri) {
    const talepler = satinalmaTalepleri || [];
    // Bir hammadde için AÇIK (kapanmamış) satınalma talebi var mı?
    const acikTalep = (hid) => talepler.filter(t => t.hammaddeId === hid &&
      !['tamamlandi', 'iptal', 'reddedildi', 'kapatildi'].includes(t.durum));
    const hareketler = stokHareketleri || [];
    const veriVar = hareketler.some(k => k.tip === 'cikis');
    const _sarfIdx = sarfIndeksiKur(hareketler);   // TEK geçiş (performans)
    // Toplu talep adayları: kritik altında + henüz açık talebi olmayan
    const adaylar = [];
    hammaddeler.forEach(h => {
      const st = App.stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', h.id);
      const kr = kritikStokSeviyeleri.find(k => k.hammaddeId === h.id);
      if (!kr || kr.miktar == null || st >= kr.miktar) return;
      if (acikTalep(h.id).length) return;                      // zaten talep var
      const eksik = kr.miktar - st;
      const yuvarli = Math.ceil(eksik / 100) * 100;            // bir üst 100'e yuvarla
      adaylar.push({ h, eksik, miktar: yuvarli });
    });

    let html = `<div class="card">
      <div class="card-hdr">
        <div class="card-title">Kritik Stok Seviyeleri — Sarf Analizi (Hammadde Deposu)</div>
        ${adaylar.length ? `<button class="btn btn-amber" id="dp-toplu-talep">⚡ Toplu Talep Aç ve Gönder (${adaylar.length} kalem)</button>` : ''}
      </div>
      <div class="fhint" style="margin-bottom:8px">
        Son <b>30 / 60 / 120 / 180 günlük</b> gerçek sarf gösterilir. <b>Önerilen seviye</b>, ağırlıklı günlük
        ortalama sarf × (tedarik süresi + 7 gün emniyet payı) ile hesaplanır — yakın dönem sarfa daha çok ağırlık verilir.
        Öneri bir <b>tahmindir</b>; kritik seviyeyi dilediğiniz gibi <b>elle</b> girebilir veya "Uygula" ile öneriyi kabul edebilirsiniz.
        ${veriVar ? '' : '<br><span style="color:var(--amber-text)">Henüz depo çıkış (sarf) hareketi birikmemiş — sarf gerçekleştikçe öneriler oluşacak.</span>'}
      </div>
      <table class="dtable"><tr>
        <th>Stok Kodu</th><th>Hammadde</th><th class="r">Mevcut</th>
        <th class="r">30g</th><th class="r">60g</th><th class="r">120g</th><th class="r">180g</th>
        <th class="r">Günlük Ort.</th><th class="r">Öneri</th>
        <th class="r">Kritik Seviye</th><th>Durum</th><th>Açık Talep</th><th></th></tr>`;
    let altinaDusen = 0;
    hammaddeler.forEach(h => {
      const stokMiktar = App.stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', h.id);
      const kritik = kritikStokSeviyeleri.find(k => k.hammaddeId === h.id);
      const kritikMiktar = kritik ? kritik.miktar : null;
      const altinda = kritikMiktar != null && stokMiktar < kritikMiktar;
      if (altinda) altinaDusen++;

      const sarflar = sarfAl(_sarfIdx, h);
      const o = oneriHesapla(sarflar, h);
      const yontemRozet = kritik && kritik.belirlemeYontemi === 'oneri'
        ? '<span class="pill pill-blue" style="font-size:8.5px">öneriden</span>'
        : (kritikMiktar != null ? '<span class="pill pill-gray" style="font-size:8.5px">elle</span>' : '');

      html += `<tr style="${altinda ? 'background:var(--red-bg)' : ''}">
        <td class="mono" style="font-size:11px">${App.escapeHtml(h.stokKodu || '')}</td>
        <td>${App.escapeHtml(h.ad)}</td>
        <td class="r">${App.fmt(stokMiktar, 1)} ${App.escapeHtml(h.birim)}</td>
        <td class="r" style="font-size:11px">${sarflar.g30 ? App.fmt(sarflar.g30, 1) : '—'}</td>
        <td class="r" style="font-size:11px">${sarflar.g60 ? App.fmt(sarflar.g60, 1) : '—'}</td>
        <td class="r" style="font-size:11px">${sarflar.g120 ? App.fmt(sarflar.g120, 1) : '—'}</td>
        <td class="r" style="font-size:11px">${sarflar.g180 ? App.fmt(sarflar.g180, 1) : '—'}</td>
        <td class="r" style="font-size:11px">${o ? App.fmt(o.gunlukOrt, 2) : '—'}</td>
        <td class="r" style="font-size:11px">${o ? `<b>${App.fmt(o.oneri, 1)}</b><br><button class="btn btn-sm dp-oneri-uygula" data-id="${h.id}" data-oneri="${o.oneri.toFixed(2)}" style="font-size:9.5px;padding:2px 6px" title="Tedarik süresi ${o.tedarikGun} gün + 7 gün emniyet payı">Uygula</button>` : '—'}</td>
        <td class="r"><input class="finput dp-kritik-input" data-id="${h.id}" type="number" min="0" step="0.01" value="${kritikMiktar ?? ''}" placeholder="Belirlenmedi" style="width:90px;text-align:right"> ${yontemRozet}</td>
        <td>${altinda ? '<span class="pill pill-red">⚠ KRİTİK ALTINDA</span>' : (kritikMiktar != null ? '<span class="pill pill-green">Yeterli</span>' : '<span class="pill pill-gray">Tanımsız</span>')}</td>
        <td style="font-size:11px">${(() => {
          const ac = acikTalep(h.id);
          if (!ac.length) return '<span class="muted">—</span>';
          return ac.map(t => `<div><span class="pill pill-blue" style="font-size:8.5px">${App.escapeHtml(t.kod || t.id)}</span> ${App.fmt(t.miktar, 1)} ${App.escapeHtml(t.birim || '')}<br><span class="muted" style="font-size:9.5px">${App.escapeHtml(t.durum || '')} · ${App.escapeHtml(t.tarih || '')}</span></div>`).join('');
        })()}</td>
        <td>${altinda ? `<button class="btn btn-sm btn-amber dp-talep-ac" data-id="${h.id}">Talep Aç</button>${acikTalep(h.id).length ? '<div class="muted" style="font-size:9.5px">açık talep var</div>' : ''}` : ''}</td>
      </tr>`;
    });
    html += `</table></div>`;
    _topluAdaylar = adaylar;   // wire aşamasında kullanılır
    if (altinaDusen > 0) {
      html = `<div class="card" style="background:var(--red-bg);border-color:var(--red-light)">
        <div style="font-size:12px;color:var(--red-text);font-weight:700">⚠ ${altinaDusen} hammadde kritik stok seviyesinin altında.</div>
      </div>` + html;
    }
    return html;
  }

  function wireKritikStokTab(hammaddeler, stokRaf, kritikStokSeviyeleri, render, main) {
    document.querySelectorAll('.dp-kritik-input').forEach(inp => inp.onchange = async () => {
      const id = inp.dataset.id;
      const miktar = parseFloat(inp.value);
      let kritikler = await Store.kritikStokSeviyeleri.all();
      let kayit = kritikler.find(k => k.hammaddeId === id);
      if (!miktar && miktar !== 0) {
        if (kayit) { kritikler = kritikler.filter(k => k.hammaddeId !== id); await App.persist(() => Store.kritikStokSeviyeleri.save(kritikler)); App.toast('Kritik seviye tanımı kaldırıldı', 'ok'); render(main); }
        return;
      }
      if (kayit) { kayit.miktar = miktar; kayit.belirlemeYontemi = 'manuel'; }
      else { kayit = { id: App.uid('KRT'), hammaddeId: id, miktar, belirlemeYontemi: 'manuel', tarih: new Date().toISOString().slice(0, 10) }; kritikler.push(kayit); }
      await App.persist(() => Store.kritikStokSeviyeleri.save(kritikler));
      App.toast('Kritik stok seviyesi kaydedildi', 'ok');
      render(main);
    });
    // ── TOPLU TALEP: kritik altındaki tüm kalemler için tek seferde ────────
    const topluBtn = document.getElementById('dp-toplu-talep');
    if (topluBtn) topluBtn.onclick = async () => {
      const adaylar = _topluAdaylar || [];
      if (!adaylar.length) { App.toast('Talep açılacak kalem yok.', 'err'); return; }
      const ozet = adaylar.slice(0, 12).map(a =>
        `• ${App.escapeHtml(a.h.ad)} — eksik ${App.fmt(a.eksik, 1)} → talep <b>${App.fmt(a.miktar, 0)}</b> ${App.escapeHtml(a.h.birim || '')}`
      ).join('<br>') + (adaylar.length > 12 ? `<br>… ve ${adaylar.length - 12} kalem daha` : '');

      App.openModal({
        title: '⚡ Toplu Satınalma Talebi',
        sub: adaylar.length + ' kalem için talep açılacak',
        body: `<div style="font-size:12px;color:var(--muted);margin-bottom:8px">
            Miktar = (kritik seviye − mevcut stok), <b>bir üst 100'e yuvarlanır</b>.
            Zaten açık talebi olan kalemler atlanır. Talepler <b>onaylı</b> olarak satınalmaya gönderilir.
          </div>
          <div style="max-height:260px;overflow:auto;font-size:11.5px;line-height:1.7;border:1px solid var(--border);border-radius:8px;padding:8px">${ozet}</div>
          <div style="margin-top:8px">
            <label class="flbl">Onaylayan Birim</label>
            <select class="fselect" id="dp-toplu-onaylayan" style="width:100%">
              <option value="depo">Depo</option>
              <option value="uretim_planlama">Üretim Planlama</option>
            </select>
          </div>`,
        footer: '<button class="btn" id="dp-toplu-vaz">Vazgeç</button><button class="btn btn-green" id="dp-toplu-onay">Onayla ve Gönder</button>'
      });

      document.getElementById('dp-toplu-vaz').onclick = App.closeModal;
      document.getElementById('dp-toplu-onay').onclick = async () => {
        try {
          const onaylayan = document.getElementById('dp-toplu-onaylayan').value;
          const mevcut = await Store.satinalmaTalepleri.all();
          const bugun = new Date().toISOString().slice(0, 10);
          let sayac = 0;
          for (const a of adaylar) {
            // Aynı anda ikinci kez basılmaya karşı: açık talebi oluştuysa atla
            const zaten = mevcut.some(t => t.hammaddeId === a.h.id &&
              !['tamamlandi', 'iptal', 'reddedildi', 'kapatildi'].includes(t.durum));
            if (zaten) continue;
            mevcut.push({
              id: App.uid('SAT'),
              kod: 'SAT-' + Date.now().toString(36).toUpperCase() + '-' + (sayac + 1),
              kaynakTalepId: null, kaynakKritikStok: true, topluTalep: true,
              kalemAdi: a.h.ad, hammaddeId: a.h.id, miktar: a.miktar, birim: a.h.birim,
              tedarikciId: a.h.varsayilanTedarikciId || null,
              tedarikciAdi: a.h.varsayilanTedarikciAdi || null,
              not: `Toplu talep: kritik seviye altında (eksik ${App.fmt(a.eksik, 1)}), 100'e yuvarlanarak ${a.onaylayanAd || ''}${onaylayan === 'depo' ? 'Depo' : 'Üretim Planlama'} onayıyla açıldı.`,
              durum: 'teklif_bekleniyor',
              onaylayanBirim: onaylayan,
              tarih: bugun
            });
            sayac++;
          }
          await App.persist(() => Store.satinalmaTalepleri.save(mevcut));
          App.closeModal();
          App.toast(sayac + ' satınalma talebi oluşturuldu ve satınalmaya gönderildi.', 'ok');
          render(main);
        } catch (e) {
          App.toast('Toplu talep oluşturulamadı: ' + (e && e.message ? e.message : e), 'err');
        }
      };
    };

    // Öneriyi kritik seviye olarak uygula (yöntem: 'oneri' olarak işaretlenir)
    document.querySelectorAll('.dp-oneri-uygula').forEach(b => b.onclick = async () => {
      try {
        const id = b.dataset.id;
        const miktar = Math.round(parseFloat(b.dataset.oneri) * 100) / 100;
        let kritikler = await Store.kritikStokSeviyeleri.all();
        let kayit = kritikler.find(k => k.hammaddeId === id);
        if (kayit) { kayit.miktar = miktar; kayit.belirlemeYontemi = 'oneri'; kayit.tarih = new Date().toISOString().slice(0, 10); }
        else { kritikler.push({ id: App.uid('KRT'), hammaddeId: id, miktar, belirlemeYontemi: 'oneri', tarih: new Date().toISOString().slice(0, 10) }); }
        await App.persist(() => Store.kritikStokSeviyeleri.save(kritikler));
        App.toast('Önerilen kritik seviye uygulandı: ' + App.fmt(miktar, 2), 'ok');
        render(main);
      } catch (e) { App.toast('Uygulanamadı: ' + (e && e.message ? e.message : e), 'err'); }
    });

    document.querySelectorAll('.dp-talep-ac').forEach(b => b.onclick = () => {
      const hm = hammaddeler.find(h => h.id === b.dataset.id);
      const _kr = kritikStokSeviyeleri.find(k => k.hammaddeId === b.dataset.id);
      openKritikTalepForm(hm, () => render(main), _kr ? _kr.miktar : null);
    });
  }

  function openKritikTalepForm(hammadde, onSaved, kritikMiktar) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b>${App.escapeHtml(hammadde.ad)}</b> kritik stok seviyesinin altında. Satınalmaya talep açmak için miktar girin.</div>
      <div class="fgroup"><label class="flbl">Talep Edilecek Miktar</label><input class="finput" id="kt-miktar" type="number" min="0.01" step="0.01" value="${kritikMiktar != null ? kritikMiktar : 100}"></div>
      <div class="fgroup"><label class="flbl">Onaylayan</label>
        <select class="fselect" id="kt-onaylayan">
          <option value="depo">Depo</option>
          <option value="planlama">Üretim Planlama</option>
        </select>
      </div>
    `;
    const footer = `<button class="btn" id="kt-cancel">Vazgeç</button><button class="btn btn-amber" id="kt-confirm">Satınalmaya Talep Aç</button>`;
    App.openModal({ title: 'Kritik Stok — Satınalma Talebi', body, footer });
    document.getElementById('kt-cancel').onclick = App.closeModal;
    document.getElementById('kt-confirm').onclick = async () => {
      const miktar = parseFloat(document.getElementById('kt-miktar').value) || (kritikMiktar != null ? kritikMiktar : 100);
      const onaylayan = document.getElementById('kt-onaylayan').value;
      const satinalmaTalepleri = await Store.satinalmaTalepleri.all();
      const talep = {
        id: App.uid('SAT'),
        kod: 'SAT-' + Date.now().toString(36).toUpperCase(),
        kaynakTalepId: null, kaynakKritikStok: true,
        kalemAdi: hammadde.ad, hammaddeId: hammadde.id, miktar,
        birim: hammadde.birim,
        tedarikciId: null, tedarikciAdi: null,
        not: `Kritik stok seviyesi altına düştüğü için ${onaylayan === 'depo' ? 'Depo' : 'Üretim Planlama'} onayıyla otomatik talep açıldı.`,
        durum: 'teklif_bekleniyor',
        tarih: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.satinalmaTalepleri.upsert(talep));
      App.toast('Satınalma talebi oluşturuldu: ' + talep.kod, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // ── MALZEME DÜŞÜMÜ — Üretim talepleri Hammadde Deposu'ndan Üretim Ambarı'na ──
  function renderDusumTab(talepler) {
    const bekleyen = talepler.filter(t => t.durum === 'beklemede');
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Üretimden Gelen Malzeme Talepleri</div></div>
      <div class="fhint" style="margin-bottom:8px">Onaylandığında malzeme Hammadde Deposu'ndan düşer, Üretim Ambarı'na eklenir (otomatik ambar transferi).</div>`;
    if (!bekleyen.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Bekleyen talep yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Talep Kodu</th><th>Kalem</th><th class="r">Talep Edilen</th><th>Tarih</th><th></th></tr>`;
      bekleyen.forEach(t => {
        html += `<tr><td class="mono">${t.kod}</td><td>${App.escapeHtml(t.kalemAdi)}</td><td class="r">${App.fmt(t.miktar, 0)} ${t.birim || ''}</td>
          <td style="font-size:11px">${t.tarih}</td>
          <td><button class="btn btn-sm btn-green dp-dusum" data-id="${t.id}">Hammadde Deposu'ndan Düş & Üretim Ambarı'na Aktar</button></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireDusumTab(talepler, stokRaf, render, main) {
    main.querySelectorAll('.dp-dusum').forEach(b => b.onclick = async () => {
      const t = talepler.find(x => x.id === b.dataset.id);
      const tumStok = await Store.stokRaf.all();
      const mevcut = App.stokMiktarAmbar(tumStok, 'hammadde_deposu', 'yarimamul', t.kalemRefId) || App.stokMiktarAmbar(tumStok, 'hammadde_deposu', 'hammadde', t.kalemRefId);
      if (mevcut < t.miktar) {
        App.toast(`Uyarı: Hammadde Deposu'nda sadece ${mevcut} adet var, talep ${t.miktar}. Eksik kalan satınalma talebine yönlendirilebilir.`, 'err');
      }
      // Hammadde Deposu -> Üretim Ambarı transferi (yarımamül stok talebi senaryosu)
      App.stokTransferEt(tumStok, 'hammadde_deposu', 'uretim_ambari', 'yarimamul', t.kalemRefId, '', t.kalemAdi, t.birim || 'ADET', t.miktar);
      await App.persist(() => Store.stokRaf.save(tumStok));

      t.durum = 'karsilandi';
      await App.persist(() => Store.talepler.upsert(t));

      const transfer = {
        id: App.uid('TRF'), kaynakAmbar: 'hammadde_deposu', hedefAmbar: 'uretim_ambari',
        kalemAdi: t.kalemAdi, miktar: t.miktar, aciklama: 'Üretim talebi karşılandı: ' + t.kod,
        tarih: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.ambarTransferleri.upsert(transfer));
      const hareket = {
        id: App.uid('HRK'), tip: 'cikis', ambar: 'hammadde_deposu', kalemAdi: t.kalemAdi, miktar: t.miktar,
        aciklama: 'Üretim talebi karşılandı (Üretim Ambarı\'na aktarıldı): ' + t.kod, tarih: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.stokHareketleri.upsert(hareket));
      App.toast('Hammadde Deposu\'ndan düşüldü, Üretim Ambarı\'na aktarıldı', 'ok');
      render(main);
    });
  }

  function renderHareketTab(stokHareketleri) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Ambar Hareket Geçmişi</div></div>`;
    if (!stokHareketleri.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz stok hareketi kaydedilmedi.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tip</th><th>Ambar</th><th>Kalem</th><th class="r">Miktar</th><th>Açıklama</th><th>Tarih</th></tr>`;
      [...stokHareketleri].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(h => {
        const ambarLabel = (App.AMBARLAR.find(a => a.id === h.ambar) || {}).label || h.ambar || '—';
        html += `<tr><td><span class="pill ${h.tip === 'giris' ? 'pill-green' : 'pill-red'}">${h.tip === 'giris' ? 'Giriş' : 'Çıkış'}</span></td>
          <td style="font-size:11px">${App.escapeHtml(ambarLabel)}</td>
          <td>${App.escapeHtml(h.kalemAdi)}</td><td class="r">${App.fmt(h.miktar, 0)}</td>
          <td style="font-size:11.5px">${App.escapeHtml(h.aciklama || '')}</td><td style="font-size:11px">${h.tarih}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  return { render, openKritikTalepForm };
})();
