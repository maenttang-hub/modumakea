#!/usr/bin/env python3
"""
Download official datasheets for the starter part master catalog.

Usage:
  python3 ./scripts/datasheet-scraper/download_part_master_datasheets.py
  python3 ./scripts/datasheet-scraper/download_part_master_datasheets.py --output ./downloads/datasheets
  python3 ./scripts/datasheet-scraper/download_part_master_datasheets.py --mpn BME280 --mpn ESP32-WROOM-32E
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE_TS = ROOT / "src" / "lib" / "part-master-catalog.ts"
SEED_JSON = ROOT / "scripts" / "component-catalog" / "generated" / "part-master.seed.json"
DEFAULT_OUTPUT = ROOT / "downloads" / "datasheets"
DEFAULT_MANIFEST = DEFAULT_OUTPUT / "manifest.json"
USER_AGENT = (
    "Mozilla/5.0 (compatible; ModuMakeDatasheetFetcher/1.0; "
    "+https://modumake.local)"
)


def load_records() -> list[dict[str, Any]]:
    if SEED_JSON.exists():
        raw_records = json.loads(SEED_JSON.read_text(encoding="utf-8"))
        return [
            {
                "canonicalMpn": record["canonical_mpn"],
                "manufacturerName": record["manufacturer_name"],
                "normalizedPartName": record["normalized_part_name"],
                "datasheetUrl": record["datasheet_url"],
                "lifecycleStatus": record["lifecycle_status"],
                "pinSchemaJson": record["pin_schema_json"],
                "specsJson": record["specs_json"],
            }
            for record in raw_records
        ]

    source = SOURCE_TS.read_text(encoding="utf-8")
    match = re.search(
        r"export const STARTER_PART_MASTER_RECORDS: PartMasterRecord\[] = (\[.*\]);\s*"
        r"export const STARTER_PART_MASTER_BY_MPN",
        source,
        re.S,
    )
    if not match:
        raise RuntimeError("Could not locate STARTER_PART_MASTER_RECORDS in part-master-catalog.ts")

    payload = match.group(1)
    payload = re.sub(r"(?m)^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', payload)
    payload = payload.replace("'", '"')
    payload = re.sub(r",(\s*[}\]])", r"\1", payload)
    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            "Could not parse TypeScript starter catalog directly. "
            "Generate seed JSON first with "
            "`node --experimental-strip-types --import ./tests/register-alias-loader.mjs "
            "./scripts/seed-supabase.ts --dry-run --target part_master`."
        ) from exc


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    cleaned = cleaned.strip("._-")
    return cleaned or "datasheet"


def file_name_for(record: dict[str, Any]) -> str:
    url = str(record["datasheetUrl"]).split("?", 1)[0]
    suffix = pathlib.Path(url).suffix.lower()
    if suffix not in {".pdf", ".html", ".htm"}:
        suffix = ".pdf"
    return f"{slugify(str(record['canonicalMpn']))}{suffix}"


def download(url: str, destination: pathlib.Path, timeout: int, retries: int) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    context = ssl.create_default_context()
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/pdf,text/html,application/octet-stream;q=0.9,*/*;q=0.8",
    }

    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                content_type = response.headers.get_content_type()
                with destination.open("wb") as fp:
                    while True:
                        chunk = response.read(1024 * 64)
                        if not chunk:
                            break
                        fp.write(chunk)
                return {
                    "ok": True,
                    "contentType": content_type,
                    "size": destination.stat().st_size,
                    "attempt": attempt,
                }
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if destination.exists():
                destination.unlink()
            if attempt < retries:
                time.sleep(min(attempt * 2, 5))

    return {
        "ok": False,
        "error": f"{type(last_error).__name__}: {last_error}",
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Download starter part master datasheets")
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT, help="Output directory")
    parser.add_argument("--manifest", type=pathlib.Path, default=DEFAULT_MANIFEST, help="Manifest JSON path")
    parser.add_argument("--mpn", action="append", default=[], help="Download only specific canonical MPNs")
    parser.add_argument("--timeout", type=int, default=45, help="Per-request timeout in seconds")
    parser.add_argument("--retries", type=int, default=3, help="Retry count per datasheet")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    records = load_records()
    wanted = {value.strip().upper() for value in args.mpn if value.strip()}
    if wanted:
        records = [record for record in records if str(record["canonicalMpn"]).upper() in wanted]

    if not records:
        print("No matching part master records found.", file=sys.stderr)
        return 1

    manifest_entries: list[dict[str, Any]] = []
    success_count = 0

    for record in records:
        file_name = file_name_for(record)
        destination = args.output / file_name
        result = download(str(record["datasheetUrl"]), destination, args.timeout, args.retries)
        entry = {
            "canonicalMpn": record["canonicalMpn"],
            "manufacturerName": record["manufacturerName"],
            "datasheetUrl": record["datasheetUrl"],
            "fileName": file_name,
            "localPath": str(destination),
            **result,
        }
        manifest_entries.append(entry)

        if result["ok"]:
            success_count += 1
            print(f"[OK] {record['canonicalMpn']} -> {destination}")
        else:
            print(f"[FAIL] {record['canonicalMpn']} -> {result['error']}", file=sys.stderr)

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(
        json.dumps(
            {
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "successCount": success_count,
                "totalCount": len(manifest_entries),
                "entries": manifest_entries,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Manifest written to {args.manifest}")
    print(f"Downloaded {success_count}/{len(manifest_entries)} datasheets")
    return 0 if success_count == len(manifest_entries) else 2


if __name__ == "__main__":
    raise SystemExit(main())
