// ════════════════════════════════════════════════════════════════════════════
// REÇETE YAPIM RAPORU MOTORU — bir "master" (tam tanımlı, tek renkli) reçeteyi
// kullanarak, AYNI parça ailesindeki (kod son eki hariç AYNI) kardeş
// (başka renklerdeki) yarı mamül kartlarını OTOMATİK etiketler.
// ────────────────────────────────────────────────────────────────────────────
// GERÇEK İHTİYAÇ: "dafne ile ilgili tanımlamaları yaptım... bu reçete ve
// benzer kodlu tüm reçetelerin yarımamül ve paket kodlarını uretimosa
// aktardım... şimdi bu reçeteyi yüklediğimde diğer tüm benzer renkli
// reçeteler bu reçeteye göre düzenlensin." Kullanıcı TEK bir rengi (Dafne)
// elle etiketledi; bu motor o emeği TÜM kardeş renklere YAYAR.
//
// NEDEN SADECE YARI MAMÜL (hammadde DEĞİL): gerçek bir reçete dosyasıyla
// doğrulandı — yarı mamül parça kodları kendi İÇİNDE renk son eki taşır
// (ör. "YM.D20LD080KPKML.3.DAF" / aynı parçanın Antrasit'i ise
// "...3.ANT"), bu yüzden kod deseniyle GÜVENLE eşleştirilebilir. Hammaddeler
// (sunta/mdf/boya) BÖYLE DEĞİLDİR: ör. "MDFLAM TY 18MM BEYAZ H.GLOSS" adlı
// board, Dafne VE Antrasit lake kapaklarının İKİSİNDE DE aynen kullanılır
// (asıl rengi SONRADAN sürülen boya verir) — hammaddeyi salt "master
// reçetede geçiyor" diye otomatik Dafne'ye etiketlemek YANLIŞ olurdu. Bu
// yüzden hammadde etiketleme KASITLI olarak burada YOKTUR; Renk Eşleştirme
// Anahtarı'nda elle, kullanıcının gerçek malzeme bilgisiyle yapılır.
//
// Üç sonuç kovası:
//   1) duzenlenen      — kardeş yarı mamül bulundu, rengi (kod ekinden) VE
//                         kategorisi/ölçüsü (master karttan) biliniyor ->
//                         OTOMATİK etiketlendi.
//   2) eksikRenkTanimi — kardeş bulundu ama onun kod eki HİÇBİR renge
//                         kayıtlı değil -> hangi renk olduğu bilinmiyor,
//                         önce Renk Eşleştirme Anahtarı'nda o kısaltma
//                         tanımlanmalı.
//   3) eksikKategoriTanimi — kardeş ailesi bulundu ama MASTER'ın kendi kartı
//                         henüz (malzeme) kategorisiyle etiketlenmemiş ->
//                         hangi kategoriye yayılacağı bilinmiyor, önce
//                         master kartın KENDİSİ etiketlenmeli.
// ════════════════════════════════════════════════════════════════════════════
const ReceteYapimRaporuMotoru = (() => {

  // masterStokKodlari: hiyerarşik parser'ın (bkz. hiyerarsik_recete_parser.js)
  // ürettiği TÜM seviyelerdeki stok kodları (parsed.items.map(i=>i.stokKod),
  // tekrarsız) — master reçetenin alt ağacında GEÇEN her kod.
  // veri: {yarimamuller, renkKisaltmalari}
  function raporOlustur(masterStokKodlari, veri) {
    const RVM = RenkVaryantMotoru;
    const duzenlenen = [];
    const eksikRenkTanimiMap = new Map(); // sonEk -> [{kod,ad}]
    const eksikKategoriTanimi = [];
    const eksikKategoriGorulen = new Set(); // aynı master kart birden çok yerde geçerse tekrar raporlanmasın

    const benzersizKodlar = [...new Set(masterStokKodlari || [])];

    benzersizKodlar.forEach(masterStokKod => {
      const masterKart = (veri.yarimamuller || []).find(y => y.kod === masterStokKod);
      if (!masterKart) return; // master kart ÜretimOS'ta bir YARI MAMÜL olarak yok (hammadde/paket olabilir) — atla

      const temelKod = RVM.temelKodCikar(masterKart.kod, veri.renkKisaltmalari);
      if (!temelKod) return; // bu kodun kendisi bir renk ailesine ait değil (son eki tanınmıyor)

      const kardesler = (veri.yarimamuller || []).filter(y =>
        y.id !== masterKart.id && y.kod.startsWith(temelKod + '.'));
      if (!kardesler.length) return; // kardeş yok, yayılacak bir şey yok

      if (!masterKart.malzemeKategorisi) {
        if (!eksikKategoriGorulen.has(masterKart.id)) {
          eksikKategoriGorulen.add(masterKart.id);
          eksikKategoriTanimi.push({ masterId: masterKart.id, masterKod: masterKart.kod, masterAd: masterKart.ad, kardesSayisi: kardesler.length });
        }
        return;
      }

      kardesler.forEach(kardes => {
        const sonEk = kardes.kod.slice(temelKod.length + 1);
        const renkKaydi = RVM.kisaltmaIleRenkBul(kardes.kod, veri.renkKisaltmalari);
        if (!renkKaydi) {
          if (!eksikRenkTanimiMap.has(sonEk)) eksikRenkTanimiMap.set(sonEk, []);
          const liste = eksikRenkTanimiMap.get(sonEk);
          if (!liste.some(x => x.kod === kardes.kod)) liste.push({ id: kardes.id, kod: kardes.kod, ad: kardes.ad });
          return;
        }
        const zatenDogru = kardes.renkKartelaKodu === renkKaydi.renkKodu &&
          kardes.malzemeKategorisi === masterKart.malzemeKategorisi &&
          (kardes.renkOlcuEtiketi || null) === (masterKart.renkOlcuEtiketi || null);
        if (zatenDogru) return; // zaten doğru etiketli — tekrar raporlanmaz/dokunulmaz

        duzenlenen.push({
          id: kardes.id, kod: kardes.kod, ad: kardes.ad,
          masterKod: masterKart.kod, masterAd: masterKart.ad,
          renkKartelaKodu: renkKaydi.renkKodu, renkAdi: renkKaydi.renkAdi,
          malzemeKategorisi: masterKart.malzemeKategorisi,
          renkOlcuEtiketi: masterKart.renkOlcuEtiketi || null
        });
      });
    });

    return {
      duzenlenen,
      eksikRenkTanimi: [...eksikRenkTanimiMap.entries()].map(([sonEk, kayitlar]) => ({ sonEk, kayitlar })),
      eksikKategoriTanimi
    };
  }

  function regexKacIc(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Bir addaki (varsa) BİLİNEN bir renk adını (renkKisaltmalari'nda kayıtlı
  // renkAdi'lerden biri, tam kelime, büyük/küçük harf duyarsız) çıkarıp
  // "temel ad"ı döner — ör. "D20 80cm.KPK.Lav.Dolabı.Pkt.1.Dafne" ->
  // {temelAd:"D20 80CM.KPK.LAV.DOLABI.PKT.1.", renkKodu:'01', renkAdi:'Dafne'}.
  // Birden fazla renk adı geçiyorsa İLK eşleşen kullanılır. Eşleşme yoksa
  // null (bu ad renk bilgisiyle AYRIŞTIRILAMAZ, tahmin edilmez).
  function temelAdCikar(ad, renkKisaltmalari) {
    const metin = String(ad || '');
    for (const r of (renkKisaltmalari || [])) {
      if (!r.renkAdi) continue;
      const re = new RegExp('\\b' + regexKacIc(r.renkAdi) + '\\b', 'i');
      if (re.test(metin)) {
        return { temelAd: metin.replace(re, '').replace(/\s+/g, ' ').trim().toUpperCase(), renkKodu: r.renkKodu, renkAdi: r.renkAdi };
      }
    }
    return null;
  }

  // Bir master ÜRÜN kartına "isim ve renk benzerliği" olan kardeş ürünleri
  // bulur. İKİ bağımsız sinyal kullanılır (biri yakalayamazsa diğeri yakalar):
  //   1) KOD YAPISAL eşleşme (birincil, güvenilir) — master'ın temel kodu +
  //      BİLİNEN bir renk kısaltması ile biten ürünler (yarı mamül
  //      eşleştirmesiyle AYNI mantık, bkz. renk_varyant_motoru.js).
  //   2) AD BENZERLİĞİ (ikincil, yedek) — kod yapısı tanınmıyorsa, addaki
  //      BİLİNEN bir renk adı çıkarıldıktan sonra KALAN metin (boyut, model
  //      vb. HEPSİ dahil) birebir aynıysa kardeş sayılır.
  // Her iki yöntem de SADECE renkKisaltmalari'nda KAYITLI renkleri tanır —
  // tanınmayan bir son ek/ad ASLA tahmin edilip eşleştirilmez.
  function benzerUrunleriBul(masterKart, tumUrunler, renkKisaltmalari) {
    const RVM = RenkVaryantMotoru;
    const sonuc = [];
    const gorulenIdler = new Set([masterKart.id]);
    const eksikRenkTanimiMap = new Map(); // sonEk -> [{id,kod,ad}] — kod yapısı AYNI AİLEDEN ama son ek tanınmıyor

    const temelKod = RVM.temelKodCikar(masterKart.kod, renkKisaltmalari);
    if (temelKod) {
      (tumUrunler || []).forEach(u => {
        if (gorulenIdler.has(u.id) || !u.kod.startsWith(temelKod + '.')) return;
        const renkKaydi = RVM.kisaltmaIleRenkBul(u.kod, renkKisaltmalari);
        if (!renkKaydi) {
          const sonEk = u.kod.slice(temelKod.length + 1);
          if (!eksikRenkTanimiMap.has(sonEk)) eksikRenkTanimiMap.set(sonEk, []);
          const liste = eksikRenkTanimiMap.get(sonEk);
          if (!liste.some(x => x.id === u.id)) liste.push({ id: u.id, kod: u.kod, ad: u.ad });
          return;
        }
        gorulenIdler.add(u.id);
        sonuc.push({ urun: u, hedefRenkKodu: renkKaydi.renkKodu, hedefRenkAdi: renkKaydi.renkAdi, eslesmeTuru: 'kod' });
      });
    }

    const masterTemelAd = temelAdCikar(masterKart.ad, renkKisaltmalari);
    if (masterTemelAd) {
      (tumUrunler || []).forEach(u => {
        if (gorulenIdler.has(u.id)) return;
        const aday = temelAdCikar(u.ad, renkKisaltmalari);
        if (!aday || aday.temelAd !== masterTemelAd.temelAd || aday.renkKodu === masterTemelAd.renkKodu) return;
        gorulenIdler.add(u.id);
        sonuc.push({ urun: u, hedefRenkKodu: aday.renkKodu, hedefRenkAdi: aday.renkAdi, eslesmeTuru: 'isim' });
      });
    }

    return { eslesenler: sonuc, eksikRenkTanimi: [...eksikRenkTanimiMap.entries()].map(([sonEk, kayitlar]) => ({ sonEk, kayitlar })) };
  }

  // SİSTEM GENELİNDE REÇETE OLUŞTURMA — "isim ve renk benzerliği" olan TÜM
  // ürünleri bulur, her biri için renk_varyant_motoru.js'in
  // mevcutKartiKullan modunu (ZATEN VAR OLAN kardeş kartları kullan, sadece
  // eksik/boş reçeteleri master'dan kur) çalıştırır. Sonuçta oluşan/
  // güncellenen reçeteler NORMAL Store.urunler/Store.receteler kayıtlarıdır
  // — "Ürün Kartları & Reçete" ekranından (page_kartlar.js) aynı diğer
  // kartlar gibi görülüp düzenlenebilir, AYRI bir takip mekanizması YOKTUR.
  // idUret(prefix) -> string : çağıran taraf App.uid enjekte eder.
  function sistemGenelindeReceteRaporu(masterUrunKodu, veri, idUret) {
    const RVM = RenkVaryantMotoru;
    const masterKart = (veri.urunler || []).find(u => u.kod === masterUrunKodu);
    if (!masterKart) return { masterBulunamadi: true, urunSonuclari: [], eksikRenkTanimi: [] };

    const { eslesenler, eksikRenkTanimi } = benzerUrunleriBul(masterKart, veri.urunler || [], veri.renkKisaltmalari || []);

    // Çalışma kopyaları: bir adayın ÜRETTİĞİ yeni kartlar/reçeteler bir
    // SONRAKİ adayın işlenmesinde GÖRÜNÜR olmalı — aksi halde iki farklı
    // ürün ailesinin PAYLAŞTIĞI bir alt bileşen (ör. ortak bir hırdavat
    // yarı mamülü) her adayda AYRI AYRI (mükerrer) yaratılabilir.
    const calismaVerisi = {
      hammaddeler: veri.hammaddeler || [],
      yarimamuller: [...(veri.yarimamuller || [])],
      altMontajlar: [...(veri.altMontajlar || [])],
      paketler: [...(veri.paketler || [])],
      urunler: [...(veri.urunler || [])],
      receteler: [...(veri.receteler || [])],
      renkKisaltmalari: veri.renkKisaltmalari || []
    };

    const kartListesiAl = (tip) => tip === 'urun' ? calismaVerisi.urunler : tip === 'yarimamul' ? calismaVerisi.yarimamuller
      : tip === 'altmontaj' ? calismaVerisi.altMontajlar : calismaVerisi.paketler;

    const urunSonuclari = eslesenler.map(aday => {
      // kokHedefId: bu adayın ürünü ZATEN benzerUrunleriBul tarafından
      // bulundu (kod VEYA ad benzerliğiyle) — kök seviyesinde motorun
      // KENDİ (sadece kod-yapısal) aramasını tekrar yapmasına GEREK YOK,
      // hatta "isim" eşleşmelerinde bu arama BAŞARISIZ olurdu (kod serisi
      // farklı olduğu için) ve YANLIŞLIKLA yeni bir ürün kartı yaratırdı.
      const plan = RVM.varyantPlaniOlustur(masterKart.id, 'urun', aday.hedefRenkKodu, aday.hedefRenkAdi, calismaVerisi, idUret, { mevcutKartiKullan: true, kokHedefId: aday.urun.id });

      // Bu adayın ürettiği yeni kartları/reçeteleri ÇALIŞMA KOPYASINA ekle.
      plan.yeniKartlar.forEach(({ tip, kart }) => kartListesiAl(tip).push(kart));
      plan.yeniReceteler.forEach(yeniRecete => {
        const idx = calismaVerisi.receteler.findIndex(r => r.id === yeniRecete.id);
        if (idx >= 0) calismaVerisi.receteler[idx] = yeniRecete; else calismaVerisi.receteler.push(yeniRecete);
      });

      return {
        hedefUrunId: plan.kokYeniId, hedefUrunYeniMi: plan.yeniKartlar.some(x => x.tip === 'urun' && x.kart.id === plan.kokYeniId),
        hedefRenkKodu: aday.hedefRenkKodu, hedefRenkAdi: aday.hedefRenkAdi, eslesmeTuru: aday.eslesmeTuru,
        kaynakUrunKod: aday.urun.kod, kaynakUrunAd: aday.urun.ad,
        yeniKartlar: plan.yeniKartlar, yeniReceteler: plan.yeniReceteler, eksikEslesmeler: plan.eksikEslesmeler
      };
    });

    return { masterKart, urunSonuclari, eksikRenkTanimi };
  }

  return { raporOlustur, benzerUrunleriBul, temelAdCikar, sistemGenelindeReceteRaporu };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ReceteYapimRaporuMotoru;
