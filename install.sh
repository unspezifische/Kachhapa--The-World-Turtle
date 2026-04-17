#!/bin/bash
# Note: don't run this script while connected to the Pi's Wi-Fi AP, because the
# connection will drop when we reconfigure the AP settings.
set -euo pipefail

DESTINATION="ijohnson@raspberrypi.local"

REMOTE_BASE="/home/ijohnson/Kachhapa"
REMOTE_FLASK="$REMOTE_BASE/Flask"
REMOTE_WEB="$REMOTE_BASE/webapp"
REMOTE_VENV="$REMOTE_BASE/venv"

# ---- Wi-Fi AP settings ----
AP_SSID="PiNetwork"
AP_PASS="password"          # >= 8 chars
AP_IP="10.42.0.1"
AP_CIDR="10.42.0.1/24"
AP_DHCP_START="10.42.0.50"
AP_DHCP_END="10.42.0.150"
LAN_IF="wlan0"
WAN_IF="eth0"
COUNTRY_CODE="US"
CHANNEL="6"

echo "==> 0) Sanity check local files"
for f in "Flask/requirements.txt" "Flask/app.py" "nginx.conf" "myapp.service"; do
  [[ -f "$f" ]] || { echo "Missing required file: $f"; exit 1; }
done

echo "==> 1) Install base packages"
ssh "$DESTINATION" "sudo apt update && sudo apt install -y \
  nginx python3-venv python3-pip python3-dev build-essential pkg-config \
  libpq-dev libssl-dev libffi-dev python3-setuptools \
  cargo rustc \
  postgresql postgresql-contrib \
  rabbitmq-server \
  avahi-daemon avahi-utils \
  hostapd dnsmasq dhcpcd5 \
  iptables iptables-persistent"

echo "==> 2) Hostname + mDNS"
ssh "$DESTINATION" "sudo hostnamectl set-hostname raspberrypi && sudo systemctl enable --now avahi-daemon"

echo "==> Configure Avahi hostname aliases for LAN access"
ssh "$DESTINATION" "sudo bash -lc '
set -e

ETH_IP=\$(ip -4 -o addr show eth0 | awk '\''{print \$4}'\'' | cut -d/ -f1 | head -n1)

