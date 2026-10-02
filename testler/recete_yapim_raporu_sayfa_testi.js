// ── Reçete Yapım Raporu sayfası — sistem genelinde reçete oluşturma UI ──────
// GERÇEK İHTİYAÇ: "reçete yapım raporunda sistemde isim ve renk benzerliği
// olan ürünleri eşleştir... tüm sistem taransın ve buna göre ürün reçeteleri
// oluşsun... oluşan reçeteler ürün kartları ve reçeteler sekmesinden takip
// olunsun." Bu testler, page_recete_yapim_raporu.js'in bu akışı doğru
// bağladığını (motor fonksiyonlarını çağırdığını, yazma işleminin doğru
// koleksiyonlara gittiğini, AYRI bir takip mekanizması İCAT ETMEDİĞİNİ —
// Store.urunler/Store.receteler'in KENDİSİNİ kullandığını) kaynak metin
// üzerinden doğrular (DOM/Store bağımlı kod, diğer sayfa testleriyle AYNI
// desende).

const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_recete_yapim_raporu.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- KOD KONTROLU: sistem genelinde tarama akışı bağlı --');
t('"Tara" butonu sistemGenelindeTaraVeCiz\'i çağırıyor', kaynak.includes("document.getElementById('ryr-sistem-tara').onclick = () => sistemGenelindeTaraVeCiz(main)"));
t('tarama ReceteYapimRaporuMotoru.sistemGenelindeReceteRaporu motorunu çağırıyor (mantık BURADA tekrarlanmıyor)',
  kaynak.includes('ReceteYapimRaporuMotoru.sistemGenelindeReceteRaporu(sonMasterKodlar.rootKod, veri, App.uid)'));
t('tarama TÜM gerekli koleksiyonları (hammaddeler/yarımamuller/altMontajlar/paketler/ürünler/reçeteler/renkKisaltmaları) TEK SEFERDE (Promise.all) çekiyor',
  kaynak.includes('Store.hammaddeler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(),') &&
  kaynak.includes('Store.paketler.all(), Store.urunler.all(), Store.receteler.all(), Store.renkKisaltmalari.all()'));
t('tarama MANUEL bir tuşla tetikleniyor (dosya yüklenir yüklenmez OTOMATİK TAM SİSTEM taraması YAPILMIYOR — performans)',
  !kaynak.includes('sistemGenelindeTaraVeCiz(main);\n        await kontrolEtVeCiz'));

console.log('\n-- KOD KONTROLU: oluşan kartlar/reçeteler DOĞRU koleksiyonlara, AYRI bir takip YAPISI İCAT EDİLMEDEN yazılıyor --');
t('ürün/yarımamül/altmontaj/paket -> Store.urunler/yarimamuller/altMontajlar/paketler eşlemesi doğru',
  kaynak.includes("const tipKoleksiyon = { urun: 'urunler', yarimamul: 'yarimamuller', altmontaj: 'altMontajlar', paket: 'paketler' };"));
t('YENİ reçete kayıtları topluEkle, VAR OLAN (boştan tamamlanan) reçeteler topluGuncelle ile ayrıştırılıyor (mükerrer/kayıp yazma yok)',
  kaynak.includes("const yeniler = receteYazilacak.filter(r => !mevcutIdSeti.has(r.id));") &&
  kaynak.includes("const guncellenecekler = receteYazilacak.filter(r => mevcutIdSeti.has(r.id));"));
t('AYRI bir "oluşturulan reçeteler" takip koleksiyonu YOK — sadece standart Store.urunler/receteler kullanılıyor',
  !kaynak.includes('Store.olusturulanReceteler') && !kaynak.includes('Store.sistemGenelindeKayitlari'));
t('uygulama sonrası kullanıcıya Ürün Kartları & Reçete\'den görüntüleyebileceği açıkça söyleniyor',
  kaynak.includes('Ürün Kartları & Reçete\'den görüntüleyebilirsiniz'));

console.log('\n-- KOD KONTROLU: eşleşme türleri (kod/isim) ve eksik durumlar ayrı gösteriliyor --');
t('kod eşleşmesi ve isim eşleşmesi görsel olarak AYRI etiketleniyor (kullanıcı güven düzeyini görsün)',
  kaynak.includes("s.eslesmeTuru === 'kod' ? 'pill-blue' : 'pill-amber'"));
t('ürün düzeyinde tanınmayan son ekler de (yarı mamül düzeyiyle AYNI desende) Renk Eşleştirme Anahtarı\'na yönlendiriyor',
  kaynak.includes("ryr-sistem-renk-tanimla") && kaynak.includes("App.goTo('renk_anahtari', { onerilenKisaltma: btn.dataset.sonek })"));
t('master ürün sistemde bulunamazsa anlamlı bir hata gösteriliyor (sessizce boş rapor DEĞİL)',
  kaynak.includes('sgRapor.masterBulunamadi'));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
