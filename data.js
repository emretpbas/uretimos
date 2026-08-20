// ════════════════════════════════════════════════════════════════════════════
// ÜRETİMOS — STATİK REFERANS VERİLERİ
// Bu dosya: üretim hatları/makineler, hammadde kataloğu örnekleri ve
// içe aktarılan kesim listesi / reçete örnek verilerini içerir.
// İlk çalıştırmada bu veriler storage'a "seed" olarak yazılır; sonrasında
// kullanıcı düzenlemeleri storage üzerinden kalıcı olur.
// ════════════════════════════════════════════════════════════════════════════

// Hammadde Kategorileri — varsayılan, kullanıcı tarafından genişletilebilir
// (Hammadde sayfasından "+ Yeni Kategori" ile kalıcı olarak eklenir).
const HAMMADDE_KATEGORI_SEED = ['Plaka', 'Kenar Bandı', 'Hırdavat', 'Sarf Malzemesi', 'Yedek Parça', 'Diğer'];

const HATLAR = {
"BANYO MAKİNE HATTI":[
  {kod:"CNC.01",tanim:"BIESSE ROVER B 1638 CNC İŞLEM MERKEZİ",grup:"CNC İŞLEM MERKEZLERİ"},
  {kod:"DLK.07",tanim:"VİTAP FORMA 12 OLCD ÇOKLU DELİK MAKİNESİ",grup:"DELİK MAKİNELERİ"},
  {kod:"DLK.08",tanim:"NANXİNG N7 ÇOKLU DELİK MAKİNESİ",grup:"DELİK MAKİNELERİ"},
  {kod:"DLK.11",tanim:"HOLZER DİKEY DELİK MAKİNESİ",grup:"DELİK MAKİNELERİ"},
  {kod:"DTS.08",tanim:"MIZRAK 1500 DAİRE TESTERE MAKİNESİ",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"KBM.05",tanim:"HOMAG KAL-310 DÜZ KENAR BANTLAMA MAKİNESİ",grup:"KENAR BANTLAMA MAKİNELERİ"},
  {kod:"KBM.05.15",tanim:"HOMAG KAL-310 KÖŞE YUVARLAMA ÜNİTESİ",grup:"ÜRETİM MAKİNELERİ ALT ÜNİTELERİ"},
  {kod:"KBM.06",tanim:"BRANDT KTD 720 EĞRİ KENAR BANTLAMA",grup:"KENAR BANTLAMA MAKİNELERİ"},
  {kod:"KBM.08",tanim:"HOLZER DÜZ KENAR BANTLAMA MAKİNESİ",grup:"KENAR BANTLAMA MAKİNELERİ"},
  {kod:"PAN.03",tanim:"BIESSE/SELCO WNT 730 PANEL KESME MAKİNESİ",grup:"PANEL EBATLAMA MAKİNELERİ"},
  {kod:"TUT.01",tanim:"NORDSON HOTMELT TUTKAL ERITME TANKI-1",grup:"TUTKAL ÜNİTELERİ"},
  {kod:"TUT.02",tanim:"NORDSON HOTMELT TUTKAL ERITME TANKI-2",grup:"TUTKAL ÜNİTELERİ"}
],
"BOYA ATIM VE KURUTMA":[
  {kod:"BYK.01",tanim:"BOYA KABİNİ-1",grup:"BOYA KABİNLERİ"},
  {kod:"BYK.02",tanim:"BOYA KABİNİ-2",grup:"BOYA KABİNLERİ"},
  {kod:"BYK.03",tanim:"BOYA KABİNİ-3",grup:"BOYA KABİNLERİ"},
  {kod:"KRT.01",tanim:"KURUTMA KABİNİ-1",grup:"KURUTMA KABİNLERİ"},
  {kod:"KRT.02",tanim:"KURUTMA KABİNİ-2",grup:"KURUTMA KABİNLERİ"},
  {kod:"UVB.01",tanim:"VD FORNO UV2 SIM YÜZEY BOYAMA",grup:"UV BOYA SİSTEMLERİ"},
  {kod:"UVB.02",tanim:"VD CUMBA BOYAMA",grup:"UV BOYA SİSTEMLERİ"}
],
"ZIMPARA BÖLÜMÜ":[
  {kod:"ZMP.07",tanim:"BÜTFERİNG SWT 335 KALİBRE ZIMPARA-2",grup:"ZIMPARA VE YÜZEY İŞLEME"},
  {kod:"ZMP.09",tanim:"BÜTFERİNG SWT 335 KALİBRE ZIMPARA-1",grup:"ZIMPARA VE YÜZEY İŞLEME"}
],
"HAM BÖLÜMÜ":[
  {kod:"DLK.01",tanim:"HİMSAN ÇOKLU DELİK MAKİNESİ",grup:"DELİK MAKİNELERİ"},
  {kod:"DLK.10",tanim:"SAMET SAM-D50 MENTEŞE DELİK MAKİNESİ",grup:"DELİK MAKİNELERİ"},
  {kod:"DTS.02",tanim:"KESİM C45 COMPACT YATAR DAİRE TESTERE",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"DTS.03",tanim:"MAKİTA LS 1013 L BAŞ KESME MAKİNESİ",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"DUM.02",tanim:"EMSA FREZE ROBOT KOLU-2",grup:"DİĞER ÜRETİM MAKİNELERİ"},
  {kod:"DUM.03",tanim:"MIZRAK PLANYA MAKİNESİ",grup:"DİĞER ÜRETİM MAKİNELERİ"},
  {kod:"DUM.04",tanim:"MIZRAK KALINLIK MAKİNESİ",grup:"DİĞER ÜRETİM MAKİNELERİ"},
  {kod:"DUM.05",tanim:"EMSA FREZE ROBOT KOLU-1",grup:"DİĞER ÜRETİM MAKİNELERİ"},
  {kod:"FRZ.01",tanim:"NETMAK FR2005 FREZE MAKİNESİ",grup:"FREZE MAKİNELERİ"},
  {kod:"FRZ.02",tanim:"NETMAK FR2000S FREZE MAKİNESİ-1",grup:"FREZE MAKİNELERİ"},
  {kod:"FRZ.03",tanim:"NETMAK FR2000S FREZE MAKİNESİ-2",grup:"FREZE MAKİNELERİ"},
  {kod:"MTK.06",tanim:"QUANTUM RADYAL MATKAP MAKİNESİ-1",grup:"MATKAPLAR"},
  {kod:"MTK.07",tanim:"ŞENEL MATKAP TEZGAHI",grup:"MATKAPLAR"},
  {kod:"PRS.06",tanim:"ORMA PRESS SICAK DÜZ TABLA PRES",grup:"PRESLER"},
  {kod:"PRS.07",tanim:"COMİL KUTU PRES MAKİNESİ",grup:"PRESLER"},
  {kod:"STS.02",tanim:"AKIN ŞERİT TESTERE MAKİNESİ",grup:"ŞERİT TESTERE MAKİNELERİ"},
  {kod:"ZMP.03",tanim:"DEMSAŞ PALET ZIMPARA MAKİNESİ",grup:"ZIMPARA VE YÜZEY İŞLEME"},
  {kod:"ZMP.04",tanim:"TAMİŞ ZIMPARA MAKİNESİ",grup:"ZIMPARA VE YÜZEY İŞLEME"},
  {kod:"ZMP.05",tanim:"BÜTFERİNG SWT 325/RH KALİBRE ZIMPARA",grup:"ZIMPARA VE YÜZEY İŞLEME"},
  {kod:"ZMP.06",tanim:"LOEWER EMK KENAR ZIMPARA MAKİNESİ",grup:"ZIMPARA VE YÜZEY İŞLEME"},
  {kod:"ZMP.08",tanim:"KAMA FZM ZIMPARA MAKİNESİ",grup:"ZIMPARA VE YÜZEY İŞLEME"}
],
"KOLİ BÖLÜMÜ":[{kod:"KUM.01",tanim:"HOMAG PAQTEQ KOLİ ÜRETİM MAKİNESİ",grup:"KOLİ ÜRETİM MAKİNELERİ"}],
"BOYA BÖLÜMÜ":[{kod:"TBS.01",tanim:"MDF TOZ BOYA SİSTEMİ",grup:"TOZ BOYA SİSTEMLERİ"}],
"METAL İŞLEME BÖLÜMÜ":[
  {kod:"DTS.01",tanim:"ÇAPAKSIZ BAŞ KESME MAKİNESİ-2",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"KRB.01",tanim:"KAYNAK ROBOTU FANUC-1",grup:"KAYNAK ROBOTLARI"},
  {kod:"KUT.001",tanim:"KURTAĞZI AÇMA MAKİNESİ CESURBEND",grup:"KURTAĞZI MAKİNASI"},
  {kod:"KYN.01",tanim:"MAGMAWELD TD355 GAZ ALTI KAYNAK-1",grup:"KAYNAK MAKİNELERİ"},
  {kod:"KYN.02",tanim:"MAGMAWELD TD355 GAZ ALTI KAYNAK-2",grup:"KAYNAK MAKİNELERİ"},
  {kod:"KYN.03",tanim:"MAGMAWELD TD355 GAZ ALTI KAYNAK-3",grup:"KAYNAK MAKİNELERİ"},
  {kod:"KYN.04",tanim:"MAGMAWELD TD355 GAZ ALTI KAYNAK-4",grup:"KAYNAK MAKİNELERİ"},
  {kod:"KYN.05",tanim:"MAGMAWELD GKG 250K ARK KAYNAK",grup:"KAYNAK MAKİNELERİ"},
  {kod:"KYN.08",tanim:"PUNTA KAYNAK MAKİNESİ MANUEL",grup:"KAYNAK MAKİNELERİ"},
  {kod:"KYN.09",tanim:"OTTO TECH KAYNAK MAKİNESİ-1",grup:"KAYNAK MAKİNELERİ"},
  {kod:"KYN.10",tanim:"OTTO TECH KAYNAK MAKİNESİ-2",grup:"KAYNAK MAKİNELERİ"},
  {kod:"KYN.11",tanim:"LAZER KAYNAK MAKİNESİ-1",grup:"KAYNAK MAKİNELERİ"},
  {kod:"PRS.11",tanim:"DİRİNLER EKSANTRİK C PRES 1",grup:"PRESLER"},
  {kod:"PRS.12",tanim:"DİRİNLER EKSANTRİK C PRES 2",grup:"PRESLER"},
  {kod:"PRS.13",tanim:"EKSANTRİK C PRES 3",grup:"PRESLER"},
  {kod:"PRS.14",tanim:"EKSANTRİK C PRES 4",grup:"PRESLER"},
  {kod:"PRS.16",tanim:"HİDROLİK PRES 1",grup:"PRESLER"},
  {kod:"PRS.17",tanim:"HORIZONTAL PRES CESURBEND",grup:"PRESLER"},
  {kod:"SBM.001",tanim:"ERMAKSAN ABKANT PRES",grup:"SAC BÜKME MAKİNELERİ"},
  {kod:"SBM.002",tanim:"DURMA ABKANT PRES 1",grup:"SAC BÜKME MAKİNELERİ"},
  {kod:"SBM.003",tanim:"DURMA ABKANT PRES 2",grup:"SAC BÜKME MAKİNELERİ"},
  {kod:"SCK.001",tanim:"ERMAKSAN HİDROLİK GİYOTİN MAKAS",grup:"SAC KESME MAKİNELERİ"},
  {kod:"SCK.002",tanim:"DURMA HİDROLİK GİYOTİN MAKAS",grup:"SAC KESME MAKİNELERİ"},
  {kod:"TBF.01",tanim:"TOZ BOYA FIRINI-1",grup:"TOZ BOYA FIRINLARI"},
  {kod:"TBK.01",tanim:"TOZ BOYA KABİNİ-1",grup:"TOZ BOYA KABİNLERİ"},
  {kod:"TBK.02",tanim:"TOZ BOYA KABİNİ-2",grup:"TOZ BOYA KABİNLERİ"},
  {kod:"TSL.01",tanim:"TAŞLAMA MASASI-1",grup:"TAŞLAMA MASALARI"},
  {kod:"YKM.01",tanim:"ELSİSAN YKM-200 YIKAMA MAKİNESİ-1",grup:"YIKAMA MAKİNELERİ"}
],
"OFİS MAKİNE HATTI":[
  {kod:"CNC.02",tanim:"HOMAG OPTIMAT BAZ 322 CNC İŞLEM MERKEZİ",grup:"CNC İŞLEM MERKEZLERİ"},
  {kod:"CNC.03",tanim:"BIESSE ROVER C 6.40 CNC İŞLEM MERKEZİ",grup:"CNC İŞLEM MERKEZLERİ"},
  {kod:"DLK.04",tanim:"BIESSE SKIPPER 130 ÇOKLU DELİK-1",grup:"DELİK MAKİNELERİ"},
  {kod:"DLK.05",tanim:"BIESSE SKIPPER 130 ÇOKLU DELİK-2",grup:"DELİK MAKİNELERİ"},
  {kod:"DLK.06",tanim:"BIESSE TECHNO KF ÇOKLU DELİK",grup:"DELİK MAKİNELERİ"},
  {kod:"DTS.07",tanim:"CASADEI SC400A YATAR DAİRE KESİM",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"DTS.12",tanim:"ROBLANT Z 320 ÇİZİCİLİ DAİRE TESTERE",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"KBM.01",tanim:"IMA-2006 10633 DÜZ KENAR BANTLAMA",grup:"KENAR BANTLAMA MAKİNELERİ"},
  {kod:"KBM.02",tanim:"IMA-2008 08313 DÜZ KENAR BANTLAMA",grup:"KENAR BANTLAMA MAKİNELERİ"},
  {kod:"KBM.02.15",tanim:"IMA-2008 ALT MFA FREZE ÜNİTESİ",grup:"ÜRETİM MAKİNELERİ ALT ÜNİTELERİ"},
  {kod:"KBM.07",tanim:"NANXING KENAR BANTLAMA MAKİNESİ",grup:"KENAR BANTLAMA MAKİNELERİ"},
  {kod:"NEM.02",tanim:"HOMAG DOPEL NET EBATLAMA MAKİNESİ",grup:"NET EBATLAMA MAKİNELERİ"},
  {kod:"PAN.01",tanim:"HOLZMA HPL 11 PANEL KESME MAKİNESİ",grup:"PANEL EBATLAMA MAKİNELERİ"},
  {kod:"PAN.02",tanim:"HOLZMA HPP 380 PANEL KESME MAKİNESİ",grup:"PANEL EBATLAMA MAKİNELERİ"},
  {kod:"TRS.01",tanim:"BRANDT FTK 130 TRAŞLAMA MAKİNESİ",grup:"TRAŞLAMA MAKİNELERİ"}
],
"DÖŞEME BÖLÜMÜ":[{kod:"DIK.01",tanim:"GARDEN ANİTA DİKİŞ MAKİNASI",grup:"DİKİŞ MAKİNALARI"}],
"DOLAP HATTI":[
  {kod:"DLK.02",tanim:"HIMSAN KULP DELİK MAKİNESİ",grup:"DELİK MAKİNELERİ"},
  {kod:"DLK.09",tanim:"HIMSAN DÖRT KAFALI MENTEŞE DELİK",grup:"DELİK MAKİNELERİ"},
  {kod:"MTK.04",tanim:"QUANTUM RADYAL MATKAP-2",grup:"MATKAPLAR"}
],
"ALM. BÖL. PANEL. BÖLÜMÜ":[
  {kod:"DLK.03",tanim:"A-TECH ALÜMİNYUM MENTEŞE DELİK",grup:"DELİK MAKİNELERİ"},
  {kod:"DTS.04",tanim:"ÖZÇELİK KIRLANGIÇ YUVASI AÇMA",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"DTS.06",tanim:"TOSKAR WOODMASTER 250",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"DTS.10",tanim:"HASMAK GÖNYE KESİM MAKİNASI-1",grup:"DAİRE TESTERE MAKİNELERİ"},
  {kod:"KLV.01",tanim:"FLEXTAP KILAVUZ AÇMA MAKİNASI",grup:"KILAVUZ MAKİNALARI"},
  {kod:"KLV.02",tanim:"TOPTECH KILAVUZ ÇEKME MAKİNESİ",grup:"KILAVUZ MAKİNALARI"},
  {kod:"MTK.03",tanim:"PROMAX RADYAL MATKAP MAKİNESİ",grup:"MATKAPLAR"},
  {kod:"MTK.05",tanim:"QUANTUM RADYAL MATKAP-3",grup:"MATKAPLAR"}
],
"KESON HATTI":[{kod:"DTS.05",tanim:"MAX 305 EXTRA DAİRE TESTERE-2",grup:"DAİRE TESTERE MAKİNELERİ"}],
"MASA-1 HATTI":[{kod:"DTS.09",tanim:"MAX 305 EXTRA DAİRE TESTERE-1",grup:"DAİRE TESTERE MAKİNELERİ"}]
};

