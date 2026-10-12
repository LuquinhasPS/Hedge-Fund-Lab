"""Offline: B3-corroborated bonificação/split normalization for Radar inputs."""

import sys
import zipfile
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts")]
import multiasset_radar as radar  # noqa: E402
import radar_corporate_events as rce  # noqa: E402

from src.experiments.h2_evaluation_offline import no_network  # noqa: E402

DAY = pd.Timestamp("2026-10-09")
BARS = radar.synthetic_bars(DAY)  # 260 real B3 sessions, 2025 and 2026
EX = BARS.index[150]  # a session inside 2026


def cotahist(folder, dismes):
    paths = {}
    for year in (2025, 2026):
        body = "00HEADER\n"
        for day, row in BARS[BARS.index.year == year].iterrows():
            cents = lambda v: f"{round(v * 100):013d}"  # noqa: E731
            text = "01" + day.strftime("%Y%m%d") + "02" + "ITUB4".ljust(12) + "010"
            text = text.ljust(39) + "PN  EB  N1".ljust(10)
            text = text.ljust(56) + "".join(
                cents(row[k]) for k in ("abertura", "maxima", "minima", "fechamento")
            )
            text = text.ljust(108) + cents(row["fechamento"])
            text = text.ljust(152) + f"{int(row['volume']):018d}"
            body += text.ljust(242) + dismes(day) + "\n"
        paths[year] = folder / f"COTAHIST_A{year}.ZIP"
        with zipfile.ZipFile(paths[year], "w") as archive:
            archive.writestr(f"COTAHIST_A{year}.TXT", body.encode("latin-1"))
    return paths


def yahoo(split_at=EX, booked_at=EX, ratio=1.03, dividend=0.98):
    """Yahoo convention: Close back-adjusted for splits; Adj Close also for dividends."""
    close = BARS["fechamento"].round(2).copy()
    close[close.index < split_at] /= ratio
    splits = pd.Series(0.0, index=BARS.index)
    if booked_at is not None:
        splits[booked_at] = ratio
    return lambda *a, **k: pd.DataFrame(
        {
            "Close": close,
            "Adj Close": close * dividend,
            "Volume": 1e6,
            "Stock Splits": splits,
        }
    )


def extractor(tmp_path, dismes=lambda day: "363" if day >= EX else "362"):
    e = rce.CorporateEventExtractor(cache_dir=str(tmp_path))
    e.paths = cotahist(tmp_path, dismes)
    return e


def download(e, monkeypatch, feed):
    monkeypatch.setattr(rce.yf, "download", feed)
    with no_network():
        return e.download("ITUB4.SA", str(BARS.index[0].date()), str(DAY.date()))


def test_corroborated_bonus_restores_nominal_close_and_total_return(
    tmp_path, monkeypatch
):
    frame = download(extractor(tmp_path), monkeypatch, yahoo())
    raw = BARS["fechamento"].round(2)
    expected = raw * 0.98
    expected[expected.index < EX] /= 1.03  # continuous, split-adjusted total return
    assert frame["fechamento"].to_numpy() == pytest.approx(expected.to_numpy(), rel=1e-12)
    assert (frame["volume"] == 1e6).all()  # official quantity is never adjusted
    radar.technical_input(frame)  # Radar V4 contract still holds


def test_original_extractor_still_blocks_the_same_data(tmp_path, monkeypatch):
    original = radar.RadarExtractor(cache_dir=str(tmp_path))
    original.paths = cotahist(tmp_path, lambda day: "363" if day >= EX else "362")
    monkeypatch.setattr(rce.yf, "download", yahoo())
    with no_network(), pytest.raises(ValueError, match="split-like mismatch"):
        original.download("ITUB4.SA", str(BARS.index[0].date()), str(DAY.date()))


def test_split_without_b3_distribution_change_is_refused(tmp_path, monkeypatch):
    e = extractor(tmp_path, dismes=lambda day: "362")
    with pytest.raises(ValueError, match="not corroborated by B3 DISMES"):
        download(e, monkeypatch, yahoo())


def test_misdated_event_fails_at_the_boundary(tmp_path, monkeypatch):
    # Yahoo books the event on EX but its Close only steps one session later.
    late = BARS.index[151]
    with pytest.raises(ValueError, match="boundary mismatch"):
        download(extractor(tmp_path), monkeypatch, yahoo(split_at=late, booked_at=EX))


def test_unexplained_mismatch_keeps_the_original_block(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="split-like mismatch"):
        download(extractor(tmp_path), monkeypatch, yahoo(booked_at=None))


def test_no_event_is_identical_to_original_and_prepare_keeps_radar_identity(
    tmp_path, monkeypatch
):
    feed = yahoo(split_at=BARS.index[0], booked_at=None)
    e = extractor(tmp_path / "cache")
    original = radar.RadarExtractor(cache_dir=str(tmp_path / "cache"))
    original.paths = e.paths
    monkeypatch.setattr(rce.yf, "download", feed)
    with no_network():
        assert e.download("ITUB4.SA", "2025-07-16", "2026-10-09").equals(
            original.download("ITUB4.SA", "2025-07-16", "2026-10-09")
        )

    root = tmp_path / "radar"
    e = extractor(tmp_path / "cache")
    monkeypatch.setattr(rce.yf, "download", yahoo())
    with no_network():
        result = radar.prepare(
            ["ITUB4"], root, end=str(DAY.date()), mode="live", extractor=e
        )
    assert result[0]["status"] == "PREPARED", result
    data = radar.checked_input(root, "ITUB4", str(DAY.date()))
    assert data["manifest"] == radar.manifest("live")  # same family for the Global PM
    events = data["source"]["corporate_events"]["events"]
    assert [(x["ex_date"], x["b3_dismes"]) for x in events] == [
        (str(EX.date()), ["362", "363"])
    ]
    assert data["raw_bar"]["fechamento"] == BARS["fechamento"].round(2).iloc[-1]
