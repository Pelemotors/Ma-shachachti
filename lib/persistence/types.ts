import type { Action, AppState } from "../model";

export type StateSnapshot = {
  state: AppState;
  revision: number;
};

export type CommitOptions = {
  confirmed?: boolean;
  skipNotice?: boolean;
  turnId?: string;
  sealTurn?: boolean;
};

export interface StateRepository {
  read(): Promise<StateSnapshot>;
  commit(actions: Action[], options?: CommitOptions): Promise<StateSnapshot>;
}
