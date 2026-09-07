// ════════════════════════════════════════════════════════════════════════════
// PAZARLAMA MOTORU — Kampanya, Fiyat Listesi, Numune Takibi
// ────────────────────────────────────────────────────────────────────────────
// Üç işi bir arada yürütür:
//   1) KAMPANYA — dönemsel indirim/promosyon; hangi ürün grubuna, ne oranda,
//      hangi tarihler arasında, hangi müşteri segmentine
//   2) FİYAT LİSTESİ — bayi/segment bazlı farklı liste fiyatları
//   3) NUMUNE — kime hangi numune gitti, dönüş oldu mu, sipariş doğurdu mu
//
// NEDEN ÖNEMLİ: Kampanya ve fiyat listesi kayıt altına alınmazsa, teklif
// aşamasında "bu müşteriye hangi fiyatı vermiştik" sorusu cevapsız kalır ve
// iskonto kontrolsüz dağılır — kârlılığın en sessiz kaybı budur.
// ════════════════════════════════════════════════════════════════════════════
const PazarlamaMotor = (() => {

  const KAMPANYA_TIPLERI = [
    { id: 'yuzde_indirim', ad: 'Yüzde İndirim', birim: '%' },
    { id: 'tutar_indirim', ad: 'Tutar İndirimi', birim: '₺' },
    { id: 'hediye', ad: 'Hediye / Promosyon', birim: '' },
    { id: 'vade', ad: 'Vade Avantajı', birim: 'gün' }
  ];

  const SEGMENTLER = ['Tümü', 'Bayi', 'Proje/Müteahhit', 'Perakende', 'İhracat', 'Kurumsal'];

  const NUMUNE_DURUM = {
    hazirlaniyor: 'Hazırlanıyor', gonderildi: 'Gönderildi',
    teslim: 'Teslim Edildi', geri_bildirim: 'Geri Bildirim Alındı',
    siparise_dondu: 'Siparişe Döndü', olumsuz: 'Olumsuz Sonuçlandı'
  };

  // ── KAMPANYA GEÇERLİLİĞİ ─────────────────────────────────────────────────
  // Bir kampanya belirli tarihte ve belirli segment için geçerli mi?
  // Tarih kontrolü gün bazındadır; saat farkı hesaba katılmaz (sözleşmede de
  // gün üzerinden konuşulur).
  function gecerliMi(kampanya, tarih, segment) {
    if (!kampanya || kampanya.durum !== 'aktif') return false;
    const g = (tarih || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (kampanya.baslangic && g < kampanya.baslangic) return false;
    if (kampanya.bitis && g > kampanya.bitis) return false;
    if (segment && kampanya.segment && kampanya.segment !== 'Tümü'
      && kampanya.segment !== segment) return false;
    return true;
  }

  // Verilen tarih/segment için geçerli kampanyalar (en yüksek indirim önde)
  function gecerliKampanyalar(kampanyalar, tarih, segment) {
    return (kampanyalar || [])
      .filter(k => gecerliMi(k, tarih, segment))
      .sort((a, b) => (+b.deger || 0) - (+a.deger || 0));
  }

  // ── İNDİRİMLİ FİYAT ──────────────────────────────────────────────────────
  // Kampanya uygulanmış fiyatı döndürür. Kampanyalar ÜST ÜSTE BİNMEZ —
  // yalnızca en avantajlısı uygulanır. Bunun sebebi: birden çok kampanyanın
  // çarpışması kontrolsüz iskonto üretir ve marjı görünmez şekilde eritir.
  function fiyatUygula(listeFiyat, kampanya) {
    const f = +listeFiyat || 0;
    if (!kampanya || !f) return { fiyat: f, indirim: 0, kampanya: null };
    let yeni = f;
    if (kampanya.tip === 'yuzde_indirim') yeni = f * (1 - (+kampanya.deger || 0) / 100);
    else if (kampanya.tip === 'tutar_indirim') yeni = Math.max(0, f - (+kampanya.deger || 0));
    // hediye ve vade fiyatı değiştirmez — ayrı avantajdır
    return {
      fiyat: Math.round(yeni * 100) / 100,
      indirim: Math.round((f - yeni) * 100) / 100,
      kampanya: kampanya.ad || null
    };
  }

  // ── FİYAT LİSTESİ ────────────────────────────────────────────────────────
  // Bir ürünün belirli segment için liste fiyatı. Segment listesi yoksa
  // 'Tümü' listesine, o da yoksa ürünün temel fiyatına düşer.
  function listeFiyatBul(fiyatListeleri, urunId, segment) {
    const listeler = fiyatListeleri || [];
    const segmentli = listeler.find(l => l.segment === segment && l.durum === 'aktif');
    const genel = listeler.find(l => l.segment === 'Tümü' && l.durum === 'aktif');
    for (const l of [segmentli, genel]) {
      if (!l) continue;
      const k = (l.kalemler || []).find(x => x.urunId === urunId);
      if (k) return { fiyat: +k.fiyat || 0, liste: l.ad, segment: l.segment };
    }
    return null;
  }

  // ── TOPLU EXCEL FİYAT GİRİŞİ ─────────────────────────────────────────────
  // Fiyat listeleri kurulduktan sonra kalem eklemenin TEK yolu buydu: hiçbiri
  // — liste boş kalıyordu (page_pazarlama.js'teki eski not: "Toplu fiyat
  // girişi için Excel aktarımı ileride eklenebilir"). Bu iki saf fonksiyon
  // (DOM/Store'a dokunmaz — page_pazarlama.js yalnızca XLSX.read/sheet_to_json
  // ile dosyayı 2 boyutlu diziye çevirip buraya verir) o boşluğu kapatır.
  const sayiCoz = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  // tumSatirlar: XLSX.utils.sheet_to_json(ws, {header:1}) çıktısı (dizi dizisi).
  // Başlık satırı otomatik bulunur (kod ve fiyat benzeri sütun içeren ilk satır).
  function fiyatDosyasiniCoz(tumSatirlar, urunler) {
    const satirlar = tumSatirlar || [];
    if (satirlar.length < 2) return { kayitlar: [], hatalar: ['Dosyada veri satırı yok.'] };

    const norm = (b) => String(b || '').toLocaleLowerCase('tr').trim();
    let bIdx = -1, kodIdx = -1, fiyatIdx = -1;
    for (let i = 0; i < Math.min(10, satirlar.length); i++) {
      const basliklar = (satirlar[i] || []).map(norm);
      const k = basliklar.findIndex(b => b === 'kod' || b === 'ürün kodu' || b === 'urun kodu' || b.includes('kod'));
      const f = basliklar.findIndex(b => b === 'fiyat' || b === 'liste fiyatı' || b === 'liste fiyati' || b.includes('fiyat'));
      if (k >= 0 && f >= 0) { bIdx = i; kodIdx = k; fiyatIdx = f; break; }
    }
    if (bIdx < 0) return { kayitlar: [], hatalar: ['Başlık satırı bulunamadı — bir sütun "Kod", diğeri "Fiyat" adını taşımalı.'] };

    const urunIndeks = new Map((urunler || []).map(u => [String(u.kod || '').toLocaleUpperCase('tr'), u]));
    const kayitlar = [], hatalar = [];
    satirlar.slice(bIdx + 1).forEach((r, i) => {
      if (!r || !r.some(c => String(c ?? '').trim() !== '')) return;
      const kod = String(r[kodIdx] ?? '').trim();
      if (!kod) { hatalar.push(`Satır ${bIdx + i + 2}: kod boş — atlandı`); return; }
      const fiyat = sayiCoz(r[fiyatIdx]);
      if (fiyat == null || fiyat < 0) { hatalar.push(`Satır ${bIdx + i + 2}: geçersiz fiyat — atlandı (${kod})`); return; }
      const urun = urunIndeks.get(kod.toLocaleUpperCase('tr'));
      kayitlar.push({ kod, urunId: urun ? urun.id : null, ad: urun ? urun.ad : null, fiyat, eslesti: !!urun });
    });
    return { kayitlar, hatalar };
  }

  // kayitlar: fiyatDosyasiniCoz() çıktısındaki .kayitlar (yalnızca eslesti:true
  // olanlar uygulanır). liste MUTATE EDİLMEZ — yeni kalemler dizisi döner,
  // kaydetmek çağıranın sorumluluğundadır (Store.fiyatListeleri.upsert).
  function fiyatListesineTopluUygula(liste, kayitlar) {
    const kalemler = (liste.kalemler || []).map(k => ({ ...k }));
    let eklenen = 0, guncellenen = 0, atlanan = 0;
    (kayitlar || []).forEach(kay => {
      if (!kay.eslesti || !kay.urunId) { atlanan++; return; }
      const mevcut = kalemler.find(k => k.urunId === kay.urunId);
      if (mevcut) { mevcut.fiyat = kay.fiyat; guncellenen++; }
      else { kalemler.push({ urunId: kay.urunId, kod: kay.kod, ad: kay.ad, fiyat: kay.fiyat }); eklenen++; }
    });
    return { kalemler, eklenen, guncellenen, atlanan };
  }

  // ── NUMUNE DÖNÜŞ ORANI ───────────────────────────────────────────────────
  // Pazarlama harcamasının en ölçülebilir kalemi: gönderilen numunenin ne
  // kadarı siparişe döndü? Sonuçlanmamış numuneler orana dahil edilmez.
  function numuneDonusOrani(numuneler, filtre) {
    const liste = (numuneler || []).filter(n =>
      (!filtre || !filtre.temsilci || n.temsilci === filtre.temsilci));
    const sonuclanan = liste.filter(n => ['siparise_dondu', 'olumsuz'].includes(n.durum));
    const basarili = sonuclanan.filter(n => n.durum === 'siparise_dondu');
    return {
      toplam: liste.length,
      bekleyen: liste.filter(n => !['siparise_dondu', 'olumsuz'].includes(n.durum)).length,
      sonuclanan: sonuclanan.length,
      basarili: basarili.length,
      oran: sonuclanan.length ? (basarili.length / sonuclanan.length * 100) : null,
      guvenilir: sonuclanan.length >= 10,
      maliyet: liste.reduce((a, n) => a + (+n.maliyet || 0), 0),
      donenSiparis: basarili.reduce((a, n) => a + (+n.siparisTutari || 0), 0)
    };
  }

  // Uzun süredir geri bildirim alınmamış numuneler
  function takipBekleyenler(numuneler, gunEsigi) {
    const esik = gunEsigi || 21;
    const bugun = Date.now();
    return (numuneler || [])
      .filter(n => ['gonderildi', 'teslim'].includes(n.durum))
      .map(n => ({
        ...n,
        bekleyenGun: Math.floor((bugun - new Date(n.gonderimTarihi || n.tarih || 0).getTime()) / 86400000)
      }))
      .filter(n => n.bekleyenGun >= esik)
      .sort((a, b) => b.bekleyenGun - a.bekleyenGun);
  }

  async function kampanyaOlustur({ ad, tip, deger, segment, baslangic, bitis, kapsam, aciklama }) {
    if (!ad || !ad.trim()) return { ok: false, hata: 'Kampanya adı zorunlu.' };
    if (!tip) return { ok: false, hata: 'Kampanya tipi seçilmeli.' };
    if (tip === 'yuzde_indirim' && (+deger < 0 || +deger > 100)) {
      return { ok: false, hata: 'Yüzde indirim 0-100 arasında olmalı.' };
    }
    if (baslangic && bitis && bitis < baslangic) {
      return { ok: false, hata: 'Bitiş tarihi başlangıçtan önce olamaz.' };
    }
    const k = {
      id: App.uid('KMP'),
      kod: 'KMP-' + Date.now().toString(36).toUpperCase(),
      ad: ad.trim(), tip, deger: +deger || 0,
      segment: segment || 'Tümü',
      baslangic: baslangic || '', bitis: bitis || '',
      kapsam: (kapsam || '').trim(),
      aciklama: (aciklama || '').trim(),
      durum: 'aktif',
      olusturan: App.aktifRol ? App.aktifRol() : '',
      olusturmaTarihi: new Date().toISOString()
    };
    await App.persist(() => Store.topluEkle('kampanyalar', [k], 1));
    return { ok: true, kampanya: k };
  }

  async function numuneGonder({ musteriId, musteriAdi, urunAdi, adet, maliyet,
    temsilci, firsatId, not }) {
    if (!musteriAdi && !musteriId) return { ok: false, hata: 'Müşteri belirtilmeli.' };
    if (!urunAdi || !urunAdi.trim()) return { ok: false, hata: 'Numune ürünü belirtilmeli.' };
    const n = {
      id: App.uid('NUM'),
      kod: 'NUM-' + Date.now().toString(36).toUpperCase(),
      musteriId: musteriId || null, musteriAdi: musteriAdi || '',
      urunAdi: urunAdi.trim(), adet: +adet || 1,
      maliyet: +maliyet || 0,
      temsilci: temsilci || (App.aktifRol ? App.aktifRol() : ''),
      firsatId: firsatId || null,
      durum: 'hazirlaniyor',
      tarih: new Date().toISOString().slice(0, 10),
      gonderimTarihi: '', geriBildirim: '', siparisTutari: 0,
      not: (not || '').trim()
    };
    await App.persist(() => Store.topluEkle('numuneler', [n], 1));
    return { ok: true, numune: n };
  }

  async function numuneDurumGuncelle(numuneId, durum, { geriBildirim, siparisTutari }) {
    const liste = await Store.numuneler.all();
    const n = liste.find(x => x.id === numuneId);
    if (!n) return { ok: false, hata: 'Numune bulunamadı.' };
    if (!NUMUNE_DURUM[durum]) return { ok: false, hata: 'Geçersiz durum.' };
    // Olumsuz veya siparişe döndü işaretlenirken sebep/tutar istenir:
    // bu bilgi olmadan numune yatırımının geri dönüşü ölçülemez.
    if (durum === 'olumsuz' && (!geriBildirim || !geriBildirim.trim())) {
      return { ok: false, hata: 'Olumsuz sonuçta geri bildirim zorunlu — neden beğenilmedi?' };
    }
    if (durum === 'siparise_dondu' && !(+siparisTutari > 0)) {
      return { ok: false, hata: 'Siparişe döndüyse sipariş tutarı girilmeli.' };
    }
    n.durum = durum;
    if (durum === 'gonderildi' && !n.gonderimTarihi) {
      n.gonderimTarihi = new Date().toISOString().slice(0, 10);
    }
    if (geriBildirim != null) n.geriBildirim = String(geriBildirim).trim();
    if (siparisTutari != null) n.siparisTutari = +siparisTutari || 0;
    n.sonGuncelleme = new Date().toISOString();
    await App.persist(() => Store.topluGuncelle('numuneler', [n], 1));
    return { ok: true, numune: n };
  }

  return {
    KAMPANYA_TIPLERI, SEGMENTLER, NUMUNE_DURUM,
    gecerliMi, gecerliKampanyalar, fiyatUygula, listeFiyatBul,
    numuneDonusOrani, takipBekleyenler,
    kampanyaOlustur, numuneGonder, numuneDurumGuncelle,
    fiyatDosyasiniCoz, fiyatListesineTopluUygula
  };
})();

if (typeof module !== 'undefined') module.exports = PazarlamaMotor;
