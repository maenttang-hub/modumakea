#!/usr/bin/env python3
"""
inference.py

Automated schematic layout inference script.
Loads a KiCad schematic, converts it to a GNN graph, predicts coordinates and rotations,
resolves overlaps using Grid Snap & Overlap Solver, and writes layout back to a KiCad schematic file.
"""

import sys
import argparse
from pathlib import Path
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
from kicad_sch_api.core.connectivity import ConnectivityAnalyzer
from kicad_sch_api.core.types import Point
from ml.vocab import load_vocab
from ml.dataset import schematic_to_heterodata
from ml.model import SchematicGNN
from ml.solver import LayoutSolver
from ml.router import capture_pre_layout_nets, route_schematic_connections



def main():
    parser = argparse.ArgumentParser(description="Run GNN auto-layout inference on a KiCad schematic.")
    parser.add_argument("--input", type=str, required=True, help="Path to input KiCad schematic (.kicad_sch).")
    parser.add_argument("--output", type=str, default="output.kicad_sch", help="Path to save output schematic.")
    parser.add_argument("--model_path", type=str, default="ml/modumake_gnn_best.pth", help="Path to GNN weights.")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    
    if not input_path.exists():
        print(f"Error: Input schematic file not found at {input_path}")
        sys.exit(1)

    # Determine GNN model checkpoint path (fallback to temp weights if best weights not trained yet)
    model_weights_path = Path(args.model_path)
    if not model_weights_path.exists():
        temp_weights_path = Path("ml/modumake_gnn_temp.pth")
        if temp_weights_path.exists():
            print(f"Best model weights not found. Falling back to temporary weights: {temp_weights_path}")
            model_weights_path = temp_weights_path
        else:
            print(f"Error: No GNN model weights found at {args.model_path}")
            sys.exit(1)

    print(f"Loading GNN model from: {model_weights_path}")
    vocab = load_vocab()
    vocab_size = len(vocab)
    
    model = SchematicGNN(vocab_size=vocab_size, hidden_dim=128)
    model.load_state_dict(torch.load(model_weights_path, map_location="cpu"))
    model.eval()

    print(f"Loading input schematic: {input_path}")
    schematic = ksa.load_schematic(str(input_path))

    # Capture original nets before moving components
    captured_nets = capture_pre_layout_nets(schematic)


    # 1. Convert schematic to PyG HeteroData graph
    data = schematic_to_heterodata(schematic, vocab)
    
    num_symbols = data['symbol'].x.shape[0]
    if num_symbols == 0:
        print("Warning: No symbols found in schematic. Saving unchanged.")
        schematic.save(str(output_path))
        sys.exit(0)

    # 2. Extract references map to match GNN output back to components
    ref_to_component = {}
    analyzer = ConnectivityAnalyzer(tolerance=0.1)
    schematics = analyzer._load_hierarchical_schematics(schematic)
    for sch in schematics:
        for component in sch.components:
            ref_to_component[component.reference] = component

    # Reconstruct indexing corresponding to GNN symbol nodes order
    symbol_to_idx = {}
    symbol_nodes_count = 0
    from kicad_sch_api.library.cache import get_symbol_cache
    cache = get_symbol_cache()
    
    for sch in schematics:
        for component in sch.components:
            ref = component.reference
            if ref in symbol_to_idx:
                continue
            symbol_to_idx[ref] = symbol_nodes_count
            symbol_nodes_count += 1

    idx_to_ref = {idx: ref for ref, idx in symbol_to_idx.items()}

    # 3. Z-score normalize coordinates based on input layout
    pos = data['symbol'].y
    mean = pos.mean(dim=0)
    std = pos.std(dim=0, unbiased=False) + 1e-6
    # Fallback scale if symbols are co-located
    if std.mean().item() < 1.0:
        std = torch.tensor([50.0, 50.0])
        
    pos_perturbed = (pos - mean) / std
    x_symbol = torch.cat([data['symbol'].x, pos_perturbed], dim=1)
    
    x_dict = {
        'symbol': x_symbol,
        'pin': data['pin'].x,
        'net': data['net'].x
    }

    # 4. GNN Inference
    print("Running GNN layout prediction...")
    with torch.no_grad():
        pred_coords, pred_orients = model(x_dict, data.edge_index_dict)

    # 5. Denormalize predicted coordinates back to mm
    pred_coords_mm = (pred_coords * std + mean).tolist()
    
    # Extract symbol bounding boxes width/height from features
    bbox_sizes = data['symbol'].x[:, 2:4].tolist()

    # 6. Apply Snap & Overlap Solver
    print("Resolving layout constraints (Snapping and Overlap resolution)...")
    resolved_positions = LayoutSolver.resolve_overlaps(
        pred_coords_mm,
        bbox_sizes,
        grid_size=1.27,
        margin=1.27
    )

    # 7. Write layout properties back to component wrappers
    print("Updating schematic components with predicted layouts...")
    for i in range(num_symbols):
        ref = idx_to_ref[i]
        component = ref_to_component.get(ref)
        if not component:
            continue
            
        # Update position and rotation dynamically (translating and rotating property S-expressions)
        new_pos = resolved_positions[i]
        pred_orient_class = pred_orients[i].argmax(dim=-1).item()
        new_rot = (pred_orient_class // 2) * 90
        component.update_position(Point(*new_pos), new_rot)

    # 8. Rebuild routing with connectivity preservation
    print("Rebuilding orthogonal wire connections and junctions...")
    route_schematic_connections(schematic, captured_nets)

    # 9. Save updated schematic
    print(f"Saving layout results to: {output_path}")
    schematic.save(str(output_path))
    print("Auto-layout completed successfully!")


if __name__ == "__main__":
    main()
