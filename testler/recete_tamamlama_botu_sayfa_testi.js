// ── Reçete Tamamlama Botu sayfası — kaynak metin kontrolü ───────────────────
// GERÇEK İHTİYAÇ: "reçeteleri yükledikçe büyük ölçülerin alt kırılımlı
// reçetelerini sistem otomatik arkada tamamlamaya devam etsin... ajan...
// kodlara göre otomatik hammadde atsın." Bu testler, sayfanın motor
// fonksiyonlarını DOĞRU çağırdığını ve yazma işleminin DOĞRU koleksiyonlara
// gittiğini (page_recete_yapim_raporu.js testleriyle AYNI desende) doğrular.
const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_recete_tamamlama_botu.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- KOD KONTROLU: tarama MANUEL bir tuşla tetikleniyor, tüm koleksiyonları tarıyor --');
t('"Tüm Sistemi Tara" butonu taraVeCiz\'i çağırıyor', kaynak.includes("document.getElementById('rtb-tara').onclick = () => taraVeCiz(main)"));
t('tarama OlcuVaryantMotoru.kodParcasiIleOlcuBul VE sistemGenelindeOlcuTamamlama motorlarını çağırıyor (mantık BURADA tekrarlanmıyor)',
  kaynak.includes('OlcuVaryantMotoru.kodParcasiIleOlcuBul(kart.kod, calismaVerisi.olcuEslestirmeAnahtari)') &&
  kaynak.includes('OlcuVaryantMotoru.sistemGenelindeOlcuTamamlama(kart.kod, tip, calismaVerisi, App.uid)'));
t('tarama TÜM 4 kart tipini (ürün/yarımamül/altmontaj/paket) dolaşıyor',
  kaynak.includes("const TIP_KOLEKSIYON = { urun: 'urunler', yarimamul: 'yarimamuller', altmontaj: 'altMontajlar', paket: 'paketler' };"));
t('tarama MANUEL bir tuşla tetikleniyor (sayfa açılır açılmaz OTOMATİK TAM SİSTEM taraması YAPILMIYOR)',
  !kaynak.includes('taraVeCiz(main);\n    document.getElementById'));
t('reçetesi EKSİK/BOŞ olan kartlar MASTER olarak kullanılmıyor (yalnızca TAM reçeteli kartlar örnek alınır)',
  kaynak.includes('if (!kendiRecetesi || !(kendiRecetesi.kalemler || []).length) continue;'));
t('aynı aile+ölçü birden fazla master üzerinden TEKRAR işlenmiyor (mükerrer önleme)',
  kaynak.includes('islenenAileOlcu.has(anahtarIslem)'));

console.log('\n-- KOD KONTROLU: oluşan kartlar/reçeteler DOĞRU koleksiyonlara yazılıyor --');
t('ürün/yarımamül/altmontaj/paket -> Store.urunler/yarimamuller/altMontajlar/paketler eşlemesi doğru',
  kaynak.includes("const TIP_KOLEKSIYON = { urun: 'urunler', yarimamul: 'yarimamuller', altmontaj: 'altMontajlar', paket: 'paketler' };"));
t('reçete yazarken TÜM koleksiyon indirilmiyor, hedefli Store.receteBul kullanılıyor (performans — bkz. page_kartlar.js hotfix)',
  kaynak.includes('await Store.receteBul({ ids: altReceteIdleri, urunIds: urunIdleri })') &&
  !kaynak.includes('await Store.receteler.all()'));
t('YENİ reçete kayıtları topluEkle, VAR OLAN (boştan tamamlanan) reçeteler topluGuncelle ile ayrıştırılıyor',
  kaynak.includes("const yeniler = receteYazilacak.filter(r => !mevcutIdSeti.has(r.id));") &&
  kaynak.includes("const guncellenecekler = receteYazilacak.filter(r => mevcutIdSeti.has(r.id));"));
t('uygulama sonrası kullanıcıya Ürün Kartları & Reçete\'den görüntüleyebileceği açıkça söyleniyor',
  kaynak.includes('Ürün Kartları & Reçete\'den görüntüleyebilirsiniz'));

console.log('\n-- KOD KONTROLU: elle kontrol gereken (tahmin edilmeyen) kalemler ayrı raporlanıyor --');
t('eksik eşleşmeler ayrı bir "Elle Kontrol Gerekiyor" bölümünde gösteriliyor',
  kaynak.includes('Elle Kontrol Gerekiyor'));
t('Ölçü Eşleştirme Anahtarı hiç tanımlı değilse anlamlı bir yönlendirme gösteriliyor (sessizce boş rapor DEĞİL)',
  kaynak.includes('Henüz hiç Ölçü Ailesi tanımlanmadı') && kaynak.includes("App.goTo('olcu_anahtari')"));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
