#!/usr/bin/env python3
"""
solver.py

Implements grid snapping and collision/overlap resolution solver.
Snaps continuous coordinate outputs to a 1.27mm (50mil) grid and
places components without overlaps using a spiral search on the grid.
"""

from typing import List, Tuple


class LayoutSolver:
    """
    Grid Snapping and Overlap Resolution Solver.
    Snaps predicted symbol coordinates to the KiCad 1.27mm (50mil) grid
    and resolves bounding box overlaps using a spiral grid search.
    """

    @staticmethod
    def snap_to_grid(x: float, y: float, grid_size: float = 1.27) -> Tuple[float, float]:
        """Snap coordinate to the nearest grid point."""
        aligned_x = round(x / grid_size) * grid_size
        aligned_y = round(y / grid_size) * grid_size
        return (aligned_x, aligned_y)

    @staticmethod
    def check_overlap(
        pos1: Tuple[float, float],
        size1: Tuple[float, float],
        pos2: Tuple[float, float],
        size2: Tuple[float, float],
        margin: float = 1.27
    ) -> bool:
        """
        Check if two bounding boxes overlap, given their centers and (width, height) sizes,
        plus an optional spacing margin.
        """
        x1, y1 = pos1
        w1, h1 = size1
        x2, y2 = pos2
        w2, h2 = size2

        # Bounding box collision check
        overlap_x = abs(x1 - x2) < ((w1 + w2) / 2.0 + margin)
        overlap_y = abs(y1 - y2) < ((h1 + h2) / 2.0 + margin)
        return overlap_x and overlap_y

    @classmethod
    def resolve_overlaps(
        cls,
        initial_positions: List[Tuple[float, float]],
        bbox_sizes: List[Tuple[float, float]],
        grid_size: float = 1.27,
        margin: float = 1.27
    ) -> List[Tuple[float, float]]:
        """
        Resolves bounding box overlaps on a 1.27mm grid using spiral search.
        
        Args:
            initial_positions: List of initial continuous (x, y) coordinates.
            bbox_sizes: List of bounding box sizes (width, height) for each component.
            grid_size: Target grid size in mm (default: 1.27mm).
            margin: Extra spacing margin around components (default: 1.27mm).
            
        Returns:
            List of snapped and overlap-resolved (x, y) coordinates.
        """
        n = len(initial_positions)
        if n == 0:
            return []

        # Step 1: Snap all initial positions to the grid
        snapped_positions = [cls.snap_to_grid(x, y, grid_size) for x, y in initial_positions]

        # Step 2: Sort components to decide placement order
        # We place larger components first, as they are harder to fit later.
        # We keep track of original indices to reconstruct the output list.
        # Sort key: area (width * height) descending
        indices_sorted = sorted(
            range(n),
            key=lambda i: bbox_sizes[i][0] * bbox_sizes[i][1],
            reverse=True
        )

        resolved_positions = [None] * n
        occupied_rects = []  # List of (pos, size) for placed components

        # Step 3: Place each component sequentially
        for idx in indices_sorted:
            init_pos = snapped_positions[idx]
            size = bbox_sizes[idx]

            # Try to place at initial snapped position first
            candidate = init_pos
            if not cls._has_conflict(candidate, size, occupied_rects, margin):
                resolved_positions[idx] = candidate
                occupied_rects.append((candidate, size))
                continue

            # If there is a conflict, search outward in a spiral on the grid
            placed = False
            # Spiral search loop
            # r represents the grid ring distance from initial snapped position
            # We check rings 1, 2, 3, ... until we find an empty slot.
            r = 1
            max_rings = 100  # Safety limit to avoid infinite loops
            while r < max_rings and not placed:
                # Generate grid offsets in a ring of radius r
                # Offsets lie on the square boundary of radius r (in grid units)
                for dx_grid in range(-r, r + 1):
                    for dy_grid in [-r, r]:
                        offset_x = dx_grid * grid_size
                        offset_y = dy_grid * grid_size
                        candidate = (init_pos[0] + offset_x, init_pos[1] + offset_y)
                        if not cls._has_conflict(candidate, size, occupied_rects, margin):
                            resolved_positions[idx] = candidate
                            occupied_rects.append((candidate, size))
                            placed = True
                            break
                    if placed:
                        break

                if not placed:
                    for dy_grid in range(-r + 1, r):
                        for dx_grid in [-r, r]:
                            offset_x = dx_grid * grid_size
                            offset_y = dy_grid * grid_size
                            candidate = (init_pos[0] + offset_x, init_pos[1] + offset_y)
                            if not cls._has_conflict(candidate, size, occupied_rects, margin):
                                resolved_positions[idx] = candidate
                                occupied_rects.append((candidate, size))
                                placed = True
                                break
                        if placed:
                            break
                r += 1

            # Fallback if spiral search failed to find a spot (should not happen within 100 rings)
            if not placed:
                resolved_positions[idx] = init_pos
                occupied_rects.append((init_pos, size))

        return resolved_positions

    @classmethod
    def _has_conflict(
        cls,
        pos: Tuple[float, float],
        size: Tuple[float, float],
        occupied_rects: List[Tuple[Tuple[float, float], Tuple[float, float]]],
        margin: float
    ) -> bool:
        """Check if candidate position conflicts with any already placed components."""
        for occ_pos, occ_size in occupied_rects:
            if cls.check_overlap(pos, size, occ_pos, occ_size, margin):
                return True
        return False
