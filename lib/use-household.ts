"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  AppState,
  Action,
  emptyState,
  migrateState,
} from "./model";
import { applyActions } from "./engine";
import { syncDailyPlanAfterActions } from "./domain/planning/sync-daily-plan";
import { supabase, authFetch } from "./supabase-browser";
import {
  fingerprintState,
  loadAndReconcileLocalState,
  localStoredConflictsWith,
  persistLocalState,
  LOCAL_STATE_KEY,
} from "./persistence/local-cas";

type UndoEntry = {
  state: AppState;
  revision: number;
  mode: string;
  afterFingerprint: string;
  turnId?: string | null;
};
type PendingCommit = { signature: string; key: string };
type TurnAnchor = {
  turnId: string;
  state: AppState;
  revision: number;
  mode: string;
};
type CommitOptions = {
  turnId?: string;
  /** Seal the turn and expose one undo for the whole operation */
  sealTurn?: boolean;
};
const fingerprint = fingerprintState;

export function useHousehold() {
  const [state, setState] = useState<AppState>(emptyState),
    [mode, setMode] = useState<"loading" | "choose" | "local" | "cloud">(
      "loading",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [undo, setUndo] = useState<UndoEntry | null>(null);

  const ref = useRef({ state: emptyState(), revision: 0, mode: "choose" }),
    locked = useRef(false),
    generation = useRef(0),
    pendingCommit = useRef<PendingCommit | null>(null),
    turnAnchor = useRef<TurnAnchor | null>(null);

  const adopt = useCallback(
    (state: AppState, revision: number, mode: string) => {
      ref.current = { state, revision, mode };
      setState(state);
    },
    [],
  );

  const cloudLoad = useCallback(async () => {
    const requestGeneration = generation.current;
    const res = await authFetch("/api/state", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (requestGeneration !== generation.current) return;
    adopt(migrateState(data.state), data.revision, "cloud");
    pendingCommit.current = null;
    turnAnchor.current = null;
    setUndo(null);
    setMode("cloud");
  }, [adopt]);

  useEffect(() => {
    let alive = true;
    async function init() {
      try {
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            if (alive) await cloudLoad();
            return;
          }
        }
        if (alive) setMode("choose");
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "לא הצלחנו לטעון");
          setMode("choose");
        }
      }
    }
    void init();
    const listener = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && alive) {
        generation.current++;
        pendingCommit.current = null;
        turnAnchor.current = null;
        adopt(emptyState(), 0, "choose");
        setMode("choose");
        setUndo(null);
      }
    });
    return () => {
      alive = false;
      listener?.data.subscription.unsubscribe();
    };
  }, [adopt, cloudLoad]);

  const startLocal = useCallback(() => {
    try {
      const state = loadAndReconcileLocalState();
      adopt(state, 0, "local");
      pendingCommit.current = null;
      turnAnchor.current = null;
      setUndo(null);
      setMode("local");
      setError("");
    } catch {
      setError(
        "לא ניתן לקרוא את ההדגמה השמורה. אפשר להוריד גיבוי דרך כלי הדפדפן לפני מחיקה; המידע לא הוחלף.",
      );
    }
  }, [adopt]);

  const commit = useCallback(
    async (
      actions: Action[],
      confirmed = false,
      remember = true,
      opts: CommitOptions = {},
    ) => {
      if (locked.current) throw new Error("רגע, השמירה הקודמת עדיין מתבצעת.");
      locked.current = true;
      setBusy(true);
      setError("");
      const before = ref.current,
        requestGeneration = generation.current;
      try {
        if (opts.turnId) {
          if (
            !turnAnchor.current ||
            turnAnchor.current.turnId !== opts.turnId
          ) {
            turnAnchor.current = {
              turnId: opts.turnId,
              state: before.state,
              revision: before.revision,
              mode: before.mode,
            };
          }
        }

        let next: AppState,
          revision = before.revision;
        if (before.mode === "local") {
          const stored = localStorage.getItem(LOCAL_STATE_KEY);
          if (localStoredConflictsWith(stored, before.state))
            throw new Error(
              "המידע השתנה בחלון אחר. צריך לטעון מחדש לפני שינוי נוסף.",
            );
          next = applyActions(before.state, actions, new Date(), confirmed);
          const synced = syncDailyPlanAfterActions({
            state: next,
            actions,
            now: new Date(),
            revision: before.revision,
          });
          next = synced.state;
          if (synced.planSyncFailed && synced.notice) setNotice(synced.notice);
          persistLocalState(next);
          revision = before.revision + 1;
        } else if (before.mode === "cloud") {
          const signature = JSON.stringify({
            actions,
            revision: before.revision,
            confirmed,
            turnId: opts.turnId ?? null,
          });
          const existing = pendingCommit.current;
          const key =
            existing?.signature === signature
              ? existing.key
              : crypto.randomUUID();
          pendingCommit.current = { signature, key };
          const res = await authFetch("/api/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              actions,
              revision: before.revision,
              confirmed,
              idempotencyKey: key,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          next = migrateState(data.state);
          revision = data.revision;
          if (typeof data.notice === "string" && data.notice)
            setNotice(data.notice);
          pendingCommit.current = null;
        } else throw new Error("צריך לבחור איך להתחיל.");

        if (
          requestGeneration !== generation.current ||
          ref.current.mode !== before.mode
        )
          throw new Error("החשבון השתנה בזמן השמירה. השינוי לא הוצג.");
        adopt(next, revision, before.mode);

        const createCount = actions.filter((a) => a.type === "task.create")
          .length;
        const addedTasks = next.tasks.length - before.state.tasks.length;
        const duplicateCreate =
          createCount > 0 && addedTasks < createCount;

        if (remember) {
          if (opts.turnId && !opts.sealTurn) {
            // Mid-turn: keep undo unset until seal
          } else if (opts.sealTurn && turnAnchor.current) {
            const anchor = turnAnchor.current;
            setUndo({
              state: anchor.state,
              revision,
              mode: anchor.mode,
              afterFingerprint: fingerprint(next),
              turnId: anchor.turnId,
            });
            turnAnchor.current = null;
            setNotice(
              duplicateCreate
                ? "נראה שכבר יש משימה דומה ברשימה."
                : before.mode === "local"
                  ? "נשמר במכשיר הזה"
                  : "השינוי נשמר",
            );
          } else {
            setUndo({
              state: before.state,
              revision,
              mode: before.mode,
              afterFingerprint: fingerprint(next),
              turnId: opts.turnId ?? null,
            });
            setNotice(
              duplicateCreate
                ? "נראה שכבר יש משימה דומה ברשימה."
                : before.mode === "local"
                  ? "נשמר במכשיר הזה"
                  : "השינוי נשמר",
            );
          }
        } else if (!opts.turnId) {
          setUndo(null);
        }
        return next;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "השמירה לא הצליחה";
        setError(msg);
        throw e;
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [adopt],
  );

  const replaceState = useCallback(
    async (candidate: unknown) => {
      if (locked.current) throw new Error("שמירה אחרת עדיין מתבצעת.");
      const parsed = migrateState(candidate);
      locked.current = true;
      setBusy(true);
      setError("");
      const before = ref.current;
      const requestGeneration = generation.current;
      try {
        let revision = before.revision;
        if (before.mode === "local") {
          const stored = localStorage.getItem(LOCAL_STATE_KEY);
          if (localStoredConflictsWith(stored, before.state))
            throw new Error("המידע השתנה בחלון אחר. טענו מחדש לפני שחזור.");
          persistLocalState(parsed);
          revision++;
        } else if (before.mode === "cloud") {
          const res = await authFetch("/api/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: parsed, revision: before.revision }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          revision = Number(data.revision);
        } else throw new Error("צריך להתחבר או לפתוח הדגמה לפני שחזור.");
        if (
          requestGeneration !== generation.current ||
          ref.current.mode !== before.mode
        )
          throw new Error("החשבון השתנה בזמן השחזור. הנתונים לא הוצגו.");
        pendingCommit.current = null;
        turnAnchor.current = null;
        setUndo(null);
        adopt(parsed, revision, before.mode);
        setNotice("הגיבוי שוחזר לאחר אימות");
        return parsed;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "השחזור לא הצליח";
        setError(msg);
        throw e;
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [adopt],
  );

  const restore = useCallback(async () => {
    if (!undo || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const current = ref.current;
      if (
        current.mode !== undo.mode ||
        fingerprint(current.state) !== undo.afterFingerprint ||
        current.revision !== undo.revision
      ) {
        setUndo(null);
        throw new Error("אי אפשר לבטל כי המידע השתנה מאז הפעולה.");
      }
      let revision = current.revision;
      if (current.mode === "local") {
        const stored = localStorage.getItem(LOCAL_STATE_KEY);
        let storedFingerprint = stored;
        try {
          storedFingerprint = stored
            ? fingerprint(migrateState(JSON.parse(stored)))
            : null;
        } catch {
          storedFingerprint = null;
        }
        if (storedFingerprint !== undo.afterFingerprint) {
          setUndo(null);
          throw new Error("אי אפשר לבטל כי המידע השתנה בחלון אחר.");
        }
        persistLocalState(undo.state);
        revision++;
      } else {
        const res = await authFetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: undo.state,
            revision: current.revision,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        revision = data.revision;
      }
      pendingCommit.current = null;
      turnAnchor.current = null;
      adopt(undo.state, revision, current.mode);
      setUndo(null);
      setNotice(
        undo.turnId ? "פעולת השיחה האחרונה בוטלה" : "הפעולה האחרונה בוטלה",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "הביטול לא הצליח");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, [undo, adopt]);

  const signOut = async () => {
    generation.current++;
    pendingCommit.current = null;
    turnAnchor.current = null;
    setUndo(null);
    if (supabase && mode === "cloud") {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError("היציאה לא הושלמה.");
        return;
      }
    }
    adopt(emptyState(), 0, "choose");
    setMode("choose");
  };

  return {
    state,
    mode,
    busy,
    error,
    notice,
    undo: undo?.state ?? null,
    undoTurnId: undo?.turnId ?? null,
    currentRevision: () => ref.current.revision,
    commit,
    replaceState,
    restore,
    startLocal,
    cloudLoad,
    adoptRemote: (next: AppState, revision: number) => {
      adopt(migrateState(next), revision, "cloud");
    },
    signOut,
    setError,
    setNotice,
  };
}
