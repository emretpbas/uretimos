// ════════════════════════════════════════════════════════════════════════════
// FİYATLAMA — Maliyet + nakliye/montaj girişi sonrası liste fiyatı hesabı,
// katalog bazlı fiyat listesi oluşturma.
//
// LİSTE FİYATI FORMÜLÜ (Ayarlar'dan değiştirilebilir oranlarla):
//   Net Maliyet = Hammadde Maliyeti (BOM+fire%) + İşçilik (rota)
//   Ara1 = Net Maliyet × (1 + GYG%)
//   Ara2 = Ara1 × (1 + Nakliye/Montaj%)
//   Ara3 = Ara2 × (1 + Kâr%)
//   Liste Fiyatı = Ara3 / Bölü Katsayısı   (örn. 0.45)
// ════════════════════════════════════════════════════════════════════════════
PageModules.fiyat = (() => {
  let selectedUrunIds = new Set();
  let lastHesap = null;
  let altMontajlarCache = []; // render'da güncellenir; iç maliyet hesaplarında kullanılır
  let paketlerCache = [];     // render'da güncellenir; paket tipi reçete kalemlerinin maliyeti için
  let recetelerCache = [];    // render'da güncellenir; hacim/ağırlık özetleri için gerekir

  async function render(main) {
    const [urunler, receteler, yarimamuller, hammaddeler, rotalar, listeler, altMontajlar, paketler] = await Promise.all([
      Store.urunler.all(), Store.receteler.all(), Store.yarimamuller.all(),
      Store.hammaddeler.all(), Store.rotalar.all(), Store.fiyatListeleri.all(), Store.altMontajlar.all(), Store.paketler.all()
    ]);
    const ayarlar = App.state.ayarlar;
    altMontajlarCache = altMontajlar;
    paketlerCache = paketler;
    recetelerCache = receteler;

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Maliyet & Liste Fiyatı</div>
          <div class="page-sub">Reçeteden gelen maliyet ve kârlılık üzerine nakliye/montaj girip nihai liste fiyatını hesaplayın</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="fy-auto-calc">⚡ Tümünü (Ürün+Yarı Mamül) Otomatik Hesapla ve Listeye Ekle</button>
          <button class="btn btn-green" id="fy-calc" disabled>Seçilenleri Hesapla</button>
        </div>
      </div>

      <div class="card" style="background:var(--blue-bg);border-color:var(--blue-light)">
        <div style="font-size:11.5px;color:var(--blue-text)">
          <b>Liste Fiyatı Formülü:</b> (Net Maliyet × 1+GYG%(${ayarlar.fiyatGygYuzde ?? 10}) × 1+Nakliye%(${ayarlar.fiyatNakliyeYuzde ?? 7}) × 1+Kâr%(${ayarlar.fiyatKarYuzde ?? 54})) ÷ ${ayarlar.fiyatBoluKatsayisi ?? 0.45}
          — oranları Ayarlar'dan değiştirebilirsiniz.
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Ürün Seçimi</div>
          <span class="muted" style="font-size:11px">${selectedUrunIds.size} ürün seçildi</span>
        </div>
        <div id="fy-urun-pick"></div>
      </div>

      <div id="fy-sonuc-wrap"></div>

      <div class="card" id="fy-saved-wrap"></div>
    `;

    const pickWrap = document.getElementById('fy-urun-pick');
    if (!urunler.length) {
      pickWrap.innerHTML = `<div class="empty-state" style="padding:20px 10px"><div class="edesc">Tanımlı ürün yok.</div></div>`;
    } else {
      pickWrap.innerHTML = urunler.map(u => `
        <div class="fcheck" style="padding:7px 4px;border-bottom:1px solid var(--border)">
          <input type="checkbox" class="fy-pick" data-id="${u.id}" ${selectedUrunIds.has(u.id) ? 'checked' : ''}>
          <label style="flex:1;font-size:12.5px"><b class="mono">${App.escapeHtml(u.kod)}</b> — ${App.escapeHtml(u.ad)}</label>
        </div>`).join('');
      pickWrap.querySelectorAll('.fy-pick').forEach(cb => cb.onchange = () => {
        if (cb.checked) selectedUrunIds.add(cb.dataset.id); else selectedUrunIds.delete(cb.dataset.id);
        document.getElementById('fy-calc').disabled = selectedUrunIds.size === 0;
        render(main);
      });
    }
    document.getElementById('fy-calc').disabled = selectedUrunIds.size === 0;
    document.getElementById('fy-calc').onclick = () => hesapla(urunler, receteler, yarimamuller, hammaddeler, rotalar);
    document.getElementById('fy-auto-calc').onclick = () => otomatikHesaplaVeKaydet(urunler, yarimamuller, receteler, hammaddeler, rotalar, main);

    if (lastHesap) renderSonucTable(urunler);
    renderSavedLists(listeler);

    function renderSavedLists(listeler) {
      const wrap = document.getElementById('fy-saved-wrap');
      wrap.innerHTML = `<div class="card-hdr"><div class="card-title">Kayıtlı Katalog Fiyat Listeleri</div></div>`;
      if (!listeler.length) { wrap.innerHTML += `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Henüz kayıtlı fiyat listesi yok.</div></div>`; return; }
      let html = `<table class="dtable"><tr><th>Kod</th><th class="r">Ürün Sayısı</th><th>Tarih</th><th></th></tr>`;
      listeler.forEach(l => {
        html += `<tr><td class="mono">${l.kod}</td><td class="r">${l.kalemler.length}</td><td style="font-size:11px">${l.tarih}</td>
          <td><button class="btn btn-sm btn-ghost fy-view" data-id="${l.id}">Görüntüle</button></td></tr>`;
      });
      html += `</table>`;
      wrap.innerHTML += html;
      wrap.querySelectorAll('.fy-view').forEach(b => b.onclick = () => {
        const l = listeler.find(x => x.id === b.dataset.id);
        showListModal(l);
      });
    }
  }

  // Not: gerçek hesaplama mantığı App.urunMaliyetHesapla() içinde (app.js) merkezi
  // olarak tutulur — Teklif/Sipariş ekranları da aynı fonksiyonu kullanır.
  // HATA DÜZELTMESİ (v38): Bu fonksiyon `rotalar` yerine BOŞ DİZİ geçiyordu,
  // yani BOM maliyetinde hiçbir rota (işçilik) yer almıyordu. Eksik olan
  // kısım aşağıdaki rotaMaliyetHesapla ile telafi edilmeye çalışılıyordu ama
  // o da yalnızca yarı mamül kalemlerine bakıyordu — ürünün KENDİ rotası,
  // alt montaj ve paket rotaları ile iç içe reçetelerdeki rotalar tamamen
  // kayboluyordu. Artık gerçek rota listesi geçiliyor ve tüm ağaç
  // App.kartMaliyetHesapla tarafından tek seferde hesaplanıyor.
  function bomMaliyetHesapla(urunId, receteler, yarimamuller, hammaddeler, ayarlar, urunler, rotalar) {
    const urun = (urunler || []).find(u => u.id === urunId) || { id: urunId, referansFiyat: null };
    const sonuc = App.urunMaliyetHesapla(urun, receteler, yarimamuller, hammaddeler, rotalar || [], ayarlar, altMontajlarCache, urunler || [], paketlerCache);
    return { toplam: sonuc.toplam, detay: sonuc.detay, eksikKalemler: sonuc.eksikKalemler };
  }

  // Yalnızca RAPORLAMA amaçlı: net maliyetin ne kadarının işçilik (rota)
  // olduğunu göstermek için ayrıca hesaplanır. Maliyete İKİNCİ KEZ EKLENMEZ —
  // rota maliyeti zaten bomMaliyetHesapla içindeki toplama dahildir.
  function rotaPayiHesapla(urunId, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar) {
    const urun = (urunler || []).find(u => u.id === urunId);
    if (!urun) return 0;
    let toplam = 0;
    const gorulen = new Set();
    const receteBul = (tip, id) =>
      tip === 'urun' ? receteler.find(r => r.urunId === id)
      : tip === 'yarimamul' ? receteler.find(r => r.yarimamulId === id)
      : tip === 'altmontaj' ? receteler.find(r => r.altMontajId === id)
      : receteler.find(r => r.paketId === id);
    const kartBul = (tip, id) =>
      tip === 'urun' ? (urunler || []).find(x => x.id === id)
      : tip === 'yarimamul' ? (yarimamuller || []).find(x => x.id === id)
      : tip === 'altmontaj' ? (altMontajlar || []).find(x => x.id === id)
      : (paketlerCache || []).find(x => x.id === id);
    const gez = (tip, id, kat) => {
      const anahtar = tip + ':' + id;
      if (gorulen.has(anahtar)) return;      // döngü koruması
      gorulen.add(anahtar);
      const kart = kartBul(tip, id);
      if (kart && kart.rotaId) {
        const rota = (rotalar || []).find(r => r.id === kart.rotaId);
        if (rota) toplam += (rota.toplamMaliyet || 0) * kat;
      }
      const r = receteBul(tip, id);
      if (r) (r.kalemler || []).forEach(k => {
        if (['yarimamul', 'altmontaj', 'paket', 'urun'].includes(k.tip)) {
          gez(k.tip, k.refId, kat * (k.miktar || 1));
        }
      });
      gorulen.delete(anahtar);
    };
    gez('urun', urunId, 1);
    return toplam;
  }

  // Liste fiyatı formülünü uygula: (maliyet × 1+gyg × 1+nakliye × 1+kar) / bölüKatsayısı
  function listeFiyatiHesapla(netMaliyet, ayarlar) {
    const gyg = 1 + (ayarlar.fiyatGygYuzde ?? 10) / 100;
    const nakliye = 1 + (ayarlar.fiyatNakliyeYuzde ?? 7) / 100;
    const kar = 1 + (ayarlar.fiyatKarYuzde ?? 54) / 100;
    const bolu = ayarlar.fiyatBoluKatsayisi ?? 0.45;
    const araToplam = netMaliyet * gyg * nakliye * kar;
    const listeFiyati = bolu > 0 ? araToplam / bolu : araToplam;
    return { gygTutar: netMaliyet * (gyg - 1), nakliyeTutar: netMaliyet * gyg * (nakliye - 1), karTutar: netMaliyet * gyg * nakliye * (kar - 1), araToplam, listeFiyati };
  }

  // Manuel seçim gerektirmeden TÜM ürün ve yarı mamüllerin liste fiyatını
  // otomatik hesaplar (BOM/referans maliyetinden + liste fiyatı formülü) ve
  // bunu kapsayan bir katalog fiyat listesi kaydeder. Teklif Hazırlama bu
  // listeyi öncelikli kaynak olarak kullanır.
  async function otomatikHesaplaVeKaydet(urunler, yarimamuller, receteler, hammaddeler, rotalar, main) {
    const ayarlar = App.state.ayarlar;
    const kalemler = [];

    urunler.forEach(u => {
      const m = App.urunMaliyetHesapla(u, receteler, yarimamuller, hammaddeler, rotalar, ayarlar, altMontajlarCache, urunler, paketlerCache);
      const f = listeFiyatiHesapla(m.toplam, ayarlar);
      kalemler.push({ urunId: u.id, kod: u.kod, ad: u.ad, tip: 'urun', hammaddeMaliyet: m.toplam, netMaliyet: m.toplam, ...f, eksikKalemVarMi: m.eksikKalemler.length > 0 });
    });

    yarimamuller.forEach(y => {
      const sonuc = App.kartMaliyetHesapla(y, 'yarimamul', receteler, yarimamuller, altMontajlarCache, urunler, hammaddeler, rotalar, ayarlar, undefined, paketlerCache);
      const f = listeFiyatiHesapla(sonuc.toplam, ayarlar);
      kalemler.push({ urunId: y.id, kod: y.kod, ad: y.ad, tip: 'yarimamul', hammaddeMaliyet: sonuc.toplam, netMaliyet: sonuc.toplam, ...f, eksikKalemVarMi: sonuc.kaynak === 'yok' || sonuc.eksikKalemler.length > 0 });
    });

    const liste = {
      id: App.uid('FL'),
      kod: 'FL-' + Date.now().toString(36).toUpperCase(),
      tarih: new Date().toISOString().slice(0, 10),
      otomatikOlusturuldu: true,
      ayarlarSnapshot: { ...ayarlar },
      kalemler
    };
    await App.persist(() => Store.fiyatListeleri.upsert(liste));

    const eksikSayisi = kalemler.filter(k => k.eksikKalemVarMi).length;
    let mesaj = `Otomatik fiyat listesi oluşturuldu: ${liste.kod} (${kalemler.length} kalem — ${urunler.length} ürün, ${yarimamuller.length} yarı mamül)`;
    if (eksikSayisi > 0) mesaj += ` ⚠ ${eksikSayisi} kalemin maliyeti hesaplanamadı (0 olarak kaydedildi).`;
    App.toast(mesaj, eksikSayisi > 0 ? 'err' : 'ok');
    render(main);
  }

  async function hesapla(urunler, receteler, yarimamuller, hammaddeler, rotalar) {
    const ayarlar = App.state.ayarlar;
    lastHesap = {};
    selectedUrunIds.forEach(id => {
      // bom.toplam ARTIK rota (işçilik) maliyetini de içeriyor — ürünün kendi
      // rotası, alt montaj/paket rotaları ve iç içe reçetelerdeki rotalar dahil.
      // Bu yüzden ayrıca EKLENMEZ; rotaPayi yalnızca "bunun ne kadarı işçilik"
      // sorusunu yanıtlamak için raporlanır.
      const bom = bomMaliyetHesapla(id, receteler, yarimamuller, hammaddeler, ayarlar, urunler, rotalar);
      const rotaPayi = rotaPayiHesapla(id, receteler, yarimamuller, altMontajlarCache, urunler, hammaddeler, rotalar, ayarlar);
      const netMaliyet = bom.toplam;
      const f = listeFiyatiHesapla(netMaliyet, ayarlar);
      const karlilikYuzde = f.listeFiyati > 0 ? (f.karTutar / f.listeFiyati) * 100 : 0;
      lastHesap[id] = { hammaddeMaliyet: Math.max(0, bom.toplam - rotaPayi), iscilikMaliyet: rotaPayi, netMaliyet, ...f, karlilikYuzde, bomDetay: bom.detay, eksikKalemler: bom.eksikKalemler };
    });
    renderSonucTable(urunler);
  }

  function renderSonucTable(urunler) {
    const wrap = document.getElementById('fy-sonuc-wrap');
    if (!lastHesap) { wrap.innerHTML = ''; return; }

    // Eksik maliyetli kalemleri olan ürünleri topla (hammadde ataması da referans fiyatı da yok)
    const tumEksikler = [];
    Object.entries(lastHesap).forEach(([id, h]) => {
      const u = urunler.find(x => x.id === id);
      (h.eksikKalemler || []).forEach(ek => tumEksikler.push({ urunKod: u ? u.kod : id, ...ek }));
    });

    let html = '';
    if (tumEksikler.length) {
      html += `<div class="card" style="background:var(--red-bg);border-color:var(--red-light)">
        <div style="font-size:12px;color:var(--red-text);font-weight:700;margin-bottom:6px">⚠ Maliyeti Hesaplanamayan ${tumEksikler.length} Kalem Var</div>
        <div style="font-size:11.5px;color:var(--red-text)">
          Bu kalemlerin ne hammadde ataması ne de referans fiyatı var, maliyete <b>0</b> olarak girdiler — liste fiyatı gerçeği yansıtmıyor olabilir.
          Yarı Mamüller sayfasından hammadde atayın veya kalemin referans fiyatını girin.
        </div>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
          ${tumEksikler.map(ek => `<div style="font-size:11.5px">• <b class="mono">${App.escapeHtml(ek.kod)}</b> — ${App.escapeHtml(ek.ad)} <span class="muted">(${App.escapeHtml(ek.urunKod)} reçetesinde)</span> <button class="btn btn-sm fy-fiyat-gir" data-kod="${App.escapeHtml(ek.kod)}" style="margin-left:8px">Fiyat Gir</button></div>`).join('')}
        </div>
      </div>`;
    }

    html += `<div class="card">
      <div class="card-hdr"><div class="card-title">Katalog Fiyat Listesi Önizleme</div>
        <button class="btn btn-sm btn-blue" id="fy-save-list">Katalog Fiyat Listesi Olarak Kaydet</button>
      </div>
      <div class="tbl-wrap"><table class="dtable">
        <tr><th>Ürün</th><th>📦 Hacim / Ağırlık</th><th class="r">Net Maliyet</th><th class="r">GYG</th><th class="r">Nakliye/Montaj</th><th class="r">Kâr</th><th class="r">Liste Fiyatı</th><th class="r">Kârlılık %</th></tr>`;
    let toplamListe = 0, toplamMaliyet = 0;
    Object.entries(lastHesap).forEach(([id, h]) => {
      const u = urunler.find(x => x.id === id);
      toplamListe += h.listeFiyati; toplamMaliyet += h.netMaliyet;
      const eksikVar = (h.eksikKalemler || []).length > 0;
      html += `<tr>
        <td><b class="mono">${u ? App.escapeHtml(u.kod) : id}</b><br><span class="muted" style="font-size:10.5px">${u ? App.escapeHtml(u.ad) : ''}</span></td>
        <td style="font-size:10.5px">${(() => {
          // Hacim/ağırlık: elle girilmişse karttan, yoksa reçetedeki paketlerden
          if (!u) return '<span class="muted">—</span>';
          const ozet = App.urunPaketOzeti(u.id, recetelerCache, paketlerCache, 1);
          const coz = App.olcuAgirlikCoz(u, ozet, 1);
          const metin = App.olcuOzetMetni(coz);
          return metin ? metin + ' ' + App.olcuKaynakRozeti(coz) : '<span class="muted">—</span>';
        })()}</td>
        <td class="r"><b>${App.fmtTL(h.netMaliyet)}</b>${eksikVar ? ' <span class="pill pill-red" style="font-size:9px">EKSİK</span>' : ''}</td>
        <td class="r">${App.fmtTL(h.gygTutar)}</td>
        <td class="r">${App.fmtTL(h.nakliyeTutar)}</td>
        <td class="r" style="color:var(--green-text)">${App.fmtTL(h.karTutar)}</td>
        <td class="r"><b style="font-size:13px">${App.fmtTL(h.listeFiyati)}</b></td>
        <td class="r"><span class="pill pill-green">${App.fmtPct(h.karlilikYuzde)}</span></td>
      </tr>`;
    });
    // TOPLAM satırı: hacim ve ağırlık da alt alta toplanır
    let tM3 = 0, tBrut = 0, tNet = 0, tKoli = 0;
    Object.keys(lastHesap).forEach(id => {
      const u = urunler.find(x => x.id === id);
      if (!u) return;
      const coz = App.olcuAgirlikCoz(u, App.urunPaketOzeti(u.id, recetelerCache, paketlerCache, 1), 1);
      tM3 += coz.m3; tBrut += coz.brutKg; tNet += coz.netKg; tKoli += coz.paketSayisi;
    });
    const toplamOlcuMetni = [
      tKoli ? App.fmt(tKoli, 0) + ' koli' : '',
      tM3 ? App.fmt(tM3, 3) + ' m³' : '',
      tBrut ? App.fmt(tBrut, 1) + ' kg brüt' : (tNet ? App.fmt(tNet, 1) + ' kg net' : '')
    ].filter(Boolean).join(' · ');
    html += `<tr class="total-row"><td>TOPLAM</td><td style="font-size:10.5px">${toplamOlcuMetni || ''}</td><td class="r">${App.fmtTL(toplamMaliyet)}</td><td></td><td></td><td></td><td class="r">${App.fmtTL(toplamListe)}</td><td></td></tr>`;
    html += `</table></div></div>`;
    wrap.innerHTML = html;
    document.getElementById('fy-save-list').onclick = () => saveList(urunler);
    wrap.querySelectorAll('.fy-fiyat-gir').forEach(b => b.onclick = () => openHizliFiyatGir(b.dataset.kod, urunler));
  }

  // Eksik maliyetli bir yarı mamüle hızlıca referans fiyat girme (Fiyatlama ekranından çıkmadan)
  async function openHizliFiyatGir(ymKod, urunler) {
    const yarimamuller = await Store.yarimamuller.all();
    const ym = yarimamuller.find(y => y.kod === ymKod);
    if (!ym) return;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">${App.escapeHtml(ym.ad)} için hammadde ataması bulunamadı. Buradan hızlıca bir referans fiyat girebilirsiniz (BOM hesabı yerine kullanılır).</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Referans Fiyat</label><input class="finput" id="hf-fiyat" type="number" step="0.0001" value="${ym.referansFiyat ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Para Birimi</label>
          <select class="fselect" id="hf-dvz">
            <option value="TL" ${(ym.referansDvz || 'TL') === 'TL' ? 'selected' : ''}>₺ TL</option>
            <option value="USD" ${ym.referansDvz === 'USD' ? 'selected' : ''}>$ USD</option>
            <option value="EUR" ${ym.referansDvz === 'EUR' ? 'selected' : ''}>€ EUR</option>
          </select>
        </div>
      </div>
    `;
    const footer = `<button class="btn" id="hf-cancel">Vazgeç</button><button class="btn btn-blue" id="hf-save">Kaydet ve Yeniden Hesapla</button>`;
    App.openModal({ title: 'Referans Fiyat Gir', sub: ym.kod, body, footer });
    document.getElementById('hf-cancel').onclick = App.closeModal;
    document.getElementById('hf-save').onclick = async () => {
      ym.referansFiyat = parseFloat(document.getElementById('hf-fiyat').value) || null;
      ym.referansDvz = document.getElementById('hf-dvz').value;
      await App.persist(() => Store.yarimamuller.upsert(ym));
      App.toast('Referans fiyat kaydedildi', 'ok');
      App.closeModal();
      const receteler = await Store.receteler.all();
      const hammaddeler = await Store.hammaddeler.all();
      const rotalar = await Store.rotalar.all();
      await hesapla(urunler, receteler, yarimamuller, hammaddeler, rotalar);
    };
  }

  async function saveList(urunler) {
    const ayarlar = App.state.ayarlar;
    const kalemler = Object.entries(lastHesap).map(([id, h]) => {
      const u = urunler.find(x => x.id === id);
      return { urunId: id, kod: u ? u.kod : id, ad: u ? u.ad : '', ...h };
    });
    const liste = {
      id: App.uid('FL'),
      kod: 'FL-' + Date.now().toString(36).toUpperCase(),
      tarih: new Date().toISOString().slice(0, 10),
      ayarlarSnapshot: { ...ayarlar },
      kalemler
    };
    await App.persist(() => Store.fiyatListeleri.upsert(liste));
    App.toast('Katalog fiyat listesi kaydedildi: ' + liste.kod, 'ok');
    App.goTo('fiyat');
  }

  function showListModal(liste) {
    const body = document.createElement('div');
    let html = `<div class="tbl-wrap"><table class="dtable">
      <tr><th>Ürün</th><th class="r">Net Maliyet</th><th class="r">Liste Fiyatı</th><th class="r">Kârlılık %</th></tr>`;
    liste.kalemler.forEach(k => {
      html += `<tr><td><b class="mono">${App.escapeHtml(k.kod)}</b><br><span class="muted" style="font-size:10.5px">${App.escapeHtml(k.ad)}</span></td>
        <td class="r">${App.fmtTL(k.netMaliyet)}</td><td class="r"><b>${App.fmtTL(k.listeFiyati)}</b></td><td class="r">${App.fmtPct(k.karlilikYuzde)}</td></tr>`;
    });
    html += `</table></div>
    <div class="fhint" style="margin-top:10px">Bu fiyat listesi ${liste.tarih} tarihindeki ayarlarla (GYG %${liste.ayarlarSnapshot.fiyatGygYuzde ?? 10}, Nakliye %${liste.ayarlarSnapshot.fiyatNakliyeYuzde ?? 7}, Kâr %${liste.ayarlarSnapshot.fiyatKarYuzde ?? 54}, bölü ${liste.ayarlarSnapshot.fiyatBoluKatsayisi ?? 0.45}) hesaplanmıştır.</div>`;
    body.innerHTML = html;
    App.openModal({ title: liste.kod, sub: 'Katalog Fiyat Listesi Detayı', body, xwide: true });
  }

  return { render };
})();
