"""Wallet sizing → durable fake inference → preview → atomic paper approval."""

import json
import os
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import pytest

PROJECT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(PROJECT / "dashboard"), str(PROJECT / "scripts"), str(PROJECT)]
import wallet_manager_api as m  # noqa: E402


@pytest.fixture
def lab(tmp_path, monkeypatch):
    a = m.analysis
    monkeypatch.setattr(m.manual, "ROOT", tmp_path / "personal")
    monkeypatch.setattr(m.runs, "RADAR_DIR", tmp_path / "radar")
    monkeypatch.setattr(m.runs, "REGISTRY", tmp_path / "radar/registry.json")
    monkeypatch.setattr(a.radar_api, "ROOT", tmp_path / "radar/old")
    monkeypatch.setattr(a.radar_api, "ACTIVE", False)
    monkeypatch.setattr(m.radar, "now", lambda: pd.Timestamp("2026-10-15T10:00:00-03:00"))
    monkeypatch.setattr(m, "used_budget", lambda: m.b.ZERO)
    monkeypatch.setattr(m.network_scope, "qualified", lambda: True)
    monkeypatch.setenv("GEMINI_API_KEY", "OFFLINE_TEST_NO_SECRET")
    m.runs.register(
        "radar-old", "data/radar/old", "2026-10-13", list(m.radar.EXAMPLES), select=True
    )
    a.radar_api.ROOT.mkdir()
    wallet = m.manual.post(
        "confirm",
        {
            "request": {
                "kind": "CREATE",
                "name": "Multiagentes",
                "nature": "SIMULATION",
                "capital": "1000.00",
                "start_date": "2026-10-14",
            },
            "command_id": "wallet",
            "preview_token": None,
            "confirm": True,
        },
    )["wallet"]
    request = {
        "kind": "TRADE",
        "wallet": wallet["id"],
        "trade": {
            "ticker": "VALE3",
            "side": "BUY",
            "quantity": "10",
            "price": "60.00",
            "costs": "0.00",
            "economic_date": "2026-10-14",
        },
    }
    p = m.manual.post("preview", {"request": request})
    wallet = m.manual.post(
        "confirm",
        {
            "request": request,
            "command_id": "initial",
            "preview_token": p["preview_token"],
            "confirm": True,
        },
    )["wallet"]
    request = {
        "command_id": "c" * 32,
        "wallet": wallet["id"],
        "wallet_revision": wallet["revision"],
        "target_date": "2026-10-16",
        "reference_session": "2026-10-14",
        "tickers": ["PETR4", "VALE3"],
        "confirm": True,
    }
    run = a.create(request)["run"]
    prices = {"PETR4": "40.00", "VALE3": "60.00"}
    refs = {
        t: {"input": "frozen-raw", "result": "verified-quorum", "opinion": t}
        for t in prices
    }
    opinions = {
        t: {
            "recommendation": "VENDA" if t == "VALE3" else "COMPRA",
            "risk_verdict": "APROVADO",
            "confidence": 0.7,
        }
        for t in prices
    }
    monkeypatch.setattr(m, "sources", lambda *args: (prices, refs, opinions))
    payload = {"run": run, "proposal": "a" * 32, "cost_rate_pct": "0.10"}
    c = m.prepare(payload)["context"]
    raw = {
        "summary": "Reduzir VALE3 parcialmente e aumentar PETR4, preservando caixa.",
        "actions": [
            {
                "ticker": "VALE3",
                "side": "SELL",
                "quantity": "4",
                "reasoning": "Reduzir posição, sem liquidar.",
            },
            {
                "ticker": "PETR4",
                "side": "BUY",
                "quantity": "10",
                "reasoning": "Compra coordenada com caixa disponível.",
            },
        ],
        "risks": ["Preços são referências históricas, sem risco global qualificado."],
    }
    return c, raw


def seed(monkeypatch, rows):
    """Fake DP-27 base: {(ticker, session): (open, close)}; unlisted = not in the base."""

    def merged(ticker, as_of=None):
        return [
            {"date": d, "open": o, "close": cl, "conflict": False}
            for (t, d), (o, cl) in sorted(rows.items())
            if t == ticker and d <= as_of
        ]

    monkeypatch.setattr(m.orders.base, "merged", merged)


