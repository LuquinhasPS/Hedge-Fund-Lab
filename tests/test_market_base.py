"""DP-27 market base: in-memory COTAHIST ZIPs, injected fetcher, no network."""

import io
import sys
import time
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

PROJECT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(PROJECT / "dashboard"), str(PROJECT / "scripts"), str(PROJECT)]
import market_base_api as m  # noqa: E402

from src.pipeline.b3_official import read_cotahist  # noqa: E402


def line(day, symbol, close, tpmerc="010"):
    cents = lambda v, n=13: f"{round(v * 100):0{n}d}"  # noqa: E731
    text = ("01" + day.replace("-", "") + "02" + symbol.ljust(12) + tpmerc).ljust(56)
    text += cents(close - 1) + cents(close + 1) + cents(close - 2)  # O H L
    text += cents(close - 0.5) + cents(close)  # PREMED, PREULT
    text = text.ljust(147) + f"{7:05d}" + f"{1000:018d}" + cents(close * 1000, 18)
    return text.ljust(245) + "\n"


def make_zip(lines, name="COTAHIST.TXT"):
    body = "00HEADER\n" + "".join(lines) + "99TRAILER\n"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(name, body.encode("latin-1"))
    return buf.getvalue()


def daily(day, close=10.0):
    return make_zip([line(day, "PETR4", close), line(day, "ZZZZ3", 1)])


@pytest.fixture
def base(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "ROOT", tmp_path / "base")
    monkeypatch.setattr(m, "FIRST_YEAR", 2001)
    clock = iter(pd.date_range("2026-10-16T10:00:00-03:00", periods=99, freq="min"))
    monkeypatch.setattr(m.radar, "now", lambda: next(clock))
    monkeypatch.setattr(m.stock, "load", lambda ticker: None)
    # The job also fetches/books dividends: never the network, never the real ledger.
    monkeypatch.setattr(m, "fetch_http", lambda url: None)
    monkeypatch.setattr(m.manual, "ROOT", tmp_path / "personal")
    return m


def fetcher(files, log=None):
    def fetch(url):
        if log is not None:
            log.append(url.rsplit("/", 1)[1])
        return files.get(url.rsplit("/", 1)[1])

    return fetch


def test_one_pass_parser_matches_read_cotahist(tmp_path):
    raw = make_zip(
        [
            line("2020-11-18", "PETR4", 23.4),
            line("2020-11-19", "VALE3", 50.0),
            line("2020-11-19", "PETR4", 23.55),
            line("2020-11-19", "PETR4", 9, tpmerc="070"),
        ]
    )
    (tmp_path / "a.zip").write_bytes(raw)
    rows, seen = m.parse(raw)
    old = read_cotahist(tmp_path / "a.zip", "PETR4")
    assert seen == {"2020-11-18", "2020-11-19"}
    assert [r["date"] for r in rows["PETR4"]] == list(old.index.strftime("%Y-%m-%d"))
    for r, (_, o) in zip(rows["PETR4"], old.iterrows()):
        assert (r["open"], r["high"], r["low"], r["close"], r["volume"]) == (
            o.abertura,
            o.maxima,
            o.minima,
            o.fechamento,
            o.volume,
        )
    assert rows["PETR4"][0]["avg"] == 22.9
    assert rows["PETR4"][0]["trades"] == 7
    assert rows["PETR4"][0]["financial"] == 23400.0


def test_plan_empty_base(base):
    short = [i["file"] for i in base.plan("2002-01-04")]
    assert short == [
        "COTAHIST_A2001.ZIP",
        "COTAHIST_D02012002.ZIP",
        "COTAHIST_D03012002.ZIP",
        "COTAHIST_D04012002.ZIP",
    ]
    assert [i["file"] for i in base.plan("2002-02-28")] == [
        "COTAHIST_A2001.ZIP",
        "COTAHIST_A2002.ZIP",
    ]


