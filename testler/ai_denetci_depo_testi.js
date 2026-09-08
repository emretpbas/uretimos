// ── AI DENETÇİSİ — DEPO BULGULARI (T50: Depo ekranı denetimi) ──────────────
// BULGU 1: ai_denetci.js'teki "kritik stok" hesabı (mrp_motor.js'teki AYNI
// bulgu gibi) ambar filtresi olmadan TÜM stokRaf satırlarını topluyordu —
// iade_ambari'ndaki (kalite reddi, ÜRETİMDE KULLANILAMAZ) miktar da "elde
// stok" sayılıp kritik seviye karşılaştırmasını yanıltıyor, gerekli otomatik
// satınalma talebinin hiç açılmamasına yol açabiliyordu.
// BULGU 2: Depo Girişi ekranındaki "eksik teslimat... Satınalma birimine
// bildirim gönderildi" toast'u YALANDI — hiçbir yere yazılmıyordu. Artık
// ai_denetci.js'in periyodik taramasında gerçek bir "eksik teslimat" bulgusu
// üretiliyor (Bildirim Merkezi'ne düşer).
// ai_denetci.js KpiMotor'a bağımlı olduğundan (tara() bütünüyle çağrılamaz)
// bu iki değişikliğin MANTIĞI kaynak koddan izole edilip gerçek verilerle
// doğrulanır; kaynak koddaki ilgili satırların DEĞİŞMEDİĞİ regex ile kilitlenir.
const fs = require('fs'), path = require('path');
const aiSrc = fs.readFileSync(path.join(__dirname, '..', 'ai_denetci.js'), 'utf8');
const mrpSrc = fs.readFileSync(path.join(__dirname, '..', 'mrp_motor.js'), 'utf8');

let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- Kaynak kilit: kritik stok hesabı artık ambar filtresi kullanıyor --');
t('ai_denetci.js: kritikDusenler hesabı yalnızca hammadde_deposu\'nu sayıyor',
  /s\.tip === 'hammadde' && s\.refId === ks\.hammaddeId && s\.ambar === 'hammadde_deposu'/.test(aiSrc));
t('mrp_motor.js: eldeki hesabı yalnızca hammadde_deposu\'nu sayıyor',
  /s\.tip === 'hammadde' && s\.refId === hmId && s\.ambar === 'hammadde_deposu'/.test(mrpSrc));

console.log('\n-- Kaynak kilit: yeni "eksik teslimat" bulgusu doğru koşullarla tanımlı --');
t('eksikTeslimatlar filtresi eksikMiktar>0 VE durum tamamlandi/reddedildi DEĞİL şartını arıyor',
  /\(g\.eksikMiktar \|\| 0\) > 0 && g\.durum !== 'tamamlandi' && g\.durum !== 'reddedildi'/.test(aiSrc));
t('bulgu satinalma birimine, uyari seviyesinde ekleniyor',
  /birim: 'satinalma', seviye: 'uyari', baslik: eksikTeslimatlar\.length \+ ' depo girişinde EKSİK TESLİMAT var'/.test(aiSrc));
t('tara() artık depoGirisleri\'ni de çekiyor (Store.depoGirisleri.all())', /Store\.depoGirisleri\.all\(\)/.test(aiSrc));

console.log('\n-- Sayısal doğruluk: kritik stok hesabı (iade_ambari HARİÇ tutuluyor) --');
{
  // ai_denetci.js'teki GERÇEK reduce/filter ifadesiyle birebir aynı mantık
  // (kaynaktan yukarıda regex ile doğrulandı) — burada gerçek verilerle test edilir.
  const stokRaf = [
    { tip: 'hammadde', refId: 'HM1', ambar: 'hammadde_deposu', miktar: 5 },
    { tip: 'hammadde', refId: 'HM1', ambar: 'iade_ambari', miktar: 100 },     // KULLANILAMAZ, sayılmamalı
    { tip: 'hammadde', refId: 'HM1', ambar: 'uretim_ambari', miktar: 50 },    // farklı ambar, sayılmamalı
    { tip: 'hammadde', refId: 'HM2', ambar: 'hammadde_deposu', miktar: 3 }
  ];
  const stokHesapla = (hammaddeId) => stokRaf.filter(s => s.tip === 'hammadde' && s.refId === hammaddeId && s.ambar === 'hammadde_deposu')
    .reduce((a, s) => a + (s.miktar || 0), 0);
  t('HM1 gerçek kullanılabilir stok = 5 (iade_ambari\'ndaki 100 ve uretim_ambari\'ndaki 50 HARİÇ)', stokHesapla('HM1') === 5);
  t('kritik seviye 10 ise HM1 (gerçek stok 5) KRİTİK sayılır (eski bug: 5+100+50=155 ile kritik hiç tetiklenmezdi)', stokHesapla('HM1') < 10);
  t('HM2 gerçek stok = 3 (tek satırdan)', stokHesapla('HM2') === 3);
}

console.log('\n-- Sayısal doğruluk: eksik teslimat bulgusu doğru kayıtları seçiyor --');
{
  const depoGirisleri = [
    { id: 'DG1', kalemAdi: 'Suntalam 18mm', eksikMiktar: 20, birim: 'M2', irsaliyeNo: 'IRS-1', durum: 'depo_onayladi_kalite_bekliyor' }, // AKTİF eksik -> bulguya girmeli
    { id: 'DG2', kalemAdi: 'Vida', eksikMiktar: 0, birim: 'ADET', durum: 'depo_onayladi_kalite_bekliyor' },   // eksik yok -> girmemeli
    { id: 'DG3', kalemAdi: 'MDF Lam', eksikMiktar: 10, birim: 'M2', durum: 'tamamlandi' },                    // eksik VAR ama SÜREÇ TAMAMLANMIŞ -> girmemeli
    { id: 'DG4', kalemAdi: 'Kenar Bant', eksikMiktar: 5, birim: 'METRE', durum: 'reddedildi' },               // reddedilmiş -> girmemeli
    { id: 'DG5', kalemAdi: 'Toz Boya', eksikMiktar: 8, birim: 'KG', durum: 'karantina' }                      // AKTİF (karantinada) eksik -> bulguya girmeli
  ];
  const eksikTeslimatlar = depoGirisleri.filter(g => (g.eksikMiktar || 0) > 0 && g.durum !== 'tamamlandi' && g.durum !== 'reddedildi');
  t('yalnızca 2 kayıt (DG1, DG5) hâlâ AKTİF eksik teslimat olarak işaretleniyor', eksikTeslimatlar.length === 2);
  t('DG1 dahil', eksikTeslimatlar.some(g => g.id === 'DG1'));
  t('DG5 (karantinadaki eksik) dahil', eksikTeslimatlar.some(g => g.id === 'DG5'));
  t('DG2 (eksik yok) hariç', !eksikTeslimatlar.some(g => g.id === 'DG2'));
  t('DG3 (tamamlanmış) hariç — süreç bitmiş, artık Satınalma\'nın acil ilgisini gerektirmiyor', !eksikTeslimatlar.some(g => g.id === 'DG3'));
  t('DG4 (reddedilmiş) hariç', !eksikTeslimatlar.some(g => g.id === 'DG4'));
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
