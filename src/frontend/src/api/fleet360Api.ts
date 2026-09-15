import type { ActionRecord, AlertRecord, Alternatives, Disruption, Recommendation, Shipment, TemperatureLog, Vehicle, WeatherEvent, WeatherImpact } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Fleet 360 backend returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const fleet360Api = {
  getHealth: () => request<{ status: string }>("/api/health"),
  getShipments: () => request<Shipment[]>("/api/shipments"),
  getShipment: (shipmentId: string) => request<Shipment>(`/api/shipments/${shipmentId}`),
  getFleet: () => request<Vehicle[]>("/api/fleet"),
  getIdleFleet: () => request<Vehicle[]>("/api/fleet/idle"),
  getDisruptions: () => request<Disruption[]>("/api/disruptions"),
  getDisruption: (disruptionId: string) => request<Disruption>(`/api/disruptions/${disruptionId}`),
  getTemperature: (shipmentId: string) => request<TemperatureLog[]>(`/api/temperature/${shipmentId}`),
  getWeatherImpacts: (disruptionId: string) => request<WeatherImpact[]>(`/api/weather/impacts/${disruptionId}`),
  getWeatherShipments: (shipmentId: string) => request<WeatherImpact[]>(`/api/weather/shipments/${shipmentId}`),
  getWeatherEvent: (disruptionId: string) => request<WeatherEvent>(`/api/weather/events/${disruptionId}`),
  getRecommendations: () => request<Recommendation[]>("/api/recommendations"),
  getActions: () => request<ActionRecord[]>("/api/actions"),
  createAction: (body: { action_type: string; shipment_id: string; vehicle_id?: string | null; recommendation_id?: string | null; note?: string | null }) =>
    request<ActionRecord>("/api/actions", { method: "POST", body: JSON.stringify(body) }),
  getAlternates: (shipmentId: string) => request<Alternatives>(`/api/routes/alternatives/${shipmentId}`),
  getAlerts: () => request<AlertRecord[]>("/api/alerts"),
  ackAlert: (alert_id: string) => request<AlertRecord>("/api/alerts/ack", { method: "POST", body: JSON.stringify({ alert_id }) }),
  askAssistant: (question: string) => request<{ answer: string; cited_ids: string[] }>("/api/assistant/ask", { method: "POST", body: JSON.stringify({ question }) }),
};
