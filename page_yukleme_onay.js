// ════════════════════════════════════════════════════════════════════════════
// SEVKİYAT YÜKLEME ONAYI (TELEFON) — ayrı birim, ayrı şifre. Yükleme personeli
// şifreyle girer, AD SOYAD yazar; "Yüklemeyi Yaptım" derken TELEFONLA sipariş
// etiketindeki BARKODU okutur — barkod SİPARİŞ KODUYLA EŞLEŞMEDEN yükleme
// sistemde ONAYLANMAZ. Yükleme fotoğrafı eklenebilir (1080p'ye ölçeklenir).
// ════════════════════════════════════════════════════════════════════════════
PageModules.yukleme_onay = (() => {
  const BIRIM = 'SEVKİYAT YÜKLEME';

  function oturumOku() {
    try { return JSON.parse(window.sessionStorage.getItem('uretimos_yukleme_oturum') || 'null'); } catch (e) { return null; }
  }
  function oturumYaz(o) {
    try { o ? window.sessionStorage.setItem('uretimos_yukleme_oturum', JSON.stringify(o)) : window.sessionStorage.removeItem('uretimos_yukleme_oturum'); } catch (e) {}
  }

  async function render(main) {
    const oturum = oturumOku();
    if (!oturum) return girisEkrani(main);
    return listeEkrani(main, oturum);
  }

  // ── GİRİŞ: birim şifresi + ad soyad ──────────────────────────────────────
  function girisEkrani(main) {
    main.innerHTML = `
      <div class="page-hdr"><div><div class="page-title">🚚 Sevkiyat Yükleme Onayı</div>
      <div class="page-sub">Yükleme birimi şifresiyle girin, adınızı yazın — yükleme onayları bu isimle kaydedilir.</div></div></div>
      <div class="card" style="max-width:460px;margin:0 auto">
        <div class="fgroup"><label class="flbl">Yükleme Birimi Şifresi</label>
          <input class="finput" id="yg-sifre" type="password" placeholder="Birime tanımlı şifre">
          <div class="fhint">Tanımlanmamışsa varsayılan <b>1234</b> — yönetim Hat & İstasyon Takibi → 🔑 Hat Şifreleri'nden "${BIRIM}" satırında belirler.</div></div>
        <div class="fgroup"><label class="flbl">Adınız Soyadınız <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="yg-isim" placeholder="örn. Mehmet Demir"></div>
        <button class="btn btn-blue" id="yg-giris" style="width:100%">Giriş Yap</button>
        <div id="yg-hata" style="color:var(--red-text);font-size:12px;margin-top:8px;min-height:16px"></div>
      </div>`;
    document.getElementById('yg-giris').onclick = async () => {
      const sifre = document.getElementById('yg-sifre').value;
      const isim = document.getElementById('yg-isim').value.trim();
      if (!isim) { document.getElementById('yg-hata').textContent = 'Ad soyad zorunludur'; return; }
      if (!(await App.hatSifresiDogru(BIRIM, sifre))) {
        document.getElementById('yg-hata').textContent = '✗ Yükleme birimi şifresi hatalı';
        App.toast('Şifre hatalı', 'err');
        return;
      }
      oturumYaz({ isim, giris: new Date().toISOString() });
      App.toast('Hoş geldiniz ' + isim, 'ok');
      render(main);
    };
  }

  // ── YÜKLEME LİSTESİ ──────────────────────────────────────────────────────
  async function listeEkrani(main, oturum) {
    const [siparisler, irsaliyeler] = await Promise.all([Store.siparisler.all(), Store.irsaliyeler.all()]);
    // Yüklenecekler: irsaliyesi kesilmiş veya sevke hazır siparişler
    const yuklenebilir = siparisler.filter(s =>
      (s.durum === 'sevk_edildi' || (s.durum === 'onaylandi' && s.uretimDurumu === 'tamamlandi')));

    let html = `
      <div class="page-hdr">
        <div><div class="page-title">🚚 Yükleme Onayı</div>
        <div class="page-sub">Personel: <b>${App.escapeHtml(oturum.isim)}</b> — "Yüklemeyi Yaptım" derken koli etiketindeki barkodu telefonla okutun; barkod sipariş koduyla eşleşmeden yükleme ONAYLANMAZ.</div></div>
        <div class="page-acts"><button class="btn" id="yo-cikis">Çıkış</button></div>
      </div>
      <div class="card">`;
    if (!yuklenebilir.length) {
      html += `<div class="empty-state" style="padding:24px"><div class="edesc">Yüklenecek sipariş yok.</div></div>`;
    } else {
      html += `<table class="dtable" style="font-size:11.5px"><tr><th>Sipariş</th><th>Müşteri</th><th>İrsaliye</th><th>Yükleme</th><th></th></tr>`;
      yuklenebilir.forEach(s => {
        const irs = irsaliyeler.find(i => i.siparisId === s.id);
        const y = s.yukleme;
        html += `<tr>
          <td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi || '—')}</td>
          <td class="mono" style="font-size:10.5px">${irs ? App.escapeHtml(irs.irsaliyeNo) : '—'}</td>
          <td>${y ? `<span class="pill pill-green" style="font-size:9.5px">✓ Yüklendi — ${App.escapeHtml(y.kisi)} · ${y.tarih}${(y.fotograflar || []).length ? ' · 📷' + y.fotograflar.length : ''}</span>` : '<span class="pill pill-amber" style="font-size:9.5px">Bekliyor</span>'}</td>
          <td>${y ? '' : `<button class="btn btn-sm btn-green yo-yukle" data-id="${s.id}">📷 Yüklemeyi Yaptım (QR Okut)</button>`}</td>
        </tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    main.innerHTML = html;
    document.getElementById('yo-cikis').onclick = () => { oturumYaz(null); render(main); };

    main.querySelectorAll('.yo-yukle').forEach(b => b.onclick = () => {
      const s = yuklenebilir.find(x => x.id === b.dataset.id);
      // 1. ADIM: barkod eşleşmesi — etiketteki barkod sipariş kodudur
      App.barkodOkutModal({
        baslik: '📷 Yükleme QR Kodu Okut — ' + s.kod,
        beklenen: s.kod,
        aciklama: `Koli etiketindeki QR kodu telefonla okutun. QR <b>${App.escapeHtml(s.kod)}</b> ile eşleşmeden yükleme onaylanmaz.<br><b>iPhone:</b> telefonun kendi kamera uygulamasıyla okutmanız yeterlidir.`,
        onOkundu: () => yuklemeOnayModali(s, oturum, main)
      });
    });
  }

  // ── 2. ADIM: fotoğraf (1080p) + onay ────────────────────────────────────
  function yuklemeOnayModali(siparis, oturum, main) {
    const fotograflar = [];
    const body = document.createElement('div');
    function ciz() {
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:10px">✓ QR eşleşti: <b>${App.escapeHtml(siparis.kod)}</b> — ${App.escapeHtml(siparis.musteriAdi || '')}<br>
        Yüklemeyi yapan: <b>${App.escapeHtml(oturum.isim)}</b></div>
        <div class="fgroup"><label class="flbl">Yükleme Fotoğrafı (opsiyonel — 1080p'ye otomatik ölçeklenir)</label>
          <input class="finput" id="yf-foto" type="file" accept="image/*" capture="environment"></div>
        <div id="yf-liste" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${fotograflar.map((f, i) => `<div style="position:relative"><img src="${f}" style="width:96px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
            <button class="btn btn-icon btn-ghost yf-sil" data-i="${i}" style="position:absolute;top:-6px;right:-6px;background:var(--surface);color:var(--red-text)" type="button">&times;</button></div>`).join('')}
        </div>
        <div class="fgroup" style="margin-top:10px"><label class="flbl">Not</label><textarea class="ftextarea" id="yf-not"></textarea></div>`;
      body.querySelector('#yf-foto').onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const dataUrl = await App.fotografiOlcekle1080(file);
        fotograflar.push(dataUrl);
        App.toast('Fotoğraf eklendi (1080p ölçekli)', 'ok');
        ciz();
      };
      body.querySelectorAll('.yf-sil').forEach(btn => btn.onclick = () => { fotograflar.splice(parseInt(btn.dataset.i), 1); ciz(); });
    }
    ciz();
    App.openModal({
      title: '🚚 Yükleme Onayı — ' + siparis.kod, body,
      footer: `<button class="btn" id="yf-cancel">Vazgeç</button><button class="btn btn-green" id="yf-onayla">✓ Yüklemeyi Onayla</button>`, wide: true
    });
    document.getElementById('yf-cancel').onclick = App.closeModal;
    document.getElementById('yf-onayla').onclick = async () => {
      const siparisler = await Store.siparisler.all();
      const guncel = siparisler.find(x => x.id === siparis.id);
      guncel.yukleme = {
        kisi: oturum.isim,
        tarih: new Date().toISOString().slice(0, 10),
        zaman: new Date().toISOString(),
        barkodDogrulandi: true,
        fotograflar: fotograflar,
        not: document.getElementById('yf-not').value.trim()
      };
      await App.persist(() => Store.siparisler.upsert(guncel));
      App.toast('✓ Yükleme onaylandı: ' + siparis.kod + ' (' + oturum.isim + ')' + (fotograflar.length ? ' — ' + fotograflar.length + ' fotoğraf' : ''), 'ok');
      App.closeModal();
      render(main);
    };
  }

  return { render };
})();
