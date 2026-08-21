// ════════════════════════════════════════════════════════════════════════════
// QR + TEKNİK DOSYA MODÜLÜ (paylaşılan)
//
// Her karta (bitmiş ürün, yarı mamül, alt montaj, ürün paketi, hammadde/
// hırdavat) bir QR kod ve bir dosya alanı verir. QR, telefonla okutulunca
// api.php'nin HERKESE AÇIK görüntüleyicisini açar: yüklenmiş step/dwg/pdf/
// excel/resim dosyaları listelenir ve indirilebilir. Erişim, QR içindeki
// tahmin edilemez "yetenek anahtarı" ile korunur — uygulama girişi gerekmez.
//
// Kullanım: QrDosya.ac('urun'|'yarimamul'|'altmontaj'|'paket'|'hammadde',
//                       refId, kod, ad)
// ════════════════════════════════════════════════════════════════════════════
const QrDosya = (() => {

  const TIP_ETIKET = {
    urun: 'Bitmiş Ürün', yarimamul: 'Yarı Mamül', altmontaj: 'Alt Montaj',
    paket: 'Ürün Paketi', hammadde: 'Hammadde / Hırdavat'
  };
  const IZINLI_UZANTILAR = '.step,.stp,.dwg,.dxf,.pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.gif';
  const MAX_BAYT = 15 * 1024 * 1024;

  function boyutYazi(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
    if (b >= 1024) return Math.round(b / 1024) + ' KB';
    return b + ' B';
  }
  function dosyaIkonu(uzanti) {
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(uzanti)) return '🖼️';
    return { pdf: '📄', xls: '📊', xlsx: '📊', csv: '📊', dwg: '📐', dxf: '📐', step: '⚙️', stp: '⚙️' }[uzanti] || '📎';
  }
  // QR'ın kodladığı herkese açık görüntüleyici adresi
  function goruntuleUrl(tip, refId, anahtar) {
    const kok = location.origin + location.pathname.replace(/index\.html?$/, '');
    return kok + 'api.php?action=qrGoruntule&r=' + encodeURIComponent(tip + ':' + refId) + '&k=' + encodeURIComponent(anahtar);
  }
  function indirUrl(tip, refId, anahtar, dosyaId) {
    const kok = location.origin + location.pathname.replace(/index\.html?$/, '');
    return kok + 'api.php?action=dosyaIndir&r=' + encodeURIComponent(tip + ':' + refId) + '&k=' + encodeURIComponent(anahtar) + '&f=' + encodeURIComponent(dosyaId);
  }

  async function ac(tip, refId, kod, ad) {
    if (!Store.sunucuModu) { App.toast('Dosya alanı yalnızca sunucu (hosting) sürümünde çalışır', 'err'); return; }
    let kayit;
    try {
      kayit = await Store.qrKayitGetir(tip, refId, kod, ad);
    } catch (e) {
      App.toast('QR kaydı alınamadı: ' + e.message, 'err');
      return;
    }
    const url = goruntuleUrl(tip, refId, kayit.anahtar);

    const body = document.createElement('div');
    body.innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <!-- Sol: QR kod + yazdır -->
        <div style="text-align:center;min-width:190px">
          <div id="qd-qr" style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:10px;display:inline-block"></div>
          <div class="mono" style="font-size:12px;font-weight:800;margin-top:6px">${App.escapeHtml(kod || '')}</div>
          <div style="font-size:10.5px;color:var(--text3);max-width:190px;margin:2px auto 8px">${App.escapeHtml(ad || '')}</div>
          <button class="btn btn-sm" id="qd-yazdir" style="width:100%">🖨 QR Etiketi Yazdır</button>
          <button class="btn btn-sm" id="qd-kopyala" style="width:100%;margin-top:6px">🔗 Bağlantıyı Kopyala</button>
          <div class="fhint" style="margin-top:8px;text-align:left">Telefon kamerasıyla okutulunca dosya sayfası açılır — uygulama girişi <b>gerekmez</b>. Bağlantıyı bilmeyen kimse erişemez.</div>
        </div>
        <!-- Sağ: dosya alanı -->
        <div style="flex:1;min-width:260px">
          <div class="card-title" style="font-size:12px;margin-bottom:8px">📁 TEKNİK DOSYALAR <span class="muted" style="font-weight:400">(step, dwg, dxf, pdf, excel, resim — en fazla 15 MB)</span></div>
          <label class="btn btn-blue btn-sm" style="display:inline-block;cursor:pointer">
            ⬆ Dosya Yükle <input type="file" id="qd-sec" multiple accept="${IZINLI_UZANTILAR}" style="display:none">
          </label>
          <span id="qd-durum" style="font-size:11px;color:var(--text3);margin-left:8px"></span>
          <div id="qd-liste" style="margin-top:10px"></div>
        </div>
      </div>`;

    App.openModal({
      title: `📎 QR & Teknik Dosyalar — ${TIP_ETIKET[tip] || tip}`,
      body,
      footer: `<button class="btn" id="qd-kapat">Kapat</button>`,
      wide: true
    });
    document.getElementById('qd-kapat').onclick = App.closeModal;

    // QR çiz (yerel üreteç — internetsiz de çalışır)
    document.getElementById('qd-qr').innerHTML = QrKod.svg(url, 170);

    document.getElementById('qd-kopyala').onclick = async () => {
      try { await navigator.clipboard.writeText(url); App.toast('Bağlantı panoya kopyalandı', 'ok'); }
      catch (e) { window.prompt('Bağlantıyı kopyalayın:', url); }
    };

    document.getElementById('qd-yazdir').onclick = () => {
      const p = window.open('', '_blank', 'width=420,height=520');
      p.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${App.escapeHtml(kod || '')}</title>
        <style>body{font-family:sans-serif;text-align:center;padding:16px}
        .kod{font-family:monospace;font-weight:800;font-size:16px;margin-top:8px}
        .ad{font-size:12px;color:#444;margin-top:2px}
        .tip{font-size:10px;color:#777;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
        @media print{button{display:none}}</style></head><body>
        ${QrKod.svg(url, 220)}
        <div class="kod">${App.escapeHtml(kod || '')}</div>
        <div class="ad">${App.escapeHtml(ad || '')}</div>
        <div class="tip">${TIP_ETIKET[tip] || tip} — ÜretimOS</div>
        <br><button onclick="print()">🖨 Yazdır</button></body></html>`);
      p.document.close();
    };

    const listeCiz = (dosyalar) => {
      const el = document.getElementById('qd-liste');
      if (!dosyalar.length) {
        el.innerHTML = '<div class="muted" style="font-size:11.5px;padding:8px 0">Henüz dosya yüklenmemiş. Yüklenen her dosya, QR okutulunca telefonda görünür.</div>';
        return;
      }
      el.innerHTML = dosyalar.map(d => `
        <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:6px">
          <div style="font-size:20px">${dosyaIkonu(d.uzanti)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;word-break:break-all">${App.escapeHtml(d.ad)}</div>
            <div class="muted" style="font-size:10px">${boyutYazi(d.boyut)} · ${App.escapeHtml(d.tarih || '')} · ${App.escapeHtml(d.yukleyen || '')}</div>
          </div>
          <a class="btn btn-sm" href="${indirUrl(tip, refId, kayit.anahtar, d.id)}" target="_blank" rel="noopener">⬇</a>
          <button class="btn btn-sm qd-sil" data-id="${d.id}" style="color:var(--red-text)">🗑</button>
        </div>`).join('');
      el.querySelectorAll('.qd-sil').forEach(b => b.onclick = async () => {
        const d = dosyalar.find(x => x.id === b.dataset.id);
        if (!d || !window.confirm('"' + d.ad + '" silinsin mi?')) return;
        try {
          const sonuc = await Store.teknikDosyaSil(tip, refId, d.id);
          kayit.dosyalar = sonuc.dosyalar;
          listeCiz(kayit.dosyalar);
          App.toast('Dosya silindi', 'ok');
        } catch (e) { App.toast('Silinemedi: ' + e.message, 'err'); }
      });
    };
    listeCiz(kayit.dosyalar || []);

    document.getElementById('qd-sec').onchange = async (ev) => {
      const dosyalar = [...ev.target.files];
      ev.target.value = '';
      const durum = document.getElementById('qd-durum');
      for (let i = 0; i < dosyalar.length; i++) {
        const f = dosyalar[i];
        if (f.size > MAX_BAYT) { App.toast(f.name + ' 15 MB sınırını aşıyor — atlandı', 'err'); continue; }
        durum.textContent = `Yükleniyor ${i + 1}/${dosyalar.length}: ${f.name}…`;
        try {
          const b64 = await new Promise((cozul, hata) => {
            const okur = new FileReader();
            okur.onload = () => cozul(String(okur.result).split(',')[1]);
            okur.onerror = () => hata(new Error('Dosya okunamadı'));
            okur.readAsDataURL(f);
          });
          const sonuc = await Store.teknikDosyaYukle({ tip, refId, kod, ad, dosyaAdi: f.name, icerikB64: b64 });
          kayit.dosyalar = sonuc.dosyalar;
          listeCiz(kayit.dosyalar);
        } catch (e) {
          App.toast(f.name + ' yüklenemedi: ' + e.message, 'err');
        }
      }
      durum.textContent = '';
      if (dosyalar.length) App.toast('Yükleme tamamlandı', 'ok');
    };
  }

  // ── İŞ KARTINDAN DOSYALARA HIZLI ERİŞİM ─────────────────────────────────
  // Üretim ekranı / operatör terminalindeki "📁 Dosyalar" tuşu bunu çağırır.
  // Parçanın teknik dosya sayfasını YENİ SEKMEDE açar; sayfa mobil uyumludur,
  // dosyalar görüntülenip indirilebilir. Operatör terminali de kullanabilir.
  async function linkAc(tip, refId, kod) {
    if (!Store.sunucuModu) { App.toast('Dosya alanı yalnızca sunucu (hosting) sürümünde çalışır', 'err'); return; }
    let sonuc;
    try {
      sonuc = await Store.qrBaglantiGetir(tip, refId, kod);
    } catch (e) {
      App.toast('Dosya bağlantısı alınamadı: ' + e.message, 'err');
      return;
    }
    if (!sonuc.bulundu || !sonuc.dosyaSayisi) {
      App.toast('Bu parça için henüz dosya yüklenmemiş (' + (kod || refId) + ')', 'err');
      return;
    }
    const kok = location.origin + location.pathname.replace(/index\.html?$/, '');
    const url = kok + 'api.php?action=qrGoruntule&r=' + encodeURIComponent(sonuc.r) + '&k=' + encodeURIComponent(sonuc.anahtar);
    window.open(url, '_blank', 'noopener');
  }

  // ── KART İÇİ DOSYALARI SUNUCUYA AKTAR (KÖPRÜ) ───────────────────────────
  // Kart formlarındaki "Teknik Dosyalar" alanı dosyayı kartın İÇİNE (gorseller
  // dizisi, dataUrl olarak) gömer. Bu eski yöntemle yüklenen dosyalar QR
  // sayfasında GÖRÜNMEZ. Bu yardımcı, kart kaydedildiğinde henüz sunucuya
  // gitmemiş dosyaları QR dosya alanına yükler ve kayda 'sunucuId' işler
  // (tekrar tekrar yüklenmesini önler). Böylece kullanıcı formdan yüklemeye
  // devam eder, dosyalar otomatik olarak QR/telefon sayfasında belirir.
  // Kart görsellerini sunucuya aktarır ve BAŞARILI aktarımdan sonra ağır
  // base64 içeriğini karttan SİLER.
  //
  // ÖNCEKİ DAVRANIŞ (hata): dosya sunucuya yükleniyor, g.sunucuId yazılıyor
  // ama g.dataUrl olduğu gibi KALIYORDU. Sonuç: aynı görsel hem diskte hem
  // koleksiyon JSON'unun içinde iki kez duruyor, blob hiç küçülmüyordu.
  // Tek bir 2 MB'lık fotoğraf base64'te ~2,7 MB yer kaplar ve o koleksiyona
  // yapılan HER okuma/yazmada baştan sona taşınır.
  //
  // YENİ DAVRANIŞ: yükleme doğrulandıktan sonra dataUrl silinir; kartta
  // yalnızca birkaç onlarca baytlık referans kalır ({name, sunucuId, r, k}).
  // Görüntüleme GorselKaynak.url() ile sunucudan yapılır.
  async function kartDosyalariniSunucuyaAktar(tip, refId, kod, ad, gorseller) {
    if (!Store.sunucuModu || !Array.isArray(gorseller) || !gorseller.length) return 0;
    let aktarilan = 0;
    for (const g of gorseller) {
      if (!g || g.sunucuId || !g.dataUrl) continue;      // zaten aktarılmış / içerik yok
      const b64 = String(g.dataUrl).split(',')[1];
      if (!b64) continue;
      try {
        const sonuc = await Store.teknikDosyaYukle({
          tip, refId, kod, ad, dosyaAdi: g.name || ('dosya-' + Date.now()), icerikB64: b64
        });
        const liste = sonuc.dosyalar || [];
        const yeni = liste[liste.length - 1];
        // GÜVENLİK KONTROLÜ: base64'ü ancak sunucunun dosyayı gerçekten
        // kaydettiğini DOĞRULADIKTAN sonra silebiliriz. Kimlik ya da anahtar
        // eksikse dataUrl'e dokunulmaz — veri kaybı riski alınmaz.
        if (yeni && yeni.id && sonuc.anahtar) {
          g.sunucuId = yeni.id;
          g.r = tip + ':' + refId;      // dosyaIndir ucunun kayıt anahtarı
          g.k = sonuc.anahtar;          // kayda özel gizli anahtar
          g.uzanti = yeni.uzanti || '';
          g.boyut = yeni.boyut || 0;
          delete g.dataUrl;             // ← ASIL KAZANÇ: ağır içerik karttan çıkar
          aktarilan++;
        } else {
          console.warn('Sunucu yanıtı eksik, dataUrl korunuyor:', g.name);
        }
      } catch (e) {
        console.error('Dosya sunucuya aktarılamadı:', g.name, e);
        App.toast((g.name || 'Dosya') + ' sunucuya aktarılamadı: ' + e.message, 'err');
      }
    }
    return aktarilan;
  }

  // ── GÖRSEL KAYNAĞI ────────────────────────────────────────────────────────
  // Bir görsel kaydından gösterilebilir adres üretir. İKİ biçimi de destekler:
  //   · YENİ  → {sunucuId, r, k}  : sunucudan akışla gelir (kart hafif kalır)
  //   · ESKİ  → {dataUrl}         : kartın içine gömülü base64 (göç etmemiş)
  // Böylece göç kademeli yapılabilir; eski kayıtlar bozulmadan çalışmaya
  // devam eder.
  function gorselUrl(g) {
    if (!g) return '';
    if (g.sunucuId && g.r && g.k) {
      return 'api.php?action=dosyaIndir'
           + '&r=' + encodeURIComponent(g.r)
           + '&k=' + encodeURIComponent(g.k)
           + '&f=' + encodeURIComponent(g.sunucuId)
           + '&goster=1';
    }
    return g.dataUrl || '';
  }

  // Görsel olarak gösterilebilir mi? (pdf/step gibi dosyalar için ikon çizilir)
  function gorselMi(g) {
    if (!g) return false;
    if (g.dataUrl) return /^data:image/.test(g.dataUrl);
    const u = String(g.uzanti || '').toLowerCase()
           || String(g.name || '').split('.').pop().toLowerCase();
    return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(u);
  }

  // ── TARİHE GÖRE KLASÖR AĞACI (Yıl → Ay → Gün) ───────────────────────────
  // Cari (müşteri/tedarikçi) gibi kartların altına zaman içinde birikmiş
  // dosyaları (örn. iş emirleri) tıklanabilir klasör hiyerarşisinde gösterir.
  // İşlem olmayan gün/ay/yıl için hiçbir klasör OLUŞTURULMAZ — sadece dosyası
  // olan tarihler görünür.
  const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  async function tarihliDosyalarAc(tip, refId, kod, ad) {
    if (!Store.sunucuModu) { App.toast('Dosya alanı yalnızca sunucu (hosting) sürümünde çalışır', 'err'); return; }
    let kayit;
    try { kayit = await Store.qrKayitGetir(tip, refId, kod, ad); }
    catch (e) { App.toast('Dosyalar alınamadı: ' + e.message, 'err'); return; }

    // Yıl → Ay → Gün → [dosyalar] ağacını kur (yalnızca dosyası olan dallar)
    const agac = {};
    (kayit.dosyalar || []).forEach(d => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.tarih || '');
      if (!m) return;
      const [, yil, ay, gun] = m;
      (agac[yil] = agac[yil] || {});
      (agac[yil][ay] = agac[yil][ay] || {});
      (agac[yil][ay][gun] = agac[yil][ay][gun] || []).push(d);
    });

    let yol = [];   // [] kök · [yil] · [yil,ay] · [yil,ay,gun]
    const body = document.createElement('div');
    App.openModal({ title: `📁 ${App.escapeHtml(ad || kod)} — Dosyalar`, body, footer: `<button class="btn" id="qd-td-kapat">Kapat</button>`, wide: true });
    document.getElementById('qd-td-kapat').onclick = App.closeModal;

    const dalDosyaSayisi = (dal) => {
      if (Array.isArray(dal)) return dal.length;
      return Object.values(dal).reduce((a, x) => a + dalDosyaSayisi(x), 0);
    };

    function ciz() {
      const bcrumb = ['📁 Kök', ...yol.map((y, i) => i === 1 ? AY_ADLARI[+y - 1] : y)]
        .map((etiket, i) => `<span class="qd-td-crumb" data-derinlik="${i}" style="cursor:pointer;text-decoration:underline">${App.escapeHtml(etiket)}</span>`)
        .join(' <span class="muted">/</span> ');

      let dal = agac;
      for (const y of yol) dal = dal[y];

      let icerik = '';
      if (yol.length < 3) {
        // Klasör listesi (yıl / ay / gün seviyesi)
        const anahtarlar = Object.keys(dal).sort((a, b) => yol.length === 1 ? +a - +b : b.localeCompare(a));
        if (!anahtarlar.length) {
          icerik = '<div class="muted" style="padding:10px;font-size:11.5px">Bu klasörde dosya yok.</div>';
        } else {
          icerik = anahtarlar.map(k => {
            const etiket = yol.length === 1 ? AY_ADLARI[+k - 1] : (yol.length === 2 ? k : k);
            const sayi = dalDosyaSayisi(dal[k]);
            return `<div class="qd-td-klasor" data-k="${k}" style="display:flex;align-items:center;gap:8px;
              border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer">
              <span style="font-size:18px">📁</span>
              <span style="flex:1;font-size:12.5px;font-weight:600">${App.escapeHtml(String(etiket))}</span>
              <span class="muted" style="font-size:11px">${sayi} dosya</span></div>`;
          }).join('');
        }
      } else {
        // Gün seviyesi: dosya listesi
        icerik = dal.map(d => `
          <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:6px">
            <div style="font-size:20px">${dosyaIkonu(d.uzanti)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:700;word-break:break-all">${App.escapeHtml(d.ad)}</div>
              <div class="muted" style="font-size:10px">${boyutYazi(d.boyut)} · ${App.escapeHtml(d.tarih || '')} · ${App.escapeHtml(d.yukleyen || '')}</div>
            </div>
            <a class="btn btn-sm" href="${indirUrl(tip, refId, kayit.anahtar, d.id)}" target="_blank" rel="noopener">⬇</a>
          </div>`).join('') || '<div class="muted" style="padding:10px;font-size:11.5px">Bu günde dosya yok.</div>';
      }

      body.innerHTML = `<div style="margin-bottom:10px;font-size:12px">${bcrumb}</div>${icerik}`;
      body.querySelectorAll('.qd-td-crumb').forEach(el => el.onclick = () => {
        yol = yol.slice(0, +el.dataset.derinlik);
        ciz();
      });
      body.querySelectorAll('.qd-td-klasor').forEach(el => el.onclick = () => {
        yol = [...yol, el.dataset.k];
        ciz();
      });
    }
    ciz();
  }

  return { ac, linkAc, kartDosyalariniSunucuyaAktar, gorselUrl, gorselMi, tarihliDosyalarAc };
})();
