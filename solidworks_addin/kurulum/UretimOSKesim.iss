; ============================================================================
; ÜRETİMOS KESİM & TEKNİK RESİM EKLENTİSİ — Inno Setup kurulum betiği
; ============================================================================
; AMAÇ (kullanıcı isteği): "SWOOD gibi kurulsun, bir install dosyası gibi,
; hiçbir şey bilmeyen bir insan kurabilsin, tek dosya tek tıkla" — şimdiye
; kadar README.md'deki kurulum tamamen ELLE yapılıyordu (Visual Studio'da
; derle, yönetici Komut İstemi açıp regasm çalıştır, SolidWorks'te
; Tools > Add-Ins'i işaretle). Bu betik, derlenmiş DLL'leri TEK bir
; UretimOSKesimSetup.exe içine paketler; kurulum sırasında regasm'ı OTOMATİK
; (installer zaten yönetici haklarıyla çalıştığı için ayrı bir UAC istemi
; ÇIKARMADAN) çalıştırır ve kaldırırken de OTOMATİK geri alır
; (regasm /unregister) — SWOOD'un kendi kurulumunda alıştığınız "tek dosya
; çift tıkla, bitir" deneyimiyle AYNI. Ayrıca "hiçbir şey bilmeyen bir
; insan" güvenle kullanabilsin diye ([Code] bölümüne bakın): (a) SolidWorks
; AÇIKKEN kurulmaya/kaldırılmaya çalışılırsa AÇIK bir Türkçe uyarı verip
; bekler (sessizce yarım kalmaz), (b) regasm başarısız olursa bunu
; SESSİZCE YUTMAZ, ne olduğunu ve elle nasıl düzeltileceğini AÇIKÇA söyler.
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
;   4) `kurulum\Output\UretimOSKesimSetup.exe` üretilir — bu dosyayı çift
;      tıklatıp kurulumu tamamlayın (SolidWorks açık olsa bile installer
;      bunu FARK EDİP sizi kapatmanız için uyarır, sessizce bozulmaz).
;      Elle regasm adımı (README.md madde 5) ARTIK GEREKMEZ, installer
;      kendisi yapar.
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
; yalnızca Inno Setup'ın resmi belgelenmiş [Setup]/[Files]/[Messages]
; söz dizimine ve [Code] bölümündeki Pascal Script (ISPP) API'sine
; (Exec/MsgBox/CreateOleObject/FileExists vb.) göre, referans alınarak
; satır satır yazıldı. İlk gerçek derlemede bir sözdizimi/yol hatası
; çıkarsa (Inno Setup hataları derleme sırasında satır numarasıyla
; AÇIKÇA gösterir, sessiz başarısızlık OLMAZ), bildirin — birlikte tek
; satırda düzeltiriz. Özellikle [Code]'daki WMI tabanlı `IsAppRunning`
; (SolidWorks açık mı kontrolü) yaygın/kanıtlanmış bir desendir ama bu
; makinede CANLI test EDİLEMEDİ.
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
; "Hiçbir şey bilmeyen bir insan" kurabilsin isteği — bir sorun çıkarsa
; (ör. RegAsm hatası) sessizce mi başarısız oldu yoksa gerçekten mi bitti
; anlaşılabilsin diye kurulum bir günlük dosyası bırakır (%TEMP%'te,
; dosya adı kurulum sonunda ekranda gösterilir).
SetupLogging=yes
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

