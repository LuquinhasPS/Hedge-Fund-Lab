"""
Hedge-fund-lab · Servidor HTTP para o Dashboard

Uso:
    python dashboard/server.py [porta]

Acessar: http://localhost:8080 (ou porta especificada)

Endpoints (somente leitura; servidor escuta apenas em 127.0.0.1):
    /h2                  — Dashboard H2 v6 (Validation, comparações, auditoria)
    /api/h2/status       — identidade, governança e estado das fases
    /api/h2/validation   — métricas, curvas, progresso e custos (?source=provisional|official|demo)
    /api/h2/run          — decisões e trades de um run (?source&run)
    /api/h2/trace        — chamadas LLM de uma sessão (?source&run&session)
    /api/h2/analysis     — preço x decisões, ciclos, exposição, multiagente (?source)
    /api/h2/decision     — Technical → Risk → Portfolio → execução de uma sessão (?source&run&session)
    /api/h2/artifact     — download de artifact selado (?source&run&name)
    /                    — Dashboard legado (Chart.js)
    /logs                — Visualizador de logs em tempo real (SSE)
    /api/logs            — SSE stream do arquivo de logs
"""

import html
import http.server
import json
import logging
import os
import re
import socketserver
import sqlite3
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import forward_api
import forward_jobs
import global_pm_api
import h2_api
import market_api
import monitoring_api
import network_scope
import platform_api
import portfolio_api
import radar_api
import radar_corporate_events
import radar_runs
from dotenv import dotenv_values

logger = logging.getLogger("hedgefund.dashboard")

PORT = 8081
DIR = Path(__file__).parent
PROJECT_ROOT = DIR.parent
ENV_FILE = PROJECT_ROOT / ".env"
LOG_FILE = PROJECT_ROOT / "data" / "logs" / "hedgefund.log"


SUPERVISION = {"confirm", "decision_session", "decision_sha256"}
#: Exact JSON fields per POST command; anything else is refused.
POST_FIELDS = {
    "prepare": set(),
    "preflight": set(),
    "benchmarks": set(),
    "run": {"confirm", "confirmation_token"},
    "supervision/sync": set(),
    "supervision/approve": SUPERVISION | {"limits"},
    "supervision/reject": SUPERVISION,
    "supervision/cancel": SUPERVISION,
    "scenario": {"decision_session", "decision_sha256", "limits", "hypothetical_open"},
}
#: Global navigation (HFL-UX-001, UX-M3): six areas by user goal plus global help.
#: (id, label, href, environment strip, ((href, label), ...) section links)
AREAS = (
    ("inicio", "Início", "/", "AMBIENTE EXPERIMENTAL · SEM ORDENS REAIS", ()),
    (
        "mercado",
        "Mercado",
        "/market",
        "CONSULTIVO · PARECERES DE IA, SEM ORDENS",
        (("/market", "Explorar ativos"), ("/radar", "Radar de comitês")),
    ),
    (
        "carteira",
        "Carteira multiativos",
        "/portfolio#visao-geral",
        "HIPOTÉTICA · CONSULTIVA · SEM EXECUÇÃO",
        (
            ("/portfolio#visao-geral", "Visão geral"),
            ("/portfolio#posicoes", "Posições e acompanhamento"),
            ("/portfolio#global-workflow", "Gestor Global: registros"),
            ("/portfolio#evidencias", "Histórico e evidências"),
            ("/portfolio#simulador", "Simulador demonstrativo"),
        ),
    ),
    (
        "operacao",
        "Operação diária PETR4",
        "/paper#sala",
        "PAPER PROSPECTIVO · CARTEIRAS VIRTUAIS",
        (
            ("/paper#acompanhamento", "Acompanhamento paper"),
            ("/paper#visao", "Resumo das carteiras"),
            ("/paper#sala", "Decisão do dia"),
            ("/paper#carteiras", "Carteiras prospectivas"),
            ("/paper#mercado", "Mercado e abertura"),
        ),
    ),
    (
        "pesquisa",
        "Pesquisa",
        "/h2",
        "REGISTRO HISTÓRICO · SOMENTE LEITURA",
        (
            ("/h2", "Experimento H2"),
            ("/paper#agentes", "Catálogo de agentes H2"),
            ("/legacy", "Backtests legados"),
        ),
    ),
    (
        "auditoria",
        "Auditoria",
        "/#audit",
        "SOMENTE LEITURA · REGISTROS E INTEGRIDADE",
        (("/#audit", "Registros e processos"), ("/logs", "Logs técnicos")),
    ),
)
#: Default area per page when JavaScript is unavailable; shell.js refines it by URL hash.
PAGE_AREA = {
    "platform.html": "inicio",
    "radar.html": "mercado",
    "market.html": "mercado",
    "portfolio.html": "carteira",
    "paper.html": "operacao",
    "h2.html": "pesquisa",
    "index.html": "pesquisa",
    "logs.html": "auditoria",
}


