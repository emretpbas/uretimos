// ════════════════════════════════════════════════════════════════════════════
// CRM MOTORU — Satış Fırsatı (Pipeline), Aktivite ve Tahmin
// ────────────────────────────────────────────────────────────────────────────
// Mevcut sistemde müşteri kartı, teklif ve sipariş VAR. Eksik olan, bunların
// ÖNCESİ: bir müşteri adayının nasıl fırsata, fırsatın nasıl teklife dönüştüğü.
// Bu modül o boşluğu doldurur ve mevcut teklif/sipariş akışına bağlanır.
//
// HUNİ (pipeline):
//   yeni → nitelendi → teklif → müzakere → kazanildi / kaybedildi
//
// Her aşamanın bir KAZANMA OLASILIĞI vardır; ağırlıklı toplam "satış tahmini"
// verir. Bu, üretim planlamanın kapasite ayırması için erken sinyaldir —
// sipariş gelmeden önce ne geleceğini görmek.
// ════════════════════════════════════════════════════════════════════════════
const CRM = (() => {

  // Aşamalar ve kazanma olasılıkları (sektör pratiğine göre kalibre edilebilir)
  const ASAMALAR = [
    { id: 'yeni', ad: 'Yeni Aday', olasilik: 10, renk: '#9e9e9e' },
    { id: 'nitelendi', ad: 'Nitelendi', olasilik: 25, renk: '#1976d2' },
    { id: 'teklif', ad: 'Teklif Verildi', olasilik: 50, renk: '#7b1fa2' },
    { id: 'muzakere', ad: 'Müzakere', olasilik: 75, renk: '#f57c00' },
    { id: 'kazanildi', ad: 'Kazanıldı', olasilik: 100, renk: '#2e7d32' },
    { id: 'kaybedildi', ad: 'Kaybedildi', olasilik: 0, renk: '#c62828' }
  ];

  const AKTIVITE_TIPLERI = [
    { id: 'arama', ad: '📞 Telefon Görüşmesi' },
    { id: 'ziyaret', ad: '🤝 Müşteri Ziyareti' },
    { id: 'eposta', ad: '✉️ E-posta' },
    { id: 'toplanti', ad: '📅 Toplantı' },
    { id: 'numune', ad: '📦 Numune Gönderimi' },
    { id: 'fuar', ad: '🎪 Fuar / Etkinlik' },
    { id: 'not', ad: '📝 Not' }
  ];

  const KAYNAKLAR = ['Bayi', 'Fuar', 'Web Sitesi', 'Referans', 'Soğuk Arama',
    'Sosyal Medya', 'İhale', 'Mevcut Müşteri', 'Diğer'];

  const asamaBul = (id) => ASAMALAR.find(a => a.id === id) || ASAMALAR[0];
  const acikMi = (f) => !['kazanildi', 'kaybedildi'].includes(f.asama);

  // ── SATIŞ TAHMİNİ ────────────────────────────────────────────────────────
  // Ağırlıklı boru hattı: her fırsatın tutarı × aşama olasılığı.
  // Kapalı fırsatlar (kazanıldı/kaybedildi) tahmine girmez — onlar gerçekleşmiş.
  function tahminHesapla(firsatlar, ayFiltre) {
    const acik = (firsatlar || []).filter(f => acikMi(f) &&
      (!ayFiltre || (f.beklenenKapanis || '').slice(0, 7) === ayFiltre));
    const toplam = acik.reduce((a, f) => a + (+f.tutar || 0), 0);
    const agirlikli = acik.reduce((a, f) => a + (+f.tutar || 0) * asamaBul(f.asama).olasilik / 100, 0);
    return { adet: acik.length, toplam, agirlikli };
  }

  // Aşama bazlı huni dağılımı
  function huniDagilimi(firsatlar) {
    return ASAMALAR.map(a => {
      const liste = (firsatlar || []).filter(f => f.asama === a.id);
      return {
        ...a, adet: liste.length,
        tutar: liste.reduce((s, f) => s + (+f.tutar || 0), 0)
      };
    });
  }

  // ── KAZANMA ORANI ────────────────────────────────────────────────────────
  // Kapanmış fırsatlar üzerinden. Yalnızca yeterli örnek varsa anlamlıdır;
  // az veriyle oran yanıltıcıdır, o yüzden adet de döndürülür.
  function kazanmaOrani(firsatlar, temsilci) {
    const kapali = (firsatlar || []).filter(f => !acikMi(f) &&
      (!temsilci || f.temsilci === temsilci));
    const kazanan = kapali.filter(f => f.asama === 'kazanildi');
    return {
      kapali: kapali.length,
      kazanan: kazanan.length,
      oran: kapali.length ? (kazanan.length / kapali.length * 100) : null,
      kazanilanTutar: kazanan.reduce((a, f) => a + (+f.tutar || 0), 0),
      guvenilir: kapali.length >= 10   // 10'un altında oran anlamsızdır
    };
  }

  // ── İLGİLENİLMEYEN FIRSATLAR ─────────────────────────────────────────────
  // Satışta en sık kayıp sebebi: fırsatın unutulması. Son aktiviteden bu yana
  // geçen gün eşiği aşılmışsa uyarı üretilir.
  function ihmalEdilenler(firsatlar, aktiviteler, gunEsigi) {
    const esik = gunEsigi || 14;
    const bugun = Date.now();
    const sonAktivite = new Map();
    (aktiviteler || []).forEach(a => {
      const t = new Date(a.tarih || 0).getTime();
      if (!sonAktivite.has(a.firsatId) || t > sonAktivite.get(a.firsatId)) {
        sonAktivite.set(a.firsatId, t);
      }
    });
    return (firsatlar || []).filter(acikMi).map(f => {
      const son = sonAktivite.get(f.id) || new Date(f.olusturmaTarihi || 0).getTime();
      const gun = Math.floor((bugun - son) / 86400000);
      return { ...f, sessizGun: gun };
    }).filter(f => f.sessizGun >= esik)
      .sort((a, b) => b.sessizGun - a.sessizGun);
  }

  // ── AŞAMA GEÇİŞİ ─────────────────────────────────────────────────────────
  // Geriye dönüş serbesttir (müzakere → teklif olabilir), ama kapalı fırsat
  // yeniden açılamaz: kapanış kaydı bozulmamalı. Yeniden görüşülecekse yeni
  // fırsat açılır — bu, kazanma oranı istatistiğini de doğru tutar.
  function gecisGecerli(mevcut, yeni) {
    if (mevcut === yeni) return { gecerli: false, sebep: 'Fırsat zaten bu aşamada.' };
    if (['kazanildi', 'kaybedildi'].includes(mevcut)) {
      return { gecerli: false, sebep: 'Kapanmış fırsat yeniden açılamaz. Yeni fırsat oluşturun.' };
    }
    if (!ASAMALAR.find(a => a.id === yeni)) return { gecerli: false, sebep: 'Geçersiz aşama.' };
    return { gecerli: true, sebep: null };
  }

  async function firsatOlustur({ musteriId, musteriAdi, baslik, tutar, kaynak,
    beklenenKapanis, temsilci, aciklama, projeMi }) {
    if (!baslik || !baslik.trim()) return { ok: false, hata: 'Fırsat başlığı zorunlu.' };
    if (!musteriAdi && !musteriId) return { ok: false, hata: 'Müşteri seçilmeli.' };
    const f = {
      id: App.uid('FRS'),
      kod: 'FRS-' + Date.now().toString(36).toUpperCase(),
      musteriId: musteriId || null, musteriAdi: musteriAdi || '',
      baslik: baslik.trim(), tutar: +tutar || 0,
      kaynak: kaynak || 'Diğer',
      asama: 'yeni',
      beklenenKapanis: beklenenKapanis || '',
      temsilci: temsilci || (App.aktifRol ? App.aktifRol() : ''),
      aciklama: (aciklama || '').trim(),
      projeMi: !!projeMi,
      teklifId: null, siparisId: null, projeId: null,
      olusturmaTarihi: new Date().toISOString(),
      asamaGecmisi: [{ asama: 'yeni', tarih: new Date().toISOString(), kim: App.aktifRol ? App.aktifRol() : '' }]
    };
    const liste = await Store.firsatlar.all();
    liste.push(f);
    await App.persist(() => Store.topluEkle('firsatlar', [f], 1));
    return { ok: true, firsat: f };
  }

  async function asamaDegistir(firsatId, yeniAsama, gerekce) {
    const liste = await Store.firsatlar.all();
    const f = liste.find(x => x.id === firsatId);
    if (!f) return { ok: false, hata: 'Fırsat bulunamadı.' };
    const g = gecisGecerli(f.asama, yeniAsama);
    if (!g.gecerli) return { ok: false, hata: g.sebep };
    // Kaybedildi ise sebep zorunlu — kayıp analizi ancak böyle yapılabilir
    if (yeniAsama === 'kaybedildi' && (!gerekce || !gerekce.trim())) {
      return { ok: false, hata: 'Kayıp sebebi zorunlu — bu bilgi olmadan kayıp analizi yapılamaz.' };
    }
    f.asama = yeniAsama;
    f.asamaGecmisi = f.asamaGecmisi || [];
    f.asamaGecmisi.push({
      asama: yeniAsama, tarih: new Date().toISOString(),
      kim: App.aktifRol ? App.aktifRol() : '', gerekce: (gerekce || '').trim()
    });
    if (yeniAsama === 'kazanildi' || yeniAsama === 'kaybedildi') {
      f.kapanisTarihi = new Date().toISOString();
      if (yeniAsama === 'kaybedildi') f.kayipSebebi = (gerekce || '').trim();
    }
    await App.persist(() => Store.topluGuncelle('firsatlar', [f], 1));
    return { ok: true, firsat: f };
  }

  async function aktiviteEkle({ firsatId, tip, ozet, tarih, sonrakiAdim, sonrakiTarih }) {
    if (!firsatId) return { ok: false, hata: 'Fırsat belirtilmeli.' };
    if (!ozet || !ozet.trim()) return { ok: false, hata: 'Görüşme özeti zorunlu.' };
    const a = {
      id: App.uid('AKT'), firsatId, tip: tip || 'not',
      ozet: ozet.trim(),
      tarih: tarih || new Date().toISOString(),
      sonrakiAdim: (sonrakiAdim || '').trim(),
      sonrakiTarih: sonrakiTarih || '',
      kim: App.aktifRol ? App.aktifRol() : ''
    };
    await App.persist(() => Store.topluEkle('crmAktiviteler', [a], 1));
    return { ok: true, aktivite: a };
  }

  // ── FIRSATTAN DÖNÜŞÜM ────────────────────────────────────────────────────
  // Kazanılan fırsat, iş tipine göre PROJE veya doğrudan TEKLİF/SİPARİŞ
  // akışına aktarılır. Bağlantı çift yönlü kurulur: fırsatta projeId/teklifId,
  // hedefte firsatId. Böylece "bu proje hangi fırsattan geldi", "bu fırsat ne
  // oldu" soruları cevaplanabilir — satış hunisi ile üretim arasındaki kopukluk
  // en sık kaybedilen izlenebilirliktir.
  async function projeyeDonustur(firsatId, { baslangic, bitis, sorumlu }) {
    const liste = await Store.firsatlar.all();
    const f = liste.find(x => x.id === firsatId);
    if (!f) return { ok: false, hata: 'Fırsat bulunamadı.' };
    if (f.asama !== 'kazanildi') return { ok: false, hata: 'Yalnızca KAZANILAN fırsat projeye dönüştürülebilir.' };
    if (f.projeId) return { ok: false, hata: 'Bu fırsat için zaten proje açılmış.' };
    if (typeof ProjeMotor === 'undefined') return { ok: false, hata: 'Proje modülü yüklenemedi.' };

    const r = await ProjeMotor.projeOlustur({
      ad: f.baslik, musteriId: f.musteriId, musteriAdi: f.musteriAdi,
      sozlesmeBedeli: f.tutar, baslangic, bitis,
      firsatId: f.id, sorumlu: sorumlu || f.temsilci,
      aciklama: f.aciklama
    });
    if (!r.ok) return r;
    f.projeId = r.proje.id;
    await App.persist(() => Store.topluGuncelle('firsatlar', [f], 1));
    return { ok: true, proje: r.proje, firsat: f };
  }

  // Fırsatı teklif akışına hazırlar: teklif ekranının okuyacağı taslak döner.
  // Teklif kalemleri satış tarafından girilir — fırsat yalnızca başlık/müşteri
  // /tutar taşır, kalem detayı taşımaz.
  async function teklifeHazirla(firsatId) {
    const liste = await Store.firsatlar.all();
    const f = liste.find(x => x.id === firsatId);
    if (!f) return { ok: false, hata: 'Fırsat bulunamadı.' };
    if (!CRM_acikMi(f)) return { ok: false, hata: 'Kapanmış fırsattan teklif hazırlanamaz.' };
    return {
      ok: true,
      taslak: {
        firsatId: f.id, musteriId: f.musteriId, musteriAdi: f.musteriAdi,
        baslik: f.baslik, tahminiTutar: f.tutar, kalemler: []
      }
    };
  }
  const CRM_acikMi = (f) => !['kazanildi', 'kaybedildi'].includes(f.asama);

  // Fırsata teklif bağla (teklif oluşturulduktan sonra çağrılır)
  async function teklifBagla(firsatId, teklifId, teklifKod) {
    const liste = await Store.firsatlar.all();
    const f = liste.find(x => x.id === firsatId);
    if (!f) return { ok: false, hata: 'Fırsat bulunamadı.' };
    f.teklifId = teklifId; f.teklifKod = teklifKod || '';
    // Teklif verildiyse aşama otomatik ilerler (geriye değil, yalnızca ileri)
    if (['yeni', 'nitelendi'].includes(f.asama)) {
      f.asama = 'teklif';
      f.asamaGecmisi = f.asamaGecmisi || [];
      f.asamaGecmisi.push({ asama: 'teklif', tarih: new Date().toISOString(),
        kim: App.aktifRol ? App.aktifRol() : '', gerekce: 'Teklif oluşturuldu: ' + (teklifKod || '') });
    }
    await App.persist(() => Store.topluGuncelle('firsatlar', [f], 1));
    return { ok: true, firsat: f };
  }

  return {
    ASAMALAR, AKTIVITE_TIPLERI, KAYNAKLAR,
    projeyeDonustur, teklifeHazirla, teklifBagla,
    asamaBul, acikMi, tahminHesapla, huniDagilimi, kazanmaOrani,
    ihmalEdilenler, gecisGecerli,
    firsatOlustur, asamaDegistir, aktiviteEkle
  };
})();

if (typeof module !== 'undefined') module.exports = CRM;
