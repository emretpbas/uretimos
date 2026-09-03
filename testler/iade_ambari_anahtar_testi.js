// BULGU (T3-27): app.js:iadeAmbarinaAktar stokRaf kaydını 'ncr.refId ||
// ncr.id' anahtarıyla açıyordu ama iade kaydına yalnızca 'ncr.refId'
// (fallback'siz) yazıyordu. ncr.refId boş/null/undefined olduğunda
// (örn. üretimden doğrudan açılan NCR'lerde refId hiç set edilmeyebilir)
// page_iade_ambari.js'in stok düşümü/satışı sırasında aradığı anahtar
// ('i.refId || i.id' -> iade.id, bir "IADE-..." id'si) stokRaf'ta gerçekte
// duran anahtarla ('ncr.refId || ncr.id' -> bir "NCR-..." id'si) HİÇ
// eşleşmiyordu — stok bulunamıyor, satış/düşüm sessizce hiçbir şey
// yapmıyordu (ya da yanlış/boş bir stokRaf kaydı yeniden yaratıyordu).
// Düzeltme: iade kaydına da AYNI fallback ('ncr.refId || ncr.id')
// uygulanarak iki taraf tutarlı hale getirildi.
// app.js Store/DOM'a derinden bağlı olduğu için (diğer page_* testleriyle
// aynı desende) kaynak kod üzerinde regex doğrulama yapılır; ayrıca
// iadeAmbarinaAktar izole edilip sahte bir Store ile anahtar eşleşmesi
// sayısal olarak da doğrulanır.
const fs = require('fs'), path = require('path');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const iadeAmbariSrc = fs.readFileSync(path.join(__dirname, '..', 'page_iade_ambari.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- app.js: iadeAmbarinaAktar artık iade.refId ve stokRaf.refId için AYNI fallback\'i kullanıyor --');
t('iade.refId artık ncr.refId || ncr.id (stokRaf ile aynı fallback)',
  /tip: ncr\.tip, refId: ncr\.refId \|\| ncr\.id, aciklama: ncr\.aciklama,/.test(appSrc));
t('stokRaf kaydı hâlâ ncr.refId || ncr.id ile açılıyor (regresyon yok)',
  /stokMiktarGuncelle\(stokRaf, 'iade_ambari', ncr\.tip \|\| 'urun', ncr\.refId \|\| ncr\.id, ncr\.kod, ncr\.ad, ncr\.birim, ncr\.miktar\);/.test(appSrc));

console.log('\n-- page_iade_ambari.js: stok düşüm/satış noktaları i.refId || i.id ile arıyor (değişmedi, artık iade.refId hep dolu) --');
const refIdAramaSayisi = (iadeAmbariSrc.match(/x\.refId === \(i\.refId \|\| i\.id\)/g) || []).length;
t('en az 2 yerde i.refId || i.id ile stokRaf aranıyor', refIdAramaSayisi >= 2);

console.log('\n-- Sayısal doğruluk: iadeAmbarinaAktar izole edilip sahte Store ile anahtar eşleşmesi doğrulanıyor --');
{
  function fonksiyonCikar(ad, girisNoktasi) {
    const baslangic = appSrc.indexOf(girisNoktasi + ' ' + ad + '(');
    let derinlik = 0, i = appSrc.indexOf('{', baslangic), sonuc = '';
    for (; i < appSrc.length; i++) {
      const c = appSrc[i];
      if (c === '{') derinlik++;
      if (c === '}') { derinlik--; if (derinlik === 0) { i++; break; } }
    }
    return appSrc.slice(baslangic, i);
  }
  const srcStokMiktarGuncelle = fonksiyonCikar('stokMiktarGuncelle', 'function');
  const srcStokKaydiId = fonksiyonCikar('stokKaydiId', 'function');
  const srcIadeAktar = fonksiyonCikar('iadeAmbarinaAktar', 'async function');

  function ortamKur(stokRaf, iadeler) {
    const Store = {
      stokRaf: { all: async () => stokRaf.slice(), save: async (arr) => { stokRaf.length = 0; stokRaf.push(...arr); } },
      iadeKalemleri: { all: async () => iadeler.slice(), save: async (arr) => { iadeler.length = 0; iadeler.push(...arr); } }
    };
    const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const izole = new Function('Store', 'uid', srcStokKaydiId + '\n' + srcStokMiktarGuncelle + '\n' + srcIadeAktar + '\nreturn iadeAmbarinaAktar;');
    return izole(Store, uid);
  }

  (async () => {
    console.log('\n  -- Senaryo: ncr.refId BOŞ (üretimden doğrudan açılan NCR) --');
    const stokRaf = [];
    const iadeler = [];
    const fn = ortamKur(stokRaf, iadeler);
    const ncr = { id: 'NCR-1', no: 'NCR-2026-001', kaynak: 'uretim', kod: 'K-1', ad: 'Sandalye', miktar: 3, birim: 'ADET', tip: 'urun', refId: null, aciklama: 'test' };
    const iade = await fn(ncr, {});
    t('iade.refId artık boş DEĞİL, ncr.id\'ye düşüyor', iade.refId === 'NCR-1');
    t('stokRaf kaydı da AYNI anahtarla (NCR-1) açıldı', stokRaf.length === 1 && stokRaf[0].refId === 'NCR-1');
    t('page_iade_ambari.js\'in aradığı anahtar (i.refId || i.id) artık stokRaf ile EŞLEŞİYOR',
      stokRaf.find(x => x.ambar === 'iade_ambari' && x.refId === (iade.refId || iade.id)) !== undefined);
    t('stok miktarı doğru yazıldı (3)', stokRaf[0].miktar === 3);

    console.log('\n  -- Senaryo: ncr.refId DOLU (normal akış — regresyon yok) --');
    const stokRaf2 = [];
    const iadeler2 = [];
    const fn2 = ortamKur(stokRaf2, iadeler2);
    const ncr2 = { id: 'NCR-2', no: 'NCR-2026-002', kaynak: 'satinalma', kod: 'K-2', ad: 'Masa', miktar: 5, birim: 'ADET', tip: 'urun', refId: 'URN-77', aciklama: 'test2' };
    const iade2 = await fn2(ncr2, {});
    t('iade.refId ncr.refId\'yi koruyor (URN-77)', iade2.refId === 'URN-77');
    t('stokRaf kaydı da URN-77 ile açıldı', stokRaf2[0].refId === 'URN-77');
    t('anahtarlar burada da eşleşiyor',
      stokRaf2.find(x => x.ambar === 'iade_ambari' && x.refId === (iade2.refId || iade2.id)) !== undefined);

    console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
    process.exit(bad ? 1 : 0);
  })();
}
