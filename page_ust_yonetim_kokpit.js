// ════════════════════════════════════════════════════════════════════════════
// ÜST YÖNETİM KOKPİTİ — tüm sistemden (Sipariş, Stok/3 Ambar, Satınalma,
// Personel, Araç, Makina, Kıdem Tazminatı) tek ekranda 20+ gösterge.
// ════════════════════════════════════════════════════════════════════════════
PageModules.ust_yonetim_kokpit = (() => {

  async function render(main) {
    const [siparisler, satinalmaSiparisleri, ciroHedefleri, stokRaf, hammaddeler, yarimamuller, urunler,
           personeller, araclar, makinalar, aracGiderleri, personelGiderleri, bordrolar, avanslar,
           tedarikciler, musteriler, tahsilatBeklenenler, vadeFarkiKayitlari] = await Promise.all([
      Store.siparisler.all(), Store.satinalmaSiparisleri.all(), Store.ciroHedefleri.all(),
      Store.stokRaf.all(), Store.hammaddeler.all(), Store.yarimamuller.all(), Store.urunler.all(),
      Store.personeller.all(), Store.araclar.all(), Store.makinaTechizat.all(),
      Store.aracGiderleri.all(), Store.personelGiderleri.all(), Store.bordrolar.all(), Store.avanslar.all(),
      Store.tedarikciler.all(), Store.musteriler.all(), Store.tahsilatBeklenenler.all(), Store.vadeFarkiKayitlari.all()
    ]);

    const bugun = new Date().toISOString().slice(0, 10);
    const buAy = new Date().toISOString().slice(0, 7);
    const buYil = new Date().getFullYear().toString();
    const ayarlar = App.state.ayarlar;

    const gercekSiparisler = siparisler.filter(s => ['onaylandi', 'uretimde', 'sevk_edildi'].includes(s.durum));
    const gunlukSiparis = gercekSiparisler.filter(s => s.tarih === bugun).length;
    const aylikSiparis = gercekSiparisler.filter(s => (s.tarih || '').startsWith(buAy)).length;
    const yillikSiparis = gercekSiparisler.filter(s => (s.tarih || '').startsWith(buYil)).length;
    const aylikCiro = gercekSiparisler.filter(s => (s.tarih || '').startsWith(buAy)).reduce((a, s) => a + (s.toplam || 0), 0);

    const hedefKaydi = ciroHedefleri.find(h => h.ay === buAy);
    const hedefYuzde = hedefKaydi && hedefKaydi.hedefTutar > 0 ? (aylikCiro / hedefKaydi.hedefTutar) * 100 : null;

    // Stok değeri (3 ambar toplamı, hammadde+yarımamül+ürün)
    let toplamStokDegeri = 0, hammaddeStokDegeri = 0, yarimamulStokDegeri = 0, mamulStokDegeri = 0;
    stokRaf.forEach(s => {
      if (s.tip === 'hammadde') {
        const hm = hammaddeler.find(h => h.id === s.refId);
        if (hm) { const v = App.toTRY(hm.birimFiyat, hm.dvz, ayarlar) * s.miktar; hammaddeStokDegeri += v; toplamStokDegeri += v; }
      } else if (s.tip === 'yarimamul') {
        const ym = yarimamuller.find(y => y.id === s.refId);
        if (ym && ym.referansFiyat) { const v = App.toTRY(ym.referansFiyat, ym.referansDvz || 'TL', ayarlar) * s.miktar; yarimamulStokDegeri += v; toplamStokDegeri += v; }
      } else if (s.tip === 'urun') {
        const u = urunler.find(x => x.id === s.refId);
        if (u && u.referansFiyat) { const v = App.toTRY(u.referansFiyat, u.referansDvz || 'TL', ayarlar) * s.miktar; mamulStokDegeri += v; toplamStokDegeri += v; }
      }
    });

    // Açık satınalma tutarı (yönetim onayı bekleyen + onaylanmış ama henüz girmemiş)
    const acikSatinalmaTutari = satinalmaSiparisleri.filter(s => !['tamamlandi', 'reddedildi'].includes(s.durum)).reduce((a, s) => a + (s.toplamTRY || 0), 0);

    // Bekleyen sevkiyatlar
    // T4: 's.durum === "uretimde"' KALDIRILDI — siparis.durum bu değeri
    // hiçbir zaman almaz (üretim ilerlemesi ayrı bir alan olan
    // s.uretimDurumu ile takip edilir); ölü kod (her zaman false).
    const bekleyenSevkiyat = siparisler.filter(s => s.durum === 'onaylandi').length;

    // Personel
    const aktifPersonel = personeller.filter(p => p.durum === 'aktif');
    const toplamBrutMaas = aktifPersonel.reduce((a, p) => a + (p.brutMaas || 0), 0);
    const toplamAvans = avanslar.filter(a => !a.mahsupEdildi).reduce((a, x) => a + x.tutar, 0);
    const toplamPersonelGideri = personelGiderleri.reduce((a, g) => a + g.tutar, 0);
    const buAyBordrolar = bordrolar.filter(b => b.ay === buAy);
    const toplamIsverenMaliyeti = buAyBordrolar.reduce((a, b) => a + (b.isverenToplamMaliyet || 0), 0);
    const toplamPersonelMaliyeti = (toplamIsverenMaliyeti || toplamBrutMaas) + toplamPersonelGideri;

    // Araç
    const toplamAracGideri = aracGiderleri.reduce((a, g) => a + g.tutar, 0);

    // Makina/Amortisman
    const toplamMakinaDegeri = makinalar.reduce((a, m) => a + (m.alisFiyati || 0), 0);
    const toplamYillikAmortisman = makinalar.reduce((a, m) => a + (m.alisFiyati / (m.amortismanYili || 10)), 0);

    // Kıdem tazminatı yükü
    const tazminatHesaplari = aktifPersonel.map(p => App.kidemIhbarHesapla(p, null, ayarlar));
    const toplamKidemYuku = tazminatHesaplari.reduce((a, h) => a + h.kidemTazminati, 0);

    // En çok satan ürünler (sipariş kalemlerinden)
    const urunSatisToplam = new Map();
    gercekSiparisler.forEach(s => (s.kalemler || []).forEach(k => {
      if (k.grup !== 'urun') return;
      const mevcut = urunSatisToplam.get(k.kod) || { ad: k.ad, miktar: 0, tutar: 0 };
      mevcut.miktar += k.miktar || 0; mevcut.tutar += (k.netFiyat || 0) * (k.miktar || 0);
      urunSatisToplam.set(k.kod, mevcut);
    }));
    const enCokSatanUrunler = [...urunSatisToplam.entries()].sort((a, b) => b[1].tutar - a[1].tutar).slice(0, 5);

    // En çok satış yapılan müşteriler
    const musteriSatisToplam = new Map();
    gercekSiparisler.forEach(s => {
      const mevcut = musteriSatisToplam.get(s.musteriId) || { ad: s.musteriAdi, tutar: 0 };
      mevcut.tutar += s.toplam || 0;
      musteriSatisToplam.set(s.musteriId, mevcut);
    });
    const enCokMusteriler = [...musteriSatisToplam.entries()].sort((a, b) => b[1].tutar - a[1].tutar).slice(0, 5);

    // En çok alım yapılan tedarikçiler
    const tedarikciAlimToplam = new Map();
    satinalmaSiparisleri.filter(s => s.durum !== 'reddedildi').forEach(s => {
      const mevcut = tedarikciAlimToplam.get(s.tedarikciId) || { ad: s.tedarikciAdi, tutar: 0 };
      mevcut.tutar += s.toplamTRY || 0;
      tedarikciAlimToplam.set(s.tedarikciId, mevcut);
    });
    const enCokTedarikciler = [...tedarikciAlimToplam.entries()].sort((a, b) => b[1].tutar - a[1].tutar).slice(0, 5);

    // Karlılık (basit): Aylık ciro - aylık hammadde alımı - aylık personel/araç/amortisman gideri (aylık pay)
    const aylikSatinalma = satinalmaSiparisleri.filter(s => (s.tarih || '').startsWith(buAy) && s.durum !== 'reddedildi').reduce((a, s) => a + (s.toplamTRY || 0), 0);
    const aylikGiderToplami = aylikSatinalma + (toplamPersonelMaliyeti) + (toplamYillikAmortisman / 12) + (toplamAracGideri / 12);
    const tahminiKarlilik = aylikCiro - aylikGiderToplami;
    const karlilikYuzde = aylikCiro > 0 ? (tahminiKarlilik / aylikCiro) * 100 : 0;

    // Nakit akışı özeti (basit): bu ay tahsilat (ciro) - bu ay ödeme (satınalma+personel+araç)
    const nakitGiris = aylikCiro;
    const nakitCikis = aylikSatinalma + toplamPersonelMaliyeti + (toplamAracGideri / 12);
    const nakitAkisi = nakitGiris - nakitCikis;

    // ── İLERİ TARİHLİ NAKİT ALACAK UYARISI ──────────────────────────────────
    // KULLANICI KARARI: Peşinat/çek/kredi kartı artık sipariş onayında anında
    // işlendiği için onay beklemiyor — SADECE ileri tarihli NAKİT kalemlerin
    // vadesi geldiğinde (veya geçtiğinde) Cari ve Üst Yönetim burada uyarılır.
    const bekleyenNakitler = tahsilatBeklenenler.filter(t => t.durum === 'onay_bekliyor');
    const vadesiGelenNakitler = bekleyenNakitler.filter(t => t.tarih && t.tarih <= bugun);
    const vadesiGelmemisNakitler = bekleyenNakitler.filter(t => t.tarih && t.tarih > bugun);
    const toplamVadesiGelenNakit = vadesiGelenNakitler.reduce((a, t) => a + t.tutar, 0);
    const toplamBekleyenNakit = bekleyenNakitler.reduce((a, t) => a + t.tutar, 0);
    const toplamVadeFarkiGeliri = vadeFarkiKayitlari.reduce((a, v) => a + v.vadeFarki, 0);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Üst Yönetim Kokpiti</div><div class="page-sub">Tüm sistemden tek ekranda özet — sipariş, stok, satınalma, personel, araç, makina, tazminat</div></div>
      </div>

      ${vadesiGelenNakitler.length ? `
      <div class="card" style="border:1.5px solid var(--red-text);background:var(--red-bg);margin-bottom:14px">
        <div class="card-hdr"><div class="card-title" style="color:var(--red-text)">⚠ Vadesi Gelen İleri Tarihli Nakit Alacaklar — ${vadesiGelenNakitler.length} Kalem</div></div>
        <div class="fhint" style="margin-bottom:8px">Bu kalemlerin vadesi geldi (veya geçti) ama henüz tahsilatı onaylanmadı. Cari İşlemler tahsilatı kontrol edip Muhasebe Panel → Tahsilatlar'dan onaylamalıdır.</div>
        <table class="dtable"><tr><th>Müşteri</th><th>Vade Tarihi</th><th class="r">Tutar</th></tr>
          ${vadesiGelenNakitler.map(t => `<tr><td>${App.escapeHtml(t.musteriAdi || '—')}</td><td style="font-size:11px">${t.tarih}</td><td class="r"><b style="color:var(--red-text)">${App.fmtTL(t.tutar)}</b></td></tr>`).join('')}
        </table>
      </div>` : ''}

      ${App.akordeonHtml([
        { baslik: 'Sipariş & Ciro', ikon: '📈', acik: true, icerikHtml: `
          <div class="grid grid-4" style="margin:14px 0 6px">
            <div class="kpi"><div class="kpi-lbl">Günlük Sipariş</div><div class="kpi-val blue">${gunlukSiparis}</div></div>
            <div class="kpi"><div class="kpi-lbl">Aylık Sipariş</div><div class="kpi-val blue">${aylikSiparis}</div></div>
            <div class="kpi"><div class="kpi-lbl">Yıllık Sipariş</div><div class="kpi-val blue">${yillikSiparis}</div></div>
            <div class="kpi"><div class="kpi-lbl">Aylık Ciro</div><div class="kpi-val green">${App.fmtTL(aylikCiro)}</div></div>
          </div>
          <div class="grid grid-4">
            <div class="kpi"><div class="kpi-lbl">Hedef Gerçekleşme</div><div class="kpi-val ${hedefYuzde === null ? 'gray' : hedefYuzde >= 100 ? 'green' : hedefYuzde >= 70 ? 'amber' : 'red'}">${hedefYuzde === null ? 'Hedef Yok' : App.fmtPct(hedefYuzde)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Bekleyen Sevkiyat</div><div class="kpi-val amber">${bekleyenSevkiyat}</div></div>
            <div class="kpi"><div class="kpi-lbl">Tahmini Aylık Kârlılık</div><div class="kpi-val ${karlilikYuzde >= 0 ? 'green' : 'red'}">${App.fmtPct(karlilikYuzde)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Nakit Akışı (Bu Ay)</div><div class="kpi-val ${nakitAkisi >= 0 ? 'green' : 'red'}">${App.fmtTL(nakitAkisi)}</div></div>
          </div>` },
        { baslik: 'İleri Tarihli Nakit Alacaklar & Vade Farkı Geliri', ikon: '💵', rozet: bekleyenNakitler.length ? bekleyenNakitler.length + ' kalem' : '', icerikHtml: `
          <div class="grid grid-3" style="margin-top:14px">
            <div class="kpi"><div class="kpi-lbl">Bekleyen Toplam İleri Tarihli Nakit</div><div class="kpi-val ${toplamBekleyenNakit > 0 ? 'amber' : 'gray'}">${App.fmtTL(toplamBekleyenNakit)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Vadesi Gelen (Onay Bekleyen)</div><div class="kpi-val ${toplamVadesiGelenNakit > 0 ? 'red' : 'gray'}">${App.fmtTL(toplamVadesiGelenNakit)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Toplam Vade Farkı Geliri (Çek/Kredi Kartı)</div><div class="kpi-val green">${App.fmtTL(toplamVadeFarkiGeliri)}</div></div>
          </div>` },
        { baslik: 'Stok & Satınalma', ikon: '📦', icerikHtml: `
          <div class="grid grid-4" style="margin-top:14px">
            <div class="kpi"><div class="kpi-lbl">Toplam Stok Değeri</div><div class="kpi-val purple">${App.fmtTL(toplamStokDegeri)}</div>
              <div class="kpi-sub">HM: ${App.fmtTL(hammaddeStokDegeri)} · YM: ${App.fmtTL(yarimamulStokDegeri)} · Mamul: ${App.fmtTL(mamulStokDegeri)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Açık Satınalma Tutarı</div><div class="kpi-val amber">${App.fmtTL(acikSatinalmaTutari)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Tedarikçi Sayısı</div><div class="kpi-val blue">${tedarikciler.length}</div></div>
            <div class="kpi"><div class="kpi-lbl">Müşteri Sayısı</div><div class="kpi-val blue">${musteriler.length}</div></div>
          </div>` },
        { baslik: 'Personel & Araç & Makina', ikon: '👥', icerikHtml: `
          <div class="grid grid-4" style="margin-top:14px">
            <div class="kpi"><div class="kpi-lbl">Toplam Personel Sayısı</div><div class="kpi-val blue">${aktifPersonel.length}</div></div>
            <div class="kpi"><div class="kpi-lbl">Toplam Personel Maliyeti</div><div class="kpi-val amber">${App.fmtTL(toplamPersonelMaliyeti)}</div>
              <div class="kpi-sub">Avans bekleyen: ${App.fmtTL(toplamAvans)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Toplam Araç Maliyeti</div><div class="kpi-val amber">${App.fmtTL(toplamAracGideri)}</div>
              <div class="kpi-sub">${araclar.length} araç</div></div>
            <div class="kpi"><div class="kpi-lbl">Toplam Makina Maliyeti</div><div class="kpi-val purple">${App.fmtTL(toplamMakinaDegeri)}</div>
              <div class="kpi-sub">${makinalar.length} makina/teçhizat</div></div>
          </div>` },
        { baslik: 'Amortisman & Tazminat Yükü', ikon: '🏦', icerikHtml: `
          <div class="grid grid-2" style="margin-top:14px">
            <div class="kpi"><div class="kpi-lbl">Toplam Yıllık Amortisman</div><div class="kpi-val amber">${App.fmtTL(toplamYillikAmortisman)}</div></div>
            <div class="kpi"><div class="kpi-lbl">Toplam Kıdem Tazminatı Yükü</div><div class="kpi-val red">${App.fmtTL(toplamKidemYuku)}</div></div>
          </div>` },
        { baslik: 'En Çok Satan / Müşteri / Tedarikçi', ikon: '🏆', icerikHtml: `
          <div class="grid grid-3" style="margin-top:14px">
            <div>
              <div class="flbl" style="margin-bottom:6px">En Çok Satan Ürünler</div>
              ${enCokSatanUrunler.length ? `<table class="dtable" style="font-size:11px"><tr><th>Ürün</th><th class="r">Tutar</th></tr>
                ${enCokSatanUrunler.map(([kod, v]) => `<tr><td>${App.escapeHtml(v.ad)}</td><td class="r">${App.fmtTL(v.tutar)}</td></tr>`).join('')}
              </table>` : '<div class="empty-state" style="padding:14px 8px"><div class="edesc">Veri yok</div></div>'}
            </div>
            <div>
              <div class="flbl" style="margin-bottom:6px">En Çok Satış Yapılan Müşteriler</div>
              ${enCokMusteriler.length ? `<table class="dtable" style="font-size:11px"><tr><th>Müşteri</th><th class="r">Tutar</th></tr>
                ${enCokMusteriler.map(([id, v]) => `<tr><td>${App.escapeHtml(v.ad || '—')}</td><td class="r">${App.fmtTL(v.tutar)}</td></tr>`).join('')}
              </table>` : '<div class="empty-state" style="padding:14px 8px"><div class="edesc">Veri yok</div></div>'}
            </div>
            <div>
              <div class="flbl" style="margin-bottom:6px">En Çok Alım Yapılan Tedarikçiler</div>
              ${enCokTedarikciler.length ? `<table class="dtable" style="font-size:11px"><tr><th>Tedarikçi</th><th class="r">Tutar</th></tr>
                ${enCokTedarikciler.map(([id, v]) => `<tr><td>${App.escapeHtml(v.ad || '—')}</td><td class="r">${App.fmtTL(v.tutar)}</td></tr>`).join('')}
              </table>` : '<div class="empty-state" style="padding:14px 8px"><div class="edesc">Veri yok</div></div>'}
            </div>
          </div>` }
      ])}

      <div class="fhint" style="margin-top:14px">⚠ Kârlılık ve nakit akışı göstergeleri basitleştirilmiş tahminlerdir (gerçek muhasebe defterlerine değil, sistemdeki sipariş/satınalma/personel kayıtlarına dayanır). Kesin mali tablo için mali müşavirinize danışın.</div>
    `;

    App.akordeonBagla(main);
  }

  return { render };
})();
