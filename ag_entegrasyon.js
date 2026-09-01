// ════════════════════════════════════════════════════════════════════════════
// AĞ ENTEGRASYONU — genel amaçlı ERP/muhasebe bağlayıcı
// ────────────────────────────────────────────────────────────────────────────
// Piyasada tek bir "hepsine uyan" ERP API'si yoktur (Logo, Mikro, Netsis,
// Nebim, Zirve, Vega… her biri farklı). Bu yüzden hiçbir vendöre özel alan
// adı SABİT KODLANMAZ: kullanıcı bir HTTP uç noktası + kimlik doğrulama
// girer, "Bağlantıyı Test Et" ile karşı sistemin alan adları KEŞFEDİLİR,
// eşleme arayüzden yapılır. JSON döndüren HERHANGİ bir sistem — hangi
// vendör olursa olsun — bu şekilde bağlanabilir.
//
// PROFİLLER: Sınırsız sayıda "bağlantı profili" tanımlanabilir (örn.
// "Logo — Sipariş", "Mikro — Stok", "Netsis — Cari"). Her profilin bir
// HEDEF TİPİ (siparis/urun_stok/recete/cari) ve bir YÖNÜ (ice/disa) vardır.
// Yeni bir hedef tipi eklemek HEDEF_ALANLAR'a bir girdi eklemek kadar basittir.
//
// YÖN:
//   ice  (içe aktarım) — karşı sistemden OKUR, ÜretimOS'a yazmadan önce
//        ÖNİZLER; kullanıcı onaylamadan hiçbir kayıt işlenmez.
//   disa (dışa aktarım) — ÜretimOS kayıtlarını karşı sisteme POST/PUT ile
//        YAZAR. Bu, "ice" yönünün aksine karşı sistemde kalıcı bir etki
//        yaratır — bu yüzden disaGonder() YALNIZCA kullanıcının arayüzde
//        açıkça "Gönder" dediği anda çağrılmalıdır (bkz. page_ag_entegrasyon.js),
//        otomatik/arka planda ASLA tetiklenmez.
//
// GÜVENLİK (her iki yön için):
// • Kimlik bilgisi (API anahtarı) yerel olarak saklanır, ÜretimOS
//   sunucusuna gönderilmez.
// • CSP (bkz. .htaccess) fetch()'i yalnızca aynı-origin veya *.local
//   adresleriyle sınırlar — bu bilinçli bir "şirket içi ağ" sınırıdır.
// ════════════════════════════════════════════════════════════════════════════
const AgEntegrasyon = (() => {

  const AYAR_ANAHTARI = 'uretimos_ag_entegrasyon';
  const ZAMAN_ASIMI = 30000;   // 30 sn — LAN'da yavaş uç noktalar olabilir

  // ── HEDEF VERİ TİPLERİ ───────────────────────────────────────────────────
  // anaAlanlar: [ÜretimOS anahtarı, ekran etiketi, zorunlu mu]
  //   İlk eleman HER ZAMAN o kaydın benzersiz KODUDUR (eşleme/karşılaştırma
  //   bunun üzerinden yapılır).
  // kalemAlanlar: iç içe dizi varsa (sipariş satırları, reçete kalemleri)
  //   o dizinin elemanlarındaki alanlar; dizi yoksa boş bırakılır.
  //
  // NOT (siparis.disDurum): karşı sistemden gelen durum bilgisi bilerek
  // "durum" değil "disDurum" adıyla tutulur — ÜretimOS'un kendi sipariş
  // durumu (taslak/cari_onay_bekliyor/…) ile KARIŞMASIN diye. aktar()
  // bunu ayrıca "logoDurum" olarak saklar (bkz. page_ag_entegrasyon.js).
  const HEDEF_ALANLAR = {
    siparis: {
      ad: 'Sipariş',
      anaAlanlar: [
        ['kod', 'Sipariş No', true], ['musteriAdi', 'Cari / Müşteri', true],
        ['tarih', 'Sipariş Tarihi', false], ['terminTarihi', 'Termin Tarihi', false],
        ['tutar', 'Tutar', false], ['disDurum', 'Durum', false],
        ['aciklama', 'Açıklama', false], ['kalemler', 'Satırlar (dizi)', true]
      ],
      kalemAlanlar: [['urunKodu', 'Ürün/Stok Kodu'], ['urunAdi', 'Ürün Adı'],
        ['miktar', 'Miktar'], ['birim', 'Birim'], ['birimFiyat', 'Birim Fiyat']]
    },
    recete: {
      ad: 'Reçete',
      anaAlanlar: [['kod', 'Ürün Kodu', true], ['ad', 'Ürün Adı', true],
        ['birim', 'Birim', false], ['kalemler', 'Reçete kalemleri (dizi)', true]],
      kalemAlanlar: [['malzemeKodu', 'Malzeme Kodu'], ['malzemeAdi', 'Malzeme Adı'],
        ['miktar', 'Miktar'], ['birim', 'Birim']]
    },
    urun_stok: {
      ad: 'Ürün / Stok',
      anaAlanlar: [['kod', 'Stok/Ürün Kodu', true], ['ad', 'Ad', true],
        ['birim', 'Birim', false], ['stok', 'Stok Miktarı', false], ['fiyat', 'Fiyat', false]],
      kalemAlanlar: []   // düz kayıt — iç içe dizi yok
    },
    cari: {
      ad: 'Cari',
      anaAlanlar: [['kod', 'Cari Kodu', true], ['unvan', 'Ünvan', true],
        ['vergiNo', 'Vergi No / TCKN', false], ['adres', 'Adres', false],
        ['telefon', 'Telefon', false], ['bakiye', 'Bakiye', false]],
      kalemAlanlar: []
    }
  };
  const HEDEF_TIPLERI = Object.keys(HEDEF_ALANLAR);
  // Sayısal olarak çözülmesi gereken alanlar (Türkçe ondalık virgül dahil)
  const SAYISAL_ALAN = { tutar: 1, stok: 1, fiyat: 1, bakiye: 1, miktar: 1, birimFiyat: 1 };
  // ISO tarih-saat olarak gelebilecek alanlar — yalnızca YYYY-MM-DD kısmı tutulur
  const TARIH_ALAN = { tarih: 1, terminTarihi: 1 };

  const bosEslesme = (tip) => {
    const e = {}; (HEDEF_ALANLAR[tip] || HEDEF_ALANLAR.siparis).anaAlanlar.forEach(([k]) => { e[k] = ''; });
    return e;
  };
  const bosKalemEslesme = (tip) => {
    const e = {}; (HEDEF_ALANLAR[tip] || HEDEF_ALANLAR.siparis).kalemAlanlar.forEach(([k]) => { e[k] = ''; });
    return e;
  };

  function yeniProfil(hedefTip, ad) {
    const tip = HEDEF_ALANLAR[hedefTip] ? hedefTip : 'siparis';
    return {
      id: 'PRF' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ad: ad || HEDEF_ALANLAR[tip].ad,
      hedefTip: tip, yon: 'ice',
      url: '', yontem: 'GET', kimlikTipi: 'yok', kimlik: '', basligAdi: 'X-API-Key',
      kokAlan: '',
      eslesme: bosEslesme(tip), kalemEslesme: bosKalemEslesme(tip), disaEslesme: bosEslesme(tip)
    };
  }

  const VARSAYILAN = { profiller: [], sonSenkron: {} };

  // ── AYAR SAKLAMA + ESKİ FORMATTAN GÖÇ ────────────────────────────────────
  // v1'de ayar {siparis:{...}, recete:{...}, sonSenkron:{siparis,recete}}
  // sabit biçimindeydi. Artık {profiller:[...], sonSenkron:{[profilId]:...}}.
  // Daha önce yapılandırılmış (url dolu) eski kayıtlar SESSİZCE 1-2 profile
  // dönüştürülür — mevcut kullanıcının ayarları kaybolmaz.
  function eskiFormatMi(a) {
    return !!(a && typeof a === 'object' && !Array.isArray(a.profiller) && (a.siparis || a.recete));
  }
  function eskidenGocEt(a) {
    const profiller = [];
    ['siparis', 'recete'].forEach(tip => {
      const c = a[tip];
      if (!c || !c.url) return;   // hiç yapılandırılmamış varsayılanı taşıma
      const p = Object.assign(yeniProfil(tip, HEDEF_ALANLAR[tip].ad), c, { hedefTip: tip, yon: 'ice' });
      // eski "durum" eşlemesi varsa yeni "disDurum" anahtarına taşı
      if (tip === 'siparis' && p.eslesme && p.eslesme.durum !== undefined && !p.eslesme.disDurum) {
        p.eslesme.disDurum = p.eslesme.durum;
      }
      profiller.push(p);
    });
    return { profiller, sonSenkron: a.sonSenkron || {} };
  }

  function profilTazele(p) {
    const tip = HEDEF_ALANLAR[p.hedefTip] ? p.hedefTip : 'siparis';
    return Object.assign(yeniProfil(tip, p.ad), p, {
      hedefTip: tip,
      eslesme: Object.assign(bosEslesme(tip), p.eslesme || {}),
      kalemEslesme: Object.assign(bosKalemEslesme(tip), p.kalemEslesme || {}),
      disaEslesme: Object.assign(bosEslesme(tip), p.disaEslesme || {})
    });
  }

  function ayarOku() {
    try {
      const h = localStorage.getItem(AYAR_ANAHTARI);
      if (!h) return JSON.parse(JSON.stringify(VARSAYILAN));
      const a = JSON.parse(h);
      if (eskiFormatMi(a)) {
        const goc = eskidenGocEt(a);
        ayarYaz(goc);   // bir daha göç etmemek için hemen yeni biçimde kaydet
        return goc;
      }
      if (!Array.isArray(a.profiller)) return JSON.parse(JSON.stringify(VARSAYILAN));
      return { profiller: a.profiller.map(profilTazele), sonSenkron: a.sonSenkron || {} };
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

  // Ağ hatalarını kullanıcının anlayacağı Türkçeye çevirir — "Failed to
  // fetch" hiçbir şey anlatmaz. baglantiTest/cek/disaGonder ortak kullanır.
  function agHatasiCevir(e) {
    const m = String((e && e.message) || e);
    if (/abort/i.test(m)) return 'Zaman aşımı (30 sn). Adres yanıt vermiyor.';
    if (/Failed to fetch|NetworkError/i.test(m)) {
      return 'Adrese ulaşılamadı. Olası sebepler: (1) sunucu kapalı, ' +
        '(2) CORS izni yok — karşı sistem bu siteye erişim izni vermeli, ' +
        '(3) güvenlik politikası engelliyor — Ayarlar\'da adresi izinli adreslere ekleyin.';
    }
    return m;
  }
  function durumHatasiCevir(status) {
    return `Sunucu ${status} döndü` +
      (status === 401 || status === 403 ? ' — kimlik bilgisi hatalı veya yetki yok.'
       : status === 404 ? ' — adres bulunamadı, yolu kontrol edin.'
       : status >= 500 ? ' — karşı sistemde hata var, bilgi işleme bildirin.' : '.');
  }

  // ── BAĞLANTI TESTİ (okuma) ───────────────────────────────────────────────
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
      if (!r.ok) return { ok: false, sure, hata: durumHatasiCevir(r.status) };
      const metin = await r.text();
      let veri;
      try { veri = JSON.parse(metin); }
      catch (e) { return { ok: false, sure, hata: 'Yanıt JSON değil. Dönen ilk 200 karakter: ' + metin.slice(0, 200) }; }
      return { ok: true, sure, veri, ornek: ornekAlanlar(veri) };
    } catch (e) {
      return { ok: false, hata: agHatasiCevir(e) };
    }
  }

  // Gelen veriden alan adlarını çıkarır — eşleme ekranında seçenek olarak sunulur
  function ornekAlanlar(veri, kokAlan) {
    let d = kokAlan ? yolOku(veri, kokAlan) : veri;
    if (!Array.isArray(d)) {
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

  // ── VERİ ÇEK (okuma) ─────────────────────────────────────────────────────
  async function cek(cfg) {
    const t = await baglantiTest(cfg);
    if (!t.ok) return { ok: false, hata: t.hata };
    let d = cfg.kokAlan ? yolOku(t.veri, cfg.kokAlan) : t.veri;
    if (!Array.isArray(d) && d && typeof d === 'object') {
      const anahtar = Object.keys(d).find(k => Array.isArray(d[k]));
      if (anahtar) d = d[anahtar];
    }
    if (!Array.isArray(d)) return { ok: false, hata: 'Yanıtta kayıt listesi bulunamadı. "Kök alan" ayarını kontrol edin.' };
    return { ok: true, ham: d, sure: t.sure };
  }

  const al = (kayit, alan) => (alan ? yolOku(kayit, alan) : undefined);
  const sayi = (v) => {
    if (v == null || v === '') return 0;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  // ── GENEL EŞLEME — herhangi bir hedefTip için ──────────────────────────
  // cfg.hedefTip'e göre HEDEF_ALANLAR'dan okur; siparis/reçete/ürün-stok/
  // cari hepsi AYNI mantıkla işlenir. Yeni bir hedef eklemek yalnızca
  // HEDEF_ALANLAR'a girdi eklemek demektir, bu fonksiyona dokunmadan çalışır.
  function kayitlariEsle(ham, cfg) {
    const tip = cfg.hedefTip;
    const tanim = HEDEF_ALANLAR[tip];
    if (!tanim) return { kayitlar: [], hatalar: ['Bilinmeyen hedef tipi: ' + tip] };
    const e = cfg.eslesme || {}, ke = cfg.kalemEslesme || {};
    const [kodKey, kodEtiket] = tanim.anaAlanlar[0];
    const sonuc = [], hatalar = [];
    (ham || []).forEach((k, i) => {
      const kod = String(al(k, e[kodKey]) || '').trim();
      if (!kod) { hatalar.push(`Satır ${i + 1}: ${kodEtiket} boş — atlandı`); return; }
      const kayit = { kaynak: tip, hamKayit: k };
      tanim.anaAlanlar.forEach(([key]) => {
        if (key === 'kalemler' || key === kodKey) return;
        const ham2 = al(k, e[key]);
        kayit[key] = SAYISAL_ALAN[key] ? sayi(ham2)
          : TARIH_ALAN[key] ? String(ham2 || '').slice(0, 10)
          : String(ham2 || '').trim();
      });
      kayit[kodKey] = kod;
      if (tanim.kalemAlanlar.length) {
        const hamKalemler = al(k, e.kalemler);
        const ilkKey = tanim.kalemAlanlar[0][0];
        const ikinciKey = tanim.kalemAlanlar[1] && tanim.kalemAlanlar[1][0];
        kayit.kalemler = Array.isArray(hamKalemler) ? hamKalemler.map(x => {
          const kl = {};
          tanim.kalemAlanlar.forEach(([kk]) => { kl[kk] = SAYISAL_ALAN[kk] ? sayi(al(x, ke[kk])) : String(al(x, ke[kk]) || '').trim(); });
          return kl;
        }).filter(x => x[ilkKey] || (ikinciKey && x[ikinciKey])) : [];
      }
      sonuc.push(kayit);
    });
    return { kayitlar: sonuc, hatalar };
  }

  // Geriye dönük uyumlu kısayollar — eski çağrı biçimleri (cfg'de hedefTip
  // olmasa da) hâlâ çalışır; ikisi de kayitlariEsle'ye devreder. "kaynak"
  // alanı v1'deki gibi sabit tutulur (loga/cost) — çoklu profil dünyasında
  // genel kayitlariEsle çağrıları için kaynak, hedefTip'in kendisidir.
  const siparisleriEsle = (ham, cfg) => {
    const r = kayitlariEsle(ham, Object.assign({}, cfg, { hedefTip: 'siparis' }));
    r.kayitlar.forEach(k => { k.kaynak = 'logo'; });
    return r;
  };
  const receteleriEsle = (ham, cfg) => {
    const r = kayitlariEsle(ham, Object.assign({}, cfg, { hedefTip: 'recete' }));
    r.kayitlar.forEach(k => { k.kaynak = 'cost'; });
    return r;
  };

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
      const farkli = (g.kalemler || []).length !== ((m.kalemler || []).length)
        || (g.tutar != null && m.toplamTutar != null && Math.abs(g.tutar - m.toplamTutar) > 0.01);
      (farkli ? degisen : ayni).push(Object.assign({}, g, { mevcutId: m.id }));
    });
    return { yeni, degisen, ayni };
  }

  // ── DIŞA AKTARIM (yazma) ─────────────────────────────────────────────────
  // v1 kapsamı: yalnızca ÜST SEVİYE (başlık) alanları dışa gönderilir —
  // örn. sipariş durumu bildirimi, ürün/stok senkronizasyonu, yeni cari
  // bildirimi. İç içe kalem listelerinin dışa eşlemesi bu sürümde YOK.
  //
  // disaPayloadOlustur SADECE JSON üretir, ağa hiçbir şey göndermez.
  function disaPayloadOlustur(kayitlar, cfg) {
    const tanim = HEDEF_ALANLAR[cfg.hedefTip];
    if (!tanim) return [];
    const de = cfg.disaEslesme || {};
    return (kayitlar || []).map(kayit => {
      const nesne = {};
      tanim.anaAlanlar.forEach(([key]) => {
        if (key === 'kalemler') return;
        const disAlan = de[key];
        if (disAlan) nesne[disAlan] = kayit[key];
      });
      return nesne;
    });
  }

  // Karşı sisteme YAZAR (POST/PUT). Bu fonksiyon YALNIZCA kullanıcının
  // arayüzde açıkça "Gönder" dediği anda çağrılmalıdır — page_ag_entegrasyon.js
  // dışında hiçbir otomatik/arka plan tetikleyici olmamalıdır.
  async function disaGonder(cfg, payload) {
    if (!cfg.url) return { ok: false, hata: 'Adres girilmemiş.' };
    const t0 = Date.now();
    try {
      const kontrol = new AbortController();
      const zaman = setTimeout(() => kontrol.abort(), ZAMAN_ASIMI);
      const r = await fetch(cfg.url, {
        method: cfg.yontem === 'PUT' ? 'PUT' : 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, basliklarKur(cfg)),
        body: JSON.stringify(payload),
        signal: kontrol.signal,
        cache: 'no-store'
      });
      clearTimeout(zaman);
      const sure = Date.now() - t0;
      if (!r.ok) return { ok: false, sure, hata: durumHatasiCevir(r.status) };
      let yanit = '';
      try { yanit = await r.text(); } catch (e) { /* yanıt gövdesi boş olabilir */ }
      return { ok: true, sure, yanit };
    } catch (e) {
      return { ok: false, hata: agHatasiCevir(e) };
    }
  }

  return {
    AYAR_ANAHTARI, VARSAYILAN, HEDEF_ALANLAR, HEDEF_TIPLERI,
    yeniProfil, ayarOku, ayarYaz, yolOku, basliklarKur,
    baglantiTest, ornekAlanlar, cek,
    kayitlariEsle, siparisleriEsle, receteleriEsle, farkCikar,
    disaPayloadOlustur, disaGonder
  };
})();

if (typeof module !== 'undefined') module.exports = AgEntegrasyon;
