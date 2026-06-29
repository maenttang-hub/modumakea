#!/usr/bin/env python3
"""
Collect Adafruit sensor module documentation and linked vendor datasheets.

Adafruit usually provides:
- product pages
- Learn guides
- guide PDF downloads
- downloads pages with vendor datasheets / PCB files

This collector builds a module-oriented catalog and also emits normalized
vendor datasheet rows that can be fed into the bulk downloader.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import json
import pathlib
import re
import ssl
import time
import urllib.parse
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "downloads" / "adafruit-sensor-docs.json"
USER_AGENT = (
    "Mozilla/5.0 (compatible; ModuMakeAdafruitCollector/1.0; "
    "+https://modumake.local)"
)
SENSOR_CATEGORY_URL = "https://www.adafruit.com/category/35"
ALLOWED_SUBCATEGORY_NAMES = {
    "accel, gyro, and magnetometers",
    "barometric pressure",
    "biometric",
    "gas / tvoc / air quality",
    "humidity",
    "light / color / photo",
    "liquid / flow",
    "location / gps",
    "motion",
    "proximity",
    "microphone / sound",
    "temperature",
    "touch",
    "weight",
}

EXCLUDE_NAME_TOKENS = (
    "kit",
    "cable",
    "adapter",
    "case",
    "featherwing",
    "bonnet",
    "hat",
    "shield",
    "wire",
    "magnet",
    "glass braid",
    "stemma cable",
    "alligator",
    "header",
    "connector",
)

INCLUDE_NAME_TOKENS = (
    "sensor",
    "imu",
    "accelerometer",
    "gyro",
    "magnetometer",
    "temperature",
    "humidity",
    "pressure",
    "barometric",
    "light",
    "lux",
    "uv",
    "color",
    "gas",
    "air quality",
    "tvoc",
    "co2",
    "touch",
    "proximity",
    "distance",
    "lidar",
    "gesture",
    "gps",
    "gnss",
    "pir",
    "microphone",
    "sound",
    "thermocouple",
    "load cell",
    "biometric",
    "pulse",
    "ecg",
    "flow",
)


def fetch_text(url: str, timeout: int) -> str | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout,
            context=ssl.create_default_context(),
        ) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="ignore")
    except Exception:
        return None


def plain_text(raw: str) -> str:
    text = re.sub(r"<[^>]+>", "", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9._-]+", "-", value.lower()).strip("-")
    return cleaned or "adafruit-guide"


def normalize_url(base_url: str, href: str) -> str:
    return urllib.parse.urljoin(base_url, html.unescape(href.strip()))


def classify_vendor_link(url: str) -> str:
    host = urllib.parse.urlparse(url).netloc.lower()
    if any(token in host for token in ("adafruit.com", "learn.adafruit.com", "cdn-learn.adafruit.com", "cdn-shop.adafruit.com")):
        return "adafruit"
    if any(token in host for token in ("digikey.", "mouser.", "farnell.", "lcsc.", "arrow.", "newark.")):
        return "distributor"
    return "vendor_or_third_party"


def guess_category(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ("imu", "accelerometer", "gyro", "magnetometer", "orientation", "9-dof", "6-dof")):
        return "motion"
    if any(token in lowered for token in ("temperature", "humidity")):
        return "temperature_humidity"
    if any(token in lowered for token in ("barometric", "pressure", "altimeter")):
        return "pressure"
    if any(token in lowered for token in ("gas", "tvoc", "air quality", "co2")):
        return "gas"
    if any(token in lowered for token in ("light", "color", "uv", "lux")):
        return "light"
    if any(token in lowered for token in ("proximity", "tof", "distance", "lidar", "gesture")):
        return "proximity"
    if any(token in lowered for token in ("sound", "microphone")):
        return "sound"
    if any(token in lowered for token in ("flow", "liquid")):
        return "flow"
    if any(token in lowered for token in ("touch", "capacitive")):
        return "touch"
    if any(token in lowered for token in ("gps", "gnss", "location")):
        return "location"
    if any(token in lowered for token in ("heart", "pulse", "biometric", "ecg", "ppg")):
        return "biometric"
    if any(token in lowered for token in ("weight", "load cell")):
        return "weight"
    return "sensor"


def looks_like_sensor_product(name: str) -> bool:
    lowered = name.lower()
    if any(token in lowered for token in EXCLUDE_NAME_TOKENS):
        return False
    return any(token in lowered for token in INCLUDE_NAME_TOKENS)


def extract_chip_candidates(text: str) -> list[str]:
    tokens = re.findall(r"\b[A-Z]{2,}[A-Z0-9/+.-]*\d[A-Z0-9/+.-]*\b", text.upper())
    deny = {"STEMMA", "QT", "QWIIC", "I2C", "SPI", "UART", "GPS", "GNSS", "USB", "LED"}
    unique: list[str] = []
    for token in tokens:
        token = token.strip(".,;:/()")
        if token in deny or len(token) < 4:
            continue
        if token not in unique:
            unique.append(token)
    return unique[:16]


def parse_subcategories(timeout: int) -> list[dict]:
    html_text = fetch_text(SENSOR_CATEGORY_URL, timeout)
    if not html_text:
        return []

    rows = []
    for href, label, count in re.findall(r'<li><a href="(/category/\d+)">([^<]+)\((\d+)\)</a></li>', html_text):
        name = plain_text(label).strip().lower()
        if name not in ALLOWED_SUBCATEGORY_NAMES:
            continue
        rows.append(
            {
                "name": plain_text(label).strip(),
                "countHint": int(count),
                "url": normalize_url(SENSOR_CATEGORY_URL, href),
            }
        )
    return rows


def parse_products_from_category(url: str, timeout: int) -> list[dict]:
    html_text = fetch_text(url, timeout)
    if not html_text:
        return []

    rows = []
    seen: set[str] = set()
    pattern = re.compile(
        r'href="/product/(\d+)"\s+data-pid="(\d+)"\s+data-name="([^"]+)"',
        flags=re.I,
    )
    for product_id_href, product_id_data, name in pattern.findall(html_text):
        product_id = product_id_data or product_id_href
        product_name = html.unescape(name).strip()
        if not looks_like_sensor_product(product_name):
            continue
        if product_id in seen:
            continue
        seen.add(product_id)
        rows.append(
            {
                "productId": product_id,
                "productName": product_name,
                "productUrl": f"https://www.adafruit.com/product/{product_id}",
            }
        )
    return rows


def extract_guide_links(html_text: str, base_url: str) -> list[str]:
    links = []
    for href in re.findall(r'href="([^"]+)"', html_text):
        if not href.startswith("/adafruit-"):
            continue
        link = normalize_url(base_url, href)
        if "/category/" in link or "/assets/" in link:
            continue
        if link not in links:
            links.append(link.rstrip("/"))
    return links


def parse_downloads_page(downloads_url: str, timeout: int) -> dict:
    html_text = fetch_text(downloads_url, timeout)
    if not html_text:
        return {"vendorDatasheets": [], "downloadLinks": []}

    all_links = sorted(set(re.findall(r'https?://[^"\'>\s<>]+', html_text)))
    vendor_datasheets = []
    general_links = []
    for link in all_links:
        normalized = link.rstrip(".,);")
        lowered = normalized.lower()
        if normalized not in general_links:
            general_links.append(normalized)
        if not lowered.endswith(".pdf"):
            continue
        if any(token in lowered for token in ("cdn-learn.adafruit.com/downloads/pdf/", "cdn-shop.adafruit.com/")):
            continue
        if "datasheet" in lowered or "/product-files/" in lowered or "/technical-documentation/" in lowered or "/resource/en/datasheet/" in lowered:
            if normalized not in vendor_datasheets:
                vendor_datasheets.append(normalized)

    return {
        "vendorDatasheets": vendor_datasheets,
        "downloadLinks": general_links[:80],
    }


def collect_product_docs(product: dict, timeout: int) -> dict | None:
    product_id = product["productId"]
    guides_index_url = f"https://learn.adafruit.com/products/{product_id}/guides"
    guides_html = fetch_text(guides_index_url, timeout)
    if not guides_html:
        return None

    guide_links = extract_guide_links(guides_html, guides_index_url)
    if not guide_links:
        return None

    canonical_guide_url = guide_links[0]
    guide_slug = urllib.parse.urlparse(canonical_guide_url).path.strip("/").split("/")[0]
    guide_pdf_url = f"https://cdn-learn.adafruit.com/downloads/pdf/{guide_slug}.pdf"
    downloads_url = f"https://learn.adafruit.com/{guide_slug}/downloads"
    downloads_meta = parse_downloads_page(downloads_url, timeout)

    combined_text = f"{product['productName']} {guide_slug}"
    chip_candidates = extract_chip_candidates(combined_text)
    for datasheet_url in downloads_meta["vendorDatasheets"]:
        chip_candidates.extend(extract_chip_candidates(datasheet_url))
    chip_candidates = list(dict.fromkeys(chip_candidates))[:16]

    return {
        **product,
        "guidesIndexUrl": guides_index_url,
        "guideUrl": canonical_guide_url,
        "guidePdfUrl": guide_pdf_url,
        "downloadsUrl": downloads_url,
        "guideSlug": guide_slug,
        "chipCandidates": chip_candidates,
        "categoryGuess": guess_category(product["productName"]),
        "vendorDatasheets": downloads_meta["vendorDatasheets"],
        "downloadLinks": downloads_meta["downloadLinks"],
    }


def build_datasheet_rows(products: list[dict]) -> list[dict]:
    rows = []
    seen: set[str] = set()

    for product in products:
        guide_url = product["guidePdfUrl"]
        if guide_url not in seen:
            seen.add(guide_url)
            rows.append(
                {
                    "url": guide_url,
                    "host": urllib.parse.urlparse(guide_url).netloc.lower(),
                    "vendor": "adafruit",
                    "vendorLabel": "Adafruit Learn",
                    "sourceType": "adafruit_guide_pdf",
                    "sourcePath": product["guideUrl"],
                    "titleHint": product["productName"],
                    "categoryGuess": product["categoryGuess"],
                    "quality": "official",
                    "canonicalMpn": f"ADAFRUIT-{product['productId']}",
                    "partNumbers": [f"ADAFRUIT-{product['productId']}"] + product["chipCandidates"][:8],
                    "notes": product["productName"],
                }
            )

        for datasheet_url in product["vendorDatasheets"]:
            if datasheet_url in seen:
                continue
            seen.add(datasheet_url)
            rows.append(
                {
                    "url": datasheet_url,
                    "host": urllib.parse.urlparse(datasheet_url).netloc.lower(),
                    "vendor": "adafruit-linked",
                    "vendorLabel": "Vendor datasheet linked by Adafruit",
                    "sourceType": "adafruit_downloads_datasheet",
                    "sourcePath": product["downloadsUrl"],
                    "titleHint": product["productName"],
                    "categoryGuess": product["categoryGuess"],
                    "quality": "official" if classify_vendor_link(datasheet_url) != "distributor" else "distributor",
                    "canonicalMpn": product["chipCandidates"][0] if product["chipCandidates"] else f"ADAFRUIT-{product['productId']}",
                    "partNumbers": product["chipCandidates"][:8],
                    "notes": product["productName"],
                }
            )

    rows.sort(key=lambda row: (row["vendor"], row["categoryGuess"], row["url"]))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect Adafruit sensor guides and linked vendor datasheets")
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--workers", type=int, default=10)
    args = parser.parse_args()

    subcategories = parse_subcategories(args.timeout)
    product_map: dict[str, dict] = {}
    for subcategory in subcategories:
        for product in parse_products_from_category(subcategory["url"], args.timeout):
            row = product_map.setdefault(product["productId"], {**product, "subcategoryNames": []})
            if subcategory["name"] not in row["subcategoryNames"]:
                row["subcategoryNames"].append(subcategory["name"])

    products = sorted(product_map.values(), key=lambda row: int(row["productId"]))
    collected_products = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(args.workers, 1)) as executor:
        future_map = {
            executor.submit(collect_product_docs, product, args.timeout): product
            for product in products
        }
        for future in concurrent.futures.as_completed(future_map):
            row = future.result()
            if row:
                collected_products.append(row)

    collected_products.sort(key=lambda row: int(row["productId"]))
    datasheet_rows = build_datasheet_rows(collected_products)

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceCategoryUrl": SENSOR_CATEGORY_URL,
        "subcategoryCount": len(subcategories),
        "productCount": len(collected_products),
        "datasheetRowCount": len(datasheet_rows),
        "subcategories": subcategories,
        "products": collected_products,
        "rows": datasheet_rows,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(collected_products)} products and {len(datasheet_rows)} rows to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
