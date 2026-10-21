"""Restore Git-converted line endings only when the original sealed SHA matches."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = "docs/evidence/h2_v6_evaluation/system_freeze_candidate.json"
CATALOG = "docs/evidence/pilot_market_data_2026/observed_v1/sources.json"


def restore_file(path, expected):
    raw = path.read_bytes()
    lf = raw.replace(b"\r\n", b"\n")
    for candidate in (raw, lf, lf.replace(b"\n", b"\r\n")):
        if hashlib.sha256(candidate).hexdigest() == expected:
            if candidate != raw:
                path.write_bytes(candidate)
            return
    raise ValueError(f"sealed_bytes_not_recoverable: {path}")


def restore(root=ROOT):
    candidate = root / CANDIDATE
    restore_file(candidate, candidate.with_suffix(".sha256").read_text().strip())
    for name, expected in json.loads(candidate.read_bytes())["sources_sha256"].items():
        restore_file(root / name, expected)
    import pilot_observed_data as observed

    catalog = root / CATALOG
    restore_file(catalog, observed.EVIDENCE_SHA)
    for name, record in json.loads(catalog.read_bytes())["documents"].items():
        restore_file(catalog.parent / name, record["sha256"])


if __name__ == "__main__":
    restore()
    print("Original frozen sources and observed evidence restored; seals unchanged.")
