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


def require_sdk_layout(sdk_root: Path, addon_dir: Path) -> None:
    missing = []
    if not (sdk_root / "Support" / "Inc" / "ACAPinc.h").exists():
        missing.append("Support/Inc/ACAPinc.h")
    if not (sdk_root / "Support" / "Tools" / "CompileResources.py").exists():
        missing.append("Support/Tools/CompileResources.py")
    if not (sdk_root / "Support" / "Lib" / "ACAP_STAT.lib").exists():
        missing.append("Support/Lib/ACAP_STAT.lib")
    if not (addon_dir / "src" / "APIEnvir.h").exists():
        missing.append("buildsync-archicad-addon/src/APIEnvir.h")

    if missing:
        formatted = ", ".join(missing)
        raise RuntimeError(f"Archicad SDK/add-on build prerequisites are missing under {sdk_root}: {formatted}.")


def require_v142_toolset() -> None:
    roots = [
        Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft Visual Studio",
        Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Microsoft Visual Studio",
    ]
    for root in roots:
        if not root.exists():
            continue
        for version_dir in root.iterdir():
            if not version_dir.is_dir():
                continue
            for edition_dir in version_dir.iterdir():
                if not edition_dir.is_dir():
                    continue
                toolset_root = edition_dir / "VC" / "Tools" / "MSVC"
                if not toolset_root.exists():
                    continue
                if any(child.is_dir() and child.name.startswith("14.2") for child in toolset_root.iterdir()):
                    return

    raise RuntimeError(
        "Graphisoft SDK 28 requires the Visual Studio 2019 v142 C++ build tools. "
        "Install the v142 toolset with the Visual Studio Installer, then rerun the SDK smoke."
    )


def run_default(cmake: str, addon_dir: Path) -> None:
    run([cmake, "--preset", "vs2026-x64"], addon_dir)
    run([cmake, "--build", "--preset", "debug"], addon_dir)
    run([cmake, "--build", str(addon_dir / "build"), "--config", "Debug", "--target", "RUN_TESTS"], addon_dir)


def run_sdk(cmake: str, addon_dir: Path, sdk_root: Path) -> None:
    require_sdk_layout(sdk_root, addon_dir)
    require_v142_toolset()
    sdk_build_dir = addon_dir / "build-sdk"
    if sdk_build_dir.exists():
        shutil.rmtree(sdk_build_dir)
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
