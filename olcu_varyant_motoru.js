// ════════════════════════════════════════════════════════════════════════════
// ÖLÇÜ VARYANTI MOTORU — deterministik (AI/LLM DEĞİL) kural tabanlı klonlama.
// ────────────────────────────────────────────────────────────────────────────
// GERÇEK İHTİYAÇ: "reçeteleri yükledikçe büyük ölçülerin alt kırılımlı
// reçetelerini sistem otomatik arkada tamamlamaya devam etsin... reçete
// ebatlarına göre alt kırılım olmayan ürün/paket/alt montaj/yarımamül
// reçetelerini tamamlasın, kodlara göre otomatik hammadde atsın."
//
// GERÇEK VERİYLE DOĞRULANDI (kullanıcının yüklediği 6 gerçek LOGO dosyası):
//   AD0060.20.VV (60cm) <-> AD0080.20.NG (80cm): PAYLAŞILAN (ölçüden bağımsız)
//     parçalar AYNI kodu taşır (YM.AD0ORT10.01.VV / ...NG — sadece renk eki
//     değişir); ÖLÇÜYE BAĞIMLI parçalar kodun İÇİNDE ölçüyü taşır
//     (YM.AD006010.03.VV -> YM.AD008010.03.NG, "0060"->"0080" DOĞRUDAN kod
//     içinde, nokta-sınırlı bir SON EK değil — renk kısaltmasından FARKLI).
//   D20.LD065...ANT <-> D20.LD080...ANT: AYNI örüntü (YM.D20LD065KPKML.3.ANT
//     -> YM.D20LD080KPKML.3.ANT, "065"->"080"). Ayrıca bazı kalemler (ör.
//     paketleme kolisi "55.01.329.00"->"55.01.330.00") kod örüntüsünden HİÇ
//     türetilemez (LOGO'nun kendi numaralandırması) — bunlar BİLEREK
//     eşleştirilmeye ÇALIŞILMAZ, "eksikEslesmeler" raporunda işaretlenir.
//
// NEDEN RENK MOTORUNDAN (renk_varyant_motoru.js) AYRI BİR DOSYA: ölçü tokenı
// kodun NOKTA-SINIRLI SON EKİ değil, kodun HERHANGİ BİR YERİNDE geçen bir alt
// dizedir (substring) — bu yüzden eşleştirme/üretim mantığı temelden farklı
// (split/pop yerine doğrudan alt dize DEĞİŞTİRME). İki motor da AYNI üst
// algoritmayı (kök karttan başlayıp reçete ağacını gezen kartKlonla/
// kalemKlonla) kullanır ama bu BİLİNÇLİ bir kod tekrarıdır: renk motorunu
// "genel" hale getirmek, üretimde ZATEN ÇALIŞAN ve kapsamlı testlerle
// doğrulanmış bir motoru riske atardı.
//
// ÖLÇÜ EŞLEŞTİRME ANAHTARI: artık ELLE GİRİLMİYOR — "Ölçü Eşleştirme
// Anahtarı'na gerek yok, sen reçetelerden oluştur" isteğiyle, her tarama
// sistemde ZATEN KAYITLI kartların kod örüntüsünden taze bir anahtar üretir
// (bkz. olcuEslestirmeAnahtariniOtomatikCikar). Her kayıt bir "aile" + o
// ailedeki her ölçünün kod içinde nasıl yazıldığı {olcu:60,kodParcasi:'0060'}
// — biçim AYNI, sadece kaynağı artık Store değil, kartların kendisi. Kayıtlı
// olmayan (karşılaştıracak kardeşi sistemde bulunmayan) bir token ASLA
// tahmin EDİLMEZ — renk motorundaki "never guess" ilkesiyle BİREBİR aynı.
//
// KASITLI OLARAK BU SÜRÜMDE YAPILMAYAN (dürüst sınır, kademeli genişletme
// planlanıyor):
//   - Hammadde kalemlerinin kendi refId'si ölçüye göre DEĞİŞTİRİLMEZ (gerçek
//     veride plaka/levha hammaddeleri genelde ÖLÇÜDEN BAĞIMSIZDIR — kesim
//     boyutu hammadde kartında değil, kalemin KENDİ `olcu` alanında tutulur).
//     Bunun yerine, AYNI açıklamaya sahip ama FARKLI en/boy'lu hammadde
//     kartları `alternatifRefIdler` olarak EKLENİR (refId BİRİNCİL kalır,
//     TÜM mevcut maliyet/MRP kodları DOKUNULMADAN çalışmaya devam eder).
//   - Kalemin KENDİ kesim ölçüsü (`olcu.kabaEn/kabaBoy/netEn/netBoy`) hedef
//     ürün ölçüsüne göre YENİDEN HESAPLANMAZ — bunun için geometrik bir
//     formül (gerçek üretim verisi) gerekir, şimdilik KAYNAKTAN AYNEN
//     kopyalanır; kullanıcı gerekirse elle düzeltir.
//   - Kod örüntüsünden türetilemeyen kalemler (ör. paketleme kolisi) ASLA
//     tahmin edilmez, "eksikEslesmeler" raporunda işaretlenir.
// ════════════════════════════════════════════════════════════════════════════
const OlcuVaryantMotoru = (() => {

  function olculer(aile) { return Array.isArray(aile && aile.olculer) ? aile.olculer : []; }

  // Bir kodun İÇİNDE (herhangi bir konumda) geçen, Ölçü Eşleştirme
  // Anahtarı'nda KAYITLI bir kodParcasi'nı bulur. Birden fazla aile/token
  // eşleşirse EN UZUN token tercih edilir (ör. "0060" hem kendi başına hem
  // başka bir ailenin "60" tokenı içinde geçebilir — en spesifik/uzun eşleşme
  // yanlış pozitifi azaltır). Aynı uzunlukta FARKLI iki token eşleşirse
  // BELİRSİZ kabul edilip null döner (asla tahmin edilmez).
  function kodParcasiIleOlcuBul(kod, olcuAnahtari) {
    const k = String(kod || '');
    let enIyi = null;
    for (const aile of (olcuAnahtari || [])) {
      for (const o of olculer(aile)) {
        const parca = String(o.kodParcasi || '');
        if (!parca || k.indexOf(parca) === -1) continue;
        if (!enIyi || parca.length > enIyi.kodParcasi.length) {
          enIyi = { aile, olcu: o.olcu, kodParcasi: parca, cakisma: false };
        } else if (parca.length === enIyi.kodParcasi.length && parca !== enIyi.kodParcasi) {
          enIyi.cakisma = true;
        }
      }
    }
    if (!enIyi || enIyi.cakisma) return null;
    return enIyi;
  }

  // Bir ailede belirli bir hedef ölçünün kodParcasi'nı döner (tanımlı
  // değilse null — bu ölçü için henüz anahtar girilmemiş demektir).
  function hedefKodParcasiBul(aile, hedefOlcu) {
    const bulunan = olculer(aile).find(o => String(o.olcu) === String(hedefOlcu));
    return bulunan ? String(bulunan.kodParcasi) : null;
  }

  // Kaynak koddaki kaynakKodParcasi'nın TÜM geçtiği yerleri hedefKodParcasi
  // ile değiştirir (nokta-sınırlı son ek DEĞİL, düz alt dize değişimi).
  function olcuVaryantKoduUret(kaynakKod, kaynakKodParcasi, hedefKodParcasi) {
    const kod = String(kaynakKod || '');
    if (!kaynakKodParcasi || !hedefKodParcasi) return kod;
    return kod.split(kaynakKodParcasi).join(hedefKodParcasi);
  }

  function normalizeAciklama(s) {
    return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  }

  // AYNI açıklamaya (ad) sahip ama FARKLI en/boy'lu (yani fiziksel ölçüsü
  // farklı) hammadde kartlarını bulur — "stokta olan hammaddeye göre sarf"
  // isteğinin veri modeli temeli: refId BİRİNCİL kalır, bunlar ALTERNATIF
  // olarak eklenir (hiçbir mevcut maliyet/MRP kodu kırılmaz).
  function alternatifHammaddeleriBul(hammadde, tumHammaddeler) {
    if (!hammadde) return [];
    const ad = normalizeAciklama(hammadde.ad);
    if (!ad) return [];
    return (tumHammaddeler || []).filter(h =>
      h.id !== hammadde.id && normalizeAciklama(h.ad) === ad &&
      (h.en !== hammadde.en || h.boy !== hammadde.boy));
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

  // Kök karttan başlayıp tüm alt ağacı hedef ölçüye klonlayan/tamamlayan
  // asıl fonksiyon — renk_varyant_motoru.js'teki varyantPlaniOlustur ile AYNI
  // üst iskelet (mevcutKartiKullan / kokHedefId semantiği BİREBİR aynı,
  // bkz. o dosyadaki ayrıntılı yorum), yalnızca eşleştirme birimi ölçü.
  // veri: {hammaddeler, yarimamuller, altMontajlar, paketler, urunler,
  //        receteler, olcuEslestirmeAnahtari}
  function olcuVaryantPlaniOlustur(kokId, kokTip, hedefOlcu, veri, idUret, secenekler) {
    const mevcutKartiKullan = !!(secenekler && secenekler.mevcutKartiKullan);
    const kokHedefId = secenekler && secenekler.kokHedefId;
    const idMap = new Map();
    const yeniKartlar = [];
    const yeniReceteler = [];
    const eksikEslesmeler = [];

    // GERÇEK VERİYLE YAKALANDI: bazı hammaddeler (ör. "MK-304.00 ALİNDA 60 ALT
    // KOLİ" -> 80cm için "MK-305.00 ALİNDA 80 ALT KOLİ") ÖLÇÜYE ÖZELDİR ama bu
    // bir kod-örüntüsü (substring) DEĞİL, LOGO'nun kendi SIRALI numaralandırması
    // (304->305) — anahtardan asla türetilemez. Otomatik DÜZELTME yapılmaz
    // (yanlış tahmin riski), ama kaynak hammaddenin ADINDA kaynak ölçünün
        // kendisi (tam sayı sınırında, ör. "60") geçiyorsa KULLANICIYA UYARI
    // olarak raporlanır — en azından elle kontrol etmesi gerektiği bilinir.
    function kaynakOlcuAdındaGeçiyorMu(ad, kaynakOlcu) {
      if (kaynakOlcu === null || kaynakOlcu === undefined) return false;
      const re = new RegExp('(^|[^0-9])' + String(kaynakOlcu) + '([^0-9]|$)');
      return re.test(String(ad || ''));
    }

    function kalemKlonla(k, ustKaynakOlcu) {
      if (k.tip === 'hammadde') {
        // Hammadde refId'si ölçüye göre DEĞİŞTİRİLMEZ (bkz. dosya başı
        // yorumu) — yalnızca AYNI açıklamalı farklı ölçülü kartlar varsa
        // alternatif olarak eklenir, kalem aksi halde AYNEN kopyalanır.
        const kaynakHm = (veri.hammaddeler || []).find(h => h.id === k.refId);
        const alternatifler = alternatifHammaddeleriBul(kaynakHm, veri.hammaddeler);
        const yeniKalem = { ...k };
        if (alternatifler.length) yeniKalem.alternatifRefIdler = alternatifler.map(a => a.id);
        if (kaynakHm && kaynakOlcuAdındaGeçiyorMu(kaynakHm.ad, ustKaynakOlcu)) {
          eksikEslesmeler.push({
            kod: kaynakHm.stokKodu || kaynakHm.kod || '', ad: kaynakHm.ad, tip: 'hammadde',
            hedefOlcu, neden: 'olcuyeOzelOlabilirElleKontrolEdin'
          });
        }
        return yeniKalem;
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

      const kaynakEslesme = kodParcasiIleOlcuBul(kaynak.kod, veri.olcuEslestirmeAnahtari);
      // Bu kart kod yapısı olarak bir ölçü ailesine ait DEĞİLSE (ör. kalem
      // bir alt montaj/paket ama ölçüden bağımsız ortak bir parça — ya da
      // tamamen tanınmayan bir kod), AYNEN (klonlanmadan) kullanılır —
      // tahmin edilmez; çağıran (recete_yapim_raporu_motoru benzeri bir
      // orkestratör) bu durumu eksikEslesmeler ile değil, basitçe "bu kart
      // ölçü ailesine ait değil, dokunulmadı" olarak değerlendirir.
      if (!kaynakEslesme && !(tip === kokTip && eskiId === kokId && kokHedefId)) {
        idMap.set(anahtar, eskiId);
        return eskiId;
      }

      let yeniId, yeniAd, mevcutKart = null;
      let hedefKodParcasi = null;
      if (tip === kokTip && eskiId === kokId && kokHedefId) {
        mevcutKart = liste.find(x => x.id === kokHedefId) || null;
      } else if (kaynakEslesme) {
        hedefKodParcasi = hedefKodParcasiBul(kaynakEslesme.aile, hedefOlcu);
        if (!hedefKodParcasi) {
          // Bu ailede HEDEF ölçü için anahtar henüz TANIMLANMAMIŞ — tahmin
          // edilmez, kaynak kart AYNEN bırakılır ve raporlanır.
          eksikEslesmeler.push({
            kod: kaynak.kod, ad: kaynak.ad, tip,
            aileAdi: kaynakEslesme.aile.aileAdi || '', hedefOlcu, neden: 'hedefOlcuTanimsiz'
          });
          idMap.set(anahtar, eskiId);
          return eskiId;
        }
        if (mevcutKartiKullan) {
          const hedefKod = olcuVaryantKoduUret(kaynak.kod, kaynakEslesme.kodParcasi, hedefKodParcasi);
          mevcutKart = liste.find(x => x.id !== kaynak.id && x.kod === hedefKod) || null;
        }
      }

      if (mevcutKart) {
        yeniId = mevcutKart.id;
        yeniAd = mevcutKart.ad;
        idMap.set(anahtar, yeniId);
      } else {
        yeniId = idUret(kartPrefix(tip));
        idMap.set(anahtar, yeniId); // döngü koruması — alt kırılıma inmeden ÖNCE

        const yeniKart = JSON.parse(JSON.stringify(kaynak));
        yeniKart.id = yeniId;
        if (kaynakEslesme && hedefKodParcasi) {
          yeniKart.kod = olcuVaryantKoduUret(kaynak.kod, kaynakEslesme.kodParcasi, hedefKodParcasi);
        }
        // NOT: ad'daki ölçü ibaresi (ör. "60cm"/"80cm") KASITLI
        // değiştirilmez — serbest metinde ölçü ifadesi çok çeşitli yazılır
        // (60cm/60 CM/60cm.) ve yanlış bir değişiklik güven kaybettirir;
        // kullanıcı gerekirse adı elle düzeltir.
        yeniKart.gorseller = [];
        yeniKartlar.push({ tip, kart: yeniKart });
        yeniAd = yeniKart.ad;
      }

      const kaynakRecete = (veri.receteler || []).find(r => r[idAlani(tip)] === eskiId);
      if (kaynakRecete && (kaynakRecete.kalemler || []).length) {
        const mevcutAltRecete = mevcutKart ? (veri.receteler || []).find(r => r[idAlani(tip)] === yeniId) : null;
        if (!mevcutAltRecete || !(mevcutAltRecete.kalemler || []).length) {
          const buKartinKaynakOlcusu = kaynakEslesme ? kaynakEslesme.olcu : null;
          const yeniKalemler = kaynakRecete.kalemler.map(k => kalemKlonla(k, buKartinKaynakOlcusu));
          yeniReceteler.push({
            id: mevcutAltRecete ? mevcutAltRecete.id : idUret('RC'),
            [idAlani(tip)]: yeniId,
            ad: yeniAd + ' Reçetesi', kalemler: yeniKalemler
          });
        }
      }
      return yeniId;
    }

    const kokYeniId = kartKlonla(kokTip, kokId);
    return { kokYeniId, yeniKartlar, yeniReceteler, eksikEslesmeler };
  }

  // SİSTEM GENELİNDE ÖLÇÜ TAMAMLAMA — reçetesi TAM olan bir "master" karttan
  // başlayarak, AYNI ailenin reçetesi EKSİK/YOK olan kardeş ölçülerini bulur
  // ve tamamlar. recete_yapim_raporu_motoru.js'in sistemGenelindeReceteRaporu
  // ile AYNI çalışma-kopyası deseni (paylaşılan alt bileşenler mükerrer
  // yaratılmasın diye bir sonraki adayda GÖRÜNÜR olur).
  function sistemGenelindeOlcuTamamlama(masterKartKodu, masterTip, veri, idUret) {
    const liste = kartListesi(masterTip, veri);
    const masterKart = (liste || []).find(k => k.kod === masterKartKodu);
    if (!masterKart) return { masterBulunamadi: true, sonuclar: [], eksikEslesmeler: [] };

    const masterEslesme = kodParcasiIleOlcuBul(masterKart.kod, veri.olcuEslestirmeAnahtari);
    if (!masterEslesme) return { masterOlcuAilesineAitDegil: true, sonuclar: [], eksikEslesmeler: [] };

    // Aynı ailenin BİLİNEN tüm diğer ölçüleri — master'ın KENDİ ölçüsü hariç.
    const digerOlculer = olculer(masterEslesme.aile).filter(o => String(o.olcu) !== String(masterEslesme.olcu));

    const calismaVerisi = {
      hammaddeler: veri.hammaddeler || [],
      yarimamuller: [...(veri.yarimamuller || [])],
      altMontajlar: [...(veri.altMontajlar || [])],
      paketler: [...(veri.paketler || [])],
      urunler: [...(veri.urunler || [])],
      receteler: [...(veri.receteler || [])],
      olcuEslestirmeAnahtari: veri.olcuEslestirmeAnahtari || []
    };
    const kartListesiAl = (tip) => tip === 'urun' ? calismaVerisi.urunler : tip === 'yarimamul' ? calismaVerisi.yarimamuller
      : tip === 'altmontaj' ? calismaVerisi.altMontajlar : calismaVerisi.paketler;

    const sonuclar = [];
    const eksikEslesmeler = [];
    digerOlculer.forEach(({ olcu: hedefOlcu, kodParcasi: hedefKodParcasi }) => {
      const hedefKod = olcuVaryantKoduUret(masterKart.kod, masterEslesme.kodParcasi, hedefKodParcasi);
      const hedefListe = kartListesiAl(masterTip);
      const hedefKart = hedefListe.find(k => k.kod === hedefKod);
      if (!hedefKart) return; // bu ölçüde sistemde ürün/kart yok — tamamlanacak bir şey yok

      const hedefReceteVar = calismaVerisi.receteler.some(r => r[idAlani(masterTip)] === hedefKart.id && (r.kalemler || []).length);
      if (hedefReceteVar) return; // zaten tam bir reçetesi var — dokunulmaz

      const plan = olcuVaryantPlaniOlustur(masterKart.id, masterTip, hedefOlcu, calismaVerisi, idUret, { mevcutKartiKullan: true, kokHedefId: hedefKart.id });
      plan.yeniKartlar.forEach(({ tip, kart }) => kartListesiAl(tip).push(kart));
      plan.yeniReceteler.forEach(yeniRecete => {
        const idx = calismaVerisi.receteler.findIndex(r => r.id === yeniRecete.id);
        if (idx >= 0) calismaVerisi.receteler[idx] = yeniRecete; else calismaVerisi.receteler.push(yeniRecete);
      });
      eksikEslesmeler.push(...plan.eksikEslesmeler);

      sonuclar.push({
        hedefKartId: plan.kokYeniId, hedefOlcu, hedefKod: hedefKart.kod, hedefAd: hedefKart.ad,
        yeniKartlar: plan.yeniKartlar, yeniReceteler: plan.yeniReceteler
      });
    });

    return { masterKart, aileAdi: masterEslesme.aile.aileAdi || '', sonuclar, eksikEslesmeler };
  }

  // ══════════════════════════════════════════════════════════════════════
  // ÖLÇÜ EŞLEŞTİRME ANAHTARINI OTOMATİK ÇIKARMA — "Ölçü Eşleştirme Anahtarı'na
  // gerek yok, sen reçetelerden oluştur" isteği. Elle girilen bir anahtar
  // ARTIK GEREKMİYOR: sistemde ZATEN KAYITLI kartların (ürün/yarımamül/alt
  // montaj/paket) kod örüntüsünden, HER TARAMADA taze olarak türetilir —
  // hiçbir yerde saklanmaz, Store'da böyle bir koleksiyon YOKTUR.
  //
  // YÖNTEM (muhafazakâr — "never guess" ilkesiyle birebir aynı): aynı kart
  // tipinde, kodun SAYI OLMAYAN kısımları HARFİYEN AYNI olan ve TEK BİR rakam
  // bloğu (2+ hane) DIŞINDA her şeyi paylaşan en az 2 kart bulunursa, o TEK
  // farklı rakam bloğu "ölçü" tokenı sayılır. Birden fazla konum farklıysa
  // (iki ayrı değişken olabilir — riskli) grup ATLANIR, tahmin YAPILMAZ. Tek
  // bir örnekten (karşılaştıracak kardeş olmadan) HİÇBİR aile türetilmez.
  //
  // BİLİNEN SINIR: gerçek verideki bazı aileler (ör. AD0060.20.VV/AD0080.20.NG)
  // ölçü DIŞINDA da (renk/model eki) farklılaşır — bu durumda kod iskeleti
  // birebir örtüşmez ve bu fonksiyon o aileyi OTOMATİK YAKALAYAMAZ (manuel
  // anahtarın eskiden kapattığı bu boşluk artık KASITLI OLARAK açık
  // bırakılıyor — yanlış eşleştirme riskinden daha güvenli). Kod iskeleti
  // SADECE ölçü bakımından farklılaşan aileler (ör. D20.LD065/080/100)
  // sorunsuz yakalanır; sistemde o ailenin en az 2 ölçüsü kayıtlı olduğu an
  // bot bunu kendiliğinden fark eder.
  // ══════════════════════════════════════════════════════════════════════
  function kodSablonVeRakamlariCikar(kod) {
    const parcalar = String(kod || '').split(/(\d{2,})/);
    const rakamlar = [];
    let sablon = '';
    parcalar.forEach((p, i) => { if (i % 2 === 1) { rakamlar.push(p); sablon += '\u0000'; } else sablon += p; });
    return { sablon, rakamlar };
  }

  function tipEtiketOto(tip) {
    return tip === 'urun' ? 'Ürün' : tip === 'yarimamul' ? 'Yarı Mamül' : tip === 'altmontaj' ? 'Alt Montaj' : 'Paket';
  }

  // Bir kart tipi içindeki kartları kod iskeletine göre gruplar, her grupta
  // TEK bir rakam konumu farklıysa o grubu bir "aile" olarak döner.
  function tipIcinOtomatikAileler(tip, kartlar) {
    const gruplar = new Map(); // sablon -> [rakamlar]
    (kartlar || []).forEach(kart => {
      if (!kart || !kart.kod) return;
      const { sablon, rakamlar } = kodSablonVeRakamlariCikar(kart.kod);
      if (!rakamlar.length) return; // hiç rakam bloğu yok -> ölçü ailesi olamaz
      if (!gruplar.has(sablon)) gruplar.set(sablon, []);
      gruplar.get(sablon).push(rakamlar);
    });

    const aileler = [];
    gruplar.forEach((uyeler, sablon) => {
      if (uyeler.length < 2) return; // karşılaştıracak kardeş yok -> tahmin edilmez
      const konumSayisi = uyeler[0].length;
      let farkliKonum = -1, cokFarkliKonum = false;
      for (let pos = 0; pos < konumSayisi; pos++) {
        const degerler = new Set(uyeler.map(r => r[pos]));
        if (degerler.size > 1) {
          if (farkliKonum === -1) farkliKonum = pos; else cokFarkliKonum = true;
        }
      }
      if (farkliKonum === -1 || cokFarkliKonum) return; // 0 ya da 2+ değişken konum -> belirsiz, atla

      const gorulenler = new Set();
      const olculer = [];
      uyeler.forEach(r => {
        const token = r[farkliKonum];
        if (gorulenler.has(token)) return;
        gorulenler.add(token);
        const sayisal = parseInt(token, 10);
        olculer.push({ olcu: isNaN(sayisal) ? token : String(sayisal), kodParcasi: token });
      });
      if (olculer.length < 2) return;

      aileler.push({
        id: 'OTO-' + tip + '-' + sablon.length + '-' + farkliKonum + '-' + olculer.map(o => o.kodParcasi).sort().join('_'),
        aileAdi: '(Otomatik) ' + tipEtiketOto(tip) + ': ' + sablon.replace(/\u0000/g, '#'),
        olculer
      });
    });
    return aileler;
  }

  // DIŞA AÇIK: tamSistemTaramasi tarafından her çalışmada çağrılır. veri:
  // {urunler, yarimamuller, altMontajlar, paketler, ...} — Store.olcuEslestirmeAnahtari
  // KULLANILMAZ, böyle bir koleksiyon/sayfa artık YOKTUR.
  function olcuEslestirmeAnahtariniOtomatikCikar(veri) {
    return [].concat(
      tipIcinOtomatikAileler('urun', veri.urunler),
      tipIcinOtomatikAileler('yarimamul', veri.yarimamuller),
      tipIcinOtomatikAileler('altmontaj', veri.altMontajlar),
      tipIcinOtomatikAileler('paket', veri.paketler)
    );
  }

  // TÜM SİSTEMİ TARAR — dört kart tipinin (ürün/yarımamül/altmontaj/paket)
  // TAMAMINI dolaşır, reçetesi TAM olan ve kodu TANIMLI bir ölçü ailesine ait
  // her kartı "master" adayı sayıp sistemGenelindeOlcuTamamlama çalıştırır.
  // page_recete_tamamlama_botu.js (manuel "Tara" düğmesi) VE otomatik
  // tetikleyiciler (içe aktarma sonrası / oturum başlangıcı, bkz. app.js)
  // AYNI bu fonksiyonu çağırır — tarama mantığı TEK YERDE yaşar.
  // Dönüş: { sonuclar:[{masterTip,masterKod,masterAd,aileAdi,hedefOlcu,
  //          hedefKod,hedefAd,yeniKartlar,yeniReceteler}], eksikEslesmeler }
  function tamSistemTaramasi(veri, idUret) {
    // Artık elle girilen bir anahtara GEREK YOK — her tarama, o anda sistemde
    // kayıtlı kartların kod örüntüsünden taze bir anahtar çıkarır (bkz.
    // olcuEslestirmeAnahtariniOtomatikCikar yorum bloğu). Hiçbir yerde
    // saklanmaz, her çalışmada yeniden hesaplanır.
    const olcuEslestirmeAnahtari = olcuEslestirmeAnahtariniOtomatikCikar(veri);
    if (!olcuEslestirmeAnahtari.length) return { sonuclar: [], eksikEslesmeler: [] };

    const calismaVerisi = {
      hammaddeler: veri.hammaddeler || [],
      yarimamuller: [...(veri.yarimamuller || [])],
      altMontajlar: [...(veri.altMontajlar || [])],
      paketler: [...(veri.paketler || [])],
      urunler: [...(veri.urunler || [])],
      receteler: [...(veri.receteler || [])],
      olcuEslestirmeAnahtari
    };
    const kartListesiAl = (tip) => tip === 'urun' ? calismaVerisi.urunler : tip === 'yarimamul' ? calismaVerisi.yarimamuller
      : tip === 'altmontaj' ? calismaVerisi.altMontajlar : calismaVerisi.paketler;

    const tumSonuclar = [];
    const tumEksikEslesmeler = [];
    const islenenAileOlcu = new Set(); // "tip:aileAdi:olcu" -> tekrar işlenmesin

    ['urun', 'yarimamul', 'altmontaj', 'paket'].forEach(tip => {
      kartListesiAl(tip).forEach(kart => {
        const eslesme = kodParcasiIleOlcuBul(kart.kod, calismaVerisi.olcuEslestirmeAnahtari);
        if (!eslesme) return;
        const anahtarIslem = tip + ':' + (eslesme.aile.aileAdi || eslesme.aile.id) + ':' + eslesme.olcu;
        if (islenenAileOlcu.has(anahtarIslem)) return;
        const kendiRecetesi = calismaVerisi.receteler.find(r => r[idAlani(tip)] === kart.id);
        if (!kendiRecetesi || !(kendiRecetesi.kalemler || []).length) return; // reçetesi eksik -> master OLAMAZ

        const rapor = sistemGenelindeOlcuTamamlama(kart.kod, tip, calismaVerisi, idUret);
        if (rapor.masterBulunamadi || rapor.masterOlcuAilesineAitDegil) return;
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
      });
    });

    return { sonuclar: tumSonuclar, eksikEslesmeler: tumEksikEslesmeler };
  }

  return {
    kodParcasiIleOlcuBul, hedefKodParcasiBul, olcuVaryantKoduUret,
    alternatifHammaddeleriBul, olcuVaryantPlaniOlustur, sistemGenelindeOlcuTamamlama,
    olcuEslestirmeAnahtariniOtomatikCikar, tamSistemTaramasi
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OlcuVaryantMotoru;
