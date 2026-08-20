// ════════════════════════════════════════════════════════════════════════════
// İK — KIDEM & İHBAR TAZMİNATI — yıllara göre personel bazlı kıdem/ihbar
// tazminatı hesabı (kıdem tazminatı tavanı × yıl sayısı formülüyle), toplam
// tüm personel kıdem tazminatı yükümlülüğü.
// ════════════════════════════════════════════════════════════════════════════
PageModules.ik_tazminat = (() => {

  async function render(main) {
    const personeller = await Store.personeller.all();
    const aktifPersonel = personeller.filter(p => p.durum === 'aktif');
    const ayarlar = App.state.ayarlar;

    const hesaplar = aktifPersonel.map(p => ({ personel: p, hesap: App.kidemIhbarHesapla(p, null, ayarlar) }));
    const toplamKidem = hesaplar.reduce((a, h) => a + h.hesap.kidemTazminati, 0);
    const toplamIhbar = hesaplar.reduce((a, h) => a + h.hesap.ihbarTazminati, 0);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Kıdem & İhbar Tazminatı Takibi</div><div class="page-sub">Personel bazlı, bugün itibarıyla hesaplanan tahmini tazminat yükümlülüğü</div></div>
      </div>

      <div class="card" style="background:var(--amber-bg);border-color:var(--amber-light)">
        <div style="font-size:11.5px;color:var(--amber-text)">
          ⚠ Bu hesaplama <b>kıdem tazminatı tavanı × kıdem yılı</b> mantığıyla basitleştirilmiş bir YAKLAŞIMDIR.
          Gerçek kıdem tazminatı hesabı; son brüt ücret (giyim/yemek/yol gibi süreklilik arz eden ek menfaatler dahil),
          kısmi yıl kesirleri ve damga vergisi gibi unsurları içerir. Kesin tutarlar için mali müşavirinize danışın.
          Kıdem tazminatı tavanı şu an <b>${App.fmtTL(ayarlar.kidemTazminatiTavani)}</b> olarak Ayarlar'dan tanımlı —
          yasal değişiklikte burayı güncelleyin.
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Aktif Personel</div><div class="kpi-val blue">${aktifPersonel.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam Kıdem Tazminatı Yükü</div><div class="kpi-val red">${App.fmtTL(toplamKidem)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam İhbar Tazminatı Yükü</div><div class="kpi-val amber">${App.fmtTL(toplamIhbar)}</div></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Personel Bazlı Tazminat Hesabı</div></div>
        <table class="dtable">
          <tr><th>Personel</th><th>İşe Giriş</th><th class="r">Kıdem (Yıl)</th><th class="r">Brüt Maaş</th><th class="r">Kıdem Tazminatı</th><th class="r">İhbar Süresi (Hafta)</th><th class="r">İhbar Tazminatı</th><th class="r">Toplam</th></tr>
          ${hesaplar.map(h => `<tr>
            <td><b>${App.escapeHtml(h.personel.adSoyad)}</b></td>
            <td style="font-size:11px">${h.personel.iseGirisTarihi}</td>
            <td class="r">${App.fmt(h.hesap.yilSayisi, 1)}</td>
            <td class="r">${App.fmtTL(h.personel.brutMaas)}</td>
            <td class="r">${App.fmtTL(h.hesap.kidemTazminati)}</td>
            <td class="r">${h.hesap.ihbarHaftasi}</td>
            <td class="r">${App.fmtTL(h.hesap.ihbarTazminati)}</td>
            <td class="r"><b>${App.fmtTL(h.hesap.toplamTazminat)}</b></td>
          </tr>`).join('')}
          <tr class="total-row"><td colspan="4">GENEL TOPLAM</td><td class="r">${App.fmtTL(toplamKidem)}</td><td></td><td class="r">${App.fmtTL(toplamIhbar)}</td><td class="r">${App.fmtTL(toplamKidem + toplamIhbar)}</td></tr>
        </table>
      </div>
    `;
  }

  return { render };
})();