// ── BARKOD ETİKETİ İÇİN 4 HARFLİ İSTASYON KISALTMALARI ──────────────────────
// Yarımamül etiketinde rota aşamaları sadece bu 4 harfli kısaltmalarla
// yazılır (örn. CNCR, KENR, DELK) — mevcut 3 harfli makina kodu prefix'leri
// (HATLAR içindeki "CNC", "DLK" vb.) ile karışmaması için kasıtlı olarak
// FARKLI ve 4 harfli seçilmiştir. Yeni bir makina kategorisi eklenirse
// buraya da yeni bir 4 harfli kısaltma eklenmelidir.
const ISTASYON_KISALTMA = {
  BYK: 'BOYK', CNC: 'CNCR', DIK: 'DIKM', DLK: 'DELK', DTS: 'TEST',
  DUM: 'FRZR', FRZ: 'FREZ', KBM: 'KENB', KLV: 'KLVZ', KRB: 'KROB',
  KRT: 'KRTM', KUM: 'KOLI', KUT: 'KRTA', KYN: 'KYNK', MTK: 'MTKP',
  NEM: 'EBAT', PAN: 'PNLK', PRS: 'PRES', SBM: 'ABKN', SCK: 'GIYO',
  STS: 'SRTS', TBF: 'TBFR', TBK: 'TBKB', TBS: 'TBSS', TRS: 'TRAS',
  TSL: 'TASL', TUT: 'TUTK', UVB: 'UVBY', YKM: 'YIKM', ZMP: 'ZMPR'
};

