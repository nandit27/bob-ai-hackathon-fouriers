import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import type { Vehicle, Shipment, Disruption } from "@/types";
import {
  Layers,
  MapPin,
  Truck,
  AlertTriangle,
  Navigation,
  Shield,
  RotateCcw,
  Maximize2,
  Minimize2,
  Eye,
  Thermometer,
  Zap,
  Package,
} from "lucide-react";

// ── Indian Logistics Hubs & Coordinates [lat, lng] ───────────────────────────
export const CITY_COORDS: Record<string, [number, number]> = {
  Mumbai:    [19.076, 72.877],
  Pune:      [18.520, 73.856],
  Lonavala:  [18.750, 73.405],
  Nashik:    [19.998, 73.790],
  Delhi:     [28.704, 77.102],
  Gurugram:  [28.459, 77.026],
  Jaipur:    [26.912, 75.787],
  Jodhpur:   [26.292, 73.016],
  Udaipur:   [24.585, 73.712],
  Ahmedabad: [23.023, 72.572],
  Vadodara:  [22.307, 73.181],
  Surat:     [21.170, 72.831],
  Vapi:      [20.372, 72.906],
  Indore:    [22.720, 75.857],
  Nagpur:    [21.145, 79.082],
  Solapur:   [17.687, 75.905],
  Hyderabad: [17.385, 78.487],
  Bengaluru: [12.972, 77.594],
  Hubballi:  [15.365, 75.124],
  Belagavi:  [15.849, 74.498],
  Hosur:     [12.740, 77.825],
  Chennai:   [13.083, 80.270],
  Nellore:   [14.442, 79.987],
  // Extra regional anchors for full Indian geography context
  Kolkata:   [22.5726, 88.3639],
  Kochi:     [9.9312, 76.2673],
  Chandigarh:[30.7333, 76.7794],
  Lucknow:   [26.8467, 80.9462],
  Bhopal:    [23.2599, 77.4126],
  Guwahati:  [26.1445, 91.7362],
};

// ── Pre-configured Geofences for Major Indian Ports & Freight Clusters ────────
interface GeofenceZone {
  id: string;
  name: string;
  type: "port" | "icd" | "hub";
  center: [number, number];
  radiusMeters: number;
  description: string;
}

const GEOFENCES: GeofenceZone[] = [
  {
    id: "GF-JNPT",
    name: "JNPT Navi Mumbai Port Zone",
    type: "port",
    center: [18.949, 72.951],
    radiusMeters: 16000,
    description: "Nhava Sheva maritime terminal — India's largest container port corridor."
  },
  {
    id: "GF-BHIWANDI",
    name: "Bhiwandi Mega Warehousing Cluster",
    type: "hub",
    center: [19.296, 73.063],
    radiusMeters: 12000,
    description: "Western India supply-chain fulfillment & cold storage hub."
  },
  {
    id: "GF-DEL-ICD",
    name: "Delhi NCR Tughlakabad ICD",
    type: "icd",
    center: [28.508, 77.288],
    radiusMeters: 14000,
    description: "Northern India multi-modal rail & road container interchange."
  },
  {
    id: "GF-CHN-PORT",
    name: "Chennai-Ennore Maritime Terminal",
    type: "port",
    center: [13.115, 80.301],
    radiusMeters: 13000,
    description: "Southeastern automotive, electronic components & pharma gateway."
  },
  {
    id: "GF-BLR-HUB",
    name: "Bengaluru Logistics & Tech Park",
    type: "hub",
    center: [13.028, 77.518],
    radiusMeters: 12000,
    description: "Electronic City & Peenya high-value cargo and pharma staging zone."
  },
  {
    id: "GF-AHM-ZONE",
    name: "Sanand-Ahmedabad Freight Corridor",
    type: "hub",
    center: [22.998, 72.378],
    radiusMeters: 13000,
    description: "Key logistics node linking Gujarat industrial parks to Mumbai & Delhi."
  }
];

