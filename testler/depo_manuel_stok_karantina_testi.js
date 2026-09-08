// ── DEPO PANELİ — manuel stok düzeltme + tekil kalite karantina (T50 denetimi) ──
// BULGU 1: "Tüm Stoklar" sekmesindeki manuel stok düzenleme, eskiMiktar'ı
// SAYFA AÇILIŞINDAKİ (bayat olabilecek) `stokRaf` kapanışından okuyup farkı
// AZ ÖNCE ÇEKİLMİŞ (güncel) `tumStok`'un üzerine uyguluyordu. Ekran açıkken
// başka bir işlem (ör. Kalite'nin bir depo girişini onaylaması) stoğu
// değiştirmişse, kullanıcı "gördüğü mevcut miktarı" düzeltiyor sansa da
// gerçekte tutarsız bir toplam kaydediliyordu.
// BULGU 2: Depo Girişi'nde "Kalite problemi şüphesi var" tek tek girişte
// işaretlenince durum hep 'depo_onayladi_kalite_bekliyor' kalıyordu — toplu
// giriş formuyla TUTARSIZ (o, durum='karantina' yazıyor). Giriş Kayıt
// Defteri/"Karantinadaki Girişler" tabloları yalnızca durum alanına
// baktığından, flagged teslimat kırmızı KARANTİNA etiketini hiç almıyordu.
// BULGU 3: Aynı ekranın "eksik teslimat" toast'u Satınalma'ya bildirim
// gönderildiğini SÖYLÜYORDU ama hiçbir yere yazılmıyordu (bkz.
// ai_denetci_depo_testi.js — artık gerçek bir bulgu üretiliyor).
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_depo_panel.js'), 'utf8');

let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- Kaynak kilit: manuel stok düzeltmesi artık TEK bir güncel anlık görüntü kullanıyor --');
t('tumStok önce çekiliyor, eskiMiktar da AYNI tumStok\'tan okunuyor (bayat stokRaf kapanışından DEĞİL)',
  /const tumStok = await Store\.stokRaf\.all\(\);\s*\n\s*const eskiMiktar = App\.stokMiktarAmbar\(tumStok, ambar, tip, id\);/.test(src));
t('fark bu güncel eskiMiktar\'dan hesaplanıyor', /const fark = yeniMiktar - eskiMiktar;/.test(src));

console.log('\n-- Kaynak kilit: tekil Depo Girişi kalite problemi artık karantina durumuna düşüyor --');
t('kaliteProblemi true ise durum karantina, değilse depo_onayladi_kalite_bekliyor',
  /giris\.durum = kaliteProblemi \? 'karantina' : 'depo_onayladi_kalite_bekliyor';/.test(src));

console.log('\n-- Kaynak kilit: yanlış "Satınalma\'ya bildirim gönderildi" iddiası kaldırıldı --');
t('toast artık böyle bir iddia içermiyor', !/Satınalma birimine bildirim gönderildi/.test(src));
t('eksik teslimat toast\'u hâlâ eksik miktarı doğru şekilde bildiriyor', /⚠ Eksik teslimat: \$\{eksikMiktar\} \$\{giris\.birim\} eksik geldi/.test(src));

