from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def cmake_command() -> str:
    found = shutil.which("cmake")
    if found:
        return found
    default = Path("C:/Program Files/CMake/bin/cmake.exe")
    if default.exists():
        return str(default)
    raise RuntimeError("CMake was not found on PATH or at C:/Program Files/CMake/bin/cmake.exe")


def run(args: list[str], cwd: Path) -> None:
    normalized = [str(arg) for arg in args]
    print("+", " ".join(normalized), flush=True)
    subprocess.run(normalized, cwd=cwd, check=True)


def sdk_headers_present(sdk_root: Path) -> bool:
    return (sdk_root / "Support" / "Inc" / "ACAPinc.h").exists() and (
        sdk_root / "Support" / "Inc" / "APIEnvir.h"
    ).exists()


def run_default(cmake: str, addon_dir: Path) -> None:
    run([cmake, "--preset", "vs2026-x64"], addon_dir)
    run([cmake, "--build", "--preset", "debug"], addon_dir)
    run([cmake, "--build", str(addon_dir / "build"), "--config", "Debug", "--target", "RUN_TESTS"], addon_dir)


def run_sdk(cmake: str, addon_dir: Path, sdk_root: Path) -> None:
    if not sdk_headers_present(sdk_root):
        raise RuntimeError(
            f"Archicad SDK headers were not found under {sdk_root}. "
            "Expected Support/Inc/ACAPinc.h and Support/Inc/APIEnvir.h."
        )
    env = os.environ.copy()
    env["ARCHICAD_SDK_ROOT"] = str(sdk_root)
    print(f"Using ARCHICAD_SDK_ROOT={sdk_root}", flush=True)
    subprocess.run([cmake, "--preset", "vs2026-x64-sdk"], cwd=addon_dir, check=True, env=env)
    subprocess.run([cmake, "--build", "--preset", "sdk-debug"], cwd=addon_dir, check=True, env=env)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="BuildSync native build/test smoke")
    parser.add_argument("--sdk", action="store_true", help="Also build the optional Archicad SDK target")
    parser.add_argument(
        "--sdk-root",
        type=Path,
        default=Path(os.environ["ARCHICAD_SDK_ROOT"]) if os.environ.get("ARCHICAD_SDK_ROOT") else None,
        help="Path to the Archicad API Development Kit root",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    root = repo_root()
    addon_dir = root / "buildsync-archicad-addon"
    cmake = cmake_command()

    try:
        run_default(cmake, addon_dir)
        if args.sdk:
            if args.sdk_root is None:
                raise RuntimeError("Pass --sdk-root or set ARCHICAD_SDK_ROOT before using --sdk")
            run_sdk(cmake, addon_dir, args.sdk_root)
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"BuildSync native smoke failed: {error}", file=sys.stderr)
        return 1

    print("BuildSync native smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
