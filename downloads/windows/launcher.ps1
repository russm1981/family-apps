# FAMILY-DASHBOARD-LAUNCHER
# Family Dashboard - the Windows launcher. Version 2026.11.31
#
# You never download or run this file yourself. Your "Start Family Dashboard.bat" (which holds your private screen
# link) fetches the latest copy of this file from GitHub every time it starts, keeps a copy in
# %LOCALAPPDATA%\FamilyDashboardKiosk\launcher.ps1 for when the internet is down, and runs it. So changes to how the
# dashboard starts reach every PC by themselves - the start file itself never needs replacing again.
#
# It is given (by the start file):  LINK = your private screen link (may be empty), SCREEN = the public screen address,
# FDPROFILE = the Edge profile folder for the dashboard, FDBAT = the full path of the start file.

$ErrorActionPreference = 'Continue'
$profileDir = $env:FDPROFILE
if (-not $profileDir) { $profileDir = Join-Path $env:LOCALAPPDATA 'FamilyDashboardKiosk' }
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir | Out-Null }
$screen = $env:SCREEN
if (-not $screen) { $screen = 'https://russm1981.github.io/family-apps/screen/' }
$url = $env:LINK
if (-not $url) { $url = $screen }

Add-Type -AssemblyName PresentationFramework
function Ask($text, $file) {
    # Asked once, in a normal Windows Yes/No box; the answer is remembered in a small file. Delete the file to be asked again.
    $path = Join-Path $profileDir $file
    if (Test-Path $path) { return ((Get-Content $path -TotalCount 1) -match '^\s*Y') }
    $r = [System.Windows.MessageBox]::Show($text, 'Family Dashboard', 'YesNo', 'Question')
    $yes = ($r -eq 'Yes')
    Set-Content -Path $path -Value $(if ($yes) { 'Y' } else { 'N' })
    return $yes
}

# 1. Start with Windows?
$startup = Ask "Start the Family Dashboard automatically whenever this PC is switched on?" 'startup-answer.txt'
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Family Dashboard.lnk'
if ($startup -and $env:FDBAT) {
    try {
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
        $s.TargetPath = $env:FDBAT
        $s.WorkingDirectory = Split-Path $env:FDBAT
        $s.WindowStyle = 7
        $s.Save()
    } catch { }
} elseif (-not $startup -and (Test-Path $lnk)) {
    Remove-Item $lnk -ErrorAction SilentlyContinue
}

# 2. Keep the screen switched on?
$keepOn = Ask ("Change Windows to keep this screen switched on?`n`n" +
    "The dashboard dims itself when nobody is using it, and wakes with a touch. " +
    "If Windows switches the screen off instead, a touch may not wake it.") 'screen-answer.txt'
if ($keepOn) {
    powercfg /change monitor-timeout-ac 0 2>&1 | Out-Null
    powercfg /change standby-timeout-ac 0 2>&1 | Out-Null
}

# 3. Wait (up to a minute) for the internet after the PC starts, so the dashboard doesn't open on an error page.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
for ($i = 0; $i -lt 30; $i++) {
    try { $null = Invoke-WebRequest -UseBasicParsing -Method Head -TimeoutSec 3 $screen; break } catch { Start-Sleep -Seconds 2 }
}

# 4. Open the dashboard full screen in Microsoft Edge (its own profile, so it doesn't touch your normal Edge). Alt+F4 closes it.
$q = [char]34
Start-Process 'msedge' -ArgumentList @('--kiosk', $url, '--edge-kiosk-type=fullscreen', '--no-first-run',
    '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--disable-pinch',
    '--overscroll-history-navigation=0', ('--user-data-dir=' + $q + $profileDir + $q))
