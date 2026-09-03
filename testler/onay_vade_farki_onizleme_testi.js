// BULGU: Onay Bekleyenler ekranındaki (page_onaylar.js) "Vade Farkı" önizleme
// sütunu KENDİ formülünü kullanıyordu: global bir oran (App.state.ayarlar.
// aylikVadeFarkiFaizOrani) ve yalnızca vadesi ZATEN GEÇMİŞ kalemler için
// hesap yapıyordu (geçmişe dönük). Onayla'ya basıldığında GERÇEKTEN
// uygulanan formül (app.js: siparisOnaylaninceOdemePlaniniAnindaIsle)
// müşteriye özel bir oran (musteri.aylikVadeFarkiYuzde) kullanıyor ve henüz
// vadesi gelmemiş çek/kredi kartı kalemlerini de (ileriye dönük) hesaba
// katıyordu — önizleme, gerçekte kasaya/bakiyeye yansıyan tutarla HİÇ
// uyuşmuyordu. Düzeltme: app.js'te paylaşılan saf (side-effect'siz) bir
// hesaplayıcı çifti (odemeKalemiVadeFarki / odemePlaniToplamVadeFarki)
// çıkarıldı; hem sipariş onayı hem Manuel Tahsilat onayı hem de bu önizleme
// artık AYNI fonksiyonu çağırıyor.
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const onaySrc = fs.readFileSync(path.join(__dirname, '..', 'page_onaylar.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- page_onaylar.js: önizleme artık kendi (yanlış) formülünü KULLANMIYOR --');
t('global aylikVadeFarkiFaizOrani (Ayarlar) ARTIK OKUNMUYOR bu ekranda',
  !/App\.state\.ayarlar\.aylikVadeFarkiFaizOrani/.test(onaySrc));
t('yalnızca GEÇMİŞ vadeyi sayan "vade >= bugun return 0" mantığı KALDIRILDI',
  !/if \(vade >= bugun\) return 0;/.test(onaySrc));

console.log('\n-- page_onaylar.js: önizleme artık GERÇEK formülü (paylaşılan helper) çağırıyor --');
t('hesaplaVadeFarki artık müşteriyi bulup aylikVadeFarkiYuzde\'sini kullanıyor',
  /function hesaplaVadeFarki\(siparis, odemePlani\) \{\s*\n\s*const musteri = musteriler\.find\(m => m\.id === siparis\.musteriId\);/.test(onaySrc));
t('App.odemePlaniToplamVadeFarki çağrılıyor (gerçek onay akışıyla AYNI fonksiyon)',
  /return App\.odemePlaniToplamVadeFarki\(odemePlani, aylikVadeFarkiYuzde\);/.test(onaySrc));

console.log('\n-- app.js: paylaşılan hesaplayıcılar doğru davranıyor (gerçek matematik doğrulaması) --');
// odemeKalemiVadeFarki ve odemePlaniToplamVadeFarki'yi kaynak koddan izole edip
// gerçek bir JS motorunda çalıştırarak SAYISAL doğruluğunu doğrula (app.js
// dual-mode olmadığı için tüm dosyayı require edemeyiz — yalnızca bu iki saf
// fonksiyonu çıkarıp izole çalıştırıyoruz).
function fonksiyonCikar(ad) {
  const baslangic = appSrc.indexOf('function ' + ad + '(');
  if (baslangic < 0) return null;
  let derinlik = 0, i = appSrc.indexOf('{', baslangic), sonuc = '';
  for (; i < appSrc.length; i++) {
    const c = appSrc[i];
    if (c === '{') derinlik++;
    if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
  }
  return appSrc.slice(baslangic, i);
}
const src1 = fonksiyonCikar('odemeKalemiVadeFarki');
const src2 = fonksiyonCikar('odemePlaniToplamVadeFarki');
t('her iki fonksiyon da kaynaktan izole edilebildi', !!src1 && !!src2);

if (src1 && src2) {
  const izoleModul = new Function(src1 + '\n' + src2 + '\nreturn { odemeKalemiVadeFarki, odemePlaniToplamVadeFarki };');
  const { odemeKalemiVadeFarki, odemePlaniToplamVadeFarki } = izoleModul();

  console.log('\n-- Sayısal doğruluk: 90 gün sonrası vade, %2 aylık oran --');
  const bugun = '2026-01-01';
  const r1 = odemeKalemiVadeFarki(10000, '2026-04-01', 2, bugun); // ~90 gün -> 3 ay
  t('90 gün sonrası vade 3 ay olarak yuvarlanıyor (ileriye dönük!)', r1.aySayisi === 3);
  t('vade farkı = 10000 * 0.02 * 3 = 600', Math.abs(r1.vadeFarki - 600) < 0.01);
  t('netTutar = 10000 - 600 = 9400', Math.abs(r1.netTutar - 9400) < 0.01);

  console.log('\n-- Sayısal doğruluk: bugünkü/geçmiş vade -> vade farkı yok --');
  const r2 = odemeKalemiVadeFarki(5000, '2025-06-01', 2, bugun); // geçmiş tarih
  t('geçmiş vadeli kalem için aySayisi 0 (negatif gün 0\'a clamplanıyor)', r2.aySayisi === 0);
  t('geçmiş vadeli kalemde vade farkı 0', r2.vadeFarki === 0);

  console.log('\n-- Sayısal doğruluk: ödeme planındaki TÜM çek/kredi kartı kalemleri toplanıyor --');
  const plan = {
    odemeKalemleri: [
      { tip: 'cek', tutar: 10000, tarih: '2026-04-01' },   // 3 ay -> 600
      { tip: 'kredi_karti', tutar: 2000, tarih: '2026-02-15' }, // ~45 gün -> 2 ay -> 80
      { tip: 'nakit', tutar: 1000, tarih: '2026-06-01' }    // nakit sayılmaz
    ]
  };
  const toplam = odemePlaniToplamVadeFarki(plan, 2, bugun);
  t('toplam vade farkı yalnızca çek+kredi kartından geliyor (nakit hariç, 600+80=680)', Math.abs(toplam - 680) < 0.01);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
