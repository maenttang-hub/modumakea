#!/usr/bin/env python3
"""
Download mixed document catalogs (PDF + HTML) from normalized rows JSON.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import pathlib
import re
import ssl
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse


ROOT = pathlib.Path(__file__).resolve().parents[2]
USER_AGENT = (
    "Mozilla/5.0 (compatible; ModuMakeDocumentFetcher/1.0; "
    "+https://modumake.local)"
)


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._-")
    return cleaned or "document"


def guess_extension(url: str, content_type: str | None) -> str:
    path = urlparse(url).path
    suffix = pathlib.Path(path).suffix.lower()
    if suffix in {".pdf", ".html", ".htm", ".md", ".txt"}:
        return suffix
    if content_type:
        if "pdf" in content_type:
            return ".pdf"
        if "html" in content_type:
            return ".html"
        guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
        if guessed:
            return guessed
    return ".bin"


def choose_stem(row: dict, index: int) -> str:
    parsed = urlparse(row["url"])
    host = parsed.netloc.replace(".", "_")
    name = pathlib.Path(parsed.path).name or row.get("titleHint") or f"document_{index}"
    stem = pathlib.Path(name).stem if "." in name else name
    return f"{index:04d}_{slugify(row.get('categoryGuess', 'unknown'))}_{host}_{slugify(stem)}"


def download_one(row: dict, output_dir: pathlib.Path, index: int, timeout: int, retries: int) -> dict:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/pdf,text/html,application/octet-stream;q=0.9,*/*;q=0.8",
    }
    context = ssl.create_default_context()
    last_error = None

    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(row["url"], headers=headers)
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                content_type = response.headers.get("Content-Type", "")
                ext = guess_extension(row["url"], content_type)
                destination = output_dir / f"{choose_stem(row, index)}{ext}"
                output_dir.mkdir(parents=True, exist_ok=True)
                with destination.open("wb") as fp:
                    while True:
                        chunk = response.read(1024 * 64)
                        if not chunk:
                            break
                        fp.write(chunk)
                return {
                    "ok": True,
                    "status": getattr(response, "status", 200),
                    "contentType": content_type,
                    "size": destination.stat().st_size,
                    "attempt": attempt,
                    "fileName": destination.name,
                    "localPath": str(destination),
                }
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(min(attempt, 3))

    return {
        "ok": False,
        "error": f"{type(last_error).__name__}: {last_error}",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Download mixed document catalogs")
    parser.add_argument("--input", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--manifest", type=pathlib.Path, default=None)
    parser.add_argument("--quality", choices=["official", "distributor", "third_party", "all"], default="official")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    rows = payload["rows"]
    if args.quality != "all":
        rows = [row for row in rows if row.get("quality") == args.quality]
    if args.limit > 0:
        rows = rows[: args.limit]

    manifest_path = args.manifest or (args.output / "manifest.json")
    results = []
    success_count = 0

    def flush_manifest() -> None:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
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
        futures = {
            executor.submit(download_one, row, args.output, index, args.timeout, args.retries): row
            for index, row in enumerate(rows, start=1)
        }
        for future in as_completed(futures):
            row = futures[future]
            result = future.result()
            entry = {
                "url": row["url"],
                "host": row["host"],
                "vendor": row.get("vendor"),
                "quality": row.get("quality"),
                "categoryGuess": row.get("categoryGuess"),
                **result,
            }
            results.append(entry)
            if result["ok"]:
                success_count += 1
                print(f"[OK] {result['fileName']}")
            else:
                print(f"[FAIL] {row['url']} -> {result['error']}")
            flush_manifest()

    flush_manifest()
    print(f"Manifest written to {manifest_path}")
    print(f"Downloaded {success_count}/{len(results)} documents")
    return 0 if success_count == len(results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
