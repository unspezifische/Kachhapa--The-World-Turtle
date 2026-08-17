#!/usr/bin/env bash
set -u

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 HOSTNAME" >&2
  exit 2
fi

hostname=$1
failures=0
response_body=$(mktemp "${TMPDIR:-/tmp}/kachhapa-route-check.XXXXXX")
response_headers=$(mktemp "${TMPDIR:-/tmp}/kachhapa-route-headers.XXXXXX")
trap 'rm -f "$response_body" "$response_headers"' EXIT

command -v curl >/dev/null 2>&1 || {
  echo "Required command is unavailable: curl" >&2
  exit 1
}

command -v python3 >/dev/null 2>&1 || {
  echo "Required command is unavailable: python3" >&2
  exit 1
}

target_ip=""
for candidate in "$hostname" "maps.$hostname" "app.$hostname"; do
  if target_ip=$(python3 -c 'import socket,sys; print(socket.gethostbyname(sys.argv[1]))' "$candidate" 2>/dev/null); then
    break
  fi
done

if [[ -z "$target_ip" ]]; then
  echo "Unable to resolve $hostname or one of its known service names from this publisher." >&2
  exit 1
fi

# Pin every hostname used by the deployment to the same address. A single
# --resolve entry only covers the first request, so it is insufficient when
# curl follows maps.HOSTNAME to app.HOSTNAME.
curl_resolve_args=()
for service_host in \
  "$hostname" "app.$hostname" "tools.$hostname" "mtg.$hostname" "maps.$hostname"; do
  curl_resolve_args+=(--resolve "$service_host:80:$target_ip")
done

probe() {
  local label=$1
  local url=$2
  local expected=$3
  local attempt status="000" reason="request failed"

  # A service restart and an Nginx reload can briefly leave old workers or an
  # upstream connection in flight. Retry all unexpected statuses, including
  # 403, rather than only the status codes curl considers transient.
  for attempt in {1..15}; do
    if status=$(curl --location --silent --fail --noproxy '*' \
      "${curl_resolve_args[@]}" \
      --connect-timeout 5 --max-time 30 \
      --output "$response_body" --write-out '%{http_code}' "$url"); then
      if grep -Fqi "$expected" "$response_body"; then
        printf '  OK   %-18s %s (%s)\n' "$label" "$url" "$status"
        return 0
      fi
      reason="expected content was missing"
    else
      reason="request failed"
    fi
    sleep 2
  done

  printf '  FAIL %-18s %s (%s; last HTTP status: %s)\n' \
    "$label" "$url" "$reason" "$status" >&2
  failures=$((failures + 1))
}

probe_redirect() {
  local label=$1
  local url=$2
  local expected_location=$3
  local attempt status="000"

  for attempt in {1..15}; do
    : >"$response_headers"
    status=$(curl --silent --noproxy '*' "${curl_resolve_args[@]}" \
      --connect-timeout 5 --max-time 30 --output /dev/null --dump-header "$response_headers" \
      --write-out '%{http_code}' "$url") || status="000"
    if [[ "$status" =~ ^30[1278]$ ]] && grep -Fqi "Location: $expected_location" "$response_headers"; then
      printf '  OK   %-18s %s (%s)\n' "$label" "$url" "$status"
      return 0
    fi
    sleep 2
  done

  printf '  FAIL %-18s %s (expected redirect to %s; HTTP status: %s)\n' \
    "$label" "$url" "$expected_location" "$status" >&2
  failures=$((failures + 1))
}

probe_content_type() {
  local label=$1
  local url=$2
  local expected_type=$3
  local attempt status="000"

  for attempt in {1..15}; do
    : >"$response_headers"
    status=$(curl --silent --noproxy '*' "${curl_resolve_args[@]}" \
      --connect-timeout 5 --max-time 30 --output "$response_body" --dump-header "$response_headers" \
      --write-out '%{http_code}' "$url") || status="000"
    if [[ "$status" == "200" ]] && grep -Fqi "Content-Type: $expected_type" "$response_headers"; then
      printf '  OK   %-18s %s (%s; %s)\n' "$label" "$url" "$status" "$expected_type"
      return 0
    fi
    sleep 2
  done

  printf '  FAIL %-18s %s (expected Content-Type %s; HTTP status: %s)\n' \
    "$label" "$url" "$expected_type" "$status" >&2
  failures=$((failures + 1))
}

echo "==> Checking deployed routes from $(hostname) via $target_ip"
probe "Kachhapa" "http://$hostname/" "Kachhapa- The World Turtle"
probe "Kachhapa app" "http://app.$hostname/" "Kachhapa- The World Turtle"
probe "Campaign wiki" "http://$hostname/wiki/health" "kachhapa-wiki"
probe_content_type "Wiki assets" "http://app.$hostname/wiki-static/bootstrap.min.css" "text/css"
probe_content_type "Waterdeep media" "http://app.$hostname/media/modules/waterdeep_dragon_heist/waterdeep_texture.jpg" "image/jpeg"
probe "5etools" "http://tools.$hostname/index.html" "<title>5etools</title>"
probe "MTG frontend" "http://mtg.$hostname/" "<title>MTG Sandbox</title>"
probe "MTG API" "http://mtg.$hostname/api/health" '"ok":true'
probe "Settlement entry" "http://app.$hostname/settlementManager" "Kachhapa- The World Turtle"
probe "Foundry VTT" "http://maps.$hostname/" "Foundry Virtual Tabletop"

if (( failures > 0 )); then
  echo "$failures publisher-side route check(s) failed." >&2
  exit 1
fi

echo "All publisher-side route checks passed."
