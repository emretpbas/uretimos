// ════════════════════════════════════════════════════════════════════════════
// ÜretimOS — İNTERAKTİF TANITIM (OYUNLAŞTIRILMIŞ EĞİTİM)
//
// Giriş ekranından açılır. Ziyaretçi, sipariş alımından sevkiyata kadar tüm
// akışı 9 bölümlük bir "yolculuk" olarak deneyimler: her bölümde hikâye,
// simüle edilmiş ekran, yapılacak mini görev, DİKKAT uyarıları ve KAZANÇ
// (avantaj) kutusu vardır. İlerleme yüzdesi, puan ve rozetlerle oyun hissi
// verilir; ilerleme tarayıcıda saklanır, kaldığı yerden devam edilebilir.
//
// Uygulamanın gerçek verisine DOKUNMAZ — tamamen bağımsız bir simülasyondur.
// ════════════════════════════════════════════════════════════════════════════
const Tutorial = (() => {

  const ILERLEME_KEY = 'uretimos_tutorial_ilerleme';
  let durum = { bolum: 0, puan: 0, rozetler: [], gorevTamam: false };

  // ── İlerleme sakla/oku (tarayıcıda; sunucuya yazılmaz) ────────────────────
  function ilerlemeOku() {
    try {
      const ham = window.localStorage.getItem(ILERLEME_KEY);
      if (ham) return JSON.parse(ham);
    } catch (e) {}
    return { bolum: 0, puan: 0, rozetler: [] };
  }
  function ilerlemeYaz() {
    try {
      window.localStorage.setItem(ILERLEME_KEY, JSON.stringify({
        bolum: durum.bolum, puan: durum.puan, rozetler: durum.rozetler
      }));
    } catch (e) {}
  }
  function ilerlemeSil() {
    try { window.localStorage.removeItem(ILERLEME_KEY); } catch (e) {}
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ══════════════════════════════════════════════════════════════════════════
  // BÖLÜMLER — sipariş → sevkiyat yolculuğu
  // Her bölüm: rozet, başlık, rol, hikâye, ekran (simülasyon HTML'i),
  // görev (mini etkileşim), dikkat listesi, kazanç listesi.
  // ══════════════════════════════════════════════════════════════════════════
  const BOLUMLER = [
    // ── 0 ─────────────────────────────────────────────────────────────────
    {
      rozet: '🚀', baslik: 'Yolculuğa Hoş Geldiniz',
      rol: 'Genel Bakış', sure: '1 dk',
      hikaye: `Bir müşteriden <b>12 adet ofis masası</b> siparişi geldi. Bu siparişin
        teklif aşamasından fabrika kapısından çıkışına kadar geçeceği yolu birlikte
        yürüyeceğiz. Her durakta ne yapıldığını görecek, küçük bir görev
        tamamlayacak ve o adımın işletmenize ne kazandırdığını öğreneceksiniz.`,
      ekran: () => `
        <div class="tut-akis">
          ${['📝 Teklif', '📦 Sipariş', '🧬 Reçete', '📊 MRP', '🛒 Satınalma',
             '🏭 İş Emri', '⚙️ Üretim', '✅ Kalite', '🚚 Sevkiyat']
            .map((x, i) => `<div class="tut-akis-kutu"><span>${x}</span><small>${i + 1}</small></div>`).join('<div class="tut-ok">→</div>')}
        </div>
        <div class="tut-not">Bu dokuz durak, ÜretimOS'un bel kemiğidir. Her durakta
        girilen veri bir sonrakini <b>otomatik besler</b> — aynı bilgiyi iki kez
        yazmazsınız.</div>`,
      gorev: {
        soru: 'Sizce bu zincirde bir halka atlanırsa (örneğin reçete girilmezse) ne olur?',
        secenekler: [
          { m: 'Hiçbir şey, sistem kendi tahmin eder', d: false, geri: 'Sistem tahmin etmez — reçete yoksa malzeme ihtiyacı da maliyet de hesaplanamaz.' },
          { m: 'Maliyet ve malzeme ihtiyacı hesaplanamaz, zincir kopar', d: true, geri: 'Aynen öyle! ÜretimOS bir zincirdir: her halka bir sonrakini besler.' },
          { m: 'Sadece raporlar etkilenir', d: false, geri: 'Sadece raporlar değil; satınalma, üretim ve fiyatlama da durur.' }
        ]
      },
      dikkat: ['Kurulumda önce <b>hammadde</b>, sonra <b>yarı mamül</b>, sonra <b>ürün reçetesi</b> tanımlayın — sıra önemlidir.',
               'Her kullanıcıya kendi birim hesabını verin; kim ne yaptı iz sürülebilsin.'],
      kazanc: ['Tek veri girişi, dokuz farklı ekranda otomatik kullanım',
               'Siparişin hangi aşamada olduğu her an görünür']
    },

    // ── 1 ─────────────────────────────────────────────────────────────────
    {
      rozet: '📝', baslik: 'Teklif Hazırlama',
      rol: 'Satış / Fiyatlama', sure: '2 dk',
      hikaye: `Müşteri fiyat istedi. <b>Teklif Paneli</b>'nde katalog fiyat listenizden
        ürünleri seçer, iskonto uygular ve teklifi çıkarırsınız. Fiyat, reçeteden
        gelen gerçek maliyetin üzerine kâr marjı eklenerek hesaplanır — yani
        "tahmini" değil, <b>gerçek maliyete dayalı</b> bir fiyat verirsiniz.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">📝 Teklif Paneli</div>
          <table class="tut-tab">
            <tr><th>Ürün</th><th>Adet</th><th>Birim Fiyat</th><th>İskonto</th><th>Tutar</th></tr>
            <tr><td>Ofis Masası 120cm</td><td>12</td><td>4.850 ₺</td><td>%8</td><td>53.544 ₺</td></tr>
            <tr><td>Keson (3 çekmece)</td><td>12</td><td>1.240 ₺</td><td>%8</td><td>13.689 ₺</td></tr>
            <tr class="tut-tab-son"><td colspan="4">GENEL TOPLAM (KDV hariç)</td><td>67.233 ₺</td></tr>
          </table>
          <div class="tut-ipucu">💡 Maliyet 48.900 ₺ → <b>kâr marjı %27</b>. Sistem bu oranı
          anlık gösterir; zararına teklif verme riski ortadan kalkar.</div>
        </div>`,
      gorev: {
        soru: 'Müşteri "%20 iskonto isterim" diyor. Maliyet 48.900 ₺, liste toplamı 73.100 ₺. Ne yaparsınız?',
        secenekler: [
          { m: 'Kabul ederim, müşteri kaçmasın', d: false, geri: '%20 iskonto → 58.480 ₺. Kâr %16\'ya düşer. Kabul edilebilir ama <b>bilerek</b> karar vermelisiniz — sistem bunu size anında gösterir.' },
          { m: 'Önce sistemin gösterdiği kâr marjına bakar, sonra karar veririm', d: true, geri: 'Doğru yaklaşım! ÜretimOS iskonto girdikçe marjı canlı hesaplar. Kararı duyguyla değil rakamla verirsiniz.' },
          { m: 'Reddederim', d: false, geri: 'Acele etmeyin — %20 iskontoda bile kâr %16 kalıyor. Önemli olan bunu bilerek karar vermek.' }
        ]
      },
      dikkat: ['Teklifte <b>satır iskontosu %50</b>, <b>genel iskonto %10</b> ile sınırlıdır — yanlışlıkla zararına satışı önler.',
               'Vade farkı ayarını unutmayın: çek/kredi kartı ödemelerinde aylık oran otomatik eklenir.',
               'Teklif silme talebi yönetim onayına düşer; geçmiş kayıtlar kaybolmaz.'],
      kazanc: ['Zararına teklif verme riski biter — marj her an ekranda',
               'Katalog fiyat listesi tek yerden yönetilir, herkes aynı fiyatı verir',
               'Teklif → sipariş dönüşümü tek tıkla, yeniden yazmadan']
    },

    // ── 2 ─────────────────────────────────────────────────────────────────
    {
      rozet: '📦', baslik: 'Siparişe Dönüştürme',
      rol: 'Satış / Cari', sure: '2 dk',
      hikaye: `Müşteri teklifi onayladı. Teklif tek tuşla <b>siparişe</b> dönüşür.
        Sipariş açılırken sistem müşterinin <b>risk limitini</b> ve gecikmiş
        alacaklarını kontrol eder. Limit aşılıyorsa uyarır — tahsilat sorunu
        olan müşteriye üretim yapmadan önce durup düşünürsünüz.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">📦 Sipariş Kartı — SIP-2026-0418</div>
          <div class="tut-satir"><span>Müşteri</span><b>ABC Mobilya Ltd. Şti.</b></div>
          <div class="tut-satir"><span>Sipariş Tutarı</span><b>67.233 ₺</b></div>
          <div class="tut-satir"><span>Termin Tarihi</span><b>14 gün sonra</b></div>
          <div class="tut-satir"><span>Ödeme</span><b>60 gün vadeli çek</b></div>
          <div class="tut-uyari">⚠ Risk limiti: 100.000 ₺ · Mevcut bakiye: 78.400 ₺ ·
          Bu siparişle: <b>145.633 ₺ — LİMİT AŞILIYOR</b></div>
          <div class="tut-ipucu">💡 Sistem engellemiyor, <b>uyarıyor</b>. Yönetim
          onayıyla devam edebilir veya peşinat isteyebilirsiniz.</div>
        </div>`,
      gorev: {
        soru: 'Risk limiti aşan bu sipariş için en sağlıklı adım hangisi?',
        secenekler: [
          { m: 'Görmezden gelip üretime başlarım', d: false, geri: 'Riskli. 145 bin ₺\'lik açık bakiye, tahsil edilemezse doğrudan zarardır.' },
          { m: 'Peşinat/teminat isteyip yönetim onayıyla ilerlerim', d: true, geri: 'En sağlıklısı bu. Sistem kararı size bırakır ama veriyi önünüze koyar — kör uçuş yok.' },
          { m: 'Siparişi iptal ederim', d: false, geri: 'Şart değil; müşteriyi kaybetmeden peşinat veya teminat çözümü var.' }
        ]
      },
      dikkat: ['Cari kartında <b>risk limiti</b> ve <b>ödeme vadesi</b> mutlaka doldurulsun; boşsa uyarı çalışmaz.',
               'Sipariş onaylanmadan üretim planına düşmez — onay adımını atlamayın.',
               'Termin tarihini gerçekçi girin: MRP ve çizelgeleme bu tarihe göre hesap yapar.'],
      kazanc: ['Batık alacak riski sipariş anında görünür, sonradan değil',
               'Teklif → sipariş geçişinde bilgi kaybı ve yeniden yazma yok',
               'Müşterinin tüm geçmişi (sipariş, tahsilat, çek) tek kartta']
    },

    // ── 3 ─────────────────────────────────────────────────────────────────
    {
      rozet: '🧬', baslik: 'Reçete (BOM) — İşin Kalbi',
      rol: 'ARGE / Teknik Ofis', sure: '3 dk',
      hikaye: `Ofis masası neyden yapılıyor? <b>Reçete</b> bunu tanımlar: hangi
        hammadde, hangi yarı mamül, ne kadar. ÜretimOS'ta reçete <b>çok katmanlıdır</b> —
        masa bir "tabla" yarı mamülünden oluşur, tabla da suntalam plakadan kesilir.
        Bu ağaç sayesinde tek bir plaka fiyatı değiştiğinde nihai ürün maliyeti
        <b>otomatik</b> güncellenir.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">🧬 Reçete Ağacı — Ofis Masası 120cm</div>
          <div class="tut-agac">
            <div class="tut-dal l0">📦 Ofis Masası 120cm <span class="tut-tut">4.075 ₺</span></div>
            <div class="tut-dal l1">◫ Masa Tablası (1 ad) <span class="tut-tut">1.980 ₺</span></div>
            <div class="tut-dal l2">▭ Suntalam 30mm Beyaz — 1,2 m² <span class="tut-tut">1.640 ₺</span></div>
            <div class="tut-dal l2">▭ PVC Kenar Bandı — 4,8 m <span class="tut-tut">96 ₺</span></div>
            <div class="tut-dal l2">⚙ İşçilik: Kesim 8dk + Bantlama 6dk <span class="tut-tut">244 ₺</span></div>
            <div class="tut-dal l1">◫ Metal Ayak Takımı (1 tk) <span class="tut-tut">1.420 ₺</span></div>
            <div class="tut-dal l1">▭ Montaj Hırdavatı (1 set) <span class="tut-tut">185 ₺</span></div>
            <div class="tut-dal l1">⚙ Montaj + Paketleme: 22 dk <span class="tut-tut">490 ₺</span></div>
          </div>
          <div class="tut-ipucu">💡 Suntalam fiyatı %10 artarsa masa maliyeti anında
          4.075 → 4.239 ₺ olur. Excel'de 20 dosya güncellemenize gerek kalmaz.</div>
        </div>`,
      gorev: {
        soru: 'Tedarikçi suntalam fiyatını %10 artırdı. ÜretimOS\'ta kaç yerde güncelleme yaparsınız?',
        secenekler: [
          { m: 'Her ürün kartında tek tek — yaklaşık 40 yerde', d: false, geri: 'Hayır! Bu Excel yöntemi. ÜretimOS\'ta hammadde kartı tek kaynaktır.' },
          { m: 'Sadece 1 yerde: hammadde kartında', d: true, geri: 'Doğru! Hammadde kartındaki fiyatı güncellersiniz; o hammaddeyi kullanan TÜM yarı mamül ve ürünlerin maliyeti otomatik değişir.' },
          { m: 'Hiçbir yerde, fiyatlar sabittir', d: false, geri: 'Fiyatlar elbette güncellenir — ama tek noktadan.' }
        ]
      },
      dikkat: ['Yarı mamülde <b>kaba ölçü</b> ile <b>net ölçü</b> farkını doğru girin — fire hesabı buna dayanır.',
               'Plakalarda <b>grain (desen) yönü</b> önemlidir; yanlış yön kesim optimizasyonunu ve görünümü bozar.',
               'Reçeteyi kopyalayarak yeni ürün türetin (⧉ tuşu) — sıfırdan yazmak hem yavaş hem hatalıdır.',
               'Teknik dosyaları (DWG/STEP/PDF) karta yükleyin: sahadaki operatör QR ile telefondan açar.'],
      kazanc: ['Fiyat değişikliği tek noktadan, saniyeler içinde tüm ürünlere yansır',
               'Gerçek maliyet — "yaklaşık şu kadardır" tahmini biter',
               'Teknik resim ürünle birlikte yaşar, klasörlerde kaybolmaz']
    },

    // ── 4 ─────────────────────────────────────────────────────────────────
    {
      rozet: '📊', baslik: 'MRP — Malzeme İhtiyaç Planlaması',
      rol: 'Planlama', sure: '2 dk',
      hikaye: `12 masa için ne kadar plaka gerekiyor? Depoda ne var, ne eksik?
        <b>MRP</b> bu soruyu yanıtlar: sipariş adedini reçeteyle çarpar, mevcut
        stoğu ve yoldaki satınalma siparişlerini düşer, kalan ihtiyacı
        <b>ne zaman sipariş edilmesi gerektiğiyle birlikte</b> listeler.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">📊 MRP Sonucu — SIP-2026-0418 (12 adet)</div>
          <table class="tut-tab">
            <tr><th>Malzeme</th><th>İhtiyaç</th><th>Stok</th><th>Yolda</th><th>Eksik</th><th>Sipariş Tarihi</th></tr>
            <tr><td>Suntalam 30mm Beyaz</td><td>14,4 m²</td><td>22 m²</td><td>—</td><td class="tut-ok-y">✓ Yeterli</td><td>—</td></tr>
            <tr><td>Metal Ayak Takımı</td><td>12 tk</td><td>4 tk</td><td>—</td><td class="tut-kirmizi">8 tk</td><td class="tut-kirmizi">BUGÜN</td></tr>
            <tr><td>PVC Kenar Bandı</td><td>58 m</td><td>120 m</td><td>—</td><td class="tut-ok-y">✓ Yeterli</td><td>—</td></tr>
          </table>
          <div class="tut-ipucu">💡 Ayak takımının tedarik süresi 7 gün, termin 14 gün.
          Bugün sipariş edilmezse <b>üretim gecikir</b> — sistem bu tarihi geriye
          doğru hesaplar.</div>
        </div>`,
      gorev: {
        soru: 'MRP "8 adet ayak takımı eksik, BUGÜN sipariş et" diyor. Sipariş 3 gün ertelenirse?',
        secenekler: [
          { m: 'Sorun olmaz, 14 gün var', d: false, geri: 'Dikkat: tedarik 7 gün + üretim süresi + sevkiyat. 3 günlük gecikme terminde doğrudan gecikme demektir.' },
          { m: 'Termin riske girer — MRP tarihi tedarik süresine göre geriye hesaplanmıştır', d: true, geri: 'Kesinlikle. MRP\'nin verdiği tarih "acele etsin" değil, matematiksel son tarihtir.' },
          { m: 'Üretim daha hızlı yapılır, telafi edilir', d: false, geri: 'Hızlandırma genelde fazla mesai ve kalite riski demektir — maliyeti artırır.' }
        ]
      },
      dikkat: ['Hammadde kartındaki <b>tedarik süresi (gün)</b> doğru olsun; MRP tarihi buna göre hesaplanır.',
               '<b>Emniyet stoğu</b> tanımlayın: kritik malzemede tedarikçi gecikmesine karşı yastık olur.',
               'MRP\'yi sipariş onayından sonra <b>tekrar çalıştırın</b> — stok değiştikçe sonuç değişir.'],
      kazanc: ['"Malzeme bitti, hat durdu" krizleri ortadan kalkar',
               'Gereksiz stok bağlamazsınız — nakit depoda beklemez',
               'Ne zaman sipariş verileceği tahmin değil, hesap sonucudur']
    },

    // ── 5 ─────────────────────────────────────────────────────────────────
    {
      rozet: '🛒', baslik: 'Satınalma — 3 Teklif Kuralı',
      rol: 'Satınalma', sure: '2 dk',
      hikaye: `Eksik 8 ayak takımı için satınalma açılır. ÜretimOS <b>üç tedarikçiden
        teklif</b> almanızı ve karşılaştırmanızı sağlar; seçim gerekçesiyle birlikte
        kaydedilir ve yönetim onayına düşer. Bu, hem şeffaflık hem de denetim
        (ISO) gerekliliğidir.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">🛒 Teklif Karşılaştırma — Metal Ayak Takımı (8 adet)</div>
          <table class="tut-tab">
            <tr><th>Tedarikçi</th><th>Birim Fiyat</th><th>Termin</th><th>Ödeme</th><th>Puan</th></tr>
            <tr><td>Demir A.Ş.</td><td>1.420 ₺</td><td>7 gün</td><td>60 gün</td><td>★★★★☆</td></tr>
            <tr class="tut-secili"><td>Metal Ltd. <b>← SEÇİLDİ</b></td><td>1.385 ₺</td><td>5 gün</td><td>45 gün</td><td>★★★★★</td></tr>
            <tr><td>Çelik San.</td><td>1.310 ₺</td><td>15 gün</td><td>peşin</td><td>★★★☆☆</td></tr>
          </table>
          <div class="tut-ipucu">💡 En ucuz teklif seçilmedi! Çelik San. 75 ₺ daha ucuz
          ama <b>15 gün termin</b> siparişi geciktirir ve peşin ödeme nakit akışını bozar.
          Gerekçe kayda geçer.</div>
        </div>`,
      gorev: {
        soru: 'En ucuz teklifin seçilmemesi neden doğru bir karar olabilir?',
        secenekler: [
          { m: 'Ucuz mal her zaman kötüdür', d: false, geri: 'Bu kadar keskin değil. Mesele fiyatın tek başına yeterli olmaması.' },
          { m: 'Termin, ödeme vadesi ve tedarikçi performansı da maliyettir', d: true, geri: 'Tam isabet. 75 ₺ tasarruf için 8 gün gecikme ve peşin ödeme, toplamda çok daha pahalıya gelir.' },
          { m: 'Yönetim öyle istediği için', d: false, geri: 'Karar keyfi değil, ölçülebilir gerekçelere dayanmalı — sistem bunu kayıt altına alır.' }
        ]
      },
      dikkat: ['Seçim gerekçesini <b>mutlaka yazın</b>; denetimde ve sonraki alımlarda yol gösterir.',
               'Tedarikçi kartındaki <b>karne</b> puanını güncel tutun — geciken teslimatlar buraya işlensin.',
               'Satınalma siparişi tedarikçiye gönderilmeden önce yönetim onayından geçer; bu adımı kısayolla atlamayın.'],
      kazanc: ['Fiyat pazarlığında elinizde veri olur, hafıza değil',
               'ISO/denetim için gereken kayıt kendiliğinden oluşur',
               'Tedarikçi performansı zamanla ölçülebilir hale gelir']
    },

    // ── 6 ─────────────────────────────────────────────────────────────────
    {
      rozet: '🏭', baslik: 'İş Emri & Çizelgeleme',
      rol: 'Üretim Planlama', sure: '2 dk',
      hikaye: `Malzeme yolda, sıra üretimde. <b>İş emri</b> açtığınızda sistem
        reçeteden yarı mamül üretim listesini <b>otomatik</b> çıkarır: 12 tabla,
        12 ayak montajı, 12 paketleme. Çizelgeleme bunları hatların gerçek
        kapasitesine göre günlere dağıtır — <b>sonlu kapasite planlama</b>.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">🏭 İş Emri IE-2026-0912 — Çizelge (Gantt)</div>
          <div class="tut-gantt">
            <div class="tut-g-satir"><span class="tut-g-ad">Kesim Hattı</span>
              <div class="tut-g-bar" style="left:0;width:22%">Tabla kesim · 2 gün</div></div>
            <div class="tut-g-satir"><span class="tut-g-ad">Bantlama</span>
              <div class="tut-g-bar b2" style="left:22%;width:16%">Kenar · 1,5 gün</div></div>
            <div class="tut-g-satir"><span class="tut-g-ad">Metal İşleme</span>
              <div class="tut-g-bar b3" style="left:38%;width:20%">Ayak · 2 gün</div></div>
            <div class="tut-g-satir"><span class="tut-g-ad">Montaj</span>
              <div class="tut-g-bar b4" style="left:58%;width:24%">Montaj · 2,5 gün</div></div>
            <div class="tut-g-satir"><span class="tut-g-ad">Paketleme</span>
              <div class="tut-g-bar b5" style="left:82%;width:14%">Koli · 1 gün</div></div>
          </div>
          <div class="tut-ipucu">💡 Hesaplanan bitiş: <b>9 iş günü</b>. Termin 14 gün →
          5 gün pay var. Kapasite dolduğunda sistem yeni işi otomatik ileri atar,
          "olmayan kapasiteye" söz vermezsiniz.</div>
        </div>`,
      gorev: {
        soru: 'Aynı hafta acil başka bir sipariş geldi. Sonlu kapasite çizelgesi ne yapar?',
        secenekler: [
          { m: 'İki işi de aynı anda bitirmiş gibi gösterir', d: false, geri: 'Bu sonsuz kapasite varsayımıdır ve gerçekçi olmayan terminlere yol açar.' },
          { m: 'Kapasiteye göre sıraya dizer, gerçekçi yeni termin hesaplar', d: true, geri: 'Doğru! Böylece müşteriye tutabileceğiniz tarihi verirsiniz — güven buradan gelir.' },
          { m: 'Eski siparişi otomatik iptal eder', d: false, geri: 'Hiçbir iş kendiliğinden iptal olmaz; öncelik kararı sizindir.' }
        ]
      },
      dikkat: ['Rotalardaki <b>işlem sürelerini</b> gerçekçi girin; çizelgenin doğruluğu buna bağlıdır.',
               'Vardiya ve mola tanımlarını yapın — kapasite hesabı bunları kullanır.',
               'Acil işi araya sokarken çizelgeyi <b>yeniden çalıştırın</b>, diğer terminleri kontrol edin.'],
      kazanc: ['Müşteriye tutulabilir termin verirsiniz',
               'Hangi hattın darboğaz olduğu net görünür, yatırım kararı kolaylaşır',
               'İş emri kalemleri reçeteden otomatik doğar, elle liste yapılmaz']
    },

    // ── 7 ─────────────────────────────────────────────────────────────────
    {
      rozet: '⚙️', baslik: 'Üretim Sahası — QR ile İzleme',
      rol: 'Hat Operatörü', sure: '3 dk',
      hikaye: `Sahada operatör telefon veya tablet kullanır. Giriş ekranındaki
        <b>Hat Operatör Terminali</b>'nden kendi adı ve şifresiyle girer; yalnızca
        <b>yetkilendirildiği hatları</b> görür. Parçanın QR'ını okutur, kalite
        kontrolünü işaretler, işlemi tamamlar ve bir sonraki istasyona sevk eder.
        Her onaya <b>kimin yaptığı</b> yazılır.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">📱 Hat Operatör Terminali — KESİM HATTI</div>
          <div class="tut-is-kart">
            <div class="tut-is-ust"><b class="mono">IE-2026-0912</b>
              <span class="tut-pill">200.DX.AL.013 — Masa Tablası</span>
              <span class="tut-pill yesil">Barkod OK</span></div>
            <div class="tut-is-sayac">12/12 Gelen · 12/12 Kalite · 8/12 İşlem · 0/12 Sevk</div>
            <div class="tut-is-tuslar">
              <span class="tut-tus">🔲 QR Okut</span>
              <span class="tut-tus">📁 Dosyalar</span>
              <span class="tut-tus mavi">✓ Kalite Kontrol</span>
              <span class="tut-tus gri">⚙ İşlem Tamamlandı</span>
              <span class="tut-tus yesil">➜ Sonraki İstasyona Sevk</span>
              <span class="tut-tus kirmizi">✗ Kalite Reddi</span>
            </div>
          </div>
          <div class="tut-ipucu">💡 <b>📁 Dosyalar</b> tuşu: operatör teknik resmi
          (DWG/STEP/PDF) telefonda açar. Kâğıt çıktı aramaya, yanlış revizyonla
          üretmeye son.</div>
        </div>`,
      gorev: {
        soru: 'Operatör "Kalite Reddi" verdi. Sizce sistemde ne olur?',
        secenekler: [
          { m: 'Parça sessizce çöpe gider', d: false, geri: 'Hayır — reddedilen her parça iz bırakır, yoksa kök neden bulunamaz.' },
          { m: 'Uygunsuzluk (NCR) kaydı açılır, geri gönderilecek istasyon ve gerekçe kaydedilir', d: true, geri: 'Doğru! Red gerekçesi + fotoğraf kaydedilir, DÖF süreci başlar, fire maliyeti raporlara işler.' },
          { m: 'Sipariş iptal olur', d: false, geri: 'Sipariş iptal olmaz; parça düzeltilir veya yeniden üretilir.' }
        ]
      },
      dikkat: ['Operatör şifrelerini <b>kişi bazlı</b> verin; ortak şifre kullanılırsa "kim yaptı" izi kaybolur.',
               'Yetkilendirmede kişiye yalnızca çalıştığı hatları verin (Hat & İstasyon Takibi → 👤 Operatör Yetkileri).',
               'QR etiketlerini parçaya <b>okunabilir</b> şekilde yapıştırın; yıpranan etiketi yenileyin.',
               'Duruş/arıza olduğunda mutlaka bildirin — kayıp süre ölçülmezse iyileştirilemez.'],
      kazanc: ['Siparişin hangi istasyonda, kaç adet olduğu <b>canlı</b> görünür',
               'Her işlem isimli — sorumluluk ve performans ölçülebilir',
               'Teknik resim sahada telefonda, yanlış revizyon riski biter',
               'Gerçekleşen süreler kaydedilir; plan-fiili farkı ortaya çıkar']
    },

    // ── 8 ─────────────────────────────────────────────────────────────────
    {
      rozet: '✅', baslik: 'Kalite & Nihai Onay',
      rol: 'Kalite Kontrol', sure: '2 dk',
      hikaye: `Üretim bitti, ürünler kalite kontrolünden geçer. Onaylananlar
        <b>sevkiyat deposuna</b> alınır; reddedilenler için uygunsuzluk (NCR) kaydı
        açılır ve düzeltici faaliyet (DÖF) başlar. Kök neden analizi sayesinde aynı
        hata tekrar etmez.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">✅ Ürün Kalite Onayı</div>
          <div class="tut-satir"><span>Üretilen</span><b>12 adet</b></div>
          <div class="tut-satir"><span>Onaylanan</span><b class="tut-ok-y">11 adet → Sevkiyat Deposu</b></div>
          <div class="tut-satir"><span>Reddedilen</span><b class="tut-kirmizi">1 adet → NCR-2026-0067</b></div>
          <div class="tut-uyari">📋 NCR-2026-0067 · Kusur: kenar bandı kabarması ·
          Kök neden: bantlama sıcaklığı düşük · <b>DÖF:</b> makine ısı ayarı
          kontrol listesine eklendi</div>
          <div class="tut-ipucu">💡 Fire maliyeti (1 masa = 4.075 ₺) otomatik olarak
          ilgili siparişin kârlılığına işlenir — "neden bu iş az kâr etti?"
          sorusunun cevabı burada.</div>
        </div>`,
      gorev: {
        soru: 'Aynı kusur üç ay içinde 14 kez tekrarladı. Sistem bunu nasıl kullanır?',
        secenekler: [
          { m: 'Her seferinde ayrı kayıt açar, ilişki kurulmaz', d: false, geri: 'Kayıtlar ayrı ama analiz birleştirir — tekrarı görmek için kök neden raporu vardır.' },
          { m: 'Kök neden raporunda tekrar eden kusurları öne çıkarır, kalıcı çözüm için veri sağlar', d: true, geri: 'Doğru! 14 × 4.075 ₺ = 57.050 ₺ kayıp. Bu rakamı görünce makine bakımı "masraf" değil "yatırım" olur.' },
          { m: 'Otomatik olarak üretimi durdurur', d: false, geri: 'Sistem üretimi durdurmaz; kararı verecek veriyi size sunar.' }
        ]
      },
      dikkat: ['Red gerekçesini ve <b>fotoğrafı</b> mutlaka ekleyin — kök neden analizi buna dayanır.',
               'DÖF kapatılmadan benzer uygunsuzluk tekrarlıyorsa çözüm yeterli değildir, gözden geçirin.',
               '2. kalite ürünleri iade ambarına alıp fiyatlandırın; çöpe atmak yerine gelire dönüştürün.'],
      kazanc: ['Fire maliyeti görünür olur, "kaybolan para" ortaya çıkar',
               'Tekrar eden hatalar veriyle tespit edilir, kalıcı çözülür',
               'Müşteriye giden ürün kalitesi güvence altına alınır']
    },

    // ── 9 ─────────────────────────────────────────────────────────────────
    {
      rozet: '🚚', baslik: 'Sevkiyat, İrsaliye & Tahsilat',
      rol: 'Sevkiyat / Muhasebe', sure: '2 dk',
      hikaye: `Son durak. Sevkiyat deposundaki ürünler için <b>irsaliye</b> düzenlenir,
        yükleme sırasında sorumlu kişi <b>fotoğraflı onay</b> verir. İrsaliye
        faturaya, fatura e-Fatura/e-Arşiv gönderimine ve tahsilat takibine bağlanır.
        Sipariş kapanır ve <b>gerçek kârlılığı</b> hesaplanır.`,
      ekran: () => `
        <div class="tut-ekran">
          <div class="tut-ekran-bas">🚚 Sevkiyat — İRS-2026-0311</div>
          <div class="tut-satir"><span>Müşteri</span><b>ABC Mobilya Ltd. Şti.</b></div>
          <div class="tut-satir"><span>Sevk Edilen</span><b>11 adet masa + 12 keson</b></div>
          <div class="tut-satir"><span>Yükleme Onayı</span><b>✓ Mehmet K. · fotoğraflı</b></div>
          <div class="tut-satir"><span>e-Fatura</span><b class="tut-ok-y">✓ GİB'e gönderildi</b></div>
          <hr class="tut-hr">
          <div class="tut-kar">
            <div><small>SATIŞ</small><b>67.233 ₺</b></div>
            <div><small>MALİYET</small><b>48.900 ₺</b></div>
            <div><small>FİRE</small><b class="tut-kirmizi">4.075 ₺</b></div>
            <div><small>NET KÂR</small><b class="tut-ok-y">14.258 ₺ · %21</b></div>
          </div>
          <div class="tut-ipucu">💡 Teklifte %27 hedeflenmişti, gerçekleşen %21.
          Farkın sebebi fire ve fazla mesai — sistem bunu <b>rakamla</b> gösterir,
          bir sonraki teklifte daha isabetli fiyat verirsiniz.</div>
        </div>`,
      gorev: {
        soru: 'Hedeflenen kâr %27 iken gerçekleşen %21 oldu. Bu bilgi ne işe yarar?',
        secenekler: [
          { m: 'Hiçbir işe, iş bitti', d: false, geri: 'Aksine — en değerli bilgi burada. Ölçmediğinizi iyileştiremezsiniz.' },
          { m: 'Sapmanın kaynağı bulunur (fire/mesai) ve sonraki tekliflerde payı hesaba katılır', d: true, geri: 'Doğru! Plan-fiili farkı öğrenme döngüsünü başlatır; teklifleriniz zamanla isabetli hale gelir.' },
          { m: 'Müşteriden fark talep edilir', d: false, geri: 'Sözleşme fiyatı bağlayıcıdır; çözüm iç süreçleri iyileştirmektir.' }
        ]
      },
      dikkat: ['İrsaliye kesilmeden fatura düzenlemeyin; stok ve muhasebe kaydı tutarsız olur.',
               'Yükleme fotoğrafı, eksik/hasarlı teslimat iddialarında <b>kanıt</b>tır — atlamayın.',
               'Çekli tahsilatlarda vade takvimini izleyin; nakit projeksiyonu buna göre çalışır.',
               'Sipariş kapandıktan sonra kârlılık raporunu okuyun — asıl öğrenme orada.'],
      kazanc: ['Sipariş bazlı <b>gerçek</b> kârlılık — tahmin değil, ölçüm',
               'Teslimat kanıtı ve e-Fatura süreci tek akışta',
               'Nakit akışı öngörülebilir hale gelir',
               'Her tamamlanan sipariş, bir sonrakinin teklifini iyileştirir']
    }
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // ARAYÜZ
  // ══════════════════════════════════════════════════════════════════════════
  function stilEkle() {
    if (document.getElementById('tut-stil')) return;
    const s = document.createElement('style');
    s.id = 'tut-stil';
    s.textContent = `
      .tut-katman{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.72);
        backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto}
      .tut-pencere{background:var(--surface,#fff);border-radius:16px;max-width:860px;width:100%;
        max-height:94vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden}
      .tut-ust{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:14px 18px;flex-shrink:0}
      .tut-ust-sat{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .tut-ust h2{margin:0;font-size:16px;font-weight:800}
      .tut-ust .tut-rol{font-size:11px;opacity:.85;margin-top:2px}
      .tut-kapat{background:rgba(255,255,255,.18);border:0;color:#fff;width:30px;height:30px;
        border-radius:8px;cursor:pointer;font-size:15px;line-height:1}
      .tut-ilerle{height:7px;background:rgba(255,255,255,.22);border-radius:20px;margin-top:10px;overflow:hidden}
      .tut-ilerle i{display:block;height:100%;background:#4ade80;border-radius:20px;transition:width .45s ease}
      .tut-ust-alt{display:flex;justify-content:space-between;font-size:10.5px;margin-top:5px;opacity:.9}
      .tut-govde{padding:16px 18px;overflow-y:auto;flex:1;font-size:13px;line-height:1.6;color:var(--text,#1a2233)}
      .tut-hikaye{background:var(--blue-bg,#eff6ff);border-left:3px solid var(--blue,#3b82f6);
        border-radius:0 10px 10px 0;padding:11px 13px;margin-bottom:14px;font-size:12.5px}
      .tut-ekran{border:1px solid var(--border,#e2e8f0);border-radius:12px;overflow:hidden;margin-bottom:14px;background:var(--surface,#fff)}
      .tut-ekran-bas{background:var(--surface2,#f8fafc);border-bottom:1px solid var(--border,#e2e8f0);
        padding:8px 12px;font-weight:800;font-size:12px}
      .tut-satir{display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid var(--border,#eef2f7);font-size:12px}
      .tut-satir span{color:var(--text3,#64748b)}
      .tut-tab{width:100%;border-collapse:collapse;font-size:11.5px}
      .tut-tab th{background:var(--surface2,#f8fafc);text-align:left;padding:6px 10px;font-size:10.5px;
        text-transform:uppercase;letter-spacing:.3px;color:var(--text3,#64748b);border-bottom:1px solid var(--border,#e2e8f0)}
      .tut-tab td{padding:6px 10px;border-bottom:1px solid var(--border,#eef2f7)}
      .tut-tab-son td{font-weight:800;background:var(--surface2,#f8fafc)}
      .tut-secili{background:var(--green-bg,#f0fdf4)}
      .tut-ok-y{color:var(--green-text,#15803d);font-weight:700}
      .tut-kirmizi{color:var(--red-text,#b91c1c);font-weight:700}
      .tut-ipucu{background:var(--amber-bg,#fffbeb);border-top:1px solid var(--border,#e2e8f0);
        padding:9px 12px;font-size:11.5px;color:var(--text2,#334155)}
      .tut-uyari{background:var(--red-bg,#fef2f2);color:var(--red-text,#b91c1c);padding:9px 12px;
        font-size:11.5px;border-top:1px solid var(--border,#e2e8f0)}
      .tut-akis{display:flex;align-items:center;flex-wrap:wrap;gap:4px;justify-content:center;margin-bottom:12px}
      .tut-akis-kutu{background:var(--surface2,#f8fafc);border:1px solid var(--border,#e2e8f0);border-radius:9px;
        padding:7px 9px;text-align:center;min-width:74px}
      .tut-akis-kutu span{display:block;font-size:11px;font-weight:700}
      .tut-akis-kutu small{font-size:9px;color:var(--text3,#94a3b8)}
      .tut-ok{color:var(--text3,#94a3b8);font-size:13px}
      .tut-not{background:var(--surface2,#f8fafc);border-radius:10px;padding:10px 12px;font-size:12px;margin-bottom:12px}
      .tut-agac{padding:10px 12px}
      .tut-dal{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:4px 0;border-bottom:1px dashed var(--border,#eef2f7)}
      .tut-dal.l0{font-weight:800;font-size:12.5px}
      .tut-dal.l1{padding-left:16px} .tut-dal.l2{padding-left:34px;color:var(--text2,#475569)}
      .tut-tut{font-family:ui-monospace,monospace;font-weight:700;white-space:nowrap}
      .tut-gantt{padding:12px}
      .tut-g-satir{position:relative;height:26px;margin-bottom:5px;background:var(--surface2,#f8fafc);border-radius:6px}
      .tut-g-ad{position:absolute;left:6px;top:6px;font-size:10px;font-weight:700;z-index:2;color:var(--text3,#64748b)}
      .tut-g-bar{position:absolute;top:3px;height:20px;background:#3b82f6;color:#fff;font-size:9.5px;
        border-radius:5px;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden}
      .tut-g-bar.b2{background:#8b5cf6}.tut-g-bar.b3{background:#f59e0b}
      .tut-g-bar.b4{background:#10b981}.tut-g-bar.b5{background:#ec4899}
      .tut-is-kart{border:1px solid var(--border,#e2e8f0);border-radius:10px;margin:10px;padding:10px}
      .tut-is-ust{display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:11.5px;margin-bottom:6px}
      .tut-pill{background:var(--surface2,#f1f5f9);border-radius:20px;padding:2px 9px;font-size:10px}
      .tut-pill.yesil{background:var(--green-bg,#dcfce7);color:var(--green-text,#15803d);font-weight:700}
      .tut-is-sayac{font-size:10.5px;color:var(--text3,#64748b);margin-bottom:8px}
      .tut-is-tuslar{display:flex;flex-wrap:wrap;gap:5px}
      .tut-tus{border:1px solid var(--border,#e2e8f0);border-radius:7px;padding:4px 9px;font-size:10.5px;background:var(--surface,#fff)}
      .tut-tus.mavi{background:#dbeafe;border-color:#93c5fd}.tut-tus.gri{background:#f1f5f9}
      .tut-tus.yesil{background:#10b981;color:#fff;border-color:#059669}
      .tut-tus.kirmizi{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
      .tut-kar{display:flex;gap:8px;padding:10px 12px;flex-wrap:wrap}
      .tut-kar div{flex:1;min-width:82px;background:var(--surface2,#f8fafc);border-radius:9px;padding:8px;text-align:center}
      .tut-kar small{display:block;font-size:9px;color:var(--text3,#94a3b8);letter-spacing:.4px}
      .tut-kar b{font-size:13px}
      .tut-hr{border:0;border-top:1px solid var(--border,#e2e8f0);margin:0}
      .tut-gorev{border:1.5px solid var(--blue,#3b82f6);border-radius:12px;padding:12px;margin-bottom:14px;background:var(--surface,#fff)}
      .tut-gorev-bas{font-size:10.5px;font-weight:800;color:var(--blue-text,#1d4ed8);letter-spacing:.5px;margin-bottom:5px}
      .tut-gorev-soru{font-size:12.5px;font-weight:700;margin-bottom:9px}
      .tut-sec{display:block;width:100%;text-align:left;border:1px solid var(--border,#e2e8f0);background:var(--surface,#fff);
        border-radius:9px;padding:9px 11px;margin-bottom:6px;font-size:12px;cursor:pointer;transition:all .15s;color:inherit;font-family:inherit}
      .tut-sec:hover{border-color:var(--blue,#3b82f6);background:var(--blue-bg,#eff6ff)}
      .tut-sec.dogru{border-color:var(--green-text,#15803d);background:var(--green-bg,#f0fdf4);font-weight:700}
      .tut-sec.yanlis{border-color:var(--red-text,#b91c1c);background:var(--red-bg,#fef2f2)}
      .tut-sec:disabled{cursor:default}
      .tut-geri{font-size:11.5px;padding:9px 11px;border-radius:9px;margin-top:7px;line-height:1.5}
      .tut-geri.ok{background:var(--green-bg,#f0fdf4);color:var(--green-text,#15803d)}
      .tut-geri.no{background:var(--amber-bg,#fffbeb);color:#92400e}
      .tut-kutular{display:flex;gap:10px;flex-wrap:wrap}
      .tut-kutu{flex:1;min-width:240px;border-radius:12px;padding:11px 13px;font-size:11.5px}
      .tut-kutu h4{margin:0 0 6px;font-size:11px;letter-spacing:.5px;text-transform:uppercase}
      .tut-kutu ul{margin:0;padding-left:17px}.tut-kutu li{margin-bottom:4px;line-height:1.5}
      .tut-dikkat{background:var(--amber-bg,#fffbeb);border:1px solid #fcd34d;color:#78350f}
      .tut-kazanc{background:var(--green-bg,#f0fdf4);border:1px solid #86efac;color:#14532d}
      .tut-alt{border-top:1px solid var(--border,#e2e8f0);padding:11px 18px;display:flex;
        justify-content:space-between;align-items:center;gap:10px;background:var(--surface2,#f8fafc);flex-shrink:0;flex-wrap:wrap}
      .tut-btn{border:1px solid var(--border2,#cbd5e1);background:var(--surface,#fff);border-radius:9px;
        padding:8px 15px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:inherit}
      .tut-btn:hover{background:var(--surface2,#f1f5f9)}
      .tut-btn.ana{background:linear-gradient(180deg,#3b82f6,#2563eb);color:#fff;border-color:#2563eb}
      .tut-btn.ana:hover{background:#1d4ed8}
      .tut-btn:disabled{opacity:.45;cursor:not-allowed}
      .tut-puan{font-size:11.5px;font-weight:800;color:var(--text3,#64748b)}
      .tut-rozetler{font-size:15px;letter-spacing:1px}
      .tut-final{text-align:center;padding:8px 4px}
      .tut-final h3{font-size:19px;margin:8px 0}
      .tut-final .tut-buyuk{font-size:44px}
      .tut-ozet{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
      .tut-ozet div{flex:1;min-width:110px;background:var(--surface2,#f8fafc);border-radius:11px;padding:11px}
      .tut-ozet b{display:block;font-size:17px}
      .tut-ozet small{font-size:10px;color:var(--text3,#94a3b8)}
      @media(max-width:640px){
        .tut-pencere{max-height:98vh;border-radius:12px}
        .tut-govde{padding:13px;font-size:12.5px}
        .tut-ust h2{font-size:14px}
        .tut-kutu{min-width:100%}
        .tut-alt{padding:10px 13px}
        .tut-btn{padding:9px 12px;font-size:11.5px}
        .tut-tab{font-size:10.5px}.tut-tab td,.tut-tab th{padding:5px 6px}
      }`;
    document.head.appendChild(s);
  }

  function kapat() {
    const k = document.getElementById('tut-katman');
    if (k) k.remove();
  }

  // Bölümü çiz
  function ciz() {
    const b = BOLUMLER[durum.bolum];
    const toplam = BOLUMLER.length;
    const yuzde = Math.round(((durum.bolum + 1) / toplam) * 100);
    const katman = document.getElementById('tut-katman');
    const govde = katman.querySelector('.tut-govde');
    const ust = katman.querySelector('.tut-ust');
    const alt = katman.querySelector('.tut-alt');
    durum.gorevTamam = false;

    ust.innerHTML = `
      <div class="tut-ust-sat">
        <div><h2>${b.rozet} ${esc(b.baslik)}</h2>
          <div class="tut-rol">${esc(b.rol)} · ~${esc(b.sure)} · Durak ${durum.bolum + 1}/${toplam}</div></div>
        <button class="tut-kapat" id="tut-x" title="Kapat">✕</button>
      </div>
      <div class="tut-ilerle"><i style="width:${yuzde}%"></i></div>
      <div class="tut-ust-alt"><span>İlerleme %${yuzde}</span><span class="tut-rozetler">${durum.rozetler.join('')}</span></div>`;
    katman.querySelector('#tut-x').onclick = kapat;

    govde.innerHTML = `
      <div class="tut-hikaye">${b.hikaye}</div>
      ${b.ekran()}
      <div class="tut-gorev">
        <div class="tut-gorev-bas">🎯 GÖREV — doğru cevabı seçin</div>
        <div class="tut-gorev-soru">${esc(b.gorev.soru)}</div>
        <div id="tut-secenekler">
          ${b.gorev.secenekler.map((s, i) => `<button class="tut-sec" data-i="${i}">${esc(s.m)}</button>`).join('')}
        </div>
        <div id="tut-geri"></div>
      </div>
      <div class="tut-kutular">
        <div class="tut-kutu tut-dikkat"><h4>⚠ Nelere Dikkat Etmeli</h4>
          <ul>${b.dikkat.map(x => `<li>${x}</li>`).join('')}</ul></div>
        <div class="tut-kutu tut-kazanc"><h4>✓ Bu Adımın Kazancı</h4>
          <ul>${b.kazanc.map(x => `<li>${x}</li>`).join('')}</ul></div>
      </div>`;
    govde.scrollTop = 0;

    // Görev cevaplama
    govde.querySelectorAll('.tut-sec').forEach(btn => {
      btn.onclick = () => {
        const sec = b.gorev.secenekler[parseInt(btn.dataset.i, 10)];
        govde.querySelectorAll('.tut-sec').forEach(x => { x.disabled = true; });
        btn.classList.add(sec.d ? 'dogru' : 'yanlis');
        if (!sec.d) {
          const dogruBtn = govde.querySelector('.tut-sec[data-i="' + b.gorev.secenekler.findIndex(s => s.d) + '"]');
          if (dogruBtn) dogruBtn.classList.add('dogru');
        }
        document.getElementById('tut-geri').innerHTML =
          `<div class="tut-geri ${sec.d ? 'ok' : 'no'}">${sec.d ? '✓ ' : '💡 '}${sec.geri}</div>`;
        if (!durum.gorevTamam) {
          durum.gorevTamam = true;
          durum.puan += sec.d ? 100 : 40;
          if (durum.rozetler.length <= durum.bolum) durum.rozetler.push(b.rozet);
          ilerlemeYaz();
          altCiz();
        }
      };
    });

    altCiz();

    function altCiz() {
      const sonMu = durum.bolum === toplam - 1;
      alt.innerHTML = `
        <div class="tut-puan">⭐ ${durum.puan} puan${durum.gorevTamam ? '' : ' · görevi çözün'}</div>
        <div style="display:flex;gap:7px">
          ${durum.bolum > 0 ? '<button class="tut-btn" id="tut-onceki">← Önceki</button>' : ''}
          <button class="tut-btn ana" id="tut-sonraki" ${durum.gorevTamam ? '' : 'disabled'}>
            ${sonMu ? '🏁 Yolculuğu Bitir' : 'Sonraki Durak →'}</button>
        </div>`;
      const onc = alt.querySelector('#tut-onceki');
      if (onc) onc.onclick = () => { durum.bolum--; ilerlemeYaz(); ciz(); };
      alt.querySelector('#tut-sonraki').onclick = () => {
        if (durum.bolum === toplam - 1) { finalCiz(); return; }
        durum.bolum++;
        ilerlemeYaz();
        ciz();
      };
    }
  }

  // Final ekranı
  function finalCiz() {
    const katman = document.getElementById('tut-katman');
    const enYuksek = BOLUMLER.length * 100;
    const oran = Math.round((durum.puan / enYuksek) * 100);
    const unvan = oran >= 90 ? 'Üretim Ustası' : oran >= 70 ? 'Planlama Uzmanı' : 'Çırak — tekrar deneyin!';
    katman.querySelector('.tut-ust').innerHTML = `
      <div class="tut-ust-sat"><div><h2>🏁 Yolculuk Tamamlandı</h2>
        <div class="tut-rol">Siparişten sevkiyata — ${BOLUMLER.length} durak</div></div>
        <button class="tut-kapat" id="tut-x">✕</button></div>
      <div class="tut-ilerle"><i style="width:100%"></i></div>
      <div class="tut-ust-alt"><span>İlerleme %100</span><span class="tut-rozetler">${durum.rozetler.join('')}</span></div>`;
    katman.querySelector('#tut-x').onclick = kapat;

    katman.querySelector('.tut-govde').innerHTML = `
      <div class="tut-final">
        <div class="tut-buyuk">🏆</div>
        <h3>${esc(unvan)}</h3>
        <div style="color:var(--text3,#64748b);font-size:12.5px">
          Bir siparişin teklif aşamasından fabrika kapısından çıkışına kadar
          izlediği yolun tamamını gördünüz.</div>
        <div class="tut-ozet">
          <div><b>${durum.puan}</b><small>PUAN</small></div>
          <div><b>%${oran}</b><small>BAŞARI</small></div>
          <div><b>${durum.rozetler.length}</b><small>ROZET</small></div>
          <div><b>${BOLUMLER.length}</b><small>DURAK</small></div>
        </div>
      </div>
      <div class="tut-kutu tut-kazanc" style="min-width:100%;margin-bottom:12px">
        <h4>✓ ÜretimOS'un Size Kazandırdıkları</h4>
        <ul>
          <li><b>Tek veri girişi:</b> reçeteye bir kez girilen bilgi; maliyet, MRP, satınalma, iş emri, çizelge ve kârlılıkta otomatik kullanılır.</li>
          <li><b>Gerçek maliyet:</b> fiyatı tahminle değil, hammadde + işçilik + genel gider hesabıyla verirsiniz.</li>
          <li><b>Canlı üretim takibi:</b> hangi parça hangi istasyonda, kim işledi — telefondan görünür.</li>
          <li><b>Tutulabilir termin:</b> sonlu kapasite çizelgesi olmayan kapasiteye söz vermenizi engeller.</li>
          <li><b>Kayıpların görünürlüğü:</b> fire, duruş ve gecikme rakamla ölçülür; iyileştirme somut hale gelir.</li>
          <li><b>Kurumsal hafıza:</b> tedarikçi seçim gerekçesi, kalite kaydı, teknik resim ve onay izleri kalıcıdır.</li>
          <li><b>Kâğıtsız saha:</b> QR etiketle teknik resim ve dosyalar operatörün telefonunda.</li>
        </ul>
      </div>
      <div class="tut-kutu tut-dikkat" style="min-width:100%">
        <h4>⚠ Kurulumda En Sık Yapılan 6 Hata</h4>
        <ul>
          <li>Hammadde fiyatlarını güncel tutmamak — maliyet hesabı eskir, kâr yanılır.</li>
          <li>Rota sürelerini "yaklaşık" girmek — çizelge ve termin sapar.</li>
          <li>Tedarik sürelerini boş bırakmak — MRP sipariş tarihini hesaplayamaz.</li>
          <li>Ortak operatör şifresi kullanmak — kim ne yaptı izi kaybolur.</li>
          <li>Kalite reddinde gerekçe/fotoğraf girmemek — kök neden bulunamaz.</li>
          <li>Sipariş kapandıktan sonra kârlılık raporunu okumamak — öğrenme döngüsü kapanmaz.</li>
        </ul>
      </div>`;

    katman.querySelector('.tut-alt').innerHTML = `
      <div class="tut-puan">⭐ ${durum.puan} puan · ${esc(unvan)}</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button class="tut-btn" id="tut-bas">↻ Baştan Başla</button>
        <button class="tut-btn ana" id="tut-kapat2">Sisteme Giriş Yap →</button>
      </div>`;
    katman.querySelector('#tut-bas').onclick = () => {
      durum = { bolum: 0, puan: 0, rozetler: [], gorevTamam: false };
      ilerlemeSil(); ciz();
    };
    katman.querySelector('#tut-kapat2').onclick = () => {
      kapat();
      const k = document.getElementById('ln-kullanici');
      if (k) k.focus();
    };
  }

  // ── Açılış: kaydedilmiş ilerleme varsa devam sorulur ──────────────────────
  function ac() {
    stilEkle();
    kapat();
    const katman = document.createElement('div');
    katman.className = 'tut-katman';
    katman.id = 'tut-katman';
    katman.innerHTML = `<div class="tut-pencere">
      <div class="tut-ust"></div><div class="tut-govde"></div><div class="tut-alt"></div></div>`;
    document.body.appendChild(katman);
    katman.onclick = (e) => { if (e.target === katman) kapat(); };
    document.addEventListener('keydown', function esc2(e) {
      if (e.key === 'Escape') { kapat(); document.removeEventListener('keydown', esc2); }
    });

    const kayit = ilerlemeOku();
    if (kayit.bolum > 0 && kayit.bolum < BOLUMLER.length) {
      // Yarım kalan yolculuk — devam et / baştan başla
      katman.querySelector('.tut-ust').innerHTML =
        `<div class="tut-ust-sat"><div><h2>👋 Tekrar hoş geldiniz</h2>
          <div class="tut-rol">Yarım kalan bir yolculuğunuz var</div></div>
          <button class="tut-kapat" id="tut-x">✕</button></div>`;
      katman.querySelector('#tut-x').onclick = kapat;
      katman.querySelector('.tut-govde').innerHTML = `
        <div class="tut-not">Son kaldığınız durak: <b>${esc(BOLUMLER[kayit.bolum].rozet + ' ' + BOLUMLER[kayit.bolum].baslik)}</b>
        (${kayit.bolum + 1}/${BOLUMLER.length}) · ⭐ ${kayit.puan} puan<br>
        Kaldığınız yerden devam edebilir veya baştan başlayabilirsiniz.</div>`;
      katman.querySelector('.tut-alt').innerHTML = `
        <div class="tut-puan">⭐ ${kayit.puan} puan</div>
        <div style="display:flex;gap:7px">
          <button class="tut-btn" id="tut-yeni">Baştan Başla</button>
          <button class="tut-btn ana" id="tut-devam">Devam Et →</button></div>`;
      katman.querySelector('#tut-devam').onclick = () => {
        durum = { bolum: kayit.bolum, puan: kayit.puan, rozetler: kayit.rozetler || [], gorevTamam: false };
        ciz();
      };
      katman.querySelector('#tut-yeni').onclick = () => {
        durum = { bolum: 0, puan: 0, rozetler: [], gorevTamam: false };
        ilerlemeSil(); ciz();
      };
      return;
    }
    durum = { bolum: 0, puan: 0, rozetler: [], gorevTamam: false };
    ciz();
  }

  return { ac, kapat };
})();
