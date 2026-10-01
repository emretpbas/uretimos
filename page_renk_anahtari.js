// ════════════════════════════════════════════════════════════════════════════
// RENK EŞLEŞTİRME ANAHTARI — "🎨 Renk Varyantı Oluştur" motorunun kullandığı
// eşleştirmeyi YÖNETMEK için ekran.
// ────────────────────────────────────────────────────────────────────────────
// GERÇEK KAYNAK VERİ hammadde kartlarının KENDİSİNDEDİR (renkKartelaKodu +
// malzemeKategorisi alanları, bkz. page_hammadde.js) — burada AYRI bir
// eşleştirme matrisi TUTULMAZ, veri tekilleşir. Bu ekran yalnızca:
//   1) Her renk kodu için bir "kısaltma" (ör. 15->BY, 24->ANT) tanımlar —
//      renk_varyant_motoru.js bunu klonlanan kart kodlarının son ekini
//      üretmek için kullanır (ör. "...1.BY" -> "...1.ANT").
//   2) Tanımlı her renk × malzeme kategorisi için hangi hammaddenin
//      ETİKETLİ olduğunu CANLI (Store.hammaddeler.all() üzerinden hesaplanmış)
//      bir matris halinde gösterir — eksik (0) veya çakışan (>1) hücreleri
//      işaretler, ki kullanıcı "15 numaralı kodun altına kar beyaz suntalam
//      hammadde kodu oluşturalım" dediği gibi boşlukları doldurabilsin.
// ════════════════════════════════════════════════════════════════════════════
PageModules.renk_anahtari = (() => {
  const ROLLER = ['admin', 'arge', 'teknik_ofis', 'yonetim'];
  const KATEGORILER = [
    { deger: 'sunta', etiket: 'Sunta (Melamin)' },
    { deger: 'mdf', etiket: 'MDF (Lam)' },
    { deger: 'pvc_bant', etiket: 'PVC Kenar Bandı' },
    { deger: 'boya', etiket: 'Boya' },
    { deger: 'diger', etiket: 'Diğer' }
  ];

  async function render(main) {
    const rol = App.aktifRol();
    if (!ROLLER.includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE, Teknik Ofis ve Yönetim tarafından kullanılır.</div></div></div>`;
      return;
    }

    const [renkler, hammaddeler] = await Promise.all([Store.renkKisaltmalari.all(), Store.hammaddeler.all()]);
    renkler.sort((a, b) => (a.renkKodu || '').localeCompare(b.renkKodu || ''));

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">🎨 Renk Eşleştirme Anahtarı</div>
          <div class="page-sub">Renk varyantı oluştururken hammaddelerin otomatik takas edileceği eşleştirmeyi yönetin</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="ra-yeni-renk">+ Yeni Renk Tanımla</button></div>
      </div>
      <div class="fhint" style="margin-bottom:12px">
        Gerçek eşleştirme verisi <b>hammadde kartlarının kendisinde</b> tutulur (Hammaddeler ekranında "Renk Kartela Kodu" +
        "Malzeme Kategorisi" alanları). Burada her renge bir <b>kısaltma</b> (kod üretimi için, ör. 15→BY, 24→ANT) tanımlayıp,
        hangi malzeme kategorisinde hangi hammaddenin etiketli olduğunu görebilir, eksikleri tamamlayabilirsiniz.
      </div>
      <div id="ra-liste"></div>
    `;
    document.getElementById('ra-yeni-renk').onclick = () => renkEkleModal(main, renkler);
    renkListesiCiz(main, renkler, hammaddeler);
  }

  function renkListesiCiz(main, renkler, hammaddeler) {
    const kapsayici = document.getElementById('ra-liste');
    if (!renkler.length) {
      kapsayici.innerHTML = `<div class="empty-state"><div class="eicon">🎨</div>
        <div class="etitle">Henüz renk tanımlanmamış</div>
        <div class="edesc">"+ Yeni Renk Tanımla" ile renk varyantı oluşturmak istediğiniz renkleri (ör. Beyaz, Antrasit) ekleyin.</div></div>`;
      return;
    }
    kapsayici.innerHTML = renkler.map(r => {
      const satirlar = KATEGORILER.map(k => {
        const adaylar = hammaddeler.filter(h => h.renkKartelaKodu === r.renkKodu && h.malzemeKategorisi === k.deger);
        let durum;
        if (adaylar.length === 1) {
          durum = `<span class="pill pill-green">${App.escapeHtml(adaylar[0].stokKodu || '')} — ${App.escapeHtml(adaylar[0].ad || '')}</span>`;
        } else if (adaylar.length === 0) {
          durum = `<span class="pill pill-amber">⚠ Tanımsız — varyant oluşturulurken bu kategori atlanır</span>`;
        } else {
          durum = `<span class="pill" style="background:var(--red-bg);color:var(--red-text)">⚠ ${adaylar.length} hammadde çakışıyor — belirsiz, biri kaldırılmalı</span>`;
        }
        return `<tr>
          <td style="white-space:nowrap">${App.escapeHtml(k.etiket)}</td>
          <td>${durum}</td>
          <td class="r"><button class="btn btn-sm ra-hm-sec" data-renk="${App.escapeHtml(r.renkKodu)}" data-kat="${k.deger}">${adaylar.length ? 'Değiştir' : '+ Hammadde Ekle/Seç'}</button></td>
        </tr>`;
      }).join('');
      return `
        <div class="card" style="margin-bottom:12px">
          <div class="card-hdr">
            <div class="card-title">${App.escapeHtml(r.renkKodu)} — ${App.escapeHtml(r.renkAdi || '')} <span class="muted" style="font-size:11px">(kısaltma: ${App.escapeHtml(r.kisaltma || '—')})</span></div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm ra-duzenle" data-id="${r.id}">Düzenle</button>
              <button class="btn btn-sm btn-red ra-sil" data-id="${r.id}">Sil</button>
            </div>
          </div>
          <table class="dtable" style="font-size:12px">${satirlar}</table>
        </div>`;
    }).join('');

    kapsayici.querySelectorAll('.ra-duzenle').forEach(btn => {
      btn.onclick = () => renkEkleModal(main, renkler, renkler.find(r => r.id === btn.dataset.id));
    });
    kapsayici.querySelectorAll('.ra-sil').forEach(btn => {
      btn.onclick = () => {
        const kayit = renkler.find(r => r.id === btn.dataset.id);
        App.confirmDialog(`"${App.escapeHtml(kayit.renkKodu)} - ${App.escapeHtml(kayit.renkAdi || '')}" renk tanımı silinecek. ` +
          `Hammadde kartlarındaki etiketler SİLİNMEZ, sadece bu renk için varyant oluşturma/kod üretimi kapanır. Onaylıyor musunuz?`,
          async () => {
            await App.persist(() => Store.renkKisaltmalari.remove(kayit.id));
            App.toast('Renk tanımı silindi', 'ok');
            render(main);
          });
      };
    });
    kapsayici.querySelectorAll('.ra-hm-sec').forEach(btn => {
      btn.onclick = () => hammaddeSecModal(main, btn.dataset.renk, btn.dataset.kat, hammaddeler, renkler);
    });
  }

  // Bir (renk, kategori) hücresi için: var olan bir hammaddeyi bu etikete
  // bağla, ya da sıfırdan yeni bir hammadde kartı oluştur (page_hammadde.js'in
  // kendi formu AÇILIR — alanlar renk/kategoriyle ÖNCEDEN doldurulmuş gelir).
  function hammaddeSecModal(main, renkKodu, kategori, hammaddeler, renkler) {
    const renkKaydi = renkler.find(r => r.renkKodu === renkKodu);
    const kategoriEtiket = (KATEGORILER.find(k => k.deger === kategori) || {}).etiket || kategori;
    const body = document.createElement('div');
    const mevcutEtiketli = hammaddeler.filter(h => h.renkKartelaKodu === renkKodu && h.malzemeKategorisi === kategori);
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">
        <b>${App.escapeHtml(renkKodu)} - ${App.escapeHtml(renkKaydi ? renkKaydi.renkAdi : '')}</b> için
        <b>${App.escapeHtml(kategoriEtiket)}</b> kategorisinde hangi hammadde kullanılacak?
      </div>
      ${mevcutEtiketli.length ? `<div class="flbl" style="margin-bottom:6px">Şu an etiketli (kaldırmak için "Etiketi Kaldır")</div>
        ${mevcutEtiketli.map(h => `<div class="flex-gap" style="justify-content:space-between;align-items:center;padding:6px 0">
          <span class="mono" style="font-size:12px">${App.escapeHtml(h.stokKodu || '')} — ${App.escapeHtml(h.ad || '')}</span>
          <button class="btn btn-sm ra-etiket-kaldir" data-id="${h.id}">Etiketi Kaldır</button>
        </div>`).join('')}<div class="hr"></div>` : ''}
      <div class="fgroup"><label class="flbl">Var olan bir hammaddeyi bu etikete bağla</label>
        <select class="fselect" id="ra-hm-ara">
          <option value="">— Hammadde seçin —</option>
          ${hammaddeler.filter(h => !(h.renkKartelaKodu === renkKodu && h.malzemeKategorisi === kategori))
            .map(h => `<option value="${h.id}">${App.escapeHtml(h.stokKodu || '')} — ${App.escapeHtml(h.ad || '')}</option>`).join('')}
        </select>
      </div>
    `;
    const footer = `<button class="btn" id="ra-hm-vazgec">Vazgeç</button>
      <button class="btn" id="ra-hm-yeni">+ Yeni Hammadde Oluştur</button>
      <button class="btn btn-blue" id="ra-hm-bagla">Seçileni Bu Etikete Bağla</button>`;
    App.openModal({ title: 'Hammadde Eşleştir', body, footer, wide: true });
    document.getElementById('ra-hm-vazgec').onclick = App.closeModal;

    body.querySelectorAll('.ra-etiket-kaldir').forEach(btn => {
      btn.onclick = async () => {
        const h = hammaddeler.find(x => x.id === btn.dataset.id);
        await App.persist(() => Store.hammaddeler.upsert({ ...h, renkKartelaKodu: null, malzemeKategorisi: null }));
        App.toast('Etiket kaldırıldı', 'ok');
        App.closeModal();
        render(main);
      };
    });
    document.getElementById('ra-hm-bagla').onclick = async () => {
      const id = document.getElementById('ra-hm-ara').value;
      if (!id) { App.toast('Önce bir hammadde seçin', 'err'); return; }
      const h = hammaddeler.find(x => x.id === id);
      await App.persist(() => Store.hammaddeler.upsert({ ...h, renkKartelaKodu: renkKodu, malzemeKategorisi: kategori }));
      App.toast('Hammadde etiketlendi: ' + (h.stokKodu || h.ad), 'ok');
      App.closeModal();
      render(main);
    };
    document.getElementById('ra-hm-yeni').onclick = () => {
      App.closeModal();
      PageModules.hammadde.openForm(null, () => render(main), { renkKartelaKodu: renkKodu, malzemeKategorisi: kategori });
    };
  }

  function renkEkleModal(main, renkler, mevcut) {
    const isEdit = !!mevcut;
    const kullanilanlar = new Set(renkler.filter(r => r !== mevcut).map(r => r.renkKodu));
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Renk Kartela Kodu</label>
        <select class="fselect" id="ra-renk-kod" ${isEdit ? 'disabled' : ''}>
          ${RenkKartelasi.liste.filter(r => isEdit ? r.kod === mevcut.renkKodu : !kullanilanlar.has(r.kod))
            .map(r => `<option value="${r.kod}" ${isEdit && mevcut.renkKodu === r.kod ? 'selected' : ''}>${r.kod} - ${App.escapeHtml(r.ad)} (${App.escapeHtml(r.kategori)})</option>`).join('')}
        </select>
      </div>
      <div class="fgroup"><label class="flbl">Kısaltma (kod üretiminde kullanılır — ör. "ANT", "BY")</label>
        <input class="finput" id="ra-kisaltma" value="${App.escapeHtml(mevcut ? mevcut.kisaltma || '' : '')}" placeholder="örn. ANT" maxlength="8">
        <div class="fhint">Mevcut kartlarınızda bu renk için kullandığınız kod son ekiyle AYNI olmalı (ör. "...1.ANT" kullanıyorsanız buraya "ANT" girin), aksi halde yeni varyant kartının kodu eski koda bu kısaltma EKLENEREK üretilir.</div>
      </div>
    `;
    const footer = `<button class="btn" id="ra-vazgec">Vazgeç</button><button class="btn btn-blue" id="ra-kaydet">${isEdit ? 'Güncelle' : 'Ekle'}</button>`;
    App.openModal({ title: isEdit ? 'Renk Tanımını Düzenle' : 'Yeni Renk Tanımla', body, footer });
    document.getElementById('ra-vazgec').onclick = App.closeModal;
    document.getElementById('ra-kaydet').onclick = async () => {
      const kod = document.getElementById('ra-renk-kod').value;
      const kisaltma = document.getElementById('ra-kisaltma').value.trim().toUpperCase();
      if (!kod) { App.toast('Renk kodu seçin', 'err'); return; }
      if (!kisaltma) { App.toast('Kısaltma zorunlu', 'err'); return; }
      const kayit = {
        id: mevcut ? mevcut.id : App.uid('RKA'),
        renkKodu: kod, renkAdi: RenkKartelasi.adGetir(kod), kisaltma
      };
      await App.persist(() => Store.renkKisaltmalari.upsert(kayit));
      App.toast(isEdit ? 'Renk tanımı güncellendi' : 'Renk tanımlandı: ' + kod, 'ok');
      App.closeModal();
      render(main);
    };
  }

  return { render };
})();
