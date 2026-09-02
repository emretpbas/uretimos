// ════════════════════════════════════════════════════════════════════════════
// HAMMADDE İÇ TUTARLILIK TARAMASI — anahtarsız, tamamen yerel (istemci içi)
// ────────────────────────────────────────────────────────────────────────────
// piyasa_fiyat_ai.php'deki kur/piyasa katmanlarının aksine bu, hiçbir dış
// servise (TCMB/Google) İHTİYAÇ DUYMAZ — sistemin KENDİ hammadde listesini
// kendi içinde karşılaştırır. Gerçek örnek: "DÖŞEMELİK DERİ LİZBON 02/11/12"
// üç ürün de ₺221,79 civarı olması gerekirken ikisi ₺221.792,00 görünüyordu
// — klasik bir ONDALIK/BASAMAK veri girişi hatası (~1000 kat fark).
//
// İKİ BAĞIMSIZ GRUPLAMA sinyali birleştirilir (biri yakalayamazsa diğeri
// yakalar):
//   1) STOK KODU AİLESİ — kodun SON noktalı bölümü atılır: "57.19.058" ve
//      "57.19.041" aynı "57.19" ailesinde sayılır. Bu şirketin hiyerarşik kod
//      yapısında İSİMDEN çok daha güçlü bir sinyal — "TOZ BOYA ASTAR" ile
//      "TOZ BOYA SON KAT" isim olarak alakasız görünür ama "50.025.10.001.22"
//      / ".23" aynı ürün ailesindedir.
//   2) AD (İSİM) AİLESİ — sondaki değişken kısım (sayı/varyant) atılır:
//      "LİZBON 02" → "LİZBON". Kod yapısı olmayan/karışık kartlar için yedek.
//
// Her grupta (≥3 üye) medyan TL fiyat hesaplanır; medyandan ORAN_ESIGI kat
// (varsayılan 5×) uzak olan üyeler anomali sayılır. Oran 10/100/1000'e
// yakınsa ("~1000 kat fark" gibi) açıklamada ayrıca ONDALIK HATASI ihtimali
// vurgulanır — bu, en yaygın gerçek hata türü.
// ════════════════════════════════════════════════════════════════════════════
const HammaddeTutarlilikMotor = (() => {

  function dvzTuru(dvz) {
    if (dvz === 'USD' || dvz === '$') return 'USD';
    if (dvz === 'EUR' || dvz === '€') return 'EUR';
    return null;
  }

  function birimFiyatTL(h, ayarlar) {
    const birimFiyat = Number(h.birimFiyat) || 0;
    if (birimFiyat <= 0) return 0;
    const tur = dvzTuru(h.dvz);
    if (tur === 'USD') return birimFiyat * (Number(ayarlar && ayarlar.usdTry) || 0);
    if (tur === 'EUR') return birimFiyat * (Number(ayarlar && ayarlar.eurTry) || 0);
    return birimFiyat;
  }

  // "57.19.058" → "57.19" (son noktalı bölüm atılır). Noktasız/tek parçalı
  // kodlarda (gruplanamaz) boş döner.
  function kodAilesi(kod) {
    const s = String(kod || '').trim();
    const i = s.lastIndexOf('.');
    return i > 0 ? s.slice(0, i) : '';
  }

  // "DÖŞEMELİK DERİ LİZBON 02" → "DÖŞEMELİK DERİ LİZBON" (sondaki sayı/varyant
  // token'ı atılır — yalnızca TEK bir son kelime, ürün adının gövdesine
  // dokunulmaz).
  function adAilesi(ad) {
    const s = String(ad || '').trim();
    const atilmis = s.replace(/\s+[\wÇĞİÖŞÜçğıöşü]{1,6}$/u, '');
    return (atilmis || s).toUpperCase();
  }

  function medyanHesapla(degerler) {
    const s = [...degerler].sort((a, b) => a - b);
    const n = s.length;
    return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  function ondalikHatasiIpucu(oran) {
    for (const kat of [10, 100, 1000, 10000]) {
      if (Math.abs(oran - kat) / kat < 0.05) return ` (yaklaşık ${kat} kat — muhtemelen ondalık/basamak hatası)`;
    }
    return '';
  }

  // Bir gruplama fonksiyonuna göre kartları kümeler, her kümede (≥3 üye)
  // medyandan oranEsigi kat uzak olanları anomali olarak toplar.
  function grupTara(hammaddeler, ayarlar, anahtarFn, oranEsigi) {
    const gruplar = {};
    hammaddeler.forEach(h => {
      const tl = birimFiyatTL(h, ayarlar);
      if (tl <= 0) return;
      const anahtar = anahtarFn(h);
      if (!anahtar) return;
      (gruplar[anahtar] = gruplar[anahtar] || []).push({ hammadde: h, tl });
    });
    const sonuc = [];
    Object.values(gruplar).forEach(uyeler => {
      if (uyeler.length < 3) return;

      // ÖNCE İKİLİ ONDALIK/BASAMAK EŞLEŞMESİ ARANIR (10/100/1000/10000 katı).
      // NEDEN medyandan ÖNCE: eğer bir ailede aynı hatalı değer YANLIŞLIKLA
      // birden fazla karta kopyalanmışsa (ör. iki kart da 221.792,00 TL,
      // yalnızca biri doğru 221,79 TL), medyan o hatalı ÇOĞUNLUĞA kayar ve
      // DOĞRU karta "hatalı" deyip onu çoğunluğa göre şişirmeyi önerir —
      // yön TERSİNE döner. İkili eşleşme her ÇİFTİ ayrı ayrı karşılaştırdığı
      // için çoğunluk/azınlık durumundan etkilenmez: iki kart arasında net
      // bir ~1000 kat fark varsa BÜYÜK olan (gerçek dünya veri girişi
      // hatalarının neredeyse tamamı sayı büyütür, küçültmez) işaretlenir.
      const ondalikEslesen = new Map(); // hammaddeId -> {dogruTL, kat, oran}
      for (let i = 0; i < uyeler.length; i++) {
        for (let j = 0; j < uyeler.length; j++) {
          if (i === j || uyeler[i].tl <= uyeler[j].tl) continue;
          const oran = uyeler[i].tl / uyeler[j].tl;
          for (const kat of [10, 100, 1000, 10000]) {
            if (Math.abs(oran - kat) / kat >= 0.15) continue;
            const id = uyeler[i].hammadde.id;
            const mevcut = ondalikEslesen.get(id);
            if (!mevcut || Math.abs(oran - kat) < Math.abs(mevcut.oran - mevcut.kat)) {
              ondalikEslesen.set(id, { dogruTL: uyeler[j].tl, kat, oran });
            }
            break;
          }
        }
      }
      if (ondalikEslesen.size) {
        ondalikEslesen.forEach((bilgi, id) => {
          const u = uyeler.find(x => x.hammadde.id === id);
          const h = u.hammadde;
          sonuc.push({
            hammaddeId: h.id || '', stokKodu: h.stokKodu || '', ad: h.ad || '',
            tur: 'ic_tutarlilik',
            sistemFiyatTL: Math.round(u.tl * 100) / 100,
            guncelFiyatTL: Math.round(bilgi.dogruTL * 100) / 100,
            sapmaYuzde: Math.round(((bilgi.dogruTL - u.tl) / u.tl) * 1000) / 10,
            aciklama: `Aynı ürün ailesindeki bir kalemle (${bilgi.dogruTL.toFixed(2)} TL) karşılaştırıldığında `
              + `${bilgi.oran.toFixed(1)} kat fark var (yaklaşık ${bilgi.kat} kat — muhtemelen ondalık/basamak hatası).`,
            kaynak: ''
          });
        });
        return; // bu grup için medyan yöntemine gerek yok
      }

      // İkili ondalık eşleşmesi bulunamadıysa (net bir 10'un kuvveti yok)
      // eski medyan yöntemine düş — bu, çoğunluğun DOĞRU olduğu (yalnızca
      // tek bir kalemin sapmış olduğu) çok daha yaygın durumda güvenilirdir.
      const medyan = medyanHesapla(uyeler.map(u => u.tl));
      if (medyan <= 0) return;
      uyeler.forEach(u => {
        const oran = u.tl / medyan;
        const buyukOran = Math.max(oran, 1 / oran);
        if (buyukOran < oranEsigi) return;
        const h = u.hammadde;
        sonuc.push({
          hammaddeId: h.id || '', stokKodu: h.stokKodu || '', ad: h.ad || '',
          tur: 'ic_tutarlilik',
          sistemFiyatTL: Math.round(u.tl * 100) / 100,
          guncelFiyatTL: Math.round(medyan * 100) / 100,
          sapmaYuzde: Math.round(((medyan - u.tl) / u.tl) * 1000) / 10,
          aciklama: `Aynı ürün ailesindeki ${uyeler.length} benzer kalemin medyan fiyatı `
            + `${medyan.toFixed(2)} TL — bu kalem ${u.tl.toFixed(2)} TL, ${buyukOran.toFixed(1)} kat fark`
            + ondalikHatasiIpucu(buyukOran) + '.',
          kaynak: ''
        });
      });
    });
    return sonuc;
  }

  // İki gruplama sinyalini (kod ailesi + ad ailesi) birleştirir; aynı
  // hammadde ikisinde birden yakalanırsa tek kez (daha büyük sapmalı olan)
  // raporlanır.
  function tara(hammaddeler, ayarlar, oranEsigi) {
    oranEsigi = oranEsigi || 5.0;
    const liste = hammaddeler || [];
    const kodBazli = grupTara(liste, ayarlar, h => kodAilesi(h.stokKodu), oranEsigi);
    const adBazli = grupTara(liste, ayarlar, h => adAilesi(h.ad), oranEsigi);
    const birlesik = {};
    [...kodBazli, ...adBazli].forEach(a => {
      const mevcut = birlesik[a.hammaddeId];
      if (!mevcut || Math.abs(a.sapmaYuzde) > Math.abs(mevcut.sapmaYuzde)) birlesik[a.hammaddeId] = a;
    });
    return Object.values(birlesik);
  }

  return { dvzTuru, birimFiyatTL, kodAilesi, adAilesi, medyanHesapla, tara };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = HammaddeTutarlilikMotor;
