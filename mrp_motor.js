// ════════════════════════════════════════════════════════════════════════════
// MRP — MALZEME İHTİYAÇ PLANLAMASI (Material Requirements Planning)
//
// Sistem bugüne kadar "şu an rafta ne eksik" sorusuna cevap veriyordu. MRP
// ise İLERİYE dönük çalışır: "3 hafta sonra 400 menteşe lazım, tedarik süresi
// 21 gün, BUGÜN sipariş verilmeli" der. Panel mobilyada üretim durmasının en
// sık sebebi malzeme yokluğudur; MRP bunu önler.
//
// KLASİK MRP MANTIĞI (zaman fazlı / time-phased):
//   1. MPS (Ana Üretim Çizelgesi) — onaylı siparişler + iş emirleri, termine
//      göre haftalara yerleştirilir.
//   2. BOM PATLATMA — her ürün reçetesi rekürsif açılır (ürün → paket →
//      alt montaj → yarı mamül → hammadde). Fire oranı eklenir.
//   3. BRÜT İHTİYAÇ — hafta hafta ne kadar malzeme gerekiyor.
//   4. NET İHTİYAÇ = Brüt − Eldeki Stok − Yoldaki Sipariş + Emniyet Stoğu
//      Eldeki stok haftalar boyunca "taşınır" (projected on hand).
//   5. TEDARİK SÜRESİ GERİ SAYIMI — ihtiyaç tarihinden tedarik süresi kadar
//      geri gidilerek SİPARİŞ TARİHİ bulunur. Bu tarih geçmişteyse ACİL.
//   6. PARTİ BÜYÜKLÜĞÜ — minimum sipariş miktarına yuvarlanır.
// ════════════════════════════════════════════════════════════════════════════
const MrpMotor = (() => {
  const HAFTA_MS = 7 * 86400000;

  const bugun = () => new Date().toISOString().slice(0, 10);
  const gunEkle = (t, g) => { const d = new Date(t + 'T00:00:00'); d.setDate(d.getDate() + g); return d.toISOString().slice(0, 10); };
  const gunFark = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

  // Bir tarihin ait olduğu haftanın PAZARTESİ'si (hafta kovası anahtarı)
  function haftaBasi(tarih) {
    const d = new Date(tarih + 'T00:00:00');
    const g = d.getDay();                 // 0=Pazar
    const fark = (g === 0 ? -6 : 1 - g);  // Pazartesi'ye kaydır
    d.setDate(d.getDate() + fark);
    return d.toISOString().slice(0, 10);
  }

  async function veriYukle() {
    const [siparisler, isemirleri, urunler, yarimamuller, receteler, hammaddeler,
           stokRaf, satinalmaSiparisleri, talepler, satinalmaTalepleri] = await Promise.all([
      Store.siparisler.all(), Store.isemirleri.all(), Store.urunler.all(),
      Store.yarimamuller.all(), Store.receteler.all(), Store.hammaddeler.all(),
      Store.stokRaf.all(), Store.satinalmaSiparisleri.all(), Store.talepler.all(),
      Store.satinalmaTalepleri.all()
    ]);
    return { siparisler, isemirleri, urunler, yarimamuller, receteler, hammaddeler,
             stokRaf, satinalmaSiparisleri, talepler, satinalmaTalepleri };
  }

  // ── 1) ANA ÜRETİM ÇİZELGESİ (MPS) ───────────────────────────────────────
  // Onaylı siparişler ve aktif iş emirleri, ihtiyaç tarihiyle birlikte döner.
  function mpsOlustur(v) {
    const kalemler = [];
    // Siparişler — üretim termini ihtiyaç tarihidir
    v.siparisler.filter(s => s.durum === 'onaylandi' && s.uretimDurumu !== 'tamamlandi' &&
      s.uretimDurumu !== 'iade_ambarina_alindi').forEach(s => {
      const ihtiyacTarihi = s.uretimTermini || gunEkle(bugun(), 14); // termin yoksa 2 hafta varsay
      (s.kalemler || []).forEach(k => {
        if (k.ikinciKalite || k.grup === 'hammadde') return;
        kalemler.push({
          kaynakTip: 'sip', kaynakId: s.id, kaynakKod: s.kod, musteriAdi: s.musteriAdi || '',
          grup: k.grup, kod: k.kod, adet: k.miktar || 1,
          ihtiyacTarihi, terminVarMi: !!s.uretimTermini
        });
      });
    });
    // İş emirleri — tarihi ihtiyaç tarihidir. Planlamanın henüz üretime
    // ALMADIĞI (durum='taslak') iş emirleri MRP'ye HİÇ girmemeli — aksi
    // halde henüz gerçekleşmesi kesin olmayan bir ihtiyaç için satınalma
    // tetiklenmiş olur (bkz. cizelge_motor.js/page_cizelge.js/
    // page_hat_takip.js'deki aynı düzeltme).
    v.isemirleri.filter(ie => ie.durum === 'uretimde').forEach(ie => {
      (ie.uretimListesi || []).filter(k => k.tip === 'yarimamul').forEach(k => {
        const ym = v.yarimamuller.find(y => y.id === k.refId);
        if (!ym) return;
        kalemler.push({
          kaynakTip: 'ie', kaynakId: ie.id, kaynakKod: ie.kod, musteriAdi: '',
          grup: 'yarimamul', kod: ym.kod, refId: ym.id,
          adet: k.gerekliToplam || ie.adet || 1,
          ihtiyacTarihi: ie.tarih || gunEkle(bugun(), 7), terminVarMi: !!ie.tarih
        });
      });
    });
    return kalemler;
  }

  // ── 2) BOM PATLATMA — hammadde seviyesine kadar ─────────────────────────
  // Bir ürün/yarımamülün 1 adedi için gereken HAMMADDE miktarlarını döner.
  // Fire oranı her hammaddede ayrıca eklenir (mobilyada kritik).
  function hammaddeIhtiyaci(tip, id, v, carpan, derinlik, sonuc, gorulen) {
    sonuc = sonuc || new Map();
    gorulen = gorulen || new Set();
    if ((derinlik || 0) > 8) return sonuc;
    const anahtar = tip + ':' + id;
    if (gorulen.has(anahtar)) return sonuc;
    gorulen.add(anahtar);

    const rc = tip === 'urun' ? v.receteler.find(r => r.urunId === id)
      : tip === 'yarimamul' ? v.receteler.find(r => r.yarimamulId === id)
      : tip === 'altmontaj' ? v.receteler.find(r => r.altMontajId === id)
      : tip === 'paket' ? v.receteler.find(r => r.paketId === id) : null;

    (rc ? rc.kalemler : []).forEach(k => {
      const miktar = (k.miktar || 0) * (carpan || 1);
      if (k.tip === 'hammadde') {
        const hm = v.hammaddeler.find(h => h.id === k.refId);
        // Fire payı: 100 birim gerekiyorsa ve fire %8 ise 108,7 birim alınmalı
        const fire = (hm && hm.fireYuzde) || 0;
        const fireliMiktar = fire > 0 ? miktar / (1 - fire / 100) : miktar;
        sonuc.set(k.refId, (sonuc.get(k.refId) || 0) + fireliMiktar);
      } else if (k.tip === 'yarimamul' || k.tip === 'altmontaj' || k.tip === 'paket') {
        hammaddeIhtiyaci(k.tip, k.refId, v, miktar, (derinlik || 0) + 1, sonuc, gorulen);
      }
    });
    gorulen.delete(anahtar);
    return sonuc;
  }

  // ── 3-6) MRP ÇALIŞTIR ───────────────────────────────────────────────────
  function calistir(v, opts) {
    const o = Object.assign({ ufukHafta: 12, varsayilanTedarikSuresi: 14 }, opts || {});
    const mps = mpsOlustur(v);
    const bas = haftaBasi(bugun());

    // Hafta kovalarını hazırla
    const haftalar = [];
    for (let i = 0; i < o.ufukHafta; i++) {
      haftalar.push(new Date(new Date(bas + 'T00:00:00').getTime() + i * HAFTA_MS).toISOString().slice(0, 10));
    }
    const haftaIndex = (tarih) => {
      const hb = haftaBasi(tarih);
      const idx = haftalar.indexOf(hb);
      if (idx >= 0) return idx;
      return hb < bas ? 0 : -1;  // geçmiş → ilk haftaya (gecikmiş), ufuk dışı → -1
    };

    // ── BRÜT İHTİYAÇ: hammadde × hafta matrisi
    const brut = new Map();   // hammaddeId -> [hafta bazında miktar]
    const kaynakIzi = new Map(); // hammaddeId -> [{kaynakKod, adet, tarih}]
    mps.forEach(m => {
      const hi = haftaIndex(m.ihtiyacTarihi);
      if (hi < 0) return;  // planlama ufku dışında
      let ihtiyaclar;
      if (m.grup === 'urun') {
        const urun = v.urunler.find(u => u.kod === m.kod);
        if (!urun) return;
        ihtiyaclar = hammaddeIhtiyaci('urun', urun.id, v, m.adet, 0);
      } else if (m.grup === 'yarimamul') {
        const ym = m.refId ? v.yarimamuller.find(y => y.id === m.refId)
                           : v.yarimamuller.find(y => y.kod === m.kod);
        if (!ym) return;
        ihtiyaclar = hammaddeIhtiyaci('yarimamul', ym.id, v, m.adet, 0);
      } else return;

      ihtiyaclar.forEach((miktar, hmId) => {
        if (!brut.has(hmId)) brut.set(hmId, new Array(o.ufukHafta).fill(0));
        brut.get(hmId)[hi] += miktar;
        if (!kaynakIzi.has(hmId)) kaynakIzi.set(hmId, []);
        kaynakIzi.get(hmId).push({ kaynakKod: m.kaynakKod, kaynakTip: m.kaynakTip,
          musteriAdi: m.musteriAdi, miktar, tarih: m.ihtiyacTarihi, hafta: hi });
      });
    });

    // ── YOLDAKI SİPARİŞLER (scheduled receipts)
    // NOT: 'teslim_alindi' bu koleksiyonda HİÇ kullanılmayan bir durum
    // string'iydi (satınalma siparişi tamamlanınca durum='tamamlandi' olur,
    // bkz. page_depo_panel.js:542 aynı filtre) — bu yüzden tamamlanmış
    // siparişler de "yolda" sayılıp brüt ihtiyaçtan hatalı şekilde
    // düşülüyordu. Ayrıca 'reddedildi' de artık hariç tutuluyor.
    const yolda = new Map(); // hammaddeId -> [hafta bazında gelecek miktar]
    v.satinalmaSiparisleri.filter(s => s.durum !== 'iptal' && s.durum !== 'tamamlandi' && s.durum !== 'reddedildi').forEach(s => {
      if (!s.hammaddeId) return;
      const gelis = s.tahminiGirisTarihi || gunEkle(s.tarih || bugun(), s.terminGun || 7);
      const hi = haftaIndex(gelis);
      if (hi < 0) return;
      if (!yolda.has(s.hammaddeId)) yolda.set(s.hammaddeId, new Array(o.ufukHafta).fill(0));
      yolda.get(s.hammaddeId)[hi] += s.miktar || 0;
    });

    // ── SATIRLARI HESAPLA
    const satirlar = [];
    brut.forEach((brutDizi, hmId) => {
      const hm = v.hammaddeler.find(h => h.id === hmId);
      if (!hm) return;
      const eldeki = v.stokRaf.filter(s => s.tip === 'hammadde' && s.refId === hmId)
        .reduce((a, s) => a + (s.miktar || 0), 0);
      const emniyet = hm.emniyetStogu || 0;
      const tedarikSuresi = hm.tedarikSuresiGun != null ? hm.tedarikSuresiGun : o.varsayilanTedarikSuresi;
      const minSiparis = hm.minSiparisMiktari || 0;
      const yoldaDizi = yolda.get(hmId) || new Array(o.ufukHafta).fill(0);

      // Zaman fazlı hesap: projeksiyon stoğu haftalar boyunca taşınır
      let projeksiyon = eldeki;
      const haftaDetay = [];
      const onerilenSiparisler = [];
      for (let i = 0; i < o.ufukHafta; i++) {
        const brutH = brutDizi[i] || 0;
        const yoldaH = yoldaDizi[i] || 0;
        const oncekiProj = projeksiyon;
        projeksiyon = projeksiyon + yoldaH - brutH;

        // Net ihtiyaç: projeksiyon emniyet stoğunun altına düşerse
        let net = 0, onerilen = 0, siparisTarihi = null, acilMi = false;
        if (projeksiyon < emniyet) {
          net = emniyet - projeksiyon;
          // Parti büyüklüğü: min sipariş miktarına yuvarla
          onerilen = minSiparis > 0 ? Math.ceil(net / minSiparis) * minSiparis : net;
          // TEDARİK SÜRESİ GERİ SAYIMI
          siparisTarihi = gunEkle(haftalar[i], -tedarikSuresi);
          acilMi = siparisTarihi < bugun();
          onerilenSiparisler.push({
            hafta: i, haftaTarihi: haftalar[i], netIhtiyac: net, onerilenMiktar: onerilen,
            siparisTarihi, acilMi, gecikmeGun: acilMi ? gunFark(bugun(), siparisTarihi) : 0
          });
          projeksiyon += onerilen; // önerilen sipariş geldiği varsayılır
        }
        haftaDetay.push({
          hafta: i, tarih: haftalar[i], brut: brutH, yolda: yoldaH,
          baslangicStok: oncekiProj, projeksiyon, net, onerilen
        });
      }

      const toplamBrut = brutDizi.reduce((a, b) => a + b, 0);
      const toplamOnerilen = onerilenSiparisler.reduce((a, s) => a + s.onerilenMiktar, 0);
      const acilVar = onerilenSiparisler.some(s => s.acilMi);
      satirlar.push({
        hammaddeId: hmId, kod: hm.stokKodu, ad: hm.ad, birim: hm.birim,
        birimFiyat: hm.birimFiyat || 0, fireYuzde: hm.fireYuzde || 0,
        tedarikSuresi, minSiparis, emniyet, eldeki,
        tedarikciId: hm.varsayilanTedarikciId || null, tedarikciAdi: hm.varsayilanTedarikciAdi || hm.tedarikci || '',
        toplamBrut, toplamOnerilen, acilVar,
        haftaDetay, onerilenSiparisler,
        kaynaklar: kaynakIzi.get(hmId) || [],
        maliyet: toplamOnerilen * (hm.birimFiyat || 0)
      });
    });

    // Aciller önce, sonra toplam ihtiyaca göre
    satirlar.sort((a, b) => (b.acilVar ? 1 : 0) - (a.acilVar ? 1 : 0) || b.toplamOnerilen - a.toplamOnerilen);

    // Terminsiz siparişler uyarısı
    const terminsiz = mps.filter(m => !m.terminVarMi);
    const ufukDisi = mps.filter(m => haftaIndex(m.ihtiyacTarihi) < 0);

    return {
      haftalar, satirlar, mps,
      ozet: {
        malzemeSayisi: satirlar.length,
        acilSayisi: satirlar.filter(s => s.acilVar).length,
        toplamMaliyet: satirlar.reduce((a, s) => a + s.maliyet, 0),
        terminsizKalem: terminsiz.length,
        ufukDisiKalem: ufukDisi.length,
        ufukHafta: o.ufukHafta
      }
    };
  }

  async function tamMrp(opts) {
    const v = await veriYukle();
    return { ...calistir(v, opts), veri: v };
  }

  // ── ÖNERİLEN SİPARİŞLERİ TALEBE DÖNÜŞTÜR ────────────────────────────────
  // MRP önerilerini satın alma talebine çevirir (mükerrer açmaz).
  async function taleplereDonustur(secilenler) {
    const talepler = await Store.talepler.all();
    let acilan = 0, atlanan = 0;
    for (const s of secilenler) {
      // Aynı hammadde için açık talep varsa tekrar açma
      if (talepler.some(t => t.hammaddeId === s.hammaddeId && t.durum === 'beklemede')) { atlanan++; continue; }
      talepler.push({
        id: App.uid('TLP'), hammaddeId: s.hammaddeId, hammaddeKod: s.kod, hammaddeAd: s.ad,
        kalemAdi: s.ad, miktar: s.toplamOnerilen, birim: s.birim,
        durum: 'beklemede', talepEden: 'MRP (otomatik planlama)',
        tarih: new Date().toISOString().slice(0, 10),
        ihtiyacTarihi: s.onerilenSiparisler.length ? s.onerilenSiparisler[0].haftaTarihi : null,
        aciklama: `MRP önerisi — ${s.toplamBrut.toFixed(1)} ${s.birim} brüt ihtiyaç, ${s.eldeki.toFixed(1)} eldeki stok. ` +
          `Tedarik süresi ${s.tedarikSuresi} gün.` + (s.acilVar ? ' ⚠ ACİL — sipariş tarihi geçmiş.' : '')
      });
      acilan++;
    }
    await Store.talepler.save(talepler);
    return { acilan, atlanan };
  }

  return { tamMrp, calistir, mpsOlustur, hammaddeIhtiyaci, taleplereDonustur, haftaBasi };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MrpMotor;
