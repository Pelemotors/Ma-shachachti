export type OptimisticFailure = {
  key: string;
  message: string;
  retry: () => Promise<boolean>;
};

export type OptimisticMutation<T> = {
  key: string;
  current: () => T;
  optimistic: (snapshot: T) => T;
  commit: () => Promise<T>;
  publish: (value: T) => void;
  errorMessage: string;
  reverse?: (canonical: T) => Promise<T>;
  undoWindowMs?: number;
};

export type UndoOpportunity = {
  key: string;
  expiresAt: number;
  undo: () => Promise<boolean>;
};

export class OptimisticMutationLayer {
  private inFlight = new Map<string, Promise<boolean>>();

  isInFlight(key: string) {
    return this.inFlight.has(key);
  }

  run<T>(
    mutation: OptimisticMutation<T>,
    onFailure: (failure: OptimisticFailure | null) => void,
    onUndo?: (undo: UndoOpportunity | null) => void,
  ): Promise<boolean> {
    const existing = this.inFlight.get(mutation.key);
    if (existing) return existing;

    const snapshot = mutation.current();
    mutation.publish(mutation.optimistic(snapshot));
    onFailure(null);

    const operation = mutation
      .commit()
      .then((canonical) => {
        mutation.publish(canonical);
        if (mutation.reverse && onUndo) {
          const expiresAt = Date.now() + (mutation.undoWindowMs ?? 6000);
          onUndo({
            key: mutation.key,
            expiresAt,
            undo: () => {
              if (Date.now() > expiresAt) {
                onUndo(null);
                return Promise.resolve(false);
              }
              onUndo(null);
              return this.run(
                {
                  key: `undo:${mutation.key}`,
                  current: mutation.current,
                  optimistic: () => snapshot,
                  commit: () => mutation.reverse!(canonical),
                  publish: mutation.publish,
                  errorMessage: "לא הצלחנו לבטל את הפעולה.",
                },
                onFailure,
              );
            },
          });
        }
        return true;
      })
      .catch(() => {
        mutation.publish(snapshot);
        onFailure({
          key: mutation.key,
          message: mutation.errorMessage,
          retry: () => this.run(mutation, onFailure, onUndo),
        });
        return false;
      })
      .finally(() => {
        this.inFlight.delete(mutation.key);
      });

    this.inFlight.set(mutation.key, operation);
    return operation;
  }
}
