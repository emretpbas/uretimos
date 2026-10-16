// ════════════════════════════════════════════════════════════════════════════
// MONTAJ KILAVUZU ÜRETİCİ — STEP montaj ağacından sıra, BOM ve talimat
// ────────────────────────────────────────────────────────────────────────────
// STEP dosyası montaj HİYERARŞİSİNİ taşır: hangi parça hangi alt montajın
// altında, kaç adet. Bu bilgiden montaj sırası ve kılavuz iskeleti üretilebilir.
//
// NE ÜRETİR:
//   • Montaj sırası — alt montajlar önce, ana gövde sonra (derinlikten türetilir)
//   • Parça listesi (BOM) — balon numaralı, adetli
//   • Bağlantı elemanı ayrımı — vida/somun/pul ayrı bölümde toplanır
//   • Adım adım talimat iskeleti — yazdırılabilir HTML
//
// NE ÜRETMEZ — dürüst sınır:
//   3D PATLATILMIŞ GÖRSEL üretmez. STEP'in geometrisini çözmek CAD çekirdeği
//   ister (yüzey/katı modelleme); tarayıcıda güvenilir biçimde yapılamaz.
//   Görseller için elinizdeki SolidWorks makrosu (SW_AssemblyGuide) kullanılmalı
//   ya da kılavuza elle fotoğraf/ekran görüntüsü eklenmelidir. Kılavuzda her
//   adım için görsel yeri ayrılmıştır.
// ════════════════════════════════════════════════════════════════════════════
const MontajKilavuzu = (() => {

  // Bağlantı elemanı: montaj sırasında ayrı toplanır, adım üretmez.
  // Anahtar listesi SolidWorks makrosundaki ayrımla uyumlu tutuldu.
  const BAGLANTI_KALIBI = /vida|cıvata|civata|somun|pul\b|rondela|saplama|perçin|percin|screw|bolt|nut|washer|stud|rivet|\bpin\b|dowel|\bhex\b|dübel|dubel|minifix|eksantrik/i;

  // "YAN PANEL-1", "Raf-3" gibi CAD örnek numaralarını temizler
  function adiTemizle(ad) {
    let s = String(ad || '').trim();
    s = s.replace(/\.(step|stp|sldprt|sldasm|par|ipt)$/i, '');
    // Sondaki "-12" gibi örnek numarasını at (ad "-" ile bitmiyorsa)
    s = s.replace(/-\d+$/, '');
    return s.trim() || 'Adsız parça';
  }

  const baglantiMi = (ad) => BAGLANTI_KALIBI.test(String(ad || ''));

  // ── MONTAJ SIRASI ────────────────────────────────────────────────────────
  // Kural: EN DERİN alt montajlar önce kurulur, ana gövde en son.
  // Aynı seviyede olanlar CAD'deki sırayı korur — çizimi yapan mühendisin
  // sıralaması genelde anlamlıdır, alfabetik sıralamak onu bozar.
  function montajSirasi(agac) {
    if (!agac) return [];
    const adimlar = [];
    (function gez(d) {
      if (!d || !d.cocuklar) return;
      // Önce çocukların kendi alt montajları (derinlik öncelikli)
      d.cocuklar.forEach(c => { if (c.cocuklar && c.cocuklar.length) gez(c); });
      // Sonra bu düğümün kendi montajı
      const parcalar = [], baglantilar = [];
      d.cocuklar.forEach(c => {
        const kayit = { ad: adiTemizle(c.ad), adet: c.adet || 1, altMontajMi: !!(c.cocuklar && c.cocuklar.length) };
        if (baglantiMi(c.ad)) baglantilar.push(kayit); else parcalar.push(kayit);
      });
      if (parcalar.length || baglantilar.length) {
        adimlar.push({
          hedef: adiTemizle(d.ad),
          seviye: d.seviye || 0,
          anaMontajMi: (d.seviye || 0) === 0,
          parcalar, baglantilar
        });
      }
    })(agac);
    return adimlar.map((a, i) => ({ ...a, no: i + 1 }));
  }

  // ── PARÇA LİSTESİ (BOM) ──────────────────────────────────────────────────
  // Balon numarası verilir; aynı parça birden çok yerde geçiyorsa TEK satırda
  // toplanır (montaj kılavuzunda balon numarası parça tipini gösterir).
  function parcaListesi(dugumler) {
    const harita = new Map();
    (dugumler || []).forEach(d => {
      const ad = adiTemizle(d.ad);
      const k = ad.toLocaleUpperCase('tr');
      const v = harita.get(k) || {
        ad, adet: 0, baglanti: baglantiMi(ad),
        altMontaj: !d.yaprakMi
      };
      v.adet += d.toplamAdet || 1;
      harita.set(k, v);
    });
    // Sıra: alt montajlar → parçalar → bağlantı elemanları
    const liste = [...harita.values()].sort((a, b) => {
      const p = (x) => x.baglanti ? 2 : (x.altMontaj ? 0 : 1);
      return p(a) - p(b) || b.adet - a.adet || a.ad.localeCompare(b.ad, 'tr');
    });
    return liste.map((x, i) => ({ ...x, balon: i + 1 }));
  }

  // ── TAHMİNİ SÜRE ─────────────────────────────────────────────────────────
  // Kaba bir tahmin: her parça yerleştirme ~1,5 dk, her bağlantı elemanı ~0,5 dk.
  // Gerçek süre montaj karmaşıklığına bağlıdır; bu yalnızca planlama için
  // kaba bir büyüklük verir ve kılavuzda "tahmini" olarak işaretlenir.
  function sureTahmini(adimlar) {
    let dk = 0;
    (adimlar || []).forEach(a => {
      a.parcalar.forEach(p => { dk += 1.5 * (p.adet || 1); });
      a.baglantilar.forEach(b => { dk += 0.5 * (b.adet || 1); });
    });
    return Math.round(dk);
  }

  // ── KILAVUZ ÜRET ─────────────────────────────────────────────────────────
  function uret(stepSonuc, secenek) {
    const ay = secenek || {};
    if (!stepSonuc || !stepSonuc.agac) {
      return { ok: false, hata: 'Montaj ağacı okunamadı.' };
    }
    const adimlar = montajSirasi(stepSonuc.agac);
    const bom = parcaListesi(stepSonuc.dugumler);
    return {
      ok: true,
      urunAdi: ay.urunAdi || (stepSonuc.kok && stepSonuc.kok.ad) || 'Ürün',
      urunKodu: ay.urunKodu || '',
      adimlar, bom,
      sureDk: sureTahmini(adimlar),
      istatistik: stepSonuc.istatistik || {}
    };
  }

  // ── YAZDIRILABİLİR HTML ──────────────────────────────────────────────────
  function htmlUret(k, firma) {
    const F = firma || {};
    const esc = (x) => String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const balonOf = (ad) => {
      const b = k.bom.find(x => x.ad.toLocaleUpperCase('tr') === String(ad).toLocaleUpperCase('tr'));
      return b ? b.balon : '';
    };

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${esc(k.urunAdi)} — Montaj Kılavuzu</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; color: #222; line-height: 1.5; }
  h1 { font-size: 20px; color: #1f4e79; margin: 0 0 4px; }
  h2 { font-size: 14px; color: #1f4e79; border-bottom: 2px solid #1f4e79;
       padding-bottom: 4px; margin: 22px 0 10px; }
  .ust { display: flex; justify-content: space-between; align-items: flex-start;
         border-bottom: 2px solid #1f4e79; padding-bottom: 10px; margin-bottom: 14px; }
  .kutu { background: #f5f7fa; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #1f4e79; color: #fff; padding: 6px; font-size: 10.5px; text-align: left; }
  td { padding: 5px 6px; border-bottom: 1px solid #e3e3e3; }
  .r { text-align: right; } .c { text-align: center; }
  .balon { display: inline-block; width: 20px; height: 20px; line-height: 20px;
           border-radius: 50%; background: #1f4e79; color: #fff; text-align: center;
           font-size: 10px; font-weight: bold; }
  .adim { border: 1px solid #d5d9e0; border-radius: 8px; padding: 10px 12px;
          margin-bottom: 12px; page-break-inside: avoid; }
  .adim-bas { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .adim-no { width: 26px; height: 26px; line-height: 26px; border-radius: 50%;
             background: #1f4e79; color: #fff; text-align: center; font-weight: bold; }
  .gorsel { border: 1px dashed #b9c0cc; border-radius: 6px; height: 120px;
            display: flex; align-items: center; justify-content: center;
            color: #97a0ae; font-size: 10.5px; margin-top: 8px; }
  .not { border-left: 3px solid #f0ad4e; background: #fff8ec; padding: 7px 10px;
         font-size: 10.5px; margin-top: 8px; }
  .uyari { border-left: 3px solid #c62828; background: #fdecea; padding: 7px 10px;
           font-size: 10.5px; margin: 10px 0; }
  .bagl { background: #f0f4f9; }
  @media print { .gizle { display: none; } }
</style></head><body>

<div class="ust">
  <div>
    <h1>${esc(k.urunAdi)}</h1>
    <div style="font-size:12px;color:#555">Montaj Kılavuzu${k.urunKodu ? ' · ' + esc(k.urunKodu) : ''}</div>
  </div>
  <div style="text-align:right;font-size:10.5px;color:#555">
    ${F.unvan ? '<b>' + esc(F.unvan) + '</b><br>' : ''}
    ${new Date().toLocaleDateString('tr')}<br>
    ${k.adimlar.length} adım · ${k.bom.length} parça tipi
  </div>
</div>

<div class="kutu">
  <b>Montaja başlamadan önce</b>
  <ul style="margin:6px 0 0 18px;padding:0">
    <li>Tüm parçaları listeyle karşılaştırıp eksik olup olmadığını kontrol edin.</li>
    <li>Parçaları hasara karşı yumuşak bir zeminde açın.</li>
    <li>Vidaları önce elle tutturun, hizalama tamamlanmadan sıkmayın.</li>
    <li>Tahmini montaj süresi: <b>~${k.sureDk} dakika</b> (deneyimli montajcı için)</li>
  </ul>
</div>

<h2>1. Parça Listesi</h2>
<table>
  <tr><th class="c" style="width:44px">Balon</th><th>Parça</th><th class="r" style="width:70px">Adet</th><th style="width:110px">Tip</th></tr>
  ${k.bom.map(b => `<tr class="${b.baglanti ? 'bagl' : ''}">
    <td class="c"><span class="balon">${b.balon}</span></td>
    <td>${esc(b.ad)}</td>
    <td class="r">${b.adet}</td>
    <td>${b.baglanti ? 'Bağlantı elemanı' : (b.altMontaj ? 'Alt montaj' : 'Parça')}</td>
  </tr>`).join('')}
</table>

<h2>2. Montaj Adımları</h2>
${k.adimlar.map(a => `
  <div class="adim">
    <div class="adim-bas">
      <div class="adim-no">${a.no}</div>
      <div><b>${a.anaMontajMi ? 'Ana montaj: ' : 'Alt montaj: '}${esc(a.hedef)}</b></div>
    </div>
    ${a.parcalar.length ? `<table>
      <tr><th class="c" style="width:44px">Balon</th><th>Yerleştirilecek parça</th><th class="r" style="width:70px">Adet</th></tr>
      ${a.parcalar.map(p => `<tr>
        <td class="c"><span class="balon">${balonOf(p.ad)}</span></td>
        <td>${esc(p.ad)}${p.altMontajMi ? ' <i>(önce kendi montajı tamamlanmalı)</i>' : ''}</td>
        <td class="r">${p.adet}</td></tr>`).join('')}
    </table>` : ''}
    ${a.baglantilar.length ? `<div style="margin-top:6px;font-size:10.5px">
      <b>Bağlantı elemanları:</b>
      ${a.baglantilar.map(b => esc(b.ad) + ' × ' + b.adet).join(' · ')}
    </div>` : ''}
    <div class="gorsel">Bu adımın görseli — SolidWorks patlatılmış görüntüsü veya fotoğraf ekleyin</div>
    <div class="not"><b>Montaj notu:</b> _______________________________________________
      <br>(sıkma torku, hizalama ölçüsü, dikkat edilecek nokta)</div>
  </div>`).join('')}

<h2>3. Kontrol Listesi</h2>
<table>
  <tr><th style="width:36px" class="c">✓</th><th>Kontrol</th></tr>
  ${[
    'Tüm parçalar listeye göre eksiksiz takıldı',
    'Bağlantı elemanlarının tamamı sıkıldı',
    'Hareketli parçalar serbestçe çalışıyor',
    'Görünen yüzeylerde çizik/hasar yok',
    'Ürün düz zeminde sallanmıyor',
    'Etiket ve kullanım kılavuzu pakete kondu'
  ].map(x => `<tr><td class="c">☐</td><td>${esc(x)}</td></tr>`).join('')}
</table>

<div class="uyari">
  <b>Güvenlik:</b> Montaj sırasında koruyucu eldiven kullanın. Ağır parçaları
  iki kişi taşıyın. Elektrikli el aletlerini yalnızca yetkili personel kullanmalıdır.
</div>

<div style="margin-top:20px;display:flex;justify-content:space-between;font-size:10.5px">
  <div>Montajı yapan: ______________________</div>
  <div>Kontrol eden: ______________________</div>
  <div>Tarih: ____________</div>
</div>

</body></html>`;
  }

  function yazdir(k, firma) {
    const html = htmlUret(k, firma);
    const w = window.open('', '_blank');
    if (!w) throw new Error('Açılır pencere engellendi. Tarayıcı ayarlarından izin verin.');
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) { } }, 400);
  }

  // BOM'u Excel'e aktar
  function excelIndir(k) {
    if (!window.XLSX) throw new Error('Excel kütüphanesi yüklenemedi.');
    const S = [[k.urunAdi + ' — Montaj Parça Listesi'],
      ['Tarih', new Date().toLocaleDateString('tr')],
      ['Tahmini süre (dk)', k.sureDk], []];
    S.push(['Balon', 'Parça', 'Adet', 'Tip']);
    k.bom.forEach(b => S.push([b.balon, b.ad, b.adet,
      b.baglanti ? 'Bağlantı elemanı' : (b.altMontaj ? 'Alt montaj' : 'Parça')]));
    S.push([]); S.push(['MONTAJ SIRASI']);
    S.push(['Adım', 'Hedef', 'Parçalar', 'Bağlantı elemanları']);
    k.adimlar.forEach(a => S.push([
      a.no, a.hedef,
      a.parcalar.map(p => p.ad + ' ×' + p.adet).join(' · '),
      a.baglantilar.map(b => b.ad + ' ×' + b.adet).join(' · ')
    ]));
    const ws = XLSX.utils.aoa_to_sheet(S);
    ws['!cols'] = [{ wch: 8 }, { wch: 40 }, { wch: 10 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Montaj Kılavuzu');
    XLSX.writeFile(wb, (k.urunKodu || k.urunAdi || 'montaj').replace(/[^\w.-]/g, '_') + '_montaj.xlsx');
  }

  return { uret, montajSirasi, parcaListesi, sureTahmini, baglantiMi, adiTemizle, htmlUret, yazdir, excelIndir };
})();

if (typeof module !== 'undefined') module.exports = MontajKilavuzu;
