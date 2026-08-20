// ════════════════════════════════════════════════════════════════════════════
// ÜretimOS — SİSTEM REHBERİ (AYRINTILI TANITIM)
//
// İnteraktif turdan ÖNCE gösterilir. Amaç: programın tamamını aşama aşama
// tanıtmak — hangi ekranda ne yapılır, hangi veri nereye akar, hangi rapor
// nerede çıkar, hareketler yönetim raporlarına nasıl yansır, yan kollar
// (kalite reddi, iade, bakım, İK, muhasebe…) ana akışa nerede bağlanır.
//
// Sol tarafta bölüm listesi, sağda içerik. Tamamen bilgilendirme amaçlıdır,
// gerçek veriye dokunmaz. Sonunda interaktif tura yönlendirir.
// ════════════════════════════════════════════════════════════════════════════
const Rehber = (() => {

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Yardımcı çizim fonksiyonları ────────────────────────────────────────────
  const tablo = (basliklar, satirlar) => `
    <table class="reh-tab">
      <tr>${basliklar.map(b => `<th>${b}</th>`).join('')}</tr>
      ${satirlar.map(s => `<tr>${s.map(h => `<td>${h}</td>`).join('')}</tr>`).join('')}
    </table>`;

  const akis = (adimlar) => `
    <div class="reh-akis">${adimlar.map(a => `<div class="reh-akis-k">${a}</div>`).join('<span class="reh-ok">→</span>')}</div>`;

  const kutu = (tip, baslik, icerik) =>
    `<div class="reh-kutu ${tip}"><h4>${baslik}</h4>${icerik}</div>`;

  // ══════════════════════════════════════════════════════════════════════════
  // BÖLÜMLER
  // ══════════════════════════════════════════════════════════════════════════
  const BOLUMLER = [

    // ── 1. HİYERARŞİK YAPI ────────────────────────────────────────────────
    {
      id: 'hiyerarsi', ikon: '🗂', ad: 'Hiyerarşik Yapı',
      icerik: () => `
        <p class="reh-giris">ÜretimOS 12 ana grup ve 44 modülden oluşur. Menüdeki sıra
        rastgele değildir: <b>yukarıdan aşağıya doğru bir üretim işletmesinin veri akışını</b>
        izler. Önce tanımlar yapılır, sonra satınalma, sonra üretim, en sonda muhasebe
        ve yönetim raporları gelir.</p>

        ${tablo(['Grup', 'Modüller', 'Ne İşe Yarar'], [
          ['<b>GENEL</b>', 'Panel', 'Tüm sistemin özeti, kritik uyarılar'],
          ['<b>TANIMLAR</b><br><small>ARGE / Teknik Ofis</small>',
           'Hammaddeler · Yarı Mamüller · Ürün Kartları & Reçete · Hat & Rota · QR Etiket Merkezi',
           '<b>Sistemin temelidir.</b> Buraya girilen veri diğer tüm modülleri besler'],
          ['<b>SATINALMA</b>', 'Satınalma Paneli · Açık Satınalma Siparişleri · Teklif Karşılaştırma',
           'Malzeme temini, 3 teklif karşılaştırma, tedarikçi yönetimi'],
          ['<b>ÜRETİM</b>', 'İş Emirleri · Kesim Optimizasyonu · Üretim Planlama · Üretim Ekranı · Hat & İstasyon Takibi · Üretim Çizelgesi · MRP',
           'Planlama, çizelgeleme ve sahadaki fiili üretim takibi'],
          ['<b>DEPO</b>', 'Depo Paneli · İade / 2. Kalite Ambarı · Yükleme Onayı',
           '3 ambar yapısı: Hammadde → Üretim → Sevkiyat'],
          ['<b>FİYATLAMA & SATIŞ</b>', 'Maliyet & Liste Fiyatı · Teklif Paneli · Siparişler',
           'Maliyetten fiyata, tekliften siparişe'],
          ['<b>CARİ & SEVKİYAT</b>', 'Cari Kartları · Sevkiyat & İrsaliye · e-Fatura',
           'Müşteri/tedarikçi, teslimat ve faturalama'],
          ['<b>BAKIM</b>', 'Makina & Teçhizat Bakım', 'Periyodik bakım, arıza, duruş, amortisman'],
          ['<b>KALİTE</b>', 'Kalite Kontrol · Uygunsuzluk & DÖF', 'Kontrol, NCR kaydı, kök neden, düzeltici faaliyet'],
          ['<b>İNSAN KAYNAKLARI</b>', 'Personel · İzin · Bordro · Tazminat · Araç & Zimmet · İSG',
           'Özlük, puantaj, maliyet ve yasal takip'],
          ['<b>YÖNETİM</b>', 'Üst Yönetim Kokpiti · KPI & AI Denetçisi · Analitik Raporlar · Yönetim Raporlama · Onay Bekleyenler',
           '<b>Hiçbir veri girilmez, hepsi okunur.</b> Tüm modüllerden beslenir'],
          ['<b>MUHASEBE</b>', 'Muhasebe & Finans · Çek & Senet Portföyü', 'Gelir-gider, KDV, tahsilat, nakit projeksiyonu']
        ])}

        ${kutu('reh-bilgi', '🔑 Altın Kural',
          `<p>Menüde <b>yukarıdaki modüller aşağıdakileri besler</b>. Tanımlar eksikse
          üretim çalışmaz; üretim kaydı yoksa yönetim raporu boş çıkar. Kurulum sırası
          bu yüzden önemlidir (son bölümde adım adım anlatılıyor).</p>`)}`
    },

    // ── 2. ANA AKIŞ ───────────────────────────────────────────────────────
    {
      id: 'anaakis', ikon: '🔄', ad: 'Ana Akış: Teklif → Sevkiyat',
      icerik: () => `
        <p class="reh-giris">Bir siparişin sistem içindeki tam yolculuğu. Her aşamada
        <b>hangi kayıt oluşur</b> ve <b>hangi modülü tetikler</b> aşağıda gösterilmiştir.</p>

        ${akis(['📝 Teklif', '📦 Sipariş', '📊 MRP', '🛒 Satınalma', '📥 Depo Girişi',
                '🏭 İş Emri', '📅 Çizelge', '⚙️ Üretim', '✅ Kalite', '🚚 Sevkiyat', '🧾 Fatura', '💰 Tahsilat'])}

        ${tablo(['#', 'Aşama / Ekran', 'Oluşan Kayıt', 'Tetiklediği Modül'], [
          ['1', '<b>Teklif Paneli</b>', 'Teklif kaydı (fiyat, iskonto, vade)', 'Maliyet & Liste Fiyatı’ndan fiyat çeker'],
          ['2', '<b>Siparişler</b><br><small>teklif → sipariş dönüşümü</small>', 'Sipariş + sipariş kalemleri',
           'Cari risk kontrolü · MRP · Üretim Planlama'],
          ['3', '<b>MRP</b>', 'Malzeme ihtiyaç listesi + sipariş tarihleri', 'Satınalma Paneli’ne talep düşürür'],
          ['4', '<b>Satınalma Paneli</b>', 'Satınalma talebi → 3 teklif → satınalma siparişi',
           'Onay Bekleyenler (yönetim onayı) · Açık Satınalma Siparişleri'],
          ['5', '<b>Depo Paneli</b>', 'Hammadde giriş kaydı (stok hareketi +)',
           'Stok güncellenir · Muhasebe’ye tedarikçi borcu'],
          ['6', '<b>İş Emirleri</b>', 'İş emri + reçeteden türeyen yarı mamül listesi',
           'Üretim Çizelgesi · Hat & İstasyon Takibi'],
          ['7', '<b>Üretim Çizelgesi</b>', 'Hat/gün bazlı iş planı (sonlu kapasite)', 'Gerçekçi termin tarihi hesaplar'],
          ['8', '<b>Hat & İstasyon Takibi</b><br><small>+ Operatör Terminali</small>',
           'İstasyon işleri: QR okutma, kalite, işlem, sevk + gerçekleşen süre',
           'Kalite Kontrol · Duruş kayıtları · KPI'],
          ['9', '<b>Kalite Kontrol</b>', 'Onay veya <b>red → NCR kaydı</b>',
           'Sevkiyat Deposu <b>veya</b> Uygunsuzluk & DÖF'],
          ['10', '<b>Sevkiyat & İrsaliye</b>', 'İrsaliye + yükleme onayı (fotoğraflı)', 'Stok çıkışı · e-Fatura'],
          ['11', '<b>e-Fatura</b>', 'Fatura + UBL-TR XML + GİB durumu', 'Muhasebe’ye alacak kaydı'],
          ['12', '<b>Muhasebe / Çek Portföyü</b>', 'Tahsilat, çek vadesi, nakit projeksiyonu',
           'Yönetim Kokpiti · Analitik Raporlar']
        ])}

        ${kutu('reh-uyari', '⚠ Zincirin Kritik Halkaları',
          `<ul>
            <li><b>Sipariş onaylanmadan</b> MRP ve üretim planı çalışmaz.</li>
            <li><b>Reçete yoksa</b> ne maliyet ne malzeme ihtiyacı hesaplanır.</li>
            <li><b>İrsaliye kesilmeden</b> fatura düzenlenmemelidir — stok/muhasebe tutarsız olur.</li>
            <li><b>Rota tanımlı değilse</b> iş çizelgeye düşmez, saha ekranında görünmez.</li>
          </ul>`)}`
    },

    // ── 3. VERİ AKIŞI ─────────────────────────────────────────────────────
    {
      id: 'veriakisi', ikon: '🔗', ad: 'Veri Akışı: Kim Yazar, Kim Okur',
      icerik: () => `
        <p class="reh-giris">ÜretimOS’ta <b>aynı bilgi iki kez girilmez.</b> Bir modülün
        yazdığı veriyi diğerleri okur. Aşağıdaki tablo hangi verinin nerede oluştuğunu
        ve nerelerde kullanıldığını gösterir.</p>

        ${tablo(['Veri', 'Nerede Oluşur (yazar)', 'Nerelerde Kullanılır (okur)'], [
          ['Hammadde fiyatı', 'Hammaddeler',
           'Yarı mamül maliyeti → Ürün maliyeti → Liste fiyatı → Teklif → Kârlılık raporu'],
          ['Reçete (BOM)', 'Ürün Kartları & Reçete',
           'Maliyet hesabı · MRP · İş emri kalemleri · Kesim optimizasyonu'],
          ['Rota + işlem süresi', 'Hat & Rota',
           'İşçilik maliyeti · Üretim çizelgesi · Hat doluluk · Kapasite planı'],
          ['Sipariş', 'Siparişler',
           'MRP · Üretim planlama · Sevkiyat programı · Ciro raporları · Cari bakiye'],
          ['Stok hareketi', 'Depo Paneli · Üretim · Sevkiyat',
           'Envanter · MRP · Kritik stok uyarıları · Ölü stok analizi'],
          ['İstasyon işlemi<br><small>(QR, kalite, sevk)</small>', 'Hat & İstasyon Takibi · Operatör Terminali',
           'Üretim ilerlemesi · Gerçekleşen süre · KPI · Plan-fiili karşılaştırma'],
          ['Kalite reddi', 'Kalite Kontrol · Operatör Terminali',
           'NCR & DÖF · Fire maliyeti · Kök neden raporu · Tedarikçi karnesi'],
          ['Duruş / arıza', 'Üretim Ekranı · Bakım',
           'OEE & hat doluluk · Bakım planı · Kayıp süre analizi'],
          ['Personel & puantaj', 'İK modülleri',
           'İşçilik maliyeti · Bordro · Personel gider raporu · Tazminat yükümlülüğü'],
          ['Fatura & tahsilat', 'e-Fatura · Muhasebe',
           'Gelir-gider · KDV · Alacak yaşlandırma · Nakit projeksiyonu · Kokpit']
        ])}

        ${kutu('reh-basari', '✓ Bunun Pratik Anlamı',
          `<p>Suntalam fiyatını <b>tek bir yerde</b> güncellersiniz; o hammaddeyi kullanan
          bütün yarı mamüller, ürünler, açık teklifler ve kârlılık raporları anında
          yeni fiyata göre hesaplanır. Excel’de 40 dosya güncelleme derdi biter.</p>`)}`
    },

    // ── 4. YAN KOLLAR ─────────────────────────────────────────────────────
    {
      id: 'yankollar', ikon: '🌿', ad: 'Yan Kollar ve Bağlantı Noktaları',
      icerik: () => `
        <p class="reh-giris">Ana akış düz bir çizgi değildir; her aşamada yan kollar
        devreye girer. Aşağıda her yan kolun <b>nereden çıktığı</b> ve <b>nereye
        döndüğü</b> gösterilmiştir.</p>

        ${[
          ['🔴 Kalite Reddi → NCR → DÖF', 'Üretim/Kalite aşamasında',
           'Kalite Kontrol veya operatör terminalinde red verilir → <b>Uygunsuzluk & DÖF</b> modülünde NCR kaydı açılır (gerekçe + fotoğraf) → kök neden analizi → düzeltici faaliyet → kapanış. Fire maliyeti ilgili siparişin kârlılığına işlenir.',
           'Kök Neden raporu · Fire maliyeti · Tedarikçi karnesi'],
          ['♻️ İade / 2. Kalite Ambarı', 'Kalite reddi veya müşteri iadesi sonrası',
           'Reddedilen ürün/malzeme iade ambarına alınır → düzeltilebilir mi, 2. kalite satılabilir mi, tedarikçiye iade mi karar verilir → fiyatlandırılıp <b>2. kalite satış listesine</b> düşer.',
           'Stok · Gelir kaydı · Tedarikçi iade kaydı'],
          ['🔧 Bakım & Duruş', 'Üretim sırasında makine arızası',
           'Operatör <b>duruş/arıza bildirir</b> → Bakım modülünde arıza kaydı açılır → teknisyen müdahalesi, kullanılan yedek parça ve süre kaydedilir → periyodik bakım planı güncellenir.',
           'Kayıp süre · OEE · Bakım maliyeti · Amortisman'],
          ['🛡 İSG (6331)', 'Sürekli — üretim ortamı',
           'Kaza/ramak kala kaydı, risk değerlendirme, KKD zimmeti, eğitim ve sağlık muayenesi takibi. Kayıp iş günü İK ve maliyet raporlarına yansır.',
           'Kayıp iş günü · Yasal kayıt · Eğitim takibi'],
          ['👥 İK & İşçilik', 'Üretim maliyetinin içinde',
           'Personel kartı → puantaj → bordro. Saatlik işçilik ücreti <b>rota maliyetine</b> girer; yani personel maliyeti doğrudan ürün maliyetini etkiler.',
           'İşçilik maliyeti · Bordro gideri · Tazminat yükümlülüğü'],
          ['🧰 Satış Sonrası Servis', 'Sevkiyattan sonra',
           'Müşteri şikayeti → garanti sorgusu → servis planı → saha müdahalesi → kalite geri beslemesi. Tekrarlayan şikayet kök neden raporuna düşer.',
           'Garanti maliyeti · Kalite geri beslemesi'],
          ['💵 Çek & Senet', 'Tahsilat aşamasında',
           'Müşteri çeki portföye girer → vade takibi → tahsilat, ciro veya karşılıksız işlemi. Kendi çeklerimiz ödeme tarafında izlenir.',
           'Nakit projeksiyonu · Vade takvimi · Risk analizi'],
          ['✂️ Kesim Optimizasyonu', 'İş emri sonrası, üretim öncesi',
           'Plaka bazlı kesim planı çıkarılır; fire minimize edilir, grain yönü korunur. Sonuç kesim hattına iş olarak düşer.',
           'Malzeme verimi · Fire oranı']
        ].map(([bas, nereden, akis2, rapor]) => `
          <div class="reh-kol">
            <div class="reh-kol-bas">${bas}</div>
            <div class="reh-kol-sat"><span>Nerede başlar</span><b>${nereden}</b></div>
            <div class="reh-kol-akis">${akis2}</div>
            <div class="reh-kol-sat"><span>Beslediği rapor</span><b>${rapor}</b></div>
          </div>`).join('')}`
    },

    // ── 5. RAPOR HARİTASI ─────────────────────────────────────────────────
    {
      id: 'raporlar', ikon: '📈', ad: 'Rapor Haritası: Hangi Rapor Nerede?',
      icerik: () => `
        <p class="reh-giris">Aradığınız rapor hangi ekranda? Aşağıdaki tablo, her raporun
        <b>yerini</b> ve <b>hangi hareketten beslendiğini</b> gösterir.</p>

        <div class="reh-alt-bas">ÜRETİM RAPORLARI</div>
        ${tablo(['Rapor', 'Nerede', 'Beslendiği Hareket'], [
          ['Hat doluluk / kapasite', 'Üretim Çizelgesi → Hat Doluluk', 'Rota süreleri + açık iş emirleri'],
          ['Plan vs Fiili maliyet', 'Analitik Raporlar', 'Reçete maliyeti ↔ gerçekleşen süre kayıtları'],
          ['Duruş / kayıp süre', 'Üretim Ekranı → Duruş Kayıtları', 'Operatörün bildirdiği duruşlar'],
          ['Üretim ilerlemesi (canlı)', 'Hat & İstasyon Takibi', 'İstasyon işlemleri (QR/kalite/sevk)'],
          ['Malzeme verimi / fire', 'Analitik Raporlar → Malzeme Verimi', 'Kesim planı + fire kayıtları'],
          ['Lot / parti izlenebilirlik', 'Üretim Yönetim Paneli', 'Parti no ile üretim kayıtları']
        ])}

        <div class="reh-alt-bas">SATIŞ & MALİYET RAPORLARI</div>
        ${tablo(['Rapor', 'Nerede', 'Beslendiği Hareket'], [
          ['Sipariş bazlı kârlılık', 'Analitik Raporlar → Kârlılık', 'Sipariş tutarı − (reçete maliyeti + fire + mesai)'],
          ['Müşteri kârlılığı', 'Analitik Raporlar', 'Müşterinin tüm siparişlerinin toplamı'],
          ['Ürün kârlılığı & ABC', 'Analitik Raporlar', 'Ürün bazlı satış adedi × marj'],
          ['Ciro & hedef karşılaştırma', 'Üst Yönetim Kokpiti', 'Onaylı siparişler + faturalar'],
          ['Satış hunisi', 'Yönetim Raporlama', 'Teklif → sipariş dönüşüm oranı'],
          ['Maliyet & liste fiyatı', 'Maliyet & Liste Fiyatı', 'Reçete + rota + genel gider oranı']
        ])}

        <div class="reh-alt-bas">STOK & SATINALMA RAPORLARI</div>
        ${tablo(['Rapor', 'Nerede', 'Beslendiği Hareket'], [
          ['Envanter (3 ambar)', 'Depo Paneli → Tüm Stoklar', 'Tüm giriş/çıkış hareketleri'],
          ['Kritik / yetersiz stok', 'Depo Paneli → Kritik Stok', 'Mevcut stok ↔ emniyet stoğu'],
          ['Stok & ölü stok analizi', 'Analitik Raporlar', 'Hareket görmeyen kalemler'],
          ['Açık satınalma siparişleri', 'Açık Satınalma Siparişleri', 'Onaylı, henüz teslim alınmamış siparişler'],
          ['Tedarikçi karnesi', 'Yönetim Raporlama', 'Termin sapması + kalite redleri'],
          ['Malzeme ihtiyaç planı', 'MRP', 'Sipariş × reçete − stok − yoldakiler']
        ])}

        <div class="reh-alt-bas">FİNANS & İK RAPORLARI</div>
        ${tablo(['Rapor', 'Nerede', 'Beslendiği Hareket'], [
          ['Gelir-gider özeti', 'Muhasebe & Finans', 'Faturalar + gider kayıtları'],
          ['Alacak yaşlandırma', 'Muhasebe → Yaşlandırma', 'Fatura vadesi ↔ tahsilat tarihi'],
          ['Nakit projeksiyonu', 'Çek & Senet Portföyü', 'Çek vadeleri + kredi taksitleri'],
          ['KDV hesabı', 'Muhasebe → KDV', 'Alış/satış faturaları'],
          ['Bordro & personel gideri', 'Bordro & Ücret', 'Puantaj + maaş tanımları'],
          ['Kıdem/ihbar yükümlülüğü', 'Kıdem & İhbar Tazminatı', 'İşe giriş tarihi + brüt maaş'],
          ['Amortisman özeti', 'Makina & Teçhizat Bakım', 'Alış bedeli + kullanım ömrü']
        ])}`
    },

    // ── 6. YÖNETİM RAPORLARINA YANSIMA ────────────────────────────────────
    {
      id: 'yonetim', ikon: '🎯', ad: 'Hareketler Yönetim Raporlarına Nasıl Yansır',
      icerik: () => `
        <p class="reh-giris">Yönetim ekranlarına <b>hiçbir veri elle girilmez</b>. Sahadaki
        her hareket, ilgili göstergeye otomatik olarak akar. Aşağıda "şu yapılırsa şu
        gösterge değişir" ilişkisi gösterilmiştir.</p>

        ${tablo(['Sahada Ne Olur', 'Hangi Göstergeye Yansır', 'Nerede Görünür'], [
          ['Operatör "İşlem Tamamlandı" der', 'Üretim ilerleme % · gerçekleşen süre', 'Kokpit · KPI Paneli'],
          ['Kalite reddi verilir', 'Fire oranı ↑ · sipariş kârlılığı ↓ · NCR sayısı ↑', 'KPI · Analitik · Kalite Panosu'],
          ['Duruş bildirilir', 'Hat doluluk ↓ · kayıp süre ↑', 'Kokpit · Hat Doluluk'],
          ['Satınalma siparişi onaylanır', 'Açık sipariş tutarı ↑ · tedarikçi borcu ↑', 'Kokpit · Muhasebe'],
          ['Hammadde depoya girer', 'Stok değeri ↑ · kritik stok uyarısı kalkar', 'Depo · Kokpit'],
          ['İrsaliye kesilir', 'Sevk edilen adet ↑ · stok ↓ · teslimat performansı (OTIF)', 'Analitik · Kokpit'],
          ['Fatura düzenlenir', 'Ciro ↑ · KDV ↑ · alacak ↑', 'Muhasebe · Kokpit'],
          ['Tahsilat yapılır', 'Alacak ↓ · nakit ↑ · yaşlandırma iyileşir', 'Muhasebe · Çek Portföyü'],
          ['Çek karşılıksız çıkar', 'Risk uyarısı · nakit projeksiyonu bozulur', 'Çek Portföyü · Kokpit'],
          ['Personel izne çıkar', 'Kapasite ↓ · izin bakiyesi ↓', 'İzin Takibi · Çizelge'],
          ['İş kazası kaydı girilir', 'Kayıp iş günü ↑ · İSG göstergesi', 'İSG Panosu'],
          ['Makine bakımı yapılır', 'Bakım maliyeti ↑ · arıza sıklığı ↓', 'Bakım · KPI']
        ])}

        <div class="reh-alt-bas">ÜÇ YÖNETİM EKRANI ARASINDAKİ FARK</div>
        ${tablo(['Ekran', 'Kime Hitap Eder', 'Ne Gösterir'], [
          ['<b>Üst Yönetim Kokpiti</b>', 'Patron / genel müdür',
           'Tek ekranda özet: sipariş, stok, satınalma, personel, araç, makina, tazminat. "Bugün işletme nasıl?" sorusunun cevabı'],
          ['<b>KPI Paneli & AI Denetçisi</b>', 'Operasyon yöneticisi',
           'Anlık performans göstergeleri + yapay zekânın tüm birimleri tarayıp bulduğu tutarsızlıklar ve öneriler'],
          ['<b>Analitik Raporlar</b>', 'Analiz yapan yönetici / danışman',
           'Derin analiz: kârlılık, yaşlandırma, teslimat performansı (OTIF), kök neden, malzeme verimi'],
          ['<b>Yönetim Raporlama</b>', 'Raporlama / muhasebe',
           'Satış hunisi, tedarikçi karnesi, mali KPI, plan-fiili maliyet karşılaştırması'],
          ['<b>Onay Bekleyenler</b>', 'Onay yetkisi olan yönetici',
           'Bekleyen tüm onaylar tek listede: satınalma siparişi, teklif silme, tahsilat, operatör şifre talebi']
        ])}

        ${kutu('reh-basari', '✓ Öğrenme Döngüsü',
          `<p>Sipariş kapandığında <b>hedeflenen kâr</b> ile <b>gerçekleşen kâr</b>
          karşılaştırılır. Sapmanın kaynağı (fire, mesai, gecikme) rakamla görünür.
          Bu bilgi bir sonraki teklife girdi olur — teklifleriniz zamanla isabetli hale gelir.
          Sistemin en değerli çıktısı budur.</p>`)}`
    },

    // ── 7. ROLLER & YETKİLER ──────────────────────────────────────────────
    {
      id: 'roller', ikon: '🔐', ad: 'Roller, Yetkiler ve Onay Zinciri',
      icerik: () => `
        <p class="reh-giris">Her birim kendi kullanıcı adıyla girer ve yalnızca kendi
        ekranlarını görür. Yaptığı her işlem <b>adıyla</b> kaydedilir.</p>

        ${tablo(['Rol', 'Erişebildiği Ekranlar', 'Onay Yetkisi'], [
          ['<b>yonetim</b>', 'Tümü', 'Satınalma, teklif silme, tahsilat, operatör şifre talebi'],
          ['<b>arge</b> (Teknik Ofis)', 'Hammadde, yarı mamül, reçete, rota, kesim', '—'],
          ['<b>satinalma</b>', 'Satınalma paneli, teklif karşılaştırma, tedarikçi', 'Talep açar, onay yönetimde'],
          ['<b>uretim</b>', 'İş emri, planlama, çizelge, hat takibi', 'Üretim kaydı'],
          ['<b>depo</b>', 'Depo paneli, iade ambarı, yükleme onayı', 'Hammadde giriş onayı'],
          ['<b>kalite</b>', 'Kalite kontrol, uygunsuzluk & DÖF', 'Ürün kalite onayı / reddi'],
          ['<b>cari</b>', 'Cari kartları, sevkiyat, e-fatura', 'Sipariş onayı'],
          ['<b>muhasebe</b>', 'Muhasebe, çek portföyü', 'Tahsilat kaydı'],
          ['<b>ik</b>', 'Personel, izin, bordro, tazminat, İSG, araç', '—'],
          ['<b>Hat Operatörü</b><br><small>giriş ekranının altından</small>',
           '<b>Yalnızca</b> yetkilendirildiği hattın terminali', 'Kalite kontrol, işlem, sevk (isimli)']
        ])}

        <div class="reh-alt-bas">OPERATÖR YETKİLENDİRME AKIŞI</div>
        ${akis(['Operatör şifre talebi açar', 'Yönetim onayına düşer',
                'Hangi hatlara yetkili seçilir', 'Operatör yalnızca o hatlara girer'])}
        <p class="reh-not">Yönetim → <b>Hat & İstasyon Takibi → 👤 Operatör Yetkileri</b>
        ekranından talep onaylanır; sonradan ✎ Düzenle ile kişi bazlı hat yetkisi
        eklenip çıkarılabilir, hesap pasife alınabilir.</p>

        ${kutu('reh-uyari', '⚠ Dikkat',
          `<ul>
            <li>Ortak şifre kullanmayın — "kim yaptı" izi kaybolur, sorumluluk belirsizleşir.</li>
            <li>Varsayılan şifreleri (<b>[birim]1234</b>) kurulumdan sonra mutlaka değiştirin.</li>
            <li>Onay zincirini kısayolla atlamayın; denetim izleri buradan oluşur.</li>
          </ul>`)}`
    },

    // ── 8. KURULUM SIRASI ─────────────────────────────────────────────────
    {
      id: 'kurulum', ikon: '🚦', ad: 'Doğru Kurulum Sırası',
      icerik: () => `
        <p class="reh-giris">Sistemi ilk kez kuruyorsanız <b>bu sırayı izleyin</b>.
        Sıra atlanırsa sonraki adım eksik veriyle çalışır.</p>

        ${[
          ['1', 'Ayarlar & kullanıcılar', 'Firma bilgileri, KDV oranı, saatlik işçilik ücreti, genel gider oranı, kullanıcı şifreleri', 'Tüm maliyet hesapları bu ayarları kullanır'],
          ['2', 'Cari kartlar', 'Müşteri ve tedarikçiler; risk limiti ve ödeme vadesi dolu olsun', 'Sipariş ve satınalma bu kartlara bağlanır'],
          ['3', 'Hammaddeler', 'Plaka ve hırdavat; fiyat, fire oranı, tedarik süresi, emniyet stoğu, grain yönü', 'Maliyet ve MRP’nin temeli'],
          ['4', 'Hat & rota', 'Hangi hatlar, hangi istasyonlar, işlem süreleri', 'Çizelge ve işçilik maliyeti buna dayanır'],
          ['5', 'Yarı mamüller', 'Ölçüler (kaba/net), hammadde ataması, rota, teknik dosyalar', 'Ürün reçetesinin yapı taşları'],
          ['6', 'Ürün kartları & reçete', 'Ürün ağacı: yarı mamül + hırdavat + işçilik', 'Fiyatlama, MRP ve iş emri buradan doğar'],
          ['7', 'QR etiketler', 'Kartlardan toplu QR üretip yazdırın, teknik dosyaları yükleyin', 'Saha takibi ve kâğıtsız üretim'],
          ['8', 'Açılış stokları', 'Depo paneli üzerinden mevcut stokları girin', 'MRP’nin doğru çalışması için şart'],
          ['9', 'Personel & vardiya', 'Özlük, puantaj, vardiya tanımları', 'Kapasite ve işçilik maliyeti'],
          ['10', 'İlk siparişi açın', 'Küçük bir siparişle tüm zinciri baştan sona deneyin', 'Eksik tanımları burada görürsünüz']
        ].map(([n, bas, ne, neden]) => `
          <div class="reh-adim">
            <div class="reh-adim-no">${n}</div>
            <div><b>${bas}</b><div class="reh-adim-ne">${ne}</div>
            <div class="reh-adim-neden">↳ ${neden}</div></div>
          </div>`).join('')}

        ${kutu('reh-bilgi', '💡 Tavsiye',
          `<p>Tüm ürün kataloğunu bir kerede girmeye çalışmayın. <b>Tek bir ürünü</b>
          uçtan uca (hammadde → reçete → sipariş → üretim → sevkiyat) çalıştırın.
          Sistem mantığını kavradıktan sonra toplu veri girişi çok daha hızlı ve
          hatasız olur. Excel’den içe aktarma seçenekleri de mevcuttur.</p>`)}`
    }
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // ARAYÜZ
  // ══════════════════════════════════════════════════════════════════════════
  let aktif = 0;

  function stilEkle() {
    if (document.getElementById('reh-stil')) return;
    const s = document.createElement('style');
    s.id = 'reh-stil';
    s.textContent = `
      .reh-katman{position:fixed;inset:0;z-index:99998;background:rgba(15,23,42,.74);
        backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:12px}
      .reh-pencere{background:var(--surface,#fff);border-radius:16px;max-width:1020px;width:100%;
        height:94vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35)}
      .reh-ust{background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:13px 18px;
        display:flex;justify-content:space-between;align-items:center;gap:10px;flex-shrink:0}
      .reh-ust h2{margin:0;font-size:15.5px;font-weight:800}
      .reh-ust .reh-alt-yazi{font-size:11px;opacity:.85;margin-top:2px}
      .reh-kapat{background:rgba(255,255,255,.18);border:0;color:#fff;width:30px;height:30px;
        border-radius:8px;cursor:pointer;font-size:15px}
      .reh-govde{display:flex;flex:1;min-height:0}
      .reh-nav{width:216px;flex-shrink:0;border-right:1px solid var(--border,#e2e8f0);
        overflow-y:auto;background:var(--surface2,#f8fafc);padding:8px}
      .reh-nav button{display:block;width:100%;text-align:left;border:0;background:transparent;
        padding:9px 10px;border-radius:9px;font-size:12px;cursor:pointer;margin-bottom:2px;
        color:var(--text,#1a2233);font-family:inherit;line-height:1.35}
      .reh-nav button:hover{background:var(--surface,#fff)}
      .reh-nav button.aktif{background:var(--blue,#3b82f6);color:#fff;font-weight:700}
      .reh-icerik{flex:1;overflow-y:auto;padding:16px 20px;font-size:12.5px;line-height:1.65;color:var(--text,#1a2233)}
      .reh-icerik h3{margin:0 0 10px;font-size:16px}
      .reh-giris{background:var(--blue-bg,#eff6ff);border-left:3px solid var(--blue,#3b82f6);
        border-radius:0 10px 10px 0;padding:10px 13px;margin:0 0 14px;font-size:12.5px}
      .reh-tab{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:14px;
        border:1px solid var(--border,#e2e8f0);border-radius:10px;overflow:hidden}
      .reh-tab th{background:var(--surface2,#f1f5f9);text-align:left;padding:7px 9px;font-size:10.5px;
        text-transform:uppercase;letter-spacing:.3px;color:var(--text3,#64748b)}
      .reh-tab td{padding:7px 9px;border-top:1px solid var(--border,#eef2f7);vertical-align:top}
      .reh-tab tr:nth-child(even) td{background:var(--surface2,#fafbfc)}
      .reh-akis{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:14px;justify-content:center}
      .reh-akis-k{background:var(--surface2,#f1f5f9);border:1px solid var(--border,#e2e8f0);
        border-radius:8px;padding:5px 9px;font-size:11px;font-weight:600}
      .reh-ok{color:var(--text3,#94a3b8);font-size:12px}
      .reh-alt-bas{font-size:10.5px;font-weight:800;letter-spacing:.6px;color:var(--text3,#64748b);
        margin:16px 0 7px;padding-bottom:4px;border-bottom:2px solid var(--border,#e2e8f0)}
      .reh-kutu{border-radius:11px;padding:11px 13px;margin:12px 0;font-size:12px}
      .reh-kutu h4{margin:0 0 6px;font-size:11.5px}
      .reh-kutu p{margin:0}.reh-kutu ul{margin:0;padding-left:17px}.reh-kutu li{margin-bottom:4px}
      .reh-bilgi{background:var(--blue-bg,#eff6ff);border:1px solid #bfdbfe;color:#1e3a8a}
      .reh-uyari{background:var(--amber-bg,#fffbeb);border:1px solid #fcd34d;color:#78350f}
      .reh-basari{background:var(--green-bg,#f0fdf4);border:1px solid #86efac;color:#14532d}
      .reh-kol{border:1px solid var(--border,#e2e8f0);border-radius:11px;padding:11px 13px;margin-bottom:10px}
      .reh-kol-bas{font-weight:800;font-size:12.5px;margin-bottom:6px}
      .reh-kol-sat{display:flex;gap:8px;font-size:11px;margin-bottom:3px}
      .reh-kol-sat span{color:var(--text3,#64748b);min-width:104px;flex-shrink:0}
      .reh-kol-akis{background:var(--surface2,#f8fafc);border-radius:8px;padding:8px 10px;
        font-size:11.5px;margin:6px 0;line-height:1.55}
      .reh-adim{display:flex;gap:11px;padding:9px 0;border-bottom:1px solid var(--border,#eef2f7)}
      .reh-adim-no{width:25px;height:25px;flex-shrink:0;border-radius:50%;background:var(--blue,#3b82f6);
        color:#fff;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800}
      .reh-adim-ne{font-size:11.5px;color:var(--text2,#475569);margin-top:2px}
      .reh-adim-neden{font-size:11px;color:var(--green-text,#15803d);margin-top:2px}
      .reh-not{font-size:11.5px;color:var(--text3,#64748b);margin:6px 0 12px}
      .reh-alt{border-top:1px solid var(--border,#e2e8f0);padding:10px 18px;display:flex;
        justify-content:space-between;align-items:center;gap:9px;background:var(--surface2,#f8fafc);flex-shrink:0;flex-wrap:wrap}
      .reh-sayac{font-size:11.5px;font-weight:700;color:var(--text3,#64748b)}
      .reh-btn{border:1px solid var(--border2,#cbd5e1);background:var(--surface,#fff);border-radius:9px;
        padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:inherit}
      .reh-btn:hover{background:var(--surface2,#f1f5f9)}
      .reh-btn:disabled{opacity:.4;cursor:not-allowed}
      .reh-btn.ana{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;border:0}
      .reh-nav-mob{display:none}
      @media(max-width:760px){
        .reh-pencere{height:97vh;border-radius:12px}
        .reh-govde{flex-direction:column}
        .reh-nav{display:none}
        .reh-nav-mob{display:block;padding:8px 12px;border-bottom:1px solid var(--border,#e2e8f0);background:var(--surface2,#f8fafc)}
        .reh-nav-mob select{width:100%;padding:8px;border-radius:8px;border:1px solid var(--border,#e2e8f0);
          font-size:12px;font-family:inherit;background:var(--surface,#fff);color:inherit}
        .reh-icerik{padding:13px}
        .reh-tab{font-size:10.5px}.reh-tab td,.reh-tab th{padding:5px 6px}
        .reh-kol-sat{flex-direction:column;gap:1px}.reh-kol-sat span{min-width:0}
      }`;
    document.head.appendChild(s);
  }

  function kapat() {
    const k = document.getElementById('reh-katman');
    if (k) k.remove();
  }

  function icerikCiz() {
    const b = BOLUMLER[aktif];
    const kat = document.getElementById('reh-katman');
    kat.querySelectorAll('.reh-nav button').forEach((x, i) =>
      x.classList.toggle('aktif', i === aktif));
    const sec = kat.querySelector('.reh-nav-mob select');
    if (sec) sec.value = String(aktif);
    const ic = kat.querySelector('.reh-icerik');
    ic.innerHTML = `<h3>${b.ikon} ${esc(b.ad)}</h3>` + b.icerik();
    ic.scrollTop = 0;

    const alt = kat.querySelector('.reh-alt');
    const son = aktif === BOLUMLER.length - 1;
    alt.innerHTML = `
      <div class="reh-sayac">Bölüm ${aktif + 1}/${BOLUMLER.length}</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button class="reh-btn" id="reh-onceki" ${aktif === 0 ? 'disabled' : ''}>← Önceki</button>
        ${son
          ? '<button class="reh-btn ana" id="reh-tura">🎮 İnteraktif Tura Geç →</button>'
          : '<button class="reh-btn ana" id="reh-sonraki">Sonraki Bölüm →</button>'}
      </div>`;
    const onc = alt.querySelector('#reh-onceki');
    if (onc) onc.onclick = () => { if (aktif > 0) { aktif--; icerikCiz(); } };
    const son2 = alt.querySelector('#reh-sonraki');
    if (son2) son2.onclick = () => { aktif++; icerikCiz(); };
    const tur = alt.querySelector('#reh-tura');
    if (tur) tur.onclick = () => {
      kapat();
      if (typeof Tutorial !== 'undefined') Tutorial.ac();
    };
  }

  function ac(bolumId) {
    stilEkle();
    kapat();
    aktif = 0;
    if (bolumId) {
      const i = BOLUMLER.findIndex(b => b.id === bolumId);
      if (i >= 0) aktif = i;
    }
    const kat = document.createElement('div');
    kat.className = 'reh-katman';
    kat.id = 'reh-katman';
    kat.innerHTML = `
      <div class="reh-pencere">
        <div class="reh-ust">
          <div><h2>📖 ÜretimOS Sistem Rehberi</h2>
            <div class="reh-alt-yazi">Aşama aşama işleyiş · veri akışı · rapor haritası · hiyerarşik yapı</div></div>
          <button class="reh-kapat" id="reh-x" title="Kapat">✕</button>
        </div>
        <div class="reh-nav-mob"><select id="reh-sec">
          ${BOLUMLER.map((b, i) => `<option value="${i}">${b.ikon} ${esc(b.ad)}</option>`).join('')}
        </select></div>
        <div class="reh-govde">
          <div class="reh-nav">
            ${BOLUMLER.map((b, i) => `<button data-i="${i}">${b.ikon} ${esc(b.ad)}</button>`).join('')}
          </div>
          <div class="reh-icerik"></div>
        </div>
        <div class="reh-alt"></div>
      </div>`;
    document.body.appendChild(kat);
    kat.onclick = (e) => { if (e.target === kat) kapat(); };
    kat.querySelector('#reh-x').onclick = kapat;
    kat.querySelectorAll('.reh-nav button').forEach(b =>
      b.onclick = () => { aktif = parseInt(b.dataset.i, 10); icerikCiz(); });
    kat.querySelector('#reh-sec').onchange = (e) => { aktif = parseInt(e.target.value, 10); icerikCiz(); };
    document.addEventListener('keydown', function kacis(e) {
      if (e.key === 'Escape') { kapat(); document.removeEventListener('keydown', kacis); }
    });
    icerikCiz();
  }

  return { ac, kapat };
})();
