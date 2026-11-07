@echo off
rem Family Dashboard - starts the dashboard full screen in Microsoft Edge. Close it with Alt+F4.
rem The dashboard is loaded from the internet each time, so it is always the latest version.
set "SCREEN=https://russm1981.github.io/family-apps/screen/"
rem Your private screen link. The setup app fills this in for you; if it's empty the screen asks for it once.
set "LINK="
set "FDPROFILE=%LOCALAPPDATA%\FamilyDashboardKiosk"
if not exist "%FDPROFILE%" mkdir "%FDPROFILE%"
rem Start with Windows? Asked once; the answer is remembered. If Yes, the startup shortcut is (re)made every time, pointing at this file.
set "ANS="
if exist "%FDPROFILE%\startup-answer.txt" set /p ANS=<"%FDPROFILE%\startup-answer.txt"
if not defined ANS (
  choice /C YN /M "Start the Family Dashboard automatically when this PC turns on"
  if errorlevel 2 (set "ANS=N") else (set "ANS=Y")
)
>"%FDPROFILE%\startup-answer.txt" echo %ANS%
if /i "%ANS%"=="Y" powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Family Dashboard.lnk'); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
rem Wait (up to a minute) for the internet after the PC starts, so the dashboard doesn't open on an error page.
powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 30; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing -Method Head -TimeoutSec 3 $env:SCREEN; break } catch { Start-Sleep -Seconds 2 } }"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$u = if ($env:LINK) { $env:LINK } else { $env:SCREEN };" ^
 "$q = [char]34;" ^
 "Start-Process 'msedge' -ArgumentList @('--kiosk', $u, '--edge-kiosk-type=fullscreen', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--disable-pinch', '--overscroll-history-navigation=0', ('--user-data-dir=' + $q + $env:FDPROFILE + $q))"
