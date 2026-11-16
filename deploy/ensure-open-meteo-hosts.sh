#!/usr/bin/env bash
# 确保服务器能访问 Open-Meteo 官方 API。
# 2026-11 实测：本网络把 api.open-meteo.com 解析到不可达 IP（51.81.167.44），
# 而该域名在 Cloudflare 的入口可达。脚本探测候选 Cloudflare 边缘 IP，
# 把可达地址写入 /etc/hosts（幂等），并重启前后端使新解析立即生效。
set -euo pipefail

CANDIDATES=${OPEN_METEO_HOSTS_CANDIDATES:-"104.21.5.20 104.21.5.21 172.67.178.9"}
PROBE='https://api.open-meteo.com/v1/forecast?latitude=30&longitude=120&current=temperature_2m'
PICK=""

for ip in $CANDIDATES; do
  if curl -fsS -o /dev/null --max-time 8 --resolve "api.open-meteo.com:443:${ip}" "$PROBE"; then
    PICK="$ip"
    break
  fi
done

if [ -z "$PICK" ]; then
  echo "Open-Meteo 没有可到达的候选地址，保留现有解析" >&2
  exit 1
fi

cp -n /etc/hosts "/etc/hosts.bak-$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
sed -i '/open-meteo\.com/d' /etc/hosts
{
  echo "# Open-Meteo 走可达的 Cloudflare 入口（由 deploy/ensure-open-meteo-hosts.sh 维护）"
  echo "${PICK} api.open-meteo.com"
  echo "${PICK} air-quality-api.open-meteo.com"
} >> /etc/hosts

echo "Open-Meteo -> ${PICK}"
getent ahosts api.open-meteo.com | head -1
systemctl restart shihou-backend shihou-frontend
