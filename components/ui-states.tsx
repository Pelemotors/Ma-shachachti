import type { ReactNode } from "react";

export function LoadingState({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`ui-state loading-state${compact ? " compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="loading-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-state empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-box state-error" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button className="retry-button" type="button" onClick={onRetry}>
          נסה שוב
        </button>
      ) : null}
    </div>
  );
}
