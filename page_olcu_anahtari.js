// ════════════════════════════════════════════════════════════════════════════
// ÖLÇÜ EŞLEŞTİRME ANAHTARI — "Reçete Tamamlama Botu"nun (olcu_varyant_motoru.js)
// kullandığı aile/ölçü eşleştirmesini YÖNETMEK için ekran.
// ────────────────────────────────────────────────────────────────────────────
// Renk Eşleştirme Anahtarı'nın ölçü karşılığı. Her KAYIT bir "aile" (ör.
// "Alinda 60/80 Serisi", "D20.LD Serisi", "Standart Dolap (STD)") ve o
// ailedeki her ölçünün KOD İÇİNDE (herhangi bir konumda, nokta-sınırlı bir
// son ek DEĞİL) nasıl yazıldığını tutar — ör. {olcu:60,kodParcasi:'0060'}.
// Kayıtlı olmayan bir token motor tarafından ASLA tahmin EDİLMEZ.
// ════════════════════════════════════════════════════════════════════════════
PageModules.olcu_anahtari = (() => {
  const ROLLER = ['admin', 'arge', 'teknik_ofis', 'yonetim'];

  async function render(main, params) {
    const rol = App.aktifRol();
    if (!ROLLER.includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE, Teknik Ofis ve Yönetim tarafından kullanılır.</div></div></div>`;
      return;
    }

    const aileler = await Store.olcuEslestirmeAnahtari.all();
    aileler.sort((a, b) => (a.aileAdi || '').localeCompare(b.aileAdi || ''));

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">📏 Ölçü Eşleştirme Anahtarı</div>
          <div class="page-sub">Reçete Tamamlama Botu'nun, bir parçanın kodundan ölçüsünü tanıyıp kardeş ölçüleri türetirken kullandığı eşleştirmeyi yönetin</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="oa-yeni-aile">+ Yeni Aile Tanımla</button></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="fhint">
          <b>Nasıl çalışır:</b> Bir "aile" (ör. "Alinda 60/80 Serisi"), o ailedeki her ölçünün KOD İÇİNDE nasıl
          yazıldığını listeler. Örnek: <code>YM.AD006010.03.VV</code> kodu "0060" parçasını taşıdığından 60cm'e,
          <code>YM.AD008010.03.NG</code> "0080" taşıdığından 80cm'e ait sayılır. Parça kodun HERHANGİ bir yerinde
          geçebilir (son ek olması gerekmez). Kayıtlı olmayan bir ölçü/aile ASLA tahmin edilmez.
        </div>
      </div>
      <div id="oa-liste"></div>
    `;

    function aileKartiHtml(aile) {
      const satirlar = (aile.olculer || []).map((o, i) => `
        <tr>
          <td>${App.escapeHtml(String(o.olcu))}</td>
          <td class="mono">${App.escapeHtml(o.kodParcasi)}</td>
          <td class="r"><button class="btn btn-sm btn-red oa-olcu-sil" data-aile="${aile.id}" data-i="${i}">Sil</button></td>
        </tr>`).join('');
      return `
        <div class="card" style="margin-bottom:12px" data-aile-id="${aile.id}">
          <div class="flex-between" style="margin-bottom:8px">
            <div class="flbl" style="font-size:13px">${App.escapeHtml(aile.aileAdi)}</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm oa-olcu-ekle" data-aile="${aile.id}">+ Ölçü Ekle</button>
              <button class="btn btn-sm btn-red oa-aile-sil" data-aile="${aile.id}">Aileyi Sil</button>
            </div>
          </div>
          <table class="dtable" style="font-size:12px">
            <tr><th>Ölçü</th><th>Kod Parçası</th><th></th></tr>
            ${satirlar || '<tr><td colspan="3" class="muted">Henüz ölçü eklenmedi</td></tr>'}
          </table>
        </div>`;
    }

    function listeyiCiz() {
      const liste = document.getElementById('oa-liste');
      if (!aileler.length) {
        liste.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
          <div class="eicon">📏</div><div class="etitle">Henüz hiç aile tanımlanmadı</div>
          <div class="edesc">"+ Yeni Aile Tanımla" ile başlayın.</div></div></div>`;
        return;
      }
      liste.innerHTML = aileler.map(aileKartiHtml).join('');
      liste.querySelectorAll('.oa-olcu-ekle').forEach(b => b.onclick = () => olcuEkleModal(b.dataset.aile));
      liste.querySelectorAll('.oa-olcu-sil').forEach(b => b.onclick = () => olcuSil(b.dataset.aile, parseInt(b.dataset.i)));
      liste.querySelectorAll('.oa-aile-sil').forEach(b => b.onclick = () => aileSil(b.dataset.aile));
    }

    async function kaydet(aile) {
      await App.persist(() => Store.olcuEslestirmeAnahtari.upsert(aile));
    }

    function yeniAileModal() {
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fgroup"><label class="flbl">Aile Adı</label>
          <input class="finput" id="oa-aile-ad" placeholder="ör. Alinda 60/80 Serisi"></div>
        <div class="fhint">Bu sadece sizin tanımanız için bir etikettir — kod eşleştirmesini etkilemez.</div>
      `;
      App.openModal({
        title: 'Yeni Ölçü Ailesi', body,
        footer: `<button class="btn" id="oa-vazgec">Vazgeç</button><button class="btn btn-green" id="oa-kaydet">Oluştur</button>`
      });
      document.getElementById('oa-vazgec').onclick = App.closeModal;
      document.getElementById('oa-kaydet').onclick = async () => {
        const ad = document.getElementById('oa-aile-ad').value.trim();
        if (!ad) { App.toast('Aile adı zorunlu', 'err'); return; }
        const yeni = { id: App.uid('OEA'), aileAdi: ad, olculer: [] };
        await kaydet(yeni);
        aileler.push(yeni);
        App.closeModal();
        listeyiCiz();
      };
    }

    function olcuEkleModal(aileId) {
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="frow">
          <div class="fgroup"><label class="flbl">Ölçü</label>
            <input class="finput" id="oa-olcu-deger" placeholder="ör. 60"></div>
          <div class="fgroup"><label class="flbl">Kod Parçası</label>
            <input class="finput mono" id="oa-olcu-kod" placeholder="ör. 0060"></div>
        </div>
        <div class="fhint">Kod parçası, bu ölçüdeki kartların kodunda GEÇEN tam metindir (büyük/küçük harf duyarlı,
          boşluksuz). Örnek: "YM.AD006010.03.VV" kodu için kod parçası "0060"dır.</div>
      `;
      App.openModal({
        title: 'Ölçü Ekle', body,
        footer: `<button class="btn" id="oa-vazgec">Vazgeç</button><button class="btn btn-green" id="oa-kaydet">Ekle</button>`
      });
      document.getElementById('oa-vazgec').onclick = App.closeModal;
      document.getElementById('oa-kaydet').onclick = async () => {
        const deger = document.getElementById('oa-olcu-deger').value.trim();
        const kodParcasi = document.getElementById('oa-olcu-kod').value.trim();
        if (!deger || !kodParcasi) { App.toast('Ölçü ve kod parçası zorunlu', 'err'); return; }
        const aile = aileler.find(a => a.id === aileId);
        if (!aile.olculer) aile.olculer = [];
        if (aile.olculer.some(o => String(o.olcu) === deger)) { App.toast('Bu ölçü zaten tanımlı', 'err'); return; }
        if (aile.olculer.some(o => o.kodParcasi === kodParcasi)) { App.toast('Bu kod parçası zaten başka bir ölçüde kullanılıyor', 'err'); return; }
        aile.olculer.push({ olcu: deger, kodParcasi });
        await kaydet(aile);
        App.closeModal();
        listeyiCiz();
      };
    }

    async function olcuSil(aileId, i) {
      const aile = aileler.find(a => a.id === aileId);
      aile.olculer.splice(i, 1);
      await kaydet(aile);
      listeyiCiz();
    }

    async function aileSil(aileId) {
      App.confirmDialog('Bu ölçü ailesini silmek istediğinize emin misiniz?', async () => {
        await App.persist(() => Store.olcuEslestirmeAnahtari.remove(aileId));
        const idx = aileler.findIndex(a => a.id === aileId);
        if (idx >= 0) aileler.splice(idx, 1);
        listeyiCiz();
      });
    }

    document.getElementById('oa-yeni-aile').onclick = yeniAileModal;
    listeyiCiz();
  }

  return { render };
})();
