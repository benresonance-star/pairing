from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


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
                self.send_json(200, read_json(snapshot_path))
                return
            self.send_json(404, {"error": "not found"})

        def do_POST(self) -> None:
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
    parser.add_argument("--port", type=int, default=19723)
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
