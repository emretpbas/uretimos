// ════════════════════════════════════════════════════════════════════════════
// ÜRETİMOS — STORAGE KATMANI (SUNUCU SÜRÜMÜ — PHP + SQLite API, GÜVENLİ v2)
// Tüm veri api.php üzerinden data.sqlite'a okunur/yazılır — tüm kullanıcılar
// AYNI veriyi paylaşır. Bu sürümde:
//   - Her istek "Authorization: Bearer <token>" başlığı taşır
//   - Token, başarılı girişte (Store.login) sunucudan alınır, sessionStorage'da tutulur
//   - Oturum süresi dolunca (401) otomatik giriş ekranına dönülür
//   - Şifre doğrulama SUNUCUDA yapılır (bcrypt) — istemciye hash gelmez
// ════════════════════════════════════════════════════════════════════════════

const Store = (() => {
  const API_URL = 'api.php';
  const TOKEN_KEY = 'uretimos_token';

  function tokenGetir() {
    try { return window.sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function tokenKaydet(t) {
    try { if (t) window.sessionStorage.setItem(TOKEN_KEY, t); else window.sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  // 401 geldiğinde tüm uygulamayı giriş ekranına döndür — App henüz yüklü
  // olmayabilir, bu yüzden bir event ile haber veriyoruz; app.js dinler.
  function oturumDustu() {
    tokenKaydet('');
    try { window.dispatchEvent(new CustomEvent('uretimos:oturum-dustu')); } catch (e) {}
  }

  async function apiFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {});
    const t = tokenGetir();
    if (t) opts.headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(url, opts);
    if (res.status === 401) { oturumDustu(); throw new Error('Oturum süresi doldu — lütfen tekrar giriş yapın'); }
    return res;
  }

  // ── EŞZAMANLI YAZMA KORUMASI (istemci tarafı) ────────────────────────────
  // Okunan her koleksiyonun SÜRÜMÜ ve ANLIK GÖRÜNTÜSÜ (id → JSON) saklanır.
  // Tam yazmada sürüm sunucuya bildirilir; bu arada başkası yazmışsa sunucu
  // 409 döner ve biz yalnızca KENDİ değişikliklerimizi (görüntüyle fark
  // alarak) güncel veri üzerine uygularız. Böylece kimsenin kaydı silinmez.
  const surumler = new Map();        // key → sunucudaki sürüm
  const anlikGoruntu = new Map();    // key → Map(id → parmak izi)  [eskiden: JSON metni]

  // ── PARMAK İZİ (eskiden: kaydın TAM JSON metni) ──────────────────────────
  // ÖNCESİ: anlikGoruntu her kaydın JSON metnini olduğu gibi saklıyordu. Bu,
  // koleksiyonun tüm JSON boyutunu tarayıcı belleğine İKİNCİ KEZ ekliyordu
  // (ayrıştırılmış nesnelerin yanı sıra). 138 MB'lık bir koleksiyonda bu
  // fazladan ~138 MB demekti.
  //
  // SONRASI: fark almak için içerik değil yalnızca EŞİTLİK gerekiyor. Bu yüzden
  // kayıt başına sabit boyutlu (~20 bayt) bir parmak izi saklıyoruz.
  // Kazanç: kayıt başına kilobaytlar yerine onlarca bayt.
  //
  // DÜRÜST TAKAS: parmak izi teorik olarak çakışabilir (iki farklı kayıt aynı
  // izi üretir) ve o kayıt "değişmemiş" sayılıp kaydedilmez. Riski ihmal
  // edilebilir kılmak için iki bağımsız 53-bit karma + JSON uzunluğu birlikte
  // kullanılıyor; farklı içeriğin hem uzunluğu hem iki karması aynı çıkması
  // pratikte imkânsızdır.
  function parmakIzi(metin) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < metin.length; i++) {
      const ch = metin.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const a = (h2 >>> 0) * 4294967296 + (h1 >>> 0);
    return metin.length.toString(36) + ':' + a.toString(36);
  }

  // Parmak izi tablosunun HANGİ sürüm için hesaplandığını tutar.
  // Sürüm değişmediyse tabloyu yeniden hesaplamaya gerek yoktur — bu, her
  // sayfa geçişinde on binlerce JSON.stringify + hash işlemini önler
  // (telefonda sayfa kilitlenmesinin ana sebebiydi).
  const goruntuSurum = new Map();

  // Bu sayının üstündeki koleksiyonlarda parmak izi tablosu tutulmaz (mobil bellek).
  const BUYUK_KOLEKSIYON_ESIGI = 4000;

  function goruntuAl(dizi) {
    const m = new Map();
    if (Array.isArray(dizi)) {
      dizi.forEach(k => {
        if (k && k.id !== undefined) {
          try { m.set(String(k.id), parmakIzi(JSON.stringify(k))); } catch (e) {}
        }
      });
    }
    return m;
  }

  // Görüntü ile yeni dizi arasındaki farkı çıkarır → {ekle, guncelle, sil}
  function farkCikar(key, yeniDizi) {
    const eski = anlikGoruntu.get(key);
    if (!eski || !Array.isArray(yeniDizi)) return null;   // fark alınamaz
    const ekle = [], guncelle = [], sil = [];
    const gorulen = new Set();
    for (const k of yeniDizi) {
      if (!k || k.id === undefined) return null;          // id'siz kayıt → fark güvenilmez
      const id = String(k.id);
      gorulen.add(id);
      let iz;
      try { iz = parmakIzi(JSON.stringify(k)); } catch (e) { return null; }
      if (!eski.has(id)) ekle.push(k);
      else if (eski.get(id) !== iz) guncelle.push(k);
    }
    eski.forEach((_, id) => { if (!gorulen.has(id)) sil.push(id); });
    return { ekle, guncelle, sil };
  }

  async function get(key, fallback = null) {
    try {
      const res = await apiFetch(API_URL + '?action=get&key=' + encodeURIComponent(key));
      if (!res.ok) {
        // Sunucu bellek yetmezliğinde (507) anlaşılır bir mesaj döner.
        // Eskiden burada yalnızca "HTTP 500" görünüyordu ve kullanıcı sorunun
        // ne olduğunu anlayamıyordu.
        let mesaj = 'HTTP ' + res.status;
        try {
          const h = await res.json();
          if (h && h.error) mesaj = h.error + (h.bellekHatasi ? ' (koleksiyon: ' + key + ')' : '');
        } catch (e) {}
        throw new Error(mesaj);
      }
      const data = await res.json();
      if (typeof data.surum === 'number') surumler.set(key, data.surum);
      if (data.value === null || data.value === undefined) {
        anlikGoruntu.set(key, goruntuAl(Array.isArray(fallback) ? fallback : []));
        return fallback;
      }
      try {
        const cozulmus = JSON.parse(data.value);
        // PERFORMANS: sürüm aynıysa parmak izi tablosu da aynıdır → yeniden
        // hesaplama. Değiştiyse (veya ilk okumaysa) hesapla.
        const yeniSurum = (typeof data.surum === 'number') ? data.surum : null;
        // ÇOK BÜYÜK koleksiyonlarda (stok hareketleri, denetim kaydı vb.)
        // parmak izi tablosu TUTULMAZ: on binlerce kayıt için hem hesabı hem
        // bellekte tutulması telefonlarda kilitlenmeye yol açıyordu. Tablo
        // yoksa farkCikar() null döner ve kayıt TAM olarak gönderilir — veri
        // güvenliği bozulmaz, yalnızca o koleksiyonda fark optimizasyonu olmaz.
        if (Array.isArray(cozulmus) && cozulmus.length > BUYUK_KOLEKSIYON_ESIGI) {
          anlikGoruntu.delete(key);
          goruntuSurum.delete(key);
        } else if (yeniSurum !== null && goruntuSurum.get(key) === yeniSurum && anlikGoruntu.has(key)) {
          // tablo güncel — yeniden hesaplama
        } else {
          anlikGoruntu.set(key, goruntuAl(cozulmus));
          if (yeniSurum !== null) goruntuSurum.set(key, yeniSurum);
          else goruntuSurum.delete(key);
        }
        return cozulmus;
      } catch (e) { return fallback; }
    } catch (e) {
      if (String(e.message).includes('Oturum')) throw e;
      console.error('Store.get hatası:', key, e);
      return fallback;
    }
  }

  // Yalnızca değişen kayıtları atomik olarak uygular (sunucuda kilit altında)
  async function patchUygula(key, fark) {
    const res = await apiFetch(API_URL + '?action=patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, ekle: fark.ekle, guncelle: fark.guncelle, sil: fark.sil })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Kayıt hatası: HTTP ' + res.status));
    if (typeof data.surum === 'number') surumler.set(key, data.surum);
    return data;
  }

  // Büyük listeyi mevcut sunucu verisiyle karşılaştırıp SADECE farkı,
  // partiler halinde gönderir. Böylece hem gövde küçük kalır hem de
  // eşzamanlı çalışan başka kullanıcının kaydı ezilmez.
  async function buyukListeyiYaz(key, liste) {
    try {
      const mevcut = await get(key, []);
      const eski = new Map();
      (Array.isArray(mevcut) ? mevcut : []).forEach(x => {
        if (x && x.id !== undefined) eski.set(String(x.id), JSON.stringify(x));
      });
      const ekle = [], guncelle = [];
      const yeniIdler = new Set();
      liste.forEach(x => {
        if (!x || x.id === undefined) return;
        const id = String(x.id);
        yeniIdler.add(id);
        const oncekiJson = eski.get(id);
        if (oncekiJson === undefined) ekle.push(x);
        else if (oncekiJson !== JSON.stringify(x)) guncelle.push(x);
      });
      const sil = [...eski.keys()].filter(id => !yeniIdler.has(id));

      if (!ekle.length && !guncelle.length && !sil.length) return true;   // değişiklik yok

      const PARTI = 200;
      for (let i = 0; i < ekle.length; i += PARTI) {
        await patchUygula(key, { ekle: ekle.slice(i, i + PARTI), guncelle: [], sil: [] });
      }
      for (let i = 0; i < guncelle.length; i += PARTI) {
        await patchUygula(key, { ekle: [], guncelle: guncelle.slice(i, i + PARTI), sil: [] });
      }
      for (let i = 0; i < sil.length; i += PARTI) {
        await patchUygula(key, { ekle: [], guncelle: [], sil: sil.slice(i, i + PARTI) });
      }
      // Anlık görüntüyü tazele
      anlikGoruntu.set(key, goruntuAl(liste));
      return true;
    } catch (e) {
      // Parçalı yol tutmazsa çağıran normal yola düşsün
      return false;
    }
  }

  // ── TOPLU EKLEME (parçalı) ────────────────────────────────────────────────
  // Binlerce kaydı tek istekte göndermek sunucuda HTTP 413 (Payload Too Large)
  // hatasına yol açar. Bu yardımcı, kayıtları PARTİLER halinde 'patch' ucuna
  // gönderir: her istek yalnızca o partiyi taşır, koleksiyonun tamamını değil.
  // İlerleme geri bildirimi için opsiyonel callback alır.
  async function topluEkle(key, kayitlar, partiBoyu, ilerleme) {
    const liste = Array.isArray(kayitlar) ? kayitlar : [];
    if (!liste.length) return { eklenen: 0, parti: 0 };
    const boyut = Math.max(1, Math.min(+partiBoyu || 300, 1000));
    let eklenen = 0, parti = 0;
    for (let i = 0; i < liste.length; i += boyut) {
      const dilim = liste.slice(i, i + boyut);
      await patchUygula(key, { ekle: dilim, guncelle: [], sil: [] });
      eklenen += dilim.length;
      parti++;
      // Anlık görüntü tutuluyorsa güncelle (küçük koleksiyonlarda)
      const harita = anlikGoruntu.get(key);
      if (harita) dilim.forEach(k => {
        if (k && k.id !== undefined) {
          try { harita.set(String(k.id), parmakIzi(JSON.stringify(k))); } catch (e) { }
        }
      });
      if (typeof ilerleme === 'function') ilerleme(eklenen, liste.length, parti);
    }
    return { eklenen, parti };
  }

  // Değişen kayıtları PARTİLER halinde günceller. topluEkle ile aynı gerekçe:
  // tüm koleksiyonu tek istekte göndermek HTTP 413 verir.
  async function topluGuncelle(key, kayitlar, partiBoyu, ilerleme) {
    const liste = Array.isArray(kayitlar) ? kayitlar : [];
    if (!liste.length) return { guncellenen: 0, parti: 0 };
    const boyut = Math.max(1, Math.min(+partiBoyu || 300, 1000));
    let guncellenen = 0, parti = 0;
    for (let i = 0; i < liste.length; i += boyut) {
      const dilim = liste.slice(i, i + boyut);
      await patchUygula(key, { ekle: [], guncelle: dilim, sil: [] });
      guncellenen += dilim.length;
      parti++;
      const harita = anlikGoruntu.get(key);
      if (harita) dilim.forEach(k => {
        if (k && k.id !== undefined) {
          try { harita.set(String(k.id), parmakIzi(JSON.stringify(k))); } catch (e) { }
        }
      });
      if (typeof ilerleme === 'function') ilerleme(guncellenen, liste.length, parti);
    }
    return { guncellenen, parti };
  }

  // Sunucu/güvenlik duvarı sınırı. GoDaddy gibi paylaşımlı hostinglerde
  // mod_security büyük POST gövdelerini 403 ile reddeder (413 değil!).
  // Bu eşiğin üstündeki yazmalar otomatik olarak PARÇALI gönderilir.
  const BUYUK_GOVDE_ESIGI = 400 * 1024;   // ~400 KB

  async function set(key, value) {
    // ── OTOMATİK PARÇALAMA ────────────────────────────────────────────────
    // Tüm koleksiyonu tek istekte göndermek büyük verilerde 403/413 üretir.
    // Çağıran kodun bunu bilmesi gerekmesin diye burada, tek noktada çözülür:
    // gövde eşiği aşıyorsa fark çıkarılıp patch ile partiler halinde gönderilir.
    if (Array.isArray(value)) {
      let govdeBoyut = 0;
      try { govdeBoyut = JSON.stringify(value).length; } catch (e) { govdeBoyut = 0; }
      if (govdeBoyut > BUYUK_GOVDE_ESIGI) {
        const sonuc = await buyukListeyiYaz(key, value);
        if (sonuc) return value;
        // Parçalı yazma başarısızsa aşağıdaki normal yola düşülür
      }
    }
    const beklenenSurum = surumler.has(key) ? surumler.get(key) : null;
    const res = await apiFetch(API_URL + '?action=set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: JSON.stringify(value), beklenenSurum })
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (typeof data.surum === 'number') surumler.set(key, data.surum);
      anlikGoruntu.set(key, goruntuAl(value));
      return value;
    }

    // ── ÇAKIŞMA (409): başka kullanıcı bu arada yazmış ────────────────────
    // Tüm diziyi zorla yazmak onun değişikliğini silerdi. Bunun yerine bizim
    // yaptığımız değişikliği çıkarıp GÜNCEL veri üzerine atomik uyguluyoruz.
    if (res.status === 409) {
      const cakisma = await res.json().catch(() => ({}));
      if (typeof cakisma.surum === 'number') surumler.set(key, cakisma.surum);
      const fark = farkCikar(key, value);
      if (fark && (fark.ekle.length || fark.guncelle.length || fark.sil.length)) {
        await patchUygula(key, fark);
        // Görüntüyü sunucudaki güncel hale getir
        try {
          const guncel = cakisma.guncelDeger ? JSON.parse(cakisma.guncelDeger) : [];
          const harita = goruntuAl(guncel);
          fark.ekle.concat(fark.guncelle).forEach(k => harita.set(String(k.id), JSON.stringify(k)));
          fark.sil.forEach(id => harita.delete(String(id)));
          anlikGoruntu.set(key, harita);
        } catch (e) { anlikGoruntu.set(key, goruntuAl(value)); }
        console.warn('Eşzamanlı değişiklik birleştirildi:', key,
          '(+' + fark.ekle.length + ' ~' + fark.guncelle.length + ' -' + fark.sil.length + ')');
        return value;
      }
      if (fark) { anlikGoruntu.set(key, goruntuAl(value)); return value; } // değişiklik yok
      throw new Error('Bu veri başka bir kullanıcı tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.');
    }

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || ('Kayıt hatası: HTTP ' + res.status));
  }

  async function del(key) {
    const res = await apiFetch(API_URL + '?action=delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!res.ok) throw new Error('Silme hatası: HTTP ' + res.status);
    return true;
  }

  async function setIfAbsent(key, value) {
    try {
      const res = await apiFetch(API_URL + '?action=setIfAbsent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: JSON.stringify(value) })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return !!data.written;
    } catch (e) {
      if (String(e.message).includes('Oturum')) throw e;
      console.error('setIfAbsent hatası:', key, e);
      return false;
    }
  }

  async function listKeys(prefix) {
    try {
      const res = await apiFetch(API_URL + '?action=list&prefix=' + encodeURIComponent(prefix || ''));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return data.keys || [];
    } catch (e) {
      if (String(e.message).includes('Oturum')) throw e;
      console.error('listKeys hatası:', e);
      return [];
    }
  }

  // ── KİMLİK DOĞRULAMA (sunucu tarafı) ──────────────────────────────────────
  // Başarılıysa {ok:true, kullanici} döner ve token'ı saklar.
  // Başarısızsa {ok:false, error} döner (istisna FIRLATMAZ — UI mesaj gösterir).
  async function login(kullaniciAdi, sifre) {
    try {
      const res = await fetch(API_URL + '?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kullaniciAdi, sifre })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Giriş başarısız' };
      tokenKaydet(data.token);
      return { ok: true, kullanici: data.kullanici };
    } catch (e) {
      return { ok: false, error: 'Sunucuya ulaşılamadı: ' + e.message };
    }
  }

  // ── QR + TEKNİK DOSYA UÇLARI (girişli personel, apiFetch ile) ─────────────
  // Her QR'lı kart için sunucuda bir "yetenek anahtarı" tutulur; QR bu
  // anahtarı içerir. Dosyalar dosyalar/ klasöründe, kayıt defteri kv'de durur.
  async function qrJson(action, payload) {
    const res = await apiFetch(API_URL + '?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }
  // Kartın QR anahtarını getir/oluştur → {anahtar, dosyalar}
  async function qrKayitGetir(tip, refId, kod, ad) {
    return qrJson('qrKayit', { tip, refId, kod, ad });
  }
  // Base64 içerikle dosya yükle → {dosyalar, anahtar}
  async function teknikDosyaYukle(payload) {
    return qrJson('dosyaYukle', payload);
  }
  // Montaj şeması görselini AI görme servisine gönderir → {ok, parcalar, genelNot}
  async function montajSemasiOku(payload) {
    return qrJson('montajSemasiOku', payload);
  }
  // Montaj şeması görselini Baidu OCR'a (ücretsiz kotalı bulut metin tanıma) gönderir → {ok, parcalar, genelNot}
  async function montajSemasiOkuBaidu(payload) {
    return qrJson('montajSemasiOkuBaidu', payload);
  }
  // Montaj şeması görselini Google Cloud Vision OCR'a gönderir → {ok, parcalar, genelNot}
  async function montajSemasiOkuGoogle(payload) {
    return qrJson('montajSemasiOkuGoogle', payload);
  }
  // Şifreyi sunucuda bcrypt ile hash'ler; istemci düz metni SAKLAMAZ.
  async function sifreHashle(sifre, kimIcin) {
    const res = await apiFetch(API_URL + '?action=sifreHashle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sifre, kimIcin: kimIcin || '' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sifreHash) throw new Error(data.error || 'Şifre hash\'lenemedi');
    return data.sifreHash;
  }

  async function teknikDosyaSil(tip, refId, dosyaId) {
    return qrJson('dosyaSil', { tip, refId, dosyaId });
  }
  // Salt okunur bağlantı sorgusu — operatör terminali de kullanabilir.
  // → {bulundu, r, anahtar, kod, ad, dosyaSayisi}
  async function qrBaglantiGetir(tip, refId, kod) {
    const q = 'tip=' + encodeURIComponent(tip || '') + '&refId=' + encodeURIComponent(refId || '') + '&kod=' + encodeURIComponent(kod || '');
    const res = await apiFetch(API_URL + '?action=qrBaglanti&' + q);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }

  async function logout() {
    try { await apiFetch(API_URL + '?action=logout', { method: 'POST' }); } catch (e) {}
    tokenKaydet('');
  }

  function oturumVarMi() { return tokenGetir() !== ''; }

  // ── HAT OPERATÖR TERMİNALİ (oturumsuz uçlar) ──────────────────────────────
  // Operatörler ÜretimOS hesabıyla girmez: ana giriş ekranındaki terminal
  // tuşuyla gelir. Bu üç uç düz fetch kullanır (apiFetch DEĞİL) — 401 dönerse
  // "oturum düştü" olayı tetiklenmemeli, form sadece hata mesajı göstermelidir.

  // Giriş formundaki hat/bölüm listesi — token gerektirmez, sadece hat ADLARI döner.
  async function hatListesiGetir() {
    try {
      const res = await fetch(API_URL + '?action=hatListesi');
      const data = await res.json().catch(() => ({}));
      return (data && Array.isArray(data.hatlar)) ? data.hatlar : [];
    } catch (e) { return []; }
  }

  // Kişi bazlı operatör girişi — başarıda 'hat_operator' rolünde KISITLI token
  // saklanır (sunucu yalnızca terminal koleksiyonlarına izin verir).
  async function hatOperatorGiris(hat, isim, sifre) {
    try {
      const res = await fetch(API_URL + '?action=hatGiris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hat, isim, sifre })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Giriş başarısız' };
      tokenKaydet(data.token);
      return { ok: true, operator: data.operator };
    } catch (e) {
      return { ok: false, error: 'Sunucuya ulaşılamadı: ' + e.message };
    }
  }

  // Şifre oluşturma talebi — yönetim onayına düşer (Hat & İstasyon Takibi →
  // 👤 Operatör Yetkileri). Oturumsuzdur; sunucu tarafında hız sınırlıdır.
  async function hatSifreTalepGonder(payload) {
    try {
      const res = await fetch(API_URL + '?action=hatSifreTalep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Talep gönderilemedi' };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Sunucuya ulaşılamadı: ' + e.message };
    }
  }

  // Şifre değiştirme — sunucu bcrypt ile hash'ler.
  async function sifreDegistir(userId, yeniSifre) {
    const res = await apiFetch(API_URL + '?action=changePassword', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, yeniSifre })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Şifre değiştirilemedi');
    return true;
  }

  // Tüm şifreleri [kullanıcıadı]1234 varsayılanına döndürür (sadece yonetim).
  async function sifreleriSifirla() {
    const res = await apiFetch(API_URL + '?action=resetPasswords', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Şifreler sıfırlanamadı');
    return true;
  }

  // GENİŞLETİLMİŞ DENETİM KAYDI (sadece yonetim)
  // Satırlar: {id, ts, kullanici, rol, ip, sayfa, islem, anahtar, kayit_sayisi,
  //            geri_alinabilir, geri_alindi, tarayici}
  // Aylık faaliyet defteri: hangi dönemlerde kaç işlem var (arşiv listesi)
  async function auditDonemleri() {
    const res = await apiFetch(API_URL + '?action=auditDonemler');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Dönem listesi alınamadı');
    return data.donemler || [];
  }

  // Seçili dönemde departman (rol) bazlı kırılım
  async function auditBirimOzeti(donem) {
    const res = await apiFetch(API_URL + '?action=auditBirimOzet&donem=' + encodeURIComponent(donem));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Birim özeti alınamadı');
    return data.birimler || [];
  }

  // Operatör terminali için HAT BAZLI süzülmüş veri. Tüm koleksiyonları
  // indirmek yerine (95 MB) yalnızca o hattın işleri ve ilgili reçeteler
  // gelir (~4 MB). Süzme sunucuda yapılır.
  async function hatVerisiGetir(hat) {
    const res = await apiFetch(API_URL + '?action=hatVerisi&hat=' + encodeURIComponent(hat));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Hat verisi alınamadı');
    return data;
  }

  async function auditGetir(limit, filtre) {
    let url = API_URL + '?action=audit&limit=' + (limit || 300);
    if (filtre && filtre.kullanici) url += '&kullanici=' + encodeURIComponent(filtre.kullanici);
    if (filtre && filtre.anahtar) url += '&anahtar=' + encodeURIComponent(filtre.anahtar);
    if (filtre && filtre.donem) url += '&donem=' + encodeURIComponent(filtre.donem);
    if (filtre && filtre.rol) url += '&rol=' + encodeURIComponent(filtre.rol);
    const res = await apiFetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Denetim kaydı alınamadı');
    return data.rows || [];
  }

  // Sayfa/birim ziyaret geçmişi (sadece yonetim)
  async function ziyaretlerGetir(limit) {
    const res = await apiFetch(API_URL + '?action=ziyaretler&limit=' + (limit || 300));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ziyaret kaydı alınamadı');
    return data.rows || [];
  }

  // Sayfa ziyareti kaydı — her sayfa açılışında çağrılır (hata sessizce yutulur)
  async function sayfaZiyaretiKaydet(sayfa, birim) {
    try {
      await apiFetch(API_URL + '?action=sayfaZiyaret', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sayfa, birim })
      });
    } catch (e) { /* ziyaret logu kullanıcıyı etkilemez */ }
  }

  // Bir denetim kaydının önceki/şimdiki karşılaştırması
  async function auditOnizle(id) {
    const res = await apiFetch(API_URL + '?action=auditOnizle&id=' + encodeURIComponent(id));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Önizleme alınamadı');
    return data;
  }

  // GERİ ALMA: denetim kaydındaki değişikliği geri alır (önceki değeri yazar)
  async function auditGeriAl(id) {
    const res = await apiFetch(API_URL + '?action=auditGeriAl', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Geri alma başarısız');
    return data;
  }

  const sunucuModu = true; // app.js buna bakar: true → login/şifre işlemleri sunucuda

  function coll(name) {
    return {
      async all() { return await get(name, []); },
      async save(arr) { return await set(name, arr); },
      // Tek kayıt işlemleri artık koleksiyonun tamamını göndermez; sunucuda
      // yazma kilidi altında birleştirilir → eşzamanlı kullanımda kayıp yok.
      async upsert(item) {
        if (!item || item.id === undefined) throw new Error('upsert: kaydın id alanı zorunlu');
        await patchUygula(name, { ekle: [], guncelle: [item], sil: [] });
        const g = anlikGoruntu.get(name);
        // Görüntü artık TAM JSON değil PARMAK İZİ tutuyor — buraya da iz
        // yazılmalı, yoksa sonraki fark alma bu kaydı yanlışlıkla
        // "değişmiş" görüp gereksiz yazma yapardı.
        if (g) { try { g.set(String(item.id), parmakIzi(JSON.stringify(item))); } catch (e) {} }
        return item;
      },
      async remove(id) {
        await patchUygula(name, { ekle: [], guncelle: [], sil: [String(id)] });
        const g = anlikGoruntu.get(name);
        if (g) g.delete(String(id));
      },
      async find(id) {
        const arr = await get(name, []);
        return arr.find(x => x.id === id) || null;
      }
    };
  }

  return {
    get, set, del, listKeys, setIfAbsent,
    login, logout, oturumVarMi, sifreDegistir, sifreleriSifirla, auditGetir, auditDonemleri, auditBirimOzeti, topluEkle, topluGuncelle, hatVerisiGetir, sunucuModu,
    hatListesiGetir, hatOperatorGiris, hatSifreTalepGonder,
    qrKayitGetir, teknikDosyaYukle, teknikDosyaSil, qrBaglantiGetir, sifreHashle, montajSemasiOku, montajSemasiOkuBaidu, montajSemasiOkuGoogle,
    ziyaretlerGetir, sayfaZiyaretiKaydet, auditOnizle, auditGeriAl,
    hammaddeler: coll('hammaddeler'),
    yarimamuller: coll('yarimamuller'),
    altMontajlar: coll('altMontajlar'),    // alt montaj kartları — yarımamülden bağımsız 4. kart tipi, kendi reçetesi olabilir
    paketler: coll('paketler'),    // SANAL 5. kart tipi — sevkiyat öncesi paketleme/koli/kutu adedi takibi için; üretim planlama/satınalma/MRP/depo akışlarına HİÇ girmez, sadece Üretim Tamamla→Kalite Onayı→Sevkiyat İrsaliyesi zincirinde kullanılır. Kendi reçetesi olabilir (Reçete Yap gibi).
    urunler: coll('urunler'),
    receteler: coll('receteler'),
    rotalar: coll('rotalar'),
    isemirleri: coll('isemirleri'),
    kesimPlanlari: coll('kesimPlanlari'),
    fiyatListeleri: coll('fiyatListeleri'),
    dosyalar: coll('dosyalar'),

    // ── YENİ KOLEKSİYONLAR (departman akışları) ───────────────────────────────
    talepler: coll('talepler'),                   // üretim/depo -> satınalma (hammadde/hırdavat/yarımamül talebi)
    satinalmaTalepleri: coll('satinalmaTalepleri'), // satınalmacının tedarikçiye gönderdiği resmi talep
    teklifKarsilastirma: coll('teklifKarsilastirma'), // 3 tedarikçi teklifi + komisyon, yönetim onayı
    sayimlar: coll('sayimlar'),                    // Envanter sayımları — dondurulmuş sistem miktarı + sayılan + fark izi
    stokRaf: coll('stokRaf'),                      // yarı mamül + bitmiş ürün + hammadde raf/depo stok miktarları
    stokHareketleri: coll('stokHareketleri'),      // giriş/çıkış log (depo düşümleri, üretim girişleri)
    musteriler: coll('musteriler'),                // cari kartlar
    firsatlar: coll('firsatlar'),                  // CRM: satış fırsatı (pipeline)
    crmAktiviteler: coll('crmAktiviteler'),        // CRM: görüşme/arama/ziyaret kaydı
    kampanyalar: coll('kampanyalar'),              // Pazarlama: kampanya ve fiyat listesi
    numuneler: coll('numuneler'),                  // Pazarlama: numune gönderim ve dönüş takibi
    fiyatListeleri: coll('fiyatListeleri'),        // Pazarlama: segment/bayi bazlı fiyat listesi
    projeler: coll('projeler'),                    // Proje: aşama/hakediş takibi
    tedarikciler: coll('tedarikciler'),             // tedarikçi kartları
    teklifler: coll('teklifler'),                  // müşteriye sunulan teklif (liste fiyatı + iskonto)
    siparisler: coll('siparisler'),                // onaylanan siparişler
    irsaliyeler: coll('irsaliyeler'),               // sevkiyat irsaliyeleri
    sevkiyatProgrami: coll('sevkiyatProgrami'),    // haftalık sevkiyat planı
    dolapTasarimlari: coll('dolapTasarimlari'),    // Dolap Tasarım ekranının kayıtlı tasarımları + revizyon geçmişi
    masaTasarimlari: coll('masaTasarimlari'),      // Masa/Workstation Tasarım ekranının kayıtlı tasarımları + revizyon geçmişi
    mekanlar: coll('mekanlar'),                    // Mekan Yerleşim: oda + üzerine yerleştirilmiş dolap/masa tasarımları
    malzemeTalepleri: coll('malzemeTalepleri'),    // Kayıp-Kaçak K1+2: malzeme talep→onay→teslim zinciri (görev ayrılığı)
    receteTalepleri: coll('receteTalepleri'),
    hatDurumlari: coll('hatDurumlari'),            // Hat beklet/çalış durumu (yönetim+planlama onaylı)      // Hat→Reçete: operatör eksik malzeme/kart talebi → planlama → ARGE/teknik onayı
    kesimIhtiyaclari: coll('kesimIhtiyaclari'),     // hammadde bazlı kesim optimizasyon satırları (sipariş onayında otomatik veya manuel oluşur)
    hammaddeIhtiyaclari: coll('hammaddeIhtiyaclari'), // Planlama: sipariş onayında TÜM reçete kalemlerinden (plaka+hırdavat) hammadde bazlı toplanan ihtiyaç listesi
    satinalmaSiparisleri: coll('satinalmaSiparisleri'), // Satınalma'nın tedarikçiye açtığı resmi sipariş (fiyat güncellenmiş, yönetim onayından geçer)
    kritikStokSeviyeleri: coll('kritikStokSeviyeleri'), // hammaddeId -> manuel kritik stok miktarı (Depo tanımlar)
    ciroHedefleri: coll('ciroHedefleri'),               // ay bazlı (YYYY-MM) manuel ciro hedefi (Yönetim Raporlama)

    // ── BAKIM ─────────────────────────────────────────────────────────────
    makinaTechizat: coll('makinaTechizat'),             // makina/teçhizat envanteri (amortisman, zimmet)
    bakimKayitlari: coll('bakimKayitlari'),              // periyodik/arızi servis kayıtları
    arizaKayitlari: coll('arizaKayitlari'),               // Üretim biriminden açılan arıza kayıtları (Bakım ekranına düşer)
    urunKaliteOnaylari: coll('urunKaliteOnaylari'),       // Üretimi tamamlanan ürünlerin sevkiyat öncesi kalite onayı kayıtları
    uretimIstasyonTakip: coll('uretimIstasyonTakip'),     // sipariş+yarımamül bazlı, hangi istasyonda (rota step'i) olduğu
    duruslar: coll('duruslar'),                            // üretimdeki aksaklık/duruş kayıtları (istasyon + sorumlu departman + alarm seviyesi)

    // ── İNSAN KAYNAKLARI ─────────────────────────────────────────────────
    personeller: coll('personeller'),                   // özlük dosyası, bölüm, maaş, görev tanımı, vekalet
    izinKayitlari: coll('izinKayitlari'),                // yıllık izin kullanım kayıtları (personel+yıl bazlı)
    avanslar: coll('avanslar'),                          // personel avans kayıtları
    bordrolar: coll('bordrolar'),                        // aylık bordro hesap kayıtları (personel+ay bazlı)
    araclar: coll('araclar'),                            // şirket araçları (zimmet, giderler)
    aracGiderleri: coll('aracGiderleri'),                // araç bazlı gider kayıtları (yakıt, bakım, vb.)
    personelGiderleri: coll('personelGiderleri'),        // maaş dışı personel giderleri (yemek, seyahat, konaklama, prim vb.)

    // ── 3 AMBAR YAPISI: DEPO GİRİŞİ ──────────────────────────────────────────
    depoGirisleri: coll('depoGirisleri'), // satınalma siparişi onayında otomatik "beklenen giriş" oluşur, depocu burada işler (irsaliye/fatura, cari kontrol, kalite, eksik teslimat)
    ambarTransferleri: coll('ambarTransferleri'), // ambarlar arası tüm hareketlerin log'u (üretim çekimi, üretim çıkışı, sevkiyat çıkışı, manuel transfer)
    muhasebeKayitlari: coll('muhasebeKayitlari'), // basit gelir/gider/bilanço hareket log'u (makina satışı, vb. kaynaklı)
    faturalar: coll('faturalar'), // irsaliye kesilince otomatik oluşan satış faturaları (KDV + avans mahsuplaşma)
    tahsilatlar: coll('tahsilatlar'), // satışlardan gelen havale/EFT/çek/nakit tahsilatlar (sekmeli ödeme formu ile)
    tahsilatBeklenenler: coll('tahsilatBeklenenler'), // SADECE ileri tarihli NAKİT alacaklar — peşinat/çek/kredi kartı artık sipariş onayında ANINDA işlenir (bkz. siparisOnaylaninceOdemePlaniniAninda İşle), bu koleksiyona hiç düşmez. Vadesi gelince Cari ve Üst Yönetim uyarılır.
    vadeFarkiKayitlari: coll('vadeFarkiKayitlari'), // müşteri bazlı, her çek/kredi kartı ödemesinde hesaplanan vade farkı tutarı — Yönetim ekranında müşteri bazlı toplam gösterilir
    vardiyalar: coll('vardiyalar'),                      // Vardiya tanımları — KPI kapasite tabanı
    lotlar: coll('lotlar'),                              // Parti/lot izlenebilirliği
    lotHareketleri: coll('lotHareketleri'),              // Lot tüketim hareketleri
    stokSayimlari: coll('stokSayimlari'),                // Envanter sayım fişleri
    bildirimler: coll('bildirimler'),                    // Bildirim merkezi
    siparisRevizyonlari: coll('siparisRevizyonlari'),    // Sipariş değişiklik geçmişi
    firmaCekleri: coll('firmaCekleri'),                  // Firmanın kendi çekleri (giden) — vade + nakit çıkış takibi
    musteriCekleri: coll('musteriCekleri'), // müşterilerden tahsil edilen çekler — tedarikçiye ciro edilebilir (kullanılan çek listeden "kullanildi" olarak düşer, bir daha gösterilmez)
    tedarikciOdemeleri: coll('tedarikciOdemeleri'), // tedarikçiye yapılan ödemeler (nakit/havale/çek-ciro) — Muhasebe Panel "Tedarikçi Ödemeleri" sekmesi
    tahsilatOnayBekleyenler: coll('tahsilatOnayBekleyenler'),
    kullaniciler: coll('kullaniciler'), // Kullanıcı adı/şifre çiftleri — her satır {kullaniciAdi, sifreHash, rol, ad} // Muhasebe Panel "Tahsilat Yap" (manuel giriş) formundan girilen TÜM ödeme planları (peşinat+çek+kredi kartı+nakit) — Yönetim onaylamadan kasaya/cariye İŞLENMEZ. Onaylanınca çek "musteriCekleri"ne elde olarak eklenir, diğerleri gerçek tahsilat kaydı olur.
    bankaKredileri: coll('bankaKredileri'), // banka kredisi tanımları (tutar, vade, taksitler, faiz)
    uretimIsEmriIhtiyaclari: coll('uretimIsEmriIhtiyaclari'), // rafta karşılanamayan (eksik) yarımamül miktarları — Üretim Planlama'da iş emrine dönüştürülür

    // ── KALİTE / İADE / DÖF YAPISI ──────────────────────────────────────────
    uygunsuzlukKayitlari: coll('uygunsuzlukKayitlari'), // Her kalite reddinde açılan uygunsuzluk formu (NCR)
    dofKayitlari: coll('dofKayitlari'),                  // Düzeltici/Önleyici Faaliyet (CAPA)
    iadeKalemleri: coll('iadeKalemleri'),                // İade ambarındaki ürün/malzeme kalemleri (2. kalite/defolu/seri sonu)
    duzeltmeGiderleri: coll('duzeltmeGiderleri'),
    istasyonIsleri: coll('istasyonIsleri'),
    isgKazalar: coll('isgKazalar'),
    isgRiskler: coll('isgRiskler'),
    isgKkdZimmet: coll('isgKkdZimmet'),
    isgEgitimler: coll('isgEgitimler'),
    isgSaglikMuayene: coll('isgSaglikMuayene'),
    aiBulgulari: coll('aiBulgulari'),
    aiRaporlari: coll('aiRaporlari'),
    kontrolPlanlari: coll('kontrolPlanlari'),            // Kalite kontrol planı — hangi parçada, hangi istasyonda, hangi özellik, hangi toleransla ölçülür
    olcumKayitlari: coll('olcumKayitlari'),              // Operatörün girdiği ölçüm sonuçları (uygun/uygunsuz + değer) — kök neden analizinin ham verisi
    hatSifreleri: coll('hatSifreleri'),                  // Hat/bölüm operatör terminali giriş şifreleri
    hatOperatorleri: coll('hatOperatorleri'),            // Yönetim onaylı hat operatörleri — {id, isim, sifre, hatlar:[], durum:'aktif'|'pasif'} — kişi bazlı hat yetkilendirmesi
    hatSifreTalepleri: coll('hatSifreTalepleri'),        // Operatör şifre oluşturma talepleri — {id, isim, sifre, hatlar:[], durum:'bekliyor'|'onaylandi'|'reddedildi'} — yönetim değerlendirir
    gerceklesenSureKayitlari: coll('gerceklesenSureKayitlari'), // İstasyonlarda ölçülen gerçek işlem süreleri              // Hat & istasyon takibi iş kartları        // Kaliteden dönen siparişlerin düzeltme giderleri (malzeme + işçilik)
    tedarikciIadeFaturalari: coll('tedarikciIadeFaturalari'), // Satınalmanın tedarikçiye kestiği iade faturası
    eFaturalar: coll('eFaturalar'),                      // E-Fatura/E-Arşiv gönderim kayıtları
    firmaBilgileri: coll('firmaBilgileri'),              // Firmanın resmi bilgileri (e-Fatura satıcı)
    sikayetler: coll('sikayetler'),                      // Satış sonrası müşteri şikayetleri
    servisTalepleri: coll('servisTalepleri'),            // Saha servis müdahaleleri

    // ── HAMMADDE KATEGORİLERİ (runtime'da genişletilebilir) ─────────────────
    // Basit bir string dizisi olarak saklanır (örn. ["Plaka","Hırdavat",
    // "Sarf Malzemesi","Yedek Parça"]). Varsayılan kategorilerle seed'lenir;
    // kullanıcı Hammadde formundan "+ Yeni Kategori" ile kalıcı olarak yeni
    // kategori (örn. "Diğer" altında kendi başlığı) ekleyebilir.
    async hammaddeKategorileriGetir() { return await get('hammaddeKategorileri', []); },
    async hammaddeKategorileriKaydet(liste) { return await set('hammaddeKategorileri', liste); },
    // ── HATLAR / İSTASYONLAR (runtime'da genişletilebilir) ─────────────────
    // Veri yapısı dizi değil obje olduğu için ({hat_adi: [{kod,tanim,grup},...]})
    // coll() yerine basit get/set kullanılır. data.js'deki HATLAR sabitinden
    // ilk kurulumda (seedIfEmpty) bire bir kopyalanır, sonrasında kullanıcı
    // Rota ekranından kalıcı olarak yeni hat/istasyon ekleyebilir.
    async hatlarGetir() { return await get('hatlar', {}); },
    async hatlarKaydet(hatlarObj) { return await set('hatlar', hatlarObj); },

    async ayarlar() { return await get('ayarlar', { ...VARSAYILAN_AYARLAR }); },
    async setAyarlar(a) { return await set('ayarlar', a); },

    // ── İlk kurulum: seed verilerini yükle (sadece hiç veri yoksa, ve sadece BİR
    // kullanıcı/sekme yazsın — setIfAbsent ile yarış durumu engellenir) ────────
    async seedIfEmpty() {
      // Atomik kilit: bu satırı ilk yazan kazanır. Eşzamanlı iki kullanıcı aynı
      // anda ilk açılışı yapsa bile seed verisi sadece bir kere eklenir.
      const kazandimMi = await setIfAbsent('_seeded', true);
      if (!kazandimMi) return false; // başka biri zaten seedledi (veya daha önce seedlenmiş)

      // 1) Hammaddeler
      await set('hammaddeler', HAMMADDE_SEED.map((h, i) => ({
        id: h.id || ('HM-' + (i + 1)),
        ...h
      })));

      // 2) JUDGE kesim listesinden örnek bitmiş ürünler + yarı mamüller + reçete
      const urunler = [];
      const yarimamuller = [];
      const receteler = [];
      JUDGE_KESIM_SEED.forEach((u, ui) => {
        const urunId = 'URN-' + u.kod;
        urunler.push({
          id: urunId, kod: u.kod, ad: u.ad, tip: 'bitmis_urun',
          aciklama: 'İçe aktarılan kesim listesinden (824_JUDGE)',
          gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10)
        });
        const bomKalemleri = [];
        u.parcalar.forEach((p, pi) => {
          const ymId = 'YM-' + u.kod + '-' + (pi + 1);
          yarimamuller.push({
            id: ymId,
            kod: u.kod + '.P' + (pi + 1),
            ad: p.ad,
            aciklama: p.aciklama || '',
            kalinlik: p.kalinlik || null,
            renk: p.renk || null,
            netBoy: p.boy || null,
            netEn: p.en || null,
            kabaBoy: p.kabaBoy || p.boy || null,
            kabaEn: p.kabaEn || p.en || null,
            adet: p.adet || 1,
            hammaddeId: null,
            gorseller: [],
            rotaId: null
          });
          bomKalemleri.push({ tip: 'yarimamul', refId: ymId, miktar: p.adet || 1, birim: 'ADET' });
        });
        receteler.push({
          id: 'RC-' + u.kod,
          urunId: urunId,
          ad: u.ad + ' Reçetesi',
          kalemler: bomKalemleri
        });
      });
      await set('urunler', urunler);
      await set('yarimamuller', yarimamuller);
      await set('receteler', receteler);

      // 3) RDM reçete örneğini ayrı bir bitmiş ürün olarak da ekle (hiyerarşik BOM örneği)
      const rdmUrunId = 'URN-RD.M.14080.S2.15.97';
      const rdmUrun = {
        id: rdmUrunId, kod: 'RD.M.14080.S2.15.97', ad: 'Radical 14080 30mm', tip: 'bitmis_urun',
        aciklama: 'İçe aktarılan alt kırılım reçetesinden (RD_M)', gorseller: [],
        olusturmaTarihi: new Date().toISOString().slice(0, 10)
      };
      const urunler2 = await get('urunler', []);
      urunler2.push(rdmUrun);
      await set('urunler', urunler2);
      await set('_rdm_raw_seed', RDM_RECETE_SEED); // ham hiyerarşi ayrı saklanır, reçete sayfası kendi render eder

      // 4) Ayarlar (sadece henüz yoksa — biri zaten ayar değiştirmişse ezilmesin)
      await setIfAbsent('ayarlar', { ...VARSAYILAN_AYARLAR });

      // 5) Boş koleksiyonlar (sadece henüz yoksa)
      await setIfAbsent('rotalar', []);
      await setIfAbsent('isemirleri', []);
      await setIfAbsent('kesimPlanlari', []);
      await setIfAbsent('fiyatListeleri', []);
      await setIfAbsent('dosyalar', []);
      await setIfAbsent('talepler', []);
      await setIfAbsent('satinalmaTalepleri', []);
      await setIfAbsent('teklifKarsilastirma', []);
      await setIfAbsent('stokHareketleri', []);
      await setIfAbsent('musteriler', MUSTERI_SEED || []);
      await setIfAbsent('tedarikciler', TEDARIKCI_SEED || []);
      await setIfAbsent('teklifler', []);
      await setIfAbsent('siparisler', []);
      await setIfAbsent('irsaliyeler', []);
      await setIfAbsent('sevkiyatProgrami', []);
      await setIfAbsent('kesimIhtiyaclari', []);
      await setIfAbsent('dolapTasarimlari', []);
      await setIfAbsent('masaTasarimlari', []);
      await setIfAbsent('mekanlar', []);
      await setIfAbsent('malzemeTalepleri', []);
      await setIfAbsent('receteTalepleri', []);
      await setIfAbsent('projeler', []);
      await setIfAbsent('kampanyalar', []);
      await setIfAbsent('fiyatListeleri', []);
      await setIfAbsent('numuneler', []);
      await setIfAbsent('crmAktiviteler', []);
      await setIfAbsent('firsatlar', []);
      await setIfAbsent('hatDurumlari', []);
      await setIfAbsent('hammaddeIhtiyaclari', []);
      await setIfAbsent('satinalmaSiparisleri', []);
      await setIfAbsent('kritikStokSeviyeleri', []);
      await setIfAbsent('ciroHedefleri', []);
      // Rota planlamasında seçilebilen TÜM makina/teçhizatı (HATLAR listesi, data.js)
      // Bakım envanterine otomatik ekle. Alış tarihi/fiyatı bilinmediği için
      // varsayılan/boş bırakılır, kullanıcı Bakım Paneli'nden tamamlayabilir.
      const hatlarMakinaSeed = [];
      Object.entries(HATLAR || {}).forEach(([hat, maks]) => {
        maks.forEach(m => {
          hatlarMakinaSeed.push({
            id: 'MKN-' + m.kod, kod: m.kod, ad: m.tanim, kategori: m.grup, hat,
            alisTarihi: '', alisFiyati: 0, amortismanYili: 10,
            zimmetliPersonelId: null, konum: hat, durum: 'aktif',
            rotaKaynakli: true // bu makina HATLAR listesinden otomatik geldi
          });
        });
      });
      await setIfAbsent('makinaTechizat', hatlarMakinaSeed);
      await setIfAbsent('bakimKayitlari', []);
      await setIfAbsent('arizaKayitlari', []);
      await setIfAbsent('urunKaliteOnaylari', []);
      await setIfAbsent('uretimIstasyonTakip', []);
      await setIfAbsent('duruslar', []);
      await setIfAbsent('personeller', PERSONEL_SEED || []);
      await setIfAbsent('izinKayitlari', []);
      await setIfAbsent('avanslar', []);
      await setIfAbsent('bordrolar', []);
      await setIfAbsent('araclar', ARAC_SEED || []);
      await setIfAbsent('aracGiderleri', []);
      await setIfAbsent('personelGiderleri', []);
      await setIfAbsent('depoGirisleri', []);
      await setIfAbsent('ambarTransferleri', []);
      await setIfAbsent('muhasebeKayitlari', []);
      await setIfAbsent('faturalar', []);
      await setIfAbsent('tahsilatlar', []);
      await setIfAbsent('tahsilatBeklenenler', []);
      await setIfAbsent('vadeFarkiKayitlari', []);
      await setIfAbsent('musteriCekleri', []);
      await setIfAbsent('tedarikciOdemeleri', []);
      await setIfAbsent('tahsilatOnayBekleyenler', []);

      // ── KULLANICI HESAPLARI (Şifreli Giriş Sistemi) ─────────────────────
      // Her rol için bir varsayılan hesap. Şifre formatı: [rol]1234
      // Hash: basit SHA-256 yerine karşılaştırma kolaylığı için düz metin + salt
      // Yönetim tüm şifreleri "yonetim1234" şifresiyle sıfırlayabilir.
      const VARSAYILAN_KULLANICILAR = [
        { id: 'USR-yonetim',   kullaniciAdi: 'yonetim',   sifreHash: 'yonetim1234',   rol: 'yonetim',          ad: 'Üst Yönetim' },
        { id: 'USR-arge',      kullaniciAdi: 'arge',       sifreHash: 'arge1234',       rol: 'arge',             ad: 'ARGE' },
        { id: 'USR-teknik',    kullaniciAdi: 'teknik',     sifreHash: 'teknik1234',     rol: 'teknik_ofis',      ad: 'Teknik Ofis' },
        { id: 'USR-satinalma', kullaniciAdi: 'satinalma',  sifreHash: 'satinalma1234',  rol: 'satinalma',        ad: 'Satınalma' },
        { id: 'USR-uretim',    kullaniciAdi: 'uretim',     sifreHash: 'uretim1234',     rol: 'uretim_planlama',  ad: 'Üretim Planlama' },
        { id: 'USR-depo',      kullaniciAdi: 'depo',       sifreHash: 'depo1234',       rol: 'depo',             ad: 'Depo' },
        { id: 'USR-cari',      kullaniciAdi: 'cari',       sifreHash: 'cari1234',       rol: 'cari',             ad: 'Cari İşlemler' },
        { id: 'USR-teklif',    kullaniciAdi: 'teklif',     sifreHash: 'teklif1234',     rol: 'teklif_siparis',   ad: 'Teklif & Sipariş' },
        { id: 'USR-sevkiyat',  kullaniciAdi: 'sevkiyat',   sifreHash: 'sevkiyat1234',   rol: 'sevkiyat',         ad: 'Sevkiyat' },
        { id: 'USR-muhasebe',  kullaniciAdi: 'muhasebe',   sifreHash: 'muhasebe1234',   rol: 'muhasebe',         ad: 'Muhasebe' },
        { id: 'USR-kalite',    kullaniciAdi: 'kalite',     sifreHash: 'kalite1234',     rol: 'kalite',           ad: 'Kalite Kontrol' },
        { id: 'USR-ik',        kullaniciAdi: 'ik',         sifreHash: 'ik1234',         rol: 'ik',               ad: 'İnsan Kaynakları' },
        { id: 'USR-bakim',     kullaniciAdi: 'bakim',      sifreHash: 'bakim1234',      rol: 'bakim',            ad: 'Bakım' },
      ];
      await setIfAbsent('kullaniciler', VARSAYILAN_KULLANICILAR);
      await setIfAbsent('altMontajlar', []);
      await setIfAbsent('paketler', []);
      await setIfAbsent('hatlar', JSON.parse(JSON.stringify(HATLAR || {})));
      await setIfAbsent('hammaddeKategorileri', [...(HAMMADDE_KATEGORI_SEED || [])]);
      await setIfAbsent('bankaKredileri', []);
      await setIfAbsent('uretimIsEmriIhtiyaclari', []);

      // 6) Raf stok seed — her yarı mamül ve hammadde için başlangıç stok miktarı.
      // Yarımamüller Üretim Ambarı'nda, hammaddeler Hammadde Deposu'nda başlar (3 ambar yapısı).
      const ymList = await get('yarimamuller', []);
      const hmList = await get('hammaddeler', []);
      const stokRafSeed = [
        ...ymList.map(y => ({ id: 'STK-uretim_ambari-yarimamul-' + y.id, ambar: 'uretim_ambari', tip: 'yarimamul', refId: y.id, refKod: y.kod, refAd: y.ad, miktar: Math.floor(Math.random() * 40) + 5, birim: 'ADET' })),
        ...hmList.map(h => ({ id: 'STK-hammadde_deposu-hammadde-' + h.id, ambar: 'hammadde_deposu', tip: 'hammadde', refId: h.id, refKod: h.stokKodu, refAd: h.ad, miktar: Math.floor(Math.random() * 200) + 20, birim: h.birim }))
      ];
      await setIfAbsent('stokRaf', stokRafSeed);

      return true;
    },

    // ── SİSTEMİ SIFIRLA (TEHLİKELİ BÖLGE) ──────────────────────────────────
    // KULLANICI KARARI: ARGE+Cari+Üst Yönetim onay kutucukları + "sil1234"
    // şifresi ile korunan, TÜM iş verisini (reçete, kart, personel, müşteri,
    // sipariş, fatura, stok — TÜMÜ) kalıcı olarak siler. Uygulamanın kendisi
    // (kod, roller, ekranlar) ve sistem ayarları (maliyet/fiyat parametreleri)
    // korunur — sadece veri sıfırlanır. "_seeded" bayrağı TRUE bırakılır ki
    // bir sonraki açılışta demo/örnek veri tekrar otomatik yüklenmesin —
    // kullanıcı gerçekten "sıfır program çıktısı" istiyor, demo değil.
    async sistemiSifirla() {
      const TUM_VERI_KOLEKSIYONLARI = [
        'hammaddeler', 'yarimamuller', 'altMontajlar', 'paketler', 'urunler',
        'receteler', 'rotalar', 'isemirleri', 'kesimPlanlari', 'fiyatListeleri',
        'dosyalar', 'talepler', 'satinalmaTalepleri', 'teklifKarsilastirma',
        'stokRaf', 'stokHareketleri', 'musteriler', 'tedarikciler', 'teklifler',
        'siparisler', 'irsaliyeler', 'sevkiyatProgrami', 'kesimIhtiyaclari', 'dolapTasarimlari', 'masaTasarimlari', 'mekanlar', 'malzemeTalepleri', 'receteTalepleri', 'hatDurumlari', 'firsatlar', 'crmAktiviteler', 'kampanyalar', 'numuneler', 'fiyatListeleri', 'projeler',
        'hammaddeIhtiyaclari', 'satinalmaSiparisleri', 'kritikStokSeviyeleri',
        'ciroHedefleri', 'makinaTechizat', 'bakimKayitlari', 'arizaKayitlari',
        'urunKaliteOnaylari', 'uretimIstasyonTakip', 'duruslar', 'personeller',
        'izinKayitlari', 'avanslar', 'bordrolar', 'araclar', 'aracGiderleri',
        'personelGiderleri', 'depoGirisleri', 'ambarTransferleri',
        'muhasebeKayitlari', 'faturalar', 'tahsilatlar', 'tahsilatBeklenenler',
        'vadeFarkiKayitlari', 'musteriCekleri', 'tedarikciOdemeleri',
        'tahsilatOnayBekleyenler', 'bankaKredileri', 'uretimIsEmriIhtiyaclari',
        // ── HAT / ÜRETİM SAHASI ────────────────────────────────────────────
        // istasyonIsleri: hat operatör terminalindeki AÇIK İŞ EMİRLERİ.
        // Bunlar sıfırlamada atlanıyordu; sistem sıfırlansa bile terminalde
        // eski işler görünmeye devam ediyordu.
        'istasyonIsleri', 'gerceklesenSureKayitlari', 'vardiyalar',
        'hatOperatorleri', 'hatSifreleri', 'hatSifreTalepleri',
        // ── KALİTE ─────────────────────────────────────────────────────────
        'uygunsuzlukKayitlari', 'dofKayitlari', 'kontrolPlanlari',
        'olcumKayitlari', 'duzeltmeGiderleri', 'sikayetler', 'servisTalepleri',
        // ── İZLENEBİLİRLİK / SAYIM ─────────────────────────────────────────
        'lotlar', 'lotHareketleri', 'sayimlar', 'stokSayimlari',
        // ── İSG ────────────────────────────────────────────────────────────
        'isgEgitimler', 'isgKazalar', 'isgKkdZimmet', 'isgRiskler', 'isgSaglikMuayene',
        // ── TİCARİ / MUHASEBE ──────────────────────────────────────────────
        'eFaturalar', 'firmaCekleri', 'iadeKalemleri', 'siparisRevizyonlari',
        'tedarikciIadeFaturalari',
        // ── SİSTEM ÜRETİMİ KAYITLAR ────────────────────────────────────────
        'bildirimler', 'aiBulgulari', 'aiRaporlari'
      ];
      // KORUNANLAR (bilerek silinmez — bunlar veri değil KURULUM bilgisidir):
      //   kullaniciler   → silinirse kimse sisteme giremez
      //   firmaBilgileri → unvan, vergi no, logo: yeniden girilmesi gereksiz
      // Bunların da sıfırlanması istenirse listeye eklenmesi yeterlidir.
      for (const koleksiyonAdi of TUM_VERI_KOLEKSIYONLARI) {
        await set(koleksiyonAdi, []);
      }
      return true;
    }
  };
})();
