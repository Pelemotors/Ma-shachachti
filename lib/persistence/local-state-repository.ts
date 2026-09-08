import { Action, AppState, emptyState, migrateState } from "../model";
import { applyActions } from "../engine";
import type { CommitOptions, StateRepository, StateSnapshot } from "./types";
import {
  LOCAL_STATE_KEY,
  loadAndReconcileLocalState,
  persistLocalState,
} from "./local-cas";

export class LocalStateRepository implements StateRepository {
  private revision = 0;

  async read(): Promise<StateSnapshot> {
    try {
      const state = loadAndReconcileLocalState();
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
    persistLocalState(next);
    this.revision += 1;
    return { state: next, revision: this.revision };
  }

  static save(state: AppState) {
    persistLocalState(state);
  }
}

/** @deprecated Prefer LOCAL_STATE_KEY from local-cas */
export const LOCAL_KEY = LOCAL_STATE_KEY;
