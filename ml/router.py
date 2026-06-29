#!/usr/bin/env python3
"""
router.py

Provides high-reliability orthogonal Manhattan routing and connectivity preservation.
Avoids running wires through components (Obstacle Avoidance) and prevents different
nets from overlapping (Short-Circuit Prevention) using 2D grid-based A* pathfinding.
"""

import logging
import heapq
from collections import defaultdict
from typing import Dict, List, Set, Tuple, Optional
import math

import kicad_sch_api as ksa
from kicad_sch_api.core.types import Point, WireType
from kicad_sch_api.geometry.routing import create_orthogonal_routing, CornerDirection
from kicad_sch_api.core.connectivity import ConnectivityAnalyzer
from kicad_sch_api.core.component_bounds import get_component_bounding_box, BoundingBox

logger = logging.getLogger(__name__)


def capture_pre_layout_nets(schematic) -> List[Dict]:
    """
    Run connectivity analysis before layout modification and extract all nets
    with their corresponding component references and pin numbers.
    Also handles implicit connections where component pins directly overlap (zero-length wire).
    """
    logger.info("Analyzing and capturing pre-layout connectivity...")
    analyzer = ConnectivityAnalyzer(tolerance=0.1)
    all_schematics = analyzer._load_hierarchical_schematics(schematic)
    
    # 1. Run basic connectivity analyzer
    nets = analyzer.analyze(schematic, hierarchical=True)
    
    # Track all component pins and their positions
    all_pins = [] # List of (ref, pin_num, Point)
    for sch in all_schematics:
        for comp in sch.components:
            pins = sch._wire_manager.list_component_pins(comp.reference)
            for pin_num, pos in pins:
                if pos:
                    all_pins.append((comp.reference, pin_num, pos))
                    
    # Map pin reference to unique ID for union-find
    pin_to_idx = {(ref, pin_num): idx for idx, (ref, pin_num, _) in enumerate(all_pins)}
    num_pins = len(all_pins)
    parent = list(range(num_pins))
    
    def find(k):
        if parent[k] == k:
            return k
        parent[k] = find(parent[k])
        return parent[k]
        
    def union(u, v):
        root_u = find(u)
        root_v = find(v)
        if root_u != root_v:
            parent[root_u] = root_v
            
    # 2. Merge pins belonging to the same net from Analyzer
    for net in nets:
        net_pins = [(p.reference, p.pin_number) for p in net.pins]
        valid_indices = [pin_to_idx[p] for p in net_pins if p in pin_to_idx]
        if len(valid_indices) >= 2:
            first = valid_indices[0]
            for other in valid_indices[1:]:
                union(first, other)
                
    # 3. Merge overlapping pins (implicit zero-length wire connection)
    tolerance = 0.1
    for i in range(num_pins):
        ref1, num1, pos1 = all_pins[i]
        for j in range(i + 1, num_pins):
            ref2, num2, pos2 = all_pins[j]
            if pos1.distance_to(pos2) <= tolerance:
                union(i, j)
                
    # 4. Group pins by their root parent
    groups = defaultdict(list)
    for i in range(num_pins):
        root = find(i)
        ref, pin_num, _ = all_pins[i]
        groups[root].append((ref, pin_num))
        
    captured_nets = []
    for root, pins in groups.items():
        if len(pins) >= 2:
            captured_nets.append({
                "name": f"Net-implicit-{root}",
                "pins": pins
            })
            
    logger.info(f"Captured {len(captured_nets)} valid electrical nets (including implicit overlapping pins).")
    return captured_nets


