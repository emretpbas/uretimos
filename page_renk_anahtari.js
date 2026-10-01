// ════════════════════════════════════════════════════════════════════════════
// RENK EŞLEŞTİRME ANAHTARI — "🎨 Renk Varyantı Oluştur" motorunun kullandığı
// eşleştirmeyi YÖNETMEK için ekran.
// ────────────────────────────────────────────────────────────────────────────
// GERÇEK KAYNAK VERİ kartların (hammadde — şimdilik tüm kategoriler
// hammaddedir, bkz. not aşağıda) KENDİSİNDEDİR (renkKartelaKodu +
// malzemeKategorisi + renkOlcuEtiketi alanları, bkz. page_hammadde.js /
// page_yarimamul.js) — burada AYRI bir eşleştirme matrisi TUTULMAZ.
//
// Aynı (renk, kategori) içinde BİRDEN FAZLA ÖLÇÜ VARYANTI olabiliyor (ör.
// sunta/mdf'te kalınlık 8/18/30mm, PVC kenar bandında kalınlık×genişlik
// 0,40x22...2x54) — her biri AYRI bir satır olarak gösterilir.
//
// NOT (gerçek bir reçete dosyasıyla doğrulandı): boya kalemleri "LK." ön ekli
// HAMMADDE kartlarıdır (ör. "LK.50.025.01.015.00 — PÜ SONKAT MAT DAFNE/
// LATTE..."); "LK." burada LOGO'nun boya kategorisi stok kodu ön ekidir,
// Renk Kartelası renk kodu DEĞİLDİR — bu yüzden tip='sarf' hammaddeler
// arasında, diğer kategoriler gibi isimle aranır (yarı mamül koleksiyonu
// kullanılmaz). kartSecModal/kaynak='yarimamul' altyapısı yine de genel
// amaçlı bırakıldı — ileride gerçekten yarı mamül olan bir kategori
// (ör. hazır boyalı parça) çıkarsa kullanılabilir.
// ════════════════════════════════════════════════════════════════════════════
PageModules.renk_anahtari = (() => {
  const ROLLER = ['admin', 'arge', 'teknik_ofis', 'yonetim'];
  // kaynak: bu kategori hangi koleksiyonda aranır ('hammadde'|'yarimamul').
  // tipFiltre: hammadde ise SADECE bu h.tip'teki kartlar seçilebilir listede görünür
  // (ör. sunta/mdf seçerken hırdavat/sarf hiç gösterilmez — kullanıcı talebi).
  const KATEGORI_TANIM = {
    sunta: { etiket: 'Sunta (Melamin)', kaynak: 'hammadde', tipFiltre: 'plaka' },
    mdf: { etiket: 'MDF (Lam)', kaynak: 'hammadde', tipFiltre: 'plaka' },
    pvc_bant: { etiket: 'PVC Kenar Bandı', kaynak: 'hammadde', tipFiltre: 'kenar_bandi' },
    // DÜZELTME: boya kalemleri LOGO'da "LK." ön ekli (Lake boya kategorisi)
    // HAMMADDE kartlarıdır (ör. "LK.50.025.01.015.00 — PÜ SONKAT MAT DAFNE/
    // LATTE..."), "LK." + renk kartela kodu gibi yapılı YARI MAMÜL kodları
    // DEĞİL — gerçek bir reçete dosyasıyla doğrulandı. page_hammadde.js'teki
    // "Sarf Malzeme (boya, tutkal, kimyasal)" tipi (tip='sarf') ile eşleşir.
    boya: { etiket: 'Boya', kaynak: 'hammadde', tipFiltre: 'sarf' },
    diger: { etiket: 'Diğer', kaynak: 'hammadde', tipFiltre: null }
  };
  const KATEGORI_SIRA = ['sunta', 'mdf', 'pvc_bant', 'boya', 'diger'];

  // Her renk için gösterilecek satırları üretir: ölçü boyutu olan kategoriler
  // (sunta/mdf/pvc_bant) için HER ölçü AYRI bir satırdır; olmayanlar (boya/
  // diğer) için tek, ölçüsüz satır.
  function satirlariUret() {
    const satirlar = [];
    KATEGORI_SIRA.forEach(kat => {
      const olculer = RenkKartelasi.olcuEtiketleri[kat] || [];
      if (!olculer.length) satirlar.push({ kategori: kat, olcu: '' });
      else olculer.forEach(o => satirlar.push({ kategori: kat, olcu: o }));
    });
    return satirlar;
  }

  function kartlarEslesen(liste, renkKodu, kategori, olcu) {
    return (liste || []).filter(x => x.renkKartelaKodu === renkKodu && x.malzemeKategorisi === kategori &&
      (olcu ? x.renkOlcuEtiketi === olcu : !x.renkOlcuEtiketi));
  }

  async function render(main, params) {
    const rol = App.aktifRol();
    if (!ROLLER.includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE, Teknik Ofis ve Yönetim tarafından kullanılır.</div></div></div>`;
      return;
    }

    const [renkler, hammaddeler, yarimamuller] = await Promise.all([
      Store.renkKisaltmalari.all(), Store.hammaddeler.all(), Store.yarimamuller.all()
    ]);
    renkler.sort((a, b) => (a.renkKodu || '').localeCompare(b.renkKodu || ''));

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">🎨 Renk Eşleştirme Anahtarı</div>
          <div class="page-sub">Renk varyantı oluştururken kartların otomatik takas edileceği eşleştirmeyi yönetin</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="ra-yeni-renk">+ Yeni Renk Tanımla</button></div>
      </div>
      <div class="fhint" style="margin-bottom:12px">
        Gerçek eşleştirme verisi <b>kartların kendisinde</b> tutulur (Hammaddeler/Yarı Mamüller ekranında "Renk Kartela
        Kodu" + "Malzeme Kategorisi" + varsa "Ölçü" alanları). Burada her renge bir <b>kısaltma</b> (kod üretimi için,
        ör. 15→BY, 24→ANT) tanımlayıp, hangi kategori/ölçüde hangi kartın etiketli olduğunu görüp eksikleri
        tamamlayabilirsiniz. Sunta/MDF kalınlığa, PVC kenar bandı kalınlık×genişliğe göre AYRI satırlardadır.
      </div>
      <div id="ra-liste"></div>
    `;
    document.getElementById('ra-yeni-renk').onclick = () => renkEkleModal(main, renkler);
    renkListesiCiz(main, renkler, hammaddeler, yarimamuller);

    // Reçete Yapım Raporu'ndan "Bu Son Ek İçin Renk Tanımla →" ile
    // gelindiyse, "+ Yeni Renk Tanımla" modalını kısaltma ÖN DOLDURULMUŞ
    // olarak doğrudan aç — kullanıcı sadece hangi renk kodu olduğunu seçsin.
    if (params && params.onerilenKisaltma) {
      renkEkleModal(main, renkler, null, params.onerilenKisaltma);
    }
  }

  function renkListesiCiz(main, renkler, hammaddeler, yarimamuller) {
    const kapsayici = document.getElementById('ra-liste');
    if (!renkler.length) {
      kapsayici.innerHTML = `<div class="empty-state"><div class="eicon">🎨</div>
        <div class="etitle">Henüz renk tanımlanmamış</div>
        <div class="edesc">"+ Yeni Renk Tanımla" ile renk varyantı oluşturmak istediğiniz renkleri (ör. Beyaz, Antrasit) ekleyin.</div></div>`;
      return;
    }
    const satirSablonu = satirlariUret();

    kapsayici.innerHTML = renkler.map(r => {
      let soncKategori = null;
      const satirHtml = satirSablonu.map(s => {
        const tanim = KATEGORI_TANIM[s.kategori];
        const kaynakListe = tanim.kaynak === 'yarimamul' ? yarimamuller : hammaddeler;
        const adaylar = kartlarEslesen(kaynakListe, r.renkKodu, s.kategori, s.olcu);
        let durum;
        if (adaylar.length === 1) {
          const ad = adaylar[0];
          durum = `<span class="pill pill-green">${App.escapeHtml(ad.stokKodu || ad.kod || '')} — ${App.escapeHtml(ad.ad || '')}</span>`;
        } else if (adaylar.length === 0) {
          durum = `<span class="pill pill-amber">⚠ Tanımsız — atlanır</span>`;
        } else {
          durum = `<span class="pill" style="background:var(--red-bg);color:var(--red-text)">⚠ ${adaylar.length} kart çakışıyor</span>`;
        }
        const kategoriBaslikSatiri = s.kategori !== soncKategori
          ? `<tr><th colspan="3" style="background:var(--bg2,#f8f9fb);text-align:left">${App.escapeHtml(tanim.etiket)}</th></tr>` : '';
        soncKategori = s.kategori;
        return kategoriBaslikSatiri + `<tr>
          <td style="white-space:nowrap;padding-left:16px">${s.olcu ? App.escapeHtml(s.olcu) : '—'}</td>
          <td>${durum}</td>
          <td class="r"><button class="btn btn-sm ra-kart-sec" data-renk="${App.escapeHtml(r.renkKodu)}" data-kat="${s.kategori}" data-olcu="${App.escapeHtml(s.olcu)}">${adaylar.length ? 'Değiştir' : '+ Ekle/Seç'}</button></td>
        </tr>`;
      }).join('');
      return `
        <div class="card" style="margin-bottom:12px">
          <div class="card-hdr">
            <div class="card-title">${App.escapeHtml(r.renkKodu)} — ${App.escapeHtml(r.renkAdi || '')} <span class="muted" style="font-size:11px">(kısaltmalar: ${App.escapeHtml((r.kisaltmalar && r.kisaltmalar.length ? r.kisaltmalar : (r.kisaltma ? [r.kisaltma] : [])).join(', ') || '—')})</span></div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm ra-duzenle" data-id="${r.id}">Düzenle</button>
              <button class="btn btn-sm btn-red ra-sil" data-id="${r.id}">Sil</button>
            </div>
          </div>
          <div class="tbl-wrap" style="max-height:340px;overflow:auto"><table class="dtable" style="font-size:12px">
            <tr><th>Ölçü</th><th>Durum</th><th></th></tr>
            ${satirHtml}
          </table></div>
        </div>`;
    }).join('');

    kapsayici.querySelectorAll('.ra-duzenle').forEach(btn => {
      btn.onclick = () => renkEkleModal(main, renkler, renkler.find(r => r.id === btn.dataset.id));
    });
    kapsayici.querySelectorAll('.ra-sil').forEach(btn => {
      btn.onclick = () => {
        const kayit = renkler.find(r => r.id === btn.dataset.id);
        App.confirmDialog(`"${App.escapeHtml(kayit.renkKodu)} - ${App.escapeHtml(kayit.renkAdi || '')}" renk tanımı silinecek. ` +
          `Kartlardaki etiketler SİLİNMEZ, sadece bu renk için varyant oluşturma/kod üretimi kapanır. Onaylıyor musunuz?`,
          async () => {
            await App.persist(() => Store.renkKisaltmalari.remove(kayit.id));
            App.toast('Renk tanımı silindi', 'ok');
            render(main);
          });
      };
    });
    kapsayici.querySelectorAll('.ra-kart-sec').forEach(btn => {
      btn.onclick = () => kartSecModal(main, btn.dataset.renk, btn.dataset.kat, btn.dataset.olcu, hammaddeler, yarimamuller, renkler);
    });
  }

  // Bir (renk, kategori, ölçü) hücresi için: var olan bir kartı (hammadde
  // VEYA — boya'da — yarı mamül) bu etikete bağla, ya da sıfırdan yeni bir
  // kart oluştur. Arama İSİMLE yapılır (büyük native <select> yerine canlı
  // filtrelenen, geniş satırlı bir liste — yüzlerce kayıtta kullanılabilir
  // olması için).
  function kartSecModal(main, renkKodu, kategori, olcu, hammaddeler, yarimamuller, renkler) {
    const renkKaydi = renkler.find(r => r.renkKodu === renkKodu);
    const tanim = KATEGORI_TANIM[kategori];
    const kaynakListe = tanim.kaynak === 'yarimamul' ? yarimamuller : hammaddeler;
    const kodAlani = (x) => tanim.kaynak === 'yarimamul' ? (x.kod || '') : (x.stokKodu || '');
    const mevcutEtiketli = kartlarEslesen(kaynakListe, renkKodu, kategori, olcu);
    const adaylar = kaynakListe.filter(x => !(x.renkKartelaKodu === renkKodu && x.malzemeKategorisi === kategori && (olcu ? x.renkOlcuEtiketi === olcu : !x.renkOlcuEtiketi)))
      .filter(x => !tanim.tipFiltre || x.tip === tanim.tipFiltre);

    const varsayilanArama = '';

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">
        <b>${App.escapeHtml(renkKodu)} - ${App.escapeHtml(renkKaydi ? renkKaydi.renkAdi : '')}</b> için
        <b>${App.escapeHtml(tanim.etiket)}</b>${olcu ? ' — <b>' + App.escapeHtml(olcu) + '</b>' : ''} kategorisinde hangi
        ${tanim.kaynak === 'yarimamul' ? 'yarı mamül' : 'hammadde'} kullanılacak?
      </div>
      ${mevcutEtiketli.length ? `<div class="flbl" style="margin-bottom:6px">Şu an etiketli (kaldırmak için "Etiketi Kaldır")</div>
        ${mevcutEtiketli.map(x => `<div class="flex-gap" style="justify-content:space-between;align-items:center;padding:6px 0">
          <span class="mono" style="font-size:12px">${App.escapeHtml(kodAlani(x))} — ${App.escapeHtml(x.ad || '')}</span>
          <button class="btn btn-sm ra-etiket-kaldir" data-id="${x.id}">Etiketi Kaldır</button>
        </div>`).join('')}<div class="hr"></div>` : ''}
      <div class="fgroup"><label class="flbl">İsme veya koda göre ara</label>
        <input class="finput" id="ra-ara" value="${App.escapeHtml(varsayilanArama)}" placeholder="Yazmaya başlayın…" autocomplete="off">
      </div>
      <div id="ra-sonuc-liste" class="tbl-wrap" style="max-height:320px;overflow:auto;border:1px solid var(--border,#e5e7eb);border-radius:8px"></div>
    `;
    const footer = `<button class="btn" id="ra-hm-vazgec">Vazgeç</button>
      <button class="btn" id="ra-hm-yeni">+ Yeni ${tanim.kaynak === 'yarimamul' ? 'Yarı Mamül' : 'Hammadde'} Oluştur</button>`;
    App.openModal({ title: 'Kart Eşleştir', body, footer, xwide: true });
    document.getElementById('ra-hm-vazgec').onclick = App.closeModal;

    let secilenId = null;
    function sonuclariCiz() {
      const q = document.getElementById('ra-ara').value.trim().toLocaleUpperCase('tr');
      const filtreli = adaylar.filter(x => {
        if (!q) return true;
        const ad = (x.ad || '').toLocaleUpperCase('tr');
        const kod = kodAlani(x).toLocaleUpperCase('tr');
        return ad.includes(q) || kod.includes(q);
      }).slice(0, 200); // çok uzun listelerde ilk 200 sonuç — daraltmak için aramayı netleştirin
      const liste = document.getElementById('ra-sonuc-liste');
      if (!filtreli.length) {
        liste.innerHTML = `<div class="muted" style="padding:14px;font-size:12px">Eşleşen kayıt yok. "+ Yeni ${tanim.kaynak === 'yarimamul' ? 'Yarı Mamül' : 'Hammadde'} Oluştur" ile tanımlayabilirsiniz.</div>`;
        return;
      }
      liste.innerHTML = filtreli.map(x => `
        <div class="ra-pick-row" data-id="${x.id}" style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border,#eef0f3)">
          <span class="mono" style="font-size:12px;color:var(--text2);white-space:nowrap">${App.escapeHtml(kodAlani(x))}</span>
          <span style="flex:1;font-size:13px">${App.escapeHtml(x.ad || '')}</span>
        </div>`).join('');
      liste.querySelectorAll('.ra-pick-row').forEach(row => {
        row.onmouseenter = () => row.style.background = 'var(--bg2,#f3f4f6)';
        row.onmouseleave = () => row.style.background = (row.dataset.id === secilenId) ? 'var(--blue-bg,#eff6ff)' : '';
        row.onclick = async () => {
          const x = kaynakListe.find(k => k.id === row.dataset.id);
          const koleksiyon = tanim.kaynak === 'yarimamul' ? Store.yarimamuller : Store.hammaddeler;
          await App.persist(() => koleksiyon.upsert({ ...x, renkKartelaKodu: renkKodu, malzemeKategorisi: kategori, renkOlcuEtiketi: olcu || null }));
          App.toast((tanim.kaynak === 'yarimamul' ? 'Yarı mamül' : 'Hammadde') + ' etiketlendi: ' + (kodAlani(x) || x.ad), 'ok');
          App.closeModal();
          render(main);
        };
      });
    }
    document.getElementById('ra-ara').oninput = sonuclariCiz;
    sonuclariCiz();

    body.querySelectorAll('.ra-etiket-kaldir').forEach(btn => {
      btn.onclick = async () => {
        const x = kaynakListe.find(k => k.id === btn.dataset.id);
        const koleksiyon = tanim.kaynak === 'yarimamul' ? Store.yarimamuller : Store.hammaddeler;
        await App.persist(() => koleksiyon.upsert({ ...x, renkKartelaKodu: null, malzemeKategorisi: null, renkOlcuEtiketi: null }));
        App.toast('Etiket kaldırıldı', 'ok');
        App.closeModal();
        render(main);
      };
    });
    document.getElementById('ra-hm-yeni').onclick = () => {
      App.closeModal();
      const oneri = { renkKartelaKodu: renkKodu, malzemeKategorisi: kategori, renkOlcuEtiketi: olcu || null };
      if (tanim.kaynak === 'yarimamul') {
        Promise.all([Store.hammaddeler.all(), Store.rotalar.all()]).then(([hms, rotalar]) => {
          PageModules.yarimamul.openForm(main, null, hms, rotalar, () => render(main), oneri);
        });
      } else {
        if (tanim.tipFiltre) oneri.tip = tanim.tipFiltre;
        PageModules.hammadde.openForm(null, () => render(main), oneri);
      }
    };
  }

  function renkEkleModal(main, renkler, mevcut, onerilenKisaltma) {
    const isEdit = !!mevcut;
    const body = document.createElement('div');
    body.innerHTML = `
      ${onerilenKisaltma ? `<div class="fhint" style="margin-bottom:10px;background:var(--amber-bg);border:1px solid var(--amber);padding:10px 12px;border-radius:8px">
        Reçete Yapım Raporu'nda <b>".${App.escapeHtml(onerilenKisaltma)}"</b> son ekli parçalar bulundu ama bu ek hiçbir renge tanımlı değil.
        Aşağıdan hangi renk olduğunu seçin — zaten tanımlı bir renk seçerseniz bu ek ONA EKLENİR, yeni bir renk seçerseniz
        yeni bir tanım oluşturulur. Kısaltma alanı sizin için dolduruldu.</div>` : ''}
      <div class="fgroup"><label class="flbl">Renk Kartela Kodu</label>
        <select class="fselect" id="ra-renk-kod" ${isEdit ? 'disabled' : ''}>
          ${RenkKartelasi.liste.map(r => `<option value="${r.kod}" ${(isEdit ? mevcut.renkKodu === r.kod : false) ? 'selected' : ''}>${r.kod} - ${App.escapeHtml(r.ad)} (${App.escapeHtml(r.kategori)})${(!isEdit && renkler.some(x => x.renkKodu === r.kod)) ? ' — zaten tanımlı' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="fgroup"><label class="flbl">Kısaltmalar (kod üretiminde/tanımada kullanılır — ör. "ANT" veya "DAF, LKDF")</label>
        <input class="finput" id="ra-kisaltma" value="${App.escapeHtml(mevcut ? (mevcut.kisaltmalar && mevcut.kisaltmalar.length ? mevcut.kisaltmalar : (mevcut.kisaltma ? [mevcut.kisaltma] : [])).join(', ') : (onerilenKisaltma || ''))}" placeholder="örn. ANT veya DAF, LKDF" maxlength="60">
        <div class="fhint">Mevcut kartlarınızda bu renk için kullandığınız kod son ekiyle AYNI olmalı. Aynı renk BİRDEN FAZLA son ek kullanabiliyorsa (ör. Dafne: melamin parçalarda "DAF", lake/boyalı kapaklarda "LKDF") virgülle ayırarak hepsini girin — zaten tanımlı bir renk seçip yeni bir ek eklerseniz, mevcut ekler SİLİNMEZ, üzerine eklenir.</div>
      </div>
    `;
    const footer = `<button class="btn" id="ra-vazgec">Vazgeç</button><button class="btn btn-blue" id="ra-kaydet">${isEdit ? 'Güncelle' : 'Ekle'}</button>`;
    App.openModal({ title: isEdit ? 'Renk Tanımını Düzenle' : 'Yeni Renk Tanımla', body, footer });
    document.getElementById('ra-vazgec').onclick = App.closeModal;
    document.getElementById('ra-kaydet').onclick = async () => {
      const kod = document.getElementById('ra-renk-kod').value;
      const girilenKisaltmalar = document.getElementById('ra-kisaltma').value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      if (!kod) { App.toast('Renk kodu seçin', 'err'); return; }
      if (!girilenKisaltmalar.length) { App.toast('En az bir kısaltma zorunlu', 'err'); return; }
      // Düzenleme DIŞINDA, seçilen renk ZATEN tanımlıysa (ör. Dafne'ye yeni
      // bir son ek eklemek için) o kaydı GÜNCELLER — ikinci bir satır AÇMAZ.
      const hedefKayit = isEdit ? mevcut : renkler.find(r => r.renkKodu === kod) || null;
      const oncekiKisaltmalar = hedefKayit ? (hedefKayit.kisaltmalar && hedefKayit.kisaltmalar.length ? hedefKayit.kisaltmalar : (hedefKayit.kisaltma ? [hedefKayit.kisaltma] : [])) : [];
      const kisaltmalar = isEdit ? girilenKisaltmalar : [...new Set([...oncekiKisaltmalar, ...girilenKisaltmalar])];
      const kayit = {
        id: hedefKayit ? hedefKayit.id : App.uid('RKA'),
        renkKodu: kod, renkAdi: RenkKartelasi.adGetir(kod), kisaltmalar
      };
      await App.persist(() => Store.renkKisaltmalari.upsert(kayit));
      App.toast(hedefKayit ? 'Renk tanımı güncellendi' : 'Renk tanımlandı: ' + kod, 'ok');
      App.closeModal();
      render(main);
    };
  }

  return { render };
})();
