// ════════════════════════════════════════════════════════════════════════════
// REÇETE TAMAMLAMA BOTU — "reçeteleri yükledikçe büyük ölçülerin alt kırılımlı
// reçetelerini sistem otomatik arkada tamamlamaya devam etsin" isteğinin ilk
// (manuel tetiklemeli) sürümü.
// ────────────────────────────────────────────────────────────────────────────
// NASIL ÇALIŞIR: sistemdeki TÜM ürün/yarımamül/alt montaj/paket kartları
// taranır. Kodu Ölçü Eşleştirme Anahtarı'nda TANIMLI bir aileye ait VE
// reçetesi TAM (kalemli) olan her kart bir "master" adayıdır — bu ustadan
// aynı ailenin reçetesi EKSİK/BOŞ olan kardeş ölçüleri olcu_varyant_motoru.js
// ile tamamlanır (bkz. o dosyanın başındaki ayrıntılı yorum — kod örüntüsü
// GÜVENİLİR eşleşmeyse tamamlanır, değilse ASLA tahmin edilmez, raporlanır).
//
// NEDEN MANUEL TETİKLEME (ilk sürüm): kullanıcı "3 seçenekte olsun" dedi
// (yükleme sonrası otomatik + periyodik + manuel) — ama tüm sistemi tarayıp
// veri DEĞİŞTİRMEK (üretim reçeteleri!) ciddi bir işlemdir. Renk motorunun
// "sistem genelinde" özelliği de AYNI nedenle önce manuel "Tara" düğmesiyle
// başladı, gerçek veriyle doğrulandıktan SONRA genişletildi — aynı disiplin
// burada da izleniyor. Otomatik tetikleyiciler (içe aktarma sonrası +
// periyodik) bu motor ONAYLANDIKTAN SONRA eklenecek.
// ════════════════════════════════════════════════════════════════════════════
PageModules.recete_tamamlama_botu = (() => {
  const ROLLER = ['admin', 'arge', 'teknik_ofis', 'yonetim'];
  const TIP_KOLEKSIYON = { urun: 'urunler', yarimamul: 'yarimamuller', altmontaj: 'altMontajlar', paket: 'paketler' };
  const TIP_ETIKET = { urun: 'Ürün', yarimamul: 'Yarı Mamül', altmontaj: 'Alt Montaj', paket: 'Paket' };
  const ID_ALANI = { urun: 'urunId', yarimamul: 'yarimamulId', altmontaj: 'altMontajId', paket: 'paketId' };

  async function render(main, params) {
    const rol = App.aktifRol();
    if (!ROLLER.includes(rol)) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran ARGE, Teknik Ofis ve Yönetim tarafından kullanılır.</div></div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">🤖 Reçete Tamamlama Botu</div>
          <div class="page-sub">Ölçü ailesi tanımlı kartlardan yola çıkarak, eksik ölçü kardeşlerinin reçetelerini otomatik tamamlar</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="rtb-tara">🔍 Tüm Sistemi Tara</button></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="fhint">
          Bu araç, <a href="#" id="rtb-anahtar-link">Ölçü Eşleştirme Anahtarı</a>'nda tanımlı ailelere ait, reçetesi
          TAM olan kartları "örnek" (master) alır ve AYNI ailenin reçetesi EKSİK/BOŞ kardeş ölçülerini tamamlar.
          Kod örüntüsünden güvenle türetilemeyen kalemler (ör. ölçüye özel ama LOGO'nun kendi numaralandırdığı
          paketleme kutuları) ASLA tahmin edilmez — ayrı bir raporda işaretlenir, elle kontrol gerekir.
        </div>
      </div>
      <div id="rtb-durum" class="fhint"></div>
      <div id="rtb-rapor"></div>
    `;
    document.getElementById('rtb-anahtar-link').onclick = (e) => { e.preventDefault(); App.goTo('olcu_anahtari'); };
    document.getElementById('rtb-tara').onclick = () => taraVeCiz(main);
  }

  async function taraVeCiz(main) {
    const durumEl = document.getElementById('rtb-durum');
    durumEl.textContent = 'Sistem genelinde taranıyor (büyük kataloglarda birkaç saniye sürebilir)…';
    document.getElementById('rtb-rapor').innerHTML = '';

    const [hammaddeler, yarimamuller, altMontajlar, paketler, urunler, receteler, olcuEslestirmeAnahtari] = await Promise.all([
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(),
      Store.paketler.all(), Store.urunler.all(), Store.receteler.all(), Store.olcuEslestirmeAnahtari.all()
    ]);

    if (!olcuEslestirmeAnahtari.length) {
      durumEl.textContent = '';
      document.getElementById('rtb-rapor').innerHTML = `<div class="empty-state"><div class="eicon">📏</div>
        <div class="etitle">Henüz hiç Ölçü Ailesi tanımlanmadı</div>
        <div class="edesc">Önce <a href="#" id="rtb-anahtar-link2">Ölçü Eşleştirme Anahtarı</a>'nda en az bir aile + ölçü eşleştirmesi girin.</div></div>`;
      document.getElementById('rtb-anahtar-link2').onclick = (e) => { e.preventDefault(); App.goTo('olcu_anahtari'); };
      return;
    }

    // Çalışma kopyaları: bir adayın ürettiği yeni kartlar/reçeteler bir
    // SONRAKİ adayın işlenmesinde GÖRÜNÜR olmalı (bkz. recete_yapim_raporu
    // _motoru.js'teki AYNI desen) — paylaşılan alt bileşenler mükerrer
    // yaratılmasın, ve AYNI ailenin farklı master'larından başlansa bile
    // bir ölçü SADECE BİR KEZ tamamlansın.
    const calismaVerisi = {
      hammaddeler, yarimamuller: [...yarimamuller], altMontajlar: [...altMontajlar],
      paketler: [...paketler], urunler: [...urunler], receteler: [...receteler], olcuEslestirmeAnahtari
    };
    const kartListesiAl = (tip) => tip === 'urun' ? calismaVerisi.urunler : tip === 'yarimamul' ? calismaVerisi.yarimamuller
      : tip === 'altmontaj' ? calismaVerisi.altMontajlar : calismaVerisi.paketler;

    const tumSonuclar = [];
    const tumEksikEslesmeler = [];
    const islenenAileOlcu = new Set(); // "tip:aileAdi:olcu" -> tekrar işlenmesin

    for (const tip of Object.keys(TIP_KOLEKSIYON)) {
      const liste = kartListesiAl(tip);
      for (const kart of liste) {
        const eslesme = OlcuVaryantMotoru.kodParcasiIleOlcuBul(kart.kod, calismaVerisi.olcuEslestirmeAnahtari);
        if (!eslesme) continue;
        const anahtarIslem = tip + ':' + (eslesme.aile.aileAdi || eslesme.aile.id) + ':' + eslesme.olcu;
        if (islenenAileOlcu.has(anahtarIslem)) continue;
        const kendiRecetesi = calismaVerisi.receteler.find(r => r[ID_ALANI[tip]] === kart.id);
        if (!kendiRecetesi || !(kendiRecetesi.kalemler || []).length) continue; // reçetesi eksik -> master OLAMAZ

        const rapor = OlcuVaryantMotoru.sistemGenelindeOlcuTamamlama(kart.kod, tip, calismaVerisi, App.uid);
        if (rapor.masterBulunamadi || rapor.masterOlcuAilesineAitDegil) continue;
        islenenAileOlcu.add(anahtarIslem);

        rapor.sonuclar.forEach(sonuc => {
          sonuc.yeniKartlar.forEach(({ tip: t, kart: k }) => kartListesiAl(t).push(k));
          sonuc.yeniReceteler.forEach(yeniRecete => {
            const idx = calismaVerisi.receteler.findIndex(r => r.id === yeniRecete.id);
            if (idx >= 0) calismaVerisi.receteler[idx] = yeniRecete; else calismaVerisi.receteler.push(yeniRecete);
          });
          tumSonuclar.push({
            masterTip: tip, masterKod: kart.kod, masterAd: kart.ad, aileAdi: rapor.aileAdi,
            hedefOlcu: sonuc.hedefOlcu, hedefKod: sonuc.hedefKod, hedefAd: sonuc.hedefAd,
            yeniKartlar: sonuc.yeniKartlar, yeniReceteler: sonuc.yeniReceteler
          });
        });
        tumEksikEslesmeler.push(...rapor.eksikEslesmeler.map(e => ({ ...e, masterKod: kart.kod })));
      }
    }

    durumEl.textContent = '';
    raporCiz(main, tumSonuclar, tumEksikEslesmeler);
  }

  function raporCiz(main, sonuclar, eksikEslesmeler) {
    const kapsayici = document.getElementById('rtb-rapor');
    if (!sonuclar.length && !eksikEslesmeler.length) {
      kapsayici.innerHTML = `<div class="empty-state"><div class="eicon">✓</div>
        <div class="etitle">Tamamlanacak eksik reçete bulunamadı</div>
        <div class="edesc">Tanımlı ölçü ailelerindeki tüm kardeşlerin reçeteleri zaten tam, ya da henüz sistemde o ölçüde bir kart yok.</div></div>`;
      return;
    }

    const toplamYeniKart = sonuclar.reduce((a, s) => a + s.yeniKartlar.length, 0);
    const toplamYeniRecete = sonuclar.reduce((a, s) => a + s.yeniReceteler.length, 0);

    kapsayici.innerHTML = `
      ${sonuclar.length ? `
        <div class="card" style="margin-bottom:12px">
          <div class="card-hdr">
            <div class="card-title">✅ Tamamlanacak Eksik Reçeteler (${sonuclar.length}) — ${toplamYeniKart} yeni kart, ${toplamYeniRecete} reçete oluşturulacak/tamamlanacak</div>
            <button class="btn btn-green" id="rtb-uygula">Tümünü Uygula</button>
          </div>
          <table class="dtable" style="font-size:11.5px">
            <tr><th>Aile</th><th>Kaynak (Master)</th><th>Hedef Ölçü</th><th>Hedef Kod</th><th class="r">Yeni Kart</th><th class="r">Reçete</th></tr>
            ${sonuclar.map(s => `<tr>
              <td>${App.escapeHtml(s.aileAdi)}</td>
              <td><span class="pill pill-blue" style="font-size:9.5px">${TIP_ETIKET[s.masterTip]}</span> <span class="mono">${App.escapeHtml(s.masterKod)}</span></td>
              <td><span class="pill pill-green">${App.escapeHtml(String(s.hedefOlcu))}</span></td>
              <td class="mono">${App.escapeHtml(s.hedefKod)}</td>
              <td class="r">${s.yeniKartlar.length}</td>
              <td class="r">${s.yeniReceteler.length}</td>
            </tr>`).join('')}
          </table>
        </div>` : ''}

      ${eksikEslesmeler.length ? `
        <div class="card" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:8px">⚠ Elle Kontrol Gerekiyor (${eksikEslesmeler.length})</div>
          <div class="fhint" style="margin-bottom:10px">Bu kalemler/kartlar kod örüntüsünden GÜVENLE türetilemedi — tahmin edilmedi, kaynak kart/kalem AYNEN bırakıldı.</div>
          <table class="dtable" style="font-size:11.5px">
            <tr><th>Neden</th><th>Kod</th><th>Ad</th><th>Master</th><th>Hedef Ölçü</th></tr>
            ${eksikEslesmeler.map(e => `<tr>
              <td><span class="pill pill-amber" style="font-size:9.5px">${e.neden === 'olcuyeOzelOlabilirElleKontrolEdin' ? 'Ölçüye özel olabilir' : e.neden === 'hedefOlcuTanimsiz' ? 'Hedef ölçü tanımsız' : e.neden}</span></td>
              <td class="mono">${App.escapeHtml(e.kod || '')}</td>
              <td>${App.escapeHtml(e.ad || '')}</td>
              <td class="mono" style="font-size:10px">${App.escapeHtml(e.masterKod || '')}</td>
              <td>${e.hedefOlcu !== undefined ? App.escapeHtml(String(e.hedefOlcu)) : ''}</td>
            </tr>`).join('')}
          </table>
        </div>` : ''}
    `;

    const uygulaBtn = document.getElementById('rtb-uygula');
    if (uygulaBtn) uygulaBtn.onclick = () => uygula(main, sonuclar);
  }

  async function uygula(main, sonuclar) {
    const yeniKartlarToplam = { urun: [], yarimamul: [], altmontaj: [], paket: [] };
    const receteYazilacak = [];
    sonuclar.forEach(sonuc => {
      sonuc.yeniKartlar.forEach(({ tip, kart }) => yeniKartlarToplam[tip].push(kart));
      sonuc.yeniReceteler.forEach(r => receteYazilacak.push(r));
    });

    await App.persist(async () => {
      for (const tip of Object.keys(TIP_KOLEKSIYON)) {
        if (yeniKartlarToplam[tip].length) await Store.topluEkle(TIP_KOLEKSIYON[tip], yeniKartlarToplam[tip]);
      }
      if (receteYazilacak.length) {
        // Her kalem ya YENİ bir reçete kaydıdır ya da ÖNCEDEN VAR OLAN (ama
        // boş) bir reçetenin tamamlanmasıdır — hangisi olduğu Store'daki
        // GÜNCEL id listesine göre ayrıştırılır (receteBul ile hedefli,
        // ağır koleksiyonun TAMAMI indirilmeden — bkz. page_kartlar.js'teki
        // AYNI desen).
        const altReceteIdleri = receteYazilacak.map(r => r.id);
        const urunIdleri = receteYazilacak.filter(r => r.urunId).map(r => r.urunId);
        const mevcutReceteler = await Store.receteBul({ ids: altReceteIdleri, urunIds: urunIdleri });
        const mevcutIdSeti = new Set(mevcutReceteler.map(r => r.id));
        const yeniler = receteYazilacak.filter(r => !mevcutIdSeti.has(r.id));
        const guncellenecekler = receteYazilacak.filter(r => mevcutIdSeti.has(r.id));
        if (yeniler.length) await Store.topluEkle('receteler', yeniler);
        if (guncellenecekler.length) await Store.topluGuncelle('receteler', guncellenecekler);
      }
    });

    const toplamKart = Object.values(yeniKartlarToplam).reduce((a, l) => a + l.length, 0);
    App.toast(`${sonuclar.length} eksik reçete tamamlandı (${toplamKart} yeni kart, ${receteYazilacak.length} reçete) — Ürün Kartları & Reçete'den görüntüleyebilirsiniz`, 'ok');
    document.getElementById('rtb-rapor').innerHTML = '';
  }

  return { render };
})();
