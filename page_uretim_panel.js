// ════════════════════════════════════════════════════════════════════════════
// ÜRETİM PLANLAMA PANELİ — yarı mamül stok talebi, raf stok görünümü,
// hammadde/satınalma takibi, siparişler + termin verme, üretim kuyruğu
// (günlük 250 ürün kapasite uyarısı + aynı renk toplu kesim önerisi)
// ════════════════════════════════════════════════════════════════════════════
PageModules.uretim_panel = (() => {
  let activeTab = 'kuyruk';
  const GUNLUK_KAPASITE = 250; // ürün/gün — bu sınır aşılırsa KPI kırmızı uyarır

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const [stokRaf, yarimamuller, hammaddeler, talepler, satinalmaTalepleri, siparisler, urunler, receteler, hammaddeIhtiyaclari, kritikStokSeviyeleri, makinalar, arizaKayitlari, uretimIsEmriIhtiyaclari, istasyonIsleri, rotalar, isemirleri] = await Promise.all([
      Store.stokRaf.all(), Store.yarimamuller.all(), Store.hammaddeler.all(),
      Store.talepler.all(), Store.satinalmaTalepleri.all(), Store.siparisler.all(),
      Store.urunler.all(), Store.receteler.all(), Store.hammaddeIhtiyaclari.all(), Store.kritikStokSeviyeleri.all(),
      Store.makinaTechizat.all(), Store.arizaKayitlari.all(), Store.uretimIsEmriIhtiyaclari.all(), Store.istasyonIsleri.all(), Store.rotalar.all(), Store.isemirleri.all()
    ]);

    const acikIsEmriIhtiyaclari = uretimIsEmriIhtiyaclari.filter(x => x.durum === 'acik');

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Üretim Planlama Paneli</div>
          <div class="page-sub">Üretim kuyruğunu yönetin, raf stoklarını görün, yarı mamül talebi açın</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="up-ariza-bildir">⚠ Arıza Bildir</button>
          <button class="btn btn-blue" id="up-new-talep">+ Yarı Mamül Stok Talebi</button>
        </div>
      </div>

      <div class="tabs">
        <div class="tab ${activeTab === 'ariza' ? 'active' : ''}" data-tab="ariza">Arıza Kayıtlarım ${arizaKayitlari.length ? '<span class="pill pill-gray" style="margin-left:4px">' + arizaKayitlari.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'kuyruk' ? 'active' : ''}" data-tab="kuyruk">Üretim Kuyruğu</div>
        <div class="tab ${activeTab === 'isemriihtiyaci' ? 'active' : ''}" data-tab="isemriihtiyaci">İş Emri İhtiyaçları ${acikIsEmriIhtiyaclari.length ? '<span class="pill pill-amber" style="margin-left:4px">' + acikIsEmriIhtiyaclari.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'hammaddeihtiyaci' ? 'active' : ''}" data-tab="hammaddeihtiyaci">Hammadde İhtiyacı</div>
        <div class="tab ${activeTab === 'stok' ? 'active' : ''}" data-tab="stok">Raf Stokları</div>
        <div class="tab ${activeTab === 'hammadde' ? 'active' : ''}" data-tab="hammadde">Hammadde & Satınalma</div>
        <div class="tab ${activeTab === 'siparis' ? 'active' : ''}" data-tab="siparis">Siparişler & Termin</div>
      </div>
      <div id="up-tab-content"></div>
    `;

    document.getElementById('up-new-talep').onclick = () => openTalepForm(yarimamuller, () => render(main));
    document.getElementById('up-ariza-bildir').onclick = () => openArizaBildirForm(makinalar, () => render(main));
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('up-tab-content');
    if (activeTab === 'ariza') content.innerHTML = renderArizaTab(arizaKayitlari, makinalar);
    else if (activeTab === 'kuyruk') { content.innerHTML = renderKuyrukTab(siparisler, urunler, receteler, yarimamuller); wireKuyrukTab(siparisler, urunler, render, main); }
    else if (activeTab === 'isemriihtiyaci') { content.innerHTML = renderIsEmriIhtiyaciTab(acikIsEmriIhtiyaclari); wireIsEmriIhtiyaciTab(acikIsEmriIhtiyaclari, yarimamuller, rotalar, render, main); }
    else if (activeTab === 'hammaddeihtiyaci') { content.innerHTML = renderHammaddeIhtiyaciTab(hammaddeIhtiyaclari, hammaddeler) + renderKritikStokOzet(hammaddeler, stokRaf, kritikStokSeviyeleri); wireHammaddeIhtiyaciTab(hammaddeIhtiyaclari, hammaddeler, render, main); wireKritikStokOzet(hammaddeler, render, main); }
    else if (activeTab === 'stok') content.innerHTML = renderStokTab(stokRaf, yarimamuller, talepler);
    else if (activeTab === 'hammadde') content.innerHTML = renderHammaddeTab(hammaddeler, stokRaf, satinalmaTalepleri);
    else {
      // ÜRETİM PLANLAMAYA YALNIZCA ONAYLANMIŞ SİPARİŞLER DÜŞER.
      // Reddedilen (sonra düzenlenip yeniden oluşturulan) eski sipariş
      // kayıtları ve henüz cari/yönetim onayı bekleyenler burada GÖRÜNMEZ —
      // aynı teklifin red-düzenle-yeniden gönder döngüsünde mükerrer satır
      // birikmesi böylece engellenir. (Sipariş tarihçesi "Siparişler"
      // ekranında durum rozetleriyle korunur.)
      const terminSiparisleri = siparisler.filter(s => s.durum === 'onaylandi');
      content.innerHTML = renderSiparisTab(terminSiparisleri, istasyonIsleri, isemirleri, uretimIsEmriIhtiyaclari, urunler, receteler, stokRaf, yarimamuller);
      wireSiparisTab(terminSiparisleri, render, main);
    }
  }

  // ── İŞ EMRİ İHTİYAÇLARI ───────────────────────────────────────────────────
  // Sipariş onayında rafta stoğu yetersiz çıkan (kısmen veya tamamen üretilmesi
  // gereken) yarı mamüller burada listelenir. "İş Emrine Dönüştür" tıklanınca
  // basit bir tek-kalemli iş emri (İş Emirleri sayfasında görünür) oluşturulur,
  // bu ihtiyaç kalemi kapanır.
  function renderIsEmriIhtiyaciTab(ihtiyaclar) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Rafta Karşılanamayan Yarı Mamüller — Üretime İş Emri İhtiyacı</div>
      <button class="btn btn-sm btn-blue" id="up-toplu-donustur" disabled>⚡ Seçilenleri İş Emrine Dönüştür (0)</button></div>
      <div class="fhint" style="margin-bottom:8px">Satır bazlı arama ile renk / aynı kod / benzer özellikli ürünleri süzün; tek tek veya toplu seçip iş emrine dönüştürün. Reçetede/kartta işlenen rota otomatik gelir, hat dengeleme için değiştirilebilir.</div>
      <input class="finput" id="up-ihtiyac-ara" placeholder="🔍 Ara / süz: kod, ad, renk... (örn. CEVİZ, YM-GOVDE, 220100)" style="margin-bottom:10px">`;
    if (!ihtiyaclar.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Şu an iş emri ihtiyacı yok — sipariş onaylandığında rafta eksik çıkan yarı mamüller burada birikir.</div></div>`;
    } else {
      html += `<table class="dtable" id="up-ihtiyac-tablo"><tr>
        <th style="width:30px"><input type="checkbox" id="up-sec-hepsi" title="Görünenlerin tümünü seç"></th>
        <th>Yarı Mamül</th><th class="r">Eksik Adet</th><th>Kaynak Sipariş Sayısı</th><th>Tarih</th><th></th></tr>`;
      ihtiyaclar.forEach(x => {
        html += `<tr class="up-ihtiyac-satir" data-ara="${App.escapeHtml(((x.yarimamulKod || '') + ' ' + (x.yarimamulAd || '')).toLowerCase())}">
          <td><input type="checkbox" class="up-ihtiyac-sec" data-id="${x.id}"></td>
          <td><b class="mono">${App.escapeHtml(x.yarimamulKod)}</b><br><span class="muted" style="font-size:10.5px">${App.escapeHtml(x.yarimamulAd)}</span></td>
          <td class="r"><b>${App.fmt(x.adet, 0)}</b> ADET</td>
          <td class="r">${(x.kaynakSiparisler || []).length}</td>
          <td style="font-size:11px">${x.olusturmaTarihi}</td>
          <td><button class="btn btn-sm btn-blue up-isemrine-donustur" data-id="${x.id}">İş Emrine Dönüştür</button></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireIsEmriIhtiyaciTab(ihtiyaclar, yarimamuller, rotalar, render, main) {
    // Satır bazlı arama/süzme: renk, aynı kod, benzer özellik
    const araInp = document.getElementById('up-ihtiyac-ara');
    const secimSayaciGuncelle = () => {
      const secililer = [...document.querySelectorAll('.up-ihtiyac-sec:checked')];
      const btn = document.getElementById('up-toplu-donustur');
      if (btn) { btn.disabled = !secililer.length; btn.textContent = `⚡ Seçilenleri İş Emrine Dönüştür (${secililer.length})`; }
    };
    if (araInp) araInp.oninput = () => {
      const f = araInp.value.toLowerCase().trim();
      document.querySelectorAll('.up-ihtiyac-satir').forEach(tr => {
        tr.style.display = !f || tr.dataset.ara.includes(f) ? '' : 'none';
      });
      secimSayaciGuncelle();
    };
    const hepsiCb = document.getElementById('up-sec-hepsi');
    if (hepsiCb) hepsiCb.onchange = () => {
      document.querySelectorAll('.up-ihtiyac-satir').forEach(tr => {
        if (tr.style.display === 'none') return; // yalnızca süzülüp görünenler
        tr.querySelector('.up-ihtiyac-sec').checked = hepsiCb.checked;
      });
      secimSayaciGuncelle();
    };
    document.querySelectorAll('.up-ihtiyac-sec').forEach(cb => cb.onchange = secimSayaciGuncelle);

    // TOPLU dönüştürme: her ihtiyaç kendi kartındaki rotayla ayrı iş emri olur
    const topluBtn = document.getElementById('up-toplu-donustur');
    if (topluBtn) topluBtn.onclick = () => {
      const idler = [...document.querySelectorAll('.up-ihtiyac-sec:checked')].map(cb => cb.dataset.id);
      if (!idler.length) return;
      App.confirmDialog(`${idler.length} ihtiyaç kalemi için ayrı ayrı iş emri oluşturulacak (rotalar yarı mamül kartlarından otomatik alınır). Onaylıyor musunuz?`, async () => {
        let acilan = 0;
        for (const id of idler) {
          const istek = ihtiyaclar.find(x => x.id === id);
          if (!istek) continue;
          const ym = yarimamuller.find(y => y.id === istek.yarimamulId);
          const ie = {
            id: App.uid('IE'),
            kod: 'IE-' + Date.now().toString(36).toUpperCase() + acilan,
            tip: 'yarimamul', urunId: null,
            urunAdi: (istek.yarimamulAd || '') + ' (Yarı Mamül İhtiyacı)',
            adet: istek.adet, tarih: new Date().toISOString().slice(0, 10),
            not: 'Toplu iş emri dönüştürmesiyle oluşturuldu.',
            durum: 'taslak',
            kaynakIhtiyacId: istek.id,
            kaynakSiparisIdler: istek.kaynakSiparisler || [],
            uretimListesi: [{ tip: 'yarimamul', refId: istek.yarimamulId, miktarBirim: 1, birim: 'ADET', gerekliToplam: istek.adet, uretildi: 0, rotaId: (ym && ym.rotaId) || null }]
          };
          await App.persist(() => Store.isemirleri.upsert(ie));
          // BULGU (T3-29): MRP kaynaklı (rafta eksik yarımamül) iş emirleri
          // için kesim ihtiyacı hiç oluşmuyordu — Kesim Optimizasyonu
          // ekranı bu üretimden habersiz kalıyordu.
          await App.persist(() => App.isEmriKesimIhtiyaciOlustur(ie));
          istek.durum = 'isemrine_donduruldu';
          istek.acilanAdet = istek.adet;
          await App.persist(() => Store.uretimIsEmriIhtiyaclari.upsert(istek));
          acilan++;
        }
        App.toast(acilan + ' iş emri oluşturuldu — İş Emirleri sayfasından takip edebilirsiniz', 'ok');
        render(main);
      });
    };

    document.querySelectorAll('.up-isemrine-donustur').forEach(b => b.onclick = () => {
      const istek = ihtiyaclar.find(x => x.id === b.dataset.id);
      openIsEmriDonusturForm(istek, yarimamuller, rotalar, () => render(main));
    });
  }

  function openIsEmriDonusturForm(istek, yarimamuller, rotalar, onSaved) {
    const ym = yarimamuller.find(y => y.id === istek.yarimamulId);
    const kartRotaId = (ym && ym.rotaId) || '';
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b>${App.escapeHtml(istek.yarimamulAd)}</b> — eksik adet: ${App.fmt(istek.adet, 0)}</div>
      <div class="fgroup"><label class="flbl">Üretim Rotası — kartta işlenen rota otomatik gelir, hat dengeleme için değiştirilebilir</label>
        <select class="fselect" id="ied-rota">
          <option value="">— Rota seçilmedi —</option>
          ${rotalar.map(r => `<option value="${r.id}" ${r.id === kartRotaId ? 'selected' : ''}>${App.escapeHtml(r.kod)} — ${App.escapeHtml(r.ad)} (${(r.steps || []).length} istasyon)${r.id === kartRotaId ? ' ★ kart rotası' : ''}</option>`).join('')}
        </select></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Üretilecek Adet</label><input class="finput" id="ied-adet" type="number" value="${istek.adet}" min="1"></div>
        <div class="fgroup"><label class="flbl">Planlanan Tarih</label><input class="finput" id="ied-tarih" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Not</label><textarea class="ftextarea" id="ied-not">Sipariş onayında rafta eksik çıkan yarı mamül ihtiyacından otomatik oluşturuldu.</textarea></div>
    `;
    const footer = `<button class="btn" id="ied-cancel">Vazgeç</button><button class="btn btn-blue" id="ied-confirm">İş Emri Oluştur</button>`;
    App.openModal({ title: 'Yarı Mamül İş Emrine Dönüştür', sub: istek.yarimamulKod, body, footer, wide: true });
    document.getElementById('ied-cancel').onclick = App.closeModal;
    document.getElementById('ied-confirm').onclick = async () => {
      const adet = parseInt(document.getElementById('ied-adet').value) || istek.adet;
      const ie = {
        id: App.uid('IE'),
        kod: 'IE-' + Date.now().toString(36).toUpperCase(),
        tip: 'yarimamul',
        urunId: null, urunAdi: App.escapeHtml(istek.yarimamulAd) + ' (Yarı Mamül İhtiyacı)',
        adet, tarih: document.getElementById('ied-tarih').value,
        not: document.getElementById('ied-not').value.trim(),
        durum: 'taslak',
        kaynakIhtiyacId: istek.id,
        kaynakSiparisIdler: istek.kaynakSiparisler || [], // Canlı İzleme bu bağla siparişe ulaşır
        uretimListesi: [{ tip: 'yarimamul', refId: istek.yarimamulId, miktarBirim: 1, birim: 'ADET', gerekliToplam: adet, uretildi: 0, rotaId: document.getElementById('ied-rota').value || null }]
      };
      await App.persist(() => Store.isemirleri.upsert(ie));
      // BULGU (T3-29): MRP kaynaklı (rafta eksik yarımamül) iş emirleri
      // için kesim ihtiyacı hiç oluşmuyordu — Kesim Optimizasyonu ekranı
      // bu üretimden habersiz kalıyordu.
      await App.persist(() => App.isEmriKesimIhtiyaciOlustur(ie));

      istek.durum = 'isemrine_donduruldu';
      istek.acilanAdet = adet;
      await App.persist(() => Store.uretimIsEmriIhtiyaclari.upsert(istek));

      App.toast('İş emri oluşturuldu: ' + ie.kod + ' — İş Emirleri sayfasından takip edebilirsiniz', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // ── ARIZA BİLDİRİMİ (Üretim → Bakım) ────────────────────────────────────
  function renderArizaTab(arizaKayitlari, makinalar) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Üretimden Açılan Arıza Kayıtları</div></div>`;
    if (!arizaKayitlari.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz arıza kaydı açılmadı. "⚠ Arıza Bildir" ile bakım birimine bildirim gönderebilirsiniz.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Tarih</th><th>Makina</th><th>Arıza Sebebi</th><th>Durum</th><th>Bakım Notu</th></tr>`;
      [...arizaKayitlari].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(a => {
        const m = makinalar.find(x => x.id === a.makinaId);
        html += `<tr><td style="font-size:11px">${a.tarih}</td><td>${m ? App.escapeHtml(m.ad) : '—'}</td>
          <td style="font-size:11.5px">${App.escapeHtml(a.arizaSebebi)}</td>
          <td>${arizaDurumPill(a.durum)}</td>
          <td style="font-size:11px">${App.escapeHtml(a.bakimNotu || '—')}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function arizaDurumPill(d) {
    const map = { bekliyor: ['Bakım Bekliyor', 'pill-amber'], islemde: ['İşleme Alındı', 'pill-blue'], tamamlandi: ['Tamamlandı', 'pill-green'] };
    const [l, c] = map[d] || ['Bekliyor', 'pill-amber'];
    return `<span class="pill ${c}">${l}</span>`;
  }

  function openArizaBildirForm(makinalar, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Makina/Teçhizat</label>
        <select class="fselect" id="ab-makina">
          ${makinalar.map(m => `<option value="${m.id}">${App.escapeHtml(m.kod)} — ${App.escapeHtml(m.ad)}${m.durum === 'arizali' ? ' (⚠ zaten arızalı)' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="fgroup"><label class="flbl">Arıza Sebebi</label><textarea class="ftextarea" id="ab-sebep" placeholder="Arızanın ne olduğunu, ne zaman başladığını detaylı açıklayın"></textarea></div>
      <div class="fgroup"><label class="flbl">Öncelik</label>
        <select class="fselect" id="ab-oncelik">
          <option value="normal">Normal</option>
          <option value="acil">Acil — üretim duruyor</option>
        </select>
      </div>
    `;
    const footer = `<button class="btn" id="ab-cancel">Vazgeç</button><button class="btn btn-amber" id="ab-confirm">Bakıma Bildir</button>`;
    App.openModal({ title: 'Arıza Bildir', body, footer, wide: true });
    document.getElementById('ab-cancel').onclick = App.closeModal;
    document.getElementById('ab-confirm').onclick = async () => {
      const sebep = document.getElementById('ab-sebep').value.trim();
      if (!sebep) { App.toast('Arıza sebebi zorunlu', 'err'); return; }
      const makinaId = document.getElementById('ab-makina').value;
      const kayit = {
        id: App.uid('ARZ'), makinaId,
        arizaSebebi: sebep, oncelik: document.getElementById('ab-oncelik').value,
        durum: 'bekliyor', tarih: new Date().toISOString().slice(0, 10),
        // BULGU (T3-30): OEE'nin duruş süresine (kpi_motor.js) 'acil'
        // arızaları da katabilmesi için hassas açılış zaman damgası.
        zaman: new Date().toISOString()
      };
      await App.persist(() => Store.arizaKayitlari.upsert(kayit));
      // BULGU (T3-25): arıza açılınca makinaTechizat.durum hiç değişmiyordu —
      // planlama/hat_takip makinanın arızalı olduğunu göremiyor, iş atanmaya
      // devam edilebiliyordu. Artık makina 'arizali' durumuna çekilir; arıza
      // kapatılınca (bkz. Bakım Panel "✓ Tamamlandı") önceki durumuna döner.
      const tumMakinalar = await Store.makinaTechizat.all();
      const makina = tumMakinalar.find(m => m.id === makinaId);
      if (makina && makina.durum !== 'arizali') {
        makina.oncekiDurumArizaOncesi = makina.durum;
        makina.durum = 'arizali';
        await App.persist(() => Store.makinaTechizat.upsert(makina));
      }
      App.toast('Arıza bakım birimine bildirildi, makina arızalı olarak işaretlendi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // ── HAMMADDE İHTİYACI: sipariş onaylarından konsolide gelen, TÜM reçete ──
  // kalemlerini (plaka+hırdavat) kapsayan hammadde bazlı ihtiyaç listesi.
  // Planlama burada manuel ekleme/çıkarma/miktar düzenlemesi yapabilir,
  // ardından "Onayla ve Satınalmaya Gönder" ile partiyi kapatıp Satınalma
  // Paneli'ne yeni satınalma talepleri olarak düşürür.
  function renderHammaddeIhtiyaciTab(hammaddeIhtiyaclari, hammaddeler) {
    const acikParti = hammaddeIhtiyaclari.find(p => p.durum === 'acik');
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Açık Hammadde İhtiyacı (Onay Bekliyor)</div>
        <button class="btn btn-sm" id="up-hi-manuel-ekle">+ Manuel Kalem Ekle</button>
      </div>`;
    if (!acikParti || !acikParti.kalemler.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="eicon">▭</div><div class="etitle">Açık hammadde ihtiyacı yok</div><div class="edesc">Bir sipariş onaylandığında, ürünlerin reçetesindeki tüm hammadde/hırdavat kalemleri burada konsolide birikir.</div></div>`;
      html += `</div>`;
      return html;
    }
    html += `<div class="fhint" style="margin-bottom:10px">Kaynak siparişler: ${(acikParti.kaynakSiparisler || []).join(', ') || '—'}</div>`;
    html += `<table class="dtable"><tr><th>Stok Kodu</th><th>Hammadde</th><th class="r">Toplam İhtiyaç</th><th>Kaynak</th><th></th></tr>`;
    acikParti.kalemler.forEach((k, i) => {
      const hm = hammaddeler.find(h => h.id === k.hammaddeId);
      html += `<tr>
        <td class="mono" style="font-size:11px">${hm ? App.escapeHtml(hm.stokKodu || '') : '—'}</td>
        <td>${hm ? App.escapeHtml(hm.ad) : '<span style="color:var(--red-text)">⚠ Hammadde bulunamadı</span>'}</td>
        <td class="r"><input class="finput up-hi-miktar" data-i="${i}" type="number" min="0" step="0.01" value="${k.miktar}" style="width:90px;text-align:right"></td>
        <td>${k.manuelEklendi ? '<span class="pill pill-gray">Manuel</span>' : '<span class="pill pill-blue">Sipariş</span>'}</td>
        <td><button class="btn btn-icon btn-ghost up-hi-sil" data-i="${i}" style="color:var(--red-text)">&times;</button></td>
      </tr>`;
    });
    html += `</table>
      <div style="margin-top:14px;display:flex;justify-content:flex-end">
        <button class="btn btn-green" id="up-hi-onayla">✓ Onayla ve Satınalmaya Gönder</button>
      </div>
    </div>`;
    return html;
  }

  function wireHammaddeIhtiyaciTab(hammaddeIhtiyaclari, hammaddeler, render, main) {
    const acikParti = hammaddeIhtiyaclari.find(p => p.durum === 'acik');
    if (!acikParti) {
      const ekleBtn = document.getElementById('up-hi-manuel-ekle');
      if (ekleBtn) ekleBtn.onclick = () => openManuelHammaddeEkle(hammaddeler, null, () => render(main));
      return;
    }
    document.querySelectorAll('.up-hi-miktar').forEach(inp => inp.onchange = async () => {
      const i = parseInt(inp.dataset.i);
      acikParti.kalemler[i].miktar = parseFloat(inp.value) || 0;
      await App.persist(() => Store.hammaddeIhtiyaclari.upsert(acikParti));
      App.toast('Miktar güncellendi', 'ok');
    });
    document.querySelectorAll('.up-hi-sil').forEach(b => b.onclick = async () => {
      const i = parseInt(b.dataset.i);
      acikParti.kalemler.splice(i, 1);
      await App.persist(() => Store.hammaddeIhtiyaclari.upsert(acikParti));
      App.toast('Kalem kaldırıldı', 'ok');
      render(main);
    });
    const manuelEkleBtn = document.getElementById('up-hi-manuel-ekle');
    if (manuelEkleBtn) manuelEkleBtn.onclick = () => openManuelHammaddeEkle(hammaddeler, acikParti, () => render(main));

    const onaylaBtn = document.getElementById('up-hi-onayla');
    if (onaylaBtn) onaylaBtn.onclick = () => {
      App.confirmDialog('Bu hammadde ihtiyacı listesini onaylayıp Satınalma Paneli\'ne göndermek istediğinize emin misiniz?', async () => {
        const sonuc = await App.persist(() => App.hammaddeIhtiyaciOnaylaSatinalmayaGonder(acikParti));
        App.toast(`Onaylandı, Satınalma Paneli'ne ${sonuc.olusturulanTalepSayisi} satınalma talebi gönderildi.`, 'ok');
        render(main);
      });
    };
  }

  // Planlama'nın da kritik stok altına düşmüş hammaddeleri görüp Satınalmaya
  // talep açabilmesi için Depo Paneli'ndeki mantığı kısa bir özet kartıyla
  // burada da gösteriyoruz (Depo VEYA Planlama, herhangi biri yeterli).
  function renderKritikStokOzet(hammaddeler, stokRaf, kritikStokSeviyeleri) {
    const altindakiler = hammaddeler.filter(h => {
      const kritik = kritikStokSeviyeleri.find(k => k.hammaddeId === h.id);
      if (!kritik) return false;
      const stokMiktar = App.stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', h.id);
      return stokMiktar < kritik.miktar;
    });
    if (!altindakiler.length) return '';
    let html = `<div class="card" style="background:var(--red-bg);border-color:var(--red-light)">
      <div class="card-hdr"><div class="card-title" style="color:var(--red-text)">⚠ Kritik Stok Altındaki Hammaddeler (Planlama Onayıyla da Talep Açılabilir)</div></div>
      <table class="dtable">`;
    altindakiler.forEach(h => {
      const stokMiktar = App.stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', h.id);
      const kritik = kritikStokSeviyeleri.find(k => k.hammaddeId === h.id);
      html += `<tr><td>${App.escapeHtml(h.ad)}</td>
        <td class="r">${App.fmt(stokMiktar, 1)} / kritik: ${App.fmt(kritik.miktar, 1)} ${App.escapeHtml(h.birim)}</td>
        <td><button class="btn btn-sm btn-amber up-kritik-talep" data-id="${h.id}">Satınalmaya Talep Aç</button></td></tr>`;
    });
    html += `</table></div>`;
    return html;
  }

  function wireKritikStokOzet(hammaddeler, render, main) {
    document.querySelectorAll('.up-kritik-talep').forEach(b => b.onclick = () => {
      const hm = hammaddeler.find(h => h.id === b.dataset.id);
      PageModules.depo_panel.openKritikTalepForm(hm, () => render(main));
    });
  }

  function openManuelHammaddeEkle(hammaddeler, mevcutParti, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <button class="btn btn-blue" id="mh-sec-sayfa" style="width:100%">🔍 Hammadde Seç (Ara &amp; Listele)</button>
    `;
    const footer = `<button class="btn" id="mh-cancel">Kapat</button>`;
    App.openModal({ title: 'Manuel Hammadde İhtiyacı Ekle', body, footer });
    document.getElementById('mh-cancel').onclick = App.closeModal;
    document.getElementById('mh-sec-sayfa').onclick = () => {
      App.closeModal();
      const secenekler = hammaddeler.map(h => ({
        grup: h.tip, kod: h.stokKodu || h.id, ad: h.ad, birim: h.birim,
        netFiyat: App.toTRY(h.birimFiyat, h.dvz, App.state.ayarlar), maliyetYok: !h.birimFiyat, _id: h.id
      }));
      App.goTo('kalem_secici', {
        baslik: 'Manuel Hammadde İhtiyacı İçin Seç',
        secenekler,
        gruplar: { plaka: 'Plaka', hirdavat: 'Hırdavat' },
        geriDon: () => App.goTo('uretim_panel'),
        onSecildi: async (secim) => {
          const hm = hammaddeler.find(h => h.id === secim._id);
          if (!hm) return;
          const body2 = document.createElement('div');
          body2.innerHTML = `<div class="fgroup"><label class="flbl">Miktar (${hm.birim})</label><input class="finput" id="mh-miktar" type="number" value="1" min="0.01" step="0.01"></div>`;
          App.openModal({ title: 'Miktar Girin', sub: hm.ad, body: body2, footer: `<button class="btn btn-blue" id="mh-confirm">Ekle</button>` });
          document.getElementById('mh-confirm').onclick = async () => {
            const miktar = parseFloat(document.getElementById('mh-miktar').value) || 1;
            App.closeModal();
            let hammaddeIhtiyaclari = await Store.hammaddeIhtiyaclari.all();
            let parti = hammaddeIhtiyaclari.find(p => p.durum === 'acik');
            if (!parti) {
              parti = { id: App.uid('HIH'), durum: 'acik', kalemler: [], kaynakSiparisler: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
              hammaddeIhtiyaclari.push(parti);
            }
            const mevcutKalem = parti.kalemler.find(k => k.hammaddeId === hm.id);
            if (mevcutKalem) mevcutKalem.miktar += miktar;
            else parti.kalemler.push({ hammaddeId: hm.id, miktar, birim: hm.birim, manuelEklendi: true });
            await App.persist(() => Store.hammaddeIhtiyaclari.save(hammaddeIhtiyaclari));
            App.toast('Manuel hammadde ihtiyacı eklendi', 'ok');
            App.goTo('uretim_panel');
            onSaved();
          };
        }
      });
    };
  }

  // ── ÜRETİM KUYRUĞU: kapasite KPI + manuel ekle/çıkar + renk bazlı toplu kesim ──
  function siparisRengi(siparis, urunler, receteler, yarimamuller) {
    // Bir siparişin "rengi", ilk kaleminin ürününe ait reçetedeki ilk yarı mamülün rengidir.
    // Birden fazla renk içeren karma siparişlerde de en sık geçen renk baz alınır.
    const renkSayim = {};
    (siparis.kalemler || []).forEach(k => {
      const urun = urunler.find(u => u.kod === k.kod);
      if (!urun) return;
      const recete = receteler.find(r => r.urunId === urun.id);
      if (!recete) return;
      recete.kalemler.forEach(rk => {
        const ym = yarimamuller.find(y => y.id === rk.refId);
        if (ym && ym.renk) renkSayim[ym.renk] = (renkSayim[ym.renk] || 0) + 1;
      });
    });
    const renkler = Object.entries(renkSayim).sort((a, b) => b[1] - a[1]);
    return renkler.length ? renkler[0][0] : 'Belirsiz';
  }

  function siparisToplamAdet(siparis) {
    return (siparis.kalemler || []).reduce((a, k) => a + (k.miktar || 0), 0);
  }

  function renderKuyrukTab(siparisler, urunler, receteler, yarimamuller) {
    // T3-23: kısmen sevk edilmiş ('kismi_sevk_edildi') siparişler de üretim
    // kuyruğundan çıkar — bu duruma gelebilmek için zaten uretimDurumu
    // 'tamamlandi' olması gerekiyordu (bkz. sevkEdilebilir filtreleri),
    // yani üretim bitmiş, sevkiyat aşamasındadır.
    const kuyruktakiler = siparisler.filter(s => s.uretimKuyrugunda && s.durum !== 'sevk_edildi' && s.durum !== 'kismi_sevk_edildi' && s.durum !== 'reddedildi');
    const bekleyenler = siparisler.filter(s => !s.uretimKuyrugunda && (s.durum === 'onaylandi' || s.durum === 'cari_onay_bekliyor'));

    const today = new Date().toISOString().slice(0, 10);
    const bugunToplamAdet = kuyruktakiler
      .filter(s => !s.uretimTermini || s.uretimTermini === today)
      .reduce((a, s) => a + siparisToplamAdet(s), 0);
    const kapasiteAsildi = bugunToplamAdet > GUNLUK_KAPASITE;

    let html = `<div class="grid grid-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Kuyruktaki Sipariş</div><div class="kpi-val blue">${kuyruktakiler.length}</div></div>
      <div class="kpi"><div class="kpi-lbl">Bugün İçin Planlanan Adet</div><div class="kpi-val ${kapasiteAsildi ? 'red' : 'green'}">${bugunToplamAdet} / ${GUNLUK_KAPASITE}</div></div>
      <div class="kpi"><div class="kpi-lbl">Onay Bekleyen (Kuyrukta Değil)</div><div class="kpi-val amber">${bekleyenler.length}</div></div>
    </div>`;

    if (kapasiteAsildi) {
      html += `<div class="card" style="background:var(--red-bg);border-color:var(--red-light)">
        <div style="font-size:12px;color:var(--red-text);font-weight:700">⚠ Günlük kapasite aşıldı! Bugün için planlanan ${bugunToplamAdet} adet, kapasite sınırı ${GUNLUK_KAPASITE} adet. Bazı siparişlerin termin tarihini ileriye almayı veya kuyruktan çıkarmayı değerlendirin.</div>
      </div>`;
    }

    // Renk bazlı gruplama + toplu kesim önerisi
    const renkGruplari = {};
    kuyruktakiler.forEach(s => {
      const renk = siparisRengi(s, urunler, receteler, yarimamuller);
      if (!renkGruplari[renk]) renkGruplari[renk] = [];
      renkGruplari[renk].push(s);
    });
    const tekrarliRenkler = Object.entries(renkGruplari).filter(([renk, list]) => list.length > 1);

    if (tekrarliRenkler.length) {
      html += `<div class="card" style="background:var(--blue-bg);border-color:var(--blue-light)">
        <div class="card-hdr" style="margin-bottom:8px"><div class="card-title" style="color:var(--blue-text)">Aynı Renk Toplu Kesim Önerisi</div></div>`;
      tekrarliRenkler.forEach(([renk, list]) => {
        const toplamAdet = list.reduce((a, s) => a + siparisToplamAdet(s), 0);
        html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--blue-light)">
          <span class="pill pill-blue">${App.escapeHtml(renk)}</span>
          <div style="flex:1;font-size:12px">${list.length} sipariş, toplam <b>${toplamAdet}</b> adet — birlikte kesime alınabilir: ${list.map(s => s.kod).join(', ')}</div>
          <button class="btn btn-sm btn-blue up-toplu-kesim" data-renk="${App.escapeHtml(renk)}">Kesim Optimizasyonuna Gönder</button>
        </div>`;
      });
      html += `</div>`;
    }

    html += `<div class="card">
      <div class="card-hdr"><div class="card-title">Üretim Kuyruğu</div></div>`;
    if (!kuyruktakiler.length) {
      html += `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Kuyrukta sipariş yok. Cari İşlemler'de onaylanan siparişler otomatik buraya düşer.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Sipariş</th><th>Müşteri</th><th class="r">Adet</th><th>Renk</th><th>Termin</th><th></th></tr>`;
      kuyruktakiler.forEach(s => {
        const renk = siparisRengi(s, urunler, receteler, yarimamuller);
        html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi || '—')}</td>
          <td class="r">${siparisToplamAdet(s)}</td><td><span class="pill pill-gray">${App.escapeHtml(renk)}</span></td>
          <td>${s.uretimTermini || '<span class="muted">Belirlenmedi</span>'}</td>
          <td><button class="btn btn-sm btn-ghost up-cikar-kuyruk" data-id="${s.id}">Kuyruktan Çıkar</button></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    html += `<div class="card">
      <div class="card-hdr"><div class="card-title">Kuyruğa Eklenebilecek Siparişler (Manuel)</div></div>`;
    if (!bekleyenler.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Eklenebilecek sipariş yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Sipariş</th><th>Müşteri</th><th class="r">Adet</th><th>Durum</th><th></th></tr>`;
      bekleyenler.forEach(s => {
        html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi || '—')}</td>
          <td class="r">${siparisToplamAdet(s)}</td><td>${s.durum === 'onaylandi' ? '<span class="pill pill-green">Onaylı</span>' : '<span class="pill pill-amber">Cari Onayında</span>'}</td>
          <td><button class="btn btn-sm btn-blue up-ekle-kuyruk" data-id="${s.id}">Kuyruğa Ekle</button></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;

    return html;
  }

  function wireKuyrukTab(siparisler, urunler, render, main) {
    main.querySelectorAll('.up-cikar-kuyruk').forEach(b => b.onclick = async () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      s.uretimKuyrugunda = false;
      await App.persist(() => Store.siparisler.upsert(s));
      App.toast('Sipariş üretim kuyruğundan çıkarıldı', 'ok');
      render(main);
    });
    main.querySelectorAll('.up-ekle-kuyruk').forEach(b => b.onclick = async () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      s.uretimKuyrugunda = true;
      await App.persist(() => Store.siparisler.upsert(s));
      App.toast('Sipariş üretim kuyruğuna eklendi', 'ok');
      render(main);
    });
    main.querySelectorAll('.up-toplu-kesim').forEach(b => b.onclick = () => {
      App.toast('"' + b.dataset.renk + '" renginde toplu kesim için Kesim Optimizasyonu sayfasına yönlendiriliyorsunuz', 'ok');
      App.goTo('nesting');
    });
  }

  function renderStokTab(stokRaf, yarimamuller, talepler) {
    const ymStok = stokRaf.filter(s => s.tip === 'yarimamul' && s.ambar === 'uretim_ambari');
    const acikTalepler = talepler.filter(t => t.kaynak === 'uretim_ym');
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Raftaki Yarı Mamül Stokları</div></div>
      <div class="tbl-wrap"><table class="dtable">
        <tr><th>Kod</th><th>Ad</th><th class="r">Rafta Mevcut</th><th class="r">Açık Talep</th><th>Durum</th></tr>`;
    ymStok.forEach(s => {
      const acikMiktar = acikTalepler.filter(t => t.kalemRefId === s.refId && t.durum === 'beklemede').reduce((a, t) => a + t.miktar, 0);
      const durum = s.miktar < 10 ? ['Kritik Düşük', 'pill-red'] : s.miktar < 25 ? ['Düşük', 'pill-amber'] : ['Yeterli', 'pill-green'];
      html += `<tr>
        <td class="mono">${App.escapeHtml(s.refKod || '')}</td>
        <td>${App.escapeHtml(s.refAd || '')}</td>
        <td class="r"><b>${App.fmt(s.miktar, 0)}</b> ${s.birim}</td>
        <td class="r">${acikMiktar > 0 ? App.fmt(acikMiktar, 0) + ' ' + s.birim : '—'}</td>
        <td><span class="pill ${durum[1]}">${durum[0]}</span></td>
      </tr>`;
    });
    html += `</table></div></div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Açılan Yarı Mamül Talepleri</div></div>`;
    if (!acikTalepler.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz talep açılmadı.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Talep Kodu</th><th>Kalem</th><th class="r">Miktar</th><th>Durum</th><th>Tarih</th></tr>`;
      [...acikTalepler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(t => {
        html += `<tr><td class="mono">${t.kod}</td><td>${App.escapeHtml(t.kalemAdi)}</td><td class="r">${App.fmt(t.miktar, 0)}</td>
          <td>${t.durum === 'beklemede' ? '<span class="pill pill-amber">Beklemede</span>' : '<span class="pill pill-green">Karşılandı</span>'}</td>
          <td style="font-size:11px">${t.tarih}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function renderHammaddeTab(hammaddeler, stokRaf, satinalmaTalepleri) {
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Tüm Hammadde Stokları (Hammadde Deposu — Görüntüleme)</div></div>
      <div class="tbl-wrap"><table class="dtable">
        <tr><th>Stok Kodu</th><th>Ad</th><th class="r">Stok Miktarı</th><th class="r">Birim Fiyat</th></tr>`;
    hammaddeler.forEach(h => {
      const miktar = App.stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', h.id);
      const dvzSym = h.dvz === 'USD' ? '$' : h.dvz === 'EUR' ? '€' : '₺';
      html += `<tr><td class="mono" style="font-size:11px">${App.escapeHtml(h.stokKodu || '')}</td><td>${App.escapeHtml(h.ad)}</td>
        <td class="r">${App.fmt(miktar, 0)} ${App.escapeHtml(h.birim)}</td>
        <td class="r">${dvzSym}${App.fmt(h.birimFiyat, 2)}</td></tr>`;
    });
    html += `</table></div></div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Açık Satınalma Talepleri</div></div>`;
    const acik = satinalmaTalepleri.filter(s => s.durum !== 'tamamlandi');
    if (!acik.length) {
      html += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Açık satınalma talebi yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Kod</th><th>Kalem</th><th class="r">Miktar</th><th>Tedarikçi</th><th>Durum</th></tr>`;
      acik.forEach(s => {
        const durumMap = { teklif_bekleniyor: ['Teklif Bekleniyor', 'pill-amber'], onay_bekliyor: ['Onayda', 'pill-purple'], onaylandi: ['Onaylandı, Yolda', 'pill-green'] };
        const [l, c] = durumMap[s.durum] || ['Beklemede', 'pill-gray'];
        html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.kalemAdi)}</td><td class="r">${App.fmt(s.miktar, 0)}</td>
          <td>${App.escapeHtml(s.tedarikciAdi || '—')}</td><td><span class="pill ${c}">${l}</span></td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  // Bu siparişle ilişkili TÜM istasyon kartları: doğrudan sipariş kartları +
  // siparişin ihtiyacından açılan İŞ EMİRLERİNİN kartları (hat takibinde
  // ilerletilen yarı mamüller buradan izlenir).
  function siparisIliskiliKartlar(siparisId, istasyonIsleri, isemirleri, ihtiyaclar) {
    // ÖNEMLİ: eşleştirme YALNIZCA KİMLİK bağıyla yapılır — asla yarı mamül
    // koduyla değil. Aynı (veya aynı kodlu farklı renkli) ürün başka bir
    // siparişte üretilmiş olabilir; kod eşleşmesiyle bağlansaydı o siparişin
    // BİTMİŞ kartları yeni siparişe düşer ve yeni sipariş "tamamlanmış" görünürdü.
    // Bağ zinciri: sipariş → ihtiyaç (kaynakSiparisler) → iş emri
    // (kaynakSiparisIdler / kaynakIhtiyacId) → istasyon kartı (kaynakId).
    const siparisIhtiyacIdler = new Set((ihtiyaclar || [])
      .filter(x => (x.kaynakSiparisler || []).includes(siparisId)).map(x => x.id));
    const ieIdler = new Set((isemirleri || []).filter(ie =>
      (ie.kaynakSiparisIdler || []).includes(siparisId) ||
      (ie.kaynakIhtiyacId && siparisIhtiyacIdler.has(ie.kaynakIhtiyacId))
    ).map(ie => ie.id));
    return (istasyonIsleri || []).filter(x =>
      (x.kaynakTip === 'sip' && x.kaynakId === siparisId) ||
      (x.kaynakTip === 'ie' && ieIdler.has(x.kaynakId)));
  }

  // Bir siparişin şu an hangi hat/istasyonlarda olduğunu özetler
  function siparisHatOzeti(siparisId, istasyonIsleri, isemirleri, ihtiyaclar) {
    const kartlar = siparisIliskiliKartlar(siparisId, istasyonIsleri, isemirleri, ihtiyaclar).filter(x => x.durum === 'aktif');
    if (!kartlar.length) return '<span class="muted" style="font-size:10.5px">Hatta iş yok</span>';
    const hatlar = [...new Set(kartlar.map(x => x.hat + ' → ' + x.istasyonKod))];
    return hatlar.slice(0, 3).map(h => `<span class="pill pill-blue" style="font-size:9px;margin:1px">${App.escapeHtml(h)}</span>`).join('') +
      (hatlar.length > 3 ? `<span class="muted" style="font-size:9.5px"> +${hatlar.length - 3}</span>` : '');
  }

  // Stoktan karşılanabilirlik özeti: takımlanabilen / istenen
  function stokKarsilanabilirOzet(siparis, urunler, receteler, stokRaf, yarimamuller) {
    const durumlar = App.siparisTakimlamaDurumu(siparis, urunler, receteler, stokRaf, yarimamuller);
    if (!durumlar.length) return { html: '<span class="muted" style="font-size:10.5px">—</span>', eksikVar: false };
    const toplamIstenen = durumlar.reduce((a, d) => a + d.istenen, 0);
    const toplamKarsilanan = durumlar.reduce((a, d) => a + d.karsilanabilir, 0);
    const eksikVar = durumlar.some(d => d.eksikler.length > 0);
    const tam = toplamKarsilanan >= toplamIstenen && toplamIstenen > 0;
    const kismi = toplamKarsilanan > 0 && !tam;
    const rozet = tam ? 'pill-green' : kismi ? 'pill-amber' : 'pill-red';
    const etiket = tam ? '✓ Tamamı stoktan' : kismi ? 'Kısmi: ' + toplamKarsilanan + '/' + toplamIstenen : '✗ Takımlanamıyor';
    return {
      html: `<span class="pill ${rozet}" style="font-size:9.5px">${etiket}</span>` +
        (eksikVar ? `<br><span class="muted" style="font-size:9.5px">${durumlar.reduce((a, d) => a + d.eksikler.length, 0)} yarı mamül eksik</span>` : ''),
      eksikVar
    };
  }

  function renderSiparisTab(siparisler, istasyonIsleri, isemirleri, ihtiyaclar, urunler, receteler, stokRaf, yarimamuller) {
    // Kaliteden üretime GERİ GÖNDERİLEN siparişler ayrı başlıkta gösterilir —
    // düzeltme işlemi (harcanan malzeme + işçilik) burada kaydedilir.
    const kalitedenDonenler = siparisler.filter(s => s.kalitedenDondu && s.uretimDurumu === 'uretimde');
    const digerSiparisler = siparisler.filter(s => !(s.kalitedenDondu && s.uretimDurumu === 'uretimde'));

    let html = '';
    if (kalitedenDonenler.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg)">
        <div class="card-hdr"><div class="card-title" style="color:var(--red-text)">⟲ Kaliteden Dönen Siparişler — Düzeltme Bekliyor (${kalitedenDonenler.length})</div></div>
        <div class="fhint" style="margin-bottom:8px">Kalite bu siparişleri reddedip üretime geri gönderdi. Düzeltme işlemini kaydedin: sonuç (düzeltildi / 2. kalite / defolu), sorunlu yarımamül, harcanan malzeme ve işçilik. Bu giderler Yönetim Raporlarına işlenir.</div>
        <table class="dtable"><tr><th>Sipariş</th><th>Müşteri</th><th>Red Gerekçesi</th><th>NCR</th><th></th></tr>`;
      kalitedenDonenler.forEach(s => {
        html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi || '—')}</td>
          <td style="font-size:11px;max-width:220px">${App.escapeHtml(s.kaliteRedNotu || '—')}</td>
          <td class="mono" style="font-size:11px">${App.escapeHtml(s.kaliteRedNcrNo || '—')}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost up-icerik" data-id="${s.id}">☰ İçerik & Reçete</button>
            <button class="btn btn-sm btn-red up-duzeltme" data-id="${s.id}">🔧 Düzeltme İşle</button>
          </td></tr>`;
      });
      html += `</table></div>`;
    }

    html += `<div class="card"><div class="card-hdr"><div class="card-title">Üretilecek Siparişler — Termin Verin</div></div>
      <div class="fhint" style="margin-bottom:8px">"Üretimi Tamamla" tıklandığında hammadde Hammadde Deposu'ndan Üretim Ambarı'na çekilir (otomatik) ve bitmiş ürün KALİTE ONAYINA gönderilir — Kalite onaylamadan Sevkiyat Deposu'na giriş yapmaz, cari onay/irsaliye süreci başlamaz.</div>`;
    if (!digerSiparisler.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Henüz onaylanmış sipariş yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Sipariş Kodu</th><th>Müşteri</th><th class="r">Kalem</th><th>Üretim Termini</th><th>Üretim Durumu</th><th>Stoktan Karşılanabilir (Takımlama)</th><th>Hat / İstasyon</th><th></th></tr>`;
      digerSiparisler.forEach(s => {
        const uretildiMi = s.uretimDurumu === 'tamamlandi';
        const kaliteBekliyorMu = s.uretimDurumu === 'kalite_bekliyor';
        let durumEtiket = '<span class="pill pill-amber">Üretimde</span>';
        if (kaliteBekliyorMu) durumEtiket = '<span class="pill pill-blue">Kalite Onayı Bekliyor</span>';
        else if (uretildiMi) durumEtiket = '<span class="pill pill-green">Kalite Onaylı, Sevkiyat Deposu\'nda</span>';
        html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi || '—')}</td>
          <td class="r">${(s.kalemler || []).length}</td>
          <td>${s.uretimTermini ? s.uretimTermini : '<span class="muted">Belirlenmedi</span>'}</td>
          <td>${durumEtiket}</td>
          <td style="max-width:170px">${stokKarsilanabilirOzet(s, urunler, receteler, stokRaf, yarimamuller).html}
            <div style="margin-top:4px"><button class="btn btn-sm btn-ghost up-takim" data-id="${s.id}">🧩 Takımlama & Stok İş Emri</button></div></td>
          <td style="max-width:180px">${siparisHatOzeti(s.id, istasyonIsleri, isemirleri, ihtiyaclar)}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost up-icerik" data-id="${s.id}">☰ İçerik & Reçete</button>
            <button class="btn btn-sm btn-purple up-canli" data-id="${s.id}">📡 Canlı İzleme</button>
            <button class="btn btn-sm up-termin" data-id="${s.id}">${s.uretimTermini ? 'Termini Güncelle' : 'Termin Ver'}</button>
            ${!uretildiMi && !kaliteBekliyorMu ? `<button class="btn btn-sm btn-green up-uretim-tamamla" data-id="${s.id}">Üretimi Tamamla</button>` : ''}
          </td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireSiparisTab(siparisler, render, main) {
    // Sipariş içeriği + ürün reçeteleri görüntüleme
    main.querySelectorAll('.up-icerik').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      siparisIcerikReceteModal(s);
    });
    // Canlı izleme: hat & istasyon takibindeki anlık durum (kim/nerede/ne kadar sürede)
    main.querySelectorAll('.up-canli').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      canliIzlemeModal(s);
    });
    // Takımlama & stok iş emri
    main.querySelectorAll('.up-takim').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      takimlamaModal(s, render, main);
    });
    // Kaliteden dönen sipariş için düzeltme kaydı
    main.querySelectorAll('.up-duzeltme').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      duzeltmeIsleModal(s, render, main);
    });
    main.querySelectorAll('.up-termin').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fgroup"><label class="flbl">Üretim Termin Tarihi</label>
          <input class="finput" id="ut-tarih" type="date" value="${s.uretimTermini || ''}"></div>
        <div class="fhint" style="margin-bottom:8px">Terminden emin değilseniz sistem <b>mevcut hat yüküne göre</b> gerçekçi bir tarih hesaplayabilir.</div>
        <button class="btn btn-blue" id="ut-oner" style="width:100%">🎯 Kapasiteye Göre Termin Öner</button>
        <div id="ut-oneri-sonuc" style="margin-top:10px"></div>`;
      const footer = `<button class="btn" id="ut-cancel">Vazgeç</button><button class="btn btn-blue" id="ut-save">Kaydet</button>`;
      App.openModal({ title: 'Üretim Termini Ver', sub: s.kod, body, footer });
      document.getElementById('ut-cancel').onclick = App.closeModal;

      // KAPASİTEYE GÖRE TERMİN ÖNERİSİ: siparişin kalemleri mevcut çizelgenin
      // ÜZERİNE yüklenir; sonlu kapasite hesabıyla gerçekçi bitiş bulunur.
      document.getElementById('ut-oner').onclick = async () => {
        const kutu = document.getElementById('ut-oneri-sonuc');
        kutu.innerHTML = '<div class="muted" style="font-size:11.5px">Kapasite hesaplanıyor…</div>';
        try {
          const r = await CizelgeMotor.terminOner(s.kalemler || []);
          if (!r.bulundu) { kutu.innerHTML = `<div class="fhint" style="color:var(--red-text)">${App.escapeHtml(r.mesaj)}</div>`; return; }
          kutu.innerHTML = `<div style="border:1px solid var(--blue-light);background:var(--blue-bg);border-radius:8px;padding:10px 12px">
            <div style="font-size:12.5px"><b>Önerilen termin: <span style="font-size:15px">${r.terminTarihi}</span></b></div>
            <div class="muted" style="font-size:10.5px;margin-top:4px">
              ${r.operasyonSayisi} operasyon · toplam ${App.fmt(r.toplamIsDk, 0)} dk iş<br>
              Hat boş olsaydı: ${r.yalnizBuIsBitis}${r.kuyrukGecikmesiGun > 0 ? ` · <b>kuyruk nedeniyle +${r.kuyrukGecikmesiGun} gün</b>` : ''}</div>
            <button class="btn btn-sm btn-green" id="ut-oneri-uygula" style="margin-top:8px">Bu tarihi kullan</button>
          </div>`;
          document.getElementById('ut-oneri-uygula').onclick = () => {
            document.getElementById('ut-tarih').value = r.terminTarihi;
            App.toast('Önerilen termin forma yazıldı — Kaydet ile onaylayın', 'ok');
          };
        } catch (e) {
          kutu.innerHTML = `<div class="fhint" style="color:var(--red-text)">Termin hesaplanamadı: ${App.escapeHtml(e.message)}</div>`;
        }
      };

      document.getElementById('ut-save').onclick = async () => {
        s.uretimTermini = document.getElementById('ut-tarih').value;
        await App.persist(() => Store.siparisler.upsert(s));
        App.toast('Üretim termini kaydedildi', 'ok');
        App.closeModal();
        render(main);
      };
    });
    main.querySelectorAll('.up-uretim-tamamla').forEach(b => b.onclick = () => {
      const s = siparisler.find(x => x.id === b.dataset.id);
      // Eğer bu siparişte PAKET ihtiyacı varsa, üretim tamamlamadan önce
      // kullanıcının her paketten KAÇ ADET ÜRETİLDİĞİNİ onaylaması istenir
      // (reçeteye göre beklenen adetle karşılaştırma burada gösterilir).
      // Paketler sanal olduğu için bu onay, MRP/depo akışını TETİKLEMEZ —
      // sadece sipariş üzerindeki gerekenPaketler.onaylananAdet alanına
      // yazılır; Kalite ve Sevkiyat ekranları bu bilgiyi kullanır.
      if (s.gerekenPaketler && s.gerekenPaketler.length) {
        openPaketOnaySonraUretimTamamla(s, render, main);
      } else {
        uretimiTamamla(s, render, main);
      }
    });
  }

  // Üretimi Tamamla'dan önce, siparişteki her PAKET için gerçek üretilen
  // adedi sorar (reçeteye göre beklenen adet referans olarak gösterilir).
  async function openPaketOnaySonraUretimTamamla(s, render, main) {
    // Paket kartları ölçü/ağırlık gösterimi için yüklenir
    let paketKartlari = [];
    try { paketKartlari = await Store.paketler.all(); } catch (e) { paketKartlari = []; }
    const kartBul = (kod) => paketKartlari.find(x => x.kod === kod) || null;
    const toplam = { m3: 0, brutKg: 0, netKg: 0, koli: 0 };
    (s.gerekenPaketler || []).forEach(p => {
      const kart = kartBul(p.kod); if (!kart) return;
      const h = App.olculerdenHacim(kart.en, kart.boy, kart.yukseklik);
      const adet = p.adet || 0;
      toplam.koli += adet; toplam.m3 += h.m3 * adet;
      toplam.brutKg += (parseFloat(kart.brutAgirlik) || 0) * adet;
      toplam.netKg += (parseFloat(kart.netAgirlik) || 0) * adet;
    });
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">📦 Bu siparişte reçeteye göre paketleme/koli takibi gereken kalemler var. Üretimi tamamlamadan önce her paketten KAÇ ADET fiilen üretildiğini/paketlendiğini onaylayın.</div>
      <table class="dtable">
        <tr><th>Paket Kodu</th><th>Ad</th><th>Ölçü / Hacim / Ağırlık</th><th class="r">Reçeteye Göre Gerekli</th><th class="r">Fiilen Üretilen/Paketlenen</th></tr>
        ${s.gerekenPaketler.map((p, i) => `<tr>
          <td class="mono">${App.escapeHtml(p.kod)}</td><td>${App.escapeHtml(p.ad)}</td>
          <td style="font-size:10.5px">${(() => {
            const kart = kartBul(p.kod);
            if (!kart) return '<span class="muted">kart yok</span>';
            const h = App.olculerdenHacim(kart.en, kart.boy, kart.yukseklik);
            const par = [];
            if (h.gecerli) par.push(App.fmt(kart.en,0)+'\u00d7'+App.fmt(kart.boy,0)+'\u00d7'+App.fmt(kart.yukseklik,0)+' cm');
            if (h.m3) par.push(App.fmt(h.m3 * (p.adet||1), 3) + ' m\u00b3');
            const brut = (parseFloat(kart.brutAgirlik)||0) * (p.adet||1);
            if (brut) par.push(App.fmt(brut, 1) + ' kg');
            return par.length ? par.join(' \u00b7 ') : '<span class="muted">\u00f6l\u00e7\u00fc girilmemi\u015f</span>';
          })()}</td>
          <td class="r">${App.fmt(p.adet, 0)} ADET</td>
          <td class="r"><input class="finput pko-adet" data-i="${i}" type="number" min="0" step="1" value="${p.onaylananAdet || p.adet}" style="width:90px;text-align:right"></td>
        </tr>`).join('')}
      </table>
      ${(toplam.m3 || toplam.brutKg || toplam.koli) ? `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-top:12px;font-size:11.5px;max-width:340px">
        <div style="font-weight:700;margin-bottom:6px">📦 Reçeteye Göre Toplam</div>
        ${toplam.koli ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2)">Koli Say\u0131s\u0131</span><span class="mono">${App.fmt(toplam.koli,0)} adet</span></div>` : ''}
        ${toplam.m3 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700"><span style="color:var(--text2)">Toplam Hacim</span><span class="mono">${App.fmt(toplam.m3,3)} m\u00b3</span></div>` : ''}
        ${toplam.netKg ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:var(--text2)">Net A\u011f\u0131rl\u0131k</span><span class="mono">${App.fmt(toplam.netKg,1)} kg</span></div>` : ''}
        ${toplam.brutKg ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700"><span style="color:var(--text2)">Br\u00fct A\u011f\u0131rl\u0131k</span><span class="mono">${App.fmt(toplam.brutKg,1)} kg</span></div>` : ''}
      </div>` : ''}
      <div class="fhint" style="margin-top:10px;color:var(--amber-text)">⚠ Bu adetler Kalite Onayı ekranında reçeteyle karşılaştırılacak, uyuşmazlık varsa Kalite onay vermeyecektir.</div>
    `;
    const footer = `<button class="btn" id="pko-cancel">Vazgeç</button><button class="btn btn-green" id="pko-confirm">Onayla ve Üretimi Tamamla</button>`;
    App.openModal({ title: 'Paket Adedi Onayı', sub: s.kod, body, footer, wide: true });
    document.getElementById('pko-cancel').onclick = App.closeModal;
    document.getElementById('pko-confirm').onclick = async () => {
      document.querySelectorAll('.pko-adet').forEach(inp => {
        const i = parseInt(inp.dataset.i);
        s.gerekenPaketler[i].onaylananAdet = parseInt(inp.value) || 0;
        s.gerekenPaketler[i].uretimOnayli = true;
      });
      App.closeModal();
      await uretimiTamamla(s, render, main);
    };
  }

  async function uretimiTamamla(s, render, main) {
      // ── HAT KONTROLÜ: operasyonu bitmemiş iş kartı varsa tamamlamayı ENGELLE ──
      // Hatlarda üretimi süren (durum='aktif') veya adetleri kapanmamış kartlar
      // varken sipariş "tamamlandı" işaretlenirse: sarf düşülür, ürün kaliteye
      // gider ama parça fiilen hatta kalır — stok ile fiziksel gerçek ayrışır.
      // Bu ayrışma kayıp-kaçağın en sessiz kaynağıdır; o yüzden engelliyoruz.
      try {
        const isler = await Store.istasyonIsleri.all();
        const bagli = isler.filter(i => i.kaynakTip === 'sip' && i.kaynakId === s.id);
        const bitmeyen = bagli.filter(i => {
          if (i.durum === 'tamamlandi') return false;
          const kapanan = (+i.sevkEdilenAdet || 0) + (+i.fireAdet || 0);
          return kapanan < (+i.gelenAdet || 0);
        });
        if (bitmeyen.length) {
          const ozet = bitmeyen.slice(0, 6).map(i =>
            `• ${App.escapeHtml(i.ymKod || '')} — ${App.escapeHtml(i.istasyonKod || '')}: ` +
            `${(+i.sevkEdilenAdet || 0)}/${(+i.gelenAdet || 0)} sevk` +
            (i.fireAdet ? `, ${i.fireAdet} fire` : '')
          ).join('<br>') + (bitmeyen.length > 6 ? `<br>… ve ${bitmeyen.length - 6} kart daha` : '');
          App.openModal({
            title: '⛔ Operasyon Bitmedi',
            sub: bitmeyen.length + ' iş kartı hatlarda hâlâ açık',
            body: `<div style="font-size:12.5px;margin-bottom:8px">
                Bu siparişin üretimi <b>tamamlanamaz</b>: aşağıdaki parçalar hatlarda bitmemiş.
                Tamamlandı işaretlenirse malzeme sarf edilir ve ürün kaliteye gider, ama parça
                fiilen hatta kalır — <b>stok kaydı ile fiziksel gerçek ayrışır</b>.
              </div>
              <div style="font-size:11.5px;line-height:1.8;border:1px solid var(--border);border-radius:8px;padding:8px;max-height:240px;overflow:auto">${ozet}</div>
              <div class="muted" style="font-size:11px;margin-top:8px">
                Önce Hat Operatör Terminali / Hat & İstasyon Takibi ekranından bu kartların
                kalite–işlem–sevk adımlarını kapatın.
              </div>`,
            footer: '<button class="btn" id="ut-kapat">Anladım</button>'
          });
          document.getElementById('ut-kapat').onclick = App.closeModal;
          return;
        }
      } catch (e) {
        App.toast('Hat kontrolü yapılamadı: ' + (e && e.message ? e.message : e), 'err');
        return;
      }

      App.confirmDialog('Bu siparişin üretimini tamamlandı olarak işaretlemek istediğinize emin misiniz? Sipariş için gereken TÜM hammadde/yarı mamül stokları otomatik olarak sarf edilecek ve ürünler KALİTE ONAYINA gönderilecek (henüz Sevkiyat Deposu\'na girmez).', async () => {
        // Sipariş onayında hesaplanıp siparişe kaydedilen hammadde ihtiyacı
        // (kesim/raf sarfı hariç, doğrudan hammadde/hırdavat miktarları)
        // Hammadde Deposu'ndan GERÇEKTEN düşülür — üretim fiilen tamamlandığı
        // için bu sarf artık kesinleşir (stok yetersiz olsa bile düşülür,
        // eksi bakiyeye düşmesi depo/satınalma zincirinin takip etmesi
        // gereken bir uyarı niteliğindedir).
        if (s.gerekenHammaddeler && s.gerekenHammaddeler.length) {
          const kalemler = s.gerekenHammaddeler.map(h => ({ tip: 'hammadde', refId: h.hammaddeId, refKod: h.hammaddeKod, refAd: h.hammaddeAd, birim: h.birim, miktar: h.miktar }));
          await App.persist(() => App.uretimBaslarkenHammaddeCek(kalemler));
        }

        // KALİTE KAYITLARI: ürün, yarı mamül ve paket kalemlerinin HEPSİ için
        // kayıt açılır. (Eski sürümde yalnızca 'urun' kalemleri ve yalnızca
        // ürün kartı bulunabilenler için açılıyordu; bu yüzden bazı siparişler
        // "Kalite Onayı Bekliyor" görünüp kalite ekranında hiç çıkmıyordu.)
        const urunler = await Store.urunler.all();
        const urunKaliteOnaylari = await Store.urunKaliteOnaylari.all();
        let acilanKaliteKaydi = 0;
        for (const kalem of (s.kalemler || [])) {
          if (kalem.grup === 'hammadde' || kalem.ikinciKalite) continue;
          const urun = urunler.find(u => u.kod === kalem.kod);
          urunKaliteOnaylari.push({
            id: App.uid('UKO'), siparisId: s.id, siparisKod: s.kod,
            urunId: urun ? urun.id : null,
            urunKod: kalem.kod, urunAd: kalem.ad || (urun ? urun.ad : ''),
            kalemGrup: kalem.grup || 'urun',
            miktar: kalem.miktar || 1, durum: 'bekliyor', tarih: new Date().toISOString().slice(0, 10)
          });
          acilanKaliteKaydi++;
        }
        await App.persist(() => Store.urunKaliteOnaylari.save(urunKaliteOnaylari));
        // Kalite kaydı açılamadıysa siparişi kalitede askıda bırakma
        if (!acilanKaliteKaydi) {
          s.uretimDurumu = 'tamamlandi';
          await App.persist(() => Store.siparisler.upsert(s));
          App.toast('Üretim tamamlandı. Kalite kontrolü gerektiren kalem bulunmadığı için sipariş doğrudan tamamlandı: ' + s.kod, 'ok');
          render(main);
          return;
        }
        s.uretimDurumu = 'kalite_bekliyor';
        await App.persist(() => Store.siparisler.upsert(s));
        App.toast('Üretim tamamlandı, hammadde/yarı mamül stokları sarf edildi, ürünler KALİTE ONAYINA gönderildi: ' + s.kod, 'ok');
        render(main);
      });
  }

  function openTalepForm(yarimamuller, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Yarı Mamül</label>
        <select class="fselect" id="f-ym">
          <option value="">— Seçin —</option>
          ${yarimamuller.map(y => `<option value="${y.id}">${App.escapeHtml(y.kod)} — ${App.escapeHtml(y.ad)}</option>`).join('')}
        </select>
      </div>
      <div class="fgroup"><label class="flbl">İstenen Miktar</label><input class="finput" id="f-miktar" type="number"></div>
      <div class="fgroup"><label class="flbl">Not</label><textarea class="ftextarea" id="f-not"></textarea></div>
    `;
    const footer = `<button class="btn" id="f-cancel">Vazgeç</button><button class="btn btn-blue" id="f-save">Talep Oluştur</button>`;
    App.openModal({ title: 'Yarı Mamül Stok Talebi', body, footer });
    document.getElementById('f-cancel').onclick = App.closeModal;
    document.getElementById('f-save').onclick = async () => {
      const ymId = document.getElementById('f-ym').value;
      const miktar = parseFloat(document.getElementById('f-miktar').value);
      if (!ymId || !miktar) { App.toast('Yarı mamül ve miktar zorunlu', 'err'); return; }
      const ym = yarimamuller.find(y => y.id === ymId);
      const talep = {
        id: App.uid('TLP'),
        kod: 'TLP-' + Date.now().toString(36).toUpperCase(),
        kaynak: 'uretim_ym',
        kalemRefId: ymId, kalemAdi: ym ? (ym.kod + ' — ' + ym.ad) : '—',
        miktar, birim: 'ADET',
        not: document.getElementById('f-not').value.trim(),
        durum: 'beklemede',
        tarih: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.talepler.upsert(talep));
      App.toast('Talep oluşturuldu: ' + talep.kod, 'ok');
      App.closeModal();
      onSaved();
    };
  }

  // ── SİPARİŞ İÇERİĞİ & REÇETE GÖRÜNTÜLEME ────────────────────────────────
  // Üretim Planlama, siparişin kalemlerini ve her ürün kaleminin reçetesini
  // (yarımamül/hammadde kırılımı) tek modalda görür.
  async function siparisIcerikReceteModal(siparis) {
    const [urunler, receteler, yarimamuller, hammaddeler, altMontajlar, paketler] = await Promise.all([
      Store.urunler.all(), Store.receteler.all(), Store.yarimamuller.all(), Store.hammaddeler.all(), Store.altMontajlar.all(), Store.paketler.all()
    ]);
    const body = document.createElement('div');
    let html = `<table class="dtable" style="font-size:11.5px;margin-bottom:12px">
      <tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Net Fiyat</th><th></th></tr>
      ${(siparis.kalemler || []).map((k, i) => `<tr>
        <td><b class="mono">${App.escapeHtml(k.kod)}</b>${k.ikinciKalite ? ' <span class="pill pill-amber" style="font-size:9px">2.K</span>' : ''}<br><span class="muted" style="font-size:10px">${App.escapeHtml(k.ad)}</span></td>
        <td class="r">${App.fmt(k.miktar || 1, 0)}</td>
        <td class="r">${App.fmtTL(k.netFiyat || 0)}</td>
        <td>${k.grup === 'urun' && !k.ikinciKalite ? `<button class="btn btn-sm btn-ghost sir-recete" data-kod="${App.escapeHtml(k.kod)}">📋 Reçete</button>` : ''}</td>
      </tr>`).join('')}
    </table>
    <div id="sir-recete-alani"></div>`;
    body.innerHTML = html;
    App.openModal({ title: '☰ Sipariş İçeriği & Reçeteler', sub: siparis.kod + ' — ' + (siparis.musteriAdi || ''), body, footer: `<button class="btn" id="sir-kapat">Kapat</button>`, xwide: true });
    document.getElementById('sir-kapat').onclick = App.closeModal;

    body.querySelectorAll('.sir-recete').forEach(btn => btn.onclick = () => {
      const urun = urunler.find(u => u.kod === btn.dataset.kod);
      const alan = document.getElementById('sir-recete-alani');
      if (!urun) { alan.innerHTML = '<div class="fhint">Ürün kartı bulunamadı.</div>'; return; }
      const recete = receteler.find(r => r.urunId === urun.id);
      if (!recete || !(recete.kalemler || []).length) { alan.innerHTML = `<div class="fhint">「${App.escapeHtml(urun.ad)}」 için reçete tanımlı değil.</div>`; return; }
      const TIP_ETIKET = { hammadde: ['Hammadde', 'pill-gray'], yarimamul: ['Yarı Mamül', 'pill-blue'], alt_montaj: ['Alt Montaj', 'pill-purple'], paket: ['Paket', 'pill-teal'], urun: ['Ürün', 'pill-green'] };
      const adBul = (kalem) => {
        if (kalem.tip === 'hammadde') { const h = hammaddeler.find(x => x.id === kalem.refId); return h ? (h.stokKodu + ' — ' + h.ad) : kalem.refId; }
        if (kalem.tip === 'yarimamul') { const y = yarimamuller.find(x => x.id === kalem.refId); return y ? (y.kod + ' — ' + y.ad) : kalem.refId; }
        if (kalem.tip === 'alt_montaj') { const a = altMontajlar.find(x => x.id === kalem.refId); return a ? (a.kod + ' — ' + a.ad) : kalem.refId; }
        if (kalem.tip === 'paket') { const p = paketler.find(x => x.id === kalem.refId); return p ? (p.kod + ' — ' + p.ad) : kalem.refId; }
        if (kalem.tip === 'urun') { const u = urunler.find(x => x.id === kalem.refId); return u ? (u.kod + ' — ' + u.ad) : kalem.refId; }
        return kalem.refId;
      };
      alan.innerHTML = `<div class="flbl" style="margin:10px 0 6px">📋 Reçete: ${App.escapeHtml(urun.kod)} — ${App.escapeHtml(urun.ad)} (${recete.kalemler.length} kalem)</div>
        <table class="dtable" style="font-size:11px">
          <tr><th>Tip</th><th>Kalem</th><th class="r">Miktar</th><th class="r">Ölçü (En×Boy)</th></tr>
          ${recete.kalemler.map(k => {
            const [tl, tc] = TIP_ETIKET[k.tip] || [k.tip, 'pill-gray'];
            const olcu = k.olcu && (k.olcu.netEn || k.olcu.netBoy) ? `${k.olcu.netEn || '—'}×${k.olcu.netBoy || '—'}` : '—';
            return `<tr><td><span class="pill ${tc}" style="font-size:9.5px">${tl}</span></td>
              <td style="font-size:11px">${App.escapeHtml(adBul(k))}</td>
              <td class="r">${App.fmt(k.miktar || 1, 2)} ${App.escapeHtml(k.birim || '')}</td>
              <td class="r mono" style="font-size:10px">${olcu}</td></tr>`;
          }).join('')}
        </table>`;
      alan.scrollIntoView && alan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  // ── KALİTEDEN DÖNEN SİPARİŞ İÇİN DÜZELTME KAYDI ─────────────────────────
  // Sonuç: 'duzeltildi' → sipariş tekrar kalite onayına gider.
  //        '2_kalite' | 'defolu' → ürün iade ambarına alınır (satışa sunulmak üzere).
  // Sorunlu yarımamül ürün reçetesinden seçilir; düzeltmede harcanan malzeme
  // ve işçilik (rota) girilir → duzeltmeGiderleri koleksiyonuna kaydedilir ve
  // Yönetim Raporlarında "Kalite Düzeltme Giderleri" bölümünde görünür.
  async function duzeltmeIsleModal(siparis, render, main) {
    const [urunler, receteler, yarimamuller, hammaddeler, ayarlarKayit] = await Promise.all([
      Store.urunler.all(), Store.receteler.all(), Store.yarimamuller.all(), Store.hammaddeler.all(), Promise.resolve(App.state.ayarlar)
    ]);
    // Siparişteki ürün kalemlerinin reçetelerindeki yarımamülleri topla
    const urunKalemleri = (siparis.kalemler || []).filter(k => k.grup === 'urun');
    const receteYmSecenekleri = [];
    urunKalemleri.forEach(k => {
      const urun = urunler.find(u => u.kod === k.kod);
      if (!urun) return;
      const recete = receteler.find(r => r.urunId === urun.id);
      if (!recete) return;
      (recete.kalemler || []).forEach(rk => {
        if (rk.tip !== 'yarimamul') return;
        const ym = yarimamuller.find(y => y.id === rk.refId);
        if (ym && !receteYmSecenekleri.some(x => x.id === ym.id)) {
          receteYmSecenekleri.push({ id: ym.id, kod: ym.kod, ad: ym.ad, urunKod: k.kod });
        }
      });
    });

    const harcananlar = []; // {hammaddeId, kod, ad, miktar, birim, tutar}
    const saatUcreti = (ayarlarKayit && ayarlarKayit.iscilikSaatUcreti) || 0;

    const body = document.createElement('div');
    function ciz() {
      const malzemeToplam = harcananlar.reduce((a, h) => a + h.tutar, 0);
      const dk = parseFloat((body.querySelector('#dz-iscilik') || {}).value) || 0;
      const iscilikMaliyet = (dk / 60) * saatUcreti;
      const yapanDeger = (body.querySelector('#dz-yapan') || {}).value || '';
      const istasyonDeger = (body.querySelector('#dz-istasyon') || {}).value || '';
      body.innerHTML = `
        <div style="background:var(--red-bg);border-left:3px solid var(--red);padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:11.5px">
          <b style="color:var(--red-text)">Kalite red gerekçesi:</b> ${App.escapeHtml(siparis.kaliteRedNotu || '—')} ${siparis.kaliteRedNcrNo ? '· <b>' + App.escapeHtml(siparis.kaliteRedNcrNo) + '</b>' : ''}
        </div>
        <div class="fgroup"><label class="flbl">Düzeltme Sonucu <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="dz-sonuc">
            <option value="duzeltildi">✔ Düzeltildi — tekrar kalite onayına gönder</option>
            <option value="2_kalite">2. Kalite — iade ambarına al, satışa sunulacak</option>
            <option value="defolu">Defolu — iade ambarına al, satışa sunulacak</option>
          </select></div>
        <div class="fgroup"><label class="flbl">Sorunlu Yarı Mamül (ürün reçetesinden)</label>
          <select class="fselect" id="dz-ym">
            <option value="">— Seçilmedi / genel —</option>
            ${receteYmSecenekleri.map(y => `<option value="${y.id}">${App.escapeHtml(y.kod)} — ${App.escapeHtml(y.ad)} (${App.escapeHtml(y.urunKod)})</option>`).join('')}
          </select></div>

        <div class="hr"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div class="flbl">Düzeltmede Harcanan Malzemeler</div>
          <div style="display:flex;gap:6px">
            <select class="fselect" id="dz-hm-sec" style="max-width:280px;font-size:11px">
              <option value="">— Malzeme seç —</option>
              ${hammaddeler.map(h => `<option value="${h.id}">${App.escapeHtml(h.stokKodu)} — ${App.escapeHtml(h.ad)}</option>`).join('')}
            </select>
            <input class="finput" id="dz-hm-miktar" type="number" step="0.01" min="0.01" placeholder="Miktar" style="width:80px">
            <button class="btn btn-sm btn-blue" id="dz-hm-ekle" type="button">+ Ekle</button>
          </div>
        </div>
        ${harcananlar.length ? `<table class="dtable" style="font-size:11px">
          <tr><th>Malzeme</th><th class="r">Miktar</th><th class="r">Tutar</th><th></th></tr>
          ${harcananlar.map((h, i) => `<tr><td>${App.escapeHtml(h.kod)} — ${App.escapeHtml(h.ad)}</td>
            <td class="r">${App.fmt(h.miktar, 2)} ${App.escapeHtml(h.birim)}</td>
            <td class="r">${App.fmtTL(h.tutar)}</td>
            <td><button class="btn btn-icon btn-ghost dz-hm-sil" data-i="${i}" style="color:var(--red-text)" type="button">&times;</button></td></tr>`).join('')}
        </table>` : '<div class="muted" style="font-size:11px;padding:6px 0">Henüz malzeme eklenmedi.</div>'}

        <div class="frow" style="margin-top:12px">
          <div class="fgroup" style="flex:1"><label class="flbl">İşçilik Süresi (dakika)</label>
            <input class="finput" id="dz-iscilik" type="number" min="0" step="1" value="${dk || ''}" placeholder="0"></div>
          <div class="fgroup" style="flex:1"><label class="flbl">Saat Ücreti (ayarlardan)</label>
            <input class="finput" value="${App.fmtTL(saatUcreti)}/saat" disabled></div>
        </div>
        <div class="hr"></div>
        <div class="frow">
          <div class="fgroup" style="flex:1"><label class="flbl">İşlemi Yapan (Ad Soyad) <span style="color:var(--red-text)">*</span></label>
            <input class="finput" id="dz-yapan" placeholder="Ad Soyad" value="${App.escapeHtml(yapanDeger)}"></div>
          <div class="fgroup" style="flex:1"><label class="flbl">İstasyon / Bölüm <span style="color:var(--red-text)">*</span></label>
            <input class="finput" id="dz-istasyon" placeholder="örn. Montaj-2, Boyahane" value="${App.escapeHtml(istasyonDeger)}"></div>
        </div>
        <div class="fhint" style="margin-top:-4px">Bitmiş ürün düzeltmesi hat iş kartı sistemine (istasyonIsleri) dahil değildir — bu iki alan, kim/hangi bölümde düzeltme yaptığının en az izini bırakır.</div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px 14px;font-size:12.5px;display:flex;justify-content:space-between">
          <span>Malzeme: <b>${App.fmtTL(malzemeToplam)}</b> + İşçilik: <b>${App.fmtTL(iscilikMaliyet)}</b></span>
          <span>Toplam Düzeltme Gideri: <b style="color:var(--red-text)">${App.fmtTL(malzemeToplam + iscilikMaliyet)}</b></span>
        </div>
      `;
      body.querySelector('#dz-hm-ekle').onclick = () => {
        const hid = body.querySelector('#dz-hm-sec').value;
        const m = parseFloat(body.querySelector('#dz-hm-miktar').value) || 0;
        if (!hid || m <= 0) { App.toast('Malzeme ve miktar seçin', 'err'); return; }
        const h = hammaddeler.find(x => x.id === hid);
        harcananlar.push({ hammaddeId: h.id, kod: h.stokKodu, ad: h.ad, miktar: m, birim: h.birim || 'ADET', tutar: m * App.toTRY(h.birimFiyat || 0, h.dvz || 'TL') });
        ciz();
      };
      body.querySelectorAll('.dz-hm-sil').forEach(btn => btn.onclick = () => { harcananlar.splice(parseInt(btn.dataset.i), 1); ciz(); });
      body.querySelector('#dz-iscilik').onchange = () => ciz();
    }
    ciz();

    const footer = `<button class="btn" id="dz-cancel">Vazgeç</button><button class="btn btn-green" id="dz-kaydet">Düzeltmeyi Kaydet</button>`;
    App.openModal({ title: '🔧 Düzeltme İşlemi', sub: siparis.kod, body, footer, xwide: true });
    document.getElementById('dz-cancel').onclick = App.closeModal;
    document.getElementById('dz-kaydet').onclick = async () => {
      const sonuc = body.querySelector('#dz-sonuc').value;
      const ymId = body.querySelector('#dz-ym').value || null;
      const ym = ymId ? yarimamuller.find(y => y.id === ymId) : null;
      const dk = parseFloat(body.querySelector('#dz-iscilik').value) || 0;
      const malzemeToplam = harcananlar.reduce((a, h) => a + h.tutar, 0);
      const iscilikMaliyet = (dk / 60) * saatUcreti;
      // BULGU (T3-22): bitmiş ürün kalite reddi düzeltmesi hiçbir istasyon
      // kartı (istasyonIsleri) oluşturmuyor/güncellemiyor — yarımamül
      // düzeyindeki red akışlarından (page_hat_takip.js/page_hat_terminal.js)
      // KOPUKtu, "kim/hangi istasyonda düzeltti" izi yoktu (yalnızca
      // App.currentRoleLabel() ile rol adı tutuluyordu, kişi/istasyon
      // bilgisi hiç yoktu). En azından bu izi bırakan iki alan eklendi.
      const islemiYapan = body.querySelector('#dz-yapan').value.trim();
      const istasyon = body.querySelector('#dz-istasyon').value.trim();
      if (!islemiYapan || !istasyon) { App.toast('İşlemi yapan ve istasyon/bölüm zorunlu', 'err'); return; }

      // Düzeltme gider kaydı → Yönetim Raporlarına girer
      const giderler = await Store.duzeltmeGiderleri.all();
      giderler.push({
        id: App.uid('DZG'), tarih: new Date().toISOString().slice(0, 10),
        siparisId: siparis.id, siparisKod: siparis.kod, musteriAdi: siparis.musteriAdi || '',
        ncrNo: siparis.kaliteRedNcrNo || null, sonuc,
        yarimamulId: ymId, yarimamulKod: ym ? ym.kod : null, yarimamulAd: ym ? ym.ad : null,
        malzemeler: harcananlar.map(h => ({ ...h })),
        iscilikDk: dk, iscilikMaliyet, malzemeMaliyet: malzemeToplam,
        toplamMaliyet: malzemeToplam + iscilikMaliyet,
        islemiYapan, istasyon,
        kaydeden: App.currentRoleLabel()
      });
      await App.persist(() => Store.duzeltmeGiderleri.save(giderler));

      // BULGU (T1-8): düzeltme maliyeti (malzeme+işçilik) yalnızca kendi
      // özel duzeltmeGiderleri koleksiyonuna yazılıp Yönetim Raporları'nın
      // "Kalite Düzeltme Giderleri" bölümünde gösteriliyordu — Gelir-Gider
      // Özeti/Basit Usul Defter'e HİÇ yansımıyordu. Diğer giderlerle
      // (hammadde_alimi, kredi_taksiti vb.) AYNI mekanizma.
      const toplamDuzeltmeMaliyeti = malzemeToplam + iscilikMaliyet;
      if (toplamDuzeltmeMaliyeti > 0) {
        await App.persist(() => App.muhasebeKaydiOlustur({
          tip: 'gider', kategori: 'kalite_duzeltme',
          aciklama: 'Kalite düzeltme gideri: ' + siparis.kod + (ym ? ' — ' + ym.kod : ''),
          tutar: toplamDuzeltmeMaliyeti, matrah: toplamDuzeltmeMaliyeti, kdvTutari: 0,
          kaynakId: siparis.id, kaynakTip: 'duzeltme'
        }));
      }

      if (sonuc === 'duzeltildi') {
        // Tekrar kalite onayına: sipariş kalite_bekliyor + yeni kalite kayıtları
        siparis.uretimDurumu = 'kalite_bekliyor';
        siparis.kalitedenDondu = false;
        await App.persist(() => Store.siparisler.upsert(siparis));
        const kaliteKayitlari = await Store.urunKaliteOnaylari.all();
        for (const k of urunKalemleri) {
          const urun = urunler.find(u => u.kod === k.kod);
          kaliteKayitlari.push({
            id: App.uid('UKO'), siparisId: siparis.id, siparisKod: siparis.kod,
            urunId: urun ? urun.id : null, urunKod: k.kod, urunAd: k.ad,
            miktar: k.miktar || 1, durum: 'bekliyor',
            tarih: new Date().toISOString().slice(0, 10), not: 'Düzeltme sonrası yeniden kalite kontrolü'
          });
        }
        await App.persist(() => Store.urunKaliteOnaylari.save(kaliteKayitlari));
        App.toast('Düzeltme kaydedildi, sipariş yeniden kalite onayına gönderildi', 'ok');
      } else {
        // 2. kalite / defolu → iade ambarına (NCR üzerinden)
        for (const k of urunKalemleri) {
          const urun = urunler.find(u => u.kod === k.kod);
          const ncr = await App.kaliteUygunsuzlukOlustur('uretim_urun', {
            kaynakId: siparis.id, kod: k.kod, ad: k.ad, miktar: k.miktar || 1, birim: 'ADET',
            tip: 'urun', refId: urun ? urun.id : null, siparisId: siparis.id,
            aciklama: 'Düzeltme sonucu ' + (sonuc === '2_kalite' ? '2. kalite' : 'defolu') + ' olarak ayrıldı' + (siparis.kaliteRedNotu ? ' — ' + siparis.kaliteRedNotu : ''),
            fotograflar: [], sorumluBirim: 'uretim_planlama', dofAc: false
          });
          const iade = await App.iadeAmbarinaAktar(ncr, {});
          iade.kalite = sonuc; // '2_kalite' | 'defolu' — yönetim fiyatlandıracak
          await App.persist(() => Store.iadeKalemleri.upsert(iade));
        }
        siparis.kalitedenDondu = false;
        siparis.uretimDurumu = 'iade_ambarina_alindi';
        await App.persist(() => Store.siparisler.upsert(siparis));
        App.toast('Ürün(ler) ' + (sonuc === '2_kalite' ? '2. kalite' : 'defolu') + ' olarak iade ambarına alındı — yönetim fiyatlandıracak', 'ok');
      }
      App.closeModal();
      render(main);
    };
  }

  // ── CANLI İZLEME: Hat & İstasyon Takibi verileri anlık ──────────────────
  // Siparişin işlem durumu: hangi hat/istasyonda, KİM tarafından işlendi
  // (kalite/işlem/sevk onayları), NE KADAR SÜREDE (barkod → son işlem, dk).
  // Tamamlanan istasyonların süreleri yarımamül kodu üzerine işlenmiştir.
  // ── TAKIMLAMA & STOK İŞ EMRİ ────────────────────────────────────────────
  // Ürünün yarı mamüllerine göre stoktan kaç adet TAKIMLANABİLECEĞİ gösterilir.
  // Tek bir yarı mamül bile eksikse takım tamamlanmaz — eksik yarı mamül(ler)
  // için tek tuşla iş emri ihtiyacı açılıp stok tamamlanabilir. Ayrıca bitmiş
  // ürün için "stok iş emri" verilebilir: ürün TÜM yarı mamülleriyle birlikte
  // iş emrine dönüşür.
  async function takimlamaModal(siparis, render, main) {
    const [urunler, receteler, stokRaf, yarimamuller] = await Promise.all([
      Store.urunler.all(), Store.receteler.all(), Store.stokRaf.all(), Store.yarimamuller.all()]);
    const durumlar = App.siparisTakimlamaDurumu(siparis, urunler, receteler, stokRaf, yarimamuller);
    const body = document.createElement('div');
    if (!durumlar.length) {
      body.innerHTML = '<div class="empty-state" style="padding:20px"><div class="edesc">Bu siparişte takımlanacak ürün/yarı mamül kalemi yok.</div></div>';
    } else {
      body.innerHTML = durumlar.map((d, di) => {
        const tam = d.karsilanabilir >= d.istenen;
        const rozet = tam ? 'pill-green' : d.karsilanabilir > 0 ? 'pill-amber' : 'pill-red';
        return `<div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <div><b style="font-size:12.5px">📦 ${App.escapeHtml(d.urunKod)}</b> <span style="font-size:11px">— ${App.escapeHtml(d.urunAd)}</span><br>
              <span class="muted" style="font-size:10.5px">İstenen: ${App.fmt(d.istenen, 0)} adet · Stoktan takımlanabilir: <b>${App.fmt(d.karsilanabilir, 0)}</b> adet</span></div>
            <span class="pill ${rozet}" style="font-size:9.5px">${tam ? '✓ Tamamı stoktan karşılanır' : d.karsilanabilir > 0 ? 'Kısmi karşılanır' : '✗ Takım tamamlanamıyor'}</span>
          </div>
          ${d.ymDetay.length ? `<table class="dtable" style="font-size:10.5px">
            <tr><th>Yarı Mamül</th><th class="r">Birim</th><th class="r">Gereken</th><th class="r">Stok</th><th class="r">Eksik</th><th>Durum</th></tr>
            ${d.ymDetay.map(y => `<tr${y.eksik > 0 ? ' style="background:var(--red-bg)"' : ''}>
              <td><b class="mono">${App.escapeHtml(y.ymKod)}</b><br><span class="muted" style="font-size:9.5px">${App.escapeHtml(y.ymAd)}</span></td>
              <td class="r">${App.fmt(y.birimGereken, 0)}</td>
              <td class="r">${App.fmt(y.toplamGereken, 0)}</td>
              <td class="r">${App.fmt(y.stok, 0)}</td>
              <td class="r" style="color:var(--red-text)"><b>${y.eksik > 0 ? App.fmt(y.eksik, 0) : '—'}</b></td>
              <td>${y.eksik > 0 ? '<span class="pill pill-red" style="font-size:9px">Eksik — iş emri gerekli</span>' : '<span class="pill pill-green" style="font-size:9px">Stokta var</span>'}</td>
            </tr>`).join('')}</table>` : '<div class="muted" style="font-size:11px">Bu kalemin reçetesinde yarı mamül yok — stoktan takımlanamaz.</div>'}
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
            ${d.eksikler.length ? `<button class="btn btn-sm btn-amber tk-eksik" data-i="${di}">⚡ Eksik ${d.eksikler.length} Yarı Mamül İçin İş Emri Aç (stoğu tamamla)</button>` : ''}
            <button class="btn btn-sm btn-blue tk-urun" data-i="${di}">🏭 Bitmiş Ürün İçin Stok İş Emri (tüm yarı mamülleriyle)</button>
          </div>
        </div>`;
      }).join('');
    }
    App.openModal({
      title: '🧩 Takımlama & Stoktan Karşılama', sub: siparis.kod + ' — ' + (siparis.musteriAdi || ''),
      body, footer: `<button class="btn" id="tk-kapat">Kapat</button>`, xwide: true
    });
    document.getElementById('tk-kapat').onclick = App.closeModal;

    // Eksik yarı mamüller için iş emri ihtiyacı (yalnızca eksikler)
    body.querySelectorAll('.tk-eksik').forEach(b => b.onclick = async () => {
      const d = durumlar[parseInt(b.dataset.i)];
      App.confirmDialog(
        `<b>${App.escapeHtml(d.urunKod)}</b> takımlanamıyor. Eksik yarı mamüller için iş emri ihtiyacı açılacak:<br><br>` +
        d.eksikler.map(e => `• <b>${App.escapeHtml(e.ymKod)}</b> — ${App.fmt(e.eksik, 0)} adet`).join('<br>') +
        `<br><br>Üretim Planlama → İş Emri İhtiyaçları sekmesinden iş emrine dönüştürebilirsiniz. Onaylıyor musunuz?`,
        async () => {
          const r = await App.persist(() => App.isEmriIhtiyaciEkle(d.eksikler, siparis.id));
          App.toast(`${d.eksikler.length} yarı mamül için iş emri ihtiyacı oluşturuldu (${r.acilan} yeni, ${r.guncellenen} güncellendi) — stok tamamlanacak`, 'ok');
          App.closeModal();
          render(main);
        });
    });

    // Bitmiş ürün için STOK İŞ EMRİ: ürün TÜM yarı mamülleriyle iş emrine dönüşür
    body.querySelectorAll('.tk-urun').forEach(b => b.onclick = async () => {
      const d = durumlar[parseInt(b.dataset.i)];
      const body2 = document.createElement('div');
      body2.innerHTML = `
        <div class="fhint" style="margin-bottom:10px"><b>${App.escapeHtml(d.urunKod)} — ${App.escapeHtml(d.urunAd)}</b><br>
        Ürün, alt kırılımındaki <b>${d.ymDetay.length} yarı mamülün tamamıyla</b> tek bir iş emrine dönüştürülür (stok üretimi).</div>
        <div class="fgroup"><label class="flbl">Üretilecek Ürün Adedi</label>
          <input class="finput" id="tk-adet" type="number" min="1" value="${Math.max(1, d.istenen - d.karsilanabilir) || d.istenen}"></div>
        <div class="fgroup"><label class="flbl">Not</label><textarea class="ftextarea" id="tk-not" placeholder="örn. stok tamamlama"></textarea></div>
        <div class="fhint">İş emrinin üretim listesine yarı mamüller <b>ürün adedi × birim gereksinim</b> ile eklenir; rotaları yarı mamül kartlarından otomatik alınır.</div>`;
      App.openModal({ title: '🏭 Bitmiş Ürün Stok İş Emri', body: body2,
        footer: `<button class="btn" id="tk2-cancel">Vazgeç</button><button class="btn btn-blue" id="tk2-ok">İş Emri Oluştur</button>`, wide: true });
      document.getElementById('tk2-cancel').onclick = () => { App.closeModal(); takimlamaModal(siparis, render, main); };
      document.getElementById('tk2-ok').onclick = async () => {
        const adet = parseInt(document.getElementById('tk-adet').value) || 0;
        if (adet < 1) { App.toast('Adet en az 1 olmalı', 'err'); return; }
        const ymler = await Store.yarimamuller.all();
        const ie = {
          id: App.uid('IE'), kod: 'IE-' + Date.now().toString(36).toUpperCase(),
          tip: 'urun', urunId: d.urunId, urunAdi: d.urunAd + ' (' + d.urunKod + ')',
          adet, tarih: new Date().toISOString().slice(0, 10),
          not: (document.getElementById('tk-not').value.trim() || 'Bitmiş ürün stok iş emri') + ' — kaynak sipariş: ' + siparis.kod,
          durum: 'taslak',
          kaynakSiparisIdler: [siparis.id],
          uretimListesi: d.ymDetay.map(y => {
            const ym = ymler.find(x => x.id === y.ymId);
            return {
              tip: 'yarimamul', refId: y.ymId, miktarBirim: y.birimGereken, birim: 'ADET',
              gerekliToplam: y.birimGereken * adet, uretildi: 0,
              rotaId: (ym && ym.rotaId) || null
            };
          })
        };
        await App.persist(() => Store.isemirleri.upsert(ie));
        // BULGU (T3-29): bitmiş ürün stok iş emri için de kesim ihtiyacı
        // hiç oluşmuyordu — Kesim Optimizasyonu ekranı bu üretimden
        // habersiz kalıyordu.
        await App.persist(() => App.isEmriKesimIhtiyaciOlustur(ie));
        App.toast(`İş emri oluşturuldu: ${ie.kod} — ${d.urunKod} × ${adet} adet, ${d.ymDetay.length} yarı mamülüyle birlikte`, 'ok');
        App.closeModal();
        render(main);
      };
    });
  }

  // ── CANLI İZLEME: 2 KADEMELİ AKORDİYON ──────────────────────────────────
  // Modal zaten SİPARİŞ + MÜŞTERİ ile açılır. İçeride:
  //   1. KADEME (akordiyon başlığı): ÜRÜN + adet + yüzdesel tamamlanma oranı
  //      + harcanan saat
  //   2. KADEME (açılınca): ürünün alt kırılımındaki YARI MAMÜLLER ve her
  //      birinin HAT / ROTA takibi (rota adımları sırayla, istasyon durumları)
  async function canliIzlemeModal(siparis, aktifSekme, acikUrunler) {
    aktifSekme = aktifSekme || 'devam';
    const acik = acikUrunler instanceof Set ? acikUrunler : new Set();
    const [istasyonIsleri, sureler, isemirleri, ihtiyaclar, urunler, receteler, yarimamuller, rotalar] = await Promise.all([
      Store.istasyonIsleri.all(), Store.gerceklesenSureKayitlari.all(), Store.isemirleri.all(),
      Store.uretimIsEmriIhtiyaclari.all(), Store.urunler.all(), Store.receteler.all(),
      Store.yarimamuller.all(), Store.rotalar.all()]);
    const tumKartlar = siparisIliskiliKartlar(siparis.id, istasyonIsleri, isemirleri, ihtiyaclar);
    // NOT: sekme KARTLARI değil ÜRÜNLERİ süzer — bir ürünün yüzdesi, harcanan
    // saati ve rota zinciri her zaman TÜM kartlarından (biten + devam eden)
    // hesaplanır; yoksa biten adımlar ilerlemeye yansımaz.
    const kartlar = tumKartlar;

    // Bir iş kartında harcanan süre (dk): QR okutmadan son işleme kadar
    const sureDk = (x) => {
      if (!x.barkodZamani) return 0;
      const sonZ = x.bitisZamani || [...(x.sevkler||[]), ...(x.islemOnaylari||[]), ...(x.kaliteOnaylari||[])]
        .map(o => o.zaman).filter(Boolean).sort().pop();
      if (!sonZ) return 0;
      return Math.max(0, (new Date(sonZ) - new Date(x.barkodZamani)) / 60000);
    };
    const kisiler = (x) => {
      const adlar = [...(x.kaliteOnaylari||[]), ...(x.islemOnaylari||[]), ...(x.sevkler||[])].map(o => o.kisi).filter(Boolean);
      return [...new Set(adlar)].join(', ') || '—';
    };
    const saatYaz = (dk) => dk >= 60 ? App.fmt(dk / 60, 1) + ' sa' : App.fmt(dk, 1) + ' dk';

    // ── 2. KADEME: bir yarı mamülün ROTA / HAT takibi ──────────────────────
    // YM'nin rotasındaki adımlar sırayla dizilir; her adımın iş kartı varsa
    // durumu (gelen/kalite/işlem/sevk, kişi, süre) gösterilir.
    const ymRotaTakibi = (ymId, ymKartlari) => {
      const ym = yarimamuller.find(y => y.id === ymId);
      const rotaId = (ymKartlari[0] && ymKartlari[0].rotaId) || (ym && ym.rotaId);
      const rota = rotalar.find(r => r.id === rotaId);
      const steps = (rota ? (rota.steps || []) : []).filter(s => s.hat !== 'TAŞIMA');
      const toplamAdet = ymKartlari.reduce((a, x) => a + x.gelenAdet, 0);
      const ymDk = ymKartlari.reduce((a, x) => a + sureDk(x), 0);
      // YM tamamlanma: sevk edilen adım-adet / (adet × adım sayısı)
      const beklenen = (ymKartlari[0] ? ymKartlari[0].gelenAdet : 0) * (steps.length || 1);
      const yapilan = ymKartlari.reduce((a, x) => a + x.sevkEdilenAdet, 0);
      const yuzde = beklenen > 0 ? Math.min(100, Math.round(yapilan / beklenen * 100)) : 0;

      let h = `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--surface)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          <div><b class="mono" style="font-size:11.5px">${App.escapeHtml(ymKartlari[0].ymKod)}</b>
            <span style="font-size:11px">— ${App.escapeHtml(ymKartlari[0].ymAd)}</span><br>
            <span class="muted" style="font-size:10px">Rota: ${rota ? App.escapeHtml(rota.ad) : '—'} · ${toplamAdet} adet · ⏱ ${saatYaz(ymDk)}</span></div>
          <div style="min-width:120px;text-align:right">
            <div style="font-size:10px;font-weight:700;color:var(--blue-text)">%${yuzde}</div>
            <div style="height:5px;background:var(--bg);border-radius:3px;overflow:hidden;margin-top:2px">
              <div style="height:100%;width:${yuzde}%;background:var(--blue)"></div></div></div>
        </div>`;
      if (!steps.length) {
        h += `<div class="muted" style="font-size:10.5px">Bu yarı mamüle rota atanmamış.</div></div>`;
        return h;
      }
      // Rota adımları zinciri
      h += `<table class="dtable" style="font-size:10.5px"><tr><th>#</th><th>İstasyon</th><th>Hat</th>
        <th class="r">Gelen</th><th class="r">Kalite</th><th class="r">İşlem</th><th class="r">Sevk</th><th class="r">Fire</th>
        <th>İşleyen(ler)</th><th class="r">Süre</th><th>Durum</th></tr>`;
      steps.forEach((st, si) => {
        const kart = ymKartlari.find(x => x.istasyonKod === st.kod);
        let durum = '<span class="pill pill-gray" style="font-size:9px">Bekliyor</span>';
        if (kart) durum = kart.durum === 'tamamlandi'
          ? '<span class="pill pill-green" style="font-size:9px">Tamamlandı</span>'
          : '<span class="pill pill-amber" style="font-size:9px">İşleniyor</span>';
        h += `<tr${kart ? '' : ' style="opacity:.55"'}>
          <td class="r">${si + 1}</td>
          <td class="mono">${App.escapeHtml(st.kod)}<br><span class="muted" style="font-size:9px">${App.escapeHtml(st.tanim || '')}</span></td>
          <td style="font-size:10px">${App.escapeHtml(st.hat || '—')}</td>
          <td class="r">${kart ? kart.gelenAdet : '—'}</td>
          <td class="r" style="color:var(--blue-text)">${kart ? kart.kaliteOnayliAdet : '—'}</td>
          <td class="r" style="color:var(--amber-text)">${kart ? kart.islemTamamAdet : '—'}</td>
          <td class="r" style="color:var(--green-text)">${kart ? kart.sevkEdilenAdet : '—'}</td>
          <td class="r" style="color:var(--red-text)">${kart ? (kart.fireAdet || 0) : '—'}</td>
          <td style="font-size:9.5px">${kart ? App.escapeHtml(kisiler(kart)) : '—'}</td>
          <td class="r">${kart && sureDk(kart) ? saatYaz(sureDk(kart)) : '—'}</td>
          <td>${durum}</td></tr>`;
      });
      h += `</table></div>`;
      return h;
    };

    // ── 1. KADEME: ÜRÜN akordiyonu (adet + % tamamlanma + harcanan saat) ───
    const body = document.createElement('div');
    const tumUrunKalemleri = (siparis.kalemler || []).filter(k => k.grup === 'urun' && !k.ikinciKalite);
    // Ürünün istasyon kartları: reçete alt kırılımındaki YM'lerin kartları
    const urunKartlari = (k) => {
      const urun = urunler.find(u => u.kod === k.kod);
      const ymIdler = urun ? new Set([...App.receteAltYarimamulleri('urun', urun.id, receteler).keys()]) : new Set();
      return { ymIdler, ilgili: kartlar.filter(x => ymIdler.has(x.yarimamulId)) };
    };
    // Ürün DEVAM EDİYOR: en az bir aktif kartı var. TAMAMLANDI: kartları var ve hepsi bitti.
    const urunDevamMi = (k) => { const { ilgili } = urunKartlari(k); return ilgili.some(x => x.durum === 'aktif'); };
    const urunBitenMi = (k) => { const { ilgili } = urunKartlari(k); return ilgili.length > 0 && ilgili.every(x => x.durum === 'tamamlandi'); };
    const devamSayi = tumUrunKalemleri.filter(urunDevamMi).length;
    const bitenSayi = tumUrunKalemleri.filter(urunBitenMi).length;

    let html = `<div class="tabs" style="margin-bottom:12px">
      <div class="tab ci-sekme ${aktifSekme === 'devam' ? 'active' : ''}" data-s="devam">⚡ Devam Eden Ürünler (${devamSayi})</div>
      <div class="tab ci-sekme ${aktifSekme === 'biten' ? 'active' : ''}" data-s="biten">🗂 Tamamlanan Ürünler (${bitenSayi})</div>
    </div>`;

    const urunKalemleri = tumUrunKalemleri.filter(k => aktifSekme === 'devam' ? urunDevamMi(k) : urunBitenMi(k));
    const kullanilan = new Set();
    const urunBlogu = (baslikHtml, anahtar, ilgiliKartlar, ymIdler) => {
      // Tamamlanma: tüm YM kartlarının rota adımları üzerinden
      let beklenen = 0, yapilan = 0, toplamDk = 0;
      const ymGrup = new Map();
      ilgiliKartlar.forEach(x => {
        if (!ymGrup.has(x.yarimamulId)) ymGrup.set(x.yarimamulId, []);
        ymGrup.get(x.yarimamulId).push(x);
        toplamDk += sureDk(x);
      });
      ymGrup.forEach((kartlarYm, ymId) => {
        const ym = yarimamuller.find(y => y.id === ymId);
        const rota = rotalar.find(r => r.id === ((kartlarYm[0] && kartlarYm[0].rotaId) || (ym && ym.rotaId)));
        const adimSayisi = rota ? (rota.steps || []).filter(s => s.hat !== 'TAŞIMA').length : 1;
        beklenen += (kartlarYm[0].gelenAdet || 0) * (adimSayisi || 1);
        yapilan += kartlarYm.reduce((a, x) => a + x.sevkEdilenAdet, 0);
      });
      const yuzde = beklenen > 0 ? Math.min(100, Math.round(yapilan / beklenen * 100)) : 0;
      const acikMi = acik.has(anahtar);
      let h = `<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden">
        <div class="ci-urun-bas" data-k="${App.escapeHtml(anahtar)}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;background:var(--surface2);border-left:3px solid var(--blue)">
          <div style="flex:1;min-width:0">
            <span style="font-size:12px;color:var(--text2);margin-right:6px">${acikMi ? '▾' : '▸'}</span>${baslikHtml}
          </div>
          <div style="min-width:170px">
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">
              <span style="font-weight:700;color:var(--blue-text)">%${yuzde} tamamlandı</span>
              <span class="muted">⏱ ${saatYaz(toplamDk)}</span></div>
            <div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${yuzde}%;background:${yuzde >= 100 ? 'var(--green)' : 'var(--blue)'}"></div></div>
          </div>
        </div>`;
      if (acikMi) {
        h += `<div style="padding:10px 12px;background:var(--bg)">`;
        if (!ymGrup.size) {
          h += `<div class="muted" style="font-size:11px">Bu ürünün yarı mamüllerinde ${aktifSekme === 'devam' ? 'devam eden' : 'tamamlanan'} işlem yok.</div>`;
        } else {
          ymGrup.forEach((kartlarYm, ymId) => { h += ymRotaTakibi(ymId, kartlarYm); });
        }
        h += `</div>`;
      }
      h += `</div>`;
      return h;
    };

    urunKalemleri.forEach((k, ki) => {
      const { ymIdler, ilgili } = urunKartlari(k);
      ilgili.forEach(x => kullanilan.add(x.id));
      const baslik = `<b style="font-size:12.5px">📦 ${App.escapeHtml(k.kod)}</b>
        <span style="font-size:11px"> — ${App.escapeHtml(k.ad || '')}</span>
        <span class="pill pill-blue" style="font-size:9px;margin-left:6px">${App.fmt(k.miktar || 1, 0)} adet</span>
        <span class="muted" style="font-size:10px;margin-left:6px">${ymIdler.size} yarı mamül · ${ilgili.length} istasyon kartı</span>`;
      html += urunBlogu(baslik, 'U' + ki, ilgili, ymIdler);
    });

    // Ürüne bağlanamayan kartlar (doğrudan YM siparişi vb.) — sekmeye göre süz
    const tumUrunYmIdler = new Set();
    tumUrunKalemleri.forEach(k => urunKartlari(k).ymIdler.forEach(id => tumUrunYmIdler.add(id)));
    const digerHepsi = kartlar.filter(x => !tumUrunYmIdler.has(x.yarimamulId));
    const digerler = aktifSekme === 'devam'
      ? (digerHepsi.some(x => x.durum === 'aktif') ? digerHepsi : [])
      : (digerHepsi.length && digerHepsi.every(x => x.durum === 'tamamlandi') ? digerHepsi : []);
    if (digerler.length) {
      html += urunBlogu('<b style="font-size:12.5px">🔩 Doğrudan Yarı Mamüller / Diğer</b>', 'DIGER', digerler, new Set());
    }
    if (!urunKalemleri.length && !digerler.length) {
      html += `<div class="empty-state" style="padding:20px"><div class="edesc">${aktifSekme === 'devam' ? 'Devam eden ürün yok.' : 'Tamamlanan ürün yok.'}</div></div>`;
    }

    body.innerHTML = html;
    body.querySelectorAll('.ci-sekme').forEach(t => t.onclick = () => { App.closeModal(); canliIzlemeModal(siparis, t.dataset.s, new Set()); });
    body.querySelectorAll('.ci-urun-bas').forEach(el => el.onclick = () => {
      const k = el.dataset.k;
      const yeni = new Set(acik);
      yeni.has(k) ? yeni.delete(k) : yeni.add(k);
      App.closeModal();
      canliIzlemeModal(siparis, aktifSekme, yeni);
    });
    App.openModal({
      title: '📡 Canlı İzleme — ' + siparis.kod, sub: (siparis.musteriAdi || '') + ' · ürüne tıklayın: yarı mamül ve hat/rota takibi açılır',
      body, footer: `<button class="btn btn-blue" id="ci-yenile">↻ Yenile</button><button class="btn" id="ci-kapat">Kapat</button>`, xwide: true
    });
    document.getElementById('ci-kapat').onclick = App.closeModal;
    document.getElementById('ci-yenile').onclick = () => { App.closeModal(); canliIzlemeModal(siparis, aktifSekme, acik); };
  }

  return { render };
})();
