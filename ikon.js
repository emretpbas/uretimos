// ════════════════════════════════════════════════════════════════════════════
// ÜretimOS — İKON SİSTEMİ
//
// Emoji ve genel amaçlı Unicode simgelerin yerine geçen, projeye özel çizilmiş
// ikon kütüphanesi. Tasarım kuralları (tamamı bilinçli ve tutarlıdır):
//
//   • Izgara      : 24 × 24
//   • Çizgi       : 1.6 birim, yuvarlatılmış uç ve köşe (round cap/join)
//   • Optik alan  : 2 birim kenar boşluğu — ikonlar 20×20 alanda yaşar
//   • Renk        : currentColor — bulunduğu metnin rengini alır
//   • Dil         : geometrik, dolgu yok; üretim nesneleri (plaka, kart, hat,
//                   koli, çek) sadeleştirilmiş siluetlerle temsil edilir
//
// Her modülün KENDİNE AİT bir metaforu vardır; iki modül aynı ikonu kullanmaz.
// Kullanım:  Ikon.ciz('hammadde')  ·  Ikon.ciz('kaydet', 16)
// ════════════════════════════════════════════════════════════════════════════
const Ikon = (() => {

  // Yol verileri — her ikon bir veya birkaç SVG öğesinden oluşur.
  const YOLLAR = {

    // ── GENEL / PANEL ───────────────────────────────────────────────────
    dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5"/><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/>',

    // ── TANIMLAR (ARGE / Teknik Ofis) ───────────────────────────────────
    // Hammadde: üst üste istiflenmiş plakalar
    hammadde: '<path d="M3 7.5 12 4l9 3.5-9 3.5z"/><path d="M3 12l9 3.5L21 12"/><path d="M3 16.5 12 20l9-3.5"/>',
    // Yarı mamül: yarısı işlenmiş blok
    yarimamul: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/><path d="M6 9.5h3M6 14.5h3"/>',
    // Ürün kartı & reçete: kart + alt kırılım ağacı
    kartlar: '<rect x="3" y="3" width="18" height="7" rx="2"/><path d="M7.5 10v4.5a1.5 1.5 0 0 0 1.5 1.5h1.5M16.5 10v4.5a1.5 1.5 0 0 1-1.5 1.5h-1.5"/><rect x="4" y="16" width="5" height="5" rx="1.2"/><rect x="15" y="16" width="5" height="5" rx="1.2"/>',
    // Hat & rota: birbirine bağlı istasyon düğümleri
    rota: '<circle cx="5" cy="12" r="2.3"/><circle cx="19" cy="12" r="2.3"/><circle cx="12" cy="5.5" r="2.3"/><path d="M7.3 12h9.4M10.4 7.3 6.6 10.3M13.6 7.3l3.8 3"/>',
    // QR etiket merkezi
    qr_etiket: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><path d="M14 14h3v3M20 14v.01M17 20v.01M20 17.5v3.5"/>',

    // ── SATINALMA ───────────────────────────────────────────────────────
    // Satınalma paneli: sepet
    satinalma_panel: '<path d="M3 4h2.2l2.3 11.2a1.8 1.8 0 0 0 1.8 1.4h8.4a1.8 1.8 0 0 0 1.8-1.4L21 8H6"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>',
    // Açık satınalma siparişleri: sepet + saat (bekleyen)
    acik_satinalma_siparisleri: '<path d="M3 4h2.2l2.3 11.2a1.8 1.8 0 0 0 1.8 1.4h5"/><path d="M6 8h9"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="14.5" r="4.5"/><path d="M17.5 12.5v2.2l1.5 1"/>',
    // Tedarikçi teklif karşılaştırma: iki sütun kıyas
    tedarikci_teklif: '<path d="M12 3v18"/><rect x="3" y="7" width="6" height="10" rx="1.4"/><rect x="15" y="4.5" width="6" height="15" rx="1.4"/><path d="M4.5 20.5h3M16.5 20.5h3"/>',

    // ── ÜRETİM ──────────────────────────────────────────────────────────
    // İş emri: panolu form
    isemri: '<path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="8.5" y="2.5" width="7" height="3.5" rx="1.2"/><path d="M8 11h8M8 15h5"/>',
    // Kesim optimizasyonu: plaka üzerine yerleşmiş parçalar
    nesting: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="5.5" y="6.5" width="7" height="5"/><rect x="14" y="6.5" width="4.5" height="9"/><rect x="5.5" y="14" width="4.5" height="3.5"/>',
    // Üretim planlama: pano üzerinde plan kartları
    uretim_panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8.5h18"/><rect x="5.5" y="11" width="4.5" height="6.5" rx="1"/><rect x="12" y="11" width="6.5" height="3" rx="1"/>',
    // Üretim ekranı: makine + kontrol
    uretim_ekrani: '<rect x="2.5" y="6" width="12" height="9" rx="1.8"/><path d="M6 19h5M8.5 15v4"/><circle cx="18.5" cy="17" r="3.2"/><path d="M18.5 13.2v1.1M18.5 19.7v1.1M22.3 17h-1.1M15.8 17h-1.1"/>',
    // Hat & istasyon takibi: konveyör üstünde istasyonlar
    hat_takip: '<path d="M3 16h18"/><circle cx="6" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/><rect x="4" y="5" width="5" height="7" rx="1.2"/><rect x="15" y="8" width="5" height="4" rx="1.2"/>',
    // Üretim çizelgesi: gantt çubukları
    cizelge: '<path d="M3 4v16.5"/><rect x="6" y="5" width="11" height="3.2" rx="1.4"/><rect x="9" y="10.4" width="12" height="3.2" rx="1.4"/><rect x="6" y="15.8" width="8" height="3.2" rx="1.4"/>',
    // MRP: malzeme kutuları + ihtiyaç oku
    mrp: '<rect x="3" y="10" width="7" height="7" rx="1.4"/><rect x="3" y="3.5" width="7" height="4.5" rx="1.4"/><path d="M13.5 7h7M13.5 12h7M13.5 17h4"/><path d="M18.5 15l2.5 2-2.5 2"/>',
    // Hat operatör terminali: telefon
    hat_terminal: '<rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M10.5 5.5h3"/><circle cx="12" cy="18" r="1.1"/>',
    // Yükleme onayı: kamyon + onay
    yukleme_onay: '<path d="M2.5 7.5A1.5 1.5 0 0 1 4 6h8.5v9.5H2.5z"/><path d="M12.5 10H17l3 3.5v2H12.5z"/><circle cx="6.5" cy="18" r="1.7"/><circle cx="16.5" cy="18" r="1.7"/><path d="M4.5 11.5l1.6 1.6 3-3.2"/>',

    // ── DEPO ────────────────────────────────────────────────────────────
    // Depo: raf sistemi
    depo_panel: '<path d="M3 3v18M21 3v18"/><path d="M3 9h18M3 15h18"/><rect x="6" y="4.5" width="4" height="4"/><rect x="13" y="10.5" width="5" height="4"/><rect x="6" y="16.5" width="4" height="4"/>',
    // İade ambarı: kutu + geri dönüş oku
    iade_ambari: '<path d="M3.5 8.5 12 4.5l8.5 4v7L12 19.5l-8.5-4z"/><path d="M12 12.2 3.5 8.5M12 12.2l8.5-3.7M12 12.2v7.3"/><path d="M9.5 3 7 5l2.5 2"/>',

    // ── FİYATLAMA & SATIŞ ───────────────────────────────────────────────
    // Maliyet & liste fiyatı: fiyat etiketi
    fiyat: '<path d="M11.5 3H5a2 2 0 0 0-2 2v6.5a2 2 0 0 0 .6 1.4l7.5 7.5a2 2 0 0 0 2.8 0l6.5-6.5a2 2 0 0 0 0-2.8l-7.5-7.5A2 2 0 0 0 11.5 3z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    // Teklif: belge + para
    teklif: '<path d="M5 3.5h9l5 5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 20.5v-16A1.5 1.5 0 0 1 5.5 3z"/><path d="M14 3.5V9h5"/><path d="M12.5 12.5h-2a1.5 1.5 0 0 0 0 3h1.5a1.5 1.5 0 0 1 0 3h-2M11.5 11v1.5M11.5 18.5V20"/>',
    // Siparişler: sıralı liste + onay
    siparis: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',

    // ── CARİ & SEVKİYAT ─────────────────────────────────────────────────
    // Cari kartları: kişi kartı
    cari_panel: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 16.2c.5-1.6 1.9-2.5 3.5-2.5s3 .9 3.5 2.5"/><path d="M15 10h4M15 13.5h4"/>',
    // Sevkiyat & irsaliye: kamyon
    sevkiyat_panel: '<path d="M2.5 7A1.5 1.5 0 0 1 4 5.5h9V16H2.5z"/><path d="M13 9.5h4.2l3.3 3.8V16H13z"/><circle cx="6.5" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>',
    // e-Fatura: belge + bulut gönderim
    efatura: '<path d="M5 3.5h8l4.5 4.5v5"/><path d="M13 3.5V8h4.5"/><path d="M5 3.5A1.5 1.5 0 0 0 3.5 5v14A1.5 1.5 0 0 0 5 20.5h5"/><path d="M7 9h4M7 12.5h5"/><path d="M15 20.5h4.2a2.3 2.3 0 0 0 .3-4.6 3.2 3.2 0 0 0-6.2-.8 2.3 2.3 0 0 0 .2 5.4z"/>',

    // ── BAKIM ───────────────────────────────────────────────────────────
    bakim_panel: '<path d="M14.5 6.2a4 4 0 0 0 5.3 5.3l-8 8a2.5 2.5 0 0 1-3.6-3.6z"/><path d="M6.5 3.5 9 6l-1.5 1.5L5 5z"/><path d="M5 5 3.5 6.5 6 9l1.5-1.5"/>',

    // ── KALİTE ──────────────────────────────────────────────────────────
    // Kalite kontrol: rozet + onay
    kalite_panel: '<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z"/><path d="M8.8 11.8 11.2 14l4-4.4"/>',
    // Uygunsuzluk & DÖF: uyarı + belge
    uygunsuzluk_dof: '<path d="M10.3 3.8 2.6 17.2a1.7 1.7 0 0 0 1.5 2.6h15.8a1.7 1.7 0 0 0 1.5-2.6L13.7 3.8a1.7 1.7 0 0 0-3 0z"/><path d="M12 9v4.2M12 16.8v.01"/>',
    // Satış sonrası servis: kalkan + anahtar
    servis: '<path d="M12 3 5 5.8v5c0 4 2.8 7.6 7 8.9 1.5-.5 2.8-1.3 3.9-2.3"/><circle cx="17.5" cy="14" r="2.6"/><path d="M19.4 15.9 22 18.5"/>',

    // ── İNSAN KAYNAKLARI ────────────────────────────────────────────────
    ik_personel: '<circle cx="12" cy="8" r="3.7"/><path d="M4.5 20.5c0-3.7 3.4-6 7.5-6s7.5 2.3 7.5 6"/>',
    ik_izin: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9.5 15.5 11 17l3.5-3.5"/>',
    ik_tazminat: '<path d="M12 4v16"/><path d="M5 8h14"/><path d="M8.5 8 5.5 14.5h6zM18.5 8l-3 6.5h6z"/><path d="M9 20.5h6"/>',
    ik_bordro: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 7h8M8 11h8"/><path d="M12.8 15h-1.6a1.3 1.3 0 0 0 0 2.6h1.2a1.3 1.3 0 0 1 0 2.6h-1.6"/>',
    ik_arac: '<path d="M4 15.5V12l1.8-4.2A2 2 0 0 1 7.6 6.5h8.8a2 2 0 0 1 1.8 1.3L20 12v3.5"/><path d="M3.5 12h17"/><circle cx="7.5" cy="16" r="1.8"/><circle cx="16.5" cy="16" r="1.8"/><path d="M4 17.8v1.7M20 17.8v1.7"/>',
    // İSG: baret
    isg: '<path d="M3.5 16.5a8.5 8.5 0 0 1 17 0z"/><path d="M9 8.2V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2.7"/><path d="M2.5 16.5h19"/>',

    // ── YÖNETİM ─────────────────────────────────────────────────────────
    // Onay bekleyenler: gelen kutusu + onay
    onaylar: '<path d="M3.5 13h4l1.5 3h6l1.5-3h4"/><path d="M3.5 13 6 5.5A1.6 1.6 0 0 1 7.5 4.5h9A1.6 1.6 0 0 1 18 5.5L20.5 13v5a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 18z"/>',
    // Yönetim raporlama: rapor + grafik
    yonetim_raporlama: '<path d="M5.5 3.5h8l5 5v12a1.5 1.5 0 0 1-1.5 1.5h-11.5A1.5 1.5 0 0 1 4 20.5v-15.5A1.5 1.5 0 0 1 5.5 3.5z"/><path d="M13.5 3.5V9h5"/><path d="M8 17.5v-3M11.5 17.5v-5.5M15 17.5v-2"/>',
    // Üst yönetim kokpiti: gösterge (hız) saati
    ust_yonetim_kokpit: '<path d="M3.5 17.5a9 9 0 1 1 17 0"/><path d="M12 17.5l4-5.5"/><circle cx="12" cy="17.5" r="1.4"/><path d="M5.6 11.2l1.2 .7M18.4 11.2l-1.2 .7M12 6.5v1.4"/>',
    // KPI paneli: gösterge + sıçrama
    kpi_panel: '<rect x="3" y="3.5" width="18" height="17" rx="2"/><path d="M7 15.5l3-3.2 2.4 2.2 4.6-5"/><circle cx="17" cy="9.5" r="1.2"/>',
    // Analitik: trend çizgisi
    analitik: '<path d="M3.5 20.5V3.5"/><path d="M3.5 20.5h17"/><path d="M7 16.5l3.8-4.6 3 2.6 4.7-6"/><path d="M15.5 8.5h3v3"/>',
    // Operasyon: saat + akış
    operasyon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',

    // ── MUHASEBE ────────────────────────────────────────────────────────
    // Muhasebe: hesap makinesi / defter
    muhasebe_panel: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><rect x="7.5" y="6" width="9" height="3.5" rx="1"/><path d="M8 13v.01M12 13v.01M16 13v.01M8 17v.01M12 17v.01M16 17v.01"/>',
    // Çek & senet: çek yaprağı
    cek_portfoy: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14h5M15 14h3"/>',

    // ══ ARAYÜZ / EYLEM İKONLARI ══════════════════════════════════════════
    ara: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.2 15.2 20.5 20.5"/>',
    suz: '<path d="M3.5 5.5h17l-6.5 7.7v5.6l-4 2v-7.6z"/>',
    ekle: '<path d="M12 5v14M5 12h14"/>',
    duzenle: '<path d="M15.5 4.5 19.5 8.5 8 20H4v-4z"/><path d="M13.5 6.5 17.5 10.5"/>',
    sil: '<path d="M4 6.5h16"/><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/><path d="M6 6.5 6.9 19.4a1.6 1.6 0 0 0 1.6 1.5h7a1.6 1.6 0 0 0 1.6-1.5L18 6.5"/><path d="M10 10.5v6M14 10.5v6"/>',
    kaydet: '<path d="M5 3.5h11l4 4v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-15.5A1.5 1.5 0 0 1 5.5 3.5z"/><path d="M7.5 3.5v5.5h8V3.5"/><rect x="7.5" y="13" width="9" height="7.5" rx="1"/>',
    kapat: '<path d="M6 6l12 12M18 6 6 18"/>',
    onay: '<path d="M5 12.5 9.5 17 19 6.5"/>',
    onay_daire: '<circle cx="12" cy="12" r="8.8"/><path d="M8.2 12.2 11 15l5-5.6"/>',
    red: '<circle cx="12" cy="12" r="8.8"/><path d="M9 9l6 6M15 9l-6 6"/>',
    uyari: '<path d="M12 3.5 21.2 19.5H2.8z"/><path d="M12 9.5v4.2M12 17v.01"/>',
    bilgi: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11v5.5M12 7.8v.01"/>',
    yazdir: '<path d="M6.5 9V3.5h11V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="1.8"/><rect x="6.5" y="14" width="11" height="6.5" rx="1"/><path d="M17.5 12h.01"/>',
    indir: '<path d="M12 3.5v11.5"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4 18.5v1a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1"/>',
    yukle: '<path d="M12 15.5V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4 18.5v1a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1"/>',
    geri: '<path d="M20 12H4.5"/><path d="M10 5.5 3.5 12l6.5 6.5"/>',
    ileri: '<path d="M4 12h15.5"/><path d="M14 5.5 20.5 12 14 18.5"/>',
    yukari: '<path d="M12 19.5V4.5"/><path d="M5.5 11 12 4.5l6.5 6.5"/>',
    asagi: '<path d="M12 4.5v15"/><path d="M5.5 13 12 19.5 18.5 13"/>',
    yenile: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 4v5h-5"/>',
    dosya: '<path d="M13.5 3.5h-8A1.5 1.5 0 0 0 4 5v14a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V10z"/><path d="M13.5 3.5V10H20"/>',
    klasor: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2l2 2.5h7.3A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/>',
    resim: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l4.6-4.4 3.4 3 3-2.6 5 4.6"/>',
    kamera: '<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.8l1.4-2h5.6l1.4 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="12.5" r="3.4"/>',
    qr_okut: '<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><path d="M4 12h16"/>',
    ayarlar: '<circle cx="12" cy="12" r="3.2"/><path d="M19.2 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1z"/>',
    bildirim: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z"/><path d="M13.7 19.5a2 2 0 0 1-3.4 0"/>',
    kullanici: '<circle cx="12" cy="8" r="3.7"/><path d="M4.5 20.5c0-3.7 3.4-6 7.5-6s7.5 2.3 7.5 6"/>',
    cikis: '<path d="M9.5 20.5H5.5A1.5 1.5 0 0 1 4 19V5a1.5 1.5 0 0 1 1.5-1.5h4"/><path d="M15.5 16.5 20 12l-4.5-4.5"/><path d="M20 12H9"/>',
    kilit: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><path d="M12 15v2"/>',
    anahtar: '<circle cx="7.5" cy="15.5" r="4"/><path d="M10.4 12.6 20 3.5"/><path d="M17 6.5l2.5 2.5M14.5 9l2 2"/>',
    dunya: '<circle cx="12" cy="12" r="8.8"/><path d="M3.3 12h17.4"/><path d="M12 3.2a13 13 0 0 1 0 17.6 13 13 0 0 1 0-17.6z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    takvim: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.8h17M8 3v4M16 3v4"/>',
    saat: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',
    oynat: '<path d="M7 4.8 19.5 12 7 19.2z"/>',
    kitap: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11a3 3 0 0 1 3 3v14a2.5 2.5 0 0 0-2.5-2.5H5.5A1.5 1.5 0 0 1 4 17z"/><path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H14v17a2.5 2.5 0 0 1 2.5-2.5h2A1.5 1.5 0 0 0 20 16z"/>',
    fabrika: '<path d="M3 20.5V9.5l6 4V9.5l6 4V6.5l6-3v17z"/><path d="M8 16.5v2M13 16.5v2M18 16.5v2"/>'
  };

  // Menü kimliği → ikon adı eşlemesi (bire bir; hiçbir modül aynı ikonu paylaşmaz)
  const MENU = {
    dashboard: 'dashboard', hammadde: 'hammadde', yarimamul: 'yarimamul',
    kartlar: 'kartlar', rota: 'rota', qr_etiket: 'qr_etiket',
    satinalma_panel: 'satinalma_panel', acik_satinalma_siparisleri: 'acik_satinalma_siparisleri',
    tedarikci_teklif: 'tedarikci_teklif', isemri: 'isemri', nesting: 'nesting',
    uretim_panel: 'uretim_panel', uretim_ekrani: 'uretim_ekrani', hat_takip: 'hat_takip',
    cizelge: 'cizelge', mrp: 'mrp', hat_terminal: 'hat_terminal', yukleme_onay: 'yukleme_onay',
    depo_panel: 'depo_panel', fiyat: 'fiyat', teklif: 'teklif', siparis: 'siparis',
    cari_panel: 'cari_panel', sevkiyat_panel: 'sevkiyat_panel', servis: 'servis',
    bakim_panel: 'bakim_panel', kalite_panel: 'kalite_panel', uygunsuzluk_dof: 'uygunsuzluk_dof',
    iade_ambari: 'iade_ambari', ik_personel: 'ik_personel', ik_izin: 'ik_izin',
    ik_tazminat: 'ik_tazminat', ik_bordro: 'ik_bordro', ik_arac: 'ik_arac', isg: 'isg',
    onaylar: 'onaylar', yonetim_raporlama: 'yonetim_raporlama',
    ust_yonetim_kokpit: 'ust_yonetim_kokpit', kpi_panel: 'kpi_panel', analitik: 'analitik',
    operasyon: 'operasyon', muhasebe_panel: 'muhasebe_panel', cek_portfoy: 'cek_portfoy',
    efatura: 'efatura'
  };

  // İkonu SVG olarak döndürür. boyut: piksel (varsayılan 18)
  function ciz(ad, boyut) {
    const yol = YOLLAR[ad];
    if (!yol) return '';
    const b = boyut || 18;
    return `<svg class="ikon" width="${b}" height="${b}" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true" focusable="false">${yol}</svg>`;
  }

  // Menü kimliğinden ikon (eşleme yoksa boş döner — düzen bozulmaz)
  function menu(sayfaId, boyut) {
    return ciz(MENU[sayfaId] || '', boyut);
  }

  function varMi(ad) { return !!YOLLAR[ad]; }
  function adlar() { return Object.keys(YOLLAR); }

  return { ciz, menu, varMi, adlar, MENU };
})();
