import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  AlertTriangle, ArrowUpRight, Bot, CloudRain, Flame, Globe,
  PackageCheck, Snowflake, Truck, Zap, CheckCircle,
  ThermometerSnowflake, Navigation, X, Menu, Activity,
  TrendingUp, Shield, Map, BarChart2,
} from "lucide-react";
import { api } from "@/api/client";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/Badge";
import { OperationsMap } from "@/components/OperationsMap";
import { AssistantPanel } from "@/components/AssistantPanel";
import { cn } from "@/lib/utils";
import type {
  ColdChainAlert, Disruption, GeopoliticalEvent, GeopoliticalImpact,
  Recommendation, RedeploymentMatch, Shipment, TemperatureLog,
  Vehicle, WeatherImpact,
} from "@/types";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtDate   = (v: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
const fmtINR    = (v: number) => v >= 10_000_000 ? `₹${(v / 10_000_000).toFixed(1)}Cr` : `₹${(v / 100_000).toFixed(1)}L`;
const titleCase = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const sevRank   = (s: string) => ({ LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s.toUpperCase()] ?? 0);

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashData {
  shipments:      Shipment[];
  fleet:          Vehicle[];
  idleFleet:      Vehicle[];
  disruptions:    Disruption[];
  geoEvents:      GeopoliticalEvent[];
  weatherImpacts: Record<string, WeatherImpact[]>;
  geoImpacts:     Record<string, GeopoliticalImpact[]>;
  coldAlerts:     ColdChainAlert[];
  recommendations: Recommendation[];
  tempLogs:       Record<string, TemperatureLog[]>;
  redeployAll:    Record<string, RedeploymentMatch[]>;
}

type DrawerItem =
  | { kind: "shipment";   item: Shipment }
  | { kind: "disruption"; item: Disruption }
  | { kind: "geo";        item: GeopoliticalEvent }
  | { kind: "alert";      item: ColdChainAlert }
  | { kind: "rec";        item: Recommendation };

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [drawer, setDrawer]   = useState<DrawerItem | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [shipments, fleet, idleFleet, disruptions, geoEvents, coldAlerts, recommendations, redeployAll] =
          await Promise.all([
            api.shipments(), api.fleet(), api.idleFleet(), api.disruptions(),
            api.geopoliticalEvents(), api.coldChainAlerts(), api.recommendations(), api.redeployAll(),
          ]);
        const [weatherEntries, geoEntries, tempEntries] = await Promise.all([
          Promise.all(disruptions.map(async (d) => [d.disruption_id, await api.weatherImpacts(d.disruption_id)] as const)),
          Promise.all(geoEvents.map(async (e) => [e.event_id, await api.geoImpacts(e.event_id)] as const)),
          Promise.all(shipments.filter((s) => s.temperature_required).map(async (s) => [s.shipment_id, await api.temperatureLogs(s.shipment_id)] as const)),
        ]);
        if (!live) return;
        setData({
          shipments, fleet, idleFleet, disruptions, geoEvents, coldAlerts, recommendations, redeployAll,
          weatherImpacts: Object.fromEntries(weatherEntries),
          geoImpacts:     Object.fromEntries(geoEntries),
          tempLogs:       Object.fromEntries(tempEntries),
        });
      } catch { if (live) setError(true); }
      finally  { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 bg-slate-50">
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-5xl font-black text-blue-600"
      >
        F<span className="text-blue-400 text-2xl">360</span>
      </motion.div>
      <p className="text-slate-400 text-sm tracking-widest uppercase">Connecting to backend…</p>
    </div>
  );

  if (!data) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 bg-slate-50 text-red-500">
      <AlertTriangle size={32} />
      <p className="text-sm text-slate-600">Could not reach Fleet360 backend. Start the FastAPI server and refresh.</p>
    </div>
  );

  return (
    <Tooltip.Provider delayDuration={300}>
      <Dashboard data={data} error={error} drawer={drawer} setDrawer={setDrawer} />
    </Tooltip.Provider>
  );
}

// ── Nav sections config ────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  { id: "overview",        label: "Overview",       icon: <BarChart2 size={13} /> },
  { id: "map",             label: "Map",             icon: <Map size={13} /> },
  { id: "agents",          label: "Agents",          icon: <Shield size={13} /> },
  { id: "recommendations", label: "Recommendations", icon: <Zap size={13} /> },
  { id: "assistant",       label: "Assistant",       icon: <Bot size={13} /> },
] as const;

