import unittest

from fastapi.testclient import TestClient

from src.fleet360.api import app


class Fleet360ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_health(self) -> None:
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "status": "ok",
            "synthetic_data": True,
            "service": "fleet360-backend",
        })

    def test_retrieves_shipments(self) -> None:
        response = self.client.get("/api/shipments")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 20)
        self.assertEqual(payload[0]["shipment_id"], "SHP-1001")
        self.assertEqual(payload[0]["origin"], "Mumbai")

    def test_retrieves_one_shipment(self) -> None:
        response = self.client.get("/api/shipments/SHP-1001")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["cargo_type"], "pharmaceuticals")
        self.assertTrue(response.json()["temperature_required"])

    def test_retrieves_fleet_and_idle_fleet(self) -> None:
        fleet_response = self.client.get("/api/fleet")
        idle_response = self.client.get("/api/fleet/idle")

        self.assertEqual(fleet_response.status_code, 200)
        self.assertEqual(len(fleet_response.json()), 13)
        self.assertEqual(idle_response.status_code, 200)
        idle_vehicles = idle_response.json()
        self.assertEqual(len(idle_vehicles), 2)
        self.assertTrue(any(vehicle["refrigerated"] for vehicle in idle_vehicles))
        self.assertTrue(all(vehicle["status"] == "idle" for vehicle in idle_vehicles))

    def test_retrieves_disruptions(self) -> None:
        response = self.client.get("/api/disruptions")

        self.assertEqual(response.status_code, 200)
        disruptions = response.json()
        self.assertEqual(len(disruptions), 4)
        self.assertEqual(disruptions[0]["location"], "Mumbai")
        self.assertEqual(disruptions[0]["severity"], "HIGH")

    def test_retrieves_temperature_logs(self) -> None:
        response = self.client.get("/api/temperature/SHP-1001")

        self.assertEqual(response.status_code, 200)
        logs = response.json()
        self.assertEqual([log["temperature_c"] for log in logs], [6.0, 7.0, 8.5, 9.5, 10.0])
        self.assertEqual(logs[0]["recorded_at"], "2026-09-15T08:00:00Z")
        self.assertEqual(logs[-1]["recorded_at"], "2026-09-15T10:00:00Z")

    def test_invalid_shipment_id(self) -> None:
        response = self.client.get("/api/shipments/DOES-NOT-EXIST")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"]["resource_type"], "shipment")

    def test_invalid_vehicle_id(self) -> None:
        response = self.client.get("/api/fleet/DOES-NOT-EXIST")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"]["resource_type"], "vehicle")

    def test_weather_assessment_returns_affected_shipments(self) -> None:
        response = self.client.get("/api/weather/assessments/DIS-001")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["affected_location"], "Mumbai")
        shipment_ids = {item["shipment_id"] for item in payload["affected_shipments"]}
        self.assertIn("SHP-1001", shipment_ids)
        self.assertEqual(payload["standardized_event"]["agent_type"], "weather")
        self.assertEqual(payload["standardized_event"]["event_type"], "weather")

    def test_weather_assessment_unknown_disruption_is_not_found(self) -> None:
        response = self.client.get("/api/weather/assessments/DOES-NOT-EXIST")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"]["resource_type"], "disruption")

    def test_weather_impacts_endpoint_returns_structured_impacts(self) -> None:
        response = self.client.get("/api/weather/impacts/DIS-001")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload)
        self.assertIn("SHP-1001", {item["shipment_id"] for item in payload})
        self.assertTrue(all(item["impact_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"} for item in payload))

    def test_weather_shipment_endpoint_returns_impacts(self) -> None:
        response = self.client.get("/api/weather/shipments/SHP-1001")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(any(item["disruption_id"] == "DIS-001" for item in payload))
        self.assertTrue(all(item["shipment_id"] == "SHP-1001" for item in payload))

    def test_weather_event_endpoint_returns_standardized_event(self) -> None:
        response = self.client.get("/api/weather/events/DIS-001")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["agent_type"], "weather")
        self.assertIn("SHP-1001", payload["shipment_ids"])
        self.assertIn("evidence", payload["payload"])

    def test_weather_impact_invalid_ids_return_404(self) -> None:
        invalid_disruption = self.client.get("/api/weather/impacts/DOES-NOT-EXIST")
        invalid_shipment = self.client.get("/api/weather/shipments/DOES-NOT-EXIST")

        self.assertEqual(invalid_disruption.status_code, 404)
        self.assertEqual(invalid_shipment.status_code, 404)


if __name__ == "__main__":
    unittest.main()
