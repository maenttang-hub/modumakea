#!/usr/bin/env python3
"""
Collect frequently used sensor module docs from module vendors.

Vendors:
- Adafruit
- SparkFun
- Seeed Studio
- DFRobot
- Keyestudio

Outputs a normalized catalog containing:
- official module guide/wiki/product pages
- linked official PDF datasheets / schematics / layouts when available
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
DEFAULT_OUTPUT = ROOT / "downloads" / "module-vendor-sensor-docs.json"
USER_AGENT = (
    "Mozilla/5.0 (compatible; ModuMakeModuleSensorCollector/1.0; "
    "+https://modumake.local)"
)

SPARKFUN_SENSOR_URL = "https://www.sparkfun.com/sensors.html"
SEEED_GROVE_SENSOR_URL = "https://wiki.seeedstudio.com/Grove_Sensor_Intro/"
DFROBOT_CATEGORY_URLS = [
    "https://wiki.dfrobot.com/category-64/",
    "https://wiki.dfrobot.com/category-68/",
    "https://wiki.dfrobot.com/category-57/",
    "https://wiki.dfrobot.com/category-204/",
    "https://wiki.dfrobot.com/category-201/",
    "https://wiki.dfrobot.com/category-85/",
    "https://wiki.dfrobot.com/category-63/",
    "https://wiki.dfrobot.com/category-313/",
    "https://wiki.dfrobot.com/category-65/",
    "https://wiki.dfrobot.com/category-200/",
    "https://wiki.dfrobot.com/category-55/",
    "https://wiki.dfrobot.com/category-58/",
    "https://wiki.dfrobot.com/category-60/",
    "https://wiki.dfrobot.com/category-229/",
]
KEYESTUDIO_WIKI_URL = "https://wiki.keyestudio.com/Main_Page"

EXCLUDE_NAME_TOKENS = (
    "kit",
    "starter",
    "shield",
    "board",
    "expansion",
    "featherwing",
    "hat",
    "bonnet",
    "case",
    "cable",
    "adapter",
    "robot",
    "car",
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
    "radar",
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
    "moisture",
    "ultrasonic",
    "vibration",
    "flame",
    "water",
    "soil",
    "alcohol",
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


def normalize_url(base_url: str, href: str) -> str:
    return urllib.parse.urljoin(base_url, html.unescape(href.strip()))


def guess_category(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ("imu", "accelerometer", "gyro", "magnetometer", "orientation", "9-dof", "6-dof", "10dof")):
        return "motion"
    if any(token in lowered for token in ("temperature", "humidity", "thermocouple")):
        return "temperature_humidity"
    if any(token in lowered for token in ("barometric", "pressure", "altimeter")):
        return "pressure"
    if any(token in lowered for token in ("gas", "tvoc", "air quality", "co2", "alcohol")):
        return "gas"
    if any(token in lowered for token in ("light", "color", "uv", "lux")):
        return "light"
    if any(token in lowered for token in ("proximity", "tof", "distance", "lidar", "gesture", "ultrasonic", "radar")):
        return "proximity"
    if any(token in lowered for token in ("sound", "microphone")):
        return "sound"
    if any(token in lowered for token in ("flow", "liquid")):
        return "flow"
    if any(token in lowered for token in ("touch", "capacitive")):
        return "touch"
    if any(token in lowered for token in ("gps", "gnss", "location")):
        return "location"
    if any(token in lowered for token in ("heart", "pulse", "biometric", "ecg", "ppg", "fingerprint")):
        return "biometric"
    if any(token in lowered for token in ("weight", "load cell")):
        return "weight"
    return "sensor"


def looks_like_sensor_name(name: str) -> bool:
    lowered = name.lower()
    if any(token in lowered for token in EXCLUDE_NAME_TOKENS):
        return False
    return any(token in lowered for token in INCLUDE_NAME_TOKENS)


def extract_chip_candidates(text: str) -> list[str]:
    tokens = re.findall(r"\b[A-Z]{2,}[A-Z0-9/+.-]*\d[A-Z0-9/+.-]*\b", text.upper())
    deny = {"I2C", "SPI", "UART", "USB", "LED", "QT", "QWIIC", "GROVE", "DFROBOT", "GPS", "GNSS"}
    unique: list[str] = []
    for token in tokens:
        token = token.strip(".,;:/()")
        if len(token) < 4 or token in deny:
            continue
        if token not in unique:
            unique.append(token)
    return unique[:12]


def pdf_links_from_html(html_text: str) -> list[str]:
    return sorted(set(re.findall(r'https?://[^"\']+\.pdf[^"\']*', html_text, flags=re.I)))


def collect_sparkfun(timeout: int, workers: int, skip_linked_assets: bool) -> list[dict]:
    html_text = fetch_text(SPARKFUN_SENSOR_URL, timeout)
    if not html_text:
        return []

    product_urls = sorted(set(re.findall(r'product-item-info.*?<a href="(https://www\.sparkfun\.com/[^"]+\.html)"', html_text, flags=re.S)))

    def parse_product(url: str) -> list[dict]:
        page = fetch_text(url, timeout)
        if not page:
            return []

        title_match = re.search(r'<title>([^<]+)</title>', page, flags=re.I)
        title = plain_text(title_match.group(1).split(" - SparkFun Electronics")[0]) if title_match else url.rsplit("/", 1)[-1]
        if not looks_like_sensor_name(title):
            return []

        rows = [
            {
                "url": url,
                "host": urllib.parse.urlparse(url).netloc.lower(),
                "vendor": "sparkfun",
                "vendorLabel": "SparkFun",
                "sourceType": "sparkfun_product_page",
                "sourcePath": SPARKFUN_SENSOR_URL,
                "titleHint": title,
                "categoryGuess": guess_category(title),
                "quality": "official",
                "canonicalMpn": title,
                "partNumbers": extract_chip_candidates(title),
                "notes": title,
            }
        ]
        for link in sorted(set(re.findall(r'https://learn\.sparkfun\.com/tutorials/[^"\']+', page))):
            rows.append(
                {
                    "url": link.rstrip(".,);"),
                    "host": urllib.parse.urlparse(link).netloc.lower(),
                    "vendor": "sparkfun",
                    "vendorLabel": "SparkFun Learn",
                    "sourceType": "sparkfun_learn_doc",
                    "sourcePath": url,
                    "titleHint": title,
                    "categoryGuess": guess_category(title),
                    "quality": "official",
                    "canonicalMpn": title,
                    "partNumbers": extract_chip_candidates(title),
                    "notes": title,
                }
            )
        if not skip_linked_assets:
            for link in pdf_links_from_html(page):
                rows.append(
                    {
                        "url": link.rstrip(".,);"),
                        "host": urllib.parse.urlparse(link).netloc.lower(),
                        "vendor": "sparkfun-linked",
                        "vendorLabel": "Linked by SparkFun",
                        "sourceType": "sparkfun_linked_pdf",
                        "sourcePath": url,
                        "titleHint": title,
                        "categoryGuess": guess_category(title),
                        "quality": "official",
                        "canonicalMpn": title,
                        "partNumbers": extract_chip_candidates(f"{title} {link}"),
                        "notes": title,
                    }
                )
        return rows

    rows: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(workers, 1)) as executor:
        for parsed_rows in executor.map(parse_product, product_urls):
            rows.extend(parsed_rows)
    return rows


def collect_seeed(timeout: int) -> list[dict]:
    html_text = fetch_text(SEEED_GROVE_SENSOR_URL, timeout)
    if not html_text:
        return []

    wiki_links: list[str] = []
    for raw in re.findall(r'href=([^\s>]+)', html_text):
        raw = raw.strip("\"'")
        raw = html.unescape(raw)
        if raw.startswith("/Grove-") or raw.startswith("/Radar_") or raw.startswith("/mmwave") or raw.startswith("/Seeed_"):
            wiki_links.append("https://wiki.seeedstudio.com" + raw)
        elif raw.startswith("https://wiki.seeedstudio.com/") and any(token in raw for token in ("Grove-", "Radar_", "mmwave")):
            wiki_links.append(raw)
        elif raw.startswith("https://files.seeedstudio.com/") and raw.lower().endswith(".pdf"):
            wiki_links.append(raw)

    rows: list[dict] = []
    for link in sorted(set(wiki_links)):
        if link.lower().endswith(".pdf"):
            title = pathlib.Path(urllib.parse.urlparse(link).path).name
            rows.append(
                {
                    "url": link,
                    "host": urllib.parse.urlparse(link).netloc.lower(),
                    "vendor": "seeed-linked",
                    "vendorLabel": "Linked by Seeed Wiki",
                    "sourceType": "seeed_linked_pdf",
                    "sourcePath": SEEED_GROVE_SENSOR_URL,
                    "titleHint": title,
                    "categoryGuess": guess_category(title),
                    "quality": "official",
                    "canonicalMpn": title,
                    "partNumbers": extract_chip_candidates(title),
                    "notes": title,
                }
            )
            continue

        slug = urllib.parse.urlparse(link).path.strip("/").split("/")[0]
        title = plain_text(slug.replace("-", " ").replace("_", " "))
        rows.append(
            {
                "url": link.rstrip("/") + "/",
                "host": urllib.parse.urlparse(link).netloc.lower(),
                "vendor": "seeed",
                "vendorLabel": "Seeed Studio Wiki",
                "sourceType": "seeed_wiki_doc",
                "sourcePath": SEEED_GROVE_SENSOR_URL,
                "titleHint": title,
                "categoryGuess": guess_category(title),
                "quality": "official",
                "canonicalMpn": title,
                "partNumbers": extract_chip_candidates(title),
                "notes": title,
            }
        )
    return rows


def collect_dfrobot(timeout: int, skip_linked_assets: bool) -> list[dict]:
    rows: list[dict] = []
    for category_url in DFROBOT_CATEGORY_URLS:
        html_text = fetch_text(category_url, timeout)
        if not html_text:
            continue

        for slug, name_html in re.findall(r'href="/((?:sen|dfr|bos)\d+)/"[^>]*>(.*?)</a>', html_text, flags=re.S | re.I):
            title = plain_text(name_html)
            if not looks_like_sensor_name(title):
                continue

            doc_url = f"https://wiki.dfrobot.com/{slug.lower()}/"
            category = guess_category(title)
            rows.append(
                {
                    "url": doc_url,
                    "host": urllib.parse.urlparse(doc_url).netloc.lower(),
                    "vendor": "dfrobot",
                    "vendorLabel": "DFRobot Wiki",
                    "sourceType": "dfrobot_wiki_doc",
                    "sourcePath": category_url,
                    "titleHint": title,
                    "categoryGuess": category,
                    "quality": "official",
                    "canonicalMpn": title,
                    "partNumbers": extract_chip_candidates(title),
                    "notes": title,
                }
            )

            if skip_linked_assets:
                continue
            page = fetch_text(doc_url, timeout)
            if not page:
                continue
            for link in pdf_links_from_html(page):
                rows.append(
                    {
                        "url": link.rstrip(".,);"),
                        "host": urllib.parse.urlparse(link).netloc.lower(),
                        "vendor": "dfrobot-linked",
                        "vendorLabel": "Linked by DFRobot Wiki",
                        "sourceType": "dfrobot_linked_pdf",
                        "sourcePath": doc_url,
                        "titleHint": title,
                        "categoryGuess": category,
                        "quality": "official",
                        "canonicalMpn": title,
                        "partNumbers": extract_chip_candidates(f"{title} {link}"),
                        "notes": title,
                    }
                )
    return rows


def collect_keyestudio(timeout: int) -> list[dict]:
    html_text = fetch_text(KEYESTUDIO_WIKI_URL, timeout)
    if not html_text:
        return []

    rows: list[dict] = []
    for href, title in re.findall(r'<a href="(/[^"#]+)" title="([^"]+)"', html_text, flags=re.I):
        clean_title = plain_text(title)
        lowered = clean_title.lower()
        if not looks_like_sensor_name(clean_title):
            continue
        if any(token in lowered for token in ("kit", "shield", "starter", "board", "robot", "car")):
            continue
        doc_url = normalize_url(KEYESTUDIO_WIKI_URL, href)
        rows.append(
            {
                "url": doc_url,
                "host": urllib.parse.urlparse(doc_url).netloc.lower(),
                "vendor": "keyestudio",
                "vendorLabel": "Keyestudio Wiki",
                "sourceType": "keyestudio_wiki_doc",
                "sourcePath": KEYESTUDIO_WIKI_URL,
                "titleHint": clean_title,
                "categoryGuess": guess_category(clean_title),
                "quality": "official",
                "canonicalMpn": clean_title,
                "partNumbers": extract_chip_candidates(clean_title),
                "notes": clean_title,
            }
        )
    return rows


def load_adafruit_rows() -> list[dict]:
    path = ROOT / "downloads" / "adafruit-sensor-docs.json"
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload.get("rows", [])


def dedupe_rows(rows: list[dict]) -> list[dict]:
    deduped: dict[str, dict] = {}
    for row in rows:
        deduped[row["url"]] = row
    return sorted(deduped.values(), key=lambda row: (row["vendor"], row["categoryGuess"], row["url"]))


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect sensor module docs from major module vendors")
    parser.add_argument("--vendors", default="adafruit,sparkfun,seeed,dfrobot,keyestudio")
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--skip-linked-assets", action="store_true")
    args = parser.parse_args()

    requested = {item.strip().lower() for item in args.vendors.split(",") if item.strip()}
    rows: list[dict] = []

    if "adafruit" in requested:
        rows.extend(load_adafruit_rows())
    if "sparkfun" in requested:
        rows.extend(collect_sparkfun(args.timeout, args.workers, args.skip_linked_assets))
    if "seeed" in requested:
        rows.extend(collect_seeed(args.timeout))
    if "dfrobot" in requested:
        rows.extend(collect_dfrobot(args.timeout, args.skip_linked_assets))
    if "keyestudio" in requested:
        rows.extend(collect_keyestudio(args.timeout))

    rows = dedupe_rows(rows)
    vendor_counts: dict[str, int] = {}
    for row in rows:
        vendor_counts[row["vendor"]] = vendor_counts.get(row["vendor"], 0) + 1

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "requestedVendors": sorted(requested),
        "totalCount": len(rows),
        "vendorCounts": vendor_counts,
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} rows to {args.output}")
    print(json.dumps(vendor_counts, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
