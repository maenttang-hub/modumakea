#!/usr/bin/env python3
"""
train.py

Training script to perform a 100-sample sanity check (overfitting test)
to verify the convergence of the Denoising GNN layout model.
"""

import os
import sys
import copy
import time
from pathlib import Path
import torch
import torch.nn.functional as F

# Set up paths to load modules
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import kicad_sch_api as ksa
from ml.vocab import load_vocab
from ml.dataset import schematic_to_heterodata
from ml.model import SchematicGNN

# Configuration
CLEAN_DATASET_DIR = Path("/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset")
NUM_SAMPLES = 100
BATCH_SIZE = 16
NUM_EPOCHS = 30
LEARNING_RATE = 1e-3


def prepare_in_memory_dataset(vocab: dict) -> list:
    """Load, convert, and normalize a subset of the clean dataset."""
    print(f"Loading and converting {NUM_SAMPLES} samples from the clean dataset...")
    
    if not CLEAN_DATASET_DIR.exists():
        raise FileNotFoundError(f"Clean dataset directory not found. Run clean_dataset.py first.")
        
    sch_files = list(CLEAN_DATASET_DIR.glob("*.kicad_sch"))[:NUM_SAMPLES]
    dataset = []
    
    for idx, f_path in enumerate(sch_files, 1):
        try:
            schematic = ksa.load_schematic(str(f_path))
            # 1. Convert to PyG HeteroData
            data = schematic_to_heterodata(schematic, vocab)
            
            # 2. Skip if symbol count is too small
            num_symbols = data['symbol'].x.shape[0]
            if num_symbols < 2:
                continue
                
            # 3. Z-score Normalize target positions (y) per schematic
            pos = data['symbol'].y
            mean = pos.mean(dim=0)
            std = pos.std(dim=0, unbiased=False) + 1e-6
            data['symbol'].y = (pos - mean) / std
            
            # Save Z-score parameters on the object for reverse mapping later
            data['symbol'].mean = mean
            data['symbol'].std = std
            
            # 4. Precompute net-to-symbol index maps for the HPWL loss
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
            
        except Exception as e:
            # Skip invalid files or import warnings silently
            continue
            
    print(f"Successfully prepared {len(dataset)} graphs.")
    return dataset


def calculate_wirelength_loss(pred_coords: torch.Tensor, net_to_symbols: list) -> torch.Tensor:
    """Calculate Manhattan distance (L1) between connected symbols in each net."""
    loss_wl = torch.tensor(0.0, device=pred_coords.device)
    pair_count = 0
    
    for sym_indices in net_to_symbols:
        if len(sym_indices) < 2:
            continue
            
        # Extract coordinates of symbols in the net
        net_coords = pred_coords[sym_indices]  # [N, 2]
        
        # Calculate pairwise differences using broadcasting
        diff = net_coords.unsqueeze(0) - net_coords.unsqueeze(1)  # [N, N, 2]
        l1_dist = torch.sum(torch.abs(diff), dim=-1)  # [N, N]
        
        # Sum upper triangle
        loss_wl = loss_wl + torch.sum(torch.triu(l1_dist, diagonal=1))
        pair_count += len(sym_indices) * (len(sym_indices) - 1) // 2
        
    if pair_count > 0:
        return loss_wl / pair_count
    return loss_wl


def main():
    # 1. Device assignment (uses CPU to avoid MPS empty tensor backward bugs)
    device = torch.device("cpu")
    print(f"Using device: {device}")

    # Load vocab
    vocab = load_vocab()
    vocab_size = len(vocab)
    
    # 2. Load dataset
    dataset = prepare_in_memory_dataset(vocab)
    if not dataset:
        print("Error: No valid graphs could be loaded. Exiting.")
        sys.exit(1)

    # 3. Model setup
    model = SchematicGNN(vocab_size=vocab_size, hidden_dim=128).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=NUM_EPOCHS)

    print(f"\nStarting local sanity check training loop ({NUM_EPOCHS} epochs)...")
    
    for epoch in range(1, NUM_EPOCHS + 1):
        model.train()
        
        # HPWL Wirelength weight linear warmup schedule (0 to 0.1 over first 10 epochs)
        w3 = min(0.1, (epoch / 10.0) * 0.1)
        
        epoch_recon_loss = 0.0
        epoch_orient_loss = 0.0
        epoch_wl_loss = 0.0
        epoch_total_loss = 0.0
        
        start_time = time.time()
        
        # Process graphs (running individually to Z-score normalize and handle variable-size batches cleanly)
        for data in dataset:
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
            # Huber Loss for normalized coordinate reconstruction
            loss_recon = F.smooth_l1_loss(pred_coords, pos)
            
            # Cross-Entropy Loss for 8-class orientation
            loss_orient = F.cross_entropy(pred_orients, data['symbol'].orientation)
            
            # Differentiable Manhattan Wirelength (HPWL) Loss
            loss_wl = calculate_wirelength_loss(pred_coords, data.net_to_symbols)
            
            # Combined Loss
            loss = loss_recon * 1.0 + loss_orient * 0.5 + loss_wl * w3
            
            # Backpropagation
            loss.backward()
            optimizer.step()
            
            # Accumulate metrics
            epoch_recon_loss += loss_recon.item()
            epoch_orient_loss += loss_orient.item()
            epoch_wl_loss += loss_wl.item() if isinstance(loss_wl, torch.Tensor) else loss_wl
            epoch_total_loss += loss.item()
            
        scheduler.step()
        
        # Calculate averages
        num_graphs = len(dataset)
        avg_recon = epoch_recon_loss / num_graphs
        avg_orient = epoch_orient_loss / num_graphs
        avg_wl = epoch_wl_loss / num_graphs
        avg_total = epoch_total_loss / num_graphs
        elapsed = time.time() - start_time
        
        # Print progress every epoch
        print(
            f"Epoch [{epoch:02d}/{NUM_EPOCHS}] - "
            f"Total Loss: {avg_total:.4f} (Recon: {avg_recon:.4f}, Orient: {avg_orient:.4f}, WL: {avg_wl:.4f}, w3: {w3:.3f}) - "
            f"Time: {elapsed:.2f}s"
        )
        
    print("\nSanity Check complete. Training loop execution verified.")
    
    # Save temporary checkpoint weights
    temp_save_path = Path(__file__).resolve().parent / "modumake_gnn_temp.pth"
    torch.save(model.state_dict(), temp_save_path)
    print(f"Temporary weights saved to: {temp_save_path}")


if __name__ == "__main__":
    main()
