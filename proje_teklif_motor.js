// ════════════════════════════════════════════════════════════════════════════
// PROJE TEKLİF MOTORU — Mahal Bazlı Teklif, İskonto ve Maliyet Kırılımı
// ────────────────────────────────────────────────────────────────────────────
// Proje teklifi standart tekliften farklıdır: kalemler MAHAL (mekân/oda)
// altında gruplanır. Bir otel projesinde "Standart Oda ×80", "Suit ×12",
// "Lobi ×1" gibi mahaller olur; her mahalin kendi malzeme listesi vardır ve
// mahal adedi kadar çarpılır.
//
// İKİ AYRI ÇIKTI ÜRETİR:
//   1) MÜŞTERİ TEKLİFİ  → liste fiyatı, iskonto, net tutar (maliyet GÖRÜNMEZ)
//   2) YÖNETİM RAPORU   → hammadde + rota (işçilik) + ek gider kırılımı, kâr marjı
//
// Bu ayrım kasıtlıdır: maliyet bilgisi müşteriye giden belgede asla yer almamalı.
// ════════════════════════════════════════════════════════════════════════════
const ProjeTeklifMotor = (() => {

  // ── MAHAL HESABI ─────────────────────────────────────────────────────────
  // Bir mahalin toplamı = (kalemlerin net toplamı) × mahal adedi
  function mahalHesapla(mahal) {
    const kalemler = (mahal && mahal.kalemler) || [];
    const adet = Math.max(1, +((mahal || {}).adet) || 1);
    let listeToplam = 0, netToplam = 0;
    const detay = kalemler.map(k => {
      const liste = (+k.listeFiyati || 0) * (+k.miktar || 0);
      const isk = Math.min(100, Math.max(0, +k.iskontoYuzde || 0));
      const net = liste * (1 - isk / 100);
      listeToplam += liste;
      netToplam += net;
      return { ...k, satirListe: liste, satirNet: Math.round(net * 100) / 100 };
    });
    return {
      adet, detay,
      birimListe: Math.round(listeToplam * 100) / 100,
      birimNet: Math.round(netToplam * 100) / 100,
      toplamListe: Math.round(listeToplam * adet * 100) / 100,
      toplamNet: Math.round(netToplam * adet * 100) / 100
    };
  }

  // ── TEKLİF TOPLAMI ───────────────────────────────────────────────────────
  // Sıra: satır iskontoları (mahal içinde) → mahal toplamları → DİP iskonto
  // → ek giderlerin müşteriye yansıyan kısmı → KDV
  function teklifHesapla(teklif) {
    const mahaller = (teklif.mahaller || []).map(mahalHesapla);
    const araToplamListe = mahaller.reduce((a, m) => a + m.toplamListe, 0);
    const araToplamNet = mahaller.reduce((a, m) => a + m.toplamNet, 0);

    const dipIsk = Math.min(100, Math.max(0, +teklif.dipIskonto || 0));
    const dipTutar = araToplamNet * dipIsk / 100;
    const iskontoluToplam = araToplamNet - dipTutar;

    // Ek giderler: yalnızca "müşteriye yansıt" işaretli olanlar teklife eklenir
    const ekler = (teklif.ekGiderler || []);
    const yansiyan = ekler.filter(g => g.musteriyeYansit)
      .reduce((a, g) => a + (+g.tutar || 0), 0);
    const icGider = ekler.reduce((a, g) => a + (+g.tutar || 0), 0);

    const kdvOran = +teklif.kdvOrani || 20;
    const matrah = iskontoluToplam + yansiyan;
    const kdv = matrah * kdvOran / 100;

    return {
      mahaller,
      araToplamListe: Math.round(araToplamListe * 100) / 100,
      araToplamNet: Math.round(araToplamNet * 100) / 100,
      satirIskontoToplam: Math.round((araToplamListe - araToplamNet) * 100) / 100,
      dipIskontoOran: dipIsk,
      dipIskontoTutar: Math.round(dipTutar * 100) / 100,
      iskontoluToplam: Math.round(iskontoluToplam * 100) / 100,
      yansiyanGider: Math.round(yansiyan * 100) / 100,
      icGiderToplam: Math.round(icGider * 100) / 100,
      matrah: Math.round(matrah * 100) / 100,
      kdv: Math.round(kdv * 100) / 100,
      genelToplam: Math.round((matrah + kdv) * 100) / 100
    };
  }

  // ── MALİYET KIRILIMI (yönetim raporu) ────────────────────────────────────
  // Her kalemin maliyeti üç bileşenden gelir:
  //   hammadde (reçeteden) + rota/işçilik (rotadan) + ek giderler (elle)
  // Maliyeti bilinmeyen kalemler AYRI raporlanır — sıfır saymak, kârı olduğundan
  // yüksek gösterir ve en tehlikeli hatadır.
  function maliyetKirilimi(teklif, maliyetSozlugu) {
    const soz = maliyetSozlugu || {};
    let hammadde = 0, rota = 0, amortisman = 0, gygGider = 0, bilinmeyenAdet = 0;
    const bilinmeyenler = [];

    (teklif.mahaller || []).forEach(m => {
      const adet = Math.max(1, +m.adet || 1);
      (m.kalemler || []).forEach(k => {
        const mm = soz[k.urunId || k.kod];
        const miktar = (+k.miktar || 0) * adet;
        if (!mm) {
          bilinmeyenAdet++;
          bilinmeyenler.push({ mahal: m.ad, kalem: k.ad, miktar });
          return;
        }
        hammadde += (+mm.hammadde || 0) * miktar;
        rota += (+mm.rota || 0) * miktar;
        amortisman += (+mm.amortisman || 0) * miktar;
        gygGider += (+mm.gyg || 0) * miktar;
      });
    });

    const ekGider = (teklif.ekGiderler || []).reduce((a, g) => a + (+g.tutar || 0), 0);
    const toplam = hammadde + rota + amortisman + gygGider + ekGider;
    const h = teklifHesapla(teklif);
    const gelir = h.iskontoluToplam + h.yansiyanGider;   // KDV hariç net gelir
    const kar = gelir - toplam;

    return {
      hammadde: Math.round(hammadde * 100) / 100,
      rota: Math.round(rota * 100) / 100,
      amortisman: Math.round(amortisman * 100) / 100,
      gygGider: Math.round(gygGider * 100) / 100,
      ekGider: Math.round(ekGider * 100) / 100,
      toplam: Math.round(toplam * 100) / 100,
      gelir: Math.round(gelir * 100) / 100,
      kar: Math.round(kar * 100) / 100,
      marj: gelir ? Math.round(kar / gelir * 1000) / 10 : null,
      bilinmeyenAdet, bilinmeyenler,
      guvenilir: bilinmeyenAdet === 0
    };
  }

  // ── MAHAL KOPYALA / TAŞI ─────────────────────────────────────────────────
  // Otel projelerinde mahaller birbirine benzer; kopyalama en çok kullanılan
  // işlemdir. Kopyada kalemler DERİN kopyalanır — aksi halde iki mahal aynı
  // kalem nesnesini paylaşır ve birini düzenleyince diğeri de değişir.
  function mahalKopyala(mahal, yeniAd) {
    return {
      id: App.uid('MHL'),
      ad: yeniAd || (mahal.ad + ' (kopya)'),
      adet: mahal.adet || 1,
      aciklama: mahal.aciklama || '',
      kalemler: (mahal.kalemler || []).map(k => ({ ...k, id: App.uid('MK') }))
    };
  }

  // Kalemi bir mahalden diğerine taşır (kaynak listeden çıkarır)
  function kalemTasi(teklif, kaynakMahalId, kalemId, hedefMahalId) {
    if (kaynakMahalId === hedefMahalId) return { ok: false, hata: 'Kalem zaten bu mahalde.' };
    const kaynak = (teklif.mahaller || []).find(m => m.id === kaynakMahalId);
    const hedef = (teklif.mahaller || []).find(m => m.id === hedefMahalId);
    if (!kaynak || !hedef) return { ok: false, hata: 'Mahal bulunamadı.' };
    const i = (kaynak.kalemler || []).findIndex(k => k.id === kalemId);
    if (i < 0) return { ok: false, hata: 'Kalem bulunamadı.' };
    const [k] = kaynak.kalemler.splice(i, 1);
    hedef.kalemler = hedef.kalemler || [];
    hedef.kalemler.push(k);
    return { ok: true, kalem: k };
  }

  // ── MAHAL LİSTESİ ÇIKARIMI (metin/PDF'ten) ───────────────────────────────
  // DWG/PDF'ten OTOMATİK mahal çıkarımı güvenilir değildir: çizim katmanları
  // ve yazı biçimleri her ofiste farklıdır. Bu fonksiyon, kopyalanan METİN
  // içinden mahal adı + adet örüntülerini yakalar ve kullanıcıya ÖNERİ sunar.
  // Sonuç mutlaka gözden geçirilmelidir — bu yüzden "öneri" olarak döner.
  function mahalListesiCikar(metin) {
    const satirlar = String(metin || '').split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
    const oneriler = [];
    const gorulen = new Set();
    satirlar.forEach(s => {
      // Kalıplar: "Standart Oda x80" · "80 adet Suit" · "Lobi (1)" · "A-101 Standart Oda"
      let m = s.match(/^(.+?)\s*[x×*]\s*(\d{1,4})\s*$/i)
        || s.match(/^(\d{1,4})\s*(?:adet|ad\.?)\s+(.+)$/i)
        || s.match(/^(.+?)\s*\(\s*(\d{1,4})\s*\)\s*$/);
      if (!m) return;
      let ad, adet;
      if (/^\d/.test(m[1])) { adet = +m[1]; ad = m[2]; } else { ad = m[1]; adet = +m[2]; }
      ad = ad.replace(/[:\-–]\s*$/, '').trim();
      if (!ad || ad.length < 2 || adet < 1 || adet > 9999) return;
      const anahtar = ad.toLocaleLowerCase('tr');
      if (gorulen.has(anahtar)) {
        const v = oneriler.find(o => o.ad.toLocaleLowerCase('tr') === anahtar);
        if (v) v.adet += adet;
        return;
      }
      gorulen.add(anahtar);
      oneriler.push({ ad, adet, kaynakSatir: s });
    });
    return oneriler;
  }

  async function teklifOlustur(projeId, { ad, kdvOrani }) {
    const liste = await Store.projeler.all();
    const p = liste.find(x => x.id === projeId);
    if (!p) return { ok: false, hata: 'Proje bulunamadı.' };
    const t = {
      id: App.uid('PTK'),
      kod: 'PTK-' + Date.now().toString(36).toUpperCase(),
      projeId, ad: (ad || (p.ad + ' Teklifi')).trim(),
      mahaller: [], ekGiderler: [],
      dipIskonto: 0, kdvOrani: +kdvOrani || 20,
      durum: 'taslak',
      olusturan: App.aktifRol ? App.aktifRol() : '',
      olusturmaTarihi: new Date().toISOString()
    };
    p.teklifler = p.teklifler || [];
    p.teklifler.push(t);
    await App.persist(() => Store.topluGuncelle('projeler', [p], 1));
    return { ok: true, teklif: t, proje: p };
  }

  // ── SİPARİŞE DÖNÜŞTÜR ────────────────────────────────────────────────────
  // Mahaller düzleştirilip sipariş kalemlerine çevrilir: her kalemin miktarı
  // mahal adediyle çarpılır. Aynı ürün birden çok mahalde geçiyorsa AYRI satır
  // kalır — hangi mahale ait olduğu üretimde ve sevkiyatta gereklidir.
  function siparisKalemleriUret(teklif) {
    const kalemler = [];
    (teklif.mahaller || []).forEach(m => {
      const adet = Math.max(1, +m.adet || 1);
      (m.kalemler || []).forEach(k => {
        const isk = Math.min(100, Math.max(0, +k.iskontoYuzde || 0));
        const birimNet = (+k.listeFiyati || 0) * (1 - isk / 100);
        // ALAN ADLARI STANDART SİPARİŞ KALEMİYLE AYNI OLMALI.
        // Üretim planlama ekranı üretilebilir kalemleri `grup === 'urun'`
        // ile ayırır; `grup` yoksa kalem hiç görünmez, iş emri açılmaz ve
        // hat ekranına düşmez. `netFiyat` da maliyet/fiyat hesaplarında okunur.
        kalemler.push({
          urunId: k.urunId || null, kod: k.kod || '', ad: k.ad,
          // Katalog ürünü ise 'urun', katalog dışı serbest kalem ise 'hammadde'
          // sayılır (üretim kuyruğuna girmez, satın alma/montaj kalemidir).
          grup: k.urunId ? 'urun' : (k.grup || 'hammadde'),
          mahal: m.ad, mahalId: m.id,
          miktar: (+k.miktar || 0) * adet,
          birim: k.birim || 'ADET',
          listeFiyati: +k.listeFiyati || 0,
          iskontoYuzde: isk,
          birimFiyat: Math.round(birimNet * 100) / 100,
          netFiyat: Math.round(birimNet * 100) / 100,
          tutar: Math.round(birimNet * (+k.miktar || 0) * adet * 100) / 100,
          ikinciKalite: false
        });
      });
    });
    return kalemler;
  }

  return {
    mahalHesapla, teklifHesapla, maliyetKirilimi, siparisKalemleriUret,
    mahalKopyala, kalemTasi, mahalListesiCikar, teklifOlustur
  };
})();

if (typeof module !== 'undefined') module.exports = ProjeTeklifMotor;
