// BULGU (T3-28): page_uygunsuzluk_dof.js'in ".ncr-kapat" tıklama handler'ı
// bağlı DÖF'ün (Düzeltici/Önleyici Faaliyet) durumunu veya kök neden
// analizinin girilip girilmediğini HİÇ kontrol etmiyordu — bir NCR'ye
// bağlı DÖF hâlâ 'acik' (kök neden bile girilmemiş) ya da 'aksiyon_alindi'
// (kök neden girilmiş ama henüz kapatılmamış) durumundayken NCR serbestçe
// 'kapandi' yapılabiliyordu. Bu, kalite sorununun kök nedeni araştırılmadan/
// önleyici aksiyon alınmadan unutulmasına yol açıyordu.
// Düzeltme: NCR kapatılmadan önce n.dofId varsa bağlı DÖF bulunup durumu
// kontrol ediliyor; DÖF 'kapandi' değilse NCR kapatma işlemi hata
// mesajıyla ENGELLENİYOR (confirmDialog hiç açılmıyor). DÖF'ü olmayan
// ya da zaten kapanmış DÖF'ü olan NCR'ler eskisi gibi serbestçe kapatılabilir.
// page_uygunsuzluk_dof.js Store/DOM'a derinden bağlı olduğu için (diğer
// page_* testleriyle aynı desende) kaynak kod üzerinde regex doğrulama
// yapılır.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'page_uygunsuzluk_dof.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- page_uygunsuzluk_dof.js: ncr-kapat artık bağlı DÖF durumunu kontrol ediyor --');
t('n.dofId varsa bağlı DÖF aranıyor',
  /if \(n\.dofId\) \{\s*\n\s*const dof = dofler\.find\(x => x\.id === n\.dofId\);/.test(src));
t('DÖF kapanmadıysa (acik/aksiyon_alindi) kapatma ENGELLENİYOR',
  /if \(dof && dof\.durum !== 'kapandi'\) \{\s*\n\s*App\.toast\('Bu uygunsuzluğa bağlı DÖF \(' \+ dof\.no \+ '\) henüz kapanmadı/.test(src));
t('engel durumunda return ile confirmDialog\'a hiç gidilmiyor',
  /App\.toast\('Bu uygunsuzluğa bağlı DÖF[\s\S]{0,20}henüz kapanmadı[\s\S]{0,80}\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*\}\s*\n\s*App\.confirmDialog\('Bu uygunsuzluk kaydını kapatmak istediğinize emin misiniz\?'/.test(src));
t('wireNcrTab hâlâ dofler parametresini alıyor (imza değişmedi)',
  /function wireNcrTab\(ncrler, dofler, render, main\) \{/.test(src));
t('DÖF yoksa veya kapalıysa NCR yine kapatılabiliyor (confirmDialog + durum=kapandi hâlâ var)',
  /App\.confirmDialog\('Bu uygunsuzluk kaydını kapatmak istediğinize emin misiniz\?', async \(\) => \{\s*\n\s*n\.durum = 'kapandi';/.test(src));

console.log('\n-- Davranış simülasyonu: handler mantığı gerçek verilerle taklit ediliyor --');
{
  // ncr-kapat handler'ının çekirdek mantığını (DOM/App'ten bağımsız) izole
  // edip gerçek NCR/DÖF kombinasyonlarıyla doğruluyoruz.
  function kapatmaEngelliMi(n, dofler) {
    if (n.dofId) {
      const dof = dofler.find(x => x.id === n.dofId);
      if (dof && dof.durum !== 'kapandi') return true;
    }
    return false;
  }

  const dofler = [
    { id: 'DOF-1', no: 'DOF-2026-001', durum: 'acik' },
    { id: 'DOF-2', no: 'DOF-2026-002', durum: 'aksiyon_alindi' },
    { id: 'DOF-3', no: 'DOF-2026-003', durum: 'kapandi' }
  ];

  t('bağlı DÖF acik iken kapatma ENGELLİ', kapatmaEngelliMi({ id: 'NCR-1', dofId: 'DOF-1' }, dofler) === true);
  t('bağlı DÖF aksiyon_alindi iken kapatma ENGELLİ', kapatmaEngelliMi({ id: 'NCR-2', dofId: 'DOF-2' }, dofler) === true);
  t('bağlı DÖF kapandi iken kapatma SERBEST', kapatmaEngelliMi({ id: 'NCR-3', dofId: 'DOF-3' }, dofler) === false);
  t('hiç DÖF bağlı değilse kapatma SERBEST', kapatmaEngelliMi({ id: 'NCR-4', dofId: null }, dofler) === false);
  t('dofId var ama DÖF kaydı bulunamıyorsa (silinmiş/eksik) kapatma SERBEST (dof undefined -> engellenmez)',
    kapatmaEngelliMi({ id: 'NCR-5', dofId: 'DOF-YOK' }, dofler) === false);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
