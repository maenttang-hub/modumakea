#!/usr/bin/env python3
"""
Bulk downloader for datasheet candidate catalogs.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import ssl
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "downloads" / "datasheet-candidates.json"
DEFAULT_OUTPUT = ROOT / "downloads" / "bulk-datasheets"
USER_AGENT = (
    "Mozilla/5.0 (compatible; ModuMakeBulkDatasheetFetcher/1.0; "
    "+https://modumake.local)"
)

HOST_POLICY = {
    "www.st.com": {"timeout": 90, "retries": 3},
    "st.com": {"timeout": 90, "retries": 3},
    "www.analog.com": {"timeout": 90, "retries": 3},
    "analog.com": {"timeout": 90, "retries": 3},
    "ww1.microchip.com": {"timeout": 60, "retries": 3},
}


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value)
    cleaned = cleaned.strip("._-")
    return cleaned or "datasheet"


def choose_filename(row: dict, index: int) -> str:
    parsed = urlparse(row["url"])
    name = pathlib.Path(parsed.path).name or f"datasheet_{index}.pdf"
    if "." not in name:
        name = f"{name}.pdf"
    host = parsed.netloc.replace(".", "_")
    return f"{index:04d}_{slugify(row.get('categoryGuess', 'unknown'))}_{host}_{slugify(name)}"


def download_one(row: dict, destination: pathlib.Path, timeout: int, retries: int) -> dict:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/pdf,text/html,application/octet-stream;q=0.9,*/*;q=0.8",
    }
    context = ssl.create_default_context()
    last_error = None
    host = urlparse(row["url"]).netloc.lower()
    policy = HOST_POLICY.get(host, {})
    timeout = int(policy.get("timeout", timeout))
    retries = int(policy.get("retries", retries))

    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(row["url"], headers=headers)
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open("wb") as fp:
                    while True:
                        chunk = response.read(1024 * 64)
                        if not chunk:
                            break
                        fp.write(chunk)
                return {
                    "ok": True,
                    "status": getattr(response, "status", 200),
                    "contentType": response.headers.get_content_type(),
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Bulk download datasheet candidates")
    parser.add_argument("--input", type=pathlib.Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=pathlib.Path, default=None)
    parser.add_argument("--quality", choices=["official", "distributor", "third_party", "all"], default="official")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    rows = payload["rows"]
    if args.quality != "all":
        rows = [row for row in rows if row["quality"] == args.quality]
    if args.limit > 0:
        rows = rows[: args.limit]

    manifest = args.manifest or (args.output / "manifest.json")
    results = []
    success_count = 0

    def flush_manifest() -> None:
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(
            json.dumps(
                {
                    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "input": str(args.input),
                    "quality": args.quality,
                    "successCount": success_count,
                    "totalCount": len(results),
                    "entries": sorted(results, key=lambda item: item["url"]),
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )

    with ThreadPoolExecutor(max_workers=max(args.workers, 1)) as executor:
        futures = {}
        for index, row in enumerate(rows, start=1):
            destination = args.output / choose_filename(row, index)
            future = executor.submit(download_one, row, destination, args.timeout, args.retries)
            futures[future] = (row, destination)

        for future in as_completed(futures):
            row, destination = futures[future]
            result = future.result()
            entry = {
                "url": row["url"],
                "host": row["host"],
                "quality": row["quality"],
                "categoryGuess": row.get("categoryGuess"),
                "fileName": destination.name,
                "localPath": str(destination),
                **result,
            }
            results.append(entry)
            if result["ok"]:
                success_count += 1
                print(f"[OK] {destination.name}")
            else:
                print(f"[FAIL] {row['url']} -> {result['error']}")
            flush_manifest()

    flush_manifest()
    print(f"Manifest written to {manifest}")
    print(f"Downloaded {success_count}/{len(results)} datasheets")
    return 0 if success_count == len(results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
