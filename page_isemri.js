// ════════════════════════════════════════════════════════════════════════════
// İŞ EMİRLERİ — üretime emir verme, BOM'dan yarı mamül üretim listesi türetme
// ════════════════════════════════════════════════════════════════════════════
PageModules.isemri = (() => {
  let detayId = null; // açık olan iş emri detayı (null = liste görünümü)

  async function render(main, params) {
    if (params && params.openNew) { openNewForm(main); return; }
    const isemirleri = await Store.isemirleri.all();
    if (detayId) {
      const ie = isemirleri.find(i => i.id === detayId);
      if (ie) { renderDetay(main, ie); return; }
      detayId = null;
    }
    renderList(main, isemirleri);
  }

  function renderList(main, isemirleri) {
    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">İş Emirleri</div>
          <div class="page-sub">Üretime iş emri verin; emir içinde otomatik yarı mamül üretim listesi (BOM'dan) oluşturulur</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="ie-new">+ Yeni İş Emri</button></div>
      </div>
      <div class="card" id="ie-list-wrap"></div>
    `;
    document.getElementById('ie-new').onclick = () => openNewForm(main);

    const wrap = document.getElementById('ie-list-wrap');
    if (!isemirleri.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="eicon">▤</div><div class="etitle">Henüz iş emri yok</div><div class="edesc">Yeni iş emri vererek üretim sürecini başlatın.</div></div>`;
      return;
    }
    let html = `<table class="dtable"><tr><th>Kod</th><th>Ürün</th><th class="r">Adet</th><th>Durum</th><th>Tarih</th><th class="r">Yarı Mamül</th><th></th></tr>`;
    [...isemirleri].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(ie => {
      html += `<tr>
        <td class="mono">${App.escapeHtml(ie.kod)}</td>
        <td>${App.escapeHtml(ie.urunAdi)}</td>
        <td class="r">${ie.adet}</td>
        <td>${durumPill(ie.durum)}</td>
        <td style="font-size:11px">${ie.tarih}</td>
        <td class="r">${(ie.uretimListesi || []).length}</td>
        <td><button class="btn btn-sm btn-ghost ie-detay" data-id="${ie.id}">Detay</button></td>
      </tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll('.ie-detay').forEach(b => b.onclick = () => { detayId = b.dataset.id; render(main); });
  }

  function durumPill(d) {
    const map = { taslak: ['Taslak', 'pill-gray'], uretimde: ['Üretimde', 'pill-amber'], tamamlandi: ['Tamamlandı', 'pill-green'] };
    const [label, cls] = map[d] || ['Taslak', 'pill-gray'];
    return `<span class="pill ${cls}">${label}</span>`;
  }

  async function openNewForm(main) {
    const [urunler, receteler] = await Promise.all([Store.urunler.all(), Store.receteler.all()]);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Ürün Seç</label>
        <select class="fselect" id="nf-urun">
          <option value="">— Bitmiş ürün seçin —</option>
          ${urunler.map(u => `<option value="${u.id}">${App.escapeHtml(u.kod)} — ${App.escapeHtml(u.ad)}</option>`).join('')}
        </select>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Üretim Adedi</label><input class="finput" id="nf-adet" type="number" value="1" min="1"></div>
        <div class="fgroup"><label class="flbl">Planlanan Tarih</label><input class="finput" id="nf-tarih" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Not</label><textarea class="ftextarea" id="nf-not"></textarea></div>
    `;
    const footer = `<button class="btn" id="nf-cancel">Vazgeç</button><button class="btn btn-blue" id="nf-create">İş Emri Oluştur</button>`;
    App.openModal({ title: 'Yeni İş Emri', sub: 'Ürün seçtiğinizde reçeteden (BOM) otomatik yarı mamül üretim listesi türetilir', body, footer, onClose: () => { if (App.state.page === 'isemri') App.goTo('isemri'); } });
    document.getElementById('nf-cancel').onclick = () => { App.closeModal(); App.goTo('isemri'); };
    document.getElementById('nf-create').onclick = async () => {
      const urunId = document.getElementById('nf-urun').value;
      const adet = parseInt(document.getElementById('nf-adet').value) || 1;
      if (!urunId) { App.toast('Ürün seçimi zorunlu', 'err'); return; }
      const urun = urunler.find(u => u.id === urunId);
      const recete = receteler.find(r => r.urunId === urunId);
      const uretimListesi = (recete ? recete.kalemler : []).map(k => ({
        tip: k.tip, refId: k.refId, miktarBirim: k.miktar, birim: k.birim,
        gerekliToplam: k.miktar * adet, uretildi: 0,
        // BULGU (T3-29): plaka ölçü/kenar bandı bilgisi (k.olcu/k.kenarBantlari)
        // önceden hiç taşınmıyordu — ürün reçetesinde DOĞRUDAN hammadde/plaka
        // referansı varsa Kesim İhtiyacı bu kalemi hiç göremiyordu.
        olcu: k.olcu || null, kenarBantlari: k.kenarBantlari || null
      }));
      const ie = {
        id: App.uid('IE'),
        kod: 'IE-' + Date.now().toString(36).toUpperCase(),
        urunId, urunAdi: urun ? urun.ad + ' (' + urun.kod + ')' : '—',
        adet, tarih: document.getElementById('nf-tarih').value,
        not: document.getElementById('nf-not').value.trim(),
        durum: 'taslak',
        uretimListesi
      };
      await App.persist(() => Store.isemirleri.upsert(ie));
      // BULGU (T3-29): manuel iş emri açılınca kesim ihtiyacı hiç
      // oluşmuyordu — Kesim Optimizasyonu ekranı bu üretimden habersiz
      // kalıyordu.
      await App.persist(() => App.isEmriKesimIhtiyaciOlustur(ie));
      App.toast('İş emri oluşturuldu: ' + ie.kod, 'ok');
      App.closeModal();
      detayId = ie.id;
      App.goTo('isemri');
    };
  }

  async function renderDetay(main, ie) {
    const yarimamuller = await Store.yarimamuller.all();
    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">${App.escapeHtml(ie.kod)}</div>
          <div class="page-sub">${App.escapeHtml(ie.urunAdi)} · ${ie.adet} adet</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="ie-back">&larr; Listeye Dön</button>
          <select class="fselect" id="ie-durum" style="width:auto">
            <option value="taslak" ${ie.durum === 'taslak' ? 'selected' : ''}>Taslak</option>
            <option value="uretimde" ${ie.durum === 'uretimde' ? 'selected' : ''}>Üretimde</option>
            <option value="tamamlandi" ${ie.durum === 'tamamlandi' ? 'selected' : ''}>Tamamlandı</option>
          </select>
          <button class="btn btn-red" id="ie-delete">Sil</button>
        </div>
      </div>

      <div class="grid grid-3">
        <div class="kpi"><div class="kpi-lbl">Üretim Adedi</div><div class="kpi-val blue">${ie.adet}</div></div>
        <div class="kpi"><div class="kpi-lbl">Yarı Mamül Kalemi</div><div class="kpi-val purple">${(ie.uretimListesi || []).length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Tarih</div><div class="kpi-val amber" style="font-size:16px">${ie.tarih}</div></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Reçeteden Türetilen Yarı Mamül Üretim Listesi</div>
          <button class="btn btn-sm" id="ie-goto-nesting">Kesim Optimizasyonuna Aktar</button>
        </div>
        ${renderUretimListesi(ie, yarimamuller)}
      </div>

      ${ie.not ? `<div class="card"><div class="card-title" style="margin-bottom:8px">Not</div><div style="font-size:12.5px;color:var(--text2)">${App.escapeHtml(ie.not)}</div></div>` : ''}
    `;
    document.getElementById('ie-back').onclick = () => { detayId = null; render(main); };
    document.getElementById('ie-delete').onclick = () => {
      App.confirmDialog(`"${ie.kod}" iş emrini silmek istediğinize emin misiniz?`, async () => {
        await App.persist(() => Store.isemirleri.remove(ie.id));
        App.toast('İş emri silindi', 'ok');
        detayId = null;
        App.goTo('isemri');
      });
    };
    document.getElementById('ie-durum').onchange = async (e) => {
      ie.durum = e.target.value;
      await App.persist(() => Store.isemirleri.upsert(ie));
      App.toast('Durum güncellendi', 'ok');
      render(main);
    };
    document.getElementById('ie-goto-nesting').onclick = async () => {
      // BULGU (T3-29): bu buton önceden yalnızca App.goTo('nesting') çağırıp
      // hiçbir veri taşımıyordu — normal şartlarda kesim ihtiyacı artık iş
      // emri OLUŞTURULURKEN otomatik işleniyor (bkz. openNewForm), ama bu
      // güvence ağı eski (bu düzeltmeden önce açılmış) iş emirlerini de
      // kapsar: idempotent olduğu için zaten işlenmişse no-op'tur.
      const sonuc = await App.persist(() => App.isEmriKesimIhtiyaciOlustur(ie));
      if (sonuc && (sonuc.olusturulan || sonuc.guncellenen)) {
        App.toast('Kesim ihtiyacı aktarıldı: ' + sonuc.olusturulan + ' yeni, ' + sonuc.guncellenen + ' güncellenen satır', 'ok');
      }
      App.goTo('nesting');
    };

    main.querySelectorAll('.ie-uret-input').forEach(inp => inp.onchange = async () => {
      const refId = inp.dataset.ref;
      const kalem = ie.uretimListesi.find(k => k.refId === refId);
      if (kalem) {
        const yeniDeger = parseFloat(inp.value) || 0;
        const eskiDeger = kalem.uretildi || 0;
        const fark = yeniDeger - eskiDeger;
        kalem.uretildi = yeniDeger;
        await App.persist(() => Store.isemirleri.upsert(ie));

        // Üretilen miktar arttıkça (fazla üretim dahil) rafa/stoğa otomatik eklenir.
        // Gerekli toplamı aşan kısım da "ihtiyaçtan fazla" olarak aynı şekilde
        // rafa eklenir — kullanıcı isterse o fazlalığı başka bir siparişte kullanır.
        if (fark > 0 && kalem.tip === 'yarimamul') {
          const ym = yarimamuller.find(y => y.id === kalem.refId);
          if (ym) await App.persist(() => App.fazlaMalzemeyiStogaEkle('yarimamul', ym.id, ym.kod, ym.ad, 'ADET', fark));
        }
        App.toast('Üretim ilerlemesi kaydedildi, rafa eklendi: +' + App.fmt(fark, 0), 'ok');
      }
    });
  }

  function renderUretimListesi(ie, yarimamuller) {
    if (!ie.uretimListesi || !ie.uretimListesi.length) {
      return `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Bu ürün için tanımlı reçete bulunamadı, üretim listesi türetilemedi.</div></div>`;
    }
    let html = `<table class="dtable"><tr><th>Yarı Mamül</th><th class="r">Birim Miktar</th><th class="r">Gerekli Toplam</th><th class="r">Üretilen</th><th>İlerleme</th></tr>`;
    ie.uretimListesi.forEach(k => {
      const ym = yarimamuller.find(y => y.id === k.refId);
      const pct = k.gerekliToplam > 0 ? Math.min(100, (k.uretildi / k.gerekliToplam) * 100) : 0;
      html += `<tr>
        <td>${ym ? App.escapeHtml(ym.kod) + ' — ' + App.escapeHtml(ym.ad) : k.refId}</td>
        <td class="r">${k.miktarBirim} ${k.birim}</td>
        <td class="r"><b>${App.fmt(k.gerekliToplam, 0)}</b></td>
        <td class="r"><input class="finput ie-uret-input" data-ref="${k.refId}" type="number" value="${k.uretildi}" style="width:80px;text-align:right"></td>
        <td style="width:140px">
          <div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct >= 100 ? 'var(--green)' : 'var(--blue)'}"></div></div>
        </td>
      </tr>`;
    });
    html += `</table>`;
    return html;
  }

  return { render };
})();
