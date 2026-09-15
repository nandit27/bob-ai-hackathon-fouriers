import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, BarChart3, Bell, Bot, Box, Check, ClipboardList, CloudRain, Hexagon, Layers, LayoutDashboard, LocateFixed, MapPin, PackageCheck, RefreshCw, Route as RouteIcon, Search, Settings as SettingsIcon, Snowflake, Tags, Truck, Users } from "lucide-react";
import { fleet360Api } from "./api/fleet360Api";
import { FleetMap, speedFor } from "./components/FleetMap";
import { Pager, pageCount, paginate } from "./components/Pager";
import { MetricCard } from "./components/MetricCard";
import { SectionHeader } from "./components/SectionHeader";
import type { ActionRecord, AlertRecord, Alternatives, DetailSelection, Disruption, PageKey, PreviewAlt, Recommendation, Shipment, TemperatureLog, Vehicle, WeatherImpact } from "./types";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const formatValue = (value: number) => value >= 10000000 ? `Rs ${(value / 10000000).toFixed(1)} Cr` : `Rs ${(value / 100000).toFixed(1)} L`;
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const impactRank = (value: string) => ({ LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[value.toUpperCase()] ?? 0);
const ICON = { size: 16, strokeWidth: 1.5 } as const;
const SIDE_ICON = { size: 17, strokeWidth: 1.5 } as const;

function Badge({ children, solid }: { children: React.ReactNode; solid?: boolean }) {
  return <span className={solid ? "badge badge-solid" : "badge"}>{children}</span>;
}

const NAV: { key: PageKey; label: string; icon: typeof MapPin }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "livemap", label: "Live Map", icon: MapPin },
  { key: "vehicles", label: "Vehicles", icon: Truck },
  { key: "drivers", label: "Drivers", icon: Users },
  { key: "jobs", label: "Jobs", icon: ClipboardList },
  { key: "routes", label: "Routes", icon: RouteIcon },
  { key: "geofences", label: "Geofences", icon: Hexagon },
  { key: "alerts", label: "Alerts", icon: Bell },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

function destinationFor(vehicle: Vehicle, shipments: Shipment[]): string {
  const job = shipments.find((s) => s.shipment_id === vehicle.current_shipment_id);
  if (job) return job.destination;
  const assigned = shipments.find((s) => s.assigned_vehicle_id === vehicle.vehicle_id);
  if (assigned) return assigned.destination;
  return `Standby at ${vehicle.current_location}`;
}

