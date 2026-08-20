// DWG (AutoCAD) okuma: tembel yukleme, mobil koruma, kesif cekirdegi
const fs=require('fs'),path=require('path');
const KOK=path.join(__dirname,'..');
const dw=fs.readFileSync(path.join(KOK,'dwg_okuyucu.js'),'utf8');
const po=fs.readFileSync(path.join(KOK,'plan_okuyucu.js'),'utf8');
const pt=fs.readFileSync(path.join(KOK,'page_proje_teklif.js'),'utf8');
const bj=fs.readFileSync(path.join(KOK,'build.js'),'utf8');
const wk=fs.readFileSync(path.join(KOK,'vendor/dwg/dwg_worker.js'),'utf8');
const vht=fs.readFileSync(path.join(KOK,'vendor/dwg/.htaccess'),'utf8');
let ok=0,bad=0;const t=(a,k)=>{if(k){ok++;console.log('  GECTI '+a)}else{bad++;console.log('  KALDI '+a)}};

console.log('\n-- KUTUPHANE --');
t('wasm dosyasi mevcut', fs.existsSync(path.join(KOK,'vendor/dwg/wasm/libredwg-web.wasm')));
t('TARAYICI paketi mevcut (dist)', fs.existsSync(path.join(KOK,'vendor/dwg/dist/libredwg-bundle.js')));
t('wasm alt klasorde (bundle ../wasm/ ariyor)', fs.existsSync(path.join(KOK,'vendor/dwg/wasm/libredwg-web.js')));
const bundle=fs.readFileSync(path.join(KOK,'vendor/dwg/dist/libredwg-bundle.js'),'utf8');
t('bundle da uzantisiz import YOK (tarayici cozemez)', !/from ['"]\.\/[^'"]*['"]/.test(bundle));
const ht=fs.readFileSync(path.join(KOK,'.htaccess'),'utf8');
t('sunucu wasm MIME tipi tanimli', /AddType application\/wasm \.wasm/.test(ht));
t('wasm gzip lenecek (9.5MB -> ~2.5MB)', /DEFLATE application\/wasm/.test(ht));
t('wasm uzun onbellekte', /ExpiresByType application\/wasm/.test(ht));
t('ANA uygulamada unsafe-eval YOK (guvenlik)', !/script-src[^;]*'unsafe-eval'/.test(ht.replace(/wasm-unsafe-eval/g,'X')));
t('ana htaccess worker-src tanimli', /worker-src 'self'/.test(ht));
t('CAD klasorunun KENDI htaccess i var', vht.length>100);
t('izin YALNIZCA CAD klasorunde', /script-src 'self' 'unsafe-eval'/.test(vht));
t('CAD klasorunde wasm MIME de var', /AddType application\/wasm/.test(vht));
t('gerekce belgelenmis', /XSS korumasını ciddi biçimde zayıflatır/.test(vht));
t('CSP tek yerde tanimli (cakisma yok)', (ht.match(/Content-Security-Policy/g)||[]).length===1);
t('CSP izni gerekcesi belgelenmis', /Web Worker'da/.test(ht) || /worker/i.test(ht));

console.log('\n-- HATA MESAJLARI (kullaniciya yol gosterir) --');
t('CSP hatasi cevriliyor (worker)', /güvenlik izni eksik/.test(wk));
t('CSP cozumu soyleniyor (worker)', /vendor\/dwg\/\.htaccess dosyası/.test(wk));
t('MIME hatasi cevriliyor (worker)', /yanlış türde gönderiyor/.test(wk));
t('MIME cozumu soyleniyor (worker)', /AddType application\/wasm/.test(wk));
t('GPL lisansi belgelendi', fs.existsSync(path.join(KOK,'vendor/dwg/LISANS.txt')));
t('build vendor u OLDUGU GIBI kopyaliyor', /vendor.*klasoruKopyala|klasoruKopyala\(tamYol/.test(bj));
t('wasm minify EDILMIYOR', /derlenmiş\/küçültülmüştür/.test(bj));

console.log('\n-- TEMBEL YUKLEME (kritik) --');
t('wasm acilista YUKLENMIYOR', !/dwg_okuyucu[\s\S]*?<script[^>]*wasm/.test(fs.readFileSync(path.join(KOK,'index.html'),'utf8')));
t('WORKER kullaniliyor (CSP izolasyonu)', /new Worker\(yol, \{ type: 'module' \}\)/.test(dw));
t('worker yolu mutlak cozuluyor', /new URL\('vendor\/dwg\/dwg_worker\.js', document\.baseURI\)/.test(dw));
t('worker paketi kendi konumundan yukluyor', /import\('\.\/dist\/libredwg-bundle\.js'\)/.test(wk));
t('worker ilerleme bildiriyor', /bildir\('ilerleme'/.test(wk));
t('worker hatayi anlasilir cevirıyor'.replace('ı','i'), /güvenlik izni eksik/.test(wk));
t('ArrayBuffer aktariliyor (kopyalanmiyor)', /postMessage\(\{ tip: 'coz', veri: buf \}, \[buf\]\)/.test(dw));
t('hata sonrasi worker sifirlaniyor', /kapat\(\);/.test(dw));
t('hata mesaji sebebi gosteriyor', /\(e && e\.message\) \|\| e/.test(dw));
t('tek seferlik yukleme (es zamanli cagri korumasi)', /_yukleniyor/.test(dw));
t('worker tekrar kullaniliyor (yeniden yukleme yok)', /if \(_worker\) return _worker/.test(dw));
t('ilerleme bildirimi var', /CAD motoru yükleniyor/.test(wk));

console.log('\n-- MOBIL KORUMASI --');
t('mobil algilama var', /function mobilMi/.test(dw));
t('mobilde ONAY isteniyor', /window\.confirm\(DwgOkuyucu\.mobilUyari\(\)\)/.test(pt));
t('kullanici reddederse iptal', /İptal edildi/.test(pt));
t('PDF alternatifi oneriliyor', /PDF çıkarıp yükleyebilirsiniz|PDF çıkarıp yükleyin/.test(dw+pt));
t('boyut uyarisi net (9.5 MB)', /WASM_BOYUT_MB = 9\.5/.test(dw));

console.log('\n-- KESIF CEKIRDEGI ORTAK --');
t('kesifCekirdek ayri fonksiyon', /function kesifCekirdek\(metinler, secenek\)/.test(po));
t('PDF sarmalayicisi', /async function kesifCikar\(dosya, sayfaNo, secenek\)/.test(po));
t('DWG sarmalayicisi', /async function dwgKesif\(dosya, secenek, ilerleme\)/.test(po));
// PDF ve DWG sarmalayicilarinin ikisi de ortak cekirdegi cagirmali
const cagrilar=(po.match(/kesifCekirdek\(/g)||[]).length;
t('ortak cekirdek 3 yerde (1 tanim + 2 cagri)', cagrilar===3);
t('PDF cekirdegi cagiriyor', /return kesifCekirdek\(metinler, secenek\)/.test(po));
t('DWG cekirdegi cagiriyor', /kesifCekirdek\(d\.metinler, secenek\)/.test(po));

console.log('\n-- DWG OZEL DUZELTMELER --');
t('sade kapi olcusu taniniyor (90/200)', /\^\(6\\d\|\[7-9\]\\d\|1\[0-6\]\\d\)/.test(po));
t('kapi olcusu makul araliga sinirli', /19\\d\|2\[0-6\]\\d/.test(po));
t('2 harfli mahal adi kabul (WC)', /A-ZÇĞİÖŞÜ0-9\\s\.\\-\]\{1,28\}/.test(po));
t('MTEXT bicim kodlari temizleniyor', /metniTemizle/.test(wk) && /\\\\P/.test(wk));
t('cok satirli MTEXT bolunuyor', /temiz\.split\('\\n'\)\.forEach/.test(wk));

console.log('\n-- EKRAN --');
t('dwg dosyasi kabul ediliyor', /accept="\.pdf,\.dwg"/.test(pt));
t('DWG once kontrol ediliyor', /DwgOkuyucu\.dwgDosyasiMi\(f\)/.test(pt));
t('surum ve varlik sayisi gosteriliyor', /dk\.varlikSayisi/.test(pt));
t('mahal bulunamazsa uyari', /Çizimde mahal adı bulunamadı/.test(pt));

console.log('\n-- SUNUCU TESHISI --');
t('teshis fonksiyonu var', /async function sunucuTeshisi/.test(dw));
t('gercek CSP basligi okunuyor', /headers\.get\('content-security-policy'\)/.test(dw));
t('wasm izni kontrol ediliyor', /wasm-unsafe-eval\|'unsafe-eval'/.test(dw));
t('wasm dosyasi ulasilabilirlik testi', /vendor\/dwg\/wasm\/libredwg-web\.wasm/.test(dw));
t('MIME tipi kontrol ediliyor', /application\\\/wasm\/i\.test\(rapor\.wasmTipi\)/.test(dw));
t('CSP yoksa da not veriyor', /CSP başlığı GÖNDERMİYOR/.test(dw));
t('teshis disa acildi', /sunucuTeshisi, WASM_BOYUT_MB/.test(dw));
t('teshis WORKER CSP sini de kontrol ediyor', /workerCsp/.test(dw));
t('CAD klasoru izni ekranda gosteriliyor', /CAD klasörü izni/.test(pt));
t('sunucu dogruysa YENILEME oneriliyor', /Sayfayı yenileyip \(Ctrl\+Shift\+R\)/.test(dw));
t('CSP nin sayfa acilisinda uygulandigi aciklanmis', /CSP sayfa YÜKLENİRKEN uygulanır/.test(dw));
t('yenileme butonu ekranda', /mi-yenile/.test(pt));
t('hata ekraninda teshis butonu', /mi-teshis/.test(pt));
t('teshis sonucu ekranda gosteriliyor', /Sunucudan gelen ayarlar/.test(pt));

console.log('\nSONUC: '+ok+' gecti, '+bad+' kaldi');process.exit(bad?1:0);
