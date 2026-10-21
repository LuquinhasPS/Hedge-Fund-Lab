"""DP-31: rule backtest over the local base. Deterministic, read-only, no network.

Historical result, not a forecast. Prices are RAW B3 close x Yahoo factor (dividends
reinvested). Does not touch wallets, ledgers or the pilot.
"""

import sys
from datetime import date
from pathlib import Path

import pandas as pd

sys.path[:0] = [
    str(Path(__file__).resolve().parents[1]),
    str(Path(__file__).resolve().parents[1] / "scripts"),
]
import market_base_api as mb  # noqa: E402
import reference_rates_api as rates  # noqa: E402

from src.backtesting import metrics as m  # noqa: E402

TICKERS = ("PETR4", "VALE3", "ITUB4", "WEGE3", "BBAS3")
REBALANCE = ("none", "monthly", "quarterly", "annual")
KEYS = {"tickers", "weights", "start", "end", "rebalance", "cost_bps", "capital"}
MAX_POINTS = 5000


class Invalid(ValueError):
    pass


def _closed():
    return mb.radar.last_closed(mb.radar.now())


def _series(ticker):
    return mb.series(ticker)["rows"]


def _refs(first, last):
    """(ibov {date: close}, cdi [{date,index}], cdi_error) from the local base only."""
    ibov = {r["date"]: r["close"] for r in mb.benchmark(first)["rows"]}
    try:
        stored = rates.daily()
        cdi = rates.cdi(first, last, stored)["rows"] if stored else []
        return ibov, cdi, None
    except ValueError as e:
        return ibov, [], str(e)


def _num(q, key, default, lo, hi):
    try:
        v = float(q.get(key, default))
    except ValueError:
        raise Invalid(f"{key} deve ser um número") from None
    if not lo <= v <= hi:  # also rejects nan
        raise Invalid(f"{key} deve estar entre {lo} e {hi}")
    return v


def _day(q, key):
    s = q.get(key, "")
    try:
        if len(s) != 10:
            raise ValueError
        return date.fromisoformat(s).isoformat()
    except ValueError:
        raise Invalid(f"{key} deve ser uma data ISO (AAAA-MM-DD)") from None


def parse(q, closed):
    if set(q) - KEYS:
        raise Invalid("parâmetro desconhecido: " + ", ".join(sorted(set(q) - KEYS)))
    tickers = [t for t in q.get("tickers", "").split(",") if t]
    if not tickers or len(set(tickers)) != len(tickers):
        raise Invalid("tickers: informe ao menos um ativo, sem repetição")
    if bad := [t for t in tickers if t not in TICKERS]:
        raise Invalid(f"ativo fora do universo: {bad[0]}")
    try:
        w = [float(x) for x in q["weights"].split(",")] if "weights" in q else None
    except ValueError:
        raise Invalid("weights deve ser uma lista de números") from None
    w = w or [1 / len(tickers)] * len(tickers)
    if len(w) != len(tickers) or any(not 0 < x <= 1 for x in w):
        raise Invalid("weights: um peso entre 0 e 1 para cada ativo")
    if abs(sum(w) - 1) > 1e-6:
        raise Invalid("weights deve somar 1 (100%)")
    start, end = _day(q, "start"), _day(q, "end")
    if end > closed:
        raise Invalid(f"end não pode passar do último pregão fechado ({closed})")
    if start >= end:
        raise Invalid("start deve ser anterior a end")
    rebalance = q.get("rebalance", "none")
    if rebalance not in REBALANCE:
        raise Invalid("rebalance deve ser none, monthly, quarterly ou annual")
    return {
        "tickers": tickers,
        "weights": w,
        "start": start,
        "end": end,
        "rebalance": rebalance,
        "cost_bps": _num(q, "cost_bps", 0, 0, 200),
        "capital": _num(q, "capital", 100000, 1, 1e12),
    }


def _period(day, kind):
    y, mo = day[:4], int(day[5:7])
    return {"monthly": day[:7], "quarterly": f"{y}Q{(mo - 1) // 3}", "annual": y}[kind]


def simulate(prices, weights, rebalance, cost_bps, capital):
    """prices: {ticker: {date: price}}; sessions = union of dates. Returns the run dict.

    ponytail: fractional units, no lots; rebalance cost = cost_bps x |trade| measured at
    pre-cost value and taken pro rata from the new targets (no fixed-point solve). The
    first session's equity is the capital before the initial cost, so that cost shows in
    day 2's return. Upgrade: iterate the target value to solve the cost exactly.
    """
    names = list(prices)
    days = sorted({d for p in prices.values() for d in p})
    last, stale = {}, dict.fromkeys(names, 0)
    c, units, equity = cost_bps / 1e4, {}, []
    costs = traded = 0.0
    rebalances, prev = 0, None
    for d in days:
        for t in names:
            if d in prices[t]:
                last[t] = prices[t][d]
            else:
                stale[t] += 1
        value = capital if prev is None else sum(units[t] * last[t] for t in names)
        if prev is None or (
            rebalance != "none" and _period(d, rebalance) != _period(prev, rebalance)
        ):
            trade = sum(
                abs(w * value - units.get(t, 0) * last[t])
                for t, w in zip(names, weights, strict=True)
            )
            fee = c * trade
            costs += fee
            units = {
                t: w * (value - fee) / last[t]
                for t, w in zip(names, weights, strict=True)
            }
            if prev is not None:
                traded += trade
                rebalances += 1
                value -= fee
        equity.append(value)
        prev = d
    return {
        "sessions": days,
        "equity": equity,
        "stale_days": stale,
        "rebalances": rebalances,
        "total_costs": costs,
        "turnover": traded / (sum(equity) / len(equity)),
    }