function istasyonKisaltmasi(makinaKodu) {
  const prefix = (makinaKodu || '').split('.')[0];
  return ISTASYON_KISALTMA[prefix] || prefix.slice(0, 4).toUpperCase();
}

// ── İçe aktarılan kesim listesi örneği (824_JUDGE.xls'ten) ──────────────────────
// Her ürün: { kod, ad, parcalar:[{ad,kalinlik,renk,adet,boy,en,kabaBoy,kabaEn,aciklama}] }
const JUDGE_KESIM_SEED = [{"kod": "JD.M22090", "ad": "JUDGE MASA", "parcalar": [{"ad": "ÜST TABLA", "kalinlik": 18.0, "renk": "BAROK", "adet": 1.0, "boy": 2200.0, "en": 900.0, "kabaBoy": 2196.0, "kabaEn": 896.0, "aciklama": "SÜMEN YERİ"}, {"ad": "PERDE ÜST KAYIT", "kalinlik": 30.0, "renk": "SİYAH", "adet": 1.0, "boy": 1998.0, "en": 114.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "PERDE", "kalinlik": 18.0, "renk": "BAROK", "adet": 1.0, "boy": 1600.0, "en": 350.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "TABLA ETJR BAĞLANTI", "kalinlik": 30.0, "renk": "SİYAH", "adet": 2.0, "boy": 500.0, "en": 114.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}]}, {"kod": "JD.E17050", "ad": "JUDGE ETAJER", "parcalar": [{"ad": "ÜST TABLA", "kalinlik": 18.0, "renk": "BAROK", "adet": 1.0, "boy": 1700.0, "en": 500.0, "kabaBoy": 1696.0, "kabaEn": 496.0, "aciklama": null}, {"ad": "YAN", "kalinlik": 18.0, "renk": "SİYAH", "adet": 2.0, "boy": 529.0, "en": 478.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "ARKA", "kalinlik": 18.0, "renk": "SİYAH", "adet": 1.0, "boy": 1660.0, "en": 529.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "ÖN KAPAMA", "kalinlik": 18.0, "renk": "SİYAH", "adet": 2.0, "boy": 529.0, "en": 150.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "DİKME", "kalinlik": 18.0, "renk": "SİYAH", "adet": 4.0, "boy": 529.0, "en": 460.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "KAPAK", "kalinlik": 18.0, "renk": "SİYAH", "adet": 2.0, "boy": 526.0, "en": 461.0, "kabaBoy": 522.0, "kabaEn": 357.0, "aciklama": null}, {"ad": "KLAPA", "kalinlik": 18.0, "renk": "SİYAH", "adet": 3.0, "boy": 465.0, "en": 174.0, "kabaBoy": 461.0, "kabaEn": 170.0, "aciklama": null}, {"ad": "ÇEKMECE YAN", "kalinlik": 18.0, "renk": "SİYAH", "adet": 6.0, "boy": 390.0, "en": 120.0, "kabaBoy": null, "kabaEn": null, "aciklama": "20MM KANALLI"}, {"ad": "ÇEKMECE ÖN-ARKA", "kalinlik": 18.0, "renk": "SİYAH", "adet": 6.0, "boy": 404.0, "en": 100.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "ÇEKMECE ALT", "kalinlik": 8.0, "renk": "SİYAH", "adet": 3.0, "boy": 423.0, "en": 390.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}]}, {"kod": "JD.K5060", "ad": "JUDGE KESON", "parcalar": [{"ad": "ÜST TABLA", "kalinlik": 18.0, "renk": "BAROK", "adet": 1.0, "boy": 500.0, "en": 600.0, "kabaBoy": 496.0, "kabaEn": 596.0, "aciklama": null}, {"ad": "YAN", "kalinlik": 18.0, "renk": "SİYAH", "adet": 2.0, "boy": 560.0, "en": 529.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "ARKA", "kalinlik": 18.0, "renk": "SİYAH", "adet": 1.0, "boy": 529.0, "en": 498.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "KLAPA", "kalinlik": 18.0, "renk": "SİYAH", "adet": 3.0, "boy": 495.0, "en": 174.0, "kabaBoy": 491.0, "kabaEn": 170.0, "aciklama": null}, {"ad": "ÇEKMECE YAN", "kalinlik": 18.0, "renk": "SİYAH", "adet": 6.0, "boy": 390.0, "en": 120.0, "kabaBoy": null, "kabaEn": null, "aciklama": "20MM KANALLI"}, {"ad": "ÇEKMECE ÖN-ARKA", "kalinlik": 18.0, "renk": "SİYAH", "adet": 6.0, "boy": 416.0, "en": 100.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}, {"ad": "ÇEKMECE ALT", "kalinlik": 8.0, "renk": "SİYAH", "adet": 3.0, "boy": 435.0, "en": 390.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}]}, {"kod": "JD.S6060", "ad": "JUDGE SEHPA", "parcalar": [{"ad": "ÜST TABLA", "kalinlik": 18.0, "renk": "BAROK", "adet": 1.0, "boy": 600.0, "en": 600.0, "kabaBoy": 596.0, "kabaEn": 596.0, "aciklama": "KALINLAŞTIRMA"}, {"ad": "YAN", "kalinlik": 18.0, "renk": "SİYAH", "adet": 2.0, "boy": 596.0, "en": 349.0, "kabaBoy": 592.0, "kabaEn": 349.0, "aciklama": null}, {"ad": "KAYIT", "kalinlik": 18.0, "renk": "SİYAH", "adet": 1.0, "boy": 560.0, "en": 100.0, "kabaBoy": null, "kabaEn": null, "aciklama": null}]}];

