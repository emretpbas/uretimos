// ════════════════════════════════════════════════════════════════════════════
// YÖNETİM ONAYLARI — satınalma komisyonlarının (3 teklif karşılaştırma) merkezi
// onay ekranı. Onaylanınca ilgili satınalma talebi 'tamamlandi' olur.
// ════════════════════════════════════════════════════════════════════════════
PageModules.onaylar = (() => {

  async function render(main) {
    const [komisyonlar, satinalmaTalepleri, siparisler, satinalmaSiparisleri, musteriler, teklifler, tahsilatOnayBekleyenler] = await Promise.all([
      Store.teklifKarsilastirma.all(), Store.satinalmaTalepleri.all(), Store.siparisler.all(), Store.satinalmaSiparisleri.all(), Store.musteriler.all(), Store.teklifler.all(), Store.tahsilatOnayBekleyenler.all()
    ]);
    const bekleyenKomisyonlar = komisyonlar.filter(k => k.durum === 'onay_bekliyor');
    const bekleyenSiparisler = siparisler.filter(s => s.durum === 'yonetim_onay_bekliyor');
    const bekleyenSatinalmaSiparisleri = satinalmaSiparisleri.filter(s => s.durum === 'yonetim_onayi_bekliyor');
    const silmeTalebindekiTeklifler = teklifler.filter(t => t.durum === 'silme_talebinde');
    const bekleyenTahsilatlar = tahsilatOnayBekleyenler.filter(t => t.durum === 'onay_bekliyor');

    main.innerHTML = `
      <div class="page-hdr">
        <div><div class="page-title">Onay Bekleyenler</div><div class="page-sub">Satınalma komisyonlarını, satınalma siparişlerini, sipariş onaylarını, tahsilat kayıtlarını ve teklif silme taleplerini buradan yönetin</div></div>
      </div>

      <div class="grid grid-4" style="margin-bottom:14px">
        <div class="kpi"><div class="kpi-lbl">Bekleyen Satınalma Komisyonu</div><div class="kpi-val amber">${bekleyenKomisyonlar.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Bekleyen Satınalma Siparişi</div><div class="kpi-val purple">${bekleyenSatinalmaSiparisleri.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Bekleyen Sipariş Onayı</div><div class="kpi-val blue">${bekleyenSiparisler.length}</div></div>
        <div class="kpi"><div class="kpi-lbl">Bekleyen Tahsilat</div><div class="kpi-val green">${bekleyenTahsilatlar.length}</div></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Tahsilat Onayları (Muhasebe Panel "Tahsilat Yap" ile Girilen)</div></div>
        <div class="fhint" style="margin-bottom:8px">Onaylanmadan hiçbir kasa/bakiye hareketi oluşmaz. Onaylandığında: peşinat/kredi kartı/nakit gerçek tahsilat kaydı olur, çek ise AYRICA "elde" (kullanılabilir) çekler listesine eklenir.</div>
        <div id="on-tahsilat-list"></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Teklif Silme Talepleri</div></div>
        <div id="on-teklif-sil-list"></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Satınalma Siparişleri (Tedarikçiye Gönderim Öncesi)</div></div>
        <div id="on-satinalma-siparis-list"></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Satınalma Komisyonları (3 Teklif Karşılaştırma)</div></div>
        <div id="on-komisyon-list"></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Sipariş Onayları (Cari İşlemler ile aynı veri — iki yerden de onaylanabilir)</div></div>
        <div id="on-siparis-list"></div>
      </div>
    `;

    renderTahsilatOnayList(bekleyenTahsilatlar);
    renderKomisyonList(bekleyenKomisyonlar);
    renderSiparisList(bekleyenSiparisler, musteriler);
    renderSatinalmaSiparisList(bekleyenSatinalmaSiparisleri);
    renderTeklifSilList(silmeTalebindekiTeklifler);

    function renderTeklifSilList(list) {
      const wrap = document.getElementById('on-teklif-sil-list');
      if (!list.length) { wrap.innerHTML = `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Silme talebi olan teklif yok.</div></div>`; return; }
      let html = `<table class="dtable"><tr><th>Kod</th><th>Müşteri</th><th class="r">Toplam</th><th></th></tr>`;
      list.forEach(t => {
        const araT = t.araToplam ?? (t.kalemler || []).reduce((a, k) => a + k.netFiyat * k.miktar, 0);
        const toplam = t.dipToplam ?? (araT * (1 - (t.genelIskontoYuzde || 0) / 100));
        html += `<tr><td class="mono">${t.kod}</td><td>${App.escapeHtml(t.musteriAdi || '—')}</td><td class="r"><b>${App.fmtTL(toplam)}</b></td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-red on-onayla-teklif-sil" data-id="${t.id}">Silmeyi Onayla</button>
            <button class="btn btn-sm on-reddet-teklif-sil" data-id="${t.id}">Reddet (Sil İptal)</button>
          </td></tr>`;
      });
      html += `</table>`;
      wrap.innerHTML = html;
      wrap.querySelectorAll('.on-onayla-teklif-sil').forEach(b => b.onclick = () => {
        App.confirmDialog('Bu teklifi KALICI olarak silmek istediğinize emin misiniz?', async () => {
          const tumTeklifler = await Store.teklifler.all();
          const kalanlar = tumTeklifler.filter(t => t.id !== b.dataset.id);
          await App.persist(() => Store.teklifler.save(kalanlar));
          // Teklifin 2. kalite rezervasyonlarını serbest bırak — adetler
          // yeniden başka tekliflere açılır.
          await App.persist(() => App.ikinciKaliteRezervasyonKaldir(b.dataset.id));
          App.toast('Teklif silindi', 'ok');
          render(main);
        });
      });
      wrap.querySelectorAll('.on-reddet-teklif-sil').forEach(b => b.onclick = async () => {
        const t = list.find(x => x.id === b.dataset.id);
        t.durum = 'taslak';
        await App.persist(() => Store.teklifler.upsert(t));
        App.toast('Silme talebi reddedildi, teklif tekrar taslak durumunda', 'ok');
        render(main);
      });
    }

    function renderSatinalmaSiparisList(list) {
      const wrap = document.getElementById('on-satinalma-siparis-list');
      if (!list.length) { wrap.innerHTML = `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Onay bekleyen satınalma siparişi yok.</div></div>`; return; }
      const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı', nakit: 'Nakit', diger: 'Diğer' };

      const gruplar = new Map();
      list.forEach(s => {
        const anahtar = s.tedarikciAdi || '—';
        if (!gruplar.has(anahtar)) gruplar.set(anahtar, []);
        gruplar.get(anahtar).push(s);
      });

      let html = '';
      [...gruplar.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([tedarikciAdi, liste], grupIndex) => {
        html += `<div style="margin-bottom:14px">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${App.escapeHtml(tedarikciAdi)} <span class="pill pill-gray">${liste.length} sipariş</span>
            <span style="flex:1"></span>
            <button class="btn btn-sm btn-green on-toplu-onayla-sas" data-grup="${grupIndex}" style="display:none">✓ Seçilenleri Toplu Onayla (Mevcut Ödeme Planıyla)</button>
            <button class="btn btn-sm btn-red on-toplu-reddet-sas" data-grup="${grupIndex}" style="display:none">✕ Seçilenleri Toplu Reddet</button>
          </div>
          <table class="dtable"><tr><th></th><th>Kod</th><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">Toplam</th><th>Termin</th><th>Ödeme & Nakliye</th><th></th></tr>`;
        liste.forEach(s => {
          const op = s.odemePlani || {};
          const kalemler = op.odemeKalemleri || [];
          const ozetEtiketler = [...new Set(kalemler.map(k => tipLabel[k.tip]))];
          const odemeNakliyeOzeti = [
            op.pesinatTutar ? 'Peşinat: ' + App.fmtTL(op.pesinatTutar) : null,
            ozetEtiketler.length ? ozetEtiketler.join(', ') : null,
            s.nakliyeBedelTRY > 0 ? 'Nakliye: ' + App.fmtTL(s.nakliyeBedelTRY) + ' (' + (s.nakliyeYontemi || '—') + ')' : null
          ].filter(Boolean);
          html += `<tr>
            <td><input type="checkbox" class="on-sas-check" data-grup="${grupIndex}" data-id="${s.id}"></td>
            <td class="mono">${s.kod}</td><td>${App.escapeHtml(s.kalemAdi)}</td>
            <td class="r">${App.fmt(s.miktar, 2)} ${App.escapeHtml(s.birim || '')}</td>
            <td class="r">${App.fmt(s.birimFiyat, 4)} ${App.escapeHtml(s.dvz || 'TL')}</td>
            <td class="r"><b>${App.fmtTL(s.toplamTRY)}</b></td>
            <td style="font-size:11px">${s.tahminiGirisTarihi || '—'} <span class="muted">(${s.terminGun || '—'} gün)</span></td>
            <td style="font-size:10.5px">${odemeNakliyeOzeti.length ? odemeNakliyeOzeti.join('<br>') : '<span class="muted">Girilmedi</span>'}</td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-sm btn-green on-onayla-sas" data-id="${s.id}">İncele & Onayla</button>
              <button class="btn btn-sm on-reddet-sas" data-id="${s.id}">Reddet</button>
            </td></tr>`;
        });
        html += `</table></div>`;
      });
      wrap.innerHTML = html;

      wrap.querySelectorAll('.on-onayla-sas').forEach(b => b.onclick = () => {
        const s = list.find(x => x.id === b.dataset.id);
        onaylaSatinalmaSiparisi(s);
      });
      wrap.querySelectorAll('.on-reddet-sas').forEach(b => b.onclick = () => {
        App.redGerekceDialog('Satınalma Siparişini Reddet',
          'Bu sipariş, gerekçenizle birlikte Satınalma birimine geri gönderilecek. Silinmeyecek; düzeltilip yeniden onaya sunulabilir.',
          async (gerekce) => {
            const s = list.find(x => x.id === b.dataset.id);
            s.durum = 'birime_dondu';
            s.redGerekce = gerekce;
            s.redTarihi = new Date().toISOString().slice(0, 10);
            s.redEden = App.currentRoleLabel();
            await App.persist(() => Store.satinalmaSiparisleri.upsert(s));
            App.toast('Satınalma siparişi gerekçeyle birime geri gönderildi', 'ok');
            render(main);
          });
      });

      // Her tedarikçi grubu kendi checkbox setini ve toplu onay/reddet
      // butonlarını yönetir. Toplu onayda her siparişin MEVCUT ödeme planı
      // (Satınalma'nın zaten girdiği peşinat/çek/vb.) değiştirilmeden kabul
      // edilir — modal açılmaz, doğrudan Depo Girişine gönderilir.
      const tumGrupIndexler = new Set();
      wrap.querySelectorAll('.on-sas-check').forEach(c => tumGrupIndexler.add(c.dataset.grup));
      tumGrupIndexler.forEach(grupIndex => {
        const checkboxlar = wrap.querySelectorAll(`.on-sas-check[data-grup="${grupIndex}"]`);
        const topluOnaylaBtn = wrap.querySelector(`.on-toplu-onayla-sas[data-grup="${grupIndex}"]`);
        const topluReddetBtn = wrap.querySelector(`.on-toplu-reddet-sas[data-grup="${grupIndex}"]`);
        function gorunurlugunuGuncelle() {
          const seciliCheckboxlar = [...checkboxlar].filter(c => c.checked);
          const seciliSayisi = seciliCheckboxlar.length;
          const seciliToplam = seciliCheckboxlar.reduce((a, c) => {
            const s = list.find(x => x.id === c.dataset.id);
            return a + (s ? (s.toplamTRY || 0) : 0);
          }, 0);
          const goster = seciliSayisi > 0 ? 'inline-block' : 'none';
          if (topluOnaylaBtn) { topluOnaylaBtn.style.display = goster; topluOnaylaBtn.textContent = seciliSayisi > 0 ? `✓ Seçilenleri Toplu Onayla (${seciliSayisi} sipariş — ${App.fmtTL(seciliToplam)})` : '✓ Seçilenleri Toplu Onayla (Mevcut Ödeme Planıyla)'; }
          if (topluReddetBtn) { topluReddetBtn.style.display = goster; topluReddetBtn.textContent = seciliSayisi > 0 ? `✕ Seçilenleri Toplu Reddet (${seciliSayisi})` : '✕ Seçilenleri Toplu Reddet'; }
        }
        checkboxlar.forEach(c => c.onchange = gorunurlugunuGuncelle);

        if (topluOnaylaBtn) topluOnaylaBtn.onclick = async () => {
          const seciliIdler = [...checkboxlar].filter(c => c.checked).map(c => c.dataset.id);
          if (!seciliIdler.length) return;
          const tumSiparisler = await Store.satinalmaSiparisleri.all();
          const seciliSiparisler = seciliIdler.map(id => tumSiparisler.find(x => x.id === id)).filter(Boolean);

          // Ödeme planı HENÜZ girilmemiş (peşinat yok VE hiç ödeme kalemi
          // yok) siparişler ayrılır — bunlar toplu onaya dahil edilmez,
          // kullanıcı isteği gereği SIRAYLA, her biri için TEK TEK ödeme/
          // nakliye formu açılarak işlenir. Geri kalanlar (zaten ödeme
          // planı girilmiş olanlar) mevcut toplu onay akışıyla devam eder.
          const odemePlaniEksikOlanlar = seciliSiparisler.filter(s => {
            const op = s.odemePlani || {};
            return !op.pesinatTutar && !(op.odemeKalemleri || []).length;
          });
          const odemePlaniOlanlar = seciliSiparisler.filter(s => !odemePlaniEksikOlanlar.includes(s));

          if (odemePlaniEksikOlanlar.length) {
            App.toast(`${odemePlaniEksikOlanlar.length} siparişte ödeme planı henüz girilmemiş — bunlar için sırayla form açılacak.`, 'ok');
            // Sırayla (zincirleme) her biri için ödeme/nakliye formunu açar;
            // bir form kapanınca otomatik olarak sıradaki açılır.
            let sira = 0;
            const siradakiniAc = () => {
              if (sira >= odemePlaniEksikOlanlar.length) {
                // Hepsi tamamlandı — eğer ödeme planı zaten olan başka
                // seçimler de varsa onları normal toplu onayla bitirelim.
                if (odemePlaniOlanlar.length) topluOnaylaDevamEt(odemePlaniOlanlar);
                else render(main);
                return;
              }
              const s = odemePlaniEksikOlanlar[sira];
              sira++;
              onaylaSatinalmaSiparisi(s, siradakiniAc);
            };
            siradakiniAc();
            return;
          }

          topluOnaylaDevamEt(odemePlaniOlanlar);
        };

        // Ödeme planı zaten girilmiş siparişleri MEVCUT planlarıyla
        // (değiştirmeden) topluca onaylar — eski davranış aynen korunur.
        function topluOnaylaDevamEt(siparisListesi) {
          if (!siparisListesi.length) { render(main); return; }
          App.confirmDialog(`Seçilen ${siparisListesi.length} satınalma siparişini, mevcut ödeme planlarıyla (değişiklik yapmadan) topluca onaylayıp Depo Girişine göndermek istediğinize emin misiniz?`, async () => {
            await App.persist(async () => {
              const tumSiparisler2 = await Store.satinalmaSiparisleri.all();
              for (const sip of siparisListesi) {
                const s = tumSiparisler2.find(x => x.id === sip.id);
                if (!s) continue;
                s.durum = 'onaylandi';
                await Store.satinalmaSiparisleri.upsert(s);
                await App.tedarikciOdemeRezervasyonunuKesinlestir(s);
                await App.satinalmaSiparisiOnaylaninceDepoGirisiOlustur(s);
              }
            });
            App.toast(`${siparisListesi.length} satınalma siparişi toplu onaylandı ve Depo Girişine gönderildi`, 'ok');
            render(main);
          });
        };

        if (topluReddetBtn) topluReddetBtn.onclick = () => {
          const seciliIdler = [...checkboxlar].filter(c => c.checked).map(c => c.dataset.id);
          if (!seciliIdler.length) return;
          App.redGerekceDialog(`${seciliIdler.length} Satınalma Siparişini Reddet`,
            'Seçilen siparişler aynı gerekçeyle Satınalma birimine geri gönderilecek.',
            async (gerekce) => {
              const tumSiparisler = await Store.satinalmaSiparisleri.all();
              const bugun = new Date().toISOString().slice(0, 10);
              const redEden = App.currentRoleLabel();
              seciliIdler.forEach(id => {
                const s = tumSiparisler.find(x => x.id === id);
                if (s) { s.durum = 'birime_dondu'; s.redGerekce = gerekce; s.redTarihi = bugun; s.redEden = redEden; }
              });
              await App.persist(() => Store.satinalmaSiparisleri.save(tumSiparisler));
              App.toast(`${seciliIdler.length} satınalma siparişi gerekçeyle birime geri gönderildi`, 'ok');
              render(main);
            });
        };
      });
    }

    // Yönetim, satınalma siparişinin içeriğini ve ödeme planını (Satınalma'nın
    // girdiği) AYNI ortak ekranda görür, isterse düzenler, sonra onaylar.
    // Onaylanınca Depo Girişi beklemesine düşer.
    function onaylaSatinalmaSiparisi(s, onTamamlandi) {
      const icerikHtml = `
        <table class="dtable"><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">Toplam</th></tr>
          <tr><td>${App.escapeHtml(s.kalemAdi)}</td>
            <td class="r">${App.fmt(s.miktar, 2)} ${App.escapeHtml(s.birim || '')}</td>
            <td class="r">${App.fmt(s.birimFiyat, 4)} ${App.escapeHtml(s.dvz || 'TL')}</td>
            <td class="r">${App.fmtTL(s.toplamTRY - (s.nakliyeBedelTRY || 0))}</td></tr>
          ${s.nakliyeBedelTRY > 0 ? `<tr><td colspan="3">Nakliye (${App.escapeHtml(s.nakliyeYontemi || '—')})</td><td class="r">${App.fmtTL(s.nakliyeBedelTRY)}</td></tr>` : ''}
          <tr class="total-row"><td colspan="3">TOPLAM</td><td class="r">${App.fmtTL(s.toplamTRY)}</td></tr>
        </table>`;
      App.siparisIcerikVeOdemeFormuAc(s, {
        mod: 'yonetim',
        duzenlenebilir: true,
        baslikOnEki: 'Satınalma Siparişi: ',
        baslikSub: s.tedarikciAdi,
        icerikHtml,
        onaylaButonMetni: 'Onayla, Depo Girişine Gönder',
        onOnayla: async (odemePlani) => {
          s.odemePlani = odemePlani;
          s.durum = 'onaylandi';
          await App.persist(() => Store.satinalmaSiparisleri.upsert(s));
          await App.tedarikciOdemeRezervasyonunuKesinlestir(s);
          await App.persist(() => App.satinalmaSiparisiOnaylaninceDepoGirisiOlustur(s));
          App.toast('Satınalma siparişi onaylandı ve Depo Girişi beklemesine düştü: ' + s.kod, 'ok');
          if (onTamamlandi) onTamamlandi(); else render(main);
        },
        onReddet: () => {
          App.redGerekceDialog('Satınalma Siparişini Reddet',
            'Sipariş, gerekçenizle Satınalma birimine geri gönderilecek; ödeme rezervasyonu iptal edilecek.',
            async (gerekce) => {
              s.durum = 'birime_dondu';
              s.redGerekce = gerekce;
              s.redTarihi = new Date().toISOString().slice(0, 10);
              s.redEden = App.currentRoleLabel();
              await App.persist(() => Store.satinalmaSiparisleri.upsert(s));
              await App.tedarikciOdemeRezervasyonunuIptalEt(s);
              App.toast('Satınalma siparişi gerekçeyle birime geri gönderildi', 'ok');
              if (onTamamlandi) onTamamlandi(); else render(main);
            });
        }
      });
    }

    function renderTahsilatOnayList(list) {
      const wrap = document.getElementById('on-tahsilat-list');
      if (!list.length) { wrap.innerHTML = `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Onay bekleyen tahsilat yok.</div></div>`; return; }
      const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı', nakit: 'Nakit', diger: 'Diğer' };
      wrap.innerHTML = `<table class="dtable"><tr><th>Müşteri</th><th>Ödeme Planı Özeti</th><th class="r">Toplam Tutar</th><th>Tarih</th><th></th></tr>
        ${list.map(t => {
          const op = t.odemePlani || {};
          const kalemOzetleri = [
            op.pesinatTutar > 0 ? 'Peşinat: ' + App.fmtTL(op.pesinatTutar) : null,
            ...(op.odemeKalemleri || []).map(k => (tipLabel[k.tip] || k.tip) + ': ' + App.fmtTL(k.tutar) + (k.cekNo ? ' (Çek No: ' + k.cekNo + ')' : ''))
          ].filter(Boolean);
          const toplam = (op.pesinatTutar || 0) + (op.odemeKalemleri || []).reduce((a, k) => a + (k.tutar || 0), 0);
          return `<tr>
            <td><b>${App.escapeHtml(t.musteriAdi)}</b></td>
            <td style="font-size:11px">${kalemOzetleri.map(o => App.escapeHtml(o)).join('<br>')}</td>
            <td class="r"><b>${App.fmtTL(toplam)}</b></td>
            <td style="font-size:11px">${t.olusturmaTarihi}</td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-sm btn-green on-tahsilat-onayla" data-id="${t.id}">✓ Onayla</button>
              <button class="btn btn-sm btn-red on-tahsilat-reddet" data-id="${t.id}">✕ Reddet</button>
            </td>
          </tr>`;
        }).join('')}
      </table>`;

      wrap.querySelectorAll('.on-tahsilat-onayla').forEach(b => b.onclick = () => {
        const t = list.find(x => x.id === b.dataset.id);
        App.confirmDialog('Bu tahsilat kaydını ONAYLIYOR musunuz? Onaylandığında kasa/bakiye hareketi oluşacak, varsa çek "elde" listesine eklenecektir.', async () => {
          await App.persist(() => App.tahsilatOnayBekleyenOnayla(t.id));
          App.toast('Tahsilat onaylandı: ' + t.musteriAdi, 'ok');
          render(main);
        });
      });
      wrap.querySelectorAll('.on-tahsilat-reddet').forEach(b => b.onclick = () => {
        App.confirmDialog('Bu tahsilat kaydını reddetmek istediğinize emin misiniz? Hiçbir kasa/bakiye hareketi oluşmayacaktır.', async () => {
          await App.persist(() => App.tahsilatOnayBekleyenReddet(b.dataset.id));
          App.toast('Tahsilat kaydı reddedildi', 'err');
          render(main);
        });
      });
    }

    function renderKomisyonList(list) {
      const wrap = document.getElementById('on-komisyon-list');
      if (!list.length) { wrap.innerHTML = `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Onay bekleyen komisyon yok.</div></div>`; return; }
      let html = `<table class="dtable"><tr><th>Kod</th><th>Kalem</th><th>Seçilen Tedarikçi</th><th class="r">Tutar</th><th></th></tr>`;
      list.forEach(k => {
        const secilen = k.secilenIndex != null ? k.teklifler[k.secilenIndex] : null;
        html += `<tr><td class="mono">${k.kod}</td><td>${App.escapeHtml(k.kalemAdi)}</td>
          <td>${secilen ? App.escapeHtml(secilen.tedarikciAdi) : '—'}</td>
          <td class="r"><b>${secilen ? App.fmtTL(secilen.toplamTL) : '—'}</b></td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost on-detay-kom" data-id="${k.id}">Detay</button>
            <button class="btn btn-sm btn-green on-onayla-kom" data-id="${k.id}">Onayla</button>
            <button class="btn btn-sm on-reddet-kom" data-id="${k.id}">Reddet</button>
          </td></tr>`;
      });
      html += `</table>`;
      wrap.innerHTML = html;
      wrap.querySelectorAll('.on-detay-kom').forEach(b => b.onclick = () => {
        const k = list.find(x => x.id === b.dataset.id);
        openKomisyonDetayModal(k);
      });
      wrap.querySelectorAll('.on-onayla-kom').forEach(b => b.onclick = async () => {
        const k = list.find(x => x.id === b.dataset.id);
        k.durum = 'onaylandi';
        await App.persist(() => Store.teklifKarsilastirma.upsert(k));
        const sat = satinalmaTalepleri.find(s => s.id === k.satinalmaTalepId);
        if (sat) { sat.durum = 'tamamlandi'; await App.persist(() => Store.satinalmaTalepleri.upsert(sat)); }
        App.toast('Komisyon onaylandı: ' + k.kod, 'ok');
        render(main);
      });
      wrap.querySelectorAll('.on-reddet-kom').forEach(b => b.onclick = () => {
        App.confirmDialog('Bu komisyonu reddetmek istediğinize emin misiniz?', async () => {
          const k = list.find(x => x.id === b.dataset.id);
          App.openModal({
            title: 'Reddetme Notu', body: (() => { const d = document.createElement('div'); d.innerHTML = '<div class="fgroup"><label class="flbl">Gerekçe</label><textarea class="ftextarea" id="redd-not"></textarea></div>'; return d; })(),
            footer: '<button class="btn" id="redd-cancel">Vazgeç</button><button class="btn btn-red" id="redd-confirm">Reddet</button>'
          });
          document.getElementById('redd-cancel').onclick = App.closeModal;
          document.getElementById('redd-confirm').onclick = async () => {
            k.durum = 'reddedildi';
            k.reddNotu = document.getElementById('redd-not').value.trim();
            await App.persist(() => Store.teklifKarsilastirma.upsert(k));
            App.toast('Komisyon reddedildi', 'ok');
            App.closeModal();
            render(main);
          };
        });
      });
    }

    function openKomisyonDetayModal(k) {
      const secilen = k.secilenIndex != null ? k.teklifler[k.secilenIndex] : null;
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:10px"><b class="mono">${k.kod}</b> — ${App.escapeHtml(k.kalemAdi)} · ${App.fmt(k.miktar, 0)} ${k.birim || ''}</div>
        <table class="dtable"><tr><th>Tedarikçi</th><th class="r">Birim Fiyat</th><th>Döviz</th><th class="r">Termin</th><th class="r">Toplam (₺)</th><th></th></tr>
          ${k.teklifler.filter(t => t.tedarikciAdi).map((t, i) => `<tr style="${k.secilenIndex === k.teklifler.indexOf(t) ? 'background:var(--green-bg)' : ''}">
            <td>${App.escapeHtml(t.tedarikciAdi)}</td><td class="r">${App.fmt(t.birimFiyat, 2)}</td><td>${t.dvz}</td>
            <td class="r">${t.terminGun || '—'} gün</td><td class="r"><b>${App.fmtTL(t.toplamTL)}</b></td>
            <td>${k.secilenIndex === k.teklifler.indexOf(t) ? '<span class="pill pill-green">✓ Seçildi</span>' : ''}</td></tr>`).join('')}
        </table>
        ${k.secimGerekcesi ? `<div class="card" style="background:var(--blue-bg);border-color:var(--blue-light);margin-top:12px"><div style="font-size:11.5px;color:var(--blue-text)"><b>Seçim Gerekçesi:</b> ${App.escapeHtml(k.secimGerekcesi)}</div></div>` : '<div class="fhint" style="margin-top:10px">Bu komisyon için seçim gerekçesi girilmemiş.</div>'}
        ${k.not ? `<div class="fhint" style="margin-top:8px"><b>Komisyon Notu:</b> ${App.escapeHtml(k.not)}</div>` : ''}
      `;
      App.openModal({ title: 'Tedarikçi Teklif Karşılaştırması', sub: secilen ? 'Önerilen: ' + secilen.tedarikciAdi : '', body, footer: '<button class="btn" id="kdm-close">Kapat</button>', wide: true });
      document.getElementById('kdm-close').onclick = App.closeModal;
    }

    function renderSiparisList(list, musteriler) {
      const wrap = document.getElementById('on-siparis-list');
      if (!list.length) { wrap.innerHTML = `<div class="empty-state" style="padding:18px 10px"><div class="edesc">Onay bekleyen sipariş yok.</div></div>`; return; }
      let html = `<table class="dtable"><tr><th>Kod</th><th>Müşteri</th><th class="r">Toplam</th><th>Peşinat</th><th>Ödeme Kalemleri</th><th>En Son Vade</th><th class="r">Vade Farkı</th><th>Tarih</th><th></th></tr>`;
      const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı', nakit: 'Nakit', diger: 'Diğer' };
      list.forEach(s => {
        const op = s.odemePlani || {};
        const kalemler = op.odemeKalemleri || [];
        const enSonVade = kalemler.length ? kalemler.map(k => k.tarih).filter(Boolean).sort().slice(-1)[0] : null;
        const vadeFarki = hesaplaVadeFarki(s, op);
        const ozetEtiketler = [...new Set(kalemler.map(k => tipLabel[k.tip]))];
        html += `<tr>
          <td class="mono">${s.kod}</td><td>${App.escapeHtml(s.musteriAdi)}</td><td class="r"><b>${App.fmtTL(s.toplam)}</b></td>
          <td>${op.pesinatTutar ? App.fmtTL(op.pesinatTutar) : '<span class="muted">Yok</span>'}</td>
          <td>${ozetEtiketler.length ? ozetEtiketler.map(t => `<span class="pill pill-gray">${t}</span>`).join(' ') : '<span class="muted">Yok</span>'}${op.sozlesmeVar ? ' <span class="pill pill-green">Sözleşmeli</span>' : ''}</td>
          <td style="font-size:11px">${enSonVade || '—'}</td>
          <td class="r">${vadeFarki > 0 ? '<span style="color:var(--red-text)">+' + App.fmtTL(vadeFarki) + '</span>' : '—'}</td>
          <td style="font-size:11px">${s.tarih}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost on-detay-sip" data-id="${s.id}">İçerik</button>
            <button class="btn btn-sm btn-green on-onayla-sip" data-id="${s.id}">Onayla</button>
            <button class="btn btn-sm on-reddet-sip" data-id="${s.id}">Reddet</button>
          </td></tr>`;
      });
      html += `</table>`;
      wrap.innerHTML = html;
      wrap.querySelectorAll('.on-detay-sip').forEach(b => b.onclick = () => {
        const s = list.find(x => x.id === b.dataset.id);
        onaylaSiparis(s);
      });
      wrap.querySelectorAll('.on-onayla-sip').forEach(b => b.onclick = () => {
        const s = list.find(x => x.id === b.dataset.id);
        onaylaSiparis(s);
      });
      wrap.querySelectorAll('.on-reddet-sip').forEach(b => b.onclick = () => {
        App.confirmDialog('Bu siparişi reddetmek istediğinize emin misiniz?', async () => {
          const s = list.find(x => x.id === b.dataset.id);
          s.durum = 'reddedildi';
          await App.persist(() => Store.siparisler.upsert(s));
          App.siparisReddindeTeklifSorusu(s, () => {
            App.toast('Sipariş reddedildi', 'ok');
            render(main);
          });
        });
      });
    }

    // Sipariş içeriğini ve ödeme/vade bilgisini göstererek nihai onayı verir.
    // Yönetim, ödeme/vade bilgisini onaylamadan önce isterse düzenleyebilir
    // (aynı paylaşılan modal, "Düzenle" butonuyla düzenlenebilir moda geçer).
    function onaylaSiparis(s) {
      App.siparisIcerikVeOdemeFormuAc(s, {
        mod: 'yonetim',
        duzenlenebilir: true,
        onaylaButonMetni: 'Onayla',
        onOnayla: async (odemePlani) => {
          // İDEMPOTENTLİK KORUMASI: modal açıldıktan sonra sipariş başka bir
          // yerden (ör. başka bir yönetici, veya bu ekranın bayat listesi
          // üzerinden ikinci kez "Onayla") zaten işlenmiş olabilir. Onaya
          // devam etmeden HEMEN ÖNCE sunucudaki güncel durumu tekrar kontrol
          // et — 'yonetim_onay_bekliyor' değilse kesim/ödeme işlemi TEKRAR
          // tetiklenmez (çift kesim ihtiyacı / çift raf stok düşümü riski).
          const guncelSiparisler = await Store.siparisler.all();
          const guncel = guncelSiparisler.find(x => x.id === s.id);
          if (!guncel || guncel.durum !== 'yonetim_onay_bekliyor') {
            App.toast('Bu sipariş zaten işlenmiş veya durumu değişmiş, tekrar onaylanamaz.', 'err');
            render(main);
            return;
          }
          s.odemePlani = odemePlani;
          s.durum = 'onaylandi';
          s.uretimKuyrugunda = true;
          // KULLANICI KARARI: Sipariş onaylanıp planlamaya düştüğü anda
          // peşinat+çek+kredi kartı ANINDA gerçekleşmiş sayılır (vade farkı
          // düşülerek kasaya girer, çek hemen kullanılabilir hale gelir).
          // Sadece ileri tarihli NAKİT kalemler ayrıca onay bekler.
          const musteriler = await Store.musteriler.all();
          const musteri = musteriler.find(m => m.id === s.musteriId);
          const odemeSonuc = await App.persist(() => App.siparisOnaylaninceOdemePlaniniAnindaIsle(s, musteri));
          if (musteri) await Store.musteriler.save(musteriler);
          await App.persist(() => Store.siparisler.upsert(s));
          const kesimSonuc = await App.persist(() => App.siparisOnaylaninceKesimIhtiyaciOlustur(s));
          let mesaj = 'Sipariş onaylandı: ' + s.kod;
          if (odemeSonuc) {
            mesaj += ` ${App.fmtTL(odemeSonuc.netKasaToplami)} kasaya işlendi`;
            if (odemeSonuc.toplamVadeFarki > 0) mesaj += ` (${App.fmtTL(odemeSonuc.toplamVadeFarki)} vade farkı düşüldü)`;
            if (odemeSonuc.ileriTarihliNakitSayisi > 0) mesaj += `, ${odemeSonuc.ileriTarihliNakitSayisi} ileri tarihli nakit alacak takibe alındı.`;
          }
          if (kesimSonuc && (kesimSonuc.olusturulan || kesimSonuc.guncellenen)) {
            mesaj += ` Kesim Optimizasyonu'na ${kesimSonuc.olusturulan} yeni, ${kesimSonuc.guncellenen} güncellenen satır düştü.`;
          }
          if (kesimSonuc && (kesimSonuc.hammaddeOlusturulan || kesimSonuc.hammaddeGuncellenen)) {
            mesaj += ` Hammadde ihtiyacına ${kesimSonuc.hammaddeOlusturulan} yeni, ${kesimSonuc.hammaddeGuncellenen} güncellenen kalem düştü.`;
          }
          App.toast(mesaj, 'ok');
          render(main);
        },
        onReddet: () => {
          App.confirmDialog('Bu siparişi reddetmek istediğinize emin misiniz?', async () => {
            s.durum = 'reddedildi';
            await App.persist(() => Store.siparisler.upsert(s));
            App.siparisReddindeTeklifSorusu(s, () => {
              App.toast('Sipariş reddedildi', 'ok');
              render(main);
            });
          });
        }
      });
    }

    // Vade farkı: en son ödeme kalemi vadesi geçmişse, geçen ay sayısı ×
    // aylık TCMB faiz oranı (Ayarlar'dan manuel girilir) × kalan bakiye
    // (peşinat düşülmüş tutar)
    function hesaplaVadeFarki(siparis, odemePlani) {
      const kalemler = odemePlani.odemeKalemleri || [];
      if (!kalemler.length) return 0;
      const enSonVade = kalemler.map(k => k.tarih).filter(Boolean).sort().slice(-1)[0];
      if (!enSonVade) return 0;
      const vade = new Date(enSonVade);
      const bugun = new Date();
      if (vade >= bugun) return 0;
      const gecenGun = (bugun - vade) / 86400000;
      const gecenAy = gecenGun / 30;
      const kalanBakiye = siparis.toplam - (odemePlani.pesinatTutar || 0);
      const aylikFaizOrani = (App.state.ayarlar.aylikVadeFarkiFaizOrani || 0) / 100;
      return kalanBakiye * aylikFaizOrani * gecenAy;
    }
  }

  return { render };
})();