function App() {
  const [page, setPage] = useState<PageKey>("livemap");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [idleFleet, setIdleFleet] = useState<Vehicle[]>([]);
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [temperatures, setTemperatures] = useState<Record<string, TemperatureLog[]>>({});
  const [weatherImpacts, setWeatherImpacts] = useState<Record<string, WeatherImpact[]>>({});
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [selection, setSelection] = useState<DetailSelection>(null);
  const [alts, setAlts] = useState<Alternatives | null>(null);
  const [altsLoading, setAltsLoading] = useState(false);
  const [previewAlt, setPreviewAlt] = useState<PreviewAlt>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [sortMode, setSortMode] = useState<"status" | "speed" | "location">("status");
  const [statusFilter, setStatusFilter] = useState<"all" | "moving" | "idle">("all");
  const [showLabels, setShowLabels] = useState(true);
  const [grayTiles, setGrayTiles] = useState(false);
  const [pages, setPages] = useState<Record<string, number>>({});
  const getPage = (key: string) => pages["pg-" + key] ?? 0;
  const setPageNum = (key: string, p: number) => setPages((prev) => ({ ...prev, ["pg-" + key]: p }));
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const updatedAt = useMemo(() => new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()), [loading]);

  const refreshWrites = async () => {
    const [recs, acts, als] = await Promise.all([fleet360Api.getRecommendations(), fleet360Api.getActions(), fleet360Api.getAlerts()]);
    setRecommendations(recs);
    setActions(acts);
    setAlerts(als);
  };

  useEffect(() => {
    let active = true;
    Promise.all([fleet360Api.getHealth(), fleet360Api.getShipments(), fleet360Api.getFleet(), fleet360Api.getIdleFleet(), fleet360Api.getDisruptions()])
      .then(async ([, shipmentData, fleetData, idleData, disruptionData]) => {
        const coldEntries = await Promise.all(shipmentData.filter((s) => s.temperature_required).map(async (s) => [s.shipment_id, await fleet360Api.getTemperature(s.shipment_id)] as const));
        const weatherEntries = await Promise.all(disruptionData.map(async (d) => [d.disruption_id, await fleet360Api.getWeatherImpacts(d.disruption_id)] as const));
        if (!active) return;
        setShipments(shipmentData);
        setFleet(fleetData);
        setIdleFleet(idleData);
        setDisruptions(disruptionData);
        setTemperatures(Object.fromEntries(coldEntries));
        setWeatherImpacts(Object.fromEntries(weatherEntries));
        await refreshWrites();
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { setPageNum("panel", 0); }, [vehicleQuery, statusFilter]);

  useEffect(() => {
    if (selection?.kind !== "shipment") { setAlts(null); return; }
    const id = selection.item.shipment_id;
    setAltsLoading(true);
    fleet360Api.getAlternates(id).then(setAlts).catch(() => setAlts(null)).finally(() => setAltsLoading(false));
  }, [selection]);

  const weatherImpactByShipment = useMemo(() => Object.values(weatherImpacts).flat().reduce<Record<string, WeatherImpact>>((result, impact) => {
    if (!result[impact.shipment_id] || impactRank(impact.impact_level) > impactRank(result[impact.shipment_id].impact_level)) result[impact.shipment_id] = impact;
    return result;
  }, {}), [weatherImpacts]);

  const excursionIds = useMemo(() => Object.entries(temperatures).filter(([, logs]) => {
    const latest = logs.at(-1);
    return latest && (latest.temperature_c < latest.temperature_min || latest.temperature_c > latest.temperature_max);
  }).map(([id]) => id), [temperatures]);

  const atRiskIds = useMemo(() => new Set(Object.keys(weatherImpactByShipment).concat(excursionIds).concat(shipments.filter((s) => s.status === "delayed").map((s) => s.shipment_id))), [shipments, weatherImpactByShipment, excursionIds]);
  const criticalCount = useMemo(() => new Set(Object.values(weatherImpactByShipment).filter((i) => i.impact_level === "CRITICAL").map((i) => i.shipment_id).concat(excursionIds)).size, [weatherImpactByShipment, excursionIds]);
  const openAlerts = alerts.filter((a) => !a.acknowledged).length;
  const jobsShown = paginate(shipments, getPage("jobs"), 8);
  const fleetShown = paginate(fleet, getPage("fleet"), 8);
  const driversShown = paginate(fleet, getPage("drivers"), 8);
  const routesShown = paginate(shipments, getPage("routes"), 8);
  const coldShown = paginate(Object.entries(temperatures), getPage("cold"), 6);
  const alertsShown = paginate(alerts, getPage("alerts"), 6);
  const dashRecs = paginate(recommendations, getPage("dashrecs"), 4);
  const allRecs = paginate(recommendations, getPage("allrecs"), 4);
  const actionsShown = paginate(actions, getPage("actions"), 6);
  const movingCount = fleet.filter((v) => v.status === "active").length;
  const idleCount = fleet.filter((v) => v.status === "idle").length;
  const offlineCount = fleet.filter((v) => v.status !== "active" && v.status !== "idle").length;
  const selectedDisruptionId = selection?.kind === "disruption" ? selection.item.disruption_id : undefined;
  const selectedAffectedIds = selectedDisruptionId ? new Set((weatherImpacts[selectedDisruptionId] ?? []).map((i) => i.shipment_id)) : new Set<string>();

  const filteredVehicles = useMemo(() => {
    const q = vehicleQuery.trim().toLowerCase();
    let list = fleet.filter((v) => {
      if (statusFilter === "moving" && v.status !== "active") return false;
      if (statusFilter === "idle" && v.status !== "idle") return false;
      if (!q) return true;
      return v.vehicle_id.toLowerCase().includes(q) || v.driver.toLowerCase().includes(q) || v.current_location.toLowerCase().includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sortMode === "speed") return speedFor(b.vehicle_id) - speedFor(a.vehicle_id);
      if (sortMode === "location") return a.current_location.localeCompare(b.current_location);
      return (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1);
    });
    return list;
  }, [fleet, vehicleQuery, sortMode, statusFilter]);

  const visibleVehicleIds = useMemo(() => new Set(filteredVehicles.map((v) => v.vehicle_id)), [filteredVehicles]);
  const panelShown = paginate(filteredVehicles, getPage("panel"), 6);
  const selectedVehicle = fleet.find((v) => v.vehicle_id === selectedVehicleId) ?? null;
  const selectedVehicleShipment = selectedVehicle ? shipments.find((s) => s.shipment_id === selectedVehicle.current_shipment_id) ?? shipments.find((s) => s.assigned_vehicle_id === selectedVehicle.vehicle_id) ?? null : null;

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || asking) return;
    setAsking(true);
    try {
      const res = await fleet360Api.askAssistant(text);
      setAnswer(res.cited_ids.length > 0 ? `${res.answer} [${res.cited_ids.join(", ")}]` : res.answer);
    } catch {
      setAnswer("Assistant is offline. Start the backend and retry.");
    } finally {
      setAsking(false);
    }
  };

  const logAction = async (action_type: string, shipment_id: string, vehicle_id: string | null, recommendation_id?: string | null, note?: string) => {
    const created = await fleet360Api.createAction({ action_type, shipment_id, vehicle_id, recommendation_id, note: note ?? "Logged from demo console" });
    setActions((prev) => [...prev, created]);
  };

  const ack = async (alert_id: string) => {
    const updated = await fleet360Api.ackAlert(alert_id);
    setAlerts((prev) => prev.map((a) => (a.alert_id === updated.alert_id ? updated : a)));
  };

  if (loading) return <div className="app-loading"><div className="loading-mark">F</div><p>Connecting to Fleet 360 backend...</p></div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-brand"><div className="brand-mark">F360</div><div><strong>Fleet 360</strong><span>Operations console</span></div></div>
        <nav aria-label="Primary">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button key={item.key} className={active ? "side-item side-active" : "side-item"} onClick={() => setPage(item.key)}>
                <Icon {...SIDE_ICON} />
                <span>{item.label}</span>
                {item.key === "alerts" && openAlerts > 0 && <span className="side-badge">{openAlerts}</span>}
              </button>
            );
          })}
        </nav>
        <div className="side-user"><div className="side-avatar">OP</div><div><strong>Ops desk</strong><span>Dispatcher</span></div></div>
      </aside>

      <div className="shell-main">
        {page === "livemap" && (
          <div className="livemap">
            <div className={grayTiles ? "map-wrap map-gray" : "map-wrap"}>
              <div className="map-topbar">
                <label className="map-search"><Search size={15} strokeWidth={1.5} /><input value={vehicleQuery} onChange={(e) => setVehicleQuery(e.target.value)} placeholder="Search vehicles or drivers..." aria-label="Search vehicles or drivers" /></label>
                <button className="btn btn-small" onClick={() => setStatusFilter((f) => (f === "all" ? "moving" : f === "moving" ? "idle" : "all"))}>Filters: {statusFilter}</button>
                <div className="map-tools">
                  <button className="btn btn-small" aria-label="Reset selection" onClick={() => { setSelectedVehicleId(null); setStatusFilter("all"); setVehicleQuery(""); }}><LocateFixed {...ICON} /></button>
                  <button className="btn btn-small" aria-label="Toggle labels" onClick={() => setShowLabels((v) => !v)}><Tags {...ICON} /></button>
                  <button className="btn btn-small" aria-label="Toggle grayscale" onClick={() => setGrayTiles((v) => !v)}><Layers {...ICON} /></button>
                  <button className="btn btn-small" aria-label="Refresh data" onClick={() => refreshWrites()}><RefreshCw {...ICON} /></button>
                </div>
                <span className="badge">Updated {updatedAt}</span>
              </div>
              <FleetMap shipments={shipments} fleet={fleet} disruptions={disruptions} visibleVehicleIds={visibleVehicleIds} selectedVehicleId={selectedVehicleId} selectedDisruptionId={selectedDisruptionId} affectedShipmentIds={selectedAffectedIds} showLabels={showLabels} previewAlt={previewAlt?.alt ?? null} onVehicleClick={(id) => setSelectedVehicleId(id)} />
              {previewAlt && (
                <div className="preview-card">
                  <strong>{previewAlt.alt.name} - {previewAlt.shipment_id}</strong>
                  <span>{previewAlt.alt.waypoints.join(" - ")}</span>
                  <div className="impact-facts">
                    <div><dt>Extra km</dt><dd>+{previewAlt.alt.extra_km}</dd></div>
                    <div><dt>Extra time</dt><dd>+{previewAlt.alt.extra_time_h}h</dd></div>
                    <div><dt>Extra fuel</dt><dd>+{previewAlt.alt.extra_fuel_l} L</dd></div>
                    <div><dt>Extra cost</dt><dd>Rs {previewAlt.alt.extra_cost_rs}</dd></div>
                  </div>
                  <span>Delay avoided: {previewAlt.alt.delay_avoided_h}h{previewAlt.alt.avoids_disruption && alts?.disruption_id ? ` on ${alts.disruption_id}` : ""}. Total {previewAlt.alt.distance_km} km in {previewAlt.alt.time_h}h.</span>
                  <div className="rec-actions">
                    <button className="btn btn-small btn-primary" onClick={() => { const s = shipments.find((x) => x.shipment_id === previewAlt.shipment_id); logAction("reroute", previewAlt.shipment_id, s?.assigned_vehicle_id ?? null, undefined, `Reroute via ${previewAlt.alt.name} (${previewAlt.alt.alternate_id})`); setPreviewAlt(null); }}>Log this reroute</button>
                    <button className="btn btn-small" onClick={() => setPreviewAlt(null)}>Clear</button>
                  </div>
                </div>
              )}
              <div className="map-legend">
                <div className="legend-head"><span>Legend</span><span>{fleet.length} vehicles</span></div>
                <div className="legend-row"><i className="legend-dot dot-moving" /> Moving <b>{movingCount}</b></div>
                <div className="legend-row"><i className="legend-dot dot-idle" /> Idle <b>{idleCount}</b></div>
                <div className="legend-row"><i className="legend-dot dot-offline" /> Offline <b>{offlineCount}</b></div>
                <div className="legend-row legend-total"><span>Total active</span><b>{movingCount + idleCount}</b></div>
              </div>
              {error && <div className="error-banner map-error"><AlertTriangle {...ICON} /><div><strong>Backend unreachable.</strong><span> Start FastAPI on port 8000 and refresh.</span></div></div>}
            </div>
            <aside className="vehicle-panel">
              <div className="vehicle-head"><h2>Vehicles</h2><span>{filteredVehicles.length} of {fleet.length}</span></div>
              <label className="map-search"><Search size={15} strokeWidth={1.5} /><input value={vehicleQuery} onChange={(e) => setVehicleQuery(e.target.value)} placeholder="Search vehicles..." aria-label="Search vehicles" /></label>
              <label className="sort-row">Sort by
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as "status" | "speed" | "location")}>
                  <option value="status">Status</option>
                  <option value="speed">Speed</option>
                  <option value="location">Location</option>
                </select>
              </label>
              <div className="vehicle-list">
                {panelShown.map((v) => {
                  const moving = v.status === "active";
                  return (
                    <button key={v.vehicle_id} className={v.vehicle_id === selectedVehicleId ? "vehicle-card vehicle-selected" : "vehicle-card"} onClick={() => setSelectedVehicleId(v.vehicle_id)}>
                      <div className="row-icon"><Truck {...ICON} /></div>
                      <div className="row-main">
                        <strong>{v.vehicle_id}</strong>
                        <span>{v.driver}</span>
                        <small>{moving ? `${speedFor(v.vehicle_id)} km/h` : "Idle"} - {destinationFor(v, shipments)}</small>
                      </div>
                      <span className={moving ? "badge badge-solid" : "badge"}>{moving ? "Moving" : v.status}</span>
                    </button>
                  );
                })}
                {filteredVehicles.length === 0 && <div className="empty-state">No vehicles match this search.</div>}
              </div>
              <Pager page={getPage("panel")} total={pageCount(filteredVehicles.length, 6)} onChange={(p) => setPageNum("panel", p)} />
              {selectedVehicle && (
                <div className="vehicle-detail">
                  <strong>{selectedVehicle.vehicle_id} - {selectedVehicle.driver}</strong>
                  <span>{selectedVehicle.vehicle_type} - {selectedVehicle.capacity.toLocaleString()} kg - {selectedVehicle.current_location}{selectedVehicle.refrigerated ? " - refrigerated" : ""}</span>
                  <div className="rec-actions">
                    {selectedVehicleShipment && <button className="btn btn-small btn-primary" onClick={() => setSelection({ kind: "shipment", item: selectedVehicleShipment })}>Open {selectedVehicleShipment.shipment_id}</button>}
                    <button className="btn btn-small" onClick={() => setSelectedVehicleId(null)}>Clear</button>
                  </div>
                </div>
              )}
              <div className="vehicle-foot"><div><b>{movingCount}</b><span>Moving</span></div><div><b>{idleCount}</b><span>Idle</span></div></div>
            </aside>
          </div>
        )}

        {(page === "dashboard" || page === "jobs" || page === "vehicles" || page === "alerts" || page === "reports") && (
          <main className="dashboard">
            <div className="dashboard-heading">
              <div><span className="kicker">Live operations - synthetic data</span><h1>From disruption signals to logged action.</h1><p>Track shipments, disruptions, cold chain and idle fleet. Log recovery in one click.</p></div>
              <div className="data-chip"><span className="status-dot" /> {openAlerts} open alerts - {actions.length} actions logged</div>
            </div>
            {error && <div className="error-banner"><AlertTriangle {...ICON} /><div><strong>Backend unreachable.</strong><span> Start FastAPI on port 8000 and refresh.</span></div></div>}

            {(page === "dashboard") && (
              <div className="page-grid">
                <section className="metric-grid">
                  <MetricCard label="Shipments" value={shipments.length} icon={PackageCheck} />
                  <MetricCard label="At risk" value={atRiskIds.size} icon={AlertTriangle} />
                  <MetricCard label="Critical" value={criticalCount} icon={Bell} />
                  <MetricCard label="Idle fleet" value={idleFleet.length} icon={Truck} />
                  <MetricCard label="Excursions" value={excursionIds.length} icon={Snowflake} />
                </section>
                <section className="panel">
                  <SectionHeader title="Recommendations" action={<span className="section-count">{recommendations.length} pending</span>} />
                  {dashRecs.map((rec) => (
                    <div className="rec-card" key={rec.recommendation_id}>
                      <h3>{rec.title}</h3>
                      <p>{rec.description}</p>
                      <div className="rec-meta"><Badge solid={rec.priority === 1}>P{rec.priority}</Badge><Badge>{rec.recommendation_type.replaceAll("_", " ")}</Badge>{rec.suggested_vehicle_id && <Badge>{rec.suggested_vehicle_id}</Badge>}</div>
                      <div className="rec-actions">
                        <button className="btn btn-small btn-primary" onClick={() => logAction(rec.recommendation_type, rec.shipment_id, rec.suggested_vehicle_id, rec.recommendation_id)}>Log action</button>
                        <button className="btn btn-small" onClick={() => { const s = shipments.find((x) => x.shipment_id === rec.shipment_id); if (s) setSelection({ kind: "shipment", item: s }); }}>Open shipment</button>
                      </div>
                    </div>
                  ))}
                  <Pager page={getPage("dashrecs")} total={pageCount(recommendations.length, 4)} onChange={(p) => setPageNum("dashrecs", p)} />
                </section>
                <section className="panel">
                  <SectionHeader title="Cold chain" action={<span className="section-count">{excursionIds.length} excursions</span>} />
                  {coldShown.map(([shipmentId, logs]) => {
                    const latest = logs.at(-1);
                    const bad = latest && (latest.temperature_c < latest.temperature_min || latest.temperature_c > latest.temperature_max);
                    const shipment = shipments.find((x) => x.shipment_id === shipmentId);
                    return (
                      <button className="cold-row" key={shipmentId} onClick={() => shipment && setSelection({ kind: "shipment", item: shipment })}>
                        <div className="row-icon"><Snowflake {...ICON} /></div>
                        <div className="row-main"><strong>{shipmentId} - {shipment ? titleCase(shipment.cargo_type) : "cargo"}</strong><small>Limit {logs[0]?.temperature_min} to {logs[0]?.temperature_max} C</small></div>
                        <div className="temp-trend">{logs.map((log) => <span key={log.log_id} className={log.temperature_c > log.temperature_max ? "temp-high" : ""}>{log.temperature_c.toFixed(1)}</span>)}<small>C</small></div>
                      <Badge solid={bad}>{bad ? "Excursion" : "In range"}</Badge>
                    </button>
                  );
                })}
                <Pager page={getPage("cold")} total={pageCount(Object.keys(temperatures).length, 6)} onChange={(p) => setPageNum("cold", p)} />
              </section>
                <section className="assistant-panel">
                  <div className="assistant-title"><div className="assistant-icon"><Bot {...ICON} /></div><div><h2 style={{ fontSize: 15 }}>Fleet 360 Assistant</h2><span className="kicker">Rule based POC</span></div><Badge>Live</Badge></div>
                  <div className="suggestions">
                    {["What are the most critical shipments?", "Which shipments are affected by the Mumbai disruption?", "What should we do first?", "Which idle vehicle could be redeployed?"].map((q) => (
                      <button key={q} onClick={() => { setQuestion(q); ask(q); }}>{q}<ArrowUpRight {...ICON} /></button>
                    ))}
                  </div>
                  <form className="assistant-form" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
                    <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about critical loads, Mumbai impact, cold chain..." aria-label="Ask assistant" />
                    <button className="btn btn-primary" type="submit" disabled={asking}>{asking ? "Working..." : "Ask"}</button>
                  </form>
                  {answer && <div className="assistant-answer">{answer}</div>}
                  <div className="suggestions" style={{ marginTop: 10 }}>
                    <span className="badge"><Box {...ICON} /> {shipments.length} shipments</span>
                    <span className="badge"><ClipboardList {...ICON} /> {recommendations.length} recs</span>
                    <span className="badge"><Truck {...ICON} /> {idleFleet.length} idle</span>
                  </div>
                </section>
              </div>
            )}

            {page === "jobs" && (
              <section className="panel">
                <SectionHeader title="Jobs" action={<span className="section-count">{shipments.length} records</span>} />
                <div className="table-wrap">
                  <table className="mono-table">
                    <thead><tr><th>ID</th><th>Lane</th><th>Cargo</th><th>Status</th><th>Impact</th><th>Action</th></tr></thead>
                    <tbody>
                      {jobsShown.map((s) => {
                        const impact = weatherImpactByShipment[s.shipment_id];
                        return (
                          <tr key={s.shipment_id}>
                            <td><strong>{s.shipment_id}</strong><br />Due {formatDate(s.deadline)}</td>
                            <td>{s.origin} - {s.destination}<br />{s.current_location} now</td>
                            <td>{titleCase(s.cargo_type)}<br />{formatValue(s.value)}</td>
                            <td><Badge solid={s.priority === "critical"}>{s.priority}</Badge> <Badge>{titleCase(s.status)}</Badge></td>
                            <td>{impact ? <Badge solid>{impact.impact_level} +{impact.estimated_delay_hours}h</Badge> : <Badge>Clear</Badge>}</td>
                            <td><button className="btn btn-small" onClick={() => setSelection({ kind: "shipment", item: s })}>Open <ArrowUpRight {...ICON} /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pager page={getPage("jobs")} total={pageCount(shipments.length, 8)} onChange={(p) => setPageNum("jobs", p)} />
              </section>
            )}

            {page === "vehicles" && (
              <section className="panel">
                <SectionHeader title="Vehicles" action={<span className="section-count">{fleet.length} vehicles</span>} />
                <div className="table-wrap">
                  <table className="mono-table">
                    <thead><tr><th>Vehicle</th><th>Location</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {fleetShown.map((v) => (
                        <tr key={v.vehicle_id}>
                          <td><strong>{v.vehicle_id}</strong><br />{v.vehicle_type} - {v.capacity.toLocaleString()} kg</td>
                          <td>{v.current_location}<br />{v.driver}</td>
                          <td><Badge solid={v.status === "idle"}>{v.status}</Badge> {v.refrigerated && <Badge>Refrigerated</Badge>}</td>
                          <td>{v.status === "idle" ? <button className="btn btn-small btn-primary" onClick={() => logAction("redeploy_vehicle", "SHP-1001", v.vehicle_id)}>Stage for SHP-1001</button> : <span>On {v.current_shipment_id}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={getPage("fleet")} total={pageCount(fleet.length, 8)} onChange={(p) => setPageNum("fleet", p)} />
              </section>
            )}

            {page === "alerts" && (
              <div className="page-grid">
                <section className="panel">
                  <SectionHeader title="Disruptions" action={<span className="section-count">{disruptions.length} active</span>} />
                  <div className="stack-list">
                    {disruptions.map((d) => (
                      <button className="row-button" key={d.disruption_id} onClick={() => setSelection({ kind: "disruption", item: d })}>
                        <div className="row-icon"><CloudRain {...ICON} /></div>
                        <div className="row-main"><strong>{d.disruption_id} - {d.title}</strong><span>{d.location} - {titleCase(d.type)}</span><small>{(weatherImpacts[d.disruption_id] ?? []).length} affected - {d.expected_duration_hours}h window</small></div>
                        <Badge solid={d.severity === "HIGH"}>{d.severity}</Badge>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <SectionHeader title="Alerts" action={<span className="section-count">{openAlerts} open</span>} />
                  {alertsShown.map((a) => (
                    <div className="rec-card" key={a.alert_id}>
                      <h3>{a.title}</h3>
                      <p>{a.detail}</p>
                      <div className="rec-meta"><Badge solid={!a.acknowledged}>{a.severity}</Badge><Badge>{a.acknowledged ? "Acknowledged" : "Open"}</Badge></div>
                      {!a.acknowledged && <div className="rec-actions"><button className="btn btn-small btn-primary" onClick={() => ack(a.alert_id)}><Check {...ICON} /> Acknowledge</button></div>}
                    </div>
                  ))}
                  {alerts.length === 0 && <div className="empty-state">No alerts generated.</div>}
                  <Pager page={getPage("alerts")} total={pageCount(alerts.length, 6)} onChange={(p) => setPageNum("alerts", p)} />
                </section>
              </div>
            )}

            {page === "reports" && (
              <div className="page-grid">
                <section className="panel">
                  <SectionHeader title="All recommendations" action={<span className="section-count">{recommendations.length}</span>} />
                  {allRecs.map((rec) => (
                    <div className="rec-card" key={rec.recommendation_id}>
                      <h3>{rec.recommendation_id} - {rec.title}</h3>
                      <p>{rec.description}</p>
                      <div className="rec-actions"><button className="btn btn-small btn-primary" onClick={() => logAction(rec.recommendation_type, rec.shipment_id, rec.suggested_vehicle_id, rec.recommendation_id)}>Log action</button></div>
                    </div>
                  ))}
                  <Pager page={getPage("allrecs")} total={pageCount(recommendations.length, 4)} onChange={(p) => setPageNum("allrecs", p)} />
                </section>
                <section className="panel">
                  <SectionHeader title="Logged actions" action={<span className="section-count">{actions.length} in JSON</span>} />
                  {actions.length === 0 && <div className="empty-state">No actions yet. Log one from any recommendation to prove the flow.</div>}
                  <div className="table-wrap">
                    {actions.length > 0 && (
                      <table className="mono-table">
                        <thead><tr><th>ID</th><th>Type</th><th>Shipment</th><th>Vehicle</th><th>Time</th></tr></thead>
                        <tbody>
                          {actionsShown.map((a) => (
                            <tr key={a.action_id}><td>{a.action_id}</td><td>{a.action_type.replaceAll("_", " ")}</td><td>{a.shipment_id}</td><td>{a.vehicle_id ?? "-"}</td><td>{formatDate(a.created_at)}</td></tr>
                          ))}
                    </tbody>
                  </table>
                    )}
                  </div>
                  <Pager page={getPage("actions")} total={pageCount(actions.length, 6)} onChange={(p) => setPageNum("actions", p)} />
                </section>
              </div>
            )}
          </main>
        )}

        {page === "drivers" && (
          <main className="dashboard">
            <div className="dashboard-heading"><div><span className="kicker">Roster - synthetic data</span><h1>Drivers on duty.</h1><p>Every vehicle carries one assigned driver. Idle drivers are first in line for redeploy.</p></div></div>
            <section className="panel">
              <SectionHeader title="Drivers" action={<span className="section-count">{fleet.length} assigned</span>} />
              <div className="table-wrap">
                <table className="mono-table">
                  <thead><tr><th>Driver</th><th>Vehicle</th><th>Location</th><th>Load</th></tr></thead>
                  <tbody>
                    {driversShown.map((v) => (
                      <tr key={v.vehicle_id}><td><strong>{v.driver}</strong></td><td>{v.vehicle_id} - {v.vehicle_type}</td><td>{v.current_location}</td><td>{v.status === "idle" ? <Badge solid>Available</Badge> : <Badge>On {v.current_shipment_id}</Badge>}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={getPage("drivers")} total={pageCount(fleet.length, 8)} onChange={(p) => setPageNum("drivers", p)} />
            </section>
          </main>
        )}

        {page === "routes" && (
          <main className="dashboard">
            <div className="dashboard-heading"><div><span className="kicker">Lanes - synthetic data</span><h1>Routes under watch.</h1><p>Each job travels a fixed city corridor. Disruptions strike named corridors.</p></div></div>
            <section className="panel">
              <SectionHeader title="Shipment corridors" action={<span className="section-count">{shipments.length} lanes</span>} />
              <div className="table-wrap">
                <table className="mono-table">
                  <thead><tr><th>Shipment</th><th>Corridor</th><th>Now</th><th>Impact</th></tr></thead>
                  <tbody>
                    {routesShown.map((s) => {
                      const impact = weatherImpactByShipment[s.shipment_id];
                      return <tr key={s.shipment_id}><td><strong>{s.shipment_id}</strong></td><td>{s.route.join(" - ")}</td><td>{s.current_location}</td><td>{impact ? <Badge solid>{impact.impact_level}</Badge> : <Badge>Clear</Badge>}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={getPage("routes")} total={pageCount(shipments.length, 8)} onChange={(p) => setPageNum("routes", p)} />
            </section>
            <section className="panel" style={{ marginTop: 16 }}>
              <SectionHeader title="Disruption corridors" action={<span className="section-count">{disruptions.length} signals</span>} />
              <div className="stack-list">
                {disruptions.map((d) => (
                  <button className="row-button" key={d.disruption_id} onClick={() => setSelection({ kind: "disruption", item: d })}>
                    <div className="row-icon"><RouteIcon {...ICON} /></div>
                    <div className="row-main"><strong>{d.disruption_id} - {d.title}</strong><span>{d.affected_routes.join(" | ")}</span></div>
                    <Badge solid={d.severity === "HIGH"}>{d.severity}</Badge>
                  </button>
                ))}
              </div>
            </section>
          </main>
        )}

        {page === "geofences" && (
          <main className="dashboard">
            <div className="dashboard-heading"><div><span className="kicker">Zones - synthetic data</span><h1>City zones.</h1><p>POC zones equal the cities in the dataset. Counts show vehicles reporting inside each zone.</p></div></div>
            <section className="panel">
              <SectionHeader title="Zones" action={<span className="section-count">{new Set(fleet.map((v) => v.current_location)).size} zones</span>} />
              <div className="table-wrap">
                <table className="mono-table">
                  <thead><tr><th>Zone</th><th>Vehicles inside</th><th>Idle inside</th></tr></thead>
                  <tbody>
                    {Array.from(new Set(fleet.map((v) => v.current_location))).sort().map((city) => {
                      const inside = fleet.filter((v) => v.current_location === city);
                      return <tr key={city}><td><strong>{city}</strong></td><td>{inside.map((v) => v.vehicle_id).join(", ")}</td><td>{inside.some((v) => v.status === "idle") ? <Badge solid>Capacity free</Badge> : <Badge>Full</Badge>}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )}

        {page === "settings" && (
          <main className="dashboard">
            <div className="dashboard-heading"><div><span className="kicker">Console</span><h1>Map display.</h1><p>Local display switches only. Nothing here touches backend data.</p></div></div>
            <section className="panel">
              <SectionHeader title="Preferences" action={<span className="section-count">Local only</span>} />
              <div className="stack-list">
                <div className="row-button" style={{ cursor: "default" }}><div className="row-main"><strong>Vehicle speed labels</strong><span>Show id plus km/h above each marker</span></div><button className="btn btn-small" onClick={() => setShowLabels((v) => !v)}>{showLabels ? "On" : "Off"}</button></div>
                <div className="row-button" style={{ cursor: "default" }}><div className="row-main"><strong>Grayscale map tiles</strong><span>Keeps the console in mono black and white</span></div><button className="btn btn-small" onClick={() => setGrayTiles((v) => !v)}>{grayTiles ? "On" : "Off"}</button></div>
                <div className="row-button" style={{ cursor: "default" }}><div className="row-main"><strong>Default view</strong><span>Live Map loads first for the demo</span></div><button className="btn btn-small" onClick={() => setPage("livemap")}>Open Live Map</button></div>
              </div>
            </section>
          </main>
        )}
      </div>

      {selection && (
        <div className="drawer-backdrop" onClick={() => setSelection(null)}>
          <aside className="detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div><span className="kicker">{selection.kind === "shipment" ? "Shipment record" : "Disruption record"}</span><h2>{selection.kind === "shipment" ? selection.item.shipment_id : selection.item.title}</h2></div>
              <button className="btn btn-small" onClick={() => setSelection(null)} aria-label="Close">Close</button>
            </div>
            {selection.kind === "shipment" ? (
              <>
                <div className="drawer-status"><Badge solid>{selection.item.priority} priority</Badge><Badge>{titleCase(selection.item.status)}</Badge></div>
                <dl className="detail-list">
                  <div><dt>Cargo</dt><dd>{titleCase(selection.item.cargo_type)}</dd></div>
                  <div><dt>Lane</dt><dd>{selection.item.origin} to {selection.item.destination}</dd></div>
                  <div><dt>Location</dt><dd>{selection.item.current_location}</dd></div>
                  <div><dt>Deadline</dt><dd>{formatDate(selection.item.deadline)}</dd></div>
                  <div><dt>Value</dt><dd>{formatValue(selection.item.value)}</dd></div>
                  <div><dt>Carrier</dt><dd>{selection.item.carrier}</dd></div>
                </dl>
                <div className="drawer-block"><span className="kicker">Route</span><div className="route-pills">{selection.item.route.map((p) => <span key={p}>{p}</span>)}</div></div>
                {(temperatures[selection.item.shipment_id] ?? []).length > 0 && (
                  <div className="drawer-block"><span className="kicker">Temperature</span><div className="route-pills">{(temperatures[selection.item.shipment_id] ?? []).map((log) => <span key={log.log_id} className={log.temperature_c > log.temperature_max ? "temp-high" : ""}>{log.temperature_c.toFixed(1)} C</span>)}</div></div>
                )}
                <div className="drawer-block"><span className="kicker">Weather impact</span>
                  {([weatherImpactByShipment[selection.item.shipment_id]].filter(Boolean) as WeatherImpact[]).length === 0 && <p style={{ fontSize: 12 }}>No active weather disruption on this shipment.</p>}
                  {([weatherImpactByShipment[selection.item.shipment_id]].filter(Boolean) as WeatherImpact[]).map((impact) => (
                    <div className="impact-record" key={impact.disruption_id}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ fontSize: 12 }}>{impact.disruption_id}</strong><Badge solid>{impact.impact_level}</Badge></div>
                      <div className="impact-facts">
                        <div><dt>Delay</dt><dd>{impact.estimated_delay_hours}h</dd></div>
                        <div><dt>Route hit</dt><dd>{impact.route_affected ? "Yes" : "No"}</dd></div>
                      </div>
                      <p style={{ fontSize: 11, lineHeight: 1.5 }}>{impact.reason}</p>
                    </div>
                  ))}
                </div>
                <div className="drawer-block"><span className="kicker">Reroute options</span>
                  {altsLoading && <p style={{ fontSize: 12 }}>Working out alternate corridors...</p>}
                  {!altsLoading && alts && alts.alternatives.length === 0 && <p style={{ fontSize: 12 }}>No alternate corridor found for this lane.</p>}
                  {!altsLoading && alts && (
                    <p style={{ fontSize: 11, marginTop: 6 }}>Primary: {alts.primary.waypoints.join(" - ")} ({alts.primary.distance_km} km, {alts.primary.time_h} h, {alts.primary.fuel_l} L)</p>
                  )}
                  {alts?.alternatives.map((alt) => (
                    <div className="impact-record" key={alt.alternate_id}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 12 }}>{alt.name}</strong><Badge solid={alt.avoids_disruption}>{alt.avoids_disruption ? `Avoids ${alts?.disruption_id}` : "Still exposed"}</Badge></div>
                      <p style={{ fontSize: 11, lineHeight: 1.5 }}>{alt.waypoints.join(" - ")}</p>
                      <div className="impact-facts">
                        <div><dt>Extra km</dt><dd>+{alt.extra_km}</dd></div>
                        <div><dt>Extra time</dt><dd>+{alt.extra_time_h}h</dd></div>
                        <div><dt>Extra fuel</dt><dd>+{alt.extra_fuel_l} L</dd></div>
                        <div><dt>Extra cost</dt><dd>Rs {alt.extra_cost_rs}</dd></div>
                      </div>
                      <p style={{ fontSize: 11 }}>Delay avoided: {alt.delay_avoided_h}h. Total {alt.distance_km} km in {alt.time_h}h on {alt.fuel_l} L.</p>
                      <div className="rec-actions"><button className="btn btn-small btn-primary" onClick={() => { setPreviewAlt({ shipment_id: selection.item.shipment_id, alt }); setSelection(null); setPage("livemap"); }}>Preview on map</button></div>
                    </div>
                  ))}
                </div>
                <div className="drawer-block rec-actions">
                  <button className="btn btn-primary" onClick={() => logAction("reroute", selection.item.shipment_id, selection.item.assigned_vehicle_id)}>Log reroute</button>
                  <button className="btn" onClick={() => logAction("inspect_cargo", selection.item.shipment_id, selection.item.assigned_vehicle_id)}>Log inspection</button>
                </div>
              </>
            ) : (
              <>
                <div className="drawer-status"><Badge solid>{selection.item.severity}</Badge><Badge>{selection.item.status}</Badge></div>
                <dl className="detail-list">
                  <div><dt>Type</dt><dd>{titleCase(selection.item.type)}</dd></div>
                  <div><dt>Location</dt><dd>{selection.item.location}</dd></div>
                  <div><dt>Duration</dt><dd>{selection.item.expected_duration_hours} hours</dd></div>
                  <div><dt>Observed</dt><dd>{formatDate(selection.item.observed_at)}</dd></div>
                </dl>
                <div className="drawer-block"><span className="kicker">Detail</span><p style={{ fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>{selection.item.description}</p></div>
                <div className="drawer-block"><span className="kicker">Affected routes</span><div className="route-pills">{selection.item.affected_routes.map((r) => <span key={r}>{r}</span>)}</div></div>
                <div className="drawer-block"><span className="kicker">Affected shipments</span>
                  {(weatherImpacts[selection.item.disruption_id] ?? []).map((impact) => (
                    <div className="impact-record" key={impact.shipment_id}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ fontSize: 12 }}>{impact.shipment_id}</strong><Badge solid>{impact.impact_level}</Badge></div>
                      <p style={{ fontSize: 11, lineHeight: 1.5 }}>{impact.reason}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default App;
