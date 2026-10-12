"""V7 aggregates existing authorities; only explicit global commands can write.

Never calls reconciliation, order approval, market downloads or shell commands.
"""

import json
import os
import re
import socket
import sqlite3
import threading
from collections import Counter
from contextlib import closing

import forward_api as forward
import forward_jobs
import global_pm_api as global_api
import h2_api
import market_api
import portfolio_api
import radar_api

b, pm, cli, radar = global_api.b, global_api.pm, global_api.cli, global_api.radar
ROOT = forward.ROOT
OPERATIONS = ROOT / "data/platform/v7"
ID = re.compile(r"v7-[0-9a-f]{32}")
FIELDS = {
    "prepare": {
        "id",
        "mode",
        "session",
        "tickers",
        "capital",
        "confirm_hypothetical",
        "ack_fixture_policy",
    },
    "run": {"id", "max_usd", "confirmation_token", "authorize_paid", "confirm"},
    "replay": {"id", "confirm"},
}
COMMON = {
    "NO_PROPOSAL": "NOT_PREPARED",
    "AWAITING_PREFLIGHT": "PREPARED",
    "READY_FOR_INFERENCE": "READY",
    "DECIDED": "DECISION_EXISTS",
    "INFERENCE_RUNNING": "RUNNING",
    "RUNNING": "RUNNING",
    "COMPLETE": "COMPLETED",
    "COMPLETED": "COMPLETED",
    "VALID_PROPOSAL": "COMPLETED",
    "PROPOSALS_AVAILABLE": "COMPLETED",
    "PREPARED": "PREPARED",
    "NOT_PREPARED": "NOT_PREPARED",
    "READY": "READY",
    "DECISION_EXISTS": "DECISION_EXISTS",
    "FAILED": "FAILED",
    "PROVIDER_FAILED": "FAILED",
    "RECOVERY_REQUIRED": "RECOVERY_REQUIRED",
    "FAILED_REPLAY_ONLY": "RECOVERY_REQUIRED",
    "INTERRUPTED_REVIEW_LOCK_AND_REPLAY": "RECOVERY_REQUIRED",
    "PROPOSAL_EXPIRED": "EXPIRED",
    "EXPIRED": "EXPIRED",
    "EXPIRADA": "EXPIRED",
    "AGUARDANDO_APROVACAO": "PREPARED",
    "APROVADA": "READY",
    "AJUSTADA_CONCENTRACAO": "READY",
    "PENDENTE_ABERTURA": "READY",
    "EXECUTADA": "COMPLETED",
    "BLOCKED": "BLOCKED",
    "REJECTED_BY_VALIDATOR": "BLOCKED",
    "INTEGRITY_ERROR": "BLOCKED",
    "INSUFFICIENT_DATA": "BLOCKED",
    "REJEITADA": "BLOCKED",
    "CANCELADA": "BLOCKED",
}


def visual_state(native):
    return {"native_state": native, "state": COMMON.get(native, "BLOCKED")}