// ── Alternative route definitions ─────────────────────────────────────────────
const ALT_ROUTES: Record<string, string[]> = {
  "Mumbai-Pune":        ["Mumbai", "Nashik", "Pune"],
  "Mumbai-Surat":       ["Pune", "Nashik", "Surat"],
  "Mumbai-Delhi":       ["Mumbai", "Surat", "Ahmedabad", "Delhi"],
  "Mumbai-Bengaluru":   ["Mumbai", "Pune", "Hubballi", "Bengaluru"],
  "Ahmedabad-Delhi":    ["Ahmedabad", "Jodhpur", "Delhi"],
  "Ahmedabad-Mumbai":   ["Ahmedabad", "Vadodara", "Surat", "Mumbai"],
  "Hyderabad-Chennai":  ["Hyderabad", "Nellore", "Chennai"],
  "Hyderabad-Pune":     ["Hyderabad", "Solapur", "Pune"],
  "Delhi-Mumbai":       ["Delhi", "Jaipur", "Ahmedabad", "Mumbai"],
  "Bengaluru-Chennai":  ["Bengaluru", "Hosur", "Chennai"],
  "Jaipur-Delhi":       ["Jaipur", "Gurugram", "Delhi"]
};

// ── Base Map Providers ────────────────────────────────────────────────────────
type BaseMapType = "voyager" | "osm" | "satellite" | "dark";

