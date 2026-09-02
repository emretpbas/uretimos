// ════════════════════════════════════════════════════════════════════════════
// HAMMADDE FİYAT ANOMALİLERİ — kur sapması + piyasa (internet) araması
// ────────────────────────────────────────────────────────────────────────────
// İki bağımsız tarama:
//   1) 🇹🇷 Kur Karşılaştırması — TCMB'nin ücretsiz kur servisinden güncel
//      USD/EUR-TRY alınır, döviz cinsinden fiyatlı hammaddeler Sistem
//      Ayarları'ndaki (muhtemelen eski) kurla karşılaştırılır. Anahtarsız.
//   2) 🌐 Piyasa Araması — Google Custom Search ile her hammaddenin adı
//      internette aranır, bulunan fiyatla karşılaştırılır. Google API
//      anahtarı + arama motoru (cx) gerektirir; yapılandırılmamışsa dürüst
//      bir "yapılandırma eksik" mesajı gösterilir. Kota gereği tek seferde
//      en fazla 20 hammadde taranır — "Sonraki 20" ile devam edilir.
//
// Hiçbir kart OTOMATİK güncellenmez — her anomali satırında "Kartı Güncelle"
// butonu var, kullanıcı kaynağı/sapmayı görüp ONAYLADIKTAN sonra hammadde
// kartının birimFiyat'ı (TL olarak) güncellenir.
// ════════════════════════════════════════════════════════════════════════════
PageModules.hammadde_piyasa = (() => {
  const ROLLER = ['admin', 'arge', 'satinalma', 'yonetim'];

  let anomaliler = [];      // {hammaddeId,stokKodu,ad,tur,sistemFiyatTL,guncelFiyatTL,sapmaYuzde,aciklama,kaynak,dvz?}
  let taranmisIdler = new Set(); // piyasa aramasında zaten taranan hammadde id'leri (bu oturumda)
  let sonKurBilgisi = null; // {usdTry,eurTry,tarih}

  async function render(main) {
    const rol = App.aktifRol();
    if (!ROLLER.includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE, Satınalma ve Yönetim tarafından kullanılır.</div></div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="page-hdr"><div>
        <div class="page-title">📈 Hammadde Fiyat Anomalileri</div>
        <div class="page-sub">Sistemdeki hammadde fiyatlarını kur ve internet piyasa fiyatlarıyla karşılaştırır</div>
      </div></div>

      <div class="card" style="margin-bottom:12px">
        <div class="fhint" style="margin-bottom:10px">
          <b>Hiçbir kart otomatik değişmez.</b> Her satırda kaynağı/sapmayı görüp <b>siz onaylarsınız</b>;
          onaylarsanız hammadde kartının birim fiyatı TL olarak güncellenir.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-blue" id="hp-kur-tara">🇹🇷 Kur Karşılaştırması Çalıştır (Ücretsiz)</button>
          <button class="btn" id="hp-piyasa-tara">🌐 Piyasa Araması Çalıştır (Sonraki 20)</button>
        </div>
        <div id="hp-durum" style="margin-top:10px;font-size:12px"></div>
      </div>

      <div id="hp-sonuc"></div>`;

    document.getElementById('hp-kur-tara').onclick = () => kurTara(main);
    document.getElementById('hp-piyasa-tara').onclick = () => piyasaTara(main);
    sonucCiz(main);
  }

  async function kurTara(main) {
    const durum = document.getElementById('hp-durum');
    durum.innerHTML = '<span class="muted">TCMB güncel kuru alınıyor…</span>';
    try {
      const cevap = await Store.hammaddeKurKarsilastir();
      sonKurBilgisi = cevap.kurlar;
      birlestirVeEkle(cevap.anomaliler);
      durum.innerHTML = `<span style="color:var(--green-text)">✓ TCMB ${App.escapeHtml(sonKurBilgisi.tarih || '')} kuru: 1 USD = ${App.fmt(sonKurBilgisi.usdTry, 4)} TL,
        1 EUR = ${App.fmt(sonKurBilgisi.eurTry, 4)} TL — ${cevap.anomaliler.length} kur sapması bulundu.</span>`;
      sonucCiz(main);
    } catch (err) {
      durum.innerHTML = `<span style="color:var(--red-text)">✕ ${App.escapeHtml(err.message || String(err))}</span>`;
    }
  }

  async function piyasaTara(main) {
    const durum = document.getElementById('hp-durum');
    durum.innerHTML = '<span class="muted">Hammadde listesi alınıyor…</span>';
    try {
      const hammaddeler = await Store.hammaddeler.all();
      const kalanlar = hammaddeler.filter(h => !taranmisIdler.has(h.id));
      if (!kalanlar.length) {
        durum.innerHTML = '<span class="muted">Taranacak yeni hammadde kalmadı — tüm liste tarandı.</span>';
        return;
      }
      const parti = kalanlar.slice(0, 20);
      durum.innerHTML = `<span class="muted">${parti.length} hammadde için piyasa fiyatı aranıyor, birkaç saniye sürebilir…</span>`;
      const cevap = await Store.hammaddePiyasaArama(parti.map(h => h.id));
      parti.forEach(h => taranmisIdler.add(h.id));
      birlestirVeEkle(cevap.anomaliler);
      const kalanSayi = kalanlar.length - parti.length;
      durum.innerHTML = `<span style="color:var(--green-text)">✓ ${cevap.taranan} hammadde tarandı, ${cevap.anomaliler.length} piyasa sapması bulundu.</span>
        ${kalanSayi > 0 ? `<br><span class="muted">${kalanSayi} hammadde daha taranmadı — "Sonraki 20" ile devam edin.</span>` : ''}
        ${(cevap.hatalar || []).length ? `<br><span style="color:var(--red-text)">${cevap.hatalar.length} kalemde arama hatası oluştu.</span>` : ''}`;
      sonucCiz(main);
    } catch (err) {
      if (err.yapilandirmaEksik) {
        durum.innerHTML = `<span style="color:var(--red-text)">✕ ${App.escapeHtml(err.message)}</span>`;
      } else {
        durum.innerHTML = `<span style="color:var(--red-text)">✕ ${App.escapeHtml(err.message || String(err))}</span>`;
      }
    }
  }

  // Yeni bulunan anomalileri mevcut listeyle birleştirir — aynı hammadde +
  // aynı tür (kur/piyasa) için eski satırın yerine yenisi geçer.
  function birlestirVeEkle(yeniler) {
    (yeniler || []).forEach(y => {
      const idx = anomaliler.findIndex(a => a.hammaddeId === y.hammaddeId && a.tur === y.tur);
      if (idx >= 0) anomaliler[idx] = y; else anomaliler.push(y);
    });
  }

  function sonucCiz(main) {
    const el = document.getElementById('hp-sonuc');
    if (!anomaliler.length) {
      el.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="etitle">Henüz tarama yapılmadı</div>
        <div class="edesc">Yukarıdaki butonlardan birine tıklayıp taramayı başlatın.</div></div></div>`;
      return;
    }
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Bulunan Anomaliler (${anomaliler.length})</div></div>
      <div style="overflow-x:auto">
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Stok Kodu</th><th>Ad</th><th>Tür</th><th class="r">Sistem (TL)</th><th class="r">Güncel/Piyasa (TL)</th>
            <th class="r">Sapma</th><th>Açıklama</th><th></th><th></th></tr>
          ${anomaliler.map((a, i) => `<tr>
            <td class="mono">${App.escapeHtml(a.stokKodu || '')}</td>
            <td>${App.escapeHtml(a.ad || '')}</td>
            <td><span class="pill ${a.tur === 'kur_sapmasi' ? 'pill-blue' : 'pill-amber'}" style="font-size:9px">${a.tur === 'kur_sapmasi' ? '🇹🇷 Kur' : '🌐 Piyasa'}</span></td>
            <td class="r">${App.fmtTL(a.sistemFiyatTL)}</td>
            <td class="r"><b>${App.fmtTL(a.guncelFiyatTL)}</b></td>
            <td class="r"><span class="pill ${Math.abs(a.sapmaYuzde) >= 25 ? 'pill-red' : 'pill-amber'}" style="font-size:9px">${a.sapmaYuzde > 0 ? '+' : ''}${a.sapmaYuzde}%</span></td>
            <td style="max-width:260px;font-size:10.5px;color:var(--text3)">${App.escapeHtml(a.aciklama || '')}</td>
            <td>${a.kaynak ? `<a href="${App.escapeHtml(a.kaynak)}" target="_blank" rel="noopener" style="font-size:10.5px">Kaynak ↗</a>` : ''}</td>
            <td><button class="btn btn-sm btn-green" id="hp-guncelle-${i}">✓ Kartı Güncelle</button></td>
          </tr>`).join('')}
        </table>
      </div></div>`;

    anomaliler.forEach((a, i) => {
      const btn = document.getElementById('hp-guncelle-' + i);
      if (btn) btn.onclick = () => kartiGuncelle(a, i, main);
    });
  }

  async function kartiGuncelle(anomali, index, main) {
    App.confirmDialog(
      `"${anomali.ad}" (${anomali.stokKodu}) kartının birim fiyatı ${App.fmtTL(anomali.sistemFiyatTL)} yerine ` +
      `${App.fmtTL(anomali.guncelFiyatTL)} olarak TL üzerinden kaydedilecek. ` +
      (anomali.tur === 'piyasa_sapmasi' ? 'Bu fiyat internet aramasından TAHMİNİ olarak çıkarıldı — devam etmeden önce kaynağı kontrol ettiğinizden emin olun. ' : '') +
      'Onaylıyor musunuz?',
      async () => {
        try {
          const hammaddeler = await Store.hammaddeler.all();
          const kayit = hammaddeler.find(h => h.id === anomali.hammaddeId);
          if (!kayit) { App.toast('Hammadde kartı bulunamadı — silinmiş olabilir.', 'err'); return; }
          kayit.birimFiyat = anomali.guncelFiyatTL;
          kayit.dvz = 'TL';
          await App.persist(() => Store.hammaddeler.save(hammaddeler));
          anomaliler.splice(index, 1);
          App.toast('Kart güncellendi: ' + (kayit.stokKodu || kayit.ad), 'ok');
          sonucCiz(main);
        } catch (e) { App.toast('Güncellenemedi: ' + ((e && e.message) || e), 'err'); }
      }
    );
  }

  return { render };
})();
