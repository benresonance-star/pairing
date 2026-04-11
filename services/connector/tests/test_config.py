from __future__ import annotations

from pathlib import Path

import pytest

from connector.config import load_config


def test_load_config_defaults_to_demo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CCP_DATA_SOURCE", raising=False)
    monkeypatch.delenv("PROJECT_ID", raising=False)
    monkeypatch.delenv("CCP_SCENARIO_ID", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    config = load_config()

    assert config.data_source == "demo"
    assert config.project_id == "11111111-1111-1111-1111-111111111111"
    assert config.scenario_id is None
    assert config.runtime_state_path.name == "demo_state.json"


def test_load_config_requires_supabase_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CCP_DATA_SOURCE", "supabase")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    with pytest.raises(ValueError):
        load_config()


def test_load_config_reads_supabase_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CCP_DATA_SOURCE", "supabase")
    monkeypatch.setenv("PROJECT_ID", "project-123")
    monkeypatch.setenv("CCP_SCENARIO_ID", "scenario-456")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")

    config = load_config(dry_run=True)

    assert config.data_source == "supabase"
    assert config.project_id == "project-123"
    assert config.scenario_id == "scenario-456"
    assert config.supabase_url == "http://127.0.0.1:54321"
    assert config.supabase_service_role_key == "service-role-key"
    assert config.dry_run is True
    assert isinstance(config.repo_root, Path)