def test_update_acquires_then_is_idempotent_and_404_stores_nothing(base):
    files = {
        "COTAHIST_A2001.ZIP": make_zip([line("2001-12-28", "PETR4", 9.0)]),
        "COTAHIST_D02012002.ZIP": daily("2002-01-02"),
        "COTAHIST_D03012002.ZIP": daily("2002-01-03"),
    }
    first = base.update(fetcher(files), "2002-01-04")["results"]
    assert {r["file"]: r["status"] for r in first} == {
        "COTAHIST_A2001.ZIP": "ACQUIRED",
        "COTAHIST_D02012002.ZIP": "ACQUIRED",
        "COTAHIST_D03012002.ZIP": "ACQUIRED",
        "COTAHIST_D04012002.ZIP": "NOT_PUBLISHED",
    }
    assert len(list((base.ROOT / "b3").glob("*.json"))) == 3
    files["COTAHIST_D04012002.ZIP"] = daily("2002-01-04")
    log = []
    base.update(fetcher(files, log), "2002-01-04")
    assert log == ["COTAHIST_D04012002.ZIP"]
    log.clear()
    assert base.update(fetcher(files, log), "2002-01-04")["results"] == []
    assert log == []
    record = base.acquired()[0]
    assert record["raw_sha256"] and record["bytes"] and record["url"].endswith(".ZIP")


def test_daily_with_wrong_session_is_rejected(base):
    files = {
        "COTAHIST_A2001.ZIP": make_zip([line("2001-12-28", "PETR4", 9.0)]),
        "COTAHIST_D02012002.ZIP": daily("2002-01-03"),
    }
    results = base.update(fetcher(files), "2002-01-02")["results"]
    bad = next(r for r in results if r["file"] == "COTAHIST_D02012002.ZIP")
    assert bad["status"] == "FAILED" and "session_mismatch" in bad["error"]
    assert [f["kind"] for f in base.acquired()] == ["annual"]


def test_conflict_as_of_and_gaps(base):
    base.acquire(
        base.target("annual", 2001),
        fetcher(
            {
                "COTAHIST_A2001.ZIP": make_zip(
                    [line("2001-12-26", "PETR4", 9.0), line("2001-12-28", "PETR4", 9.5)]
                )
            }
        ),
    )  # acquired 10:00; 12-27 has no row -> one gap
    day = base.target("daily", pd.Timestamp("2002-01-02").date())
    base.acquire(day, fetcher({day["file"]: daily("2002-01-02", 10.0)}))  # 10:01
    base.acquire(
        base.target("annual", 2002),
        fetcher({"COTAHIST_A2002.ZIP": make_zip([line("2002-01-02", "PETR4", 10.5)])}),
    )  # 10:02, disagrees with the daily
    rows = {r["date"]: r for r in base.series("PETR4")["rows"]}
    assert rows["2001-12-26"]["close"] == 9.0 and not rows["2001-12-26"]["conflict"]
    assert rows["2002-01-02"]["conflict"] and rows["2002-01-02"]["close"] is None
    assert rows["2002-01-02"]["acquired_at"].startswith("2026-10-16T10:01")
    # as_of is the data session: nothing after it is visible
    early = base.series("PETR4", "2001-12-27")["rows"]
    assert [r["date"] for r in early] == ["2001-12-26"]
    info = base.coverage()["PETR4"]
    assert (info["first"], info["last"], info["conflicts"]) == (
        "2001-12-26",
        "2002-01-02",
        1,
    )
    assert info["gaps"] == 1  # 2001-12-27 (2001-12-31 is the closed last weekday)
    assert base.coverage()["VALE3"] is None


def test_yahoo_factor(base, monkeypatch):
    day = base.target("daily", pd.Timestamp("2002-01-02").date())
    base.acquire(day, fetcher({day["file"]: daily("2002-01-02", 10.0)}))
    monkeypatch.setattr(
        base.stock,
        "load",
        lambda t: {
            "sha256": "s",
            "fetched_at": "f",
            "rows": [{"date": "2002-01-02", "close": 10.0, "adjusted_close": 8.0}],
        },
    )
    out = base.series("PETR4")
    assert out["factor_source"] == {"sha256": "s", "fetched_at": "f"}
    assert out["rows"][0]["factor"] == 0.8 and out["rows"][0]["adjusted_close"] == 8.0


