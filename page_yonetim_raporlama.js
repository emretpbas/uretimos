// ════════════════════════════════════════════════════════════════════════════
// YÖNETİM RAPORLAMA — günlük/aylık/yıllık sipariş ve ciro özetleri, aylık ciro
// hedefi karşılaştırması, satışa karşılık hammadde alım tutarı.
// ════════════════════════════════════════════════════════════════════════════
PageModules.yonetim_raporlama = (() => {
  let seciliAy = new Date().toISOString().slice(0, 7);

  // Son 90 günde hiç stok hareketi olmayan kalemleri "ölü stok" sayar (basit
  // yaklaşım — gerçek devir hızı hesabı için maliyet muhasebesi/COGS verisi
  // gerekir, burada mevcut hareket geçmişine bakılır).
  function stokAnaliziHesapla(stokRaf, stokHareketleri, hammaddeler, yarimamuller, urunler, ayarlar) {
    const doksanGunOnce = new Date(Date.now() - 90 * 86400000);
    const sonHareketTarihi = new Map(); // kalemAdi -> en son hareket tarihi
    stokHareketleri.forEach(h => {
      const mevcut = sonHareketTarihi.get(h.kalemAdi);
      if (!mevcut || h.tarih > mevcut) sonHareketTarihi.set(h.kalemAdi, h.tarih);
    });

    let oluStokSayisi = 0, oluStokDegeri = 0, hareketliSayisi = 0;
    const oluStokListesi = [];
    stokRaf.filter(s => s.miktar > 0).forEach(s => {
      const sonHareket = sonHareketTarihi.get(s.refAd);
      const hareketsizMi = !sonHareket || new Date(sonHareket) < doksanGunOnce;
      let birimDeger = 0;
      if (s.tip === 'hammadde') { const hm = hammaddeler.find(h => h.id === s.refId); if (hm) birimDeger = App.toTRY(hm.birimFiyat, hm.dvz, ayarlar); }
      else if (s.tip === 'yarimamul') { const ym = yarimamuller.find(y => y.id === s.refId); if (ym && ym.referansFiyat) birimDeger = App.toTRY(ym.referansFiyat, ym.referansDvz || 'TL', ayarlar); }
      else if (s.tip === 'urun') { const u = urunler.find(x => x.id === s.refId); if (u && u.referansFiyat) birimDeger = App.toTRY(u.referansFiyat, u.referansDvz || 'TL', ayarlar); }

      if (hareketsizMi) {
        oluStokSayisi++;
        oluStokDegeri += birimDeger * s.miktar;
        oluStokListesi.push({ ad: s.refAd, miktar: s.miktar, birim: s.birim, deger: birimDeger * s.miktar, sonHareket: sonHareket || 'Hiç hareket yok' });
      } else {
        hareketliSayisi++;
      }
    });
    const toplamKalemSayisi = oluStokSayisi + hareketliSayisi;
    const devirHiziGostergesi = toplamKalemSayisi > 0 ? (hareketliSayisi / toplamKalemSayisi) * 100 : 0;
    return { oluStokSayisi, oluStokDegeri, hareketliSayisi, devirHiziGostergesi, oluStokListesi: oluStokListesi.sort((a, b) => b.deger - a.deger).slice(0, 10) };
  }

  async function render(main) {
    const [siparisler, satinalmaSiparisleri, ciroHedefleri, stokRaf, stokHareketleri, hammaddeler, yarimamuller, urunler, duzeltmeGiderleri] = await Promise.all([
      Store.siparisler.all(), Store.satinalmaSiparisleri.all(), Store.ciroHedefleri.all(),
      Store.stokRaf.all(), Store.stokHareketleri.all(), Store.hammaddeler.all(), Store.yarimamuller.all(), Store.urunler.all(), Store.duzeltmeGiderleri.all()
    ]);
    const ayarlar = App.state.ayarlar;
    const stokAnalizi = stokAnaliziHesapla(stokRaf, stokHareketleri, hammaddeler, yarimamuller, urunler, ayarlar);

    const gercekSiparisler = siparisler.filter(s => ['onaylandi', 'uretimde', 'sevk_edildi'].includes(s.durum));

    const bugun = new Date().toISOString().slice(0, 10);
    const buAy = new Date().toISOString().slice(0, 7);
    const buYil = new Date().getFullYear().toString();

    const gunlukCiro = gercekSiparisler.filter(s => s.tarih === bugun).reduce((a, s) => a + (s.toplam || 0), 0);
    const aylikCiro = gercekSiparisler.filter(s => (s.tarih || '').startsWith(buAy)).reduce((a, s) => a + (s.toplam || 0), 0);
    const yillikCiro = gercekSiparisler.filter(s => (s.tarih || '').startsWith(buYil)).reduce((a, s) => a + (s.toplam || 0), 0);

    const gunlukSiparisSayisi = gercekSiparisler.filter(s => s.tarih === bugun).length;
    const aylikSiparisSayisi = gercekSiparisler.filter(s => (s.tarih || '').startsWith(buAy)).length;
    const yillikSiparisSayisi = gercekSiparisler.filter(s => (s.tarih || '').startsWith(buYil)).length;

    const hedefKaydi = ciroHedefleri.find(h => h.ay === seciliAy);
    const hedefTutar = hedefKaydi ? hedefKaydi.hedefTutar : 0;
    const seciliAyCiro = gercekSiparisler.filter(s => (s.tarih || '').startsWith(seciliAy)).reduce((a, s) => a + (s.toplam || 0), 0);
    const hedefYuzde = hedefTutar > 0 ? (seciliAyCiro / hedefTutar) * 100 : 0;

    const gercekSatinalmalar = satinalmaSiparisleri.filter(s => ['onaylandi', 'gonderildi', 'tamamlandi'].includes(s.durum));
    const seciliAySatinalma = gercekSatinalmalar.filter(s => (s.tarih || '').startsWith(seciliAy)).reduce((a, s) => a + (s.toplamTRY || 0), 0);
    const hammaddeOraniYuzde = seciliAyCiro > 0 ? (seciliAySatinalma / seciliAyCiro) * 100 : 0;

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Yönetim Raporlama</div>
          <div class="page-sub">Günlük/aylık/yıllık sipariş ve ciro özeti, hedef karşılaştırması, hammadde alım oranı</div>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Bugün</div><div class="kpi-val blue">${App.fmtTL(gunlukCiro)}</div><div class="kpi-sub">${gunlukSiparisSayisi} sipariş</div></div>
        <div class="kpi"><div class="kpi-lbl">Bu Ay</div><div class="kpi-val purple">${App.fmtTL(aylikCiro)}</div><div class="kpi-sub">${aylikSiparisSayisi} sipariş</div></div>
        <div class="kpi"><div class="kpi-lbl">Bu Yıl</div><div class="kpi-val green">${App.fmtTL(yillikCiro)}</div><div class="kpi-sub">${yillikSiparisSayisi} sipariş</div></div>
      </div>

      ${App.akordeonHtml([
        { baslik: 'Aylık Ciro Hedefi Karşılaştırması', ikon: '🎯', acik: true, icerikHtml: `
          <div class="frow" style="margin-bottom:14px;margin-top:14px">
            <div class="fgroup"><label class="flbl">Ay Seçin</label><input class="finput" id="yr-ay-secim" type="month" value="${seciliAy}"></div>
            <div class="fgroup"><label class="flbl">Hedef Ciro (₺)</label><input class="finput" id="yr-hedef-tutar" type="number" step="1000" value="${hedefTutar || ''}" placeholder="Hedef girin"></div>
            <div class="fgroup" style="align-self:flex-end"><button class="btn btn-blue" id="yr-hedef-kaydet">Hedefi Kaydet</button></div>
          </div>
          <div class="grid grid-3">
            <div class="kpi"><div class="kpi-lbl">${seciliAy} Gerçekleşen Ciro</div><div class="kpi-val blue">${App.fmtTL(seciliAyCiro)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Hedef</div><div class="kpi-val purple">${hedefTutar ? App.fmtTL(hedefTutar) : 'Belirlenmedi'}</div></div>
            <div class="kpi"><div class="kpi-lbl">Hedefin Tuttuğu Oran</div><div class="kpi-val ${hedefYuzde >= 100 ? 'green' : hedefYuzde >= 70 ? 'amber' : 'red'}">${hedefTutar ? App.fmtPct(hedefYuzde) : '—'}</div></div>
          </div>
          ${hedefTutar ? `<div style="margin-top:14px;background:var(--bg);border-radius:8px;height:24px;overflow:hidden">
            <div style="height:100%;width:${Math.min(hedefYuzde, 100)}%;background:${hedefYuzde >= 100 ? 'var(--green)' : hedefYuzde >= 70 ? 'var(--amber)' : 'var(--red)'};transition:width .3s"></div>
          </div>` : ''}` },
        { baslik: `Satışa Karşılık Hammadde Alımı (${seciliAy})`, ikon: '📦', icerikHtml: `
          <div class="grid grid-3" style="margin-top:14px">
            <div class="kpi"><div class="kpi-lbl">Satış Cirosu</div><div class="kpi-val blue">${App.fmtTL(seciliAyCiro)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Hammadde Alımı</div><div class="kpi-val amber">${App.fmtTL(seciliAySatinalma)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Hammadde / Satış Oranı</div><div class="kpi-val ${hammaddeOraniYuzde > 60 ? 'red' : hammaddeOraniYuzde > 40 ? 'amber' : 'green'}">${App.fmtPct(hammaddeOraniYuzde)}</div></div>
          </div>
          <div class="fhint" style="margin-top:10px">Bu oran, satılan ürünlerin ne kadarının hammadde maliyetine gittiğini gösterir — işçilik, genel gider ve kâr bu hesaba dahil değildir, sadece satınalma siparişi tutarlarına bakar.</div>` },
        { baslik: 'Stok Analizleri (Son 90 Gün Hareket Bazlı)', ikon: '📊', icerikHtml: `
          <div class="grid grid-3" style="margin-bottom:10px;margin-top:14px">
            <div class="kpi"><div class="kpi-lbl">Devir Hızı Göstergesi</div><div class="kpi-val ${stokAnalizi.devirHiziGostergesi >= 60 ? 'green' : stokAnalizi.devirHiziGostergesi >= 30 ? 'amber' : 'red'}">${App.fmtPct(stokAnalizi.devirHiziGostergesi)}</div>
              <div class="kpi-sub">Son 90 günde hareketli kalem oranı</div></div>
            <div class="kpi"><div class="kpi-lbl">Ölü Stok Kalemi</div><div class="kpi-val red">${stokAnalizi.oluStokSayisi}</div></div>
            <div class="kpi"><div class="kpi-lbl">Ölü Stok Değeri</div><div class="kpi-val red">${App.fmtTL(stokAnalizi.oluStokDegeri)}</div></div>
          </div>
          <div class="fhint" style="margin-bottom:10px">"Ölü stok" = son 90 günde hiç stok hareketi (giriş/çıkış) olmamış kalemler. Bu basitleştirilmiş bir göstergedir, gerçek devir hızı hesabı maliyet muhasebesi verisine dayanmalıdır.</div>
          ${stokAnalizi.oluStokListesi.length ? `<table class="dtable" style="font-size:11px"><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Değer</th><th>Son Hareket</th></tr>
            ${stokAnalizi.oluStokListesi.map(o => `<tr><td>${App.escapeHtml(o.ad || '—')}</td><td class="r">${App.fmt(o.miktar, 0)} ${o.birim || ''}</td><td class="r">${App.fmtTL(o.deger)}</td><td style="font-size:10.5px">${o.sonHareket}</td></tr>`).join('')}
          </table>` : '<div class="empty-state" style="padding:14px 8px"><div class="edesc">Ölü stok kalemi bulunamadı.</div></div>'}` },
        { baslik: 'Kalite Düzeltme Giderleri', ikon: '🔧', rozet: duzeltmeGiderleri.length ? duzeltmeGiderleri.length + ' kayıt' : '', icerikHtml: (() => {
          if (!duzeltmeGiderleri.length) return '<div class="empty-state" style="padding:14px 8px;margin-top:14px"><div class="edesc">Henüz düzeltme gideri kaydı yok. Kaliteden üretime dönen siparişlerin düzeltme maliyetleri (malzeme + işçilik) burada listelenir.</div></div>';
          const toplamGider = duzeltmeGiderleri.reduce((a, g) => a + (g.toplamMaliyet || 0), 0);
          const SONUC_ETIKET = { duzeltildi: ['Düzeltildi', 'pill-green'], '2_kalite': ['2. Kalite', 'pill-amber'], defolu: ['Defolu', 'pill-red'] };
          return `
          <div class="grid grid-3" style="margin:14px 0 10px">
            <div class="kpi"><div class="kpi-lbl">Toplam Düzeltme Gideri</div><div class="kpi-val red">${App.fmtTL(toplamGider)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Düzeltme Kaydı</div><div class="kpi-val amber">${duzeltmeGiderleri.length}</div></div>
            <div class="kpi"><div class="kpi-lbl">Ortalama Gider / Kayıt</div><div class="kpi-val purple">${App.fmtTL(toplamGider / duzeltmeGiderleri.length)}</div></div>
          </div>
          <table class="dtable" style="font-size:11px">
            <tr><th>Tarih</th><th>Sipariş</th><th>Müşteri</th><th>NCR</th><th>Sonuç</th><th>Sorunlu YM</th><th class="r">Malzeme</th><th class="r">İşçilik</th><th class="r">Toplam</th></tr>
            ${duzeltmeGiderleri.slice().reverse().map(g => {
              const [sl, sc] = SONUC_ETIKET[g.sonuc] || [g.sonuc, 'pill-gray'];
              return `<tr><td style="font-size:10.5px">${g.tarih}</td><td class="mono">${App.escapeHtml(g.siparisKod || '—')}</td>
                <td style="font-size:11px">${App.escapeHtml(g.musteriAdi || '—')}</td>
                <td class="mono" style="font-size:10.5px">${App.escapeHtml(g.ncrNo || '—')}</td>
                <td><span class="pill ${sc}" style="font-size:9.5px">${sl}</span></td>
                <td style="font-size:10.5px">${App.escapeHtml(g.yarimamulKod || '—')}</td>
                <td class="r">${App.fmtTL(g.malzemeMaliyet || 0)} <span class="muted" style="font-size:9px">(${(g.malzemeler || []).length})</span></td>
                <td class="r">${App.fmtTL(g.iscilikMaliyet || 0)} <span class="muted" style="font-size:9px">${g.iscilikDk || 0}dk</span></td>
                <td class="r"><b style="color:var(--red-text)">${App.fmtTL(g.toplamMaliyet || 0)}</b></td></tr>`;
            }).join('')}
          </table>`;
        })() },
        { baslik: 'Son 12 Ay Ciro Trendi', ikon: '📈', icerikHtml: `<div id="yr-trend-table" style="margin-top:14px"></div>` }
      ])}
    `;

    App.akordeonBagla(main);

    document.getElementById('yr-ay-secim').onchange = (e) => { seciliAy = e.target.value; render(main); };
    document.getElementById('yr-hedef-kaydet').onclick = async () => {
      const tutar = parseFloat(document.getElementById('yr-hedef-tutar').value) || 0;
      const guncelHedefler = await Store.ciroHedefleri.all();
      let kayit = guncelHedefler.find(h => h.ay === seciliAy);
      if (kayit) kayit.hedefTutar = tutar;
      else { kayit = { id: App.uid('CHD'), ay: seciliAy, hedefTutar: tutar }; guncelHedefler.push(kayit); }
      await App.persist(() => Store.ciroHedefleri.save(guncelHedefler));
      App.toast('Ciro hedefi kaydedildi: ' + seciliAy, 'ok');
      render(main);
    };

    renderTrendTable(gercekSiparisler);
  }

  function renderTrendTable(gercekSiparisler) {
    const wrap = document.getElementById('yr-trend-table');
    const aylar = [];
    const simdi = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(simdi.getFullYear(), simdi.getMonth() - i, 1);
      aylar.push(d.toISOString().slice(0, 7));
    }
    let html = `<table class="dtable"><tr><th>Ay</th><th class="r">Sipariş Sayısı</th><th class="r">Ciro</th></tr>`;
    aylar.forEach(ay => {
      const ayinSiparisleri = gercekSiparisler.filter(s => (s.tarih || '').startsWith(ay));
      const ayinCirosu = ayinSiparisleri.reduce((a, s) => a + (s.toplam || 0), 0);
      html += `<tr><td class="mono">${ay}</td><td class="r">${ayinSiparisleri.length}</td><td class="r"><b>${App.fmtTL(ayinCirosu)}</b></td></tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
  }

  return { render };
})();
