// ════════════════════════════════════════════════════════════════════════════
// KALİTE KONTROL — Depo'nun onayladığı TÜM hammadde/hırdavat girişlerini
// (kalite problemi bildirilsin ya da bildirilmesin) inceleyip stoğa alma;
// üretimi tamamlanan ürünlerin sevkiyat öncesi kalite onayı. Onaylanmayan
// girişler stoğa eklenmez, onaylanmayan ürünler için cari onay/irsaliye
// süreci başlamaz.
// ════════════════════════════════════════════════════════════════════════════
PageModules.kalite_panel = (() => {
  let activeTab = 'depo';

  async function render(main) {
    const [depoGirisleri, urunKaliteOnaylari, hammaddeler, siparisler] = await Promise.all([
      Store.depoGirisleri.all(), Store.urunKaliteOnaylari.all(), Store.hammaddeler.all(), Store.siparisler.all()
    ]);
    // Depo'nun onayladığı (kalite problemi bildirilmiş "karantina" dahil) tüm
    // girişler Kalite onayını bekler.
    const onayBekleyenGirisler = depoGirisleri.filter(g => g.durum === 'depo_onayladi_kalite_bekliyor' || g.durum === 'karantina');

    // ONARIM: uretimDurumu 'kalite_bekliyor' olduğu halde kalite kaydı hiç
    // açılmamış siparişler (eski sürüm hatası) burada tamamlanır — aksi halde
    // Siparişler & Termin'de "Kalite Onayı Bekliyor" görünür ama bu ekranda
    // hiçbir şey çıkmaz.
    const kaliteBekleyenSiparisler = siparisler.filter(s => s.uretimDurumu === 'kalite_bekliyor');
    const eksikler = [];
    kaliteBekleyenSiparisler.forEach(s => {
      if (urunKaliteOnaylari.some(u => u.siparisId === s.id)) return;
      (s.kalemler || []).forEach(kalem => {
        if (kalem.grup === 'hammadde' || kalem.ikinciKalite) return;
        eksikler.push({
          id: App.uid('UKO'), siparisId: s.id, siparisKod: s.kod, urunId: null,
          urunKod: kalem.kod, urunAd: kalem.ad || '', kalemGrup: kalem.grup || 'urun',
          miktar: kalem.miktar || 1, durum: 'bekliyor', tarih: new Date().toISOString().slice(0, 10)
        });
      });
    });
    if (eksikler.length) {
      urunKaliteOnaylari.push(...eksikler);
      await App.persist(() => Store.urunKaliteOnaylari.save(urunKaliteOnaylari));
    }

    const bekleyenUrunler = urunKaliteOnaylari.filter(u => u.durum === 'bekliyor');

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Kalite Kontrol</div><div class="page-sub">Depo'nun onayladığı tüm hammadde girişlerini ve üretimi tamamlanan ürünleri kontrol edip onaylayın</div></div>
      </div>
      <div class="tabs">
        <div class="tab ${activeTab === 'depo' ? 'active' : ''}" data-tab="depo">Depo Onaylı — Hammadde Girişleri ${onayBekleyenGirisler.length ? '<span class="pill pill-red" style="margin-left:4px">' + onayBekleyenGirisler.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'urun' ? 'active' : ''}" data-tab="urun">Ürün Kalite Onayı ${bekleyenUrunler.length ? '<span class="pill pill-blue" style="margin-left:4px">' + bekleyenUrunler.length + '</span>' : ''}</div>
        <div class="tab ${activeTab === 'plan' ? 'active' : ''}" data-tab="plan">Kontrol Planı</div>
        <div class="tab ${activeTab === 'olcum' ? 'active' : ''}" data-tab="olcum">Ölçüm Kayıtları</div>
      </div>
      <div id="kal-tab-content"></div>
    `;
    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; render(main); });

    const content = document.getElementById('kal-tab-content');
    if (activeTab === 'depo') { content.innerHTML = renderDepoGirisTab(onayBekleyenGirisler); wireDepoGirisTab(onayBekleyenGirisler, render, main); }
    // Kontrol planı: hangi parçada, hangi istasyonda, hangi tolerans (kontrol_plani.js)
    else if (activeTab === 'plan') { KontrolPlani.planListesiCiz(content, () => render(main)); }
    // Ölçüm kayıtları: operatörün girdiği değerler + en sık uygunsuzluk veren özellikler
    else if (activeTab === 'olcum') { KontrolPlani.olcumRaporuCiz(content); }
    else { content.innerHTML = renderUrunTab(bekleyenUrunler, siparisler); wireUrunTab(bekleyenUrunler, siparisler, render, main); }
  }

  function renderDepoGirisTab(girisler) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Depo Onaylı Hammadde/Hırdavat Girişleri — Stoğa Alma Onayı</div></div>
      <div class="fhint" style="margin-bottom:8px">Depo'nun onayladığı her giriş, stoğa eklenmeden önce burada onaylanmalıdır. Kalite problemi şüphesi bildirilmiş girişler kırmızı satırla işaretlenmiştir ve toplu işleme dahil edilemez (tek tek incelenmelidir).</div>`;
    if (!girisler.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Onay bekleyen hammadde girişi yok.</div></div>`;
    } else {
      const gruplar = new Map();
      girisler.forEach(g => {
        const anahtar = g.tedarikciAdi || '—';
        if (!gruplar.has(anahtar)) gruplar.set(anahtar, []);
        gruplar.get(anahtar).push(g);
      });
      [...gruplar.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([tedarikciAdi, liste], grupIndex) => {
        const seciliebilirSayisi = liste.filter(g => !(g.durum === 'karantina' || g.kaliteProblemiBildirildi)).length;
        html += `<div style="margin-bottom:14px">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${seciliebilirSayisi > 0 ? `<label style="display:inline-flex;align-items:center;gap:4px;font-weight:600;font-size:11.5px;cursor:pointer">
              <input type="checkbox" class="kal-grup-tumu" data-grup="${grupIndex}" title="Bu tedarikçinin uygun tüm girişlerini seç"> tümü
            </label>` : ''}
            ${App.escapeHtml(tedarikciAdi)} <span class="pill pill-gray">${liste.length} giriş</span>
            <span style="flex:1"></span>
            ${seciliebilirSayisi > 0 ? `
              <button class="btn btn-sm btn-green kal-toplu-onayla" data-grup="${grupIndex}" style="display:none">✓ Seçilenleri Toplu Onayla</button>
              <button class="btn btn-sm btn-red kal-toplu-reddet" data-grup="${grupIndex}" style="display:none">✕ Seçilenleri Toplu Reddet</button>
            ` : ''}
          </div>
          <table class="dtable"><tr><th></th><th>Satınalma Sipariş No</th><th>Kalem</th><th class="r">Gelen Miktar</th><th>İrsaliye/Fatura</th><th>Not</th><th></th></tr>`;
        liste.forEach(g => {
          const kaliteProblemiVar = g.durum === 'karantina' || g.kaliteProblemiBildirildi;
          html += `<tr style="${kaliteProblemiVar ? 'background:var(--red-bg)' : ''}">
            <td>${!kaliteProblemiVar ? `<input type="checkbox" class="kal-giris-check" data-grup="${grupIndex}" data-id="${g.id}">` : ''}</td>
            <td class="mono">${g.satinalmaSiparisKod}</td>
            <td>${App.escapeHtml(g.kalemAdi)}</td><td class="r">${App.fmt(g.gelenMiktar || g.siparisMiktari, 2)} ${g.birim || ''}</td>
            <td style="font-size:11px">${App.escapeHtml(g.irsaliyeNo || '—')}${g.faturaNo ? ' / ' + App.escapeHtml(g.faturaNo) : ''}</td>
            <td style="font-size:11.5px">${kaliteProblemiVar ? '<b style="color:var(--red-text)">⚠ Kalite problemi şüphesi: </b>' : ''}${App.escapeHtml(g.kaliteAciklama || g.aciklama || '—')}</td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-sm btn-green kal-onayla-giris" data-id="${g.id}">Onayla, Stoğa Al</button>
              <button class="btn btn-sm btn-red kal-reddet-giris" data-id="${g.id}">Reddet (İade)</button>
            </td></tr>`;
        });
        html += `</table></div>`;
      });
    }
    html += `</div>`;
    return html;
  }

  function wireDepoGirisTab(girisler, render, main) {
    document.querySelectorAll('.kal-onayla-giris').forEach(b => b.onclick = () => {
      App.confirmDialog('Bu hammaddeyi onaylayıp Hammadde Deposu stoğuna eklemek istediğinize emin misiniz?', async () => {
        const giris = girisler.find(g => g.id === b.dataset.id);
        giris.durum = 'tamamlandi';
        giris.kaliteOnayTarihi = new Date().toISOString().slice(0, 10);
            giris.kaliteOnaylayan = App.aktifRol();
            giris.kaliteOnayZamani = new Date().toISOString();
        await App.persist(() => Store.depoGirisleri.upsert(giris));
        await App.persist(() => App.depoGirisiOnaylaStokEkle(giris));
        App.toast('Kalite onayı verildi, hammadde stoğa eklendi: ' + giris.kalemAdi, 'ok');
        render(main);
      });
    });
    document.querySelectorAll('.kal-reddet-giris').forEach(b => b.onclick = () => {
      const giris = girisler.find(g => g.id === b.dataset.id);
      kaliteReddModali({
        baslik: 'Hammadde Kalite Reddi — Uygunsuzluk Formu',
        kalemAdi: giris.kalemAdi,
        onOnay: async ({ aciklama, fotograflar, dofAc }) => {
          giris.durum = 'kalite_reddetti';
          giris.kaliteRedAciklama = aciklama;
          await App.persist(() => Store.depoGirisleri.upsert(giris));
          // Uygunsuzluk kaydı (NCR) + iade ambarına aktar + opsiyonel DÖF
          const ncr = await App.kaliteUygunsuzlukOlustur('hammadde_girisi', {
            kaynakId: giris.id, kod: giris.hammaddeId || giris.kalemAdi, ad: giris.kalemAdi,
            miktar: giris.gelenMiktar || giris.siparisMiktari || 0, birim: giris.birim || 'ADET',
            tip: 'hammadde', refId: giris.hammaddeId || null,
            tedarikciId: giris.tedarikciId || null, tedarikciAdi: giris.tedarikciAdi || null,
            siparisId: giris.satinalmaSiparisId || giris.siparisId || null,
            aciklama, fotograflar, sorumluBirim: 'satinalma', dofAc
          });
          await App.iadeAmbarinaAktar(ncr, { tedarikciId: giris.tedarikciId, tedarikciAdi: giris.tedarikciAdi, siparisId: giris.satinalmaSiparisId });
          App.toast('Uygunsuzluk kaydı açıldı (' + ncr.no + '), malzeme iade ambarına alındı' + (dofAc ? ' ve DÖF başlatıldı' : ''), 'ok');
          render(main);
        }
      });
    });

    // Her tedarikçi grubu kendi checkbox setini ve toplu onay/reddet
    // butonlarını yönetir.
    const tumGrupIndexler = new Set();
    document.querySelectorAll('.kal-giris-check').forEach(c => tumGrupIndexler.add(c.dataset.grup));
    tumGrupIndexler.forEach(grupIndex => {
      const checkboxlar = document.querySelectorAll(`.kal-giris-check[data-grup="${grupIndex}"]`);
      const topluOnaylaBtn = document.querySelector(`.kal-toplu-onayla[data-grup="${grupIndex}"]`);
      const topluReddetBtn = document.querySelector(`.kal-toplu-reddet[data-grup="${grupIndex}"]`);
      function gorunurlugunuGuncelle() {
        const seciliSayisi = [...checkboxlar].filter(c => c.checked).length;
        const goster = seciliSayisi > 0 ? 'inline-block' : 'none';
        if (topluOnaylaBtn) { topluOnaylaBtn.style.display = goster; topluOnaylaBtn.textContent = seciliSayisi > 0 ? `✓ Seçilenleri Toplu Onayla (${seciliSayisi})` : '✓ Seçilenleri Toplu Onayla'; }
        if (topluReddetBtn) { topluReddetBtn.style.display = goster; topluReddetBtn.textContent = seciliSayisi > 0 ? `✕ Seçilenleri Toplu Reddet (${seciliSayisi})` : '✕ Seçilenleri Toplu Reddet'; }
      }
      checkboxlar.forEach(c => c.onchange = gorunurlugunuGuncelle);

      // Grup başlığındaki "tümü" kutucuğu: aynı tedarikçi altındaki uygun
      // girişlerin hepsini tek hamlede seçer (kalite sorunlular zaten hariç,
      // onlar tek tek incelenmeli). Seçim sonrası toplu onay butonu belirir.
      const grupTumu = document.querySelector(`.kal-grup-tumu[data-grup="${grupIndex}"]`);
      if (grupTumu) grupTumu.onchange = () => {
        checkboxlar.forEach(c => { c.checked = grupTumu.checked; });
        gorunurlugunuGuncelle();
      };

      if (topluOnaylaBtn) topluOnaylaBtn.onclick = () => {
        const seciliIdler = [...checkboxlar].filter(c => c.checked).map(c => c.dataset.id);
        if (!seciliIdler.length) return;
        App.confirmDialog(`Seçilen ${seciliIdler.length} hammaddeyi topluca onaylayıp Hammadde Deposu stoğuna eklemek istediğinize emin misiniz?`, async () => {
          for (const id of seciliIdler) {
            const giris = girisler.find(g => g.id === id);
            if (!giris) continue;
            giris.durum = 'tamamlandi';
            giris.kaliteOnayTarihi = new Date().toISOString().slice(0, 10);
            giris.kaliteOnaylayan = App.aktifRol();
            giris.kaliteOnayZamani = new Date().toISOString();
            await App.persist(() => Store.depoGirisleri.upsert(giris));
            await App.persist(() => App.depoGirisiOnaylaStokEkle(giris));
          }
          App.toast(`${seciliIdler.length} hammadde toplu onaylandı ve stoğa eklendi`, 'ok');
          render(main);
        });
      };

      if (topluReddetBtn) topluReddetBtn.onclick = () => {
        const seciliIdler = [...checkboxlar].filter(c => c.checked).map(c => c.dataset.id);
        if (!seciliIdler.length) return;
        App.confirmDialog(`Seçilen ${seciliIdler.length} hammaddeyi topluca reddetmek (tedarikçiye iade) istediğinize emin misiniz?`, async () => {
          for (const id of seciliIdler) {
            const giris = girisler.find(g => g.id === id);
            if (!giris) continue;
            giris.durum = 'kalite_reddetti';
            await App.persist(() => Store.depoGirisleri.upsert(giris));
          }
          App.toast(`${seciliIdler.length} hammadde toplu reddedildi`, 'ok');
          render(main);
        });
      };
    });
  }

  function renderUrunTab(bekleyenUrunler, siparisler) {
    let html = `<div class="card"><div class="card-hdr"><div class="card-title">Sevkiyat Öncesi Ürün Kalite Onayı</div></div>
      <div class="fhint" style="margin-bottom:8px">Onaylanmayan ürünler Sevkiyat Deposu'na giriş yapmaz; cari onay ve irsaliye süreci başlamaz. Reçetesinde paket/koli takibi olan siparişlerde, paket adetlerinin reçeteyle uyumu burada kontrol edilir.</div>`;
    if (!bekleyenUrunler.length) {
      html += `<div class="empty-state" style="padding:24px 10px"><div class="edesc">Onay bekleyen ürün yok.</div></div>`;
    } else {
      html += `<table class="dtable"><tr><th>Sipariş Kodu</th><th>Ürün</th><th class="r">Miktar</th><th>Paket Durumu</th><th>Tarih</th><th></th></tr>`;
      bekleyenUrunler.forEach(u => {
        const siparis = siparisler.find(s => s.id === u.siparisId);
        const paketDurumu = paketUyumDurumu(siparis);
        html += `<tr><td class="mono">${u.siparisKod}</td><td>${App.escapeHtml(u.urunAd)}</td>
          <td class="r">${App.fmt(u.miktar, 0)}</td>
          <td>${paketDurumu.html}</td>
          <td style="font-size:11px">${u.tarih}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-green kal-onayla-urun" data-id="${u.id}" ${paketDurumu.engelle ? 'disabled title="Paket adetleri reçeteyle uyuşmuyor"' : ''}>Onayla</button>
            <button class="btn btn-sm btn-red kal-reddet-urun" data-id="${u.id}">Reddet</button>
          </td></tr>`;
      });
      html += `</table>`;
    }
    html += `</div>`;
    return html;
  }

  // Bir siparişin gerekenPaketler listesindeki ONAYLANAN (üretimde girilen)
  // adetlerin, REÇETEYE GÖRE GEREKEN adetle uyup uymadığını kontrol eder.
  // Uyuşmazlık varsa Kalite'nin "Onayla" butonu devre dışı bırakılır —
  // kullanıcı isteği: "Kalitede paket adetlerinin reçeteye uygun olup
  // olmadığını kontrol edip onaylasın".
  function paketUyumDurumu(siparis) {
    if (!siparis || !siparis.gerekenPaketler || !siparis.gerekenPaketler.length) {
      return { html: '<span class="muted" style="font-size:10.5px">Paket yok</span>', engelle: false };
    }
    const uyumsuzlar = siparis.gerekenPaketler.filter(p => (p.onaylananAdet || 0) !== p.adet);
    if (!siparis.gerekenPaketler.every(p => p.uretimOnayli)) {
      return { html: '<span class="pill pill-amber" style="font-size:10px">⚠ Paket adedi henüz onaylanmadı</span>', engelle: true };
    }
    if (uyumsuzlar.length) {
      return { html: `<span class="pill pill-red" style="font-size:10px">✕ ${uyumsuzlar.length} paket uyumsuz</span>`, engelle: true };
    }
    return { html: `<span class="pill pill-green" style="font-size:10px">✓ ${siparis.gerekenPaketler.length} paket reçeteye uygun</span>`, engelle: false };
  }

  function wireUrunTab(bekleyenUrunler, siparisler, render, main) {
    document.querySelectorAll('.kal-onayla-urun').forEach(b => b.onclick = () => {
      const u = bekleyenUrunler.find(x => x.id === b.dataset.id);
      const siparis = siparisler.find(s => s.id === u.siparisId);
      const paketDurumu = paketUyumDurumu(siparis);
      if (paketDurumu.engelle) {
        App.toast('⚠ Bu siparişin paket adetleri reçeteyle uyumlu değil veya henüz onaylanmadı. Üretim Panel\'den paket onayını tamamlayın.', 'err');
        return;
      }
      App.confirmDialog('Bu ürünü onaylayıp Sevkiyat Deposu\'na giriş yapmasını istediğinize emin misiniz?', async () => {
        u.durum = 'onaylandi';
        u.onayTarihi = new Date().toISOString().slice(0, 10);
        await App.persist(() => Store.urunKaliteOnaylari.upsert(u));
        await App.persist(() => App.uretimTamamlaninceUrunGirisiYap(u.urunId, u.urunKod, u.urunAd, u.miktar));

        // Paket(ler) varsa, Kalite onayı verildiğini işaretle — Sevkiyat
        // ekranı sadece "kaliteOnayli: true" olan paketleri sevke hazır sayar.
        if (siparis && siparis.gerekenPaketler && siparis.gerekenPaketler.length) {
          // SEVKİYAT ÖNCESİ KALİTE İZİ: kim, ne zaman onayladı (denetim için)
          const _onayZamani = new Date().toISOString();
          const _onaylayan = App.aktifRol();
          siparis.gerekenPaketler.forEach(p => {
            p.kaliteOnayli = true;
            p.kaliteOnaylayan = _onaylayan;
            p.kaliteOnayZamani = _onayZamani;
          });
          await App.persist(() => Store.siparisler.upsert(siparis));
        }

        // Tüm kalemleri onaylanmış mı kontrol et. ÖNEMLİ: daha önce reddedilip
        // üretime geri dönen kalemlerin ESKİ 'reddedildi' kayıtları tamamlanmayı
        // ENGELLEMEZ — bekleyen kalem kalmadıysa ve en az bir onay varsa sipariş
        // 'tamamlandi' olur ve Sevkiyat ekranına düşer.
        const tumKaliteKayitlari = await Store.urunKaliteOnaylari.all();
        const aynıSiparisinKalemleri = tumKaliteKayitlari.filter(x => x.siparisId === u.siparisId);
        const bekleyenYok = !aynıSiparisinKalemleri.some(x => x.durum === 'bekliyor');
        const enAzBirOnayli = aynıSiparisinKalemleri.some(x => x.durum === 'onaylandi');
        if (bekleyenYok && enAzBirOnayli) {
          const guncelSiparisler = await Store.siparisler.all();
          const guncelSiparis = guncelSiparisler.find(s => s.id === u.siparisId);
          if (guncelSiparis) {
            guncelSiparis.uretimDurumu = 'tamamlandi';
            guncelSiparis.kalitedenDondu = false; // düzeltme döngüsü kapandı
            await App.persist(() => Store.siparisler.upsert(guncelSiparis));
          }
        }
        App.toast('Ürün kalite onayından geçti, Sevkiyat Deposu\'na girdi: ' + u.urunAd, 'ok');
        render(main);
      });
    });
    document.querySelectorAll('.kal-reddet-urun').forEach(b => b.onclick = () => {
      const u = bekleyenUrunler.find(x => x.id === b.dataset.id);
      kaliteReddModali({
        baslik: 'Ürün Kalite Reddi — Uygunsuzluk Formu',
        kalemAdi: u.urunAd,
        urunModu: true,
        onOnay: async ({ aciklama, fotograflar, dofAc, hedef }) => {
          u.durum = 'reddedildi';
          u.kaliteRedAciklama = aciklama;
          await App.persist(() => Store.urunKaliteOnaylari.upsert(u));

          // Uygunsuzluk kaydı (ürünlerde DÖF varsayılan önerilir)
          const ncr = await App.kaliteUygunsuzlukOlustur('uretim_urun', {
            kaynakId: u.id, kod: u.urunKod || u.urunAd, ad: u.urunAd,
            miktar: u.miktar || 1, birim: 'ADET', tip: 'urun', refId: u.urunId || null,
            siparisId: u.siparisId || null, aciklama, fotograflar,
            sorumluBirim: 'uretim_planlama', dofAc
          });

          if (hedef === 'iade_ambari') {
            // 2. kalite olarak iade ambarına al (üretime geri DÖNMEZ)
            await App.iadeAmbarinaAktar(ncr, {});
            App.toast('Uygunsuzluk açıldı (' + ncr.no + '), ürün 2. kalite ambarına alındı' + (dofAc ? ' + DÖF' : ''), 'ok');
          } else {
            // Üretime geri gönder
            const guncelSiparisler = await Store.siparisler.all();
            const siparis = guncelSiparisler.find(s => s.id === u.siparisId);
            if (siparis) {
              siparis.uretimDurumu = 'uretimde';
              siparis.kalitedenDondu = true; // Üretim Planlama'da "Kaliteden Dönen" başlığında görünür
              siparis.kaliteRedNotu = aciklama;
              siparis.kaliteRedNcrNo = ncr.no;
              await App.persist(() => Store.siparisler.upsert(siparis));
            }
            App.toast('Uygunsuzluk açıldı (' + ncr.no + '), ürün üretime geri gönderildi' + (dofAc ? ' + DÖF' : ''), 'err');
          }
          render(main);
        }
      });
    });
  }

  // ── ORTAK KALİTE RED / UYGUNSUZLUK MODALI ───────────────────────────────
  // Fotoğraf yükleme (1080p'ye küçültülür), gerekçe ve "DÖF başlat" seçeneği.
  // onOnay({ aciklama, fotograflar[], dofAc }) ile sonucu döndürür.
  function kaliteReddModali({ baslik, kalemAdi, onOnay, urunModu }) {
    const fotolar = []; // {dataUrl}
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">
        <b>${App.escapeHtml(kalemAdi || '')}</b> için uygunsuzluk kaydı açılacaktır.
      </div>
      <div class="fgroup"><label class="flbl">Uygunsuzluk / Kusur Açıklaması <span style="color:var(--red-text)">*</span></label>
        <textarea class="ftextarea" id="krm-aciklama" rows="3" placeholder="Örn: Yüzeyde çizik, ölçü toleransı dışı, renk farkı..."></textarea>
      </div>
      ${urunModu ? `
      <div class="fgroup"><label class="flbl">Ürün Nereye Gitsin?</label>
        <select class="fselect" id="krm-hedef">
          <option value="uretim">Üretime geri gönder (düzeltilecek)</option>
          <option value="iade_ambari">İade / 2. Kalite Ambarı'na al (düzeltilemez, satışa sunulacak)</option>
        </select>
      </div>` : ''}
      <div class="fgroup">
        <label class="flbl">Kusur Fotoğrafları (opsiyonel, otomatik 1080p'ye küçültülür)</label>
        <input type="file" id="krm-foto" accept="image/*" multiple style="font-size:12px">
        <div id="krm-foto-onizleme" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;margin-top:4px">
        <input type="checkbox" id="krm-dof" ${urunModu ? 'checked' : ''}> Düzeltici/Önleyici Faaliyet (DÖF) başlat
      </label>
      <div id="krm-hata" style="color:var(--red-text);font-size:12px;display:none;margin-top:8px">Açıklama girmelisiniz.</div>
    `;
    const footer = `<button class="btn" id="krm-cancel">Vazgeç</button><button class="btn btn-red" id="krm-confirm">Reddet & Uygunsuzluk Aç</button>`;
    App.openModal({ title: baslik || 'Kalite Reddi', body, footer, wide: true });

    const onizleme = body.querySelector('#krm-foto-onizleme');
    body.querySelector('#krm-foto').onchange = async (e) => {
      for (const file of e.target.files) {
        try {
          const dataUrl = await App.fotografKucult(file, 1080, 0.7);
          fotolar.push({ dataUrl });
        } catch (err) { App.toast('Fotoğraf işlenemedi: ' + err.message, 'err'); }
      }
      onizleme.innerHTML = fotolar.map((f, i) =>
        `<div style="position:relative"><img src="${f.dataUrl}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">
         <button data-i="${i}" class="krm-foto-sil" style="position:absolute;top:-6px;right:-6px;background:var(--red-text);color:#fff;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:11px;line-height:1">×</button></div>`
      ).join('');
      onizleme.querySelectorAll('.krm-foto-sil').forEach(btn => btn.onclick = () => {
        fotolar.splice(parseInt(btn.dataset.i), 1);
        body.querySelector('#krm-foto').onchange({ target: { files: [] } });
      });
    };

    document.getElementById('krm-cancel').onclick = App.closeModal;
    document.getElementById('krm-confirm').onclick = () => {
      const aciklama = document.getElementById('krm-aciklama').value.trim();
      if (!aciklama) { document.getElementById('krm-hata').style.display = 'block'; return; }
      const dofAc = document.getElementById('krm-dof').checked;
      const hedef = urunModu ? document.getElementById('krm-hedef').value : null;
      App.closeModal();
      onOnay({ aciklama, fotograflar: fotolar.map(f => f.dataUrl), dofAc, hedef });
    };
  }

  return { render };
})();
