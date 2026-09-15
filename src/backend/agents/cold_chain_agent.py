"""
Agent 3 — Cold Chain Intelligence
Chain: temperature log → excursion detection → how long? →
       what cargo? → permitted range? → severity → where is vehicle? →
       nearest depot → who acts? → ColdChainAlert + RecoveryRecommendation
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from ..models.domain import (
    AgentType, ColdChainAlert, RecoveryRecommendation,
    RecommendationType, Severity,
)
from ..repository import Fleet360Repository

# Nearest city depots by region (used when exact position not in locations map)
_DEPOT_FALLBACK = {
    "Mumbai": "Mumbai Cold Hub",
    "Pune":   "Pune Distribution Centre",
    "Delhi":  "Delhi NCR Cold Store",
    "Surat":  "Surat Reefer Depot",
    "Jaipur": "Jaipur Cold Facility",
    "Hyderabad": "Hyderabad Temperature Hub",
    "Chennai":   "Chennai Cold Logistics Park",
    "Bengaluru": "Bengaluru Reefer Terminal",
    "Ahmedabad": "Ahmedabad Cold Store",
    "Vadodara":  "Vadodara Reefer Hub",
}


class ColdChainAgent:
    """
    Scan all temperature-controlled shipments for excursions,
    classify severity, and produce actionable alerts.
    """

    def __init__(self, repo: Fleet360Repository) -> None:
        self._repo = repo

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_all_alerts(self) -> list[ColdChainAlert]:
        alerts = []
        seen: set[str] = set()
        for shipment in self._repo.get_active_shipments():
            if not shipment.get("temperature_required"):
                continue
            alert = self.assess_shipment(shipment["shipment_id"])
            if alert and alert.shipment_id not in seen:
                alerts.append(alert)
                seen.add(alert.shipment_id)
        return sorted(alerts, key=lambda a: _sev_rank(a.severity), reverse=True)

    def assess_shipment(self, shipment_id: str) -> ColdChainAlert | None:
        shipment = self._repo.get_shipment(shipment_id)
        if not shipment or not shipment.get("temperature_required"):
            return None
        logs = self._repo.get_temperature_logs(shipment_id)
        if not logs:
            return None

        t_min = shipment["temperature_min"]
        t_max = shipment["temperature_max"]

        # Find excursion logs (outside safe range)
        excursion_logs = [
            l for l in logs
            if l["temperature_c"] < t_min or l["temperature_c"] > t_max
        ]
        if not excursion_logs:
            return None

        first_excursion = excursion_logs[0]
        latest          = logs[-1]
        current_temp    = latest["temperature_c"]

        # Duration: time from first breach to latest reading (in minutes)
        t_first  = _parse_dt(first_excursion["recorded_at"])
        t_latest = _parse_dt(latest["recorded_at"])
        duration_min = (t_latest - t_first).total_seconds() / 60

        severity = self._classify_severity(
            current_temp, t_min, t_max, duration_min, shipment["cargo_type"]
        )

        # Nearest depot based on current vehicle location
        vehicle    = self._repo.get_vehicle(shipment.get("assigned_vehicle_id", ""))
        depot      = self._nearest_depot(vehicle, shipment)
        action     = self._action_text(severity, shipment["cargo_type"], depot)
        rec        = self._build_recommendation(shipment, severity, depot, duration_min)

        return ColdChainAlert(
            alert_id=f"ALERT-CC-{shipment_id}",
            shipment_id=shipment_id,
            vehicle_id=shipment.get("assigned_vehicle_id", "UNKNOWN"),
            cargo_type=shipment["cargo_type"],
            current_temp=current_temp,
            min_safe=t_min,
            max_safe=t_max,
            excursion_since=first_excursion["recorded_at"],
            excursion_duration_min=round(duration_min, 1),
            severity=severity,
            nearest_depot=depot,
            action_required=action,
            recommendation=rec,
        )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _classify_severity(
        self,
        temp: float,
        t_min: float,
        t_max: float,
        duration_min: float,
        cargo_type: str,
    ) -> Severity:
        deviation = max(temp - t_max, t_min - temp, 0)
        is_pharma = cargo_type == "pharmaceuticals"

        # Pharmaceuticals: stricter thresholds
        if is_pharma:
            if deviation > 5 or duration_min > 60:
                return Severity.CRITICAL
            if deviation > 3 or duration_min > 30:
                return Severity.HIGH
            if deviation > 1 or duration_min > 15:
                return Severity.MEDIUM
            return Severity.LOW

        # Food and other temperature-sensitive cargo
        if deviation > 6 or duration_min > 90:
            return Severity.CRITICAL
        if deviation > 3 or duration_min > 45:
            return Severity.HIGH
        if deviation > 1 or duration_min > 20:
            return Severity.MEDIUM
        return Severity.LOW

    def _nearest_depot(self, vehicle: dict[str, Any] | None, shipment: dict[str, Any]) -> str:
        location = (vehicle or {}).get("current_location") or shipment.get("current_location", "")
        return _DEPOT_FALLBACK.get(location, f"{location} Reefer Depot")

    def _action_text(self, severity: Severity, cargo_type: str, depot: str) -> str:
        if severity == Severity.CRITICAL:
            return (
                f"IMMEDIATE ACTION — divert to {depot} for cargo inspection. "
                f"{cargo_type.title()} may be compromised. Notify recipient and quality team now."
            )
        if severity == Severity.HIGH:
            return (
                f"Inspect refrigeration unit and check cargo condition at next stop. "
                f"If excursion continues, divert to {depot}."
            )
        if severity == Severity.MEDIUM:
            return "Monitor closely. Schedule refrigeration check at next available stop."
        return "Log and continue. Alert driver to verify reefer settings."

    def _build_recommendation(
        self,
        shipment: dict[str, Any],
        severity: Severity,
        depot: str,
        duration_min: float,
    ) -> RecoveryRecommendation:
        is_critical = severity in {Severity.CRITICAL, Severity.HIGH}
        rec_type    = RecommendationType.INSPECT_CARGO if is_critical else RecommendationType.EXPEDITE
        title       = (
            f"Inspect cargo for {shipment['shipment_id']} at {depot}"
            if is_critical
            else f"Expedite {shipment['shipment_id']} and monitor temperature"
        )
        desc = (
            f"Temperature excursion of {duration_min:.0f} minutes detected on "
            f"{shipment['cargo_type']} shipment {shipment['shipment_id']}. "
            f"Severity: {severity.value}. Nearest intervention point: {depot}."
        )
        return RecoveryRecommendation(
            recommendation_id=f"REC-CC-{shipment['shipment_id']}",
            shipment_id=shipment["shipment_id"],
            event_id=f"EXCURSION-{shipment['shipment_id']}",
            agent_type=AgentType.COLD_CHAIN,
            recommendation_type=rec_type,
            priority=1 if severity == Severity.CRITICAL else 2 if severity == Severity.HIGH else 3,
            title=title,
            description=desc,
            alternative_route=None,
            suggested_vehicle_id=None,
            suggested_carrier=None,
            estimated_saving_hours=0.0,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_dt(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

def _sev_rank(s: Severity) -> int:
    return {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}[s.value]
