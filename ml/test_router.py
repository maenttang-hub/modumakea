#!/usr/bin/env python3
"""
test_router.py

Unit and integration tests for high-reliability orthogonal router (ml/router.py).
"""

import pytest
import sys
from pathlib import Path

# Add project path to sys.path
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from kicad_sch_api.core.types import Point
from kicad_sch_api.core.component_bounds import BoundingBox
from ml.router import (
    build_mst_edges,
    is_point_on_segment,
    calculate_junctions,
    run_astar_routing,
    simplify_grid_path
)


def test_build_mst_edges():
    # 3 points forming a right-angled triangle
    points = [
        (Point(0.0, 0.0), 0),
        (Point(4.0, 0.0), 1),
        (Point(0.0, 3.0), 2)
    ]
    edges = build_mst_edges(points)
    
    assert len(edges) == 2
    connected = set(tuple(sorted(e)) for e in edges)
    assert (0, 1) in connected
    assert (0, 2) in connected
    assert (1, 2) not in connected


def test_is_point_on_segment():
    seg_start = Point(0.0, 5.0)
    seg_end = Point(10.0, 5.0)
    
    assert is_point_on_segment(Point(5.0, 5.0), seg_start, seg_end) is True
    assert is_point_on_segment(Point(12.0, 5.0), seg_start, seg_end) is False
    assert is_point_on_segment(Point(5.0, 6.0), seg_start, seg_end) is False
    assert is_point_on_segment(Point(0.0, 5.0), seg_start, seg_end) is False


def test_calculate_junctions():
    # T-junction: Horizontal segment and vertical segment meeting
    segments = [
        (Point(0.0, 5.0), Point(10.0, 5.0)),
        (Point(5.0, 5.0), Point(5.0, 10.0))
    ]
    junctions = calculate_junctions(segments, set())
    assert len(junctions) == 1
    assert junctions[0].x == 5.0
    assert junctions[0].y == 5.0


def test_run_astar_routing_no_obstacles():
    # Direct horizontal routing
    start = Point(0.0, 0.0)
    end = Point(5.08, 0.0) # 4 grid units
    
    path = run_astar_routing(start, end, obstacles=[], wire_obstacles=set(), grid_size=1.27)
    assert path is not None
    # Expected cells: (0,0) -> (1,0) -> (2,0) -> (3,0) -> (4,0)
    assert path == [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)]
    
    # Check simplification
    segments = simplify_grid_path(path, grid_size=1.27)
    assert len(segments) == 1
    assert segments[0][0].x == 0.0
    assert segments[0][0].y == 0.0
    assert segments[0][1].x == 5.08
    assert segments[0][1].y == 0.0


def test_run_astar_routing_avoid_component():
    # Route from (0,0) to (5.08, 0.0)
    # Put a component bounding box exactly in the middle cell: (2, 0)
    start = Point(0.0, 0.0)
    end = Point(5.08, 0.0)
    
    # BBox covers (2*1.27, 0) i.e. 2.54, 0
    # Let's define bbox from x=1.5 to 3.5, y=-1.0 to 1.0
    bbox = BoundingBox(1.5, -1.0, 3.5, 1.0)
    
    path = run_astar_routing(start, end, obstacles=[bbox], wire_obstacles=set(), grid_size=1.27)
    assert path is not None
    # Grid cell (2, 0) is blocked. Path must detour around (2, 0).
    # E.g. (0,0) -> (1,0) -> (1,1) -> (2,1) -> (3,1) -> (3,0) -> (4,0)
    assert (2, 0) not in path
    
    segments = simplify_grid_path(path, grid_size=1.27)
    # Check that segments route around the obstacle
    for s_start, s_end in segments:
        # Check that no segment goes straight through (2.54, 0)
        assert not (s_start.y == 0.0 and s_end.y == 0.0 and min(s_start.x, s_end.x) < 2.54 < max(s_start.x, s_end.x))


def test_run_astar_routing_avoid_wire_short_circuit():
    start = Point(0.0, 0.0)
    end = Point(5.08, 0.0)
    
    # Cell (2, 0) is blocked by another net's wire
    wire_obstacles = {(2, 0)}
    
    path = run_astar_routing(start, end, obstacles=[], wire_obstacles=wire_obstacles, grid_size=1.27)
    assert path is not None
    assert (2, 0) not in path
