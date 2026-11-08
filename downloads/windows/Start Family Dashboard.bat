@echo off
rem Family Dashboard - starts the dashboard full screen in Microsoft Edge. Close it with Alt+F4.
rem The dashboard is loaded from the internet each time, so it is always the latest version.
set "SCREEN=https://russm1981.github.io/family-apps/screen/"
rem Your private screen link. The setup app fills this in for you; if it's empty the screen asks for it once.
set "LINK="
set "FDPROFILE=%LOCALAPPDATA%\FamilyDashboardKiosk"
if not exist "%FDPROFILE%" mkdir "%FDPROFILE%"
rem Start with Windows? Asked once, in a normal Windows Yes/No box; the answer is remembered.
rem If Yes, the startup shortcut is (re)made every time. To be asked again, delete %LOCALAPPDATA%\FamilyDashboardKiosk\startup-answer.txt.
set "ANS="
if exist "%FDPROFILE%\startup-answer.txt" set /p ANS=<"%FDPROFILE%\startup-answer.txt"
if not defined ANS for /f %%A in ('powershell -NoProfile -Command "Add-Type -AssemblyName PresentationFramework; $r=[System.Windows.MessageBox]::Show(\"Start the Family Dashboard automatically whenever this PC is switched on?\",\"Family Dashboard\",\"YesNo\",\"Question\"); if ($r -eq \"Yes\") {\"Y\"} else {\"N\"}"') do set "ANS=%%A"
if not defined ANS set "ANS=Y"
>"%FDPROFILE%\startup-answer.txt" echo %ANS%
rem Keep the display on? Asked once, separately; the answer is remembered. The dashboard dims itself (its own sleep screen),
rem and if Windows switches the display off a touch may not wake it. To be asked again, delete screen-answer.txt in the same folder.
set "SCR="
if exist "%FDPROFILE%\screen-answer.txt" set /p SCR=<"%FDPROFILE%\screen-answer.txt"
if not defined SCR for /f %%A in ('powershell -NoProfile -Command "Add-Type -AssemblyName PresentationFramework; $r=[System.Windows.MessageBox]::Show(\"Change Windows to keep this screen switched on?`n`nThe dashboard dims itself when nobody is using it, and wakes with a touch. If Windows switches the screen off instead, a touch may not wake it.\",\"Family Dashboard\",\"YesNo\",\"Question\"); if ($r -eq \"Yes\") {\"Y\"} else {\"N\"}"') do set "SCR=%%A"
if not defined SCR set "SCR=N"
>"%FDPROFILE%\screen-answer.txt" echo %SCR%
if /i "%SCR%"=="Y" (
  powercfg /change monitor-timeout-ac 0 >nul 2>&1
  powercfg /change standby-timeout-ac 0 >nul 2>&1
)
if /i "%ANS%"=="Y" powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Family Dashboard.lnk'); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
rem Wait (up to a minute) for the internet after the PC starts, so the dashboard doesn't open on an error page.
powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 30; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing -Method Head -TimeoutSec 3 $env:SCREEN; break } catch { Start-Sleep -Seconds 2 } }"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$u = if ($env:LINK) { $env:LINK } else { $env:SCREEN };" ^
 "$q = [char]34;" ^
 "Start-Process 'msedge' -ArgumentList @('--kiosk', $u, '--edge-kiosk-type=fullscreen', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--disable-pinch', '--overscroll-history-navigation=0', ('--user-data-dir=' + $q + $env:FDPROFILE + $q))"