def approve(c, date="2026-10-15"):
    p = {"run": c["run"], "proposal": c["proposal"], "economic_date": date}
    preview = m.post("preview", p)
    return m.post(
        "apply", {**p, "preview_token": preview["preview_token"], "confirm": True}
    )


def result(c, raw):
    root = m.folder(c["run"], c["proposal"])
    value = m.b.sealed(
        {
            "identity": m.IDENTITY,
            "context_sha256": c["sha256"],
            "completed_at": m.radar.now().isoformat(),
            "status": "VALID_PROPOSAL",
            **m.compile_proposal(c, raw),
        }
    )
    m.radar.write(root / "result.json", value, immutable=True)
    return value


def test_partial_sale_quantities_costs_raw_and_weights(lab):
    c, raw = lab
    p = m.compile_proposal(c, raw)
    vale = next(r for r in p["rows"] if r["ticker"] == "VALE3")
    assert (vale["quantity_before"], vale["quantity"], vale["quantity_after"]) == (
        "10",
        "4",
        "6",
    )
    assert p["cash_after"] == "239.36"
    assert p["total_costs"] == "0.64"
    assert sum(m.b.dec(r["value_after"]) for r in p["rows"]) + m.b.dec(
        p["cash_after"]
    ) == m.b.dec(p["equity_after"])
    prompt = json.loads(m.prompt_input(c))
    assert prompt["wallet"]["positions"][0]["quantity"] == "10"
    assert prompt["target_date"] == "2026-10-16" and prompt["prices"]["VALE3"] == "60.00"


@pytest.mark.parametrize(
    "change,error",
    [
        ("short", "insufficient_units"),
        ("cash", "insufficient_cash"),
        ("veto", "incompatible_with_opinion"),
        ("duplicate", "unique_universe"),
        ("fraction", "número válido"),
        ("hold", "hold_quantity"),
    ],
)
def test_invalid_quantities_signals_and_cash(lab, change, error):
    c, raw = lab
    if change == "short":
        raw["actions"][0]["quantity"] = "11"
    elif change == "cash":
        raw["actions"][1]["quantity"] = "100"
    elif change == "veto":
        c["opinions"]["PETR4"]["risk_verdict"] = "VETADO"
    elif change == "duplicate":
        raw["actions"][1]["ticker"] = "VALE3"
    elif change == "fraction":
        raw["actions"][0]["quantity"] = "0.5"
    else:
        raw["actions"][0]["side"] = "HOLD"
    with pytest.raises(ValueError, match=error):
        m.compile_proposal(c, raw)


def test_exit_and_all_hold_are_supported(lab):
    c, raw = lab
    raw["actions"][0]["quantity"] = "10"
    assert (
        next(r for r in m.compile_proposal(c, raw)["rows"] if r["ticker"] == "VALE3")[
            "quantity_after"
        ]
        == "0"
    )
    for a in raw["actions"]:
        a.update(side="HOLD", quantity="0")
    assert m.compile_proposal(c, raw)["trades"] == []


