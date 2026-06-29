#!/usr/bin/env python3
"""Convert extracted datasheet/registry pin data into a ModuMake board definition.

This script is intentionally local-first:
- It does not call any model API directly.
- It accepts structured JSON exported from an LLM, board registry, or manual curation.
- It normalizes the data into the board format used by `src/constants/boards.ts`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


PIN_TYPE_ORDER = ["DIGITAL", "ANALOG", "PWM", "POWER", "GND"]
TARGET_LANGUAGE_CHOICES = {"C++", "Python"}
LOGIC_VOLTAGES = {"3.3V", "5V"}

FEATURE_TOKEN_MAP = {
    "GPIO": "DIGITAL",
    "DIGITAL": "DIGITAL",
    "IO": "DIGITAL",
    "INPUT": "DIGITAL",
    "OUTPUT": "DIGITAL",
    "SDA": "DIGITAL",
    "SCL": "DIGITAL",
    "SPI": "DIGITAL",
    "UART": "DIGITAL",
    "TX": "DIGITAL",
    "RX": "DIGITAL",
    "ADC": "ANALOG",
    "ANALOG": "ANALOG",
    "AIN": "ANALOG",
    "DAC": "ANALOG",
    "PWM": "PWM",
    "TIMER": "PWM",
    "VCC": "POWER",
    "VDD": "POWER",
    "VDDH": "POWER",
    "VIN": "POWER",
    "VBUS": "POWER",
    "POWER": "POWER",
    "3V3": "POWER",
    "3.3V": "POWER",
    "5V": "POWER",
    "GND": "GND",
    "VSS": "GND",
    "GROUND": "GND",
}

SIDE_ALIASES = {
    "left": "left",
    "power": "left",
    "analog": "left",
    "right": "digital",
    "digital": "digital",
}


def sanitize_identifier(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", value.strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned.lower() or "generated_board"


def sanitize_plain_text(value: Any, fallback: str, *, max_length: int = 160) -> str:
    if not isinstance(value, str):
        return fallback
    text = re.sub(r"\s+", " ", value).strip()
    if not text:
        return fallback
    return text[:max_length]


def normalize_logic_voltage(value: Any, fallback: str = "3.3V") -> str:
    if isinstance(value, str):
        token = value.strip().upper().replace(" ", "")
        if token in {"3V3", "3.3V", "3_3V"}:
            return "3.3V"
        if token in {"5V", "5.0V"}:
            return "5V"
    return fallback


def normalize_target_language(value: Any, fallback: str = "C++") -> str:
    if isinstance(value, str):
        normalized = value.strip()
        if normalized in TARGET_LANGUAGE_CHOICES:
            return normalized
        lowered = normalized.lower()
        if lowered in {"cpp", "c++", "arduino"}:
            return "C++"
        if lowered in {"python", "micropython"}:
            return "Python"
    return fallback


def flatten_feature_tokens(raw: Any) -> list[str]:
    tokens: list[str] = []

    def walk(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, str):
            for part in re.split(r"[\s,/|()+-]+", value):
                if part:
                    tokens.append(part.strip())
            return
        if isinstance(value, list):
            for item in value:
                walk(item)
            return
        if isinstance(value, dict):
            for key, item in value.items():
                if isinstance(item, bool) and item:
                    tokens.append(str(key))
                else:
                    walk(item)

    walk(raw)
    return tokens


def infer_power_or_ground_from_name(pin_name: str) -> str | None:
    normalized = pin_name.upper().replace(" ", "")
    if normalized in {"GND", "VSS", "GROUND"} or normalized.startswith("GND"):
        return "GND"
    if normalized in {"VCC", "VDD", "VDDH", "VIN", "VBUS", "3V3", "3.3V", "5V"}:
        return "POWER"
    return None


def normalize_pin_types(pin_name: str, raw_features: Any) -> list[str]:
    normalized: list[str] = []
    inferred = infer_power_or_ground_from_name(pin_name)
    if inferred:
        normalized.append(inferred)

    for token in flatten_feature_tokens(raw_features):
        mapped = FEATURE_TOKEN_MAP.get(token.upper())
        if mapped and mapped not in normalized:
            normalized.append(mapped)

    if "PWM" in normalized and "DIGITAL" not in normalized:
        normalized.insert(0, "DIGITAL")
    if "ANALOG" in normalized and "POWER" not in normalized and "GND" not in normalized and "DIGITAL" not in normalized:
        normalized.insert(0, "DIGITAL")
    if not normalized:
        normalized = ["DIGITAL"]

    return [token for token in PIN_TYPE_ORDER if token in normalized]


def normalize_side(raw_side: Any, pin_types: list[str]) -> str:
    if isinstance(raw_side, str):
        mapped = SIDE_ALIASES.get(raw_side.strip().lower())
        if mapped:
            return mapped
    if "POWER" in pin_types or "GND" in pin_types or "ANALOG" in pin_types:
        return "left"
    return "digital"


def normalize_pin(pin: dict[str, Any]) -> dict[str, Any]:
    raw_name = pin.get("id", pin.get("name", pin.get("pin", "")))
    pin_name = sanitize_plain_text(raw_name, "", max_length=40)
    if not pin_name:
        raise ValueError("Pin entry is missing a usable id/name field.")

    pin_types = normalize_pin_types(pin_name, pin.get("features", pin.get("type", pin.get("signals"))))
    side = normalize_side(pin.get("side", pin.get("column")), pin_types)

    return {
        "id": pin_name,
        "type": pin_types,
        "side": side,
    }


def dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def sort_left_pins(pin_ids: list[str], pin_lookup: dict[str, dict[str, Any]]) -> list[str]:
    def score(pin_id: str) -> tuple[int, str]:
        pin_types = pin_lookup[pin_id]["type"]
        if "ANALOG" in pin_types:
            return (0, pin_id)
        if "POWER" in pin_types:
            return (1, pin_id)
        if "GND" in pin_types:
            return (2, pin_id)
        return (3, pin_id)

    return sorted(pin_ids, key=score)


def build_board_definition(payload: dict[str, Any], overrides: argparse.Namespace) -> dict[str, Any]:
    board_meta = payload.get("board", {})
    if not isinstance(board_meta, dict):
        board_meta = {}

    raw_pins = payload.get("pins", payload.get("pinDefinitions", []))
    if not isinstance(raw_pins, list) or not raw_pins:
        raise ValueError("Input JSON must include a non-empty `pins` array.")

    pins = [normalize_pin(pin) for pin in raw_pins if isinstance(pin, dict)]
    if not pins:
        raise ValueError("No valid pin objects were found in the `pins` array.")

    pin_lookup = {pin["id"]: pin for pin in pins}
    pin_order = [pin["id"] for pin in pins]

    digital_pins = dedupe_preserve_order(
        [pin_id for pin_id in pin_order if pin_lookup[pin_id]["side"] == "digital"]
    )
    left_pins = sort_left_pins(
        dedupe_preserve_order([pin_id for pin_id in pin_order if pin_lookup[pin_id]["side"] == "left"]),
        pin_lookup,
    )

    raw_logic_voltage = overrides.logic_voltage or board_meta.get("logicVoltage") or payload.get("logicVoltage")
    raw_target_language = overrides.target_language or board_meta.get("targetLanguage") or payload.get("targetLanguage")

    board_id_source = overrides.board_id or board_meta.get("id") or payload.get("boardId") or payload.get("id")
    board_id = sanitize_identifier(str(board_id_source or "generated_board"))

    return {
        "id": board_id,
        "name": sanitize_plain_text(
            overrides.name or board_meta.get("name") or payload.get("name"),
            "Generated Board",
            max_length=80,
        ),
        "chipset": sanitize_plain_text(
            overrides.chipset or board_meta.get("chipset") or payload.get("chipset"),
            "Unknown Chipset",
            max_length=80,
        ),
        "targetLanguage": normalize_target_language(raw_target_language),
        "logicVoltage": normalize_logic_voltage(raw_logic_voltage),
        "color": sanitize_plain_text(
            overrides.color or board_meta.get("color") or payload.get("color"),
            "#1f2937",
            max_length=16,
        ),
        "accentColor": sanitize_plain_text(
            overrides.accent_color or board_meta.get("accentColor") or payload.get("accentColor"),
            "#60a5fa",
            max_length=16,
        ),
        "digitalPins": digital_pins,
        "leftPins": left_pins,
        "pinDefinitions": [{"id": pin["id"], "type": pin["type"]} for pin in pins],
        "description": sanitize_plain_text(
            overrides.description or board_meta.get("description") or payload.get("description"),
            "Generated from structured board metadata.",
            max_length=240,
        ),
        "icon": sanitize_plain_text(
            overrides.icon or board_meta.get("icon") or payload.get("icon"),
            "Cpu",
            max_length=32,
        ),
    }


def render_typescript(board: dict[str, Any], export_name: str) -> str:
    board_json = json.dumps(board, ensure_ascii=False, indent=2)
    return (
        'import type { BoardDefinition } from "../../src/constants/boards";\n\n'
        f"export const {export_name}: BoardDefinition = {board_json} as BoardDefinition;\n"
    )


def write_output(content: str, output_path: str | None) -> None:
    if output_path:
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8")
    else:
        sys.stdout.write(content)
        if not content.endswith("\n"):
            sys.stdout.write("\n")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert extracted board metadata into a ModuMake board definition."
    )
    parser.add_argument("input", help="Path to the extracted board JSON file.")
    parser.add_argument("--format", choices=["json", "ts"], default="json")
    parser.add_argument("--output", help="Optional output file path.")
    parser.add_argument("--board-id", help="Override the generated board id.")
    parser.add_argument("--name", help="Override the board display name.")
    parser.add_argument("--chipset", help="Override the chipset label.")
    parser.add_argument("--target-language", help="Override target language (C++ or Python).")
    parser.add_argument("--logic-voltage", help="Override logic voltage (3.3V or 5V).")
    parser.add_argument("--color", help="Override board primary color.")
    parser.add_argument("--accent-color", help="Override board accent color.")
    parser.add_argument("--description", help="Override description.")
    parser.add_argument("--icon", help="Override icon.")
    parser.add_argument("--export-name", default="GENERATED_BOARD", help="TS export identifier.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    input_path = Path(args.input)

    if not input_path.exists():
        sys.stderr.write(f"Input file not found: {input_path}\n")
        return 1

    try:
        payload = json.loads(input_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Root JSON value must be an object.")
        board = build_board_definition(payload, args)
    except Exception as error:  # pragma: no cover - exercised via CLI tests
        sys.stderr.write(f"Failed to build board definition: {error}\n")
        return 1

    if args.format == "json":
        content = json.dumps(board, ensure_ascii=False, indent=2) + "\n"
    else:
        content = render_typescript(board, args.export_name)

    write_output(content, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
