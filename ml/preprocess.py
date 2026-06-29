#!/usr/bin/env python3
"""
preprocess.py

Bulk processes the clean KiCad schematics dataset into PyG HeteroData graphs
in parallel using multiprocessing.
"""

import os
import sys
import time
from pathlib import Path
from multiprocessing import Pool, cpu_count
import torch

# Set up paths to load modules
ROOT_DIR = Path(__file__).resolve().parents[1]
PYKICAD_SRC = ROOT_DIR / "pykicad" / "src"
PYKICADAPI_SRC = ROOT_DIR / "pykicadapi"

if str(PYKICAD_SRC) not in sys.path:
    sys.path.insert(0, str(PYKICAD_SRC))
if str(PYKICADAPI_SRC) not in sys.path:
    sys.path.insert(0, str(PYKICADAPI_SRC))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import kicad_sch_api as ksa
from ml.vocab import load_vocab
from ml.dataset import schematic_to_heterodata

CLEAN_DATASET_DIR = Path("/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset")
OUTPUT_DIR = Path("/Users/gimdong-il/Desktop/프로그램/processed_graphs")


def process_single_file(args) -> bool:
    """Process a single KiCad schematic file and save its graph to disk."""
    f_path, vocab = args
    try:
        # Load schematic
        schematic = ksa.load_schematic(str(f_path))
        # Convert to HeteroData
        graph_data = schematic_to_heterodata(schematic, vocab)
        
        # Save graph
        graph_save_path = OUTPUT_DIR / f"{f_path.stem}.pt"
        torch.save(graph_data, graph_save_path)
        return True
    except Exception:
        # Fail silently in worker, reported as False
        return False


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    vocab = load_vocab()
    
    sch_files = list(CLEAN_DATASET_DIR.glob("*.kicad_sch"))
    num_files = len(sch_files)
    print(f"Discovered {num_files} clean KiCad schematics.")
    print(f"Using {cpu_count()} CPU processes for parallel conversion...")
    
    start_time = time.time()
    
    # Prepare arguments for multiprocessing
    pool_args = [(f_path, vocab) for f_path in sch_files]
    
    success_count = 0
    with Pool(processes=cpu_count()) as pool:
        # Using imap_unordered for progressive progress reporting
        results = pool.imap_unordered(process_single_file, pool_args, chunksize=10)
        
        for idx, success in enumerate(results, 1):
            if success:
                success_count += 1
            if idx % 500 == 0 or idx == num_files:
                elapsed = time.time() - start_time
                print(f"Processed {idx}/{num_files} files... Success: {success_count} ({elapsed:.1f}s elapsed)")
                
    elapsed = time.time() - start_time
    print(f"\nPreprocessing complete! Converted {success_count}/{num_files} schematics successfully.")
    print(f"Total time taken: {elapsed:.1f}s")
    print(f"Saved processed graph files to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
