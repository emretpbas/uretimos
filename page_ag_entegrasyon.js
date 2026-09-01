// ════════════════════════════════════════════════════════════════════════════
// ERP ENTEGRASYON MERKEZİ — sınırsız sayıda bağlantı profili
// Bağlantı ayarı · alan eşleme · önizleme · içe/dışa aktarım
// ════════════════════════════════════════════════════════════════════════════
PageModules.ag_entegrasyon = (() => {

  let aktifProfilId = null;
  let _kesif = {};          // profilId -> AgEntegrasyon.ornekAlanlar sonucu
  let _onizleme = null;     // içe aktarım önizlemesi: { profilId, kayitlar, hatalar, fark }
  let _disaOnizleme = null; // dışa aktarım listesi: { profilId, kayitlar }

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'teklif_siparis', 'satis', 'cari', 'uretim_planlama'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Entegrasyon merkezi Yönetim, Sipariş, Cari ve Planlama rollerine açıktır.</div></div></div>`;
      return;
    }
    const a = AgEntegrasyon.ayarOku();
    if (!aktifProfilId || !a.profiller.some(p => p.id === aktifProfilId)) {
      aktifProfilId = a.profiller.length ? a.profiller[0].id : null;
    }
    const profil = a.profiller.find(p => p.id === aktifProfilId) || null;

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">🔗 ERP Entegrasyon Merkezi</div>
          <div class="page-sub">Logo, Mikro, Netsis, Nebim, Zirve, Vega vb. ERP/muhasebe sistemleriyle şirket içi ağdan çift yönlü veri alışverişi</div></div>
        <div class="page-acts">
          <button class="btn" id="ae-sartname">📄 Bilgi İşlem Şartnamesi</button>
          <button class="btn btn-blue" id="ae-yeni-profil">+ Yeni Bağlantı Profili</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;padding:10px 14px">
        <div style="font-size:12px;color:var(--muted)">
          <b>Nasıl çalışır:</b> Bilgi işlem bir uç nokta (adres) hazırlar; siz aşağıya girip
          "Bağlantıyı Test Et" dersiniz — karşı sistemin alan adları otomatik <b>keşfedilir</b>,
          eşlemeyi listeden seçersiniz. <b>Alan adları sabit değildir</b> — Logo, Mikro, Netsis
          veya farklı bir sistem olsun, JSON döndüren her uç nokta bu şekilde bağlanabilir.<br>
          <b>İçe aktarım:</b> veri önce önizlenir, siz onaylamadan ÜretimOS'a işlenmez.<br>
          <b>Dışa aktarım:</b> ÜretimOS kayıtlarını seçip payload'ı önizledikten sonra karşı
          sisteme gönderirsiniz — bu, karşı sistemde kalıcı bir etki yaratır.<br>
          <b>Kapsam:</b> Bağlantılar yalnızca şirket içi ağdaki (*.local) veya bu sitenin kendi
          adresine ulaşabilir (güvenlik politikası). Bulut tabanlı bir ERP için yerel ağınıza
          bir proxy/köprü kurmanız gerekir.
        </div>
      </div>

      ${a.profiller.length ? `<div class="tabs" style="margin-bottom:12px;flex-wrap:wrap">
        ${a.profiller.map(p => `<div class="tab ${p.id === aktifProfilId ? 'active' : ''}" data-p="${p.id}">
          ${p.yon === 'disa' ? '📤' : '📥'} ${App.escapeHtml(p.ad)}
          <span class="pill ${p.yon === 'disa' ? 'pill-amber' : 'pill-blue'}" style="font-size:8px">${App.escapeHtml(AgEntegrasyon.HEDEF_ALANLAR[p.hedefTip].ad)}</span>
          ${a.sonSenkron[p.id] ? '<span class="pill pill-green" style="font-size:8px">bağlı</span>' : ''}
        </div>`).join('')}
      </div>` : `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Henüz bağlantı profili yok</div>
        <div class="edesc">"+ Yeni Bağlantı Profili" ile Logo, Mikro, Netsis veya başka bir
        sistemden veri okuyacak/yazacak bir bağlantı tanımlayın.</div></div></div>`}
      <div id="ae-icerik"></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => {
      aktifProfilId = t.dataset.p; _onizleme = null; _disaOnizleme = null; render(main);
    });
    document.getElementById('ae-sartname').onclick = () => sartnameGoster(profil);
    document.getElementById('ae-yeni-profil').onclick = () => yeniProfilModal(main);

    if (profil) bolumCiz(document.getElementById('ae-icerik'), a, profil, main);
  }

  // ── YENİ PROFİL ──────────────────────────────────────────────────────────
  function yeniProfilModal(main) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Profil adı</label>
        <input class="finput" id="np-ad" placeholder="örn. Logo Tiger — Sipariş"></div>
      <div class="fgroup"><label class="flbl">Hedef veri tipi</label>
        <select class="fselect" id="np-hedef">
          ${AgEntegrasyon.HEDEF_TIPLERI.map(t => `<option value="${t}">${App.escapeHtml(AgEntegrasyon.HEDEF_ALANLAR[t].ad)}</option>`).join('')}
        </select></div>
      <div class="fgroup"><label class="flbl">Yön</label>
        <select class="fselect" id="np-yon">
          <option value="ice">📥 İçe Aktarım (karşı sistemden OKU)</option>
          <option value="disa">📤 Dışa Aktarım (karşı sisteme YAZ)</option>
        </select></div>`;
    App.openModal({
      title: '+ Yeni Bağlantı Profili', body,
      footer: `<button class="btn" id="np-vaz">Vazgeç</button><button class="btn btn-blue" id="np-olustur">Oluştur</button>`
    });
    document.getElementById('np-vaz').onclick = App.closeModal;
    document.getElementById('np-olustur').onclick = () => {
      const ad = document.getElementById('np-ad').value.trim();
      const hedef = document.getElementById('np-hedef').value;
      const yon = document.getElementById('np-yon').value;
      const a = AgEntegrasyon.ayarOku();
      const p = AgEntegrasyon.yeniProfil(hedef, ad || undefined);
      p.yon = yon;
      if (yon === 'disa') p.yontem = 'POST';
      a.profiller.push(p);
      AgEntegrasyon.ayarYaz(a);
      aktifProfilId = p.id;
      App.closeModal();
      render(main);
    };
  }

  function profilSil(a, profil, main) {
    App.confirmDialog(
      `"${App.escapeHtml(profil.ad)}" profili silinsin mi?<br><br>Bu işlem yalnızca bağlantı ayarını siler — ÜretimOS'a daha önce aktarılmış veriler etkilenmez.`,
      () => {
        a.profiller = a.profiller.filter(p => p.id !== profil.id);
        delete a.sonSenkron[profil.id];
        AgEntegrasyon.ayarYaz(a);
        aktifProfilId = null;
        App.toast('Profil silindi.', 'ok');
        render(main);
      });
  }

  // ── HANGİ STORE KOLEKSİYONU HANGİ HEDEF TİPİNE KARŞILIK GELİR ────────────
  // urun_stok/cari kartlarında "kod" alanı her zaman yoktur (müşteri
  // kartlarında id kullanılır) — farkCikar'ın kod eşleştirmesi çalışsın diye
  // sentetik bir "kod" alanı ekleniyor (stokKodu/vergiNo/id sırasıyla).
  async function mevcutKayitlariGetir(hedefTip) {
    if (hedefTip === 'siparis') return Store.siparisler.all();
    if (hedefTip === 'recete') return Store.urunler.all();
    if (hedefTip === 'urun_stok') {
      const l = await Store.hammaddeler.all();
      return l.map(h => Object.assign({}, h, { kod: h.stokKodu || h.kod || h.id }));
    }
    if (hedefTip === 'cari') {
      const l = await Store.musteriler.all();
      return l.map(m => Object.assign({}, m, { kod: m.kod || m.vergiNo || m.id }));
    }
    return [];
  }

  // ── PROFİL BÖLÜMÜ ────────────────────────────────────────────────────────
  function bolumCiz(el, a, profil, main) {
    const tanim = AgEntegrasyon.HEDEF_ALANLAR[profil.hedefTip];
    const kesif = _kesif[profil.id];
    const alanlar = (kesif && kesif.alanlar) || [];
    const secim = (deger, id) => `<select class="fselect ae-esle" data-k="${id}" style="font-size:11.5px;padding:3px">
        <option value="">— seçin —</option>
        ${alanlar.map(f => `<option value="${App.escapeHtml(f)}" ${deger === f ? 'selected' : ''}>${App.escapeHtml(f)}</option>`).join('')}
        ${deger && !alanlar.includes(deger) ? `<option value="${App.escapeHtml(deger)}" selected>${App.escapeHtml(deger)} (kayıtlı)</option>` : ''}
      </select>`;
    const disaMi = profil.yon === 'disa';

    el.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Profil</div>
          <button class="btn btn-sm btn-ghost" id="ae-profil-sil" style="color:var(--red-text)">🗑 Profili Sil</button></div>
        <div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">Profil adı</label>
            <input class="finput" id="ae-ad" value="${App.escapeHtml(profil.ad)}"></div>
          <div class="fgroup"><label class="flbl">Yön</label>
            <select class="fselect" id="ae-yon">
              <option value="ice" ${!disaMi ? 'selected' : ''}>📥 İçe Aktarım (oku)</option>
              <option value="disa" ${disaMi ? 'selected' : ''}>📤 Dışa Aktarım (yaz)</option>
            </select></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">1️⃣ Bağlantı</div></div>
        <div class="frow">
          <div class="fgroup" style="flex:3"><label class="flbl">Adres (uç nokta) *</label>
            <input class="finput" id="ae-url" value="${App.escapeHtml(profil.url)}"
              placeholder="http://sunucu.sirket.local/api/..."></div>
          <div class="fgroup"><label class="flbl">Yöntem</label>
            <select class="fselect" id="ae-yontem">
              ${disaMi
                ? `<option value="POST" ${profil.yontem !== 'PUT' ? 'selected' : ''}>POST</option>
                   <option value="PUT" ${profil.yontem === 'PUT' ? 'selected' : ''}>PUT</option>`
                : `<option value="GET" ${profil.yontem !== 'POST' ? 'selected' : ''}>GET</option>
                   <option value="POST" ${profil.yontem === 'POST' ? 'selected' : ''}>POST</option>`}
            </select></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Kimlik Doğrulama</label>
            <select class="fselect" id="ae-kimliktipi">
              <option value="yok" ${profil.kimlikTipi === 'yok' ? 'selected' : ''}>Yok (açık uç nokta)</option>
              <option value="baslik" ${profil.kimlikTipi === 'baslik' ? 'selected' : ''}>API Anahtarı (başlık)</option>
              <option value="bearer" ${profil.kimlikTipi === 'bearer' ? 'selected' : ''}>Bearer Token</option>
              <option value="basic" ${profil.kimlikTipi === 'basic' ? 'selected' : ''}>Basic (kullanıcı:şifre)</option>
            </select></div>
          <div class="fgroup"><label class="flbl">Başlık Adı</label>
            <input class="finput" id="ae-baslikadi" value="${App.escapeHtml(profil.basligAdi || 'X-API-Key')}"></div>
          <div class="fgroup" style="flex:2"><label class="flbl">Anahtar / Token</label>
            <input class="finput" id="ae-kimlik" type="password" value="${App.escapeHtml(profil.kimlik)}"
              placeholder="bilgi işlemden alınacak"></div>
        </div>
        <div class="fhint">Kimlik bilgisi <b>yalnızca bu bilgisayarda</b> saklanır, ÜretimOS sunucusuna gönderilmez.</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          ${!disaMi ? `<button class="btn btn-blue" id="ae-test">🔌 Bağlantıyı Test Et</button>` : ''}
          <button class="btn" id="ae-kaydet">💾 Ayarları Kaydet</button>
        </div>
        <div id="ae-test-sonuc" style="margin-top:8px"></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">2️⃣ Alan Eşleme</div></div>
        ${!disaMi ? `
        <div class="fhint" style="margin-bottom:8px">
          ${alanlar.length ? `Bağlantı testinde <b>${alanlar.length} alan</b> bulundu — listeden eşleyin.`
            : 'Önce "Bağlantıyı Test Et" deyin; gelen alanlar burada listelenir.'}
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Kök alan (dizi nerede?)</label>
            <input class="finput" id="ae-kokalan" value="${App.escapeHtml(profil.kokAlan || '')}"
              placeholder="örn. data.orders — yanıt doğrudan diziyse boş bırakın"></div>
        </div>
        <table class="dtable" style="margin-top:6px">
          <tr><th style="width:200px">ÜretimOS alanı</th><th>Karşı sistemdeki alan</th></tr>
          ${tanim.anaAlanlar.map(([k, ad]) => `<tr><td style="font-size:11.5px">${App.escapeHtml(ad)}</td>
            <td>${secim(profil.eslesme[k], 'e:' + k)}</td></tr>`).join('')}
        </table>
        ${tanim.kalemAlanlar.length ? `
        <div style="font-size:12px;font-weight:600;margin:10px 0 4px">
          ${App.escapeHtml(tanim.ad)} kalemi alanları
          <span class="muted" style="font-weight:400;font-size:11px">— satır dizisinin içindeki alan adları</span></div>
        <table class="dtable">
          <tr><th style="width:200px">ÜretimOS alanı</th><th>Karşı sistemdeki alan</th></tr>
          ${tanim.kalemAlanlar.map(([k, ad]) => `<tr><td style="font-size:11.5px">${App.escapeHtml(ad)}</td>
            <td><input class="finput ae-kesle" data-k="${k}" value="${App.escapeHtml(profil.kalemEslesme[k] || '')}"
              style="font-size:11.5px;padding:3px" placeholder="alan adı"></td></tr>`).join('')}
        </table>` : ''}` : `
        <div class="fhint" style="margin-bottom:8px">ÜretimOS alanını, karşı sistemin JSON'da beklediği alan adına eşleyin — bu, gönderilecek payload'ın anahtarlarını belirler.</div>
        <table class="dtable">
          <tr><th style="width:200px">ÜretimOS alanı</th><th>Karşı sistemdeki JSON alan adı</th></tr>
          ${tanim.anaAlanlar.filter(([k]) => k !== 'kalemler').map(([k, ad]) => `<tr><td style="font-size:11.5px">${App.escapeHtml(ad)}</td>
            <td><input class="finput ae-desle" data-k="${k}" value="${App.escapeHtml(profil.disaEslesme[k] || '')}"
              style="font-size:11.5px;padding:3px" placeholder="alan adı"></td></tr>`).join('')}
        </table>`}
      </div>

      ${!disaMi ? `
      <div class="card">
        <div class="card-hdr"><div class="card-title">3️⃣ Veri Aktarımı</div>
          <button class="btn btn-sm btn-green" id="ae-cek">⬇ Verileri Çek ve Önizle</button></div>
        ${a.sonSenkron[profil.id] ? `<div class="fhint">Son aktarım: ${new Date(a.sonSenkron[profil.id]).toLocaleString('tr')}</div>` : ''}
        <div id="ae-onizleme" style="margin-top:8px"></div>
      </div>` : `
      <div class="card">
        <div class="card-hdr"><div class="card-title">3️⃣ Dışa Gönderilecek Kayıtlar</div></div>
        <div style="border:1.5px solid var(--amber);background:var(--amber-bg);border-radius:8px;padding:8px 10px;font-size:11.5px;color:var(--amber-text);margin-bottom:8px">
          ⚠ <b>Dışa aktarım karşı sisteme YAZAR</b> — ÜretimOS gönderdikten sonra karşı sistemde ne
          olacağını kontrol edemez. Göndermeden önce payload'ı önizleyin.
        </div>
        <button class="btn btn-sm btn-blue" id="ae-disa-yukle">${App.escapeHtml(tanim.ad)} Kayıtlarını Listele</button>
        ${a.sonSenkron[profil.id] ? `<div class="fhint" style="margin-top:6px">Son gönderim: ${new Date(a.sonSenkron[profil.id]).toLocaleString('tr')}</div>` : ''}
        <div id="ae-disa-onizleme" style="margin-top:8px"></div>
      </div>`}`;

    document.getElementById('ae-profil-sil').onclick = () => profilSil(a, profil, main);
    document.getElementById('ae-yon').onchange = () => {
      formdanProfilGuncelle(profil);
      if (profil.yon === 'disa' && profil.yontem === 'GET') profil.yontem = 'POST';
      AgEntegrasyon.ayarYaz(a);
      render(main);
    };
    const testBtn = document.getElementById('ae-test');
    if (testBtn) testBtn.onclick = () => baglantiTest(a, profil, main);
    document.getElementById('ae-kaydet').onclick = () => {
      formdanProfilGuncelle(profil);
      if (!AgEntegrasyon.ayarYaz(a)) { App.toast('Ayarlar kaydedilemedi (depolama dolu olabilir).', 'err'); return; }
      App.toast('Ayarlar kaydedildi.', 'ok');
    };
    const cekBtn = document.getElementById('ae-cek');
    if (cekBtn) cekBtn.onclick = () => veriCek(a, profil, main);
    const disaBtn = document.getElementById('ae-disa-yukle');
    if (disaBtn) disaBtn.onclick = () => disaListele(profil);
  }

  function formdanProfilGuncelle(profil) {
    profil.ad = document.getElementById('ae-ad').value.trim() || profil.ad;
    profil.yon = document.getElementById('ae-yon').value;
    profil.url = document.getElementById('ae-url').value.trim();
    profil.yontem = document.getElementById('ae-yontem').value;
    profil.kimlikTipi = document.getElementById('ae-kimliktipi').value;
    profil.basligAdi = document.getElementById('ae-baslikadi').value.trim() || 'X-API-Key';
    profil.kimlik = document.getElementById('ae-kimlik').value;
    const kokEl = document.getElementById('ae-kokalan');
    if (kokEl) profil.kokAlan = kokEl.value.trim();
    document.querySelectorAll('.ae-esle').forEach(s => { profil.eslesme[s.dataset.k.replace(/^e:/, '')] = s.value; });
    document.querySelectorAll('.ae-kesle').forEach(s => { profil.kalemEslesme[s.dataset.k] = s.value.trim(); });
    document.querySelectorAll('.ae-desle').forEach(s => { profil.disaEslesme[s.dataset.k] = s.value.trim(); });
  }

  // ── İÇE AKTARIM: BAĞLANTI TESTİ ──────────────────────────────────────────
  async function baglantiTest(a, profil, main) {
    formdanProfilGuncelle(profil);
    AgEntegrasyon.ayarYaz(a);
    const h = document.getElementById('ae-test-sonuc');
    h.innerHTML = '<span class="muted" style="font-size:12px">Bağlanılıyor…</span>';
    const r = await AgEntegrasyon.baglantiTest(profil);
    if (!r.ok) {
      h.innerHTML = `<div style="border:1px solid var(--red-text);background:var(--red-bg);
        border-radius:8px;padding:8px;font-size:12px;color:var(--red-text)">
        <b>✕ Bağlanılamadı</b><br>${App.escapeHtml(r.hata)}</div>`;
      return;
    }
    const ornek = AgEntegrasyon.ornekAlanlar(r.veri, profil.kokAlan);
    _kesif[profil.id] = ornek;
    h.innerHTML = `<div style="border:1px solid var(--green-text);background:var(--green-bg);
      border-radius:8px;padding:8px;font-size:12px">
      <b style="color:var(--green-text)">✓ Bağlantı başarılı</b> · ${r.sure} ms ·
      <b>${ornek.kayitSayisi}</b> kayıt · <b>${ornek.alanlar.length}</b> alan bulundu
      ${ornek.ilkKayit ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:11px">İlk kaydı göster</summary>
        <pre style="font-size:10px;max-height:180px;overflow:auto;background:var(--surface2);padding:6px;border-radius:5px">${App.escapeHtml(JSON.stringify(ornek.ilkKayit, null, 1).slice(0, 1500))}</pre></details>` : ''}
      ${!ornek.kayitSayisi ? '<br><span style="color:var(--amber-text)">⚠ Kayıt listesi bulunamadı — "Kök alan" ayarını girin.</span>' : ''}
    </div>`;
    render(main);   // eşleme listelerini yeni alanlarla tazele
  }

  // ── İÇE AKTARIM: ÇEK VE ÖNİZLE ───────────────────────────────────────────
  async function veriCek(a, profil, main) {
    formdanProfilGuncelle(profil);
    AgEntegrasyon.ayarYaz(a);
    const h = document.getElementById('ae-onizleme');
    h.innerHTML = '<span class="muted" style="font-size:12px">Veriler çekiliyor…</span>';
    const r = await AgEntegrasyon.cek(profil);
    if (!r.ok) {
      h.innerHTML = `<div style="color:var(--red-text);font-size:12px">✕ ${App.escapeHtml(r.hata)}</div>`;
      return;
    }
    const e = AgEntegrasyon.kayitlariEsle(r.ham, profil);
    if (!e.kayitlar.length) {
      h.innerHTML = `<div style="color:var(--amber-text);font-size:12px">
        ⚠ ${r.ham.length} kayıt geldi ama hiçbiri eşlenemedi. Zorunlu alan eşlemelerini kontrol edin.
        ${e.hatalar.length ? '<br>' + App.escapeHtml(e.hatalar.slice(0, 3).join(' · ')) : ''}</div>`;
      return;
    }
    const mevcut = await mevcutKayitlariGetir(profil.hedefTip);
    const fark = AgEntegrasyon.farkCikar(e.kayitlar, mevcut, 'kod');
    _onizleme = { profilId: profil.id, kayitlar: e.kayitlar, hatalar: e.hatalar, fark };

    const tanim = AgEntegrasyon.HEDEF_ALANLAR[profil.hedefTip];
    const kolon2 = tanim.anaAlanlar[1] ? tanim.anaAlanlar[1][0] : null;
    h.innerHTML = `
      <div class="kpi-row" style="margin-bottom:8px">
        <div class="kpi-card"><div class="kpi-label">GELEN</div><div class="kpi-value">${e.kayitlar.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">YENİ</div><div class="kpi-value" style="color:var(--green-text)">${fark.yeni.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">DEĞİŞMİŞ</div><div class="kpi-value" style="color:var(--amber-text)">${fark.degisen.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">AYNI</div><div class="kpi-value">${fark.ayni.length}</div></div>
      </div>
      ${e.hatalar.length ? `<div style="font-size:11.5px;color:var(--amber-text);margin-bottom:6px">
        ⚠ ${e.hatalar.length} satır atlandı: ${App.escapeHtml(e.hatalar.slice(0, 3).join(' · '))}</div>` : ''}
      <div class="tbl-wrap" style="max-height:300px"><table class="dtable">
        <tr><th style="width:30px"></th><th>${App.escapeHtml(tanim.anaAlanlar[0][1])}</th>
            <th>${kolon2 ? App.escapeHtml(tanim.anaAlanlar[1][1]) : ''}</th><th>Durum</th></tr>
        ${e.kayitlar.slice(0, 100).map((k, i) => {
          const d = fark.yeni.includes(k) ? ['yeni', 'pill-green']
            : fark.degisen.find(x => x.kod === k.kod) ? ['değişmiş', 'pill-amber'] : ['aynı', 'pill-gray'];
          return `<tr>
            <td><input type="checkbox" class="ae-sec" data-i="${i}" ${d[0] !== 'aynı' ? 'checked' : ''}></td>
            <td class="mono" style="font-size:11px">${App.escapeHtml(k.kod)}</td>
            <td style="font-size:11.5px">${App.escapeHtml(kolon2 ? String(k[kolon2] ?? '') : '')}</td>
            <td><span class="pill ${d[1]}" style="font-size:9px">${d[0]}</span></td>
          </tr>`;
        }).join('')}
      </table></div>
      <button class="btn btn-green" id="ae-aktar" style="margin-top:8px">
        ✓ Seçilenleri ÜretimOS'a Aktar</button>
      <div class="fhint" style="margin-top:6px">
        "Aynı" işaretliler varsayılan olarak seçili değildir — gereksiz yazma yapılmaz.
      </div>`;
    document.getElementById('ae-aktar').onclick = () => aktar(a, profil, main);
  }

  // ── İÇE AKTARIM: KAYDET ──────────────────────────────────────────────────
  async function aktar(a, profil, main) {
    try {
      if (!_onizleme || _onizleme.profilId !== profil.id) return;
      const secili = [...document.querySelectorAll('.ae-sec:checked')].map(c => +c.dataset.i);
      if (!secili.length) { App.toast('Hiç kayıt seçilmedi.', 'err'); return; }
      const kayitlar = secili.map(i => _onizleme.kayitlar[i]);
      let yeni = 0, guncel = 0;

      if (profil.hedefTip === 'siparis') {
        const mevcut = await Store.siparisler.all();
        // Ürün kartı olan kodlar — kalem 'urun' mu 'hammadde' mi buradan belli olur
        const uKodlari = new Set((await Store.urunler.all()).map(u => String(u.kod || '').toUpperCase()));
        const harita = new Map(mevcut.map(m => [String(m.kod || '').toUpperCase(), m]));
        const eklenecek = [], guncellenecek = [];
        kayitlar.forEach(k => {
          const m = harita.get(k.kod.toUpperCase());
          const govde = {
            kod: k.kod, musteriAdi: k.musteriAdi,
            tarih: k.tarih || new Date().toISOString().slice(0, 10),
            terminTarihi: k.terminTarihi || '',
            toplamTutar: k.tutar, not: k.aciklama,
            kalemler: (k.kalemler || []).map(x => ({
              kod: x.urunKodu, ad: x.urunAdi || x.urunKodu,
              grup: uKodlari.has(String(x.urunKodu || '').toUpperCase()) ? 'urun' : 'hammadde',
              miktar: x.miktar, birim: x.birim || 'ADET',
              birimFiyat: x.birimFiyat, netFiyat: x.birimFiyat,
              tutar: Math.round(x.miktar * x.birimFiyat * 100) / 100,
              ikinciKalite: false
            })),
            araToplam: k.tutar, toplam: k.tutar,
            uretimTermini: k.terminTarihi || null,
            uretimKuyrugunda: false,
            kaynak: 'ag_entegrasyon', logoDurum: k.disDurum,
            senkronTarihi: new Date().toISOString()
          };
          // Karşı sistemden CARİ ONAYINA düşen sipariş geliyor — 'taslak'
          // bırakılırsa hiçbir onay ekranında görünmez.
          if (m) { Object.assign(m, govde); guncellenecek.push(m); guncel++; }
          else { eklenecek.push(Object.assign({ id: App.uid('SIP'), durum: 'cari_onay_bekliyor', teklifId: null }, govde)); yeni++; }
        });
        await App.persist(async () => {
          if (eklenecek.length) await Store.topluEkle('siparisler', eklenecek, 200);
          if (guncellenecek.length) await Store.topluGuncelle('siparisler', guncellenecek, 200);
        });
      } else if (profil.hedefTip === 'recete') {
        const [urunler, receteler, hammaddeler] = await Promise.all([
          Store.urunler.all(), Store.receteler.all(), Store.hammaddeler.all()
        ]);
        const uHarita = new Map(urunler.map(u => [String(u.kod || '').toUpperCase(), u]));
        const hHarita = new Map(hammaddeler.map(h => [String(h.stokKodu || h.kod || '').toUpperCase(), h]));
        const yeniU = [], guncelU = [], yeniR = [], guncelR = [];
        kayitlar.forEach(k => {
          let u = uHarita.get(k.kod.toUpperCase());
          if (!u) { u = { id: App.uid('UR'), kod: k.kod, ad: k.ad, birim: k.birim, kaynak: 'ag_entegrasyon' }; yeniU.push(u); yeni++; }
          else { u.ad = k.ad || u.ad; guncelU.push(u); guncel++; }
          const kalemler = (k.kalemler || []).map(x => {
            const hm = hHarita.get(String(x.malzemeKodu).toUpperCase());
            return { id: App.uid('RK'), tip: 'hammadde', refId: hm ? hm.id : null,
              kod: x.malzemeKodu, ad: x.malzemeAdi, miktar: x.miktar, birim: x.birim, eksikKart: !hm };
          });
          const mevcutR = receteler.find(r => r.urunId === u.id);
          if (mevcutR) { mevcutR.kalemler = kalemler; guncelR.push(mevcutR); }
          else yeniR.push({ id: App.uid('RC'), urunId: u.id, ad: k.ad + ' Reçetesi', kalemler, kaynak: 'ag_entegrasyon' });
        });
        await App.persist(async () => {
          if (yeniU.length) await Store.topluEkle('urunler', yeniU, 200);
          if (guncelU.length) await Store.topluGuncelle('urunler', guncelU, 200);
          if (yeniR.length) await Store.topluEkle('receteler', yeniR, 200);
          if (guncelR.length) await Store.topluGuncelle('receteler', guncelR, 200);
        });
      } else if (profil.hedefTip === 'urun_stok') {
        const [hammaddeler, stokRaf] = await Promise.all([Store.hammaddeler.all(), Store.stokRaf.all()]);
        const harita = new Map(hammaddeler.map(h => [String(h.stokKodu || h.kod || '').toUpperCase(), h]));
        const yeniH = [], guncelH = [], yeniStok = [], guncelStok = [];
        kayitlar.forEach(k => {
          let h = harita.get(k.kod.toUpperCase());
          if (!h) {
            h = { id: App.uid('HM'), stokKodu: k.kod, ad: k.ad, tip: 'hirdavat', birim: k.birim || 'ADET', kaynak: 'ag_entegrasyon' };
            if (k.fiyat) { h.birimFiyat = k.fiyat; h.dvz = 'TL'; }
            yeniH.push(h); yeni++;
          } else {
            h.ad = k.ad || h.ad;
            if (k.birim) h.birim = k.birim;
            if (k.fiyat) { h.birimFiyat = k.fiyat; h.dvz = h.dvz || 'TL'; }
            guncelH.push(h); guncel++;
          }
          if (k.stok != null && k.stok !== 0) {
            const s = stokRaf.find(x => x.ambar === 'hammadde_deposu' && x.tip === 'hammadde' && x.refId === h.id);
            if (!s) yeniStok.push({ id: App.uid('STK'), ambar: 'hammadde_deposu', tip: 'hammadde',
              refId: h.id, refKod: h.stokKodu, refAd: h.ad, birim: h.birim, miktar: k.stok,
              kaynak: 'ag_entegrasyon', tarih: new Date().toISOString().slice(0, 10) });
            else if (s.miktar !== k.stok) { s.miktar = k.stok; s.kaynak = 'ag_entegrasyon'; guncelStok.push(s); }
          }
        });
        await App.persist(async () => {
          if (yeniH.length) await Store.topluEkle('hammaddeler', yeniH, 200);
          if (guncelH.length) await Store.topluGuncelle('hammaddeler', guncelH, 200);
          if (yeniStok.length) await Store.topluEkle('stokRaf', yeniStok, 200);
          if (guncelStok.length) await Store.topluGuncelle('stokRaf', guncelStok, 200);
        });
      } else if (profil.hedefTip === 'cari') {
        const musteriler = await Store.musteriler.all();
        const harita = new Map();
        musteriler.forEach(m => { const k = String(m.kod || m.vergiNo || '').toUpperCase(); if (k) harita.set(k, m); });
        const yeniM = [], guncelM = [];
        kayitlar.forEach(k => {
          const anahtar = k.kod.toUpperCase();
          let m = harita.get(anahtar);
          if (!m) {
            m = { id: App.uid('MUS'), kod: k.kod, unvan: k.unvan, vergiNo: k.vergiNo, adres: k.adres, telefon: k.telefon, kaynak: 'ag_entegrasyon' };
            yeniM.push(m); yeni++;
          } else {
            m.unvan = k.unvan || m.unvan;
            if (k.adres) m.adres = k.adres;
            if (k.telefon) m.telefon = k.telefon;
            guncelM.push(m); guncel++;
          }
        });
        await App.persist(async () => {
          if (yeniM.length) await Store.topluEkle('musteriler', yeniM, 200);
          if (guncelM.length) await Store.topluGuncelle('musteriler', guncelM, 200);
        });
      }

      a.sonSenkron[profil.id] = new Date().toISOString();
      AgEntegrasyon.ayarYaz(a);
      App.toast(`${yeni} yeni, ${guncel} güncellenen kayıt aktarıldı.`, 'ok');
      _onizleme = null;
      render(main);
    } catch (e) {
      App.toast('Aktarılamadı: ' + ((e && e.message) || e), 'err');
    }
  }

  // ── DIŞA AKTARIM: KAYITLARI LİSTELE ──────────────────────────────────────
  async function disaListele(profil) {
    const h = document.getElementById('ae-disa-onizleme');
    h.innerHTML = '<span class="muted" style="font-size:12px">Kayıtlar yükleniyor…</span>';
    const kayitlar = await mevcutKayitlariGetir(profil.hedefTip);
    if (!kayitlar.length) { h.innerHTML = `<div class="fhint">Gönderilecek kayıt yok.</div>`; return; }
    const tanim = AgEntegrasyon.HEDEF_ALANLAR[profil.hedefTip];
    const kolon2 = tanim.anaAlanlar[1] ? tanim.anaAlanlar[1][0] : null;
    _disaOnizleme = { profilId: profil.id, kayitlar };
    h.innerHTML = `
      <div class="tbl-wrap" style="max-height:260px"><table class="dtable">
        <tr><th style="width:30px"><input type="checkbox" id="ae-disa-tumu"></th>
            <th>${App.escapeHtml(tanim.anaAlanlar[0][1])}</th><th>${kolon2 ? App.escapeHtml(tanim.anaAlanlar[1][1]) : ''}</th></tr>
        ${kayitlar.slice(0, 300).map((k, i) => `<tr>
          <td><input type="checkbox" class="ae-disa-sec" data-i="${i}"></td>
          <td class="mono" style="font-size:11px">${App.escapeHtml(String(k.kod || k.id || ''))}</td>
          <td style="font-size:11.5px">${App.escapeHtml(kolon2 ? String(k[kolon2] ?? '') : '')}</td>
        </tr>`).join('')}
      </table></div>
      <button class="btn btn-blue" id="ae-disa-onizle" style="margin-top:8px">📋 Seçilenlerin Payload'ını Önizle</button>
      <div id="ae-disa-payload" style="margin-top:8px"></div>`;
    document.getElementById('ae-disa-tumu').onchange = (e) => {
      document.querySelectorAll('.ae-disa-sec').forEach(c => { c.checked = e.target.checked; });
    };
    document.getElementById('ae-disa-onizle').onclick = () => disaPayloadOnizle(profil);
  }

  // ── DIŞA AKTARIM: PAYLOAD ÖNİZLE ─────────────────────────────────────────
  function disaPayloadOnizle(profil) {
    const secili = [...document.querySelectorAll('.ae-disa-sec:checked')].map(c => +c.dataset.i);
    const el = document.getElementById('ae-disa-payload');
    if (!secili.length) { el.innerHTML = '<div style="color:var(--red-text);font-size:12px">Hiç kayıt seçilmedi.</div>'; return; }
    const kayitlar = secili.map(i => _disaOnizleme.kayitlar[i]);
    const payload = AgEntegrasyon.disaPayloadOlustur(kayitlar, profil);
    el.innerHTML = `
      <div class="fhint">${kayitlar.length} kayıt gönderilecek. Aşağıdaki JSON karşı sisteme <b>${App.escapeHtml(profil.yontem)}</b> ile gönderilir:</div>
      <pre style="font-size:10px;max-height:200px;overflow:auto;background:var(--surface2);padding:6px;border-radius:5px">${App.escapeHtml(JSON.stringify(payload, null, 1).slice(0, 3000))}</pre>
      <button class="btn btn-red" id="ae-disa-gonder">📤 Gönder (${kayitlar.length} kayıt)</button>`;
    document.getElementById('ae-disa-gonder').onclick = () => disaGonderTikla(profil, payload, kayitlar.length);
  }

  // ── DIŞA AKTARIM: GÖNDER (yalnızca açık onaydan sonra) ───────────────────
  async function disaGonderTikla(profil, payload, adet) {
    App.confirmDialog(
      `<b>${adet} kayıt</b> "${App.escapeHtml(profil.url)}" adresine <b>${App.escapeHtml(profil.yontem)}</b> ile gönderilecek.` +
      `<br><br>Bu işlem karşı sistemde kalıcı bir etki yaratır ve ÜretimOS tarafından geri alınamaz.<br><br>Onaylıyor musunuz?`,
      async () => {
        const btn = document.getElementById('ae-disa-gonder');
        if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor…'; }
        const r = await AgEntegrasyon.disaGonder(profil, payload);
        if (!r.ok) {
          App.toast('Gönderim başarısız: ' + r.hata, 'err');
          if (btn) { btn.disabled = false; btn.textContent = '📤 Yeniden Dene'; }
          return;
        }
        const a = AgEntegrasyon.ayarOku();
        a.sonSenkron[profil.id] = new Date().toISOString();
        AgEntegrasyon.ayarYaz(a);
        App.toast(`✓ ${adet} kayıt gönderildi (${r.sure} ms).`, 'ok');
      });
  }

  // ── BİLGİ İŞLEM ŞARTNAMESİ (profile göre dinamik) ────────────────────────
  function sartnameOlustur(profil) {
    const tanim = profil ? AgEntegrasyon.HEDEF_ALANLAR[profil.hedefTip] : AgEntegrasyon.HEDEF_ALANLAR.siparis;
    const yon = profil ? profil.yon : 'ice';
    const baslikBolumu = yon === 'ice'
      ? `Yöntem : GET (POST da desteklenir)\nYanıt  : application/json\nİçerik : ${tanim.ad} listesi\n\n` +
        `Beklenen alanlar (adlar SERBEST — arayüzden eşlenir):\n` +
        tanim.anaAlanlar.map(([, ad, zorunlu]) => `  - ${ad}${zorunlu ? ' (zorunlu)' : ''}`).join('\n') +
        (tanim.kalemAlanlar.length ? `\n      İç içe satır alanları:\n` + tanim.kalemAlanlar.map(([, ad]) => `      · ${ad}`).join('\n') : '')
      : `Yöntem : POST (PUT da desteklenir)\nİstek Gövdesi : application/json (ÜretimOS tarafından gönderilir)\n` +
        `İçerik : ${tanim.ad} kayıtları\n\nGönderilecek alanlar:\n` +
        tanim.anaAlanlar.filter(([k]) => k !== 'kalemler').map(([, ad]) => `  - ${ad}`).join('\n');

    return `ÜRETİMOS — AĞ ENTEGRASYONU TEKNİK ŞARTNAMESİ
(${tanim.ad.toUpperCase()} — ${yon === 'ice' ? 'İÇE AKTARIM' : 'DIŞA AKTARIM'})
==================================================================
${yon === 'ice'
  ? 'ÜretimOS şirket içi ağdan veri okuyacaktır. Sistem yalnızca OKUMA yapar; karşı sisteme hiçbir yazma/değiştirme isteği göndermez.'
  : 'ÜretimOS şirket içi ağdaki bir uç noktaya veri YAZACAKTIR (POST/PUT). Karşı sistemin bu isteği kabul edip işlemesi beklenir.'}

------------------------------------------------------------------
1) ${tanim.ad.toUpperCase()}
------------------------------------------------------------------
${baslikBolumu}

------------------------------------------------------------------
2) TEKNİK GEREKLER
------------------------------------------------------------------
a) CORS
   Tarayıcıdan çağrıldığı için yanıtta şu başlık bulunmalıdır:
     Access-Control-Allow-Origin: <ÜretimOS adresi>
   (Örn. http://uretimos.sirket.local  ya da https://uretimos.com.tr)
   OPTIONS (preflight) isteğine de yanıt verilmelidir.

b) KİMLİK DOĞRULAMA (biri seçilir)
   - Yok (yalnızca iç ağdan erişilebilir uç nokta)
   - API anahtarı: sabit bir başlık (örn. X-API-Key: <anahtar>)
   - Bearer token
   - Basic auth

c) VERİ BİÇİMİ
   - Sayılar: 1234.56 veya "1.234,56" (ikisi de okunur)
   - Tarihler: YYYY-MM-DD tercih edilir (ISO 8601 de okunur)
   - Karakter kodlaması: UTF-8

d) KAPSAM
   Bu bağlantı yalnızca şirket içi ağdaki (*.local) veya ÜretimOS'un kendi
   adresindeki uç noktalara erişebilir. Bulut tabanlı bir sistemse, yerel
   ağınıza bu isteği karşılayan bir proxy/köprü servisi kurulmalıdır.

e) SAYFALAMA (yalnızca içe aktarım)
   Kayıt sayısı 5.000'i aşıyorsa sayfalama veya tarih filtresi eklenmelidir
   (örn. ?degisiklikTarihi=2026-08-01).

f) PERFORMANS
   Yanıt süresi 30 saniyeyi aşmamalıdır.

------------------------------------------------------------------
3) TESLİM EDİLECEKLER
------------------------------------------------------------------
  [ ] Uç nokta adresi (URL)
  [ ] Kimlik doğrulama yöntemi ve anahtar (varsa)
  [ ] Örnek ${yon === 'ice' ? 'yanıt' : 'kabul yanıtı'} (bir JSON örneği)
==================================================================`;
  }

  function sartnameGoster(profil) {
    const metin = sartnameOlustur(profil);
    App.openModal({
      title: '📄 Bilgi İşlem Şartnamesi',
      sub: 'Bu metni kopyalayıp bilgi işleme iletin',
      body: `<div class="fhint" style="margin-bottom:8px">
          ${profil ? `"<b>${App.escapeHtml(profil.ad)}</b>" profili için özelleştirildi.` : 'Genel şartname — bir profil seçerek o profile özel hale getirebilirsiniz.'}
        </div>
        <textarea class="ftextarea" id="ae-sart" rows="20" readonly
          style="font-family:monospace;font-size:10.5px">${App.escapeHtml(metin)}</textarea>`,
      footer: `<button class="btn" id="ae-sk">Kapat</button>
               <button class="btn btn-blue" id="ae-kopyala">📋 Kopyala</button>`,
      wide: true
    });
    document.getElementById('ae-sk').onclick = App.closeModal;
    document.getElementById('ae-kopyala').onclick = () => {
      const t = document.getElementById('ae-sart');
      t.select();
      try { document.execCommand('copy'); App.toast('Panoya kopyalandı.', 'ok'); }
      catch (e) { App.toast('Kopyalanamadı — metni elle seçip kopyalayın.', 'err'); }
    };
  }

  return { render };
})();
