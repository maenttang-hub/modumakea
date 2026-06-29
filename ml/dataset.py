#!/usr/bin/env python3
"""
dataset.py

Implements the graph conversion pipeline from KiCad schematics to PyTorch Geometric HeteroData.
Extracts symbols, pins, and nets as nodes, and sets up has_pin and belongs_to edges.
Also defines target attributes (coordinates and orientation) for GNN training.
"""

import os
import sys
import json
import copy
from pathlib import Path
import torch
from torch_geometric.data import HeteroData

# Set up paths to load kiutils & kicad_sch_api
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
from kicad_sch_api.core.connectivity import ConnectivityAnalyzer
from kicad_sch_api.library.cache import get_symbol_cache
from kicad_sch_api.core.component_bounds import SymbolBoundingBoxCalculator
from ml.vocab import get_vocab_id, load_vocab


def schematic_to_heterodata(schematic: ksa.Schematic, vocab: dict) -> HeteroData:
    """
    Convert a ksa.Schematic object to a PyG HeteroData graph.
    
    Nodes:
      - symbol: [vocab_id, pin_count, bbox_width, bbox_height]
      - pin: [electrical_type_one_hot (dim 12), local_dx, local_dy]
      - net: [connected_pin_count, net_type_one_hot (dim 3)]
      
    Edges:
      - (symbol, has_pin, pin)
      - (pin, rev_has_pin, symbol)
      - (pin, belongs_to, net)
      - (net, rev_belongs_to, pin)
      
    Targets (Ground Truth Y):
      - symbol.y: [num_symbols, 2] -> absolute coordinates (x, y)
      - symbol.orientation: [num_symbols] -> orientation class (0 to 7)
    """
    data = HeteroData()
    
    # 1. Load all sheets (hierarchical)
    analyzer = ConnectivityAnalyzer(tolerance=0.1)
    schematics = analyzer._load_hierarchical_schematics(schematic)
    
    # Run connectivity analysis to find all nets
    nets = analyzer.analyze(schematic, hierarchical=True)
    
    # 2. Extract symbols
    symbol_to_idx = {}
    symbol_nodes = []
    symbol_positions = []
    symbol_orientations = []
    
    cache = get_symbol_cache()
    
    for sch in schematics:
        for component in sch.components:
            ref = component.reference
            if ref in symbol_to_idx:
                # Avoid duplicate components across sheets (should not happen for unique references)
                continue
                
            symbol_to_idx[ref] = len(symbol_nodes)
            
            # Vocab ID mapping
            vocab_id = get_vocab_id(component.lib_id, vocab)
            
            # Fetch symbol definition from cache
            symbol_def = cache.get_symbol(component.lib_id)
            pin_count = len(symbol_def.pins) if symbol_def else len(component.pins)
            
            # Base Symbol Bounding Box (Symbol Space)
            width, height = 5.08, 5.08  # Default sizing in mm
            if symbol_def:
                try:
                    bbox = SymbolBoundingBoxCalculator.calculate_bounding_box(symbol_def, include_properties=False)
                    width = bbox.width
                    height = bbox.height
                except Exception:
                    pass
            
            symbol_nodes.append([float(vocab_id), float(pin_count), float(width), float(height)])
            
            # Target absolute position
            symbol_positions.append([component.position.x, component.position.y])
            
            # Target orientation class (rot 4-class * mirror 2-class = 8 classes)
            rot = int(getattr(component, "rotation", 0))
            rot_class = {0: 0, 90: 1, 180: 2, 270: 3}.get(rot, 0)
            
            mirror = getattr(component, "mirror", None)
            mirror_class = 1 if mirror is not None else 0
            
            orientation_class = rot_class * 2 + mirror_class
            symbol_orientations.append(orientation_class)
            
    # 3. Extract pins
    pin_to_idx = {}
    pin_nodes = []
    pin_symbol_edges = []
    
    # Electrical type categories
    elec_classes = [
        'input', 'output', 'bidirectional', 'tri_state', 'passive', 
        'free', 'unspecified', 'power_in', 'power_out', 'open_collector', 
        'open_emitter', 'no_connect'
    ]
    
    for sch in schematics:
        for component in sch.components:
            sym_idx = symbol_to_idx[component.reference]
            symbol_def = cache.get_symbol(component.lib_id)
            
            pins = symbol_def.pins if symbol_def else component.pins
            
            for pin in pins:
                pin_key = (component.reference, pin.number)
                if pin_key in pin_to_idx:
                    continue
                    
                pin_idx = len(pin_nodes)
                pin_to_idx[pin_key] = pin_idx
                
                # Pin type one-hot encoding
                elec_type_str = pin.electricalType if hasattr(pin, 'electricalType') else 'unspecified'
                if hasattr(elec_type_str, 'value'):
                    elec_type_str = elec_type_str.value
                    
                one_hot = [0.0] * len(elec_classes)
                if elec_type_str in elec_classes:
                    one_hot[elec_classes.index(elec_type_str)] = 1.0
                else:
                    one_hot[elec_classes.index('unspecified')] = 1.0
                    
                # Local pin offset in symbol space
                if hasattr(pin, 'position'):
                    if hasattr(pin.position, 'x'):
                        dx, dy = pin.position.x, pin.position.y
                    else:
                        dx, dy = pin.position
                else:
                    dx, dy = 0.0, 0.0
                    
                pin_nodes.append(one_hot + [float(dx), float(dy)])
                
                # Edge: Symbol -> Pin
                pin_symbol_edges.append([sym_idx, pin_idx])
                
    # 4. Extract nets & connect to pins
    net_nodes = []
    pin_net_edges = []
    
    for net_idx, net in enumerate(nets):
        num_pins = len(net.pins)
        
        # Net type one-hot: [Power, Ground, Signal]
        net_type = [0.0, 0.0, 0.0]
        net_name_lower = (net.name or "").lower()
        if any(x in net_name_lower for x in ["gnd", "gnda", "gndd", "vss"]):
            net_type[1] = 1.0  # Ground
        elif any(x in net_name_lower for x in ["vcc", "vdd", "+5v", "+3.3v", "+12v", "-12v", "pwr", "power"]):
            net_type[0] = 1.0  # Power
        else:
            net_type[2] = 1.0  # Signal
            
        net_nodes.append([float(num_pins)] + net_type)
        
        for pin_conn in net.pins:
            pin_key = (pin_conn.reference, pin_conn.pin_number)
            if pin_key in pin_to_idx:
                p_idx = pin_to_idx[pin_key]
                # Edge: Pin -> Net
                pin_net_edges.append([p_idx, net_idx])
                
    # 5. Populate PyG HeteroData structure
    data['symbol'].x = torch.tensor(symbol_nodes, dtype=torch.float).view(-1, 4)
    data['pin'].x = torch.tensor(pin_nodes, dtype=torch.float).view(-1, 14)
    data['net'].x = torch.tensor(net_nodes, dtype=torch.float).view(-1, 4)
    
    # Edges: Symbol -> Pin
    if pin_symbol_edges:
        edge_index_has_pin = torch.tensor(pin_symbol_edges, dtype=torch.long).t().contiguous()
    else:
        edge_index_has_pin = torch.empty((2, 0), dtype=torch.long)
    data['symbol', 'has_pin', 'pin'].edge_index = edge_index_has_pin
    
    # Reverse Edges: Pin -> Symbol
    if pin_symbol_edges:
        rev_pin_symbol = [[p, s] for s, p in pin_symbol_edges]
        edge_index_rev_has_pin = torch.tensor(rev_pin_symbol, dtype=torch.long).t().contiguous()
    else:
        edge_index_rev_has_pin = torch.empty((2, 0), dtype=torch.long)
    data['pin', 'rev_has_pin', 'symbol'].edge_index = edge_index_rev_has_pin
    
    # Edges: Pin -> Net
    if pin_net_edges:
        edge_index_belongs_to = torch.tensor(pin_net_edges, dtype=torch.long).t().contiguous()
    else:
        edge_index_belongs_to = torch.empty((2, 0), dtype=torch.long)
    data['pin', 'belongs_to', 'net'].edge_index = edge_index_belongs_to
    
    # Reverse Edges: Net -> Pin
    if pin_net_edges:
        rev_pin_net = [[n, p] for p, n in pin_net_edges]
        edge_index_rev_belongs_to = torch.tensor(rev_pin_net, dtype=torch.long).t().contiguous()
    else:
        edge_index_rev_belongs_to = torch.empty((2, 0), dtype=torch.long)
    data['net', 'rev_belongs_to', 'pin'].edge_index = edge_index_rev_belongs_to
    
    # Targets (Y)
    data['symbol'].y = torch.tensor(symbol_positions, dtype=torch.float).view(-1, 2)
    data['symbol'].orientation = torch.tensor(symbol_orientations, dtype=torch.long)
    
    return data


