import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import type { Disruption, Shipment, Vehicle } from "../types";

const CITY_COORDINATES: Record<string, [number, number]> = {
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
};

const routeColors = ["#0f766e", "#2563eb", "#64748b", "#0e7490", "#475569"];

function coordinatesFor(city: string): [number, number] | null {
  return CITY_COORDINATES[city] ?? null;
}

export function OperationsMap({ shipments, disruptions, idleFleet, selectedDisruptionId, affectedShipmentIds }: { shipments: Shipment[]; disruptions: Disruption[]; idleFleet: Vehicle[]; selectedDisruptionId?: string; affectedShipmentIds: Set<string> }) {
  return (
    <MapContainer className="operations-map" center={[21.5, 77.5]} zoom={5} scrollWheelZoom={false} zoomControl={false}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {shipments.slice(0, 12).map((shipment, index) => {
        const route = shipment.route.map(coordinatesFor).filter((point): point is [number, number] => point !== null);
        if (route.length < 2) return null;
        const emphasized = !selectedDisruptionId || affectedShipmentIds.has(shipment.shipment_id);
        return (
          <Polyline key={shipment.shipment_id} positions={route} pathOptions={{ color: emphasized ? routeColors[index % routeColors.length] : "#b7c5ca", weight: emphasized ? 3 : 1, opacity: emphasized ? 0.72 : 0.24 }}>
            <Popup>{shipment.shipment_id}: {shipment.origin} to {shipment.destination}</Popup>
          </Polyline>
        );
      })}
      {disruptions.map((disruption) => {
        const point = coordinatesFor(disruption.location.replace(" Port", ""));
        if (!point) return null;
        const selected = disruption.disruption_id === selectedDisruptionId;
        return <CircleMarker key={disruption.disruption_id} center={point} radius={selected ? 13 : 10} pathOptions={{ color: selected ? "#991b1b" : "#dc2626", fillColor: selected ? "#ef4444" : "#f97316", fillOpacity: 0.84, weight: selected ? 3 : 2 }}><Popup><strong>{disruption.title}</strong><br />{disruption.location} · {disruption.severity}</Popup></CircleMarker>;
      })}
      {idleFleet.map((vehicle) => {
        const point = coordinatesFor(vehicle.current_location);
        if (!point) return null;
        return <CircleMarker key={vehicle.vehicle_id} center={[point[0] + 0.08, point[1] + 0.08]} radius={6} pathOptions={{ color: "#0369a1", fillColor: "#38bdf8", fillOpacity: 0.95 }}><Popup>{vehicle.vehicle_id} · idle{vehicle.refrigerated ? " · refrigerated" : ""}</Popup></CircleMarker>;
      })}
    </MapContainer>
  );
}
