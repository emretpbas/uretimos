// ════════════════════════════════════════════════════════════════════════════
// REÇETE TAMAMLAMA BOTU — "reçeteleri yükledikçe büyük ölçülerin alt kırılımlı
// reçetelerini sistem otomatik arkada tamamlamaya devam etsin... botları
// sisteme kur ve çalışmaya başlasın, sürekli çalışmaya devam etsin, ben
// açtığımda yaptığı ve düzenlediklerini raporlasın" isteğinin Faz 2 (OTOMATİK)
// sürümü.
// ────────────────────────────────────────────────────────────────────────────
// NASIL ÇALIŞIR: sistemdeki TÜM ürün/yarımamül/alt montaj/paket kartları
// taranır (bkz. OlcuVaryantMotoru.tamSistemTaramasi — tarama/eşleştirme
// mantığının TAMAMI motor dosyasında yaşar, burada TEKRARLANMAZ). "Ölçü
// Eşleştirme Anahtarı" ARTIK ELLE GİRİLMİYOR — motor, kartların kod
// örüntüsünden (kodu TEK bir rakam bloğu dışında birebir örtüşen en az 2
// kardeş kart) kendisi bir anahtar çıkarır (bkz. olcu_varyant_motoru.js
// başındaki "ÖLÇÜ EŞLEŞTİRME ANAHTARINI OTOMATİK ÇIKARMA" yorumu). O ailenin
// reçetesi TAM (kalemli) olan her kart bir "master" adayıdır — bu ustadan
// aynı ailenin reçetesi EKSİK/BOŞ olan kardeş ölçüleri tamamlanır. Kod
// örüntüsünden güvenle türetilemeyen kalemler (ör. LOGO'nun kendi
// numaralandırdığı paketleme kutuları) ASLA tahmin edilmez, "elle kontrol"
// raporunda işaretlenir.
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
    const [hammaddeler, yarimamuller, altMontajlar, paketler, urunler, receteler] = await Promise.all([
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(),
      Store.paketler.all(), Store.urunler.all(), Store.receteler.all()
    ]);
    // NOT: Ölçü Eşleştirme Anahtarı artık ELLE GİRİLMİYOR — OlcuVaryantMotoru.
    // tamSistemTaramasi, kartların kod örüntüsünden kendisi taze bir anahtar
    // çıkarır (bkz. olcu_varyant_motoru.js). Burada Store'dan OKUNMAZ.
    return { hammaddeler, yarimamuller, altMontajlar, paketler, urunler, receteler };
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
          Bu bot, elle bir tanım girmenize GEREK KALMADAN, sistemde kayıtlı kartların kod örüntüsünden kendisi
          "ölçü ailelerini" çıkarır: aynı tipte (ürün/yarımamül/alt montaj/paket), kodu TEK BİR rakam bloğu
          (ör. 65/80/100) dışında birebir örtüşen en az 2 kart bulursa, bunları bir aile sayar. Reçetesi TAM olan
          kartı "örnek" (master) alıp AYNI ailenin reçetesi EKSİK/BOŞ kardeş ölçülerini OTOMATİK tamamlar — her
          "Excelden Reçete İçe Aktar" sonrasında ve uygulamayı her açtığınızda (son çalışmadan belirli bir süre
          geçtiyse) arka planda kendiliğinden çalışır. Kod örüntüsünden güvenle türetilemeyen kalemler (ör. ölçüye
          özel ama LOGO'nun kendi numaralandırdığı paketleme kutuları, ya da ölçü DIŞINDA da renk/model ekiyle
          farklılaşan aileler) ASLA tahmin edilmez — aşağıda "Elle Tamamlanması Gerekenler" altında işaretlenir.
        </div>
      </div>
      <div id="rtb-gunluk"></div>
      <div id="rtb-durum" class="fhint"></div>
      <div id="rtb-rapor"></div>
    `;
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
      kapsayici.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="fhint">Bot henüz hiç çalışmadı (ya da yapacak bir şey bulmadı). Sistemde kodu TEK rakam bloğu dışında örtüşen en az 2 kardeş kart (ör. 65cm/80cm) olunca otomatik devreye girer — bir reçete içe aktarın ya da "Şimdi Tekrar Tara"ya basın.</div></div>`;
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
          <div class="card-title" style="margin-bottom:8px">⏳ Bu Ölçüde Henüz Kardeş Kart Yok (${hedefOlcuTanimsizlar.length})</div>
          <div class="fhint" style="margin-bottom:10px">Bu kalemin ailesi tanınıyor ama hedeflenen ölçüde bu kalem için sistemde henüz eşleşen bir kardeş kod yok — o ölçüdeki kart/reçete sisteme girince (ör. bir sonraki Excel içe aktarımıyla) bot bunu bir sonraki taramasında otomatik yakalar.</div>
          <table class="dtable" style="font-size:11.5px">
            <tr><th>Aile</th><th>Kod</th><th>Hedef Ölçü</th></tr>
            ${hedefOlcuTanimsizlar.map(e => `<tr>
              <td>${App.escapeHtml(e.aileAdi || '')}</td>
              <td class="mono">${App.escapeHtml(e.kod || '')}</td>
              <td><span class="pill pill-amber">${App.escapeHtml(String(e.hedefOlcu))}</span></td>
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
  }

  async function taraVeCiz(main) {
    const durumEl = document.getElementById('rtb-durum');
    durumEl.textContent = 'Sistem genelinde taranıyor (büyük kataloglarda birkaç saniye sürebilir)…';
    document.getElementById('rtb-rapor').innerHTML = '';

    const veri = await veriTopla();
    const { sonuclar, eksikEslesmeler } = OlcuVaryantMotoru.tamSistemTaramasi(veri, App.uid);
    durumEl.textContent = '';
    raporCiz(main, sonuclar, eksikEslesmeler);
  }

  function raporCiz(main, sonuclar, eksikEslesmeler) {
    const kapsayici = document.getElementById('rtb-rapor');
    if (!sonuclar.length && !eksikEslesmeler.length) {
      kapsayici.innerHTML = `<div class="empty-state"><div class="eicon">✓</div>
        <div class="etitle">Tamamlanacak eksik reçete bulunamadı</div>
        <div class="edesc">Otomatik olarak tanınan ölçü ailelerindeki tüm kardeşlerin reçeteleri zaten tam, ya da sistemde kodu TEK rakam bloğu dışında örtüşen en az 2 kardeş kart henüz yok.</div></div>`;
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
