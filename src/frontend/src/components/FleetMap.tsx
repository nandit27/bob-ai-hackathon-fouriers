import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { Alternate, Disruption, Shipment, Vehicle } from "../types";

export const CITY_COORDS: Record<string, [number, number]> = {
  Mumbai: [19.076, 72.8777],
  Pune: [18.5204, 73.8567],
  Ahmedabad: [23.0225, 72.5714],
  Surat: [21.1702, 72.8311],
  Vadodara: [22.3072, 73.1812],
  Delhi: [28.6139, 77.209],
  Jaipur: [26.9124, 75.7873],
  Hyderabad: [17.385, 78.4867],
  Bengaluru: [12.9716, 77.5946],
  Chennai: [13.0827, 80.2707],
  Lonavala: [18.7546, 73.4062],
  Vapi: [20.3893, 72.9106],
  Hubballi: [15.3647, 75.124],
  Nellore: [14.4426, 79.9865],
  Hosur: [12.7409, 77.8253],
  Gurugram: [28.4595, 77.0266],
  Udaipur: [24.5854, 73.7125],
  Indore: [22.7196, 75.8577],
  Nagpur: [21.1458, 79.0882],
  Solapur: [17.6599, 75.9064],
  Belagavi: [15.8497, 74.4977],
  Thane: [19.2183, 72.9781],
  Nashik: [19.9975, 73.7898],
  Valsad: [20.627, 72.925],
  Silvassa: [20.2763, 73.0083],
  Bharuch: [21.7051, 72.9959],
  Dahanu: [19.9905, 72.7395],
  Navsari: [20.9462, 72.9586],
  Aurangabad: [19.8762, 75.3433],
};

export function coordsFor(city: string): [number, number] | null {
  return CITY_COORDS[city] ?? null;
}

export function speedFor(vehicleId: string): number {
  let hash = 0;
  for (let i = 0; i < vehicleId.length; i++) hash = (hash * 31 + vehicleId.charCodeAt(i)) % 997;
  return 34 + (hash % 32);
}

function disruptionIcon(severity: string) {
  return L.divIcon({
    className: "fleet-alert-marker",
    html: `<span class="fleet-alert-box" data-sev="${severity.toLowerCase()}">!</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

type Props = {
  shipments: Shipment[];
  fleet: Vehicle[];
  disruptions: Disruption[];
  visibleVehicleIds: Set<string> | null;
  selectedVehicleId?: string | null;
  selectedDisruptionId?: string | null;
  affectedShipmentIds: Set<string>;
  showLabels: boolean;
  previewAlt?: Alternate | null;
  onVehicleClick: (vehicleId: string) => void;
};

export function FleetMap({ shipments, fleet, disruptions, visibleVehicleIds, selectedVehicleId, selectedDisruptionId, affectedShipmentIds, showLabels, previewAlt, onVehicleClick }: Props) {
  const previewPoints = (previewAlt?.waypoints ?? []).map(coordsFor).filter((p): p is [number, number] => p !== null);
  return (
    <MapContainer className="fleet-map" center={[22.4, 79.0]} zoom={5} scrollWheelZoom preferCanvas>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {shipments.slice(0, 14).map((shipment) => {
        const points = shipment.route.map(coordsFor).filter((p): p is [number, number] => p !== null);
        if (points.length < 2) return null;
        const emphasized = !selectedDisruptionId || affectedShipmentIds.has(shipment.shipment_id);
        return <Polyline key={shipment.shipment_id} positions={points} pathOptions={{ color: "#000", weight: emphasized ? 3 : 1, opacity: emphasized ? 0.85 : 0.25 }} />;
      })}
      {fleet.map((vehicle, index) => {
        if (visibleVehicleIds && !visibleVehicleIds.has(vehicle.vehicle_id)) return null;
        const base = coordsFor(vehicle.current_location);
        if (!base) return null;
        const point: [number, number] = [base[0] + (index % 5) * 0.09, base[1] + (index % 7) * 0.09];
        const moving = vehicle.status === "active";
        const selected = vehicle.vehicle_id === selectedVehicleId;
        return (
          <CircleMarker
            key={vehicle.vehicle_id}
            center={point}
            radius={selected ? 11 : 8}
            pathOptions={{ color: "#000", weight: selected ? 3 : 2, fillColor: moving ? "#000" : "#fff", fillOpacity: 1 }}
            eventHandlers={{ click: () => onVehicleClick(vehicle.vehicle_id) }}
          >
            {showLabels && (
              <Tooltip permanent direction="top" offset={[0, -10]} className="fleet-tip">
                {vehicle.vehicle_id} {moving ? `${speedFor(vehicle.vehicle_id)} km/h` : "idle"}
              </Tooltip>
            )}
          </CircleMarker>
        );
      })}
      {previewPoints.length >= 2 && (
        <Polyline key={previewAlt?.alternate_id} positions={previewPoints} pathOptions={{ color: "#000", weight: 5, opacity: 1, dashArray: "10 6" }} />
      )}
      {disruptions.map((disruption) => {
        const point = coordsFor(disruption.location.replace(" Port", ""));
        if (!point) return null;
        return <Marker key={disruption.disruption_id} position={point} icon={disruptionIcon(disruption.severity)} opacity={selectedDisruptionId && selectedDisruptionId !== disruption.disruption_id ? 0.35 : 1} />;
      })}
    </MapContainer>
  );
}
