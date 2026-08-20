// ════════════════════════════════════════════════════════════════════════════
// AĞ ENTEGRASYONU — Logo ERP siparişleri + Cost sistemi reçeteleri
// ────────────────────────────────────────────────────────────────────────────
// Şirket içi ağda iki kaynaktan veri çeker:
//   1) LOGO SİPARİŞ — cari onayına düşen siparişler
//   2) COST REÇETE  — ürün kartları ve reçeteleri (maliyet sistemi)
//
// TASARIM İLKESİ — ALAN EŞLEME:
// Karşı sistemin JSON alan adları önceden bilinemez (her kurulumda farklıdır).
// Bu yüzden alan adları SABİT KODLANMAZ; kullanıcı arayüzünden eşlenir.
// Böylece bilgi işlem uç noktayı hazırladığında kod değişikliği gerekmez.
//
// GÜVENLİK:
// • Kimlik bilgisi (API anahtarı) yerel olarak saklanır, sunucuya gönderilmez
// • Yalnızca OKUMA yapılır — karşı sisteme yazma yoktur
// • Gelen veri ÖNİZLENİR, kullanıcı onaylamadan sisteme işlenmez
// ════════════════════════════════════════════════════════════════════════════
const AgEntegrasyon = (() => {

  const AYAR_ANAHTARI = 'uretimos_ag_entegrasyon';
  const ZAMAN_ASIMI = 30000;   // 30 sn — LAN'da yavaş uç noktalar olabilir

  const VARSAYILAN = {
    siparis: {
      url: '', yontem: 'GET', kimlikTipi: 'yok', kimlik: '', basligAdi: 'X-API-Key',
      kokAlan: '',                 // yanıt bir nesne içindeyse dizinin yolu: "data.orders"
      eslesme: {
        kod: '', musteriAdi: '', tarih: '', terminTarihi: '',
        tutar: '', durum: '', aciklama: '', kalemler: ''
      },
      kalemEslesme: { urunKodu: '', urunAdi: '', miktar: '', birim: '', birimFiyat: '' }
    },
    recete: {
      url: '', yontem: 'GET', kimlikTipi: 'yok', kimlik: '', basligAdi: 'X-API-Key',
      kokAlan: '',
      eslesme: { kod: '', ad: '', birim: '', kalemler: '' },
      kalemEslesme: { malzemeKodu: '', malzemeAdi: '', miktar: '', birim: '' }
    },
    sonSenkron: { siparis: null, recete: null }
  };

  function ayarOku() {
    try {
      const h = localStorage.getItem(AYAR_ANAHTARI);
      if (!h) return JSON.parse(JSON.stringify(VARSAYILAN));
      const a = JSON.parse(h);
      // Eksik alanları varsayılanla tamamla (sürüm yükseltmelerinde bozulmasın)
      return {
        siparis: Object.assign({}, VARSAYILAN.siparis, a.siparis || {},
          { eslesme: Object.assign({}, VARSAYILAN.siparis.eslesme, (a.siparis || {}).eslesme || {}),
            kalemEslesme: Object.assign({}, VARSAYILAN.siparis.kalemEslesme, (a.siparis || {}).kalemEslesme || {}) }),
        recete: Object.assign({}, VARSAYILAN.recete, a.recete || {},
          { eslesme: Object.assign({}, VARSAYILAN.recete.eslesme, (a.recete || {}).eslesme || {}),
            kalemEslesme: Object.assign({}, VARSAYILAN.recete.kalemEslesme, (a.recete || {}).kalemEslesme || {}) }),
        sonSenkron: Object.assign({}, VARSAYILAN.sonSenkron, a.sonSenkron || {})
      };
    } catch (e) { return JSON.parse(JSON.stringify(VARSAYILAN)); }
  }

  function ayarYaz(a) {
    try { localStorage.setItem(AYAR_ANAHTARI, JSON.stringify(a)); return true; }
    catch (e) { return false; }
  }

  // "data.orders.list" gibi noktalı yolu güvenle çözer
  function yolOku(nesne, yol) {
    if (!yol) return nesne;
    return String(yol).split('.').reduce((o, k) => (o == null ? undefined : o[k]), nesne);
  }

  function basliklarKur(cfg) {
    const h = { 'Accept': 'application/json' };
    if (cfg.kimlikTipi === 'bearer' && cfg.kimlik) h['Authorization'] = 'Bearer ' + cfg.kimlik;
    else if (cfg.kimlikTipi === 'basic' && cfg.kimlik) h['Authorization'] = 'Basic ' + btoa(cfg.kimlik);
    else if (cfg.kimlikTipi === 'baslik' && cfg.kimlik) h[cfg.basligAdi || 'X-API-Key'] = cfg.kimlik;
    return h;
  }

  // ── BAĞLANTI TESTİ ───────────────────────────────────────────────────────
  // Hata mesajlarını çevirir: "Failed to fetch" kullanıcıya hiçbir şey anlatmaz.
  async function baglantiTest(cfg) {
    if (!cfg.url) return { ok: false, hata: 'Adres girilmemiş.' };
    const t0 = Date.now();
    try {
      const kontrol = new AbortController();
      const zaman = setTimeout(() => kontrol.abort(), ZAMAN_ASIMI);
      const r = await fetch(cfg.url, {
        method: cfg.yontem || 'GET',
        headers: basliklarKur(cfg),
        signal: kontrol.signal,
        cache: 'no-store'
      });
      clearTimeout(zaman);
      const sure = Date.now() - t0;
      if (!r.ok) {
        return {
          ok: false, sure,
          hata: `Sunucu ${r.status} döndü` +
            (r.status === 401 || r.status === 403 ? ' — kimlik bilgisi hatalı veya yetki yok.'
             : r.status === 404 ? ' — adres bulunamadı, yolu kontrol edin.'
             : r.status >= 500 ? ' — karşı sistemde hata var, bilgi işleme bildirin.' : '.')
        };
      }
      const metin = await r.text();
      let veri;
      try { veri = JSON.parse(metin); }
      catch (e) {
        return { ok: false, sure, hata: 'Yanıt JSON değil. Dönen ilk 200 karakter: ' + metin.slice(0, 200) };
      }
      return { ok: true, sure, veri, ornek: ornekAlanlar(veri) };
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/abort/i.test(m)) return { ok: false, hata: 'Zaman aşımı (30 sn). Adres yanıt vermiyor.' };
      if (/Failed to fetch|NetworkError/i.test(m)) {
        return { ok: false, hata: 'Adrese ulaşılamadı. Olası sebepler: (1) sunucu kapalı, ' +
          '(2) CORS izni yok — karşı sistem bu siteye erişim izni vermeli, ' +
          '(3) güvenlik politikası engelliyor — Ayarlar\'da adresi izinli adreslere ekleyin.' };
      }
      return { ok: false, hata: m };
    }
  }

  // Gelen veriden alan adlarını çıkarır — eşleme ekranında seçenek olarak sunulur
  function ornekAlanlar(veri, kokAlan) {
    let d = kokAlan ? yolOku(veri, kokAlan) : veri;
    if (!Array.isArray(d)) {
      // Dizi bir alanın içinde olabilir; ilk dizi alanını bul
      if (d && typeof d === 'object') {
        const anahtar = Object.keys(d).find(k => Array.isArray(d[k]));
        if (anahtar) d = d[anahtar];
      }
    }
    if (!Array.isArray(d) || !d.length) return { alanlar: [], kayitSayisi: 0, ilkKayit: null };
    const ilk = d[0];
    const alanlar = (ilk && typeof ilk === 'object') ? Object.keys(ilk) : [];
    return { alanlar, kayitSayisi: d.length, ilkKayit: ilk };
  }

  // ── VERİ ÇEK VE EŞLE ─────────────────────────────────────────────────────
  async function cek(cfg) {
    const t = await baglantiTest(cfg);
    if (!t.ok) return { ok: false, hata: t.hata };
    let d = cfg.kokAlan ? yolOku(t.veri, cfg.kokAlan) : t.veri;
    if (!Array.isArray(d) && d && typeof d === 'object') {
      const anahtar = Object.keys(d).find(k => Array.isArray(d[k]));
      if (anahtar) d = d[anahtar];
    }
    if (!Array.isArray(d)) {
      return { ok: false, hata: 'Yanıtta kayıt listesi bulunamadı. "Kök alan" ayarını kontrol edin.' };
    }
    return { ok: true, ham: d, sure: t.sure };
  }

  const al = (kayit, alan) => (alan ? yolOku(kayit, alan) : undefined);
  const sayi = (v) => {
    if (v == null || v === '') return 0;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  // Logo siparişlerini ÜretimOS biçimine çevirir
  function siparisleriEsle(ham, cfg) {
    const e = cfg.eslesme, ke = cfg.kalemEslesme;
    const sonuc = [], hatalar = [];
    (ham || []).forEach((k, i) => {
      const kod = String(al(k, e.kod) || '').trim();
      if (!kod) { hatalar.push(`Satır ${i + 1}: sipariş kodu boş — atlandı`); return; }
      const hamKalemler = al(k, e.kalemler);
      const kalemler = Array.isArray(hamKalemler) ? hamKalemler.map(x => ({
        urunKodu: String(al(x, ke.urunKodu) || '').trim(),
        urunAdi: String(al(x, ke.urunAdi) || '').trim(),
        miktar: sayi(al(x, ke.miktar)),
        birim: String(al(x, ke.birim) || 'ADET').trim(),
        birimFiyat: sayi(al(x, ke.birimFiyat))
      })).filter(x => x.urunKodu || x.urunAdi) : [];
      sonuc.push({
        kod, musteriAdi: String(al(k, e.musteriAdi) || '').trim(),
        tarih: String(al(k, e.tarih) || '').slice(0, 10),
        terminTarihi: String(al(k, e.terminTarihi) || '').slice(0, 10),
        tutar: sayi(al(k, e.tutar)),
        disDurum: String(al(k, e.durum) || '').trim(),
        aciklama: String(al(k, e.aciklama) || '').trim(),
        kalemler, kaynak: 'logo', hamKayit: k
      });
    });
    return { kayitlar: sonuc, hatalar };
  }

  // Cost sisteminin reçetelerini çevirir
  function receteleriEsle(ham, cfg) {
    const e = cfg.eslesme, ke = cfg.kalemEslesme;
    const sonuc = [], hatalar = [];
    (ham || []).forEach((k, i) => {
      const kod = String(al(k, e.kod) || '').trim();
      if (!kod) { hatalar.push(`Satır ${i + 1}: ürün kodu boş — atlandı`); return; }
      const hamKalemler = al(k, e.kalemler);
      const kalemler = Array.isArray(hamKalemler) ? hamKalemler.map(x => ({
        malzemeKodu: String(al(x, ke.malzemeKodu) || '').trim(),
        malzemeAdi: String(al(x, ke.malzemeAdi) || '').trim(),
        miktar: sayi(al(x, ke.miktar)),
        birim: String(al(x, ke.birim) || 'ADET').trim()
      })).filter(x => x.malzemeKodu || x.malzemeAdi) : [];
      sonuc.push({
        kod, ad: String(al(k, e.ad) || '').trim(),
        birim: String(al(k, e.birim) || 'ADET').trim(),
        kalemler, kaynak: 'cost', hamKayit: k
      });
    });
    return { kayitlar: sonuc, hatalar };
  }

  // ── MEVCUTLA KARŞILAŞTIR ─────────────────────────────────────────────────
  // Ne yeni, ne değişmiş, ne aynı — kullanıcı onaylamadan hiçbir şey yazılmaz.
  function farkCikar(gelenler, mevcutlar, kodAlani) {
    const harita = new Map();
    (mevcutlar || []).forEach(m => {
      const k = String(m[kodAlani] || m.kod || '').toUpperCase();
      if (k) harita.set(k, m);
    });
    const yeni = [], degisen = [], ayni = [];
    (gelenler || []).forEach(g => {
      const m = harita.get(String(g.kod || '').toUpperCase());
      if (!m) { yeni.push(g); return; }
      // Kaba karşılaştırma: kalem sayısı veya tutar değiştiyse "değişmiş" say
      const farkli = (g.kalemler || []).length !== ((m.kalemler || []).length)
        || (g.tutar != null && m.toplamTutar != null && Math.abs(g.tutar - m.toplamTutar) > 0.01);
      (farkli ? degisen : ayni).push(Object.assign({}, g, { mevcutId: m.id }));
    });
    return { yeni, degisen, ayni };
  }

  return {
    AYAR_ANAHTARI, VARSAYILAN,
    ayarOku, ayarYaz, yolOku, basliklarKur,
    baglantiTest, ornekAlanlar, cek,
    siparisleriEsle, receteleriEsle, farkCikar
  };
})();

if (typeof module !== 'undefined') module.exports = AgEntegrasyon;
