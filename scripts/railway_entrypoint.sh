#!/bin/sh
# DP-34: Tailscale (userspace, sem TUN) + `tailscale serve` -> servidor em 127.0.0.1.
# Nada escuta publicamente: o HTTPS existe só na tailnet. Guia: docs/DEPLOY_RAILWAY.md.
#   TS_AUTHKEY      chave de autenticação; só é usada no primeiro login (estado no volume).
#   HFL_TAILSCALE=0 pula o Tailscale (teste local do contêiner); app fica só em 127.0.0.1.
#   HFL_PORT        porta local do servidor (padrão 8081).
set -eu

PORT="${HFL_PORT:-8081}"
STATE_DIR="${TS_STATE_DIR:-/app/data/.tailscale}"
SOCK=/tmp/tailscaled.sock
TS="tailscale --socket=$SOCK"

if [ "${HFL_TAILSCALE:-1}" != "0" ]; then
    # Sem chave e sem identidade salva o nó nunca entraria na tailnet: falhar já.
    if [ -z "${TS_AUTHKEY:-}" ] && [ ! -s "$STATE_DIR/tailscaled.state" ]; then
        echo "railway_entrypoint: TS_AUTHKEY ausente e sem estado em $STATE_DIR;" \
             "defina TS_AUTHKEY (ou HFL_TAILSCALE=0 para teste local)." >&2
        exit 64
    fi
    mkdir -p "$STATE_DIR"
    tailscaled --tun=userspace-networking --statedir="$STATE_DIR" --socket="$SOCK" &
    i=0
    until [ -S "$SOCK" ]; do
        i=$((i + 1)); [ "$i" -le 30 ] || { echo "railway_entrypoint: tailscaled não respondeu" >&2; exit 1; }
        sleep 1
    done
    # ephemeral=false é o padrão de uma chave não efêmera; o nó sobrevive a reinícios.
    timeout 60 $TS up ${TS_AUTHKEY:+--auth-key="$TS_AUTHKEY"} \
        --hostname="${TS_HOSTNAME:-hedge-fund-lab}" --ssh --accept-dns=false
    # HTTPS da tailnet (porta 443, certificado automático) -> http://127.0.0.1:$PORT.
    timeout 60 $TS serve --bg --yes --https=443 "http://127.0.0.1:$PORT" \
        || echo "railway_entrypoint: AVISO tailscale serve falhou (HTTPS ativado na tailnet?);" \
                "SSH segue disponível para diagnóstico." >&2
    # Nome MagicDNS que o navegador usará; o servidor precisa aceitá-lo como origem local.
    HFL_PUBLIC_HOST="$($TS status --json | python -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
    export HFL_PUBLIC_HOST
    echo "railway_entrypoint: tailnet https://$HFL_PUBLIC_HOST/"
fi

cd /app
# exec: o Python vira filho direto do tini, que entrega SIGTERM a ele e ao tailscaled.
exec python dashboard/server.py "$PORT"
