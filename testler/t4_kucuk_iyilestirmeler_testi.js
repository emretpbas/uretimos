// T4: KÜÇÜK İYİLEŞTİRMELER — audit'in "her biri küçük, tek tek değerlendirilip
// düzeltilecek veya bilinçli olarak atlanacak" dediği 9 maddelik liste teker
// teker ele alındı. Bu test, DÜZELTİLEN maddeleri doğrular (araclar/
// aracGiderleri hassas listede değildi; siparis.durum='uretimde' ölü kod;
// irsaliye kalem miktarı üst sınırsızdı; Tedarikçi Karnesi teslim skoru hep
// boştu; rutin bakım iki tutarsız yoldan kapatılabiliyordu; duruş kaydının
// tarih/istasyon referansı zayıftı; teklif durum pill'i bilinmeyen durumları
// sessizce "Taslak" gösteriyordu). Bilinçli olarak ATLANAN iki madde
// (karşılıksız çek yalnızca 'elde'de çalışıyor — ciro edilmiş çek için tam
// rücu/borç muhasebesi gerektirir, kapsam dışı bırakıldı; otomasyon_motor.js
// — gerçek bir makine gateway'i olmadığı için kasıtlı olarak entegre
// edilmemiş, iyi test edilmiş ileriye dönük altyapı, silinmesi yıkıcı olur)
// bu testte YOKTUR — kod tabanında hiçbir değişiklik yapılmadı.
const fs = require('fs'), path = require('path');
const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'api.php'), 'utf8');
const sevkSrc = fs.readFileSync(path.join(__dirname, '..', 'page_sevkiyat_panel.js'), 'utf8');
const cariSrc = fs.readFileSync(path.join(__dirname, '..', 'page_cari_panel.js'), 'utf8');
const kokpitSrc = fs.readFileSync(path.join(__dirname, '..', 'page_ust_yonetim_kokpit.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const bakimSrc = fs.readFileSync(path.join(__dirname, '..', 'page_bakim_panel.js'), 'utf8');
const uretimEkraniSrc = fs.readFileSync(path.join(__dirname, '..', 'page_uretim_ekrani.js'), 'utf8');
const teklifSrc = fs.readFileSync(path.join(__dirname, '..', 'page_teklif.js'), 'utf8');
let ok = 0, bad = 0;
const t = (a, k) => { if (k) { ok++; console.log('  GECTI ' + a); } else { bad++; console.log('  KALDI ' + a); } };

console.log('\n-- Madde 5: araclar/aracGiderleri hassas koleksiyon listesine eklendi --');
t('HASSAS_OKUMA araclar içeriyor', /'araclar'\s*=>\s*\['ik', 'muhasebe'\],/.test(apiSrc));
t('HASSAS_OKUMA aracGiderleri içeriyor', /'aracGiderleri'\s*=>\s*\['ik', 'muhasebe'\],/.test(apiSrc));
t('HASSAS_YAZMA araclar içeriyor', /'araclar'\s*=>\s*\['ik'\],/.test(apiSrc));

console.log('\n-- Madde 2: siparis.durum="uretimde" ölü kod TEMİZLENDİ (4 dosya) --');
t('page_sevkiyat_panel.js sevkEdilebilir artık uretimde kontrolü yapmıyor',
  !/s\.durum === 'uretimde'/.test(sevkSrc) && /const sevkEdilebilir = siparisler\.filter\(s => \(s\.durum === 'onaylandi' \|\| s\.durum === 'kismi_sevk_edildi'\)/.test(sevkSrc));
t('page_cari_panel.js faturaKesilebilir artık uretimde kontrolü yapmıyor',
  /const faturaKesilebilir = siparisler\.filter\(s => s\.durum === 'onaylandi' && s\.uretimDurumu === 'tamamlandi'/.test(cariSrc));
t('page_cari_panel.js gecikmiş sipariş raporu artık uretimde kontrolü yapmıyor',
  /siparisler\.filter\(s => s\.durum === 'onaylandi' \|\| s\.durum === 'sevk_edildi' \|\| s\.durum === 'kismi_sevk_edildi'\)\.forEach/.test(cariSrc));
t('page_ust_yonetim_kokpit.js bekleyenSevkiyat artık uretimde kontrolü yapmıyor',
  /const bekleyenSevkiyat = siparisler\.filter\(s => s\.durum === 'onaylandi'\)\.length;/.test(kokpitSrc));

console.log('\n-- Madde 3: irsaliye kalem miktarı artık sipariş miktarını aşamıyor --');
t('kalemler maksimumMiktar alanı taşıyor', /maksimumMiktar: kalan/.test(sevkSrc));
t('onchange handler maksimumMiktar\'ı aşan girişi kelepçeliyor',
  /else if \(kalem\.maksimumMiktar != null && m > kalem\.maksimumMiktar\) \{[\s\S]{0,200}m = kalem\.maksimumMiktar;/.test(sevkSrc));
t('input alanına max attribute da ekleniyor (UX)', /\$\{k\.maksimumMiktar != null \? 'max="' \+ k\.maksimumMiktar \+ '"' : ''\}/.test(sevkSrc));

console.log('\n-- Madde 4: Tedarikçi Karnesi teslim skoru için beklenenTarih artık dolduruluyor --');
t('satinalmaSiparisiOnaylaninceDepoGirisiOlustur artık beklenenTarih yazıyor',
  /beklenenTarih: siparis\.tahminiGirisTarihi \|\| null,/.test(appSrc));

console.log('\n-- Madde 7: rutin bakım iki yol da artık audit kaydı bırakıyor (tutarlı) --');
t('genel düzenleme formu değişen sonBakimTarihi için bakımKayitlari oluşturuyor',
  /if \(d\.id && yeniSonBakim && yeniSonBakim !== \(d\.sonBakimTarihi \|\| null\)\) \{[\s\S]{0,600}await App\.persist\(\(\) => Store\.bakimKayitlari\.save\(kayitlar\)\);/.test(bakimSrc));
t('yeni makina oluştururken (d.id yok) audit kaydı OLUŞTURULMUYOR (koşul d.id kontrolü içeriyor)',
  /if \(d\.id && yeniSonBakim/.test(bakimSrc));

console.log('\n-- Madde 9: duruş kaydı artık yapılandırılmış istasyon referansı + seçilebilir tarih taşıyor --');
t('tumIstasyonlar artık hat bilgisini de taşıyor', /tumIstasyonlar\.push\(\{ rotaAdi: r\.ad, kod: s\.kod, tanim: s\.tanim, hat: s\.hat \|\| null \}\)/.test(uretimEkraniSrc));
t('seçim artık index bazlı (aynı kod farklı rotalarda karışmıyor)',
  /\$\{tumIstasyonlar\.map\(\(i, idx\) => `<option value="\$\{idx\}">/.test(uretimEkraniSrc));
t('kayıt istasyonKodu/hat/rotaAdi yapılandırılmış alanlarını taşıyor',
  /istasyonKodu: secilen \? secilen\.kod : null,\s*\n\s*hat: secilen \? secilen\.hat : null,\s*\n\s*rotaAdi: secilen \? secilen\.rotaAdi : null,/.test(uretimEkraniSrc));
t('tarih artık kullanıcı tarafından seçilebiliyor (id="df-tarih")', /id="df-tarih" type="date"/.test(uretimEkraniSrc));
t('kayıt tarihi artık formdan okunuyor (sabit "şimdi" değil)',
  /tarih: document\.getElementById\('df-tarih'\)\.value \|\| new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(uretimEkraniSrc));

console.log('\n-- Madde 1: teklif durum pill\'i artık TeklifTakipMotor\'un yazdığı durumları da tanıyor --');
t('kazanildi artık tanınıyor (eskiden sessizce "Taslak" gösterirdi)', /kazanildi: \['✓ Kazanıldı \(Müşteri Kabul Etti\)', 'pill-green'\]/.test(teklifSrc));
t('kaybedildi/iptal/beklemede/revize de tanınıyor', /kaybedildi: \['✗ Kaybedildi', 'pill-red'\], iptal: \['İptal \/ Vazgeçildi', 'pill-gray'\]/.test(teklifSrc) &&
  /beklemede: \['Müşteride Bekliyor', 'pill-amber'\], revize: \['Revize İsteniyor', 'pill-amber'\]/.test(teklifSrc));
t('Siparişe Dönüştür butonu artık kaybedilmiş/iptal teklifte gösterilmiyor',
  /!\['siparise_donustu', 'silme_talebinde', 'kaybedildi', 'iptal'\]\.includes\(t\.durum\)/.test(teklifSrc));

console.log('\n-- Bilinçli atlanan maddeler: kod tabanında İLGİSİZ değişiklik YOK (regresyon kontrolü) --');
{
  const cekSrc = fs.readFileSync(path.join(__dirname, '..', 'page_cek_portfoy.js'), 'utf8');
  t('Madde 6 (karşılıksız çek): karsiliksiz hâlâ yalnızca elde\'den ulaşılabiliyor (bilinçli atlandı)',
    /c\.durum === 'elde' \? `[\s\S]{0,150}cp-karsiliksiz/.test(cekSrc));
  const otomasyonVarMi = fs.existsSync(path.join(__dirname, '..', 'otomasyon_motor.js'));
  t('Madde 8 (otomasyon_motor.js): dosya SİLİNMEDİ (bilinçli atlandı, ileriye dönük altyapı korundu)', otomasyonVarMi);
}

console.log('\nSONUC: ' + ok + ' gecti, ' + bad + ' kaldi');
process.exit(bad ? 1 : 0);
