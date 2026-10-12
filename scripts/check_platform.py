"""Read-only readiness diagnostic: stdout only, no downloads, inference or writes.

Default output is a sectioned summary; ``--json`` prints the full overview.
Exit code 2 when H2 integrity cannot be verified.
"""

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "dashboard"), str(ROOT / "scripts"), str(ROOT)]
import platform_api  # noqa: E402

from src.experiments.h2_evaluation_offline import no_network  # noqa: E402

UNAVAILABLE = "INDISPONÍVEL (registro ausente ou integridade divergente)"


def summary(d):
    """Sections requested for the operator; every line comes from ``overview``."""
    data = lambda key: d[key]["data"] if d[key]["available"] else None  # noqa: E731
    lines = [f"HFL · diagnóstico somente leitura · {d['observed_at']}"]

    def section(title, rows):
        lines.append("")
        lines.append(f"[{title}]")
        lines.extend("  " + row for row in rows)

    decision = data("decision")
    section(
        "H2 original",
        [
            f"decisão {decision['status']} · sessão {decision['session']} · "
            f"alvo {decision.get('target_session')} · gerada {decision.get('generated_at')}",
            f"ordem: {(decision.get('order') or {}).get('detail', 'N/D')}",
            "decisão existente: não repetir a inferência desta sessão.",
        ]
        if decision
        else [
            "nenhuma decisão disponível" if d["decision"]["available"] else UNAVAILABLE
        ],
    )
    sup = (data("supervision") or {}).get("selected")
    audit = (data("supervision") or {}).get("audit") or {}
    section(
        "Supervisão",
        [
            f"estado {sup['order_state']} · prazo {sup.get('deadline')} · "
            f"aprovação {'registrada' if sup.get('approval') else 'nenhuma'}",
            f"auditoria {'íntegra' if audit.get('ok') else 'NÃO VERIFICADA'} · "
            f"{audit.get('events', 'N/D')} eventos",
        ]
        if sup
        else [
            "sem proposta selecionada" if d["supervision"]["available"] else UNAVAILABLE
        ],
    )
    wallets = (data("wallets") or {}).get("wallets", [])
    section(
        "Carteiras e benchmarks",
        [
            f"{w['label']}: patrimônio {w.get('equity')} · caixa {w.get('cash')} · "
            f"posições {', '.join(f'{p['asset']} {p['units']}' for p in w.get('composition', []) if p.get('units')) or 'nenhuma'} · "
            f"marca {(w.get('mark') or {}).get('session')} · "
            f"ordem {('para ' + w['pending']['target_session']) if w.get('pending') else 'nenhuma'}"
            + ("" if w.get("comparable") is not False else " · NÃO COMPARÁVEL")
            if w.get("available")
            else f"{w.get('label', w.get('key'))}: indisponível"
            for w in wallets
        ]
        or [UNAVAILABLE],
    )
    readiness = data("official_selection")
    section(
        f"Radar oficial · sessão {d['last_closed_session']}",
        [f"{i['ticker']}: {i['state']} · {i['action']}" for i in readiness["items"]]
        if readiness
        else [UNAVAILABLE],
    )
    records = d["global_records"]
    section(
        "Global PM",
        [
            "pareceres oficiais completos: "
            + (
                "todos presentes"
                if readiness and not readiness["missing"]
                else "ausentes " + ", ".join(readiness["missing"])
                if readiness
                else "N/D"
            )
            + " · contexto oficial só deve ser preparado perto do uso (validade 24 h)."
        ]
        + [
            f"{r['id']} · {r.get('mode')} · {r['native_state']} · expira {r.get('expires_at')}"
            for r in records
        ],
    )
    cal = d["calendar"]
    section(
        "Mercado",
        [
            f"última sessão observada {d['last_observed_session']} · último fechamento "
            f"do calendário {d['last_closed_session']} · coleta {d['last_input_observed_at']}",
            f"próxima sessão {cal.get('next_session')} · abertura prevista "
            f"{cal.get('expected_open')} (previsão de calendário, não confirma leilão)",
            "cotação intradiária indisponível nesta consulta.",
        ],
    )
    jobs = [
        j
        for j in (data("jobs") or [])
        if j["state"] in ("RUNNING", "FAILED", "RECOVERY_REQUIRED", "BLOCKED")
    ]
    section(
        "Jobs incompletos, incertos ou bloqueados",
        [
            f"{j['module']} · {j.get('command')} · {j['native_state']} → {j['state']}"
            for j in jobs
        ]
        or (["nenhum"] if d["jobs"]["available"] else [UNAVAILABLE]),
    )
    integrity = data("integrity") or {}
    section(
        "Integridade",
        [
            f"H2: {'íntegra' if integrity.get('ok') else 'NÃO VERIFICADA'} · "
            f"{integrity.get('decisions', 'N/D')} decisão(ões) · manifesto {integrity.get('manifest_sha256')}",
            f"V5 demo: {'íntegra' if ((data('synthetic_v5') or {}).get('integrity') or {}).get('ok') else 'indisponível'}",
        ],
    )
    attention = d["attention"]
    section(
        "Ações manuais pendentes",
        [f"PRÓXIMA: {attention['next_action']}"]
        + [f"{i['level']}: {i['text']}" for i in attention["items"][1:]],
    )
    lines.append("")
    lines.append(
        "Nada foi baixado, gravado, aprovado, inferido ou reconciliado por este diagnóstico."
    )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="full overview JSON")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    with no_network():
        report = platform_api.overview()
    print(
        json.dumps(report, ensure_ascii=False, indent=2, default=str)
        if args.json
        else summary(report)
    )
    if not report["integrity"]["available"] or not (
        report["integrity"].get("data") or {}
    ).get("ok"):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
