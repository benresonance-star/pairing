from __future__ import annotations

import json
import uuid
from pathlib import Path

from connector.config import ConnectorConfig
from connector.sync_engine import SyncEngine
from connector.supabase_client import DemoSupabaseClient


def build_config(tmp_path: Path) -> ConnectorConfig:
    repo_root = Path(__file__).resolve().parents[3]
    runtime_dir = tmp_path / "runtime"
    return ConnectorConfig(
        repo_root=repo_root,
        project_id="11111111-1111-1111-1111-111111111111",
        sample_snapshot_path=repo_root / "shared" / "examples" / "sample_archicad_snapshot.json",
        seed_state_path=repo_root / "shared" / "examples" / "demo_state.seed.json",
        runtime_state_path=runtime_dir / "demo_state.json",
        connector_state_path=runtime_dir / "connector_state.json",
        dry_run=False,
    )


def test_inbound_sync_populates_zones_and_elements(tmp_path: Path) -> None:
    engine = SyncEngine(build_config(tmp_path))

    summary = engine.run_inbound()
    state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))

    assert summary.status == "completed"
    assert summary.objects_read == 4
    assert len(state["zones"]) == 4
    assert len(state["model_objects"]) == 2
    assert len(state["operational_state"]) == 4


def test_inbound_sync_is_idempotent_for_records(tmp_path: Path) -> None:
    engine = SyncEngine(build_config(tmp_path))

    engine.run_inbound()
    engine.run_inbound()
    state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))

    assert len(state["zones"]) == 4
    assert len(state["model_objects"]) == 2
    assert len(state["operational_state"]) == 4


def test_outbound_sync_records_ccp_package_write(tmp_path: Path) -> None:
    engine = SyncEngine(build_config(tmp_path))
    engine.run_inbound()

    state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))
    target_zone = state["zones"][0]
    change_set_id = str(uuid.uuid4())
    state["change_sets"].append(
        {
            "id": change_set_id,
            "project_id": state["project"]["id"],
            "scenario_id": state["scenarios"][0]["id"],
            "title": "Assign package to first zone",
            "status": "queued_for_sync",
        }
    )
    state["change_set_items"].append(
        {
            "id": str(uuid.uuid4()),
            "change_set_id": change_set_id,
            "object_ref_type": "zone",
            "object_ref_id": target_zone["id"],
            "field_name": "package_id",
            "old_value_json": None,
            "new_value_json": "PKG-COMMISSIONING",
        }
    )
    engine.config.runtime_state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    summary = engine.run_outbound()
    next_state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))

    assert summary.objects_written == 1
    assert next_state["change_sets"][0]["status"] == "synced"
    assert next_state["archicad_writes"][0]["field_name"] == "CCP_PackageID"
    assert next_state["operational_state"][0]["package_id"] == "PKG-COMMISSIONING"


def test_outbound_sync_marks_invalid_package_as_failed(tmp_path: Path) -> None:
    engine = SyncEngine(build_config(tmp_path))
    engine.run_inbound()

    state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))
    target_zone = state["zones"][0]
    change_set_id = str(uuid.uuid4())
    state["change_sets"].append(
        {
            "id": change_set_id,
            "project_id": state["project"]["id"],
            "scenario_id": state["scenarios"][0]["id"],
            "title": "Assign invalid package to first zone",
            "status": "queued_for_sync",
        }
    )
    state["change_set_items"].append(
        {
            "id": str(uuid.uuid4()),
            "change_set_id": change_set_id,
            "object_ref_type": "zone",
            "object_ref_id": target_zone["id"],
            "field_name": "package_id",
            "old_value_json": None,
            "new_value_json": "PKG-INVALID",
        }
    )
    engine.config.runtime_state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    summary = engine.run_outbound()
    next_state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))

    assert summary.status == "completed_with_errors"
    assert next_state["change_sets"][0]["status"] == "sync_failed"
    assert next_state["archicad_writes"] == []


def test_outbound_sync_handles_partial_failure(tmp_path: Path) -> None:
    engine = SyncEngine(build_config(tmp_path))
    engine.run_inbound()

    state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))
    first_zone = state["zones"][0]
    first_object = state["model_objects"][0]
    change_set_id = str(uuid.uuid4())
    state["change_sets"].append(
        {
            "id": change_set_id,
            "project_id": state["project"]["id"],
            "scenario_id": state["scenarios"][0]["id"],
            "title": "Mixed validity package assignment",
            "status": "queued_for_sync",
        }
    )
    state["change_set_items"].extend(
        [
            {
                "id": str(uuid.uuid4()),
                "change_set_id": change_set_id,
                "object_ref_type": "zone",
                "object_ref_id": first_zone["id"],
                "field_name": "package_id",
                "old_value_json": None,
                "new_value_json": "PKG-COMMISSIONING",
            },
            {
                "id": str(uuid.uuid4()),
                "change_set_id": change_set_id,
                "object_ref_type": "model_object",
                "object_ref_id": first_object["id"],
                "field_name": "package_id",
                "old_value_json": None,
                "new_value_json": "PKG-INVALID",
            },
        ]
    )
    engine.config.runtime_state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    summary = engine.run_outbound()
    next_state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))

    assert summary.status == "completed_with_errors"
    assert summary.objects_written == 1
    assert next_state["change_sets"][0]["status"] == "sync_failed"
    assert len(next_state["archicad_writes"]) == 1
    assert next_state["operational_state"][0]["package_id"] == "PKG-COMMISSIONING"


def test_runtime_state_can_be_reset_from_seed(tmp_path: Path) -> None:
    client = DemoSupabaseClient(
        seed_state_path=build_config(tmp_path).seed_state_path,
        runtime_state_path=build_config(tmp_path).runtime_state_path,
    )
    client.seed_runtime_state()
    state = client.load_state()
    state["change_sets"].append({"id": str(uuid.uuid4()), "status": "draft"})
    client.save_state(state)

    client.reset_runtime_state()
    reset_state = client.load_state()

    assert reset_state["change_sets"] == []


def test_inbound_sync_can_target_configured_scenario(tmp_path: Path) -> None:
    config = build_config(tmp_path)
    seed_state = json.loads(config.seed_state_path.read_text(encoding="utf-8"))
    config.scenario_id = str(seed_state["scenarios"][1]["id"])
    engine = SyncEngine(config)

    summary = engine.run_inbound()
    state = json.loads(engine.config.runtime_state_path.read_text(encoding="utf-8"))

    targeted_records = [record for record in state["operational_state"] if record["scenario_id"] == config.scenario_id]

    assert summary.status == "completed"
    assert len(targeted_records) == 4
