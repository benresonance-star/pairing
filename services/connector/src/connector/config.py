from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(slots=True)
class ConnectorConfig:
    repo_root: Path
    project_id: str
    sample_snapshot_path: Path
    seed_state_path: Path
    runtime_state_path: Path
    connector_state_path: Path
    data_source: str = "demo"
    scenario_id: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    dry_run: bool = False
    enable_inbound_sync: bool = True
    enable_outbound_sync: bool = True


def load_config(dry_run: bool = False) -> ConnectorConfig:
    repo_root = Path(__file__).resolve().parents[4]
    runtime_dir = repo_root / "shared" / "examples" / "runtime"
    data_source = os.environ.get("CCP_DATA_SOURCE", "demo").strip().lower() or "demo"
    project_id = os.environ.get("PROJECT_ID", "11111111-1111-1111-1111-111111111111")
    scenario_id = os.environ.get("CCP_SCENARIO_ID")
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if data_source == "supabase":
        if not supabase_url:
            raise ValueError("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required in Supabase mode")
        if not supabase_service_role_key:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required in Supabase mode")

    return ConnectorConfig(
        repo_root=repo_root,
        project_id=project_id,
        sample_snapshot_path=repo_root / "shared" / "examples" / "sample_archicad_snapshot.json",
        seed_state_path=repo_root / "shared" / "examples" / "demo_state.seed.json",
        runtime_state_path=runtime_dir / "demo_state.json",
        connector_state_path=runtime_dir / "connector_state.json",
        data_source=data_source,
        scenario_id=scenario_id,
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        dry_run=dry_run,
    )