// ── İçe aktarılan alt kırılım reçetesi örneği (RD_M_14080...'ten) ──────────────
// Hiyerarşi: sv (seviye) ile R(reçete/yarı mamül) ve S(stok/hammadde) satırları
const RDM_RECETE_SEED = [{"sv": 0, "tip": "R", "paket": "PKT 1/3", "kod": "RDM.14080.S2.PKT01.15", "ad": "Radical 14080 30mm — Paket 1/3 — Beyaz", "miktar": 1.0, "birim": "ADET", "birimFiyat": 905.42, "toplamFiyat": 905.42, "dvz": "₺", "olcu": null}, {"sv": 1, "tip": "R", "paket": null, "kod": "Y.STU.14080.S2.UTB00.15", "ad": "Standart 140x80 30mm Tabla - Beyaz", "miktar": 1.0, "birim": "ADET", "birimFiyat": 725.85, "toplamFiyat": 725.85, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "50.002.230.01.010.00", "ad": "SUNTALAM CY 30MM KAR BEYAZ 183x366 YUZEY:DS", "miktar": 1.0, "birim": "METRE", "birimFiyat": 422.001, "toplamFiyat": 519.905, "dvz": "₺", "olcu": "800×1400"}, {"sv": 2, "tip": "S", "paket": null, "kod": "50.010.01.001.07", "ad": "KENAR BANT PVC BEYAZ 2*33 5778SB EGGER", "miktar": 1.0, "birim": "METRE", "birimFiyat": 0.4, "toplamFiyat": 1.936, "dvz": "€", "olcu": "1600×2800"}, {"sv": 2, "tip": "R", "paket": null, "kod": "555.001.03.002.07", "ad": "AKSESUAR RADIKAL MASA TAKIMI OFIS", "miktar": 1.0, "birim": "ADET", "birimFiyat": 12.83, "toplamFiyat": 11.16, "dvz": "₺", "olcu": null}, {"sv": 3, "tip": "S", "paket": null, "kod": "81.05.014.300.00", "ad": "VIDA YSB M6*15", "miktar": 18.0, "birim": "ADET", "birimFiyat": 0.62, "toplamFiyat": 11.16, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "51.003.01.020.00", "ad": "MINIFIX METAL DUBEL 08*13MM M6 CINKO", "miktar": 24.0, "birim": "ADET", "birimFiyat": 0.96, "toplamFiyat": 23.04, "dvz": "₺", "olcu": null}, {"sv": 1, "tip": "R", "paket": null, "kod": "555.001.03.002.07", "ad": "AKSESUAR RADIKAL MASA TAKIMI OFIS", "miktar": 1.0, "birim": "ADET", "birimFiyat": 12.83, "toplamFiyat": 12.83, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.014.300.00", "ad": "VIDA YSB M6*15", "miktar": 18.0, "birim": "ADET", "birimFiyat": 0.62, "toplamFiyat": 11.16, "dvz": "₺", "olcu": null}, {"sv": 1, "tip": "R", "paket": null, "kod": "Y.STP.11035.PRD00.15", "ad": "Standart 1100x350mm Dikdortgen Perde - Beyaz", "miktar": 1.0, "birim": "ADET", "birimFiyat": 140.24, "toplamFiyat": 140.24, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "50.002.218.01.012.00", "ad": "SUNTALAM CY 18MM KAR BEYAZ 183x366 YUZEY:DS", "miktar": 1.0, "birim": "METRE", "birimFiyat": 245.549, "toplamFiyat": 103.99, "dvz": "₺", "olcu": "350×1100"}, {"sv": 2, "tip": "S", "paket": null, "kod": "50.010.01.001.00", "ad": "KENAR BANT PVC BEYAZ 0,40*22 5778SB EGGER", "miktar": 1.0, "birim": "METRE", "birimFiyat": 0.055, "toplamFiyat": 0.16, "dvz": "€", "olcu": "700×2200"}, {"sv": 2, "tip": "S", "paket": null, "kod": "51.003.01.020.00", "ad": "MINIFIX METAL DUBEL 08*13MM M6 CINKO", "miktar": 6.0, "birim": "ADET", "birimFiyat": 0.96, "toplamFiyat": 5.76, "dvz": "₺", "olcu": null}, {"sv": 1, "tip": "S", "paket": null, "kod": "51.003.01.020.00", "ad": "MINIFIX METAL DUBEL 08*13MM M6 CINKO", "miktar": 24.0, "birim": "ADET", "birimFiyat": 0.96, "toplamFiyat": 23.04, "dvz": "₺", "olcu": null}, {"sv": 0, "tip": "R", "paket": "PKT 2/3", "kod": "RDM.14080.S2.PKT02.97", "ad": "Radical 14080 30mm — Paket 2/3 — Fume", "miktar": 1.0, "birim": "ADET", "birimFiyat": 1726.02, "toplamFiyat": 1726.02, "dvz": "₺", "olcu": null}, {"sv": 1, "tip": "R", "paket": null, "kod": "200.DX.RD.001.080.001.97", "ad": "Radical 80lik Masa Ayagi - Hark Traversli - Fume", "miktar": 2.0, "birim": "ADET", "birimFiyat": 806.0, "toplamFiyat": 1612.0, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "R", "paket": null, "kod": "55.02.123.00", "ad": "B123 RADIKAL KOLISI", "miktar": 1.0, "birim": "ADET", "birimFiyat": 80.41, "toplamFiyat": 80.41, "dvz": "₺", "olcu": null}, {"sv": 3, "tip": "S", "paket": null, "kod": "55.110.100.02", "ad": "Z KARTON 100CM DOXA BASKILI", "miktar": 3.042, "birim": "METRE", "birimFiyat": 19.73, "toplamFiyat": 60.019, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.01.004.001.00", "ad": "SAC S=1,5MM 1X2M DKP", "miktar": 360.0, "birim": "GRAM", "birimFiyat": 0.001, "toplamFiyat": 0.317, "dvz": "$", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.01.001.201.14", "ad": "PROFIL 50X50X1,40MM DKP", "miktar": 2.185, "birim": "METRE", "birimFiyat": 2.19, "toplamFiyat": 5.264, "dvz": "$", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.009.001.00", "ad": "GAZ ALTI KAYNAK TELI O0.8MM GOBEKLI 15KG", "miktar": 0.04, "birim": "ADET", "birimFiyat": 1030.0, "toplamFiyat": 45.32, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.06.001.003.01", "ad": "KARBOSAN AL.OX.80 FLAP DISCS (115X22)", "miktar": 1.0, "birim": "ADET", "birimFiyat": 45.0, "toplamFiyat": 49.5, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.012.050.01", "ad": "M-8 ALTI-KOSE PUL KAFA PERCIN SOMUN", "miktar": 4.0, "birim": "ADET", "birimFiyat": 1.23, "toplamFiyat": 5.412, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.014.004.22", "ad": "M-8X15 CIVATA (IMBUS) GALVENIZLI ALYAN BASLI", "miktar": 5.0, "birim": "ADET", "birimFiyat": 1.23, "toplamFiyat": 6.765, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.012.004.00", "ad": "M-8 SOMUN GALVENIZLI", "miktar": 1.0, "birim": "ADET", "birimFiyat": 0.41, "toplamFiyat": 0.451, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "85.01.001.001", "ad": "PINGO AYAK AYARLI 50X50X5MM (alt ayarli)", "miktar": 2.0, "birim": "ADET", "birimFiyat": 10.0, "toplamFiyat": 22.0, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "85.10.01.006", "ad": "TOZ BOYA RAL 7015 TEKSTURE MAT FUME", "miktar": 55.0, "birim": "GRAM", "birimFiyat": 0.003, "toplamFiyat": 0.188, "dvz": "€", "olcu": null}, {"sv": 1, "tip": "R", "paket": null, "kod": "200.DX.RM100.017.005.97", "ad": "Rm 100 - Perde Tutucu - Fume", "miktar": 2.0, "birim": "ADET", "birimFiyat": 57.01, "toplamFiyat": 114.02, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.01.004.401.02", "ad": "SAC S=2,5MM 1,25X2,5M HRP", "miktar": 400.0, "birim": "GRAM", "birimFiyat": 0.001, "toplamFiyat": 0.308, "dvz": "$", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.014.004.22", "ad": "M-8X15 CIVATA (IMBUS) GALVENIZLI ALYAN BASLI", "miktar": 3.0, "birim": "ADET", "birimFiyat": 1.23, "toplamFiyat": 3.69, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "85.10.01.006", "ad": "TOZ BOYA RAL 7015 TEKSTURE MAT FUME", "miktar": 60.0, "birim": "GRAM", "birimFiyat": 0.003, "toplamFiyat": 0.205, "dvz": "€", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "55.01.002.01", "ad": "B2 BASKISIZ HIRDAVAT KUTUSU", "miktar": 0.5, "birim": "ADET", "birimFiyat": 4.11, "toplamFiyat": 2.055, "dvz": "₺", "olcu": null}, {"sv": 0, "tip": "R", "paket": "PKT 3/3", "kod": "RDM.14080.S2.PKT03.97", "ad": "Radical 14080 30mm — Paket 3/3 — Fume", "miktar": 1.0, "birim": "ADET", "birimFiyat": 623.64, "toplamFiyat": 623.64, "dvz": "₺", "olcu": null}, {"sv": 1, "tip": "R", "paket": null, "kod": "200.DX.RD.013.013.003.97", "ad": "Radical Buyuk Hareketli Travers - Fume", "miktar": 1.0, "birim": "ADET", "birimFiyat": 623.64, "toplamFiyat": 623.64, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.01.004.001.00", "ad": "SAC S=1,5MM 1X2M DKP", "miktar": 4944.0, "birim": "GRAM", "birimFiyat": 0.001, "toplamFiyat": 4.351, "dvz": "$", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.01.004.601.03", "ad": "SAC S=3MM 1,2X2,4", "miktar": 1104.0, "birim": "GRAM", "birimFiyat": 0.001, "toplamFiyat": 0.729, "dvz": "$", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.009.001.00", "ad": "GAZ ALTI KAYNAK TELI O0.8MM GOBEKLI 15KG", "miktar": 0.003, "birim": "ADET", "birimFiyat": 1030.0, "toplamFiyat": 3.399, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "85.10.01.006", "ad": "TOZ BOYA RAL 7015 TEKSTURE MAT FUME", "miktar": 110.0, "birim": "GRAM", "birimFiyat": 0.003, "toplamFiyat": 0.375, "dvz": "€", "olcu": null}, {"sv": 2, "tip": "R", "paket": null, "kod": "85.11.019.01", "ad": "M019 RADIKAL BUYUK HARK.TRAVERS KOLISI B.SIZ", "miktar": 1.0, "birim": "ADET", "birimFiyat": 57.16, "toplamFiyat": 57.16, "dvz": "₺", "olcu": null}, {"sv": 3, "tip": "S", "paket": null, "kod": "55.110.080.03", "ad": "Z KARTON 80CM BASKISIZ-BEYAZ", "miktar": 2.372, "birim": "METRE", "birimFiyat": 17.26, "toplamFiyat": 40.941, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.012.004.00", "ad": "M-8 SOMUN GALVENIZLI", "miktar": 2.0, "birim": "ADET", "birimFiyat": 0.41, "toplamFiyat": 0.82, "dvz": "₺", "olcu": null}, {"sv": 2, "tip": "S", "paket": null, "kod": "81.05.014.320.00", "ad": "VIDA YSB M8x30", "miktar": 2.0, "birim": "ADET", "birimFiyat": 0.0, "toplamFiyat": 0.0, "dvz": "₺", "olcu": null}];

