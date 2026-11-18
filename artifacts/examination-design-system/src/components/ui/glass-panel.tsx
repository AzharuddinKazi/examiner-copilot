import type { HTMLAttributes } from "react";

/** Source .glass; the surface uses the same recipe in either theme. */
export function GlassPanel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`exam-glass ${className}`} {...props} />;
}
