#!/usr/bin/env python3
"""
train_full.py

Training script to train the GNN layout model on the full preprocessed dataset.
Loads .pt graphs from disk, runs train/val split, and trains on CPU.
"""

import os
import sys
import time
import argparse
from pathlib import Path
import torch
import torch.nn.functional as F
from torch.utils.data import random_split

# Set up paths to load modules
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.vocab import load_vocab
from ml.model import SchematicGNN
from ml.train import calculate_wirelength_loss

# Configuration
PROCESSED_DATA_DIR = Path("/Users/gimdong-il/Desktop/프로그램/processed_graphs")
BATCH_SIZE = 32
NUM_EPOCHS = 30
LEARNING_RATE = 1e-3


def load_processed_dataset() -> list:
    """Load preprocessed PyG graphs from disk and normalize target coordinates."""
    print("Loading and preparing preprocessed graph dataset from disk...")
    
    if not PROCESSED_DATA_DIR.exists():
        raise FileNotFoundError(f"Processed graphs directory not found at {PROCESSED_DATA_DIR}. Run preprocess.py first.")
        
    pt_files = list(PROCESSED_DATA_DIR.glob("*.pt"))
    print(f"Found {len(pt_files)} processed graph files on disk.")
    
    dataset = []
    success_count = 0
    
    for idx, f_path in enumerate(pt_files, 1):
        if idx % 1000 == 0 or idx == len(pt_files):
            print(f"Loaded {idx}/{len(pt_files)} files...")
            
        try:
            # Load graph
            data = torch.load(f_path, weights_only=False)
            
            # Skip if symbol count is too small (needs at least 2 symbols for layout learning)
            num_symbols = data['symbol'].x.shape[0]
            if num_symbols < 2:
                continue
                
            # Z-score Normalize target positions (y) per schematic
            pos = data['symbol'].y
            mean = pos.mean(dim=0)
            std = pos.std(dim=0, unbiased=False) + 1e-6
            data['symbol'].y = (pos - mean) / std
            
            # Save Z-score parameters on the object
            data['symbol'].mean = mean
            data['symbol'].std = std
            
            # Precompute net-to-symbol index maps for the HPWL loss
            # Traces which Symbol indices belong to each Net
            net_to_symbols = []
            
            # Get edge relations: Symbol -> Pin, Pin -> Net
            sym_pin_edges = data['symbol', 'has_pin', 'pin'].edge_index
            pin_net_edges = data['pin', 'belongs_to', 'net'].edge_index
            
            # Build mappings
            pin_to_sym = {}
            for i in range(sym_pin_edges.shape[1]):
                s_idx = sym_pin_edges[0, i].item()
                p_idx = sym_pin_edges[1, i].item()
                pin_to_sym[p_idx] = s_idx
                
            net_to_pins = {}
            for i in range(pin_net_edges.shape[1]):
                p_idx = pin_net_edges[0, i].item()
                n_idx = pin_net_edges[1, i].item()
                if n_idx not in net_to_pins:
                    net_to_pins[n_idx] = []
                net_to_pins[n_idx].append(p_idx)
                
            # Compile net-to-symbols index lists
            num_nets = data['net'].x.shape[0]
            for n_idx in range(num_nets):
                connected_pins = net_to_pins.get(n_idx, [])
                syms = list(set(pin_to_sym[p] for p in connected_pins if p in pin_to_sym))
                net_to_symbols.append(syms)
                
            data.net_to_symbols = net_to_symbols
            dataset.append(data)
            success_count += 1
            
        except Exception:
            continue
            
    print(f"Successfully loaded and normalized {success_count} valid graphs.")
    return dataset


