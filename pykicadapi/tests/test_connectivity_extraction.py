#!/usr/bin/env python3
"""
Tests for net and pin connectivity extraction.
Loads the hierarchical reference KiCad project and verifies correct connectivity behavior.
"""

from pathlib import Path
import pytest
import kicad_sch_api as ksa
from kicad_sch_api.core.connectivity import ConnectivityAnalyzer


class TestConnectivityExtraction:
    """Test suite for validating KiCad schematic connectivity extraction."""

    @pytest.fixture
    def hierarchical_schematic_path(self):
        """Returns path to the hierarchical schematic test fixture."""
        return (
            Path(__file__).parent
            / "reference_kicad_projects"
            / "connectivity"
            / "ps2_hierarchical_power"
            / "ps2_hierarchical_power.kicad_sch"
        )

    def test_hierarchical_net_extraction(self, hierarchical_schematic_path):
        """Verify that hierarchical connectivity extraction merges parent and child nets correctly."""
        assert hierarchical_schematic_path.exists(), f"Test fixture not found at {hierarchical_schematic_path}"

        # Load root schematic
        root = ksa.Schematic.load(str(hierarchical_schematic_path))
        assert root is not None

        # Run connectivity analysis
        analyzer = ConnectivityAnalyzer(tolerance=0.1)
        nets = analyzer.analyze(root, hierarchical=True)

        assert len(nets) > 0, "No nets were extracted from the schematic"

        # 1. VCC Net Test: Should contain R1.1 (parent)
        vcc_net = analyzer.get_net_for_pin("R1", "1")
        assert vcc_net is not None, "VCC Net not found for R1.1"
        assert vcc_net.name == "VCC", f"Expected net 'VCC', got '{vcc_net.name}'"

        vcc_pins = {(pin.reference, pin.pin_number) for pin in vcc_net.pins}
        assert ("R1", "1") in vcc_pins, "R1.1 must be present in VCC net"

        # Verify that pin positions in the net match the component pin's absolute position
        r1_pin1_pos = root.get_component_pin_position("R1", "1")
        assert r1_pin1_pos is not None
        vcc_pin_objs = [pin for pin in vcc_net.pins if pin.reference == "R1" and pin.pin_number == "1"]
        assert len(vcc_pin_objs) == 1
        assert abs(vcc_pin_objs[0].position.x - r1_pin1_pos.x) < 0.01
        assert abs(vcc_pin_objs[0].position.y - r1_pin1_pos.y) < 0.01

        # 2. DATA Net Test (Hierarchical): Should contain R1.2 (parent) and R2.1 (child)
        data_net = analyzer.get_net_for_pin("R1", "2")
        assert data_net is not None, "DATA Net not found for R1.2"
        
        data_pins = {(pin.reference, pin.pin_number) for pin in data_net.pins}
        assert ("R1", "2") in data_pins, "R1.2 must be in DATA net"
        assert ("R2", "1") in data_pins, "R2.1 (child) must be merged into DATA net via sheet pins"

        # 3. GND Net Test: Should contain R2.2 (child)
        gnd_net = analyzer.get_net_for_pin("R2", "2")
        assert gnd_net is not None, "GND Net not found for R2.2"
        assert gnd_net.name == "GND", f"Expected net 'GND', got '{gnd_net.name}'"

        gnd_pins = {(pin.reference, pin.pin_number) for pin in gnd_net.pins}
        assert ("R2", "2") in gnd_pins, "R2.2 must be in GND net"

    def test_connectivity_queries(self, hierarchical_schematic_path):
        """Verify that connection queries (are_connected) return correct boolean states."""
        root = ksa.Schematic.load(str(hierarchical_schematic_path))
        analyzer = ConnectivityAnalyzer(tolerance=0.1)
        analyzer.analyze(root, hierarchical=True)

        # R1.2 (parent DATA) ↔ R2.1 (child DATA) should be connected
        assert analyzer.are_connected("R1", "2", "R2", "1"), "DATA signal should connect R1.2 and R2.1"

        # R1.1 (VCC) ↔ R1.2 (DATA) should NOT be connected
        assert not analyzer.are_connected("R1", "1", "R1", "2"), "VCC and DATA should be isolated"

        # R2.1 (DATA) ↔ R2.2 (GND) should NOT be connected
        assert not analyzer.are_connected("R2", "1", "R2", "2"), "DATA and GND should be isolated"
