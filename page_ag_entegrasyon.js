// ════════════════════════════════════════════════════════════════════════════
// AĞ ENTEGRASYONU EKRANI — Logo siparişleri + Cost reçeteleri
// Bağlantı ayarı · alan eşleme · önizleme · aktarım
// ════════════════════════════════════════════════════════════════════════════
PageModules.ag_entegrasyon = (() => {

  let sekme = 'siparis';
  let _kesif = { siparis: null, recete: null };   // test sonrası bulunan alanlar
  let _onizleme = null;

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'teklif_siparis', 'satis', 'cari', 'uretim_planlama'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Ağ entegrasyonu Yönetim, Sipariş, Cari ve Planlama rollerine açıktır.</div></div></div>`;
      return;
    }
    const a = AgEntegrasyon.ayarOku();

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">🔗 Ağ Entegrasyonu</div>
          <div class="page-sub">Logo siparişleri ve Cost reçeteleri — şirket içi ağdan otomatik aktarım</div></div>
        <div class="page-acts"><button class="btn" id="ae-sartname">📄 Bilgi İşlem Şartnamesi</button></div>
      </div>

      <div class="card" style="margin-bottom:12px;padding:10px 14px">
        <div style="font-size:12px;color:var(--muted)">
          <b>Nasıl çalışır:</b> Bilgi işlem iki adres (uç nokta) hazırlar; siz aşağıya girersiniz.
          Sistem o adreslerden <b>yalnızca okuma</b> yapar — karşı sisteme hiçbir şey yazmaz.
          Gelen veri önce <b>önizlenir</b>, siz onaylamadan ÜretimOS'a işlenmez.<br>
          <b>Alan adları sabit değildir:</b> "Bağlantıyı Test Et" ile alanlar keşfedilir,
          eşlemeyi listeden seçersiniz. Karşı sistem değişirse kod değişikliği gerekmez.
        </div>
      </div>

      <div class="tabs" style="margin-bottom:12px">
        <div class="tab ${sekme === 'siparis' ? 'active' : ''}" data-s="siparis">
          📥 Logo Siparişleri ${a.sonSenkron.siparis ? '<span class="pill pill-green" style="font-size:9px">bağlı</span>' : ''}</div>
        <div class="tab ${sekme === 'recete' ? 'active' : ''}" data-s="recete">
          🧾 Cost Reçeteleri ${a.sonSenkron.recete ? '<span class="pill pill-green" style="font-size:9px">bağlı</span>' : ''}</div>
      </div>
      <div id="ae-icerik"></div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { sekme = t.dataset.s; _onizleme = null; render(main); });
    document.getElementById('ae-sartname').onclick = () => sartnameGoster();
    bolumCiz(document.getElementById('ae-icerik'), a, main);
  }

  function bolumCiz(el, a, main) {
    const cfg = a[sekme];
    const siparisMi = sekme === 'siparis';
    const kesif = _kesif[sekme];
    const alanlar = (kesif && kesif.alanlar) || [];
    const secim = (deger, id) => `<select class="fselect ae-esle" data-k="${id}" style="font-size:11.5px;padding:3px">
        <option value="">— seçin —</option>
        ${alanlar.map(f => `<option value="${App.escapeHtml(f)}" ${deger === f ? 'selected' : ''}>${App.escapeHtml(f)}</option>`).join('')}
        ${deger && !alanlar.includes(deger) ? `<option value="${App.escapeHtml(deger)}" selected>${App.escapeHtml(deger)} (kayıtlı)</option>` : ''}
      </select>`;

    const anaAlanlar = siparisMi
      ? [['kod', 'Sipariş No *'], ['musteriAdi', 'Cari / Müşteri *'], ['tarih', 'Sipariş Tarihi'],
         ['terminTarihi', 'Termin Tarihi'], ['tutar', 'Tutar'], ['durum', 'Durum'],
         ['aciklama', 'Açıklama'], ['kalemler', 'Satırlar (dizi) *']]
      : [['kod', 'Ürün Kodu *'], ['ad', 'Ürün Adı *'], ['birim', 'Birim'], ['kalemler', 'Reçete kalemleri (dizi) *']];

    const kalemAlanlar = siparisMi
      ? [['urunKodu', 'Ürün/Stok Kodu'], ['urunAdi', 'Ürün Adı'], ['miktar', 'Miktar'],
         ['birim', 'Birim'], ['birimFiyat', 'Birim Fiyat']]
      : [['malzemeKodu', 'Malzeme Kodu'], ['malzemeAdi', 'Malzeme Adı'], ['miktar', 'Miktar'], ['birim', 'Birim']];

    el.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">1️⃣ Bağlantı</div></div>
        <div class="frow">
          <div class="fgroup" style="flex:3"><label class="flbl">Adres (uç nokta) *</label>
            <input class="finput" id="ae-url" value="${App.escapeHtml(cfg.url)}"
              placeholder="${siparisMi ? 'http://sunucu.sirket.local/api/logo/onay-bekleyen-siparisler'
                                       : 'http://sunucu.sirket.local/api/cost/urun-receteleri'}"></div>
          <div class="fgroup"><label class="flbl">Yöntem</label>
            <select class="fselect" id="ae-yontem">
              <option value="GET" ${cfg.yontem === 'GET' ? 'selected' : ''}>GET</option>
              <option value="POST" ${cfg.yontem === 'POST' ? 'selected' : ''}>POST</option></select></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Kimlik Doğrulama</label>
            <select class="fselect" id="ae-kimliktipi">
              <option value="yok" ${cfg.kimlikTipi === 'yok' ? 'selected' : ''}>Yok (açık uç nokta)</option>
              <option value="baslik" ${cfg.kimlikTipi === 'baslik' ? 'selected' : ''}>API Anahtarı (başlık)</option>
              <option value="bearer" ${cfg.kimlikTipi === 'bearer' ? 'selected' : ''}>Bearer Token</option>
              <option value="basic" ${cfg.kimlikTipi === 'basic' ? 'selected' : ''}>Basic (kullanıcı:şifre)</option>
            </select></div>
          <div class="fgroup"><label class="flbl">Başlık Adı</label>
            <input class="finput" id="ae-baslikadi" value="${App.escapeHtml(cfg.basligAdi || 'X-API-Key')}"></div>
          <div class="fgroup" style="flex:2"><label class="flbl">Anahtar / Token</label>
            <input class="finput" id="ae-kimlik" type="password" value="${App.escapeHtml(cfg.kimlik)}"
              placeholder="bilgi işlemden alınacak"></div>
        </div>
        <div class="fhint">Kimlik bilgisi <b>yalnızca bu bilgisayarda</b> saklanır, ÜretimOS sunucusuna gönderilmez.</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-blue" id="ae-test">🔌 Bağlantıyı Test Et</button>
          <button class="btn" id="ae-kaydet">💾 Ayarları Kaydet</button>
        </div>
        <div id="ae-test-sonuc" style="margin-top:8px"></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">2️⃣ Alan Eşleme</div></div>
        <div class="fhint" style="margin-bottom:8px">
          ${alanlar.length ? `Bağlantı testinde <b>${alanlar.length} alan</b> bulundu — listeden eşleyin.`
            : 'Önce "Bağlantıyı Test Et" deyin; gelen alanlar burada listelenir.'}
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Kök alan (dizi nerede?)</label>
            <input class="finput" id="ae-kokalan" value="${App.escapeHtml(cfg.kokAlan || '')}"
              placeholder="örn. data.orders — yanıt doğrudan diziyse boş bırakın"></div>
        </div>
        <table class="dtable" style="margin-top:6px">
          <tr><th style="width:200px">ÜretimOS alanı</th><th>Karşı sistemdeki alan</th></tr>
          ${anaAlanlar.map(([k, ad]) => `<tr><td style="font-size:11.5px">${ad}</td>
            <td>${secim(cfg.eslesme[k], 'e:' + k)}</td></tr>`).join('')}
        </table>
        <div style="font-size:12px;font-weight:600;margin:10px 0 4px">
          ${siparisMi ? 'Sipariş satırı alanları' : 'Reçete kalemi alanları'}
          <span class="muted" style="font-weight:400;font-size:11px">— satır dizisinin içindeki alan adları</span></div>
        <table class="dtable">
          <tr><th style="width:200px">ÜretimOS alanı</th><th>Karşı sistemdeki alan</th></tr>
          ${kalemAlanlar.map(([k, ad]) => `<tr><td style="font-size:11.5px">${ad}</td>
            <td><input class="finput ae-kesle" data-k="${k}" value="${App.escapeHtml(cfg.kalemEslesme[k] || '')}"
              style="font-size:11.5px;padding:3px" placeholder="alan adı"></td></tr>`).join('')}
        </table>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">3️⃣ Veri Aktarımı</div>
          <button class="btn btn-sm btn-green" id="ae-cek">⬇ Verileri Çek ve Önizle</button></div>
        ${a.sonSenkron[sekme] ? `<div class="fhint">Son aktarım: ${new Date(a.sonSenkron[sekme]).toLocaleString('tr')}</div>` : ''}
        <div id="ae-onizleme" style="margin-top:8px"></div>
      </div>`;

    document.getElementById('ae-test').onclick = () => baglantiTest(main);
    document.getElementById('ae-kaydet').onclick = () => ayarKaydet(main, true);
    document.getElementById('ae-cek').onclick = () => veriCek(main);
  }

  function formdanCfg() {
    const a = AgEntegrasyon.ayarOku();
    const c = a[sekme];
    c.url = document.getElementById('ae-url').value.trim();
    c.yontem = document.getElementById('ae-yontem').value;
    c.kimlikTipi = document.getElementById('ae-kimliktipi').value;
    c.basligAdi = document.getElementById('ae-baslikadi').value.trim() || 'X-API-Key';
    c.kimlik = document.getElementById('ae-kimlik').value;
    c.kokAlan = document.getElementById('ae-kokalan').value.trim();
    document.querySelectorAll('.ae-esle').forEach(s => {
      const k = s.dataset.k.replace(/^e:/, '');
      c.eslesme[k] = s.value;
    });
    document.querySelectorAll('.ae-kesle').forEach(s => { c.kalemEslesme[s.dataset.k] = s.value.trim(); });
    return a;
  }

  function ayarKaydet(main, bildir) {
    const a = formdanCfg();
    if (!AgEntegrasyon.ayarYaz(a)) { App.toast('Ayarlar kaydedilemedi (depolama dolu olabilir).', 'err'); return null; }
    if (bildir) App.toast('Ayarlar kaydedildi.', 'ok');
    return a;
  }

  async function baglantiTest(main) {
    const a = ayarKaydet(main, false);
    if (!a) return;
    const h = document.getElementById('ae-test-sonuc');
    h.innerHTML = '<span class="muted" style="font-size:12px">Bağlanılıyor…</span>';
    const cfg = a[sekme];
    const r = await AgEntegrasyon.baglantiTest(cfg);
    if (!r.ok) {
      h.innerHTML = `<div style="border:1px solid var(--red-text);background:var(--red-bg);
        border-radius:8px;padding:8px;font-size:12px;color:var(--red-text)">
        <b>✕ Bağlanılamadı</b><br>${App.escapeHtml(r.hata)}</div>`;
      return;
    }
    const ornek = AgEntegrasyon.ornekAlanlar(r.veri, cfg.kokAlan);
    _kesif[sekme] = ornek;
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

  async function veriCek(main) {
    const a = ayarKaydet(main, false);
    if (!a) return;
    const cfg = a[sekme];
    const h = document.getElementById('ae-onizleme');
    h.innerHTML = '<span class="muted" style="font-size:12px">Veriler çekiliyor…</span>';
    const r = await AgEntegrasyon.cek(cfg);
    if (!r.ok) {
      h.innerHTML = `<div style="color:var(--red-text);font-size:12px">✕ ${App.escapeHtml(r.hata)}</div>`;
      return;
    }
    const siparisMi = sekme === 'siparis';
    const e = siparisMi ? AgEntegrasyon.siparisleriEsle(r.ham, cfg)
                        : AgEntegrasyon.receteleriEsle(r.ham, cfg);
    if (!e.kayitlar.length) {
      h.innerHTML = `<div style="color:var(--amber-text);font-size:12px">
        ⚠ ${r.ham.length} kayıt geldi ama hiçbiri eşlenemedi. Zorunlu alan eşlemelerini kontrol edin.
        ${e.hatalar.length ? '<br>' + App.escapeHtml(e.hatalar.slice(0, 3).join(' · ')) : ''}</div>`;
      return;
    }
    const mevcut = siparisMi ? await Store.siparisler.all() : await Store.urunler.all();
    const fark = AgEntegrasyon.farkCikar(e.kayitlar, mevcut, 'kod');
    _onizleme = { kayitlar: e.kayitlar, hatalar: e.hatalar, fark, siparisMi };

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
        <tr><th style="width:30px"></th><th>${siparisMi ? 'Sipariş No' : 'Ürün Kodu'}</th>
            <th>${siparisMi ? 'Cari' : 'Ad'}</th><th class="r">${siparisMi ? 'Tutar' : 'Kalem'}</th>
            <th class="r">${siparisMi ? 'Satır' : 'Birim'}</th><th>Durum</th></tr>
        ${e.kayitlar.slice(0, 100).map((k, i) => {
          const d = fark.yeni.includes(k) ? ['yeni', 'pill-green']
            : fark.degisen.find(x => x.kod === k.kod) ? ['değişmiş', 'pill-amber'] : ['aynı', 'pill-gray'];
          return `<tr>
            <td><input type="checkbox" class="ae-sec" data-i="${i}" ${d[0] !== 'aynı' ? 'checked' : ''}></td>
            <td class="mono" style="font-size:11px">${App.escapeHtml(k.kod)}</td>
            <td style="font-size:11.5px">${App.escapeHtml(siparisMi ? k.musteriAdi : k.ad)}</td>
            <td class="r">${siparisMi ? App.fmtTL(k.tutar) : (k.kalemler || []).length}</td>
            <td class="r">${siparisMi ? (k.kalemler || []).length : App.escapeHtml(k.birim)}</td>
            <td><span class="pill ${d[1]}" style="font-size:9px">${d[0]}</span></td>
          </tr>`;
        }).join('')}
      </table></div>
      <button class="btn btn-green" id="ae-aktar" style="margin-top:8px">
        ✓ Seçilenleri ÜretimOS'a Aktar</button>
      <div class="fhint" style="margin-top:6px">
        "Aynı" işaretliler varsayılan olarak seçili değildir — gereksiz yazma yapılmaz.
      </div>`;
    document.getElementById('ae-aktar').onclick = () => aktar(main);
  }

  async function aktar(main) {
    try {
      if (!_onizleme) return;
      const secili = [...document.querySelectorAll('.ae-sec:checked')].map(c => +c.dataset.i);
      if (!secili.length) { App.toast('Hiç kayıt seçilmedi.', 'err'); return; }
      const kayitlar = secili.map(i => _onizleme.kayitlar[i]);
      let yeni = 0, guncel = 0;

      if (_onizleme.siparisMi) {
        const mevcut = await Store.siparisler.all();
        // Ürün kartı olan kodlar — kalem 'urun' mu 'hammadde' mi buradan belli olur
        const uKodlari = new Set((await Store.urunler.all())
          .map(u => String(u.kod || '').toUpperCase()));
        const harita = new Map(mevcut.map(m => [String(m.kod || '').toUpperCase(), m]));
        const eklenecek = [], guncellenecek = [];
        kayitlar.forEach(k => {
          const m = harita.get(k.kod.toUpperCase());
          const govde = {
            kod: k.kod, musteriAdi: k.musteriAdi,
            tarih: k.tarih || new Date().toISOString().slice(0, 10),
            terminTarihi: k.terminTarihi || '',
            toplamTutar: k.tutar, not: k.aciklama,
            // grup: planlama ekranı üretilebilir kalemleri buradan ayırır.
            // Ürün kartında karşılığı olan kalem 'urun', olmayan 'hammadde'.
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
            kaynak: 'logo_entegrasyon', logoDurum: k.disDurum,
            senkronTarihi: new Date().toISOString()
          };
          if (m) { Object.assign(m, govde); guncellenecek.push(m); guncel++; }
          // Logo'dan gelen sipariş CARİ ONAYINA düşer — 'taslak' bırakılırsa
          // hiçbir onay ekranında görünmez.
          else { eklenecek.push(Object.assign({ id: App.uid('SIP'),
            durum: 'cari_onay_bekliyor', teklifId: null }, govde)); yeni++; }
        });
        await App.persist(async () => {
          if (eklenecek.length) await Store.topluEkle('siparisler', eklenecek, 200);
          if (guncellenecek.length) await Store.topluGuncelle('siparisler', guncellenecek, 200);
        });
      } else {
        // Reçeteler: ürün kartı + reçete
        const [urunler, receteler, hammaddeler] = await Promise.all([
          Store.urunler.all(), Store.receteler.all(), Store.hammaddeler.all()
        ]);
        const uHarita = new Map(urunler.map(u => [String(u.kod || '').toUpperCase(), u]));
        const hHarita = new Map(hammaddeler.map(h => [String(h.stokKodu || h.kod || '').toUpperCase(), h]));
        const yeniU = [], guncelU = [], yeniR = [], guncelR = [];
        kayitlar.forEach(k => {
          let u = uHarita.get(k.kod.toUpperCase());
          if (!u) {
            u = { id: App.uid('UR'), kod: k.kod, ad: k.ad, birim: k.birim, kaynak: 'cost_entegrasyon' };
            yeniU.push(u); yeni++;
          } else { u.ad = k.ad || u.ad; guncelU.push(u); guncel++; }
          const kalemler = (k.kalemler || []).map(x => {
            const hm = hHarita.get(String(x.malzemeKodu).toUpperCase());
            return {
              id: App.uid('RK'),
              tip: hm ? 'hammadde' : 'hammadde',
              refId: hm ? hm.id : null,
              kod: x.malzemeKodu, ad: x.malzemeAdi,
              miktar: x.miktar, birim: x.birim,
              eksikKart: !hm            // kartı olmayanlar işaretlenir
            };
          });
          const mevcutR = receteler.find(r => r.urunId === u.id);
          if (mevcutR) { mevcutR.kalemler = kalemler; guncelR.push(mevcutR); }
          else yeniR.push({ id: App.uid('RC'), urunId: u.id, ad: k.ad + ' Reçetesi',
            kalemler, kaynak: 'cost_entegrasyon' });
        });
        await App.persist(async () => {
          if (yeniU.length) await Store.topluEkle('urunler', yeniU, 200);
          if (guncelU.length) await Store.topluGuncelle('urunler', guncelU, 200);
          if (yeniR.length) await Store.topluEkle('receteler', yeniR, 200);
          if (guncelR.length) await Store.topluGuncelle('receteler', guncelR, 200);
        });
      }

      const a = AgEntegrasyon.ayarOku();
      a.sonSenkron[sekme] = new Date().toISOString();
      AgEntegrasyon.ayarYaz(a);
      App.toast(`${yeni} yeni, ${guncel} güncellenen kayıt aktarıldı.`, 'ok');
      _onizleme = null;
      render(main);
    } catch (e) {
      App.toast('Aktarılamadı: ' + ((e && e.message) || e), 'err');
    }
  }

  // ── BİLGİ İŞLEM ŞARTNAMESİ ───────────────────────────────────────────────
  function sartnameGoster() {
    App.openModal({
      title: '📄 Bilgi İşlem Şartnamesi',
      sub: 'Bu metni bilgi işleme iletin',
      body: `<div class="fhint" style="margin-bottom:8px">
          Aşağıdaki metni kopyalayıp bilgi işleme gönderin. İki uç nokta hazırlamaları yeterli.
        </div>
        <textarea class="ftextarea" id="ae-sart" rows="20" readonly
          style="font-family:monospace;font-size:10.5px">${App.escapeHtml(SARTNAME)}</textarea>`,
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

  const SARTNAME = `ÜRETİMOS — AĞ ENTEGRASYONU TEKNİK ŞARTNAMESİ
==================================================================
ÜretimOS'un şirket içi ağdan veri okuyabilmesi için iki HTTP uç
noktası gerekmektedir. Sistem YALNIZCA OKUMA yapar; karşı sisteme
hiçbir yazma/değiştirme isteği göndermez.

------------------------------------------------------------------
1) LOGO — CARİ ONAYINA DÜŞEN SİPARİŞLER
------------------------------------------------------------------
Yöntem : GET (POST da desteklenir)
Yanıt  : application/json
İçerik : Cari onayı bekleyen siparişlerin listesi

Beklenen alanlar (adlar SERBEST — arayüzden eşlenir):
  - Sipariş numarası          (zorunlu)
  - Cari / müşteri unvanı     (zorunlu)
  - Sipariş tarihi
  - Termin tarihi
  - Toplam tutar
  - Durum bilgisi
  - Sipariş satırları (dizi)  (zorunlu)
      · Stok/ürün kodu
      · Ürün adı
      · Miktar
      · Birim
      · Birim fiyat

Örnek yanıt:
{
  "data": {
    "orders": [
      { "SIPARIS_NO": "SIP-2026-001",
        "CARI_UNVAN": "ÖRNEK A.Ş.",
        "TARIH": "2026-08-15",
        "TERMIN": "2026-09-30",
        "TUTAR": 125400.50,
        "DURUM": "ONAY_BEKLIYOR",
        "SATIRLAR": [
          { "STOK_KODU": "CT.D.80200", "STOK_ADI": "Dolap",
            "MIKTAR": 12, "BIRIM": "ADET", "FIYAT": 8500 }
        ] }
    ]
  }
}

------------------------------------------------------------------
2) COST — ÜRÜN KARTLARI VE REÇETELERİ
------------------------------------------------------------------
Yöntem : GET
Yanıt  : application/json

Beklenen alanlar:
  - Ürün kodu                 (zorunlu)
  - Ürün adı                  (zorunlu)
  - Birim
  - Reçete kalemleri (dizi)   (zorunlu)
      · Malzeme kodu
      · Malzeme adı
      · Miktar
      · Birim

------------------------------------------------------------------
3) TEKNİK GEREKLER
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

d) SAYFALAMA
   Kayıt sayısı 5.000'i aşıyorsa sayfalama veya tarih filtresi
   eklenmelidir (örn. ?degisiklikTarihi=2026-08-01).

e) PERFORMANS
   Yanıt süresi 30 saniyeyi aşmamalıdır.

------------------------------------------------------------------
4) TESLİM EDİLECEKLER
------------------------------------------------------------------
  [ ] Sipariş uç noktası adresi (URL)
  [ ] Reçete uç noktası adresi (URL)
  [ ] Kimlik doğrulama yöntemi ve anahtar (varsa)
  [ ] Örnek yanıt (her iki uç nokta için birer JSON)
==================================================================`;

  return { render, SARTNAME };
})();
