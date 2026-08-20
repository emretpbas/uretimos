// ── MASA / WORKSTATION HESAP TESTİ ──────────────────────────────────────────
// Referans: RDW.M.480145.03.98 — 6 kişilik Radical workstation alt kırılımı.
//     node testler/masa_hesap_test.js

const M = require('../masa_hesap.js');
let gecti = 0, kaldi = 0;
const es = (ad, beklenen, gercek) => {
  const ok = Math.abs(beklenen - gercek) < 0.01;
  console.log('  ' + (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad +
    (ok ? '' : '  \x1b[33mbeklenen ' + beklenen + ', gelen ' + gercek + '\x1b[0m'));
  ok ? gecti++ : kaldi++;
};
const dogru = (ad, k) => { console.log('  ' + (k ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + ad); k ? gecti++ : kaldi++; };

// ── 1) REFERANS ÜRÜN: RDW.M.480145 (6 kişilik, karşılıklı 3+3) ─────────────
console.log('\n\x1b[1mReferans ürün — RDW.M.480145.03.98 (6 kişilik workstation)\x1b[0m');
const r = M.hesapla({
  kisiSayisi: 6, dizilim: 'karsilikli',
  tablaBoy: 1600, tablaEn: 700, tablaKalinlik: 30, siraArasiBosluk: 50,
  ayakModeli: 'Iron', ayakYukseklik: 720, traversVar: true
});
// Ürün kodundaki 480145 = 4800 mm boy × 1450 mm derinlik
es('Toplam boy 4800 mm (kod: 480…)', 4800, r.ozet.toplamBoy);
es('Toplam derinlik 1450 mm (kod: …145)', 1450, r.ozet.toplamEn);
es('Toplam yükseklik 750 mm (720 ayak + 30 tabla)', 750, r.ozet.toplamYukseklik);
es('6 tabla', 6, r.paneller[0].adet);
es('Tabla net ölçüsü 700×1600', 700, r.paneller[0].netEn);
es('Tabla kalınlığı 30 mm', 30, r.paneller[0].kalinlik);
es('Minifix 192 adet (Excel ile birebir)', 192, r.hirdavat.find(x => /Minifix/.test(x.ad)).adet);
es('Köşe koruyucu 24 adet (Excel ile birebir)', 24, r.hirdavat.find(x => /Köşe/.test(x.ad)).adet);
es('Aksesuar 3 adet (Excel ile birebir)', 3, r.hirdavat.find(x => /Aksesuar/.test(x.ad)).adet);
es('Travers 6 adet (Excel ile birebir)', 6, r.metaller.find(m => m.rol === 'travers').adet);
es('Uç ayak (tek yönlü) 2 adet', 2, r.metaller.find(m => m.tipKod === 'tek_yon').adet);
dogru('Karşılıklı dizilimde ara ayak KUTU tipinde', !!r.metaller.find(m => m.tipKod === 'kutu'));
es('Sıra başına 3 tabla', 3, r.yerlesim.siraBasiTabla);
es('4 ayak konumu (3 tabla + 1)', 4, r.yerlesim.ayakKonumSayisi);

// ── 2) AYAK MODEL KÜTÜPHANESİ ──────────────────────────────────────────────
console.log('\n\x1b[1mAyak model kütüphanesi\x1b[0m');
dogru('5 model tanımlı: Iron, Titan, Nord, Trim, Flat',
  M.MODELLER.join(',') === 'Iron,Titan,Nord,Trim,Flat');
M.MODELLER.forEach(mk => {
  const md = M.AYAK_MODELLERI[mk];
  dogru(mk + ' → üç kullanım tipi (tek_yon/iki_yon/kutu)',
    !!(md.tipler.tek_yon && md.tipler.iki_yon && md.tipler.kutu));
});
const iron = M.hesapla({ kisiSayisi: 4, ayakModeli: 'Iron' });
const titan = M.hesapla({ kisiSayisi: 4, ayakModeli: 'Titan' });
dogru('Model değişince ayak adı değişiyor',
  iron.metaller[0].ad !== titan.metaller[0].ad && /Iron/.test(iron.metaller[0].ad) && /Titan/.test(titan.metaller[0].ad));
dogru('Alt reçetesi girilmemiş metal parça uyarı veriyor',
  r.uyarilar.some(u => /Alt reçetesi henüz girilmemiş/.test(u)));
dogru('Reçetesi olmayan parça receteEksik ile işaretli', r.metaller.every(m => m.receteEksik === true));

// ── 3) TEK SIRA DİZİLİM ────────────────────────────────────────────────────
console.log('\n\x1b[1mTek sıra dizilim\x1b[0m');
const ts = M.hesapla({ kisiSayisi: 4, dizilim: 'tek_sira', tablaBoy: 1400, tablaEn: 800 });
es('4 kişi tek sıra → boy 5600', 5600, ts.ozet.toplamBoy);
es('Tek sırada derinlik = tabla eni (800)', 800, ts.ozet.toplamEn);
es('5 ayak konumu (4 tabla + 1)', 5, ts.yerlesim.ayakKonumSayisi);
es('Tek sırada ara ayak 3 adet', 3, ts.metaller.find(m => m.tipKod === 'iki_yon').adet);
dogru('Tek sırada kutu ayak kullanılmıyor', !ts.metaller.find(m => m.tipKod === 'kutu'));

// ── 4) TEKLİ MASA ──────────────────────────────────────────────────────────
console.log('\n\x1b[1mTekli masa (sistemdeki RD.M.14080 düzeni)\x1b[0m');
const tek = M.hesapla({ kisiSayisi: 1, dizilim: 'tek_sira', tablaBoy: 1400, tablaEn: 800, tablaKalinlik: 30, perdeVar: true, perdeYukseklik: 350, perdeKalinlik: 18 });
es('1 tabla', 1, tek.paneller.find(p => p.rol === 'tabla').adet);
es('Tabla 800×1400', 800, tek.paneller.find(p => p.rol === 'tabla').netEn);
es('2 ayak konumu', 2, tek.yerlesim.ayakKonumSayisi);
es('İkisi de uç (tek yönlü) ayak', 2, tek.metaller.find(m => m.tipKod === 'tek_yon').adet);
dogru('Perde paneli üretildi', !!tek.paneller.find(p => p.rol === 'perde'));
es('Perde kalınlığı 18', 18, tek.paneller.find(p => p.rol === 'perde').kalinlik);

// ── 5) PANEL MALZEME VE KENAR BANDI ────────────────────────────────────────
console.log('\n\x1b[1mPanel bazlı malzeme ve kenar bandı\x1b[0m');
const pb = M.hesapla({
  kisiSayisi: 2, tablaBoy: 1600, tablaEn: 700, kesimPayi: 0,
  panelAyarlari: {
    tabla: { kalinlik: 25, hammaddeId: 'PL25', bantlar: { on: 'B1', arka: 'B1', sag: 'B1', sol: 'B1' } }
  }
});
const tb = pb.paneller.find(p => p.rol === 'tabla');
es('Panel ayarı kalınlığı geçersiz kılıyor (25)', 25, tb.kalinlik);
dogru('Plaka hammaddesi panele bağlandı', tb.hammaddeId === 'PL25');
dogru('4 kenarda da bant var', tb.bantIds.on && tb.bantIds.arka && tb.bantIds.sag && tb.bantIds.sol);
es('4 kenar bant metresi = çevre × adet / 1000', 2 * (tb.netEn + tb.netBoy) * tb.adet / 1000, tb.bantMetre);
const bantsiz = M.hesapla({ kisiSayisi: 1, panelAyarlari: { tabla: { bantlar: { on: 'B1' } } } });
const btb = bantsiz.paneller[0];
dogru('Atanmayan kenar boş kalıyor', btb.bantIds.on === 'B1' && !btb.bantIds.arka && !btb.bantIds.sag && !btb.bantIds.sol);
es('Tek ön kenar bandı = netBoy / 1000', btb.netBoy / 1000, btb.bantMetre);
es('Ayarsız panelin bant metresi 0', 0, M.hesapla({ kisiSayisi: 1 }).paneller[0].bantMetre);

// ── 6) PAKETLEME ───────────────────────────────────────────────────────────
console.log('\n\x1b[1mPaketleme (referans kural: tabla 2, ayak 2, travers 1)\x1b[0m');
es('6 tabla → 3 tabla paketi', 3, r.paketler.filter(p => /Tabla/.test(p.ad)).length);
es('6 travers → 6 travers paketi', 6, r.paketler.filter(p => /Travers/.test(p.ad)).length);
dogru('Paketler sıralı etiketli (PKT 1/n)', /^PKT 1\//.test(r.paketler[0].etiket));
dogru('Paketleme kapatılabiliyor', M.hesapla({ kisiSayisi: 4, paketleme: false }).paketler.length === 0);

// ── 7) ELLE AYAK ADEDİ VE SINIR DURUMLARI ──────────────────────────────────
console.log('\n\x1b[1mElle ayak adedi ve sınır durumları\x1b[0m');
const elle = M.hesapla({ kisiSayisi: 6, dizilim: 'karsilikli', ayakAdet: 6 });
es('Elle 6 ayak verildi → toplam 6', 6, elle.metaller.filter(m => m.rol === 'ayak').reduce((s, m) => s + m.adet, 0));
dogru('Elle müdahale uyarı olarak bildiriliyor', elle.uyarilar.some(u => /elle/i.test(u)));
const tekSayi = M.hesapla({ kisiSayisi: 5, dizilim: 'karsilikli' });
dogru('Karşılıklıda tek kişi sayısı uyarı veriyor', tekSayi.uyarilar.some(u => /tek/i.test(u)));
const uzun = M.hesapla({ kisiSayisi: 2, tablaBoy: 2000 });
dogru('2000 mm tablada orta destek uyarısı', uzun.uyarilar.some(u => /orta destek/i.test(u)));
const gecersiz = M.hesapla({ tablaBoy: 0, tablaEn: 0 });
dogru('Geçersiz ölçüde panel üretilmiyor', gecersiz.paneller.length === 0 && gecersiz.uyarilar.length > 0);

console.log('\n' + '─'.repeat(50));
if (kaldi === 0) { console.log('\x1b[1;32m✓ ' + gecti + ' kontrolün tamamı geçti\x1b[0m'); process.exit(0); }
console.log('\x1b[1;31m✗ ' + kaldi + ' kontrol başarısız (' + gecti + ' geçti)\x1b[0m'); process.exit(1);
