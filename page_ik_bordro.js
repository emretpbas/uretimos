// ════════════════════════════════════════════════════════════════════════════
// İK — BORDRO & ÜCRET — alınan avanslar, aylık işçi ücret hesaplama (SGK/gelir
// vergisi/damga vergisi otomatik), personel bazlı aylık bordro ekranı.
// ════════════════════════════════════════════════════════════════════════════
PageModules.ik_bordro = (() => {
  let activeTab = 'bordro';
  let seciliAy = new Date().toISOString().slice(0, 7);

  async function render(main) {
    const [personeller, bordrolar, avanslar] = await Promise.all([
      Store.personeller.all(), Store.bordrolar.all(), Store.avanslar.all()
    ]);
    const aktifPersonel = personeller.filter(p => p.durum === 'aktif');

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Bordro & Ücret</div><div class="page-sub">Aylık işçi ücret hesaplama, avanslar, bordro ekranı</div></div>
      </div>

      <div class="card" style="background:var(--amber-bg);border-color:var(--amber-light)">
        <div style="font-size:11.5px;color:var(--amber-text)">
          ⚠ Bu bordro hesabı 2026 yılı başında yayımlanan resmi SGK/vergi parametreleriyle (Ayarlar'dan
          görüntülenebilir/güncellenebilir) şeffaf bir hesaplama sunar. <b>Resmi bir bordro yazılımının yerini
          tutmaz.</b> Gerçek ödeme öncesi mali müşavirinizle doğrulayın; asgari ücret, SGK tavanı ve vergi
          dilimleri yasal değişikliklere (genelde Ocak/Temmuz) tabidir.
        </div>
      </div>

      <div class="tabs">
        <div class="tab ${activeTab === 'bordro' ? 'active' : ''}" data-tab="bordro">Aylık Bordro</div>
        <div class="tab ${activeTab === 'avans' ? 'active' : ''}" data-tab="avans">Avanslar</div>
      </div>
      <div id="ikb-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('ikb-tab-content');
    if (activeTab === 'bordro') { content.innerHTML = renderBordroTab(aktifPersonel, bordrolar); wireBordroTab(aktifPersonel, bordrolar, render, main); }
    else { content.innerHTML = renderAvansTab(aktifPersonel, avanslar); wireAvansTab(aktifPersonel, render, main); }
  }

  function kumulatifMatrahBul(personelId, ay, bordrolar) {
    // Aynı yılın önceki aylarındaki bordro kayıtlarının kümülatif matrahını toplar
    const yil = ay.slice(0, 4);
    const ayNo = parseInt(ay.slice(5, 7));
    let toplam = 0;
    bordrolar.filter(b => b.personelId === personelId && b.ay.startsWith(yil)).forEach(b => {
      const buAyNo = parseInt(b.ay.slice(5, 7));
      if (buAyNo < ayNo) toplam += (b.gelirVergisiMatrahiBuAy || 0);
    });
    return toplam;
  }

  function renderBordroTab(personeller, bordrolar) {
    let html = `<div class="card">
      <div class="fgroup" style="max-width:220px"><label class="flbl">Bordro Ayı</label>
        <input class="finput" id="ikb-ay-secim" type="month" value="${seciliAy}">
      </div>
    </div>`;

    html += `<div class="card"><div class="card-hdr"><div class="card-title">${seciliAy} Ayı Bordrosu</div></div>
      <table class="dtable">
        <tr><th>Personel</th><th class="r">Brüt Maaş</th><th class="r">SGK İşçi</th><th class="r">İşsizlik İşçi</th><th class="r">Gelir V.</th><th class="r">Damga V.</th><th class="r">Avans Kesintisi</th><th class="r">Net Ödenecek</th><th></th></tr>`;
    personeller.forEach(p => {
      const mevcutBordro = bordrolar.find(b => b.personelId === p.id && b.ay === seciliAy);
      if (mevcutBordro) {
        // BULGU (T3-33): netOdenecek/avansKesintisi artık bordro
        // hesaplanırken KALICI olarak kaydediliyor (bkz. wireBordroTab) —
        // burada canlı yeniden hesaplanmıyor, doğrudan kayıttan okunuyor.
        // (Eski canlı hesap zaten YANLIŞ sonuç verirdi: bordro
        // hesaplanınca ilgili avanslar mahsupEdildi=true olur, bu yüzden
        // "!a.mahsupEdildi" filtresi bordrodan SONRA hep 0 dönerdi.)
        const avansKesintisi = mevcutBordro.avansKesintisi || 0;
        const netOdenecek = mevcutBordro.netOdenecek != null ? mevcutBordro.netOdenecek : mevcutBordro.netMaas;
        html += `<tr>
          <td><b>${App.escapeHtml(p.adSoyad)}</b></td>
          <td class="r">${App.fmtTL(mevcutBordro.brutMaas)}</td>
          <td class="r">${App.fmtTL(mevcutBordro.sgkIsciPrimi)}</td>
          <td class="r">${App.fmtTL(mevcutBordro.issizlikIsciPrimi)}</td>
          <td class="r">${App.fmtTL(mevcutBordro.gelirVergisiBuAy)}</td>
          <td class="r">${App.fmtTL(mevcutBordro.damgaVergisiBuAy)}</td>
          <td class="r">${avansKesintisi > 0 ? '−' + App.fmtTL(avansKesintisi) : '—'}</td>
          <td class="r"><b>${App.fmtTL(netOdenecek)}</b></td>
          <td><button class="btn btn-sm btn-ghost ikb-detay" data-id="${p.id}">Bordro Detayı</button></td>
        </tr>`;
      } else {
        html += `<tr>
          <td><b>${App.escapeHtml(p.adSoyad)}</b></td>
          <td class="r">${App.fmtTL(p.brutMaas)}</td>
          <td colspan="5" class="muted" style="text-align:center;font-size:11px">Bu ay için bordro hesaplanmadı</td>
          <td><button class="btn btn-sm btn-blue ikb-hesapla" data-id="${p.id}">Bordro Hesapla</button></td>
        </tr>`;
      }
    });
    html += `</table></div>`;
    return html;
  }

  function wireBordroTab(personeller, bordrolar, render, main) {
    document.getElementById('ikb-ay-secim').onchange = (e) => { seciliAy = e.target.value; render(main); };
    document.querySelectorAll('.ikb-hesapla').forEach(b => b.onclick = async () => {
      const p = personeller.find(x => x.id === b.dataset.id);
      const oncekiKumulatif = kumulatifMatrahBul(p.id, seciliAy, bordrolar);
      const hesap = App.bordroHesapla(p.brutMaas, oncekiKumulatif, App.state.ayarlar);
      // BULGU (T3-33): netOdenecek (net maaş - avans kesintisi) bordro
      // kaydına HİÇ yazılmıyordu — renderBordroTab her açılışta Store'dan
      // taze avans listesini çekip yeniden hesaplıyordu. Artık bordro
      // hesaplanırken o ayın MAHSUP EDİLMEMİŞ avansları toplanıp
      // avansKesintisi/netOdenecek olarak KALICI biçimde kaydediliyor ve
      // bu avanslar burada mahsupEdildi=true işaretlenip bordroya bağlanıyor
      // (mahsup artık fiilen bordroya işleniyor, ayrı bir manuel adım değil).
      const guncelAvanslar = await Store.avanslar.all();
      const buAyinAvanslari = guncelAvanslar.filter(a => a.personelId === p.id && a.ay === seciliAy && !a.mahsupEdildi);
      const avansKesintisi = buAyinAvanslari.reduce((a, x) => a + x.tutar, 0);
      const netOdenecek = Math.max(0, hesap.netMaas - avansKesintisi);
      const bordro = {
        id: App.uid('BRD'), personelId: p.id, ay: seciliAy,
        ...hesap, avansKesintisi, netOdenecek, hesaplamaTarihi: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.bordrolar.upsert(bordro));
      if (buAyinAvanslari.length) {
        buAyinAvanslari.forEach(a => { a.mahsupEdildi = true; a.mahsupBordroId = bordro.id; });
        await App.persist(() => Store.avanslar.save(guncelAvanslar));
      }
      // İşverene toplam maliyet (brüt maaş + SGK işveren payı) personel
      // gideri olarak muhasebeye işlenir (KDV'siz, ücret giderleri istisnadır).
      await App.persist(() => App.muhasebeKaydiOlustur({
        tip: 'gider', kategori: 'personel_maliyeti',
        aciklama: 'Bordro: ' + p.adSoyad + ' — ' + seciliAy,
        tutar: hesap.isverenToplamMaliyet, matrah: hesap.isverenToplamMaliyet, kdvOrani: 0, kdvTutari: 0,
        kaynakId: bordro.id, kaynakTip: 'bordro'
      }));
      App.toast('Bordro hesaplandı: ' + p.adSoyad + ' — ' + seciliAy, 'ok');
      render(main);
    });
    document.querySelectorAll('.ikb-detay').forEach(b => b.onclick = () => {
      const p = personeller.find(x => x.id === b.dataset.id);
      const bordro = bordrolar.find(x => x.personelId === p.id && x.ay === seciliAy);
      openBordroDetayModal(p, bordro);
    });
  }

  function openBordroDetayModal(personel, bordro) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">${App.escapeHtml(personel.adSoyad)} — ${bordro.ay} Ayı Bordro Detayı</div>
      <table class="dtable">
        <tr><td>Brüt Maaş</td><td class="r"><b>${App.fmtTL(bordro.brutMaas)}</b></td></tr>
        <tr><td>SGK Matrahı</td><td class="r">${App.fmtTL(bordro.sgkMatrah)}</td></tr>
        <tr><td>SGK İşçi Primi (%14)</td><td class="r">− ${App.fmtTL(bordro.sgkIsciPrimi)}</td></tr>
        <tr><td>İşsizlik Sigortası İşçi Primi (%1)</td><td class="r">− ${App.fmtTL(bordro.issizlikIsciPrimi)}</td></tr>
        <tr><td>Bu Ay Gelir Vergisi Matrahı</td><td class="r">${App.fmtTL(bordro.gelirVergisiMatrahiBuAy)}</td></tr>
        <tr><td>Yıl Sonu Kümülatif Matrah</td><td class="r">${App.fmtTL(bordro.yeniKumulatifMatrah)}</td></tr>
        <tr><td>Gelir Vergisi (Asgari Ücret İstisnası Uygulanmış)</td><td class="r">− ${App.fmtTL(bordro.gelirVergisiBuAy)}</td></tr>
        <tr><td>Damga Vergisi</td><td class="r">− ${App.fmtTL(bordro.damgaVergisiBuAy)}</td></tr>
        <tr class="total-row"><td>NET MAAŞ</td><td class="r"><b>${App.fmtTL(bordro.netMaas)}</b></td></tr>
        <tr><td>SGK İşveren Primi</td><td class="r">${App.fmtTL(bordro.sgkIsverenPrimi)}</td></tr>
        <tr><td>İşsizlik Sigortası İşveren Primi</td><td class="r">${App.fmtTL(bordro.issizlikIsverenPrimi)}</td></tr>
        <tr class="total-row"><td>İŞVERENE TOPLAM MALİYET</td><td class="r"><b>${App.fmtTL(bordro.isverenToplamMaliyet)}</b></td></tr>
      </table>
    `;
    App.openModal({ title: 'Bordro Detayı', body, footer: `<button class="btn" id="bd-close">Kapat</button>`, wide: true });
    document.getElementById('bd-close').onclick = App.closeModal;
  }

  function renderAvansTab(personeller, avanslar) {
    let html = `<div class="card">
      <div class="card-hdr"><div class="card-title">Alınan Avanslar</div>
        <button class="btn btn-sm btn-blue" id="ikb-avans-ekle">+ Avans Ekle</button>
      </div>`;
    if (!avanslar.length) {
      html += `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Henüz avans kaydı yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Personel</th><th>Tarih</th><th>Mahsup Ayı</th><th class="r">Tutar</th><th>Durum</th><th></th></tr>`;
      [...avanslar].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(a => {
        const p = personeller.find(x => x.id === a.personelId);
        html += `<tr><td>${p ? App.escapeHtml(p.adSoyad) : '—'}</td><td style="font-size:11px">${a.tarih}</td>
          <td style="font-size:11px">${a.ay}</td><td class="r">${App.fmtTL(a.tutar)}</td>
          <td>${a.mahsupEdildi ? '<span class="pill pill-green">Mahsup Edildi</span>' : '<span class="pill pill-amber">Bekliyor</span>'}</td>
          <td>${!a.mahsupEdildi ? `<button class="btn btn-sm btn-ghost ikb-mahsup" data-id="${a.id}">Mahsup Et</button>` : ''}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  function wireAvansTab(personeller, render, main) {
    document.getElementById('ikb-avans-ekle').onclick = () => openAvansForm(personeller, () => render(main));
    document.querySelectorAll('.ikb-mahsup').forEach(b => b.onclick = () => {
      App.confirmDialog('Bu avansı mahsup edilmiş olarak işaretlemek istediğinize emin misiniz?', async () => {
        const avanslar = await Store.avanslar.all();
        const a = avanslar.find(x => x.id === b.dataset.id);
        a.mahsupEdildi = true;
        await App.persist(() => Store.avanslar.upsert(a));
        App.toast('Avans mahsup edildi', 'ok');
        render(main);
      });
    });
  }

  function openAvansForm(personeller, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Personel</label>
        <select class="fselect" id="af-personel">
          ${personeller.map(p => `<option value="${p.id}">${App.escapeHtml(p.adSoyad)}</option>`).join('')}
        </select>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Tarih</label><input class="finput" id="af-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="fgroup"><label class="flbl">Mahsup Edilecek Ay</label><input class="finput" id="af-ay" type="month" value="${new Date().toISOString().slice(0, 7)}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Tutar (₺)</label><input class="finput" id="af-tutar" type="number"></div>
    `;
    const footer = `<button class="btn" id="af-cancel">Vazgeç</button><button class="btn btn-blue" id="af-save">Kaydet</button>`;
    App.openModal({ title: 'Avans Ekle', body, footer });
    document.getElementById('af-cancel').onclick = App.closeModal;
    document.getElementById('af-save').onclick = async () => {
      const tutar = parseFloat(document.getElementById('af-tutar').value);
      if (!tutar) { App.toast('Tutar zorunlu', 'err'); return; }
      const personelId = document.getElementById('af-personel').value;
      const personel = personeller.find(p => p.id === personelId);
      const kayit = {
        id: App.uid('AVN'), personelId,
        tarih: document.getElementById('af-tarih').value, ay: document.getElementById('af-ay').value,
        tutar, mahsupEdildi: false
      };
      await App.persist(() => Store.avanslar.upsert(kayit));
      // BULGU (T3-33): avans ödemesi GERÇEK bir nakit çıkışıdır ama hiçbir
      // muhasebe kaydı oluşturmuyordu — Gelir-Gider Özeti'nde görünmüyordu.
      await App.persist(() => App.muhasebeKaydiOlustur({
        tip: 'gider', kategori: 'personel_avans',
        aciklama: 'Personel avansı: ' + (personel ? personel.adSoyad : ''),
        tutar, matrah: tutar, kdvOrani: 0, kdvTutari: 0,
        kaynakId: kayit.id, kaynakTip: 'avans'
      }));
      App.toast('Avans kaydedildi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();
