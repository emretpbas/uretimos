@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM ÜretimOS Kesim eklentisi — TEK TIKLA derle + kurulum dosyası (Setup.exe) üret
REM ============================================================================
REM Kullanıcı isteği: "herhangi bir bilgisayara başka bir program ve yazılım
REM gerekmeden kurulabilecek bir install.exe dosyası haline getirelim" — SON
REM KULLANICI tarafı zaten kurulum\UretimOSKesim.iss (Inno Setup betiği) ile
REM ÇÖZÜLDÜ: o betikten üretilen UretimOSKesimSetup.exe, başka bir
REM bilgisayara götürülüp SolidWorks açıkken/kapalıyken kontrol edilerek tek
REM çift tıkla kurulur — hedef makinede Visual Studio, Inno Setup, elle
REM regasm vb. HİÇBİR EK YAZILIM/ADIM gerekmez (.NET Framework RegAsm'ı
REM Windows'ta zaten hazır gelir, bkz. .iss'teki GetRegAsmPath notu).
REM
REM Bu .bat dosyası ise GELİŞTİRME makinesinde (bu projeyi değiştirdiğinizde)
REM o Setup.exe'yi ÜRETMEK için gereken iki elle adımı (derleme + Inno Setup
REM Compiler'da F9) tek çift tıkla otomatikleştirir — README.md'nin "A)
REM Otomatik kurulum" bölümündeki 2-3 elle adımın YERİNE geçer.
REM
REM ÖN KOŞUL (yalnızca BU (geliştirme) makinesinde, bir kerelik):
REM   - .NET SDK (Visual Studio ile birlikte zaten kurulu) — projeyi derlemek için.
REM   - Inno Setup Compiler (ücretsiz, ~3 MB) — https://jrsoftware.org/isdl.php
REM     (varsayılan yola kurulursa bu betik kendisi bulur; farklı bir yere
REM     kurduysanız ISCC.exe'yi PATH'e ekleyin.)
REM
REM KULLANIM: bu dosyayı çift tıklatın (Gezgin'den "kurulum" klasörü içinde).
REM Başarılı olursa en altta "kurulum\Output\UretimOSKesimSetup.exe" yolunu
REM gösterir — o TEK dosyayı başka bir bilgisayara götürüp SolidWorks
REM eklentisini kurmak için yeterlidir.
REM
REM DÜRÜSTLÜK NOTU: bu betik Linux tabanlı geliştirme ortamında (Windows,
REM .NET SDK, Inno Setup Compiler HİÇBİRİ kurulu olmadığı için) ÇALIŞTIRILARAK
REM doğrulanamadı — yalnızca standart `dotnet build`/ISCC.exe komut satırı
REM sözdizimine göre yazıldı. İlk gerçek çalıştırmada bir yol/sözdizimi hatası
REM çıkarsa (hata mesajı ekranda AÇIKÇA görünür, sessiz başarısızlık olmaz),
REM bildirin — birlikte düzeltiriz.
REM ============================================================================

cd /d "%~dp0.."

echo [1/2] Proje Release/x64 olarak derleniyor...
dotnet build UretimOSKesim.csproj -c Release
if errorlevel 1 (
    echo.
    echo HATA: Derleme basarisiz oldu - yukaridaki hata mesajlarina bakin.
    echo Setup.exe URETILEMEDI.
    pause
    exit /b 1
)

echo.
echo [2/2] Inno Setup Compiler ile Setup.exe paketleniyor...

set "ISCC="
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not defined ISCC (
    where ISCC.exe >nul 2>nul
    if not errorlevel 1 set "ISCC=ISCC.exe"
)

if not defined ISCC (
    echo.
    echo HATA: Inno Setup Compiler ^(ISCC.exe^) bulunamadi.
    echo Once ucretsiz Inno Setup'i kurun: https://jrsoftware.org/isdl.php
    echo Kurduktan sonra bu dosyayi tekrar calistirin.
    pause
    exit /b 1
)

"%ISCC%" "kurulum\UretimOSKesim.iss"
if errorlevel 1 (
    echo.
    echo HATA: Inno Setup paketleme basarisiz oldu - yukaridaki hata mesajlarina bakin.
    pause
    exit /b 1
)

echo.
echo TAMAM: kurulum\Output\UretimOSKesimSetup.exe hazir.
echo Bu TEK dosyayi baska bir bilgisayara goturup cift tiklatarak SolidWorks
echo eklentisini kurabilirsiniz - hedef bilgisayarda baska hicbir program
echo veya yazilim gerekmez.
pause