// ── Hammadde kataloğu örnek verisi (plaka + hırdavat) ───────────────────────────
const HAMMADDE_SEED = [{"id": "HM-PLK-001", "tip": "plaka", "stokKodu": "50.002.230.01.010.00", "ad": "SUNTALAM CY 30MM KAR BEYAZ YUZEY:DS", "kalinlik": 30, "renk": "Beyaz", "en": 1830, "boy": 3660, "birim": "M2", "grainYonu": "yok", "birimFiyat": 422.0, "dvz": "TL", "tedarikci": "Kastamonu Entegre", "sonAlisTarihi": "2026-04-12", "sonTeklifTarihi": "2026-05-30", "fireYuzde": 8, "kdvOraniYuzde": 18}, {"id": "HM-PLK-002", "tip": "plaka", "stokKodu": "50.002.218.01.012.00", "ad": "SUNTALAM CY 18MM KAR BEYAZ YUZEY:DS", "kalinlik": 18, "renk": "Beyaz", "en": 1830, "boy": 3660, "birim": "M2", "grainYonu": "yok", "birimFiyat": 245.55, "dvz": "TL", "tedarikci": "Kastamonu Entegre", "sonAlisTarihi": "2026-04-12", "sonTeklifTarihi": "2026-05-30", "fireYuzde": 8, "kdvOraniYuzde": 18}, {"id": "HM-PLK-003", "tip": "plaka", "stokKodu": "50.003.118.07.044.00", "ad": "MDF LAM 18MM SİYAH YUZEY:DS", "kalinlik": 18, "renk": "Siyah", "en": 1830, "boy": 2750, "birim": "M2", "grainYonu": "var", "birimFiyat": 268.4, "dvz": "TL", "tedarikci": "Starwood", "sonAlisTarihi": "2026-05-02", "sonTeklifTarihi": "2026-06-01", "fireYuzde": 10, "kdvOraniYuzde": 18}, {"id": "HM-PLK-004", "tip": "plaka", "stokKodu": "50.003.130.07.044.00", "ad": "MDF LAM 30MM SİYAH YUZEY:DS", "kalinlik": 30, "renk": "Siyah", "en": 1830, "boy": 2750, "birim": "M2", "grainYonu": "var", "birimFiyat": 389.9, "dvz": "TL", "tedarikci": "Starwood", "sonAlisTarihi": "2026-05-02", "sonTeklifTarihi": "2026-06-01", "fireYuzde": 10, "kdvOraniYuzde": 18}, {"id": "HM-PLK-005", "tip": "plaka", "stokKodu": "50.004.108.12.090.00", "ad": "SUNTA HAM 8MM 183x366", "kalinlik": 8, "renk": "Ham", "en": 1830, "boy": 3660, "birim": "M2", "grainYonu": "yok", "birimFiyat": 162.3, "dvz": "TL", "tedarikci": "Kastamonu Entegre", "sonAlisTarihi": "2026-03-20", "sonTeklifTarihi": "2026-05-15", "fireYuzde": 7, "kdvOraniYuzde": 18}, {"id": "HM-PLK-006", "tip": "plaka", "stokKodu": "50.005.218.20.100.00", "ad": "MELAMİN KAPLI SUNTA 18MM BAROK DESEN", "kalinlik": 18, "renk": "Barok", "en": 2100, "boy": 2800, "birim": "M2", "grainYonu": "var", "birimFiyat": 312.75, "dvz": "TL", "tedarikci": "Egger", "sonAlisTarihi": "2026-05-28", "sonTeklifTarihi": "2026-06-10", "fireYuzde": 9, "kdvOraniYuzde": 18}, {"id": "HM-PLK-007", "tip": "plaka", "stokKodu": "81.01.004.001.00", "ad": "SAC S=1,5MM 1X2M DKP", "kalinlik": 1.5, "renk": "Çinko", "en": 1000, "boy": 2000, "birim": "KG", "grainYonu": "yok", "birimFiyat": 0.001, "dvz": "USD", "tedarikci": "Borçelik", "sonAlisTarihi": "2026-04-30", "sonTeklifTarihi": "2026-06-05", "fireYuzde": 5, "kdvOraniYuzde": 18}, {"id": "HM-PLK-008", "tip": "plaka", "stokKodu": "81.01.004.601.03", "ad": "SAC S=3MM 1,2X2,4", "kalinlik": 3, "renk": "Çinko", "en": 1200, "boy": 2400, "birim": "KG", "grainYonu": "yok", "birimFiyat": 0.00072, "dvz": "USD", "tedarikci": "Borçelik", "sonAlisTarihi": "2026-04-30", "sonTeklifTarihi": "2026-06-05", "fireYuzde": 5, "kdvOraniYuzde": 18}, {"id": "HM-HRD-001", "tip": "hirdavat", "stokKodu": "81.05.014.300.00", "ad": "VIDA YSB M6*15", "birim": "ADET", "birimFiyat": 0.62, "dvz": "TL", "tedarikci": "Würth", "sonAlisTarihi": "2026-05-10", "sonTeklifTarihi": "2026-06-01", "fireYuzde": 2, "kdvOraniYuzde": 18}, {"id": "HM-HRD-002", "tip": "hirdavat", "stokKodu": "51.003.01.020.00", "ad": "MINIFIX METAL DUBEL 08*13MM M6 CINKO", "birim": "ADET", "birimFiyat": 0.96, "dvz": "TL", "tedarikci": "Hettich", "sonAlisTarihi": "2026-05-10", "sonTeklifTarihi": "2026-06-01", "fireYuzde": 2, "kdvOraniYuzde": 18}, {"id": "HM-HRD-003", "tip": "hirdavat", "stokKodu": "50.010.01.001.07", "ad": "KENAR BANT PVC BEYAZ 2*33 5778SB EGGER", "birim": "METRE", "birimFiyat": 0.4, "dvz": "EUR", "tedarikci": "Egger", "sonAlisTarihi": "2026-05-22", "sonTeklifTarihi": "2026-06-08", "fireYuzde": 12, "kdvOraniYuzde": 18}, {"id": "HM-HRD-004", "tip": "hirdavat", "stokKodu": "50.010.01.001.00", "ad": "KENAR BANT PVC BEYAZ 0,40*22 5778SB EGGER", "birim": "METRE", "birimFiyat": 0.055, "dvz": "EUR", "tedarikci": "Egger", "sonAlisTarihi": "2026-05-22", "sonTeklifTarihi": "2026-06-08", "fireYuzde": 12, "kdvOraniYuzde": 18}, {"id": "HM-HRD-005", "tip": "hirdavat", "stokKodu": "555.001.03.002.07", "ad": "AKSESUAR RADIKAL MASA TAKIMI OFIS", "birim": "ADET", "birimFiyat": 12.83, "dvz": "TL", "tedarikci": "Yerli İmalat", "sonAlisTarihi": "2026-04-18", "sonTeklifTarihi": "2026-05-29", "fireYuzde": 1, "kdvOraniYuzde": 18}, {"id": "HM-HRD-006", "tip": "hirdavat", "stokKodu": "85.10.01.006", "ad": "TOZ BOYA RAL 7015 TEKSTURE MAT FUME", "birim": "GRAM", "birimFiyat": 0.003, "dvz": "EUR", "tedarikci": "Tiger Boya", "sonAlisTarihi": "2026-05-15", "sonTeklifTarihi": "2026-06-02", "fireYuzde": 15, "kdvOraniYuzde": 18}, {"id": "HM-HRD-007", "tip": "hirdavat", "stokKodu": "81.05.009.001.00", "ad": "GAZ ALTI KAYNAK TELI O0.8MM GOBEKLI 15KG", "birim": "ADET", "birimFiyat": 1030.0, "dvz": "TL", "tedarikci": "Kaynak Sarf", "sonAlisTarihi": "2026-04-25", "sonTeklifTarihi": "2026-05-30", "fireYuzde": 3, "kdvOraniYuzde": 18}, {"id": "HM-HRD-008", "tip": "hirdavat", "stokKodu": "85.01.001.001", "ad": "PINGO AYAK AYARLI 50X50X5MM (alt ayarli)", "birim": "ADET", "birimFiyat": 10.0, "dvz": "TL", "tedarikci": "Hafele", "sonAlisTarihi": "2026-05-05", "sonTeklifTarihi": "2026-06-04", "fireYuzde": 1, "kdvOraniYuzde": 18}];

