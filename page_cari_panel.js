// ════════════════════════════════════════════════════════════════════════════
// CARİ İŞLEMLER — müşteri kartları, ödeme vade, gecikmiş alacaklar, ihracat
// teşvik işlemleri, sipariş onayı
// ════════════════════════════════════════════════════════════════════════════
PageModules.cari_panel = (() => {
  let activeTab = 'musteriler';
  let detayMusteriId = null;

  // Bir satınalma siparişinin tedarikçiye GERÇEK bir borç/taahhüt sayılması
  // için en az onaylanmış olması gerekir — 'yonetim_onayi_bekliyor' (henüz
  // gönderilmedi) ve 'birime_dondu' (yönetim reddetti, düzenleme bekliyor)
  // bir borç DEĞİLDİR, yalnızca 'reddedildi'yi hariç tutmak yetersizdi.
  const SATINALMA_BORC_DURUMLARI = ['onaylandi', 'gonderildi', 'tamamlandi'];

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const [musteriler, siparisler, tedarikciler, irsaliyeler, faturalar, stokRaf, urunler, tahsilatBeklenenler, satinalmaSiparisleri, tedarikciOdemeleri] = await Promise.all([
      Store.musteriler.all(), Store.siparisler.all(), Store.tedarikciler.all(),
      Store.irsaliyeler.all(), Store.faturalar.all(), Store.stokRaf.all(), Store.urunler.all(), Store.tahsilatBeklenenler.all(),
      Store.satinalmaSiparisleri.all(), Store.tedarikciOdemeleri.all()
    ]);

    // Her tedarikçinin net borç bakiyesi: GERÇEK BİR TAAHHÜDE dönüşmüş
    // (onaylanmış/gönderilmiş/tamamlanmış) satınalma siparişlerinin toplamı
    // - tüm tedarikçi ödemelerinin toplamı. Pozitifse FİRMA bu tedarikçiye
    // borçludur ("Ödeme Yap" butonu gösterilir).
    const tedarikciBakiyeleri = new Map();
    tedarikciler.forEach(t => {
      const borc = satinalmaSiparisleri.filter(s => s.tedarikciId === t.id && SATINALMA_BORC_DURUMLARI.includes(s.durum)).reduce((a, s) => a + (s.toplamTRY || 0), 0);
      const odenen = tedarikciOdemeleri.filter(o => o.tedarikciId === t.id).reduce((a, o) => a + (o.tutar || 0), 0);
      tedarikciBakiyeleri.set(t.id, borc - odenen);
    });

    if (detayMusteriId) {
      const m = musteriler.find(x => x.id === detayMusteriId);
      if (m) { renderMusteriDetay(main, m, siparisler); return; }
      detayMusteriId = null;
    }

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Cari Kartları</div><div class="page-sub">Müşteri ve tedarikçi bilgileri, ödeme vadesi, gecikmiş alacaklar, ihracat teşvik takibi, sipariş onayları ve fatura/irsaliye</div></div>
        <div class="page-acts">
          ${activeTab === 'musteriler' ? '<button class="btn btn-blue" id="cp-new-musteri">+ Yeni Müşteri</button>' : ''}
          ${activeTab === 'tedarikciler' ? '<button class="btn btn-blue" id="cp-new-tedarikci">+ Yeni Tedarikçi</button>' : ''}
        </div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'musteriler' ? 'active' : ''}" data-tab="musteriler">Müşteriler</div>
        <div class="tab ${activeTab === 'tedarikciler' ? 'active' : ''}" data-tab="tedarikciler">Tedarikçiler</div>
        <div class="tab ${activeTab === 'onay' ? 'active' : ''}" data-tab="onay">Sipariş Onayları</div>
        <div class="tab ${activeTab === 'fatura_irsaliye' ? 'active' : ''}" data-tab="fatura_irsaliye">Fatura & İrsaliye</div>
        <div class="tab ${activeTab === 'gecikme' ? 'active' : ''}" data-tab="gecikme">Gecikmiş Alacaklar</div>
        <div class="tab ${activeTab === 'mutabakat' ? 'active' : ''}" data-tab="mutabakat">Mütabakat</div>
      </div>
      <div id="cp-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });
    const newBtn = document.getElementById('cp-new-musteri');
    if (newBtn) newBtn.onclick = () => openMusteriForm(null, () => render(main));
    const newTedBtn = document.getElementById('cp-new-tedarikci');
    if (newTedBtn) newTedBtn.onclick = () => openTedarikciForm(null, () => render(main));

    const content = document.getElementById('cp-tab-content');
    if (activeTab === 'musteriler') { content.innerHTML = renderMusteriTab(musteriler); wireMusteriTab(musteriler, main); }
    else if (activeTab === 'tedarikciler') { content.innerHTML = renderTedarikciTab(tedarikciler, tedarikciBakiyeleri); wireTedarikciTab(tedarikciler, render, main); }
    else if (activeTab === 'onay') { content.innerHTML = renderOnayTab(siparisler, musteriler); wireOnayTab(siparisler, musteriler, render, main); }
    else if (activeTab === 'fatura_irsaliye') { content.innerHTML = renderFaturaIrsaliyeTab(siparisler, irsaliyeler, faturalar, stokRaf, urunler); wireFaturaIrsaliyeTab(siparisler, render, main); }
    else if (activeTab === 'mutabakat') { content.innerHTML = renderMutabakatTab(musteriler, tedarikciler); await wireMutabakatTab(musteriler, tedarikciler, main); }
    else { content.innerHTML = renderGecikmeTab(musteriler, siparisler, tahsilatBeklenenler); }
  }

  // ── FATURA & İRSALİYE — Sevkiyat Deposu'nda hazır (kalite onaylı, üretimi
  // tamamlanmış) ürünlerin faturası ve irsaliyesi BU EKRANDAN kesilir. İrsaliye
  // kesildiğinde otomatik stok düşümü ve KDV'li fatura oluşumu (kalem bazlı
  // KDV oranlarına göre ayrı alt toplamlarla) gerçekleşir.
  function renderFaturaIrsaliyeTab(siparisler, irsaliyeler, faturalar, stokRaf, urunler) {
    // T4: 's.durum === "uretimde"' KALDIRILDI — siparis.durum bu değeri
    // hiçbir zaman almaz (üretim ilerlemesi ayrı bir alan olan
    // s.uretimDurumu ile takip edilir); ölü kod (her zaman false).
    const faturaKesilebilir = siparisler.filter(s => s.durum === 'onaylandi' && s.uretimDurumu === 'tamamlandi' && !irsaliyeler.some(i => i.siparisId === s.id));
    // Sevkiyatın kestiği, Cari'nin fiyat kontrolü yapıp faturalayacağı irsaliyeler
    const faturaBekleyenIrsaliyeler = irsaliyeler.filter(i => i.faturaDurumu === 'cari_bekliyor');

    let html = '';
    if (faturaBekleyenIrsaliyeler.length) {
      html += `<div class="card" style="border:1.5px solid var(--amber);background:var(--amber-bg)">
        <div class="card-hdr"><div class="card-title" style="color:var(--amber-text)">💰 Fiyat Kontrolü Bekleyen İrsaliyeler — ${faturaBekleyenIrsaliyeler.length}</div></div>
        <div class="fhint" style="margin-bottom:8px">Sevkiyat bu irsaliyeleri kesti. Kalem fiyatlarını kontrol edin, gerekirse düzenleyin ve faturalayın.</div>
        <table class="dtable"><tr><th>İrsaliye No</th><th>Sipariş</th><th>Müşteri</th><th>Sevk Tarihi</th><th class="r">Kalem</th><th></th></tr>`;
      faturaBekleyenIrsaliyeler.forEach(i => {
        html += `<tr><td class="mono">${i.irsaliyeNo}</td><td class="mono">${App.escapeHtml(i.siparisKodu || '—')}</td>
          <td>${App.escapeHtml(i.musteriAdi)}</td><td style="font-size:11px">${i.tarih}</td>
          <td class="r">${(i.kalemler || []).length}</td>
          <td><button class="btn btn-sm btn-amber cp-irsaliye-faturala" data-id="${i.id}">Fiyatları Kontrol Et & Faturala</button></td></tr>`;
      });
      html += `</table></div>`;
    }

    html += `<div class="card">
      <div class="card-hdr"><div class="card-title">Sevkiyat Deposu'nda Hazır — Fatura/İrsaliye Kesilebilecek Siparişler</div></div>
      <div class="fhint" style="margin-bottom:8px">Bu siparişlerin ürünleri Sevkiyat Deposu'nda hazır ve kalite onaylı. İrsaliye kesildiğinde stoktan otomatik düşülür ve KDV'li fatura (kalem bazlı oranlara göre) otomatik oluşur.</div>`;
    if (!faturaKesilebilir.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Fatura/irsaliye kesilebilecek hazır sipariş yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Sipariş</th><th>Müşteri</th><th class="r">Kalem</th><th class="r">Toplam (KDV Hariç)</th><th></th></tr>`;
      faturaKesilebilir.forEach(s => {
        const stokYeterliMi = (s.kalemler || []).filter(k => k.grup === 'urun').every(k => {
          const u = urunler.find(x => x.kod === k.kod);
          if (!u) return false;
          const stok = stokRaf.find(x => x.ambar === 'sevkiyat_deposu' && x.tip === 'urun' && x.refId === u.id);
          return stok && stok.miktar >= (k.miktar || 1);
        });
        html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi)}</td>
          <td class="r">${(s.kalemler || []).length}</td><td class="r">${App.fmtTL(s.toplam)}</td>
          <td>${stokYeterliMi
            ? `<button class="btn btn-sm btn-blue cp-fatura-irsaliye-kes" data-id="${s.id}">Fatura & İrsaliye Kes</button>`
            : `<span class="pill pill-red">⚠ Stok Yetersiz</span>`}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Kesilen İrsaliyeler</div></div>`;
    if (!irsaliyeler.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz irsaliye kesilmedi.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>İrsaliye No</th><th>Sipariş</th><th>Müşteri</th><th>Tarih</th><th>Araç/Plaka</th></tr>`;
      [...irsaliyeler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(i => {
        html += `<tr><td class="mono">${i.irsaliyeNo}</td><td class="mono">${i.siparisKodu}</td><td>${App.escapeHtml(i.musteriAdi)}</td>
          <td style="font-size:11px">${i.tarih}</td><td>${App.escapeHtml(i.aracPlaka || '—')}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Kesilen Faturalar (KDV Detaylı)</div></div>`;
    if (!faturalar.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz fatura kesilmedi.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Fatura No</th><th>Müşteri</th><th class="r">KDV Hariç</th><th>KDV Detayı</th><th class="r">Genel Toplam</th><th class="r">Peşinat Mahsup</th><th class="r">Ödenecek Bakiye</th></tr>`;
      [...faturalar].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(f => {
        const kdvDetayMetni = (f.kdvDetaylari || []).length > 1
          ? f.kdvDetaylari.map(d => `%${d.oran}: ${App.fmtTL(d.kdvTutari)}`).join(', ')
          : (f.kdvOrani != null ? '%' + f.kdvOrani + ': ' + App.fmtTL(f.kdvTutari) : App.fmtTL(f.kdvTutari));
        html += `<tr><td class="mono">${f.faturaNo}</td><td>${App.escapeHtml(f.musteriAdi)}</td>
          <td class="r">${App.fmtTL(f.matrah)}</td><td style="font-size:11px">${kdvDetayMetni}</td>
          <td class="r"><b>${App.fmtTL(f.genelToplam)}</b></td>
          <td class="r">${f.pesinatMahsup > 0 ? '−' + App.fmtTL(f.pesinatMahsup) : '—'}</td>
          <td class="r"><b style="color:var(--amber-text)">${App.fmtTL(f.odenecekBakiye)}</b></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireFaturaIrsaliyeTab(siparisler, render, main) {
    document.querySelectorAll('.cp-fatura-irsaliye-kes').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      openFaturaIrsaliyeForm(s, () => render(main));
    });
    // Sevkiyatın kestiği irsaliye → Cari fiyat kontrolü + faturalama
    document.querySelectorAll('.cp-irsaliye-faturala').forEach(b => b.onclick = async () => {
      const irsaliyeler = await Store.irsaliyeler.all();
      const irsaliye = irsaliyeler.find(i => i.id === b.dataset.id);
      if (!irsaliye) return;
      openIrsaliyeFiyatKontrolFaturala(irsaliye, siparisler, () => render(main));
    });
  }

  // ── İRSALİYE FİYAT KONTROLÜ & FATURALAMA (Cari) ─────────────────────────
  // Sevkiyatın kalem ekleyip/çıkararak kestiği irsaliyenin kalem fiyatlarını
  // Cari burada kontrol eder, düzenler ve faturayı oluşturur. Fatura, sipariş
  // yerine İRSALİYENİN GÜNCEL KALEMLERİ üzerinden hesaplanır (peşinat mahsup
  // vb. sipariş bağı korunur).
  function openIrsaliyeFiyatKontrolFaturala(irsaliye, siparisler, onSaved) {
    const siparis = siparisler.find(s => s.id === irsaliye.siparisId);
    const kalemler = (irsaliye.kalemler || []).map(k => ({ ...k }));
    const body = document.createElement('div');

    function toplamHesapla() {
      const kdvOzet = App.kalemleriKdvGrupla(kalemler.map(k => ({ netFiyat: k.netFiyat || 0, miktar: k.miktar || 1, kdvOrani: k.kdvOrani ?? 20, ikinciKalite: k.ikinciKalite })), siparis ? siparis.genelIskontoYuzde : 0);
      return kdvOzet;
    }

    function ciz() {
      const kdvOzet = toplamHesapla();
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:10px"><b class="mono">${App.escapeHtml(irsaliye.irsaliyeNo)}</b> — ${App.escapeHtml(irsaliye.musteriAdi)} · Sevk: ${irsaliye.tarih}</div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim Fiyat (KDV Hariç)</th><th class="r">KDV %</th><th class="r">Tutar</th></tr>
          ${kalemler.map((k, i) => `<tr>
            <td><b class="mono">${App.escapeHtml(k.kod)}</b>${k.ikinciKalite ? ' <span class="pill pill-amber" style="font-size:9px">2.K/Defolu</span>' : ''}<br><span class="muted" style="font-size:10px">${App.escapeHtml(k.ad)}</span></td>
            <td class="r">${App.fmt(k.miktar, 2)} ${App.escapeHtml(k.birim || '')}</td>
            <td class="r"><input class="finput cif-fiyat" data-i="${i}" type="number" step="0.01" min="0" value="${k.netFiyat || 0}" style="width:100px;text-align:right" ${k.ikinciKalite ? 'title="2. kalite fiyatı — iskonto uygulanmaz"' : ''}></td>
            <td class="r"><input class="finput cif-kdv" data-i="${i}" type="number" step="1" min="0" max="100" value="${k.kdvOrani ?? 20}" style="width:60px;text-align:right"></td>
            <td class="r mono">${App.fmtTL((k.netFiyat || 0) * (k.miktar || 1))}</td>
          </tr>`).join('')}
        </table>
        <div class="hr"></div>
        <table class="dtable" style="font-size:12px"><tr><th>KDV Oranı</th><th class="r">KDV Hariç</th><th class="r">KDV</th><th class="r">KDV Dahil</th></tr>
          ${kdvOzet.detaylar.map(g => `<tr><td><b>%${g.oran}</b></td><td class="r">${App.fmtTL(g.kdvHaric)}</td><td class="r">${App.fmtTL(g.kdvTutari)}</td><td class="r"><b>${App.fmtTL(g.kdvDahil)}</b></td></tr>`).join('')}
          <tr style="background:var(--surface2)"><td><b>TOPLAM</b></td><td class="r"><b>${App.fmtTL(kdvOzet.kdvHaricToplam)}</b></td><td class="r"><b>${App.fmtTL(kdvOzet.kdvTutariToplam)}</b></td><td class="r"><b style="color:var(--green-text)">${App.fmtTL(kdvOzet.kdvDahilToplam)}</b></td></tr>
        </table>
        ${(siparis && siparis.genelIskontoYuzde) ? `<div class="fhint" style="margin-top:6px">ℹ Genel iskonto (%${siparis.genelIskontoYuzde}) normal kalemlere uygulanır; 2. kalite kalemler iskontodan muaftır.</div>` : ''}
      `;
      body.querySelectorAll('.cif-fiyat').forEach(inp => inp.onchange = () => { kalemler[parseInt(inp.dataset.i)].netFiyat = parseFloat(inp.value) || 0; ciz(); });
      body.querySelectorAll('.cif-kdv').forEach(inp => inp.onchange = () => { kalemler[parseInt(inp.dataset.i)].kdvOrani = parseFloat(inp.value) || 0; ciz(); });
    }
    ciz();

    const footer = `<button class="btn" id="cif-cancel">Vazgeç</button><button class="btn btn-green" id="cif-faturala">Faturayı Oluştur</button>`;
    App.openModal({ title: '💰 İrsaliye Fiyat Kontrolü & Faturalama', sub: irsaliye.irsaliyeNo, body, footer, xwide: true });
    document.getElementById('cif-cancel').onclick = App.closeModal;
    document.getElementById('cif-faturala').onclick = async () => {
      const musteriler = await Store.musteriler.all();
      const musteri = musteriler.find(m => m.id === irsaliye.musteriId);
      // Faturayı irsaliyenin GÜNCEL kalemleriyle hesaplat: sipariş kopyası
      // üzerinden mevcut fatura fonksiyonu kullanılır (peşinat mahsup korunur).
      const faturaSiparisi = siparis
        ? { ...siparis, kalemler: kalemler.map(k => ({ netFiyat: k.netFiyat || 0, miktar: k.miktar || 1, kdvOrani: k.kdvOrani ?? 20, ikinciKalite: k.ikinciKalite, kod: k.kod, ad: k.ad })) }
        : { id: irsaliye.siparisId || App.uid('SIP'), kod: irsaliye.siparisKodu || irsaliye.irsaliyeNo, musteriId: irsaliye.musteriId, musteriAdi: irsaliye.musteriAdi, kalemler: kalemler, genelIskontoYuzde: 0, odemePlani: null };
      const fatura = await App.persist(() => App.irsaliyeKesilinceFaturaOlustur(faturaSiparisi, musteri, irsaliye));
      // İrsaliye durum + düzenlenmiş kalemleri kaydet
      irsaliye.kalemler = kalemler;
      irsaliye.faturaDurumu = 'faturalandi';
      irsaliye.faturaNo = fatura.faturaNo;
      await App.persist(() => Store.irsaliyeler.upsert(irsaliye));
      App.toast(`Fatura oluşturuldu: ${fatura.faturaNo} (Ödenecek bakiye: ${App.fmtTL(fatura.odenecekBakiye)})`, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // Bir siparişin ürünleri için tek formda hem irsaliye hem fatura kesilir
  // (Sevkiyat Paneli'ndeki ile aynı mantık — stok düşümü + otomatik KDV'li fatura).
  function openFaturaIrsaliyeForm(siparis, onSaved) {
    const kdvOzet = App.kalemleriKdvGrupla(siparis.kalemler, siparis.genelIskontoYuzde);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b class="mono">${siparis.kod}</b> — ${App.escapeHtml(siparis.musteriAdi)}</div>
      <table class="dtable" style="margin-bottom:14px"><tr><th>KDV Oranı</th><th class="r">KDV Hariç</th><th class="r">KDV Tutarı</th><th class="r">KDV Dahil</th></tr>
        ${kdvOzet.detaylar.map(g => `<tr><td><b>%${g.oran}</b></td><td class="r">${App.fmtTL(g.kdvHaric)}</td><td class="r">${App.fmtTL(g.kdvTutari)}</td><td class="r"><b>${App.fmtTL(g.kdvDahil)}</b></td></tr>`).join('')}
        <tr class="total-row"><td>GENEL TOPLAM</td><td class="r">${App.fmtTL(kdvOzet.kdvHaricToplam)}</td><td class="r">${App.fmtTL(kdvOzet.kdvTutariToplam)}</td><td class="r">${App.fmtTL(kdvOzet.kdvDahilToplam)}</td></tr>
      </table>
      <div class="fgroup"><label class="flbl">İrsaliye No</label><input class="finput" id="fi-no" value="İRS-${Date.now().toString(36).toUpperCase()}"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Sevk Tarihi</label><input class="finput" id="fi-tarih" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="fgroup"><label class="flbl">Araç Plaka</label><input class="finput" id="fi-plaka" placeholder="34 ABC 123"></div>
      </div>
      <div class="fgroup"><label class="flbl">Sürücü / Nakliye Firması</label><input class="finput" id="fi-surucu"></div>
      <div class="fgroup"><label class="flbl">Not</label><textarea class="ftextarea" id="fi-not"></textarea></div>
    `;
    const footer = `<button class="btn" id="fi-cancel">Vazgeç</button><button class="btn btn-blue" id="fi-save">Fatura & İrsaliyeyi Kes</button>`;
    App.openModal({ title: 'Fatura & İrsaliye Kes', sub: siparis.kod + ' — ' + siparis.musteriAdi, body, footer, wide: true });
    document.getElementById('fi-cancel').onclick = App.closeModal;
    document.getElementById('fi-save').onclick = async () => {
      // BULGU (T1-5): irsaliye nesnesi kalemler alanını hiç taşımıyordu — bu
      // irsaliyeler için e-İrsaliye (UBL DespatchAdvice) üretilemiyordu
      // (page_efatura.js kalemsiz irsaliyeyi işleyemez). Şekil,
      // page_sevkiyat_panel.js:openIrsaliyeForm'daki DOĞRU örnekle aynı.
      const irsaliye = {
        id: App.uid('IRS'),
        irsaliyeNo: document.getElementById('fi-no').value.trim(),
        siparisId: siparis.id, siparisKodu: siparis.kod,
        musteriId: siparis.musteriId, musteriAdi: siparis.musteriAdi,
        tarih: document.getElementById('fi-tarih').value,
        aracPlaka: document.getElementById('fi-plaka').value.trim(),
        surucu: document.getElementById('fi-surucu').value.trim(),
        not: document.getElementById('fi-not').value.trim(),
        kalemler: (siparis.kalemler || []).map(k => ({
          kaynak: k.ikinciKalite ? 'ikinci_kalite' : (k.grup === 'yarimamul' ? 'yarimamul' : 'urun'),
          kod: k.kod, ad: k.ad, miktar: k.miktar || 1, birim: k.birim || 'ADET',
          netFiyat: k.netFiyat || 0, kdvOrani: k.kdvOrani ?? 20,
          ikinciKalite: !!k.ikinciKalite, iadeKalemId: k.iadeKalemId || null
        }))
      };
      await App.persist(() => Store.irsaliyeler.upsert(irsaliye));
      // BULGU (T3-23): bu form siparişin TÜM kalemlerini kesiyor (kalem
      // seçimi yok) — App.siparisKismiSevkGuncelle bu durumda zaten
      // 'sevk_edildi' üretir; paylaşılan fonksiyonu kullanmak, bu sipariş
      // daha önce (başka bir irsaliyeyle) kısmen sevk edilmişse
      // sevkEdilenMiktar'ları doğru topluyor olmasını da garanti eder.
      App.siparisKismiSevkGuncelle(siparis, irsaliye.kalemler);
      await App.persist(() => Store.siparisler.upsert(siparis));

      // Sevkiyat Deposu'ndan otomatik stok çıkışı
      const urunler = await Store.urunler.all();
      for (const kalem of (siparis.kalemler || [])) {
        if (kalem.grup !== 'urun') continue;
        const urun = urunler.find(u => u.kod === kalem.kod);
        if (!urun) continue;
        await App.persist(() => App.sevkiyatYapilinceStoktanDus(urun.id, urun.ad, kalem.miktar || 1, siparis.id));
      }

      // Otomatik KDV'li fatura (kalem bazlı KDV oranlarına göre)
      const musteriler = await Store.musteriler.all();
      const musteri = musteriler.find(m => m.id === siparis.musteriId);
      const fatura = await App.persist(() => App.irsaliyeKesilinceFaturaOlustur(siparis, musteri, irsaliye));

      App.toast(`Fatura & irsaliye kesildi: ${fatura.faturaNo} (Genel Toplam: ${App.fmtTL(fatura.genelToplam)}, Ödenecek Bakiye: ${App.fmtTL(fatura.odenecekBakiye)})`, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function renderMusteriTab(musteriler) {
    let html = `<div class="card"><div class="tbl-wrap"><table class="dtable">
      <tr><th>Ünvan</th><th>Telefon</th><th class="r">Vade (gün)</th><th>İhracat</th><th class="r">Bakiye</th><th></th></tr>`;
    musteriler.forEach(m => {
      const alacakliyiz = (m.bakiye || 0) > 0; // bakiye pozitifse müşteri borçlu, firma alacaklı
      html += `<tr><td><b>${App.escapeHtml(m.unvan)}</b><br><span class="muted" style="font-size:10.5px">${App.escapeHtml(m.email || '')}</span></td>
        <td style="font-size:11.5px">${App.escapeHtml(m.telefon || '—')}</td>
        <td class="r">${m.odemeVadeGun || 0}</td>
        <td>${m.ihracat ? '<span class="pill pill-purple">İhracat</span>' : '<span class="pill pill-gray">Yurtiçi</span>'}</td>
        <td class="r">${App.fmtTL(m.bakiye || 0)}</td>
        <td style="display:flex;gap:6px">
          <button class="btn btn-sm btn-ghost cp-detay" data-id="${m.id}">Detay</button>
          <button class="btn btn-sm cp-is-emirleri" data-id="${m.id}" data-tip="musteri" title="Verilen iş emirleri">📁</button>
          ${alacakliyiz ? `<button class="btn btn-sm btn-green cp-tahsilat-yap" data-id="${m.id}">Tahsilat Yap</button>` : ''}
        </td></tr>`;
    });
    html += `</table></div></div>`;
    return html;
  }

  function wireMusteriTab(musteriler, main) {
    main.querySelectorAll('.cp-detay').forEach(b => b.onclick = () => { detayMusteriId = b.dataset.id; render(main); });
    main.querySelectorAll('.cp-tahsilat-yap').forEach(b => b.onclick = () => {
      PageModules.muhasebe_panel.tahsilatYapAc(b.dataset.id, () => render(main));
    });
    main.querySelectorAll('.cp-is-emirleri').forEach(b => b.onclick = () => {
      const m = musteriler.find(x => x.id === b.dataset.id);
      if (m) QrDosya.tarihliDosyalarAc('musteri', m.id, m.kod || m.id, m.unvan);
    });
  }

  function renderOnayTab(siparisler, musteriler) {
    const bekleyenler = siparisler.filter(s => s.durum === 'cari_onay_bekliyor');
    let html = `<div class="card">
      <div class="fhint" style="margin-bottom:10px">Cari İşlemler onayı, siparişi Yönetim onayına gönderir. Onay sırasında müşteri risk limiti kontrol edilir, peşinat/sözleşme/ödeme yöntemi bilgisi girilir.</div>`;
    if (!bekleyenler.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Onay bekleyen sipariş yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Sipariş Kodu</th><th>Müşteri</th><th class="r">Toplam</th><th>Risk Durumu</th><th>Tarih</th><th></th></tr>`;
      bekleyenler.forEach(s => {
        const musteri = musteriler.find(m => m.id === s.musteriId);
        const riskDurumu = hesaplaRiskDurumu(musteri, s, siparisler);
        html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi)}</td><td class="r"><b>${App.fmtTL(s.toplam)}</b></td>
          <td>${riskDurumu.asildiMi ? `<span class="pill pill-red">⚠ Limit Aşımı</span>` : '<span class="pill pill-green">Limit İçinde</span>'}</td>
          <td style="font-size:11px">${s.tarih}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-green cp-onayla" data-id="${s.id}">Cari Onayına Al</button>
            <button class="btn btn-sm cp-reddet" data-id="${s.id}">Reddet</button>
          </td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  // Müşterinin açık risk durumunu hesaplar: mevcut bakiye + onay bekleyen/onaylanmış
  // tüm siparişlerin toplamı (henüz tahsil edilmemiş) - teminat miktarı, risk
  // limitiyle karşılaştırılır.
  function hesaplaRiskDurumu(musteri, yeniSiparis, tumSiparisler) {
    if (!musteri || musteri.riskLimiti == null) return { asildiMi: false, acikRisk: 0, limit: null };
    const acikDurumlar = ['cari_onay_bekliyor', 'yonetim_onay_bekliyor', 'onaylandi', 'uretimde'];
    const acikToplam = tumSiparisler
      .filter(s => s.musteriId === musteri.id && acikDurumlar.includes(s.durum) && s.id !== yeniSiparis.id)
      .reduce((a, s) => a + (s.toplam || 0), 0);
    const yeniAcikRisk = acikToplam + (musteri.bakiye || 0) + (yeniSiparis.toplam || 0) - (musteri.teminatMiktari || 0);
    return { asildiMi: yeniAcikRisk > musteri.riskLimiti, acikRisk: yeniAcikRisk, limit: musteri.riskLimiti };
  }

  function wireOnayTab(siparisler, musteriler, render, main) {
    main.querySelectorAll('.cp-onayla').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      const musteri = musteriler.find(m => m.id === s.musteriId);
      const risk = hesaplaRiskDurumu(musteri, s, siparisler);
      App.siparisIcerikVeOdemeFormuAc(s, {
        mod: 'cari', risk,
        onOnayla: async (odemePlani) => {
          s.odemePlani = odemePlani;
          s.durum = 'yonetim_onay_bekliyor';
          await App.persist(() => Store.siparisler.upsert(s));
          App.toast('Sipariş cari onayından geçti, Yönetim onayına gönderildi: ' + s.kod, 'ok');
          render(main);
        },
        onReddet: () => {
          App.confirmDialog('Bu siparişi reddetmek istediğinize emin misiniz?', async () => {
            s.durum = 'reddedildi';
            await App.persist(() => Store.siparisler.upsert(s));
            App.siparisReddindeTeklifSorusu(s, () => {
              App.toast('Sipariş reddedildi', 'ok');
              render(main);
            });
          });
        }
      });
    });
    main.querySelectorAll('.cp-reddet').forEach(b => b.onclick = () => {
      App.confirmDialog('Bu siparişi reddetmek istediğinize emin misiniz?', async () => {
        const s = siparisler.find(x => x.id === b.dataset.id);
        s.durum = 'reddedildi';
        await App.persist(() => Store.siparisler.upsert(s));
        App.siparisReddindeTeklifSorusu(s, () => {
          App.toast('Sipariş reddedildi', 'ok');
          render(main);
        });
      });
    });
  }

  // ── CARİ MÜTABAKAT MEKTUBU ───────────────────────────────────────────────
  // Müşteri + tarih aralığı seçilip, o aralıktaki TÜM fatura ve tahsilat
  // (onaylanmış) hareketleri dökülür; hangi faturaların kapandığı/açık
  // olduğu gösterilir, dönem başı/sonu bakiyesi hesaplanır. Karşılıklı
  // imza/onay için kullanılacak şekilde, ayrı bir sayfada YAZDIRILABİLİR
  // özet olarak sunulur.
  function renderMutabakatTab(musteriler, tedarikciler) {
    const bugun = new Date().toISOString().slice(0, 10);
    const ayBasi = bugun.slice(0, 8) + '01';
    return `<div class="card">
      <div class="card-hdr"><div class="card-title">Cari Mütabakat Mektubu Oluştur</div></div>
      <div class="fhint" style="margin-bottom:10px">Bir müşteri veya tedarikçi ve tarih aralığı seçin; o aralıktaki tüm hareketler dökülüp, açık/kapalı durum ile birlikte karşılıklı imza için hazır bir özet oluşturulur.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Cari Tipi</label>
          <select class="fselect" id="mut-tip">
            <option value="musteri">Müşteri</option>
            <option value="tedarikci">Tedarikçi</option>
          </select>
        </div>
        <div class="fgroup" id="mut-cari-secim-wrap" style="flex:2"><label class="flbl">Müşteri</label>
          <select class="fselect" id="mut-cari">
            <option value="">— Seçin —</option>
            ${musteriler.map(m => `<option value="${m.id}">${App.escapeHtml(m.unvan)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Başlangıç Tarihi</label><input class="finput" id="mut-baslangic" type="date" value="${ayBasi}"></div>
        <div class="fgroup"><label class="flbl">Bitiş Tarihi</label><input class="finput" id="mut-bitis" type="date" value="${bugun}"></div>
        <div style="display:flex;align-items:flex-end"><button class="btn btn-blue" id="mut-olustur">Mütabakat Oluştur</button></div>
      </div>
      <div id="mut-sonuc" style="margin-top:16px"></div>
    </div>`;
  }

  async function wireMutabakatTab(musteriler, tedarikciler, main) {
    const tipSelect = document.getElementById('mut-tip');
    const cariSelect = document.getElementById('mut-cari');
    const cariLabel = document.querySelector('#mut-cari-secim-wrap .flbl');
    tipSelect.onchange = () => {
      const tip = tipSelect.value;
      const liste = tip === 'musteri' ? musteriler : tedarikciler;
      cariLabel.textContent = tip === 'musteri' ? 'Müşteri' : 'Tedarikçi';
      cariSelect.innerHTML = `<option value="">— Seçin —</option>${liste.map(c => `<option value="${c.id}">${App.escapeHtml(c.unvan)}</option>`).join('')}`;
    };

    document.getElementById('mut-olustur').onclick = async () => {
      const tip = tipSelect.value;
      const cariId = cariSelect.value;
      if (!cariId) { App.toast((tip === 'musteri' ? 'Müşteri' : 'Tedarikçi') + ' seçmelisiniz', 'err'); return; }
      const baslangic = document.getElementById('mut-baslangic').value;
      const bitis = document.getElementById('mut-bitis').value;
      if (!baslangic || !bitis) { App.toast('Tarih aralığı girmelisiniz', 'err'); return; }

      const cari = (tip === 'musteri' ? musteriler : tedarikciler).find(c => c.id === cariId);
      let araliktakiBorclar, araliktakiAlacaklar, donemBasiBakiye, acikKalemler, kapaliKalemler, kapaliBaslik, acikBaslik, borcEtiketi, alacakEtiketi;

      if (tip === 'musteri') {
        const [faturalar, tahsilatlar, tahsilatBeklenenler] = await Promise.all([
          Store.faturalar.all(), Store.tahsilatlar.all(), Store.tahsilatBeklenenler.all()
        ]);
        const cariFaturalari = faturalar.filter(f => f.musteriId === cariId);
        const cariTahsilatlari = tahsilatlar.filter(t => {
          const fatura = cariFaturalari.find(f => f.id === t.faturaId);
          return t.musteriId === cariId || !!fatura;
        });

        function faturaKapaliMi(faturaId) {
          const kalemler = tahsilatBeklenenler.filter(t => t.faturaId === faturaId);
          if (!kalemler.length) return true;
          return kalemler.every(k => k.durum === 'onaylandi');
        }

        const oncekiBorcToplam = cariFaturalari.filter(f => f.tarih < baslangic).reduce((a, f) => a + (f.genelToplam || 0), 0);
        const oncekiAlacakToplam = cariTahsilatlari.filter(t => t.tarih < baslangic).reduce((a, t) => a + (t.tutar || 0), 0);
        donemBasiBakiye = oncekiBorcToplam - oncekiAlacakToplam;

        araliktakiBorclar = cariFaturalari.filter(f => f.tarih >= baslangic && f.tarih <= bitis)
          .map(f => ({ tarih: f.tarih, aciklama: 'Fatura: ' + f.faturaNo, tutar: f.genelToplam || 0, kapali: faturaKapaliMi(f.id), kod: f.faturaNo }));
        araliktakiAlacaklar = cariTahsilatlari.filter(t => t.tarih >= baslangic && t.tarih <= bitis)
          .map(t => ({ tarih: t.tarih, aciklama: 'Tahsilat: ' + (t.detay || t.tip), tutar: t.tutar || 0 }));
        borcEtiketi = 'Fatura'; alacakEtiketi = 'Tahsilat';
        kapaliBaslik = '✓ Kapanmış Faturalar'; acikBaslik = '⚠ Açık (Tahsil Edilmemiş) Faturalar';
      } else {
        const [satinalmaSiparisleri, tedarikciOdemeleri] = await Promise.all([
          Store.satinalmaSiparisleri.all(), Store.tedarikciOdemeleri.all()
        ]);
        const cariSiparisleri = satinalmaSiparisleri.filter(s => s.tedarikciId === cariId && SATINALMA_BORC_DURUMLARI.includes(s.durum));
        const cariOdemeleri = tedarikciOdemeleri.filter(o => o.tedarikciId === cariId);

        // Bir satınalma siparişinin "kapanma durumu": durum 'tamamlandi' ise
        // (depo girişi onaylanıp tamamlanmışsa) kapalı sayılır.
        function siparisKapaliMi(s) { return s.durum === 'tamamlandi'; }

        const oncekiBorcToplam = cariSiparisleri.filter(s => s.tarih < baslangic).reduce((a, s) => a + (s.toplamTRY || 0), 0);
        const oncekiAlacakToplam = cariOdemeleri.filter(o => o.tarih < baslangic).reduce((a, o) => a + (o.tutar || 0), 0);
        donemBasiBakiye = oncekiBorcToplam - oncekiAlacakToplam;

        araliktakiBorclar = cariSiparisleri.filter(s => s.tarih >= baslangic && s.tarih <= bitis)
          .map(s => ({ tarih: s.tarih, aciklama: 'Satınalma Siparişi: ' + s.kod, tutar: s.toplamTRY || 0, kapali: siparisKapaliMi(s), kod: s.kod }));
        araliktakiAlacaklar = cariOdemeleri.filter(o => o.tarih >= baslangic && o.tarih <= bitis)
          .map(o => ({ tarih: o.tarih, aciklama: 'Ödeme: ' + (o.detay || o.tip), tutar: o.tutar || 0 }));
        borcEtiketi = 'Satınalma Siparişi'; alacakEtiketi = 'Ödeme';
        kapaliBaslik = '✓ Tamamlanmış (Kapanmış) Siparişler'; acikBaslik = '⚠ Açık (Ödenmemiş/Devam Eden) Siparişler';
      }

      const donemBorcToplam = araliktakiBorclar.reduce((a, b) => a + b.tutar, 0);
      const donemAlacakToplam = araliktakiAlacaklar.reduce((a, b) => a + b.tutar, 0);
      const donemSonuBakiye = donemBasiBakiye + donemBorcToplam - donemAlacakToplam;

      acikKalemler = araliktakiBorclar.filter(b => !b.kapali);
      kapaliKalemler = araliktakiBorclar.filter(b => b.kapali);

      // Tüm hareketleri (borç+alacak) tarihe göre tek bir ekstre satırı
      // listesine birleştirip, satır satır bakiye yürütülür.
      const hareketler = [
        ...araliktakiBorclar.map(b => ({ tarih: b.tarih, aciklama: b.aciklama, borc: b.tutar, alacak: 0 })),
        ...araliktakiAlacaklar.map(a => ({ tarih: a.tarih, aciklama: a.aciklama, borc: 0, alacak: a.tutar }))
      ].sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));

      let kosanBakiye = donemBasiBakiye;
      const ekstreSatirlari = hareketler.map(h => {
        kosanBakiye += h.borc - h.alacak;
        return { ...h, bakiye: kosanBakiye };
      });

      const sonucEl = document.getElementById('mut-sonuc');
      sonucEl.innerHTML = `
        <div class="card" id="mut-yazdirilabilir" style="border:1.5px solid var(--border)">
          <div style="text-align:center;margin-bottom:14px">
            <div style="font-size:16px;font-weight:800">CARİ HESAP MÜTABAKAT MEKTUBU</div>
            <div style="font-size:11px;color:var(--text3)">${tip === 'musteri' ? 'Müşteri' : 'Tedarikçi'} Carisi</div>
            <div style="font-size:12px;color:var(--text2);margin-top:4px">${App.escapeHtml(cari.unvan)}</div>
            <div style="font-size:11px;color:var(--text3)">Dönem: ${baslangic} — ${bitis}</div>
          </div>
          <div class="grid grid-3" style="margin-bottom:14px">
            <div class="kpi"><div class="kpi-lbl">Dönem Başı Bakiye</div><div class="kpi-val">${App.fmtTL(donemBasiBakiye)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Dönem İçi Borç/Alacak</div><div class="kpi-val">${App.fmtTL(donemBorcToplam)} / ${App.fmtTL(donemAlacakToplam)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Dönem Sonu Bakiye</div><div class="kpi-val ${donemSonuBakiye > 0 ? 'red' : 'green'}">${App.fmtTL(donemSonuBakiye)}</div></div>
          </div>
          <div class="flbl" style="margin-bottom:8px">Hesap Ekstresi (${ekstreSatirlari.length} hareket)</div>
          <table class="dtable" style="margin-bottom:16px">
            <tr><th>Tarih</th><th>Açıklama</th><th class="r">Borç</th><th class="r">Alacak</th><th class="r">Bakiye</th></tr>
            <tr style="background:var(--bg)"><td colspan="4"><b>Dönem Başı Bakiyesi</b></td><td class="r"><b>${App.fmtTL(donemBasiBakiye)}</b></td></tr>
            ${ekstreSatirlari.map(h => `<tr>
              <td style="font-size:11px">${h.tarih}</td><td style="font-size:11px">${App.escapeHtml(h.aciklama)}</td>
              <td class="r">${h.borc ? App.fmtTL(h.borc) : '—'}</td>
              <td class="r">${h.alacak ? App.fmtTL(h.alacak) : '—'}</td>
              <td class="r"><b>${App.fmtTL(h.bakiye)}</b></td>
            </tr>`).join('')}
          </table>
          <div class="grid grid-2" style="margin-bottom:16px">
            <div>
              <div class="flbl" style="margin-bottom:6px;color:var(--green-text)">${kapaliBaslik} (${kapaliKalemler.length})</div>
              ${kapaliKalemler.length ? kapaliKalemler.map(b => `<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--border)">${b.kod} — ${App.fmtTL(b.tutar)} <span class="muted">(${b.tarih})</span></div>`).join('') : '<div class="muted" style="font-size:11px">Yok</div>'}
            </div>
            <div>
              <div class="flbl" style="margin-bottom:6px;color:var(--red-text)">${acikBaslik} (${acikKalemler.length})</div>
              ${acikKalemler.length ? acikKalemler.map(b => `<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--border)">${b.kod} — ${App.fmtTL(b.tutar)} <span class="muted">(${b.tarih})</span></div>`).join('') : '<div class="muted" style="font-size:11px">Yok</div>'}
            </div>
          </div>
          <div class="grid grid-2" style="margin-top:24px">
            <div style="text-align:center;border-top:1px solid var(--border);padding-top:8px;font-size:11px;color:var(--text2)">Firma İmza/Mühür</div>
            <div style="text-align:center;border-top:1px solid var(--border);padding-top:8px;font-size:11px;color:var(--text2)">${tip === 'musteri' ? 'Müşteri' : 'Tedarikçi'} İmza/Mühür</div>
          </div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn btn-blue" id="mut-yazdir">🖨 Yazdır</button>
        </div>
      `;
      document.getElementById('mut-yazdir').onclick = () => {
        const icerik = document.getElementById('mut-yazdirilabilir').outerHTML;
        const pencere = window.open('', '_blank');
        pencere.document.write(`<html><head><title>Mütabakat Mektubu</title>
          <style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left}.r{text-align:right}.kpi{padding:10px}.kpi-lbl{font-size:11px;color:#666}.kpi-val{font-size:15px;font-weight:700}.grid{display:grid;gap:10px}.grid-3{grid-template-columns:1fr 1fr 1fr}.grid-2{grid-template-columns:1fr 1fr}.muted{color:#999}.red{color:#b03025}.green{color:#0d6450}</style>
          </head><body>${icerik}</body></html>`);
        pencere.document.close();
        pencere.print();
      };
    };
  }

  function renderGecikmeTab(musteriler, siparisler, tahsilatBeklenenler) {
    // ── İLERİ TARİHLİ NAKİT ALACAK UYARISI (Cari için) ──────────────────────
    // Peşinat/çek/kredi kartı artık sipariş onayında anında işlendiği için
    // burada görünmez — SADECE vadesi gelmiş/geçmiş ileri tarihli NAKİT
    // kalemleri burada Cari'yi uyarır (Üst Yönetim Kokpiti'nde de aynı uyarı
    // gösterilir).
    const bugun = new Date().toISOString().slice(0, 10);
    const vadesiGelenNakitler = (tahsilatBeklenenler || []).filter(t => t.durum === 'onay_bekliyor' && t.tarih && t.tarih <= bugun);
    let uyariHtml = '';
    if (vadesiGelenNakitler.length) {
      uyariHtml = `<div class="card" style="border:1.5px solid var(--red-text);background:var(--red-bg);margin-bottom:14px">
        <div class="card-hdr"><div class="card-title" style="color:var(--red-text)">⚠ Vadesi Gelen İleri Tarihli Nakit Alacaklar — ${vadesiGelenNakitler.length} Kalem</div></div>
        <div class="fhint" style="margin-bottom:8px">Bu kalemlerin vadesi geldi. Tahsilatı kontrol edip Muhasebe Panel → Tahsilatlar'dan onaylayın.</div>
        <table class="dtable"><tr><th>Müşteri</th><th>Vade Tarihi</th><th class="r">Tutar</th></tr>
          ${vadesiGelenNakitler.map(t => `<tr><td>${App.escapeHtml(t.musteriAdi || '—')}</td><td style="font-size:11px">${t.tarih}</td><td class="r"><b style="color:var(--red-text)">${App.fmtTL(t.tutar)}</b></td></tr>`).join('')}
        </table>
      </div>`;
    }

    // Basit gecikme hesabı: onaylanmış ama "sevk_edildi" olmayan siparişler, sipariş tarihi + müşterinin vade günü geçmişse "gecikmiş" sayılır
    const today = new Date();
    let html = uyariHtml + `<div class="card"><div class="tbl-wrap"><table class="dtable">
      <tr><th>Müşteri</th><th>Sipariş</th><th class="r">Tutar</th><th>Vade Tarihi</th><th>Durum</th></tr>`;
    let varMi = false;
    // T4: 's.durum === "uretimde"' KALDIRILDI — siparis.durum bu değeri
    // hiçbir zaman almaz (üretim ilerlemesi ayrı bir alan olan
    // s.uretimDurumu ile takip edilir); ölü kod (her zaman false).
    siparisler.filter(s => s.durum === 'onaylandi' || s.durum === 'sevk_edildi' || s.durum === 'kismi_sevk_edildi').forEach(s => {
      const m = musteriler.find(x => x.id === s.musteriId);
      const vadeGun = m ? (m.odemeVadeGun || 0) : 0;
      const siparisTarihi = new Date(s.tarih);
      const vadeTarihi = new Date(siparisTarihi.getTime() + vadeGun * 86400000);
      const gecikmis = vadeTarihi < today;
      if (gecikmis) varMi = true;
      html += `<tr><td>${App.escapeHtml(s.musteriAdi)}</td><td class="mono">${s.kod}</td>
        <td class="r">${App.fmtTL(s.toplam)}</td><td style="font-size:11px">${vadeTarihi.toISOString().slice(0,10)}</td>
        <td>${gecikmis ? '<span class="pill pill-red">Gecikmiş</span>' : '<span class="pill pill-green">Vadesinde</span>'}</td></tr>`;
    });
    if (!varMi && siparisler.length === 0) html += `<tr><td colspan="5"><div class="empty-state" style="padding:18px 0"><div class="edesc">Takip edilecek sipariş yok.</div></div></td></tr>`;
    html += `</table></div></div>`;
    return html;
  }

  function renderMusteriDetay(main, m, siparisler) {
    const musteriSiparisleri = siparisler.filter(s => s.musteriId === m.id);
    const alacakliyiz = (m.bakiye || 0) > 0;
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${App.escapeHtml(m.unvan)}</div><div class="page-sub">${App.escapeHtml(m.adres || '')}</div></div>
        <div class="page-acts">
          <button class="btn" id="cp-back">&larr; Listeye Dön</button>
          ${alacakliyiz ? `<button class="btn btn-green" id="cp-tahsilat-yap">Tahsilat Yap</button>` : ''}
          <button class="btn" id="cp-edit">Düzenle</button>
        </div>
      </div>
      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Ödeme Vadesi</div><div class="kpi-val blue">${m.odemeVadeGun || 0} gün</div></div>
        <div class="kpi"><div class="kpi-lbl">Bakiye</div><div class="kpi-val ${m.bakiye > 0 ? 'red' : 'green'}">${App.fmtTL(m.bakiye || 0)}</div></div>
        <div class="kpi"><div class="kpi-lbl">İhracat Durumu</div><div class="kpi-val ${m.ihracat ? 'purple' : 'gray'}">${m.ihracat ? 'İhracat' : 'Yurtiçi'}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam Sipariş</div><div class="kpi-val">${musteriSiparisleri.length}</div></div>
      </div>
      ${m.ihracat ? `<div class="card" style="background:var(--blue-bg);border-color:var(--blue-light)">
        <div style="font-size:11.5px;color:var(--blue-text)"><b>İhracat Teşvik Notu:</b> Bu müşteri ihracat kapsamındadır. KDV istisnası ve ihracat teşvik belgeleri (DİİB, GB, vb.) için muhasebe ile koordineli işlem yapılmalıdır.</div>
      </div>` : ''}
      <div class="card">
        <div class="card-hdr"><div class="card-title">İletişim & Resmi Bilgiler</div></div>
        <div style="font-size:12.5px;display:flex;flex-direction:column;gap:4px">
          <div>Vergi Dairesi: <b>${App.escapeHtml(m.vergiDairesi || '—')}</b></div>
          <div>Vergi No: <b>${App.escapeHtml(m.vergiNo || '—')}</b></div>
          <div>Telefon: <b>${App.escapeHtml(m.telefon || '—')}</b></div>
          <div>E-posta: <b>${App.escapeHtml(m.email || '—')}</b></div>
          <div>Banka Hesap (IBAN): <b class="mono">${App.escapeHtml(m.bankaHesap || '—')}</b></div>
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">Sipariş Geçmişi</div></div>
        ${musteriSiparisleri.length ? `<table class="dtable"><tr><th>Kod</th><th class="r">Toplam</th><th>Durum</th><th>Tarih</th></tr>
          ${musteriSiparisleri.map(s => `<tr><td class="mono">${s.kod}</td><td class="r">${App.fmtTL(s.toplam)}</td><td>${s.durum}</td><td style="font-size:11px">${s.tarih}</td></tr>`).join('')}
        </table>` : '<div class="empty-state" style="padding:16px 10px"><div class="edesc">Sipariş geçmişi yok.</div></div>'}
      </div>
    `;
    document.getElementById('cp-back').onclick = () => { detayMusteriId = null; render(main); };
    document.getElementById('cp-edit').onclick = () => openMusteriForm(m, () => render(main));
    const tahsilatBtn = document.getElementById('cp-tahsilat-yap');
    if (tahsilatBtn) tahsilatBtn.onclick = () => PageModules.muhasebe_panel.tahsilatYapAc(m.id, () => render(main));
  }

  function openMusteriForm(musteri, onSaved) {
    const d = musteri || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Ünvan</label><input class="finput" id="mf-unvan" value="${App.escapeHtml(d.unvan || '')}"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Vergi Dairesi</label><input class="finput" id="mf-vergidairesi" value="${App.escapeHtml(d.vergiDairesi || '')}"></div>
        <div class="fgroup"><label class="flbl">Vergi No</label><input class="finput" id="mf-vergi" value="${App.escapeHtml(d.vergiNo || '')}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Telefon</label><input class="finput" id="mf-tel" value="${App.escapeHtml(d.telefon || '')}"></div>
        <div class="fgroup"><label class="flbl">E-posta</label><input class="finput" id="mf-email" value="${App.escapeHtml(d.email || '')}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Adres</label><textarea class="ftextarea" id="mf-adres">${App.escapeHtml(d.adres || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">Banka Hesap Numarası (IBAN)</label><input class="finput" id="mf-banka" value="${App.escapeHtml(d.bankaHesap || '')}" placeholder="TR00 0000 0000 0000 0000 0000 00"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Ödeme Vadesi (gün)</label><input class="finput" id="mf-vade" type="number" value="${d.odemeVadeGun || 30}"></div>
        <div class="fgroup"><label class="flbl">Bakiye (₺)</label><input class="finput" id="mf-bakiye" type="number" value="${d.bakiye || 0}"></div>
      </div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Risk ve Teminat Yönetimi</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Risk Limiti (₺)</label><input class="finput" id="mf-risklimit" type="number" value="${d.riskLimiti ?? ''}" placeholder="Sınırsız (boş bırakılırsa)"></div>
        <div class="fgroup"><label class="flbl">Teminat Miktarı (₺)</label><input class="finput" id="mf-teminat" type="number" value="${d.teminatMiktari || 0}"></div>
      </div>
      <div class="fhint" style="margin-top:-4px">Risk limiti, bu müşterinin açık (henüz tahsil edilmemiş) sipariş+bakiye toplamının aşamayacağı üst sınırdır. Cari İşlemler sipariş onayında bu limit kontrol edilir.</div>
      <div class="fgroup"><label class="flbl">Aylık Vade Farkı (%) — Çek ve Kredi Kartı ödemelerinde uygulanır</label><input class="finput" id="mf-vadefarki" type="number" step="0.1" value="${d.aylikVadeFarkiYuzde ?? 0}" placeholder="örn. 2.5"></div>
      <div class="fhint" style="margin-top:-4px">Sipariş onaylanınca çek/kredi kartı tutarları ANINDA kasaya girer (peşinat gibi) — ama vade tarihine kadar geçen ay sayısına göre bu oranla vade farkı hesaplanıp düşülür. Peşinat hiçbir zaman vade farkına tabi değildir.</div>
      <div class="fgroup"><label class="flbl">KDV Oranı (%) — boş bırakılırsa genel ayar (Ayarlar) kullanılır</label><input class="finput" id="mf-kdv" type="number" value="${d.kdvOraniYuzde ?? ''}" placeholder="örn. 20"></div>
      <div class="fcheck"><input type="checkbox" id="mf-ihracat" ${d.ihracat ? 'checked' : ''}><label for="mf-ihracat">İhracat müşterisi</label></div>
    `;
    const footer = `<button class="btn" id="mf-cancel">Vazgeç</button><button class="btn btn-blue" id="mf-save">Kaydet</button>`;
    App.openModal({ title: musteri ? 'Müşteriyi Düzenle' : 'Yeni Müşteri', body, footer, wide: true });
    document.getElementById('mf-cancel').onclick = App.closeModal;
    document.getElementById('mf-save').onclick = async () => {
     try {
      const unvan = document.getElementById('mf-unvan').value.trim();
      if (!unvan) { App.toast('Ünvan zorunlu', 'err'); return; }
      const m = {
        id: d.id || App.uid('MUS'),
        unvan, vergiDairesi: document.getElementById('mf-vergidairesi').value.trim(),
        vergiNo: document.getElementById('mf-vergi').value.trim(),
        telefon: document.getElementById('mf-tel').value.trim(),
        email: document.getElementById('mf-email').value.trim(),
        adres: document.getElementById('mf-adres').value.trim(),
        bankaHesap: document.getElementById('mf-banka').value.trim(),
        odemeVadeGun: parseInt(document.getElementById('mf-vade').value) || 0,
        bakiye: parseFloat(document.getElementById('mf-bakiye').value) || 0,
        riskLimiti: document.getElementById('mf-risklimit').value ? parseFloat(document.getElementById('mf-risklimit').value) : null,
        teminatMiktari: parseFloat(document.getElementById('mf-teminat').value) || 0,
        aylikVadeFarkiYuzde: parseFloat(document.getElementById('mf-vadefarki').value) || 0,
        kdvOraniYuzde: document.getElementById('mf-kdv').value ? parseFloat(document.getElementById('mf-kdv').value) : null,
        ihracat: document.getElementById('mf-ihracat').checked
      };
      await App.persist(() => Store.musteriler.upsert(m));
      App.toast('Müşteri kaydedildi', 'ok');
      App.closeModal();
      if (typeof onSaved === 'function') await onSaved();
     } catch (e) {
      App.toast('Müşteri kaydedilemedi: ' + (e && e.message ? e.message : e), 'err');
     }
    };
  }

  function renderTedarikciTab(tedarikciler, tedarikciBakiyeleri) {
    let html = `<div class="card"><div class="tbl-wrap"><table class="dtable">
      <tr><th>Ünvan</th><th>Kategori</th><th>Telefon</th><th>E-posta</th><th class="r">Bakiye (Borcumuz)</th><th></th></tr>`;
    tedarikciler.forEach(t => {
      const bakiye = tedarikciBakiyeleri ? (tedarikciBakiyeleri.get(t.id) || 0) : 0;
      const borcluyuz = bakiye > 0;
      html += `<tr><td><b>${App.escapeHtml(t.unvan)}</b></td>
        <td><span class="pill pill-gray">${t.kategori === 'plaka' ? 'Plaka' : t.kategori === 'hirdavat' ? 'Hırdavat' : App.escapeHtml(t.kategori || '—')}</span></td>
        <td style="font-size:11.5px">${App.escapeHtml(t.telefon || '—')}</td>
        <td style="font-size:11.5px">${App.escapeHtml(t.email || '—')}</td>
        <td class="r">${App.fmtTL(bakiye)}</td>
        <td style="display:flex;gap:6px">
          <button class="btn btn-sm btn-ghost cp-tedarikci-duzenle" data-id="${t.id}">Düzenle</button>
          <button class="btn btn-sm cp-is-emirleri" data-id="${t.id}" data-tip="tedarikci" title="Verilen iş emirleri">📁</button>
          ${borcluyuz ? `<button class="btn btn-sm btn-red cp-odeme-yap" data-id="${t.id}">Ödeme Yap</button>` : ''}
        </td></tr>`;
    });
    html += `</table></div></div>`;
    return html;
  }

  function wireTedarikciTab(tedarikciler, render, main) {
    document.querySelectorAll('.cp-tedarikci-duzenle').forEach(b => b.onclick = () => {
      const t = tedarikciler.find(x => x.id === b.dataset.id);
      openTedarikciForm(t, () => render(main));
    });
    document.querySelectorAll('.cp-odeme-yap').forEach(b => b.onclick = () => {
      PageModules.muhasebe_panel.odemeYapAc(b.dataset.id, () => render(main));
    });
    document.querySelectorAll('.cp-is-emirleri').forEach(b => b.onclick = () => {
      const t = tedarikciler.find(x => x.id === b.dataset.id);
      if (t) QrDosya.tarihliDosyalarAc('tedarikci', t.id, t.kod || t.id, t.unvan);
    });
  }

  function openTedarikciForm(tedarikci, onSaved) {
    const d = tedarikci || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Ünvan</label><input class="finput" id="tf-unvan" value="${App.escapeHtml(d.unvan || '')}"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kategori</label>
          <select class="fselect" id="tf-kategori">
            <option value="plaka" ${d.kategori === 'plaka' ? 'selected' : ''}>Plaka</option>
            <option value="hirdavat" ${(d.kategori || 'hirdavat') === 'hirdavat' ? 'selected' : ''}>Hırdavat</option>
            <option value="diger" ${d.kategori === 'diger' ? 'selected' : ''}>Diğer</option>
          </select>
        </div>
        <div class="fgroup"><label class="flbl">Telefon</label><input class="finput" id="tf-tel" value="${App.escapeHtml(d.telefon || '')}"></div>
      </div>
      <div class="fgroup"><label class="flbl">E-posta</label><input class="finput" id="tf-email" value="${App.escapeHtml(d.email || '')}"></div>
      <div class="fgroup"><label class="flbl">Vergi Dairesi</label><input class="finput" id="tf-vergidairesi" value="${App.escapeHtml(d.vergiDairesi || '')}"></div>
      <div class="fgroup"><label class="flbl">Vergi No</label><input class="finput" id="tf-vergi" value="${App.escapeHtml(d.vergiNo || '')}"></div>
      <div class="fgroup"><label class="flbl">Adres</label><textarea class="ftextarea" id="tf-adres">${App.escapeHtml(d.adres || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">Banka Hesap Numarası (IBAN)</label><input class="finput" id="tf-banka" value="${App.escapeHtml(d.bankaHesap || '')}" placeholder="TR00 0000 0000 0000 0000 0000 00"></div>
    `;
    const footer = `<button class="btn" id="tf-cancel">Vazgeç</button><button class="btn btn-blue" id="tf-save">Kaydet</button>`;
    App.openModal({ title: tedarikci ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi', body, footer, wide: true });
    document.getElementById('tf-cancel').onclick = App.closeModal;
    document.getElementById('tf-save').onclick = async () => {
     try {
      const unvan = document.getElementById('tf-unvan').value.trim();
      if (!unvan) { App.toast('Ünvan zorunlu', 'err'); return; }
      const t = {
        id: d.id || App.uid('TED'),
        unvan, kategori: document.getElementById('tf-kategori').value,
        telefon: document.getElementById('tf-tel').value.trim(),
        email: document.getElementById('tf-email').value.trim(),
        vergiDairesi: document.getElementById('tf-vergidairesi').value.trim(),
        vergiNo: document.getElementById('tf-vergi').value.trim(),
        adres: document.getElementById('tf-adres').value.trim(),
        bankaHesap: document.getElementById('tf-banka').value.trim()
      };
      await App.persist(() => Store.tedarikciler.upsert(t));
      App.toast('Tedarikçi kaydedildi', 'ok');
      App.closeModal();
      if (typeof onSaved === 'function') await onSaved();
     } catch (e) {
      App.toast('Tedarikçi kaydedilemedi: ' + (e && e.message ? e.message : e), 'err');
     }
    };
  }

  return { render, openMusteriForm, openTedarikciForm };
})();
