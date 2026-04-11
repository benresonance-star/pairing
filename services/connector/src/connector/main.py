from __future__ import annotations

import argparse

from .config import load_config
from .logger import log_event
from .sync_engine import SyncEngine


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Archicad CCP connector")
    parser.add_argument(
        "command",
        choices=["seed-runtime", "reset-runtime", "inbound", "outbound", "loop"],
        help="Command to run",
    )
    parser.add_argument("--dry-run", action="store_true", help="Record writes without executing them")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    config = load_config(dry_run=args.dry_run)
    engine = SyncEngine(config)

    if args.command == "seed-runtime":
        engine.seed_runtime()
        log_event("info", "Seeded runtime state", path=str(config.runtime_state_path))
    elif args.command == "reset-runtime":
        engine.reset_runtime()
        log_event("info", "Reset runtime state", path=str(config.runtime_state_path))
    elif args.command == "inbound":
        engine.run_inbound()
    elif args.command == "outbound":
        engine.run_outbound()
    elif args.command == "loop":
        engine.run_inbound()
        engine.run_outbound()


if __name__ == "__main__":
    main()
