# DP-34: servidor pessoal no Railway, acessível só pela tailnet de Lucas.
# Guia: docs/DEPLOY_RAILWAY.md. data/ não entra na imagem: é o volume em /app/data.

FROM python:3.13.9-slim-bookworm AS deps
ENV POETRY_VIRTUALENVS_CREATE=false PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/poetry && /opt/poetry/bin/pip install poetry==2.4.1 \
    && python -m venv /opt/venv
WORKDIR /build
COPY pyproject.toml poetry.lock ./
# Só o grupo main, exatamente como travado no poetry.lock (sem pytest/ruff/pyright).
RUN VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:$PATH \
    /opt/poetry/bin/poetry install --only main --no-root --no-interaction --no-ansi

# Binários estáticos oficiais do Tailscale, versão fixada.
FROM tailscale/tailscale:v1.104.1 AS tailscale

FROM python:3.13.9-slim-bookworm
# tini: PID 1 que repassa SIGTERM do Railway ao grupo (Python e tailscaled) e recolhe zumbis.
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /opt/venv /opt/venv
COPY --from=tailscale /usr/local/bin/tailscaled /usr/local/bin/tailscale /usr/local/bin/
# Fuso fixo nas chamadas ZoneInfo("America/Sao_Paulo") via pacote tzdata do lock;
# o fuso do contêiner (UTC) não altera regras de negócio, só o horário dos logs.
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    HFL_PORT=8081
WORKDIR /app
COPY . .
RUN sed -i 's/\r$//' scripts/railway_entrypoint.sh && chmod +x scripts/railway_entrypoint.sh \
    && mkdir -p /app/data \
    && python -c "import zoneinfo; zoneinfo.ZoneInfo('America/Sao_Paulo')"
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/app/scripts/railway_entrypoint.sh"]