type SectionId = typeof NAV_SECTIONS[number]["id"];

// ── Scroll-spy hook ────────────────────────────────────────────────────────────
function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>("overview");
  useEffect(() => {
    const els = NAV_SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the topmost visible section
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id as SectionId);
      },
      { threshold: 0.25 }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return active;
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ data, error, drawer, setDrawer }: {
  data: DashData; error: boolean;
  drawer: DrawerItem | null; setDrawer: (d: DrawerItem | null) => void;
}) {
  const { shipments, idleFleet, disruptions, geoEvents, coldAlerts, recommendations, weatherImpacts, geoImpacts, redeployAll } = data;
  const [mobileNav, setMobileNav] = useState(false);
  const activeSection = useActiveSection();

  const allWeatherImpacts = useMemo(() => Object.values(weatherImpacts).flat(), [weatherImpacts]);
  const allGeoImpacts     = useMemo(() => Object.values(geoImpacts).flat(), [geoImpacts]);

  const criticalCount = useMemo(() => new Set([
    ...allWeatherImpacts.filter(i => i.impact_level === "CRITICAL").map(i => i.shipment_id),
    ...allGeoImpacts.filter(i => i.impact_level === "CRITICAL").map(i => i.shipment_id),
    ...coldAlerts.filter(a => a.severity === "CRITICAL").map(a => a.shipment_id),
  ]).size, [allWeatherImpacts, allGeoImpacts, coldAlerts]);

  const atRiskCount = useMemo(() => new Set([
    ...allWeatherImpacts.map(i => i.shipment_id),
    ...allGeoImpacts.map(i => i.shipment_id),
    ...coldAlerts.map(a => a.shipment_id),
  ]).size, [allWeatherImpacts, allGeoImpacts, coldAlerts]);

  const selectedDisruptionId = drawer?.kind === "disruption" ? drawer.item.disruption_id : undefined;
  const affectedIds = selectedDisruptionId
    ? new Set((weatherImpacts[selectedDisruptionId] ?? []).map(i => i.shipment_id))
    : new Set<string>();

  // Chart data
  const agentChartData = [
    { name: "Weather",      impacts: allWeatherImpacts.length,  fill: "#3b82f6" },
    { name: "Geopolitical", impacts: allGeoImpacts.length,      fill: "#7c3aed" },
    { name: "Cold Chain",   impacts: coldAlerts.length,         fill: "#0d9488" },
  ];

  const priorityData = [
    { name: "Critical", value: recommendations.filter(r => r.priority === 1).length, fill: "#dc2626" },
    { name: "High",     value: recommendations.filter(r => r.priority === 2).length, fill: "#ea580c" },
    { name: "Medium",   value: recommendations.filter(r => r.priority === 3).length, fill: "#d97706" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">

      {/* ── Topbar ── */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 md:px-6 h-14 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        {/* Logo */}
        <button
          onClick={() => scrollTo("overview")}
          className="flex items-center gap-2.5 flex-shrink-0 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-sm text-white shadow-sm">
            F<span className="text-[9px] opacity-70">360</span>
          </div>
          <div className="hidden sm:block">
            <p className="font-bold text-sm leading-none text-slate-800">Fleet360</p>
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">AI Operations</p>
          </div>
        </button>

        {/* ── Desktop nav ── */}
        <nav className="hidden md:flex items-center gap-0.5 ml-4">
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => { scrollTo(s.id); setMobileNav(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                activeSection === s.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              {s.icon}{s.label}
            </button>
          ))}
        </nav>

        {/* ── Right side ── */}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Operational
          </div>
          {error && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              <AlertTriangle size={11} /> Backend unreachable
            </div>
          )}
          <button
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={16} />
          </button>
        </div>
      </header>

      {/* ── Mobile nav dropdown ── */}
      <AnimatePresence>
        {mobileNav && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="md:hidden sticky top-14 z-40 bg-white border-b border-slate-200 px-4 py-2 flex flex-col gap-0.5 shadow-sm"
          >
            {NAV_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => { scrollTo(s.id); setMobileNav(false); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer w-full text-left",
                  activeSection === s.id
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {s.icon}{s.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 flex flex-col gap-6">

        {/* ══════════════════════════════════════════════════════
            SECTION: Overview  (KPIs + charts)
        ══════════════════════════════════════════════════════ */}
        <section id="overview" className="flex flex-col gap-6 scroll-mt-16">

        {/* ── Hero ── */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold tracking-[0.15em] text-blue-600 uppercase mb-1.5">Control Room / Live Operations</p>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">
              From disruption signals to<br className="hidden sm:block" /> actionable decisions.
            </h1>
            <p className="text-sm text-slate-400 mt-2">Weather · Geopolitical · Cold-Chain · Fleet Redeployment</p>
          </div>
        </motion.div>

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Active Shipments"  value={shipments.length}        icon={<PackageCheck size={16} />} valueClass="text-blue-600"    delay={0}    />
          <MetricCard label="At Risk"           value={atRiskCount}             icon={<AlertTriangle size={16} />} valueClass="text-orange-600" delay={0.05} />
          <MetricCard label="Critical"          value={criticalCount}           icon={<Flame size={16} />}         valueClass="text-red-600"    delay={0.1}  />
          <MetricCard label="Idle Fleet"        value={idleFleet.length}        icon={<Truck size={16} />}         valueClass="text-emerald-600" delay={0.15} />
          <MetricCard label="Cold Alerts"       value={coldAlerts.length}       icon={<Snowflake size={16} />}     valueClass="text-teal-600"   delay={0.2}  />
          <MetricCard label="Recommendations"  value={recommendations.length}  icon={<Zap size={16} />}           valueClass="text-violet-600" delay={0.25} />
        </div>

        {/* ── Analytics Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="Agent Signal Distribution" eyebrow="AI AGENTS">
            <div className="h-44 px-2 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentChartData} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip
                    contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                    labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                    itemStyle={{ color: "#475569" }}
                  />
                  <Bar dataKey="impacts" radius={[6,6,0,0]}>
                    {agentChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Recommendation Priority Split" eyebrow="RECOVERY WORKBENCH">
            <div className="h-44 px-2 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} layout="vertical" barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={58} />
                  <ReTooltip
                    contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                    labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                    itemStyle={{ color: "#475569" }}
                  />
                  <Bar dataKey="value" radius={[0,6,6,0]}>
                    {priorityData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        </section>

        {/* ══════════════════════════════════════════════════════
            SECTION: Map
        ══════════════════════════════════════════════════════ */}
        <section id="map" className="scroll-mt-16">
        <Panel title="Operational Network Map" eyebrow="NETWORK AWARENESS">
          <div className="p-3">
            <OperationsMap
              shipments={shipments}
              disruptions={disruptions}
              idleFleet={idleFleet}
              selectedDisruptionId={selectedDisruptionId}
              affectedShipmentIds={affectedIds}
              onSelectShipment={(s) => setDrawer({ kind: "shipment", item: s })}
              onSelectDisruption={(d) => setDrawer({ kind: "disruption", item: d })}
            />
          </div>
        </Panel>
        </section>

        {/* ══════════════════════════════════════════════════════
            SECTION: Agents
        ══════════════════════════════════════════════════════ */}
        <section id="agents" className="scroll-mt-16">
        <Panel title="Intelligence Agents" eyebrow="AI SIGNALS">
          <Tabs.Root defaultValue="weather" className="w-full">
            <Tabs.List className="flex gap-1 px-4 pt-1 border-b border-slate-200 overflow-x-auto">
              {[
                { value: "weather",      label: "Weather",      icon: <CloudRain size={13} />,            count: disruptions.length },
                { value: "geopolitical", label: "Geopolitical", icon: <Globe size={13} />,                count: geoEvents.length },
                { value: "coldchain",    label: "Cold Chain",   icon: <ThermometerSnowflake size={13} />, count: coldAlerts.length },
                { value: "redeploy",     label: "Redeployment", icon: <Navigation size={13} />,           count: Object.keys(redeployAll).length },
              ].map((t) => (
                <Tabs.Trigger
                  key={t.value}
                  value={t.value}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-400 border-b-2 border-transparent -mb-px whitespace-nowrap",
                    "hover:text-slate-700 transition-colors cursor-pointer",
                    "data-[state=active]:text-blue-600 data-[state=active]:border-blue-500"
                  )}
                >
                  {t.icon}{t.label}
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">{t.count}</span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="weather">
              <EventList
                items={disruptions}
                getKey={d => d.disruption_id}
                getIcon={() => <CloudRain size={14} />}
                getSeverity={d => d.severity}
                getTitle={d => d.title}
                getSub={d => `${d.location} · ${d.expected_duration_hours}h`}
                getCount={d => `${(weatherImpacts[d.disruption_id] ?? []).length} shipments affected`}
                onSelect={d => setDrawer({ kind: "disruption", item: d })}
              />
            </Tabs.Content>

            <Tabs.Content value="geopolitical">
              <EventList
                items={geoEvents}
                getKey={e => e.event_id}
                getIcon={() => <Globe size={14} />}
                getSeverity={e => e.severity}
                getTitle={e => e.title}
                getSub={e => `${titleCase(e.type)} · ${e.affected_commodities.join(", ")}`}
                getCount={e => `${(geoImpacts[e.event_id] ?? []).length} shipments affected`}
                onSelect={e => setDrawer({ kind: "geo", item: e })}
              />
            </Tabs.Content>

            <Tabs.Content value="coldchain">
              <EventList
                items={coldAlerts}
                getKey={a => a.alert_id}
                getIcon={() => <ThermometerSnowflake size={14} />}
                getSeverity={a => a.severity}
                getTitle={a => `${a.shipment_id} — ${titleCase(a.cargo_type)}`}
                getSub={a => `${a.current_temp.toFixed(1)}°C · safe ${a.min_safe}–${a.max_safe}°C`}
                getCount={a => `${a.excursion_duration_min.toFixed(0)} min excursion · ${a.nearest_depot}`}
                onSelect={a => setDrawer({ kind: "alert", item: a })}
              />
            </Tabs.Content>

            <Tabs.Content value="redeploy">
              <RedeployList matches={redeployAll} shipments={shipments} onSelect={(s) => setDrawer({ kind: "shipment", item: s })} />
            </Tabs.Content>
          </Tabs.Root>
        </Panel>
        </section>

        {/* ══════════════════════════════════════════════════════
            SECTION: Recommendations
        ══════════════════════════════════════════════════════ */}
        <section id="recommendations" className="scroll-mt-16">
        <Panel
          title={<>Recommended Actions <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{recommendations.length}</span></>}
          eyebrow="RECOVERY WORKBENCH"
          icon={<TrendingUp size={14} className="text-slate-400" />}
        >
          {recommendations.length === 0 ? (
            <EmptyState icon={<CheckCircle size={18} />} text="No recovery actions required." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
              {recommendations.slice(0, 9).map((r, i) => (
                <RecCard key={r.recommendation_id} rec={r} delay={i * 0.04} onClick={() => setDrawer({ kind: "rec", item: r })} />
              ))}
            </div>
          )}
        </Panel>
        </section>

        {/* ══════════════════════════════════════════════════════
            SECTION: Assistant
        ══════════════════════════════════════════════════════ */}
        <section id="assistant" className="scroll-mt-16">
        <Panel title="Fleet360 Assistant" eyebrow="AI OPERATIONS CHAT" icon={<Bot size={14} className="text-blue-500" />}>
          <AssistantPanel />
        </Panel>
        </section>

      </main>

      {/* ── Modal ── */}
      <AnimatePresence>
        {drawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setDrawer(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="w-full max-w-lg max-h-[85vh] bg-white rounded-2xl shadow-2xl shadow-slate-200/80 flex flex-col overflow-hidden border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                <p className="text-[10px] font-bold tracking-widest uppercase text-blue-600">
                  {drawer.kind === "shipment" ? "Shipment Record" : drawer.kind === "disruption" ? "Weather Disruption" : drawer.kind === "geo" ? "Geopolitical Event" : drawer.kind === "alert" ? "Cold-Chain Alert" : "Recovery Action"}
                </p>
                <button
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  onClick={() => setDrawer(null)}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-6">
                <DrawerContent item={drawer} data={data} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shared Panel wrapper ───────────────────────────────────────────────────────
function Panel({ title, eyebrow, icon, children }: {
  title: React.ReactNode; eyebrow?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
        <div className="flex-1 min-w-0">
          {eyebrow && <p className="text-[10px] font-bold tracking-[0.14em] text-blue-600 uppercase mb-0.5">{eyebrow}</p>}
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">{title}</h2>
        </div>
        {icon}
      </div>
      {children}
    </motion.div>
  );
}

// ── Generic Event List ─────────────────────────────────────────────────────────
function EventList<T>({
  items, getKey, getIcon, getSeverity, getTitle, getSub, getCount, onSelect,
}: {
  items: T[];
  getKey: (i: T) => string;
  getIcon: (i: T) => React.ReactNode;
  getSeverity: (i: T) => string;
  getTitle: (i: T) => string;
  getSub: (i: T) => string;
  getCount: (i: T) => string;
  onSelect: (i: T) => void;
}) {
  if (items.length === 0) return <EmptyState icon={<Shield size={16} />} text="No active signals." />;
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => {
        const sev = getSeverity(item).toUpperCase();
        const iconColors = {
          CRITICAL: "bg-red-50 text-red-600 border border-red-100",
          HIGH:     "bg-orange-50 text-orange-600 border border-orange-100",
          MEDIUM:   "bg-amber-50 text-amber-600 border border-amber-100",
          LOW:      "bg-green-50 text-green-600 border border-green-100",
        }[sev] ?? "bg-slate-100 text-slate-500";

        return (
          <motion.button
            key={getKey(item)}
            whileHover={{ backgroundColor: "#f8fafc" }}
            className="w-full flex items-start gap-3 px-5 py-3.5 text-left cursor-pointer transition-colors"
            onClick={() => onSelect(item)}
          >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", iconColors)}>
              {getIcon(item)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{getTitle(item)}</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{getSub(item)}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{getCount(item)}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge tone={sev}>{sev}</Badge>
              <ArrowUpRight size={13} className="text-slate-300" />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Redeployment List ──────────────────────────────────────────────────────────
function RedeployList({ matches, shipments, onSelect }: {
  matches: Record<string, RedeploymentMatch[]>;
  shipments: Shipment[];
  onSelect: (s: Shipment) => void;
}) {
  const entries = Object.entries(matches).filter(([, ms]) => ms.length > 0);
  if (entries.length === 0) return <EmptyState icon={<Truck size={16} />} text="No redeployment matches." />;
  return (
    <div className="divide-y divide-slate-100">
      {entries.map(([sid, ms]) => {
        const best = ms[0];
        const shipment = shipments.find(s => s.shipment_id === sid);
        const score = Math.round(best.fit_score * 100);
        return (
          <motion.button
            key={sid}
            whileHover={{ backgroundColor: "#f8fafc" }}
            className="w-full flex items-start gap-3 px-5 py-3.5 text-left cursor-pointer transition-colors"
            onClick={() => shipment && onSelect(shipment)}
          >
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Navigation size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{sid}</p>
              <p className="text-xs text-slate-500 mt-0.5">{best.vehicle_id} · {best.vehicle_type} · {best.vehicle_location}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{best.distance_km.toFixed(0)} km away{best.refrigerated ? " · ❄ Refrigerated" : ""}</p>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-sm font-bold text-teal-700">{score}%</span>
              <span className="text-[9px] text-slate-400">fit score</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Recommendation Card ────────────────────────────────────────────────────────
function RecCard({ rec, delay, onClick }: { rec: Recommendation; delay: number; onClick: () => void }) {
  const accentClass = rec.priority === 1
    ? "border-l-red-500 bg-red-50/30"
    : rec.priority === 2
    ? "border-l-orange-500 bg-orange-50/30"
    : "border-l-amber-400 bg-amber-50/20";

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ scale: 1.01, boxShadow: "0 4px 20px rgba(0,0,0,0.07)" }}
      onClick={onClick}
      className={cn(
        "relative text-left w-full rounded-xl bg-white border border-slate-200 border-l-4 p-4",
        "flex flex-col gap-2 cursor-pointer group transition-all",
        accentClass
      )}
    >
      <div className="flex gap-2 flex-wrap">
        <Badge tone={rec.agent_type}>{rec.agent_type}</Badge>
        <Badge tone={rec.recommendation_type}>{rec.recommendation_type}</Badge>
        <span className="ml-auto text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">P{rec.priority}</span>
      </div>
      <p className="text-xs font-semibold text-slate-800 leading-snug">{rec.title}</p>
      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{rec.description}</p>
      {rec.estimated_saving_hours > 0 && (
        <p className="text-[11px] text-emerald-700 font-semibold">⏱ Saves ~{rec.estimated_saving_hours.toFixed(1)} h</p>
      )}
      <ArrowUpRight size={13} className="absolute top-3 right-3 text-slate-300 group-hover:text-slate-500 transition-colors" />
    </motion.button>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-8 text-slate-400 text-sm">
      <span className="text-slate-300">{icon}</span>{text}
    </div>
  );
}

// ── Drawer Content ────────────────────────────────────────────────────────────
function DrawerContent({ item, data }: { item: DrawerItem; data: DashData }) {
  if (item.kind === "rec")        return <RecDrawer rec={item.item} />;
  if (item.kind === "disruption") return <DisruptionDrawer d={item.item} impacts={data.weatherImpacts[item.item.disruption_id] ?? []} />;
  if (item.kind === "geo")        return <GeoDrawer event={item.item} impacts={data.geoImpacts[item.item.event_id] ?? []} />;
  if (item.kind === "alert")      return <AlertDrawer alert={item.item} />;
  if (item.kind === "shipment")   return <ShipmentDrawer shipment={item.item} logs={data.tempLogs[item.item.shipment_id] ?? []} matches={data.redeployAll[item.item.shipment_id] ?? []} />;
  return null;
}

function DL({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
      <dt className="text-[10px] font-bold tracking-widest uppercase text-slate-400">{label}</dt>
      <dd className={cn("text-sm text-slate-700", warn && "text-red-600 font-semibold")}>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-blue-600 mb-2">{title}</p>
      {children}
    </div>
  );
}

function TagRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(t => <span key={t} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">{t}</span>)}
    </div>
  );
}

function ImpactRow({ id, level, delay, hint }: { id: string; level: string; delay: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0 flex-wrap">
      <span className="text-xs font-semibold text-slate-700 w-20 flex-shrink-0">{id}</span>
      <Badge tone={level}>{level}</Badge>
      <span className="text-xs text-slate-400">+{delay}h</span>
      {hint && <p className="text-[11px] text-blue-600 flex-basis-full w-full mt-0.5">{hint}</p>}
    </div>
  );
}

function RecDrawer({ rec }: { rec: Recommendation }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-3 leading-snug">{rec.title}</h2>
      <div className="flex gap-2 flex-wrap mb-4">
        <Badge tone={rec.agent_type}>{rec.agent_type}</Badge>
        <Badge tone={rec.recommendation_type}>{rec.recommendation_type}</Badge>
        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">P{rec.priority}</span>
      </div>
      <p className="text-sm text-slate-500 leading-relaxed mb-4">{rec.description}</p>
      <dl className="flex flex-col gap-0 divide-y divide-slate-100">
        {rec.alternative_route    && <DL label="Alternative Route"  value={rec.alternative_route} />}
        {rec.suggested_vehicle_id && <DL label="Suggested Vehicle"  value={rec.suggested_vehicle_id} />}
        {rec.suggested_carrier    && <DL label="Suggested Carrier"  value={rec.suggested_carrier} />}
        {rec.estimated_saving_hours > 0 && <DL label="Time Saving" value={`${rec.estimated_saving_hours.toFixed(1)} hours`} />}
      </dl>
    </div>
  );
}

function DisruptionDrawer({ d, impacts }: { d: Disruption; impacts: WeatherImpact[] }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-2 leading-snug">{d.title}</h2>
      <div className="flex gap-2 mb-4"><Badge tone={d.severity}>{d.severity}</Badge><Badge tone="neutral">{d.status}</Badge></div>
      <p className="text-sm text-slate-500 leading-relaxed mb-4">{d.description}</p>
      <dl className="flex flex-col gap-0">
        <DL label="Location" value={d.location} />
        <DL label="Expected Duration" value={`${d.expected_duration_hours} hours`} />
        <DL label="Observed" value={fmtDate(d.observed_at)} />
      </dl>
      <Section title="Affected Routes"><TagRow items={d.affected_routes} /></Section>
      {impacts.length > 0 && (
        <Section title={`Shipment Impacts (${impacts.length})`}>
          {impacts.sort((a,b) => sevRank(b.impact_level) - sevRank(a.impact_level)).map(i => (
            <ImpactRow key={i.shipment_id} id={i.shipment_id} level={i.impact_level} delay={String(i.estimated_delay_hours)} hint={i.recommendation?.title} />
          ))}
        </Section>
      )}
    </div>
  );
}

function GeoDrawer({ event, impacts }: { event: GeopoliticalEvent; impacts: GeopoliticalImpact[] }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-2 leading-snug">{event.title}</h2>
      <div className="flex gap-2 mb-4"><Badge tone={event.severity}>{event.severity}</Badge><Badge tone="neutral">{titleCase(event.type)}</Badge></div>
      <p className="text-sm text-slate-500 leading-relaxed mb-4">{event.description}</p>
      <dl className="flex flex-col gap-0">
        <DL label="Affected Commodities" value={event.affected_commodities.join(", ")} />
        <DL label="Expected Resolution" value={fmtDate(event.expected_resolution)} />
      </dl>
      <Section title="Alternative Routes"><TagRow items={event.alternative_routes} /></Section>
      {impacts.length > 0 && (
        <Section title={`Shipment Impacts (${impacts.length})`}>
          {impacts.map(i => <ImpactRow key={i.shipment_id} id={i.shipment_id} level={i.impact_level} delay={String(i.estimated_delay_hours)} hint={i.recommendation?.title} />)}
        </Section>
      )}
    </div>
  );
}

function AlertDrawer({ alert }: { alert: ColdChainAlert }) {
  const isHot = alert.current_temp > alert.max_safe;
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-2">{alert.shipment_id} — {titleCase(alert.cargo_type)}</h2>
      <Badge tone={alert.severity} className="mb-4">{alert.severity}</Badge>
      <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 mb-4">
        <p className="text-xs text-red-700 leading-relaxed">{alert.action_required}</p>
      </div>
      <dl className="flex flex-col gap-0">
        <DL label="Current Temperature" value={`${alert.current_temp.toFixed(1)}°C`} warn={isHot} />
        <DL label="Safe Range" value={`${alert.min_safe}°C – ${alert.max_safe}°C`} />
        <DL label="Excursion Duration" value={`${alert.excursion_duration_min.toFixed(0)} minutes`} />
        <DL label="Excursion Since" value={fmtDate(alert.excursion_since)} />
        <DL label="Nearest Depot" value={alert.nearest_depot} />
        <DL label="Vehicle" value={alert.vehicle_id} />
      </dl>
      <Section title="Recommendation">
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-slate-800 mb-1">{alert.recommendation.title}</p>
          <p className="text-[11px] text-slate-500">{alert.recommendation.description}</p>
        </div>
      </Section>
    </div>
  );
}

function ShipmentDrawer({ shipment, logs, matches }: { shipment: Shipment; logs: TemperatureLog[]; matches: RedeploymentMatch[] }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-2">{shipment.shipment_id}</h2>
      <div className="flex gap-2 mb-4"><Badge tone={shipment.priority}>{shipment.priority}</Badge><Badge tone="neutral">{titleCase(shipment.status)}</Badge></div>
      <dl className="flex flex-col gap-0">
        <DL label="Cargo"            value={titleCase(shipment.cargo_type)} />
        <DL label="Lane"             value={`${shipment.origin} → ${shipment.destination}`} />
        <DL label="Current Location" value={shipment.current_location} />
        <DL label="Deadline"         value={fmtDate(shipment.deadline)} />
        <DL label="Value"            value={fmtINR(shipment.value)} />
        <DL label="Carrier"          value={shipment.carrier} />
        <DL label="Weight"           value={`${shipment.weight.toLocaleString()} kg`} />
      </dl>
      <Section title="Route Waypoints"><TagRow items={shipment.route} /></Section>
      {logs.length > 0 && (
        <Section title="Temperature Telemetry">
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={logs.map(l => ({ t: l.recorded_at.slice(11,16), v: l.temperature_c, max: l.temperature_max, min: l.temperature_min }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="t" tick={{ fill:"#94a3b8", fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#94a3b8", fontSize:10 }} axisLine={false} tickLine={false} domain={["auto","auto"]} />
                <ReTooltip
                  contentStyle={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:6, boxShadow:"0 4px 12px rgba(0,0,0,0.08)" }}
                  labelStyle={{ color:"#0f172a" }}
                />
                <Area type="monotone" dataKey="v" stroke="#dc2626" fill="#fee2e2" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Safe range: {logs[0]?.temperature_min}–{logs[0]?.temperature_max}°C</p>
        </Section>
      )}
      {matches.length > 0 && (
        <Section title="Redeployment Options">
          {matches.slice(0, 3).map(m => (
            <div key={m.vehicle_id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
              <span className="text-xs font-semibold text-slate-700 w-16">{m.vehicle_id}</span>
              <span className="text-[11px] text-slate-500 flex-1">{m.vehicle_location} · {m.distance_km.toFixed(0)} km</span>
              {m.refrigerated && <Badge tone="cold_chain">Refrigerated</Badge>}
              <span className="text-xs font-bold text-teal-700">{Math.round(m.fit_score * 100)}%</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