def test_acquired_is_cached_until_a_file_changes(base, monkeypatch):
    m._verified.cache_clear()
    first, second = (
        m.target("daily", date(2026, 10, 15)),
        m.target("daily", date(2026, 10, 16)),
    )
    m.acquire(first, lambda url: daily("2026-10-15"))
    reads, real = [], m.radar.read
    monkeypatch.setattr(m.radar, "read", lambda p: reads.append(p) or real(p))
    assert len(m.acquired()) == 1 and len(m.acquired()) == 1
    assert len(reads) == 1  # second call served from the cache
    m.acquire(second, lambda url: daily("2026-10-16"))
    assert len(m.acquired()) == 2  # a new file invalidates


def test_job_runs_update_and_yahoo_once_and_never_raises(base, monkeypatch):
    done = []
    monkeypatch.setattr(
        m, "update", lambda fetch: {"closed": "2026-10-15", "results": []}
    )
    monkeypatch.setattr(
        m.stock, "download", lambda t, c: done.append(t) if t != "VALE3" else 1 / 0
    )
    m.JOB.update(running=False, last=None, error=None)
    m.start()
    for _ in range(100):
        if not m.JOB["running"]:
            break
        time.sleep(0.05)
    out = m.status()
    assert out["last"]["yahoo"]["PETR4"] == "OK" and out["last"]["yahoo"]["IBOV"] == "OK"
    assert out["last"]["yahoo"]["VALE3"].startswith("ZeroDivisionError")
    assert out["error"] is None and len(done) == 5 and out["coverage"]["PETR4"] is None


def test_ibov_benchmark_anchor_bounds_and_skip(base, monkeypatch):
    rows = [
        {"date": d, "close": c}
        for d, c in [
            ("2026-10-08", 100.0),
            ("2026-10-09", None),
            ("2026-10-13", 110.0),
            ("2026-10-14", 120.0),
            ("2026-10-15", 130.0),
            ("2026-10-16", 140.0),
        ]
    ]
    monkeypatch.setattr(m.radar, "last_closed", lambda now: "2026-10-15")
    assert (
        m.benchmark("2026-10-13")["rows"] == []
        and m.benchmark("2026-10-13")["anchor"] is None
    )
    monkeypatch.setattr(
        m.stock, "load", lambda t: {"sha256": "s", "fetched_at": "f", "rows": rows}
    )
    out = m.benchmark("2026-10-13")
    assert out["anchor"] == "2026-10-08" and out["provider_symbol"] == "^BVSP"
    assert [r["date"] for r in out["rows"]] == [
        "2026-10-08",
        "2026-10-13",
        "2026-10-14",
        "2026-10-15",
    ]
    assert m.benchmark("2026-10-01")["anchor"] is None
    # current snapshot -> _run does not download IBOV again
    done = []
    monkeypatch.setattr(
        m, "update", lambda fetch: {"closed": "2026-10-15", "results": []}
    )
    monkeypatch.setattr(m.stock, "download", lambda t, c: done.append(t))
    monkeypatch.setattr(m, "fetch_http", lambda url: None)  # dividends: never the network
    m._run(None)
    assert "IBOV" not in done and m.JOB["last"]["yahoo"]["IBOV"] == "OK"
    assert set(m.JOB["last"]["dividends"].values()) == {"NOT_PUBLISHED"}


