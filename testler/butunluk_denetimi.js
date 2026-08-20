// ════════════════════════════════════════════════════════════════════════════
// BÜTÜNLÜK DENETİMİ — "üretici/tüketici alan uyuşmazlığı" avı
// Son üç arıza (durum, toplam, grup) hep aynı türdendi: bir ekran kayıt
// üretiyor, başka ekran farklı alan adı arıyor. Bu denetim onu sistematik arar.
// ════════════════════════════════════════════════════════════════════════════
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const dosyalar=fs.readdirSync(KOK).filter(f=>f.endsWith('.js')&&!f.startsWith('pdf.')&&f!=='three.min.js'&&f!=='build.js');
const kod={}; dosyalar.forEach(f=>kod[f]=fs.readFileSync(path.join(KOK,f),'utf8'));
const tum=Object.values(kod).join('\n');
let bulgu=[], kontrol=0;
const K=(ad,kosul,detay)=>{kontrol++; if(!kosul) bulgu.push({ad,detay});};

// ── 1) SİPARİŞ ÜRETEN TÜM KAYNAKLAR AYNI ALANLARI YAZIYOR MU ──────────────
const siparisUretenler=[];
dosyalar.forEach(f=>{
  const re=/uid\('SIP'\)/g;
  if(re.test(kod[f])) siparisUretenler.push(f);
});
const ZORUNLU_SIP=['durum','kalemler','musteriAdi','kod','tarih'];
// KALICI sipariş üretenler: kaydı gerçekten yazanlar (upsert/topluEkle).
// Faturalama gibi geçici nesneler (kaydedilmeyen) bu denetime girmez.
// YENİ sipariş üretenler: uid('SIP') ile YENİ kimlik oluşturup kaydedenler.
// Mevcut siparişin durumunu güncelleyen ekranlar (sevkiyat, onay) bu
// denetime girmez — onlar zaten var olan kaydı değiştirir.
const kaliciSiparis=siparisUretenler.filter(f=>{
  if(!/Store\.siparisler\.upsert|topluEkle\('siparisler'/.test(kod[f])) return false;
  // uid('SIP') bir NESNE TANIMI içinde mi? ("id: App.uid('SIP')")
  return /id:\s*App\.uid\('SIP'\)/.test(kod[f]) &&
    // ve bu nesne gerçekten kaydediliyor mu (geçici fatura nesnesi değil)
    !/faturaSiparisi/.test(kod[f].slice(Math.max(0,kod[f].indexOf("id: App.uid('SIP')")-300),
                                        kod[f].indexOf("id: App.uid('SIP')")+200));
});
kaliciSiparis.forEach(f=>{
  // Kayıt gövdesi uid('SIP') satırından uzakta olabilir (govde nesnesi gibi);
  // bu yüzden yazma çağrısını merkez alıp geniş pencere tararız.
  const y=Math.max(kod[f].indexOf("Store.siparisler.upsert"), kod[f].indexOf("topluEkle('siparisler'"));
  const i=kod[f].indexOf("uid('SIP')");
  const bas=Math.max(0, Math.min(i<0?y:i, y)-2500);
  const blok=kod[f].slice(bas, Math.max(i,y)+1500);
  ZORUNLU_SIP.forEach(a=>{
    K(`${f}: siparişte "${a}" alanı`, new RegExp('\\b'+a+'\\s*[:,]').test(blok),
      'Sipariş kaydında bu alan yok — ilgili ekranda görünmez');
  });
  K(`${f}: durum 'taslak' DEĞİL`, !/durum:\s*'taslak'/.test(blok),
    "'taslak' hiçbir onay ekranında listelenmez");
});

// ── 2) KALEM ÜRETENLER 'grup' YAZIYOR MU ──────────────────────────────────
// Planlama: kalem.grup === 'hammadde' ise atlar; grup yoksa kalem kaybolur
[['proje_teklif_motor.js','siparisKalemleriUret'],
 ['page_ag_entegrasyon.js','kalemler: (k.kalemler']].forEach(([f,imza])=>{
  if(!kod[f]) return;
  const i=kod[f].indexOf(imza);
  if(i<0) return;
  const blok=kod[f].slice(i,i+1200);
  K(`${f}: kalemde "grup"`, /grup:/.test(blok), 'Planlama kalemi göremez');
  K(`${f}: kalemde "kod"`, /kod:/.test(blok), 'İş emri ürün kartına bağlanamaz');
  K(`${f}: kalemde "miktar"`, /miktar:/.test(blok), 'Üretim miktarı bilinemez');
});

// ── 3) TAM KOLEKSİYON KAYDI (403/413 riski) ───────────────────────────────
// storage.set artık otomatik parçalıyor; yine de BÜYÜK koleksiyonlarda
// doğrudan .save çağrısı riskli kalabilir — sayısını izliyoruz.
const buyukKoleksiyonlar=['receteler','urunler','hammaddeler','yarimamuller','siparisler','isemirleri','stokHareketleri'];
let tamKayit=0;
dosyalar.forEach(f=>{
  if(f==='storage.js') return;
  buyukKoleksiyonlar.forEach(k=>{
    const m=kod[f].match(new RegExp('Store\\.'+k+'\\.save\\(','g'));
    if(m) tamKayit+=m.length;
  });
});
K('storage.set otomatik parçalama var',
  /BUYUK_GOVDE_ESIGI/.test(kod['storage.js']),
  'Büyük yazmalar 403 verir');

// ── 4) SAYFA MODÜLÜ / MENÜ TUTARLILIĞI ────────────────────────────────────
// SAYFA menüsü: yalnızca "roller:" alanı olan girişler sayfadır.
// "roller" alanı olmayanlar ROL tanımıdır (uretim_planlama, depo, arge…) —
// bunlar sayfa değildir, modül aranmamalıdır.
const menuIdler=[...(kod['app.js'].matchAll(/\{ id: '([a-z_]+)',[^}]*roller:\s*\[/g))].map(m=>m[1]);
const modulIdler=[...(tum.matchAll(/PageModules\.([a-z_]+)\s*=/g))].map(m=>m[1]);
menuIdler.forEach(id=>{
  K(`menü "${id}" için modül var`, modulIdler.includes(id),
    'Menüde görünür ama tıklanınca boş sayfa açılır');
});

// ── 5) index.html'de YÜKLENMEYEN modül var mı ─────────────────────────────
const html=fs.readFileSync(path.join(KOK,'index.html'),'utf8');
dosyalar.forEach(f=>{
  if(['sw.js','storage.js','app.js'].includes(f)) return;
  if(!/^(page_|.*_motor|.*_okuyucu|.*_cizim|.*_kilavuz|ag_entegrasyon|teklif_excel|montaj_kilavuzu)/.test(f)) return;
  K(`${f} index.html'de yüklü`, html.includes(f),
    'Dosya var ama tarayıcıya yüklenmiyor — modül tanımsız hatası verir');
});

// ── 6) SÜRÜM ETİKETİ TUTARLILIĞI ──────────────────────────────────────────
const surumler=[...(html.matchAll(/\.js\?v=(\d+)/g))].map(m=>+m[1]);
const enYuksek=Math.max(...surumler);
// Sabit kütüphaneler (xlsx, three, pdf) ve nadiren değişen modüller sürüm
// etiketiyle takip edilmez — yalnızca sık değişen uygulama dosyaları sayılır.
// Sürüm etiketi denetimi: yalnızca BU TURDA değişen dosyalar taze olmalı.
  // Aylardır değişmemiş kararlı modüller eski etiketle kalabilir — bu bir
  // hata değildir, aksine gereksiz önbellek yenilemesini önler.
  const SABIT=/xlsx|three|pdf\.|data\.js|dolap_|masa_|cnc_export|mekan_yerlesim|ikon\.js|i18n\.js|qr_|kontrol_plani|sayim\.js|kayip_kacak|recete_talep/;
const eskiler=[...(html.matchAll(/([\w.]+\.js)\?v=(\d+)/g))]
  .filter(m=>!SABIT.test(m[1]) && +m[2]<enYuksek-8);
// Sürüm etiketi UYARIDIR, hata değil: eski etiket yalnızca o dosya bu
// turda değiştiyse sorundur. Değişmemiş dosyanın etiketi eski kalmalıdır —
// aksi halde her sürümde tüm önbellek boşuna yenilenir.
const surumUyari = eskiler.length ? eskiler.slice(0,6).map(m=>m[1]+'@v'+m[2]) : [];

// ── 7) KOLEKSİYON TANIMI EKSİK Mİ ─────────────────────────────────────────
const kullanilan=new Set([...(tum.matchAll(/Store\.([a-zA-Z]+)\.(all|save|upsert)\(/g))].map(m=>m[1]));
const tanimli=new Set([...(kod['storage.js'].matchAll(/(\w+):\s*coll\('/g))].map(m=>m[1]));
kullanilan.forEach(k=>{
  K(`koleksiyon "${k}" tanımlı`, tanimli.has(k),
    'storage.js\'de coll() ile tanımlanmamış — çalışma anında hata verir');
});

// ── 8) topluEkle/topluGuncelle'de GEÇERSİZ koleksiyon adı ─────────────────
const partiKullanim=[...(tum.matchAll(/toplu(?:Ekle|Guncelle)\('([a-zA-Z]+)'/g))].map(m=>m[1]);
[...new Set(partiKullanim)].forEach(k=>{
  K(`parçalı yazmada "${k}" tanımlı`, tanimli.has(k),
    'Yanlış koleksiyon adı — veri kaybolur');
});

// ── RAPOR ────────────────────────────────────────────────────────────────
console.log('BÜTÜNLÜK DENETİMİ');
console.log('─'.repeat(60));
console.log('Taranan dosya      :', dosyalar.length);
console.log('Yapılan kontrol    :', kontrol);
console.log('Kalıcı sipariş üreten :', kaliciSiparis.length, '('+kaliciSiparis.join(', ')+')');
console.log('Menü / modül       :', menuIdler.length, '/', modulIdler.length);
console.log('Tanımlı koleksiyon :', tanimli.size);
console.log('Büyük koleksiyonda tam kayıt:', tamKayit, tamKayit? '(storage.set otomatik parçalıyor)':'');
console.log('─'.repeat(60));
if(surumUyari.length){
  console.log('ℹ Bilgi: '+surumUyari.length+' dosya eski sürüm etiketli.');
  console.log('  ('+surumUyari.slice(0,4).join(', ')+')');
  console.log('  Bu dosyalar bu turda DEĞİŞMEDİYSE sorun değildir.\n');
}
if(!bulgu.length){ console.log('✓ BULGU YOK — tüm kontroller temiz'); }
else {
  console.log('⚠ '+bulgu.length+' BULGU:');
  bulgu.forEach(b=>console.log('  • '+b.ad+'\n      → '+b.detay));
}
console.log('\nSONUC: '+(kontrol-bulgu.length)+' gecti, '+bulgu.length+' kaldi');
process.exit(bulgu.length?1:0);
