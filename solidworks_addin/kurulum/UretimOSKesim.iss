; ============================================================================
; ÜRETİMOS KESİM & TEKNİK RESİM EKLENTİSİ — Inno Setup kurulum betiği
; ============================================================================
; AMAÇ (kullanıcı isteği): "SWOOD gibi kurulsun, bir install dosyası gibi" —
; şimdiye kadar README.md'deki kurulum tamamen ELLE yapılıyordu (Visual
; Studio'da derle, yönetici Komut İstemi açıp regasm çalıştır, SolidWorks'te
; Tools > Add-Ins'i işaretle). Bu betik, derlenmiş DLL'leri TEK bir
; UretimOSKesimSetup.exe içine paketler; kurulum sırasında regasm'ı OTOMATİK
; (installer zaten yönetici haklarıyla çalıştığı için ayrı bir UAC istemi
; ÇIKARMADAN) çalıştırır ve kaldırırken de OTOMATİK geri alır
; (regasm /unregister) — SWOOD'un kendi kurulumunda alıştığınız "tek dosya
; çalıştır, bitir" deneyimiyle AYNI.
;
; NASIL KULLANILIR (bir kerelik hazırlık, sonra her sürümde yalnızca 2-3):
;   1) https://jrsoftware.org/isdl.php adresinden Inno Setup Compiler'ı
;      kurun (ücretsiz, ~3 MB, kurulumu 1 dakika sürer).
;   2) Bu projeyi NORMAL şekilde, RELEASE yapılandırmasında ve x64
;      platformunda derleyin — Visual Studio'da "Release" + "x64" seçip
;      Ctrl+Shift+B, ya da komut satırından:
;        dotnet build UretimOSKesim.csproj -c Release
;      Çıktı `solidworks_addin\bin\x64\Release\net48\` klasöründe olmalı —
;      aşağıdaki SourceDir sabiti TAM OLARAK bunu varsayıyor; farklı bir
;      klasöre derlendiyse (örn. Debug ile denediyseniz) SourceDir'i buna
;      göre değiştirin.
;   3) Bu dosyayı (`UretimOSKesim.iss`) Inno Setup Compiler'da açıp
;      F9 (Compile) tuşuna basın.
;   4) `kurulum\Output\UretimOSKesimSetup.exe` üretilir — SolidWorks
;      KAPALIYKEN bu dosyayı çift tıklatıp kurulumu tamamlayın. Elle regasm
;      adımı (README.md madde 5) ARTIK GEREKMEZ, installer kendisi yapar.
;   5) SolidWorks'ü açın → Tools > Add-Ins → "ÜretimOS Kesim & Teknik Resim"
;      işaretli görünmeli (installer, SwAddin.cs'teki [ComRegisterFunction]
;      RegisterFunction'ı regasm üzerinden tetikleyerek hem COM kaydını hem
;      SolidWorks'ün "otomatik yükle" kaydını yazar).
;   6) Başka bir bilgisayara kurmak için de AYNI Setup.exe yeterli — SWOOD
;      gibi tek dosyalık, elden ele verilebilir dağıtım. Kaldırmak için
;      Denetim Masası > Program Ekle/Kaldır (installer bunu otomatik
;      ekler) ya da Başlat menüsündeki "ÜretimOS Kesim Eklentisini Kaldır".
;
; YENİ SÜRÜM ÇIKARIRKEN: yalnızca #MyAppVersion'ı artırıp 2-3. adımları
; tekrarlayın — AppId AYNI kaldığı için Setup.exe eskisinin üzerine
; (kaldır+yeniden kur) doğru şekilde günceller.
;
; BİLİNMEYEN/DOĞRULANAMAYAN (dürüstlük notu): bu betik, bu ortamda (Linux,
; Inno Setup Compiler kurulu değil) DERLENEMEDİ ve ÇALIŞTIRILAMADI —
; yalnızca Inno Setup'ın resmi belgelenmiş [Setup]/[Files]/[Run] söz
; dizimine göre satır satır, referans alınarak yazıldı. İlk gerçek
; derlemede bir sözdizimi/yol hatası çıkarsa (Inno Setup hataları derleme
; sırasında satır numarasıyla AÇIKÇA gösterir, sessiz başarısızlık
; OLMAZ), bildirin — birlikte tek satırda düzeltiriz.
; ============================================================================

#define MyAppName "ÜretimOS Kesim & Teknik Resim Eklentisi"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ÜretimOS"
#define MyAppDLL "UretimOSKesim.dll"
; Derleme çıktısının bulunduğu klasör (bu .iss dosyasına göre GÖRECELİ) —
; Release/x64/net48 varsayılan. Farklı bir yapılandırmada derlediyseniz
; (örn. Debug) burayı değiştirin.
#define SourceDir "..\bin\x64\Release\net48"

[Setup]
; KURULUM PROGRAMININ kendi kimliği — src/SwAddin.cs'teki [Guid(...)] veya
; src/AssemblyInfo.cs'teki [assembly: Guid(...)] İLE KARIŞTIRMAYIN, o
; ayrı/ilgisiz COM kimlikleridir. Bu AppId, sürüm güncellemelerinde AYNI
; kalmalı ki Inno Setup "üzerine kur" akışını doğru yönetsin.
AppId={{B4C1E2A0-7F3D-4A6E-9C1B-2D8F5A3E7C90}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\UretimOSKesim
DefaultGroupName=ÜretimOS Kesim Eklentisi
DisableProgramGroupPage=yes
; COM kaydı (regasm) HKEY_LOCAL_MACHINE'e yazar — yönetici hakları ŞART,
; kurulum sırasında TEK bir UAC istemi çıkar (RegAsm ayrıca sormaz).
PrivilegesRequired=admin
OutputDir=Output
OutputBaseFilename=UretimOSKesimSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; SolidWorks 2025 yalnızca 64-bit'tir — 32-bit sisteme kurulumu ENGELLE
; (README.md'de anlatılan "Any CPU ile yanlış kayıt defteri bölümüne
; yazma" hatasının kurulum seviyesinde bir daha YAŞANMAMASI için).
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
UninstallDisplayIcon={app}\{#MyAppDLL}

[Languages]
; NOT: "compiler:Languages\Turkish.isl" KASITLI KULLANILMADI — Türkçe dil
; dosyası Inno Setup Compiler'ın standart kurulumuna DAHİL DEĞİL (ayrı
; indirilip Languages klasörüne kopyanması gerekir), bunu burada VARSAYIP
; ilk derlemeyi bir "dosya bulunamadı" hatasıyla BOZMAK istemedik.
; "compiler:Default.isl" (İngilizce) Inno Setup'ın HER kurulumunda
; garanti mevcuttur — sihirbaz ekranları İngilizce görünür (kurulumun
; işlevini ETKİLEMEZ). Türkçe isterseniz: https://jrsoftware.org/files/istrans/
; adresinden Turkish.isl'i indirip Inno Setup'ın "Languages" klasörüne
; kopyalayın, sonra bu satırı "turkish"/"compiler:Languages\Turkish.isl"
; olarak değiştirin.
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Derlenmiş DLL + TÜM NuGet bağımlılıkları (Newtonsoft.Json, ClosedXML,
; PdfSharp ve bunların kendi alt bağımlılıkları) — tek tek İSİM VERİLMEDİ;
; MSBuild zaten hepsini aynı çıktı klasörüne kopyalıyor, wildcard ile
; hepsi otomatik paketlenir (yeni bir paket eklenince elle güncellenmesi
; gereken kırılgan bir liste yerine). *.xml (NuGet API-doc dosyaları) ve
; *.pdb (hata ayıklama sembolleri, üretim kurulumunda gereksiz) hariç.
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.xml,*.pdb"

[Run]
; COM kaydı — README.md'deki elle regasm adımının YERİNİ ALIYOR. Proje
; x64/net48 olduğu için 64-bit RegAsm (Framework64 klasörü) kullanılıyor;
; 32-bit RegAsm çağrılırsa kayıt yanlış (WOW6432Node) kayıt defteri
; bölümüne yazılır ve SolidWorks eklentiyi HİÇ görmez (bkz. csproj'daki
; PlatformTarget notu). SwAddin.cs'teki [ComRegisterFunction]
; RegisterFunction bu çağrıyla OTOMATİK tetiklenir ve hem standart COM
; kaydını hem SolidWorks'e özel HKLM\...\SolidWorks\Addins\{GUID} +
; HKCU\...\SolidWorks\AddInsStartup\{GUID} girdilerini yazar.
Filename: "{win}\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"; \
    Parameters: "/codebase ""{app}\{#MyAppDLL}"""; \
    StatusMsg: "SolidWorks eklentisi kaydediliyor…"; Flags: runhidden waituntilterminated

[UninstallRun]
; Kaldırma sırasında COM/SolidWorks kaydını TEMİZLE — dosyalar silinmeden
; ÖNCE çalışması gerekir (regasm /unregister, sınıfın
; [ComUnregisterFunction] UnregisterFunction'ını tetiklemek için DLL'in
; hâlâ diskte olmasını gerektirir; Inno Setup [UninstallRun] adımlarını
; [UninstallDelete]'ten önce çalıştırdığı için sıra doğru).
Filename: "{win}\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"; \
    Parameters: "/unregister ""{app}\{#MyAppDLL}"""; \
    StatusMsg: "SolidWorks eklenti kaydı kaldırılıyor…"; Flags: runhidden waituntilterminated; RunOnceId: "UnregisterUretimOSKesim"

[Icons]
Name: "{group}\ÜretimOS Kesim Eklentisini Kaldır"; Filename: "{uninstallexe}"

[UninstallDelete]
; Kurulum klasöründe (regasm'ın veya gelecekte eklenecek bir dosyanın)
; bırakabileceği herhangi bir artığı da temizle — Tanilama.cs kendi
; günlüğünü Masaüstü'ne yazdığı için ({app} İÇİNE hiçbir şey YAZILMAZ,
; bu yalnızca bir güvenlik önlemi).
Type: filesandordirs; Name: "{app}"
