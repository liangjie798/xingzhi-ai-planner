#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/shihou
APP_USER=shihou
ENV_DIR=/etc/shihou

if [ "$(id -u)" -ne 0 ]; then
  echo 'Run this script as root.' >&2
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

install -d -m 750 -o root -g "$APP_USER" "$ENV_DIR"
if [ ! -f "$ENV_DIR/backend.env" ]; then
  db_password="$(openssl rand -hex 24)"
  cat > "$ENV_DIR/backend.env" <<EOF
DATABASE_URL=jdbc:mysql://127.0.0.1:3306/shihou?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC
DATABASE_USERNAME=shihou
DATABASE_PASSWORD=$db_password
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
FRONTEND_ORIGIN=https://lht574.cn
EOF
  chown root:"$APP_USER" "$ENV_DIR/backend.env"
  chmod 640 "$ENV_DIR/backend.env"
fi

db_password="$(sed -n 's/^DATABASE_PASSWORD=//p' "$ENV_DIR/backend.env")"
if [ -z "$db_password" ]; then
  echo 'DATABASE_PASSWORD is missing.' >&2
  exit 1
fi

cat > /etc/mysql/mysql.conf.d/shihou.cnf <<'EOF'
[mysqld]
innodb_buffer_pool_size=128M
performance_schema=OFF
max_connections=50
EOF
systemctl restart mysql

mysql <<SQL
CREATE DATABASE IF NOT EXISTS shihou CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'shihou'@'localhost' IDENTIFIED BY '$db_password';
CREATE USER IF NOT EXISTS 'shihou'@'127.0.0.1' IDENTIFIED BY '$db_password';
ALTER USER 'shihou'@'localhost' IDENTIFIED BY '$db_password';
ALTER USER 'shihou'@'127.0.0.1' IDENTIFIED BY '$db_password';
GRANT ALL PRIVILEGES ON shihou.* TO 'shihou'@'localhost';
GRANT ALL PRIVILEGES ON shihou.* TO 'shihou'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

install -m 644 "$APP_DIR/deploy/native-backend.service" /etc/systemd/system/shihou-backend.service
install -m 644 "$APP_DIR/deploy/native-frontend.service" /etc/systemd/system/shihou-frontend.service
install -m 644 "$APP_DIR/deploy/native-nginx.conf" /etc/nginx/sites-available/shihou
ln -sfn /etc/nginx/sites-available/shihou /etc/nginx/sites-enabled/shihou
if [ -L /etc/nginx/sites-enabled/default ]; then
  rm /etc/nginx/sites-enabled/default
fi

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
cd "$APP_DIR/frontend"
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS=--max-old-space-size=1024
npm ci --no-audit --no-fund
npm run build
install -d -o "$APP_USER" -g "$APP_USER" .next/standalone/.next
cp -a .next/static .next/standalone/.next/static
cp -a public .next/standalone/public
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

nginx -t
systemctl daemon-reload
systemctl enable --now shihou-backend shihou-frontend nginx
systemctl restart shihou-backend shihou-frontend nginx

echo 'Native deployment started. Check systemctl status and /actuator/health.'
