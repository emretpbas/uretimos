// BULGU: "Üretimden Gelen Malzeme Talepleri" (Malzeme Düşümü sekmesi),
// hammadde_deposu'nda ASLA var olmayan bir "yarimamul" stok kaydından düşüm
// yapıp uretim_ambari'ye karşılıksız (hayalet) stok ekliyordu — çünkü fazla
// yarı mamül HER ZAMAN doğrudan uretim_ambari'ye eklenir (bkz.
// App.fazlaMalzemeyiStogaEkle), hammadde_deposu yalnızca hammadde/hırdavat
// tutar. Düzeltme: talep artık uretim_ambari'nin KENDİ fazla stoğundan
// karşılanır (tüketim), aktarım değil; yetersizse işlem ENGELLENİR.
// page_depo_panel.js Store/App/DOM'a derinden bağlı olduğu için (hat_yonetim
// testleriyle aynı desende) kaynak kod üzerinde regex doğrulama yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_depo_panel.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- Hayalet stok transferi kaldırıldı --');
t('eski hammadde_deposu->uretim_ambari transferi KULLANILMIYOR',
  !/stokTransferEt\(tumStok, 'hammadde_deposu', 'uretim_ambari', 'yarimamul'/.test(src));
t('mevcut kontrolü artık uretim_ambari\'nin KENDİ stoğuna bakıyor',
  /App\.stokMiktarAmbar\(tumStok, 'uretim_ambari', 'yarimamul', t\.kalemRefId\)/.test(src));
t('hammadde_deposu ile karışık OR kontrolü KALDIRILDI',
  !/stokMiktarAmbar\(tumStok, 'hammadde_deposu', 'yarimamul'/.test(src));

console.log('\n-- Yetersiz stokta işlem artık ENGELLENİYOR --');
t('mevcut < miktar durumunda return ile işlem durduruluyor',
  /if \(mevcut < t\.miktar\) \{[\s\S]{0,200}return;\s*\}/.test(src));

console.log('\n-- Karşılama artık aynı ambar içi TÜKETİM (negatif güncelleme) --');
t('uretim_ambari kendi stoğundan negatif güncelleniyor (transfer değil, tüketim)',
  /App\.stokMiktarGuncelle\(tumStok, 'uretim_ambari', 'yarimamul', t\.kalemRefId, '', t\.kalemAdi, t\.birim \|\| 'ADET', -t\.miktar\)/.test(src));
t('artık sahte bir ambarTransferleri kaydı OLUŞTURULMUYOR (gerçek transfer yok)',
  !/kaynakAmbar: 'hammadde_deposu', hedefAmbar: 'uretim_ambari'/.test(src));
t('stok hareketi artık uretim_ambari üzerinde kaydediliyor',
  /ambar: 'uretim_ambari', kalemAdi: t\.kalemAdi, miktar: t\.miktar/.test(src));

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
