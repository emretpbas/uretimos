// ════════════════════════════════════════════════════════════════════════════
// E-FATURA / E-ARŞİV YÖNETİMİ
//   Sekme 1: 📤 Gönderim Kuyruğu — kesilmiş faturalar, kontrol, XML üretimi
//   Sekme 2: 📋 Gönderilenler   — durum takibi (gönderildi/kabul/red)
//   Sekme 3: 🏢 Firma Bilgileri — satıcı bilgileri (VKN doğrulamalı)
//   Sekme 4: 👥 Mükellef Durumu — müşterilerin e-Fatura mükellefiyeti
// ════════════════════════════════════════════════════════════════════════════
PageModules.efatura = (() => {
  let activeTab = 'kuyruk';

  const bugun = () => new Date().toISOString().slice(0, 10);

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const [faturalar, eFaturalar, musteriler, firmaKayit] = await Promise.all([
      Store.faturalar.all(), Store.eFaturalar.all(), Store.musteriler.all(), Store.firmaBilgileri.all()
    ]);
    const firma = firmaKayit[0] || null;
    const d = { faturalar, eFaturalar, musteriler, firma };

    // Uyarı: firma bilgisi eksikse hiçbir fatura gönderilemez
    const firmaKontrol = EFaturaMotor.vergiKimligiKontrol(firma && firma.vergiNo);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">e-Fatura / e-Arşiv</div>
        <div class="page-sub">Vergi kimliği doğrulama, UBL-TR XML üretimi ve GİB gönderim durumu takibi</div></div>
      </div>
      ${!firma || !firmaKontrol.gecerli ? `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div style="font-size:12px">🚨 <b>Firma bilgileri eksik veya hatalı.</b> e-Fatura düzenlenebilmesi için firmanın ünvanı ve geçerli VKN'si tanımlı olmalıdır.
        <b>Firma Bilgileri</b> sekmesinden tanımlayın.</div></div>` : ''}
      <div class="tabs" style="flex-wrap:wrap">
        <div class="tab ${activeTab === 'kuyruk' ? 'active' : ''}" data-tab="kuyruk">📤 Gönderim Kuyruğu</div>
        <div class="tab ${activeTab === 'gonderilen' ? 'active' : ''}" data-tab="gonderilen">📋 Gönderilenler</div>
        <div class="tab ${activeTab === 'firma' ? 'active' : ''}" data-tab="firma">🏢 Firma Bilgileri</div>
        <div class="tab ${activeTab === 'mukellef' ? 'active' : ''}" data-tab="mukellef">👥 Mükellef Durumu</div>
      </div>
      <div id="ef-content"></div>`;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const c = document.getElementById('ef-content');
    if (activeTab === 'kuyruk') kuyrukTab(c, d, render, main);
    else if (activeTab === 'gonderilen') gonderilenTab(c, d, render, main);
    else if (activeTab === 'firma') firmaTab(c, d, render, main);
    else mukellefTab(c, d, render, main);
  }

  // ── SEKME 1: GÖNDERİM KUYRUĞU ───────────────────────────────────────────
  function kuyrukTab(c, d, render, main) {
    // Henüz e-fatura kaydı oluşturulmamış faturalar
    const gonderilenIdler = new Set(d.eFaturalar.map(e => e.faturaId));
    const bekleyenler = d.faturalar.filter(f => !gonderilenIdler.has(f.id));

    if (!bekleyenler.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Gönderim bekleyen fatura yok</div>
        <div class="edesc">Kesilen tüm faturalar için e-Fatura/e-Arşiv kaydı oluşturulmuş. Yeni fatura kesildiğinde burada listelenir.</div></div></div>`;
      return;
    }

    c.innerHTML = `<div class="card">
      <div class="fhint" style="margin-bottom:8px">Her fatura için <b>Kontrol Et</b> ile zorunlu alanlar denetlenir, ardından UBL-TR XML üretilir. XML entegratörünüze (Uyumsoft, İzibiz, Logo vb.) yüklenir.</div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Fatura No</th><th>Müşteri</th><th>Tarih</th><th class="r">Tutar</th><th>Vergi Kimliği</th><th>Senaryo</th><th></th></tr>
        ${bekleyenler.map(f => {
          const mus = d.musteriler.find(m => m.id === f.musteriId);
          const vk = EFaturaMotor.vergiKimligiKontrol(mus && (mus.vergiNo || mus.tckn));
          const sen = EFaturaMotor.senaryoBelirle(mus);
          return `<tr${!vk.gecerli ? ' style="background:var(--red-bg)"' : ''}>
            <td class="mono"><b>${App.escapeHtml(f.faturaNo || '—')}</b></td>
            <td>${App.escapeHtml(f.musteriAdi || '—')}</td>
            <td class="mono" style="font-size:10.5px">${f.tarih || '—'}</td>
            <td class="r"><b>${App.fmtTL(f.genelToplam || 0)}</b></td>
            <td>${vk.gecerli
              ? `<span class="pill pill-green" style="font-size:9px">${vk.tip} ✓</span> <span class="mono" style="font-size:10px">${App.escapeHtml(vk.no)}</span>`
              : `<span class="pill pill-red" style="font-size:9px">Geçersiz</span><br><span class="muted" style="font-size:9px">${App.escapeHtml(vk.mesaj.slice(0, 40))}</span>`}</td>
            <td><span class="pill ${sen.senaryo === 'EFATURA' ? 'pill-blue' : 'pill-amber'}" style="font-size:9px">${sen.senaryo === 'EFATURA' ? 'e-Fatura' : 'e-Arşiv'}</span></td>
            <td><button class="btn btn-sm btn-blue ef-hazirla" data-id="${f.id}">Kontrol & XML</button></td>
          </tr>`;
        }).join('')}
      </table></div>`;

    c.querySelectorAll('.ef-hazirla').forEach(b => b.onclick = async () => {
      const f = d.faturalar.find(x => x.id === b.dataset.id);
      hazirlaModal(f, d, render, main);
    });
  }

  async function hazirlaModal(fatura, d, render, main) {
    const mus = d.musteriler.find(m => m.id === fatura.musteriId);
    // Fatura kalemlerini siparişten al
    const siparisler = await Store.siparisler.all();
    const sip = siparisler.find(s => s.id === fatura.siparisId);
    const kalemler = (fatura.kalemler && fatura.kalemler.length) ? fatura.kalemler
      : (sip && sip.kalemler) ? sip.kalemler : [];

    const kontrol = EFaturaMotor.gonderimKontrol(fatura, mus, d.firma, kalemler);
    const sen = EFaturaMotor.senaryoBelirle(mus);

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">
        <b>${App.escapeHtml(fatura.faturaNo || '')}</b> · ${App.escapeHtml(fatura.musteriAdi || '')} · ${App.fmtTL(fatura.genelToplam || 0)}<br>
        Senaryo: <b>${sen.senaryo === 'EFATURA' ? 'e-Fatura' : 'e-Arşiv'}</b> — ${App.escapeHtml(sen.aciklama)}
      </div>
      ${kontrol.hatalar.length ? `<div style="border:1.5px solid var(--red);background:var(--red-bg);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <b style="color:var(--red-text);font-size:12px">🚫 ${kontrol.hatalar.length} ZORUNLU ALAN EKSİK — GİB reddeder</b>
        ${kontrol.hatalar.map(h => `<div style="font-size:11.5px;padding:2px 0">• ${App.escapeHtml(h)}</div>`).join('')}
      </div>` : `<div style="border:1px solid var(--green);background:var(--green-bg);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <b style="color:var(--green-text);font-size:12px">✓ Zorunlu alan kontrolü geçti</b></div>`}
      ${kontrol.uyarilar.length ? `<div style="border:1px solid var(--amber);background:var(--amber-bg);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <b style="font-size:11.5px">⚠ ${kontrol.uyarilar.length} uyarı (gönderimi engellemez)</b>
        ${kontrol.uyarilar.slice(0, 6).map(u => `<div style="font-size:11px;padding:2px 0">• ${App.escapeHtml(u)}</div>`).join('')}
      </div>` : ''}
      <div class="fgroup"><label class="flbl">Fatura Kalemleri (${kalemler.length})</label>
        <table class="dtable" style="font-size:10.5px">
          <tr><th>Ürün</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">KDV</th><th class="r">Tutar</th></tr>
          ${kalemler.map(k => `<tr><td>${App.escapeHtml(k.kod || '')} ${App.escapeHtml((k.ad || '').slice(0, 30))}</td>
            <td class="r">${App.fmt(k.miktar || 1, 0)}</td>
            <td class="r">${App.fmtTL(k.netFiyat || 0)}</td>
            <td class="r">%${k.kdvOrani == null ? 20 : k.kdvOrani}</td>
            <td class="r">${App.fmtTL((k.netFiyat || 0) * (k.miktar || 1))}</td></tr>`).join('')}
        </table></div>
      <div id="ef-xml-alan"></div>`;

    App.openModal({ title: '📤 e-Fatura Hazırlama', body, xwide: true,
      footer: `<button class="btn" id="ef-cancel">Kapat</button>
        <button class="btn btn-blue" id="ef-xml" ${kontrol.gonderilebilir ? '' : 'disabled'}>UBL-TR XML Üret</button>` });
    document.getElementById('ef-cancel').onclick = App.closeModal;

    document.getElementById('ef-xml').onclick = async () => {
      const sonuc = EFaturaMotor.ublOlustur(fatura, mus, d.firma, kalemler);
      const alan = document.getElementById('ef-xml-alan');
      alan.innerHTML = `
        <div style="border:1px solid var(--blue-light);background:var(--blue-bg);border-radius:8px;padding:10px 12px;margin-top:10px">
          <div style="font-size:12px;margin-bottom:6px"><b>✓ UBL-TR 1.2 XML üretildi</b></div>
          <div style="font-size:11px">ETTN: <span class="mono">${sonuc.ettn}</span></div>
          <div style="font-size:11px">Profil: <b>${sonuc.senaryo.tip}</b> · Matrah ${App.fmtTL(sonuc.matrahToplam)} · KDV ${App.fmtTL(sonuc.kdvToplam)} · Toplam <b>${App.fmtTL(sonuc.genelToplam)}</b></div>
          <textarea class="ftextarea" id="ef-xml-icerik" readonly style="font-family:monospace;font-size:9.5px;height:180px;margin-top:8px">${App.escapeHtml(sonuc.xml)}</textarea>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-sm" id="ef-kopyala">📋 XML'i Kopyala</button>
            <button class="btn btn-sm btn-green" id="ef-kaydet">✓ Gönderim Kaydı Oluştur</button>
          </div>
          <div class="fhint" style="margin-top:6px">XML'i entegratörünüzün paneline yükleyin veya API'sine gönderin. Kayıt oluşturulduktan sonra durumu <b>Gönderilenler</b> sekmesinden takip edin.</div>
        </div>`;
      document.getElementById('ef-kopyala').onclick = () => {
        const ta = document.getElementById('ef-xml-icerik');
        ta.select();
        try { document.execCommand('copy'); App.toast('XML panoya kopyalandı', 'ok'); }
        catch (e) { App.toast('Kopyalanamadı — metni elle seçin', 'err'); }
      };
      document.getElementById('ef-kaydet').onclick = async () => {
        const tumu = await Store.eFaturalar.all();
        tumu.push({
          id: App.uid('EFT'), faturaId: fatura.id, faturaNo: fatura.faturaNo,
          musteriId: fatura.musteriId, musteriAdi: fatura.musteriAdi,
          ettn: sonuc.ettn, senaryo: sonuc.senaryo.senaryo, profil: sonuc.senaryo.tip,
          matrah: sonuc.matrahToplam, kdv: sonuc.kdvToplam, genelToplam: sonuc.genelToplam,
          xml: sonuc.xml, durum: 'hazir', tarih: bugun(),
          olusturmaZamani: new Date().toISOString()
        });
        await App.persist(() => Store.eFaturalar.save(tumu));
        App.toast('e-Fatura kaydı oluşturuldu — ETTN: ' + sonuc.ettn.slice(0, 8) + '…', 'ok');
        App.closeModal();
        activeTab = 'gonderilen';
        render(main);
      };
    };
  }

  // ── SEKME 2: GÖNDERİLENLER ──────────────────────────────────────────────
  function gonderilenTab(c, d, render, main) {
    if (!d.eFaturalar.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Henüz e-Fatura kaydı yok</div>
        <div class="edesc">Gönderim Kuyruğu sekmesinden fatura seçip XML üretin.</div></div></div>`;
      return;
    }
    const say = (dr) => d.eFaturalar.filter(e => e.durum === dr).length;
    c.innerHTML = `
      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Gönderime Hazır</div><div class="kpi-val blue">${say('hazir')}</div></div>
        <div class="kpi"><div class="kpi-lbl">Gönderildi</div><div class="kpi-val amber">${say('gonderildi')}</div></div>
        <div class="kpi"><div class="kpi-lbl">Kabul Edildi</div><div class="kpi-val green">${say('kabul')}</div></div>
        <div class="kpi"><div class="kpi-lbl">Reddedildi / Hata</div><div class="kpi-val ${say('red') + say('hata') ? 'red' : 'green'}">${say('red') + say('hata')}</div></div>
      </div>
      <div class="card">
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Fatura No</th><th>Müşteri</th><th>ETTN</th><th>Senaryo</th><th class="r">Tutar</th><th>Tarih</th><th>Durum</th><th></th></tr>
          ${[...d.eFaturalar].sort((a, b) => (b.olusturmaZamani || '').localeCompare(a.olusturmaZamani || '')).map(e => {
            const [ad, renk] = EFaturaMotor.DURUMLAR[e.durum] || [e.durum, 'pill-gray'];
            return `<tr>
              <td class="mono"><b>${App.escapeHtml(e.faturaNo || '—')}</b></td>
              <td>${App.escapeHtml(e.musteriAdi || '—')}</td>
              <td class="mono" style="font-size:9.5px">${App.escapeHtml((e.ettn || '').slice(0, 13))}…</td>
              <td><span class="pill ${e.senaryo === 'EFATURA' ? 'pill-blue' : 'pill-amber'}" style="font-size:9px">${e.senaryo === 'EFATURA' ? 'e-Fatura' : 'e-Arşiv'}</span></td>
              <td class="r">${App.fmtTL(e.genelToplam || 0)}</td>
              <td class="mono" style="font-size:10.5px">${e.tarih || '—'}</td>
              <td><span class="pill ${renk}" style="font-size:9px">${ad}</span>${e.gibNot ? `<br><span class="muted" style="font-size:9px">${App.escapeHtml(e.gibNot.slice(0, 30))}</span>` : ''}</td>
              <td style="display:flex;gap:4px"><button class="btn btn-sm btn-ghost ef-durum" data-id="${e.id}">Durum</button>
                <button class="btn btn-sm btn-ghost ef-goster" data-id="${e.id}">XML</button></td>
            </tr>`;
          }).join('')}
        </table></div>`;

    c.querySelectorAll('.ef-durum').forEach(b => b.onclick = () => {
      const e = d.eFaturalar.find(x => x.id === b.dataset.id);
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:10px"><b>${App.escapeHtml(e.faturaNo)}</b> · ETTN: <span class="mono">${App.escapeHtml(e.ettn)}</span></div>
        <div class="fgroup"><label class="flbl">GİB / Entegratör Durumu</label>
          <select class="fselect" id="efd-durum">
            ${Object.entries(EFaturaMotor.DURUMLAR).map(([k, [ad, , acik]]) =>
              `<option value="${k}" ${e.durum === k ? 'selected' : ''}>${ad} — ${acik}</option>`).join('')}
          </select></div>
        <div class="fgroup"><label class="flbl">Not / GİB Yanıtı</label>
          <textarea class="ftextarea" id="efd-not">${App.escapeHtml(e.gibNot || '')}</textarea></div>`;
      App.openModal({ title: 'Gönderim Durumu Güncelle', body,
        footer: `<button class="btn" id="efd-cancel">Vazgeç</button><button class="btn btn-blue" id="efd-ok">Kaydet</button>`, wide: true });
      document.getElementById('efd-cancel').onclick = App.closeModal;
      document.getElementById('efd-ok').onclick = async () => {
        const tumu = await Store.eFaturalar.all();
        const k = tumu.find(x => x.id === e.id);
        k.durum = document.getElementById('efd-durum').value;
        k.gibNot = document.getElementById('efd-not').value.trim();
        k.sonGuncelleme = new Date().toISOString();
        await App.persist(() => Store.eFaturalar.save(tumu));
        App.toast('Durum güncellendi', 'ok');
        App.closeModal(); render(main);
      };
    });

    c.querySelectorAll('.ef-goster').forEach(b => b.onclick = () => {
      const e = d.eFaturalar.find(x => x.id === b.dataset.id);
      const body = document.createElement('div');
      body.innerHTML = `<textarea class="ftextarea" readonly style="font-family:monospace;font-size:9.5px;height:400px">${App.escapeHtml(e.xml || '')}</textarea>`;
      App.openModal({ title: 'UBL-TR XML — ' + e.faturaNo, body,
        footer: `<button class="btn" id="efx-kapat">Kapat</button>`, xwide: true });
      document.getElementById('efx-kapat').onclick = App.closeModal;
    });
  }

  // ── SEKME 3: FİRMA BİLGİLERİ ────────────────────────────────────────────
  function firmaTab(c, d, render, main) {
    const f = d.firma || {};
    const vk = EFaturaMotor.vergiKimligiKontrol(f.vergiNo);
    c.innerHTML = `<div class="card" style="max-width:720px">
      <div class="card-hdr"><div class="card-title">🏢 Firma (Satıcı) Bilgileri</div></div>
      <div class="fhint" style="margin-bottom:10px">Bu bilgiler her e-Faturada <b>satıcı</b> olarak yer alır ve GİB tarafından doğrulanır. Hatalı VKN ile gönderilen fatura reddedilir.</div>
      <div class="fgroup"><label class="flbl">Ticaret Ünvanı <span style="color:var(--red-text)">*</span></label>
        <input class="finput" id="fb-unvan" value="${App.escapeHtml(f.unvan || '')}" placeholder="örn. Örnek Mobilya Sanayi ve Ticaret A.Ş."></div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Vergi Kimlik No (VKN) <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="fb-vkn" value="${App.escapeHtml(f.vergiNo || '')}" maxlength="10" placeholder="10 haneli">
          <div id="fb-vkn-durum" style="font-size:11px;margin-top:4px">${f.vergiNo
            ? (vk.gecerli ? `<span style="color:var(--green-text)">✓ ${vk.mesaj}</span>` : `<span style="color:var(--red-text)">✗ ${vk.mesaj}</span>`)
            : ''}</div></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Vergi Dairesi</label>
          <input class="finput" id="fb-vd" value="${App.escapeHtml(f.vergiDairesi || '')}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Adres</label>
        <input class="finput" id="fb-adres" value="${App.escapeHtml(f.adres || '')}"></div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">İlçe</label>
          <input class="finput" id="fb-ilce" value="${App.escapeHtml(f.ilce || '')}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">İl</label>
          <input class="finput" id="fb-il" value="${App.escapeHtml(f.il || '')}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Fatura Seri Kodu</label>
          <input class="finput" id="fb-seri" value="${App.escapeHtml(f.faturaSeri || 'UOS')}" maxlength="3">
          <div class="fhint">3 harf — GİB fatura no formatı</div></div>
      </div>
      <div class="fgroup"><label class="flbl">Entegratör Firma</label>
        <select class="fselect" id="fb-entegrator">
          ${['', 'Uyumsoft', 'İzibiz', 'Logo', 'Paraşüt', 'Foriba', 'Mikro', 'Diğer']
            .map(e => `<option value="${e}" ${f.entegrator === e ? 'selected' : ''}>${e || '— Henüz anlaşma yok —'}</option>`).join('')}
        </select>
        <div class="fhint">GİB'e gönderim entegratör üzerinden yapılır. Anlaşma yapıldıktan sonra API bilgileri buraya eklenir.</div></div>
      <button class="btn btn-blue" id="fb-kaydet">Kaydet</button>
    </div>`;

    const vknInput = document.getElementById('fb-vkn');
    vknInput.oninput = () => {
      const k = EFaturaMotor.vergiKimligiKontrol(vknInput.value);
      const el = document.getElementById('fb-vkn-durum');
      if (!vknInput.value) { el.innerHTML = ''; return; }
      el.innerHTML = k.gecerli
        ? `<span style="color:var(--green-text)">✓ ${App.escapeHtml(k.mesaj)}</span>`
        : `<span style="color:var(--red-text)">✗ ${App.escapeHtml(k.mesaj)}</span>`;
    };
    document.getElementById('fb-kaydet').onclick = async () => {
      const unvan = document.getElementById('fb-unvan').value.trim();
      const vkn = document.getElementById('fb-vkn').value.trim();
      if (!unvan) { App.toast('Ticaret ünvanı zorunlu', 'err'); return; }
      const k = EFaturaMotor.vergiKimligiKontrol(vkn);
      if (!k.gecerli) { App.toast('VKN geçersiz: ' + k.mesaj, 'err'); return; }
      await App.persist(() => Store.firmaBilgileri.save([{
        id: (d.firma && d.firma.id) || App.uid('FRM'), unvan, vergiNo: k.no,
        vergiDairesi: document.getElementById('fb-vd').value.trim(),
        adres: document.getElementById('fb-adres').value.trim(),
        ilce: document.getElementById('fb-ilce').value.trim(),
        il: document.getElementById('fb-il').value.trim(),
        faturaSeri: document.getElementById('fb-seri').value.trim().toUpperCase() || 'UOS',
        entegrator: document.getElementById('fb-entegrator').value
      }]));
      App.toast('Firma bilgileri kaydedildi', 'ok');
      render(main);
    };
  }

  // ── SEKME 4: MÜKELLEF DURUMU ────────────────────────────────────────────
  function mukellefTab(c, d, render, main) {
    const gecersizVkn = d.musteriler.filter(m =>
      !EFaturaMotor.vergiKimligiKontrol(m.vergiNo || m.tckn).gecerli);
    let html = '';
    if (gecersizVkn.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🚫 ${gecersizVkn.length} müşterinin vergi kimliği eksik/geçersiz</div>
        <div class="fhint" style="margin-top:4px">Bu müşterilere e-Fatura veya e-Arşiv düzenlenemez. Cari kartlarından vergi/TC numarası girilmeli.</div></div>`;
    }
    html += `<div class="card">
      <div class="fhint" style="margin-bottom:8px">e-Fatura mükellefi olan müşterilere <b>e-Fatura</b>, olmayanlara <b>e-Arşiv</b> düzenlenir. Mükellefiyet GİB mükellef listesinden sorgulanır; burada işaretleyin.</div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Müşteri</th><th>Vergi No / TCKN</th><th>Doğrulama</th><th>e-Fatura Mükellefi</th><th>Senaryo</th><th></th></tr>
        ${d.musteriler.map(m => {
          const vk = EFaturaMotor.vergiKimligiKontrol(m.vergiNo || m.tckn);
          const sen = EFaturaMotor.senaryoBelirle(m);
          return `<tr${!vk.gecerli ? ' style="background:var(--red-bg)"' : ''}>
            <td><b>${App.escapeHtml(m.unvan || '—')}</b></td>
            <td class="mono" style="font-size:10.5px">${App.escapeHtml(m.vergiNo || m.tckn || '—')}</td>
            <td>${vk.gecerli
              ? `<span class="pill pill-green" style="font-size:9px">${vk.tip} ✓</span>`
              : `<span class="pill pill-red" style="font-size:9px">Geçersiz</span>`}</td>
            <td>${m.efaturaMukellefi
              ? '<span class="pill pill-blue" style="font-size:9px">Mükellef</span>'
              : '<span class="pill pill-gray" style="font-size:9px">Değil</span>'}</td>
            <td><span class="pill ${sen.senaryo === 'EFATURA' ? 'pill-blue' : 'pill-amber'}" style="font-size:9px">${sen.senaryo === 'EFATURA' ? (sen.tip === 'TICARIFATURA' ? 'Ticari' : 'Temel') : 'e-Arşiv'}</span></td>
            <td><button class="btn btn-sm btn-ghost ef-muk" data-id="${m.id}">Düzenle</button></td>
          </tr>`;
        }).join('')}
      </table></div>`;
    c.innerHTML = html;

    c.querySelectorAll('.ef-muk').forEach(b => b.onclick = () => {
      const m = d.musteriler.find(x => x.id === b.dataset.id);
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:10px"><b>${App.escapeHtml(m.unvan || '')}</b></div>
        <div class="fgroup"><label class="flbl">Vergi No (VKN) veya TC Kimlik No</label>
          <input class="finput" id="mk-vkn" value="${App.escapeHtml(m.vergiNo || m.tckn || '')}" maxlength="11">
          <div id="mk-durum" style="font-size:11px;margin-top:4px"></div></div>
        <div class="fgroup"><label class="flbl">e-Fatura Mükellefiyeti</label>
          <select class="fselect" id="mk-mukellef">
            <option value="hayir" ${!m.efaturaMukellefi ? 'selected' : ''}>Mükellef değil → e-Arşiv düzenlenir</option>
            <option value="evet" ${m.efaturaMukellefi ? 'selected' : ''}>e-Fatura mükellefi</option>
          </select>
          <div class="fhint">GİB mükellef listesinden sorgulayarak işaretleyin.</div></div>
        <div class="fgroup"><label class="flbl">Senaryo (mükellefse)</label>
          <select class="fselect" id="mk-senaryo">
            <option value="TEMEL" ${m.efaturaSenaryo !== 'TICARI' ? 'selected' : ''}>TEMEL — alıcı red edemez</option>
            <option value="TICARI" ${m.efaturaSenaryo === 'TICARI' ? 'selected' : ''}>TİCARİ — alıcı kabul/red edebilir</option>
          </select></div>`;
      App.openModal({ title: 'Mükellefiyet Bilgisi', body,
        footer: `<button class="btn" id="mk-cancel">Vazgeç</button><button class="btn btn-blue" id="mk-ok">Kaydet</button>`, wide: true });
      const inp = document.getElementById('mk-vkn');
      const guncelle = () => {
        const k = EFaturaMotor.vergiKimligiKontrol(inp.value);
        const el = document.getElementById('mk-durum');
        if (!inp.value) { el.innerHTML = ''; return; }
        el.innerHTML = k.gecerli
          ? `<span style="color:var(--green-text)">✓ ${App.escapeHtml(k.mesaj)}</span>`
          : `<span style="color:var(--red-text)">✗ ${App.escapeHtml(k.mesaj)}</span>`;
      };
      inp.oninput = guncelle; guncelle();
      document.getElementById('mk-cancel').onclick = App.closeModal;
      document.getElementById('mk-ok').onclick = async () => {
        const val = inp.value.trim();
        if (val) {
          const k = EFaturaMotor.vergiKimligiKontrol(val);
          if (!k.gecerli) { App.toast('Geçersiz: ' + k.mesaj, 'err'); return; }
        }
        const tumu = await Store.musteriler.all();
        const mm = tumu.find(x => x.id === m.id);
        mm.vergiNo = val;
        mm.efaturaMukellefi = document.getElementById('mk-mukellef').value === 'evet';
        mm.efaturaSenaryo = document.getElementById('mk-senaryo').value;
        await App.persist(() => Store.musteriler.save(tumu));
        App.toast('Mükellefiyet bilgisi güncellendi', 'ok');
        App.closeModal(); render(main);
      };
    });
  }

  return { render };
})();
