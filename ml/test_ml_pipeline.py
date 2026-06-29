#!/usr/bin/env python3
"""
test_ml_pipeline.py

Unit tests for vocabulary bucketing, graph conversion, and perturbation pipeline.
"""

import os
import sys
from pathlib import Path
import pytest
import torch
from torch_geometric.data import HeteroData

# Set up paths to load kiutils & kicad_sch_api & ml
ML_DIR = Path(__file__).resolve().parent
ROOT_DIR = ML_DIR.parent
PYKICAD_SRC = ROOT_DIR / "pykicad" / "src"
PYKICADAPI_SRC = ROOT_DIR / "pykicadapi"

if str(PYKICAD_SRC) not in sys.path:
    sys.path.insert(0, str(PYKICAD_SRC))
if str(PYKICADAPI_SRC) not in sys.path:
    sys.path.insert(0, str(PYKICADAPI_SRC))
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import kicad_sch_api as ksa
from ml.vocab import load_vocab, get_vocab_id, bucket_lib_id
from ml.dataset import schematic_to_heterodata, perturb_graph


class TestMLPipeline:
    """Test suite for validating GNN pre-processing pipeline."""

    @pytest.fixture
    def vocab(self):
        """Loads vocab.json or returns a dummy vocab for testing."""
        vocab_path = ML_DIR / "vocab.json"
        if vocab_path.exists():
            return load_vocab(vocab_path)
        else:
            # Fallback dummy vocab if vocab.json hasn't been built yet in test environment
            return {
                "<PAD>": 0,
                "<UNK_PASSIVE>": 1,
                "<UNK_IC>": 2,
                "<UNK_CONNECTOR>": 3,
                "<UNK_POWER>": 4,
                "<UNK_OTHER>": 5,
                "Device:R": 6,
                "Device:C": 7
            }

    @pytest.fixture
    def test_schematic_path(self):
        """Returns path to the hierarchical test schematic."""
        return (
            PYKICADAPI_SRC
            / "tests"
            / "reference_kicad_projects"
            / "connectivity"
            / "ps2_hierarchical_power"
            / "ps2_hierarchical_power.kicad_sch"
        )

    def test_vocab_bucketing(self, vocab):
        """Verify that library IDs are mapped or bucketed correctly according to prefix rules."""
        # 1. Direct match (if present in vocab)
        r_id = get_vocab_id("Device:R", vocab)
        assert r_id == vocab["Device:R"] or r_id == vocab["<UNK_PASSIVE>"]

        # 2. Passive bucketing
        assert bucket_lib_id("Device:C_NonExistent") == "<UNK_PASSIVE>"
        assert get_vocab_id("Device:C_NonExistent", vocab) == vocab["<UNK_PASSIVE>"]
 
        # 3. Power bucketing
        assert bucket_lib_id("power:GND_NonExistent") == "<UNK_POWER>"
        assert get_vocab_id("power:GND_NonExistent", vocab) == vocab["<UNK_POWER>"]
        assert get_vocab_id("VCC_NonExistent", vocab) == vocab["<UNK_POWER>"]
 
        # 4. Connector bucketing
        assert bucket_lib_id("Connector:Conn_NonExistent") == "<UNK_CONNECTOR>"
        assert get_vocab_id("Connector:Conn_NonExistent", vocab) == vocab["<UNK_CONNECTOR>"]
 
        # 5. IC bucketing
        assert bucket_lib_id("MCU_NonExistent:ATmega_NonExistent") == "<UNK_IC>"
        assert get_vocab_id("MCU_NonExistent:ATmega_NonExistent", vocab) == vocab["<UNK_IC>"]

    def test_schematic_to_graph_conversion(self, test_schematic_path, vocab):
        """Verify that a KiCad schematic converts into a valid PyG HeteroData graph with correct dimensions."""
        assert test_schematic_path.exists()
        
        # Load schematic
        schematic = ksa.Schematic.load(str(test_schematic_path))
        assert schematic is not None

        # Convert to HeteroData
        data = schematic_to_heterodata(schematic, vocab)
        assert isinstance(data, HeteroData)

        # Validate nodes exist
        assert 'symbol' in data.node_types
        assert 'pin' in data.node_types
        assert 'net' in data.node_types

        # Verify Symbol nodes shape: [num_symbols, 4] -> vocab_id, pin_count, width, height
        symbol_x = data['symbol'].x
        assert symbol_x.ndim == 2
        assert symbol_x.shape[1] == 4
        assert symbol_x.shape[0] >= 2  # The test schematic has R1, R2

        # Verify Pin nodes shape: [num_pins, 14] -> 12 one-hot + local dx, dy
        pin_x = data['pin'].x
        assert pin_x.ndim == 2
        assert pin_x.shape[1] == 14

        # Verify Net nodes shape: [num_nets, 4] -> pin_count + 3 one-hot
        net_x = data['net'].x
        assert net_x.ndim == 2
        assert net_x.shape[1] == 4

        # Validate edge connections exist
        assert ('symbol', 'has_pin', 'pin') in data.edge_types
        assert ('pin', 'belongs_to', 'net') in data.edge_types
        assert ('pin', 'rev_has_pin', 'symbol') in data.edge_types
        assert ('net', 'rev_belongs_to', 'pin') in data.edge_types

        # Check edge index dimensions
        assert data['symbol', 'has_pin', 'pin'].edge_index.shape[0] == 2
        assert data['pin', 'belongs_to', 'net'].edge_index.shape[0] == 2

        # Validate targets shape
        assert data['symbol'].y.shape == (symbol_x.shape[0], 2)
        assert data['symbol'].orientation.shape == (symbol_x.shape[0],)

    def test_perturb_graph(self, test_schematic_path, vocab):
        """Verify that the perturbation helper successfully creates coordinate noise for denoising training."""
        schematic = ksa.Schematic.load(str(test_schematic_path))
        data = schematic_to_heterodata(schematic, vocab)
        
        # Add noise
        perturbed_data = perturb_graph(data, sigma=20.0)
        
        # Verify perturbed positions are added
        assert hasattr(perturbed_data['symbol'], 'pos_perturbed')
        assert perturbed_data['symbol'].pos_perturbed.shape == data['symbol'].y.shape
        
        # Verify noise is actually different from original coordinates
        diff = torch.abs(perturbed_data['symbol'].pos_perturbed - data['symbol'].y)
        assert torch.sum(diff) > 0.0
