// ════════════════════════════════════════════════════════════════════════════
// ÜRETİMOS — APP ÇEKİRDEĞİ
// ════════════════════════════════════════════════════════════════════════════

const App = (() => {

  // ── ROLLER ───────────────────────────────────────────────────────────────
  // Her rol, sidebar'da hangi sayfa gruplarının görüneceğini belirler.
  // 'admin' tüm sayfaları görür (yönetim / genel kullanım için).
  const ROLLER = [
    { id: 'admin', label: 'Tümü (Yönetici Görünümü)', icon: '◆' },
    { id: 'satinalma', label: 'Satınalma', icon: '▤' },
    { id: 'uretim_planlama', label: 'Üretim Planlama', icon: '▦' },
    { id: 'depo', label: 'Depo', icon: '▭' },
    { id: 'arge', label: 'ARGE', icon: '◫' },
    { id: 'teknik_ofis', label: 'Teknik Ofis', icon: '◫' },
    { id: 'teklif_siparis', label: 'Teklif & Sipariş', icon: '▥' },
    { id: 'satis', label: 'Satış ve Siparişler', icon: '▥' },
    { id: 'cari', label: 'Cari İşlemler', icon: '◧' },
    { id: 'sevkiyat', label: 'Sevkiyat', icon: '→' },
    { id: 'bakim', label: 'Bakım', icon: '⚙' },
    { id: 'kalite', label: 'Kalite Kontrol', icon: '✓' },
    { id: 'uretim', label: 'Üretim (Saha Sorumlusu)', icon: '⚒' },
    { id: 'isg', label: 'İSG (İş Sağlığı ve Güvenliği)', icon: '🦺' },
    { id: 'pazarlama', label: 'Pazarlama', icon: '📣' },
    { id: 'ik', label: 'İnsan Kaynakları', icon: '◍' },
    { id: 'muhasebe', label: 'Muhasebe', icon: '₺' },
    { id: 'yonetim', label: 'Üst Yönetim (Fiyat & Onaylar)', icon: '✓' }
  ];

  // İK modülünde "hangi bölümde kaç personel" için departman listesi — mevcut
  // roller ile birebir eşleşir, ayrıca rol sistemine dahil olmayan "İdari/Genel
  // Yönetim" bölümü de eklenmiştir (yönetim/muhasebe gibi rolsüz personel için).
  const BOLUMLER = [
    { id: 'satinalma', label: 'Satınalma' },
    { id: 'uretim_planlama', label: 'Üretim Planlama' },
    { id: 'depo', label: 'Depo' },
    { id: 'arge', label: 'ARGE' },
    { id: 'teknik_ofis', label: 'Teknik Ofis' },
    { id: 'teklif_siparis', label: 'Teklif & Sipariş' },
    { id: 'cari', label: 'Cari İşlemler' },
    { id: 'sevkiyat', label: 'Sevkiyat' },
    { id: 'bakim', label: 'Bakım' },
    { id: 'kalite', label: 'Kalite Kontrol' },
    { id: 'uretim', label: 'Üretim (Saha Sorumlusu)' },
    { id: 'isg', label: 'İSG (İş Sağlığı ve Güvenliği)' },
    { id: 'pazarlama', label: 'Pazarlama' },
    { id: 'ik', label: 'İnsan Kaynakları' },
    { id: 'muhasebe', label: 'Muhasebe' },
    { id: 'yonetim', label: 'Üst Yönetim' },
    { id: 'idari', label: 'İdari / Genel Yönetim' }
  ];

  // ── 3 AMBAR YAPISI ───────────────────────────────────────────────────────
  // Stok artık tek bir havuz değil, üç ayrı ambarda tutulur:
  //   hammadde_deposu : Satınalma ile gelen TÜM hammadde/hırdavat ilk burada birikir
  //   uretim_ambari   : Üretime sevk edilen hammadde/yarımamül burada takip edilir
  //   sevkiyat_deposu : Üretimi tamamlanmış bitmiş ürünler burada tutulur, sevkiyat buradan yapılır
  //   iade_ambari     : Kalite reddi/iade edilen ürün ve malzemeler burada karantinada tutulur;
  //                     yönetim fiyatlandırıp 2. kalite/defolu/seri-sonu olarak satışa sunabilir
  const AMBARLAR = [
    { id: 'hammadde_deposu', label: 'Hammadde ve Hırdavat Deposu' },
    { id: 'uretim_ambari', label: 'Üretim Ambarı' },
    { id: 'sevkiyat_deposu', label: 'Sevkiyat Deposu' },
    { id: 'iade_ambari', label: 'İade / 2. Kalite Ambarı' }
  ];

  function stokKaydiId(ambar, tip, refId) { return 'STK-' + ambar + '-' + tip + '-' + refId; }

  // Belirli bir ambar+tip+ref için stok miktarını bulur (yoksa 0)
  function stokMiktarAmbar(stokRaf, ambar, tip, refId) {
    const s = stokRaf.find(x => x.ambar === ambar && x.tip === tip && x.refId === refId);
    return s ? s.miktar : 0;
  }

  // Bir ambardaki bir kalemin miktarını verilen farkla günceller (negatifse düşer,
  // pozitifse ekler), kayıt yoksa oluşturur. stokRaf dizisini doğrudan mutate eder
  // ve günceller — çağıran taraf bu diziyi Store.stokRaf.save() ile kalıcı yazmalı.
  function stokMiktarGuncelle(stokRaf, ambar, tip, refId, refKod, refAd, birim, fark) {
    let s = stokRaf.find(x => x.ambar === ambar && x.tip === tip && x.refId === refId);
    if (!s) {
      s = { id: stokKaydiId(ambar, tip, refId), ambar, tip, refId, refKod: refKod || '', refAd: refAd || '', miktar: 0, birim: birim || 'ADET' };
      stokRaf.push(s);
    }
    s.miktar = (s.miktar || 0) + fark;
    return s;
  }

  // İki ambar arasında transfer yapar (kaynaktan düşer, hedefe ekler). Kaynakta
  // yetersiz miktar varsa yine de işlemi yapar ama eksi bakiyeyi engellemez —
  // çağıran taraf yetersizlik durumunu kontrol edip kullanıcıyı uyarmalıdır.
  function stokTransferEt(stokRaf, kaynakAmbar, hedefAmbar, tip, refId, refKod, refAd, birim, miktar) {
    stokMiktarGuncelle(stokRaf, kaynakAmbar, tip, refId, refKod, refAd, birim, -miktar);
    stokMiktarGuncelle(stokRaf, hedefAmbar, tip, refId, refKod, refAd, birim, miktar);
  }

  // Her sayfanın hangi rollerin menüsünde görüneceği (admin hepsini görür)
  const PAGES = [
    { group: 'GENEL', roller: ['admin','satinalma','uretim_planlama','depo','arge','teknik_ofis','teklif_siparis','cari','sevkiyat','yonetim'], items: [
      { id: 'dashboard', label: 'Panel', icon: '◧', roller: ['admin','satinalma','uretim_planlama','depo','arge','teknik_ofis','teklif_siparis','cari','sevkiyat','yonetim','uretim','isg'] }
    ]},
    { group: 'TANIMLAR (ARGE/Teknik Ofis)', items: [
      { id: 'hammadde', label: 'Hammaddeler', icon: '▭', roller: ['admin','arge','teknik_ofis','satinalma','uretim_planlama','depo','yonetim'] },
      { id: 'hammadde_piyasa', label: 'Hammadde Fiyat Anomalileri', icon: '📈', roller: ['admin','arge','satinalma','yonetim'] },
      { id: 'yarimamul', label: 'Yarı Mamüller', icon: '◫', roller: ['admin','arge','teknik_ofis','uretim_planlama','yonetim','uretim'] },
      { id: 'kartlar', label: 'Ürün Kartları & Reçete', icon: '▥', roller: ['admin','arge','teknik_ofis','yonetim','uretim'] },
      { id: 'step_ice_aktar', label: 'STEP\'ten Ürün Ağacı (CAD)', icon: '📐', roller: ['admin','arge','teknik_ofis','yonetim'] },
      { id: 'montaj_semasi', label: 'Montaj Şemasından Reçete (AI)', icon: '🤖', roller: ['admin','arge','teknik_ofis','yonetim'] },
      { id: 'is_emri_formu', label: 'İş Emri Formu (Teknik Resimden)', icon: '📋', roller: ['admin','yonetim','uretim_planlama','arge','teknik_ofis','uretim'] },
      { id: 'tiger_aktarim', label: 'Logo Tiger Aktarımı', icon: '🔄', roller: ['admin','arge','teknik_ofis','satinalma','yonetim'] },
      { id: 'ag_entegrasyon', label: 'ERP Entegrasyon Merkezi', icon: '🔗', roller: ['admin','yonetim','teklif_siparis','satis','cari','uretim_planlama'] },
      { id: 'rota', label: 'Hat & Rota', icon: '→', roller: ['admin','arge','teknik_ofis','yonetim'] },
      { id: 'qr_etiket', label: 'QR Etiket Merkezi', icon: '🔲', roller: ['admin','arge','teknik_ofis','yonetim','depo','uretim_planlama','sevkiyat'] }
    ]},
    { group: 'SATINALMA', items: [
      { id: 'satinalma_panel', label: 'Satınalma Paneli', icon: '▤', roller: ['admin','satinalma','arge','yonetim'] },
      { id: 'acik_satinalma_siparisleri', label: 'Açık Satınalma Siparişleri', icon: '▤', roller: ['admin','satinalma','arge','yonetim'] },
      { id: 'tedarikci_teklif', label: 'Teklif Paneli (Tedarikçi Karşılaştırma)', icon: '⇄', roller: ['admin','satinalma','arge','yonetim'] }
    ]},
    { group: 'ÜRETİM', items: [
      { id: 'isemri', label: 'İş Emirleri', icon: '▤', roller: ['admin','uretim_planlama','arge','yonetim','uretim'] },
      { id: 'nesting', label: 'Kesim Optimizasyonu', icon: '▦', roller: ['admin','uretim_planlama','arge','teknik_ofis','yonetim','uretim'] },
      { id: 'uretim_panel', label: 'Üretim Planlama Paneli', icon: '▦', roller: ['admin','uretim_planlama','arge','yonetim','uretim'] },
      { id: 'uretim_ekrani', label: 'Üretim Ekranı (İstasyon & Duruş)', icon: '⚙', roller: ['admin','uretim_planlama','arge','yonetim','uretim'] },
      { id: 'hat_takip', label: 'Hat & İstasyon Takibi', icon: '🏭', roller: ['admin','uretim_planlama','arge','yonetim','kalite','uretim'] },
      { id: 'cizelge', label: 'Üretim Çizelgesi (Kapasite Planlama)', icon: '📅', roller: ['admin','uretim_planlama','arge','yonetim','teklif_siparis','uretim'] },
      { id: 'mrp', label: 'MRP — Malzeme İhtiyaç Planlaması', icon: '🧾', roller: ['admin','uretim_planlama','satinalma','arge','yonetim','depo'] },
      { id: 'recete_onay', label: 'Reçete Talep Onayları (Hattan)', icon: '🔗', roller: ['admin','uretim_planlama','arge','teknik_ofis','yonetim'] },
      { id: 'malzeme_talep', label: 'Malzeme Talep & Kayıp Kontrolü', icon: '📦', roller: ['admin','uretim_planlama','depo','satinalma','arge','teknik_ofis','yonetim','muhasebe'] },
      { id: 'iptal_islemleri', label: 'İş Emri / Sipariş İptal', icon: '✕', roller: ['admin','uretim_planlama','yonetim'] },
      { id: 'faaliyet_defteri', label: 'Faaliyet Defteri & Arşiv', icon: '📚', roller: ['admin','yonetim'] },
      { id: 'hat_terminal', label: 'Hat Operatör Terminali (Telefon)', icon: '📱' },
      { id: 'yukleme_onay', label: 'Sevkiyat Yükleme Onayı (Telefon)', icon: '🚚' }
    ]},
    { group: 'DEPO', items: [
      { id: 'depo_panel', label: 'Depo Stok & Düşüm', icon: '▭', roller: ['admin','depo','arge','yonetim'] }
    ]},
    { group: 'FİYATLAMA & SATIŞ', items: [
      { id: 'fiyat', label: 'Maliyet & Liste Fiyatı', icon: '₺', roller: ['admin','yonetim','arge'] },
      { id: 'teklif', label: 'Satış ve Siparişler', icon: '▥', roller: ['admin','teklif_siparis','satis','arge','yonetim'] },
      { id: 'crm', label: 'CRM — Satış Fırsatları', icon: '🎯', roller: ['admin','yonetim','satis','teklif_siparis','cari','pazarlama'] },
      { id: 'proje', label: 'Proje Yönetimi', icon: '🏗', roller: ['admin','yonetim','satis','teklif_siparis','uretim_planlama','cari','pazarlama','muhasebe'] },
      { id: 'proje_teklif', label: 'Proje Teklifi (Mahal Bazlı)', icon: '📋', roller: ['admin','yonetim','satis','teklif_siparis','uretim_planlama','pazarlama','muhasebe'] },
      { id: 'teklif_degerlendirme', label: 'Teklif Değerlendirme', icon: '📊', roller: ['admin','yonetim','satis','teklif_siparis','cari','pazarlama','muhasebe'] },
      { id: 'pazarlama', label: 'Pazarlama (Kampanya/Numune)', icon: '📣', roller: ['admin','yonetim','pazarlama','satis','teklif_siparis','cari'] },
      { id: 'siparis', label: 'Siparişler', icon: '▤', roller: ['admin','teklif_siparis','satis','cari','arge','yonetim'] }
    ]},
    { group: 'CARİ & SEVKİYAT', items: [
      { id: 'cari_panel', label: 'Müşteri Cari Kartları', icon: '◧', roller: ['admin','cari','arge','yonetim'] },
      { id: 'sevkiyat_panel', label: 'Sevkiyat & İrsaliye', icon: '→', roller: ['admin','sevkiyat','arge','yonetim'] },
      { id: 'servis', label: 'Satış Sonrası Servis & Garanti', icon: '🛡', roller: ['admin','yonetim','sevkiyat','cari','kalite','teklif_siparis'] }
    ]},
    { group: 'BAKIM', items: [
      { id: 'bakim_panel', label: 'Makina & Teçhizat Bakım', icon: '⚙', roller: ['admin','bakim','arge','yonetim','isg'] }
    ]},
    { group: 'KALİTE', items: [
      { id: 'kalite_panel', label: 'Kalite Kontrol', icon: '✓', roller: ['admin','kalite','arge','yonetim','uretim'] },
      { id: 'uygunsuzluk_dof', label: 'Uygunsuzluk & DÖF', icon: '⚠', roller: ['admin','kalite','arge','yonetim','uretim_planlama','satinalma'] },
      { id: 'iade_ambari', label: 'İade / 2. Kalite Ambarı', icon: '↩', roller: ['admin','kalite','arge','yonetim','depo','satinalma'] }
    ]},
    { group: 'İNSAN KAYNAKLARI', items: [
      { id: 'ik_personel', label: 'Personel & Özlük', icon: '◍', roller: ['admin','ik','arge','yonetim'] },
      { id: 'ik_izin', label: 'İzin Takibi', icon: '◍', roller: ['admin','ik','arge','yonetim'] },
      { id: 'ik_tazminat', label: 'Kıdem & İhbar Tazminatı', icon: '◍', roller: ['admin','ik','arge','yonetim'] },
      { id: 'ik_bordro', label: 'Bordro & Ücret', icon: '◍', roller: ['admin','ik','arge','yonetim'] },
      { id: 'ik_arac', label: 'Araç & Zimmet', icon: '◍', roller: ['admin','ik','arge','yonetim'] },
      { id: 'isg', label: 'İş Sağlığı ve Güvenliği (İSG)', icon: '🦺', roller: ['admin','yonetim','ik','bakim','uretim_planlama','arge','isg'] }
    ]},
    { group: 'YÖNETİM', items: [
      { id: 'onaylar', label: 'Onay Bekleyenler', icon: '✓', roller: ['admin','yonetim','arge'] },
      { id: 'yonetim_raporlama', label: 'Yönetim Raporlama', icon: '▦', roller: ['admin','yonetim','arge'] },
      { id: 'ust_yonetim_kokpit', label: 'Üst Yönetim Kokpiti', icon: '◆', roller: ['admin','yonetim','arge'] },
      { id: 'kpi_panel', label: 'KPI Paneli & AI Denetçisi', icon: '📊', roller: ['admin','yonetim','arge','uretim_planlama','kalite','bakim','satinalma'] },
      { id: 'analitik', label: 'Analitik Raporlar (Kârlılık & Performans)', icon: '📈', roller: ['admin','yonetim','arge','cari','muhasebe'] },
      { id: 'operasyon', label: 'Operasyon Yönetimi', icon: '🕐', roller: ['admin','yonetim','arge','uretim_planlama','depo','satinalma'] }
    ]},
    { group: 'MUHASEBE', items: [
      { id: 'muhasebe_panel', label: 'Muhasebe', icon: '₺', roller: ['admin','muhasebe','yonetim','arge'] },
      { id: 'cek_portfoy', label: 'Çek & Senet Portföyü', icon: '🧾', roller: ['admin','yonetim','cari','muhasebe'] },
      { id: 'efatura', label: 'e-Fatura / e-Arşiv', icon: '🧮', roller: ['admin','yonetim','cari','muhasebe'] }
    ]}
  ];

  let state = {
    page: 'dashboard',
    role: null, // henüz seçilmedi -> rol seçim ekranı gösterilir
    ayarlar: null,
    cache: {} // sayfalar arası geçici paylaşılan veri (örn. seçili iş emri id'si)
  };

  const ROLE_STORAGE_KEY = 'uretimos_secili_rol'; // sessionStorage'da tutulur, sekme bazlı hatırlanır

  // ── INIT ─────────────────────────────────────────────────────────────────
  // ── BAŞLANGIÇ HAZIRLIKLARI: seed + tüm migrasyonlar (tek sefer çalışır) ──
  // Sunucu sürümünde bu adımlar OTURUM GEREKTİRİR; bu yüzden hem init'te
  // (mevcut oturum varsa) hem de başarılı girişten hemen sonra çağrılır.
  let _hazirlikTamam = false;
  async function baslangicHazirliklari() {
    if (_hazirlikTamam) return;
    const seeded = await Store.seedIfEmpty();
    state.ayarlar = await Store.ayarlar();
    await migrateHammaddeKdvOrani();
    await migrateHatlar();
    await migrateRdmGercekRecete();
    await migratePaketleriUrundenAyir();
    await migrateHammaddeKategori();
    await migrateEskiTahsilatBeklenenleriIsle();
    await migrateKullanicilar(); // kullanıcı tablosu her zaman kontrol edilir
    _hazirlikTamam = true;
    // Arka planda, bloklamaz. SIRA ÖNEMLİ: önce eksik dosyalar sunucuya
    // yüklenir, ardından doğrulananların base64'ü koleksiyondan çıkarılır.
    migrateKartDosyalariniQrAlaninaAktar()
      .then(() => migrateGorselleriBlobdanCikar())
      .catch(() => {});
    if (seeded) toast('Örnek veriler yüklendi (824_JUDGE, RD_M reçetesi, hat listesi)', 'ok');
  }

  // ── TEK SEFERLİK: kart içine gömülü teknik dosyaları QR alanına aktar ────
  // Kart formlarındaki "Teknik Dosyalar" alanı dosyayı kartın içine gömer.
  // Bu eski yöntemle yüklenmiş dosyalar QR/telefon sayfasında görünmez.
  // Bu göç, kartları tek tek açmaya gerek kalmadan hepsini sunucudaki QR
  // dosya alanına yükler. Arka planda çalışır, hata verse bile uygulamayı
  // etkilemez ve bir daha çalışmaması için bayrak yazılır.
  async function migrateKartDosyalariniQrAlaninaAktar() {
    if (!Store.sunucuModu || typeof QrDosya === 'undefined') return;
    try {
      const ayar = await Store.ayarlar();
      if (ayar && ayar.kartDosyalariQrAktarildi) return;

      const kaynaklar = [
        ['yarimamul', Store.yarimamuller], ['urun', Store.urunler],
        ['altmontaj', Store.altMontajlar], ['paket', Store.paketler]
      ];
      let toplam = 0;
      for (const [tip, koleksiyon] of kaynaklar) {
        if (!koleksiyon) continue;
        let liste;
        try { liste = await koleksiyon.all(); } catch (e) { continue; }
        let degisti = false;
        for (const kart of liste) {
          const bekleyen = (kart.gorseller || []).filter(g => g && g.dataUrl && !g.sunucuId);
          if (!bekleyen.length) continue;
          const adet = await QrDosya.kartDosyalariniSunucuyaAktar(tip, kart.id, kart.kod, kart.ad, kart.gorseller);
          if (adet) { toplam += adet; degisti = true; }
        }
        if (degisti) { try { await koleksiyon.save(liste); } catch (e) {} }
      }
      const guncelAyar = await Store.ayarlar();
      guncelAyar.kartDosyalariQrAktarildi = true;
      await Store.setAyarlar(guncelAyar);
      if (toplam) toast(toplam + ' kart dosyası QR alanına aktarıldı — telefondan görüntülenebilir', 'ok');
    } catch (e) {
      console.error('Kart dosyaları QR aktarımı:', e);
    }
  }

  // ── TEK SEFERLİK: gömülü base64 görselleri koleksiyondan ÇIKAR ───────────
  // Yukarıdaki göç dosyaları sunucuya YÜKLÜYORDU ama kartın içindeki ağır
  // base64 kopyasını SİLMİYORDU. Sonuç: aynı görsel hem diskte hem koleksiyon
  // JSON'unda duruyor ve o koleksiyona yapılan her okuma/yazmada baştan sona
  // taşınıyordu. Bu göç, sunucuda karşılığı DOĞRULANAN görsellerin base64
  // içeriğini karttan çıkarır ve yerine birkaç onlarca baytlık referans yazar.
  //
  // GÜVENLİK İLKESİ: bir görselin base64'ü, ancak sunucuda o dosyanın
  // GERÇEKTEN durduğu doğrulandıktan sonra silinir. Doğrulanamayan hiçbir
  // görsele dokunulmaz — veri kaybı riski alınmaz. Bu yüzden göç kısmen
  // başarılı olabilir ve bir sonraki açılışta kalanları tekrar dener.
  async function migrateGorselleriBlobdanCikar() {
    if (!Store.sunucuModu || typeof QrDosya === 'undefined') return;
    try {
      const ayar = await Store.ayarlar();
      if (ayar && ayar.gorsellerBlobdanCikarildi) return;

      const kaynaklar = [
        ['yarimamul', Store.yarimamuller], ['urun', Store.urunler],
        ['altmontaj', Store.altMontajlar], ['paket', Store.paketler],
        ['hammadde', Store.hammaddeler]
      ];
      let temizlenen = 0, kazanilanBayt = 0, atlanan = 0;

      for (const [tip, koleksiyon] of kaynaklar) {
        if (!koleksiyon) continue;
        let liste;
        try { liste = await koleksiyon.all(); } catch (e) { continue; }
        let degisti = false;

        for (const kart of liste) {
          const gorseller = kart.gorseller;
          if (!Array.isArray(gorseller) || !gorseller.length) continue;
          // Sunucuya yüklenmiş ama base64'ü hâlâ kartta duran görseller
          const artiklar = gorseller.filter(g => g && g.dataUrl && g.sunucuId);
          if (!artiklar.length) continue;

          // Kaydın gizli anahtarını al (görsel adresini üretmek için gerekir)
          let kayit;
          try {
            kayit = await Store.qrKayitGetir(tip, kart.id, kart.kod || kart.stokKodu || kart.id, kart.ad || '');
          } catch (e) { atlanan += artiklar.length; continue; }
          if (!kayit || !kayit.anahtar) { atlanan += artiklar.length; continue; }

          const sunucuDosyalari = new Set((kayit.dosyalar || []).map(d => String(d.id)));
          for (const g of artiklar) {
            // DOĞRULAMA: dosya sunucuda gerçekten var mı?
            if (!sunucuDosyalari.has(String(g.sunucuId))) { atlanan++; continue; }
            kazanilanBayt += String(g.dataUrl).length;
            g.r = tip + ':' + kart.id;
            g.k = kayit.anahtar;
            if (!g.uzanti) {
              const d = (kayit.dosyalar || []).find(x => String(x.id) === String(g.sunucuId));
              if (d) g.uzanti = d.uzanti || '';
            }
            delete g.dataUrl;          // ← ağır içerik koleksiyondan çıkıyor
            temizlenen++; degisti = true;
          }
        }
        if (degisti) { try { await koleksiyon.save(liste); } catch (e) {} }
      }

      // Hiç atlanan kalmadıysa göç tamamlanmıştır; aksi halde bayrak
      // YAZILMAZ ve bir sonraki açılışta kalanlar tekrar denenir.
      if (!atlanan) {
        const guncelAyar = await Store.ayarlar();
        guncelAyar.gorsellerBlobdanCikarildi = true;
        await Store.setAyarlar(guncelAyar);
      }
      if (temizlenen) {
        const mb = (kazanilanBayt / 1048576).toFixed(1);
        toast(temizlenen + ' görsel koleksiyondan çıkarıldı — ' + mb + ' MB kazanıldı'
              + (atlanan ? ' (' + atlanan + ' görsel doğrulanamadı, korundu)' : ''), 'ok');
      }
    } catch (e) {
      console.error('Görsel blob temizliği:', e);   // uygulamayı etkilemez
    }
  }

  const UYGULAMA_SURUM = 'v125';  // Çalışan sürüm — konsola ve ekrana damgalanır (önbellek teşhisi)

  // ── SESSİZ HATA AVCISI ────────────────────────────────────────────────────
  // Bir buton handler'ında hata oluşursa tarayıcı bunu sessizce yutar ve
  // kullanıcı "tuş çalışmıyor" görür. Aşağıdaki iki dinleyici, her hatayı
  // ekranda görünür kılar; böylece sorun gizlenmez, teşhis edilebilir olur.
  try {
    window.addEventListener('error', (e) => {
      try { toast('Hata: ' + (e.message || 'bilinmeyen') + (e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : ''), 'err'); } catch (_) { }
    });
    window.addEventListener('unhandledrejection', (e) => {
      const m = e && e.reason ? (e.reason.message || String(e.reason)) : 'bilinmeyen';
      try { toast('İşlem tamamlanamadı: ' + m, 'err'); } catch (_) { }
    });
  } catch (e) { /* dinleyici kritik değil */ }

  async function init() {
    // Sürüm damgası: hangi sürümün YÜKLENDİĞİNİ kesin görmek için (önbellek sorunları teşhisi).
    console.log('%cÜretimOS ' + UYGULAMA_SURUM + ' yüklendi', 'background:#7c5cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold');
    try {
      window.addEventListener('load', () => {
        setTimeout(() => {
          let damga = document.getElementById('surum-damgasi');
          if (!damga) {
            damga = document.createElement('div');
            damga.id = 'surum-damgasi';
            damga.style.cssText = 'position:fixed;bottom:6px;right:8px;z-index:99999;font-size:10px;color:#999;background:rgba(255,255,255,0.8);padding:1px 6px;border-radius:8px;pointer-events:none';
            damga.textContent = 'ÜretimOS ' + UYGULAMA_SURUM;
            document.body.appendChild(damga);
          }
        }, 1500);
      });
    } catch (e) { /* damga kritik değil */ }

    // ── OPERATÖR (STANDALONE) MODU KISA DEVRESİ ──────────────────────────
    // Operatör terminalde çalışırken sayfa yenilenirse migrasyon/seed
    // adımları ATLANIR: operatörün kısıtlı token'ı bu koleksiyonlara
    // erişemez ve terminal için gerek de yoktur.
    let _savedRoleOn = null, _hatStandaloneOn = null;
    try { _savedRoleOn = window.sessionStorage.getItem(ROLE_STORAGE_KEY); } catch (e) {}
    try { _hatStandaloneOn = window.sessionStorage.getItem('uretimos_hat_standalone'); } catch (e) {}
    if (!_savedRoleOn && _hatStandaloneOn === '1') {
      dilUIGuncelle();
      showSaveIndicator('ok');
      return hatTerminalStandaloneAc();
    }

    showSaveIndicator('loading');
    // ── BAŞLANGIÇ HAZIRLIKLARI (seed + migrasyonlar) — ÇÖKME KORUMALI ────
    // Oturum yokken (taze ziyaret) sunucu 401 döner, api.php arızalıysa
    // (yazma izni yok / pdo_sqlite kapalı / PHP<8) 500 döner. Her iki
    // durumda da UYGULAMA ASLA BOŞ EKRANDA KALMAMALI: hazırlıklar başarısız
    // olsa bile giriş ekranı çizilir; hazırlıklar başarılı girişten sonra
    // (selectRole içinde) yeniden denenir.
    try {
      await baslangicHazirliklari();
    } catch (e) {
      console.error('Başlangıç hazırlıkları ertelendi (oturum yok veya sunucu hatası):', e);
    }
    showSaveIndicator('ok');

    dilUIGuncelle(); // dil düğmesi etiketini localStorage'daki seçime göre ayarla

    // Önceden bu sekmede oturum açılmış mı kontrol et (sayfa yenilenince tekrar sormasın)
    let savedRole = null;
    try { savedRole = window.sessionStorage.getItem(ROLE_STORAGE_KEY); } catch (e) {}
    if (savedRole && ROLLER.some(r => r.id === savedRole)) {
      state.role = savedRole;
      try { const ku = window.sessionStorage.getItem('uretimos_kullanici'); if (ku) state.kullanici = JSON.parse(ku); } catch (e) {}
      document.getElementById('sidebar').style.display = '';
      renderSidebar();
    // Giriş sonrası rolün erişebildiği İLK sayfaya yönlendir (dashboard'a
      // yetkisi olmayan roller — örn. satis — kendi ilk ekranına gider).
      let girisSayfasi = 'dashboard';
      if (!sayfayaErisebilir('dashboard', state.role)) {
        for (const grp of PAGES) {
          const it = grp.items.find(x => !x.roller || x.roller.includes(state.role));
          if (it) { girisSayfasi = it.id; break; }
        }
      }
      goTo(girisSayfasi);
    } else {
      // Operatör terminalde çalışırken sayfa yenilenirse ana girişe düşmesin
      let hatStandalone = null;
      try { hatStandalone = window.sessionStorage.getItem('uretimos_hat_standalone'); } catch (e) {}
      if (hatStandalone === '1') hatTerminalStandaloneAc();
      else renderLoginScreen();
    }
  }

  // ── TEK SEFERLİK VERİ DÜZELTMESİ (MIGRATION) ────────────────────────────
  // Bu özellik eklenmeden önce oluşturulmuş hammaddelerde kdvOraniYuzde alanı
  // hiç yoktu (seed verisi de dahil). Bu fonksiyon, sistem her açıldığında,
  // KDV oranı eksik (null/undefined) olan hammaddeleri bulup otomatik %18
  // atar — böylece önceden kayıtlı eski hammaddeler de "KDV'siz" kalmaz.
  async function migrateHammaddeKdvOrani() {
    const hammaddeler = await Store.hammaddeler.all();
    let degisenSayisi = 0;
    hammaddeler.forEach(h => {
      if (h.kdvOraniYuzde == null) { h.kdvOraniYuzde = 18; degisenSayisi++; }
    });
    if (degisenSayisi > 0) {
      await Store.hammaddeler.save(hammaddeler);
    }
  }

  // ── TEK SEFERLİK VERİ DÜZELTMESİ: RD.M.14080.S2.15.97'Yİ GERÇEK, ────────
  // DÜZENLENEBİLİR BİR REÇETEYE ÇEVİR ────────────────────────────────────
  // Bu ürün önceden sadece statik/salt-okunur bir örnek görünümdü (RDM_RECETE_SEED).
  // Bu migration:
  //  1) Excel'deki alt kırılımda geçen ama sistemde olmayan hammaddeleri ekler
  //  2) İki kenar bandı hammaddesini "kenar_bandi" tipine çevirir
  //  3) B123/M019 kutularını YARI MAMÜL olarak ekler (Excel'de "R"/reçeteli kayıtlar)
  //  4) Tabla/Perde/Masa Ayağı/Perde Tutucu/Travers'i YARI MAMÜL olarak ekler,
  //     Tabla ve Perde'nin plaka+ölçü+4 kenar bandı reçetesini kurar
  //  5) "AKSESUAR RADİKAL MASA TAKIMI OFİS"i ALT MONTAJ olarak ekler (vida içerir)
  //  6) 3 paketi ÜRÜN kartı olarak ekler, her birinin tam reçetesini kurar
  //  7) Ana ürünü normal (artık özel/salt-okunur olmayan) bir ürün kartına
  //     çevirir, reçetesine 3 paketi kalem olarak ekler
  // Tek seferlik olduğunu _migrated_rdm_gercek_v1 bayrağıyla işaretler.
  // ── TEK SEFERLİK VERİ DÜZELTMESİ: HATLAR (İSTASYON/MAKİNA LİSTESİ) ───────
  // Bu özellik eklenmeden önce kurulmuş sistemlerde 'hatlar' anahtarı boş
  // ({}) kalmış olabilir (storage.js'deki seedIfEmpty zaten yeni kurulumları
  // kapsıyor). Eğer boşsa, data.js'deki sabit HATLAR listesinden kopyalanır.
  // ── TEK SEFERLİK VERİ DÜZELTMESİ: HAMMADDE KATEGORİLERİ ──────────────────
  // 1) hammaddeKategorileri listesi boşsa varsayılanlarla doldurulur.
  // 2) Mevcut hammaddelerde "kategori" alanı yoksa, "tip" alanından mantıklı
  // bir varsayılan kategoriye eşlenir (plaka->Plaka, kenar_bandi->Kenar Bandı,
  // hirdavat->Hırdavat) — kullanıcı sonradan değiştirebilir.
  async function migrateHammaddeKategori() {
    const mevcutListe = await Store.hammaddeKategorileriGetir();
    if (!mevcutListe || mevcutListe.length === 0) {
      await Store.hammaddeKategorileriKaydet([...(HAMMADDE_KATEGORI_SEED || [])]);
    }
    const hammaddeler = await Store.hammaddeler.all();
    const tipToKategori = { plaka: 'Plaka', kenar_bandi: 'Kenar Bandı', hirdavat: 'Hırdavat' };
    let degisenSayisi = 0;
    hammaddeler.forEach(h => {
      if (!h.kategori) { h.kategori = tipToKategori[h.tip] || 'Diğer'; degisenSayisi++; }
    });
    if (degisenSayisi > 0) await Store.hammaddeler.save(hammaddeler);
  }

  async function migrateHatlar() {
    const mevcut = await Store.hatlarGetir();
    if (mevcut && Object.keys(mevcut).length > 0) return;
    await Store.hatlarKaydet(JSON.parse(JSON.stringify(HATLAR || {})));
  }

  // ── TEK SEFERLİK VERİ DÜZELTMESİ: PAKETLERİ ÜRÜN KOLEKSİYONUNDAN AYIR ────
  // ── TEK SEFERLİK VERİ DÜZELTMESİ: ESKİ "TAHSİLAT ONAY BEKLEYEN" ÇEK/KREDİ
  // KARTI KAYITLARINI İŞLE ────────────────────────────────────────────────
  // Önceki bir sürümde sipariş onayında/fatura kesiminde TÜM ödeme planı
  // kalemleri (peşinat+çek+kredi kartı+nakit) tahsilatBeklenenler'e "onay
  // bekliyor" olarak düşüyordu. Artık çek/kredi kartı sipariş onayında
  // ANINDA işleniyor — ama bu değişiklikten ÖNCE oluşturulmuş, hâlâ "onay
  // bekliyor" durumunda kalmış çek/kredi kartı kayıtları (kullanıcının
  // "çeklerimi göremiyorum" şikayetinin kök nedeni) burada YAKALANIR ve
  // otomatik olarak işlenir: vade farkı hesaplanır, çek "elde" listesine
  // eklenir, müşteri bakiyesi güncellenir, kayıt "onaylandi" yapılır.
  // Nakit/diğer/peşinat kalemleri DOKUNULMAZ (zaten doğru akıştalar).
  async function migrateEskiTahsilatBeklenenleriIsle() {
    const yapildiMi = await Store.get('_migrated_eski_tahsilat_iscek_v1', false);
    if (yapildiMi) return;

    const tahsilatBeklenenler = await Store.tahsilatBeklenenler.all();
    const islenecekler = tahsilatBeklenenler.filter(t => t.durum === 'onay_bekliyor' && (t.tip === 'cek' || t.tip === 'kredi_karti'));
    if (!islenecekler.length) { await Store.set('_migrated_eski_tahsilat_iscek_v1', true); return; }

    const musteriler = await Store.musteriler.all();
    const musteriCekleri = await Store.musteriCekleri.all();
    const vadeFarkiKayitlari = await Store.vadeFarkiKayitlari.all();
    const tahsilatlar = await Store.tahsilatlar.all();
    const bugun = new Date().toISOString().slice(0, 10);

    function ayFarkiHesapla(vadeTarihiStr) {
      if (!vadeTarihiStr) return 0;
      const gunFarki = Math.max(0, Math.round((new Date(vadeTarihiStr) - new Date(bugun)) / 86400000));
      return Math.ceil(gunFarki / 30);
    }

    islenecekler.forEach(t => {
      const musteri = musteriler.find(m => m.id === t.musteriId);
      const aylikVadeFarkiYuzde = (musteri && musteri.aylikVadeFarkiYuzde) || 0;
      const aySayisi = ayFarkiHesapla(t.tarih);
      const vadeFarki = t.tutar * (aylikVadeFarkiYuzde / 100) * aySayisi;
      const netTutar = t.tutar - vadeFarki;

      t.durum = 'onaylandi';
      t.onayTarihi = bugun;
      t.migrasyondaOtomatikIslendi = true;

      if (vadeFarki > 0) {
        vadeFarkiKayitlari.push({
          id: uid('VF'), musteriId: t.musteriId, musteriAdi: t.musteriAdi,
          siparisId: t.siparisId, siparisKod: t.siparisKod || t.faturaNo, tip: t.tip,
          brutTutar: t.tutar, vadeFarki, netTutar, aySayisi, tarih: bugun
        });
      }
      if (musteri) musteri.bakiye = (musteri.bakiye || 0) - netTutar;

      if (t.tip === 'cek') {
        musteriCekleri.push({
          id: uid('MCK'), musteriId: t.musteriId, musteriAdi: t.musteriAdi,
          cekNo: t.cekNo || '—', tutar: t.tutar, vadeTarihi: t.tarih,
          alisTarihi: bugun, durum: 'elde', kaynakSiparisId: t.siparisId
        });
      }
      tahsilatlar.push({
        id: uid('TAH'), tarih: bugun, musteriId: t.musteriId, musteriAdi: t.musteriAdi,
        tip: t.tip, detay: (t.tip === 'cek' ? 'Çek No: ' + (t.cekNo || '—') : 'Kredi Kartı') + ' (otomatik düzeltme — eski bekleyen kayıt işlendi)',
        tutar: netTutar, kaynakTahsilatBeklenenId: t.id
      });
    });

    await Store.musteriler.save(musteriler);
    await Store.musteriCekleri.save(musteriCekleri);
    await Store.vadeFarkiKayitlari.save(vadeFarkiKayitlari);
    await Store.tahsilatlar.save(tahsilatlar);
    await Store.tahsilatBeklenenler.save(tahsilatBeklenenler);
    await Store.set('_migrated_eski_tahsilat_iscek_v1', true);
  }

  // ── KULLANICI TABLOSU MIGRATION ───────────────────────────────────────────
  // seedIfEmpty'den BAĞIMSIZ — her açılışta çalışır. Eski sürümden (şifresiz)
  // geçen kurulumlar dahil olmak üzere, kullaniciler koleksiyonu boşsa
  // varsayılan hesapları oluşturur. Böylece daha önce açılmış (seeded=true)
  // sistemlerde de şifreli giriş çalışır.
  async function migrateKullanicilar() {
    // SUNUCU SÜRÜMÜ: kullanıcılar api.php tarafında (ilk login'de, bcrypt
    // hash'li) oluşturulur; API güvenlik gereği "kullaniciler" koleksiyonunun
    // istemciden yazılmasını 403 ile engeller. Bu yüzden sunucu modunda bu
    // migration tamamen atlanır.
    if (Store.sunucuModu) return;
    const mevcutlar = await Store.kullaniciler.all();
    const VARSAYILAN_KULLANICILAR = [
      { id: 'USR-yonetim',   kullaniciAdi: 'yonetim',   sifreHash: 'yonetim1234',   rol: 'yonetim',          ad: 'Üst Yönetim' },
      { id: 'USR-arge',      kullaniciAdi: 'arge',       sifreHash: 'arge1234',       rol: 'arge',             ad: 'ARGE' },
      { id: 'USR-teknik',    kullaniciAdi: 'teknik',     sifreHash: 'teknik1234',     rol: 'teknik_ofis',      ad: 'Teknik Ofis' },
      { id: 'USR-satinalma', kullaniciAdi: 'satinalma',  sifreHash: 'satinalma1234',  rol: 'satinalma',        ad: 'Satınalma' },
      { id: 'USR-uretim',    kullaniciAdi: 'uretim',     sifreHash: 'uretim1234',     rol: 'uretim_planlama',  ad: 'Üretim Planlama' },
      { id: 'USR-depo',      kullaniciAdi: 'depo',       sifreHash: 'depo1234',       rol: 'depo',             ad: 'Depo' },
      { id: 'USR-cari',      kullaniciAdi: 'cari',       sifreHash: 'cari1234',       rol: 'cari',             ad: 'Cari İşlemler' },
      { id: 'USR-teklif',    kullaniciAdi: 'teklif',     sifreHash: 'teklif1234',     rol: 'teklif_siparis',   ad: 'Teklif & Sipariş' },
      { id: 'USR-satis',     kullaniciAdi: 'satis',      sifreHash: 'satis1234',      rol: 'satis',            ad: 'Satış ve Siparişler' },
      { id: 'USR-sevkiyat',  kullaniciAdi: 'sevkiyat',   sifreHash: 'sevkiyat1234',   rol: 'sevkiyat',         ad: 'Sevkiyat' },
      { id: 'USR-muhasebe',  kullaniciAdi: 'muhasebe',   sifreHash: 'muhasebe1234',   rol: 'muhasebe',         ad: 'Muhasebe' },
      { id: 'USR-kalite',    kullaniciAdi: 'kalite',     sifreHash: 'kalite1234',     rol: 'kalite',           ad: 'Kalite Kontrol' },
      { id: 'USR-ik',        kullaniciAdi: 'ik',         sifreHash: 'ik1234',         rol: 'ik',               ad: 'İnsan Kaynakları' },
      { id: 'USR-bakim',     kullaniciAdi: 'bakim',      sifreHash: 'bakim1234',      rol: 'bakim',            ad: 'Bakım' },
    ];
    if (mevcutlar.length === 0) {
      await Store.kullaniciler.save(VARSAYILAN_KULLANICILAR);
      return;
    }
    // Mevcut kurulum: eksik varsayılan kullanıcıları (örn. yeni eklenen 'satis')
    // listeye tamamla — mevcut şifreler/kullanıcılar korunur.
    const mevcutIdler = new Set(mevcutlar.map(k => k.id));
    const eklenecekler = VARSAYILAN_KULLANICILAR.filter(k => !mevcutIdler.has(k.id) &&
      !mevcutlar.some(m => (m.kullaniciAdi || '').toLowerCase() === k.kullaniciAdi));
    if (eklenecekler.length) {
      await Store.kullaniciler.save([...mevcutlar, ...eklenecekler]);
    }
  }

  // ── TEK SEFERLİK VERİ DÜZELTMESİ: PAKETLERİ ÜRÜN KOLEKSİYONUNDAN AYIR ────
  // Önceki bir sürümde RDM.14080.S2.PKT01/02/03 gibi paket kartları geçici
  // olarak ÜRÜN koleksiyonuna kaydedilmişti (paket henüz kendi kart tipi
  // değildi). Bu migration onları gerçek `paketler` koleksiyonuna TAŞIR:
  //  1) Kod içinde "PKT" geçen veya kendisine referans veren reçetelerde
  //     "paket" amaçlı kullanıldığı bilinen ürün kartları paketler'e taşınır
  //  2) Kendi alt reçeteleri (urunId bağlı) artık paketId'ye bağlanır
  //  3) Onları kalem olarak kullanan TÜM reçetelerdeki referanslar
  //     (tip:'urun' → tip:'paket') güncellenir
  //  4) Eski ürün kartı ve onun urunId'li reçetesi silinir
  async function migratePaketleriUrundenAyir() {
    const yapildiMi = await Store.get('_migrated_paket_ayrimi_v1', false);
    if (yapildiMi) return;

    const [urunler, paketler, receteler] = await Promise.all([
      Store.urunler.all(), Store.paketler.all(), Store.receteler.all()
    ]);

    // Taşınacak adaylar: kodunda "PKT" geçen ürün kartları (RD.M.14080 örneğindeki
    // gibi). Bu sezgisel kural, kullanıcının "PKT isimli kalemler paket" tanımıyla
    // birebir uyumludur.
    const tasinacaklar = urunler.filter(u => u.kod.toUpperCase().includes('PKT'));
    if (!tasinacaklar.length) { await Store.set('_migrated_paket_ayrimi_v1', true); return; }

    const eskiIdYeniId = new Map(); // eski urunId -> yeni paketId (aynı id korunabilir ama açıklık için haritalıyoruz)

    tasinacaklar.forEach(u => {
      const yeniPaket = {
        id: u.id, // id aynı kalır — sadece koleksiyon değişir, referans bütünlüğü kolaylaşır
        kod: u.kod, ad: u.ad, aciklama: u.aciklama || '',
        ambalajTipi: 'Koli', koliIciAdet: 1,
        rotaId: u.rotaId || null, amortismanGideri: u.amortismanGideri || 0, gygOraniYuzde: u.gygOraniYuzde || 0,
        gorseller: u.gorseller || [], olusturmaTarihi: u.olusturmaTarihi || new Date().toISOString().slice(0, 10)
      };
      paketler.push(yeniPaket);
      eskiIdYeniId.set(u.id, u.id);
    });

    // Ürün koleksiyonundan çıkar
    const kalanUrunler = urunler.filter(u => !tasinacaklar.some(t => t.id === u.id));

    // Reçeteleri güncelle: (a) paketin KENDİ reçetesi urunId->paketId olur,
    // (b) onu KULLANAN reçetelerdeki kalemler tip:'urun'->tip:'paket' olur.
    receteler.forEach(r => {
      if (r.urunId && eskiIdYeniId.has(r.urunId)) {
        r.paketId = eskiIdYeniId.get(r.urunId);
        delete r.urunId;
      }
      (r.kalemler || []).forEach(k => {
        if (k.tip === 'urun' && eskiIdYeniId.has(k.refId)) k.tip = 'paket';
      });
    });

    await Store.urunler.save(kalanUrunler);
    await Store.paketler.save(paketler);
    await Store.receteler.save(receteler);
    await Store.set('_migrated_paket_ayrimi_v1', true);
  }

  async function migrateRdmGercekRecete() {
    const yapildiMi = await Store.get('_migrated_rdm_gercek_v1', false);
    if (yapildiMi) return;

    const [hammaddeler, yarimamuller, altMontajlar, urunler, paketler, receteler] = await Promise.all([
      Store.hammaddeler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(), Store.urunler.all(), Store.paketler.all(), Store.receteler.all()
    ]);

    function hmBul(stokKodu) { return hammaddeler.find(h => h.stokKodu === stokKodu); }
    function hmEkleYoksa(stokKodu, tip, ad, birim, fiyat, dvz, fire) {
      let hm = hmBul(stokKodu);
      if (!hm) {
        hm = { id: uid('HM'), tip, kategori: tip === 'plaka' ? 'Plaka' : tip === 'kenar_bandi' ? 'Kenar Bandı' : 'Hırdavat', stokKodu, ad, birim, birimFiyat: fiyat, dvz, fireYuzde: fire || 0, kdvOraniYuzde: 18 };
        hammaddeler.push(hm);
      }
      return hm;
    }

    // 1) Eksik hammaddeler (Excel'de geçen ama sistemde olmayan kalemler)
    hmEkleYoksa('81.01.001.201.14', 'hirdavat', 'PROFIL 50X50X1,40MM DKP', 'METRE', 2.19, 'USD', 5);
    hmEkleYoksa('81.06.001.003.01', 'hirdavat', 'KARBOSAN AL.OX.80 FLAP DISCS (115X22)', 'ADET', 45, 'TL', 1);
    hmEkleYoksa('81.05.012.050.01', 'hirdavat', 'M-8 ALTI-KOSE PUL KAFA PERCIN SOMUN', 'ADET', 1.23, 'TL', 1);
    hmEkleYoksa('81.05.014.004.22', 'hirdavat', 'M-8X15 CIVATA (IMBUS) GALVENIZLI ALYAN BASLI', 'ADET', 1.23, 'TL', 1);
    hmEkleYoksa('81.05.012.004.00', 'hirdavat', 'M-8 SOMUN GALVENIZLI', 'ADET', 0.41, 'TL', 1);
    hmEkleYoksa('81.01.004.401.02', 'hirdavat', 'SAC S=2,5MM 1,25X2,5M HRP', 'GRAM', 0.001, 'USD', 5);
    hmEkleYoksa('55.01.002.01', 'hirdavat', 'B2 BASKISIZ HIRDAVAT KUTUSU', 'ADET', 4.11, 'TL', 1);
    hmEkleYoksa('55.110.080.03', 'hirdavat', 'Z KARTON 80CM BASKISIZ-BEYAZ', 'METRE', 17.26, 'TL', 2);
    hmEkleYoksa('55.110.100.02', 'hirdavat', 'Z KARTON 100CM DOXA BASKILI', 'METRE', 19.73, 'TL', 2);
    hmEkleYoksa('81.05.014.320.00', 'hirdavat', 'VIDA YSB M8x30', 'ADET', 0, 'TL', 1);

    // 2) Kenar bandı tipine çevir (önceden "hirdavat" olarak kayıtlıydı)
    const bant1 = hmBul('50.010.01.001.07'); // KENAR BANT PVC BEYAZ 2*33 (30mm plaka için)
    if (bant1) bant1.tip = 'kenar_bandi';
    const bant2 = hmBul('50.010.01.001.00'); // KENAR BANT PVC BEYAZ 0,40*22 (18mm plaka için)
    if (bant2) bant2.tip = 'kenar_bandi';

    await Store.hammaddeler.save(hammaddeler);

    // ── Yardımcı: kod ile yarımamül/altmontaj/ürün bul-veya-oluştur ────────
    function ymBul(kod) { return yarimamuller.find(y => y.kod === kod); }
    function ymEkleYoksa(kod, ad) {
      let ym = ymBul(kod);
      if (!ym) {
        ym = { id: uid('YM'), kod, ad, hammaddeId: null, rotaId: null, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        yarimamuller.push(ym);
      }
      return ym;
    }
    function amBul(kod) { return altMontajlar.find(a => a.kod === kod); }
    function amEkleYoksa(kod, ad) {
      let am = amBul(kod);
      if (!am) {
        am = { id: uid('AM'), kod, ad, aciklama: '', rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        altMontajlar.push(am);
      }
      return am;
    }
    function urunBul(kod) { return urunler.find(u => u.kod === kod); }
    function urunEkleYoksa(kod, ad) {
      let u = urunBul(kod);
      if (!u) {
        u = { id: uid('URN'), kod, ad, aciklama: '', rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        urunler.push(u);
      }
      return u;
    }
    function paketBul(kod) { return paketler.find(p => p.kod === kod); }
    function paketEkleYoksa(kod, ad) {
      let p = paketBul(kod);
      if (!p) {
        p = { id: uid('PKT'), kod, ad, aciklama: '', ambalajTipi: 'Koli', koliIciAdet: 1, rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        paketler.push(p);
      }
      return p;
    }
    function receteBulVeyaOlustur(sahipTip, sahipId, sahipAd) {
      const alanAdi = sahipTip === 'urun' ? 'urunId' : sahipTip === 'yarimamul' ? 'yarimamulId' : sahipTip === 'altmontaj' ? 'altMontajId' : 'paketId';
      let r = receteler.find(x => x[alanAdi] === sahipId);
      if (!r) {
        r = { id: uid('RC'), [alanAdi]: sahipId, ad: sahipAd + ' Reçetesi', kalemler: [] };
        receteler.push(r);
      }
      return r;
    }

    // 3) B123 ve M019 kutuları — Excel'de "R" (reçeteli) kayıtlar, yarı mamül olarak eklenir
    const b123 = ymEkleYoksa('55.02.123.00', 'B123 RADİKAL KOLİSİ');
    const b123Recete = receteBulVeyaOlustur('yarimamul', b123.id, b123.ad);
    if (!b123Recete.kalemler.length) {
      const zKarton100 = hmBul('55.110.100.02');
      b123Recete.kalemler.push({ tip: 'hammadde', refId: zKarton100.id, miktar: 3.042, birim: 'METRE' });
    }

    const m019 = ymEkleYoksa('85.11.019.01', 'M019 RADİCAL BÜYÜK HARK.TRAVERS KOLİSİ B.SIZ');
    const m019Recete = receteBulVeyaOlustur('yarimamul', m019.id, m019.ad);
    if (!m019Recete.kalemler.length) {
      const zKarton80 = hmBul('55.110.080.03');
      m019Recete.kalemler.push({ tip: 'hammadde', refId: zKarton80.id, miktar: 2.372, birim: 'METRE' });
    }

    // 4) AKSESUAR RADİKAL MASA TAKIMI OFİS — ALT MONTAJ (vida/hırdavat içeriyor)
    const aksesuar = amEkleYoksa('555.001.03.002.07', 'AKSESUAR RADİKAL MASA TAKIMI OFİS');
    const aksesuarRecete = receteBulVeyaOlustur('altmontaj', aksesuar.id, aksesuar.ad);
    if (!aksesuarRecete.kalemler.length) {
      const vida = hmBul('81.05.014.300.00');
      aksesuarRecete.kalemler.push({ tip: 'hammadde', refId: vida.id, miktar: 18, birim: 'ADET' });
    }

    // 5) Tabla — Standart 140x80 30mm (plaka + ölçü + 4 kenar bandı + alt montaj aksesuar)
    const tabla = ymEkleYoksa('Y.STU.14080.S2.UTB00.15', 'Standart 140x80 30mm Tabla - Beyaz');
    const tablaRecete = receteBulVeyaOlustur('yarimamul', tabla.id, tabla.ad);
    if (!tablaRecete.kalemler.length) {
      const suntalam30 = hmBul('50.002.230.01.010.00');
      const bant33 = hmBul('50.010.01.001.07');
      const minifix = hmBul('51.003.01.020.00');
      // Tabla: En=800mm, Boy=1400mm — tüm kenarlarda aynı bant (50.010.01.001.07)
      tablaRecete.kalemler.push({
        tip: 'hammadde', refId: suntalam30.id, miktar: 1, birim: 'METRE',
        olcu: { kabaEn: 800, kabaBoy: 1400, netEn: 800, netBoy: 1400 },
        kenarBantlari: { on: bant33.id, arka: bant33.id, sag: bant33.id, sol: bant33.id }
      });
      tablaRecete.kalemler.push({ tip: 'altmontaj', refId: aksesuar.id, miktar: 1, birim: 'ADET' });
      tablaRecete.kalemler.push({ tip: 'hammadde', refId: minifix.id, miktar: 24, birim: 'ADET' });
    }

    // 6) Perde — Standart 1100x350mm Dikdörtgen (plaka + ölçü + 4 kenar bandı)
    const perde = ymEkleYoksa('Y.STP.11035.PRD00.15', 'Standart 1100x350mm Dikdörtgen Perde - Beyaz');
    const perdeRecete = receteBulVeyaOlustur('yarimamul', perde.id, perde.ad);
    if (!perdeRecete.kalemler.length) {
      const suntalam18 = hmBul('50.002.218.01.012.00');
      const bant22 = hmBul('50.010.01.001.00');
      const minifix = hmBul('51.003.01.020.00');
      // Perde: En=350mm, Boy=1100mm — tüm kenarlarda aynı bant (50.010.01.001.00)
      perdeRecete.kalemler.push({
        tip: 'hammadde', refId: suntalam18.id, miktar: 1, birim: 'METRE',
        olcu: { kabaEn: 350, kabaBoy: 1100, netEn: 350, netBoy: 1100 },
        kenarBantlari: { on: bant22.id, arka: bant22.id, sag: bant22.id, sol: bant22.id }
      });
      perdeRecete.kalemler.push({ tip: 'hammadde', refId: minifix.id, miktar: 6, birim: 'ADET' });
    }

    // 7) Radical 80lik Masa Ayağı - Hark Traversli - Füme (B123 kolisi + sac/profil/kaynak/boya vb.)
    const masaAyagi = ymEkleYoksa('200.DX.RD.001.080.001.97', 'Radical 80lik Masa Ayağı - Hark Traversli - Füme');
    const masaAyagiRecete = receteBulVeyaOlustur('yarimamul', masaAyagi.id, masaAyagi.ad);
    if (!masaAyagiRecete.kalemler.length) {
      const kalemler = [
        ['81.01.004.001.00', 360, 'GRAM'], ['81.01.001.201.14', 2.185, 'METRE'],
        ['81.05.009.001.00', 0.04, 'ADET'], ['81.06.001.003.01', 1, 'ADET'],
        ['81.05.012.050.01', 4, 'ADET'], ['81.05.014.004.22', 5, 'ADET'],
        ['81.05.012.004.00', 1, 'ADET'], ['85.01.001.001', 2, 'ADET'],
        ['85.10.01.006', 55, 'GRAM']
      ];
      kalemler.forEach(([kod, miktar, birim]) => {
        const hm = hmBul(kod);
        if (hm) masaAyagiRecete.kalemler.push({ tip: 'hammadde', refId: hm.id, miktar, birim });
      });
      masaAyagiRecete.kalemler.push({ tip: 'yarimamul', refId: b123.id, miktar: 1, birim: 'ADET' });
    }

    // 8) Rm 100 - Perde Tutucu - Füme
    const perdeTutucu = ymEkleYoksa('200.DX.RM100.017.005.97', 'Rm 100 - Perde Tutucu - Füme');
    const perdeTutucuRecete = receteBulVeyaOlustur('yarimamul', perdeTutucu.id, perdeTutucu.ad);
    if (!perdeTutucuRecete.kalemler.length) {
      const kalemler = [
        ['81.01.004.401.02', 400, 'GRAM'], ['81.05.014.004.22', 3, 'ADET'],
        ['85.10.01.006', 60, 'GRAM'], ['55.01.002.01', 0.5, 'ADET']
      ];
      kalemler.forEach(([kod, miktar, birim]) => {
        const hm = hmBul(kod);
        if (hm) perdeTutucuRecete.kalemler.push({ tip: 'hammadde', refId: hm.id, miktar, birim });
      });
    }

    // 9) Radical Büyük Hareketli Travers - Füme (M019 kolisi + sac/kaynak/boya vb.)
    const travers = ymEkleYoksa('200.DX.RD.013.013.003.97', 'Radical Büyük Hareketli Travers - Füme');
    const traversRecete = receteBulVeyaOlustur('yarimamul', travers.id, travers.ad);
    if (!traversRecete.kalemler.length) {
      const kalemler = [
        ['81.01.004.001.00', 4944, 'GRAM'], ['81.01.004.601.03', 1104, 'GRAM'],
        ['81.05.009.001.00', 0.003, 'ADET'], ['85.10.01.006', 110, 'GRAM'],
        ['81.05.012.004.00', 2, 'ADET'], ['81.05.014.320.00', 2, 'ADET']
      ];
      kalemler.forEach(([kod, miktar, birim]) => {
        const hm = hmBul(kod);
        if (hm) traversRecete.kalemler.push({ tip: 'hammadde', refId: hm.id, miktar, birim });
      });
      traversRecete.kalemler.push({ tip: 'yarimamul', refId: m019.id, miktar: 1, birim: 'ADET' });
    }

    // 10) Paket 1/2/3 — PAKET kartı olarak (kullanıcının "Paket" kademesi —
    // sevkiyat öncesi paketleme/koli takibi için SANAL kart, ürün/yarımamül
    // değil; Satınalma/MRP/Depo akışlarına HİÇ girmez)
    const pkt1 = paketEkleYoksa('RDM.14080.S2.PKT01.15', 'Radical 14080 30mm — Paket 1/3 — Beyaz');
    const pkt1Recete = receteBulVeyaOlustur('paket', pkt1.id, pkt1.ad);
    if (!pkt1Recete.kalemler.length) {
      pkt1Recete.kalemler.push({ tip: 'yarimamul', refId: tabla.id, miktar: 1, birim: 'ADET' });
      pkt1Recete.kalemler.push({ tip: 'altmontaj', refId: aksesuar.id, miktar: 1, birim: 'ADET' });
      pkt1Recete.kalemler.push({ tip: 'yarimamul', refId: perde.id, miktar: 1, birim: 'ADET' });
      const minifix = hmBul('51.003.01.020.00');
      pkt1Recete.kalemler.push({ tip: 'hammadde', refId: minifix.id, miktar: 24, birim: 'ADET' });
    }

    const pkt2 = paketEkleYoksa('RDM.14080.S2.PKT02.97', 'Radical 14080 30mm — Paket 2/3 — Füme');
    const pkt2Recete = receteBulVeyaOlustur('paket', pkt2.id, pkt2.ad);
    if (!pkt2Recete.kalemler.length) {
      pkt2Recete.kalemler.push({ tip: 'yarimamul', refId: masaAyagi.id, miktar: 2, birim: 'ADET' });
      pkt2Recete.kalemler.push({ tip: 'yarimamul', refId: perdeTutucu.id, miktar: 2, birim: 'ADET' });
    }

    const pkt3 = paketEkleYoksa('RDM.14080.S2.PKT03.97', 'Radical 14080 30mm — Paket 3/3 — Füme');
    const pkt3Recete = receteBulVeyaOlustur('paket', pkt3.id, pkt3.ad);
    if (!pkt3Recete.kalemler.length) {
      pkt3Recete.kalemler.push({ tip: 'yarimamul', refId: travers.id, miktar: 1, birim: 'ADET' });
    }

    // 11) Ana ürün — artık normal (salt-okunur olmayan) bir ürün kartı; reçetesi
    // 3 PAKETİ kalem olarak içerir (1. KADEME — kullanıcının tanımladığı yapı)
    const anaUrun = urunBul('RD.M.14080.S2.15.97') || (() => {
      const u = { id: uid('URN'), kod: 'RD.M.14080.S2.15.97', ad: 'Radical 14080 30mm', aciklama: 'Excel alt kırılımından gerçek reçeteye dönüştürüldü.', rotaId: null, amortismanGideri: 0, gygOraniYuzde: 0, gorseller: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
      urunler.push(u);
      return u;
    })();
    const anaRecete = receteBulVeyaOlustur('urun', anaUrun.id, anaUrun.ad);
    if (!anaRecete.kalemler.length) {
      anaRecete.kalemler.push({ tip: 'paket', refId: pkt1.id, miktar: 1, birim: 'ADET' });
      anaRecete.kalemler.push({ tip: 'paket', refId: pkt2.id, miktar: 1, birim: 'ADET' });
      anaRecete.kalemler.push({ tip: 'paket', refId: pkt3.id, miktar: 1, birim: 'ADET' });
    }

    await Store.yarimamuller.save(yarimamuller);
    await Store.altMontajlar.save(altMontajlar);
    await Store.urunler.save(urunler);
    await Store.paketler.save(paketler);
    await Store.receteler.save(receteler);
    await Store.set('_migrated_rdm_gercek_v1', true);
  }

  // ── GİRİŞ EKRANI (Şifreli Kimlik Doğrulama) ─────────────────────────────
  async function renderLoginScreen() {
    document.getElementById('sidebar').innerHTML = '';
    document.getElementById('sidebar').style.display = 'none';
    const main = document.getElementById('main');
    // Üç tanıtım butonu (rehber/tutorial/hat terminali) TEK bir ortak stil
    // temelini paylaşır — önceden her biri kendi uzun inline stil bloğunu
    // taşıyordu, aralarındaki küçük tutarsızlıklar (padding/line-height)
    // ekranda hafif "kayma" hissi veriyordu. Yalnızca renk/kenarlık farklı.
    const cta = 'display:block;width:100%;padding:12px 10px;font-size:clamp(11px,3.2vw,13px);' +
      'font-weight:800;line-height:1.4;white-space:normal;word-break:break-word;height:auto;' +
      'min-height:44px;text-align:center;box-sizing:border-box';
    main.innerHTML = `
      <div style="max-width:380px;margin:60px auto;padding:0 14px;box-sizing:border-box">
        <div style="text-align:center;margin-bottom:28px">
          <div style="font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:4px">ÜretimOS</div>
          <div style="font-size:12.5px;color:var(--text3)">Kullanıcı adı ve şifrenizi girin</div>
        </div>
        <div class="card" style="padding:24px;box-sizing:border-box">
          <div class="fgroup"><label class="flbl">Kullanıcı Adı</label>
            <input class="finput" id="ln-kullanici" type="text" placeholder="örn. cari" autocomplete="username" autofocus>
          </div>
          <div class="fgroup"><label class="flbl">Şifre</label>
            <input class="finput" id="ln-sifre" type="password" placeholder="şifreniz" autocomplete="current-password">
          </div>
          <div id="ln-hata" style="color:var(--red-text);font-size:12px;margin-bottom:10px;display:none">Kullanıcı adı veya şifre hatalı.</div>
          <button class="btn btn-blue" id="ln-giris" style="width:100%;margin-top:4px;white-space:normal">Giriş Yap</button>
          <button class="btn btn-ghost" id="ln-hesap-talep" style="width:100%;margin-top:8px;font-size:11.5px;white-space:normal;line-height:1.3">Hesabınız yok mu? Hesap Talep Edin</button>
        </div>
        <div style="text-align:center;font-size:11px;color:var(--text3);margin-top:16px">
          İlk kurulumda her birim için varsayılan şifre: <b>[birim]1234</b><br>
          Örn: kullanıcı adı <b>cari</b>, şifre <b>cari1234</b>
        </div>

        <!-- ── 1) SİSTEM REHBERİ (ayrıntılı tanıtım) ──
             Programın tamamı: aşama aşama işleyiş, veri akışı, rapor haritası,
             yan kollar ve hiyerarşik yapı. İnteraktif turdan ÖNCE gelir. -->
        <button class="btn" id="ln-rehber" style="${cta};margin-top:16px;border:0;color:#fff;
          background:linear-gradient(135deg,#0f172a,#1e3a8a);box-shadow:0 4px 14px rgba(30,58,138,.32)">
          📖 Sistem Rehberi — Ayrıntılı Tanıtım<br>
          <span style="font-weight:600;opacity:.9">İşleyiş · ERP/OCR entegrasyonları · e-Fatura/e-İrsaliye · rapor haritası</span>
        </button>
        <div style="text-align:center;font-size:10.5px;color:var(--text3);margin-top:7px">
          <b>Önce burayı okuyun:</b> hangi ekran ne yapar, hareketler yönetim
          raporlarına nasıl yansır — güncel bölümlerle.
        </div>

        <!-- ── 2) İNTERAKTİF TANITIM (oyunlaştırılmış eğitim) ──
             Ziyaretçi, siparişten sevkiyata tüm akışı 9 duraklık bir yolculuk
             olarak deneyimler. Giriş yapmadan çalışır, gerçek veriye dokunmaz. -->
        <button class="btn" id="ln-tutorial" style="${cta};margin-top:16px;border:0;color:#fff;
          background:linear-gradient(135deg,#7c3aed,#2563eb);box-shadow:0 4px 14px rgba(37,99,235,.35)">
          🎮 Uygulamalı Test — İnteraktif Tur<br>
          <span style="font-weight:600;opacity:.9">Siparişten sevkiyata 10 durak · görevlerle · ~15 dk</span>
        </button>
        <div style="text-align:center;font-size:10.5px;color:var(--text3);margin-top:7px">
          <b>Sonra burayı deneyin:</b> öğrendiklerinizi görevlerle sınayın, puan ve
          rozet kazanın. <b>Giriş gerekmez.</b>
        </div>

        <!-- ── HAT OPERATÖR TERMİNALİ GİRİŞİ (ana giriş ekranının altı) ──
             Operatörler ÜretimOS'a kullanıcı adıyla girmez; buradan kendi
             hat/bölüm yetkileriyle doğrudan terminale girer. -->
        <div style="display:flex;align-items:center;gap:10px;margin:22px 0 14px">
          <div style="flex:1;height:1px;background:var(--border)"></div>
          <div style="font-size:10.5px;color:var(--text3);font-weight:700;letter-spacing:.5px">ÜRETİM SAHASI</div>
          <div style="flex:1;height:1px;background:var(--border)"></div>
        </div>
        <button class="btn" id="ln-hat-terminal" style="${cta};border:1.5px solid var(--blue-light);background:var(--blue-bg);color:var(--blue-text)">
          📱 Hat Operatör Terminali<br><span style="font-weight:600;opacity:.85">Operatör Girişi</span>
        </button>
        <div style="text-align:center;font-size:10.5px;color:var(--text3);margin-top:8px">
          Hat operatörleri buradan girer. Şifresi olmayan operatör terminal ekranından
          <b>şifre oluşturma talebi</b> açar; talep yönetim tarafından onaylanınca
          yalnızca yetkilendirildiği hatlara girebilir.
        </div>
      </div>
    `;
    document.getElementById('ln-hat-terminal').onclick = () => hatTerminalStandaloneAc();
    document.getElementById('ln-rehber').onclick = () => {
      if (typeof Rehber !== 'undefined') Rehber.ac();
      else toast('Rehber modülü yüklenemedi', 'err');
    };
    document.getElementById('ln-tutorial').onclick = () => {
      if (typeof Tutorial !== 'undefined') Tutorial.ac();
      else toast('Tanıtım modülü yüklenemedi', 'err');
    };

    // ── SUNUCU SAĞLIK KONTROLÜ ───────────────────────────────────────────
    // api.php arızalıysa (500: klasöre yazma izni yok / pdo_sqlite kapalı /
    // PHP<8) kullanıcı "giriş yapamıyorum" yerine SEBEBİNİ görsün. Kontrol
    // token gerektirmeyen hatListesi ucuyla yapılır — bu uç veritabanına da
    // dokunur, yani data.sqlite oluşturulamıyorsa burada yakalanır.
    (async () => {
      try {
        const res = await fetch('api.php?action=hatListesi');
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.ok) return; // sunucu sağlıklı
        throw new Error('HTTP ' + res.status);
      } catch (e) {
        const kart = document.querySelector('#main .card');
        if (!kart) return;
        const uyari = document.createElement('div');
        uyari.style.cssText = 'border:1.5px solid var(--red);background:var(--red-bg);color:var(--red-text);border-radius:10px;padding:10px 12px;font-size:11.5px;margin-bottom:12px;line-height:1.5';
        uyari.innerHTML = `<b>⚠ Sunucu API'sine ulaşılamıyor (api.php hata veriyor)</b><br>
          Giriş bu düzeltilmeden çalışmaz. Hosting panelinden sırayla kontrol edin:<br>
          1) PHP sürümü <b>8.0+</b> olmalı (cPanel → Select PHP Version)<br>
          2) <b>pdo_sqlite</b> eklentisi açık olmalı (PHP Extensions listesinde işaretli)<br>
          3) Site klasörüne <b>yazma izni</b> (755/775) verilmeli — <span class="mono">data.sqlite</span> otomatik oluşacak<br>
          Ayrıntı için tarayıcıda <span class="mono">${location.origin}${location.pathname.replace(/index\.html?$/,'')}api.php?action=hatListesi</span> adresini açın; JSON yerine hata görüyorsanız sorun sunucudadır. (Hata: ${escapeHtml(String(e.message || e))})`;
        kart.parentNode.insertBefore(uyari, kart);
      }
    })();
    const girisBtnCalis = async () => {
      const kadi = (document.getElementById('ln-kullanici').value || '').trim().toLowerCase();
      const sifre = document.getElementById('ln-sifre').value;
      const hataEl = document.getElementById('ln-hata');
      hataEl.style.display = 'none';
      if (!kadi || !sifre) { hataEl.textContent = 'Kullanıcı adı ve şifre zorunlu.'; hataEl.style.display = 'block'; return; }
      const btn = document.getElementById('ln-giris');
      btn.disabled = true; btn.textContent = 'Giriş yapılıyor…';
      // Store.login: yerel sürümde tarayıcıda, sunucu sürümünde API'de
      // (bcrypt ile) doğrular — app.js hangi sürümde olduğunu bilmez.
      const sonuc = await Store.login(kadi, sifre);
      btn.disabled = false; btn.textContent = 'Giriş Yap';
      if (!sonuc.ok) { hataEl.textContent = sonuc.error || 'Kullanıcı adı veya şifre hatalı.'; hataEl.style.display = 'block'; return; }
      selectRole(sonuc.kullanici.rol, sonuc.kullanici);
    };
    document.getElementById('ln-giris').onclick = girisBtnCalis;
    document.getElementById('ln-sifre').onkeydown = e => { if (e.key === 'Enter') girisBtnCalis(); };
    document.getElementById('ln-kullanici').onkeydown = e => { if (e.key === 'Enter') document.getElementById('ln-sifre').focus(); };
    document.getElementById('ln-hesap-talep').onclick = hesapTalepFormuAc;
  }

  // ── HESAP TALEP ET (e-posta ile kayıt + yönetim onayı) ──────────────────
  // Giriş ekranından, oturum olmadan çağrılır. Şifre KULLANICI tarafından
  // belirlenir (sunucu yalnızca hash'ini saklar) — böylece onaydan sonra
  // ayrıca bir "şifrenizi e-postayla iletiyoruz" adımına gerek kalmaz.
  function hesapTalepFormuAc() {
    // 'admin' (görünüm rozeti, gerçek rol değil) ve 'yonetim' (tam yetkili
    // rol) kamuya açık self-servis formda BİLEREK YOK — bkz. api.php
    // TALEP_EDILEBILIR_ROLLER yorumu. Üst Yönetim hesabı yalnızca mevcut bir
    // yönetim kullanıcısının Hesap Talepleri onay ekranından "Verilecek Rol"
    // ile yükseltmesiyle açılabilir.
    const rolSecenekleri = ROLLER.filter(r => r.id !== 'admin' && r.id !== 'yonetim');
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:12px">Talebiniz yönetici onayına düşer; onaylanınca burada belirlediğiniz kullanıcı adı ve şifreyle giriş yapabilirsiniz.</div>
      <div class="fgroup"><label class="flbl">Ad Soyad</label><input class="finput" id="ht-ad" placeholder="Ad Soyad"></div>
      <div class="fgroup"><label class="flbl">E-posta</label><input class="finput" id="ht-email" type="email" placeholder="ornek@sirket.com"></div>
      <div class="fgroup"><label class="flbl">Birim / Rol</label>
        <select class="fselect" id="ht-rol">${rolSecenekleri.map(r => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}</select>
      </div>
      <div class="fgroup"><label class="flbl">Şifre</label><input class="finput" id="ht-sifre" type="password" placeholder="En az 10 karakter, büyük/küçük harf ve rakam"></div>
      <div class="fgroup"><label class="flbl">Şifre (Tekrar)</label><input class="finput" id="ht-sifre2" type="password" placeholder="Şifreyi tekrar girin"></div>
      <div id="ht-hata" style="color:var(--red-text);font-size:12px;display:none"></div>`;
    openModal({
      title: 'Hesap Talep Et', body,
      footer: '<button class="btn" id="ht-vazgec">Vazgeç</button><button class="btn btn-blue" id="ht-gonder">Talebi Gönder</button>'
    });
    document.getElementById('ht-vazgec').onclick = closeModal;
    document.getElementById('ht-gonder').onclick = async () => {
      const ad = document.getElementById('ht-ad').value.trim();
      const email = document.getElementById('ht-email').value.trim();
      const rol = document.getElementById('ht-rol').value;
      const sifre = document.getElementById('ht-sifre').value;
      const sifre2 = document.getElementById('ht-sifre2').value;
      const hataEl = document.getElementById('ht-hata');
      const hataGoster = (msg) => { hataEl.textContent = msg; hataEl.style.display = 'block'; };
      hataEl.style.display = 'none';
      if (!ad) return hataGoster('Ad soyad zorunlu.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return hataGoster('Geçerli bir e-posta adresi girin.');
      if (sifre.length < 10 || !/[a-z]/.test(sifre) || !/[A-Z]/.test(sifre) || !/[0-9]/.test(sifre)) {
        return hataGoster('Şifre en az 10 karakter olmalı; büyük harf, küçük harf ve rakam içermeli.');
      }
      if (sifre !== sifre2) return hataGoster('Şifreler eşleşmiyor.');
      const btn = document.getElementById('ht-gonder');
      btn.disabled = true; btn.textContent = 'Gönderiliyor…';
      const sonuc = await Store.hesapTalepEt({ ad, email, rol, sifre });
      btn.disabled = false; btn.textContent = 'Talebi Gönder';
      if (!sonuc.ok) return hataGoster(sonuc.error || 'Talep gönderilemedi.');
      closeModal();
      toast('Talebiniz alındı — yönetici onayı bekleniyor.', 'ok');
    };
  }

  // Eski renderRoleSelector → artık giriş ekranı açar
  function renderRoleSelector() { renderLoginScreen(); }

  // ── HAT TERMİNALİ BAĞIMSIZ (STANDALONE) MOD ──────────────────────────────
  // Operatör, ÜretimOS'a rol girişi yapmadan ana giriş ekranındaki
  // "Hat Operatör Terminali" tuşuyla doğrudan terminale girer. Sidebar ve
  // diğer sayfalara ERİŞİM YOKTUR; sadece terminal görünür. Sayfa yenilenirse
  // sessionStorage'daki işaret sayesinde terminalde kalır.
  const HAT_STANDALONE_KEY = 'uretimos_hat_standalone';
  async function hatTerminalStandaloneAc() {
    try { window.sessionStorage.setItem(HAT_STANDALONE_KEY, '1'); } catch (e) {}
    document.getElementById('sidebar').innerHTML = '';
    document.getElementById('sidebar').style.display = 'none';
    try { document.getElementById('breadcrumb').innerHTML = '<b>Hat Operatör Terminali</b>'; } catch (e) {}
    const main = document.getElementById('main');
    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <button class="btn btn-sm" id="hts-geri">← Ana Giriş Ekranı</button>
        <span style="font-size:10.5px;color:var(--text3)">Operatör modu — yalnızca hat terminali</span>
      </div>
      <div id="hts-icerik"><div style="padding:60px;text-align:center"><div class="loading-spin" style="margin:0 auto"></div></div></div>`;
    document.getElementById('hts-geri').onclick = () => hatTerminalStandaloneKapat();
    try {
      const mod = PageModules.hat_terminal;
      if (mod && mod.render) {
        await mod.render(document.getElementById('hts-icerik'));
        try { I18N.tumSayfayiCevir(); setTimeout(() => I18N.tumSayfayiCevir(), 200); } catch (e) {}
      }
    } catch (e) {
      console.error(e);
      document.getElementById('hts-icerik').innerHTML = `<div class="empty-state"><div class="eicon">⚠</div><div class="etitle">Bir hata oluştu</div><div class="edesc">${escapeHtml(e.message || String(e))}</div></div>`;
    }
  }
  function hatTerminalStandaloneKapat() {
    try { window.sessionStorage.removeItem(HAT_STANDALONE_KEY); } catch (e) {}
    try { window.sessionStorage.removeItem('uretimos_hat_oturum'); } catch (e) {}
    try { if (Store.oturumVarMi && Store.oturumVarMi()) Store.logout(); } catch (e) {}
    renderLoginScreen();
  }

  function selectRole(roleId, kullanici) {
    state.role = roleId;
    state.kullanici = kullanici || null;
    try { window.sessionStorage.setItem(ROLE_STORAGE_KEY, roleId); } catch (e) {}
    try { if (kullanici) window.sessionStorage.setItem('uretimos_kullanici', JSON.stringify(kullanici)); } catch (e) {}
    // Girişten önce (oturumsuz) yapılamayan seed/migrasyonlar şimdi token ile
    // yeniden denenir — arka planda çalışır, ekranı bloklamaz.
    baslangicHazirliklari().catch(e => console.error('Başlangıç hazırlıkları:', e));
    document.getElementById('sidebar').style.display = '';
    // ── GİRİŞ SONRASI BİLDİRİM TARAMASI (mobilde ERTELENİR) ────────────────
    // AiDenetci.tara() tüm KPI'ları ve koleksiyonları işler; masaüstünde bir
    // iki saniye sürer ama TELEFONDA onlarca saniye sürüp arayüzü kilitler
    // (panel çizilir, sonra hiçbir dokunuş işlenmez). Mobilde otomatik tarama
    // yapılmaz; kullanıcı 🔔 bildirim merkezini açtığında zaten taze tarama
    // çalışıyor. Böylece bilgi kaybı olmadan kilitlenme ortadan kalkar.
    const _darEkran = (typeof window !== 'undefined') &&
      (window.innerWidth <= 768 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || ''));
    if (!_darEkran) {
      setTimeout(() => { try { bildirimleriTazele(); } catch (e) {} }, 1500);
    } else {
      // Mobilde yalnızca rozet sayısı okunur (hafif) — tam tarama yapılmaz.
      setTimeout(async () => {
        try {
          const mevcut = await Store.bildirimler.all();
          bildirimRozetiGuncelle(mevcut.filter(x => !x.okundu).length);
        } catch (e) { }
      }, 1500);
    }
    renderSidebar();
    // Giriş sonrası rolün erişebildiği İLK sayfaya yönlendir (dashboard'a
    // yetkisi olmayan roller — örn. satis — kendi ilk ekranına gider).
    let girisSayfasi = 'dashboard';
    if (!sayfayaErisebilir('dashboard', state.role)) {
      for (const grp of PAGES) {
        const it = grp.items.find(x => !x.roller || x.roller.includes(state.role));
        if (it) { girisSayfasi = it.id; break; }
      }
    }
    goTo(girisSayfasi);
  }

  function switchRole() {
    try { Store.logout(); } catch (e) {} // sunucu sürümünde token'ı geçersiz kılar
    try { window.sessionStorage.removeItem(ROLE_STORAGE_KEY); } catch (e) {}
    try { window.sessionStorage.removeItem('uretimos_kullanici'); } catch (e) {}
    state.role = null;
    state.kullanici = null;
    document.getElementById('sidebar').style.display = 'none';
    renderLoginScreen();
  }

  // Sunucu sürümünde oturum süresi dolduğunda (API 401) storage.js bu
  // event'i yayınlar — kullanıcıyı giriş ekranına döndürürüz.
  window.addEventListener('uretimos:oturum-dustu', () => {
    try { window.sessionStorage.removeItem(ROLE_STORAGE_KEY); } catch (e) {}
    try { window.sessionStorage.removeItem('uretimos_kullanici'); } catch (e) {}
    state.role = null;
    state.kullanici = null;
    toast('Oturum süresi doldu — lütfen tekrar giriş yapın', 'err');
    document.getElementById('sidebar').style.display = 'none';
    // Operatör (standalone) modunda ana giriş yerine terminal giriş ekranına dön.
    // DÖNGÜ KORUMASI: terminal ekranı çizilirken tekrar 401 gelirse (örn.
    // yanlış yapılandırılmış sunucu) art arda yeniden çizim yapılmaz.
    let hatStandalone = null;
    try { hatStandalone = window.sessionStorage.getItem('uretimos_hat_standalone'); } catch (e) {}
    if (hatStandalone === '1') {
      const simdi = Date.now();
      if (window._hatStandaloneSonYenileme && simdi - window._hatStandaloneSonYenileme < 3000) return;
      window._hatStandaloneSonYenileme = simdi;
      try { window.sessionStorage.removeItem('uretimos_hat_oturum'); } catch (e) {}
      hatTerminalStandaloneAc();
    } else {
      renderLoginScreen();
    }
  });

  function currentRoleLabel() {
    const r = ROLLER.find(x => x.id === state.role);
    return r ? r.label : '';
  }

  // Sidebar grup başlıklarının açık/kapalı hali — bölümleri bulmayı
  // kolaylaştırmak için AKORDEON: her grup başlığına tıklayınca kendi
  // öğeleri açılıp kapanır. Tercih tarayıcıda kalıcıdır (localStorage).
  function sidebarKapaliGruplariOku() {
    try { return new Set(JSON.parse(localStorage.getItem('uretimos_sidebar_kapali') || '[]')); }
    catch (e) { return new Set(); }
  }
  function sidebarKapaliGruplariYaz(set) {
    try { localStorage.setItem('uretimos_sidebar_kapali', JSON.stringify([...set])); } catch (e) {}
  }

  function renderSidebar() {
    const el = document.getElementById('sidebar');
    el.innerHTML = '';
    const kapaliGruplar = sidebarKapaliGruplariOku();
    PAGES.forEach(grp => {
      const visibleItems = grp.items.filter(it => !it.roller || it.roller.includes(state.role));
      if (!visibleItems.length) return;
      // Aktif sayfanın grubu, kullanıcı elle kapatmış olsa bile AÇIK
      // gösterilir — yoksa "neredeyim" görünmez olur.
      const aktifBuGrupta = visibleItems.some(it => it.id === state.page);
      const kapali = kapaliGruplar.has(grp.group) && !aktifBuGrupta;
      const g = document.createElement('div');
      g.className = 'nav-group' + (kapali ? ' collapsed' : '');
      g.innerHTML = `<div class="nav-group-lbl"><span>${escapeHtml(I18N.t(grp.group))}</span><span class="nav-group-chev">▶</span></div>`;
      g.querySelector('.nav-group-lbl').onclick = () => {
        const simdiKapali = g.classList.toggle('collapsed');
        const set = sidebarKapaliGruplariOku();
        if (simdiKapali) set.add(grp.group); else set.delete(grp.group);
        sidebarKapaliGruplariYaz(set);
      };
      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'nav-group-items';
      visibleItems.forEach(it => {
        const a = document.createElement('div');
        a.className = 'nav-item' + (state.page === it.id ? ' active' : '');
        a.dataset.page = it.id;
        // İkon: projeye özel SVG seti (ikon.js). Set'te yoksa eski simgeye düşer.
        const nikon = (typeof Ikon !== 'undefined' && Ikon.menu(it.id)) || escapeHtml(it.icon || '');
        a.innerHTML = `<span class="nico">${nikon}</span><span>${escapeHtml(I18N.t(it.label))}</span>`;
        a.onclick = () => { closeMobileMenuIfOpen(); goTo(it.id); };
        itemsWrap.appendChild(a);
      });
      g.appendChild(itemsWrap);
      el.appendChild(g);
    });
    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top:auto;padding:12px 16px;border-top:1px solid var(--border)';
    const cikisEtiket = Store.sunucuModu ? I18N.t('Çıkış Yap') : I18N.t('Departman Değiştir');
    const cikisIkon = Store.sunucuModu ? '🚪' : '🔄';
    footer.innerHTML = `
      <div style="font-size:9.5px;color:var(--text3);text-transform:uppercase;font-weight:800;letter-spacing:.05em;margin-bottom:4px">${I18N.t('Aktif Kullanıcı') || 'Aktif Kullanıcı'}</div>
      <div style="font-size:12px;font-weight:700;margin-bottom:2px">${escapeHtml(state.kullanici ? state.kullanici.ad : currentRoleLabel())}</div>
      <div style="font-size:10.5px;color:var(--text3);margin-bottom:8px">${escapeHtml(currentRoleLabel())}</div>
      <button class="btn btn-sm" id="btn-switch-role" style="width:100%">${cikisIkon} ${cikisEtiket}</button>
    `;
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.appendChild(footer);
    document.getElementById('btn-switch-role').onclick = switchRole;
  }

  // ── GEZİNME KİLİDİ (mobil kilitlenme çözümü) ─────────────────────────────
  // Telefonlarda bir sayfanın çizimi saniyeler sürebiliyor. Kullanıcı beklerken
  // başka bir menü öğesine bastığında İKİNCİ çizim birincinin üstüne biniyor;
  // iki ağır render aynı anda çalışınca cihaz kilitleniyordu (masaüstünde
  // render hızlı bittiği için çakışma oluşmuyor — sorunun mobile özel olması
  // bundandı). Aşağıdaki kilit: bir çizim sürerken gelen istekler ARAYA
  // ALINIR, mevcut çizim bitince yalnızca EN SON istenen sayfa çizilir.
  let _gezinmeCalisiyor = false;
  let _bekleyenGezinme = null;

  async function goTo(pageId, params) {
    if (_gezinmeCalisiyor) {
      _bekleyenGezinme = { pageId, params };   // son istek kazanır
      // Kullanıcı "hiçbir şey olmuyor" sanmasın: menüyü kapat ve haber ver.
      try {
        closeMobileMenuIfOpen();
        toast('Önceki sayfa yükleniyor — bitince ' + pageId + ' açılacak.', 'ok');
      } catch (e) { }
      return;
    }
    _gezinmeCalisiyor = true;
    try {
      await goToIc(pageId, params);
    } finally {
      _gezinmeCalisiyor = false;
      if (_bekleyenGezinme) {
        const sonraki = _bekleyenGezinme;
        _bekleyenGezinme = null;
        // Tarayıcıya nefes aldır: arayüz donmasın, dokunuşlar işlensin
        setTimeout(() => goTo(sonraki.pageId, sonraki.params), 0);
      }
    }
  }

  async function goToIc(pageId, params) {
    // Açık bir modal varken sayfa navigasyonu yapılırsa, modal-root DOM'da
    // kalıp (yüksek z-index nedeniyle) yeni sayfanın İÇERİĞİNİN ÖNÜNDE/
    // ÜSTÜNDE kalabilir — bu da "seçim ekranı arkada kaldı" görünümüne yol
    // açar. Bu yüzden her route değişiminde önce kalıntı modal temizlenir.
    // .app-embed-overlay: page_rota.js gibi modüllerin kendi (modal-root
    // DIŞINDA, body'ye eklenen) embed pencereleri için kullanılan ortak
    // işaret class'ı — bunlar da aynı şekilde temizlenmelidir.
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot && modalRoot.innerHTML.trim()) modalRoot.innerHTML = '';
    document.querySelectorAll('.app-embed-overlay').forEach(el => el.remove());

    // ── ROL YETKİ KONTROLÜ ─────────────────────────────────────────────────
    // Kullanıcı yetkisi olmayan bir sayfaya (URL/kod ile) gitmeye çalışırsa
    // ERİŞİM TAMAMEN KAPALIDIR: kendi biriminin ilk sayfasına yönlendirilir.
    if (state.role && !sayfayaErisebilir(pageId)) {
      toast('Bu ekrana erişim yetkiniz yok (' + currentRoleLabel() + ')', 'err');
      // rolün erişebildiği ilk sayfayı bul
      let ilkSayfa = null;
      for (const grp of PAGES) {
        const it = grp.items.find(x => !x.roller || x.roller.includes(state.role));
        if (it) { ilkSayfa = it.id; break; }
      }
      if (ilkSayfa && ilkSayfa !== pageId) return goTo(ilkSayfa);
      return;
    }

    state.page = pageId;
    state.cache.params = params || null;
    // DENETİM: hangi kullanıcının hangi BİRİM/SAYFAYI ziyaret ettiği kaydedilir
    // (sunucu sürümünde; IP ve tarayıcı bilgisi sunucu tarafında eklenir).
    if (Store.sayfaZiyaretiKaydet) {
      const grup = (PAGES.find(g => g.items.some(i => i.id === pageId)) || {}).group || '';
      Store.sayfaZiyaretiKaydet(pageId, grup);
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === pageId));
    const main = document.getElementById('main');
    main.innerHTML = '<div style="padding:60px;text-align:center"><div class="loading-spin" style="margin:0 auto"></div></div>';
    setBreadcrumb(pageId);
    try {
      const mod = PageModules[pageId];
      if (mod && mod.render) {
        // TEŞHİS: sayfa çizimi uzun sürerse (telefonda kilitlenme hissi) uyar.
        const _t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        await mod.render(main, params);
        const _sure = ((window.performance && performance.now) ? performance.now() : Date.now()) - _t0;
        if (_sure > 1500) {
          console.warn('[ÜretimOS] YAVAŞ SAYFA: ' + pageId + ' — ' + Math.round(_sure) + ' ms');
          toast('Bu sayfa yavaş açıldı (' + Math.round(_sure / 100) / 10 + ' sn): ' + pageId, 'err');
        }
        // Sayfa çizildikten sonra KESİN çeviri (MutationObserver'a ek güvence:
        // geç/asenkron çizilen bölümler de İngilizceye çevrilir)
        try {
          I18N.tumSayfayiCevir();
          setTimeout(() => I18N.tumSayfayiCevir(), 120);
          setTimeout(() => I18N.tumSayfayiCevir(), 600);
        } catch (e) {}
      } else {
        // MODÜL BULUNAMADI. En sık sebep: dosya sunucuya YÜKLENMEMİŞ (404).
        // "Sayfa hazırlanıyor" demek kullanıcıya hiçbir şey anlatmıyordu;
        // gerçek sebebi ölçüp söylüyoruz.
        main.innerHTML = `<div class="empty-state"><div class="eicon">◌</div>
          <div class="etitle">Sayfa hazırlanıyor</div>
          <div class="edesc" id="sayfa-teshis" style="margin-top:8px"></div></div>`;
        (async () => {
          const h = document.getElementById('sayfa-teshis');
          if (!h) return;
          // index.html'de bu sayfaya ait script var mı, sunucuda duruyor mu?
          const etiketler = [...document.querySelectorAll('script[src]')]
            .map(x => x.getAttribute('src'))
            .filter(x => /page_/.test(x) && x.includes(String(pageId)));
          if (!etiketler.length) {
            h.innerHTML = '<span style="color:var(--amber-text)">Bu sayfanın dosyası ' +
              'index.html\'de tanımlı değil.</span>';
            return;
          }
          let eksik = [];
          for (const yol of etiketler) {
            try {
              const r = await fetch(yol, { method: 'HEAD', cache: 'no-store' });
              if (!r.ok) eksik.push(yol.split('?')[0] + ' (HTTP ' + r.status + ')');
            } catch (e) { eksik.push(yol.split('?')[0] + ' (erişilemedi)'); }
          }
          if (eksik.length) {
            h.innerHTML = '<b style="color:var(--red-text)">Dosya sunucuda bulunamadı:</b><br>' +
              eksik.map(x => '<span class="mono" style="font-size:11px">' + escapeHtml(x) + '</span>').join('<br>') +
              '<br><span style="font-size:12px">Dağıtım paketini <b>tamamen</b> yükleyin ' +
              '(sadece değişen dosyaları değil), sonra sayfayı yenileyin.</span>';
          } else {
            h.innerHTML = '<span style="color:var(--amber-text)">Dosya sunucuda var ama modül ' +
              'yüklenmedi — eski sürüm önbellekte olabilir. Ctrl+Shift+R ile yenileyin.</span>';
          }
        })();
      }
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="empty-state"><div class="eicon">⚠</div><div class="etitle">Bir hata oluştu</div><div class="edesc">${escapeHtml(e.message || String(e))}</div></div>`;
    }
  }

  function setBreadcrumb(pageId) {
    const labels = {
      dashboard: 'Panel', hammadde: 'Hammaddeler', yarimamul: 'Yarı Mamüller',
      rota: 'Hat & Rota Yönetimi', isemri: 'İş Emirleri', nesting: 'Kesim Optimizasyonu',
      kartlar: 'Ürün Kartları & Reçete', fiyat: 'Maliyet & Liste Fiyatı',
      satinalma_panel: 'Satınalma Paneli', acik_satinalma_siparisleri: 'Açık Satınalma Siparişleri', tedarikci_teklif: 'Teklif Karşılaştırma',
      uretim_panel: 'Üretim Planlama Paneli', depo_panel: 'Depo Stok & Düşüm',
      teklif: 'Satış ve Siparişler', siparis: 'Siparişler',
      cari_panel: 'Müşteri Cari Kartları', sevkiyat_panel: 'Sevkiyat & İrsaliye',
      onaylar: 'Onay Bekleyenler', kalem_secici: 'Kalem Seç', cari_secici: 'Cari Kart Seç', yonetim_raporlama: 'Yönetim Raporlama', ust_yonetim_kokpit: 'Üst Yönetim Kokpiti', muhasebe_panel: 'Muhasebe',
      bakim_panel: 'Makina & Teçhizat Bakım', kalite_panel: 'Kalite Kontrol', uygunsuzluk_dof: 'Uygunsuzluk & DÖF', iade_ambari: 'İade / 2. Kalite Ambarı', uretim_ekrani: 'Üretim Ekranı', hat_takip: 'Hat & İstasyon Takibi', cizelge: 'Üretim Çizelgesi', qr_etiket: 'QR Etiket Merkezi', mrp: 'MRP — Malzeme İhtiyaç Planlaması', kpi_panel: 'KPI Paneli & AI Denetçisi', analitik: 'Analitik Raporlar', isg: 'İş Sağlığı ve Güvenliği', cek_portfoy: 'Çek & Senet Portföyü', efatura: 'e-Fatura / e-Arşiv', servis: 'Satış Sonrası Servis', operasyon: 'Operasyon Yönetimi', hat_terminal: 'Hat Operatör Terminali', yukleme_onay: 'Sevkiyat Yükleme Onayı', ik_personel: 'Personel & Özlük', ik_izin: 'İzin Takibi',
      ik_tazminat: 'Kıdem & İhbar Tazminatı', ik_bordro: 'Bordro & Ücret', ik_arac: 'Araç & Zimmet'
    };
    document.getElementById('breadcrumb').innerHTML = `<b>${labels[pageId] || pageId}</b>`;
  }

  // ── KAYIT GÖSTERGESİ ─────────────────────────────────────────────────────
  let saveTimer = null;
  // ── DİNAMİK Z-INDEX KATMAN SAYACI ──────────────────────────────────────────
  // Sistemde iki tür "pencere" var: (1) standart openModal (#modal-root, tek
  // katmanlı — her çağrı öncekinin İÇİNE yazılır, üst üste açılmaz), (2) Rota
  // ekranının kendi embed penceresi (page_rota.js, body'ye ayrı eklenir, çünkü
  // içinden açılan süre/miktar formları #modal-root kullanır ve eğer Rota da
  // #modal-root kullansaydı birbirini silerlerdi). Bu iki pencere türü İÇ İÇE
  // (sihirbaz içinden rota açma, rota içinden süre formu açma) açılabildiği
  // için SABİT bir z-index sırası YETERSİZ KALIR — hangi pencerenin daha SONRA
  // açıldığı önemlidir, o her zaman daha üstte görünmelidir. Bu yüzden her
  // pencere açılışında bu sayaçtan YENİ ve DAHA YÜKSEK bir z-index alınır.
  let zIndexSayaci = 10000;
  function yeniZIndexAl() { return ++zIndexSayaci; }
  function showSaveIndicator(mode) {
    const ind = document.getElementById('save-indicator');
    const txt = document.getElementById('save-text');
    if (mode === 'loading') { ind.classList.add('saving'); txt.textContent = 'Yükleniyor…'; }
    else if (mode === 'saving') { ind.classList.add('saving'); txt.textContent = 'Kaydediliyor…'; }
    else { ind.classList.remove('saving'); txt.textContent = 'Kayıtlı'; }
  }
  async function persist(fn) {
    showSaveIndicator('saving');
    try { return await fn(); } finally {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => showSaveIndicator('ok'), 250);
    }
  }

  // ── TOAST ────────────────────────────────────────────────────────────────
  // Toast akış koruması: aynı mesajın tekrarı ve aşırı birikme engellenir.
  // Bir hata döngüye girerse sınırsız toast üretilirse DOM şişer ve özellikle
  // telefonda sayfa kilitlenir — bu koruma onu önler.
  const _toastGecmis = new Map();   // mesaj -> son gösterim zamanı
  const TOAST_AYNI_MESAJ_BEKLEME = 4000;   // ms
  const TOAST_AZAMI_ADET = 4;              // ekranda aynı anda

  function toast(msg, type) {
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    const simdi = Date.now();
    // Aynı mesaj kısa süre içinde tekrar ediyorsa gösterme (döngü koruması)
    const son = _toastGecmis.get(msg);
    if (son && (simdi - son) < TOAST_AYNI_MESAJ_BEKLEME) return;
    _toastGecmis.set(msg, simdi);
    if (_toastGecmis.size > 50) _toastGecmis.clear();
    // Ekranda çok fazla toast varsa en eskisini kaldır
    while (wrap.children.length >= TOAST_AZAMI_ADET) wrap.removeChild(wrap.firstChild);
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'err' ? ' err' : type === 'ok' ? ' ok' : '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
  }

  // ── MODAL ────────────────────────────────────────────────────────────────
  // ── MODAL YIĞINI (STACK) ────────────────────────────────────────────────
  // ÖNEMLİ MİMARİ NOT: openModal ARTIK önceki modal içeriğini SİLMEZ — yeni
  // bir overlay'i #modal-root'un İÇİNE EKLER (üst üste yığılır). Önceden
  // `root.innerHTML = ...` kullanılıyordu; bu, halihazırda açık bir modal
  // (örn. Sıfırdan Ürün sihirbazı) varken İÇİNDEN yeni bir openModal çağrısı
  // (örn. Rota penceresinin kendi süre formu) yapıldığında, ÖNCEKİ modal'ın
  // DOM elementini (ve içindeki tüm form state'ini) TAMAMEN SİLİYORDU — bu da
  // "sihirbaz adım 3 kayboluyor, Ürünü Oluştur'a basamıyorum" sorununa yol
  // açıyordu. Artık her açılan modal kendi <div class="modal-overlay"> öğesini
  // alır, kapatıldığında SADECE kendi öğesini kaldırır, altındaki (varsa)
  // önceki modal DOM'da sapasağlam kalmış olur ve tekrar görünür.
  let modalSayaci = 0;
  function openModal({ title, sub, body, footer, wide, xwide, onClose }) {
    const root = document.getElementById('modal-root');
    const z = yeniZIndexAl();
    const modalId = 'ov-modal-' + (++modalSayaci);
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-overlay show';
    wrapper.id = modalId;
    wrapper.style.zIndex = z;
    wrapper.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''} ${xwide ? 'xwide' : ''}">
        <div class="modal-hdr">
          <div><div class="modal-title">${title}</div>${sub ? `<div class="modal-sub">${sub}</div>` : ''}</div>
          <button class="modal-x" id="btn-modal-x-${modalSayaci}">✕</button>
        </div>
        <div class="modal-body" id="modal-body-slot-${modalSayaci}"></div>
        ${footer ? `<div class="modal-ftr" id="modal-ftr-slot-${modalSayaci}"></div>` : ''}
      </div>`;
    root.appendChild(wrapper);
    const bodySlot = document.getElementById('modal-body-slot-' + modalSayaci);
    if (typeof body === 'string') bodySlot.innerHTML = body; else bodySlot.appendChild(body);
    if (footer) {
      const ftrSlot = document.getElementById('modal-ftr-slot-' + modalSayaci);
      if (typeof footer === 'string') ftrSlot.innerHTML = footer; else ftrSlot.appendChild(footer);
    }
    const close = () => { wrapper.remove(); if (onClose) onClose(); };
    document.getElementById('btn-modal-x-' + modalSayaci).onclick = close;
    wrapper.addEventListener('mousedown', e => { if (e.target === wrapper) close(); });
    return close;
  }
  // En üstteki (en son açılan) modal'ı kapatır — yığın mantığıyla çalışır,
  // altında başka modal varsa (örn. sihirbaz) o etkilenmez, görünür kalır.
  function closeModal() {
    const root = document.getElementById('modal-root');
    const hepsi = root.querySelectorAll('.modal-overlay');
    if (hepsi.length) hepsi[hepsi.length - 1].remove();
  }

  // Kriptografik olarak güvenli (crypto.getRandomValues) 12 haneli şifre —
  // sunucudaki guvenliRastgeleSifreUret() ile AYNI karakter sınıfı kuralı.
  function guclutSifreUret() {
    const buyuk = 'ABCDEFGHJKLMNPQRSTUVWXYZ', kucuk = 'abcdefghijkmnpqrstuvwxyz', rakam = '23456789', ozel = '!@#$%&*';
    const havuz = buyuk + kucuk + rakam + ozel;
    const rastgele = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
    const arr = [rastgele(buyuk), rastgele(kucuk), rastgele(rakam), rastgele(ozel)];
    for (let i = 0; i < 8; i++) arr.push(rastgele(havuz));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      const gecici = arr[i]; arr[i] = arr[j]; arr[j] = gecici;
    }
    return arr.join('');
  }

  // Yeni üretilen şifreleri TEK SEFERLİK gösteren reveal modalı — kopyalama
  // kolaylığı dışında hiçbir yerde (localStorage/log) tutulmaz; modal
  // kapatıldığında şifreler bir daha görüntülenemez.
  function sifreleriGosterModal(liste) {
    const metin = liste.map(x => `${x.kullaniciAdi}\t${x.sifre}`).join('\n');
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="border:1.5px solid var(--red);background:var(--red-bg);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:11.5px;color:var(--red-text)">
        ⚠ Bu şifreler <b>yalnızca burada, bir kez</b> gösteriliyor — kapattıktan sonra bir daha görüntülenemez. İlgili kişilere hemen iletin.
      </div>
      <table class="dtable" style="font-size:12px">
        <tr><th>Kullanıcı Adı</th><th>Birim / Ad</th><th>Yeni Şifre</th></tr>
        ${liste.map(x => `<tr><td class="mono"><b>${escapeHtml(x.kullaniciAdi)}</b></td><td>${escapeHtml(x.ad || '')}</td><td class="mono">${escapeHtml(x.sifre)}</td></tr>`).join('')}
      </table>`;
    openModal({
      title: '🔑 Yeni Şifreler', body, wide: true,
      footer: '<button class="btn" id="sg-kopyala">📋 Tümünü Kopyala</button><button class="btn btn-blue" id="sg-kapat">Kapat</button>'
    });
    document.getElementById('sg-kapat').onclick = closeModal;
    document.getElementById('sg-kopyala').onclick = async () => {
      try { await navigator.clipboard.writeText(metin); toast('Panoya kopyalandı', 'ok'); }
      catch (e) { toast('Kopyalanamadı — elle seçip kopyalayın', 'err'); }
    };
  }

  // ── AYARLAR MODALI ───────────────────────────────────────────────────────
  // ── ŞİFRE YÖNETİMİ (Sadece Üst Yönetim) ─────────────────────────────────
  async function openSifreYonetimiModal() {
    const kullaniciler = await Store.kullaniciler.all();
    const body = document.createElement('div');
    // GÜVENLİK NOTU: Şifreler (sunucuda bcrypt hash olarak) saklandığından
    // mevcut şifreler GÖSTERİLEMEZ — sadece yeni şifre atanabilir ya da
    // güçlü rastgele bir şifreyle değiştirilebilir (tahmin edilebilir
    // [kullanıcıadı]1234 varsayılanı artık kullanılmıyor).
    const renderKullaniciler = () => {
      body.innerHTML = `
        <div class="fhint" style="margin-bottom:12px">Güvenlik gereği mevcut şifreler görüntülenemez. Yeni şifre yazıp kaydedin (en az 10 karakter, büyük/küçük harf ve rakam) ya da ⟳ ile güçlü rastgele bir şifre üretin.</div>
        <div style="margin-bottom:16px">
          <button class="btn btn-sm" id="sy-sifirla-hepsi" style="background:#EF4444;color:#fff;border:none">⟳ Tüm Şifreleri Güçlü Rastgele Şifrelerle Yenile</button>
          <span style="font-size:11px;color:var(--text3);margin-left:8px">Her kullanıcı için ayrı, tahmin edilemeyen bir şifre üretilir</span>
        </div>
        <table class="dtable" style="font-size:12px">
          <tr><th>Kullanıcı Adı</th><th>Birim / Ad</th><th>Yeni Şifre (boş = değişmez)</th><th></th></tr>
          ${kullaniciler.map((k, i) => `<tr>
            <td class="mono"><b>${escapeHtml(k.kullaniciAdi)}</b></td>
            <td>${escapeHtml(k.ad || k.rol)}</td>
            <td><input class="finput sy-sifre" data-i="${i}" type="text" placeholder="••••••••" style="font-size:11px;padding:4px 8px;font-family:monospace;width:180px"></td>
            <td><button class="btn btn-sm btn-ghost sy-varsayilan" data-i="${i}" title="Güçlü rastgele şifre üret">⟳</button></td>
          </tr>`).join('')}
        </table>
      `;
      body.querySelector('#sy-sifirla-hepsi').onclick = async () => {
        try {
          const yeniSifreler = await Store.sifreleriSifirla();
          sifreleriGosterModal(yeniSifreler);
        } catch (e) { toast('Hata: ' + e.message, 'err'); }
      };
      body.querySelectorAll('.sy-varsayilan').forEach(b => b.onclick = async () => {
        const i = parseInt(b.dataset.i);
        const yeni = guclutSifreUret();
        try {
          await Store.sifreDegistir(kullaniciler[i].id, yeni);
          sifreleriGosterModal([{ kullaniciAdi: kullaniciler[i].kullaniciAdi, ad: kullaniciler[i].ad, sifre: yeni }]);
        } catch (e) { toast('Hata: ' + e.message, 'err'); }
      });
    };
    renderKullaniciler();
    const footer = `<button class="btn" id="sy-cancel">Vazgeç</button><button class="btn btn-blue" id="sy-kaydet">Şifreleri Kaydet</button>`;
    openModal({ title: '🔑 Kullanıcı Şifre Yönetimi', body, footer, wide: true });
    document.getElementById('sy-cancel').onclick = closeModal;
    document.getElementById('sy-kaydet').onclick = async () => {
      let degisen = 0, hata = 0;
      for (const inp of body.querySelectorAll('.sy-sifre')) {
        const i = parseInt(inp.dataset.i);
        const yeniSifre = inp.value.trim();
        if (!yeniSifre) continue;
        try { await Store.sifreDegistir(kullaniciler[i].id, yeniSifre); degisen++; }
        catch (e) { hata++; toast(kullaniciler[i].kullaniciAdi + ': ' + e.message, 'err'); }
      }
      if (degisen) toast(degisen + ' şifre güncellendi', 'ok');
      else if (!hata) toast('Değiştirilecek şifre girilmedi', 'err');
      if (!hata) closeModal();
    };
  }

  // ── HESAP TALEPLERİ (e-posta ile kayıt onayı, Sadece Üst Yönetim) ───────
  // Giriş ekranındaki "Hesap Talep Et" formundan gelen bekleyen talepleri
  // onaylar/reddeder. Onaylanan talep, kullanıcının BAŞVURU SIRASINDA
  // belirlediği şifreyle (yalnızca hash'i taşınarak) gerçek bir hesaba
  // dönüşür — yönetim düz metin şifreyi hiç görmez/atamaz.
  async function openHesapTalepleriModal() {
    const ROL_ETIKET = {}; ROLLER.forEach(r => { ROL_ETIKET[r.id] = r.label; });
    const talepler = await Store.hesapTalepleri.all();
    const bekleyenler = talepler.filter(t => t.durum === 'bekliyor').sort((a, b) => (b.zaman || '').localeCompare(a.zaman || ''));
    const kararliler = talepler.filter(t => t.durum !== 'bekliyor').sort((a, b) => (b.kararTarihi || '').localeCompare(a.kararTarihi || '')).slice(0, 20);

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="card-hdr"><div class="card-title">Bekleyen Talepler (${bekleyenler.length})</div></div>
      ${!bekleyenler.length ? '<div class="muted" style="font-size:11.5px;padding:8px 0 16px">Bekleyen hesap talebi yok.</div>' : `
      <table class="dtable" style="font-size:12px;margin-bottom:18px">
        <tr><th>Ad Soyad</th><th>E-posta</th><th>İstenen</th><th>Verilecek Rol</th><th>Tarih</th><th></th></tr>
        ${bekleyenler.map(t => `<tr>
          <td>${escapeHtml(t.ad || '')}</td>
          <td class="mono" style="font-size:10.5px">${escapeHtml(t.email || '')}</td>
          <td>${escapeHtml(ROL_ETIKET[t.rol] || t.rol || '')}</td>
          <td>
            <select class="fselect ht-rol-sec" data-id="${t.id}" style="font-size:11px;padding:3px 4px">
              ${ROLLER.filter(r => r.id !== 'admin').map(r => `<option value="${r.id}" ${r.id === t.rol ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
            </select>
          </td>
          <td class="mono" style="font-size:10.5px">${escapeHtml(t.tarih || '')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-green ht-onayla" data-id="${t.id}" style="padding:3px 8px;font-size:11px">✓ Onayla</button>
            <button class="btn btn-sm ht-reddet" data-id="${t.id}" style="padding:3px 8px;font-size:11px">✕ Reddet</button>
          </td>
        </tr>`).join('')}
      </table>
      <div class="fhint" style="margin-top:-10px;margin-bottom:16px">"Verilecek Rol" varsayılan olarak başvurunun kendi seçtiği rolle gelir — başvuru sahibi hiçbir zaman <b>Üst Yönetim</b>'i seçemez (kayıt formunda bu seçenek yoktur), ama siz onaylarken güvendiğiniz bir başvuruyu isterseniz buradan Üst Yönetim'e yükseltebilirsiniz.</div>`}
      ${kararliler.length ? `
      <div class="card-hdr"><div class="card-title">Son Kararlar</div></div>
      <table class="dtable" style="font-size:11px">
        <tr><th>Ad Soyad</th><th>E-posta</th><th>Birim/Rol</th><th>Durum</th><th>Kullanıcı Adı</th><th>Karar Tarihi</th></tr>
        ${kararliler.map(t => `<tr>
          <td>${escapeHtml(t.ad || '')}</td>
          <td class="mono" style="font-size:10px">${escapeHtml(t.email || '')}</td>
          <td>${escapeHtml(ROL_ETIKET[t.rol] || t.rol || '')}${t.atananRol ? ' → <b>' + escapeHtml(ROL_ETIKET[t.atananRol] || t.atananRol) + '</b>' : ''}</td>
          <td><span class="pill ${t.durum === 'onaylandi' ? 'pill-green' : 'pill-red'}" style="font-size:9px">${t.durum === 'onaylandi' ? 'Onaylandı' : 'Reddedildi'}</span></td>
          <td class="mono" style="font-size:10px">${escapeHtml(t.atananKullaniciAdi || '—')}</td>
          <td class="mono" style="font-size:10px">${escapeHtml(t.kararTarihi || '')}</td>
        </tr>`).join('')}
      </table>` : ''}
    `;
    openModal({ title: '👥 Hesap Talepleri', body, wide: true, footer: '<button class="btn" id="ht-kapat">Kapat</button>' });
    document.getElementById('ht-kapat').onclick = closeModal;
    body.querySelectorAll('.ht-onayla').forEach(b => b.onclick = async () => {
      const rolSec = body.querySelector('.ht-rol-sec[data-id="' + b.dataset.id + '"]');
      const secilenRol = rolSec ? rolSec.value : null;
      const talep = bekleyenler.find(t => t.id === b.dataset.id);
      const yukseltiliyor = talep && secilenRol && secilenRol !== talep.rol;
      const onayla = async () => {
        b.disabled = true;
        try {
          const sonuc = await Store.hesapTalepiKarar(b.dataset.id, 'onayla', secilenRol);
          toast('Hesap onaylandı — kullanıcı adı: ' + sonuc.kullaniciAdi, 'ok');
          closeModal(); openHesapTalepleriModal();
        } catch (e) { b.disabled = false; toast('Hata: ' + e.message, 'err'); }
      };
      if (yukseltiliyor) {
        confirmDialog(`${escapeHtml(talep.ad || '')} başvurusu <b>${escapeHtml(ROL_ETIKET[talep.rol] || talep.rol)}</b> istemişti — onu <b>${escapeHtml(ROL_ETIKET[secilenRol] || secilenRol)}</b> rolüyle onaylamak üzeresiniz. Emin misiniz?`, onayla);
      } else {
        onayla();
      }
    });
    body.querySelectorAll('.ht-reddet').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try {
        await Store.hesapTalepiKarar(b.dataset.id, 'reddet');
        toast('Talep reddedildi', 'ok');
        closeModal(); openHesapTalepleriModal();
      } catch (e) { b.disabled = false; toast('Hata: ' + e.message, 'err'); }
    });
  }

  // ── DENETİM KAYDI (sadece sunucu sürümü + yonetim) ─────────────────────────
  // ── GENİŞLETİLMİŞ DENETİM KAYDI ─────────────────────────────────────────
  // Üç sekme:
  //   1) Değişiklikler — kim, ne zaman, HANGİ IP'den, hangi rol/sayfadan neyi
  //      değiştirdi; her satır GERİ ALINABİLİR (değişiklik öncesi değer saklanır).
  //   2) Sayfa Ziyaretleri — kullanıcıların gezdiği birim/sayfalar + IP.
  //   3) Giriş Kayıtları — başarılı/başarısız oturum açmalar + IP.
  async function openDenetimKaydiModal(aktifSekme) {
    aktifSekme = aktifSekme || 'degisiklik';
    let rows, ziyaretler = [];
    try { rows = await Store.auditGetir(400); } catch (e) { toast('Denetim kaydı alınamadı: ' + e.message, 'err'); return; }
    if (rows === null) { toast('Denetim kaydı sadece sunucu (VPS) sürümünde tutulur', 'err'); return; }
    if (aktifSekme === 'ziyaret' && Store.ziyaretlerGetir) {
      try { ziyaretler = (await Store.ziyaretlerGetir(400)) || []; } catch (e) { ziyaretler = []; }
    }

    const islemAd = {
      giris: '🔑 Giriş', giris_basarisiz: '⚠ Başarısız giriş', yazma: '✏ Değişiklik', silme: '🗑 Silme',
      ilk_yazma: '➕ İlk kayıt', sifre_degistirme: '🔒 Şifre değişikliği', toplu_sifre_sifirlama: '🔒 Toplu şifre sıfırlama',
      ilk_kurulum_kullanicilar: 'Kurulum', eksik_kullanici_tamamlandi: 'Kurulum', geri_alma: '↩ GERİ ALMA'
    };
    const sayfaAd = (id) => {
      for (const g of PAGES) { const it = g.items.find(x => x.id === id); if (it) return it.label; }
      return id || '—';
    };
    const zamanYaz = (ts) => escapeHtml((ts || '').replace('T', ' ').slice(0, 19));

    const degisiklikler = rows.filter(r => ['yazma', 'silme', 'ilk_yazma', 'geri_alma', 'sifre_degistirme', 'toplu_sifre_sifirlama'].includes(r.islem));
    const girisler = rows.filter(r => r.islem === 'giris' || r.islem === 'giris_basarisiz');

    const body = document.createElement('div');
    let html = `<div class="tabs" style="margin-bottom:10px">
      <div class="tab dk-sekme ${aktifSekme === 'degisiklik' ? 'active' : ''}" data-s="degisiklik">✏ Değişiklikler (${degisiklikler.length})</div>
      <div class="tab dk-sekme ${aktifSekme === 'ziyaret' ? 'active' : ''}" data-s="ziyaret">👣 Sayfa Ziyaretleri</div>
      <div class="tab dk-sekme ${aktifSekme === 'giris' ? 'active' : ''}" data-s="giris">🔑 Giriş Kayıtları (${girisler.length})</div>
    </div>`;

    if (aktifSekme === 'degisiklik') {
      html += `<div class="fhint" style="margin-bottom:8px">Her değişikliğin <b>öncesi</b> sunucuda saklanır — "↩ Geri Al" ile o anki hâline döndürebilirsiniz. Geri alma işlemi de denetime yazılır (geri almayı da geri alabilirsiniz).</div>
        <div style="max-height:430px;overflow:auto">
        <table class="dtable" style="font-size:11px">
          <tr><th>Zaman</th><th>Kullanıcı</th><th>IP</th><th>Sayfa / Birim</th><th>İşlem</th><th>Veri</th><th class="r">Kayıt</th><th></th></tr>
          ${degisiklikler.map(r => `<tr${r.geri_alindi ? ' style="opacity:.6;background:var(--bg)"' : ''}>
            <td class="mono" style="white-space:nowrap;font-size:10px">${zamanYaz(r.ts)}</td>
            <td><b>${escapeHtml(r.kullanici)}</b>${r.rol ? `<br><span class="muted" style="font-size:9.5px">${escapeHtml(r.rol)}</span>` : ''}</td>
            <td class="mono" style="font-size:10px">${escapeHtml(r.ip || '—')}</td>
            <td style="font-size:10px">${escapeHtml(r.sayfa ? sayfaAd(r.sayfa) : '—')}</td>
            <td style="font-size:10.5px">${escapeHtml(islemAd[r.islem] || r.islem)}${r.geri_alindi ? ' <span class="pill pill-gray" style="font-size:8.5px">geri alındı</span>' : ''}</td>
            <td class="mono" style="font-size:10px">${escapeHtml(r.anahtar)}</td>
            <td class="r" style="font-size:10px">${r.kayit_sayisi != null ? r.kayit_sayisi : '—'}</td>
            <td>${(r.geri_alinabilir && !r.geri_alindi && r.anahtar !== 'kullaniciler')
              ? `<button class="btn btn-sm btn-amber dk-geri" data-id="${r.id}" data-anahtar="${escapeHtml(r.anahtar)}">↩ Geri Al</button>`
              : '<span class="muted" style="font-size:9.5px">—</span>'}</td>
          </tr>`).join('')}
        </table></div>`;
    } else if (aktifSekme === 'ziyaret') {
      html += `<div class="fhint" style="margin-bottom:8px">Kullanıcıların ziyaret ettiği birim ve sayfalar (IP ile birlikte).</div>
        <div style="max-height:430px;overflow:auto">
        <table class="dtable" style="font-size:11px">
          <tr><th>Zaman</th><th>Kullanıcı</th><th>Rol</th><th>IP</th><th>Birim</th><th>Sayfa</th></tr>
          ${ziyaretler.length ? ziyaretler.map(z => `<tr>
            <td class="mono" style="white-space:nowrap;font-size:10px">${zamanYaz(z.ts)}</td>
            <td><b>${escapeHtml(z.kullanici)}</b></td>
            <td style="font-size:10px">${escapeHtml(z.rol || '—')}</td>
            <td class="mono" style="font-size:10px">${escapeHtml(z.ip || '—')}</td>
            <td style="font-size:10px">${escapeHtml(z.birim || '—')}</td>
            <td style="font-size:10.5px">${escapeHtml(sayfaAd(z.sayfa))}</td>
          </tr>`).join('') : '<tr><td colspan="6" class="muted" style="padding:14px">Henüz ziyaret kaydı yok.</td></tr>'}
        </table></div>`;
    } else {
      html += `<div style="max-height:430px;overflow:auto">
        <table class="dtable" style="font-size:11px">
          <tr><th>Zaman</th><th>Kullanıcı</th><th>IP</th><th>Sonuç</th><th>Tarayıcı</th></tr>
          ${girisler.map(r => `<tr${r.islem === 'giris_basarisiz' ? ' style="background:var(--red-bg)"' : ''}>
            <td class="mono" style="white-space:nowrap;font-size:10px">${zamanYaz(r.ts)}</td>
            <td><b>${escapeHtml(r.kullanici)}</b></td>
            <td class="mono" style="font-size:10px">${escapeHtml(r.ip || '—')}</td>
            <td>${r.islem === 'giris' ? '<span class="pill pill-green" style="font-size:9px">Başarılı</span>' : '<span class="pill pill-red" style="font-size:9px">Başarısız</span>'}</td>
            <td style="font-size:9.5px;max-width:260px;overflow:hidden;text-overflow:ellipsis">${escapeHtml((r.tarayici || '—').slice(0, 60))}</td>
          </tr>`).join('')}
        </table></div>`;
    }

    body.innerHTML = html;
    openModal({ title: '📋 Denetim Kaydı (Audit Log)', sub: 'Kim · Ne zaman · Hangi IP · Hangi sayfa · Ne değişti · Geri alma', body, footer: `<button class="btn" id="dk-kapat">Kapat</button>`, xwide: true });
    document.getElementById('dk-kapat').onclick = closeModal;
    body.querySelectorAll('.dk-sekme').forEach(t => t.onclick = () => { closeModal(); openDenetimKaydiModal(t.dataset.s); });

    // ↩ GERİ ALMA: önce önizleme (kaç kayıt → kaç kayıt), sonra onay
    body.querySelectorAll('.dk-geri').forEach(b => b.onclick = async () => {
      const id = b.dataset.id, anahtar = b.dataset.anahtar;
      let onizleme = null;
      try { onizleme = await Store.auditOnizle(id); } catch (e) { toast('Önizleme alınamadı: ' + e.message, 'err'); return; }
      confirmDialog(
        `<b>${escapeHtml(anahtar)}</b> verisi, bu değişiklikten <b>ÖNCEKİ</b> hâline döndürülecek.<br><br>` +
        `Şu anki kayıt sayısı: <b>${onizleme.simdikiSayi != null ? onizleme.simdikiSayi : '—'}</b><br>` +
        `Geri alınınca: <b>${onizleme.oncekiSayi != null ? onizleme.oncekiSayi : '—'}</b><br><br>` +
        `Değişiklik: ${escapeHtml((onizleme.ts || '').replace('T', ' ').slice(0, 19))} · ${escapeHtml(onizleme.kullanici || '')}<br><br>` +
        `<span style="color:var(--red-text)">Bu işlem tüm koleksiyonu eski hâline yazar.</span> Geri alma işlemi de denetim kaydına eklenir. Onaylıyor musunuz?`,
        async () => {
          try {
            const r = await Store.auditGeriAl(id);
            toast(`↩ Geri alındı: ${r.anahtar} (${r.kayitSayisi != null ? r.kayitSayisi + ' kayıt' : ''}) — sayfayı yenileyin`, 'ok');
            closeModal();
            await goTo(state.page);
          } catch (e) { toast('Geri alma başarısız: ' + e.message, 'err'); }
        });
    });
  }

  // ── MOBİL MENU TOGGLE (PWA / Hamburger) ─────────────────────────────────
  function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mob-overlay');
    const isOpen = sidebar.classList.toggle('mob-open');
    overlay.classList.toggle('mob-open', isOpen);
  }

  // ── SİTE İÇİ ARAMA (üst bar 🔍, Ctrl/Cmd+K) ─────────────────────────────
  // Menüdeki (PAGES) TÜM ekranları grup+etiket üzerinden arar — bazı
  // bölümlerin sidebar hiyerarşisinde bulunması zor olabildiği için doğrudan
  // isimle bulup App.goTo ile gidilir. Yalnızca aktif ROLÜN erişebildiği
  // sayfalar sonuçta gösterilir (yetkisiz sayfa önerilmez).
  let _aramaSonuclari = [];
  let _aramaSecili = -1;

  function aramaAc() {
    if (!state.role) return;
    const panel = document.getElementById('arama-panel');
    const input = document.getElementById('arama-input');
    if (!panel || !input) return;
    panel.style.display = 'block';
    input.value = '';
    aramaFiltrele('');
    setTimeout(() => input.focus(), 30);
    document.addEventListener('mousedown', aramaDisTiklamaKapat, true);
  }

  function aramaKapat() {
    const panel = document.getElementById('arama-panel');
    if (panel) panel.style.display = 'none';
    document.removeEventListener('mousedown', aramaDisTiklamaKapat, true);
  }

  function aramaDisTiklamaKapat(e) {
    const wrap = document.getElementById('arama-wrap');
    if (wrap && !wrap.contains(e.target)) aramaKapat();
  }

  function aramaFiltrele(sorgu) {
    const q = String(sorgu || '').trim().toLocaleLowerCase('tr');
    const sonuclar = [];
    PAGES.forEach(grp => {
      (grp.items || []).forEach(it => {
        if (it.roller && !it.roller.includes(state.role)) return;
        const etiket = I18N.t(it.label) || it.label;
        const grupAd = I18N.t(grp.group) || grp.group;
        const hedefMetin = (etiket + ' ' + grupAd).toLocaleLowerCase('tr');
        if (!q || hedefMetin.indexOf(q) >= 0) sonuclar.push({ id: it.id, etiket, grupAd, icon: it.icon });
      });
    });
    _aramaSonuclari = sonuclar.slice(0, 30);
    _aramaSecili = _aramaSonuclari.length ? 0 : -1;
    aramaSonuclariCiz();
  }

  function aramaSonuclariCiz() {
    const liste = document.getElementById('arama-liste');
    if (!liste) return;
    if (!_aramaSonuclari.length) {
      liste.innerHTML = '<div class="muted" style="padding:14px;font-size:12px;text-align:center">Sonuç bulunamadı</div>';
      return;
    }
    liste.innerHTML = _aramaSonuclari.map((s, i) => `
      <div class="arama-satir" data-id="${escapeHtml(s.id)}"
        style="display:flex;align-items:center;gap:8px;padding:7px 9px;cursor:pointer;border-radius:6px;${i === _aramaSecili ? 'background:var(--blue-bg)' : ''}">
        <span style="font-size:14px;width:18px;text-align:center;flex-shrink:0">${escapeHtml(s.icon || '·')}</span>
        <div style="min-width:0">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.etiket)}</div>
          <div style="font-size:10px;color:var(--text3)">${escapeHtml(s.grupAd)}</div>
        </div>
      </div>`).join('');
    liste.querySelectorAll('.arama-satir').forEach(el => {
      el.onclick = () => aramaSecGit(el.dataset.id);
    });
  }

  function aramaSecGit(pageId) {
    aramaKapat();
    closeMobileMenuIfOpen();
    goTo(pageId);
  }

  function aramaTusVur(e) {
    if (e.key === 'Escape') { aramaKapat(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (_aramaSecili < _aramaSonuclari.length - 1) { _aramaSecili++; aramaSonuclariCiz(); } return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (_aramaSecili > 0) { _aramaSecili--; aramaSonuclariCiz(); } return; }
    if (e.key === 'Enter') {
      if (_aramaSecili >= 0 && _aramaSonuclari[_aramaSecili]) aramaSecGit(_aramaSonuclari[_aramaSecili].id);
    }
  }

  // Genel kısayol: Ctrl/Cmd+K herhangi bir ekrandan aramayı açar
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        aramaAc();
      }
    });
  }

  // ── DİL DEĞİŞTİRME (TR/EN) ──────────────────────────────────────────────
  // Üst bardaki 🌐 düğmesi. Dili değiştirir, düğme etiketini ve tüm arayüzü
  // (menü + aktif sayfa) yeniden çizer. Seçim localStorage'da kalıcıdır.
  function toggleDil() {
    I18N.toggle();
    dilUIGuncelle();
    // Menüyü ve aktif sayfayı yeniden çiz
    if (state.role) {
      renderSidebar();
      if (state.page) goTo(state.page, state.cache.params);
    } else {
      renderLoginScreen();
    }
  }

  function dilUIGuncelle() {
    // Sayfa modüllerindeki gömülü metinler için DOM çeviri katmanını başlat
    try { I18N.otomatikCeviriBaslat(); } catch (e) {}
    const btn = document.getElementById('btn-dil');
    if (btn) btn.innerHTML = '🌐 ' + (I18N.dil() === 'tr' ? 'TR' : 'EN');
    const ayarLbl = document.getElementById('ayarlar-lbl');
    if (ayarLbl) ayarLbl.textContent = I18N.t('Ayarlar');
    document.documentElement.lang = I18N.dil();
  }

  // Nav item tıklandığında mobilde sidebar'ı kapat
  function closeMobileMenuIfOpen() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('mob-open')) {
      sidebar.classList.remove('mob-open');
      const overlay = document.getElementById('mob-overlay');
      if (overlay) overlay.classList.remove('mob-open');
    }
  }

  function openSettings() {
    const a = state.ayarlar;
    const body = `
      <div class="fgroup"><label class="flbl">Saatlik İşçilik Ücreti (₺/saat)</label>
        <input class="finput" id="set-iscilik" type="number" value="${a.saatlikIscilikUcreti}" step="1"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Amortisman Gideri (%)</label>
          <input class="finput" id="set-amortisman" type="number" value="${a.amortismanYuzde}" step="0.1"></div>
        <div class="fgroup"><label class="flbl">Genel Yönetim Gideri (%)</label>
          <input class="finput" id="set-genyon" type="number" value="${a.genelYonetimYuzde}" step="0.1"></div>
      </div>
      <div class="fgroup"><label class="flbl">Hedef Satış Kârı (%)</label>
        <input class="finput" id="set-kar" type="number" value="${a.satisKariYuzde}" step="0.1"></div>
      <div class="hr"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">USD/TRY Kuru</label>
          <input class="finput" id="set-usd" type="number" value="${a.usdTry}" step="0.01"></div>
        <div class="fgroup"><label class="flbl">EUR/TRY Kuru</label>
          <input class="finput" id="set-eur" type="number" value="${a.eurTry}" step="0.01"></div>
      </div>
      <div class="hr"></div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Lineer Testere Kesim Payı (mm)</label>
          <input class="finput" id="set-kesimpay" type="number" value="${a.testereKayipPayiMM}" step="0.5"></div>
        <div class="fgroup"><label class="flbl">Freze (CNC/Flat-Tabla) Kesim Payı (mm)</label>
          <input class="finput" id="set-frezepay" type="number" value="${a.frezeKayipPayiMM ?? 3}" step="0.5"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Plaka Kenar Boşluğu (mm)</label>
          <input class="finput" id="set-kenarbosluk" type="number" value="${a.plakaKenarBosluguMM}" step="0.5"></div>
      </div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Liste Fiyatı Formülü (Fiyatlama modülü)</div>
      <div class="fhint" style="margin-top:-4px;margin-bottom:10px">Liste Fiyatı = (Net Maliyet × (1+GYG%) × (1+Nakliye%) × (1+Kâr%)) / Bölü Katsayısı</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">GYG (%)</label><input class="finput" id="set-fiyat-gyg" type="number" value="${a.fiyatGygYuzde ?? 10}" step="0.5"></div>
        <div class="fgroup"><label class="flbl">Nakliye/Montaj (%)</label><input class="finput" id="set-fiyat-nakliye" type="number" value="${a.fiyatNakliyeYuzde ?? 7}" step="0.5"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Kâr (%)</label><input class="finput" id="set-fiyat-kar" type="number" value="${a.fiyatKarYuzde ?? 54}" step="0.5"></div>
        <div class="fgroup"><label class="flbl">Bölü Katsayısı</label><input class="finput" id="set-fiyat-bolu" type="number" value="${a.fiyatBoluKatsayisi ?? 0.45}" step="0.01"></div>
      </div>
      <div class="fhint">Bu değerler tüm rota maliyeti, kesim optimizasyonu ve fiyatlandırma hesaplarında kullanılır.</div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Bordro / SGK / Tazminat Parametreleri (İK modülü)</div>
      <div class="fhint" style="margin-top:-4px;margin-bottom:10px">2026 yılı başı itibarıyla resmi değerler önceden girilmiştir; yasal değişiklikte (genelde Ocak/Temmuz) buradan güncelleyin.</div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Brüt Asgari Ücret (₺)</label><input class="finput" id="set-asgari-brut" type="number" value="${a.brutAsgariUcret ?? 33030}" step="1"></div>
        <div class="fgroup"><label class="flbl">SGK Tavan Katsayısı</label><input class="finput" id="set-sgk-tavan-kat" type="number" value="${a.sgkTavanKatsayisi ?? 9}" step="0.5"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">SGK İşçi Primi (%)</label><input class="finput" id="set-sgk-isci" type="number" value="${a.sgkIsciPrimYuzde ?? 14}" step="0.1"></div>
        <div class="fgroup"><label class="flbl">İşsizlik İşçi Primi (%)</label><input class="finput" id="set-issizlik-isci" type="number" value="${a.issizlikIsciPrimYuzde ?? 1}" step="0.1"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">SGK İşveren Primi (%)</label><input class="finput" id="set-sgk-isveren" type="number" value="${a.sgkIsverenPrimYuzde ?? 15.75}" step="0.05"></div>
        <div class="fgroup"><label class="flbl">İşsizlik İşveren Primi (%)</label><input class="finput" id="set-issizlik-isveren" type="number" value="${a.issizlikIsverenPrimYuzde ?? 2}" step="0.1"></div>
      </div>
      <div class="frow">
        <div class="fgroup"><label class="flbl">Damga Vergisi Oranı (binde)</label><input class="finput" id="set-damga" type="number" value="${a.damgaVergisiOraniBinde ?? 7.59}" step="0.01"></div>
        <div class="fgroup"><label class="flbl">Kıdem Tazminatı Tavanı (₺)</label><input class="finput" id="set-kidem-tavan" type="number" value="${a.kidemTazminatiTavani ?? 53919.68}" step="0.01"></div>
      </div>
      <div class="fhint">⚠ Bu modül resmi bir bordro yazılımının yerini tutmaz; gerçek ödemeler öncesi mali müşavirinizle doğrulayın.</div>
      <div class="hr"></div>
      <div class="flbl" style="margin-bottom:8px">Cari / Vade Farkı Parametresi</div>
      <div class="fgroup"><label class="flbl">Aylık Vade Farkı Faiz Oranı (%) — TCMB politika faizine göre siz güncelleyin</label><input class="finput" id="set-vade-farki-faiz" type="number" value="${a.aylikVadeFarkiFaizOrani ?? 4.25}" step="0.05"></div>
      <div class="hr" style="margin-top:20px;border-color:#EF4444"></div>
      <div style="background:#FEF2F2;border:1.5px solid #EF4444;border-radius:10px;padding:16px 18px;margin-top:4px">
        <div style="color:#991B1B;font-weight:700;font-size:14px;margin-bottom:8px">⚠ TEHLİKELİ BÖLGE — SİSTEMİ SIFIRLA</div>
        <div style="color:#7F1D1D;font-size:12px;margin-bottom:14px">Bu işlem <b>TÜM İŞ VERİSİNİ KALICI OLARAK SİLER</b> — reçeteler, ürün/yarımamül/hammadde kartları, müşteriler, tedarikçiler, siparişler, faturalar, personel, stok, tahsilatlar, tüm kayıtlar. Geri alma yoktur. Uygulama kodu, ekranlar ve sistem ayarları korunur; sadece veriler sıfırlanır. Devam etmek için ARGE, Cari ve Üst Yönetim birimlerinin onayı ve şifre gereklidir.</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#7F1D1D;cursor:pointer"><input type="checkbox" id="sif-onay-arge" style="width:16px;height:16px"> <span><b>ARGE Birimi Onayı</b> — Tüm reçete, ürün kartı ve teknik verilerin silineceğini onaylıyorum</span></label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#7F1D1D;cursor:pointer"><input type="checkbox" id="sif-onay-cari" style="width:16px;height:16px"> <span><b>Cari İşlemler Onayı</b> — Tüm müşteri, sipariş, fatura ve tahsilat verilerinin silineceğini onaylıyorum</span></label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#7F1D1D;cursor:pointer"><input type="checkbox" id="sif-onay-yon" style="width:16px;height:16px"> <span><b>Üst Yönetim Onayı</b> — Sistemin tamamen sıfırlanacağını ve bu işlemin geri alınamayacağını onaylıyorum</span></label>
        </div>
        <div class="fgroup" style="margin-bottom:12px">
          <label class="flbl" style="color:#991B1B">Sıfırlama Şifresi</label>
          <input class="finput" id="sif-sifre" type="password" placeholder="Şifreyi girin..." style="border-color:#EF4444;max-width:280px">
        </div>
        <button class="btn" id="btn-sistemi-sifirla" disabled style="background:#EF4444;color:#fff;opacity:0.5;cursor:not-allowed;border:none">🗑 Tüm Verileri Kalıcı Olarak Sil</button>
        <div id="sif-hata" style="color:#DC2626;font-size:11.5px;margin-top:8px;display:none"></div>
      </div>
    `;
    const footer = `<button class="btn" id="btn-set-cancel">Vazgeç</button><button class="btn btn-blue" id="btn-set-save">Kaydet</button><button class="btn" id="btn-yedek" style="margin-left:8px">💾 Yedekleme</button>${state.role === 'yonetim' ? '<button class="btn" id="btn-sifre-yon" style="margin-left:8px">🔑 Şifre Yönetimi</button><button class="btn" id="btn-hesap-talep" style="margin-left:8px">👥 Hesap Talepleri</button>' : ''}${state.role === 'yonetim' && Store.sunucuModu ? '<button class="btn" id="btn-denetim" style="margin-left:8px">📋 Denetim Kaydı</button>' : ''}`;
    openModal({ title: 'Sistem Ayarları', sub: 'Genel maliyet ve fiyatlandırma parametreleri', body, footer, wide: true });
    document.getElementById('btn-set-cancel').onclick = closeModal;
    document.getElementById('btn-yedek').onclick = openYedeklemeModal;
    if (state.role === 'yonetim') {
      document.getElementById('btn-sifre-yon').onclick = openSifreYonetimiModal;
      document.getElementById('btn-hesap-talep').onclick = openHesapTalepleriModal;
      // Bekleyen talep sayısı rozeti — Hat & İstasyon Takibi'ndeki
      // "Operatör Yetkileri" rozetiyle AYNI desen.
      (async () => {
        try {
          const bekleyenSayisi = (await Store.hesapTalepleri.all()).filter(t => t.durum === 'bekliyor').length;
          if (bekleyenSayisi > 0) {
            const btn = document.getElementById('btn-hesap-talep');
            btn.innerHTML = `👥 Hesap Talepleri <span class="pill pill-red" style="font-size:9.5px;margin-left:4px">${bekleyenSayisi}</span>`;
            btn.style.border = '1.5px solid var(--red)';
          }
        } catch (e) {}
      })();
    }
    if (state.role === 'yonetim' && Store.sunucuModu) document.getElementById('btn-denetim').onclick = openDenetimKaydiModal;

    // ── Tehlikeli Bölge: 3 onay + şifre doğrulanınca buton aktifleşir ──────
    const sifBtn = document.getElementById('btn-sistemi-sifirla');
    const sifHata = document.getElementById('sif-hata');
    const SIF_SIFRE = 'sil1234';
    function kontrolEt() {
      const onaylar = ['sif-onay-arge', 'sif-onay-cari', 'sif-onay-yon'].every(id => document.getElementById(id).checked);
      const sifre = document.getElementById('sif-sifre').value;
      const tamam = onaylar && sifre === SIF_SIFRE;
      sifBtn.disabled = !tamam;
      sifBtn.style.opacity = tamam ? '1' : '0.5';
      sifBtn.style.cursor = tamam ? 'pointer' : 'not-allowed';
    }
    ['sif-onay-arge', 'sif-onay-cari', 'sif-onay-yon'].forEach(id => document.getElementById(id).onchange = kontrolEt);
    document.getElementById('sif-sifre').oninput = kontrolEt;

    sifBtn.onclick = async () => {
      const onaylar = ['sif-onay-arge', 'sif-onay-cari', 'sif-onay-yon'].every(id => document.getElementById(id).checked);
      const sifre = document.getElementById('sif-sifre').value;
      if (!onaylar || sifre !== SIF_SIFRE) { sifHata.textContent = 'Tüm onay kutucuklarını işaretleyin ve doğru şifreyi girin.'; sifHata.style.display = 'block'; return; }
      sifHata.style.display = 'none';
      sifBtn.disabled = true;
      sifBtn.textContent = '⏳ Sıfırlanıyor...';
      try {
        await Store.sistemiSifirla();
        state.ayarlar = { ...VARSAYILAN_AYARLAR }; // ayarlar objesi de sıfırla (ama localStorage'daki korunur)
        closeModal();
        toast('🗑 Sistem tamamen sıfırlandı — tüm veriler silindi', 'ok');
        await goTo('panel');
      } catch (e) {
        sifHata.textContent = 'Sıfırlama sırasında hata: ' + e.message;
        sifHata.style.display = 'block';
        sifBtn.disabled = false;
        sifBtn.textContent = '🗑 Tüm Verileri Kalıcı Olarak Sil';
      }
    };

    document.getElementById('btn-set-save').onclick = async () => {
      const next = {
        saatlikIscilikUcreti: parseFloat(document.getElementById('set-iscilik').value) || 0,
        amortismanYuzde: parseFloat(document.getElementById('set-amortisman').value) || 0,
        genelYonetimYuzde: parseFloat(document.getElementById('set-genyon').value) || 0,
        satisKariYuzde: parseFloat(document.getElementById('set-kar').value) || 0,
        usdTry: parseFloat(document.getElementById('set-usd').value) || 0,
        eurTry: parseFloat(document.getElementById('set-eur').value) || 0,
        testereKayipPayiMM: parseFloat(document.getElementById('set-kesimpay').value) || 0,
        frezeKayipPayiMM: parseFloat(document.getElementById('set-frezepay').value) || 0,
        plakaKenarBosluguMM: parseFloat(document.getElementById('set-kenarbosluk').value) || 0,
        fiyatGygYuzde: parseFloat(document.getElementById('set-fiyat-gyg').value) || 0,
        fiyatNakliyeYuzde: parseFloat(document.getElementById('set-fiyat-nakliye').value) || 0,
        fiyatKarYuzde: parseFloat(document.getElementById('set-fiyat-kar').value) || 0,
        fiyatBoluKatsayisi: parseFloat(document.getElementById('set-fiyat-bolu').value) || 1,
        brutAsgariUcret: parseFloat(document.getElementById('set-asgari-brut').value) || 33030,
        sgkTavanKatsayisi: parseFloat(document.getElementById('set-sgk-tavan-kat').value) || 9,
        sgkIsciPrimYuzde: parseFloat(document.getElementById('set-sgk-isci').value) || 14,
        issizlikIsciPrimYuzde: parseFloat(document.getElementById('set-issizlik-isci').value) || 1,
        sgkIsverenPrimYuzde: parseFloat(document.getElementById('set-sgk-isveren').value) || 15.75,
        issizlikIsverenPrimYuzde: parseFloat(document.getElementById('set-issizlik-isveren').value) || 2,
        damgaVergisiOraniBinde: parseFloat(document.getElementById('set-damga').value) || 7.59,
        kidemTazminatiTavani: parseFloat(document.getElementById('set-kidem-tavan').value) || 53919.68,
        aylikVadeFarkiFaizOrani: parseFloat(document.getElementById('set-vade-farki-faiz').value) || 4.25
      };
      await persist(() => Store.setAyarlar(next));
      state.ayarlar = next;
      closeModal();
      toast('Ayarlar kaydedildi', 'ok');
      goTo(state.page); // sayfayı yeniden çiz ki yeni ayarlar yansısın
    };
  }

  // ── ORTAK YARDIMCI FONKSİYONLAR ──────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(n, d = 2) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtTL(n, d = 2) { return '₺' + fmt(n, d); }
  function fmtPct(n, d = 1) { return fmt(n, d) + '%'; }

  // ── PAYLAŞILAN ÇIKTI ÜRETİMİ (Excel / PDF / Yazdır) ──────────────────────
  // Tek bir satınalma siparişi VEYA aynı tedarikçiye ait birden fazla sipariş
  // için ortak çıktı üretir. siparisListesi her zaman bir dizi olarak gelir
  // (tek sipariş bile [siparis] şeklinde sarmalanır).
  function satinalmaCiktiExcel(siparisListesi, tedarikciAdi) {
    const wsData = [
      ['SATINALMA SİPARİŞİ' + (siparisListesi.length > 1 ? ' (TOPLU)' : '')],
      [],
      ['Tedarikçi', tedarikciAdi || siparisListesi[0].tedarikciAdi],
      ['Çıktı Tarihi', new Date().toISOString().slice(0, 10)],
      [],
      ['Sipariş Kodu', 'Kalem', 'Miktar', 'Birim', 'Birim Fiyat', 'Para Birimi', 'Toplam (TL)', 'Termin (Gün)', 'Tahmini Giriş', 'Not']
    ];
    let genelToplam = 0;
    siparisListesi.forEach(s => {
      wsData.push([s.kod, s.kalemAdi, s.miktar, s.birim, s.birimFiyat, s.dvz, s.toplamTRY, s.terminGun, s.tahminiGirisTarihi, s.not || '']);
      genelToplam += s.toplamTRY;
    });
    wsData.push([], ['', '', '', '', '', '', 'GENEL TOPLAM:', fmt(genelToplam, 2) + ' TL']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 10 }, { wch: 9 }, { wch: 11 }, { wch: 9 }, { wch: 13 }, { wch: 10 }, { wch: 13 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Satinalma Siparisi');
    const dosyaAdi = (tedarikciAdi || siparisListesi[0].tedarikciAdi || 'siparis').replace(/[^a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ-]/g, '_');
    XLSX.writeFile(wb, dosyaAdi + '_satinalma_siparisi.xlsx');
    toast('Excel dosyası indirildi', 'ok');
  }

  function satinalmaCiktiHtml(siparisListesi, tedarikciAdi) {
    const genelToplam = siparisListesi.reduce((a, s) => a + s.toplamTRY, 0);
    return `
      <html><head><title>Satınalma Siparişi - ${escapeHtml(tedarikciAdi || '')}</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; }
        h1 { font-size: 20px; border-bottom: 2px solid #1457a0; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; font-size: 12.5px; }
        th { background: #f0f0f0; }
        .meta { margin: 16px 0; font-size: 13px; line-height: 1.6; }
        .total { font-weight: bold; font-size: 15px; margin-top: 14px; text-align: right; }
        @media print { body { padding: 15px; } }
      </style></head>
      <body>
        <h1>SATINALMA SİPARİŞİ${siparisListesi.length > 1 ? ' (TOPLU)' : ''}</h1>
        <div class="meta">
          <div><b>Tedarikçi:</b> ${escapeHtml(tedarikciAdi || siparisListesi[0].tedarikciAdi)}</div>
          <div><b>Çıktı Tarihi:</b> ${new Date().toISOString().slice(0, 10)}</div>
          <div><b>Sipariş Sayısı:</b> ${siparisListesi.length}</div>
        </div>
        <table>
          <tr><th>Sipariş Kodu</th><th>Kalem</th><th>Miktar</th><th>Birim</th><th>Birim Fiyat</th><th>Para Birimi</th><th>Toplam (TL)</th><th>Termin</th></tr>
          ${siparisListesi.map(s => `<tr>
            <td>${escapeHtml(s.kod)}</td><td>${escapeHtml(s.kalemAdi)}</td><td>${fmt(s.miktar, 2)}</td><td>${escapeHtml(s.birim || '')}</td>
            <td>${fmt(s.birimFiyat, 4)}</td><td>${escapeHtml(s.dvz)}</td><td>${fmtTL(s.toplamTRY)}</td><td>${s.tahminiGirisTarihi || '—'}</td>
          </tr>`).join('')}
        </table>
        <div class="total">GENEL TOPLAM: ${fmtTL(genelToplam)}</div>
        ${siparisListesi.some(s => s.not) ? '<div class="meta"><b>Notlar:</b><br>' + siparisListesi.filter(s => s.not).map(s => escapeHtml(s.kod) + ': ' + escapeHtml(s.not)).join('<br>') + '</div>' : ''}
      </body></html>
    `;
  }

  function satinalmaCiktiPdf(siparisListesi, tedarikciAdi) {
    const win = window.open('', '_blank');
    if (!win) { toast('Açılır pencere engellenmiş olabilir, lütfen izin verin', 'err'); return; }
    win.document.write(satinalmaCiktiHtml(siparisListesi, tedarikciAdi) + '<script>window.onload = () => { window.print(); };</script>');
    win.document.close();
  }

  function satinalmaCiktiYazdir(siparisListesi, tedarikciAdi) {
    // PDF ile aynı mekanizma (tarayıcı yazdırma penceresi) — kullanıcı
    // dilerse "PDF olarak kaydet" yerine doğrudan fiziksel yazıcı seçebilir.
    satinalmaCiktiPdf(siparisListesi, tedarikciAdi);
  }

  // ── BORDRO HESAPLAMA (2026 PARAMETRELERİYLE — RESMİ DEĞİLDİR) ────────────
  // Brüt maaştan SGK/işsizlik/gelir/damga vergisi kesintilerini düşerek net
  // ücreti hesaplar. Kümülatif gelir vergisi matrahı, o yıl o personel için
  // önceki ayların bordrolarından (Store.bordrolar) toplanarak bulunur —
  // çağıran taraf bu kümülatif matrahı parametre olarak geçirir.
  // UYARI: Bu hesap şeffaf ve ayarlanabilir bir YAKLAŞIM sunar; resmi bordro
  // yazılımının yerini tutmaz. Gerçek ödeme öncesi mali müşavirle doğrulayın.
  function bordroHesapla(brutMaas, oncekiKumulatifMatrah, ayarlar) {
    const a = ayarlar;
    const sgkTavan = a.brutAsgariUcret * a.sgkTavanKatsayisi;
    const sgkMatrah = Math.min(brutMaas, sgkTavan); // SGK primi tavanı aşan kısımdan kesilmez

    const sgkIsciPrimi = sgkMatrah * (a.sgkIsciPrimYuzde / 100);
    const issizlikIsciPrimi = sgkMatrah * (a.issizlikIsciPrimYuzde / 100);
    const sgkIsverenPrimi = sgkMatrah * (a.sgkIsverenPrimYuzde / 100);
    const issizlikIsverenPrimi = sgkMatrah * (a.issizlikIsverenPrimYuzde / 100);

    // Gelir vergisi matrahı: brüt - SGK/işsizlik işçi payları
    const gelirVergisiMatrahiBuAy = brutMaas - sgkIsciPrimi - issizlikIsciPrimi;
    const yeniKumulatifMatrah = oncekiKumulatifMatrah + gelirVergisiMatrahiBuAy;

    // Kümülatif dilim sistemine göre BU AYIN vergisi: yeni kümülatif matrahın
    // toplam vergisi - önceki kümülatif matrahın toplam vergisi (dilim aşımı doğru yansır)
    const toplamVergiYeni = kumulatifVergiHesapla(yeniKumulatifMatrah, BORDRO_AYARLARI_VARSAYILAN.gelirVergisiDilimleri);
    const toplamVergiOnceki = kumulatifVergiHesapla(oncekiKumulatifMatrah, BORDRO_AYARLARI_VARSAYILAN.gelirVergisiDilimleri);
    let gelirVergisiBuAy = Math.max(0, toplamVergiYeni - toplamVergiOnceki);

    // Asgari ücret istisnası: asgari ücrete isabet eden gelir vergisi tutarı kadar istisna uygulanır
    const asgariUcretMatrahi = a.brutAsgariUcret - (a.brutAsgariUcret * (a.sgkIsciPrimYuzde + a.issizlikIsciPrimYuzde) / 100);
    const asgariUcretVergisi = kumulatifVergiHesapla(asgariUcretMatrahi, BORDRO_AYARLARI_VARSAYILAN.gelirVergisiDilimleri);
    gelirVergisiBuAy = Math.max(0, gelirVergisiBuAy - asgariUcretVergisi);

    const damgaVergisiBuAy = Math.max(0, (brutMaas * (a.damgaVergisiOraniBinde / 1000)) - (a.brutAsgariUcret * (a.damgaVergisiOraniBinde / 1000)));

    const toplamIsciKesinti = sgkIsciPrimi + issizlikIsciPrimi + gelirVergisiBuAy + damgaVergisiBuAy;
    const netMaas = brutMaas - toplamIsciKesinti;
    const isverenToplamMaliyet = brutMaas + sgkIsverenPrimi + issizlikIsverenPrimi;

    return {
      brutMaas, sgkMatrah, sgkIsciPrimi, issizlikIsciPrimi, sgkIsverenPrimi, issizlikIsverenPrimi,
      gelirVergisiMatrahiBuAy, yeniKumulatifMatrah, gelirVergisiBuAy, damgaVergisiBuAy,
      toplamIsciKesinti, netMaas, isverenToplamMaliyet
    };
  }

  function kumulatifVergiHesapla(matrah, dilimler) {
    let vergi = 0, oncekiUst = 0;
    for (const d of dilimler) {
      if (matrah <= oncekiUst) break;
      const buDilimMatrah = Math.min(matrah, d.ust) - oncekiUst;
      vergi += buDilimMatrah * (d.oran / 100);
      oncekiUst = d.ust;
      if (matrah <= d.ust) break;
    }
    return vergi;
  }

  // Kıdem tazminatı: her tam yıl için brüt maaş (tavan ile sınırlı) × yıl sayısı.
  // İhbar tazminatı: kıdem yılına göre değişen hafta sayısı × haftalık brüt ücret.
  function kidemIhbarHesapla(personel, ayrilmaTarihi, ayarlar) {
    const iseGiris = new Date(personel.iseGirisTarihi);
    const ayrilis = ayrilmaTarihi ? new Date(ayrilmaTarihi) : new Date();
    const gunFarki = (ayrilis - iseGiris) / 86400000;
    const yilSayisi = gunFarki / 365.25;

    const gunlukBrut = personel.brutMaas / 30;
    const tavanliGunlukUcret = Math.min(gunlukBrut, ayarlar.kidemTazminatiTavani / 30);
    const kidemTazminati = tavanliGunlukUcret * 30 * yilSayisi;

    let ihbarHaftasi = 2;
    for (const d of BORDRO_AYARLARI_VARSAYILAN.ihbarSuresiHaftalar) {
      if (yilSayisi <= d.altYil) { ihbarHaftasi = d.hafta; break; }
    }
    const haftalikBrut = personel.brutMaas / 4.33;
    const ihbarTazminati = haftalikBrut * ihbarHaftasi;

    return { yilSayisi, kidemTazminati, ihbarHaftasi, ihbarTazminati, toplamTazminat: kidemTazminati + ihbarTazminati };
  }

  function uid(prefix) { return (prefix || 'ID') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toTRY(amount, dvz, ayarlar) {
    if (dvz === 'USD' || dvz === '$') return amount * ayarlar.usdTry;
    if (dvz === 'EUR' || dvz === '€') return amount * ayarlar.eurTry;
    return amount;
  }

  // ── HAMMADDE BİRİM FİYATI + NAKLİYE (KARGO) PAYI ────────────────────────
  // Bir hammaddenin maliyete giren GERÇEK birim fiyatı:
  //     birimFiyat (dövizden TL'ye) + nakliyeBirimMaliyeti
  //
  // NEDEN AYRI ALAN: Önceden nakliye bedeli satınalma sırasında doğrudan
  // hm.birimFiyat'ın İÇİNE toplanıp yazılıyordu. Bunun üç sorunu vardı:
  //   1) Fiyatın ne kadarı mal, ne kadarı kargo — görünmüyordu.
  //   2) Kullanıcı hammadde kartından fiyatı elle güncelleyince kargo payı
  //      sessizce siliniyordu (kullanıcının "eklenmiyor" dediği durum).
  //   3) Yalnızca "fiyatı güncelle" kutusu işaretliyse uygulanıyordu.
  // Artık kargo payı ayrı bir alanda durur, elle düzenlenebilir ve her
  // maliyet hesabına buradan katılır.
  //
  // nakliyeBirimMaliyeti = toplam nakliye bedeli / alınan adet
  // (satınalma ekranı bu bölmeyi yapıp alana yazar)
  function hammaddeBirimFiyatTRY(hm, ayarlar) {
    if (!hm) return 0;
    const mal = toTRY(hm.birimFiyat || 0, hm.dvz, ayarlar);
    const nakliye = toTRY(hm.nakliyeBirimMaliyeti || 0, hm.nakliyeDvz || 'TL', ayarlar);
    return mal + nakliye;
  }

  // ── PAYLAŞILAN MALİYET HESAPLAMA ────────────────────────────────────────
  // Hem Fiyatlama sayfası hem Teklif/Sipariş ekranları aynı mantığı kullanır.
  // Bir yarı mamülün birim maliyeti: önce BOM (hammadde ataması) denenir,
  // yoksa referansFiyat'a düşülür, o da yoksa 'yok' kaynağıyla 0 döner.
  // Bir yarı mamülün birim maliyetini hesaplar. Öncelik sırası:
  //   1) Kendi çok kalemli reçetesi varsa (receteler içinde yarimamulId ile
  //      eşleşen kayıt) — bu reçetedeki TÜM hammadde/hırdavat/alt-yarımamül
  //      kalemlerinin maliyeti toplanır (recursive).
  //   2) Yoksa eski/basit tek-hammadde bağlantısı (ym.hammaddeId) kullanılır.
  //   3) O da yoksa ym.referansFiyat (manuel girilmiş sabit fiyat) kullanılır.
  //   4) Hiçbiri yoksa maliyet hesaplanamaz ("yok").
  // gezilenYmIdleri: döngüsel referansı (A, B'yi; B, A'yı içeriyor gibi)
  // sonsuz döngüye girmeden tespit etmek için kullanılır.
  // ── KENAR BANDI MALİYETİ ────────────────────────────────────────────────
  // Bir kenarın bant maliyetini hesaplar: (net ölçü + 50mm) × metre fiyatı.
  // netOlcuMM: o kenarın net uzunluğu (mm). bandHammaddeId: hammaddeler
  // listesinden seçilen kenar_bandi tipi kartın id'si.
  function kenarBandiMaliyetHesapla(netOlcuMM, bandHammaddeId, hammaddeler, ayarlar) {
    if (!bandHammaddeId || !netOlcuMM) return { maliyet: 0, metre: 0, hammadde: null };
    const hm = hammaddeler.find(h => h.id === bandHammaddeId);
    if (!hm) return { maliyet: 0, metre: 0, hammadde: null };
    const metre = (netOlcuMM + 50) / 1000; // net ölçüye 50mm ilave edilir, mm -> metre
    const fiyatTRY = hammaddeBirimFiyatTRY(hm, ayarlar);   // kargo payı dahil
    return { maliyet: metre * fiyatTRY, metre, hammadde: hm };
  }

  // ── GENEL KART MALİYET MOTORU (ürün / yarı mamül / alt montaj ortak) ────
  // Bir kartın (ürün, yarı mamül veya alt montaj) reçetesindeki TÜM
  // kalemlerin (hammadde, kenar bandı dahil, alt yarı mamül/alt montaj/ürün
  // dahil — recursive) maliyetini toplar; üzerine kendi ROTASININ maliyetini,
  // sabit AMORTİSMAN gideri ve (maliyet × oran) ile hesaplanan GYG giderini
  // ekler. detay listesi UI'da (Reçete Yap ekranı) gösterilecek satırları
  // üretir; eksikKalemler maliyeti hesaplanamayan kalemleri işaretler.
  //
  // kartTipi: 'urun' | 'yarimamul' | 'altmontaj'
  // receteSahibi: ürün/yarımamül/altmontaj objesinin kendisi (rota/amortisman/
  //   gyg alanları kart üzerinde tutulur: rotaId, amortismanGideri,
  //   gygOraniYuzde)
  function kartMaliyetHesapla(kart, kartTipi, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar, gezilenler, paketler) {
    gezilenler = gezilenler || new Set();
    paketler = paketler || [];
    const kendiAnahtar = kartTipi + ':' + kart.id;
    if (gezilenler.has(kendiAnahtar)) {
      return { toplam: 0, kalemToplami: 0, rotaMaliyeti: 0, amortismanGideri: 0, gygGideri: 0, detay: [], eksikKalemler: [], kaynak: 'yok', dongiVar: true };
    }
    const yeniGezilenler = new Set(gezilenler); yeniGezilenler.add(kendiAnahtar);

    const recete = kartTipi === 'urun' ? receteler.find(r => r.urunId === kart.id)
      : kartTipi === 'yarimamul' ? receteler.find(r => r.yarimamulId === kart.id)
      : kartTipi === 'altmontaj' ? receteler.find(r => r.altMontajId === kart.id)
      : receteler.find(r => r.paketId === kart.id);

    let kalemToplami = 0;
    const detay = [];
    const eksikKalemler = [];

    if (recete && recete.kalemler.length) {
      recete.kalemler.forEach(k => {
        if (k.tip === 'hammadde') {
          const hm = hammaddeler.find(h => h.id === k.refId);
          if (!hm) { eksikKalemler.push({ ad: k.refId, kaynak: 'yok' }); return; }
          const fiyatTRY = hammaddeBirimFiyatTRY(hm, ayarlar);   // kargo payı dahil
          let birimMaliyet;
          if (hm.tip === 'plaka' && k.olcu) {
            const alanM2 = ((k.olcu.kabaBoy || k.olcu.netBoy || 0) * (k.olcu.kabaEn || k.olcu.netEn || 0)) / 1e6;
            birimMaliyet = alanM2 * fiyatTRY;
          } else {
            birimMaliyet = fiyatTRY;
          }
          birimMaliyet *= 1 + (hm.fireYuzde || 0) / 100;
          let satirMaliyet = birimMaliyet * (k.miktar || 1);

          // Kenar bandı maliyeti (sadece plaka + ölçü + kenarBantlari varsa)
          let kenarBandiToplamMaliyet = 0;
          const kenarDetaylari = [];
          if (hm.tip === 'plaka' && k.olcu && k.kenarBantlari) {
            const kenarOlculer = { on: k.olcu.netBoy, arka: k.olcu.netBoy, sag: k.olcu.netEn, sol: k.olcu.netEn };
            ['on', 'arka', 'sag', 'sol'].forEach(kenar => {
              const bantId = k.kenarBantlari[kenar];
              if (!bantId) return;
              const sonuc = kenarBandiMaliyetHesapla(kenarOlculer[kenar], bantId, hammaddeler, ayarlar);
              kenarBandiToplamMaliyet += sonuc.maliyet * (k.miktar || 1);
              kenarDetaylari.push({ kenar, hammadde: sonuc.hammadde, metre: sonuc.metre, maliyet: sonuc.maliyet });
            });
          }
          satirMaliyet += kenarBandiToplamMaliyet;
          kalemToplami += satirMaliyet;
          detay.push({ tip: 'hammadde', ad: hm.ad, kod: hm.stokKodu, miktar: k.miktar, birimMaliyet, satirMaliyet, kenarDetaylari, kaynak: 'hammadde' });
        } else if (k.tip === 'yarimamul' || k.tip === 'urun' || k.tip === 'altmontaj' || k.tip === 'paket') {
          const liste = k.tip === 'yarimamul' ? yarimamuller : (k.tip === 'urun' ? urunler : (k.tip === 'altmontaj' ? altMontajlar : paketler));
          const altKart = liste.find(x => x.id === k.refId);
          if (!altKart) { eksikKalemler.push({ ad: k.refId, kaynak: 'yok' }); return; }
          const sonuc = kartMaliyetHesapla(altKart, k.tip, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar, yeniGezilenler, paketler);
          if (sonuc.kaynak === 'yok' || sonuc.eksikKalemler.length) eksikKalemler.push({ ad: altKart.ad, kaynak: 'kismi' });
          const satirMaliyet = sonuc.toplam * (k.miktar || 1);
          kalemToplami += satirMaliyet;
          detay.push({ tip: k.tip, ad: altKart.ad, kod: altKart.kod, miktar: k.miktar, birimMaliyet: sonuc.toplam, satirMaliyet, altDetay: sonuc.detay, kaynak: sonuc.kaynak });
        }
      });
    } else if (kartTipi === 'yarimamul' && kart.hammaddeId) {
      // Eski/basit tek-hammadde bağlantısı (geriye dönük uyumluluk)
      const hm = hammaddeler.find(h => h.id === kart.hammaddeId);
      if (hm) {
        let birimMaliyet;
        const fiyatTRY = hammaddeBirimFiyatTRY(hm, ayarlar);   // kargo payı dahil
        if (hm.tip === 'plaka' && hm.birim === 'M2') {
          const alanM2 = ((kart.kabaBoy || kart.netBoy || 0) * (kart.kabaEn || kart.netEn || 0)) / 1e6;
          birimMaliyet = alanM2 * fiyatTRY;
        } else {
          birimMaliyet = fiyatTRY;
        }
        birimMaliyet *= 1 + (hm.fireYuzde || 0) / 100;
        kalemToplami = birimMaliyet;
        detay.push({ tip: 'hammadde', ad: hm.ad, kod: hm.stokKodu, miktar: 1, birimMaliyet, satirMaliyet: birimMaliyet, kaynak: 'bom' });
      } else if (kart.referansFiyat) {
        kalemToplami = toTRY(kart.referansFiyat, kart.referansDvz || 'TL', ayarlar);
        detay.push({ tip: 'referans', ad: 'Referans Fiyat', miktar: 1, birimMaliyet: kalemToplami, satirMaliyet: kalemToplami, kaynak: 'referans' });
      }
    } else if (kart.referansFiyat) {
      kalemToplami = toTRY(kart.referansFiyat, kart.referansDvz || 'TL', ayarlar);
      detay.push({ tip: 'referans', ad: 'Referans Fiyat', miktar: 1, birimMaliyet: kalemToplami, satirMaliyet: kalemToplami, kaynak: 'referans' });
    }

    // Rota maliyeti (işçilik) — kartın kendi rotaId'si üzerinden
    let rotaMaliyeti = 0;
    if (kart.rotaId) {
      const rota = rotalar.find(r => r.id === kart.rotaId);
      if (rota) rotaMaliyeti = rota.toplamMaliyet || 0;
    }

    // Amortisman: sabit (₺) rakam, kart üzerinde manuel girilir.
    const amortismanGideri = kart.amortismanGideri || 0;

    // GYG (Genel Yönetim Gideri): (kalem+rota maliyeti) × oran, kart üzerinde
    // manuel girilen bir oranla. Bu, Fiyatlama'daki genel GYG'den farklı —
    // burada her reçeteye ÖZEL, isteğe bağlı ek bir GYG gideridir.
    const gygOraniYuzde = kart.gygOraniYuzde || 0;
    const gygGideri = (kalemToplami + rotaMaliyeti) * (gygOraniYuzde / 100);

    const toplam = kalemToplami + rotaMaliyeti + amortismanGideri + gygGideri;
    const kaynak = detay.length === 0 ? 'yok' : (eksikKalemler.length ? 'kismi' : 'recete');

    return { toplam, kalemToplami, rotaMaliyeti, amortismanGideri, gygGideri, detay, eksikKalemler, kaynak };
  }

  // ── ALT KIRILIM EXCEL DÖKÜMÜ ──────────────────────────────────────────────
  // Herhangi bir kartın (ürün/yarımamül/altmontaj/paket) TÜM reçete ağacını
  // kırılım halinde Excel'e döker. Format, kullanıcının verdiği örnek dosyayla
  // BİREBİR aynıdır: A1 başlık + A2 özet satırı + sütun başlıkları + girintili
  // ağaç (►R montaj/reçeteli, •S satınalma/hammadde işaretleriyle) + paket
  // satırları (varsa, kalın/koyu renkli ayraç satırı) + genel toplam satırı.
  // Renk paleti derinliğe göre döngüsel olarak değişir (►R: mor tonları,
  // •S: yeşil, en derin seviyede sarı) — örnek dosyadaki görsel hiyerarşiyi
  // korur.
  function kartAltKirilimSatirlariUret(kart, kartTipi, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar, paketler) {
    const satirlar = []; // {seviye, tip, paketEtiketi, stokKodu, stokAdi, miktar, birim, birimFiyat, toplamFiyat, dvz, olcu, kabaEn, kabaBoy, netEn, netBoy, rotaMaliyeti, amortismanGideri, gygOraniYuzde, gygGideri, netToplam}
    let paketSayisi = 0;

    function gez(refKart, refTip, seviye, paketEtiketi, gezilenler) {
      gezilenler = gezilenler || new Set();
      const anahtar = refTip + ':' + refKart.id;
      if (gezilenler.has(anahtar)) return;
      const yeniGezilenler = new Set(gezilenler); yeniGezilenler.add(anahtar);

      const recete = refTip === 'urun' ? receteler.find(r => r.urunId === refKart.id)
        : refTip === 'yarimamul' ? receteler.find(r => r.yarimamulId === refKart.id)
        : refTip === 'altmontaj' ? receteler.find(r => r.altMontajId === refKart.id)
        : receteler.find(r => r.paketId === refKart.id);
      if (!recete || !recete.kalemler || !recete.kalemler.length) return;

      recete.kalemler.forEach(k => {
        if (k.tip === 'hammadde') {
          const hm = hammaddeler.find(h => h.id === k.refId);
          if (!hm) return;
          const fiyatTRY = hammaddeBirimFiyatTRY(hm, ayarlar);   // kargo payı dahil
          let birimMaliyet, olcuMetni = '';
          let kabaEn = null, kabaBoy = null, netEn = null, netBoy = null;
          if (hm.tip === 'plaka' && k.olcu) {
            kabaEn = k.olcu.kabaEn || null; kabaBoy = k.olcu.kabaBoy || null;
            netEn = k.olcu.netEn || null; netBoy = k.olcu.netBoy || null;
            const alanM2 = ((k.olcu.kabaBoy || k.olcu.netBoy || 0) * (k.olcu.kabaEn || k.olcu.netEn || 0)) / 1e6;
            birimMaliyet = alanM2 * fiyatTRY;
            olcuMetni = Math.round(k.olcu.kabaEn || k.olcu.netEn || 0) + '×' + Math.round(k.olcu.kabaBoy || k.olcu.netBoy || 0);
          } else {
            birimMaliyet = fiyatTRY;
          }
          birimMaliyet *= 1 + (hm.fireYuzde || 0) / 100;
          const satirMaliyet = birimMaliyet * (k.miktar || 1);
          // Hammadde satırlarında rota/amortisman/GYG yoktur
          satirlar.push({
            seviye, tip: 'S', paketEtiketi, stokKodu: hm.stokKodu || '', stokAdi: hm.ad || '',
            miktar: k.miktar || 1, birim: hm.birim || '', birimFiyat: hm.birimFiyat || 0,
            toplamFiyat: satirMaliyet, dvz: hm.dvz || 'TL', olcu: olcuMetni,
            kabaEn, kabaBoy, netEn, netBoy,
            rotaMaliyeti: null, amortismanGideri: null, gygOraniYuzde: null, gygGideri: null, netToplam: null
          });

          // ── KENAR BANTI ALT SATIRLARI ────────────────────────────────────
          // Plaka kaleminde kenarBantlari tanımlıysa, her kenar (ön/arka/sağ/sol)
          // için ayrı bir girintili satır ekle — bant kodu, adı, metre, birim
          // fiyat ve toplam maliyet gösterilir. Böylece Excel'de hangi kenara
          // hangi bant uygulandığı ve maliyeti görülür.
          if (hm.tip === 'plaka' && k.olcu && k.kenarBantlari) {
            const kenarAdlari = { on: 'Ön Kenar', arka: 'Arka Kenar', sag: 'Sağ Kenar', sol: 'Sol Kenar' };
            const kenarOlculer = {
              on: k.olcu.netBoy || k.olcu.kabaBoy || 0,
              arka: k.olcu.netBoy || k.olcu.kabaBoy || 0,
              sag: k.olcu.netEn || k.olcu.kabaEn || 0,
              sol: k.olcu.netEn || k.olcu.kabaEn || 0
            };
            // Aynı bant birden fazla kenarda kullanılıyor olabilir — grupla
            const bantGrup = new Map(); // bantId → [{kenar, metre}]
            ['on', 'arka', 'sag', 'sol'].forEach(kenar => {
              const bantId = k.kenarBantlari[kenar];
              if (!bantId) return;
              const sonuc = kenarBandiMaliyetHesapla(kenarOlculer[kenar], bantId, hammaddeler, ayarlar);
              if (!sonuc.hammadde) return;
              if (!bantGrup.has(bantId)) bantGrup.set(bantId, { hammadde: sonuc.hammadde, kenarlar: [], toplamMetre: 0, toplamMaliyet: 0 });
              const g = bantGrup.get(bantId);
              g.kenarlar.push(kenarAdlari[kenar]);
              g.toplamMetre += sonuc.metre;
              g.toplamMaliyet += sonuc.maliyet;
            });

            bantGrup.forEach((g) => {
              const bantHm = g.hammadde;
              const toplamMaliyet = g.toplamMaliyet * (k.miktar || 1);
              satirlar.push({
                seviye: seviye + 1,    // plaka satırının bir alt seviyesi
                tip: 'B',             // B = Bant (kenar bandı alt kalemi)
                paketEtiketi,
                stokKodu: bantHm.stokKodu || '',
                stokAdi: bantHm.ad + '  [' + g.kenarlar.join(' + ') + ']',
                miktar: parseFloat((g.toplamMetre * (k.miktar || 1)).toFixed(4)),
                birim: 'METRE',
                birimFiyat: bantHm.birimFiyat || 0,
                toplamFiyat: toplamMaliyet,
                dvz: bantHm.dvz || 'TL',
                olcu: '', kabaEn: null, kabaBoy: null, netEn: null, netBoy: null,
                rotaMaliyeti: null, amortismanGideri: null, gygOraniYuzde: null, gygGideri: null, netToplam: null
              });
            });
          }
        } else if (k.tip === 'yarimamul' || k.tip === 'urun' || k.tip === 'altmontaj' || k.tip === 'paket') {
          const liste = k.tip === 'yarimamul' ? yarimamuller : (k.tip === 'urun' ? urunler : (k.tip === 'altmontaj' ? altMontajlar : paketler));
          const altKart = liste.find(x => x.id === k.refId);
          if (!altKart) return;
          const sonuc = kartMaliyetHesapla(altKart, k.tip, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar, new Set(), paketler);
          const satirMaliyet = sonuc.toplam * (k.miktar || 1);
          const yeniPaketEtiketi = k.tip === 'paket' ? altKart.kod : paketEtiketi;
          if (k.tip === 'paket') paketSayisi++;

          // ►R satırı: rota/amortisman/GYG bu kartın kendi değerlerinden gelir.
          // kartMaliyetHesapla zaten bunları hesapladı; (k.miktar) ile çarparız.
          const rotaMaliyeti = (sonuc.rotaMaliyeti || 0) * (k.miktar || 1);
          const amortismanGideri = (sonuc.amortismanGideri || 0) * (k.miktar || 1);
          const gygOraniYuzde = altKart.gygOraniYuzde || 0;
          const gygGideri = (sonuc.gygGideri || 0) * (k.miktar || 1);
          const netToplam = satirMaliyet; // toplam içinde rota+amortisman+GYG zaten dahil

          satirlar.push({
            seviye, tip: 'R', paketEtiketi: yeniPaketEtiketi, stokKodu: altKart.kod || '', stokAdi: altKart.ad || '',
            miktar: k.miktar || 1, birim: 'ADET', birimFiyat: sonuc.toplam, toplamFiyat: satirMaliyet, dvz: 'TL', olcu: '',
            kabaEn: null, kabaBoy: null, netEn: null, netBoy: null,
            rotaMaliyeti: rotaMaliyeti || null,
            amortismanGideri: amortismanGideri || null,
            gygOraniYuzde: gygOraniYuzde || null,
            gygGideri: gygGideri || null,
            netToplam: satirMaliyet
          });
          gez(altKart, k.tip, seviye + 1, yeniPaketEtiketi, yeniGezilenler);
        }
      });
    }

    gez(kart, kartTipi, 0, null, new Set());
    return { satirlar, paketSayisi };
  }

  // SheetJS ile, kartAltKirilimSatirlariUret çıktısını örnek formattaki
  // (renkli, girintili, paket gruplu) bir Excel dosyasına dönüştürüp indirir.
  function receteAltKirilimExcelIndir(kart, kartTipi, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar, paketler) {
    const { satirlar, paketSayisi } = kartAltKirilimSatirlariUret(kart, kartTipi, receteler, yarimamuller, altMontajlar, urunler, hammaddeler, rotalar, ayarlar, paketler);
    if (!satirlar.length) { toast('Bu kartın hiç reçete kalemi yok, dökülecek bir şey bulunamadı', 'err'); return; }

    const genelToplamTRY = satirlar.filter(s => s.seviye === 0).reduce((a, s) => a + s.toplamFiyat, 0);
    const genelRotaTRY   = satirlar.filter(s => s.rotaMaliyeti).reduce((a, s) => a + (s.rotaMaliyeti || 0), 0);
    const genelAmortTRY  = satirlar.filter(s => s.amortismanGideri).reduce((a, s) => a + (s.amortismanGideri || 0), 0);
    const genelGygTRY    = satirlar.filter(s => s.gygGideri).reduce((a, s) => a + (s.gygGideri || 0), 0);
    const maxSeviye = Math.max(...satirlar.map(s => s.seviye));

    const aoa = [];
    const kartAdi = kart.ad || kart.kod || '';
    // Başlık ve özet satırı — 19 sütun (A-S)
    aoa.push(['ALT KIRILIM RECETESI — ' + (kart.kod || '') + '  |  ' + kartAdi + '  |  ' + paketSayisi + ' Paket · ' + satirlar.length + ' Kayıt']);
    aoa.push(['Urun Kodu', kart.kod || '', '', '', 'Genel Toplam', '', genelToplamTRY, '', '', '', '', '', '', '', 'Rota', genelRotaTRY, 'Amortisman', genelAmortTRY, 'GYG', genelGygTRY]);
    aoa.push([]);
    aoa.push(['Sv', 'Tip', 'Paket', 'Stok Kodu', 'Stok Adı / Açıklama', 'Miktar', 'Birim', 'Birim Fiyat', 'Hammadde Top.', 'Dvz', 'Kaba En (mm)', 'Kaba Boy (mm)', 'Net En (mm)', 'Net Boy (mm)', 'Rota (İşçilik)', 'Amortisman', 'GYG %', 'GYG Tutarı', 'Net Toplam']);
    const dvzSembol = { 'TL': '₺', 'USD': '$', 'EUR': '€', '₺': '₺', '$': '$', '€': '€' };
    let paketIndex = -1, sonPaketEtiketi = null;
    satirlar.forEach(s => {
      if (s.paketEtiketi !== sonPaketEtiketi) { paketIndex++; sonPaketEtiketi = s.paketEtiketi; }
      const girinti = '  '.repeat(s.seviye);
      aoa.push([
        s.seviye, (s.tip === 'R' ? '► R' : s.tip === 'B' ? '⌐ B' : '• S'), s.seviye === 0 && s.tip === 'R' && s.paketEtiketi ? ('PKT ' + (paketIndex + 1) + '/' + paketSayisi) : '',
        girinti + s.stokKodu, girinti + s.stokAdi, s.miktar, s.birim, s.birimFiyat, s.toplamFiyat, dvzSembol[s.dvz] || s.dvz,
        s.kabaEn || '', s.kabaBoy || '', s.netEn || '', s.netBoy || '',
        s.rotaMaliyeti || '', s.amortismanGideri || '',
        s.gygOraniYuzde != null ? s.gygOraniYuzde : '',
        s.gygGideri || '', s.netToplam || ''
      ]);
    });
    aoa.push([
      'GENEL TOPLAM (' + satirlar.length + ' kayıt · ' + paketSayisi + ' paket · ' + (maxSeviye + 1) + ' seviye)', '', '', '',
      'TL Toplam: ' + fmtTL(genelToplamTRY), '', '', '', genelToplamTRY, '', '', '', '', '',
      genelRotaTRY || '', genelAmortTRY || '', '', genelGygTRY || '',
      (genelToplamTRY + genelRotaTRY + genelAmortTRY + genelGygTRY) || genelToplamTRY
    ]);

    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    const lastRow = aoa.length;
    const dataStartRow = 5, totalRow = lastRow;

    function setCell(r, c, opts) {
      const addr = window.XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      if (opts.numFmt) ws[addr].z = opts.numFmt;
    }
    // Birleştirmeler — 19 sütuna genişledi (c: 0..18)
    ws['!merges'] = ws['!merges'] || [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 18 } });
    ws['!merges'].push({ s: { r: 1, c: 1 }, e: { r: 1, c: 3 } });
    ws['!merges'].push({ s: { r: 1, c: 5 }, e: { r: 1, c: 7 } });
    setCell(2, 7, { numFmt: '#,##0.000' });

    // Veri satırı sayı formatları
    let satirNo = dataStartRow;
    satirlar.forEach(s => {
      setCell(satirNo, 6,  { numFmt: '#,##0.000' });   // Miktar
      setCell(satirNo, 8,  { numFmt: '#,##0.000' });   // Birim Fiyat
      setCell(satirNo, 9,  { numFmt: '#,##0.000' });   // Hammadde Top.
      if (s.kabaEn)          setCell(satirNo, 11, { numFmt: '0' });
      if (s.kabaBoy)         setCell(satirNo, 12, { numFmt: '0' });
      if (s.netEn)           setCell(satirNo, 13, { numFmt: '0' });
      if (s.netBoy)          setCell(satirNo, 14, { numFmt: '0' });
      if (s.rotaMaliyeti)    setCell(satirNo, 15, { numFmt: '#,##0.000' });
      if (s.amortismanGideri) setCell(satirNo, 16, { numFmt: '#,##0.000' });
      if (s.gygOraniYuzde != null && s.gygOraniYuzde !== '') setCell(satirNo, 17, { numFmt: '0.00' });
      if (s.gygGideri)       setCell(satirNo, 18, { numFmt: '#,##0.000' });
      if (s.netToplam)       setCell(satirNo, 19, { numFmt: '#,##0.000' });
      satirNo++;
    });

    // Genel toplam satırı birleştirme + format
    ws['!merges'].push({ s: { r: totalRow - 1, c: 0 }, e: { r: totalRow - 1, c: 3 } });
    setCell(totalRow, 9,  { numFmt: '#,##0.000' });
    setCell(totalRow, 15, { numFmt: '#,##0.000' });
    setCell(totalRow, 16, { numFmt: '#,##0.000' });
    setCell(totalRow, 18, { numFmt: '#,##0.000' });
    setCell(totalRow, 19, { numFmt: '#,##0.000' });

    // Sütun genişlikleri (19 sütun)
    ws['!cols'] = [
      { wch: 5 },  // Sv
      { wch: 6 },  // Tip
      { wch: 9 },  // Paket
      { wch: 28 }, // Stok Kodu
      { wch: 46 }, // Stok Adı
      { wch: 10 }, // Miktar
      { wch: 7 },  // Birim
      { wch: 14 }, // Birim Fiyat
      { wch: 14 }, // Hammadde Top.
      { wch: 6 },  // Dvz
      { wch: 11 }, // Kaba En
      { wch: 11 }, // Kaba Boy
      { wch: 10 }, // Net En
      { wch: 10 }, // Net Boy
      { wch: 14 }, // Rota (İşçilik)
      { wch: 13 }, // Amortisman
      { wch: 7 },  // GYG %
      { wch: 12 }, // GYG Tutarı
      { wch: 13 }, // Net Toplam
    ];

    // ── SATIR GRUPLANDIRMA (Excel Outline/Grup özelliği) ────────────────────
    // Örnekteki gibi, sol kenarda +/- butonlarıyla alt seviyelerin katlanıp
    // açılabilmesi için her satıra "outlineLevel" atanır. Seviye 0 (paket
    // başlık satırları, PKT 1/3 vb.) her zaman görünür kalır; seviye 1+
    // olan satırlar gruplanır ve gerektiğinde tek tıkla gizlenebilir.
    const rowsArr = [{ hpt: 28 }, { hpt: 22 }, { hpt: 16 }, { hpt: 18 }];
    satirlar.forEach(s => {
      rowsArr.push(s.seviye > 0 ? { level: Math.min(s.seviye, 7) } : {});
    });    rowsArr.push({}); // genel toplam satırı
    ws['!rows'] = rowsArr;
    // summaryBelow:false → özet (üst/PKT) satırı grubun ÜSTÜNDE durur, alt
    // kalemler onun altında açılır/kapanır (örnekteki davranışla aynı).
    ws['!outline'] = { above: true };

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Alt Kirılım Recete');
    const dosyaAdi = (kart.kod || 'Recete').replace(/[\\/:*?"<>|]/g, '_') + '_AltKirilim.xlsx';
    window.XLSX.writeFile(wb, dosyaAdi);
    toast('Excel dosyası indirildi: ' + dosyaAdi, 'ok');
  }

  // ── İSKONTO KISITLI FİYAT + KÂRLILIK ORANI ────────────────────────────────
  // Satır bazlı iskonto en fazla %50, dip (genel) iskonto en fazla %10 olabilir
  // (bu kısıtlar UI'da da uygulanır, burada hesap güvenliği için tekrar
  // kontrol edilir). Kârlılık oranı:
  //   maliyetGygNakliyeli = netMaliyet × (1+GYG%10) × (1+Nakliye%7)
  //   fark = sonIskontoluFiyat - maliyetGygNakliyeli
  //   karlilikOrani = fark / sonIskontoluFiyat
  // GYG ve Nakliye oranları Ayarlar'dan (fiyatGygYuzde, fiyatNakliyeYuzde)
  // okunur; varsayılanları sırasıyla %10 ve %7'dir.
  function iskontoluFiyatVeKarlilikHesapla(listeFiyati, satirIskontoYuzde, dipIskontoYuzde, netMaliyet, ayarlar) {
    const satirIsk = Math.min(Math.max(satirIskontoYuzde || 0, 0), 50);   // en fazla %50
    const dipIsk = Math.min(Math.max(dipIskontoYuzde || 0, 0), 10);      // en fazla %10
    const satirSonrasiFiyat = listeFiyati * (1 - satirIsk / 100);
    const sonIskontoluFiyat = satirSonrasiFiyat * (1 - dipIsk / 100);

    const gygOrani = (ayarlar.fiyatGygYuzde ?? 10) / 100;
    const nakliyeOrani = (ayarlar.fiyatNakliyeYuzde ?? 7) / 100;
    const maliyetGygNakliyeli = netMaliyet * (1 + gygOrani) * (1 + nakliyeOrani);

    const fark = sonIskontoluFiyat - maliyetGygNakliyeli;
    const karlilikOrani = sonIskontoluFiyat > 0 ? (fark / sonIskontoluFiyat) * 100 : 0;

    return { satirIsk, dipIsk, satirSonrasiFiyat, sonIskontoluFiyat, maliyetGygNakliyeli, fark, karlilikOrani };
  }

  function ymBirimMaliyetHesapla(ym, hammaddeler, ayarlar, receteler, yarimamuller, gezilenYmIdleri) {
    gezilenYmIdleri = gezilenYmIdleri || new Set();
    if (gezilenYmIdleri.has(ym.id)) {
      return { birimMaliyet: 0, kaynak: 'yok', hammaddeAdi: null, dongiVar: true };
    }

    // 1) Çok kalemli reçete (yeni sistem) — receteler koleksiyonunda bu
    // yarımamüle bağlı bir kayıt varsa onu kullan.
    if (receteler && yarimamuller) {
      const altRecete = receteler.find(r => r.yarimamulId === ym.id);
      if (altRecete && altRecete.kalemler.length) {
        const yeniGezilenler = new Set(gezilenYmIdleri); yeniGezilenler.add(ym.id);
        let toplam = 0;
        let eksikVarMi = false;
        altRecete.kalemler.forEach(k => {
          if (k.tip === 'hammadde') {
            const hm = hammaddeler.find(h => h.id === k.refId);
            if (hm) {
              const fiyatTRY = hammaddeBirimFiyatTRY(hm, ayarlar) * (1 + (hm.fireYuzde || 0) / 100);   // kargo payı dahil
              toplam += fiyatTRY * (k.miktar || 1);
            } else { eksikVarMi = true; }
          } else { // tip === 'yarimamul'
            const altYm = yarimamuller.find(y => y.id === k.refId);
            if (altYm) {
              const sonuc = ymBirimMaliyetHesapla(altYm, hammaddeler, ayarlar, receteler, yarimamuller, yeniGezilenler);
              if (sonuc.kaynak === 'yok') eksikVarMi = true;
              toplam += sonuc.birimMaliyet * (k.miktar || 1);
            } else { eksikVarMi = true; }
          }
        });
        return { birimMaliyet: toplam, kaynak: eksikVarMi ? 'kismi' : 'recete', hammaddeAdi: null };
      }
    }

    // 2) Eski/basit tek-hammadde bağlantısı (geriye dönük uyumluluk)
    const hm = hammaddeler.find(h => h.id === ym.hammaddeId);
    if (hm) {
      let birimMaliyet;
      const fiyatTRY = hammaddeBirimFiyatTRY(hm, ayarlar);   // kargo payı dahil
      if (hm.tip === 'plaka' && hm.birim === 'M2') {
        const alanM2 = ((ym.kabaBoy || ym.netBoy || 0) * (ym.kabaEn || ym.netEn || 0)) / 1e6;
        birimMaliyet = alanM2 * fiyatTRY;
      } else {
        birimMaliyet = fiyatTRY;
      }
      birimMaliyet *= 1 + (hm.fireYuzde || 0) / 100;
      return { birimMaliyet, kaynak: 'bom', hammaddeAdi: hm.ad };
    }
    // 3) Referans fiyat
    if (ym.referansFiyat) {
      return { birimMaliyet: toTRY(ym.referansFiyat, ym.referansDvz || 'TL', ayarlar), kaynak: 'referans', hammaddeAdi: null };
    }
    // 4) Hiçbiri yok
    return { birimMaliyet: 0, kaynak: 'yok', hammaddeAdi: null };
  }

  // Bir bitmiş ürünün (urunId) toplam maliyetini (hammadde+işçilik) hesaplar.
  // Reçete yoksa veya ürünün kendi referansFiyatı varsa ona düşer.
  // NOT: Artık kartMaliyetHesapla'nın ince bir sarmalayıcısıdır (rota,
  // amortisman, GYG dahil); eski imza (toplam/detay/eksikKalemler/kaynak)
  // geriye dönük uyumluluk için korunmuştur.
  function urunMaliyetHesapla(urun, receteler, yarimamuller, hammaddeler, rotalar, ayarlar, altMontajlar, urunler, paketler) {
    paketler = paketler || [];
    const sonuc = kartMaliyetHesapla(urun, 'urun', receteler, yarimamuller, altMontajlar || [], urunler || [], hammaddeler, rotalar, ayarlar, undefined, paketler);
    if (sonuc.kaynak === 'yok' && urun.referansFiyat) {
      return { toplam: toTRY(urun.referansFiyat, urun.referansDvz || 'TL', ayarlar), detay: [], eksikKalemler: [], kaynak: 'referans' };
    }
    // Kırılım da döndürülür: proje teklifi maliyet raporu hammadde ve rota
    // (işçilik) maliyetini AYRI göstermek zorundadır — tek 'toplam' yetmez.
    return {
      toplam: sonuc.toplam, detay: sonuc.detay,
      eksikKalemler: sonuc.eksikKalemler, kaynak: sonuc.kaynak,
      kalemToplami: sonuc.kalemToplami || 0,      // hammadde + alt kartlar
      rotaMaliyeti: sonuc.rotaMaliyeti || 0,      // işçilik (rotadan)
      amortismanGideri: sonuc.amortismanGideri || 0,
      gygGideri: sonuc.gygGideri || 0
    };
  }

  // ── SİPARİŞ ONAYINDA KESİM + HAMMADDE İHTİYACI OLUŞTURMA ────────────────
  // Bir siparişin kalemlerindeki ürünlerin TÜM reçete ağacını (montaj alt
  // reçeteleri dahil) gezer. İki paralel çıktı üretir:
  //   1) PLAKA tipindeki hammaddeye bağlı yarı mamüller -> Kesim İhtiyacı
  //      (Nesting sayfası, hammadde+ölçü bazlı parça listesi)
  //   2) TÜM hammadde/hırdavat kalemleri (plaka dahil, vida/menteşe/kenar bant
  //      dahil) -> Hammadde İhtiyacı (Üretim Planlama sayfası, miktar bazlı,
  //      birden fazla siparişten gelen aynı hammadde miktarları toplanır)
  async function siparisOnaylaninceKesimIhtiyaciOlustur(siparis) {
    // İDEMPOTENTLİK: bu sipariş için kesim/hammadde ihtiyacı ve raf stok
    // sarfı DAHA ÖNCE işlendiyse tekrar çalıştırılmaz — aksi halde miktarlar
    // ikinci kez üste eklenir, raf stoğu ikinci kez düşülür (bkz. aşağıdaki
    // kesimIhtiyaciIslendi ataması).
    if (siparis.kesimIhtiyaciIslendi) return null;
    const [receteler, yarimamuller, hammaddeler, urunler, altMontajlar, paketler, kesimIhtiyaclari, hammaddeIhtiyaclari, stokRaf] = await Promise.all([
      Store.receteler.all(), Store.yarimamuller.all(), Store.hammaddeler.all(), Store.urunler.all(), Store.altMontajlar.all(), Store.paketler.all(),
      Store.kesimIhtiyaclari.all(), Store.hammaddeIhtiyaclari.all(), Store.stokRaf.all()
    ]);

    const kesimToplam = new Map();    // hammaddeId (plaka) -> [{kartId, ad, en, boy, adet, grainYonu, renk}]
    const hammaddeToplam = new Map(); // hammaddeId (her tip, kenar bandı dahil) -> toplam miktar (birim cinsinden)
    const yarimamulSarfEdilen = new Map(); // ymId -> rafstan sarf edilen adet (stoktan düşülecek) — sadece yarımamüller için
    const isEmriIstekleri = [];        // rafta karşılanamayan, üretime iş emri gidecek yarımamül adetleri

    function hammaddeMiktarEkle(hammaddeId, miktar, birim) {
      const mevcut = hammaddeToplam.get(hammaddeId);
      if (mevcut) mevcut.miktar += miktar;
      else hammaddeToplam.set(hammaddeId, { miktar, birim });
    }

    function rafStokMiktari(ymId) {
      const s = stokRaf.find(x => x.ambar === 'uretim_ambari' && x.tip === 'yarimamul' && x.refId === ymId);
      return s ? s.miktar : 0;
    }

    // Bir plaka kalemine ait kenar bantlarını hammadde ihtiyacına (metre
    // bazında) ekler. k.olcu ve k.kenarBantlari, Reçete Yap ekranında
    // girilen ölçü+bant bilgisidir; carpan, üst kartların kümülatif adediyle
    // çarpılmış miktarı temsil eder.
    function kenarBantlariniEkle(k, carpan) {
      if (!k.olcu || !k.kenarBantlari) return;
      const kenarOlculer = { on: k.olcu.netBoy, arka: k.olcu.netBoy, sag: k.olcu.netEn, sol: k.olcu.netEn };
      ['on', 'arka', 'sag', 'sol'].forEach(kenar => {
        const bantId = k.kenarBantlari[kenar];
        if (!bantId) return;
        const bant = hammaddeler.find(h => h.id === bantId);
        if (!bant) return;
        const netOlcuMM = kenarOlculer[kenar] || 0;
        const metreToplam = ((netOlcuMM + 50) / 1000) * carpan;
        hammaddeMiktarEkle(bant.id, metreToplam, bant.birim || 'METRE');
      });
    }

    const paketIhtiyaclari = []; // [{paketId, kod, ad, adet}] — sipariş üzerindeki TOPLAM paket adedi (MRP/hammadde/kesim İHTİYACINA HİÇ DAHİL EDİLMEZ — sadece Üretim Tamamla/Kalite/Sevkiyat zincirinde kullanılır)
    function paketIhtiyaciEkle(paketId, adet) {
      const kart = paketler.find(p => p.id === paketId);
      const mevcut = paketIhtiyaclari.find(x => x.paketId === paketId);
      if (mevcut) mevcut.adet += adet;
      else paketIhtiyaclari.push({ paketId, kod: kart ? kart.kod : paketId, ad: kart ? kart.ad : '', adet });
    }

    // Tek bir reçete kalemini (hammadde veya yarımamül/ürün/altmontaj/paket alt
    // referansı) işler — hem üst seviye (ürün/altmontaj reçetesi) hem
    // kartGez içinden (yarımamül/altmontaj kendi reçetesi) çağrılır.
    // sahipKart: bu reçete kaleminin AİT OLDUĞU kart (yarı mamül/ürün/alt montaj).
    // Kesim parçasının hangi yarı mamülden geldiğini bilmek için şart —
    // k.refId hammaddenin kendisidir, sahibi değil.
    function kalemIsle(k, carpan, sahipKart) {
      if (k.tip === 'hammadde') {
        const hm = hammaddeler.find(h => h.id === k.refId);
        if (!hm) return;
        const adet = (k.miktar || 1) * carpan;
        if (hm.tip === 'plaka') {
          if (!kesimToplam.has(hm.id)) kesimToplam.set(hm.id, []);
          const liste = kesimToplam.get(hm.id);
          const olcu = k.olcu || {};
          const enVal = olcu.kabaEn || olcu.netEn || 0;
          const boyVal = olcu.kabaBoy || olcu.netBoy || 0;
          // AYRIM ANAHTARI: aynı parça FARKLI SİPARİŞTEN geliyorsa AYRI satır olur.
          // Sebebi: kesim listesinde ve DXF etiketinde her parçanın hangi siparişe
          // ve hangi müşteriye ait olduğu görünmeli. Tek satırda birleştirmek,
          // kesimden sonra parçaların ayrıştırılmasını imkânsız kılar.
          const parcaAnahtar = k.refId + ':' + enVal + ':' + boyVal + ':' + siparis.id;
          const mevcutParca = liste.find(p => p.refId === parcaAnahtar);
          // İZLENEBİLİRLİK: Kesilen her parçanın HANGİ YARI MAMÜLE ve HANGİ
          // SİPARİŞE ait olduğu taşınır. Aynı parça birden çok siparişten
          // geliyorsa sipariş kodları biriktirilir (tek satırda toplanır).
          // Yarı mamül bilgisi SAHİP KARTTAN gelir (k.refId hammaddedir!)
          const _ymKod = sahipKart ? (sahipKart.kod || '') : '';
          const _ymAd = sahipKart ? (sahipKart.ad || '') : '';
          const _sipKod = siparis.kod || siparis.id || '';
          const _musteri = siparis.musteriAdi || '';
          if (mevcutParca) {
            mevcutParca.adet += adet;
            if (!mevcutParca.siparisKodlari) mevcutParca.siparisKodlari = [];
            if (_sipKod && !mevcutParca.siparisKodlari.includes(_sipKod)) mevcutParca.siparisKodlari.push(_sipKod);
            if (!mevcutParca.musteriler) mevcutParca.musteriler = [];
            if (_musteri && !mevcutParca.musteriler.includes(_musteri)) mevcutParca.musteriler.push(_musteri);
          } else {
            liste.push({
              refId: parcaAnahtar,
              ad: hm.ad, en: enVal, boy: boyVal, adet,
              grainYonu: hm.grainYonu || 'yok', renk: hm.renk || '',
              ymId: sahipKart ? sahipKart.id : null, ymKod: _ymKod, ymAd: _ymAd,
              siparisId: siparis.id, siparisKodlari: _sipKod ? [_sipKod] : [],
              musteriId: siparis.musteriId || null, musteriler: _musteri ? [_musteri] : []
            });
          }
          // Kenar bandı ihtiyacı (varsa) — metre bazında hammadde ihtiyacına eklenir.
          kenarBantlariniEkle(k, adet);
        } else {
          // Hırdavat/kenar bandı/diğer doğrudan hammadde: miktar bazlı ihtiyaç
          hammaddeMiktarEkle(hm.id, adet, hm.birim);
        }
      } else if (k.tip === 'paket') {
        // ── PAKET: Hem paket ihtiyacı listesine eklenir (adet/koli takibi)
        // HEM DE paket kartının kendi alt reçetesine inilir — içindeki
        // yarımamüller, hammaddeler ve kesim ihtiyaçları üretim planına düşer.
        // Paket SANALdir (stoklanmaz, deposu yoktur) ama içindeki malzemelerin
        // hammadde/kesim ihtiyacı gerçektir — Kesim Optimizasyonu ve Hammadde
        // İhtiyacı bunları görmek zorundadır.
        paketIhtiyaciEkle(k.refId, (k.miktar || 1) * carpan);
        // Alt reçeteye in (paket ID ile)
        const pkt = paketler.find(p => p.id === k.refId);
        if (pkt) {
          const pktRecete = receteler.find(r => r.paketId === pkt.id);
          if (pktRecete) {
            pktRecete.kalemler.forEach(pk => kalemIsle(pk, carpan * (k.miktar || 1), pkt || null));
          }
        }
      } else {
        // yarimamul | urun | altmontaj — alt karta in
        kartGez(k.refId, k.tip, carpan * (k.miktar || 1));
      }
    }

    // Genelleştirilmiş kart gezici: yarımamül, ürün veya alt montaj kartının
    // reçetesine iner. Sadece YARIMAMÜLLER için raf stok sarfı uygulanır
    // (ürün/alt montaj sipariş üzerine üretilir, stoklanmaz).
    function kartGez(kartId, tip, carpan) {
      const liste = tip === 'yarimamul' ? yarimamuller : (tip === 'urun' ? urunler : altMontajlar);
      const kart = liste.find(x => x.id === kartId);
      if (!kart) return;

      let eksikCarpan = carpan;

      if (tip === 'yarimamul') {
        // ── STOKLU YARIMAMÜL SARFI ─────────────────────────────────────────
        // İstenen adetin rafta (Üretim Ambarı) ne kadarı hazır duruyorsa o
        // kadarı doğrudan stoktan sarf edilir (reçeteye inilmez, hammadde
        // ihtiyacı doğmaz); kalan (eksik) miktar için reçete patlatılıp
        // hammadde/kesim ihtiyacı hesaplanır ve üretime iş emri ihtiyacı düşer.
        const istenenAdet = Math.round((kart.adet || 1) * carpan);
        const raftaki = rafStokMiktari(kartId);
        const zatenSarfEdilen = yarimamulSarfEdilen.get(kartId) || 0;
        const kullanilabilirRaf = Math.max(0, raftaki - zatenSarfEdilen);
        const sarfEdilecek = Math.min(istenenAdet, kullanilabilirRaf);
        const eksikAdet = istenenAdet - sarfEdilecek;

        if (sarfEdilecek > 0) yarimamulSarfEdilen.set(kartId, zatenSarfEdilen + sarfEdilecek);
        if (eksikAdet <= 0) return; // tamamı raftan karşılandı, reçeteye inmeye gerek yok

        const mevcutIstek = isEmriIstekleri.find(x => x.ymId === kartId);
        if (mevcutIstek) mevcutIstek.adet += eksikAdet;
        else isEmriIstekleri.push({ ymId: kartId, ad: kart.ad, kod: kart.kod, adet: eksikAdet });

        eksikCarpan = carpan * (eksikAdet / istenenAdet);

        // Eski/basit tek-hammadde bağlantısı (geriye dönük uyumluluk) —
        // yarımamülün kendi üzerinde hammaddeId varsa ve henüz çok kalemli
        // bir reçetesi yoksa bu yol kullanılır.
        const kendiRecetesi = receteler.find(r => r.yarimamulId === kartId);
        if (!kendiRecetesi && kart.hammaddeId) {
          const hm = hammaddeler.find(h => h.id === kart.hammaddeId);
          if (hm) {
            const adet = Math.round((kart.adet || 1) * eksikCarpan);
            if (hm.tip === 'plaka') {
              if (!kesimToplam.has(hm.id)) kesimToplam.set(hm.id, []);
              const liste2 = kesimToplam.get(hm.id);
              const mevcutParca = liste2.find(p => p.refId === kartId);
              if (mevcutParca) mevcutParca.adet += adet;
              else liste2.push({ refId: kartId, ad: kart.ad, en: kart.kabaEn || kart.netEn || 0, boy: kart.kabaBoy || kart.netBoy || 0, adet, grainYonu: hm.grainYonu || 'yok', renk: kart.renk || hm.renk || '' });
            } else {
              hammaddeMiktarEkle(hm.id, adet, hm.birim);
            }
            return; // yaprak parça, alt reçeteye inmeye gerek yok
          }
        }
      }

      // Çok kalemli reçete (ürün/yarımamül/alt montaj hepsi için ortak yol)
      const recete = tip === 'urun' ? receteler.find(r => r.urunId === kartId)
        : tip === 'yarimamul' ? receteler.find(r => r.yarimamulId === kartId)
        : receteler.find(r => r.altMontajId === kartId);
      if (recete) {
        recete.kalemler.forEach(k => kalemIsle(k, eksikCarpan, kart));
      }

      // Kartın kendi ROTASI varsa (işçilik), bu sipariş bazında bir maliyet
      // çıkışı değildir (sadece fiyatlamada kullanılır) — burada ekstra bir
      // şey yapmaya gerek yok, üretim süreci İş Emirleri'nde zaten rotaya
      // göre planlanıyor.
    }

    (siparis.kalemler || []).forEach(kalem => {
      const miktar = kalem.miktar || 1;
      if (kalem.grup === 'hammadde') {
        const hm = hammaddeler.find(h => h.stokKodu === kalem.kod);
        if (hm && hm.tip !== 'plaka') hammaddeMiktarEkle(hm.id, miktar, hm.birim);
        return;
      }
      if (kalem.grup === 'yarimamul') {
        const ym = yarimamuller.find(y => y.kod === kalem.kod);
        if (ym) kartGez(ym.id, 'yarimamul', miktar);
        return;
      }
      if (kalem.grup === 'altmontaj') {
        const am = altMontajlar.find(a => a.kod === kalem.kod);
        if (am) kartGez(am.id, 'altmontaj', miktar);
        return;
      }
      if (kalem.grup === 'paket') {
        const pk = paketler.find(p => p.kod === kalem.kod);
        if (pk) {
          paketIhtiyaciEkle(pk.id, miktar);
          const pktRecete = receteler.find(r => r.paketId === pk.id);
          if (pktRecete) pktRecete.kalemler.forEach(k => kalemIsle(k, miktar, pk || null));
        }
        return;
      }
      // varsayılan: ürün
      const urun = urunler.find(u => u.kod === kalem.kod);
      if (!urun) return;
      kartGez(urun.id, 'urun', miktar);
    });

    let olusturulan = 0, guncellenen = 0;

    // 1) Kesim ihtiyaçları (plaka)
    kesimToplam.forEach((parcalar, hammaddeId) => {
      let satir = kesimIhtiyaclari.find(k => k.hammaddeId === hammaddeId && k.durum === 'acik');
      if (!satir) {
        satir = { id: uid('KSI'), hammaddeId, durum: 'acik', parcalar: [], kaynakSiparisler: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        kesimIhtiyaclari.push(satir);
        olusturulan++;
      } else {
        guncellenen++;
      }
      parcalar.forEach(p => {
        const mevcut = satir.parcalar.find(x => x.refId === p.refId && x.manuel !== true);
        if (mevcut) mevcut.adet += p.adet;
        else satir.parcalar.push({ ...p, manuel: false });
      });
      if (!satir.kaynakSiparisler.includes(siparis.id)) satir.kaynakSiparisler.push(siparis.id);
    });
    await Store.kesimIhtiyaclari.save(kesimIhtiyaclari);

    // 2) Hammadde/Hırdavat ihtiyaçları (TÜM kalemler, ortak/konsolide tek liste)
    // Tek bir "açık" parti olur; Planlama onaylayana kadar farklı siparişlerden
    // gelen miktarlar bu partiye birikir. Planlama onayladığında parti kapanır
    // ve Satınalma'ya yeni bir satınalma talebi seti olarak geçer (aşağıdaki
    // planlamaOnayindaSatinalmayaGonder fonksiyonunda).
    let hammaddeGuncellenen = 0, hammaddeOlusturulan = 0;
    if (hammaddeToplam.size) {
      let acikParti = hammaddeIhtiyaclari.find(p => p.durum === 'acik');
      if (!acikParti) {
        acikParti = { id: uid('HIH'), durum: 'acik', kalemler: [], kaynakSiparisler: [], olusturmaTarihi: new Date().toISOString().slice(0, 10) };
        hammaddeIhtiyaclari.push(acikParti);
      }
      hammaddeToplam.forEach((info, hammaddeId) => {
        const mevcutKalem = acikParti.kalemler.find(k => k.hammaddeId === hammaddeId && !k.manuelEklendi);
        if (mevcutKalem) { mevcutKalem.miktar += info.miktar; hammaddeGuncellenen++; }
        else { acikParti.kalemler.push({ hammaddeId, miktar: info.miktar, birim: info.birim, manuelEklendi: false }); hammaddeOlusturulan++; }
      });
      if (!acikParti.kaynakSiparisler.includes(siparis.id)) acikParti.kaynakSiparisler.push(siparis.id);
      await Store.hammaddeIhtiyaclari.save(hammaddeIhtiyaclari);
    }

    // 2b) Bu siparişin gerektirdiği hammadde miktarları (kesim için plaka
    // hariç, doğrudan hammadde/hırdavat) SİPARİŞİN KENDİSİNE de kaydedilir —
    // "Üretimi Tamamla" tıklandığında bu liste üzerinden Hammadde Deposu'ndan
    // GERÇEK stok düşümü yapılır (satın alınıp depoya girmiş olan hammadde,
    // üretimde fiilen kullanıldığında deposundan sarf edilir).
    const gerekenHammaddeler = [];
    hammaddeToplam.forEach((info, hammaddeId) => {
      const hm = hammaddeler.find(h => h.id === hammaddeId);
      gerekenHammaddeler.push({ hammaddeId, hammaddeKod: hm ? hm.stokKodu : '', hammaddeAd: hm ? hm.ad : '', miktar: info.miktar, birim: info.birim });
    });
    siparis.gerekenHammaddeler = gerekenHammaddeler;

    // 2c) Bu siparişin gerektirdiği PAKET adetleri SİPARİŞİN KENDİSİNE kaydedilir
    // — Üretim Tamamla, Kalite Onayı ve Sevkiyat İrsaliyesi ekranları bu listeyi
    // kullanarak "reçeteye uygun paket adedi" kontrolü yapar. Paketler MRP'ye
    // hiç girmediği için (bkz. yukarıdaki kalemIsle) başka hiçbir koleksiyona
    // (kesim/hammadde ihtiyacı, stok) yazılmaz — sadece bu alanda durur.
    siparis.gerekenPaketler = paketIhtiyaclari.map(p => ({ ...p, onaylananAdet: 0, kaliteOnayli: false, sevkEdildi: false }));
    siparis.kesimIhtiyaciIslendi = true;
    await Store.siparisler.upsert(siparis);

    // 3) Rafta hazır olan yarımamüllerden sarf edilenleri stoktan düş.
    let stokSarfEdilen = 0;
    if (yarimamulSarfEdilen.size) {
      const guncelStokRaf = await Store.stokRaf.all();
      yarimamulSarfEdilen.forEach((adet, ymId) => {
        if (adet <= 0) return;
        const ym = yarimamuller.find(y => y.id === ymId);
        stokMiktarGuncelle(guncelStokRaf, 'uretim_ambari', 'yarimamul', ymId, ym ? ym.kod : '', ym ? ym.ad : '', 'ADET', -adet);
        stokSarfEdilen++;
      });
      await Store.stokRaf.save(guncelStokRaf);
    }

    // 4) Rafta karşılanamayan (eksik) yarımamül miktarları için üretime iş
    // emri ihtiyacı kaydı oluştur — Üretim Planlama "İş Emri İhtiyaçları"
    // sekmesinde bunları görür ve iş emrine dönüştürür.
    let isEmriIhtiyaciOlusturulan = 0;
    if (isEmriIstekleri.length) {
      const uretimIsEmriIhtiyaclari = await Store.uretimIsEmriIhtiyaclari.all();
      isEmriIstekleri.forEach(istek => {
        const mevcut = uretimIsEmriIhtiyaclari.find(x => x.yarimamulId === istek.ymId && x.durum === 'acik');
        if (mevcut) { mevcut.adet += istek.adet; if (!mevcut.kaynakSiparisler.includes(siparis.id)) mevcut.kaynakSiparisler.push(siparis.id); }
        else { uretimIsEmriIhtiyaclari.push({ id: uid('UII'), yarimamulId: istek.ymId, yarimamulKod: istek.kod, yarimamulAd: istek.ad, adet: istek.adet, durum: 'acik', kaynakSiparisler: [siparis.id], olusturmaTarihi: new Date().toISOString().slice(0, 10) }); isEmriIhtiyaciOlusturulan++; }
      });
      await Store.uretimIsEmriIhtiyaclari.save(uretimIsEmriIhtiyaclari);
    }

    return { olusturulan, guncellenen, hammaddeOlusturulan, hammaddeGuncellenen, stokSarfEdilen, isEmriIhtiyaciOlusturulan };
  }

  // ── ÜRETİM TAMAMLANINCA FAZLA ÜRETİLEN YARIMAMÜL/HAMMADDE STOĞA GERİ EKLENİR
  // İş emri kapatılırken, talep edilenden FAZLA üretilen (veya satınalmada
  // fazla sipariş edilen) miktarlar otomatik olarak ilgili rafa/stoğa eklenir.
  async function fazlaMalzemeyiStogaEkle(tip, refId, refKod, refAd, birim, fazlaMiktar) {
    if (fazlaMiktar <= 0) return;
    const stokRaf = await Store.stokRaf.all();
    const ambar = tip === 'yarimamul' ? 'uretim_ambari' : 'hammadde_deposu';
    stokMiktarGuncelle(stokRaf, ambar, tip, refId, refKod, refAd, birim, fazlaMiktar);
    await Store.stokRaf.save(stokRaf);
    const stokHareketleri = await Store.stokHareketleri.all();
    stokHareketleri.push({
      id: uid('HRK'), tip: 'giris', ambar, kalemAdi: refAd, miktar: fazlaMiktar,
      aciklama: 'İhtiyaçtan fazla üretilen/satın alınan miktar stoğa eklendi', tarih: new Date().toISOString().slice(0, 10)
    });
    await Store.stokHareketleri.save(stokHareketleri);
  }

  // ── PLANLAMA (veya DEPO) ONAYI: hammadde ihtiyacı partisini kapat, her
  // kalemi Satınalma Paneli'nde görünecek bir satınalma talebi olarak aç ──
  async function hammaddeIhtiyaciOnaylaSatinalmayaGonder(parti) {
    const [hammaddeler, satinalmaTalepleri] = await Promise.all([Store.hammaddeler.all(), Store.satinalmaTalepleri.all()]);
    let olusturulanTalepSayisi = 0;
    parti.kalemler.forEach(k => {
      const hm = hammaddeler.find(h => h.id === k.hammaddeId);
      const talep = {
        id: uid('SAT'),
        kod: 'SAT-' + Date.now().toString(36).toUpperCase() + '-' + olusturulanTalepSayisi,
        kaynakTalepId: null,
        kaynakHammaddeIhtiyaciId: parti.id,
        kalemAdi: hm ? hm.ad : 'Bilinmeyen hammadde',
        hammaddeId: k.hammaddeId, miktar: k.miktar,
        birim: k.birim || (hm ? hm.birim : 'ADET'),
        tedarikciId: null, tedarikciAdi: null,
        not: 'Üretim Planlama onayıyla hammadde ihtiyacından otomatik oluşturuldu.',
        durum: 'teklif_bekleniyor',
        tarih: new Date().toISOString().slice(0, 10)
      };
      satinalmaTalepleri.push(talep);
      olusturulanTalepSayisi++;
    });
    await Store.satinalmaTalepleri.save(satinalmaTalepleri);

    parti.durum = 'onaylandi';
    parti.onayTarihi = new Date().toISOString().slice(0, 10);
    await Store.hammaddeIhtiyaclari.upsert(parti);

    return { olusturulanTalepSayisi };
  }

  // ── ÇEK REZERVASYONU: YÖNETİM ONAYI → GERÇEK CİRO ────────────────────────
  // Satınalma siparişine ödeme planı girilirken seçilen (rezerve edilen)
  // çekler, Yönetim siparişi ONAYLAYINCA gerçek ciroya döner: musteriCekleri
  // kaydı 'ciro_edildi' olur, ve Muhasebe Panel → Tedarikçi Ödemeleri
  // sekmesinde görünecek gerçek bir tedarikciOdemeleri kaydı oluşturulur.
  // ── TAHSİLAT YAP (MANUEL GİRİŞ) → YÖNETİM ONAYI BEKLER ──────────────────
  // KULLANICI KARARI: Muhasebe Panel → Tahsilatlar → "+ Tahsilat Kaydı Ekle"
  // formundan girilen TÜM ödeme kalemleri (peşinat+çek+kredi kartı+nakit)
  // artık ANINDA kasaya/cariye İŞLENMEZ — "tahsilatOnayBekleyenler" listesine
  // düşer, Yönetim Onayı ekranından onaylanmadan hiçbir bakiye/kasa hareketi
  // oluşmaz. Çek kalemleri de müşteriCekleri'ne henüz EKLENMEZ — Satınalma'daki
  // tedarikçi çeki rezervasyonuna PARALEL bir mantıkla, onay bekleyen kayıt
  // "rezerve" gibi davranır; Yönetim ONAYLAYINCA çek gerçekten "elde" (kasaya
  // girmiş, Satınalma tarafından kullanılabilir) duruma geçer.
  async function tahsilatOdemePlaniOnayaGonder(musteriId, musteriAdi, odemePlani) {
    const tahsilatOnayBekleyenler = await Store.tahsilatOnayBekleyenler.all();
    const kayit = {
      id: uid('TOB'), musteriId, musteriAdi, odemePlani,
      durum: 'onay_bekliyor', olusturmaTarihi: new Date().toISOString().slice(0, 10)
    };
    tahsilatOnayBekleyenler.push(kayit);
    await Store.tahsilatOnayBekleyenler.save(tahsilatOnayBekleyenler);
    return kayit;
  }

  // Yönetim ONAYLADIĞINDA: peşinat/kredi kartı/nakit kalemleri gerçek
  // `tahsilatlar` kaydı olarak işlenir ve müşteri bakiyesinden düşülür; çek
  // kalemleri AYRICA musteriCekleri'ne "elde" olarak eklenir (Satınalma'da
  // hemen kullanılabilir hale gelir).
  async function tahsilatOnayBekleyenOnayla(tahsilatOnayBekleyenId) {
    const tahsilatOnayBekleyenler = await Store.tahsilatOnayBekleyenler.all();
    const kayit = tahsilatOnayBekleyenler.find(x => x.id === tahsilatOnayBekleyenId);
    if (!kayit || kayit.durum !== 'onay_bekliyor') return null;

    const op = kayit.odemePlani || {};
    const bugun = new Date().toISOString().slice(0, 10);
    const musteriler = await Store.musteriler.all();
    const musteri = musteriler.find(m => m.id === kayit.musteriId);
    const musteriCekleri = await Store.musteriCekleri.all();
    const tahsilatlar = await Store.tahsilatlar.all();
    const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı', nakit: 'Nakit', diger: 'Diğer' };
    let toplamIslenenTutar = 0;

    function tahsilatKaydiEkle(tip, tutar, detay) {
      tahsilatlar.push({
        id: uid('TAH'), tarih: bugun, musteriId: kayit.musteriId, musteriAdi: kayit.musteriAdi,
        tip, detay, tutar, kaynakTahsilatOnayBekleyenId: kayit.id
      });
      toplamIslenenTutar += tutar;
    }

    if (op.pesinatTutar > 0) tahsilatKaydiEkle('nakit', op.pesinatTutar, 'Peşinat (Tahsilat Yap onayı)');

    (op.odemeKalemleri || []).forEach(k => {
      const detayParcalari = [];
      if (k.cekNo) detayParcalari.push('Çek No: ' + k.cekNo);
      if (k.taksitTipi) detayParcalari.push(k.taksitTipi === 'vadeli' ? (k.taksitSayisi + ' Taksit') : 'Tek Çekim');
      if (k.aciklama) detayParcalari.push(k.aciklama);
      const detay = (tipLabel[k.tip] || k.tip) + (detayParcalari.length ? ' — ' + detayParcalari.join(', ') : '');

      if (k.tip === 'cek') {
        // Çek: kasaya tahsilat olarak işlenir VE "elde" çekler listesine eklenir.
        musteriCekleri.push({
          id: uid('MCK'), musteriId: kayit.musteriId, musteriAdi: kayit.musteriAdi,
          cekNo: k.cekNo || '—', tutar: k.tutar, vadeTarihi: k.tarih,
          alisTarihi: bugun, durum: 'elde', kaynakTahsilatOnayBekleyenId: kayit.id
        });
        tahsilatKaydiEkle('cek', k.tutar, detay);
      } else {
        tahsilatKaydiEkle(k.tip, k.tutar, detay);
      }
    });

    if (musteri) {
      musteri.bakiye = (musteri.bakiye || 0) - toplamIslenenTutar;
      await Store.musteriler.save(musteriler);
    }

    kayit.durum = 'onaylandi';
    kayit.onayTarihi = bugun;
    await Store.tahsilatOnayBekleyenler.save(tahsilatOnayBekleyenler);
    await Store.musteriCekleri.save(musteriCekleri);
    await Store.tahsilatlar.save(tahsilatlar);
    return kayit;
  }

  // Yönetim REDDEDERSE: hiçbir kasa/bakiye hareketi oluşmaz, kayıt sadece
  // "reddedildi" olarak işaretlenir.
  async function tahsilatOnayBekleyenReddet(tahsilatOnayBekleyenId) {
    const tahsilatOnayBekleyenler = await Store.tahsilatOnayBekleyenler.all();
    const kayit = tahsilatOnayBekleyenler.find(x => x.id === tahsilatOnayBekleyenId);
    if (!kayit) return null;
    kayit.durum = 'reddedildi';
    await Store.tahsilatOnayBekleyenler.save(tahsilatOnayBekleyenler);
    return kayit;
  }

  async function tedarikciOdemeRezervasyonunuKesinlestir(satinalmaSiparisi) {
    const cekKalemleri = ((satinalmaSiparisi.odemePlani || {}).odemeKalemleri || []).filter(k => k.tip === 'cek' && k.musteriCekId);
    if (!cekKalemleri.length) return;
    const musteriCekleri = await Store.musteriCekleri.all();
    const tedarikciOdemeleri = await Store.tedarikciOdemeleri.all();
    cekKalemleri.forEach(k => {
      const cek = musteriCekleri.find(c => c.id === k.musteriCekId);
      if (!cek || cek.durum !== 'rezerve') return;
      cek.durum = 'ciro_edildi';
      cek.ciroTarihi = new Date().toISOString().slice(0, 10);
      cek.ciroEdilenTedarikciId = satinalmaSiparisi.tedarikciId;
      cek.ciroEdilenTedarikciAdi = satinalmaSiparisi.tedarikciAdi;
      tedarikciOdemeleri.push({
        id: uid('TO'), tarih: cek.ciroTarihi, tedarikciId: satinalmaSiparisi.tedarikciId, tedarikciAdi: satinalmaSiparisi.tedarikciAdi,
        tip: 'cek_ciro', detay: 'Müşteri: ' + (cek.musteriAdi || '') + ', Çek No: ' + cek.cekNo + ', Vade: ' + cek.vadeTarihi + ' (Satınalma: ' + satinalmaSiparisi.kod + ')',
        tutar: cek.tutar, cekId: cek.id, satinalmaSiparisId: satinalmaSiparisi.id
      });
    });
    await Store.musteriCekleri.save(musteriCekleri);
    await Store.tedarikciOdemeleri.save(tedarikciOdemeleri);
  }

  // Yönetim siparişi REDDEDERSE, rezerve edilmiş çekler tekrar 'elde'
  // durumuna döner — başka bir satınalma siparişinde kullanılabilir.
  async function tedarikciOdemeRezervasyonunuIptalEt(satinalmaSiparisi) {
    const cekKalemleri = ((satinalmaSiparisi.odemePlani || {}).odemeKalemleri || []).filter(k => k.tip === 'cek' && k.musteriCekId);
    if (!cekKalemleri.length) return;
    const musteriCekleri = await Store.musteriCekleri.all();
    cekKalemleri.forEach(k => {
      const cek = musteriCekleri.find(c => c.id === k.musteriCekId);
      if (cek && cek.durum === 'rezerve') { cek.durum = 'elde'; delete cek.rezerveSiparisId; delete cek.rezerveSiparisKod; }
    });
    await Store.musteriCekleri.save(musteriCekleri);
  }

  // ── SATINALMA SİPARİŞİ YÖNETİM ONAYINDA: OTOMATİK DEPO GİRİŞİ BEKLEMESİ ────
  // Yönetim bir satınalma siparişini onayladığında, depocu için Hammadde
  // Deposu'na "beklenen giriş" kaydı açılır. Depocu bu kayıt üzerinden
  // irsaliye/fatura no girip cari kontrolü yapıp onaylar.
  async function satinalmaSiparisiOnaylaninceDepoGirisiOlustur(siparis) {
    const depoGirisleri = await Store.depoGirisleri.all();
    const giris = {
      id: uid('DGR'),
      satinalmaSiparisId: siparis.id, satinalmaSiparisKod: siparis.kod,
      tedarikciId: siparis.tedarikciId, tedarikciAdi: siparis.tedarikciAdi,
      hammaddeId: siparis.hammaddeId, kalemAdi: siparis.kalemAdi,
      siparisMiktari: siparis.miktar, birim: siparis.birim,
      durum: 'bekliyor',
      olusturmaTarihi: new Date().toISOString().slice(0, 10)
    };
    depoGirisleri.push(giris);
    await Store.depoGirisleri.save(depoGirisleri);
    return giris;
  }

  // Depo girişi onaylandığında (kalite problemi yoksa) Hammadde Deposu'na
  // gelen miktar kadar stok ekler ve stok hareketi kaydeder.
  async function depoGirisiOnaylaStokEkle(giris) {
    const stokRaf = await Store.stokRaf.all();
    const hammaddeler = await Store.hammaddeler.all();
    const hm = hammaddeler.find(h => h.id === giris.hammaddeId);
    stokMiktarGuncelle(stokRaf, 'hammadde_deposu', 'hammadde', giris.hammaddeId, hm ? hm.stokKodu : '', giris.kalemAdi, giris.birim, giris.gelenMiktar);
    await Store.stokRaf.save(stokRaf);

    const hareket = {
      id: uid('HRK'), tip: 'giris', ambar: 'hammadde_deposu', kalemAdi: giris.kalemAdi,
      miktar: giris.gelenMiktar, aciklama: 'Depo girişi: ' + giris.satinalmaSiparisKod + (giris.irsaliyeNo ? ' (İrs: ' + giris.irsaliyeNo + ')' : ''),
      tarih: giris.girisTarihi || new Date().toISOString().slice(0, 10)
    };
    await Store.stokHareketleri.upsert(hareket);

    // Eğer satınalma siparişi tamamlandıysa durumunu güncelle ve gerçekleşen
    // alış bedelini (KDV dahil) gider olarak muhasebeye işle.
    if (giris.satinalmaSiparisId) {
      const satinalmaSiparisleri = await Store.satinalmaSiparisleri.all();
      const sas = satinalmaSiparisleri.find(s => s.id === giris.satinalmaSiparisId);
      if (sas) {
        sas.durum = 'tamamlandi';
        await Store.satinalmaSiparisleri.upsert(sas);
        // Hammadde/hırdavat alımı varsayılan olarak %18 KDV ile (genel oran)
        // gider olarak kaydedilir; gelen gerçek miktar üzerinden hesaplanır.
        const kdvOraniGider = hm && hm.kdvOraniYuzde != null ? hm.kdvOraniYuzde : (state.ayarlar.kdvOraniYuzde ?? 18);
        const matrahGider = toTRY(giris.gelenMiktar * (sas.birimFiyat || 0), sas.dvz || 'TL', state.ayarlar);
        const kdvTutariGider = matrahGider * (kdvOraniGider / 100);
        await muhasebeKaydiOlustur({
          tip: 'gider', kategori: 'hammadde_alimi',
          aciklama: 'Hammadde/hırdavat alımı: ' + giris.kalemAdi + ' — ' + (giris.tedarikciAdi || ''),
          tutar: matrahGider + kdvTutariGider, matrah: matrahGider, kdvOrani: kdvOraniGider, kdvTutari: kdvTutariGider,
          kaynakId: giris.id, kaynakTip: 'depo_girisi'
        });
      }
    }
  }

  // ── ÜRETİM ONAYINDA OTOMATİK AMBAR TRANSFERİ: Hammadde Deposu → Üretim Ambarı
  // Bir iş emri/üretim partisi başladığında, gerekli hammadde ve yarımamülleri
  // Hammadde Deposu'ndan düşüp Üretim Ambarı'na ekler.
  // Üretim tamamlandığında, sipariş onayında hesaplanmış hammadde ihtiyacı
  // Hammadde Deposu'ndan GERÇEKTEN düşülür (tüketilir) — başka bir ambara
  // eklenmez, çünkü bu malzeme artık bitmiş ürünün içinde harcanmıştır.
  async function uretimBaslarkenHammaddeCek(kalemler) {
    // kalemler: [{tip:'hammadde'|'yarimamul', refId, refKod, refAd, birim, miktar}]
    const stokRaf = await Store.stokRaf.all();
    const stokHareketleri = await Store.stokHareketleri.all();
    kalemler.forEach(k => {
      stokMiktarGuncelle(stokRaf, 'hammadde_deposu', k.tip, k.refId, k.refKod, k.refAd, k.birim, -k.miktar);
      stokHareketleri.push({ id: uid('HRK'), tip: 'cikis', ambar: 'hammadde_deposu', kalemAdi: k.refAd, miktar: k.miktar, aciklama: 'Üretimde sarf edildi (tüketildi)', tarih: new Date().toISOString().slice(0, 10) });
    });
    await Store.stokRaf.save(stokRaf);
    await Store.stokHareketleri.save(stokHareketleri);
  }

  // ── ÜRETİM TAMAMLANINCA OTOMATİK AMBAR TRANSFERİ: Üretim Ambarı → Sevkiyat Deposu
  // Üretimi tamamlanan bitmiş ürün, Üretim Ambarı'ndan düşüp Sevkiyat Deposu'na
  // (bitmiş ürün olarak) eklenir.
  async function uretimTamamlaninceUrunGirisiYap(urunId, urunKod, urunAd, miktar) {
    const stokRaf = await Store.stokRaf.all();
    const stokHareketleri = await Store.stokHareketleri.all();
    const ambarTransferleri = await Store.ambarTransferleri.all();
    // Üretim ambarındaki yarı mamuller doğrudan ürüne dönüşmüş kabul edilir;
    // burada sadece hedef (Sevkiyat Deposu) tarafına bitmiş ürün eklenir.
    stokMiktarGuncelle(stokRaf, 'sevkiyat_deposu', 'urun', urunId, urunKod, urunAd, 'ADET', miktar);
    await Store.stokRaf.save(stokRaf);
    ambarTransferleri.push({ id: uid('TRF'), kaynakAmbar: 'uretim_ambari', hedefAmbar: 'sevkiyat_deposu', kalemAdi: urunAd, miktar, aciklama: 'Üretim tamamlandı, bitmiş ürün girişi', tarih: new Date().toISOString().slice(0, 10) });
    stokHareketleri.push({ id: uid('HRK'), tip: 'giris', ambar: 'sevkiyat_deposu', kalemAdi: urunAd, miktar, aciklama: 'Üretimden gelen bitmiş ürün', tarih: new Date().toISOString().slice(0, 10) });
    await Store.stokHareketleri.save(stokHareketleri);
    await Store.ambarTransferleri.save(ambarTransferleri);
  }

  // ── SEVKİYATTA OTOMATİK STOK ÇIKIŞI: Sevkiyat Deposu'ndan düşer ────────────
  async function sevkiyatYapilinceStoktanDus(urunId, urunAd, miktar, siparisId) {
    const stokRaf = await Store.stokRaf.all();
    const stokHareketleri = await Store.stokHareketleri.all();
    stokMiktarGuncelle(stokRaf, 'sevkiyat_deposu', 'urun', urunId, '', urunAd, 'ADET', -miktar);
    await Store.stokRaf.save(stokRaf);
    // siparisId burada MUTLAKA yazılmalı — İş Emri/Sipariş İptal ekranındaki
    // "bu işe bağlı stok çıkışı yapılmış mı" engel kontrolü (bkz.
    // page_iptal_islemleri.js engelleriBul) bu alanı arıyor; yoksa sevk
    // edilmiş bir sipariş sarf engeli hiç tetiklenmeden "açık" görünebilirdi.
    stokHareketleri.push({ id: uid('HRK'), tip: 'cikis', ambar: 'sevkiyat_deposu', kalemAdi: urunAd, miktar, siparisId: siparisId || null, aciklama: 'Sevkiyat ile müşteriye gönderildi', tarih: new Date().toISOString().slice(0, 10) });
    await Store.stokHareketleri.save(stokHareketleri);
  }

  // ── SİPARİŞ ONAYLANIP PLANLAMAYA DÜŞTÜĞÜNDE: ÖDEME PLANINI ANINDA İŞLE ───
  // KULLANICI KARARI: Sipariş Yönetim tarafından onaylanıp üretim kuyruğuna
  // düştüğü anda, ödeme planındaki PEŞİNAT + ÇEK + KREDİ KARTI kalemlerinin
  // TAMAMI "gerçekleşmiş ve kasaya girmiş" sayılır — artık ayrı bir Tahsilat
  // onayı BEKLENMEZ:
  //   • Peşinat: HER ZAMAN tam tutarıyla, vade farksız kasaya girer.
  //   • Çek: tutarı (vade farkı düşülerek net) kasaya girer VE çek aynı anda
  //     "elde" (kullanılabilir) listesine eklenir — Satınalma hemen tedarikçiye
  //     verebilir.
  //   • Kredi Kartı: tutarı (vade farkı düşülerek net) kasaya girer.
  //   • Vade farkı = tutar × (müşterinin aylikVadeFarkiYuzde) × (vade
  //     tarihine kadar olan ay sayısı, yukarı yuvarlanır). Vade farkı tutarı
  //     kasaya girmez, ayrı bir "vade farkı geliri" olarak izlenir (müşteri
  //     bazlı raporlama için vadeFarkiKayitlari'na yazılır).
  //   • Sadece NAKİT kalemleri, eğer vade tarihi BUGÜNDEN İLERİDEYSE,
  //     tahsilatBeklenenler'e düşer — bunlar Cari/Üst Yönetim'in "ileri
  //     tarihli nakit alacak" uyarısını tetikleyecek tek kalemlerdir. Nakit
  //     kalemin vadesi bugün veya geçmişse (peşin nakit), o da anında işlenir.
  // Müşteri bakiyesi: NET kasaya giren toplamla güncellenir (yani bakiye,
  // vade farkı kadar daha düşük artar — vade farkı müşteriden ayrıca tahsil
  // edilen bir gelirdir, esas mal/hizmet borcuna eklenmez).
  async function siparisOnaylaninceOdemePlaniniAnindaIsle(siparis, musteri) {
    // İDEMPOTENTLİK: aynı sipariş için ödeme planı DAHA ÖNCE anında işlendiyse
    // (çek/kredi kartı ANINDA "elde"/kasaya yazıldıysa) tekrar çalıştırılmaz —
    // aksi halde çekler ikinci kez oluşturulur, müşteri bakiyesi ikinci kez düşer.
    if (siparis.odemePlaniIslendi) return null;
    const op = siparis.odemePlani || {};
    const pesinatTutar = op.pesinatTutar || 0;
    const odemeKalemleri = op.odemeKalemleri || [];
    const bugun = new Date().toISOString().slice(0, 10);
    const aylikVadeFarkiYuzde = (musteri && musteri.aylikVadeFarkiYuzde) || 0;

    let netKasaToplami = pesinatTutar; // peşinat her zaman tam, vade farksız
    let toplamVadeFarki = 0;
    const musteriCekleri = await Store.musteriCekleri.all();
    const vadeFarkiKayitlari = await Store.vadeFarkiKayitlari.all();
    const tahsilatBeklenenler = await Store.tahsilatBeklenenler.all();
    const ileriTarihliNakitler = [];

    function ayFarkiHesapla(vadeTarihiStr) {
      if (!vadeTarihiStr) return 0;
      const bugunD = new Date(bugun), vadeD = new Date(vadeTarihiStr);
      const gunFarki = Math.max(0, Math.round((vadeD - bugunD) / 86400000));
      return Math.ceil(gunFarki / 30); // başlayan her 30 gün 1 ay sayılır
    }

    odemeKalemleri.forEach(k => {
      if (k.tip === 'cek') {
        const aySayisi = ayFarkiHesapla(k.tarih);
        const vadeFarki = k.tutar * (aylikVadeFarkiYuzde / 100) * aySayisi;
        const netTutar = k.tutar - vadeFarki;
        netKasaToplami += netTutar;
        toplamVadeFarki += vadeFarki;
        if (vadeFarki > 0) {
          vadeFarkiKayitlari.push({
            id: uid('VF'), musteriId: siparis.musteriId, musteriAdi: siparis.musteriAdi,
            siparisId: siparis.id, siparisKod: siparis.kod, tip: 'cek',
            brutTutar: k.tutar, vadeFarki, netTutar, aySayisi: aySayisi, tarih: bugun
          });
        }
        // Çek ANINDA "elde" (kullanılabilir) listesine eklenir.
        musteriCekleri.push({
          id: uid('MCK'), musteriId: siparis.musteriId, musteriAdi: siparis.musteriAdi,
          cekNo: k.cekNo || '—', tutar: k.tutar, vadeTarihi: k.tarih,
          alisTarihi: bugun, durum: 'elde', kaynakSiparisId: siparis.id
        });
      } else if (k.tip === 'kredi_karti') {
        const aySayisi = ayFarkiHesapla(k.tarih);
        const vadeFarki = k.tutar * (aylikVadeFarkiYuzde / 100) * aySayisi;
        const netTutar = k.tutar - vadeFarki;
        netKasaToplami += netTutar;
        toplamVadeFarki += vadeFarki;
        if (vadeFarki > 0) {
          vadeFarkiKayitlari.push({
            id: uid('VF'), musteriId: siparis.musteriId, musteriAdi: siparis.musteriAdi,
            siparisId: siparis.id, siparisKod: siparis.kod, tip: 'kredi_karti',
            brutTutar: k.tutar, vadeFarki, netTutar, aySayisi: aySayisi, tarih: bugun
          });
        }
      } else {
        // nakit / diğer — sadece bunlar "ileri tarihli" ise beklemeye girer
        if (k.tarih && k.tarih > bugun) {
          ileriTarihliNakitler.push(k);
          tahsilatBeklenenler.push({
            id: uid('TB'), faturaId: null, faturaNo: siparis.kod, siparisId: siparis.id, siparisKod: siparis.kod,
            musteriId: siparis.musteriId, musteriAdi: siparis.musteriAdi,
            tip: k.tip, tutar: k.tutar, tarih: k.tarih, aciklama: k.aciklama || null,
            durum: 'onay_bekliyor', olusturmaTarihi: bugun
          });
        } else {
          netKasaToplami += k.tutar; // bugün veya geçmiş tarihli nakit -> anında kasaya
        }
      }
    });

    if (musteri) {
      // Bakiye, NET kasaya giren toplam kadar düşer (vade farkı borcu
      // azaltmaz, ayrı bir gelirdir) — ileri tarihli nakit kalemler henüz
      // tahsil edilmediği için bakiyeden düşülmez.
      musteri.bakiye = (musteri.bakiye || 0) - netKasaToplami;
    }

    await Store.musteriCekleri.save(musteriCekleri);
    await Store.vadeFarkiKayitlari.save(vadeFarkiKayitlari);
    await Store.tahsilatBeklenenler.save(tahsilatBeklenenler);

    // Bayrak siparişin kendisine yazılır — çağıran (page_onaylar.js) bu
    // fonksiyondan hemen sonra Store.siparisler.upsert(siparis) çağırdığı
    // için burada ayrıca bir upsert gerekmez, mevcut akışa "biner".
    siparis.odemePlaniIslendi = true;

    return { netKasaToplami, toplamVadeFarki, ileriTarihliNakitSayisi: ileriTarihliNakitler.length };
  }


  // Makina satışı gibi gelir/gider yaratan olayları kaydeder. Bu, resmi bir
  // muhasebe defteri değildir — sistemin kendi içinde gelir/gider hareketlerini
  // izleyebilmesi için basit bir log'dur (Yönetim Raporlama'da gösterilebilir).
  async function muhasebeKaydiOlustur(kayit) {
    const muhasebeKayitlari = await Store.muhasebeKayitlari.all();
    const yeniKayit = { id: uid('MHS'), tarih: new Date().toISOString().slice(0, 10), ...kayit };
    muhasebeKayitlari.push(yeniKayit);
    await Store.muhasebeKayitlari.save(muhasebeKayitlari);
    return yeniKayit;
  }

  // ── TAHSİLAT ONAYI: "onay bekliyor" durumundaki bir ödeme planı kalemini
  // (peşinat/çek/kredi kartı/nakit) GERÇEKTEN tahsil edilmiş olarak işler:
  //  1) tahsilatBeklenenler kaydının durumu 'onaylandi' yapılır
  //  2) Gerçek bir `tahsilatlar` kaydı oluşturulur (Basit Defter'de görünür)
  //  3) Müşteri cari bakiyesinden bu tutar düşülür
  //  4) Kasa/banka hareketi olarak muhasebeye AYRICA bir gelir kaydı düşer
  //     (not: ana satış geliri zaten fatura kesilince tahakkuk etmişti, bu
  //     kayıt sadece NAKİT AKIŞI/tahsilat izleme amaçlıdır — çift sayım
  //     olmaması için Gelir-Gider Özeti'nde bu kayıtlar ayrı kategoride
  //     tutulur, "satis_faturasi" toplamına eklenmez)
  //  5) Eğer tip 'cek' ise, MÜŞTERİDEN ALINAN ÇEK olarak musteriCekleri
  //     koleksiyonuna eklenir — durum:'elde', tedarikçiye ciro edilebilir.
  async function tahsilatBeklenenOnayla(tahsilatBeklenenId) {
    const tahsilatBeklenenler = await Store.tahsilatBeklenenler.all();
    const t = tahsilatBeklenenler.find(x => x.id === tahsilatBeklenenId);
    if (!t || t.durum !== 'onay_bekliyor') return null;

    t.durum = 'onaylandi';
    t.onayTarihi = new Date().toISOString().slice(0, 10);
    await Store.tahsilatBeklenenler.save(tahsilatBeklenenler);

    const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı', nakit: 'Nakit', diger: 'Diğer', pesinat: 'Peşinat' };
    const detayParcalari = [];
    if (t.cekNo) detayParcalari.push('Çek No: ' + t.cekNo);
    if (t.taksitTipi) detayParcalari.push(t.taksitTipi === 'vadeli' ? (t.taksitSayisi + ' Taksit') : 'Tek Çekim');
    if (t.aciklama) detayParcalari.push(t.aciklama);

    const tahsilatlar = await Store.tahsilatlar.all();
    tahsilatlar.push({
      id: uid('TAH'), tarih: t.onayTarihi, musteriId: t.musteriId, musteriAdi: t.musteriAdi,
      tip: t.tip === 'pesinat' ? 'nakit' : t.tip, detay: (tipLabel[t.tip] || t.tip) + (detayParcalari.length ? ' — ' + detayParcalari.join(', ') : '') + ' (Fatura: ' + t.faturaNo + ')',
      tutar: t.tutar, kaynakTahsilatBeklenenId: t.id, faturaId: t.faturaId
    });
    await Store.tahsilatlar.save(tahsilatlar);

    const musteriler = await Store.musteriler.all();
    const musteri = musteriler.find(m => m.id === t.musteriId);
    if (musteri) {
      musteri.bakiye = (musteri.bakiye || 0) - t.tutar;
      await Store.musteriler.save(musteriler);
    }

    // NOT: Burada AYRICA bir muhasebeKaydiOlustur() çağrılmaz — satış geliri
    // zaten fatura kesilirken (tahakkuk anında) "satis_faturasi" kategorisiyle
    // kaydedilmişti. Tahsilatın onaylanması sadece NAKİT AKIŞINI gösterir
    // (yukarıdaki `tahsilatlar` kaydı, Basit Defter'de zaten bu amaçla
    // gösterilir) — burada ikinci bir gelir kaydı oluşturmak Gelir-Gider
    // Özeti'ndeki toplamları ÇİFT SAYAR.

    // Çek ise, tedarikçiye ciro edilebilecek "elde" çekler listesine ekle
    if (t.tip === 'cek') {
      const musteriCekleri = await Store.musteriCekleri.all();
      musteriCekleri.push({
        id: uid('MCK'), musteriId: t.musteriId, musteriAdi: t.musteriAdi,
        cekNo: t.cekNo || '—', tutar: t.tutar, vadeTarihi: t.tarih,
        alisTarihi: t.onayTarihi, durum: 'elde', // elde | ciro_edildi
        kaynakTahsilatId: tahsilatlar[tahsilatlar.length - 1].id
      });
      await Store.musteriCekleri.save(musteriCekleri);
    }
    return t;
  }

  // ── SİPARİŞ REDDİ: TEKLİFİ "DÖNÜŞMEDİ" OLARAK İŞARETLEME ─────────────────
  // Bir sipariş (Cari veya Yönetim tarafından) reddedildiğinde, eğer bu
  // sipariş bir teklifden geliyorsa, kullanıcıya dönüşmeme sebebini sorar
  // (fiyat/termin/ürün fonksiyonu/diğer) ve teklif kaydına işler. Hem Cari
  // İşlemler hem Yönetim Onayları aynı bu fonksiyonu çağırır.
  // Sipariş REDDEDİLİRSE: satılmış 2. kalite kalemler geri alınır — miktar
  // ambara iade edilir, satış geçmişinden bu siparişin kaydı silinir, kalem
  // yeniden 'satista' olur ve teklif hâlâ aktifse adet teklife yeniden
  // REZERVE edilir (teklif düzenlenip tekrar gönderilebilir).
  async function ikinciKaliteSatisGeriAl(siparis) {
    const ikKalemler = (siparis.kalemler || []).filter(k => k.ikinciKalite && k.iadeKalemId);
    if (!ikKalemler.length) return;
    const iadeler = await Store.iadeKalemleri.all();
    const stokRaf = await Store.stokRaf.all();
    let stokDegisti = false, iadeDegisti = false;
    for (const k of ikKalemler) {
      const iade = iadeler.find(i => i.id === k.iadeKalemId);
      if (!iade) continue;
      const buSatis = (iade.satisGecmisi || []).find(g => g.siparisId === siparis.id);
      if (!buSatis) continue; // bu siparişe satış işlenmemiş
      const adet = buSatis.adet || 1;
      iade.miktar = (iade.miktar || 0) + adet;
      iade.satilanAdet = Math.max(0, (iade.satilanAdet || 0) - adet);
      iade.satisGecmisi = iade.satisGecmisi.filter(g => g.siparisId !== siparis.id);
      iade.durum = 'satista';
      // Son satış alanlarını kalan geçmişten güncelle
      const son = iade.satisGecmisi[iade.satisGecmisi.length - 1];
      iade.satisSiparisId = son ? son.siparisId : null;
      iade.satisSiparisNo = son ? son.siparisNo : null;
      iade.satisMusteriId = son ? son.musteriId : null;
      iade.satisMusteriAdi = son ? son.musteriAdi : '';
      iade.satisTarihi = son ? son.tarih : null;
      // Teklif hâlâ duruyorsa adedi yeniden rezerve et
      if (siparis.teklifId) {
        iade.rezervasyonlar = iade.rezervasyonlar || [];
        if (!iade.rezervasyonlar.some(r => r.teklifId === siparis.teklifId)) {
          iade.rezervasyonlar.push({ teklifId: siparis.teklifId, teklifKod: '', musteriAdi: siparis.musteriAdi || '', adet, tarih: new Date().toISOString().slice(0, 10) });
        }
      }
      iadeDegisti = true;
      const s = stokRaf.find(x => x.ambar === 'iade_ambari' && x.refId === (iade.refId || iade.id));
      if (s) { s.miktar = (s.miktar || 0) + adet; stokDegisti = true; }
    }
    if (iadeDegisti) await Store.iadeKalemleri.save(iadeler);
    if (stokDegisti) await Store.stokRaf.save(stokRaf);
  }

  function siparisReddindeTeklifSorusu(siparis, onTamamlandi) {
    // Reddedilen siparişteki 2. kalite satışlarını geri al ve bağlı teklifi
    // 'siparis_reddedildi' durumuna alıp YENİDEN DÜZENLENEBİLİR yap — teklif
    // ekranından düzenlenip tekrar siparişe dönüştürülebilir.
    (async () => {
      await persist(() => ikinciKaliteSatisGeriAl(siparis));
      if (siparis.teklifId) {
        const teklifler = await Store.teklifler.all();
        const teklif = teklifler.find(t => t.id === siparis.teklifId);
        if (teklif && teklif.durum === 'siparise_donustu') {
          teklif.durum = 'siparis_reddedildi';
          teklif.redSiparisKod = siparis.kod;
          teklif.redTarihi = new Date().toISOString().slice(0, 10);
          await persist(() => Store.teklifler.upsert(teklif));
        }
      }
    })();
    if (!siparis.teklifId) { onTamamlandi(); return; }
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:10px">Bu sipariş bir tekliften geldi. Teklifin neden siparişe dönüşmediğini belirtebilirsiniz (isteğe bağlı, raporlama için faydalıdır).</div>
      <div class="fgroup"><label class="flbl">Sebep</label>
        <select class="fselect" id="srt-kategori">
          <option value="">— Belirtmek istemiyorum —</option>
          <option value="fiyat">Fiyat</option>
          <option value="termin">Termin</option>
          <option value="urun_fonksiyonu">Ürün Fonksiyonu</option>
          <option value="diger">Diğer</option>
        </select>
      </div>
      <div class="fgroup" id="srt-aciklama-wrap" style="display:none"><label class="flbl">Açıklama</label><textarea class="ftextarea" id="srt-aciklama"></textarea></div>
    `;
    const footer = `<button class="btn" id="srt-skip">Atla</button><button class="btn btn-blue" id="srt-confirm">Kaydet</button>`;
    openModal({ title: 'Sipariş Reddedildi', sub: siparis.kod, body, footer });
    document.getElementById('srt-kategori').onchange = (e) => {
      document.getElementById('srt-aciklama-wrap').style.display = e.target.value === 'diger' ? 'block' : 'none';
    };
    document.getElementById('srt-skip').onclick = () => { closeModal(); onTamamlandi(); };
    document.getElementById('srt-confirm').onclick = async () => {
      const kategori = document.getElementById('srt-kategori').value;
      if (kategori) {
        const teklifler = await Store.teklifler.all();
        const teklif = teklifler.find(t => t.id === siparis.teklifId);
        if (teklif) {
          teklif.donusmemeSebebi = { kategori, aciklama: document.getElementById('srt-aciklama').value.trim() };
          await Store.teklifler.upsert(teklif);
        }
      }
      closeModal();
      onTamamlandi();
    };
  }

  // ── KESİM PLANI KAYDINDA OTOMATİK STOK DÜŞÜMÜ + YETERSİZSE SATINALMA ──────
  // Kesim planı kaydedildiğinde, kullanılan plaka adedi kadar Hammadde
  // Deposu'ndan stok düşülür. Stok yetersizse (negatife düşecekse), eksik
  // kalan miktar için otomatik bir satınalma ihtiyacı (satinalmaTalepleri)
  // oluşturulur — satınalma bu siparişteki adetleri düzenleyebilir.
  async function kesimPlaniKaydedildiginceStokDus(plaka, plakaSayisi) {
    const stokRaf = await Store.stokRaf.all();
    const mevcutStok = stokMiktarAmbar(stokRaf, 'hammadde_deposu', 'hammadde', plaka.id);
    stokMiktarGuncelle(stokRaf, 'hammadde_deposu', 'hammadde', plaka.id, plaka.stokKodu, plaka.ad, plaka.birim, -plakaSayisi);
    await Store.stokRaf.save(stokRaf);

    const stokHareketleri = await Store.stokHareketleri.all();
    stokHareketleri.push({
      id: uid('HRK'), tip: 'cikis', ambar: 'hammadde_deposu', kalemAdi: plaka.ad, miktar: plakaSayisi,
      aciklama: 'Kesim planı uygulandı (nesting sarfı)', tarih: new Date().toISOString().slice(0, 10)
    });
    await Store.stokHareketleri.save(stokHareketleri);

    const eksikMiktar = plakaSayisi - mevcutStok;
    let otomatikSatinalmaAcildi = false;
    if (eksikMiktar > 0) {
      const satinalmaTalepleri = await Store.satinalmaTalepleri.all();
      satinalmaTalepleri.push({
        id: uid('SAT'), kod: 'SAT-' + Date.now().toString(36).toUpperCase(),
        kaynakTalepId: null, kaynakKesimPlani: true,
        kalemAdi: plaka.ad, hammaddeId: plaka.id, miktar: Math.ceil(eksikMiktar), birim: plaka.birim,
        tedarikciId: null, tedarikciAdi: null,
        not: 'Kesim planı uygulanırken stok yetersiz kaldığı için otomatik oluşturuldu.',
        durum: 'teklif_bekleniyor', tarih: new Date().toISOString().slice(0, 10)
      });
      await Store.satinalmaTalepleri.save(satinalmaTalepleri);
      otomatikSatinalmaAcildi = true;
    }
    return { eksikMiktar: Math.max(0, eksikMiktar), otomatikSatinalmaAcildi, mevcutStok };
  }

  // ── İRSALİYE KESİLİNCE OTOMATİK FATURA OLUŞTURMA ──────────────────────────
  // KDV oranı (müşteri carisinde tanımlıysa o, yoksa genel ayar) faturaya
  // uygulanır. Bu siparişe ait alınan avans varsa (Cari Onayı'ndaki peşinat)
  // fatura tutarından düşülür; kalan tutar, anlaşılan vadeye göre müşteri
  // bakiyesine (carisine) işlenir.
  // ── KDV ORANINA GÖRE KALEM GRUPLAMA (KALEM BAZLI KDV) ─────────────────────
  // Teklif/sipariş kalemlerini kdvOrani'na göre gruplar; her grup için KDV
  // hariç (genel iskontolu) tutar, KDV tutarı ve KDV dahil tutar hesaplar.
  // Kalemde kdvOrani yoksa %18 varsayılır (geriye dönük uyumluluk).
  // ── 2. KALİTE SATIŞ TAKİBİ + REZERVASYON ────────────────────────────────
  // 1 adet olan 2. kalite/defolu ürünün İKİ AYRI müşteriye satılmasını önlemek
  // için rezervasyon katmanı: teklif KAYDEDİLDİĞİ an adet rezerve edilir
  // (iade.rezervasyonlar), diğer tekliflerde kullanılabilir adet düşer.
  // Sipariş onayına girerken SON KONTROL yapılır — stok yetmiyorsa dönüşüm
  // engellenir. Satışta miktar düşülür (kısmi satış desteklenir), teklifin
  // rezervasyonu kapanır ve satış geçmişine kayıt eklenir.

  function ikinciKaliteRezerveToplam(iade, haricTeklifId) {
    return (iade.rezervasyonlar || [])
      .filter(r => !haricTeklifId || r.teklifId !== haricTeklifId)
      .reduce((a, r) => a + (r.adet || 0), 0);
  }

  // Kullanılabilir adet = ambar miktarı − diğer tekliflerin rezervasyonları.
  // haricTeklifId verilirse o teklifin kendi rezervasyonu düşülmez (düzenleme).
  function ikinciKaliteKullanilabilirAdet(iade, haricTeklifId) {
    return Math.max(0, (iade.miktar || 0) - ikinciKaliteRezerveToplam(iade, haricTeklifId));
  }

  // Teklif kaydedilirken çağrılır: teklifteki 2. kalite kalemlere göre iade
  // kayıtlarındaki rezervasyonu senkronize eder. Yetersiz stok varsa HİÇBİR
  // DEĞİŞİKLİK YAPMADAN { ok:false, hata } döner.
  async function ikinciKaliteRezervasyonSenkronize(teklif) {
    const ikKalemler = (teklif.kalemler || []).filter(k => k.ikinciKalite && k.iadeKalemId);
    const iadeler = await Store.iadeKalemleri.all();
    // 1) Kontrol fazı — hepsi yeterli mi?
    for (const k of ikKalemler) {
      const iade = iadeler.find(i => i.id === k.iadeKalemId);
      if (!iade) return { ok: false, hata: 'İade kaydı bulunamadı: ' + k.kod };
      if (iade.durum !== 'satista') return { ok: false, hata: `"${iade.ad || iade.kod}" artık satışta değil (${iade.durum === 'satildi' ? 'satıldı' : iade.durum})` };
      const kullanilabilir = ikinciKaliteKullanilabilirAdet(iade, teklif.id);
      if ((k.miktar || 1) > kullanilabilir) {
        return { ok: false, hata: `"${iade.ad || iade.kod}" için yeterli stok yok — kullanılabilir: ${kullanilabilir} adet (diğer tekliflerde rezerve)` };
      }
    }
    // 2) Yazma fazı — önce bu teklifin eski rezervasyonlarını temizle, sonra yenilerini yaz
    let degisti = false;
    for (const iade of iadeler) {
      const eskiUzunluk = (iade.rezervasyonlar || []).length;
      iade.rezervasyonlar = (iade.rezervasyonlar || []).filter(r => r.teklifId !== teklif.id);
      if (iade.rezervasyonlar.length !== eskiUzunluk) degisti = true;
    }
    for (const k of ikKalemler) {
      const iade = iadeler.find(i => i.id === k.iadeKalemId);
      iade.rezervasyonlar = iade.rezervasyonlar || [];
      iade.rezervasyonlar.push({
        teklifId: teklif.id, teklifKod: teklif.kod || '',
        musteriAdi: teklif.musteriAdi || '', adet: k.miktar || 1,
        tarih: new Date().toISOString().slice(0, 10)
      });
      degisti = true;
    }
    if (degisti) await Store.iadeKalemleri.save(iadeler);
    return { ok: true };
  }

  // Teklif silindiğinde/iptal olduğunda rezervasyonlarını serbest bırakır.
  async function ikinciKaliteRezervasyonKaldir(teklifId) {
    const iadeler = await Store.iadeKalemleri.all();
    let degisti = false;
    for (const iade of iadeler) {
      const eskiUzunluk = (iade.rezervasyonlar || []).length;
      if (!eskiUzunluk) continue;
      iade.rezervasyonlar = iade.rezervasyonlar.filter(r => r.teklifId !== teklifId);
      if (iade.rezervasyonlar.length !== eskiUzunluk) degisti = true;
    }
    if (degisti) await Store.iadeKalemleri.save(iadeler);
  }

  // Teklif siparişe dönüştüğü (sipariş onayına girdiği) AN çağrılır.
  // ÖNCE kontrol eder (yetersizse { ok:false } döner, sipariş OLUŞTURULMAMALI),
  // sonra: miktar düşer (kısmi satış), satış geçmişine sipariş no + müşteri
  // işlenir, teklifin rezervasyonu kapanır, ambar stoğu düşer.
  async function ikinciKaliteKalemleriSatildiIsaretle(siparis) {
    const ikKalemler = (siparis.kalemler || []).filter(k => k.ikinciKalite && k.iadeKalemId);
    if (!ikKalemler.length) return { ok: true };
    const iadeler = await Store.iadeKalemleri.all();
    // 1) SON KONTROL — kendi teklifinin rezervasyonu kullanılabilir sayılır
    for (const k of ikKalemler) {
      const iade = iadeler.find(i => i.id === k.iadeKalemId);
      if (!iade) return { ok: false, hata: 'İade kaydı bulunamadı: ' + k.kod };
      const kullanilabilir = ikinciKaliteKullanilabilirAdet(iade, siparis.teklifId);
      if (iade.durum !== 'satista' || (k.miktar || 1) > kullanilabilir) {
        return { ok: false, hata: `"${iade.ad || iade.kod}" başka bir müşteriye satılmış/rezerve — kullanılabilir: ${kullanilabilir} adet. Sipariş oluşturulamaz.` };
      }
    }
    // 2) SATIŞ YAZMA
    const stokRaf = await Store.stokRaf.all();
    let stokDegisti = false;
    const bugun = new Date().toISOString().slice(0, 10);
    for (const k of ikKalemler) {
      const iade = iadeler.find(i => i.id === k.iadeKalemId);
      const adet = k.miktar || 1;
      // Bu teklifin rezervasyonunu kapat
      if (siparis.teklifId) iade.rezervasyonlar = (iade.rezervasyonlar || []).filter(r => r.teklifId !== siparis.teklifId);
      // Kısmi satış: miktar düşer, kalan varsa satışta kalır
      iade.miktar = Math.max(0, (iade.miktar || 0) - adet);
      if (iade.miktar <= 0) iade.durum = 'satildi';
      // Satış geçmişi (geçmiş defolu ürün kaydı) + son satış alanları
      iade.satisGecmisi = iade.satisGecmisi || [];
      iade.satisGecmisi.push({ siparisId: siparis.id, siparisNo: siparis.kod, musteriId: siparis.musteriId || null, musteriAdi: siparis.musteriAdi || '', adet, tarih: bugun });
      iade.satisTarihi = bugun;
      iade.satisSiparisId = siparis.id;
      iade.satisSiparisNo = siparis.kod;
      iade.satisMusteriId = siparis.musteriId || null;
      iade.satisMusteriAdi = siparis.musteriAdi || '';
      iade.satilanAdet = ((iade.satilanAdet || 0) + adet);
      const s = stokRaf.find(x => x.ambar === 'iade_ambari' && x.refId === (iade.refId || iade.id));
      if (s) { s.miktar = Math.max(0, (s.miktar || 0) - adet); stokDegisti = true; }
    }
    await Store.iadeKalemleri.save(iadeler);
    if (stokDegisti) await Store.stokRaf.save(stokRaf);
    return { ok: true };
  }

  // İrsaliye kesilince: satılan 2. kalite kalemlerine hangi irsaliyeyle,
  // hangi gün sevk edildiği bilgisi işlenir (geçmiş defolu ürün kaydı).
  async function ikinciKaliteSevkBilgisiIsle(siparis, irsaliye) {
    const ikKalemler = (siparis.kalemler || []).filter(k => k.ikinciKalite && k.iadeKalemId);
    if (!ikKalemler.length) return;
    const iadeler = await Store.iadeKalemleri.all();
    let degisti = false;
    for (const k of ikKalemler) {
      const iade = iadeler.find(i => i.id === k.iadeKalemId);
      if (!iade) continue;
      iade.sevkIrsaliyeNo = irsaliye.irsaliyeNo;
      iade.sevkTarihi = irsaliye.tarih;
      degisti = true;
    }
    if (degisti) await Store.iadeKalemleri.save(iadeler);
  }

  // ── SAYFA ERİŞİM YETKİSİ ────────────────────────────────────────────────
  // PAGES tanımındaki roller listesine göre aktif rolün bir sayfayı görme
  // yetkisi olup olmadığını döndürür. roller tanımsızsa herkese açıktır.
  function sayfayaErisebilir(pageId, rol) {
    const r = rol || state.role;
    if (r === 'admin') return true;
    for (const grp of PAGES) {
      const it = grp.items.find(x => x.id === pageId);
      if (it) return !it.roller || it.roller.includes(r);
    }
    return true; // PAGES'te olmayan yardımcı sayfalar (kalem_secici vb.) serbest
  }

  // ── QR KOD (barkod yerine tercih edilir) ────────────────────────────────
  // Çizgi barkod telefon kamerasıyla zor okunur; QR açılı, uzaktan ve kısmen
  // yıpranmış haldeyken bile okunur. Etiketlerde artık QR basılır.
  //
  // QR İÇERİĞİ: düz kod yerine URL basılır —
  //   https://<site>/#kod=YM-GOVDE
  // Böylece iPhone kullanıcıları uygulamayı açmadan, telefonun KENDİ kamera
  // uygulamasıyla etiketi okutup doğrudan sisteme girebilir (iOS Safari'de
  // tarayıcı içi barkod API'si bulunmadığı için bu yol kritiktir).
  function qrIcerikUret(kod) {
    try {
      const kok = window.location.origin + window.location.pathname;
      return kok + '#kod=' + encodeURIComponent(String(kod));
    } catch (e) {
      return String(kod);
    }
  }

  // Okunan QR/barkod değerinden GERÇEK KODU ayıklar.
  // "https://site/#kod=YM-GOVDE" → "YM-GOVDE" ; "YM-GOVDE" → "YM-GOVDE"
  function kodAyikla(okunan) {
    const s = String(okunan || '').trim();
    const i = s.indexOf('#kod=');
    if (i >= 0) {
      try { return decodeURIComponent(s.slice(i + 5)); } catch (e) { return s.slice(i + 5); }
    }
    return s;
  }

  // QR SVG üretir (etiket/ekran için)
  function qrSvg(kod, boyut) {
    try {
      return QrKod.svg(qrIcerikUret(kod), boyut || 150);
    } catch (e) {
      return `<div style="font-size:10px;color:#c00">QR üretilemedi: ${escapeHtml(e.message)}</div>`;
    }
  }

  // ── ÜRETİM PARTİSİ ETİKET KURALI ────────────────────────────────────────
  // Fiziksel parti/iş kartı etiketi için KARARLI kimlik: yarımamül kodu +
  // kaynak (iş emri/sipariş) kodu birleşimi. Parça istasyondan istasyona
  // geçerken bu iki alan da yeni iş kartına AYNEN kopyalanır (bkz.
  // page_hat_takip.js / page_hat_terminal.js sevk akışları) — bu yüzden
  // TEK fiziksel etiket üretimin sonuna kadar geçerli kalır, yeniden
  // basılmaz. SADECE yarımamül koduyla etiketlenseydi, aynı parça tipini
  // AYNI ANDA üreten FARKLI sipariş/iş emirleri sahada birbirine karışabilir
  // (etiket doğru tip olsa da yanlış partiye ait olabilir) — kaynak kodu
  // eklenerek tarama hem "doğru parça mı" hem "doğru parti mi" sorusunu
  // birlikte cevaplar.
  function partiEtiketKodu(ymKod, kaynakKod) {
    return String(ymKod || '') + '@' + String(kaynakKod || '');
  }

  // İş kartı (üretim partisi) için TEK etiket yazdırır — Hat Takip ve Hat
  // Terminal ekranları AYNI bu fonksiyonu çağırır, ikisi de birebir aynı
  // etiketi üretir (kural: etiket nereden basılırsa basılsın aynı olmalı).
  function isKartiEtiketYazdir(is) {
    const musteriSatiri = is.musteriAdi
      ? `<div class="musteri">👤 ${escapeHtml(is.musteriAdi)}</div>`
      : `<div class="musteri musteri-yok">Stok Üretimi — müşteriye özel değil</div>`;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR Etiket — ${escapeHtml(is.ymKod)}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:8mm}
        .et{width:70mm;border:1.5px solid #000;border-radius:4px;padding:5mm;margin-bottom:5mm;page-break-inside:avoid;text-align:center}
        .kod{font-family:monospace;font-size:15px;font-weight:bold;letter-spacing:1px;margin-top:2mm}
        .ad{font-size:11px;color:#333;margin-top:1mm}
        .musteri{font-size:11px;font-weight:bold;color:#000;margin-top:2mm;border-top:1px solid #000;padding-top:2mm}
        .musteri-yok{font-weight:normal;font-style:italic;color:#777}
        .alt{font-size:9px;color:#666;margin-top:2mm;border-top:1px dashed #999;padding-top:2mm}
      </style></head><body>
      <div class="et">
        ${qrSvg(partiEtiketKodu(is.ymKod, is.kaynakKod), 150)}
        <div class="kod">${escapeHtml(is.ymKod)}</div>
        <div class="ad">${escapeHtml(is.ymAd || '')}</div>
        ${musteriSatiri}
        <div class="alt">${escapeHtml(is.kaynakKod)} · ${escapeHtml(is.istasyonKod)} · ${is.gelenAdet} adet</div>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),250);<\/script></body></html>`);
    w.document.close();
  }

  // ── TELEFONLA BARKOD OKUTMA MODALI ──────────────────────────────────────
  // Telefon kamerasıyla (BarcodeDetector destekliyse) canlı tarama yapar;
  // desteklenmeyen cihazlarda kod elle girilir. `beklenen` verilirse okunan
  // değer EŞLEŞMEDEN onay verilmez — eşleşmeyen barkodla işlem başlatılamaz.
  // iPhone/iPad kullanıcıları etiketi telefonun KENDİ kamera uygulamasıyla
  // okutup uygulamayı "#kod=XXX" adresiyle açabilir. Modal açıkken bu adres
  // gelirse kod otomatik doldurulur ve doğrulanır.
  let bekleyenKodOkutma = null;
  function urlKoduIsle() {
    try {
      const h = window.location.hash || '';
      if (h.indexOf('#kod=') !== 0) return;
      const kod = decodeURIComponent(h.slice(5));
      history.replaceState(null, '', window.location.pathname + window.location.search);
      if (bekleyenKodOkutma) { bekleyenKodOkutma(kod); return; }
      // Modal açık değilse panoya benzer şekilde bildir
      toast('QR okundu: ' + kod + ' — ilgili ekranda "Okut" deyip yapıştırabilirsiniz', 'ok');
      try { window.sessionStorage.setItem('uretimos_son_qr', kod); } catch (e) {}
    } catch (e) { /* hash işlenemedi */ }
  }
  if (typeof window !== 'undefined') window.addEventListener('hashchange', urlKoduIsle);

  function barkodOkutModal({ baslik, beklenen, aciklama, onOkundu }) {
    // ── ORTAM TEŞHİSİ ─────────────────────────────────────────────────────
    // Kamera çalışmıyorsa NEDENİNİ ve ÇÖZÜMÜNÜ açıkça söyler. Önceki sürümde
    // yalnızca BarcodeDetector API'si aranıyordu; bu API iPhone/Safari ve
    // Firefox'ta bulunmadığı için sahada kamera hiç açılmıyordu.
    const teshis = (typeof KameraTeshis !== 'undefined')
      ? KameraTeshis.ortamTeshisi()
      : { kameraKullanilabilir: false, sebep: 'Kamera teşhis modülü yüklenemedi', cozum: '' };

    const body = document.createElement('div');
    body.innerHTML = `
      ${aciklama ? `<div class="fhint" style="margin-bottom:10px">${aciklama}</div>` : ''}
      ${teshis.kameraKullanilabilir ? `
        <div style="position:relative;border-radius:10px;overflow:hidden;background:#000;margin-bottom:8px">
          <video id="bo-video" style="width:100%;max-height:300px;display:block;object-fit:cover" autoplay playsinline muted></video>
          <!-- KARE hedef çerçevesi: QR kod karedir; geniş dikdörtgen çerçeve
               (çizgi barkod için tasarlanmıştı) kullanıcıyı yanlış
               konumlandırmaya iter. Köşe köşebentleri, standart QR tarayıcı
               arayüzüdür ve hizalamayı kolaylaştırır. -->
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
            <div id="bo-hedef" style="position:relative;height:76%;aspect-ratio:1;border-radius:14px;box-shadow:0 0 0 2000px rgba(0,0,0,.34)">
              ${['top:-2px;left:-2px;border-top:3px solid;border-left:3px solid;border-radius:14px 0 0 0',
                 'top:-2px;right:-2px;border-top:3px solid;border-right:3px solid;border-radius:0 14px 0 0',
                 'bottom:-2px;left:-2px;border-bottom:3px solid;border-left:3px solid;border-radius:0 0 0 14px',
                 'bottom:-2px;right:-2px;border-bottom:3px solid;border-right:3px solid;border-radius:0 0 14px 0']
                .map(k => `<div style="position:absolute;${k};width:30px;height:30px;border-color:#3b82f6"></div>`).join('')}
              <div id="bo-tarama-cizgi" style="position:absolute;left:8%;right:8%;top:50%;height:2px;background:linear-gradient(90deg,transparent,#3b82f6,transparent);opacity:.9"></div>
            </div>
          </div>
          <div id="bo-tarama" style="position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:3px 8px;border-radius:6px">Kamera açılıyor…</div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
          <button class="btn btn-sm" id="bo-isik" style="display:none">🔦 Işık</button>
          <button class="btn btn-sm" id="bo-kamera-degistir" style="display:none">🔄 Kamera Değiştir</button>
        </div>
        <div class="fhint" style="margin-bottom:8px">📷 QR kodu <b>mavi çerçeveye</b> alın. 10–30 cm mesafe idealdir; QR açılı tutulsa da okunur. Okunmazsa aşağıdan elle girin.</div>`
        : `<div style="border:1.5px solid var(--amber);background:var(--amber-bg);border-radius:8px;padding:10px 12px;margin-bottom:10px">
            <b style="font-size:12px">📷 Kamera taraması kullanılamıyor</b>
            <div style="font-size:11.5px;margin-top:4px">${escapeHtml(teshis.sebep || '')}</div>
            ${teshis.cozum ? `<div style="font-size:11px;margin-top:6px;color:var(--text2)">${teshis.cozum}</div>` : ''}
            <div style="font-size:11px;margin-top:6px">Kodu aşağıya <b>elle girebilirsiniz</b>.</div>
          </div>`}
      <div class="frow">
        <div class="fgroup" style="flex:1"><label class="flbl">QR Kodu</label>
          <input class="finput" id="bo-kod" placeholder="${beklenen ? 'Beklenen: ' + escapeHtml(beklenen) : 'Kodu okutun veya yazın'}" autocomplete="off" autocapitalize="characters"></div>
      </div>
      <div id="bo-durum" style="font-size:12px;min-height:18px"></div>
      <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px">
        <button class="btn btn-sm btn-ghost" id="bo-teshis-ac" style="font-size:10.5px">🔧 Kamera durumu</button>
        <div id="bo-teshis" style="display:none;font-size:10.5px;color:var(--text2);margin-top:6px;line-height:1.7">
          <div>Güvenli bağlantı (HTTPS): <b style="color:var(--${teshis.guvenliBaglam ? 'green' : 'red'}-text)">${teshis.guvenliBaglam ? 'var' : 'YOK'}</b></div>
          <div>Tarayıcı kamera erişimi: <b style="color:var(--${teshis.kameraApi ? 'green' : 'red'}-text)">${teshis.kameraApi ? 'var' : 'YOK'}</b></div>
          <div>Tarayıcı QR tanıma: <b>${teshis.detectorVar ? 'var' : 'yok'}</b> · Yerleşik çözücü: <b style="color:var(--${teshis.kendiCozucu ? 'green' : 'red'}-text)">${teshis.kendiCozucu ? 'var' : 'YOK'}</b></div>
          <div>Cihaz: <b>${escapeHtml(teshis.cihaz || '—')}</b> · Adres: <b>${escapeHtml((typeof location !== 'undefined' ? location.protocol : '') || '')}</b></div>
          <div id="bo-kamera-hata" style="margin-top:4px"></div>
        </div>
      </div>`;

    const footer = `<button class="btn" id="bo-cancel">Vazgeç</button><button class="btn btn-green" id="bo-ok">✓ QR Kodu Doğrula</button>`;
    openModal({ title: baslik || '📷 QR Okut', body, footer });

    let stream = null, tarayici = null, kapandi = false, track = null;
    let arkaKamera = true;
    let cizgiZaman = null;   // tarama çizgisi animasyonu (aşağıda başlatılır)
    const temizle = () => {
      kapandi = true;
      if (cizgiZaman) { clearInterval(cizgiZaman); cizgiZaman = null; }
      if (tarayici) { clearInterval(tarayici); tarayici = null; }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    };
    const durumYaz = (html) => { const el = document.getElementById('bo-durum'); if (el) el.innerHTML = html; };
    const taramaYaz = (t) => { const el = document.getElementById('bo-tarama'); if (el) el.textContent = t; };

    const dogrula = (deger, otomatik) => {
      // Elle girilen veya okunan değer URL formatında olabilir (QR içeriği) —
      // gerçek kodu ayıkla.
      const v = kodAyikla(deger);
      if (!v) { durumYaz('<span style="color:var(--red-text)">Kod boş olamaz</span>'); return false; }
      if (beklenen && v.toUpperCase() !== String(beklenen).toUpperCase()) {
        durumYaz(`<span style="color:var(--red-text)">✗ KOD EŞLEŞMEDİ — okunan: <b>${escapeHtml(v)}</b>, beklenen: <b>${escapeHtml(beklenen)}</b>. İşlem başlatılamaz.</span>`);
        if (!otomatik) toast('Kod eşleşmedi — doğru parçayı okutun', 'err');
        return false;
      }
      temizle(); closeModal(); onOkundu(v);
      return true;
    };

    // iPhone yerel kamera akışı: modal açıkken #kod= gelirse otomatik doğrula
    bekleyenKodOkutma = (kod) => { if (kodInput) kodInput.value = kod; dogrula(kod, true); };
    try {
      const sonQr = window.sessionStorage.getItem('uretimos_son_qr');
      if (sonQr) { window.sessionStorage.removeItem('uretimos_son_qr'); if (kodInput) kodInput.value = sonQr; }
    } catch (e) {}
    urlKoduIsle();

    // Tarama çizgisi animasyonu — kameranın çalıştığını görsel olarak belli eder
    let cizgiYon = 1, cizgiKonum = 50;
    const cizgi = document.getElementById('bo-tarama-cizgi');
    if (cizgi) {
      cizgiZaman = setInterval(() => {
        cizgiKonum += cizgiYon * 1.6;
        if (cizgiKonum >= 92) { cizgiKonum = 92; cizgiYon = -1; }
        if (cizgiKonum <= 8) { cizgiKonum = 8; cizgiYon = 1; }
        cizgi.style.top = cizgiKonum + '%';
      }, 28);
    }

    const teshisBtn = document.getElementById('bo-teshis-ac');
    if (teshisBtn) teshisBtn.onclick = () => {
      const p = document.getElementById('bo-teshis');
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
    };

    document.getElementById('bo-cancel').onclick = () => { temizle(); closeModal(); };
    document.getElementById('bo-ok').onclick = () => dogrula(document.getElementById('bo-kod').value);
    const kodInput = document.getElementById('bo-kod');
    kodInput.addEventListener('keydown', e => { if (e.key === 'Enter') dogrula(e.target.value); });
    // El terminali / USB barkod okuyucu desteği: cihaz kodu yazıp Enter basar
    setTimeout(() => { try { kodInput.focus(); } catch (e) {} }, 120);

    if (!teshis.kameraKullanilabilir) return;

    // ── KAMERA + ÇİFT ÇÖZÜCÜ ──────────────────────────────────────────────
    // 1) Tarayıcının BarcodeDetector'ı varsa kullanılır (hızlı, çok formatlı)
    // 2) Yoksa KENDİ Code39 çözücümüz devreye girer (iPhone/Safari dahil)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    async function kamerayiBaslat() {
      try {
        if (stream) { stream.getTracks().forEach(t => t.stop()); }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: arkaKamera ? { ideal: 'environment' } : { ideal: 'user' },
            width: { ideal: 1280 }, height: { ideal: 720 }
          }, audio: false
        });
        if (kapandi) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = document.getElementById('bo-video');
        if (!video) return;
        video.srcObject = stream;
        try { await video.play(); } catch (e) { /* bazı tarayıcılar otomatik oynatır */ }
        track = stream.getVideoTracks()[0];

        // Işık (torch) desteği varsa butonu göster
        try {
          const yetenek = track.getCapabilities ? track.getCapabilities() : {};
          if (yetenek && yetenek.torch) {
            const isikBtn = document.getElementById('bo-isik');
            isikBtn.style.display = '';
            let acik = false;
            isikBtn.onclick = async () => {
              acik = !acik;
              try { await track.applyConstraints({ advanced: [{ torch: acik }] }); isikBtn.classList.toggle('btn-amber', acik); }
              catch (e) { toast('Işık açılamadı', 'err'); }
            };
          }
        } catch (e) { /* torch desteklenmiyor */ }

        // Birden fazla kamera varsa değiştirme butonu
        try {
          const cihazlar = await navigator.mediaDevices.enumerateDevices();
          if (cihazlar.filter(c => c.kind === 'videoinput').length > 1) {
            const dbtn = document.getElementById('bo-kamera-degistir');
            dbtn.style.display = '';
            dbtn.onclick = () => { arkaKamera = !arkaKamera; kamerayiBaslat(); };
          }
        } catch (e) { /* cihaz listesi alınamadı */ }

        let detector = null;
        if (teshis.detectorVar) {
          try { detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf'] }); }
          catch (e) { detector = null; }
        }
        taramaYaz(detector ? 'Taranıyor (hızlı mod)…' : 'Taranıyor…');

        let kare = 0;
        if (tarayici) clearInterval(tarayici);
        tarayici = setInterval(async () => {
          if (kapandi) return;
          const v = document.getElementById('bo-video');
          if (!v || !v.videoWidth) return;
          kare++;

          // 1) Yerleşik dedektör
          if (detector) {
            try {
              const kodlar = await detector.detect(v);
              if (kodlar && kodlar.length) {
                // QR içeriği URL ise gerçek kodu ayıkla
                const okunan = kodAyikla(kodlar[0].rawValue);
                if (kodInput) kodInput.value = okunan;
                taramaYaz('✓ Okundu: ' + okunan);
                if (dogrula(okunan, true)) return;
              }
            } catch (e) { /* kareyi atla */ }
          }

          // 2) YERLEŞİK QR ÇÖZÜCÜMÜZ — tarayıcı API'sine bağımlı değildir.
          //    Firefox, Safari ve iOS'taki tüm tarayıcılarda tarama bu yolla
          //    çalışır. Her karede değil, iki karede bir çalıştırılır (CPU).
          if (typeof QrCozucu !== 'undefined' && kare % 2 === 0) {
            try {
              // EKRANDAKİ KARE ÇERÇEVEYE karşılık gelen bölgeyi kırp.
              // Kullanıcı QR'ı çerçeveye alıyor; tüm kareyi taramak yerine
              // o bölgeyi işlemek hem daha hızlı hem daha isabetlidir.
              const vg = v.videoWidth, vy = v.videoHeight;
              if (!vg || !vy) return;
              const kenar = Math.round(Math.min(vg, vy) * 0.80);   // çerçeve payıyla
              const kx = Math.round((vg - kenar) / 2), ky = Math.round((vy - kenar) / 2);
              const hedef = Math.min(512, kenar);                   // işlem çözünürlüğü
              if (canvas.width !== hedef) { canvas.width = hedef; canvas.height = hedef; }
              ctx.drawImage(v, kx, ky, kenar, kenar, 0, 0, hedef, hedef);
              const gen = hedef, yuk = hedef;
              const ham = QrCozucu.canvastanOku(ctx, gen, yuk);
              if (ham) {
                const okunan = kodAyikla(ham);
                if (kodInput) kodInput.value = okunan;
                taramaYaz('✓ Okundu: ' + okunan);
                if (dogrula(okunan, true)) return;
              }
            } catch (e) { /* kareyi atla */ }
          }
          if (kare % 8 === 0) taramaYaz('Taranıyor… QR kodu çerçeveye alın');
        }, 250);

      } catch (e) {
        const ad = e && e.name ? e.name : '';
        const hataAlan = document.getElementById('bo-kamera-hata');
        if (hataAlan) hataAlan.innerHTML = `<span style="color:var(--red-text)">Kamera hatası: ${escapeHtml(ad || e.message || 'bilinmiyor')}</span>`;
        let mesaj, cozum = '';
        if (ad === 'NotAllowedError' || ad === 'PermissionDeniedError') {
          mesaj = 'Kamera izni verilmedi.';
          cozum = 'Tarayıcı adres çubuğundaki 🔒 / ⓘ simgesine dokunup <b>Kamera → İzin Ver</b> seçin, sonra sayfayı yenileyin.';
        } else if (ad === 'NotFoundError' || ad === 'DevicesNotFoundError') {
          mesaj = 'Cihazda kamera bulunamadı.';
        } else if (ad === 'NotReadableError' || ad === 'TrackStartError') {
          mesaj = 'Kamera başka bir uygulama tarafından kullanılıyor.';
          cozum = 'Kamera kullanan diğer uygulamaları kapatıp tekrar deneyin.';
        } else {
          mesaj = 'Kamera açılamadı' + (ad ? ' (' + ad + ')' : '') + '.';
        }
        const alan = document.getElementById('bo-tarama');
        if (alan) alan.textContent = 'Kamera kapalı';
        durumYaz(`<span style="color:var(--amber-text)">⚠ ${escapeHtml(mesaj)}</span>` +
          (cozum ? `<br><span class="muted" style="font-size:10.5px">${cozum}</span>` : '') +
          `<br><span class="muted" style="font-size:10.5px">Kodu elle girebilirsiniz.</span>`);
      }
    }
    kamerayiBaslat();
  }

  // ── FOTOĞRAF ÖLÇEKLEME (1080p) ──────────────────────────────────────────
  // Telefonla çekilen fotoğraflar en fazla 1920×1080 (1080p) olacak şekilde
  // oran korunarak küçültülür ve JPEG olarak saklanır.
  function fotografiOlcekle1080(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1920, maxH = 1080;
          let wpx = img.width, hpx = img.height;
          const oran = Math.min(1, maxW / wpx, maxH / hpx);
          wpx = Math.round(wpx * oran); hpx = Math.round(hpx * oran);
          const cv = document.createElement('canvas');
          cv.width = wpx; cv.height = hpx;
          cv.getContext('2d').drawImage(img, 0, 0, wpx, hpx);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => resolve(r.result); // ölçeklenemezse ham hali
        img.src = r.result;
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ── HAT / BİRİM ŞİFRE KONTROLÜ ─────────────────────────────────────────
  // Her hat ve sevkiyat yükleme birimi için ayrı şifre. Tanımlanmamışsa
  // varsayılan '1234' — yönetim Hat & İstasyon Takibi'ndeki 🔑 Hat Şifreleri
  // ekranından değiştirir. Doğrulama SUNUCUDA yapılır (Store.hatSifresiDogrula)
  // — ham şifre listesi artık istemciye HİÇ inmiyor (bkz. hatSifreleri artık
  // hassas koleksiyon listesinde, api.php).
  async function hatSifresiDogru(hatAdi, girilen) {
    return Store.hatSifresiDogrula(hatAdi, girilen || '');
  }

  // ── REÇETE ALT KIRILIMI: TÜM YARI MAMÜLLERİ REKÜRSİF TOPLA ──────────────
  // Reçete ağacı ürün → paket → alt montaj → yarı mamül → hammadde şeklinde
  // kırılabilir. Bu yüzden bir ürünün yarı mamülleri YALNIZCA birinci seviyeye
  // bakılarak bulunamaz; paket ve alt montajların reçetelerine de inilmelidir.
  // Dönen: Map(ymId -> toplam miktar) — miktarlar zincir boyunca çarpılır.
  function receteAltYarimamulleri(kokTip, kokId, receteler, opts) {
    const sonuc = new Map();
    const gorulen = new Set(); // döngü koruması
    const receteBul = (tip, id) =>
      tip === 'urun' ? receteler.find(r => r.urunId === id)
      : tip === 'yarimamul' ? receteler.find(r => r.yarimamulId === id)
      : tip === 'altmontaj' ? receteler.find(r => r.altMontajId === id)
      : tip === 'paket' ? receteler.find(r => r.paketId === id)
      : null;
    const gez = (tip, id, carpan) => {
      const anahtar = tip + ':' + id;
      if (gorulen.has(anahtar)) return;
      gorulen.add(anahtar);
      const r = receteBul(tip, id);
      if (!r) return;
      (r.kalemler || []).forEach(k => {
        const miktar = (k.miktar || 1) * carpan;
        if (k.tip === 'yarimamul') {
          sonuc.set(k.refId, (sonuc.get(k.refId) || 0) + miktar);
          // Yarı mamülün kendi reçetesinde başka YM'ler olabilir
          gez('yarimamul', k.refId, miktar);
        } else if (k.tip === 'altmontaj' || k.tip === 'paket') {
          gez(k.tip, k.refId, miktar);
        }
      });
      gorulen.delete(anahtar);
    };
    gez(kokTip, kokId, (opts && opts.carpan) || 1);
    return sonuc;
  }

  // ── TAKIMLAMA / STOKTAN KARŞILANABİLİRLİK ───────────────────────────────
  // Bir siparişin ürünleri, yarı mamül stoklarına göre "takımlanabiliyor mu"?
  // Ürünün reçete alt kırılımındaki HER yarı mamülden yeterli stok varsa ürün
  // stoktan karşılanabilir. Tek bir yarı mamül bile eksikse takım tamamlanmaz;
  // eksik olan(lar) için iş emri açılması gerekir.
  // Dönen: { urunKod, urunAd, urunId, istenen, karsilanabilir, eksikler[], ymDetay[] }
  function siparisTakimlamaDurumu(siparis, urunler, receteler, stokRaf, yarimamuller) {
    const ymStok = (ymId) => (stokRaf || [])
      .filter(s => s.tip === 'yarimamul' && s.refId === ymId)
      .reduce((a, s) => a + (s.miktar || 0), 0);

    const sonuc = [];
    (siparis.kalemler || []).forEach(kalem => {
      if (kalem.grup === 'hammadde' || kalem.ikinciKalite) return;
      const istenen = kalem.miktar || 1;

      if (kalem.grup === 'yarimamul') {
        const ym = (yarimamuller || []).find(y => y.kod === kalem.kod);
        if (!ym) return;
        const mevcut = ymStok(ym.id);
        const eksikAdet = Math.max(0, istenen - mevcut);
        sonuc.push({
          urunId: ym.id, urunKod: ym.kod, urunAd: ym.ad, tip: 'yarimamul', istenen,
          karsilanabilir: Math.min(istenen, mevcut),
          ymDetay: [{ ymId: ym.id, ymKod: ym.kod, ymAd: ym.ad, birimGereken: 1, toplamGereken: istenen, stok: mevcut, eksik: eksikAdet }],
          eksikler: eksikAdet > 0 ? [{ ymId: ym.id, ymKod: ym.kod, ymAd: ym.ad, eksik: eksikAdet }] : []
        });
        return;
      }
      if (kalem.grup !== 'urun') return;

      const urun = (urunler || []).find(u => u.kod === kalem.kod);
      if (!urun) return;
      // Ürünün 1 adedi için gereken yarı mamüller (rekürsif: paket/alt montaj dahil)
      const birimYm = receteAltYarimamulleri('urun', urun.id, receteler);
      const ymDetay = [];
      let takimAdedi = Infinity; // stoktan kaç adet ürün TAKIMLANABİLİR
      birimYm.forEach((birimGereken, ymId) => {
        const ym = (yarimamuller || []).find(y => y.id === ymId);
        const stok = ymStok(ymId);
        const toplamGereken = birimGereken * istenen;
        ymDetay.push({
          ymId, ymKod: ym ? ym.kod : ymId, ymAd: ym ? ym.ad : '',
          birimGereken, toplamGereken, stok, eksik: Math.max(0, toplamGereken - stok)
        });
        takimAdedi = Math.min(takimAdedi, birimGereken > 0 ? Math.floor(stok / birimGereken) : Infinity);
      });
      if (!birimYm.size) takimAdedi = 0; // reçetesiz ürün stoktan takımlanamaz
      const karsilanabilir = Math.max(0, Math.min(istenen, takimAdedi === Infinity ? 0 : takimAdedi));
      // Eksikler: istenen adedi takımlamak için üretilmesi gereken YM miktarları
      const eksikler = ymDetay.filter(d => d.eksik > 0)
        .map(d => ({ ymId: d.ymId, ymKod: d.ymKod, ymAd: d.ymAd, eksik: d.eksik }));
      sonuc.push({ urunId: urun.id, urunKod: urun.kod, urunAd: urun.ad, tip: 'urun', istenen, karsilanabilir, ymDetay, eksikler });
    });
    return sonuc;
  }

  // Eksik yarı mamüller için İŞ EMRİ İHTİYACI kaydı açar (mevcut açık ihtiyaç
  // varsa adedini artırır). Üretim Planlama → İş Emri İhtiyaçları'nda görünür.
  async function isEmriIhtiyaciEkle(istekler, siparisId) {
    const ihtiyaclar = await Store.uretimIsEmriIhtiyaclari.all();
    let acilan = 0, guncellenen = 0;
    istekler.forEach(istek => {
      if (!istek.eksik || istek.eksik <= 0) return;
      const mevcut = ihtiyaclar.find(x => x.yarimamulId === istek.ymId && x.durum === 'acik');
      if (mevcut) {
        mevcut.adet += istek.eksik;
        if (siparisId && !(mevcut.kaynakSiparisler || []).includes(siparisId)) {
          mevcut.kaynakSiparisler = [...(mevcut.kaynakSiparisler || []), siparisId];
        }
        guncellenen++;
      } else {
        ihtiyaclar.push({
          id: uid('UII'), yarimamulId: istek.ymId, yarimamulKod: istek.ymKod, yarimamulAd: istek.ymAd,
          adet: istek.eksik, durum: 'acik', kaynakSiparisler: siparisId ? [siparisId] : [],
          olusturmaTarihi: new Date().toISOString().slice(0, 10)
        });
        acilan++;
      }
    });
    await Store.uretimIsEmriIhtiyaclari.save(ihtiyaclar);
    return { acilan, guncellenen };
  }

  // ── PAKET ÖLÇÜ & AĞIRLIK ÖZETİ ──────────────────────────────────────────
  // Bir ürünün reçetesindeki PAKET kalemlerinden toplam koli sayısı, ağırlık
  // ve desi/hacim çıkarır. Teklif ve sipariş listelerinde gösterilir; navlun
  // ve araç yükleme planlamasında kullanılır.
  // Dönen: {paketSayisi, netKg, brutKg, desi, m3, paketler:[{kod,ad,adet,olcu,brutKg,desi}]}
  function urunPaketOzeti(urunId, receteler, paketler, carpan) {
    const kat = carpan || 1;
    const sonuc = { paketSayisi: 0, netKg: 0, brutKg: 0, desi: 0, m3: 0, paketler: [] };
    const gorulen = new Set();
    const receteBul = (tip, id) =>
      tip === 'urun' ? receteler.find(r => r.urunId === id)
      : tip === 'yarimamul' ? receteler.find(r => r.yarimamulId === id)
      : tip === 'altmontaj' ? receteler.find(r => r.altMontajId === id)
      : tip === 'paket' ? receteler.find(r => r.paketId === id) : null;
    // Reçete ağacında paket kalemlerini topla (paketin altına inilmez)
    const gez = (tip, id, mik) => {
      const anahtar = tip + ':' + id;
      if (gorulen.has(anahtar)) return;
      gorulen.add(anahtar);
      const r = receteBul(tip, id);
      if (!r) return;
      (r.kalemler || []).forEach(k => {
        const miktar = (k.miktar || 1) * mik;
        if (k.tip === 'paket') {
          const p = (paketler || []).find(x => x.id === k.refId);
          if (!p) return;
          // Formül tek kaynaktan: olculerdenHacim
          const hh = olculerdenHacim(p.en, p.boy, p.yukseklik);
          const desi = hh.desi, m3 = hh.m3;
          sonuc.paketSayisi += miktar;
          sonuc.netKg += (p.netAgirlik || 0) * miktar;
          sonuc.brutKg += (p.brutAgirlik || 0) * miktar;
          sonuc.desi += desi * miktar;
          sonuc.m3 += m3 * miktar;
          sonuc.paketler.push({
            kod: p.kod, ad: p.ad, adet: miktar,
            id: p.id,
            en: p.en || 0, boy: p.boy || 0, yukseklik: p.yukseklik || 0,
            netKg: p.netAgirlik || 0, brutKg: p.brutAgirlik || 0, desi, m3,
            ambalajTipi: p.ambalajTipi || 'Koli', koliIciAdet: p.koliIciAdet || 1
          });
        } else if (k.tip === 'yarimamul' || k.tip === 'altmontaj') {
          gez(k.tip, k.refId, miktar);
        }
      });
      gorulen.delete(anahtar);
    };
    gez('urun', urunId, kat);
    return sonuc;
  }

  // ── ÖLÇÜ / HACİM / AĞIRLIK — TEK DOĞRULUK KAYNAĞI ───────────────────────
  // Birimler: en/boy/yükseklik CM, ağırlıklar KG.
  //   desi = (en × boy × yükseklik) / 3000     → kargo standardı
  //   m³   = (en × boy × yükseklik) / 1.000.000
  // Bu iki formül uygulamanın HER yerinde buradan çağrılır; kopyalanmaz.
  function olculerdenHacim(en, boy, yukseklik) {
    const e = parseFloat(en) || 0, b = parseFloat(boy) || 0, y = parseFloat(yukseklik) || 0;
    if (e <= 0 || b <= 0 || y <= 0) return { desi: 0, m3: 0, gecerli: false };
    const cm3 = e * b * y;
    return { desi: cm3 / 3000, m3: cm3 / 1000000, gecerli: true };
  }

  // Bir kartta ELLE girilmiş ölçü/ağırlık var mı?
  function elleOlcuVarMi(kart) {
    if (!kart) return false;
    return !!(parseFloat(kart.en) || parseFloat(kart.boy) || parseFloat(kart.yukseklik)
           || parseFloat(kart.netAgirlik) || parseFloat(kart.brutAgirlik));
  }

  // ── ÖLÇÜ/AĞIRLIK ÇÖZÜMLEME ──────────────────────────────────────────────
  // Bir ürün/kart için gösterilecek ölçü, hacim ve ağırlık değerlerini belirler.
  //
  // İKİ KAYNAK vardır ve ikisi de meşrudur:
  //   1) MANUEL  → kartın kendi en/boy/yükseklik/ağırlık alanları (kullanıcı
  //      ürün kartı veya reçete ekranından elle girer)
  //   2) REÇETE  → reçetedeki PAKET kalemlerinden urunPaketOzeti() ile toplanan
  //      değerler (paket kartlarındaki ölçülerin toplamı)
  //
  // KURAL: elle girilmiş değer varsa O kullanılır (kullanıcı bilinçli olarak
  // girmiştir), yoksa reçeteden hesaplanana düşülür. İki kaynak da doluysa
  // ikisi de döndürülür ki ekranlar farkı gösterebilsin — sessizce birini
  // gizlemek, yanlış navlun/yükleme hesabına yol açar.
  //
  // Dönen: { kaynak:'manuel'|'recete'|'yok', en, boy, yukseklik, desi, m3,
  //          netKg, brutKg, paketSayisi, receteVar, manuelVar, receteOzet }
  function olcuAgirlikCoz(kart, receteOzet, miktar) {
    const kat = (miktar === undefined || miktar === null) ? 1 : (parseFloat(miktar) || 0);
    const manuelVar = elleOlcuVarMi(kart);
    const receteVar = !!(receteOzet && receteOzet.paketSayisi);

    if (manuelVar) {
      const h = olculerdenHacim(kart.en, kart.boy, kart.yukseklik);
      return {
        kaynak: 'manuel', manuelVar, receteVar, receteOzet: receteOzet || null,
        en: parseFloat(kart.en) || 0,
        boy: parseFloat(kart.boy) || 0,
        yukseklik: parseFloat(kart.yukseklik) || 0,
        desi: h.desi * kat, m3: h.m3 * kat,
        netKg: (parseFloat(kart.netAgirlik) || 0) * kat,
        brutKg: (parseFloat(kart.brutAgirlik) || 0) * kat,
        paketSayisi: receteVar ? receteOzet.paketSayisi : 0
      };
    }
    if (receteVar) {
      return {
        kaynak: 'recete', manuelVar, receteVar, receteOzet,
        en: 0, boy: 0, yukseklik: 0,
        desi: receteOzet.desi, m3: receteOzet.m3,
        netKg: receteOzet.netKg, brutKg: receteOzet.brutKg,
        paketSayisi: receteOzet.paketSayisi
      };
    }
    return {
      kaynak: 'yok', manuelVar: false, receteVar: false, receteOzet: null,
      en: 0, boy: 0, yukseklik: 0, desi: 0, m3: 0, netKg: 0, brutKg: 0, paketSayisi: 0
    };
  }

  // Çözülmüş ölçü/ağırlığı tek satırlık okunur metne çevirir.
  // Boş alanlar atlanır; hiçbir veri yoksa boş metin döner (ekran '—' basar).
  function olcuOzetMetni(coz, secenek) {
    if (!coz || coz.kaynak === 'yok') return '';
    const s = secenek || {};
    const par = [];
    if (coz.paketSayisi && !s.paketGizle) par.push(fmt(coz.paketSayisi, 0) + ' koli');
    if (coz.en && coz.boy && coz.yukseklik) {
      par.push(fmt(coz.en, 0) + '×' + fmt(coz.boy, 0) + '×' + fmt(coz.yukseklik, 0) + ' cm');
    }
    if (coz.m3) par.push(fmt(coz.m3, 3) + ' m³');
    if (coz.brutKg) par.push(fmt(coz.brutKg, 1) + ' kg brüt');
    else if (coz.netKg) par.push(fmt(coz.netKg, 1) + ' kg net');
    if (coz.desi && s.desiGoster) par.push(fmt(coz.desi, 1) + ' desi');
    return par.join(' · ');
  }

  // Çözülmüş değerlerin kaynağını gösteren küçük rozet (şeffaflık için)
  function olcuKaynakRozeti(coz) {
    if (!coz || coz.kaynak === 'yok') return '';
    if (coz.kaynak === 'manuel') {
      // Reçeteden de bir değer çıkıyorsa kullanıcı farkı görebilmeli
      const cakisma = coz.receteVar && coz.receteOzet && coz.receteOzet.m3
        && Math.abs(coz.receteOzet.m3 - coz.m3) > 0.0005;
      return `<span class="pill pill-blue" style="font-size:9px" title="Kart üzerinde elle girilmiş değer kullanılıyor${
        cakisma ? ' — reçeteden hesaplanan: ' + fmt(coz.receteOzet.m3, 3) + ' m³, ' + fmt(coz.receteOzet.brutKg, 1) + ' kg' : ''
      }">elle${cakisma ? ' ⚠' : ''}</span>`;
    }
    return `<span class="pill pill-gray" style="font-size:9px" title="Reçetedeki paket kalemlerinden hesaplandı">reçete</span>`;
  }

  // ── ÇEKİ LİSTESİ (PACKING LIST) ─────────────────────────────────────────
  // Bir teklif/siparişin TÜM kalemlerindeki paketleri SATIR SATIR açar.
  // Her satır tek bir paket tipini ve o tipten kaç adet gittiğini gösterir;
  // birim ve toplam hacim/ağırlık ayrı ayrı verilir.
  //
  // Neden ayrı fonksiyon: özet kutusu yalnızca genel toplamı verir. Sevkiyat
  // ve gümrük evrağı için hangi kolinin kaç adet ve ne ölçüde olduğunun
  // dökümü gerekir.
  //
  // Dönen: {
  //   satirlar: [{urunKod, urunAd, urunMiktar, paketKod, paketAd, ambalajTipi,
  //               adet, en, boy, yukseklik, birimM3, birimBrutKg,
  //               toplamM3, toplamDesi, toplamNetKg, toplamBrutKg}],
  //   toplam: {paketSayisi, m3, desi, netKg, brutKg},
  //   olcusuzPaketler: [kod]        // ölçüsü girilmemiş paketler (uyarı için)
  // }
  function cekiListesiUret(kalemler, urunler, receteler, paketler) {
    const satirlar = [];
    const toplam = { paketSayisi: 0, m3: 0, desi: 0, netKg: 0, brutKg: 0 };
    const olcusuz = new Set();

    (kalemler || []).forEach(k => {
      const urun = (urunler || []).find(u => u.kod === k.kod);
      if (!urun) return;
      const miktar = k.miktar || 1;
      const ozet = urunPaketOzeti(urun.id, receteler, paketler, miktar);

      if (!ozet.paketSayisi) {
        // Paket kalemi yok — ürün kartında elle ölçü girilmişse onu tek satır
        // olarak göster ki çeki listesi eksik kalmasın.
        const coz = olcuAgirlikCoz(urun, null, miktar);
        if (coz.kaynak === 'manuel') {
          satirlar.push({
            urunKod: urun.kod, urunAd: urun.ad, urunMiktar: miktar,
            paketKod: '—', paketAd: 'Ürün kartı ölçüsü (paket tanımlı değil)',
            ambalajTipi: '—', adet: miktar,
            en: coz.en, boy: coz.boy, yukseklik: coz.yukseklik,
            birimM3: miktar ? coz.m3 / miktar : 0,
            birimBrutKg: miktar ? coz.brutKg / miktar : 0,
            toplamM3: coz.m3, toplamDesi: coz.desi,
            toplamNetKg: coz.netKg, toplamBrutKg: coz.brutKg,
            elleGirilmis: true
          });
          toplam.paketSayisi += miktar;
          toplam.m3 += coz.m3; toplam.desi += coz.desi;
          toplam.netKg += coz.netKg; toplam.brutKg += coz.brutKg;
        }
        return;
      }

      (ozet.paketler || []).forEach(p => {
        const h = olculerdenHacim(p.en, p.boy, p.yukseklik);
        if (!h.gecerli) olcusuz.add(p.kod);
        satirlar.push({
          urunKod: urun.kod, urunAd: urun.ad, urunMiktar: miktar,
          paketKod: p.kod, paketAd: p.ad, ambalajTipi: p.ambalajTipi || 'Koli',
          adet: p.adet,
          en: p.en, boy: p.boy, yukseklik: p.yukseklik,
          birimM3: h.m3, birimBrutKg: p.brutKg,
          toplamM3: h.m3 * p.adet,
          toplamDesi: h.desi * p.adet,
          toplamNetKg: (p.netKg || 0) * p.adet,
          toplamBrutKg: (p.brutKg || 0) * p.adet,
          elleGirilmis: false
        });
        toplam.paketSayisi += p.adet;
        toplam.m3 += h.m3 * p.adet;
        toplam.desi += h.desi * p.adet;
        toplam.netKg += (p.netKg || 0) * p.adet;
        toplam.brutKg += (p.brutKg || 0) * p.adet;
      });
    });

    return { satirlar, toplam, olcusuzPaketler: Array.from(olcusuz) };
  }

  // Paket özetini tek satırlık okunur metne çevirir (liste hücreleri için)
  function paketOzetMetni(ozet) {
    if (!ozet || !ozet.paketSayisi) return '';
    const par = [fmt(ozet.paketSayisi, 0) + ' koli'];
    if (ozet.m3) par.push(fmt(ozet.m3, 3) + ' m³');
    if (ozet.brutKg) par.push(fmt(ozet.brutKg, 1) + ' kg');
    if (ozet.desi) par.push(fmt(ozet.desi, 1) + ' desi');
    return par.join(' · ');
  }

  // ── AKORDEON KART ÜRETİCİ ───────────────────────────────────────────────
  // Yönetim panellerinde uzun içerikleri birim birim açılır/kapanır satırlara
  // böler. bolumler: [{ baslik, ikon, altBaslik, rozet, icerikHtml, acik }]
  // İlk bölüm varsayılan açık gelir. akordeonBagla(kok) tık davranışını kurar.
  function akordeonHtml(bolumler) {
    return bolumler.map((b, i) => `
      <div class="acc-card ${b.acik || (b.acik === undefined && i === 0) ? 'open' : ''}" data-acc="${i}">
        <div class="acc-head">
          ${b.ikon ? `<span class="acc-ico">${b.ikon}</span>` : ''}
          <span class="acc-title">${b.baslik}</span>
          ${b.altBaslik ? `<span class="acc-sub">${b.altBaslik}</span>` : ''}
          ${b.rozet ? `<span class="acc-badge">${b.rozet}</span>` : ''}
          <span class="acc-chev">▶</span>
        </div>
        <div class="acc-body">${b.icerikHtml}</div>
      </div>`).join('');
  }
  function akordeonBagla(kok) {
    (kok || document).querySelectorAll('.acc-card > .acc-head').forEach(head => {
      head.onclick = () => head.parentElement.classList.toggle('open');
    });
  }

  function kalemleriKdvGrupla(kalemler, genelIskontoYuzde, ekGiderler) {
    const giy = genelIskontoYuzde || 0;
    // 2. kalite / defolu / seri sonu kalemleri iskontodan MUAFTIR. Bu yüzden
    // KDV oranına göre gruplarken "iskonto uygulanabilir" ve "iskonto muaf"
    // tutarlarını ayrı biriktirir, genel iskontoyu yalnızca ilkine uygularız.
    const gruplar = new Map(); // oran -> { iskontolu, muaf }
    (kalemler || []).forEach(k => {
      const oran = k.kdvOrani ?? 18;
      if (!gruplar.has(oran)) gruplar.set(oran, { iskontolu: 0, muaf: 0 });
      const g = gruplar.get(oran);
      const tutar = k.netFiyat * k.miktar;
      if (k.ikinciKalite) g.muaf += tutar; else g.iskontolu += tutar;
    });
    // ── EK GİDER KALEMLERİ (nakliye, palet, montaj, fason bantlama/CNC…) ──
    // Kesapp'ın "görünmeyen giderler" yaklaşımının karşılığı. Bu kalemler
    // MÜŞTERİYE YANSITILAN operasyonel giderlerdir. Genel iskontodan MUAFTIR
    // (bir nakliye masrafını iskonto etmek anlamsızdır) ve kendi KDV oranını
    // taşır. Toplam tutarları önceden hesaplanmış olarak gelir (bkz.
    // ekGiderToplami); burada yalnızca KDV gruplarına eklenir.
    (ekGiderler || []).forEach(g => {
      if (!g || !g.musteriyeYansit) return;   // yalnızca yansıtılanlar teklife girer
      const oran = g.kdvOrani ?? 20;
      if (!gruplar.has(oran)) gruplar.set(oran, { iskontolu: 0, muaf: 0 });
      gruplar.get(oran).muaf += (+g.tutar || 0);   // iskonto muaf tarafta
    });
    const siraliOranlar = [...gruplar.keys()].sort((a, b) => a - b);
    let kdvHaricToplam = 0, kdvTutariToplam = 0, kdvDahilToplam = 0;
    const detaylar = siraliOranlar.map(oran => {
      const g = gruplar.get(oran);
      // İskonto sadece iskontolu tutara; muaf (2. kalite + ek gider) tam fiyattan
      const kdvHaric = g.iskontolu * (1 - giy / 100) + g.muaf;
      const kdvTutari = kdvHaric * (oran / 100);
      const kdvDahil = kdvHaric + kdvTutari;
      kdvHaricToplam += kdvHaric; kdvTutariToplam += kdvTutari; kdvDahilToplam += kdvDahil;
      return { oran, kdvHaric, kdvTutari, kdvDahil };
    });
    return { detaylar, kdvHaricToplam, kdvTutariToplam, kdvDahilToplam };
  }

  // ── EK GİDER KATALOĞU VE HESABI ─────────────────────────────────────────
  // Kesapp karşılaştırmasından çıkan geliştirme: proje bazlı operasyonel
  // ("görünmeyen") giderler. Global %7 nakliye çarpanı yerine kalem kalem,
  // gerçek maliyet. Her kalem üç yöntemden biriyle hesaplanır:
  //   'sabit'  → doğrudan tutar (TL)
  //   'm2'     → birim × proje toplam m² (kesim/bantlama/pres gibi)
  //   'm3'     → birim × proje toplam m³ (nakliye/hacim bazlı)
  //   'yuzde'  → oran × ara toplam (komisyon/genel gider gibi)
  // musteriyeYansit=false ise SADECE iç maliyet analizine girer, teklife değil.
  const EK_GIDER_KATALOG = [
    { tur: 'nakliye',   ad: 'Nakliye / Taşıma',      yontem: 'm3',    varsayilanBirim: 0 },
    { tur: 'palet',     ad: 'Palet / Ambalaj',       yontem: 'sabit', varsayilanBirim: 0 },
    { tur: 'montaj',    ad: 'Montaj / Kurulum',      yontem: 'sabit', varsayilanBirim: 0 },
    { tur: 'konaklama', ad: 'Konaklama / Yol',       yontem: 'sabit', varsayilanBirim: 0 },
    { tur: 'kesim',     ad: 'Fason Kesim (ebatlama)',yontem: 'm2',    varsayilanBirim: 0 },
    { tur: 'bantlama',  ad: 'Fason Kenar Bantlama',  yontem: 'm2',    varsayilanBirim: 0 },
    { tur: 'kanal',     ad: 'Kanal Açma',            yontem: 'm2',    varsayilanBirim: 0 },
    { tur: 'cnc',       ad: 'Fason CNC İşleme',      yontem: 'm2',    varsayilanBirim: 0 },
    { tur: 'pres',      ad: 'Pres / Kaplama',        yontem: 'm2',    varsayilanBirim: 0 },
    { tur: 'diger',     ad: 'Diğer Gider',           yontem: 'sabit', varsayilanBirim: 0 }
  ];

  // Tek bir ek gider kaleminin tutarını hesaplar.
  // olcu: { m2, m3, araToplam } — projenin toplam alanı/hacmi/tutarı
  function ekGiderTutar(g, olcu) {
    if (!g) return 0;
    const birim = +g.birim || 0;
    const o = olcu || {};
    switch (g.yontem) {
      case 'm2':    return birim * (+o.m2 || 0);
      case 'm3':    return birim * (+o.m3 || 0);
      case 'yuzde': return (+o.araToplam || 0) * birim / 100;
      case 'sabit':
      default:      return birim;
    }
  }

  // Ek gider listesinin toplamını, her kaleme güncel tutarını yazarak döndürür.
  // Dönen: { kalemler:[{...g, tutar}], yansitilanToplam, icMaliyetToplam }
  function ekGiderToplami(ekGiderler, olcu) {
    let yansitilan = 0, icMaliyet = 0;
    const kalemler = (ekGiderler || []).map(g => {
      const tutar = ekGiderTutar(g, olcu);
      icMaliyet += tutar;
      if (g.musteriyeYansit) yansitilan += tutar;
      return Object.assign({}, g, { tutar });
    });
    return { kalemler, yansitilanToplam: yansitilan, icMaliyetToplam: icMaliyet };
  }

  // ── BİR KARTIN (ürün/yarımamül/hammadde) HANGİ REÇETE(LER)DE KULLANILDIĞI ──
  // Reçete Yap ekranındaki "Nerede Kullanılıyor" butonu bunu çağırır. Hem
  // ürün reçetelerini (receteler[].urunId) hem yarımamül alt-reçetelerini
  // (receteler[].yarimamulId) tarar, kartı kalemlerinde (tip+refId ile)
  // bulduğu her reçeteyi "kullanıldığı yer" olarak listeler.
  async function kartNeredeKullaniliyor(tip, refId) {
    const [receteler, urunler, yarimamuller, altMontajlar, paketler] = await Promise.all([
      Store.receteler.all(), Store.urunler.all(), Store.yarimamuller.all(), Store.altMontajlar.all(), Store.paketler.all()
    ]);
    const sonuclar = [];
    receteler.forEach(r => {
      const kullanildigiKalem = (r.kalemler || []).find(k => k.tip === tip && k.refId === refId);
      if (!kullanildigiKalem) return;
      if (r.urunId) {
        const urun = urunler.find(u => u.id === r.urunId);
        sonuclar.push({ ustTip: 'urun', ustId: r.urunId, ustKod: urun ? urun.kod : r.urunId, ustAd: urun ? urun.ad : '(silinmiş ürün)', miktar: kullanildigiKalem.miktar, birim: kullanildigiKalem.birim });
      } else if (r.yarimamulId) {
        const ym = yarimamuller.find(y => y.id === r.yarimamulId);
        sonuclar.push({ ustTip: 'yarimamul', ustId: r.yarimamulId, ustKod: ym ? ym.kod : r.yarimamulId, ustAd: ym ? ym.ad : '(silinmiş yarımamül)', miktar: kullanildigiKalem.miktar, birim: kullanildigiKalem.birim });
      } else if (r.altMontajId) {
        const am = altMontajlar.find(a => a.id === r.altMontajId);
        sonuclar.push({ ustTip: 'altmontaj', ustId: r.altMontajId, ustKod: am ? am.kod : r.altMontajId, ustAd: am ? am.ad : '(silinmiş alt montaj)', miktar: kullanildigiKalem.miktar, birim: kullanildigiKalem.birim });
      } else if (r.paketId) {
        const pk = paketler.find(p => p.id === r.paketId);
        sonuclar.push({ ustTip: 'paket', ustId: r.paketId, ustKod: pk ? pk.kod : r.paketId, ustAd: pk ? pk.ad : '(silinmiş paket)', miktar: kullanildigiKalem.miktar, birim: kullanildigiKalem.birim });
      }
    });
    return sonuclar;
  }

  async function irsaliyeKesilinceFaturaOlustur(siparis, musteri, irsaliye) {
    // Kalem bazlı KDV: siparişin kalemlerinde kdvOrani varsa (Teklif'ten
    // gelen kalem bazlı KDV) o kullanılır; kalemler yoksa (eski/serbest
    // sipariş) tek bir genel KDV oranına (müşteri veya genel ayar) düşülür.
    const kdvGruplari = (siparis.kalemler && siparis.kalemler.length)
      ? kalemleriKdvGrupla(siparis.kalemler, siparis.genelIskontoYuzde)
      : null;

    let matrah, kdvOrani, kdvTutari, genelToplam, kdvDetaylari;
    if (kdvGruplari && kdvGruplari.detaylar.length) {
      matrah = kdvGruplari.kdvHaricToplam;
      kdvTutari = kdvGruplari.kdvTutariToplam;
      genelToplam = kdvGruplari.kdvDahilToplam;
      kdvOrani = kdvGruplari.detaylar.length === 1 ? kdvGruplari.detaylar[0].oran : null; // tek oran varsa onu, farklıysa null (detaylarda görünür)
      kdvDetaylari = kdvGruplari.detaylar;
    } else {
      kdvOrani = (musteri && musteri.kdvOraniYuzde != null) ? musteri.kdvOraniYuzde : (state.ayarlar.kdvOraniYuzde ?? 20);
      matrah = siparis.toplam || 0;
      kdvTutari = matrah * (kdvOrani / 100);
      genelToplam = matrah + kdvTutari;
      kdvDetaylari = [{ oran: kdvOrani, kdvHaric: matrah, kdvTutari, kdvDahil: genelToplam }];
    }

    // KULLANICI KARARI (güncel): Ödeme planındaki peşinat+çek+kredi kartı
    // ARTIK sipariş ONAYLANDIĞI anda (bkz. siparisOnaylaninceOdemePlaniniAnindaIsle)
    // anında kasaya/cariye işlenmiştir — burada (fatura/irsaliye kesiminde)
    // BİR DAHA bakiyeye eklenmez, BİR DAHA tahsilatBeklenenler'e düşürülmez.
    // Bu fonksiyon SADECE resmi faturayı (KDV'li) oluşturur; nakit akışı
    // zaten sipariş onayı anında gerçekleşmiştir. Yalnızca ileri tarihli
    // NAKİT kalemler (sipariş onayında tahsilatBeklenenler'e düşürülmüş
    // olanlar) burada faturaNo referansıyla güncellenir — böylece o kalemler
    // onaylandığında doğru faturayla ilişkilendirilir.
    const pesinatTutar = (siparis.odemePlani && siparis.odemePlani.pesinatTutar) || 0;
    const odemeKalemleri = (siparis.odemePlani && siparis.odemePlani.odemeKalemleri) || [];
    const vadeTarihi = odemeKalemleri.length ? odemeKalemleri.map(k => k.tarih).filter(Boolean).sort().slice(-1)[0] || null : null;

    const fatura = {
      id: uid('FTR'),
      faturaNo: 'FTR-' + Date.now().toString(36).toUpperCase(),
      siparisId: siparis.id, siparisKod: siparis.kod,
      irsaliyeId: irsaliye.id, irsaliyeNo: irsaliye.irsaliyeNo,
      musteriId: siparis.musteriId, musteriAdi: siparis.musteriAdi,
      matrah, kdvOrani, kdvTutari, genelToplam, kdvDetaylari,
      pesinatMahsup: pesinatTutar, odenecekBakiye: 0, vadeTarihi,
      odemePlaniSiparisOnayindaIslendi: true,
      tarih: new Date().toISOString().slice(0, 10)
    };
    await Store.faturalar.upsert(fatura);

    // Sipariş onayında oluşturulmuş (henüz ileri tarihli nakit olduğu için
    // bekleyen) tahsilatBeklenenler kayıtlarını bu faturanın faturaId/faturaNo
    // alanlarıyla eşleştir — sadece referans amaçlı, durumlarını değiştirmez.
    const tahsilatBeklenenler = await Store.tahsilatBeklenenler.all();
    let referansGuncellendi = false;
    tahsilatBeklenenler.forEach(t => {
      if (t.siparisId === siparis.id && !t.faturaId) { t.faturaId = fatura.id; t.faturaNo = fatura.faturaNo; referansGuncellendi = true; }
    });
    if (referansGuncellendi) await Store.tahsilatBeklenenler.save(tahsilatBeklenenler);

    // NOT: Muhasebeye gelir kaydı, fatura kesilince (tahakkuk esası) burada
    // hâlâ oluşturulur — bu, tahsil edilip edilmemesinden bağımsız olarak
    // satışın gerçekleştiğini gösterir. Tahsilat onaylandığında AYRICA bir
    // "tahsilat" kaydı (kasa/banka hareketi) oluşur (bkz. Muhasebe Panel).
    await muhasebeKaydiOlustur({
      tip: 'gelir', kategori: 'satis_faturasi',
      aciklama: 'Satış faturası: ' + fatura.faturaNo + ' — ' + siparis.musteriAdi,
      tutar: genelToplam, matrah, kdvTutari, kaynakId: fatura.id, kaynakTip: 'fatura'
    });

    return fatura;
  }

  // ── PAYLAŞILAN SİPARİŞ İÇERİĞİ + ÖDEME PLANI FORMU ────────────────────────
  // Teklif (Siparişe Dönüştür), Cari İşlemler ve Yönetim AYNI ortak modalı
  // kullanır. Sipariş kalemleri, toplam, risk durumu (varsa) ve ödeme planı
  // (peşinat + sekmeli ödeme yöntemleri: Çek/Kredi Kartı/Nakit/Diğer, her
  // birinde "+ Ekle" ile birden fazla kalem) tek yerde gösterilir/düzenlenir.
  //
  // siparis.odemePlani = {
  //   pesinatTutar, sozlesmeVar, not,
  //   odemeKalemleri: [
  //     {id, tip:'cek', tarih, cekNo, tutar},
  //     {id, tip:'kredi_karti', taksitTipi:'tek_cekim'|'vadeli', taksitSayisi, tarih, tutar},
  //     {id, tip:'nakit'|'diger', tarih, tutar, aciklama}
  //   ]
  // }
  //
  // opts: {
  //   mod: 'teklif' | 'cari' | 'yonetim'   — başlık/buton metnini belirler
  //   risk: {asildiMi, acikRisk, limit} | null
  //   duzenlenebilir: bool                  — true ise form alanları aktif
  //   onaylaButonMetni: string | null
  //   onOnayla: async (odemePlani) => {}     — onay butonuna basılınca çağrılır
  //   onReddet: (() => {}) | null            — varsa Reddet butonu da gösterilir
  //   onDuzenle: bool                        — salt-görüntülemede "Düzenle" linki gösterir
  // }
  function siparisIcerikVeOdemeFormuAc(siparis, opts) {
    const op = siparis.odemePlani || { pesinatTutar: 0, sozlesmeVar: false, not: '', odemeKalemleri: [] };
    const duzenlenebilir = opts.mod === 'teklif' || opts.mod === 'cari' || opts.mod === 'satinalma' || opts.duzenlenebilir;
    const body = document.createElement('div');

    // İçerik (kalemler tablosu) varsayılan olarak satış siparişi formatında
    // (kod/ad/miktar/netFiyat) render edilir; opts.icerikHtml verilirse onun
    // yerine kullanılır (örn. Satınalma — tedarikçi bazlı kalem listesi).
    const kalemlerHtml = opts.icerikHtml || `
      <table class="dtable"><tr><th>Ürün</th><th class="r">Miktar</th><th class="r">Net Fiyat</th><th class="r">Toplam</th></tr>
        ${(siparis.kalemler || []).map(k => `<tr><td><b class="mono">${escapeHtml(k.kod)}</b> — ${escapeHtml(k.ad)}</td>
          <td class="r">${k.miktar}</td><td class="r">${fmtTL(k.netFiyat)}</td><td class="r">${fmtTL(k.netFiyat * k.miktar)}</td></tr>`).join('')}
        <tr class="total-row"><td colspan="3">TOPLAM</td><td class="r">${fmtTL(siparis.toplam)}</td></tr>
      </table>`;

    const riskHtml = (opts.risk && opts.risk.limit != null) ? `<div class="fhint" style="margin:10px 0;${opts.risk.asildiMi ? 'color:var(--red-text)' : ''}">
        ${opts.risk.asildiMi ? '⚠ ' : ''}Müşteri açık risk durumu: <b>${fmtTL(opts.risk.acikRisk)}</b> / Limit: <b>${fmtTL(opts.risk.limit)}</b>
        ${opts.risk.asildiMi ? ' — Risk limiti AŞILIYOR.' : ''}
      </div>` : '';

    const tipLabel = { cek: 'Çek', kredi_karti: 'Kredi Kartı', nakit: 'Nakit', diger: 'Diğer' };

    // Çalışma kopyası — modal içinde state olarak tutulur, kaydedilince siparişe yazılır.
    let calismaKopyasi = { pesinatTutar: op.pesinatTutar || 0, sozlesmeVar: !!op.sozlesmeVar, not: op.not || '', odemeKalemleri: (op.odemeKalemleri || []).map(k => ({ ...k })) };
    let aktifSekme = 'cek';

    let odemeFormuHtml;
    if (duzenlenebilir) {
      odemeFormuHtml = `
        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">Ödeme Planı</div>
        <div class="frow">
          <div class="fgroup"><label class="flbl">Peşinat Tutarı (₺)</label><input class="finput" id="sf-pesinat-tutar" type="number" value="${calismaKopyasi.pesinatTutar || ''}"></div>
          <div class="fgroup" style="display:flex;align-items:flex-end;padding-bottom:6px">
            <div class="fcheck"><input type="checkbox" id="sf-sozlesme-var" ${calismaKopyasi.sozlesmeVar ? 'checked' : ''}><label for="sf-sozlesme-var">Sözleşme mevcut</label></div>
          </div>
        </div>
        <div class="fhint" style="margin-top:-4px">Kalan bakiye, aşağıdaki ödeme kalemleriyle (çek/kredi kartı/nakit/diğer) kapatılır.</div>
        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">Kalan Bakiye — Ödeme Yöntemi</div>
        <div class="tabs" id="sf-odeme-tabs" style="margin-bottom:10px">
          <div class="tab ${aktifSekme === 'cek' ? 'active' : ''}" data-tip="cek">Çek</div>
          <div class="tab ${aktifSekme === 'kredi_karti' ? 'active' : ''}" data-tip="kredi_karti">Kredi Kartı</div>
          <div class="tab ${aktifSekme === 'nakit' ? 'active' : ''}" data-tip="nakit">Nakit</div>
          <div class="tab ${aktifSekme === 'diger' ? 'active' : ''}" data-tip="diger">Diğer</div>
        </div>
        <div id="sf-odeme-tab-content"></div>
        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">Eklenen Ödeme Kalemleri</div>
        <div id="sf-odeme-kalem-list"></div>
        <div class="fgroup" style="margin-top:10px"><label class="flbl">Not</label><textarea class="ftextarea" id="sf-not">${escapeHtml(calismaKopyasi.not)}</textarea></div>
      `;
    } else {
      const toplamOdemeKalemi = calismaKopyasi.odemeKalemleri.reduce((a, k) => a + (k.tutar || 0), 0);
      odemeFormuHtml = `
        <div class="hr"></div>
        <div class="flbl" style="margin-bottom:8px">Ödeme Planı</div>
        <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
          <div>Peşinat: <b>${calismaKopyasi.pesinatTutar ? fmtTL(calismaKopyasi.pesinatTutar) : 'Yok'}</b></div>
          <div>Sözleşme: <b>${calismaKopyasi.sozlesmeVar ? 'Mevcut' : 'Yok'}</b></div>
          <div>Toplam Ödeme Kalemi: <b>${calismaKopyasi.odemeKalemleri.length} kalem (${fmtTL(toplamOdemeKalemi)})</b></div>
        </div>
        ${calismaKopyasi.odemeKalemleri.length ? `<table class="dtable" style="margin-top:8px"><tr><th>Tip</th><th>Tarih</th><th>Detay</th><th class="r">Tutar</th></tr>
          ${calismaKopyasi.odemeKalemleri.map(k => `<tr><td><span class="pill pill-gray">${tipLabel[k.tip]}</span></td><td style="font-size:11px">${k.tarih || '—'}</td>
            <td style="font-size:11px">${odemeKalemiDetayMetni(k)}</td><td class="r">${fmtTL(k.tutar)}</td></tr>`).join('')}
        </table>` : ''}
        ${calismaKopyasi.not ? `<div style="margin-top:8px;font-size:12px">Not: ${escapeHtml(calismaKopyasi.not)}</div>` : ''}
        ${opts.onDuzenle ? `<div style="margin-top:10px"><button class="btn btn-sm" id="sf-duzenle-btn">Ödeme Planını Düzenle</button></div>` : ''}
      `;
    }

    body.innerHTML = kalemlerHtml + riskHtml + odemeFormuHtml;

    const footerButtons = [];
    if (opts.onReddet) footerButtons.push(`<button class="btn" id="sf-reddet">Reddet</button>`);
    footerButtons.push(`<button class="btn" id="sf-cancel">${duzenlenebilir ? 'Vazgeç' : 'Kapat'}</button>`);
    if (duzenlenebilir && opts.onOnayla) footerButtons.push(`<button class="btn btn-green" id="sf-onayla">${opts.onaylaButonMetni || defaultOnaylaMetni(opts.mod)}</button>`);

    openModal({ title: (opts.baslikOnEki || 'Sipariş: ') + siparis.kod, sub: opts.baslikSub ?? siparis.musteriAdi, body, footer: footerButtons.join(''), wide: true });

    function odemeKalemiDetayMetni(k) {
      if (k.tip === 'cek') return 'Çek No: ' + (k.cekNo || '—');
      if (k.tip === 'kredi_karti') return (k.taksitTipi === 'vadeli' ? (k.taksitSayisi || '') + ' Taksit' : 'Tek Çekim');
      return escapeHtml(k.aciklama || '—');
    }

    function defaultOnaylaMetni(mod) {
      if (mod === 'teklif') return 'Onayla ve Cari Onayına Gönder';
      if (mod === 'cari') return 'Onayla ve Yönetim Onayına Gönder';
      if (mod === 'satinalma') return 'Onayla ve Yönetim Onayına Gönder';
      return 'Onayla';
    }

    if (!duzenlenebilir) {
      const duzenleBtn = document.getElementById('sf-duzenle-btn');
      if (duzenleBtn) duzenleBtn.onclick = () => siparisIcerikVeOdemeFormuAc(siparis, { ...opts, duzenlenebilir: true });
      document.getElementById('sf-cancel').onclick = closeModal;
      const reddetBtn = document.getElementById('sf-reddet');
      if (reddetBtn) reddetBtn.onclick = () => { closeModal(); opts.onReddet(); };
      return;
    }

    // ── Düzenlenebilir mod: sekme + ödeme kalemi listesi yönetimi ───────────
    function renderOdemeKalemList() {
      const wrap = document.getElementById('sf-odeme-kalem-list');
      if (!calismaKopyasi.odemeKalemleri.length) {
        wrap.innerHTML = `<div class="muted" style="font-size:11.5px;padding:6px 0">Henüz ödeme kalemi eklenmedi.</div>`;
        return;
      }
      wrap.innerHTML = calismaKopyasi.odemeKalemleri.map((k, i) => `
        <div class="flex-gap" style="gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span class="pill pill-gray">${tipLabel[k.tip]}</span>
          <div style="flex:1;font-size:12px">${k.tarih || '—'} — ${odemeKalemiDetayMetni(k)} — <b>${fmtTL(k.tutar)}</b></div>
          <button type="button" class="btn btn-icon btn-ghost sf-kalem-sil" data-i="${i}" style="color:var(--red-text)">&times;</button>
        </div>`).join('');
      wrap.querySelectorAll('.sf-kalem-sil').forEach(b => b.onclick = () => {
        calismaKopyasi.odemeKalemleri.splice(parseInt(b.dataset.i), 1);
        renderOdemeKalemList();
      });
    }
    renderOdemeKalemList();

    function renderOdemeTabContent() {
      const wrap = document.getElementById('sf-odeme-tab-content');
      if (aktifSekme === 'cek') {
        // ── SATINALMA MODU: "Çek" sekmesi artık yeni çek YAZMAK için değil,
        // müşterilerden tahsil edilmiş ve henüz kullanılmamış ("elde") çekler
        // arasından SEÇİP bu tedarikçi siparişine REZERVE etmek için kullanılır.
        // Seçilen çek hemen ciro edilmiş SAYILMAZ (durum: 'rezerve' olur) —
        // sadece Yönetim ONAYLAYINCA gerçek ciroya döner (durum: 'ciro_edildi').
        // Reddedilirse veya sipariş iptal olursa çek tekrar 'elde' durumuna
        // döner, başka bir ödemede kullanılabilir.
        if (opts.mod === 'satinalma') {
          const elindekiCekler = (opts.musteriCekleri || []).filter(c => c.durum === 'elde');
          if (!elindekiCekler.length) {
            wrap.innerHTML = `<div class="fhint" style="color:var(--red-text)">⚠ Şu anda elde (tahsil edilmiş, kullanılmamış) müşteri çeki yok.</div>`;
          } else {
            wrap.innerHTML = `
              <div class="fgroup"><label class="flbl">Rezerve Edilecek Çek Seçin</label>
                <select class="fselect" id="sf-cek-secim">
                  ${elindekiCekler.map(c => `<option value="${c.id}">${escapeHtml(c.musteriAdi)} — Çek No: ${escapeHtml(c.cekNo)} — ${fmtTL(c.tutar)} — Vade: ${c.vadeTarihi}</option>`).join('')}
                </select>
              </div>
              <button type="button" class="btn btn-sm" id="sf-ekle-cek">+ Çeki Rezerve Et</button>
              <div class="fhint">Bu çek seçildiğinde hemen "kullanılmaz" — sadece bu siparişe REZERVE edilir. Yönetim siparişi onaylayınca rezervasyon gerçek ciroya dönüşür, reddedilirse çek tekrar kullanılabilir hale gelir.</div>`;
            document.getElementById('sf-ekle-cek').onclick = () => {
              const secim = document.getElementById('sf-cek-secim');
              const cek = elindekiCekler.find(c => c.id === secim.value);
              if (!cek) return;
              calismaKopyasi.odemeKalemleri.push({ id: uid('ODK'), tip: 'cek', tarih: cek.vadeTarihi, cekNo: cek.cekNo, tutar: cek.tutar, musteriCekId: cek.id, musteriAdi: cek.musteriAdi });
              renderOdemeKalemList();
              renderOdemeTabContent();
            };
          }
        } else {
          wrap.innerHTML = `
            <div class="frow">
              <div class="fgroup"><label class="flbl">Vade Tarihi</label><input class="finput" id="sf-cek-tarih" type="date"></div>
              <div class="fgroup"><label class="flbl">Çek Numarası</label><input class="finput" id="sf-cek-no"></div>
              <div class="fgroup"><label class="flbl">Tutar (₺)</label><input class="finput" id="sf-cek-tutar" type="number"></div>
            </div>
            <button type="button" class="btn btn-sm" id="sf-ekle-cek">+ Çek Ekle</button>`;
          document.getElementById('sf-ekle-cek').onclick = () => {
            const tarih = document.getElementById('sf-cek-tarih').value;
            const tutar = parseFloat(document.getElementById('sf-cek-tutar').value);
            if (!tarih || !tutar) { toast('Vade tarihi ve tutar zorunlu', 'err'); return; }
            calismaKopyasi.odemeKalemleri.push({ id: uid('ODK'), tip: 'cek', tarih, cekNo: document.getElementById('sf-cek-no').value.trim(), tutar });
            renderOdemeKalemList();
            renderOdemeTabContent();
          };
        }
      } else if (aktifSekme === 'kredi_karti') {
        wrap.innerHTML = `
          <div class="fgroup"><label class="flbl">Çekim Tipi</label>
            <select class="fselect" id="sf-kk-tip">
              <option value="tek_cekim">Tek Çekim</option>
              <option value="vadeli">Vadeli (Taksitli)</option>
            </select>
          </div>
          <div class="frow">
            <div class="fgroup" id="sf-kk-taksit-wrap" style="display:none"><label class="flbl">Taksit Sayısı</label><input class="finput" id="sf-kk-taksit-sayisi" type="number" value="2"></div>
            <div class="fgroup"><label class="flbl">İşlem Tarihi</label><input class="finput" id="sf-kk-tarih" type="date"></div>
            <div class="fgroup"><label class="flbl">Tutar (₺)</label><input class="finput" id="sf-kk-tutar" type="number"></div>
          </div>
          <button type="button" class="btn btn-sm" id="sf-ekle-kk">+ Kredi Kartı Ödemesi Ekle</button>`;
        document.getElementById('sf-kk-tip').onchange = (e) => { document.getElementById('sf-kk-taksit-wrap').style.display = e.target.value === 'vadeli' ? 'block' : 'none'; };
        document.getElementById('sf-ekle-kk').onclick = () => {
          const tarih = document.getElementById('sf-kk-tarih').value;
          const tutar = parseFloat(document.getElementById('sf-kk-tutar').value);
          if (!tarih || !tutar) { toast('Tarih ve tutar zorunlu', 'err'); return; }
          const taksitTipi = document.getElementById('sf-kk-tip').value;
          calismaKopyasi.odemeKalemleri.push({ id: uid('ODK'), tip: 'kredi_karti', tarih, tutar, taksitTipi, taksitSayisi: taksitTipi === 'vadeli' ? parseInt(document.getElementById('sf-kk-taksit-sayisi').value) || 2 : 1 });
          renderOdemeKalemList();
          renderOdemeTabContent();
        };
      } else {
        // nakit veya diger
        wrap.innerHTML = `
          <div class="frow">
            <div class="fgroup"><label class="flbl">Tarih</label><input class="finput" id="sf-nd-tarih" type="date"></div>
            <div class="fgroup"><label class="flbl">Tutar (₺)</label><input class="finput" id="sf-nd-tutar" type="number"></div>
          </div>
          <div class="fgroup"><label class="flbl">Açıklama${aktifSekme === 'diger' ? ' (yöntemi belirtin)' : ' (opsiyonel)'}</label><input class="finput" id="sf-nd-aciklama" placeholder="${aktifSekme === 'diger' ? 'örn. Havale/EFT' : ''}"></div>
          <button type="button" class="btn btn-sm" id="sf-ekle-nd">+ ${aktifSekme === 'nakit' ? 'Nakit Ödeme' : 'Diğer Ödeme'} Ekle</button>`;
        document.getElementById('sf-ekle-nd').onclick = () => {
          const tarih = document.getElementById('sf-nd-tarih').value;
          const tutar = parseFloat(document.getElementById('sf-nd-tutar').value);
          if (!tarih || !tutar) { toast('Tarih ve tutar zorunlu', 'err'); return; }
          calismaKopyasi.odemeKalemleri.push({ id: uid('ODK'), tip: aktifSekme, tarih, tutar, aciklama: document.getElementById('sf-nd-aciklama').value.trim() });
          renderOdemeKalemList();
          renderOdemeTabContent();
        };
      }
    }
    renderOdemeTabContent();

    document.querySelectorAll('#sf-odeme-tabs .tab').forEach(t => t.onclick = () => {
      aktifSekme = t.dataset.tip;
      document.querySelectorAll('#sf-odeme-tabs .tab').forEach(x => x.classList.toggle('active', x.dataset.tip === aktifSekme));
      renderOdemeTabContent();
    });

    document.getElementById('sf-cancel').onclick = closeModal;
    const reddetBtn = document.getElementById('sf-reddet');
    if (reddetBtn) reddetBtn.onclick = () => { closeModal(); opts.onReddet(); };

    document.getElementById('sf-onayla').onclick = async () => {
      calismaKopyasi.pesinatTutar = parseFloat(document.getElementById('sf-pesinat-tutar').value) || 0;
      calismaKopyasi.sozlesmeVar = document.getElementById('sf-sozlesme-var').checked;
      calismaKopyasi.not = document.getElementById('sf-not').value.trim();
      const odemePlani = { ...calismaKopyasi, onaylayanRiskDurumu: opts.risk || null, onayTarihi: new Date().toISOString().slice(0, 10) };
      closeModal();

      // ── SATINALMA MODU: Ödeme planında seçilmiş (musteriCekId taşıyan) çek
      // kalemleri varsa, bu noktada GERÇEKTEN "rezerve" durumuna alınır —
      // başka bir satınalma siparişinde bir daha seçilemez. Yönetim bu
      // siparişi ONAYLAYINCA rezervasyon gerçek ciroya döner (bkz.
      // satinalmaSiparisiOnaylaninceDepoGirisiOlustur), REDDEDİLİRSE veya
      // sipariş iptal olursa çek tekrar 'elde' durumuna döndürülmelidir
      // (bkz. opts.onReddet çağrıldığı yerler).
      if (opts.mod === 'satinalma') {
        const cekKalemleri = (odemePlani.odemeKalemleri || []).filter(k => k.tip === 'cek' && k.musteriCekId);
        if (cekKalemleri.length) {
          const musteriCekleri = await Store.musteriCekleri.all();
          cekKalemleri.forEach(k => {
            const cek = musteriCekleri.find(c => c.id === k.musteriCekId);
            if (cek && cek.durum === 'elde') { cek.durum = 'rezerve'; cek.rezerveSiparisId = siparis.id; cek.rezerveSiparisKod = siparis.kod; }
          });
          await Store.musteriCekleri.save(musteriCekleri);
        }
      }

      await opts.onOnayla(odemePlani);
    };
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // Fotoğrafı düşük kaliteye indirger: en uzun kenar 1080px'e ölçeklenir,
  // JPEG %70 kalite ile yeniden kodlanır. Kalite kusur formları için depolama
  // ve taşıma boyutunu küçük tutar. Dönen değer: data:image/jpeg;base64 URL.
  function fotografKucult(file, maxKenar = 1080, kalite = 0.7) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = reject;
      r.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > maxKenar || height > maxKenar) {
            if (width >= height) { height = Math.round(height * maxKenar / width); width = maxKenar; }
            else { width = Math.round(width * maxKenar / height); height = maxKenar; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', kalite));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  function confirmDialog(msg, onYes) {
    const body = `<div style="font-size:13px;color:var(--text2)">${escapeHtml(msg)}</div>`;
    const footer = `<button class="btn" id="cd-no">Vazgeç</button><button class="btn btn-red" id="cd-yes">Evet, Sil</button>`;
    openModal({ title: 'Onay Gerekiyor', body, footer });
    document.getElementById('cd-no').onclick = closeModal;
    document.getElementById('cd-yes').onclick = () => { closeModal(); onYes(); };
  }

  // ── KALİTE UYGUNSUZLUK / DÖF / İADE AKIŞI ───────────────────────────────
  // Her kalite reddinde bir UYGUNSUZLUK KAYDI (NCR) oluşur. İsteğe bağlı olarak
  // bir DÖF (düzeltici/önleyici faaliyet) açılır ve reddedilen kalem İADE
  // AMBARI'na aktarılır. Bu fonksiyonlar kalite panelinden çağrılır.
  async function kaliteUygunsuzlukOlustur(kaynak, veri) {
    const bugun = new Date().toISOString().slice(0, 10);
    const uygunsuzluklar = await Store.uygunsuzlukKayitlari.all();
    const ncrNo = 'NCR-' + (uygunsuzluklar.length + 1).toString().padStart(4, '0');
    const ncr = {
      id: uid('NCR'), no: ncrNo, kaynak,
      kaynakId: veri.kaynakId || null,
      kod: veri.kod || '', ad: veri.ad || '',
      miktar: veri.miktar || 0, birim: veri.birim || 'ADET',
      tip: veri.tip || null, refId: veri.refId || null,
      tedarikciId: veri.tedarikciId || null, tedarikciAdi: veri.tedarikciAdi || null,
      siparisId: veri.siparisId || null,
      aciklama: veri.aciklama || '',
      fotograflar: veri.fotograflar || [],
      sorumluBirim: veri.sorumluBirim || (kaynak === 'hammadde_girisi' ? 'satinalma' : 'uretim_planlama'),
      durum: 'acik', olusturmaTarihi: bugun, olusturan: currentRoleLabel(), dofId: null
    };
    uygunsuzluklar.push(ncr);
    await Store.uygunsuzlukKayitlari.save(uygunsuzluklar);
    if (veri.dofAc) {
      const dof = await dofOlustur(ncr);
      ncr.dofId = dof.id;
      await Store.uygunsuzlukKayitlari.upsert(ncr);
    }
    return ncr;
  }

  async function dofOlustur(ncr) {
    const bugun = new Date().toISOString().slice(0, 10);
    const dofler = await Store.dofKayitlari.all();
    const dofNo = 'DOF-' + (dofler.length + 1).toString().padStart(4, '0');
    const dof = {
      id: uid('DOF'), no: dofNo, ncrId: ncr.id, ncrNo: ncr.no,
      konu: (ncr.ad || ncr.kod) + ' — kalite uygunsuzluğu', kaynak: ncr.kaynak,
      kokNeden: '', duzelticiFaaliyet: '', onleyiciFaaliyet: '',
      sorumluBirim: ncr.sorumluBirim, termin: '', durum: 'acik',
      olusturmaTarihi: bugun, olusturan: currentRoleLabel()
    };
    dofler.push(dof);
    await Store.dofKayitlari.save(dofler);
    return dof;
  }

  async function iadeAmbarinaAktar(ncr, kaynakVeri) {
    const bugun = new Date().toISOString().slice(0, 10);
    const iadeler = await Store.iadeKalemleri.all();
    const iade = {
      id: uid('IADE'), ncrId: ncr.id, ncrNo: ncr.no, kaynak: ncr.kaynak,
      kod: ncr.kod, ad: ncr.ad, miktar: ncr.miktar, birim: ncr.birim,
      tip: ncr.tip, refId: ncr.refId, aciklama: ncr.aciklama,
      fotograflar: ncr.fotograflar || [],
      fiyatlandirildi: false, kalite: null, satisFiyati: null, dvz: 'TL',
      satisaSunuldu: false, durum: 'fiyat_bekliyor', olusturmaTarihi: bugun,
      kaynakTedarikciId: kaynakVeri && kaynakVeri.tedarikciId || null,
      kaynakTedarikciAdi: kaynakVeri && kaynakVeri.tedarikciAdi || null,
      kaynakSiparisId: kaynakVeri && kaynakVeri.siparisId || null
    };
    const stokRaf = await Store.stokRaf.all();
    stokMiktarGuncelle(stokRaf, 'iade_ambari', ncr.tip || 'urun', ncr.refId || ncr.id, ncr.kod, ncr.ad, ncr.birim, ncr.miktar);
    await Store.stokRaf.save(stokRaf);
    iadeler.push(iade);
    await Store.iadeKalemleri.save(iadeler);
    return iade;
  }

  // ── GEREKÇELİ RED (birime geri gönderme) ────────────────────────────────
  // Reddedilen sipariş / satınalma talebi / kalite kaydı SİLİNMEZ; gerekçesiyle
  // birlikte "birime geri döndü" durumuna alınır. Talebi açan birim düzeltip
  // yeniden gönderebilir. onOnay(gerekce) çağrısı gerekçe metnini alır.
  //   baslik: modal başlığı, ornek "Satınalma Siparişini Reddet"
  //   uyari : açıklama metni (kimin göreceği vb.)
  function redGerekceDialog(baslik, uyari, onOnay) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="font-size:12.5px;color:var(--text2);margin-bottom:12px">${escapeHtml(uyari || '')}</div>
      <div class="fgroup"><label class="flbl">Red / İade Gerekçesi <span style="color:var(--red-text)">*</span></label>
        <textarea class="ftextarea" id="rg-gerekce" rows="3" placeholder="Örn: Fiyat bütçe üstü, tedarikçi değiştirilmeli / Ölçü hatalı, revize edilmeli"></textarea>
      </div>
      <div id="rg-hata" style="color:var(--red-text);font-size:12px;display:none">Gerekçe girmelisiniz.</div>
    `;
    const footer = `<button class="btn" id="rg-cancel">Vazgeç</button><button class="btn btn-red" id="rg-confirm">Reddet & Birime Gönder</button>`;
    openModal({ title: baslik || 'Reddet', body, footer });
    document.getElementById('rg-cancel').onclick = closeModal;
    document.getElementById('rg-confirm').onclick = () => {
      const g = document.getElementById('rg-gerekce').value.trim();
      if (!g) { document.getElementById('rg-hata').style.display = 'block'; return; }
      closeModal();
      onOnay(g);
    };
  }

  // ── BİLDİRİM MERKEZİ ────────────────────────────────────────────────────
  // AI denetçisinin bulguları + sistem uyarıları tek yerde toplanır. Üst
  // bardaki zil ikonunda okunmamış sayısı gösterilir. Önceden uyarılar
  // sayfalara dağılmıştı; kullanıcı ilgili sayfayı açmazsa göremiyordu.
  async function bildirimleriTazele() {
    try {
      if (typeof AiDenetci === 'undefined') return;
      const { bulgular } = await AiDenetci.tara();
      const mevcut = await Store.bildirimler.all();
      const bugun = new Date().toISOString().slice(0, 10);
      let yeni = 0;
      bulgular.filter(b => b.seviye === 'kritik' || b.seviye === 'uyari').forEach(b => {
        // Aynı gün aynı başlıkla mükerrer bildirim açma
        const anahtar = b.birim + '|' + b.baslik;
        if (mevcut.some(x => x.anahtar === anahtar && x.tarih === bugun)) return;
        mevcut.push({
          id: uid('BLD'), anahtar, birim: b.birim, seviye: b.seviye,
          baslik: b.baslik, aciklama: b.aciklama, aksiyonTip: b.aksiyonTip,
          tarih: bugun, zaman: new Date().toISOString(), okundu: false
        });
        yeni++;
      });
      if (yeni) await Store.bildirimler.save(mevcut);
      bildirimRozetiGuncelle(mevcut.filter(x => !x.okundu).length);
    } catch (e) { /* bildirim hatası uygulamayı etkilemez */ }
  }

  function bildirimRozetiGuncelle(sayi) {
    const el = document.getElementById('bildirim-rozet');
    if (!el) return;
    if (sayi > 0) { el.textContent = sayi > 99 ? '99+' : sayi; el.style.display = ''; }
    else el.style.display = 'none';
  }

  async function openBildirimMerkezi() {
    let bildirimler = await Store.bildirimler.all();
    // Ekran açılışında taze tarama. Mobilde bu tarama uzun sürebildiği için
    // kullanıcıya haber verilir — "donma" sanılmasın.
    try {
      if (window.innerWidth <= 768) toast('Bildirimler taranıyor, birkaç saniye sürebilir…', 'ok');
    } catch (e) { }
    await bildirimleriTazele();
    bildirimler = (await Store.bildirimler.all()).sort((a, b) => (b.zaman || '').localeCompare(a.zaman || ''));
    const okunmamis = bildirimler.filter(x => !x.okundu);
    const BIRIM = (typeof AiDenetci !== 'undefined' && AiDenetci.BIRIM_ETIKET) || {};
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div class="fhint" style="margin:0">Tüm birimlerdeki kritik durumlar ve uyarılar. Kaynak: AI Denetçisi taraması.</div>
        ${okunmamis.length ? '<button class="btn btn-sm" id="bl-hepsi-okundu">Tümünü Okundu İşaretle</button>' : ''}
      </div>
      ${bildirimler.length ? `<div style="max-height:440px;overflow:auto">
        ${bildirimler.slice(0, 80).map(b => `
          <div style="border:1px solid var(--border);border-left:3px solid var(--${b.seviye === 'kritik' ? 'red' : 'amber'});border-radius:8px;padding:10px 12px;margin-bottom:8px;${b.okundu ? 'opacity:.55' : 'background:var(--surface2)'}">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <span class="pill ${b.seviye === 'kritik' ? 'pill-red' : 'pill-amber'}" style="font-size:9px">${b.seviye === 'kritik' ? 'KRİTİK' : 'UYARI'}</span>
                <span class="muted" style="font-size:10px;margin-left:6px">${escapeHtml(BIRIM[b.birim] || b.birim)}</span>
                <div style="font-size:12px;font-weight:700;margin-top:4px">${escapeHtml(b.baslik)}</div>
                <div class="muted" style="font-size:10.5px;margin-top:3px">${escapeHtml(b.aciklama || '')}</div>
                <div class="muted" style="font-size:9.5px;margin-top:4px">${(b.zaman || '').replace('T', ' ').slice(0, 16)}</div>
              </div>
              ${!b.okundu ? `<button class="btn btn-sm btn-ghost bl-okundu" data-id="${b.id}" style="align-self:flex-start">✓</button>` : ''}
            </div>
          </div>`).join('')}
      </div>`
      : `<div class="empty-state" style="padding:30px"><div class="eicon">✓</div>
          <div class="etitle">Bildirim yok</div>
          <div class="edesc">Şu an müdahale gerektiren kritik durum bulunmuyor.</div></div>`}`;
    openModal({ title: '🔔 Bildirim Merkezi', sub: okunmamis.length ? okunmamis.length + ' okunmamış bildirim' : 'Tümü okundu',
      body, footer: `<button class="btn btn-blue" id="bl-kpi">📊 KPI Paneline Git</button><button class="btn" id="bl-kapat">Kapat</button>`, wide: true });
    document.getElementById('bl-kapat').onclick = closeModal;
    document.getElementById('bl-kpi').onclick = () => { closeModal(); goTo('kpi_panel', { tab: 'ai' }); };
    body.querySelectorAll('.bl-okundu').forEach(b => b.onclick = async () => {
      const tumu = await Store.bildirimler.all();
      const k = tumu.find(x => x.id === b.dataset.id);
      if (k) { k.okundu = true; await Store.bildirimler.save(tumu); }
      closeModal();
      openBildirimMerkezi();
    });
    const hepsiBtn = document.getElementById('bl-hepsi-okundu');
    if (hepsiBtn) hepsiBtn.onclick = async () => {
      const tumu = await Store.bildirimler.all();
      tumu.forEach(x => x.okundu = true);
      await Store.bildirimler.save(tumu);
      bildirimRozetiGuncelle(0);
      closeModal();
      toast('Tüm bildirimler okundu işaretlendi', 'ok');
    };
  }

  // ── YEDEKLEME & GERİ YÜKLEME ────────────────────────────────────────────
  // TÜM veriyi tek JSON dosyasına indirir / geri yükler. Yerel sürümde veri
  // tarayıcının localStorage'ındadır — tarayıcı verisi temizlenirse HER ŞEY
  // kaybolur. Bu yüzden düzenli yedek almak hayati önemdedir.
  // Şifreler (kullaniciler) yedeğe DAHİL EDİLMEZ; güvenlik gereği ayrı tutulur.
  const YEDEK_HARIC = ['kullaniciler'];

  async function tumVeriyiTopla() {
    const anahtarlar = await Store.listKeys('');
    const veri = {};
    for (const k of anahtarlar) {
      if (YEDEK_HARIC.includes(k)) continue;
      if (k.startsWith('_migrated')) continue;
      try { veri[k] = await Store.get(k, null); } catch (e) { /* okunamayan anahtar atlanır */ }
    }
    return veri;
  }

  async function openYedeklemeModal() {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="fhint" style="margin-bottom:12px;border-left:3px solid var(--amber);padding-left:10px">
        <b>Neden yedek almalısınız?</b> ${Store.sunucuModu
          ? 'Sunucu sürümünde veriler sunucuda tutulur ve otomatik yedeklenir; yine de dışarıya kopya almak sunucu arızasına karşı korur.'
          : 'Bu sürümde veriler <b>tarayıcının hafızasında</b> tutulur. Tarayıcı verileri temizlenirse veya bilgisayar değişirse <b>tüm veriler kaybolur</b>. Düzenli yedek alın.'}
      </div>
      <div class="card" style="padding:14px;margin-bottom:12px">
        <div class="flbl" style="margin-bottom:6px">💾 Yedek Al</div>
        <div class="fhint" style="margin-bottom:10px">Tüm kayıtlar (ürünler, reçeteler, siparişler, stok, muhasebe, üretim) tek bir <b>.json</b> dosyasına indirilir. Şifreler güvenlik gereği yedeğe dahil edilmez.</div>
        <button class="btn btn-blue" id="yd-indir">💾 Yedek Dosyasını İndir</button>
        <div id="yd-durum" style="font-size:11.5px;margin-top:8px"></div>
      </div>
      <div class="card" style="padding:14px;border:1.5px solid var(--red);background:var(--red-bg)">
        <div class="flbl" style="margin-bottom:6px;color:var(--red-text)">⬆ Yedekten Geri Yükle</div>
        <div class="fhint" style="margin-bottom:10px"><b style="color:var(--red-text)">DİKKAT:</b> Geri yükleme mevcut TÜM verinin üzerine yazar ve geri alınamaz. Önce mevcut durumun yedeğini alın.</div>
        <input class="finput" id="yd-dosya" type="file" accept=".json,application/json" style="margin-bottom:10px">
        <div id="yd-onizleme" style="font-size:11.5px;margin-bottom:10px"></div>
        <button class="btn btn-red" id="yd-yukle" disabled>⬆ Yedeği Geri Yükle</button>
      </div>`;
    openModal({ title: '💾 Yedekleme & Geri Yükleme', sub: 'Verilerinizi dışa aktarın veya yedekten dönün', body,
      footer: `<button class="btn" id="yd-kapat">Kapat</button>`, wide: true });
    document.getElementById('yd-kapat').onclick = closeModal;

    // ── YEDEK AL
    document.getElementById('yd-indir').onclick = async () => {
      const durum = document.getElementById('yd-durum');
      durum.innerHTML = '<span class="muted">Veriler toplanıyor…</span>';
      try {
        const veri = await tumVeriyiTopla();
        const paket = {
          _uretimos_yedek: true, surum: 1,
          olusturmaZamani: new Date().toISOString(),
          kayitSayilari: Object.fromEntries(Object.entries(veri).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])),
          veri
        };
        const metin = JSON.stringify(paket);
        const blob = new Blob([metin], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        a.href = url; a.download = 'UretimOS-Yedek-' + ts + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        const toplamKayit = Object.values(paket.kayitSayilari).reduce((a, b) => a + b, 0);
        durum.innerHTML = `<span style="color:var(--green-text)">✓ Yedek indirildi — ${Object.keys(veri).length} tablo, ${toplamKayit} kayıt (${(metin.length / 1024).toFixed(0)} KB)</span>`;
        toast('Yedek dosyası indirildi', 'ok');
      } catch (e) {
        durum.innerHTML = '<span style="color:var(--red-text)">Yedek alınamadı: ' + escapeHtml(e.message) + '</span>';
      }
    };

    // ── GERİ YÜKLE
    let yedekVerisi = null;
    document.getElementById('yd-dosya').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      const onz = document.getElementById('yd-onizleme');
      const btn = document.getElementById('yd-yukle');
      if (!f) { onz.textContent = ''; btn.disabled = true; return; }
      const r = new FileReader();
      r.onload = () => {
        try {
          const p = JSON.parse(r.result);
          if (!p._uretimos_yedek || !p.veri) throw new Error('Bu dosya bir ÜretimOS yedeği değil');
          yedekVerisi = p;
          const toplam = Object.values(p.kayitSayilari || {}).reduce((a, b) => a + b, 0);
          onz.innerHTML = `<span style="color:var(--green-text)">✓ Geçerli yedek — ${(p.olusturmaZamani || '').replace('T', ' ').slice(0, 16)} · ${Object.keys(p.veri).length} tablo, ${toplam} kayıt</span>`;
          btn.disabled = false;
        } catch (err) {
          yedekVerisi = null;
          onz.innerHTML = '<span style="color:var(--red-text)">✗ ' + escapeHtml(err.message) + '</span>';
          btn.disabled = true;
        }
      };
      r.readAsText(f);
    };
    document.getElementById('yd-yukle').onclick = () => {
      if (!yedekVerisi) return;
      const toplam = Object.values(yedekVerisi.kayitSayilari || {}).reduce((a, b) => a + b, 0);
      confirmDialog(
        `<b style="color:var(--red-text)">Bu işlem geri alınamaz.</b><br><br>` +
        `${(yedekVerisi.olusturmaZamani || '').replace('T', ' ').slice(0, 16)} tarihli yedek geri yüklenecek:<br>` +
        `<b>${Object.keys(yedekVerisi.veri).length}</b> tablo, <b>${toplam}</b> kayıt.<br><br>` +
        `Mevcut tüm verilerin ÜZERİNE YAZILACAK. Devam edilsin mi?`,
        async () => {
          try {
            for (const [k, v] of Object.entries(yedekVerisi.veri)) {
              if (YEDEK_HARIC.includes(k)) continue;
              await Store.set(k, v);
            }
            toast('✓ Yedek geri yüklendi — sayfa yenileniyor', 'ok');
            closeModal();
            setTimeout(() => window.location.reload(), 900);
          } catch (e) {
            toast('Geri yükleme başarısız: ' + e.message, 'err');
          }
        });
    };
  }

  return {
    init, goTo, openSettings, openBildirimMerkezi, bildirimleriTazele, toast, openModal, closeModal, persist, yeniZIndexAl, toggleMobileMenu, toggleDil,
    aramaAc, aramaKapat, aramaFiltrele, aramaTusVur,
    escapeHtml, fmt, fmtTL, fmtPct, uid, toTRY, fileToDataUrl, fotografKucult, confirmDialog, redGerekceDialog,
    kaliteUygunsuzlukOlustur, dofOlustur, iadeAmbarinaAktar,
    switchRole, currentRoleLabel, ymBirimMaliyetHesapla, urunMaliyetHesapla,
    aktifRol: () => state.role,   // Kayıp-Kaçak/Reçete-Talep modülleri için aktif kullanıcı (rol) kimliği
    siparisOnaylaninceKesimIhtiyaciOlustur, hammaddeIhtiyaciOnaylaSatinalmayaGonder, fazlaMalzemeyiStogaEkle,
    satinalmaCiktiExcel, satinalmaCiktiPdf, satinalmaCiktiYazdir,
    bordroHesapla, kidemIhbarHesapla,
    get AMBARLAR() { return AMBARLAR; },
    stokMiktarAmbar, stokMiktarGuncelle, stokTransferEt, stokKaydiId,
    satinalmaSiparisiOnaylaninceDepoGirisiOlustur, depoGirisiOnaylaStokEkle,
    tedarikciOdemeRezervasyonunuKesinlestir, tedarikciOdemeRezervasyonunuIptalEt,
    tahsilatOdemePlaniOnayaGonder, tahsilatOnayBekleyenOnayla, tahsilatOnayBekleyenReddet,
    uretimBaslarkenHammaddeCek, uretimTamamlaninceUrunGirisiYap, sevkiyatYapilinceStoktanDus,
    muhasebeKaydiOlustur, tahsilatBeklenenOnayla, siparisOnaylaninceOdemePlaniniAnindaIsle, siparisReddindeTeklifSorusu, kesimPlaniKaydedildiginceStokDus, kalemleriKdvGrupla, ekGiderTutar, ekGiderToplami, EK_GIDER_KATALOG, akordeonHtml, akordeonBagla, kartNeredeKullaniliyor,
    ikinciKaliteKalemleriSatildiIsaretle, ikinciKaliteSevkBilgisiIsle, sayfayaErisebilir,
    ikinciKaliteKullanilabilirAdet, ikinciKaliteRezervasyonSenkronize, ikinciKaliteRezervasyonKaldir, ikinciKaliteSatisGeriAl,
    qrSvg, qrIcerikUret, kodAyikla, barkodOkutModal, partiEtiketKodu, isKartiEtiketYazdir, fotografiOlcekle1080, hatSifresiDogru, receteAltYarimamulleri,
    siparisTakimlamaDurumu, isEmriIhtiyaciEkle, urunPaketOzeti, paketOzetMetni,
    olculerdenHacim, elleOlcuVarMi, olcuAgirlikCoz, olcuOzetMetni, olcuKaynakRozeti,
    cekiListesiUret, hammaddeBirimFiyatTRY,
    kartMaliyetHesapla, kenarBandiMaliyetHesapla, iskontoluFiyatVeKarlilikHesapla,
    kartAltKirilimSatirlariUret, receteAltKirilimExcelIndir,
    istasyonKisaltmasi, irsaliyeKesilinceFaturaOlustur, siparisIcerikVeOdemeFormuAc,
    get BOLUMLER() { return BOLUMLER; },
    get state() { return state; }
  };
})();

// Sayfa modülleri burada toplanır; her page_*.js dosyası kendi modülünü ekler.
const PageModules = {};
