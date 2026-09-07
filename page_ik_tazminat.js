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
    const toplamKidemBrut = hesaplar.reduce((a, h) => a + h.hesap.kidemTazminati, 0);
    const toplamKidemDamga = hesaplar.reduce((a, h) => a + h.hesap.kidemDamgaVergisi, 0);
    const toplamKidemNet = hesaplar.reduce((a, h) => a + h.hesap.netKidemTazminati, 0);
    const toplamIhbar = hesaplar.reduce((a, h) => a + h.hesap.ihbarTazminati, 0);

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Kıdem & İhbar Tazminatı Takibi</div><div class="page-sub">Personel bazlı, bugün itibarıyla hesaplanan tahmini tazminat yükümlülüğü</div></div>
      </div>

      <div class="card" style="background:var(--amber-bg);border-color:var(--amber-light)">
        <div style="font-size:11.5px;color:var(--amber-text)">
          ⚠ Kıdem tazminatı <b>kıdem tazminatı tavanı × kıdem yılı</b> (kesirli yıl dahil) formülüyle hesaplanır ve
          <b>damga vergisi</b> (binde ${App.fmt(ayarlar.damgaVergisiOraniBinde ?? 7.59, 2)}, Ayarlar'dan) düşülerek NET
          tutar gösterilir — kıdem tazminatı gelir vergisinden istisnadır. <b>İhbar tazminatı ise BRÜT'tür</b>: normal
          ücret gibi kümülatif gelir vergisi dilimine tabidir, kesin net tutarı personelin o ayki kümülatif matrahına
          bağlıdır ve burada hesaplanmaz. Her iki hesap da son brüt ücrete süreklilik arz eden ek menfaatleri
          (giyim/yemek/yol yardımı gibi) DAHİL ETMEZ — personel kartında bu alanlar tutulmuyor. Kesin tutarlar için
          mali müşavirinize danışın. Kıdem tazminatı tavanı şu an <b>${App.fmtTL(ayarlar.kidemTazminatiTavani)}</b>
          olarak Ayarlar'dan tanımlı — yasal değişiklikte burayı güncelleyin.
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Aktif Personel</div><div class="kpi-val blue">${aktifPersonel.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam Kıdem Tazminatı Yükü (Net)</div><div class="kpi-val red">${App.fmtTL(toplamKidemNet)}</div></div>
        <div class="kpi"><div class="kpi-lbl">Toplam İhbar Tazminatı Yükü (Brüt)</div><div class="kpi-val amber">${App.fmtTL(toplamIhbar)}</div></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Personel Bazlı Tazminat Hesabı</div></div>
        <div style="overflow-x:auto">
        <table class="dtable">
          <tr><th>Personel</th><th>İşe Giriş</th><th class="r">Kıdem (Yıl)</th><th class="r">Brüt Maaş</th><th class="r">Kıdem Tazminatı (Brüt)</th><th class="r">Damga Vergisi</th><th class="r">Kıdem Tazminatı (Net)</th><th class="r">İhbar Süresi (Hafta)</th><th class="r">İhbar Tazminatı (Brüt)</th><th class="r">Toplam</th></tr>
          ${hesaplar.map(h => `<tr>
            <td><b>${App.escapeHtml(h.personel.adSoyad)}</b></td>
            <td style="font-size:11px">${h.personel.iseGirisTarihi}</td>
            <td class="r">${App.fmt(h.hesap.yilSayisi, 1)}</td>
            <td class="r">${App.fmtTL(h.personel.brutMaas)}</td>
            <td class="r">${App.fmtTL(h.hesap.kidemTazminati)}</td>
            <td class="r muted">-${App.fmtTL(h.hesap.kidemDamgaVergisi)}</td>
            <td class="r">${App.fmtTL(h.hesap.netKidemTazminati)}</td>
            <td class="r">${h.hesap.ihbarHaftasi}</td>
            <td class="r">${App.fmtTL(h.hesap.ihbarTazminati)}</td>
            <td class="r"><b>${App.fmtTL(h.hesap.toplamTazminat)}</b></td>
          </tr>`).join('')}
          <tr class="total-row"><td colspan="4">GENEL TOPLAM</td><td class="r">${App.fmtTL(toplamKidemBrut)}</td><td class="r">-${App.fmtTL(toplamKidemDamga)}</td><td class="r">${App.fmtTL(toplamKidemNet)}</td><td></td><td class="r">${App.fmtTL(toplamIhbar)}</td><td class="r">${App.fmtTL(toplamKidemNet + toplamIhbar)}</td></tr>
        </table>
        </div>
      </div>
    `;
  }

  return { render };
})();