def strict_json(body):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate_key")
            result[key] = value
        return result

    return json.loads(
        body,
        object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite")),
    )


SUPERVISION_ACTIONS = {
    "supervision/approve": "APPROVE",
    "supervision/reject": "REJECT",
    "supervision/cancel": "CANCEL",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """Handler com rotas especiais para API de logs."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    # ── API ───────────────────────────────────────────────────────

    def do_GET(self):
        if not self._local_request():
            return self._send_json({"error": "local_origin_required"}, 403)
        if self.path.startswith("/api/forward/"):
            return self._handle_forward()
        if self.path.startswith("/api/radar/"):
            return self._handle_radar()
        if self.path.startswith("/api/portfolio/"):
            return self._handle_portfolio()
        if self.path.startswith("/api/global-pm/"):
            return self._handle_global_pm()
        if self.path.startswith("/api/platform/"):
            return self._handle_platform()
        if self.path == "/api/logs":
            return self._handle_logs_sse()
        if self.path.startswith("/api/h2/"):
            return self._handle_h2()
        path = urlsplit(self.path).path
        if path == "/":
            return self._serve_static("platform.html")
        if path in ("/legacy", "/legacy/"):
            return self._serve_static("index.html")
        if path in ("/logs", "/logs.html"):
            return self._serve_static("logs.html")
        if path in ("/h2", "/h2/", "/h2.html"):
            return self._serve_static("h2.html")
        if path in ("/paper", "/paper/", "/paper.html"):
            return self._serve_static("paper.html")
        if path in ("/radar", "/radar/", "/radar.html"):
            return self._serve_static("radar.html")
        if path in ("/market", "/market/", "/market.html"):
            return self._serve_static("market.html")
        if path in ("/portfolio", "/portfolio/", "/portfolio.html"):
            return self._serve_static("portfolio.html")
        if path == "/index.html":
            return self._serve_static("index.html")
        if self._static_allowed():
            return super().do_GET()
        return self._send_json(None, 404)

    def _local_request(self, post=False):
        port = self.server.server_address[1]
        hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
        if port == 80:
            hosts.update(("localhost", "127.0.0.1"))
        values = self.headers.get_all("Host", [])
        if len(values) != 1 or values[0] not in hosts:
            return False
        origins = self.headers.get_all("Origin", [])
        if len(origins) > 1 or (post and len(origins) != 1):
            return False
        if origins and origins[0] != f"http://{values[0]}":
            return False
        if self.headers.get("Sec-Fetch-Site") in ("cross-site", "same-site"):
            # Opening a public HTML entry point from another tab is safe. APIs,
            # subresources and every POST still require a same-origin request.
            return (
                not post
                and self.command == "GET"
                and self.headers.get("Sec-Fetch-Mode") == "navigate"
                and self.headers.get("Sec-Fetch-Dest") == "document"
                and urlsplit(self.path).path
                in (
                    "/",
                    "/h2",
                    "/h2/",
                    "/h2.html",
                    "/paper",
                    "/paper/",
                    "/paper.html",
                    "/radar",
                    "/radar/",
                    "/radar.html",
                    "/market",
                    "/market/",
                    "/market.html",
                    "/portfolio",
                    "/portfolio/",
                    "/portfolio.html",
                    "/logs",
                    "/logs.html",
                    "/index.html",
                    "/legacy",
                    "/legacy/",
                )
            )
        return True

    def _static_allowed(self):
        path = urlsplit(self.path).path
        allowed = {
            "/",
            "/index.html",
            "/h2.html",
            "/paper.html",
            "/logs.html",
            "/style.css",
            "/app.js",
            "/h2.js",
            "/paper.js",
            "/paper.css",
            "/radar.html",
            "/radar.css",
            "/radar.js",
            "/market.html",
            "/market.js",
            "/market-ui.js",
            "/market.css",
            "/portfolio.html",
            "/portfolio.css",
            "/portfolio.js",
            "/monitoring.js",
            "/monitoring.css",
            "/global-pm.js",
            "/global-pm.css",
            "/shell.css",
            "/shell.js",
            "/platform.css",
            "/platform.js",
            "/global-workflow.js",
            "/design-system.css",
            "/glossary.js",
            "/ui.js",
            "/data.json",
            "/vendor/chart.umd.js",
        }
        return (
            path in allowed
            and self.translate_path(path)
            and Path(self.translate_path(path)).resolve().is_relative_to(DIR.resolve())
        )

    def do_HEAD(self):
        if not self._local_request():
            return self.send_error(403)
        path = urlsplit(self.path).path
        pages = {
            "/": "platform.html",
            "/legacy": "index.html",
            "/legacy/": "index.html",
            "/index.html": "index.html",
        }
        for name in ("h2", "paper", "radar", "market", "portfolio", "logs"):
            pages.update(
                {
                    f"/{name}": f"{name}.html",
                    f"/{name}/": f"{name}.html",
                    f"/{name}.html": f"{name}.html",
                }
            )
        if path in pages:
            return self._serve_static(pages[path])
        if not self._static_allowed():
            return self.send_error(404)
        return super().do_HEAD()

    def _handle_forward(self):
        url = urlsplit(self.path)
        q = parse_qs(url.query, keep_blank_values=True)
        allowed = (
            {"job"}
            if url.path == "/api/forward/status"
            else {"session"}
            if url.path in ("/api/forward/decision", "/api/forward/supervision")
            else set()
        )
        if set(q) - allowed or any(len(v) != 1 for v in q.values()):
            return self._send_json({"error": "invalid_query"}, 400)
        try:
            if url.path == "/api/forward/status":
                return self._send_json(forward_jobs.JOBS.status(q.get("job", [None])[0]))
            if url.path == "/api/forward/history" and not q:
                return self._send_json(forward_api.history())
            if url.path == "/api/forward/decision":
                return self._send_json(forward_api.decision(q.get("session", [None])[0]))
            if url.path == "/api/forward/portfolios" and not q:
                return self._send_json(forward_api.portfolios())
            if url.path == "/api/forward/agents" and not q:
                return self._send_json(forward_api.agents())
            if url.path == "/api/forward/market" and not q:
                return self._send_json(market_api.market())
            if url.path == "/api/forward/supervision":
                return self._send_json(
                    forward_api.supervision(q.get("session", [None])[0])
                )
        except (ValueError, KeyError, OSError):
            return self._send_json({"error": "invalid_or_incomplete_record"}, 400)
        return self._send_json(None, 404)

    def do_POST(self):
        lengths = self.headers.get_all("Content-Length", [])
        body = None
        # Consume bounded bodies even on a rejected request. Closing a Windows
        # socket with unread bytes can reset it before the JSON error arrives.
        if (
            len(lengths) == 1
            and re.fullmatch(r"[0-9]{1,5}", lengths[0])
            and int(lengths[0]) <= 65536
            and not self.headers.get("Transfer-Encoding")
        ):
            try:
                self.connection.settimeout(3)
                body = self.rfile.read(int(lengths[0]))
            except OSError:
                return self._send_json({"error": "incomplete_payload"}, 400)
        jobs = forward_jobs.JOBS
        if not self._local_request(post=True):
            return self._send_json({"error": "local_origin_required"}, 403)
        tokens = self.headers.get_all("X-CSRF-Token", [])
        import hmac

        if len(tokens) != 1 or not hmac.compare_digest(
            tokens[0].encode("utf-8"), jobs.csrf.encode("utf-8")
        ):
            return self._send_json({"error": "invalid_csrf"}, 403)
        url = urlsplit(self.path)
        if url.path.startswith("/api/radar/"):
            return self._handle_radar(body)
        if url.path.startswith("/api/platform/"):
            return self._handle_platform(body)
        command = url.path.removeprefix("/api/forward/")
        if (
            url.query
            or url.path != f"/api/forward/{command}"
            or command not in POST_FIELDS
        ):
            return self._send_json(None, 404)
        if (
            len(lengths) != 1
            or not re.fullmatch(r"[0-9]{1,4}", lengths[0])
            or not 0 < int(lengths[0]) <= 4096
            or self.headers.get("Transfer-Encoding")
            or self.headers.get("Content-Type") != "application/json"
        ):
            return self._send_json({"error": "invalid_payload"}, 400)
        try:
            # Bound slow local clients as well as payload size.
            self.connection.settimeout(3)

            def unique(pairs):
                result = {}
                for k, v in pairs:
                    if k in result:
                        raise ValueError("duplicate_key")
                    result[k] = v
                return result

            payload = json.loads(
                body,
                object_pairs_hook=unique,
                parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite")),
            )
            fields = POST_FIELDS[command]
            if (
                not isinstance(payload, dict)
                or set(payload) != fields
                or ("confirm" in fields and payload["confirm"] is not True)
                or (
                    command == "run"
                    and not isinstance(payload["confirmation_token"], str)
                )
            ):
                raise ValueError("invalid_payload")
            action = SUPERVISION_ACTIONS.get(command)
            if command == "scenario":
                return self._send_json(market_api.scenario(payload))
            if action:
                # Order approval never authorizes a model call; it only writes
                # one immutable record for the supervised paper wallet.
                return self._send_json(forward_api.supervise(action, payload), 201)
            return self._send_json(
                jobs.start(
                    "supervised" if command == "supervision/sync" else command,
                    payload.get("confirmation_token"),
                ),
                202,
            )
        except (forward_jobs.Conflict, forward_api.sup.Conflict) as exc:
            return self._send_json({"error": str(exc)}, 409)
        except (ValueError, TypeError, OSError) as exc:
            # Validation codes such as invalid_limit:max_buy_price are safe to show.
            code = str(exc) if re.fullmatch(r"[a-z_]+(:[a-z_]+)?", str(exc)) else None
            return self._send_json(
                {"error": code or "invalid_payload_or_local_state"}, 400
            )

    def _handle_portfolio(self):
        url = urlsplit(self.path)
        try:
            query = parse_qs(url.query, keep_blank_values=True)
            if any(len(v) != 1 for v in query.values()):
                raise ValueError("invalid_query")
            if url.path == "/api/portfolio/monitoring":
                return self._send_json(
                    monitoring_api.get({k: v[0] for k, v in query.items()})
                )
            return self._send_json(
                portfolio_api.get(
                    url.path.removeprefix("/api/portfolio/"),
                    {k: v[0] for k, v in query.items()},
                )
            )
        except (ValueError, KeyError, OSError, TypeError, ArithmeticError):
            return self._send_json({"error": "portfolio_integrity_or_query_failed"}, 400)

    def _handle_platform(self, body=None):
        url = urlsplit(self.path)
        command = url.path.removeprefix("/api/platform/")
        try:
            if self.command == "GET":
                query = parse_qs(url.query, keep_blank_values=True)
                if any(len(v) != 1 for v in query.values()):
                    raise ValueError("invalid_query")
                return self._send_json(
                    platform_api.get(command, {k: v[0] for k, v in query.items()})
                )
            if command not in {"global-prepare", "global-run", "global-replay"}:
                return self._send_json(None, 404)
            if (
                url.query
                or body is None
                or not 0 < len(body) <= 4096
                or self.headers.get("Content-Type") != "application/json"
            ):
                raise ValueError("invalid_payload")
            return self._send_json(
                platform_api.GLOBAL_JOBS.start(
                    command.removeprefix("global-"), strict_json(body)
                ),
                202,
            )
        except forward_jobs.Conflict:
            return self._send_json(
                {"error": "global_job_exists_or_busy_consult_recovery"}, 409
            )
        except (
            ValueError,
            KeyError,
            TypeError,
            OSError,
            ArithmeticError,
            sqlite3.Error,
        ) as exc:
            code = (
                str(exc)
                if re.fullmatch(r"[a-z_0-9]+", str(exc))
                else "platform_record_or_request_invalid"
            )
            return self._send_json({"error": code}, 400)

    def _handle_global_pm(self):
        url = urlsplit(self.path)
        try:
            query = parse_qs(url.query, keep_blank_values=True)
            if any(len(v) != 1 for v in query.values()):
                raise ValueError("invalid_query")
            return self._send_json(
                global_pm_api.get(
                    url.path.removeprefix("/api/global-pm/"),
                    {k: v[0] for k, v in query.items()},
                )
            )
        except (ValueError, KeyError, OSError, TypeError, ArithmeticError, sqlite3.Error):
            return self._send_json({"error": "global_pm_integrity_or_query_failed"}, 400)

    def _handle_radar(self, body=None):
        url = urlsplit(self.path)
        command = url.path.removeprefix("/api/radar/")
        try:
            if self.command == "GET":
                query = parse_qs(url.query, keep_blank_values=True)
                if any(len(v) != 1 for v in query.values()):
                    raise ValueError("invalid_query")
                return self._send_json(
                    radar_api.get(
                        command,
                        {k: v[0] for k, v in query.items()},
                        forward_jobs.JOBS.csrf,
                    )
                )
            if (
                url.query
                or body is None
                or len(body) > 4096
                or self.headers.get("Content-Type") != "application/json"
            ):
                raise ValueError("invalid_payload")

            def unique(pairs):
                result = {}
                for key, value in pairs:
                    if key in result:
                        raise ValueError("duplicate_key")
                    result[key] = value
                return result

            payload = json.loads(
                body,
                object_pairs_hook=unique,
                parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite")),
            )
            platform_api.radar_post_gate(
                command, payload, self.headers.get_all("X-HFL-Radar-Run", [])
            )
            return self._send_json(radar_api.post(command, payload))
        except (ValueError, TypeError, OSError, KeyError, sqlite3.Error) as exc:
            code = (
                str(exc)
                if re.fullmatch(r"[a-z_0-9]+", str(exc))
                else "invalid_radar_state_or_payload"
            )
            return self._send_json({"error": code}, 400)

    def _handle_h2(self) -> None:
        """Read-only H2 v6 API; every parameter is checked against a fixed set."""
        url = urlsplit(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        source, slot, session = (
            q.get("source", "provisional"),
            q.get("run"),
            q.get("session"),
        )
        if source not in (*h2_api.SOURCES, "demo") or (
            slot is not None and slot not in (*h2_api.LLM, *h2_api.BENCHMARKS, "_root")
        ):
            return self._send_json(None, 400)
        if url.path == "/api/h2/status":
            return self._send_json(h2_api.status())
        if url.path == "/api/h2/validation":
            return self._send_json(h2_api.validation(source))
        if url.path == "/api/h2/run" and slot:
            return self._send_json(h2_api.run_detail(source, slot))
        if url.path == "/api/h2/analysis":
            return self._send_json(h2_api.analysis(source))
        is_session = re.fullmatch(r"\d{4}-\d{2}-\d{2}", session or "")
        if url.path == "/api/h2/trace" and slot and is_session:
            return self._send_json(h2_api.trace(source, slot, session))
        if url.path == "/api/h2/decision" and slot and is_session:
            return self._send_json(h2_api.decision(source, slot, session))
        if url.path == "/api/h2/artifact" and slot:
            path = h2_api.artifact_path(source, slot, q.get("name", ""))
            if path is None:
                return self._send_json(None, 404)
            data = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return None
        return self._send_json(None, 404)

    def _send_json(self, value, code=200) -> None:
        code = 404 if value is None and code == 200 else code
        body = json.dumps(
            value, ensure_ascii=False, allow_nan=False, default=str
        ).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, filename: str) -> None:
        """Serve um arquivo HTML estático do diretório dashboard."""
        path = DIR / filename
        if not path.exists():
            self.send_error(404, "Not found")
            return

        content = path.read_text(encoding="utf-8")
        if "<!-- platform-shell -->" in content:
            current = PAGE_AREA.get(filename, "inicio")
            area = next(a for a in AREAS if a[0] == current)
            marks = {
                key: (' aria-current="true"', "") if key == current else ("", " hidden")
                for key, *_ in AREAS
            }
            areas = "".join(
                f'<a href="{html.escape(href)}" data-area="{key}" data-env="{html.escape(env)}"'
                f"{marks[key][0]}>{html.escape(label)}</a>"
                for key, label, href, env, _ in AREAS
            )
            links = "".join(
                f'<a href="{html.escape(href)}" data-area="{key}"{marks[key][1]}>{html.escape(label)}</a>'
                for key, _, _, _, entries in AREAS
                for href, label in entries
            )
            shell = (
                (DIR / "shell.html")
                .read_text(encoding="utf-8")
                .replace("{{areas}}", areas)
                .replace("{{links}}", links)
                .replace("{{area}}", current)
                .replace("{{area_label}}", html.escape(area[1]))
                .replace("{{environment}}", html.escape(area[3]))
            )
            content = content.replace("<!-- platform-shell -->", shell)
        content = content.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def _handle_logs_sse(self) -> None:
        """SSE endpoint: envia linhas do arquivo de log em tempo real."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        last_size = 0
        try:
            while True:
                try:
                    if LOG_FILE.exists():
                        current_size = LOG_FILE.stat().st_size
                        if current_size > last_size:
                            with open(LOG_FILE, encoding="utf-8", errors="replace") as f:
                                f.seek(last_size)
                                new_lines = f.readlines()
                                last_size = current_size
                            if new_lines:
                                payload = json.dumps(
                                    {"lines": [line.rstrip("\n\r") for line in new_lines]}
                                )
                                self.wfile.write(f"data: {payload}\n\n".encode())
                                self.wfile.flush()
                        elif current_size < last_size:
                            # Log foi rotacionado/truncado — reinicia
                            last_size = 0
                            payload = json.dumps({"reset": True})
                            self.wfile.write(f"data: {payload}\n\n".encode())
                            self.wfile.flush()
                    else:
                        # Arquivo ainda não existe
                        payload = json.dumps({"lines": [], "waiting": True})
                        self.wfile.write(f"data: {payload}\n\n".encode())
                        self.wfile.flush()
                except OSError:
                    # Race condition: arquivo deletado entre stat() e open()
                    last_size = 0

                # Ping SSE para detectar se o cliente (navegador) fechou a aba/deu refresh.
                # Como SSE ignora linhas que começam com ":", serve como keep-alive invisível.
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()

                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Cliente desconectou — normal


class ReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    # On Windows SO_REUSEADDR lets a second server bind a port already in use; an
    # old server kept answering the API while a new one started silently.
    allow_reuse_address = sys.platform != "win32"
    # The default listen backlog (5) refuses connections when rapid source/run
    # switches fire parallel requests; refused fetches looked like "API down".
    request_queue_size = 64

    def handle_error(self, request, client_address):
        """Ignora erros de socket inofensivos (como navegador cancelando requisição)."""
        import sys

        err = sys.exc_info()[1]
        if isinstance(
            err, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)
        ):
            return
        super().handle_error(request, client_address)