def perturb_graph(data: HeteroData, sigma=25.4) -> HeteroData:
    """
    Generate perturbed positions for Denoising Autoencoder training.
    Applies Gaussian noise to Symbol positions and stores them in data['symbol'].pos_perturbed.
    """
    perturbed_data = copy.deepcopy(data)
    pos = perturbed_data['symbol'].y  # Ground truth absolute position [num_symbols, 2]
    noise = torch.randn_like(pos) * sigma
    perturbed_data['symbol'].pos_perturbed = pos + noise
    return perturbed_data


def process_dataset():
    """Bulk processes the clean KiCad schematics dataset into PyG graphs."""
    vocab = load_vocab()
    
    clean_dir = Path("/Users/gimdong-il/Desktop/프로그램/clean_kicad_dataset")
    output_dir = Path("/Users/gimdong-il/Desktop/프로그램/processed_graphs")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    sch_files = list(clean_dir.glob("*.kicad_sch"))
    print(f"Converting {len(sch_files)} files to PyG HeteroData...")
    
    success_count = 0
    for idx, f_path in enumerate(sch_files, 1):
        if idx % 500 == 0 or idx == len(sch_files):
            print(f"Converted {idx}/{len(sch_files)} files...")
            
        try:
            schematic = ksa.load_schematic(str(f_path))
            graph_data = schematic_to_heterodata(schematic, vocab)
            
            # Save graph
            graph_save_path = output_dir / f"{f_path.stem}.pt"
            torch.save(graph_data, graph_save_path)
            success_count += 1
        except Exception as e:
            print(f"Warning: Failed to convert {f_path.name}: {e}")
            continue
            
    print(f"\nGraph conversion completed successfully! Converted {success_count}/{len(sch_files)} files.")
    print(f"Saved processed graph files to: {output_dir}")


if __name__ == "__main__":
    process_dataset()
