// ════════════════════════════════════════════════════════════════════════════
// TEKLİF HAZIRLAMA — fiyat listesinden (katalog) liste fiyatını teklife çekip
// her ürüne %iskonto oranı uygulama, ardından sipariş oluşturma
// ════════════════════════════════════════════════════════════════════════════
PageModules.teklif = (() => {
  let detayId = null;
  let draft = null; // yeni teklif taslağı

  // Paket ölçü/ağırlık verileri — teklif satırlarında senkron gösterim için
  // render başında bir kez yüklenip modül içinde saklanır.
  let _paketCache = { urunler: [], receteler: [], paketler: [] };
  async function paketVerisiYukle() {
    const [urunler, receteler, paketler] = await Promise.all([
      Store.urunler.all(), Store.receteler.all(), Store.paketler.all()]);
    _paketCache = { urunler, receteler, paketler };
  }
  // Kalem kodundan ölçü/hacim/ağırlık çözümü (yoksa null).
  // ÖNEMLİ: elle girilen kart değerleri reçeteden hesaplanana ÖNCELİKLİDİR;
  // bu yüzden doğrudan urunPaketOzeti değil App.olcuAgirlikCoz kullanılır.
  // Aksi halde kullanıcının ürün kartına girdiği ölçü teklifte yok sayılırdı.
  function kalemOlcuCozumu(kalemKod, miktar) {
    const urun = _paketCache.urunler.find(u => u.kod === kalemKod);
    if (!urun) return null;
    const ozet = App.urunPaketOzeti(urun.id, _paketCache.receteler, _paketCache.paketler, miktar || 1);
    const coz = App.olcuAgirlikCoz(urun, ozet, miktar || 1);
    return coz.kaynak === 'yok' ? null : coz;
  }
  // Geriye uyumluluk: eski çağrılar paket özeti bekliyordu
  function kalemPaketOzeti(kalemKod, miktar) {
    const coz = kalemOlcuCozumu(kalemKod, miktar);
    if (!coz) return null;
    return { paketSayisi: coz.paketSayisi, netKg: coz.netKg, brutKg: coz.brutKg, desi: coz.desi, m3: coz.m3 };
  }
  // Teklifin tamamı için toplam koli/hacim/ağırlık — ALT ALTA toplanır
  // ── EK GİDER KUTUSU (Kesapp "görünmeyen giderler" karşılığı) ────────────
  // Projeye nakliye/palet/montaj/fason bantlama-CNC-pres gibi operasyonel
  // giderleri kalem kalem ekler. Her kalem müşteriye yansıtılabilir (teklife
  // girer) veya yalnızca iç maliyet analizinde tutulur. Toplam m³ paket
  // özetinden otomatik gelir; m² kullanıcı girer (katalog ürününde panel
  // alanı her zaman bilinmez).
  function ekGiderKutusu(d) {
    const olcu = ekGiderOlcusu(d);
    const hesap = App.ekGiderToplami(d.ekGiderler || [], olcu);
    const yontemEtiket = { sabit: 'Sabit ₺', m2: '₺/m²', m3: '₺/m³', yuzde: '% ara toplam' };

    let satirlar = '';
    (d.ekGiderler || []).forEach((g, i) => {
      const tutar = hesap.kalemler[i] ? hesap.kalemler[i].tutar : 0;
      satirlar += `<tr>
        <td><input class="finput eg-ad" data-i="${i}" value="${App.escapeHtml(g.ad || '')}" style="min-width:130px"></td>
        <td>
          <select class="finput eg-yontem" data-i="${i}" style="width:120px">
            <option value="sabit" ${g.yontem==='sabit'?'selected':''}>Sabit ₺</option>
            <option value="m2" ${g.yontem==='m2'?'selected':''}>₺/m²</option>
            <option value="m3" ${g.yontem==='m3'?'selected':''}>₺/m³</option>
            <option value="yuzde" ${g.yontem==='yuzde'?'selected':''}>% ara toplam</option>
          </select>
        </td>
        <td><input class="finput eg-birim" data-i="${i}" type="number" step="0.01" value="${g.birim ?? 0}" style="width:90px;text-align:right"></td>
        <td><input class="finput eg-kdv" data-i="${i}" type="number" step="1" value="${g.kdvOrani ?? 20}" style="width:60px;text-align:right"></td>
        <td style="text-align:center"><input type="checkbox" class="eg-yansit" data-i="${i}" ${g.musteriyeYansit?'checked':''} title="Müşteriye yansıt (teklife ekle)"></td>
        <td class="r"><b>${App.fmtTL(tutar)}</b></td>
        <td><button class="btn btn-sm eg-del" data-i="${i}" title="Sil">✕</button></td>
      </tr>`;
    });

    return `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <label class="flbl" style="margin:0">Ek Giderler (Nakliye, Palet, Montaj, Fason İşçilik…)</label>
          <div style="font-size:11px;color:var(--text2)">Proje: ${App.fmt(olcu.m3,3)} m³ · ${App.fmt(olcu.m2,2)} m²</div>
        </div>
        <div class="fhint" style="margin-bottom:8px">"Görünmeyen giderleri" kalem kalem ekleyin. İşaretli olanlar müşteriye yansıtılır (teklife girer); işaretsizler yalnızca gerçek kâr analizinde görünür.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px" id="eg-hazir"></div>
        ${(d.ekGiderler||[]).length ? `<table class="dtable"><tr><th>Gider</th><th>Yöntem</th><th class="r">Birim</th><th class="r">KDV%</th><th style="text-align:center">Yansıt</th><th class="r">Tutar</th><th></th></tr>${satirlar}
          <tr class="total-row"><td colspan="5">EK GİDER TOPLAMI (yansıtılan)</td><td class="r"><b>${App.fmtTL(hesap.yansitilanToplam)}</b></td><td></td></tr>
          ${hesap.icMaliyetToplam > hesap.yansitilanToplam ? `<tr><td colspan="5" style="font-size:10.5px;color:var(--amber-text)">İç maliyet (yansıtılmayan dahil)</td><td class="r" style="color:var(--amber-text)">${App.fmtTL(hesap.icMaliyetToplam)}</td><td></td></tr>` : ''}
        </table>` : '<div class="fhint">Henüz ek gider yok. Aşağıdan hazır kalem ekleyin veya "+ Özel" ile kendiniz tanımlayın.</div>'}
      </div>`;
  }

  // Projenin ek gider hesabı için ölçü tabanı: m³ paketten otomatik, m² elle.
  function ekGiderOlcusu(d) {
    const paket = teklifPaketToplami(d.kalemler || []);
    const araToplam = (d.kalemler || []).reduce((a, k) => a + k.netFiyat * k.miktar, 0);
    return { m3: paket.m3 || 0, m2: +d.ekGiderM2 || 0, araToplam };
  }

  // Ek gider kutusunun olaylarını bağlar. reRender: kutuyu yeniden çizen callback.
  function ekGiderBagla(wrap, d, reRender) {
    // Hazır kalem düğmeleri
    const hazirWrap = wrap.querySelector('#eg-hazir');
    if (hazirWrap) {
      App.EK_GIDER_KATALOG.forEach(k => {
        const b = document.createElement('button');
        b.className = 'btn btn-sm';
        b.textContent = '+ ' + k.ad;
        b.onclick = () => {
          d.ekGiderler = d.ekGiderler || [];
          d.ekGiderler.push({ tur: k.tur, ad: k.ad, yontem: k.yontem, birim: k.varsayilanBirim, kdvOrani: 20, musteriyeYansit: true });
          reRender();
        };
        hazirWrap.appendChild(b);
      });
      const ozel = document.createElement('button');
      ozel.className = 'btn btn-sm btn-blue';
      ozel.textContent = '+ Özel';
      ozel.onclick = () => {
        d.ekGiderler = d.ekGiderler || [];
        d.ekGiderler.push({ tur: 'diger', ad: 'Özel gider', yontem: 'sabit', birim: 0, kdvOrani: 20, musteriyeYansit: true });
        reRender();
      };
      hazirWrap.appendChild(ozel);
    }
    const oku = (sel, i) => wrap.querySelector(`.${sel}[data-i="${i}"]`);
    wrap.querySelectorAll('.eg-ad').forEach(el => el.onchange = () => { d.ekGiderler[+el.dataset.i].ad = el.value; });
    wrap.querySelectorAll('.eg-yontem').forEach(el => el.onchange = () => { d.ekGiderler[+el.dataset.i].yontem = el.value; reRender(); });
    wrap.querySelectorAll('.eg-birim').forEach(el => el.onchange = () => { d.ekGiderler[+el.dataset.i].birim = parseFloat(el.value) || 0; reRender(); });
    wrap.querySelectorAll('.eg-kdv').forEach(el => el.onchange = () => { d.ekGiderler[+el.dataset.i].kdvOrani = parseFloat(el.value) || 0; reRender(); });
    wrap.querySelectorAll('.eg-yansit').forEach(el => el.onchange = () => { d.ekGiderler[+el.dataset.i].musteriyeYansit = el.checked; reRender(); });
    wrap.querySelectorAll('.eg-del').forEach(el => el.onclick = () => { d.ekGiderler.splice(+el.dataset.i, 1); reRender(); });
  }

  // Ek gider kutusunu bir kaba çizip olaylarını bağlayan birleşik yardımcı.
  // Sipariş modülü bunu PageModules.teklif.ekGiderKutusuAc ile yeniden kullanır
  // (aynı UI iki yerde ayrı yazılmasın diye tek kaynak).
  function ekGiderKutusuAc(kap, d, dipGuncelle) {
    if (!kap) return;
    const ciz = () => {
      kap.innerHTML = ekGiderKutusu(d);
      ekGiderBagla(kap, d, () => { ciz(); if (dipGuncelle) dipGuncelle(); });
      if (dipGuncelle) dipGuncelle();
    };
    ciz();
  }

  function teklifPaketToplami(kalemler) {
    const t = { paketSayisi: 0, netKg: 0, brutKg: 0, desi: 0, m3: 0, satirSayisi: 0, elleGirilen: 0 };
    (kalemler || []).forEach(k => {
      const coz = kalemOlcuCozumu(k.kod, k.miktar || 1);
      if (!coz) return;
      t.satirSayisi++;
      if (coz.kaynak === 'manuel') t.elleGirilen++;
      t.paketSayisi += coz.paketSayisi; t.netKg += coz.netKg;
      t.brutKg += coz.brutKg; t.desi += coz.desi; t.m3 += coz.m3;
    });
    return t;
  }
  // ── TOPLAM HACİM VE AĞIRLIK KUTUSU ────────────────────────────────────────
  // Teklifteki tüm kalemlerin hacim ve ağırlık bilgileri ALT ALTA toplanır.
  // Navlun, araç/konteyner doluluk ve yükleme planı bu kutudan okunur.
  function paketToplamKutusu(t) {
    if (!t || (!t.paketSayisi && !t.m3 && !t.brutKg && !t.netKg)) return '';
    const satir = (etiket, deger, vurgu) => deger
      ? `<div style="display:flex;justify-content:space-between;gap:20px;padding:3px 0${vurgu ? ';font-weight:700' : ''}">
           <span style="color:var(--text2)">${etiket}</span><span class="mono">${deger}</span>
         </div>` : '';
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-top:10px;font-size:11.5px;max-width:340px">
      <div style="font-weight:700;margin-bottom:6px">📦 Toplam Hacim ve Ağırlık</div>
      ${satir('Koli / Paket Sayısı', t.paketSayisi ? App.fmt(t.paketSayisi, 0) + ' adet' : '')}
      ${satir('Toplam Hacim', t.m3 ? App.fmt(t.m3, 3) + ' m³' : '', true)}
      ${satir('Toplam Desi', t.desi ? App.fmt(t.desi, 1) : '')}
      ${satir('Net Ağırlık', t.netKg ? App.fmt(t.netKg, 1) + ' kg' : '')}
      ${satir('Brüt Ağırlık', t.brutKg ? App.fmt(t.brutKg, 1) + ' kg' : '', true)}
      ${t.elleGirilen ? `<div class="fhint" style="margin-top:6px">${t.elleGirilen}/${t.satirSayisi} kalemde elle girilmiş ölçü kullanıldı.</div>` : ''}
    </div>`;
  }

  async function render(main) {
    await paketVerisiYukle();
    const teklifler = await Store.teklifler.all();
    if (draft) { renderForm(main, draft); return; }
    if (detayId) {
      const t = teklifler.find(x => x.id === detayId);
      if (t) { renderDetay(main, t); return; }
      detayId = null;
    }
    renderList(main, teklifler);
  }

  function renderList(main, teklifler) {
    const aktifTeklifler = teklifler.filter(t => t.durum !== 'silme_talebinde'); // silme talebindekiler oran hesabına girmesin
    const donusenSayisi = aktifTeklifler.filter(t => t.durum === 'siparise_donustu').length;
    const donusumOrani = aktifTeklifler.length > 0 ? (donusenSayisi / aktifTeklifler.length) * 100 : 0;

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">Satış ve Siparişler</div>
          <div class="page-sub">Katalog fiyat listesinden ürünleri çekip iskonto uygulayarak müşteriye teklif hazırlayın</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="tk-new">+ Yeni Teklif</button></div>
      </div>
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Toplam Teklif</div><div class="kpi-val blue">${aktifTeklifler.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Siparişe Dönüşen</div><div class="kpi-val green">${donusenSayisi}</div></div>
        <div class="kpi"><div class="kpi-lbl">Dönüşüm Oranı</div><div class="kpi-val ${donusumOrani >= 50 ? 'green' : donusumOrani >= 25 ? 'amber' : 'red'}">${App.fmtPct(donusumOrani)}</div></div>
      </div>
      <div class="card" id="tk-list"></div>
    `;
    document.getElementById('tk-new').onclick = () => startNewTeklif(main);
    const wrap = document.getElementById('tk-list');
    if (!teklifler.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="eicon">▥</div><div class="etitle">Henüz teklif oluşturulmadı</div></div>`;
      return;
    }
    let html = `<table class="dtable"><tr><th>Kod</th><th>Müşteri</th><th class="r">Kalem</th><th class="r">Toplam (₺)</th><th>Durum</th><th>Tarih</th><th></th></tr>`;
    [...teklifler].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).forEach(t => {
      const araT = t.araToplam ?? (t.kalemler || []).reduce((a, k) => a + k.netFiyat * k.miktar, 0);
      const toplam = t.dipToplam ?? (araT * (1 - (t.genelIskontoYuzde || 0) / 100));
      html += `<tr><td class="mono">${t.kod}</td><td>${App.escapeHtml(t.musteriAdi || '—')}</td>
        <td class="r">${(t.kalemler || []).length}</td><td class="r"><b>${App.fmtTL(toplam)}</b></td>
        <td>${teklifDurumPill(t.durum)}${t.donusmemeSebebi ? ' <span class="pill pill-red" style="font-size:9px">' + donusmemeSebebiLabel(t.donusmemeSebebi.kategori) + '</span>' : ''}</td>
        <td style="font-size:11px">${t.tarih}</td>
        <td><button class="btn btn-sm btn-ghost tk-detay" data-id="${t.id}">Detay</button></td></tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll('.tk-detay').forEach(b => b.onclick = () => { detayId = b.dataset.id; render(main); });
  }

  function teklifDurumPill(d) {
    // T4: BULGU — page_teklif_degerlendirme.js (TeklifTakipMotor) AYNI
    // Store.teklifler kaydına 'beklemede'/'revize'/'kazanildi'/'kaybedildi'/
    // 'iptal' durumlarını da yazabiliyor (teklif takip/değerlendirme
    // ekranından). Bu ekranın pill'i bu değerleri hiç TANIMIYORDU — fallback
    // her bilinmeyen durumu sessizce "Taslak" gösteriyordu. Sonuç: müşterinin
    // fiilen KABUL ETTİĞİ (kazanildi) bir teklif burada hâlâ "Taslak" gibi
    // görünüyordu — audit'in "müşteri kabul etti durumu yok" bulgusunun kök
    // nedeni bu YANLIŞ ETİKETLEMEYDİ (durum aslında iki ekran arasında VAR
    // ama burada görünmüyordu). Artık tüm bilinen durumlar tanınıyor.
    const map = { taslak: ['Taslak', 'pill-gray'], gonderildi: ['Gönderildi', 'pill-blue'], beklemede: ['Müşteride Bekliyor', 'pill-amber'], revize: ['Revize İsteniyor', 'pill-amber'], kazanildi: ['✓ Kazanıldı (Müşteri Kabul Etti)', 'pill-green'], kaybedildi: ['✗ Kaybedildi', 'pill-red'], iptal: ['İptal / Vazgeçildi', 'pill-gray'], siparise_donustu: ['Siparişe Dönüştü', 'pill-green'], siparis_reddedildi: ['Siparişi Reddedildi — Düzenlenebilir', 'pill-red'], silme_talebinde: ['Silme Talebinde', 'pill-amber'] };
    const [l, c] = map[d] || ['Taslak', 'pill-gray'];
    return `<span class="pill ${c}">${l}</span>`;
  }

  async function startNewTeklif(main) {
    const musteriler = await Store.musteriler.all();
    draft = { musteriId: musteriler[0] ? musteriler[0].id : '', kalemler: [] };
    // CRM'den gelindiyse fırsat bilgisiyle ön-doldur (bir kez okunur, sonra silinir)
    try {
      const ham = sessionStorage.getItem('crm_teklif_taslak');
      if (ham) {
        const t = JSON.parse(ham);
        sessionStorage.removeItem('crm_teklif_taslak');
        if (t.musteriId) draft.musteriId = t.musteriId;
        else if (t.musteriAdi) {
          const m = musteriler.find(x => (x.unvan || x.ad || '') === t.musteriAdi);
          if (m) draft.musteriId = m.id;
        }
        draft.firsatId = t.firsatId || null;
        draft.baslik = t.baslik || '';
        if (typeof App !== 'undefined' && App.toast) {
          App.toast('CRM fırsatından geldi: ' + (t.baslik || ''), 'ok');
        }
      }
    } catch (e) { /* taslak okunamazsa normal akış */ }
    render(main);
  }

  async function renderForm(main, d) {
    const [musteriler, fiyatListeleri, urunler, hammaddeler, yarimamuller, receteler, rotalar, altMontajlar, paketler, iadeKalemleri] = await Promise.all([
      Store.musteriler.all(), Store.fiyatListeleri.all(), Store.urunler.all(),
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.receteler.all(), Store.rotalar.all(), Store.altMontajlar.all(), Store.paketler.all(), Store.iadeKalemleri.all()
    ]);
    const ayarlar = App.state.ayarlar;
    const duzenlemeModu = !!d.editingId;
    const sonListe = fiyatListeleri[fiyatListeleri.length - 1];
    const sonListeKalemleri = sonListe ? sonListe.kalemler : [];
    // Eski (manuel) listelerde "tip" alanı yoktu — hepsi ürün kabul edilir.
    // ÖNEMLİ: Yalnızca liste fiyatı OLUŞMUŞ (maliyeti hesaplanabilmiş, eksik
    // kalemi olmayan, fiyatı > 0) kalemler teklifte gösterilir. Yönetim fiyat
    // listesine göndermemişse veya maliyet hesaplanamadıysa o kalem TEKLİFTE
    // GÖRÜNMEZ — müşteriye fiyatsız/hesaplanmamış kalem teklif edilmez.
    const fiyatGecerli = k => !k.eksikKalemVarMi && k.listeFiyati > 0;
    const katalogUrunKalemleri = sonListeKalemleri.filter(k => (!k.tip || k.tip === 'urun') && fiyatGecerli(k));
    const katalogYmKalemleri = sonListeKalemleri.filter(k => k.tip === 'yarimamul' && fiyatGecerli(k));

    // Sadece fiyat listesindeki (yönetimin hesaplatıp gönderdiği) kalemler:
    const katalogUrunleri = katalogUrunKalemleri.map(k => ({ grup: 'urun', kod: k.kod, ad: k.ad, listeFiyati: k.listeFiyati, maliyetYok: false }));
    const katalogYmleri = katalogYmKalemleri.map(k => ({ grup: 'yarimamul', kod: k.kod, ad: k.ad, listeFiyati: k.listeFiyati, maliyetYok: false }));

    // 2. KALİTE / DEFOLU / SERİ SONU — iade ambarında satışa sunulmuş kalemler.
    // Teklifte gösterilir ANCAK: iskonto yapılamaz, sadece KDV değişebilir,
    // adet iade ambarındaki mevcut miktarla sınırlıdır (kalite kaç adet
    // problemli ürün ambara girdiyse o kadar satılabilir).
    const KALITE_ETIKET = { '2_kalite': '2. Kalite', 'defolu': 'Defolu', 'seri_sonu': 'Seri Sonu' };
    // REZERVASYON: diğer tekliflerde rezerve edilen adetler kullanılabilir
    // adetten düşülür — 1 adet ürün iki müşteriye teklif edilemez. Düzenleme
    // modunda teklifin KENDİ rezervasyonu kullanılabilir sayılır.
    const ikinciKaliteler = iadeKalemleri
      .map(i => ({ iade: i, kullanilabilir: App.ikinciKaliteKullanilabilirAdet(i, d.editingId || null) }))
      .filter(x => x.iade.durum === 'satista' && x.iade.satisaSunuldu && x.iade.satisFiyati > 0 && x.kullanilabilir > 0)
      .map(({ iade: i, kullanilabilir }) => ({
        grup: 'ikinci_kalite', kod: i.kod, ad: i.ad + ' [' + (KALITE_ETIKET[i.kalite] || '2. Kalite') + ']',
        listeFiyati: i.satisFiyati, maliyetYok: false,
        ikinciKalite: true, iadeKalemId: i.id, maxAdet: kullanilabilir, kaliteSinifi: i.kalite, dvz: i.dvz || 'TL'
      }));

    // Hammadde/hırdavat teklifte gösterilmez.
    const tumKalemSecenekleri = [...katalogUrunleri, ...katalogYmleri, ...ikinciKaliteler];

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${duzenlemeModu ? 'Teklifi Düzenle: ' + d.editingKod : 'Yeni Teklif'}</div><div class="page-sub">${sonListe ? 'Fiyat listesi: ' + sonListe.kod + ' — yalnızca liste fiyatı oluşturulmuş kalemler görünür' : 'Henüz fiyat listesi yok — yönetim liste fiyatı oluşturmalı'}</div></div>
        <div class="page-acts"><button class="btn" id="tk-cancel-draft">Vazgeç</button></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Müşteri</div>
          <button class="btn btn-sm" id="tk-new-musteri">+ Yeni Müşteri Ekle</button>
        </div>
        <select class="fselect" id="tk-musteri">
          ${musteriler.map(m => `<option value="${m.id}" ${d.musteriId === m.id ? 'selected' : ''}>${App.escapeHtml(m.unvan)}</option>`).join('')}
        </select>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Kalem Ekle (Ürün, Yarı Mamül veya Hammadde)</div></div>
        <div id="tk-katalog-pick"></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Teklif Kalemleri (İskonto Uygulayın)</div></div>
        <div id="tk-kalem-table"></div>
        <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-blue" id="tk-save-draft">${duzenlemeModu ? 'Değişiklikleri Kaydet' : 'Teklifi Kaydet'}</button>
        </div>
      </div>
    `;
    document.getElementById('tk-cancel-draft').onclick = () => { draft = null; render(main); };
    document.getElementById('tk-musteri').onchange = (e) => { d.musteriId = e.target.value; };
    document.getElementById('tk-new-musteri').onclick = () => {
      PageModules.cari_panel.openMusteriForm(null, async () => {
        // Yeni eklenen müşteriyi otomatik seçili yap (en son eklenen, listede son sırada olur)
        const guncelMusteriler = await Store.musteriler.all();
        const yeni = guncelMusteriler[guncelMusteriler.length - 1];
        if (yeni) d.musteriId = yeni.id;
        render(main);
      });
    };

    const pickWrap = document.getElementById('tk-katalog-pick');
    if (!tumKalemSecenekleri.length) {
      pickWrap.innerHTML = `<div class="empty-state" style="padding:16px 10px"><div class="edesc">Tanımlı ürün/yarı mamül/hammadde yok.</div></div>`;
    } else {
      pickWrap.innerHTML = `
        <button class="btn btn-blue" id="tk-kalem-sec-sayfa">🔍 Kalem Seç (Ara &amp; Listele)</button>
        <div class="fhint" style="margin-top:8px">Açılan sayfada kod, ad veya birime göre arayıp seçebilirsiniz. ⚠ işaretli kalemlerin maliyeti hesaplanamadı — seçtiğinizde fiyatı elle girmeniz istenecek.</div>`;
      document.getElementById('tk-kalem-sec-sayfa').onclick = () => {
        // Ortak seçici 'netFiyat' alanı bekler, burada 'listeFiyati' kullanıyoruz - eşleştirip geçiriyoruz
        const secenekler = tumKalemSecenekleri.map(s => ({ ...s, netFiyat: s.listeFiyati }));
        App.goTo('kalem_secici', {
          baslik: 'Teklif için Kalem Seç',
          secenekler,
          gruplar: { urun: 'Bitmiş Ürünler', yarimamul: 'Yarı Mamüller', ikinci_kalite: '2. Kalite / Defolu / Seri Sonu' },
          geriDon: () => render(main),
          onSecildi: (secim) => {
            if (d.kalemler.some(x => x.kod === secim.kod && x.grup === secim.grup && x.iadeKalemId === secim.iadeKalemId)) { App.toast('Bu kalem zaten teklifte', 'err'); App.goTo('teklif'); render(main); return; }
            const eklemeYap = (listeFiyati) => {
              const kalem = { grup: secim.grup, kod: secim.kod, ad: secim.ad, listeFiyati, iskontoYuzde: 0, netFiyat: listeFiyati, miktar: 1, kdvOrani: 18 };
              // 2. kalite kalemleri: iskonto kilitli, adet iade ambarı stoğuyla sınırlı
              if (secim.ikinciKalite) {
                kalem.ikinciKalite = true;
                kalem.iadeKalemId = secim.iadeKalemId;
                kalem.maxAdet = secim.maxAdet;
                kalem.kaliteSinifi = secim.kaliteSinifi;
                kalem.dvz = secim.dvz;
              }
              d.kalemler.push(kalem);
              render(main);
            };
            if (secim.maliyetYok) openMaliyetYokUyari(secim, eklemeYap);
            else eklemeYap(secim.netFiyat);
          }
        });
      };
    }

    renderKalemTable();

    function renderKalemTable() {
      const wrap = document.getElementById('tk-kalem-table');
      if (!d.kalemler.length) {
        wrap.innerHTML = `<div class="empty-state" style="padding:16px 10px"><div class="edesc">Henüz kalem eklenmedi.</div></div>`;
        document.getElementById('tk-save-draft').disabled = true;
        return;
      }
      document.getElementById('tk-save-draft').disabled = false;
      // Her kalemde kdvOrani yoksa (eski kayıt) varsayılan %18 atanır.
      d.kalemler.forEach(k => { if (k.kdvOrani == null) k.kdvOrani = 18; });

      let html = `<table class="dtable"><tr><th>Ürün</th><th class="r">Liste Fiyatı</th><th class="r">İskonto %</th><th class="r">Net Fiyat</th><th class="r">Miktar</th><th class="r">KDV %</th><th class="r">Toplam (KDV Hariç)</th><th></th></tr>`;
      d.kalemler.forEach((k, i) => {
        const ik = k.ikinciKalite;
        // 2. kalite: iskonto kilitli (input disabled + 0), miktar üst sınırı = ambar stoğu
        const iskontoHucre = ik
          ? `<input class="finput" type="number" value="0" disabled title="2. kalite ürünlerde iskonto yapılamaz" style="width:65px;text-align:right;background:var(--surface2,#f1f5f9);cursor:not-allowed">`
          : `<input class="finput tk-iskonto" data-i="${i}" type="number" value="${k.iskontoYuzde}" step="0.5" style="width:65px;text-align:right">`;
        const miktarHucre = ik
          ? `<input class="finput tk-miktar" data-i="${i}" type="number" value="${k.miktar}" min="1" max="${k.maxAdet}" style="width:55px;text-align:right" title="En fazla ${k.maxAdet} adet (ambar stoğu)">`
          : `<input class="finput tk-miktar" data-i="${i}" type="number" value="${k.miktar}" min="1" style="width:55px;text-align:right">`;
        html += `<tr>
          <td><b class="mono">${App.escapeHtml(k.kod)}</b>${ik ? ` <span class="pill pill-amber" style="font-size:9px;vertical-align:middle">${App.escapeHtml((k.ad.match(/\[(.*?)\]/) || [,''])[1] || '2. Kalite')}</span>` : ''}<br><span class="muted" style="font-size:10.5px">${App.escapeHtml(k.ad.replace(/\s*\[.*?\]\s*$/, ''))}</span>${ik ? `<br><span style="font-size:9.5px;color:var(--amber-text)">Stok: ${k.maxAdet} adet · iskonto yok</span>` : ''}${(() => {
            // olcuOzetMetni kullanilir: paket kalemi olmayan ama elle olcu
            // girilmis urunlerde de hacim/agirlik gorunur.
            const coz = kalemOlcuCozumu(k.kod, k.miktar || 1);
            const metin = coz ? App.olcuOzetMetni(coz) : '';
            return metin ? `<br><span style="font-size:9.5px;color:var(--blue-text)">📦 ${metin}</span>` : '';
          })()}</td>
          <td class="r">${App.fmtTL(k.listeFiyati)}</td>
          <td class="r">${iskontoHucre}</td>
          <td class="r mono tk-net" data-i="${i}">${App.fmtTL(k.netFiyat)}</td>
          <td class="r">${miktarHucre}</td>
          <td class="r"><input class="finput tk-kdv" data-i="${i}" type="number" value="${k.kdvOrani}" step="1" min="0" max="100" style="width:60px;text-align:right"></td>
          <td class="r mono tk-toplam" data-i="${i}">${App.fmtTL(k.netFiyat * k.miktar)}</td>
          <td><button class="btn btn-icon btn-ghost tk-del-kalem" data-i="${i}" style="color:var(--red-text)">&times;</button></td>
        </tr>`;
      });
      const araToplam = d.kalemler.reduce((a, k) => a + k.netFiyat * k.miktar, 0);
      const genelIskontoYuzde = d.genelIskontoYuzde || 0;
      html += `<tr class="total-row"><td colspan="6">ARA TOPLAM (KDV HARİÇ)</td><td class="r" id="tk-ara-toplam">${App.fmtTL(araToplam)}</td><td></td></tr>`;
      html += `</table>`;
      html += paketToplamKutusu(teklifPaketToplami(d.kalemler));
      html += `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div class="fgroup" style="margin:0 0 12px;display:flex;align-items:center;gap:10px">
            <label class="flbl" style="margin:0">Genel İskonto (Toplamdan)</label>
            <input class="finput" id="tk-genel-iskonto" type="number" value="${genelIskontoYuzde}" step="0.5" style="width:80px;text-align:right">
            <span style="font-size:12px;color:var(--text2)">%</span>
          </div>
          <div id="tk-ek-gider"></div>
          <div id="tk-kdv-ozet"></div>
        </div>`;
      wrap.innerHTML = html;
      renderEkGider();
      renderKdvOzet();

      document.getElementById('tk-genel-iskonto').onchange = (e) => {
        d.genelIskontoYuzde = parseFloat(e.target.value) || 0;
        renderKdvOzet();
      };

      wrap.querySelectorAll('.tk-iskonto').forEach(inp => inp.onchange = () => {
        const i = parseInt(inp.dataset.i);
        d.kalemler[i].iskontoYuzde = parseFloat(inp.value) || 0;
        d.kalemler[i].netFiyat = d.kalemler[i].listeFiyati * (1 - d.kalemler[i].iskontoYuzde / 100);
        updateRow(i);
      });
      wrap.querySelectorAll('.tk-miktar').forEach(inp => inp.onchange = () => {
        const i = parseInt(inp.dataset.i);
        let m = parseInt(inp.value) || 1;
        // 2. kalite kalemlerde miktar ambar stoğunu aşamaz
        if (d.kalemler[i].ikinciKalite && m > d.kalemler[i].maxAdet) {
          m = d.kalemler[i].maxAdet;
          inp.value = m;
          App.toast(`En fazla ${d.kalemler[i].maxAdet} adet satılabilir (ambar stoğu)`, 'err');
        }
        if (m < 1) m = 1;
        d.kalemler[i].miktar = m;
        updateRow(i);
      });
      wrap.querySelectorAll('.tk-kdv').forEach(inp => inp.onchange = () => {
        const i = parseInt(inp.dataset.i);
        d.kalemler[i].kdvOrani = parseFloat(inp.value) || 0;
        renderKdvOzet();
      });
      wrap.querySelectorAll('.tk-del-kalem').forEach(b => b.onclick = () => {
        d.kalemler.splice(parseInt(b.dataset.i), 1);
        renderKalemTable();
      });

      function updateRow(i) {
        const k = d.kalemler[i];
        const netCell = wrap.querySelector(`.tk-net[data-i="${i}"]`);
        const totalCell = wrap.querySelector(`.tk-toplam[data-i="${i}"]`);
        if (netCell) netCell.textContent = App.fmtTL(k.netFiyat);
        if (totalCell) totalCell.textContent = App.fmtTL(k.netFiyat * k.miktar);
        const at = d.kalemler.reduce((a, x) => a + x.netFiyat * x.miktar, 0);
        const atCell = document.getElementById('tk-ara-toplam');
        if (atCell) atCell.textContent = App.fmtTL(at);
        renderKdvOzet();
      }

      function renderEkGider() {
        const egWrap = document.getElementById('tk-ek-gider');
        if (!egWrap) return;
        egWrap.innerHTML = ekGiderKutusu(d);
        ekGiderBagla(egWrap, d, () => { renderEkGider(); renderKdvOzet(); });
      }

      // KDV oranına göre kalemleri gruplayıp her grup için ayrı bir alt
      // toplam (KDV hariç tutar, KDV tutarı, KDV dahil tutar) gösterir;
      // genel iskonto her grubun KDV hariç tutarına orantılı uygulanır.
      function renderKdvOzet() {
        const ozetWrap = document.getElementById('tk-kdv-ozet');
        if (!ozetWrap) return;
        const egHesap = App.ekGiderToplami(d.ekGiderler || [], ekGiderOlcusu(d));
        const kdvOzet = App.kalemleriKdvGrupla(d.kalemler, d.genelIskontoYuzde || 0, egHesap.kalemler);
        let html = '';
        if (kdvOzet.detaylar.length > 1) {
          html += `<div class="fhint" style="margin-bottom:8px">Kalemler farklı KDV oranlarındadır — her oran için ayrı alt toplam gösterilir.</div>`;
        }
        html += `<table class="dtable" style="margin-bottom:10px"><tr><th>KDV Oranı</th><th class="r">KDV Hariç (İskontolu)</th><th class="r">KDV Tutarı</th><th class="r">KDV Dahil</th></tr>`;
        kdvOzet.detaylar.forEach(grup => {
          html += `<tr><td><b>%${grup.oran}</b></td><td class="r">${App.fmtTL(grup.kdvHaric)}</td><td class="r">${App.fmtTL(grup.kdvTutari)}</td><td class="r"><b>${App.fmtTL(grup.kdvDahil)}</b></td></tr>`;
        });
        html += `<tr class="total-row"><td>GENEL TOPLAM</td><td class="r">${App.fmtTL(kdvOzet.kdvHaricToplam)}</td><td class="r">${App.fmtTL(kdvOzet.kdvTutariToplam)}</td><td class="r" id="tk-dip-toplam">${App.fmtTL(kdvOzet.kdvDahilToplam)}</td></tr>`;
        html += `</table>`;
        ozetWrap.innerHTML = html;
      }
    }

    document.getElementById('tk-save-draft').onclick = async () => {
      if (!d.kalemler.length) { App.toast('En az bir kalem eklemelisiniz', 'err'); return; }
      const musteri = musteriler.find(m => m.id === d.musteriId);
      const araToplam = d.kalemler.reduce((a, k) => a + k.netFiyat * k.miktar, 0);
      const genelIskontoYuzde = d.genelIskontoYuzde || 0;
      const egHesapKaydet = App.ekGiderToplami(d.ekGiderler || [], ekGiderOlcusu(d));
      const kdvOzet = App.kalemleriKdvGrupla(d.kalemler, genelIskontoYuzde, egHesapKaydet.kalemler);
      const dipToplam = kdvOzet.kdvDahilToplam;

      if (duzenlemeModu) {
        const tumTeklifler = await Store.teklifler.all();
        const mevcut = tumTeklifler.find(x => x.id === d.editingId);
        if (!mevcut) { App.toast('Teklif bulunamadı', 'err'); return; }

        // REVİZYON GEÇMİŞİ: güncellemeden ÖNCEKİ hâl arşivlenir. Böylece
        // "müşteriye ilk ne fiyat verdik, kaç kez revize ettik" sorusu
        // cevaplanabilir; fiyat pazarlığında ve anlaşmazlıkta kanıt olur.
        mevcut.revizyonlar = mevcut.revizyonlar || [];
        mevcut.revizyonlar.push({
          revNo: mevcut.revizyonlar.length + 1,
          tarih: new Date().toISOString().slice(0, 10),
          zaman: new Date().toISOString(),
          kullanici: (App.state && App.state.kullanici && App.state.kullanici.kullaniciAdi) || '—',
          musteriAdi: mevcut.musteriAdi,
          kalemler: JSON.parse(JSON.stringify(mevcut.kalemler || [])),
          genelIskontoYuzde: mevcut.genelIskontoYuzde,
          araToplam: mevcut.araToplam, dipToplam: mevcut.dipToplam
        });
        mevcut.revizyonNo = mevcut.revizyonlar.length;

        mevcut.musteriId = d.musteriId; mevcut.musteriAdi = musteri ? musteri.unvan : '';
        mevcut.kalemler = d.kalemler; mevcut.genelIskontoYuzde = genelIskontoYuzde;
        mevcut.araToplam = araToplam; mevcut.dipToplam = dipToplam; mevcut.kdvOzet = kdvOzet;
        // 2. kalite REZERVASYON: kaydetmeden önce stok yeterliliği kontrol
        // edilir ve adet bu teklife rezerve edilir (çifte satış engeli).
        const rez = await App.ikinciKaliteRezervasyonSenkronize(mevcut);
        if (!rez.ok) { App.toast('⚠ ' + rez.hata, 'err'); return; }
        await App.persist(() => Store.teklifler.upsert(mevcut));
        App.toast('Teklif güncellendi: ' + mevcut.kod + ' (Rev.' + mevcut.revizyonNo + ')', 'ok');
        draft = null;
        detayId = mevcut.id;
        render(main);
        return;
      }

      const teklif = {
        id: App.uid('TKF'),
        kod: 'TKF-' + Date.now().toString(36).toUpperCase(),
        musteriId: d.musteriId, musteriAdi: musteri ? musteri.unvan : '',
        firsatId: d.firsatId || null,   // CRM fırsat bağlantısı (izlenebilirlik)
        kalemler: d.kalemler,
        ekGiderler: d.ekGiderler || [],
        ekGiderM2: d.ekGiderM2 || 0,
        ekGiderYansitilanToplam: egHesapKaydet.yansitilanToplam,
        ekGiderIcMaliyetToplam: egHesapKaydet.icMaliyetToplam,
        genelIskontoYuzde,
        araToplam,
        dipToplam,
        kdvOzet,
        durum: 'taslak',
        tarih: new Date().toISOString().slice(0, 10)
      };
      // 2. kalite REZERVASYON: kaydetmeden önce stok yeterliliği kontrol
      // edilir ve adet bu teklife rezerve edilir (çifte satış engeli).
      const rez = await App.ikinciKaliteRezervasyonSenkronize(teklif);
      if (!rez.ok) { App.toast('⚠ ' + rez.hata, 'err'); return; }
      await App.persist(() => Store.teklifler.upsert(teklif));
      // CRM fırsatından geldiyse geri bağla: fırsat "Teklif Verildi" aşamasına
      // ilerler ve teklif kodu fırsat kartında görünür (çift yönlü izlenebilirlik).
      if (teklif.firsatId && typeof CRM !== 'undefined') {
        try { await CRM.teklifBagla(teklif.firsatId, teklif.id, teklif.kod); }
        catch (e) { /* bağlama başarısızsa teklif yine de kayıtlı */ }
      }
      App.toast('Teklif kaydedildi: ' + teklif.kod, 'ok');
      draft = null;
      detayId = teklif.id;
      render(main);
    };
  }

  // ── ÇEKİ LİSTESİ ──────────────────────────────────────────────────────────
  // Teklifteki her paketi SATIR SATIR gösterir: paket kodu, ölçüsü, birim ve
  // toplam hacim/ağırlık. Sevkiyat, navlun teklifi ve gümrük evrağı için
  // kullanılır. Reçetede tanımlı paketler burada tek tek görünür.
  function cekiListesiAc(t) {
    const liste = App.cekiListesiUret(
      t.kalemler, _paketCache.urunler, _paketCache.receteler, _paketCache.paketler);

    const body = document.createElement('div');
    if (!liste.satirlar.length) {
      body.innerHTML = `<div class="empty-state" style="padding:24px 12px">
        <div class="edesc">Bu teklifteki ürünlerin reçetesinde tanımlı paket bulunmuyor ve ürün kartlarında elle girilmiş ölçü de yok.<br><br>
        Çeki listesi oluşabilmesi için ürün reçetelerine <b>paket kalemi</b> ekleyin veya ürün kartına <b>ölçü ve ağırlık</b> girin.</div>
      </div>`;
      App.openModal({ title: 'Çeki Listesi', sub: t.kod + ' — ' + t.musteriAdi, body,
        footer: `<button class="btn" id="ck-kapat">Kapat</button>`, wide: true });
      document.getElementById('ck-kapat').onclick = App.closeModal;
      return;
    }

    // Satırları ürüne göre grupla — hangi paketin hangi üründen geldiği görünsün
    const gruplar = {};
    liste.satirlar.forEach(s => {
      const anahtar = s.urunKod;
      if (!gruplar[anahtar]) gruplar[anahtar] = { ad: s.urunAd, miktar: s.urunMiktar, satirlar: [] };
      gruplar[anahtar].satirlar.push(s);
    });

    let sira = 0;
    let html = `
      <div class="fhint" style="margin-bottom:10px">📋 Teklifteki her paket ayrı satırda listelenir. <b>Birim</b> sütunları tek koli için, <b>Toplam</b> sütunları o kalemdeki tüm koliler içindir.</div>
      ${liste.olcusuzPaketler.length ? `<div class="card" style="background:var(--amber-bg);border-color:var(--amber-light);margin-bottom:10px">
        <div style="font-size:11.5px;color:var(--amber-text)"><b>⚠ ${liste.olcusuzPaketler.length} paketin ölçüsü girilmemiş</b> — hacim hesabı eksik.
        Paket kodları: ${liste.olcusuzPaketler.map(k => '<b class="mono">' + App.escapeHtml(k) + '</b>').join(', ')}.
        Kartlar ekranından bu paketlere en/boy/yükseklik girin.</div>
      </div>` : ''}
      <div class="tbl-wrap"><table class="dtable" id="ck-tablo">
        <tr>
          <th style="width:34px">#</th>
          <th>Paket Kodu</th><th>Paket Adı</th><th>Ambalaj</th>
          <th class="r">Adet</th>
          <th class="r">Ölçü (cm)</th>
          <th class="r">Birim m³</th><th class="r">Birim Brüt kg</th>
          <th class="r">Toplam m³</th><th class="r">Toplam Desi</th>
          <th class="r">Toplam Net kg</th><th class="r">Toplam Brüt kg</th>
        </tr>`;

    Object.entries(gruplar).forEach(([urunKod, g]) => {
      html += `<tr style="background:var(--surface2)">
        <td colspan="12" style="font-size:11px;font-weight:700">
          <span class="mono">${App.escapeHtml(urunKod)}</span> — ${App.escapeHtml(g.ad)}
          <span class="muted" style="font-weight:400">· ${App.fmt(g.miktar, 0)} adet sipariş</span>
        </td></tr>`;
      g.satirlar.forEach(s => {
        sira++;
        const olcu = (s.en && s.boy && s.yukseklik)
          ? `${App.fmt(s.en, 0)}×${App.fmt(s.boy, 0)}×${App.fmt(s.yukseklik, 0)}`
          : '<span class="muted">—</span>';
        html += `<tr>
          <td class="muted">${sira}</td>
          <td class="mono"><b>${App.escapeHtml(s.paketKod)}</b>${s.elleGirilmis ? ' <span class="pill pill-blue" style="font-size:9px">elle</span>' : ''}</td>
          <td>${App.escapeHtml(s.paketAd)}</td>
          <td>${App.escapeHtml(s.ambalajTipi)}</td>
          <td class="r"><b>${App.fmt(s.adet, 0)}</b></td>
          <td class="r mono">${olcu}</td>
          <td class="r">${s.birimM3 ? App.fmt(s.birimM3, 4) : '—'}</td>
          <td class="r">${s.birimBrutKg ? App.fmt(s.birimBrutKg, 2) : '—'}</td>
          <td class="r"><b>${s.toplamM3 ? App.fmt(s.toplamM3, 3) : '—'}</b></td>
          <td class="r">${s.toplamDesi ? App.fmt(s.toplamDesi, 1) : '—'}</td>
          <td class="r">${s.toplamNetKg ? App.fmt(s.toplamNetKg, 2) : '—'}</td>
          <td class="r"><b>${s.toplamBrutKg ? App.fmt(s.toplamBrutKg, 2) : '—'}</b></td>
        </tr>`;
      });
    });

    const tp = liste.toplam;
    html += `<tr class="total-row">
      <td colspan="4">GENEL TOPLAM</td>
      <td class="r"><b>${App.fmt(tp.paketSayisi, 0)}</b></td>
      <td colspan="3"></td>
      <td class="r"><b>${App.fmt(tp.m3, 3)}</b></td>
      <td class="r"><b>${App.fmt(tp.desi, 1)}</b></td>
      <td class="r"><b>${App.fmt(tp.netKg, 2)}</b></td>
      <td class="r"><b>${App.fmt(tp.brutKg, 2)}</b></td>
    </tr></table></div>

    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:12px">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:11.5px;min-width:230px">
        <div style="font-weight:700;margin-bottom:6px">📦 Sevkiyat Özeti</div>
        <div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:var(--text2)">Toplam Koli</span><span class="mono">${App.fmt(tp.paketSayisi, 0)} adet</span></div>
        <div style="display:flex;justify-content:space-between;padding:2px 0;font-weight:700"><span style="color:var(--text2)">Toplam Hacim</span><span class="mono">${App.fmt(tp.m3, 3)} m³</span></div>
        <div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:var(--text2)">Toplam Desi</span><span class="mono">${App.fmt(tp.desi, 1)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:var(--text2)">Net Ağırlık</span><span class="mono">${App.fmt(tp.netKg, 2)} kg</span></div>
        <div style="display:flex;justify-content:space-between;padding:2px 0;font-weight:700"><span style="color:var(--text2)">Brüt Ağırlık</span><span class="mono">${App.fmt(tp.brutKg, 2)} kg</span></div>
      </div>
    </div>`;

    body.innerHTML = html;
    const footer = `
      <button class="btn" id="ck-kapat">Kapat</button>
      <button class="btn" id="ck-yazdir">🖨 Yazdır</button>
      <button class="btn btn-blue" id="ck-excel">📥 Excel'e Aktar</button>`;
    App.openModal({ title: 'Çeki Listesi', sub: t.kod + ' — ' + t.musteriAdi, body, footer, wide: true });

    document.getElementById('ck-kapat').onclick = App.closeModal;
    document.getElementById('ck-yazdir').onclick = () => cekiListesiYazdir(t, liste, gruplar);
    document.getElementById('ck-excel').onclick = () => cekiListesiExcel(t, liste);
  }

  // Çeki listesini yazdırılabilir pencerede açar
  function cekiListesiYazdir(t, liste, gruplar) {
    const tp = liste.toplam;
    let sira = 0;
    let satirHtml = '';
    Object.entries(gruplar).forEach(([urunKod, g]) => {
      satirHtml += `<tr class="grup"><td colspan="10"><b>${App.escapeHtml(urunKod)}</b> — ${App.escapeHtml(g.ad)} (${App.fmt(g.miktar, 0)} adet)</td></tr>`;
      g.satirlar.forEach(s => {
        sira++;
        satirHtml += `<tr>
          <td>${sira}</td><td>${App.escapeHtml(s.paketKod)}</td><td>${App.escapeHtml(s.paketAd)}</td>
          <td>${App.escapeHtml(s.ambalajTipi)}</td>
          <td class="r">${App.fmt(s.adet, 0)}</td>
          <td class="r">${(s.en && s.boy && s.yukseklik) ? App.fmt(s.en, 0) + '×' + App.fmt(s.boy, 0) + '×' + App.fmt(s.yukseklik, 0) : '—'}</td>
          <td class="r">${s.birimM3 ? App.fmt(s.birimM3, 4) : '—'}</td>
          <td class="r">${s.toplamM3 ? App.fmt(s.toplamM3, 3) : '—'}</td>
          <td class="r">${s.toplamNetKg ? App.fmt(s.toplamNetKg, 2) : '—'}</td>
          <td class="r">${s.toplamBrutKg ? App.fmt(s.toplamBrutKg, 2) : '—'}</td>
        </tr>`;
      });
    });
    const w = window.open('', '_blank');
    if (!w) { App.toast('Yazdırma penceresi açılamadı — tarayıcı engellemiş olabilir', 'err'); return; }
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
      <title>Çeki Listesi ${App.escapeHtml(t.kod)}</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;font-size:11px;margin:22px;color:#111}
        h1{font-size:16px;margin:0 0 2px} .alt{color:#555;margin-bottom:14px;font-size:11px}
        table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:4px 6px}
        th{background:#eee;text-align:left;font-size:10px} .r{text-align:right}
        .grup td{background:#f5f5f5;font-size:10.5px}
        .toplam td{background:#e8e8e8;font-weight:700}
        @media print{body{margin:8mm}}
      </style></head><body>
      <h1>ÇEKİ LİSTESİ / PACKING LIST</h1>
      <div class="alt">${App.escapeHtml(t.kod)} · ${App.escapeHtml(t.musteriAdi)} · ${new Date().toLocaleDateString('tr-TR')}</div>
      <table>
        <tr><th>#</th><th>Paket Kodu</th><th>Paket Adı</th><th>Ambalaj</th><th class="r">Adet</th>
            <th class="r">Ölçü (cm)</th><th class="r">Birim m³</th><th class="r">Toplam m³</th>
            <th class="r">Net kg</th><th class="r">Brüt kg</th></tr>
        ${satirHtml}
        <tr class="toplam"><td colspan="4">GENEL TOPLAM</td><td class="r">${App.fmt(tp.paketSayisi, 0)}</td>
          <td colspan="2"></td><td class="r">${App.fmt(tp.m3, 3)}</td>
          <td class="r">${App.fmt(tp.netKg, 2)}</td><td class="r">${App.fmt(tp.brutKg, 2)}</td></tr>
      </table>
      </body></html>`);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 300);
  }

  // Çeki listesini Excel (xlsx) olarak indirir
  function cekiListesiExcel(t, liste) {
    try {
      const satirlar = [['ÇEKİ LİSTESİ'], [t.kod, t.musteriAdi, new Date().toLocaleDateString('tr-TR')], [],
        ['#', 'Ürün Kodu', 'Ürün Adı', 'Paket Kodu', 'Paket Adı', 'Ambalaj', 'Adet',
         'En (cm)', 'Boy (cm)', 'Yükseklik (cm)', 'Birim m³', 'Birim Brüt kg',
         'Toplam m³', 'Toplam Desi', 'Toplam Net kg', 'Toplam Brüt kg']];
      liste.satirlar.forEach((s, i) => satirlar.push([
        i + 1, s.urunKod, s.urunAd, s.paketKod, s.paketAd, s.ambalajTipi, s.adet,
        s.en || '', s.boy || '', s.yukseklik || '',
        +(s.birimM3 || 0).toFixed(4), +(s.birimBrutKg || 0).toFixed(2),
        +(s.toplamM3 || 0).toFixed(3), +(s.toplamDesi || 0).toFixed(1),
        +(s.toplamNetKg || 0).toFixed(2), +(s.toplamBrutKg || 0).toFixed(2)
      ]));
      const tp = liste.toplam;
      satirlar.push([]);
      satirlar.push(['', '', '', '', '', 'GENEL TOPLAM', tp.paketSayisi, '', '', '', '', '',
        +tp.m3.toFixed(3), +tp.desi.toFixed(1), +tp.netKg.toFixed(2), +tp.brutKg.toFixed(2)]);

      const ws = XLSX.utils.aoa_to_sheet(satirlar);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Çeki Listesi');
      XLSX.writeFile(wb, 'ceki_listesi_' + t.kod.replace(/[^\w-]/g, '_') + '.xlsx');
      App.toast('Çeki listesi indirildi', 'ok');
    } catch (e) {
      console.error('Çeki listesi Excel:', e);
      App.toast('Excel oluşturulamadı: ' + e.message, 'err');
    }
  }

  async function renderDetay(main, t) {
    const araToplam = t.araToplam ?? t.kalemler.reduce((a, k) => a + k.netFiyat * k.miktar, 0);
    const genelIskontoYuzde = t.genelIskontoYuzde || 0;
    const dipToplam = t.dipToplam ?? (araToplam * (1 - genelIskontoYuzde / 100));
    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">${t.kod}${t.revizyonNo ? ` <span class="pill pill-amber" style="font-size:11px;vertical-align:middle">Rev. ${t.revizyonNo}</span>` : ''}</div><div class="page-sub">${App.escapeHtml(t.musteriAdi)}</div></div>
        <div class="page-acts">
          <button class="btn" id="tk-back">&larr; Listeye Dön</button>
          <button class="btn" id="tk-ceki-listesi">📋 Çeki Listesi</button>
          ${t.durum === 'taslak' || t.durum === 'gonderildi' || t.durum === 'siparis_reddedildi' ? '<button class="btn" id="tk-duzenle">Düzenle</button>' : ''}
          ${!['siparise_donustu', 'silme_talebinde', 'kaybedildi', 'iptal'].includes(t.durum) ? '<button class="btn btn-green" id="tk-to-siparis">Siparişe Dönüştür</button>' : ''}
          ${t.durum === 'siparise_donustu' ? '<span class="pill pill-green">Siparişe Dönüştürüldü</span>' : ''}
          ${t.durum !== 'silme_talebinde' && t.durum !== 'siparise_donustu' ? '<button class="btn btn-ghost" id="tk-sil-talep" style="color:var(--red-text)">Sil (Yönetim Onayı İle)</button>' : ''}
          ${t.durum === 'silme_talebinde' ? '<span class="pill pill-amber">Silme Talebi Yönetimde</span>' : ''}
        </div>
      </div>
      ${t.durum === 'siparis_reddedildi' ? `<div class="card" style="background:var(--red-bg);border-color:var(--red-light)">
        <div style="font-size:11.5px;color:var(--red-text)"><b>⚠ Bu teklifin siparişi reddedildi${t.redSiparisKod ? ' (' + t.redSiparisKod + ')' : ''}.</b> Teklifi düzenleyip yeniden siparişe dönüştürebilirsiniz. 2. kalite kalemler teklife yeniden rezerve edildi.</div>
      </div>` : ''}
      ${t.donusmemeSebebi ? `<div class="card" style="background:var(--amber-bg);border-color:var(--amber-light)">
        <div style="font-size:11.5px;color:var(--amber-text)"><b>Siparişe dönüşmedi.</b> Sebep: <b>${donusmemeSebebiLabel(t.donusmemeSebebi.kategori)}</b>
        ${t.donusmemeSebebi.aciklama ? ' — ' + App.escapeHtml(t.donusmemeSebebi.aciklama) : ''}</div>
      </div>` : ''}
      <div class="card">
        <div class="tbl-wrap"><table class="dtable">
          <tr><th>Ürün</th><th>📦 Paket / Ağırlık</th><th class="r">Liste Fiyatı</th><th class="r">İskonto %</th><th class="r">Net Fiyat</th><th class="r">Miktar</th><th class="r">KDV %</th><th class="r">Toplam (KDV Hariç)</th></tr>
          ${t.kalemler.map(k => `<tr><td><b class="mono">${App.escapeHtml(k.kod)}</b><br><span class="muted" style="font-size:10.5px">${App.escapeHtml(k.ad)}</span></td>
            <td style="font-size:10.5px">${(() => { const coz = kalemOlcuCozumu(k.kod, k.miktar || 1); const m = coz ? App.olcuOzetMetni(coz) : ''; return m || '<span class="muted">—</span>'; })()}</td>
            <td class="r">${App.fmtTL(k.listeFiyati)}</td><td class="r">${App.fmtPct(k.iskontoYuzde)}</td>
            <td class="r"><b>${App.fmtTL(k.netFiyat)}</b></td><td class="r">${k.miktar}</td><td class="r">%${k.kdvOrani ?? 18}</td><td class="r">${App.fmtTL(k.netFiyat * k.miktar)}</td></tr>`).join('')}
          <tr class="total-row"><td colspan="6">ARA TOPLAM (KDV HARİÇ)</td><td class="r">${App.fmtTL(araToplam)}</td></tr>
        </table>
        ${paketToplamKutusu(teklifPaketToplami(t.kalemler))}</div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Genel İskonto: <b>${App.fmtPct(genelIskontoYuzde)}</b></div>
          ${(() => {
            // Kayıtlı ek giderler (tutarları kayıt anındaki değerlerdir)
            const egHesap = App.ekGiderToplami(t.ekGiderler || [], { m3: teklifPaketToplami(t.kalemler).m3, m2: t.ekGiderM2 || 0, araToplam });
            const yansitilanlar = egHesap.kalemler.filter(g => g.musteriyeYansit);
            let egHtml = '';
            if (yansitilanlar.length) {
              egHtml += `<table class="dtable" style="margin-bottom:10px"><tr><th>Ek Gider</th><th class="r">KDV %</th><th class="r">Tutar</th></tr>`;
              yansitilanlar.forEach(g => { egHtml += `<tr><td>${App.escapeHtml(g.ad || g.tur)}</td><td class="r">%${g.kdvOrani ?? 20}</td><td class="r"><b>${App.fmtTL(g.tutar)}</b></td></tr>`; });
              egHtml += `<tr class="total-row"><td colspan="2">EK GİDER TOPLAMI</td><td class="r">${App.fmtTL(egHesap.yansitilanToplam)}</td></tr></table>`;
            }
            const kdvOzet = t.kdvOzet || App.kalemleriKdvGrupla(t.kalemler, genelIskontoYuzde, egHesap.kalemler);
            let html = egHtml;
            if (kdvOzet.detaylar.length > 1) html += `<div class="fhint" style="margin-bottom:8px">Kalemler farklı KDV oranlarındadır.</div>`;
            html += `<table class="dtable"><tr><th>KDV Oranı</th><th class="r">KDV Hariç</th><th class="r">KDV Tutarı</th><th class="r">KDV Dahil</th></tr>`;
            kdvOzet.detaylar.forEach(g => { html += `<tr><td><b>%${g.oran}</b></td><td class="r">${App.fmtTL(g.kdvHaric)}</td><td class="r">${App.fmtTL(g.kdvTutari)}</td><td class="r"><b>${App.fmtTL(g.kdvDahil)}</b></td></tr>`; });
            html += `<tr class="total-row"><td>GENEL TOPLAM</td><td class="r">${App.fmtTL(kdvOzet.kdvHaricToplam)}</td><td class="r">${App.fmtTL(kdvOzet.kdvTutariToplam)}</td><td class="r" style="color:var(--green-text);font-size:15px">${App.fmtTL(kdvOzet.kdvDahilToplam)}</td></tr>`;
            html += `</table>`;
            return html;
          })()}
        </div>
      </div>
    `;
    // REVİZYON GEÇMİŞİ — teklifin önceki hâlleri
    if ((t.revizyonlar || []).length) {
      const revHtml = App.akordeonHtml([{
        baslik: 'Revizyon Geçmişi', ikon: '🕘', rozet: t.revizyonlar.length + ' revizyon',
        icerikHtml: '<div style="margin-top:12px">' + [...t.revizyonlar].reverse().map(r => `
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px">
              <b style="font-size:12px">Revizyon ${r.revNo}</b>
              <span class="muted" style="font-size:10.5px">${(r.zaman || '').replace('T', ' ').slice(0, 16)} · ${App.escapeHtml(r.kullanici || '—')}</span>
            </div>
            <table class="dtable" style="font-size:10.5px">
              <tr><th>Ürün</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">Tutar</th></tr>
              ${(r.kalemler || []).map(k => `<tr><td>${App.escapeHtml(k.kod || '')} ${App.escapeHtml((k.ad || '').slice(0, 26))}</td>
                <td class="r">${App.fmt(k.miktar || 0, 0)}</td>
                <td class="r">${App.fmtTL(k.netFiyat || 0)}</td>
                <td class="r">${App.fmtTL((k.netFiyat || 0) * (k.miktar || 0))}</td></tr>`).join('')}
            </table>
            <div style="text-align:right;font-size:11px;margin-top:4px">
              Ara toplam: <b>${App.fmtTL(r.araToplam || 0)}</b>${r.genelIskontoYuzde ? ` · İskonto %${r.genelIskontoYuzde}` : ''}
              · Dip toplam: <b>${App.fmtTL(r.dipToplam || 0)}</b></div>
          </div>`).join('') + '</div>'
      }]);
      const kap = document.createElement('div');
      kap.innerHTML = revHtml;
      main.appendChild(kap);
      App.akordeonBagla(kap);
    }

    document.getElementById('tk-back').onclick = () => { detayId = null; render(main); };
    document.getElementById('tk-ceki-listesi').onclick = () => cekiListesiAc(t);
    const duzenleBtn = document.getElementById('tk-duzenle');
    if (duzenleBtn) duzenleBtn.onclick = () => {
      draft = { editingId: t.id, editingKod: t.kod, musteriId: t.musteriId, kalemler: t.kalemler.map(k => ({ ...k })), genelIskontoYuzde: t.genelIskontoYuzde || 0, ekGiderler: (t.ekGiderler || []).map(g => ({ ...g })), ekGiderM2: t.ekGiderM2 || 0 };
      detayId = null;
      render(main);
    };
    const silTalepBtn = document.getElementById('tk-sil-talep');
    if (silTalepBtn) silTalepBtn.onclick = () => {
      App.confirmDialog('Bu teklifin silinmesi için Yönetim onayına talep göndermek istediğinize emin misiniz?', async () => {
        t.durum = 'silme_talebinde';
        await App.persist(() => Store.teklifler.upsert(t));
        App.toast('Silme talebi Yönetim onayına gönderildi: ' + t.kod, 'ok');
        render(main);
      });
    };
    const toSiparisBtn = document.getElementById('tk-to-siparis');
    if (toSiparisBtn) toSiparisBtn.onclick = () => {
      // Önce taslak bir sipariş nesnesi (henüz kaydedilmemiş) oluşturulur,
      // ortak ödeme planı formu bu taslak üzerinden açılır. Kullanıcı
      // "Onayla ve Cari Onayına Gönder" dediğinde gerçek kayıt yapılır.
      const taslakSiparis = {
        id: App.uid('SIP'),
        kod: 'SIP-' + Date.now().toString(36).toUpperCase(),
        teklifId: t.id, musteriId: t.musteriId, musteriAdi: t.musteriAdi,
        kalemler: t.kalemler,
        // Ek giderleri de taşı — teklifte müşteriye yansıtılan nakliye/palet/
        // montaj/fason tutarları sipariş dip toplamına dahildir.
        ekGiderler: (t.ekGiderler || []).map(g => ({ ...g })),
        ekGiderM2: t.ekGiderM2 || 0,
        araToplam, genelIskontoYuzde,
        toplam: dipToplam,
        durum: 'cari_onay_bekliyor',
        uretimTermini: null,
        tarih: new Date().toISOString().slice(0, 10)
      };
      App.siparisIcerikVeOdemeFormuAc(taslakSiparis, {
        mod: 'teklif',
        onOnayla: async (odemePlani) => {
          // 2. kalite SON KONTROL + SATIŞ: stok başka müşteriye satılmış/rezerve
          // ise sipariş HİÇ OLUŞTURULMAZ. Başarılıysa miktar düşer, satış
          // geçmişine sipariş no + müşteri işlenir, rezervasyon kapanır.
          const satis = await App.persist(() => App.ikinciKaliteKalemleriSatildiIsaretle(taslakSiparis));
          if (!satis.ok) { App.toast('⚠ ' + satis.hata, 'err'); return; }
          taslakSiparis.odemePlani = odemePlani;
          await App.persist(() => Store.siparisler.upsert(taslakSiparis));
          t.durum = 'siparise_donustu';
          await App.persist(() => Store.teklifler.upsert(t));
          App.toast('Sipariş oluşturuldu ve Cari Onayına gönderildi: ' + taslakSiparis.kod, 'ok');
          render(main);
        }
      });
    };
  }

  function donusmemeSebebiLabel(kategori) {
    return { fiyat: 'Fiyat', termin: 'Termin', urun_fonksiyonu: 'Ürün Fonksiyonu', diger: 'Diğer' }[kategori] || kategori;
  }

  // Maliyeti hesaplanamayan bir kalem eklenmek istendiğinde uyarı + manuel fiyat girişi
  function openMaliyetYokUyari(secim, onFiyatGirildi) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="color:var(--red-text);margin-bottom:10px">
        ⚠ <b>${App.escapeHtml(secim.kod)}</b> — ${App.escapeHtml(secim.ad)} için maliyet/fiyat bilgisi bulunamadı
        (hammadde ataması veya referans fiyatı yok). Devam etmek için lütfen bir liste fiyatı girin.
      </div>
      <div class="fgroup"><label class="flbl">Liste Fiyatı (₺)</label><input class="finput" id="my-fiyat" type="number" step="0.01" placeholder="0.00"></div>
    `;
    const footer = `<button class="btn" id="my-cancel">Vazgeç</button><button class="btn btn-blue" id="my-confirm">Bu Fiyatla Ekle</button>`;
    App.openModal({ title: 'Maliyet Bulunamadı', body, footer });
    document.getElementById('my-cancel').onclick = App.closeModal;
    document.getElementById('my-confirm').onclick = () => {
      const fiyat = parseFloat(document.getElementById('my-fiyat').value);
      if (!fiyat || fiyat <= 0) { App.toast('Geçerli bir fiyat girin', 'err'); return; }
      App.closeModal();
      onFiyatGirildi(fiyat);
    };
  }

  // Çeki listesi ekranı sipariş modülünden de kullanılır (aynı kod tekrar
  // yazılmasın diye dışa açılır). Beklenen nesne: {kod, musteriAdi, kalemler}
  return { render, cekiListesiAc, paketVerisiYukle, ekGiderKutusuAc };
})();
