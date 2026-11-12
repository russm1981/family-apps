#!/bin/bash
# Family Dashboard – turn a fresh Raspberry Pi into a dashboard screen.
#
# Needs: Raspberry Pi 4 or 5, Raspberry Pi OS (64-bit, "with desktop", Bookworm or later), a screen, the internet.
# Run once, in a terminal on the Pi:
#     curl -fsSL https://russm1981.github.io/family-apps/downloads/raspberry-pi/setup-pi.sh | bash
# Add  --wifi-setup  (… | bash -s -- --wifi-setup) to also install a "join my Wi-Fi from your phone" hotspot for the
# first start – for cards prepared for someone else's home.
#
# What it does: switches off screen blanking, logs in to the desktop by itself, starts the dashboard full-screen at
# every start-up (after waiting for the internet), installs security updates by itself and restarts at 4 am each night.
# Nothing of the dashboard itself is stored on the card – it loads the latest version from the internet each time,
# so a card made today still works, and is up to date, a year from now.
set -e
URL="https://russm1981.github.io/family-apps/screen/"
WIFI_SETUP=0; [ "$1" = "--wifi-setup" ] && WIFI_SETUP=1

echo "== Family Dashboard: installing (this takes a few minutes)"
sudo apt-get update
sudo apt-get install -y chromium-browser 2>/dev/null || sudo apt-get install -y chromium
sudo apt-get install -y unattended-upgrades curl
sudo dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "== Screen stays on (the dashboard has its own sleep screen) and the Pi logs in by itself"
sudo raspi-config nonint do_blanking 1 || true
sudo raspi-config nonint do_boot_behaviour B4 || true

echo "== The dashboard starts full-screen at every start-up"
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/family-dashboard" <<SH
#!/bin/bash
# Wait up to two minutes for the internet, so the dashboard doesn't open on an error page.
for i in \$(seq 60); do curl -fsI --max-time 3 https://russm1981.github.io >/dev/null 2>&1 && break; sleep 2; done
B=\$(command -v chromium-browser || command -v chromium)
exec "\$B" --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble \\
  --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream --disable-pinch \\
  --overscroll-history-navigation=0 --password-store=basic --check-for-update-interval=31536000 "$URL"
SH
chmod +x "$HOME/.local/bin/family-dashboard"
# Raspberry Pi OS desktop (labwc, since late 2024)
mkdir -p "$HOME/.config/labwc"
grep -q family-dashboard "$HOME/.config/labwc/autostart" 2>/dev/null || echo "$HOME/.local/bin/family-dashboard &" >> "$HOME/.config/labwc/autostart"
# Older desktops (wayfire / X11)
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/family-dashboard.desktop" <<DT
[Desktop Entry]
Type=Application
Name=Family Dashboard
Exec=$HOME/.local/bin/family-dashboard
X-GNOME-Autostart-enabled=true
DT

echo "== Fresh start every night at 4 am"
( sudo crontab -l 2>/dev/null | grep -v family-dashboard-reboot; echo "0 4 * * * /sbin/shutdown -r now # family-dashboard-reboot" ) | sudo crontab -

if [ "$WIFI_SETUP" = "1" ]; then
  echo "== Wi-Fi from a phone: with no known Wi-Fi, the Pi makes a hotspot called 'FamilyDashboard-xxxx' to choose one"
  sudo apt-get install -y comitup || echo "(comitup couldn't be installed – connect Wi-Fi from the desktop instead)"
  [ -f /etc/comitup.conf ] && sudo sed -i 's/^#\?ap_name:.*/ap_name: FamilyDashboard-<nnnn>/' /etc/comitup.conf || true
fi

echo
echo "Done. Restart the Pi (sudo reboot). The dashboard opens full-screen and shows a QR code to connect it."
