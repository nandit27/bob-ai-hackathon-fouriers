import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, tone, icon: Icon }: { label: string; value: number | string; tone: "blue" | "orange" | "red" | "teal" | "slate"; icon: LucideIcon }) {
  return <div className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><Icon size={16} strokeWidth={2.2} /></div><strong>{value}</strong></div>;
}
