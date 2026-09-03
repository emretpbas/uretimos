// ════════════════════════════════════════════════════════════════════════════
// SEVKİYAT & İRSALİYE — irsaliye düzenleme, haftalık sevkiyat programı
// ════════════════════════════════════════════════════════════════════════════
PageModules.sevkiyat_panel = (() => {
  let activeTab = 'irsaliye';

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const [siparisler, irsaliyeler, sevkiyatProgrami, faturalar] = await Promise.all([
      Store.siparisler.all(), Store.irsaliyeler.all(), Store.sevkiyatProgrami.all(), Store.faturalar.all()
    ]);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Sevkiyat & İrsaliye</div><div class="page-sub">İrsaliye düzenleyin, haftalık sevkiyat programını yönetin</div></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'irsaliye' ? 'active' : ''}" data-tab="irsaliye">İrsaliyeler</div>
        <div class="tab ${activeTab === 'program' ? 'active' : ''}" data-tab="program">Haftalık Sevkiyat Programı</div>
        <div class="tab ${activeTab === 'fatura' ? 'active' : ''}" data-tab="fatura">Otomatik Oluşan Faturalar</div>
      </div>
      <div id="sv-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('sv-tab-content');
    if (activeTab === 'irsaliye') { content.innerHTML = renderIrsaliyeTab(siparisler, irsaliyeler); wireIrsaliyeTab(siparisler, irsaliyeler, render, main); }
    else if (activeTab === 'program') { content.innerHTML = renderProgramTab(sevkiyatProgrami, siparisler); wireProgramTab(sevkiyatProgrami, siparisler, render, main); }
    else { content.innerHTML = renderFaturaTab(faturalar); }
  }

  function renderFaturaTab(faturalar) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">İrsaliye Kesilince Otomatik Oluşan Faturalar</div></div>`;
    if (!faturalar.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz fatura oluşmadı.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Fatura No</th><th>Müşteri</th><th class="r">Matrah</th><th class="r">KDV</th><th class="r">Genel Toplam</th><th class="r">Peşinat Mahsup</th><th class="r">Ödenecek Bakiye</th><th>Vade</th></tr>`;
      [...faturalar].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(f => {
        html += `<tr><td class="mono">${f.faturaNo}</td><td>${App.escapeHtml(f.musteriAdi)}</td>
          <td class="r">${App.fmtTL(f.matrah)}</td><td class="r">${App.fmtTL(f.kdvTutari)} (%${f.kdvOrani})</td>
          <td class="r"><b>${App.fmtTL(f.genelToplam)}</b></td>
          <td class="r">${f.pesinatMahsup > 0 ? '−' + App.fmtTL(f.pesinatMahsup) : '—'}</td>
          <td class="r"><b style="color:var(--amber-text)">${App.fmtTL(f.odenecekBakiye)}</b></td>
          <td style="font-size:11px">${f.vadeTarihi || '—'}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function renderIrsaliyeTab(siparisler, irsaliyeler) {
    // BULGU (T3-23): "bu siparişte zaten bir irsaliye var mı" (irsaliyeler.some)
    // kontrolü, TEK bir irsaliye kesilir kesilmez siparişi kalıcı olarak
    // listeden düşürüyordu — kısmi sevkiyat sonrası kalan kalemler bir daha
    // asla görünmüyordu. Artık bunun yerine doğrudan siparişin durumuna
    // (App.siparisKismiSevkGuncelle'nin belirlediği) bakılır:
    // 'kismi_sevk_edildi' siparişler kalan miktarlarıyla listede kalmaya
    // devam eder, yalnızca TAM sevk edilenler ('sevk_edildi') çıkar.
    const sevkEdilebilir = siparisler.filter(s => (s.durum === 'onaylandi' || s.durum === 'uretimde' || s.durum === 'kismi_sevk_edildi') && s.uretimDurumu === 'tamamlandi');
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Sevkiyata Hazır Siparişler</div></div>`;
    if (!sevkEdilebilir.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">İrsaliye düzenlenebilecek sipariş yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Sipariş</th><th>Müşteri</th><th class="r">Toplam</th><th>Paket Durumu</th><th></th></tr>`;
      sevkEdilebilir.forEach(s => {
        let paketHtml = '<span class="muted" style="font-size:10.5px">Paket yok</span>';
        if (s.gerekenPaketler && s.gerekenPaketler.length) {
          const hazirSayisi = s.gerekenPaketler.filter(p => p.sevkEdildi).length;
          paketHtml = hazirSayisi === s.gerekenPaketler.length
            ? `<span class="pill pill-green" style="font-size:10px">✓ ${hazirSayisi}/${s.gerekenPaketler.length} sevke hazır</span>`
            : `<span class="pill pill-amber" style="font-size:10px">⚠ ${hazirSayisi}/${s.gerekenPaketler.length} sevke hazır</span>`;
        }
        html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi)}</td><td class="r">${App.fmtTL(s.toplam)}</td>
          <td>${paketHtml}</td>
          <td style="display:flex;gap:6px"><button class="btn btn-sm btn-blue sv-irsaliye-duzenle" data-id="${s.id}">İrsaliye Düzenle</button>
          <button class="btn btn-sm btn-ghost sv-etiket" data-id="${s.id}">🏷 Etiket Yazdır</button></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Düzenlenen İrsaliyeler</div></div>`;
    if (!irsaliyeler.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz irsaliye düzenlenmedi.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>İrsaliye No</th><th>Sipariş</th><th>Müşteri</th><th>Tarih</th><th>Araç/Plaka</th></tr>`;
      [...irsaliyeler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(i => {
        html += `<tr><td class="mono">${i.irsaliyeNo}</td><td class="mono">${i.siparisKodu}</td><td>${App.escapeHtml(i.musteriAdi)}</td>
          <td style="font-size:11px">${i.tarih}</td><td>${App.escapeHtml(i.aracPlaka || '—')}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireIrsaliyeTab(siparisler, irsaliyeler, render, main) {
    // 🏷 SEVKİYAT ETİKETLERİ: her mamül/paket kalemi için QR kodlu etiket —
    // müşteri adı, sipariş kodu, ürün ve içerik bilgisi. Çıktı alınıp kolilere
    // yapıştırılır; yükleme onayında bu barkod telefonla okutulur.
    main.querySelectorAll('.sv-etiket').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      if (!s) return;
      etiketYazdir(s);
    });
    main.querySelectorAll('.sv-irsaliye-duzenle').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      // Eğer bu siparişte paket/koli takibi varsa, irsaliye düzenlemeden ÖNCE
      // kullanıcı paketlerin reçeteyle uyumunu (Kalite'nin onayladığı adetler
      // üzerinden) görüp SEVK ÖNCESİ son onayını vermeli. Paketler sanal
      // olduğu için bu adım hiçbir stok/MRP hareketi yapmaz — sadece "sevke
      // hazır" işaretlemesidir.
      if (s.gerekenPaketler && s.gerekenPaketler.length && !s.gerekenPaketler.every(p => p.sevkEdildi)) {
        openSevkOncesiPaketOnay(s, () => openIrsaliyeForm(s, () => render(main)));
      } else {
        openIrsaliyeForm(s, () => render(main));
      }
    });
  }

  // Sevk öncesi paket onayı: Kalite'nin onayladığı (kaliteOnayli=true) ve
  // reçeteyle uyumlu (onaylananAdet === adet) paketleri kullanıcıya gösterir,
  // "Sevke Hazır" olarak işaretlemesini ister. Kalite onayı vermemiş veya
  // reçeteyle uyumsuz paketler burada görünür ama sevke onaylanamaz.
  async function openSevkOncesiPaketOnay(siparis, onTamam) {
    // Paket kartları ölçü/ağırlık için yüklenir — sevkiyatta hacim ve
    // ağırlık bilinmeden araç/navlun planlanamaz.
    let paketKartlari = [];
    try { paketKartlari = await Store.paketler.all(); } catch (e) { paketKartlari = []; }
    const kartBul = (kod) => paketKartlari.find(x => x.kod === kod) || null;
    // Sevke girecek satırların hacim/ağırlık toplamı
    const toplam = { m3: 0, desi: 0, netKg: 0, brutKg: 0, koli: 0 };
    (siparis.gerekenPaketler || []).forEach(p => {
      const kart = kartBul(p.kod);
      if (!kart) return;
      const h = App.olculerdenHacim(kart.en, kart.boy, kart.yukseklik);
      const adet = p.adet || 0;
      toplam.koli += adet;
      toplam.m3 += h.m3 * adet;
      toplam.desi += h.desi * adet;
      toplam.netKg += (parseFloat(kart.netAgirlik) || 0) * adet;
      toplam.brutKg += (parseFloat(kart.brutAgirlik) || 0) * adet;
    });
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">📦 Sevkiyat öncesi, reçeteye uygun ve Kalite onaylı paketleri onaylayın. Uyumsuz veya Kalite onayı olmayan paketler sevke dahil edilemez.</div>
      <table class="dtable">
        <tr><th>Paket Kodu</th><th>Ad</th><th>Ölçü / Hacim / Ağırlık</th><th class="r">Reçete</th><th class="r">Üretilen</th><th>Kalite</th><th>Sevke Hazır</th></tr>
        ${siparis.gerekenPaketler.map((p, i) => {
          const uyumlu = p.kaliteOnayli && p.onaylananAdet === p.adet;
          return `<tr style="${uyumlu ? '' : 'background:var(--red-bg)'}">
            <td class="mono">${App.escapeHtml(p.kod)}</td><td>${App.escapeHtml(p.ad)}</td>
            <td style="font-size:10.5px">${(() => {
              const kart = kartBul(p.kod);
              if (!kart) return '<span class="muted">kart yok</span>';
              const h = App.olculerdenHacim(kart.en, kart.boy, kart.yukseklik);
              const par = [];
              if (h.gecerli) par.push(App.fmt(kart.en,0)+'×'+App.fmt(kart.boy,0)+'×'+App.fmt(kart.yukseklik,0)+' cm');
              if (h.m3) par.push(App.fmt(h.m3 * (p.adet||1), 3) + ' m³');
              const brut = (parseFloat(kart.brutAgirlik)||0) * (p.adet||1);
              if (brut) par.push(App.fmt(brut, 1) + ' kg');
              return par.length ? par.join(' · ') : '<span class="muted">ölçü girilmemiş</span>';
            })()}</td>
            <td class="r">${App.fmt(p.adet, 0)}</td><td class="r">${App.fmt(p.onaylananAdet || 0, 0)}</td>
            <td>${p.kaliteOnayli ? '<span class="pill pill-green" style="font-size:10px">✓ Onaylı</span>' : '<span class="pill pill-red" style="font-size:10px">✕ Onaysız</span>'}</td>
            <td><input type="checkbox" class="spo-sevk" data-i="${i}" ${uyumlu ? 'checked' : 'disabled'}></td>
          </tr>`;
        }).join('')}
      </table>
      ${(toplam.m3 || toplam.brutKg || toplam.koli) ? `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-top:12px;font-size:11.5px;max-width:340px">
        <div style="font-weight:700;margin-bottom:6px">🚛 Sevkiyat Toplamı</div>
        ${toplam.koli ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2)">Koli Sayısı</span><span class="mono">${App.fmt(toplam.koli,0)} adet</span></div>` : ''}
        ${toplam.m3 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700"><span style="color:var(--text2)">Toplam Hacim</span><span class="mono">${App.fmt(toplam.m3,3)} m³</span></div>` : ''}
        ${toplam.desi ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2)">Toplam Desi</span><span class="mono">${App.fmt(toplam.desi,1)}</span></div>` : ''}
        ${toplam.netKg ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2)">Net Ağırlık</span><span class="mono">${App.fmt(toplam.netKg,1)} kg</span></div>` : ''}
        ${toplam.brutKg ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700"><span style="color:var(--text2)">Brüt Ağırlık</span><span class="mono">${App.fmt(toplam.brutKg,1)} kg</span></div>` : ''}
      </div>` : ''}
    `;
    const footer = `<button class="btn" id="spo-cancel">Vazgeç</button><button class="btn btn-green" id="spo-confirm">Onayla, İrsaliyeye Geç</button>`;
    App.openModal({ title: 'Sevk Öncesi Paket Onayı', sub: siparis.kod, body, footer, wide: true });
    document.getElementById('spo-cancel').onclick = App.closeModal;
    document.getElementById('spo-confirm').onclick = async () => {
      const uyumsuzVarMi = siparis.gerekenPaketler.some(p => !(p.kaliteOnayli && p.onaylananAdet === p.adet));
      if (uyumsuzVarMi) {
        const devamEt = window.confirm('Bazı paketler reçeteyle uyumlu değil veya Kalite onayı yok. Bu paketler SEVKE DAHİL EDİLMEYECEK. Devam etmek istediğinize emin misiniz?');
        if (!devamEt) return;
      }
      document.querySelectorAll('.spo-sevk').forEach(chk => {
        const i = parseInt(chk.dataset.i);
        if (chk.checked) siparis.gerekenPaketler[i].sevkEdildi = true;
      });
      await App.persist(() => Store.siparisler.upsert(siparis));
      App.toast('Paket onayları kaydedildi, irsaliye düzenleme ekranına geçiliyor', 'ok');
      App.closeModal();
      onTamam();
    };
  }

  async function openIrsaliyeForm(siparis, onSaved) {
    // İrsaliye kalemleri: siparişin kalemleriyle başlar; sevkiyatçı buradan
    // kalem ÇIKARABİLİR ve sisteme kayıtlı HER ŞEYİ (bitmiş ürün, yarımamül,
    // hammadde/hırdavat, 2. kalite/defolu iade kalemleri) EKLEYEBİLİR.
    // Fatura burada OLUŞMAZ — irsaliye 'cari_bekliyor' durumuna düşer, Cari
    // İşlemler kalem fiyatlarını kontrol edip düzenledikten sonra faturalar.
    const [urunler, yarimamuller, hammaddeler, iadeKalemleri] = await Promise.all([
      Store.urunler.all(), Store.yarimamuller.all(), Store.hammaddeler.all(), Store.iadeKalemleri.all()
    ]);
    // İrsaliye kalem listesi (çalışma kopyası). BULGU (T3-23): bu liste her
    // zaman siparişin TAM ORİJİNAL miktarlarıyla başlıyordu — kısmi sevkiyat
    // sonrası tekrar açıldığında sevkiyatçının halihazırda sevk edilmiş
    // miktarı FARK EDİP elle çıkarması/azaltması gerekiyordu (unutulursa
    // aynı ürün ikinci kez sevk edilmiş sayılırdı). Artık ürün kalemleri
    // KALAN miktarla (miktar - sevkEdilenMiktar) başlar; tamamı zaten sevk
    // edilmiş ürün kalemleri listeye hiç eklenmez.
    const kalemler = (siparis.kalemler || [])
      .map(k => {
        const kalan = k.grup === 'urun' ? Math.max(0, (k.miktar || 1) - (k.sevkEdilenMiktar || 0)) : (k.miktar || 1);
        return {
          kaynak: k.ikinciKalite ? 'ikinci_kalite' : (k.grup === 'yarimamul' ? 'yarimamul' : 'urun'),
          kod: k.kod, ad: k.ad, miktar: kalan, birim: k.birim || 'ADET',
          netFiyat: k.netFiyat || 0, kdvOrani: k.kdvOrani ?? 20,
          ikinciKalite: !!k.ikinciKalite, iadeKalemId: k.iadeKalemId || null
        };
      })
      .filter(k => k.miktar > 0);

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">İrsaliye No</label><input class="finput" id="ir-no" value="İRS-${Date.now().toString(36).toUpperCase()}"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Sevk Tarihi</label><input class="finput" id="ir-tarih" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="fgroup"><label class="flbl">Araç Plaka</label><input class="finput" id="ir-plaka" placeholder="34 ABC 123"></div>
      </div>
      <div class="fgroup"><label class="flbl">Sürücü / Nakliye Firması</label><input class="finput" id="ir-surucu"></div>

      <div class="hr"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="flbl">📦 İrsaliye İçeriği (Sipariş Kalemleri + Eklemeler)</div>
        <button class="btn btn-sm btn-blue" id="ir-kalem-ekle" type="button">+ Kalem Ekle</button>
      </div>
      <div id="ir-kalemler"></div>
      <div class="fhint" style="margin-top:6px">Sipariş içeriğinden kalem çıkarabilir, sisteme kayıtlı her kalemi (bitmiş ürün, yarımamül, hammadde/hırdavat, 2. kalite/defolu) ekleyebilirsiniz. Fiyat kontrolü ve faturalama <b>Cari İşlemler</b> tarafından yapılır.</div>

      <div class="fgroup" style="margin-top:10px"><label class="flbl">Not</label><textarea class="ftextarea" id="ir-not"></textarea></div>
    `;
    const footer = `<button class="btn" id="ir-cancel">Vazgeç</button><button class="btn btn-blue" id="ir-save">İrsaliyeyi Kaydet (Cari Onayına Gönder)</button>`;
    App.openModal({ title: 'İrsaliye Düzenle', sub: siparis.kod + ' — ' + siparis.musteriAdi, body, footer, xwide: true });

    const KAYNAK_ETIKET = { urun: 'Ürün', yarimamul: 'Yarı Mamül', hammadde: 'Hammadde/Hırdavat', ikinci_kalite: '2.Kalite/Defolu' };
    function kalemTabloCiz() {
      const el = document.getElementById('ir-kalemler');
      if (!kalemler.length) { el.innerHTML = '<div class="empty-state" style="padding:12px"><div class="edesc">İrsaliyede kalem yok — en az bir kalem ekleyin.</div></div>'; return; }
      el.innerHTML = `<table class="dtable" style="font-size:11.5px">
        <tr><th>Tür</th><th>Kod / Ad</th><th class="r">Miktar</th><th class="r">Birim</th><th></th></tr>
        ${kalemler.map((k, i) => `<tr>
          <td><span class="pill ${k.kaynak === 'ikinci_kalite' ? 'pill-amber' : 'pill-gray'}" style="font-size:9.5px">${KAYNAK_ETIKET[k.kaynak] || k.kaynak}</span></td>
          <td><b class="mono">${App.escapeHtml(k.kod)}</b><br><span class="muted" style="font-size:10px">${App.escapeHtml(k.ad)}</span></td>
          <td class="r"><input class="finput ir-k-miktar" data-i="${i}" type="number" value="${k.miktar}" min="0.01" step="0.01" style="width:70px;text-align:right"></td>
          <td class="r">${App.escapeHtml(k.birim)}</td>
          <td><button class="btn btn-icon btn-ghost ir-k-sil" data-i="${i}" style="color:var(--red-text)" type="button">&times;</button></td>
        </tr>`).join('')}
      </table>`;
      el.querySelectorAll('.ir-k-miktar').forEach(inp => inp.onchange = () => {
        const i = parseInt(inp.dataset.i);
        const kalem = kalemler[i];
        let m = parseFloat(inp.value) || 1;
        // BULGU (T3-24): 2. kalite kalemlerde miktar, o kaleme ait TÜM
        // taslak satırlarının toplamı kullanılabilir sınırı aşamaz.
        if (kalem.ikinciKalite && kalem.kullanilabilir != null) {
          const digerSatirlarToplami = kalemler.filter((k, j) => j !== i && k.iadeKalemId === kalem.iadeKalemId).reduce((a, k) => a + (k.miktar || 0), 0);
          const izinliMax = Math.max(0, kalem.kullanilabilir - digerSatirlarToplami);
          if (m > izinliMax) {
            m = izinliMax;
            App.toast(kalem.kod + ' için miktar kullanılabilir sınıra (' + izinliMax + ') düşürüldü', 'err');
          }
        }
        kalem.miktar = m;
        inp.value = m;
      });
      el.querySelectorAll('.ir-k-sil').forEach(btn => btn.onclick = () => {
        kalemler.splice(parseInt(btn.dataset.i), 1);
        kalemTabloCiz();
      });
    }
    kalemTabloCiz();

    // Kalem ekleme: tüm kaynaklardan arama listesi
    document.getElementById('ir-kalem-ekle').onclick = () => {
      // BULGU (T3-24): 2. kalite kalemler burada rezervasyondan bağımsız
      // olarak listeleniyordu — bir teklifte REZERVE edilmiş (başka bir
      // müşteriye ayrılmış) bir kalem de seçilebiliyordu. Artık
      // App.ikinciKaliteKullanilabilirAdet ile GERÇEK kullanılabilir miktar
      // hesaplanır; kullanılabilir 0 olan kalemler listeye hiç girmez.
      const secenekler = [
        ...urunler.map(u => ({ kaynak: 'urun', kod: u.kod, ad: u.ad, birim: 'ADET' })),
        ...yarimamuller.map(y => ({ kaynak: 'yarimamul', kod: y.kod, ad: y.ad, birim: 'ADET' })),
        ...hammaddeler.map(h => ({ kaynak: 'hammadde', kod: h.stokKodu, ad: h.ad, birim: h.birim || 'ADET' })),
        ...iadeKalemleri.filter(i => ['satista', 'fiyat_bekliyor'].includes(i.durum))
          .map(i => ({ i, kullanilabilir: App.ikinciKaliteKullanilabilirAdet(i, null) }))
          .filter(x => x.kullanilabilir > 0)
          .map(({ i, kullanilabilir }) => ({
            kaynak: 'ikinci_kalite', kod: i.kod, ad: i.ad + ' [' + ({'2_kalite':'2.Kalite','defolu':'Defolu','seri_sonu':'Seri Sonu'}[i.kalite] || '2.Kalite') + ']' + ' — kullanılabilir: ' + kullanilabilir,
            birim: i.birim || 'ADET', iadeKalemId: i.id, ikinciKalite: true, netFiyat: i.satisFiyati || 0, kullanilabilir
          }))
      ];
      const ekBody = document.createElement('div');
      ekBody.innerHTML = `
        <input class="finput" id="irke-ara" placeholder="Kod veya ad ile ara..." style="margin-bottom:10px">
        <div id="irke-liste" style="max-height:320px;overflow:auto"></div>`;
      const ekModal = document.createElement('div');
      ekModal.className = 'app-embed-overlay';
      ekModal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,41,.45);z-index:' + App.yeniZIndexAl() + ';display:flex;align-items:center;justify-content:center;padding:20px';
      ekModal.innerHTML = `<div style="background:var(--surface);border-radius:14px;max-width:640px;width:100%;max-height:80vh;overflow:auto;padding:20px">
        <div style="font-weight:800;font-size:15px;margin-bottom:12px">İrsaliyeye Kalem Ekle</div>
        <div id="irke-icerik"></div>
        <div style="text-align:right;margin-top:12px"><button class="btn" id="irke-kapat" type="button">Kapat</button></div>
      </div>`;
      document.body.appendChild(ekModal);
      ekModal.querySelector('#irke-icerik').appendChild(ekBody);
      const listeEl = ekModal.querySelector('#irke-liste');
      function listele(f) {
        const fl = (f || '').toLowerCase();
        const gorunen = secenekler.filter(s => !fl || (s.kod || '').toLowerCase().includes(fl) || (s.ad || '').toLowerCase().includes(fl)).slice(0, 60);
        listeEl.innerHTML = gorunen.map((s, i) => `<div class="irke-satir" data-i="${secenekler.indexOf(s)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer">
          <div><span class="pill ${s.kaynak === 'ikinci_kalite' ? 'pill-amber' : 'pill-gray'}" style="font-size:9px">${KAYNAK_ETIKET[s.kaynak]}</span>
          <b class="mono" style="font-size:11px;margin-left:6px">${App.escapeHtml(s.kod || '')}</b>
          <span style="font-size:11px;color:var(--text2);margin-left:6px">${App.escapeHtml(s.ad || '')}</span></div>
          <button class="btn btn-sm btn-green" type="button">Ekle</button>
        </div>`).join('') || '<div class="muted" style="padding:12px;font-size:12px">Sonuç yok</div>';
        listeEl.querySelectorAll('.irke-satir').forEach(row => row.querySelector('button').onclick = () => {
          const s = secenekler[parseInt(row.dataset.i)];
          // BULGU (T3-24): 2. kalite kalem birden fazla kez eklenebiliyor/
          // miktarı artırılabiliyordu — taslakta ZATEN eklenmiş miktar da
          // düşülerek kullanılabilir sınırı burada da (kayıt anındaki son
          // kontrolden ÖNCE) uygulanır.
          if (s.ikinciKalite) {
            const taslaktaEklenen = kalemler.filter(k => k.iadeKalemId === s.iadeKalemId).reduce((a, k) => a + (k.miktar || 0), 0);
            const kalanKullanilabilir = s.kullanilabilir - taslaktaEklenen;
            if (kalanKullanilabilir <= 0) { App.toast(s.kod + ' için kullanılabilir miktar kalmadı (taslakta zaten eklendi)', 'err'); return; }
          }
          kalemler.push({ kaynak: s.kaynak, kod: s.kod, ad: s.ad, miktar: 1, birim: s.birim, netFiyat: s.netFiyat || 0, kdvOrani: 20, ikinciKalite: !!s.ikinciKalite, iadeKalemId: s.iadeKalemId || null, kullanilabilir: s.kullanilabilir });
          kalemTabloCiz();
          App.toast('Eklendi: ' + s.kod, 'ok');
        });
      }
      listele('');
      ekModal.querySelector('#irke-ara').oninput = (e) => listele(e.target.value);
      ekModal.querySelector('#irke-kapat').onclick = () => ekModal.remove();
    };

    document.getElementById('ir-cancel').onclick = App.closeModal;
    document.getElementById('ir-save').onclick = async () => {
      if (!kalemler.length) { App.toast('İrsaliyede en az bir kalem olmalı', 'err'); return; }
      const irsaliyeTarihi = document.getElementById('ir-tarih').value;
      const irsaliyeNo = document.getElementById('ir-no').value.trim();

      // BULGU (T3-24): 2. kalite satışı, irsaliye/stok/sipariş durumu
      // KAYDEDİLMEDEN ÖNCE doğrulanır — böylece kullanılabilir miktar
      // yetersizse HİÇBİR ŞEY kısmen kaydedilmemiş olur (tutarsız durum
      // riski yok). Bu doğrulama ayrıca kalem ekleme/miktar değiştirme
      // sırasındaki istemci taraflı kontrollerin SON GÜVENCESİDİR.
      const ikKalemler = kalemler.filter(k => k.ikinciKalite && k.iadeKalemId).map(k => ({ iadeKalemId: k.iadeKalemId, kod: k.kod, miktar: k.miktar || 1 }));
      const ikSonuc = await App.persist(() => App.ikinciKaliteDogrudanSatisIsle(ikKalemler, {
        kaynakId: siparis.id, kaynakKod: siparis.kod, musteriId: siparis.musteriId, musteriAdi: siparis.musteriAdi,
        tarih: irsaliyeTarihi, irsaliyeNo
      }));
      if (!ikSonuc.ok) { App.toast(ikSonuc.hata, 'err'); return; }

      const irsaliye = {
        id: App.uid('IRS'),
        irsaliyeNo,
        siparisId: siparis.id, siparisKodu: siparis.kod,
        musteriId: siparis.musteriId, musteriAdi: siparis.musteriAdi,
        tarih: irsaliyeTarihi,
        aracPlaka: document.getElementById('ir-plaka').value.trim(),
        surucu: document.getElementById('ir-surucu').value.trim(),
        not: document.getElementById('ir-not').value.trim(),
        kalemler: kalemler.map(k => ({ ...k })),
        faturaDurumu: 'cari_bekliyor' // Cari fiyatları kontrol edip faturalayacak
      };
      await App.persist(() => Store.irsaliyeler.upsert(irsaliye));
      // BULGU (T3-23): durum KOŞULSUZ 'sevk_edildi' oluyordu — bu irsaliye
      // siparişin yalnızca bir KISMINI (kalem çıkarılmış/miktar azaltılmış)
      // kapsasa bile sipariş kalıcı olarak "sevk edildi" sayılıp
      // sevkEdilebilir listesinden düşüyor, kalan kalemler bir daha asla
      // sevk edilemiyordu. Artık yalnızca TÜM ürün kalemleri fiilen sevk
      // edildiyse 'sevk_edildi'; aksi halde 'kismi_sevk_edildi' olur ve
      // sipariş kalan miktarıyla sevkEdilebilir listesinde görünmeye devam eder.
      App.siparisKismiSevkGuncelle(siparis, irsaliye.kalemler);
      await App.persist(() => Store.siparisler.upsert(siparis));

      // Sevkiyat Deposu'ndan otomatik stok çıkışı: ürün kalemleri
      const tumUrunler = await Store.urunler.all();
      for (const kalem of kalemler) {
        if (kalem.kaynak !== 'urun') continue;
        const urun = tumUrunler.find(u => u.kod === kalem.kod);
        if (!urun) continue;
        await App.persist(() => App.sevkiyatYapilinceStoktanDus(urun.id, urun.ad, kalem.miktar || 1, siparis.id));
      }

      // 2. kalite kalemlere sevk bilgisi (irsaliye no + tarih) işlenir
      // (T3-24: doğrudan eklenen 2. kalite kalemlerin satış/stok işlemesi
      // artık ir-save başında App.ikinciKaliteDogrudanSatisIsle ile yapılıyor —
      // burada yalnızca sipariş kalemlerinden gelenler için sevk bilgisi işlenir)
      await App.persist(() => App.ikinciKaliteSevkBilgisiIsle(siparis, irsaliye));

      App.toast('İrsaliye kaydedildi, stok düşüldü. Fatura için Cari İşlemler fiyat kontrolü yapacak: ' + irsaliye.irsaliyeNo, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  function renderProgramTab(sevkiyatProgrami, siparisler) {
    const today = new Date();
    const haftaninGunleri = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      haftaninGunleri.push(d);
    }
    const gunAdlari = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Bu Hafta Sevkiyat Programı</div>
        <button class="btn btn-sm btn-blue" id="sv-add-program">+ Sevkiyat Ekle</button>
      </div>
      <div class="tbl-wrap"><table class="dtable"><tr><th>Gün</th><th>Tarih</th><th>Müşteri</th><th>Sipariş</th><th></th></tr>`;
    haftaninGunleri.forEach(d => {
      const dateStr = d.toISOString().slice(0, 10);
      const gunPlanlari = sevkiyatProgrami.filter(p => p.tarih === dateStr);
      if (!gunPlanlari.length) {
        html += `<tr><td>${gunAdlari[d.getDay()]}</td><td style="font-size:11px">${dateStr}</td><td colspan="2" class="muted" style="font-size:11px">Planlanmış sevkiyat yok</td><td></td></tr>`;
      } else {
        gunPlanlari.forEach((p, i) => {
          html += `<tr><td>${i === 0 ? gunAdlari[d.getDay()] : ''}</td><td style="font-size:11px">${i === 0 ? dateStr : ''}</td>
            <td>${App.escapeHtml(p.musteriAdi)}</td><td class="mono">${App.escapeHtml(p.siparisKodu || '—')}</td>
            <td><button class="btn btn-icon btn-ghost sv-del-program" data-id="${p.id}" style="color:var(--red-text)">&times;</button></td></tr>`;
        });
      }
    });
    html += `</table></div></div>`;
    return html;
  }

  function wireProgramTab(sevkiyatProgrami, siparisler, render, main) {
    document.getElementById('sv-add-program').onclick = () => openProgramForm(siparisler, sevkiyatProgrami, () => render(main));
    main.querySelectorAll('.sv-del-program').forEach(b => b.onclick = () => {
      App.confirmDialog('Bu sevkiyat planını silmek istediğinize emin misiniz?', async () => {
        await App.persist(() => Store.sevkiyatProgrami.remove(b.dataset.id));
        App.toast('Plan silindi', 'ok');
        render(main);
      });
    });
  }

  function openProgramForm(siparisler, sevkiyatProgrami, onSaved) {
    // MÜKERRER ENGELİ: programda zaten olan siparişler listede GÖSTERİLMEZ —
    // her sipariş sevkiyat programına TEK SEFER eklenebilir.
    const programdakiSiparisIdler = new Set(sevkiyatProgrami.filter(p => p.siparisId).map(p => p.siparisId));
    const eklenebilirSiparisler = siparisler.filter(s => !programdakiSiparisIdler.has(s.id));
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Sipariş (opsiyonel)</label>
        <select class="fselect" id="pf-siparis">
          <option value="">— Sipariş seçilmedi —</option>
          ${eklenebilirSiparisler.map(s => `<option value="${s.id}">${s.kod} — ${App.escapeHtml(s.musteriAdi)}</option>`).join('')}
        </select>
      </div>
      ${programdakiSiparisIdler.size ? `<div class="fhint" style="margin-bottom:8px">ℹ Programda zaten planlı ${programdakiSiparisIdler.size} sipariş listede gösterilmiyor (her sipariş tek sefer eklenir).</div>` : ''}
      <div class="fgroup"><label class="flbl">Müşteri Adı</label><input class="finput" id="pf-musteri"></div>
      <div class="fgroup"><label class="flbl">Sevkiyat Tarihi</label><input class="finput" id="pf-tarih" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    `;
    const footer = `<button class="btn" id="pf-cancel">Vazgeç</button><button class="btn btn-blue" id="pf-save">Ekle</button>`;
    App.openModal({ title: 'Sevkiyat Programına Ekle', body, footer });
    document.getElementById('pf-siparis').onchange = (e) => {
      const s = siparisler.find(x => x.id === e.target.value);
      if (s) document.getElementById('pf-musteri').value = s.musteriAdi;
    };
    document.getElementById('pf-cancel').onclick = App.closeModal;
    document.getElementById('pf-save').onclick = async () => {
      const siparisId = document.getElementById('pf-siparis').value || null;
      // Yarış durumuna karşı son kontrol: bu sipariş bu arada eklendiyse engelle
      if (siparisId) {
        const guncelProgram = await Store.sevkiyatProgrami.all();
        if (guncelProgram.some(p => p.siparisId === siparisId)) {
          App.toast('Bu sipariş sevkiyat programına zaten eklenmiş (tek sefer eklenebilir)', 'err');
          return;
        }
      }
      const s = siparisler.find(x => x.id === siparisId);
      const plan = {
        id: App.uid('SVP'),
        siparisId, siparisKodu: s ? s.kod : null,
        musteriAdi: document.getElementById('pf-musteri').value.trim() || (s ? s.musteriAdi : ''),
        tarih: document.getElementById('pf-tarih').value
      };
      if (!plan.musteriAdi || !plan.tarih) { App.toast('Müşteri adı ve tarih zorunlu', 'err'); return; }
      await App.persist(() => Store.sevkiyatProgrami.upsert(plan));
      App.toast('Sevkiyat programa eklendi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // ── ETİKET YAZDIRMA ──────────────────────────────────────────────────────
  function etiketYazdir(siparis) {
    const kalemler = (siparis.kalemler || []).filter(k => !k.grup || k.grup !== 'hammadde');
    const etiketler = kalemler.length ? kalemler : [{ kod: siparis.kod, ad: 'Sipariş Kolisi', miktar: 1 }];
    const icerikOzet = kalemler.map(k => (k.miktar || 1) + '× ' + k.kod).join(', ');
    const sayfa = etiketler.map(k => `
      <div class="etiket">
        <div class="et-firma">ÜretimOS Sevkiyat Etiketi</div>
        <div class="et-musteri">${App.escapeHtml(siparis.musteriAdi || '')}</div>
        <div class="et-satir"><b>Sipariş:</b> ${App.escapeHtml(siparis.kod)}</div>
        <div class="et-satir"><b>Ürün:</b> ${App.escapeHtml(k.kod)} — ${App.escapeHtml(k.ad || '')}</div>
        <div class="et-satir"><b>Adet:</b> ${App.fmt(k.miktar || 1, 0)} &nbsp; <b>İçerik:</b> ${App.escapeHtml(icerikOzet).slice(0, 90)}</div>
        <div class="et-qr">
          ${App.qrSvg(siparis.kod, 150)}
          <div class="et-qr-kod">${App.escapeHtml(siparis.kod)}</div>
        </div>
        <div class="et-alt">Yükleme onayında bu QR kod telefonla okutulur — eşleşmeden yükleme onaylanmaz.<br>iPhone/iPad: telefonun kendi kamera uygulamasıyla okutmanız yeterlidir. Etiketi buruşturmayın; QR çevresindeki beyaz boşluk okuma için gereklidir.</div>
      </div>`).join('');
    const wpencere = window.open('', '_blank');
    wpencere.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiketler — ${App.escapeHtml(siparis.kod)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 10mm; }
        .etiket { width: 130mm; border: 1.5px solid #000; border-radius: 6px; padding: 6mm; margin-bottom: 6mm; page-break-inside: avoid; }
        .et-qr svg { max-width: 100%; height: auto; flex-shrink: 0; }
        .et-firma { font-size: 9px; color: #555; letter-spacing: 1px; text-transform: uppercase; }
        .et-musteri { font-size: 17px; font-weight: 800; margin: 2mm 0; }
        .et-satir { font-size: 11px; margin: 1mm 0; }
        .et-qr { margin: 3mm 0 1mm; display: flex; align-items: center; gap: 4mm; }
        .et-qr-kod { font-family: monospace; font-size: 13px; font-weight: bold; letter-spacing: 1px; }
        .et-alt { font-size: 8px; color: #777; }
        @media print { .etiket { margin-bottom: 4mm; } }
      </style></head><body>${sayfa}
      <script>window.onload = () => setTimeout(() => window.print(), 250);<\/script></body></html>`);
    wpencere.document.close();
  }

  return { render };
})();
