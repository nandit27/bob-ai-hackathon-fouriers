// Fleet360 frontend — shared TypeScript types

export interface Shipment {
  shipment_id: string;
  origin: string;
  destination: string;
  current_location: string;
  cargo_type: string;
  priority: "critical" | "high" | "medium" | "low";
  deadline: string;
  carrier: string;
  status: "planned" | "in_transit" | "delayed" | "delivered" | "cancelled";
  route: string[];
  weight: number;
  value: number;
  temperature_required: boolean;
  temperature_min: number | null;
  temperature_max: number | null;
  assigned_vehicle_id: string;
}

export interface Vehicle {
  vehicle_id: string;
  vehicle_type: string;
  capacity: number;
  current_location: string;
  lat: number;
  lng: number;
  status: "active" | "idle" | "maintenance";
  driver: string;
  available_from: string;
  fuel_level: number;
  refrigerated: boolean;
  current_shipment_id: string | null;
}

export interface Disruption {
  disruption_id: string;
  title: string;
  location: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  type: string;
  description: string;
  affected_routes: string[];
  expected_duration_hours: number;
  observed_at: string;
  status: string;
}

export interface GeopoliticalEvent {
  event_id: string;
  title: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  affected_commodities: string[];
  affected_routes: string[];
  description: string;
  observed_at: string;
  status: string;
  expected_resolution: string;
  recommended_carrier_ids: string[];
  alternative_routes: string[];
}

export interface TemperatureLog {
  log_id: string;
  shipment_id: string;
  vehicle_id: string;
  recorded_at: string;
  temperature_c: number;
  temperature_min: number;
  temperature_max: number;
  sensor_id: string;
}

export interface WeatherImpact {
  shipment_id: string;
  disruption_id: string;
  impact_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasons: string[];
  estimated_delay_hours: number;
  route_affected: boolean;
  cargo_sensitive: boolean;
  deadline_pressure: string;
  recommendation: Recommendation | null;
}

export interface GeopoliticalImpact {
  shipment_id: string;
  event_id: string;
  event_title: string;
  affected_commodity: string;
  impact_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasons: string[];
  estimated_delay_hours: number;
  recommended_carriers: string[];
  alternative_routes: string[];
  recommendation: Recommendation | null;
}

export interface ColdChainAlert {
  alert_id: string;
  shipment_id: string;
  vehicle_id: string;
  cargo_type: string;
  current_temp: number;
  min_safe: number;
  max_safe: number;
  excursion_since: string;
  excursion_duration_min: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  nearest_depot: string;
  action_required: string;
  recommendation: Recommendation;
}

export interface RedeploymentMatch {
  shipment_id: string;
  vehicle_id: string;
  vehicle_type: string;
  vehicle_location: string;
  distance_km: number;
  capacity_kg: number;
  refrigerated: boolean;
  driver: string;
  fit_score: number;
}

export interface Recommendation {
  recommendation_id: string;
  shipment_id: string;
  event_id: string;
  agent_type: "weather" | "geopolitical" | "cold_chain";
  recommendation_type: "reroute" | "redeploy_vehicle" | "change_carrier" | "hold_shipment" | "inspect_cargo" | "expedite";
  priority: number;
  title: string;
  description: string;
  alternative_route: string | null;
  suggested_vehicle_id: string | null;
  suggested_carrier: string | null;
  estimated_saving_hours: number;
}

// ── Chat / Assistant ──────────────────────────────────────────────────────────

export interface ChatCard {
  type: "metric" | "alert" | "disruption" | "geo" | "vehicle" | "recommendation" | "shipment";
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  cards: ChatCard[];
  agent: string | null;
}