def main():
    parser = argparse.ArgumentParser(description="Train GNN layout model on full dataset.")
    parser.add_argument("--epochs", type=int, default=NUM_EPOCHS, help="Number of training epochs.")
    parser.add_argument("--batch_size", type=int, default=BATCH_SIZE, help="Batch size (running sequentially).")
    parser.add_argument("--lr", type=float, default=LEARNING_RATE, help="Learning rate.")
    parser.add_argument("--save_path", type=str, default="ml/modumake_gnn_best.pth", help="Path to save best weights.")
    args = parser.parse_args()

    # Device assignment (CPU)
    device = torch.device("cpu")
    print(f"Using device: {device}")

    # Load vocab
    vocab = load_vocab()
    vocab_size = len(vocab)
    
    # Load dataset
    dataset = load_processed_dataset()
    if not dataset:
        print("Error: No valid graphs could be loaded. Exiting.")
        sys.exit(1)

    # Train/Validation split (90% train, 10% val)
    num_total = len(dataset)
    num_train = int(num_total * 0.9)
    num_val = num_total - num_train
    
    # Set seed for deterministic split
    generator = torch.Generator().manual_seed(42)
    train_set, val_set = random_split(dataset, [num_train, num_val], generator=generator)
    print(f"Dataset split: {num_train} train graphs, {num_val} validation graphs.")

    # Model setup
    model = SchematicGNN(vocab_size=vocab_size, hidden_dim=128).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_val_loss = float("inf")
    save_file_path = Path(args.save_path)
    save_file_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"\nStarting full training loop ({args.epochs} epochs)...")
    
    for epoch in range(1, args.epochs + 1):
        # 1. Training Phase
        model.train()
        
        # HPWL Wirelength weight linear warmup schedule (0 to 0.1 over first 10 epochs)
        w3 = min(0.1, (epoch / 10.0) * 0.1)
        
        epoch_recon_loss = 0.0
        epoch_orient_loss = 0.0
        epoch_wl_loss = 0.0
        epoch_total_loss = 0.0
        
        start_time = time.time()
        
        # Process training graphs
        for data in train_set:
            optimizer.zero_grad()
            
            data = data.to(device)
            
            # Apply coordinate perturbation on normalized positions (sigma = 0.2)
            pos = data['symbol'].y
            pos_perturbed = pos + torch.randn_like(pos) * 0.2
            
            # Inject perturbed coordinates into Symbol features
            x_symbol = torch.cat([data['symbol'].x, pos_perturbed], dim=1)
            
            x_dict = {
                'symbol': x_symbol,
                'pin': data['pin'].x,
                'net': data['net'].x
            }
            
            # Forward pass
            pred_coords, pred_orients = model(x_dict, data.edge_index_dict)
            
            # Loss calculations
            loss_recon = F.smooth_l1_loss(pred_coords, pos)
            loss_orient = F.cross_entropy(pred_orients, data['symbol'].orientation)
            loss_wl = calculate_wirelength_loss(pred_coords, data.net_to_symbols)
            
            # Combined Loss
            loss = loss_recon * 1.0 + loss_orient * 0.5 + loss_wl * w3
            
            loss.backward()
            optimizer.step()
            
            # Accumulate metrics
            epoch_recon_loss += loss_recon.item()
            epoch_orient_loss += loss_orient.item()
            epoch_wl_loss += loss_wl.item() if isinstance(loss_wl, torch.Tensor) else loss_wl
            epoch_total_loss += loss.item()
            
        scheduler.step()
        
        # Calculate averages for training
        num_train_graphs = len(train_set)
        avg_recon = epoch_recon_loss / num_train_graphs
        avg_orient = epoch_orient_loss / num_train_graphs
        avg_wl = epoch_wl_loss / num_train_graphs
        avg_total = epoch_total_loss / num_train_graphs
        
        # 2. Validation Phase
        model.eval()
        val_recon_loss = 0.0
        val_orient_loss = 0.0
        val_total_loss = 0.0
        
        with torch.no_grad():
            for data in val_set:
                data = data.to(device)
                pos = data['symbol'].y
                pos_perturbed = pos  # No perturbation during validation
                
                x_symbol = torch.cat([data['symbol'].x, pos_perturbed], dim=1)
                x_dict = {
                    'symbol': x_symbol,
                    'pin': data['pin'].x,
                    'net': data['net'].x
                }
                
                pred_coords, pred_orients = model(x_dict, data.edge_index_dict)
                
                loss_recon = F.smooth_l1_loss(pred_coords, pos)
                loss_orient = F.cross_entropy(pred_orients, data['symbol'].orientation)
                
                val_recon_loss += loss_recon.item()
                val_orient_loss += loss_orient.item()
                val_total_loss += (loss_recon * 1.0 + loss_orient * 0.5).item()
                
        num_val_graphs = len(val_set)
        avg_val_recon = val_recon_loss / num_val_graphs
        avg_val_orient = val_orient_loss / num_val_graphs
        avg_val_total = val_total_loss / num_val_graphs
        
        elapsed = time.time() - start_time
        
        # Print progress
        print(
            f"Epoch [{epoch:02d}/{args.epochs}] - "
            f"Train Loss: {avg_total:.4f} (Recon: {avg_recon:.4f}, Orient: {avg_orient:.4f}, WL: {avg_wl:.4f}) | "
            f"Val Loss: {avg_val_total:.4f} (Recon: {avg_val_recon:.4f}, Orient: {avg_val_orient:.4f}) - "
            f"Time: {elapsed:.2f}s"
        )
        
        # Save best model
        if avg_val_total < best_val_loss:
            best_val_loss = avg_val_total
            torch.save(model.state_dict(), save_file_path)
            print(f"  --> Saved new best validation model checkpoint to: {save_file_path}")
            
    print(f"\nTraining complete. Best Validation Loss: {best_val_loss:.4f}")


if __name__ == "__main__":
    main()
