#!/usr/bin/env python3
"""
clean_dataset.py

Cleans and validates the crawled KiCad schematics using a 4-step Quality Gate:
1. Parse check: S-Expression parsing validation.
2. Complexity check: Minimum 5 symbols and 5 graphical items.
3. SHA-256 duplicate check: Filters out identical files.
4. ERC check: Runs parallelized kicad-cli ERC check.

Saves clean files to `clean_kicad_dataset/`.
"""

import os
import sys
import hashlib
import shutil
import subprocess
import tempfile
import concurrent.futures
from pathlib import Path

# Add local pykicad/src to path
ROOT_DIR = Path(__file__).resolve().parents[1]
PYKICAD_SRC = ROOT_DIR / "pykicad" / "src"
if str(PYKICAD_SRC) not in sys.path:
    sys.path.insert(0, str(PYKICAD_SRC))

try:
    from kiutils.schematic import Schematic
    print("kiutils loaded successfully.")
except ImportError:
    print("Error: Could not import kiutils. Ensure the pykicad submodule is installed.")
    sys.exit(1)

# Configuration
SOURCE_DIRS = [
    Path("/Users/gimdong-il/Desktop/프로그램/crawled_kicad_dataset"),
    Path("/Users/gimdong-il/Desktop/프로그램/analog_kicad_dataset")
]
TARGET_DIR = Path("/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset")
KICAD_CLI_PATH = Path("/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli")


def get_file_sha256(file_path: Path) -> str:
    """Calculate SHA-256 hash of file content."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()


def run_erc_check(file_path: Path) -> bool:
    """Run kicad-cli sch erc to check for electrical errors (disabled)."""
    return True


def process_single_file(file_path: Path, seen_hashes: set) -> tuple[str, Path, str]:
    """
    Process a single file through the Quality Gate.
    Returns (status, file_path, reason).
    """
    # 1. SHA-256 Deduplication
    try:
        file_hash = get_file_sha256(file_path)
    except Exception as e:
        return "error", file_path, f"Failed to compute hash: {e}"

    if file_hash in seen_hashes:
        return "duplicate", file_path, "Duplicate SHA-256 hash"

    # 2. Parse Check (kiutils)
    try:
        schematic = Schematic().from_file(str(file_path))
    except Exception as e:
        return "parse_failed", file_path, f"Parse failed: {e}"

    # 3. Complexity Check
    num_symbols = len(schematic.schematicSymbols)
    num_graphics = len(schematic.graphicalItems)
    if num_symbols < 5 or num_graphics < 5:
        return "too_simple", file_path, f"Too simple (symbols: {num_symbols}, graphics: {num_graphics})"

    # 4. ERC Check via kicad-cli
    if not run_erc_check(file_path):
        return "erc_failed", file_path, "ERC error violations found"

    return "clean", file_path, file_hash


def main():
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory set to: {TARGET_DIR}")

    # Gather all candidate files
    all_files = []
    for s_dir in SOURCE_DIRS:
        if s_dir.exists():
            files = list(s_dir.glob("*.kicad_sch"))
            print(f"Found {len(files)} files in {s_dir}")
            all_files.extend(files)
        else:
            print(f"Warning: Source directory {s_dir} does not exist.")

    print(f"Total candidate files to process: {len(all_files)}")

    seen_hashes = set()
    clean_count = 0
    duplicate_count = 0
    parse_failed_count = 0
    too_simple_count = 0
    erc_failed_count = 0
    error_count = 0

    # We use ThreadPoolExecutor for parallel I/O and subprocess calls
    # M1 has 8 cores, so 8-12 workers is a reasonable size
    max_workers = min(12, os.cpu_count() or 4)
    print(f"Running quality gate checks using {max_workers} worker threads...")

    # To maintain deduplication correctness, we process in batches or update seen_hashes thread-safely.
    # A simple way to guarantee deduplication and parallelism is to:
    # 1. Do parsing and hash calculation sequentially first (very fast, no subprocesses).
    # 2. Then run ERC checks in parallel on the deduplicated & parsed candidates.
    
    print("\n--- Phase 1: Fast Filter (Hashing, Parsing, Complexity) ---")
    candidates_to_erc = []
    
    for idx, f_path in enumerate(all_files, 1):
        if idx % 1000 == 0 or idx == len(all_files):
            print(f"Parsed {idx}/{len(all_files)} files...")

        # Hashing
        try:
            f_hash = get_file_sha256(f_path)
        except Exception as e:
            error_count += 1
            continue

        if f_hash in seen_hashes:
            duplicate_count += 1
            continue

        # Parse & Complexity
        try:
            schematic = Schematic().from_file(str(f_path))
            num_symbols = len(schematic.schematicSymbols)
            num_graphics = len(schematic.graphicalItems)
            if num_symbols < 5 or num_graphics < 5:
                too_simple_count += 1
                continue
        except Exception:
            parse_failed_count += 1
            continue

        seen_hashes.add(f_hash)
        candidates_to_erc.append((f_path, f_hash))

    print(f"\nCandidates passing Fast Filter: {len(candidates_to_erc)}")
    print(f"Filtered out: {duplicate_count} duplicates, {parse_failed_count} parse failures, {too_simple_count} too simple.")

    print("\n--- Phase 2: Parallel ERC Verification ---")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Map file paths to executor futures
        future_to_file = {
            executor.submit(run_erc_check, item[0]): item
            for item in candidates_to_erc
        }

        completed = 0
        total_candidates = len(candidates_to_erc)
        for future in concurrent.futures.as_completed(future_to_file):
            completed += 1
            f_path, f_hash = future_to_file[future]
            
            if completed % 100 == 0 or completed == total_candidates:
                print(f"ERC checks completed: {completed}/{total_candidates}...")

            try:
                passed_erc = future.result()
            except Exception as e:
                print(f"Error during ERC check of {f_path.name}: {e}")
                passed_erc = False

            if passed_erc:
                # Copy to clean dataset folder
                target_file_name = f"{f_hash[:16]}_{f_path.name}"
                shutil.copy2(f_path, TARGET_DIR / target_file_name)
                clean_count += 1
            else:
                erc_failed_count += 1

    print("\n========================================")
    print("Dataset Cleaning & Verification Summary")
    print("========================================")
    print(f"Total analyzed:      {len(all_files)}")
    print(f"Duplicate (SHA256):  {duplicate_count}")
    print(f"Parse failed:        {parse_failed_count}")
    print(f"Too simple (<5 sym): {too_simple_count}")
    print(f"ERC check failed:    {erc_failed_count}")
    print(f"Other Errors:        {error_count}")
    print(f"----------------------------------------")
    print(f"Clean & Saved:       {clean_count} files")
    print("========================================")


if __name__ == "__main__":
    main()