def build_mst_edges(points: List[Tuple[Point, int]]) -> List[Tuple[int, int]]:
    """
    Construct a Minimum Spanning Tree (MST) on Manhattan distance.
    Returns a list of edge index tuples (idx_a, idx_b).
    """
    n = len(points)
    if n < 2:
        return []
        
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            p1, idx1 = points[i]
            p2, idx2 = points[j]
            # Manhattan distance as weight
            dist = abs(p1.x - p2.x) + abs(p1.y - p2.y)
            edges.append((dist, idx1, idx2))
            
    # Kruskal's algorithm
    edges.sort(key=lambda x: x[0])
    
    parent = list(range(n))
    
    def find(k):
        if parent[k] == k:
            return k
        parent[k] = find(parent[k])
        return parent[k]
        
    def union(u, v):
        root_u = find(u)
        root_v = find(v)
        if root_u != root_v:
            parent[root_u] = root_v
            return True
        return False
        
    mst_edges = []
    for dist, u, v in edges:
        if union(u, v):
            mst_edges.append((u, v))
            if len(mst_edges) == n - 1:
                break
                
    return mst_edges


def is_point_on_segment(pt: Point, seg_start: Point, seg_end: Point, tolerance: float = 0.05) -> bool:
    """
    Check if a point lies on the interior of an orthogonal segment (strictly between start and end).
    """
    # Segment is horizontal
    if abs(seg_start.y - seg_end.y) < tolerance:
        if abs(pt.y - seg_start.y) < tolerance:
            min_x = min(seg_start.x, seg_end.x)
            max_x = max(seg_start.x, seg_end.x)
            # Strictly inside segment bounds (excluding endpoints)
            if min_x + tolerance < pt.x < max_x - tolerance:
                return True
                
    # Segment is vertical
    elif abs(seg_start.x - seg_end.x) < tolerance:
        if abs(pt.x - seg_start.x) < tolerance:
            min_y = min(seg_start.y, seg_end.y)
            max_y = max(seg_start.y, seg_end.y)
            # Strictly inside segment bounds (excluding endpoints)
            if min_y + tolerance < pt.y < max_y - tolerance:
                return True
                
    return False


def calculate_junctions(
    segments: List[Tuple[Point, Point]],
    pin_positions: Set[Tuple[float, float]],
    tolerance: float = 0.05
) -> List[Point]:
    """
    Find junction points within a schematic sheet.
    Junctions exist where:
    1) T-junctions: An endpoint of one segment lies on the interior of another segment.
    2) 3-way or 4-way endpoints: Three or more segment endpoints meet at a point that is NOT a component pin.
    """
    junction_pts = []
    
    # Keep track of unique coordinates
    def coord_key(p: Point) -> Tuple[float, float]:
        return (round(p.x / 0.1) * 0.1, round(p.y / 0.1) * 0.1)

    # 1. T-Junctions detection
    for i, s1 in enumerate(segments):
        start1, end1 = s1
        for j, s2 in enumerate(segments):
            if i == j:
                continue
            start2, end2 = s2
            
            # Check if start2 or end2 of s2 is on interior of s1
            if is_point_on_segment(start2, start1, end1, tolerance):
                junction_pts.append(start2)
            if is_point_on_segment(end2, start1, end1, tolerance):
                junction_pts.append(end2)
                
    # 2. 3-way or 4-way meeting points
    endpoint_counts = defaultdict(int)
    endpoint_repr = {}
    
    for start, end in segments:
        key_start = coord_key(start)
        key_end = coord_key(end)
        
        endpoint_counts[key_start] += 1
        endpoint_counts[key_end] += 1
        
        endpoint_repr[key_start] = start
        endpoint_repr[key_end] = end
        
    for key, count in endpoint_counts.items():
        if count >= 3:
            # Check if it is NOT a component pin
            is_pin = False
            for px, py in pin_positions:
                dist = math.hypot(key[0] - px, key[1] - py)
                if dist < tolerance:
                    is_pin = True
                    break
                    
            if not is_pin:
                junction_pts.append(endpoint_repr[key])
                
    # Remove duplicate junctions within tolerance
    unique_junctions = []
    for j_pt in junction_pts:
        found_dup = False
        for u_pt in unique_junctions:
            if j_pt.distance_to(u_pt) < tolerance:
                found_dup = True
                break
        if not found_dup:
            unique_junctions.append(j_pt)
            
    return unique_junctions