def test_preview_atomic_confirmation_retry_history_and_correction(lab, monkeypatch):
    c, raw = lab
    r = result(c, raw)
    before = m.manual.path().read_bytes()
    p = {"run": c["run"], "proposal": c["proposal"], "economic_date": "2026-10-15"}
    preview = m.post("preview", p)
    assert m.manual.path().read_bytes() == before
    assert preview["after"]["cash"] == "239.36"
    assert preview["schedule"]["leg"] == "CLOSE" and preview["schedule"]["valid"]
    payload = {**p, "preview_token": preview["preview_token"], "confirm": True}
    order = m.post("apply", payload)["order"]
    assert (order["session"], order["leg"]) == ("2026-10-15", "CLOSE")
    # DP-33: approving only stores the order; cash and positions do not move yet.
    assert m.manual.get({"wallet": c["wallet"]["id"]})["selected"]["cash"] == "400.00"
    assert m.post("apply", payload)["replayed"]
    assert m.get({"run": c["run"]})["history"][0]["status"] == "PENDING_AUCTION"
    seed(
        monkeypatch,
        {("VALE3", "2026-10-15"): (59, 60.0), ("PETR4", "2026-10-15"): (41, 40.0)},
    )
    assert m.orders.settle_pending()["settled"] == [c["proposal"]]
    d = {"wallet": m.manual.get({"wallet": c["wallet"]["id"]})["selected"]}
    assert d["wallet"]["cash"] == "239.36"
    assert len(d["wallet"]["trades"]) == 3
    assert all(
        t["source"]["proposal_sha256"] == r["sha256"] for t in d["wallet"]["trades"][-2:]
    )
    assert m.get({"run": c["run"]})["history"][0]["status"] == "EXECUTED"
    # Individual operations retain existing correction IDs and append-only originals.
    sale = d["wallet"]["trades"][1]
    correction = {
        "kind": "CORRECTION",
        "wallet": c["wallet"]["id"],
        "target": sale["id"],
        "reason": "Conferência da simulação",
        "trade": {
            k: sale[k]
            for k in ("ticker", "side", "quantity", "price", "costs", "economic_date")
        },
    }
    preview = m.manual.post("preview", {"request": correction})
    corrected = m.manual.post(
        "confirm",
        {
            "request": correction,
            "command_id": "correct",
            "preview_token": preview["preview_token"],
            "confirm": True,
        },
    )
    assert len(corrected["wallet"]["audit"]) == 4
    assert corrected["wallet"]["audit"][1]["source"]["proposal_sha256"] == r["sha256"]


def test_atomic_batch_rollback_on_second_insert(lab, monkeypatch):
    c, raw = lab
    result(c, raw)
    approve(c)
    seed(
        monkeypatch,
        {("VALE3", "2026-10-15"): (59, 60.0), ("PETR4", "2026-10-15"): (41, 40.0)},
    )
    original = m.manual.append
    calls = []

    def failing(*args, **kwargs):
        calls.append(1)
        if len(calls) == 2:
            raise OSError("simulated disk failure")
        return original(*args, **kwargs)

    monkeypatch.setattr(m.manual, "append", failing)
    out = m.orders.settle_pending()  # never raises: the order just stays pending
    assert out["settled"] == [] and "disk failure" in out["errors"][0]["error"]
    current = m.manual.get({"wallet": c["wallet"]["id"]})["selected"]
    assert current["revision"] == c["wallet"]["revision"]
    assert len(current["trades"]) == 1
    assert m.status(c["run"], c["proposal"])["status"] == "PENDING_AUCTION"
    monkeypatch.setattr(m.manual, "append", original)
    assert m.orders.settle_pending()["settled"] == [c["proposal"]]
    assert m.orders.settle_pending()["settled"] == []  # idempotent


def test_stale_wallet_blocks_preflight_and_application(lab):
    c, raw = lab
    result(c, raw)
    request = {
        "kind": "TRADE",
        "wallet": c["wallet"]["id"],
        "trade": {
            "ticker": "VALE3",
            "side": "SELL",
            "quantity": "1",
            "price": "60.00",
            "costs": "0",
            "economic_date": "2026-10-15",
        },
    }
    p = m.manual.post("preview", {"request": request})
    m.manual.post(
        "confirm",
        {
            "request": request,
            "command_id": "changed",
            "preview_token": p["preview_token"],
            "confirm": True,
        },
    )
    with pytest.raises(ValueError, match="wallet_changed"):
        m.post(
            "preflight", {"run": c["run"], "proposal": c["proposal"], "max_usd": "0.25"}
        )
    with pytest.raises(ValueError, match="carteira mudou"):
        m.post(
            "preview",
            {"run": c["run"], "proposal": c["proposal"], "economic_date": "2026-10-15"},
        )


