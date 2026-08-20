// ════════════════════════════════════════════════════════════════════════════
// ROTA ŞABLONLARI
//
// Boş ekrandan rota kurmak zordur; hazır bir akışı düzenlemek kolaydır.
// Bu modül panel mobilya üretiminin tipik akışlarını şablon olarak sunar.
//
// ÖNEMLİ TASARIM KARARI: şablonlar uydurma istasyon kodu içermez. Her adım
// bir İŞLEM TÜRÜ (ebatlama, bantlama, delik, montaj…) ve o işlemin hangi
// MAKİNE GRUBUNDA yapıldığının ipucunu taşır. Şablon kurulurken sistem,
// fabrikanın kendi tanımlı hat/makine listesinden eşleşenleri bulur ve
// kullanıcıya seçtirir. Böylece şablon her fabrikaya uyar.
//
// Kurulan rota bir başlangıçtır — süreler ve adımlar sonradan düzenlenir.
// ════════════════════════════════════════════════════════════════════════════
const RotaSablon = (() => {

  const esc = (s) => (window.App ? App.escapeHtml(s) : String(s == null ? '' : s));

  // ── ŞABLONLAR ────────────────────────────────────────────────────────────
  // grupIpucu: makine grubu adında aranacak anahtar kelimeler (öncelik sırası)
  const SABLONLAR = [
    {
      id: 'panel_tam', ad: 'Panel Parça — Tam Akış',
      aciklama: 'Bantlı ve delikli panel parçalar (masa tablası, dolap yan panosu, raf). En yaygın akış.',
      adimlar: [
        { islem: 'Ebatlama / Kesim', grupIpucu: ['PANEL EBATLAMA', 'DAİRE TESTERE'], dk: 6 },
        { islem: 'Kenar bantlama', grupIpucu: ['KENAR BANTLAMA'], dk: 5 },
        { islem: 'Delik / kanal', grupIpucu: ['DELİK MAKİNELERİ', 'CNC İŞLEM'], dk: 4 },
        { islem: 'Zımpara / temizlik', grupIpucu: ['ZIMPARA VE YÜZEY'], dk: 3 },
        { islem: 'Paketleme', grupIpucu: ['KOLİ ÜRETİM', 'DİĞER ÜRETİM'], dk: 4 }
      ]
    },
    {
      id: 'panel_sade', ad: 'Panel Parça — Sade (bantsız iç parça)',
      aciklama: 'Görünmeyen iç parçalar: arkalık, iç bölme, kasa parçası. Bantlama yok.',
      adimlar: [
        { islem: 'Ebatlama / Kesim', grupIpucu: ['PANEL EBATLAMA', 'DAİRE TESTERE'], dk: 5 },
        { islem: 'Delik / kanal', grupIpucu: ['DELİK MAKİNELERİ'], dk: 3 }
      ]
    },
    {
      id: 'cnc_sekil', ad: 'CNC Şekillendirme',
      aciklama: 'Düz kesimle yapılamayan formlu parçalar: oval tabla, kavisli kenar, gömme yuva.',
      adimlar: [
        { islem: 'Ebatlama / Kesim', grupIpucu: ['PANEL EBATLAMA', 'DAİRE TESTERE'], dk: 5 },
        { islem: 'CNC şekillendirme', grupIpucu: ['CNC İŞLEM'], dk: 12 },
        { islem: 'Kenar bantlama', grupIpucu: ['KENAR BANTLAMA'], dk: 6 },
        { islem: 'Zımpara / temizlik', grupIpucu: ['ZIMPARA VE YÜZEY'], dk: 4 }
      ]
    },
    {
      id: 'boyali', ad: 'Boyalı Yüzey (MDF lake)',
      aciklama: 'Boyanacak parçalar: kapak, ön panel, dekoratif yüzey. Kurutma süresi dahildir.',
      adimlar: [
        { islem: 'Ebatlama / Kesim', grupIpucu: ['PANEL EBATLAMA', 'DAİRE TESTERE'], dk: 6 },
        { islem: 'CNC şekillendirme', grupIpucu: ['CNC İŞLEM', 'FREZE'], dk: 8 },
        { islem: 'Zımpara (astar öncesi)', grupIpucu: ['ZIMPARA VE YÜZEY'], dk: 6 },
        { islem: 'Boya / astar', grupIpucu: ['BOYA KABİNLERİ', 'UV BOYA'], dk: 10 },
        { islem: 'Kurutma', grupIpucu: ['KURUTMA KABİNLERİ'], dk: 45 }
      ]
    },
    {
      id: 'metal', ad: 'Metal Konstrüksiyon (ayak / iskelet)',
      aciklama: 'Masa ayağı, metal kasa, iskelet. Toz boya ve fırın dahil.',
      adimlar: [
        { islem: 'Sac kesme', grupIpucu: ['SAC KESME'], dk: 5 },
        { islem: 'Büküm', grupIpucu: ['SAC BÜKME'], dk: 6 },
        { islem: 'Kaynak', grupIpucu: ['KAYNAK ROBOTLARI', 'KAYNAK MAKİNELERİ'], dk: 12 },
        { islem: 'Taşlama / temizlik', grupIpucu: ['TAŞLAMA', 'ZIMPARA VE YÜZEY'], dk: 6 },
        { islem: 'Toz boya', grupIpucu: ['TOZ BOYA KABİNLERİ', 'TOZ BOYA SİSTEMLERİ'], dk: 8 },
        { islem: 'Fırın', grupIpucu: ['TOZ BOYA FIRINLARI'], dk: 30 }
      ]
    },
    {
      id: 'montaj_paket', ad: 'Montaj + Paketleme',
      aciklama: 'Yalnız birleştirme ve koli aşaması. Bitmiş ürün kartları için uygundur.',
      adimlar: [
        { islem: 'Montaj', grupIpucu: ['PRESLER', 'MATKAPLAR', 'DİĞER ÜRETİM'], dk: 18 },
        { islem: 'Paketleme', grupIpucu: ['KOLİ ÜRETİM', 'DİĞER ÜRETİM'], dk: 8 }
      ]
    }
  ];

  // ── Fabrikanın kendi hat/makine listesinden aday istasyonlar bul ─────────
  function adaylariBul(hatlar, grupIpucu) {
    const adaylar = [];
    Object.entries(hatlar || {}).forEach(([hat, makinalar]) => {
      (makinalar || []).forEach(m => {
        const grup = (m.grup || '').toLocaleUpperCase('tr');
        const puan = grupIpucu.findIndex(ip => grup.includes(ip.toLocaleUpperCase('tr')));
        if (puan >= 0) adaylar.push({ hat, kod: m.kod, tanim: m.tanim, grup: m.grup, puan });
      });
    });
    // İpucu sırasına göre (ilk ipucu en güçlü), sonra hat adına göre
    return adaylar.sort((a, b) => a.puan - b.puan || a.hat.localeCompare(b.hat, 'tr'));
  }

  // ── ŞABLON LİSTESİ PENCERESİ ─────────────────────────────────────────────
  async function ac(yenile) {
    let hatlar = {};
    try { hatlar = await Store.hatlarGetir(); } catch (e) { hatlar = {}; }
    const hatSayisi = Object.keys(hatlar).length;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:12px">
        Şablonlar panel mobilya üretiminin tipik akışlarıdır. Seçtiğinizde her adım için
        <b>sizin makine listenizden</b> uygun istasyonlar önerilir; onaylayıp rotayı
        kurarsınız. Süreler başlangıç değeridir — gerçekleşen sürelerle sonradan düzeltirsiniz.
        ${hatSayisi ? '' : '<br><b style="color:var(--red-text)">Uyarı: tanımlı hat/makine bulunamadı. Şablon kurulabilir ama istasyon eşleşmesi boş gelir.</b>'}
      </div>
      ${SABLONLAR.map(s => {
        const eslesme = s.adimlar.map(a => adaylariBul(hatlar, a.grupIpucu).length);
        const eksik = eslesme.filter(n => n === 0).length;
        const toplamDk = s.adimlar.reduce((t, a) => t + a.dk, 0);
        return `
        <div style="border:1px solid var(--border);border-radius:11px;padding:11px 13px;margin-bottom:9px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <b style="font-size:12.5px">${esc(s.ad)}</b>
              <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(s.aciklama)}</div>
            </div>
            <button class="btn btn-sm btn-blue rs-kur" data-id="${s.id}">Bu Şablonu Kur →</button>
          </div>
          <div style="font-size:10.5px;color:var(--text3);margin-top:7px">
            ${s.adimlar.map(a => esc(a.islem)).join(' → ')}
            · <b>${s.adimlar.length} adım · ${toplamDk} dk</b>
            ${eksik ? ` · <span style="color:var(--amber-text)">${eksik} adım için makine eşleşmedi</span>` : ''}
          </div>
        </div>`;
      }).join('')}`;

    App.openModal({
      title: '📐 Rota Şablonları', body, wide: true,
      footer: `<button class="btn" id="rs-kapat">Kapat</button>`
    });
    document.getElementById('rs-kapat').onclick = App.closeModal;
    body.querySelectorAll('.rs-kur').forEach(b => b.onclick = () => {
      const s = SABLONLAR.find(x => x.id === b.dataset.id);
      if (s) kurulumPenceresi(s, hatlar, yenile);
    });
  }

  // ── ADIM EŞLEŞTİRME VE KURULUM ───────────────────────────────────────────
  function kurulumPenceresi(sablon, hatlar, yenile) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">
        Her adım için istasyon ve süre onaylayın. Boş bırakılan adım rotaya eklenmez.
      </div>
      <div class="fgroup"><label class="flbl">Rota Kodu <span style="color:var(--red-text)">*</span></label>
        <input class="finput" id="rs-kod" value="${esc('RT-' + sablon.id.toUpperCase())}"></div>
      <div class="fgroup"><label class="flbl">Rota Adı <span style="color:var(--red-text)">*</span></label>
        <input class="finput" id="rs-ad" value="${esc(sablon.ad)}"></div>

      <div class="card-title" style="font-size:11.5px;margin:12px 0 6px">ADIMLAR</div>
      ${sablon.adimlar.map((a, i) => {
        const adaylar = adaylariBul(hatlar, a.grupIpucu);
        return `
        <div style="border:1px solid var(--border);border-radius:10px;padding:9px 11px;margin-bottom:7px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
            <b style="font-size:11.5px">${i + 1}. ${esc(a.islem)}</b>
            ${adaylar.length ? `<span class="muted" style="font-size:10px">${adaylar.length} uygun makine</span>`
              : '<span class="pill pill-amber" style="font-size:9px">makine bulunamadı</span>'}
          </div>
          <div style="display:flex;gap:7px;flex-wrap:wrap">
            <select class="fselect rs-ist" data-i="${i}" style="flex:3;min-width:200px;font-size:11.5px">
              <option value="">— bu adımı atla —</option>
              ${adaylar.map(ad => `<option value="${esc(ad.hat)}|${esc(ad.kod)}|${esc(ad.tanim)}">
                ${esc(ad.hat)} · ${esc(ad.kod)} — ${esc((ad.tanim || '').slice(0, 40))}</option>`).join('')}
            </select>
            <input class="finput rs-dk" data-i="${i}" type="number" min="0" step="0.5" value="${a.dk}"
                   style="flex:1;min-width:74px;text-align:right" title="dakika">
          </div>
        </div>`;
      }).join('')}
      <div id="rs-hata" style="color:var(--red-text);font-size:12px;min-height:16px;margin-top:4px"></div>`;

    App.openModal({
      title: '📐 Şablonu Kur — ' + sablon.ad, body, wide: true,
      footer: `<button class="btn" id="rs-vaz">Geri</button><button class="btn btn-blue" id="rs-olustur">Rotayı Oluştur</button>`
    });
    document.getElementById('rs-vaz').onclick = () => { App.closeModal(); ac(yenile); };

    document.getElementById('rs-olustur').onclick = async () => {
      const kod = document.getElementById('rs-kod').value.trim();
      const ad = document.getElementById('rs-ad').value.trim();
      const hata = document.getElementById('rs-hata');
      hata.textContent = '';
      if (!kod || !ad) { hata.textContent = 'Rota kodu ve adı zorunlu'; return; }

      const steps = [];
      let uid = 0;
      body.querySelectorAll('.rs-ist').forEach(sel => {
        if (!sel.value) return;
        const i = parseInt(sel.dataset.i, 10);
        const [hat, mkod, mtanim] = sel.value.split('|');
        const dk = parseFloat(body.querySelector(`.rs-dk[data-i="${i}"]`).value) || 0;
        steps.push({ uid: ++uid, hat, kod: mkod, tanim: mtanim, dk });
      });
      if (!steps.length) { hata.textContent = 'En az bir adım seçin'; return; }

      const rotalar = await Store.rotalar.all();
      if (rotalar.some(r => (r.kod || '').toLocaleLowerCase('tr') === kod.toLocaleLowerCase('tr'))) {
        hata.textContent = 'Bu rota kodu zaten var — farklı bir kod girin';
        return;
      }
      const dkUcreti = ((App.state.ayarlar && App.state.ayarlar.saatlikIscilikUcreti) || 0) / 60;
      rotalar.push({
        id: App.uid('RT'), kod, ad, tip: 'uretim',
        steps,
        toplamSureDk: steps.reduce((t, s) => t + s.dk, 0),
        toplamMaliyet: steps.reduce((t, s) => t + s.dk * dkUcreti, 0),
        sablonId: sablon.id,
        olusturmaTarihi: new Date().toISOString().slice(0, 10)
      });
      await App.persist(() => Store.rotalar.save(rotalar));
      App.closeModal();
      App.toast('✓ "' + ad + '" rotası oluşturuldu — ' + steps.length + ' adım. Şimdi ⇉ Toplu Rota Ata ile kartlara dağıtabilirsiniz.', 'ok');
      if (yenile) yenile();
    };
  }

  return { ac, SABLONLAR, adaylariBul };
})();