def simplify_grid_path(grid_path: List[Tuple[int, int]], grid_size: float) -> List[Tuple[Point, Point]]:
    """
    Simplify a path of grid cells into a minimal list of orthogonal Point segments.
    """
    if len(grid_path) < 2:
        return []
        
    # Convert cell indices to actual physical Points
    pts = [Point(c * grid_size, r * grid_size) for c, r in grid_path]
    
    vertices = [pts[0]]
    for i in range(1, len(pts) - 1):
        p_prev = pts[i - 1]
        p_curr = pts[i]
        p_next = pts[i + 1]
        
        dx1, dy1 = p_curr.x - p_prev.x, p_curr.y - p_prev.y
        dx2, dy2 = p_next.x - p_curr.x, p_next.y - p_curr.y
        
        # Check alignment (orthogonal steps)
        # If direction changes, p_curr is a vertex
        aligned = (dx1 == 0 and dx2 == 0) or (dy1 == 0 and dy2 == 0)
        if not aligned:
            vertices.append(p_curr)
            
    vertices.append(pts[-1])
    
    # Group vertices into segments
    segments = []
    for i in range(len(vertices) - 1):
        if vertices[i].distance_to(vertices[i + 1]) > 0.01:
            segments.append((vertices[i], vertices[i + 1]))
            
    return segments


def run_astar_routing(
    start_pos: Point,
    end_pos: Point,
    obstacles: List[BoundingBox],
    wire_obstacles: Set[Tuple[int, int]],
    grid_size: float = 1.27,
    bounds: Optional[Tuple[int, int, int, int]] = None,
    max_iterations: int = 2000
) -> Optional[List[Tuple[int, int]]]:
    """
    Find shortest orthogonal path on 2D grid avoiding component bounding boxes and other nets' wires.
    Limits search to bounds = (min_col, max_col, min_row, max_row) if provided.
    Returns list of grid cell index tuples (col, row), or None if path not found.
    """
    start_cell = (round(start_pos.x / grid_size), round(start_pos.y / grid_size))
    end_cell = (round(end_pos.x / grid_size), round(end_pos.y / grid_size))
    
    if start_cell == end_cell:
        return [start_cell]
        
    open_set = []
    # g = 0
    heapq.heappush(open_set, (0 + abs(start_cell[0] - end_cell[0]) + abs(start_cell[1] - end_cell[1]), 0, start_cell, None, [start_cell]))
    
    visited = {} # cell -> best_g
    
    iterations = 0
    
    while open_set:
        iterations += 1
        if iterations > max_iterations:
            break
            
        f, g, curr, prev_dir, path = heapq.heappop(open_set)
        
        if curr == end_cell:
            return path
            
        if curr in visited and visited[curr] <= g:
            continue
        visited[curr] = g
        
        # Directions: Up, Down, Left, Right
        for dc, dr in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            neighbor = (curr[0] + dc, curr[1] + dr)
            
            # Avoid self-intersection in the current path
            if neighbor in path:
                continue
                
            # Limit search to schematic bounds to prevent infinite space explosion
            if bounds:
                min_c, max_c, min_r, max_r = bounds
                if not (min_c <= neighbor[0] <= max_c and min_r <= neighbor[1] <= max_r):
                    continue
                    
            # Check physical coordinate bounds collision
            n_x = neighbor[0] * grid_size
            n_y = neighbor[1] * grid_size
            n_pos = Point(n_x, n_y)
            
            is_blocked = False
            
            # 1. Component Bounding Box collision check
            if neighbor != start_cell and neighbor != end_cell:
                for bbox in obstacles:
                    if bbox.contains_point(n_pos):
                        is_blocked = True
                        break
                        
            # 2. Other Net Wire collision check
            if not is_blocked:
                if neighbor in wire_obstacles:
                    is_blocked = True
                    
            if is_blocked:
                continue
                
            # Cost calculation
            step_cost = 1.0
            # Direction change penalty (helps keep lines straight and clean)
            if prev_dir is not None and prev_dir != (dc, dr):
                step_cost += 2.0 # Slightly softer penalty to encourage search flexibility
                
            new_g = g + step_cost
            h = abs(neighbor[0] - end_cell[0]) + abs(neighbor[1] - end_cell[1])
            new_f = new_g + h
            
            heapq.heappush(open_set, (new_f, new_g, neighbor, (dc, dr), path + [neighbor]))
            
    return None


