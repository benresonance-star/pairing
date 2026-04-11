from __future__ import annotations

import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    connector_src = repo_root / "services" / "connector" / "src"
    if str(connector_src) not in sys.path:
        sys.path.insert(0, str(connector_src))

    from connector.main import main as connector_main

    connector_main()


if __name__ == "__main__":
    main()
