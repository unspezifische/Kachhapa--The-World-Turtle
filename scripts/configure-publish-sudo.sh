#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: scripts/configure-publish-sudo.sh [HOSTNAME]" >&2
  exit 2
fi
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: scripts/configure-publish-sudo.sh [HOSTNAME]"
  exit 0
fi

hostname=${1:-raspberrypi.local}
[[ "$hostname" == *.* ]] || hostname="${hostname}.local"
destination="ijohnson@${hostname}"

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
