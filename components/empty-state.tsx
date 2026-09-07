"use client";
import { Leaf } from "lucide-react";

export function EmptyState({
  text,
  action,
  label,
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <Leaf size={28} />
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          {label}
        </button>
      )}
    </div>
  );
}

export const Empty = EmptyState;
