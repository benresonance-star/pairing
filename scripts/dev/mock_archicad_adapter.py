from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[2]
_CONNECTOR_SRC = _ROOT / "services" / "connector" / "src"
if str(_CONNECTOR_SRC) not in sys.path:
    sys.path.insert(0, str(_CONNECTOR_SRC))

from connector.snapshot_filter import (  # noqa: E402
    apply_snapshot_filter,
    build_snapshot_rows,
    normalize_snapshot_filter,
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def layers_from_snapshot(snapshot: dict[str, Any]) -> list[str]:
    names: set[str] = set()
    for z in snapshot.get("zones", []) or []:
        if isinstance(z, dict) and z.get("layer"):
            names.add(str(z["layer"]))
    for e in snapshot.get("elements", []) or []:
        if isinstance(e, dict) and e.get("layer"):
            names.add(str(e["layer"]))
    return sorted(names)


def build_handler(snapshot_path: Path, writes_path: Path):
    class MockArchicadAdapterHandler(BaseHTTPRequestHandler):
        server_version = "MockArchicadAdapter/0.1"

        def log_message(self, format: str, *args: object) -> None:
            return

        def send_json(self, status_code: int, payload: Any) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def read_body(self) -> dict[str, Any]:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length == 0:
                return {}
            raw = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError("request body must be a JSON object")
            return payload

        def base_snapshot(self) -> dict[str, Any]:
            snap = read_json(snapshot_path)
            if not isinstance(snap, dict):
                return {"zones": [], "elements": []}
            zones = snap.get("zones", [])
            elements = snap.get("elements", [])
            if not isinstance(zones, list):
                zones = []
            if not isinstance(elements, list):
                elements = []
            return {"zones": zones, "elements": elements}

        def do_GET(self) -> None:
            if self.path == "/api/v1/product-info":
                self.send_json(
                    200,
                    {
                        "product_name": "Mock Archicad Adapter",
                        "connection": f"{self.server.server_address[0]}:{self.server.server_address[1]}",
                    },
                )
                return
            if self.path == "/api/v1/snapshot":
                self.send_json(200, self.base_snapshot())
                return
            if self.path == "/api/v1/snapshot/layers":
                self.send_json(200, {"layers": layers_from_snapshot(self.base_snapshot())})
                return
            self.send_json(404, {"error": "not found"})

        def do_POST(self) -> None:
            if self.path == "/api/v1/snapshot":
                try:
                    body = self.read_body()
                except Exception as error:  # noqa: BLE001
                    self.send_json(400, {"error": str(error)})
                    return
                filt = normalize_snapshot_filter(body)
                combined = self.base_snapshot()
                filtered = apply_snapshot_filter(combined, filt)
                filtered["snapshot_rows"] = build_snapshot_rows(filtered)
                counts: dict[str, int] = {"zone": len(filtered.get("zones", []))}
                for elem in filtered.get("elements", []):
                    if isinstance(elem, dict):
                        ot = str(elem.get("object_type") or "unknown")
                        counts[ot] = counts.get(ot, 0) + 1
                filtered["counts_by_type"] = counts
                filtered["snapshot_rows_truncated"] = False
                filtered["layer_names"] = layers_from_snapshot(filtered)
                self.send_json(200, filtered)
                return
            if self.path != "/api/v1/properties":
                self.send_json(404, {"error": "not found"})
                return

            try:
                payload = self.read_body()
            except Exception as error:  # noqa: BLE001
                self.send_json(400, {"error": str(error)})
                return

            required_fields = ["archicad_guid", "field_name", "field_value"]
            missing = [field for field in required_fields if field not in payload]
            if missing:
                self.send_json(400, {"error": f"missing fields: {', '.join(missing)}"})
                return

            writes = read_json(writes_path) if writes_path.exists() else []
            if not isinstance(writes, list):
                writes = []
            writes.append(payload)
            write_json(writes_path, writes)
            self.send_json(200, {"status": "ok"})

    return MockArchicadAdapterHandler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Mock Archicad live adapter for local connector validation")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19724)
    parser.add_argument(
        "--snapshot-path",
        type=Path,
        default=repo_root() / "shared" / "examples" / "sample_archicad_snapshot.json",
    )
    parser.add_argument(
        "--writes-path",
        type=Path,
        default=repo_root() / "shared" / "examples" / "runtime" / "mock_archicad_writes.json",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    write_json(args.writes_path, [])
    handler = build_handler(args.snapshot_path, args.writes_path)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(
        json.dumps(
            {
                "status": "ready",
                "host": args.host,
                "port": args.port,
                "snapshot_path": str(args.snapshot_path),
                "writes_path": str(args.writes_path),
            }
        ),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