console.log('\n-- Sayısal doğruluk: eskiMiktar/fark hesaplaması güncel anlık görüntüyle tutarlı --');
{
  // page_depo_panel.js'teki GERÇEK App.stokMiktarAmbar/stokMiktarGuncelle
  // mantığıyla birebir aynı (app.js:71-87) — burada izole edilip test edilir.
  const stokMiktarAmbar = (stokRaf, ambar, tip, refId) => {
    const s = stokRaf.find(x => x.ambar === ambar && x.tip === tip && x.refId === refId);
    return s ? s.miktar : 0;
  };
  const stokMiktarGuncelle = (stokRaf, ambar, tip, refId, refKod, refAd, birim, fark) => {
    let s = stokRaf.find(x => x.ambar === ambar && x.tip === tip && x.refId === refId);
    if (!s) { s = { id: 'STK-' + ambar + '-' + tip + '-' + refId, ambar, tip, refId, refKod: refKod || '', refAd: refAd || '', miktar: 0, birim: birim || 'ADET' }; stokRaf.push(s); }
    s.miktar = (s.miktar || 0) + fark;
    return s;
  };

  console.log('\n  -- Senaryo: ekran açıkken başka bir işlem (Kalite onayı) stoğu DEĞİŞTİRDİ --');
  // Sayfa render anında görülen değer: 100 (bayat, artık KULLANILMIYOR)
  const renderAnindakiStokRaf = [{ ambar: 'hammadde_deposu', tip: 'hammadde', refId: 'HM1', miktar: 100 }];
  // Kullanıcı "değişikliği yapmadan önce" arka planda Kalite +30 stok ekledi;
  // ekran açık kaldığı için renderAnindakiStokRaf hâlâ 100 gösteriyor.
  const guncelSunucuStoku = [{ ambar: 'hammadde_deposu', tip: 'hammadde', refId: 'HM1', miktar: 130 }];
  // Depo çalışanı fiziksel sayımda GERÇEKTEN 95 adet saydı ve bunu yazdı.
  const yeniMiktar = 95;

  // DÜZELTİLMİŞ MANTIK: eskiMiktar de tumStok'tan (güncel) okunur.
  const tumStok = guncelSunucuStoku.map(x => ({ ...x })); // "await Store.stokRaf.all()" simülasyonu
  const eskiMiktarDuzeltilmis = stokMiktarAmbar(tumStok, 'hammadde_deposu', 'hammadde', 'HM1');
  const farkDuzeltilmis = yeniMiktar - eskiMiktarDuzeltilmis;
  stokMiktarGuncelle(tumStok, 'hammadde_deposu', 'hammadde', 'HM1', 'HM1', 'Test', 'ADET', farkDuzeltilmis);
  t('düzeltilmiş mantıkla sonuç TAM OLARAK kullanıcının yazdığı 95 oluyor', tumStok[0].miktar === 95);

  // ESKİ (HATALI) MANTIK: eskiMiktar bayat renderAnindakiStokRaf'tan okunuyordu.
  const eskiMiktarHatali = stokMiktarAmbar(renderAnindakiStokRaf, 'hammadde_deposu', 'hammadde', 'HM1');
  const farkHatali = yeniMiktar - eskiMiktarHatali; // 95 - 100 = -5
  const tumStokHataliSenaryo = guncelSunucuStoku.map(x => ({ ...x }));
  stokMiktarGuncelle(tumStokHataliSenaryo, 'hammadde_deposu', 'hammadde', 'HM1', 'HM1', 'Test', 'ADET', farkHatali);
  t('eski (hatalı) mantıkla sonuç YANLIŞ 125 olurdu (130-5) — kullanıcının yazdığı 95 DEĞİL, bug\'ın kanıtı',
    tumStokHataliSenaryo[0].miktar === 125 && tumStokHataliSenaryo[0].miktar !== 95);

  console.log('\n  -- Senaryo: hiçbir eşzamanlı değişiklik yoksa (normal durum) her iki mantık da aynı sonucu verir --');
  const stabilStok = [{ ambar: 'hammadde_deposu', tip: 'hammadde', refId: 'HM2', miktar: 50 }];
  const tumStokStabil = stabilStok.map(x => ({ ...x }));
  const eskiStabil = stokMiktarAmbar(tumStokStabil, 'hammadde_deposu', 'hammadde', 'HM2');
  stokMiktarGuncelle(tumStokStabil, 'hammadde_deposu', 'hammadde', 'HM2', 'HM2', 'Test', 'ADET', 40 - eskiStabil);
  t('eşzamanlı değişiklik yokken düzeltme normal senaryoda doğru çalışmaya devam ediyor (50 -> 40)', tumStokStabil[0].miktar === 40);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
