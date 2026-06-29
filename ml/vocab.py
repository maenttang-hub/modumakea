#!/usr/bin/env python3
"""
vocab.py

Builds a component library ID (lib_id) vocabulary from the cleaned KiCad schematic dataset.
Collects all library IDs, counts their frequency, buckets low-frequency (<5 occurrences)
items into semantic fallback categories, and outputs the mapping to `vocab.json`.
"""

import os
import sys
import json
from pathlib import Path
from collections import Counter

# Set up paths to load kiutils
ROOT_DIR = Path(__file__).resolve().parents[1]
PYKICAD_SRC = ROOT_DIR / "pykicad" / "src"
if str(PYKICAD_SRC) not in sys.path:
    sys.path.insert(0, str(PYKICAD_SRC))

try:
    from kiutils.schematic import Schematic
except ImportError:
    print("Error: kiutils not found. Run this script within the configured virtual environment.")
    sys.exit(1)

# Paths
CLEAN_DATASET_DIR = Path("/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset")
OUTPUT_DIR = Path(__file__).resolve().parent
VOCAB_JSON_PATH = OUTPUT_DIR / "vocab.json"


def load_vocab(vocab_path=VOCAB_JSON_PATH) -> dict:
    """Load the vocab JSON file."""
    if not vocab_path.exists():
        raise FileNotFoundError(f"Vocab file not found at {vocab_path}. Run vocab.py first.")
    with open(vocab_path, "r", encoding="utf-8") as f:
        return json.load(f)

# Special bucket tokens
SPECIAL_TOKENS = {
    "<PAD>": 0,
    "<UNK_PASSIVE>": 1,
    "<UNK_IC>": 2,
    "<UNK_CONNECTOR>": 3,
    "<UNK_POWER>": 4,
    "<UNK_OTHER>": 5
}


def bucket_lib_id(lib_id: str) -> str:
    """Group low-frequency lib_id into fallback category based on naming rules."""
    lib_id_lower = lib_id.lower()
    
    if lib_id_lower.startswith("device:"):
        # Device contains passive components (resistors, capacitors, inductors, diodes, LEDs, etc.)
        return "<UNK_PASSIVE>"
    elif lib_id_lower.startswith("power:") or any(x in lib_id_lower for x in ["gnd", "vcc", "vdd", "vss", "+5v", "+3.3v", "+12v", "-12v"]):
        return "<UNK_POWER>"
    elif lib_id_lower.startswith("connector:") or "conn" in lib_id_lower:
        return "<UNK_CONNECTOR>"
    elif any(x in lib_id_lower for x in ["ic", "mcu", "regulator", "opamp", "processor", "amplifier", "driver", "transceiver", "sensor", "converter"]):
        return "<UNK_IC>"
    else:
        return "<UNK_OTHER>"


def get_vocab_id(lib_id: str, vocab: dict) -> int:
    """Map lib_id to integer ID using vocabulary or fallback bucketing."""
    if lib_id in vocab:
        return vocab[lib_id]
    
    # Fallback to bucket
    bucket = bucket_lib_id(lib_id)
    return vocab[bucket]


def build_vocabulary():
    print(f"Reading dataset from: {CLEAN_DATASET_DIR}")
    
    if not CLEAN_DATASET_DIR.exists():
        print(f"Error: Clean dataset directory {CLEAN_DATASET_DIR} does not exist. Run clean_dataset.py first.")
        sys.exit(1)
        
    sch_files = list(CLEAN_DATASET_DIR.glob("*.kicad_sch"))
    print(f"Found {len(sch_files)} schematic files to analyze.")
    
    # Counter for library IDs
    lib_id_counter = Counter()
    
    for idx, f_path in enumerate(sch_files, 1):
        if idx % 1000 == 0 or idx == len(sch_files):
            print(f"Processed {idx}/{len(sch_files)} files...")
            
        try:
            schematic = Schematic().from_file(str(f_path))
            for sym in schematic.schematicSymbols:
                lib_id_counter[sym.libId] += 1
        except Exception as e:
            # Skip parsing errors (should be rare since it's already cleaned)
            print(f"Warning: Failed to parse {f_path.name}: {e}")
            continue

    print(f"\nTotal unique lib_ids found: {len(lib_id_counter)}")
    
    # Filter high frequency symbols (freq >= 5)
    high_freq_symbols = {
        lib_id: freq for lib_id, freq in lib_id_counter.items() if freq >= 5
    }
    
    print(f"High-frequency lib_ids (freq >= 5): {len(high_freq_symbols)}")
    print(f"Low-frequency lib_ids (freq < 5) to bucket: {len(lib_id_counter) - len(high_freq_symbols)}")
    
    # Build final vocabulary map
    vocab = SPECIAL_TOKENS.copy()
    
    # Sort symbols by frequency descending for intuitive index mapping
    sorted_symbols = sorted(high_freq_symbols.items(), key=lambda x: x[1], reverse=True)
    
    next_idx = len(vocab)
    for lib_id, _ in sorted_symbols:
        # Avoid overriding special tokens if they happen to appear as regular symbols
        if lib_id not in vocab:
            vocab[lib_id] = next_idx
            next_idx += 1
            
    # Save to json file
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(VOCAB_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(vocab, f, indent=2, ensure_ascii=False)
        
    print(f"\nVocabulary built successfully. Total vocab size: {len(vocab)}")
    print(f"Saved vocabulary to: {VOCAB_JSON_PATH}")


if __name__ == "__main__":
    build_vocabulary()
