// ════════════════════════════════════════════════════════════════════════════
// RENK KARTELASI — şirketin "Renk Kartelamız" referans listesi (sabit, salt
// okunur). Kullanıcının yüklediği Excel'in "Renk Kartelası" sayfasından
// BİREBİR aktarılmıştır (openpyxl/xlrd ile doğrulandı — tahmin edilmedi).
// Kaynak sayfada iki satır ("*****************************", Metal 85/86)
// açıkça dolgu/yer tutucu olduğundan atlanmıştır — gerçek bir renk adı değildir.
//
// Kullanım alanı: hammadde kartlarına "bu hammadde hangi kartela koduna
// karşılık geliyor" etiketi eklerken (page_hammadde.js) ve Renk Eşleştirme
// Anahtarı ekranında (page_renk_anahtari.js) seçim listesi olarak.
// ════════════════════════════════════════════════════════════════════════════
const RenkKartelasi = (() => {
  const liste = [
    // ── Melamin ──
    { kod: '01', ad: 'Dafne', kategori: 'Melamin' },
    { kod: '02', ad: 'Wenge', kategori: 'Melamin' },
    { kod: '03', ad: 'Akçaağaç', kategori: 'Melamin' },
    { kod: '04', ad: 'Nagano Meşe', kategori: 'Melamin' },
    { kod: '05', ad: 'Cabana', kategori: 'Melamin' },
    { kod: '06', ad: 'Arya', kategori: 'Melamin' },
    { kod: '07', ad: 'Melisa', kategori: 'Melamin' },
    { kod: '08', ad: 'Koton Vizon', kategori: 'Melamin' },
    { kod: '09', ad: 'Dakron Gri', kategori: 'Melamin' },
    { kod: '11', ad: 'Gri', kategori: 'Melamin' },
    { kod: '13', ad: 'Siyah', kategori: 'Melamin' },
    { kod: '15', ad: 'Beyaz', kategori: 'Melamin' },
    { kod: '16', ad: 'Lotus', kategori: 'Melamin' },
    { kod: '19', ad: 'Teak', kategori: 'Melamin' },
    { kod: '22', ad: 'Milano Ceviz', kategori: 'Melamin' },
    { kod: '23', ad: 'Marbella Kiraz', kategori: 'Melamin' },
    { kod: '24', ad: 'Antrasit', kategori: 'Melamin' },
    { kod: '25', ad: 'Akasya', kategori: 'Melamin' },
    { kod: '26', ad: 'Barok', kategori: 'Melamin' },
    { kod: '27', ad: 'Trabzon Meşe', kategori: 'Melamin' },
    { kod: '28', ad: 'Sarı', kategori: 'Melamin' },
    { kod: '29', ad: 'Cappuccino', kategori: 'Melamin' },
    { kod: '32', ad: 'Everest', kategori: 'Melamin' },
    // ── Lake Boya ──
    { kod: '30', ad: 'Lake Beyaz', kategori: 'Lake Boya' },
    { kod: '33', ad: 'Lake Mavi', kategori: 'Lake Boya' },
    { kod: '34', ad: 'Lake Yeşil', kategori: 'Lake Boya' },
    { kod: '35', ad: 'Lake Antrasit', kategori: 'Lake Boya' },
    { kod: '36', ad: 'Lake Gri', kategori: 'Lake Boya' },
    { kod: '37', ad: 'Lake Krem', kategori: 'Lake Boya' },
    { kod: '38', ad: 'Lake Cappuccino', kategori: 'Lake Boya' },
    { kod: '39', ad: 'Lake Siyah', kategori: 'Lake Boya' },
    // ── Mermer (kaynak sayfada Cam/Pleksi de bu sütunda listelenmiş) ──
    { kod: '40', ad: 'Galaxy Brown', kategori: 'Mermer' },
    { kod: '41', ad: 'Cacara White', kategori: 'Mermer' },
    { kod: '43', ad: 'Şeffaf Cam', kategori: 'Mermer' },
    { kod: '44', ad: 'Kumlu Cam', kategori: 'Mermer' },
    { kod: '45', ad: 'Siyah Cam', kategori: 'Mermer' },
    { kod: '47', ad: 'Pleksi', kategori: 'Mermer' },
    // ── Dx Color ──
    { kod: '50', ad: 'Dx Color Beyaz', kategori: 'Dx Color' },
    { kod: '51', ad: 'Dx Color Antrasit', kategori: 'Dx Color' },
    { kod: '52', ad: 'Dx Color Siyah', kategori: 'Dx Color' },
    { kod: '53', ad: 'Dx Color Gri', kategori: 'Dx Color' },
    // ── Kaplama ──
    { kod: '68', ad: 'Kayın Masif', kategori: 'Kaplama' },
    { kod: '69', ad: 'Ceviz Kaplama', kategori: 'Kaplama' },
    { kod: '70', ad: 'Meşe Kaplama', kategori: 'Kaplama' },
    { kod: '71', ad: 'Ovenkol Kaplama', kategori: 'Kaplama' },
    { kod: '72', ad: 'Tütsülü Meşe Kaplama', kategori: 'Kaplama' },
    { kod: '73', ad: 'Dişbudak(Kaplama)', kategori: 'Kaplama' },
    { kod: '74', ad: 'Dişbudak(Masif)', kategori: 'Kaplama' },
    { kod: '75', ad: 'Eski Ceviz', kategori: 'Kaplama' },
    { kod: '76', ad: 'Policarbon', kategori: 'Kaplama' },
    // ── Metal ──
    { kod: '84', ad: 'Bronz', kategori: 'Metal' },
    { kod: '87', ad: 'Metal Yeşil(6000)', kategori: 'Metal' },
    { kod: '88', ad: 'Metal Mavi(5007)', kategori: 'Metal' },
    { kod: '89', ad: 'Metal Cappuccino(1019)', kategori: 'Metal' },
    { kod: '90', ad: 'Ağaç Desen', kategori: 'Metal' },
    { kod: '91', ad: 'Metal Sarı(1023)', kategori: 'Metal' },
    { kod: '92', ad: 'Metal Kırmızı(3020)', kategori: 'Metal' },
    { kod: '93', ad: 'Metal Turuncu(2012)', kategori: 'Metal' },
    { kod: '94', ad: 'Metal Yeşil(6018)', kategori: 'Metal' },
    { kod: '95', ad: 'Metal Siyah(9005)', kategori: 'Metal' },
    { kod: '96', ad: 'Metal Krom', kategori: 'Metal' },
    { kod: '97', ad: 'Metal Antrasit(7015)', kategori: 'Metal' },
    { kod: '98', ad: 'Metal Beyaz(9003)', kategori: 'Metal' },
    { kod: '99', ad: 'Metal Gri(9006)', kategori: 'Metal' },
    // ── Deri(Toskano) ──
    { kod: '60', ad: 'Siyah(01)', kategori: 'Deri(Toskano)' },
    { kod: '61', ad: 'Antrasit(2307)', kategori: 'Deri(Toskano)' },
    { kod: '62', ad: 'Cappuccino(2314)', kategori: 'Deri(Toskano)' },
    // ── Kumaş ──
    { kod: '77', ad: 'Turuncu Kumaş', kategori: 'Kumaş' },
    { kod: '78', ad: 'Yeşil Kumaş', kategori: 'Kumaş' },
    { kod: '79', ad: 'Mavi Kumaş', kategori: 'Kumaş' },
    { kod: '80', ad: 'Antrasit Kumaş', kategori: 'Kumaş' },
    { kod: '81', ad: 'Sarı Kumaş', kategori: 'Kumaş' },
    // ── Hawk Panel ──
    { kod: '82', ad: 'Yeşil Keçe', kategori: 'Hawk Panel' },
    { kod: '83', ad: 'Gri Keçe', kategori: 'Hawk Panel' }
  ];

  function bul(kod) {
    return liste.find(r => r.kod === String(kod || '').trim()) || null;
  }

  function adGetir(kod) {
    const r = bul(kod);
    return r ? r.ad : '';
  }

  // ── RENK TAKASI İÇİN ÖLÇÜ ETİKETLERİ ──────────────────────────────────────
  // Kullanıcı talebi: "18mm için bir satır 30mm için bir satır 8mm için bir
  // satır kullanalım... kenar bandında 0,40*22, 0,40*33, ... 2*54" — aynı
  // renk+kategoride (sunta/mdf/pvc kenar bandı) BİRDEN FAZLA ölçü varyantı
  // olabiliyor, her biri AYRI bir hammaddeye karşılık geliyor. Boya ve diğer
  // kategorilerde ölçü boyutu YOKTUR (boş liste = tek satır, ölçüsüz).
  const PVC_KALINLIKLAR = ['0,40', '0,80', '1', '2'];
  const PVC_GENISLIKLER = ['22', '33', '54'];
  const olcuEtiketleri = {
    sunta: ['8mm', '18mm', '30mm'],
    mdf: ['8mm', '18mm', '30mm'],
    pvc_bant: PVC_KALINLIKLAR.flatMap(k => PVC_GENISLIKLER.map(g => k + 'x' + g)),
    boya: [],
    diger: []
  };

  return { liste, bul, adGetir, olcuEtiketleri };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RenkKartelasi;
