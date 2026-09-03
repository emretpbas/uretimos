// ════════════════════════════════════════════════════════════════════════════
// MUHASEBE — İÇ TAKİP & YMM'YE VERİ HAZIRLAMA EKRANI
// ⚠ ÖNEMLİ: Bu modül RESMİ BİR BEYANNAME YAZILIMI DEĞİLDİR. KDV beyannamesi,
// muhtasar, geçici vergi gibi resmi beyannameleri ÜRETMEZ ve resmi bir
// muhasebe defteri yerine geçmez. Sistemdeki gelir/gider hareketlerini
// (satış faturaları, hammadde alımları, personel/araç/bakım giderleri)
// konsolide ederek YMM'nize/mali müşavirinize iletebileceğiniz bir ÖN
// HAZIRLIK ve İÇ TAKİP raporu sunar. Resmi beyanname ve defter kayıtları
// için lisanslı bir muhasebe yazılımı ve mali müşavir/YMM onayı gereklidir.
// ════════════════════════════════════════════════════════════════════════════
PageModules.muhasebe_panel = (() => {
  let activeTab = 'ozet';
  let seciliAy = new Date().toISOString().slice(0, 7);

  const GELIR_KATEGORI_LABEL = { satis_faturasi: 'Satış Faturası', duran_varlik_satisi: 'Duran Varlık Satışı (Makina vb.)' };
  const GIDER_KATEGORI_LABEL = { hammadde_alimi: 'Hammadde/Hırdavat Alımı', bakim_servis_gideri: 'Bakım/Servis Gideri', arac_gideri: 'Araç Gideri', personel_gideri: 'Personel Gideri (Maaş Dışı)', personel_maliyeti: 'Personel Maliyeti (Bordro)' };

  async function render(main) {
    const [muhasebeKayitlari, makinalar, faturalar, tahsilatlar, tahsilatBeklenenler, bankaKredileri, musteriler, siparisler, tedarikciler, satinalmaSiparisleri, musteriCekleri, tedarikciOdemeleri, vadeFarkiKayitlari] = await Promise.all([
      Store.muhasebeKayitlari.all(), Store.makinaTechizat.all(), Store.faturalar.all(),
      Store.tahsilatlar.all(), Store.tahsilatBeklenenler.all(), Store.bankaKredileri.all(), Store.musteriler.all(), Store.siparisler.all(),
      Store.tedarikciler.all(), Store.satinalmaSiparisleri.all(), Store.musteriCekleri.all(), Store.tedarikciOdemeleri.all(), Store.vadeFarkiKayitlari.all()
    ]);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Muhasebe ve Finans</div><div class="page-sub">Gelir-gider özeti, KDV hesabı, tahsilatlar, alacak takvimi, banka kredileri ve YMM'ye veri hazırlama (iç takip amaçlıdır)</div></div>
      </div>
      <div class="card" style="background:var(--amber-bg);border-color:var(--amber-light)">
        <div style="font-size:11.5px;color:var(--amber-text)">
          ⚠ Bu ekran <b>resmi bir beyanname yazılımı değildir</b>. KDV beyannamesi, muhtasar, geçici vergi gibi resmi
          beyannameleri üretmez, resmi defter kaydı tutmaz. Sistemdeki gelir/gider hareketlerini konsolide ederek
          size ve mali müşavirinize/YMM'nize <b>ön hazırlık ve iç takip</b> verisi sunar. Resmi beyan ve kayıtlar
          için lisanslı muhasebe yazılımı ve YMM/mali müşavir onayı gereklidir.
        </div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'ozet' ? 'active' : ''}" data-tab="ozet">Gelir-Gider Özeti</div>
        <div class="tab ${activeTab === 'defter' ? 'active' : ''}" data-tab="defter">Basit Usul Defter</div>
        <div class="tab ${activeTab === 'tahsilat' ? 'active' : ''}" data-tab="tahsilat">Tahsilatlar ${tahsilatBeklenenler.filter(t => t.durum === 'onay_bekliyor').length ? '<span class="pill pill-red" style="margin-left:4px">' + tahsilatBeklenenler.filter(t => t.durum === 'onay_bekliyor').length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'tedarikciodeme' ? 'active' : ''}" data-tab="tedarikciodeme">Tedarikçi Ödemeleri</div>
        <div class="tab ${activeTab === 'vadefarki' ? 'active' : ''}" data-tab="vadefarki">Vade Farkı Özeti</div>
        <div class="tab ${activeTab === 'alacaktakvimi' ? 'active' : ''}" data-tab="alacaktakvimi">Alacak Takvimi</div>
        <div class="tab ${activeTab === 'kredi' ? 'active' : ''}" data-tab="kredi">Banka Kredileri</div>
        <div class="tab ${activeTab === 'kdv' ? 'active' : ''}" data-tab="kdv">KDV Hesabı</div>
        <div class="tab ${activeTab === 'hareketler' ? 'active' : ''}" data-tab="hareketler">Tüm Hareketler</div>
        <div class="tab ${activeTab === 'amortisman' ? 'active' : ''}" data-tab="amortisman">Amortisman (Gider Etkisi)</div>
      </div>
      <div id="mh-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('mh-tab-content');
    if (activeTab === 'ozet') content.innerHTML = renderOzetTab(muhasebeKayitlari);
    else if (activeTab === 'defter') content.innerHTML = renderDefterTab(muhasebeKayitlari);
    else if (activeTab === 'tahsilat') { content.innerHTML = renderTahsilatTab(tahsilatlar, tahsilatBeklenenler, musteriler); wireTahsilatTab(musteriler, siparisler, tahsilatBeklenenler, render, main); }
    else if (activeTab === 'tedarikciodeme') { content.innerHTML = renderTedarikciOdemeTab(tedarikciOdemeleri, tedarikciler, satinalmaSiparisleri); wireTedarikciOdemeTab(tedarikciler, satinalmaSiparisleri, musteriCekleri, render, main); }
    else if (activeTab === 'vadefarki') { content.innerHTML = renderVadeFarkiTab(vadeFarkiKayitlari); }
    else if (activeTab === 'alacaktakvimi') { content.innerHTML = renderAlacakTakvimiTab(tahsilatBeklenenler, bankaKredileri); wireAlacakTakvimiTab(tahsilatBeklenenler, render, main); }
    else if (activeTab === 'kredi') { content.innerHTML = renderKrediTab(bankaKredileri); wireKrediTab(render, main); }
    else if (activeTab === 'kdv') { content.innerHTML = renderKdvTab(muhasebeKayitlari, faturalar); wireKdvTab(render, main); }
    else if (activeTab === 'hareketler') content.innerHTML = renderHareketlerTab(muhasebeKayitlari);
    else content.innerHTML = renderAmortismanTab(makinalar);
  }

  // ── BASİT USUL DEFTER MANTIĞI ──────────────────────────────────────────────
  // Gerçek bir "Basit Usul İşletme Defteri" değildir, ama aynı mantıkla
  // (tarih sırasıyla gelir/gider, kümülatif bakiye) bir görünüm sunar —
  // satınalma ödemeleri, maaş ödemeleri ve diğer giderler dahil edilir.
  // BULGU: bu sekme önceden muhasebeKayitlari (fatura kesilince TAHAKKUK
  // esasıyla oluşan "satis_faturasi" geliri) İLE tahsilatlar (aynı satışın
  // DAHA SONRA tahsil edilmesiyle oluşan kayıt) toplamını AYRI AYRI "gelir"
  // olarak topluyordu — aynı satış İKİ KEZ sayılıyordu. Gelir-Gider
  // Özeti'ndeki (renderOzetTab) doğru mantık — YALNIZCA muhasebeKayitlari
  // (tahakkuk esası) — buraya da uygulandı; tahsilatlar zaten aynı satışın
  // nakit akışı görünümüdür (bkz. Tahsilatlar sekmesi), burada tekrar
  // sayılmaz.
  function renderDefterTab(muhasebeKayitlari) {
    const tumKayitlar = muhasebeKayitlari
      .map(k => ({ tarih: k.tarih, aciklama: k.aciklama, tip: k.tip, tutar: k.tutar, kategori: k.kategori }))
      .sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));

    let kumulatif = 0;
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Basit Usul Defter Mantığında Gelir-Gider Hareketleri</div></div>
      <div class="fhint" style="margin-bottom:8px">Tarih sırasına göre tüm gelir/gider hareketleri ve kümülatif bakiye — satınalma ödemeleri, maaş ödemeleri ve diğer giderler dahildir. ⚠ Resmi işletme defteri değildir.</div>`;
    if (!tumKayitlar.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz kayıt yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>Açıklama</th><th class="r">Gelir</th><th class="r">Gider</th><th class="r">Kümülatif Bakiye</th></tr>`;
      tumKayitlar.forEach(k => {
        kumulatif += k.tip === 'gelir' ? k.tutar : -k.tutar;
        html += `<tr><td style="font-size:11px">${k.tarih}</td><td style="font-size:11.5px">${App.escapeHtml(k.aciklama || '')}</td>
          <td class="r">${k.tip === 'gelir' ? App.fmtTL(k.tutar) : '—'}</td>
          <td class="r">${k.tip === 'gider' ? App.fmtTL(k.tutar) : '—'}</td>
          <td class="r"><b style="color:${kumulatif >= 0 ? 'var(--green-text)' : 'var(--red-text)'}">${App.fmtTL(kumulatif)}</b></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  // ── TAHSİLATLAR ────────────────────────────────────────────────────────────
  // İki bölüm: (1) "Onay Bekleyen Tahsilatlar" — sipariş/teklif ödeme
  // planından (peşinat+çek+kredi kartı+nakit) otomatik gelen, henüz cari
  // bakiyeden düşülmemiş/muhasebeye işlenmemiş kalemler; kullanıcı her
  // birini TEK TEK onaylar. (2) "Onaylanmış Tahsilatlar" — mevcut manuel
  // kayıt mantığı (sözleşme dışı/elden alınan ödemeler için), AYNEN korunur.
  // ── VADE FARKI ÖZETİ — MÜŞTERİ BAZLI ────────────────────────────────────
  // Sipariş onayında çek/kredi kartı kalemlerinden hesaplanan vade farkları
  // burada müşteri bazlı toplanıp gösterilir (rakamsal özet, yönetim ekranı).
  function renderVadeFarkiTab(vadeFarkiKayitlari) {
    const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı' };
    const musteriBazli = new Map();
    vadeFarkiKayitlari.forEach(v => {
      if (!musteriBazli.has(v.musteriId)) musteriBazli.set(v.musteriId, { musteriAdi: v.musteriAdi, toplam: 0, adet: 0, kayitlar: [] });
      const o = musteriBazli.get(v.musteriId);
      o.toplam += v.vadeFarki; o.adet++; o.kayitlar.push(v);
    });
    const genelToplam = vadeFarkiKayitlari.reduce((a, v) => a + v.vadeFarki, 0);

    let html = `<div class="grid grid-2" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Vade Farkı Geliri</div><div class="kpi-val green">${App.fmtTL(genelToplam)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Vade Farkı Uygulanan Kalem Sayısı</div><div class="kpi-val">${vadeFarkiKayitlari.length}</div></div>
    </div>`;
    html += `<div class="card"><div class="card-hdr"><div class="card-title">Müşteri Bazlı Vade Farkı Özeti</div></div>`;
    if (!musteriBazli.size) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz vade farkı kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Müşteri</th><th class="r">Kalem Sayısı</th><th class="r">Toplam Vade Farkı</th></tr>`;
      [...musteriBazli.values()].sort((a, b) => b.toplam - a.toplam).forEach(o => {
        html += `<tr><td><b>${App.escapeHtml(o.musteriAdi)}</b></td><td class="r">${o.adet}</td><td class="r"><b style="color:var(--green-text)">${App.fmtTL(o.toplam)}</b></td></tr>`;
      });
      html += `</table></div>`;

      html += `<div class="card" style="margin-top:14px"><div class="card-hdr"><div class="card-title">Tüm Vade Farkı Kayıtları (Detay)</div></div>
        <table class="dtable"><tr><th>Tarih</th><th>Müşteri</th><th>Sipariş</th><th>Tip</th><th class="r">Brüt</th><th class="r">Ay Sayısı</th><th class="r">Vade Farkı</th><th class="r">Net</th></tr>`;
      [...vadeFarkiKayitlari].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(v => {
        html += `<tr><td style="font-size:11px">${v.tarih}</td><td>${App.escapeHtml(v.musteriAdi)}</td><td class="mono" style="font-size:11px">${v.siparisKod}</td>
          <td><span class="pill pill-gray">${tipLabel[v.tip] || v.tip}</span></td>
          <td class="r">${App.fmtTL(v.brutTutar)}</td><td class="r">${v.aySayisi}</td>
          <td class="r" style="color:var(--green-text)">${App.fmtTL(v.vadeFarki)}</td><td class="r"><b>${App.fmtTL(v.netTutar)}</b></td></tr>`;
      });
      html += `</table></div>`;
    }
    return html;
  }

  function renderTahsilatTab(tahsilatlar, tahsilatBeklenenler, musteriler) {
    const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı', nakit: 'Nakit', havale_eft: 'Havale/EFT', diger: 'Diğer', pesinat: 'Peşinat' };
    const bekleyenler = tahsilatBeklenenler.filter(t => t.durum === 'onay_bekliyor');

    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">⏳ Vadesi Gelen İleri Tarihli Nakit Alacaklar</div></div>
      <div class="fhint" style="margin-bottom:8px">Peşinat, çek ve kredi kartı kalemleri sipariş onaylandığı anda ANINDA kasaya/cariye işlenir (artık burada onay beklemez). Sadece İLERİ TARİHLİ NAKİT alacaklar, vadesi gelene kadar burada (ve Alacak Takvimi'nde) bekler — vade tarihi geldiğinde Cari ve Üst Yönetim bilgilendirilir. Fiilen tahsilat yapıldığında aşağıdan onaylayın.</div>`;
    if (!bekleyenler.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Onay bekleyen ileri tarihli nakit alacak yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Sipariş/Fatura</th><th>Müşteri</th><th>Yöntem</th><th>Detay</th><th>Vade/Tarih</th><th class="r">Tutar</th><th></th></tr>`;
      [...bekleyenler].sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '')).forEach(t => {
        const detayParcalari = [];
        if (t.cekNo) detayParcalari.push('Çek No: ' + t.cekNo);
        if (t.taksitTipi) detayParcalari.push(t.taksitTipi === 'vadeli' ? (t.taksitSayisi + ' Taksit') : 'Tek Çekim');
        if (t.aciklama) detayParcalari.push(t.aciklama);
        html += `<tr><td class="mono" style="font-size:11px">${t.faturaNo || t.siparisKod || '—'}</td><td>${App.escapeHtml(t.musteriAdi || '—')}</td>
          <td><span class="pill pill-amber">${tipLabel[t.tip] || t.tip}</span></td>
          <td style="font-size:11px">${App.escapeHtml(detayParcalari.join(', ') || '—')}</td>
          <td style="font-size:11px">${t.tarih || '—'}</td>
          <td class="r"><b>${App.fmtTL(t.tutar)}</b></td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-green mh-tb-onayla" data-id="${t.id}">✓ Onayla</button>
            <button class="btn btn-sm btn-red mh-tb-reddet" data-id="${t.id}">✕ Reddet</button>
          </td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    html += `<div class="card" style="margin-top:14px">
      <div class="card-hdr"><div class="card-title">Onaylanmış / Manuel Tahsilatlar</div>
        <button class="btn btn-sm btn-blue" id="mh-tahsilat-ekle">+ Tahsilat Kaydı Ekle</button>
      </div>`;
    if (!tahsilatlar.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz tahsilat kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>Müşteri</th><th>Yöntem</th><th>Detay</th><th class="r">Tutar</th></tr>`;
      [...tahsilatlar].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(t => {
        html += `<tr><td style="font-size:11px">${t.tarih}</td><td>${App.escapeHtml(t.musteriAdi || '—')}</td>
          <td><span class="pill pill-gray">${tipLabel[t.tip] || t.tip}</span></td>
          <td style="font-size:11px">${App.escapeHtml(t.detay || '—')}</td>
          <td class="r"><b style="color:var(--green-text)">${App.fmtTL(t.tutar)}</b></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireTahsilatTab(musteriler, siparisler, tahsilatBeklenenler, render, main) {
    document.getElementById('mh-tahsilat-ekle').onclick = () => openTahsilatForm(musteriler, () => render(main));

    document.querySelectorAll('.mh-tb-onayla').forEach(b => b.onclick = () => {
      const t = tahsilatBeklenenler.find(x => x.id === b.dataset.id);
      App.confirmDialog(`${App.fmtTL(t.tutar)} tutarındaki bu tahsilatı ONAYLIYOR musunuz? Onaylandığında cari bakiyeden düşülecek ve kasa/banka hareketi olarak muhasebeye işlenecektir.`, async () => {
        await App.persist(() => App.tahsilatBeklenenOnayla(t.id));
        App.toast('Tahsilat onaylandı, cari bakiyeden düşüldü: ' + App.fmtTL(t.tutar), 'ok');
        render(main);
      });
    });
    document.querySelectorAll('.mh-tb-reddet').forEach(b => b.onclick = () => {
      const t = tahsilatBeklenenler.find(x => x.id === b.dataset.id);
      App.confirmDialog('Bu tahsilatı reddetmek istediğinize emin misiniz? (Müşteriden bu ödeme alınamadı/değişti anlamına gelir — cari bakiye bu kadarlık kısım için açık kalır, ayrıca takip etmeniz gerekir.)', async () => {
        t.durum = 'reddedildi';
        await App.persist(() => Store.tahsilatBeklenenler.upsert(t));
        App.toast('Tahsilat reddedildi olarak işaretlendi', 'err');
        render(main);
      });
    });
  }

  // ── TEDARİKÇİ ÖDEMELERİ ─────────────────────────────────────────────────────
  // Tahsilatlar sekmesine paralel bir yapı: tedarikçiye yapılan nakit/havale/
  // çek ödemelerini kayıt altına alır. "Çekle Öde" seçilince, MÜŞTERİLERDEN
  // tahsil edilmiş ve HENÜZ kullanılmamış (durum:'elde') çekler bir seçim
  // listesi olarak gösterilir — seçilen çek o tedarikçiye CİRO edilir,
  // durum:'ciro_edildi' olur ve bir daha hiçbir ödeme ekranında görünmez.
  function renderTedarikciOdemeTab(tedarikciOdemeleri, tedarikciler, satinalmaSiparisleri) {
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Tedarikçiye Yapılan Ödemeler</div>
        <button class="btn btn-sm btn-blue" id="mh-tedarikciode-ekle">+ Tedarikçi Ödemesi Ekle</button>
      </div>
      <div class="fhint" style="margin-bottom:8px">Nakit/Havale veya müşterilerden alınmış çeklerin tedarikçiye ciro edilmesiyle yapılan ödemeler buradan kayıt altına alınır.</div>`;
    if (!tedarikciOdemeleri.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz tedarikçi ödemesi kaydı yok.</div></div>`;
    } else {
      const tipLabel = { nakit: 'Nakit', havale_eft: 'Havale/EFT', cek_ciro: 'Çek (Ciro)' };
      html += `<table class="dtable"><tr><th>Tarih</th><th>Tedarikçi</th><th>Yöntem</th><th>Detay</th><th class="r">Tutar</th></tr>`;
      [...tedarikciOdemeleri].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(t => {
        html += `<tr><td style="font-size:11px">${t.tarih}</td><td>${App.escapeHtml(t.tedarikciAdi || '—')}</td>
          <td><span class="pill pill-gray">${tipLabel[t.tip] || t.tip}</span></td>
          <td style="font-size:11px">${App.escapeHtml(t.detay || '—')}</td>
          <td class="r"><b style="color:var(--red-text)">${App.fmtTL(t.tutar)}</b></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireTedarikciOdemeTab(tedarikciler, satinalmaSiparisleri, musteriCekleri, render, main) {
    document.getElementById('mh-tedarikciode-ekle').onclick = () => openTedarikciOdemeForm(tedarikciler, musteriCekleri, () => render(main));
  }

  async function openTedarikciOdemeForm(tedarikciler, musteriCekleri, onSaved, onceSeciliTedarikciId) {
    let aktifYontem = 'havale_eft';
    const elindekiCekler = musteriCekleri.filter(c => c.durum === 'elde');
    // Her tedarikçinin net borç bakiyesini (satınalma siparişleri toplamı -
    // ödenenler) hesaplamak için taze veri çekilir — Cari Panel'deki mantıkla
    // AYNI hesaplama (bkz. page_cari_panel.js render fonksiyonu).
    const [satinalmaSiparisleri, tedarikciOdemeleriTaze] = await Promise.all([Store.satinalmaSiparisleri.all(), Store.tedarikciOdemeleri.all()]);
    // Ödemeyle İLİŞKİLENDİRİLEBİLECEK açık siparişler: onaylanmış/gönderilmiş
    // ama henüz tamamlanmamış olanlar. 'yonetim_onayi_bekliyor' ve
    // 'birime_dondu' tedarikçiye hiç iletilmedi, ödeme bağlanacak bir
    // taahhüt değiller.
    const acikSatinalmaSiparisleri = satinalmaSiparisleri.filter(s => s.durum === 'onaylandi' || s.durum === 'gonderildi');
    function tedarikciBakiyesi(tedarikciId) {
      // Yalnızca GERÇEK TAAHHÜDE dönüşmüş (onaylanmış/gönderilmiş/tamamlanmış)
      // siparişler borç sayılır — Cari Panel'deki hesaplamayla AYNI mantık
      // (bkz. page_cari_panel.js SATINALMA_BORC_DURUMLARI).
      const borc = satinalmaSiparisleri.filter(s => s.tedarikciId === tedarikciId && (s.durum === 'onaylandi' || s.durum === 'gonderildi' || s.durum === 'tamamlandi')).reduce((a, s) => a + (s.toplamTRY || 0), 0);
      const odenen = tedarikciOdemeleriTaze.filter(o => o.tedarikciId === tedarikciId).reduce((a, o) => a + (o.tutar || 0), 0);
      return borc - odenen;
    }

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Tedarikçi</label>
        <select class="fselect" id="to-tedarikci">
          <option value="">— Seçin —</option>
          ${tedarikciler.map(t => `<option value="${t.id}" ${onceSeciliTedarikciId === t.id ? 'selected' : ''}>${App.escapeHtml(t.unvan)}</option>`).join('')}
        </select>
      </div>
      <div id="to-bakiye-ozet" style="margin-bottom:10px"></div>
      <div class="fgroup"><label class="flbl">Ödeme Yöntemi</label>
        <div class="tabs" id="to-yontem-tabs">
          <div class="tab active" data-yontem="havale_eft">Havale/EFT</div>
          <div class="tab" data-yontem="nakit">Nakit</div>
          <div class="tab" data-yontem="cek_ciro">Çekle Öde (Müşteri Çeki Ciro)</div>
          <div class="tab" data-yontem="kendi_cekimiz">Kendi Çekimizle Öde</div>
        </div>
      </div>
      <div id="to-yontem-detay"></div>
    `;
    const footer = `<button class="btn" id="to-cancel">Vazgeç</button><button class="btn btn-blue" id="to-save">Kaydet</button>`;
    App.openModal({ title: 'Tedarikçi Ödemesi Ekle', body, footer, wide: true });
    document.getElementById('to-cancel').onclick = App.closeModal;

    // ── CANLI BAKİYE ÖZETİ ──────────────────────────────────────────────────
    // Tedarikçi seçildiğinde mevcut borç bakiyesi gösterilir; ödeme tutarı
    // girildikçe (veya çek seçildikçe) KALAN BAKİYE anlık güncellenir.
    function renderBakiyeOzet() {
      const wrap = document.getElementById('to-bakiye-ozet');
      const tedarikciId = document.getElementById('to-tedarikci').value;
      if (!tedarikciId) { wrap.innerHTML = ''; return; }
      const mevcutBakiye = tedarikciBakiyesi(tedarikciId);
      let girilenTutar = 0;
      if (aktifYontem === 'cek_ciro') {
        const secim = document.getElementById('to-cek-secim');
        if (secim && secim.value) { const cek = elindekiCekler.find(c => c.id === secim.value); girilenTutar = cek ? cek.tutar : 0; }
      } else {
        const tutarInput = document.getElementById('to-tutar');
        girilenTutar = tutarInput ? (parseFloat(tutarInput.value) || 0) : 0;
      }
      const kalanBakiye = mevcutBakiye - girilenTutar;
      wrap.innerHTML = `<div class="grid grid-3">
        <div class="kpi"><div class="kpi-lbl">Mevcut Borç Bakiyesi</div><div class="kpi-val ${mevcutBakiye > 0 ? 'red' : 'green'}">${App.fmtTL(mevcutBakiye)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Bu Ödeme Tutarı</div><div class="kpi-val blue">${App.fmtTL(girilenTutar)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Kalan Bakiye (Ödeme Sonrası)</div><div class="kpi-val ${kalanBakiye > 0 ? 'red' : 'green'}">${App.fmtTL(kalanBakiye)}</div></div>
      </div>`;
    }
    renderBakiyeOzet();
    document.getElementById('to-tedarikci').onchange = () => { renderYontemDetay(); };

    function renderYontemDetay() {
      const wrap = document.getElementById('to-yontem-detay');
      if (aktifYontem === 'cek_ciro') {
        if (!elindekiCekler.length) {
          wrap.innerHTML = `<div class="fhint" style="color:var(--red-text)">⚠ Şu anda elde (tahsil edilmiş, kullanılmamış) müşteri çeki yok. Önce Tahsilatlar sekmesinden bir çek tahsilatını onaylayın.</div>`;
          return;
        }
        wrap.innerHTML = `
          <div class="fgroup"><label class="flbl">Ciro Edilecek Çek Seçin</label>
            <select class="fselect" id="to-cek-secim">
              ${elindekiCekler.map(c => `<option value="${c.id}">${App.escapeHtml(c.musteriAdi)} — Çek No: ${App.escapeHtml(c.cekNo)} — ${App.fmtTL(c.tutar)} — Vade: ${c.vadeTarihi}</option>`).join('')}
            </select>
          </div>
          <div class="fhint">Bu çek tedarikçiye verildiğinde, seçim listesinden KALICI olarak çıkar — bir daha başka bir tedarikçi ödemesinde gösterilmez.</div>
        `;
        document.getElementById('to-cek-secim').onchange = renderBakiyeOzet;
      } else if (aktifYontem === 'kendi_cekimiz') {
        // KULLANICI İSTEĞİ: Tedarikçiye KENDİ çekimizi (firmamızın çeki)
        // verdiğimizde, bu bilgi hem kasa/ödeme kaydına (tedarikciOdemeleri)
        // hem de — eğer bu ödeme belirli bir satınalma siparişine bağlıysa —
        // o siparişin odemePlani.odemeKalemleri listesine OTOMATİK eklenir.
        const tedarikciId = document.getElementById('to-tedarikci').value;
        const ilgiliSiparisler = tedarikciId ? acikSatinalmaSiparisleri.filter(s => s.tedarikciId === tedarikciId) : [];
        wrap.innerHTML = `
          <div class="frow">
            <div class="fgroup"><label class="flbl">Çek Vade Tarihi</label><input class="finput" id="to-cek-tarih" type="date"></div>
            <div class="fgroup"><label class="flbl">Çek Numarası</label><input class="finput" id="to-cek-no"></div>
            <div class="fgroup"><label class="flbl">Tutar (₺)</label><input class="finput" id="to-tutar" type="number" step="0.01"></div>
          </div>
          ${ilgiliSiparisler.length ? `<div class="fgroup"><label class="flbl">İlişkilendirilecek Satınalma Siparişi (Opsiyonel)</label>
            <select class="fselect" id="to-ilgili-siparis">
              <option value="">— Sadece kasa kaydı, siparişe bağlama —</option>
              ${ilgiliSiparisler.map(s => `<option value="${s.id}">${s.kod} — ${App.fmtTL(s.toplamTRY)}</option>`).join('')}
            </select>
          </div>
          <div class="fhint">Bir sipariş seçilirse, bu çek bilgisi o siparişin ödeme planına da otomatik eklenir.</div>` : ''}
        `;
        document.getElementById('to-tutar').oninput = renderBakiyeOzet;
      } else {
        wrap.innerHTML = `
          <div class="frow">
            <div class="fgroup"><label class="flbl">Tarih</label><input class="finput" id="to-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
            <div class="fgroup"><label class="flbl">Tutar (₺)</label><input class="finput" id="to-tutar" type="number" step="0.01"></div>
          </div>
          <div class="fgroup"><label class="flbl">Açıklama (Opsiyonel)</label><input class="finput" id="to-aciklama" placeholder="örn. Suntalam alımı ödemesi"></div>
        `;
        document.getElementById('to-tutar').oninput = renderBakiyeOzet;
      }
      renderBakiyeOzet();
    }
    renderYontemDetay();
    document.querySelectorAll('#to-yontem-tabs .tab').forEach(tab => tab.onclick = () => {
      document.querySelectorAll('#to-yontem-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      aktifYontem = tab.dataset.yontem;
      renderYontemDetay();
    });

    document.getElementById('to-save').onclick = async () => {
      const tedarikciId = document.getElementById('to-tedarikci').value;
      if (!tedarikciId) { App.toast('Tedarikçi seçmelisiniz', 'err'); return; }
      const tedarikci = tedarikciler.find(t => t.id === tedarikciId);

      let tutar, detay, cekId = null, kendiCekBilgisi = null, ilgiliSiparisId = null;
      if (aktifYontem === 'cek_ciro') {
        const secim = document.getElementById('to-cek-secim');
        if (!secim || !secim.value) { App.toast('Ciro edilecek çek seçmelisiniz', 'err'); return; }
        cekId = secim.value;
        const cek = elindekiCekler.find(c => c.id === cekId);
        tutar = cek.tutar;
        detay = 'Müşteri: ' + cek.musteriAdi + ', Çek No: ' + cek.cekNo + ', Vade: ' + cek.vadeTarihi;
      } else if (aktifYontem === 'kendi_cekimiz') {
        tutar = parseFloat(document.getElementById('to-tutar').value) || 0;
        if (tutar <= 0) { App.toast('Geçerli bir tutar girin', 'err'); return; }
        const cekTarih = document.getElementById('to-cek-tarih').value;
        const cekNo = document.getElementById('to-cek-no').value.trim();
        if (!cekTarih) { App.toast('Çek vade tarihi zorunlu', 'err'); return; }
        kendiCekBilgisi = { tarih: cekTarih, cekNo, tutar };
        detay = 'Kendi Çekimiz — Çek No: ' + (cekNo || '—') + ', Vade: ' + cekTarih;
        const ilgiliSiparisSecim = document.getElementById('to-ilgili-siparis');
        ilgiliSiparisId = ilgiliSiparisSecim ? (ilgiliSiparisSecim.value || null) : null;
      } else {
        tutar = parseFloat(document.getElementById('to-tutar').value) || 0;
        if (tutar <= 0) { App.toast('Geçerli bir tutar girin', 'err'); return; }
        detay = document.getElementById('to-aciklama').value.trim();
      }

      await App.persist(async () => {
        const tedarikciOdemeleri = await Store.tedarikciOdemeleri.all();
        tedarikciOdemeleri.push({
          id: App.uid('TO'), tarih: (aktifYontem === 'cek_ciro') ? new Date().toISOString().slice(0, 10) : (aktifYontem === 'kendi_cekimiz' ? new Date().toISOString().slice(0, 10) : document.getElementById('to-tarih').value),
          tedarikciId, tedarikciAdi: tedarikci ? tedarikci.unvan : '—',
          tip: aktifYontem, detay, tutar, cekId
        });
        await Store.tedarikciOdemeleri.save(tedarikciOdemeleri);

        // Çek ciro edildiyse, musteriCekleri'nde KALICI olarak "ciro_edildi"
        // yapılır — bu listeden çıkar, bir daha başka ödemede seçilemez.
        if (cekId) {
          const guncelCekler = await Store.musteriCekleri.all();
          const cekKaydi = guncelCekler.find(c => c.id === cekId);
          if (cekKaydi) {
            cekKaydi.durum = 'ciro_edildi';
            cekKaydi.ciroTarihi = new Date().toISOString().slice(0, 10);
            cekKaydi.ciroEdilenTedarikciId = tedarikciId;
            cekKaydi.ciroEdilenTedarikciAdi = tedarikci ? tedarikci.unvan : '—';
            await Store.musteriCekleri.save(guncelCekler);
          }
        }

        // KENDİ ÇEKİMİZ → ÇEK PORTFÖYÜNE (giden çek) yazılır. Böylece vadesi
        // takip edilir, nakit ÇIKIŞ projeksiyonuna girer ve vadesinde
        // "Ödendi" işaretlenebilir. (Önceden çek yalnızca ödeme satırıydı;
        // vadesi ve nakit etkisi izlenemiyordu.)
        if (kendiCekBilgisi) {
          const firmaCekleri = await Store.firmaCekleri.all();
          firmaCekleri.push({
            id: App.uid('FCK'), cekNo: kendiCekBilgisi.cekNo || '—',
            tutar: kendiCekBilgisi.tutar, vadeTarihi: kendiCekBilgisi.tarih,
            tedarikciId, tedarikciAdi: tedarikci ? tedarikci.unvan : '—',
            aciklama: 'Tedarikçi ödemesinden oluşturuldu',
            ilgiliSiparisId: ilgiliSiparisId || null,
            durum: 'beklemede', olusturmaTarihi: new Date().toISOString().slice(0, 10)
          });
          await Store.firmaCekleri.save(firmaCekleri);
        }

        // KULLANICI İSTEĞİ: Kendi çekimizle ödeme yapıldıysa ve bir satınalma
        // siparişiyle ilişkilendirildiyse, bu çek bilgisi o siparişin
        // odemePlani.odemeKalemleri listesine de OTOMATİK eklenir.
        if (kendiCekBilgisi && ilgiliSiparisId) {
          const guncelSiparisler = await Store.satinalmaSiparisleri.all();
          const ilgiliSiparis = guncelSiparisler.find(s => s.id === ilgiliSiparisId);
          if (ilgiliSiparis) {
            if (!ilgiliSiparis.odemePlani) ilgiliSiparis.odemePlani = { pesinatTutar: 0, odemeKalemleri: [] };
            if (!ilgiliSiparis.odemePlani.odemeKalemleri) ilgiliSiparis.odemePlani.odemeKalemleri = [];
            ilgiliSiparis.odemePlani.odemeKalemleri.push({
              id: App.uid('ODK'), tip: 'cek', tarih: kendiCekBilgisi.tarih, cekNo: kendiCekBilgisi.cekNo, tutar: kendiCekBilgisi.tutar,
              kendiCekimiz: true, aciklama: 'Kendi çekimiz (Tedarikçi Ödemeleri\'nden eklendi)'
            });
            await Store.satinalmaSiparisleri.save(guncelSiparisler);
          }
        }
      });

      App.toast('Tedarikçi ödemesi kaydedildi: ' + App.fmtTL(tutar), 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // ── TAHSİLAT YAP: MEVCUT ÖDEME PLANI FORMUNU mod:'tahsilat' İLE AÇAR ──────
  // KULLANICI KARARI: Artık ayrı/basit bir form değil — sipariş onayında
  // kullanılan AYNI Ödeme Planı formu (Çek/Kredi Kartı + taksit/Nakit/Diğer
  // sekmeleri) kullanılır. Kaydedildiğinde tahsilat ANINDA işlenmez,
  // App.tahsilatOdemePlaniOnayaGonder ile "onay bekliyor" listesine düşer —
  // Yönetim Onayı ekranından onaylanmadan kasaya/cariye hiçbir şey girmez.
  function openTahsilatForm(musteriler, onSaved, onceSeciliMusteriId) {
    let seciliMusteriId = onceSeciliMusteriId || '';
    function ekranAc() {
      const musteri = musteriler.find(m => m.id === seciliMusteriId);
      const mevcutBakiye = musteri ? (musteri.bakiye || 0) : 0;
      const musteriSeciciHtml = `
        <div class="fgroup"><label class="flbl">Müşteri</label>
          <select class="fselect" id="th-musteri">
            <option value="">— Seçin —</option>
            ${musteriler.map(m => `<option value="${m.id}" ${seciliMusteriId === m.id ? 'selected' : ''}>${App.escapeHtml(m.unvan)}</option>`).join('')}
          </select>
        </div>
        ${musteri ? `<div class="grid grid-2" style="margin-bottom:10px">
          <div class="kpi"><div class="kpi-lbl">Mevcut Bakiye</div><div class="kpi-val ${mevcutBakiye > 0 ? 'red' : 'green'}">${App.fmtTL(mevcutBakiye)}</div></div>
          <div class="kpi"><div class="kpi-lbl">Durum</div><div class="kpi-val">${mevcutBakiye > 0 ? 'Müşteri Borçlu' : 'Borç Yok'}</div></div>
        </div>` : '<div class="fhint" style="margin-bottom:10px">Tahsilat girmek için önce müşteri seçin.</div>'}
      `;
      if (!musteri) {
        // Müşteri seçilmeden form gösterilemez (sahte sipariş objesi için
        // musteriId zorunlu) — basit bir seçim ekranı göster, seçilince devam et.
        const body = document.createElement('div');
        body.innerHTML = musteriSeciciHtml;
        App.openModal({ title: 'Tahsilat Yap', body, footer: `<button class="btn" id="th-cancel">Vazgeç</button><button class="btn btn-blue" id="th-devam">Devam Et</button>` });
        document.getElementById('th-cancel').onclick = App.closeModal;
        document.getElementById('th-devam').onclick = () => {
          const sel = document.getElementById('th-musteri').value;
          if (!sel) { App.toast('Müşteri seçmelisiniz', 'err'); return; }
          seciliMusteriId = sel;
          App.closeModal();
          ekranAc();
        };
        return;
      }

      const sahteSiparis = { id: musteri.id, kod: musteri.unvan, musteriId: musteri.id, musteriAdi: musteri.unvan, toplam: mevcutBakiye, odemePlani: null };
      App.siparisIcerikVeOdemeFormuAc(sahteSiparis, {
        mod: 'tahsilat',
        duzenlenebilir: true,
        baslikOnEki: 'Tahsilat Yap: ',
        baslikSub: musteri.unvan,
        icerikHtml: musteriSeciciHtml,
        onaylaButonMetni: 'Yönetim Onayına Gönder',
        onOnayla: async (odemePlani) => {
          await App.persist(() => App.tahsilatOdemePlaniOnayaGonder(musteri.id, musteri.unvan, odemePlani));
          App.toast('Tahsilat kaydı Yönetim onayına gönderildi: ' + musteri.unvan, 'ok');
          onSaved();
        }
      });
      // Form açıldıktan sonra müşteri değiştirme seçeneği (formun içindeki
      // select elementine event bağla — icerikHtml içinde render edilir).
      setTimeout(() => {
        const sel = document.getElementById('th-musteri');
        if (sel) sel.onchange = () => { seciliMusteriId = sel.value; App.closeModal(); ekranAc(); };
      }, 0);
    }
    ekranAc();
  }

  // ── ALACAK TAKVİMİ — günlük bazlı vade dağılımı + grafik ───────────────────
  // Müşteri bakiyeleri (basit, vade bilgisi olmayan açık alacak), çek/diğer
  // alacak vadeleri (siparişlerin odemePlani'ndan, GELİR olarak), vadesi
  // geçenler GÜN olarak (negatif/gecikme), banka kredisi taksitleri ÇIKIŞ
  // (gider, "-" olarak) gösterilir.
  // ── ALACAK TAKVİMİ ────────────────────────────────────────────────────────
  // KRİTİK: Bu takvim artık siparişin HAM ödeme planından değil, Tahsilat
  // ekranındaki AYNI `tahsilatBeklenenler` koleksiyonundan beslenir — yani
  // burası ile Muhasebe Panel → Tahsilatlar sekmesi TAMAMEN AYNI veriyi
  // gösterir, sadece görünüm (tarih bazlı takvim) farklıdır. Bir çekin/
  // ödeme kaleminin tahsilatı yapılmışsa, buradan da "✓ Onayla" ile
  // onaylanabilir — onaylandığında AYNI App.tahsilatBeklenenOnayla()
  // çağrılır: bakiyeden düşer, çek ise "elde" (kasaya girmiş) listeye eklenir.
  function renderAlacakTakvimiTab(tahsilatBeklenenler, bankaKredileri) {
    const bugun = new Date();
    const takvimGirdileri = []; // {tarih, tip:'alacak'|'kredi_taksit', tutar, aciklama, gecikmisGun, tahsilatBeklenenId, durum}

    tahsilatBeklenenler.filter(t => t.durum === 'onay_bekliyor').forEach(t => {
      if (!t.tarih) return;
      const vade = new Date(t.tarih);
      const gecikmisGun = vade < bugun ? Math.floor((bugun - vade) / 86400000) : 0;
      const tipLabel = { cek: 'Çek ' + (t.cekNo || ''), kredi_karti: 'Kredi Kartı', nakit: 'Nakit', pesinat: 'Peşinat', diger: 'Diğer' };
      takvimGirdileri.push({
        tarih: t.tarih, tip: 'alacak', tutar: t.tutar,
        aciklama: (t.musteriAdi || '') + ' — ' + (tipLabel[t.tip] || t.tip),
        gecikmisGun, kaynak: t.faturaNo, tahsilatBeklenenId: t.id, odemeTipi: t.tip
      });
    });

    bankaKredileri.forEach(kr => {
      (kr.taksitler || []).forEach(t => {
        if (t.odendi) return;
        const vade = new Date(t.tarih);
        const gecikmisGun = vade < bugun ? Math.floor((bugun - vade) / 86400000) : 0;
        takvimGirdileri.push({ tarih: t.tarih, tip: 'kredi_taksit', tutar: t.tutar, aciklama: kr.bankaAdi + ' Kredi Taksiti', gecikmisGun, kaynak: kr.kod });
      });
    });

    takvimGirdileri.sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));

    const vadesiGecenAlacaklar = takvimGirdileri.filter(g => g.tip === 'alacak' && g.gecikmisGun > 0);
    const vadesiGecenKrediler = takvimGirdileri.filter(g => g.tip === 'kredi_taksit' && g.gecikmisGun > 0);
    const toplamAlacak = takvimGirdileri.filter(g => g.tip === 'alacak').reduce((a, g) => a + g.tutar, 0);
    const toplamKrediBorcu = takvimGirdileri.filter(g => g.tip === 'kredi_taksit').reduce((a, g) => a + g.tutar, 0);

    // Aylık bazlı toplam (grafik için basit bir gösterim — bar şeklinde tablo)
    const aylikToplam = new Map();
    takvimGirdileri.forEach(g => {
      const ay = (g.tarih || '').slice(0, 7);
      if (!aylikToplam.has(ay)) aylikToplam.set(ay, { alacak: 0, kredi: 0 });
      const o = aylikToplam.get(ay);
      if (g.tip === 'alacak') o.alacak += g.tutar; else o.kredi += g.tutar;
    });
    const maxDeger = Math.max(1, ...[...aylikToplam.values()].map(o => Math.max(o.alacak, o.kredi)));

    let html = `<div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Toplam Gelecek Alacak</div><div class="kpi-val green">${App.fmtTL(toplamAlacak)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Vadesi Geçen Alacak</div><div class="kpi-val red">${App.fmtTL(vadesiGecenAlacaklar.reduce((a,g)=>a+g.tutar,0))}</div></div>
      <div class="kpi"><div class="kpi-lbl">Toplam Kredi Borcu</div><div class="kpi-val amber">${App.fmtTL(toplamKrediBorcu)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Vadesi Geçen Kredi Taksiti</div><div class="kpi-val red">${App.fmtTL(vadesiGecenKrediler.reduce((a,g)=>a+g.tutar,0))}</div></div>
    </div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Aylık Bazlı Alacak / Kredi Borcu Grafiği</div></div>`;
    if (!aylikToplam.size) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz vade kaydı yok.</div></div>`;
    } else {
      html += `<div style="display:flex;flex-direction:column;gap:8px">`;
      [...aylikToplam.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([ay, o]) => {
        const alacakYuzde = (o.alacak / maxDeger) * 100;
        const krediYuzde = (o.kredi / maxDeger) * 100;
        html += `<div>
          <div style="font-size:11px;font-weight:700;margin-bottom:2px">${ay}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <div style="width:90px;font-size:10px;color:var(--green-text)">Alacak</div>
            <div style="flex:1;background:var(--bg);border-radius:3px;height:14px;overflow:hidden"><div style="width:${alacakYuzde}%;background:var(--green-text);height:100%"></div></div>
            <div style="width:90px;font-size:10px;text-align:right">${App.fmtTL(o.alacak)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:90px;font-size:10px;color:var(--amber-text)">Kredi Borcu</div>
            <div style="flex:1;background:var(--bg);border-radius:3px;height:14px;overflow:hidden"><div style="width:${krediYuzde}%;background:var(--amber-text);height:100%"></div></div>
            <div style="width:90px;font-size:10px;text-align:right">${App.fmtTL(o.kredi)}</div>
          </div>
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Gün Gün Tarihli Vade Takvimi</div></div>
      <div class="fhint" style="margin-bottom:8px">Çek/nakit/kredi kartı tahsilatı fiilen yapılmışsa, ilgili satırı buradan "✓ Onayla" ile onaylayabilirsiniz — bu, Tahsilatlar sekmesinden onaylamakla TAMAMEN AYNI işlemdir (bakiyeden düşer, çek ise kasaya/elde listesine girer).</div>`;
    if (!takvimGirdileri.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz vade kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Vade Tarihi</th><th>Tip</th><th>Açıklama</th><th class="r">Tutar</th><th>Durum</th><th></th></tr>`;
      takvimGirdileri.forEach(g => {
        html += `<tr style="${g.gecikmisGun > 0 ? 'background:var(--red-bg)' : ''}">
          <td style="font-size:11px">${g.tarih}</td>
          <td><span class="pill ${g.tip === 'alacak' ? 'pill-green' : 'pill-amber'}">${g.tip === 'alacak' ? 'Alacak (Gelir)' : 'Kredi Taksiti (Gider)'}</span></td>
          <td style="font-size:11.5px">${App.escapeHtml(g.aciklama)}</td>
          <td class="r"><b style="color:${g.tip === 'alacak' ? 'var(--green-text)' : 'var(--red-text)'}">${g.tip === 'alacak' ? '+' : '-'}${App.fmtTL(g.tutar)}</b></td>
          <td>${g.gecikmisGun > 0 ? '<span class="pill pill-red">-' + g.gecikmisGun + ' gün (vadesi geçti)</span>' : '<span class="pill pill-gray">Bekliyor</span>'}</td>
          <td>${g.tahsilatBeklenenId ? `<button class="btn btn-sm btn-green at-onayla" data-id="${g.tahsilatBeklenenId}">✓ Onayla</button>` : ''}</td>
        </tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireAlacakTakvimiTab(tahsilatBeklenenler, render, main) {
    document.querySelectorAll('.at-onayla').forEach(b => b.onclick = () => {
      const t = tahsilatBeklenenler.find(x => x.id === b.dataset.id);
      App.confirmDialog(`${App.fmtTL(t.tutar)} tutarındaki bu tahsilatı ONAYLIYOR musunuz? Onaylandığında cari bakiyeden düşülecek${t.tip === 'cek' ? ' ve çek kasaya (elde çekler listesine) girecektir' : ''}.`, async () => {
        await App.persist(() => App.tahsilatBeklenenOnayla(t.id));
        App.toast('Tahsilat onaylandı: ' + App.fmtTL(t.tutar), 'ok');
        render(main);
      });
    });
  }

  // ── BANKA KREDİLERİ ─────────────────────────────────────────────────────
  function renderKrediTab(bankaKredileri) {
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Banka Kredileri</div>
        <button class="btn btn-sm btn-blue" id="mh-kredi-ekle">+ Kredi Tanımla</button>
      </div>`;
    if (!bankaKredileri.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz kredi tanımlanmadı.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Kod</th><th>Banka</th><th class="r">Kredi Tutarı</th><th class="r">Faiz Oranı</th><th class="r">Taksit Sayısı</th><th class="r">Ödenen</th><th class="r">Kalan Borç</th></tr>`;
      bankaKredileri.forEach(kr => {
        const odenenTaksit = (kr.taksitler || []).filter(t => t.odendi).length;
        const odenenTutar = (kr.taksitler || []).filter(t => t.odendi).reduce((a, t) => a + t.tutar, 0);
        const kalanBorc = (kr.taksitler || []).filter(t => !t.odendi).reduce((a, t) => a + t.tutar, 0);
        html += `<tr><td class="mono">${kr.kod}</td><td>${App.escapeHtml(kr.bankaAdi)}</td>
          <td class="r">${App.fmtTL(kr.krediTutari)}</td><td class="r">%${kr.faizOrani}</td>
          <td class="r">${odenenTaksit} / ${(kr.taksitler || []).length}</td>
          <td class="r">${App.fmtTL(odenenTutar)}</td><td class="r"><b style="color:var(--amber-text)">${App.fmtTL(kalanBorc)}</b></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    // Tüm taksit detayları
    html += `<div class="card"><div class="card-hdr"><div class="card-title">Tüm Kredi Taksitleri (Vade Tarihli)</div></div>`;
    const tumTaksitler = [];
    bankaKredileri.forEach(kr => (kr.taksitler || []).forEach((t, i) => tumTaksitler.push({ ...t, krediKod: kr.kod, bankaAdi: kr.bankaAdi, index: i, krediId: kr.id })));
    tumTaksitler.sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));
    if (!tumTaksitler.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Taksit yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Vade Tarihi</th><th>Kredi</th><th class="r">Taksit Tutarı</th><th>Durum</th><th></th></tr>`;
      tumTaksitler.forEach(t => {
        html += `<tr><td style="font-size:11px">${t.tarih}</td><td>${App.escapeHtml(t.bankaAdi)} (${t.krediKod})</td>
          <td class="r">${App.fmtTL(t.tutar)}</td>
          <td>${t.odendi ? '<span class="pill pill-green">Ödendi</span>' : '<span class="pill pill-amber">Bekliyor</span>'}</td>
          <td>${!t.odendi ? `<button class="btn btn-sm mh-taksit-odendi" data-kredi="${t.krediId}" data-index="${t.index}">Ödendi İşaretle</button>` : ''}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireKrediTab(render, main) {
    document.getElementById('mh-kredi-ekle').onclick = () => openKrediForm(() => render(main));
    document.querySelectorAll('.mh-taksit-odendi').forEach(b => b.onclick = async () => {
      const bankaKredileri = await Store.bankaKredileri.all();
      const kr = bankaKredileri.find(k => k.id === b.dataset.kredi);
      if (kr) {
        kr.taksitler[parseInt(b.dataset.index)].odendi = true;
        await App.persist(() => Store.bankaKredileri.save(bankaKredileri));
        const taksit = kr.taksitler[parseInt(b.dataset.index)];
        await App.persist(() => App.muhasebeKaydiOlustur({
          tip: 'gider', kategori: 'kredi_taksiti', aciklama: kr.bankaAdi + ' kredi taksiti ödendi (' + kr.kod + ')',
          tutar: taksit.tutar, matrah: taksit.tutar, kdvOrani: 0, kdvTutari: 0, kaynakId: kr.id, kaynakTip: 'banka_kredisi'
        }));
        App.toast('Taksit ödendi olarak işaretlendi', 'ok');
        render(main);
      }
    });
  }

  function openKrediForm(onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup"><label class="flbl">Banka Adı</label><input class="finput" id="kr-banka"></div>
        <div class="fgroup"><label class="flbl">Kredi Tutarı (₺)</label><input class="finput" id="kr-tutar" type="number"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Faiz Oranı (%, aylık)</label><input class="finput" id="kr-faiz" type="number" step="0.1"></div>
        <div class="fgroup"><label class="flbl">Taksit Sayısı</label><input class="finput" id="kr-taksitsayisi" type="number" value="12"></div>
      </div>
      <div class="fgroup"><label class="flbl">İlk Taksit Tarihi</label><input class="finput" id="kr-ilktarih" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    `;
    const footer = `<button class="btn" id="kr-cancel">Vazgeç</button><button class="btn btn-blue" id="kr-confirm">Krediyi Tanımla</button>`;
    App.openModal({ title: 'Banka Kredisi Tanımla', body, footer, wide: true });
    document.getElementById('kr-cancel').onclick = App.closeModal;
    document.getElementById('kr-confirm').onclick = async () => {
      const krediTutari = parseFloat(document.getElementById('kr-tutar').value);
      const taksitSayisi = parseInt(document.getElementById('kr-taksitsayisi').value) || 12;
      const bankaAdi = document.getElementById('kr-banka').value.trim();
      if (!bankaAdi || !krediTutari) { App.toast('Banka adı ve kredi tutarı zorunlu', 'err'); return; }
      const ilkTarih = new Date(document.getElementById('kr-ilktarih').value);
      const faizOrani = parseFloat(document.getElementById('kr-faiz').value) || 0;
      const taksitTutari = (krediTutari * (1 + (faizOrani / 100) * taksitSayisi)) / taksitSayisi;
      const taksitler = [];
      for (let i = 0; i < taksitSayisi; i++) {
        const tarih = new Date(ilkTarih); tarih.setMonth(tarih.getMonth() + i);
        taksitler.push({ tarih: tarih.toISOString().slice(0, 10), tutar: taksitTutari, odendi: false });
      }
      const kredi = { id: App.uid('KRD'), kod: 'KRD-' + Date.now().toString(36).toUpperCase(), bankaAdi, krediTutari, faizOrani, taksitSayisi, taksitler, tarih: new Date().toISOString().slice(0,10) };
      await App.persist(() => Store.bankaKredileri.upsert(kredi));
      App.toast('Kredi tanımlandı: ' + kredi.kod, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function renderOzetTab(muhasebeKayitlari) {
    const buAy = new Date().toISOString().slice(0, 7);
    const buYil = new Date().getFullYear().toString();

    function topla(kayitlar, tip) { return kayitlar.filter(k => k.tip === tip).reduce((a, k) => a + (k.tutar || 0), 0); }
    const buAyKayitlari = muhasebeKayitlari.filter(k => (k.tarih || '').startsWith(buAy));
    const buYilKayitlari = muhasebeKayitlari.filter(k => (k.tarih || '').startsWith(buYil));

    const buAyGelir = topla(buAyKayitlari, 'gelir'), buAyGider = topla(buAyKayitlari, 'gider');
    const buYilGelir = topla(buYilKayitlari, 'gelir'), buYilGider = topla(buYilKayitlari, 'gider');
    const tumGelir = topla(muhasebeKayitlari, 'gelir'), tumGider = topla(muhasebeKayitlari, 'gider');

    let html = `<div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Bu Ay Gelir</div><div class="kpi-val green">${App.fmtTL(buAyGelir)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Bu Ay Gider</div><div class="kpi-val red">${App.fmtTL(buAyGider)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Bu Ay Net</div><div class="kpi-val ${buAyGelir - buAyGider >= 0 ? 'green' : 'red'}">${App.fmtTL(buAyGelir - buAyGider)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Bu Ay Kâr Marjı</div><div class="kpi-val blue">${buAyGelir > 0 ? App.fmtPct((buAyGelir - buAyGider) / buAyGelir * 100) : '—'}</div></div>
    </div>`;

    html += `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Bu Yıl Toplam Gelir</div><div class="kpi-val green">${App.fmtTL(buYilGelir)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Bu Yıl Toplam Gider</div><div class="kpi-val red">${App.fmtTL(buYilGider)}</div></div>
      <div class="kpi"><div class="kpi-lbl">Bu Yıl Net Kâr/Zarar</div><div class="kpi-val ${buYilGelir - buYilGider >= 0 ? 'green' : 'red'}">${App.fmtTL(buYilGelir - buYilGider)}</div></div>
    </div>`;

    // Kategori bazlı gider dağılımı
    const giderKategorileri = new Map();
    muhasebeKayitlari.filter(k => k.tip === 'gider' && (k.tarih || '').startsWith(buYil)).forEach(k => {
      giderKategorileri.set(k.kategori, (giderKategorileri.get(k.kategori) || 0) + k.tutar);
    });
    html += `<div class="card"><div class="card-hdr"><div class="card-title">Bu Yıl Gider Dağılımı (Kategori Bazlı)</div></div>`;
    if (!giderKategorileri.size) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Bu yıl gider kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Kategori</th><th class="r">Toplam</th><th class="r">% Pay</th></tr>`;
      [...giderKategorileri.entries()].sort((a, b) => b[1] - a[1]).forEach(([kat, tutar]) => {
        html += `<tr><td>${GIDER_KATEGORI_LABEL[kat] || kat}</td><td class="r"><b>${App.fmtTL(tutar)}</b></td><td class="r">${App.fmtPct(buYilGider > 0 ? tutar / buYilGider * 100 : 0)}</td></tr>`;
      });
      html += `<tr class="total-row"><td>TOPLAM</td><td class="r">${App.fmtTL(buYilGider)}</td><td></td></tr>`;
      html += `</table>`;
    }
    html += `</div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Tüm Zamanlar Özet</div></div>
      <table class="dtable"><tr><td>Toplam Gelir</td><td class="r"><b>${App.fmtTL(tumGelir)}</b></td></tr>
      <tr><td>Toplam Gider</td><td class="r"><b>${App.fmtTL(tumGider)}</b></td></tr>
      <tr class="total-row"><td>NET KÂR/ZARAR</td><td class="r" style="color:${tumGelir - tumGider >= 0 ? 'var(--green-text)' : 'var(--red-text)'}">${App.fmtTL(tumGelir - tumGider)}</td></tr>
      </table></div>`;
    return html;
  }

  // ── KDV HESABI (HESAPLANAN - İNDİRİLECEK = ÖDENECEK/İADE) ─────────────────
  // Hesaplanan KDV: satış faturalarındaki KDV (gelir tarafı, kalem bazlı
  // oranlara göre çoktan ayrıştırılmıştır). İndirilecek KDV: hammadde/hizmet
  // alımlarındaki KDV (gider tarafı). Fark pozitifse "Ödenecek KDV", negatifse
  // "Devreden/İade Edilebilir KDV" olarak gösterilir — TR KDV mevzuatının
  // temel mantığı budur, ama bu basitleştirilmiş bir gösterimdir.
  function renderKdvTab(muhasebeKayitlari, faturalar) {
    const ayKayitlari = muhasebeKayitlari.filter(k => (k.tarih || '').startsWith(seciliAy));
    const hesaplananKdv = ayKayitlari.filter(k => k.tip === 'gelir').reduce((a, k) => a + (k.kdvTutari || 0), 0);
    const indirilecekKdv = ayKayitlari.filter(k => k.tip === 'gider').reduce((a, k) => a + (k.kdvTutari || 0), 0);
    const fark = hesaplananKdv - indirilecekKdv;

    let html = `<div class="card">
      <div class="fgroup" style="max-width:220px"><label class="flbl">Ay Seçin</label><input class="finput" id="mh-ay-secim" type="month" value="${seciliAy}"></div>
    </div>`;

    html += `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Hesaplanan KDV (Satışlardan)</div><div class="kpi-val blue">${App.fmtTL(hesaplananKdv)}</div></div>
      <div class="kpi"><div class="kpi-lbl">İndirilecek KDV (Alımlardan)</div><div class="kpi-val purple">${App.fmtTL(indirilecekKdv)}</div></div>
      <div class="kpi"><div class="kpi-lbl">${fark >= 0 ? 'Ödenecek KDV' : 'Devreden KDV'}</div><div class="kpi-val ${fark >= 0 ? 'red' : 'green'}">${App.fmtTL(Math.abs(fark))}</div></div>
    </div>`;

    const ayinFaturalari = faturalar.filter(f => (f.tarih || '').startsWith(seciliAy));
    html += `<div class="card"><div class="card-hdr"><div class="card-title">${seciliAy} Ayı Satış Faturaları — KDV Detayı</div></div>`;
    if (!ayinFaturalari.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Bu ay fatura kesilmedi.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Fatura No</th><th>Müşteri</th><th class="r">Matrah</th><th>KDV Oranları</th><th class="r">KDV Tutarı</th><th class="r">Genel Toplam</th></tr>`;
      ayinFaturalari.forEach(f => {
        const kdvDetayMetni = (f.kdvDetaylari || []).length > 1 ? f.kdvDetaylari.map(d => `%${d.oran}`).join(', ') : (f.kdvOrani != null ? '%' + f.kdvOrani : '—');
        html += `<tr><td class="mono">${f.faturaNo}</td><td>${App.escapeHtml(f.musteriAdi)}</td>
          <td class="r">${App.fmtTL(f.matrah)}</td><td>${kdvDetayMetni}</td>
          <td class="r">${App.fmtTL(f.kdvTutari)}</td><td class="r"><b>${App.fmtTL(f.genelToplam)}</b></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    const ayinGiderleri = ayKayitlari.filter(k => k.tip === 'gider' && k.kdvTutari > 0);
    html += `<div class="card"><div class="card-hdr"><div class="card-title">${seciliAy} Ayı KDV'li Alımlar (İndirilecek KDV)</div></div>`;
    if (!ayinGiderleri.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Bu ay KDV'li alım kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Açıklama</th><th class="r">Matrah</th><th class="r">KDV Oranı</th><th class="r">KDV Tutarı</th></tr>`;
      ayinGiderleri.forEach(k => {
        html += `<tr><td style="font-size:11.5px">${App.escapeHtml(k.aciklama)}</td><td class="r">${App.fmtTL(k.matrah)}</td><td class="r">%${k.kdvOrani}</td><td class="r">${App.fmtTL(k.kdvTutari)}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    html += `<div class="fhint">⚠ Bu hesap basitleştirilmiş bir ön gösterimdir; KDV2, tevkifat, istisna gibi özel durumları içermez. Resmi KDV beyannamesi için mali müşavirinize danışın.</div>`;
    return html;
  }

  function wireKdvTab(render, main) {
    document.getElementById('mh-ay-secim').onchange = (e) => { seciliAy = e.target.value; render(main); };
  }

  function renderHareketlerTab(muhasebeKayitlari) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Tüm Gelir/Gider Hareketleri</div></div>`;
    if (!muhasebeKayitlari.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz hareket yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>Tip</th><th>Kategori</th><th>Açıklama</th><th class="r">Matrah</th><th class="r">KDV</th><th class="r">Tutar</th></tr>`;
      [...muhasebeKayitlari].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(k => {
        const katLabel = k.tip === 'gelir' ? (GELIR_KATEGORI_LABEL[k.kategori] || k.kategori) : (GIDER_KATEGORI_LABEL[k.kategori] || k.kategori);
        html += `<tr><td style="font-size:11px">${k.tarih}</td>
          <td><span class="pill ${k.tip === 'gelir' ? 'pill-green' : 'pill-red'}">${k.tip === 'gelir' ? 'Gelir' : 'Gider'}</span></td>
          <td style="font-size:11px">${katLabel}</td>
          <td style="font-size:11.5px">${App.escapeHtml(k.aciklama || '')}</td>
          <td class="r">${k.matrah != null ? App.fmtTL(k.matrah) : '—'}</td>
          <td class="r">${k.kdvTutari ? App.fmtTL(k.kdvTutari) : '—'}</td>
          <td class="r"><b style="color:${k.tip === 'gelir' ? 'var(--green-text)' : 'var(--red-text)'}">${App.fmtTL(k.tutar)}</b></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function renderAmortismanTab(makinalar) {
    const aktifMakinalar = makinalar.filter(m => m.durum === 'aktif');
    let toplamYillikAmortisman = 0;
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Makina/Teçhizat Amortisman Gideri (Vergi Matrahını Düşüren Kalem)</div></div>
      <div class="fhint" style="margin-bottom:8px">Amortisman, nakit çıkışı olmayan ama vergi matrahını düşüren bir gider kalemidir. Buradaki tutarlar Bakım modülündeki makina kayıtlarından (alış fiyatı ÷ amortisman yılı) anlık hesaplanır, ayrıca bir muhasebe hareketi olarak kaydedilmez.</div>
      <table class="dtable"><tr><th>Makina</th><th class="r">Alış Fiyatı</th><th class="r">Amortisman Yılı</th><th class="r">Yıllık Amortisman Gideri</th></tr>`;
    aktifMakinalar.forEach(m => {
      const yillik = (m.alisFiyati || 0) / (m.amortismanYili || 10);
      toplamYillikAmortisman += yillik;
      html += `<tr><td>${App.escapeHtml(m.ad)}</td><td class="r">${App.fmtTL(m.alisFiyati)}</td><td class="r">${m.amortismanYili || 10} yıl</td><td class="r"><b>${App.fmtTL(yillik)}</b></td></tr>`;
    });
    html += `<tr class="total-row"><td colspan="3">TOPLAM YILLIK AMORTİSMAN GİDERİ</td><td class="r">${App.fmtTL(toplamYillikAmortisman)}</td></tr>`;
    html += `</table></div>`;
    return html;
  }

  // ── DIŞA AÇIK API: Cari Panel'den (müşteri/tedarikçi detay sayfasından)
  // "Tahsilat Yap" / "Ödeme Yap" butonlarıyla doğrudan çağrılır — gerekli
  // listeleri (müşteriler/tedarikçiler/çekler) kendi içinde taze çeker,
  // ilgili formu ÖNCEDEN SEÇİLİ müşteri/tedarikçi ile açar.
  async function tahsilatYapAc(musteriId, onSaved) {
    const musteriler = await Store.musteriler.all();
    openTahsilatForm(musteriler, onSaved, musteriId);
  }
  async function odemeYapAc(tedarikciId, onSaved) {
    const [tedarikciler, musteriCekleri] = await Promise.all([Store.tedarikciler.all(), Store.musteriCekleri.all()]);
    openTedarikciOdemeForm(tedarikciler, musteriCekleri, onSaved, tedarikciId);
  }

  return { render, tahsilatYapAc, odemeYapAc };
})();
