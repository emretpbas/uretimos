// ════════════════════════════════════════════════════════════════════════════
// MASA / WORKSTATION ÖLÇÜ HESAP MOTORU
//
// dolap_hesap.js ile aynı ilkeyle yazılmıştır: SAF HESAP — DOM'a, Store'a,
// hiçbir şeye dokunmaz. Sebebi aynı: yanlış ölçü kesilen tablayı çöpe atar.
// Bu yüzden hesap arayüzden ayrılmış ve testle korunmuştur
// (testler/masa_hesap_test.js).
//
// ── REFERANS ALINAN GERÇEK ÜRÜNLER ─────────────────────────────────────────
// 1) RD.M.14080.S2.15.97 — tek kişilik 140×80 masa (sistemde kayıtlı):
//      Tabla 140×80 30mm (plaka + 4 kenar bandı + aksesuar + 24 minifix)
//      Perde 1100×350 18mm · Masa ayağı · Perde tutucu · Travers → 3 paket
// 2) RDW.M.480145.03.98 — 6 kişilik workstation (alt kırılım Excel'i):
//      480 cm boy × 145 cm derinlik, KARŞILIKLI 3+3 dizilim
//      6 × Tabla 160×70 30mm · 2 × tek yönlü uç ayak · 4 × iki yönlü kutu ayak
//      6 × travers · tabla başına 32 minifix + 4 köşe koruyucu
//      12 paket: tablalar 2'şer, ayaklar 2'şer, traversler 1'er
// Aşağıdaki varsayılan oranlar (minifix/tabla, köşe koruyucu/tabla, paketleme
// kuralı) doğrudan bu ikinci dosyadan alınmıştır.
//
// ── AYAK MODELLERİ ─────────────────────────────────────────────────────────
// Iron · Titan · Nord · Trim · Flat. Her modelin üç kullanım tipi vardır:
//   tek_yon → sıranın UCUNDA, tek tarafa tabla taşır
//   iki_yon → sıranın ORTASINDA, iki tarafa tabla taşır
//   kutu    → karşılıklı dizilimde iki sırayı birden taşıyan kutu ayak
// Modellerin ürün kodları ve alt reçeteleri (sac, profil, boya, pingo ayak…)
// HENÜZ GİRİLMEMİŞTİR — kullanıcı reçeteleri yükledikçe AYAK_MODELLERI
// tablosundaki `kod` ve `receteKalemleri` alanları doldurulacaktır. Hesap bu
// alanlar boşken de çalışır; eksik olanları `uyarilar` içinde bildirir.
// ════════════════════════════════════════════════════════════════════════════
const MasaHesap = (() => {

  const yuvarla = (n) => Math.round(n * 10) / 10;

  // ── AYAK MODEL KÜTÜPHANESİ ───────────────────────────────────────────────
  // receteKalemleri: [{ stokKodu, miktar, birim }] — reçeteler yüklendikçe dolar.
  // Boş bırakılan model, ürün ağacına yarı mamül olarak yine de yazılır; alt
  // kırılımı sonradan reçete ekranından veya buradan doldurulabilir.
  const AYAK_MODELLERI = {
    Iron: {
      ad: 'Iron', aciklama: 'Metal profil gövdeli ayak ailesi',
      varsayilanYukseklik: 720, profilKesit: '50×50×1,4 DKP',
      tipler: {
        tek_yon: { ad: 'Iron Tek Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        iki_yon: { ad: 'Iron İki Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        kutu:    { ad: 'Iron Kutu Ayak', kod: '', receteKalemleri: [] }
      }
    },
    Titan: {
      ad: 'Titan', aciklama: 'Ağır yük taşıyan kutu profil ayak ailesi',
      varsayilanYukseklik: 720, profilKesit: '60×60 DKP',
      tipler: {
        tek_yon: { ad: 'Titan Tek Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        iki_yon: { ad: 'Titan İki Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        kutu:    { ad: 'Titan Kutu Ayak', kod: '', receteKalemleri: [] }
      }
    },
    Nord: {
      ad: 'Nord', aciklama: 'Ahşap görünümlü / kombine ayak ailesi',
      varsayilanYukseklik: 720, profilKesit: '',
      tipler: {
        tek_yon: { ad: 'Nord Tek Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        iki_yon: { ad: 'Nord İki Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        kutu:    { ad: 'Nord Kutu Ayak', kod: '', receteKalemleri: [] }
      }
    },
    Trim: {
      ad: 'Trim', aciklama: 'İnce kesitli minimal ayak ailesi',
      varsayilanYukseklik: 720, profilKesit: '40×40 DKP',
      tipler: {
        tek_yon: { ad: 'Trim Tek Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        iki_yon: { ad: 'Trim İki Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        kutu:    { ad: 'Trim Kutu Ayak', kod: '', receteKalemleri: [] }
      }
    },
    Flat: {
      ad: 'Flat', aciklama: 'Yassı sac panel ayak ailesi',
      varsayilanYukseklik: 720, profilKesit: 'Sac panel',
      tipler: {
        tek_yon: { ad: 'Flat Tek Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        iki_yon: { ad: 'Flat İki Yönlü Masa Ayağı', kod: '', receteKalemleri: [] },
        kutu:    { ad: 'Flat Kutu Ayak', kod: '', receteKalemleri: [] }
      }
    }
  };
  const MODELLER = Object.keys(AYAK_MODELLERI);
  const modelAl = (ad) => AYAK_MODELLERI[ad] || AYAK_MODELLERI.Iron;

  const VARSAYILAN = {
    // ── DÜZEN ────────────────────────────────────────────────────────────
    tip: 'workstation',        // tekli | workstation | toplanti
    kisiSayisi: 6,
    dizilim: 'karsilikli',     // tek_sira | karsilikli
    // ── TABLA ────────────────────────────────────────────────────────────
    tablaBoy: 1600,            // kişi başına tabla uzunluğu (mm)
    tablaEn: 700,              // tabla derinliği (mm)
    tablaKalinlik: 30,
    siraArasiBosluk: 50,       // karşılıklı dizilimde iki sıra arası (mm)
    // ── AYAK ─────────────────────────────────────────────────────────────
    ayakModeli: 'Iron',        // Iron | Titan | Nord | Trim | Flat
    ayakYukseklik: 720,
    ayakAdet: 0,               // 0 = otomatik (dizilimden hesaplanır)
    // ── TRAVERS / PERDE / MODESTY ────────────────────────────────────────
    traversVar: true, traversAdet: 0,      // 0 = otomatik (tabla adedi kadar)
    perdeVar: false, perdeYukseklik: 350, perdeKalinlik: 18,
    modestyVar: false, modestyYukseklik: 350, modestyKalinlik: 18,
    // ── ÜRETİM ───────────────────────────────────────────────────────────
    kesimPayi: 10,
    minifixTablaBasi: 32,      // RDW.M.480145: 192 adet / 6 tabla
    koseKoruyucuTablaBasi: 4,  // RDW.M.480145: 24 adet / 6 tabla
    aksesuarVar: true,
    paketleme: true,
    tablaPaketBasi: 2,         // referans üründe paket başına 2 tabla
    ayakPaketBasi: 2,
    traversPaketBasi: 1,
    // ── PANEL BAZLI MALZEME VE KENAR BANDI ───────────────────────────────
    // panelAyarlari[rol] = { kalinlik, hammaddeId, bantlar:{on,arka,sag,sol} }
    // Roller: tabla · perde · modesty
    panelAyarlari: {}
  };

  // Kenar bandı atanmış kenarların toplam uzunluğu (mm).
  // Kenar→ölçü eşlemesi uygulamanın geri kalanıyla aynı: ön/arka → NET BOY,
  // sağ/sol → NET EN.
  function bantUzunlukIds(ids, en, boy) {
    if (!ids) return 0;
    let m = 0;
    if (ids.on) m += boy;
    if (ids.arka) m += boy;
    if (ids.sag) m += en;
    if (ids.sol) m += en;
    return m;
  }

  // ── AYAK YERLEŞİMİ ───────────────────────────────────────────────────────
  // Bir sırada N tabla varsa N+1 ayak konumu olur: iki uçta TEK YÖNLÜ,
  // aralarda İKİ YÖNLÜ. Karşılıklı dizilimde ayaklar iki sırayı birden
  // taşıdığı için konum sayısı aynı kalır; ara ayaklar KUTU tipine döner.
  //
  // NOT: Referans ürün RDW.M.480145 (karşılıklı 3+3) 2 tek yönlü + 4 iki yönlü
  // ayak içeriyor; bu kural 2 tek yönlü + 2 kutu üretir. Gerçek ürünün ayak
  // adedi farklıysa `ayakAdet` alanından elle verilebilir ve fark uyarı olarak
  // bildirilir. Ayak reçeteleri yüklendiğinde kural netleştirilecektir.
  function ayakYerlesimi(c) {
    const karsilikliMi = c.dizilim === 'karsilikli';
    const siraBasiTabla = karsilikliMi ? Math.ceil(c.kisiSayisi / 2) : c.kisiSayisi;
    const konumSayisi = siraBasiTabla + 1;
    const ucAyak = Math.min(2, konumSayisi);
    const araAyak = Math.max(0, konumSayisi - 2);
    return {
      siraBasiTabla, konumSayisi,
      tekYon: ucAyak,
      araTip: karsilikliMi ? 'kutu' : 'iki_yon',
      ara: araAyak,
      toplam: ucAyak + araAyak
    };
  }

  // ── ANA HESAP ────────────────────────────────────────────────────────────
  function hesapla(girdi) {
    const c = Object.assign({}, VARSAYILAN, girdi || {});
    const uyarilar = [];
    const N = Math.max(1, Math.floor(+c.kisiSayisi || 1));
    const TB = +c.tablaBoy, TE = +c.tablaEn, TK = +c.tablaKalinlik;

    if (!(TB > 0 && TE > 0)) {
      return { paneller: [], metaller: [], hirdavat: [], paketler: [], uyarilar: ['Tabla ölçüleri sıfırdan büyük olmalı'] };
    }

    const karsilikliMi = c.dizilim === 'karsilikli';
    const yer = ayakYerlesimi(c);
    // Toplam gabari
    const toplamBoy = yer.siraBasiTabla * TB;
    const toplamEn = karsilikliMi ? (2 * TE + (+c.siraArasiBosluk || 0)) : TE;
    const toplamYukseklik = (+c.ayakYukseklik || 720) + TK;

    // ── PANELLER (plaka parçaları) ───────────────────────────────────────
    const paneller = [];
    const panelAyar = (rol) => (c.panelAyarlari && c.panelAyarlari[rol]) || {};
    const ekle = (ad, adet, netEn, netBoy, rol, kalinlikVars) => {
      if (adet <= 0 || netEn <= 0 || netBoy <= 0) return;
      const pa = panelAyar(rol);
      const kal = (+pa.kalinlik > 0) ? +pa.kalinlik : kalinlikVars;
      const bantIds = pa.bantlar ? {
        on: pa.bantlar.on || null, arka: pa.bantlar.arka || null,
        sag: pa.bantlar.sag || null, sol: pa.bantlar.sol || null
      } : null;
      paneller.push({
        ad, adet, rol,
        netEn: yuvarla(netEn), netBoy: yuvarla(netBoy), kalinlik: kal,
        kabaEn: yuvarla(netEn + 2 * c.kesimPayi), kabaBoy: yuvarla(netBoy + 2 * c.kesimPayi),
        bantIds, hammaddeId: pa.hammaddeId || null,
        bantMetre: Math.round(bantUzunlukIds(bantIds, netEn, netBoy) * adet) / 1000
      });
    };

    ekle('Tabla ' + Math.round(TB / 10) + '×' + Math.round(TE / 10) + ' ' + TK + 'mm', N, TE, TB, 'tabla', TK);
    if (c.perdeVar) {
      // Perde sıranın tamamı boyunca, kişi başına bir parça
      ekle('Perde', N, +c.perdeYukseklik, TB - 100, 'perde', +c.perdeKalinlik);
    }
    if (c.modestyVar) {
      ekle('Modesty panel', N, +c.modestyYukseklik, TB - 100, 'modesty', +c.modestyKalinlik);
    }

    // ── METAL PARÇALAR (ayak ve travers — yarı mamül olarak işlenir) ──────
    const model = modelAl(c.ayakModeli);
    const metaller = [];
    const mEkle = (tipKod, adet) => {
      if (adet <= 0) return;
      const t = model.tipler[tipKod];
      metaller.push({
        rol: 'ayak', tipKod, adet,
        ad: t.ad, kod: t.kod || '',
        model: model.ad, yukseklik: +c.ayakYukseklik || model.varsayilanYukseklik,
        receteKalemleri: (t.receteKalemleri || []).slice(),
        receteEksik: !(t.receteKalemleri && t.receteKalemleri.length)
      });
    };

    // Elle ayak adedi verilmişse orantılı dağıt, verilmemişse kurala göre
    if (+c.ayakAdet > 0 && +c.ayakAdet !== yer.toplam) {
      const fazla = +c.ayakAdet - yer.tekYon;
      mEkle('tek_yon', yer.tekYon);
      mEkle(yer.araTip, Math.max(0, fazla));
      uyarilar.push('Ayak adedi elle ' + c.ayakAdet + ' verildi (dizilim kuralı ' + yer.toplam +
        ' öngörüyordu) — uç ayaklar ' + yer.tekYon + ', kalanlar ' +
        (yer.araTip === 'kutu' ? 'kutu' : 'iki yönlü') + ' ayak olarak dağıtıldı');
    } else {
      mEkle('tek_yon', yer.tekYon);
      mEkle(yer.araTip, yer.ara);
    }

    const traversAdet = c.traversVar ? ((+c.traversAdet > 0) ? +c.traversAdet : N) : 0;
    if (traversAdet > 0) {
      metaller.push({
        rol: 'travers', tipKod: 'travers', adet: traversAdet,
        ad: model.ad + ' Travers', kod: '', model: model.ad,
        receteKalemleri: [], receteEksik: true
      });
    }

    // Reçetesi henüz girilmemiş metal parçaları bildir
    const eksikler = metaller.filter(m => m.receteEksik).map(m => m.ad);
    if (eksikler.length) {
      uyarilar.push('Alt reçetesi henüz girilmemiş metal parça: ' + [...new Set(eksikler)].join(', ') +
        ' — ürün ağacına yarı mamül olarak yazılır, alt kırılımı reçete yüklendiğinde tamamlanır');
    }

    // ── HIRDAVAT ─────────────────────────────────────────────────────────
    const hirdavat = [];
    const hEkle = (ad, adet, birim, not) => {
      if (adet <= 0) return;
      const v = hirdavat.find(x => x.ad === ad);
      if (v) v.adet += Math.round(adet);
      else hirdavat.push({ ad, adet: Math.round(adet), birim: birim || 'ADET', not: not || '' });
    };
    hEkle('Minifix metal dübel', N * (+c.minifixTablaBasi || 0), 'ADET', 'tabla başına ' + c.minifixTablaBasi);
    hEkle('Köşe koruyucu plastik', N * (+c.koseKoruyucuTablaBasi || 0), 'ADET', 'tabla başına ' + c.koseKoruyucuTablaBasi);
    if (c.aksesuarVar) hEkle('Aksesuar workstation ofis', Math.ceil(N / (+c.tablaPaketBasi || 2)), 'ADET', 'paket başına 1');

    // ── PAKETLEME ────────────────────────────────────────────────────────
    // Referans üründeki kural: tablalar 2'şer, ayaklar 2'şer, traversler 1'er
    const paketler = [];
    if (c.paketleme) {
      const grup = (adet, basi, ad) => {
        const n = Math.max(1, +basi || 1);
        const tam = Math.floor(adet / n), kalan = adet % n;
        for (let i = 0; i < tam; i++) paketler.push({ ad, icerik: n });
        if (kalan) paketler.push({ ad, icerik: kalan });
      };
      grup(N, c.tablaPaketBasi, 'Tabla paketi');
      metaller.filter(m => m.rol === 'ayak').forEach(m => grup(m.adet, c.ayakPaketBasi, m.ad + ' paketi'));
      if (traversAdet) grup(traversAdet, c.traversPaketBasi, 'Travers paketi');
      paketler.forEach((p, i) => { p.no = i + 1; p.etiket = 'PKT ' + (i + 1) + '/' + paketler.length; });
    }

    // ── ÖZET ─────────────────────────────────────────────────────────────
    const netAlanM2 = paneller.reduce((s, p) => s + (p.netEn * p.netBoy * p.adet) / 1e6, 0);
    const kabaAlanM2 = paneller.reduce((s, p) => s + (p.kabaEn * p.kabaBoy * p.adet) / 1e6, 0);
    const bantMetre = paneller.reduce((s, p) => s + p.bantMetre, 0);

    if (karsilikliMi && N % 2 !== 0) {
      uyarilar.push('Karşılıklı dizilimde kişi sayısı tek (' + N + ') — bir sıra ' +
        yer.siraBasiTabla + ', diğeri ' + (N - yer.siraBasiTabla) + ' tabla alır');
    }
    if (TB > 1800) uyarilar.push('Tabla boyu ' + TB + ' mm — 1800 mm üstü tablalarda orta destek/travers önerilir');

    return {
      paneller, metaller, hirdavat, paketler, uyarilar,
      yerlesim: {
        karsilikliMi, siraSayisi: karsilikliMi ? 2 : 1,
        siraBasiTabla: yer.siraBasiTabla, ayakKonumSayisi: yer.konumSayisi,
        tekYonAyak: yer.tekYon, araAyak: yer.ara, araAyakTipi: yer.araTip,
        toplamBoy: yuvarla(toplamBoy), toplamEn: yuvarla(toplamEn),
        toplamYukseklik: yuvarla(toplamYukseklik)
      },
      ozet: {
        kisiSayisi: N, tablaAdedi: N,
        parcaAdedi: paneller.reduce((s, p) => s + p.adet, 0),
        metalAdedi: metaller.reduce((s, m) => s + m.adet, 0),
        paketAdedi: paketler.length,
        netAlanM2: Math.round(netAlanM2 * 100) / 100,
        kabaAlanM2: Math.round(kabaAlanM2 * 100) / 100,
        fireYuzde: kabaAlanM2 > 0 ? yuvarla(((kabaAlanM2 - netAlanM2) / kabaAlanM2) * 100) : 0,
        bantMetre: Math.round(bantMetre * 1000) / 1000,
        toplamBoy: yuvarla(toplamBoy), toplamEn: yuvarla(toplamEn),
        toplamYukseklik: yuvarla(toplamYukseklik)
      },
      yapilandirma: c
    };
  }

  return { hesapla, VARSAYILAN, AYAK_MODELLERI, MODELLER, modelAl, ayakYerlesimi, bantUzunlukIds };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MasaHesap;
