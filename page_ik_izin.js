// ════════════════════════════════════════════════════════════════════════════
// İK — İZİN TAKİBİ — yıllara göre personel bazlı yıllık izin günü kullanımı,
// hak edilen/kullanılan/kalan gün takibi, mazeret/rapor izinleri.
// ════════════════════════════════════════════════════════════════════════════
PageModules.ik_izin = (() => {
  let seciliYil = new Date().getFullYear().toString();
  let seciliPersonelId = '';

  function yillikIzinHakki(kidemYili) {
    if (kidemYili < 1) return 0;
    if (kidemYili <= 5) return 14;
    if (kidemYili < 15) return 20;
    return 26;
  }

  // BULGU (T3-34): kıdem hesaplaması her zaman BUGÜNE göre yapılıyordu —
  // geçmiş bir yıl seçilse bile kıdem (ve dolayısıyla hak edilen izin)
  // GÜNCEL tarihe göre hesaplanıyor, geçmiş yıllar için OLDUĞUNDAN FAZLA
  // kıdem/hak gösteriliyordu. Artık: içinde bulunulan (veya gelecek) yıl
  // için "bugün", GEÇMİŞ bir yıl için o yılın SON GÜNÜ referans alınır —
  // böylece "2023 yılında kaç gün hakkı vardı" sorusu doğru cevaplanır.
  function referansTarihHesapla(yil) {
    const buYil = new Date().getFullYear();
    const yilSayi = parseInt(yil, 10);
    if (!yilSayi || yilSayi >= buYil) return new Date();
    return new Date(yilSayi + '-12-31T00:00:00');
  }

  function kidemVeHakEdilenHesapla(personel, yil) {
    const iseGiris = new Date(personel.iseGirisTarihi);
    const referans = referansTarihHesapla(yil);
    const kidemYili = Math.floor((referans - iseGiris) / (365.25 * 86400000));
    return { kidemYili, hakEdilen: yillikIzinHakki(kidemYili) };
  }

  // Bir personelin BELİRLİ bir yıldaki yıllık izin bakiyesi (hak edilen -
  // o yıl kullanılan). openIzinForm'daki negatif bakiye kontrolü ve
  // renderOzetTablo AYNI mantığı kullanır (tutarlılık için).
  function yillikIzinBakiyesi(personel, yil, izinKayitlari, haricKayitId) {
    const { hakEdilen } = kidemVeHakEdilenHesapla(personel, yil);
    const kullanilan = izinKayitlari
      .filter(k => k.personelId === personel.id && k.izinTipi === 'yillik' && (k.baslangic || '').startsWith(yil) && k.id !== haricKayitId)
      .reduce((a, k) => a + (k.gunSayisi || 0), 0);
    return hakEdilen - kullanilan;
  }

  async function render(main) {
    const [personeller, izinKayitlari] = await Promise.all([Store.personeller.all(), Store.izinKayitlari.all()]);
    const aktifPersonel = personeller.filter(p => p.durum === 'aktif');

    const yillar = [];
    const buYil = new Date().getFullYear();
    for (let y = buYil; y >= buYil - 5; y--) yillar.push(y.toString());

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">İzin Takibi</div><div class="page-sub">Yıllara göre personel bazlı izin günü kullanımı</div></div>
        <div class="page-acts"><button class="btn btn-blue" id="iki-new">+ İzin Kaydı Ekle</button></div>
      </div>

      <div class="card">
        <div class="frow">
          <div class="fgroup"><label class="flbl">Yıl</label>
            <select class="fselect" id="iki-yil-secim">
              ${yillar.map(y => `<option value="${y}" ${seciliYil === y ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>
          <div class="fgroup"><label class="flbl">Personel (opsiyonel filtre)</label>
            <select class="fselect" id="iki-personel-secim">
              <option value="">Tüm Personel</option>
              ${aktifPersonel.map(p => `<option value="${p.id}" ${seciliPersonelId === p.id ? 'selected' : ''}>${App.escapeHtml(p.adSoyad)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">${seciliYil} Yılı İzin Durumu</div></div>
        <div id="iki-tablo"></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">İzin Kayıtları (${seciliYil})</div></div>
        <div id="iki-kayitlar"></div>
      </div>
    `;

    document.getElementById('iki-yil-secim').onchange = (e) => { seciliYil = e.target.value; render(main); };
    document.getElementById('iki-personel-secim').onchange = (e) => { seciliPersonelId = e.target.value; render(main); };
    document.getElementById('iki-new').onclick = () => openIzinForm(aktifPersonel, izinKayitlari, () => render(main));

    const filtreliPersonel = seciliPersonelId ? aktifPersonel.filter(p => p.id === seciliPersonelId) : aktifPersonel;
    renderOzetTablo(filtreliPersonel, izinKayitlari);
    renderKayitTablo(filtreliPersonel, izinKayitlari, render, main);
  }

  function renderOzetTablo(personeller, izinKayitlari) {
    const wrap = document.getElementById('iki-tablo');
    let html = `<table class="dtable"><tr><th>Personel</th><th>İşe Giriş</th><th class="r">Kıdem (Yıl)</th><th class="r">Hak Edilen (Gün)</th><th class="r">Kullanılan (Gün)</th><th class="r">Kalan (Gün)</th></tr>`;
    personeller.forEach(p => {
      const { kidemYili, hakEdilen } = kidemVeHakEdilenHesapla(p, seciliYil);
      const yilinKayitlari = izinKayitlari.filter(k => k.personelId === p.id && k.izinTipi === 'yillik' && (k.baslangic || '').startsWith(seciliYil));
      const kullanilan = yilinKayitlari.reduce((a, k) => a + (k.gunSayisi || 0), 0);
      const kalan = hakEdilen - kullanilan;
      html += `<tr style="${kalan < 0 ? 'background:var(--red-bg)' : ''}">
        <td><b>${App.escapeHtml(p.adSoyad)}</b></td>
        <td style="font-size:11px">${p.iseGirisTarihi}</td>
        <td class="r">${kidemYili}</td>
        <td class="r">${hakEdilen}</td>
        <td class="r">${kullanilan}</td>
        <td class="r"><b style="color:${kalan < 0 ? 'var(--red-text)' : 'var(--green-text)'}">${kalan}</b></td>
      </tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
  }

  function renderKayitTablo(personeller, izinKayitlari, render, main) {
    const wrap = document.getElementById('iki-kayitlar');
    const personelIdSet = new Set(personeller.map(p => p.id));
    const yilinKayitlari = izinKayitlari.filter(k => personelIdSet.has(k.personelId) && (k.baslangic || '').startsWith(seciliYil));
    if (!yilinKayitlari.length) { wrap.innerHTML = `<div class="empty-state" style="padding:18px 10px"><div class="edesc">${seciliYil} yılında izin kaydı yok.</div></div>`; return; }

    let html = `<table class="dtable"><tr><th>Personel</th><th>İzin Tipi</th><th>Başlangıç</th><th>Bitiş</th><th class="r">Gün</th><th>Not</th><th></th></tr>`;
    [...yilinKayitlari].sort((a, b) => (b.baslangic || '').localeCompare(a.baslangic || '')).forEach(k => {
      const p = personeller.find(x => x.id === k.personelId);
      const tipLabel = { yillik: 'Yıllık İzin', mazeret: 'Mazeret İzni', rapor: 'Rapor (Sağlık)', ucretsiz: 'Ücretsiz İzin' }[k.izinTipi] || k.izinTipi;
      html += `<tr><td>${p ? App.escapeHtml(p.adSoyad) : '—'}</td>
        <td><span class="pill pill-blue">${tipLabel}</span></td>
        <td style="font-size:11px">${k.baslangic}</td><td style="font-size:11px">${k.bitis}</td>
        <td class="r">${k.gunSayisi}</td>
        <td style="font-size:11px">${App.escapeHtml(k.not || '—')}</td>
        <td><button class="btn btn-icon btn-ghost iki-sil" data-id="${k.id}" style="color:var(--red-text)">&times;</button></td></tr>`;
    });
    html += `</table>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll('.iki-sil').forEach(b => b.onclick = () => {
      App.confirmDialog('Bu izin kaydını silmek istediğinize emin misiniz?', async () => {
        await App.persist(() => Store.izinKayitlari.remove(b.dataset.id));
        App.toast('İzin kaydı silindi', 'ok');
        render(main);
      });
    });
  }

  function openIzinForm(personeller, izinKayitlari, onSaved) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Personel</label>
        <select class="fselect" id="if-personel">
          ${personeller.map(p => `<option value="${p.id}">${App.escapeHtml(p.adSoyad)}</option>`).join('')}
        </select>
      </div>
      <div class="fgroup"><label class="flbl">İzin Tipi</label>
        <select class="fselect" id="if-tip">
          <option value="yillik">Yıllık İzin</option>
          <option value="mazeret">Mazeret İzni</option>
          <option value="rapor">Rapor (Sağlık)</option>
          <option value="ucretsiz">Ücretsiz İzin</option>
        </select>
      </div>
      <div class="fhint" id="if-bakiye-hint" style="margin:-4px 0 8px"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Başlangıç</label><input class="finput" id="if-baslangic" type="date"></div>
        <div class="fgroup"><label class="flbl">Bitiş</label><input class="finput" id="if-bitis" type="date"></div>
      </div>
      <div class="fgroup"><label class="flbl">Gün Sayısı</label><input class="finput" id="if-gun" type="number" value="1"></div>
      <div class="fgroup"><label class="flbl">Not</label><textarea class="ftextarea" id="if-not"></textarea></div>
    `;
    const footer = `<button class="btn" id="if-cancel">Vazgeç</button><button class="btn btn-blue" id="if-save">Kaydet</button>`;
    App.openModal({ title: 'İzin Kaydı Ekle', body, footer, wide: true });

    // BULGU (T3-34): yıllık izin bakiyesi hiç kontrol edilmiyordu — bir
    // personele kalan hakkından FAZLA yıllık izin girilebiliyor, bakiye
    // negatife düşebiliyordu. Artık seçili personel+başlangıç tarihinin
    // yılına göre kalan bakiye canlı gösterilir; kaydetme anında da
    // (yalnızca 'yillik' tip için) sert biçimde engellenir.
    function bakiyeHintGuncelle() {
      const hint = document.getElementById('if-bakiye-hint');
      const tip = document.getElementById('if-tip').value;
      if (tip !== 'yillik') { hint.textContent = ''; return; }
      const p = personeller.find(x => x.id === document.getElementById('if-personel').value);
      const baslangic = document.getElementById('if-baslangic').value;
      if (!p || !baslangic) { hint.textContent = ''; return; }
      const yil = baslangic.slice(0, 4);
      const kalan = yillikIzinBakiyesi(p, yil, izinKayitlari, null);
      hint.innerHTML = `${yil} yılı kalan yıllık izin bakiyesi: <b style="color:${kalan <= 0 ? 'var(--red-text)' : 'var(--green-text)'}">${kalan} gün</b>`;
    }

    function gunHesapla() {
      const b = document.getElementById('if-baslangic').value;
      const bt = document.getElementById('if-bitis').value;
      if (b && bt) {
        const gun = Math.round((new Date(bt) - new Date(b)) / 86400000) + 1;
        if (gun > 0) document.getElementById('if-gun').value = gun;
      }
      bakiyeHintGuncelle();
    }
    document.getElementById('if-baslangic').onchange = gunHesapla;
    document.getElementById('if-bitis').onchange = gunHesapla;
    document.getElementById('if-personel').onchange = bakiyeHintGuncelle;
    document.getElementById('if-tip').onchange = bakiyeHintGuncelle;
    bakiyeHintGuncelle();

    document.getElementById('if-cancel').onclick = App.closeModal;
    document.getElementById('if-save').onclick = async () => {
      const baslangic = document.getElementById('if-baslangic').value;
      const bitis = document.getElementById('if-bitis').value;
      if (!baslangic || !bitis) { App.toast('Başlangıç ve bitiş tarihi zorunlu', 'err'); return; }
      const izinTipi = document.getElementById('if-tip').value;
      const gunSayisi = parseInt(document.getElementById('if-gun').value) || 1;
      const personelId = document.getElementById('if-personel').value;
      if (izinTipi === 'yillik') {
        const p = personeller.find(x => x.id === personelId);
        const yil = baslangic.slice(0, 4);
        const kalan = p ? yillikIzinBakiyesi(p, yil, izinKayitlari, null) : 0;
        if (gunSayisi > kalan) {
          App.toast(`Yetersiz izin bakiyesi — ${p ? p.adSoyad : ''} için ${yil} yılında kalan ${kalan} gün, girilen ${gunSayisi} gün`, 'err');
          return;
        }
      }
      const kayit = {
        id: App.uid('IZN'),
        personelId,
        izinTipi,
        baslangic, bitis,
        gunSayisi,
        not: document.getElementById('if-not').value.trim()
      };
      await App.persist(() => Store.izinKayitlari.upsert(kayit));
      App.toast('İzin kaydı eklendi', 'ok');
      App.closeModal();
      onSaved();
    };
  }

  return { render };
})();
