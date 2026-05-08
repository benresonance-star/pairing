from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import requests


HOST = "127.0.0.1"
PORT = 19723
TARGET_GUID = "ZONE-1001"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def runtime_state_path() -> Path:
    return repo_root() / "shared" / "examples" / "runtime" / "demo_state.json"


def writes_path() -> Path:
    return repo_root() / "shared" / "examples" / "runtime" / "mock_archicad_writes.json"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def connector_env() -> dict[str, str]:
    env = os.environ.copy()
    env.update(
        {
            "CCP_DATA_SOURCE": "demo",
            "CCP_ARCHICAD_ADAPTER": "live",
            "ARCHICAD_HOST": HOST,
            "ARCHICAD_PORT": str(PORT),
            "PROJECT_ID": "11111111-1111-1111-1111-111111111111",
        }
    )
    env.pop("CCP_SCENARIO_ID", None)
    return env


def run_connector(command: str) -> None:
    subprocess.run(
        [sys.executable, "scripts/dev/connector_cli.py", command],
        cwd=repo_root(),
        env=connector_env(),
        check=True,
    )


def start_mock_server() -> subprocess.Popen[str]:
    process = subprocess.Popen(
        [
            sys.executable,
            "scripts/dev/mock_archicad_adapter.py",
            "--host",
            HOST,
            "--port",
            str(PORT),
            "--writes-path",
            str(writes_path()),
        ],
        cwd=repo_root(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    assert process.stdout is not None
    line = process.stdout.readline()
    if process.poll() is not None:
        raise RuntimeError(f"Mock Archicad adapter exited early: {line}")
    status = json.loads(line)
    if status.get("status") != "ready":
        raise RuntimeError(f"Mock Archicad adapter did not become ready: {line}")
    return process


def wait_for_mock_server() -> None:
    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            response = requests.get(f"http://{HOST}:{PORT}/api/v1/product-info", timeout=1)
            if response.status_code == 200:
                return
        except requests.RequestException:
            time.sleep(0.1)
    raise RuntimeError("Mock Archicad adapter did not respond to product-info")


def baseline_scenario_id(state: dict[str, Any]) -> str:
    for scenario in state["scenarios"]:
        if scenario.get("status") == "baseline":
            return str(scenario["id"])
    raise RuntimeError("Runtime state does not contain a baseline scenario")


def find_target_zone(state: dict[str, Any]) -> dict[str, Any]:
    for zone in state["zones"]:
        if zone.get("archicad_guid") == TARGET_GUID:
            return zone
    raise RuntimeError(f"Inbound sync did not create target zone {TARGET_GUID}")


def find_operational_row(state: dict[str, Any], scenario_id: str, zone_id: str) -> dict[str, Any]:
    for row in state["operational_state"]:
        if (
            row.get("scenario_id") == scenario_id
            and row.get("object_ref_type") == "zone"
            and row.get("object_ref_id") == zone_id
        ):
            return row
    raise RuntimeError("Inbound sync did not create operational state for target zone")


def queue_construction_state_change() -> tuple[str, str]:
    state = read_json(runtime_state_path())
    scenario_id = baseline_scenario_id(state)
    zone = find_target_zone(state)
    row = find_operational_row(state, scenario_id, str(zone["id"]))
    current_state = row.get("construction_state")
    next_state = "blocked" if current_state != "blocked" else "ready"
    change_set_id = str(uuid.uuid4())

    state["change_sets"].append(
        {
            "id": change_set_id,
            "project_id": state["project"]["id"],
            "scenario_id": scenario_id,
            "title": "Mock live adapter construction-state write",
            "description": "Created by mock Archicad adapter smoke check",
            "status": "queued_for_sync",
            "created_at": "2026-01-01T00:00:00+00:00",
            "sync_errors": [],
        }
    )
    state["change_set_items"].append(
        {
            "id": str(uuid.uuid4()),
            "change_set_id": change_set_id,
            "object_ref_type": "zone",
            "object_ref_id": zone["id"],
            "field_name": "construction_state",
            "old_value_json": current_state,
            "new_value_json": next_state,
            "created_at": "2026-01-01T00:00:00+00:00",
        }
    )
    write_json(runtime_state_path(), state)
    return change_set_id, next_state


def verify_result(change_set_id: str, expected_state: str) -> None:
    state = read_json(runtime_state_path())
    change_set = next(item for item in state["change_sets"] if item["id"] == change_set_id)
    if change_set["status"] != "synced":
        raise RuntimeError(f"Expected change set to be synced, got {change_set['status']}")

    runtime_write = next(item for item in state["archicad_writes"] if item["change_set_id"] == change_set_id)
    if runtime_write["field_name"] != "CCP_ConstructionState":
        raise RuntimeError("Connector did not record the expected CCP_ConstructionState write")
    if runtime_write["field_value"] != expected_state:
        raise RuntimeError("Connector recorded an unexpected construction state")
    if runtime_write["dry_run"] is not False:
        raise RuntimeError("Mock live adapter smoke must execute non-dry-run outbound")

    mock_writes = read_json(writes_path())
    mock_write = next(item for item in mock_writes if item["archicad_guid"] == TARGET_GUID)
    if mock_write["field_name"] != "CCP_ConstructionState" or mock_write["field_value"] != expected_state:
        raise RuntimeError("Mock adapter did not receive the expected property write")


def main() -> None:
    process = start_mock_server()
    try:
        wait_for_mock_server()
        run_connector("reset-runtime")
        run_connector("inbound")
        change_set_id, expected_state = queue_construction_state_change()
        run_connector("outbound")
        verify_result(change_set_id, expected_state)
        print(
            json.dumps(
                {
                    "status": "passed",
                    "adapter": f"http://{HOST}:{PORT}/api/v1/",
                    "target_guid": TARGET_GUID,
                    "change_set_id": change_set_id,
                    "written_state": expected_state,
                    "mock_writes_path": str(writes_path()),
                },
                indent=2,
            )
        )
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


if __name__ == "__main__":
    main()
