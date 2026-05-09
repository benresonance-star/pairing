from __future__ import annotations

import json
import sys
from typing import Any


SETUP_EXIT_CODE = 2


def print_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2))


def load_archicad_package():
    try:
        from archicad import ACConnection  # type: ignore[import-not-found]
    except ImportError:
        print_json(
            {
                "status": "setup_required",
                "reason": "The Graphisoft 'archicad' Python package is not installed.",
                "next_steps": [
                    "Install it with: pip install archicad",
                    "Open Archicad 28 with a disposable/test project.",
                    "Re-run: npm run archicad:probe",
                ],
            }
        )
        raise SystemExit(SETUP_EXIT_CODE)
    return ACConnection


def connect_to_archicad():
    ACConnection = load_archicad_package()
    try:
        connection = ACConnection.connect()
    except Exception as error:  # noqa: BLE001
        print_json(
            {
                "status": "setup_required",
                "reason": f"Unable to connect to a running Archicad instance: {error}",
                "next_steps": [
                    "Open Archicad 28.",
                    "Open a disposable/test project.",
                    "Confirm the Python Palette/Automation API is enabled if Archicad prompts for setup.",
                    "Re-run: npm run archicad:probe",
                ],
            }
        )
        raise SystemExit(SETUP_EXIT_CODE) from error

    if connection is None:
        print_json(
            {
                "status": "setup_required",
                "reason": "ACConnection.connect() did not find a running Archicad instance.",
                "next_steps": [
                    "Open Archicad 28 with a disposable/test project.",
                    "Re-run: npm run archicad:probe",
                ],
            }
        )
        raise SystemExit(SETUP_EXIT_CODE)

    return connection


def try_command(commands: Any, name: str, *args: Any) -> Any:
    command = getattr(commands, name, None)
    if command is None:
        return None
    try:
        return command(*args)
    except Exception as error:  # noqa: BLE001
        return {"error": str(error)}


def count_result(value: Any) -> int | None:
    if isinstance(value, list):
        return len(value)
    return None


def main() -> None:
    connection = connect_to_archicad()
    commands = connection.commands

    product_info = try_command(commands, "GetProductInfo")
    walls = try_command(commands, "GetElementsByType", "Wall")
    zones = try_command(commands, "GetElementsByType", "Zone")
    slabs = try_command(commands, "GetElementsByType", "Slab")
    roofs = try_command(commands, "GetElementsByType", "Roof")
    windows = try_command(commands, "GetElementsByType", "Window")
    doors = try_command(commands, "GetElementsByType", "Door")
    columns = try_command(commands, "GetElementsByType", "Column")
    beams = try_command(commands, "GetElementsByType", "Beam")
    objects = try_command(commands, "GetElementsByType", "Object")

    print_json(
        {
            "status": "connected",
            "product_info": product_info,
            "counts": {
                "walls": count_result(walls),
                "zones": count_result(zones),
                "slabs": count_result(slabs),
                "roofs": count_result(roofs),
                "windows": count_result(windows),
                "doors": count_result(doors),
                "columns": count_result(columns),
                "beams": count_result(beams),
                "objects": count_result(objects),
            },
            "raw_errors": {
                key: value["error"]
                for key, value in {
                    "product_info": product_info,
                    "walls": walls,
                    "zones": zones,
                    "slabs": slabs,
                    "roofs": roofs,
                    "windows": windows,
                    "doors": doors,
                    "columns": columns,
                    "beams": beams,
                    "objects": objects,
                }.items()
                if isinstance(value, dict) and "error" in value
            },
            "next_steps": [
                "If counts look plausible, implement snapshot extraction in the Archicad-side bridge.",
                "Before write testing, use a disposable or backed-up model with CCP_Operational properties.",
            ],
        }
    )


if __name__ == "__main__":
    main()
