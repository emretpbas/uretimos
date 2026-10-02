// ════════════════════════════════════════════════════════════════════════════
// REÇETE TAMAMLAMA BOTU — "reçeteleri yükledikçe büyük ölçülerin alt kırılımlı
// reçetelerini sistem otomatik arkada tamamlamaya devam etsin... botları
// sisteme kur ve çalışmaya başlasın, sürekli çalışmaya devam etsin, ben
// açtığımda yaptığı ve düzenlediklerini raporlasın" isteğinin Faz 2 (OTOMATİK)
// sürümü.
// ────────────────────────────────────────────────────────────────────────────
// NASIL ÇALIŞIR: sistemdeki TÜM ürün/yarımamül/alt montaj/paket kartları
// taranır (bkz. OlcuVaryantMotoru.tamSistemTaramasi — tarama/eşleştirme
// mantığının TAMAMI motor dosyasında yaşar, burada TEKRARLANMAZ). Kodu Ölçü
// Eşleştirme Anahtarı'nda TANIMLI bir aileye ait VE reçetesi TAM (kalemli)
// olan her kart bir "master" adayıdır — bu ustadan aynı ailenin reçetesi
// EKSİK/BOŞ olan kardeş ölçüleri tamamlanır. Kod örüntüsünden güvenle
// türetilemeyen kalemler (ör. LOGO'nun kendi numaralandırdığı paketleme
// kutuları) ASLA tahmin edilmez, "elle kontrol" raporunda işaretlenir.
//
// OTOMATİK ÇALIŞMA (botCalistirVeUygula, dışa açık — app.js/page_kartlar.js
// çağırır): bulunan her şey OTOMATİK UYGULANIR (kullanıcı onayı beklemez) —
// motor zaten ÇOK MUHAFAZAKAR (sadece AÇIKÇA TANIMLI aile+kod eşleşmesi
// varsa dokunur, aksi halde raporlar) olduğundan bu güvenlidir. Her çalışma
// Store.receteTamamlamaGunlugu'ne bir KAYIT bırakır — "ben açtığımda ne
// yaptığını görmek istiyorum" isteği buradan karşılanır (bkz. render'daki
// "Son Çalışmalar" bölümü). Hiçbir şey yapacak bir şey bulunamazsa (sonuç
// VE eksik eşleşme ikisi de boşsa) günlük KAYDI BİLE YAZILMAZ — gürültü
// birikmesin.
//
// TETİKLEYİCİLER:
//   1) İçe aktarma sonrası (page_kartlar.js, "İçe Aktar ve Kaydet" başarılı
//      olunca) — arka planda, kullanıcıyı BEKLETMEDEN (await edilmez).
//   2) Oturum başlangıcı (app.js, girişten sonra) — son çalışmadan belirli
//      bir süre (BEKLEME_SAATI) geçtiyse arka planda tekrar çalışır; bu,
//      gerçek bir sunucu zamanlayıcısı (cron) OLMADAN "periyodik" isteğinin
//      en güvenilir yaklaşımıdır (uygulama kullanıldıkça çalışır).
//   3) Manuel "Tüm Sistemi Tara" düğmesi (bu sayfa) — SONUÇ UYGULANMADAN
//      ÖNCE gösterilir, kullanıcı "Tümünü Uygula"ya basar; bu TEK tetikleyici
//      otomatik DEĞİLDİR (kullanıcı önizlemek isteyebilir), uygulanınca o da
//      günlüğe 'manuel' olarak yazılır.
// ════════════════════════════════════════════════════════════════════════════
PageModules.recete_tamamlama_botu = (() => {
  const ROLLER = ['admin', 'arge', 'teknik_ofis', 'yonetim'];
  const TIP_KOLEKSIYON = { urun: 'urunler', yarimamul: 'yarimamuller', altmontaj: 'altMontajlar', paket: 'paketler' };
  const TIP_ETIKET = { urun: 'Ürün', yarimamul: 'Yarı Mamül', altmontaj: 'Alt Montaj', paket: 'Paket' };
  const TETIKLEYICI_ETIKET = { ice_aktar_sonrasi: 'İçe aktarma sonrası (otomatik)', oturum_baslangici: 'Oturum başlangıcı (otomatik)', manuel: 'Manuel tarama' };

  async function veriTopla() {
    const [hammaddeler, yarimamuller, altMontajlar, paketler, urunler, receteler, olcuEslestirmeAnahtari] = await Promise.all([
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(),
      Store.paketler.all(), Store.urunler.all(), Store.receteler.all(), Store.olcuEslestirmeAnahtari.all()
    ]);
    return { hammaddeler, yarimamuller, altMontajlar, paketler, urunler, receteler, olcuEslestirmeAnahtari };
  }

  // Bulunan sonuçları (yeni kartlar + yeni/tamamlanan reçeteler) Store'a yazar
  // — hem manuel "Tümünü Uygula" hem de otomatik botCalistirVeUygula AYNI
  // bu fonksiyonu kullanır, yazma mantığı TEK yerde yaşar.
  async function uygulaYazma(sonuclar) {
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

    return { toplamKart: Object.values(yeniKartlarToplam).reduce((a, l) => a + l.length, 0), toplamRecete: receteYazilacak.length };
  }

  // DIŞA AÇIK: app.js (oturum başlangıcı) ve page_kartlar.js (içe aktarma
  // sonrası) bu fonksiyonu çağırır. Bulunan her şeyi OTOMATİK uygular ve
  // Store.receteTamamlamaGunlugu'ne bir kayıt bırakır — kullanıcı "ne
  // yaptığını" bu günlükten (bu sayfanın "Son Çalışmalar" bölümü) görür.
  // Yapacak bir şey bulunamazsa (sonuç VE eksik eşleşme ikisi de boş) HİÇBİR
  // ŞEY yazmaz — günlük sessiz/gereksiz kayıtlarla şişmez.
  async function botCalistirVeUygula(tetikleyici) {
    try {
      const veri = await veriTopla();
      if (!veri.olcuEslestirmeAnahtari.length) return null; // hiç aile tanımlı değil — yapacak bir şey yok
      const { sonuclar, eksikEslesmeler } = OlcuVaryantMotoru.tamSistemTaramasi(veri, App.uid);
      if (!sonuclar.length && !eksikEslesmeler.length) return null;

      let yazma = { toplamKart: 0, toplamRecete: 0 };
      if (sonuclar.length) yazma = await uygulaYazma(sonuclar);

      const logKaydi = {
        id: App.uid('RTG'), zaman: new Date().toISOString(), tetikleyici,
        tamamlananSayisi: sonuclar.length, yeniKartSayisi: yazma.toplamKart, yeniReceteSayisi: yazma.toplamRecete,
        detaylar: sonuclar.map(s => ({ aileAdi: s.aileAdi, masterTip: s.masterTip, masterKod: s.masterKod, hedefKod: s.hedefKod, hedefOlcu: s.hedefOlcu })),
        eksikEslesmeler: eksikEslesmeler.slice(0, 200)
      };
      await Store.topluEkle('receteTamamlamaGunlugu', [logKaydi], 1);
      return logKaydi;
    } catch (e) {
      // Otomatik tetikleyicilerde HATA kullanıcının asıl işlemini (içe
      // aktarma, oturum açma) ENGELLEMEMELİ — sessizce loglanır, bir
      // sonraki tetiklemede tekrar denenir.
      console.error('Reçete Tamamlama Botu otomatik çalışma hatası:', e);
      return null;
    }
  }

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
          <div class="page-sub">Ölçü ailesi tanımlı kartlardan yola çıkarak, eksik ölçü kardeşlerinin reçetelerini otomatik tamamlar — arka planda sürekli çalışır</div>
        </div>
        <div class="page-acts"><button class="btn btn-blue" id="rtb-tara">🔍 Şimdi Tekrar Tara</button></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="fhint">
          Bu bot, <a href="#" id="rtb-anahtar-link">Ölçü Eşleştirme Anahtarı</a>'nda tanımlı ailelere ait, reçetesi
          TAM olan kartları "örnek" (master) alır ve AYNI ailenin reçetesi EKSİK/BOŞ kardeş ölçülerini OTOMATİK
          tamamlar — her "Excelden Reçete İçe Aktar" sonrasında ve uygulamayı her açtığınızda (son çalışmadan belirli
          bir süre geçtiyse) arka planda kendiliğinden çalışır. Kod örüntüsünden güvenle türetilemeyen kalemler
          (ör. ölçüye özel ama LOGO'nun kendi numaralandırdığı paketleme kutuları) ASLA tahmin edilmez — aşağıda
          "Elle Tamamlanması Gerekenler" altında işaretlenir.
        </div>
      </div>
      <div id="rtb-gunluk"></div>
      <div id="rtb-durum" class="fhint"></div>
      <div id="rtb-rapor"></div>
    `;
    document.getElementById('rtb-anahtar-link').onclick = (e) => { e.preventDefault(); App.goTo('olcu_anahtari'); };
    document.getElementById('rtb-tara').onclick = () => taraVeCiz(main);

    await gunlukCiz();
    await elleGerekenleriCiz();
  }

  // "BEN AÇTIĞIMDA YAPTIĞI VE DÜZENLEDİKLERİNİ RAPORLASIN" — son 20 otomatik/
  // manuel çalışmayı, her birinde NE yapıldığını (hangi kart, hangi ölçüye
  // tamamlandı) göstererek listeler.
  async function gunlukCiz() {
    const kapsayici = document.getElementById('rtb-gunluk');
    const gunluk = await Store.receteTamamlamaGunlugu.all();
    gunluk.sort((a, b) => (b.zaman || '').localeCompare(a.zaman || ''));
    const sonYirmi = gunluk.slice(0, 20);
    if (!sonYirmi.length) {
      kapsayici.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="fhint">Bot henüz hiç çalışmadı (ya da yapacak bir şey bulmadı). Önce <a href="#" id="rtb-anahtar-link3">Ölçü Eşleştirme Anahtarı</a>'nda en az bir aile tanımlayın, sonra bir reçete içe aktarın ya da "Şimdi Tekrar Tara"ya basın.</div></div>`;
      const a = document.getElementById('rtb-anahtar-link3');
      if (a) a.onclick = (e) => { e.preventDefault(); App.goTo('olcu_anahtari'); };
      return;
    }
    kapsayici.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <div class="card-title" style="margin-bottom:8px">📜 Son Çalışmalar</div>
        <table class="dtable" style="font-size:11.5px">
          <tr><th>Zaman</th><th>Nasıl Tetiklendi</th><th class="r">Tamamlanan</th><th class="r">Yeni Kart</th><th class="r">Elle Kontrol</th></tr>
          ${sonYirmi.map(g => `<tr>
            <td style="white-space:nowrap">${App.escapeHtml((g.zaman || '').replace('T', ' ').slice(0, 16))}</td>
            <td>${App.escapeHtml(TETIKLEYICI_ETIKET[g.tetikleyici] || g.tetikleyici)}</td>
            <td class="r">${g.tamamlananSayisi || 0}</td>
            <td class="r">${g.yeniKartSayisi || 0}</td>
            <td class="r">${(g.eksikEslesmeler || []).length ? `<span class="pill pill-amber">${g.eksikEslesmeler.length}</span>` : '—'}</td>
          </tr>${(g.detaylar || []).length ? `<tr><td colspan="5" style="font-size:10px;color:var(--muted)">${g.detaylar.map(d => `${App.escapeHtml(d.aileAdi)}: ${App.escapeHtml(d.hedefKod)} (${App.escapeHtml(String(d.hedefOlcu))})`).join(' · ')}</td></tr>` : ''}`).join('')}
        </table>
      </div>`;
  }

  // "YAPAMADIĞI VE BELİRLİ UFAK DEĞİŞİKLİKLERLE TAMAMLANACAK İŞLER İÇİN
  // YÖNLENDİRME YAPSIN" — şu anki (taze, canlı) tarama ile neyin elle
  // tamamlanması gerektiğini gösterir ve DOĞRUDAN ilgili ekrana yönlendirir
  // (ör. "hedef ölçü tanımsız" -> Ölçü Eşleştirme Anahtarı). Bu, günlükten
  // AYRIDIR — günlük GEÇMİŞİ, bu bölüm ŞU ANKİ durumu gösterir.
  async function elleGerekenleriCiz() {
    const veri = await veriTopla();
    if (!veri.olcuEslestirmeAnahtari.length) return; // zaten "henüz tanımlanmadı" mesajı rapor bölümünde gösterilecek
    const { eksikEslesmeler } = OlcuVaryantMotoru.tamSistemTaramasi(veri, () => '__onizleme__');
    if (!eksikEslesmeler.length) return;
    yonlendirmeCiz(eksikEslesmeler);
  }

  function yonlendirmeCiz(eksikEslesmeler) {
    const hedefOlcuTanimsizlar = eksikEslesmeler.filter(e => e.neden === 'hedefOlcuTanimsiz');
    const olcuyeOzelOlabilirler = eksikEslesmeler.filter(e => e.neden === 'olcuyeOzelOlabilirElleKontrolEdin');
    const kapsayici = document.getElementById('rtb-rapor');
    const mevcut = kapsayici.innerHTML;
    kapsayici.innerHTML = `
      ${hedefOlcuTanimsizlar.length ? `
        <div class="card" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:8px">➡ Küçük Bir Tanımla Tamamlanabilir: Hedef Ölçü Eksik (${hedefOlcuTanimsizlar.length})</div>
          <div class="fhint" style="margin-bottom:10px">Bu kartların ailesi tanınıyor ama hedeflenen ölçü için kod parçası henüz Ölçü Eşleştirme Anahtarı'na girilmemiş — ekleyince bot bir sonraki çalışmasında bunları da otomatik tamamlar.</div>
          <table class="dtable" style="font-size:11.5px">
            <tr><th>Aile</th><th>Kod</th><th>Hedef Ölçü</th><th></th></tr>
            ${hedefOlcuTanimsizlar.map(e => `<tr>
              <td>${App.escapeHtml(e.aileAdi || '')}</td>
              <td class="mono">${App.escapeHtml(e.kod || '')}</td>
              <td><span class="pill pill-amber">${App.escapeHtml(String(e.hedefOlcu))}</span></td>
              <td class="r"><button class="btn btn-sm rtb-anahtar-git">Ölçü Eşleştirme Anahtarı'na Git →</button></td>
            </tr>`).join('')}
          </table>
        </div>` : ''}

      ${olcuyeOzelOlabilirler.length ? `
        <div class="card" style="margin-bottom:12px">
          <div class="card-title" style="margin-bottom:8px">⚠ Elle Kontrol Önerilir: Ölçüye Özel Olabilecek Hammaddeler (${olcuyeOzelOlabilirler.length})</div>
          <div class="fhint" style="margin-bottom:10px">Bu hammaddelerin adında kaynak kartın ölçüsü geçiyor — kod örüntüsünden türetilemediği için OTOMATİK değiştirilmedi (ör. paketleme kutusu gibi LOGO'nun kendi numaralandırdığı kalemler). Doğru ölçüdeki karşılığını biliyorsanız ilgili kartın reçetesinden elle güncelleyin.</div>
          <table class="dtable" style="font-size:11.5px">
            <tr><th>Kod</th><th>Ad</th><th>Hangi Master'da</th><th>Hedef Ölçü</th></tr>
            ${olcuyeOzelOlabilirler.map(e => `<tr>
              <td class="mono">${App.escapeHtml(e.kod || '')}</td>
              <td>${App.escapeHtml(e.ad || '')}</td>
              <td class="mono" style="font-size:10px">${App.escapeHtml(e.masterKod || '')}</td>
              <td>${App.escapeHtml(String(e.hedefOlcu))}</td>
            </tr>`).join('')}
          </table>
        </div>` : ''}
      ${mevcut}
    `;
    kapsayici.querySelectorAll('.rtb-anahtar-git').forEach(b => b.onclick = () => App.goTo('olcu_anahtari'));
  }

  async function taraVeCiz(main) {
    const durumEl = document.getElementById('rtb-durum');
    durumEl.textContent = 'Sistem genelinde taranıyor (büyük kataloglarda birkaç saniye sürebilir)…';
    document.getElementById('rtb-rapor').innerHTML = '';

    const veri = await veriTopla();
    if (!veri.olcuEslestirmeAnahtari.length) {
      durumEl.textContent = '';
      document.getElementById('rtb-rapor').innerHTML = `<div class="empty-state"><div class="eicon">📏</div>
        <div class="etitle">Henüz hiç Ölçü Ailesi tanımlanmadı</div>
        <div class="edesc">Önce <a href="#" id="rtb-anahtar-link2">Ölçü Eşleştirme Anahtarı</a>'nda en az bir aile + ölçü eşleştirmesi girin.</div></div>`;
      document.getElementById('rtb-anahtar-link2').onclick = (e) => { e.preventDefault(); App.goTo('olcu_anahtari'); };
      return;
    }

    const { sonuclar, eksikEslesmeler } = OlcuVaryantMotoru.tamSistemTaramasi(veri, App.uid);
    durumEl.textContent = '';
    raporCiz(main, sonuclar, eksikEslesmeler);
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
    if (uygulaBtn) uygulaBtn.onclick = () => uygulaVeGunlukYaz(main, sonuclar, eksikEslesmeler);
  }

  async function uygulaVeGunlukYaz(main, sonuclar, eksikEslesmeler) {
    const yazma = await uygulaYazma(sonuclar);
    await Store.topluEkle('receteTamamlamaGunlugu', [{
      id: App.uid('RTG'), zaman: new Date().toISOString(), tetikleyici: 'manuel',
      tamamlananSayisi: sonuclar.length, yeniKartSayisi: yazma.toplamKart, yeniReceteSayisi: yazma.toplamRecete,
      detaylar: sonuclar.map(s => ({ aileAdi: s.aileAdi, masterTip: s.masterTip, masterKod: s.masterKod, hedefKod: s.hedefKod, hedefOlcu: s.hedefOlcu })),
      eksikEslesmeler: eksikEslesmeler.slice(0, 200)
    }], 1);

    App.toast(`${sonuclar.length} eksik reçete tamamlandı (${yazma.toplamKart} yeni kart, ${yazma.toplamRecete} reçete) — Ürün Kartları & Reçete'den görüntüleyebilirsiniz`, 'ok');
    document.getElementById('rtb-rapor').innerHTML = '';
    await gunlukCiz();
  }

  return { render, botCalistirVeUygula };
})();
