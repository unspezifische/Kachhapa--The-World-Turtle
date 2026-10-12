#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: scripts/configure-publish-sudo.sh [HOSTNAME] [--tailscale-ip IPv4]"
  exit 0
fi

hostname=${1:-raspberrypi.local}
[[ $# -eq 0 ]] || shift
target_ip=""
if [[ $# -gt 0 ]]; then
  [[ $# -eq 2 && "$1" == "--tailscale-ip" ]] || {
    echo "Usage: scripts/configure-publish-sudo.sh [HOSTNAME] [--tailscale-ip IPv4]" >&2
    exit 2
  }
  target_ip=$2
  python3 - "$target_ip" <<'PY'
import ipaddress, sys
address = ipaddress.ip_address(sys.argv[1])
assert address.version == 4 and address in ipaddress.ip_network('100.64.0.0/10')
PY
fi
[[ "$hostname" == *.* ]] || hostname="${hostname}.local"
destination="ijohnson@${target_ip:-$hostname}"

script_dir=$(cd "$(dirname "$0")" && pwd)
scp "$script_dir/kachhapa-deploy-root" "$destination:/home/ijohnson/kachhapa-deploy-root.new"
scp "$script_dir/kachhapa-publish.sudoers" "$destination:/home/ijohnson/kachhapa-publish.sudoers.new"
ssh -tt "$destination" 'set -Eeuo pipefail
sudo install -o root -g root -m 0755 /home/ijohnson/kachhapa-deploy-root.new /usr/local/sbin/kachhapa-deploy-root
sudo visudo -cf /home/ijohnson/kachhapa-publish.sudoers.new
sudo install -o root -g root -m 0440 /home/ijohnson/kachhapa-publish.sudoers.new /etc/sudoers.d/kachhapa-publish
rm -f /home/ijohnson/kachhapa-deploy-root.new /home/ijohnson/kachhapa-publish.sudoers.new
sudo -n /usr/local/sbin/kachhapa-deploy-root check'

echo "Passwordless publish privileges configured for $destination."
