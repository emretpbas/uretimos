// ════════════════════════════════════════════════════════════════════════════
// RENK VARYANTI MOTORU — deterministik (AI/LLM DEĞİL) kural tabanlı klonlama.
// ────────────────────────────────────────────────────────────────────────────
// GERÇEK İHTİYAÇ: reçete yaparken en çok zorlanılan konu, bir yarı mamülün
// renk varyantını çıkarırken ALTINDAKİ hammaddelerin de değişmesi gerekmesi
// (ör. Beyaz'da "Kar Beyaz Sunta" kullanılan yerde Antrasit'te "D143 MDF"
// veya "Karbon Gri Sunta" kullanılması — malzeme tipi ayrı tutulur). Metraj,
// ağırlık, ölçü, rota, amortisman, GYG oranı gibi değerler HİÇ değişmez —
// sadece renge bağımlı hammadde referansları (sunta/mdf/pvc kenar bandı/boya)
// hedef renge göre takas edilir.
//
// NASIL EŞLEŞTİRME YAPILIR (anahtar):
//   - Her hammadde kartı opsiyonel olarak (renkKartelaKodu, malzemeKategorisi)
//     ile ETİKETLENİR (page_hammadde.js). Bu TEK gerçek kaynaktır — ayrı bir
//     eşleştirme matrisi TUTULMAZ, veri tekilleşir.
//   - Hedef renk için SADECE o renk kodunu + AYNI malzeme kategorisini taşıyan
//     hammadde arandığında bulunur. Birden fazla veya hiç bulunamazsa o kalem
//     DOKUNULMADAN bırakılır ve "eksikEslesmeler" raporunda işaretlenir —
//     ASLA tahmini bir hammaddeye bağlanmaz.
//
// KOD/AD ÜRETİMİ (klonlanan yarı mamül/alt montaj/paket/ürün kartları için):
//   - Kaynak kodun SON nokta-bölümü, Renk Eşleştirme Anahtarı'ndaki bilinen
//     bir kısaltmaya (ör. "DAF","ANT") eşitse o bölüm hedef kısaltmayla
//     DEĞİŞTİRİLİR ("...1.DAF" -> "...1.ANT"); eşit değilse (tanınmayan bir
//     kod yapısı) kod SONUNA "." + hedef kısaltma EKLENİR — asla üzerine
//     yazılmaz, veri kaybı olmaz.
//   - Ad içinde kaynak rengin adı (ör. "Dafne") TAM KELİME olarak geçiyorsa
//     hedef rengin adıyla değiştirilir; geçmiyorsa ad DOKUNULMADAN kalır
//     (uydurma yapılmaz).
//
// RECURSIVE KLONLAMA: kök karttan başlayarak reçetedeki HER yarı mamül/alt
// montaj/paket/ürün kalemi de kendi varyant kopyasını alır (aynı hedef renk
// için), böylece tüm alt ağaç tutarlı biçimde yeni renge taşınır. Aynı alt
// kart birden fazla yerde kullanılıyorsa SADECE BİR KEZ klonlanır (idMap),
// bu da olası bir döngüde sonsuz özyinelemeyi de engeller.
// ════════════════════════════════════════════════════════════════════════════
const RenkVaryantMotoru = (() => {

  // Bir renkKisaltmalari kaydının TÜM geçerli kısaltmalarını döner. Yeni
  // kayıtlar "kisaltmalar" dizisi tutar (AYNI renk, işleme göre BİRDEN FAZLA
  // kod son eki kullanabiliyor — ör. Dafne: melamin parçalarda ".DAF",
  // lake/boyalı kapak parçalarında ".LKDF", gerçek bir reçete dosyasıyla
  // doğrulandı). "kisaltma" (tekil) ESKİ alan adı — geriye dönük uyumluluk
  // için hâlâ okunur, üzerine YAZILMAZ.
  function kisaltmaListesi(r) {
    if (Array.isArray(r.kisaltmalar) && r.kisaltmalar.length) return r.kisaltmalar;
    return r.kisaltma ? [r.kisaltma] : [];
  }

  // Kaynak kodun son nokta-bölümü bilinen bir renk kısaltmasına eşitse o
  // renkKisaltmalari kaydını döner (kartın "şu an hangi renkte olduğu" bilgisi
  // SADECE bu şekilde, kod yapısından çıkarılır — ayrı bir alan TUTULMAZ).
  function kisaltmaIleRenkBul(kod, renkKisaltmalari) {
    const parcalar = String(kod || '').split('.');
    if (parcalar.length < 2) return null;
    const son = parcalar[parcalar.length - 1].toUpperCase();
    return (renkKisaltmalari || []).find(r => kisaltmaListesi(r).some(k => k.toUpperCase() === son)) || null;
  }

  // kisaltmaIleRenkBul'un TERSİ: kodun son eki bilinen bir kısaltmaya eşitse
  // o eki ATARAK "temel kod"u döner (ör. "YM.D20LD080KPKML.3.DAF" -> renk
  // eki ".DAF" ise "YM.D20LD080KPKML.3"). "Reçete Yapım Raporu"nun kardeş
  // (diğer renklerdeki) yarı mamülleri bulmak için kullandığı eşleştirme
  // anahtarı budur — eşleşme yoksa null (bu kart bir renk ailesine ait
  // DEĞİLDİR, tahmin edilmez).
  function temelKodCikar(kod, renkKisaltmalari) {
    const kayit = kisaltmaIleRenkBul(kod, renkKisaltmalari);
    if (!kayit) return null;
    const parcalar = String(kod).split('.');
    parcalar.pop();
    return parcalar.join('.');
  }

  function varyantKoduUret(kaynakKod, kaynakKisaltmaKaydi, hedefKisaltma) {
    const kod = String(kaynakKod || '');
    if (!hedefKisaltma) return kod;
    if (kaynakKisaltmaKaydi) {
      const parcalar = kod.split('.');
      parcalar[parcalar.length - 1] = hedefKisaltma;
      return parcalar.join('.');
    }
    return kod + '.' + hedefKisaltma;
  }

  function regexKac(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function varyantAdUret(kaynakAd, kaynakRenkAdi, hedefRenkAdi) {
    const ad = String(kaynakAd || '');
    if (!kaynakRenkAdi || !hedefRenkAdi) return ad;
    const re = new RegExp('\\b' + regexKac(kaynakRenkAdi) + '\\b', 'i');
    if (re.test(ad)) return ad.replace(re, hedefRenkAdi);
    return ad;
  }

  // Hedef renk + AYNI malzeme kategorisi (+ varsa AYNI ölçü etiketi — ör.
  // sunta/mdf'te kalınlık "18mm", PVC kenar bandında "0,40x22") ile etiketli
  // TEK bir kart arar. 0 veya >1 sonuç -> null (belirsiz/eksik — ASLA tahmin
  // edilmez). GENELdir: hem hammaddeler hem de (boya gibi doğrudan yarı
  // mamül olarak modellenen malzemeler için) yarımamuller listesiyle çalışır.
  function hammaddeEslesenBul(liste, hedefRenkKodu, malzemeKategorisi, renkOlcuEtiketi) {
    const adaylar = (liste || []).filter(h =>
      h.renkKartelaKodu === hedefRenkKodu && h.malzemeKategorisi === malzemeKategorisi &&
      (renkOlcuEtiketi ? h.renkOlcuEtiketi === renkOlcuEtiketi : !h.renkOlcuEtiketi));
    return adaylar.length === 1 ? adaylar[0] : null;
  }

  function kartListesi(tip, veri) {
    return tip === 'urun' ? veri.urunler : tip === 'yarimamul' ? veri.yarimamuller
      : tip === 'altmontaj' ? veri.altMontajlar : tip === 'paket' ? veri.paketler : null;
  }
  function idAlani(tip) {
    return tip === 'urun' ? 'urunId' : tip === 'yarimamul' ? 'yarimamulId'
      : tip === 'altmontaj' ? 'altMontajId' : 'paketId';
  }
  function kartPrefix(tip) {
    return tip === 'urun' ? 'URN' : tip === 'yarimamul' ? 'YM' : tip === 'altmontaj' ? 'AM' : 'PKT';
  }

  // Kök karttan başlayıp tüm alt ağacı hedef renge klonlayan asıl fonksiyon.
  // veri: {hammaddeler, yarimamuller, altMontajlar, paketler, urunler,
  //        receteler, renkKisaltmalari:[{renkKodu,renkAdi,kisaltma}]}
  // idUret(prefix) -> string : çağıran taraf App.uid enjekte eder (testte
  // deterministik bir sayaç verilir) — motor SAF kalır, DOM/Store'a dokunmaz.
  function varyantPlaniOlustur(kokId, kokTip, hedefRenkKodu, hedefRenkAdi, veri, idUret) {
    const idMap = new Map(); // "tip:eskiId" -> yeniId  (tekilleştirme + döngü koruması)
    const yeniKartlar = [];
    const yeniReceteler = [];
    const eksikEslesmeler = [];
    const hedefKisaltmaKaydi = (veri.renkKisaltmalari || []).find(r => r.renkKodu === hedefRenkKodu);
    // Bir renge birden fazla kısaltma tanımlıysa (ör. Dafne: DAF + LKDF) kod
    // ÜRETİMİNDE (klonlama) BİRİNCİSİ kullanılır — hangi kısaltmanın
    // kullanılacağını seçmek (kaynağın hangi "aile"den olduğuna göre) "Reçete
    // Yapım Raporu"nun etiket YAYMA akışında gerekmez, sadece burada (tekil
    // kart klonlama) basit bir varsayılana ihtiyaç var.
    const hedefKisaltma = hedefKisaltmaKaydi ? (kisaltmaListesi(hedefKisaltmaKaydi)[0] || hedefRenkKodu) : hedefRenkKodu;

    // Etiketli bir karta (hammadde VEYA yarı mamül — ör. "LK.50..." kodlu
    // boyalı yarı mamül kartları) karşılık gelen hedef renkteki eşleniğini
    // arar ve kalemi ona bağlar; bulunamazsa eski kart KORUNUR + raporlanır.
    function etiketliTakasEt(k, kaynakKart, liste, kaynakTipi) {
      if (kaynakKart.renkKartelaKodu === hedefRenkKodu) return { ...k }; // zaten hedef renkte
      const hedef = hammaddeEslesenBul(liste, hedefRenkKodu, kaynakKart.malzemeKategorisi, kaynakKart.renkOlcuEtiketi);
      if (!hedef) {
        eksikEslesmeler.push({
          hammaddeKod: kaynakKart.stokKodu || kaynakKart.kod || '', hammaddeAd: kaynakKart.ad || '',
          malzemeKategorisi: kaynakKart.malzemeKategorisi, renkOlcuEtiketi: kaynakKart.renkOlcuEtiketi || '',
          hedefRenkKodu, kaynakTipi
        });
        return { ...k }; // eşleşme yok — kaynak kart KORUNUR, uyarı raporlanır
      }
      return { ...k, refId: hedef.id };
    }

    function kalemKlonla(k) {
      if (k.tip === 'hammadde') {
        const kaynakHm = (veri.hammaddeler || []).find(h => h.id === k.refId);
        if (!kaynakHm || !kaynakHm.renkKartelaKodu || !kaynakHm.malzemeKategorisi) {
          return { ...k }; // renge bağımlı değil — dokunulmaz
        }
        return etiketliTakasEt(k, kaynakHm, veri.hammaddeler, 'hammadde');
      }
      if (k.tip === 'yarimamul') {
        // Bazı yarı mamüller (ör. boya işlemi görmüş, kendi başına katalog
        // kalemi olan "LK.50..." kodlu parçalar) de hammadde gibi RENK
        // ETİKETLİ olabilir — bu durumda recursive KLONLANMAZ, hedef renkteki
        // HAZIR karşılığıyla TAKAS EDİLİR. Etiketsiz yarı mamüller (gerçek
        // yapısal alt bileşenler) eskisi gibi alt ağacıyla birlikte klonlanır.
        const kaynakYm = (veri.yarimamuller || []).find(y => y.id === k.refId);
        if (kaynakYm && kaynakYm.renkKartelaKodu && kaynakYm.malzemeKategorisi) {
          return etiketliTakasEt(k, kaynakYm, veri.yarimamuller, 'yarimamul');
        }
      }
      const yeniAltId = kartKlonla(k.tip, k.refId);
      if (!yeniAltId) return { ...k }; // kaynak kart bulunamadı — savunma, dokunma
      return { ...k, refId: yeniAltId };
    }

    function kartKlonla(tip, eskiId) {
      const anahtar = tip + ':' + eskiId;
      if (idMap.has(anahtar)) return idMap.get(anahtar);
      const liste = kartListesi(tip, veri);
      const kaynak = liste && liste.find(x => x.id === eskiId);
      if (!kaynak) return null;

      const yeniId = idUret(kartPrefix(tip));
      idMap.set(anahtar, yeniId); // ÖNEMLİ: alt kırılıma inmeden ÖNCE kaydedilir (döngü koruması)

      const kaynakKisaltmaKaydi = kisaltmaIleRenkBul(kaynak.kod, veri.renkKisaltmalari);
      const yeniKart = JSON.parse(JSON.stringify(kaynak));
      yeniKart.id = yeniId;
      yeniKart.kod = varyantKoduUret(kaynak.kod, kaynakKisaltmaKaydi, hedefKisaltma);
      yeniKart.ad = varyantAdUret(kaynak.ad, kaynakKisaltmaKaydi ? kaynakKisaltmaKaydi.renkAdi : null, hedefRenkAdi);
      yeniKart.gorseller = []; // eski renk fotoğrafı yeni renk için YANLIŞ olur — kasıtlı boş
      yeniKartlar.push({ tip, kart: yeniKart });

      const kaynakRecete = (veri.receteler || []).find(r => r[idAlani(tip)] === eskiId);
      if (kaynakRecete && (kaynakRecete.kalemler || []).length) {
        const yeniKalemler = kaynakRecete.kalemler.map(kalemKlonla);
        yeniReceteler.push({
          id: idUret('RC'), [idAlani(tip)]: yeniId,
          ad: yeniKart.ad + ' Reçetesi', kalemler: yeniKalemler
        });
      }
      return yeniId;
    }

    const kokYeniId = kartKlonla(kokTip, kokId);
    return { kokYeniId, yeniKartlar, yeniReceteler, eksikEslesmeler };
  }

  return {
    kisaltmaIleRenkBul, temelKodCikar, varyantKoduUret, varyantAdUret, hammaddeEslesenBul,
    varyantPlaniOlustur
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RenkVaryantMotoru;
