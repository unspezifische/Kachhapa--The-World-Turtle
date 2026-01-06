#!/bin/bash
# Note: don't run this script while connected to the Pi's Wi-Fi AP, because the
# connection will drop when we reconfigure the AP settings.
set -euo pipefail

DESTINATION="ijohnson@raspberrypi.local"

REMOTE_BASE="/home/ijohnson/Kachhapa"
REMOTE_FLASK="$REMOTE_BASE/Flask"
REMOTE_WEB="$REMOTE_BASE/webapp"
REMOTE_VENV="$REMOTE_BASE/venv"

# ---- Wi-Fi AP settings (standalone AP; no upstream) ----
AP_SSID="PiNetwork"
AP_PASS="password"          # >= 8 chars
AP_IP="10.42.0.1"
AP_CIDR="10.42.0.1/24"
AP_DHCP_START="10.42.0.50"
AP_DHCP_END="10.42.0.150"
LAN_IF="wlan0"
COUNTRY_CODE="US"
CHANNEL="6"

echo "==> 0) Sanity check local files"
for f in "Flask/requirements.txt" "Flask/app.py" "nginx.conf" "myapp.service"; do
  [[ -f "$f" ]] || { echo "Missing required file: $f"; exit 1; }
done

echo "==> 1) Install base packages"
ssh "$DESTINATION" "sudo apt update && sudo apt install -y \
  nginx python3-venv python3-pip python3-dev build-essential pkg-config \
  libpq-dev \
  build-essential libssl-dev libffi-dev python3-setuptools \
  cargo rustc \
  postgresql postgresql-contrib \
  rabbitmq-server \
  avahi-daemon \
  hostapd dnsmasq"

echo "==> 2) Hostname + mDNS"
ssh "$DESTINATION" "sudo hostnamectl set-hostname raspberrypi && sudo systemctl enable --now avahi-daemon"

echo "==> 3) Create directory structure"
ssh "$DESTINATION" "mkdir -p \
  '$REMOTE_FLASK/templates' \
  '$REMOTE_FLASK/static' \
  '$REMOTE_FLASK/GameElements' \
  '$REMOTE_WEB/build' \
  '$REMOTE_WEB/src' \
  '$REMOTE_WEB/public'"

echo "==> 4) Copy app files (Flask + web + database backup)"
rsync -avz Flask/requirements.txt "$DESTINATION:$REMOTE_FLASK/"
rsync -avz Flask/import_5etools.py "$DESTINATION:$REMOTE_FLASK/" || true
rsync -avz Flask/app.py "$DESTINATION:$REMOTE_FLASK/"
rsync -avz Flask/templates/ "$DESTINATION:$REMOTE_FLASK/templates/"
rsync -avz Flask/static/    "$DESTINATION:$REMOTE_FLASK/static/"

# assumes you already built locally
rsync -avz webapp/build/  "$DESTINATION:$REMOTE_WEB/build/"
rsync -avz webapp/src/    "$DESTINATION:$REMOTE_WEB/src/"
rsync -avz webapp/public/ "$DESTINATION:$REMOTE_WEB/public/"

# copy database backup if it exists
if [ -f "database_backup.dump" ]; then
  rsync -avz database_backup.dump "$DESTINATION:$REMOTE_BASE/"
fi

