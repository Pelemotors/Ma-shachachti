"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, Action, emptyState, StateSchema } from "./model";
import { applyActions } from "./engine";
import { supabase, authFetch } from "./supabase-browser";

const LOCAL_KEY = "ma-shachachti:local:v1";
type UndoEntry = {
  state: AppState;
  revision: number;
  mode: string;
  afterFingerprint: string;
};
type PendingCommit = { signature: string; key: string };
const fingerprint = (state: AppState) => JSON.stringify(state);

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
    pendingCommit = useRef<PendingCommit | null>(null);

  const adopt = useCallback((state: AppState, revision: number, mode: string) => {
    ref.current = { state, revision, mode };
    setState(state);
  }, []);

  const cloudLoad = useCallback(async () => {
    const requestGeneration = generation.current;
    const res = await authFetch("/api/state", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (requestGeneration !== generation.current) return;
    adopt(StateSchema.parse(data.state), data.revision, "cloud");
    pendingCommit.current = null;
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
      const raw = localStorage.getItem(LOCAL_KEY);
      adopt(raw ? StateSchema.parse(JSON.parse(raw)) : emptyState(), 0, "local");
      pendingCommit.current = null;
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
    async (actions: Action[], confirmed = false, remember = true) => {
      if (locked.current)
        throw new Error("רגע, השמירה הקודמת עדיין מתבצעת.");
      locked.current = true;
      setBusy(true);
      setError("");
      const before = ref.current,
        requestGeneration = generation.current;
      try {
        let next: AppState,
          revision = before.revision;
        if (before.mode === "local") {
          const stored = localStorage.getItem(LOCAL_KEY);
          if (stored && stored !== fingerprint(before.state))
            throw new Error(
              "המידע השתנה בחלון אחר. צריך לטעון מחדש לפני שינוי נוסף.",
            );
          next = applyActions(before.state, actions, new Date(), confirmed);
          localStorage.setItem(LOCAL_KEY, fingerprint(next));
          revision = before.revision + 1;
        } else if (before.mode === "cloud") {
          const signature = JSON.stringify({
            actions,
            revision: before.revision,
            confirmed,
          });
          const existing = pendingCommit.current;
          const key =
            existing?.signature === signature ? existing.key : crypto.randomUUID();
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
          next = StateSchema.parse(data.state);
          revision = data.revision;
          pendingCommit.current = null;
        } else throw new Error("צריך לבחור איך להתחיל.");

        if (
          requestGeneration !== generation.current ||
          ref.current.mode !== before.mode
        )
          throw new Error("החשבון השתנה בזמן השמירה. השינוי לא הוצג.");
        adopt(next, revision, before.mode);
        if (remember)
          setUndo({
            state: before.state,
            revision,
            mode: before.mode,
            afterFingerprint: fingerprint(next),
          });
        else setUndo(null);
        if (remember)
          setNotice(
            before.mode === "local" ? "נשמר במכשיר הזה" : "השינוי נשמר",
          );
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
        const stored = localStorage.getItem(LOCAL_KEY);
        if (stored !== undo.afterFingerprint) {
          setUndo(null);
          throw new Error("אי אפשר לבטל כי המידע השתנה בחלון אחר.");
        }
        localStorage.setItem(LOCAL_KEY, fingerprint(undo.state));
        revision++;
      } else {
        const res = await authFetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: undo.state, revision: current.revision }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        revision = data.revision;
      }
      pendingCommit.current = null;
      adopt(undo.state, revision, current.mode);
      setUndo(null);
      setNotice("הפעולה האחרונה בוטלה");
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
    currentRevision: () => ref.current.revision,
    commit,
    restore,
    startLocal,
    cloudLoad,
    signOut,
    setError,
    setNotice,
  };
}
