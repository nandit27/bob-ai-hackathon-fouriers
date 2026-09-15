"""
Agent 2 — Geopolitical Intelligence
Chain: geopolitical event → affected commodity → active shipments →
       expected disruption → alternative carrier / route → recommendation
"""
from __future__ import annotations

from typing import Any

from ..models.domain import (
    AgentType, GeopoliticalAssessment, GeopoliticalShipmentImpact,
    RecoveryRecommendation, RecommendationType, Severity,
)
from ..repository import Fleet360Repository

_SEVERITY_DELAY = {"LOW": 6.0, "MEDIUM": 10.0, "HIGH": 18.0, "CRITICAL": 36.0}


class GeopoliticalAgent:
    """
    Assess geopolitical events and identify which active shipments are affected
    based on commodity type and route overlap.
    """

    def __init__(self, repo: Fleet360Repository) -> None:
        self._repo = repo

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def assess_all(self) -> list[GeopoliticalAssessment]:
        return [
            a for e in self._repo.get_active_geopolitical_events()
            if (a := self.assess(e["event_id"])) is not None
        ]

    def assess(self, event_id: str) -> GeopoliticalAssessment | None:
        event = self._repo.get_geopolitical_event(event_id)
        if not event or event.get("status") != "active":
            return None

        impacts = tuple(
            self._assess_shipment(s, event)
            for s in self._repo.get_active_shipments()
            if self._shipment_affected(s, event)
        )
        return GeopoliticalAssessment(
            event_id=event_id,
            event_title=event["title"],
            event_type=event["type"],
            severity=Severity(event["severity"].upper()),
            affected_shipments=impacts,
        )

    def assess_shipment(self, shipment_id: str, event_id: str) -> GeopoliticalShipmentImpact | None:
        shipment = self._repo.get_shipment(shipment_id)
        event    = self._repo.get_geopolitical_event(event_id)
        if not shipment or not event or event.get("status") != "active":
            return None
        if not self._shipment_affected(shipment, event):
            return None
        return self._assess_shipment(shipment, event)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _shipment_affected(self, shipment: dict[str, Any], event: dict[str, Any]) -> bool:
        commodity_match = shipment["cargo_type"] in event["affected_commodities"]
        route_match = any(
            _route_in_seg(shipment["route"], seg)
            for seg in event.get("affected_routes", [])
        )
        return commodity_match or route_match

    def _assess_shipment(
        self,
        shipment: dict[str, Any],
        event: dict[str, Any],
    ) -> GeopoliticalShipmentImpact:
        sev_str  = event["severity"].upper()
        severity = Severity(sev_str)
        delay    = _SEVERITY_DELAY[sev_str]

        # Build impact level: geopolitical events are serious by default
        impact_map = {"LOW": Severity.LOW, "MEDIUM": Severity.MEDIUM, "HIGH": Severity.HIGH, "CRITICAL": Severity.CRITICAL}
        if shipment["priority"] in {"critical"} and severity in {Severity.HIGH, Severity.CRITICAL}:
            impact = Severity.CRITICAL
        elif shipment["priority"] in {"high"} and severity == Severity.CRITICAL:
            impact = Severity.CRITICAL
        else:
            impact = impact_map[sev_str]

        reasons = [
            f"Cargo type '{shipment['cargo_type']}' is listed as affected by this event.",
            f"Event type: {event['type'].replace('_', ' ').title()}.",
            f"Event severity: {sev_str}.",
        ]
        if shipment["cargo_type"] in event["affected_commodities"]:
            reasons.insert(0, f"Commodity '{shipment['cargo_type']}' directly affected by {event['title']}.")

        # Fetch recommended carriers
        carriers = self._repo.get_carriers()
        rec_carrier_names = [
            c["name"]
            for c in carriers
            if c["carrier_id"] in event.get("recommended_carrier_ids", [])
            and (shipment["origin"] in c["coverage"] or shipment["destination"] in c["coverage"])
        ]

        alt_routes = list(event.get("alternative_routes", []))

        rec = self._build_recommendation(shipment, event, impact, delay, rec_carrier_names, alt_routes)

        return GeopoliticalShipmentImpact(
            shipment_id=shipment["shipment_id"],
            event_id=event["event_id"],
            event_title=event["title"],
            affected_commodity=shipment["cargo_type"],
            impact_level=impact,
            reasons=tuple(reasons),
            estimated_delay_hours=delay,
            recommended_carriers=tuple(rec_carrier_names),
            alternative_routes=tuple(alt_routes),
            recommendation=rec,
        )

    def _build_recommendation(
        self,
        shipment: dict[str, Any],
        event: dict[str, Any],
        impact: Severity,
        delay: float,
        carrier_names: list[str],
        alt_routes: list[str],
    ) -> RecoveryRecommendation:
        carrier   = carrier_names[0] if carrier_names else None
        alt_route = alt_routes[0]    if alt_routes    else None

        if carrier:
            rec_type = RecommendationType.CHANGE_CARRIER
            title    = f"Switch carrier for {shipment['shipment_id']} to {carrier}"
            desc     = (
                f"Geopolitical event '{event['title']}' affects shipments carrying "
                f"'{shipment['cargo_type']}'. "
                f"Recommend switching to {carrier} which is pre-cleared for this corridor."
            )
        elif alt_route:
            rec_type = RecommendationType.REROUTE
            title    = f"Reroute {shipment['shipment_id']} via {alt_route}"
            desc     = (
                f"Geopolitical event '{event['title']}' causes delays on the current route. "
                f"Alternative path: {alt_route}."
            )
        else:
            rec_type = RecommendationType.HOLD_SHIPMENT
            title    = f"Hold {shipment['shipment_id']} pending geopolitical clearance"
            desc     = f"No clear alternative currently available. Monitor '{event['title']}' for updates."

        return RecoveryRecommendation(
            recommendation_id=f"REC-G-{shipment['shipment_id']}-{event['event_id']}",
            shipment_id=shipment["shipment_id"],
            event_id=event["event_id"],
            agent_type=AgentType.GEOPOLITICAL,
            recommendation_type=rec_type,
            priority=1 if impact == Severity.CRITICAL else 2,
            title=title,
            description=desc,
            alternative_route=alt_route,
            suggested_vehicle_id=None,
            suggested_carrier=carrier,
            estimated_saving_hours=delay * 0.5,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norm(v: str) -> str:
    return v.strip().lower()

def _route_in_seg(route: list[str], segment: str) -> bool:
    parts = [_norm(p) for p in segment.split("-")]
    if len(parts) != 2:
        return False
    normed = [_norm(p) for p in route]
    try:
        i = normed.index(parts[0])
        normed.index(parts[1], i + 1)
        return True
    except ValueError:
        pass
    try:
        i = normed.index(parts[1])
        normed.index(parts[0], i + 1)
        return True
    except ValueError:
        return False
