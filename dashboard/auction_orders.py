"""DP-33 A: approved manager baskets wait for the first official B3 auction.

Approving no longer books at the reference close: it stores one sealed, idempotent
PENDING order per proposal (order.json, beside the proposal). `settle_pending` (called by
the DP-27 market update) books it through `manual.batch` at the official OPEN (PREABE)
or CLOSE (PREULT) of the target session, with the economic date of that auction.
Records per proposal folder, all sealed and immutable: order.json, execution.json,
expired.json (+ opportunity.json). No quotes, no network, no scheduler.
"""

import threading
from datetime import date, datetime, time, timedelta

import manual_portfolio_api as manual
import market_base_api as base
import radar_runs as runs
from zoneinfo import ZoneInfo

from src.backtesting.b3_calendar import B3Calendar

b, radar = manual.b, runs.radar
IDENTITY = "HFL-WALLET-MANAGER-AUCTION-ORDER-V1"
KIND = "WALLET_MANAGER_AUCTION_EXECUTION"
SP = ZoneInfo("America/Sao_Paulo")
LOCK = (
    threading.Lock()
)  # ponytail: single process; a second app instance needs a file lock
# Approval cutoffs of the standard regime: opening pre-auction starts 09:45; the closing
# call is 16:55-17:00, cut 5 min earlier because extensions can push it past 17:00.
OPEN_CUTOFF, CLOSE_CUTOFF = time(9, 45), time(16, 50)
# (first day, shift in hours of both cutoffs). B3 follows the US daylight-saving clock:
# +1h from 2025-11-03 until early March 2026 (Money Times). ponytail: 2026-03-09 (Monday
# after the US change) and 2026-11-02 are inferred by analogy, NOT confirmed by a B3
# circular - confirm and edit these dates; nothing else depends on them.
REGIMES = (("2000-01-01", 0), ("2025-11-03", 1), ("2026-03-09", 0), ("2026-11-02", 1))
FILES = ("order", "execution", "expired", "opportunity")


def cutoffs(day):
    """(opening, closing) approval cutoffs of the ISO `day`, aware in America/Sao_Paulo."""
    shift = [h for start, h in REGIMES if start <= day][-1]
    d = date.fromisoformat(day)
    return tuple(
        datetime.combine(d, t, SP) + timedelta(hours=shift)
        for t in (OPEN_CUTOFF, CLOSE_CUTOFF)
    )


def first_auction(at):
    """(session, leg) of the first official auction after `at`: OPEN or CLOSE."""
    at = getattr(at, "to_pydatetime", lambda: at)().astimezone(SP)
    calendar = B3Calendar()
    if calendar.is_session(at.date()):
        opening, closing = cutoffs(at.date().isoformat())
        if at < opening:
            return at.date().isoformat(), "OPEN"
        if at < closing:
            return at.date().isoformat(), "CLOSE"
    return calendar.next_session(at.date()).isoformat(), "OPEN"


def expired(target_date, at):
    """DP-33 (4): valid until the target session's last cutoff, then never."""
    return first_auction(at)[0] > target_date


def schedule(at, target_date):
    session, leg = first_auction(at)
    opening, closing = cutoffs(session)
    return {
        "session": session,
        "leg": leg,
        "valid": session <= target_date,
        "valid_until": cutoffs(target_date)[1].isoformat(timespec="minutes"),
        "cutoffs": {
            "open": opening.isoformat(timespec="minutes"),
            "close": closing.isoformat(timespec="minutes"),
        },
    }


def appliable(c):
    return (
        c["wallet"]["nature"] == "SIMULATION"
        and c["wallet"].get("strategy") != "BUY_HOLD"
    )


def read(path):
    return b.check_seal(radar.read(path)) if path.exists() else None


def records(root):
    return {k: read(root / (k + ".json")) for k in FILES}


def folders():
    for entry in runs.load()["runs"].values():
        for p in sorted((runs.root_of(entry) / "wallet-manager").glob("*/context.json")):
            yield p.parent


