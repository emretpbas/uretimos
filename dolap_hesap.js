// ════════════════════════════════════════════════════════════════════════════
// DOLAP ÖLÇÜ HESAP MOTORU
//
// Bu dosya SAF HESAPTIR — DOM'a, Store'a, hiçbir şeye dokunmaz. Sebebi:
// yanlış ölçü kesilen plakayı çöpe atar. Bu yüzden hesap arayüzden ayrılmış
// ve testle korunmuştur (testler/03_dolap_hesap_test.php).
//
// GÖVDE KURGUSU (Türkiye panel mobilyada yaygın iki tip):
//   'yan_tam'  → Yan paneller TAM BOY; üst/alt paneller yanların arasına girer.
//                Yan: H × D   ·   Üst/Alt: (W − 2t) × D
//   'ust_tam'  → Üst/alt paneller TAM EN; yanlar aralarına girer.
//                Üst/Alt: W × D   ·   Yan: (H − 2t) × D
//
// KAPAK TİPLERİ:
//   'tam_bini'   Kapak gövdeyi tamamen örter.  Yükseklik = H − 2·fuga
//                Genişlik = (W − (n−1)·fuga) / n
//   'yarim_bini' İki kapak ortak bir dikmeyi yarımşar örter (yan yana gövdeler).
//                Genişlik = (W − (n−1)·fuga) / n − t/2
//   'icerlek'    Kapak gövdenin İÇİNE oturur.
//                Yükseklik = H − 2t − 2·fuga
//                Genişlik = (W − 2t − (n+1)·fuga) / n
//
// ARKALIK:
//   'kanalli'  Kanala oturur: (W − 2t + 2·kanalDerinlik) × (H − 2t + 2·kanalDerinlik)
//   'sirtli'   Arkaya çakılır/vidalanır: W × H
//
// Tüm ölçüler MİLİMETREdir. Kaba ölçü = net ölçü + kesim payı (her kenardan).
// ════════════════════════════════════════════════════════════════════════════
const DolapHesap = (() => {

  // ── HIRDAVAT MARKA KÜTÜPHANESİ ────────────────────────────────────────────
  // Marka değişince menteşe, ray, kaldırma sistemi, bağlantı elemanı ve delik
  // standartları topluca değişir. hirdavat[].ad GENERİK kalır ('Menteşe',
  // 'Kulp'); markaya özgü ürün adı ayrı 'model' alanında döner — böylece
  // markadan bağımsız eşleştirme ve mevcut testler bozulmaz.
  // Değerler marka kataloglarının yaygın standartlarıdır; üretim öncesi
  // kullandığınız ürünün montaj föyüyle doğrulanmalıdır.
  const MARKALAR = {
    Hettich: {
      mentese: 'Sensys 8645i yavaşlatmalı', menteseTablasi: 'Sensys montaj plakası',
      ray: 'ArciTech çekmece rayı', rayBoylari: [270, 300, 350, 400, 450, 500, 550],
      rayYanBosluk: 13, kaldirma: 'Free flap 3.15',
      minifix: 'Rastex 15 + VB 36 pim', dubel: 'Ø8×30 ahşap dübel', rafPimi: 'Ø5 kilitli raf pimi',
      kapCap: 35, kapDerinlik: 11.5, kapKenarMesafe: 5, delikSistem: 32, kenardanIlk: 37,
      pimCap: 5, pimDerinlik: 13, minifixCap: 15, minifixDerinlik: 12.5
    },
    Blum: {
      mentese: 'CLIP top BLUMOTION 110°', menteseTablasi: 'CLIP montaj plakası 0mm',
      ray: 'TANDEMBOX antaro', rayBoylari: [270, 300, 350, 400, 450, 500, 550, 600],
      rayYanBosluk: 12.5, kaldirma: 'AVENTOS HK',
      minifix: 'Eksantrik Ø15 + Ø8 pim', dubel: 'Ø8×30 ahşap dübel', rafPimi: 'Ø5 raf pimi',
      kapCap: 35, kapDerinlik: 13, kapKenarMesafe: 5, delikSistem: 32, kenardanIlk: 37,
      pimCap: 5, pimDerinlik: 13, minifixCap: 15, minifixDerinlik: 12.5
    },
    Hafele: {
      mentese: 'Metalla 510 A/SM yavaşlatmalı', menteseTablasi: 'Metalla montaj plakası',
      ray: 'Moovit MX çekmece sistemi', rayBoylari: [250, 300, 350, 400, 450, 500, 550],
      rayYanBosluk: 13, kaldirma: 'Free fold / Duo forte',
      minifix: 'Minifix 15 gövde bağlantısı', dubel: 'Ø8×30 ahşap dübel', rafPimi: 'Ø5 raf pimi',
      kapCap: 35, kapDerinlik: 12.5, kapKenarMesafe: 5, delikSistem: 32, kenardanIlk: 37,
      pimCap: 5, pimDerinlik: 13, minifixCap: 15, minifixDerinlik: 12.5
    },
    Samet: {
      mentese: 'Smart Hinge yavaşlatmalı 110°', menteseTablasi: 'Smart Hinge montaj plakası',
      ray: 'Smart Box / Intivo çekmece', rayBoylari: [270, 300, 350, 400, 450, 500],
      rayYanBosluk: 13, kaldirma: 'Smart Lift',
      minifix: 'Minifix 15 + Ø8 dübel', dubel: 'Ø8×30 ahşap dübel', rafPimi: 'Ø5 raf pimi',
      kapCap: 35, kapDerinlik: 12, kapKenarMesafe: 5, delikSistem: 32, kenardanIlk: 37,
      pimCap: 5, pimDerinlik: 13, minifixCap: 15, minifixDerinlik: 12.5
    }
  };
  const markaAl = (ad) => MARKALAR[ad] || MARKALAR.Blum;

  // Gövde derinliğine sığan en uzun standart ray boyu
  function rayBoyuSec(marka, icDerinlik) {
    const u = markaAl(marka).rayBoylari.filter(x => x <= icDerinlik - 10);
    return u.length ? Math.max.apply(null, u) : markaAl(marka).rayBoylari[0];
  }
  // Genişliğe göre ayak adedi (her 900mm'de bir çift ilave)
  const otoAyakAdedi = (W) => (W <= 900 ? 4 : W <= 1500 ? 6 : 8);

  const VARSAYILAN = {
    genislik: 800, yukseklik: 2000, derinlik: 500,
    panelKalinlik: 18, arkalikKalinlik: 8,
    govdeTipi: 'yan_tam',
    arkalikTipi: 'kanalli', kanalDerinlik: 8,
    rafSabit: 1, rafHareketli: 3, rafGeriCekme: 20,
    kapakSayisi: 2, kapakTipi: 'tam_bini', fuga: 3,
    ustTac: false, ustTacYukseklik: 80,
    altTac: false, altTacYukseklik: 80,
    bazaTipi: 'baza', bazaYukseklik: 100, ayakTipi: 'plastik_ayak', ayakAdet: 4,
    kesimPayi: 10, kulpVar: true, kulpTipi: 'klasik',

    // ── YENİ (hepsi opsiyonel — verilmezse eski davranış birebir korunur) ──
    marka: 'Blum',              // Hettich | Blum | Hafele | Samet
    arkalikArkadanMesafe: 0,    // arkalığın gövde arka kenarından içeri mesafesi (mm)
    ustSistem: '',              // '' | 'kayit_dikey' | 'kayit_yatay' | 'profil_metal' | 'profil_aluminyum'
    kayitGenislik: 100, kayitKalinlik: 18, kayitAdet: 2,
    ayakYukseklik: 100, ayakOtomatik: false,
    cekmeceSayisi: 0, cekmeceYukseklik: 180, cekmeceTipi: 'normal', // normal | ic | gizli
    bolmeler: [],               // dikey modülasyon — boşsa tek bölme (klasik)
    delikPlani: false,          // true → CNC delik koordinatları da üretilir

    // ── ÜST TAÇ: YÜKSEKLİK YERİNE KALINLIK + KONUM ────────────────────────
    // ustTacKalinlik > 0 verilirse taç bir PANEL gibi ele alınır:
    //   konum 'ustune'    → yanların ÜSTÜNE oturur, en = W (tam en)
    //   konum 'aralarina' → yanların ARASINA girer,  en = W − 2t
    // Her iki durumda da gövde yüksekliğinden kendi KALINLIĞI kadar yer alır.
    // ustTacKalinlik 0 ise eski davranış (ustTacYukseklik) korunur.
    ustTacKalinlik: 0, ustTacKonum: 'ustune', ustTacDerinlik: 0,

    // ── MANUEL RAF VE KAPAK ───────────────────────────────────────────────
    // raflar: [{ konum, tip:'sabit'|'hareketli', askiBorusu:true }]
    //   konum = bölme ÜSTÜNDEN mm. Liste doluysa raf adedi ve yerleri buradan
    //   okunur; boşsa rafSabit/rafHareketli sayıları eşit dağıtılır.
    //   askiBorusu:true → o rafın ALTINA askı borusu eklenir.
    raflar: [],
    // kapakDizilim 'ustuste' ise kapaklar alt alta gelir ve her birinin
    // yüksekliği kapakYukseklikleri listesinden okunur (mm).
    kapakDizilim: 'yanyana', kapakYukseklikleri: [],

    // ── PANEL BAZLI MALZEME VE KENAR BANDI ────────────────────────────────
    // panelAyarlari[rol] = { kalinlik, hammaddeId, bantlar:{on,arka,sag,sol} }
    // Roller: yan · ust · alt · raf_sabit · raf_hareketli · kapak · arkalik ·
    //         ayrac · ust_tac · alt_tac · baza · kayit · cekmece · cekmece_kapak
    // bantlar'daki her kenar bir KENAR BANDI HAMMADDE ID'sidir; boş bırakılan
    // kenara bant atanmaz (kenar çıplak kalır).
    panelAyarlari: {},

    // ── KAPAK SİSTEMİ ─────────────────────────────────────────────────────
    //   menteseli → klasik menteşeli kapak (varsayılan, eski davranış)
    //   surgulu   → sürgülü (raylı) kapak — kanatlar üst üste biner, fuga yok
    //   yok       → KAPAKSIZ dolap (açık raflı vitrin/kitaplık)
    kapakSistemi: 'menteseli',

    // ── HÜCRE İÇERİKLERİ ──────────────────────────────────────────────────
    // Raflar ve dikmeler gövdeyi HÜCRELERE böler; her hücre soldan sağa,
    // yukarıdan aşağıya sırayla numaralanır. Aksesuar ve çekmece hücre
    // numarasına atanır:  hucreIcerik = { '3': { aksesuar, cekmeceSayisi… } }
    hucreIcerik: {},

    // ── SÜRGÜLÜ KAPAK ─────────────────────────────────────────────────────
    //   cerceve 'melamin'   → kanat tek parça melamin panel (cam takılırsa
    //                         panelden boşluk kesilir)
    //   cerceve 'aluminyum' → alüminyum çerçeve profili + içine dolgu/cam
    //   bindirme = kanatların üst üste bindiği pay (mm), her ek kanat için
    //   cerceve 'aluminyum' → çerçeve + İÇİNE YATAY/DİKEY KAYIT atanabilir;
    //                          kayıtların oluşturduğu gözler numaralanır ve
    //                          her göze ayrı dolgu (plaka/ayna/cam) verilir
    //   cerceve 'panel'     → tek parça panel kanat; kenarına alüminyum kulp
    //                          veya gömme kulp seçilir
    surguluKanat: 2, surguluCerceve: 'aluminyum',
    surguluBindirme: 25, surguluProfilEn: 20,
    surguluRaySistemi: 'ustten_asmali',   // ustten_asmali | alttan_tekerlekli
    // Kanat içi kayıtlar (mm). dikeyKayitlar: kanadın solundan, yatayKayitlar:
    // kanadın üstünden ölçülür. Boşsa kanat tek gözdür.
    surguluDikeyKayitlar: [], surguluYatayKayitlar: [], surguluKayitEn: 40,
    // Göz dolguları: { '1': {tip:'plaka'|'ayna'|cam tipi, hammaddeId} }
    surguluGozler: {},
    // Panel kanatta kulp tipi: 'aluminyum_kenar' | 'gomme'
    surguluKulpTipi: 'aluminyum_kenar',

    // ── CAM ───────────────────────────────────────────────────────────────
    //   camTipi: yok | seffaf | kumlu | bronz_reflekte | gumus_reflekte |
    //            nervurlu | fume
    //   Cam, kanadın İÇİNDE bir dikdörtgendir ve konumu ELLE verilir:
    //     camUstMesafe = kanadın üst kenarından cam üst kenarına mesafe (mm)
    //     camYukseklik = cam yüksekliği (mm); 0 → kanadın kalanı kadar
    //     camYanMesafe = kanadın yan kenarlarından cam kenarına mesafe (mm)
    camTipi: 'yok', camKalinlik: 4,
    camUstMesafe: 100, camYukseklik: 0, camYanMesafe: 60,

    // ── LED AYDINLATMA ────────────────────────────────────────────────────
    //   ledYan → yan dikmelere dikey LED, ledRaf → rafların altına LED
    //   ledRenk: gunisigi | ilikbeyaz | beyaz | rgb
    ledYan: false, ledRaf: false,
    ledRenk: 'ilikbeyaz', ledProfilVar: true, ledTrafoVar: true
  };

  // Yuvarlama: 0.1 mm hassasiyet yeterli, kayan nokta artığı üretmesin
  const yuvarla = (n) => Math.round(n * 10) / 10;

  // ── ANA HESAP ────────────────────────────────────────────────────────────
  // Girdi: yapılandırma nesnesi · Çıktı: { paneller[], hirdavat[], uyarilar[] }
  function hesapla(girdi) {
    const c = Object.assign({}, VARSAYILAN, girdi || {});
    const W = +c.genislik, H = +c.yukseklik, D = +c.derinlik;
    const t = +c.panelKalinlik, tb = +c.arkalikKalinlik;
    const uyarilar = [];

    if (!(W > 0 && H > 0 && D > 0)) {
      return { paneller: [], hirdavat: [], uyarilar: ['Genişlik, yükseklik ve derinlik sıfırdan büyük olmalı'] };
    }
    if (W < 2 * t + 50) uyarilar.push('Genişlik gövde için çok küçük (en az ' + (2 * t + 50) + ' mm önerilir)');

    // Baza/ayak, gövde yüksekliğini düşer: gövde = toplam − baza
    const bazaY = c.bazaTipi === 'baza' ? +c.bazaYukseklik : 0;
    // Taç kalınlık verilmişse gövdeden kalınlığı kadar, verilmemişse eski
    // davranışla yüksekliği kadar yer alır.
    const tacKal = (+c.ustTacKalinlik > 0) ? +c.ustTacKalinlik : 0;
    const tacYeri = c.ustTac ? (tacKal > 0 ? tacKal : (+c.ustTacYukseklik || 0)) : 0;
    const govdeH = H - bazaY - tacYeri;
    if (govdeH <= 0) {
      return { paneller: [], hirdavat: [], uyarilar: ['Baza ve taç yükseklikleri toplam yükseklikten büyük'] };
    }

    const paneller = [];
    // Hırdavat bölümü aşağıda kurulduğu için, ondan önce üretilen kalemler
    // (sürgülü ray, LED, profil…) burada biriktirilip sonra aktarılır.
    const hirdavatBekleyen = [];
    // Cam parçalar plaka değildir; ayrı listede m² olarak tutulur.
    const camlar = [];
    const panelAyar = (rol) => (c.panelAyarlari && c.panelAyarlari[rol]) || {};
    // kalinlikOverride: taç gibi kendi kalınlığı olan parçalar için
    const ekle = (ad, adet, netEn, netBoy, rol, bantlar, kalinlikOverride) => {
      if (adet <= 0 || netEn <= 0 || netBoy <= 0) return;
      const pa = panelAyar(rol);
      const varsayilanKalinlik = rol === 'arkalik' ? tb : (rol === 'cekmece_alt' ? 8 : t);
      const kal = (+pa.kalinlik > 0) ? +pa.kalinlik
                : (+kalinlikOverride > 0) ? +kalinlikOverride : varsayilanKalinlik;
      // Kenar bandı: panelAyarlari verilmişse kenar bazlı hammadde id'leri esas alınır.
      const bantIds = pa.bantlar ? {
        on: pa.bantlar.on || null, arka: pa.bantlar.arka || null,
        sag: pa.bantlar.sag || null, sol: pa.bantlar.sol || null
      } : null;
      const bantM = bantIds ? bantUzunlukIds(bantIds, netEn, netBoy)
                            : bantUzunluk(bantlar, netEn, netBoy);
      paneller.push({
        ad, adet, rol,
        netEn: yuvarla(netEn), netBoy: yuvarla(netBoy), kalinlik: kal,
        kabaEn: yuvarla(netEn + 2 * c.kesimPayi), kabaBoy: yuvarla(netBoy + 2 * c.kesimPayi),
        bantlar: bantlar || '',
        bantIds: bantIds,                       // kenar → kenar bandı hammadde id
        hammaddeId: pa.hammaddeId || null,      // plaka hammadde kartı
        // Bantlanacak toplam kenar uzunluğu (metre) — kenar bandı ihtiyacı.
        // Bant metrajı mm hassasiyetiyle tutulur (0.1 m yuvarlaması çok kabaydı).
        bantMetre: Math.round(bantM * adet) / 1000
      });
    };

    // ── GÖVDE ────────────────────────────────────────────────────────────
    if (c.govdeTipi === 'ust_tam') {
      ekle('Üst panel', 1, W, D, 'ust', 'on');
      ekle('Alt panel', 1, W, D, 'alt', 'on');
      ekle('Yan panel (dikme)', 2, D, govdeH - 2 * t, 'yan', 'on');
    } else {
      ekle('Yan panel (dikme)', 2, D, govdeH, 'yan', 'on');
      ekle('Üst panel', 1, W - 2 * t, D, 'ust', 'on');
      ekle('Alt panel', 1, W - 2 * t, D, 'alt', 'on');
    }

    // ── MODÜLASYON: DİKEY BÖLMELER ───────────────────────────────────────
    // c.bolmeler boşsa dolap tek bölmedir ve hesap eskisiyle birebir aynıdır.
    // Doluysa aralarına dikey ayraç girer; raf/kapak/çekmece her bölme için
    // ayrı ayrı, o bölmenin kendi genişliğine göre hesaplanır.
    const rafEn = W - 2 * t;
    const rafDerinlik = D - (+c.rafGeriCekme || 0) - (c.arkalikTipi === 'kanalli' ? tb : 0)
                          - (+c.arkalikArkadanMesafe || 0);
    const icYukseklik = govdeH - 2 * t;
    const bolmeGirdi = Array.isArray(c.bolmeler) ? c.bolmeler.filter(Boolean) : [];
    const cokBolmeli = bolmeGirdi.length > 1;
    const bolmeYerlesim = [];

    // Bir bölmenin raflarını panellere ve yerleşime yazar.
    // Manuel konum verilmişse o konumlar, verilmemişse eşit dağılım kullanılır.
    const raflariIsle = (kaynak, bolmeGen, etiket) => {
      const liste = rafListesi(kaynak, icYukseklik);
      const sabit = liste.filter(r => r.tip === 'sabit').length;
      const hareketli = liste.filter(r => r.tip === 'hareketli').length;
      ekle('Sabit raf' + etiket, sabit, bolmeGen, rafDerinlik, 'raf_sabit', 'on');
      // Hareketli raf, yanlara sürtmemesi için her yandan 1 mm dar
      ekle('Hareketli raf' + etiket, hareketli, bolmeGen - 2, rafDerinlik, 'raf_hareketli', 'on');
      return liste;
    };

    if (!cokBolmeli) {
      const raflar = raflariIsle(c, rafEn, '');
      bolmeYerlesim.push({
        index: 0, x: t, genislik: rafEn, y: t, yukseklik: icYukseklik,
        rafSabit: raflar.filter(r => r.tip === 'sabit').length,
        rafHareketli: raflar.filter(r => r.tip === 'hareketli').length,
        raflar,
        kapakSayisi: +c.kapakSayisi || 0,
        kapakDizilim: c.kapakDizilim || 'yanyana',
        kapakYukseklikleri: Array.isArray(c.kapakYukseklikleri) ? c.kapakYukseklikleri : [],
        cekmeceSayisi: +c.cekmeceSayisi || 0,
        cekmeceYukseklik: +c.cekmeceYukseklik || 0, aksesuar: c.aksesuar || ''
      });
    } else {
      const ayracSayisi = bolmeGirdi.length - 1;
      const kullanilabilir = rafEn - ayracSayisi * t;
      const oranToplam = bolmeGirdi.reduce((s, b) => s + (+b.oran || 1), 0) || 1;
      if (kullanilabilir <= 0) uyarilar.push('Bölme sayısı bu genişlik için fazla — ayraçlar iç genişliği aşıyor');
      ekle('Dikey ayraç', ayracSayisi, D - (+c.arkalikArkadanMesafe || 0), icYukseklik, 'ayrac', 'on');

      let imlec = t;
      bolmeGirdi.forEach((b, i) => {
        const bg = kullanilabilir * (+b.oran || 1) / oranToplam;
        const et = ' (Bölme ' + (i + 1) + ')';
        const bCek = +b.cekmeceSayisi || 0, bCekY = +b.cekmeceYukseklik || +c.cekmeceYukseklik || 0;
        const bRaflar = raflariIsle(b, bg, et);
        bolmeYerlesim.push({
          index: i, x: imlec, genislik: yuvarla(bg), y: t, yukseklik: icYukseklik,
          rafSabit: bRaflar.filter(r => r.tip === 'sabit').length,
          rafHareketli: bRaflar.filter(r => r.tip === 'hareketli').length,
          raflar: bRaflar,
          kapakSayisi: +b.kapakSayisi || 0,
          kapakDizilim: b.kapakDizilim || c.kapakDizilim || 'yanyana',
          kapakYukseklikleri: Array.isArray(b.kapakYukseklikleri) ? b.kapakYukseklikleri : [],
          cekmeceSayisi: bCek,
          cekmeceYukseklik: bCekY, aksesuar: b.aksesuar || ''
        });
        imlec += bg + (i < ayracSayisi ? t : 0);
      });
      // Pratik alt sınır: 100 mm altındaki bölmeye raf/kapak/çekmece sığmaz
      const dar = bolmeYerlesim.filter(b => b.genislik < 100);
      if (dar.length) uyarilar.push('Bölme sayısı bu genişlik için fazla — ' + dar.length +
        ' bölme 100 mm altında kalıyor (en dar: ' + yuvarla(Math.min.apply(null, dar.map(b => b.genislik))) + ' mm)');
    }

    // ── ARKALIK ──────────────────────────────────────────────────────────
    if (c.arkalikTipi === 'kanalli') {
      const k = +c.kanalDerinlik || 0;
      ekle('Arkalık (kanallı)', 1, W - 2 * t + 2 * k, govdeH - 2 * t + 2 * k, 'arkalik', '');
    } else if (c.arkalikTipi === 'sirtli') {
      ekle('Arkalık (sırttan)', 1, W, govdeH, 'arkalik', '');
    }

    // ── KAPAKLAR ─────────────────────────────────────────────────────────
    // kapakSistemi 'yok' ise hiç kapak üretilmez (kapaksız/açık dolap).
    // 'surgulu' ise menteşeli kapak mantığı devre dışıdır; kanatlar aşağıda
    // ayrı bölümde hesaplanır.
    const kapakSistemi = c.kapakSistemi || 'menteseli';
    const n = (kapakSistemi === 'menteseli') ? Math.max(0, +c.kapakSayisi || 0) : 0;
    const f = +c.fuga || 0;
    // Ekstra hırdavat gerektirmeyen kulp tipleri (kendinden/J kendinden/J cep/
    // 45° pah) panelin kendisine CNC ile işlenir — bu bir üretim notudur,
    // kapak panelinin adına eklenir (kesim listesinde/Excel'de görünür).
    const kulpNotu = (c.kulpVar && KULP_FREZE_NOTU[c.kulpTipi]) ? ' · ' + KULP_FREZE_NOTU[c.kulpTipi] : '';
    // Çekmece bölgesi kapak yüksekliğinden düşülür (çekmece yoksa 0 → eski davranış)
    const cekmeceBolgesi = (+c.cekmeceSayisi || 0) * (+c.cekmeceYukseklik || 0);

    // Belirli bir alan içindeki kapak ölçüsü (alanW: kapağın örteceği genişlik)
    const kapakOlcu = (alanW, alanH, adet) => {
      if (c.kapakTipi === 'icerlek') return { en: (alanW - 2 * t - (adet + 1) * f) / adet, boy: alanH - 2 * t - 2 * f };
      if (c.kapakTipi === 'yarim_bini') return { en: (alanW - (adet - 1) * f) / adet - t / 2, boy: alanH - 2 * f };
      return { en: (alanW - (adet - 1) * f) / adet, boy: alanH - 2 * f };   // tam_bini
    };

    // ÜST ÜSTE DİZİLİM: kapaklar alt alta gelir ve her birinin yüksekliği
    // kapakYukseklikleri listesinden okunur. Liste eksikse kalan yükseklik
    // kalan kapaklara eşit bölünür; toplam alanı aşarsa uyarı verilir.
    const ustUsteKapaklar = (b, alanW, alanH, adet, etiket) => {
      const verilen = (b.kapakYukseklikleri || []).map(x => +x || 0).filter(x => x > 0);
      const yukler = [];
      let kalanAlan = alanH - (adet - 1) * f, kalanAdet = adet;
      for (let i = 0; i < adet; i++) {
        if (i < verilen.length) { yukler.push(verilen[i]); kalanAlan -= verilen[i]; kalanAdet--; }
      }
      for (let i = verilen.length; i < adet; i++) yukler.push(kalanAdet > 0 ? kalanAlan / kalanAdet : 0);
      const toplam = yukler.reduce((a, x) => a + x, 0) + (adet - 1) * f;
      if (toplam > alanH + 0.5) {
        uyarilar.push(etiket + 'kapak yükseklikleri toplamı (' + yuvarla(toplam) +
          ' mm) kullanılabilir alandan (' + yuvarla(alanH) + ' mm) büyük');
      }
      const en = c.kapakTipi === 'icerlek' ? alanW - 2 * t - 2 * f : alanW - f;
      yukler.forEach((h2, i) => {
        if (h2 <= 0 || en <= 0) { uyarilar.push(etiket + 'kapak ' + (i + 1) + ' ölçüsü geçersiz'); return; }
        ekle('Kapak ' + (i + 1) + etiket2(etiket) + kulpNotu, 1, en, h2, 'kapak', 'dort');
      });
    };
    const etiket2 = (e) => (e ? ' ' + e.trim().replace(/:$/, '') : '');

    if (!cokBolmeli) {
      if (n > 0) {
        if (c.kapakDizilim === 'ustuste') {
          ustUsteKapaklar(bolmeYerlesim[0], W, govdeH - cekmeceBolgesi, n, '');
        } else {
          const k = kapakOlcu(W, govdeH - cekmeceBolgesi, n);
          if (k.en <= 0 || k.boy <= 0) uyarilar.push('Kapak ölçüsü negatif çıktı — fuga veya kapak sayısını gözden geçirin');
          ekle('Kapak (' + kapakTipiAdi(c.kapakTipi) + ')' + kulpNotu, n, k.en, k.boy, 'kapak', 'dort');
          if (k.en > 600) uyarilar.push('Kapak genişliği ' + yuvarla(k.en) + ' mm — 600 mm üstü kapaklarda sarkma riski, kapak sayısını artırmayı düşünün');
        }
      }
    } else {
      bolmeYerlesim.forEach((b) => {
        if (!b.kapakSayisi || kapakSistemi !== 'menteseli') return;
        // Bölme kapağı, bindirmeye göre ayracın yarısını da örter
        const ortme = c.kapakTipi === 'icerlek' ? 0 : t;
        const alanW = b.genislik + ortme;
        const alanH = b.yukseklik + (c.kapakTipi === 'icerlek' ? 0 : 2 * t) - b.cekmeceSayisi * b.cekmeceYukseklik;
        const et2 = '(Bölme ' + (b.index + 1) + ')';
        if (b.kapakDizilim === 'ustuste') {
          ustUsteKapaklar(b, alanW, alanH, b.kapakSayisi, 'Bölme ' + (b.index + 1) + ': ');
          return;
        }
        const k = kapakOlcu(alanW, alanH, b.kapakSayisi);
        if (k.en <= 0 || k.boy <= 0) { uyarilar.push('Bölme ' + (b.index + 1) + ': kapak ölçüsü negatif çıktı'); return; }
        ekle('Kapak ' + et2 + kulpNotu, b.kapakSayisi, k.en, k.boy, 'kapak', 'dort');
        if (k.en > 600) uyarilar.push('Bölme ' + (b.index + 1) + ': kapak genişliği ' + yuvarla(k.en) + ' mm — sarkma riski');
      });
    }

    // ── SÜRGÜLÜ KAPAK ────────────────────────────────────────────────────
    // Sürgülü kanatlar üst üste biner: her ek kanat `surguluBindirme` kadar
    // örtüştüğü için toplam kanat eni, gövde eninden fazladır.
    //   kanatEn = (W + (kanat−1) × bindirme) / kanat
    // Melamin çerçevede kanat tek parça panel; alüminyumda çerçeve profili
    // (metraj) + içine dolgu/cam gelir.
    const camAdi = {
      seffaf: 'Şeffaf cam', kumlu: 'Kumlu (buzlu) cam',
      bronz_reflekte: 'Bronz reflekte cam', gumus_reflekte: 'Gümüş reflekte cam',
      nervurlu: 'Nervürlü cam', fume: 'Füme cam'
    };
    let surguluBilgi = null;
    if (kapakSistemi === 'surgulu') {
      const kanat = Math.max(2, +c.surguluKanat || 2);
      const bindirme = +c.surguluBindirme || 0;
      const kanatEn = (W + (kanat - 1) * bindirme) / kanat;
      // Sürgülü kanat, gövdenin önüne asılır; yüksekliği gövde boyudur
      const kanatBoy = govdeH - (c.surguluRaySistemi === 'ustten_asmali' ? 6 : 10);
      const camVar = c.camTipi && c.camTipi !== 'yok';
      const camYan = +c.camYanMesafe || 0;
      const camUst = +c.camUstMesafe || 0;
      const camEn = Math.max(0, kanatEn - 2 * camYan);
      const camBoy = (+c.camYukseklik > 0) ? +c.camYukseklik : Math.max(0, kanatBoy - camUst - camYan);

      if (c.surguluCerceve === 'melamin') {
        // Tek parça melamin kanat. Cam varsa panelden boşluk kesilir.
        ekle('Sürgülü kanat (melamin)', kanat, kanatEn, kanatBoy, 'surgulu_kanat', 'dort');
        if (camVar && camEn > 0 && camBoy > 0) {
          uyarilar.push('Melamin sürgülü kanatta cam için ' + yuvarla(camEn) + '×' + yuvarla(camBoy) +
            ' mm boşluk kesilecek — üstten ' + camUst + ' mm, yanlardan ' + camYan + ' mm');
        }
      } else {
        // Alüminyum çerçeve: dikey 2 + yatay 2 profil, metraj olarak hırdavatta
        const profilMetre = kanat * (2 * kanatBoy + 2 * kanatEn) / 1000;
        hirdavatBekleyen.push({ ad: 'Alüminyum sürgülü kapak profili', adet: Math.round(profilMetre * 10) / 10,
          birim: 'METRE', model: c.surguluProfilEn + ' mm profil · ' + kanat + ' kanat' });
        hirdavatBekleyen.push({ ad: 'Alüminyum çerçeve köşe bağlantısı', adet: kanat * 4, birim: 'ADET', model: '' });
        // Çerçeve içi dolgu paneli (cam yoksa melamin dolgu)
        if (!camVar) {
          const dolguEn = kanatEn - 2 * (+c.surguluProfilEn || 20);
          const dolguBoy = kanatBoy - 2 * (+c.surguluProfilEn || 20);
          ekle('Sürgülü kanat dolgu paneli', kanat, dolguEn, dolguBoy, 'surgulu_dolgu', '');
        }
      }

      if (camVar && camEn > 0 && camBoy > 0) {
        camlar.push({
          ad: camAdi[c.camTipi] || 'Cam', tip: c.camTipi,
          adet: kanat, en: yuvarla(camEn), boy: yuvarla(camBoy),
          kalinlik: +c.camKalinlik || 4,
          m2: Math.round((camEn * camBoy * kanat) / 1e6 * 1000) / 1000,
          konum: 'Kanat üstünden ' + camUst + ' mm, yanlardan ' + camYan + ' mm'
        });
      }
      // Ray sistemi ve kulp
      const rayAdi = c.surguluRaySistemi === 'alttan_tekerlekli'
        ? 'Sürgülü kapak alt tekerlekli ray takımı' : 'Sürgülü kapak üstten asmalı ray takımı';
      hirdavatBekleyen.push({ ad: rayAdi, adet: 1, birim: 'TAKIM', model: yuvarla(W) + ' mm · ' + kanat + ' kanat' });
      hirdavatBekleyen.push({ ad: 'Sürgülü kapak ray profili', adet: Math.round(W / 1000 * 2 * 10) / 10, birim: 'METRE', model: 'üst + alt' });
      if (c.kulpVar) hirdavatBekleyen.push({ ad: 'Sürgülü kapak kulbu', adet: kanat, birim: 'ADET', model: '' });

      surguluBilgi = { kanat, kanatEn: yuvarla(kanatEn), kanatBoy: yuvarla(kanatBoy), bindirme,
        cerceve: c.surguluCerceve, camVar, camEn: yuvarla(camEn), camBoy: yuvarla(camBoy),
        camUst, camYan, camTipi: c.camTipi };
      if (kanatEn > 1200) uyarilar.push('Sürgülü kanat eni ' + yuvarla(kanatEn) + ' mm — 1200 mm üstü kanatlarda ray taşıma kapasitesini kontrol edin');
    }

    // ── LED AYDINLATMA ───────────────────────────────────────────────────
    // Yan dikmelerde dikey, rafların altında yatay LED şerit. Metraj kanal
    // boyundan hesaplanır; profil ve trafo ayrıca eklenir.
    let ledMetre = 0;
    const ledRenkAdi = { gunisigi: 'Gün ışığı 3000K', ilikbeyaz: 'Ilık beyaz 4000K', beyaz: 'Beyaz 6500K', rgb: 'RGB' };
    if (c.ledYan) {
      const boy = (govdeH - 2 * t) / 1000;
      ledMetre += boy * 2;
      if (c.ledProfilVar) hirdavatBekleyen.push({ ad: 'LED alüminyum profil', adet: Math.round(boy * 2 * 10) / 10, birim: 'METRE', model: 'yan dikme · dikey' });
    }
    if (c.ledRaf) {
      let rafBoy = 0;
      bolmeYerlesim.forEach(b => { (b.raflar || []).forEach(() => { rafBoy += b.genislik / 1000; }); });
      ledMetre += rafBoy;
      if (rafBoy > 0 && c.ledProfilVar) hirdavatBekleyen.push({ ad: 'LED alüminyum profil', adet: Math.round(rafBoy * 10) / 10, birim: 'METRE', model: 'raf altı · yatay' });
    }
    if (ledMetre > 0) {
      hirdavatBekleyen.push({ ad: 'LED şerit', adet: Math.round(ledMetre * 10) / 10, birim: 'METRE',
        model: (ledRenkAdi[c.ledRenk] || c.ledRenk) + (c.ledYan && c.ledRaf ? ' · yan + raf' : c.ledYan ? ' · yan dikme' : ' · raf altı') });
      if (c.ledTrafoVar) {
        // 14.4 W/m kabulü, %20 emniyet payı ile trafo gücü
        const watt = Math.ceil(ledMetre * 14.4 * 1.2);
        hirdavatBekleyen.push({ ad: 'LED trafo', adet: 1, birim: 'ADET', model: watt + ' W (14,4 W/m · %20 pay)' });
        hirdavatBekleyen.push({ ad: 'LED bağlantı kablosu ve klips seti', adet: 1, birim: 'TAKIM', model: '' });
      }
    }

    // ── ÇEKMECELER ───────────────────────────────────────────────────────
    // Çekmece kutusu: 2 yan + 2 ön/arka + 1 alt (8mm). Ray yan boşluğu
    // markadan gelir. Çekmece kapağı ayrıca sayılır (iç/gizli çekmecede yok).
    const icDerinlik = D - (+c.arkalikArkadanMesafe || 0) - (c.arkalikTipi === 'kanalli' ? tb : 0);
    const rayBoy = rayBoyuSec(c.marka, icDerinlik);
    const MK = markaAl(c.marka);
    let toplamCekmece = 0;
    bolmeYerlesim.forEach((b) => {
      const adet = b.cekmeceSayisi || 0;
      if (!adet) return;
      toplamCekmece += adet;
      const et = cokBolmeli ? ' (Bölme ' + (b.index + 1) + ')' : '';
      const icGen = b.genislik - 2 * MK.rayYanBosluk;
      const kutuYuk = Math.max(60, b.cekmeceYukseklik - 60);
      if (c.cekmeceTipi !== 'ic' && c.cekmeceTipi !== 'gizli') {
        const kEn = c.kapakTipi === 'icerlek' ? b.genislik - 2 * f : b.genislik + t - f;
        ekle('Çekmece kapağı' + et, adet, kEn, b.cekmeceYukseklik - f, 'cekmece_kapak', 'dort');
      }
      ekle('Çekmece yan' + et, adet * 2, rayBoy, kutuYuk, 'cekmece', 'on');
      ekle('Çekmece ön-arka' + et, adet * 2, icGen - 2 * t, kutuYuk, 'cekmece', 'on');
      ekle('Çekmece alt' + et, adet, rayBoy - 10, icGen - 2 * t, 'cekmece_alt', '');
    });

    // ── ÜST KAYIT / PROFİL (tacın alternatifi) ───────────────────────────
    if (c.ustSistem === 'kayit_yatay' || c.ustSistem === 'kayit_dikey') {
      const boy = c.ustSistem === 'kayit_yatay' ? W - 2 * t : govdeH - 2 * t;
      ekle(c.ustSistem === 'kayit_yatay' ? 'Yatay kayıt' : 'Dikey kayıt',
        +c.kayitAdet || 1, boy, +c.kayitGenislik || 100, 'kayit', 'dort');
    }

    // ── TAÇ VE BAZA ──────────────────────────────────────────────────────
    if (c.ustTac) {
      if (tacKal > 0) {
        // Taç bir panel: derinliği verilmemişse gövde derinliği kadar
        const tacD = (+c.ustTacDerinlik > 0) ? +c.ustTacDerinlik : D;
        const aralarinaMi = c.ustTacKonum === 'aralarina';
        ekle('Üst taç (' + (aralarinaMi ? 'yanların arasına' : 'yanların üstüne') + ')',
          1, aralarinaMi ? W - 2 * t : W, tacD, 'ust_tac', aralarinaMi ? 'on' : 'dort', tacKal);
      } else {
        ekle('Üst taç', 1, W, +c.ustTacYukseklik, 'ust_tac', 'dort');
      }
    }
    if (c.altTac) ekle('Alt taç', 1, W - 2 * t, +c.altTacYukseklik, 'alt_tac', 'on');
    if (c.bazaTipi === 'baza') {
      ekle('Baza ön', 1, W, bazaY, 'baza', 'on');
      ekle('Baza arka', 1, W - 2 * t, bazaY, 'baza', '');
      ekle('Baza yan', 2, D - 2 * t, bazaY, 'baza', '');
    }

    // ── HIRDAVAT ─────────────────────────────────────────────────────────
    const hirdavat = [];
    // ad = generik ad (marka bağımsız eşleştirme için) · model = markaya özgü ürün
    // markasiz=true → kalem markaya bağlı değildir (askı borusu, kulp gibi);
    // model alanı yine ölçü/konum notu olarak kullanılır ama marka yazılmaz.
    const hEkle = (ad, adet, birim, model, markasiz) => {
      if (adet > 0) {
        const br = birim || 'ADET';
        // ADET/TAKIM tam sayıdır; METRE, M2, GRAM gibi sürekli birimlerde
        // tam sayıya yuvarlamak metrajı bozar (2 cm'lik bant farkı bile
        // kesim listesinde tutmaz) — bu yüzden 2 haneye yuvarlanır.
        const m = (br === 'ADET' || br === 'TAKIM') ? Math.round(adet) : Math.round(adet * 100) / 100;
        hirdavat.push({ ad, adet: m, birim: br, model: model || '', marka: (model && !markasiz) ? c.marka : '' });
      }
    };

    // Toplam kapak adedi (tek bölmede c.kapakSayisi, çok bölmelide bölmelerin toplamı)
    const toplamKapak = cokBolmeli ? bolmeYerlesim.reduce((s, b) => s + (b.kapakSayisi || 0), 0) : n;
    if (toplamKapak > 0) {
      const kapaklar = paneller.filter(p => p.rol === 'kapak');
      // Her kapak grubu kendi yüksekliğine göre menteşe alır
      const menteseToplam = kapaklar.reduce((s, p) => s + p.adet * menteseSayisi(p), 0);
      hEkle('Menteşe', menteseToplam, 'ADET', MK.mentese);
      hEkle('Menteşe tablası', menteseToplam, 'ADET', MK.menteseTablasi);
      // Kulp tipine göre hırdavat: klasik/alüminyum profilli tipler ayrı
      // parça gerektirir; kendinden/J/pah tipleri panelin kendisine
      // frezelenir (bkz. kulpNotu) — ayrı hırdavat kalemi YOK.
      if (c.kulpVar) {
        const kt = c.kulpTipi || 'klasik';
        if (kt === 'aluminyum_boy') {
          const metre = kapaklar.reduce((s, p) => s + p.adet * (p.netBoy / 1000), 0);
          hEkle('Alüminyum boy kulp profili', metre, 'METRE');
          hEkle('Boy kulp bağlantı vida takımı', toplamKapak, 'TAKIM');
        } else if (kt === 'aluminyum_j') {
          const metre = kapaklar.reduce((s, p) => s + p.adet * (p.netEn / 1000), 0);
          hEkle('Alüminyum J kulp profili', metre, 'METRE');
          hEkle('J kulp bağlantı vida takımı', toplamKapak, 'TAKIM');
        } else if (kt === 'klasik') {
          hEkle('Kulp', toplamKapak, 'ADET');
        }
        // kendinden / j_kendinden / j_cep / pah_45 → bkz. kulpNotu (panel adı)
      }
    }
    // Toplam hareketli raf (bölmeli/bölmesiz)
    const toplamHarRaf = cokBolmeli ? bolmeYerlesim.reduce((s, b) => s + (b.rafHareketli || 0), 0) : (+c.rafHareketli || 0);
    const toplamSabitRaf = cokBolmeli ? bolmeYerlesim.reduce((s, b) => s + (b.rafSabit || 0), 0) : (+c.rafSabit || 0);
    hEkle('Raf pimi', toplamHarRaf * 4, 'ADET', MK.rafPimi);
    // Gövde birleşimi: her köşe için minifix + dübel (yaklaşık) + ayraç başına 4
    const ayracAdedi = cokBolmeli ? bolmeYerlesim.length - 1 : 0;
    hEkle('Minifix takımı', 8 + toplamSabitRaf * 4 + ayracAdedi * 4, 'TAKIM', MK.minifix);
    hEkle('Ahşap dübel', 12 + toplamSabitRaf * 4 + ayracAdedi * 4, 'ADET', MK.dubel);
    if (c.arkalikTipi === 'sirtli') hEkle('Arkalık vidası', Math.ceil((2 * (W + govdeH)) / 150), 'ADET');
    if (c.bazaTipi === 'ayak') {
      const ayakAdet = c.ayakOtomatik ? otoAyakAdedi(W) : (+c.ayakAdet || 4);
      hEkle(ayakTipiAdi(c.ayakTipi), ayakAdet, 'ADET', (+c.ayakYukseklik || 0) ? (c.ayakYukseklik + ' mm ayarlı') : '');
      if (c.ayakOtomatik && ayakAdet > 4) uyarilar.push('Genişlik ' + W + ' mm — ayak adedi otomatik ' + ayakAdet + "'e çıkarıldı");
    }
    // Sürgülü kapak / LED gibi daha önce hesaplanmış kalemleri aktar
    hirdavatBekleyen.forEach(x => hEkle(x.ad, x.adet, x.birim, x.model, true));

    // ── ASKI BORUSU ──────────────────────────────────────────────────────
    // Rafın ALTINA askı borusu istenmişse, o bölmenin genişliği kadar boru +
    // iki uç flanşı eklenir. Boru bir plaka parçası değildir; hırdavattır.
    let askiBoruAdedi = 0;
    bolmeYerlesim.forEach((b) => {
      (b.raflar || []).forEach((r, ri) => {
        if (!r.askiBorusu) return;
        askiBoruAdedi++;
        const boruBoy = yuvarla(b.genislik - 4);   // her yandan 2 mm montaj payı
        const et = (cokBolmeli ? 'Bölme ' + (b.index + 1) + ' · ' : '') + (ri + 1) + '. rafın altı';
        hEkle('Askı borusu', 1, 'ADET', boruBoy + ' mm · ' + et, true);
        hEkle('Askı borusu flanşı', 2, 'ADET', et, true);
      });
    });

    // Çekmece rayları — boy gövde derinliğinden otomatik seçilir
    if (toplamCekmece > 0) hEkle('Çekmece rayı', toplamCekmece, 'TAKIM', MK.ray + ' · ' + rayBoy + ' mm');
    // Üstten açılır kapak varsa kaldırma sistemi
    if (c.ustAcilirKapak) hEkle('Kaldırma sistemi', toplamKapak || 1, 'TAKIM', MK.kaldirma);
    // Metal/alüminyum profil kayıt — plaka değil, hırdavattır
    if (c.ustSistem === 'profil_metal' || c.ustSistem === 'profil_aluminyum') {
      hEkle(c.ustSistem === 'profil_metal' ? 'Metal profil kayıt' : 'Alüminyum profil kayıt',
        +c.kayitAdet || 1, 'ADET', (W - 2 * t) + ' mm boy · ' + (+c.kayitGenislik || 100) + ' mm en');
    }

    // ── DELİK PLANI (CNC) ────────────────────────────────────────────────
    // Koordinatlar panelin sol-üst köşesine göredir. X = panel boyunca
    // (yan panelde ön kenardan), Y = yükseklik. Raf pimleri markanın delik
    // sistemine (32 mm) oturtulur.
    const delikler = [];
    if (c.delikPlani) {
      const dl = (parca, x, y, cap, derinlik, tip) => delikler.push({
        parca, x: yuvarla(x), y: yuvarla(y), cap, derinlik, tip
      });
      const yanlar = ['Sol yan', 'Sağ yan'];
      // Üst/alt tabla gövde bağlantısı: ön ve arkadan 50 mm
      [50, D - 50].forEach(xx => {
        [t / 2, govdeH - t / 2].forEach(yy => {
          yanlar.forEach(p => dl(p, xx, yy, MK.minifixCap, MK.minifixDerinlik, 'Gövde bağlantısı (eksantrik)'));
        });
      });
      // Raf pimleri — her bölmenin hareketli rafları için, 32 mm kademeye oturur
      bolmeYerlesim.forEach(b => {
        for (let r = 1; r <= (b.rafHareketli || 0); r++) {
          const ham = b.y + (b.yukseklik * r) / ((b.rafHareketli || 0) + 1);
          const kademe = Math.round((ham - t) / MK.delikSistem) * MK.delikSistem + t;
          [MK.kenardanIlk, rafDerinlik - MK.kenardanIlk].forEach(xx => {
            if (xx <= 0) return;
            const et = cokBolmeli ? 'Bölme ' + (b.index + 1) + ' raf pimi' : 'Raf pimi';
            // Tek bölmede iki yan panele; çok bölmede ayrıca ayraç yüzeylerine
            yanlar.forEach(p => dl(p, xx, kademe, MK.pimCap, MK.pimDerinlik, et));
            if (cokBolmeli) dl('Dikey ayraç', xx, kademe, MK.pimCap, MK.pimDerinlik, et);
          });
        }
        // Menteşe tablası delikleri — kapak yüksekliğine göre dağıtılır
        if (b.kapakSayisi) {
          const kh = b.yukseklik - (b.cekmeceSayisi || 0) * (b.cekmeceYukseklik || 0);
          const ma = kh <= 900 ? 2 : kh <= 1600 ? 3 : kh <= 2000 ? 4 : 5;
          for (let i = 0; i < ma; i++) {
            const my = b.y + (ma === 1 ? kh / 2 : 100 + (kh - 200) * i / (ma - 1));
            yanlar.forEach(p => dl(p, MK.kenardanIlk, my, MK.pimCap, MK.pimDerinlik, 'Menteşe tablası'));
          }
          // Kapağın kendi kap deliği (Ø35) — kenardan kapKenarMesafe
          const kh2 = kh, ma2 = kh2 <= 900 ? 2 : kh2 <= 1600 ? 3 : kh2 <= 2000 ? 4 : 5;
          for (let i = 0; i < ma2; i++) {
            const my = ma2 === 1 ? kh2 / 2 : 100 + (kh2 - 200) * i / (ma2 - 1);
            dl('Kapak', 22.5, my, MK.kapCap, MK.kapDerinlik, 'Menteşe kap deliği');
          }
        }
        // Çekmece rayı delikleri
        for (let i = 0; i < (b.cekmeceSayisi || 0); i++) {
          const ry = b.y + b.yukseklik - (b.cekmeceSayisi - i) * b.cekmeceYukseklik + 30;
          [MK.kenardanIlk, MK.kenardanIlk + MK.delikSistem * 8].forEach(xx => {
            if (xx >= rafDerinlik) return;
            yanlar.forEach(p => dl(p, xx, ry, MK.pimCap, MK.pimDerinlik, 'Çekmece rayı ' + (i + 1)));
          });
        }
      });
    }

    // Arkalık arkadan mesafesi kanal derinliğinden küçükse kanal dışarı çıkar
    if (c.arkalikTipi === 'kanalli' && +c.arkalikArkadanMesafe > 0 &&
        +c.arkalikArkadanMesafe < (+c.kanalDerinlik || 0) + 2) {
      uyarilar.push('Arkalık arkadan mesafesi kanal derinliğinden küçük — kanal yan panelin arka kenarını deler. En az ' +
        ((+c.kanalDerinlik || 0) + 2) + ' mm önerilir');
    }

    // ── ÖZET ─────────────────────────────────────────────────────────────
    const toplamAlanM2 = paneller.reduce((s, p) => s + (p.netEn * p.netBoy * p.adet) / 1e6, 0);
    const toplamKabaM2 = paneller.reduce((s, p) => s + (p.kabaEn * p.kabaBoy * p.adet) / 1e6, 0);
    const toplamBantM = paneller.reduce((s, p) => s + p.bantMetre, 0);
    const parcaAdedi = paneller.reduce((s, p) => s + p.adet, 0);

    return {
      paneller, hirdavat, uyarilar, delikler, bolmeler: bolmeYerlesim,
      camlar, surgulu: surguluBilgi,
      ozet: {
        parcaAdedi,
        netAlanM2: yuvarla(toplamAlanM2 * 100) / 100,
        kabaAlanM2: yuvarla(toplamKabaM2 * 100) / 100,
        fireYuzde: toplamKabaM2 > 0 ? yuvarla(((toplamKabaM2 - toplamAlanM2) / toplamKabaM2) * 100) : 0,
        bantMetre: yuvarla(toplamBantM),
        govdeYukseklik: yuvarla(govdeH),
        toplamYukseklik: yuvarla(H + (c.bazaTipi === 'ayak' ? (+c.ayakYukseklik || 0) : 0)),
        icDerinlik: yuvarla(icDerinlik),
        rayBoy, delikAdedi: delikler.length, bolmeAdedi: bolmeYerlesim.length,
        askiBoruAdedi, tacKalinlik: tacKal, tacKonum: c.ustTacKonum,
        kapakSistemi, ledMetre: Math.round(ledMetre * 1000) / 1000,
        camM2: Math.round(camlar.reduce((a, x) => a + x.m2, 0) * 1000) / 1000
      },
      yapilandirma: c
    };
  }

  // Bir bölmenin raf listesini çözer.
  //   kaynak.raflar doluysa: manuel konumlar (bölme üstünden mm) esas alınır.
  //   boşsa: rafSabit + rafHareketli sayıları bölme yüksekliğine eşit dağıtılır.
  // Dönen her öğe: { konum, tip:'sabit'|'hareketli', askiBorusu }
  function rafListesi(kaynak, icYukseklik) {
    if (Array.isArray(kaynak.raflar) && kaynak.raflar.length) {
      return kaynak.raflar
        .filter(r => r && +r.konum > 0)
        .map(r => ({
          konum: yuvarla(+r.konum),
          tip: r.tip === 'sabit' ? 'sabit' : 'hareketli',
          askiBorusu: !!r.askiBorusu
        }))
        .sort((a, b) => a.konum - b.konum);
    }
    const s2 = Math.max(0, +kaynak.rafSabit || 0), h2 = Math.max(0, +kaynak.rafHareketli || 0);
    const n = s2 + h2, liste = [];
    for (let i = 1; i <= n; i++) {
      liste.push({
        konum: yuvarla(icYukseklik * i / (n + 1)),
        tip: i <= s2 ? 'sabit' : 'hareketli',
        askiBorusu: false
      });
    }
    return liste;
  }

  // Kapak yüksekliğine göre menteşe sayısı (Blum kılavuzu):
  //   ≤900:2 · ≤1600:3 · ≤2000:4 · üstü:5
  function menteseSayisi(kapak) {
    if (!kapak) return 2;
    const h = kapak.netBoy;
    if (h <= 900) return 2;
    if (h <= 1600) return 3;
    if (h <= 2000) return 4;
    return 5;
  }

  // Kenar bandı ATANMIŞ kenarların toplam uzunluğu (mm).
  // Kenar→ölçü eşlemesi uygulamanın geri kalanıyla birebir aynıdır
  // (app.js kenarBandiMaliyetHesapla): ön/arka → NET BOY, sağ/sol → NET EN.
  // Böylece burada gösterilen metraj ile reçetedeki maliyet çakışmaz.
  function bantUzunlukIds(ids, en, boy) {
    if (!ids) return 0;
    let m = 0;
    if (ids.on) m += boy;
    if (ids.arka) m += boy;
    if (ids.sag) m += en;
    if (ids.sol) m += en;
    return m;
  }

  // Bantlanan kenarların toplam uzunluğu (mm)
  function bantUzunluk(bantlar, en, boy) {
    if (!bantlar) return 0;
    if (bantlar === 'dort') return 2 * (en + boy);
    if (bantlar === 'on') return en;              // yalnız ön kenar
    if (bantlar === 'on_arka') return 2 * en;
    if (bantlar === 'uc') return en + 2 * boy;
    return 0;
  }

  const kapakTipiAdi = (t) => ({ tam_bini: 'tam bini', yarim_bini: 'yarım bini', icerlek: 'içerlek' })[t] || t;
  const ayakTipiAdi = (t) => ({
    plastik_ayak: 'Plastik ayak', metal_ayak: 'Metal ayak',
    gizli_ayak: 'Gizli ayak', ahsap_ayak: 'Ahşap ayak'
  })[t] || 'Ayak';

  // Kulp tipi: piyasada bilinen "handleless"/profil kulp çeşitleri.
  //   klasik        → vidalı, ayrı hırdavat kulp (eski/varsayılan davranış)
  //   kendinden     → kapağın kendi kenarına frezelenen tutamak, ayrı hırdavat yok
  //   aluminyum_boy → kapak boyunca (dikey) tam boy alüminyum profil kulp — ayrı
  //                   hırdavat: metre bazlı profil + bağlantı vida takımı
  //   aluminyum_j   → üst kenara monte J-profil alüminyum kulp (Gola/J-pull
  //                   sisteminin alüminyumlu varyantı) — metre bazlı profil
  //   j_kendinden   → J-pull: üst kenara doğrudan frezelenen J oyuğu, ayrı
  //                   hırdavat yok (CNC/freze notu panel adına eklenir)
  //   j_cep         → gizli cep kulp: panelin arka yüzüne frezelenen, önden
  //                   görünmeyen J oyuğu (Gola sisteminin "gömme" hali)
  //   pah_45        → üst kenarı 45° pahlanarak oluşturulan parmak boşluğu
  const KULP_TIPI_ADI = {
    klasik: 'Klasik kulp', kendinden: 'Kendinden kulp', aluminyum_boy: 'Alüminyum boy kulp',
    aluminyum_j: 'Alüminyum J kulp', j_kendinden: 'J kendinden kulp', j_cep: 'J cep kulp (gizli)',
    pah_45: '45° pahlı kulp'
  };
  const kulpTipiAdi = (t) => KULP_TIPI_ADI[t] || 'Kulp';
  // Ekstra hırdavat gerektirmeyen, panelin kendisine CNC ile işlenen kulp
  // tipleri — kapak panelinin `ad` alanına üretim notu olarak eklenir.
  const KULP_FREZE_NOTU = {
    kendinden: 'kendinden kulp — kenara frezeli',
    j_kendinden: 'J kendinden kulp — üst kenara frezeli',
    j_cep: 'J cep kulp — arka yüze gizli cep freze',
    pah_45: '45° pahlı kulp — üst kenar pah'
  };

  return { hesapla, VARSAYILAN, menteseSayisi, bantUzunluk, bantUzunlukIds, kapakTipiAdi, ayakTipiAdi,
           kulpTipiAdi, MARKALAR, markaAl, rayBoyuSec, otoAyakAdedi, rafListesi };
})();

// Node ortamında (test) dışa aktar
if (typeof module !== 'undefined' && module.exports) module.exports = DolapHesap;
