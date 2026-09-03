// ════════════════════════════════════════════════════════════════════════════
// HAT & İSTASYON TAKİBİ — her hattın ayrı sayfası; parçalar rotadaki işlem
// sırasına göre istasyonlara düşer. İstasyon akışı SIRALIDIR:
//   1) QR Okut (şimdilik manuel tuş — ileride el terminali)
//   2) Kalite Kontrol Yapıldı onayı (adet + kişi)
//   3) İşlem Tamamlandı onayı (adet + kişi)
//   4) İSİM GİREREK "Sonraki İstasyona Sevk Edildi" onayı → parça sonraki
//      istasyona geçer, bu istasyondaki iş (sevk tamamlanınca) BİTER.
// Kısmi adet desteklenir: yapılan adet kadar sevk edilir; onaylanan adet
// hiçbir aşamada üst sınırını AŞAMAZ (kalite ≤ gelen, işlem ≤ kalite,
// sevk ≤ işlem). Kalite reddi: NCR (kalite sayfasına talep) otomatik açılır;
// karar FİRE ya da ÖNCEKİ OPERASYON DÜZELTMESİ (ilgili istasyona geri
// gönderme) olarak burada verilir.
// ════════════════════════════════════════════════════════════════════════════
PageModules.hat_takip = (() => {
  let seciliHat = null;

  // ── OTOMATİK SENKRON (idempotent) ─────────────────────────────────────────
  // Aktif iş emirleri + üretimdeki siparişlerin ROTALI yarı mamülleri için
  // rotanın İLK adımında iş kartı yoksa oluşturur. Tekrar çağrılması güvenlidir.
  async function isKartlariniSenkronize() {
    const [isler, isemirleri, siparisler, yarimamuller, rotalar, receteler, urunler] = await Promise.all([
      Store.istasyonIsleri.all(), Store.isemirleri.all(), Store.siparisler.all(),
      Store.yarimamuller.all(), Store.rotalar.all(), Store.receteler.all(), Store.urunler.all()
    ]);
    let eklendi = false;

    const kartOlustur = (kaynakTip, kaynakId, kaynakKod, etiket, ym, rota, adet, musteriAdi) => {
      // Bu kaynak+YM için HERHANGİ bir step kartı varsa dokunma (akış başlamış)
      if (isler.some(x => x.kaynakTip === kaynakTip && x.kaynakId === kaynakId && x.yarimamulId === ym.id)) return;
      const step0 = (rota.steps || [])[0];
      if (!step0) return;
      isler.push({
        id: App.uid('IST'), kaynakTip, kaynakId, kaynakKod, kaynakEtiket: etiket, musteriAdi: musteriAdi || '',
        yarimamulId: ym.id, ymKod: ym.kod, ymAd: ym.ad,
        rotaId: rota.id, rotaAd: rota.ad, stepIndex: 0,
        istasyonKod: step0.kod, istasyonTanim: step0.tanim, hat: step0.hat || 'GENEL',
        gelenAdet: adet, kaliteOnayliAdet: 0, islemTamamAdet: 0, sevkEdilenAdet: 0, fireAdet: 0,
        kaliteOnaylari: [], islemOnaylari: [], sevkler: [], redler: [],
        barkodOkundu: false, etiketBasildi: false, durum: 'aktif', olusturmaTarihi: new Date().toISOString().slice(0, 10)
      });
      eklendi = true;
    };

    // 1) İş emirleri (taslak + üretimde)
    isemirleri.filter(ie => ie.durum !== 'tamamlandi').forEach(ie => {
      // İş emri belirli sipariş(ler)e bağlıysa (kaynakSiparisIdler) müşteri
      // adı oradan çözülür; genel/stok için açılmış iş emirlerinde (bağ yok)
      // müşteri bilgisi boş kalır — etiket bunu "Stok Üretimi" olarak gösterir.
      const bagliSiparisler = (ie.kaynakSiparisIdler || [])
        .map(id => siparisler.find(x => x.id === id)).filter(Boolean);
      const musteriAdi = [...new Set(bagliSiparisler.map(s => s.musteriAdi).filter(Boolean))].join(', ');
      (ie.uretimListesi || []).filter(k => k.tip === 'yarimamul').forEach(k => {
        const ym = yarimamuller.find(y => y.id === k.refId);
        if (!ym) return;
        // Hat dengeleme: iş emrinde seçilen rota (k.rotaId) öncelikli,
        // yoksa yarımamül kartındaki rota kullanılır.
        const rotaId = k.rotaId || ym.rotaId;
        if (!rotaId) return;
        const rota = rotalar.find(r => r.id === rotaId);
        if (!rota || !(rota.steps || []).length) return;
        kartOlustur('ie', ie.id, ie.kod, ie.urunAdi || '', ym, rota, k.gerekliToplam || ie.adet || 1, musteriAdi);
      });
    });

    // 2) Üretimdeki siparişler: doğrudan YM kalemleri + ürün reçetesinden patlatma
    siparisler.filter(s => s.durum === 'onaylandi' && (s.uretimDurumu === 'uretimde' || !s.uretimDurumu)).forEach(s => {
      const ymAdetleri = new Map(); // ymId -> toplam adet
      (s.kalemler || []).forEach(kalem => {
        if (kalem.ikinciKalite) return;
        if (kalem.grup === 'yarimamul') {
          const ym = yarimamuller.find(y => y.kod === kalem.kod);
          if (ym) ymAdetleri.set(ym.id, (ymAdetleri.get(ym.id) || 0) + (kalem.miktar || 1));
        } else if (kalem.grup === 'urun') {
          const urun = urunler.find(u => u.kod === kalem.kod);
          if (!urun) return;
          // REKÜRSİF: ürün → paket → alt montaj → yarı mamül zinciri
          App.receteAltYarimamulleri('urun', urun.id, receteler, { carpan: kalem.miktar || 1 })
            .forEach((mik, ymId) => ymAdetleri.set(ymId, (ymAdetleri.get(ymId) || 0) + mik));
        }
      });
      ymAdetleri.forEach((adet, ymId) => {
        const ym = yarimamuller.find(y => y.id === ymId);
        if (!ym || !ym.rotaId) return;
        const rota = rotalar.find(r => r.id === ym.rotaId);
        if (!rota || !(rota.steps || []).length) return;
        kartOlustur('sip', s.id, s.kod, s.musteriAdi || '', ym, rota, adet, s.musteriAdi || '');
      });
    });

    if (eklendi) await App.persist(() => Store.istasyonIsleri.save(isler));
    return isler;
  }

  // Görünüm: 'liste' (istasyon istasyon ayrıntı) veya 'pano' (kanban akış)
  let gorunum = 'liste';

  // ── ANA RENDER ────────────────────────────────────────────────────────────
  let _hatDurumlari = [];   // hat beklet durumları (render'da tazelenir)

  // Gerekçe sorar ve Promise döner (App.redGerekceDialog callback tabanlıdır,
  // await ile kullanılamaz — bu sarmalayıcı onu güvenli hale getirir).
  function gerekceSor(baslik, uyari) {
    return new Promise((resolve) => {
      App.redGerekceDialog(baslik, uyari || '', (gerekce) => resolve(gerekce));
    });
  }

  async function render(main, params) {
    if (params && params.hat) seciliHat = params.hat;
    const isler = await isKartlariniSenkronize();
    _hatDurumlari = await Store.hatDurumlari.all();
    const rotalar = await Store.rotalar.all();

    // Hat listesi: tüm rotaların adımlarındaki hatlar (TAŞIMA hariç) + iş
    // kartlarındaki hatlar (silinmiş rotalara karşı)
    const hatSet = new Map(); // hat -> aktif iş sayısı
    rotalar.forEach(r => (r.steps || []).forEach(st => {
      if (!st.hat || st.hat === 'TAŞIMA') return;
      if (!hatSet.has(st.hat)) hatSet.set(st.hat, 0);
    }));
    isler.forEach(x => {
      if (x.durum !== 'aktif' || !x.hat || x.hat === 'TAŞIMA') return;
      hatSet.set(x.hat, (hatSet.get(x.hat) || 0) + 1);
    });
    const hatlar = [...hatSet.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
    if (!seciliHat || !hatSet.has(seciliHat)) seciliHat = hatlar.length ? hatlar[0][0] : null;

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Hat &amp; İstasyon Takibi</div>
        <div class="page-sub">Her hattın ayrı sayfası — parçalar rota sırasına göre istasyonlara düşer: QR Okut → Kalite Kontrol → İşlem Tamamlandı → İsimli Sevk</div></div>
        <div class="page-acts">
          <div style="display:inline-flex;border:1px solid var(--border2);border-radius:8px;overflow:hidden;margin-right:6px">
            <button class="btn btn-sm" id="ht-gor-liste" style="border:0;border-radius:0;${gorunum === 'liste' ? 'background:var(--blue);color:#fff' : ''}">Liste</button>
            <button class="btn btn-sm" id="ht-gor-pano" style="border:0;border-radius:0;${gorunum === 'pano' ? 'background:var(--blue);color:#fff' : ''}">Akış Panosu</button>
          </div>
          <button class="btn" id="ht-operator-yetki">👤 Operatör Yetkileri</button>
          <button class="btn" id="ht-sifreler">🔑 Hat Şifreleri</button>
        </div>
      </div>
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="width:230px;flex-shrink:0" id="ht-hat-listesi"></div>
        <div style="flex:1;min-width:0" id="ht-hat-sayfasi"></div>
      </div>
    `;

    // Sol: hat listesi (ekrandaki görünüm — ad + rozet)
    const solEl = document.getElementById('ht-hat-listesi');
    solEl.innerHTML = `<div class="card" style="padding:10px">
      <div class="card-title" style="margin-bottom:8px;font-size:12px">ÜRETİM HATLARI</div>
      ${hatlar.length ? hatlar.map(([hat, n]) => `
        <div class="ht-hat-secim" data-hat="${App.escapeHtml(hat)}" style="display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:11.5px;font-weight:700;margin-bottom:4px;${hat === seciliHat ? 'background:var(--blue-bg);color:var(--blue-text);border:1px solid var(--blue-light)' : 'background:var(--bg);color:var(--text2)'}">
          <span>${App.escapeHtml(hat)}</span>
          <span class="pill ${n > 0 ? 'pill-blue' : 'pill-gray'}" style="font-size:9.5px">${n}</span>
        </div>`).join('') : '<div class="muted" style="font-size:11.5px;padding:8px">Rotalarda hat tanımı yok. Rota adımı eklerken "Hat" alanını doldurun.</div>'}
    </div>`;
    solEl.querySelectorAll('.ht-hat-secim').forEach(el => el.onclick = () => { seciliHat = el.dataset.hat; render(main); });

    // 👤 OPERATÖR YETKİLERİ: şifre taleplerinin onayı + kişi bazlı hat
    // yetkilendirme yönetimi. Bekleyen talep varsa tuş üstünde sayı görünür.
    const hatAdlari = hatlar.map(h => h[0]);
    try {
      const bekleyenSayisi = (await Store.hatSifreTalepleri.all()).filter(t => t.durum === 'bekliyor').length;
      if (bekleyenSayisi > 0) {
        const oyBtn = document.getElementById('ht-operator-yetki');
        oyBtn.innerHTML = `👤 Operatör Yetkileri <span class="pill pill-red" style="font-size:9.5px;margin-left:4px">${bekleyenSayisi} talep</span>`;
        oyBtn.style.border = '1.5px solid var(--red)';
      }
    } catch (e) {}
    document.getElementById('ht-gor-liste').onclick = () => { gorunum = 'liste'; render(main); };
    document.getElementById('ht-gor-pano').onclick = () => { gorunum = 'pano'; render(main); };
    document.getElementById('ht-operator-yetki').onclick = () => operatorYetkiModalAc(hatAdlari, () => render(main));

    // 🔑 HAT ŞİFRELERİ: her hat + Sevkiyat Yükleme birimi için operatör
    // terminal giriş şifreleri buradan belirlenir (varsayılan 1234).
    document.getElementById('ht-sifreler').onclick = async () => {
      const kayitlar = await Store.hatSifreleri.all();
      const birimler = [...hatlar.map(h => h[0]), 'SEVKİYAT YÜKLEME'];
      const body = document.createElement('div');
      body.innerHTML = `<div class="fhint" style="margin-bottom:10px">Operatörler Hat Operatör Terminali'ne, yükleme personeli Sevkiyat Yükleme Onayı'na bu şifrelerle girer. Boş bırakılan birimin şifresi <b>1234</b>'tür.</div>
        <table class="dtable" style="font-size:11.5px"><tr><th>Hat / Birim</th><th>Şifre</th></tr>
        ${birimler.map(hb => { const k = kayitlar.find(x => x.hat === hb); return `<tr><td><b>${App.escapeHtml(hb)}</b></td>
          <td><input class="finput hs-sifre" data-hat="${App.escapeHtml(hb)}" value="" data-mevcut="" placeholder="${k && (k.sifreHash || k.sifre) ? '•••••• (tanımlı — değiştirmek için yazın)' : '1234 (varsayılan)'}" style="max-width:180px"></td></tr>`; }).join('')}
        </table>`;
      App.openModal({ title: '🔑 Hat & Birim Giriş Şifreleri', body, footer: `<button class="btn" id="hs-cancel">Vazgeç</button><button class="btn btn-blue" id="hs-save">Kaydet</button>`, wide: true });
      document.getElementById('hs-cancel').onclick = App.closeModal;
      document.getElementById('hs-save').onclick = async () => {
        // Hat ortak şifreleri de düz metin saklanmaz — sunucuda hash'lenir.
        const girisler = [...document.querySelectorAll('.hs-sifre')]
          .map(inp => ({ hat: inp.dataset.hat, deger: inp.value.trim(), degisti: inp.value.trim() !== (inp.dataset.mevcut || '') }))
          .filter(x => x.deger);
        const oncekiler = await Store.hatSifreleri.all();
        const yeni = [];
        for (const g of girisler) {
          const eski = oncekiler.find(x => x.hat === g.hat);
          // Kutu değişmediyse mevcut hash korunur (yıldızlı gösterim tekrar hash'lenmesin)
          if (!g.degisti && eski && eski.sifreHash) { yeni.push(eski); continue; }
          try {
            const h = await Store.sifreHashle(g.deger, 'hat:' + g.hat);
            yeni.push({ id: 'HS-' + g.hat, hat: g.hat, sifreHash: h });
          } catch (e) { App.toast(g.hat + ': ' + e.message, 'err'); return; }
        }
        await App.persist(() => Store.hatSifreleri.save(yeni));
        App.toast('Hat şifreleri kaydedildi', 'ok');
        App.closeModal();
      };
    };

    // Sağ: seçili hattın sayfası
    hatSayfasiniCiz(document.getElementById('ht-hat-sayfasi'), isler, rotalar, render, main);
  }

  // ── HAT SAYFASI: istasyonlar rota sırasına göre + iş kartları ─────────────
  function hatSayfasiniCiz(el, isler, rotalar, render, main) {
    if (!seciliHat) { el.innerHTML = '<div class="card"><div class="empty-state" style="padding:24px"><div class="edesc">Hat seçin.</div></div></div>'; return; }
    const hatIsleri = isler.filter(x => x.hat === seciliHat && x.durum === 'aktif');
    const bitenIsler = isler.filter(x => x.hat === seciliHat && x.durum === 'tamamlandi');
    const sifirlananIsler = isler.filter(x => x.hat === seciliHat && x.durum === 'sifirlandi');

    // ── HAT YÖNETİM KONTROLLERİ (yalnızca yönetim + üretim planlama) ────────
    // Hattı bekletmek, hattaki işleri sıfırlamak ve sıfırlananı geri çağırmak
    // üretimin akışını doğrudan değiştirir; bu yüzden yetki dar tutulur ve her
    // işlem gerekçesiyle birlikte kime ait olduğu kaydedilir (iz bırakır).
    const _rol = App.aktifRol();
    const hatYonetebilir = ['admin', 'yonetim', 'uretim_planlama'].includes(_rol);

    // İstasyonlara grupla (istasyonKod), rota adım sırasına göre diz
    const istasyonlar = new Map(); // kod -> {kod, tanim, sira, isler[]}
    hatIsleri.forEach(x => {
      if (!istasyonlar.has(x.istasyonKod)) istasyonlar.set(x.istasyonKod, { kod: x.istasyonKod, tanim: x.istasyonTanim, sira: x.stepIndex, isler: [] });
      const g = istasyonlar.get(x.istasyonKod);
      g.sira = Math.min(g.sira, x.stepIndex);
      g.isler.push(x);
    });
    // Hattın rotalarda tanımlı ama şu an işi olmayan istasyonlarını da göster
    rotalar.forEach(r => (r.steps || []).forEach((st, i) => {
      if (st.hat !== seciliHat) return;
      if (!istasyonlar.has(st.kod)) istasyonlar.set(st.kod, { kod: st.kod, tanim: st.tanim, sira: i, isler: [] });
    }));
    const sirali = [...istasyonlar.values()].sort((a, b) => a.sira - b.sira);

    // ── AKIŞ PANOSU (Kanban) görünümü ──────────────────────────────────────
    // Aynı veriyi sütunlar halinde gösterir; darboğaz ve bekleme süresi
    // görünür olur. Karta tıklanınca liste görünümüne dönülür.
    if (gorunum === 'pano') {
      Kanban.panoCiz(el, seciliHat, sirali, hatIsleri, () => { gorunum = 'liste'; render(main); });
      return;
    }

    // Hat beklemede mi? (hatDurumlari koleksiyonundan — render öncesi yüklendi)
    const _hd = (_hatDurumlari || []).find(d => d.hat === seciliHat);
    const beklemede = !!(_hd && _hd.durum === 'beklemede');

    let html = '';
    if (beklemede) {
      html += `<div class="card" style="padding:10px 14px;margin-bottom:10px;background:var(--amber-bg);border:1px solid var(--amber-text)">
        <b style="color:var(--amber-text)">⏸ BU HAT BEKLETİLİYOR</b>
        <span class="muted" style="font-size:11.5px;margin-left:8px">
          ${App.escapeHtml(_hd.kim || '')} · ${App.escapeHtml((_hd.tarih || '').slice(0, 16).replace('T', ' '))}
          ${_hd.gerekce ? ' · ' + App.escapeHtml(_hd.gerekce) : ''}
        </span></div>`;
    }

    html += `<div class="card" style="padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div><b style="font-size:14px">🏭 ${App.escapeHtml(seciliHat)}</b>
      <span class="muted" style="font-size:11px;margin-left:8px">${hatIsleri.length} aktif iş · ${sirali.length} istasyon${sifirlananIsler.length ? ' · ' + sifirlananIsler.length + ' sıfırlanmış' : ''}</span></div>
      ${hatYonetebilir ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm ht-beklet" style="background:${beklemede ? 'var(--green)' : 'var(--amber-text)'};color:#fff;border:none">${beklemede ? '▶ Beklemeyi Kaldır' : '⏸ Hattı Beklet'}</button>
        <button class="btn btn-sm ht-sifirla" style="background:var(--red);color:#fff;border:none" ${hatIsleri.length ? '' : 'disabled'}>↺ Hattaki İşleri Sıfırla</button>
        <button class="btn btn-sm ht-sifirlananlar">📦 Sıfırlanan İşler (${sifirlananIsler.length})</button>
      </div>` : ''}
      <div class="fhint" style="margin:0">Akış: <b>QR Okut</b> → <b>Kalite</b> → <b>İşlem</b> → <b>Sevk (isimli)</b></div>
    </div>
    <div id="ht-bakim-alarm"></div>`;

    if (!sirali.length) {
      html += `<div class="card"><div class="empty-state" style="padding:24px"><div class="edesc">Bu hatta tanımlı istasyon yok.</div></div></div>`;
      el.innerHTML = html; return;
    }

    sirali.forEach(ist => {
      html += `<div class="card" style="margin-bottom:12px">
        <div class="card-hdr"><div class="card-title">📍 ${App.escapeHtml(ist.kod)} — ${App.escapeHtml(ist.tanim)}</div>
        <span class="pill ${ist.isler.length ? 'pill-amber' : 'pill-gray'}" style="font-size:10px">${ist.isler.length} iş</span></div>`;
      if (!ist.isler.length) {
        html += `<div class="muted" style="font-size:11.5px;padding:6px 0">Bu istasyonda bekleyen iş yok.</div>`;
      } else {
        ist.isler.forEach(x => { html += isKartiHtml(x); });
      }
      html += `</div>`;
    });

    // 🗂 ESKİ İŞLEMLER: bu hatta BİTEN işler ayrı bölümde tutulur
    html += App.akordeonHtml([{
      baslik: 'Eski İşlemler — Bu Hatta Biten İşler', ikon: '🗂',
      rozet: bitenIsler.length ? bitenIsler.length + ' kayıt' : '',
      icerikHtml: '<div style="margin-top:12px">' + (bitenIsler.length
        ? `<table class="dtable" style="font-size:11px"><tr><th>Kaynak</th><th>Yarı Mamül</th><th>İstasyon</th><th class="r">Sevk</th><th class="r">Fire</th><th>İşleyen(ler)</th><th>Bitiş</th></tr>
          ${bitenIsler.sort((a, b) => (b.bitisZamani || '').localeCompare(a.bitisZamani || '')).map(x => {
            const kisiler = [...new Set([...(x.kaliteOnaylari||[]), ...(x.islemOnaylari||[]), ...(x.sevkler||[])].map(o => o.kisi).filter(Boolean))].join(', ') || '—';
            return `<tr><td class="mono" style="font-size:10px">${App.escapeHtml(x.kaynakKod)}</td>
              <td><b class="mono" style="font-size:10px">${App.escapeHtml(x.ymKod)}</b></td>
              <td class="mono" style="font-size:10px">${App.escapeHtml(x.istasyonKod)}</td>
              <td class="r">${x.sevkEdilenAdet}</td><td class="r" style="color:var(--red-text)">${x.fireAdet || 0}</td>
              <td style="font-size:10px">${App.escapeHtml(kisiler)}</td>
              <td style="font-size:10px">${x.bitisZamani ? x.bitisZamani.slice(0, 16).replace('T', ' ') : '—'}</td></tr>`;
          }).join('')}</table>`
        : '<div class="empty-state" style="padding:14px"><div class="edesc">Bu hatta henüz biten iş yok.</div></div>') + '</div>'
    }]);
    el.innerHTML = html;
    App.akordeonBagla(el);

    // ── BEKLETME KİLİDİ ────────────────────────────────────────────────────
    // Hat bekletiliyorsa istasyon ilerlemesi YAPILAMAZ: QR okutma, kalite,
    // işlem, sevk ve kalite reddi engellenir. Kilit iki katmanlı: butonlar
    // görsel olarak pasifleşir ve tıklama yakalama (capture) aşamasında
    // durdurulur — böylece sonradan bağlanan handler'lar da çalışmaz.
    if (beklemede) {
      const KILITLI = ['ht-qr', 'ht-kalite', 'ht-islem', 'ht-sevk', 'ht-red', 'ht-barkod'];
      KILITLI.forEach(c => el.querySelectorAll('.' + c).forEach(b => {
        b.style.opacity = '0.45';
        b.style.cursor = 'not-allowed';
        b.title = 'Hat bekletiliyor — istasyon ilerlemesi yapılamaz.';
      }));
      // Dinleyici her render'da yeniden eklenmesin (birikirse sayfa yavaşlar)
      if (!el._bekletKilidiKurulu) {
      el._bekletKilidiKurulu = true;
      el.addEventListener('click', (ev) => {
        // Kilit kararı ANLIK okunur: bekleme kalkınca dinleyici engellemez
        const hd = (_hatDurumlari || []).find(d => d.hat === seciliHat);
        if (!hd || hd.durum !== 'beklemede') return;
        const btn = ev.target.closest('.' + KILITLI.join(', .'));
        if (!btn || !el.contains(btn)) return;
        ev.preventDefault();
        ev.stopPropagation();
        App.toast('⏸ Bu hat bekletiliyor — istasyon ilerlemesi yapılamaz. Önce "Beklemeyi Kaldır" ile hattı çalışmaya alın.', 'err');
      }, true);   // capture: hedefe ulaşmadan durdur
      }
    }

    // ── HAT YÖNETİM İŞLEMLERİ (yönetim + planlama) ─────────────────────────
    const _bekletBtn = el.querySelector('.ht-beklet');
    if (_bekletBtn) _bekletBtn.onclick = async () => {
      try {
        const yeniDurum = beklemede ? 'aktif' : 'beklemede';
        const gerekce = await gerekceSor(yeniDurum === 'beklemede'
          ? 'Hattı Beklet' : 'Beklemeyi Kaldır',
          yeniDurum === 'beklemede'
            ? `"${seciliHat}" hattı bekletilecek. Gerekçe kayda geçer.`
            : `"${seciliHat}" hattı yeniden çalışmaya alınacak.`);
        if (!gerekce) return;
        const liste = await Store.hatDurumlari.all();
        const mevcut = liste.find(d => d.hat === seciliHat);
        const kayit = {
          hat: seciliHat, durum: yeniDurum, gerekce,
          kim: App.aktifRol(), tarih: new Date().toISOString()
        };
        if (mevcut) Object.assign(mevcut, kayit);
        else liste.push({ id: App.uid('HDR'), ...kayit });
        await App.persist(() => Store.hatDurumlari.save(liste));
        App.toast(yeniDurum === 'beklemede' ? 'Hat bekletiliyor.' : 'Hat yeniden çalışmaya alındı.', 'ok');
        render(main);
      } catch (e) { App.toast('İşlem yapılamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };

    const _sifirlaBtn = el.querySelector('.ht-sifirla');
    if (_sifirlaBtn) _sifirlaBtn.onclick = async () => {
      try {
        if (!hatIsleri.length) { App.toast('Bu hatta aktif iş yok.', 'err'); return; }
        const gerekce = await gerekceSor('Hattaki İşleri Sıfırla',
          `"${seciliHat}" hattındaki ${hatIsleri.length} iş kartı sıfırlanacak. Gerekçe zorunludur ve kayda geçer.`);
        if (!gerekce) return;
        App.confirmDialog(
          `${hatIsleri.length} iş kartı SIFIRLANACAK: hattan kaldırılıp arşive alınır, üretim adetleri korunur. ` +
          `İstenirse "Sıfırlanan İşler" ekranından geri çağrılabilir. Onaylıyor musunuz?`,
          async () => {
            const tumu = await Store.istasyonIsleri.all();
            const damga = { kim: App.aktifRol(), tarih: new Date().toISOString(), gerekce };
            let n = 0;
            hatIsleri.forEach(hi => {
              const k = tumu.find(x => x.id === hi.id);
              if (!k || k.durum !== 'aktif') return;
              k.oncekiDurum = k.durum;
              k.durum = 'sifirlandi';
              k.sifirlamaBilgi = damga;
              n++;
            });
            await App.persist(() => Store.istasyonIsleri.save(tumu));
            App.toast(n + ' iş sıfırlandı ve arşive alındı.', 'ok');
            render(main);
          });
      } catch (e) { App.toast('Sıfırlanamadı: ' + (e && e.message ? e.message : e), 'err'); }
    };

    const _arsivBtn = el.querySelector('.ht-sifirlananlar');
    if (_arsivBtn) _arsivBtn.onclick = () => {
      const body = sifirlananIsler.length ? `
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">
          Sıfırlanan işler üretimden çıkarılmıştır. Geri çağrıldığında adetleriyle birlikte
          hatta kaldığı yerden devam eder.
        </div>
        ${sifirlananIsler.map(i => `<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:180px">
            <b style="font-size:12.5px">${App.escapeHtml(i.ymKod || '')}</b> — ${App.escapeHtml(i.ymAd || '')}<br>
            <span class="muted" style="font-size:10.5px">
              ${App.escapeHtml(i.istasyonKod || '')} · gelen ${i.gelenAdet || 0}, sevk ${i.sevkEdilenAdet || 0}, fire ${i.fireAdet || 0}<br>
              ${i.sifirlamaBilgi ? 'Sıfırlayan: ' + App.escapeHtml(i.sifirlamaBilgi.kim || '') + ' · ' + App.escapeHtml((i.sifirlamaBilgi.tarih || '').slice(0, 16).replace('T', ' ')) + (i.sifirlamaBilgi.gerekce ? ' · ' + App.escapeHtml(i.sifirlamaBilgi.gerekce) : '') : ''}
            </span>
          </div>
          <button class="btn btn-sm btn-green ht-geri" data-id="${i.id}">↩ Geri Çağır</button>
        </div>`).join('')}`
        : '<div class="muted" style="padding:12px;font-size:12px">Bu hatta sıfırlanmış iş yok.</div>';

      App.openModal({
        title: '📦 Sıfırlanan İşler — ' + seciliHat,
        sub: sifirlananIsler.length + ' kayıt',
        body,
        footer: '<button class="btn" id="ht-arsiv-kapat">Kapat</button>',
        wide: true
      });
      document.getElementById('ht-arsiv-kapat').onclick = App.closeModal;
      document.querySelectorAll('.ht-geri').forEach(b => b.onclick = async () => {
        try {
          const gerekce = await gerekceSor('İşi Geri Çağır', 'Bu iş hatta geri alınacak.');
          if (!gerekce) return;
          const tumu = await Store.istasyonIsleri.all();
          const k = tumu.find(x => x.id === b.dataset.id);
          if (!k) { App.toast('Kayıt bulunamadı.', 'err'); return; }
          k.durum = k.oncekiDurum || 'aktif';
          k.geriCagirmaBilgi = { kim: App.aktifRol(), tarih: new Date().toISOString(), gerekce };
          await App.persist(() => Store.istasyonIsleri.save(tumu));
          App.closeModal();
          App.toast('İş hatta geri çağrıldı.', 'ok');
          render(main);
        } catch (e) { App.toast('Geri çağrılamadı: ' + (e && e.message ? e.message : e), 'err'); }
      });
    };
    // Seçili hattın makina BAKIM ALARMLARI (rutin bakım süresi dolanlar)
    (async () => {
      const makinalar = await Store.makinaTechizat.all();
      const bugun = new Date().toISOString().slice(0, 10);
      const alarmlar = makinalar.filter(m => {
        if ((m.hat || m.konum || '') !== seciliHat || !m.bakimAralikGun || m.durum === 'hurda') return false;
        const son = m.sonBakimTarihi || m.alisTarihi;
        if (!son) return true;
        return new Date(new Date(son).getTime() + m.bakimAralikGun * 86400000).toISOString().slice(0, 10) <= bugun;
      });
      const alan = document.getElementById('ht-bakim-alarm');
      if (alan && alarmlar.length) {
        alan.innerHTML = `<div class="card" style="border:1.5px solid var(--red);background:var(--red-bg);margin-bottom:12px">
          <div class="card-title" style="color:var(--red-text)">🔔 BAKIM ALARMI — bu hattaki ${alarmlar.length} makinanın rutin bakım süresi doldu</div>
          ${alarmlar.map(m => `<div style="font-size:11.5px;padding:3px 0">⚠ <b>${App.escapeHtml(m.ad)}</b>${m.bakimSorumlusu ? ' · Sorumlu: ' + App.escapeHtml(m.bakimSorumlusu) : ''} · Son bakım: ${m.sonBakimTarihi || 'hiç'} · Aralık: ${m.bakimAralikGun} gün — <i>Bakım Planlama'dan "Rutin Bakım Yapıldı" işaretlenmeli</i></div>`).join('')}
        </div>`;
      }
    })();
    wireIsKartlari(el, render, main);
  }

  // ── İŞ KARTI ──────────────────────────────────────────────────────────────
  function isKartiHtml(x) {
    const kalan = x.gelenAdet - x.fireAdet;
    const kaliteKalan = kalan - x.kaliteOnayliAdet;
    const islemKalan = x.kaliteOnayliAdet - x.islemTamamAdet;
    const sevkKalan = x.islemTamamAdet - x.sevkEdilenAdet;
    const adimRozet = (etiket, deger, ust, renk) =>
      `<span style="font-size:10px;background:var(--bg);border-radius:6px;padding:3px 8px"><b style="color:${renk}">${deger}</b>/${ust} ${etiket}</span>`;
    return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--surface2)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div>
          <b class="mono" style="font-size:11.5px">${App.escapeHtml(x.kaynakKod)}</b>
          <span class="pill ${x.kaynakTip === 'ie' ? 'pill-purple' : 'pill-blue'}" style="font-size:9px">${x.kaynakTip === 'ie' ? 'İş Emri' : 'Sipariş'}</span>
          <span style="font-size:11.5px;margin-left:6px">${App.escapeHtml(x.ymKod)} — ${App.escapeHtml(x.ymAd)}</span>
          ${x.musteriAdi ? `<span class="muted" style="font-size:10.5px;margin-left:6px">👤 ${App.escapeHtml(x.musteriAdi)}</span>` : ''}
          ${x.barkodOkundu ? '<span class="pill pill-green" style="font-size:9px">📶 Barkod OK</span>' : ''}
          ${x.etiketBasildi ? '<span class="pill pill-blue" style="font-size:9px">🏷 Etiket Basıldı</span>' : '<span class="pill pill-amber" style="font-size:9px">🏷 Etiket basılmadı</span>'}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${adimRozet('Gelen', x.gelenAdet - x.fireAdet, x.gelenAdet, 'var(--text)')}
          ${adimRozet('Kalite', x.kaliteOnayliAdet, kalan, 'var(--blue-text)')}
          ${adimRozet('İşlem', x.islemTamamAdet, x.kaliteOnayliAdet, 'var(--amber-text)')}
          ${adimRozet('Sevk', x.sevkEdilenAdet, x.islemTamamAdet, 'var(--green-text)')}
          ${x.fireAdet ? `<span class="pill pill-red" style="font-size:9.5px">Fire: ${x.fireAdet}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        ${!x.barkodOkundu ? `<button class="btn btn-sm ht-barkod" data-id="${x.id}">📷 QR Okut</button>` : ''}
        <button class="btn btn-sm btn-ghost ht-qr" data-id="${x.id}" title="Bu parça için QR etiketi yazdır">🏷 QR Etiket</button>
        <button class="btn btn-sm btn-ghost ht-dosya" data-id="${x.id}" title="Bu parçanın teknik dosyalarını aç (step/dwg/pdf/excel/resim) — görüntüle ve indir">📁 Dosyalar</button>
        <button class="btn btn-sm btn-blue ht-kalite" data-id="${x.id}" ${(!x.barkodOkundu || kaliteKalan <= 0) ? 'disabled' : ''}>✓ Kalite Kontrol Yapıldı</button>
        <button class="btn btn-sm btn-amber ht-islem" data-id="${x.id}" ${islemKalan <= 0 ? 'disabled' : ''}>⚙ İşlem Tamamlandı</button>
        <button class="btn btn-sm btn-green ht-sevk" data-id="${x.id}" ${sevkKalan <= 0 ? 'disabled' : ''}>➜ Sonraki İstasyona Sevk</button>
        <button class="btn btn-sm btn-red ht-red" data-id="${x.id}" ${kalan <= x.sevkEdilenAdet ? 'disabled' : ''}>✗ Kalite Reddi</button>
      </div>
    </div>`;
  }

  // ── ONAY MODALI (adet + kişi) — ortak ─────────────────────────────────────
  function onayModali({ baslik, aciklama, maxAdet, kisiZorunlu, onOnay }) {
    const body = document.createElement('div');
    body.innerHTML = `
      ${aciklama ? `<div class="fhint" style="margin-bottom:10px">${aciklama}</div>` : ''}
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">Adet (en fazla ${maxAdet})</label>
          <input class="finput" id="om-adet" type="number" min="1" max="${maxAdet}" value="${maxAdet}"></div>
        <div class="fgroup" style="flex:1.4"><label class="flbl">${kisiZorunlu ? 'Adınız Soyadınız <span style="color:var(--red-text)">* (zorunlu)</span>' : 'Onaylayan (opsiyonel)'}</label>
          <input class="finput" id="om-kisi" placeholder="örn. Ahmet Yılmaz"></div>
      </div>`;
    const footer = `<button class="btn" id="om-cancel">Vazgeç</button><button class="btn btn-green" id="om-ok">Onayla</button>`;
    App.openModal({ title: baslik, body, footer });
    document.getElementById('om-cancel').onclick = App.closeModal;
    document.getElementById('om-ok').onclick = () => {
      const adet = parseInt(document.getElementById('om-adet').value) || 0;
      const kisi = document.getElementById('om-kisi').value.trim();
      if (adet < 1 || adet > maxAdet) { App.toast(`Adet 1-${maxAdet} aralığında olmalı — onaylanan adet toplamı geçemez`, 'err'); return; }
      if (kisiZorunlu && !kisi) { App.toast('Sevk onayı için isim girilmesi ZORUNLUDUR', 'err'); return; }
      App.closeModal();
      onOnay(adet, kisi);
    };
  }

  // ── BUTON BAĞLAMA ─────────────────────────────────────────────────────────
  function wireIsKartlari(el, render, main) {
    const isiBul = async (id) => {
      const isler = await Store.istasyonIsleri.all();
      return { isler, is: isler.find(x => x.id === id) };
    };
    const bugun = () => new Date().toISOString().slice(0, 10);

    // QR ETİKET YAZDIRMA — parça üzerine yapıştırılır, istasyonlarda okutulur
    // 📁 DOSYALAR: parçanın teknik dosya sayfasını yeni sekmede açar
    el.querySelectorAll('.ht-dosya').forEach(b => b.onclick = async () => {
      const { is } = await isiBul(b.dataset.id);
      if (is) QrDosya.linkAc('yarimamul', is.yarimamulId, is.ymKod);
    });
    el.querySelectorAll('.ht-qr').forEach(b => b.onclick = async () => {
      const { isler, is } = await isiBul(b.dataset.id);
      if (!is) return;
      App.isKartiEtiketYazdir(is);
      // Basma kaydı: RULE — etiket bu partide daha önce basılmadıysa ilk
      // basımın kim/ne zaman yaptığı izlenir (istasyondan istasyona taşınır).
      if (!is.etiketBasildi) {
        is.etiketBasildi = true;
        is.etiketTarihi = bugun();
        is.etiketBasan = App.aktifRol();
        await App.persist(() => Store.istasyonIsleri.save(isler));
        render(main);
      }
    });

    // 1) QR Okut (manuel tuş — ileride el terminali istasyon tanımı)
    el.querySelectorAll('.ht-barkod').forEach(b => b.onclick = async () => {
      const { isler, is } = await isiBul(b.dataset.id);
      if (!is) return;
      is.barkodOkundu = true;
      is.barkodTarihi = bugun();
      is.barkodZamani = new Date().toISOString(); // süre ölçümü başlangıcı
      await App.persist(() => Store.istasyonIsleri.save(isler));
      App.toast('QR okundu: ' + is.ymKod + ' — kalite kontrol onayı verilebilir', 'ok');
      render(main);
    });

    // 2) Kalite Kontrol Yapıldı
    el.querySelectorAll('.ht-kalite').forEach(b => b.onclick = async () => {
      const { isler, is } = await isiBul(b.dataset.id);
      if (!is) return;
      const max = (is.gelenAdet - is.fireAdet) - is.kaliteOnayliAdet;
      onayModali({
        baslik: '✓ Kalite Kontrol Yapıldı — ' + is.istasyonKod,
        aciklama: `<b>${App.escapeHtml(is.ymKod)}</b> · ${App.escapeHtml(is.kaynakKod)}`,
        maxAdet: max, kisiZorunlu: false,
        onOnay: async (adet, kisi) => {
          is.kaliteOnayliAdet += adet;
          is.kaliteOnaylari.push({ adet, kisi, tarih: bugun(), zaman: new Date().toISOString() });
          await App.persist(() => Store.istasyonIsleri.save(isler));
          App.toast(`Kalite kontrol onaylandı: ${adet} adet`, 'ok');
          render(main);
        }
      });
    });

    // 3) İşlem Tamamlandı
    el.querySelectorAll('.ht-islem').forEach(b => b.onclick = async () => {
      const { isler, is } = await isiBul(b.dataset.id);
      if (!is) return;
      const max = is.kaliteOnayliAdet - is.islemTamamAdet;
      onayModali({
        baslik: '⚙ İşlem Tamamlandı — ' + is.istasyonKod,
        aciklama: `<b>${App.escapeHtml(is.ymKod)}</b> · yalnızca kalite onaylı adet işlenebilir`,
        maxAdet: max, kisiZorunlu: false,
        onOnay: async (adet, kisi) => {
          is.islemTamamAdet += adet;
          is.islemOnaylari.push({ adet, kisi, tarih: bugun(), zaman: new Date().toISOString() });
          await App.persist(() => Store.istasyonIsleri.save(isler));
          App.toast(`İşlem tamamlandı: ${adet} adet — sevk onayı verilebilir`, 'ok');
          render(main);
        }
      });
    });

    // 4) Sonraki İstasyona Sevk (İSİM ZORUNLU) — parça sonraki istasyona geçer,
    //    tüm adetler sevk edilince bu istasyondaki iş BİTER.
    el.querySelectorAll('.ht-sevk').forEach(b => b.onclick = async () => {
      const { isler, is } = await isiBul(b.dataset.id);
      if (!is) return;
      const rotalar = await Store.rotalar.all();
      const rota = rotalar.find(r => r.id === is.rotaId);
      const steps = rota ? (rota.steps || []) : [];
      // Sonraki GERÇEK istasyon: TAŞIMA adımlarını atla
      let sonrakiIndex = is.stepIndex + 1;
      while (steps[sonrakiIndex] && steps[sonrakiIndex].hat === 'TAŞIMA') sonrakiIndex++;
      const sonraki = steps[sonrakiIndex] || null;
      const max = is.islemTamamAdet - is.sevkEdilenAdet;
      onayModali({
        baslik: '➜ Sonraki İstasyona Sevk — ' + is.istasyonKod,
        aciklama: sonraki
          ? `Hedef istasyon: <b>${App.escapeHtml(sonraki.kod)} — ${App.escapeHtml(sonraki.tanim)}</b> (${App.escapeHtml(sonraki.hat || '')})`
          : '<b>Bu rotanın SON istasyonu</b> — sevk ile parça hat sonuna (tamamlandı) alınır.',
        maxAdet: max, kisiZorunlu: true,
        onOnay: async (adet, kisi) => {
          is.sevkEdilenAdet += adet;
          is.sevkler.push({ adet, kisi, tarih: bugun(), zaman: new Date().toISOString(), hedef: sonraki ? sonraki.kod : 'HAT SONU' });
          // Sonraki istasyonun iş kartına adet ekle (yoksa oluştur)
          if (sonraki) {
            let hedefIs = isler.find(x => x.kaynakTip === is.kaynakTip && x.kaynakId === is.kaynakId &&
              x.yarimamulId === is.yarimamulId && x.stepIndex === sonrakiIndex);
            if (hedefIs) { hedefIs.gelenAdet += adet; hedefIs.durum = 'aktif'; }
            else {
              isler.push({
                id: App.uid('IST'), kaynakTip: is.kaynakTip, kaynakId: is.kaynakId, kaynakKod: is.kaynakKod, kaynakEtiket: is.kaynakEtiket, musteriAdi: is.musteriAdi || '',
                yarimamulId: is.yarimamulId, ymKod: is.ymKod, ymAd: is.ymAd,
                rotaId: is.rotaId, rotaAd: is.rotaAd, stepIndex: sonrakiIndex,
                istasyonKod: sonraki.kod, istasyonTanim: sonraki.tanim, hat: sonraki.hat || 'GENEL',
                gelenAdet: adet, kaliteOnayliAdet: 0, islemTamamAdet: 0, sevkEdilenAdet: 0, fireAdet: 0,
                kaliteOnaylari: [], islemOnaylari: [], sevkler: [], redler: [],
                // Etiket AYNI fiziksel partiyle birlikte seyahat eder — basılma
                // bilgisi (varsa) önceki istasyondan aynen taşınır, yeniden
                // basılması GEREKMEZ (bkz. App.partiEtiketKodu açıklaması).
                barkodOkundu: false, etiketBasildi: is.etiketBasildi || false,
                etiketTarihi: is.etiketTarihi || null, etiketBasan: is.etiketBasan || null,
                durum: 'aktif', olusturmaTarihi: bugun()
              });
            }
          }
          // Bir önceki istasyon işlemi bitir: tüm (fire hariç) adetler sevk
          // edildiyse bu istasyondaki iş kartı TAMAMLANDI olur.
          if (is.sevkEdilenAdet >= is.gelenAdet - is.fireAdet) {
            is.durum = 'tamamlandi';
            is.bitisZamani = new Date().toISOString();
            // GERÇEKLEŞEN SÜRE: QR okutma → son sevk arası (dk). Aynı
            // kodlu yarımamül/ürünlerin üzerine işlenir — planlama benzer
            // kodlu işlerde bu ortalamaları görür.
            if (is.barkodZamani) {
              const dk = Math.max(0, (new Date(is.bitisZamani) - new Date(is.barkodZamani)) / 60000);
              const sureler = await Store.gerceklesenSureKayitlari.all();
              sureler.push({
                id: App.uid('GSK'), ymId: is.yarimamulId, ymKod: is.ymKod, ymAd: is.ymAd,
                istasyonKod: is.istasyonKod, istasyonTanim: is.istasyonTanim, hat: is.hat,
                kaynakTip: is.kaynakTip, kaynakKod: is.kaynakKod,
                adet: is.gelenAdet - is.fireAdet, dk: Math.round(dk * 10) / 10,
                birimDk: (is.gelenAdet - is.fireAdet) > 0 ? Math.round(dk / (is.gelenAdet - is.fireAdet) * 10) / 10 : 0,
                tarih: bugun()
              });
              await Store.gerceklesenSureKayitlari.save(sureler);
            }
          }
          await App.persist(() => Store.istasyonIsleri.save(isler));
          App.toast(`${adet} adet ${sonraki ? sonraki.kod + ' istasyonuna sevk edildi' : 'HAT SONU — tamamlandı'} (Sevk: ${kisi})${is.durum === 'tamamlandi' ? ' · Bu istasyondaki iş BİTTİ' : ''}`, 'ok');
          render(main);
        }
      });
    });

    // 5) Kalite Reddi: NCR (kalite talebi) + karar: FİRE | önceki istasyona geri
    el.querySelectorAll('.ht-red').forEach(b => b.onclick = async () => {
      const { isler, is } = await isiBul(b.dataset.id);
      if (!is) return;
      const rotalar = await Store.rotalar.all();
      const rota = rotalar.find(r => r.id === is.rotaId);
      const steps = rota ? (rota.steps || []) : [];
      // Geri gönderilebilecek ÖNCEKİ istasyonlar (TAŞIMA hariç)
      const oncekiler = steps.slice(0, is.stepIndex).map((st, i) => ({ ...st, index: i })).filter(st => st.hat !== 'TAŞIMA');
      const maxRed = (is.gelenAdet - is.fireAdet) - is.sevkEdilenAdet;
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:10px"><b>${App.escapeHtml(is.ymKod)}</b> · ${App.escapeHtml(is.kaynakKod)} · İstasyon: ${App.escapeHtml(is.istasyonKod)}<br>Red ile <b>kalite sayfasına talep (NCR)</b> otomatik açılır; karar burada verilir.</div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Red Adedi (en fazla ${maxRed})</label>
            <input class="finput" id="rd-adet" type="number" min="1" max="${maxRed}" value="1"></div>
          <div class="fgroup"><label class="flbl">Bildiren <span style="color:var(--red-text)">*</span></label>
            <input class="finput" id="rd-kisi" placeholder="Ad Soyad"></div>
        </div>
        <div class="fgroup"><label class="flbl">Red Gerekçesi <span style="color:var(--red-text)">*</span></label>
          <textarea class="ftextarea" id="rd-gerekce" placeholder="örn. bant kenarında açılma"></textarea></div>
        <div class="fgroup"><label class="flbl">Karar</label>
          <select class="fselect" id="rd-karar">
            <option value="fire">🗑 FİRE — parça hurdaya ayrılır</option>
            ${oncekiler.length ? '<option value="geri">↩ ÖNCEKİ OPERASYON DÜZELTMESİ — istasyona geri gönder</option>' : ''}
          </select></div>
        <div class="fgroup" id="rd-hedef-wrap" style="display:none"><label class="flbl">Geri Gönderilecek İstasyon</label>
          <select class="fselect" id="rd-hedef">
            ${oncekiler.map(st => `<option value="${st.index}">${App.escapeHtml(st.kod)} — ${App.escapeHtml(st.tanim)} (${App.escapeHtml(st.hat || '')})</option>`).join('')}
          </select></div>`;
      const footer = `<button class="btn" id="rd-cancel">Vazgeç</button><button class="btn btn-red" id="rd-ok">Reddi Kaydet</button>`;
      App.openModal({ title: '✗ Kalite Reddi — ' + is.istasyonKod, body, footer, wide: true });
      document.getElementById('rd-karar').onchange = (e) => {
        document.getElementById('rd-hedef-wrap').style.display = e.target.value === 'geri' ? '' : 'none';
      };
      document.getElementById('rd-cancel').onclick = App.closeModal;
      document.getElementById('rd-ok').onclick = async () => {
        const adet = parseInt(document.getElementById('rd-adet').value) || 0;
        const kisi = document.getElementById('rd-kisi').value.trim();
        const gerekce = document.getElementById('rd-gerekce').value.trim();
        const karar = document.getElementById('rd-karar').value;
        if (adet < 1 || adet > maxRed) { App.toast(`Red adedi 1-${maxRed} aralığında olmalı`, 'err'); return; }
        if (!kisi || !gerekce) { App.toast('Bildiren ve gerekçe zorunlu', 'err'); return; }

        // Kalite sayfasına talep: NCR otomatik açılır (Uygunsuzluk & DÖF)
        const ncr = await App.persist(() => App.kaliteUygunsuzlukOlustur('uretim_istasyon', {
          kaynakId: is.id, kod: is.ymKod, ad: is.ymAd, miktar: adet, birim: 'ADET',
          tip: 'yarimamul', refId: is.yarimamulId,
          siparisId: is.kaynakTip === 'sip' ? is.kaynakId : null,
          aciklama: `${is.istasyonKod} istasyonunda kalite reddi (${is.kaynakKod}): ${gerekce} — Karar: ${karar === 'fire' ? 'FİRE' : 'önceki operasyona geri gönderme'}. Bildiren: ${kisi}`,
          fotograflar: [], sorumluBirim: 'uretim_planlama', dofAc: false
        }));

        is.redler.push({ adet, kisi, gerekce, karar, ncrNo: ncr.no, tarih: bugun() });
        if (karar === 'fire') {
          is.fireAdet += adet;
        } else {
          // Önceki operasyon düzeltmesi: ilgili istasyonun kartına geri gönder
          const hedefIndex = parseInt(document.getElementById('rd-hedef').value);
          const hedefStep = steps[hedefIndex];
          is.gelenAdet -= adet; // bu istasyondan çıkar
          // Onay sayaçları geleni aşmasın (kısmen onaylanmışsa kırp)
          const kalan = is.gelenAdet - is.fireAdet;
          if (is.kaliteOnayliAdet > kalan) is.kaliteOnayliAdet = kalan;
          if (is.islemTamamAdet > is.kaliteOnayliAdet) is.islemTamamAdet = is.kaliteOnayliAdet;
          let hedefIs = isler.find(x => x.kaynakTip === is.kaynakTip && x.kaynakId === is.kaynakId &&
            x.yarimamulId === is.yarimamulId && x.stepIndex === hedefIndex);
          if (hedefIs) { hedefIs.gelenAdet += adet; hedefIs.durum = 'aktif'; }
          else {
            isler.push({
              id: App.uid('IST'), kaynakTip: is.kaynakTip, kaynakId: is.kaynakId, kaynakKod: is.kaynakKod, kaynakEtiket: is.kaynakEtiket, musteriAdi: is.musteriAdi || '',
              yarimamulId: is.yarimamulId, ymKod: is.ymKod, ymAd: is.ymAd,
              rotaId: is.rotaId, rotaAd: is.rotaAd, stepIndex: hedefIndex,
              istasyonKod: hedefStep.kod, istasyonTanim: hedefStep.tanim, hat: hedefStep.hat || 'GENEL',
              gelenAdet: adet, kaliteOnayliAdet: 0, islemTamamAdet: 0, sevkEdilenAdet: 0, fireAdet: 0,
              kaliteOnaylari: [], islemOnaylari: [], sevkler: [], redler: [],
              barkodOkundu: false, etiketBasildi: is.etiketBasildi || false,
              etiketTarihi: is.etiketTarihi || null, etiketBasan: is.etiketBasan || null,
              durum: 'aktif', olusturmaTarihi: bugun()
            });
          }
        }
        await App.persist(() => Store.istasyonIsleri.save(isler));
        App.toast(`Red kaydedildi (${ncr.no} kalite talebi açıldı) — ${karar === 'fire' ? adet + ' adet FİRE' : adet + ' adet önceki istasyona geri gönderildi'}`, 'ok');
        App.closeModal();
        render(main);
      };
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // 👤 OPERATÖR YETKİLERİ (YÖNETİM) — iki bölüm:
  //   1) BEKLEYEN ŞİFRE TALEPLERİ: operatörün terminalden açtığı şifre
  //      oluşturma talebi. Yönetim hat/bölümleri işaretleyip ONAYLAR (operatör
  //      kaydı oluşur, yalnızca işaretli hatlara girebilir) veya REDDEDER.
  //   2) YETKİLİ OPERATÖRLER: hat/bölüm seçilerek filtrelenir; ✎ Düzenle ile
  //      kişi bazlı yetki alanları eklenir/eksiltilir, şifre sıfırlanır,
  //      hesap pasife alınır ya da silinir.
  // ════════════════════════════════════════════════════════════════════════
  function opIsimAnahtari(isim) {
    return String(isim || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
  }

  async function operatorYetkiModalAc(hatAdlari, sonrasi) {
    const [talepler, operatorler] = await Promise.all([
      Store.hatSifreTalepleri.all(), Store.hatOperatorleri.all()
    ]);
    // ── HAT LİSTESİNİ GENİŞLET ────────────────────────────────────────────
    // Ekrandan gelen liste yalnızca ROTA ADIMLARINDAN türetilir; rota
    // adımlarına henüz hat işlenmemişse BOŞ kalır ve talep kartındaki
    // işaret kutuları görünmez. Bu yüzden: (1) tanımlı hat/istasyon
    // listesindeki hatlar, (2) taleplerde istenen hatlar, (3) mevcut
    // operatörlerin yetkili olduğu hatlar da listeye eklenir.
    hatAdlari = [...(hatAdlari || [])];
    try {
      const tanimli = await Store.hatlarGetir(); // {hatAdi: [istasyonlar...]}
      Object.keys(tanimli || {}).forEach(h => {
        if (h && h !== 'TAŞIMA' && !hatAdlari.includes(h)) hatAdlari.push(h);
      });
    } catch (e) { /* okunamazsa diğer kaynaklarla devam */ }
    talepler.forEach(t => (t.hatlar || []).forEach(h => { if (h && !hatAdlari.includes(h)) hatAdlari.push(h); }));
    operatorler.forEach(o => (o.hatlar || []).forEach(h => { if (h && !hatAdlari.includes(h)) hatAdlari.push(h); }));
    hatAdlari.sort((a, b) => a.localeCompare(b, 'tr'));

    const bekleyenler = talepler.filter(t => t.durum === 'bekliyor');
    let filtreHat = operatorYetkiModalAc._filtre || '';

    const hatCheckboxlari = (sinif, secili) => hatAdlari.map(h =>
      `<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:20px;margin:2px;cursor:pointer">
        <input type="checkbox" class="${sinif}" value="${App.escapeHtml(h)}" ${(secili || []).includes(h) ? 'checked' : ''}> ${App.escapeHtml(h)}</label>`).join('');

    const body = document.createElement('div');
    body.innerHTML = `
      <!-- ── 1) BEKLEYEN TALEPLER ── -->
      <div class="card-title" style="font-size:12px;margin-bottom:8px">⏳ BEKLEYEN ŞİFRE TALEPLERİ (${bekleyenler.length})</div>
      ${bekleyenler.length ? bekleyenler.map(t => `
        <div style="border:1px solid var(--amber);background:var(--amber-bg);border-radius:10px;padding:10px 12px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
            <div><b style="font-size:12.5px">${App.escapeHtml(t.isim)}</b>
              <span class="muted" style="font-size:10.5px;margin-left:6px">Talep: ${App.escapeHtml(t.tarih || '')}</span></div>
          </div>
          <div style="font-size:10.5px;color:var(--text3);margin:6px 0 4px">Yetkilendirilecek hat/bölümleri işaretleyin (operatörün istedikleri işaretli geldi — ekleyip çıkarabilirsiniz):</div>
          <div>${hatCheckboxlari('oy-talep-hat-' + t.id, t.hatlar || [])}</div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-sm btn-green oy-onayla" data-id="${t.id}">✓ Onayla ve Yetkilendir</button>
            <button class="btn btn-sm oy-reddet" data-id="${t.id}" style="color:var(--red-text)">✗ Reddet</button>
          </div>
        </div>`).join('')
      : '<div class="muted" style="font-size:11.5px;padding:6px 0 10px">Bekleyen talep yok. Operatörler, ana giriş ekranındaki Hat Operatör Terminali üzerinden talep açar.</div>'}

      <!-- ── 2) YETKİLİ OPERATÖRLER ── -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px;flex-wrap:wrap;gap:8px">
        <div class="card-title" style="font-size:12px">👤 YETKİLİ OPERATÖRLER (${operatorler.length})</div>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="fselect" id="oy-filtre" style="max-width:220px;font-size:11.5px">
            <option value="">Tüm hat / bölümler</option>
            ${hatAdlari.map(h => `<option value="${App.escapeHtml(h)}" ${h === filtreHat ? 'selected' : ''}>${App.escapeHtml(h)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-blue" id="oy-yeni">+ Operatör Ekle</button>
        </div>
      </div>
      <div id="oy-liste"></div>`;

    App.openModal({
      title: '👤 Operatör Yetkileri & Şifre Talepleri',
      body,
      footer: `<button class="btn" id="oy-kapat">Kapat</button>`,
      wide: true
    });
    document.getElementById('oy-kapat').onclick = () => { App.closeModal(); if (sonrasi) sonrasi(); };

    // Operatör listesini (hat filtresine göre) çiz
    const listeCiz = () => {
      const el = document.getElementById('oy-liste');
      const filtreli = filtreHat ? operatorler.filter(o => (o.hatlar || []).includes(filtreHat)) : operatorler;
      el.innerHTML = filtreli.length ? `<table class="dtable" style="font-size:11.5px">
        <tr><th>Operatör</th><th>Yetkili Hat / Bölümler</th><th>Durum</th><th style="width:130px"></th></tr>
        ${filtreli.map(o => `<tr>
          <td><b>${App.escapeHtml(o.isim)}</b></td>
          <td>${(o.hatlar || []).map(h => `<span class="pill pill-blue" style="font-size:9.5px;margin:1px">${App.escapeHtml(h)}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
          <td>${o.durum === 'pasif' ? '<span class="pill pill-gray" style="font-size:9.5px">Pasif</span>' : '<span class="pill pill-green" style="font-size:9.5px">Aktif</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm oy-duzenle" data-id="${o.id}">✎ Düzenle</button>
            <button class="btn btn-sm oy-sil" data-id="${o.id}" style="color:var(--red-text)">🗑</button>
          </td></tr>`).join('')}
      </table>` : `<div class="muted" style="font-size:11.5px;padding:8px 0">${filtreHat ? 'Bu hat için yetkilendirilmiş operatör yok.' : 'Henüz yetkilendirilmiş operatör yok.'}</div>`;

      el.querySelectorAll('.oy-duzenle').forEach(b => b.onclick = () => {
        const o = operatorler.find(x => x.id === b.dataset.id);
        if (o) operatorDuzenleModal(o, hatAdlari, () => operatorYetkiModalAc(hatAdlari, sonrasi));
      });
      el.querySelectorAll('.oy-sil').forEach(b => b.onclick = async () => {
        const o = operatorler.find(x => x.id === b.dataset.id);
        if (!o) return;
        if (!window.confirm(o.isim + ' operatörünün TÜM hat yetkileri silinecek. Emin misiniz?')) return;
        const kalan = operatorler.filter(x => x.id !== o.id);
        await App.persist(() => Store.hatOperatorleri.save(kalan));
        App.toast('Operatör silindi: ' + o.isim, 'ok');
        operatorYetkiModalAc(hatAdlari, sonrasi);
      });
    };
    listeCiz();
    document.getElementById('oy-filtre').onchange = e => {
      filtreHat = e.target.value;
      operatorYetkiModalAc._filtre = filtreHat;
      listeCiz();
    };

    // + Operatör Ekle (yönetim doğrudan da tanımlayabilir)
    document.getElementById('oy-yeni').onclick = () =>
      operatorDuzenleModal(null, hatAdlari, () => operatorYetkiModalAc(hatAdlari, sonrasi));

    // Talep ONAYLA: işaretli hatlarla operatör kaydı oluştur/güncelle
    body.querySelectorAll('.oy-onayla').forEach(b => b.onclick = async () => {
      const t = talepler.find(x => x.id === b.dataset.id);
      if (!t) return;
      const secili = [...body.querySelectorAll('.oy-talep-hat-' + t.id + ':checked')].map(c => c.value);
      if (!secili.length) { App.toast('En az bir hat/bölüm işaretleyin', 'err'); return; }
      const anahtar = opIsimAnahtari(t.isim);
      const mevcut = operatorler.find(o => opIsimAnahtari(o.isim) === anahtar);
      if (mevcut) {
        // Şifre artık talepte hash'li gelir; düz metin hiçbir yerde tutulmaz
        if (t.sifreHash) { mevcut.sifreHash = t.sifreHash; delete mevcut.sifre; }
        else if (t.sifre) { mevcut.sifre = t.sifre; }   // çok eski talepler için
        mevcut.hatlar = [...new Set([...(mevcut.hatlar || []), ...secili])];
        mevcut.durum = 'aktif';
        mevcut.guncelleme = new Date().toISOString().slice(0, 10);
      } else {
        const yeniKayit = {
          id: App.uid('HOP'), isim: t.isim, hatlar: secili,
          durum: 'aktif', olusturmaTarihi: new Date().toISOString().slice(0, 10)
        };
        if (t.sifreHash) yeniKayit.sifreHash = t.sifreHash;
        else if (t.sifre) yeniKayit.sifre = t.sifre;
        operatorler.push(yeniKayit);
      }
      t.durum = 'onaylandi';
      t.onaylananHatlar = secili;
      t.kararTarihi = new Date().toISOString().slice(0, 10);
      await App.persist(async () => {
        await Store.hatOperatorleri.save(operatorler);
        await Store.hatSifreTalepleri.save(talepler);
      });
      App.toast('✓ ' + t.isim + ' yetkilendirildi: ' + secili.join(', '), 'ok');
      operatorYetkiModalAc(hatAdlari, sonrasi);
    });

    // Talep REDDET
    body.querySelectorAll('.oy-reddet').forEach(b => b.onclick = async () => {
      const t = talepler.find(x => x.id === b.dataset.id);
      if (!t) return;
      t.durum = 'reddedildi';
      t.kararTarihi = new Date().toISOString().slice(0, 10);
      await App.persist(() => Store.hatSifreTalepleri.save(talepler));
      App.toast('Talep reddedildi: ' + t.isim, 'ok');
      operatorYetkiModalAc(hatAdlari, sonrasi);
    });
  }

  // ── ✎ OPERATÖR DÜZENLE / + EKLE: kişi bazlı yetki alanı ekle-çıkar ───────
  function operatorDuzenleModal(op, hatAdlari, geriDon) {
    const yeni = !op;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fgroup"><label class="flbl">Adı Soyadı <span style="color:var(--red-text)">*</span></label>
        <input class="finput" id="od-isim" value="${App.escapeHtml(op ? op.isim : '')}" ${yeni ? '' : 'readonly style="background:var(--bg)"'}></div>
      <div class="fgroup"><label class="flbl">Yetkili Olduğu Hat / Bölümler <span style="color:var(--red-text)">*</span></label>
        <div style="border:1px solid var(--border);border-radius:8px;padding:8px">
          ${hatAdlari.map(h => `<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:20px;margin:2px;cursor:pointer">
            <input type="checkbox" class="od-hat" value="${App.escapeHtml(h)}" ${(op && (op.hatlar || []).includes(h)) ? 'checked' : ''}> ${App.escapeHtml(h)}</label>`).join('')}
        </div>
        <div class="fhint">İşaretleyerek yetki alanı <b>ekleyin</b>, işareti kaldırarak <b>eksiltin</b>.</div></div>
      <div class="fgroup"><label class="flbl">Şifre ${yeni ? '<span style="color:var(--red-text)">*</span>' : '(değiştirmek için doldurun)'}</label>
        <input class="finput" id="od-sifre" type="password" placeholder="${yeni ? 'en az 4 karakter' : 'boş bırakılırsa mevcut şifre korunur'}"></div>
      <div class="fgroup"><label class="flbl">Durum</label>
        <select class="fselect" id="od-durum">
          <option value="aktif" ${(!op || op.durum !== 'pasif') ? 'selected' : ''}>Aktif — giriş yapabilir</option>
          <option value="pasif" ${(op && op.durum === 'pasif') ? 'selected' : ''}>Pasif — girişi engellendi</option>
        </select></div>
      <div id="od-hata" style="color:var(--red-text);font-size:12px;min-height:16px"></div>`;
    App.openModal({
      title: yeni ? '+ Operatör Ekle' : '✎ Operatör Düzenle — ' + op.isim,
      body,
      footer: `<button class="btn" id="od-cancel">Vazgeç</button><button class="btn btn-blue" id="od-save">Kaydet</button>`
    });
    document.getElementById('od-cancel').onclick = () => { App.closeModal(); if (geriDon) geriDon(); };
    document.getElementById('od-save').onclick = async () => {
      const isim = document.getElementById('od-isim').value.trim();
      const secili = [...body.querySelectorAll('.od-hat:checked')].map(c => c.value);
      const sifre = document.getElementById('od-sifre').value;
      const durum = document.getElementById('od-durum').value;
      const hata = document.getElementById('od-hata');
      hata.textContent = '';
      if (!isim) { hata.textContent = 'Ad soyad zorunlu'; return; }
      if (!secili.length) { hata.textContent = 'En az bir hat/bölüm seçin'; return; }
      if (yeni && (sifre || '').length < 4) { hata.textContent = 'Şifre en az 4 karakter olmalı'; return; }
      if (sifre && sifre.length < 4) { hata.textContent = 'Şifre en az 4 karakter olmalı'; return; }
      const operatorler = await Store.hatOperatorleri.all();
      if (yeni && operatorler.some(o => opIsimAnahtari(o.isim) === opIsimAnahtari(isim))) {
        hata.textContent = 'Bu isimle kayıtlı operatör zaten var — listeden ✎ Düzenle kullanın';
        return;
      }
      // Şifre girildiyse SUNUCUDA hash'lenir; düz metin kayda yazılmaz
      let yeniHash = null;
      if (sifre) {
        try { yeniHash = await Store.sifreHashle(sifre, isim); }
        catch (e) { hata.textContent = e.message; return; }
      }
      if (yeni) {
        operatorler.push({
          id: App.uid('HOP'), isim, sifreHash: yeniHash, hatlar: secili, durum,
          olusturmaTarihi: new Date().toISOString().slice(0, 10)
        });
      } else {
        const kayit = operatorler.find(o => o.id === op.id);
        if (kayit) {
          kayit.hatlar = secili;
          kayit.durum = durum;
          if (yeniHash) { kayit.sifreHash = yeniHash; delete kayit.sifre; }
          kayit.guncelleme = new Date().toISOString().slice(0, 10);
        }
      }
      await App.persist(() => Store.hatOperatorleri.save(operatorler));
      App.toast(yeni ? '✓ Operatör eklendi: ' + isim : '✓ Yetkiler güncellendi: ' + isim, 'ok');
      App.closeModal();
      if (geriDon) geriDon();
    };
  }

  return { render, isKartlariniSenkronize };
})();