const BASE_MAPS: Record<BaseMapType, { name: string; url: string; subdomains?: string; maxZoom: number; attribution: string }> = {
  voyager: {
    name: "Carto Voyager (Logistics)",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  osm: {
    name: "OpenStreetMap (Full Geography)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    name: "Satellite Imagery (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 18,
    attribution: 'Tiles &copy; Esri, i-cubed, USDA, USGS, AEX, GeoEye, IGN, UPR-EGP',
  },
  dark: {
    name: "Dark Operations",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  }
};

// ── Geographic bounds for Indian Subcontinent ─────────────────────────────────
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [6.5, 68.0],   // Southern tip / Arabian Sea
  [35.8, 97.5],  // Northern Kashmir/Ladakh / Arunachal Pradesh
];

const CORRIDORS = {
  all: {
    label: "🇮🇳 All India",
    bounds: INDIA_BOUNDS
  },
  western: {
    label: "Western (Mum-Ahd-Del)",
    bounds: [[18.0, 71.5], [29.5, 78.5]] as [[number, number], [number, number]]
  },
  southern: {
    label: "Southern (Blr-Chn-Hyd)",
    bounds: [[12.0, 73.5], [19.0, 81.5]] as [[number, number], [number, number]]
  }
};

interface Props {
  shipments: Shipment[];
  disruptions: Disruption[];
  idleFleet: Vehicle[];
  selectedDisruptionId?: string;
  affectedShipmentIds?: Set<string>;
  onSelectShipment?: (shipment: Shipment) => void;
  onSelectDisruption?: (disruption: Disruption) => void;
  onSelectVehicle?: (vehicle: Vehicle) => void;
}

export function OperationsMap({
  shipments,
  disruptions,
  idleFleet,
  selectedDisruptionId,
  affectedShipmentIds = new Set(),
  onSelectShipment,
  onSelectDisruption,
  onSelectVehicle,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const [baseMap, setBaseMap] = useState<BaseMapType>("voyager");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filterMode, setFilterMode] = useState<{
    showRoutes: boolean;
    showDisruptions: boolean;
    showIdle: boolean;
    showGeofences: boolean;
    showBypass: boolean;
  }>({
    showRoutes: true,
    showDisruptions: true,
    showIdle: true,
    showGeofences: true,
    showBypass: true,
  });

  // Active disruption object
  const activeDisruption = useMemo(() => {
    return disruptions.find((d) => d.disruption_id === selectedDisruptionId);
  }, [disruptions, selectedDisruptionId]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [21.5, 78.9], // Geographic center of India (Nagpur region)
        zoom: 5,
        minZoom: 4,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: true,
      });

      // Add Zoom control at top right
      L.control.zoom({ position: "topright" }).addTo(map);

      // Fit initially to India
      map.fitBounds(INDIA_BOUNDS, { padding: [20, 20] });

      mapInstanceRef.current = map;

      // Group for all dynamic layers
      const lg = L.layerGroup().addTo(map);
      layersGroupRef.current = lg;
    }

    const map = mapInstanceRef.current;

    // Set base map tile layer
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const config = BASE_MAPS[baseMap];
    const newTileLayer = L.tileLayer(config.url, {
      subdomains: config.subdomains ?? "abc",
      maxZoom: config.maxZoom,
      attribution: config.attribution,
    }).addTo(map);

    tileLayerRef.current = newTileLayer;

    // Send tile layer to back so vectors stay on top
    newTileLayer.bringToBack();

    // Trigger resize calculation
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      // Intentionally keep map across re-renders; will unmount on root destroy
    };
  }, [baseMap]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update dynamic layers whenever data or filters change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const lg = layersGroupRef.current;
    if (!map || !lg) return;

    lg.clearLayers();

    // 1. Geofences
    if (filterMode.showGeofences) {
      GEOFENCES.forEach((gf) => {
        const circle = L.circle(gf.center, {
          radius: gf.radiusMeters,
          color: gf.type === "port" ? "#0284c7" : "#6366f1",
          weight: 1.5,
          fillColor: gf.type === "port" ? "#38bdf8" : "#818cf8",
          fillOpacity: 0.12,
          dashArray: "4, 4",
        });

        circle.bindTooltip(
          `<div class="text-[11px] font-semibold text-slate-800">
            <span class="inline-block w-2 h-2 rounded-full ${gf.type === "port" ? "bg-sky-500" : "bg-indigo-500"} mr-1"></span>
            ${gf.name}
            <div class="text-[9.5px] font-normal text-slate-500 mt-0.5">${gf.description}</div>
          </div>`,
          { sticky: true, opacity: 0.95 }
        );

        circle.addTo(lg);
      });
    }

    // 2. Active Shipment Routes
    if (filterMode.showRoutes) {
      shipments.forEach((s) => {
        const coords = s.route
          .map((c) => CITY_COORDS[c])
          .filter((c): c is [number, number] => Boolean(c));

        if (coords.length < 2) return;

        const isAffected = affectedShipmentIds.has(s.shipment_id);
        const strokeColor = isAffected ? "#dc2626" : "#2563eb";
        const strokeWidth = isAffected ? 3.5 : 2.5;

        const polyline = L.polyline(coords, {
          color: strokeColor,
          weight: strokeWidth,
          opacity: isAffected ? 0.9 : 0.65,
          dashArray: isAffected ? "8, 6" : undefined,
          className: isAffected ? "route-dash-flow" : undefined,
        });

        polyline.bindTooltip(
          `<div class="font-sans text-xs">
            <div class="font-bold flex items-center gap-1.5 ${isAffected ? "text-red-600" : "text-blue-700"}">
              <span>${isAffected ? "⚠️ AFFECTED CORRIDOR" : "📦 TRANSIT ROUTE"}</span>
              <span class="text-slate-500 font-medium">(${s.shipment_id})</span>
            </div>
            <div class="text-slate-700 font-semibold mt-0.5">${s.origin} → ${s.destination}</div>
            <div class="text-[10px] text-slate-500">Carrier: ${s.carrier} | Priority: ${s.priority.toUpperCase()}</div>
          </div>`,
          { sticky: true, opacity: 0.98 }
        );

        polyline.on("click", () => {
          onSelectShipment?.(s);
        });

        polyline.addTo(lg);

        // Render AI Recommended Bypass Route if affected
        if (isAffected && filterMode.showBypass) {
          const routeKey = `${s.origin}-${s.destination}`;
          const bypassCities = ALT_ROUTES[routeKey];
          if (bypassCities) {
            const bypassCoords = bypassCities
              .map((c) => CITY_COORDS[c])
              .filter((c): c is [number, number] => Boolean(c));

            if (bypassCoords.length >= 2) {
              const bypassLine = L.polyline(bypassCoords, {
                color: "#10b981", // Emerald green
                weight: 3.5,
                opacity: 0.9,
                dashArray: "6, 6",
              });

              bypassLine.bindTooltip(
                `<div class="font-sans text-xs">
                  <div class="font-bold text-emerald-600 flex items-center gap-1">
                    <span>✨ AI RECOMMENDED BYPASS</span>
                  </div>
                  <div class="text-slate-700 font-semibold mt-0.5">${bypassCities.join(" → ")}</div>
                  <div class="text-[10px] text-emerald-700 font-medium mt-0.5">Clears flood/congestion zone with verified clearance</div>
                </div>`,
                { sticky: true, opacity: 0.98 }
              );

              bypassLine.addTo(lg);
            }
          }
        }
      });
    }

    // 3. Disruptions & Hazard Zones
    if (filterMode.showDisruptions) {
      disruptions.forEach((d) => {
        const center = CITY_COORDS[d.location];
        if (!center) return;

        const isSelected = d.disruption_id === selectedDisruptionId;
        const radius = d.severity === "CRITICAL" ? 45000 : d.severity === "HIGH" ? 35000 : 25000;

        const sevColors = {
          CRITICAL: { stroke: "#dc2626", fill: "#f87171", bg: "bg-red-500" },
          HIGH:     { stroke: "#ea580c", fill: "#fb923c", bg: "bg-orange-500" },
          MEDIUM:   { stroke: "#d97706", fill: "#fde047", bg: "bg-amber-500" },
          LOW:      { stroke: "#16a34a", fill: "#86efac", bg: "bg-emerald-500" },
        }[d.severity] ?? { stroke: "#dc2626", fill: "#f87171", bg: "bg-red-500" };

        // Outer danger circle
        const hazardCircle = L.circle(center, {
          radius: radius,
          color: sevColors.stroke,
          weight: isSelected ? 2.5 : 1.5,
          fillColor: sevColors.fill,
          fillOpacity: isSelected ? 0.25 : 0.15,
          dashArray: "4, 4",
        });

        hazardCircle.addTo(lg);

        // Pulsing radar marker icon
        const iconHtml = `
          <div class="relative flex items-center justify-center cursor-pointer group" style="width: 44px; height: 44px;">
            <div class="absolute inset-0 rounded-full ${sevColors.bg} opacity-30 hazard-pulse-ring"></div>
            <div class="relative w-7 h-7 rounded-full flex items-center justify-center text-white shadow-lg font-black text-xs border-2 border-white ${sevColors.bg}">
              ⚠️
            </div>
            <div class="absolute -bottom-5 px-1.5 py-0.5 bg-slate-900/90 text-[9px] font-bold text-white rounded shadow whitespace-nowrap">
              ${d.location}
            </div>
          </div>
        `;

        const disruptionIcon = L.divIcon({
          html: iconHtml,
          className: "",
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const marker = L.marker(center, { icon: disruptionIcon, zIndexOffset: 900 });

        marker.bindPopup(
          `<div class="p-3 max-w-xs font-sans">
            <div class="flex items-center gap-1.5">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold text-white uppercase ${sevColors.bg}">${d.severity}</span>
              <span class="text-[10px] text-slate-500 font-mono">${d.disruption_id}</span>
            </div>
            <div class="font-bold text-slate-900 text-sm mt-1">${d.title}</div>
            <p class="text-xs text-slate-600 mt-1 leading-relaxed">${d.description}</p>
            <div class="mt-2 text-[10px] text-slate-500 border-t pt-1.5">
              <div>Corridors Affected: <b class="text-slate-800">${d.affected_routes.join(", ")}</b></div>
              <div>Duration: ~${d.expected_duration_hours} hrs</div>
            </div>
            <button id="btn-disrupt-${d.disruption_id}" class="mt-2.5 w-full py-1.5 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition">
              Inspect in Disruption Center →
            </button>
          </div>`
        );

        marker.on("popupopen", () => {
          const btn = document.getElementById(`btn-disrupt-${d.disruption_id}`);
          if (btn) {
            btn.onclick = () => {
              onSelectDisruption?.(d);
              marker.closePopup();
            };
          }
        });

        marker.on("click", () => {
          onSelectDisruption?.(d);
        });

        marker.addTo(lg);
      });
    }

    // 4. Idle Fleet Assets
    if (filterMode.showIdle) {
      idleFleet.forEach((v) => {
        const pos = CITY_COORDS[v.current_location];
        if (!pos) return;

        // Add slight jitter if multiple vehicles share the city
        const offsetLat = pos[0] + (Math.random() - 0.5) * 0.08;
        const offsetLng = pos[1] + (Math.random() - 0.5) * 0.08;

        const iconHtml = `
          <div class="relative flex items-center justify-center cursor-pointer" style="width: 32px; height: 32px;">
            <div class="w-6 h-6 rounded-full bg-emerald-600 border-2 border-white shadow flex items-center justify-center text-white text-[11px]">
              🚚
            </div>
            ${v.refrigerated ? '<span class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-cyan-500 border border-white rounded-full text-[8px] flex items-center justify-center text-white font-black">❄</span>' : ''}
          </div>
        `;

        const truckIcon = L.divIcon({
          html: iconHtml,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([offsetLat, offsetLng], { icon: truckIcon, zIndexOffset: 500 });

        marker.bindPopup(
          `<div class="p-2.5 max-w-xs font-sans">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-emerald-700 flex items-center gap-1">
                <span>● IDLE ASSET</span>
                <span class="text-slate-500 font-mono">(${v.vehicle_id})</span>
              </span>
              <span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">AVAILABLE</span>
            </div>
            <div class="font-semibold text-slate-800 text-xs mt-1.5">${v.vehicle_type} ${v.refrigerated ? "❄ Cold-Chain" : ""}</div>
            <div class="text-[11px] text-slate-600 mt-1">
              <div>Depot: <b>${v.current_location}</b></div>
              <div>Driver: <b>${v.driver}</b></div>
              <div>Payload Capacity: <b>${v.capacity.toLocaleString()} kg</b></div>
              <div>Fuel Level: <b>${v.fuel_level}%</b></div>
            </div>
            <button id="btn-vehicle-${v.vehicle_id}" class="mt-2.5 w-full py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition">
              Redeploy Asset →
            </button>
          </div>`
        );

        marker.on("popupopen", () => {
          const btn = document.getElementById(`btn-vehicle-${v.vehicle_id}`);
          if (btn) {
            btn.onclick = () => {
              onSelectVehicle?.(v);
              marker.closePopup();
            };
          }
        });

        marker.addTo(lg);
      });
    }

    // 5. Active Shipments Live Markers
    shipments.forEach((s) => {
      const pos = CITY_COORDS[s.current_location];
      if (!pos) return;

      const isAffected = affectedShipmentIds.has(s.shipment_id);

      const priColor = {
        critical: "#dc2626",
        high: "#ea580c",
        medium: "#2563eb",
        low: "#64748b",
      }[s.priority] ?? "#2563eb";

      const cargoIcon = s.cargo_type === "pharmaceuticals" ? "❄️" : s.cargo_type === "electronics" ? "⚡" : "📦";

      const iconHtml = `
        <div class="relative flex flex-col items-center cursor-pointer group" style="width: 50px;">
          <div class="w-6 h-6 rounded-full bg-white border-2 shadow-md flex items-center justify-center text-[10px]" style="border-color: ${priColor};">
            <span>${cargoIcon}</span>
          </div>
          <div class="mt-0.5 px-1 bg-slate-900/90 text-white text-[8px] font-bold rounded shadow tracking-tight">
            ${s.shipment_id}
          </div>
        </div>
      `;

      const shipIcon = L.divIcon({
        html: iconHtml,
        className: "",
        iconSize: [50, 40],
        iconAnchor: [25, 12],
      });

      const marker = L.marker(pos, { icon: shipIcon, zIndexOffset: isAffected ? 800 : 700 });

      marker.bindPopup(
        `<div class="p-3 max-w-xs font-sans">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold flex items-center gap-1" style="color: ${priColor};">
              <span>● ${s.priority.toUpperCase()}</span>
              <span class="text-slate-500 font-mono">(${s.shipment_id})</span>
            </span>
            <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${isAffected ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}">
              ${isAffected ? "Delayed / Impacted" : s.status}
            </span>
          </div>
          <div class="font-semibold text-slate-800 text-xs mt-1.5">${s.origin} ➔ ${s.destination}</div>
          <div class="text-[11px] text-slate-600 mt-1 leading-normal">
            <div>Cargo: <b>${s.cargo_type}</b> (${(s.weight / 1000).toFixed(1)} tons)</div>
            <div>Current Node: <b>${s.current_location}</b></div>
            <div>Carrier: <b>${s.carrier}</b></div>
            <div>Cargo Value: <b>₹${(s.value / 100000).toFixed(1)} Lakhs</b></div>
            ${s.temperature_required ? `<div class="text-cyan-700 font-semibold mt-0.5">❄ Cold Chain: ${s.temperature_min}°C to ${s.temperature_max}°C</div>` : ""}
          </div>
          <button id="btn-ship-${s.shipment_id}" class="mt-2.5 w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition">
            View Live Telemetry →
          </button>
        </div>`
      );

      marker.on("popupopen", () => {
        const btn = document.getElementById(`btn-ship-${s.shipment_id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectShipment?.(s);
            marker.closePopup();
          };
        }
      });

      marker.on("click", () => {
        onSelectShipment?.(s);
      });

      marker.addTo(lg);
    });

    // 6. Major Indian Regional Hub Dots
    Object.entries(CITY_COORDS).forEach(([city, [lat, lng]]) => {
      const cityDot = L.circleMarker([lat, lng], {
        radius: 3.5,
        color: "#334155",
        weight: 1,
        fillColor: "#ffffff",
        fillOpacity: 0.9,
      });

      cityDot.bindTooltip(
        `<span class="font-sans font-bold text-[10px] text-slate-800">${city}</span>`,
        { permanent: false, direction: "top", offset: [0, -4] }
      );

      cityDot.addTo(lg);
    });

  }, [
    shipments,
    disruptions,
    idleFleet,
    selectedDisruptionId,
    affectedShipmentIds,
    filterMode,
    onSelectShipment,
    onSelectDisruption,
    onSelectVehicle,
  ]);

  // Focus on Selected Disruption
  useEffect(() => {
    if (!activeDisruption || !mapInstanceRef.current) return;
    const pos = CITY_COORDS[activeDisruption.location];
    if (pos) {
      mapInstanceRef.current.flyTo(pos, 8, { duration: 1.2 });
    }
  }, [activeDisruption]);

  const handleZoomCorridor = (key: "all" | "western" | "southern") => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.fitBounds(CORRIDORS[key].bounds, { padding: [30, 30], maxZoom: 8 });
  };

  const handleResetView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.fitBounds(INDIA_BOUNDS, { padding: [20, 20] });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);
  };

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-900 text-slate-100 shadow-sm transition-all ${
        isFullscreen ? "fixed inset-4 z-50 rounded-2xl shadow-2xl" : ""
      }`}
      style={{ minHeight: isFullscreen ? "calc(100vh - 32px)" : "560px" }}
    >
      {/* ── Top Floating Command Bar ── */}
      <div className="absolute top-3 left-3 right-14 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        
        {/* Geographic Corridors Quick Jump */}
        <div className="flex items-center gap-1.5 p-1 bg-white/95 backdrop-blur-md rounded-lg shadow-md border border-slate-200 pointer-events-auto text-xs">
          <span className="text-[10px] font-bold text-slate-400 px-1.5 uppercase tracking-wider flex items-center gap-1">
            <Navigation size={11} className="text-blue-600" />
            Geography:
          </span>
          {(["all", "western", "southern"] as const).map((key) => (
            <button
              key={key}
              onClick={() => handleZoomCorridor(key)}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-100 transition"
            >
              {CORRIDORS[key].label}
            </button>
          ))}
          {disruptions.length > 0 && (
            <button
              onClick={() => {
                const firstDisrupt = disruptions[0];
                const pos = CITY_COORDS[firstDisrupt.location];
                if (pos && mapInstanceRef.current) {
                  mapInstanceRef.current.flyTo(pos, 7, { duration: 1.2 });
                }
              }}
              className="px-2 py-1 rounded-md text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition flex items-center gap-1"
            >
              <AlertTriangle size={11} />
              Hotspots ({disruptions.length})
            </button>
          )}
        </div>

        {/* Base Layer Switcher */}
        <div className="flex items-center gap-1 p-1 bg-white/95 backdrop-blur-md rounded-lg shadow-md border border-slate-200 pointer-events-auto text-xs">
          <Layers size={12} className="text-slate-500 ml-1.5 mr-0.5" />
          {(Object.keys(BASE_MAPS) as BaseMapType[]).map((key) => (
            <button
              key={key}
              onClick={() => setBaseMap(key)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                baseMap === key
                  ? "bg-blue-600 text-white font-semibold shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {key === "voyager" ? "Voyager" : key === "osm" ? "OpenStreetMap" : key === "satellite" ? "Satellite" : "Dark"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Top-Right Map Actions ── */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
        <button
          onClick={handleResetView}
          title="Reset to All India"
          className="w-8 h-8 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 shadow-md flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
          className="w-8 h-8 rounded-lg bg-white/95 backdrop-blur-md border border-slate-200 shadow-md flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition"
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* ── Leaflet Container ── */}
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{ minHeight: isFullscreen ? "calc(100vh - 80px)" : "500px" }}
      />

      {/* ── Bottom Layer Filter & Status Bar ── */}
      <div className="px-4 py-2 bg-white/95 backdrop-blur-md border-t border-slate-200 text-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Layer Toggles */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Layers:</span>

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
            <input
              type="checkbox"
              checked={filterMode.showRoutes}
              onChange={(e) => setFilterMode((f) => ({ ...f, showRoutes: e.target.checked }))}
              className="rounded text-blue-600 focus:ring-0"
            />
            <span className="inline-block w-2.5 h-1 bg-blue-600 rounded"></span>
            Active Corridors ({shipments.length})
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
            <input
              type="checkbox"
              checked={filterMode.showDisruptions}
              onChange={(e) => setFilterMode((f) => ({ ...f, showDisruptions: e.target.checked }))}
              className="rounded text-red-600 focus:ring-0"
            />
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span>
            Disruption Zones ({disruptions.length})
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
            <input
              type="checkbox"
              checked={filterMode.showIdle}
              onChange={(e) => setFilterMode((f) => ({ ...f, showIdle: e.target.checked }))}
              className="rounded text-emerald-600 focus:ring-0"
            />
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
            Idle Fleet ({idleFleet.length})
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
            <input
              type="checkbox"
              checked={filterMode.showGeofences}
              onChange={(e) => setFilterMode((f) => ({ ...f, showGeofences: e.target.checked }))}
              className="rounded text-sky-600 focus:ring-0"
            />
            <span className="inline-block w-2.5 h-2.5 border border-sky-500 bg-sky-100 rounded"></span>
            Ports & Hubs ({GEOFENCES.length})
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
            <input
              type="checkbox"
              checked={filterMode.showBypass}
              onChange={(e) => setFilterMode((f) => ({ ...f, showBypass: e.target.checked }))}
              className="rounded text-emerald-600 focus:ring-0"
            />
            <span className="inline-block w-2.5 h-1 bg-emerald-500 border border-emerald-600 border-dashed rounded"></span>
            AI Recommended Bypasses
          </label>
        </div>

        {/* Legend / Status note */}
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block"></span>
            ❄ Cold-Chain Active
          </span>
          <span className="text-slate-400 italic">Click any shipment, truck or hazard zone to inspect</span>
        </div>
      </div>
    </div>
  );
}
