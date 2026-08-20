// ════════════════════════════════════════════════════════════════════════════
// DOLAP TASARIM EKRANI
//
// Dolabı yapılandırır (ölçü, modülasyon, raflar, kapaklar, çekmeceler, taç,
// baza/ayak, hırdavat markası, panel bazlı malzeme ve kenar bandı), ölçüleri
// hesaplar (dolap_hesap.js), teknik resmini çizer (dolap_cizim.js) ve MEVCUT
// ÜRÜN AĞACI MANTIĞIYLA sisteme işler.
//
// ── ÜRETİLEN AĞAÇ ──────────────────────────────────────────────────────────
//   Ürün kartı (dolap)
//     └─ Reçete
//         ├─ yarı mamül: Yan panel (dikme)  ×2
//         │    └─ Reçete: plaka hammadde (kaba/net ölçü + 4 kenar bandı)
//         ├─ yarı mamül: Kapak ×2
//         │    └─ Reçete: plaka hammadde (kaba/net ölçü + 4 kenar bandı)
//         ├─ yarı mamül: Raf / Taç / Arkalık / Dikey ayraç ...
//         └─ hammadde: menteşe, ray, kulp, minifix, askı borusu ...
//
// Kenar bandı, plaka kaleminin `kenarBantlari` alanında tutulur — sistemin
// geri kalanı (maliyet, Excel, MRP, satınalma) bandı ORADAN okur. Ayrı bant
// kalemi eklenmez; eklenseydi bant maliyeti iki kez sayılırdı.
// Bant atanmayan kenar boş kalır (o kenar bantsız üretilir).
//
// ── TASARIM KAYDI VE REVİZYON ──────────────────────────────────────────────
// Tasarım `dolapTasarimlari` koleksiyonunda saklanır; sonradan açılıp
// düzenlenebilir. Her "Ürün Ağacına İşle" yeni bir REVİZYON üretir:
// eski ürün/reçete silinmez, olduğu gibi kalır; yenisi -R2, -R3 … kodlarıyla
// ayrı kaydedilir. Eskisini istemiyorsanız ürün kartından siz silersiniz.
// ════════════════════════════════════════════════════════════════════════════
const DolapTasarim = (() => {

  const esc = (s) => (window.App ? App.escapeHtml(s) : String(s == null ? '' : s));
  const H = DolapHesap;
  const Z = (typeof DolapCizim !== 'undefined') ? DolapCizim : null;

  // ── EKRAN DURUMU ─────────────────────────────────────────────────────────
  let tasarim = null;        // düzenlenen kayıt (yeni ise id=null)
  let bolmeler = [];         // modülasyon
  let seciliBolme = 0;
  let tekRaflar = [];        // tek bölmeli dolapta raf listesi
  let panelAyarlari = {};    // rol → { kalinlik, hammaddeId, bantlar{on,arka,sag,sol} }
  let sonHesap = null;
  let aktifSekme = 'parca';
  let aktifGorunum = 'izo';   // izo | 3d — görsel önizleme modu
  let plakalar = [], bantlar = [], tumTasarimlar = [];

  const AKSESUARLAR = [
    ['', 'Yok'], ['askilik', 'Askılık borusu'], ['tel_sepet', 'Tel sepet'],
    ['pantolonluk', 'Pantolonluk'], ['camasirlik', 'Çamaşırlık'], ['kiler', 'Kiler sistemi'],
    ['cop_kovasi', 'Çöp kovası'], ['firin', 'Fırın boşluğu'], ['mikrodalga', 'Mikrodalga boşluğu']
  ];

  // Panel rollerinin okunabilir adları — malzeme tablosunda kullanılır
  const ROL_ADI = {
    yan: 'Yan panel (dikme)', ust: 'Üst panel', alt: 'Alt panel',
    ayrac: 'Dikey ayraç', raf_sabit: 'Sabit raf', raf_hareketli: 'Hareketli raf',
    kapak: 'Kapak', arkalik: 'Arkalık', ust_tac: 'Üst taç', alt_tac: 'Alt taç',
    baza: 'Baza', kayit: 'Kayıt', cekmece: 'Çekmece kutusu',
    cekmece_kapak: 'Çekmece kapağı', cekmece_alt: 'Çekmece altı'
  };
  const KENARLAR = [['on', 'Ön'], ['arka', 'Arka'], ['sag', 'Sağ'], ['sol', 'Sol']];

  // ── ALAN ÜRETİCİLER ──────────────────────────────────────────────────────
  const sayiAlan = (id, etiket, deger, adim) =>
    `<div class="fgroup" style="margin:0"><label class="flbl" style="font-size:10.5px">${etiket}</label>
      <input class="finput dt-in" id="${id}" type="number" step="${adim || 1}" value="${deger}" style="font-size:12px"></div>`;
  const secAlan = (id, etiket, secenekler, secili) =>
    `<div class="fgroup" style="margin:0"><label class="flbl" style="font-size:10.5px">${etiket}</label>
      <select class="fselect dt-in" id="${id}" style="font-size:12px">
        ${secenekler.map(([v, a]) => `<option value="${v}" ${String(v) === String(secili) ? 'selected' : ''}>${esc(a)}</option>`).join('')}
      </select></div>`;
  const kutuAlan = (id, etiket, isaretli) =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
      <input type="checkbox" id="${id}" class="dt-in" ${isaretli ? 'checked' : ''}> ${etiket}</label>`;

  const yeniBolme = () => ({
    oran: 1, rafSabit: 0, rafHareketli: 2, raflar: [], kapakSayisi: 1,
    kapakDizilim: 'yanyana', kapakYukseklikleri: [],
    cekmeceSayisi: 0, cekmeceYukseklik: 180, aksesuar: ''
  });

  // ════════════════════════════════════════════════════════════════════════
  // AÇ — yeni tasarım veya kayıtlı tasarımı düzenleme
  // ════════════════════════════════════════════════════════════════════════
  async function ac(onSaved, mevcutTasarim) {
    const V = H.VARSAYILAN;
    const [hammaddeler, kayitlilar] = await Promise.all([
      Store.hammaddeler.all(),
      Store.dolapTasarimlari ? Store.dolapTasarimlari.all() : Promise.resolve([])
    ]);
    plakalar = hammaddeler.filter(h2 => h2.tip === 'plaka');
    bantlar = hammaddeler.filter(h2 => h2.tip === 'kenar_bandi');
    tumTasarimlar = kayitlilar || [];

    tasarim = mevcutTasarim ? JSON.parse(JSON.stringify(mevcutTasarim)) : null;
    const y = (tasarim && tasarim.yapilandirma) ? tasarim.yapilandirma : {};
    bolmeler = Array.isArray(y.bolmeler) && y.bolmeler.length ? JSON.parse(JSON.stringify(y.bolmeler)) : [];
    tekRaflar = Array.isArray(y.raflar) ? JSON.parse(JSON.stringify(y.raflar)) : [];
    panelAyarlari = y.panelAyarlari ? JSON.parse(JSON.stringify(y.panelAyarlari)) : {};
    seciliBolme = 0; sonHesap = null; aktifSekme = 'parca';
    const g = (alan, vars) => (y[alan] !== undefined && y[alan] !== null && y[alan] !== '') ? y[alan] : vars;

    const body = document.createElement('div');
    body.innerHTML = `
      ${tasarim ? `<div style="background:var(--blue-bg);border:1px solid var(--blue-light,var(--border));border-radius:8px;
        padding:8px 11px;font-size:11.5px;margin-bottom:10px">
        📐 <b>${esc(tasarim.ad)}</b> düzenleniyor — mevcut revizyon <b>R${tasarim.revizyon || 1}</b>.
        Ürün ağacına işlediğinizde <b>R${(tasarim.revizyon || 1) + 1}</b> olarak <u>ayrı</u> kaydedilir; eski revizyon silinmez.
      </div>` : ''}

      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">

        <!-- ── SOL: YAPILANDIRMA ── -->
        <div style="flex:1 1 300px;min-width:290px;max-width:400px">
          <div class="fgroup"><label class="flbl">Dolap Adı / Kodu <span style="color:var(--red-text)">*</span></label>
            <input class="finput" id="dt-ad" placeholder="örn. 2 Kapaklı Boy Dolabı 80cm" value="${tasarim ? esc(tasarim.ad) : ''}"></div>

          <div class="card-title" style="font-size:11px;margin:10px 0 6px">DIŞ ÖLÇÜ (mm)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            ${sayiAlan('dt-w', 'Genişlik', g('genislik', V.genislik))}
            ${sayiAlan('dt-h', 'Yükseklik', g('yukseklik', V.yukseklik))}
            ${sayiAlan('dt-d', 'Derinlik', g('derinlik', V.derinlik))}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            ${sayiAlan('dt-t', 'Genel panel kalınlık', g('panelKalinlik', V.panelKalinlik))}
            ${sayiAlan('dt-tb', 'Arkalık kalınlık', g('arkalikKalinlik', V.arkalikKalinlik))}
          </div>
          <div class="fhint">Panel bazlı kalınlık ve hammadde aşağıdaki <b>Malzeme ve Kenar Bandı</b> bölümünden verilir.</div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">GÖVDE VE ARKALIK</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${secAlan('dt-govde', 'Gövde tipi', [['yan_tam', 'Yanlar tam boy'], ['ust_tam', 'Üst/alt tam en']], g('govdeTipi', V.govdeTipi))}
            ${secAlan('dt-arkalik', 'Arkalık', [['kanalli', 'Kanallı'], ['sirtli', 'Sırttan'], ['yok', 'Arkalıksız']], g('arkalikTipi', V.arkalikTipi))}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            ${secAlan('dt-arkalik-kanal', 'Kanal derinliği', [['6', '6 mm'], ['8', '8 mm'], ['10', '10 mm']], String(g('kanalDerinlik', V.kanalDerinlik)))}
            ${sayiAlan('dt-arka-mes', 'Arkalık arkadan mesafe', g('arkalikArkadanMesafe', 0))}
          </div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">MODÜLASYON (BÖLMELER)</div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end">
            ${sayiAlan('dt-bolme-sayi', 'Bölme sayısı (1 = tek gövde)', bolmeler.length > 1 ? bolmeler.length : 1)}
            <button class="btn btn-sm" id="dt-bolme-esit" style="height:32px">Eşit dağıt</button>
          </div>
          <div id="dt-bolme-panel" style="margin-top:8px"></div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">RAFLAR</div>
          <div id="dt-raf-panel"></div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">KAPAKLAR VE ÇEKMECELER</div>
          <div id="dt-kapak-panel"></div>

          <div style="margin-top:8px;display:flex;gap:14px;flex-wrap:wrap">
            ${kutuAlan('dt-kulp', 'Kulp kullanılıyor', g('kulpVar', true))}
            ${kutuAlan('dt-ust-acilir', 'Üstten açılır (kaldırma sistemi)', g('ustAcilirKapak', false))}
          </div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">ÜST BÖLÜM (TAÇ)</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:end">
            ${kutuAlan('dt-ust-tac', 'Üst taç var', g('ustTac', false))}
            ${sayiAlan('dt-ust-tac-kal', 'Taç kalınlığı (mm)', g('ustTacKalinlik', 18))}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            ${secAlan('dt-ust-tac-konum', 'Taç montajı', [['ustune', 'Yanların üstüne'], ['aralarina', 'Yanların arasına']], g('ustTacKonum', 'ustune'))}
            ${sayiAlan('dt-ust-tac-der', 'Taç derinliği (0 = gövde)', g('ustTacDerinlik', 0))}
          </div>
          <div class="fhint">Taç bir panel gibi ele alınır: <b>üstüne</b> → en = genişlik, <b>arasına</b> → en = genişlik − 2×yan kalınlık. Gövde yüksekliğinden kendi kalınlığı kadar düşer.</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            ${secAlan('dt-ust-sistem', 'Taç yerine kayıt/profil', [['', 'Yok'], ['kayit_yatay', 'Yatay kayıt'], ['kayit_dikey', 'Dikey kayıt'], ['profil_metal', 'Metal profil'], ['profil_aluminyum', 'Alüminyum profil']], g('ustSistem', ''))}
            ${sayiAlan('dt-kayit-gen', 'Kayıt genişliği', g('kayitGenislik', V.kayitGenislik))}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            ${sayiAlan('dt-kayit-adet', 'Kayıt adedi', g('kayitAdet', V.kayitAdet))}
            <div style="display:flex;align-items:end;padding-bottom:7px">${kutuAlan('dt-alt-tac', 'Alt taç', g('altTac', false))}</div>
          </div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">BAZA / AYAK</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${secAlan('dt-baza', 'Alt yapı', [['baza', 'Baza'], ['ayak', 'Ayak'], ['yok', 'Yok']], g('bazaTipi', V.bazaTipi))}
            ${sayiAlan('dt-baza-y', 'Baza yüksekliği', g('bazaYukseklik', V.bazaYukseklik))}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            ${secAlan('dt-ayak', 'Ayak tipi', [['plastik_ayak', 'Plastik'], ['metal_ayak', 'Metal'], ['gizli_ayak', 'Gizli'], ['ahsap_ayak', 'Ahşap']], g('ayakTipi', V.ayakTipi))}
            ${sayiAlan('dt-ayak-y', 'Ayak yüksekliği', g('ayakYukseklik', V.ayakYukseklik))}
          </div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:8px;align-items:end">
            ${sayiAlan('dt-ayak-adet', 'Ayak adedi', g('ayakAdet', V.ayakAdet))}
            <div style="padding-bottom:7px">${kutuAlan('dt-ayak-oto', 'Otomatik', g('ayakOtomatik', false))}</div>
          </div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">HIRDAVAT VE ÜRETİM</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${secAlan('dt-marka', 'Hırdavat markası', [['Hettich', 'Hettich'], ['Blum', 'Blum'], ['Hafele', 'Häfele'], ['Samet', 'Samet']], g('marka', V.marka))}
            ${sayiAlan('dt-kesim', 'Kesim payı (mm)', g('kesimPayi', V.kesimPayi))}
          </div>
          <div style="margin-top:8px">${kutuAlan('dt-delik', 'CNC delik planı üret (32 mm sistem)', g('delikPlani', true))}</div>
          <div id="dt-marka-bilgi" class="fhint" style="margin-top:6px;line-height:1.65"></div>
        </div>

        <!-- ── ORTA: TEKNİK RESİM + MALZEME ── -->
        <div style="flex:1 1 400px;min-width:300px">
          <div class="card-title" style="font-size:11px;margin-bottom:6px">TEKNİK RESİM</div>
          <div id="dt-cizim" style="display:grid;grid-template-columns:1.3fr .75fr;gap:8px;align-items:start"></div>
          <div class="fhint" id="dt-cizim-not" style="margin:6px 0"></div>
          <div class="card-title" style="font-size:11px;margin:12px 0 6px">MALZEME VE KENAR BANDI</div>
          <div id="dt-malzeme-panel"></div>
        </div>

        <!-- ── SAĞ: ÜRETİM VERİSİ ── -->
        <div style="flex:1 1 320px;min-width:280px">
          <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
            <button class="btn btn-sm dt-sekme" data-s="parca">Parça</button>
            <button class="btn btn-sm dt-sekme" data-s="delik">Delik</button>
            <button class="btn btn-sm dt-sekme" data-s="hirdavat">Hırdavat</button>
            <button class="btn btn-sm" id="dt-csv">⬇ CSV</button>
            <button class="btn btn-sm" id="dt-cnc">⚙ CNC (MPR/DXF)</button>
            <button class="btn btn-sm" id="dt-yazdir">🖨</button>
          </div>
          <div id="dt-onizleme"></div>
          <div style="margin-top:10px;max-width:380px">
            <div style="display:flex;gap:6px;margin-bottom:6px">
              <button class="btn btn-sm dt-gorunum-sec" data-g="izo" id="dt-g-izo">📐 İzometrik</button>
              <button class="btn btn-sm dt-gorunum-sec" data-g="3d" id="dt-g-3d">🧊 3D (döndür)</button>
            </div>
            <div id="dt-3b"></div>
            <div id="dt-3d-kap" style="display:none;border:1px solid var(--border);border-radius:8px;overflow:hidden"></div>
            <div id="dt-3d-not" class="fhint" style="display:none;margin-top:4px">Sürükle: döndür · Tekerlek/kıstır: yakınlaştır. Basit katı model — fotogerçekçi render değil.</div>
          </div>
        </div>
      </div>`;

    App.openModal({
      title: tasarim ? '🗄 Dolap Tasarım — Düzenle' : '🗄 Dolap Tasarım', body, wide: true,
      footer: `<button class="btn" id="dt-vaz">Vazgeç</button>
               <button class="btn" id="dt-hm-tanimla">🧱 Eksik Hammaddeleri Tanımla</button>
               <button class="btn" id="dt-render">🖼 Mekân Renderi Al</button>
               <button class="btn" id="dt-tasarim-kaydet">💾 Tasarımı Kaydet</button>
               <button class="btn btn-blue" id="dt-kaydet">${tasarim ? 'Yeni Revizyon Olarak İşle →' : 'Ürün Ağacına İşle →'}</button>`
    });
    document.getElementById('dt-vaz').onclick = App.closeModal;

    const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
    const chk = (id) => { const e = document.getElementById(id); return e ? e.checked : false; };

    const oku = () => ({
      genislik: +val('dt-w'), yukseklik: +val('dt-h'), derinlik: +val('dt-d'),
      panelKalinlik: +val('dt-t'), arkalikKalinlik: +val('dt-tb'),
      govdeTipi: val('dt-govde'), arkalikTipi: val('dt-arkalik'),
      kanalDerinlik: +val('dt-arkalik-kanal'), arkalikArkadanMesafe: +val('dt-arka-mes'),
      rafGeriCekme: 20,
      rafSabit: 0, rafHareketli: 0, raflar: bolmeler.length > 1 ? [] : tekRaflar,
      kapakSayisi: bolmeler.length > 1 ? 0 : (+val('dt-ksay') || 0),
      kapakTipi: val('dt-ktip') || 'tam_bini', fuga: +val('dt-fuga') || 3, kulpVar: chk('dt-kulp'),
      kapakDizilim: val('dt-kdizilim') || 'yanyana',
      kapakYukseklikleri: (val('dt-kyuk') || '').split(',').map(x => parseFloat(x)).filter(x => x > 0),
      cekmeceSayisi: bolmeler.length > 1 ? 0 : (+val('dt-cek-sayi') || 0),
      cekmeceYukseklik: +val('dt-cek-yuk') || 180, cekmeceTipi: val('dt-cek-tip') || 'normal',
      ustTac: chk('dt-ust-tac'), ustTacKalinlik: +val('dt-ust-tac-kal'),
      ustTacKonum: val('dt-ust-tac-konum'), ustTacDerinlik: +val('dt-ust-tac-der'),
      altTac: chk('dt-alt-tac'), altTacYukseklik: 80,
      ustSistem: val('dt-ust-sistem'), kayitGenislik: +val('dt-kayit-gen'),
      kayitAdet: +val('dt-kayit-adet'), ustAcilirKapak: chk('dt-ust-acilir'),
      bazaTipi: val('dt-baza'), bazaYukseklik: +val('dt-baza-y'),
      ayakTipi: val('dt-ayak'), ayakAdet: +val('dt-ayak-adet'),
      ayakYukseklik: +val('dt-ayak-y'), ayakOtomatik: chk('dt-ayak-oto'),
      marka: val('dt-marka'), kesimPayi: +val('dt-kesim'), delikPlani: chk('dt-delik'),
      bolmeler: bolmeler.length > 1 ? bolmeler : [],
      panelAyarlari: panelAyarlari,
      // Kapak sistemi / sürgülü / cam / LED
      kapakSistemi: val('dt-ksistem') || 'menteseli',
      surguluKanat: +val('dt-sg-kanat') || 2, surguluCerceve: val('dt-sg-cerceve') || 'aluminyum',
      surguluBindirme: +val('dt-sg-bindirme') || 0, surguluProfilEn: +val('dt-sg-profil') || 20,
      surguluRaySistemi: val('dt-sg-ray') || 'ustten_asmali',
      camTipi: val('dt-cam-tip') || 'yok', camKalinlik: +val('dt-cam-kal') || 4,
      camUstMesafe: +val('dt-cam-ust') || 0, camYukseklik: +val('dt-cam-yuk') || 0,
      camYanMesafe: +val('dt-cam-yan') || 0,
      ledYan: chk('dt-led-yan'), ledRaf: chk('dt-led-raf'),
      ledRenk: val('dt-led-renk') || 'ilikbeyaz',
      ledProfilVar: chk('dt-led-profil'), ledTrafoVar: chk('dt-led-trafo')
    });

    // ── Bölme sayısı ──
    const bolmeSayisiUygula = () => {
      const n = Math.max(1, Math.min(12, +val('dt-bolme-sayi') || 1));
      if (n === 1) { bolmeler = []; seciliBolme = 0; }
      else {
        while (bolmeler.length < n) bolmeler.push(yeniBolme());
        if (bolmeler.length > n) bolmeler = bolmeler.slice(0, n);
        if (seciliBolme >= bolmeler.length) seciliBolme = 0;
      }
    };

    // ── Aktif hedef: tek bölmede kök yapılandırma, çok bölmede seçili bölme ──
    const aktifKaynak = () => (bolmeler.length > 1 ? bolmeler[seciliBolme] : { _tek: true });
    const aktifRaflar = () => (bolmeler.length > 1 ? (bolmeler[seciliBolme].raflar = bolmeler[seciliBolme].raflar || []) : tekRaflar);

    // ══ RAF PANELİ — manuel konum + askı borusu ══
    function rafPaneliCiz() {
      const el = document.getElementById('dt-raf-panel');
      const liste = aktifRaflar();
      const bolmeEt = bolmeler.length > 1 ? ` — Bölme ${seciliBolme + 1}` : '';
      const icY = sonHesap ? (sonHesap.ozet.govdeYukseklik - (+val('dt-t') || 18) * 2) : 0;
      el.innerHTML = `
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
          <span style="font-size:10.5px;color:var(--text3)">Raf${bolmeEt}: <b>${liste.length}</b> adet${icY ? ' · iç yükseklik ' + Math.round(icY) + ' mm' : ''}</span>
          <button class="btn btn-sm" id="dt-raf-ekle">+ Raf</button>
          <button class="btn btn-sm" id="dt-raf-esit">Eşit dağıt</button>
        </div>
        ${liste.length ? `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <table class="dtable" style="font-size:11px;margin:0">
            <tr><th style="width:34px">#</th><th class="r">Üstten (mm)</th><th>Tip</th><th style="text-align:center">Altına askı borusu</th><th style="width:30px"></th></tr>
            ${liste.map((r, i) => `<tr>
              <td>${i + 1}</td>
              <td class="r"><input class="finput dt-raf-k" data-i="${i}" type="number" value="${r.konum || 0}" style="font-size:11px;padding:3px 5px;width:78px;text-align:right"></td>
              <td><select class="fselect dt-raf-t" data-i="${i}" style="font-size:11px;padding:3px 5px">
                <option value="hareketli" ${r.tip !== 'sabit' ? 'selected' : ''}>Hareketli</option>
                <option value="sabit" ${r.tip === 'sabit' ? 'selected' : ''}>Sabit</option></select></td>
              <td style="text-align:center"><input type="checkbox" class="dt-raf-b" data-i="${i}" ${r.askiBorusu ? 'checked' : ''}></td>
              <td><button class="btn btn-sm btn-ghost dt-raf-sil" data-i="${i}" style="color:var(--red-text);padding:2px 6px">✕</button></td>
            </tr>`).join('')}
          </table></div>
          <div class="fhint">Konum, bölmenin <b>üst iç kenarından</b> ölçülür. "Altına askı borusu" işaretlenirse o rafın altına boru + 2 flanş hırdavata eklenir.</div>`
        : `<div class="fhint">Raf yok. "+ Raf" ile ekleyin veya "Eşit dağıt" ile hızlıca oluşturun.</div>`}`;

      document.getElementById('dt-raf-ekle').onclick = () => {
        const l = aktifRaflar();
        const sonKonum = l.length ? Math.max.apply(null, l.map(r => +r.konum || 0)) : 0;
        l.push({ konum: Math.round(sonKonum + (icY ? Math.max(150, icY / 6) : 300)), tip: 'hareketli', askiBorusu: false });
        yenile();
      };
      document.getElementById('dt-raf-esit').onclick = () => {
        const adet = parseInt(prompt('Kaç raf eşit dağıtılsın?', String(Math.max(1, aktifRaflar().length || 3))), 10);
        if (!adet || adet < 1) return;
        const l = [];
        for (let i = 1; i <= adet; i++) l.push({ konum: Math.round(icY * i / (adet + 1)), tip: 'hareketli', askiBorusu: false });
        if (bolmeler.length > 1) bolmeler[seciliBolme].raflar = l; else tekRaflar = l;
        yenile();
      };
      el.querySelectorAll('.dt-raf-k').forEach(inp => inp.oninput = () => {
        aktifRaflar()[+inp.dataset.i].konum = parseFloat(inp.value) || 0; sadeceCizimTazele();
      });
      el.querySelectorAll('.dt-raf-t').forEach(sel => sel.onchange = () => {
        aktifRaflar()[+sel.dataset.i].tip = sel.value; yenile();
      });
      el.querySelectorAll('.dt-raf-b').forEach(cb => cb.onchange = () => {
        aktifRaflar()[+cb.dataset.i].askiBorusu = cb.checked; yenile();
      });
      el.querySelectorAll('.dt-raf-sil').forEach(b => b.onclick = () => {
        aktifRaflar().splice(+b.dataset.i, 1); yenile();
      });
    }

    // ══ KAPAK PANELİ ══
    function kapakPaneliCiz() {
      const el = document.getElementById('dt-kapak-panel');
      const cokMu = bolmeler.length > 1;
      const b = cokMu ? bolmeler[seciliBolme] : null;
      const kSay = cokMu ? (b.kapakSayisi || 0) : (y.kapakSayisi !== undefined ? y.kapakSayisi : V.kapakSayisi);
      const kDiz = cokMu ? (b.kapakDizilim || 'yanyana') : g('kapakDizilim', 'yanyana');
      const kYuk = cokMu ? (b.kapakYukseklikleri || []) : (y.kapakYukseklikleri || []);
      const cSay = cokMu ? (b.cekmeceSayisi || 0) : g('cekmeceSayisi', 0);
      const cYuk = cokMu ? (b.cekmeceYukseklik || 180) : g('cekmeceYukseklik', 180);
      const sistem = g('kapakSistemi', 'menteseli');
      el.innerHTML = `
        <div style="margin-bottom:8px">
          ${secAlan('dt-ksistem', 'Kapak sistemi', [['menteseli', 'Menteşeli kapak'], ['surgulu', 'Sürgülü kapak'], ['yok', 'Kapaksız (açık dolap)']], sistem)}
        </div>
        ${sistem === 'surgulu' ? `
          <div style="border:1.5px solid var(--border);border-radius:8px;padding:9px;margin-bottom:8px">
            <div class="card-title" style="font-size:10.5px;margin-bottom:6px">SÜRGÜLÜ KANAT</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
              ${sayiAlan('dt-sg-kanat', 'Kanat sayısı', g('surguluKanat', 2))}
              ${secAlan('dt-sg-cerceve', 'Çerçeve', [['aluminyum', 'Alüminyum çerçeve'], ['melamin', 'Melamin (tek parça)']], g('surguluCerceve', 'aluminyum'))}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px">
              ${sayiAlan('dt-sg-bindirme', 'Kanat bindirmesi', g('surguluBindirme', 25))}
              ${sayiAlan('dt-sg-profil', 'Profil eni', g('surguluProfilEn', 20))}
            </div>
            <div style="margin-top:7px">
              ${secAlan('dt-sg-ray', 'Ray sistemi', [['ustten_asmali', 'Üstten asmalı'], ['alttan_tekerlekli', 'Alttan tekerlekli']], g('surguluRaySistemi', 'ustten_asmali'))}
            </div>
            <div class="card-title" style="font-size:10.5px;margin:10px 0 6px">CAM</div>
            <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:7px">
              ${secAlan('dt-cam-tip', 'Cam tipi', [['yok', 'Cam yok'], ['seffaf', 'Şeffaf'], ['kumlu', 'Kumlu (buzlu)'],
                 ['bronz_reflekte', 'Bronz reflekte'], ['gumus_reflekte', 'Gümüş reflekte'], ['nervurlu', 'Nervürlü'], ['fume', 'Füme']], g('camTipi', 'yok'))}
              ${sayiAlan('dt-cam-kal', 'Cam kalınlığı', g('camKalinlik', 4))}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:7px">
              ${sayiAlan('dt-cam-ust', 'Üstten mesafe', g('camUstMesafe', 100))}
              ${sayiAlan('dt-cam-yuk', 'Cam yüksekliği (0=kalan)', g('camYukseklik', 0))}
              ${sayiAlan('dt-cam-yan', 'Yandan mesafe', g('camYanMesafe', 60))}
            </div>
            <div class="fhint">Cam konumu kanadın <b>üst kenarından</b> ve <b>yan kenarlarından</b> mm cinsinden ölçülür.</div>
          </div>` : ''}
        ${sistem === 'yok' ? `<div class="fhint" style="margin-bottom:8px">Kapaksız dolap — menteşe, kulp ve kapak paneli üretilmez.</div>` : ''}
        ${cokMu && sistem === 'menteseli' ? `<div class="fhint" style="margin-bottom:6px">Bölme ${seciliBolme + 1} kapakları düzenleniyor.</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;${sistem !== 'menteseli' ? 'opacity:.4;pointer-events:none' : ''}">
          ${sayiAlan('dt-ksay', 'Kapak sayısı', kSay)}
          ${secAlan('dt-ktip', 'Kapak tipi', [['tam_bini', 'Tam bini'], ['yarim_bini', 'Yarım bini'], ['icerlek', 'İçerlek']], g('kapakTipi', V.kapakTipi))}
          ${sayiAlan('dt-fuga', 'Fuga', g('fuga', V.fuga))}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:8px">
          ${secAlan('dt-kdizilim', 'Kapak dizilimi', [['yanyana', 'Yan yana (eşit)'], ['ustuste', 'Üst üste (manuel)']], kDiz)}
          <div class="fgroup" style="margin:0"><label class="flbl" style="font-size:10.5px">Kapak yükseklikleri (mm, virgülle)</label>
            <input class="finput dt-in" id="dt-kyuk" value="${(kYuk || []).join(', ')}" placeholder="600, 700, 580"
              style="font-size:12px" ${kDiz === 'ustuste' ? '' : 'disabled'}></div>
        </div>
        <div class="fhint">Üst üste dizilimde her kapağın yüksekliğini tek tek yazabilirsiniz; boş bırakılanlar kalan alana eşit bölünür.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;${sistem === 'yok' ? 'opacity:.4;pointer-events:none' : ''}">
          ${sayiAlan('dt-cek-sayi', 'Çekmece sayısı', cSay)}
          ${sayiAlan('dt-cek-yuk', 'Çekmece yüksekliği', cYuk)}
          ${secAlan('dt-cek-tip', 'Çekmece tipi', [['normal', 'Normal'], ['ic', 'İç çekmece'], ['gizli', 'Gizli']], g('cekmeceTipi', 'normal'))}
        </div>
        <div class="card-title" style="font-size:11px;margin:12px 0 6px">LED AYDINLATMA</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:7px">
          ${kutuAlan('dt-led-yan', 'Yan dikmelere dikey LED', g('ledYan', false))}
          ${kutuAlan('dt-led-raf', 'Rafların altına LED', g('ledRaf', false))}
        </div>
        <div style="display:grid;grid-template-columns:1.3fr auto auto;gap:8px;align-items:center">
          ${secAlan('dt-led-renk', 'LED rengi', [['gunisigi', 'Gün ışığı 3000K'], ['ilikbeyaz', 'Ilık beyaz 4000K'], ['beyaz', 'Beyaz 6500K'], ['rgb', 'RGB']], g('ledRenk', 'ilikbeyaz'))}
          <div style="padding-top:12px">${kutuAlan('dt-led-profil', 'Profil', g('ledProfilVar', true))}</div>
          <div style="padding-top:12px">${kutuAlan('dt-led-trafo', 'Trafo', g('ledTrafoVar', true))}</div>
        </div>`;
      el.querySelectorAll('.dt-in').forEach(e2 => { e2.oninput = kapakDegisti; e2.onchange = kapakDegisti; });
    }
    function kapakDegisti(e) {
      // Kapak sistemi değişimi formun yapısını değiştirir → tam yeniden çizim
      if (e && e.target && e.target.id === 'dt-ksistem') { yenile(); kapakPaneliCiz(); return; }
      if (bolmeler.length > 1) {
        const b = bolmeler[seciliBolme];
        b.kapakSayisi = +val('dt-ksay') || 0;
        b.kapakDizilim = val('dt-kdizilim');
        b.kapakYukseklikleri = (val('dt-kyuk') || '').split(',').map(x => parseFloat(x)).filter(x => x > 0);
        b.cekmeceSayisi = +val('dt-cek-sayi') || 0;
        b.cekmeceYukseklik = +val('dt-cek-yuk') || 180;
      }
      yenile();
    }

    // ══ MALZEME VE KENAR BANDI TABLOSU ══
    function malzemePaneliCiz() {
      const el = document.getElementById('dt-malzeme-panel');
      if (!sonHesap) { el.innerHTML = ''; return; }
      // Tasarımda gerçekten üretilen roller (arkalık, çekmece altı dahil)
      const roller = [];
      sonHesap.paneller.forEach(p => { if (roller.indexOf(p.rol) < 0) roller.push(p.rol); });
      if (!plakalar.length) {
        el.innerHTML = `<div class="fhint" style="color:var(--amber-text)">⚠ Sistemde <b>plaka</b> tipinde hammadde yok. Hammaddeler ekranından plaka kartı açın, sonra buradan panellere atayın.</div>`;
        return;
      }
      const plakaSec = (rol, sec) => `<select class="fselect dt-mlz" data-rol="${rol}" data-alan="hammaddeId" style="font-size:10.5px;padding:3px 4px;width:100%">
        <option value="">— Seçilmedi —</option>
        ${plakalar.map(p => `<option value="${p.id}" ${p.id === sec ? 'selected' : ''}>${esc(p.ad)}</option>`).join('')}</select>`;
      const bantSec = (rol, kenar, sec) => `<select class="fselect dt-bnt" data-rol="${rol}" data-kenar="${kenar}" style="font-size:10px;padding:2px 3px;width:100%">
        <option value="">—</option>
        ${bantlar.map(b => `<option value="${b.id}" ${b.id === sec ? 'selected' : ''}>${esc(b.ad)}</option>`).join('')}</select>`;

      el.innerHTML = `
        <div class="fhint" style="margin-bottom:6px">Her panel türü için kalınlık, plaka hammaddesi ve kenar bandı seçin.
          <b>Bant seçilmeyen kenar boş kalır</b> (bantsız üretilir).</div>
        ${!bantlar.length ? `<div class="fhint" style="color:var(--amber-text);margin-bottom:6px">⚠ Kenar bandı tipinde hammadde tanımlı değil — bant atayamazsınız.</div>` : ''}
        <div style="overflow:auto;max-height:300px;border:1px solid var(--border);border-radius:8px">
        <table class="dtable" style="font-size:10.5px;margin:0">
          <tr><th>Panel</th><th class="r" style="width:52px">Kal.</th><th style="min-width:120px">Plaka hammadde</th>
              ${KENARLAR.map(([, ad]) => `<th style="min-width:64px">${ad}</th>`).join('')}</tr>
          ${roller.map(rol => {
            const pa = panelAyarlari[rol] || {};
            const bl = pa.bantlar || {};
            return `<tr>
              <td><b>${esc(ROL_ADI[rol] || rol)}</b></td>
              <td class="r"><input class="finput dt-mlz" data-rol="${rol}" data-alan="kalinlik" type="number"
                value="${pa.kalinlik || ''}" placeholder="${(sonHesap.paneller.find(p => p.rol === rol) || {}).kalinlik || ''}"
                style="font-size:10.5px;padding:3px 4px;width:48px;text-align:right"></td>
              <td>${plakaSec(rol, pa.hammaddeId)}</td>
              ${KENARLAR.map(([k]) => `<td>${bantSec(rol, k, bl[k])}</td>`).join('')}
            </tr>`;
          }).join('')}
        </table></div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button class="btn btn-sm" id="dt-mlz-hepsi">Tüm panellere aynı plakayı ata</button>
          <button class="btn btn-sm" id="dt-mlz-bant4">Kapak ve raflara 4 kenar bant</button>
          <button class="btn btn-sm btn-ghost" id="dt-mlz-temizle">Temizle</button>
        </div>`;

      el.querySelectorAll('.dt-mlz').forEach(inp => {
        const olay = inp.tagName === 'SELECT' ? 'onchange' : 'oninput';
        inp[olay] = () => {
          const rol = inp.dataset.rol, alan = inp.dataset.alan;
          panelAyarlari[rol] = panelAyarlari[rol] || {};
          panelAyarlari[rol][alan] = (alan === 'kalinlik') ? (parseFloat(inp.value) || 0) : inp.value;
          yenile();
        };
      });
      el.querySelectorAll('.dt-bnt').forEach(sel => sel.onchange = () => {
        const rol = sel.dataset.rol, kenar = sel.dataset.kenar;
        panelAyarlari[rol] = panelAyarlari[rol] || {};
        panelAyarlari[rol].bantlar = panelAyarlari[rol].bantlar || {};
        panelAyarlari[rol].bantlar[kenar] = sel.value || null;
        yenile();
      });
      document.getElementById('dt-mlz-hepsi').onclick = () => {
        const ilk = plakalar[0];
        const sec = prompt('Tüm panellere atanacak plaka adının bir kısmını yazın:', ilk ? ilk.ad : '');
        if (!sec) return;
        const p = plakalar.find(x => (x.ad || '').toLocaleLowerCase('tr').indexOf(sec.toLocaleLowerCase('tr')) >= 0);
        if (!p) { App.toast('Eşleşen plaka bulunamadı', 'err'); return; }
        roller.forEach(rol => { panelAyarlari[rol] = panelAyarlari[rol] || {}; panelAyarlari[rol].hammaddeId = p.id; });
        yenile();
      };
      document.getElementById('dt-mlz-bant4').onclick = () => {
        if (!bantlar.length) { App.toast('Kenar bandı hammaddesi yok', 'err'); return; }
        const b = bantlar[0];
        ['kapak', 'raf_sabit', 'raf_hareketli', 'cekmece_kapak', 'ust_tac'].forEach(rol => {
          if (roller.indexOf(rol) < 0) return;
          panelAyarlari[rol] = panelAyarlari[rol] || {};
          panelAyarlari[rol].bantlar = { on: b.id, arka: b.id, sag: b.id, sol: b.id };
        });
        App.toast('4 kenar bandı atandı: ' + b.ad, 'ok');
        yenile();
      };
      document.getElementById('dt-mlz-temizle').onclick = () => { panelAyarlari = {}; yenile(); };
    }

    // ══ BÖLME SEÇİM PANELİ ══
    function bolmePaneliCiz() {
      const el = document.getElementById('dt-bolme-panel');
      if (bolmeler.length <= 1) { el.innerHTML = ''; return; }
      const b = bolmeler[seciliBolme] || bolmeler[0];
      const yer = (sonHesap && sonHesap.bolmeler) ? sonHesap.bolmeler[seciliBolme] : null;
      el.innerHTML = `
        <div style="border:1.5px solid var(--blue-light,var(--border));background:var(--blue-bg);border-radius:8px;padding:9px">
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">
            ${bolmeler.map((x, i) => `<button class="btn btn-sm dt-bsec ${i === seciliBolme ? 'btn-blue' : ''}" data-i="${i}" style="min-width:30px">${i + 1}</button>`).join('')}
          </div>
          <div style="font-size:10.5px;color:var(--text3);margin-bottom:7px">
            Bölme ${seciliBolme + 1}${yer ? ' — genişlik <b>' + yer.genislik + ' mm</b>' : ''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
            ${sayiAlan('dt-b-oran', 'Genişlik oranı', b.oran, 0.1)}
            ${secAlan('dt-b-aks', 'Aksesuar', AKSESUARLAR, b.aksesuar)}
          </div>
        </div>`;
      el.querySelectorAll('.dt-bsec').forEach(btn => btn.onclick = () => { seciliBolme = +btn.dataset.i; yenile(); });
      const o = document.getElementById('dt-b-oran');
      if (o) o.oninput = () => { bolmeler[seciliBolme].oran = Math.max(0.1, parseFloat(o.value) || 1); yenile(); };
      const a2 = document.getElementById('dt-b-aks');
      if (a2) a2.onchange = () => { bolmeler[seciliBolme].aksesuar = a2.value; yenile(); };
    }

    function gorunum3DCiz() {
      const kap = document.getElementById('dt-3d-kap');
      if (!kap || !sonHesap || typeof Dolap3D === 'undefined') return;
      Dolap3D.ciz(kap, sonHesap, null);
    }

    function gorunumSec(g) {
      aktifGorunum = g;
      const izoAlan = document.getElementById('dt-3b');
      const uc3dAlan = document.getElementById('dt-3d-kap');
      const uc3dNot = document.getElementById('dt-3d-not');
      const bIzo = document.getElementById('dt-g-izo');
      const b3d = document.getElementById('dt-g-3d');
      if (!izoAlan || !uc3dAlan) return;
      if (g === '3d') {
        izoAlan.style.display = 'none';
        uc3dAlan.style.display = 'block';
        if (uc3dNot) uc3dNot.style.display = 'block';
        if (bIzo) bIzo.classList.remove('btn-blue');
        if (b3d) b3d.classList.add('btn-blue');
        gorunum3DCiz();
      } else {
        izoAlan.style.display = 'block';
        uc3dAlan.style.display = 'none';
        if (uc3dNot) uc3dNot.style.display = 'none';
        if (b3d) b3d.classList.remove('btn-blue');
        if (bIzo) bIzo.classList.add('btn-blue');
        if (typeof Dolap3D !== 'undefined') Dolap3D.temizle();
      }
    }

    function cizimCiz() {
      const el = document.getElementById('dt-cizim');
      if (!Z) { el.innerHTML = '<div class="fhint">Çizim modülü yüklenemedi.</div>'; return; }
      el.innerHTML = `<div>${Z.onden(sonHesap, bolmeler.length > 1 ? seciliBolme : -1)}</div><div>${Z.yandan(sonHesap)}</div>`;
      const e3 = document.getElementById('dt-3b');
      if (e3) e3.innerHTML = Z.ucBoyut(sonHesap);
      // Aktif görünüm 3D ise onu da güncelle
      if (aktifGorunum === '3d') gorunum3DCiz();
      const o = sonHesap.ozet || {};
      document.getElementById('dt-cizim-not').innerHTML =
        `Toplam yükseklik <b>${o.toplamYukseklik} mm</b> · gövde ${o.govdeYukseklik} mm · ${o.bolmeAdedi} bölme` +
        (o.askiBoruAdedi ? ` · ${o.askiBoruAdedi} askı borusu` : '') +
        (bolmeler.length > 1 ? ' — çizimden bölmeye tıklayarak seçin' : '');
      el.querySelectorAll('.dc-bolme').forEach(r => { r.onclick = () => { seciliBolme = +r.dataset.i; yenile(); }; });
    }

    function markaBilgisiYaz() {
      const mk = H.markaAl(val('dt-marka'));
      const o = sonHesap.ozet || {};
      document.getElementById('dt-marka-bilgi').innerHTML =
        `Menteşe: <b>${esc(mk.mentese)}</b> · Ø${mk.kapCap} kap deliği<br>
         Ray: <b>${esc(mk.ray)}</b> · seçilen boy <b>${o.rayBoy || '—'} mm</b><br>
         Kaldırma: ${esc(mk.kaldirma)} · Bağlantı: ${esc(mk.minifix)}<br>
         Delik sistemi: ${mk.delikSistem} mm · kenardan ${mk.kenardanIlk} mm · pim Ø${mk.pimCap}`;
    }

    // Sadece çizim (raf konumu sürüklerken tüm paneli yeniden çizmemek için)
    function sadeceCizimTazele() { sonHesap = H.hesapla(oku()); cizimCiz(); }

    const yenile = () => {
      sonHesap = H.hesapla(oku());
      cizimCiz();
      bolmePaneliCiz();
      rafPaneliCiz();
      kapakPaneliCiz();
      malzemePaneliCiz();
      markaBilgisiYaz();
      onizlemeCiz(document.getElementById('dt-onizleme'), sonHesap);
    };

    body.querySelectorAll('.dt-in').forEach(el => { el.oninput = yenile; el.onchange = yenile; });
    document.getElementById('dt-bolme-sayi').oninput = () => { bolmeSayisiUygula(); yenile(); };
    document.getElementById('dt-bolme-esit').onclick = () => { bolmeler.forEach(b => b.oran = 1); yenile(); };
    body.querySelectorAll('.dt-sekme').forEach(b => b.onclick = () => {
      aktifSekme = b.dataset.s; onizlemeCiz(document.getElementById('dt-onizleme'), sonHesap);
    });
    body.querySelectorAll('.dt-gorunum-sec').forEach(b => b.onclick = () => gorunumSec(b.dataset.g));
    document.getElementById('dt-csv').onclick = () => csvIndir();
    document.getElementById('dt-cnc').onclick = () => {
      if (!sonHesap) { App.toast('Önce dolabı hesaplayın', 'err'); return; }
      const ad = (document.getElementById('dt-ad') && document.getElementById('dt-ad').value) || (tasarim && tasarim.kod) || 'dolap';
      CncExport.ac(sonHesap, ad);
    };
    document.getElementById('dt-yazdir').onclick = () => yazdir();
    document.getElementById('dt-render').onclick = () => renderAc();
    document.getElementById('dt-hm-tanimla').onclick = () => eksikHammaddeAc(() => { yenile(); });

    bolmeSayisiUygula();
    yenile();

    // ── TASARIMI KAYDET (ürün ağacına işlemeden) ──
    document.getElementById('dt-tasarim-kaydet').onclick = async () => {
      const ad = document.getElementById('dt-ad').value.trim();
      if (!ad) { App.toast('Dolap adı zorunlu', 'err'); return; }
      await tasarimKaydet(ad, oku());
      App.toast('Tasarım kaydedildi — istediğiniz zaman açıp düzenleyebilirsiniz', 'ok');
      if (onSaved) onSaved();
    };

    // ── ÜRÜN AĞACINA İŞLE / YENİ REVİZYON ──
    document.getElementById('dt-kaydet').onclick = async () => {
      const ad = document.getElementById('dt-ad').value.trim();
      if (!ad) { App.toast('Dolap adı zorunlu', 'err'); return; }
      if (!sonHesap || !sonHesap.paneller.length) { App.toast('Geçerli bir ölçü girin', 'err'); return; }
      const eksik = sonHesap.paneller.filter(p => !p.hammaddeId);
      if (eksik.length) {
        const roller = [...new Set(eksik.map(p => ROL_ADI[p.rol] || p.rol))].join(', ');
        App.confirmDialog(
          `Şu paneller için plaka hammaddesi seçilmedi: <b>${esc(roller)}</b>.<br><br>` +
          `Yine de devam ederseniz bu paneller yarı mamül olarak oluşturulur ama reçetelerinde plaka kalemi olmaz (maliyet hesaplanamaz). Devam edilsin mi?`,
          () => urunAgacinaIsle(ad, sonHesap, onSaved));
        return;
      }
      await urunAgacinaIsle(ad, sonHesap, onSaved);
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TASARIM KAYDI VE REVİZYON
  // ══════════════════════════════════════════════════════════════════════════
  async function tasarimKaydet(ad, yapilandirma, revizyonKaydi, kodOner) {
    const liste = await Store.dolapTasarimlari.all();
    let kayit = tasarim && tasarim.id ? liste.find(x => x.id === tasarim.id) : null;
    if (!kayit) {
      kayit = {
        id: App.uid('DLP'),
        // Ürün kodları bu tabandan türer (…-R1, …-R2). Ürün ağacına işlerken
        // aynı taban gönderilir ki tasarım kodu ile ürün kodu ayrışmasın.
        kod: kodOner || ('DLP-' + Date.now().toString(36).toUpperCase().slice(-5)),
        ad, revizyon: 1, yapilandirma, revizyonlar: [],
        olusturmaTarihi: new Date().toISOString().slice(0, 10)
      };
      liste.push(kayit);
    }
    kayit.ad = ad;
    kayit.yapilandirma = yapilandirma;
    kayit.guncellemeTarihi = new Date().toISOString().slice(0, 10);
    if (revizyonKaydi) {
      kayit.revizyonlar = kayit.revizyonlar || [];
      kayit.revizyonlar.push(revizyonKaydi);
      kayit.revizyon = revizyonKaydi.no;
    }
    await App.persist(() => Store.dolapTasarimlari.save(liste));
    tasarim = kayit;
    return kayit;
  }

  // Kayıtlı tasarım listesi — açıp düzenlemek için
  async function listeAc(onSaved) {
    const liste = await Store.dolapTasarimlari.all();
    const body = document.createElement('div');
    if (!liste.length) {
      body.innerHTML = `<div class="empty-state" style="padding:22px 10px"><div class="edesc">
        Henüz kayıtlı dolap tasarımı yok. "🗄 Dolap Tasarım" ile bir dolap kurup <b>Tasarımı Kaydet</b> deyin.</div></div>`;
      App.openModal({ title: '📐 Kayıtlı Dolap Tasarımları', body, footer: `<button class="btn" id="dl-kapat">Kapat</button>` });
      document.getElementById('dl-kapat').onclick = App.closeModal;
      return;
    }
    body.innerHTML = `<table class="dtable" style="font-size:11.5px">
      <tr><th>Tasarım</th><th class="r">Ölçü (mm)</th><th class="r">Rev.</th><th>Üretilen revizyonlar</th><th>Güncelleme</th><th></th></tr>
      ${liste.map(d => {
        const y = d.yapilandirma || {};
        return `<tr>
          <td><b>${esc(d.ad)}</b><div class="muted mono" style="font-size:10px">${esc(d.kod || '')}</div></td>
          <td class="r mono">${y.genislik || '—'}×${y.yukseklik || '—'}×${y.derinlik || '—'}</td>
          <td class="r"><span class="pill pill-blue" style="font-size:9px">R${d.revizyon || 1}</span></td>
          <td style="font-size:10.5px">${(d.revizyonlar || []).length
            ? (d.revizyonlar || []).map(r => `R${r.no}: <span class="mono">${esc(r.urunKod)}</span>`).join('<br>')
            : '<span class="muted">henüz ürün ağacına işlenmedi</span>'}</td>
          <td style="font-size:10.5px">${esc(d.guncellemeTarihi || d.olusturmaTarihi || '')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm dl-ac" data-id="${d.id}">Düzenle</button>
            <button class="btn btn-sm btn-ghost dl-sil" data-id="${d.id}" style="color:var(--red-text)">Sil</button>
          </td></tr>`;
      }).join('')}</table>
      <div class="fhint" style="margin-top:8px">Bir tasarımı düzenleyip yeniden işlediğinizde eski ürün/reçete <b>silinmez</b>; yeni revizyon ayrı kaydedilir. İstemediğiniz revizyonun ürün kartını kendiniz silebilirsiniz.</div>`;
    App.openModal({ title: '📐 Kayıtlı Dolap Tasarımları', body, wide: true, footer: `<button class="btn" id="dl-kapat">Kapat</button>` });
    document.getElementById('dl-kapat').onclick = App.closeModal;
    body.querySelectorAll('.dl-ac').forEach(b => b.onclick = () => {
      const d = liste.find(x => x.id === b.dataset.id);
      App.closeModal();
      setTimeout(() => ac(onSaved, d), 60);
    });
    body.querySelectorAll('.dl-sil').forEach(b => b.onclick = () => {
      const d = liste.find(x => x.id === b.dataset.id);
      App.confirmDialog(`"${esc(d.ad)}" tasarımı silinsin mi?<br><br>Bu işlem yalnızca TASARIM kaydını siler; ürün ağacına işlenmiş ürün ve reçeteler yerinde kalır.`, async () => {
        await App.persist(() => Store.dolapTasarimlari.save(liste.filter(x => x.id !== d.id)));
        App.toast('Tasarım silindi', 'ok');
        App.closeModal();
        setTimeout(() => listeAc(onSaved), 60);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÜRETİM VERİSİ ÖNİZLEME
  // ══════════════════════════════════════════════════════════════════════════
  function onizlemeCiz(el, h) {
    if (!el || !h) return;
    const o = h.ozet || {};
    let icerik = '';
    if (aktifSekme === 'parca') {
      icerik = `<div style="overflow:auto;max-height:300px;border:1px solid var(--border);border-radius:8px">
        <table class="dtable" style="font-size:10.5px;margin:0">
          <tr><th>Parça</th><th class="r">Adet</th><th class="r">Net</th><th class="r">Kaba</th><th class="r">Kal.</th><th>Bant</th></tr>
          ${h.paneller.map(p => `<tr>
            <td>${esc(p.ad)}${p.hammaddeId ? '' : ' <span title="plaka seçilmedi" style="color:var(--amber-text)">⚠</span>'}</td>
            <td class="r">${p.adet}</td>
            <td class="r">${p.netEn}×${p.netBoy}</td>
            <td class="r muted">${p.kabaEn}×${p.kabaBoy}</td>
            <td class="r">${p.kalinlik}</td>
            <td style="font-size:9.5px">${bantOzet(p)}</td></tr>`).join('')}
        </table></div>
        ${(h.camlar && h.camlar.length) ? `<div style="margin-top:8px">
          <div class="card-title" style="font-size:10.5px;margin-bottom:4px">CAM</div>
          <table class="dtable" style="font-size:10.5px;margin:0">
            <tr><th>Cam</th><th class="r">Adet</th><th class="r">Ölçü</th><th class="r">Kal.</th><th class="r">m²</th></tr>
            ${h.camlar.map(cm => `<tr><td>${esc(cm.ad)}</td><td class="r">${cm.adet}</td>
              <td class="r">${cm.en}×${cm.boy}</td><td class="r">${cm.kalinlik}</td><td class="r"><b>${cm.m2}</b></td></tr>`).join('')}
          </table>
          <div class="fhint">${esc(h.camlar[0].konum)}</div></div>` : ''}`;
    } else if (aktifSekme === 'delik') {
      icerik = (h.delikler && h.delikler.length)
        ? `<div style="overflow:auto;max-height:300px;border:1px solid var(--border);border-radius:8px">
            <table class="dtable" style="font-size:10.5px;margin:0">
              <tr><th>Parça</th><th class="r">X</th><th class="r">Y</th><th class="r">Ø</th><th>Tip</th></tr>
              ${h.delikler.slice(0, 300).map(d => `<tr><td>${esc(d.parca)}</td><td class="r">${d.x}</td><td class="r">${d.y}</td>
                <td class="r">${d.cap}</td><td style="font-size:9.5px">${esc(d.tip)}</td></tr>`).join('')}
            </table></div>`
        : `<div class="fhint">Delik planı kapalı.</div>`;
    } else {
      icerik = `<div style="overflow:auto;max-height:300px;border:1px solid var(--border);border-radius:8px">
        <table class="dtable" style="font-size:10.5px;margin:0">
          <tr><th>Hırdavat</th><th class="r">Adet</th><th>Birim</th><th>Model / Not</th></tr>
          ${h.hirdavat.map(x => `<tr><td>${esc(x.ad)}</td><td class="r"><b>${x.adet}</b></td><td>${esc(x.birim)}</td>
            <td class="muted" style="font-size:9.5px">${esc(x.model || '')}</td></tr>`).join('')}
        </table></div>`;
    }
    el.innerHTML = `
      ${h.uyarilar.length ? `<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:8px;
        padding:8px 10px;font-size:11px;color:var(--amber-text);margin-bottom:8px">
        ${h.uyarilar.map(u => '⚠ ' + esc(u)).join('<br>')}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${[['Parça', o.parcaAdedi], ['Net m²', o.netAlanM2], ['Fire', '%' + o.fireYuzde],
           ['Bant', o.bantMetre + ' m'], ['Delik', o.delikAdedi || 0]]
          .concat(o.camM2 ? [['Cam m²', o.camM2]] : []).concat(o.ledMetre ? [['LED m', o.ledMetre]] : [])
          .map(([e, d]) => `<div style="flex:1;min-width:54px;background:var(--surface2);border-radius:8px;padding:6px;text-align:center">
            <div style="font-size:9px;color:var(--text3)">${e}</div><div style="font-size:13px;font-weight:800">${d}</div></div>`).join('')}
      </div>${icerik}`;
  }

  // Panelin bantlı kenarlarını kısa metne çevirir
  function bantOzet(p) {
    if (p.bantIds) {
      const v = KENARLAR.filter(([k]) => p.bantIds[k]).map(([, ad]) => ad);
      return v.length ? v.join('+') : '—';
    }
    return ({ dort: '4 kenar', on: 'ön', on_arka: 'ön+arka', uc: '3 kenar', '': '—' })[p.bantlar] || '—';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÜRÜN AĞACINA İŞLE — her panel = yarı mamül + kendi plaka/bant reçetesi
  // ══════════════════════════════════════════════════════════════════════════
  async function urunAgacinaIsle(dolapAd, h, onSaved) {
    App.toast('Ürün ağacına işleniyor…', 'ok');

    const [yarimamuller, urunler, receteler, hammaddeler] = await Promise.all([
      Store.yarimamuller.all(), Store.urunler.all(), Store.receteler.all(), Store.hammaddeler.all()
    ]);

    // Revizyon numarası: bu tasarımdan daha önce üretim yapıldıysa artar
    const revNo = (tasarim && tasarim.revizyonlar && tasarim.revizyonlar.length)
      ? Math.max.apply(null, tasarim.revizyonlar.map(r => r.no)) + 1 : 1;
    const tabanKod = (tasarim && tasarim.kod) ? tasarim.kod : ('DLP-' + Date.now().toString(36).toUpperCase().slice(-5));
    const kodTaban = tabanKod + '-R' + revNo;
    const revAd = dolapAd + ' (R' + revNo + ')';

    const urunReceteKalemleri = [];
    let sira = 0;

    // ── 1) HER PANEL → YARI MAMÜL + KENDİ REÇETESİ (plaka + kenar bandı) ──
    for (const p of h.paneller) {
      sira++;
      const ymKod = kodTaban + '-P' + String(sira).padStart(2, '0');
      const ym = {
        id: App.uid('YM'), kod: ymKod, ad: revAd + ' — ' + p.ad,
        netEn: p.netEn, netBoy: p.netBoy, kalinlik: p.kalinlik,
        kabaEn: p.kabaEn, kabaBoy: p.kabaBoy, adet: 1,
        renk: '', hammaddeId: p.hammaddeId || null, rotaId: null,
        amortismanGideri: 0, gygOraniYuzde: 0,
        aciklama: 'Dolap tasarımdan üretildi · ' + p.ad + ' · ' + p.kalinlik + ' mm · bant: ' + bantOzet(p) +
                  (p.bantMetre ? ' (' + p.bantMetre + ' m)' : ''),
        gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10),
        dolapRolu: p.rol, dolapRevizyon: revNo
      };
      yarimamuller.push(ym);

      // Panelin kendi reçetesi: plaka hammadde + kenar bandı ataması.
      // kenarBantlari sistemin standart alanıdır; bant maliyeti/metrajı
      // uygulamanın geri kalanı tarafından buradan okunur.
      if (p.hammaddeId) {
        const kalem = {
          tip: 'hammadde', refId: p.hammaddeId, miktar: 1, birim: 'M2',
          olcu: { kabaEn: p.kabaEn, kabaBoy: p.kabaBoy, netEn: p.netEn, netBoy: p.netBoy }
        };
        if (p.bantIds && (p.bantIds.on || p.bantIds.arka || p.bantIds.sag || p.bantIds.sol)) {
          kalem.kenarBantlari = {
            on: p.bantIds.on || null, arka: p.bantIds.arka || null,
            sag: p.bantIds.sag || null, sol: p.bantIds.sol || null
          };
        }
        receteler.push({
          id: 'RC-' + ymKod, yarimamulId: ym.id,
          ad: ym.ad + ' Reçetesi', kalemler: [kalem]
        });
      }

      urunReceteKalemleri.push({ tip: 'yarimamul', refId: ym.id, miktar: p.adet, birim: 'ADET' });
    }

    // ── 2) HIRDAVAT → hammadde kartı (yoksa açılır) + reçete kalemi ──
    const yeniHammaddeler = [];
    for (const hd of h.hirdavat) {
      const aranan = hd.ad.toLocaleLowerCase('tr');
      let kart = hammaddeler.find(x => (x.ad || '').toLocaleLowerCase('tr').includes(aranan));
      if (!kart) {
        kart = {
          id: App.uid('HM'),
          stokKodu: 'HRD-' + kodTaban + '-' + String(yeniHammaddeler.length + 1).padStart(2, '0'),
          ad: hd.ad + (hd.model ? ' — ' + hd.model : ''),
          tip: 'hirdavat', kategori: 'Hırdavat', birim: hd.birim || 'ADET',
          birimFiyat: 0, dvz: 'TL', fireYuzde: 0, kdvOraniYuzde: 18,
          aciklama: 'Dolap tasarımdan otomatik açıldı' + (hd.marka ? ' · ' + hd.marka : ''),
          olusturmaTarihi: new Date().toISOString().slice(0, 10)
        };
        hammaddeler.push(kart);
        yeniHammaddeler.push(kart);
      }
      urunReceteKalemleri.push({
        tip: 'hammadde', refId: kart.id, miktar: hd.adet, birim: hd.birim,
        not: hd.model ? ((hd.marka ? hd.marka + ' ' : '') + hd.model) : ''
      });
    }

    // ── 2b) CAM KALEMLERİ ──
    // Cam plaka değildir; m² bazlı hammadde kalemi olarak ürün reçetesine girer.
    for (const cm of (h.camlar || [])) {
      const camAd = cm.ad + ' ' + cm.kalinlik + ' mm';
      let kart = hammaddeler.find(x => (x.ad || '').toLocaleLowerCase('tr').includes(cm.ad.toLocaleLowerCase('tr')));
      if (!kart) {
        kart = {
          id: App.uid('HM'), stokKodu: 'CAM-' + kodTaban + '-' + String(yeniHammaddeler.length + 1).padStart(2, '0'),
          ad: camAd, tip: 'cam', kategori: 'Cam', birim: 'M2',
          birimFiyat: 0, dvz: 'TL', fireYuzde: 0, kdvOraniYuzde: 18,
          aciklama: 'Dolap tasarımdan otomatik açıldı · ' + cm.konum, olusturmaTarihi: new Date().toISOString().slice(0, 10)
        };
        hammaddeler.push(kart); yeniHammaddeler.push(kart);
      }
      urunReceteKalemleri.push({
        tip: 'hammadde', refId: kart.id, miktar: cm.m2, birim: 'M2',
        not: cm.adet + ' adet · ' + cm.en + '×' + cm.boy + ' mm · ' + cm.konum
      });
    }

    // ── 3) DOLAP ÜRÜN KARTI + ANA REÇETE ──
    const urun = {
      id: App.uid('URN'), kod: kodTaban, ad: revAd, tip: 'bitmis_urun',
      aciklama: 'Dolap tasarım ekranı · revizyon R' + revNo + ' · ' +
                h.yapilandirma.genislik + '×' + h.yapilandirma.yukseklik + '×' + h.yapilandirma.derinlik + ' mm · ' +
                h.ozet.parcaAdedi + ' parça · ' + h.ozet.bolmeAdedi + ' bölme · hırdavat ' + h.yapilandirma.marka,
      rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0,
      gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10),
      dolapYapilandirma: h.yapilandirma, dolapRevizyon: revNo
    };
    urunler.push(urun);
    receteler.push({
      id: 'RC-' + kodTaban, urunId: urun.id,
      ad: revAd + ' Reçetesi', kalemler: urunReceteKalemleri
    });

    await App.persist(async () => {
      if (yeniHammaddeler.length) await Store.hammaddeler.save(hammaddeler);
      await Store.yarimamuller.save(yarimamuller);
      await Store.urunler.save(urunler);
      await Store.receteler.save(receteler);
    });

    // ── 4) TASARIMI VE REVİZYON İZİNİ KAYDET ──
    await tasarimKaydet(dolapAd, h.yapilandirma, {
      no: revNo, tarih: new Date().toISOString().slice(0, 10),
      urunId: urun.id, receteId: 'RC-' + kodTaban, urunKod: kodTaban, ad: revAd
    }, tabanKod);

    App.closeModal();
    App.toast('✓ ' + revAd + ': 1 ürün + ' + h.paneller.length + ' yarı mamül (plaka/bant reçeteli) + ' +
      h.hirdavat.length + ' hırdavat' + (yeniHammaddeler.length ? ' · ' + yeniHammaddeler.length + ' yeni hammadde kartı' : '') +
      (revNo > 1 ? ' · önceki revizyon korundu' : ''), 'ok');
    if (onSaved) onSaved();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MEKÂN RENDERİ
  //   Dolabı oda sahnesinde, seçilen hammaddenin renk ve dokusuyla gösterir.
  //   Vektör (SVG) görselleştirmedir; ışın izlemeli foto-render değildir.
  // ══════════════════════════════════════════════════════════════════════════
  let renderSecenek = { duvarRengi: '' };

  // Panellere atanmış hammaddelerin MATERYAL GÖRSELİNİ bulur.
  // Görsel iki yerde olabilir:
  //   1) Kartın içine gömülü  → hm.gorseller[].dataUrl
  //   2) Sunucudaki teknik dosya alanı (📎 tuşuyla yüklenen jpg/png/webp)
  //      → api.php?action=dosyaIndir&…&goster=1 ile doğrudan görüntü olarak sunulur
  // Dönen harita: { hammaddeId: görselUrl }
  async function materyalGorselleriBul(hammaddeler, idler) {
    const harita = {}, durum = {};
    for (const id of idler) {
      if (!id) continue;
      const hm = hammaddeler.find(x => x.id === id);
      if (!hm) continue;
      // 1) Kartın görsel alanı — hem gömülü (eski) hem sunucuya taşınmış
      //    (yeni) biçimi tanır. Taşınmış görselin adresi kartın içinden
      //    doğrudan üretilebildiği için 2. adımdaki ek sunucu sorgusu
      //    gerekmez.
      const g = (hm.gorseller || []).find(x => QrDosya.gorselMi(x));
      if (g) {
        const u = QrDosya.gorselUrl(g);
        if (u) { harita[id] = u; durum[id] = g.dataUrl ? 'kart' : 'sunucu'; continue; }
      }
      // 2) Sunucudaki teknik dosya
      if (!Store.sunucuModu) { durum[id] = 'yerel'; continue; }
      try {
        const kayit = await Store.qrKayitGetir('hammadde', hm.id, hm.stokKodu || hm.id, hm.ad || '');
        const dosya = (kayit.dosyalar || []).find(d => /^(jpg|jpeg|png|webp)$/i.test(String(d.uzanti || '')));
        if (dosya) {
          harita[id] = 'api.php?action=dosyaIndir&r=' + encodeURIComponent('hammadde:' + hm.id) +
            '&k=' + encodeURIComponent(kayit.anahtar) + '&f=' + encodeURIComponent(dosya.id) + '&goster=1';
          durum[id] = 'sunucu';
        } else durum[id] = 'yok';
      } catch (e) { durum[id] = 'hata'; }
    }
    return { harita, durum };
  }

  async function renderAc() {
    if (!sonHesap) return;
    if (typeof DolapRender === 'undefined') { App.toast('Render modülü (dolap_render.js) yüklenemedi', 'err'); return; }
    const hammaddeler = await Store.hammaddeler.all();

    const body = document.createElement('div');
    body.innerHTML = `<div class="fhint" id="dr-yukleniyor">Materyal görselleri aranıyor…</div>`;
    App.openModal({ title: '🖼 Mekân Renderi', body, wide: true, footer: `<button class="btn" id="dr-kapat">Kapat</button>` });
    document.getElementById('dr-kapat').onclick = App.closeModal;

    // Tasarımda kullanılan tüm plaka hammaddelerinin görselini topla
    const idler = [...new Set(sonHesap.paneller.map(p => p.hammaddeId).filter(Boolean))];
    const { harita, durum } = await materyalGorselleriBul(hammaddeler, idler);
    renderSecenek.materyalUrl = harita;

    const gorselli = Object.keys(harita).length;
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px" id="dr-sahneler">
        <div><div class="card-title" style="font-size:11px;margin-bottom:4px">KAPAKLI GÖRÜNÜM</div><div id="dr-kapali"></div></div>
        <div><div class="card-title" style="font-size:11px;margin-bottom:4px">İÇ DÜZEN (kapaksız)</div><div id="dr-acik"></div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:10px">
        <div class="fgroup" style="margin:0;min-width:150px"><label class="flbl" style="font-size:10.5px">Duvar rengi</label>
          <select class="fselect" id="dr-duvar" style="font-size:12px">
            <option value="">Varsayılan (kırık beyaz)</option>
            <option value="#e9e4dc">Bej</option><option value="#dfe5e6">Açık gri-mavi</option>
            <option value="#e6e9e2">Adaçayı</option><option value="#3f4650">Koyu antrasit</option>
            <option value="#d9cfc4">Toprak</option>
          </select></div>
        <button class="btn btn-sm" id="dr-svg">⬇ İkisini SVG indir</button>
        <button class="btn btn-sm" id="dr-png">⬇ İkisini PNG indir</button>
        <button class="btn btn-sm" id="dr-yazdir">🖨 Yazdır</button>
      </div>

      <div class="card-title" style="font-size:11px;margin:12px 0 6px">MATERYALLER</div>
      <div style="overflow:auto;max-height:180px;border:1px solid var(--border);border-radius:8px">
        <table class="dtable" style="font-size:10.5px;margin:0">
          <tr><th style="width:56px">Görsel</th><th>Panel</th><th>Hammadde</th><th>Kaynak</th></tr>
          ${sonHesap.paneller.filter((p, i, a) => a.findIndex(x => x.rol === p.rol) === i).map(p => {
            const hm = hammaddeler.find(x => x.id === p.hammaddeId);
            const url = p.hammaddeId ? harita[p.hammaddeId] : null;
            const dm = p.hammaddeId ? durum[p.hammaddeId] : null;
            const kaynakMetni = !p.hammaddeId ? '<span style="color:var(--amber-text)">plaka seçilmedi</span>'
              : url ? (dm === 'kart' ? '✓ kart görseli' : '✓ sunucudaki dosya')
              : dm === 'yerel' ? '<span style="color:var(--amber-text)">yerel mod — sunucu dosyası okunamaz</span>'
              : '<span style="color:var(--amber-text)">görsel yok → renk tahmini</span>';
            return `<tr>
              <td>${url ? `<img src="${esc(url)}" style="width:44px;height:32px;object-fit:cover;border-radius:4px">`
                        : `<div style="width:44px;height:32px;border-radius:4px;background:${DolapRender.dekorCoz(hm).renk}"></div>`}</td>
              <td>${esc(ROL_ADI[p.rol] || p.rol)}</td>
              <td>${hm ? esc(hm.ad) : '—'}</td>
              <td style="font-size:10px">${kaynakMetni}</td></tr>`;
          }).join('')}
        </table></div>
      <div class="fhint" style="margin-top:8px">
        ${gorselli ? `✓ ${gorselli} hammaddenin materyal görseli bulundu ve yüzeylere kaplandı.` :
          'Hiçbir hammaddede materyal görseli bulunamadı — renkler kart adından tahmin edildi.'}
        Materyal fotoğrafı eklemek için <b>Hammaddeler</b> ekranında kartın <b>📎</b> tuşuna basıp jpg/png yükleyin;
        buradaki render onu otomatik kullanır. Alternatif olarak karta <code>renkKodu</code> alanı girebilirsiniz.
        Bu bir vektör görselleştirmedir; ekran renkleri gerçek kartelayla birebir eşleşmez.
      </div>`;

    const ciz = () => {
      document.getElementById('dr-kapali').innerHTML =
        DolapRender.mekan(sonHesap, hammaddeler, Object.assign({}, renderSecenek, { kapak: 'kapali' }));
      document.getElementById('dr-acik').innerHTML =
        DolapRender.mekan(sonHesap, hammaddeler, Object.assign({}, renderSecenek, { kapak: 'acik' }));
    };
    ciz();
    document.getElementById('dr-duvar').onchange = (e) => { renderSecenek.duvarRengi = e.target.value; ciz(); };

    const svgAl = (id) => { const el = document.querySelector('#' + id + ' svg'); return el ? el.outerHTML : ''; };
    const adEl = document.getElementById('dt-ad');
    const dosyaAd = ((adEl && adEl.value) || 'dolap').trim().replace(/[^\wğüşıöçĞÜŞİÖÇ .-]/g, '') || 'dolap';

    document.getElementById('dr-svg').onclick = () => {
      [['dr-kapali', 'kapakli'], ['dr-acik', 'ic-duzen']].forEach(([id, ek]) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([svgAl(id)], { type: 'image/svg+xml' }));
        a.download = dosyaAd + '_render_' + ek + '.svg'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
      App.toast('İki render SVG olarak indirildi', 'ok');
    };
    document.getElementById('dr-png').onclick = async () => {
      for (const [id, ek] of [['dr-kapali', 'kapakli'], ['dr-acik', 'ic-duzen']]) {
        try { await pngIndir(svgAl(id), dosyaAd + '_render_' + ek + '.png'); }
        catch (e) { App.toast('PNG dönüşümü başarısız — SVG indirmeyi deneyin', 'err'); return; }
      }
      App.toast('İki render PNG olarak indirildi', 'ok');
    };
    document.getElementById('dr-yazdir').onclick = () => {
      const w = window.open('', '_blank');
      if (!w) { App.toast('Tarayıcı açılır pencereyi engelledi', 'err'); return; }
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(dosyaAd) +
        ' — Mekân Renderi</title><style>body{margin:0;padding:10px;font-family:system-ui}' +
        'h3{font-size:12px;margin:8px 0 4px}@media print{@page{size:landscape}}</style></head><body>' +
        '<h3>Kapaklı görünüm</h3>' + svgAl('dr-kapali') +
        '<h3>İç düzen (kapaksız)</h3>' + svgAl('dr-acik') +
        '<script>window.onload=function(){window.print()}<\/script></body></html>');
      w.document.close();
    };
  }

  // SVG'yi 2× çözünürlükte PNG'ye çevirip indirir
  function pngIndir(svg, dosyaAdi) {
    return new Promise((cozul, hata) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = 1360; cv.height = 940;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(b => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b); a.download = dosyaAdi; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          URL.revokeObjectURL(url); cozul();
        });
      };
      img.onerror = () => { URL.revokeObjectURL(url); hata(new Error('SVG yüklenemedi')); };
      img.src = url;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EKSİK HAMMADDE TANIMLAMA
  //   Tasarımın ihtiyaç duyduğu ama sistemde kartı olmayan tüm malzemeleri
  //   (cam, LED, sürgülü ray/profil, hırdavat, kenar bandı) tek ekranda
  //   listeler ve seçilenler için hammadde kartı açar.
  // ══════════════════════════════════════════════════════════════════════════
  function eksikleriBul(h, hammaddeler) {
    const varMi = (ad) => hammaddeler.some(x => (x.ad || '').toLocaleLowerCase('tr').includes(ad.toLocaleLowerCase('tr')));
    const liste = [];
    const ekle = (ad, tip, birim, kategori, not) => {
      if (varMi(ad)) return;
      if (liste.some(x => x.ad === ad)) return;
      liste.push({ ad, tip, birim, kategori, not: not || '', sec: true });
    };
    // Cam
    (h.camlar || []).forEach(cm => ekle(cm.ad + ' ' + cm.kalinlik + ' mm', 'cam', 'M2', 'Cam',
      cm.adet + ' adet · ' + cm.en + '×' + cm.boy + ' mm'));
    // Hırdavat (LED, ray, profil, menteşe, kulp, askı borusu…)
    (h.hirdavat || []).forEach(hd => ekle(hd.ad, 'hirdavat', hd.birim || 'ADET', 'Hırdavat', hd.model || ''));
    // Panellere atanmamış plaka uyarısı ayrı ele alınır (kart açılamaz, seçilmeli)
    return liste;
  }

  async function eksikHammaddeAc(sonra) {
    if (!sonHesap) return;
    const hammaddeler = await Store.hammaddeler.all();
    const eksik = eksikleriBul(sonHesap, hammaddeler);
    const plakasiz = [...new Set(sonHesap.paneller.filter(p => !p.hammaddeId).map(p => ROL_ADI[p.rol] || p.rol))];
    const bantsiz = !hammaddeler.some(x => x.tip === 'kenar_bandi');
    const body = document.createElement('div');

    if (!eksik.length && !plakasiz.length && !bantsiz) {
      body.innerHTML = `<div class="empty-state" style="padding:22px 10px"><div class="edesc">
        ✓ Tasarımın ihtiyaç duyduğu tüm malzemelerin hammadde kartı zaten tanımlı.</div></div>`;
      App.openModal({ title: '🧱 Eksik Hammaddeler', body, footer: `<button class="btn" id="eh-kapat">Kapat</button>` });
      document.getElementById('eh-kapat').onclick = App.closeModal;
      return;
    }

    body.innerHTML = `
      ${plakasiz.length ? `<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:8px;
        padding:8px 10px;font-size:11.5px;color:var(--amber-text);margin-bottom:10px">
        ⚠ Şu panellere <b>plaka</b> seçilmedi: ${esc(plakasiz.join(', '))}.<br>
        Plaka bir dekor tercihidir — sizin adınıza seçemem. Hammaddeler ekranından plaka kartı açıp
        "Malzeme ve Kenar Bandı" tablosundan atayın.</div>` : ''}
      ${bantsiz ? `<div class="fhint" style="color:var(--amber-text);margin-bottom:10px">
        ⚠ Sistemde hiç <b>kenar bandı</b> kartı yok — bant ataması yapabilmek için önce bir kenar bandı kartı açın.</div>` : ''}
      ${eksik.length ? `
        <div class="fhint" style="margin-bottom:8px">Aşağıdaki malzemelerin kartı sistemde yok.
          İşaretlediklerinizi tek seferde açayım; fiyat ve stok bilgilerini sonradan Hammaddeler ekranından girersiniz.</div>
        <div style="overflow:auto;max-height:320px;border:1px solid var(--border);border-radius:8px">
        <table class="dtable" style="font-size:11.5px;margin:0">
          <tr><th style="width:34px"><input type="checkbox" id="eh-tumu" checked></th>
              <th>Malzeme adı</th><th>Tip</th><th>Birim</th><th>Not</th></tr>
          ${eksik.map((x, i) => `<tr>
            <td><input type="checkbox" class="eh-sec" data-i="${i}" checked></td>
            <td><input class="finput eh-ad" data-i="${i}" value="${esc(x.ad)}" style="font-size:11px;padding:3px 5px;width:100%"></td>
            <td><select class="fselect eh-tip" data-i="${i}" style="font-size:11px;padding:3px 4px">
              ${[['plaka', 'Plaka'], ['kenar_bandi', 'Kenar bandı'], ['cam', 'Cam'], ['hirdavat', 'Hırdavat'], ['diger', 'Diğer']]
                .map(([v, a]) => `<option value="${v}" ${v === x.tip ? 'selected' : ''}>${a}</option>`).join('')}</select></td>
            <td><select class="fselect eh-birim" data-i="${i}" style="font-size:11px;padding:3px 4px">
              ${['ADET', 'METRE', 'M2', 'TAKIM', 'GRAM', 'KG'].map(b => `<option value="${b}" ${b === x.birim ? 'selected' : ''}>${b}</option>`).join('')}</select></td>
            <td class="muted" style="font-size:10px">${esc(x.not)}</td></tr>`).join('')}
        </table></div>` : '<div class="fhint">Açılacak yeni malzeme yok.</div>'}`;

    App.openModal({
      title: '🧱 Eksik Hammaddeleri Tanımla', body, wide: true,
      footer: `<button class="btn" id="eh-vaz">Vazgeç</button>
               ${eksik.length ? `<button class="btn btn-blue" id="eh-olustur">Seçilenleri Tanımla (${eksik.length})</button>` : ''}`
    });
    document.getElementById('eh-vaz').onclick = App.closeModal;
    const tumu = document.getElementById('eh-tumu');
    if (tumu) tumu.onchange = () => body.querySelectorAll('.eh-sec').forEach(c => c.checked = tumu.checked);

    const olustur = document.getElementById('eh-olustur');
    if (olustur) olustur.onclick = async () => {
      const secililer = [];
      body.querySelectorAll('.eh-sec').forEach(cb => {
        if (!cb.checked) return;
        const i = cb.dataset.i;
        secililer.push({
          ad: body.querySelector('.eh-ad[data-i="' + i + '"]').value.trim(),
          tip: body.querySelector('.eh-tip[data-i="' + i + '"]').value,
          birim: body.querySelector('.eh-birim[data-i="' + i + '"]').value,
          kategori: eksik[i].kategori
        });
      });
      if (!secililer.length) { App.toast('Hiçbir malzeme seçilmedi', 'err'); return; }
      const bugun = new Date().toISOString().slice(0, 10);
      const kod = 'DLP-' + Date.now().toString(36).toUpperCase().slice(-4);
      secililer.forEach((x, i) => {
        if (!x.ad) return;
        hammaddeler.push({
          id: App.uid('HM'),
          stokKodu: (x.tip === 'cam' ? 'CAM-' : x.tip === 'plaka' ? 'PLK-' : x.tip === 'kenar_bandi' ? 'BNT-' : 'HRD-') +
                    kod + '-' + String(i + 1).padStart(2, '0'),
          ad: x.ad, tip: x.tip, kategori: x.kategori || 'Diğer', birim: x.birim,
          birimFiyat: 0, dvz: 'TL', fireYuzde: 0, kdvOraniYuzde: 18,
          aciklama: 'Dolap tasarım ekranından otomatik tanımlandı — fiyat ve stok bilgisi girilmeli',
          olusturmaTarihi: bugun
        });
      });
      await App.persist(() => Store.hammaddeler.save(hammaddeler));
      App.closeModal();
      App.toast('✓ ' + secililer.length + ' hammadde kartı tanımlandı — fiyatlarını Hammaddeler ekranından girin', 'ok');
      if (sonra) sonra();
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CSV VE YAZDIR
  // ══════════════════════════════════════════════════════════════════════════
  function csvIndir() {
    if (!sonHesap) return;
    const adEl = document.getElementById('dt-ad');
    const ad = ((adEl && adEl.value) || 'dolap').trim() || 'dolap';
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    let csv = 'BOLUM;PARCA;ADET;NET_EN;NET_BOY;KABA_EN;KABA_BOY;KALINLIK;BANTLI_KENARLAR\n';
    sonHesap.paneller.forEach(p => {
      csv += ['KESIM', p.ad, p.adet, p.netEn, p.netBoy, p.kabaEn, p.kabaBoy, p.kalinlik, bantOzet(p)].map(q).join(';') + '\n';
    });
    csv += '\nBOLUM;HIRDAVAT;ADET;BIRIM;MODEL\n';
    sonHesap.hirdavat.forEach(x => { csv += ['HIRDAVAT', x.ad, x.adet, x.birim, x.model || ''].map(q).join(';') + '\n'; });
    if (sonHesap.delikler && sonHesap.delikler.length) {
      csv += '\nBOLUM;PARCA;X_MM;Y_MM;CAP;DERINLIK;TIP\n';
      sonHesap.delikler.forEach(d => { csv += ['DELIK', d.parca, d.x, d.y, d.cap, d.derinlik, d.tip].map(q).join(';') + '\n'; });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = ad.replace(/[^\wğüşıöçĞÜŞİÖÇ .-]/g, '') + '_uretim.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    App.toast('Üretim CSV dosyası indirildi', 'ok');
  }

  function yazdir() {
    if (!sonHesap || !Z) return;
    const adEl = document.getElementById('dt-ad');
    const ad = ((adEl && adEl.value) || 'Dolap').trim() || 'Dolap';
    const c = sonHesap.yapilandirma, o = sonHesap.ozet;
    const w = window.open('', '_blank');
    if (!w) { App.toast('Tarayıcı açılır pencereyi engelledi', 'err'); return; }
    const tablo = (bas, kol, sat) => `<h2>${bas}</h2><table><tr>${kol.map(k => '<th>' + k + '</th>').join('')}</tr>${sat}</table>`;
    const pS = sonHesap.paneller.map(p => `<tr><td>${esc(p.ad)}</td><td class=r>${p.adet}</td><td class=r>${p.netEn}×${p.netBoy}</td>
      <td class=r>${p.kabaEn}×${p.kabaBoy}</td><td class=r>${p.kalinlik}</td><td>${bantOzet(p)}</td></tr>`).join('');
    const hS = sonHesap.hirdavat.map(x => `<tr><td>${esc(x.ad)}</td><td class=r>${x.adet}</td><td>${esc(x.birim)}</td><td>${esc(x.model || '')}</td></tr>`).join('');
    const dS = (sonHesap.delikler || []).map(d => `<tr><td>${esc(d.parca)}</td><td class=r>${d.x}</td><td class=r>${d.y}</td>
      <td class=r>${d.cap}</td><td class=r>${d.derinlik}</td><td>${esc(d.tip)}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(ad)} — Üretim Dosyası</title><style>
      body{font-family:system-ui,sans-serif;padding:18px;color:#222}
      h1{font-size:18px;margin:0 0 3px} h2{font-size:12.5px;margin:14px 0 5px;border-bottom:1px solid #bbb;padding-bottom:3px}
      .sub{font-size:11px;color:#666;margin-bottom:12px;line-height:1.6}
      .ciz{display:flex;gap:10px;margin-bottom:12px} .ciz>div{flex:1;border:1px solid #ddd;border-radius:6px;padding:5px}
      table{border-collapse:collapse;width:100%;font-size:10px;margin-bottom:6px}
      th,td{border:1px solid #ccc;padding:3px 5px;text-align:left} th{background:#f2f2f2} td.r,th.r{text-align:right}
      .uy{font-size:10px;color:#8a5a00;margin:8px 0}
      svg text{fill:#333!important} svg line,svg path[stroke]{stroke:#444!important} svg rect[stroke]{stroke:#444!important}
      @media print{body{padding:8mm} h2{page-break-after:avoid}}
    </style></head><body>
      <h1>${esc(ad)}</h1>
      <div class="sub">${c.genislik}×${c.yukseklik}×${c.derinlik} mm · gövde ${o.govdeYukseklik} mm · toplam ${o.toplamYukseklik} mm<br>
      ${o.bolmeAdedi} bölme · hırdavat ${c.marka === 'Hafele' ? 'Häfele' : esc(c.marka)}${o.askiBoruAdedi ? ' · ' + o.askiBoruAdedi + ' askı borusu' : ''}<br>
      Net ${o.netAlanM2} m² · kaba ${o.kabaAlanM2} m² · fire %${o.fireYuzde} · bant ${o.bantMetre} m</div>
      <div class="ciz"><div>${Z.onden(sonHesap, -1)}</div><div>${Z.yandan(sonHesap)}</div><div>${Z.ucBoyut(sonHesap)}</div></div>
      ${sonHesap.uyarilar.length ? '<div class="uy">' + sonHesap.uyarilar.map(u => '⚠ ' + esc(u)).join('<br>') + '</div>' : ''}
      ${tablo('KESİM VE BANTLAMA LİSTESİ', ['Parça', 'Adet', 'Net (mm)', 'Kaba (mm)', 'Kal.', 'Bantlı kenarlar'], pS)}
      ${tablo('HIRDAVAT LİSTESİ', ['Hırdavat', 'Adet', 'Birim', 'Model / Not'], hS)}
      ${dS ? tablo('DELİK PLANI (CNC)', ['Parça', 'X', 'Y', 'Ø', 'Derinlik', 'Tip'], dS) : ''}
      <script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  }

  return { ac, listeAc, urunAgacinaIsle };
})();
