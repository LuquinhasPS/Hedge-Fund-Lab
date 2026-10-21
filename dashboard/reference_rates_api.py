"""DP-28 external reference: CDI daily rate from Banco Central SGS series 12.

Accrual semantics: the SGS value of date d (% per day) is the rate earned from d
to the next business day. The cumulative CDI return from anchor session A to
session S is  prod(1 + rate_d/100) - 1  over published dates d with A <= d < S.
So the index at date t uses only rates published strictly before t (t's own rate
accrues from t onward), and the index at the anchor is exactly 1.0.

Storage mirrors the B3 base: one sealed immutable JSON per fetched window under
<market base root>/rates. Overlapping dates across files must agree; a
disagreement is a conflict (no latest-wins) and cdi() refuses to answer.
"""

import hashlib
import json
import os
from datetime import date, datetime, timedelta
from urllib import error, request

import market_base_api as mb

IDENTITY = "HFL-REFERENCE-RATES-CDI-V1"
SERIES = 12
FIRST = date(2000, 1, 3)
WINDOW_DAYS = 9 * 365  # the API limits daily series to 10-year windows; stay under it
URL = (
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados"
    "?formato=json&dataInicial={}&dataFinal={}"
)
PROVIDER = "Banco Central do Brasil — SGS 12"
MAX_BYTES = 8 * 1024 * 1024
br = lambda d: d.strftime("%d/%m/%Y")  # noqa: E731


def fetch_http(url):
    """Bytes, or None on HTTP 404 (BCB answers 404 for a range with no data)."""
    if os.environ.get("HFL_RATES_OFFLINE"):  # tests: never reach the network
        return None
    try:
        req = request.Request(url, headers={"User-Agent": mb.USER_AGENT})
        with request.urlopen(req, timeout=60) as response:
            return response.read(MAX_BYTES + 1)
    except error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def _dir():
    return mb.ROOT / "rates"


def files():
    return [mb.b.check_seal(mb.radar.read(p)) for p in sorted(_dir().glob("*.json"))]


def daily():
    """{date: rate_pct} over every stored file; raises on disagreement."""
    out = {}
    for f in files():
        if f["identity"] != IDENTITY:
            raise ValueError("rates_identity_mismatch")
        for r in f["rows"]:
            if out.setdefault(r["date"], r["rate_pct"]) != r["rate_pct"]:
                raise ValueError("cdi_conflict:" + r["date"])
    return out


def windows(last, closed):
    """Request windows (start, end) covering the day after `last` up to `closed`."""
    start = max(FIRST, date.fromisoformat(last) + timedelta(1)) if last else FIRST
    closed, out = date.fromisoformat(closed), []
    while start <= closed:
        end = min(closed, start + timedelta(WINDOW_DAYS - 1))
        out.append((start, end))
        start = end + timedelta(1)
    return out


def update(closed, fetch=None):
    """Fetch what is missing after the last stored date, up to the last closed session."""
    fetch = fetch or fetch_http
    saved = []
    for start, end in windows(max(daily(), default=None), closed):
        url = URL.format(br(start), br(end))
        raw = fetch(url)
        rows = json.loads(raw) if raw else []
        # SGS can wrap a missing-value 404 in HTTP 200. Preserve it as a gap.
        missing = rows.get("erro") if isinstance(rows, dict) else None
        if isinstance(missing, dict) and missing.get("statusCode") == 404:
            rows = []
        if not isinstance(rows, list):
            raise ValueError("cdi_unexpected_answer")
        rows = [
            {
                "date": datetime.strptime(r["data"], "%d/%m/%Y").date().isoformat(),
                "rate_pct": float(r["valor"]),
            }
            for r in rows
        ]
        if not rows:  # empty newest window = not published yet
            continue
        record = {
            "identity": IDENTITY,
            "series": SERIES,
            "url": url,
            "raw_sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "acquired_at": mb.radar.now().isoformat(),
            "rows": rows,
        }
        name = f"sgs12-{start}_{end}.json"
        mb.radar.write(_dir() / name, mb.b.sealed(record), immutable=True)
        saved.append(name)
    daily()  # a new file that contradicts an old one surfaces now
    return saved


def cdi(anchor, until, rates=None):
    """[{date, index}]: 1.0 at `anchor`, then each published date in (anchor, until]."""
    rates = daily() if rates is None else rates
    rows, acc, prev = [{"date": anchor, "index": 1.0}], 1.0, None
    for d in sorted(x for x in rates if anchor <= x <= until):
        if prev:
            acc *= 1 + rates[prev] / 100
        if d != anchor:
            rows.append({"date": d, "index": acc})
        prev = d
    # ponytail: a published-date gap between anchor and a row is not detected
    # (SGS 12 has one value per business day); upgrade: compare with B3Calendar.
    return {
        "provider": PROVIDER,
        "rows": rows,
        "acquired_at": max((f["acquired_at"] for f in files()), default=None),
    }
