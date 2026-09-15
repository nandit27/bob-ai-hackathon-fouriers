"""Hardcoded POC logic for demo flow with JSON file persistence.

Everything here is deterministic and synthetic. Recommendations are derived
from weather impacts, cold-chain excursions, and idle fleet. Operator actions
and alert acknowledgements are appended to src/data/poc_state.json.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATE_PATH = Path(__file__).parents[1] / "data" / "poc_state.json"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"actions": [], "acked_alerts": []}
    try:
        with STATE_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        return {"actions": data.get("actions", []), "acked_alerts": data.get("acked_alerts", [])}
    except (json.JSONDecodeError, OSError):
        return {"actions": [], "acked_alerts": []}


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with STATE_PATH.open("w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2)


def build_recommendations(
    impacts: list[dict[str, Any]],
    shipments: list[dict[str, Any]],
    idle_vehicles: list[dict[str, Any]],
    excursion_shipment_ids: list[str],
) -> list[dict[str, Any]]:
    """Hardcoded recommendation builder. Flow-ready, not ML."""
    by_shipment = {s["shipment_id"]: s for s in shipments}
    recs: list[dict[str, Any]] = []
    seq = 1

    refrigerated_idle = [v for v in idle_vehicles if v.get("refrigerated")]
    dry_idle = [v for v in idle_vehicles if not v.get("refrigerated")]

    for impact in sorted(impacts, key=lambda i: ({"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}.get(i.get("impact_level", ""), 0)), reverse=True):
        shipment = by_shipment.get(impact["shipment_id"])
        if shipment is None:
            continue
        needs_cold = bool(shipment.get("temperature_required"))
        pool = refrigerated_idle if needs_cold else (dry_idle + refrigerated_idle)
        vehicle = pool[0] if pool else None
        recs.append({
            "recommendation_id": f"REC-{seq:03d}",
            "shipment_id": impact["shipment_id"],
            "disruption_id": impact["disruption_id"],
            "recommendation_type": "reroute" if impact.get("route_affected") else "redeploy_vehicle",
            "priority": 1 if impact.get("impact_level") == "CRITICAL" else 2,
            "title": f"Reroute {impact['shipment_id']} around {impact['disruption_id']}",
            "description": (
                f"{impact['shipment_id']} ({shipment['origin']} to {shipment['destination']}) "
                f"is {impact['impact_level']} impacted. {impact.get('reason', '')} "
                f"Suggested: hold at {shipment['current_location']}, reroute via alternate corridor, "
                f"expected delay {impact.get('estimated_delay_hours', 0)}h."
            ),
            "suggested_vehicle_id": vehicle["vehicle_id"] if vehicle else None,
            "estimated_delay_hours": float(impact.get("estimated_delay_hours", 0)),
            "status": "pending",
        })
        seq += 1
        if vehicle and impact.get("impact_level") in ("CRITICAL", "HIGH"):
            recs.append({
                "recommendation_id": f"REC-{seq:03d}",
                "shipment_id": impact["shipment_id"],
                "disruption_id": impact["disruption_id"],
                "recommendation_type": "redeploy_vehicle",
                "priority": 1,
                "title": f"Stage {vehicle['vehicle_id']} as backup for {impact['shipment_id']}",
                "description": (
                    f"{vehicle['vehicle_id']} ({vehicle['vehicle_type']}, "
                    f"{vehicle['capacity']} kg, at {vehicle['current_location']}) is idle"
                    + (" with refrigeration" if vehicle.get("refrigerated") else "")
                    + f" and can cover {impact['shipment_id']} if the primary vehicle is held."
                ),
                "suggested_vehicle_id": vehicle["vehicle_id"],
                "estimated_delay_hours": 0.0,
                "status": "pending",
            })
            seq += 1

    for shipment_id in excursion_shipment_ids:
        shipment = by_shipment.get(shipment_id)
        if shipment is None:
            continue
        recs.append({
            "recommendation_id": f"REC-{seq:03d}",
            "shipment_id": shipment_id,
            "disruption_id": None,
            "recommendation_type": "inspect_cargo",
            "priority": 1,
            "title": f"Inspect cold-chain cargo on {shipment_id}",
            "description": (
                f"{shipment_id} shows a temperature excursion outside "
                f"{shipment.get('temperature_min')} to {shipment.get('temperature_max')} C. "
                "Inspect cargo at next stop, check reefer unit, log excursion for QA."
            ),
            "suggested_vehicle_id": shipment.get("assigned_vehicle_id"),
            "estimated_delay_hours": 1.0,
            "status": "pending",
        })
        seq += 1

    return recs[:12]


def build_alerts(
    disruptions: list[dict[str, Any]],
    impacts: list[dict[str, Any]],
    excursion_shipment_ids: list[str],
    acked: list[str],
) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    for d in disruptions:
        if d.get("status") != "active":
            continue
        aid = f"ALERT-{d['disruption_id']}"
        alerts.append({
            "alert_id": aid,
            "severity": d.get("severity", "MEDIUM"),
            "title": d.get("title", ""),
            "detail": d.get("description", ""),
            "shipment_id": None,
            "disruption_id": d.get("disruption_id"),
            "acknowledged": aid in acked,
        })
    for impact in impacts:
        if impact.get("impact_level") in ("CRITICAL", "HIGH"):
            aid = f"ALERT-{impact['disruption_id']}-{impact['shipment_id']}"
            alerts.append({
                "alert_id": aid,
                "severity": impact.get("impact_level", "HIGH"),
                "title": f"{impact['shipment_id']} impacted by {impact['disruption_id']}",
                "detail": impact.get("reason", ""),
                "shipment_id": impact["shipment_id"],
                "disruption_id": impact["disruption_id"],
                "acknowledged": aid in acked,
            })
    for sid in excursion_shipment_ids:
        aid = f"ALERT-COLD-{sid}"
        alerts.append({
            "alert_id": aid,
            "severity": "CRITICAL",
            "title": f"Temperature excursion on {sid}",
            "detail": "Latest reading outside safe range. Inspect reefer and cargo.",
            "shipment_id": sid,
            "disruption_id": None,
            "acknowledged": aid in acked,
        })
    rank = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    alerts.sort(key=lambda a: rank.get(str(a.get("severity", "")).upper(), 0), reverse=True)
    return alerts


CITY_COORDS: dict[str, tuple[float, float]] = {
    "Mumbai": (19.076, 72.8777), "Pune": (18.5204, 73.8567),
    "Ahmedabad": (23.0225, 72.5714), "Surat": (21.1702, 72.8311),
    "Vadodara": (22.3072, 73.1812), "Delhi": (28.6139, 77.209),
    "Jaipur": (26.9124, 75.7873), "Hyderabad": (17.385, 78.4867),
    "Bengaluru": (12.9716, 77.5946), "Chennai": (13.0827, 80.2707),
    "Lonavala": (18.7546, 73.4062), "Vapi": (20.3893, 72.9106),
    "Hubballi": (15.3647, 75.124), "Nellore": (14.4426, 79.9865),
    "Hosur": (12.7409, 77.8253), "Gurugram": (28.4595, 77.0266),
    "Udaipur": (24.5854, 73.7125), "Indore": (22.7196, 75.8577),
    "Nagpur": (21.1458, 79.0882), "Solapur": (17.6599, 75.9064),
    "Belagavi": (15.8497, 74.4977), "Thane": (19.2183, 72.9781),
    "Nashik": (19.9975, 73.7898), "Valsad": (20.627, 72.925),
    "Silvassa": (20.2763, 73.0083), "Bharuch": (21.7051, 72.9959),
    "Dahanu": (19.9905, 72.7395), "Navsari": (20.9462, 72.9586),
    "Aurangabad": (19.8762, 75.3433),
}

AVG_SPEED_KMH = 42.0
FUEL_L_PER_KM = 0.30
DIESEL_RS_PER_L = 92.0
_BYPASS_RANGE_KM = 350.0


def _haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    from math import asin, cos, radians, sin, sqrt
    lat1, lon1, lat2, lon2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


def route_stats(waypoints: list[str]) -> dict[str, Any]:
    km = 0.0
    for start, end in zip(waypoints, waypoints[1:]):
        a, b = CITY_COORDS.get(start), CITY_COORDS.get(end)
        if a and b:
            km += _haversine(a, b)
    km = round(km, 1)
    time_h = round(km / AVG_SPEED_KMH, 1)
    fuel_l = round(km * FUEL_L_PER_KM, 1)
    return {"waypoints": waypoints, "distance_km": km, "time_h": time_h, "fuel_l": fuel_l}


def _aliases(location: str) -> set[str]:
    normalized = location.strip().lower()
    names = {normalized}
    for suffix in (" port", " airport", " region"):
        if normalized.endswith(suffix):
            names.add(normalized.removesuffix(suffix))
    return names


def _segments(affected_routes: list[str]) -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for raw in affected_routes:
        parts = [p.strip().lower() for p in raw.split("-")]
        if len(parts) == 2 and all(parts):
            out.add((parts[0], parts[1]))
            out.add((parts[1], parts[0]))
    return out


def _waypoints_avoid(waypoints: list[str], disruption: dict[str, Any]) -> bool:
    """True when a corridor skips the disrupted area. Origin and destination
    themselves are excluded since a truck must still start and end there."""
    names = _aliases(disruption.get("location", ""))
    segments = _segments(disruption.get("affected_routes", []))
    for city in waypoints[1:-1]:
        if city.strip().lower() in names:
            return False
    legs = [(a.strip().lower(), b.strip().lower()) for a, b in zip(waypoints, waypoints[1:])]
    return not any(leg in segments for leg in legs)


def _bypass_for(anchor: str, route: list[str], disruption: dict[str, Any] | None, taken: set[str]) -> str | None:
    anchor_coord = CITY_COORDS.get(anchor)
    if anchor_coord is None:
        return None
    route_set = {c.strip().lower() for c in route}
    ranked = sorted(
        ((city, _haversine(anchor_coord, coord)) for city, coord in CITY_COORDS.items()
         if city.strip().lower() not in route_set and city not in taken),
        key=lambda item: item[1],
    )
    nearby = [(city, dist) for city, dist in ranked if dist <= _BYPASS_RANGE_KM] or ranked
    if disruption is not None:
        for city, _ in nearby:
            if _waypoints_avoid([anchor, city], disruption):
                return city
    return nearby[0][0] if nearby else None


def build_alternatives(
    shipment: dict[str, Any],
    impacts: list[dict[str, Any]],
    disruptions: list[dict[str, Any]],
) -> dict[str, Any]:
    """Two deterministic detour options with km, time, and fuel diffs."""
    route: list[str] = list(shipment.get("route", []))
    primary = route_stats(route)
    rank = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    ordered = sorted(impacts, key=lambda i: rank.get(str(i.get("impact_level", "")).upper(), 0), reverse=True)
    top = ordered[0] if ordered else None
    disruption = next((d for d in disruptions if top and d.get("disruption_id") == top.get("disruption_id")), None)
    delay = float(top.get("estimated_delay_hours", 0)) if top else 0.0

    taken: set[str] = set()
    bypass_a = _bypass_for(route[0], route, disruption, taken) if len(route) >= 2 else None
    if bypass_a:
        taken.add(bypass_a)
    bypass_b = _bypass_for(route[-1], route, disruption, taken) if len(route) >= 2 else None

    alternatives: list[dict[str, Any]] = []
    for tag, name, points in (
        ("A", f"Via {bypass_a} bypass" if bypass_a else "Bypass", [route[0], bypass_a, *route[1:]] if bypass_a else []),
        ("B", f"Via {bypass_b} corridor" if bypass_b else "Corridor", [*route[:-1], bypass_b, route[-1]] if bypass_b else []),
    ):
        if not points:
            continue
        stats = route_stats(points)
        extra_km = round(stats["distance_km"] - primary["distance_km"], 1)
        extra_time = round(stats["time_h"] - primary["time_h"], 1)
        extra_fuel = round(stats["fuel_l"] - primary["fuel_l"], 1)
        avoids = bool(disruption and _waypoints_avoid(points, disruption))
        alternatives.append({
            "alternate_id": f"ALT-{shipment.get('shipment_id')}-{tag}",
            "name": name,
            "waypoints": stats["waypoints"],
            "distance_km": stats["distance_km"],
            "time_h": stats["time_h"],
            "fuel_l": stats["fuel_l"],
            "extra_km": extra_km,
            "extra_time_h": extra_time,
            "extra_fuel_l": extra_fuel,
            "extra_cost_rs": round(max(extra_fuel, 0.0) * DIESEL_RS_PER_L),
            "avoids_disruption": avoids,
            "delay_avoided_h": delay if avoids else 0.0,
        })
    return {
        "shipment_id": shipment.get("shipment_id"),
        "primary": primary,
        "disruption_id": top.get("disruption_id") if top else None,
        "alternatives": alternatives,
    }


def answer_question(question: str, context: dict[str, Any]) -> dict[str, Any]:
    """Rule-based hardcoded assistant. Matches keywords, cites real IDs."""
    q = question.lower()
    shipments = context.get("shipments", [])
    impacts = context.get("impacts", [])
    idle = context.get("idle", [])
    excursions = context.get("excursions", [])

    if "critical" in q:
        crit = [i for i in impacts if i.get("impact_level") == "CRITICAL"]
        ids = ", ".join(i["shipment_id"] for i in crit) if crit else "none at CRITICAL right now"
        return {"answer": f"Most critical: {ids}. SHP-1001 (pharma, Mumbai to Pune) is top because Mumbai flooding overlaps its route and its cold chain is excursed.", "cited_ids": [i["shipment_id"] for i in crit][:5]}
    if "mumbai" in q or "dis-001" in q:
        affected = [i["shipment_id"] for i in impacts if i.get("disruption_id") == "DIS-001"]
        ids = ", ".join(affected) if affected else "none"
        return {"answer": f"DIS-001 Mumbai flooding affects: {ids}. Worst is SHP-1001 with 8.0h estimated delay.", "cited_ids": affected[:6]}
    if "first" in q or "should we do" in q or "what should" in q:
        return {"answer": "Do this first: 1) Hold SHP-1001 at Mumbai and inspect reefer. 2) Reroute SHP-1011 via alternate corridor. 3) Stage idle VH-012 as backup for pharma loads.", "cited_ids": ["SHP-1001", "SHP-1011", "VH-012"]}
    if "idle" in q or "redeploy" in q or "vehicle" in q:
        vids = ", ".join(v["vehicle_id"] for v in idle) if idle else "none idle"
        return {"answer": f"Idle now: {vids}. Best redeploy: VH-012 (refrigerated, 9000 kg, Pune) for cold-chain backup; VH-013 (11000 kg, Jaipur) for dry freight.", "cited_ids": [v["vehicle_id"] for v in idle]}
    if "cold" in q or "temperature" in q:
        ids = ", ".join(excursions) if excursions else "none excursed"
        return {"answer": f"Cold-chain excursions: {ids}. SHP-1001 reads 10.0 C against 2 to 8 C limit. Inspect cargo and log QA hold.", "cited_ids": excursions}
    if "disruption" in q:
        return {"answer": "4 active disruptions: DIS-001 Mumbai flooding (HIGH), DIS-002 port restriction (HIGH), DIS-003 Ahmedabad closure (MEDIUM), DIS-004 Hyderabad traffic (LOW).", "cited_ids": ["DIS-001", "DIS-002", "DIS-003", "DIS-004"]}
    top = [s["shipment_id"] for s in shipments[:3]]
    return {"answer": f"Fleet360 POC tracks {len(shipments)} shipments, {len(impacts)} weather impacts, {len(idle)} idle vehicles. Ask about critical shipments, Mumbai disruption, cold chain, or redeploy options.", "cited_ids": top}