def expire(root, c, result, at):
    """EXPIRED record with the opportunity-cost inputs; idempotent (first sighting wins)."""
    path = root / "expired.json"
    if not path.exists():
        radar.write(
            path,
            b.sealed(
                {
                    "identity": IDENTITY,
                    "status": "EXPIRED",
                    "run": c["run"],
                    "proposal": c["proposal"],
                    "proposal_sha256": result["sha256"],
                    "wallet": c["wallet"]["id"],
                    "target_date": c["target_date"],
                    "reference_session": c["reference_session"],
                    "detected_at": at.isoformat(),
                    "basket": [
                        {k: t[k] for k in ("ticker", "side", "quantity")}
                        for t in result["trades"]
                    ],
                    "decision_prices": {
                        t["ticker"]: t["price"] for t in result["trades"]
                    },
                }
            ),
            immutable=True,
        )
    return read(path)


def place(root, c, result, at):
    """Idempotent pending order of one proposal; one pending order per wallet."""
    with LOCK:
        if (order := read(root / "order.json")) is not None:
            return order, True
        session, leg = first_auction(at)
        if session > c["target_date"]:
            raise ValueError("manager_proposal_expired")
        for other in folders():
            theirs = read(other / "order.json")
            if (
                other != root
                and theirs
                and theirs["wallet"]["id"] == c["wallet"]["id"]
                and not (other / "execution.json").exists()
            ):
                raise ValueError("manager_pending_order_exists")
        order = b.sealed(
            {
                "identity": IDENTITY,
                "status": "PENDING_AUCTION",
                "run": c["run"],
                "proposal": c["proposal"],
                "proposal_sha256": result["sha256"],
                "context_sha256": c["sha256"],
                "wallet": {"id": c["wallet"]["id"], "revision": c["wallet"]["revision"]},
                "cost_rate_pct": c["cost_rate_pct"],
                "basket": [
                    {k: t[k] for k in ("ticker", "side", "quantity")}
                    for t in result["trades"]
                ],
                "target_date": c["target_date"],
                "session": session,
                "leg": leg,
                "approved_at": at.isoformat(),
                "reference_session": c["reference_session"],
                "decision_prices": {t["ticker"]: t["price"] for t in result["trades"]},
                # DP-33 stage B: {ticker: sealed delayed-quote snapshot}; null until then.
                "quotes": {"preview": None, "approval": None},
            }
        )
        radar.write(root / "order.json", order, immutable=True)
        return order, False


def session_rows(session):
    """{ticker: official row} of the sessions in the base; empty = not published yet."""
    out = {}
    for ticker in base.TICKERS:
        rows = base.merged(ticker, session)
        if rows and rows[-1]["date"] == session:
            out[ticker] = rows[-1]
    return out


def price_of(row, field):
    return (
        b.dec(f"{row[field]:.2f}") if row and not row["conflict"] and row[field] else None
    )


