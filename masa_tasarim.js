// ════════════════════════════════════════════════════════════════════════════
// MASA / WORKSTATION TASARIM EKRANI
//
// Dolap Tasarım ekranıyla AYNI düzende çalışır: solda yapılandırma, ortada
// canlı teknik resim + malzeme/kenar bandı tablosu, sağda üretim verisi.
// Hesap masa_hesap.js'te, çizim masa_cizim.js'tedir.
//
// ── ÜRETİLEN AĞAÇ ──────────────────────────────────────────────────────────
//   Ürün kartı (masa / workstation)
//     └─ Reçete
//         ├─ paket: Tabla paketi 1..n   (sevkiyat kademesi)
//         ├─ yarı mamül: Tabla ×N
//         │    └─ Reçete: plaka hammadde (kaba/net ölçü + 4 kenar bandı)
//         ├─ yarı mamül: Perde / Modesty (varsa, aynı plaka+bant yapısı)
//         ├─ yarı mamül: Ayak (Iron/Titan/Nord/Trim/Flat) ×n
//         │    └─ Reçete: reçete yüklendiğinde doldurulur (şimdilik boş)
//         ├─ yarı mamül: Travers ×n
//         └─ hammadde: minifix, köşe koruyucu, aksesuar
//
// Kenar bandı plaka kaleminin `kenarBantlari` alanında tutulur — sistemin
// geri kalanı bandı oradan okur; ayrı bant kalemi eklenmez.
//
// ── DURUM ──────────────────────────────────────────────────────────────────
// Bu ekran bir BAŞLANGIÇ DÜZENİDİR. Ayak modellerinin (Iron, Titan, Nord,
// Trim, Flat) ürün kodları ve alt reçeteleri henüz girilmemiştir; kullanıcı
// reçeteleri yükledikçe masa_hesap.js içindeki AYAK_MODELLERI tablosu
// doldurulacak ve ayak yerleşim kuralı netleştirilecektir.
// ════════════════════════════════════════════════════════════════════════════
const MasaTasarim = (() => {

  const esc = (s) => (window.App ? App.escapeHtml(s) : String(s == null ? '' : s));
  const M = MasaHesap;
  const Z = (typeof MasaCizim !== 'undefined') ? MasaCizim : null;

  let tasarim = null, sonHesap = null, panelAyarlari = {}, seciliTabla = 0;
  let aktifSekme = 'panel';
  let plakalar = [], bantlar = [];

  const ROL_ADI = { tabla: 'Tabla', perde: 'Perde', modesty: 'Modesty panel' };
  const KENARLAR = [['on', 'Ön'], ['arka', 'Arka'], ['sag', 'Sağ'], ['sol', 'Sol']];

  const sayiAlan = (id, etiket, deger, adim) =>
    `<div class="fgroup" style="margin:0"><label class="flbl" style="font-size:10.5px">${etiket}</label>
      <input class="finput mt-in" id="${id}" type="number" step="${adim || 1}" value="${deger}" style="font-size:12px"></div>`;
  const secAlan = (id, etiket, secenekler, secili) =>
    `<div class="fgroup" style="margin:0"><label class="flbl" style="font-size:10.5px">${etiket}</label>
      <select class="fselect mt-in" id="${id}" style="font-size:12px">
        ${secenekler.map(([v, a]) => `<option value="${v}" ${String(v) === String(secili) ? 'selected' : ''}>${esc(a)}</option>`).join('')}
      </select></div>`;
  const kutuAlan = (id, etiket, isaretli) =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
      <input type="checkbox" id="${id}" class="mt-in" ${isaretli ? 'checked' : ''}> ${etiket}</label>`;

  // ══════════════════════════════════════════════════════════════════════════
  async function ac(onSaved, mevcut) {
    const V = M.VARSAYILAN;
    const [hammaddeler] = await Promise.all([Store.hammaddeler.all()]);
    plakalar = hammaddeler.filter(h => h.tip === 'plaka');
    bantlar = hammaddeler.filter(h => h.tip === 'kenar_bandi');

    tasarim = mevcut ? JSON.parse(JSON.stringify(mevcut)) : null;
    const y = (tasarim && tasarim.yapilandirma) ? tasarim.yapilandirma : {};
    panelAyarlari = y.panelAyarlari ? JSON.parse(JSON.stringify(y.panelAyarlari)) : {};
    sonHesap = null; seciliTabla = 0; aktifSekme = 'panel';
    const g = (a, d) => (y[a] !== undefined && y[a] !== null && y[a] !== '') ? y[a] : d;

    const body = document.createElement('div');
    body.innerHTML = `
      ${tasarim ? `<div style="background:var(--blue-bg);border:1px solid var(--blue-light,var(--border));border-radius:8px;
        padding:8px 11px;font-size:11.5px;margin-bottom:10px">
        🪑 <b>${esc(tasarim.ad)}</b> düzenleniyor — revizyon <b>R${tasarim.revizyon || 1}</b>.
        İşlediğinizde <b>R${(tasarim.revizyon || 1) + 1}</b> olarak ayrı kaydedilir; eski revizyon silinmez.</div>` : ''}

      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">
        <!-- SOL: YAPILANDIRMA -->
        <div style="flex:1 1 290px;min-width:280px;max-width:380px">
          <div class="fgroup"><label class="flbl">Masa Adı / Kodu <span style="color:var(--red-text)">*</span></label>
            <input class="finput" id="mt-ad" placeholder="örn. Radical 6'lı Workstation 160'lık" value="${tasarim ? esc(tasarim.ad) : ''}"></div>

          <div class="card-title" style="font-size:11px;margin:10px 0 6px">DÜZEN</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${secAlan('mt-tip', 'Ürün tipi', [['tekli', 'Tekli masa'], ['workstation', 'Workstation'], ['toplanti', 'Toplantı masası']], g('tip', V.tip))}
            ${sayiAlan('mt-kisi', 'Kişi sayısı', g('kisiSayisi', V.kisiSayisi))}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            ${secAlan('mt-dizilim', 'Dizilim', [['tek_sira', 'Tek sıra'], ['karsilikli', 'Karşılıklı']], g('dizilim', V.dizilim))}
            ${sayiAlan('mt-sira-bosluk', 'Sıra arası boşluk', g('siraArasiBosluk', V.siraArasiBosluk))}
          </div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">TABLA</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            ${sayiAlan('mt-tbboy', 'Boy (kişi başı)', g('tablaBoy', V.tablaBoy))}
            ${sayiAlan('mt-tben', 'En (derinlik)', g('tablaEn', V.tablaEn))}
            ${sayiAlan('mt-tbkal', 'Kalınlık', g('tablaKalinlik', V.tablaKalinlik))}
          </div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">AYAK</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${secAlan('mt-ayak-model', 'Ayak modeli', M.MODELLER.map(m => [m, m]), g('ayakModeli', V.ayakModeli))}
            ${sayiAlan('mt-ayak-y', 'Ayak yüksekliği', g('ayakYukseklik', V.ayakYukseklik))}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            ${sayiAlan('mt-ayak-adet', 'Ayak adedi (0 = otomatik)', g('ayakAdet', 0))}
            ${sayiAlan('mt-travers-adet', 'Travers adedi (0 = otomatik)', g('traversAdet', 0))}
          </div>
          <div style="margin-top:8px">${kutuAlan('mt-travers', 'Travers kullanılıyor', g('traversVar', true))}</div>
          <div id="mt-ayak-bilgi" class="fhint" style="margin-top:6px;line-height:1.65"></div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">PERDE / MODESTY</div>
          <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:8px;align-items:end">
            ${kutuAlan('mt-perde', 'Perde', g('perdeVar', false))}
            ${sayiAlan('mt-perde-y', 'Perde yüksekliği', g('perdeYukseklik', V.perdeYukseklik))}
            ${sayiAlan('mt-perde-k', 'Kalınlık', g('perdeKalinlik', V.perdeKalinlik))}
          </div>
          <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:8px;align-items:end;margin-top:8px">
            ${kutuAlan('mt-modesty', 'Modesty', g('modestyVar', false))}
            ${sayiAlan('mt-modesty-y', 'Modesty yüksekliği', g('modestyYukseklik', V.modestyYukseklik))}
            ${sayiAlan('mt-modesty-k', 'Kalınlık', g('modestyKalinlik', V.modestyKalinlik))}
          </div>

          <div class="card-title" style="font-size:11px;margin:12px 0 6px">ÜRETİM VE PAKETLEME</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${sayiAlan('mt-minifix', 'Minifix / tabla', g('minifixTablaBasi', V.minifixTablaBasi))}
            ${sayiAlan('mt-kose', 'Köşe koruyucu / tabla', g('koseKoruyucuTablaBasi', V.koseKoruyucuTablaBasi))}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
            ${sayiAlan('mt-pkt-tabla', 'Paket başı tabla', g('tablaPaketBasi', V.tablaPaketBasi))}
            ${sayiAlan('mt-pkt-ayak', 'Paket başı ayak', g('ayakPaketBasi', V.ayakPaketBasi))}
            ${sayiAlan('mt-pkt-travers', 'Paket başı travers', g('traversPaketBasi', V.traversPaketBasi))}
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px">
            ${kutuAlan('mt-aksesuar', 'Aksesuar seti', g('aksesuarVar', true))}
            ${kutuAlan('mt-paketleme', 'Paket kartı üret', g('paketleme', true))}
          </div>
          <div style="margin-top:8px">${sayiAlan('mt-kesim', 'Kesim payı (mm)', g('kesimPayi', V.kesimPayi))}</div>
        </div>

        <!-- ORTA: TEKNİK RESİM + MALZEME -->
        <div style="flex:1 1 400px;min-width:300px">
          <div class="card-title" style="font-size:11px;margin-bottom:6px">TEKNİK RESİM</div>
          <div id="mt-cizim"></div>
          <div class="fhint" id="mt-cizim-not" style="margin:6px 0"></div>
          <div class="card-title" style="font-size:11px;margin:12px 0 6px">MALZEME VE KENAR BANDI</div>
          <div id="mt-malzeme"></div>
        </div>

        <!-- SAĞ: ÜRETİM VERİSİ -->
        <div style="flex:1 1 300px;min-width:270px">
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
            <button class="btn btn-sm mt-sekme" data-s="panel">Panel</button>
            <button class="btn btn-sm mt-sekme" data-s="metal">Ayak/Travers</button>
            <button class="btn btn-sm mt-sekme" data-s="hirdavat">Hırdavat</button>
            <button class="btn btn-sm mt-sekme" data-s="paket">Paket</button>
            <button class="btn btn-sm" id="mt-csv">⬇ CSV</button>
          </div>
          <div id="mt-onizleme"></div>
          <div id="mt-3b" style="margin-top:10px;max-width:300px"></div>
        </div>
      </div>`;

    App.openModal({
      title: tasarim ? '🪑 Masa Tasarım — Düzenle' : '🪑 Masa / Workstation Tasarım', body, wide: true,
      footer: `<button class="btn" id="mt-vaz">Vazgeç</button>
               <button class="btn" id="mt-tasarim-kaydet">💾 Tasarımı Kaydet</button>
               <button class="btn btn-blue" id="mt-isle">${tasarim ? 'Yeni Revizyon Olarak İşle →' : 'Ürün Ağacına İşle →'}</button>`
    });
    document.getElementById('mt-vaz').onclick = App.closeModal;

    const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
    const chk = (id) => { const e = document.getElementById(id); return e ? e.checked : false; };

    const oku = () => ({
      tip: val('mt-tip'), kisiSayisi: +val('mt-kisi'), dizilim: val('mt-dizilim'),
      siraArasiBosluk: +val('mt-sira-bosluk'),
      tablaBoy: +val('mt-tbboy'), tablaEn: +val('mt-tben'), tablaKalinlik: +val('mt-tbkal'),
      ayakModeli: val('mt-ayak-model'), ayakYukseklik: +val('mt-ayak-y'), ayakAdet: +val('mt-ayak-adet'),
      traversVar: chk('mt-travers'), traversAdet: +val('mt-travers-adet'),
      perdeVar: chk('mt-perde'), perdeYukseklik: +val('mt-perde-y'), perdeKalinlik: +val('mt-perde-k'),
      modestyVar: chk('mt-modesty'), modestyYukseklik: +val('mt-modesty-y'), modestyKalinlik: +val('mt-modesty-k'),
      minifixTablaBasi: +val('mt-minifix'), koseKoruyucuTablaBasi: +val('mt-kose'),
      tablaPaketBasi: +val('mt-pkt-tabla'), ayakPaketBasi: +val('mt-pkt-ayak'), traversPaketBasi: +val('mt-pkt-travers'),
      aksesuarVar: chk('mt-aksesuar'), paketleme: chk('mt-paketleme'), kesimPayi: +val('mt-kesim'),
      panelAyarlari
    });

    function cizimCiz() {
      const el = document.getElementById('mt-cizim');
      if (!Z) { el.innerHTML = '<div class="fhint">Çizim modülü yüklenemedi.</div>'; return; }
      el.innerHTML = Z.ustten(sonHesap, seciliTabla) + '<div style="margin-top:8px">' + Z.onden(sonHesap) + '</div>';
      const e3 = document.getElementById('mt-3b');
      if (e3) e3.innerHTML = Z.ucBoyut(sonHesap);
      const o = sonHesap.ozet, yr = sonHesap.yerlesim;
      document.getElementById('mt-cizim-not').innerHTML =
        `Gabari <b>${o.toplamBoy} × ${o.toplamEn} × ${o.toplamYukseklik} mm</b> · ${yr.siraSayisi} sıra × ${yr.siraBasiTabla} tabla ·
         ${yr.ayakKonumSayisi} ayak konumu (${yr.tekYonAyak} uç + ${yr.araAyak} ${yr.araAyakTipi === 'kutu' ? 'kutu' : 'çift yön'})`;
      el.querySelectorAll('.mc-tabla').forEach(r => { r.onclick = () => { seciliTabla = +r.dataset.i; cizimCiz(); }; });
    }

    function ayakBilgisiYaz() {
      const md = M.modelAl(val('mt-ayak-model'));
      const eksik = sonHesap.metaller.filter(m => m.receteEksik).length;
      document.getElementById('mt-ayak-bilgi').innerHTML =
        `<b>${esc(md.ad)}</b> — ${esc(md.aciklama)}<br>
         ${md.profilKesit ? 'Profil kesiti: ' + esc(md.profilKesit) + '<br>' : ''}
         Kullanım tipleri: tek yönlü (uçta) · iki yönlü (arada) · kutu (karşılıklı)<br>
         ${eksik ? `<span style="color:var(--amber-text)">⚠ ${eksik} metal parçanın alt reçetesi henüz girilmedi</span>` : '✓ tüm alt reçeteler tanımlı'}`;
    }

    function malzemeCiz() {
      const el = document.getElementById('mt-malzeme');
      if (!sonHesap) { el.innerHTML = ''; return; }
      const roller = [];
      sonHesap.paneller.forEach(p => { if (roller.indexOf(p.rol) < 0) roller.push(p.rol); });
      if (!plakalar.length) {
        el.innerHTML = `<div class="fhint" style="color:var(--amber-text)">⚠ Sistemde plaka tipinde hammadde yok.</div>`;
        return;
      }
      const plakaSec = (rol, sec) => `<select class="fselect mt-mlz" data-rol="${rol}" data-alan="hammaddeId" style="font-size:10.5px;padding:3px 4px;width:100%">
        <option value="">— Seçilmedi —</option>
        ${plakalar.map(p => `<option value="${p.id}" ${p.id === sec ? 'selected' : ''}>${esc(p.ad)}</option>`).join('')}</select>`;
      const bantSec = (rol, kenar, sec) => `<select class="fselect mt-bnt" data-rol="${rol}" data-kenar="${kenar}" style="font-size:10px;padding:2px 3px;width:100%">
        <option value="">—</option>
        ${bantlar.map(b => `<option value="${b.id}" ${b.id === sec ? 'selected' : ''}>${esc(b.ad)}</option>`).join('')}</select>`;
      el.innerHTML = `
        <div class="fhint" style="margin-bottom:6px">Bant seçilmeyen kenar boş kalır (bantsız üretilir).</div>
        <div style="overflow:auto;border:1px solid var(--border);border-radius:8px">
        <table class="dtable" style="font-size:10.5px;margin:0">
          <tr><th>Panel</th><th class="r" style="width:50px">Kal.</th><th style="min-width:120px">Plaka hammadde</th>
              ${KENARLAR.map(([, a]) => `<th style="min-width:62px">${a}</th>`).join('')}</tr>
          ${roller.map(rol => {
            const pa = panelAyarlari[rol] || {}, bl = pa.bantlar || {};
            const varsayilan = (sonHesap.paneller.find(p => p.rol === rol) || {}).kalinlik || '';
            return `<tr><td><b>${esc(ROL_ADI[rol] || rol)}</b></td>
              <td class="r"><input class="finput mt-mlz" data-rol="${rol}" data-alan="kalinlik" type="number"
                value="${pa.kalinlik || ''}" placeholder="${varsayilan}" style="font-size:10.5px;padding:3px 4px;width:46px;text-align:right"></td>
              <td>${plakaSec(rol, pa.hammaddeId)}</td>
              ${KENARLAR.map(([k]) => `<td>${bantSec(rol, k, bl[k])}</td>`).join('')}</tr>`;
          }).join('')}
        </table></div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button class="btn btn-sm" id="mt-bant4">Tüm panellere 4 kenar bant</button>
          <button class="btn btn-sm btn-ghost" id="mt-mlz-temizle">Temizle</button>
        </div>`;
      el.querySelectorAll('.mt-mlz').forEach(inp => {
        const olay = inp.tagName === 'SELECT' ? 'onchange' : 'oninput';
        inp[olay] = () => {
          const rol = inp.dataset.rol, alan = inp.dataset.alan;
          panelAyarlari[rol] = panelAyarlari[rol] || {};
          panelAyarlari[rol][alan] = (alan === 'kalinlik') ? (parseFloat(inp.value) || 0) : inp.value;
          yenile();
        };
      });
      el.querySelectorAll('.mt-bnt').forEach(sel => sel.onchange = () => {
        const rol = sel.dataset.rol;
        panelAyarlari[rol] = panelAyarlari[rol] || {};
        panelAyarlari[rol].bantlar = panelAyarlari[rol].bantlar || {};
        panelAyarlari[rol].bantlar[sel.dataset.kenar] = sel.value || null;
        yenile();
      });
      const b4 = document.getElementById('mt-bant4');
      if (b4) b4.onclick = () => {
        if (!bantlar.length) { App.toast('Kenar bandı hammaddesi yok', 'err'); return; }
        const b = bantlar[0];
        roller.forEach(rol => {
          panelAyarlari[rol] = panelAyarlari[rol] || {};
          panelAyarlari[rol].bantlar = { on: b.id, arka: b.id, sag: b.id, sol: b.id };
        });
        App.toast('4 kenar bandı atandı: ' + b.ad, 'ok');
        yenile();
      };
      const tm = document.getElementById('mt-mlz-temizle');
      if (tm) tm.onclick = () => { panelAyarlari = {}; yenile(); };
    }

    const yenile = () => {
      sonHesap = M.hesapla(oku());
      cizimCiz(); ayakBilgisiYaz(); malzemeCiz();
      onizlemeCiz(document.getElementById('mt-onizleme'), sonHesap);
    };
    body.querySelectorAll('.mt-in').forEach(e => { e.oninput = yenile; e.onchange = yenile; });
    body.querySelectorAll('.mt-sekme').forEach(b => b.onclick = () => {
      aktifSekme = b.dataset.s; onizlemeCiz(document.getElementById('mt-onizleme'), sonHesap);
    });
    document.getElementById('mt-csv').onclick = () => csvIndir();
    yenile();

    document.getElementById('mt-tasarim-kaydet').onclick = async () => {
      const ad = document.getElementById('mt-ad').value.trim();
      if (!ad) { App.toast('Masa adı zorunlu', 'err'); return; }
      await tasarimKaydet(ad, oku());
      App.toast('Tasarım kaydedildi', 'ok');
      if (onSaved) onSaved();
    };
    document.getElementById('mt-isle').onclick = async () => {
      const ad = document.getElementById('mt-ad').value.trim();
      if (!ad) { App.toast('Masa adı zorunlu', 'err'); return; }
      if (!sonHesap || !sonHesap.paneller.length) { App.toast('Geçerli ölçü girin', 'err'); return; }
      await urunAgacinaIsle(ad, sonHesap, onSaved);
    };
  }

  // ── ÖNİZLEME ─────────────────────────────────────────────────────────────
  function onizlemeCiz(el, h) {
    if (!el || !h) return;
    const o = h.ozet;
    let ic = '';
    if (aktifSekme === 'panel') {
      ic = tabloSar(`<tr><th>Panel</th><th class="r">Adet</th><th class="r">Net</th><th class="r">Kaba</th><th class="r">Kal.</th><th>Bant</th></tr>` +
        h.paneller.map(p => `<tr><td>${esc(p.ad)}${p.hammaddeId ? '' : ' <span style="color:var(--amber-text)">⚠</span>'}</td>
          <td class="r">${p.adet}</td><td class="r">${p.netEn}×${p.netBoy}</td>
          <td class="r muted">${p.kabaEn}×${p.kabaBoy}</td><td class="r">${p.kalinlik}</td>
          <td style="font-size:9.5px">${bantOzet(p)}</td></tr>`).join(''));
    } else if (aktifSekme === 'metal') {
      ic = tabloSar(`<tr><th>Parça</th><th class="r">Adet</th><th>Tip</th><th>Alt reçete</th></tr>` +
        h.metaller.map(m => `<tr><td>${esc(m.ad)}</td><td class="r"><b>${m.adet}</b></td>
          <td style="font-size:9.5px">${esc(m.tipKod)}</td>
          <td style="font-size:9.5px">${m.receteEksik ? '<span style="color:var(--amber-text)">yüklenecek</span>' : '✓ tanımlı'}</td></tr>`).join(''));
    } else if (aktifSekme === 'hirdavat') {
      ic = tabloSar(`<tr><th>Hırdavat</th><th class="r">Adet</th><th>Birim</th><th>Not</th></tr>` +
        h.hirdavat.map(x => `<tr><td>${esc(x.ad)}</td><td class="r"><b>${x.adet}</b></td><td>${esc(x.birim)}</td>
          <td class="muted" style="font-size:9.5px">${esc(x.not)}</td></tr>`).join(''));
    } else {
      ic = h.paketler.length
        ? tabloSar(`<tr><th>Paket</th><th>İçerik</th><th class="r">Adet</th></tr>` +
            h.paketler.map(p => `<tr><td class="mono" style="font-size:9.5px">${esc(p.etiket)}</td>
              <td>${esc(p.ad)}</td><td class="r">${p.icerik}</td></tr>`).join(''))
        : `<div class="fhint">Paketleme kapalı.</div>`;
    }
    el.innerHTML = `
      ${h.uyarilar.length ? `<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:8px;
        padding:8px 10px;font-size:11px;color:var(--amber-text);margin-bottom:8px">
        ${h.uyarilar.map(u => '⚠ ' + esc(u)).join('<br>')}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${[['Kişi', o.kisiSayisi], ['Panel', o.parcaAdedi], ['Metal', o.metalAdedi],
           ['Paket', o.paketAdedi], ['Net m²', o.netAlanM2], ['Bant', o.bantMetre + ' m']]
          .map(([e, d]) => `<div style="flex:1;min-width:52px;background:var(--surface2);border-radius:8px;padding:6px;text-align:center">
            <div style="font-size:9px;color:var(--text3)">${e}</div><div style="font-size:13px;font-weight:800">${d}</div></div>`).join('')}
      </div>${ic}`;
  }
  const tabloSar = (icerik) => `<div style="overflow:auto;max-height:320px;border:1px solid var(--border);border-radius:8px">
    <table class="dtable" style="font-size:10.5px;margin:0">${icerik}</table></div>`;
  function bantOzet(p) {
    if (!p.bantIds) return '—';
    const v = KENARLAR.filter(([k]) => p.bantIds[k]).map(([, a]) => a);
    return v.length ? v.join('+') : '—';
  }

  // ── TASARIM KAYDI VE REVİZYON ────────────────────────────────────────────
  async function tasarimKaydet(ad, yapilandirma, revizyonKaydi, kodOner) {
    const liste = await Store.masaTasarimlari.all();
    let kayit = tasarim && tasarim.id ? liste.find(x => x.id === tasarim.id) : null;
    if (!kayit) {
      kayit = {
        id: App.uid('MSA'),
        kod: kodOner || ('MSA-' + Date.now().toString(36).toUpperCase().slice(-5)),
        ad, revizyon: 1, yapilandirma, revizyonlar: [],
        olusturmaTarihi: new Date().toISOString().slice(0, 10)
      };
      liste.push(kayit);
    }
    kayit.ad = ad; kayit.yapilandirma = yapilandirma;
    kayit.guncellemeTarihi = new Date().toISOString().slice(0, 10);
    if (revizyonKaydi) {
      kayit.revizyonlar = kayit.revizyonlar || [];
      kayit.revizyonlar.push(revizyonKaydi);
      kayit.revizyon = revizyonKaydi.no;
    }
    await App.persist(() => Store.masaTasarimlari.save(liste));
    tasarim = kayit;
    return kayit;
  }

  async function listeAc(onSaved) {
    const liste = await Store.masaTasarimlari.all();
    const body = document.createElement('div');
    if (!liste.length) {
      body.innerHTML = `<div class="empty-state" style="padding:22px 10px"><div class="edesc">
        Henüz kayıtlı masa tasarımı yok. "🪑 Masa Tasarım" ile bir masa kurup <b>Tasarımı Kaydet</b> deyin.</div></div>`;
    } else {
      body.innerHTML = `<table class="dtable" style="font-size:11.5px">
        <tr><th>Tasarım</th><th class="r">Gabari</th><th>Ayak</th><th class="r">Rev.</th><th>Üretilen</th><th></th></tr>
        ${liste.map(d => {
          const y = d.yapilandirma || {};
          return `<tr><td><b>${esc(d.ad)}</b><div class="muted mono" style="font-size:10px">${esc(d.kod || '')}</div></td>
            <td class="r mono">${y.kisiSayisi || '—'} kişi · ${y.tablaBoy || '—'}×${y.tablaEn || '—'}</td>
            <td>${esc(y.ayakModeli || '—')}</td>
            <td class="r"><span class="pill pill-blue" style="font-size:9px">R${d.revizyon || 1}</span></td>
            <td style="font-size:10.5px">${(d.revizyonlar || []).length
              ? (d.revizyonlar || []).map(r => `R${r.no}: <span class="mono">${esc(r.urunKod)}</span>`).join('<br>')
              : '<span class="muted">işlenmedi</span>'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-sm ml-ac" data-id="${d.id}">Düzenle</button>
              <button class="btn btn-sm btn-ghost ml-sil" data-id="${d.id}" style="color:var(--red-text)">Sil</button>
            </td></tr>`;
        }).join('')}</table>`;
    }
    App.openModal({ title: '🪑 Kayıtlı Masa Tasarımları', body, wide: true, footer: `<button class="btn" id="ml-kapat">Kapat</button>` });
    document.getElementById('ml-kapat').onclick = App.closeModal;
    body.querySelectorAll('.ml-ac').forEach(b => b.onclick = () => {
      const d = liste.find(x => x.id === b.dataset.id);
      App.closeModal(); setTimeout(() => ac(onSaved, d), 60);
    });
    body.querySelectorAll('.ml-sil').forEach(b => b.onclick = () => {
      const d = liste.find(x => x.id === b.dataset.id);
      App.confirmDialog(`"${esc(d.ad)}" tasarımı silinsin mi?<br><br>Yalnızca tasarım kaydı silinir; işlenmiş ürün ve reçeteler yerinde kalır.`, async () => {
        await App.persist(() => Store.masaTasarimlari.save(liste.filter(x => x.id !== d.id)));
        App.toast('Tasarım silindi', 'ok'); App.closeModal();
        setTimeout(() => listeAc(onSaved), 60);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÜRÜN AĞACINA İŞLE
  // ══════════════════════════════════════════════════════════════════════════
  async function urunAgacinaIsle(masaAd, h, onSaved) {
    App.toast('Ürün ağacına işleniyor…', 'ok');
    const [yarimamuller, urunler, receteler, hammaddeler, paketler] = await Promise.all([
      Store.yarimamuller.all(), Store.urunler.all(), Store.receteler.all(),
      Store.hammaddeler.all(), Store.paketler.all()
    ]);

    const revNo = (tasarim && tasarim.revizyonlar && tasarim.revizyonlar.length)
      ? Math.max.apply(null, tasarim.revizyonlar.map(r => r.no)) + 1 : 1;
    const tabanKod = (tasarim && tasarim.kod) ? tasarim.kod : ('MSA-' + Date.now().toString(36).toUpperCase().slice(-5));
    const kodTaban = tabanKod + '-R' + revNo;
    const revAd = masaAd + ' (R' + revNo + ')';
    const bugun = new Date().toISOString().slice(0, 10);

    const anaKalemler = [];
    let sira = 0;

    // 1) Plaka panelleri → yarı mamül + plaka/bant reçetesi
    const panelYm = {};
    for (const p of h.paneller) {
      sira++;
      const ymKod = kodTaban + '-P' + String(sira).padStart(2, '0');
      const ym = {
        id: App.uid('YM'), kod: ymKod, ad: revAd + ' — ' + p.ad,
        netEn: p.netEn, netBoy: p.netBoy, kalinlik: p.kalinlik,
        kabaEn: p.kabaEn, kabaBoy: p.kabaBoy, adet: 1,
        renk: '', hammaddeId: p.hammaddeId || null, rotaId: null,
        amortismanGideri: 0, gygOraniYuzde: 0,
        aciklama: 'Masa tasarımdan üretildi · ' + p.ad + ' · ' + p.kalinlik + ' mm · bant: ' + bantOzet(p),
        gorseller: [], olusturmaTarihi: bugun, masaRolu: p.rol, masaRevizyon: revNo
      };
      yarimamuller.push(ym);
      panelYm[p.rol] = ym;
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
        receteler.push({ id: 'RC-' + ymKod, yarimamulId: ym.id, ad: ym.ad + ' Reçetesi', kalemler: [kalem] });
      }
      anaKalemler.push({ tip: 'yarimamul', refId: ym.id, miktar: p.adet, birim: 'ADET' });
    }

    // 2) Metal parçalar (ayak, travers) → yarı mamül. Alt reçete henüz boşsa
    //    kart yine açılır; reçete yüklendiğinde doldurulacak.
    const metalYm = [];
    for (const m of h.metaller) {
      sira++;
      const ymKod = m.kod || (kodTaban + '-M' + String(sira).padStart(2, '0'));
      const ym = {
        id: App.uid('YM'), kod: ymKod, ad: m.ad + (m.model ? '' : ''),
        netEn: null, netBoy: null, kalinlik: null, kabaEn: null, kabaBoy: null, adet: 1,
        renk: '', hammaddeId: null, rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0,
        aciklama: 'Masa tasarımdan üretildi · ' + m.model + ' ayak ailesi · ' + m.tipKod +
                  (m.receteEksik ? ' · ALT REÇETE HENÜZ GİRİLMEDİ' : ''),
        gorseller: [], olusturmaTarihi: bugun, masaRolu: m.rol, masaRevizyon: revNo
      };
      yarimamuller.push(ym);
      metalYm.push({ m, ym });
      if (m.receteKalemleri && m.receteKalemleri.length) {
        const kalemler = [];
        m.receteKalemleri.forEach(rk => {
          const hm = hammaddeler.find(x => (x.stokKodu || '') === rk.stokKodu);
          if (hm) kalemler.push({ tip: 'hammadde', refId: hm.id, miktar: rk.miktar, birim: rk.birim });
        });
        if (kalemler.length) receteler.push({ id: 'RC-' + ymKod, yarimamulId: ym.id, ad: ym.ad + ' Reçetesi', kalemler });
      }
      anaKalemler.push({ tip: 'yarimamul', refId: ym.id, miktar: m.adet, birim: 'ADET' });
    }

    // 3) Hırdavat → hammadde kartı (yoksa açılır)
    const yeniHm = [];
    for (const hd of h.hirdavat) {
      const aranan = hd.ad.toLocaleLowerCase('tr');
      let kart = hammaddeler.find(x => (x.ad || '').toLocaleLowerCase('tr').includes(aranan));
      if (!kart) {
        kart = {
          id: App.uid('HM'), stokKodu: 'HRD-' + kodTaban + '-' + String(yeniHm.length + 1).padStart(2, '0'),
          ad: hd.ad, tip: 'hirdavat', kategori: 'Hırdavat', birim: hd.birim || 'ADET',
          birimFiyat: 0, dvz: 'TL', fireYuzde: 0, kdvOraniYuzde: 18,
          aciklama: 'Masa tasarımdan otomatik açıldı', olusturmaTarihi: bugun
        };
        hammaddeler.push(kart); yeniHm.push(kart);
      }
      anaKalemler.push({ tip: 'hammadde', refId: kart.id, miktar: hd.adet, birim: hd.birim, not: hd.not || '' });
    }

    // 4) Paket kartları — sevkiyat kademesi (sistemin PAKET kart tipi)
    const paketKalemleri = [];
    if (h.paketler.length) {
      h.paketler.forEach((pk, i) => {
        const pkKod = kodTaban + '-PKT' + String(i + 1).padStart(2, '0');
        const paket = {
          id: App.uid('PKT'), kod: pkKod,
          ad: revAd + ' — ' + pk.ad + ' ' + pk.etiket,
          aciklama: pk.ad + ' · ' + pk.icerik + ' adet', olusturmaTarihi: bugun
        };
        paketler.push(paket);
        paketKalemleri.push({ tip: 'paket', refId: paket.id, miktar: 1, birim: 'ADET' });
      });
    }

    // 5) Ürün + ana reçete
    const urun = {
      id: App.uid('URN'), kod: kodTaban, ad: revAd, tip: 'bitmis_urun',
      aciklama: 'Masa tasarım ekranı · R' + revNo + ' · ' + h.ozet.kisiSayisi + ' kişilik · ' +
                h.ozet.toplamBoy + '×' + h.ozet.toplamEn + '×' + h.ozet.toplamYukseklik + ' mm · ' +
                h.yapilandirma.ayakModeli + ' ayak · ' + h.ozet.paketAdedi + ' paket',
      rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0,
      gorseller: [], olusturmaTarihi: bugun,
      masaYapilandirma: h.yapilandirma, masaRevizyon: revNo
    };
    urunler.push(urun);
    receteler.push({
      id: 'RC-' + kodTaban, urunId: urun.id, ad: revAd + ' Reçetesi',
      kalemler: anaKalemler.concat(paketKalemleri)
    });

    await App.persist(async () => {
      if (yeniHm.length) await Store.hammaddeler.save(hammaddeler);
      await Store.yarimamuller.save(yarimamuller);
      if (paketKalemleri.length) await Store.paketler.save(paketler);
      await Store.urunler.save(urunler);
      await Store.receteler.save(receteler);
    });

    await tasarimKaydet(masaAd, h.yapilandirma, {
      no: revNo, tarih: bugun, urunId: urun.id, receteId: 'RC-' + kodTaban, urunKod: kodTaban, ad: revAd
    }, tabanKod);

    App.closeModal();
    const eksik = h.metaller.filter(m => m.receteEksik).length;
    App.toast('✓ ' + revAd + ': 1 ürün + ' + (h.paneller.length + h.metaller.length) + ' yarı mamül + ' +
      h.paketler.length + ' paket' + (eksik ? ' · ' + eksik + ' metal parçanın alt reçetesi bekleniyor' : ''), 'ok');
    if (onSaved) onSaved();
  }

  // ── CSV ──────────────────────────────────────────────────────────────────
  function csvIndir() {
    if (!sonHesap) return;
    const adEl = document.getElementById('mt-ad');
    const ad = ((adEl && adEl.value) || 'masa').trim() || 'masa';
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    let csv = 'BOLUM;PARCA;ADET;NET_EN;NET_BOY;KABA_EN;KABA_BOY;KALINLIK;BANTLI_KENARLAR\n';
    sonHesap.paneller.forEach(p => {
      csv += ['PANEL', p.ad, p.adet, p.netEn, p.netBoy, p.kabaEn, p.kabaBoy, p.kalinlik, bantOzet(p)].map(q).join(';') + '\n';
    });
    csv += '\nBOLUM;PARCA;ADET;TIP;MODEL;ALT_RECETE\n';
    sonHesap.metaller.forEach(m => {
      csv += ['METAL', m.ad, m.adet, m.tipKod, m.model, m.receteEksik ? 'YUKLENECEK' : 'TANIMLI'].map(q).join(';') + '\n';
    });
    csv += '\nBOLUM;HIRDAVAT;ADET;BIRIM;NOT\n';
    sonHesap.hirdavat.forEach(x => { csv += ['HIRDAVAT', x.ad, x.adet, x.birim, x.not].map(q).join(';') + '\n'; });
    csv += '\nBOLUM;PAKET;ICERIK\n';
    sonHesap.paketler.forEach(p => { csv += ['PAKET', p.etiket + ' ' + p.ad, p.icerik].map(q).join(';') + '\n'; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = ad.replace(/[^\wğüşıöçĞÜŞİÖÇ .-]/g, '') + '_uretim.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    App.toast('Üretim CSV dosyası indirildi', 'ok');
  }

  return { ac, listeAc, urunAgacinaIsle };
})();