[Messages]
; Dil dosyası İngilizce kalıyor (yukarıdaki not) ama "hiçbir şey bilmeyen
; bir insan" bu ekranları OKUYUP anlayabilsin diye, kullanıcının GERÇEKTEN
; göreceği birkaç kritik metni Türkçeye ÇEVİRDİK — bu, [Languages]'ta
; ayrı bir dosya GEREKTİRMEYEN, Inno Setup'ın kendi desteklediği bir
; sözdizimidir (tek dilli bir kurulumda bile [Messages] ile istediğiniz
; mesajı ELLE değiştirebilirsiniz). Geri kalan (Next/Back/Cancel gibi
; buton metinleri) İngilizce kalıyor — bunlar evrensel olarak tanınan,
; anlaşılması için Türkçe bilmeyi gerektirmeyen kelimeler.
WelcomeLabel1=[name] Kurulumuna Hoş Geldiniz
WelcomeLabel2=Bu sihirbaz bilgisayarınıza %1 sürüm %2'yi kuracak.%n%nÖNEMLİ: Devam etmeden önce SolidWorks KAPALI olmalı — açıksa sihirbaz sizi bir sonraki adımda UYARACAK.
FinishedHeadingLabel=[name] Kurulumu Tamamlandı
FinishedLabelNoIcons=Kurulum tamamlandı.%n%nŞimdi SolidWorks'ü açın: Tools (Araçlar) menüsü > Add-Ins (Eklentiler) altında "ÜretimOS Kesim & Teknik Resim" otomatik işaretli/yüklü görünmeli — ayrıca bir şey yapmanıza gerek YOK.
FinishedLabel=Kurulum tamamlandı.%n%nŞimdi SolidWorks'ü açın: Tools (Araçlar) menüsü > Add-Ins (Eklentiler) altında "ÜretimOS Kesim & Teknik Resim" otomatik işaretli/yüklü görünmeli — ayrıca bir şey yapmanıza gerek YOK.

[Files]
; Derlenmiş DLL + TÜM NuGet bağımlılıkları (Newtonsoft.Json, ClosedXML,
; PdfSharp ve bunların kendi alt bağımlılıkları) — tek tek İSİM VERİLMEDİ;
; MSBuild zaten hepsini aynı çıktı klasörüne kopyalıyor, wildcard ile
; hepsi otomatik paketlenir (yeni bir paket eklenince elle güncellenmesi
; gereken kırılgan bir liste yerine). *.xml (NuGet API-doc dosyaları) ve
; *.pdb (hata ayıklama sembolleri, üretim kurulumunda gereksiz) hariç.
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.xml,*.pdb"

[Icons]
Name: "{group}\ÜretimOS Kesim Eklentisini Kaldır"; Filename: "{uninstallexe}"

[UninstallDelete]
; Kurulum klasöründe (regasm'ın veya gelecekte eklenecek bir dosyanın)
; bırakabileceği herhangi bir artığı da temizle — Tanilama.cs kendi
; günlüğünü Masaüstü'ne yazdığı için ({app} İÇİNE hiçbir şey YAZILMAZ,
; bu yalnızca bir güvenlik önlemi).
Type: filesandordirs; Name: "{app}"

[Code]
// ════════════════════════════════════════════════════════════════════════
// "HİÇBİR ŞEY BİLMEYEN BİR İNSAN" KURABİLSİN isteği — bu bölüm, [Run]/
// [UninstallRun]'daki DÜZ (deklaratif, hatayı KONTROL ETMEYEN) regasm
// çağrısının YERİNE geçti. İki somut sorunu çözüyor:
//   1) SolidWorks AÇIKKEN kurulursa DLL kilitli olur, kopyalama/kayıt
//      YARIM kalır ve kişi SEBEBİNİ ASLA anlayamaz — bu yüzden kuruluma
//      BAŞLAMADAN ÖNCE SolidWorks'ün çalışıp çalışmadığı kontrol edilir.
//   2) Düz [Run] girdisi RegAsm'ın çıkış kodunu KONTROL ETMEZ — hata
//      sessizce yutulur, "kuruldu" der ama SolidWorks eklentiyi hiç
//      göremez. Burada çıkış kodu AÇIKÇA kontrol edilip başarısızsa
//      kullanıcıya (ve README'deki elle B) yoluna) yönlendiren AÇIK bir
//      mesaj gösterilir — dürüstlük ilkesi: asla sessizce "başarılı"
//      görünüp aslında yarım kalma.
// ════════════════════════════════════════════════════════════════════════

// SolidWorks'ün çalışan bir kopyası olup olmadığını WMI ile sorar — Inno
// Setup topluluğunda yaygın kullanılan, kanıtlanmış bir desen (COM
// Automation üzerinden Win32_Process sorgusu). WMI herhangi bir sebeple
// kullanılamazsa (çok nadir) kontrolü SESSİZCE ATLAR — TAHMİN ETMEK
// yerine (yanlış pozitif ile kuruluma haksız engel koymamak için)
// güvenlik ağı olmadan devam etmeyi TERCİH EDİYORUZ.
function IsAppRunning(const FileName: String): Boolean;
var
  FSWbemLocator: Variant;
  FWMIService: Variant;
  FWbemObjectSet: Variant;
