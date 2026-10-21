"""Exact sealed bytes are recoverable across Git line-ending conversions."""

import hashlib
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from restore_frozen_bytes import CANDIDATE, CATALOG, ROOT, restore, restore_file


def test_restore_exact_lf_crlf_and_refuse_content_changes(tmp_path):
    path = tmp_path / "sealed.txt"
    for original, converted in ((b"a\nb\n", b"a\r\nb\r\n"), (b"a\r\nb\r\n", b"a\nb\n")):
        path.write_bytes(converted)
        digest = hashlib.sha256(original).hexdigest()
        restore_file(path, digest)
        assert path.read_bytes() == original
        restore_file(path, digest)  # idempotent
        path.write_bytes(b"different\n")
        with pytest.raises(ValueError, match="sealed_bytes_not_recoverable"):
            restore_file(path, digest)
        assert path.read_bytes() == b"different\n"


def test_build_restores_original_hashes_from_lf_checkout(tmp_path):
    candidate = json.loads((ROOT / CANDIDATE).read_bytes())
    paths = [CANDIDATE, str(Path(CANDIDATE).with_suffix(".sha256")), CATALOG]
    paths += list(candidate["sources_sha256"])
    catalog = json.loads((ROOT / CATALOG).read_bytes())
    for name in paths:
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((ROOT / name).read_bytes().replace(b"\r\n", b"\n"))
    for name in catalog["documents"]:
        # -text preserves captures, including mixed line endings and binary PDFs.
        source = (ROOT / CATALOG).parent / name
        target = (tmp_path / CATALOG).parent / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    restore(tmp_path)
    for name, digest in candidate["sources_sha256"].items():
        assert hashlib.sha256((tmp_path / name).read_bytes()).hexdigest() == digest
    for name, record in catalog["documents"].items():
        assert (
            hashlib.sha256(((tmp_path / CATALOG).parent / name).read_bytes()).hexdigest()
            == record["sha256"]
        )