def analysis_root(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise ValueError("invalid_analysis_id")
    return pm.root_path(pm.OUTPUT / value)


def source_root(mode):
    if mode not in pm.MODES:
        raise ValueError("invalid_analysis_mode")
    return (
        global_api.SYNTHETIC_RADAR
        if mode == "SYNTHETIC_DEMO"
        else global_api.OFFICIAL_RADAR
    )


def attempt(call):
    try:
        return {"available": True, "data": call()}
    except (ValueError, TypeError, KeyError, OSError, ArithmeticError, sqlite3.Error):
        return {
            "available": False,
            "state": "BLOCKED",
            "error": "local_record_unavailable_or_integrity_failed",
        }


def forward_integrity(root):
    """Check recorded references, without opening any reserved scientific data."""
    radar.frozen_sources()
    manifest = forward.fwd.CANDIDATE.with_suffix(".sha256").read_text().strip()
    state = forward.fwd.load_state(root, manifest)
    if not (root / "state.json").exists():
        return {"ok": False, "state": "NOT_PREPARED", "scope": "recorded_references"}
    count = 0
    for entry in state["decisions"]:
        folder = root / "sessions" / forward.session_name(entry["session"])
        d = forward.read(folder / "decision.json")
        if not d or b.sha_file(folder / "decision.json") != entry["decision_sha256"]:
            raise ValueError("original_decision_changed")
        data = forward.read(folder / "input.json")
        if (
            b.sha_file(folder / "input.json") != d["input_sha256"]
            or b.sha_file(folder / "bars.csv") != data["history"]["sha256"]
            or b.sha_file(folder / "llm_trace.jsonl") != d["llm_trace_sha256"]
            or b.sha_file(folder / "provider_journal.jsonl")
            != d["provider_journal_sha256"]
            or d["manifest_sha256"] != manifest
            or d["participant_sha256"] != forward.fwd.PARTICIPANT_SHA256
        ):
            raise ValueError("original_references_changed")
        count += 1
    return {
        "ok": True,
        "decisions": count,
        "manifest_sha256": manifest,
        "scope": "identity_and_recorded_input_bars_trace_journal_hashes",
    }


PREPARE_COMMAND = (
    ".venv/Scripts/python.exe -B scripts/radar_corporate_events.py prepare "
    "--session {day} --tickers {tickers}"
)
CORPORATE_ERRORS = ("split-like mismatch", "corporate event")


GUARD_MESSAGE = "offline qualification forbids network"
OUTCOME_ACTIONS = {
    "COMMITTEE_COMPLETED": "Parecer oficial completo e íntegro.",
    "RECOVERABLE_OFFLINE": "Envelopes gravados: recuperar somente offline (replay, sem nova chamada).",
    "COMMITTEE_PARTIAL": "Comitê parcial: votos gravados insuficientes; não repetir chamadas deste claim.",
    "UNCERTAIN_CALLS": "Chamada de resultado incerto: não repetir; conferir uso no console do provedor.",
    "NO_RECOVERABLE_ENVELOPE": "Incidente imutável: nenhuma resposta gravada, replay não reconstrói. Nova "
    "tentativa só em identidade operacional separada, com orçamento e autorização novos.",
}


def committee_outcome(root, ticker, day):
    """What happened to each reserved call of one claim; read-only, codes only."""
    folder = radar.folder_for(root, ticker, day)
    if (folder / "result.sha256").exists():
        synthetic = radar.read(folder / "result.json")["mode"] == "synthetic"
        return {
            "state": "COMMITTEE_COMPLETED",
            "billing": "SYNTHETIC_NO_PROVIDER"
            if synthetic
            else "PROVIDER_USAGE_RECORDED",
        }
    if not (folder / "claim.json").exists():
        return None
    kinds, usage = [], False
    if (folder / "calls.sqlite").exists():
        uri = (folder / "calls.sqlite").as_uri() + "?mode=ro"
        with closing(sqlite3.connect(uri, uri=True)) as db:
            last = {
                seq: json.loads(evidence)
                for seq, evidence in db.execute(
                    "SELECT sequence, evidence FROM attempts WHERE slot='L01' "
                    "ORDER BY sequence, attempt"
                )
            }
            rows = db.execute(
                "SELECT sequence, raw IS NOT NULL, record FROM calls WHERE slot='L01' "
                "ORDER BY sequence"
            ).fetchall()
        for seq, raw, record in rows:
            record = json.loads(record) if record else None
            evidence = last.get(seq, {})
            usage |= bool(record and record.get("token_usage"))
            kinds.append(
                "UNCERTAIN"  # reserved, no durable outcome: the request may have left
                if record is None
                else "OK"
                if record.get("status") == "ok"
                else "ENVELOPE_RECORDED"
                if raw
                else "BLOCKED_BEFORE_CONNECT"
                if evidence.get("type") == "RuntimeError"
                and evidence.get("message") == GUARD_MESSAGE
                and evidence.get("http_status") is None
                else "PROVIDER_HTTP_ERROR"
                if evidence.get("http_status") is not None
                else "TRANSPORT_ERROR"
            )
    if "UNCERTAIN" in kinds:
        state = "UNCERTAIN_CALLS"
    elif kinds and set(kinds) <= {"OK", "ENVELOPE_RECORDED"}:
        state = "RECOVERABLE_OFFLINE"
    elif "OK" in kinds:
        state = "COMMITTEE_PARTIAL"
    else:
        state = "NO_RECOVERABLE_ENVELOPE"
    return {
        "state": state,
        "calls_reserved": len(kinds),
        "calls": dict(Counter(kinds)),
        # A local guard refusal happens before any socket exists; provider-side usage
        # is still to be confirmed in its console, never assumed from a null status.
        "billing": "PROVIDER_USAGE_RECORDED"
        if usage
        else "NO_SEND_EVIDENCE"
        if kinds and set(kinds) == {"BLOCKED_BEFORE_CONNECT"}
        else "UNKNOWN",
    }


def radar_job(root=None):
    """``radar_api.job()`` plus committee outcomes: a finished job is not a successful batch."""
    job = radar_api.job()
    if not job or job.get("command") != "run" or job.get("status") != "COMPLETED":
        return job
    root = root or radar_api.ROOT
    start, end = b.instant(job["started_at"]), b.instant(job["finished_at"])
    states = {}
    for item in job.get("items", []):
        ticker = radar.tickers([item["ticker"]])[0]
        claims = [
            path
            for path in (root / "analyses" / ticker).glob("*/claim.json")
            if start <= b.instant(radar.read(path)["created_at"]) <= end
        ]
        outcome = (
            committee_outcome(root, ticker, claims[-1].parent.name) if claims else None
        )
        states[ticker] = outcome["state"] if outcome else "UNKNOWN"
    done = sum(state == "COMMITTEE_COMPLETED" for state in states.values())
    return {
        **job,
        "outcome": {
            "state": "COMPLETED"
            if done == len(states)
            else "PARTIAL"
            if done
            else "FAILED",
            "committees_completed": done,
            "committees": len(states),
            "states": states,
            "summary": f"Infraestrutura concluída · {done}/{len(states)} comitês concluídos",
        },
    }


def input_facts(root, ticker, day):
    """Frozen-input projection; ``checked_input`` raises on any integrity drift."""
    data = radar.checked_input(root, ticker, day)
    corporate = data["source"].get("corporate_events") or {}
    volatility = data["risk_metrics"]["asset_volatility_21"]
    limit = data["manifest"]["risk"]["max_asset_volatility"]
    return {
        "input_sha256": radar.sha_file(
            radar.folder_for(root, ticker, day) / "input.json"
        ),
        "prepared_at": data["prepared_at"],
        "mode": data["manifest"]["mode"],
        "manifest_sha256": data["manifest_sha256"],
        "bars": data["history"]["bars"],
        "history_start": data["history"]["start"],
        "bars_sha256": data["history"]["sha256"],
        "source": data["source"]["name"],
        "cotahist_sha256": data["source"].get("cotahist_sha256"),
        "raw_close": data["raw_bar"]["fechamento"],
        "adjusted_close": data["adjusted_close"],
        "normalization": {
            # An original-extractor input passed the split guard: no event in window.
            "state": "NORMALIZED_CONFIRMED_EVENT"
            if corporate.get("events")
            else "NO_NORMALIZATION_NEEDED",
            "extractor": corporate.get("normalization", "ORIGINAL_V4_GUARD_PASSED"),
            "events": corporate.get("events", []),
        },
        "risk": {
            "asset_volatility_21": volatility,
            "limit": limit,
            "restricted": volatility > limit,
        },
    }


def radar_readiness(day, symbols, root=None):
    """Per official ticker: input, normalization, risk restriction, opinion and next step."""
    root = root or global_api.OFFICIAL_RADAR
    selection = global_api.selection("CONSULTATIVE_SANDBOX", day, symbols)
    last = root / "last_prepare.json"
    # last_prepare.json only reports the latest prepare call; inputs are the authority.
    blocked = {
        i["ticker"]: i.get("error", "")
        for i in (radar.read(last)["items"] if last.exists() else [])
        if i["session"] == day and i["status"] == "BLOCKED"
    }
    try:
        preflight = radar.preflight(selection["selected"], root, day=day)
    except (ValueError, OSError) as exc:
        preflight = {"ready": False, "items": [], "error": str(exc)}
    checks = {i["ticker"]: i for i in preflight["items"]}
    command = PREPARE_COMMAND.format(day=day, tickers=" ".join(selection["selected"]))
    items = []
    for entry in selection["items"]:
        ticker = entry["ticker"]
        check = checks.get(ticker, {})
        item = {
            "ticker": ticker,
            "session": day,
            "input": None,
            "opinion": "NONE",
            "risk_verdict": None,
            "preflight": "READY" if check.get("ready") else check.get("error"),
        }
        if not (radar.folder_for(root, ticker, day) / "input.json").exists():
            error = blocked.get(ticker)
            corporate = bool(error) and any(k in error for k in CORPORATE_ERRORS)
            item.update(
                preflight="INPUT_REQUIRED",
                state="INPUT_BLOCKED" if error else "NO_INPUT",
                input_state="UNRESOLVED_DIVERGENCE"
                if corporate
                else "BLOCKED_DATA"
                if error
                else "PREPARATION_REQUIRED",
                error=error,
                action="Preparar dados em /radar (botão 1) ou pelo CLI equivalente; "
                "gratuito, grava inputs, sem Gemini."
                + (
                    " O bloqueio registrado é anterior ou não confirmado pela B3: se "
                    "persistir após o preparo normalizado, o ativo fica fora."
                    if error
                    else ""
                ),
            )
            items.append(item)
            continue
        try:
            item["input"] = input_facts(root, ticker, day)
            detail = radar.detail(ticker, day, root)
        except (ValueError, KeyError, OSError, sqlite3.Error) as exc:
            item.update(
                state="INTEGRITY_ERROR",
                input_state="INTEGRITY_ERROR",
                error=str(exc),
                action="Input divergente da identidade Radar atual; não reutilizar nem sobrescrever.",
            )
            items.append(item)
            continue
        native = detail["status"]
        outcome = committee_outcome(root, ticker, day)
        item.update(
            outcome=outcome,
            input_state="FROZEN",
            opinion={
                "PREPARED": "PENDING",
                "COMPLETED": "COMPLETED",
                "FAILED_REPLAY_ONLY": "RECOVERY_REQUIRED",
            }.get(native, native),
            risk_verdict=(detail.get("risk") or {}).get("verdict"),
        )
        risk = item["input"]["risk"]
        restriction = (
            f" Restrição de risco: volatilidade 21d {risk['asset_volatility_21']:.3f} acima do"
            f" limite {risk['limit']}; o Risk vetará por regra determinística (parecer completo,"
            " recomendação MANTER)."
            if risk["restricted"] and native != "COMPLETED"
            else ""
        )
        if entry["status"] == "ELIGIBLE":
            item.update(state="ELIGIBLE", action="Parecer oficial completo e íntegro.")
        else:
            item.update(
                state={
                    "PREPARED": "AWAITING_RADAR_AUTHORIZATION",
                    "FAILED_REPLAY_ONLY": "RECOVERY_REQUIRED",
                }.get(native, "INELIGIBLE"),
                action={
                    "PREPARED": "Input congelado; parecer pendente: preflight Radar e "
                    "autorização paga própria do lote." + restriction,
                    "FAILED_REPLAY_ONLY": OUTCOME_ACTIONS[outcome["state"]]
                    if outcome
                    else "Recuperar somente offline; nunca repetir a chamada.",
                }.get(
                    native, "Parecer incompatível com sessão/fonte; consultar detalhe."
                ),
            )
        items.append(item)
    inputs = sum(i["input_state"] == "FROZEN" for i in items)
    opinions = len(items) - len(selection["missing"])
    return {
        "session": day,
        "items": items,
        "missing": selection["missing"],
        "inputs_ready": inputs,
        "opinions_complete": opinions,
        "summary": f"{inputs} inputs prontos; {opinions}/{len(items)} pareceres oficiais",
        "prepare_command": command,
        "radar_preflight": {
            k: preflight.get(k)
            for k in (
                "ready",
                "usd_reserved",
                "usd_estimated",
                "global_budget_used",
                "error",
            )
        },
        "gemini_pending": sorted(
            {
                i["preflight"]
                for i in items
                if i["input_state"] == "FROZEN" and i["preflight"] not in (None, "READY")
            }
        ),
        "global_pm_ready": not selection["missing"],
        "provider_calls": 0,
    }


def global_records():
    result = []
    for path in sorted(
        pm.OUTPUT.glob("v7-*/context.json"),
        key=lambda p: p.stat().st_mtime_ns,
        reverse=True,
    ):
        if not ID.fullmatch(path.parent.name):
            continue
        entry = attempt(lambda path=path: global_api.public_detail(path.parent))
        if entry["available"]:
            d = entry["data"]
            result.append(
                {
                    "id": path.parent.name,
                    **visual_state(d["status"]),
                    "mode": d["mode"],
                    "created_at": d["created_at"],
                    "expires_at": d["expires_at"],
                    "context_sha256": d["context_sha256"],
                    "cost_usd": (d["result"] or {}).get("cost_usd"),
                    "href": "/portfolio?analysis=" + path.parent.name,
                }
            )
        else:
            result.append(
                {
                    "id": path.parent.name,
                    **visual_state("INTEGRITY_ERROR"),
                    "error": entry["error"],
                }
            )
    return result


def jobs_status():
    result = []
    # ponytail: local JSON jobs are scanned on demand; archive/index if this grows
    # beyond a local laboratory. Existing runners remain the state authority.
    for path in sorted(
        forward_jobs.JOBS.root.glob("job-*.json"),
        key=lambda p: p.stat().st_mtime_ns,
        reverse=True,
    ):
        job = forward_jobs.JOBS.status(path.stem.removeprefix("job-"))["job"]
        if not job:
            continue
        native = job["state"]
        if native == "RUNNING" and job["id"] not in forward_jobs.JOBS.active:
            native = "RECOVERY_REQUIRED"
        progress = job.get("progress") or {}
        result.append(
            {
                "module": "H2",
                **forward.pick(
                    job, "id", "command", "session", "stage", "started_at", "finished_at"
                ),
                **visual_state(native),
                "native_state": job["state"],
                "error": "runner_failed_consult_local_diagnostics"
                if job.get("error")
                else None,
                "calls_reserved": progress.get("reserved"),
                "calls_recorded": progress.get("recorded"),
                "cost_usd": None,
                "href": "/paper#sala",
            }
        )
    rjob = radar_job()
    if rjob:
        outcome = rjob.get("outcome") or {}
        result.append(
            {
                "module": "Radar",
                **forward.pick(rjob, "id", "command", "started_at", "finished_at"),
                **visual_state(rjob["status"]),
                **(
                    {
                        "state": {"PARTIAL": "RECOVERY_REQUIRED"}.get(
                            outcome["state"], outcome["state"]
                        ),
                        "result_state": outcome["summary"],
                    }
                    if outcome
                    else {}
                ),
                "cost_usd": None,
                "href": "/radar",
            }
        )
    result += GLOBAL_JOBS.status()
    return sorted(result, key=lambda j: j.get("started_at", ""), reverse=True)


def overview(at=None):
    at = at or forward.fwd.now()
    wallets = attempt(forward.portfolios)
    decision = attempt(forward.decision)
    supervision = attempt(lambda: forward.supervision(clock=lambda: at))
    integrity = attempt(lambda: forward_integrity(forward.OUTPUT))
    live_radar = attempt(lambda: radar.status(global_api.OFFICIAL_RADAR))
    day = str(forward.fwd.last_closed_session(at).date())
    universe = (live_radar.get("data") or {}).get("universe") or list(radar.EXAMPLES)
    selection = attempt(lambda: radar_readiness(day, universe))
    v5 = attempt(lambda: portfolio_api.get("status", {}))
    v6 = attempt(lambda: global_api.get("status", {}))
    science = attempt(h2_api.status)
    selected = (supervision.get("data") or {}).get("selected") or {}
    current = decision.get("data") or {}
    records = global_records()
    processes = attempt(jobs_status)
    alerts = []
    for name, value in [
        ("Carteiras", wallets),
        ("Decisão H2", decision),
        ("Supervisão", supervision),
        ("Integridade H2", integrity),
        ("Radar", live_radar),
        ("Global PM", v6),
    ]:
        if not value["available"]:
            alerts.append(name + ": registro indisponível ou integridade divergente.")
    if selected.get("order_state") == "AGUARDANDO_APROVACAO":
        alerts.append("Supervisão aguarda ação humana até " + selected["deadline"] + ".")
    missing = (selection.get("data") or {}).get("missing")
    if missing:
        alerts.append(
            "Pareceres oficiais completos ausentes: " + ", ".join(missing) + "."
        )
    if (integrity.get("data") or {}).get("ok") is False:
        alerts.append("H2 sem ledger inicializado; consulta não cria carteira.")
    for job in processes.get("data") or []:
        if job["state"] in ("RUNNING", "FAILED", "RECOVERY_REQUIRED", "BLOCKED"):
            alerts.append(job["module"] + ": " + job["state"] + "; consultar processo.")
    observations = [
        w.get("mark", {}).get("session")
        for w in (wallets.get("data") or {}).get("wallets", [])
        if w.get("mark")
    ]
    inputs = sorted((forward.OUTPUT / "sessions").glob("????-??-??/input.json"))
    latest_input = forward.read(inputs[-1]) if inputs else None
    report = {
        "identity": "HFL-PLATFORM-V7",
        "observed_at": at.isoformat(),
        "read_only": True,
        "state": "BLOCKED"
        if not integrity["available"]
        else "COMPLETED"
        if current.get("status") == "DECIDED"
        else "NOT_PREPARED",
        "wallets": wallets,
        "decision": decision,
        "supervision": supervision,
        "integrity": integrity,
        "radar": live_radar,
        "official_selection": selection,
        "global_records": records,
        "synthetic_v5": v5,
        "synthetic_v6": v6,
        "jobs": processes,
        "calendar": market_api.session_clock(at),
        "last_observed_session": max(observations) if observations else None,
        "last_input_observed_at": (latest_input or {}).get("fetched_at"),
        "last_closed_session": day,
        "intraday": {
            "available": False,
            "reason": "Consulta local sem provider intradiário; verificar Mercado.",
        },
        "alerts": alerts,
        "scientific": {
            "validation": "Validation OA-1 provisória · "
            + (
                (science.get("data") or {})
                .get("phases", {})
                .get("VALIDATION", {})
                .get("provisional", "indisponível")
            ),
            "academic": ((science.get("data") or {}).get("governance") or {}).get(
                "academic", "Governança indisponível"
            ),
            "final_test": ((science.get("data") or {}).get("phases") or {}).get(
                "FINAL_TEST", "Final Test bloqueado"
            ),
            "interpretation": "Resultados descritivos, não confirmatórios",
        },
        "manual_next_steps": [
            "Consultar a decisão de 09/10; não repetir sua inferência.",
            "Revisar a supervisão antes de 13/10 às 10h BRT; não há aprovação automática.",
            "Após dados oficiais de 13/10 disponíveis, preparar e conferir reconciliação no runner original; cada nova inferência exige autorização.",
            "Conferir SMA/Bollinger e supervisionada com os mesmos inputs observados, mediante ação explícita.",
            "Autorizar comitês Radar separadamente; só depois preparar contexto Global PM dentro de sua validade de 24 h.",
        ],
        "execution_multiasset_available": False,
        "provider_calls": 0,
    }
    report["attention"] = attention(report, at)
    return report


def attention(d, at):
    """Compact "Atenção necessária": derived only from the records read above."""
    br = lambda day: "/".join(reversed(day.split("-")))  # noqa: E731
    data = lambda key: d[key].get("data") if d[key]["available"] else None  # noqa: E731
    decision, sup = data("decision"), (data("supervision") or {}).get("selected")
    readiness, cal = data("official_selection"), d["calendar"]
    observed, closed = d["last_observed_session"], d["last_closed_session"]
    items = []
    if not (data("integrity") or {}).get("ok"):
        items.append(
            (
                "blocked",
                "Integridade H2 indisponível ou divergente: investigar antes de qualquer ação.",
                "/#audit",
            )
        )
    for job in (d["jobs"].get("data") or []) if d["jobs"]["available"] else []:
        if job["state"] in ("RUNNING", "FAILED", "RECOVERY_REQUIRED", "BLOCKED"):
            items.append(
                (
                    "blocked",
                    f"{job['module']} · {job.get('command')}: {job['state']}; consultar o registro, sem nova chamada.",
                    job["href"],
                )
            )
    pending = sup and sup.get("order_state") == "AGUARDANDO_APROVACAO"
    if pending:
        items.append(
            (
                "action",
                "Aprovar ou rejeitar a supervisionada até "
                + br(sup["deadline"][:10])
                + " "
                + sup["deadline"][11:16]
                + " BRT.",
                "/paper#supervisao",
            )
        )
    if observed and observed < closed:
        items.append(
            (
                "action",
                f"Preparar o fechamento oficial de {br(closed)} no runner original (grava; sem inferência).",
                "/paper#sala",
            )
        )
    target = (decision or {}).get("target_session")
    if target and cal.get("next_session") and target >= cal["next_session"]:
        items.append(
            (
                "info",
                f"Após o COTAHIST de {br(target)}: preparar o novo fechamento e conferir a reconciliação da intenção.",
                "/paper#sala",
            )
        )
    if readiness and readiness["missing"]:
        blocked = [
            i["ticker"]
            for i in readiness["items"]
            if i["state"] in ("INPUT_BLOCKED", "INTEGRITY_ERROR", "RECOVERY_REQUIRED")
        ]
        items.append(
            (
                "lab",
                f"Radar oficial: {readiness['summary']}"
                + (f"; bloqueados: {', '.join(blocked)}" if blocked else "")
                + ". Global PM aguarda os pareceres de todos.",
                "/radar",
            )
        )
    for record in d["global_records"]:
        if record["state"] in ("PREPARED", "READY") and b.instant(
            record["expires_at"]
        ) < b.instant(at.isoformat()):
            items.append(
                (
                    "info",
                    f"Contexto Global {record['id'][:11]}… expirou; preparar outro ID quando for usar.",
                    record["href"],
                )
            )
    rank = {"blocked": 0, "action": 1, "info": 2, "lab": 3}
    items.sort(key=lambda x: rank[x[0]])
    return {
        "next_action": items[0][1] if items else "Nenhuma ação pendente nos registros.",
        "level": items[0][0] if items else "ok",
        "items": [{"level": a, "text": b, "href": c} for a, b, c in items],
        "decision": None
        if not decision
        else {
            "label": f"{(decision.get('portfolio') or {}).get('decision') or decision['status']} {decision.get('ticker', 'PETR4').removesuffix('.SA')}",
            "session": decision["session"],
            "target_session": target,
            "status": decision["status"],
            "votes": "{}/{}".format(
                (decision.get("committee") or {}).get("responded", "N/D"),
                (decision.get("committee") or {}).get("analyst_count", "N/D"),
            ),
            "order": (decision.get("order") or {}).get("label"),
        },
        "approval": None
        if not sup
        else {
            "state": sup["order_state"],
            "deadline": sup.get("deadline"),
            "pending": bool(pending),
        },
        "next_session": {
            "day": cal.get("next_session"),
            "expected_open": cal.get("expected_open"),
        },
        "data": {
            "last_observed_session": observed,
            "last_closed_session": closed,
            "current": bool(observed) and observed >= closed,
            "radar_eligible": None
            if not readiness
            else len(readiness["items"]) - len(readiness["missing"]),
            "radar_selected": None if not readiness else len(readiness["items"]),
        },
    }


def public_global(value):
    root = analysis_root(value)
    d = global_api.public_detail(root)
    if d["status"] == "NO_PROPOSAL":
        return {"id": value, **d, **visual_state(d["status"])}
    return {
        "id": value,
        **d,
        **visual_state(d["status"]),
        "model": pm.CONFIG["model"],
        "classification": "DEMONSTRAÇÃO SINTÉTICA"
        if d["mode"] == "SYNTHETIC_DEMO"
        else "CONSULTIVO COM GEMINI",
        "planner": (d["result"] or {}).get("planner"),
        "execution_enabled": False,
    }


class GlobalJobs:
    def __init__(self, root=OPERATIONS):
        self.root = root
        self.active = set()
        self.mutex = threading.Lock()

    def status(self):
        result = []
        for path in sorted(
            self.root.glob("v7-*.json"), key=lambda p: p.stat().st_mtime_ns, reverse=True
        ):
            job = b.check_seal(b.read(path))
            native = job["state"]
            if native == "RUNNING" and job["job_id"] not in self.active:
                native = "RECOVERY_REQUIRED"
            result.append(
                {
                    **forward.pick(
                        job,
                        "module",
                        "job_id",
                        "id",
                        "command",
                        "started_at",
                        "finished_at",
                        "result_state",
                        "cost_usd",
                    ),
                    **visual_state(native),
                    "native_state": job["state"],
                    "error": "global_operation_failed_consult_record_no_automatic_retry"
                    if job.get("error")
                    else None,
                    "href": "/portfolio?analysis=" + job["id"],
                }
            )
        return result

    def start(self, command, payload):
        if (
            command not in FIELDS
            or not isinstance(payload, dict)
            or set(payload) != FIELDS[command]
        ):
            raise ValueError("invalid_payload")
        root = analysis_root(payload["id"])
        if command == "prepare":
            if (
                payload["confirm_hypothetical"] is not True
                or payload["ack_fixture_policy"] is not True
            ):
                raise ValueError("explicit_hypothetical_and_fixture_ack_required")
            source_root(payload["mode"])
            radar.session(payload["session"])
            radar.tickers(payload["tickers"], empty=False)
            if not isinstance(payload["capital"], str) or not 0 < b.amount(
                payload["capital"], positive=True
            ) <= b.dec("1000000000"):
                raise ValueError("invalid_hypothetical_capital")
            if root.exists():
                raise forward_jobs.Conflict("analysis_already_prepared_no_overwrite")
            # Eligibility is checked together, not merely one ticker at a time.
            pm.load_opinions(
                source_root(payload["mode"]),
                payload["tickers"],
                payload["session"],
                payload["mode"],
                pm.now(),
            )
        elif payload["confirm"] is not True:
            raise ValueError("explicit_confirmation_required")
        elif command == "run":
            if type(payload["authorize_paid"]) is not bool or not isinstance(
                payload["max_usd"], str
            ):
                raise ValueError("invalid_payload")
            report = cli.preflight(root, payload["max_usd"])
            if (
                not report["ready"]
                or payload["confirmation_token"] != report["confirmation_token"]
            ):
                raise ValueError("preflight_or_confirmation_changed")
            if report["paid"] and (
                payload["authorize_paid"] is not True
                or not os.environ.get("GEMINI_API_KEY", "").strip()
            ):
                raise ValueError("new_explicit_paid_authorization_and_key_required")
            if not report["paid"] and payload["authorize_paid"]:
                raise ValueError("synthetic_is_not_paid_inference")
        else:
            cli.context_for(root)
            if (
                not (root / "claim.json").exists()
                or not (root / "private/calls.sqlite").exists()
            ):
                raise ValueError("missing_claim_journal")
        job_id = payload["id"] + "-" + command
        path = self.root / (job_id + ".json")
        with self.mutex:
            if self.active or path.exists():
                raise forward_jobs.Conflict("global_job_exists_or_busy_consult_recovery")
            job = {
                "module": "Global PM",
                "job_id": job_id,
                "id": payload["id"],
                "command": command,
                "state": "RUNNING",
                "started_at": pm.now(),
                "cost_usd": None,
            }
            b.write(path, b.sealed(job), immutable=True)
            self.active.add(job_id)
            try:
                threading.Thread(
                    target=self._work,
                    args=(command, dict(payload), job, path),
                    daemon=True,
                ).start()
            except RuntimeError as exc:
                self.active.discard(job_id)
                job.update(
                    state="FAILED",
                    error="global_worker_start_failed",
                    finished_at=pm.now(),
                )
                b.write(path, b.sealed(job))
                raise OSError("global_worker_start_failed") from exc
        return {**job, "execution_enabled": False}

    def _work(self, command, payload, job, path):
        try:
            root = analysis_root(payload["id"])
            if command == "prepare":
                at = pm.now()
                opinions, histories = pm.load_opinions(
                    source_root(payload["mode"]),
                    payload["tickers"],
                    payload["session"],
                    payload["mode"],
                    at,
                )
                snapshot = pm.make_snapshot(
                    payload["id"],
                    payload["mode"],
                    payload["session"],
                    {
                        t: str(b.money(o["raw_close"]))
                        if payload["mode"] == "SYNTHETIC_DEMO"
                        else o["raw_close"]
                        for t, o in opinions.items()
                    },
                    cash=payload["capital"],
                    at=at,
                )
                cli.prepare(
                    root, snapshot, opinions, histories, at=at, ack_fixture_policy=True
                )
            else:
                # Fake E is the existing all-cash proposal, valid for any observed
                # fixture prices; the original A fixture has fixed share counts.
                cli.run(
                    root,
                    payload.get("confirmation_token"),
                    payload.get("max_usd", "0.25"),
                    authorize_paid=payload.get("authorize_paid", False),
                    replay=command == "replay",
                    fake_case="E",
                )
            data = cli.detail(root)
            state = (
                "COMPLETED"
                if command == "prepare"
                else visual_state(data["status"])["state"]
            )
            job.update(
                state=state,
                result_state=data["status"],
                cost_usd=(data["result"] or {}).get("cost_usd"),
            )
        except Exception:
            # No provider exception, credential, raw envelope or prompt is public.
            root = analysis_root(payload["id"])
            job.update(
                state="RECOVERY_REQUIRED" if (root / "claim.json").exists() else "FAILED",
                error="global_operation_failed_consult_record_no_automatic_retry",
            )
        finally:
            job["finished_at"] = pm.now()
            try:
                b.write(path, b.sealed(job))
            finally:
                with self.mutex:
                    self.active.discard(job["job_id"])


GLOBAL_JOBS = GlobalJobs()


def get(command, query):
    if command in ("overview", "readiness") and not query:
        return overview()
    if command == "jobs" and not query:
        return {
            "jobs": jobs_status(),
            "global_records": global_records(),
            "read_only": True,
        }
    if command == "global" and set(query) == {"id"}:
        return public_global(query["id"])
    if command == "global-preflight" and set(query) == {"id", "max_usd"}:
        report = cli.preflight(analysis_root(query["id"]), query["max_usd"])
        return {
            **report,
            **visual_state(
                "READY_FOR_INFERENCE"
                if report["ready"]
                else "PROPOSAL_EXPIRED"
                if "context_expired_or_future" in report["errors"]
                else "BLOCKED"
            ),
        }
    if command == "radar-view" and set(query) == {"mode"}:
        mutable = (
            query["mode"] == "CONSULTATIVE_SANDBOX"
            and radar_api.ROOT.resolve() == global_api.OFFICIAL_RADAR.resolve()
        )
        return {
            **radar.status(source_root(query["mode"])),
            "mode_view": query["mode"],
            "job": radar_job() if mutable else None,
            # False in a server started without network_scope.install(): an offline
            # check there can block (or stay installed against) the paid worker.
            "network_isolation": getattr(socket.create_connection, "_hfl_scoped", False),
            "csrf_token": forward_jobs.JOBS.csrf,
            "read_only": True,
            "mutation_available": mutable,
        }
    if command == "radar-readiness" and set(query) == {"session", "tickers"}:
        return radar_readiness(query["session"], query["tickers"].split(","))
    if command == "radar-detail" and set(query) == {"mode", "ticker", "session"}:
        return radar.detail(query["ticker"], query["session"], source_root(query["mode"]))
    raise ValueError("invalid_platform_query")
