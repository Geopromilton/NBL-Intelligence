; NBL-Intelligence Windows installer (Inno Setup 6)
; Per-user install (no administrator rights). Program updates afterwards arrive
; through the in-app updater, without reinstalling.
#define AppVersion GetEnv("NBI_VERSION")
#if AppVersion == ""
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{8F3C2A51-4B7E-4E0B-9C61-5A1D2E7B9F10}
AppName=NBL-Intelligence
AppVersion={#AppVersion}
AppVerName=NBL-Intelligence {#AppVersion}
AppPublisher=Nature Based Living (Vijayanagar Eco-Village Pvt Ltd)
AppPublisherURL=https://github.com/Geopromilton/NBL-Intelligence
DefaultDirName={localappdata}\Programs\NBL-Intelligence
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\build\installer
OutputBaseFilename=NBL-Intelligence_Setup_{#AppVersion}
SetupIconFile=..\assets\nbl-intelligence.ico
UninstallDisplayIcon={app}\nbl-intelligence.ico
UninstallDisplayName=NBL-Intelligence
WizardStyle=modern
WizardImageFile=..\build\wizard.bmp
WizardSmallImageFile=..\build\wizard-small.bmp
Compression=lzma2/max
SolidCompression=yes
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\build\dist\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\NBL-Intelligence"; Filename: "{app}\runtime\pythonw.exe"; Parameters: """{app}\launch.pyw"""; WorkingDir: "{app}"; IconFilename: "{app}\nbl-intelligence.ico"; Comment: "Water intelligence for Nature Based Living sites"
Name: "{autodesktop}\NBL-Intelligence"; Filename: "{app}\runtime\pythonw.exe"; Parameters: """{app}\launch.pyw"""; WorkingDir: "{app}"; IconFilename: "{app}\nbl-intelligence.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\runtime\pythonw.exe"; Parameters: """{app}\launch.pyw"""; WorkingDir: "{app}"; Description: "Start NBL-Intelligence"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\app_pending"
Type: filesandordirs; Name: "{app}\app_previous"
Type: filesandordirs; Name: "{app}\app"
Type: files; Name: "{app}\installed_requirements.txt"
