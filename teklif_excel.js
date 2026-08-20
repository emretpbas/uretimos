// ════════════════════════════════════════════════════════════════════════════
// KURUMSAL TEKLİF ÇIKTISI — Excel (antetli, logolu)
// ────────────────────────────────────────────────────────────────────────────
// Müşteriye gidecek teklifi Excel dosyası olarak üretir. İki logo desteklenir:
// kendi firma logonuz ve müşteri logosu (bazı kurumsal müşteriler kendi
// antetlerinde teklif ister).
//
// ÖNEMLİ: Maliyet bilgisi bu dosyaya ASLA yazılmaz. Müşteri teklifi ile yönetim
// maliyet raporu ayrı belgelerdir; karışması ticari zarar doğurur.
// ════════════════════════════════════════════════════════════════════════════
const TeklifExcel = (() => {

  // Logolar yerel olarak saklanır (base64). Sunucuya yük bindirmemek için
  // 400 KB üstü görseller reddedilir — antet için fazlasıyla yeterli.
  const AZAMI_LOGO = 400 * 1024;

  async function logoOku(dosya) {
    if (!dosya) return { ok: false, hata: 'Dosya seçilmedi.' };
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(dosya.type)) {
      return { ok: false, hata: 'Yalnızca PNG, JPG, GIF veya WEBP yükleyebilirsiniz.' };
    }
    if (dosya.size > AZAMI_LOGO) {
      return { ok: false, hata: `Logo çok büyük (${Math.round(dosya.size / 1024)} KB). En fazla 400 KB olmalı.` };
    }
    const veri = await new Promise((cz, rd) => {
      const fr = new FileReader();
      fr.onload = () => cz(fr.result);
      fr.onerror = () => rd(new Error('Dosya okunamadı.'));
      fr.readAsDataURL(dosya);
    });
    return { ok: true, veri, boyut: dosya.size, ad: dosya.name };
  }

  // ── EXCEL ÜRETİMİ ────────────────────────────────────────────────────────
  // SheetJS'in temel sürümü hücre biçimlendirmeyi sınırlı destekler; bu yüzden
  // yapı sütun genişlikleri, birleştirilmiş hücreler ve düzenle kurulur.
  // NOT: Logo görselleri XLSX'e gömülemez (SheetJS ücretsiz sürümünde resim
  // desteği yok) — bu yüzden logolar HTML/yazdırma çıktısında görünür,
  // Excel'de firma bilgileri metin olarak yer alır. Bunu gizlemek yerine
  // kullanıcıya açıkça bildiriyoruz.
  function excelUret(teklif, hesap, firma, musteri) {
    if (!window.XLSX) throw new Error('Excel kütüphanesi yüklenemedi.');
    const S = [];
    const bos = () => S.push([]);
    const F = firma || {};
    const M = musteri || {};

    // ANTET
    S.push([F.unvan || 'FİRMA ADI', '', '', '', '', 'TEKLİF FORMU']);
    S.push([F.adres || '', '', '', '', '', 'Teklif No:', teklif.kod || '']);
    S.push([(F.telefon ? 'Tel: ' + F.telefon : ''), '', '', '', '', 'Tarih:',
      new Date().toLocaleDateString('tr')]);
    S.push([(F.eposta || ''), '', '', '', '', 'Geçerlilik:', teklif.gecerlilik || '30 gün']);
    if (F.vergiDairesi || F.vergiNo) {
      S.push([`${F.vergiDairesi || ''} V.D. ${F.vergiNo || ''}`.trim()]);
    }
    bos();

    // MÜŞTERİ
    S.push(['SAYIN']);
    S.push([M.unvan || teklif.musteriAdi || '']);
    if (M.adres) S.push([M.adres]);
    if (teklif.irtibatKisi) S.push(['İlgili: ' + teklif.irtibatKisi +
      (teklif.irtibatTelefon ? ' · ' + teklif.irtibatTelefon : '')]);
    bos();

    if (teklif.konu) { S.push(['Konu:', teklif.konu]); bos(); }

    // KALEMLER — mahal bazlı ise mahal başlıklarıyla
    S.push(['S.No', 'Açıklama', 'Miktar', 'Birim', 'Birim Fiyat', 'İsk %', 'Tutar']);
    let sira = 0;
    if (teklif.mahaller && teklif.mahaller.length) {
      teklif.mahaller.forEach((m, mi) => {
        const mh = hesap.mahaller[mi];
        S.push(['', (m.ad || '').toUpperCase() + (m.adet > 1 ? `  (× ${m.adet})` : ''), '', '', '', '', '']);
        (m.kalemler || []).forEach((k, ki) => {
          sira++;
          S.push([sira, k.ad || '', k.miktar || 0, k.birim || 'ADET',
            +k.listeFiyati || 0, +k.iskontoYuzde || 0, mh.detay[ki].satirNet]);
        });
        if (m.adet > 1) {
          S.push(['', `${m.ad} toplamı (birim ${mh.birimNet} × ${m.adet})`, '', '', '', '', mh.toplamNet]);
        }
      });
    } else {
      (teklif.kalemler || []).forEach(k => {
        sira++;
        S.push([sira, k.ad || '', k.miktar || 0, k.birim || 'ADET',
          +k.birimFiyat || 0, +k.iskontoYuzde || 0, +k.tutar || 0]);
      });
    }
    bos();

    // TOPLAMLAR
    const ekle = (etiket, deger) => S.push(['', '', '', '', '', etiket, deger]);
    ekle('Ara Toplam', hesap.araToplamNet != null ? hesap.araToplamNet : (hesap.araToplam || 0));
    if (hesap.dipIskontoTutar) ekle(`Dip İskonto (%${hesap.dipIskontoOran})`, -hesap.dipIskontoTutar);
    if (hesap.yansiyanGider) ekle('Montaj / Nakliye', hesap.yansiyanGider);
    ekle('Toplam (KDV hariç)', hesap.matrah);
    ekle(`KDV (%${teklif.kdvOrani || 20})`, hesap.kdv);
    ekle('GENEL TOPLAM', hesap.genelToplam);
    bos();

    // KOŞULLAR
    S.push(['TEKLİF KOŞULLARI']);
    (teklif.kosullar || [
      'Fiyatlarımıza KDV dahil değildir.',
      'Teslim süresi sipariş onayından itibaren başlar.',
      'Ödeme koşulu: mutabakata göre.',
      'Bu teklif belirtilen geçerlilik süresi içinde bağlayıcıdır.'
    ]).forEach(k => S.push(['• ' + k]));
    bos();
    S.push(['Teklifi Hazırlayan:', teklif.sorumlu || '']);
    S.push(['', '', '', '', '', 'Kaşe / İmza']);

    const ws = XLSX.utils.aoa_to_sheet(S);
    ws['!cols'] = [{ wch: 6 }, { wch: 48 }, { wch: 10 }, { wch: 9 },
                   { wch: 14 }, { wch: 8 }, { wch: 16 }];
    // Para sütunlarını biçimlendir
    const aralik = XLSX.utils.decode_range(ws['!ref']);
    for (let R = aralik.s.r; R <= aralik.e.r; R++) {
      [4, 6].forEach(C => {
        const h = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (h && typeof h.v === 'number') h.z = '#,##0.00 "₺"';
      });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Teklif');
    return wb;
  }

  function indir(teklif, hesap, firma, musteri) {
    const wb = excelUret(teklif, hesap, firma, musteri);
    const ad = (teklif.kod || 'teklif').replace(/[^\w.-]/g, '_');
    XLSX.writeFile(wb, ad + '_teklif.xlsx');
  }

  // ── YAZDIRILABİLİR HTML (logolu) ─────────────────────────────────────────
  // Logolar burada görünür; PDF olarak yazdırılabilir.
  function htmlUret(teklif, hesap, firma, musteri, logolar) {
    const F = firma || {}, M = musteri || {}, L = logolar || {};
    const tl = (v) => (+v || 0).toLocaleString('tr', { minimumFractionDigits: 2 }) + ' ₺';
    const esc = (x) => String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let kalemHtml = '';
    let sira = 0;
    if (teklif.mahaller && teklif.mahaller.length) {
      teklif.mahaller.forEach((m, mi) => {
        const mh = hesap.mahaller[mi];
        kalemHtml += `<tr class="mahal"><td colspan="7">${esc(m.ad).toUpperCase()}${m.adet > 1 ? ` &nbsp;(× ${m.adet})` : ''}</td></tr>`;
        (m.kalemler || []).forEach((k, ki) => {
          sira++;
          kalemHtml += `<tr><td>${sira}</td><td>${esc(k.ad)}</td><td class="r">${k.miktar}</td>
            <td>${esc(k.birim || 'ADET')}</td><td class="r">${tl(k.listeFiyati)}</td>
            <td class="r">${k.iskontoYuzde || 0}%</td><td class="r">${tl(mh.detay[ki].satirNet)}</td></tr>`;
        });
        if (m.adet > 1) {
          kalemHtml += `<tr class="ara"><td colspan="6">${esc(m.ad)} toplamı</td><td class="r">${tl(mh.toplamNet)}</td></tr>`;
        }
      });
    }

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${esc(teklif.kod || 'Teklif')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; }
  .antet { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 2px solid #1f4e79; padding-bottom: 10px; margin-bottom: 14px; }
  .antet img { max-height: 62px; max-width: 200px; object-fit: contain; }
  .firma { font-size: 10.5px; line-height: 1.5; }
  .firma b { font-size: 14px; color: #1f4e79; }
  .baslik { text-align: center; font-size: 17px; font-weight: bold; color: #1f4e79;
            letter-spacing: 1px; margin: 6px 0 14px; }
  .bilgi { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
  .kutu { border: 1px solid #ccc; border-radius: 5px; padding: 8px 10px; flex: 1; }
  .kutu h4 { margin: 0 0 5px; font-size: 10px; color: #666; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1f4e79; color: #fff; padding: 6px 5px; font-size: 10px; text-align: left; }
  td { padding: 5px; border-bottom: 1px solid #e3e3e3; font-size: 10.5px; }
  .r { text-align: right; }
  tr.mahal td { background: #eef3f9; font-weight: bold; color: #1f4e79; }
  tr.ara td { background: #fafafa; font-style: italic; }
  .toplam { width: 300px; margin-left: auto; margin-top: 10px; }
  .toplam td { padding: 4px 6px; }
  .toplam .genel td { background: #1f4e79; color: #fff; font-weight: bold; font-size: 12.5px; }
  .kosul { margin-top: 16px; font-size: 10px; color: #444; }
  .imza { margin-top: 26px; display: flex; justify-content: space-between; font-size: 10.5px; }
  @media print { .yazdirma-gizle { display: none; } }
</style></head><body>
  <div class="antet">
    <div>${L.firmaLogo ? `<img src="${L.firmaLogo}" alt="">` : ''}
      <div class="firma"><b>${esc(F.unvan || 'FİRMA ADI')}</b><br>
        ${esc(F.adres || '')}<br>
        ${F.telefon ? 'Tel: ' + esc(F.telefon) : ''} ${F.eposta ? ' · ' + esc(F.eposta) : ''}<br>
        ${F.vergiDairesi || F.vergiNo ? esc((F.vergiDairesi || '') + ' V.D. ' + (F.vergiNo || '')) : ''}
      </div></div>
    <div style="text-align:right">${L.musteriLogo ? `<img src="${L.musteriLogo}" alt="">` : ''}</div>
  </div>

  <div class="baslik">TEKLİF FORMU</div>

  <div class="bilgi">
    <div class="kutu"><h4>SAYIN</h4>
      <b>${esc(M.unvan || teklif.musteriAdi || '')}</b><br>
      ${esc(M.adres || '')}<br>
      ${teklif.irtibatKisi ? 'İlgili: ' + esc(teklif.irtibatKisi) : ''}
      ${teklif.irtibatTelefon ? ' · ' + esc(teklif.irtibatTelefon) : ''}
    </div>
    <div class="kutu"><h4>TEKLİF BİLGİSİ</h4>
      Teklif No: <b>${esc(teklif.kod || '')}</b><br>
      Tarih: ${new Date().toLocaleDateString('tr')}<br>
      Geçerlilik: ${esc(teklif.gecerlilik || '30 gün')}<br>
      ${teklif.revizyonNo ? 'Revizyon: ' + teklif.revizyonNo + '<br>' : ''}
      Hazırlayan: ${esc(teklif.sorumlu || '')}
    </div>
  </div>

  ${teklif.konu ? `<div style="margin-bottom:10px"><b>Konu:</b> ${esc(teklif.konu)}</div>` : ''}

  <table>
    <tr><th>S.No</th><th>Açıklama</th><th class="r">Miktar</th><th>Birim</th>
        <th class="r">Birim Fiyat</th><th class="r">İsk %</th><th class="r">Tutar</th></tr>
    ${kalemHtml}
  </table>

  <table class="toplam">
    <tr><td>Ara Toplam</td><td class="r">${tl(hesap.araToplamNet)}</td></tr>
    ${hesap.dipIskontoTutar ? `<tr><td>Dip İskonto (%${hesap.dipIskontoOran})</td>
      <td class="r">−${tl(hesap.dipIskontoTutar)}</td></tr>` : ''}
    ${hesap.yansiyanGider ? `<tr><td>Montaj / Nakliye</td><td class="r">${tl(hesap.yansiyanGider)}</td></tr>` : ''}
    <tr><td>Toplam (KDV hariç)</td><td class="r">${tl(hesap.matrah)}</td></tr>
    <tr><td>KDV (%${teklif.kdvOrani || 20})</td><td class="r">${tl(hesap.kdv)}</td></tr>
    <tr class="genel"><td>GENEL TOPLAM</td><td class="r">${tl(hesap.genelToplam)}</td></tr>
  </table>

  <div class="kosul"><b>TEKLİF KOŞULLARI</b><br>
    ${(teklif.kosullar || [
      'Fiyatlarımıza KDV dahil değildir.',
      'Teslim süresi sipariş onayından itibaren başlar.',
      'Ödeme koşulu: mutabakata göre.',
      'Bu teklif belirtilen geçerlilik süresi içinde bağlayıcıdır.'
    ]).map(k => '• ' + esc(k)).join('<br>')}
  </div>

  <div class="imza">
    <div>Teklifi Hazırlayan<br><b>${esc(teklif.sorumlu || '')}</b></div>
    <div style="text-align:right">Kaşe / İmza</div>
  </div>
</body></html>`;
  }

  function yazdir(teklif, hesap, firma, musteri, logolar) {
    const html = htmlUret(teklif, hesap, firma, musteri, logolar);
    const w = window.open('', '_blank');
    if (!w) { throw new Error('Açılır pencere engellendi. Tarayıcı ayarlarından izin verin.'); }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) { } }, 400);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // YÖNETİM İCMALİ (Excel) — müşteri teklifinden AYRI belge
  // ────────────────────────────────────────────────────────────────────────────
  // Biçim, firmanın kullandığı icmal tablosundan alınmıştır:
  //   Kalem · İşçilik(Sa) · Satınalma · Standart Maliyet · Adet · Toplam Maliyet
  //   · GYG · Nakliye/Montaj · Kâr · Net Fiyat
  // Üst yönetim "ne kadar malzeme, ne kadar işçilik" sorusunu buradan görür.
  // ══════════════════════════════════════════════════════════════════════════
  function icmalUret(teklif, hesap, maliyetSoz, ayar) {
    if (!window.XLSX) throw new Error('Excel kütüphanesi yüklenemedi.');
    const A = ayar || {};
    const gygOran = A.gygYuzde != null ? A.gygYuzde : 10;
    const soz = maliyetSoz || {};
    const S = [];

    S.push(['PROJE MALİYET İCMALİ — ÜST YÖNETİM']);
    S.push(['Teklif', teklif.kod || '', '', 'Tarih', new Date().toLocaleDateString('tr')]);
    S.push(['Müşteri', teklif.musteriAdi || '', '', 'Sorumlu', teklif.sorumlu || '']);
    S.push([]);
    S.push(['Mahal', 'Kalem', 'İşçilik (Sa)', 'Satınalma (₺)', 'Standart Maliyet (₺)',
      'Adet', 'Toplam Maliyet (₺)', `GYG (%${gygOran})`, 'Nakliye/Montaj (₺)',
      'Kâr (₺)', 'Net Fiyat (₺)']);

    let tHam = 0, tRota = 0, tSaat = 0, tMaliyet = 0, tNet = 0, bilinmeyen = 0;
    (teklif.mahaller || []).forEach((m, mi) => {
      const mAdet = Math.max(1, +m.adet || 1);
      const mh = hesap.mahaller ? hesap.mahaller[mi] : null;
      (m.kalemler || []).forEach((k, ki) => {
        const mm = soz[k.urunId] || null;
        const miktar = (+k.miktar || 0) * mAdet;
        const ham = mm ? (+mm.hammadde || 0) : 0;
        const rota = mm ? (+mm.rota || 0) : 0;
        const saat = mm && mm.rotaSaat ? +mm.rotaSaat : null;
        const birimMaliyet = mm ? (+mm.toplamMaliyet || (ham + rota)) : 0;
        const toplamMaliyet = birimMaliyet * miktar;
        const gyg = toplamMaliyet * gygOran / 100;
        const nakliye = 0;   // proje geneli ek giderlerde; kalem bazında ayrılmaz
        const net = mh && mh.detay[ki] ? mh.detay[ki].satirNet * mAdet : 0;
        const kar = net - toplamMaliyet - gyg;
        if (!mm) bilinmeyen++;
        tHam += ham * miktar; tRota += rota * miktar;
        if (saat) tSaat += saat * miktar;
        tMaliyet += toplamMaliyet; tNet += net;
        S.push([
          m.ad || '', k.ad || '',
          saat ? saat * miktar : '', Math.round(ham * miktar * 100) / 100,
          Math.round(birimMaliyet * 100) / 100, miktar,
          Math.round(toplamMaliyet * 100) / 100, Math.round(gyg * 100) / 100,
          nakliye, Math.round(kar * 100) / 100, Math.round(net * 100) / 100
        ]);
      });
    });

    const ekGider = (teklif.ekGiderler || []).reduce((a, g) => a + (+g.tutar || 0), 0);
    S.push([]);
    S.push(['', 'TOPLAM', tSaat || '', Math.round(tHam), '', '',
      Math.round(tMaliyet), Math.round(tMaliyet * gygOran / 100), Math.round(ekGider),
      Math.round(tNet - tMaliyet - tMaliyet * gygOran / 100 - ekGider), Math.round(tNet)]);
    S.push([]);
    S.push(['ÖZET']);
    S.push(['Hammadde maliyeti', Math.round(tHam)]);
    S.push(['Rota / işçilik maliyeti', Math.round(tRota)]);
    if (tSaat) S.push(['Toplam işçilik (saat)', Math.round(tSaat * 100) / 100]);
    S.push(['Ek giderler (montaj, nakliye)', Math.round(ekGider)]);
    S.push(['TOPLAM MALİYET', Math.round(tMaliyet + ekGider)]);
    S.push(['Net gelir (KDV hariç)', Math.round(hesap.matrah || tNet)]);
    const kar = (hesap.matrah || tNet) - tMaliyet - ekGider;
    S.push(['KÂR', Math.round(kar)]);
    S.push(['Kâr marjı %', (hesap.matrah || tNet) ? Math.round(kar / (hesap.matrah || tNet) * 1000) / 10 : '']);
    if (bilinmeyen) {
      S.push([]);
      S.push([`UYARI: ${bilinmeyen} kalemin maliyeti hesaplanamadı (reçetesiz).`,
        'Gerçek kâr gösterilenden DÜŞÜKTÜR.']);
    }

    const ws = XLSX.utils.aoa_to_sheet(S);
    ws['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 18 },
      { wch: 8 }, { wch: 17 }, { wch: 13 }, { wch: 16 }, { wch: 14 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Maliyet İcmali');
    return wb;
  }

  function icmalIndir(teklif, hesap, maliyetSoz, ayar) {
    const wb = icmalUret(teklif, hesap, maliyetSoz, ayar);
    const ad = (teklif.kod || 'teklif').replace(/[^\w.-]/g, '_');
    XLSX.writeFile(wb, ad + '_maliyet_icmali.xlsx');
  }

  return { logoOku, excelUret, indir, htmlUret, yazdir, icmalUret, icmalIndir, AZAMI_LOGO };
})();

if (typeof module !== 'undefined') module.exports = TeklifExcel;
