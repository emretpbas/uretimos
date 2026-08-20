// ════════════════════════════════════════════════════════════════════════════
// HAT OPERATÖR TERMİNALİ (TELEFON) — her hat/bölüm için AYRI GİRİŞ ve ŞİFRE.
// Sorumlu, hattının şifresiyle girer; önce ADI SOYADI sorulur ve o oturumda
// yapılan tüm onaylara otomatik işlenir. Barkod TELEFON KAMERASIYLA okunur
// (BarcodeDetector destekli cihazlarda canlı tarama, diğerlerinde elle giriş)
// ve okunan kod GELEN YARI MAMÜLÜN KODUYLA EŞLEŞMEDEN üretime başlanamaz.
// Hattın makina bakım alarmları da bu ekranda görüntülenir.
// ════════════════════════════════════════════════════════════════════════════
PageModules.hat_terminal = (() => {
  let _bekleyenHatlar = new Set();   // bekletilen hatlar (render'da tazelenir)
  let _hatOnbellek = null;           // hat bazlı süzülmüş veri (sunucudan)
  // Oturum: { hat, isim } — sessionStorage'da tutulur (telefon başında kalıcı)
  function oturumOku() {
    try { return JSON.parse(window.sessionStorage.getItem('uretimos_hat_oturum') || 'null'); } catch (e) { return null; }
  }
  function oturumYaz(o) {
    try { o ? window.sessionStorage.setItem('uretimos_hat_oturum', JSON.stringify(o)) : window.sessionStorage.removeItem('uretimos_hat_oturum'); } catch (e) {}
  }

  async function render(main) {
    const oturum = oturumOku();
    if (!oturum) return girisEkrani(main);
    return terminalEkrani(main, oturum);
  }

  // ── İSİM NORMALLEŞTİRME: "ahmet  yılmaz " ≡ "Ahmet Yılmaz" ───────────────
  function isimAnahtari(isim) {
    return String(isim || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
  }

  // ── 1) OPERATÖR GİRİŞ EKRANI: hat seç + AD SOYAD + KİŞİSEL ŞİFRE ─────────
  // Kişi bazlı yetkilendirme: yönetim onaylı operatör kaydı (hatOperatorleri)
  // aranır; şifre doğruysa VE seçilen hat operatörün yetki listesindeyse
  // giriş yapılır. Kaydı olmayan operatör "Şifre Oluşturma Talebi" açar —
  // talep yönetimce (Hat & İstasyon Takibi → 👤 Operatör Yetkileri)
  // değerlendirilir. GEÇİŞ DÖNEMİ: hatta tanımlı ORTAK şifre de hâlâ çalışır.
  async function girisEkrani(main) {
    // Sunucu sürümünde hat listesi TOKENSİZ özel uçtan gelir (rotaların tamamı
    // giriş yapılmadan okunamaz); YEREL sürümde rotalardan türetilir. Sunucu
    // modunda liste boş dönse bile rotalara DÜŞÜLMEZ — oturumsuz rota okuma
    // 401 üretip giriş ekranını döngüye sokar.
    let hatlar = [];
    if (Store.hatListesiGetir) {
      hatlar = await Store.hatListesiGetir();
    } else {
      try {
        const rotalar = await Store.rotalar.all();
        hatlar = [...new Set(rotalar.flatMap(r => (r.steps || []).map(s => s.hat)).filter(h => h && h !== 'TAŞIMA'))].sort((a, b) => a.localeCompare(b, 'tr'));
      } catch (e) { /* okunamadıysa boş listeyle devam */ }
    }
    main.innerHTML = `
      <div class="page-hdr"><div><div class="page-title">📱 Hat Operatör Terminali</div>
      <div class="page-sub">Adınız ve kişisel şifrenizle, yalnızca yetkilendirildiğiniz hatta giriş yapabilirsiniz. Yaptığınız tüm onaylara adınız işlenir.</div></div></div>
      <div class="card" style="max-width:460px;margin:0 auto">
        <div class="fgroup"><label class="flbl">Hat / Bölüm</label>
          <select class="fselect" id="hg-hat">
            ${hatlar.map(h => `<option value="${App.escapeHtml(h)}">${App.escapeHtml(h)}</option>`).join('')}
          </select>
          ${!hatlar.length ? '<div class="fhint" style="color:var(--red-text)">Henüz tanımlı hat yok. Yönetim, Hat &amp; Rota ekranından rota adımlarına hat tanımlamalıdır.</div>' : ''}</div>
        <div class="fgroup"><label class="flbl">Adınız Soyadınız <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="hg-isim" placeholder="örn. Ahmet Yılmaz" autocomplete="name"></div>
        <div class="fgroup"><label class="flbl">Şifreniz</label>
          <input class="finput" id="hg-sifre" type="password" placeholder="Kişisel şifreniz (veya hattın ortak şifresi)">
          <div class="fhint">Kişisel şifreniz yoksa aşağıdan <b>şifre oluşturma talebi</b> açın — yönetim onaylayınca yetkilendirildiğiniz hatlara girebilirsiniz.</div></div>
        <button class="btn btn-blue" id="hg-giris" style="width:100%">Hatta Giriş Yap</button>
        <div id="hg-hata" style="color:var(--red-text);font-size:12px;margin-top:8px;min-height:16px"></div>
        <div style="display:flex;align-items:center;gap:10px;margin:14px 0 10px">
          <div style="flex:1;height:1px;background:var(--border)"></div>
          <div style="font-size:10px;color:var(--text3);font-weight:700">ŞİFREM YOK</div>
          <div style="flex:1;height:1px;background:var(--border)"></div>
        </div>
        <button class="btn" id="hg-talep" style="width:100%">🔑 Şifre Oluşturma Talebi Aç</button>
        <div class="fhint" style="text-align:center;margin-top:6px">Talebiniz yönetime düşer; onaylanınca seçtiğiniz hat/bölümler için yetkilendirilirsiniz.</div>
      </div>`;

    document.getElementById('hg-giris').onclick = async () => {
      const hat = document.getElementById('hg-hat').value;
      const isim = document.getElementById('hg-isim').value.trim();
      const sifre = document.getElementById('hg-sifre').value;
      const hataEl = document.getElementById('hg-hata');
      hataEl.textContent = '';
      if (!hat) { hataEl.textContent = 'Hat seçin'; return; }
      if (!isim) { hataEl.textContent = 'Ad soyad zorunludur — onaylara işlenecek'; return; }
      if (!sifre) { hataEl.textContent = 'Şifre girin'; return; }

      // ── SUNUCU SÜRÜMÜ: doğrulama api.php'de (kısıtlı operatör token'ı) ──
      if (Store.hatOperatorGiris) {
        const btn = document.getElementById('hg-giris');
        btn.disabled = true; btn.textContent = 'Giriş yapılıyor…';
        const sonuc = await Store.hatOperatorGiris(hat, isim, sifre);
        btn.disabled = false; btn.textContent = 'Hatta Giriş Yap';
        if (!sonuc.ok) {
          hataEl.textContent = '✗ ' + (sonuc.error || 'Giriş başarısız');
          App.toast(sonuc.error || 'Giriş başarısız', 'err');
          return;
        }
        oturumYaz({ hat, isim, giris: new Date().toISOString() });
        App.toast('Hoş geldiniz ' + isim + ' — ' + hat, 'ok');
        render(main);
        return;
      }

      // ── YEREL SÜRÜM: doğrulama tarayıcıda ──
      const anahtar = isimAnahtari(isim);
      const operatorler = await Store.hatOperatorleri.all();
      const op = operatorler.find(o => isimAnahtari(o.isim) === anahtar);

      if (op) {
        if (op.durum === 'pasif') { hataEl.textContent = '✗ Hesabınız pasife alınmış — yönetimle görüşün'; return; }
        if (String(op.sifre) !== String(sifre)) {
          // Kişisel şifre tutmadı — ortak hat şifresi de denenir (geçiş dönemi)
          if (!(await App.hatSifresiDogru(hat, sifre))) {
            hataEl.textContent = '✗ Şifre hatalı'; App.toast('Şifre hatalı', 'err'); return;
          }
        } else if (!(op.hatlar || []).includes(hat)) {
          hataEl.textContent = '✗ Bu hat için yetkiniz yok. Yetkili olduğunuz hatlar: ' + ((op.hatlar || []).join(', ') || '—');
          App.toast('Bu hat için yetkilendirilmemişsiniz', 'err');
          return;
        }
      } else {
        // Kayıtlı operatör değil → eski ORTAK hat şifresi (geçiş dönemi)
        if (!(await App.hatSifresiDogru(hat, sifre))) {
          const talepler = await Store.hatSifreTalepleri.all();
          const bekleyen = talepler.find(t => isimAnahtari(t.isim) === anahtar && t.durum === 'bekliyor');
          hataEl.textContent = bekleyen
            ? '⏳ Şifre talebiniz henüz yönetim onayında — onaylanınca girebilirsiniz'
            : '✗ Kayıtlı operatör bulunamadı ve şifre hatalı. Aşağıdan şifre oluşturma talebi açabilirsiniz.';
          App.toast('Giriş başarısız', 'err');
          return;
        }
      }

      oturumYaz({ hat, isim, giris: new Date().toISOString() });
      App.toast('Hoş geldiniz ' + isim + ' — ' + hat, 'ok');
      render(main);
    };

    // ── ŞİFRE OLUŞTURMA TALEBİ: isim + istenen hatlar + şifre (x2) ─────────
    document.getElementById('hg-talep').onclick = async () => {
      const onIsim = document.getElementById('hg-isim').value.trim();
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:10px">Talebiniz yönetime iletilir. Yönetim, hangi hat/bölümlerde çalışacağınızı onaylar; <b>yalnızca onaylanan hatlara</b> girebilirsiniz.</div>
        <div class="fgroup"><label class="flbl">Adınız Soyadınız <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="st-isim" value="${App.escapeHtml(onIsim)}" placeholder="örn. Ahmet Yılmaz"></div>
        <div class="fgroup"><label class="flbl">Çalışacağınız Hat / Bölümler <span style="color:var(--red-text)">*</span></label>
          <div style="max-height:180px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px">
            ${hatlar.map(h => `<label style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;cursor:pointer">
              <input type="checkbox" class="st-hat" value="${App.escapeHtml(h)}"> ${App.escapeHtml(h)}</label>`).join('')}
          </div></div>
        <div class="fgroup"><label class="flbl">Belirlemek İstediğiniz Şifre <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="st-sifre" type="password" placeholder="en az 4 karakter"></div>
        <div class="fgroup"><label class="flbl">Şifre (Tekrar) <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="st-sifre2" type="password"></div>
        <div id="st-hata" style="color:var(--red-text);font-size:12px;min-height:16px"></div>`;
      App.openModal({
        title: '🔑 Şifre Oluşturma Talebi',
        body,
        footer: `<button class="btn" id="st-cancel">Vazgeç</button><button class="btn btn-blue" id="st-gonder">Talebi Yönetime Gönder</button>`
      });
      document.getElementById('st-cancel').onclick = App.closeModal;
      document.getElementById('st-gonder').onclick = async () => {
        const isim = document.getElementById('st-isim').value.trim();
        const secili = [...document.querySelectorAll('.st-hat:checked')].map(c => c.value);
        const s1 = document.getElementById('st-sifre').value;
        const s2 = document.getElementById('st-sifre2').value;
        const hata = document.getElementById('st-hata');
        hata.textContent = '';
        if (!isim) { hata.textContent = 'Ad soyad zorunlu'; return; }
        if (!secili.length) { hata.textContent = 'En az bir hat/bölüm seçin'; return; }
        if ((s1 || '').length < 4) { hata.textContent = 'Şifre en az 4 karakter olmalı'; return; }
        if (s1 !== s2) { hata.textContent = 'Şifreler birbirini tutmuyor'; return; }

        // ── SUNUCU SÜRÜMÜ: talep api.php'ye gönderilir (oturumsuz, hız sınırlı) ──
        if (Store.hatSifreTalepGonder) {
          const btn = document.getElementById('st-gonder');
          btn.disabled = true; btn.textContent = 'Gönderiliyor…';
          const sonuc = await Store.hatSifreTalepGonder({ isim, sifre: s1, hatlar: secili });
          btn.disabled = false; btn.textContent = 'Talebi Yönetime Gönder';
          if (!sonuc.ok) { hata.textContent = sonuc.error || 'Talep gönderilemedi'; return; }
          App.closeModal();
          App.toast('✓ Talebiniz yönetime iletildi — onaylanınca girebilirsiniz', 'ok');
          return;
        }

        // ── YEREL SÜRÜM: doğrudan koleksiyona yazılır ──
        const talepler = await Store.hatSifreTalepleri.all();
        const anahtar = isimAnahtari(isim);
        if (talepler.some(t => isimAnahtari(t.isim) === anahtar && t.durum === 'bekliyor')) {
          hata.textContent = 'Bu isimle bekleyen bir talebiniz zaten var — yönetim onayını bekleyin';
          return;
        }
        talepler.push({
          id: App.uid('HST'), isim, sifre: s1, hatlar: secili,
          durum: 'bekliyor', tarih: new Date().toISOString().slice(0, 10),
          zaman: new Date().toISOString()
        });
        await App.persist(() => Store.hatSifreTalepleri.save(talepler));
        App.closeModal();
        App.toast('✓ Talebiniz yönetime iletildi — onaylanınca girebilirsiniz', 'ok');
      };
    };
  }

  // ── 2) TERMİNAL: hattın işleri + bakım alarmları ─────────────────────────
  async function terminalEkrani(main, oturum) {
    // Hat & İstasyon Takibi senkronunu kullan: kartlar güncel düşsün
    if (PageModules.hat_takip && PageModules.hat_takip.isKartlariniSenkronize) {
      await PageModules.hat_takip.isKartlariniSenkronize();
    }
    // ── HAT BAZLI VERİ (performans) ────────────────────────────────────────
    // Tüm koleksiyonları indirmek yerine yalnızca BU HATTIN verisi çekilir.
    // Eskiden 95 MB inen veri ~4 MB'a düşer; telefonda 76 sn → 3 sn.
    // Sunucu erişilemezse eski yola düşülür (üretim durmasın).
    let _hatVeri = null;
    try { _hatVeri = await Store.hatVerisiGetir(oturum.hat); } catch (e) { _hatVeri = null; }

    let isler, rotalar, makinalar, hatIsleri, bitenIsler;
    if (_hatVeri) {
      isler = (_hatVeri.istasyonIsleri || []).concat(_hatVeri.bitenIsler || []);
      rotalar = _hatVeri.rotalar || [];
      makinalar = _hatVeri.makinaTechizat || [];
      hatIsleri = (_hatVeri.istasyonIsleri || []).filter(x => x.durum === 'aktif');
      bitenIsler = _hatVeri.bitenIsler || [];
      _hatOnbellek = _hatVeri;   // malzeme onay modalı da bunu kullanır
    } else {
      const [i2, r2, m2] = await Promise.all([
        Store.istasyonIsleri.all(), Store.rotalar.all(), Store.makinaTechizat.all()
      ]);
      isler = i2; rotalar = r2; makinalar = m2;
      hatIsleri = isler.filter(x => x.hat === oturum.hat && x.durum === 'aktif');
      bitenIsler = isler.filter(x => x.hat === oturum.hat && x.durum === 'tamamlandi');
      _hatOnbellek = null;
    }

    // Bu hattın makina bakım alarmları (bakım tarihi geçen/gelen)
    const bugun = new Date().toISOString().slice(0, 10);
    const hatMakinalari = makinalar.filter(m => (m.hat || m.konum || '') === oturum.hat && m.durum !== 'hurda');
    const alarmlar = hatMakinalari.filter(m => {
      if (!m.bakimAralikGun) return false;
      const son = m.sonBakimTarihi || m.alisTarihi;
      if (!son) return true;
      const sonraki = new Date(new Date(son).getTime() + m.bakimAralikGun * 86400000).toISOString().slice(0, 10);
      return sonraki <= bugun;
    });

    let html = `
      <div class="page-hdr">
        <div><div class="page-title">📱 ${App.escapeHtml(oturum.hat)}</div>
        <div class="page-sub">Operatör: <b>${App.escapeHtml(oturum.isim)}</b> — tüm onaylar bu isimle kaydedilir</div></div>
        <div class="page-acts"><button class="btn" id="ht-cikis">Hattan Çık</button></div>
      </div>`;

    if (alarmlar.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🔔 BAKIM ALARMI — ${alarmlar.length} makina</div>
        ${alarmlar.map(m => `<div style="font-size:12px;padding:4px 0">⚠ <b>${App.escapeHtml(m.ad)}</b> (${App.escapeHtml(m.kod || '')}) — rutin bakım süresi doldu${m.bakimSorumlusu ? ' · Sorumlu: ' + App.escapeHtml(m.bakimSorumlusu) : ''}. Bakım Planlama'ya bildirildi.</div>`).join('')}
      </div>`;
    }

    if (!hatIsleri.length) {
      html += `<div class="card"><div class="empty-state" style="padding:24px"><div class="edesc">Bu hatta bekleyen iş yok.</div></div></div>`;
    } else {
      // İstasyon sırasına göre grupla
      const gruplar = new Map();
      hatIsleri.forEach(x => {
        if (!gruplar.has(x.istasyonKod)) gruplar.set(x.istasyonKod, { kod: x.istasyonKod, tanim: x.istasyonTanim, sira: x.stepIndex, isler: [] });
        gruplar.get(x.istasyonKod).isler.push(x);
      });
      [...gruplar.values()].sort((a, b) => a.sira - b.sira).forEach(g => {
        html += `<div class="card" style="margin-bottom:12px">
          <div class="card-hdr"><div class="card-title">📍 ${App.escapeHtml(g.kod)} — ${App.escapeHtml(g.tanim)}</div></div>`;
        g.isler.forEach(x => {
          const kalan = x.gelenAdet - x.fireAdet;
          html += `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--surface2)">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
              <div><b class="mono" style="font-size:12px">${App.escapeHtml(x.ymKod)}</b> — ${App.escapeHtml(x.ymAd)}<br>
              <span class="muted" style="font-size:10.5px">${App.escapeHtml(x.kaynakKod)} · Gelen: ${kalan} · Kalite: ${x.kaliteOnayliAdet} · İşlem: ${x.islemTamamAdet} · Sevk: ${x.sevkEdilenAdet}${x.fireAdet ? ' · <b style="color:var(--red-text)">Red: ' + x.fireAdet + '</b>' : ''}</span></div>
              ${x.barkodOkundu ? '<span class="pill pill-green" style="font-size:9.5px;align-self:center">📶 QR Eşleşti</span>' : '<span class="pill pill-red" style="font-size:9.5px;align-self:center">QR bekliyor</span>'}
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
              ${!x.barkodOkundu ? `<button class="btn btn-sm ho-barkod" data-id="${x.id}">📷 QR Okut (Telefon)</button>` : ''}
              <button class="btn btn-sm btn-blue ho-kalite" data-id="${x.id}" ${(!x.barkodOkundu || kalan - x.kaliteOnayliAdet <= 0) ? 'disabled' : ''}>✓ Kalite</button>
              <button class="btn btn-sm ho-red" data-id="${x.id}" style="background:var(--red);color:#fff;border:none"
                ${(!x.barkodOkundu || kalan - x.kaliteOnayliAdet <= 0) ? 'disabled' : ''}>✕ Kalite Reddi</button>
              <button class="btn btn-sm btn-amber ho-islem" data-id="${x.id}" ${x.kaliteOnayliAdet - x.islemTamamAdet <= 0 ? 'disabled' : ''}>⚙ İşlem</button>
              <button class="btn btn-sm btn-green ho-sevk" data-id="${x.id}" ${x.islemTamamAdet - x.sevkEdilenAdet <= 0 ? 'disabled' : ''}>➜ Sevk</button>
              <button class="btn btn-sm btn-ghost ho-dosya" data-id="${x.id}" title="Teknik dosyaları aç — görüntüle ve indir">📁 Dosyalar</button>
              <button class="btn btn-sm ho-malzeme" data-id="${x.id}" data-ymid="${App.escapeHtml(x.ymId || x.yarimamulId || '')}" data-ymkod="${App.escapeHtml(x.ymKod)}" data-ymad="${App.escapeHtml(x.ymAd)}" style="background:#7c5cff;color:#fff;border:none" title="Reçete malzemelerini onayla, eksik malzeme veya kart talebi ekle">📋 Malzeme Onayı</button>
            </div>
          </div>`;
        });
        html += `</div>`;
      });
    }
    // 🗂 ESKİ İŞLEMLER (bitenler) — operatör geçmiş işlerini ayrı bölümde görür
    if (bitenIsler.length) {
      html += `<div class="card" style="margin-top:4px">
        <div class="card-hdr"><div class="card-title">🗂 Eski İşlemler — Bitenler (${bitenIsler.length})</div></div>
        ${bitenIsler.sort((a, b) => (b.bitisZamani || '').localeCompare(a.bitisZamani || '')).slice(0, 20).map(x =>
          `<div style="font-size:11px;padding:5px 0;border-bottom:1px solid var(--border)">
            ✓ <b class="mono">${App.escapeHtml(x.ymKod)}</b> · ${App.escapeHtml(x.istasyonKod)} · ${App.escapeHtml(x.kaynakKod)} — Sevk: ${x.sevkEdilenAdet}${x.fireAdet ? ' · Fire: ' + x.fireAdet : ''} · ${x.bitisZamani ? x.bitisZamani.slice(0, 16).replace('T', ' ') : ''}</div>`).join('')}
      </div>`;
    }
    main.innerHTML = html;

    // ── BEKLETİLEN HAT KİLİDİ ──────────────────────────────────────────────
    // Yönetim/planlama bir hattı bekletmişse, o hattaki işlerde operatör
    // ilerleme yapamaz (QR, kalite, işlem, sevk, red). Terminalde farklı
    // hatların işleri bir arada olabildiği için kilit İŞ BAZINDA uygulanır.
    try {
      const hatDurumlari = _hatOnbellek ? (_hatOnbellek.hatDurumlari || []) : await Store.hatDurumlari.all();
      _bekleyenHatlar = new Set((hatDurumlari || [])
        .filter(d => d.durum === 'beklemede').map(d => d.hat));
      const bekleyen = _bekleyenHatlar;
      if (bekleyen.size) {
        const KILITLI = ['ho-barkod', 'ho-kalite', 'ho-islem', 'ho-sevk', 'ho-red'];
        const isBekliyorMu = (isId) => {
          const is = isler.find(x => x.id === isId);
          return !!(is && bekleyen.has(is.hat));
        };
        KILITLI.forEach(c => main.querySelectorAll('.' + c).forEach(b => {
          if (!isBekliyorMu(b.dataset.id)) return;
          b.style.opacity = '0.45';
          b.style.cursor = 'not-allowed';
          b.title = 'Bu hat bekletiliyor — ilerleme yapılamaz.';
        }));
        if (!main._bekletKilidiKurulu) {
        main._bekletKilidiKurulu = true;
        main.addEventListener('click', (ev) => {
          const btn = ev.target.closest('.' + KILITLI.join(', .'));
          if (!btn || !main.contains(btn)) return;
          const is2 = isler.find(x => x.id === btn.dataset.id);
          if (!is2 || !_bekleyenHatlar.has(is2.hat)) return;   // anlık durum
          ev.preventDefault();
          ev.stopPropagation();
          App.toast('⏸ Bu hat bekletiliyor. Yönetim/planlama beklemeyi kaldırmadan işlem yapılamaz.', 'err');
        }, true);
        }
      }
    } catch (e) { /* hat durumu okunamazsa üretim engellenmemeli */ }

    document.getElementById('ht-cikis').onclick = () => { oturumYaz(null); render(main); };

    const isiBul = async (id) => {
      const tumu = await Store.istasyonIsleri.all();
      return { tumu, is: tumu.find(x => x.id === id) };
    };

    // BARKOD: telefon kamerasıyla okut — YARI MAMÜL KODUYLA EŞLEŞMEDEN
    // üretime (kalite onayına) BAŞLANAMAZ.
    main.querySelectorAll('.ho-barkod').forEach(b => b.onclick = async () => {
      const { tumu, is } = await isiBul(b.dataset.id);
      if (!is) return;
      App.barkodOkutModal({
        baslik: '📷 Parça QR Kodu Okut — ' + is.istasyonKod,
        beklenen: is.ymKod,
        aciklama: `Gelen yarı mamül: <b>${App.escapeHtml(is.ymKod)} — ${App.escapeHtml(is.ymAd)}</b><br>Okunan QR bu kodla <b>eşleşmezse üretime başlanamaz</b>.`,
        onOkundu: async () => {
          is.barkodOkundu = true;
          is.barkodTarihi = new Date().toISOString().slice(0, 10);
          is.barkodZamani = new Date().toISOString();
          is.barkodOkuyan = oturum.isim;
          await App.persist(() => Store.istasyonIsleri.save(tumu));
          App.toast('✓ QR eşleşti (' + is.ymKod + ') — üretime başlanabilir', 'ok');
          render(main);
        }
      });
    });

    // Adet onayı — kişi otomatik oturum ismi
    const adetOnay = (baslik, max, onOnay) => {
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fgroup"><label class="flbl">Adet (en fazla ${max})</label>
          <input class="finput" id="ho-adet" type="number" min="1" max="${max}" value="${max}"></div>
        <div class="fhint">Onaylayan: <b>${App.escapeHtml(oturum.isim)}</b> (oturumdan otomatik)</div>`;
      App.openModal({ title: baslik, body, footer: `<button class="btn" id="ho-cancel">Vazgeç</button><button class="btn btn-green" id="ho-ok">Onayla</button>` });
      document.getElementById('ho-cancel').onclick = App.closeModal;
      document.getElementById('ho-ok').onclick = () => {
        const adet = parseInt(document.getElementById('ho-adet').value) || 0;
        if (adet < 1 || adet > max) { App.toast(`Adet 1-${max} aralığında olmalı`, 'err'); return; }
        App.closeModal(); onOnay(adet);
      };
    };

    // 📁 DOSYALAR: operatör, parçanın teknik resmini/dosyalarını telefonda açar
    main.querySelectorAll('.ho-dosya').forEach(b => b.onclick = () => {
      const is = isler.find(x => x.id === b.dataset.id);
      if (is) QrDosya.linkAc('yarimamul', is.yarimamulId, is.ymKod);
    });
    // 📋 MALZEME ONAYI: operatör reçete malzemelerini onaylar, eksik ekler, kart talebi açar
    main.querySelectorAll('.ho-malzeme').forEach(b => b.onclick = async () => {
      const is = isler.find(x => x.id === b.dataset.id);
      const ymId = b.dataset.ymid || (is && is.yarimamulId) || (is && is.ymId) || '';
      const ymKod = b.dataset.ymkod || (is && is.ymKod) || '';
      const ymAd = b.dataset.ymad || (is && is.ymAd) || '';
      await malzemeOnayModali({ ymId, ymKod, ymAd, operator: oturum.isim }, () => render(main));
    });
    main.querySelectorAll('.ho-kalite').forEach(b => b.onclick = async () => {
      const { tumu, is } = await isiBul(b.dataset.id);
      // ── KONTROL PLANI ────────────────────────────────────────────────
      // Bu parça + istasyon için kontrol planı tanımlıysa, onay vermeden
      // ÖNCE ölçüm listesi çıkar. Tolerans dışı değer girilirse operatör
      // uyarılır ve kalite reddi (uygunsuzluk) yoluna yönlendirilir.
      let planMaddeleri = [];
      try {
        planMaddeleri = await KontrolPlani.maddeleriGetir(is.yarimamulId, is.ymKod, is.istasyonKod);
      } catch (e) { planMaddeleri = []; }

      const kaliteOnayiniAc = () => adetOnay('✓ Kalite Kontrol Yapıldı — ' + is.istasyonKod, (is.gelenAdet - is.fireAdet) - is.kaliteOnayliAdet, async (adet) => {
        is.kaliteOnayliAdet += adet;
        is.kaliteOnaylari.push({ adet, kisi: oturum.isim, tarih: new Date().toISOString().slice(0, 10), zaman: new Date().toISOString() });
        await App.persist(() => Store.istasyonIsleri.save(tumu));
        App.toast('Kalite onayı: ' + adet + ' adet (' + oturum.isim + ')', 'ok');
        render(main);
      });

      if (!planMaddeleri.length) { kaliteOnayiniAc(); return; }

      KontrolPlani.kontrolPenceresiAc(
        '📏 Kontrol Planı — ' + is.istasyonKod,
        planMaddeleri,
        { ymKod: is.ymKod, ymAd: is.ymAd, isId: is.id, istasyonKod: is.istasyonKod,
          hat: is.hat, operator: oturum.isim },
        ({ uygunsuz }) => {
          if (uygunsuz > 0) {
            // Tolerans dışı ölçüm varsa kalite onayı VERİLMEZ. Ölçümler
            // kaydedildi; parça hat sorumlusuna/kaliteye bildirilmelidir.
            App.toast(uygunsuz + ' ölçüm tolerans dışı — kalite onayı verilemez, ölçümler kaydedildi', 'err');
            App.openModal({
              title: '⚠ Tolerans Dışı Ölçüm',
              body: (() => {
                const d = document.createElement('div');
                d.innerHTML = `<div style="font-size:12.5px;line-height:1.6">
                  <b>${App.escapeHtml(is.ymKod)}</b> parçasında <b>${uygunsuz} ölçüm</b>
                  tolerans dışında çıktı. Ölçüm kayıtları sisteme işlendi.<br><br>
                  <b>Yapılacaklar:</b><br>
                  1. Parçayı üretim akışına <b>sokmayın</b>, ayırın.<br>
                  2. Hat sorumlusuna/kaliteye bildirin.<br>
                  3. Kalite biriminde uygunsuzluk (NCR) kaydı açılacaktır.</div>`;
                return d;
              })(),
              footer: '<button class="btn btn-blue" id="tol-tamam">Anladım</button>'
            });
            document.getElementById('tol-tamam').onclick = App.closeModal;
            render(main);
            return;
          }
          App.toast('Tüm kontroller uygun — kalite onayına geçiliyor', 'ok');
          kaliteOnayiniAc();
        }
      );
    });
    // ── KALİTE REDDİ ────────────────────────────────────────────────────
    // Operatör telefondan hatalı parçayı reddeder. Yapılan işlem:
    //   1) İşin fireAdet'i artar → o adet üretim akışından ÇIKAR
    //      (kalite onayı ve sevk tavanları otomatik düşer)
    //   2) İşin içine red kaydı düşülür (kim, ne zaman, kaç adet, sebep)
    //   3) Kaliteye UYGUNSUZLUK (NCR) kaydı açılır — kaynak "Üretim / İstasyon
    //      Reddi". Kalite ekranından DÖF açılabilir, kusur formu alınabilir.
    const RED_SEBEPLERI = [
      'Ölçü hatası', 'Yüzey kusuru / çizik', 'Bantlama hatası', 'Delik hatası',
      'Renk / desen uyumsuzluğu', 'Kırık / çatlak', 'Montaj hatası', 'Diğer'
    ];
    main.querySelectorAll('.ho-red').forEach(b => b.onclick = async () => {
      const { tumu, is } = await isiBul(b.dataset.id);
      const enFazla = (is.gelenAdet - is.fireAdet) - is.kaliteOnayliAdet;
      if (enFazla <= 0) { App.toast('Reddedilebilecek adet kalmadı', 'err'); return; }
      const body = document.createElement('div');
      body.innerHTML = `
        <div style="background:var(--red-bg);border:1px solid var(--red);border-radius:8px;padding:8px 10px;
          font-size:12px;color:var(--red-text);margin-bottom:10px">
          <b>${App.escapeHtml(is.ymKod)}</b> — ${App.escapeHtml(is.ymAd)}<br>
          Reddedilen adet üretim akışından çıkar ve kaliteye uygunsuzluk kaydı açılır.
        </div>
        <div class="fgroup"><label class="flbl">Red Adedi (en fazla ${enFazla})</label>
          <input class="finput" id="hr-adet" type="number" min="1" max="${enFazla}" value="1"></div>
        <div class="fgroup"><label class="flbl">Red Sebebi</label>
          <select class="fselect" id="hr-sebep">
            ${RED_SEBEPLERI.map(x => `<option value="${App.escapeHtml(x)}">${App.escapeHtml(x)}</option>`).join('')}
          </select></div>
        <div class="fgroup"><label class="flbl">Açıklama (isteğe bağlı)</label>
          <input class="finput" id="hr-aciklama" placeholder="örn. 3. delik 2 mm kaymış"></div>
        <div class="fhint">Reddeden: <b>${App.escapeHtml(oturum.isim)}</b> · İstasyon: <b>${App.escapeHtml(is.istasyonKod)}</b></div>`;
      App.openModal({
        title: '✕ Kalite Reddi', body,
        footer: `<button class="btn" id="hr-vaz">Vazgeç</button>
                 <button class="btn" id="hr-ok" style="background:var(--red);color:#fff;border:none">Reddet</button>`
      });
      document.getElementById('hr-vaz').onclick = App.closeModal;
      document.getElementById('hr-ok').onclick = async () => {
        const adet = parseInt(document.getElementById('hr-adet').value) || 0;
        if (adet < 1 || adet > enFazla) { App.toast('Adet 1-' + enFazla + ' aralığında olmalı', 'err'); return; }
        const sebep = document.getElementById('hr-sebep').value;
        const aciklama = (document.getElementById('hr-aciklama').value || '').trim();
        const simdi = new Date();

        is.fireAdet = (is.fireAdet || 0) + adet;
        is.kaliteRedleri = is.kaliteRedleri || [];
        is.kaliteRedleri.push({
          adet, sebep, aciklama, kisi: oturum.isim,
          tarih: simdi.toISOString().slice(0, 10), zaman: simdi.toISOString()
        });

        // Kaliteye uygunsuzluk (NCR) kaydı
        const ncrler = await Store.uygunsuzlukKayitlari.all();
        const yil = simdi.getFullYear();
        const siraNo = ncrler.filter(n => String(n.no || '').indexOf('NCR-' + yil) === 0).length + 1;
        ncrler.push({
          id: App.uid('NCR'), no: 'NCR-' + yil + '-' + String(siraNo).padStart(3, '0'),
          kaynak: 'uretim_istasyon',
          kod: is.ymKod, ad: is.ymAd,
          miktar: adet, birim: 'ADET',
          sorumluBirim: 'kalite',
          aciklama: sebep + (aciklama ? ' — ' + aciklama : '') +
                    ' · Hat: ' + (is.hat || '—') + ' · İstasyon: ' + is.istasyonKod +
                    ' · Reddeden: ' + oturum.isim,
          fotograflar: [], durum: 'acik', dofId: null,
          isEmriId: is.id, istasyonKod: is.istasyonKod, hat: is.hat || '',
          olusturmaTarihi: simdi.toISOString().slice(0, 10)
        });

        await App.persist(async () => {
          await Store.istasyonIsleri.save(tumu);
          await Store.uygunsuzlukKayitlari.save(ncrler);
        });
        App.closeModal();
        App.toast('✕ ' + adet + ' adet reddedildi — kaliteye uygunsuzluk kaydı açıldı', 'err');
        render(main);
      };
    });

    main.querySelectorAll('.ho-islem').forEach(b => b.onclick = async () => {
      const { tumu, is } = await isiBul(b.dataset.id);
      adetOnay('⚙ İşlem Tamamlandı — ' + is.istasyonKod, is.kaliteOnayliAdet - is.islemTamamAdet, async (adet) => {
        is.islemTamamAdet += adet;
        is.islemOnaylari.push({ adet, kisi: oturum.isim, tarih: new Date().toISOString().slice(0, 10), zaman: new Date().toISOString() });
        await App.persist(() => Store.istasyonIsleri.save(tumu));
        App.toast('İşlem tamamlandı: ' + adet + ' adet', 'ok');
        render(main);
      });
    });
    main.querySelectorAll('.ho-sevk').forEach(b => b.onclick = async () => {
      const { tumu, is } = await isiBul(b.dataset.id);
      const rota = rotalar.find(r => r.id === is.rotaId);
      const steps = rota ? (rota.steps || []) : [];
      let sonrakiIndex = is.stepIndex + 1;
      while (steps[sonrakiIndex] && steps[sonrakiIndex].hat === 'TAŞIMA') sonrakiIndex++;
      const sonraki = steps[sonrakiIndex] || null;
      adetOnay('➜ Sonraki İstasyona Sevk — hedef: ' + (sonraki ? sonraki.kod : 'HAT SONU'), is.islemTamamAdet - is.sevkEdilenAdet, async (adet) => {
        is.sevkEdilenAdet += adet;
        is.sevkler.push({ adet, kisi: oturum.isim, tarih: new Date().toISOString().slice(0, 10), zaman: new Date().toISOString(), hedef: sonraki ? sonraki.kod : 'HAT SONU' });
        if (sonraki) {
          let hedefIs = tumu.find(x => x.kaynakTip === is.kaynakTip && x.kaynakId === is.kaynakId && x.yarimamulId === is.yarimamulId && x.stepIndex === sonrakiIndex);
          if (hedefIs) { hedefIs.gelenAdet += adet; hedefIs.durum = 'aktif'; }
          else {
            tumu.push({
              id: App.uid('IST'), kaynakTip: is.kaynakTip, kaynakId: is.kaynakId, kaynakKod: is.kaynakKod, kaynakEtiket: is.kaynakEtiket,
              yarimamulId: is.yarimamulId, ymKod: is.ymKod, ymAd: is.ymAd,
              rotaId: is.rotaId, rotaAd: is.rotaAd, stepIndex: sonrakiIndex,
              istasyonKod: sonraki.kod, istasyonTanim: sonraki.tanim, hat: sonraki.hat || 'GENEL',
              gelenAdet: adet, kaliteOnayliAdet: 0, islemTamamAdet: 0, sevkEdilenAdet: 0, fireAdet: 0,
              kaliteOnaylari: [], islemOnaylari: [], sevkler: [], redler: [],
              barkodOkundu: false, durum: 'aktif', olusturmaTarihi: new Date().toISOString().slice(0, 10)
            });
          }
        }
        if (is.sevkEdilenAdet >= is.gelenAdet - is.fireAdet) {
          is.durum = 'tamamlandi';
          is.bitisZamani = new Date().toISOString();
          if (is.barkodZamani) {
            const dk = Math.max(0, (new Date(is.bitisZamani) - new Date(is.barkodZamani)) / 60000);
            const sureler = await Store.gerceklesenSureKayitlari.all();
            sureler.push({
              id: App.uid('GSK'), ymId: is.yarimamulId, ymKod: is.ymKod, ymAd: is.ymAd,
              istasyonKod: is.istasyonKod, istasyonTanim: is.istasyonTanim, hat: is.hat,
              kaynakTip: is.kaynakTip, kaynakKod: is.kaynakKod,
              adet: is.gelenAdet - is.fireAdet, dk: Math.round(dk * 10) / 10,
              birimDk: (is.gelenAdet - is.fireAdet) > 0 ? Math.round(dk / (is.gelenAdet - is.fireAdet) * 10) / 10 : 0,
              tarih: new Date().toISOString().slice(0, 10)
            });
            await Store.gerceklesenSureKayitlari.save(sureler);
          }
        }
        await App.persist(() => Store.istasyonIsleri.save(tumu));
        App.toast(adet + ' adet ' + (sonraki ? sonraki.kod + ' istasyonuna sevk edildi' : 'HAT SONU') + ' (Sevk: ' + oturum.isim + ')', 'ok');
        render(main);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MALZEME ONAY MODALI — operatör tarafı (Katman C)
  // Reçete malzemelerini listeler + onaylatır; eksik malzeme (hammadde ara-seç)
  // ve kart açma talebi (serbest metin) ekler. Talepler ReceteTalep modülüne
  // gider → Planlama → ARGE/Teknik onay zinciri.
  // ══════════════════════════════════════════════════════════════════════════
  async function malzemeOnayModali({ ymId, ymKod, ymAd, operator }, yenile) {
    if (typeof ReceteTalep === 'undefined') {
      App.toast('Reçete talep modülü yüklenemedi.', 'err'); return;
    }
    // Hat verisi zaten süzülmüş halde geldiyse onu kullan — 51 MB'lık reçete
    // koleksiyonunu yeniden indirme.
    let receteler, hammaddeler, mevcutTalepler, yarimamuller;
    if (_hatOnbellek) {
      receteler = _hatOnbellek.receteler || [];
      hammaddeler = _hatOnbellek.hammaddeler || [];
      mevcutTalepler = _hatOnbellek.receteTalepleri || [];
      yarimamuller = _hatOnbellek.yarimamuller || [];
    } else {
      [receteler, hammaddeler, mevcutTalepler, yarimamuller] = await Promise.all([
        Store.receteler.all(), Store.hammaddeler.all(), Store.receteTalepleri.all(), Store.yarimamuller.all()
      ]);
    }
    const recete = receteler.find(r => r.yarimamulId === ymId);
    const kalemler = (recete && recete.kalemler) ? recete.kalemler : [];
    // Bu yarı mamul için bekleyen/işlenen talepler
    const buYmTalepleri = mevcutTalepler.filter(t => t.ymId === ymId);

    const hmAdi = (kalem) => {
      // Reçete kalemi hammadde VEYA yarı mamul olabilir (tip alanına göre).
      const refId = kalem.refId;
      let kayit = hammaddeler.find(x => x.id === refId);
      if (!kayit) kayit = yarimamuller.find(x => x.id === refId);
      // Bazı reçetelerde refId doğrudan stok kodu olabilir
      if (!kayit) kayit = hammaddeler.find(x => x.stokKodu === refId);
      if (kayit) return kayit.ad + (kayit.stokKodu ? ' (' + kayit.stokKodu + ')' : '');
      // Kalem kendi adını taşıyorsa onu kullan
      return kalem.refAd || kalem.ad || refId;
    };

    // Reçete malzeme listesi (onay kutulu)
    const kalemSatir = kalemler.length ? kalemler.map((k, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--border);font-size:12.5px">
        <input type="checkbox" class="mo-onay" data-i="${i}" style="width:17px;height:17px;flex-shrink:0">
        <span style="flex:1;min-width:0">${App.escapeHtml(hmAdi(k))}<br>
          <span class="muted" style="font-size:10.5px">reçete: ${k.miktar} ${App.escapeHtml(k.birim || '')}${k.kaynak === 'hat_talebi' ? ' · <span style="color:#7c5cff">hattan eklendi</span>' : ''}</span></span>
        <input type="number" step="0.001" min="0" class="mo-miktar-duzelt" data-kalemid="${App.escapeHtml(k.id || '')}" data-kalemidx="${i}"
          data-eski="${k.miktar}" data-hmid="${App.escapeHtml(k.refId || '')}" data-hmad="${App.escapeHtml(hmAdi(k))}"
          data-birim="${App.escapeHtml(k.birim || '')}" placeholder="${k.miktar}"
          title="Fiilen kullandığınız miktar farklıysa buraya yazın"
          style="width:72px;padding:5px;border:1px solid var(--border);border-radius:6px;font-size:12px;flex-shrink:0">
      </div>`).join('') : '<div class="muted" style="padding:10px;font-size:12px">Bu yarı mamulün reçetesinde tanımlı malzeme yok. Kullandığınız malzemeleri aşağıdan ekleyin.</div>';

    const bekleyenSatir = buYmTalepleri.length ? `
      <div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border)">
        <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px">BU PARÇA İÇİN GÖNDERDİĞİNİZ TALEPLER</div>
        ${buYmTalepleri.slice(-8).map(t => {
          const durumRenk = t.durum === 'receteye_islendi' ? 'pill-green' : t.durum === 'reddedildi' ? 'pill-red' : 'pill-amber';
          const durumAd = { planlama_bekliyor: 'Planlama bekliyor', arge_teknik_bekliyor: 'ARGE/Teknik bekliyor', receteye_islendi: 'Reçeteye işlendi', reddedildi: 'Reddedildi' }[t.durum] || t.durum;
          const ad = t.tip === 'kart_talebi'
            ? ('🆕 ' + App.escapeHtml(t.kartAciklama || ''))
            : t.tip === 'miktar_duzeltme'
            ? (App.escapeHtml(t.hammaddeAd || '') + ' — miktar: ' + t.eskiMiktar + ' → ' + t.miktar + ' ' + App.escapeHtml(t.birim || ''))
            : (App.escapeHtml(t.hammaddeAd || '') + ' — ' + t.miktar + ' ' + App.escapeHtml(t.birim || ''));
          const geriCek = (t.durum === 'planlama_bekliyor' && t.operator === operator)
            ? `<button class="mo-geri" data-id="${t.id}" style="background:none;border:none;color:var(--red-text);cursor:pointer;font-size:11px">geri çek</button>` : '';
          return `<div style="font-size:11px;padding:4px 0;display:flex;justify-content:space-between;align-items:center;gap:6px">
            <span>${ad} <span class="pill ${durumRenk}" style="font-size:9px">${durumAd}</span></span>${geriCek}</div>`;
        }).join('')}
      </div>` : '';

    const body = `
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
        Yarı Mamul: <b class="mono">${App.escapeHtml(ymKod)}</b> — ${App.escapeHtml(ymAd)}<br>
        Kullandığınız reçete malzemelerini işaretleyin. <b>Fiilen kullandığınız miktar farklıysa</b> sağdaki kutuya yazın. Reçetede olmayan bir malzeme kullandıysanız aşağıdan ekleyin.
      </div>

      <div style="font-weight:600;font-size:12.5px;margin:6px 0 2px">📋 Reçete Malzemeleri <span class="muted" style="font-weight:400;font-size:10.5px">(sağdaki kutu: fiili miktar)</span></div>
      <div style="max-height:180px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:2px 8px">${kalemSatir}</div>
      ${bekleyenSatir}

      <div style="font-weight:600;font-size:12.5px;margin:14px 0 4px">➕ Reçetede Olmayan Malzeme Ekle</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Aşağıya tıklayın, açılan hammadde kartlarından seçin.</div>
      <div style="position:relative">
        <input id="mo-hm" placeholder="🔍 Hammadde kartı seç / ara..." autocomplete="off" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:7px;font-size:12.5px;cursor:pointer">
        <div id="mo-hmpanel" style="display:none;position:absolute;z-index:50;left:0;right:0;top:calc(100% + 2px);max-height:220px;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18)"></div>
      </div>
      <input type="hidden" id="mo-hm-secili-id">
      <div style="display:flex;gap:6px;margin-top:6px;align-items:flex-end">
        <input id="mo-miktar" type="number" step="0.001" min="0" placeholder="Miktar" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:7px;font-size:12.5px">
        <input id="mo-birim" placeholder="birim" style="width:80px;padding:8px;border:1px solid var(--border);border-radius:7px;font-size:12.5px">
        <button class="btn btn-sm btn-blue" id="mo-ekle">Ekle</button>
      </div>
      <div id="mo-eklenen" style="margin-top:6px"></div>

      <div style="font-weight:600;font-size:12.5px;margin:14px 0 4px">🆕 Listede Yok — Malzeme Kartı Açma Talebi</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Kullandığınız malzeme hammadde listesinde yoksa, tanımını yazın (marka, ölçü, tür). Teknik ofis kartını açacak.</div>
      <textarea id="mo-kart" rows="2" placeholder="Örn: 3M şeffaf çift taraflı montaj bandı, 12mm, rulo" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:7px;font-size:12.5px;resize:vertical"></textarea>
      <div class="muted" style="font-size:10.5px;margin-top:3px">Yazdığınız tanım, aşağıdaki <b>"Onayı ve Talepleri Gönder"</b> ile birlikte gönderilir.</div>
    `;

    const footer = `<button class="btn" id="mo-kapat">Kapat</button>
      <button class="btn btn-green" id="mo-gonder">Onayı ve Talepleri Gönder</button>`;

    App.openModal({ title: '📋 Malzeme Onayı — ' + ymKod, body, footer });

    // Tıklanınca açılan aranabilir hammadde seçici (datalist yerine — mobilde güvenilir)
    const hmInput = document.getElementById('mo-hm');
    const hmPanel = document.getElementById('mo-hmpanel');
    const hmSecId = document.getElementById('mo-hm-secili-id');
    const hmListeCiz = (filtre) => {
      const f = (filtre || '').toLocaleLowerCase('tr');
      const liste = hammaddeler.filter(h =>
        !f || (h.ad || '').toLocaleLowerCase('tr').includes(f) || (h.stokKodu || '').toLocaleLowerCase('tr').includes(f)
      ).slice(0, 100);
      hmPanel.innerHTML = liste.length ? liste.map(h =>
        `<div class="mo-hmsec" data-id="${h.id}" data-ad="${App.escapeHtml(h.ad)}" data-birim="${App.escapeHtml(h.birim || '')}"
          style="padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;font-size:12.5px">
          <b>${App.escapeHtml(h.ad)}</b>${h.stokKodu ? ` <span class="muted mono" style="font-size:10.5px">${App.escapeHtml(h.stokKodu)}</span>` : ''}
          <span class="muted" style="font-size:10px"> · ${App.escapeHtml(h.birim || '')}</span></div>`
      ).join('') : '<div style="padding:10px;font-size:12px;color:var(--muted)">Eşleşen hammadde yok.</div>';
      hmPanel.querySelectorAll('.mo-hmsec').forEach(s => s.onclick = () => {
        hmInput.value = s.dataset.ad;
        hmSecId.value = s.dataset.id;
        if (s.dataset.birim && !document.getElementById('mo-birim').value)
          document.getElementById('mo-birim').value = s.dataset.birim;
        hmPanel.style.display = 'none';
      });
    };
    hmInput.onfocus = () => { hmListeCiz(hmInput.value); hmPanel.style.display = 'block'; };
    hmInput.oninput = () => { hmSecId.value = ''; hmListeCiz(hmInput.value); hmPanel.style.display = 'block'; };
    document.addEventListener('click', (e) => {
      if (hmPanel && !hmPanel.contains(e.target) && e.target !== hmInput) hmPanel.style.display = 'none';
    });

    // Oturumdaki eklenen eksik malzemeler (gönderilince topluca işlenir)
    const eklenenler = [];
    const eklenenGoster = () => {
      document.getElementById('mo-eklenen').innerHTML = eklenenler.map((e, i) =>
        `<div style="font-size:11.5px;padding:3px 6px;background:var(--surface2);border-radius:6px;margin-bottom:3px;display:flex;justify-content:space-between">
          <span>➕ ${App.escapeHtml(e.hammaddeAd)} — ${e.miktar} ${App.escapeHtml(e.birim)}</span>
          <span class="mo-sil" data-i="${i}" style="cursor:pointer;color:var(--red-text)">✕</span></div>`).join('');
      document.querySelectorAll('.mo-sil').forEach(s => s.onclick = () => { eklenenler.splice(+s.dataset.i, 1); eklenenGoster(); });
    };

    document.getElementById('mo-ekle').onclick = () => {
      const hammaddeId = hmSecId.value;
      const miktar = parseFloat(document.getElementById('mo-miktar').value);
      const birim = document.getElementById('mo-birim').value.trim() || 'adet';
      if (!hammaddeId) { App.toast('Listeden bir hammadde seçin.', 'err'); return; }
      if (!miktar || miktar <= 0) { App.toast('Geçerli miktar girin.', 'err'); return; }
      const h = hammaddeler.find(x => x.id === hammaddeId);
      eklenenler.push({ hammaddeId, hammaddeAd: h ? h.ad : hmInput.value, miktar, birim });
      hmInput.value = ''; hmSecId.value = '';
      document.getElementById('mo-miktar').value = ''; document.getElementById('mo-birim').value = '';
      eklenenGoster();
    };

    

    document.getElementById('mo-kapat').onclick = App.closeModal;

    // Bekleyen talebi geri çek (operatör kendi talebini)
    document.querySelectorAll('.mo-geri').forEach(g => g.onclick = async () => {
      const r = await ReceteTalep.talepGeriCek(g.dataset.id, operator);
      if (r.ok) {
        App.toast('Talep geri çekildi.', 'ok');
        App.closeModal();
        await malzemeOnayModali({ ymId, ymKod, ymAd, operator }, yenile);  // tekrar aç (güncel liste)
      } else App.toast(r.hata, 'err');
    });
    document.getElementById('mo-gonder').onclick = async () => {
      let gonderilen = 0, miktarDuzeltme = 0, hatalar = [];

      // 1) Miktar düzeltmeleri (operatör reçete miktarını değiştirdiyse)
      for (const inp of document.querySelectorAll('.mo-miktar-duzelt')) {
        const yeni = parseFloat(inp.value);
        const eski = parseFloat(inp.dataset.eski);
        if (!yeni || yeni <= 0 || yeni === eski) continue;   // boş veya değişmemiş → atla
        const r = await ReceteTalep.miktarDuzeltmeTalep({
          ymId, ymKod, ymAd,
          receteKalemId: inp.dataset.kalemid,
          receteKalemIndex: parseInt(inp.dataset.kalemidx),
          hammaddeId: inp.dataset.hmid, hammaddeAd: inp.dataset.hmad,
          eskiMiktar: eski, miktar: yeni, birim: inp.dataset.birim,
          gerekce: 'Hat operatörü: fiili kullanım miktarı reçeteden farklı', operator
        });
        if (r.ok) miktarDuzeltme++; else hatalar.push(r.hata);
      }

      // 2) Eklenen eksik malzemeler
      for (const e of eklenenler) {
        const r = await ReceteTalep.eksikMalzemeTalep({
          ymId, ymKod, ymAd, hammaddeId: e.hammaddeId, hammaddeAd: e.hammaddeAd,
          miktar: e.miktar, birim: e.birim, gerekce: 'Hat operatörü: reçete dışı kullanılan malzeme', operator
        });
        if (r.ok) gonderilen++; else hatalar.push(r.hata);
      }

      // 3) Kart açma talebi (yazılmışsa) — ayrı butona gerek yok, hepsi birlikte gider
      let kartTalebi = 0;
      const kartAciklama = (document.getElementById('mo-kart').value || '').trim();
      if (kartAciklama) {
        const rk = await ReceteTalep.kartTalep({
          ymId, ymKod, ymAd, kartAciklama,
          gerekce: 'Hat operatörü: sistemde kartı olmayan malzeme kullanıldı', operator
        });
        if (rk.ok) kartTalebi++; else hatalar.push(rk.hata);
      }

      const onayliSayi = document.querySelectorAll('.mo-onay:checked').length;
      App.closeModal();
      const parcalar = [`${onayliSayi} malzeme onaylandı`];
      if (kartTalebi) parcalar.push('1 kart açma talebi');
      if (miktarDuzeltme) parcalar.push(`${miktarDuzeltme} miktar düzeltmesi`);
      if (gonderilen) parcalar.push(`${gonderilen} eksik malzeme talebi`);
      const mesaj = parcalar.join(', ') + ((miktarDuzeltme || gonderilen || kartTalebi) ? ' → planlama onayına gönderildi.' : '.');
      App.toast(mesaj, hatalar.length ? 'err' : 'ok');
      if (hatalar.length) App.toast('Bazı talepler gönderilemedi: ' + hatalar[0], 'err');
      if (yenile) yenile();
    };
  }

  return { render };
})();
