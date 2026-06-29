#!/usr/bin/env python3
"""
Build curated part_master artifacts from a JSON source.

Outputs:
- downloads/curated-part-master.json
- src/generated/curated-part-master-records.ts
"""

from __future__ import annotations

import argparse
import json
import pathlib
import time


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "config" / "part-master" / "curated-part-master-source.json"
DEFAULT_JSON_OUTPUT = ROOT / "downloads" / "curated-part-master.json"
DEFAULT_TS_OUTPUT = ROOT / "src" / "generated" / "curated-part-master-records.ts"


def load_records(path: pathlib.Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Curated part master source must be a JSON array")
    return payload


def validate_records(records: list[dict]) -> None:
    seen: set[str] = set()
    required = {
        "canonicalMpn",
        "manufacturerName",
        "normalizedPartName",
        "datasheetUrl",
        "lifecycleStatus",
        "pinSchemaJson",
        "specsJson",
    }

    for index, record in enumerate(records, start=1):
        missing = sorted(required - set(record))
        if missing:
          raise ValueError(f"Record #{index} is missing keys: {', '.join(missing)}")
        mpn = str(record["canonicalMpn"]).strip()
        if not mpn:
            raise ValueError(f"Record #{index} has empty canonicalMpn")
        if mpn in seen:
            raise ValueError(f"Duplicate canonicalMpn: {mpn}")
        seen.add(mpn)
        if not str(record["datasheetUrl"]).startswith("https://"):
            raise ValueError(f"{mpn} datasheetUrl must start with https://")


def write_json_output(path: pathlib.Path, records: list[dict], source_path: pathlib.Path) -> None:
    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": str(source_path),
        "count": len(records),
        "records": records,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_ts_output(path: pathlib.Path, records: list[dict], source_path: pathlib.Path) -> None:
    body = json.dumps(records, indent=2, ensure_ascii=False)
    contents = "\n".join(
        [
            "import type { PartMasterRecord } from '@/lib/part-master-catalog';",
            "",
            f"// Generated from {source_path.relative_to(ROOT)}",
            "export const CURATED_PART_MASTER_RECORDS: PartMasterRecord[] = "
            f"{body} as PartMasterRecord[];",
            "",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build curated part master artifacts")
    parser.add_argument("--source", type=pathlib.Path, default=DEFAULT_SOURCE)
    parser.add_argument("--json-output", type=pathlib.Path, default=DEFAULT_JSON_OUTPUT)
    parser.add_argument("--ts-output", type=pathlib.Path, default=DEFAULT_TS_OUTPUT)
    args = parser.parse_args()

    records = load_records(args.source)
    validate_records(records)
    write_json_output(args.json_output, records, args.source)
    write_ts_output(args.ts_output, records, args.source)

    print(f"Wrote {args.json_output}")
    print(f"Wrote {args.ts_output}")
    print(f"Curated records: {len(records)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