def plan(order, wallet, rows):
    """TRADE requests at the official price + the source that documents them (DP-33 1, 3, 5).

    Sells first; if cash after the sells cannot pay the buys, every buy shrinks by the same
    factor in whole shares, then the largest buy loses one share at a time (ties: ticker)
    until it fits. Missing price = that leg is not executed; nothing is invented.
    """
    field, rate = (
        ("open" if order["leg"] == "OPEN" else "close"),
        b.dec(order["cost_rate_pct"]),
    )
    side = {i["ticker"]: i["side"] for i in order["basket"]}
    ordered = {i["ticker"]: int(b.dec(i["quantity"])) for i in order["basket"]}
    price, missing = {}, []
    for t in ordered:
        row = rows.get(t)
        if value := price_of(row, field):
            price[t] = value
        else:
            reason = (
                "NO_OFFICIAL_PRICE"
                if row is None
                else "SOURCE_CONFLICT"
                if row["conflict"]
                else "ZERO_PRICE"
            )
            missing.append({"ticker": t, "reason": reason})
    gross = lambda t, q: b.money(q * price[t])  # noqa: E731
    fees = lambda t, q: b.money(gross(t, q) * rate / 100)  # noqa: E731
    qty = {t: ordered[t] for t in price}
    cash = b.dec(wallet["cash"]) + sum(
        (gross(t, q) - fees(t, q) for t, q in qty.items() if side[t] == "SELL"), b.ZERO
    )
    buys = [t for t in sorted(qty) if side[t] == "BUY"]
    cost = lambda: sum((gross(t, qty[t]) + fees(t, qty[t]) for t in buys), b.ZERO)  # noqa: E731
    if buys and cost() > cash:
        factor = max(cash, b.ZERO) / cost()
        for t in buys:
            qty[t] = int(qty[t] * factor)
        while cost() > cash and any(qty[t] for t in buys):
            qty[
                max((t for t in buys if qty[t]), key=lambda t: (gross(t, qty[t]), t))
            ] -= 1
    adjustments = [
        {
            "ticker": t,
            "ordered": str(ordered[t]),
            "executed": str(qty[t]),
            "reason": "INSUFFICIENT_CASH",
        }
        for t in buys
        if qty[t] != ordered[t]
    ]
    quote = lambda k, t: ((order["quotes"] or {}).get(k) or {}).get(t)  # noqa: E731
    source = {
        "kind": KIND,
        "run": order["run"],
        "proposal": order["proposal"],
        "proposal_sha256": order["proposal_sha256"],
        "context_sha256": order["context_sha256"],
        "reference_session": order["reference_session"],
        "price_basis": "B3_OFFICIAL_RAW_"
        + ("OPEN_PREABE" if field == "open" else "CLOSE_PREULT"),
        "target_date": order["target_date"],
        "cost_rate_pct": order["cost_rate_pct"],
        "economic_date": order["session"],
        "leg": order["leg"],
        "approved_at": order["approved_at"],
        # The four prices of the TCC's implementation-shortfall measure.
        "prices": {
            t: {
                "decision": order["decision_prices"][t],
                "preview_quote": quote("preview", t),
                "approval_quote": quote("approval", t),
                "auction": str(price[t]) if t in price else None,
            }
            for t in ordered
        },
        "adjustments": adjustments,
        "not_executed": missing,
    }
    requests = [
        {
            "kind": "TRADE",
            "wallet": order["wallet"]["id"],
            "trade": {
                "ticker": t,
                "side": side[t],
                "quantity": str(qty[t]),
                "price": str(price[t]),
                "costs": str(fees(t, qty[t])),
                "economic_date": order["session"],
            },
        }
        for want in ("SELL", "BUY")
        for t in sorted(qty)
        if side[t] == want and qty[t] > 0
    ]
    return requests, source


def ledger(wallet, sha):
    return [
        t
        for t in wallet["trades"]
        if (t.get("source") or {}).get("proposal_sha256") == sha
    ]


def conclude(root, order, status, now, **fields):
    record = b.sealed(
        {
            "identity": IDENTITY,
            "status": status,
            "run": order["run"],
            "proposal": order["proposal"],
            "proposal_sha256": order["proposal_sha256"],
            "wallet": order["wallet"]["id"],
            "session": order["session"],
            "leg": order["leg"],
            "executed_at": now.isoformat(),
            **fields,
        }
    )
    radar.write(root / "execution.json", record, immutable=True)
    return status