def test_explicit_paid_and_financial_consent(lab):
    c, raw = lab
    root = m.folder(c["run"], c["proposal"])
    p = m.post(
        "preflight", {"run": c["run"], "proposal": c["proposal"], "max_usd": "0.25"}
    )
    assert p["ready"] and p["estimate"]["calls_max"] == 1
    with pytest.raises(ValueError, match="paid_consent"):
        m.post(
            "run",
            {
                "run": c["run"],
                "proposal": c["proposal"],
                "max_usd": "0.25",
                "confirmation_token": p["confirmation_token"],
                "authorize_paid": False,
            },
        )
    assert not (root / "authorization.json").exists()
    result(c, raw)
    with pytest.raises(ValueError, match="financial_consent"):
        m.post(
            "apply",
            {
                "run": c["run"],
                "proposal": c["proposal"],
                "economic_date": "2026-10-15",
                "preview_token": "no",
                "confirm": False,
            },
        )


def test_concurrent_confirmation_registers_one_cesta(lab):
    c, raw = lab
    result(c, raw)
    request = {"run": c["run"], "proposal": c["proposal"], "economic_date": "2026-10-15"}
    preview = m.post("preview", request)
    request.update(preview_token=preview["preview_token"], confirm=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: m.post("apply", request), range(2)))
    assert sorted(d["replayed"] for d in responses) == [False, True]
    assert len(m.manual.get({"wallet": c["wallet"]["id"]})["selected"]["trades"]) == 1


@pytest.mark.parametrize(
    "nature,strategy,error",
    [("EXTERNAL", None, "simulada"), ("SIMULATION", "BUY_HOLD", "rebalanceamento")],
)
def test_external_and_buy_hold_refuse_automatic_simulated_basket(
    lab, nature, strategy, error
):
    c, _ = lab
    request = {
        "kind": "CREATE",
        "name": nature,
        "nature": nature,
        "capital": "1000.00",
        "start_date": "2026-10-14",
    }
    if strategy:
        request.update(
            strategy=strategy,
            comparison_group="test",
            initialization_note="Isolated test",
        )
    w = m.manual.post(
        "confirm",
        {
            "request": request,
            "command_id": nature,
            "preview_token": None,
            "confirm": True,
        },
    )["wallet"]
    trade = {
        "kind": "TRADE",
        "wallet": w["id"],
        "trade": {
            "ticker": "PETR4",
            "side": "BUY",
            "quantity": "1",
            "price": "40.00",
            "costs": "0",
            "economic_date": "2026-10-15",
        },
    }
    with pytest.raises(ValueError, match=error):
        m.manual.batch(w["id"], w["revision"], [trade], {"proposal_sha256": c["sha256"]})


def test_changed_source_and_budget_require_new_review(lab, monkeypatch):
    c, raw = lab
    root = m.folder(c["run"], c["proposal"])
    payload = {"run": c["run"], "proposal": c["proposal"], "max_usd": "0.25"}
    report = m.post("preflight", payload)
    monkeypatch.setattr(m, "used_budget", lambda: m.b.dec("0.01"))
    with pytest.raises(ValueError, match="preflight_required"):
        m.post(
            "run",
            {
                **payload,
                "confirmation_token": report["confirmation_token"],
                "authorize_paid": True,
            },
        )
    assert not (root / "authorization.json").exists()
    result(c, raw)
    prices, refs, opinions = m.sources(None, None)
    monkeypatch.setattr(
        m, "sources", lambda *args: ({**prices, "PETR4": "41.00"}, refs, opinions)
    )
    with pytest.raises(ValueError, match="sources_changed"):
        m.post(
            "preview",
            {"run": c["run"], "proposal": c["proposal"], "economic_date": "2026-10-15"},
        )


def test_durable_fake_native_call_offline_replay(lab):
    c, raw = lab
    root = m.folder(c["run"], c["proposal"])
    m.radar.write(
        root / "authorization.json",
        m.b.sealed(
            {
                "identity": m.IDENTITY,
                "context_sha256": c["sha256"],
                "usd_reserved": "0.16",
            }
        ),
        immutable=True,
    )
    calls = []

    def transport(*args):
        calls.append(1)
        return m.global_cli.v1cli.fake_response(raw)

    value = m.generate(root, transport=transport)
    assert value["rows"][0]["quantity_after"] == "6"
    assert len(calls) == 1
    # Lost result can be rebuilt entirely from the durable response, no transport.
    (root / "result.json").unlink()
    replayed = m.generate(
        root, replay=True, transport=lambda *args: pytest.fail("replay used network")
    )
    assert replayed == value
    assert len(calls) == 1