def _stats(values, days, rf, capital=None):
    s = pd.Series(values, index=pd.to_datetime(days))
    ret, dd = s.pct_change().dropna(), m.drawdown_series(s)
    trough = dd.idxmin()
    return {
        "total_return": values[-1] / (capital or values[0]) - 1,
        "annualized_return": m.annualized_return(s),
        "annualized_volatility": m.annualized_volatility(ret),
        "max_drawdown": float(dd.min()),
        "max_drawdown_peak": str(s[:trough].idxmax().date()),
        "max_drawdown_trough": str(trough.date()),
        "sharpe": None if rf is None else m.sharpe_ratio(ret, rf=rf),
    }


def _ffill(rows, days):
    """value per session carrying the last published one; None before the first."""
    out, i, cur, rows = [], 0, None, sorted(rows)
    for d in days:
        while i < len(rows) and rows[i][0] <= d:
            cur = rows[i][1]
            i += 1
        out.append(cur)
    return out


def run(p, rows_by_ticker, closed):
    prices, notes = {}, []
    for t in p["tickers"]:
        ok = {
            r["date"]: r["adjusted_close"]
            for r in rows_by_ticker[t]
            if r["adjusted_close"] and not r["conflict"]
        }
        if not ok:
            raise Invalid(f"{t}: sem preço ajustado na base local")
        if min(ok) > p["start"]:
            raise Invalid(
                f"{t} só tem preço ajustado desde {min(ok)}; escolha start a partir dessa data"
            )
        prices[t] = ok
    end = min(p["end"], *(max(v) for v in prices.values()))
    if end < p["end"]:
        notes.append(
            f"Fim ajustado para {end}: último preço ajustado comum da base local"
        )
    days0 = sorted({d for ok in prices.values() for d in ok if p["start"] <= d <= end})
    if len(days0) < 3:
        raise Invalid("período com menos de 3 pregões na base local")
    # a ticker with no trade on the first session starts from its latest earlier price
    win = {
        t: {d: v for d, v in ok.items() if days0[0] <= d <= end}
        for t, ok in prices.items()
    }
    for t, ok in prices.items():
        win[t].setdefault(days0[0], ok[max(d for d in ok if d <= days0[0])])
    sim = simulate(win, p["weights"], p["rebalance"], p["cost_bps"], p["capital"])
    days, eq = sim["sessions"], sim["equity"]
    ibov_map, cdi_rows, cdi_err = _refs(days[0], days[-1])
    ibov = _ffill(ibov_map.items(), days)
    ibov = [x / ibov[0] for x in ibov] if ibov_map.get(days[0]) else None
    cdi = (
        _ffill([(r["date"], r["index"]) for r in cdi_rows], days)
        if len(cdi_rows) > 1
        else None
    )
    unavailable = {}
    if not ibov:
        unavailable["ibov"] = "Ibovespa indisponível na base local para o primeiro pregão"
    if not cdi:
        unavailable["cdi"] = cdi_err or "CDI indisponível na base local para o período"
    rf = m.annualized_return(pd.Series(cdi, index=pd.to_datetime(days))) if cdi else None
    metrics = {
        "strategy": {
            **_stats(eq, days, rf, p["capital"]),
            "rebalances": sim["rebalances"],
            "total_costs": sim["total_costs"],
            "turnover": sim["turnover"],
        },
        "ibov": _stats(ibov, days, rf) if ibov else None,
        "cdi": _stats(cdi, days, None) if cdi else None,
        "unavailable": unavailable,
    }
    keep = range(len(days))
    if (
        len(days) > MAX_POINTS
    ):  # chart only: last session of each ISO week; metrics stay daily
        wk = [date.fromisoformat(d).isocalendar()[:2] for d in days]
        keep = [i for i in keep if i == len(days) - 1 or wk[i] != wk[i + 1]]
        notes.append(
            "Mais de 5000 pregões: o gráfico usa pontos semanais; as métricas usam dados diários"
        )

    def pick(xs):
        return xs and [xs[i] for i in keep]

    return {
        "params": {**p, "end": end, "requested_end": p["end"], "last_closed": closed},
        "sessions": pick(days),
        "strategy": pick(eq),
        "ibov": pick(ibov),
        "cdi": pick(cdi),
        "metrics": metrics,
        "stale_days": sim["stale_days"],
        "data_notes": [
            "Preços ajustados por proventos (Yahoo) sobre fechamento oficial B3",
            "Resultado histórico, não previsão; não altera carteiras nem o piloto",
            "Sharpe: excesso sobre o CDI anualizado do período (taxa livre de risco constante), 252 pregões/ano",
            "Retorno da estratégia medido sobre o capital inicial; o custo inicial aparece no segundo pregão",
            *notes,
        ],
        "read_only": True,
    }


def get(query):
    closed = _closed()
    p = parse(query, closed)
    return run(p, {t: _series(t) for t in p["tickers"]}, closed)
