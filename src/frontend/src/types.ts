export type Shipment = {
  shipment_id: string;
  origin: string;
  destination: string;
  current_location: string;
  cargo_type: string;
  priority: string;
  deadline: string;
  carrier: string;
  status: string;
  route: string[];
  weight: number;
  value: number;
  temperature_required: boolean;
  temperature_min: number | null;
  temperature_max: number | null;
  assigned_vehicle_id: string;
};

export type Vehicle = {
  vehicle_id: string;
  vehicle_type: string;
  capacity: number;
  current_location: string;
  status: string;
  driver: string;
  available_from: string;
  fuel_level: number;
  refrigerated: boolean;
  current_shipment_id: string | null;
};

export type Disruption = {
  disruption_id: string;
  title: string;
  location: string;
  severity: string;
  type: string;
  description: string;
  affected_routes: string[];
  expected_duration_hours: number;
  observed_at: string;
  source: string;
  status: string;
};

export type TemperatureLog = {
  log_id: string;
  shipment_id: string;
  vehicle_id: string;
  recorded_at: string;
  temperature_c: number;
  temperature_min: number;
  temperature_max: number;
  sensor_id: string;
};

export type WeatherImpact = {
  shipment_id: string;
  disruption_id: string;
  impact_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
  reasons: string[];
  estimated_delay_hours: number;
  route_affected: boolean;
  cargo_sensitivity: string;
  deadline_pressure: string;
};

export type WeatherEvent = {
  event_id: string;
  schema_version: string;
  agent_type: string;
  event_type: string;
  severity: string;
  occurred_at: string;
  received_at: string;
  source_reference: string;
  confidence: number;
  location_ids: string[];
  shipment_ids: string[];
  vehicle_ids: string[];
  route_ids: string[];
  payload: Record<string, unknown>;
};

export type DetailSelection =
  | { kind: "shipment"; item: Shipment }
  | { kind: "disruption"; item: Disruption }
  | null;

export type Recommendation = {
  recommendation_id: string;
  shipment_id: string;
  disruption_id: string | null;
  recommendation_type: string;
  priority: number;
  title: string;
  description: string;
  suggested_vehicle_id: string | null;
  estimated_delay_hours: number;
  status: string;
};

export type ActionRecord = {
  action_id: string;
  action_type: string;
  shipment_id: string;
  vehicle_id: string | null;
  recommendation_id: string | null;
  note: string | null;
  created_at: string;
  status: string;
};

export type AlertRecord = {
  alert_id: string;
  severity: string;
  title: string;
  detail: string;
  shipment_id: string | null;
  disruption_id: string | null;
  acknowledged: boolean;
};

export type PageKey = "livemap" | "dashboard" | "vehicles" | "drivers" | "jobs" | "routes" | "geofences" | "alerts" | "reports" | "settings";

export type Alternate = {
  alternate_id: string;
  name: string;
  waypoints: string[];
  distance_km: number;
  time_h: number;
  fuel_l: number;
  extra_km: number;
  extra_time_h: number;
  extra_fuel_l: number;
  extra_cost_rs: number;
  avoids_disruption: boolean;
  delay_avoided_h: number;
};

export type Alternatives = {
  shipment_id: string;
  primary: { waypoints: string[]; distance_km: number; time_h: number; fuel_l: number };
  disruption_id: string | null;
  alternatives: Alternate[];
};

export type PreviewAlt = { shipment_id: string; alt: Alternate } | null;
