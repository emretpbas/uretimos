// ════════════════════════════════════════════════════════════════════════════
// REÇETE AĞAÇ EDİTÖRÜ — Sınırsız derinlikte, tek ekranda, TASLAK tabanlı BOM
// ────────────────────────────────────────────────────────────────────────────
// Reçete Yap ekranındaki kart detay sayfasından "🌳 Ağaç Görünümünde Düzenle"
// ile açılır. Bir ürün/yarımamül/alt montajın TÜM alt kırılımını (paket →
// yarımamül → alt montaj → hammadde, sonsuz derinlik) TEK SAYFADA, baştan
// sona açık/genişletilmiş olarak gösterir.
//
// TASLAK MANTIĞI: Açıldığı anda TÜM veri (receteler, ürünler, yarımamüller,
// alt montajlar, hammaddeler) hafızaya DERİN KOPYA olarak alınır. Kalem
// ekleme/silme/taşıma, miktar/birim değiştirme, yeni kart oluşturma — HİÇBİRİ
// gerçek veritabanına anında yazılmaz, sadece bu kopya üzerinde değişiklik
// yapılır. Sadece "✓ Reçete Olarak Kaydet" butonuna basıldığında TÜM taslak
// (kök kart dahil tüm alt ağaç) gerçek Store koleksiyonlarına tek seferde
// yazılır. "Normal Görünüme Dön" ile kaydedilmemiş değişiklikler varsa
// kullanıcı uyarılır.
// ════════════════════════════════════════════════════════════════════════════
PageModules.recete_agac = (() => {
  let kokKart = null, kokTip = null;
  let veri = null; // { receteler, yarimamuller, urunler, altMontajlar, hammaddeler, rotalar, ayarlar } — TASLAK kopya
  let mainRef = null;
  let geriDonCallback = null;
  let kirli = false; // taslakta kaydedilmemiş değişiklik var mı

  async function ac(main, kart, tip, geriDon) {
    kokKart = JSON.parse(JSON.stringify(kart));
    kokTip = tip; mainRef = main; geriDonCallback = geriDon;
    kirli = false;
    await veriYukle();
    render();
  }

  // Tüm koleksiyonları GERÇEK Store'dan okuyup DERİN KOPYA olarak hafızaya alır.
  // Bu fonksiyon yalnızca İLK açılışta ve "vazgeç" sonrası sıfırlamada çağrılır
  // — taslak üzerinde çalışırken Store'a tekrar gidip üzerine yazmaz.
  async function veriYukle() {
    const [receteler, yarimamuller, urunler, altMontajlar, hammaddeler, rotalar, paketler] = await Promise.all([
      Store.receteler.all(), Store.yarimamuller.all(), Store.urunler.all(), Store.altMontajlar.all(), Store.hammaddeler.all(), Store.rotalar.all(), Store.paketler.all()
    ]);
    veri = {
      receteler: JSON.parse(JSON.stringify(receteler)),
      yarimamuller: JSON.parse(JSON.stringify(yarimamuller)),
      urunler: JSON.parse(JSON.stringify(urunler)),
      altMontajlar: JSON.parse(JSON.stringify(altMontajlar)),
      hammaddeler: JSON.parse(JSON.stringify(hammaddeler)),
      rotalar: JSON.parse(JSON.stringify(rotalar)),
      paketler: JSON.parse(JSON.stringify(paketler)),
      ayarlar: App.state.ayarlar
    };
    // Kök kartın TASLAKTAKİ güncel halini referans alalım (varsa) — böylece
    // önceki bir taslak kaydından sonra tekrar açılırsa güncel veriyle başlar.
    const guncelKok = listeVeTipStatik(kokTip, veri).find(x => x.id === kokKart.id);
    if (guncelKok) kokKart = guncelKok;
  }

  function listeVeTipStatik(tip, v) {
    if (tip === 'urun') return v.urunler;
    if (tip === 'yarimamul') return v.yarimamuller;
    if (tip === 'altmontaj') return v.altMontajlar;
    if (tip === 'paket') return v.paketler;
    return v.hammaddeler;
  }
  function listeVeTip(tip) { return listeVeTipStatik(tip, veri); }
  function kartBul(tip, id) { return listeVeTip(tip).find(x => x.id === id); }
  function receteBul(tip, id) {
    if (tip === 'urun') return veri.receteler.find(r => r.urunId === id);
    if (tip === 'yarimamul') return veri.receteler.find(r => r.yarimamulId === id);
    if (tip === 'altmontaj') return veri.receteler.find(r => r.altMontajId === id);
    return veri.receteler.find(r => r.paketId === id);
  }
  function receteBulVeyaOlustur(tip, id, ad) {
    let r = receteBul(tip, id);
    if (!r) {
      const alanAdi = tip === 'urun' ? 'urunId' : tip === 'yarimamul' ? 'yarimamulId' : tip === 'altmontaj' ? 'altMontajId' : 'paketId';
      r = { id: App.uid('RC'), [alanAdi]: id, ad: ad + ' Reçetesi', kalemler: [] };
      veri.receteler.push(r);
    }
    return r;
  }
  function isaretleKirli() { kirli = true; }

  const TIP_ETIKET = { urun: ['ÜRÜN', 'pill-blue'], yarimamul: ['YM', 'pill-gray'], altmontaj: ['ALT MONTAJ', 'pill-amber'], paket: ['PAKET', 'pill-green'], hammadde: ['HM', 'pill-green'] };
  const TIP_TAM_ADI = { urun: 'Ürün', yarimamul: 'Yarı Mamül', altmontaj: 'Alt Montaj', paket: 'Paket' };

  // ── ESKİ KAYIT UYUMLULUĞU ────────────────────────────────────────────────
  // Reçetede geçerli kalem tipleri: urun / yarimamul / altmontaj / paket /
  // hammadde. 'hirdavat' bir kalem tipi değil, hammadde kartının kategorisidir;
  // eski dolap kayıtlarında yanlışlıkla kalem tipi olarak yazılmıştı. Bu tür
  // kalemleri okurken 'hammadde'ye eşliyoruz ki eski reçeteler de açılsın.
  const ESKI_TIP_ESLEME = { hirdavat: 'hammadde', plaka: 'hammadde', kenar_bandi: 'hammadde' };
  const tipNormalize = (t) => ESKI_TIP_ESLEME[t] || t;

  // ── BİRİM MALİYET HESABI (her node için, satırda gösterilmek üzere) ──────
  // Hammadde: kendi birim fiyatı (plaka ise m² alanına göre, fire dahil,
  // kenar bandı dahil — App.kartMaliyetHesapla'nın hammadde dalıyla AYNI
  // mantık burada tekrarlanır çünkü hammaddenin "birim maliyeti" reçete
  // kalemi bağlamına (ölçü/bant) bağlıdır, tek başına hesaplanamaz).
  // Ürün/Yarı Mamül/Alt Montaj/Paket: kendi alt ağacının TAMAMININ (kalem+
  // rota+amortisman+GYG) toplam maliyeti — App.kartMaliyetHesapla'nın
  // ta kendisi, recursive olarak taslak üzerinden çalışır.
  function birimMaliyetHesapla(tip, kart, kalemBaglami) {
    if (tip === 'hammadde') {
      const fiyatTRY = App.toTRY(kart.birimFiyat, kart.dvz, veri.ayarlar);
      let birimMaliyet;
      if (kart.tip === 'plaka' && kalemBaglami && kalemBaglami.olcu) {
        const alanM2 = ((kalemBaglami.olcu.kabaBoy || kalemBaglami.olcu.netBoy || 0) * (kalemBaglami.olcu.kabaEn || kalemBaglami.olcu.netEn || 0)) / 1e6;
        birimMaliyet = alanM2 * fiyatTRY;
      } else {
        birimMaliyet = fiyatTRY;
      }
      birimMaliyet *= 1 + (kart.fireYuzde || 0) / 100;
      let kenarBandiMaliyet = 0;
      if (kart.tip === 'plaka' && kalemBaglami && kalemBaglami.olcu && kalemBaglami.kenarBantlari) {
        const kenarOlculer = { on: kalemBaglami.olcu.netBoy, arka: kalemBaglami.olcu.netBoy, sag: kalemBaglami.olcu.netEn, sol: kalemBaglami.olcu.netEn };
        ['on', 'arka', 'sag', 'sol'].forEach(kenar => {
          const bantId = kalemBaglami.kenarBantlari[kenar];
          if (!bantId) return;
          const sonuc = App.kenarBandiMaliyetHesapla(kenarOlculer[kenar], bantId, veri.hammaddeler, veri.ayarlar);
          kenarBandiMaliyet += sonuc.maliyet;
        });
      }
      return { birimMaliyet: birimMaliyet + kenarBandiMaliyet, kaynak: kart.birimFiyat ? 'hammadde' : 'yok' };
    }
    const sonuc = App.kartMaliyetHesapla(kart, tip, veri.receteler, veri.yarimamuller, veri.altMontajlar, veri.urunler, veri.hammaddeler, veri.rotalar, veri.ayarlar, undefined, veri.paketler);
    return { birimMaliyet: sonuc.toplam, kaynak: sonuc.kaynak };
  }

  function render() {
    mainRef.innerHTML = `
      <div class="page-hdr">
        <div>
          <div class="page-title">🌳 Reçete Ağaç Editörü <span class="pill ${kirli ? 'pill-amber' : 'pill-gray'}" style="margin-left:8px;font-size:10px">${kirli ? '● Kaydedilmemiş Taslak' : '✓ Değişiklik Yok'}</span></div>
          <div class="page-sub mono">${App.escapeHtml(kokKart.kod)} — ${App.escapeHtml(kokKart.ad)}</div>
        </div>
        <div class="page-acts">
          <button class="btn" id="ra-geri">&larr; Normal Görünüme Dön</button>
          <button class="btn" id="ra-tekrar">🔍 Tekrar Eden Kalemler</button>
          <button class="btn" id="ra-excel-aktar">📥 Alt Kırılım Excel</button>
          <button class="btn btn-green" id="ra-kaydet">✓ Reçete Olarak Kaydet</button>
        </div>
      </div>
      <div class="fhint" style="margin-bottom:12px">⚠ Bu ekrandaki TÜM değişiklikler (kalem ekleme/silme/taşıma, miktar/birim, yeni kart oluşturma) <b>TASLAK</b> olarak tutulur — gerçek sisteme kaydedilmez. Tüm ürün ağacını dilediğiniz gibi düzenleyip bitirdiğinizde <b>"✓ Reçete Olarak Kaydet"</b> butonuna basın; o ana kadar hiçbir şey kalıcı olmaz.</div>
      <div class="card" id="ra-tree-wrap" style="overflow-x:auto"></div>
      <div class="card" id="ra-olcu-wrap"></div>
      <div class="card" id="ra-maliyet-wrap"></div>
    `;
    document.getElementById('ra-geri').onclick = onGeriDon;
    document.getElementById('ra-kaydet').onclick = onKaydet;
    document.getElementById('ra-tekrar').onclick = () => tekrarPenceresiAc();
    document.getElementById('ra-excel-aktar').onclick = () => {
      App.receteAltKirilimExcelIndir(kokKart, kokTip, veri.receteler, veri.yarimamuller, veri.altMontajlar, veri.urunler, veri.hammaddeler, veri.rotalar, veri.ayarlar, veri.paketler);
    };

    const treeWrap = document.getElementById('ra-tree-wrap');
    treeWrap.innerHTML = `<div style="min-width:680px">${renderNode(kokTip, kokKart.id, null, 1, [])}</div>`;
    wireNode(treeWrap);

    const maliyetWrap = document.getElementById('ra-maliyet-wrap');
    renderOlcuPaneli();
    const sonuc = App.kartMaliyetHesapla(kokKart, kokTip, veri.receteler, veri.yarimamuller, veri.altMontajlar, veri.urunler, veri.hammaddeler, veri.rotalar, veri.ayarlar, undefined, veri.paketler);
    maliyetWrap.innerHTML = `<div class="card-hdr"><div class="card-title">Toplam Maliyet (Ağacın Tamamı — Taslak Üzerinden Hesaplanır)</div></div>
      <div class="grid grid-4">
        <div class="kpi"><div class="kpi-lbl">Kalem Maliyeti</div><div class="kpi-val">${App.fmtTL(sonuc.kalemToplami)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Rota</div><div class="kpi-val">${App.fmtTL(sonuc.rotaMaliyeti)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Amortisman</div><div class="kpi-val">${App.fmtTL(sonuc.amortismanGideri)}</div></div>
        <div class="kpi"><div class="kpi-lbl">TOPLAM</div><div class="kpi-val blue">${App.fmtTL(sonuc.toplam)}</div></div>
      </div>
      ${sonuc.eksikKalemler.length ? `<div class="fhint" style="color:var(--red-text);margin-top:8px">⚠ ${sonuc.eksikKalemler.length} kalemin maliyeti hesaplanamadı.</div>` : ''}`;
  }

  function onGeriDon() {
    if (!kirli) { if (geriDonCallback) geriDonCallback(); return; }
    App.confirmDialog('Kaydedilmemiş taslak değişiklikleriniz var. Bu değişiklikler KAYBOLACAK. Normal görünüme dönmek istediğinize emin misiniz?', () => {
      if (geriDonCallback) geriDonCallback();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEKRAR EDEN KALEMLER — TARAMA VE TEMİZLEME
  //
  // Aynı reçetede AYNI kart (tip + refId) birden fazla satırda geçiyorsa bu
  // genelde istenmeyen bir tekrardır: aynı içe aktarma birkaç kez çalıştırılmış
  // ya da kalem yanlışlıkla tekrar eklenmiş olur. Sonuç: alt kırılım listesi
  // gereğinden uzun görünür ve MALİYET kat kat şişer.
  //
  // Temizleme iki şekilde yapılabilir ve SEÇİM KULLANICIYA BIRAKILIR, çünkü
  // hangisinin doğru olduğu verinin nasıl oluştuğuna bağlıdır:
  //   • TEKE İNDİR : tekrarlar silinir, tek satır kalır (miktar değişmez).
  //                  Aynı işlem birkaç kez çalıştıysa doğrusu budur.
  //   • TOPLA      : satırlar tek satırda birleşir, miktarlar toplanır.
  //                  Kalem bilinçli olarak birden çok kez eklendiyse doğrusu budur.
  // Her iki seçeneğin sonuç miktarı önizlemede gösterilir.
  // ══════════════════════════════════════════════════════════════════════════
  function tekrarlariTara() {
    const sahipAdi = (r) => {
      if (r.urunId) return { tip: 'urun', kart: veri.urunler.find(x => x.id === r.urunId) };
      if (r.yarimamulId) return { tip: 'yarimamul', kart: veri.yarimamuller.find(x => x.id === r.yarimamulId) };
      if (r.altMontajId) return { tip: 'altmontaj', kart: veri.altMontajlar.find(x => x.id === r.altMontajId) };
      return { tip: 'paket', kart: veri.paketler.find(x => x.id === r.paketId) };
    };
    const bulgular = [];
    veri.receteler.forEach(r => {
      if (!r.kalemler || r.kalemler.length < 2) return;
      const grup = {};
      r.kalemler.forEach((k, i) => {
        const anahtar = tipNormalize(k.tip) + '|' + k.refId;
        (grup[anahtar] = grup[anahtar] || []).push({ k, i });
      });
      Object.entries(grup).forEach(([anahtar, satirlar]) => {
        if (satirlar.length < 2) return;
        const ilk = satirlar[0].k;
        const kt = kartBul(tipNormalize(ilk.tip), ilk.refId);
        bulgular.push({
          receteId: r.id, sahip: sahipAdi(r), anahtar,
          kod: kt ? (kt.stokKodu || kt.kod || '') : String(ilk.refId),
          ad: kt ? kt.ad : '(kart bulunamadı)',
          tekrar: satirlar.length,
          birim: ilk.birim || '',
          tekMiktar: ilk.miktar || 0,
          toplamMiktar: satirlar.reduce((a, x) => a + (+x.k.miktar || 0), 0)
        });
      });
    });
    return bulgular;
  }

  function tekrarPenceresiAc() {
    const bulgular = tekrarlariTara();
    const body = document.createElement('div');
    if (!bulgular.length) {
      body.innerHTML = `<div class="empty-state" style="padding:24px 10px"><div class="eicon">✓</div>
        <div class="etitle">Tekrar eden kalem yok</div>
        <div class="edesc">Bu ağaçtaki hiçbir reçetede aynı kart birden fazla satırda geçmiyor.</div></div>`;
      App.openModal({ title: '🔍 Tekrar Eden Kalemler', body, footer: `<button class="btn" id="tk-kapat">Kapat</button>` });
      document.getElementById('tk-kapat').onclick = App.closeModal;
      return;
    }
    const toplamFazla = bulgular.reduce((a, b) => a + (b.tekrar - 1), 0);
    body.innerHTML = `
      <div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:8px;padding:9px 11px;
        font-size:12px;color:var(--amber-text);margin-bottom:10px">
        <b>${bulgular.length} kalemde tekrar bulundu</b> — toplam <b>${toplamFazla} fazla satır</b>.
        Aynı kart bir reçetede birden çok kez geçiyor; bu hem listeyi uzatır hem maliyeti şişirir.
      </div>
      <div style="overflow:auto;max-height:340px;border:1px solid var(--border);border-radius:8px">
        <table class="dtable" style="font-size:11.5px;margin:0">
          <tr><th style="width:32px"><input type="checkbox" id="tk-tumu" checked></th>
            <th>Reçete sahibi</th><th>Tekrar eden kalem</th><th class="r">Kaç kez</th>
            <th class="r">Teke indir</th><th class="r">Topla</th></tr>
          ${bulgular.map((b, i) => `<tr>
            <td><input type="checkbox" class="tk-sec" data-i="${i}" checked></td>
            <td>${App.escapeHtml(b.sahip.kart ? (b.sahip.kart.kod || '') : '—')}
              <div class="muted" style="font-size:10px">${App.escapeHtml(b.sahip.kart ? b.sahip.kart.ad : '')}</div></td>
            <td class="mono" style="font-size:10.5px">${App.escapeHtml(b.kod)}
              <div class="muted" style="font-size:10px">${App.escapeHtml(b.ad)}</div></td>
            <td class="r"><b style="color:var(--red-text)">${b.tekrar}×</b></td>
            <td class="r mono">${App.fmt(b.tekMiktar, 3)} ${App.escapeHtml(b.birim)}</td>
            <td class="r mono">${App.fmt(b.toplamMiktar, 3)} ${App.escapeHtml(b.birim)}</td>
          </tr>`).join('')}
        </table></div>
      <div class="fhint" style="margin-top:8px;line-height:1.7">
        <b>Teke indir:</b> fazla satırlar silinir, miktar ilk satırdaki gibi kalır.
        Aynı içe aktarma/işlem birden çok kez çalıştıysa <u>doğru seçenek budur</u>.<br>
        <b>Topla:</b> satırlar birleşir ve miktarlar toplanır. Kalem bilinçli olarak
        birden çok kez eklendiyse bunu seçin.<br>
        Hangisinin doğru olduğunu ancak siz bilirsiniz — yukarıdaki iki sütunda her
        seçeneğin sonuç miktarını karşılaştırabilirsiniz. İşlem <b>taslakta</b> yapılır;
        kalıcı olması için ekrandaki "✓ Reçete Olarak Kaydet" butonuna basmalısınız.
      </div>`;
    App.openModal({
      title: '🔍 Tekrar Eden Kalemler', body, wide: true,
      footer: `<button class="btn" id="tk-vaz">Vazgeç</button>
               <button class="btn btn-blue" id="tk-teke">Seçilenleri Teke İndir</button>
               <button class="btn btn-amber" id="tk-topla">Seçilenleri Topla</button>`
    });
    document.getElementById('tk-vaz').onclick = App.closeModal;
    const tumu = document.getElementById('tk-tumu');
    if (tumu) tumu.onchange = () => body.querySelectorAll('.tk-sec').forEach(c => c.checked = tumu.checked);

    const uygula = (topla) => {
      const secili = [];
      body.querySelectorAll('.tk-sec').forEach(c => { if (c.checked) secili.push(bulgular[+c.dataset.i]); });
      if (!secili.length) { App.toast('Hiçbir kalem seçilmedi', 'err'); return; }
      let silinen = 0;
      secili.forEach(b => {
        const r = veri.receteler.find(x => x.id === b.receteId);
        if (!r) return;
        const kalanlar = [];
        let ilkIndex = -1, toplam = 0;
        r.kalemler.forEach((k) => {
          const anahtar = tipNormalize(k.tip) + '|' + k.refId;
          if (anahtar !== b.anahtar) { kalanlar.push(k); return; }
          toplam += (+k.miktar || 0);
          if (ilkIndex < 0) { ilkIndex = kalanlar.length; kalanlar.push(k); }
          else silinen++;
        });
        if (topla && ilkIndex >= 0) kalanlar[ilkIndex].miktar = Math.round(toplam * 1000) / 1000;
        r.kalemler = kalanlar;
      });
      isaretleKirli();
      App.closeModal();
      App.toast('✓ ' + silinen + ' fazla satır kaldırıldı' + (topla ? ' (miktarlar toplandı)' : '') +
        ' — kalıcı olması için "Reçete Olarak Kaydet" deyin', 'ok');
      render();
    };
    document.getElementById('tk-teke').onclick = () => uygula(false);
    document.getElementById('tk-topla').onclick = () => uygula(true);
  }

  // ── REÇETE OLARAK KAYDET: tüm taslağı (kök kart dahil TÜM alt ağaçtaki
  // yeni/değişen ürün/yarımamül/alt montaj/hammadde kartları ve reçeteler)
  // GERÇEK Store koleksiyonlarına tek seferde yazar.
  async function onKaydet() {
    App.confirmDialog('Tüm ürün/yarı mamül/alt montaj/paket/hammadde ağacı ve reçeteleri kalıcı olarak kaydedilecek. Onaylıyor musunuz?', async () => {
      await App.persist(async () => {
        await Store.urunler.save(veri.urunler);
        await Store.yarimamuller.save(veri.yarimamuller);
        await Store.altMontajlar.save(veri.altMontajlar);
        await Store.paketler.save(veri.paketler);
        await Store.hammaddeler.save(veri.hammaddeler);
        await Store.receteler.save(veri.receteler);
      });
      kirli = false;
      App.toast('Reçete (ve tüm alt kırılımı) başarıyla kaydedildi: ' + kokKart.kod, 'ok');
      render();
    });
  }

  // ── ÖLÇÜ / HACİM / AĞIRLIK PANELİ (ELLE DÜZENLENEBİLİR) ──────────────────
  // Kök kartın ölçü ve ağırlık bilgileri bu ekrandan doğrudan düzenlenir.
  // TASLAK MANTIĞI: değişiklik `veri` içindeki canlı karta yazılır ve kirli
  // bayrağı kalkar; kalıcı olması için "✓ Reçete Olarak Kaydet" gerekir —
  // ekranın geri kalanıyla aynı davranış.
  function renderOlcuPaneli() {
    const wrap = document.getElementById('ra-olcu-wrap');
    if (!wrap) return;
    // Canlı kart: kokKart bir kopyadır, kaydedilen `veri` içindeki objedir
    const canli = kartBul(kokTip, kokKart.id) || kokKart;
    const ozet = kokTip === 'urun'
      ? App.urunPaketOzeti(kokKart.id, veri.receteler, veri.paketler, 1) : null;
    const coz = App.olcuAgirlikCoz(canli, ozet, 1);
    const h = App.olculerdenHacim(canli.en, canli.boy, canli.yukseklik);

    wrap.innerHTML = `
      <div class="card-hdr">
        <div class="card-title">Ölçü, Hacim ve Ağırlık — Elle Düzenle ${App.olcuKaynakRozeti(coz)}</div>
      </div>
      <div class="fhint" style="margin-bottom:10px">Boş bırakırsanız reçetedeki paket kalemlerinden hesaplanır. Değer girerseniz maliyet, fiyat listesi, teklif, sipariş ve sevkiyat ekranlarında o değer kullanılır.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">En (cm)</label><input class="finput ra-olcu" id="ra-en" type="number" min="0" step="0.1" value="${canli.en || ''}"></div>
        <div class="fgroup"><label class="flbl">Boy (cm)</label><input class="finput ra-olcu" id="ra-boy" type="number" min="0" step="0.1" value="${canli.boy || ''}"></div>
        <div class="fgroup"><label class="flbl">Yükseklik (cm)</label><input class="finput ra-olcu" id="ra-yukseklik" type="number" min="0" step="0.1" value="${canli.yukseklik || ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Net Ağırlık (kg)</label><input class="finput ra-olcu" id="ra-netagirlik" type="number" min="0" step="0.01" value="${canli.netAgirlik || ''}"></div>
        <div class="fgroup"><label class="flbl">Brüt Ağırlık (kg)</label><input class="finput ra-olcu" id="ra-brutagirlik" type="number" min="0" step="0.01" value="${canli.brutAgirlik || ''}"></div>
        <div class="fgroup"><label class="flbl">Hacim (otomatik)</label>
          <input class="finput" id="ra-hacim" readonly style="background:var(--bg)" value="${h.gecerli ? App.fmt(h.m3, 4) + ' m³' : ''}">
          <div class="fhint" id="ra-hacim-bilgi">${h.gecerli ? App.fmt(h.desi, 2) + ' desi' : 'En, boy ve yükseklik girilince hesaplanır'}</div>
        </div>
      </div>
      ${coz.receteVar ? `<div class="muted" style="font-size:11px;margin-top:6px">
        Reçetedeki paketlerden hesaplanan: ${App.fmt(coz.receteOzet.paketSayisi, 0)} koli ·
        ${App.fmt(coz.receteOzet.m3, 4)} m³ · ${App.fmt(coz.receteOzet.brutKg, 2)} kg brüt
        ${coz.kaynak === 'manuel' ? ' <b>(elle girilen değer kullanılıyor)</b>' : ''}
      </div>` : ''}
    `;

    const yaz = () => {
      const oku = (id) => parseFloat(document.getElementById(id).value) || 0;
      const yeni = {
        en: oku('ra-en'), boy: oku('ra-boy'), yukseklik: oku('ra-yukseklik'),
        netAgirlik: oku('ra-netagirlik'), brutAgirlik: oku('ra-brutagirlik')
      };
      // Gerçekten değişti mi? Değişmediyse kirli bayrağını boşuna kaldırmayalım.
      const farkli = ['en', 'boy', 'yukseklik', 'netAgirlik', 'brutAgirlik']
        .some(k => (parseFloat(canli[k]) || 0) !== yeni[k]);
      Object.assign(canli, yeni);
      Object.assign(kokKart, yeni);   // başlık/görünüm tutarlılığı
      if (farkli) {
        kirli = true;
        const rozet = document.querySelector('.page-title .pill');
        if (rozet) { rozet.className = 'pill pill-amber'; rozet.style.fontSize = '10px'; rozet.textContent = '● Kaydedilmemiş Taslak'; }
      }
      const hh = App.olculerdenHacim(yeni.en, yeni.boy, yeni.yukseklik);
      document.getElementById('ra-hacim').value = hh.gecerli ? App.fmt(hh.m3, 4) + ' m³' : '';
      document.getElementById('ra-hacim-bilgi').textContent = hh.gecerli
        ? App.fmt(hh.desi, 2) + ' desi' : 'En, boy ve yükseklik girilince hesaplanır';
    };
    wrap.querySelectorAll('.ra-olcu').forEach(i => i.oninput = yaz);
  }

  // ── AĞAÇTAN PAKET ÖLÇÜ/AĞIRLIK DÜZENLEME ────────────────────────────────
  // Paket satırındaki düğmeden açılır. Değişiklik `veri.paketler` içindeki
  // canlı karta yazılır ve taslak olarak işaretlenir — ekranın geri kalanıyla
  // aynı davranış; kalıcı olması için "✓ Reçete Olarak Kaydet" gerekir.
  function openPaketOlcuDuzenle(paketId) {
    const paket = (veri.paketler || []).find(p => p.id === paketId);
    if (!paket) { App.toast('Paket kartı bulunamadı', 'err'); return; }

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Bu ölçüler <b>çeki listesinin</b> ve sevkiyat hacim/ağırlık hesabının kaynağıdır. Girilmezse teklif ve irsaliyede hacim boş görünür.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">En (cm)</label><input class="finput rpo-olcu" id="rpo-en" type="number" min="0" step="0.1" value="${paket.en || ''}"></div>
        <div class="fgroup"><label class="flbl">Boy (cm)</label><input class="finput rpo-olcu" id="rpo-boy" type="number" min="0" step="0.1" value="${paket.boy || ''}"></div>
        <div class="fgroup"><label class="flbl">Yükseklik (cm)</label><input class="finput rpo-olcu" id="rpo-yukseklik" type="number" min="0" step="0.1" value="${paket.yukseklik || ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Net Ağırlık (kg)</label><input class="finput" id="rpo-netagirlik" type="number" min="0" step="0.01" value="${paket.netAgirlik || ''}"></div>
        <div class="fgroup"><label class="flbl">Brüt Ağırlık (kg)</label><input class="finput" id="rpo-brutagirlik" type="number" min="0" step="0.01" value="${paket.brutAgirlik || ''}"></div>
        <div class="fgroup"><label class="flbl">Hacim (otomatik)</label>
          <input class="finput" id="rpo-hacim" readonly style="background:var(--bg)" value="">
          <div class="fhint" id="rpo-hacim-bilgi"></div>
        </div>
      </div>`;

    const footer = `<button class="btn" id="rpo-cancel">Vazgeç</button><button class="btn btn-blue" id="rpo-save">Uygula (Taslağa)</button>`;
    App.openModal({ title: 'Paket Ölçü ve Ağırlığı', sub: paket.kod + ' — ' + paket.ad, body, footer });

    const hesapla = () => {
      const h = App.olculerdenHacim(
        document.getElementById('rpo-en').value,
        document.getElementById('rpo-boy').value,
        document.getElementById('rpo-yukseklik').value);
      document.getElementById('rpo-hacim').value = h.gecerli ? App.fmt(h.m3, 4) + ' m³' : '';
      document.getElementById('rpo-hacim-bilgi').textContent = h.gecerli
        ? App.fmt(h.desi, 2) + ' desi' : 'En, boy ve yükseklik girilince hesaplanır';
    };
    body.querySelectorAll('.rpo-olcu').forEach(i => i.oninput = hesapla);
    hesapla();

    document.getElementById('rpo-cancel').onclick = App.closeModal;
    document.getElementById('rpo-save').onclick = () => {
      const oku = (id) => parseFloat(document.getElementById(id).value) || 0;
      paket.en = oku('rpo-en');
      paket.boy = oku('rpo-boy');
      paket.yukseklik = oku('rpo-yukseklik');
      paket.netAgirlik = oku('rpo-netagirlik');
      paket.brutAgirlik = oku('rpo-brutagirlik');
      kirli = true;
      App.closeModal();
      App.toast('Paket ölçüsü taslağa işlendi — kalıcı olması için "Reçete Olarak Kaydet"', 'ok');
      render();
    };
  }

  // path: kökten bu node'a kadar olan [{tip,id,kalemIndex}] zinciri
  function renderNode(tip, id, kalemBaglami, derinlik, path) {
    tip = tipNormalize(tip);
    const kart = kartBul(tip, id);
    if (!kart) {
      // Karta bağlanmamış kalem (eski kayıtlarda serbest yazılmış hırdavat gibi):
      // ağacı çökertmeden bilgilendirici bir satır olarak göster.
      const serbest = kalemBaglami && (kalemBaglami.serbestAd || kalemBaglami.not);
      return `<div class="muted" style="padding:6px 0;margin-left:${(derinlik - 1) * 26}px;font-size:12px">
        ${serbest ? '⚠ Karta bağlanmamış kalem: <b>' + App.escapeHtml(serbest) + '</b> — Hammaddeler ekranından kart açıp yeniden bağlayın.'
                  : '(kart bulunamadı: ' + App.escapeHtml(String(id)) + ')'}</div>`;
    }
    const [etiket, renk] = TIP_ETIKET[tip] || ['?', 'pill-gray'];
    const recete = receteBul(tip, id);
    const girintiPx = (derinlik - 1) * 26;
    const nodeKey = path.map(p => p.kalemIndex).join('-') || 'kok';

    const { birimMaliyet, kaynak } = birimMaliyetHesapla(tip, kart, kalemBaglami);
    const satirToplami = kalemBaglami ? birimMaliyet * (kalemBaglami.miktar || 1) : birimMaliyet;
    const maliyetRenk = kaynak === 'yok' ? 'var(--red-text)' : 'var(--text2)';

    let html = `<div class="ra-node" data-nodekey="${nodeKey}" style="margin-left:${girintiPx}px;margin-bottom:4px">`;
    html += `<div class="flex-gap" style="padding:7px 9px;background:${derinlik === 1 ? 'var(--blue-bg)' : 'var(--bg)'};border-radius:7px;border-left:3px solid ${derinlik === 1 ? 'var(--blue-text)' : 'var(--border)'}">`;
    html += `<span class="pill ${renk}" style="font-size:9px;flex-shrink:0">${etiket}</span>`;
    html += `<div style="flex:1;min-width:160px;font-size:12px"><b class="mono">${App.escapeHtml(kart.kod || kart.stokKodu)}</b> — ${App.escapeHtml(kart.ad)}</div>`;

    if (kalemBaglami) {
      html += `<input class="finput ra-miktar" data-path="${nodeKey}" type="number" step="0.01" value="${kalemBaglami.miktar}" style="width:70px;text-align:right;font-size:11px;padding:3px 6px;flex-shrink:0">`;
      html += `<select class="fselect ra-birim" data-path="${nodeKey}" style="width:78px;font-size:11px;padding:3px 4px;flex-shrink:0">
        ${['ADET','M2','METRE','KG','GRAM','LITRE'].map(u => `<option value="${u}" ${kalemBaglami.birim === u ? 'selected' : ''}>${u}</option>`).join('')}
      </select>`;
    } else {
      html += `<span class="mono" style="font-size:10.5px;color:var(--text3);flex-shrink:0">(kök kart)</span>`;
    }

    // ── MALİYET SÜTUNU: Birim Maliyet ve Satır Toplamı ──────────────────────
    html += `<div style="flex-shrink:0;text-align:right;min-width:150px;font-size:10.5px;color:${maliyetRenk};line-height:1.3">
      <div>Birim: <b>${kaynak === 'yok' ? '⚠ Yok' : App.fmtTL(birimMaliyet)}</b></div>
      ${kalemBaglami ? `<div style="color:var(--text3)">Satır: <b>${kaynak === 'yok' ? '—' : App.fmtTL(satirToplami)}</b></div>` : ''}
    </div>`;

    if (tip !== 'hammadde') {
      html += `<button class="btn btn-sm btn-ghost ra-add-kalem" data-path="${nodeKey}" data-tip="${tip}" data-id="${id}" title="Bu satırın altına kalem ekle">+ Alt Kalem</button>`;
      html += `<button class="btn btn-sm btn-ghost ra-degistir" data-path="${nodeKey}" data-tip="${tip}" data-id="${id}" title="Bu kartın adını/kodunu değiştir veya farklı bir kartla değiştir">✏️ Değiştir</button>`;
    }
    // ── PAKET SATIRLARINDA HACİM/AĞIRLIK DÜĞMESİ ────────────────────────────
    // Paket kartının ölçü ve ağırlığı çeki listesinin ve sevkiyat hacminin
    // kaynağıdır. Ağaçtan çıkmadan doğrudan girilebilsin diye buraya konur.
    // Ölçü girilmemişse düğme uyarı rengiyle dikkat çeker.
    if (tip === 'paket') {
      const h = App.olculerdenHacim(kart.en, kart.boy, kart.yukseklik);
      const agirlikVar = !!(parseFloat(kart.brutAgirlik) || parseFloat(kart.netAgirlik));
      const eksik = !h.gecerli || !agirlikVar;
      html += `<button class="btn btn-sm ${eksik ? 'btn-amber' : 'btn-ghost'} ra-olcu-ekle"
        data-path="${nodeKey}" data-id="${id}"
        style="flex-shrink:0${eksik ? ';color:var(--amber-text)' : ''}"
        title="${eksik ? 'Ölçü/ağırlık eksik — çeki listesi ve sevkiyat hacmi hesaplanamaz' : (App.fmt(h.m3, 4) + ' m³ · ' + App.fmt(kart.brutAgirlik || 0, 2) + ' kg')}">
        ${eksik ? '⚠ Hacim/Ağırlık Ekle' : '📐 ' + App.fmt(h.m3, 3) + ' m³ · ' + App.fmt(kart.brutAgirlik || 0, 1) + ' kg'}
      </button>`;
    }
    if (kalemBaglami) {
      html += `<button class="btn btn-sm btn-ghost ra-tasi" data-path="${nodeKey}" title="Başka bir üst kaleme taşı">↕ Taşı</button>`;
      html += `<button class="btn btn-icon btn-ghost ra-sil" data-path="${nodeKey}" style="color:var(--red-text)" title="Reçeteden çıkar">&times;</button>`;
    }
    html += `</div>`;

    if (tip === 'hammadde' && kart.tip === 'plaka' && kalemBaglami && kalemBaglami.olcu) {
      const kenarEtiketleri = { on: 'Ön', arka: 'Arka', sag: 'Sağ', sol: 'Sol' };
      html += `<div style="margin-left:${girintiPx + 20}px;margin-top:2px;margin-bottom:4px;padding:5px 9px;font-size:10px;color:var(--text3);display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <span>Kaba: ${kalemBaglami.olcu.kabaEn || '—'}×${kalemBaglami.olcu.kabaBoy || '—'}mm</span>
        <span>Net: ${kalemBaglami.olcu.netEn || '—'}×${kalemBaglami.olcu.netBoy || '—'}mm</span>
        ${kalemBaglami.kenarBantlari ? Object.entries(kalemBaglami.kenarBantlari).filter(([, v]) => v).map(([kenar, bantId]) => {
          const bant = veri.hammaddeler.find(x => x.id === bantId);
          return `<span>${kenarEtiketleri[kenar]} Bant: ${bant ? App.escapeHtml(bant.ad) : '—'}</span>`;
        }).join('') : ''}
        <button class="btn btn-sm btn-ghost ra-olcu-duzenle" data-path="${nodeKey}" style="font-size:9.5px;padding:2px 7px">✎ Ölçü/Bandı Düzenle</button>
      </div>`;
    }

    // ── İNLİNE ROTA + AMORTİSMAN AYARI (Ürün/Yarı Mamül/Alt Montaj/Paket) ───
    // Kullanıcı isteği: "ürün ağacında amortisman ve rota ayarlarını manuel
    // olarak yapalım" — kart düzenleme formuna gitmeden, doğrudan ağaçtaki
    // satırın altından rota seçilebilir ve amortisman/GYG girilebilir.
    if (tip !== 'hammadde') {
      const rotaSecili = kart.rotaId ? veri.rotalar.find(r => r.id === kart.rotaId) : null;
      html += `<div style="margin-left:${girintiPx + 20}px;margin-top:2px;margin-bottom:4px;padding:6px 9px;background:var(--bg);border-radius:6px;border:1px dashed var(--border);display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:10.5px">
        <span style="color:var(--text3);flex-shrink:0">⚙ Rota:</span>
        <select class="fselect ra-rota" data-tip="${tip}" data-id="${id}" style="font-size:10.5px;padding:3px 6px;max-width:220px">
          <option value="">— Rota Yok —</option>
          ${veri.rotalar.map(r => `<option value="${r.id}" ${kart.rotaId === r.id ? 'selected' : ''}>${App.escapeHtml(r.ad)} (${App.fmtTL(r.toplamMaliyet || 0)})</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-ghost ra-yeni-rota" data-tip="${tip}" data-id="${id}" style="font-size:9.5px;padding:2px 7px">+ Yeni Rota</button>
        <span style="color:var(--text3);flex-shrink:0;margin-left:6px">Amortisman (₺):</span>
        <input class="finput ra-amortisman" data-tip="${tip}" data-id="${id}" type="number" step="0.01" value="${kart.amortismanGideri || 0}" style="width:80px;font-size:10.5px;padding:3px 6px">
        <span style="color:var(--text3);flex-shrink:0">GYG (%):</span>
        <input class="finput ra-gyg" data-tip="${tip}" data-id="${id}" type="number" step="0.1" value="${kart.gygOraniYuzde || 0}" style="width:60px;font-size:10.5px;padding:3px 6px">
      </div>`;
    }

    if (tip !== 'hammadde' && recete && recete.kalemler.length) {
      // ── DÖNGÜ VE DERİNLİK KORUMASI ──────────────────────────────────────
      // Reçetede A→B→A gibi bir döngü varsa özyineleme sonsuza gider ve
      // tarayıcı kilitlenir. Bu yüzden kökten buraya kadar olan zincirde
      // AYNI KART tekrar geçiyorsa dallanma durdurulur ve uyarı gösterilir.
      const zincir = path.map(p => p.tip + ':' + p.id);
      const buKart = tip + ':' + id;
      if (zincir.indexOf(buKart) >= 0) {
        html += `<div style="margin-left:${derinlik * 26}px;margin-bottom:4px;padding:6px 9px;
          background:var(--red-bg);border-radius:7px;border-left:3px solid var(--red);font-size:11.5px;color:var(--red-text)">
          ⚠ <b>Döngü tespit edildi</b> — bu kart kendi alt ağacında tekrar geçiyor
          (${App.escapeHtml(kart.kod || '')}). Dallanma durduruldu; reçeteyi düzeltin.</div>`;
      } else if (derinlik >= 15) {
        html += `<div style="margin-left:${derinlik * 26}px;margin-bottom:4px;padding:6px 9px;
          background:var(--amber-bg);border-radius:7px;font-size:11.5px;color:var(--amber-text)">
          ⚠ 15. seviyeye ulaşıldı — alt kırılım bu noktada kesildi.</div>`;
      } else {
        recete.kalemler.forEach((k, i) => {
          const altPath = [...path, { tip, id, kalemIndex: i }];
          html += renderNode(k.tip, k.refId, k, derinlik + 1, altPath);
        });
      }
    }
    html += `</div>`;
    return html;
  }

  function pathCoz(nodeKey) {
    if (nodeKey === 'kok') return { recete: null, kalemIndex: -1, kalem: null, ustTip: kokTip, ustId: kokKart.id };
    const indexler = nodeKey.split('-').map(Number);
    let tip = kokTip, id = kokKart.id;
    let recete = null, kalem = null, kalemIndex = -1;
    for (let derinlik = 0; derinlik < indexler.length; derinlik++) {
      recete = receteBul(tip, id);
      if (!recete) return null;
      kalemIndex = indexler[derinlik];
      kalem = recete.kalemler[kalemIndex];
      if (!kalem) return null;
      tip = tipNormalize(kalem.tip); id = kalem.refId;
    }
    return { recete, kalemIndex, kalem, ustTip: tip, ustId: id };
  }

  function wireNode(wrap) {
    wrap.querySelectorAll('.ra-miktar').forEach(inp => {
      const commit = () => {
        const cozum = pathCoz(inp.dataset.path);
        if (!cozum || !cozum.kalem) return;
        const yeni = parseFloat(inp.value);
        if (isNaN(yeni) || yeni <= 0) { App.toast('Geçerli bir miktar girin', 'err'); return; }
        cozum.kalem.miktar = yeni;
        isaretleKirli();
        render();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); commit(); } };
      inp.onblur = commit;
    });
    wrap.querySelectorAll('.ra-birim').forEach(sel => sel.onchange = () => {
      const cozum = pathCoz(sel.dataset.path);
      if (!cozum || !cozum.kalem) return;
      cozum.kalem.birim = sel.value;
      isaretleKirli();
      render();
    });
    wrap.querySelectorAll('.ra-sil').forEach(b => b.onclick = () => {
      const cozum = pathCoz(b.dataset.path);
      if (!cozum || !cozum.kalem) return;
      App.confirmDialog('Bu kalemi reçete taslağından çıkarmak istediğinize emin misiniz? (Henüz kaydedilmedi; "Reçete Olarak Kaydet" dediğinizde bu çıkarma da kalıcı olur.)', () => {
        cozum.recete.kalemler.splice(cozum.kalemIndex, 1);
        isaretleKirli();
        render();
      });
    });
    wrap.querySelectorAll('.ra-add-kalem').forEach(b => b.onclick = () => openAltKalemEkle(b.dataset.tip, b.dataset.id));
    wrap.querySelectorAll('.ra-degistir').forEach(b => b.onclick = () => openDegistirSecimModal(b.dataset.path, b.dataset.tip, b.dataset.id));
    wrap.querySelectorAll('.ra-olcu-ekle').forEach(b => b.onclick = () => openPaketOlcuDuzenle(b.dataset.id));
    wrap.querySelectorAll('.ra-tasi').forEach(b => b.onclick = () => openTasiModal(b.dataset.path));
    wrap.querySelectorAll('.ra-olcu-duzenle').forEach(b => b.onclick = () => openOlcuDuzenleModal(b.dataset.path));

    // ── İNLİNE ROTA + AMORTİSMAN + GYG (kart düzenleme formuna gitmeden) ─────
    wrap.querySelectorAll('.ra-rota').forEach(sel => sel.onchange = () => {
      const kart = kartBul(sel.dataset.tip, sel.dataset.id);
      if (!kart) return;
      kart.rotaId = sel.value || null;
      isaretleKirli();
      App.toast('Rota güncellendi (taslak)', 'ok');
      render();
    });
    wrap.querySelectorAll('.ra-amortisman').forEach(inp => {
      const commit = () => {
        const kart = kartBul(inp.dataset.tip, inp.dataset.id);
        if (!kart) return;
        kart.amortismanGideri = parseFloat(inp.value) || 0;
        isaretleKirli();
        render();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); commit(); } };
      inp.onblur = commit;
    });
    wrap.querySelectorAll('.ra-gyg').forEach(inp => {
      const commit = () => {
        const kart = kartBul(inp.dataset.tip, inp.dataset.id);
        if (!kart) return;
        kart.gygOraniYuzde = parseFloat(inp.value) || 0;
        isaretleKirli();
        render();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); commit(); } };
      inp.onblur = commit;
    });
    wrap.querySelectorAll('.ra-yeni-rota').forEach(b => b.onclick = () => {
      const tip = b.dataset.tip, id = b.dataset.id;
      // Mevcut taslak rota listesi gerçek Store'a henüz yansımamış olabilir;
      // yeni rota oluşturma modalı kendi içinde gerçek Store.rotalar'ı
      // kullanır (rota, taslak mantığının DIŞINDA, kendi başına kalıcı bir
      // kart tipi olduğu için ayrıca "Reçete Olarak Kaydet" beklemez).
      PageModules.rota.openRotaEditorModal(null, async (yeniRota) => {
        if (yeniRota) {
          veri.rotalar = await Store.rotalar.all();
          const kart = kartBul(tip, id);
          if (kart) { kart.rotaId = yeniRota.id; isaretleKirli(); }
        }
        render();
      });
    });
  }

  // ── Herhangi bir seviyenin altına kalem ekleme — TASLAK üzerinde çalışır.
  // Kalem Seçici sayfası açılır (gerçek bir route navigasyonu), seçim/yeni
  // kart işlemleri SADECE yerel `veri` kopyasını değiştirir, Store'a yazmaz.
  async function openAltKalemEkle(tip, id) {
    const kart = kartBul(tip, id);
    const recete = receteBulVeyaOlustur(tip, id, kart.ad);
    const hmGruplar = {};
    veri.hammaddeler.forEach(h => {
      if (h.tip === 'kenar_bandi') return;
      const kat = h.kategori || 'Diğer';
      const grupKey = 'hm_' + kat.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (!hmGruplar[grupKey]) hmGruplar[grupKey] = { ad: kat, kalemler: [] };
      hmGruplar[grupKey].kalemler.push(h);
    });
    const secenekler = [
      ...veri.urunler.filter(u => !(tip === 'urun' && u.id === id)).map(u => ({ grup: 'urun', kod: u.kod, ad: u.ad, netFiyat: 0, birim: 'ADET', _id: u.id })),
      ...veri.yarimamuller.filter(y => !(tip === 'yarimamul' && y.id === id)).map(y => ({ grup: 'yarimamul', kod: y.kod, ad: y.ad, netFiyat: 0, birim: 'ADET', _id: y.id })),
      ...veri.altMontajlar.filter(a => !(tip === 'altmontaj' && a.id === id)).map(a => ({ grup: 'altmontaj', kod: a.kod, ad: a.ad, netFiyat: 0, birim: 'ADET', _id: a.id })),
      ...veri.paketler.filter(p => !(tip === 'paket' && p.id === id)).map(p => ({ grup: 'paket', kod: p.kod, ad: p.ad, netFiyat: 0, birim: 'ADET', _id: p.id })),
      ...Object.entries(hmGruplar).flatMap(([grupKey, g]) => g.kalemler.map(h => ({ grup: grupKey, kod: h.stokKodu || h.id, ad: h.ad, netFiyat: App.toTRY(h.birimFiyat, h.dvz, veri.ayarlar), birim: h.birim, _id: h.id })))
    ];
    const gruplar = { urun: 'Bitmiş Ürünler', yarimamul: 'Yarı Mamüller', altmontaj: 'Alt Montajlar', paket: 'Paketler' };
    Object.entries(hmGruplar).forEach(([grupKey, g]) => { gruplar[grupKey] = g.ad; });

    App.goTo('kalem_secici', {
      baslik: 'Kalem Ekle (Taslak): ' + kart.kod,
      secenekler, gruplar,
      yeniKartEklenebilir: true,
      geriDon: () => { reAcVeRender(); },
      onSecildi: (secim) => {
        const kalemTip = secim.grup === 'urun' ? 'urun' : secim.grup === 'yarimamul' ? 'yarimamul' : secim.grup === 'altmontaj' ? 'altmontaj' : secim.grup === 'paket' ? 'paket' : 'hammadde';
        openMiktarSorForm(secim, (miktar, birim, olcu, kenarBantlari) => {
          const yeniKalem = { tip: kalemTip, refId: secim._id, miktar, birim };
          if (olcu) yeniKalem.olcu = olcu;
          if (kenarBantlari) yeniKalem.kenarBantlari = kenarBantlari;
          recete.kalemler.push(yeniKalem);
          isaretleKirli();
          App.toast('Kalem taslağa eklendi (henüz kaydedilmedi)', 'ok');
          reAcVeRender();
        });
      },
      onYeniKartIstendi: (yeniKartBilgisi) => {
        openYeniKartOlusturForm(yeniKartBilgisi, (yeniTip, yeniId, miktar, birim) => {
          recete.kalemler.push({ tip: yeniTip, refId: yeniId, miktar, birim });
          isaretleKirli();
          App.toast('Yeni kart taslağa oluşturuldu ve eklendi (henüz kaydedilmedi)', 'ok');
          reAcVeRender();
        });
      }
    });
  }

  function reAcVeRender() { mainRef.innerHTML = ''; render(); }

  // Miktar/birim sorma — eğer seçilen kalem PLAKA ise ölçü+kenar bandı da sorar.
  function openMiktarSorForm(secim, onTamam) {
    const hm = veri.hammaddeler.find(h => h.id === secim._id);
    const isPlaka = hm && hm.tip === 'plaka';
    const kenarBantlari = veri.hammaddeler.filter(h => h.tip === 'kenar_bandi');
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px"><b class="mono">${App.escapeHtml(secim.kod)}</b> — ${App.escapeHtml(secim.ad)}</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Miktar</label><input class="finput" id="ms-miktar" type="number" value="1" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Birim</label>
          <select class="fselect" id="ms-birim">
            ${['ADET','M2','METRE','KG','GRAM','LITRE'].map(u => `<option value="${u}" ${secim.birim === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      ${isPlaka ? `
        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">Ölçü Bilgisi (mm)</div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Kaba En</label><input class="finput" id="ms-kaba-en" type="number" step="1"></div>
          <div class="fgroup"><label class="flbl">Kaba Boy</label><input class="finput" id="ms-kaba-boy" type="number" step="1"></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Net En</label><input class="finput" id="ms-net-en" type="number" step="1"></div>
          <div class="fgroup"><label class="flbl">Net Boy</label><input class="finput" id="ms-net-boy" type="number" step="1"></div>
        </div>
        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">Kenar Bandı</div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Ön (Net Boy)</label><select class="fselect" id="ms-bant-on"><option value="">— Bantsız —</option>${kenarBantlari.map(b => `<option value="${b.id}">${App.escapeHtml(b.ad)}</option>`).join('')}</select></div>
          <div class="fgroup"><label class="flbl">Arka (Net Boy)</label><select class="fselect" id="ms-bant-arka"><option value="">— Bantsız —</option>${kenarBantlari.map(b => `<option value="${b.id}">${App.escapeHtml(b.ad)}</option>`).join('')}</select></div>
        </div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Sağ (Net En)</label><select class="fselect" id="ms-bant-sag"><option value="">— Bantsız —</option>${kenarBantlari.map(b => `<option value="${b.id}">${App.escapeHtml(b.ad)}</option>`).join('')}</select></div>
          <div class="fgroup"><label class="flbl">Sol (Net En)</label><select class="fselect" id="ms-bant-sol"><option value="">— Bantsız —</option>${kenarBantlari.map(b => `<option value="${b.id}">${App.escapeHtml(b.ad)}</option>`).join('')}</select></div>
        </div>
      ` : ''}
    `;
    const footer = `<button class="btn" id="ms-cancel">Vazgeç</button><button class="btn btn-blue" id="ms-save">Taslağa Ekle</button>`;
    App.openModal({ title: 'Miktar Girin', sub: secim.kod, body, footer, wide: isPlaka });
    document.getElementById('ms-cancel').onclick = App.closeModal;
    document.getElementById('ms-save').onclick = () => {
      const miktar = parseFloat(document.getElementById('ms-miktar').value) || 1;
      const birim = document.getElementById('ms-birim').value;
      let olcu = null, kenarBantlariSecim = null;
      if (isPlaka) {
        olcu = {
          kabaEn: parseFloat(document.getElementById('ms-kaba-en').value) || null,
          kabaBoy: parseFloat(document.getElementById('ms-kaba-boy').value) || null,
          netEn: parseFloat(document.getElementById('ms-net-en').value) || null,
          netBoy: parseFloat(document.getElementById('ms-net-boy').value) || null
        };
        kenarBantlariSecim = {
          on: document.getElementById('ms-bant-on').value || null,
          arka: document.getElementById('ms-bant-arka').value || null,
          sag: document.getElementById('ms-bant-sag').value || null,
          sol: document.getElementById('ms-bant-sol').value || null
        };
      }
      App.closeModal();
      onTamam(miktar, birim, olcu, kenarBantlariSecim);
    };
  }

  // ── DEĞİŞTİR: bir ürün/yarımamül/alt montaj/paket düğümü için iki seçenek
  // sunar — (1) kartın kendi adını/kodunu TASLAKTA değiştirmek (kart aynı
  // kalır, sadece bilgisi güncellenir; başka reçetelerde de kullanılıyorsa
  // orada da yeni adıyla görünür — kart tek bir kayıt, ağaçta yalnızca
  // referans edilir), (2) bu satırdaki kalemi TAMAMEN FARKLI, yeni oluşturulan
  // bir karta bağlamak (miktar/birim korunur, eski kart silinmez/etkilenmez).
  // Kök karta (nodeKey==='kok') bir üst kalem yok, bu yüzden yalnızca (1)
  // sunulur.
  function openDegistirSecimModal(nodeKey, tip, id) {
    const kart = kartBul(tip, id);
    if (!kart) { App.toast('Kart bulunamadı', 'err'); return; }
    const tamAd = TIP_TAM_ADI[tip] || tip;
    const kokMu = nodeKey === 'kok';
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:12px"><b class="mono">${App.escapeHtml(kart.kod || '')}</b> — ${App.escapeHtml(kart.ad || '')} için ne yapmak istiyorsunuz?</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn" id="ds-yeniden-adlandir" style="text-align:left;padding:12px 14px;height:auto">
          <div style="font-weight:700">✏️ Mevcut ${tamAd} Kartının Adını/Kodunu Değiştir</div>
          <div class="muted" style="font-size:11px;margin-top:2px;font-weight:400">Bu kart kullanıldığı HER YERDE (başka reçetelerde de) yeni adıyla görünür.</div>
        </button>
        ${!kokMu ? `<button class="btn" id="ds-yeni-kart" style="text-align:left;padding:12px 14px;height:auto">
          <div style="font-weight:700">🔁 Yeni Bir ${tamAd} Kartı Oluştur ve Bununla Değiştir</div>
          <div class="muted" style="font-size:11px;margin-top:2px;font-weight:400">Bu satır, yeni oluşturulacak farklı bir karta bağlanır (miktar/birim korunur). Eski kart silinmez, başka yerde kullanılıyorsa etkilenmez.</div>
        </button>` : `<div class="fhint">Kök karttaki satırın bir üst kalemi yoktur, bu yüzden yalnızca adı/kodu değiştirilebilir — farklı bir kartla değiştirmek için ağacı o karttan yeniden açın.</div>`}
      </div>
    `;
    App.openModal({ title: 'Değiştir', body, footer: `<button class="btn" id="ds-kapat">Kapat</button>`, wide: true });
    document.getElementById('ds-kapat').onclick = App.closeModal;
    document.getElementById('ds-yeniden-adlandir').onclick = () => { App.closeModal(); openKartYenidenAdlandirForm(tip, id); };
    const yeniKartBtn = document.getElementById('ds-yeni-kart');
    if (yeniKartBtn) yeniKartBtn.onclick = () => {
      App.closeModal();
      const cozum = pathCoz(nodeKey);
      if (!cozum || !cozum.kalem) { App.toast('Kalem bulunamadı', 'err'); return; }
      openYeniKartOlusturForm({ kod: '', ad: '' }, (yeniTip, yeniId) => {
        cozum.kalem.tip = yeniTip;
        cozum.kalem.refId = yeniId;
        // Ölçü/kenar bandı bilgisi eski (muhtemelen hammadde) karta özgüydü;
        // yeni kart urun/yarimamul/altmontaj/paket olduğundan anlamsız kalır.
        delete cozum.kalem.olcu;
        delete cozum.kalem.kenarBantlari;
        isaretleKirli();
        App.toast('Satır yeni oluşturulan karta bağlandı (taslak) — kalıcı olması için "Reçete Olarak Kaydet"', 'ok');
        reAcVeRender();
      }, tip);
    };
  }

  // Bir ürün/yarımamül/alt montaj/paket kartının kod/adını TASLAKTA değiştirir
  // — kart tek bir kayıttır, bu ağacın dışında başka reçetelerde de aynı
  // kart referans ediliyorsa oralarda da güncel ad/kod görünür.
  function openKartYenidenAdlandirForm(tip, id) {
    const kart = kartBul(tip, id);
    if (!kart) { App.toast('Kart bulunamadı', 'err'); return; }
    const tamAd = TIP_TAM_ADI[tip] || tip;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Bu kart TASLAKTA yeniden adlandırılacak — kalıcı olması için "✓ Reçete Olarak Kaydet" gerekir.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kod</label><input class="finput" id="ka-kod" value="${App.escapeHtml(kart.kod || '')}"></div>
        <div class="fgroup"><label class="flbl">Ad</label><input class="finput" id="ka-ad" value="${App.escapeHtml(kart.ad || '')}"></div>
      </div>
    `;
    const footer = `<button class="btn" id="ka-cancel">Vazgeç</button><button class="btn btn-blue" id="ka-save">Taslağa Kaydet</button>`;
    App.openModal({ title: tamAd + ' Adını/Kodunu Değiştir (Taslak)', sub: kart.kod || '', body, footer, wide: true });
    document.getElementById('ka-cancel').onclick = App.closeModal;
    document.getElementById('ka-save').onclick = () => {
      const kod = document.getElementById('ka-kod').value.trim();
      const ad = document.getElementById('ka-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      kart.kod = kod; kart.ad = ad;
      if (tip === kokTip && id === kokKart.id) { kokKart.kod = kod; kokKart.ad = ad; }
      isaretleKirli();
      App.toast('İsim taslakta güncellendi — kalıcı olması için "Reçete Olarak Kaydet"', 'ok');
      App.closeModal();
      reAcVeRender();
    };
  }

  // Yeni kart oluşturma (Yarımamül/Alt Montaj/Hırdavat/Diğer-kategori) —
  // SADECE taslak listelerine (veri.yarimamuller/altMontajlar/hammaddeler)
  // eklenir, gerçek Store'a YAZILMAZ. Kategori adı bile (yeni bir kategori
  // girilse) taslakta kalır, gerçek kategoriler listesine "Reçete Olarak
  // Kaydet" dediğinizde işlenir.
  // sabitTip verilirse (bir kalemin kartını DEĞİŞTİRMEK için çağrıldığında)
  // Kart Tipi seçimi o tipe kilitlenir — "yarımamülü değiştir" derken
  // kullanıcının yanlışlıkla hammadde/paket oluşturmasını engeller.
  function openYeniKartOlusturForm(yeniKartBilgisi, onTamam, sabitTip) {
    const kategoriler = [...new Set(veri.hammaddeler.map(h => h.kategori).filter(Boolean))];
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">⚠ Bu kart TASLAK olarak oluşturulacak — "Reçete Olarak Kaydet" dediğinizde kalıcı olur.</div>
      <div class="fgroup"><label class="flbl">Kart Tipi</label>
        <select class="fselect" id="yko-tip">
          <option value="urun">Bitmiş Ürün</option>
          <option value="yarimamul">Yarı Mamül</option>
          <option value="altmontaj">Alt Montaj</option>
          <option value="paket">📦 Paket (sevkiyat/koli takibi — sanal, MRP'ye girmez)</option>
          <option value="hirdavat">Hırdavat (Hammadde)</option>
          <option value="diger">Diğer (Yeni Hammadde Kategorisi)</option>
        </select>
      </div>
      <div id="yko-kategori-wrap" style="display:none">
        <div class="fgroup"><label class="flbl">Kategori Adı</label>
          <input class="finput" id="yko-kategori" list="yko-kategori-list" placeholder="Mevcut kategoriden seçin veya yeni yazın">
          <datalist id="yko-kategori-list">${kategoriler.map(k => `<option value="${App.escapeHtml(k)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kod</label><input class="finput" id="yko-kod" value="${App.escapeHtml(yeniKartBilgisi.kod || '')}"></div>
        <div class="fgroup"><label class="flbl">Ad</label><input class="finput" id="yko-ad" value="${App.escapeHtml(yeniKartBilgisi.ad || '')}"></div>
      </div>
      <div class="frow" id="yko-miktar-wrap" style="${sabitTip ? 'display:none' : ''}">
        <div class="fgroup"><label class="flbl">Miktar</label><input class="finput" id="yko-miktar" type="number" value="1" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Birim</label>
          <select class="fselect" id="yko-birim">
            <option value="ADET">ADET</option><option value="M2">M2</option><option value="METRE">METRE</option><option value="KG">KG</option>
          </select>
        </div>
      </div>
    `;
    const footer = `<button class="btn" id="yko-cancel">Vazgeç</button><button class="btn btn-green" id="yko-save">${sabitTip ? 'Oluştur ve Değiştir' : 'Taslağa Ekle'}</button>`;
    App.openModal({ title: sabitTip ? (TIP_TAM_ADI[sabitTip] || sabitTip) + ' — Yeni Kart Oluştur ve Değiştir (Taslak)' : 'Yeni Kart Oluştur (Taslak)', body, footer, wide: true });
    document.getElementById('yko-cancel').onclick = App.closeModal;
    const tipSelect = document.getElementById('yko-tip');
    tipSelect.onchange = () => { document.getElementById('yko-kategori-wrap').style.display = tipSelect.value === 'diger' ? 'block' : 'none'; };
    if (sabitTip) { tipSelect.value = sabitTip; tipSelect.disabled = true; }
    document.getElementById('yko-save').onclick = () => {
      const yeniTip = tipSelect.value;
      const kod = document.getElementById('yko-kod').value.trim();
      const ad = document.getElementById('yko-ad').value.trim();
      if (!kod || !ad) { App.toast('Kod ve ad zorunlu', 'err'); return; }
      const miktar = parseFloat(document.getElementById('yko-miktar').value) || 1;
      const birim = document.getElementById('yko-birim').value;

      let yeniId, kalemTip;
      if (yeniTip === 'urun') {
        const yeni = { id: App.uid('URN'), kod, ad, aciklama: '', gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        veri.urunler.push(yeni); yeniId = yeni.id; kalemTip = 'urun';
      } else if (yeniTip === 'yarimamul') {
        const yeni = { id: App.uid('YM'), kod, ad, hammaddeId: null, rotaId: null, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        veri.yarimamuller.push(yeni); yeniId = yeni.id; kalemTip = 'yarimamul';
      } else if (yeniTip === 'altmontaj') {
        const yeni = { id: App.uid('AM'), kod, ad, aciklama: '', rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        veri.altMontajlar.push(yeni); yeniId = yeni.id; kalemTip = 'altmontaj';
      } else if (yeniTip === 'paket') {
        const yeni = { id: App.uid('PKT'), kod, ad, aciklama: '', ambalajTipi: 'Koli', koliIciAdet: 1, rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        veri.paketler.push(yeni); yeniId = yeni.id; kalemTip = 'paket';
      } else {
        let kategori = 'Hırdavat';
        if (yeniTip === 'diger') kategori = (document.getElementById('yko-kategori').value || '').trim() || 'Diğer';
        const yeni = { id: App.uid('HM'), tip: 'hirdavat', kategori, stokKodu: kod, ad, birim, fireYuzde: 0, birimFiyat: 0, dvz: 'TL', kdvOraniYuzde: 18 };
        veri.hammaddeler.push(yeni); yeniId = yeni.id; kalemTip = 'hammadde';
      }
      App.closeModal();
      onTamam(kalemTip, yeniId, miktar, birim);
    };
  }

  // ── TAŞIMA: bir kalemi bulunduğu reçeteden çıkarıp BAŞKA bir üst kalemin
  // (veya kök kartın) reçetesine ekler — TASLAKTA. Döngüsel referansı önlemek
  // için hedef olarak kalemin kendi alt-ağacındaki kartlar listelenmez.
  function openTasiModal(nodeKey) {
    const cozum = pathCoz(nodeKey);
    if (!cozum || !cozum.kalem) return;
    const tasinanKalem = cozum.kalem;
    const tasinanKart = kartBul(tasinanKalem.tip, tasinanKalem.refId);

    const adaylar = [
      { tip: kokTip, id: kokKart.id, ad: '(Kök) ' + kokKart.kod },
      ...veri.urunler.filter(u => u.id !== tasinanKalem.refId).map(u => ({ tip: 'urun', id: u.id, ad: u.kod + ' — ' + u.ad })),
      ...veri.yarimamuller.filter(y => y.id !== tasinanKalem.refId).map(y => ({ tip: 'yarimamul', id: y.id, ad: y.kod + ' — ' + y.ad })),
      ...veri.altMontajlar.filter(a => a.id !== tasinanKalem.refId).map(a => ({ tip: 'altmontaj', id: a.id, ad: a.kod + ' — ' + a.ad })),
      ...veri.paketler.filter(p => p.id !== tasinanKalem.refId).map(p => ({ tip: 'paket', id: p.id, ad: p.kod + ' — ' + p.ad }))
    ];

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Taşınacak kalem: <b class="mono">${App.escapeHtml(tasinanKart ? (tasinanKart.kod || tasinanKart.stokKodu) : tasinanKalem.refId)}</b></div>
      <div class="fgroup"><label class="flbl">Hedef (Yeni Üst Kalem)</label>
        <select class="fselect" id="tm-hedef">
          ${adaylar.map((a, i) => `<option value="${i}">${App.escapeHtml(a.ad)}</option>`).join('')}
        </select>
      </div>
      <div class="fhint">⚠ Bir kartın kendi alt-ağacına taşınması (döngüsel referans) engellenir. Bu işlem de TASLAKTIR.</div>
    `;
    const footer = `<button class="btn" id="tm-cancel">Vazgeç</button><button class="btn btn-blue" id="tm-save">Taşı</button>`;
    App.openModal({ title: 'Kalemi Taşı (Taslak)', body, footer, wide: true });
    document.getElementById('tm-cancel').onclick = App.closeModal;
    document.getElementById('tm-save').onclick = () => {
      const secilenIndex = parseInt(document.getElementById('tm-hedef').value);
      const hedef = adaylar[secilenIndex];

      if (altAgactaMi(tasinanKalem.tip, tasinanKalem.refId, hedef.tip, hedef.id)) {
        App.toast('⚠ Bu taşıma döngüsel referansa yol açar, engellendi.', 'err');
        return;
      }

      cozum.recete.kalemler.splice(cozum.kalemIndex, 1);
      const hedefRecete = receteBulVeyaOlustur(hedef.tip, hedef.id, kartBul(hedef.tip, hedef.id).ad);
      hedefRecete.kalemler.push({ ...tasinanKalem });
      isaretleKirli();

      App.toast('Kalem taslakta taşındı (henüz kaydedilmedi)', 'ok');
      App.closeModal();
      reAcVeRender();
    };
  }

  function altAgactaMi(kaynakTip, kaynakId, hedefTip, hedefId, gezilen) {
    if (kaynakTip === 'hammadde') return false;
    if (kaynakTip === hedefTip && kaynakId === hedefId) return true;
    gezilen = gezilen || new Set();
    const anahtar = kaynakTip + ':' + kaynakId;
    if (gezilen.has(anahtar)) return false;
    gezilen.add(anahtar);
    const recete = receteBul(kaynakTip, kaynakId);
    if (!recete) return false;
    return recete.kalemler.some(k => altAgactaMi(k.tip, k.refId, hedefTip, hedefId, gezilen));
  }

  // ── Ölçü/Kenar Bandı düzenleme (mevcut bir plaka kalemi için) — TASLAKTA ──
  function openOlcuDuzenleModal(nodeKey) {
    const cozum = pathCoz(nodeKey);
    if (!cozum || !cozum.kalem) return;
    const kalem = cozum.kalem;
    const kenarBantlari = veri.hammaddeler.filter(h => h.tip === 'kenar_bandi');
    const olcu = kalem.olcu || {};
    const kb = kalem.kenarBantlari || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="flbl" style="margin-bottom:8px">Ölçü Bilgisi (mm)</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kaba En</label><input class="finput" id="od-kaba-en" type="number" step="1" value="${olcu.kabaEn ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Kaba Boy</label><input class="finput" id="od-kaba-boy" type="number" step="1" value="${olcu.kabaBoy ?? ''}"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Net En</label><input class="finput" id="od-net-en" type="number" step="1" value="${olcu.netEn ?? ''}"></div>
        <div class="fgroup"><label class="flbl">Net Boy</label><input class="finput" id="od-net-boy" type="number" step="1" value="${olcu.netBoy ?? ''}"></div>
      </div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Kenar Bandı</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Ön (Net Boy)</label><select class="fselect" id="od-bant-on"><option value="">— Bantsız —</option>${kenarBantlari.map(b => `<option value="${b.id}" ${kb.on === b.id ? 'selected' : ''}>${App.escapeHtml(b.ad)}</option>`).join('')}</select></div>
        <div class="fgroup"><label class="flbl">Arka (Net Boy)</label><select class="fselect" id="od-bant-arka"><option value="">— Bantsız —</option>${kenarBantlari.map(b => `<option value="${b.id}" ${kb.arka === b.id ? 'selected' : ''}>${App.escapeHtml(b.ad)}</option>`).join('')}</select></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Sağ (Net En)</label><select class="fselect" id="od-bant-sag"><option value="">— Bantsız —</option>${kenarBantlari.map(b => `<option value="${b.id}" ${kb.sag === b.id ? 'selected' : ''}>${App.escapeHtml(b.ad)}</option>`).join('')}</select></div>
        <div class="fgroup"><label class="flbl">Sol (Net En)</label><select class="fselect" id="od-bant-sol"><option value="">— Bantsız —</option>${kenarBantlari.map(b => `<option value="${b.id}" ${kb.sol === b.id ? 'selected' : ''}>${App.escapeHtml(b.ad)}</option>`).join('')}</select></div>
      </div>
    `;
    const footer = `<button class="btn" id="od-cancel">Vazgeç</button><button class="btn btn-blue" id="od-save">Taslağa Kaydet</button>`;
    App.openModal({ title: 'Ölçü ve Kenar Bandı Düzenle (Taslak)', body, footer, wide: true });
    document.getElementById('od-cancel').onclick = App.closeModal;
    document.getElementById('od-save').onclick = () => {
      kalem.olcu = {
        kabaEn: parseFloat(document.getElementById('od-kaba-en').value) || null,
        kabaBoy: parseFloat(document.getElementById('od-kaba-boy').value) || null,
        netEn: parseFloat(document.getElementById('od-net-en').value) || null,
        netBoy: parseFloat(document.getElementById('od-net-boy').value) || null
      };
      kalem.kenarBantlari = {
        on: document.getElementById('od-bant-on').value || null,
        arka: document.getElementById('od-bant-arka').value || null,
        sag: document.getElementById('od-bant-sag').value || null,
        sol: document.getElementById('od-bant-sol').value || null
      };
      isaretleKirli();
      App.toast('Ölçü ve kenar bandı taslakta güncellendi', 'ok');
      App.closeModal();
      reAcVeRender();
    };
  }

  return { ac };
})();
