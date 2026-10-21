"""DP-30 proventos: recorded (trimmed) B3 response, injected fetcher, no network."""

import base64
import json
import sys
from pathlib import Path

import pytest

PROJECT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(PROJECT / "dashboard"), str(PROJECT / "scripts"), str(PROJECT)]
import dividends_api as d  # noqa: E402


def rec(isin, label, rate, com, paid, approved="06/08/2026"):
    return {
        "assetIssued": isin,
        "paymentDate": paid,
        "rate": rate,
        "relatedTo": "Anual/2026",
        "approvedOn": approved,
        "isinCode": isin,
        "label": label,
        "lastDatePrior": com,
        "remarks": "",
    }


ON, PN = "BRPETRACNOR9", "BRPETRACNPR6"


def raw(*records, code="PETR"):
    return json.dumps([{"code": code, "cashDividends": list(records)}]).encode()


SAMPLE = raw(
    rec(ON, "JRS CAP PROPRIO", "0,67407131000", "21/08/2026", "23/11/2026"),
    rec(ON, "DIVIDENDO", "0,47156696000", "21/08/2026", "21/12/2026"),
    rec(PN, "DIVIDENDO", "0,47156696000", "21/08/2026", "21/12/2026"),
    rec("BRPETRA04OR8", "RENDIMENTO", "0,01", "22/04/2026", "20/05/2026"),
    rec(ON, "RENDIMENTO", "0,0165", "22/10/2026", ""),
)


@pytest.fixture(autouse=True)
def root(tmp_path, monkeypatch):
    monkeypatch.setattr(d.base, "ROOT", tmp_path / "market-base")


def test_normalize_validates_and_filters_class():
    on = d.normalize(SAMPLE, "PETR3")
    assert [
        (e["kind"], e["data_com"], e["payment_date"], e["value_per_share"]) for e in on
    ] == [
        ("JCP", "2026-08-21", "2026-11-23", "0.67407131"),
        ("DIVIDENDO", "2026-08-21", "2026-12-21", "0.47156696"),
        ("OUTRO", "2026-10-22", None, "0.0165"),
    ]
    assert on[2]["label"] == "RENDIMENTO" and on[0]["approved_on"] == "2026-08-06"
    assert len(d.normalize(SAMPLE, "PETR4")) == 1  # PN: only the PN dividend
    for bad in (
        rec(ON, "DIVIDENDO", "0", "21/08/2026", ""),
        rec(ON, "DIVIDENDO", "1", "31/02/2026", ""),
        rec(ON, "DIVIDENDO", "1", "21/08/2026", "20/08/2026"),
        rec("BRVALEACNOR0", "DIVIDENDO", "1", "21/08/2026", ""),
    ):
        with pytest.raises(ValueError):
            d.normalize(raw(bad), "PETR3")
    with pytest.raises(ValueError):
        d.normalize(raw(code="VALE"), "PETR3")


def petr_only(url):
    return SAMPLE if b"PETR" in base64.b64decode(url.rsplit("/", 1)[1]) else None


def test_update_writes_once_and_skips_unchanged():
    out = d.update(petr_only)
    assert out["PETR4"] == "WRITTEN" and out["VALE3"] == "NOT_PUBLISHED"
    assert d.update(lambda url: SAMPLE)["PETR4"] == "UNCHANGED"
    assert len(list((d.folder("PETR4")).glob("*.json"))) == 2  # snapshot + latest
    assert len(d.events("PETR4")) == 1 and d.events("VALE3") == []
    assert d.update(lambda url: b"{")["PETR4"].startswith("FAILED")


def test_entitlements_by_data_com_net_jcp_and_states(monkeypatch):
    import portfolio_history_api as h

    trades = [
        {"ticker": "PETR3", "economic_date": "2026-08-20"},
        {"ticker": "PETR3", "economic_date": "2026-08-22"},  # after the data-com
    ]
    wallet = {"id": "w", "start_date": "2026-08-01", "trades": trades}
    held = lambda w, at: {  # noqa: E731
        "positions": [
            {"ticker": "PETR3", "quantity": "100" if at < "2026-08-22" else "150"}
        ]
    }
    monkeypatch.setattr(h, "historical_wallet", held)
    monkeypatch.setattr(d, "events", lambda t: d.normalize(SAMPLE, t))

    def states(today):
        return {(e["kind"], e["data_com"]): e for e in d.entitlements(wallet, today)}

    s = states("2026-11-23")  # JCP paid today; dividend not yet paid
    jcp = s["JCP", "2026-08-21"]
    assert (jcp["quantity"], jcp["gross"], jcp["net"], jcp["state"]) == (
        "100",
        "67.41",
        "57.30",
        "RECEBIDO",
    )
    div = s["DIVIDENDO", "2026-08-21"]
    assert (div["net"], div["state"], div["estimate"]) == ("47.16", "A_RECEBER", False)
    out = s["OUTRO", "2026-10-22"]  # no payment date yet, data-com passed
    assert (
        out["state"] == "A_RECEBER" and out["net"] == out["gross"] == "2.48"
    )  # 150 held
    assert states("2026-08-21")["JCP", "2026-08-21"]["state"] == "A_RECEBER"
    future = states("2026-08-10")["JCP", "2026-08-21"]  # announced, not eligible yet
    assert (future["state"], future["estimate"]) == ("PREVISTO", True)
    assert (
        d.entitlements({**wallet, "start_date": "2026-09-01"}, "2026-11-23")[0][
            "data_com"
        ]
        == "2026-10-22"
    )
