import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number | string;
  icon?: ReactNode;
  valueClass?: string;
  trend?: "up" | "down" | "neutral";
  sub?: string;
  delay?: number;
}

export function MetricCard({ label, value, icon, valueClass = "text-blue-600", sub, delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-slate-200 bg-white",
        "p-4 flex flex-col gap-2 group hover:border-slate-300 hover:shadow-md transition-all duration-200"
      )}
    >
      {/* Subtle gradient top-right */}
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-blue-500/5 blur-2xl pointer-events-none" />

      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-slate-400">{label}</span>
        {icon && (
          <span className="text-slate-300 group-hover:text-slate-500 transition-colors">
            {icon}
          </span>
        )}
      </div>

      <div className={cn("text-3xl font-bold tabular-nums leading-none", valueClass)}>
        {value}
      </div>

      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </motion.div>
  );
}
