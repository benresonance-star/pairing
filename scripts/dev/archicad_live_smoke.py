from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

import requests


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def runtime_state_path() -> Path:
    return repo_root() / "shared" / "examples" / "runtime" / "demo_state.json"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def connector_env(host: str, port: int, project_id: str) -> dict[str, str]:
    env = os.environ.copy()
    env.update(
        {
            "CCP_DATA_SOURCE": "demo",
            "CCP_ARCHICAD_ADAPTER": "live",
            "ARCHICAD_HOST": host,
            "ARCHICAD_PORT": str(port),
            "PROJECT_ID": project_id,
        }
    )
    env.pop("CCP_SCENARIO_ID", None)
    return env


def run_connector(command: str, env: dict[str, str]) -> None:
    subprocess.run(
        [sys.executable, "scripts/dev/connector_cli.py", command],
        cwd=repo_root(),
        env=env,
        check=True,
    )


def get_json(url: str) -> Any:
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return response.json()


def ensure_live_contract(base_url: str) -> tuple[dict[str, Any], dict[str, Any]]:
    product = get_json(f"{base_url}product-info")
    if not isinstance(product, dict):
        raise RuntimeError("product-info must return a JSON object")
    if not isinstance(product.get("product_name"), str):
        raise RuntimeError("product-info.product_name must be a string")

    snapshot = get_json(f"{base_url}snapshot")
    if not isinstance(snapshot, dict):
        raise RuntimeError("snapshot must return a JSON object")
    if not isinstance(snapshot.get("zones"), list):
        raise RuntimeError("snapshot.zones must be an array")
    if not isinstance(snapshot.get("elements"), list):
        raise RuntimeError("snapshot.elements must be an array")

    return product, snapshot


def baseline_scenario_id(state: dict[str, Any]) -> str:
    for scenario in state["scenarios"]:
        if scenario.get("status") == "baseline":
            return str(scenario["id"])
    raise RuntimeError("Runtime state does not contain a baseline scenario")


def find_zone_id(state: dict[str, Any], target_guid: str) -> str:
    for zone in state["zones"]:
        if zone.get("archicad_guid") == target_guid:
            return str(zone["id"])
    raise RuntimeError(f"Inbound sync did not create target zone {target_guid}")


def find_operational_row(state: dict[str, Any], scenario_id: str, zone_id: str) -> dict[str, Any]:
    for row in state["operational_state"]:
        if (
            row.get("scenario_id") == scenario_id
            and row.get("object_ref_type") == "zone"
            and row.get("object_ref_id") == zone_id
        ):
            return row
    raise RuntimeError("Inbound sync did not create operational state for target zone")


def queue_construction_state_change(target_guid: str) -> tuple[str, str]:
    state = read_json(runtime_state_path())
    scenario_id = baseline_scenario_id(state)
    zone_id = find_zone_id(state, target_guid)
    row = find_operational_row(state, scenario_id, zone_id)
    current_state = row.get("construction_state")
    next_state = "blocked" if current_state != "blocked" else "ready"
    change_set_id = str(uuid.uuid4())

    state["change_sets"].append(
        {
            "id": change_set_id,
            "project_id": state["project"]["id"],
            "scenario_id": scenario_id,
            "title": "Live bridge smoke construction-state write",
            "description": "Created by archicad_live_smoke.py",
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
            "object_ref_id": zone_id,
            "field_name": "construction_state",
            "old_value_json": current_state,
            "new_value_json": next_state,
            "created_at": "2026-01-01T00:00:00+00:00",
        }
    )
    write_json(runtime_state_path(), state)
    return change_set_id, next_state


def find_zone_in_snapshot(snapshot: dict[str, Any], target_guid: str) -> dict[str, Any]:
    for zone in snapshot.get("zones", []):
        if str(zone.get("archicad_guid")) == target_guid:
            return zone
    raise RuntimeError(f"Snapshot does not contain target zone {target_guid}")


