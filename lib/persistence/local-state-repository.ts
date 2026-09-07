import { Action, AppState, emptyState, migrateState } from "../model";
import { applyActions } from "../engine";
import type { CommitOptions, StateRepository, StateSnapshot } from "./types";

const LOCAL_KEY = "ma-shachachti:local:v1";

export class LocalStateRepository implements StateRepository {
  private revision = 0;

  async read(): Promise<StateSnapshot> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const state = raw ? migrateState(JSON.parse(raw)) : emptyState();
      return { state, revision: this.revision };
    } catch {
      return { state: emptyState(), revision: 0 };
    }
  }

  async commit(
    actions: Action[],
    options: CommitOptions = {},
  ): Promise<StateSnapshot> {
    const current = await this.read();
    const next = applyActions(
      current.state,
      actions,
      new Date(),
      options.confirmed ?? false,
    );
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    this.revision += 1;
    return { state: next, revision: this.revision };
  }

  static save(state: AppState) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  }
}
