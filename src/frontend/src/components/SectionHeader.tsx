import type { ReactNode } from "react";

export function SectionHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return <div className="section-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>;
}
