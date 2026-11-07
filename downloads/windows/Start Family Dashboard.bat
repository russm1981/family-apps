@echo off
rem Family Dashboard - starts the dashboard full screen in Microsoft Edge. Close it with Alt+F4.
rem The dashboard is loaded from the internet each time, so it is always the latest version.
set "SCREEN=https://russm1981.github.io/family-apps/screen/"
rem Your private screen link. The setup app fills this in for you; if it's empty the screen asks for it once.
set "LINK="
set "FDPROFILE=%LOCALAPPDATA%\FamilyDashboardKiosk"
if not exist "%FDPROFILE%" mkdir "%FDPROFILE%"
if not exist "%FDPROFILE%\asked-startup.txt" (
  echo asked> "%FDPROFILE%\asked-startup.txt"
  choice /C YN /M "Start the Family Dashboard automatically when this PC turns on"
  if not errorlevel 2 powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Family Dashboard.lnk'); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$u = if ($env:LINK) { $env:LINK } else { $env:SCREEN };" ^
 "$q = [char]34;" ^
 "Start-Process 'msedge' -ArgumentList @('--kiosk', $u, '--edge-kiosk-type=fullscreen', '--no-first-run', '--disable-pinch', '--overscroll-history-navigation=0', ('--user-data-dir=' + $q + $env:FDPROFILE + $q))"
