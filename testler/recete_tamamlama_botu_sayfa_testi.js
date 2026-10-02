// ── Reçete Tamamlama Botu sayfası — kaynak metin kontrolü ───────────────────
// GERÇEK İHTİYAÇ: "reçeteleri yükledikçe büyük ölçülerin alt kırılımlı
// reçetelerini sistem otomatik arkada tamamlamaya devam etsin... botları
// sisteme kur ve çalışmaya başlasın, sürekli çalışmaya devam etsin, ben
// açtığımda yaptığı ve düzenlediklerini raporlasın, yapamadığı işler için
// yönlendirme yapsın." Bu testler, sayfanın (a) tarama mantığını motor
// dosyasına DELEGE ettiğini (burada TEKRARLANMADIĞINI), (b) otomatik
// çalışmanın bir GÜNLÜK bıraktığını, (c) elle tamamlanması gerekenler için
// doğru sayfalara YÖNLENDİRME yaptığını doğrular.
const fs = require('fs'), path = require('path');
const kaynak = fs.readFileSync(path.join(__dirname, '..', 'page_recete_tamamlama_botu.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- KOD KONTROLU: tarama mantığı MOTOR dosyasına delege ediliyor (burada tekrarlanmıyor) --');
t('"Şimdi Tekrar Tara" butonu taraVeCiz\'i çağırıyor', kaynak.includes("document.getElementById('rtb-tara').onclick = () => taraVeCiz(main)"));
t('manuel tarama OlcuVaryantMotoru.tamSistemTaramasi\'yi çağırıyor (döngü mantığı BURADA TEKRARLANMIYOR)',
  kaynak.includes('OlcuVaryantMotoru.tamSistemTaramasi(veri, App.uid)'));
t('tarama MANUEL bir tuşla tetikleniyor (sayfa açılır açılmaz SONUÇ UYGULANMIYOR, önce gösterilir)',
  !kaynak.includes("taraVeCiz(main);\n    await gunlukCiz"));

console.log('\n-- KOD KONTROLU: OTOMATİK çalışma (botCalistirVeUygula) dışa açık ve günlük bırakıyor --');
t('botCalistirVeUygula dışa açık (app.js/page_kartlar.js çağırabiliyor)', kaynak.includes('return { render, botCalistirVeUygula };'));
t('otomatik çalışma da OlcuVaryantMotoru.tamSistemTaramasi\'yi kullanıyor (AYNI motor, iki ayrı kod yolu YOK)',
  (kaynak.match(/OlcuVaryantMotoru\.tamSistemTaramasi\(/g) || []).length >= 2);
t('Ölçü Eşleştirme Anahtarı artık ELLE GİRİLMİYOR — Store\'dan anahtar OKUNMUYOR (motor kartlardan kendisi çıkarıyor)',
  !kaynak.includes("Store.olcuEslestirmeAnahtari"));
t('yapacak hiçbir şey bulunamazsa (sonuç VE eksik eşleşme ikisi de boş) günlük KAYDI BİLE YAZILMAZ (gürültü önleniyor)',
  kaynak.includes('if (!sonuclar.length && !eksikEslesmeler.length) return null;'));
t('otomatik çalışmada hata kullanıcının asıl işlemini (içe aktarma/giriş) ENGELLEMİYOR (try/catch ile yutuluyor)',
  kaynak.includes("console.error('Reçete Tamamlama Botu otomatik çalışma hatası:', e);") &&
  kaynak.includes('return null;'));
t('her çalışma (otomatik veya manuel) Store.receteTamamlamaGunlugu\'ne yazılıyor',
  (kaynak.match(/Store\.topluEkle\('receteTamamlamaGunlugu'/g) || []).length === 2);

console.log('\n-- KOD KONTROLU: "ben açtığımda yaptığını raporlasın" — Son Çalışmalar günlüğü gösteriliyor --');
t('render fonksiyonu gunlukCiz() çağırarak geçmiş çalışmaları gösteriyor', kaynak.includes('await gunlukCiz();'));
t('günlük Store.receteTamamlamaGunlugu.all() okuyor ve en yeniden eskiye sıralıyor',
  kaynak.includes('Store.receteTamamlamaGunlugu.all()') && kaynak.includes("gunluk.sort((a, b) => (b.zaman || '').localeCompare(a.zaman || ''))"));
t('günlük hiç çalışma yoksa anlamlı bir yönlendirme gösteriyor (sessizce boş DEĞİL)',
  kaynak.includes('Bot henüz hiç çalışmadı'));

console.log('\n-- KOD KONTROLU: "yapamadığı işler için yönlendirme yapsın" — elle tamamlanacaklar ayrı gösteriliyor --');
t('render fonksiyonu elleGerekenleriCiz() ile ŞU ANKİ (taze) eksik eşleşmeleri ayrıca gösteriyor',
  kaynak.includes('await elleGerekenleriCiz();'));
t('"hedefOlcuTanimsiz" (bu ölçüde henüz kardeş kart yok) durumu AYRI bir bölümde açıklanıyor',
  kaynak.includes("hedefOlcuTanimsizlar = eksikEslesmeler.filter(e => e.neden === 'hedefOlcuTanimsiz')") &&
  kaynak.includes('Bu Ölçüde Henüz Kardeş Kart Yok'));
t('sayfada artık Ölçü Eşleştirme Anahtarı sayfasına hiçbir yönlendirme YOK (sayfa kaldırıldı)',
  !kaynak.includes("App.goTo('olcu_anahtari')"));
t('"ölçüye özel olabilir" (otomatik düzeltilemeyen) durumu AYRI ve açık bir uyarıyla gösteriliyor',
  kaynak.includes("olcuyeOzelOlabilirler = eksikEslesmeler.filter(e => e.neden === 'olcuyeOzelOlabilirElleKontrolEdin')"));

console.log('\n-- KOD KONTROLU: oluşan kartlar/reçeteler DOĞRU koleksiyonlara yazılıyor --');
t('ürün/yarımamül/altmontaj/paket -> Store.urunler/yarimamuller/altMontajlar/paketler eşlemesi doğru',
  kaynak.includes("const TIP_KOLEKSIYON = { urun: 'urunler', yarimamul: 'yarimamuller', altmontaj: 'altMontajlar', paket: 'paketler' };"));
t('reçete yazarken TÜM koleksiyon indirilmiyor, hedefli Store.receteBul kullanılıyor (performans — bkz. page_kartlar.js hotfix)',
  kaynak.includes('await Store.receteBul({ ids: altReceteIdleri, urunIds: urunIdleri })') &&
  !kaynak.includes('await Store.receteler.all()'));
t('YENİ reçete kayıtları topluEkle, VAR OLAN (boştan tamamlanan) reçeteler topluGuncelle ile ayrıştırılıyor',
  kaynak.includes("const yeniler = receteYazilacak.filter(r => !mevcutIdSeti.has(r.id));") &&
  kaynak.includes("const guncellenecekler = receteYazilacak.filter(r => mevcutIdSeti.has(r.id));"));
t('yazma mantığı (uygulaYazma) TEK bir yerde yaşar — hem manuel hem otomatik akış AYNI fonksiyonu çağırıyor',
  (kaynak.match(/await uygulaYazma\(sonuclar\)/g) || []).length === 2);
t('uygulama sonrası kullanıcıya Ürün Kartları & Reçete\'den görüntüleyebileceği açıkça söyleniyor',
  kaynak.includes('Ürün Kartları & Reçete\'den görüntüleyebilirsiniz'));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