def test_alias_rows_are_normalized_supplemented_once_and_overlap_conflicts(base):
    raw = make_zip(
        [line("2009-05-19", "ITAU4", 29.45), line("2009-05-20", "ITUB4", 30.0)]
    )
    rows, _ = m.parse(raw)
    assert [(r["date"], r.get("source_symbol")) for r in rows["ITUB4"]] == [
        ("2009-05-19", "ITAU4"),
        ("2009-05-20", None),
    ]
    # an annual sealed before the alias existed lacks the ITAU4 rows
    m.radar.write(
        m.ROOT / "b3" / "COTAHIST_A2009.ZIP.json",
        m.b.sealed(
            {
                "identity": m.IDENTITY,
                "url": "u",
                "file_name": "COTAHIST_A2009.ZIP",
                "kind": "annual",
                "raw_sha256": "x",
                "bytes": 1,
                "parser": "old",
                "acquired_at": m.radar.now().isoformat(),
                "year": 2009,
                "through": "2009-05-20",
                "rows": {"ITUB4": [{**rows["ITUB4"][1]}]},
            }
        ),
        immutable=True,
    )
    base.FIRST_YEAR = 2009
    files = lambda p: [i["file"] for i in m.plan("2010-01-04", p) if "+" in i["file"]]  # noqa: E731
    assert files(None) == ["COTAHIST_A2009.ZIP+ITAU4"]  # not 2010+: ITAU4 gone
    m.update(fetcher({"COTAHIST_A2009.ZIP": raw}), "2010-01-04")
    assert files(None) == []  # idempotent
    assert [r["close"] for r in m.merged("ITUB4")] == [29.45, 30.0]
    # same date under both codes with different prices -> conflict, never merged
    both = make_zip([line("2009-05-20", "ITAU4", 25.0)])
    m.acquire(m.target("daily", date(2009, 5, 20)), lambda url: both)
    assert m.merged("ITUB4")[-1]["conflict"] and m.coverage()["ITUB4"]["conflicts"] == 1


def test_b3_user_agent_only_on_b3_hosts():
    from urllib import request

    agent = m._B3Agent()
    b3 = agent.https_request(request.Request("https://bvmf.bmfbovespa.com.br/x.ZIP"))
    other = agent.https_request(request.Request("https://example.com/x"))
    assert b3.unredirected_hdrs == {"User-agent": m.USER_AGENT}
    assert other.unredirected_hdrs == {}


def test_wege_cutoff_maps_old_code_and_drops_thin_current_class_before_switch(base):
    raw = make_zip(
        [
            line("2007-05-30", "WEGE3", 5.0),  # thin ordinary class: excluded (DP-29)
            line("2007-05-31", "WEGE4", 16.1),
            line("2007-05-31", "WEGE3", 9.0),  # overlapping date: no conflict
        ]
    )
    nxt = make_zip([line("2007-06-01", "WEGE3", 16.7)])
    m.acquire(m.target("annual", 2007), lambda url: raw)
    m.acquire(m.target("daily", date(2007, 6, 1)), lambda url: nxt)
    rows = m.merged("WEGE3")
    assert [(r["date"], r["close"], r.get("source_symbol")) for r in rows] == [
        ("2007-05-31", 16.1, "WEGE4"),
        ("2007-06-01", 16.7, None),
    ]
    assert m.coverage()["WEGE3"]["conflicts"] == 0
    # annual sealed before WEGE4 existed (aliases: ITAU4 only) gets one supplement; 2008+ none
    old = [{"kind": "annual", "year": y, "aliases": ["ITAU4"]} for y in (2007, 2008)]

    def todo(have):
        return [i["file"] for i in m.plan("2009-01-02", have) if "+" in i["file"]]

    assert todo(old) == ["COTAHIST_A2007.ZIP+WEGE4"]
    assert todo(m.acquired()) == []


def test_run_captures_dividend_booking_error_and_result(base, monkeypatch):
    import dividends_api

    monkeypatch.setattr(
        m, "update", lambda fetch: {"closed": "2026-10-15", "results": []}
    )
    monkeypatch.setattr(m.stock, "download", lambda t, c: None)
    monkeypatch.setattr(m, "fetch_http", lambda url: None)
    monkeypatch.setattr(dividends_api, "book_received", lambda today: 1 / 0)
    m._run(None)
    assert m.JOB["last"]["dividends_booked"].startswith("ZeroDivisionError")
    assert m.JOB["error"] is None  # never aborts the job
    monkeypatch.setattr(dividends_api, "book_received", lambda today: {"booked": 0})
    m._run(None)
    assert m.JOB["last"]["dividends_booked"] == {"booked": 0}