// ── Standart stok plaka ölçüleri (kesim optimizasyonu için) ─────────────────────
const STOK_PLAKA_OLCULERI = [{"en": 1830, "boy": 3660, "ad": "Standart Büyük (183x366)"}, {"en": 2100, "boy": 2800, "ad": "Egger Standart (210x280)"}, {"en": 1220, "boy": 2440, "ad": "Küçük Plaka (122x244)"}];

// ── Genel sistem varsayılanları ──────────────────────────────────────────────
const VARSAYILAN_AYARLAR = {
  saatlikIscilikUcreti: 500,      // ₺/saat
  amortismanYuzde: 4,             // amortisman gideri %
  genelYonetimYuzde: 8,           // genel yönetim gideri %
  satisKariYuzde: 25,             // hedef satış kârı % (eski/genel hesap için)
  usdTry: 33.10,
  eurTry: 35.85,
  testereKayipPayiMM: 4,          // LİNEER TESTERE kesim payı / bıçak kalınlığı (mm)
  frezeKayipPayiMM: 3,            // CNC/FLAT-TABLA (freze) kesim payı — lineer testereden farklı, freze bıçağı/uç kalınlığına göre (mm)
  plakaKenarBosluguMM: 10,        // plaka kenarından bırakılan pay (mm)

  // ── Liste fiyatı formülü (Fiyatlama modülü) ──────────────────────────────
  // Liste Fiyatı = (Net Maliyet × (1+gygYuzde/100) × (1+nakliyeYuzde/100) × (1+karYuzde/100)) / boluKatsayisi
  fiyatGygYuzde: 10,    // genel yönetim gideri %
  fiyatNakliyeYuzde: 7, // nakliye/montaj gideri %
  fiyatKarYuzde: 54,    // hedef kâr %
  fiyatBoluKatsayisi: 0.45, // liste fiyatına çıkarmak için bölünen katsayı (örn. bayi/distribütör payı vb.)

  // ── Bordro/SGK/Tazminat parametreleri (2026, Bakım/İK modülü) ──────────────
  brutAsgariUcret: 33030.00,
  netAsgariUcret: 28075.50,
  sgkTavanKatsayisi: 9,
  sgkIsciPrimYuzde: 14,
  issizlikIsciPrimYuzde: 1,
  sgkIsverenPrimYuzde: 15.75,
  issizlikIsverenPrimYuzde: 2,
  damgaVergisiOraniBinde: 7.59,
  kidemTazminatiTavani: 53919.68,

  // ── Cari / Vade Farkı Parametresi (manuel, TCMB politika faizine göre siz güncellersiniz) ──
  aylikVadeFarkiFaizOrani: 4.25, // % (aylık) — Cari İşlemler ve Yönetim onayında vadesi geçen bakiyeler için kullanılır
  kdvOraniYuzde: 20 // % varsayılan KDV oranı (otomatik fatura oluşturmada kullanılır, müşteri carisinde farklı tanımlıysa o öncelikli olur)
};

