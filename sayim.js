// ════════════════════════════════════════════════════════════════════════════
// ENVANTER SAYIMI
//
// Yarı mamül / hammadde / ürün stoğunu elle sayıp deftere yazmayı bitirir.
// Akış dört adımdır ve her adım iz bırakır:
//
//   1) SAYIM AÇ      → seçilen ambar için o anki sistem miktarları DONDURULUR
//                      (sistemMiktar). Sayım sırasında stok değişse bile
//                      karşılaştırma bu dondurulmuş değerle yapılır.
//   2) SAY           → her kalem için sayılan miktar girilir. Sahada telefonla
//                      yapılabilir; kalem koda göre süzülür.
//   3) FARKI GÖR     → sistem ↔ sayılan farkı adet ve oran olarak listelenir,
//                      en büyük sapmalar üste alınır.
//   4) STOĞA İŞLE    → onaylanan sayım stok kayıtlarını günceller ve her fark
//                      için bir stok hareketi (sayım düzeltmesi) yazılır.
//                      Kim, ne zaman saydı ve neyi düzeltti kalıcı kayıttır.
//
// Veri: sayimlar → { id, no, ambar, durum, acan, acilis, kapanis, kapatan,
//                    notlar, satirlar:[{ stokId, tip, refId, refKod, refAd,
//                    birim, sistemMiktar, sayilanMiktar, sayan, zaman }] }
// ════════════════════════════════════════════════════════════════════════════
const Sayim = (() => {

  const AMBARLAR = {
    hammadde_deposu: 'Hammadde / Hırdavat Deposu',
    uretim_ambari: 'Üretim Ambarı (Yarı Mamül)',
    sevkiyat_deposu: 'Sevkiyat Deposu (Bitmiş Ürün)'
  };
  const DURUMLAR = { acik: 'Sayım sürüyor', kapali: 'Stoğa işlendi', iptal: 'İptal edildi' };

  const esc = (s) => (window.App ? App.escapeHtml(s) : String(s == null ? '' : s));
  const sayi = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
  const bicim = (n) => (n == null ? '—' : (Math.round(n * 100) / 100).toLocaleString('tr-TR'));

  // ── YENİ SAYIM AÇ: seçilen ambarın anlık görüntüsünü dondurur ────────────
  async function sayimAc(ambar, acan, kapsam) {
    const stoklar = await Store.stokRaf.all();
    let ilgili = stoklar.filter(s => s.ambar === ambar);
    if (kapsam && kapsam !== 'hepsi') ilgili = ilgili.filter(s => s.tip === kapsam);
    if (!ilgili.length) throw new Error('Bu ambarda sayılacak kalem bulunamadı');

    const sayimlar = await Store.sayimlar.all();
    const kayit = {
      id: App.uid('SYM'),
      no: 'SAY-' + new Date().getFullYear() + '-' + String(sayimlar.length + 1).padStart(3, '0'),
      ambar, kapsam: kapsam || 'hepsi', durum: 'acik',
      acan: acan || '', acilis: new Date().toISOString(),
      satirlar: ilgili.map(s => ({
        stokId: s.id, tip: s.tip, refId: s.refId, refKod: s.refKod || '', refAd: s.refAd || '',
        birim: s.birim || '', sistemMiktar: parseFloat(s.miktar) || 0,
        sayilanMiktar: null, sayan: '', zaman: ''
      }))
    };
    sayimlar.push(kayit);
    await App.persist(() => Store.sayimlar.save(sayimlar));
    return kayit;
  }

  // ── FARK HESABI ──────────────────────────────────────────────────────────
  function farkOzeti(kayit) {
    const sayilan = kayit.satirlar.filter(s => s.sayilanMiktar != null);
    const farkli = sayilan.filter(s => Math.abs(s.sayilanMiktar - s.sistemMiktar) > 0.001);
    const fazla = farkli.filter(s => s.sayilanMiktar > s.sistemMiktar);
    const eksik = farkli.filter(s => s.sayilanMiktar < s.sistemMiktar);
    const netFark = farkli.reduce((t, s) => t + (s.sayilanMiktar - s.sistemMiktar), 0);
    // Doğruluk: farkı olmayan sayılmış kalemlerin oranı
    const dogruluk = sayilan.length ? Math.round(((sayilan.length - farkli.length) / sayilan.length) * 100) : null;
    return {
      toplam: kayit.satirlar.length, sayilan: sayilan.length,
      kalan: kayit.satirlar.length - sayilan.length,
      farkli: farkli.length, fazla: fazla.length, eksik: eksik.length,
      netFark, dogruluk, farkliSatirlar: farkli
    };
  }

  // ── STOĞA İŞLE: farkları uygular, her fark için hareket yazar ────────────
  async function stogaIsle(sayimId, kapatan) {
    const sayimlar = await Store.sayimlar.all();
    const kayit = sayimlar.find(s => s.id === sayimId);
    if (!kayit) throw new Error('Sayım bulunamadı');
    if (kayit.durum !== 'acik') throw new Error('Bu sayım zaten kapatılmış');

    const stoklar = await Store.stokRaf.all();
    const hareketler = await Store.stokHareketleri.all();
    const bugun = new Date().toISOString().slice(0, 10);
    let uygulanan = 0;

    kayit.satirlar.forEach(sat => {
      if (sat.sayilanMiktar == null) return;                 // sayılmayan kalem dokunulmaz
      const fark = sat.sayilanMiktar - sat.sistemMiktar;
      if (Math.abs(fark) < 0.001) return;
      const stok = stoklar.find(s => s.id === sat.stokId);
      if (stok) { stok.miktar = sat.sayilanMiktar; uygulanan++; }
      hareketler.push({
        id: App.uid('HRK'),
        tip: fark > 0 ? 'giris' : 'cikis',
        ambar: kayit.ambar, kalemAdi: sat.refAd || sat.refKod,
        miktar: Math.abs(fark),
        aciklama: 'Sayım düzeltmesi (' + kayit.no + ') — sistem ' + bicim(sat.sistemMiktar) +
                  ' → sayılan ' + bicim(sat.sayilanMiktar) + (sat.sayan ? ' · ' + sat.sayan : ''),
        tarih: bugun
      });
    });

    kayit.durum = 'kapali';
    kayit.kapanis = new Date().toISOString();
    kayit.kapatan = kapatan || '';
    await App.persist(async () => {
      await Store.stokRaf.save(stoklar);
      await Store.stokHareketleri.save(hareketler);
      await Store.sayimlar.save(sayimlar);
    });
    return { uygulanan, ozet: farkOzeti(kayit) };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ARAYÜZ — Depo Paneli "Envanter Sayımı" sekmesi
  // ══════════════════════════════════════════════════════════════════════════
  let acikSayimId = null;   // ekranda açık olan sayım

  async function sekmeCiz(kap, yenile) {
    const sayimlar = await Store.sayimlar.all();
    const acik = sayimlar.filter(s => s.durum === 'acik');
    const gecmis = sayimlar.filter(s => s.durum !== 'acik').slice().reverse();

    // Ekranda bir sayım açıksa onun detayını göster
    if (acikSayimId) {
      const kayit = sayimlar.find(s => s.id === acikSayimId);
      if (kayit) return detayCiz(kap, kayit, yenile);
      acikSayimId = null;
    }

    kap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div class="fhint" style="max-width:640px;margin:0">
          Sayım açtığınızda sistemdeki miktarlar <b>dondurulur</b>; sayım boyunca stok değişse bile
          karşılaştırma bu değerle yapılır. Sayılan miktarları girip <b>stoğa işlediğinizde</b>
          her fark için ambar hareketi yazılır — kim saydı, ne düzeltildi kayıtta kalır.
        </div>
        <button class="btn btn-blue" id="sy-yeni">+ Yeni Sayım Aç</button>
      </div>

      ${acik.length ? `
        <div class="card-title" style="font-size:12px;margin-bottom:6px">SÜREN SAYIMLAR (${acik.length})</div>
        ${acik.map(s => {
          const o = farkOzeti(s);
          return `<div style="border:1.5px solid var(--amber);background:var(--amber-bg);border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <b class="mono" style="font-size:12.5px">${esc(s.no)}</b>
              <span class="muted" style="font-size:11px;margin-left:6px">${esc(AMBARLAR[s.ambar] || s.ambar)}</span>
              <div style="font-size:11px;color:var(--text2);margin-top:3px">
                ${o.sayilan}/${o.toplam} kalem sayıldı · ${o.kalan} kalem bekliyor
                ${o.farkli ? ` · <b style="color:var(--red-text)">${o.farkli} farklı</b>` : ''}
                ${s.acan ? ' · açan: ' + esc(s.acan) : ''}
              </div>
            </div>
            <button class="btn btn-sm btn-blue sy-ac" data-id="${s.id}">Sayıma Devam Et →</button>
          </div>`;
        }).join('')}` : ''}

      <div class="card-title" style="font-size:12px;margin:14px 0 6px">GEÇMİŞ SAYIMLAR (${gecmis.length})</div>
      ${gecmis.length ? `<table class="dtable" style="font-size:11.5px">
        <tr><th>Sayım No</th><th>Ambar</th><th>Tarih</th><th class="r">Kalem</th><th class="r">Farklı</th>
            <th class="r">Doğruluk</th><th>Sayan</th><th></th></tr>
        ${gecmis.map(s => {
          const o = farkOzeti(s);
          return `<tr>
            <td class="mono"><b>${esc(s.no)}</b></td>
            <td>${esc(AMBARLAR[s.ambar] || s.ambar)}</td>
            <td>${esc((s.kapanis || s.acilis || '').slice(0, 10))}</td>
            <td class="r">${o.sayilan}/${o.toplam}</td>
            <td class="r">${o.farkli ? `<b style="color:var(--red-text)">${o.farkli}</b>` : '0'}</td>
            <td class="r">${o.dogruluk == null ? '—' : `<b style="color:${o.dogruluk >= 95 ? 'var(--green-text)' : o.dogruluk >= 85 ? 'var(--amber-text)' : 'var(--red-text)'}">%${o.dogruluk}</b>`}</td>
            <td>${esc(s.kapatan || s.acan || '')}</td>
            <td><button class="btn btn-sm sy-ac" data-id="${s.id}">İncele</button></td>
          </tr>`;
        }).join('')}
      </table>` : '<div class="muted" style="font-size:11.5px">Henüz kapatılmış sayım yok.</div>'}`;

    kap.querySelectorAll('.sy-ac').forEach(b => b.onclick = () => { acikSayimId = b.dataset.id; yenile(); });
    kap.querySelector('#sy-yeni').onclick = () => yeniSayimPenceresi(yenile);
  }

  // ── YENİ SAYIM PENCERESİ ─────────────────────────────────────────────────
  function yeniSayimPenceresi(yenile) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Ambar <span style="color:var(--red-text)">*</span></label>
        <select class="fselect" id="sy-ambar">
          ${Object.entries(AMBARLAR).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
        </select></div>
      <div class="fgroup"><label class="flbl">Kapsam</label>
        <select class="fselect" id="sy-kapsam">
          <option value="hepsi">Ambardaki tüm kalemler</option>
          <option value="yarimamul">Yalnızca yarı mamüller</option>
          <option value="hammadde">Yalnızca hammadde / hırdavat</option>
          <option value="urun">Yalnızca bitmiş ürünler</option>
        </select></div>
      <div class="fgroup"><label class="flbl">Sayımı Açan <span style="color:var(--red-text)">*</span></label>
        <input class="finput" id="sy-acan" placeholder="Adınız — kayda işlenecek"></div>
      <div class="fhint">Sayım açıldığı anda sistem miktarları dondurulur. Sayım sürerken üretim
      devam edebilir; fark hesabı dondurulmuş değere göre yapılır.</div>
      <div id="sy-hata" style="color:var(--red-text);font-size:12px;min-height:16px"></div>`;
    App.openModal({
      title: '📋 Yeni Envanter Sayımı', body,
      footer: `<button class="btn" id="sy-vaz">Vazgeç</button><button class="btn btn-blue" id="sy-baslat">Sayımı Başlat</button>`
    });
    document.getElementById('sy-vaz').onclick = App.closeModal;
    document.getElementById('sy-baslat').onclick = async () => {
      const ambar = document.getElementById('sy-ambar').value;
      const kapsam = document.getElementById('sy-kapsam').value;
      const acan = document.getElementById('sy-acan').value.trim();
      const hata = document.getElementById('sy-hata');
      if (!acan) { hata.textContent = 'Sayımı açan kişi zorunlu'; return; }
      try {
        const kayit = await sayimAc(ambar, acan, kapsam);
        acikSayimId = kayit.id;
        App.closeModal();
        App.toast(kayit.no + ' açıldı — ' + kayit.satirlar.length + ' kalem', 'ok');
        yenile();
      } catch (e) { hata.textContent = e.message; }
    };
  }

  // ── SAYIM DETAY / GİRİŞ EKRANI ───────────────────────────────────────────
  function detayCiz(kap, kayit, yenile) {
    const o = farkOzeti(kayit);
    const kapali = kayit.durum !== 'acik';

    kap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div>
          <button class="btn btn-sm" id="sy-geri">← Sayım Listesi</button>
          <b class="mono" style="margin-left:8px;font-size:13px">${esc(kayit.no)}</b>
          <span class="muted" style="font-size:11.5px;margin-left:6px">${esc(AMBARLAR[kayit.ambar] || kayit.ambar)}</span>
          <span class="pill ${kapali ? 'pill-gray' : 'pill-amber'}" style="font-size:9.5px;margin-left:6px">${esc(DURUMLAR[kayit.durum])}</span>
        </div>
        ${kapali ? '' : `<div style="display:flex;gap:6px">
          <button class="btn btn-sm" id="sy-hepsi-esit">Sayılmayanları sistemle eşitle</button>
          <button class="btn btn-blue btn-sm" id="sy-isle">✓ Stoğa İşle (${o.farkli} fark)</button>
        </div>`}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${[['Kalem', o.toplam], ['Sayılan', o.sayilan], ['Bekleyen', o.kalan],
           ['Farklı', o.farkli], ['Doğruluk', o.dogruluk == null ? '—' : '%' + o.dogruluk]]
          .map(([e, d]) => `<div style="flex:1;min-width:88px;background:var(--surface2);border-radius:10px;padding:8px 10px;text-align:center">
            <div style="font-size:9.5px;color:var(--text3);letter-spacing:.4px">${e.toUpperCase()}</div>
            <div style="font-size:15px;font-weight:800">${d}</div></div>`).join('')}
      </div>

      ${kapali ? '' : `<div class="fgroup" style="max-width:340px">
        <input class="finput" id="sy-ara" placeholder="Kod veya ad ile süz — sahada hızlı bulma">
      </div>`}

      <div style="overflow:auto">
      <table class="dtable" style="font-size:11.5px" id="sy-tablo">
        <tr><th>Kod</th><th>Ad</th><th class="r">Sistem</th><th class="r" style="width:120px">Sayılan</th>
            <th class="r">Fark</th><th>Sayan</th></tr>
        ${kayit.satirlar.map((s, i) => {
          const fark = s.sayilanMiktar == null ? null : s.sayilanMiktar - s.sistemMiktar;
          const farkli = fark != null && Math.abs(fark) > 0.001;
          return `<tr class="sy-satir" data-ara="${esc(((s.refKod || '') + ' ' + (s.refAd || '')).toLocaleLowerCase('tr'))}"
            style="${farkli ? 'background:var(--red-bg)' : ''}">
            <td class="mono">${esc(s.refKod)}</td>
            <td>${esc(s.refAd)}</td>
            <td class="r">${bicim(s.sistemMiktar)} <span class="muted" style="font-size:9.5px">${esc(s.birim)}</span></td>
            <td class="r">${kapali
              ? bicim(s.sayilanMiktar)
              : `<input class="finput sy-giris" data-i="${i}" type="number" step="0.01" inputmode="decimal"
                   value="${s.sayilanMiktar == null ? '' : s.sayilanMiktar}" style="width:104px;text-align:right">`}</td>
            <td class="r">${fark == null ? '<span class="muted">—</span>'
              : farkli ? `<b style="color:${fark > 0 ? 'var(--green-text)' : 'var(--red-text)'}">${fark > 0 ? '+' : ''}${bicim(fark)}</b>`
              : '<span style="color:var(--green-text)">✓</span>'}</td>
            <td style="font-size:10.5px">${esc(s.sayan || '')}</td>
          </tr>`;
        }).join('')}
      </table></div>`;

    kap.querySelector('#sy-geri').onclick = () => { acikSayimId = null; yenile(); };
    if (kapali) return;

    // Hızlı süzme (sahada kalem bulma)
    const ara = kap.querySelector('#sy-ara');
    ara.oninput = () => {
      const q = ara.value.trim().toLocaleLowerCase('tr');
      kap.querySelectorAll('.sy-satir').forEach(tr => {
        tr.style.display = !q || tr.dataset.ara.includes(q) ? '' : 'none';
      });
    };

    // Sayılan miktar girişi — anında kaydeder (saha koşulunda kayıp olmasın)
    const sayanAdi = () => {
      let ad = kayit.sonSayan || kayit.acan || '';
      return ad;
    };
    kap.querySelectorAll('.sy-giris').forEach(inp => {
      inp.onchange = async () => {
        const i = parseInt(inp.dataset.i, 10);
        const deger = inp.value === '' ? null : sayi(inp.value);
        const tumu = await Store.sayimlar.all();
        const k = tumu.find(x => x.id === kayit.id);
        if (!k) return;
        k.satirlar[i].sayilanMiktar = deger;
        k.satirlar[i].sayan = deger == null ? '' : sayanAdi();
        k.satirlar[i].zaman = deger == null ? '' : new Date().toISOString();
        await App.persist(() => Store.sayimlar.save(tumu));
        kayit.satirlar[i] = k.satirlar[i];
        yenile();
      };
    });

    // Sayılmayanları sistemle eşitle (kalem çok, fark yok senaryosu)
    kap.querySelector('#sy-hepsi-esit').onclick = async () => {
      if (!window.confirm('Sayılmamış tüm kalemler sistem miktarıyla aynı kabul edilecek. Devam edilsin mi?')) return;
      const tumu = await Store.sayimlar.all();
      const k = tumu.find(x => x.id === kayit.id);
      k.satirlar.forEach(s => {
        if (s.sayilanMiktar == null) {
          s.sayilanMiktar = s.sistemMiktar;
          s.sayan = k.acan || '';
          s.zaman = new Date().toISOString();
        }
      });
      await App.persist(() => Store.sayimlar.save(tumu));
      App.toast('Sayılmayan kalemler sistemle eşitlendi', 'ok');
      yenile();
    };

    // Stoğa işle
    kap.querySelector('#sy-isle').onclick = async () => {
      const oz = farkOzeti(kayit);
      if (oz.kalan > 0 && !window.confirm(oz.kalan + ' kalem henüz sayılmadı. Sayılmayanlara DOKUNULMAYACAK. Devam edilsin mi?')) return;
      if (!window.confirm(oz.farkli + ' kalemde fark var. Stok bu farklara göre güncellenecek ve her fark için ambar hareketi yazılacak. Onaylıyor musunuz?')) return;
      try {
        const sonuc = await stogaIsle(kayit.id, kayit.acan);
        App.toast('Sayım kapatıldı — ' + sonuc.uygulanan + ' kalemde stok düzeltildi', 'ok');
        acikSayimId = null;
        yenile();
      } catch (e) { App.toast('İşlenemedi: ' + e.message, 'err'); }
    };
  }

  return { sekmeCiz, sayimAc, farkOzeti, stogaIsle, AMBARLAR };
})();
