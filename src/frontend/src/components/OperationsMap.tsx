import type { Disruption, Shipment, Vehicle } from "../types";

export function OperationsMap({ shipments, disruptions, idleFleet, selectedDisruptionId, affectedShipmentIds }: { shipments: Shipment[]; disruptions: Disruption[]; idleFleet: Vehicle[]; selectedDisruptionId?: string; affectedShipmentIds: Set<string> }) {
  return (
    <div className="network-board">
      <div className="network-col">
        <span className="network-col-title">Lanes in scope</span>
        {shipments.slice(0, 8).map((shipment) => {
          const dimmed = selectedDisruptionId && !affectedShipmentIds.has(shipment.shipment_id);
          return (
            <div key={shipment.shipment_id} className={dimmed ? "lane-row lane-dimmed" : "lane-row"}>
              <strong>{shipment.shipment_id}</strong>
              <span>{shipment.origin} - {shipment.destination}</span>
              <span className="lane-route">{shipment.route.join(" - ")}</span>
            </div>
          );
        })}
      </div>
      <div className="network-col">
        <span className="network-col-title">Disruption signals</span>
        {disruptions.map((disruption) => (
          <div key={disruption.disruption_id} className={disruption.disruption_id === selectedDisruptionId ? "lane-row lane-selected" : "lane-row"}>
            <strong>{disruption.disruption_id}</strong>
            <span>{disruption.title}</span>
            <span className="lane-route">{disruption.affected_routes.join(" | ")}</span>
          </div>
        ))}
        <span className="network-col-title">Idle capacity</span>
        {idleFleet.map((vehicle) => (
          <div key={vehicle.vehicle_id} className="lane-row">
            <strong>{vehicle.vehicle_id}</strong>
            <span>{vehicle.current_location} - {vehicle.capacity.toLocaleString()} kg{vehicle.refrigerated ? " - refrigerated" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
