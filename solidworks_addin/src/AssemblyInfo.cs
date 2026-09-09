using System.Reflection;
using System.Runtime.InteropServices;

// ════════════════════════════════════════════════════════════════════════════
// Bu dosya, .csproj'daki <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
// ayarı yüzünden ELLE yazıldı — SDK-style projelerde MSBuild'in <ComVisible>
// özelliğinin regasm'a AKTARILIP AKTARILMADIĞI belirsiz çıktı (gerçek
// denemede "Kaydedilen tür yok" uyarısı devam etti). [assembly: ComVisible]
// özniteliğini burada DOĞRUDAN, tartışmasız şekilde yazmak bu belirsizliği
// ortadan kaldırıyor.
// ════════════════════════════════════════════════════════════════════════════
[assembly: AssemblyTitle("UretimOSKesim")]
[assembly: AssemblyDescription("ÜretimOS için SolidWorks kesim listesi ve teknik resim eklentisi")]
[assembly: AssemblyProduct("UretimOSKesim")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

// KRİTİK: bu olmadan (veya false olarak) regasm hiçbir türü COM'a
// kaydedilebilir bulmaz — SwAddin.cs'teki tip bazlı [ComVisible(true)]
// tek başına yeterli değildir.
[assembly: ComVisible(true)]

// Bütünleştirilmiş kodun kendi COM kimliği (tip kitaplığı GUID'i).
// SwAddin.cs'teki [Guid(...)] ile KARIŞTIRMAYIN — o SINIFIN kimliği, bu
// ASSEMBLY'nin (tüm paketin) kimliği. Farklı olmalı, isterseniz Tools >
// Create GUID ile kendi üretebilirsiniz, aynen kalması da sorun değildir.
[assembly: Guid("99999999-8888-7777-6666-555555555555")]