def settle_one(root, order, official, now):
    """Book one order if its auction price is in the base. Returns the new state."""
    session, sha, wid = order["session"], order["proposal_sha256"], order["wallet"]["id"]
    if session > now.date().isoformat() or not (rows := official(session)):
        return "WAITING"
    try:
        wallet = manual.get({"wallet": wid})["selected"]
        booked, token = (
            ledger(wallet, sha),
            None,
        )  # booked = a crash after the ledger write
        if not booked:
            requests, source = plan(order, wallet, rows)
            if requests:
                token = manual.batch(wid, wallet["revision"], requests, source)[
                    "preview_token"
                ]
    except (
        manual.Invalid
    ) as e:  # accounting refusal at the official price: terminal, recorded
        return conclude(root, order, "ORDER_REJECTED", now, reason=str(e), field=e.field)
    if not booked and requests:
        wallet = manual.batch(
            wid, wallet["revision"], requests, source, confirm=True, token=token
        )["wallet"]
        booked = ledger(wallet, sha)
    source = booked[0]["source"] if booked else source
    ordered = {i["ticker"]: i["quantity"] for i in order["basket"]}
    return conclude(
        root,
        order,
        "EXECUTED" if booked else "NOT_EXECUTED",
        now,
        trades=[
            {
                **{
                    k: t[k]
                    for k in ("id", "ticker", "side", "quantity", "price", "costs")
                },
                "quantity_ordered": ordered[t["ticker"]],
            }
            for t in booked
        ],
        prices=source["prices"],
        adjustments=source["adjustments"],
        not_executed=source["not_executed"],
    )


def opportunity(root, rec, rows, now):
    """Cost-of-opportunity inputs of an expired proposal: decision price vs official close."""
    items = []
    for i in rec["basket"]:
        close = price_of(rows.get(i["ticker"]), "close")
        decision = b.dec(rec["decision_prices"][i["ticker"]])
        move = (
            (close - decision) * b.dec(i["quantity"]) * (1 if i["side"] == "BUY" else -1)
            if close
            else None
        )
        items.append(
            {
                **i,
                "decision_price": str(decision),
                "official_close": None if close is None else str(close),
                "move_vs_decision": None if move is None else str(b.money(move)),
            }
        )
    radar.write(
        root / "opportunity.json",
        b.sealed(
            {
                "identity": IDENTITY,
                "proposal_sha256": rec["proposal_sha256"],
                "session": rec["target_date"],
                "recorded_at": now.isoformat(),
                "items": items,
            }
        ),
        immutable=True,
    )


def settle_pending(now=None):
    """Book orders whose official price arrived; expire stale proposals. Never raises.

    Safe to repeat: every step is keyed by a record or by the ledger command of the
    proposal. A transient failure leaves the order pending for the next update.
    """
    out = {"settled": [], "waiting": [], "rejected": [], "expired": [], "errors": []}
    now, cache = now or radar.now(), {}

    def official(session):
        if session not in cache:
            cache[session] = session_rows(session)
        return cache[session]

    with LOCK:
        try:
            roots = list(folders())
        except Exception as e:
            out["errors"].append({"error": f"{type(e).__name__}: {e}"})
            return out
        for root in roots:
            try:
                order = read(root / "order.json")
                if order and not (root / "execution.json").exists():
                    state = settle_one(root, order, official, now)
                    key = {"WAITING": "waiting", "ORDER_REJECTED": "rejected"}.get(
                        state, "settled"
                    )
                    out[key].append(root.name)
                if order or not (root / "result.json").exists():
                    continue
                rec = read(root / "expired.json")
                if rec is None:
                    c, result = (
                        b.check_seal(radar.read(root / f))
                        for f in ("context.json", "result.json")
                    )
                    if (
                        result["status"] != "VALID_PROPOSAL"
                        or not result["trades"]
                        or not appliable(c)
                        or not expired(c["target_date"], now)
                    ):
                        continue
                    try:  # booked under the old rule (reference price on approval): not expired
                        wallet = manual.get({"wallet": c["wallet"]["id"]})["selected"]
                    except manual.Invalid:  # wallet gone: nothing can be booked anyway
                        continue
                    if ledger(wallet, result["sha256"]):
                        continue
                    rec = expire(root, c, result, now)
                    out["expired"].append(root.name)
                if (
                    rec["target_date"] <= now.date().isoformat()
                    and not (root / "opportunity.json").exists()
                ):
                    if rows := official(rec["target_date"]):
                        opportunity(root, rec, rows, now)
            except Exception as e:  # one broken folder never blocks the others
                out["errors"].append(
                    {"proposal": root.name, "error": f"{type(e).__name__}: {e}"}
                )
    return out
