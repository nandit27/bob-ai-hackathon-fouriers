// Fleet360 API client
import type {
  ChatMessage, ColdChainAlert, Disruption, GeopoliticalEvent, GeopoliticalImpact,
  Recommendation, RedeploymentMatch, Shipment, TemperatureLog,
  Vehicle, WeatherImpact,
} from "../types";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health:              ()               => get<{ status: string }>("/health"),
  // Core data
  shipments:           ()               => get<Shipment[]>("/shipments"),
  shipment:            (id: string)     => get<Shipment>(`/shipments/${id}`),
  fleet:               ()               => get<Vehicle[]>("/fleet"),
  idleFleet:           ()               => get<Vehicle[]>("/fleet/idle"),
  disruptions:         ()               => get<Disruption[]>("/disruptions"),
  geopoliticalEvents:  ()               => get<GeopoliticalEvent[]>("/geopolitical"),
  temperatureLogs:     (id: string)     => get<TemperatureLog[]>(`/temperature/${id}`),
  // Agent 1 — Weather
  weatherAssessments:  ()               => get<unknown[]>("/agents/weather/assessments"),
  weatherImpacts:      (id: string)     => get<WeatherImpact[]>(`/agents/weather/impacts/${id}`),
  weatherForShipment:  (id: string)     => get<WeatherImpact[]>(`/agents/weather/shipment/${id}`),
  // Agent 2 — Geopolitical
  geoAssessments:      ()               => get<unknown[]>("/agents/geopolitical/assessments"),
  geoImpacts:          (id: string)     => get<GeopoliticalImpact[]>(`/agents/geopolitical/impacts/${id}`),
  geoForShipment:      (id: string)     => get<GeopoliticalImpact[]>(`/agents/geopolitical/shipment/${id}`),
  // Agent 3 — Cold Chain
  coldChainAlerts:     ()               => get<ColdChainAlert[]>("/agents/cold-chain/alerts"),
  coldChainAlert:      (id: string)     => get<ColdChainAlert | null>(`/agents/cold-chain/alerts/${id}`),
  // Redeployment
  redeployAll:         ()               => get<Record<string, RedeploymentMatch[]>>("/agents/redeployment/all"),
  redeployForShipment: (id: string)     => get<RedeploymentMatch[]>(`/agents/redeployment/${id}`),
  // Unified recommendations
  recommendations:     ()               => get<Recommendation[]>("/recommendations"),
  // Chat assistant
  chat:                (query: string)  => post<ChatMessage>("/chat", { query }),
};
