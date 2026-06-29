#!/usr/bin/env python3
"""
test_solver.py

Unit tests for Grid Snap and Overlap Resolution solver.
"""

import sys
from pathlib import Path
import pytest

# Set up paths to load modules
ML_DIR = Path(__file__).resolve().parent
ROOT_DIR = ML_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.solver import LayoutSolver


def test_grid_snapping():
    """Verify coordinate rounding to the nearest grid step."""
    # Snaps to multiples of 1.27
    assert LayoutSolver.snap_to_grid(0.0, 0.0) == (0.0, 0.0)
    assert LayoutSolver.snap_to_grid(1.0, 2.0) == (1.27, 2.54)
    assert LayoutSolver.snap_to_grid(-1.0, -2.0) == (-1.27, -2.54)
    assert LayoutSolver.snap_to_grid(0.6, 0.7) == (0.0, 1.27)


def test_overlap_check():
    """Verify bounding box overlap check with margin."""
    # Box 1: Center (0, 0), Size (5, 5). Half-size = (2.5, 2.5)
    # Box 2: Center (6, 0), Size (5, 5). Half-size = (2.5, 2.5)
    # Combined half-size = 5.0
    # Overlap occurs if dx < 5.0 + margin
    # If margin is 1.27, limit is 6.27. Since dx = 6.0, they should overlap.
    assert LayoutSolver.check_overlap((0.0, 0.0), (5.0, 5.0), (6.0, 0.0), (5.0, 5.0), margin=1.27) is True

    # If margin is 0.5, limit is 5.5. Since dx = 6.0, they should NOT overlap.
    assert LayoutSolver.check_overlap((0.0, 0.0), (5.0, 5.0), (6.0, 0.0), (5.0, 5.0), margin=0.5) is False


def test_resolve_overlaps():
    """Verify spiral search pushes overlapping symbols to nearest unoccupied grid slots."""
    # Define three overlapping components of size (10.0, 10.0)
    # Initially they all want to be at (0.0, 0.0)
    initial_positions = [
        (0.0, 0.0),
        (0.05, 0.05),
        (-0.05, -0.05)
    ]
    bbox_sizes = [
        (10.0, 10.0),
        (10.0, 10.0),
        (10.0, 10.0)
    ]

    grid_size = 1.27
    margin = 1.27

    resolved = LayoutSolver.resolve_overlaps(
        initial_positions,
        bbox_sizes,
        grid_size=grid_size,
        margin=margin
    )

    # There should be 3 resolved coordinates
    assert len(resolved) == 3

    # All resolved coordinates must be on the grid
    for pos in resolved:
        x_units = pos[0] / grid_size
        y_units = pos[1] / grid_size
        assert abs(x_units - round(x_units)) < 0.001
        assert abs(y_units - round(y_units)) < 0.001

    # Verify no overlaps exist in the resolved coordinates
    for i in range(len(resolved)):
        for j in range(i + 1, len(resolved)):
            assert LayoutSolver.check_overlap(
                resolved[i], bbox_sizes[i],
                resolved[j], bbox_sizes[j],
                margin=margin
            ) is False
