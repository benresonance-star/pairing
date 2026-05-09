from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import threading
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import time

import requests

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CONNECTOR_SRC = _REPO_ROOT / "services" / "connector" / "src"
if str(_CONNECTOR_SRC) not in sys.path:
    sys.path.insert(0, str(_CONNECTOR_SRC))

from connector.snapshot_filter import SNAPSHOT_ROWS_MAX, build_snapshot_rows, normalize_snapshot_filter  # noqa: E402


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def snapshot_filter_file_path() -> Path:
    return repo_root() / "shared" / "examples" / "runtime" / "companion_snapshot_filter.json"


def _read_snapshot_filter_file_raw() -> dict[str, Any] | None:
    p = snapshot_filter_file_path()
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _write_snapshot_filter_file(data: dict[str, Any]) -> None:
    p = snapshot_filter_file_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")


SENSITIVE_TOKENS = ("SUPABASE_SERVICE_ROLE_KEY", "ARCHICAD_COMPANION_TOKEN")


def sanitize_message(message: str) -> str:
    sanitized = message
    for token_name in SENSITIVE_TOKENS:
        token_value = os.environ.get(token_name)
        if token_value:
            sanitized = sanitized.replace(token_value, f"{token_name}=***")
    return sanitized


class CompanionState:
    def __init__(
        self,
        *,
        bridge_host: str,
        bridge_port: int,
        connector_project_id: str,
        token: str | None,
        log_limit: int = 200,
    ) -> None:
        self.bridge_host = bridge_host
        self.bridge_port = bridge_port
        self.connector_project_id = connector_project_id
        self.token = token
        self.bridge_process: subprocess.Popen[str] | None = None
        self.bridge_managed = False
        self.last_bridge_error: str | None = None
        self.last_connector_result: dict[str, Any] | None = None
        self.logs: deque[str] = deque(maxlen=log_limit)
        self.lock = threading.Lock()
        self.session = requests.Session()
        self.snapshot_filter: dict[str, Any] | None = None
        self._layers_cache: list[str] | None = None
        self._layers_cache_at: float = 0.0

    @staticmethod
    def _layers_from_preview_rows(preview: dict[str, Any]) -> list[str]:
        rows = preview.get("snapshot_rows") or []
        if not isinstance(rows, list):
            return []
        seen: set[str] = set()
        for r in rows:
            if isinstance(r, dict):
                layer = r.get("layer")
                if layer is not None and str(layer).strip():
                    seen.add(str(layer))
        return sorted(seen)

    @staticmethod
    def _layers_from_snapshot_payload(data: dict[str, Any]) -> list[str]:
        seen: set[str] = set()
        for key in ("zones", "elements"):
            items = data.get(key) or []
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict):
                    layer = item.get("layer")
                    if layer is not None and str(layer).strip():
                        seen.add(str(layer))
        return sorted(seen)

    @property
    def bridge_base_url(self) -> str:
        return f"http://{self.bridge_host}:{self.bridge_port}/api/v1/"

    def append_log(self, message: str) -> None:
        self.logs.append(sanitize_message(message))

    def _request_bridge(self, path: str) -> dict[str, Any]:
        response = self.session.get(f"{self.bridge_base_url}{path}", timeout=10)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError(f"Bridge endpoint '{path}' did not return a JSON object")
        return payload

    def _request_bridge_post(self, path: str, payload: dict[str, Any], *, timeout: float = 60) -> dict[str, Any]:
        response = self.session.post(f"{self.bridge_base_url}{path}", json=payload, timeout=timeout)
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            raise RuntimeError(f"Bridge POST '{path}' did not return a JSON object")
        return body

    def effective_snapshot_filter(self) -> dict[str, Any]:
        # File is written by the Next.js server action so filters apply even when an old
        # companion binary is still running (no POST /companion/snapshot-filter).
        fd = _read_snapshot_filter_file_raw()
        if fd is not None:
            return normalize_snapshot_filter(fd)
        return normalize_snapshot_filter(self.snapshot_filter)

    def available_layers(self) -> list[str]:
        now = time.monotonic()
        if self._layers_cache is not None and now - self._layers_cache_at < 60.0:
            return list(self._layers_cache)
        try:
            payload = self._request_bridge("snapshot/layers")
        except Exception:
            self._layers_cache = []
            self._layers_cache_at = now
            return []
        layers = payload.get("layers", [])
        if not isinstance(layers, list):
            layers = []
        self._layers_cache = [str(x) for x in layers]
        self._layers_cache_at = now
        return list(self._layers_cache)

    def snapshot_preview(self) -> dict[str, Any] | None:
        try:
            data = self._request_bridge_post("snapshot", self.effective_snapshot_filter(), timeout=60)
        except Exception:
            return None
        zones = data.get("zones", [])
        elements = data.get("elements", [])
        if not isinstance(zones, list) or not isinstance(elements, list):
            return None
        rows = data.get("snapshot_rows")
        if not isinstance(rows, list):
            rows = build_snapshot_rows(data, SNAPSHOT_ROWS_MAX)
        layer_names = data.get("layer_names")
        if isinstance(layer_names, list):
            layer_names = sorted({str(x).strip() for x in layer_names if str(x).strip()})
        else:
            layer_names = self._layers_from_snapshot_payload(data)
        return {
            "zone_count": len(zones),
            "element_count": len(elements),
            "counts_by_type": data.get("counts_by_type"),
            "snapshot_rows": rows,
            "snapshot_rows_truncated": bool(data.get("snapshot_rows_truncated", False)),
            "layer_names": layer_names,
        }

    def product_info(self) -> dict[str, Any] | None:
        try:
            return self._request_bridge("product-info")
        except Exception:
            return None

    def snapshot_summary(self, preview: dict[str, Any] | None = None) -> dict[str, int] | None:
        if preview is None:
            preview = self.snapshot_preview()
        if preview is None:
            return None
        return {"zones": preview["zone_count"], "elements": preview["element_count"]}

    def bridge_running(self) -> bool:
        return self.product_info() is not None

    def set_snapshot_filter(self, body: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            if not body:
                self.snapshot_filter = None
                _write_snapshot_filter_file({})
            else:
                self.snapshot_filter = normalize_snapshot_filter(dict(body))
                _write_snapshot_filter_file(dict(self.snapshot_filter))
            self._layers_cache = None
            return {"status": "ok", "filter": self.effective_snapshot_filter()}

    def connect(self) -> dict[str, Any]:
        with self.lock:
            if self.bridge_running():
                self.append_log("Bridge already responding to product-info.")
                return {"status": "already_connected", "bridge": self.status_locked()["bridge"]}

            process = subprocess.Popen(
                [
                    sys.executable,
                    "scripts/dev/archicad_bridge.py",
                    "--host",
                    self.bridge_host,
                    "--port",
                    str(self.bridge_port),
                ],
                cwd=repo_root(),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            self.bridge_process = process
            self.bridge_managed = True
            self.last_bridge_error = None
            self.append_log("Started managed Archicad bridge process.")

            if process.stdout is not None:
                ready_line = process.stdout.readline().strip()
                if ready_line:
                    self.append_log(f"bridge: {ready_line}")

            if process.poll() is not None:
                self.last_bridge_error = "Bridge process exited immediately."
                self.append_log(self.last_bridge_error)
                raise RuntimeError(self.last_bridge_error)

            product = self.product_info()
            if product is None:
                self.last_bridge_error = "Bridge did not become reachable."
                self.append_log(self.last_bridge_error)
                raise RuntimeError(self.last_bridge_error)

            return {
                "status": "connected",
                "product_info": product,
                "bridge": self.status_locked()["bridge"],
            }

    def disconnect(self) -> dict[str, Any]:
        with self.lock:
            if not self.bridge_managed or self.bridge_process is None:
                self.append_log("Disconnect requested but no managed bridge process exists.")
                return {"status": "not_managed"}
            process = self.bridge_process
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
            self.append_log("Stopped managed Archicad bridge process.")
            self.bridge_process = None
            self.bridge_managed = False
            return {"status": "disconnected"}

    def run_connector(self, command: str, *, dry_run: bool = False) -> dict[str, Any]:
        with self.lock:
            env = os.environ.copy()
            env.update(
                {
                    "CCP_ARCHICAD_ADAPTER": "live",
                    "ARCHICAD_HOST": self.bridge_host,
                    "ARCHICAD_PORT": str(self.bridge_port),
                    "PROJECT_ID": self.connector_project_id,
                    "ARCHICAD_SNAPSHOT_FILTER": json.dumps(self.effective_snapshot_filter()),
                }
            )
            args = [sys.executable, "scripts/dev/connector_cli.py", command]
            if dry_run and command == "outbound":
                args.append("--dry-run")
            self.append_log(f"Running connector command: {' '.join(args[2:])}")
            result = subprocess.run(
                args,
                cwd=repo_root(),
                env=env,
                check=False,
                capture_output=True,
                text=True,
            )
            output = f"{result.stdout}\n{result.stderr}".strip()
            if output:
                for line in output.splitlines():
                    self.append_log(f"connector: {line}")
            payload = {
                "status": "ok" if result.returncode == 0 else "error",
                "command": command,
                "dry_run": dry_run,
                "exit_code": result.returncode,
                "output": sanitize_message(output),
            }
            self.last_connector_result = payload
            return payload

    def status_locked(self) -> dict[str, Any]:
        process = self.bridge_process
        process_running = process is not None and process.poll() is None
        # One snapshot POST per status: calling snapshot_preview twice in a row can fail on
        # Archicad (first succeeds for summary, second raises) while leaving stale counts.
        available_layers = self.available_layers()
        preview = self.snapshot_preview()
        if not available_layers and preview:
            ln = preview.get("layer_names")
            if isinstance(ln, list):
                derived = sorted({str(x).strip() for x in ln if str(x).strip()})
                if derived:
                    available_layers = derived
            if not available_layers:
                available_layers = self._layers_from_preview_rows(preview)
        return {
            "bridge": {
                "managed": self.bridge_managed,
                "configured_host": self.bridge_host,
                "configured_port": self.bridge_port,
                "process_running": process_running,
                "process_pid": process.pid if process_running and process is not None else None,
                "reachable": self.bridge_running(),
                "last_error": self.last_bridge_error,
                "product_info": self.product_info(),
                "snapshot_summary": self.snapshot_summary(preview),
                "snapshot_filter": self.effective_snapshot_filter(),
                "available_layers": available_layers,
                "snapshot_preview": preview,
            },
            "connector": {"last_result": self.last_connector_result},
        }

    def status(self) -> dict[str, Any]:
        with self.lock:
            return self.status_locked()

    def get_logs(self, limit: int = 100) -> list[str]:
        with self.lock:
            if limit <= 0:
                return []
            return list(self.logs)[-limit:]


def build_handler(state: CompanionState):
    class CompanionHandler(BaseHTTPRequestHandler):
        server_version = "ArchicadDesktopCompanion/0.1"

        def companion_path(self) -> str:
            path = self.path.split("?", 1)[0]
            if len(path) > 1 and path.endswith("/"):
                path = path[:-1]
            return path

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
            raw = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError("request body must be a JSON object")
            return payload

        def require_token(self) -> bool:
            if not state.token:
                return True
            auth_token = self.headers.get("x-companion-token", "")
            if auth_token == state.token:
                return True
            self.send_json(401, {"error": "unauthorized"})
            return False

        def do_GET(self) -> None:
            if not self.require_token():
                return
            path = self.companion_path()
            if path.startswith("/companion/status"):
                self.send_json(200, state.status())
                return
            if path.startswith("/companion/logs"):
                limit = 100
                if "?" in self.path:
                    _, query = self.path.split("?", 1)
                    for pair in query.split("&"):
                        if pair.startswith("limit="):
                            try:
                                limit = int(pair.split("=", 1)[1])
                            except ValueError:
                                limit = 100
                self.send_json(200, {"logs": state.get_logs(limit)})
                return
            self.send_json(404, {"error": "not found"})

        def do_POST(self) -> None:
            if not self.require_token():
                return
            path = self.companion_path()
            try:
                if path == "/companion/snapshot-filter":
                    self.send_json(200, state.set_snapshot_filter(self.read_body()))
                    return
                if path == "/companion/connect":
                    self.send_json(200, state.connect())
                    return
                if path == "/companion/disconnect":
                    self.send_json(200, state.disconnect())
                    return
                if path == "/companion/inbound":
                    self.send_json(200, state.run_connector("inbound"))
                    return
                if path == "/companion/outbound":
                    payload = self.read_body()
                    self.send_json(
                        200,
                        state.run_connector("outbound", dry_run=bool(payload.get("dry_run", False))),
                    )
                    return
            except Exception as error:  # noqa: BLE001
                state.append_log(f"error: {error}")
                self.send_json(500, {"error": str(error)})
                return
            self.send_json(404, {"error": "not found"})

    return CompanionHandler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local desktop companion for web-controlled Archicad sync operations")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19725)
    parser.add_argument("--bridge-host", default="127.0.0.1")
    parser.add_argument("--bridge-port", type=int, default=19724)
    parser.add_argument(
        "--project-id",
        default=os.environ.get("PROJECT_ID", "11111111-1111-1111-1111-111111111111"),
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("ARCHICAD_COMPANION_TOKEN"),
        help="Shared token required by x-companion-token header",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("desktop companion must bind to localhost only")
    state = CompanionState(
        bridge_host=args.bridge_host,
        bridge_port=args.bridge_port,
        connector_project_id=args.project_id,
        token=args.token,
    )
    server = ThreadingHTTPServer((args.host, args.port), build_handler(state))
    print(
        json.dumps(
            {
                "status": "ready",
                "host": args.host,
                "port": args.port,
                "bridge_host": args.bridge_host,
                "bridge_port": args.bridge_port,
                "token_required": bool(args.token),
            }
        ),
        flush=True,
    )

    def _shutdown_handler(*_: Any) -> None:
        state.disconnect()
        server.shutdown()

    signal.signal(signal.SIGTERM, _shutdown_handler)
    signal.signal(signal.SIGINT, _shutdown_handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