echo "==> 5) Create venv + install deps (no sudo for pip)"
ssh "$DESTINATION" "bash -lc '
set -e
if [ ! -d \"$REMOTE_VENV\" ]; then
  python3 -m venv \"$REMOTE_VENV\"
fi
\"$REMOTE_VENV/bin/python\" -m pip install --upgrade pip wheel setuptools
\"$REMOTE_VENV/bin/pip\" install -r \"$REMOTE_FLASK/requirements.txt\"
'"

echo "==> 6) Install nginx.conf (copy then sudo move) + test"
scp nginx.conf "$DESTINATION:/home/ijohnson/nginx.conf"
ssh -t "$DESTINATION" "sudo mv /home/ijohnson/nginx.conf /etc/nginx/nginx.conf && sudo nginx -t"

echo "==> 7) Install systemd service (copy then sudo move)"
scp myapp.service "$DESTINATION:/home/ijohnson/myapp.service"
ssh -t "$DESTINATION" "sudo mv /home/ijohnson/myapp.service /etc/systemd/system/myapp.service && \
  sudo systemctl daemon-reload && sudo systemctl enable myapp"

echo "==> 8) Minimal standalone Wi-Fi AP (hostapd + dnsmasq; no NAT)"
ssh -t "$DESTINATION" "sudo bash -s" <<'EOS'
set -euo pipefail

LAN_IF="wlan0"
AP_SSID="PiNetwork"
AP_PASS="password"
AP_IP="10.42.0.1"
AP_CIDR="10.42.0.1/24"
DHCP_START="10.42.0.50"
DHCP_END="10.42.0.150"

echo "==> Sanity: check interface exists"
ip link show "$LAN_IF" >/dev/null 2>&1 || { echo "Interface $LAN_IF not found"; ip -br link; exit 1; }

echo "==> Stop services while configuring"
systemctl stop hostapd 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true

echo "==> Configure static IP for AP (dhcpcd)"
# Append instead of overwrite to avoid nuking existing config
grep -q "^interface $LAN_IF" /etc/dhcpcd.conf 2>/dev/null || cat >> /etc/dhcpcd.conf <<EOF

interface $LAN_IF
  static ip_address=$AP_CIDR
  nohook wpa_supplicant
EOF

echo "==> Configure dnsmasq DHCP"
mkdir -p /etc/dnsmasq.d
cat > /etc/dnsmasq.d/kachhapa-ap.conf <<EOF
interface=$LAN_IF
dhcp-range=$DHCP_START,$DHCP_END,255.255.255.0,12h
domain-needed
bogus-priv
EOF

# Ensure dnsmasq reads dnsmasq.d (default does, but just in case)
grep -q "^conf-dir=/etc/dnsmasq.d" /etc/dnsmasq.conf 2>/dev/null || \
  echo "conf-dir=/etc/dnsmasq.d,*.conf" >> /etc/dnsmasq.conf
echo "==> Configure hostapd"
cat > /etc/hostapd/hostapd.conf <<EOF
country_code=US
interface=$LAN_IF
ssid=$AP_SSID
hw_mode=g
channel=6
ieee80211n=1
wmm_enabled=1
auth_algs=1
wpa=2
wpa_passphrase=$AP_PASS
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOF

echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

echo "==> Enable services"
systemctl unmask hostapd || true
systemctl enable hostapd
systemctl enable dnsmasq

echo "==> Restart networking + services"
if systemctl list-unit-files | grep -q '^dhcpcd\.service'; then
  systemctl restart dhcpcd
elif systemctl list-unit-files | grep -q '^NetworkManager\.service'; then
  systemctl restart NetworkManager
elif systemctl list-unit-files | grep -q '^systemd-networkd\.service'; then
  systemctl restart systemd-networkd
else
  echo "No known network service found to restart; continuing."
fi

systemctl restart dnsmasq
systemctl restart hostapd

echo "==> Status"
systemctl --no-pager --full status hostapd | head -n 20 || true
systemctl --no-pager --full status dnsmasq | head -n 20 || true
EOS

echo "==> 9) Start services"
ssh -t "$DESTINATION" "sudo systemctl enable --now nginx postgresql rabbitmq-server && \
  sudo systemctl restart myapp && \
  sudo systemctl reload nginx"

echo "==> 9.5) Restore database from backup if available"
ssh "$DESTINATION" "bash -lc '
set -e
DB_BACKUP=\"$REMOTE_BASE/database_backup.dump\"

if [ -f \"\$DB_BACKUP\" ]; then
  echo \"Found database backup, restoring...\"

  TMP_BACKUP=\"/tmp/database_backup.dump\"
  cp \"\$DB_BACKUP\" \"\$TMP_BACKUP\"
  chmod 644 \"\$TMP_BACKUP\"

  # Ensure admin exists
  sudo -u postgres psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='\''admin'\''\" | grep -q 1 || \
    sudo -u postgres psql -c \"CREATE USER admin WITH PASSWORD '\''admin'\'';\"

  # Drop + create DB WITHOUT LOCALE (avoids en_US.UTF-8 mismatch)
  sudo -u postgres psql -c \"DROP DATABASE IF EXISTS db;\"
  sudo -u postgres psql -c \"CREATE DATABASE db OWNER admin TEMPLATE template0 ENCODING '\''UTF8'\'';\"

  # Restore into existing db (NO -C)
  sudo -u postgres pg_restore -d db --clean --if-exists \"\$TMP_BACKUP\"

  rm -f \"\$TMP_BACKUP\"
  echo \"Database restore completed\"
else
  echo \"No database backup found at \$DB_BACKUP, skipping restore\"
fi
'"

echo "==> 10) Quick checks"
ssh -t "$DESTINATION" "hostname; \
  ip -brief addr show $LAN_IF || true; \
  systemctl --no-pager --full status myapp | head -n 30; \
  sudo nginx -t"