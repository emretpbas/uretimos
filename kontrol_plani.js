// ════════════════════════════════════════════════════════════════════════════
// KALİTE KONTROL PLANI
//
// "Kontrol et" demek kalite sistemi değildir. Kalite sistemi, operatöre
// ŞUNU söyler: bu parçada, bu istasyonda, şu özelliği, şu toleransla,
// şu aletle, şu sıklıkta ölç.
//
// Bu modül o planı tanımlar. Operatör terminali kalite adımında planı okur,
// operatöre ölçüm listesi çıkarır ve girilen değerleri kaydeder. Tolerans
// dışı değer otomatik "uygunsuz" sayılır ve kök neden analizine veri olur.
//
// Veri yapısı — kontrolPlanlari:
//   { id, hedefTip, hedefId, hedefKod, hedefAd, aktif, maddeler: [
//       { id, ozellik, tip, istasyonKod, hedefDeger, altTolerans, ustTolerans,
//         birim, alet, siklik, numuneAdet, kritik }
//   ]}
// ════════════════════════════════════════════════════════════════════════════
const KontrolPlani = (() => {

  const TIPLER = {
    olcu: 'Ölçü (sayısal)', gorsel: 'Görsel (var/yok)',
    fonksiyon: 'Fonksiyon (çalışıyor/çalışmıyor)', yuzey: 'Yüzey kalitesi'
  };
  const SIKLIKLAR = {
    her_parca: 'Her parçada', ilk_parca: 'İlk parçada (kurulum onayı)',
    numune: 'Numune (her N adette bir)', periyodik: 'Vardiya başına bir kez'
  };
  const ALETLER = ['Kumpas', 'Şerit metre', 'Mastar', 'Gönye', 'Yüzey mastarı',
    'Renk kartelası', 'Tork anahtarı', 'Terazi', 'Gözle muayene', 'Şablon'];

  const esc = (s) => (window.App ? App.escapeHtml(s) : String(s == null ? '' : s));

  // ── Bir parça + istasyon için geçerli kontrol maddelerini döndürür ────────
  // Operatör terminali bunu kullanır. İstasyon kodu boş bırakılmış maddeler
  // "tüm istasyonlarda geçerli" sayılır.
  async function maddeleriGetir(hedefId, hedefKod, istasyonKod) {
    let planlar = [];
    try { planlar = await Store.kontrolPlanlari.all(); } catch (e) { return []; }
    const plan = planlar.find(p => p.aktif !== false &&
      (p.hedefId === hedefId || (hedefKod && p.hedefKod === hedefKod)));
    if (!plan) return [];
    return (plan.maddeler || [])
      .filter(m => !m.istasyonKod || m.istasyonKod === istasyonKod)
      .map(m => ({ ...m, planId: plan.id, planKod: plan.hedefKod }));
  }

  // ── Girilen değeri toleransa göre değerlendirir ───────────────────────────
  // Dönen: {sonuc:'uygun'|'uygunsuz', mesaj}
  // ── ÖLÇÜMÜ DEĞERLENDİR ───────────────────────────────────────────────────
  // ÖNEMLİ: altTolerans / ustTolerans, hedef değere göre SAPMA'dır (mutlak
  // sınır değil). Örn. hedef 1200 mm, alt -2, üst +2 → kabul aralığı
  // 1198–1202 mm. Sapmalar boşsa madde yalnızca kayıt amaçlı ölçülür.
  // Kolaylık için hem `sonuc` (metin) hem `uygun` (mantıksal) döner.
  function degerlendir(madde, deger) {
    const sonucla = (uygun, mesaj) => ({ sonuc: uygun ? 'uygun' : 'uygunsuz', uygun, mesaj });
    if (madde.tip === 'olcu') {
      const sayi = parseFloat(String(deger).replace(',', '.'));
      if (isNaN(sayi)) return sonucla(false, 'Sayısal değer girilmedi');
      const hedef = parseFloat(madde.hedefDeger);
      const altSapma = parseFloat(madde.altTolerans);
      const ustSapma = parseFloat(madde.ustTolerans);
      const br = madde.birim ? ' ' + madde.birim : '';
      // Hedef tanımlıysa sapma bazlı, değilse girilen değerler mutlak sınırdır
      const altSinir = !isNaN(hedef) && !isNaN(altSapma) ? hedef + altSapma : altSapma;
      const ustSinir = !isNaN(hedef) && !isNaN(ustSapma) ? hedef + ustSapma : ustSapma;
      if (!isNaN(altSinir) && sayi < altSinir) {
        return sonucla(false, 'Alt sınırın altında (min ' + Math.round(altSinir * 1000) / 1000 + br + ')');
      }
      if (!isNaN(ustSinir) && sayi > ustSinir) {
        return sonucla(false, 'Üst sınırın üstünde (max ' + Math.round(ustSinir * 1000) / 1000 + br + ')');
      }
      if (isNaN(altSinir) && isNaN(ustSinir)) return sonucla(true, 'Kaydedildi');
      const aralik = (isNaN(altSinir) ? '…' : Math.round(altSinir * 1000) / 1000) + ' – ' +
                     (isNaN(ustSinir) ? '…' : Math.round(ustSinir * 1000) / 1000) + br;
      return sonucla(true, 'Tolerans içinde (' + aralik + ')');
    }
    // Görsel / fonksiyon / yüzey: uygun-uygunsuz seçimi
    return sonucla(deger === 'uygun', '');
  }

  // ── Ölçüm kaydını sakla ───────────────────────────────────────────────────
  async function olcumKaydet(kayitlar) {
    if (!kayitlar.length) return;
    const tumu = await Store.olcumKayitlari.all();
    kayitlar.forEach(k => tumu.push(k));
    await App.persist(() => Store.olcumKayitlari.save(tumu));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OPERATÖR TERMİNALİ — KONTROL LİSTESİ PENCERESİ
  // Kalite onayı verilirken plan varsa bu pencere açılır. Tüm kritik maddeler
  // doldurulmadan onay verilemez; tolerans dışı değer girilirse onay yerine
  // uygunsuzluk yolu önerilir.
  // ══════════════════════════════════════════════════════════════════════════
  function kontrolPenceresiAc(baslik, maddeler, baglam, tamamlandi) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">
        Bu istasyonda <b>${maddeler.length} kontrol maddesi</b> tanımlı.
        Ölçtüğünüz değerleri girin — tolerans dışı değerler otomatik işaretlenir.
      </div>
      ${maddeler.map((m, i) => {
        const olcu = m.tip === 'olcu';
        const tolYazi = olcu
          ? `Hedef ${esc(m.hedefDeger || '—')} ${esc(m.birim || '')} · Tolerans ${esc(m.altTolerans ?? '—')} … ${esc(m.ustTolerans ?? '—')}`
          : esc(TIPLER[m.tip] || m.tip);
        return `
        <div class="kp-madde" data-i="${i}" style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
            <div style="font-size:12.5px;font-weight:700">
              ${m.kritik ? '<span class="pill pill-red" style="font-size:9px;margin-right:5px">KRİTİK</span>' : ''}
              ${esc(m.ozellik)}
            </div>
            <div class="muted" style="font-size:10.5px">${esc(m.alet || '')} · ${esc(SIKLIKLAR[m.siklik] || '')}</div>
          </div>
          <div class="muted" style="font-size:10.5px;margin:3px 0 7px">${tolYazi}</div>
          ${olcu
            ? `<input class="finput kp-deger" data-i="${i}" inputmode="decimal" placeholder="Ölçülen değer (${esc(m.birim || '')})" style="max-width:220px">`
            : `<div style="display:flex;gap:6px">
                 <button class="btn btn-sm kp-sec" data-i="${i}" data-d="uygun">✓ Uygun</button>
                 <button class="btn btn-sm kp-sec" data-i="${i}" data-d="uygunsuz" style="color:var(--red-text)">✗ Uygunsuz</button>
               </div>`}
          <div class="kp-geri" data-i="${i}" style="font-size:11px;margin-top:5px;min-height:14px"></div>
        </div>`;
      }).join('')}
      <div id="kp-ozet" style="font-size:12px;font-weight:700;margin-top:4px"></div>`;

    App.openModal({
      title: baslik, sub: 'Kalite kontrol planı — ' + esc(baglam.ymKod || ''),
      body, wide: true,
      footer: `<button class="btn" id="kp-vazgec">Vazgeç</button>
               <button class="btn btn-blue" id="kp-onayla">Kontrolü Tamamla</button>`
    });

    const secimler = maddeler.map(() => null);

    const degerlendirHepsi = () => {
      let dolu = 0, uygunsuz = 0;
      maddeler.forEach((m, i) => {
        const d = secimler[i];
        if (d === null || d === '') return;
        dolu++;
        const s = degerlendir(m, d);
        if (s.sonuc === 'uygunsuz') uygunsuz++;
        const geri = body.querySelector('.kp-geri[data-i="' + i + '"]');
        geri.textContent = (s.sonuc === 'uygun' ? '✓ ' : '✗ ') + (s.mesaj || (s.sonuc === 'uygun' ? 'Uygun' : 'Uygunsuz'));
        geri.style.color = s.sonuc === 'uygun' ? 'var(--green-text)' : 'var(--red-text)';
      });
      const ozet = document.getElementById('kp-ozet');
      if (uygunsuz > 0) {
        ozet.innerHTML = `<span style="color:var(--red-text)">⚠ ${uygunsuz} madde tolerans dışı — kalite onayı yerine uygunsuzluk kaydı açılmalı</span>`;
      } else if (dolu === maddeler.length) {
        ozet.innerHTML = `<span style="color:var(--green-text)">✓ Tüm kontroller uygun</span>`;
      } else {
        ozet.innerHTML = `<span class="muted">${dolu}/${maddeler.length} madde dolduruldu</span>`;
      }
      return { dolu, uygunsuz };
    };

    body.querySelectorAll('.kp-deger').forEach(inp => inp.oninput = () => {
      secimler[parseInt(inp.dataset.i, 10)] = inp.value;
      degerlendirHepsi();
    });
    body.querySelectorAll('.kp-sec').forEach(btn => btn.onclick = () => {
      const i = parseInt(btn.dataset.i, 10);
      secimler[i] = btn.dataset.d;
      body.querySelectorAll('.kp-sec[data-i="' + i + '"]').forEach(x => {
        x.classList.toggle('btn-blue', x === btn);
      });
      degerlendirHepsi();
    });

    document.getElementById('kp-vazgec').onclick = App.closeModal;
    document.getElementById('kp-onayla').onclick = async () => {
      const { dolu, uygunsuz } = degerlendirHepsi();
      // Kritik maddeler boş bırakılamaz
      const eksikKritik = maddeler.some((m, i) => m.kritik && (secimler[i] === null || secimler[i] === ''));
      if (eksikKritik) { App.toast('Kritik kontrol maddeleri boş bırakılamaz', 'err'); return; }
      if (dolu === 0) { App.toast('En az bir ölçüm girin', 'err'); return; }

      const zaman = new Date().toISOString();
      const kayitlar = maddeler.map((m, i) => {
        if (secimler[i] === null || secimler[i] === '') return null;
        const s = degerlendir(m, secimler[i]);
        return {
          id: App.uid('OLC'), planId: m.planId, maddeId: m.id, ozellik: m.ozellik,
          hedefKod: baglam.ymKod, hedefAd: baglam.ymAd, isId: baglam.isId,
          istasyonKod: baglam.istasyonKod, hat: baglam.hat,
          deger: secimler[i], birim: m.birim || '', sonuc: s.sonuc, not: s.mesaj,
          operator: baglam.operator, tarih: zaman.slice(0, 10), zaman
        };
      }).filter(Boolean);

      await olcumKaydet(kayitlar);
      App.closeModal();
      tamamlandi({ uygunsuz, kayitlar });
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // YÖNETİM — PLAN TANIMLAMA EKRANI (Kalite Kontrol → Kontrol Planı sekmesi)
  // ══════════════════════════════════════════════════════════════════════════
  async function planListesiCiz(el, yenile) {
    const [planlar, ymler, urunler] = await Promise.all([
      Store.kontrolPlanlari.all(), Store.yarimamuller.all(), Store.urunler.all()
    ]);
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div class="fhint" style="margin:0;max-width:560px">
          Her parça için <b>hangi istasyonda hangi özelliğin, hangi toleransla</b>
          kontrol edileceğini tanımlayın. Operatör kalite onayı verirken bu liste
          karşısına çıkar; tolerans dışı değer girerse onay yerine uygunsuzluk açılır.
        </div>
        <button class="btn btn-blue btn-sm" id="kp-yeni">+ Kontrol Planı Oluştur</button>
      </div>
      ${planlar.length ? `<table class="dtable" style="font-size:11.5px">
        <tr><th>Parça</th><th>Kontrol Maddesi</th><th>Kritik</th><th>Durum</th><th style="width:120px"></th></tr>
        ${planlar.map(p => `<tr>
          <td><b class="mono">${esc(p.hedefKod)}</b><div class="muted" style="font-size:10px">${esc(p.hedefAd || '')}</div></td>
          <td>${(p.maddeler || []).length} madde</td>
          <td>${(p.maddeler || []).filter(m => m.kritik).length}</td>
          <td>${p.aktif === false ? '<span class="pill pill-gray" style="font-size:9.5px">Pasif</span>' : '<span class="pill pill-green" style="font-size:9.5px">Aktif</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm kp-duzenle" data-id="${p.id}">✎ Düzenle</button>
            <button class="btn btn-sm kp-sil" data-id="${p.id}" style="color:var(--red-text)">🗑</button>
          </td></tr>`).join('')}
      </table>` : `<div class="empty-state"><div class="eicon">📋</div>
        <div class="etitle">Henüz kontrol planı yok</div>
        <div class="edesc">Kalite kusurlarının çoğu, neyin nasıl kontrol edileceğinin
        yazılı olmamasından kaynaklanır. En çok sorun yaşadığınız parçadan başlayın.</div></div>`}`;

    document.getElementById('kp-yeni').onclick = () => planFormu(null, ymler, urunler, yenile);
    el.querySelectorAll('.kp-duzenle').forEach(b => b.onclick = () =>
      planFormu(planlar.find(p => p.id === b.dataset.id), ymler, urunler, yenile));
    el.querySelectorAll('.kp-sil').forEach(b => b.onclick = async () => {
      const p = planlar.find(x => x.id === b.dataset.id);
      if (!p || !window.confirm(p.hedefKod + ' kontrol planı silinsin mi?')) return;
      await App.persist(() => Store.kontrolPlanlari.save(planlar.filter(x => x.id !== p.id)));
      App.toast('Kontrol planı silindi', 'ok');
      yenile();
    });
  }

  // ── Plan formu: parça seç + kontrol maddeleri ────────────────────────────
  function planFormu(plan, ymler, urunler, yenile) {
    const yeni = !plan;
    let maddeler = plan ? JSON.parse(JSON.stringify(plan.maddeler || [])) : [];
    const secenekler = [
      ...ymler.map(y => ({ tip: 'yarimamul', id: y.id, kod: y.kod, ad: y.ad })),
      ...urunler.map(u => ({ tip: 'urun', id: u.id, kod: u.kod, ad: u.ad }))
    ];

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Parça <span style="color:var(--red-text)">*</span></label>
        <select class="fselect" id="kpf-hedef" ${yeni ? '' : 'disabled'}>
          <option value="">— Seçiniz —</option>
          ${secenekler.map(s => `<option value="${s.tip}|${s.id}" ${plan && plan.hedefId === s.id ? 'selected' : ''}>
            ${esc(s.kod)} — ${esc(s.ad)}</option>`).join('')}
        </select></div>
      <div class="fgroup"><label class="flbl">Durum</label>
        <select class="fselect" id="kpf-aktif">
          <option value="1" ${!plan || plan.aktif !== false ? 'selected' : ''}>Aktif — operatöre gösterilir</option>
          <option value="0" ${plan && plan.aktif === false ? 'selected' : ''}>Pasif</option>
        </select></div>
      <div class="hr"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="flbl" style="margin:0">Kontrol Maddeleri</div>
        <button class="btn btn-sm btn-blue" id="kpf-madde-ekle">+ Madde Ekle</button>
      </div>
      <div id="kpf-maddeler"></div>
      <div id="kpf-hata" style="color:var(--red-text);font-size:12px;min-height:16px"></div>`;

    App.openModal({
      title: yeni ? 'Yeni Kontrol Planı' : 'Kontrol Planı — ' + esc(plan.hedefKod),
      body, wide: true,
      footer: `<button class="btn" id="kpf-vazgec">Vazgeç</button>
               <button class="btn btn-blue" id="kpf-kaydet">Kaydet</button>`
    });

    const maddeCiz = () => {
      const w = document.getElementById('kpf-maddeler');
      if (!maddeler.length) {
        w.innerHTML = '<div class="muted" style="font-size:11.5px;padding:8px 0">Henüz madde yok. En az bir kontrol maddesi ekleyin.</div>';
        return;
      }
      w.innerHTML = maddeler.map((m, i) => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div class="fgroup" style="flex:2;min-width:160px;margin-bottom:6px">
              <label class="flbl">Kontrol Edilecek Özellik</label>
              <input class="finput kpf-i" data-i="${i}" data-k="ozellik" value="${esc(m.ozellik || '')}" placeholder="örn. Net boy ölçüsü"></div>
            <div class="fgroup" style="flex:1;min-width:130px;margin-bottom:6px">
              <label class="flbl">Kontrol Tipi</label>
              <select class="fselect kpf-i" data-i="${i}" data-k="tip">
                ${Object.entries(TIPLER).map(([k, v]) => `<option value="${k}" ${m.tip === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select></div>
            <div class="fgroup" style="flex:1;min-width:110px;margin-bottom:6px">
              <label class="flbl">İstasyon Kodu</label>
              <input class="finput kpf-i" data-i="${i}" data-k="istasyonKod" value="${esc(m.istasyonKod || '')}" placeholder="boş = tümü"></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div class="fgroup" style="flex:1;min-width:90px;margin-bottom:6px">
              <label class="flbl">Hedef Değer</label>
              <input class="finput kpf-i" data-i="${i}" data-k="hedefDeger" value="${esc(m.hedefDeger ?? '')}"></div>
            <div class="fgroup" style="flex:1;min-width:80px;margin-bottom:6px">
              <label class="flbl">Alt Tolerans</label>
              <input class="finput kpf-i" data-i="${i}" data-k="altTolerans" value="${esc(m.altTolerans ?? '')}"></div>
            <div class="fgroup" style="flex:1;min-width:80px;margin-bottom:6px">
              <label class="flbl">Üst Tolerans</label>
              <input class="finput kpf-i" data-i="${i}" data-k="ustTolerans" value="${esc(m.ustTolerans ?? '')}"></div>
            <div class="fgroup" style="flex:1;min-width:70px;margin-bottom:6px">
              <label class="flbl">Birim</label>
              <input class="finput kpf-i" data-i="${i}" data-k="birim" value="${esc(m.birim || '')}" placeholder="mm"></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div class="fgroup" style="flex:1;min-width:130px;margin-bottom:0">
              <label class="flbl">Ölçüm Aleti</label>
              <select class="fselect kpf-i" data-i="${i}" data-k="alet">
                ${ALETLER.map(a => `<option ${m.alet === a ? 'selected' : ''}>${a}</option>`).join('')}
              </select></div>
            <div class="fgroup" style="flex:1;min-width:150px;margin-bottom:0">
              <label class="flbl">Kontrol Sıklığı</label>
              <select class="fselect kpf-i" data-i="${i}" data-k="siklik">
                ${Object.entries(SIKLIKLAR).map(([k, v]) => `<option value="${k}" ${m.siklik === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select></div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;padding-bottom:8px;cursor:pointer">
              <input type="checkbox" class="kpf-i" data-i="${i}" data-k="kritik" ${m.kritik ? 'checked' : ''}> Kritik</label>
            <button class="btn btn-sm kpf-madde-sil" data-i="${i}" style="color:var(--red-text);margin-bottom:6px">🗑</button>
          </div>
        </div>`).join('');

      w.querySelectorAll('.kpf-i').forEach(inp => {
        const olay = inp.type === 'checkbox' ? 'onchange' : 'oninput';
        inp[olay] = () => {
          const i = parseInt(inp.dataset.i, 10), k = inp.dataset.k;
          maddeler[i][k] = inp.type === 'checkbox' ? inp.checked : inp.value;
        };
      });
      w.querySelectorAll('.kpf-madde-sil').forEach(b => b.onclick = () => {
        maddeler.splice(parseInt(b.dataset.i, 10), 1);
        maddeCiz();
      });
    };
    maddeCiz();

    document.getElementById('kpf-madde-ekle').onclick = () => {
      maddeler.push({ id: App.uid('KPM'), ozellik: '', tip: 'olcu', istasyonKod: '',
        hedefDeger: '', altTolerans: '', ustTolerans: '', birim: 'mm',
        alet: 'Kumpas', siklik: 'her_parca', kritik: false });
      maddeCiz();
    };
    document.getElementById('kpf-vazgec').onclick = () => { App.closeModal(); yenile(); };
    document.getElementById('kpf-kaydet').onclick = async () => {
      const hata = document.getElementById('kpf-hata');
      hata.textContent = '';
      const hedefSec = document.getElementById('kpf-hedef').value;
      if (yeni && !hedefSec) { hata.textContent = 'Parça seçin'; return; }
      if (!maddeler.length) { hata.textContent = 'En az bir kontrol maddesi ekleyin'; return; }
      if (maddeler.some(m => !String(m.ozellik || '').trim())) {
        hata.textContent = 'Her maddenin "kontrol edilecek özellik" alanı dolu olmalı'; return;
      }
      const planlar = await Store.kontrolPlanlari.all();
      if (yeni) {
        const [tip, id] = hedefSec.split('|');
        const kaynak = secenekler.find(s => s.id === id);
        if (planlar.some(p => p.hedefId === id)) {
          hata.textContent = 'Bu parça için zaten bir kontrol planı var — listeden düzenleyin'; return;
        }
        planlar.push({
          id: App.uid('KPL'), hedefTip: tip, hedefId: id,
          hedefKod: kaynak ? kaynak.kod : '', hedefAd: kaynak ? kaynak.ad : '',
          aktif: document.getElementById('kpf-aktif').value === '1',
          maddeler, olusturma: new Date().toISOString().slice(0, 10)
        });
      } else {
        const k = planlar.find(p => p.id === plan.id);
        if (k) {
          k.maddeler = maddeler;
          k.aktif = document.getElementById('kpf-aktif').value === '1';
          k.guncelleme = new Date().toISOString().slice(0, 10);
        }
      }
      await App.persist(() => Store.kontrolPlanlari.save(planlar));
      App.toast('Kontrol planı kaydedildi', 'ok');
      App.closeModal();
      yenile();
    };
  }

  // ── Ölçüm kayıtları listesi (kalite panelinde rapor sekmesi) ─────────────
  async function olcumRaporuCiz(el) {
    const kayitlar = (await Store.olcumKayitlari.all()).slice().reverse();
    const uygunsuz = kayitlar.filter(k => k.sonuc === 'uygunsuz');
    // En sık uygunsuzluk veren özellikler — kök neden için başlangıç noktası
    const sayac = {};
    uygunsuz.forEach(k => { sayac[k.ozellik] = (sayac[k.ozellik] || 0) + 1; });
    const sirali = Object.entries(sayac).sort((a, b) => b[1] - a[1]).slice(0, 6);

    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div class="stat-card"><div class="slabel">TOPLAM ÖLÇÜM</div><div class="svalue">${kayitlar.length}</div></div>
        <div class="stat-card"><div class="slabel">UYGUNSUZ</div><div class="svalue" style="color:var(--red-text)">${uygunsuz.length}</div></div>
        <div class="stat-card"><div class="slabel">UYGUNSUZLUK ORANI</div><div class="svalue">${kayitlar.length ? (uygunsuz.length / kayitlar.length * 100).toFixed(1) : '0,0'}%</div></div>
      </div>
      ${sirali.length ? `<div class="card-title" style="font-size:12px;margin-bottom:6px">EN SIK UYGUNSUZLUK VEREN ÖZELLİKLER</div>
      <table class="dtable" style="font-size:11.5px;margin-bottom:14px">
        <tr><th>Özellik</th><th>Uygunsuz Sayısı</th></tr>
        ${sirali.map(([o, s]) => `<tr><td>${esc(o)}</td><td><b>${s}</b></td></tr>`).join('')}
      </table>` : ''}
      <div class="card-title" style="font-size:12px;margin-bottom:6px">SON ÖLÇÜMLER</div>
      ${kayitlar.length ? `<table class="dtable" style="font-size:11.5px">
        <tr><th>Tarih</th><th>Parça</th><th>İstasyon</th><th>Özellik</th><th>Değer</th><th>Sonuç</th><th>Operatör</th></tr>
        ${kayitlar.slice(0, 60).map(k => `<tr>
          <td>${esc(k.tarih)}</td>
          <td class="mono">${esc(k.hedefKod || '')}</td>
          <td>${esc(k.istasyonKod || '')}</td>
          <td>${esc(k.ozellik)}</td>
          <td>${esc(k.deger)} ${esc(k.birim || '')}</td>
          <td>${k.sonuc === 'uygun'
            ? '<span class="pill pill-green" style="font-size:9.5px">Uygun</span>'
            : '<span class="pill pill-red" style="font-size:9.5px">Uygunsuz</span>'}</td>
          <td>${esc(k.operator || '')}</td></tr>`).join('')}
      </table>` : `<div class="empty-state"><div class="eicon">📏</div>
        <div class="etitle">Henüz ölçüm kaydı yok</div>
        <div class="edesc">Kontrol planı tanımlanmış parçalar için operatör kalite onayı
        verdiğinde ölçümler burada birikir ve kök neden analizinin ham verisi olur.</div></div>`}`;
  }

  return { maddeleriGetir, degerlendir, kontrolPenceresiAc, planListesiCiz, olcumRaporuCiz, TIPLER, SIKLIKLAR };
})();
