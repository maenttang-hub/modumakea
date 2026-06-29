#!/usr/bin/env python3
"""
Extract datasheet candidates from local KiCad/sample assets and starter part master.

Outputs a normalized JSON catalog that can be fed into the bulk downloader.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
from collections import defaultdict
from urllib.parse import urlparse


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "downloads" / "datasheet-candidates.json"
LOCAL_SCAN_ROOTS = [
    ROOT / "tests" / "kicad_samples",
    ROOT / "src" / "lib" / "part-master-catalog.ts",
]
TEXT_SUFFIXES = {
    ".kicad_sym",
    ".dcm",
    ".lib",
    ".sch",
    ".kicad_mod",
    ".md",
    ".ts",
    ".tsx",
    ".sql",
    ".txt",
}
OFFICIAL_HOST_HINTS = (
    "ti.com",
    "analog.com",
    "bosch-sensortec.com",
    "st.com",
    "microchip.com",
    "espressif.com",
    "raspberrypi.com",
    "nxp.com",
    "sensirion.com",
    "onsemi.com",
    "infineon.com",
    "nexperia.com",
    "westerndesigncenter.com",
    "monolithicpower.com",
    "richtek.com",
    "coilcraft.com",
    "jst-mfg.com",
    "aimtec.com",
    "diodes.com",
    "issi.com",
    "wch-ic.com",
    "olimex.com",
)


def normalize_vendor_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    scheme = "https" if host in {"ww1.microchip.com", "www.st.com", "st.com", "www.analog.com", "analog.com"} else parsed.scheme
    path = parsed.path
    if host in {"www.st.com", "st.com"} and path.startswith("/st-web-ui/static/active/en/resource/technical/document/datasheet/"):
        path = path.replace("/st-web-ui/static/active/en/resource/technical/document/datasheet/", "/resource/en/datasheet/")
    return parsed._replace(scheme=scheme, path=path).geturl()


def clean_url(raw: str) -> str | None:
    value = raw.strip().strip('"').strip("'").rstrip(".,;")
    value = value.replace("\\n", "").replace("\n", "")
    value = value.rstrip("'").rstrip('"')
    if not value.startswith(("http://", "https://")):
        return None
    if "github.com/" in value and "/blob/" in value:
        return None
    if "google.com/url?" in value:
        return None
    return normalize_vendor_url(value)


def classify_host(host: str) -> str:
    host = host.lower()
    if any(hint in host for hint in OFFICIAL_HOST_HINTS):
        return "official"
    if any(hint in host for hint in ("mouser.", "digikey.", "farnell.", "lcsc.", "verical.", "distrelec.")):
        return "distributor"
    return "third_party"


def guess_category(url: str, file_path: str) -> str:
    text = f"{url} {file_path}".lower()
    if any(token in text for token in ("esp32", "rp2040", "rp2350", "atmega", "sam-", "stm32", "imxrt", "ch32", "allwinner")):
        return "mcu"
    if any(token in text for token in ("bmp", "bme", "vl53", "mpu-", "bma", "lm35", "ds18", "sensor", "imu", "tof")):
        return "sensor"
    if any(token in text for token in ("board", "olimex", "raspberry", "wroom", "module")):
        return "board_or_module"
    if any(token in text for token in ("74hc", "74lvc", "mfrc", "bq", "tps", "axp", "pam", "sy", "rt", "w25q", "adm", "pca")):
        return "ic"
    return "unknown"


def scan_text_file(path: pathlib.Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    urls: list[str] = []
    for match in re.finditer(r"https?://[^\s)>\"]+", text):
        maybe = clean_url(match.group(0))
        if not maybe:
            continue
        if not any(token in maybe.lower() for token in ("datasheet", ".pdf", "download")):
            continue
        urls.append(maybe)
    return urls


def load_starter_part_master() -> list[dict]:
    seed_json = ROOT / "scripts" / "component-catalog" / "generated" / "part-master.seed.json"
    if not seed_json.exists():
        return []
    rows = json.loads(seed_json.read_text(encoding="utf-8"))
    records = []
    for row in rows:
        records.append({
            "url": row["datasheet_url"],
            "host": urlparse(row["datasheet_url"]).netloc.lower(),
            "sourceType": "starter_part_master",
            "sourcePath": str(seed_json.relative_to(ROOT)),
            "titleHint": row["canonical_mpn"],
            "categoryGuess": row.get("specs_json", {}).get("category", "unknown"),
            "quality": classify_host(urlparse(row["datasheet_url"]).netloc.lower()),
        })
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract datasheet candidate catalog")
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    grouped: dict[str, dict] = {}
    evidence = defaultdict(list)

    for root in LOCAL_SCAN_ROOTS:
        if root.is_file():
            paths = [root]
        else:
            paths = [path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES]

        for path in paths:
            for url in scan_text_file(path):
                host = urlparse(url).netloc.lower()
                rel = str(path.relative_to(ROOT))
                if url not in grouped:
                    grouped[url] = {
                        "url": url,
                        "host": host,
                        "sourceType": "local_scan",
                        "sourcePath": rel,
                        "titleHint": pathlib.Path(urlparse(url).path).name or host,
                        "categoryGuess": guess_category(url, rel),
                        "quality": classify_host(host),
                    }
                evidence[url].append(rel)

    for record in load_starter_part_master():
        url = record["url"]
        if url not in grouped:
            grouped[url] = record
        else:
            grouped[url]["sourceType"] = "starter_part_master"
            grouped[url]["quality"] = "official"
        evidence[url].append(record["sourcePath"])

    rows = []
    for url, record in grouped.items():
        rows.append({
            **record,
            "evidenceCount": len(sorted(set(evidence[url]))),
            "evidencePaths": sorted(set(evidence[url]))[:20],
        })

    rows.sort(key=lambda row: (row["quality"] != "official", row["host"], row["url"]))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "generatedAt": pathlib.Path(__file__).stat().st_mtime,
                "totalCount": len(rows),
                "officialCount": sum(1 for row in rows if row["quality"] == "official"),
                "rows": rows,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(rows)} datasheet candidates -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
