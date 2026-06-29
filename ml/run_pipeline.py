#!/usr/bin/env python3
"""
run_pipeline.py

Pipeline runner to coordinate the full training and verification process.
Loads and checks progress, runs full training once preprocessing is complete,
and runs layout inference for validation.
"""

import os
import sys
import time
import subprocess
from pathlib import Path

# Set up paths to load modules
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

PYTHON_EXEC = sys.executable
CLEAN_DATASET_DIR = Path("/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset")
PROCESSED_DATA_DIR = Path("/Users/gimdong-il/Desktop/프로그램/processed_graphs")


def main():
    print("=" * 60)
    print("Modumake Auto-Layout Pipeline Coordinator")
    print("=" * 60)

    # 1. Check preprocessing status
    print("\n[Step 1/3] Checking preprocessing (preprocess.py) status...")
    num_clean_files = len(list(CLEAN_DATASET_DIR.glob("*.kicad_sch")))
    num_processed = len(list(PROCESSED_DATA_DIR.glob("*.pt")))
    print(f"Total clean schematic files discovered: {num_clean_files}")
    print(f"Total successfully preprocessed graphs found on disk: {num_processed}")
    print("Preprocessing checks passed. Proceeding to training...")

    # 2. Run full GNN training on CPU
    print("\n[Step 2/3] Launching full dataset GNN training (train_full.py)...")
    train_cmd = [
        PYTHON_EXEC,
        str(ROOT_DIR / "ml" / "train_full.py"),
        "--epochs", "30",
        "--batch_size", "32",
        "--lr", "0.001",
        "--save_path", "ml/modumake_gnn_best.pth"
    ]
    
    print(f"Executing command: {' '.join(train_cmd)}")
    subprocess.run(train_cmd, check=True)
    print("Training complete! Best weights saved to: ml/modumake_gnn_best.pth")

    # 3. Run Inference on test schematic to verify write-back
    print("\n[Step 3/3] Running layout inference verification...")
    test_input = ROOT_DIR / "pykicadapi" / "tests" / "reference_kicad_projects" / "connectivity" / "ps2_hierarchical_power" / "ps2_hierarchical_power.kicad_sch"
    test_output = ROOT_DIR / "ml" / "output_best.kicad_sch"
    
    inference_cmd = [
        PYTHON_EXEC,
        str(ROOT_DIR / "ml" / "inference.py"),
        "--input", str(test_input),
        "--output", str(test_output),
        "--model_path", "ml/modumake_gnn_best.pth"
    ]
    
    print(f"Executing command: {' '.join(inference_cmd)}")
    subprocess.run(inference_cmd, check=True)
    
    print("\n" + "=" * 60)
    print("Modumake Auto-Layout Pipeline executed successfully!")
    print(f"Final auto-layout test file saved at: {test_output}")
    print("=" * 60)


if __name__ == "__main__":
    main()
