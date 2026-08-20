// ════════════════════════════════════════════════════════════════════════════
// STEP (ISO 10303) MONTAJ AĞACI OKUYUCU
// ────────────────────────────────────────────────────────────────────────────
// SolidWorks (ve diğer CAD'ler) STEP dosyasına montaj ağacını yazar. Bu modül
// o ağacı çıkarır: hangi parça hangi montajın altında, KAÇ ADET.
//
// NE OKUNUR (güvenilir):
//   • PRODUCT               → parça/montaj adları
//   • PRODUCT_DEFINITION    → parça tanımları (ağaç düğümleri)
//   • NEXT_ASSEMBLY_USAGE_OCCURRENCE (NAUO) → ebeveyn-çocuk ilişkisi
//     Aynı çocuk için birden çok NAUO satırı = o parçadan o kadar adet var.
//
// NE OKUNMAZ (STEP taşımaz veya güvenilmez):
//   • Malzeme cinsi, kenar bandı, delik şeması → bunlar sistemde tanımlanır
//   • Panel ölçüleri → geometriden kaba tahmin çıkarılabilir ama YANLIŞ ÖLÇÜ
//     yanlış kesim demektir; ölçüler kullanıcı tarafından girilir/doğrulanır.
//
// ÇIKTI: { kok, dugumler[], agac, uyarilar[] }
// ════════════════════════════════════════════════════════════════════════════
const StepOkuyucu = (() => {

  // STEP satırları çok uzun olabilir ve satır sonu içerebilir; önce
  // ';' ile ayrılmış "varlık" listesine böleriz.
  function varliklariAyir(metin) {
    const dataBas = metin.indexOf('DATA;');
    const dataSon = metin.lastIndexOf('ENDSEC;');
    const govde = (dataBas >= 0 && dataSon > dataBas)
      ? metin.slice(dataBas + 5, dataSon)
      : metin;
    // Yorumları temizle: /* ... */
    const temiz = govde.replace(/\/\*[\s\S]*?\*\//g, '');
    return temiz.split(';');
  }

  // '#12=PRODUCT('AD','AD','',(#2));' → { id:'12', tip:'PRODUCT', args:"..." }
  function varlikCoz(parca) {
    const m = parca.match(/^\s*#(\d+)\s*=\s*([A-Z_0-9]+)\s*\(([\s\S]*)\)\s*$/);
    if (!m) return null;
    return { id: m[1], tip: m[2], args: m[3] };
  }

  // Argümanları en üst seviyede virgülle böler (parantez ve tırnak içindekileri atlar)
  function argBol(args) {
    const sonuc = [];
    let derinlik = 0, tirnak = false, mevcut = '';
    for (let i = 0; i < args.length; i++) {
      const ch = args[i];
      if (ch === "'" && args[i - 1] !== '\\') tirnak = !tirnak;
      if (!tirnak) {
        if (ch === '(') derinlik++;
        else if (ch === ')') derinlik--;
        else if (ch === ',' && derinlik === 0) { sonuc.push(mevcut.trim()); mevcut = ''; continue; }
      }
      mevcut += ch;
    }
    if (mevcut.trim() !== '') sonuc.push(mevcut.trim());
    return sonuc;
  }

  const metniAl = (arg) => {
    const m = String(arg || '').match(/^'([\s\S]*)'$/);
    if (!m) return '';
    // STEP kaçışları: '' → ' ve \X2\...\X0\ (unicode) basitçe temizlenir
    return m[1].replace(/''/g, "'").replace(/\\X2\\[0-9A-F]+\\X0\\/g, '');
  };
  const refAl = (arg) => {
    const m = String(arg || '').match(/#(\d+)/);
    return m ? m[1] : null;
  };

  function oku(metin) {
    const uyarilar = [];
    if (!metin || metin.indexOf('ISO-10303') < 0) {
      return { hata: 'Bu dosya bir STEP (ISO 10303) dosyası değil.' };
    }

    const urunler = new Map();      // productId -> ad
    const tanimFormasyon = new Map(); // product_definition_formation id -> productId
    const tanimlar = new Map();     // product_definition id -> productId
    const nauolar = [];             // { ebeveynTanim, cocukTanim }

    varliklariAyir(metin).forEach(parca => {
      const v = varlikCoz(parca);
      if (!v) return;
      const a = argBol(v.args);

      switch (v.tip) {
        case 'PRODUCT':
          // PRODUCT(id, name, description, frame_of_reference)
          urunler.set(v.id, metniAl(a[1]) || metniAl(a[0]) || ('Parça #' + v.id));
          break;
        case 'PRODUCT_DEFINITION_FORMATION':
        case 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE':
          // (id, description, of_product)
          tanimFormasyon.set(v.id, refAl(a[2]));
          break;
        case 'PRODUCT_DEFINITION':
          // (id, description, formation, frame_of_reference)
          tanimlar.set(v.id, refAl(a[2]));
          break;
        case 'NEXT_ASSEMBLY_USAGE_OCCURRENCE':
          // (id, name, description, relating(parent), related(child), ref)
          nauolar.push({ ebeveynTanim: refAl(a[3]), cocukTanim: refAl(a[4]) });
          break;
      }
    });

    if (!urunler.size) return { hata: 'Dosyada parça (PRODUCT) bulunamadı.' };

    // product_definition -> product adı çözümü
    const tanimUrunu = (tanimId) => {
      const formId = tanimlar.get(tanimId);
      if (!formId) return null;
      return tanimFormasyon.get(formId) || null;
    };

    // Ebeveyn-çocuk ilişkileri (ürün id düzeyinde), adet sayımıyla
    const iliskiler = [];   // { ebeveyn, cocuk }
    nauolar.forEach(n => {
      const e = tanimUrunu(n.ebeveynTanim);
      const c = tanimUrunu(n.cocukTanim);
      if (e && c) iliskiler.push({ ebeveyn: e, cocuk: c });
    });

    if (!iliskiler.length) {
      uyarilar.push('Montaj ilişkisi (NAUO) bulunamadı — dosya tek parça olabilir. ' +
        'Tüm parçalar kök altında listelendi.');
    }

    // KÖK: hiçbir ilişkide çocuk olarak geçmeyen ürün
    const cocukOlanlar = new Set(iliskiler.map(i => i.cocuk));
    const kokAdaylari = [...urunler.keys()].filter(id => !cocukOlanlar.has(id));
    // Sadece ilişkiye giren ürünleri dikkate al (geometri artıkları elenir)
    const iliskiliOlanlar = new Set([...iliskiler.map(i => i.ebeveyn), ...iliskiler.map(i => i.cocuk)]);
    let kok = kokAdaylari.find(id => iliskiliOlanlar.has(id)) || kokAdaylari[0] || [...urunler.keys()][0];

    if (kokAdaylari.length > 1 && iliskiler.length) {
      uyarilar.push(`${kokAdaylari.length} adet kök seviyesi parça bulundu; ` +
        `"${urunler.get(kok)}" ana montaj kabul edildi.`);
    }

    // Ağacı kur (adet = aynı ebeveyn-çocuk ilişkisinin tekrar sayısı)
    function cocuklariBul(ebeveynId) {
      const sayac = new Map();
      iliskiler.filter(i => i.ebeveyn === ebeveynId)
        .forEach(i => sayac.set(i.cocuk, (sayac.get(i.cocuk) || 0) + 1));
      return [...sayac.entries()].map(([id, adet]) => ({ id, adet }));
    }

    const gorulen = new Set();
    function agacKur(id, adet, seviye) {
      // Döngü koruması: aynı parça kendi altında tekrar geçerse dur
      const anahtar = seviye + ':' + id;
      if (gorulen.has(anahtar) || seviye > 12) return null;
      gorulen.add(anahtar);
      const cocuklar = cocuklariBul(id)
        .map(c => agacKur(c.id, c.adet, seviye + 1))
        .filter(Boolean);
      return {
        urunId: id,
        ad: urunler.get(id) || ('Parça #' + id),
        adet,
        seviye,
        yaprakMi: cocuklar.length === 0,
        cocuklar
      };
    }

    const agac = agacKur(kok, 1, 0);

    // Düz liste (kart oluşturma için) — aynı parça birden çok yerde geçerse
    // TOPLAM adet hesaplanır (üst seviye çarpanlarıyla).
    const dugumler = [];
    (function duzlestir(d, carpan) {
      if (!d) return;
      if (d.seviye > 0) {
        const mevcut = dugumler.find(x => x.urunId === d.urunId);
        if (mevcut) mevcut.toplamAdet += d.adet * carpan;
        else dugumler.push({
          urunId: d.urunId, ad: d.ad, seviye: d.seviye,
          toplamAdet: d.adet * carpan, yaprakMi: d.yaprakMi
        });
      }
      d.cocuklar.forEach(c => duzlestir(c, carpan * d.adet));
    })(agac, 1);

    return {
      kok: agac ? { urunId: agac.urunId, ad: agac.ad } : null,
      agac,
      dugumler,
      istatistik: {
        toplamParcaTipi: dugumler.length,
        toplamParcaAdedi: dugumler.reduce((a, d) => a + d.toplamAdet, 0),
        montajSayisi: dugumler.filter(d => !d.yaprakMi).length,
        yaprakSayisi: dugumler.filter(d => d.yaprakMi).length
      },
      uyarilar
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // GEOMETRİ ÇIKARIMI — parça başına sınır kutusu
  // ────────────────────────────────────────────────────────────────────────────
  // STEP'in tam B-rep geometrisini (eğri yüzeyler, NURBS) çözmek bir CAD
  // çekirdeği ister. Ama MOBİLYA parçaları neredeyse tamamen PRİZMATİKTİR:
  // panel, raf, kapak... Bu parçalar için SINIR KUTUSU gerçek şeklin kendisidir.
  //
  // YÖNTEM: Her parçanın şekil gösterimindeki CARTESIAN_POINT'ler toplanır,
  // min/max alınır. Sonuç: konum + ölçü. Bu, patlatılmış şema ve görünüş
  // çizimi için yeterlidir.
  //
  // SINIR — dürüstçe: Eğri/karmaşık parçalarda (kulp, ayak, dökme parça)
  // sınır kutusu yalnızca kapladığı hacmi gösterir, şekli göstermez. Bu tür
  // parçalar şemada kutu olarak görünür. Kılavuzda bu durum belirtilir.
  // ══════════════════════════════════════════════════════════════════════════
  function geometriCikar(metin) {
    const parcalar = new Map();   // productId -> {min,max}
    const noktalar = new Map();   // entityId -> [x,y,z]
    const sekilAdi = new Map();   // shape entity id -> ad

    varliklariAyir(metin).forEach(parca => {
      const v = varlikCoz(parca);
      if (!v) return;
      if (v.tip === 'CARTESIAN_POINT') {
        // CARTESIAN_POINT('',(x,y,z))
        const m = v.args.match(/\(\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*\)/);
        if (m) noktalar.set(v.id, [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
        return;
      }
      // Şekil gösterimi: adı + içerdiği nokta referansları
      if (/SHAPE_REPRESENTATION$/.test(v.tip) || v.tip === 'ADVANCED_BREP_SHAPE_REPRESENTATION'
          || v.tip === 'MANIFOLD_SOLID_BREP' || v.tip === 'GEOMETRIC_CURVE_SET') {
        const a = argBol(v.args);
        const ad = metniAl(a[0]);
        const refler = (v.args.match(/#\d+/g) || []).map(x => x.slice(1));
        sekilAdi.set(v.id, { ad, refler });
      }
    });

    // Şekil gösterimlerini gez, içindeki noktalardan sınır kutusu çıkar
    sekilAdi.forEach((sek) => {
      if (!sek.ad) return;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity;
      let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      let sayi = 0;
      sek.refler.forEach(r => {
        const n = noktalar.get(r);
        if (!n) return;
        sayi++;
        if (n[0] < x0) x0 = n[0]; if (n[0] > x1) x1 = n[0];
        if (n[1] < y0) y0 = n[1]; if (n[1] > y1) y1 = n[1];
        if (n[2] < z0) z0 = n[2]; if (n[2] > z1) z1 = n[2];
      });
      if (sayi < 2 || !isFinite(x0)) return;
      const k = sek.ad.toLocaleUpperCase('tr');
      const mevcut = parcalar.get(k);
      const kutu = {
        ad: sek.ad,
        min: [x0, y0, z0], max: [x1, y1, z1],
        olcu: [Math.round((x1 - x0) * 100) / 100,
               Math.round((y1 - y0) * 100) / 100,
               Math.round((z1 - z0) * 100) / 100],
        merkez: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
        noktaSayisi: sayi
      };
      // Aynı ad birden çok örnekte geçebilir; hepsini sakla
      if (mevcut) mevcut.ornekler.push(kutu);
      else parcalar.set(k, { ad: sek.ad, ornekler: [kutu] });
    });

    const liste = [];
    parcalar.forEach(p => p.ornekler.forEach(o => liste.push(o)));
    // Genel sınır kutusu (kamera ve ölçek için)
    let gx0 = Infinity, gy0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gy1 = -Infinity, gz1 = -Infinity;
    liste.forEach(o => {
      gx0 = Math.min(gx0, o.min[0]); gy0 = Math.min(gy0, o.min[1]); gz0 = Math.min(gz0, o.min[2]);
      gx1 = Math.max(gx1, o.max[0]); gy1 = Math.max(gy1, o.max[1]); gz1 = Math.max(gz1, o.max[2]);
    });
    return {
      parcalar: liste,
      geometriVar: liste.length > 0,
      toplamNokta: noktalar.size,
      genel: liste.length ? {
        min: [gx0, gy0, gz0], max: [gx1, gy1, gz1],
        olcu: [Math.round((gx1 - gx0) * 100) / 100,
               Math.round((gy1 - gy0) * 100) / 100,
               Math.round((gz1 - gz0) * 100) / 100]
      } : null
    };
  }

  // ── KOD TÜRETME ───────────────────────────────────────────────────────────
  // Kullanıcı ürüne bir kök kod verir; paket ve yarı mamül kodları bundan
  // türetilir. Şablon değiştirilebilir olsun diye ayrı fonksiyon.
  function kodTuret(kokKod, tip, sira) {
    const k = String(kokKod || '').trim().toUpperCase().replace(/\s+/g, '');
    const n = String(sira).padStart(2, '0');
    if (tip === 'paket') return `${k}.PKT${n}`;
    if (tip === 'yarimamul') return `Y.${k}.${n}`;
    return k;
  }

  return { oku, geometriCikar, kodTuret, _ic: { varlikCoz, argBol, metniAl } };
})();

if (typeof module !== 'undefined') module.exports = StepOkuyucu;
