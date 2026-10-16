// ════════════════════════════════════════════════════════════════════════════
// STEP'TEN ÜRÜN AĞACI VE REÇETE OLUŞTURMA
// ────────────────────────────────────────────────────────────────────────────
// AKIŞ:
//   1) SolidWorks STEP dosyası yüklenir
//   2) Montaj ağacı okunur (parça adları + adetler)
//   3) Kullanıcı ÜRÜNE bir kök kod verir
//   4) Paket ve yarı mamül kodları bu koddan TÜRETİLİR (önizlemeli)
//   5) Onaylanınca: ürün kartı + yarı mamül kartları + REÇETE oluşturulur
//   6) Sonrasında normal akış: Ürün Kartları & Reçete ekranından rota,
//      hammadde, kenar bandı, delik şeması tanımlanır
//
// ÖNEMLİ SINIR: STEP dosyası ÖLÇÜ ve MALZEME bilgisini güvenilir taşımaz.
// Bu ekran ağacı ve adetleri kurar; ölçü/malzeme sonraki adımda girilir.
// Yanlış ölçü yanlış kesim demektir — tahmin etmektense boş bırakmak doğrudur.
// ════════════════════════════════════════════════════════════════════════════
PageModules.step_ice_aktar = (() => {

  let sonuc = null;        // parse çıktısı
  let dosyaAdi = '';

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'arge', 'teknik_ofis'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE ve Teknik Ofis tarafından kullanılır.</div></div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="page-hdr"><div>
        <div class="page-title">📐 STEP'ten Ürün Ağacı ve Reçete</div>
        <div class="page-sub">SolidWorks montaj ağacını içe aktarın — parçalar yarı mamül olarak tanımlanır</div>
      </div></div>

      <div class="card" style="margin-bottom:12px">
        <div class="fhint" style="margin-bottom:10px">
          <b>Ne yapılır:</b> STEP dosyasındaki montaj ağacı okunur; her parça <b>yarı mamül</b>,
          alt montajlar <b>paket</b> olarak tanımlanır ve aralarındaki adetlerle <b>reçete</b> kurulur.<br>
          <b>Ne yapılmaz:</b> STEP; ölçü, malzeme cinsi, kenar bandı ve delik bilgisini güvenilir
          taşımaz. Bunlar içe aktarımdan sonra <b>Ürün Kartları & Reçete</b> ekranından tanımlanır.
        </div>
        <input type="file" id="st-dosya" accept=".step,.stp,.STEP,.STP"
          style="padding:9px;border:1px solid var(--border);border-radius:8px;width:100%;max-width:420px;font-size:12.5px">
        <div id="st-durum" style="margin-top:8px;font-size:12px"></div>
      </div>

      <div id="st-sonuc"></div>`;

    document.getElementById('st-dosya').onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const durum = document.getElementById('st-durum');
      durum.innerHTML = '<span class="muted">Dosya okunuyor…</span>';
      try {
        const metin = await f.text();
        dosyaAdi = f.name;
        sonuc = StepOkuyucu.oku(metin);
        // Geometri (sınır kutuları) — teknik çizim için
        try { sonuc.geometri = StepOkuyucu.geometriCikar(metin); }
        catch (x) { sonuc.geometri = null; }
        if (sonuc.hata) {
          durum.innerHTML = `<span style="color:var(--red-text)">✕ ${App.escapeHtml(sonuc.hata)}</span>`;
          document.getElementById('st-sonuc').innerHTML = '';
          return;
        }
        durum.innerHTML = `<span style="color:var(--green-text)">✓ ${App.escapeHtml(f.name)} okundu — ` +
          `${sonuc.istatistik.toplamParcaTipi} parça tipi, ${sonuc.istatistik.toplamParcaAdedi} adet</span>`;
        sonucCiz(main);
      } catch (err) {
        durum.innerHTML = `<span style="color:var(--red-text)">✕ Dosya okunamadı: ${App.escapeHtml(err.message || String(err))}</span>`;
      }
    };
  }

  function agacHtml(d, kokKod) {
    if (!d) return '';
    const girinti = d.seviye * 22;
    const tipEtiket = d.seviye === 0
      ? '<span class="pill" style="background:#1F4E79;color:#fff;font-size:9px">ÜRÜN</span>'
      : (d.yaprakMi
        ? '<span class="pill pill-blue" style="font-size:9px">YARI MAMÜL</span>'
        : '<span class="pill" style="background:#ede4ff;color:#5a3ec8;font-size:9px">PAKET / ALT MONTAJ</span>');
    return `<div style="padding:5px 0;border-bottom:1px solid var(--border);margin-left:${girinti}px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${tipEtiket}
        <b style="font-size:12px">${App.escapeHtml(d.ad)}</b>
        ${d.seviye > 0 ? `<span class="muted" style="font-size:11px">× ${d.adet}</span>` : ''}
      </div>` + d.cocuklar.map(c => agacHtml(c, kokKod)).join('');
  }

  function sonucCiz(main) {
    const el = document.getElementById('st-sonuc');
    const st = sonuc.istatistik;

    el.innerHTML = `
      ${sonuc.uyarilar.length ? `<div class="card" style="margin-bottom:12px;background:var(--amber-bg);border:1px solid var(--amber-text)">
        <div style="padding:4px;font-size:11.5px;color:var(--amber-text)">
          ${sonuc.uyarilar.map(u => '⚠ ' + App.escapeHtml(u)).join('<br>')}
        </div></div>` : ''}

      <div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi-card"><div class="kpi-label">PARÇA TİPİ</div><div class="kpi-value">${st.toplamParcaTipi}</div></div>
        <div class="kpi-card"><div class="kpi-label">TOPLAM ADET</div><div class="kpi-value">${st.toplamParcaAdedi}</div></div>
        <div class="kpi-card"><div class="kpi-label">ALT MONTAJ</div><div class="kpi-value">${st.montajSayisi}</div></div>
        <div class="kpi-card"><div class="kpi-label">YARI MAMÜL</div><div class="kpi-value">${st.yaprakSayisi}</div></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">1️⃣ Ürün Kodu Belirleyin</div></div>
        <div class="fhint" style="margin-bottom:8px">
          Bu kodu siz verirsiniz. Paket ve yarı mamül kodları bu koddan türetilir — aşağıda önizleyin.
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Ürün Kodu (kök)</label>
            <input class="finput" id="st-kod" placeholder="örn. CT.D.80200.05" style="text-transform:uppercase"></div>
          <div class="fgroup"><label class="flbl">Ürün Adı</label>
            <input class="finput" id="st-ad" value="${App.escapeHtml(sonuc.kok ? sonuc.kok.ad : '')}"></div>
        </div>
        <div id="st-onizleme" style="margin-top:8px"></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">2️⃣ STEP Montaj Ağacı</div></div>
        <div style="max-height:340px;overflow:auto">${agacHtml(sonuc.agac, '')}</div>
      </div>

      <div class="card">
        <div class="fhint" style="margin-bottom:8px">
          <b>İçe aktarım sonrası ne yapmalısınız:</b> Ürün Kartları & Reçete ekranından her yarı mamüle
          <b>ölçü</b>, <b>hammadde</b> (plaka/hırdavat), <b>kenar bandı</b> ve <b>rota</b> tanımlayın.
          Bu ekran ağacı ve adetleri kurar; teknik detay sizde kalır.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-green" id="st-olustur" style="font-size:13px;padding:9px 16px">
            ✓ Kartları ve Reçeteyi Oluştur</button>
          <button class="btn btn-blue" id="st-kilavuz" style="font-size:13px;padding:9px 16px">
            📘 Montaj Kılavuzu Üret</button>
          <button class="btn" id="st-teknik" style="font-size:13px;padding:9px 16px">
            📐 Teknik Dosya (şema + görünüşler)</button>
        </div>
      </div>`;

    const kodInp = document.getElementById('st-kod');
    const onizle = () => {
      const kok = kodInp.value.trim();
      const o = document.getElementById('st-onizleme');
      if (!kok) { o.innerHTML = '<span class="muted" style="font-size:11.5px">Kod girin, türetilen kodlar burada görünecek.</span>'; return; }
      let paketNo = 0, ymNo = 0;
      const satirlar = [];
      (function gez(d) {
        if (!d) return;
        if (d.seviye === 0) satirlar.push(['ÜRÜN', d.ad, StepOkuyucu.kodTuret(kok, 'urun')]);
        else if (!d.yaprakMi) satirlar.push(['PAKET', d.ad, StepOkuyucu.kodTuret(kok, 'paket', ++paketNo)]);
        else satirlar.push(['YARI MAMÜL', d.ad, StepOkuyucu.kodTuret(kok, 'yarimamul', ++ymNo)]);
        d.cocuklar.forEach(gez);
      })(sonuc.agac);
      o.innerHTML = `<table class="dtable" style="font-size:11.5px"><tr><th>Tip</th><th>STEP Adı</th><th>Türetilen Kod</th></tr>
        ${satirlar.slice(0, 30).map(s => `<tr><td>${s[0]}</td><td>${App.escapeHtml(s[1])}</td><td class="mono"><b>${App.escapeHtml(s[2])}</b></td></tr>`).join('')}
        </table>${satirlar.length > 30 ? `<div class="muted" style="font-size:11px;padding:4px">… ve ${satirlar.length - 30} kayıt daha</div>` : ''}`;
    };
    kodInp.oninput = onizle;
    onizle();

    document.getElementById('st-olustur').onclick = () => olustur(main);
    document.getElementById('st-kilavuz').onclick = () => kilavuzFormu(main);
    document.getElementById('st-teknik').onclick = () => teknikDosyaFormu(main);
  }

  async function olustur(main) {
    try {
      const kokKod = document.getElementById('st-kod').value.trim().toUpperCase();
      const urunAd = document.getElementById('st-ad').value.trim();
      if (!kokKod) { App.toast('Ürün kodu zorunlu.', 'err'); return; }
      if (!urunAd) { App.toast('Ürün adı zorunlu.', 'err'); return; }

      const [urunler, yarimamuller, paketler, receteler] = await Promise.all([
        Store.urunler.all(), Store.yarimamuller.all(), Store.paketler.all(), Store.receteler.all()
      ]);

      if (urunler.some(u => (u.kod || '').toUpperCase() === kokKod)) {
        App.toast('Bu ürün kodu zaten var: ' + kokKod, 'err'); return;
      }

      // Ağaçtaki her düğüm için kart oluştur; STEP ürün id → kart eşlemesi tut
      const eslesme = new Map();
      let paketNo = 0, ymNo = 0, yeniYm = 0, yeniPkt = 0;

      const urunKart = { id: App.uid('UR'), kod: kokKod, ad: urunAd, kaynak: 'step', stepDosya: dosyaAdi };
      urunler.push(urunKart);
      eslesme.set(sonuc.agac.urunId, { tip: 'urun', id: urunKart.id, kod: kokKod });

      (function kartlariKur(d) {
        d.cocuklar.forEach(c => {
          if (!eslesme.has(c.urunId)) {
            if (c.yaprakMi) {
              const kod = StepOkuyucu.kodTuret(kokKod, 'yarimamul', ++ymNo);
              const kart = { id: App.uid('YM'), kod, ad: c.ad, kaynak: 'step', stepDosya: dosyaAdi };
              yarimamuller.push(kart); yeniYm++;
              eslesme.set(c.urunId, { tip: 'yarimamul', id: kart.id, kod });
            } else {
              const kod = StepOkuyucu.kodTuret(kokKod, 'paket', ++paketNo);
              const kart = { id: App.uid('PKT'), kod, ad: c.ad, kaynak: 'step', stepDosya: dosyaAdi };
              paketler.push(kart); yeniPkt++;
              eslesme.set(c.urunId, { tip: 'paket', id: kart.id, kod });
            }
          }
          kartlariKur(c);
        });
      })(sonuc.agac);

      // Reçeteleri kur: her montaj düğümü için kendi kalemleriyle bir reçete
      let yeniRecete = 0;
      (function receteleriKur(d) {
        if (!d.cocuklar.length) return;
        const sahip = eslesme.get(d.urunId);
        const kalemler = d.cocuklar.map(c => {
          const e = eslesme.get(c.urunId);
          return { id: App.uid('RK'), tip: e.tip, refId: e.id, miktar: c.adet, birim: 'ADET', kaynak: 'step' };
        });
        const rec = { id: App.uid('RC'), ad: d.ad + ' Reçetesi', kalemler, kaynak: 'step' };
        if (sahip.tip === 'urun') rec.urunId = sahip.id;
        else if (sahip.tip === 'paket') rec.paketId = sahip.id;
        else rec.yarimamulId = sahip.id;
        receteler.push(rec); yeniRecete++;
        d.cocuklar.forEach(receteleriKur);
      })(sonuc.agac);

      await App.persist(async () => {
        await Store.urunler.save(urunler);
        await Store.yarimamuller.save(yarimamuller);
        await Store.paketler.save(paketler);
        await Store.receteler.save(receteler);
      });

      App.openModal({
        title: '✓ İçe Aktarım Tamamlandı',
        sub: kokKod + ' — ' + urunAd,
        body: `<div style="font-size:12.5px;line-height:1.9">
            • <b>1</b> ürün kartı<br>
            • <b>${yeniPkt}</b> paket / alt montaj kartı<br>
            • <b>${yeniYm}</b> yarı mamül kartı<br>
            • <b>${yeniRecete}</b> reçete (adetleriyle birlikte)
          </div>
          <div style="margin-top:10px;padding:8px;background:var(--amber-bg);border-radius:8px;font-size:11.5px;color:var(--amber-text)">
            <b>Sıradaki adım — bunlar STEP'ten gelmez:</b><br>
            Her yarı mamüle <b>ölçü (en×boy×kalınlık)</b>, <b>hammadde</b>, <b>kenar bandı</b> ve
            <b>rota</b> tanımlayın. Bunlar girilmeden maliyet ve kesim planı hesaplanamaz.
          </div>`,
        footer: `<button class="btn" id="st-kapat">Kapat</button>
                 <button class="btn btn-blue" id="st-git">Ürün Kartları & Reçete'ye Git</button>`
      });
      document.getElementById('st-kapat').onclick = () => { App.closeModal(); render(main); };
      document.getElementById('st-git').onclick = () => { App.closeModal(); App.goTo('kartlar'); };

    } catch (e) {
      App.toast('Oluşturulamadı: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  // ── TEKNİK DOSYA (patlatılmış şema + görünüşler) ─────────────────────────
  function teknikDosyaFormu(main) {
    const geo = sonuc.geometri;
    if (!geo || !geo.geometriVar) {
      App.openModal({
        title: '📐 Teknik Dosya',
        body: `<div class="fhint">
            Bu STEP dosyasında <b>çizilebilir geometri bulunamadı</b>.<br><br>
            Sebep genelde şudur: dosya yalnızca montaj ağacını taşıyor, katı
            geometri içermiyor ya da geometri bu okuyucunun çözemediği bir
            biçimde (karmaşık B-rep) saklanmış.<br><br>
            <b>Ne yapabilirsiniz:</b> SolidWorks'te <i>File → Save As → STEP AP214</i>
            ile yeniden kaydedin ve dışa aktarım seçeneklerinde katı gövdelerin
            dahil edildiğinden emin olun.
          </div>`,
        footer: '<button class="btn" id="tk-kapat">Kapat</button>'
      });
      document.getElementById('tk-kapat').onclick = App.closeModal;
      return;
    }
    const patlatma = TeknikCizim.patlatilmisSvg(geo, {});
    const gorunusler = ['on', 'ust', 'sag', 'sol']
      .map(g => TeknikCizim.gorunusSvg(geo, g)).filter(Boolean);
    const G = geo.genel;
    const kilavuz = MontajKilavuzu.uret(sonuc, {
      urunAdi: (document.getElementById('st-ad') || {}).value || (sonuc.kok && sonuc.kok.ad)
    });

    App.openModal({
      title: '📐 Teknik Dosya', sub: `Genel ölçü ${G.olcu[0]} × ${G.olcu[1]} × ${G.olcu[2]} mm`,
      body: `<div class="fhint" style="margin-bottom:10px">
          <b>${geo.parcalar.length} parça</b> geometrisi okundu.
          Parçalar <b>sınır kutusu</b> olarak çizilir — panel, raf, kapak gibi
          prizmatik parçalarda bu gerçek şekildir; eğri parçalarda (kulp, ayak)
          kapladığı hacmi temsil eder.
        </div>
        <div style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px">
          <div style="font-size:11.5px;font-weight:600;margin-bottom:4px">Patlatılmış Montaj Şeması</div>
          <div style="max-height:300px;overflow:hidden">${patlatma.svg}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${gorunusler.map(g => `<div style="border:1px solid var(--border);border-radius:8px;padding:6px">
            <div style="font-size:11px;font-weight:600;color:var(--blue)">${g.ad} · ${g.genislik}×${g.yukseklik} mm</div>
            <div style="max-height:170px;overflow:hidden">${g.svg}</div>
          </div>`).join('')}
        </div>`,
      footer: `<button class="btn" id="tk-kapat">Kapat</button>
               <button class="btn btn-blue" id="tk-kaydet">💾 Ürün Kartına Kaydet</button>
               <button class="btn btn-green" id="tk-pdf">🖨 PDF / Yazdır</button>`,
      wide: true
    });

    document.getElementById('tk-kapat').onclick = App.closeModal;
    document.getElementById('tk-pdf').onclick = async () => {
      try {
        let firma = '';
        try {
          const fb = await Store.firmaBilgileri.all();
          firma = ((Array.isArray(fb) ? fb[0] : fb) || {}).unvan || '';
        } catch (x) { }
        TeknikCizim.yazdir(geo, kilavuz.ok ? kilavuz : null, {
          urunAdi: (document.getElementById('st-ad') || {}).value || (sonuc.kok && sonuc.kok.ad),
          urunKodu: (document.getElementById('st-kod') || {}).value || '', firma
        });
      } catch (e) { App.toast('Yazdırılamadı: ' + ((e && e.message) || e), 'err'); }
    };
    document.getElementById('tk-kaydet').onclick = () => teknikDosyaKaydet(main, geo, patlatma, gorunusler, kilavuz);
  }

  // Teknik dosyayı ÜRÜN KARTINA kaydeder — kartlar ekranından tekrar açılabilir
  async function teknikDosyaKaydet(main, geo, patlatma, gorunusler, kilavuz) {
    try {
      const kod = ((document.getElementById('st-kod') || {}).value || '').trim().toUpperCase();
      if (!kod) { App.toast('Önce ürün kodunu girin — kayıt o karta yapılacak.', 'err'); return; }
      const urunler = await Store.urunler.all();
      const u = urunler.find(x => (x.kod || '').toUpperCase() === kod);
      if (!u) {
        App.toast('Bu kodda ürün kartı yok. Önce "Kartları ve Reçeteyi Oluştur" ile kartı açın.', 'err');
        return;
      }
      u.teknikDosya = {
        olusturmaTarihi: new Date().toISOString(),
        olusturan: App.aktifRol(),
        kaynak: 'STEP: ' + (dosyaAdi || ''),
        genelOlcu: geo.genel.olcu,
        parcaSayisi: geo.parcalar.length,
        patlatmaSvg: patlatma.svg,
        gorunusler: gorunusler.map(g => ({ ad: g.ad, svg: g.svg, genislik: g.genislik, yukseklik: g.yukseklik })),
        balonlar: patlatma.balonlar,
        montajAdimlari: kilavuz.ok ? kilavuz.adimlar : [],
        bom: kilavuz.ok ? kilavuz.bom : []
      };
      await App.persist(() => Store.topluGuncelle('urunler', [u], 1));
      App.closeModal();
      App.toast('Teknik dosya ürün kartına kaydedildi: ' + kod, 'ok');
    } catch (e) { App.toast('Kaydedilemedi: ' + ((e && e.message) || e), 'err'); }
  }

  // ── MONTAJ KILAVUZU ──────────────────────────────────────────────────────
  function kilavuzFormu(main) {
    const k = MontajKilavuzu.uret(sonuc, {
      urunAdi: (document.getElementById('st-ad') || {}).value || (sonuc.kok && sonuc.kok.ad),
      urunKodu: (document.getElementById('st-kod') || {}).value || ''
    });
    if (!k.ok) { App.toast(k.hata, 'err'); return; }

    App.openModal({
      title: '📘 Montaj Kılavuzu', sub: App.escapeHtml(k.urunAdi),
      body: `<div class="fhint" style="margin-bottom:10px">
          Montaj ağacından <b>${k.adimlar.length} adım</b> ve <b>${k.bom.length} parça tipi</b>
          çıkarıldı. Alt montajlar önce, ana gövde en son sıralandı.
          Tahmini süre: <b>~${k.sureDk} dakika</b>.<br>
          <b>Görseller dahil değildir:</b> STEP'in 3B geometrisini çözmek CAD çekirdeği ister,
          tarayıcıda güvenilir yapılamaz. Kılavuzda her adım için görsel yeri bırakıldı —
          SolidWorks makronuzun ürettiği patlatılmış görselleri veya fotoğrafları oraya ekleyin.
        </div>

        <div style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px">
          <b style="font-size:12.5px">Montaj Sırası</b>
          ${k.adimlar.map(a => `<div style="padding:5px 0;border-bottom:1px solid var(--border)">
            <b style="font-size:11.5px">${a.no}. ${a.anaMontajMi ? 'ANA MONTAJ' : 'Alt montaj'}: ${App.escapeHtml(a.hedef)}</b>
            <div style="font-size:11px;color:var(--muted)">
              ${a.parcalar.map(p => App.escapeHtml(p.ad) + ' ×' + p.adet).join(' · ') || '—'}
              ${a.baglantilar.length ? '<br>Bağlantı: ' + a.baglantilar.map(b => App.escapeHtml(b.ad) + ' ×' + b.adet).join(' · ') : ''}
            </div></div>`).join('')}

          <b style="font-size:12.5px;display:block;margin-top:10px">Parça Listesi</b>
          <table class="dtable">
            <tr><th style="width:44px">Balon</th><th>Parça</th><th class="r">Adet</th><th>Tip</th></tr>
            ${k.bom.map(b => `<tr>
              <td class="c">${b.balon}</td><td>${App.escapeHtml(b.ad)}</td>
              <td class="r">${b.adet}</td>
              <td style="font-size:11px">${b.baglanti ? 'Bağlantı elemanı' : (b.altMontaj ? 'Alt montaj' : 'Parça')}</td>
            </tr>`).join('')}
          </table>
        </div>`,
      footer: `<button class="btn" id="mk-kapat">Kapat</button>
               <button class="btn" id="mk-excel">⤓ Excel</button>
               <button class="btn btn-green" id="mk-yazdir">🖨 Kılavuzu Yazdır / PDF</button>`,
      wide: true
    });

    document.getElementById('mk-kapat').onclick = App.closeModal;
    document.getElementById('mk-excel').onclick = () => {
      try { MontajKilavuzu.excelIndir(k); App.toast('Parça listesi indirildi.', 'ok'); }
      catch (e) { App.toast('İndirilemedi: ' + ((e && e.message) || e), 'err'); }
    };
    document.getElementById('mk-yazdir').onclick = async () => {
      try {
        let firma = {};
        try {
          const fb = await Store.firmaBilgileri.all();
          firma = (Array.isArray(fb) ? fb[0] : fb) || {};
        } catch (x) { }
        MontajKilavuzu.yazdir(k, firma);
      } catch (e) { App.toast('Yazdırılamadı: ' + ((e && e.message) || e), 'err'); }
    };
  }

  return { render };
})();
