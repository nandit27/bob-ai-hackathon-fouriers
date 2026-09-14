import unittest

from src.fleet360.repository import Fleet360Repository
from src.fleet360.weather_agent import WeatherIntelligenceAgent


class WeatherIntelligenceAgentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.agent = WeatherIntelligenceAgent(Fleet360Repository())

    def test_mumbai_flood_matches_shipments_from_data(self) -> None:
        assessment = self.agent.assess_disruption("DIS-001")

        self.assertIsNotNone(assessment)
        assert assessment is not None
        shipment_ids = {item.shipment_id for item in assessment.affected_shipments}
        self.assertIn("SHP-1001", shipment_ids)
        self.assertIn("SHP-1011", shipment_ids)
        self.assertEqual(assessment.affected_location, "Mumbai")
        self.assertEqual(assessment.standardized_event.agent_type.value, "weather")
        self.assertEqual(assessment.standardized_event.shipment_ids, tuple(sorted(shipment_ids)))

    def test_pharmaceutical_shipment_has_explainable_high_impact(self) -> None:
        assessment = self.agent.assess_disruption("DIS-001")

        assert assessment is not None
        impact = next(item for item in assessment.affected_shipments if item.shipment_id == "SHP-1001")
        self.assertEqual(impact.impact_level, "CRITICAL")
        self.assertEqual(impact.cargo_sensitivity, "HIGH")
        self.assertTrue(impact.route_affected)
        self.assertIn("affected route segment", impact.reason)
        self.assertIn("cargo sensitivity", impact.reason)
        self.assertEqual(impact.estimated_delay_hours, 8.0)

    def test_assessment_is_data_driven_for_port_routes(self) -> None:
        assessment = self.agent.assess_disruption("DIS-002")

        assert assessment is not None
        shipment_ids = {item.shipment_id for item in assessment.affected_shipments}
        self.assertIn("SHP-1002", shipment_ids)
        self.assertIn("SHP-1013", shipment_ids)
        self.assertIn("SHP-1019", shipment_ids)

    def test_unknown_disruption_returns_no_assessment(self) -> None:
        self.assertIsNone(self.agent.assess_disruption("DOES-NOT-EXIST"))

    def test_service_methods_return_derived_results(self) -> None:
        affected = self.agent.find_affected_shipments("DIS-001")
        impact = self.agent.assess_shipment_impact("SHP-1001", "DIS-001")

        self.assertIn("SHP-1001", {item["shipment_id"] for item in affected})
        self.assertIsNotNone(impact)

    def test_unrelated_shipment_is_not_affected(self) -> None:
        assessment = self.agent.assess_disruption("DIS-001")

        assert assessment is not None
        shipment_ids = {item.shipment_id for item in assessment.affected_shipments}
        self.assertNotIn("SHP-1008", shipment_ids)
        self.assertIsNone(self.agent.assess_shipment_impact("SHP-1008", "DIS-001"))

    def test_impact_fields_are_valid_and_deadline_pressure_is_derived(self) -> None:
        impact = self.agent.assess_shipment_impact("SHP-1001", "DIS-001")

        assert impact is not None
        self.assertIn(impact.impact_level, {"LOW", "MEDIUM", "HIGH", "CRITICAL"})
        self.assertEqual(impact.cargo_sensitivity, "HIGH")
        self.assertEqual(impact.deadline_pressure, "CRITICAL")
        self.assertGreaterEqual(impact.estimated_delay_hours, 0)

    def test_event_contains_affected_shipments_and_evidence(self) -> None:
        assessment = self.agent.assess_disruption("DIS-001")

        assert assessment is not None
        event = assessment.standardized_event
        self.assertEqual(event.event_type.value, "weather")
        self.assertEqual(set(event.shipment_ids), {item.shipment_id for item in assessment.affected_shipments})
        self.assertTrue(event.payload["evidence"])


if __name__ == "__main__":
    unittest.main()
