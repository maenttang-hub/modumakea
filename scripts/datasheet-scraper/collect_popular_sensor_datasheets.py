#!/usr/bin/env python3
"""
Collect a higher-quality sensor datasheet catalog from official vendor sources.

Focused vendors:
- ST ToF
- ADI / Maxim sensors
- Bosch Sensortec
- Sensirion
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
DEFAULT_OUTPUT = ROOT / "downloads" / "popular-sensor-datasheet-candidates.json"
USER_AGENT = (
    "Mozilla/5.0 (compatible; ModuMakeSensorCollector/1.0; "
    "+https://modumake.local)"
)

BOSCH_PRODUCT_URLS = [
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/humidity-sensors-bme280/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/gas-sensors/bme680/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/gas-sensors/bme688/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/gas-sensors/bme690/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/particulate-matter-sensor/bmv080/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/pressure-sensors/bmp384/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/pressure-sensors/bmp390/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/pressure-sensors/bmp580/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/pressure-sensors/bmp581/",
    "https://www.bosch-sensortec.com/en/products/environmental-sensors/pressure-sensors/bmp585/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/accelerometers/bma400/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/accelerometers/bma422/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/accelerometers/bma456/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/accelerometers/bma530/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/accelerometers/bma580/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi088/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi260/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi263/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi270/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi323/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi330/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi423/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi560/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi563/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi570/",
    "https://www.bosch-sensortec.com/en/products/motion-sensors/magnetometers/bmm350/",
    "https://www.bosch-sensortec.com/en/products/smart-sensor-systems/bhi385/",
]

CURATED_ST_TOF = [
    ("VL53L0X", "https://www.st.com/resource/en/datasheet/vl53l0x.pdf", "tof"),
    ("VL53L1", "https://www.st.com/resource/en/datasheet/vl53l1.pdf", "tof"),
    ("VL53L1X", "https://www.st.com/resource/en/datasheet/vl53l1x.pdf", "tof"),
    ("VL53L3CX", "https://www.st.com/resource/en/datasheet/vl53l3cx.pdf", "tof"),
    ("VL53L4CD", "https://www.st.com/resource/en/datasheet/vl53l4cd.pdf", "tof"),
    ("VL53L4CX", "https://www.st.com/resource/en/datasheet/vl53l4cx.pdf", "tof"),
    ("VL53L4ED", "https://www.st.com/resource/en/datasheet/vl53l4ed.pdf", "tof"),
    ("VL53L5CX", "https://www.st.com/resource/en/datasheet/vl53l5cx.pdf", "tof"),
    ("VL53L7CX", "https://www.st.com/resource/en/datasheet/vl53l7cx.pdf", "tof"),
    ("VL53L8CX", "https://www.st.com/resource/en/datasheet/vl53l8cx.pdf", "tof"),
    ("VL6180X", "https://www.st.com/resource/en/datasheet/vl6180x.pdf", "tof"),
]

CURATED_ADI_MAXIM = [
    ("ADXL335", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl335.pdf", "accelerometer"),
    ("ADXL337", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl337.pdf", "accelerometer"),
    ("ADXL343", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl343.pdf", "accelerometer"),
    ("ADXL345", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl345.pdf", "accelerometer"),
    ("ADXL354/ADXL355", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl354_adxl355.pdf", "accelerometer"),
    ("ADXL356/ADXL357", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl356_357.pdf", "accelerometer"),
    ("ADXL362", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl362.pdf", "accelerometer"),
    ("ADXL367", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl367.pdf", "accelerometer"),
    ("ADXL372", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl372.pdf", "accelerometer"),
    ("ADXL375", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl375.pdf", "accelerometer"),
    ("ADXL377", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl377.pdf", "accelerometer"),
    ("ADXL380", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl380.pdf", "accelerometer"),
    ("ADXL382", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxl382.pdf", "accelerometer"),
    ("ADXRS290", "https://www.analog.com/media/en/technical-documentation/data-sheets/adxrs290.pdf", "gyro"),
    ("ADIS16460", "https://www.analog.com/media/en/technical-documentation/data-sheets/adis16460.pdf", "imu"),
    ("ADIS16465", "https://www.analog.com/media/en/technical-documentation/data-sheets/adis16465.pdf", "imu"),
    ("ADIS16467", "https://www.analog.com/media/en/technical-documentation/data-sheets/adis16467.pdf", "imu"),
    ("ADIS16470", "https://www.analog.com/media/en/technical-documentation/data-sheets/adis16470.pdf", "imu"),
    ("ADIS16475", "https://www.analog.com/media/en/technical-documentation/data-sheets/adis16475.pdf", "imu"),
    ("ADT7301", "https://www.analog.com/media/en/technical-documentation/data-sheets/ADT7301.pdf", "temperature"),
    ("ADT7310", "https://www.analog.com/media/en/technical-documentation/data-sheets/ADT7310.pdf", "temperature"),
    ("ADT7320", "https://www.analog.com/media/en/technical-documentation/data-sheets/ADT7320.pdf", "temperature"),
    ("ADT7410", "https://www.analog.com/media/en/technical-documentation/data-sheets/ADT7410.pdf", "temperature"),
    ("ADT7420", "https://www.analog.com/media/en/technical-documentation/data-sheets/ADT7420.pdf", "temperature"),
    ("MAX30101", "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30101.pdf", "optical"),
    ("MAX30102", "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30102.pdf", "optical"),
    ("MAX30105", "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30105.pdf", "optical"),
    ("MAX30205", "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30205.pdf", "temperature"),
    ("MAX31875", "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX31875.pdf", "temperature"),
    ("MAX31889", "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX31889.pdf", "temperature"),
]


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


def validate_pdf_url(url: str, timeout: int) -> tuple[bool, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/pdf,*/*;q=0.8",
            "Range": "bytes=0-1023",
        },
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout,
            context=ssl.create_default_context(),
        ) as response:
            content_type = (response.headers.get_content_type() or "").lower()
            if "pdf" in content_type:
                return True, content_type
            return url.lower().endswith(".pdf"), content_type or "unknown"
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


def absolute_url(base_url: str, href: str) -> str:
    return urllib.parse.urljoin(base_url, html.unescape(href.strip()))


def plain_text(raw: str) -> str:
    text = re.sub(r"<[^>]+>", "", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_mpn(value: str) -> str:
    value = value.strip()
    return re.sub(r"\s+", " ", value)


def extract_part_numbers(text: str) -> list[str]:
    tokens = re.findall(r"\b[A-Z]{2,}[A-Z0-9/+.-]*\d[A-Z0-9/+.-]*\b", text.upper())
    unique: list[str] = []
    for token in tokens:
        cleaned = token.strip(".,;:/")
        if len(cleaned) < 4:
            continue
        if cleaned not in unique:
            unique.append(cleaned)
    return unique[:24]


def guess_sensor_category(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ("tof", "time-of-flight", "distance", "ranging", "vl53", "vl6180")):
        return "tof"
    if any(token in lowered for token in ("imu", "accelerometer", "gyroscope", "gyroscope", "magnetometer", "orientation")):
        return "motion"
    if any(token in lowered for token in ("humidity", "temperature")):
        return "temperature_humidity"
    if "co2" in lowered:
        return "co2"
    if "particulate" in lowered:
        return "particulate"
    if "pressure" in lowered:
        return "pressure"
    if any(token in lowered for token in ("flow", "liquid flow", "gas flow")):
        return "flow"
    if "optical" in lowered or "heart-rate" in lowered or "ppg" in lowered:
        return "optical"
    if "gas" in lowered:
        return "gas"
    return "sensor"


def collect_sensirion(timeout: int) -> list[dict]:
    url = "https://sensirion.com/products/downloads"
    html_text = fetch_text(url, timeout)
    if not html_text:
        return []

    rows = []
    seen: set[str] = set()
    tr_blocks = re.findall(r"<tr[^>]*class=\"tw:group/copy[^\"]*\"[^>]*>(.*?)</tr>", html_text, flags=re.S)

    for block in tr_blocks:
        anchors = re.findall(r"<a href=\"([^\"]+)\"[^>]*>(.*?)</a>", block, flags=re.S)
        if len(anchors) < 2:
            continue

        href, title_html = anchors[0]
        _, desc_html = anchors[1]
        title = plain_text(title_html)
        description = plain_text(desc_html)

        if not title.startswith("Datasheet "):
            continue
        if any(token in description.lower() for token in ("filter cap", "evaluation kit", "evaluationskit", "adapter cable")):
            continue

        full_url = absolute_url(url, href)
        if full_url in seen:
            continue
        seen.add(full_url)

        part_numbers = extract_part_numbers(description) or extract_part_numbers(title)
        rows.append(
            {
                "url": full_url,
                "host": urllib.parse.urlparse(full_url).netloc.lower(),
                "vendor": "sensirion",
                "vendorLabel": "Sensirion",
                "sourceType": "sensirion_download_center",
                "sourcePath": url,
                "titleHint": title.removeprefix("Datasheet ").strip(),
                "categoryGuess": guess_sensor_category(f"{title} {description}"),
                "quality": "official",
                "canonicalMpn": part_numbers[0] if part_numbers else normalize_mpn(title.removeprefix("Datasheet ")),
                "partNumbers": part_numbers,
                "notes": description,
            }
        )

    return rows


def collect_bosch(timeout: int) -> list[dict]:
    rows = []
    seen: set[str] = set()

    def parse_product_page(product_url: str) -> list[dict]:
        html_text = fetch_text(product_url, timeout)
        if not html_text:
            return []

        local_rows = []
        title_match = re.search(r"<title>([^<]+)</title>", html_text, flags=re.I)
        page_title = plain_text(title_match.group(1)) if title_match else product_url.rstrip("/").split("/")[-1].upper()
        slug = product_url.rstrip("/").split("/")[-1].upper()
        matches = re.finditer(
            r"<h3[^>]*>([^<]+)</h3>\s*<p[^>]*>([^<]+)</p>.*?<a[^>]+download=\"([^\"]+\.pdf)\"[^>]+href=\"([^\"]+)\"",
            html_text,
            flags=re.I | re.S,
        )

        for match in matches:
            headline = plain_text(match.group(1))
            description = plain_text(match.group(2))
            download_name = plain_text(match.group(3))
            href = match.group(4)
            if headline.lower() != "datasheet" and "-ds" not in download_name.lower():
                continue

            full_url = absolute_url(product_url, href)
            text = f"{page_title} {description} {product_url}"
            local_rows.append(
                {
                    "url": full_url,
                    "host": urllib.parse.urlparse(full_url).netloc.lower(),
                    "vendor": "bosch",
                    "vendorLabel": "Bosch Sensortec",
                    "sourceType": "bosch_product_page",
                    "sourcePath": product_url,
                    "titleHint": slug,
                    "categoryGuess": guess_sensor_category(text),
                    "quality": "official",
                    "canonicalMpn": normalize_mpn(slug),
                    "partNumbers": extract_part_numbers(f"{slug} {description}"),
                    "notes": description,
                }
            )
        return local_rows

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        future_map = {
            executor.submit(parse_product_page, product_url): product_url
            for product_url in BOSCH_PRODUCT_URLS
        }
        for future in concurrent.futures.as_completed(future_map):
            for row in future.result():
                if row["url"] in seen:
                    continue
                seen.add(row["url"])
                rows.append(row)

    return rows


def collect_curated_vendor_rows(vendor: str, label: str, source_type: str, rows: list[tuple[str, str, str]]) -> list[dict]:
    output = []
    for canonical_mpn, url, category in rows:
        output.append(
            {
                "url": url,
                "host": urllib.parse.urlparse(url).netloc.lower(),
                "vendor": vendor,
                "vendorLabel": label,
                "sourceType": source_type,
                "sourcePath": url,
                "titleHint": canonical_mpn,
                "categoryGuess": category,
                "quality": "official",
                "canonicalMpn": canonical_mpn,
                "partNumbers": extract_part_numbers(canonical_mpn),
                "notes": canonical_mpn,
            }
        )
    return output


def filter_valid_rows(rows: list[dict], timeout: int, workers: int) -> tuple[list[dict], list[dict]]:
    valid_rows: list[dict] = []
    invalid_rows: list[dict] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(workers, 1)) as executor:
        future_map = {
            executor.submit(validate_pdf_url, row["url"], timeout): row
            for row in rows
        }
        for future in concurrent.futures.as_completed(future_map):
            row = future_map[future]
            ok, detail = future.result()
            if ok:
                valid_rows.append({**row, "validation": detail})
            else:
                invalid_rows.append({**row, "validationError": detail})

    valid_rows.sort(key=lambda row: (row["vendor"], row["canonicalMpn"], row["url"]))
    invalid_rows.sort(key=lambda row: (row["vendor"], row["canonicalMpn"], row["url"]))
    return valid_rows, invalid_rows


def dedupe_rows(rows: list[dict]) -> list[dict]:
    deduped: dict[str, dict] = {}
    for row in rows:
        deduped[row["url"]] = row
    return sorted(deduped.values(), key=lambda row: (row["vendor"], row["canonicalMpn"], row["url"]))


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect popular sensor datasheets from official vendor sources")
    parser.add_argument("--vendors", default="st,adi,bosch,sensirion", help="Comma-separated vendor keys")
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--skip-validate", action="store_true")
    args = parser.parse_args()

    requested_vendors = {item.strip().lower() for item in args.vendors.split(",") if item.strip()}
    rows: list[dict] = []

    if "sensirion" in requested_vendors:
        rows.extend(collect_sensirion(args.timeout))
    if "bosch" in requested_vendors:
        rows.extend(collect_bosch(args.timeout))
    if "st" in requested_vendors:
        rows.extend(collect_curated_vendor_rows("st", "STMicroelectronics", "st_tof_seed", CURATED_ST_TOF))
    if "adi" in requested_vendors:
        rows.extend(collect_curated_vendor_rows("adi", "Analog Devices / Maxim", "adi_sensor_seed", CURATED_ADI_MAXIM))

    rows = dedupe_rows(rows)
    invalid_rows: list[dict] = []

    if not args.skip_validate:
        rows, invalid_rows = filter_valid_rows(rows, timeout=args.timeout, workers=args.workers)

    vendor_counts: dict[str, int] = {}
    for row in rows:
        vendor_counts[row["vendor"]] = vendor_counts.get(row["vendor"], 0) + 1

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "requestedVendors": sorted(requested_vendors),
        "totalCount": len(rows),
        "vendorCounts": vendor_counts,
        "invalidCount": len(invalid_rows),
        "rows": rows,
        "invalidRows": invalid_rows,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} valid rows to {args.output}")
    print(json.dumps(vendor_counts, ensure_ascii=False))
    if invalid_rows:
        print(f"Skipped {len(invalid_rows)} invalid rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
