"""DP-31 backtest: synthetic series, no network, no local base."""

import http.client
import json
import sys
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts"), str(ROOT / "dashboard")]
import backtest_api as bt  # noqa: E402
import server  # noqa: E402

DAYS = [
    "2024-01-30",
    "2024-01-31",
    "2024-02-01",
    "2024-02-02",
    "2024-03-01",
    "2024-03-04",
]
A = dict(zip(DAYS, [10, 10, 12, 12, 9, 9], strict=True))
B = dict(zip(DAYS, [20, 22, 22, 20, 20, 24], strict=True))


def rows(prices, skip=()):
    return [
        {"date": d, "adjusted_close": v, "conflict": False}
        for d, v in prices.items()
        if d not in skip
    ]


def params(**kw):
    return bt.parse(
        {"tickers": "PETR4,VALE3", "start": "2024-01-30", "end": "2024-03-04", **kw},
        "2024-03-04",
    )


@pytest.fixture
def base(monkeypatch):
    data = {"PETR4": rows(A), "VALE3": rows(B)}
    monkeypatch.setattr(bt, "_series", lambda t: data[t])
    monkeypatch.setattr(bt, "_closed", lambda: "2024-03-04")
    ibov = {d: 100 + i * 10 for i, d in enumerate(DAYS)}
    cdi = [{"date": d, "index": 1 + i * 0.001} for i, d in enumerate(DAYS)]
    monkeypatch.setattr(bt, "_refs", lambda first, last: (ibov, cdi, None))
    return data


def test_no_rebalance_is_weighted_buy_and_hold(base):
    r = bt.run(params(), base, "2024-03-04")
    exp = [100000 * (0.5 * A[d] / 10 + 0.5 * B[d] / 20) for d in DAYS]
    assert r["strategy"] == pytest.approx(exp)
    assert (
        r["metrics"]["strategy"]["rebalances"] == 0
        and r["metrics"]["strategy"]["total_costs"] == 0
    )


def test_monthly_rebalance_resets_weights_at_month_start(base):
    r = bt.run(params(rebalance="monthly"), base, "2024-03-04")
    # 2024-02-01: value before = 1e5*(0.5*1.2+0.5*1.1) = 115000 -> back to 57500 each;
    # 2024-03-01: A 9/12, B 20/22 from those holdings, then reset again.
    v1 = 115000
    a, b = 0.5 * v1 / 12, 0.5 * v1 / 22
    v2 = a * 9 + b * 20
    assert r["strategy"][2] == pytest.approx(v1)
    assert r["strategy"][3] == pytest.approx(a * 12 + b * 20)
    assert r["strategy"][4] == pytest.approx(v2)
    after = 0.5 * v2 / 9 * 9, 0.5 * v2 / 20 * 24
    assert r["strategy"][5] == pytest.approx(sum(after))
    assert r["metrics"]["strategy"]["rebalances"] == 2


def test_costs_reduce_equity_by_expected_amount(base):
    free = bt.run(params(), base, "2024-03-04")
    paid = bt.run(params(cost_bps="100"), base, "2024-03-04")
    # buy&hold: only the initial trade, 1% of 100000, taken pro rata -> equity x 0.99
    assert paid["metrics"]["strategy"]["total_costs"] == pytest.approx(1000)
    assert paid["strategy"][0] == 100000
    assert paid["strategy"][1:] == pytest.approx([x * 0.99 for x in free["strategy"][1:]])


def test_start_before_first_date_names_ticker_and_date(base):
    base["VALE3"] = rows({d: v for d, v in B.items() if d >= "2024-02-01"})
    with pytest.raises(bt.Invalid, match=r"VALE3.*2024-02-01"):
        bt.run(params(), base, "2024-03-04")


def test_stale_days_carry_last_price_and_are_counted(base):
    base["VALE3"] = rows(B, skip=("2024-02-01",))
    r = bt.run(params(), base, "2024-03-04")
    assert r["stale_days"] == {"PETR4": 0, "VALE3": 1}
    # on the missing day VALE3 keeps 22 (31 Jan close)
    assert r["strategy"][2] == pytest.approx(100000 * (0.5 * 1.2 + 0.5 * 1.1))


def test_references_normalized_to_first_session(base):
    r = bt.run(params(), base, "2024-03-04")
    assert r["ibov"][0] == 1 and r["cdi"][0] == 1
    assert r["ibov"][1] == pytest.approx(1.1)
    assert (
        r["metrics"]["cdi"]["sharpe"] is None
        and r["metrics"]["strategy"]["sharpe"] is not None
    )


def test_missing_reference_is_null_with_reason(base, monkeypatch):
    monkeypatch.setattr(
        bt, "_refs", lambda first, last: ({}, [], "cdi_conflict:2024-01-31")
    )
    r = bt.run(params(), base, "2024-03-04")
    assert r["ibov"] is None and r["cdi"] is None
    assert r["metrics"]["unavailable"]["cdi"] == "cdi_conflict:2024-01-31"
    assert r["metrics"]["strategy"]["sharpe"] is None


@pytest.mark.parametrize(
    "q",
    [
        {"tickers": "AAPL"},
        {"tickers": ""},
        {"tickers": "PETR4,VALE3", "weights": "0.5,0.6"},
        {"tickers": "PETR4,VALE3", "weights": "1"},
        {"end": "2024-03-05"},
        {"rebalance": "weekly"},
        {"cost_bps": "201"},
        {"cost_bps": "nan"},
        {"start": "2024-3-1"},
        {"foo": "1"},
    ],
)
def test_validation_rejects(q):
    with pytest.raises(bt.Invalid):
        bt.parse(
            {"tickers": "PETR4", "start": "2024-01-30", "end": "2024-03-04", **q},
            "2024-03-04",
        )


def test_http_400_and_200(base):
    with server.ReusableTCPServer(("127.0.0.1", 0), server.Handler) as httpd:
        threading.Thread(target=httpd.serve_forever, daemon=True).start()

        def get(qs):
            c = http.client.HTTPConnection(
                "127.0.0.1", httpd.server_address[1], timeout=20
            )
            c.request("GET", "/api/lab/backtest?" + qs)
            res = c.getresponse()
            return res.status, json.loads(res.read())

        ok = "tickers=PETR4,VALE3&start=2024-01-30&end=2024-03-04"
        status, body = get(ok)
        assert status == 200 and body["read_only"] and len(body["sessions"]) == 6
        assert get(ok + "&rebalance=hourly")[0] == 400
        assert get("tickers=XXXX&start=2024-01-30&end=2024-03-04")[0] == 400
        assert get(ok + "&tickers=PETR4")[0] == 400
        httpd.shutdown()
