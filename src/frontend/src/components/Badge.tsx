import { cn, SEV_COLORS, AGENT_COLORS, REC_COLORS } from "@/lib/utils";

type BadgeVariant = "severity" | "agent" | "rec" | "neutral" | "status";

interface BadgeProps {
  children: string;
  variant?: BadgeVariant;
  tone?: string;
  className?: string;
}

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  const key = (tone ?? "").toUpperCase();
  const label = children.replace(/_/g, " ").toUpperCase();

  const colorClass =
    SEV_COLORS[key]
      ? `${SEV_COLORS[key].text} ${SEV_COLORS[key].bg} ${SEV_COLORS[key].border}`
      : AGENT_COLORS[tone.toLowerCase()]
      ?? REC_COLORS[tone.toLowerCase()]
      ?? "text-slate-400 bg-slate-900 border-slate-800";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-widest border whitespace-nowrap",
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