if [ -n \"\$ETH_IP\" ]; then
  cat > /etc/avahi/hosts <<EOF
# Extra mDNS hostname aliases for this Pi on the LAN
\$ETH_IP app.raspberrypi.local
\$ETH_IP tools.raspberrypi.local
\$ETH_IP maps.raspberrypi.local
EOF

  systemctl restart avahi-daemon
  echo \"Configured Avahi aliases on \$ETH_IP\"
else
  echo \"No eth0 IPv4 address found; skipping /etc/avahi/hosts aliases\"
fi
'"

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

echo "==> 8) Start base services"
ssh -t "$DESTINATION" "sudo systemctl enable --now nginx postgresql rabbitmq-server && \
  sudo systemctl reload nginx"

echo "==> 8.5) Ensure PostgreSQL cluster is online"
ssh -t "$DESTINATION" "bash -lc '
set -e

if command -v pg_lsclusters >/dev/null 2>&1; then
  echo \"Current PostgreSQL clusters:\"
  pg_lsclusters || true

  # Start any cluster that is down
  while read -r ver name port status owner data log; do
    if [ \"\$ver\" != \"Ver\" ] && [ \"\$status\" = \"down\" ]; then
      echo \"Starting PostgreSQL cluster \$ver/\$name...\"
      sudo pg_ctlcluster \$ver \$name start
    fi
  done < <(pg_lsclusters)

  echo \"PostgreSQL clusters after start attempt:\"
  pg_lsclusters || true
else
  echo \"pg_lsclusters not found; falling back to systemctl restart postgresql\"
  sudo systemctl restart postgresql
fi
'"

echo "==> 8.6) Verify PostgreSQL is listening"
ssh -t "$DESTINATION" "ss -lntp | grep 5432 || true"

echo "==> 9) Restore database from backup if available"
ssh "$DESTINATION" "bash -lc '
set -e
DB_BACKUP=\"$REMOTE_BASE/database_backup.dump\"

if [ -f \"\$DB_BACKUP\" ]; then
  echo \"Found database backup, restoring...\"

  TMP_BACKUP=\"/tmp/database_backup.dump\"
  cp \"\$DB_BACKUP\" \"\$TMP_BACKUP\"
  chmod 644 \"\$TMP_BACKUP\"

  sudo -u postgres psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='\''admin'\''\" | grep -q 1 || \
    sudo -u postgres psql -c \"CREATE USER admin WITH PASSWORD '\''admin'\'';\"

  sudo -u postgres psql -c \"DROP DATABASE IF EXISTS db;\"
  sudo -u postgres psql -c \"CREATE DATABASE db OWNER admin TEMPLATE template0 ENCODING '\''UTF8'\'';\"

  sudo -u postgres pg_restore -d db --clean --if-exists \"\$TMP_BACKUP\"

  rm -f \"\$TMP_BACKUP\"
  echo \"Database restore completed\"
else
  echo \"No database backup found at \$DB_BACKUP, skipping restore\"
fi
'"

echo "==> 9.5) Stamp restored database to current Alembic head"
ssh "$DESTINATION" "bash -lc '
set -e
cd /home/ijohnson/Kachhapa/Flask
source /home/ijohnson/Kachhapa/venv/bin/activate
flask db stamp head
'"

echo "==> 10) Start app service"
ssh -t "$DESTINATION" "sudo systemctl restart myapp"

echo "==> 11) Quick checks"
ssh -t "$DESTINATION" "hostname; \
  ip -brief addr show $LAN_IF || true; \
  systemctl --no-pager --full status myapp | head -n 30; \
  sudo nginx -t"

echo "==> 12) Final step: switch wlan0 from client mode to AP mode"
echo "==> About to cut over wlan0 into AP mode. SSH may disconnect after this point."
ssh -t "$DESTINATION" "sudo bash -s" <<EOS
set -euo pipefail

LAN_IF="$LAN_IF"
WAN_IF="$WAN_IF"
AP_SSID="$AP_SSID"
AP_PASS="$AP_PASS"
AP_CIDR="$AP_CIDR"
AP_IP="$AP_IP"
DHCP_START="$AP_DHCP_START"
DHCP_END="$AP_DHCP_END"
COUNTRY_CODE="$COUNTRY_CODE"
CHANNEL="$CHANNEL"

echo "==> Sanity: check interface exists"
ip link show "\$LAN_IF" >/dev/null 2>&1 || { echo "Interface \$LAN_IF not found"; ip -br link; exit 1; }

echo "==> Stop AP services while reconfiguring"
systemctl stop hostapd 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true

echo "==> Free wlan0 from client mode"
systemctl stop NetworkManager 2>/dev/null || true
systemctl disable NetworkManager 2>/dev/null || true
systemctl stop wpa_supplicant 2>/dev/null || true
systemctl stop wpa_supplicant@wlan0 2>/dev/null || true

echo "==> Configure static IP for AP (dhcpcd)"
grep -q "^interface \$LAN_IF" /etc/dhcpcd.conf 2>/dev/null || cat >> /etc/dhcpcd.conf <<EOF

interface \$LAN_IF
  static ip_address=\$AP_CIDR
  nohook wpa_supplicant
EOF

echo "==> Assign AP IP immediately"
ip addr flush dev "\$LAN_IF" 2>/dev/null || true
ip addr add "\$AP_CIDR" dev "\$LAN_IF"
ip link set "\$LAN_IF" up

echo "==> Configure dnsmasq DHCP + DNS"
mkdir -p /etc/dnsmasq.d
cat > /etc/dnsmasq.d/kachhapa-ap.conf <<EOF
interface=\$LAN_IF
listen-address=127.0.0.1,\$AP_IP
bind-dynamic

dhcp-range=\$DHCP_START,\$DHCP_END,255.255.255.0,12h

domain-needed
bogus-priv

dhcp-option=option:router,\$AP_IP
dhcp-option=option:dns-server,\$AP_IP

address=/raspberrypi.local/\$AP_IP
address=/app.raspberrypi.local/\$AP_IP
address=/tools.raspberrypi.local/\$AP_IP
address=/maps.raspberrypi.local/\$AP_IP
EOF

echo "==> Configure upstream DNS for dnsmasq"
if grep -q "^no-resolv" /etc/dnsmasq.conf 2>/dev/null; then
  sed -i '/^server=8\.8\.8\.8$/d;/^server=1\.1\.1\.1$/d;/^server=192\.168\./d' /etc/dnsmasq.conf
else
  echo "no-resolv" >> /etc/dnsmasq.conf
fi

WAN_GW=\$(ip route | awk '/default/ {print \$3; exit}')
if [ -n "\$WAN_GW" ]; then
  grep -q "^server=\$WAN_GW\$" /etc/dnsmasq.conf 2>/dev/null || echo "server=\$WAN_GW" >> /etc/dnsmasq.conf
fi
grep -q "^server=8.8.8.8$" /etc/dnsmasq.conf 2>/dev/null || echo "server=8.8.8.8" >> /etc/dnsmasq.conf
grep -q "^server=1.1.1.1$" /etc/dnsmasq.conf 2>/dev/null || echo "server=1.1.1.1" >> /etc/dnsmasq.conf

grep -q "^conf-dir=/etc/dnsmasq.d" /etc/dnsmasq.conf 2>/dev/null || \
  echo "conf-dir=/etc/dnsmasq.d,*.conf" >> /etc/dnsmasq.conf

echo "==> Configure hostapd"
cat > /etc/hostapd/hostapd.conf <<EOF
country_code=\$COUNTRY_CODE
interface=\$LAN_IF
ssid=\$AP_SSID
hw_mode=g
channel=\$CHANNEL
ieee80211n=1
wmm_enabled=1
auth_algs=1
wpa=2
wpa_passphrase=\$AP_PASS
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOF

echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

echo "==> Configure dnsmasq startup ordering"
mkdir -p /etc/systemd/system/dnsmasq.service.d
cat > /etc/systemd/system/dnsmasq.service.d/override.conf <<'EOF'
[Unit]
After=hostapd.service network-online.target
Wants=hostapd.service network-online.target

[Service]
Restart=on-failure
RestartSec=2
ExecStartPre=/bin/sh -c 'for i in $(seq 1 15); do ip link show wlan0 >/dev/null 2>&1 && exit 0; sleep 1; done; echo "wlan0 not ready"; exit 1'
EOF

systemctl daemon-reload

echo "==> Enable IP forwarding"
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-kachhapa-ipforward.conf
sysctl --system

echo "==> Configure NAT and forwarding with iptables"
iptables -t nat -F POSTROUTING
iptables -F FORWARD

iptables -t nat -A POSTROUTING -s 10.42.0.0/24 -o "\$WAN_IF" -j MASQUERADE
iptables -A FORWARD -i "\$WAN_IF" -o "\$LAN_IF" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -A FORWARD -i "\$LAN_IF" -o "\$WAN_IF" -j ACCEPT

netfilter-persistent save || true

echo "==> Enable services"
systemctl unmask hostapd || true
systemctl enable hostapd
systemctl enable dnsmasq
systemctl enable dhcpcd 2>/dev/null || true

echo "==> Restart networking + AP services"
systemctl restart dhcpcd 2>/dev/null || true
systemctl restart dnsmasq
systemctl restart hostapd

echo "==> Final AP status"
ip -brief addr show "\$LAN_IF" || true
systemctl --no-pager --full status hostapd | head -n 20 || true
systemctl --no-pager --full status dnsmasq | head -n 20 || true
iptables -t nat -L -n -v || true
iptables -L FORWARD -n -v || true
EOS