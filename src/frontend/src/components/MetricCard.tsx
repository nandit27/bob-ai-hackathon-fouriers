import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span>{label}</span><Icon size={16} strokeWidth={1.5} color="#000" /></div>
      <strong>{value}</strong>
    </div>
  );
}
