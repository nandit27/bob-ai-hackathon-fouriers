#!/usr/bin/env node
/**
 * Fleet360 MCP Server
 *
 * Exposes Fleet360's AI agents as tools consumable by IBM Bob.
 * Operators can ask Bob questions like:
 *   "Which shipments are affected by the Mumbai flooding?"
 *   "Show me cold-chain alerts right now"
 *   "What should we do first? Give me the top recommendations"
 *   "Find an idle vehicle that can take SHP-1001"
 *
 * The server calls the Fleet360 FastAPI backend (default: http://127.0.0.1:8000)
 * and returns structured, human-readable results to Bob.
 *
 * IBM Bob integration is load-bearing: every tool directly queries a live agent
 * endpoint and returns actionable intelligence — not just raw data.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = process.env.FLEET360_API_URL ?? "http://127.0.0.1:8000/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Fleet360 API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

function fmt(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "fleet360",
  version: "1.0.0",
});

// ── Tool 1: Get all active disruptions ──────────────────────────────────────
server.tool(
  "fleet360_get_disruptions",
  "List all active weather and operational disruptions in the Fleet360 network. Returns disruption title, location, severity, affected routes, and expected duration.",
  {},
  async () => {
    try {
      const disruptions = await fetchJSON<unknown[]>("/disruptions");
      const active = (disruptions as Array<Record<string, unknown>>).filter(d => d.status === "active");
      const summary = active.map(d => ({
        id:             d.disruption_id,
        title:          d.title,
        location:       d.location,
        severity:       d.severity,
        type:           d.type,
        affected_routes: d.affected_routes,
        duration_hours: d.expected_duration_hours,
        description:    d.description,
      }));
      return {
        content: [{
          type: "text" as const,
          text: active.length === 0
            ? "No active disruptions in the Fleet360 network."
            : `${active.length} active disruption(s):\n\n${fmt(summary)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 2: Get weather agent impact for a disruption ────────────────────────
server.tool(
  "fleet360_weather_impact",
  "Get the Fleet360 weather agent's assessment for a specific disruption: which shipments are affected, impact level, estimated delay, and recovery recommendations.",
  {
    disruption_id: z.string().describe("Disruption ID, e.g. DIS-001"),
  },
  async ({ disruption_id }) => {
    try {
      const assessment = await fetchJSON<Record<string, unknown>>(`/agents/weather/assessments/${disruption_id}`);
      return {
        content: [{
          type: "text" as const,
          text: `Weather assessment for ${disruption_id}:\n\n${fmt(assessment)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 3: Get all weather assessments ─────────────────────────────────────
server.tool(
  "fleet360_all_weather_assessments",
  "Get the Fleet360 weather agent's full assessment across all active disruptions — shows every affected shipment, impact level, and recommendation.",
  {},
  async () => {
    try {
      const assessments = await fetchJSON<unknown[]>("/agents/weather/assessments");
      const totalAffected = (assessments as Array<Record<string, unknown>>)
        .reduce((sum, a) => sum + ((a.affected_shipments as unknown[])?.length ?? 0), 0);
      return {
        content: [{
          type: "text" as const,
          text: `Weather agent — ${assessments.length} disruption(s) assessed, ${totalAffected} shipments affected:\n\n${fmt(assessments)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 4: Get geopolitical events and impacts ──────────────────────────────
server.tool(
  "fleet360_geopolitical_assessments",
  "Get Fleet360 geopolitical agent assessments: active trade restrictions, port strikes, and border delays — and which shipments are affected with carrier/route alternatives.",
  {},
  async () => {
    try {
      const assessments = await fetchJSON<unknown[]>("/agents/geopolitical/assessments");
      return {
        content: [{
          type: "text" as const,
          text: `Geopolitical agent — ${assessments.length} event(s):\n\n${fmt(assessments)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 5: Get cold-chain alerts ────────────────────────────────────────────
server.tool(
  "fleet360_cold_chain_alerts",
  "Get all active cold-chain temperature excursion alerts from Fleet360. Shows which shipments have exceeded safe temperature ranges, severity, excursion duration, nearest depot, and action required.",
  {},
  async () => {
    try {
      const alerts = await fetchJSON<unknown[]>("/agents/cold-chain/alerts");
      return {
        content: [{
          type: "text" as const,
          text: alerts.length === 0
            ? "No active cold-chain temperature excursions detected."
            : `${alerts.length} cold-chain alert(s):\n\n${fmt(alerts)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 6: Get cold-chain alert for a specific shipment ─────────────────────
server.tool(
  "fleet360_cold_chain_shipment",
  "Check the cold-chain temperature status for a specific shipment. Returns current temperature, safe range, excursion duration, severity classification, and recommended action.",
  {
    shipment_id: z.string().describe("Shipment ID, e.g. SHP-1001"),
  },
  async ({ shipment_id }) => {
    try {
      const alert = await fetchJSON<unknown>(`/agents/cold-chain/alerts/${shipment_id}`);
      return {
        content: [{
          type: "text" as const,
          text: alert === null
            ? `No temperature excursion detected for ${shipment_id}. Cargo is within safe range.`
            : `Cold-chain alert for ${shipment_id}:\n\n${fmt(alert)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 7: Get all unified recommendations ──────────────────────────────────
server.tool(
  "fleet360_recommendations",
  "Get all prioritized recovery recommendations from all Fleet360 agents (weather, geopolitical, cold-chain). Returns ranked action items with alternative routes, suggested vehicles or carriers, and estimated time savings.",
  {},
  async () => {
    try {
      const recs = await fetchJSON<unknown[]>("/recommendations");
      return {
        content: [{
          type: "text" as const,
          text: recs.length === 0
            ? "No recovery actions required at this time."
            : `${recs.length} recovery recommendation(s), sorted by priority:\n\n${fmt(recs)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 8: Get fleet redeployment matches for a shipment ────────────────────
server.tool(
  "fleet360_find_idle_vehicle",
  "Find the best available idle vehicles that can be redeployed to a specific disrupted shipment. Considers proximity, capacity, and refrigeration requirements. Returns ranked matches with fit scores.",
  {
    shipment_id: z.string().describe("Shipment ID to find a redeployment vehicle for, e.g. SHP-1001"),
  },
  async ({ shipment_id }) => {
    try {
      const matches = await fetchJSON<unknown[]>(`/agents/redeployment/${shipment_id}`);
      return {
        content: [{
          type: "text" as const,
          text: matches.length === 0
            ? `No suitable idle vehicles found for ${shipment_id}.`
            : `Redeployment options for ${shipment_id} (ranked by fit score):\n\n${fmt(matches)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 9: Get shipment details ─────────────────────────────────────────────
server.tool(
  "fleet360_shipment_status",
  "Get detailed status for a specific shipment including cargo type, priority, current location, route, deadline, carrier, and any active weather or geopolitical impacts.",
  {
    shipment_id: z.string().describe("Shipment ID, e.g. SHP-1001"),
  },
  async ({ shipment_id }) => {
    try {
      const [shipment, weatherImpacts, geoImpacts] = await Promise.all([
        fetchJSON<Record<string, unknown>>(`/shipments/${shipment_id}`),
        fetchJSON<unknown[]>(`/agents/weather/shipment/${shipment_id}`),
        fetchJSON<unknown[]>(`/agents/geopolitical/shipment/${shipment_id}`),
      ]);
      return {
        content: [{
          type: "text" as const,
          text: `Shipment ${shipment_id}:\n${fmt(shipment)}\n\nWeather impacts (${(weatherImpacts as unknown[]).length}):\n${fmt(weatherImpacts)}\n\nGeopolitical impacts (${(geoImpacts as unknown[]).length}):\n${fmt(geoImpacts)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 10: Get idle fleet ──────────────────────────────────────────────────
server.tool(
  "fleet360_idle_fleet",
  "List all currently idle vehicles in the Fleet360 fleet with their location, capacity, refrigeration capability, driver, and fuel level.",
  {},
  async () => {
    try {
      const fleet = await fetchJSON<unknown[]>("/fleet/idle");
      return {
        content: [{
          type: "text" as const,
          text: fleet.length === 0
            ? "No idle vehicles currently available."
            : `${fleet.length} idle vehicle(s) available for redeployment:\n\n${fmt(fleet)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ── Tool 11: Situational summary ─────────────────────────────────────────────
server.tool(
  "fleet360_situation_summary",
  "Get a full operational situation summary from Fleet360: total shipments, active disruptions, at-risk shipments, cold-chain alerts, idle fleet count, and top priority recommendations. Use this as the first tool when an operator asks for an overview.",
  {},
  async () => {
    try {
      const [shipments, disruptions, geoEvents, coldAlerts, recs, idleFleet] = await Promise.all([
        fetchJSON<unknown[]>("/shipments"),
        fetchJSON<unknown[]>("/disruptions"),
        fetchJSON<unknown[]>("/geopolitical"),
        fetchJSON<unknown[]>("/agents/cold-chain/alerts"),
        fetchJSON<unknown[]>("/recommendations"),
        fetchJSON<unknown[]>("/fleet/idle"),
      ]);

      const activeDisruptions = (disruptions as Array<Record<string, unknown>>).filter(d => d.status === "active");
      const topRecs = (recs as Array<Record<string, unknown>>).slice(0, 3);

      const summary = {
        active_shipments:    (shipments as unknown[]).length,
        active_disruptions:  activeDisruptions.length,
        active_geo_events:   (geoEvents as Array<Record<string, unknown>>).filter(e => e.status === "active").length,
        cold_chain_alerts:   (coldAlerts as unknown[]).length,
        idle_vehicles:       (idleFleet as unknown[]).length,
        total_recommendations: (recs as unknown[]).length,
        top_3_actions:       topRecs.map(r => ({ priority: r.priority, title: r.title, agent: r.agent_type })),
        disruptions_summary: activeDisruptions.map(d => ({
          id: d.disruption_id, title: d.title, severity: d.severity, location: d.location,
        })),
      };

      return {
        content: [{
          type: "text" as const,
          text: `Fleet360 Operational Situation Summary:\n\n${fmt(summary)}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fleet360 MCP server running on stdio — connected to IBM Bob");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
