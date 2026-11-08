@echo off
rem Family Dashboard - starts the dashboard full screen in Microsoft Edge. Close it with Alt+F4.
rem This file only holds your screen link. Each time it starts it fetches the latest launcher from the internet
rem (so it never needs replacing), keeping a copy for when the internet is down. The dashboard itself also loads
rem from the internet each time, so it is always the latest version. Nothing else needs to be on this PC.
rem PRIVATE: this file contains your access code. Don't share it.
set "APPS=https://russm1981.github.io/family-apps/"
set "SCREEN=%APPS%screen/"
set "LINK="
set "FDBAT=%~f0"
set "FDPROFILE=%LOCALAPPDATA%\FamilyDashboardKiosk"
if not exist "%FDPROFILE%" mkdir "%FDPROFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f = Join-Path $env:FDPROFILE 'launcher.ps1'; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; for ($i = 0; $i -lt 30; $i++) { try { $w = New-Object Net.WebClient; $w.Encoding = [Text.Encoding]::UTF8; $t = $w.DownloadString($env:APPS + 'downloads/windows/launcher.ps1?t=' + [DateTime]::Now.Ticks); if ($t -match 'FAMILY-DASHBOARD-LAUNCHER') { Set-Content -Path $f -Value $t -Encoding UTF8 }; break } catch { if (Test-Path $f) { break }; Start-Sleep -Seconds 2 } }; if (Test-Path $f) { & $f } else { Start-Process 'msedge' -ArgumentList @('--kiosk', $(if ($env:LINK) { $env:LINK } else { $env:SCREEN }), '--edge-kiosk-type=fullscreen') }"
