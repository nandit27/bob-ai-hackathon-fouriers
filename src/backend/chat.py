"""
Fleet360 — conversational chat endpoint.

Routes natural-language operator queries to the appropriate agent(s),
formats a structured reply, and optionally enriches it with a
watsonx.ai / Granite narration.

Intent detection is keyword-based (deterministic, no external call needed).
The router picks the narrowest useful tool for each query; unknown queries
fall back to the full situation summary.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .repository import Fleet360Repository
from .agents.weather_agent import WeatherAgent
from .agents.geopolitical_agent import GeopoliticalAgent
from .agents.cold_chain_agent import ColdChainAgent
from .agents.redeployment_engine import RedeploymentEngine
from .models.domain import RecoveryRecommendation


@dataclass
class ChatMessage:
    role: str           # "user" | "assistant"
    content: str
    cards: list[dict[str, Any]] = field(default_factory=list)  # structured cards for UI
    agent: str | None = None                                    # which agent answered


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _shp_ids(text: str) -> list[str]:
    return re.findall(r"SHP-\d+", text, re.IGNORECASE)

def _dis_ids(text: str) -> list[str]:
    return re.findall(r"DIS-\d+", text, re.IGNORECASE)

def _geo_ids(text: str) -> list[str]:
    return re.findall(r"GEO-\d+", text, re.IGNORECASE)

def _has(text: str, *keywords: str) -> bool:
    t = text.lower()
    return any(k in t for k in keywords)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

class ChatRouter:
    """
    Maps a free-text operator query to one or more agent calls and returns
    a structured ChatMessage.
    """

    def __init__(
        self,
        repo: Fleet360Repository,
        weather: WeatherAgent,
        geo: GeopoliticalAgent,
        cold: ColdChainAgent,
        redeploy: RedeploymentEngine,
    ) -> None:
        self._repo     = repo
        self._weather  = weather
        self._geo      = geo
        self._cold     = cold
        self._redeploy = redeploy

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def answer(self, query: str) -> ChatMessage:
        q = query.strip()

        # 1. Explicit IDs in the query → targeted lookup
        shp = _shp_ids(q)
        dis = _dis_ids(q)
        geo_ids = _geo_ids(q)

        if shp:
            return self._shipment_detail(shp[0], q)
        if dis:
            return self._weather_disruption(dis[0])
        if geo_ids:
            return self._geo_event(geo_ids[0])

        # 2. Intent routing by keyword
        if _has(q, "situation", "overview", "summary", "what's happening", "status"):
            return self._situation_summary()

        if _has(q, "cold", "temperature", "temp", "excursion", "freeze", "pharma"):
            return self._cold_chain_summary()

        if _has(q, "weather", "flood", "storm", "rain", "cyclone", "disruption"):
            return self._weather_summary()

        if _has(q, "geopolit", "strike", "port", "trade", "restriction", "tariff", "border"):
            return self._geo_summary()

        if _has(q, "redeploy", "idle", "vehicle", "truck", "van", "driver"):
            return self._redeploy_summary()

        if _has(q, "recommend", "action", "what should", "priority", "first", "urgent"):
            return self._recommendations_summary()

        # 3. Default — situation summary
        return self._situation_summary()

    # ------------------------------------------------------------------
    # Agent handlers
    # ------------------------------------------------------------------

    def _situation_summary(self) -> ChatMessage:
        shipments   = self._repo.get_active_shipments()
        disruptions = [d for d in self._repo.get_disruptions() if d["status"] == "active"]
        geo_events  = [e for e in self._repo.get_geopolitical_events() if e["status"] == "active"]
        cold_alerts = self._cold.get_all_alerts()
        idle        = self._repo.get_idle_vehicles()

        weather_hits: set[str] = set()
        for d in disruptions:
            a = self._weather.assess(d["disruption_id"])
            if a:
                weather_hits.update(s.shipment_id for s in a.affected_shipments)

        geo_hits: set[str] = set()
        for e in geo_events:
            a = self._geo.assess(e["event_id"])
            if a:
                geo_hits.update(s.shipment_id for s in a.affected_shipments)

        cold_hits = {al.shipment_id for al in cold_alerts}
        at_risk   = len(weather_hits | geo_hits | cold_hits)

        lines = [
            f"**Operational snapshot** — {len(shipments)} active shipments, "
            f"{len(disruptions)} weather disruption(s), {len(geo_events)} geopolitical event(s).",
            f"**{at_risk} shipment(s)** at risk. "
            f"**{len(cold_alerts)} cold-chain alert(s)** detected. "
            f"**{len(idle)} idle vehicle(s)** available for redeployment.",
        ]
        if disruptions:
            top = disruptions[0]
            lines.append(f"**Top disruption:** {top['title']} ({top['severity']})")
        if cold_alerts:
            al = cold_alerts[0]
            lines.append(
                f"**Top cold alert:** {al.shipment_id} — {al.severity.value} severity, "
                f"{al.excursion_duration_min:.0f} min excursion."
            )

        cards = [
            {"type": "metric", "label": "Active Shipments", "value": len(shipments)},
            {"type": "metric", "label": "At Risk",          "value": at_risk},
            {"type": "metric", "label": "Cold Alerts",      "value": len(cold_alerts)},
            {"type": "metric", "label": "Idle Vehicles",    "value": len(idle)},
        ]
        return ChatMessage(role="assistant", content="\n\n".join(lines), cards=cards, agent="situation")

    def _cold_chain_summary(self) -> ChatMessage:
        alerts = self._cold.get_all_alerts()
        if not alerts:
            return ChatMessage(
                role="assistant",
                content="✅ No active temperature excursions. All temperature-sensitive cargo is within safe ranges.",
                agent="cold_chain",
            )
        lines = [f"**{len(alerts)} cold-chain alert(s)** detected:\n"]
        cards = []
        for a in alerts:
            lines.append(
                f"- **{a.shipment_id}** — {a.severity.value} · {a.current_temp:.1f}°C "
                f"(safe {a.min_safe}–{a.max_safe}°C) · {a.excursion_duration_min:.0f} min excursion · {a.nearest_depot}"
            )
            cards.append({
                "type": "alert",
                "shipment_id": a.shipment_id,
                "severity": a.severity.value,
                "current_temp": a.current_temp,
                "min_safe": a.min_safe,
                "max_safe": a.max_safe,
                "depot": a.nearest_depot,
                "action": a.action_required,
            })
        return ChatMessage(role="assistant", content="\n".join(lines), cards=cards, agent="cold_chain")

    def _weather_summary(self) -> ChatMessage:
        assessments = self._weather.assess_all()
        if not assessments:
            return ChatMessage(
                role="assistant",
                content="✅ No active weather disruptions affecting the network.",
                agent="weather",
            )
        lines = [f"**{len(assessments)} weather disruption(s)** active:\n"]
        cards = []
        for a in assessments:
            count = len(a.affected_shipments)
            lines.append(f"- **{a.disruption_title}** — {count} shipment(s) affected")
            cards.append({
                "type": "disruption",
                "id": a.disruption_id,
                "title": a.disruption_title,
                "location": a.affected_location,
                "affected_count": count,
            })
        return ChatMessage(role="assistant", content="\n".join(lines), cards=cards, agent="weather")

    def _geo_summary(self) -> ChatMessage:
        assessments = self._geo.assess_all()
        if not assessments:
            return ChatMessage(
                role="assistant",
                content="✅ No active geopolitical events affecting the network.",
                agent="geopolitical",
            )
        lines = [f"**{len(assessments)} geopolitical event(s)** active:\n"]
        cards = []
        for a in assessments:
            count = len(a.affected_shipments)
            lines.append(f"- **{a.event_title}** ({a.severity.value}) — {count} shipment(s) affected")
            cards.append({
                "type": "geo",
                "id": a.event_id,
                "title": a.event_title,
                "severity": a.severity.value,
                "affected_count": count,
            })
        return ChatMessage(role="assistant", content="\n".join(lines), cards=cards, agent="geopolitical")

    def _redeploy_summary(self) -> ChatMessage:
        idle    = self._repo.get_idle_vehicles()
        matches = self._redeploy.get_all_matches()
        if not idle:
            return ChatMessage(
                role="assistant",
                content="No idle vehicles currently available for redeployment.",
                agent="redeployment",
            )
        lines = [f"**{len(idle)} idle vehicle(s)** available:\n"]
        cards = []
        for v in idle:
            ref = "  ❄" if v.get("refrigerated") else ""
            lines.append(
                f"- **{v['vehicle_id']}** — {v['vehicle_type']} · {v['current_location']} "
                f"· {v['fuel_level']}% fuel{ref}"
            )
            cards.append({
                "type": "vehicle",
                "vehicle_id": v["vehicle_id"],
                "vehicle_type": v["vehicle_type"],
                "location": v["current_location"],
                "fuel": v["fuel_level"],
                "refrigerated": v.get("refrigerated", False),
            })
        if matches:
            lines.append(f"\n**{len(matches)} at-risk shipment(s)** have redeployment match(es).")
        return ChatMessage(role="assistant", content="\n".join(lines), cards=cards, agent="redeployment")

    def _recommendations_summary(self) -> ChatMessage:
        recs: list[RecoveryRecommendation] = []

        for a in self._weather.assess_all():
            for s in a.affected_shipments:
                if s.recommendation:
                    recs.append(s.recommendation)
        for a in self._geo.assess_all():
            for s in a.affected_shipments:
                if s.recommendation:
                    recs.append(s.recommendation)
        for al in self._cold.get_all_alerts():
            recs.append(al.recommendation)

        seen: set[str] = set()
        unique: list[RecoveryRecommendation] = []
        for r in recs:
            if r.recommendation_id not in seen:
                seen.add(r.recommendation_id)
                unique.append(r)
        unique.sort(key=lambda r: r.priority)

        if not unique:
            return ChatMessage(
                role="assistant",
                content="✅ No recovery actions required at this time.",
                agent="recommendations",
            )

        lines = [f"**{len(unique)} recovery action(s)** — sorted by priority:\n"]
        cards = []
        for r in unique[:6]:
            saving = f" — saves ~{r.estimated_saving_hours:.1f} h" if r.estimated_saving_hours > 0 else ""
            lines.append(
                f"- **P{r.priority} · {r.title}** ({r.recommendation_type.value.replace('_', ' ')}){saving}"
            )
            cards.append({
                "type": "recommendation",
                "id": r.recommendation_id,
                "title": r.title,
                "priority": r.priority,
                "agent": r.agent_type.value,
                "rec_type": r.recommendation_type.value,
                "saving_hours": r.estimated_saving_hours,
            })
        return ChatMessage(role="assistant", content="\n".join(lines), cards=cards, agent="recommendations")

    def _shipment_detail(self, shipment_id: str, query: str) -> ChatMessage:
        s = self._repo.get_shipment(shipment_id)
        if not s:
            return ChatMessage(
                role="assistant",
                content=f"Shipment **{shipment_id}** not found in the dataset.",
                agent="data",
            )

        lines = [
            f"**{shipment_id}** — {s['cargo_type'].replace('_', ' ').title()} · "
            f"{s['origin']} → {s['destination']}",
            f"Priority: **{s['priority'].upper()}** · Status: {s['status']} · "
            f"Deadline: {s['deadline'][:10]}",
        ]

        alert = self._cold.assess_shipment(shipment_id)
        if alert:
            lines.append(
                f"\n🌡 **Cold-chain alert:** {alert.severity.value} — "
                f"{alert.current_temp:.1f}°C (safe {alert.min_safe}–{alert.max_safe}°C). "
                f"{alert.action_required}"
            )

        weather_hits = []
        for d in self._repo.get_active_disruptions():
            impact = self._weather.assess_shipment(shipment_id, d["disruption_id"])
            if impact:
                weather_hits.append(f"{d['title']} ({impact.impact_level.value})")
        if weather_hits:
            lines.append(f"\n⛈ **Weather impacts:** {', '.join(weather_hits)}")

        geo_hits = []
        for e in self._repo.get_active_geopolitical_events():
            impact = self._geo.assess_shipment(shipment_id, e["event_id"])
            if impact:
                geo_hits.append(f"{e['title']} ({impact.impact_level.value})")
        if geo_hits:
            lines.append(f"\n🌐 **Geopolitical impacts:** {', '.join(geo_hits)}")

        if _has(query, "redeploy", "vehicle", "idle", "find"):
            matches = self._redeploy.get_matches_for_shipment(shipment_id)
            if matches:
                best = matches[0]
                lines.append(
                    f"\n🚛 **Best redeployment:** {best.vehicle_id} · "
                    f"{best.vehicle_location} · {best.distance_km:.0f} km · "
                    f"{int(best.fit_score * 100)}% fit"
                )

        cards = [{
            "type": "shipment",
            "shipment_id": shipment_id,
            "cargo_type": s["cargo_type"],
            "priority": s["priority"],
            "origin": s["origin"],
            "destination": s["destination"],
            "status": s["status"],
        }]
        return ChatMessage(
            role="assistant",
            content="\n\n".join(lines),
            cards=cards,
            agent="data",
        )

    def _weather_disruption(self, disruption_id: str) -> ChatMessage:
        a = self._weather.assess(disruption_id)
        if not a:
            return ChatMessage(
                role="assistant",
                content=f"Disruption **{disruption_id}** not found or not active.",
                agent="weather",
            )
        count = len(a.affected_shipments)
        lines = [
            f"**{a.disruption_title}** · {a.affected_location}",
            f"{count} shipment(s) affected.",
        ]
        if a.affected_shipments:
            lines.append("\n**Impacts:**")
            for si in a.affected_shipments[:5]:
                lines.append(
                    f"- {si.shipment_id} · {si.impact_level.value} · +{si.estimated_delay_hours:.0f}h delay"
                )
        cards = [{
            "type": "disruption",
            "id": disruption_id,
            "title": a.disruption_title,
            "location": a.affected_location,
            "affected_count": count,
        }]
        return ChatMessage(role="assistant", content="\n".join(lines), cards=cards, agent="weather")

    def _geo_event(self, event_id: str) -> ChatMessage:
        a = self._geo.assess(event_id)
        if not a:
            return ChatMessage(
                role="assistant",
                content=f"Geopolitical event **{event_id}** not found or not active.",
                agent="geopolitical",
            )
        count = len(a.affected_shipments)
        lines = [
            f"**{a.event_title}** ({a.event_type}) — {a.severity.value}",
            f"{count} shipment(s) affected.",
        ]
        cards = [{
            "type": "geo",
            "id": event_id,
            "title": a.event_title,
            "severity": a.severity.value,
            "affected_count": count,
        }]
        return ChatMessage(role="assistant", content="\n".join(lines), cards=cards, agent="geopolitical")
