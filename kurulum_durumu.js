// ════════════════════════════════════════════════════════════════════════════
// KURULUM HAZIRLIK PANOSU
//
// Yeni kurulan bir sistemde en büyük risk, nereye kadar gelindiğinin
// bilinmemesidir. Bu pano sistemin kurulum olgunluğunu ÖLÇER: hangi adım
// tamamlandı, hangisi eksik, eksik olan neyi engelliyor.
//
// Sekiz adım, birbirine bağlıdır — üsttekiler alttakileri besler:
//   1 Ayarlar   2 Cari   3 Hammadde   4 Rota
//   5 Yarı mamül/Reçete   6 QR etiket   7 Açılış stoğu   8 Kontrol planı
//
// Her adım için: mevcut durum sayısı, yüzde, "neyi engelliyor" açıklaması ve
// doğrudan ilgili ekrana giden tuş. Ayrıca kurulum öncesi durumu (baseline)
// bir kez kaydetmek için "Başlangıç Durumu" formu vardır — sistem oturduktan
// sonra "eskiden nasıldı" sorusunun cevabı kaybolmasın diye.
// ════════════════════════════════════════════════════════════════════════════
const KurulumDurumu = (() => {

  const esc = (s) => (window.App ? App.escapeHtml(s) : String(s == null ? '' : s));

  // ── Ölçüm: her adımın durumunu hesapla ───────────────────────────────────
  async function olc() {
    const bos = () => [];
    const al = async (k) => { try { return await Store[k].all(); } catch (e) { return bos(); } };

    const [ayarlar, musteriler, tedarikciler, hammaddeler, rotalar, yarimamuller,
           urunler, receteler, stokRaf, kontrolPlanlari, teknikDurum] = await Promise.all([
      (async () => { try { return await Store.ayarlar(); } catch (e) { return {}; } })(),
      al('musteriler'), al('tedarikciler'), al('hammaddeler'), al('rotalar'),
      al('yarimamuller'), al('urunler'), al('receteler'), al('stokRaf'),
      al('kontrolPlanlari'), Promise.resolve(null)
    ]);

    // Rota ataması: yarı mamül + ürünlerin kaçında rotaId dolu
    const rotaHedef = [...yarimamuller, ...urunler];
    const rotaliOlan = rotaHedef.filter(x => x.rotaId).length;

    // Reçete: ürünlerin kaçında reçete kalemi var
    const receteliUrun = urunler.filter(u => receteler.some(r => r.urunId === u.id && (r.kalemler || []).length)).length;

    // Kontrol planı: kaç parçaya tanımlı
    const planliParca = kontrolPlanlari.filter(p => p.aktif !== false && (p.maddeler || []).length).length;

    const oran = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

    return [
      {
        no: 1, ad: 'Ayarlar ve kullanıcılar', sayfa: null,
        deger: (ayarlar && ayarlar.saatlikIscilikUcreti) ? 100 : 0,
        ozet: (ayarlar && ayarlar.saatlikIscilikUcreti)
          ? 'Saatlik işçilik ücreti tanımlı'
          : 'Saatlik işçilik ücreti girilmemiş',
        engel: 'Girilmezse işçilik ve ürün maliyeti hesaplanamaz.',
        eylem: 'Ayarlar (üst bar)'
      },
      {
        no: 2, ad: 'Cari kartlar', sayfa: 'cari_panel',
        deger: (musteriler.length + tedarikciler.length) > 0 ? 100 : 0,
        ozet: musteriler.length + ' müşteri · ' + tedarikciler.length + ' tedarikçi',
        engel: 'Cari yoksa sipariş ve satınalma açılamaz.',
        eylem: 'Cari Kartları'
      },
      {
        no: 3, ad: 'Hammadde / hırdavat', sayfa: 'hammadde',
        deger: hammaddeler.length > 0 ? 100 : 0,
        ozet: hammaddeler.length + ' hammadde kartı',
        engel: 'Hammadde yoksa reçete ve maliyet kurulamaz.',
        eylem: 'Hammaddeler'
      },
      {
        no: 4, ad: 'Hat ve rota tanımı', sayfa: 'rota',
        deger: rotalar.length > 0 ? 100 : 0,
        ozet: rotalar.length + ' rota tanımlı',
        engel: 'ROTA YOKSA: iş çizelgeye düşmez, akış panosu boş kalır, ' +
               'operatör terminalinde iş görünmez, kontrol planı istasyon bulamaz.',
        eylem: 'Hat & Rota', kritik: true
      },
      {
        no: 5, ad: 'Yarı mamül + reçete', sayfa: 'kartlar',
        deger: rotaHedef.length ? oran(rotaliOlan, rotaHedef.length) : 0,
        ozet: yarimamuller.length + ' yarı mamül · ' + urunler.length + ' ürün · ' +
              rotaliOlan + '/' + rotaHedef.length + ' karta rota atanmış · ' +
              receteliUrun + '/' + urunler.length + ' üründe reçete var',
        engel: 'Rotası atanmamış kart üretime düşmez; reçetesiz üründe maliyet ve MRP çalışmaz.',
        eylem: 'Ürün Kartları & Reçete', kritik: true
      },
      {
        no: 6, ad: 'QR etiketler', sayfa: 'qr_etiket',
        deger: null,   // sistem basılıp basılmadığını bilemez
        ozet: 'Kartlardan toplu üretilir ve parçalara yapıştırılır',
        engel: 'Etiket yoksa operatör QR okutamaz; parça takibi elle yürür.',
        eylem: 'QR Etiket Merkezi', elle: true
      },
      {
        no: 7, ad: 'Açılış stokları', sayfa: 'depo_panel',
        deger: stokRaf.length > 0 ? 100 : 0,
        ozet: stokRaf.length + ' stok kalemi kayıtlı',
        engel: 'Stok girilmezse MRP yanlış hesaplar ve sayım listesi boş çıkar.',
        eylem: 'Depo Paneli'
      },
      {
        no: 8, ad: 'Kalite kontrol planı', sayfa: 'kalite_panel',
        deger: planliParca > 0 ? Math.min(100, planliParca * 20) : 0,
        ozet: planliParca + ' parçada kontrol planı tanımlı',
        engel: 'Plan yoksa kalite onayı boş onaydır; kusur verisi toplanmaz.',
        eylem: 'Kalite Kontrol → Kontrol Planı'
      }
    ];
  }

  // ── PANOYU AÇ ────────────────────────────────────────────────────────────
  async function ac() {
    const adimlar = await olc();
    const olculebilir = adimlar.filter(a => a.deger != null);
    const genel = Math.round(olculebilir.reduce((t, a) => t + a.deger, 0) / olculebilir.length);
    const eksikler = adimlar.filter(a => a.deger != null && a.deger < 100);

    let baslangic = null;
    try { const ay = await Store.ayarlar(); baslangic = ay && ay.baslangicDurumu; } catch (e) {}

    const body = document.createElement('div');
    body.innerHTML = `
      <div style="background:${genel >= 80 ? 'var(--green-bg)' : genel >= 40 ? 'var(--amber-bg)' : 'var(--red-bg)'};
                  border-radius:12px;padding:12px 14px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div><b style="font-size:14px">Kurulum tamamlanma: %${genel}</b>
            <div style="font-size:11.5px;color:var(--text2);margin-top:2px">
              ${eksikler.length ? eksikler.length + ' adım eksik — en kritik olan: ' + esc(eksikler[0].ad)
                                : 'Tüm ölçülebilir adımlar tamam'}</div></div>
          <div style="font-size:26px;font-weight:800">${genel}%</div>
        </div>
        <div style="height:6px;background:var(--surface);border-radius:4px;margin-top:10px;overflow:hidden">
          <div style="height:100%;width:${genel}%;background:${genel >= 80 ? 'var(--green)' : genel >= 40 ? 'var(--amber)' : 'var(--red)'}"></div>
        </div>
      </div>

      ${adimlar.map(a => {
        const tamam = a.deger === 100;
        const renk = a.deger == null ? 'var(--text3)' : tamam ? 'var(--green-text)' : a.deger > 0 ? 'var(--amber-text)' : 'var(--red-text)';
        return `
        <div style="display:flex;gap:11px;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="width:26px;height:26px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;
                      justify-content:center;font-size:11.5px;font-weight:800;
                      background:${tamam ? 'var(--green-bg)' : a.deger ? 'var(--amber-bg)' : 'var(--bg)'};color:${renk}">
            ${tamam ? '✓' : a.no}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <b style="font-size:12.5px">${esc(a.ad)}${a.kritik && !tamam ? ' <span class="pill pill-red" style="font-size:9px">kritik</span>' : ''}</b>
              <span style="font-size:11px;font-weight:800;color:${renk}">
                ${a.deger == null ? 'elle takip' : '%' + a.deger}</span>
            </div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(a.ozet)}</div>
            ${!tamam ? `<div style="font-size:10.5px;color:var(--red-text);margin-top:3px">↳ ${esc(a.engel)}</div>` : ''}
            ${a.sayfa ? `<button class="btn btn-sm kd-git" data-sayfa="${a.sayfa}" style="margin-top:6px">${esc(a.eylem)} →</button>` : ''}
          </div>
        </div>`;
      }).join('')}

      <div style="margin-top:16px;padding:12px;border:1.5px dashed var(--blue-light);border-radius:11px;background:var(--blue-bg)">
        <b style="font-size:12.5px">📸 Başlangıç Durumu (bir kez doldurulur)</b>
        <div style="font-size:11.5px;color:var(--text2);margin:5px 0 8px">
          Sistem oturduktan sonra "eskiden nasıldı" sorusunun cevabı kaybolur.
          Bugünkü halinizi şimdi kaydedin; ilerlemenizi rakamla ölçebilirsiniz.
        </div>
        ${baslangic
          ? `<div style="font-size:11px;color:var(--green-text)">✓ ${esc(baslangic.tarih)} tarihinde kaydedildi</div>
             <button class="btn btn-sm" id="kd-baz-gor" style="margin-top:6px">Kaydı Gör / Güncelle</button>`
          : `<button class="btn btn-sm btn-blue" id="kd-baz">Başlangıç Durumunu Kaydet</button>`}
      </div>`;

    App.openModal({
      title: '🚦 Kurulum Hazırlık Panosu', body, wide: true,
      footer: `<button class="btn" id="kd-kapat">Kapat</button>`
    });
    document.getElementById('kd-kapat').onclick = App.closeModal;
    body.querySelectorAll('.kd-git').forEach(b => b.onclick = () => {
      App.closeModal();
      App.goTo(b.dataset.sayfa);
    });
    const bazBtn = document.getElementById('kd-baz') || document.getElementById('kd-baz-gor');
    if (bazBtn) bazBtn.onclick = () => baslangicFormu(baslangic);
  }

  // ── BAŞLANGIÇ DURUMU (BASELINE) FORMU ────────────────────────────────────
  function baslangicFormu(mevcut) {
    const v = mevcut || {};
    const alan = (id, etiket, ipucu, deger) => `
      <div class="fgroup"><label class="flbl">${etiket}</label>
        <input class="finput" id="${id}" value="${esc(deger || '')}" placeholder="${esc(ipucu)}">
      </div>`;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">
        Tahmin yeterli — önemli olan bugünü kaydetmek. Altı ay sonra aynı ölçüleri
        tekrar alıp farkı göreceksiniz.
      </div>
      ${alan('bz-surec', 'Sipariş → sevkiyat süresi (gün)', 'son 10 siparişin ortalaması', v.surec)}
      ${alan('bz-kagit', 'Aylık teknik resim çıktısı (sayfa)', 'yaklaşık', v.kagit)}
      ${alan('bz-sayim', 'Yarı mamül sayımı (kişi × saat)', 'örn. 3 kişi × 6 saat', v.sayim)}
      ${alan('bz-sayimFark', 'Son sayımdaki fark oranı (%)', 'bilinmiyorsa boş bırakın', v.sayimFark)}
      ${alan('bz-kusur', 'Aylık kalite kusuru (adet)', 'yeniden üretim + red', v.kusur)}
      ${alan('bz-kusurMaliyet', 'Kusurların aylık maliyeti (₺)', 'yaklaşık', v.kusurMaliyet)}
      ${alan('bz-termin', 'Termin sapması (gün / %)', 'geciken sipariş oranı', v.termin)}
      ${alan('bz-fire', 'Plaka fire oranı (%)', 'kesimde', v.fire)}
      <div class="fgroup"><label class="flbl">Notlar</label>
        <textarea class="ftextarea" id="bz-not" rows="3"
          placeholder="Bugün nasıl çalışıyorsunuz? (kâğıt iş emri, defter, Excel, sözlü takip…)">${esc(v.not || '')}</textarea></div>
      <div class="fhint">💡 Ayrıca sahanın bugünkü halini <b>fotoğraflayın</b> — kâğıt iş emirleri,
      sayım listeleri, defterler. Bu fotoğraflar bir daha çekilemez.</div>`;
    App.openModal({
      title: '📸 Başlangıç Durumu', body,
      footer: `<button class="btn" id="bz-vaz">Vazgeç</button><button class="btn btn-blue" id="bz-kaydet">Kaydet</button>`
    });
    document.getElementById('bz-vaz').onclick = App.closeModal;
    document.getElementById('bz-kaydet').onclick = async () => {
      const g = (id) => document.getElementById(id).value.trim();
      const kayit = {
        tarih: new Date().toISOString().slice(0, 10),
        surec: g('bz-surec'), kagit: g('bz-kagit'), sayim: g('bz-sayim'),
        sayimFark: g('bz-sayimFark'), kusur: g('bz-kusur'), kusurMaliyet: g('bz-kusurMaliyet'),
        termin: g('bz-termin'), fire: g('bz-fire'), not: g('bz-not')
      };
      const ay = await Store.ayarlar();
      ay.baslangicDurumu = kayit;
      await App.persist(() => Store.setAyarlar(ay));
      App.closeModal();
      App.toast('Başlangıç durumu kaydedildi — ' + kayit.tarih, 'ok');
    };
  }

  return { ac, olc };
})();