def test_history_survives_contract_change_but_cannot_apply(lab, monkeypatch):
    c, raw = lab
    result(c, raw)
    monkeypatch.setattr(m, "contracts", lambda: {"version": "new"})
    item = m.get({"run": c["run"]})["history"][0]
    assert item["result"]["response"] == raw and not item["compatible"]
    with pytest.raises(ValueError, match="contract_changed"):
        m.post(
            "preview",
            {"run": c["run"], "proposal": c["proposal"], "economic_date": "2026-10-15"},
        )


def test_rejected_response_and_each_recovery_failure_are_preserved(lab):
    c, raw = lab
    raw["actions"][0]["quantity"] = "11"
    root = m.folder(c["run"], c["proposal"])
    m.radar.write(
        root / "authorization.json",
        m.b.sealed(
            {
                "identity": m.IDENTITY,
                "context_sha256": c["sha256"],
                "usd_reserved": "0.16",
            }
        ),
        immutable=True,
    )
    calls = []

    def transport(*args):
        calls.append(1)
        return m.global_cli.v1cli.fake_response(raw)

    with pytest.raises(ValueError, match="insufficient_units"):
        m.generate(root, transport=transport)
    with pytest.raises(ValueError, match="insufficient_units"):
        m.generate(
            root,
            replay=True,
            transport=lambda *args: pytest.fail("recovery made another call"),
        )
    item = m.status(c["run"], c["proposal"])
    assert len(item["failures"]) == 2 and item["result"] is None
    assert len(calls) == 1
    assert len(m.manual.get({"wallet": c["wallet"]["id"]})["selected"]["trades"]) == 1


def test_expired_proposal_remains_readable_but_cannot_record(lab, monkeypatch):
    c, raw = lab
    result(c, raw)
    # Friday 16:50 = past the last cutoff of the target session (2026-10-16).
    monkeypatch.setattr(m.radar, "now", lambda: pd.Timestamp("2026-10-16T16:50:00-03:00"))
    s = m.status(c["run"], c["proposal"])
    assert s["result"]["status"] == "VALID_PROPOSAL" and s["status"] == "EXPIRED"
    root = m.folder(c["run"], c["proposal"])
    with pytest.raises(ValueError, match="proposal_expired"):
        m.post(
            "apply",
            {
                "run": c["run"],
                "proposal": c["proposal"],
                "economic_date": "2026-10-16",
                "preview_token": "x",
                "confirm": True,
            },
        )
    assert not (root / "order.json").exists()
    record = m.orders.read(root / "expired.json")
    assert record["decision_prices"] == {"VALE3": "60.00", "PETR4": "40.00"}
    # settle computes the opportunity-cost inputs once the target close is official
    seed(
        monkeypatch,
        {("VALE3", "2026-10-16"): (59, 62.0), ("PETR4", "2026-10-16"): (41, 39.0)},
    )
    m.orders.settle_pending()
    items = {i["ticker"]: i for i in m.orders.read(root / "opportunity.json")["items"]}
    assert items["VALE3"]["official_close"] == "62.00"
    assert items["VALE3"]["move_vs_decision"] == "-8.00"  # sold 4 below the later close
    assert items["PETR4"]["move_vs_decision"] == "-10.00"
    assert m.latest({"wallet": c["wallet"]["id"]})["latest"]["status"] == "EXPIRED"
    assert m.wallet_current(c)["cash"] == "400.00"


