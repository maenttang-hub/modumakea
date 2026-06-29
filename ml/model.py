#!/usr/bin/env python3
"""
model.py

Defines the Heterogeneous GNN model architecture for automatic schematic layout.
Uses HeteroConv with GATv2Conv layers to process symbols, pins, and nets,
and outputs predicted symbol coordinates and orientations.
"""

import sys
from pathlib import Path
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import HeteroConv, GATv2Conv

# Set up paths to load modules
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


class SchematicGNN(nn.Module):
    """
    Heterogeneous Graph Attention Network for KiCad Symbol Placement.
    Receives symbol, pin, and net features, executes message passing over
    schematic topological structure, and regresses coordinates + classifies orientations.
    """

    def __init__(self, vocab_size: int, hidden_dim: int = 128):
        super().__init__()
        self.hidden_dim = hidden_dim

        # 1. Input Embedding & Linear Projections
        # Symbol features: vocab_id (embedded to 64), [pin_count, width, height, perturbed_x, perturbed_y] (projected to 64)
        self.symbol_embed = nn.Embedding(vocab_size, 64)
        self.symbol_proj = nn.Linear(5, 64)

        # Pin features: 12 electrical type one-hot + local_dx, local_dy (dim 14) projected to 128
        self.pin_proj = nn.Linear(14, hidden_dim)

        # Net features: connected_pin_count + 3 type one-hot (dim 4) projected to 128
        self.net_proj = nn.Linear(4, hidden_dim)

        # 2. Heterogeneous GNN Message Passing layers
        # 4 layers of Graph Attention Networks (GATv2) wrapping HeteroConv
        self.convs = nn.ModuleList()
        for _ in range(4):
            conv_dict = {
                ('symbol', 'has_pin', 'pin'): GATv2Conv((-1, -1), hidden_dim, add_self_loops=False),
                ('pin', 'rev_has_pin', 'symbol'): GATv2Conv((-1, -1), hidden_dim, add_self_loops=False),
                ('pin', 'belongs_to', 'net'): GATv2Conv((-1, -1), hidden_dim, add_self_loops=False),
                ('net', 'rev_belongs_to', 'pin'): GATv2Conv((-1, -1), hidden_dim, add_self_loops=False)
            }
            self.convs.append(HeteroConv(conv_dict, aggr='sum'))

        # 3. Output prediction Heads
        # Coordinate Regression Head: predicts absolute normalized [x, y]
        self.coord_head = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, 2)
        )

        # Orientation Classification Head: predicts 8-class probabilities
        # (4 rotations: 0, 90, 180, 270 × 2 mirror states: yes/no)
        self.orient_head = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, 8)
        )

    def forward(self, x_dict, edge_index_dict):
        """
        Forward pass for Heterogeneous Graph input.
        
        Args:
            x_dict: Dictionary mapping node type string to node feature tensor.
            edge_index_dict: Dictionary mapping edge type tuple to edge index tensor.
            
        Returns:
            Tuple: (predicted_coords, predicted_orientations)
        """
        # --- Node projection ---
        symbol_x = x_dict['symbol']  # shape: [num_symbols, 6]
        vocab_ids = symbol_x[:, 0].long()
        other_feats = symbol_x[:, 1:]  # pin_count, width, height, perturbed_x, perturbed_y (shape: [num_symbols, 5])

        # Construct 128-dimensional hidden representation for symbol nodes
        symbol_emb = self.symbol_embed(vocab_ids)  # [num_symbols, 64]
        symbol_proj_feats = self.symbol_proj(other_feats)  # [num_symbols, 64]
        h_symbol = torch.cat([symbol_emb, symbol_proj_feats], dim=1)  # [num_symbols, 128]

        # Pins & Nets projection
        h_pin = self.pin_proj(x_dict['pin'])  # [num_pins, 128]
        h_net = self.net_proj(x_dict['net'])  # [num_nets, 128]

        h_dict = {
            'symbol': h_symbol,
            'pin': h_pin,
            'net': h_net
        }

        # --- Message passing ---
        for conv in self.convs:
            # Perform convolution
            h_dict = conv(h_dict, edge_index_dict)
            # Apply ReLU activation and dropout
            h_dict = {k: F.relu(v) for k, v in h_dict.items()}
            h_dict = {k: F.dropout(v, p=0.1, training=self.training) for k, v in h_dict.items()}

        # --- Output Heads ---
        h_symbol_out = h_dict['symbol']

        pred_coords = self.coord_head(h_symbol_out)  # [num_symbols, 2]
        pred_orientations = self.orient_head(h_symbol_out)  # [num_symbols, 8]

        return pred_coords, pred_orientations