// ── Örnek müşteri (cari) seed verisi ─────────────────────────────────────────
const MUSTERI_SEED = [
  { id: 'MUS-001', unvan: 'Acar Mobilya Dekorasyon Ltd. Şti.', vergiDairesi: 'İkitelli V.D.', vergiNo: '1234567890', telefon: '0212 555 10 20', email: 'satinalma@acarmobilya.com.tr', adres: 'İkitelli OSB, İstanbul', bankaHesap: 'TR12 0006 4000 0011 2345 6789 01', odemeVadeGun: 45, ihracat: false, bakiye: 0 },
  { id: 'MUS-002', unvan: 'Belux Home Furniture (İhracat)', vergiDairesi: 'Bornova V.D.', vergiNo: 'EXP-998811', telefon: '+90 232 444 30 10', email: 'orders@beluxhome.com', adres: 'Atatürk OSB, İzmir', bankaHesap: 'TR45 0001 0012 3456 7890 1234 56', odemeVadeGun: 60, ihracat: true, bakiye: 0 },
  { id: 'MUS-003', unvan: 'Star Yapı Market A.Ş.', vergiDairesi: 'Ostim V.D.', vergiNo: '5544332211', telefon: '0312 333 22 11', email: 'muhasebe@staryapi.com.tr', adres: 'Ostim OSB, Ankara', bankaHesap: 'TR78 0011 1000 0098 7654 3210 99', odemeVadeGun: 30, ihracat: false, bakiye: 0 }
];

// ── Örnek tedarikçi seed verisi (satınalma teklif karşılaştırma için) ───────
const TEDARIKCI_SEED = [
  { id: 'TED-001', unvan: 'Kastamonu Entegre', kategori: 'plaka', telefon: '0366 222 10 00', email: 'satis@kastamonuentegre.com.tr' },
  { id: 'TED-002', unvan: 'Egger Türkiye', kategori: 'plaka', telefon: '0224 444 20 00', email: 'siparis@egger.com.tr' },
  { id: 'TED-003', unvan: 'Starwood', kategori: 'plaka', telefon: '0262 333 40 00', email: 'satis@starwood.com.tr' },
  { id: 'TED-004', unvan: 'Hettich Türkiye', kategori: 'hirdavat', telefon: '0216 555 60 00', email: 'satis@hettich.com.tr' },
  { id: 'TED-005', unvan: 'Würth Türkiye', kategori: 'hirdavat', telefon: '0216 444 70 00', email: 'siparis@wurth.com.tr' },
  { id: 'TED-006', unvan: 'Hafele Türkiye', kategori: 'hirdavat', telefon: '0216 333 80 00', email: 'satis@hafele.com.tr' }
];

