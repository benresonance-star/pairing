from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


@lru_cache(maxsize=1)
def load_vocabularies() -> dict[str, Any]:
    vocab_path = _repo_root() / "shared" / "contracts" / "enums" / "vocabularies.json"
    return json.loads(vocab_path.read_text(encoding="utf-8"))


def object_ref_types() -> set[str]:
    return set(load_vocabularies()["objectRefTypes"])


def sync_run_statuses() -> set[str]:
    return set(load_vocabularies()["syncRunStatuses"])


def construction_states() -> set[str]:
    return set(load_vocabularies()["constructionStates"])


def unit_values() -> set[str]:
    return set(load_vocabularies()["unitValues"])


def operational_writable_fields() -> set[str]:
    return set(load_vocabularies()["operationalWritableFields"])


def archicad_writable_fields() -> set[str]:
    return set(load_vocabularies()["archicadWritableFields"])


def first_slice_element_types() -> set[str]:
    return set(load_vocabularies()["firstSliceElementTypes"])
