// ════════════════════════════════════════════════════════════════════════════
// İŞ EMRİ FORMU EKRANI (FR.29) — teknik resimden üretim
// STEP / DWG / PDF yükle → düzenlenebilir tablo → antetli Excel + PDF
// ════════════════════════════════════════════════════════════════════════════
PageModules.is_emri_formu = (() => {

  let form = null;      // { baslik, satirlar, kaynak }
  let ekBilgi = null;   // PDF'ten gelen malzeme/ölçü önerileri

  // ── KARTA EKLE / TAKİP ET — sekme tanımları ───────────────────────────────
  // Her sekme: hangi Store koleksiyonundan okunur, "kod" alanının adı (yoksa
  // null — müşteri/tedarikçide kod kavramı yok, ünvan kullanılır), ve "+ Yeni
  // Ekle" ile hangi minimal kayıt oluşturulur (null ise o sekmede oluşturma
  // yok — Proje Mahalleri, kendi çok adımlı akışı olduğundan buradan
  // oluşturulamaz, yalnızca mevcutlar arasından seçilir).
  const KART_TIPLERI = [
    { key: 'urun', etiket: 'Bitmiş Ürünler', tip: 'urun', koleksiyon: 'urunler', kodAlani: 'kod',
      yeniOlustur: (kod, ad) => ({ id: App.uid('URN'), kod, ad, tip: 'bitmis_urun', gorseller: [] }) },
    { key: 'yarimamul', etiket: 'Yarımamüller', tip: 'yarimamul', koleksiyon: 'yarimamuller', kodAlani: 'kod',
      yeniOlustur: (kod, ad) => ({ id: App.uid('YM'), kod, ad, gorseller: [] }) },
    { key: 'hammadde', etiket: 'Hammadde / Hırdavat', tip: 'hammadde', koleksiyon: 'hammaddeler', kodAlani: 'stokKodu',
      yeniOlustur: (kod, ad) => ({ id: App.uid('HM'), tip: 'hirdavat', stokKodu: kod, ad, birim: 'ADET' }) },
    { key: 'musteri', etiket: 'Müşteriler', tip: 'musteri', koleksiyon: 'musteriler', kodAlani: null,
      yeniOlustur: (_kod, ad) => ({ id: App.uid('MUS'), unvan: ad }) },
    { key: 'tedarikci', etiket: 'Tedarikçiler', tip: 'tedarikci', koleksiyon: 'tedarikciler', kodAlani: null,
      yeniOlustur: (_kod, ad) => ({ id: App.uid('TED'), unvan: ad, kategori: 'hirdavat' }) },
    { key: 'proje_mahal', etiket: 'Proje Mahalleri', tip: 'proje_kalem', koleksiyon: null, kodAlani: null, yeniOlustur: null }
  ];
  let keSekme = KART_TIPLERI[0].key;
  let keArama = '';

  function bosForm() {
    return {
      isEmriIsmi: '', isEmriKodu: IsEmriUretici.isEmriKodu(),
      acilisTarihi: new Date().toISOString().slice(0, 10),
      grup: '', altBaslik: '',
      holzma: '', ima: '', rover: '', delik: '',
      hazirlayan: '', onaylayan: '',
      satirlar: [], kaynak: ''
    };
  }

  async function render(main) {
    const rol = App.aktifRol();
    if (!['admin', 'yonetim', 'uretim_planlama', 'arge', 'teknik_ofis', 'uretim'].includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">İş emri formu Planlama, Ar-Ge, Teknik Ofis ve Üretim rollerine açıktır.</div></div></div>`;
      return;
    }
    if (!form) form = bosForm();

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">📋 İş Emri Formu (FR.29)</div>
          <div class="page-sub">Teknik resimden iş emri — STEP, DWG veya PDF yükleyin</div></div>
        <div class="page-acts">
          <button class="btn" id="ie-temizle">Yeni Form</button>
          <button class="btn btn-blue" id="ie-excel">⤓ Excel</button>
          <button class="btn btn-green" id="ie-pdf">🖨 Antetli PDF</button>
          <button class="btn" id="ie-logo">🖼 Logo</button>
          <button class="btn" id="ie-karta-ekle">📎 Karta Ekle / Takip Et</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">1️⃣ Teknik Resim Yükle</div></div>
        <div class="fhint" style="margin-bottom:8px">
          <b>STEP (AP203/AP214) en iyi sonucu verir</b> — Boy, En ve Kalınlık geometriden
          kesin okunur, elle girmeye gerek kalmaz.<br>
          <b>PDF/DWG</b>'de ölçüler bağımsız yazılardır; hangi ölçünün hangi parçaya ait
          olduğu kesin bilinemez. Bu kaynaklarda malzeme kodları ve parça adları okunur,
          ölçüleri siz doldurursunuz. Yanlış ölçüyle iş emri açmak, boş bırakmaktan pahalıdır.
        </div>
        <input type="file" id="ie-dosya" accept=".step,.stp,.STEP,.STP,.pdf,.dwg" style="font-size:12px">
        <div id="ie-durum" style="margin-top:6px;font-size:11.5px"></div>
        <div id="ie-ek" style="margin-top:8px"></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">2️⃣ İş Emri Başlığı</div></div>
        <div class="frow">
          <div class="fgroup" style="flex:2"><label class="flbl">İŞ EMRİ İSMİ</label>
            <input class="finput ie-b" data-k="isEmriIsmi" value="${App.escapeHtml(form.isEmriIsmi)}"
              placeholder="örn. SOFİNE"></div>
          <div class="fgroup"><label class="flbl">AÇILIŞ TARİHİ</label>
            <input class="finput ie-b" data-k="acilisTarihi" type="date" value="${form.acilisTarihi}"></div>
          <div class="fgroup"><label class="flbl">İŞ EMRİ KODU</label>
            <input class="finput ie-b" data-k="isEmriKodu" value="${App.escapeHtml(form.isEmriKodu)}"></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Grup</label>
            <input class="finput ie-b" data-k="grup" value="${App.escapeHtml(form.grup)}" placeholder="SOFINE"></div>
          <div class="fgroup" style="flex:2"><label class="flbl">Alt Başlık</label>
            <input class="finput ie-b" data-k="altBaslik" value="${App.escapeHtml(form.altBaslik)}"
              placeholder="100LÜK YAN KUTU"></div>
        </div>
        <div class="frow">
          ${['holzma', 'ima', 'rover', 'delik'].map(k => `
            <div class="fgroup"><label class="flbl">${k.toUpperCase()}</label>
              <input class="finput ie-b" data-k="${k}" value="${App.escapeHtml(form[k])}"></div>`).join('')}
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Hazırlayan</label>
            <input class="finput ie-b" data-k="hazirlayan" value="${App.escapeHtml(form.hazirlayan)}" placeholder="ad soyad"></div>
          <div class="fgroup"><label class="flbl">Onaylayan</label>
            <input class="finput ie-b" data-k="onaylayan" value="${App.escapeHtml(form.onaylayan)}" placeholder="ad soyad"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">3️⃣ Parça Satırları (${form.satirlar.length})</div>
          <button class="btn btn-sm" id="ie-satir-ekle">+ Satır</button></div>
        <div id="ie-tablo"></div>
      </div>`;

    document.getElementById('ie-dosya').onchange = (e) => dosyaOku(main, e);
    document.getElementById('ie-temizle').onclick = () => {
      App.confirmDialog('Form temizlensin mi? Girilen veriler kaybolur.', () => {
        form = bosForm(); ekBilgi = null; render(main);
      });
    };
    document.getElementById('ie-satir-ekle').onclick = () => {
      form.satirlar.push(IsEmriUretici.satirKur(
        { parcaAdi: '', boy: 0, en: 0, kalinlik: 0, adet: 1 },
        form.satirlar.length + 1, 0, {}));
      render(main);
    };
    document.getElementById('ie-excel').onclick = () => excelIndir();
    document.getElementById('ie-pdf').onclick = () => pdfYazdir();
    document.getElementById('ie-karta-ekle').onclick = () => karttaEkleTakipAc();
    document.getElementById('ie-logo').onclick = () => logoSecFormu();
    main.querySelectorAll('.ie-b').forEach(el =>
      el.onchange = () => { form[el.dataset.k] = el.value; });

    tabloCiz(main);
    if (ekBilgi) ekBilgiCiz();
  }

  // ── PARÇA KODU ↔ YARI MAMÜL KARTI ────────────────────────────────────────
  // Satırdaki parcaKodu, mevcut bir yarı mamül (kod) kartıyla eşleşiyorsa
  // otomatik bağlanır — parcaKartId/parcaKartTipi doldurulur ve boşsa parça
  // adı karttan alınır. Hammadde/hırdavat/plaka/kenar bandı için ayrı
  // sütunlar var (Plaka Hammadde, PVC/SOFT bant seçicileri) — bu alan
  // sadece yarı mamül arar, karışıklığı önlemek için.
  async function kartlaEslestir(satir) {
    if (!satir || !satir.parcaKodu) { if (satir) { satir.parcaKartId = null; satir.parcaKartTipi = ''; } return; }
    try {
      const yarimamuller = await Store.yarimamuller.all();
      const y = yarimamuller.find(x => x.kod === satir.parcaKodu);
      if (y) {
        satir.parcaKartId = y.id; satir.parcaKartTipi = 'yarimamul';
        if (!satir.parcaAdi) satir.parcaAdi = y.ad || '';
        return;
      }
      satir.parcaKartId = null; satir.parcaKartTipi = '';
    } catch (e) { /* eşleştirme başarısız olsa da satır serbest metinle kullanılabilir kalır */ }
  }

  async function tumSatirlariEslestir() {
    await Promise.all(form.satirlar.map(kartlaEslestir));
  }

  // Manuel seçim: SADECE yarı mamül kartları arasından — "kalem_secici"
  // ekranı üzerinden seçtirir, satıra bağlar. (Hammadde/hırdavat/plaka/kenar
  // bandı için ayrı sütunlar var: Plaka Hammadde, PVC/SOFT bant seçicileri.)
  async function parcaKoduSec(i) {
    let yarimamuller = [];
    try { yarimamuller = await Store.yarimamuller.all(); }
    catch (e) { App.toast('Yarı mamüller yüklenemedi: ' + ((e && e.message) || e), 'err'); return; }

    const secenekler = yarimamuller.filter(y => y.kod).map(y => ({
      grup: 'yarimamul', kod: y.kod, ad: y.ad || '',
      birim: y.birim || '', netFiyat: 0, maliyetYok: true, _id: y.id, _tip: 'yarimamul'
    }));

    App.goTo('kalem_secici', {
      baslik: 'Parça Kodu Seç — Yarı Mamül',
      secenekler,
      gruplar: { yarimamul: 'Yarı Mamül' },
      yeniKartEklenebilir: true,
      geriDon: () => App.goTo('is_emri_formu'),
      onSecildi: (secim) => {
        const s = form.satirlar[i];
        if (s) {
          s.parcaKodu = secim.kod;
          if (!s.parcaAdi) s.parcaAdi = secim.ad;
          s.parcaKartId = secim._id;
          s.parcaKartTipi = secim._tip;
        }
        App.goTo('is_emri_formu');
      },
      // Aranan yarı mamül listede yoksa: kod+ad girilip sisteme YENİ bir
      // yarı mamül kartı olarak tanımlanır, sonra satıra bağlanır. Diğer
      // alanlar (ölçü, hammadde, rota...) boş kalır — kullanıcı Yarı
      // Mamüller sayfasından tamamlar (kalem_secici'nin standart deseni).
      onYeniKartIstendi: async ({ kod, ad }) => {
        try {
          const yeni = { id: App.uid('YM'), kod, ad, gorseller: [] };
          await App.persist(() => Store.topluEkle('yarimamuller', [yeni], 1));
          const s = form.satirlar[i];
          if (s) {
            s.parcaKodu = yeni.kod;
            if (!s.parcaAdi) s.parcaAdi = yeni.ad;
            s.parcaKartId = yeni.id;
            s.parcaKartTipi = 'yarimamul';
          }
          App.toast('Yeni yarı mamül "' + kod + '" tanımlandı ve satıra bağlandı.', 'ok');
          App.goTo('is_emri_formu');
        } catch (e) { App.toast('Yarı mamül oluşturulamadı: ' + ((e && e.message) || e), 'err'); }
      }
    });
  }

  // Sadece PLAKA tipi hammaddeler arasından seçim — parçanın hangi plakadan
  // kesildiğini ayrıca izlemek için (parcaKodu'ndan bağımsız). Seçilince
  // kartın KENDİ kalınlığı satıra otomatik yazılır ve kilitlenir (elle
  // değiştirilemez) — plaka seçiliyken kalınlık her zaman karttan gelir.
  async function plakaSec(i) {
    let hammaddeler = [];
    try { hammaddeler = await Store.hammaddeler.all(); }
    catch (e) { App.toast('Hammaddeler yüklenemedi: ' + ((e && e.message) || e), 'err'); return; }

    const secenekler = hammaddeler.filter(h => h.tip === 'plaka' && h.stokKodu).map(h => ({
      grup: 'plaka', kod: h.stokKodu, ad: h.ad || '', birim: h.birim || '',
      netFiyat: 0, maliyetYok: true, _id: h.id, _kalinlik: h.kalinlik || null
    }));

    App.goTo('kalem_secici', {
      baslik: 'Plaka Hammadde Seç',
      secenekler,
      gruplar: { plaka: 'Plaka Hammaddeler' },
      yeniKartEklenebilir: true,
      geriDon: () => App.goTo('is_emri_formu'),
      onSecildi: (secim) => {
        const s = form.satirlar[i];
        if (s) {
          s.plakaKodu = secim.kod; s.plakaKartId = secim._id; s.plakaAd = secim.ad;
          if (secim._kalinlik) s.kalinlik = secim._kalinlik;
        }
        App.goTo('is_emri_formu');
      },
      // Aranan plaka listede yoksa: yeni bir plaka hammadde kartı, satırda
      // O ANDA yazılı olan kalınlıkla önceden doldurulmuş şekilde açılır —
      // kart oluşunca kalınlık zaten karttan geldiği için otomatik kilitlenir.
      onYeniKartIstendi: async ({ kod, ad }) => {
        try {
          const s = form.satirlar[i];
          const kalinlik = s && s.kalinlik ? +s.kalinlik : null;
          const yeni = { id: App.uid('HM'), tip: 'plaka', stokKodu: kod, ad, kalinlik, birim: 'M2' };
          await App.persist(() => Store.topluEkle('hammaddeler', [yeni], 1));
          if (s) { s.plakaKodu = yeni.stokKodu; s.plakaKartId = yeni.id; s.plakaAd = yeni.ad; if (kalinlik) s.kalinlik = kalinlik; }
          App.toast('Yeni plaka hammadde "' + kod + '" tanımlandı ve satıra bağlandı.', 'ok');
          App.goTo('is_emri_formu');
        } catch (e) { App.toast('Hammadde kartı oluşturulamadı: ' + ((e && e.message) || e), 'err'); }
      }
    });
  }

  // Sadece KENAR BANDI tipi hammaddeler arasından seçim — pvc2/pvc1/pvc040/
  // soft kenar gruplarının hangi bant koduyla bantlandığını izlemek için.
  // DÜZ kenarda bant olmadığından bu seçici çağrılmaz.
  async function bantSec(i, grup) {
    let hammaddeler = [];
    try { hammaddeler = await Store.hammaddeler.all(); }
    catch (e) { App.toast('Hammaddeler yüklenemedi: ' + ((e && e.message) || e), 'err'); return; }

    const secenekler = hammaddeler.filter(h => h.tip === 'kenar_bandi' && h.stokKodu).map(h => ({
      grup: 'kenar_bandi', kod: h.stokKodu, ad: h.ad || '', birim: h.birim || '',
      netFiyat: 0, maliyetYok: true, _id: h.id
    }));

    App.goTo('kalem_secici', {
      baslik: 'Kenar Bandı Seç — ' + grup.toUpperCase(),
      secenekler,
      gruplar: { kenar_bandi: 'Kenar Bandı' },
      geriDon: () => App.goTo('is_emri_formu'),
      onSecildi: (secim) => {
        const s = form.satirlar[i];
        if (s && s[grup]) { s[grup].bandKodu = secim.kod; s[grup].bandKartId = secim._id; s[grup].bandAd = secim.ad; }
        App.goTo('is_emri_formu');
      }
    });
  }

  // ── TABLO ────────────────────────────────────────────────────────────────
  function tabloCiz(main) {
    const el = document.getElementById('ie-tablo');
    if (!form.satirlar.length) {
      el.innerHTML = '<div class="muted" style="padding:12px;font-size:12px">' +
        'Henüz satır yok. Teknik resim yükleyin veya "+ Satır" ile elle ekleyin.</div>';
      return;
    }
    const ozet = IsEmriUretici.ozet(form.satirlar);
    const kenarBandiOzet = IsEmriUretici.kenarBandiOzeti(form.satirlar);
    const g = (i, k) => `data-i="${i}" data-k="${k}"`;

    el.innerHTML = `<div class="tbl-wrap" style="overflow-x:auto">
      <table class="dtable" style="font-size:13px;min-width:1750px">
        <tr>
          <th rowspan="2" style="width:52px">Paket<br>No</th>
          <th rowspan="2" style="width:56px">Paket<br>Adedi</th>
          <th rowspan="2" style="width:130px">Parç.Kodu</th>
          <th rowspan="2" style="min-width:150px">Parça Adı</th>
          <th rowspan="2" style="width:130px">Plaka<br>Hammadde</th>
          <th rowspan="2" style="width:64px">Kalınlık</th>
          <th rowspan="2" style="width:96px">Renk</th>
          <th colspan="3" style="text-align:center">Net Ölçü</th>
          <th colspan="3" style="text-align:center">Kaba Ölçü</th>
          <th rowspan="2" style="width:68px">Üretim<br>miktarı</th>
          <th rowspan="2" style="width:52px">Yarı<br>Mamül</th>
          <th rowspan="2" style="width:46px">Yatar</th>
          <th rowspan="2" style="width:50px">M.Hiz<br>(+)</th>
          ${['PVC 2mm', 'PVC 1mm', 'PVC 0,40', 'SOFT'].map(x =>
            `<th colspan="2" style="text-align:center;width:84px">${x}</th>`).join('')}
          <th rowspan="2" style="min-width:140px">AÇIKLAMALAR</th>
          <th rowspan="2" style="width:68px">birim m²</th>
          <th rowspan="2" style="width:34px"></th>
        </tr>
        <tr>
          <th style="width:44px">Adet</th><th style="width:56px">Boy</th><th style="width:56px">En</th>
          <th style="width:44px">Adet</th><th style="width:56px">Boy</th><th style="width:56px">En</th>
          ${'<th style="width:42px">Boy</th><th style="width:42px">En</th>'.repeat(4)}
        </tr>
        ${form.satirlar.map((s, i) => satirHtml(s, i, g)).join('')}
        <tr style="background:var(--surface2);font-weight:600">
          <td colspan="13">TOPLAM</td>
          <td class="r">${ozet.toplamParca}</td>
          <td colspan="12"></td>
          <td class="r">${ozet.toplamM2}</td><td></td>
        </tr>
      </table></div>

      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        ${ozet.gruplar.map(gr => `<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px">
          <b style="font-size:12px">${gr.grup}</b>${gr.ad ? ' <span class="muted" style="font-weight:400">— ' + App.escapeHtml(gr.ad) + '</span>' : ''}
          <div style="font-size:11px;color:var(--muted)">
            ${gr.satir} satır · ${gr.m2.toFixed(3)} m²</div>
        </div>`).join('')}
      </div>

      <div style="margin-top:10px">
        <div class="card-title" style="font-size:11.5px;margin-bottom:6px">Kullanılan Kenar Bandı (net ölçü × seçim + 0,02 m fire)</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${kenarBandiOzet.length ? kenarBandiOzet.map(b => `<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px">
            <b style="font-size:12px" class="mono">${App.escapeHtml(b.kod)}</b>${b.ad ? ' <span class="muted" style="font-weight:400">— ' + App.escapeHtml(b.ad) + '</span>' : ''}
            <div style="font-size:11px;color:var(--muted)">${b.metre} m</div>
          </div>`).join('') : '<div class="muted" style="font-size:11.5px">Henüz kenar bandı seçilmedi.</div>'}
        </div>
      </div>`;

    // Alan düzenleme
    el.querySelectorAll('.ie-h').forEach(inp => {
      inp.onchange = () => {
        const i = +inp.dataset.i, k = inp.dataset.k;
        const s = form.satirlar[i];
        if (k.includes('.')) {
          const [a, b] = k.split('.');
          s[a][b] = inp.value;
        } else {
          s[k] = (/^(netAdet|netBoy|netEn|kabaAdet|kabaBoy|kabaEn|kalinlik|paketAdedi|uretimMiktari)$/.test(k))
            ? (+inp.value || 0) : inp.value;
        }
        // Net adet veya paket adedi değişince üretim miktarı (= net adet ×
        // paket adedi) otomatik yeniden hesaplanır — TÜM aşağı akış
        // hesaplarının (m², kenar bandı metrajı) çarpanı budur.
        if (['netAdet', 'paketAdedi'].includes(k)) {
          s.uretimMiktari = (+s.netAdet || 0) * (+s.paketAdedi || 1);
        }
        // Türetilen alanları yeniden hesapla
        if (['netBoy', 'netEn', 'netAdet', 'paketAdedi', 'kalinlik', 'uretimMiktari'].includes(k)) {
          const bg = IsEmriUretici.bantGrubu(s.kalinlik);
          s.bantGrup = bg.grup; s.bantInce = bg.ince; s.bantKalin = bg.kalin;
          s.birimM2 = Math.round((s.netBoy * s.netEn) / 1e6 * 1000) / 1000;
          s.toplamM2 = Math.round(s.birimM2 * (+s.uretimMiktari || 0) * 1000) / 1000;
        }
        // Parça kodu elle değiştirildiyse mevcut kartla yeniden eşleştir
        if (k === 'parcaKodu') { kartlaEslestir(s).then(() => tabloCiz(main)); return; }
        tabloCiz(main);
      };
    });
    el.querySelectorAll('.ie-kod-sec').forEach(b => b.onclick = () => parcaKoduSec(+b.dataset.i));
    el.querySelectorAll('.ie-plaka-sec').forEach(b => b.onclick = () => plakaSec(+b.dataset.i));
    el.querySelectorAll('.ie-bant-sec').forEach(b => b.onclick = () => bantSec(+b.dataset.i, b.dataset.grup));
    el.querySelectorAll('.ie-sil').forEach(b => b.onclick = () => {
      form.satirlar.splice(+b.dataset.i, 1);
      form.satirlar.forEach((s, j) => s.sira = j + 1);
      tabloCiz(main);
    });
  }

  function satirHtml(s, i, g) {
    const inp = (k, deger, tip, gen, kilitli) =>
      `<input class="finput ie-h" ${g(i, k)} ${tip ? 'type="' + tip + '"' : ''} ${kilitli ? 'disabled' : ''}
        value="${App.escapeHtml(deger == null ? '' : String(deger))}"
        style="width:${gen || 100}%;font-size:13px;padding:4px 3px;text-align:${tip === 'number' ? 'right' : 'left'}${kilitli ? ';opacity:.65' : ''}">`;
    // Kenar bandı sayısı: bir kenarda en fazla 2 taraf (boy/en) olabilir —
    // 0 = bant yok, 1 = tek taraf, 2 = çift taraf. Başka rakam anlamsızdır.
    const sel012 = (k, deger) =>
      `<select class="finput ie-h" ${g(i, k)} style="width:100%;font-size:13px;padding:4px 2px">
        ${[0, 1, 2].map(n => `<option value="${n}" ${+deger === n ? 'selected' : ''}>${n}</option>`).join('')}
      </select>`;
    const bantliGruplar = ['pvc2', 'pvc1', 'pvc040', 'soft'];
    const bant = (ad) => {
      const secBtn = `<button class="btn btn-sm ie-bant-sec"
        data-i="${i}" data-grup="${ad}" style="padding:1px 3px;font-size:10.5px;vertical-align:middle"
        title="${s[ad].bandKartId ? 'Kenar bandı: ' + App.escapeHtml(s[ad].bandKodu || '') : 'Kenar bandı seç'}"
        >${s[ad].bandKartId ? '🔗' : '🔍'}</button>`;
      return `<td style="white-space:nowrap">${sel012(ad + '.boy', s[ad].boy)}${secBtn}</td>
              <td>${sel012(ad + '.en', s[ad].en)}</td>`;
    };
    const kalinlikKilitli = !!s.plakaKartId;
    return `<tr>
      <td>${inp('paketNo', s.paketNo)}</td>
      <td>${inp('paketAdedi', s.paketAdedi, 'number')}</td>
      <td style="white-space:nowrap">${inp('parcaKodu', s.parcaKodu, null, 66)}<button
        class="btn btn-sm ie-kod-sec" data-i="${i}" style="padding:2px 4px;font-size:11px;margin-left:2px"
        title="${s.parcaKartId ? 'Yarı mamül kartına bağlı' : 'Yarı mamül kartı seç'}"
        >${s.parcaKartId ? '🔗' : '🔍'}</button></td>
      <td>${inp('parcaAdi', s.parcaAdi)}</td>
      <td style="white-space:nowrap"><button class="btn btn-sm ie-plaka-sec" data-i="${i}"
        style="padding:2px 5px;font-size:11px"
        title="${s.plakaKartId ? 'Plaka: ' + App.escapeHtml(s.plakaKodu || '') + ' (kalınlık kilitli)' : 'Plaka hammadde seç'}"
        >${s.plakaKartId ? '🔗 ' : '🔍 '}${App.escapeHtml(s.plakaKodu ? (s.plakaKodu + (s.plakaAd ? ' — ' + s.plakaAd : '')) : 'Seç')}</button></td>
      <td>${inp('kalinlik', s.kalinlik, 'number', null, kalinlikKilitli)}</td>
      <td>${inp('renk', s.renk)}</td>
      <td>${inp('netAdet', s.netAdet, 'number')}</td>
      <td>${inp('netBoy', s.netBoy, 'number')}</td>
      <td>${inp('netEn', s.netEn, 'number')}</td>
      <td>${inp('kabaAdet', s.kabaAdet, 'number')}</td>
      <td>${inp('kabaBoy', s.kabaBoy, 'number')}</td>
      <td>${inp('kabaEn', s.kabaEn, 'number')}</td>
      <td>${inp('uretimMiktari', s.uretimMiktari, 'number')}</td>
      <td>${inp('yariMamul', s.yariMamul)}</td>
      <td>${inp('yatar', s.yatar)}</td>
      <td>${inp('mHiz', s.mHiz)}</td>
      ${bant('pvc2')}${bant('pvc1')}${bant('pvc040')}${bant('soft')}
      <td>${inp('aciklamalar', s.aciklamalar)}</td>
      <td class="r">${s.birimM2}</td>
      <td><button class="btn btn-sm ie-sil" data-i="${i}" style="color:var(--red-text);padding:1px 5px">✕</button></td>
    </tr>`;
  }

  // ── DOSYA OKUMA ──────────────────────────────────────────────────────────
  async function dosyaOku(main, e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const durum = document.getElementById('ie-durum');
    const ad = (f.name || '').toLowerCase();
    durum.innerHTML = '<span class="muted">Okunuyor…</span>';
    try {
      if (/\.(step|stp)$/.test(ad)) {
        const metin = await f.text();
        const agac = StepOkuyucu.oku(metin);
        const geo = StepOkuyucu.geometriCikar(metin);
        if (!geo.geometriVar) {
          durum.innerHTML = '<span style="color:var(--amber-text)">⚠ STEP okundu ama geometri yok. ' +
            'SolidWorks\'te "Output as: Solid/Surface geometry" seçili olmalı — ' +
            'Wireframe seçilirse ölçüler çıkmaz.</span>';
          return;
        }
        form.satirlar = IsEmriUretici.stepDenUret(agac, geo, {});
        form.kaynak = 'STEP: ' + f.name;
        if (!form.isEmriIsmi && agac.kok) form.isEmriIsmi = agac.kok.ad;
        durum.innerHTML = `<span style="color:var(--green-text)">✓ ${form.satirlar.length} parça satırı ` +
          `üretildi · ölçüler geometriden KESİN alındı</span>`;
        ekBilgi = null;
        await tumSatirlariEslestir();
        render(main);
        return;
      }

      if (/\.pdf$/.test(ad)) {
        const r = await PlanOkuyucu.metindenCoz(f, 1);   // metin nesnelerini alır
        const metinler = (r && r.mahaller) ? [] : [];
        // metindenCoz mahal odaklıdır; ham metinler için doğrudan okuyucu:
        const ham = await pdfMetinleri(f);
        const u = IsEmriUretici.pdfDenUret(ham, {});
        form.satirlar = u.satirlar;
        form.kaynak = 'PDF: ' + f.name;
        ekBilgi = u;
        durum.innerHTML = `<span style="color:var(--amber-text)">✓ ${u.malzemeler.length} malzeme kodu, ` +
          `${u.urunler.length} ürün bulundu — <b>ölçüleri doldurmanız gerekiyor</b></span>`;
        await tumSatirlariEslestir();
        render(main);
        return;
      }

      if (/\.dwg$/.test(ad)) {
        if (DwgOkuyucu.mobilMi() && !window.confirm(DwgOkuyucu.mobilUyari())) {
          durum.innerHTML = '<span class="muted">İptal edildi.</span>'; return;
        }
        const d = await DwgOkuyucu.metinleriCikar(f,
          (m) => { durum.innerHTML = '<span class="muted">' + App.escapeHtml(m) + '</span>'; });
        const u = IsEmriUretici.pdfDenUret(d.metinler, {});
        form.satirlar = u.satirlar;
        form.kaynak = 'DWG: ' + f.name;
        ekBilgi = u;
        durum.innerHTML = `<span style="color:var(--amber-text)">✓ DWG okundu · ` +
          `${u.malzemeler.length} malzeme kodu — <b>ölçüleri doldurun</b></span>`;
        await tumSatirlariEslestir();
        render(main);
        return;
      }

      durum.innerHTML = '<span style="color:var(--red-text)">Desteklenmeyen dosya. ' +
        'STEP (.step/.stp), PDF veya DWG yükleyin.</span>';
    } catch (err) {
      durum.innerHTML = '<span style="color:var(--red-text)">✕ ' +
        App.escapeHtml((err && err.message) || String(err)) + '</span>';
    }
  }

  // PDF'in ham metin nesnelerini konumlarıyla alır
  async function pdfMetinleri(dosya) {
    if (!window.pdfjsLib) {
      await new Promise((cz, rd) => {
        const s = document.createElement('script');
        s.src = 'pdf.min.js'; s.onload = cz; s.onerror = () => rd(new Error('PDF motoru yüklenemedi.'));
        document.head.appendChild(s);
      });
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions
          && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
      }
    }
    const buf = await dosya.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const tc = await (await doc.getPage(1)).getTextContent();
    return tc.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
  }

  function ekBilgiCiz() {
    const el = document.getElementById('ie-ek');
    if (!el || !ekBilgi) return;
    el.innerHTML = `
      <div style="border:1px solid var(--amber-text);background:var(--amber-bg);
        border-radius:8px;padding:8px;font-size:11.5px">
        <b style="color:var(--amber-text)">⚠ ${App.escapeHtml(ekBilgi.uyari)}</b>
        ${ekBilgi.olcuAdaylari.length ? `<div style="margin-top:5px">
          <b>Plandaki ölçüler:</b> ${ekBilgi.olcuAdaylari.join(' · ')} mm</div>` : ''}
      </div>
      ${ekBilgi.malzemeler.length ? `<table class="dtable" style="margin-top:8px">
        <tr><th>Malzeme Kodu</th><th>Açıklama</th><th>Tip</th><th></th></tr>
        ${ekBilgi.malzemeler.map(m => `<tr>
          <td class="mono" style="font-size:10.5px">${App.escapeHtml(m.kod)}</td>
          <td style="font-size:11px">${App.escapeHtml(m.ad)}</td>
          <td style="font-size:11px">${m.tip === 'kenar_bandi' ? 'Kenar bandı'
            : m.tip === 'kaplama' ? 'Kaplama' : m.tip === 'plaka' ? 'Plaka' : 'Diğer'}</td>
          <td><button class="btn btn-sm ie-kod-ata" data-kod="${App.escapeHtml(m.kod)}">Satırlara ata</button></td>
        </tr>`).join('')}
      </table>` : ''}`;
    el.querySelectorAll('.ie-kod-ata').forEach(b => b.onclick = async () => {
      form.satirlar.forEach(s => { if (!s.parcaKodu) s.parcaKodu = b.dataset.kod; });
      await tumSatirlariEslestir();
      App.toast('Kod boş satırlara atandı.', 'ok');
      render(document.querySelector('main') || document.body);
    });
  }

  // ── EXCEL ÇIKTISI ────────────────────────────────────────────────────────
  // Çalışma kitabını kurar (indirme VE karta dosya olarak ekleme tarafından
  // ortak kullanılır) — sadece hazırlar, dosyayı diske YAZMAZ.
  function excelKitabiOlustur() {
    if (!window.XLSX) throw new Error('Excel kütüphanesi yüklenemedi.');
    if (!form.satirlar.length) throw new Error('Önce satır ekleyin.');
    const S = [];
    S.push(['İŞ EMRİ', '', '', '', '', '', '', '', 'Doküman No', 'FR.29']);
    S.push(['İŞ EMRİ İSMİ', form.isEmriIsmi, '', '', '', '', '', '', 'Yayın Tarihi', '15.10.2007']);
    S.push(['İŞ EMRİ AÇILIŞ TARİHİ', form.acilisTarihi, '', '', '', '', '', '', 'Revizyon No', '01']);
    S.push(['İŞ EMRİ KODU', form.isEmriKodu, '', '', '', '', '', '', 'Revizyon Tarihi', '12.12.2012']);
    S.push([]);
    S.push(['Holzma', form.holzma, 'Ima', form.ima, 'Rover', form.rover, 'Delik', form.delik]);
    S.push(['Hazırlayan', form.hazirlayan, 'Onaylayan', form.onaylayan]);
    S.push([]);
    S.push([form.grup, form.altBaslik]);
    S.push(['Paket No', 'Paket Adedi', 'Parç.Kodu', 'Parça Adı', 'Plaka Hammadde', 'Kalınlık', 'Renk',
      'Net Adet', 'Net Boy', 'Net En', 'Kaba Adet', 'Kaba Boy', 'Kaba En',
      'Üretim miktarı', 'Yarı Mamül', 'Yatar', 'M.Hiz(+)',
      'PVC2 Boy', 'PVC2 En', 'PVC2 Bant', 'PVC1 Boy', 'PVC1 En', 'PVC1 Bant',
      'PVC0,40 Boy', 'PVC0,40 En', 'PVC0,40 Bant', 'SOFT Boy', 'SOFT En', 'SOFT Bant',
      'AÇIKLAMALAR', 'birim m²', 'Bant grubu']);
    form.satirlar.forEach(s => S.push([
      s.paketNo, s.paketAdedi, s.parcaKodu, s.parcaAdi, s.plakaKodu, s.kalinlik, s.renk,
      s.netAdet, s.netBoy, s.netEn, s.kabaAdet, s.kabaBoy, s.kabaEn,
      s.uretimMiktari, s.yariMamul, s.yatar, s.mHiz,
      s.pvc2.boy, s.pvc2.en, s.pvc2.bandKodu, s.pvc1.boy, s.pvc1.en, s.pvc1.bandKodu,
      s.pvc040.boy, s.pvc040.en, s.pvc040.bandKodu, s.soft.boy, s.soft.en, s.soft.bandKodu,
      s.aciklamalar, s.birimM2, s.bantGrup
    ]));
    const oz = IsEmriUretici.ozet(form.satirlar);
    S.push([]);
    S.push(['TOPLAM', '', '', '', '', '', '', '', '', '', '', '', '', oz.toplamParca,
      ...Array(17).fill(''), oz.toplamM2]);
    oz.gruplar.forEach(g => S.push([g.grup + (g.ad ? ' — ' + g.ad : ''), g.satir + ' satır', g.m2.toFixed(3) + ' m²']));
    const kb = IsEmriUretici.kenarBandiOzeti(form.satirlar);
    if (kb.length) {
      S.push([]);
      S.push(['Kullanılan Kenar Bandı', 'Metre (0,02m fire dahil)']);
      kb.forEach(b => S.push([b.kod + (b.ad ? ' — ' + b.ad : ''), b.metre]));
    }

    const ws = XLSX.utils.aoa_to_sheet(S);
    ws['!cols'] = [{ wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 8 }, { wch: 12 },
      ...Array(6).fill({ wch: 8 }), { wch: 10 }, ...Array(3).fill({ wch: 7 }),
      ...Array(12).fill({ wch: 7 }), { wch: 24 }, { wch: 9 }, { wch: 9 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'İş Emri');
    return wb;
  }

  function excelIndir() {
    try {
      const wb = excelKitabiOlustur();
      XLSX.writeFile(wb, (form.isEmriKodu || 'is_emri').replace(/[^\w.-]/g, '_') + '.xlsx');
      App.toast('İş emri Excel\'e aktarıldı.', 'ok');
    } catch (e) { App.toast('Aktarılamadı: ' + ((e && e.message) || e), 'err'); }
  }

  // ── LOGO SEÇ / DEĞİŞTİR ──────────────────────────────────────────────────
  // Antetli PDF'te kullanılan firma logosu — page_proje_teklif.js ile AYNI
  // localStorage anahtarını ('uretimos_firma_logo') kullanır, böylece hangi
  // ekrandan ayarlanırsa ayarlansın her iki çıktıda da aynı logo görünür.
  function logoSecFormu() {
    const mevcut = (() => { try { return localStorage.getItem('uretimos_firma_logo'); } catch (e) { return null; } })();
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Antetli PDF çıktısında görünecek logo. En fazla 400 KB, PNG veya JPG. Bilgisayarınızda saklanır, sunucuya gönderilmez.</div>
      <div id="ie-logo-onizle" style="min-height:56px;border:1px dashed var(--border);border-radius:8px;
        padding:6px;text-align:center;margin-bottom:8px">
        ${mevcut ? `<img src="${mevcut}" style="max-height:52px;max-width:100%">` : '<span class="muted" style="font-size:11px">Logo yok</span>'}</div>
      <input type="file" id="ie-logo-sec" accept="image/*" style="font-size:11.5px">
      <button class="btn btn-sm" id="ie-logo-sil" style="margin-top:5px;${mevcut ? '' : 'display:none'}">Logoyu Kaldır</button>
    `;
    App.openModal({ title: '🖼 Antetli PDF Logosu', body, footer: `<button class="btn" id="ie-logo-kapat">Kapat</button>`, wide: true });
    document.getElementById('ie-logo-kapat').onclick = App.closeModal;
    document.getElementById('ie-logo-sec').onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = await TeklifExcel.logoOku(f);
      if (!r.ok) { App.toast(r.hata, 'err'); return; }
      try {
        localStorage.setItem('uretimos_firma_logo', r.veri);
        document.getElementById('ie-logo-onizle').innerHTML = `<img src="${r.veri}" style="max-height:52px;max-width:100%">`;
        document.getElementById('ie-logo-sil').style.display = '';
        App.toast('Logo kaydedildi.', 'ok');
      } catch (x) { App.toast('Logo kaydedilemedi (depolama dolu olabilir).', 'err'); }
    };
    document.getElementById('ie-logo-sil').onclick = () => {
      try { localStorage.removeItem('uretimos_firma_logo'); } catch (e) { }
      document.getElementById('ie-logo-onizle').innerHTML = '<span class="muted" style="font-size:11px">Logo yok</span>';
      document.getElementById('ie-logo-sil').style.display = 'none';
      App.toast('Logo kaldırıldı.', 'ok');
    };
  }

  // ── KARTA DOSYA OLARAK EKLE ──────────────────────────────────────────────
  // İş emri Excel'ini seçilen bir ürün veya hammadde kartının "Teknik
  // Dosyalar" alanına (QrDosya) yükler — kalem_secici ile kart seçtirir,
  // sonra mevcut sunucu dosya yükleme uçlarını (Store.teknikDosyaYukle)
  // kullanır. Kartın kendi dosya listesinde diğer step/pdf/excel'lerle
  // birlikte görünür, QR ile de erişilebilir olur.
  // Bir sekmenin listesini Store'dan okuyup düz {id,kod,ad} kayıtlarına çevirir.
  // Proje Mahalleri özel: projeler → teklifler → mahaller → kalemler iç içe
  // saklanır, buradan tek düz listeye açılır.
  async function keListeYukle(tipDef) {
    if (tipDef.key === 'proje_mahal') {
      const projeler = await Store.projeler.all();
      const liste = [];
      projeler.forEach(p => (p.teklifler || []).forEach(t => (t.mahaller || []).forEach(m => (m.kalemler || []).forEach(k => {
        liste.push({ id: k.id, kod: k.kod || k.id, ad: `${p.ad} / ${m.ad} — ${k.ad}` });
      }))));
      return liste;
    }
    const kayitlar = await Store[tipDef.koleksiyon].all();
    return kayitlar
      .map(x => ({ id: x.id, kod: tipDef.kodAlani ? (x[tipDef.kodAlani] || '') : x.id, ad: x.ad || x.unvan || '' }))
      .filter(x => !tipDef.kodAlani || x.kod);   // kod alanı olan tiplerde kodu boş olan kart gizlenir
  }

  // ── KARTA EKLE / TAKİP ET — sekmeli merkez ────────────────────────────────
  // Her kart tipi (Bitmiş Ürün, Yarı Mamül, Hammadde, Müşteri, Tedarikçi,
  // Proje Mahalleri) AYRI bir sekmede aranır/seçilir. Her sekmede (Proje
  // Mahalleri hariç) "+ Yeni Ekle" ile sisteme yeni kart tanımlanabilir.
  // Her satırdaki 📁 ile o karta daha önce gönderilmiş iş emirleri, tarihe
  // göre (Yıl→Ay→Gün) gruplanmış klasör gezgininde görülebilir — böylece
  // hem gönderme hem de geçmişi takip etme AYNI ekrandan yapılır.
  async function karttaEkleTakipAc() {
    if (!Store.sunucuModu) { App.toast('Dosya alanı yalnızca sunucu (hosting) sürümünde çalışır', 'err'); return; }
    const body = document.createElement('div');
    App.openModal({ title: '📎 Karta Ekle / Takip Et', body, footer: `<button class="btn" id="ke-kapat">Kapat</button>`, wide: true });
    document.getElementById('ke-kapat').onclick = App.closeModal;

    async function ciz() {
      const tipDef = KART_TIPLERI.find(t => t.key === keSekme);
      body.innerHTML = `
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:8px">
          ${KART_TIPLERI.map(t => `<button class="btn btn-sm ke-tab ${t.key === keSekme ? 'btn-blue' : ''}" data-key="${t.key}">${t.etiket}</button>`).join('')}
        </div>
        ${tipDef.yeniOlustur ? `
          <div class="frow" style="margin-bottom:10px">
            ${tipDef.kodAlani ? `<div class="fgroup"><label class="flbl">Kod</label><input class="finput" id="ke-yeni-kod" placeholder="örn. YM.YENI.001" style="width:160px"></div>` : ''}
            <div class="fgroup" style="flex:1"><label class="flbl">${tipDef.kodAlani ? 'Ad' : 'Ünvan'}</label><input class="finput" id="ke-yeni-ad" placeholder="ad girin"></div>
            <div class="fgroup" style="align-self:flex-end"><button class="btn btn-green" id="ke-yeni-ekle">+ Yeni ${tipDef.etiket.replace(/ler$|lar$/, '')} Ekle</button></div>
          </div>` : `<div class="fhint" style="margin-bottom:10px">Proje mahal/kalem yalnızca Proje Teklif ekranından oluşturulabilir — burada sadece mevcutlar arasından seçilir.</div>`}
        <input class="finput" id="ke-arama" placeholder="Ara…" value="${App.escapeHtml(keArama)}" style="margin-bottom:8px">
        <div id="ke-liste" style="max-height:360px;overflow:auto"></div>
      `;

      body.querySelectorAll('.ke-tab').forEach(b => b.onclick = () => { keSekme = b.dataset.key; keArama = ''; ciz(); });
      const aramaEl = document.getElementById('ke-arama');
      aramaEl.oninput = () => { keArama = aramaEl.value; listeCiz(); };
      aramaEl.focus(); aramaEl.setSelectionRange(aramaEl.value.length, aramaEl.value.length);

      const yeniBtn = document.getElementById('ke-yeni-ekle');
      if (yeniBtn) yeniBtn.onclick = async () => {
        const kodEl = document.getElementById('ke-yeni-kod');
        const kod = kodEl ? kodEl.value.trim() : '';
        const ad = document.getElementById('ke-yeni-ad').value.trim();
        if (tipDef.kodAlani && !kod) { App.toast('Kod zorunlu', 'err'); return; }
        if (!ad) { App.toast(tipDef.kodAlani ? 'Ad zorunlu' : 'Ünvan zorunlu', 'err'); return; }
        try {
          const yeni = tipDef.yeniOlustur(kod, ad);
          await App.persist(() => Store[tipDef.koleksiyon].upsert(yeni));
          App.toast('Yeni kart oluşturuldu.', 'ok');
          keArama = ad; ciz();
        } catch (e) { App.toast('Oluşturulamadı: ' + ((e && e.message) || e), 'err'); }
      };

      async function listeCiz() {
        const liste = await keListeYukle(tipDef);
        const sm = keArama.trim().toLowerCase();
        const filtreli = sm ? liste.filter(x => (x.kod + ' ' + x.ad).toLowerCase().includes(sm)) : liste;
        const el = document.getElementById('ke-liste');
        if (!filtreli.length) {
          el.innerHTML = '<div class="muted" style="padding:10px;font-size:11.5px">Kayıt bulunamadı.</div>';
          return;
        }
        el.innerHTML = filtreli.slice(0, 200).map(x => `
          <div style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:8px;padding:7px 10px;margin-bottom:5px">
            <div style="flex:1;min-width:0">
              ${tipDef.kodAlani ? `<span class="mono" style="font-weight:700;font-size:11.5px">${App.escapeHtml(x.kod)}</span> — ` : ''}
              <span style="font-size:12px">${App.escapeHtml(x.ad)}</span>
            </div>
            <button class="btn btn-sm ke-gecmis" data-id="${x.id}" title="Gönderilen iş emirleri (tarihe göre)">📁</button>
            <button class="btn btn-sm btn-blue ke-ekle" data-id="${x.id}" data-kod="${App.escapeHtml(x.kod)}" data-ad="${App.escapeHtml(x.ad)}">📎 Ekle</button>
          </div>`).join('');
        el.querySelectorAll('.ke-gecmis').forEach(b => b.onclick = () => QrDosya.tarihliDosyalarAc(tipDef.tip, b.dataset.id, '', filtreli.find(x => x.id === b.dataset.id).ad));
        el.querySelectorAll('.ke-ekle').forEach(b => b.onclick = async () => {
          try {
            const wb = excelKitabiOlustur();
            const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const dosyaAdi = 'IsEmri_' + (form.isEmriKodu || 'form').replace(/[^\w.-]/g, '_') + '.xlsx';
            await Store.teknikDosyaYukle({ tip: tipDef.tip, refId: b.dataset.id, kod: b.dataset.kod, ad: b.dataset.ad, dosyaAdi, icerikB64: b64 });
            App.toast('İş emri, "' + (b.dataset.kod || b.dataset.ad) + '" kartına eklendi.', 'ok');
          } catch (e) { App.toast('Karta eklenemedi: ' + ((e && e.message) || e), 'err'); }
        });
      }
      listeCiz();
    }
    ciz();
  }

  // ── ANTETLİ PDF ──────────────────────────────────────────────────────────
  async function pdfYazdir() {
    try {
      if (!form.satirlar.length) { App.toast('Önce satır ekleyin.', 'err'); return; }
      let firma = {}, logo = null;
      try {
        const fb = await Store.firmaBilgileri.all();
        firma = (Array.isArray(fb) ? fb[0] : fb) || {};
      } catch (e) { }
      try { logo = localStorage.getItem('uretimos_firma_logo'); } catch (e) { }
      const oz = IsEmriUretici.ozet(form.satirlar);
      const kb = IsEmriUretici.kenarBandiOzeti(form.satirlar);
      const esc = App.escapeHtml;
      const w = window.open('', '_blank');
      if (!w) throw new Error('Açılır pencere engellendi.');
      w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${esc(form.isEmriKodu)} — İş Emri</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  body { font-family: Arial, sans-serif; font-size: 8.5px; color: #000; }
  .ust { display:flex; justify-content:space-between; align-items:flex-start;
         border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; }
  .ust img { max-height:44px; max-width:170px; object-fit:contain; }
  h1 { font-size:22px; margin:0; letter-spacing:2px; text-align:center; flex:1; }
  .dok { border:1px solid #000; padding:4px 7px; font-size:8px; line-height:1.5; }
  .bilgi { display:flex; gap:26px; margin-bottom:8px; font-size:10px }
  .bilgi b { display:inline-block; min-width:130px }
  .mak { display:flex; gap:16px; font-size:9.5px; margin-bottom:8px }
  .grup { background:#9e9e9e; color:#000; font-weight:bold; padding:3px 8px; font-size:11px }
  table { width:100%; border-collapse:collapse; }
  th,td { border:1px solid #000; padding:2px 3px; }
  th { background:#d9d9d9; font-size:7.5px; text-align:center }
  td { font-size:8px; height:15px }
  .r{text-align:right} .c{text-align:center}
  tfoot td { background:#eee; font-weight:bold }
</style></head><body>
  <div class="ust">
    <div>${logo ? `<img src="${logo}" alt="">` : `<b style="font-size:17px">${esc(firma.unvan || '')}</b>`}</div>
    <h1>İŞ EMRİ</h1>
    <div class="dok">Doküman No : FR.29<br>Yayın Tarihi : 15.10.2007<br>
      Revizyon No : 01<br>Revizyon Tarihi: 12.12.2012</div>
  </div>
  <div style="display:flex;justify-content:space-between">
    <div class="bilgi" style="flex-direction:column;gap:2px">
      <div><b>İŞ EMRİ İSMİ</b> ${esc(form.isEmriIsmi)}</div>
      <div><b>İŞ EMRİ AÇILIŞ TARİHİ</b> ${esc(form.acilisTarihi)}</div>
      <div><b>İŞ EMRİ KODU</b> ${esc(form.isEmriKodu)}</div>
    </div>
    <div class="mak" style="flex-direction:column;gap:2px">
      <div><b>Holzma :</b> ${esc(form.holzma)}</div><div><b>Ima :</b> ${esc(form.ima)}</div>
      <div><b>Rover :</b> ${esc(form.rover)}</div><div><b>Delik :</b> ${esc(form.delik)}</div>
    </div>
  </div>
  <div style="display:flex;margin-bottom:4px">
    <div class="grup" style="width:200px">${esc(form.grup)}</div>
    <div class="grup" style="flex:1;background:#bdbdbd">${esc(form.altBaslik)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2">Paket<br>No</th><th rowspan="2">Paket<br>Adedi</th>
        <th rowspan="2">Parç.Kodu</th><th rowspan="2">Parça Adı</th>
        <th rowspan="2">Plaka<br>Hammadde</th><th rowspan="2">Kalınlık</th><th rowspan="2">Renk</th>
        <th colspan="3">Net Ölçü</th><th colspan="3">Kaba Ölçü</th>
        <th rowspan="2">Üretim<br>miktarı</th><th rowspan="2">Yarı<br>Mamül</th>
        <th rowspan="2">Yatar</th><th rowspan="2">M.Hiz<br>(+)</th>
        <th colspan="2">PVC<br>2 mm</th><th colspan="2">PVC<br>1 mm</th>
        <th colspan="2">PVC<br>0,40 mm</th><th colspan="2">SOFT</th>
        <th rowspan="2">AÇIKLAMALAR</th><th rowspan="2">birim m²</th>
      </tr>
      <tr>
        <th>Adet</th><th>Boy</th><th>En</th><th>Adet</th><th>Boy</th><th>En</th>
        ${'<th>Boy</th><th>En</th>'.repeat(4)}
      </tr>
    </thead>
    <tbody>
      ${form.satirlar.map(s => `<tr>
        <td class="c">${esc(s.paketNo)}</td><td class="c">${s.paketAdedi}</td>
        <td>${esc(s.parcaKodu)}</td><td>${esc(s.parcaAdi)}</td>
        <td>${esc(s.plakaKodu)}</td><td class="c">${s.kalinlik || ''}</td><td>${esc(s.renk)}</td>
        <td class="c">${s.netAdet || ''}</td><td class="r">${s.netBoy || ''}</td><td class="r">${s.netEn || ''}</td>
        <td class="c">${s.kabaAdet || ''}</td><td class="r">${s.kabaBoy || ''}</td><td class="r">${s.kabaEn || ''}</td>
        <td class="c">${s.uretimMiktari || ''}</td>
        <td class="c">${esc(s.yariMamul)}</td><td class="c">${esc(s.yatar)}</td><td class="c">${esc(s.mHiz)}</td>
        ${['pvc2', 'pvc1', 'pvc040', 'soft'].map(b =>
          `<td class="c">${esc(s[b].boy)}</td><td class="c">${esc(s[b].en)}</td>`).join('')}
        <td>${esc(s.aciklamalar)}</td><td class="r">${s.birimM2 || ''}</td>
      </tr>`).join('')}
      ${Array(Math.max(0, 6 - form.satirlar.length)).fill(
        '<tr>' + '<td></td>'.repeat(27) + '</tr>').join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="13" class="r">TOPLAM</td><td class="c">${oz.toplamParca}</td>
      <td colspan="12"></td><td class="r">${oz.toplamM2}</td>
    </tr></tfoot>
  </table>
  <div style="margin-top:8px;display:flex;gap:16px;font-size:9px;flex-wrap:wrap">
    ${oz.gruplar.map(g => `<div style="border:1px solid #000;padding:3px 8px">
      <b>${g.grup}${g.ad ? ' — ' + esc(g.ad) : ''}</b> — ${g.satir} satır · ${g.m2.toFixed(3)} m²</div>`).join('')}
  </div>
  ${kb.length ? `<div style="margin-top:6px;font-size:9px">
    <b>Kullanılan Kenar Bandı (0,02m fire dahil):</b>
    <div style="display:flex;gap:16px;margin-top:3px;flex-wrap:wrap">
      ${kb.map(b => `<div style="border:1px solid #000;padding:3px 8px">
        <b>${esc(b.kod)}${b.ad ? ' — ' + esc(b.ad) : ''}</b> — ${b.metre} m</div>`).join('')}
    </div>
  </div>` : ''}
  <div style="margin-top:14px;display:flex;justify-content:space-between;font-size:9px">
    <div>Hazırlayan: ${esc(form.hazirlayan) || '______________'}</div>
    <div>Onaylayan: ${esc(form.onaylayan) || '______________'}</div>
    <div>Üretim Sorumlusu: ______________</div>
  </div>
</body></html>`);
      w.document.close();
      setTimeout(() => { try { w.print(); } catch (e) { } }, 450);
    } catch (e) { App.toast('Yazdırılamadı: ' + ((e && e.message) || e), 'err'); }
  }

  return { render };
})();
