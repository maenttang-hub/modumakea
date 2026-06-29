from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYKICAD_SRC = ROOT / "pykicad" / "src"

if str(PYKICAD_SRC) not in sys.path:
    sys.path.insert(0, str(PYKICAD_SRC))

from kiutils.schematic import Schematic  # type: ignore


def dump_modumake_scene(file_path: Path) -> list[dict]:
    command = [
        "node",
        "--experimental-strip-types",
        "--import",
        "./tests/register-alias-loader.mjs",
        "./scripts/dump-imported-symbol-metadata.ts",
        str(file_path),
    ]
    raw = subprocess.check_output(command, cwd=ROOT, text=True)
    return json.loads(raw)


def dump_pykicad_symbols(file_path: Path) -> list[dict]:
    schematic = Schematic().from_file(str(file_path))
    used_lib_symbols = {symbol.libId: symbol for symbol in schematic.libSymbols}
    payload: list[dict] = []

    for schematic_symbol in schematic.schematicSymbols:
        lib_symbol = used_lib_symbols.get(schematic_symbol.libId)
        payload.append(
            {
                "instanceId": schematic_symbol.uuid,
                "reference": next((prop.value for prop in schematic_symbol.properties if prop.key == "Reference"), ""),
                "value": next((prop.value for prop in schematic_symbol.properties if prop.key == "Value"), ""),
                "libId": schematic_symbol.libId,
                "unit": getattr(schematic_symbol, "unit", None),
                "pinAnchorCount": len(getattr(lib_symbol, "pins", []) or []),
                "hidePinNumbers": getattr(lib_symbol, "hidePinNumbers", False) if lib_symbol else False,
                "pinNamesHide": getattr(lib_symbol, "pinNamesHide", False) if lib_symbol else False,
                "pinNamesOffset": getattr(lib_symbol, "pinNamesOffset", None) if lib_symbol else None,
                "isPower": getattr(lib_symbol, "isPower", False) if lib_symbol else False,
            }
        )

    return payload


def compare(file_path: Path) -> int:
    pykicad_symbols = dump_pykicad_symbols(file_path)
    modumake_symbols = dump_modumake_scene(file_path)
    modumake_by_instance = {symbol["instanceId"]: symbol for symbol in modumake_symbols}

    failures: list[str] = []
    for expected in pykicad_symbols:
        actual = modumake_by_instance.get(expected["instanceId"])
        if actual is None:
            failures.append(
                f"missing scene symbol for {expected['reference'] or expected['instanceId']} ({expected['libId']})"
            )
            continue

        if expected["pinAnchorCount"] and actual["pinAnchorCount"] != expected["pinAnchorCount"]:
            failures.append(
                f"pin count mismatch for {expected['reference']}: pykicad={expected['pinAnchorCount']} modumake={actual['pinAnchorCount']}"
            )

        if expected["hidePinNumbers"] and actual["primitiveKindCounts"].get("text:pin-number", 0) != 0:
            failures.append(
                f"pin number hide mismatch for {expected['reference']}: expected no pin-number texts"
            )

        if expected["pinNamesHide"] and actual["primitiveKindCounts"].get("text:pin-name", 0) != 0:
            failures.append(
                f"pin name hide mismatch for {expected['reference']}: expected no pin-name texts"
            )

    print(f"\n[{file_path.name}]")
    if failures:
        for failure in failures:
            print(" -", failure)
        return 1

    print(f" - ok ({len(pykicad_symbols)} symbols checked)")
    return 0


def main() -> int:
    file_args = sys.argv[1:]
    if not file_args:
        raise SystemExit("usage: compare-kicad-with-pykicad.py <file1.kicad_sch> [file2.kicad_sch ...]")

    status = 0
    for file_arg in file_args:
        status |= compare(Path(file_arg))
    return status


if __name__ == "__main__":
    raise SystemExit(main())