// ════════════════════════════════════════════════════════════════════════════
// BORDRO / SGK / TAZMİNAT PARAMETRELERİ (2026 — Ayarlar'dan güncellenebilir)
// ÖNEMLİ: Bu rakamlar Ocak/Temmuz aylarında resmi tebliğlerle değişir. Burada
// 2026 yılı başı itibarıyla yayımlanan resmi değerler kullanılmıştır, ancak
// bu modül RESMİ BİR BORDRO YAZILIMININ YERİNİ TUTMAZ — gerçek ödeme öncesi
// mali müşavirinizle doğrulayın. Kaynak: 2026 yılı 332 No'lu Gelir Vergisi
// Genel Tebliği, SGK 2026 parametreleri, Hazine ve Maliye Bakanlığı genelgesi.
// ════════════════════════════════════════════════════════════════════════════
const BORDRO_AYARLARI_VARSAYILAN = {
  brutAsgariUcret: 33030.00,           // 2026 brüt asgari ücret (SGK tabanı)
  netAsgariUcret: 28075.50,            // 2026 net asgari ücret (referans)
  sgkTavanKatsayisi: 9,                // SGK tavanı = brüt asgari ücret × 9
  sgkIsciPrimYuzde: 14,                // SGK işçi payı (malullük-yaşlılık-ölüm + genel sağlık)
  issizlikIsciPrimYuzde: 1,            // işsizlik sigortası işçi payı
  sgkIsverenPrimYuzde: 15.75,          // SGK işveren payı (İMALAT sektörü 5 puan indirimli varsayılan — Ayarlar'dan değiştirilebilir)
  issizlikIsverenPrimYuzde: 2,         // işsizlik sigortası işveren payı
  damgaVergisiOraniBinde: 7.59,        // damga vergisi oranı (binde)
  gelirVergisiDilimleri: [             // 2026 kümülatif matrah dilimleri (yıllık TL eşikleri) ve oranlar
    { ust: 190000, oran: 15 },
    { ust: 460000, oran: 20 },
    { ust: 1280000, oran: 27 },
    { ust: 4720000, oran: 35 },
    { ust: Infinity, oran: 40 }
  ],
  kidemTazminatiTavani: 53919.68,      // 2026 ilk yarı kıdem tazminatı tavanı (TL/yıl)
  ihbarSuresiHaftalar: [               // kıdem yılına göre ihbar süresi (hafta)
    { altYil: 0.5, hafta: 2 },
    { altYil: 1.5, hafta: 4 },
    { altYil: 3, hafta: 6 },
    { altYil: Infinity, hafta: 8 }
  ]
};

// ── Örnek makina/teçhizat seed verisi (Bakım modülü) ─────────────────────────
const MAKINA_TECHIZAT_SEED = [
  { id: 'MKN-001', kod: 'MKN-001', ad: 'CNC Router (Biesse Rover)', kategori: 'CNC', alisTarihi: '2020-03-15', alisFiyati: 1850000, amortismanYili: 10, zimmetliPersonelId: null, konum: 'Üretim Atölyesi', durum: 'aktif' },
  { id: 'MKN-002', kod: 'MKN-002', ad: 'Kenar Bantlama Makinesi (Holzher)', kategori: 'Bantlama', alisTarihi: '2019-07-01', alisFiyati: 980000, amortismanYili: 10, zimmetliPersonelId: null, konum: 'Üretim Atölyesi', durum: 'aktif' },
  { id: 'MKN-003', kod: 'MKN-003', ad: 'Panel Kesim Testeresi (Altendorf)', kategori: 'Kesim', alisTarihi: '2021-11-20', alisFiyati: 650000, amortismanYili: 10, zimmetliPersonelId: null, konum: 'Üretim Atölyesi', durum: 'aktif' },
  { id: 'MKN-004', kod: 'MKN-004', ad: 'Forklift (Toyota 2.5 ton)', kategori: 'Lojistik', alisTarihi: '2022-02-10', alisFiyati: 420000, amortismanYili: 10, zimmetliPersonelId: null, konum: 'Depo', durum: 'aktif' }
];

// ── Örnek personel seed verisi (İK modülü) ───────────────────────────────────
const PERSONEL_SEED = [
  { id: 'PRS-001', adSoyad: 'Mehmet Yılmaz', tcKimlik: '11111111110', bolum: 'yonetim', gorevUnvani: 'Genel Müdür', iseGirisTarihi: '2015-01-10', brutMaas: 120000, gorevTanimi: 'Şirketin genel yönetimi, stratejik kararlar, departmanlar arası koordinasyon.', vekaletPersonelId: null, telefon: '0532 111 11 11', email: 'mehmet.yilmaz@firma.com.tr', adres: '', durum: 'aktif' },
  { id: 'PRS-002', adSoyad: 'Ayşe Demir', tcKimlik: '22222222220', bolum: 'arge', gorevUnvani: 'ARGE Mühendisi', iseGirisTarihi: '2018-06-01', brutMaas: 45000, gorevTanimi: 'Ürün reçetesi ve kırılım hazırlama, yeni ürün geliştirme, teknik çizimler.', vekaletPersonelId: null, telefon: '0532 222 22 22', email: 'ayse.demir@firma.com.tr', adres: '', durum: 'aktif' },
  { id: 'PRS-003', adSoyad: 'Ali Kaya', tcKimlik: '33333333330', bolum: 'uretim_planlama', gorevUnvani: 'Üretim Planlama Şefi', iseGirisTarihi: '2017-03-15', brutMaas: 42000, gorevTanimi: 'Üretim kuyruğu yönetimi, kapasite planlama, hammadde ihtiyacı takibi.', vekaletPersonelId: 'PRS-004', telefon: '0532 333 33 33', email: 'ali.kaya@firma.com.tr', adres: '', durum: 'aktif' },
  { id: 'PRS-004', adSoyad: 'Fatma Şahin', tcKimlik: '44444444440', bolum: 'depo', gorevUnvani: 'Depo Sorumlusu', iseGirisTarihi: '2019-09-01', brutMaas: 33030, gorevTanimi: 'Depo stok takibi, malzeme düşümü, satınalma teslim kontrolü.', vekaletPersonelId: null, telefon: '0532 444 44 44', email: 'fatma.sahin@firma.com.tr', adres: '', durum: 'aktif' },
  { id: 'PRS-005', adSoyad: 'Hasan Çelik', tcKimlik: '55555555550', bolum: 'satinalma', gorevUnvani: 'Satınalma Uzmanı', iseGirisTarihi: '2021-01-20', brutMaas: 38000, gorevTanimi: 'Tedarikçi yönetimi, fiyat teklifi karşılaştırma, satınalma siparişi oluşturma.', vekaletPersonelId: null, telefon: '0532 555 55 55', email: 'hasan.celik@firma.com.tr', adres: '', durum: 'aktif' },
  { id: 'PRS-006', adSoyad: 'Zeynep Arslan', tcKimlik: '66666666660', bolum: 'bakim', gorevUnvani: 'Bakım Teknisyeni', iseGirisTarihi: '2020-05-11', brutMaas: 35000, gorevTanimi: 'Makina periyodik bakımı, arıza giderme, servis takibi.', vekaletPersonelId: null, telefon: '0532 666 66 66', email: 'zeynep.arslan@firma.com.tr', adres: '', durum: 'aktif' }
];

// ── Örnek araç seed verisi (İK modülü) ───────────────────────────────────────
const ARAC_SEED = [
  { id: 'ARC-001', plaka: '34 ABC 123', marka: 'Ford Transit', model: '2021', tip: 'Servis Aracı', zimmetliPersonelId: 'PRS-005', durum: 'aktif' },
  { id: 'ARC-002', plaka: '34 XYZ 456', marka: 'Renault Clio', model: '2022', tip: 'Binek', zimmetliPersonelId: 'PRS-001', durum: 'aktif' }
];
