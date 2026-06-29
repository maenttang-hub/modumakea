#!/usr/bin/env python3
"""
test_model.py

Unit tests to verify GNN forward pass dimensions and input/output shapes.
"""

import sys
from pathlib import Path
import pytest
import torch
from torch_geometric.data import HeteroData

# Set up paths to load modules
ML_DIR = Path(__file__).resolve().parent
ROOT_DIR = ML_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.model import SchematicGNN


def test_model_forward():
    """Verify that the SchematicGNN forward pass runs without error and returns correct shapes."""
    # Setup dummy model with vocabulary size 100
    model = SchematicGNN(vocab_size=100, hidden_dim=64)
    model.eval()

    # Construct a dummy HeteroData graph structure
    data = HeteroData()

    num_symbols = 5
    num_pins = 12
    num_nets = 4

    # 1. Populate node features
    # Symbol node features: 6 dims -> [vocab_id (float), pin_count, width, height, perturbed_x, perturbed_y]
    sym_x = torch.randn((num_symbols, 6))
    sym_x[:, 0] = torch.randint(0, 100, (num_symbols,)).float()  # vocab_id must be valid integer indexes represented as floats
    data['symbol'].x = sym_x

    # Pin node features: 14 dims -> [12 type one-hot, local_dx, local_dy]
    data['pin'].x = torch.randn((num_pins, 14))

    # Net node features: 4 dims -> [connected_pin_count, 3 type one-hot]
    data['net'].x = torch.randn((num_nets, 4))

    # 2. Populate edge indexes
    # Symbol -> HasPin -> Pin and reverse
    data['symbol', 'has_pin', 'pin'].edge_index = torch.tensor([
        [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 0, 1],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    ], dtype=torch.long)

    data['pin', 'rev_has_pin', 'symbol'].edge_index = torch.tensor([
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 0, 1]
    ], dtype=torch.long)

    # Pin -> BelongsTo -> Net and reverse
    data['pin', 'belongs_to', 'net'].edge_index = torch.tensor([
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        [0, 0, 1, 1, 2, 2, 3, 3, 0, 1, 2, 3]
    ], dtype=torch.long)

    data['net', 'rev_belongs_to', 'pin'].edge_index = torch.tensor([
        [0, 0, 1, 1, 2, 2, 3, 3, 0, 1, 2, 3],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    ], dtype=torch.long)

    # 3. Forward pass
    with torch.no_grad():
        pred_coords, pred_orients = model(data.x_dict, data.edge_index_dict)

    # 4. Verify output shapes
    # Coordinates output shape should be [num_symbols, 2]
    assert pred_coords.shape == (num_symbols, 2), f"Expected shape {(num_symbols, 2)}, got {pred_coords.shape}"
    
    # Orientations output shape should be [num_symbols, 8]
    assert pred_orients.shape == (num_symbols, 8), f"Expected shape {(num_symbols, 8)}, got {pred_orients.shape}"
