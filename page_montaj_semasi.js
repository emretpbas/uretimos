// ════════════════════════════════════════════════════════════════════════════
// MONTAJ ŞEMASINDAN REÇETE — AI Görme (Vision) ile Parça Listesi Çıkarımı
// ────────────────────────────────────────────────────────────────────────────
// NEDEN AI GEREKİR (dürüst sınır, plan_okuyucu.js / step_ice_aktar.js ile
// aynı ilke): patlatılmış montaj şeması PDF'leri (Çin üretici çizimleri gibi)
// METİN KATMANI TAŞIMAZ — NO/SIZE/QTY tablosundaki rakamlar bile vektör
// çizimdir (pdf.js ile doğrulandı: sayfa başına 0 metin öğesi). Kural tabanlı
// çıkarım burada mümkün değil; görsel sunucudaki Anthropic vision API'sine
// gönderilir, dönen isim/ölçü/adet TAHMİNDİR.
//
// AKIŞ:
//   1) Reçetenin ait olacağı kart seçilir (ürün/yarı mamül/alt montaj/paket)
//   2) Montaj şeması PDF'i yüklenir, sayfa görsele çevrilir (istemci, pdf.js)
//   3) Görsel api.php?action=montajSemasiOku ile AI'ya gönderilir
//   4) Kullanıcı HER satırı gözden geçirir: adet düzeltir, mevcut hammadde/
//      yarı mamül kartına eşler ya da yeni kart açar (isim UYDURULMAZ —
//      eşleşme yoksa satır "eşleşmemiş" kalır, kaydedilemez)
//   5) Kart zaten bir reçeteye sahipse, eşleştirilen satırlar mevcut
//      kalemlerle KARŞILAŞTIRILIR (adet farkı / yeni / eksik kalan vurgulanır)
//   6) Onaylanınca reçete YENİDEN YAZILIR (mevcut kalemlerin YERİNE geçer —
//      bu ekranın amacı tam olarak budur: şemayla uyuşmayan reçeteyi düzeltmek)
// ════════════════════════════════════════════════════════════════════════════
PageModules.montaj_semasi = (() => {

  let _pdfjsHazir = false;
  async function pdfjsYukle() {
    if (_pdfjsHazir && window.pdfjsLib) return window.pdfjsLib;
    if (!window.pdfjsLib) {
      await new Promise((cz, rd) => {
        const s = document.createElement('script');
        s.src = 'pdf.min.js';
        s.onload = cz; s.onerror = () => rd(new Error('PDF motoru (pdf.min.js) yüklenemedi.'));
        document.head.appendChild(s);
      });
    }
    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
    }
    _pdfjsHazir = true;
    return window.pdfjsLib;
  }

  async function pdfIlkSayfaPng(dosya, olcek) {
    const pdfjs = await pdfjsYukle();
    const buf = await dosya.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const sayfa = await doc.getPage(1);
    const vp = sayfa.getViewport({ scale: olcek || 2 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await sayfa.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return canvas.toDataURL('image/png');
  }

  // ── ÜCRETSİZ ALTERNATİF: TARAYICI İÇİ OCR (Tesseract.js) ────────────────
  // AI görme (Anthropic) ücretli ve API anahtarı/faturalandırma gerektirir.
  // Bunun bir alternatifi olarak, sayfayı yüksek çözünürlükte görsele çevirip
  // tamamen tarayıcıda çalışan, ücretsiz/açık kaynak bir OCR motoruyla
  // (Tesseract.js) "resimdeki yazıyı okumayı" deniyoruz — hiçbir sunucuya
  // veya dış servise gitmez, hiçbir maliyeti yoktur. AI kadar isabetli
  // DEĞİLDİR: tabloyu bağlamıyla anlamaz, sadece harf/rakam tanımaya çalışır
  // — bu yüzden kullanıcıya her zaman "deneysel" olarak sunulur ve sonuç
  // satırlarının gözden geçirilmesi (zaten AI yolunda da zorunlu olan adım)
  // burada daha da kritiktir.
  let _tesseractHazir = false;
  async function tesseractYukle() {
    if (_tesseractHazir && window.Tesseract) return window.Tesseract;
    if (!window.Tesseract) {
      await new Promise((cz, rd) => {
        const s = document.createElement('script');
        s.src = 'tesseract.min.js';
        s.onload = cz; s.onerror = () => rd(new Error('OCR motoru (tesseract.min.js) yüklenemedi.'));
        document.head.appendChild(s);
      });
    }
    _tesseractHazir = true;
    return window.Tesseract;
  }

  // Tesseract'ın satır satır ayırdığı metni ("NO AD/ÖLÇÜ ... ADET" biçiminde
  // olduğu varsayılan tek satırlık tablo hücreleri) parça listesine çevirir.
  // AI'nin aksine "ad" ile "ölçü/spec" ayrımını YAPAMAZ (bağlamı anlamıyor,
  // sadece karakter tanıyor) — ikisi birlikte "tahminiAd"e konur. Geçersiz
  // satırlar (sondan bir adet rakamı çıkmayan) sessizce atlanır — AI
  // yolundaki montajSemasiYanitAyristir() ile AYNI kural.
  function ocrMetnindenParcalarCikar(data) {
    const satirlarHam = [];
    (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => {
      const metin = (l.text || '').replace(/\s+/g, ' ').trim();
      if (metin) satirlarHam.push(metin);
    })));
    const parcalar = [];
    satirlarHam.forEach(satir => {
      let no = '', ad = '', adet = null;
      let m = satir.match(/^(\d{1,4})\s+(.+?)\s+(\d{1,4}(?:[.,]\d+)?)$/);
      if (m) { no = m[1]; ad = m[2].trim(); adet = parseFloat(m[3].replace(',', '.')); }
      else {
        m = satir.match(/^(.+?)\s+(\d{1,4}(?:[.,]\d+)?)$/);
        if (m) { ad = m[1].trim(); adet = parseFloat(m[2].replace(',', '.')); }
      }
      if (!ad || adet === null || isNaN(adet) || adet <= 0) return; // eksik/geçersiz satır sessizce atlanır
      parcalar.push({ no, tahminiAd: ad, olcuSpec: '', adet });
    });
    return parcalar;
  }

  async function ocrIleOku(main) {
    const durum = document.getElementById('ms-durum');
    if (!secilenPdfDosya) { App.toast('Önce bir PDF seçin.', 'err'); return; }
    try {
      durum.innerHTML = '<span class="muted">Sayfa OCR için yüksek çözünürlükte görsele çevriliyor…</span>';
      const ocrGorsel = await pdfIlkSayfaPng(secilenPdfDosya, 4);
      durum.innerHTML = '<span class="muted">Ücretsiz OCR motoru yükleniyor (ilk seferde dil verisi indirileceği için birkaç saniye sürebilir)…</span>';
      await tesseractYukle();
      const worker = await window.Tesseract.createWorker('eng+tur', 1, {
        workerPath: 'worker.min.js', corePath: 'tesseract-core-simd-lstm.wasm.js', langPath: '.',
        logger: (m) => {
          if (m && m.status && typeof m.progress === 'number') {
            durum.innerHTML = `<span class="muted">${App.escapeHtml(m.status)} — %${Math.round(m.progress * 100)}</span>`;
          }
        }
      });
      const { data } = await worker.recognize(ocrGorsel, {}, { text: true, blocks: true });
      await worker.terminate();
      const parcalar = ocrMetnindenParcalarCikar(data);
      if (!parcalar.length) {
        durum.innerHTML = '<span style="color:var(--red-text)">✕ OCR hiçbir geçerli satır bulamadı. Görsel net olmayabilir — AI ile okumayı deneyin.</span>';
        return;
      }
      aiSonuc = {
        ok: true, parcalar,
        genelNot: 'Bu satırlar ÜCRETSİZ OCR (Tesseract.js) ile üretildi — AI görme kadar isabetli DEĞİLDİR. Her satırı dikkatle kontrol edin; harf/rakam karışıklıkları (1/l, 0/O gibi) olabilir. "Ad" ile "Ölçü/Spec" ayrımı yapılamadığından ikisi birlikte "AI Tahmini Ad" sütununa yazılmıştır.'
      };
      gorselDataUrl = ocrGorsel;
      satirlar = parcalar.map(p => ({ no: p.no, tahminiAd: p.tahminiAd, olcuSpec: p.olcuSpec, adet: p.adet, eslesen: null }));
      durum.innerHTML = `<span style="color:var(--green-text)">✓ ${satirlar.length} satır OCR ile okundu (ÜCRETSİZ, deneysel — dikkatle kontrol edin)</span>`;
      sonucCiz(main);
    } catch (err) {
      durum.innerHTML = `<span style="color:var(--red-text)">✕ OCR başarısız: ${App.escapeHtml((err && err.message) || String(err))}</span>`;
    }
  }

  const ROLLER = ['admin', 'arge', 'teknik_ofis', 'yonetim'];
  const TIP_ETIKET = { urun: 'ÜRÜN', yarimamul: 'YARI MAMÜL', altmontaj: 'ALT MONTAJ', paket: 'PAKET' };

  let hedefKart = null;          // {tip, id, kod, ad}
  let dosyaAdi = '';
  let secilenPdfDosya = null;    // seçilen ama henüz AI/OCR ile okunmamış PDF (File)
  let gorselDataUrl = '';        // önizleme + API'ye gönderilecek (data: öneki ile)
  let aiSonuc = null;            // {parcalar:[{no,tahminiAd,olcuSpec,adet}], genelNot}
  let satirlar = [];             // her AI satırı için: {no,tahminiAd,olcuSpec,adet, eslesen:{tip,id,kod,ad}|null}
  let mevcutRecete = null;       // hedefKart'ın halihazırdaki reçetesi (varsa)

  function sifirla() {
    dosyaAdi = ''; secilenPdfDosya = null; gorselDataUrl = ''; aiSonuc = null; satirlar = []; mevcutRecete = null;
  }

  async function render(main) {
    const rol = App.aktifRol();
    if (!ROLLER.includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE, Teknik Ofis ve Yönetim tarafından kullanılır.</div></div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="page-hdr"><div>
        <div class="page-title">🤖 Montaj Şemasından Reçete (AI)</div>
        <div class="page-sub">Patlatılmış montaj şeması PDF'i yükleyin — AI parça listesini çıkarır, siz onaylayıp reçeteye işlersiniz</div>
      </div></div>

      <div class="card" style="margin-bottom:12px">
        <div class="fhint" style="margin-bottom:10px">
          <b>Ne yapılır:</b> Şemadaki NO/ölçü/adet tablosu AI ile okunur, siz her satırı mevcut
          hammadde/yarı mamül kartıyla eşleştirirsiniz.<br>
          <b>Ne yapılmaz:</b> Parça KODU ve FİYAT asla uydurulmaz — sadece görselde görüneni
          bildirir; eşleşme siz onaylamadan kaydedilmez.
        </div>
        <div class="card-hdr"><div class="card-title">1️⃣ Reçetenin Ait Olacağı Kartı Seçin</div></div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px">
          <button class="btn btn-blue" id="ms-kart-sec">${hedefKart ? 'Kartı Değiştir' : 'Kart Seç…'}</button>
          ${hedefKart ? `<span class="pill pill-blue">${TIP_ETIKET[hedefKart.tip]}</span>
            <span class="mono"><b>${App.escapeHtml(hedefKart.kod || '')}</b></span>
            <span>${App.escapeHtml(hedefKart.ad || '')}</span>` : '<span class="muted">Henüz kart seçilmedi</span>'}
        </div>
      </div>

      ${hedefKart ? `<div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">2️⃣ Montaj Şeması PDF'i Yükleyin</div></div>
        <input type="file" id="ms-dosya" accept=".pdf,.PDF"
          style="padding:9px;border:1px solid var(--border);border-radius:8px;width:100%;max-width:420px;font-size:12.5px">
        <div id="ms-durum" style="margin-top:8px;font-size:12px"></div>
      </div>` : ''}

      <div id="ms-sonuc"></div>`;

    document.getElementById('ms-kart-sec').onclick = kartSeciciAc;
    const dosyaInp = document.getElementById('ms-dosya');
    if (dosyaInp) dosyaInp.onchange = (e) => dosyaSecildi(e, main);

    // Kalem seçiciden (kart eşleştirme) geri dönüldüğünde sonuç tablosunu
    // yeniden çiz — render() bu tabloyu kendisi kurmaz, state'ten üretir.
    if (satirlar.length) sonucCiz(main);
  }

  async function kartSecici_secenekleriOlustur() {
    const [urunler, yarimamuller, altMontajlar, paketler] = await Promise.all([
      Store.urunler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(), Store.paketler.all()
    ]);
    const map = { urun: urunler, yarimamul: yarimamuller, altmontaj: altMontajlar, paket: paketler };
    const secenekler = [];
    Object.keys(map).forEach(tip => {
      map[tip].forEach(k => secenekler.push({
        grup: tip, kod: k.kod || k.id, ad: k.ad || '(adsız)', birim: 'ADET',
        id: k.id, tip
      }));
    });
    return secenekler;
  }

  async function kartSecici_receteBul(tip, id) {
    const receteler = await Store.receteler.all();
    const alan = tip === 'urun' ? 'urunId' : tip === 'yarimamul' ? 'yarimamulId' : tip === 'altmontaj' ? 'altMontajId' : 'paketId';
    return receteler.find(r => r[alan] === id) || null;
  }

  function kartSecici_kalemSecenekleriOlustur(hammaddeler, yarimamuller) {
    const secenekler = [];
    hammaddeler.forEach(h => secenekler.push({ grup: 'hammadde', kod: h.stokKodu || h.id, ad: h.ad || '(adsız)', birim: h.birim || 'ADET', id: h.id, tip: 'hammadde' }));
    yarimamuller.forEach(y => secenekler.push({ grup: 'yarimamul', kod: y.kod || y.id, ad: y.ad || '(adsız)', birim: 'ADET', id: y.id, tip: 'yarimamul' }));
    return secenekler;
  }

  function kartSecicidenGeriDon() { App.goTo('montaj_semasi'); }

  async function kartSeciciAc() {
    const secenekler = await kartSecici_secenekleriOlustur();
    App.goTo('kalem_secici', {
      baslik: 'Reçete Hedefi Seç (Ürün / Yarı Mamül / Alt Montaj / Paket)',
      secenekler,
      gruplar: { urun: 'Bitmiş Ürünler', yarimamul: 'Yarı Mamüller', altmontaj: 'Alt Montajlar', paket: 'Paketler' },
      onSecildi: async (secim) => {
        hedefKart = { tip: secim.tip, id: secim.id, kod: secim.kod, ad: secim.ad };
        sifirla();
        mevcutRecete = await kartSecici_receteBul(secim.tip, secim.id);
        App.goTo('montaj_semasi');
      },
      geriDon: kartSecicidenGeriDon
    });
  }

  // Dosya seçilince yalnızca önizleme çıkarılır; okuma yöntemi (AI/OCR)
  // kullanıcının seçtiği butonla ayrıca tetiklenir — ikisi de AYNI önizleme
  // görselini kullanır, dosya iki kez işlenmez.
  async function dosyaSecildi(e, main) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    secilenPdfDosya = f;
    dosyaAdi = f.name;
    aiSonuc = null; satirlar = [];
    const durum = document.getElementById('ms-durum');
    durum.innerHTML = '<span class="muted">Önizleme oluşturuluyor…</span>';
    try {
      gorselDataUrl = await pdfIlkSayfaPng(f, 2);
      durum.innerHTML = `
        <div style="margin:8px 0"><img src="${gorselDataUrl}" style="max-width:100%;max-height:320px;border:1px solid var(--border);border-radius:8px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-blue" id="ms-oku-ai">🤖 AI ile Oku (Ücretli, Önerilen)</button>
          <button class="btn" id="ms-oku-ocr">🔤 Ücretsiz OCR ile Dene (Deneysel)</button>
        </div>`;
      document.getElementById('ms-oku-ai').onclick = () => aiIleOku(main);
      document.getElementById('ms-oku-ocr').onclick = () => ocrIleOku(main);
    } catch (err) {
      durum.innerHTML = `<span style="color:var(--red-text)">✕ ${App.escapeHtml(err.message || String(err))}</span>`;
    }
  }

  async function aiIleOku(main) {
    const durum = document.getElementById('ms-durum');
    durum.innerHTML = '<span class="muted">Görsel AI\'ya gönderiliyor, birkaç saniye sürebilir…</span>';
    try {
      const b64 = gorselDataUrl.split(',')[1];
      const cevap = await Store.montajSemasiOku({ gorselB64: b64, mediaType: 'image/png', dosyaAdi });
      aiSonuc = cevap;
      satirlar = (cevap.parcalar || []).map(p => ({
        no: p.no, tahminiAd: p.tahminiAd, olcuSpec: p.olcuSpec, adet: p.adet, eslesen: null
      }));
      durum.innerHTML = `<span style="color:var(--green-text)">✓ ${satirlar.length} satır okundu (AI tahmini — gözden geçirin)</span>`;
      sonucCiz(main);
    } catch (err) {
      durum.innerHTML = `<span style="color:var(--red-text)">✕ ${App.escapeHtml(err.message || String(err))}</span>`;
    }
  }

  function sonucCiz(main) {
    const el = document.getElementById('ms-sonuc');
    if (!satirlar.length) { el.innerHTML = ''; return; }

    el.innerHTML = `
      ${aiSonuc.genelNot ? `<div class="card" style="margin-bottom:12px;background:var(--amber-bg);border:1px solid var(--amber-text)">
        <div style="padding:4px;font-size:11.5px;color:var(--amber-text)">⚠ AI notu: ${App.escapeHtml(aiSonuc.genelNot)}</div></div>` : ''}

      ${gorselDataUrl ? `<div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">Şema Önizleme</div></div>
        <img src="${gorselDataUrl}" style="max-width:100%;max-height:420px;border:1px solid var(--border);border-radius:8px">
      </div>` : ''}

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">3️⃣ Satırları Gözden Geçirin ve Eşleştirin</div></div>
        <div class="fhint" style="margin-bottom:8px">
          Her satır için mevcut bir hammadde/yarı mamül kartı seçin, ya da eşleşme yoksa
          yeni kart açın. Eşleşmeyen satırlar reçeteye <b>kaydedilmez</b>.
          ${mevcutRecete ? '<br><b>Bu kartın zaten bir reçetesi var</b> — eşleştirdiğiniz kalemler mevcut adetle karşılaştırılıp aşağıda vurgulanır.' : ''}
        </div>
        <div style="overflow-x:auto">
          <table class="dtable" style="font-size:12px">
            <tr><th>No</th><th>AI Tahmini Ad</th><th>Ölçü/Spec</th><th>Adet</th><th>Eşleşen Kart</th><th>Karşılaştırma</th><th></th></tr>
            ${satirlar.map((s, i) => satirHtml(s, i)).join('')}
          </table>
        </div>
      </div>

      ${fazlalikHtml()}

      <div class="card">
        <div class="fhint" style="margin-bottom:8px">
          <b>✓ Reçete Olarak Kaydet</b>, ${hedefKart.kod} kartının reçetesini <b>eşleştirdiğiniz satırlarla
          YENİDEN YAZAR</b> (mevcut kalemlerin yerine geçer). Eşleşmemiş satırlar dahil edilmez.
        </div>
        <button class="btn btn-green" id="ms-kaydet" style="font-size:13px;padding:9px 16px">✓ Reçete Olarak Kaydet</button>
      </div>`;

    satirlar.forEach((s, i) => {
      const btn = document.getElementById('ms-esle-' + i);
      if (btn) btn.onclick = () => esleştirmeAc(i, main);
      const yeniBtn = document.getElementById('ms-yenikart-' + i);
      if (yeniBtn) yeniBtn.onclick = () => yeniKartAc(i, main);
      const adetInp = document.getElementById('ms-adet-' + i);
      if (adetInp) adetInp.oninput = () => { s.adet = +adetInp.value || 0; };
    });
    const kaydetBtn = document.getElementById('ms-kaydet');
    if (kaydetBtn) kaydetBtn.onclick = () => receteKaydet(main);
  }

  function satirHtml(s, i) {
    const eslesenHtml = s.eslesen
      ? `<span class="mono">${App.escapeHtml(s.eslesen.kod)}</span> — ${App.escapeHtml(s.eslesen.ad)}`
      : '<span class="muted">— eşleşme yok —</span>';
    let karsilastirma = '<span class="muted">—</span>';
    if (s.eslesen && mevcutRecete) {
      const mevcutKalem = (mevcutRecete.kalemler || []).find(k => k.tip === s.eslesen.tip && k.refId === s.eslesen.id);
      if (!mevcutKalem) karsilastirma = '<span class="pill pill-green">+ Yeni (mevcutta yok)</span>';
      else if (+mevcutKalem.miktar === +s.adet) karsilastirma = '<span class="pill pill-gray">✓ Adet aynı</span>';
      else karsilastirma = `<span class="pill pill-amber">⚠ Mevcut: ${mevcutKalem.miktar}, Şema: ${s.adet}</span>`;
    }
    return `<tr>
      <td class="mono">${App.escapeHtml(s.no || '')}</td>
      <td>${App.escapeHtml(s.tahminiAd)}</td>
      <td>${App.escapeHtml(s.olcuSpec || '—')}</td>
      <td style="width:70px"><input class="finput" id="ms-adet-${i}" type="number" step="any" value="${s.adet}" style="padding:4px;font-size:12px"></td>
      <td>${eslesenHtml}</td>
      <td>${karsilastirma}</td>
      <td style="white-space:nowrap">
        <button class="btn" id="ms-esle-${i}" style="padding:3px 8px;font-size:11px">Kart Seç</button>
        <button class="btn" id="ms-yenikart-${i}" style="padding:3px 8px;font-size:11px">+ Yeni</button>
      </td>
    </tr>`;
  }

  function fazlalikHtml() {
    if (!mevcutRecete || !(mevcutRecete.kalemler || []).length) return '';
    const eslesenIdler = new Set(satirlar.filter(s => s.eslesen).map(s => s.eslesen.tip + ':' + s.eslesen.id));
    const kalanlar = (mevcutRecete.kalemler || []).filter(k => !eslesenIdler.has(k.tip + ':' + k.refId));
    if (!kalanlar.length) return '';
    return `<div class="card" style="margin-bottom:12px;background:var(--amber-bg);border:1px solid var(--amber-text)">
      <div class="card-hdr"><div class="card-title" style="color:var(--amber-text)">⚠ Mevcut Reçetede Olup Şemada Eşleşmeyen Kalemler</div></div>
      <div style="font-size:11.5px;color:var(--amber-text)">
        Bunlar kaydettiğinizde reçeteden <b>düşer</b> (şemada karşılığı bulunamadı). Yanlışsa ilgili satırı yukarıda eşleştirin.<br>
        ${kalanlar.map(k => `• ${App.escapeHtml(k.tip)} × ${k.miktar} ${k.birim || ''}`).join('<br>')}
      </div>
    </div>`;
  }

  async function esleştirmeAc(i, main) {
    const [hammaddeler, yarimamuller] = await Promise.all([Store.hammaddeler.all(), Store.yarimamuller.all()]);
    const secenekler = kartSecici_kalemSecenekleriOlustur(hammaddeler, yarimamuller);
    App.goTo('kalem_secici', {
      baslik: `"${satirlar[i].tahminiAd}" için kart seçin`,
      secenekler,
      gruplar: { hammadde: 'Hammadde / Hırdavat', yarimamul: 'Yarı Mamüller' },
      onSecildi: (secim) => {
        satirlar[i].eslesen = { tip: secim.tip, id: secim.id, kod: secim.kod, ad: secim.ad };
        App.goTo('montaj_semasi');
      },
      geriDon: () => App.goTo('montaj_semasi')
    });
  }

  function yeniKartAc(i, main) {
    const s = satirlar[i];
    App.openModal({
      title: '+ Yeni Hammadde Kartı',
      sub: App.escapeHtml(s.tahminiAd),
      body: `<div class="fgroup"><label class="flbl">Stok Kodu</label>
          <input class="finput" id="ms-yk-kod" placeholder="örn. VDA-M6X45"></div>
        <div class="fgroup"><label class="flbl">Ad</label>
          <input class="finput" id="ms-yk-ad" value="${App.escapeHtml((s.tahminiAd || '') + (s.olcuSpec ? ' — ' + s.olcuSpec : ''))}"></div>
        <div class="fgroup"><label class="flbl">Birim</label>
          <input class="finput" id="ms-yk-birim" value="ADET"></div>`,
      footer: '<button class="btn" id="ms-yk-vazgec">Vazgeç</button><button class="btn btn-green" id="ms-yk-olustur">Kartı Oluştur</button>'
    });
    document.getElementById('ms-yk-vazgec').onclick = App.closeModal;
    document.getElementById('ms-yk-olustur').onclick = async () => {
      const kod = document.getElementById('ms-yk-kod').value.trim();
      const ad = document.getElementById('ms-yk-ad').value.trim();
      const birim = document.getElementById('ms-yk-birim').value.trim() || 'ADET';
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu.', 'err'); return; }
      try {
        const hammaddeler = await Store.hammaddeler.all();
        if (hammaddeler.some(h => (h.stokKodu || '').toUpperCase() === kod.toUpperCase())) {
          App.toast('Bu stok kodu zaten var: ' + kod, 'err'); return;
        }
        const kart = { id: App.uid('HM'), tip: 'hirdavat', stokKodu: kod, ad, birim, kaynak: 'montaj_semasi_ai' };
        await App.persist(() => Store.hammaddeler.upsert(kart));
        s.eslesen = { tip: 'hammadde', id: kart.id, kod, ad };
        App.closeModal();
        App.toast('Kart oluşturuldu ve satıra eşlendi.', 'ok');
        sonucCiz(main);
      } catch (e) { App.toast('Oluşturulamadı: ' + ((e && e.message) || e), 'err'); }
    };
  }

  async function receteKaydet(main) {
    const eslesenSatirlar = satirlar.filter(s => s.eslesen && (+s.adet) > 0);
    if (!eslesenSatirlar.length) { App.toast('Kaydetmeden önce en az bir satırı eşleştirin.', 'err'); return; }

    const eslesmemisSayisi = satirlar.length - eslesenSatirlar.length;
    const devamEt = await new Promise(res => {
      App.openModal({
        title: '✓ Reçeteyi Kaydet',
        sub: hedefKart.kod + ' — ' + hedefKart.ad,
        body: `<div style="font-size:12.5px;line-height:1.9">
            • <b>${eslesenSatirlar.length}</b> kalem kaydedilecek<br>
            ${eslesmemisSayisi ? `• <b>${eslesmemisSayisi}</b> satır eşleşmediği için ATLANACAK<br>` : ''}
            ${mevcutRecete ? '• Bu kartın <b>mevcut reçetesinin tüm kalemleri YERİNE</b> geçecek' : '• Yeni bir reçete oluşturulacak'}
          </div>`,
        footer: '<button class="btn" id="ms-onay-vazgec">Vazgeç</button><button class="btn btn-green" id="ms-onay-kaydet">Onayla ve Kaydet</button>'
      });
      document.getElementById('ms-onay-vazgec').onclick = () => { App.closeModal(); res(false); };
      document.getElementById('ms-onay-kaydet').onclick = () => { App.closeModal(); res(true); };
    });
    if (!devamEt) return;

    try {
      const alan = hedefKart.tip === 'urun' ? 'urunId' : hedefKart.tip === 'yarimamul' ? 'yarimamulId' : hedefKart.tip === 'altmontaj' ? 'altMontajId' : 'paketId';
      const rec = mevcutRecete || { id: App.uid('RC'), [alan]: hedefKart.id, ad: hedefKart.ad + ' Reçetesi', kalemler: [] };
      rec.kalemler = eslesenSatirlar.map(s => ({
        id: App.uid('RK'), tip: s.eslesen.tip, refId: s.eslesen.id,
        miktar: +s.adet, birim: 'ADET', kaynak: 'montaj_semasi_ai'
      }));
      await App.persist(() => Store.receteler.upsert(rec));
      App.toast('Reçete kaydedildi: ' + hedefKart.kod, 'ok');
      mevcutRecete = rec;
      sonucCiz(main);
    } catch (e) { App.toast('Kaydedilemedi: ' + ((e && e.message) || e), 'err'); }
  }

  return { render };
})();
