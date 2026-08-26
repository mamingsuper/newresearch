import type { ReactNode } from "react";

interface EmptyStateProps {
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
  tone?: "neutral" | "danger";
}

export function EmptyState({
  action,
  description,
  icon,
  title,
  tone = "neutral",
}: EmptyStateProps) {
  return (
    <section
      className={`empty-state${tone === "danger" ? " empty-state--danger" : ""}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </section>
  );
}