def test_actual_source_guard_refuses_incomplete_quorum(lab, monkeypatch):
    c, _ = lab
    # Exercise the real source boundary, not the fixture's deterministic source.
    import importlib.util

    spec = importlib.util.spec_from_file_location("manager_source_guard", m.__file__)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(
        m.runs, "committee_outcome", lambda *args: {"state": "FAILED_REPLAY_ONLY"}
    )
    with pytest.raises(ValueError, match="incomplete_quorum"):
        module.sources(m.runs.run(c["run"]), c["wallet"])


def test_browser_end_to_end_when_requested(lab, monkeypatch, tmp_path):
    if not os.environ.get("HFL_MANAGER_BROWSER"):
        pytest.skip("Set HFL_MANAGER_BROWSER=1 for real Chrome + HTTP + isolated SQLite")
    import server

    c, raw = lab
    generate = m.generate
    calls = []

    def fake_provider(*args):
        calls.append(1)
        return m.global_cli.v1cli.fake_response(raw)

    monkeypatch.setattr(
        m,
        "generate",
        lambda root, **kwargs: generate(root, transport=fake_provider, **kwargs),
    )
    with server.ReusableTCPServer(("127.0.0.1", 0), server.Handler) as httpd:
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        try:
            subprocess.run(
                [
                    "node",
                    "tests/wallet_manager_browser_check.mjs",
                    f"http://127.0.0.1:{httpd.server_address[1]}",
                    c["run"],
                    c["wallet"]["id"],
                    str(tmp_path / "screenshots"),
                ],
                cwd=PROJECT,
                check=True,
                timeout=120,
            )
        finally:
            httpd.shutdown()
            worker.join()
    wallet = m.manual.get({"wallet": c["wallet"]["id"]})["selected"]
    assert wallet["cash"] == "400.00" and len(wallet["trades"]) == 1  # order pending
    assert len(calls) == 1


def test_latest_proposal_for_wallet(lab):
    c, raw = lab
    wallet = c["wallet"]["id"]
    assert m.latest({"wallet": "f" * 32})["latest"] is None
    assert m.latest({"wallet": wallet})["latest"]["status"] == "PREPARED"
    result(c, raw)
    got = m.latest({"wallet": wallet})["latest"]
    assert got["status"] == "VALID_PROPOSAL" and got["applied_at"] is None
    assert got["proposal"] == c["proposal"] and got["trades"][0]["ticker"] == "VALE3"
    assert got["results_url"].startswith(f"/radar?run={c['run']}&")


def test_booked_dividend_feeds_manager_cash_and_invalidates_open_proposal(lab):
    c, raw = lab
    result(c, raw)
    r = m.manual.request(
        {
            "kind": "DIVIDEND",
            "wallet": c["wallet"]["id"],
            "dividend": {
                "ticker": "VALE3",
                "kind": "DIVIDENDO",
                "data_com": "2026-10-14",
                "payment_date": "2026-10-15",
                "quantity": "10",
                "gross": "100.00",
                "net": "100.00",
            },
        }
    )
    out = m.manual.book_dividends([(r, {"snapshot_sha256": "a" * 64, "url": "u"})])
    assert out["booked"] == 1
    # the old proposal is stale (wallet revision changed) with the clear refusal
    with pytest.raises(ValueError, match="wallet_changed"):
        m.wallet_current(c)
    with pytest.raises(ValueError, match="carteira mudou"):
        m.post(
            "preview",
            {"run": c["run"], "proposal": c["proposal"], "economic_date": "2026-10-15"},
        )
    # a new analysis sees the ledger cash that already includes the dividend
    fresh = m.manual.get({"wallet": c["wallet"]["id"]})["selected"]
    assert m.b.dec(fresh["cash"]) == m.b.dec(c["wallet"]["cash"]) + 100
    big = {**raw, "actions": [raw["actions"][0], {**raw["actions"][1], "quantity": "17"}]}
    with pytest.raises(ValueError, match="insufficient_cash"):
        m.compile_proposal(c, big)  # 680 > 400 + 240 of the sale
    assert m.compile_proposal({**c, "wallet": fresh}, big)["cash_after"]


def at(text):
    return pd.Timestamp(text + "-03:00")


