#!/usr/bin/env python3
"""
Vendor-domain crawler for official datasheet discovery.

This stays inside official vendor domains and collects PDF / datasheet-like URLs.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import deque
from html.parser import HTMLParser
from typing import Iterable


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "downloads" / "vendor-datasheet-candidates.json"
DEFAULT_OUTPUT_DIR = ROOT / "downloads" / "vendor-crawl"
USER_AGENT = (
    "Mozilla/5.0 (compatible; ModuMakeVendorCrawler/1.0; "
    "+https://modumake.local)"
)

VENDOR_CONFIGS = {
    "microchip": {
        "label": "Microchip",
        "allowed_hosts": {"www.microchip.com", "ww1.microchip.com"},
        "start_urls": [
            "https://www.microchip.com/en-us/products/microcontrollers-and-microprocessors/8-bit-mcus",
            "https://www.microchip.com/en-us/products/microcontrollers-and-microprocessors/32-bit-mpus",
            "https://www.microchip.com/en-us/products/sensors-and-motor-drive/sensors",
        ],
    },
    "st": {
        "label": "STMicroelectronics",
        "allowed_hosts": {"www.st.com", "st.com"},
        "start_urls": [
            "https://www.st.com/en/microcontrollers-microprocessors.html",
            "https://www.st.com/en/mems-and-sensors.html",
            "https://www.st.com/en/power-management.html",
        ],
    },
    "adi": {
        "label": "Analog Devices",
        "allowed_hosts": {"www.analog.com", "analog.com"},
        "start_urls": [
            "https://www.analog.com/en/products.html",
            "https://www.analog.com/en/products/sensors-mems.html",
            "https://www.analog.com/en/products/microcontrollers.html",
        ],
    },
    "nxp": {
        "label": "NXP",
        "allowed_hosts": {"www.nxp.com", "nxp.com"},
        "start_urls": [
            "https://www.nxp.com/products",
            "https://www.nxp.com/products/processors-and-microcontrollers",
            "https://www.nxp.com/products/wireless-connectivity",
        ],
    },
    "espressif": {
        "label": "Espressif",
        "allowed_hosts": {"www.espressif.com", "espressif.com"},
        "start_urls": [
            "https://www.espressif.com/en/products/modules",
            "https://www.espressif.com/en/products/socs",
            "https://www.espressif.com/en/support/documents/technical-documents",
        ],
    },
    "raspberrypi": {
        "label": "Raspberry Pi",
        "allowed_hosts": {"www.raspberrypi.com", "datasheets.raspberrypi.com"},
        "start_urls": [
            "https://www.raspberrypi.com/documentation/microcontrollers/",
            "https://www.raspberrypi.com/products/raspberry-pi-pico/",
            "https://datasheets.raspberrypi.com/",
        ],
    },
    "bosch": {
        "label": "Bosch Sensortec",
        "allowed_hosts": {"www.bosch-sensortec.com", "bosch-sensortec.com"},
        "start_urls": [
            "https://www.bosch-sensortec.com/products/",
            "https://www.bosch-sensortec.com/products/environmental-sensors/",
            "https://www.bosch-sensortec.com/products/motion-sensors/",
        ],
    },
}


class LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        for name, value in attrs:
            if name.lower() == "href" and value:
                self.links.append(value)


def normalize_url(base_url: str, href: str) -> str | None:
    href = href.strip()
    if not href or href.startswith(("javascript:", "mailto:", "#")):
        return None
    absolute = urllib.parse.urljoin(base_url, href)
    parsed = urllib.parse.urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    quoted_path = urllib.parse.quote(parsed.path, safe="/:%._-()")
    quoted_query = urllib.parse.quote_plus(parsed.query, safe="=&:%._-()")
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, quoted_path, "", quoted_query, ""))


def fetch_text(url: str, timeout: int) -> tuple[str | None, str | None]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            content_type = response.headers.get_content_type()
            if content_type == "application/pdf":
                return None, "application/pdf"
            charset = response.headers.get_content_charset() or "utf-8"
            body = response.read().decode(charset, errors="ignore")
            return body, content_type
    except Exception:
        return None, None


def looks_like_datasheet(url: str) -> bool:
    lowered = url.lower()
    if any(token in lowered for token in ("terms_and_conditions", "terms-and-conditions", "getting_started_guide", "user_guide", "hardware_design_guide")):
        return False
    if lowered.endswith("/downloads/"):
        return False
    return (
        lowered.endswith(".pdf")
        or "/datasheet" in lowered
        or "datasheet" in lowered
        or "/docs/en/data-sheet/" in lowered
        or "/downloads/" in lowered
        or "document/" in lowered
    )


def guess_category(url: str) -> str:
    lowered = url.lower()
    if any(token in lowered for token in ("esp32", "rp2040", "rp2350", "atmega", "stm32", "imxrt", "sam-", "mcu", "microcontroller", "processor")):
        return "mcu"
    if any(token in lowered for token in ("sensor", "imu", "bme", "bmp", "vl53", "sht", "tof", "temperature", "pressure")):
        return "sensor"
    if any(token in lowered for token in ("module", "wroom", "pico", "board")):
        return "board_or_module"
    if any(token in lowered for token in ("power", "regulator", "driver", "interface", "transceiver", "rfid", "adc", "dac")):
        return "ic"
    return "unknown"


def crawl_vendor(vendor_key: str, config: dict, max_pages: int, timeout: int, delay_ms: int) -> list[dict]:
    allowed_hosts = config["allowed_hosts"]
    queue = deque(config["start_urls"])
    visited: set[str] = set()
    discovered: dict[str, dict] = {}

    while queue and len(visited) < max_pages:
        url = queue.popleft()
        if url in visited:
            continue
        visited.add(url)
        body, content_type = fetch_text(url, timeout)
        if content_type == "application/pdf":
            discovered.setdefault(
                url,
                {
                    "url": url,
                    "host": urllib.parse.urlparse(url).netloc.lower(),
                    "vendor": vendor_key,
                    "vendorLabel": config["label"],
                    "sourceType": "vendor_crawl",
                    "sourcePath": url,
                    "titleHint": pathlib.Path(urllib.parse.urlparse(url).path).name or vendor_key,
                    "categoryGuess": guess_category(url),
                    "quality": "official",
                },
            )
            continue
        if not body:
            continue

        parser = LinkExtractor()
        parser.feed(body)
        for href in parser.links:
            normalized = normalize_url(url, href)
            if not normalized:
                continue
            host = urllib.parse.urlparse(normalized).netloc.lower()
            if host not in allowed_hosts:
                continue
            if looks_like_datasheet(normalized):
                discovered.setdefault(
                    normalized,
                    {
                        "url": normalized,
                        "host": host,
                        "vendor": vendor_key,
                        "vendorLabel": config["label"],
                        "sourceType": "vendor_crawl",
                        "sourcePath": url,
                        "titleHint": pathlib.Path(urllib.parse.urlparse(normalized).path).name or vendor_key,
                        "categoryGuess": guess_category(normalized),
                        "quality": "official",
                    },
                )
            elif normalized not in visited and len(queue) < max_pages * 4:
                queue.append(normalized)

        if delay_ms > 0:
            time.sleep(delay_ms / 1000)

    return sorted(discovered.values(), key=lambda row: row["url"])


def write_vendor_payload(path: pathlib.Path, vendor_key: str, rows: list[dict], max_pages: int) -> None:
    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "vendor": vendor_key,
        "totalCount": len(rows),
        "maxPages": max_pages,
        "rows": rows,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def merge_rows(rows_by_vendor: dict[str, list[dict]]) -> list[dict]:
    deduped: dict[str, dict] = {}
    for rows in rows_by_vendor.values():
        for row in rows:
            deduped[row["url"]] = row
    return sorted(deduped.values(), key=lambda row: (row["vendor"], row["url"]))


def iter_vendor_keys(raw: str) -> Iterable[str]:
    if raw.strip().lower() == "all":
        return VENDOR_CONFIGS.keys()
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Crawl official vendor domains for datasheets")
    parser.add_argument("--vendors", default="all", help="Comma-separated vendor keys or 'all'")
    parser.add_argument("--max-pages", type=int, default=30)
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--delay-ms", type=int, default=250)
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--output-dir", type=pathlib.Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--continue-on-error", action="store_true")
    parser.add_argument("--merge-only", action="store_true")
    args = parser.parse_args()

    selected_keys = list(iter_vendor_keys(args.vendors))
    rows_by_vendor: dict[str, list[dict]] = {}

    for key in selected_keys:
        vendor_path = args.output_dir / f"{key}.json"

        if args.merge_only:
            if not vendor_path.exists():
                print(f"{key}: skipped, no existing checkpoint at {vendor_path}")
                continue
            payload = json.loads(vendor_path.read_text(encoding="utf-8"))
            rows_by_vendor[key] = payload.get("rows", [])
            print(f"{key}: loaded {len(rows_by_vendor[key])} rows from checkpoint")
            continue

        config = VENDOR_CONFIGS.get(key)
        if not config:
            raise SystemExit(f"Unknown vendor key: {key}")

        try:
            vendor_rows = crawl_vendor(key, config, args.max_pages, args.timeout, args.delay_ms)
            write_vendor_payload(vendor_path, key, vendor_rows, args.max_pages)
            rows_by_vendor[key] = vendor_rows
            print(f"{key}: discovered {len(vendor_rows)} candidates -> {vendor_path}")
        except KeyboardInterrupt:
            raise
        except Exception as exc:  # noqa: BLE001
            print(f"{key}: failed with {type(exc).__name__}: {exc}")
            if vendor_path.exists():
                payload = json.loads(vendor_path.read_text(encoding="utf-8"))
                rows_by_vendor[key] = payload.get("rows", [])
                print(f"{key}: preserved {len(rows_by_vendor[key])} checkpoint rows from {vendor_path}")
            if not args.continue_on_error:
                raise

    merged_rows = merge_rows(rows_by_vendor)

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "vendors": selected_keys,
        "totalCount": len(merged_rows),
        "rows": merged_rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(merged_rows)} vendor candidates -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
