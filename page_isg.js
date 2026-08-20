// ════════════════════════════════════════════════════════════════════════════
// İŞ SAĞLIĞI VE GÜVENLİĞİ (İSG) MODÜLÜ
//
// 6331 sayılı İş Sağlığı ve Güvenliği Kanunu kapsamında bir üretim
// işletmesinde tutulması ZORUNLU kayıtları yönetir. Denetimde ilk istenen
// belgeler bunlardır.
//
//   1) Kaza & Ramak Kala  — bildirim, sınıflandırma, kök neden, kayıp gün
//   2) Risk Değerlendirme — 5×5 matris (Olasılık × Şiddet), önlem, sorumlu
//   3) KKD Zimmet         — kişisel koruyucu donanım dağıtım ve yenileme
//   4) Eğitim             — zorunlu İSG eğitimleri ve geçerlilik takibi
//   5) Sağlık Muayenesi   — periyodik muayene ve tekrar tarihi
//   6) İSG Panosu         — kaza sıklık/ağırlık oranı ve uyum göstergeleri
//
// NOT: Bu modül yasal kayıt tutmayı kolaylaştırır; İSG uzmanı ve işyeri
// hekimi yükümlülüğünün yerine geçmez.
// ════════════════════════════════════════════════════════════════════════════
PageModules.isg = (() => {
  let activeTab = 'pano';

  const bugun = () => new Date().toISOString().slice(0, 10);
  const gunFark = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
  const gunEkle = (t, g) => { const d = new Date(t + 'T00:00:00'); d.setDate(d.getDate() + g); return d.toISOString().slice(0, 10); };

  const KAZA_TIPI = {
    ramak_kala: ['Ramak Kala', 'pill-blue'],
    ilk_yardim: ['İlk Yardım', 'pill-amber'],
    is_gunu_kaybi: ['İş Günü Kayıplı', 'pill-red'],
    agir: ['Ağır Yaralanma', 'pill-red'],
    olumlu: ['Ölümlü', 'pill-red']
  };
  const KKD_TURU = ['Baret', 'Koruyucu Gözlük', 'Kulaklık / Kulak Tıkacı', 'Toz Maskesi',
    'İş Eldiveni', 'Çelik Burunlu Ayakkabı', 'Koruyucu Önlük', 'Emniyet Kemeri', 'Yüz Siperi'];
  const EGITIM_TURU = ['Temel İSG Eğitimi', 'Yangın ve Tahliye', 'İlk Yardım',
    'Makine Kullanım Güvenliği', 'Kimyasal Madde Güvenliği', 'Yüksekte Çalışma',
    'Elektrik Güvenliği', 'Ergonomi ve Manuel Taşıma'];

  // 5×5 risk matrisi: Olasılık (1-5) × Şiddet (1-5) = Risk Skoru (1-25)
  function riskSeviyesi(skor) {
    if (skor >= 15) return { ad: 'ÇOK YÜKSEK', renk: 'pill-red', aksiyon: 'Derhal durdurulmalı' };
    if (skor >= 9) return { ad: 'YÜKSEK', renk: 'pill-red', aksiyon: 'Acil önlem gerekli' };
    if (skor >= 5) return { ad: 'ORTA', renk: 'pill-amber', aksiyon: 'Planlı önlem alınmalı' };
    if (skor >= 3) return { ad: 'DÜŞÜK', renk: 'pill-blue', aksiyon: 'İzlenmeli' };
    return { ad: 'ÇOK DÜŞÜK', renk: 'pill-green', aksiyon: 'Kabul edilebilir' };
  }

  async function render(main, params) {
    if (params && params.tab) activeTab = params.tab;
    const [kazalar, riskler, kkd, egitimler, saglik, personeller] = await Promise.all([
      Store.isgKazalar.all(), Store.isgRiskler.all(), Store.isgKkdZimmet.all(),
      Store.isgEgitimler.all(), Store.isgSaglikMuayene.all(), Store.personeller.all()
    ]);
    const d = { kazalar, riskler, kkd, egitimler, saglik, personeller };

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">İş Sağlığı ve Güvenliği (İSG)</div>
        <div class="page-sub">6331 sayılı kanun kapsamında zorunlu kayıtlar — kaza, risk, KKD, eğitim ve sağlık takibi</div></div>
        <div class="page-acts" id="isg-acts"></div>
      </div>
      <div class="tabs" style="flex-wrap:wrap">
        <div class="tab ${activeTab === 'pano' ? 'active' : ''}" data-tab="pano">📊 İSG Panosu</div>
        <div class="tab ${activeTab === 'kaza' ? 'active' : ''}" data-tab="kaza">🚨 Kaza & Ramak Kala</div>
        <div class="tab ${activeTab === 'risk' ? 'active' : ''}" data-tab="risk">⚠ Risk Değerlendirme</div>
        <div class="tab ${activeTab === 'kkd' ? 'active' : ''}" data-tab="kkd">🦺 KKD Zimmet</div>
        <div class="tab ${activeTab === 'egitim' ? 'active' : ''}" data-tab="egitim">🎓 Eğitim</div>
        <div class="tab ${activeTab === 'saglik' ? 'active' : ''}" data-tab="saglik">🩺 Sağlık Muayenesi</div>
      </div>
      <div id="isg-content"></div>`;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const acts = document.getElementById('isg-acts');
    const content = document.getElementById('isg-content');
    if (activeTab === 'pano') panoTab(content, d);
    else if (activeTab === 'kaza') { acts.innerHTML = '<button class="btn btn-red" id="isg-yeni">+ Kaza / Ramak Kala Bildir</button>'; kazaTab(content, d, render, main); }
    else if (activeTab === 'risk') { acts.innerHTML = '<button class="btn btn-blue" id="isg-yeni">+ Risk Kaydı</button>'; riskTab(content, d, render, main); }
    else if (activeTab === 'kkd') { acts.innerHTML = '<button class="btn btn-blue" id="isg-yeni">+ KKD Zimmet</button>'; kkdTab(content, d, render, main); }
    else if (activeTab === 'egitim') { acts.innerHTML = '<button class="btn btn-blue" id="isg-yeni">+ Eğitim Kaydı</button>'; egitimTab(content, d, render, main); }
    else { acts.innerHTML = '<button class="btn btn-blue" id="isg-yeni">+ Muayene Kaydı</button>'; saglikTab(content, d, render, main); }

    const yeniBtn = document.getElementById('isg-yeni');
    if (yeniBtn) yeniBtn.onclick = () => {
      if (activeTab === 'kaza') kazaFormu(null, d, render, main);
      else if (activeTab === 'risk') riskFormu(null, d, render, main);
      else if (activeTab === 'kkd') kkdFormu(null, d, render, main);
      else if (activeTab === 'egitim') egitimFormu(null, d, render, main);
      else saglikFormu(null, d, render, main);
    };
  }

  // ── İSG PANOSU ──────────────────────────────────────────────────────────
  function panoTab(c, d) {
    const yil = new Date().getFullYear();
    const yilKazalari = d.kazalar.filter(k => (k.tarih || '').startsWith(String(yil)));
    const gercekKazalar = yilKazalari.filter(k => k.tip !== 'ramak_kala');
    const ramakKala = yilKazalari.filter(k => k.tip === 'ramak_kala');
    const kayipGun = yilKazalari.reduce((a, k) => a + (k.kayipGun || 0), 0);
    const aktifPersonel = d.personeller.filter(p => p.durum === 'aktif').length || 1;
    // Yıllık çalışma saati ≈ personel × 2250 saat (45 sa/hafta × 50 hafta)
    const calismaSaati = aktifPersonel * 2250;
    const siklikOrani = calismaSaati > 0 ? (gercekKazalar.length * 1000000) / calismaSaati : 0;
    const agirlikOrani = calismaSaati > 0 ? (kayipGun * 1000) / calismaSaati : 0;

    const acikRiskler = d.riskler.filter(r => r.durum !== 'kapandi');
    const yuksekRiskler = acikRiskler.filter(r => (r.skor || 0) >= 9);
    const kkdYenileme = d.kkd.filter(k => k.yenilemeTarihi && k.yenilemeTarihi <= bugun());
    const egitimSuresiDolan = d.egitimler.filter(e => e.gecerlilikTarihi && e.gecerlilikTarihi <= bugun());
    const muayeneSuresiDolan = d.saglik.filter(s => s.sonrakiMuayene && s.sonrakiMuayene <= bugun());
    const kazasizGun = d.kazalar.length
      ? gunFark(bugun(), [...d.kazalar].filter(k => k.tip !== 'ramak_kala')
          .map(k => k.tarih).filter(Boolean).sort().pop() || bugun())
      : null;

    let html = `<div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-lbl">Kazasız Gün</div>
        <div class="kpi-val ${kazasizGun === null ? 'green' : kazasizGun > 90 ? 'green' : kazasizGun > 30 ? 'amber' : 'red'}">${kazasizGun === null ? '—' : kazasizGun}</div>
        <div class="muted" style="font-size:10.5px">Son kazadan bu yana</div></div>
      <div class="kpi"><div class="kpi-lbl">Kaza Sıklık Oranı</div>
        <div class="kpi-val ${siklikOrani === 0 ? 'green' : siklikOrani < 10 ? 'amber' : 'red'}">${App.fmt(siklikOrani, 1)}</div>
        <div class="muted" style="font-size:10.5px">Milyon saatte kaza (${yil})</div></div>
      <div class="kpi"><div class="kpi-lbl">Kaza Ağırlık Oranı</div>
        <div class="kpi-val ${agirlikOrani === 0 ? 'green' : agirlikOrani < 0.5 ? 'amber' : 'red'}">${App.fmt(agirlikOrani, 2)}</div>
        <div class="muted" style="font-size:10.5px">Bin saatte kayıp gün</div></div>
      <div class="kpi"><div class="kpi-lbl">Yüksek Risk</div>
        <div class="kpi-val ${yuksekRiskler.length ? 'red' : 'green'}">${yuskekSayi(yuksekRiskler)}</div>
        <div class="muted" style="font-size:10.5px">${acikRiskler.length} açık risk kaydı</div></div>
    </div>`;

    // Uyum uyarıları
    const uyarilar = [];
    if (kkdYenileme.length) uyarilar.push(`<b>${kkdYenileme.length} KKD</b> yenileme tarihi geçmiş — kullanıcıya yeni ekipman verilmeli`);
    if (egitimSuresiDolan.length) uyarilar.push(`<b>${egitimSuresiDolan.length} eğitim</b> geçerlilik süresi dolmuş — tazeleme eğitimi zorunlu`);
    if (muayeneSuresiDolan.length) uyarilar.push(`<b>${muayeneSuresiDolan.length} personelin</b> periyodik sağlık muayenesi gecikmiş`);
    if (yuksekRiskler.length) uyarilar.push(`<b>${yuksekRiskler.length} yüksek/çok yüksek risk</b> açık durumda — önlem alınmalı`);
    if (uyarilar.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🚨 YASAL UYUM UYARILARI</div>
        ${uyarilar.map(u => `<div style="font-size:11.5px;padding:3px 0">⚠ ${u}</div>`).join('')}
        <div class="fhint" style="margin-top:6px">Bu kalemler İSG denetiminde ilk kontrol edilenlerdir.</div></div>`;
    } else {
      html += `<div class="card" style="border:1px solid var(--green);background:var(--green-bg);margin-bottom:12px">
        <div style="font-size:12px">✓ <b>Açık uyum sorunu görünmüyor.</b> KKD, eğitim ve sağlık muayenesi kayıtları güncel.</div></div>`;
    }

    // Kaza tipi dağılımı
    html += `<div class="grid grid-2" style="margin-bottom:14px">
      <div class="card"><div class="card-hdr"><div class="card-title">🚨 ${yil} Yılı Kaza Dağılımı</div></div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Tip</th><th class="r">Adet</th><th class="r">Kayıp Gün</th></tr>
          ${Object.entries(KAZA_TIPI).map(([k, [ad, renk]]) => {
            const liste = yilKazalari.filter(x => x.tip === k);
            return `<tr><td><span class="pill ${renk}" style="font-size:9.5px">${ad}</span></td>
              <td class="r"><b>${liste.length}</b></td>
              <td class="r">${liste.reduce((a, x) => a + (x.kayipGun || 0), 0)}</td></tr>`;
          }).join('')}
          <tr style="background:var(--bg)"><td><b>TOPLAM</b></td>
            <td class="r"><b>${yilKazalari.length}</b></td><td class="r"><b>${kayipGun}</b></td></tr>
        </table>
        <div class="fhint" style="margin-top:6px">Ramak kala bildirimi <b>${ramakKala.length}</b>. Ramak kala oranının yüksek olması iyi bir göstergedir — bildirim kültürü var demektir.</div>
      </div>
      <div class="card"><div class="card-hdr"><div class="card-title">📋 Uyum Durumu</div></div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Alan</th><th class="r">Toplam</th><th class="r">Sorunlu</th><th>Durum</th></tr>
          ${[['KKD Zimmet', d.kkd.length, kkdYenileme.length],
             ['İSG Eğitimi', d.egitimler.length, egitimSuresiDolan.length],
             ['Sağlık Muayenesi', d.saglik.length, muayeneSuresiDolan.length],
             ['Risk Kaydı', d.riskler.length, yuksekRiskler.length]].map(([ad, toplam, sorun]) =>
            `<tr><td><b>${ad}</b></td><td class="r">${toplam}</td>
              <td class="r" style="color:var(--${sorun ? 'red' : 'green'}-text)"><b>${sorun}</b></td>
              <td>${sorun ? '<span class="pill pill-red" style="font-size:9px">Aksiyon gerekli</span>'
                : toplam ? '<span class="pill pill-green" style="font-size:9px">Uygun</span>'
                : '<span class="pill pill-gray" style="font-size:9px">Kayıt yok</span>'}</td></tr>`).join('')}
        </table>
      </div></div>`;

    // Bölüm bazlı kaza dağılımı
    const bolumGrup = new Map();
    d.kazalar.forEach(k => {
      const b = k.bolum || 'Belirtilmemiş';
      if (!bolumGrup.has(b)) bolumGrup.set(b, { bolum: b, kaza: 0, ramak: 0, kayipGun: 0 });
      const g = bolumGrup.get(b);
      if (k.tip === 'ramak_kala') g.ramak++; else g.kaza++;
      g.kayipGun += k.kayipGun || 0;
    });
    if (bolumGrup.size) {
      html += `<div class="card"><div class="card-hdr"><div class="card-title">🏭 Bölüm Bazlı Kaza Dağılımı</div></div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Bölüm / Hat</th><th class="r">Kaza</th><th class="r">Ramak Kala</th><th class="r">Kayıp Gün</th></tr>
          ${[...bolumGrup.values()].sort((a, b) => b.kaza - a.kaza).map(g => `<tr${g.kaza >= 2 ? ' style="background:var(--red-bg)"' : ''}>
            <td><b>${App.escapeHtml(g.bolum)}</b></td>
            <td class="r"><b>${g.kaza}</b></td><td class="r">${g.ramak}</td><td class="r">${g.kayipGun}</td></tr>`).join('')}
        </table></div>`;
    }
    c.innerHTML = html;
  }
  function yuskekSayi(l) { return l.length; }

  // ── KAZA & RAMAK KALA ───────────────────────────────────────────────────
  function kazaTab(c, d, render, main) {
    if (!d.kazalar.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Kayıt yok</div>
        <div class="edesc">İş kazası ve ramak kala bildirimleri burada tutulur. Ramak kala bildirimi, kaza olmadan tehlikeyi görmenin en etkili yoludur — teşvik edilmelidir.</div></div></div>`;
      return;
    }
    c.innerHTML = `<div class="card">
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Tarih</th><th>Tip</th><th>Personel</th><th>Bölüm</th><th>Olay</th><th class="r">Kayıp Gün</th><th>Durum</th><th></th></tr>
        ${[...d.kazalar].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).map(k => {
          const [ad, renk] = KAZA_TIPI[k.tip] || [k.tip, 'pill-gray'];
          return `<tr>
            <td class="mono" style="font-size:10.5px">${k.tarih || '—'}${k.saat ? '<br><span class="muted">' + k.saat + '</span>' : ''}</td>
            <td><span class="pill ${renk}" style="font-size:9.5px">${ad}</span></td>
            <td>${App.escapeHtml(k.personelAdi || '—')}</td>
            <td style="font-size:10.5px">${App.escapeHtml(k.bolum || '—')}</td>
            <td style="font-size:11px;max-width:260px">${App.escapeHtml((k.olay || '').slice(0, 90))}</td>
            <td class="r">${k.kayipGun || 0}</td>
            <td><span class="pill ${k.durum === 'kapandi' ? 'pill-green' : 'pill-amber'}" style="font-size:9px">${k.durum === 'kapandi' ? 'Kapandı' : 'Açık'}</span></td>
            <td><button class="btn btn-sm btn-ghost isg-kaza-duzenle" data-id="${k.id}">Detay</button></td>
          </tr>`;
        }).join('')}
      </table></div>`;
    c.querySelectorAll('.isg-kaza-duzenle').forEach(b => b.onclick = () =>
      kazaFormu(d.kazalar.find(x => x.id === b.dataset.id), d, render, main));
  }

  function kazaFormu(kayit, d, render, main) {
    const k = kayit || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Tarih <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="kz-tarih" type="date" value="${k.tarih || bugun()}"></div>
        <div class="fgroup" style="flex:0.7"><label class="flbl">Saat</label>
          <input class="finput" id="kz-saat" type="time" value="${k.saat || ''}"></div>
        <div class="fgroup" style="flex:1.2"><label class="flbl">Olay Tipi <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="kz-tip">
            ${Object.entries(KAZA_TIPI).map(([v, [ad]]) => `<option value="${v}" ${k.tip === v ? 'selected' : ''}>${ad}</option>`).join('')}
          </select></div>
      </div>
      <div class="frow">
        <div class="fgroup" style="flex:1.2"><label class="flbl">Personel</label>
          <select class="fselect" id="kz-personel">
            <option value="">— Seçilmedi —</option>
            ${d.personeller.filter(p => p.durum === 'aktif').map(p => `<option value="${p.id}" ${k.personelId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Bölüm / Hat</label>
          <input class="finput" id="kz-bolum" value="${App.escapeHtml(k.bolum || '')}" placeholder="örn. CNC HATTI"></div>
        <div class="fgroup" style="flex:0.7"><label class="flbl">Kayıp İş Günü</label>
          <input class="finput" id="kz-kayip" type="number" min="0" value="${k.kayipGun || 0}"></div>
      </div>
      <div class="fgroup"><label class="flbl">Olayın Tanımı <span style="color:var(--red-text)">*</span></label>
        <textarea class="ftextarea" id="kz-olay" placeholder="Ne oldu, nasıl oldu?">${App.escapeHtml(k.olay || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">Kök Neden Analizi</label>
        <textarea class="ftextarea" id="kz-koknedeni" placeholder="Neden oldu? (5 Neden yöntemi önerilir)">${App.escapeHtml(k.kokNeden || '')}</textarea></div>
      <div class="fgroup"><label class="flbl">Alınan / Alınacak Önlem</label>
        <textarea class="ftextarea" id="kz-onlem">${App.escapeHtml(k.onlem || '')}</textarea></div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">SGK Bildirimi Yapıldı mı?</label>
          <select class="fselect" id="kz-sgk">
            <option value="hayir" ${k.sgkBildirim !== 'evet' ? 'selected' : ''}>Hayır / Gerekmiyor</option>
            <option value="evet" ${k.sgkBildirim === 'evet' ? 'selected' : ''}>Evet, bildirildi</option>
          </select>
          <div class="fhint">İş kazaları 3 iş günü içinde SGK'ya bildirilmelidir.</div></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Durum</label>
          <select class="fselect" id="kz-durum">
            <option value="acik" ${k.durum !== 'kapandi' ? 'selected' : ''}>Açık — önlem sürüyor</option>
            <option value="kapandi" ${k.durum === 'kapandi' ? 'selected' : ''}>Kapandı</option>
          </select></div>
      </div>`;
    App.openModal({ title: kayit ? '🚨 Kaza Kaydı Detayı' : '🚨 Kaza / Ramak Kala Bildirimi', body,
      footer: `<button class="btn" id="kz-cancel">Vazgeç</button><button class="btn btn-red" id="kz-ok">Kaydet</button>`, xwide: true });
    document.getElementById('kz-cancel').onclick = App.closeModal;
    document.getElementById('kz-ok').onclick = async () => {
      const tarih = document.getElementById('kz-tarih').value;
      const olay = document.getElementById('kz-olay').value.trim();
      if (!tarih || !olay) { App.toast('Tarih ve olay tanımı zorunlu', 'err'); return; }
      const pid = document.getElementById('kz-personel').value;
      const p = d.personeller.find(x => x.id === pid);
      const kayitYeni = {
        id: k.id || App.uid('KAZ'), tarih, saat: document.getElementById('kz-saat').value,
        tip: document.getElementById('kz-tip').value,
        personelId: pid || null, personelAdi: p ? p.adSoyad : '',
        bolum: document.getElementById('kz-bolum').value.trim(),
        kayipGun: parseInt(document.getElementById('kz-kayip').value) || 0,
        olay, kokNeden: document.getElementById('kz-koknedeni').value.trim(),
        onlem: document.getElementById('kz-onlem').value.trim(),
        sgkBildirim: document.getElementById('kz-sgk').value,
        durum: document.getElementById('kz-durum').value,
        kayitTarihi: k.kayitTarihi || bugun()
      };
      await App.persist(() => Store.isgKazalar.upsert(kayitYeni));
      App.toast(kayit ? 'Kaza kaydı güncellendi' : 'Kaza/ramak kala bildirimi kaydedildi', 'ok');
      App.closeModal(); render(main);
    };
  }

  // ── RİSK DEĞERLENDİRME ──────────────────────────────────────────────────
  function riskTab(c, d, render, main) {
    if (!d.riskler.length) {
      c.innerHTML = `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Risk değerlendirmesi yapılmamış</div>
        <div class="edesc">6331 sayılı kanun gereği her işyeri risk değerlendirmesi yapmak zorundadır. Bölüm/makine bazlı tehlikeleri kaydedin: Risk Skoru = Olasılık × Şiddet (5×5 matris).</div></div></div>`;
      return;
    }
    const sirali = [...d.riskler].sort((a, b) => (b.skor || 0) - (a.skor || 0));
    c.innerHTML = `<div class="card">
      <div class="fhint" style="margin-bottom:8px"><b>Risk Skoru = Olasılık × Şiddet</b> (her biri 1–5). 15+ çok yüksek, 9–14 yüksek, 5–8 orta, 3–4 düşük.</div>
      <table class="dtable" style="font-size:11.5px">
        <tr><th>Bölüm / Ekipman</th><th>Tehlike</th><th class="r">Ola.</th><th class="r">Şid.</th><th class="r">Skor</th>
        <th>Seviye</th><th>Önlem</th><th>Sorumlu</th><th>Termin</th><th></th></tr>
        ${sirali.map(r => {
          const sev = riskSeviyesi(r.skor || 0);
          const gecikti = r.termin && r.termin < bugun() && r.durum !== 'kapandi';
          return `<tr${gecikti ? ' style="background:var(--red-bg)"' : ''}>
            <td><b>${App.escapeHtml(r.bolum || '—')}</b>${r.ekipman ? `<br><span class="muted" style="font-size:9.5px">${App.escapeHtml(r.ekipman)}</span>` : ''}</td>
            <td style="font-size:11px;max-width:200px">${App.escapeHtml((r.tehlike || '').slice(0, 70))}</td>
            <td class="r">${r.olasilik || '—'}</td><td class="r">${r.siddet || '—'}</td>
            <td class="r"><b>${r.skor || 0}</b></td>
            <td><span class="pill ${sev.renk}" style="font-size:9px">${sev.ad}</span></td>
            <td style="font-size:10.5px;max-width:180px">${App.escapeHtml((r.onlem || '').slice(0, 60))}</td>
            <td style="font-size:10.5px">${App.escapeHtml(r.sorumlu || '—')}</td>
            <td class="mono" style="font-size:10px">${r.termin || '—'}${gecikti ? '<br><span class="pill pill-red" style="font-size:8.5px">GECİKTİ</span>' : ''}</td>
            <td><button class="btn btn-sm btn-ghost isg-risk-duzenle" data-id="${r.id}">Düzenle</button></td>
          </tr>`;
        }).join('')}
      </table></div>`;
    c.querySelectorAll('.isg-risk-duzenle').forEach(b => b.onclick = () =>
      riskFormu(d.riskler.find(x => x.id === b.dataset.id), d, render, main));
  }

  function riskFormu(kayit, d, render, main) {
    const r = kayit || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Bölüm / Hat <span style="color:var(--red-text)">*</span></label>
          <input class="finput" id="rs-bolum" value="${App.escapeHtml(r.bolum || '')}" placeholder="örn. BOYA BÖLÜMÜ"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Ekipman / Faaliyet</label>
          <input class="finput" id="rs-ekipman" value="${App.escapeHtml(r.ekipman || '')}" placeholder="örn. CNC Makinesi"></div>
      </div>
      <div class="fgroup"><label class="flbl">Tehlike Tanımı <span style="color:var(--red-text)">*</span></label>
        <textarea class="ftextarea" id="rs-tehlike" placeholder="örn. Kesici uçlara temas riski">${App.escapeHtml(r.tehlike || '')}</textarea></div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Olasılık (1–5)</label>
          <select class="fselect" id="rs-olasilik">
            ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${r.olasilik === n ? 'selected' : ''}>${n} — ${['Çok düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok yüksek'][n - 1]}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Şiddet (1–5)</label>
          <select class="fselect" id="rs-siddet">
            ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${r.siddet === n ? 'selected' : ''}>${n} — ${['Çok hafif', 'Hafif', 'Orta', 'Ciddi', 'Ölümcül'][n - 1]}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Hesaplanan Risk</label>
          <div id="rs-skor" style="padding:9px 0;font-size:14px;font-weight:700"></div></div>
      </div>
      <div class="fgroup"><label class="flbl">Alınacak Önlem</label>
        <textarea class="ftextarea" id="rs-onlem">${App.escapeHtml(r.onlem || '')}</textarea></div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Sorumlu</label>
          <input class="finput" id="rs-sorumlu" value="${App.escapeHtml(r.sorumlu || '')}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Termin</label>
          <input class="finput" id="rs-termin" type="date" value="${r.termin || ''}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Durum</label>
          <select class="fselect" id="rs-durum">
            <option value="acik" ${r.durum !== 'kapandi' ? 'selected' : ''}>Açık</option>
            <option value="kapandi" ${r.durum === 'kapandi' ? 'selected' : ''}>Önlem alındı — kapandı</option>
          </select></div>
      </div>`;
    App.openModal({ title: kayit ? '⚠ Risk Kaydı' : '⚠ Yeni Risk Değerlendirmesi', body,
      footer: `<button class="btn" id="rs-cancel">Vazgeç</button><button class="btn btn-blue" id="rs-ok">Kaydet</button>`, xwide: true });
    const skorGuncelle = () => {
      const o = parseInt(document.getElementById('rs-olasilik').value) || 1;
      const s = parseInt(document.getElementById('rs-siddet').value) || 1;
      const sk = o * s; const sev = riskSeviyesi(sk);
      document.getElementById('rs-skor').innerHTML =
        `<span class="pill ${sev.renk}" style="font-size:11px">${sk} — ${sev.ad}</span><br><span class="muted" style="font-size:10px">${sev.aksiyon}</span>`;
    };
    document.getElementById('rs-olasilik').onchange = skorGuncelle;
    document.getElementById('rs-siddet').onchange = skorGuncelle;
    skorGuncelle();
    document.getElementById('rs-cancel').onclick = App.closeModal;
    document.getElementById('rs-ok').onclick = async () => {
      const bolum = document.getElementById('rs-bolum').value.trim();
      const tehlike = document.getElementById('rs-tehlike').value.trim();
      if (!bolum || !tehlike) { App.toast('Bölüm ve tehlike tanımı zorunlu', 'err'); return; }
      const o = parseInt(document.getElementById('rs-olasilik').value) || 1;
      const s = parseInt(document.getElementById('rs-siddet').value) || 1;
      await App.persist(() => Store.isgRiskler.upsert({
        id: r.id || App.uid('RSK'), bolum, ekipman: document.getElementById('rs-ekipman').value.trim(),
        tehlike, olasilik: o, siddet: s, skor: o * s,
        onlem: document.getElementById('rs-onlem').value.trim(),
        sorumlu: document.getElementById('rs-sorumlu').value.trim(),
        termin: document.getElementById('rs-termin').value,
        durum: document.getElementById('rs-durum').value,
        kayitTarihi: r.kayitTarihi || bugun()
      }));
      App.toast('Risk kaydı kaydedildi (Skor: ' + (o * s) + ')', 'ok');
      App.closeModal(); render(main);
    };
  }

  // ── KKD ZİMMET ──────────────────────────────────────────────────────────
  function kkdTab(c, d, render, main) {
    const yenilemeGeldi = d.kkd.filter(k => k.yenilemeTarihi && k.yenilemeTarihi <= bugun());
    let html = '';
    if (yenilemeGeldi.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🦺 ${yenilemeGeldi.length} KKD'nin yenileme zamanı geldi</div>
        ${yenilemeGeldi.slice(0, 6).map(k => `<div style="font-size:11.5px;padding:3px 0">⚠ <b>${App.escapeHtml(k.personelAdi)}</b> — ${App.escapeHtml(k.kkdTuru)} (yenileme: ${k.yenilemeTarihi})</div>`).join('')}
      </div>`;
    }
    if (!d.kkd.length) {
      html += `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">KKD zimmet kaydı yok</div>
        <div class="edesc">Kişisel koruyucu donanımların kime, ne zaman verildiği kayıt altına alınmalıdır. Denetimde zimmet tutanağı istenir.</div></div></div>`;
    } else {
      html += `<div class="card">
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Personel</th><th>KKD Türü</th><th>Veriliş</th><th>Yenileme</th><th class="r">Adet</th><th>Durum</th><th></th></tr>
          ${[...d.kkd].sort((a, b) => (a.yenilemeTarihi || '9999').localeCompare(b.yenilemeTarihi || '9999')).map(k => {
            const gecti = k.yenilemeTarihi && k.yenilemeTarihi <= bugun();
            const yakin = k.yenilemeTarihi && !gecti && gunFark(k.yenilemeTarihi, bugun()) <= 30;
            return `<tr${gecti ? ' style="background:var(--red-bg)"' : ''}>
              <td><b>${App.escapeHtml(k.personelAdi || '—')}</b></td>
              <td>${App.escapeHtml(k.kkdTuru || '—')}</td>
              <td class="mono" style="font-size:10.5px">${k.verilisTarihi || '—'}</td>
              <td class="mono" style="font-size:10.5px">${k.yenilemeTarihi || '—'}</td>
              <td class="r">${k.adet || 1}</td>
              <td>${gecti ? '<span class="pill pill-red" style="font-size:9px">Süresi geçti</span>'
                : yakin ? '<span class="pill pill-amber" style="font-size:9px">Yaklaşıyor</span>'
                : '<span class="pill pill-green" style="font-size:9px">Geçerli</span>'}</td>
              <td><button class="btn btn-sm btn-ghost isg-kkd-duzenle" data-id="${k.id}">Düzenle</button></td>
            </tr>`;
          }).join('')}
        </table></div>`;
    }
    c.innerHTML = html;
    c.querySelectorAll('.isg-kkd-duzenle').forEach(b => b.onclick = () =>
      kkdFormu(d.kkd.find(x => x.id === b.dataset.id), d, render, main));
  }

  function kkdFormu(kayit, d, render, main) {
    const k = kayit || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup" style="flex:1.2"><label class="flbl">Personel <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="kd-personel">
            <option value="">— Seçiniz —</option>
            ${d.personeller.filter(p => p.durum === 'aktif').map(p => `<option value="${p.id}" ${k.personelId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1.2"><label class="flbl">KKD Türü <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="kd-tur">
            ${KKD_TURU.map(t => `<option value="${t}" ${k.kkdTuru === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:0.5"><label class="flbl">Adet</label>
          <input class="finput" id="kd-adet" type="number" min="1" value="${k.adet || 1}"></div>
      </div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Veriliş Tarihi</label>
          <input class="finput" id="kd-verilis" type="date" value="${k.verilisTarihi || bugun()}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Kullanım Ömrü (ay)</label>
          <input class="finput" id="kd-omur" type="number" min="1" value="${k.omurAy || 12}">
          <div class="fhint">Yenileme tarihi otomatik hesaplanır</div></div>
      </div>
      <div class="fgroup"><label class="flbl">Not</label><input class="finput" id="kd-not" value="${App.escapeHtml(k.not || '')}"></div>`;
    App.openModal({ title: '🦺 KKD Zimmet Kaydı', body,
      footer: `<button class="btn" id="kd-cancel">Vazgeç</button><button class="btn btn-blue" id="kd-ok">Kaydet</button>`, wide: true });
    document.getElementById('kd-cancel').onclick = App.closeModal;
    document.getElementById('kd-ok').onclick = async () => {
      const pid = document.getElementById('kd-personel').value;
      if (!pid) { App.toast('Personel seçin', 'err'); return; }
      const p = d.personeller.find(x => x.id === pid);
      const verilis = document.getElementById('kd-verilis').value || bugun();
      const omurAy = parseInt(document.getElementById('kd-omur').value) || 12;
      await App.persist(() => Store.isgKkdZimmet.upsert({
        id: k.id || App.uid('KKD'), personelId: pid, personelAdi: p ? p.adSoyad : '',
        kkdTuru: document.getElementById('kd-tur').value,
        adet: parseInt(document.getElementById('kd-adet').value) || 1,
        verilisTarihi: verilis, omurAy, yenilemeTarihi: gunEkle(verilis, omurAy * 30),
        not: document.getElementById('kd-not').value.trim()
      }));
      App.toast('KKD zimmet kaydedildi', 'ok');
      App.closeModal(); render(main);
    };
  }

  // ── EĞİTİM ──────────────────────────────────────────────────────────────
  function egitimTab(c, d, render, main) {
    const suresiDolan = d.egitimler.filter(e => e.gecerlilikTarihi && e.gecerlilikTarihi <= bugun());
    let html = '';
    if (suresiDolan.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🎓 ${suresiDolan.length} eğitimin geçerlilik süresi doldu</div>
        <div class="fhint" style="margin-top:4px">Temel İSG eğitimi tehlike sınıfına göre 1–3 yılda bir tekrarlanmalıdır.</div></div>`;
    }
    if (!d.egitimler.length) {
      html += `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Eğitim kaydı yok</div>
        <div class="edesc">İSG eğitimleri yasal zorunluluktur ve katılım tutanakları saklanmalıdır.</div></div></div>`;
    } else {
      html += `<div class="card">
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Personel</th><th>Eğitim</th><th>Tarih</th><th class="r">Süre</th><th>Geçerlilik</th><th>Eğitmen</th><th>Durum</th><th></th></tr>
          ${[...d.egitimler].sort((a, b) => (a.gecerlilikTarihi || '9999').localeCompare(b.gecerlilikTarihi || '9999')).map(e => {
            const gecti = e.gecerlilikTarihi && e.gecerlilikTarihi <= bugun();
            const yakin = e.gecerlilikTarihi && !gecti && gunFark(e.gecerlilikTarihi, bugun()) <= 60;
            return `<tr${gecti ? ' style="background:var(--red-bg)"' : ''}>
              <td><b>${App.escapeHtml(e.personelAdi || '—')}</b></td>
              <td style="font-size:11px">${App.escapeHtml(e.egitimTuru || '—')}</td>
              <td class="mono" style="font-size:10.5px">${e.tarih || '—'}</td>
              <td class="r">${e.sureSaat || '—'} sa</td>
              <td class="mono" style="font-size:10.5px">${e.gecerlilikTarihi || '—'}</td>
              <td style="font-size:10.5px">${App.escapeHtml(e.egitmen || '—')}</td>
              <td>${gecti ? '<span class="pill pill-red" style="font-size:9px">Süresi doldu</span>'
                : yakin ? '<span class="pill pill-amber" style="font-size:9px">Yaklaşıyor</span>'
                : '<span class="pill pill-green" style="font-size:9px">Geçerli</span>'}</td>
              <td><button class="btn btn-sm btn-ghost isg-eg-duzenle" data-id="${e.id}">Düzenle</button></td>
            </tr>`;
          }).join('')}
        </table></div>`;
    }
    c.innerHTML = html;
    c.querySelectorAll('.isg-eg-duzenle').forEach(b => b.onclick = () =>
      egitimFormu(d.egitimler.find(x => x.id === b.dataset.id), d, render, main));
  }

  function egitimFormu(kayit, d, render, main) {
    const e = kayit || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Personel <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="eg-personel">
            <option value="">— Seçiniz —</option>
            ${d.personeller.filter(p => p.durum === 'aktif').map(p => `<option value="${p.id}" ${e.personelId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1.3"><label class="flbl">Eğitim Türü</label>
          <select class="fselect" id="eg-tur">
            ${EGITIM_TURU.map(t => `<option value="${t}" ${e.egitimTuru === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select></div>
      </div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Eğitim Tarihi</label>
          <input class="finput" id="eg-tarih" type="date" value="${e.tarih || bugun()}"></div>
        <div class="fgroup" style="flex:0.7"><label class="flbl">Süre (saat)</label>
          <input class="finput" id="eg-sure" type="number" min="0" value="${e.sureSaat || 8}"></div>
        <div class="fgroup" style="flex:0.8"><label class="flbl">Geçerlilik (yıl)</label>
          <select class="fselect" id="eg-gecerlilik">
            <option value="1" ${e.gecerlilikYil === 1 ? 'selected' : ''}>1 yıl (Çok tehlikeli)</option>
            <option value="2" ${e.gecerlilikYil === 2 ? 'selected' : ''}>2 yıl (Tehlikeli)</option>
            <option value="3" ${(!e.gecerlilikYil || e.gecerlilikYil === 3) ? 'selected' : ''}>3 yıl (Az tehlikeli)</option>
          </select></div>
      </div>
      <div class="fgroup"><label class="flbl">Eğitmen / Kurum</label>
        <input class="finput" id="eg-egitmen" value="${App.escapeHtml(e.egitmen || '')}"></div>`;
    App.openModal({ title: '🎓 İSG Eğitim Kaydı', body,
      footer: `<button class="btn" id="eg-cancel">Vazgeç</button><button class="btn btn-blue" id="eg-ok">Kaydet</button>`, wide: true });
    document.getElementById('eg-cancel').onclick = App.closeModal;
    document.getElementById('eg-ok').onclick = async () => {
      const pid = document.getElementById('eg-personel').value;
      if (!pid) { App.toast('Personel seçin', 'err'); return; }
      const p = d.personeller.find(x => x.id === pid);
      const tarih = document.getElementById('eg-tarih').value || bugun();
      const yil = parseInt(document.getElementById('eg-gecerlilik').value) || 3;
      await App.persist(() => Store.isgEgitimler.upsert({
        id: e.id || App.uid('EGT'), personelId: pid, personelAdi: p ? p.adSoyad : '',
        egitimTuru: document.getElementById('eg-tur').value, tarih,
        sureSaat: parseFloat(document.getElementById('eg-sure').value) || 0,
        gecerlilikYil: yil, gecerlilikTarihi: gunEkle(tarih, yil * 365),
        egitmen: document.getElementById('eg-egitmen').value.trim()
      }));
      App.toast('Eğitim kaydı kaydedildi', 'ok');
      App.closeModal(); render(main);
    };
  }

  // ── SAĞLIK MUAYENESİ ────────────────────────────────────────────────────
  function saglikTab(c, d, render, main) {
    const gecikmis = d.saglik.filter(s => s.sonrakiMuayene && s.sonrakiMuayene <= bugun());
    let html = '';
    if (gecikmis.length) {
      html += `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
        <div class="card-title" style="color:var(--red-text)">🩺 ${gecikmis.length} personelin periyodik muayenesi gecikmiş</div></div>`;
    }
    if (!d.saglik.length) {
      html += `<div class="card"><div class="empty-state" style="padding:30px">
        <div class="etitle">Sağlık muayenesi kaydı yok</div>
        <div class="edesc">İşe giriş ve periyodik sağlık muayeneleri yasal zorunluluktur. Tehlike sınıfına göre 1–5 yılda bir tekrarlanır.</div></div></div>`;
    } else {
      html += `<div class="card">
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Personel</th><th>Muayene Tipi</th><th>Tarih</th><th>Sonraki</th><th>Sonuç</th><th>Durum</th><th></th></tr>
          ${[...d.saglik].sort((a, b) => (a.sonrakiMuayene || '9999').localeCompare(b.sonrakiMuayene || '9999')).map(s => {
            const gecti = s.sonrakiMuayene && s.sonrakiMuayene <= bugun();
            return `<tr${gecti ? ' style="background:var(--red-bg)"' : ''}>
              <td><b>${App.escapeHtml(s.personelAdi || '—')}</b></td>
              <td style="font-size:11px">${App.escapeHtml(s.tip || '—')}</td>
              <td class="mono" style="font-size:10.5px">${s.tarih || '—'}</td>
              <td class="mono" style="font-size:10.5px">${s.sonrakiMuayene || '—'}</td>
              <td>${s.sonuc === 'uygun' ? '<span class="pill pill-green" style="font-size:9px">Çalışmaya uygun</span>'
                : s.sonuc === 'sartli' ? '<span class="pill pill-amber" style="font-size:9px">Şartlı uygun</span>'
                : '<span class="pill pill-red" style="font-size:9px">Uygun değil</span>'}</td>
              <td>${gecti ? '<span class="pill pill-red" style="font-size:9px">Gecikmiş</span>' : '<span class="pill pill-green" style="font-size:9px">Güncel</span>'}</td>
              <td><button class="btn btn-sm btn-ghost isg-sg-duzenle" data-id="${s.id}">Düzenle</button></td>
            </tr>`;
          }).join('')}
        </table></div>`;
    }
    c.innerHTML = html;
    c.querySelectorAll('.isg-sg-duzenle').forEach(b => b.onclick = () =>
      saglikFormu(d.saglik.find(x => x.id === b.dataset.id), d, render, main));
  }

  function saglikFormu(kayit, d, render, main) {
    const s = kayit || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Personel <span style="color:var(--red-text)">*</span></label>
          <select class="fselect" id="sg-personel">
            <option value="">— Seçiniz —</option>
            ${d.personeller.filter(p => p.durum === 'aktif').map(p => `<option value="${p.id}" ${s.personelId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
          </select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Muayene Tipi</label>
          <select class="fselect" id="sg-tip">
            ${['İşe Giriş Muayenesi', 'Periyodik Muayene', 'İş Değişikliği Muayenesi', 'İşe Dönüş Muayenesi']
              .map(t => `<option value="${t}" ${s.tip === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select></div>
      </div>
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Muayene Tarihi</label>
          <input class="finput" id="sg-tarih" type="date" value="${s.tarih || bugun()}"></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Tekrar Periyodu (yıl)</label>
          <select class="fselect" id="sg-periyot">
            <option value="1" ${s.periyotYil === 1 ? 'selected' : ''}>1 yıl (Çok tehlikeli)</option>
            <option value="3" ${(!s.periyotYil || s.periyotYil === 3) ? 'selected' : ''}>3 yıl (Tehlikeli)</option>
            <option value="5" ${s.periyotYil === 5 ? 'selected' : ''}>5 yıl (Az tehlikeli)</option>
          </select></div>
        <div class="fgroup" style="flex:1"><label class="flbl">Sonuç</label>
          <select class="fselect" id="sg-sonuc">
            <option value="uygun" ${s.sonuc !== 'sartli' && s.sonuc !== 'uygun_degil' ? 'selected' : ''}>Çalışmaya uygun</option>
            <option value="sartli" ${s.sonuc === 'sartli' ? 'selected' : ''}>Şartlı uygun</option>
            <option value="uygun_degil" ${s.sonuc === 'uygun_degil' ? 'selected' : ''}>Uygun değil</option>
          </select></div>
      </div>
      <div class="fgroup"><label class="flbl">Hekim Notu / Kısıtlama</label>
        <textarea class="ftextarea" id="sg-not">${App.escapeHtml(s.not || '')}</textarea></div>`;
    App.openModal({ title: '🩺 Sağlık Muayenesi Kaydı', body,
      footer: `<button class="btn" id="sg-cancel">Vazgeç</button><button class="btn btn-blue" id="sg-ok">Kaydet</button>`, wide: true });
    document.getElementById('sg-cancel').onclick = App.closeModal;
    document.getElementById('sg-ok').onclick = async () => {
      const pid = document.getElementById('sg-personel').value;
      if (!pid) { App.toast('Personel seçin', 'err'); return; }
      const p = d.personeller.find(x => x.id === pid);
      const tarih = document.getElementById('sg-tarih').value || bugun();
      const periyot = parseInt(document.getElementById('sg-periyot').value) || 3;
      await App.persist(() => Store.isgSaglikMuayene.upsert({
        id: s.id || App.uid('SGM'), personelId: pid, personelAdi: p ? p.adSoyad : '',
        tip: document.getElementById('sg-tip').value, tarih, periyotYil: periyot,
        sonrakiMuayene: gunEkle(tarih, periyot * 365),
        sonuc: document.getElementById('sg-sonuc').value,
        not: document.getElementById('sg-not').value.trim()
      }));
      App.toast('Sağlık muayenesi kaydedildi', 'ok');
      App.closeModal(); render(main);
    };
  }

  return { render };
})();
