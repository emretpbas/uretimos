const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
let fail = 0;
function assert(c, m) { if (!c) { console.error('BAŞARISIZ:', m); fail++; } else console.log('OK:', m); }
const ALL = fs.readFileSync('/tmp/scripts_import.txt','utf-8').trim().split('\n');
function buildHtml() {
  let h = fs.readFileSync(path.join(__dirname,'index.html'),'utf-8');
  return h.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script>App\.init\(\);<\/script>/,'');
}
(async () => {
  const dom = new JSDOM(buildHtml(), { url: 'http://localhost:8000/index.html', runScripts: 'dangerously' });
  const w = dom.window;
  let errs = [];
  w.addEventListener('error', e => errs.push(e.error ? e.error.stack : e.message));
  w.open = () => ({ document: { write: () => {}, close: () => {} } });
  for (const f of ALL) { const s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(__dirname, f), 'utf-8'); w.document.body.appendChild(s); }
  const ex = w.document.createElement('script'); ex.textContent = 'window.App=App;window.Store=Store;window.PageModules=PageModules;'; w.document.body.appendChild(ex);
  await w.App.init(); await new Promise(r => setTimeout(r, 500));
  w.document.getElementById('ln-kullanici').value = 'arge';
  w.document.getElementById('ln-sifre').value = 'arge1234';
  w.document.getElementById('ln-giris').click();
  await new Promise(r => setTimeout(r, 200));

  console.log('--- 1. DOSYAYI OKU + PARSE ET ---');
  const buf = fs.readFileSync('/mnt/user-data/uploads/TF_M_220100_D_69_97.xlsx');
  const uint8 = new w.Uint8Array(buf);
  const wb = w.XLSX.read(uint8, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = w.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('Toplam satır:', rows.length);

  // Kartlar sayfasına git, import modalını aç
  await w.App.goTo('kartlar'); await new Promise(r => setTimeout(r, 200));
  const importBtn = w.document.getElementById('kt-excel-import');
  assert(!!importBtn, 'İçe aktar butonu var');
  importBtn.click(); await new Promise(r => setTimeout(r, 150));

  // Dosya seçimini simüle et — onchange handler'a sahte event
  // parseExceleReceteRows'a doğrudan erişim yok, modal akışını simüle etmek için
  // File nesnesi oluşturamayız jsdom'da kolayca; bunun yerine parse fonksiyonunu
  // dolaylı tetikleyelim: rows'u elde ettik, renderImportPreview akışına girmek
  // için page_kartlar içindeki fonksiyona ulaşmalıyız. Modal handler'ı elle çalıştır:
  const fileInput = w.document.getElementById('ei-file');
  assert(!!fileInput, 'Dosya input alanı var');

  // File + arrayBuffer polyfill
  const fakeFile = { name: 'TF_M_220100_D_69_97.xlsx', arrayBuffer: async () => uint8.buffer };
  Object.defineProperty(fileInput, 'files', { value: [fakeFile] });
  fileInput.onchange({ target: fileInput });
  await new Promise(r => setTimeout(r, 800));

  const statusEl = w.document.getElementById('ei-status');
  const bodyHtml = w.document.body.innerHTML;
  console.log('Status:', statusEl ? statusEl.textContent : '(modal değişti)');
  const onizlemeAcik = bodyHtml.includes('İçe Aktarma Önizlemesi') || bodyHtml.includes('ei-confirm');
  assert(onizlemeAcik, 'Önizleme ekranı açıldı');

  if (onizlemeAcik) {
    console.log('\n--- 2. İÇE AKTAR VE KAYDET ---');
    const confirmBtn = w.document.getElementById('ei-confirm');
    assert(!!confirmBtn, 'Onay butonu var');
    confirmBtn.click();
    await new Promise(r => setTimeout(r, 1500));

    console.log('\n--- 3. VERİYİ DOĞRULA ---');
    const urunler = await w.Store.urunler.all();
    const tfUrun = urunler.find(u => u.kod === 'TF.M.220100.D.69.97');
    assert(!!tfUrun, 'Ürün oluştu: ' + (tfUrun ? tfUrun.kod : 'YOK'));

    const receteler = await w.Store.receteler.all();
    const kokRecete = tfUrun ? receteler.find(r => r.urunId === tfUrun.id) : null;
    assert(!!kokRecete, 'Kök reçete oluştu');
    if (kokRecete) {
      console.log('Kök reçete kalem sayısı:', kokRecete.kalemler.length);
      assert(kokRecete.kalemler.length === 5, 'Kök reçetede 5 paket kalemi var: ' + kokRecete.kalemler.length);
    }

    const paketler = await w.Store.paketler.all();
    const tfPaketler = paketler.filter(p => p.kod && p.kod.startsWith('TFM.220100'));
    console.log('TF paketleri:', tfPaketler.map(p => p.kod));
    assert(tfPaketler.length === 5, '5 paket kartı oluştu: ' + tfPaketler.length);

    // PKT05 kendine-referans döngü kontrolü
    const pkt05 = paketler.find(p => p.kod === 'TFM.220100.D.PKT05.97.97');
    if (pkt05) {
      const pkt05Recete = receteler.find(r => r.paketId === pkt05.id);
      if (pkt05Recete) {
        const kendineReferans = pkt05Recete.kalemler.find(k => k.refId === pkt05.id);
        assert(!kendineReferans, 'PKT05 reçetesinde KENDİNE REFERANS YOK (döngü engellendi)');
        console.log('PKT05 kalemleri:', pkt05Recete.kalemler.map(k => k.tip + ':' + k.refId));
      }
    }

    // Maliyet hesaplanabiliyor mu (döngü çökertmiyor mu)?
    console.log('\n--- 4. MALİYET HESABI (döngü testi) ---');
    const yarimamuller = await w.Store.yarimamuller.all();
    const altMontajlar = await w.Store.altMontajlar.all();
    const hammaddeler = await w.Store.hammaddeler.all();
    const rotalar = await w.Store.rotalar.all();
    try {
      const sonuc = w.App.urunMaliyetHesapla(tfUrun, receteler, yarimamuller, hammaddeler, rotalar, w.App.state.ayarlar, altMontajlar, urunler, paketler);
      assert(sonuc.toplam > 0, 'Maliyet hesaplandı: ' + sonuc.toplam.toFixed(2) + ' TL');
      console.log('Eksik kalemler:', sonuc.eksikKalemler.length ? sonuc.eksikKalemler.map(e => e.ad) : 'YOK');
    } catch (e) {
      assert(false, 'Maliyet hesabı ÇÖKTÜ: ' + e.message);
    }
  }

  console.log('\n=== JS HATALARI ===', errs.length ? errs : 'YOK');
  console.log('=== SONUÇ:', fail === 0 ? 'TÜM TESTLER BAŞARILI' : fail + ' BAŞARISIZ', '===');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('GENEL HATA:', e.message, e.stack); process.exit(1); });
