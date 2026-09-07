"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, Action, emptyState, StateSchema } from "./model";
import { applyActions } from "./engine";
import { supabase, authHeaders } from "./supabase-browser";
const LOCAL_KEY = "ma-shachachti:local:v1";
export function useHousehold() {
  const [state, setState] = useState<AppState>(emptyState),
    [mode, setMode] = useState<"loading" | "choose" | "local" | "cloud">(
      "loading",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [undo, setUndo] = useState<AppState | null>(null);
  const ref = useRef({ state: emptyState(), revision: 0, mode: "choose" }),
    locked = useRef(false);
  const adopt = useCallback(
    (state: AppState, revision: number, mode: string) => {
      ref.current = { state, revision, mode };
      setState(state);
    },
    [],
  );
  const cloudLoad = useCallback(async () => {
    const res = await fetch("/api/state", {
      headers: await authHeaders(),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    adopt(StateSchema.parse(data.state), data.revision, "cloud");
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
      adopt(
        raw ? StateSchema.parse(JSON.parse(raw)) : emptyState(),
        0,
        "local",
      );
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
      if (locked.current) throw new Error("רגע, השמירה הקודמת עדיין מתבצעת.");
      locked.current = true;
      setBusy(true);
      setError("");
      const before = ref.current;
      try {
        let next: AppState,
          revision = before.revision;
        if (before.mode === "local") {
          const stored = localStorage.getItem(LOCAL_KEY);
          if (stored && stored !== JSON.stringify(before.state))
            throw new Error(
              "המידע השתנה בחלון אחר. צריך לצאת מההדגמה ולהיכנס שוב.",
            );
          next = applyActions(before.state, actions, new Date(), confirmed);
          localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        } else if (before.mode === "cloud") {
          const res = await fetch("/api/actions", {
            method: "POST",
            headers: {
              ...(await authHeaders()),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actions,
              revision: before.revision,
              confirmed,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          next = StateSchema.parse(data.state);
          revision = data.revision;
        } else throw new Error("צריך לבחור איך להתחיל.");
        adopt(next, revision, before.mode);
        if (remember) setUndo(before.state);
        else
          setUndo((previous) =>
            previous ? { ...previous, messages: next.messages } : null,
          );
        if (remember)
          setNotice(before.mode === "local" ? "נשמר במכשיר הזה" : "השינוי נשמר");
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
      let revision = ref.current.revision;
      if (ref.current.mode === "local")
        localStorage.setItem(LOCAL_KEY, JSON.stringify(undo));
      else {
        const res = await fetch("/api/state", {
          method: "PUT",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ state: undo, revision }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        revision = data.revision;
      }
      adopt(undo, revision, ref.current.mode);
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
    if (supabase && mode === "cloud") {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError("היציאה לא הושלמה.");
        return;
      }
    }
    adopt(emptyState(), 0, "choose");
    setUndo(null);
    setMode("choose");
  };
  return {
    state,
    mode,
    busy,
    error,
    notice,
    undo,
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
