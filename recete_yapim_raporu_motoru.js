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

  return { raporOlustur };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ReceteYapimRaporuMotoru;
