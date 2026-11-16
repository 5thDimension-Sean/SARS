#!/usr/bin/env bash
# One-time setup of the TANGO private NISAR worker on an Ubuntu 22.04/24.04 ARM or x86 VM
# (for example Oracle Cloud Always Free Ampere A1). Run as a sudo-capable user:
#   PROCESSING_DOMAIN=203-0-113-10.sslip.io \
#   PROCESSING_ALLOWED_ORIGINS=https://tangosars.vercel.app \
#   bash oracle-setup.sh
# Not tested on a live VM: read it first and check each step's output.
# No Earthdata token belongs here: every visitor submits their own through the HTTPS form.
set -euo pipefail
: "${PROCESSING_DOMAIN:?set PROCESSING_DOMAIN to the HTTPS hostname that points at this VM}"
: "${PROCESSING_ALLOWED_ORIGINS:?set PROCESSING_ALLOWED_ORIGINS to the exact frontend origin}"
REPO_URL="${REPO_URL:-https://github.com/5thDimension-Sean/SARS.git}"
REF="${REF:-feat/nisar-hackathon-ready}"

sudo apt-get update -y
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y software-properties-common git curl debian-keyring debian-archive-keyring apt-transport-https gpg
# Python 3.13 (the version the pipeline pins) from the deadsnakes PPA.
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y python3.13 python3.13-venv
# Caddy from its official apt repository (automatic HTTPS).
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y && sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y caddy

# Code and virtualenv. Wheels only: nothing compiles and no system GDAL is needed.
sudo mkdir -p /opt/tango && sudo chown "$USER" /opt/tango
if [ -d /opt/tango/.git ]; then git -C /opt/tango fetch origin "$REF" && git -C /opt/tango checkout -q "$REF" && git -C /opt/tango pull -q --ff-only origin "$REF"
else git clone --branch "$REF" "$REPO_URL" /opt/tango; fi
python3.13 -m venv /opt/tango/.venv
/opt/tango/.venv/bin/pip install --only-binary=:all: -r /opt/tango/pipeline/private-api-requirements.txt

# Worker service (loopback only, 4 GB memory cap, one worker process).
echo "PROCESSING_ALLOWED_ORIGINS=${PROCESSING_ALLOWED_ORIGINS}" | sudo tee /etc/tango-processing.env >/dev/null
sudo chmod 600 /etc/tango-processing.env
sudo cp /opt/tango/pipeline/deployment/tango-processing.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tango-processing
sudo systemctl restart tango-processing

# Caddy: HTTPS in front of 127.0.0.1:8090, no access logging.
sudo cp /opt/tango/pipeline/deployment/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=PROCESSING_DOMAIN=%s\n' "$PROCESSING_DOMAIN" | sudo tee /etc/systemd/system/caddy.service.d/domain.conf >/dev/null
sudo systemctl daemon-reload && sudo systemctl restart caddy

# Oracle's Ubuntu images ship iptables rules that block 80/443 even after the cloud
# security list allows them. Open only HTTP (certificate issuance) and HTTPS.
sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
command -v netfilter-persistent >/dev/null || sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo netfilter-persistent save

sudo systemctl is-active --quiet tango-processing caddy
# Return failure if either health check fails; never print a successful completion after FAILED.
local_health=$(curl -fsS --connect-timeout 5 --max-time 10 --retry 5 --retry-connrefused http://127.0.0.1:8090/v1/health)
echo "Local health:  ${local_health}"
public_health=$(curl -fsS --connect-timeout 5 --max-time 20 --retry 5 --retry-connrefused "https://${PROCESSING_DOMAIN}/v1/health")
echo "Public health: ${public_health}"
echo "Next: set NEXT_PUBLIC_PROCESSING_API_URL=https://${PROCESSING_DOMAIN} in Vercel, redeploy, then run pipeline/verify_coordinate_backend.py."