@pytest.mark.parametrize(
    "when,expected",
    [
        ("2026-10-19T09:44:59", ("2026-10-19", "OPEN")),  # before the pre-auction
        ("2026-10-19T09:45:00", ("2026-10-19", "CLOSE")),
        ("2026-10-19T14:00:00", ("2026-10-19", "CLOSE")),
        ("2026-10-19T16:49:59", ("2026-10-19", "CLOSE")),
        ("2026-10-19T16:50:00", ("2026-10-20", "OPEN")),  # inside the closing margin
        ("2026-10-16T18:30:00", ("2026-10-19", "OPEN")),  # Friday evening -> Monday
        ("2026-10-17T12:00:00", ("2026-10-19", "OPEN")),  # weekend
        ("2026-11-03T10:44:00", ("2026-11-03", "OPEN")),  # winter regime: +1h
        ("2026-11-03T10:45:00", ("2026-11-03", "CLOSE")),
        ("2026-11-03T17:49:00", ("2026-11-03", "CLOSE")),
        ("2026-11-03T17:50:00", ("2026-11-04", "OPEN")),
    ],
)
def test_auction_schedule_cutoffs(when, expected):
    assert m.orders.first_auction(at(when)) == expected


def test_validity_ends_with_the_target_sessions_last_cutoff():
    assert not m.orders.expired("2026-10-16", at("2026-10-16T16:49:59"))
    assert m.orders.expired("2026-10-16", at("2026-10-16T16:50:00"))
    assert m.orders.expired("2026-10-16", at("2026-10-17T10:00:00"))
    assert m.orders.schedule(at("2026-10-15T08:00:00"), "2026-10-16")["valid_until"] == (
        "2026-10-16T16:50-03:00"
    )


def test_open_leg_books_at_official_open_with_session_economic_date(lab, monkeypatch):
    c, raw = lab
    result(c, raw)
    monkeypatch.setattr(m.radar, "now", lambda: at("2026-10-15T09:00:00"))
    order = approve(c)["order"]
    assert (order["session"], order["leg"]) == ("2026-10-15", "OPEN")
    assert order["decision_prices"] == {"VALE3": "60.00", "PETR4": "40.00"}
    assert order["quotes"] == {"preview": None, "approval": None}  # stage B fills these
    wallet = c["wallet"]["id"]
    seed(monkeypatch, {})  # auction price not in the base yet: waits, nothing changes
    assert m.orders.settle_pending()["waiting"] == [c["proposal"]]
    assert m.latest({"wallet": wallet})["latest"]["status"] == "PENDING_AUCTION"
    assert m.manual.get({"wallet": wallet})["selected"]["cash"] == "400.00"
    seed(
        monkeypatch,
        {("VALE3", "2026-10-15"): (62.5, 61.0), ("PETR4", "2026-10-15"): (41.0, 40.0)},
    )
    m.orders.settle_pending()
    m.orders.settle_pending()  # repeating is harmless
    trades = m.manual.get({"wallet": wallet})["selected"]["trades"][1:]
    assert [(t["ticker"], t["side"], t["price"], t["economic_date"]) for t in trades] == [
        ("VALE3", "SELL", "62.50", "2026-10-15"),
        ("PETR4", "BUY", "41.00", "2026-10-15"),
    ]
    prices = trades[0]["source"]["prices"]["VALE3"]  # the four prices of the TCC
    assert prices == {
        "decision": "60.00",
        "preview_quote": None,
        "approval_quote": None,
        "auction": "62.50",
    }
    import portfolio_history_api

    assert (
        trades[0]["source"]["kind"] in portfolio_history_api.MANAGER_KINDS
    )  # origin: gestor
    got = m.latest({"wallet": wallet})["latest"]
    assert got["status"] == "EXECUTED" and got["auction"]["leg"] == "OPEN"
    assert got["trades"][0]["price"] == "62.50"


def test_one_pending_order_per_wallet(lab, monkeypatch):
    c, raw = lab
    result(c, raw)
    approve(c)
    c2 = m.prepare({"run": c["run"], "proposal": "b" * 32, "cost_rate_pct": "0.10"})[
        "context"
    ]
    result(c2, raw)
    with pytest.raises(ValueError, match="pending_order_exists"):
        approve(c2)
    assert not (m.folder(c2["run"], c2["proposal"]) / "order.json").exists()