def load_gemini_key(env_file=ENV_FILE):
    """Only ``GEMINI_API_KEY``, only for this process, never logged; the process
    environment wins over ``.env``. A key is not an authorization: paid calls still
    need preflight, token and explicit consent."""
    if os.environ.get("GEMINI_API_KEY", "").strip():
        return "ambiente"
    value = (dotenv_values(env_file) if env_file.is_file() else {}).get("GEMINI_API_KEY")
    if value and value.strip():
        os.environ["GEMINI_API_KEY"] = value.strip()
        return ".env"
    return "ausente"


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    # The /radar "Preparar dados" button and the CLI share one normalized path.
    radar_corporate_events.install()
    # Offline checks guard only their own request context; a paid worker thread is
    # never blocked by a concurrent GET (incident 2026-10-12 02:59 BRT).
    network_scope.install()
    # Configura logger mínimo para o dashboard (standalone)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    logger.info("GEMINI_API_KEY: %s", load_gemini_key())
    # The registry's selected run, if it accepts new calls, is the only write target.
    run = radar_runs.bind(radar_api)
    logger.info("Radar runner: %s", run or "nenhum (prepare/run recusados)")

    with ReusableTCPServer(("127.0.0.1", port), Handler) as httpd:
        logger.info("Servidor iniciado em http://localhost:%d", port)
        logger.info("  H2 v6     : http://localhost:%d/h2", port)
        logger.info("  Paper     : http://localhost:%d/paper", port)
        logger.info("  Plataforma: http://localhost:%d/", port)
        logger.info("  Legado    : http://localhost:%d/legacy", port)
        logger.info("  Logs      : http://localhost:%d/logs", port)
        logger.info("  Ctrl+C para parar")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("Servidor encerrado pelo usuário.")


if __name__ == "__main__":
    main()
