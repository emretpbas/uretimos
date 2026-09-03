// ════════════════════════════════════════════════════════════════════════════
// SİPARİŞLER — teklifin sipariş haline gelmiş hali, cari onayı, genel görünüm.
// Ayrıca buradan DOĞRUDAN da yeni sipariş oluşturulabilir: ürünler katalog
// fiyat listesinden (varsa) veya tanımlı ürün kartlarından seçilip miktar
// girilerek sipariş kalemi oluşturulur.
// ════════════════════════════════════════════════════════════════════════════
PageModules.siparis = (() => {
  let detayId = null;
  let draft = null;

  // Paket ölçü/ağırlık — sipariş listelerinde gösterim için
  let _pkCache = { urunler: [], receteler: [], paketler: [] };
  async function paketVerisiYukle() {
    const [urunler, receteler, paketler] = await Promise.all([
      Store.urunler.all(), Store.receteler.all(), Store.paketler.all()]);
    _pkCache = { urunler, receteler, paketler };
  }
  // Elle girilen kart değerleri reçeteden hesaplanana ÖNCELIKLIDIR.
  function kalemOlcuCozumu(kalemKod, miktar) {
    const urun = _pkCache.urunler.find(u => u.kod === kalemKod);
    if (!urun) return null;
    const ozet = App.urunPaketOzeti(urun.id, _pkCache.receteler, _pkCache.paketler, miktar || 1);
    const coz = App.olcuAgirlikCoz(urun, ozet, miktar || 1);
    return coz.kaynak === 'yok' ? null : coz;
  }
  function kalemPaketOzeti(kalemKod, miktar) {
    const coz = kalemOlcuCozumu(kalemKod, miktar);
    if (!coz) return null;
    return { paketSayisi: coz.paketSayisi, netKg: coz.netKg, brutKg: coz.brutKg, desi: coz.desi, m3: coz.m3 };
  }
  function siparisPaketToplami(kalemler) {
    const t = { paketSayisi: 0, netKg: 0, brutKg: 0, desi: 0, m3: 0, satirSayisi: 0, elleGirilen: 0 };
    (kalemler || []).forEach(k => {
      const coz = kalemOlcuCozumu(k.kod, k.miktar || 1);
      if (!coz) return;
      t.satirSayisi++;
      if (coz.kaynak === 'manuel') t.elleGirilen++;
      t.paketSayisi += coz.paketSayisi; t.netKg += coz.netKg;
      t.brutKg += coz.brutKg; t.desi += coz.desi; t.m3 += coz.m3;
    });
    return t;
  }
  // Hacim ve ağırlık bilgileri ALT ALTA toplanır (navlun / yükleme planı)
  function paketToplamKutusu(t) {
    if (!t || (!t.paketSayisi && !t.m3 && !t.brutKg && !t.netKg)) return '';
    const satir = (etiket, deger, vurgu) => deger
      ? `<div style="display:flex;justify-content:space-between;gap:20px;padding:3px 0${vurgu ? ';font-weight:700' : ''}">
           <span style="color:var(--text2)">${etiket}</span><span class="mono">${deger}</span>
         </div>` : '';
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-top:10px;font-size:11.5px;max-width:340px">
      <div style="font-weight:700;margin-bottom:6px">📦 Toplam Hacim ve Ağırlık</div>
      ${satir('Koli / Paket Sayısı', t.paketSayisi ? App.fmt(t.paketSayisi, 0) + ' adet' : '')}
      ${satir('Toplam Hacim', t.m3 ? App.fmt(t.m3, 3) + ' m³' : '', true)}
      ${satir('Toplam Desi', t.desi ? App.fmt(t.desi, 1) : '')}
      ${satir('Net Ağırlık', t.netKg ? App.fmt(t.netKg, 1) + ' kg' : '')}
      ${satir('Brüt Ağırlık', t.brutKg ? App.fmt(t.brutKg, 1) + ' kg' : '', true)}
      ${t.elleGirilen ? `<div class="fhint" style="margin-top:6px">${t.elleGirilen}/${t.satirSayisi} kalemde elle girilmiş ölçü kullanıldı.</div>` : ''}
    </div>`;
  }

  async function render(main) {
    await paketVerisiYukle();
    const siparisler = await Store.siparisler.all();
    if (draft) { renderForm(main, draft); return; }
    if (detayId) {
      const s = siparisler.find(x => x.id === detayId);
      if (s) { renderDetay(main, s); return; }
      detayId = null;
    }
    renderList(main, siparisler);
  }

  function renderList(main, siparisler) {
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Siparişler</div><div class="page-sub">Tüm siparişlerin durumu, cari onayı ve üretim termini</div></div>
        <div class="page-acts"><button class="btn btn-blue" id="sp-new">+ Yeni Sipariş Oluştur</button></div>
      </div>
      <div class="card" id="sp-list"></div>
    `;
    document.getElementById('sp-new').onclick = () => startNewSiparis(main);
    const wrap = document.getElementById('sp-list');
    if (!siparisler.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="eicon">▤</div><div class="etitle">Henüz sipariş yok</div><div class="edesc">"+ Yeni Sipariş Oluştur" ile başlayın, veya Teklif Hazırlama'dan bir teklifi siparişe dönüştürün.</div></div>`;
      return;
    }
    let html = `<table class="dtable"><tr><th>Kod</th><th>Müşteri</th><th class="r">Toplam</th><th>Durum</th><th>Üretim Termini</th><th>Tarih</th><th></th></tr>`;
    [...siparisler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(s => {
      html += `<tr><td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi || '—')}</td>
        <td class="r"><b>${App.fmtTL(s.toplam)}</b></td><td>${siparisDurumPill(s.durum)}</td>
        <td>${s.uretimTermini || '<span class="muted">—</span>'}</td>
        <td style="font-size:11px">${s.tarih}</td>
        <td><button class="btn btn-sm btn-ghost sp-detay" data-id="${s.id}">Detay</button></td></tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll('.sp-detay').forEach(b => b.onclick = () => { detayId = b.dataset.id; render(main); });
  }

  async function startNewSiparis(main) {
    const musteriler = await Store.musteriler.all();
    draft = { musteriId: musteriler[0] ? musteriler[0].id : '', kalemler: [] };
    render(main);
  }

  // Var olan bir siparişi (her durumdaki) geri çekip tam düzenleme moduna açar.
  // Durum 'taslak'a döner, üretim kuyruğundan ve kesim ihtiyaçlarından ayrıca
  // çıkarılmaz (bu kasıtlı — zaten oluşmuş kesim/üretim hareketleri korunur,
  // sadece sipariş kalem/fiyat/müşteri bilgisi yeniden düzenlenebilir olur).
  function startEditSiparis(main, siparis) {
    // BULGU/FIX: sevk edilmiş (irsaliye/fatura kesilmiş) bir sipariş tekrar
    // "Cari Onayında"ya düşürülüp düzenlenebiliyordu — bu, ödeme planını,
    // vade farkını ve kesim ihtiyacını İKİNCİ KEZ işleterek çift kayıt riski
    // doğuruyordu (üstelik zaten kesilmiş irsaliye/fatura yeni içerikle
    // uyuşmaz hale geliyordu). Sevk edilmiş siparişler artık düzenlenemez.
    // T3-23: kısmen sevk edilmiş ('kismi_sevk_edildi') siparişler de AYNI
    // riski taşır — zaten kesilmiş irsaliye/fatura(lar) var, kalemler/
    // fiyatlar değiştirilirse geri kalan sevkiyat/fatura tutarsız olur.
    if (siparis.durum === 'sevk_edildi' || siparis.durum === 'kismi_sevk_edildi') {
      App.toast('Sevkiyatı başlamış bir sipariş artık düzenlenemez (irsaliye/fatura zaten kesilmiş).', 'err');
      return;
    }
    draft = {
      editingId: siparis.id,
      editingKod: siparis.kod,
      musteriId: siparis.musteriId,
      kalemler: siparis.kalemler.map(k => ({ ...k })),
      genelIskontoYuzde: siparis.genelIskontoYuzde || 0,
      // Ek giderler (nakliye/palet/montaj/fason vb.) siparişe de taşınır —
      // aksi halde teklifte müşteriye yansıtılan bu tutarlar sipariş
      // aşamasında kaybolur ve gelir sızıntısı olurdu.
      ekGiderler: (siparis.ekGiderler || []).map(g => ({ ...g })),
      ekGiderM2: siparis.ekGiderM2 || 0
    };
    detayId = null;
    render(main);
  }

  async function renderForm(main, d) {
    const [musteriler, urunler, fiyatListeleri, hammaddeler, yarimamuller, receteler, rotalar, altMontajlar, paketler] = await Promise.all([
      Store.musteriler.all(), Store.urunler.all(), Store.fiyatListeleri.all(),
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.receteler.all(), Store.rotalar.all(), Store.altMontajlar.all(), Store.paketler.all()
    ]);
    const ayarlar = App.state.ayarlar;
    const sonListe = fiyatListeleri[fiyatListeleri.length - 1];
    const duzenlemeModu = !!d.editingId;

    // ── Üç kategoriden de seçenek üret: Ürün (bitmiş), Yarı Mamül, Hammadde ──
    // Her birinin maliyeti hesaplanır; maliyet bulunamazsa "maliyetYok" işaretlenir
    // ve kullanıcı seçtiğinde fiyatı manuel girmesi istenir.
    const urunSecenekleri = urunler.map(u => {
      const katalogKalem = sonListe ? sonListe.kalemler.find(k => k.kod === u.kod) : null;
      let netFiyat = katalogKalem ? katalogKalem.listeFiyati : null;
      let maliyetYok = false;
      if (netFiyat == null) {
        const m = App.urunMaliyetHesapla(u, receteler, yarimamuller, hammaddeler, rotalar, ayarlar, altMontajlar, urunler, paketler);
        if (m.toplam > 0 && m.eksikKalemler.length === 0) netFiyat = m.toplam;
        else { netFiyat = 0; maliyetYok = true; }
      }
      return { grup: 'urun', kod: u.kod, ad: u.ad, netFiyat, maliyetYok, birim: 'ADET' };
    });
    const ymSecenekleri = yarimamuller.map(y => {
      const { birimMaliyet, kaynak } = App.ymBirimMaliyetHesapla(y, hammaddeler, ayarlar, receteler, yarimamuller);
      return { grup: 'yarimamul', kod: y.kod, ad: y.ad, netFiyat: birimMaliyet, maliyetYok: kaynak === 'yok', birim: 'ADET' };
    });
    const hmSecenekleri = hammaddeler.map(h => {
      const fiyatTRY = App.toTRY(h.birimFiyat, h.dvz, ayarlar);
      return { grup: 'hammadde', kod: h.stokKodu, ad: h.ad, netFiyat: fiyatTRY, maliyetYok: !h.birimFiyat, birim: h.birim };
    });
    const tumSecenekler = [...urunSecenekleri, ...ymSecenekleri, ...hmSecenekleri];

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${duzenlemeModu ? 'Siparişi Düzenle: ' + d.editingKod : 'Yeni Sipariş'}</div><div class="page-sub">${sonListe ? 'Fiyatlar katalogdan (' + sonListe.kod + ') alınıyor, yoksa BOM maliyetinden hesaplanır' : 'Fiyatlar BOM maliyetinden hesaplanır, bulunamayan kalemler için fiyat girmeniz istenir'}</div></div>
        <div class="page-acts"><button class="btn" id="sp-cancel-draft">Vazgeç</button></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Müşteri</div></div>
        <select class="fselect" id="sp-musteri">
          ${musteriler.map(m => `<option value="${m.id}" ${d.musteriId === m.id ? 'selected' : ''}>${App.escapeHtml(m.unvan)}</option>`).join('')}
        </select>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Kalem Ekle (Ürün, Yarı Mamül veya Hammadde)</div></div>
        <div id="sp-urun-pick"></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Sipariş Kalemleri</div></div>
        <div id="sp-kalem-table"></div>
        <div style="margin-top:14px;display:flex;justify-content:flex-end">
          <button class="btn btn-blue" id="sp-save-draft">${duzenlemeModu ? 'Değişiklikleri Kaydet' : 'Siparişi Oluştur'}</button>
        </div>
      </div>
    `;
    document.getElementById('sp-cancel-draft').onclick = () => { draft = null; render(main); };
    document.getElementById('sp-musteri').onchange = (e) => { d.musteriId = e.target.value; };

    const pickWrap = document.getElementById('sp-urun-pick');
    if (!tumSecenekler.length) {
      pickWrap.innerHTML = `<div class="empty-state" style="padding:16px 10px"><div class="edesc">Tanımlı ürün/yarı mamül/hammadde yok.</div></div>`;
    } else {
      pickWrap.innerHTML = `
        <button class="btn btn-blue" id="sp-urun-sec-sayfa">🔍 Kalem Seç (Ara &amp; Listele)</button>
        <div class="fhint" style="margin-top:8px">Açılan sayfada kod, ad veya birime göre arayıp seçebilirsiniz. ⚠ işaretli kalemlerin maliyeti hesaplanamadı — seçtiğinizde fiyatı elle girmeniz istenecek.</div>`;
      document.getElementById('sp-urun-sec-sayfa').onclick = () => {
        App.goTo('kalem_secici', {
          baslik: 'Sipariş için Kalem Seç',
          secenekler: tumSecenekler,
          gruplar: { urun: 'Bitmiş Ürünler', yarimamul: 'Yarı Mamüller', hammadde: 'Hammadde/Hırdavat' },
          geriDon: () => render(main),
          onSecildi: (secim) => {
            openMiktarGirisi(secim, (miktar) => {
              const eklemeYap = (netFiyat) => {
                const mevcut = d.kalemler.find(k => k.kod === secim.kod && k.grup === secim.grup);
                if (mevcut) { mevcut.miktar += miktar; }
                else { d.kalemler.push({ grup: secim.grup, kod: secim.kod, ad: secim.ad, netFiyat, miktar, birim: secim.birim }); }
                render(main);
              };
              if (secim.maliyetYok) openMaliyetYokUyari(secim, eklemeYap);
              else eklemeYap(secim.netFiyat);
            });
          }
        });
      };
    }

    renderKalemTable();

    function renderKalemTable() {
      const wrap = document.getElementById('sp-kalem-table');
      if (!d.kalemler.length) {
        wrap.innerHTML = `<div class="empty-state" style="padding:16px 10px"><div class="edesc">Henüz ürün eklenmedi.</div></div>`;
        document.getElementById('sp-save-draft').disabled = true;
        return;
      }
      document.getElementById('sp-save-draft').disabled = false;
      let html = `<table class="dtable"><tr><th>Ürün</th><th>📦 Paket / Ağırlık</th><th class="r">Birim Fiyat</th><th class="r">Miktar</th><th class="r">Toplam</th><th></th></tr>`;
      d.kalemler.forEach((k, i) => {
        html += `<tr>
          <td><b class="mono">${App.escapeHtml(k.kod)}</b><br><span class="muted" style="font-size:10.5px">${App.escapeHtml(k.ad)}</span></td>
          <td style="font-size:10.5px;color:var(--blue-text)">${(() => { const coz = kalemOlcuCozumu(k.kod, k.miktar || 1); const m = coz ? App.olcuOzetMetni(coz) : ''; return m ? '📦 ' + m : '<span class="muted">—</span>'; })()}</td>
          <td class="r"><input class="finput sp-fiyat" data-i="${i}" type="number" step="0.01" value="${k.netFiyat}" style="width:100px;text-align:right"></td>
          <td class="r"><input class="finput sp-miktar" data-i="${i}" type="number" value="${k.miktar}" min="1" style="width:60px;text-align:right"></td>
          <td class="r mono sp-toplam" data-i="${i}">${App.fmtTL(k.netFiyat * k.miktar)}</td>
          <td><button class="btn btn-icon btn-ghost sp-del-kalem" data-i="${i}" style="color:var(--red-text)">&times;</button></td>
        </tr>`;
      });
      const araToplam = d.kalemler.reduce((a, k) => a + k.netFiyat * k.miktar, 0);
      const genelIskontoYuzde = d.genelIskontoYuzde || 0;
      // Ek giderler (nakliye/palet/montaj/fason…) dip toplama dahildir.
      // Ölçü: paket m³ + kalemlerin toplam alanı (m² bazlı fason giderler için).
      const egOlcu = { m2: +d.ekGiderM2 || 0, m3: (siparisPaketToplami(d.kalemler).m3) || 0, araToplam };
      const egHesap = App.ekGiderToplami(d.ekGiderler || [], egOlcu);
      const dipToplam = araToplam * (1 - genelIskontoYuzde / 100) + egHesap.yansitilanToplam;
      html += `<tr class="total-row"><td colspan="3">ARA TOPLAM</td><td class="r" id="sp-ara-toplam">${App.fmtTL(araToplam)}</td><td></td></tr>`;
      html += `</table>`;
      html += `<div id="sp-ek-gider"></div>`;
      html += `
        <div class="flex-between" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div class="fgroup" style="margin:0;display:flex;align-items:center;gap:10px">
            <label class="flbl" style="margin:0">Genel İskonto (Toplamdan)</label>
            <input class="finput" id="sp-genel-iskonto" type="number" value="${genelIskontoYuzde}" step="0.5" style="width:80px;text-align:right">
            <span style="font-size:12px;color:var(--text2)">%</span>
          </div>
          <div style="text-align:right">
            <div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;font-weight:700;letter-spacing:.04em">Dip Toplam (İskontolu${egHesap.yansitilanToplam ? ' + Ek Gider' : ''})</div>
            <div id="sp-dip-toplam" style="font-size:19px;font-weight:800;color:var(--green-text)">${App.fmtTL(dipToplam)}</div>
          </div>
        </div>`;
      html += paketToplamKutusu(siparisPaketToplami(d.kalemler));
      wrap.innerHTML = html;

      // Ek gider kutusunu teklif modülünden yeniden kullan (tek kaynak).
      const spDipGuncelle = () => {
        const at = d.kalemler.reduce((a, x) => a + x.netFiyat * x.miktar, 0);
        const olcu = { m2: +d.ekGiderM2 || 0, m3: (siparisPaketToplami(d.kalemler).m3) || 0, araToplam: at };
        const eg = App.ekGiderToplami(d.ekGiderler || [], olcu);
        const dt = at * (1 - (d.genelIskontoYuzde || 0) / 100) + eg.yansitilanToplam;
        const dtCell = document.getElementById('sp-dip-toplam');
        if (dtCell) dtCell.textContent = App.fmtTL(dt);
      };
      if (PageModules.teklif && PageModules.teklif.ekGiderKutusuAc) {
        PageModules.teklif.ekGiderKutusuAc(document.getElementById('sp-ek-gider'), d, spDipGuncelle);
      }

      document.getElementById('sp-genel-iskonto').onchange = (e) => {
        d.genelIskontoYuzde = parseFloat(e.target.value) || 0;
        spDipGuncelle();
      };

      wrap.querySelectorAll('.sp-fiyat').forEach(inp => inp.onchange = () => {
        const i = parseInt(inp.dataset.i);
        d.kalemler[i].netFiyat = parseFloat(inp.value) || 0;
        updateRow(i);
      });
      wrap.querySelectorAll('.sp-miktar').forEach(inp => inp.onchange = () => {
        const i = parseInt(inp.dataset.i);
        d.kalemler[i].miktar = parseInt(inp.value) || 1;
        updateRow(i);
      });
      wrap.querySelectorAll('.sp-del-kalem').forEach(b => b.onclick = () => {
        d.kalemler.splice(parseInt(b.dataset.i), 1);
        renderKalemTable();
      });

      function updateRow(i) {
        const totalCell = wrap.querySelector(`.sp-toplam[data-i="${i}"]`);
        if (totalCell) totalCell.textContent = App.fmtTL(d.kalemler[i].netFiyat * d.kalemler[i].miktar);
        const at = d.kalemler.reduce((a, x) => a + x.netFiyat * x.miktar, 0);
        const atCell = document.getElementById('sp-ara-toplam');
        if (atCell) atCell.textContent = App.fmtTL(at);
        spDipGuncelle();   // ek gider dahil dip toplam
      }
    }

    document.getElementById('sp-save-draft').onclick = async () => {
      if (!d.kalemler.length) { App.toast('En az bir ürün eklemelisiniz', 'err'); return; }
      const musteri = musteriler.find(m => m.id === d.musteriId);
      const araToplam = d.kalemler.reduce((a, k) => a + k.netFiyat * k.miktar, 0);
      const genelIskontoYuzde = d.genelIskontoYuzde || 0;
      // Ek giderleri dip toplama kat (teklifle aynı mantık).
      const kayitOlcu = { m2: +d.ekGiderM2 || 0, m3: (siparisPaketToplami(d.kalemler).m3) || 0, araToplam };
      const kayitEg = App.ekGiderToplami(d.ekGiderler || [], kayitOlcu);
      const toplam = araToplam * (1 - genelIskontoYuzde / 100) + kayitEg.yansitilanToplam;

      if (duzenlemeModu) {
        const tumSiparisler = await Store.siparisler.all();
        const mevcut = tumSiparisler.find(s => s.id === d.editingId);
        if (!mevcut) { App.toast('Sipariş bulunamadı', 'err'); return; }
        // TAZE veriyle yeniden kontrol: düzenleme ekranı açıkken sipariş
        // başka bir yerden (örn. sevkiyat) sevk edilmiş olabilir (T3-23:
        // kısmen de olsa).
        if (mevcut.durum === 'sevk_edildi' || mevcut.durum === 'kismi_sevk_edildi') {
          App.toast('Bu sipariş düzenleme sırasında sevk edildi — artık kaydedilemez.', 'err');
          return;
        }
        // ── REVİZYON GEÇMİŞİ: neyin değiştiği kayıt altına alınır ──────────
        // "Ben 10 demiştim 12 değil" tartışmasında kimin ne zaman neyi
        // değiştirdiği buradan görülür. Sipariş detayında listelenir.
        const degisiklikler = [];
        if (mevcut.musteriAdi !== (musteri ? musteri.unvan : ''))
          degisiklikler.push(`Müşteri: ${mevcut.musteriAdi || '—'} → ${musteri ? musteri.unvan : '—'}`);
        if (Math.abs((mevcut.toplam || 0) - toplam) > 0.01)
          degisiklikler.push(`Tutar: ${App.fmtTL(mevcut.toplam || 0)} → ${App.fmtTL(toplam)}`);
        const eskiKalemler = mevcut.kalemler || [];
        d.kalemler.forEach(yk => {
          const ek = eskiKalemler.find(x => x.kod === yk.kod && x.grup === yk.grup);
          if (!ek) degisiklikler.push(`Eklendi: ${yk.kod} × ${yk.miktar}`);
          else {
            if (ek.miktar !== yk.miktar) degisiklikler.push(`${yk.kod} miktar: ${ek.miktar} → ${yk.miktar}`);
            if (Math.abs((ek.netFiyat || 0) - (yk.netFiyat || 0)) > 0.01)
              degisiklikler.push(`${yk.kod} fiyat: ${App.fmtTL(ek.netFiyat || 0)} → ${App.fmtTL(yk.netFiyat || 0)}`);
          }
        });
        eskiKalemler.forEach(ek => {
          if (!d.kalemler.some(yk => yk.kod === ek.kod && yk.grup === ek.grup))
            degisiklikler.push(`Çıkarıldı: ${ek.kod} × ${ek.miktar}`);
        });
        if (degisiklikler.length) {
          const revizyonlar = await Store.siparisRevizyonlari.all();
          const oncekiSayi = revizyonlar.filter(r => r.siparisId === mevcut.id).length;
          revizyonlar.push({
            id: App.uid('REV'), siparisId: mevcut.id, siparisKod: mevcut.kod,
            revNo: oncekiSayi + 1,
            tarih: new Date().toISOString().slice(0, 10), zaman: new Date().toISOString(),
            kullanici: (App.state && App.state.kullanici && App.state.kullanici.kullaniciAdi) || 'bilinmiyor',
            oncekiDurum: mevcut.durum, degisiklikler,
            oncekiToplam: mevcut.toplam || 0, yeniToplam: toplam
          });
          await Store.siparisRevizyonlari.save(revizyonlar);
        }

        mevcut.musteriId = d.musteriId; mevcut.musteriAdi = musteri ? musteri.unvan : '';
        mevcut.kalemler = d.kalemler;
        mevcut.ekGiderler = d.ekGiderler || []; mevcut.ekGiderM2 = d.ekGiderM2 || 0;
        mevcut.araToplam = araToplam; mevcut.genelIskontoYuzde = genelIskontoYuzde;
        mevcut.toplam = toplam;
        mevcut.revizyonNo = (mevcut.revizyonNo || 0) + (degisiklikler.length ? 1 : 0);
        // Düzenleme sonrası tekrar onay akışına düşer (önceki onay/red durumu geçersiz kalır)
        mevcut.durum = 'cari_onay_bekliyor';
        mevcut.uretimKuyrugunda = false;
        await App.persist(() => Store.siparisler.upsert(mevcut));
        App.toast('Sipariş güncellendi ve yeniden onaya gönderildi: ' + mevcut.kod, 'ok');
        draft = null;
        detayId = mevcut.id;
        render(main);
        return;
      }

      const siparis = {
        id: App.uid('SIP'),
        kod: 'SIP-' + Date.now().toString(36).toUpperCase(),
        teklifId: null, musteriId: d.musteriId, musteriAdi: musteri ? musteri.unvan : '',
        kalemler: d.kalemler,
        ekGiderler: d.ekGiderler || [], ekGiderM2: d.ekGiderM2 || 0,
        araToplam, genelIskontoYuzde, toplam,
        durum: 'cari_onay_bekliyor',
        uretimTermini: null,
        uretimKuyrugunda: false,
        tarih: new Date().toISOString().slice(0, 10)
      };
      await App.persist(() => Store.siparisler.upsert(siparis));
      App.toast('Sipariş oluşturuldu: ' + siparis.kod, 'ok');
      draft = null;
      detayId = siparis.id;
      render(main);
    };
  }

  function siparisDurumPill(d) {
    const map = {
      cari_onay_bekliyor: ['Cari Onayında', 'pill-amber'],
      onaylandi: ['Onaylandı', 'pill-green'],
      uretimde: ['Üretimde', 'pill-blue'],
      kismi_sevk_edildi: ['Kısmi Sevk Edildi', 'pill-amber'],
      sevk_edildi: ['Sevk Edildi', 'pill-purple'],
      reddedildi: ['Reddedildi', 'pill-red']
    };
    const [l, c] = map[d] || ['Beklemede', 'pill-gray'];
    return `<span class="pill ${c}">${l}</span>`;
  }

  // Maliyeti hesaplanamayan bir kalem eklenmek istendiğinde uyarı + manuel fiyat girişi
  // Kalem Seçici sayfasından bir kalem seçildiğinde miktar sormak için
  function openMiktarGirisi(secim, onMiktarGirildi) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b class="mono">${App.escapeHtml(secim.kod)}</b> — ${App.escapeHtml(secim.ad)}</div>
      <div class="fgroup"><label class="flbl">Miktar</label><input class="finput" id="mg-miktar" type="number" value="1" min="1"></div>
    `;
    const footer = `<button class="btn" id="mg-cancel">Vazgeç</button><button class="btn btn-blue" id="mg-confirm">Sipariş Kalemine Ekle</button>`;
    App.openModal({ title: 'Miktar Girin', body, footer });
    document.getElementById('mg-cancel').onclick = App.closeModal;
    const miktarInput = document.getElementById('mg-miktar');
    miktarInput.focus();
    miktarInput.select();
    document.getElementById('mg-confirm').onclick = () => {
      const miktar = parseInt(miktarInput.value) || 1;
      App.closeModal();
      onMiktarGirildi(miktar);
    };
  }

  function openMaliyetYokUyari(secim, onFiyatGirildi) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="color:var(--red-text);margin-bottom:10px">
        ⚠ <b>${App.escapeHtml(secim.kod)}</b> — ${App.escapeHtml(secim.ad)} için maliyet/fiyat bilgisi bulunamadı
        (hammadde ataması veya referans fiyatı yok). Devam etmek için lütfen bir fiyat girin.
      </div>
      <div class="fgroup"><label class="flbl">Birim Fiyat (₺)</label><input class="finput" id="my-fiyat" type="number" step="0.01" placeholder="0.00"></div>
    `;
    const footer = `<button class="btn" id="my-cancel">Vazgeç</button><button class="btn btn-blue" id="my-confirm">Bu Fiyatla Ekle</button>`;
    App.openModal({ title: 'Maliyet Bulunamadı', body, footer });
    document.getElementById('my-cancel').onclick = App.closeModal;
    document.getElementById('my-confirm').onclick = () => {
      const fiyat = parseFloat(document.getElementById('my-fiyat').value);
      if (!fiyat || fiyat <= 0) { App.toast('Geçerli bir fiyat girin', 'err'); return; }
      App.closeModal();
      onFiyatGirildi(fiyat);
    };
  }

  async function renderDetay(main, s) {
    const revizyonlar = (await Store.siparisRevizyonlari.all()).filter(r => r.siparisId === s.id).sort((a,b) => b.revNo - a.revNo);
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${s.kod}</div><div class="page-sub">${App.escapeHtml(s.musteriAdi)}</div></div>
        <div class="page-acts">
          <button class="btn" id="sp-back">&larr; Listeye Dön</button>
          <button class="btn" id="sp-ceki-listesi">📋 Çeki Listesi</button>
          ${(s.durum !== 'sevk_edildi' && s.durum !== 'kismi_sevk_edildi') ? '<button class="btn btn-amber" id="sp-geri-cek">↺ Geri Çek / Düzenle</button>' : ''}
        </div>
      </div>
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Durum</div><div style="margin-top:4px">${siparisDurumPill(s.durum)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam</div><div class="kpi-val blue">${App.fmtTL(s.toplam)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Üretim Termini</div><div class="kpi-val ${s.uretimTermini ? 'green' : 'amber'}">${s.uretimTermini || 'Belirlenmedi'}</div></div>
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">Sipariş Kalemleri</div></div>
        <table class="dtable"><tr><th>Ürün</th><th>📦 Paket / Ağırlık</th><th class="r">Net Fiyat</th><th class="r">Miktar</th><th class="r">Toplam</th></tr>
          ${s.kalemler.map(k => `<tr><td><b class="mono">${App.escapeHtml(k.kod)}</b> — ${App.escapeHtml(k.ad)}</td>
            <td style="font-size:10.5px">${(() => { const coz = kalemOlcuCozumu(k.kod, k.miktar || 1); const m = coz ? App.olcuOzetMetni(coz) : ''; return m || '<span class="muted">—</span>'; })()}</td>
            <td class="r">${App.fmtTL(k.netFiyat)}</td><td class="r">${k.miktar}</td><td class="r">${App.fmtTL(k.netFiyat * k.miktar)}</td></tr>`).join('')}
        </table>
        ${paketToplamKutusu(siparisPaketToplami(s.kalemler))}
      </div>
      <div class="fhint">${(s.durum !== 'sevk_edildi' && s.durum !== 'kismi_sevk_edildi')
        ? '"Geri Çek / Düzenle" bu siparişin durumunu sıfırlar (taslağa döner), ürün/miktar/fiyat bilgilerini değiştirmenize izin verir ve kaydettiğinizde tekrar cari onayına gönderir. Onaylanmış veya reddedilmiş siparişler için de kullanılabilir.'
        : '⚠ Bu siparişin sevkiyatı başladı (irsaliye/fatura kesildi) — artık düzenlenemez. Değişiklik gerekiyorsa yeni bir sipariş/iade süreci başlatın.'}</div>
    
      ${revizyonlar.length ? App.akordeonHtml([{
        baslik: 'Revizyon Geçmişi — Sipariş Değişiklikleri', ikon: '📝',
        rozet: revizyonlar.length + ' revizyon',
        icerikHtml: '<div style="margin-top:12px">' + revizyonlar.map(r => `
          <div style="border-left:3px solid var(--amber);background:var(--surface2);border-radius:8px;padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:11.5px">
              <b>Rev. ${r.revNo}</b>
              <span class="muted">${(r.zaman || '').replace('T', ' ').slice(0, 16)} · ${App.escapeHtml(r.kullanici || '')}</span>
            </div>
            <div style="font-size:11px;margin-top:6px">
              ${(r.degisiklikler || []).map(d => '• ' + App.escapeHtml(d)).join('<br>')}
            </div>
          </div>`).join('') + '</div>'
      }]) : ''}
    `;
    App.akordeonBagla(main);
    document.getElementById('sp-back').onclick = () => { detayId = null; render(main); };
    // Çeki listesi ekranı teklif modülünde tanımlı — aynı kod iki yerde
    // yazılmasın diye oradan çağırılır. Kendi paket önbelleğini yükler.
    document.getElementById('sp-ceki-listesi').onclick = async () => {
      try {
        await PageModules.teklif.paketVerisiYukle();
        PageModules.teklif.cekiListesiAc({ kod: s.kod, musteriAdi: s.musteriAdi, kalemler: s.kalemler });
      } catch (e) {
        console.error('Çeki listesi:', e);
        App.toast('Çeki listesi açılamadı: ' + e.message, 'err');
      }
    };
    const geriCekBtn = document.getElementById('sp-geri-cek');
    if (geriCekBtn) geriCekBtn.onclick = () => {
      App.confirmDialog('Bu siparişi geri çekip düzenlemek istediğinize emin misiniz? Sipariş "Cari Onayında" durumuna dönecek ve mevcut onay/red durumu geçersiz kalacak.', () => {
        startEditSiparis(main, s);
      });
    };
  }

  return { render };
})();