def test_insufficient_cash_at_official_price_reduces_buys_deterministically(
    lab, monkeypatch
):
    c, raw = lab
    result(c, raw)
    approve(c)
    seed(
        monkeypatch,
        {("VALE3", "2026-10-15"): (59, 60.0), ("PETR4", "2026-10-15"): (41, 80.0)},
    )
    m.orders.settle_pending()
    wallet = m.manual.get({"wallet": c["wallet"]["id"]})["selected"]
    buy = wallet["trades"][-1]
    # cash 400 + 239.76 (sale) = 639.76; 10 x 80 would not fit: floor(10 * 639.76/800.80) = 7
    assert (buy["ticker"], buy["quantity"], buy["costs"]) == ("PETR4", "7", "0.56")
    assert wallet["cash"] == "79.20"
    done = m.orders.read(m.folder(c["run"], c["proposal"]) / "execution.json")
    assert done["adjustments"] == [
        {
            "ticker": "PETR4",
            "ordered": "10",
            "executed": "7",
            "reason": "INSUFFICIENT_CASH",
        }
    ]
    assert [t["quantity_ordered"] for t in done["trades"]] == ["4", "10"]


def test_leg_without_official_price_is_not_executed_nor_invented(lab, monkeypatch):
    c, raw = lab
    result(c, raw)
    approve(c)
    seed(
        monkeypatch, {("VALE3", "2026-10-15"): (59, 60.0)}
    )  # session published, PETR4 absent
    m.orders.settle_pending()
    wallet = m.manual.get({"wallet": c["wallet"]["id"]})["selected"]
    assert [t["ticker"] for t in wallet["trades"]] == ["VALE3", "VALE3"]
    done = m.orders.read(m.folder(c["run"], c["proposal"]) / "execution.json")
    assert done["not_executed"] == [{"ticker": "PETR4", "reason": "NO_OFFICIAL_PRICE"}]
    assert done["prices"]["PETR4"]["auction"] is None
    assert wallet["cash"] == "639.76"


def test_dividend_while_pending_does_not_block_execution(lab, monkeypatch):
    c, raw = lab
    result(c, raw)
    approve(c)
    r = m.manual.request(
        {
            "kind": "DIVIDEND",
            "wallet": c["wallet"]["id"],
            "dividend": {
                "ticker": "VALE3",
                "kind": "DIVIDENDO",
                "data_com": "2026-10-14",
                "payment_date": "2026-10-15",
                "quantity": "10",
                "gross": "5.00",
                "net": "5.00",
            },
        }
    )
    m.manual.book_dividends([(r, {"snapshot_sha256": "a" * 64, "url": "u"})])
    seed(
        monkeypatch,
        {("VALE3", "2026-10-15"): (59, 60.0), ("PETR4", "2026-10-15"): (41, 40.0)},
    )
    assert m.orders.settle_pending()["settled"] == [c["proposal"]]
    assert m.manual.get({"wallet": c["wallet"]["id"]})["selected"]["cash"] == "244.36"


def test_sweep_leaves_a_proposal_booked_under_the_old_rule_alone(lab, monkeypatch):
    c, raw = lab
    r = result(c, raw)
    wid, source = c["wallet"]["id"], {"proposal_sha256": r["sha256"]}
    requests = [
        {"kind": "TRADE", "wallet": wid, "trade": {**t, "economic_date": "2026-10-15"}}
        for t in r["trades"]
    ]
    token = m.manual.batch(wid, c["wallet"]["revision"], requests, source)[
        "preview_token"
    ]
    m.manual.batch(
        wid, c["wallet"]["revision"], requests, source, confirm=True, token=token
    )
    monkeypatch.setattr(m.radar, "now", lambda: at("2026-10-19T10:00:00"))
    out = m.orders.settle_pending()
    assert out["expired"] == [] and out["errors"] == []
    assert m.status(c["run"], c["proposal"])["status"] == "APPLIED"
