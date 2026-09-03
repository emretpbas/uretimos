// ════════════════════════════════════════════════════════════════════════════
// İŞ EMRİ / SİPARİŞ İPTAL EKRANI
// ────────────────────────────────────────────────────────────────────────────
// Planlama, ÜRETİME GİRMEMİŞ iş emirlerini ve siparişleri iptal edebilir.
//
// TEMEL KURAL: Üretim fiilen başladıysa iptal EDİLEMEZ. Çünkü iptal edilen bir
// kayıt planlamadan düşer ama sarf edilen malzeme geri gelmez, hatta duran
// yarı mamul ortada kalır — stok kaydı ile fiziksel gerçek ayrışır. Bu ayrışma
// kayıp-kaçağın en sessiz kaynağıdır (bkz. Kayıp-Kaçak Kontrol Planı, K1).
//
// ENGELLEYİCİ SİNYALLER (herhangi biri varsa iptal kapalı):
//   1) Hat iş kartı açılmış ve ilerlemiş (kalite/işlem/sevk adedi > 0)
//   2) Operatör QR okutmuş (barkodOkundu) — parça hatta girmiş demektir
//   3) İş kartı tamamlanmış/sıfırlanmış (durum aktif değil)
//   4) Bu işe bağlı stok çıkışı (sarf) yapılmış
//   5) Kesim planı kaydedilmiş (plaka kesilmiş olabilir)
//   6) Depoya bu siparişten üretim girişi yapılmış
//
// İptal edilen kayıt SİLİNMEZ: durum 'iptal' olur, kim/ne zaman/neden bilgisi
// yazılır. Silme, denetim izini yok eder — iptal iz bırakmalıdır.
// ════════════════════════════════════════════════════════════════════════════
PageModules.iptal_islemleri = (() => {

  let aktifSekme = 'isemri';

  async function render(main) {
    const rol = App.aktifRol();
    const yetkili = ['admin', 'yonetim', 'uretim_planlama'].includes(rol);
    if (!yetkili) {
      main.innerHTML = `<div class="card"><div class="empty-state" style="padding:24px">
        <div class="edesc">Bu ekran yalnızca Üretim Planlama ve Yönetim tarafından kullanılabilir.</div>
      </div></div>`;
      return;
    }

    const [isemirleri, siparisler, istasyonIsleri, stokHareketleri, kesimIhtiyaclari, depoGirisleri] =
      await Promise.all([
        Store.isemirleri.all(), Store.siparisler.all(), Store.istasyonIsleri.all(),
        Store.stokHareketleri.all(), Store.kesimIhtiyaclari.all(), Store.depoGirisleri.all()
      ]);

    // ── İPTAL EDİLEBİLİRLİK DENETİMİ ────────────────────────────────────────
    // Tek fonksiyon: hem iş emri hem sipariş için engelleri toplar.
    // Boş dizi dönerse iptal edilebilir; dolu dönerse her madde bir engeldir.
    function engelleriBul(kayit, tip) {
      const engeller = [];
      const kaynakTip = tip === 'isemri' ? 'ie' : 'sip';

      // 1-3) Hat iş kartları
      const kartlar = istasyonIsleri.filter(i => i.kaynakTip === kaynakTip && i.kaynakId === kayit.id);
      kartlar.forEach(k => {
        const ilerleme = (+k.kaliteOnayliAdet || 0) + (+k.islemTamamAdet || 0) + (+k.sevkEdilenAdet || 0) + (+k.fireAdet || 0);
        if (ilerleme > 0) {
          engeller.push(`Hatta ilerleme var: ${k.ymKod || ''} — ${k.istasyonKod || ''} ` +
            `(kalite ${k.kaliteOnayliAdet || 0}, işlem ${k.islemTamamAdet || 0}, sevk ${k.sevkEdilenAdet || 0}${k.fireAdet ? ', fire ' + k.fireAdet : ''})`);
        } else if (k.barkodOkundu) {
          engeller.push(`Operatör QR okuttu, parça hatta girdi: ${k.ymKod || ''} — ${k.istasyonKod || ''}`);
        } else if (k.durum && k.durum !== 'aktif') {
          engeller.push(`İş kartı '${k.durum}' durumunda: ${k.ymKod || ''} — ${k.istasyonKod || ''}`);
        }
      });

      // 4) Bu işe bağlı stok çıkışı (malzeme sarfı)
      const sarflar = stokHareketleri.filter(h =>
        h.tip === 'cikis' && (h.isEmriId === kayit.id || h.siparisId === kayit.id ||
          (h.kaynakId && h.kaynakId === kayit.id)));
      if (sarflar.length) {
        const toplam = sarflar.reduce((a, h) => a + (+h.miktar || 0), 0);
        engeller.push(`${sarflar.length} stok çıkışı (sarf) yapılmış — toplam ${App.fmt(toplam, 1)} birim malzeme tüketilmiş`);
      }

      // 5) Kesim planı kaydedilmiş mi (plaka kesilmiş olabilir)
      const kesimler = kesimIhtiyaclari.filter(ks =>
        (ks.kaynakSiparisler || []).includes(kayit.id) &&
        (ks.sonucCache || ks.durum === 'kapali'));
      if (kesimler.length) {
        engeller.push(`${kesimler.length} kesim planı oluşturulmuş — plakalar kesilmiş olabilir`);
      }

      // 6) Bu siparişten depoya üretim girişi olmuş mu
      if (tip === 'siparis') {
        const girisler = depoGirisleri.filter(g => g.siparisId === kayit.id && g.durum && g.durum !== 'bekliyor');
        if (girisler.length) engeller.push(`${girisler.length} depo girişi yapılmış`);
      }

      return engeller;
    }

    // 'sevk_edildi' (müşteriye zaten gönderilmiş — irsaliye/fatura kesilmiş,
    // fiziksel mal gitmiş) ve 'reddedildi' (zaten kapanmış, geri dönüşü yok)
    // KAPALI sayılır — bunlar "açık" listesine hiç girmemeli. Sarf kontrolü
    // (aşağıdaki engelleriBul #4) de artık siparisId ile eşleşiyor (bkz.
    // app.js sevkiyatYapilinceStoktanDus), ama durum kontrolü ilk ve en
    // kesin engel olduğu için burada da açıkça hariç tutuluyor.
    // T3-23: kısmen sevk edilmiş ('kismi_sevk_edildi') siparişler de KAPALI
    // sayılır — bir kısmı zaten fiilen müşteriye gitmiş, tamamen iptal
    // edilemez (kalan kısım için ayrı bir süreç/iade gerekir).
    const iptalEdilebilirDurum = (d) => !['iptal', 'tamamlandi', 'kapatildi', 'sevk_edildi', 'kismi_sevk_edildi', 'reddedildi'].includes(d);
    const acikIsemirleri = isemirleri.filter(x => iptalEdilebilirDurum(x.durum));
    const acikSiparisler = siparisler.filter(x => iptalEdilebilirDurum(x.durum));

    const kartCiz = (kayit, tip) => {
      const engeller = engelleriBul(kayit, tip);
      const iptalOk = engeller.length === 0;
      const baslik = tip === 'isemri'
        ? `${App.escapeHtml(kayit.kod || kayit.id)} — ${App.escapeHtml(kayit.urunAdi || '')}`
        : `${App.escapeHtml(kayit.kod || kayit.id)} — ${App.escapeHtml(kayit.musteriAdi || '')}`;
      return `<div style="border:1px solid ${iptalOk ? 'var(--border)' : 'var(--amber-text)'};border-radius:9px;padding:10px 12px;margin-bottom:8px;background:${iptalOk ? 'var(--surface2)' : 'var(--amber-bg)'}">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start">
          <div style="flex:1;min-width:200px">
            <b style="font-size:12.5px">${baslik}</b>
            <div class="muted" style="font-size:10.5px;margin-top:2px">
              ${kayit.adet ? kayit.adet + ' adet · ' : ''}${App.escapeHtml(kayit.tarih || '')} · durum: ${App.escapeHtml(kayit.durum || '')}
            </div>
            ${iptalOk
              ? '<div style="font-size:11px;color:var(--green-text);margin-top:4px">✓ Üretime girmemiş — iptal edilebilir</div>'
              : `<div style="margin-top:6px">
                   <div style="font-size:11px;font-weight:600;color:var(--amber-text)">⛔ İPTAL EDİLEMEZ — üretim başlamış:</div>
                   ${engeller.slice(0, 4).map(e => `<div style="font-size:10.5px;color:var(--amber-text)">• ${App.escapeHtml(e)}</div>`).join('')}
                   ${engeller.length > 4 ? `<div style="font-size:10.5px;color:var(--amber-text)">• … ve ${engeller.length - 4} sebep daha</div>` : ''}
                 </div>`}
          </div>
          <div>
            ${iptalOk
              ? `<button class="btn btn-sm ip-iptal" data-id="${kayit.id}" data-tip="${tip}" style="background:var(--red);color:#fff;border:none">✕ İptal Et</button>`
              : `<button class="btn btn-sm" disabled style="opacity:.5;cursor:not-allowed">İptal Edilemez</button>`}
          </div>
        </div>
      </div>`;
    };

    const liste = aktifSekme === 'isemri' ? acikIsemirleri : acikSiparisler;
    const tip = aktifSekme;

    main.innerHTML = `
      <div class="page-hdr"><div>
        <div class="page-title">✕ İş Emri / Sipariş İptal</div>
        <div class="page-sub">Üretime girmemiş kayıtlar iptal edilebilir — sarf veya operasyon başladıysa engellenir</div>
      </div></div>

      <div class="card" style="padding:10px 14px;margin-bottom:12px">
        <div style="font-size:11.5px;color:var(--muted)">
          <b>Neden bazıları iptal edilemiyor?</b> Üretim başladıktan sonra iptal, planlamadan kaydı düşürür
          ama sarf edilen malzemeyi geri getirmez; yarı mamul hatta kalır. Stok kaydı ile fiziksel gerçek
          ayrışır — bu ayrışma sayım farklarının ve kaybın en sessiz kaynağıdır.
          Başlamış işler için <b>iptal değil</b>, kalite reddi / fire kaydı / iş emri kapatma yollarını kullanın.
        </div>
      </div>

      <div class="tabs" style="margin-bottom:12px">
        <div class="tab ${aktifSekme === 'isemri' ? 'active' : ''}" data-s="isemri">İş Emirleri (${acikIsemirleri.length})</div>
        <div class="tab ${aktifSekme === 'siparis' ? 'active' : ''}" data-s="siparis">Siparişler (${acikSiparisler.length})</div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">${aktifSekme === 'isemri' ? 'Açık İş Emirleri' : 'Açık Siparişler'}</div></div>
        ${liste.length ? liste.map(k => kartCiz(k, tip)).join('')
          : '<div class="muted" style="padding:12px;font-size:12px">İptal edilebilecek açık kayıt yok.</div>'}
      </div>`;

    main.querySelectorAll('.tab').forEach(t => t.onclick = () => { aktifSekme = t.dataset.s; render(main); });

    // ── İPTAL İŞLEMİ ────────────────────────────────────────────────────────
    main.querySelectorAll('.ip-iptal').forEach(b => b.onclick = async () => {
      try {
        const id = b.dataset.id, kayitTipi = b.dataset.tip;
        const koleksiyon = kayitTipi === 'isemri' ? Store.isemirleri : Store.siparisler;
        const tumu = await koleksiyon.all();
        const kayit = tumu.find(x => x.id === id);
        if (!kayit) { App.toast('Kayıt bulunamadı.', 'err'); return; }

        // SON KONTROL: ekran açıldığından beri üretim başlamış olabilir.
        // Bu yüzden iptal anında engeller TAZE veriyle yeniden hesaplanır.
        const [taze1, taze2, taze3, taze4] = await Promise.all([
          Store.istasyonIsleri.all(), Store.stokHareketleri.all(),
          Store.kesimIhtiyaclari.all(), Store.depoGirisleri.all()
        ]);
        istasyonIsleri.length = 0; istasyonIsleri.push(...taze1);
        stokHareketleri.length = 0; stokHareketleri.push(...taze2);
        kesimIhtiyaclari.length = 0; kesimIhtiyaclari.push(...taze3);
        depoGirisleri.length = 0; depoGirisleri.push(...taze4);

        const engeller = engelleriBul(kayit, kayitTipi);
        if (engeller.length) {
          App.openModal({
            title: '⛔ İptal Edilemez',
            sub: 'Bu kayıt için üretim başlamış',
            body: `<div style="font-size:12.5px;margin-bottom:8px">
                <b>${App.escapeHtml(kayit.kod || id)}</b> iptal edilemez. Tespit edilen engeller:
              </div>
              <div style="font-size:11.5px;line-height:1.8;border:1px solid var(--border);border-radius:8px;padding:8px">
                ${engeller.map(e => '• ' + App.escapeHtml(e)).join('<br>')}
              </div>
              <div class="muted" style="font-size:11px;margin-top:8px">
                Üretim başladıktan sonra iptal, stok kaydı ile fiziksel gerçeği ayrıştırır.
                Bunun yerine: kalite reddi, fire kaydı veya iş emrini kapatma yollarını kullanın.
              </div>`,
            footer: '<button class="btn" id="ip-kapat">Anladım</button>'
          });
          document.getElementById('ip-kapat').onclick = App.closeModal;
          render(main);
          return;
        }

        // Gerekçe zorunlu — iptal iz bırakmalı
        const gerekce = await new Promise((resolve) => {
          App.redGerekceDialog('İptal Gerekçesi',
            `"${kayit.kod || id}" iptal edilecek. Kayıt SİLİNMEZ, 'iptal' olarak işaretlenir.`,
            (g) => resolve(g));
        });
        if (!gerekce) return;

        kayit.durum = 'iptal';
        kayit.iptalBilgi = {
          kim: App.aktifRol(),
          tarih: new Date().toISOString(),
          gerekce
        };
        await App.persist(() => koleksiyon.upsert(kayit));

        // Bu kayda bağlı AÇIK hat iş kartları da kapatılır (boşta kalmasın)
        const bagliKartlar = taze1.filter(i =>
          i.kaynakTip === (kayitTipi === 'isemri' ? 'ie' : 'sip') &&
          i.kaynakId === id && i.durum === 'aktif');
        if (bagliKartlar.length) {
          bagliKartlar.forEach(k => {
            k.durum = 'iptal';
            k.iptalBilgi = { kim: App.aktifRol(), tarih: new Date().toISOString(), gerekce: 'Bağlı kayıt iptal edildi' };
          });
          await App.persist(() => Store.istasyonIsleri.save(taze1));
        }

        App.toast(`${kayit.kod || id} iptal edildi${bagliKartlar.length ? ` (${bagliKartlar.length} hat kartı da kapatıldı)` : ''}.`, 'ok');
        render(main);
      } catch (e) {
        App.toast('İptal edilemedi: ' + (e && e.message ? e.message : e), 'err');
      }
    });
  }

  return { render };
})();
