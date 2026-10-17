"""DP-28 CDI (BCB SGS 12): injected fetcher, no network."""

import json
import sys
from pathlib import Path

import pytest

PROJECT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(PROJECT / "dashboard"), str(PROJECT / "scripts"), str(PROJECT)]
import market_base_api as m  # noqa: E402
import reference_rates_api as r  # noqa: E402


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "ROOT", tmp_path / "base")
    monkeypatch.setattr(m.stock, "load", lambda t: None)
    monkeypatch.setattr(m.radar, "last_closed", lambda now: "2026-10-16")


def answer(rows, log):
    def fetch(url):
        log.append(url.split("dataInicial=")[1])
        return json.dumps([{"data": d, "valor": v} for d, v in rows]).encode()

    return fetch


def test_chunks_and_incremental(root):
    assert [(str(a), str(b)) for a, b in r.windows(None, "2026-10-16")] == [
        ("2000-01-03", "2008-12-30"),
        ("2008-12-31", "2017-12-28"),
        ("2017-12-29", "2026-10-16"),
    ]
    log = []
    fetch = answer([("13/10/2026", "0.055"), ("14/10/2026", "0.056")], log)
    assert len(r.update("2026-10-16", fetch)) == 3 and len(log) == 3
    log.clear()  # incremental: only the day after the last stored date
    assert r.update("2026-10-16", answer([], log)) == [] and log == [
        "15/10/2026&dataFinal=16/10/2026"
    ]


def test_accrual_and_benchmark(root):
    fetch = answer(
        [("13/10/2026", "0.1"), ("14/10/2026", "0.2"), ("15/10/2026", "0.3")], []
    )
    r.update("2026-10-16", fetch)
    rows = r.cdi("2026-10-13", "2026-10-15")["rows"]
    assert [x["date"] for x in rows] == ["2026-10-13", "2026-10-14", "2026-10-15"]
    assert rows[0]["index"] == 1.0
    assert rows[1]["index"] == pytest.approx(
        1.001
    )  # rate of the 13th accrues to the 14th
    assert rows[2]["index"] == pytest.approx(1.001 * 1.002)
    out = m.benchmark("2026-10-13")["cdi"]  # no IBOV: anchor = last CDI date before since
    assert out["anchor"] is None and out["rows"] == []
    out = m.benchmark("2026-10-14")["cdi"]
    assert out["anchor"] == "2026-10-13" and len(out["rows"]) == 3
    assert out["provider"].endswith("SGS 12") and out["acquired_at"]


def test_conflict_is_not_latest_wins(root):
    r.update("2026-10-16", answer([("13/10/2026", "0.1")], []))
    m.radar.write(
        m.ROOT / "rates" / "other.json",
        m.b.sealed(
            {
                "identity": r.IDENTITY,
                "acquired_at": "2026-10-17T10:00:00-03:00",
                "rows": [{"date": "2026-10-13", "rate_pct": 0.2}],
            }
        ),
        immutable=True,
    )
    with pytest.raises(ValueError, match="cdi_conflict:2026-10-13"):
        r.daily()
    assert m.benchmark("2026-10-14")["cdi"]["rows"] == []
