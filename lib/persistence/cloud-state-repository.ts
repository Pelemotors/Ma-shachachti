import type { Action } from "../model";
import { authFetch } from "../supabase-browser";
import type { CommitOptions, StateRepository, StateSnapshot } from "./types";

export class CloudStateRepository implements StateRepository {
  async read(): Promise<StateSnapshot> {
    const res = await authFetch("/api/state", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return { state: data.state, revision: data.revision };
  }

  async commit(
    actions: Action[],
    options: CommitOptions = {},
  ): Promise<StateSnapshot> {
    const res = await authFetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions,
        confirmed: options.confirmed ?? false,
        turnId: options.turnId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return { state: data.state, revision: data.revision };
  }
}
