from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class ConnectorConfig:
    repo_root: Path
    project_id: str
    sample_snapshot_path: Path
    seed_state_path: Path
    runtime_state_path: Path
    connector_state_path: Path
    dry_run: bool = False
    enable_inbound_sync: bool = True
    enable_outbound_sync: bool = True


def load_config(dry_run: bool = False) -> ConnectorConfig:
    repo_root = Path(__file__).resolve().parents[4]
    runtime_dir = repo_root / "shared" / "examples" / "runtime"
    return ConnectorConfig(
        repo_root=repo_root,
        project_id="11111111-1111-1111-1111-111111111111",
        sample_snapshot_path=repo_root / "shared" / "examples" / "sample_archicad_snapshot.json",
        seed_state_path=repo_root / "shared" / "examples" / "demo_state.seed.json",
        runtime_state_path=runtime_dir / "demo_state.json",
        connector_state_path=runtime_dir / "connector_state.json",
        dry_run=dry_run,
    )
