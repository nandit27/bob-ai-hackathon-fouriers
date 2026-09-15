import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SEV_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  CRITICAL: { text: "text-red-700",    bg: "bg-red-50",    border: "border-red-200" },
  HIGH:     { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  MEDIUM:   { text: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  LOW:      { text: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
};

export const AGENT_COLORS: Record<string, string> = {
  weather:      "text-blue-700 bg-blue-50 border-blue-200",
  geopolitical: "text-violet-700 bg-violet-50 border-violet-200",
  cold_chain:   "text-teal-700 bg-teal-50 border-teal-200",
};

export const REC_COLORS: Record<string, string> = {
  reroute:          "text-blue-700 bg-blue-50 border-blue-200",
  redeploy_vehicle: "text-teal-700 bg-teal-50 border-teal-200",
  change_carrier:   "text-violet-700 bg-violet-50 border-violet-200",
  hold_shipment:    "text-orange-700 bg-orange-50 border-orange-200",
  inspect_cargo:    "text-red-700 bg-red-50 border-red-200",
  expedite:         "text-green-700 bg-green-50 border-green-200",
};
