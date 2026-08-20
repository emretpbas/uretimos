// ════════════════════════════════════════════════════════════════════════════
// AYLIK FAALİYET DEFTERİ VE ARŞİV
// ────────────────────────────────────────────────────────────────────────────
// Tüm departmanların işlemleri sunucudaki denetim kaydından (audit_log) okunur:
// kim, ne zaman, hangi rol/birim, hangi ekrandan, hangi veriyi değiştirdi.
//
// TASARIM KARARI — neden ayrı bir "log tablosu" tutmuyoruz:
// Sistem her yazma işlemini zaten denetim kaydına yazıyor. İkinci bir defter
// tutmak (a) veriyi çoğaltır, (b) iki kaynak zamanla birbirini tutmaz,
// (c) geçmişi kapsamaz. Denetim kaydı üzerinden okumak GERİYE DÖNÜK çalışır:
// sistem kurulduğu günden bugüne tüm aylar zaten burada.
//
// AYLIK KAPANIŞ: Veri fiziksel olarak taşınmaz/silinmez — dönem bazlı
// görüntülenir. Temmuz bittiğinde Temmuz "kapanmış dönem" olarak arşivde
// görünür, Ağustos yeni ay olarak sıfırdan sayar. Silme yapılmadığı için
// geçmiş her zaman denetlenebilir kalır (mali denetimin temel şartı).
// ════════════════════════════════════════════════════════════════════════════
PageModules.faaliyet_defteri = (() => {

  let aktifSekme = 'bu_ay';
  let seciliDonem = null;

  const BIRIM_ETIKET = {
    yonetim: 'Üst Yönetim', satinalma: 'Satınalma', uretim_planlama: 'Üretim Planlama',
    depo: 'Depo', arge: 'ARGE', teknik_ofis: 'Teknik Ofis', kalite: 'Kalite',
    teklif_siparis: 'Teklif & Sipariş', cari: 'Cari İşlemler', sevkiyat: 'Sevkiyat',
    muhasebe: 'Muhasebe', satis: 'Satış', hat_operator: 'Hat Operatörü',
    admin: 'Sistem Yöneticisi', bilinmeyen: 'Belirtilmemiş'
  };

  const ISLEM_ETIKET = { set: 'Kayıt/Güncelleme', delete: 'Silme', setIfAbsent: 'İlk oluşturma' };

  const KOLEKSIYON_ETIKET = {
    hammaddeler: 'Hammadde kartları', yarimamuller: 'Yarı mamüller', urunler: 'Ürün kartları',
    receteler: 'Reçeteler', siparisler: 'Siparişler', isemirleri: 'İş emirleri',
    depoGirisleri: 'Depo girişleri', stokHareketleri: 'Stok hareketleri',
    satinalmaTalepleri: 'Satınalma talepleri', satinalmaSiparisleri: 'Satınalma siparişleri',
    tedarikciler: 'Tedarikçiler', musteriler: 'Müşteriler', istasyonIsleri: 'Hat iş kartları',
    receteTalepleri: 'Reçete talepleri (hattan)', malzemeTalepleri: 'Malzeme talepleri',
    kritikStokSeviyeleri: 'Kritik stok seviyeleri', hatDurumlari: 'Hat durumu (beklet)',
    faturalar: 'Faturalar', irsaliyeler: 'İrsaliyeler', bildirimler: 'Bildirimler'
  };

  const donemAd = (d) => {
    if (!d) return '';
    const [y, a] = d.split('-');
    const aylar = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return (aylar[+a] || a) + ' ' + y;
  };
  const buAy = () => new Date().toISOString().slice(0, 7);

  async function render(main) {
    const rol = App.aktifRol();
    if (rol !== 'yonetim' && rol !== 'admin') {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Faaliyet defteri yalnızca üst yönetim tarafından görüntülenebilir.
        Bu kısıt kasıtlıdır: denetim kaydı tüm personelin işlemlerini içerir.</div></div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="page-hdr"><div>
        <div class="page-title">📚 Faaliyet Defteri & Arşiv</div>
        <div class="page-sub">Tüm departmanların işlem kaydı — aylık dönemler halinde, geçmişe dönük</div>
      </div></div>
      <div class="tabs" style="margin-bottom:12px">
        <div class="tab ${aktifSekme === 'bu_ay' ? 'active' : ''}" data-s="bu_ay">Bu Ay (${donemAd(buAy())})</div>
        <div class="tab ${aktifSekme === 'arsiv' ? 'active' : ''}" data-s="arsiv">📦 Arşiv (Geçmiş Aylar)</div>
      </div>
      <div id="fd-icerik"><div class="muted" style="padding:14px;font-size:12.5px">Yükleniyor…</div></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => {
      aktifSekme = t.dataset.s; seciliDonem = null; render(main);
    });

    const icerik = document.getElementById('fd-icerik');
    try {
      if (aktifSekme === 'bu_ay') await donemCiz(icerik, buAy(), true);
      else if (seciliDonem) await donemCiz(icerik, seciliDonem, false);
      else await arsivListesiCiz(icerik, main);
    } catch (e) {
      icerik.innerHTML = `<div class="card"><div style="padding:16px;font-size:12.5px;color:var(--red-text)">
        Kayıtlar okunamadı: ${App.escapeHtml(e.message || String(e))}</div></div>`;
    }
  }

  // ── Arşiv: dönem listesi ──────────────────────────────────────────────────
  async function arsivListesiCiz(el, main) {
    const donemler = await Store.auditDonemleri();
    const gecmis = (donemler || []).filter(d => d.donem !== buAy());
    if (!gecmis.length) {
      el.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Henüz kapanmış bir dönem yok. İçinde bulunduğunuz ay bittiğinde
        burada arşiv kaydı olarak görünecek.</div></div></div>`;
      return;
    }
    el.innerHTML = `<div class="card">
      <div class="card-hdr"><div class="card-title">Kapanmış Dönemler (${gecmis.length})</div></div>
      <div class="fhint" style="margin-bottom:8px">
        Her ay kendi içinde kapanır; veriler <b>silinmez</b>, dönem olarak arşivlenir.
        Detay için bir aya tıklayın.
      </div>
      <table class="dtable"><tr><th>Dönem</th><th class="r">İşlem</th><th class="r">Kullanıcı</th><th>İlk / Son Hareket</th><th></th></tr>
        ${gecmis.map(d => `<tr>
          <td><b>${donemAd(d.donem)}</b> <span class="muted mono" style="font-size:10.5px">${d.donem}</span></td>
          <td class="r">${App.fmt(d.islem, 0)}</td>
          <td class="r">${d.kullanici_sayisi}</td>
          <td style="font-size:11px" class="muted">${(d.ilk || '').slice(0, 10)} → ${(d.son || '').slice(0, 10)}</td>
          <td><button class="btn btn-sm fd-ac" data-d="${d.donem}">Aç</button></td>
        </tr>`).join('')}
      </table></div>`;
    el.querySelectorAll('.fd-ac').forEach(b => b.onclick = () => {
      seciliDonem = b.dataset.d; render(main);
    });
  }

  // ── Bir dönemin detayı: birim kırılımı + hareket listesi ──────────────────
  async function donemCiz(el, donem, buAyMi) {
    const [birimler, rows] = await Promise.all([
      Store.auditBirimOzeti(donem),
      Store.auditGetir(400, { donem })
    ]);
    const toplam = birimler.reduce((s, b) => s + (+b.islem || 0), 0);

    el.innerHTML = `
      ${buAyMi ? '' : `<div style="margin-bottom:8px"><button class="btn btn-sm" id="fd-geri">← Arşive dön</button></div>`}
      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">${donemAd(donem)} — Departman Özeti</div></div>
        ${buAyMi ? '<div class="fhint" style="margin-bottom:8px">Bu ay <b>açık dönem</b>. Ay bittiğinde arşive geçer ve yeni ay sıfırdan başlar.</div>' : ''}
        ${birimler.length ? `<table class="dtable"><tr><th>Departman</th><th class="r">İşlem</th><th class="r">Pay</th><th class="r">Kişi</th><th class="r">Veri Türü</th></tr>
          ${birimler.map(b => `<tr>
            <td>${App.escapeHtml(BIRIM_ETIKET[b.rol] || b.rol)}</td>
            <td class="r">${App.fmt(b.islem, 0)}</td>
            <td class="r">${toplam ? Math.round(b.islem / toplam * 100) : 0}%</td>
            <td class="r">${b.kisi}</td>
            <td class="r">${b.koleksiyon}</td>
          </tr>`).join('')}
          <tr style="font-weight:600;background:var(--surface2)"><td>TOPLAM</td><td class="r">${App.fmt(toplam, 0)}</td><td class="r">100%</td><td></td><td></td></tr>
        </table>` : '<div class="muted" style="padding:10px;font-size:12px">Bu dönemde kayıt yok.</div>'}
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Hareket Kaydı ${rows.length >= 400 ? '(son 400)' : '(' + rows.length + ')'}</div></div>
        ${rows.length ? `<div style="overflow-x:auto"><table class="dtable">
          <tr><th>Zaman</th><th>Kullanıcı</th><th>Departman</th><th>İşlem</th><th>Veri</th><th>Ekran</th><th class="r">Kayıt</th></tr>
          ${rows.map(r => `<tr>
            <td style="font-size:11px" class="mono">${(r.ts || '').slice(0, 16).replace('T', ' ')}</td>
            <td style="font-size:11.5px"><b>${App.escapeHtml(r.kullanici || '')}</b></td>
            <td style="font-size:11px">${App.escapeHtml(BIRIM_ETIKET[r.rol] || r.rol || '—')}</td>
            <td style="font-size:11px">${App.escapeHtml(ISLEM_ETIKET[r.islem] || r.islem || '')}</td>
            <td style="font-size:11.5px">${App.escapeHtml(KOLEKSIYON_ETIKET[r.anahtar] || r.anahtar || '')}</td>
            <td style="font-size:11px" class="muted">${App.escapeHtml(r.sayfa || '—')}</td>
            <td class="r" style="font-size:11px">${r.kayit_sayisi != null ? r.kayit_sayisi : ''}</td>
          </tr>`).join('')}
        </table></div>` : '<div class="muted" style="padding:10px;font-size:12px">Bu dönemde hareket yok.</div>'}
      </div>`;

    const geri = document.getElementById('fd-geri');
    if (geri) geri.onclick = () => { seciliDonem = null; render(document.getElementById('main') || el.closest('#main') || el.parentElement); };
  }

  return { render };
})();