begin
  Result := False;
  try
    FSWbemLocator := CreateOleObject('WbemScripting.SWbemLocator');
    FWMIService := FSWbemLocator.ConnectServer('', 'root\CIMV2', '', '');
    FWbemObjectSet := FWMIService.ExecQuery(Format('SELECT Name FROM Win32_Process WHERE Name="%s"', [FileName]));
    Result := (FWbemObjectSet.Count > 0);
  except
    Result := False;
  end;
end;

function GetRegAsmPath(): String;
begin
  // .NET Framework 4.0-4.8 AYNI CLR klasörünü (v4.0.30319) paylaşır —
  // SolidWorks 2025 zaten .NET Framework 4.8 gerektirdiği için bu yol
  // her SolidWorks 2025 makinesinde mevcut olmalıdır.
  Result := ExpandConstant('{win}\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe');
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  while IsAppRunning('SLDWORKS.exe') do
  begin
    if MsgBox('SolidWorks şu anda AÇIK görünüyor.' + #13#10 + #13#10 +
       'Devam etmeden önce SolidWorks''i KAPATIN, sonra Tamam''a basın.' + #13#10 +
       '(Kurulumdan vazgeçmek için İptal''e basabilirsiniz.)',
       mbError, MB_OKCANCEL) = IDCANCEL then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  while IsAppRunning('SLDWORKS.exe') do
  begin
    if MsgBox('SolidWorks şu anda AÇIK görünüyor.' + #13#10 + #13#10 +
       'Kaldırmadan önce SolidWorks''i KAPATIN, sonra Tamam''a basın.' + #13#10 +
       '(Kaldırmadan vazgeçmek için İptal''e basabilirsiniz.)',
       mbError, MB_OKCANCEL) = IDCANCEL then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

procedure RegisterAddin();
var
  ResultCode: Integer;
  RegAsm, DllPath: String;
begin
  RegAsm := GetRegAsmPath();
  DllPath := ExpandConstant('{app}\{#MyAppDLL}');
  if not FileExists(RegAsm) then
  begin
    MsgBox('.NET Framework bulunamadı:' + #13#10 + RegAsm + #13#10 + #13#10 +
      'SolidWorks 2025 normalde .NET Framework 4.8''i zaten gerektirdiği için ' +
      'bu makinede kurulu olmalıydı — bu BEKLENMEDİK bir durum, lütfen bildirin.' + #13#10 + #13#10 +
      'Dosyalar kuruldu ama SolidWorks eklentisi HENÜZ KAYDEDİLMEDİ; README.md''deki ' +
      '"B) Elle kurulum" bölümündeki regasm adımını izleyerek elle tamamlayabilirsiniz.',
      mbError, MB_OK);
    Exit;
  end;
  if (not Exec(RegAsm, '/codebase "' + DllPath + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
  begin
    MsgBox('SolidWorks eklentisi kaydedilirken bir sorun oluştu (RegAsm çıkış kodu: ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
      'Dosyalar kuruldu ama SolidWorks bu eklentiyi HENÜZ GÖREMEYEBİLİR.' + #13#10 + #13#10 +
      'README.md''deki "B) Elle kurulum" bölümündeki regasm adımını YÖNETİCİ olarak elle ' +
      'çalıştırın, ya da bu kurulumu (SolidWorks kapalıyken) tekrar deneyin.',
      mbError, MB_OK);
  end;
end;

procedure UnregisterAddin();
var
  ResultCode: Integer;
  RegAsm, DllPath: String;
begin
  RegAsm := GetRegAsmPath();
  DllPath := ExpandConstant('{app}\{#MyAppDLL}');
  // Kaldırmada sessizce geçiyoruz (dosyalar zaten silinecek) — burada bir
  // hata çıksa bile kullanıcıyı BLOKE ETMENİN faydası yok, en kötü
  // ihtimalle SolidWorks kayıt defterinde zararsız bir artık kalır.
  if FileExists(RegAsm) and FileExists(DllPath) then
    Exec(RegAsm, '/unregister "' + DllPath + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    RegisterAddin();
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // usUninstall, dosyalar SİLİNMEDEN ÖNCE tetiklenir (Inno Setup belgeli
  // sırası) — regasm /unregister'ın [ComUnregisterFunction]'ı
  // tetikleyebilmesi için DLL'in hâlâ diskte olması GEREKİR.
  if CurUninstallStep = usUninstall then
    UnregisterAddin();
end;
