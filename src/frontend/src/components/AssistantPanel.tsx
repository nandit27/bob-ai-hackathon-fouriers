/**
 * AssistantPanel — Fleet360 in-dashboard chat assistant (light theme)
 *
 * Matches the app's light bg-white / bg-slate-50 / border-slate-200 palette.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight, Bot, Send, AlertTriangle,
  Truck, ThermometerSnowflake, Globe, CloudRain, Zap,
} from "lucide-react";
import { api } from "@/api/client";
import { Badge } from "@/components/Badge";
import type { ChatCard, ChatMessage } from "@/types";

// ── Suggestion chips ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What's the operational situation right now?",
  "Which shipments are affected by Mumbai flooding?",
  "Show me all cold-chain alerts",
  "Find idle vehicles for redeployment",
  "What are the top recovery recommendations?",
  "Tell me about GEO-002",
];

// ── Tiny markdown → HTML ──────────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul class='chat-list'>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br />");
}

// ── Card renderers ────────────────────────────────────────────────────────────
function MetricCards({ cards }: { cards: ChatCard[] }) {
  const metrics = cards.filter(c => c.type === "metric") as unknown as Array<{ label: string; value: number }>;
  if (!metrics.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {metrics.map((m) => (
        <div key={m.label} className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 min-w-[72px]">
          <span className="text-base font-bold text-blue-600">{m.value}</span>
          <span className="text-[10px] text-slate-500 mt-0.5">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function AlertCards({ cards }: { cards: ChatCard[] }) {
  const alerts = cards.filter(c => c.type === "alert") as unknown as Array<{
    shipment_id: string; severity: string; current_temp: number; min_safe: number; max_safe: number; depot: string;
  }>;
  if (!alerts.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {alerts.map((a) => (
        <div key={a.shipment_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs">
          <ThermometerSnowflake size={12} className="text-red-500 flex-shrink-0" />
          <span className="font-semibold text-slate-700">{a.shipment_id}</span>
          <Badge tone={a.severity}>{a.severity}</Badge>
          <span className="text-slate-500">{a.current_temp.toFixed(1)}°C (safe {a.min_safe}–{a.max_safe}°C)</span>
          <span className="text-slate-400 ml-auto truncate">{a.depot}</span>
        </div>
      ))}
    </div>
  );
}

function DisruptionCards({ cards }: { cards: ChatCard[] }) {
  const items = cards.filter(c => c.type === "disruption") as unknown as Array<{
    id: string; title: string; location: string; affected_count: number;
  }>;
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {items.map((d) => (
        <div key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs">
          <CloudRain size={12} className="text-blue-500 flex-shrink-0" />
          <span className="font-semibold text-slate-700 truncate flex-1">{d.title}</span>
          <span className="text-slate-500">{d.affected_count} shipments</span>
        </div>
      ))}
    </div>
  );
}

function GeoCards({ cards }: { cards: ChatCard[] }) {
  const items = cards.filter(c => c.type === "geo") as unknown as Array<{
    id: string; title: string; severity: string; affected_count: number;
  }>;
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {items.map((g) => (
        <div key={g.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 text-xs">
          <Globe size={12} className="text-purple-500 flex-shrink-0" />
          <span className="font-semibold text-slate-700 truncate flex-1">{g.title}</span>
          <Badge tone={g.severity}>{g.severity}</Badge>
          <span className="text-slate-500">{g.affected_count} shipments</span>
        </div>
      ))}
    </div>
  );
}

function VehicleCards({ cards }: { cards: ChatCard[] }) {
  const items = cards.filter(c => c.type === "vehicle") as unknown as Array<{
    vehicle_id: string; vehicle_type: string; location: string; fuel: number; refrigerated: boolean;
  }>;
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {items.map((v) => (
        <div key={v.vehicle_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-xs">
          <Truck size={12} className="text-teal-600 flex-shrink-0" />
          <span className="font-semibold text-slate-700">{v.vehicle_id}</span>
          <span className="text-slate-500">{v.vehicle_type} · {v.location}</span>
          <span className="text-slate-400 ml-auto">{v.fuel}% fuel{v.refrigerated ? " ❄" : ""}</span>
        </div>
      ))}
    </div>
  );
}

function RecommendationCards({ cards }: { cards: ChatCard[] }) {
  const items = cards.filter(c => c.type === "recommendation") as unknown as Array<{
    id: string; title: string; priority: number; agent: string; rec_type: string; saving_hours: number;
  }>;
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {items.map((r) => (
        <div key={r.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <Zap size={12} className="text-violet-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-slate-700">{r.title}</span>
            <div className="flex gap-1 mt-0.5 flex-wrap">
              <Badge tone={r.agent}>{r.agent}</Badge>
              <Badge tone={r.rec_type}>{r.rec_type.replace(/_/g, " ")}</Badge>
            </div>
          </div>
          {r.saving_hours > 0 && (
            <span className="text-emerald-600 font-semibold flex-shrink-0">~{r.saving_hours.toFixed(1)}h</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ShipmentCards({ cards }: { cards: ChatCard[] }) {
  const items = cards.filter(c => c.type === "shipment") as unknown as Array<{
    shipment_id: string; cargo_type: string; priority: string; origin: string; destination: string; status: string;
  }>;
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {items.map((s) => (
        <div key={s.shipment_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-xs">
          <AlertTriangle size={12} className="text-orange-500 flex-shrink-0" />
          <span className="font-semibold text-slate-700">{s.shipment_id}</span>
          <span className="text-slate-500">{s.origin} → {s.destination}</span>
          <Badge tone={s.priority} className="ml-auto">{s.priority}</Badge>
        </div>
      ))}
    </div>
  );
}

// ── Agent label ───────────────────────────────────────────────────────────────
const AGENT_LABELS: Record<string, string> = {
  situation:       "Overview",
  weather:         "Weather Agent",
  geopolitical:    "Geo Agent",
  cold_chain:      "Cold Chain Agent",
  redeployment:    "Redeployment",
  recommendations: "All Agents",
  data:            "Fleet Data",
};

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2.5">
      <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
        <Bot size={13} className="text-blue-500" />
      </div>
      <div className="flex gap-1 items-center px-3 py-2 rounded-xl rounded-tl-sm bg-slate-100 border border-slate-200">
        {[0, 0.15, 0.3].map((delay) => (
          <motion.span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-slate-400"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end px-4 py-1.5"
      >
        <div className="max-w-[78%] px-3.5 py-2 rounded-xl rounded-tr-sm bg-blue-600 text-white text-sm leading-relaxed shadow-sm">
          {msg.content}
        </div>
      </motion.div>
    );
  }

  const agentLabel = msg.agent ? AGENT_LABELS[msg.agent] ?? msg.agent : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 px-4 py-1.5"
    >
      <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot size={13} className="text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        {agentLabel && (
          <p className="text-[10px] font-bold text-blue-600 tracking-wide uppercase mb-1">{agentLabel}</p>
        )}
        <div
          className="text-sm text-slate-700 leading-relaxed [&_strong]:text-slate-900 [&_strong]:font-semibold [&_.chat-list]:list-none [&_.chat-list]:space-y-0.5 [&_.chat-list_li]:text-slate-600 [&_.chat-list_li]:before:content-['·'] [&_.chat-list_li]:before:mr-1.5 [&_.chat-list_li]:before:text-slate-400"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(msg.content)}</p>` }}
        />
        {msg.cards.length > 0 && (
          <div className="mt-1">
            <MetricCards cards={msg.cards} />
            <AlertCards cards={msg.cards} />
            <DisruptionCards cards={msg.cards} />
            <GeoCards cards={msg.cards} />
            <VehicleCards cards={msg.cards} />
            <RecommendationCards cards={msg.cards} />
            <ShipmentCards cards={msg.cards} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function AssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function submit(query: string) {
    if (!query.trim() || loading) return;
    setError(null);
    const userMsg: ChatMessage = { role: "user", content: query, cards: [], agent: null };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const reply = await api.chat(query);
      setMessages(prev => [...prev, reply]);
    } catch {
      setError("Could not reach Fleet360 backend. Make sure the FastAPI server is running.");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[520px]">

      {/* ── Thread area ── */}
      <div className="flex-1 overflow-y-auto py-3 flex flex-col">
        {isEmpty ? (
          <div className="flex flex-col items-start gap-4 px-4 py-3">
            {/* Header row */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                <Bot size={18} className="text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Fleet360 Assistant</p>
                <p className="text-xs text-slate-500">Powered by 3 AI agents · Ask anything about your operations</p>
              </div>
            </div>
            {/* Intro card */}
            <div className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-sm text-slate-600 leading-relaxed">
                I can answer questions about your shipments, disruptions, cold-chain alerts, idle vehicles, and recovery recommendations — all backed by live agent data.
              </p>
            </div>
            {/* Suggestion chips */}
            <p className="text-[11px] font-bold tracking-widest uppercase text-slate-400">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg px-3 py-2 transition-colors cursor-pointer shadow-sm"
                >
                  {s} <ArrowUpRight size={10} className="opacity-40 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {loading && <TypingIndicator key="typing" />}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="border-t border-slate-200 px-4 py-3 flex items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about shipments, disruptions, cold-chain, vehicles…"
          disabled={loading}
          className="flex-1 bg-white border border-slate-200 text-sm text-slate-800 placeholder-slate-400 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all disabled:opacity-50 shadow-sm"
        />
        <button
          onClick={() => submit(input)}
          disabled={!input.trim() || loading}
          className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer shadow-sm"
        >
          <Send size={13} />
        </button>
      </div>

      {/* ── Non-empty suggestion strip ── */}
      {!isEmpty && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.slice(0, 3).map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="text-[11px] text-slate-500 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-300 rounded px-2 py-1 transition-colors cursor-pointer"
            >
              {s.length > 38 ? s.slice(0, 38) + "…" : s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