def get_segments_grid_cells(segments: List[Tuple[Point, Point]], grid_size: float = 1.27) -> Set[Tuple[int, int]]:
    """
    Get all grid cells that are occupied by the given orthogonal segments.
    """
    occupied = set()
    for start, end in segments:
        sc = (round(start.x / grid_size), round(start.y / grid_size))
        ec = (round(end.x / grid_size), round(end.y / grid_size))
        
        min_c = min(sc[0], ec[0])
        max_c = max(sc[0], ec[0])
        min_r = min(sc[1], ec[1])
        max_r = max(sc[1], ec[1])
        
        for c in range(min_c, max_c + 1):
            for r in range(min_r, max_r + 1):
                occupied.add((c, r))
    return occupied


def route_schematic_connections(schematic, captured_nets: List[Dict]):
    """
    Route electrical connections on all sheets of the schematic based on captured nets.
    Uses A* pathfinder with obstacle clearance (components) and short-circuit prevention (other nets).
    """
    logger.info("Executing A* high-reliability orthogonal routing on schematic sheets...")
    
    # 1. Load all schematics in hierarchy
    analyzer = ConnectivityAnalyzer(tolerance=0.1)
    all_schematics = analyzer._load_hierarchical_schematics(schematic)
    
    # Create component reference to schematic sheet lookup map
    comp_to_schematic = {}
    ref_to_component = {}
    for sch in all_schematics:
        for comp in sch.components:
            comp_to_schematic[comp.reference] = sch
            ref_to_component[comp.reference] = comp
            
    # Wires & Junctions to add per schematic sheet
    wires_to_add = defaultdict(list)
    pins_on_sheet = defaultdict(set) # To track component pin coordinates per sheet
    
    # Track occupied grid cells by placed wires (per sheet) to prevent short circuits
    placed_wires_cells = defaultdict(set) # sheet -> set of (col, row)
    
    # 2. Group captured net pins per schematic sheet
    # We sort nets: smaller nets (fewer pins) or power nets first, but processing sequentially is fine
    for net_info in captured_nets:
        net_name = net_info["name"]
        pins = net_info["pins"]
        
        pins_by_sheet = defaultdict(list)
        for ref, pin_num in pins:
            sch = comp_to_schematic.get(ref)
            if sch:
                pins_by_sheet[sch].append((ref, pin_num))
                
        # Route within each sheet independently
        for sch, sheet_pins in pins_by_sheet.items():
            if len(sheet_pins) < 2:
                continue
                
            # Collect current pin positions
            pins_with_positions = []
            for ref, pin_num in sheet_pins:
                pos = sch._wire_manager.get_component_pin_position(ref, pin_num)
                if pos:
                    pins_with_positions.append((pos, ref, pin_num))
                    pins_on_sheet[sch].add((pos.x, pos.y))
                    
            if len(pins_with_positions) < 2:
                continue
                
            # Build Manhattan MST edges
            points_list = [(pos, idx) for idx, (pos, _, _) in enumerate(pins_with_positions)]
            mst_edges = build_mst_edges(points_list)
            
            # Prepare Component Obstacles bounding boxes for this sheet
            # EXCEPT the components that the pins of the current NET belong to
            current_net_comps = set(ref for ref, _ in sheet_pins)
            
            obstacles = []
            for comp in sch.components:
                # Exclude components in the current Net to allow routing out of their pins
                if comp.reference in current_net_comps:
                    continue
                try:
                    bbox = get_component_bounding_box(comp).expand(1.27)
                    obstacles.append(bbox)
                except Exception:
                    # Fallback default bbox if cache fails
                    bbox = BoundingBox(
                        comp.position.x - 3.81, comp.position.y - 3.81,
                        comp.position.x + 3.81, comp.position.y + 3.81
                    )
                    obstacles.append(bbox)
            
            # Calculate schematic bounds for search space limiting
            all_comp_xs = [comp.position.x for comp in sch.components]
            all_comp_ys = [comp.position.y for comp in sch.components]
            if all_comp_xs and all_comp_ys:
                # Margin of 20 grid units (approx 25.4mm)
                min_c = round(min(all_comp_xs) / 1.27) - 20
                max_c = round(max(all_comp_xs) / 1.27) + 20
                min_r = round(min(all_comp_ys) / 1.27) - 20
                max_r = round(max(all_comp_ys) / 1.27) + 20
                bounds = (min_c, max_c, min_r, max_r)
            else:
                bounds = None

            # Current Net wires generated in this sheet (can be reused by other pins of the same Net)
            net_generated_segments = []
            
            # Generate A* routing for each MST edge
            for u, v in mst_edges:
                pos_a = pins_with_positions[u][0]
                pos_b = pins_with_positions[v][0]
                
                # Run A* routing avoiding components and other nets' wires
                # Note: placed_wires_cells[sch] contains cells of other nets
                path = run_astar_routing(
                    pos_a,
                    pos_b,
                    obstacles=obstacles,
                    wire_obstacles=placed_wires_cells[sch],
                    grid_size=1.27,
                    bounds=bounds
                )
                
                if path:
                    # Simplify grid cell path into orthogonal wire segments
                    segments = simplify_grid_path(path, grid_size=1.27)
                    net_generated_segments.extend(segments)
                else:
                    # Fallback to simple Manhattan L-routing if A* gets trapped
                    logger.warning(f"A* pathfinding failed for net '{net_name}' between "
                                   f"{pins_with_positions[u][1]} and {pins_with_positions[v][1]}. "
                                   f"Falling back to simple L-route.")
                    routing_res = create_orthogonal_routing(pos_a, pos_b, CornerDirection.AUTO)
                    net_generated_segments.extend(routing_res.segments)
                    
            # Add this net's segments to the sheet's total wires
            wires_to_add[sch].extend(net_generated_segments)
            
            # Mark cells of this net as obstacles for FUTURE nets
            net_occupied_cells = get_segments_grid_cells(net_generated_segments, grid_size=1.27)
            # Remove start/end pin coordinates of future nets from obstacles if they happen to overlap
            placed_wires_cells[sch].update(net_occupied_cells)
            
    # 3. Clear existing wires & junctions, write back new wires & calculate junctions
    for sch in all_schematics:
        # Clear collections
        sch.wires.clear()
        sch.junctions.clear()
        
        # Add generated wires
        sheet_segments = wires_to_add[sch]
        for start, end in sheet_segments:
            sch.wires.add(start=start, end=end, wire_type=WireType.WIRE)
            
        # Calculate T-junctions & multi-way junctions
        sheet_pins = pins_on_sheet[sch]
        junctions = calculate_junctions(sheet_segments, sheet_pins)
        
        # Add junctions
        for j_pt in junctions:
            sch.junctions.add(position=j_pt)
            
        # Sync changes internally
        sch._sync_wires_to_data()
        sch._sync_junctions_to_data()
        
        logger.info(f"Reconstructed sheet '{sch.file_path.name if sch.file_path else sch.name}': "
                    f"Generated {len(sheet_segments)} A* wire segments, {len(junctions)} junctions.")

    logger.info("Schematic routing reconstruction completed.")