def verify_runtime_ingestion(
    *,
    target_guid: str,
    expected_package_id: str | None,
    expected_construction_state: str | None,
    allow_empty_values: bool,
) -> dict[str, Any]:
    state = read_json(runtime_state_path())
    scenario_id = baseline_scenario_id(state)
    zone = next((item for item in state["zones"] if item.get("archicad_guid") == target_guid), None)
    if zone is None:
        raise RuntimeError(f"Inbound runtime state does not contain zone {target_guid}")
    row = find_operational_row(state, scenario_id, str(zone["id"]))
    actual_package_id = row.get("package_id")
    actual_construction_state = row.get("construction_state")

    if not allow_empty_values and not (expected_package_id or expected_construction_state):
        raise RuntimeError(
            "Target zone is missing both package_id and construction_state in snapshot. "
            "Populate CCP_Operational values or rerun with --allow-empty-values."
        )

    package_match = actual_package_id == expected_package_id
    state_match = actual_construction_state == expected_construction_state
    if not package_match or not state_match:
        raise RuntimeError(
            "Runtime ingestion mismatch for target zone. "
            f"expected(package_id={expected_package_id}, construction_state={expected_construction_state}) "
            f"actual(package_id={actual_package_id}, construction_state={actual_construction_state})"
        )

    return {
        "target_guid": target_guid,
        "expected_package_id": expected_package_id,
        "actual_package_id": actual_package_id,
        "expected_construction_state": expected_construction_state,
        "actual_construction_state": actual_construction_state,
        "matched": package_match and state_match,
    }


def outbound_result(change_set_id: str) -> tuple[str, list[str]]:
    state = read_json(runtime_state_path())
    change_set = next((item for item in state["change_sets"] if item["id"] == change_set_id), None)
    if change_set is None:
        raise RuntimeError(f"Change set not found after outbound run: {change_set_id}")
    errors = [str(error) for error in change_set.get("sync_errors", [])]
    return str(change_set["status"]), errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smoke test for the live Archicad adapter contract")
    parser.add_argument("--host", default=os.environ.get("ARCHICAD_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("ARCHICAD_PORT", "19724")))
    parser.add_argument("--project-id", default=os.environ.get("PROJECT_ID", "11111111-1111-1111-1111-111111111111"))
    parser.add_argument(
        "--validate-write",
        action="store_true",
        help="Queue and execute one outbound construction-state write for a known zone GUID",
    )
    parser.add_argument(
        "--target-guid",
        help="Zone archicad_guid used for --validate-write; must exist in inbound snapshot",
    )
    parser.add_argument(
        "--expect-write-status",
        choices=["synced", "sync_failed"],
        help="When set with --validate-write, fail if outbound change-set status does not match",
    )
    parser.add_argument(
        "--verify-ingestion",
        action="store_true",
        help="Verify target zone package/state values are ingested into runtime operational_state after inbound",
    )
    parser.add_argument(
        "--allow-empty-values",
        action="store_true",
        help="Allow ingestion verification to pass even when both source values are empty",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    base_url = f"http://{args.host}:{args.port}/api/v1/"

    product, snapshot = ensure_live_contract(base_url)
    env = connector_env(args.host, args.port, args.project_id)
    run_connector("reset-runtime", env)
    run_connector("inbound", env)

    result: dict[str, Any] = {
        "status": "passed",
        "adapter": base_url,
        "product_name": product.get("product_name"),
        "zones_reported": len(snapshot.get("zones", [])),
        "elements_reported": len(snapshot.get("elements", [])),
        "target_guid": args.target_guid,
        "write_validation": "skipped",
    }

    if args.verify_ingestion:
        target_guid = args.target_guid
        if not target_guid:
            zones = snapshot.get("zones", [])
            if not zones:
                raise RuntimeError("No zones available in snapshot for ingestion verification")
            target_guid = str(zones[0].get("archicad_guid") or "")
        if not target_guid:
            raise RuntimeError("Unable to determine target_guid for ingestion verification")

        snapshot_zone = find_zone_in_snapshot(snapshot, target_guid)
        source_operational = snapshot_zone.get("ccp_operational") or {}
        if not isinstance(source_operational, dict):
            source_operational = {}

        ingestion_result = verify_runtime_ingestion(
            target_guid=target_guid,
            expected_package_id=source_operational.get("package_id"),
            expected_construction_state=source_operational.get("construction_state"),
            allow_empty_values=args.allow_empty_values,
        )
        result["target_guid"] = target_guid
        result["ingestion_validation"] = {"status": "passed", **ingestion_result}

    if args.validate_write:
        if not args.target_guid:
            raise RuntimeError("--target-guid is required when --validate-write is enabled")
        change_set_id, expected_state = queue_construction_state_change(args.target_guid)
        run_connector("outbound", env)
        status, errors = outbound_result(change_set_id)
        result["change_set_id"] = change_set_id
        result["target_guid"] = args.target_guid
        result["requested_state"] = expected_state
        result["write_validation"] = status
        result["sync_errors"] = errors
        if args.expect_write_status and status != args.expect_write_status:
            raise RuntimeError(
                f"Expected write status '{args.expect_write_status}', got '{status}' "
                f"for change_set_id={change_set_id}"
            )

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
