import unittest
from datetime import datetime, timezone

from src.fleet360.domain import (
    AgentType,
    DisruptionType,
    DomainValidationError,
    Location,
    RiskAssessment,
    RiskLevel,
    Severity,
    StandardizedAgentEvent,
    TemperatureLog,
)


class DomainModelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.observed_at = datetime(2026, 9, 14, 12, tzinfo=timezone.utc)

    def test_temperature_log_detects_excursion(self) -> None:
        log = TemperatureLog(
            log_id="LOG-1",
            shipment_id="SHP-1",
            vehicle_id="TRK-1",
            recorded_at=self.observed_at,
            temperature_c=9.5,
            minimum_safe_c=2,
            maximum_safe_c=8,
            sensor_id="SNS-1",
        )

        self.assertTrue(log.is_excursion)

    def test_risk_score_must_be_normalized(self) -> None:
        with self.assertRaises(DomainValidationError):
            RiskAssessment(
                assessment_id="RA-1",
                shipment_id="SHP-1",
                assessed_at=self.observed_at,
                risk_level=RiskLevel.HIGH,
                risk_score=1.1,
                contributing_event_ids=("EVT-1",),
                rationale="Synthetic test assessment",
            )

    def test_standardized_event_serializes_contract_values(self) -> None:
        event = StandardizedAgentEvent(
            event_id="EVT-1",
            schema_version="1.0",
            agent_type=AgentType.WEATHER,
            event_type=DisruptionType.WEATHER,
            severity=Severity.HIGH,
            occurred_at=self.observed_at,
            received_at=self.observed_at,
            source_reference="weather-feed-1",
            confidence=0.9,
            route_ids=("RTE-1",),
            payload={"wind_kph": 80},
        )

        serialized = event.to_dict()
        self.assertEqual(serialized["agent_type"], "weather")
        self.assertEqual(serialized["route_ids"], ["RTE-1"])
        self.assertEqual(serialized["occurred_at"], "2026-09-14T12:00:00+00:00")

    def test_location_coordinates_are_bounded(self) -> None:
        with self.assertRaises(DomainValidationError):
            Location("LOC-1", "Nowhere", "US", latitude=91)


if __name__ == "__main__":
    unittest.main()